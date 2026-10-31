/** Blazing Fireguard: explicit tabletop adaptations of Classic 12742/13341.
 * Scorch is the existing spell. Immolate here is not sustained and includes
 * initial damage; it must not delegate to the book's Warlock Immolate.
 */
export const FIREGUARD = Object.freeze({
  immolate: Object.freeze({ name: "Fireguard Immolate", action: "action", mana: 3,
    feet: 60, dc: 17, resilience: "reflex", damage: 4, tickDamage: 2, ticks: 3, seconds: 6 }),
  blast: Object.freeze({ name: "Fireguard Fire Blast", action: "half", mana: 3,
    feet: 30, dc: 17, resilience: "reflex", damage: 8, tickDamage: 0, ticks: 0, seconds: 0 })
});

export function fireguardAbility(key) {
  return typeof key === "string" && Object.hasOwn(FIREGUARD, key) ? FIREGUARD[key] : null;
}

/** Ratings precede Ward. Resistance halves initial damage and avoids the burn. */
export function fireguardOutcome(key, resisted) {
  const spec = fireguardAbility(key);
  if (!spec || typeof resisted !== "boolean") return null;
  return { damageType: "fire", rating: resisted ? Math.floor(spec.damage / 2) : spec.damage,
    burn: !resisted && spec.ticks > 0 ? { rating: spec.tickDamage, ticks: spec.ticks, seconds: spec.seconds } : null };
}

/** One current, different actor in the same scene, measured by the runtime. */
export function fireguardTargetLegal(key, { sourceUuid, targetUuid, sameScene, distance } = {}) {
  const spec = fireguardAbility(key);
  return !!spec && typeof sourceUuid === "string" && sourceUuid.length > 0
    && typeof targetUuid === "string" && targetUuid.length > 0 && sourceUuid !== targetUuid
    && sameScene === true && Number.isFinite(distance) && distance >= 0 && distance <= spec.feet;
}
