/**
 * Experience. Pure functions, no Foundry imports (CLAUDE.md §3).
 *
 * 02 §9: levels are granted by the GM and XP is a purse you spend (D-508).
 * Nothing here fills a bar toward anything.
 */

/** Ranks run 0 to 15 (D-291). 05 owns the ladder. */
export const RANK_MIN = 0;
export const RANK_MAX = 15;

/** Flat costs from 02 §9. */
export const LANGUAGE_COST = 20;
export const SECOND_CLASS_COST = 600;
export const LEGACY_START_COST = 300;

// A career's advance and change are gone with careers (D-1903): a profession
// rises a tier with the character for nothing (D-1905).

/** Legacy rank 2, 3, 4. Keyed by the rank reached. */
export const LEGACY_RANK_COST = Object.freeze({ 2: 200, 3: 300, 4: 400 });

/**
 * "A Rank costs 10 XP times the Rank you are buying. Outside your profession
 * it costs double." (02 §8, D-1906) — the doubling is what makes a
 * profession's skills worth having.
 *
 * **The gate defaults CLOSED** (D-1906): a caller that names no rate pays
 * double, because a skill nobody named is outside the profession. Every
 * caller passes the membership it read off `professions.mjs#professionSkills`
 * (`AzerothActor#professionSkills`, `creation.mjs#proposalSkills`).
 */
export function rankCost(rank, inProfession = false) {
  const r = Math.trunc(rank);
  if (r < 1 || r > RANK_MAX) return 0;
  return 10 * r * (inProfession === true ? 1 : 2);
}

/**
 * A PROFESSION's own Rank (D-1905): always the cheap rate, 10 × the Rank
 * bought, whatever the skills say. 0 past the ladder's top.
 */
export function professionRankCost(rank) {
  return rankCost(rank, true);
}

/**
 * What it costs to carry a skill from one Rank to another.
 * Cumulative from 0 this is `5 * to * (to + 1)`, which is where 02 §8's
 * landmarks come from: 60 at Rank 3, 210 at 6, 550 at 10, 1,200 at 15.
 */
export function rankCostBetween(from, to, inProfession = false) {
  let total = 0;
  for (let r = Math.max(RANK_MIN, Math.trunc(from)) + 1; r <= Math.min(RANK_MAX, Math.trunc(to)); r++) {
    total += rankCost(r, inProfession);
  }
  return total;
}

/** The purse: earned minus spent. Never a percentage of anything (D-508). */
export function unspent({ earned = 0, spent = 0 } = {}) {
  return Math.max(0, Math.trunc(earned) - Math.trunc(spent));
}

/**
 * Reconcile `system.xp.spent` against the ledger rather than trusting it
 * (D2 §2.4). Returns the ledger's own total so a mismatch is visible.
 */
export function ledgerTotal(entries = []) {
  return entries.reduce((sum, e) => sum + (Math.trunc(e?.amount) || 0), 0);
}
