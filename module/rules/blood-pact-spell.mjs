/** Blood Pact spell (07-MAGIC), distinct from the imp's temporary-Health ability.
 * Inputs are authoritative snapshots. The adapter supplies live command records,
 * actual Bound Demon feature IDs, measured distance and the casting Mana pool.
 * No Foundry documents or mutations belong in this module.
 */
export const BLOOD_PACT_SPELL = Object.freeze({ health: 6, mana: 4, floor: 1, feet: 30 });

/** Return the source of command, never infer it from actor ownership or names. */
export function bloodPactAuthority({ casterUuid, donor, talent = false, boundFeatureIds = [] } = {}) {
  if (typeof casterUuid !== "string" || !casterUuid || !donor?.uuid || donor.uuid === casterUuid) return null;
  if (String(donor.creatureType ?? "").trim().toLowerCase() !== "demon") return null;
  const bond = donor.bond;
  const bound = bond?.kind === "demon" && bond.ownerUuid === casterUuid;
  if (talent) {
    // Older Command Demon casts stamped the Bound Demon feature's sourceId.
    // Their temporary, uncounted bond is still not that class feature's demon.
    if (bond?.until === "longRest" && bond.uncounted === true) return null;
    return bound && typeof bond.sourceId === "string" && boundFeatureIds.includes(bond.sourceId)
      ? { kind: "bound", sourceId: bond.sourceId } : null;
  }
  if (bound) return { kind: "bound", sourceId: bond.sourceId ?? null };
  const command = (donor.commands ?? []).find(row => row?.identifier === "compel"
    && row.origin === casterUuid && row.sustained === true && row.live === true
    && typeof row.cast === "string" && row.cast.length > 0
    && typeof row.effectId === "string" && row.effectId.length > 0
    && row.statuses?.includes("charmed"));
  return command ? { kind: "compel", effectId: command.effectId, cast: command.cast } : null;
}

/** Plan exact resource changes; Health loss is a sacrifice, not mitigated damage.
 * `distance: null` explicitly means no scene measurement is available, matching
 * ordinary spell use off-scene. A supplied invalid distance is never treated so.
 * The adapter chooses the granting pool; this function never substitutes another.
 */
export function bloodPactTransfer({ casterUuid, donor, talent = false, boundFeatureIds = [], pool, distance = null } = {}) {
  const refuse = reason => ({ ok: false, reason });
  const authority = bloodPactAuthority({ casterUuid, donor, talent, boundFeatureIds });
  if (!authority) return refuse("donor");
  if (distance !== null && (!Number.isFinite(distance) || distance < 0 || distance > BLOOD_PACT_SPELL.feet)) return refuse("range");
  const health = donor.health;
  if (!Number.isInteger(health) || health < BLOOD_PACT_SPELL.health + BLOOD_PACT_SPELL.floor) return refuse("health");
  if (!pool || pool.kind !== "power" || !["mana", null].includes(pool.name)
    || !Number.isInteger(pool.value) || !Number.isInteger(pool.max)
    || pool.value < 0 || pool.max < pool.value) return refuse("pool");
  const restored = Math.min(BLOOD_PACT_SPELL.mana, pool.max - pool.value);
  return { ok: true, authority, donorUuid: donor.uuid,
    health: { before: health, after: health - BLOOD_PACT_SPELL.health, spent: BLOOD_PACT_SPELL.health },
    pool: { itemId: pool.itemId ?? null, kind: pool.kind, name: pool.name,
      before: pool.value, after: pool.value + restored, restored } };
}
