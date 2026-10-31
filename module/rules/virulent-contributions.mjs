/** Tracks only this poison's exposures. Ordinary shedding removes the oldest
 * surviving stack. Withdrawal never promotes a previously capped exposure
 * into a stack or rewinds damage ticks which have already been claimed.
 */
const id = v => typeof v === "string" && v.trim().length > 0;
export function validVirulentLedger(ledger) {
  if (!ledger || !Number.isSafeInteger(ledger.tick) || ledger.tick < 0
    || !Array.isArray(ledger.exposures) || !ledger.exposures.length || !Array.isArray(ledger.stacks)
    || ledger.stacks.length > 3 || new Set(ledger.stacks).size !== ledger.stacks.length) return false;
  const seen = new Set();
  for (const e of ledger.exposures) {
    if (!id(e?.id) || seen.has(e.id) || typeof e.withdrawn !== "boolean" || (e.sourceUuid !== null && !id(e.sourceUuid))
      || !Number.isSafeInteger(e.until) || e.until < 3 || e.until > ledger.tick + 3) return false;
    seen.add(e.id);
  }
  return ledger.stacks.every(key => id(key) && ledger.exposures.some(e => e.id === key && !e.withdrawn));
}
export function virulentTicksLeft(ledger) {
  if (!validVirulentLedger(ledger)) return null;
  return Math.max(0, ...ledger.exposures.filter(e => !e.withdrawn).map(e => e.until - ledger.tick));
}
export function syncVirulentStacks(ledger, value) {
  if (!validVirulentLedger(ledger) || !Number.isInteger(value) || value < 0 || value > ledger.stacks.length) return null;
  return { ...ledger, stacks: ledger.stacks.slice(ledger.stacks.length - value) };
}
export function addVirulentExposure(ledger, hitId, value, sourceUuid = null) {
  if (!id(hitId)) return null;
  if (!ledger) return value === 0 ? { tick: 0, exposures: [{ id: hitId, until: 3, withdrawn: false, sourceUuid }], stacks: [hitId] } : null;
  const current = syncVirulentStacks(ledger, value);
  if (!current || current.exposures.some(e => e.id === hitId)) return null;
  return { ...current, exposures: [...current.exposures, { id: hitId, until: current.tick + 3, withdrawn: false, sourceUuid }],
    stacks: current.stacks.length < 3 ? [...current.stacks, hitId] : current.stacks };
}
export function tickVirulentLedger(ledger, value) {
  const current = syncVirulentStacks(ledger, value);
  return current ? { ...current, tick: current.tick + 1 } : null;
}
export function withdrawVirulentExposure(ledger, hitId, value) {
  const current = syncVirulentStacks(ledger, value);
  if (!current || !current.exposures.some(e => e.id === hitId)) return null;
  const next = { ...current, exposures: current.exposures.map(e => e.id === hitId ? { ...e, withdrawn: true } : e),
    stacks: current.stacks.filter(key => key !== hitId) };
  return { ledger: next, value: next.stacks.length, remaining: virulentTicksLeft(next) };
}
