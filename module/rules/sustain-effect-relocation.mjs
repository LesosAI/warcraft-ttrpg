/** Plan one ordinary actor-carried Sustain effect, without writing documents.
 * The coordinator must handle the whole cast, permissions, protection, duplicate
 * carriers, recipient immunities and lifecycle locking before using this plan.
 * Specialized flags require a dedicated relocation handler, never a blind copy.
 */
import { cleanEscape } from "./escapes.mjs";
const SCOPE = "azeroth-rpg";
const ordinaryFlags = new Set(["spell", "spellName", "identifier", "cast", "messageId", "sustained", "tick", "spellDC", "escape", "enslaveNextSave", "dominationOrder", "enslaveClockReview"]);
const identity = value => typeof value === "string" && value.trim().length > 0;

export function sustainEffectRelocation({ effect, casterUuid, cast, spellUuid, recipientUuid, destinationId } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (![casterUuid, cast, spellUuid, recipientUuid, destinationId].every(identity)
    || casterUuid === recipientUuid) return refuse("identity");
  if (!effect || ![effect.uuid, effect.parentUuid, effect._id].every(identity)
    || effect.uuid !== `${effect.parentUuid}.ActiveEffect.${effect._id}`) return refuse("document");
  const flags = effect.flags?.[SCOPE];
  if (flags?.cast !== cast || flags.spell !== spellUuid || flags.sustained !== true
    || (effect.origin && effect.origin !== casterUuid)) return refuse("cast");
  // A finite turn-bound rider may end on the OLD caster's combatant. Rebasing
  // that clock belongs to its dedicated handler, not an unchanged snapshot.
  if (effect.duration?.value != null || effect.duration?.expiry != null) return refuse("timedCarrier");
  // Flags outside this reviewed shape may contain actor, token, item or effect
  // references, or independent receipts. Do not claim they can move unchanged.
  const unsupported = Object.keys(effect.flags ?? {}).filter(key => key !== SCOPE)
    .map(key => `flags.${key}`);
  // Activation clears its marker with null. That completed-transfer metadata
  // must not prevent a different caster stealing the spell later. A non-null
  // claim remains unsupported here and cannot be copied into another transfer.
  unsupported.push(...Object.keys(flags).filter(key => !ordinaryFlags.has(key)
    && !(key === "sustainTransfer" && flags[key] === null)).map(key => `flags.${SCOPE}.${key}`));
  if (unsupported.length) return { ok: false, reason: "specializedCarrier", unsupported: unsupported.sort() };
  if (flags.spellDC != null && (!Number.isSafeInteger(flags.spellDC) || flags.spellDC <= 0)) return refuse("spellDC");
  // Enslave's minute clock is an absolute world time, not a caster-turn clock.
  // Preserve even an overdue deadline; transfer must not buy another minute.
  if (Object.hasOwn(flags, "enslaveNextSave") || flags.identifier === "enslave-demon") {
    if (flags.identifier !== "enslave-demon" || !Number.isFinite(flags.enslaveNextSave)
      || !Number.isSafeInteger(flags.spellDC) || flags.spellDC <= 0
      || !Array.isArray(effect.statuses) || !effect.statuses.includes("charmed")) return refuse("enslaveClock");
  }
  // The clock review is also historical: later saves may have advanced the
  // deadline since review. Never reconstruct today's deadline from this record.
  if (Object.hasOwn(flags, "enslaveClockReview")) {
    const review = flags.enslaveClockReview;
    if (flags.identifier !== 'enslave-demon' || !Number.isFinite(flags.enslaveNextSave)
      || !review || typeof review !== 'object' || Array.isArray(review)
      || Object.keys(review).length !== 3 || !identity(review.by) || !Number.isFinite(review.at)
      || !Number.isInteger(review.seconds) || review.seconds < 0 || review.seconds > 60
      || Object.keys(review).some(key => !['by','at','seconds'].includes(key))) return refuse('enslaveClockReview');
  }
  // Terminal save receipts are historical evidence, not instructions to reroll.
  // Keep their original writer/result IDs. A rolling/ending receipt must first
  // be reconciled at its original holder; never transport an unfinished save.
  if (Object.hasOwn(flags, "dominationOrder")) {
    const receipt = flags.dominationOrder;
    const keys = new Set(['state','writerId','cast','attemptId','reason','dueAt','resultId','reviewed','reviewedBy']);
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
      || Object.keys(receipt).some(key => !keys.has(key))
      || !['dominate','enslave-demon'].includes(flags.identifier)
      || !effect.statuses?.includes('charmed')
      || !['complete','cancelled'].includes(receipt.state) || receipt.cast !== cast
      || !identity(receipt.writerId) || !identity(receipt.attemptId)
      || !['order','minute'].includes(receipt.reason)
      || (receipt.reason === 'order' ? receipt.dueAt !== null
        : flags.identifier !== 'enslave-demon' || !Number.isFinite(receipt.dueAt)
          || flags.enslaveNextSave !== receipt.dueAt + (receipt.state === 'complete' ? 60 : 0))
      || (Object.hasOwn(receipt,'resultId') && !identity(receipt.resultId))
      || (Object.hasOwn(receipt,'reviewed') || Object.hasOwn(receipt,'reviewedBy')
        ? receipt.reviewed !== true || !identity(receipt.reviewedBy) || receipt.state !== 'complete'
        : receipt.state === 'complete' && !identity(receipt.resultId))) return refuse('dominationReceipt');
  }
  const escape = flags.escape;
  if (escape != null) {
    const cleaned = cleanEscape(escape);
    // Accept only the exact serialized repeat-save shape. Cleaning must not
    // silently discard extensions or coerce a malformed source into legality.
    if (!cleaned || escape.by !== casterUuid || escape.cast !== cast || !cleaned.dc
      || !Array.isArray(effect.statuses) || !effect.statuses.includes(cleaned.condition)
      || Object.keys(escape).length !== Object.keys(cleaned).length
      || Object.entries(cleaned).some(([key,value]) => JSON.stringify(escape[key]) !== JSON.stringify(value))) return refuse("escapeIdentity");
  }
  const tick = flags.tick;
  if (tick != null && (typeof tick !== "object" || Array.isArray(tick)
    || tick.source !== casterUuid || tick.cast !== cast || tick.castUuid !== spellUuid)) return refuse("tickIdentity");
  const sameParent = effect.parentUuid === recipientUuid;
  if (sameParent && destinationId !== effect._id) return refuse("existingRecipientId");
  const data = structuredClone(effect);
  // UUID/parentUuid are inventory metadata, not V14 schema fields. The new
  // document gets its own stats; indefinite Sustain timing is not restarted.
  delete data.uuid;
  delete data.parentUuid;
  delete data._stats;
  data._id = destinationId;
  data.origin = recipientUuid;
  delete data.flags[SCOPE].sustainTransfer;
  if (tick != null) data.flags[SCOPE].tick.source = recipientUuid;
  if (escape != null) data.flags[SCOPE].escape.by = recipientUuid;
  return { ok: true,
    source: { uuid: effect.uuid, parentUuid: effect.parentUuid, id: effect._id, expected: structuredClone(effect) },
    destination: { uuid: `${recipientUuid}.ActiveEffect.${destinationId}`, parentUuid: recipientUuid, id: destinationId,
      operation: sameParent ? "update" : "create", data },
    removeOriginal: !sameParent };
}
