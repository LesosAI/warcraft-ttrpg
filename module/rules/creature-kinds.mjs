/**
 * WHAT A CREATURE IS, for a rule that says *undead*, *fel* or *a demon*
 * (D-753; the lead, 2026-09-25). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The book reads the two words off different lines of a block, and D-753 is
 * the table that says which:
 *
 * | Word        | Reads |
 * |-------------|-------|
 * | **undead**  | a creature whose TYPE is Undead (14 §1: the type *is what
 * |             | spells and features read*); a character of the **Forsaken**
 * |             | people (02 §5); a character who has become **The Risen**
 * |             | (10 §9: the Undeath track at 20) |
 * | **fel**     | a creature whose identity line carries a **Corruption** entry
 * |             | of Fel (14 §1: it *names the track the creature exposes*); a
 * |             | character who has become **The Fel-touched** (10 §9) |
 * | **a demon** | a creature whose TYPE is Demon, and only where a rule says
 * |             | *a demon* - Hallowed Ground, Doomfire, Nether Collapse |
 *
 * **Not every Demon is fel** (the Voidwalker's Corruption is Void), **not
 * everything fel is a Demon** (the Satyr is a Humanoid), **exposing Undeath
 * does not make a creature undead** (the Plague Bat is a Beast), and **the
 * rung is not the ending**: Undeath's 15 is *Risen in all but name*, and the
 * word applies at 20, where 10 §9 says the track is gone. The ending is read
 * off `corruption-effects.mjs#rungsInForce`, which is 10 §9's own table, so a
 * renamed ending cannot leave this reading behind in silence.
 *
 * `kindsOf` is what an area's tick asks (`rules/area-ticks.mjs#tickFor`,
 * D-756), and what 2b's Difficult ground asks of Consecrated Ground's
 * *an enemy that is undead or fel*.
 */

import { rungsInForce } from "./corruption-effects.mjs";

/** The three words a rule may say, and nothing else (D-753). */
export const CREATURE_KINDS = Object.freeze(["undead", "fel", "demon"]);

/** 02 §5's people whose members are undead by the book's own words. */
const UNDEAD_PEOPLES = Object.freeze(["forsaken"]);

/** A people's name as the table keys it: "Night Elf" → "night-elf". */
function peopleKey(name) {
  return String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * The facts `kindsOf` reads, as plain data, off anything actor-shaped: a
 * document, its `toObject()`, or a hand-made row in a test.
 *
 * - A **creature** (`type: "npc"`) carries its type (`system.creatureType`),
 *   its people (`system.race`, 14 §1's `**Race**` run) and a Corruption
 *   KEYWORD (`system.corruption`, a track name, never a score).
 * - A **character** carries its people as a race ITEM - the caller hands its
 *   name in as `race`, since a pure rule cannot walk the items - and three
 *   track SCORES under `system.corruption`.
 *
 * @param {{type?: string, system?: object, race?: string|null}} actor
 * @returns {{type: string|null, creatureType: string|null, race: string|null,
 *   keyword: string|null, tracks: Record<string, number>|null}}
 */
export function creatureSnapshot({ type = null, system = null, race = null } = {}) {
  const s = system && typeof system === "object" ? system : {};
  const npc = type === "npc";
  const corruption = s.corruption ?? null;
  return {
    type: type ?? null,
    creatureType: npc && typeof s.creatureType === "string" ? s.creatureType : null,
    race: race ?? (typeof s.race === "string" ? s.race : null),
    // 14 §1's keyword is a TRACK NAME on a creature; a character's field is a
    // map of scores. Each shape is read only where it belongs.
    keyword: npc && typeof corruption === "string" ? corruption : null,
    tracks: !npc && corruption && typeof corruption === "object"
      ? Object.fromEntries(Object.entries(corruption).map(([k, v]) => [k, Math.trunc(Number(v) || 0)]))
      : null
  };
}

/** Whether a track has ENDED in the named ending (10 §9), read off the chapter's own table. */
function endedAs(tracks, track, name) {
  return rungsInForce(track, tracks?.[track] ?? 0).ending?.name === name;
}

/**
 * The words that are true of a creature, as a Set of `CREATURE_KINDS` keys.
 *
 * @param {ReturnType<typeof creatureSnapshot>} snapshot
 * @returns {Set<string>}
 */
export function kindsOf(snapshot = {}) {
  const out = new Set();
  if (!snapshot || typeof snapshot !== "object") return out;
  const type = String(snapshot.creatureType ?? "").toLowerCase();
  const people = peopleKey(snapshot.race);
  if (type === "undead" || UNDEAD_PEOPLES.includes(people) || endedAs(snapshot.tracks, "undeath", "The Risen")) out.add("undead");
  if (String(snapshot.keyword ?? "").toLowerCase() === "fel" || endedAs(snapshot.tracks, "fel", "The Fel-touched")) out.add("fel");
  if (type === "demon") out.add("demon");
  return out;
}
