/**
 * **A WORLD-CLOCK CATCH-UP STOPS AT A CREATURE THAT IS DOWN** (D12 R4, the review).
 *
 * The four creature-poison advancers (`effects/dredge-poison.mjs`, `virulent-poison.mjs`,
 * `toxic-horror.mjs`, `vekniss.mjs`) land every hour a long jump owes, one awaited write set
 * for each hour. A target at 0 Health can take nothing more from a tick, so the loop
 * stops there: a year-long jump over a creature that fell on the first hour costs one
 * hour's writes, not 8,760. Pure: it reads a plain actor-like object.
 *
 * Each tick is still mitigated by Ward on its own (Virulent Poison says so), so the hours
 * are not summed into one blow; the bound is what keeps the loop short.
 */

/**
 * Whether the target holds no Health to lose: its Health is 0 or below.
 * @param {{system?: {health?: {value?: number}}}|null} actor
 */
export function downedTarget(actor) {
  const value = actor?.system?.health?.value;
  return typeof value === "number" && Number.isFinite(value) && value <= 0;
}
