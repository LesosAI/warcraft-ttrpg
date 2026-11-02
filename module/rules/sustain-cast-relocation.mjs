/** Whole-cast planning for ordinary actor effects. No document writes.
 * Unequal target bundles use the counterspelled caster's own version.
 */
import { sustainEffectRelocation } from "./sustain-effect-relocation.mjs";
import { isRecordCarriedSustain } from "./sustain-record-carrier.mjs";

const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const signature = effect => {
  const data = structuredClone(effect);
  for (const key of ["_id", "uuid", "parentUuid", "_stats"]) delete data[key];
  return JSON.stringify(stable(data));
};

/** Shared by ID allocation and final planning so unequal bundle sizes agree. */
export function sustainCarrierParent(inventory, recipientUuid) {
  const bundles = new Map();
  for (const effect of inventory.effects) {
    const rows = bundles.get(effect.parentUuid) ?? [];
    rows.push(signature(effect)); bundles.set(effect.parentUuid, rows);
  }
  const parents = [...bundles.keys()].sort();
  if (!parents.length) return null;
  const expected = JSON.stringify(bundles.get(parents[0]).sort());
  const unequal = [...bundles.values()].some(rows => JSON.stringify(rows.sort()) !== expected);
  if (unequal) return bundles.has(inventory.casterUuid) ? inventory.casterUuid : null;
  return bundles.has(recipientUuid) ? recipientUuid : parents[0];
}

export function sustainCastRelocation({ inventory, recipientUuid, destinationIds = [], recipientEffects } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!inventory?.ok || !Array.isArray(inventory.effects) || !Array.isArray(inventory.regions)
    || !Array.isArray(destinationIds)) return refuse("inventory");
  // The GM adapter must supply the recipient's complete current collection.
  // Absence is not an empty collection, and another actor's snapshot is invalid.
  if (!Array.isArray(recipientEffects)) return refuse("recipientSnapshot");
  const occupied = new Map();
  for (const effect of recipientEffects) {
    if (!effect?._id || effect.parentUuid !== recipientUuid
      || effect.uuid !== `${recipientUuid}.ActiveEffect.${effect._id}` || occupied.has(effect._id)) return refuse("recipientSnapshot");
    occupied.set(effect._id, effect);
  }
  if (inventory.regions.length) return refuse("regionHandler");
  if (!inventory.effects.length) return isRecordCarriedSustain(inventory.entry)
    ? { ok: true, recordOnly: true, moves: [], removals: [] } : refuse("missingCarrier");
  const bundles = new Map(), seen = new Set();
  for (const effect of inventory.effects) {
    if (!effect?.uuid || seen.has(effect.uuid)) return refuse("documentIdentity");
    seen.add(effect.uuid);
    // Validate every copy, not only the representative ultimately moved.
    const checked = sustainEffectRelocation({ effect, casterUuid: inventory.casterUuid, cast: inventory.cast,
      spellUuid: inventory.entry?.uuid, recipientUuid, destinationId: effect._id });
    if (!checked.ok) return checked;
    const rows = bundles.get(effect.parentUuid) ?? [];
    rows.push({ effect, signature: signature(effect) }); bundles.set(effect.parentUuid, rows);
  }
  for (const rows of bundles.values()) rows.sort((a, b) => a.signature.localeCompare(b.signature) || a.effect.uuid.localeCompare(b.effect.uuid));
  const chosen = sustainCarrierParent(inventory, recipientUuid);
  if (!chosen) return refuse("missingCasterCarrier");
  const selected = bundles.get(chosen);
  const onRecipient = chosen === recipientUuid;
  if (!onRecipient && (destinationIds.length !== selected.length || new Set(destinationIds).size !== destinationIds.length)) return refuse("destinationIds");
  const moves = selected.map(({ effect }, index) => sustainEffectRelocation({ effect,
    casterUuid: inventory.casterUuid, cast: inventory.cast, spellUuid: inventory.entry.uuid, recipientUuid,
    destinationId: onRecipient ? effect._id : destinationIds[index] }));
  const failed = moves.find(move => !move.ok); if (failed) return failed;
  for (const move of moves) {
    const current = occupied.get(move.destination.id);
    if (move.destination.operation === "create" && current) return refuse("destinationOccupied");
    if (move.destination.operation === "update"
      && (!current || JSON.stringify(stable(current)) !== JSON.stringify(stable(move.source.expected)))) return refuse("recipientChanged");
  }
  const retained = new Set(onRecipient ? selected.map(row => row.effect.uuid) : []);
  return { ok: true, moves, removals: structuredClone(inventory.effects.filter(effect => !retained.has(effect.uuid)))
    .sort((a, b) => a.uuid.localeCompare(b.uuid)) };
}
