/** Plague Cloud: tabletop score reduction; duration and numbers are tabletop adaptations. */
export const PLAGUE_CLOUD = Object.freeze({ name: "Plague Cloud", action: "action", feet: 60, radius: 10,
  dc: 16, resilience: "body", reduction: 2, floor: 3, minutes: 5, uses: 1, per: "short" });
export const PLAGUE_CLOUD_FLAG = "plagueCloud";
const SCORES = Object.freeze(["str", "dex", "int"]);

/** Absent score slots stay absent. The effect changes values before modifiers derive. */
export function plagueCloudChanges(abilities = {}) {
  return SCORES.flatMap(key => {
    if (!Number.isFinite(abilities?.[key]?.value)) return [];
    const path = `system.abilities.${key}.value`;
    return [
      { key: path, type: "subtract", value: String(PLAGUE_CLOUD.reduction), phase: "initial", priority: 20 },
      { key: path, type: "upgrade", value: String(PLAGUE_CLOUD.floor), phase: "initial", priority: 30 }
    ];
  });
}

/** One disease carrier owns both the status and all attribute penalties. */
export function plagueCloudEffect({ abilities, origin, timing } = {}) {
  const changes = plagueCloudChanges(abilities);
  if (!changes.length || typeof origin !== "string" || !origin || !timing?.duration || !timing?.start) return null;
  return { name: PLAGUE_CLOUD.name, img: "icons/svg/biohazard.svg", origin, disabled: false,
    statuses: ["diseased"], system: { changes }, ...timing,
    flags: { "azeroth-rpg": { harmful: true, disease: true, [PLAGUE_CLOUD_FLAG]: { version: 1 } } } };
}
