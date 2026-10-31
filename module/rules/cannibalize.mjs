/** 02: a taken Forsaken talent grants one additional tier of Health at a
 * Short Rest when a corpse is eaten. Corpse availability is a table choice. */
export function canCannibalize(talents = []) {
  return talents.some(t => String(t.race ?? "").toLowerCase() === "forsaken"
    && t.identifier === "cannibalize" && Number(t.taken) > 0);
}

/** Apply after ordinary rest recovery so the displayed gain respects the cap. */
export function cannibalizeRecovery({ talents = [], corpseEaten = false, tier = 1,
  health = 0, max = 0 } = {}) {
  const amount = corpseEaten === true && canCannibalize(talents)
    ? Math.min(Math.max(0, max - health), Math.max(0, Math.trunc(Number(tier)) || 0)) : 0;
  return { health: health + amount, amount };
}
