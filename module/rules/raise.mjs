/**
 * **A DEATH THAT RAISES A SUMMON** (the Legacy branches' door 5). Pure: no Foundry
 * imports (CLAUDE.md §3).
 *
 * 04's Dark Minion: *When a creature hit by your **Black Arrow** drops to 0 Health
 * before the end of your next turn, it rises as a **Risen Skeleton** that acts on
 * your Initiative until the encounter ends. You may control one per rank.*
 *
 * - **"Hit by your Black Arrow ... before the end of your next turn"** is the mark
 *   Black Arrow's hit already lays: *recovers no Health until the end of your next
 *   turn* (B1's `noHealing` rider, `effects/no-healing.mjs`), an effect on the
 *   creature whose `origin` is the archer, whose flag names the talent by name, and
 *   whose span is the archer's next turn's end. A creature still carrying it when
 *   it drops is one hit inside the window; one whose mark core has expired is not.
 *   MY READING, for the lead: the mark IS the window, so a creature healed past the
 *   mark (it recovers none while marked) or one the archer marked again counts the
 *   latest mark.
 * - **"It rises as a Risen Skeleton"**: 14's own entry, bound to the archer as a
 *   summon until the encounter ends (D-643's `bind`, kind `summon`), its token
 *   placed where the creature fell (door 4). The fallen creature's own token is
 *   left as the table's to clear.
 * - **"You may control one per rank"**: a creature past the count does not rise, and
 *   the card says so.
 *
 * The row (`raise {from, entry, until, count}`) is the OWNER's: `from` is the
 * identifier of the talent whose mark raises (Black Arrow), and the mark is matched
 * by that talent's NAME, which is what the mark carries.
 */

import { evaluateExpression } from "./expressions.mjs";
import { talentEffect } from "./talent-effects.mjs";

/** How long a raised creature stays: the encounter (*until the encounter ends*). */
export const RAISE_UNTIL = Object.freeze(["encounter"]);

/** A taken talent's rank, a whole number from 1. */
const rankOf = talent => Math.max(1, Math.trunc(Number(talent?.taken) || 0));

/**
 * **THE RAISES A CHARACTER'S TALENTS GIVE**, at the rank: each row's mark-giving
 * talent (by identifier, and by the name its mark carries), the 14 entry it raises,
 * how long it stays and how many it may control. A row whose `from` names a talent
 * the character has not taken raises nothing - the mark can only be laid by it.
 *
 * @param {Array<{identifier: string, className?: string, race?: string|null, name: string, taken: number}>} talents
 * @param {Function} [rowOf]
 * @returns {Array<{identifier: string, name: string, from: string, fromName: string, entry: string, until: string, count: number}>}
 */
export function raiseRowsFor(talents = [], rowOf = talentEffect) {
  const out = [];
  const taken = (talents ?? []).filter(t => (Math.trunc(Number(t?.taken)) || 0) > 0);
  for (const t of taken) {
    const row = rowOf(t.className, t.identifier, t.race ?? null)?.raise ?? null;
    if (!row || typeof row !== "object" || !row.entry || !row.from) continue;
    const source = taken.find(s => s.identifier === row.from) ?? null;
    if (!source) continue;
    const rank = rankOf(t);
    const n = typeof row.count === "number" ? row.count : evaluateExpression(String(row.count ?? "rank"), { rank });
    const count = Math.max(0, Math.trunc(Number(n)) || 0);
    if (count < 1) continue;
    out.push({
      identifier: t.identifier, name: t.name, from: row.from, fromName: source.name,
      entry: String(row.entry), until: RAISE_UNTIL.includes(row.until) ? row.until : "encounter", count
    });
  }
  return out.sort((a, b) => a.identifier.localeCompare(b.identifier));
}

/**
 * **WHICH OF AN OWNER'S RAISES A FALLEN CREATURE ANSWERS TO**: the first row whose
 * mark-giving talent laid a mark the creature still carries, by that owner.
 *
 * @param {Array<{origin?: string|null, source?: string, active?: boolean}>} marks
 *   the fallen creature's no-healing marks, as plain data
 * @param {string} ownerUuid
 * @param {ReturnType<typeof raiseRowsFor>} rows  the OWNER's
 * @returns {object|null}  the row
 */
export function raiseFor(marks = [], ownerUuid = null, rows = []) {
  if (!ownerUuid) return null;
  const by = (marks ?? []).filter(m => m && m.active !== false && m.origin === ownerUuid).map(m => String(m.source ?? ""));
  return (rows ?? []).find(r => by.includes(r.fromName)) ?? null;
}

/**
 * Whether one more rises: the owner controls fewer than the count. A lang key for
 * the refusal, or null.
 *
 * @param {{held?: number, count?: number}} o
 * @returns {string|null}
 */
export function raiseRefusal({ held = 0, count = 0 } = {}) {
  return (Math.trunc(Number(held)) || 0) >= (Math.trunc(Number(count)) || 0) ? "AZEROTH.Raise.Full" : null;
}

/**
 * **THE OWNERS A FALLEN CREATURE'S MARKS NAME**: the distinct origins of its active
 * no-healing marks, sorted - the archers whose rows the door asks.
 *
 * @param {Array<{origin?: string|null, active?: boolean}>} marks
 * @returns {string[]}
 */
export function markOwners(marks = []) {
  return [...new Set((marks ?? []).filter(m => m && m.active !== false && typeof m.origin === "string" && m.origin).map(m => m.origin))].sort();
}
