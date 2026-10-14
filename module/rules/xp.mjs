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
export const CAREER_CHANGE_COST = 100;
export const SECOND_CLASS_COST = 600;
export const LEGACY_START_COST = 300;

/** Career advance, tier 1 to 2, 2 to 3, 3 to 4. Keyed by the tier reached. */
export const CAREER_ADVANCE_COST = Object.freeze({ 2: 200, 3: 300, 4: 400 });

/** Legacy rank 2, 3, 4. Keyed by the rank reached. */
export const LEGACY_RANK_COST = Object.freeze({ 2: 200, 3: 300, 4: 400 });

/**
 * "A Rank costs 10 XP times the Rank you are buying. Outside your career it
 * costs double." (02 §8) — the doubling is what makes a career's In-career
 * list worth having.
 */
export function rankCost(rank, inCareer = true) {
  const r = Math.trunc(rank);
  if (r < 1 || r > RANK_MAX) return 0;
  return 10 * r * (inCareer ? 1 : 2);
}

/**
 * What it costs to carry a skill from one Rank to another.
 * Cumulative from 0 this is `5 * to * (to + 1)`, which is where 02 §8's
 * landmarks come from: 60 at Rank 3, 210 at 6, 550 at 10, 1,200 at 15.
 */
export function rankCostBetween(from, to, inCareer = true) {
  let total = 0;
  for (let r = Math.max(RANK_MIN, Math.trunc(from)) + 1; r <= Math.min(RANK_MAX, Math.trunc(to)); r++) {
    total += rankCost(r, inCareer);
  }
  return total;
}

/** Career advancement gates (03 §3): the XP and the Ranks it also asks for. */
export const CAREER_GATE = Object.freeze({
  2: { xp: 200, ranks: 1, atRank: 3 },
  3: { xp: 300, ranks: 2, atRank: 6 },
  4: { xp: 400, ranks: 3, atRank: 10 }
});

/**
 * Whether a character may advance to a career tier. `inCareerRanks` is the
 * list of Ranks they hold in that career's In-career skills.
 */
export function canAdvanceCareer({ toTier, xpAvailable = 0, inCareerRanks = [] } = {}) {
  const gate = CAREER_GATE[toTier];
  if (!gate) return { ok: false, reason: "no such career tier" };
  if (xpAvailable < gate.xp) return { ok: false, reason: `needs ${gate.xp} XP` };
  const qualifying = inCareerRanks.filter(r => r >= gate.atRank).length;
  if (qualifying < gate.ranks) {
    return { ok: false, reason: `needs ${gate.ranks} in-career skill(s) at Rank ${gate.atRank}` };
  }
  return { ok: true, reason: null };
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
