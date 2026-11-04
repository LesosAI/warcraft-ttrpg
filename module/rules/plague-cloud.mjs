/** Plague Cloud: tabletop score reduction. Carried as Scarab fever until cured (D12). */
export const PLAGUE_CLOUD = Object.freeze({ name: "Plague Cloud", action: "action", feet: 60, radius: 10,
  dc: 16, resilience: "body", reduction: 2, floor: 3, uses: 1, per: "short" });
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
