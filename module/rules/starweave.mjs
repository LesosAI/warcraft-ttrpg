/** Starweave is associated with one particular Starfall, not every spell of
 * that name held by the Druid. Plain snapshots only; discovery and writes
 * belong to the active GM. Geometry policy belongs to placement.
 */
const identity = value => typeof value === "string" && value.trim().length > 0;

/** Validate the pair before linking it, or before using an existing link.
 * A Region snapshot contains uuid, sceneId, identifier, caster, cast and
 * sustained. held contains the caster's actual Sustain records.
 */
export function starweaveAssociation({ casterUuid, sceneId, starfall, starweave, held } = {}) {
  if (!identity(casterUuid) || !identity(sceneId) || !Array.isArray(held)) return { ok: false, reason: "identity" };
  for (const [region, identifier] of [[starfall, "starfall"], [starweave, "starweave"]]) {
    if (!region || !identity(region.uuid) || !identity(region.cast)
      || region.identifier !== identifier || region.sustained !== true) return { ok: false, reason: "identity" };
    if (region.sceneId !== sceneId) return { ok: false, reason: "scene" };
    if (region.caster !== casterUuid) return { ok: false, reason: "caster" };
    const entries = held.filter(entry => entry?.cast === region.cast);
    if (!entries.length) return { ok: false, reason: "ended" };
    if (entries.length !== 1) return { ok: false, reason: "ambiguousCast" };
    if (entries[0].identifier !== identifier) return { ok: false, reason: "spell" };
  }
  if (starfall.cast === starweave.cast || starfall.uuid === starweave.uuid) return { ok: false, reason: "identity" };
  return { ok: true, link: { version: 1, casterUuid, sceneId,
    starfall: { regionUuid: starfall.uuid, cast: starfall.cast },
    starweave: { regionUuid: starweave.uuid, cast: starweave.cast } } };
}

/** Revalidate an already recorded association against the exact live pair.
 * Recasting the same named spell or replacing a Region cannot inherit it.
 */
export function starweaveAssociationLive(link, context) {
  const current = starweaveAssociation(context);
  if (!current.ok) return false;
  const expected = current.link;
  return link?.version === 1 && link.casterUuid === expected.casterUuid && link.sceneId === expected.sceneId
    && link.starfall?.regionUuid === expected.starfall.regionUuid && link.starfall.cast === expected.starfall.cast
    && link.starweave?.regionUuid === expected.starweave.regionUuid && link.starweave.cast === expected.starweave.cast;
}
