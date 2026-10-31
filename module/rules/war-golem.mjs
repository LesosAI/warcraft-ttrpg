/** Heavy War Golem's two Classic attacks, with explicit tabletop values.
 * Physical damage is halved before armor. Stomp's push is resolved separately
 * through the wall-aware movement door, never by changing coordinates here.
 */
export const WAR_GOLEM_ATTACKS = Object.freeze({
  stomp: Object.freeze({ name: "Golem Stomp", action: "action", radius: 10,
    damage: 7, damageType: "physical", dc: 17, resilience: "reflex",
    push: 10, uses: 1, per: "short" }),
  trample: Object.freeze({ name: "Golem Trample", action: "action", radius: 5,
    damage: 9, damageType: "physical", dc: 17, resilience: "reflex",
    push: 0, uses: 1, per: "short" })
});

/** Only explicit keys select an attack, including with untrusted query input. */
export function warGolemAttack(key) {
  return typeof key === "string" && Object.hasOwn(WAR_GOLEM_ATTACKS, key)
    ? WAR_GOLEM_ATTACKS[key] : null;
}

/** One resolution per reviewed enemy actor within the selected attack's area. */
export function warGolemTargets(key, sourceUuid, candidates = []) {
  const attack = warGolemAttack(key);
  if (!attack || typeof sourceUuid !== "string" || !sourceUuid || !Array.isArray(candidates)) return [];
  const seen = new Set([sourceUuid]);
  return candidates.filter(row => {
    if (typeof row?.actorUuid !== "string" || !row.actorUuid || seen.has(row.actorUuid)
      || row.enemy !== true || !Number.isFinite(row.distance)
      || row.distance < 0 || row.distance > attack.radius) return false;
    seen.add(row.actorUuid);
    return true;
  });
}

/** Resistance prevents displacement even when half damage remains. */
export function warGolemOutcome(key, resisted) {
  const attack = warGolemAttack(key);
  if (!attack || typeof resisted !== "boolean") return null;
  return { rating: resisted ? Math.floor(attack.damage / 2) : attack.damage,
    damageType: attack.damageType, push: resisted ? 0 : attack.push };
}
