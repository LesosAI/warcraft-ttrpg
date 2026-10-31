import { talentEffect } from "./talent-effects.mjs";

export const SECOND_STRIKE = "second-strike";

/** A missed attack may be rolled again once a round, paying the current rank's Rage. */
export function secondStrikeOffer(talents = [], { kind, parry = false, success, pools = [], used = [] } = {}) {
  if (kind !== "attack" || parry || success !== false || used.includes(SECOND_STRIKE)) return null;
  const talent = talents.find(t => t.identifier === SECOND_STRIKE && Number(t.taken) > 0
    && String(t.className).toLowerCase() === "warrior");
  const rule = talent && talentEffect(talent.className, talent.identifier)?.reroll;
  if (!rule) return null;
  const cost = Number(talent.taken) >= 2 ? rule.rank2 : rule.cost;
  const pool = pools.find(p => p.kind === "momentum" && p.name === rule.pool && p.value >= cost);
  return pool ? { identifier: SECOND_STRIKE, name: talent.name, cost, pool } : null;
}
