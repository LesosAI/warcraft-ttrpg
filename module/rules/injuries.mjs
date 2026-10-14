/**
 * What a Critical Injury result puts on a character, read off the table's
 * own text (06 §8). Pure: no Foundry.
 *
 * A result names conditions in the book's words - **Bleeding 1**, Slowed,
 * Silenced, Numbed - and Fatigue as a count. The card's Suffer button reads
 * them here and applies them, and a Speed reduction - "Speed reduced by
 * 10 feet" - as a number the effect carries (D-621). What it cannot read
 * (a limb useless until treated) stays on the effect as text for the
 * table to honour.
 */

import { AZEROTH } from "../config.mjs";

/**
 * @param {string} text  The result's name and description, plain or HTML.
 * @returns {{conditions: Array<{id: string, value?: number}>, fatigue: number, speed: number, nextTurn: boolean}}
 */
export function injuryConditions(text = "") {
  const plain = String(text).replace(/<[^>]+>/g, " ");
  const conditions = [];
  const seen = new Set();

  // The two valued conditions carry their number: "Bleeding 2".
  for (const id of AZEROTH.valuedConditions) {
    const re = new RegExp(`\\b${id}\\s+(\\d+)`, "i");
    const m = plain.match(re);
    if (m) {
      conditions.push({ id, value: Number(m[1]) });
      seen.add(id);
    }
  }
  // The rest are named as words. "Fatigue" is a track, not the condition;
  // only the word "Fatigued" is the condition.
  for (const id of Object.keys(AZEROTH.conditions)) {
    if (seen.has(id)) continue;
    const re = new RegExp(`\\b${id}\\b`, "i");
    if (re.test(plain)) {
      conditions.push({ id });
      seen.add(id);
    }
  }
  // "1 Fatigue", "2 Fatigue" - points on the track.
  const fatigue = plain.match(/\b(\d+)\s+Fatigue\b/i);
  // "Speed reduced by 10 feet" (Torn muscle, Crippled): negative, or zero.
  const reduced = /Speed reduced by (\d+) feet/i.exec(plain);
  const speed = reduced ? -Number(reduced[1]) : 0;

  // "until the end of your next turn" (Winded, Numbed): the conditions named
  // carry that duration and expire on their own (D-628).
  const nextTurn = /until the end of your next turn/i.test(plain);

  return { conditions, fatigue: fatigue ? Number(fatigue[1]) : 0, speed, nextTurn };
}
