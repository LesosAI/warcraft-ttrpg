/** Plan one ordinary actor-carried Sustain effect, without writing documents.
 * The coordinator must handle the whole cast, permissions, protection, duplicate
 * carriers, recipient immunities and lifecycle locking before using this plan.
 * Specialized flags require a dedicated relocation handler, never a blind copy.
 */
const SCOPE = "azeroth-rpg";
const ordinaryFlags = new Set(["spell", "spellName", "identifier", "cast", "messageId", "sustained", "tick"]);
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
  unsupported.push(...Object.keys(flags).filter(key => !ordinaryFlags.has(key)).map(key => `flags.${SCOPE}.${key}`));
  if (unsupported.length) return { ok: false, reason: "specializedCarrier", unsupported: unsupported.sort() };
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
  if (tick != null) data.flags[SCOPE].tick.source = recipientUuid;
  return { ok: true,
    source: { uuid: effect.uuid, parentUuid: effect.parentUuid, id: effect._id, expected: structuredClone(effect) },
    destination: { uuid: `${recipientUuid}.ActiveEffect.${destinationId}`, parentUuid: recipientUuid, id: destinationId,
      operation: sameParent ? "update" : "create", data },
    removeOriginal: !sameParent };
}
