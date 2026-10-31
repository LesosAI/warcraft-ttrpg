import { releaseSustainTransferEntry } from "../rules/sustain-entry-transfer.mjs";
import { releaseSustainTransferEffect, suspendSustainTransferEffect } from "../rules/sustain-transfer-suspension.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";
import { dispersionFor } from "../rules/dispersion.mjs";
import { hasTransferCarrierPlan } from "../rules/sustain-record-carrier.mjs";

const scope = "azeroth-rpg";
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).filter(key => key !== "_stats").sort().map(key => [key, stable(value[key])])) : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const exact = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Internal serialized finalizer. Production admission and GM recovery belong to
 * the coordinator. A pending activation is never resumed automatically, including
 * after a successful actor update whose acknowledgement/receipt was lost. */
export function createSustainTransferActivation({ readReceipt, writeReceipt, validate }) {
  if ([readReceipt, writeReceipt, validate].some(fn => typeof fn !== "function")) throw Error("Missing activation adapter");
  let queue = Promise.resolve();
  const uncertain = new Set();
  return function activate(key) {
    const run = async () => {
      let claimed = false;
      try {
        if (typeof key !== "string" || !key || !game.user?.isGM || game.users?.activeGM?.id !== game.user.id) {
          return { ok: false, reason: "authority" };
        }
        if (uncertain.has(key)) return { ok: false, reason: "review" };
        let receipt = structuredClone(await readReceipt(key));
        const plan = receipt?.plan;
        if (receipt?.version !== 1 || receipt.key !== key || receipt.state !== "done" || receipt.attempted !== null
          || !same(receipt.completed, ["holdRecipient", "relocateCarriers", "releaseSource"])
          || !["casterUuid", "recipientUuid", "cast", "transactionId"].every(field => typeof plan?.[field] === "string"
            && plan[field].length && receipt[field] === plan[field]) || plan.casterUuid === plan.recipientUuid
          || !hasTransferCarrierPlan(plan)) {
          return { ok: false, reason: "incomplete" };
        }
        if (await validate(structuredClone(plan), structuredClone(receipt)) !== true) return { ok: false, reason: "changed" };
        if (receipt.activation != null) return { ok: false, reason: receipt.activation.state === "done" ? "used" : "review" };
        const actors = [plan.casterUuid, plan.recipientUuid].map(uuid => fromUuidSync(uuid));
        if (actors.some((actor, index) => actor?.documentName !== "Actor" || actor.uuid !== [plan.casterUuid, plan.recipientUuid][index])) {
          return { ok: false, reason: "participant" };
        }
        const lists = actors.map(actor => structuredClone(actor.getFlag(scope, "sustaining") ?? []));
        if (!lists.every(Array.isArray) || lists[0].some(entry => entry.cast === plan.cast)) throw Error("Source not released");
        const held = lists[1].filter(entry => entry.cast === plan.cast);
        if (held.length !== 1) throw Error("Missing recipient hold");
        const released = releaseSustainTransferEntry({ entry: held[0], ownerUuid: plan.recipientUuid, receipt });
        if (!released.ok || !same(released.entry, plan.recipientEntry)) throw Error("Recipient hold changed");
        const expected = new Map(), patches = [];
        for (const move of plan.relocation.moves) {
          const destination = move.destination, data = destination?.data;
          const suspended = suspendSustainTransferEffect({ effect: data, receipt: { ...receipt, state: "claimed" } });
          if (!move.ok || !suspended.ok || expected.has(destination.uuid) || destination.parentUuid !== plan.recipientUuid
            || data.origin !== plan.recipientUuid || destination.uuid !== `${plan.recipientUuid}.ActiveEffect.${data._id}`) throw Error("Invalid destination");
          const source = { ...structuredClone(data), disabled: true, flags: { ...structuredClone(data.flags),
            [scope]: { ...structuredClone(data.flags[scope]), sustainTransfer: suspended.patch[`flags.${scope}.sustainTransfer`] } } };
          const release = releaseSustainTransferEffect({ effect: { ...source, parentUuid: plan.recipientUuid }, receipt, entry: held[0] });
          if (!release.ok) throw Error("Cannot release effect");
          expected.set(destination.uuid, source);
          patches.push({ _id: data._id, ...release.patch });
        }
        const check = async () => {
          if (await validate(structuredClone(plan), structuredClone(receipt)) !== true || !exact(await readReceipt(key), receipt)
            || !game.user?.isGM || game.users?.activeGM?.id !== game.user.id) throw Error("Activation authority changed");
          for (const [index, actor] of actors.entries()) {
            if (fromUuidSync(actor.uuid) !== actor || iceBlockFor(actor) || dispersionFor(actor)
              || !same(actor.getFlag(scope, "sustaining") ?? [], lists[index])) throw Error("Activation participant changed");
          }
          for (const [uuid, data] of expected) {
            const effect = fromUuidSync(uuid);
            if (effect?.documentName !== "ActiveEffect" || effect.parent?.uuid !== plan.recipientUuid
              || !same(effect.toObject(), data)) throw Error("Activation carrier changed");
          }
          if (plan.relocation.removals.some(row => fromUuidSync(row.uuid))) throw Error("Original carrier remains");
        };
        const save = async next => {
          await writeReceipt(key, structuredClone(next));
          if (!exact(await readReceipt(key), next)) throw Error("Unconfirmed activation receipt");
          receipt = next;
        };
        await check();
        claimed = true;
        await save({ ...receipt, activation: { state: "pending", effectIds: patches.map(patch => patch._id) } });
        await check();
        const activeEntries = lists[1].map(entry => entry.cast === plan.cast ? released.entry : entry);
        // V14 EmbeddedCollectionField updates existing children by _id in the
        // same parent update; omitted effects and unrelated held spells survive.
        await actors[1].update({ [`flags.${scope}.sustaining`]: activeEntries, effects: patches });
        lists[1] = structuredClone(activeEntries);
        for (const [uuid, data] of expected) {
          const patch = patches.find(row => row._id === data._id);
          data.disabled = patch.disabled; data.flags[scope].sustainTransfer = null;
        }
        await check();
        await save({ ...receipt, activation: { ...receipt.activation, state: "done" } });
        return { ok: true, key, transactionId: receipt.transactionId };
      } catch {
        if (claimed) uncertain.add(key);
        return { ok: false, reason: claimed ? "review" : "changed" };
      }
    };
    const result = queue.then(run, run); queue = result.catch(() => {}); return result;
  };
}
