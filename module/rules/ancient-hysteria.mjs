/** Classic Intellect/Spirit curse, adapted to Intelligence/Wisdom scores.
 * Wisdom represents resolve here; the system's Spirit Resilience is derived,
 * not a seventh ability. The tabletop penalty and duration are intentional. */
export const ANCIENT_HYSTERIA = Object.freeze({ name: "Ancient Hysteria", action: "action",
  radius: 20, dc: 18, resilience: "spirit", reduction: 4, floor: 3, minutes: 1, uses: 1, per: "short" });
export const ANCIENT_HYSTERIA_FLAG = "ancientHysteria";

export function ancientHysteriaChanges(abilities = {}) {
  return ["int", "wis"].flatMap(key => {
    if (!Number.isFinite(abilities?.[key]?.value)) return [];
    const path = `system.abilities.${key}.value`;
    return [
      { key: path, type: "subtract", value: String(ANCIENT_HYSTERIA.reduction), phase: "initial", priority: 20 },
      { key: path, type: "upgrade", value: String(ANCIENT_HYSTERIA.floor), phase: "initial", priority: 30 }
    ];
  });
}

export function ancientHysteriaEffect({ abilities, origin, timing } = {}) {
  const changes = ancientHysteriaChanges(abilities);
  if (!changes.length || typeof origin !== "string" || !origin.trim() || !timing?.duration || !timing?.start) return null;
  return { name: ANCIENT_HYSTERIA.name, img: "icons/svg/terror.svg", origin, disabled: false,
    statuses: [], system: { changes }, duration: { ...timing.duration }, start: { ...timing.start },
    flags: { "azeroth-rpg": { harmful: true, curse: true, [ANCIENT_HYSTERIA_FLAG]: { version: 1 } } } };
}
