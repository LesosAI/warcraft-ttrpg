/**
 * Limited uses (D-612, D-623): what a text grants, when the uses come back,
 * and the stepper's arithmetic. Pure: no Foundry imports, so the chapter
 * parsers and the race grant read the same grammar the sheet does.
 */

const COUNTS = { once: 1, twice: 2, "three times": 3, "four times": 4, "five times": 5 };

/**
 * `{max, per}` from a sentence, or null where the text grants no limited
 * use. The book's phrasings: "Once per encounter", "once per combat", "Once
 * per Short Rest", "Once per Long Rest", "once between Long Rests", "once
 * between Short Rests", "once a day", and "twice" or "N times" before any of
 * them. "Once a round" and "once per turn" are not rest-bounded and return
 * null.
 *
 * **BOTH RESTS TAKE THE PLURAL.** `long rests?` carried one and `short rest`
 * did not, so *once between Long Rests* read and *once between Short Rests*
 * did not — and the Field Surgeon's Signature, which is the one career the
 * book writes that way, came back unlimited (D-692). Nothing a parser stamps
 * moved with the fix: the four texts it newly reads are that Signature and
 * three spells, and no spell's uses are read from its prose.
 *
 * @param {string} text  Plain or HTML.
 * @returns {{max: number, per: "short"|"long"|"encounter"}|null}
 */
export function usesFromText(text = "") {
  const plain = String(text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const m = /\b(once|twice|three times|four times|five times|(\d+) times)\s+(?:per|a|each|between)\s+(encounter|combat|fight|short rests?|long rests?|day)\b/i.exec(plain);
  if (!m) return null;
  const max = m[2] ? Number(m[2]) : (COUNTS[m[1].toLowerCase()] ?? 1);
  const period = m[3].toLowerCase();
  const per = /encounter|combat|fight/.test(period) ? "encounter" : /short/.test(period) ? "short" : "long";
  return { max, per };
}

/** The uses a text stamps on a fresh document: full, or unlimited. */
export function usesStamp(text = "") {
  const u = usesFromText(text);
  return u ? { value: u.max, max: u.max, per: u.per } : { value: 0, max: 0, per: null };
}

/**
 * Does a rest or an encounter's end restore these uses? The hierarchy is the
 * book's: a Long Rest includes a Short Rest, and both end whatever encounter
 * was running.
 */
export function refreshes(per, event) {
  if (!per) return false;
  if (event === "long") return true;
  if (event === "short") return per === "short" || per === "encounter";
  if (event === "encounter") return per === "encounter";
  return false;
}

/**
 * **THE USES IN HAND WHEN A FEATURE'S MAXIMUM MOVES** (D-621's restamp; the
 * Paladin phase's review, S4). A limit that rises mid-day gives its new use
 * NOW and one that falls takes a use away - the difference in the maximum is
 * added to what is in hand, floored at 0 and capped at the new maximum. So
 * Open Hand taken on a day Lay on Hands has not been used makes it 2 of 2, and
 * taken back after one use leaves 0 of 1: the spent use is not handed back.
 * Clamping to the new maximum alone read 1 of 2 until a Long Rest and gave the
 * spent use back.
 *
 * A feature newly limited (no maximum before) starts full, as the sync always
 * stamped it; an unchanged maximum keeps what is in hand, so the world-load
 * restamp of a feature whose table did not move writes nothing.
 *
 * @param {{value?: number, max?: number}} held  the stored uses
 * @param {number} max  the new maximum
 * @returns {number}
 */
export function usesAfterRestamp(held = {}, max = 0) {
  const next = Math.max(0, Math.trunc(Number(max)) || 0);
  const was = Math.max(0, Math.trunc(Number(held?.max)) || 0);
  if (was === 0) return next;
  const value = Math.trunc(Number(held?.value));
  const inHand = Number.isFinite(value) ? value : was;
  return Math.max(0, Math.min(next, inHand + (next - was)));
}

/** The stepper's arithmetic: one up or down, never below 0 or past the maximum. */
export function stepUses(uses = {}, delta = 0) {
  const max = Math.max(0, Math.trunc(Number(uses.max) || 0));
  const value = Math.trunc(Number(uses.value) || 0) + (Math.trunc(Number(delta)) || 0);
  return Math.max(0, Math.min(max, value));
}
