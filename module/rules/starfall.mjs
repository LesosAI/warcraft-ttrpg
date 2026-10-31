/** Starfall's caster-turn choice (07-MAGIC and 04-TALENTS).
 * Pure: callers establish the exact live cast, area membership and ownership.
 * Entry damage remains the existing area-strike door's responsibility.
 */
export function starfallTargetLimit({ talentRank = 0, starweave = false } = {}) {
  return (Number.isInteger(talentRank) && talentRank > 0) || starweave === true ? 2 : 1;
}

/** Validate explicit, distinct creature choices against the current area.
 * Candidates are authoritative actor UUIDs, not client-supplied membership.
 * Returning a plan never spends a turn or applies damage. Revalidation after
 * consent and a durable turn/cast claim belong to the eventual GM coordinator.
 */
export function starfallSelection({ candidates = [], selected = [], talentRank = 0, starweave = false } = {}) {
  const valid = value => typeof value === "string" && value.trim().length > 0;
  if (!Array.isArray(candidates) || !candidates.every(valid)
    || !Array.isArray(selected) || !selected.every(valid)) return { ok: false, reason: "identity" };
  const eligible = new Set(candidates);
  const limit = starfallTargetLimit({ talentRank, starweave });
  const required = Math.min(limit, eligible.size);
  if (new Set(selected).size !== selected.length) return { ok: false, reason: "duplicate" };
  if (selected.some(uuid => !eligible.has(uuid))) return { ok: false, reason: "ineligible" };
  if (selected.length !== required) return { ok: false, reason: "count", required };
  return { ok: true, limit, targets: [...selected], damage: { rating: 2, school: "arcane" } };
}
