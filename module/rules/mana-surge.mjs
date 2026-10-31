/** Classic Shock 11824 is direct Nature damage, not Mana drain or Earth Shock.
 * These are explicit tabletop values; Lightning Bolt uses the existing spell.
 */
export const MANA_SHOCK = Object.freeze({ name: "Surge Shock", action: "half",
  feet: 30, mana: 2, damage: 6, damageType: "nature", dc: 16, resilience: "reflex" });
