/** Snare catches the first entrant; Snake Trap rank 2 poisons the occupants then. */
export function snareTriggerPlan({ held = null, regionUuid, tokenUuid, actorUuid, reach = null, inside = [] } = {}) {
  if (held !== null) return { ok: false, reason: "claimed" };
  if (![regionUuid, tokenUuid, actorUuid].every(value => typeof value === "string" && value)
    || ![null, "first", "all"].includes(reach)
    || !Array.isArray(inside) || inside.some(value => typeof value !== "string" || !value)) {
    return { ok: false, reason: "invalid" };
  }
  // Include the entrant even when its completed movement already left the circle.
  // Keep the blast's occupants independently of Snake Trap's rank. Explosive
  // Trap reaches the whole circle even when there is no poison talent at all.
  const areaTargets = [...new Set([actorUuid, ...inside])];
  const poisonTargets = reach === "all" ? [...areaTargets]
    : reach === "first" ? [actorUuid] : [];
  return { ok: true, record: { version: 1, phase: "claimed", regionUuid, tokenUuid, actorUuid, areaTargets, poisonTargets } };
}

/** Only a completed trigger's saved occupants may answer its poison Test. */
export function snarePoisonEligible(trigger, actorUuid) {
  return trigger?.version === 1 && trigger.phase === "resolved"
    && typeof actorUuid === "string" && Boolean(actorUuid)
    && Array.isArray(trigger.poisonTargets) && trigger.poisonTargets.includes(actorUuid);
}

/** The entry handler owns Snare's Entangled, including cards using the older marker. */
export function snareOwnsCondition(flags, condition) {
  return flags?.kind === "feature" && (flags.featureKey === "snare" || flags.snare === true) && condition === "entangled";
}
