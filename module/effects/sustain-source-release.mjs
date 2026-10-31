import { suspendSustainTransferEntry } from "../rules/sustain-entry-transfer.mjs";
import { suspendSustainTransferEffect } from "../rules/sustain-transfer-suspension.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";
import { dispersionFor } from "../rules/dispersion.mjs";
import { hasTransferCarrierPlan } from "../rules/sustain-record-carrier.mjs";

const scope = "azeroth-rpg";
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).filter(key => key !== "_stats").sort().map(key => [key, stable(value[key])])) : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

/** Remove only the confirmed source hold after all carriers have moved. The
 * recipient stays suspended until the coordinator durably completes and releases
 * the transaction. No endSustain call: it would also destroy the relocated cast. */
export async function releaseSustainTransferSource({ plan, receipt, validate } = {}) {
  if (typeof validate !== "function" || receipt?.version !== 1 || receipt.state !== "claimed"
    || receipt.attempted !== "releaseSource" || !same(receipt.completed, ["holdRecipient", "relocateCarriers"])
    || !["casterUuid", "recipientUuid", "cast", "transactionId"].every(key => typeof plan?.[key] === "string"
      && plan[key].length > 0 && receipt[key] === plan[key]) || plan.casterUuid === plan.recipientUuid
    || !hasTransferCarrierPlan(plan)) {
    throw Error("Invalid source release stage");
  }
  plan = structuredClone(plan); receipt = structuredClone(receipt);
  const actors = [plan.casterUuid, plan.recipientUuid].map(uuid => fromUuidSync(uuid));
  if (actors.some((actor, index) => actor?.documentName !== "Actor" || actor.uuid !== [plan.casterUuid, plan.recipientUuid][index])) {
    throw Error("Missing transfer participant");
  }
  const lists = actors.map(actor => structuredClone(actor.getFlag(scope, "sustaining") ?? []));
  if (!lists.every(Array.isArray)) throw Error("Invalid held records");
  const entries = [plan.inventory?.entry, plan.recipientEntry].map((entry, index) =>
    suspendSustainTransferEntry({ entry, ownerUuid: actors[index].uuid, receipt }));
  for (const [index, result] of entries.entries()) {
    const matching = lists[index].filter(entry => entry.cast === plan.cast);
    if (!result.ok || matching.length !== 1 || !same(matching[0], result.entry)) throw Error("Transfer hold changed");
  }
  const destinations = new Map();
  for (const move of plan.relocation.moves) {
    const destination = move.destination, data = destination?.data;
    const suspended = suspendSustainTransferEffect({ effect: data, receipt });
    if (!move.ok || !suspended.ok || destinations.has(destination.uuid)
      || destination.parentUuid !== plan.recipientUuid || data.origin !== plan.recipientUuid
      || destination.uuid !== `${plan.recipientUuid}.ActiveEffect.${data._id}`) throw Error("Invalid transfer destination");
    destinations.set(destination.uuid, { ...data, disabled: true, flags: { ...data.flags,
      [scope]: { ...data.flags[scope], sustainTransfer: suspended.patch[`flags.${scope}.sustainTransfer`] } } });
  }
  const check = async () => {
    if (await validate() !== true) throw Error("Transfer claim changed");
    if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) throw Error("Transfer authority changed");
    for (const [index, actor] of actors.entries()) {
      if (fromUuidSync(actor.uuid) !== actor || iceBlockFor(actor) || dispersionFor(actor)
        || !same(actor.getFlag(scope, "sustaining") ?? [], lists[index])) throw Error("Transfer participant changed");
    }
    for (const [uuid, data] of destinations) {
      const effect = fromUuidSync(uuid);
      if (effect?.documentName !== "ActiveEffect" || effect.parent?.uuid !== plan.recipientUuid
        || !same(effect.toObject(), data)) throw Error("Transferred carrier changed");
    }
    if (plan.relocation.removals.some(row => fromUuidSync(row.uuid))) throw Error("Original carrier remains");
  };
  await check();
  const retained = lists[0].filter(entry => entry.cast !== plan.cast);
  await actors[0].setFlag(scope, "sustaining", retained);
  lists[0] = structuredClone(retained);
  await check();
  return { released: plan.cast, casterUuid: plan.casterUuid, recipientUuid: plan.recipientUuid };
}
