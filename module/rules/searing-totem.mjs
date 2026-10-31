/** 02's Searing Totem has a fixed 30-foot limit, not a weapon's long band. */
export function isSearingAttack(attack, bond = null) {
  return attack?.name === "Searing flame" || (bond?.kind === "totem"
    && ["Searing", "Searing Totem"].includes(bond.entryName));
}

export function searingRangeRefusal(distances) {
  if (!Array.isArray(distances) || !distances.length) return "target";
  if (distances.some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0)) return "geometry";
  return distances.some(n => n > 30) ? "range" : null;
}

/** A further target is a different creature, including across separate clicks. */
export function searingTargetLimit(talents = []) {
  return talents.some(t => String(t?.className).toLowerCase() === "shaman"
    && t.identifier === "call-of-flame" && Number.isInteger(t.taken) && t.taken >= 2) ? 2 : 1;
}

export function searingTargetPlan({ limit = 1, prior = [], targets = [] } = {}) {
  if (![1, 2].includes(limit) || !Array.isArray(prior) || !Array.isArray(targets)
    || targets.length !== 1 || [...prior, ...targets].some(id => typeof id !== "string" || !id)) return { ok: false, reason: "target" };
  if (new Set([...prior, ...targets]).size !== prior.length + targets.length) return { ok: false, reason: "duplicate" };
  if (prior.length + targets.length > limit) return { ok: false, reason: "limit" };
  return { ok: true, targets: [...prior, ...targets], extra: prior.length > 0 };
}
