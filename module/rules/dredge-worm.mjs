/** Dredge Sickness: tabletop score reduction. Carried until cured (D12): the carrier is
 *  `rules/afflictions.mjs#DISEASES.dredgeSickness`, laid by `effects/creature-diseases.mjs`. */
export const DREDGE_SICKNESS = Object.freeze({ name: "Dredge Sickness", action: "action", feet: 15,
  dc: 17, resilience: "body", reduction: 2, floor: 3, uses: 1, per: "short" });
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
