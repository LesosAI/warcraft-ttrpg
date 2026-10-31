import { resolveAttackOperation } from "./attack-resolution-state.mjs";
import { phaseShiftEffect, phaseShiftAttackState } from "../rules/phase-shift.mjs";
import { untilNextTurnOrRound } from "./durations.mjs";
import { annotateHere } from "../dice/annotate.mjs";
import { withdrawHit } from "./miss.mjs";

/** The reaction adapter supplies current eligibility and payment. A durable
 * claim precedes payment, refunds and effect writes, so an uncertain result
 * cannot be retried as another Reaction. No UI invokes this until all of the
 * Phase Shift restrictions are enforced by the action entry points. */
export async function resolvePhaseShiftAttack({ message, index, actor, validate, payReaction,
  answeredWithLost = false } = {}) {
  if (typeof validate !== "function" || typeof payReaction !== "function"
    || !actor?.uuid || fromUuidSync(actor.uuid) !== actor || !actor.isOwner) return { ok: false, reason: "invalid" };
  const data = phaseShiftEffect({ ownerUuid: actor.uuid, attackUuid: message?.uuid, index,
    timing: untilNextTurnOrRound(actor) });
  if (!data) return { ok: false, reason: "timing" };
  const incoming = message.flags?.["azeroth-rpg"]?.damageByTarget?.[index];
  const attackState = phaseShiftAttackState(incoming, message.rolls?.[0]?.outcome);
  if (!attackState) return { ok: false, reason: "attack" };
  const held = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && fromUuidSync(actor.uuid) === actor && fromUuidSync(message.uuid) === message && actor.isOwner
    && game.time?.worldTime === data.start.time
    && message.getFlag("azeroth-rpg", "attackResolution")?.targets?.[index]?.stage === "phasing"
    && message.getFlag("azeroth-rpg", "attackResolution")?.targets?.[index]?.targetUuid === actor.uuid;
  // Validate eligibility before payment. After payment, the caller must not
  // require the now-spent Reaction; the operation's durable claim owns it.
  return resolveAttackOperation({ message, index, targetUuid: actor.uuid, operation: "phase", validate,
    execute: async () => {
      if (!held() || await payReaction() !== true || !held()) return { ok: false };
      await actor.setFlag("azeroth-rpg", "reacted", { messageId: message.id, reaction: "phaseShift" });
      if (!held()) return { ok: false };
      if (attackState === "hit") {
        const row = await annotateHere({ messageId: message.id, index, reaction: "phaseShift", to: 0,
          mitigated: incoming.damage, withdrawn: true });
        if (row?.withdrawn !== true || !held()) return { ok: false };
        await withdrawHit(actor, { messageId: message.id, index, answeredWithLost });
      }
      if (!held()) return { ok: false };
      const created = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
      const effect = created?.[0];
      if (!held() || !effect?.id || actor.effects?.get(effect.id) !== effect
        || effect.flags?.["azeroth-rpg"]?.phaseShift?.attackUuid !== message.uuid
        || effect.origin !== actor.uuid || effect.disabled || effect.duration?.expired) return { ok: false };
      return { ok: true };
    } });
}
