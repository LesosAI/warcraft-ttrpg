/** Infernal's authored area abilities. All distances and turn identity come
 * from the runtime; no client-supplied scene selection is authoritative.
 */
export const INFERNAL = Object.freeze({
  arrival: Object.freeze({ name: "Arrival", radius: 15, damage: 6, dc: 15, resilience: "reflex" }),
  immolation: Object.freeze({ name: "Immolation", radius: 10, damage: 3, school: "fire", when: "turnStart" })
});
const id = value => typeof value === "string" && value.trim().length > 0;

export function isInfernalArrival(ability) {
  const text = String(ability?.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const a = ability?.automation;
  return ability?.name === INFERNAL.arrival.name
    && text === "An infernal enters a fight by falling into it. Every creature within 15 feet of where it lands takes 6 damage and is knocked Prone , or half and neither on a Resilience (Reflex) Test at DC 15."
    && a?.damage?.amount === 6 && a.damage.type == null && a.damage.half === true
    && a.dc === 15 && a.resist === "reflex" && a.action == null
    && a.inflicts?.condition === "prone" && a.inflicts.onFail === true;
}

/** Do not apply the Infernal's numbers to a different ability sharing a name.
 * The current pack has no dedicated area descriptor, so verify its whole rule.
 */
export function isInfernalImmolation(ability) {
  const text = String(ability?.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return ability?.name === INFERNAL.immolation.name
    && text === "A creature that begins its turn within 10 feet takes 3 Fire damage."
    && ability.automation?.damage?.amount === INFERNAL.immolation.damage
    && ability.automation.damage.type === INFERNAL.immolation.school
    && ability.automation.action == null && ability.automation.resist == null;
}

/** Arrival's successful Test halves damage and prevents Prone. Mitigation
 * applies afterward through the ordinary damage pipeline, not here.
 */
export function infernalArrivalOutcome({ resisted, proneImmune = false, dealtHalved = false } = {}) {
  if (typeof resisted !== "boolean") return null;
  const rating = dealtHalved === true ? Math.floor(INFERNAL.arrival.damage / 2) : INFERNAL.arrival.damage;
  return { damage: resisted ? Math.floor(rating / 2) : rating,
    prone: !resisted && proneImmune !== true };
}

/** Capture an arrival once per physical source in a fight. The runtime supplies
 * all physically present scene creatures and their measured landing distances.
 * Never substitute the user's selected targets or remeasure after the landing.
 * Unknown geometry refuses the whole capture rather than silently omitting a
 * potential victim. The combat ledger must retain even interrupted claims.
 */
export function infernalArrivalPlan({ combatUuid, sourceTokenUuid, sceneId, levelId,
  started, sourceStanding, landing, creatures, previous = [] } = {}) {
  if (![combatUuid, sourceTokenUuid, sceneId, levelId].every(id)
    || started !== true || sourceStanding !== true
    || !landing || ![landing.x, landing.y, landing.elevation].every(Number.isFinite)
    || !Array.isArray(creatures) || !Array.isArray(previous)) return null;
  const key = JSON.stringify([combatUuid, sourceTokenUuid]);
  if (previous.some(row => row?.key === key)) return null;
  const seen = new Set(), targets = [];
  for (const creature of creatures) {
    if (!creature || ![creature.tokenUuid, creature.actorUuid, creature.sceneId, creature.levelId].every(id)
      || seen.has(creature.tokenUuid)) return null;
    seen.add(creature.tokenUuid);
    if (creature.sceneId !== sceneId || creature.levelId !== levelId) continue;
    if (!Number.isFinite(creature.distance) || creature.distance < 0) return null;
    if (creature.distance <= INFERNAL.arrival.radius) targets.push({
      tokenUuid: creature.tokenUuid, actorUuid: creature.actorUuid, distance: creature.distance
    });
  }
  return { key, sourceTokenUuid, sceneId, levelId,
    landing: { x: landing.x, y: landing.y, elevation: landing.elevation },
    targets, stage: "captured" };
}

/** No hostility test, saving throw, action payment or exclusion of the source.
 * Fire immunity/Ward are applied by the shared damage pipeline. A turn is not
 * synthesized from elapsed world time, and an uncertain prior delivery must
 * not be retried as a new pulse. Each physical Infernal has its own source key.
 */
export function infernalImmolationPulse({ combatUuid, combatantId, sourceTokenUuid, targetTokenUuid,
  round, turn, sourceStanding, sameLevel, distance, previous = [] } = {}) {
  if (![combatUuid, combatantId, sourceTokenUuid, targetTokenUuid].every(id)
    || !Number.isSafeInteger(round) || round < 1 || !Number.isSafeInteger(turn) || turn < 0
    || sourceStanding !== true || sameLevel !== true || !Number.isFinite(distance) || distance < 0
    || distance > INFERNAL.immolation.radius || !Array.isArray(previous)) return null;
  const key = JSON.stringify([combatUuid, combatantId, round, turn, sourceTokenUuid, targetTokenUuid]);
  if (previous.some(row => row?.key === key)) return null;
  return { key, sourceTokenUuid, targetTokenUuid, damage: INFERNAL.immolation.damage,
    school: INFERNAL.immolation.school, stage: "applying" };
}
