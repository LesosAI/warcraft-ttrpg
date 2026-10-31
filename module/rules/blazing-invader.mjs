/** Tabletop adaptations of Classic spells 23113 and 11968. */
export const BLAZING_ABILITIES = Object.freeze({
  "Blazing Wave": Object.freeze({ name: "Blazing Wave", action: "action", mana: 3,
    radius: 10, rating: 6, school: "fire", resilience: "reflex", dc: 17,
    uses: Object.freeze({ max: 1, per: "short" }) }),
  "Searing Pulse": Object.freeze({ name: "Searing Pulse", action: "action", mana: 2,
    radius: 5, rating: 3, school: "fire", resilience: null, dc: null, uses: null }),
  "Felguard Blast Wave": Object.freeze({ name: "Felguard Blast Wave", action: "action", mana: 3,
    radius: 10, rating: 6, school: "fire", resilience: "reflex", dc: 17, uses: null,
    sourceExpiry: true })
});

/** This is pre-mitigation damage. Fire defenses do not cancel the slow. */
export function blazingOutcome(name, passed = null) {
  if (["Blazing Wave", "Felguard Blast Wave"].includes(name) && typeof passed === "boolean") {
    return { rating: passed ? 3 : 6, school: "fire", slow: !passed };
  }
  if (name === "Searing Pulse" && passed === null) {
    return { rating: 3, school: "fire", slow: false };
  }
  return null;
}
