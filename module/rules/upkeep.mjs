/**
 * **A SUSTAIN'S UPKEEP IS THE ENTRY'S OWN, ELSE 1** (D-778; the lead, 2026-10-03,
 * on O-163: *"cost by the entry or 1 Power if not mentioned."*). Pure: no Foundry
 * imports (CLAUDE.md §3).
 *
 * D-628 charged every Sustain 05 §12's *1 Power at the start of each of your
 * turns*, while every one of 07's 76 sustained entries names its own upkeep -
 * *While sustaining this spell you pay 3 Mana at the start of each of your turns*
 * - and two of them in Health: Felfire Aura's *2 Mana and 1 Health*, Felstep's *2
 * Health ... rather than Mana*. So a Hoarfrost was 1 Mana a turn where 07 says 3,
 * and 04's Arcane Concentration (*to a minimum of 1*) and Netherwind had nothing
 * to take off.
 *
 * - `readUpkeep` reads 07's sentence: the Mana, and the Health beside or instead
 *   of it. Null where the entry names none - a talent's or a feature's Sustain -
 *   and that one costs 05's 1 (`UPKEEP_DEFAULT`).
 * - `castSpell` writes the number on the Sustain's entry as the spell is cast (a
 *   record of the moment, D-724), and `upkeepOf` reads it back; an entry written
 *   before this version reads its spell's words where the spell is held, else 1.
 * - `upkeepCost` lays the talents on it (`class-talents.mjs#upkeepFor`): Mana
 *   Shield's and Soul Reaper's *costs no Mana*, Arcane Concentration's *1 less
 *   Mana per rank ... to a minimum of 1*, Netherwind's *reduced by the number of
 *   effects you are Sustaining*. Each takes off the MANA alone; Health is Health.
 * - `rules/turn-effects.mjs#upkeep` charges it: the pool that cast it pays the
 *   Mana, the caster's own Health pays the Health - never below 1 (05, *Spending
 *   Health*: *you may never spend yourself below 1 Health*) - and an entry that
 *   cannot pay all of it ends.
 */

/** 05 §12's upkeep, for a Sustain whose entry names none: 1 Power. */
export const UPKEEP_DEFAULT = Object.freeze({ mana: 1, health: 0 });

/** A whole number from 0. */
const whole = v => Math.max(0, Math.trunc(Number(v)) || 0);

/** HTML to flat text. */
function flat(text) {
  return String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\*\*/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * **THE UPKEEP 07's ENTRY NAMES**, or null where it names none.
 *
 * @param {string} effectText  the entry's effect, HTML or flat
 * @returns {{mana: number, health: number}|null}
 */
export function readUpkeep(effectText) {
  const text = flat(effectText);
  // *While sustaining this spell you pay 2 Mana and 1 Health at the start of each of your turns*
  let m = /\bWhile sustaining this spell you pay (\d+) Mana(?: and (\d+) Health)? at the start of each of your turns\b/.exec(text);
  if (m) return { mana: Number(m[1]), health: m[2] ? Number(m[2]) : 0 };
  // Felstep: *you pay 2 Health at the start of each of your turns rather than Mana*
  m = /\byou pay (\d+) Health at the start of each of your turns rather than Mana\b/.exec(text);
  if (m) return { mana: 0, health: Number(m[1]) };
  return null;
}

/**
 * **WHETHER A SENTENCE IS THE UPKEEP** - 05 §12's, which every sustained entry
 * restates, in Mana, in Mana and Health, or in Health instead: the caster's turn,
 * never a tick (`rules/ticks.mjs`) or an area's (`rules/area-ticks.mjs`).
 *
 * @param {string} sentence
 */
export function isUpkeepSentence(sentence) {
  const s = String(sentence ?? "");
  return /^While sustaining this spell you pay \d+ Mana(?: and \d+ Health)? at the start of each of your turns/i.test(s)
    || /\byou pay \d+ Health at the start of each of your turns rather than Mana\b/i.test(s);
}

/**
 * **ONE SUSTAIN'S UPKEEP BEFORE THE TALENTS**: the number the cast wrote on the
 * entry, else the words of the spell it holds, else 05's 1.
 *
 * @param {{upkeep?: {mana?: number, health?: number}|null}} entry  the actor's `sustaining` entry
 * @param {{effect?: string}|null} [spell]  the held spell's system, where the actor holds it
 * @returns {{mana: number, health: number}}
 */
export function upkeepOf(entry = {}, spell = null) {
  const own = entry?.upkeep;
  if (own && typeof own === "object" && (Number.isFinite(Number(own.mana)) || Number.isFinite(Number(own.health)))) {
    return { mana: whole(own.mana), health: whole(own.health) };
  }
  return readUpkeep(spell?.effect ?? "") ?? { ...UPKEEP_DEFAULT };
}

/**
 * **WHAT ONE SUSTAIN COSTS THIS TURN**, the talents laid on its own upkeep:
 * nothing where a talent holds it free; then Arcane Concentration's rank, never
 * below its minimum by its own hand; then Netherwind's count, to nothing. MY
 * READING, for the lead, of the order: Arcane Concentration's *to a minimum of 1*
 * bounds only its own reduction, and Netherwind names none.
 *
 * @param {{mana?: number, health?: number}} base  `upkeepOf`'s
 * @param {{free?: boolean, less?: number, min?: number, weaveLess?: number}} [reduce]  `upkeepFor`'s
 * @returns {{mana: number, health: number}}
 */
export function upkeepCost(base = UPKEEP_DEFAULT, { free = false, less = 0, min = 1, weaveLess = 0 } = {}) {
  let mana = whole(base?.mana);
  const health = whole(base?.health);
  if (free === true) mana = 0;
  const off = whole(less);
  if (mana > 0 && off > 0) mana = Math.max(Math.min(mana, whole(min)), mana - off);
  const weave = whole(weaveLess);
  if (mana > 0 && weave > 0) mana = Math.max(0, mana - weave);
  return { mana, health };
}

/**
 * **AN UPKEEP AS A SUSTAIN'S ENTRY STORES IT**: whole numbers from 0, or null.
 *
 * @param {unknown} raw
 * @returns {{mana: number, health: number}|null}
 */
export function cleanUpkeep(raw) {
  if (!raw || typeof raw !== "object") return null;
  return { mana: whole(raw.mana), health: whole(raw.health) };
}
