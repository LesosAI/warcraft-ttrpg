/**
 * What worn and carried things grant (08 §6, 2026-09-06). Pure, no Foundry
 * imports (CLAUDE.md §3).
 *
 * An affix's grant is a SENTENCE on the item - `+1 Strength`, `A Boon on
 * Stealth`, `+1 Spellpower in Fire`, `+1 Fortitude` - carried on
 * `flags.azeroth-rpg.grants` by a generated item and on the affix document's
 * own flag where the affix is worn as a thing. Ward was the one family the
 * character read (`rules/ward.mjs`); the attribute, skill, Spellpower and
 * Fortitude families were written and never applied, so *of the Bear* raised
 * nothing (the lead, 2026-09-06). This is the one reader for every family;
 * Damage Rating and Armor Point grants are stamped onto the item's own
 * numbers by `rules/affixes.mjs` and are not re-read here.
 *
 * **The same fault a second time** (2026-09-10). `parseGrant` gained the scalar
 * and Test families with 14's creature passives (D-691) and `grantsFor` dropped
 * every one of them, on the reasoning printed below that no worn thing grants
 * one. 08 §20's SIGNATURE is a worn thing that grants one — §6's affix pool
 * sells no Defense, Attack, Speed or Initiative at all, so the Signature is the
 * only carrier there could be — and the lead's conversion of 142 Classic finds
 * turns a dodge rating into `+N Defense`, a hit rating into `+N Attack`, a
 * haste rating into `+N Speed` and a parry rating into a Boon on the Parry.
 * `WORN_SCALARS` is what is summed and `grant-doors.test.mjs` is the assertion
 * that each one reaches the number it names.
 */

import { AZEROTH } from "../config.mjs";
// **A CYCLE, AND A DELIBERATE ONE.** `signatures.mjs` reads a grant sentence
// through `parseGrant` below, and `grantsOn` judges a Signature's gate through
// `gateHolds` - one law each way, in the module that owns it, rather than a
// second copy of either. It is safe because NEITHER SIDE CALLS THE OTHER AT
// MODULE EVALUATION: both are hoisted function declarations, and the only work
// either module does while loading is building frozen tables that touch
// neither. Anything added here that runs `gateHolds` at load time breaks that.
import { gateHolds } from "./signatures.mjs";

const ABILITY_NAMES = Object.freeze({
  strength: "str", dexterity: "dex", constitution: "con",
  intelligence: "int", wisdom: "wis", charisma: "cha"
});

/** `"Sleight of Hand"` → `sleightOfHand`, read off config so a renamed skill cannot drift. */
function skillKeyFor(name) {
  const wanted = String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  for (const key of Object.keys(AZEROTH.skills)) {
    const spaced = key.replace(/([A-Z])/g, " $1").toLowerCase();
    if (spaced === wanted || key.toLowerCase() === wanted) return key;
  }
  return null;
}

/**
 * The Tests a Boon or a Bane can name where the sentence names no skill
 * (D-691): `A Boon on Attack Tests`, `A Bane on Casting Tests`. 14 writes a
 * creature's standing Boon this way; **08 §20's Signatures write one too**, and
 * `grantsFor` carries it to the roll dialog (2026-09-10).
 *
 * The vocabulary is `AZEROTH.grantTests` — 05 §2's four kinds plus **Parry**,
 * which 06 §6 makes an Attack Test of its own. It is deliberately NOT
 * `AZEROTH.testKinds`: that is what the dialog rolls and what a Bane may be
 * LAID on, and nothing in the book lays a Bane on a Parry.
 */
const TEST_KINDS = Object.freeze(
  Object.fromEntries(Object.keys(AZEROTH.grantTests).map(k => [k, k]))
);

/**
 * The scalar families a grant sentence names (D-691). Six words, one grammar:
 * a creature's standing passive writes them, and so does a Signature on a
 * worn thing (08 §20).
 */
const SCALARS = Object.freeze({
  defense: "defense", initiative: "initiative", speed: "speed",
  "damage rating": "damageRating", "armor point": "armorPoint", "armor points": "armorPoint",
  attack: "attack"
});

/**
 * The scalar families `grantsFor` SUMS for a worn thing, and the two it must
 * not (2026-09-10).
 *
 * **`damageRating` and `armorPoint` are excluded because they are stamped onto
 * the item's own numbers, and summing them here would count each twice.**
 * `rules/affixes.mjs#applyPrefix` and `rules/forge.mjs#build` both write
 * Honed's `+1 Damage Rating` into `system.rating` and Reinforced's
 * `+1 Armor Point` into `system.apBonus` — *and* keep the sentence on
 * `system.grants`, so the sentence is a record of what the number already is.
 * `CharacterData` then folds `apBonus` into `ap.body`, and a Signature's
 * `+N Damage Rating` reaches the blow through `signatures.mjs#signatureEffects`
 * at the attack door, with the creature struck in the snapshot — which is where
 * it belongs, because every one of them in the packs is gated on the target.
 *
 * The four that ARE summed have no other reader on a worn thing at all:
 * `defense`, `attack`, `speed` and `initiative` were parsed and dropped on the
 * floor, which is why the lead's dodge, hit and haste ratings had nowhere to
 * land (D-681's shape exactly).
 */
export const WORN_SCALARS = Object.freeze(Object.keys(AZEROTH.wornScalars));

/**
 * One grant sentence as a descriptor, or null where the sentence is not one
 * of the families this reads.
 *
 * The affix families are 08 §6's. The scalar and Test families arrived with
 * **14's creature passives** (D-691), written in the same sentence grammar so
 * a block and an affix cannot need two parsers — and **a worn thing grants one
 * now** (2026-09-10), through 08 §20's Signature rather than through §6's affix
 * pool, which sells no Defense, Attack, Speed or Initiative at all. So
 * `grantsFor` sums `WORN_SCALARS` and carries a Test Boon, where it used to
 * drop both.
 *
 * @param {string} text
 * @returns {{kind: "ability", key: string, points: number}
 *   | {kind: "boon"|"bane", skill: string}
 *   | {kind: "boon"|"bane", test: string}
 *   | {kind: "spellpower", school: string, points: number}
 *   | {kind: "ward", school: string, points: number}
 *   | {kind: "fortitude", points: number}
 *   | {kind: "defense"|"initiative"|"speed"|"damageRating"|"armorPoint"|"attack", points: number}
 *   | null}
 */
export function parseGrant(text) {
  const s = String(text ?? "").trim();
  let m;
  if ((m = /^\+(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)$/i.exec(s))) {
    return { kind: "ability", key: ABILITY_NAMES[m[2].toLowerCase()], points: Number(m[1]) };
  }
  if ((m = /^A (Boon|Bane) on\s+(.+)$/i.exec(s))) {
    const kind = m[1].toLowerCase();
    // `A Boon on Perception` and `A Boon on Perception Tests` are one sentence.
    const what = m[2].trim().replace(/\s+Tests?$/i, "").trim();
    const skill = skillKeyFor(what);
    if (skill) return { kind, skill };
    const test = TEST_KINDS[what.toLowerCase()];
    return test ? { kind, test } : null;
  }
  if ((m = /^\+(\d+)\s+(Spellpower|Ward) in\s+([A-Za-z]+)$/i.exec(s))) {
    const school = m[3].toLowerCase();
    if (!AZEROTH.schools[school]) return null;
    return { kind: m[2].toLowerCase(), school, points: Number(m[1]) };
  }
  if ((m = /^\+(\d+)\s+Fortitude$/i.exec(s))) return { kind: "fortitude", points: Number(m[1]) };
  if ((m = /^([+-]\d+)\s+(.+)$/.exec(s))) {
    const kind = SCALARS[m[2].trim().toLowerCase()];
    if (kind) return { kind, points: Number(m[1]) };
  }
  return null;
}

/* -------------------------------------------- */
/*  Points with the school left to be chosen     */
/* -------------------------------------------- */

/**
 * The two families 08 §10 sells BY THE POINT with the school left open -
 * *Warded cloak*, Ward `1, one school` - keyed by the flag the parser stamps
 * and valued with the word the grant sentence uses (D-690).
 *
 * A Classic find whose spell power line names no school is the same shape
 * (D-685): the record says how much and never says which.
 */
export const POINT_FAMILIES = Object.freeze({ spellpowerPoints: "Spellpower", wardPoints: "Ward" });

/**
 * The points an item carries that are waiting for a school, by family key.
 *
 * @param {object} flags   the item's whole `flags` object
 * @returns {Record<"spellpower"|"ward", number>}
 */
export function pointsAwaitingSchool(flags = {}) {
  const held = flags?.["azeroth-rpg"] ?? {};
  const out = {};
  for (const [key, family] of Object.entries(POINT_FAMILIES)) {
    const n = Math.trunc(Number(held[key]) || 0);
    if (n > 0) out[family.toLowerCase()] = n;
  }
  return out;
}

/**
 * What those points GRANT, once a school is chosen: the sentence 08 §6 prints,
 * so `parseGrant` reads it like any other. Derived, never stored - the points
 * are the item's and the school is the wearer's, and a stored sentence would
 * be a third copy of both.
 *
 * **With no school the item grants nothing.** That is an unmade choice rather
 * than an error, and the sheet says so instead.
 *
 * @param {object} p
 * @param {object} p.flags    the item's whole `flags` object
 * @param {string|null} p.school
 * @returns {string[]}
 */
export function schoolGrants({ flags = {}, school = null } = {}) {
  if (!school || !AZEROTH.schools[school]) return [];
  const label = String(school).charAt(0).toUpperCase() + String(school).slice(1);
  const held = pointsAwaitingSchool(flags);
  // POINT_FAMILIES' own order, so two runs cannot disagree.
  return Object.values(POINT_FAMILIES)
    .filter(family => (held[family.toLowerCase()] ?? 0) > 0)
    .map(family => `+${held[family.toLowerCase()]} ${family} in ${label}`);
}

/**
 * EVERY grant sentence an item carries, and the one door to them (D-681).
 *
 * FOUR sources: the generated item's own list, the affix document's single
 * grant where the affix is worn as a thing, the school-chosen points above,
 * which `prepareDerivedData` composes onto `system.grants`, and **the
 * Signature's own** (08 §20, D-692). Five call sites each held their own copy
 * of the first two, so a third source would have reached none of them - and a
 * fourth reaches all of them for free.
 *
 * **A SIGNATURE'S GRANT IS GATED AND THE GATE IS JUDGED HERE.** 08 §20 prices
 * *gated* at 1 and every grant it writes is one: *a Paladin wielding it adds 2
 * to its Damage Rating against undead and demons*. With no `state` a gated
 * Signature grants NOTHING - `gateHolds` fails an unjudgeable clause closed -
 * and an ungated one grants unconditionally. That is what keeps the three
 * §20 grants and the eleven Classic ones OFF the standing column: every one
 * of them is gated on the creature struck or on whether it has acted, and
 * there is no answer to *what does this grant* until there is a target. They
 * are applied where the attack is built, with the target in the snapshot.
 *
 * A thing in the pack is not worn, so a Signature on an UNEQUIPPED item grants
 * nothing. The other three sources do not test that here - `grantsFor` and
 * every call site filter for it - but a Signature has to, because 08 §20's
 * sentences are all *a Paladin **wielding** it* and *a Ranger **wearing** it*.
 *
 * @param {{flags?: object, system?: object}} item  a document or a plain snapshot
 * @param {object|null} [state]  the bearer, as `gateHolds` takes it; null
 *   withholds every gated Signature grant rather than guessing
 * @returns {string[]}
 */
export function grantsOn(item, state = null) {
  const flags = item?.flags?.["azeroth-rpg"] ?? {};
  return [
    ...(Array.isArray(flags.grants) ? flags.grants : []),
    flags.affix?.grants,
    ...(Array.isArray(item?.system?.grants) ? item.system.grants : []),
    ...signatureGrantsOn(item, state)
  ].filter(Boolean).map(String);
}

/**
 * The Signature's grant sentences, where the thing is worn and the gate holds.
 * Kept beside `grantsOn` rather than inside it so the reason each is withheld
 * reads in one place.
 *
 * **ONE SENTENCE AT A TIME** (D-722; the lead, 2026-09-14). The trunk's
 * sentences stand where the trunk's gate holds, and every gated sentence stands
 * where ITS OWN does — *a creature that hits you takes 1 Nature damage. A
 * Shaman wielding it adds 2 to its Damage Rating.* grants the Damage Rating to
 * a Shaman and nothing to anybody else, where one top-level gate would have
 * withheld both halves from everybody but a Shaman.
 */
function signatureGrantsOn(item, state) {
  const equipped = item?.equipped ?? item?.system?.equipped ?? false;
  if (!equipped) return [];
  const signature = item?.signatureEffect ?? item?.system?.signatureEffect ?? null;
  if (!signature) return [];
  const held = state ?? {};
  const out = [];
  const trunk = Array.isArray(signature.grants) ? signature.grants : [];
  if (trunk.length && gateHolds(signature.gates ?? [], held)) out.push(...trunk);
  for (const branch of Array.isArray(signature.gated) ? signature.gated : []) {
    const sentences = Array.isArray(branch?.grants) ? branch.grants : [];
    if (sentences.length && gateHolds(branch?.gates ?? [], held)) out.push(...sentences);
  }
  return out;
}

/**
 * Everything the equipped items grant, summed by family. An item that is
 * not equipped grants nothing - a suit in the pack is not worn (08 §6).
 *
 * **The scalar and Test families are summed here since 2026-09-10.** They were
 * parsed by `parseGrant` and dropped on this floor, on the reasoning that no
 * worn thing grants one; 08 §20's Signature is exactly a worn thing that does,
 * and the lead's conversion of 142 Classic finds turns a dodge rating into
 * `+N Defense`, a hit rating into `+N Attack`, a haste rating into `+N Speed`
 * and a parry rating into `A Boon on Parry Tests`. Every one of them had no
 * consumer at all, which is this repository's commonest real fault (D-681).
 *
 * **`damageRating` and `armorPoint` are still dropped, and `WORN_SCALARS` says
 * why**: both are stamped onto the item's own stored number, so summing them
 * here would count each of them twice.
 *
 * `scalarSources`, `testBoonSources` and `testBaneSources` name the item behind
 * every point, exactly as `abilitySources` does — the Overview tab's In-force
 * column and the roll dialog both print the provenance, and a bonus with no
 * source beside it reads as the tool's own arithmetic.
 *
 * @param {Array<{equipped: boolean, name?: string, grants?: string[]}>} items
 * @returns {{
 *   abilities: Record<string, number>,
 *   abilitySources: Record<string, Array<{name: string, points: number}>>,
 *   boons: Record<string, string[]>,
 *   skillBanes: Record<string, string[]>,
 *   spellpower: Record<string, number>,
 *   fortitude: number,
 *   scalars: Record<string, number>,
 *   scalarSources: Record<string, Array<{name: string, points: number}>>,
 *   testBoons: Record<string, number>,
 *   testBanes: Record<string, number>,
 *   testBoonSources: Record<string, string[]>,
 *   testBaneSources: Record<string, string[]>
 * }}
 */
export function grantsFor(items = []) {
  const abilities = {};
  const abilitySources = {};
  const boons = {};
  const skillBanes = {};
  const spellpower = {};
  let fortitude = 0;
  // Zero-filled rather than sparse: every consumer reads one key by name, and
  // a bag whose keys come and go is a bag a template has to guard.
  const scalars = Object.fromEntries(WORN_SCALARS.map(k => [k, 0]));
  const scalarSources = {};
  const testBoons = Object.fromEntries(Object.keys(TEST_KINDS).map(k => [k, 0]));
  const testBanes = Object.fromEntries(Object.keys(TEST_KINDS).map(k => [k, 0]));
  const testBoonSources = {};
  const testBaneSources = {};
  for (const item of items) {
    if (!item?.equipped) continue;
    const name = item.name ?? "";
    for (const text of item.grants ?? []) {
      const g = parseGrant(text);
      if (!g) continue;
      if (g.kind === "ability") {
        abilities[g.key] = (abilities[g.key] ?? 0) + g.points;
        // The plate's formula names the item behind each point (2026-09-06).
        (abilitySources[g.key] ??= []).push({ name: name || String(text), points: g.points });
      }
      else if (g.kind === "boon" || g.kind === "bane") {
        const skills = g.kind === "boon" ? boons : skillBanes;
        const counts = g.kind === "boon" ? testBoons : testBanes;
        const sources = g.kind === "boon" ? testBoonSources : testBaneSources;
        // A sentence naming a skill and one naming a KIND of Test are two
        // different readers: the dialog raises a skill line off the names and
        // a Test line off the count.
        if (g.skill) (skills[g.skill] ??= []).push(name || String(text));
        else if (g.test) {
          counts[g.test] += 1;
          (sources[g.test] ??= []).push(name || String(text));
        }
      }
      else if (g.kind === "spellpower") spellpower[g.school] = (spellpower[g.school] ?? 0) + g.points;
      else if (g.kind === "fortitude") fortitude += g.points;
      else if (WORN_SCALARS.includes(g.kind)) {
        scalars[g.kind] += g.points;
        (scalarSources[g.kind] ??= []).push({ name: name || String(text), points: g.points });
      }
    }
  }
  return {
    abilities, abilitySources, boons, skillBanes, spellpower, fortitude,
    scalars, scalarSources, testBoons, testBanes, testBoonSources, testBaneSources
  };
}
