/** Tabletop adaptation of the Classic threat-reset proc. The runtime supplies
 * current reach, visibility and hostility; this rule grants no movement and
 * removes no Taunt penalty. Reevaluate before each roll, including Extra Attack. */
export function annihilatorTargets({ previousTargetId = null, targets = [] } = {}) {
  const eligible = [];
  const seen = new Set();
  for (const target of targets) {
    if (typeof target?.id !== "string" || !target.id || seen.has(target.id)
      || target.alive !== true || target.hostile !== true || target.visible !== true || target.inReach !== true) continue;
    seen.add(target.id);
    eligible.push(target.id);
  }
  const alternatives = eligible.filter(id => id !== previousTargetId);
  return alternatives.length ? alternatives : eligible;
}

export function annihilatorTargetAllowed({ targetId, previousTargetId = null, targets = [] } = {}) {
  return annihilatorTargets({ previousTargetId, targets }).includes(targetId);
}
