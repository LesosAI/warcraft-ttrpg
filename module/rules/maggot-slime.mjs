/** Classic attack-power disease, adapted to a flat attack Damage Rating loss. */
export const MAGGOT_SLIME_FLAG = "maggotSlime";
export const MAGGOT_SLIME = Object.freeze({ name: "Maggot Slime", action: "half", feet: 5,
  resilience: "body", reduction: 2, minutes: 30, uses: 1, per: "short" });

/** Characters keep separate attack/spell lanes. NPCs use a scalar attack bonus;
 * spell laneBonus intentionally ignores that scalar. Final changes preserve
 * derived preparation and apply equally to melee, ranged and natural attacks. */
export function maggotSlimeChanges(type) {
  const key = type === "character" ? "system.damageBonus.attack.all"
    : type === "npc" ? "system.damageBonus" : null;
  return key ? [{ key, type: "subtract", value: String(MAGGOT_SLIME.reduction), phase: "final", priority: 100 }] : [];
}

export function maggotSlimeEffect({ type, origin, timing } = {}) {
  const changes = maggotSlimeChanges(type);
  if (!changes.length || typeof origin !== "string" || !origin.trim() || !timing?.duration || !timing?.start) return null;
  return { name: MAGGOT_SLIME.name, img: "icons/svg/biohazard.svg", origin, disabled: false,
    statuses: ["diseased"], system: { changes }, duration: { ...timing.duration }, start: { ...timing.start },
    flags: { "azeroth-rpg": { harmful: true, disease: true, [MAGGOT_SLIME_FLAG]: { version: 1 } } } };
}
