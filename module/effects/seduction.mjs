import { seductionEffect, activeSeductions } from "../rules/seduction.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";

const pending = new Set();
const scope = "azeroth-rpg", receiptFlag = "seductionDeliveries";
const present = doc => doc?.uuid && fromUuidSync(doc.uuid) === doc;

/** Called only after a failed resistance has been authenticated by the caller.
 * Claim on the original card before creating the independent charm carrier:
 * dispelling the carrier must never make the same resistance replayable. */
export async function laySeduction({ victim, by, sourceToken, targetToken, message, valid } = {}) {
  const allowed = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && [victim, by, sourceToken, targetToken, message].every(present)
    && sourceToken.actor === by && targetToken.actor === victim
    && typeof valid === "function" && valid() === true;
  const immune = () => (victim.system?.conditionImmunities ?? []).includes("charmed");
  if (!allowed()) return { ok: false, reason: "authority" };
  if (immune()) return { ok: false, reason: "immune", immune: true };
  if (pending.has(message.uuid)) return { ok: false, reason: "busy" };
  pending.add(message.uuid);
  let effect;
  try {
    const receipts = message.getFlag(scope, receiptFlag) ?? [];
    if (!Array.isArray(receipts)) return { ok: false, reason: "invalidReceipt" };
    if (receipts.some(row => row.targetUuid === victim.uuid)) return { ok: false, reason: "alreadyClaimed" };
    const data = seductionEffect({ sourceUuid: by.uuid, sourceTokenUuid: sourceToken.uuid,
      targetUuid: victim.uuid, targetTokenUuid: targetToken.uuid, messageUuid: message.uuid,
      timing: untilEndOfNextTurnOrRound(victim) });
    if (!data || !allowed() || immune()) return { ok: false, reason: "changed" };
    const receipt = { targetUuid: victim.uuid, sourceUuid: by.uuid, stage: "applying" };
    await message.setFlag(scope, receiptFlag, [...receipts, receipt]);
    const claimed = () => JSON.stringify(message.getFlag(scope, receiptFlag)) === JSON.stringify([...receipts, receipt]);
    if (!allowed() || !claimed() || immune()) return { ok: false, reason: "claimUnconfirmed" };
    [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
    const held = effect && activeSeductions(victim.effects, victim.uuid).includes(effect);
    if (!held || !allowed() || !claimed() || immune()) {
      if (held && game.users?.activeGM?.id === game.user.id && present(victim))
        await victim.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      return { ok: false, reason: "changed" };
    }
    await message.setFlag(scope, receiptFlag, [...receipts, { ...receipt, stage: "applied", effectId: effect.id }]);
    const confirmed = message.getFlag(scope, receiptFlag)?.some(row => row.targetUuid === victim.uuid
      && row.stage === "applied" && row.effectId === effect.id);
    if (!confirmed || !allowed()) return { ok: false, reason: "writeUncertain" };
    const { postTimedSeductionPrompt } = await import("./seduction-timed-prompt.mjs");
    const prompted = await postTimedSeductionPrompt(victim, effect, message);
    if (prompted === false) ui.notifications?.warn(game.i18n.localize("AZEROTH.Seduction.TimedPromptUnconfirmed"));
    return { ok: true, effectId: effect.id };
  } catch (error) {
    console.warn("azeroth-rpg | Seduction delivery could not be confirmed", error);
    return { ok: false, reason: "writeUncertain", effectId: effect?.id ?? null };
  } finally { pending.delete(message.uuid); }
}
