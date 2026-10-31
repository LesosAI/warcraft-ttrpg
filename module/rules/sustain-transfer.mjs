/** Read-only inventory for a single held cast. Document mutation and transfer
 * policy belong to the GM coordinator; this function never guesses a legacy
 * cast from a spell name or combines repeated castings of the same spell. */
export function sustainTransferInventory({ casterUuid, cast, entries = [], effects = [], regions = [] } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (typeof casterUuid !== "string" || !casterUuid || typeof cast !== "string" || !cast) return refuse("identity");
  if (![entries, effects, regions].every(Array.isArray)) return refuse("shape");
  const held = entries.filter(entry => entry?.cast === cast);
  if (held.length !== 1) return refuse(held.length ? "ambiguousCast" : "missingCast");
  const entry = held[0];
  if (typeof entry.uuid !== "string" || !entry.uuid) return refuse("spellIdentity");
  const selectedEffects = effects.filter(effect => {
    const flags = effect?.flags?.["azeroth-rpg"];
    if (flags?.cast !== cast) return false;
    // Current actor-carried Sustains use the caster origin. The older cleanup
    // path also supports an absent origin when the spell UUID identifies it.
    return effect.origin === casterUuid || (!effect.origin && flags.spell === entry.uuid);
  });
  const selectedRegions = regions.filter(region => {
    const flags = region?.flags?.["azeroth-rpg"];
    return flags?.cast === cast && flags.caster === casterUuid && flags.sustained === true;
  });
  const seen = new Set();
  for (const document of [...selectedEffects, ...selectedRegions]) {
    if (typeof document.uuid !== "string" || !document.uuid || seen.has(document.uuid)) return refuse("documentIdentity");
    seen.add(document.uuid);
  }
  // Copies preserve opaque spell-specific mechanics and provide a stable basis
  // for later revalidation. Caller arrays and document snapshots remain intact.
  return { ok: true, casterUuid, cast, entry: structuredClone(entry),
    effects: structuredClone(selectedEffects).sort((a, b) => a.uuid.localeCompare(b.uuid)),
    regions: structuredClone(selectedRegions).sort((a, b) => a.uuid.localeCompare(b.uuid)) };
}
