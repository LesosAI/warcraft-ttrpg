/** Classic attack-power disease, adapted to a flat attack Damage Rating loss; carried as
 *  Carrion palsy until cured (D12). */
export const MAGGOT_SLIME = Object.freeze({ name: "Maggot Slime", action: "half", feet: 5,
  resilience: "body", reduction: 2, uses: 1, per: "short" });

/** Characters keep separate attack/spell lanes. NPCs use a scalar attack bonus;
 * spell laneBonus intentionally ignores that scalar. Final changes preserve
 * derived preparation and apply equally to melee, ranged and natural attacks. */
export function maggotSlimeChanges(type) {
  const key = type === "character" ? "system.damageBonus.attack.all"
    : type === "npc" ? "system.damageBonus" : null;
  return key ? [{ key, type: "subtract", value: String(MAGGOT_SLIME.reduction), phase: "final", priority: 100 }] : [];
}
