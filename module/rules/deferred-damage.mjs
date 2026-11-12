/**
 * **DAMAGE PUT OFF TO THE START OF THE NEXT TURN** (07 §12's Dilation, D-866; the plan's
 * Phase 4 door 6, which 04's Borrowed Time, Borrowed Hour and Unmade Wound share in stage
 * 2b). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * *Each time the target takes damage for the duration, it takes half, rounded up, and the
 * other half at the start of its next turn. Damage put off this way is not reduced again
 * and is never put off a second time.*
 *
 * - **The carrier** is the laid effect's `flags.azeroth-rpg.deferral {share, round, by,
 *   source}` (the card's Apply stamps it off the entry's words, `sand-spells.mjs`).
 * - **The step** is in `AzerothActor#applyDamage`, after the blow's own mitigation, the
 *   move, the standing reduction and the division, and before temporary Health: the blow's
 *   amount is split (`splitDeferred`, through `AzerothActor#_deferBlow`, which writes
 *   nothing), the half now goes on, and the half put off is written to the creature's
 *   `flags.azeroth-rpg.deferredDamage` list just before its Health is (`_writeDeferred`),
 *   so a blow refused on the way leaves no row (the 2a review, M2).
 * - **The landing** is at the start of the creature's turn, before that turn's ticks
 *   (`AzerothCombat#_onStartTurn` -> `_landDeferred`, `effects/deferred-damage.mjs
 *   #landDeferred`), and at the fight's end (`_leaveFight`): each row through
 *   `AzerothActor#_landPutOff`, which is `takeStraightDamage` - temporary Health, Mana
 *   Shield and the hold at 1, no Armor, no Ward, no move, no division and no deferral
 *   (the 2a review, M1). Out of a started fight there is no turn to wait for, and the
 *   half lands with the blow (the implementer's reading, for the lead).
 * - **Before the turn's landing** the Guardian holding 04's Unmade Wound is asked once
 *   whether to erase what Borrowed Time put off (`rules/guardian.mjs#unmadeTurnStart`,
 *   O-274 closed by D-880); the fight's-end landing asks nothing. A landing that throws
 *   writes the unlanded tail back (`unlandedTail`).
 */

export const DEFERRAL_FLAG = "deferral";
export const DEFERRED_FLAG = "deferredDamage";

/** The first active deferral a creature's effects carry, or null. */
export function deferralOf(effects = []) {
  for (const e of effects ?? []) {
    if (!e || e.disabled === true || e.active === false) continue;
    const d = e.flags?.["azeroth-rpg"]?.[DEFERRAL_FLAG] ?? null;
    if (d && d.share === "half") return d;
  }
  return null;
}

/**
 * The split of one blow: `now` rounded up, `later` the rest. A blow of 0 puts nothing off.
 *
 * @param {number} amount
 * @param {{share?: string, round?: string}|null} deferral
 * @returns {{now: number, later: number}}
 */
export function splitDeferred(amount, deferral) {
  const a = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!deferral || deferral.share !== "half" || a < 1) return { now: a, later: 0 };
  const now = deferral.round === "down" ? Math.floor(a / 2) : Math.ceil(a / 2);
  return { now, later: a - now };
}

/** The pending list with one more row, `{amount, type, by, source}`. */
export function appendDeferred(list = [], row = {}) {
  const rows = (Array.isArray(list) ? list : []).filter(r => r && typeof r === "object");
  const amount = Math.max(0, Math.trunc(Number(row.amount)) || 0);
  if (amount < 1) return rows;
  return [...rows, { amount, type: typeof row.type === "string" ? row.type : null, by: typeof row.by === "string" ? row.by : null, source: String(row.source ?? "") }];
}

/** The rows still to land, each well formed and above nothing, in the order they were put off. */
export function pendingRows(list = []) {
  return (Array.isArray(list) ? list : [])
    .filter(r => r && typeof r === "object" && (Math.max(0, Math.trunc(Number(r.amount)) || 0) > 0))
    .map(r => ({ ...r, amount: Math.trunc(Number(r.amount)) }));
}

/**
 * **WHAT GOES BACK ON THE LIST WHEN A LANDING THROWS** (the stage 3 fix): the row that threw
 * and every row after it, behind whatever was put off while the landing ran - so a throw
 * mid-landing loses nothing. The row that threw goes back too: a row landed twice is curable
 * and a row lost is not (the shape D-745's split takes).
 *
 * @param {Array} rows     the rows the landing took off the list, in order
 * @param {number} failed  the index of the row whose landing threw
 * @param {Array} now      the list as it stands when the landing threw
 */
export function unlandedTail(rows = [], failed = 0, now = []) {
  const i = Math.max(0, Math.trunc(Number(failed)) || 0);
  return [...pendingRows(now), ...pendingRows(rows).slice(i)];
}

/** Whether a sentence is a deferral's (the tick census leaves it to this door). */
export function isDeferralSentence(sentence) {
  return /\bit takes half, rounded up, and the other half at the start of its next turn\b/.test(String(sentence ?? ""));
}
