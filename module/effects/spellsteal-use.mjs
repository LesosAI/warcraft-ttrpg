import { counterspellFor, COUNTERSPELL } from "../rules/class-talents.mjs";
import { prepareSustainRecipient } from "./sustain-recipient-preparation.mjs";
import { createSustainTransferDelivery } from "./sustain-transfer-delivery.mjs";
import { createSustainTransferActivation } from "./sustain-transfer-activation.mjs";
import { writeSustainTransferHolds } from "./sustain-hold-writer.mjs";
import { writeSustainTransferCarriers } from "./sustain-carrier-writer.mjs";
import { releaseSustainTransferSource } from "./sustain-source-release.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";
import { dispersionFor } from "../rules/dispersion.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { replaceSustainsForTransfer, sameSustainSnapshot } from "./sustain-transfer-replacement.mjs";

export const SPELLSTEAL_USE_QUERY = "azeroth-rpg.spellstealUse";
const scope = "azeroth-rpg", ledgerFlag = "spellstealTransfers";
const continuations = new WeakMap();
let queue = Promise.resolve();
const serial = run => { const result = queue.then(run, run); queue = result.catch(() => {}); return result; };
/** GM recovery joins the same queue as paid uses; it never races a live use. */
export const withSpellstealUseLock = run => serial(run);
const identity = value => typeof value === "string" && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const turn = () => ({ combat: game.combat?.id ?? null, round: game.combat?.round ?? null,
  turn: game.combat?.turn ?? null, time: game.time.worldTime });

function tokenFor(actor, ref) {
  if (ref === null) return null;
  if (!identity(ref?.sceneId) || !identity(ref?.tokenId)) throw Error("source");
  const token = fromUuidSync(`Scene.${ref.sceneId}.Token.${ref.tokenId}`);
  if (token?.documentName !== "Token" || token.actor !== actor || token.parent?.id !== ref.sceneId) throw Error("source");
  return token;
}

export function spellstealUseChoice(actor, item, commit) {
  const context = continuations.get(commit);
  return context?.mage === actor && context.item === item && context.valid()
    ? { casterUuid: context.caster.uuid, cast: context.cast } : null;
}

export function spellstealUseValid(actor, item, commit) {
  return Boolean(spellstealUseChoice(actor, item, commit));
}

/** Called only by the paid GM-local useFeature continuation. */
export async function finishSpellstealUse(actor, item, commit) {
  const context = continuations.get(commit);
  if (!context || context.finished || !spellstealUseValid(actor, item, commit)) return { ok: false, reason: "review" };
  context.finished = true;
  const delivery = await context.deliver({});
  context.result = delivery.ok ? await context.activate(delivery.key) : delivery;
  return context.result;
}

/** Authenticated request pays through useFeature on the GM, never through a
 * caller-supplied paid flag. The durable request precedes any budget/payment. */
export async function spellstealUseHandler(payload = {}, { user = null } = {}) {
  const input = structuredClone(payload);
  return serial(async () => {
    const requester = user?.id ? game.users.get(user.id) : null;
    const writer = game.user?.id;
    const authority = () => requester?.active && game.user?.isGM && game.user.id === writer
      && game.users.activeGM?.id === writer;
    if (!authority() || ![input.mageUuid, input.casterUuid, input.itemUuid, input.cast].every(identity)) return { ok: false, reason: "authority" };
    const mage = fromUuidSync(input.mageUuid), caster = fromUuidSync(input.casterUuid), item = fromUuidSync(input.itemUuid);
    if (mage?.documentName !== "Actor" || caster?.documentName !== "Actor" || mage === caster
      || !mage.testUserPermission(requester, "OWNER") || item?.parent !== mage || item.type !== "feature"
      || item.name !== COUNTERSPELL.feature || !counterspellFor(mage.takenTalents()).transfers) return { ok: false, reason: "authority" };
    const source = input.source ?? null, target = input.target ?? null;
    let sourceToken, targetToken;
    try { sourceToken = tokenFor(mage, source); targetToken = tokenFor(caster, target); }
    catch { return { ok: false, reason: "source" }; }
    // Tokenless references may only name the current world actor, never a
    // synthetic actor or an omitted token from a supplied partial identity.
    if ((!source && game.actors.get(mage.id) !== mage) || (!target && game.actors.get(caster.id) !== caster)) return { ok: false, reason: "source" };
    const stamp = turn();
    const descriptor = JSON.stringify({ cost: item.system.cost, action: item.system.action, feature: item.getFlag(scope, "feature") });
    const key = JSON.stringify([caster.uuid, input.cast]);
    const rows = () => caster.getFlag(scope, ledgerFlag) ?? [];
    if (!Array.isArray(rows())) return { ok: false, reason: "review" };
    const previous = rows().find(row => row.key === key);
    if (previous) return { ok: false, reason: ["done", "closed"].includes(previous.request?.state) ? "used" : "review" };
    let request = null;
    const valid = () => {
      try {
        if (!authority() || fromUuidSync(mage.uuid) !== mage || fromUuidSync(caster.uuid) !== caster
          || fromUuidSync(item.uuid) !== item || !mage.testUserPermission(requester, "OWNER")
          || !counterspellFor(mage.takenTalents()).transfers || !same(turn(), stamp)
          || !(mage.system?.health?.value > 0)
          || descriptor !== JSON.stringify({ cost: item.system.cost, action: item.system.action, feature: item.getFlag(scope, "feature") })
          || iceBlockFor(mage) || iceBlockFor(caster) || dispersionFor(mage) || dispersionFor(caster)
          || tokenFor(mage, source) !== sourceToken || tokenFor(caster, target) !== targetToken) return false;
        if (sourceToken && targetToken) {
          const distance = feetApart(sourceToken, targetToken);
          if (distance === null || distance > COUNTERSPELL.feet) return false;
        }
        return request === null || same(rows().find(row => row.key === key)?.request, request);
      } catch { return false; }
    };
    if (!valid()) return { ok: false, reason: "changed" };
    const prepared = await prepareSustainRecipient({ caster, recipient: mage, cast: input.cast, source });
    if (!prepared.ok || !valid()) return { ok: false, reason: "unsupported" };
    const replacing = prepared.capacity.dropped.length > 0;
    if (replacing && (!sameSustainSnapshot(input.recipientSustains, [...prepared.capacity.dropped, ...prepared.capacity.retained])
      || prepared.replacements?.length !== prepared.capacity.dropped.length)) return { ok: false, reason: "unsupported" };
    let plan = { ...prepared, casterUuid: caster.uuid, recipientUuid: mage.uuid, cast: input.cast,
      transactionId: foundry.utils.randomID() };
    request = { version: 1, id: foundry.utils.randomID(), state: "pending", userId: requester.id,
      writerId: writer, mageUuid: mage.uuid, itemUuid: item.uuid, source, target, stamp };
    const writeDelivery = async (_key, receipt) => {
      if (!valid()) throw Error("Spellsteal authority changed");
      await caster.setFlag(scope, ledgerFlag, rows().map(row => row.key === key ? { ...row, delivery: receipt } : row));
    };
    const readDelivery = async () => structuredClone(rows().find(row => row.key === key)?.delivery ?? null);
    const writers = { holdRecipient: writeSustainTransferHolds, relocateCarriers: writeSustainTransferCarriers,
      releaseSource: releaseSustainTransferSource };
    const context = { mage, caster, item, cast: input.cast, valid, finished: false, result: null,
      deliver: async () => {
        if (replacing) {
          await replaceSustainsForTransfer({ mage, plan, validate: async () => valid(), save: async replacement => {
            if (!valid()) throw Error("Replacement claim changed");
            await caster.setFlag(scope, ledgerFlag, rows().map(row => row.key === key ? { ...row, replacement } : row));
            if (!valid() || !same(rows().find(row => row.key === key)?.replacement, replacement)) throw Error("Replacement receipt unconfirmed");
          } });
          const refreshed = await prepareSustainRecipient({ caster, recipient: mage, cast: input.cast, source });
          if (!valid() || !refreshed.ok || refreshed.capacity.dropped.length
            || !sameSustainSnapshot(refreshed.inventory, plan.inventory)
            || !sameSustainSnapshot(refreshed.capacity.retained, plan.capacity.retained)) throw Error("Transfer changed during replacement");
          plan = { ...plan, ...refreshed };
        }
        return createSustainTransferDelivery({ prepare: async () => valid() ? plan : null,
        readReceipt: readDelivery, writeReceipt: writeDelivery, validate: async () => valid(),
        perform: async (stage, stagePlan, receipt) => writers[stage]({ plan: stagePlan, receipt,
          validate: async () => valid() && same(await readDelivery(), receipt) }) })({});
      },
      activate: createSustainTransferActivation({ readReceipt: readDelivery, writeReceipt: writeDelivery, validate: async () => valid() }) };
    const commit = {};
    try {
      // Record before paying; uncertainty here or later requires review, never
      // another charge based on a client retry or missing chat card.
      await caster.setFlag(scope, ledgerFlag, [...rows(), { key, request, delivery: null }]);
      if (!valid()) return { ok: false, reason: "review" };
      continuations.set(commit, context);
      const selectedTarget = { actorId: caster.id, name: caster.name, sceneId: target?.sceneId ?? null, tokenId: target?.tokenId ?? null };
      const message = await game.system.azeroth.workflows.useFeature({ actor: mage, item,
        targets: [selectedTarget], source, spellstealCommit: commit });
      if (!valid()) return { ok: false, reason: "review" };
      const ok = Boolean(message?.uuid && context.result?.ok);
      request = { ...request, state: ok ? "done" : "review", messageUuid: message?.uuid ?? null };
      await caster.setFlag(scope, ledgerFlag, rows().map(row => row.key === key ? { ...row, request } : row));
      return { ok, reason: ok ? null : "review", messageUuid: message?.uuid ?? null };
    } catch { return { ok: false, reason: "review" }; }
    finally { continuations.delete(commit); }
  });
}

export async function requestSpellstealUse({ mage, caster, item, entry, source = null, target = null }) {
  const gm = game.users.activeGM;
  if (!gm) { ui.notifications?.warn(game.i18n.localize("AZEROTH.Spellsteal.NoGM")); return null; }
  if (!mage.testUserPermission(game.user, "OWNER")) return null;
  const payload = { mageUuid: mage.uuid, casterUuid: caster.uuid, itemUuid: item.uuid, cast: entry.cast, source, target,
    recipientSustains: structuredClone(mage.getFlag(scope, "sustaining") ?? []) };
  let result;
  try { result = gm.id === game.user.id ? await spellstealUseHandler(payload, { user: game.user })
    : await gm.query(SPELLSTEAL_USE_QUERY, payload, { timeout: 60000 }); }
  catch { result = { reason: "review" }; }
  if (!result.ok) ui.notifications?.warn(game.i18n.localize(result.reason === "review"
    ? "AZEROTH.Spellsteal.TransferReview" : "AZEROTH.Spellsteal.TransferUnavailable"));
  return result.messageUuid ? await fromUuid(result.messageUuid) : null;
}
