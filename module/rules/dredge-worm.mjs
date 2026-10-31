/** Dredge Sickness: tabletop score reduction; Classic disease duration retained. */
export const DREDGE_SICKNESS = Object.freeze({ name: "Dredge Sickness", action: "action", feet: 15,
  dc: 17, resilience: "body", reduction: 2, floor: 3, minutes: 5, uses: 1, per: "short" });
export const DREDGE_SICKNESS_FLAG = "dredgeSickness";
const SCORES = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);

/** Absent score slots stay absent. The effect changes values before modifiers derive. */
export function dredgeSicknessChanges(abilities = {}) {
  return SCORES.flatMap(key => {
    if (!Number.isFinite(abilities?.[key]?.value)) return [];
    const path = `system.abilities.${key}.value`;
    return [
      { key: path, type: "subtract", value: String(DREDGE_SICKNESS.reduction), phase: "initial", priority: 20 },
      { key: path, type: "upgrade", value: String(DREDGE_SICKNESS.floor), phase: "initial", priority: 30 }
    ];
  });
}

/** One disease carrier owns both the status and all attribute penalties. */
export function dredgeSicknessEffect({ abilities, origin, timing } = {}) {
  const changes = dredgeSicknessChanges(abilities);
  if (!changes.length || typeof origin !== "string" || !origin || !timing?.duration || !timing?.start) return null;
  return { name: DREDGE_SICKNESS.name, img: "icons/svg/biohazard.svg", origin, disabled: false,
    statuses: ["diseased"], system: { changes }, ...timing,
    flags: { "azeroth-rpg": { harmful: true, disease: true, [DREDGE_SICKNESS_FLAG]: { version: 1 } } } };
}
