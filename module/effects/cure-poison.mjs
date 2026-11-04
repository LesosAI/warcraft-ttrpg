/** GM mutation primitive. The cast workflow must authorize, select and pay
 * before calling this; it is deliberately not an externally callable query.
 */
import { curePoisonJudgement, cureBleedingPlan } from "../rules/cure-poison.mjs";
import { archmageCasters, plainEffect } from "./dispel.mjs";
import { endNullifiedEffect } from "./nullifier.mjs";
import { endCarrier } from "./cures.mjs";

const pending = new Set();

export async function resolveCurePoison({ caster, target, choice, classification = null, gateTest = null } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!globalThis.game?.user?.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) return refuse("gmRequired");
  if (!caster?.uuid || !target?.uuid || choice?.targetId !== target.uuid) return refuse("target");
  if (pending.has(target.uuid)) return refuse("pending");
  pending.add(target.uuid);
  try {
    if (choice.kind === "bleeding") {
      if (choice.effectId != null) return refuse("mixedChoice");
      const plan = cureBleedingPlan([...target.effects].map(plainEffect));
      if (!plan || !plan.removed) return refuse("noBleeding");
      // One embedded update batch; never toggle the condition off on the whole
      // actor, which could delete unrelated changes held in the same effect.
      const written = await target.updateEmbeddedDocuments("ActiveEffect", plan.updates);
      const complete = plan.updates.every(update => written?.some(e => e.id === update._id)
        && target.effects.get(update._id)?.getFlag("azeroth-rpg", "value") === update["flags.azeroth-rpg.value"]
        && (!update.statuses || !target.effects.get(update._id)?.statuses?.has("bleeding")));
      return complete ? { ok: true, reason: null, removed: plan.removed } : refuse("writeIncomplete");
    }
    if (choice.kind !== "effect" || typeof choice.effectId !== "string") return refuse("invalidChoice");
    const effect = target.effects.get(choice.effectId);
    if (!effect) return refuse("missingEffect");
    const snapshot = plainEffect(effect);
    const judgement = curePoisonJudgement(snapshot, { classification, archmage: archmageCasters([snapshot]) });
    if (!judgement.ok) return refuse(judgement.reason);
    // This shared writer rechecks identity, protection and the reviewed state
    // after a curse gate; it deletes the whole dose before retaliation.
    // A poison or disease CARRIER ends through the affliction writer (D12 Phase 6); a curse keeps its gates.
    const carried = await endCarrier(target, effect.id, { by: caster });
    if (carried) return carried;
    return await endNullifiedEffect({ dispeller: caster, target, effectId: effect.id, classification, gateTest });
  } finally {
    pending.delete(target.uuid);
  }
}
