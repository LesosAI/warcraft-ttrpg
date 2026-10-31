import { sentinelThornsHit as meleeHit } from "./sentinel-thorns.mjs";

/** Tabletop adaptation of Classic spell 13578: temporary armor and a Fire
 * damage shield. This is not Fire Shield's Fire Ward. */
export const JADEFIRE = Object.freeze({ name: "Jadefire", action: "half",
  power: 2, uses: 1, per: "short", armor: 2, damage: 3, school: "fire", seconds: 12 });

/** Only locations the creature actually has receive armor. */
export function jadefireArmor(ap = {}) {
  return ["body", "head", "limb"].filter(location => Number.isFinite(ap[location]) && ap[location] >= 0)
    .map(location => ({ key: `system.ap.${location}`, value: JADEFIRE.armor }));
}

export function jadefireActive({ disabled = false, suppressed = false, startedAt, now } = {}) {
  return !disabled && !suppressed && Number.isFinite(startedAt) && Number.isFinite(now)
    && now >= startedAt && now < startedAt + JADEFIRE.seconds;
}

/** Shares the existing melee-hit law: armor absorption still counts as a
 * hit; spells, withdrawn damage, parries and retaliation cannot recurse. */
export function jadefireRetaliation({ state, hit } = {}) {
  return jadefireActive(state) && meleeHit(hit) ? { rating: JADEFIRE.damage, school: JADEFIRE.school } : null;
}
