/** Rank 1 must act before reveal; rank 2 may act in either window.
 * Missing reveal metadata cannot establish an unrevealed historical attack. */
export function foresightTimingAllows(rank, damageRevealed) {
  return Number.isInteger(rank) && rank >= 1 && (rank >= 2 || damageRevealed === false);
}
