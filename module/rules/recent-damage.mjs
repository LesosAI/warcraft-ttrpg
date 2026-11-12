/**
 * **THE DAMAGE A CREATURE HAS TAKEN SINCE THE START OF YOUR LAST TURN** (07 §12's Mending
 * Sands and Sands Run Back, D-867; the lead's *"Sands Run Back: reaction, fix
 * nomenclature"*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * *The target regains Health equal to the damage it has taken since the start of your
 * last turn, to no more than 6.* Nothing in the system remembered a blow once its Health
 * was written, so the damage door now keeps a short **ledger** on the creature
 * (`flags.azeroth-rpg.damageLedger`): one row a write that took Health or temporary
 * Health, stamped with the fight's round and turn where there is one and the world's
 * clock always (`AzerothActor#adjustHealth`, in the same update as the Health).
 *
 * **The caster's last turn start** is read off the fight the CASTER is in: this round at
 * the caster's place in the order where that place has already PASSED, else the round
 * before - so a caster casting on their OWN turn reads the turn before this one, a round
 * back (the sweep's stage 2, D-891: read as *this* turn, Mending Sands - an Action, cast on
 * the caster's own turn - healed only what was taken since the turn began, which is
 * nothing, and every play-test cast regained 0). Out of a fight there are no turns: the
 * last round of the world's clock, 05's six seconds, stands in for it (the implementer's
 * reading, for the lead).
 */

export const LEDGER_FLAG = "damageLedger";

/** How many rows the ledger keeps: more than a round's worth of blows on one creature. */
export const LEDGER_MAX = 16;

/** 05's *Round - ~6 seconds*. */
const ROUND_SECONDS = 6;

/**
 * The stamp of now.
 *
 * @param {{combatId?: string|null, round?: number|null, turn?: number|null, time?: number}} o
 */
export function ledgerStamp({ combatId = null, round = null, turn = null, time = 0 } = {}) {
  const n = v => (Number.isFinite(Number(v)) && v !== null ? Math.trunc(Number(v)) : null);
  return { combatId: combatId || null, round: n(round), turn: n(turn), time: Number(time) || 0 };
}

/**
 * The ledger with one more row, oldest dropped past `LEDGER_MAX`, and rows older than two
 * minutes of the world's clock gone (no turn reaches back that far).
 *
 * @param {Array<object>} list
 * @param {number} amount
 * @param {object} stamp  `ledgerStamp`
 */
export function appendLedger(list = [], amount = 0, stamp = {}) {
  const a = Math.max(0, Math.trunc(Number(amount)) || 0);
  const rows = (Array.isArray(list) ? list : []).filter(r => r && typeof r === "object");
  const now = Number(stamp?.time) || 0;
  const kept = rows.filter(r => now - (Number(r.time) || 0) <= 120);
  if (a > 0) kept.push({ amount: a, ...ledgerStamp(stamp) });
  return kept.slice(-LEDGER_MAX);
}

/**
 * Where the caster's last turn started, in the caster's fight: `{combatId, round, turn}`,
 * or null out of a started fight.
 *
 * @param {{combatId?: string|null, round?: number, turn?: number, casterTurn?: number|null}} o
 *   `turn` the fight's current turn index, `casterTurn` the caster's index in the order
 */
export function lastTurnStart({ combatId = null, round = null, turn = null, casterTurn = null } = {}) {
  if (!combatId || !Number.isInteger(round) || !Number.isInteger(turn) || !Number.isInteger(casterTurn)) return null;
  return casterTurn < turn ? { combatId, round, turn: casterTurn } : { combatId, round: round - 1, turn: casterTurn };
}

/**
 * **THE DAMAGE TAKEN SINCE**: the ledger's rows at or after `since` in that fight, or,
 * out of a fight (`since` null), within the last round of the world's clock.
 *
 * @param {Array<object>} list
 * @param {{combatId: string, round: number, turn: number}|null} since
 * @param {{time?: number}} [o]
 */
export function damageSince(list = [], since = null, { time = 0 } = {}) {
  const rows = Array.isArray(list) ? list : [];
  const at = r => (since ? (r.combatId === since.combatId
    && (Number(r.round) > since.round || (Number(r.round) === since.round && Number(r.turn) >= since.turn)))
    : (Number(time) || 0) - (Number(r.time) || 0) <= ROUND_SECONDS);
  return rows.filter(r => r && at(r)).reduce((n, r) => n + (Math.max(0, Math.trunc(Number(r.amount)) || 0)), 0);
}

/**
 * The heal 07 writes as *Health equal to the damage it has (they have) taken since the
 * start of your last turn, to no more than N (each)*: `{cap}`, or null.
 *
 * @param {string} effectText
 */
export function readRecentHeal(effectText) {
  const text = String(effectText ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  const m = /\bregains? Health equal to the damage (?:it has|they have) taken since the start of your last turn, to no more than (\d+)/.exec(text);
  return m ? { cap: Number(m[1]) } : null;
}

/** What one creature regains: its damage since, to no more than the cap. */
export function recentHealFor(list, since, { cap = 0, time = 0 } = {}) {
  return Math.min(Math.max(0, Math.trunc(Number(cap)) || 0), damageSince(list, since, { time }));
}
