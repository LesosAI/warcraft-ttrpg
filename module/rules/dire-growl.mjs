/** Adult Diemetradon's physical weakening. Tabletop values, not client scaling. */
export const DIRE_GROWL = Object.freeze({
  name: "Dire Growl", action: "half", feet: 5, dc: 16,
  resilience: "body", uses: 1, per: "short", reduction: 2, floor: 3,
  until: "endOfNextTurn"
});

/** Null ability slots stay absent. Subtract first, then enforce the score floor. */
export function direGrowlChanges(abilities = {}) {
  return ["str", "dex"].flatMap(key => {
    const value = abilities[key]?.value;
    if (!Number.isFinite(value)) return [];
    const path = `system.abilities.${key}.value`;
    return [
      { key: path, type: "subtract", value: String(DIRE_GROWL.reduction), phase: "initial", priority: 20 },
      { key: path, type: "upgrade", value: String(DIRE_GROWL.floor), phase: "initial", priority: 30 }
    ];
  });
}
