/** Elder Diemetradon adaptations; ordinary bite resolution owns each strike. */
export const ELDER_THRASH = Object.freeze({ name: "Elder Thrash", action: "action", strikes: 3, feet: 5, uses: 1, per: "short" });
export const ELDER_PUMMEL = Object.freeze({ name: "Pummel", action: "reaction", feet: 5, uses: 1, per: "short", testKind: "casting", banes: 2 });

/** Read the held Bite row, never silently fall back to another attack. */
export function elderThrashPlan(attacks = []) {
  if (!Array.isArray(attacks)) return null;
  const index = attacks.findIndex(a => String(a?.name ?? "").trim().toLowerCase() === "bite");
  if (index < 0) return null;
  const attack = attacks[index];
  if (!Number.isFinite(attack.bonus) || !Number.isFinite(attack.damage) || attack.damage < 0) return null;
  return { index, strikes: ELDER_THRASH.strikes, action: ELDER_THRASH.action,
    // Each call is one paid-for strike, even if a GM later adds Extra Attack.
    options: { budget: "none", singleAttack: true } };
}
