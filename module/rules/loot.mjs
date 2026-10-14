/**
 * The loot generator's law (D-666, 2026-09-06). Pure, no Foundry imports
 * (CLAUDE.md §3).
 *
 * THE BOOK PUBLISHES NO LOOT TABLE AND THAT IS DELIBERATE. D-552 is locked:
 * *treasure is provenance, not quantity; no items-per-arc rate exists
 * anywhere and none was invented.* 13 §8 owns where a thing came from and
 * who wants it back. So every number below is THE TOOL'S, shown to the GM
 * as a dial and labelled as such in the window - never printed as a rule of
 * the chapter. What the book does own, this reads rather than restates:
 *
 * - **The ceiling is the tier's**, from D1 §4.6's *Quality* column. It
 *   budgets +0 / +1 / +2 / +3 Damage Rating across tiers 1 to 4, and at 08
 *   §4's two points a Rating that is a spend of 0 / 2 / 4 / 6 - Common,
 *   Rare, Epic, and past Epic. Tier 1 admits Uncommon because a one-point
 *   affix (an attribute, Fortitude) buys no Rating at all.
 * - **The leaning is the scenario's**, from 08 §3's availability bands:
 *   what is found in a place resembles what its band sells, one rung up
 *   because it is taken rather than bought. Wilderness is a Village,
 *   Outpost a Town, Dungeon a City and its commissions, and a Site (12 §8:
 *   *nobody lives here; something is here*) or a Boss is 08 §3's *Nowhere*,
 *   where Epic and Legendary are *taken off something, dug out of
 *   somewhere*.
 * - **Legality is 08 §4 to §6 and it is not re-implemented here.** Every
 *   affixed row goes through `rules/forge.mjs#plan`, so a row the chapter
 *   refuses never reaches the window.
 * - **The purse is 08 §2's wage.** Twelve copper is a day of unskilled
 *   labour, and 13 §8 asks the GM to work a purse out in days before
 *   handing it over. So the dial IS days, and the coin follows.
 *
 * A Legendary is never rolled: 08 §20 makes it one in the world, and that
 * is a decision at the table rather than a draw.
 *
 * **THE CLASSIC FINDS ARE DRAWN TOO** (D-702, the lead: *the Loot Generator
 * needs to have the Classic Items we created added to the relevant dungeons
 * loot table when selected; items that do not belong to a dungeon, add them
 * to the other loot tables*). D-685 put 1,772 of them in the weapons, armor
 * and gear packs and **every one was excluded from every pool in silence**,
 * because `kindOf` read a leading section NUMBER and a find's section is
 * `Classic · <Zone>`. They are a third pool, `found`, beside the book's own
 * `fixed`, and `findsFor` is the one place the scoping lives: a dungeon
 * named draws that dungeon's, and no dungeon named draws the whole tier's.
 * That is the lead's second sentence and it needs no second rule.
 *
 * **A DUNGEON IS THE WHOLE DUNGEON, AND A BOSS IS ONE BOSS** (D-703, the
 * lead: *Dungeon should be loot from the entire dungeon, not just the last
 * boss. The boss scenario should have a sub menu where the specific boss is
 * selected*). The draw was already the whole dungeon and the LABEL was what
 * said otherwise: 14 §14 gives each of its 41 dungeons exactly one Boss, the
 * select was built off those rows, and every option read `<dungeon> · <its one
 * Boss>` — so Naxxramas' 436 finds read as Kel'Thuzad's 36. The dungeon pool is
 * unchanged and `findsFor` gained a third, narrower rung for a boss named off
 * the CLASSIC record, which holds 269 of them where the book holds 41.
 * `foldAtPlace` is the other half: a named place's own contents are a better
 * authority on what it drops than the scenario's generic weights.
 *
 * **A find prefers a base whose forged price lands in its rarity's own
 * band** (08 §4: an Uncommon usually 1 to 30 silver, a Rare 40 to 90, an
 * Epic 2 gold and up). The multiplier is the rule and the band is what it
 * usually comes to, so the band cannot be enforced - but a roller that
 * ignores it makes an Uncommon half-plate at 120 silver as readily as an
 * Uncommon dagger at 12, and the first reads as a fortune paid for nothing
 * (the lead, 2026-09-06). The chapter's own exemption is honoured: **armor
 * runs above the band**, so a suit is judged by the band's floor alone.
 *
 * Randomness is injected. `random()` returns [0, 1); Vitest passes a seeded
 * one and the window passes `CONFIG.Dice.randomUniform`, so a Quench test
 * pins it the way it pins a die.
 */

import { AZEROTH } from "../config.mjs";
import { canGoOn, priceFor } from "./affixes.mjs";
import { ZONES } from "./classic-tables.mjs";
import { affixCost, bandFor, build, plan } from "./forge.mjs";
import { tierForLevel } from "./progression.mjs";

/** The five scenarios (D-666), keyed as `config.mjs` names them. */
export const SCENARIOS = Object.freeze(["wilderness", "site", "outpost", "dungeon", "boss"]);
export const TIERS = Object.freeze([1, 2, 3, 4]);
export const RARITIES = Object.freeze(["common", "uncommon", "rare", "epic"]);

/** 08 §2, D-422: a day of unskilled labour, in copper. */
export const DAY_WAGE = 12;

/** The rarity a tier reaches, from D1 §4.6's Quality column read at 08 §4's rate. */
export const CEILING = Object.freeze({ 1: "uncommon", 2: "rare", 3: "epic", 4: "epic" });

/** How many tries `rollRow` gives a rarity before it falls back to a Common row. */
const TRIES = 8;

/**
 * The scenario's leaning, before the tier folds it (08 §3's bands). Weights
 * are per cent and sum to 100; `count` is the number of finds; `combat` and
 * `named` are shares in [0, 1]; `days` is the purse at tier 1.
 */
export const LEANING = Object.freeze({
  wilderness: { weights: { common: 85, uncommon: 15, rare: 0, epic: 0 }, count: [1, 2], combat: 0.3, named: 0.5, days: 2 },
  site: { weights: { common: 60, uncommon: 25, rare: 12, epic: 3 }, count: [2, 3], combat: 0.4, named: 0.5, days: 5 },
  outpost: { weights: { common: 70, uncommon: 25, rare: 5, epic: 0 }, count: [2, 4], combat: 0.6, named: 0.5, days: 10 },
  dungeon: { weights: { common: 50, uncommon: 30, rare: 15, epic: 5 }, count: [3, 5], combat: 0.5, named: 0.5, days: 20 },
  boss: { weights: { common: 20, uncommon: 30, rare: 35, epic: 15 }, count: [3, 4], combat: 0.7, named: 0.5, days: 30 }
});

/**
 * 08 §4's price bands in copper - *usually 1 to 30 silver*, *40 to 90*, *2
 * gold and up*. Guidance, not a rule: the multiplier is what is charged.
 */
export const PRICE_BAND = Object.freeze({
  common: [0, null], uncommon: [100, 3000], rare: [4000, 9000], epic: [20000, null]
});

/**
 * Whether a base's forged price lands in the rarity's band. A price the
 * catalogue does not state (an Augment that is issued) cannot be judged and
 * passes; **armor is exempt from the ceiling**, which 08 §4 says in as many
 * words.
 */
export function inPriceBand(base, rarity) {
  const [lo, hi] = PRICE_BAND[rarity] ?? [0, null];
  const price = priceFor({ base, rarity });
  if (price === null || price === undefined) return true;
  if (price < lo) return false;
  if (hi !== null && price > hi && base?.type !== "armor") return false;
  return true;
}

/** The purse's step by tier, tracking the Quality column's own. */
const PURSE_STEP = Object.freeze({ 1: 1, 2: 2.5, 3: 5, 4: 10 });

/** Weight above the tier's ceiling moves onto the ceiling rung. */
function foldAtCeiling(weights, tier) {
  const ceiling = CEILING[tier] ?? "epic";
  const top = RARITIES.indexOf(ceiling);
  const out = { common: 0, uncommon: 0, rare: 0, epic: 0 };
  RARITIES.forEach((rarity, i) => {
    const at = i <= top ? rarity : ceiling;
    out[at] += weights[rarity] ?? 0;
  });
  return out;
}

/**
 * The dials a scenario and a tier open on. A fresh object every call: the
 * window writes to it.
 *
 * @param {string} scenario
 * @param {number} tier
 * @returns {{count: number[], weights: object, combat: number, named: number, days: number}}
 */
export function tableFor(scenario, tier) {
  const lean = LEANING[scenario] ?? LEANING.dungeon;
  const t = TIERS.includes(Number(tier)) ? Number(tier) : 1;
  return {
    count: [...lean.count],
    weights: foldAtCeiling(lean.weights, t),
    combat: lean.combat,
    named: lean.named,
    days: Math.round(lean.days * PURSE_STEP[t])
  };
}

/** Every scenario × tier, precomputed, for the tests and a macro. */
export const DEFAULT_TABLE = Object.freeze(Object.fromEntries(
  SCENARIOS.map(scenario => [scenario, Object.freeze(Object.fromEntries(
    TIERS.map(tier => [tier, Object.freeze(tableFor(scenario, tier))])
  ))])
));

/** 14 §14's party-level band to a tier: `"5–10"` → 2. Takes an en dash or a hyphen. */
export function tierForPartyLevel(band) {
  const m = /(\d+)/.exec(String(band ?? ""));
  return m ? tierForLevel(Number(m[1])) : null;
}

/* -------------------------------------------- */
/*  What a thing is                              */
/* -------------------------------------------- */

/** The leading section number of `system.source.section`, or null. */
export function sectionNumber(section) {
  const m = /^\s*(\d+)/.exec(String(section ?? ""));
  return m ? Number(m[1]) : null;
}

/** Sections whose things are used in a fight, and those that are not (D-666: the tool's axis, not 08's). */
const COMBAT_SECTIONS = new Set([7, 8, 9, 10, 13]);
const NONCOMBAT_SECTIONS = new Set([11, 14, 15, 17]);

/** The `source.document` of an index entry or a base. */
function sourceDocument(item) {
  return String(item?.system?.source?.document ?? item?.source?.document ?? "");
}

/** Whether a thing came off the vendored Classic record rather than a chapter (D-685). */
export function isClassicFind(item) {
  return sourceDocument(item) === "Classic";
}

/**
 * Combat or non-combat. **08 draws no such line** - the chapter files by
 * section, not by use - so this is the tool's reading of the sections, and
 * §12 is the one that splits: a poison is a fight's, a restorative is not.
 *
 * **A CLASSIC FIND IS ALWAYS `combat`** (D-702), and it is keyed on
 * `source.document` rather than on the section, because a find's section is
 * `Classic · <Zone>` and carries no number at all - which is why every one
 * of the 1,772 fell out of every pool here in silence. The answer is not a
 * guess: every slot the conversion emits is a worn or wielded fighting
 * thing (a weapon, a suit, a shield, or gear at Head, Neck, Shoulder, Back,
 * Wrist, Hands, Waist, Legs, Feet, Finger, Trinket or a Relic), and there
 * is no bag, no consumable and no tool among them.
 *
 * @param {{type: string, system?: object, source?: object}} item  An index entry or a base.
 * @returns {"combat"|"noncombat"|null}
 */
export function kindOf(item) {
  if (isClassicFind(item)) return "combat";
  const section = item?.system?.source?.section ?? item?.source?.section ?? "";
  const n = sectionNumber(section);
  if (n === 20) return item?.type === "gear" ? "noncombat" : "combat";
  if (n === 12) return /·\s*Poisons\s*$/.test(String(section)) ? "combat" : "noncombat";
  if (COMBAT_SECTIONS.has(n)) return "combat";
  if (NONCOMBAT_SECTIONS.has(n)) return "noncombat";
  return null;
}

/**
 * A living mount or a wagon is 13 §8's decision, not a chest's contents
 * (D-666, reversible in one line). Harness and barding stay.
 */
const EXCLUDED = [/·\s*Working animals\s*$/, /·\s*Trained mounts\s*$/, /·\s*War mounts\s*$/, /·\s*Vehicles\s*$/];

/** Whether a pack item may be drawn as a Common find. */
export function lootable(item) {
  if (!item || item.affix) return false;
  const rarity = item.system?.rarity ?? item.rarity ?? "common";
  if (rarity !== "common") return false;
  const section = String(item.system?.source?.section ?? item.source?.section ?? "");
  if (sectionNumber(section) === 20) return false;
  if (EXCLUDED.some(re => re.test(section))) return false;
  return kindOf(item) !== null;
}

/* -------------------------------------------- */
/*  Where a Classic find came from (D-702)       */
/* -------------------------------------------- */

/** A find's section, which the parser writes as `Classic · <Zone>` (D-685). */
const CLASSIC_SECTION = /^\s*Classic\s*·\s*(.+?)\s*$/;

/**
 * The Classic zone a find came out of, off its own section line, or null.
 * ONE READER: nothing else in this module takes a zone apart.
 *
 * @param {{system?: object, source?: object}} item
 * @returns {string|null}
 */
export function classicZone(item) {
  if (!isClassicFind(item)) return null;
  const section = String(item?.system?.source?.section ?? item?.source?.section ?? "");
  const m = CLASSIC_SECTION.exec(section);
  return m ? m[1] : null;
}

/** What `classic-loot.mjs#provenanceFor` writes in front of a boss's name. */
const OFF = "Off ";

/**
 * The Classic boss a find came off, or null where it is a zone drop - trash,
 * a quest hand-over, a vendor (D-703).
 *
 * **TWO READINGS OF ONE FACT, and they are asserted against each other over
 * all 1,772 finds in `loot.test.mjs`.** `flags.azeroth-rpg.classic.boss` is
 * the structure the conversion recorded (D-685) and it is read first; but a
 * compendium INDEX carries only the fields it was asked for, and nothing in
 * this system had ever indexed a `flags.` path before this. `system.provenance`
 * is a plain `system` field that indexes beyond doubt and names the boss in all
 * 1,366 boss drops, so it is the fallback and the live behaviour is safe
 * whichever way the projection goes.
 *
 * **The provenance is parsed EXACTLY, never loosely.** A boss drop reads
 * `Off <Boss> in <Zone>`, and a boss's name may itself hold ` in ` - so the
 * trailing ` in <Zone>` is stripped using the zone this find is ALREADY known
 * to belong to, rather than matched by a greedy `Off (.*) in (.*)` that would
 * be guessing. A line that does not open on `Off ` is a zone drop and answers
 * null: `Found in <Zone>` and `Handed over in <Zone>` are the other two shapes
 * the conversion writes.
 *
 * @param {{type?: string, system?: object, source?: object, flags?: object}} item  An index entry or a base.
 * @returns {string|null}
 */
export function classicBoss(item) {
  if (!isClassicFind(item)) return null;
  const flagged = item?.flags?.["azeroth-rpg"]?.classic?.boss;
  if (flagged) return String(flagged);
  const provenance = String(item?.system?.provenance ?? item?.provenance ?? "");
  if (!provenance.startsWith(OFF)) return null;
  const zone = classicZone(item);
  const tail = zone ? ` in ${zone}` : "";
  if (tail && !provenance.endsWith(tail)) return null;
  const name = provenance.slice(OFF.length, provenance.length - tail.length).trim();
  return name || null;
}

/**
 * Every Classic zone, bound to the dungeon 14 §14 names for it and to the
 * tier that dungeon sits at.
 *
 * **`classic-tables.mjs#ZONES` is the one vocabulary and it is imported
 * rather than re-derived.** A zone name is not the dungeon's name — 14 §14
 * files Nefarian under *The mountain's peak*, which is Blackwing Lair, and
 * no amount of string normalising finds that. The binding is a hand row and
 * `classic-tables.test.mjs` holds it against the chapter.
 *
 * **THE INDEX IS THE SOURCE WHEREVER IT SPEAKS**, which is why only three
 * of the 26 rows carry a `tier` of their own: Ragefire Chasm, the Stockade
 * and the Ruins of Ahn'Qiraj have no Boss in 14 §14 and so no band to read.
 * A zone that resolves to neither is `unresolved` and is reported rather
 * than dropped, because a zone that silently stopped resolving would take
 * its whole shelf of finds out of the generator without a word (D-681).
 *
 * @param {Array<{dungeon: string, tier: number}>} dungeons  the runtime index
 * @returns {{zones: Map<string, {zone: string, dungeon: string|null, tier: number}>, unresolved: string[]}}
 */
export function zoneTiers(dungeons = []) {
  // A dungeon is as deep as the worst thing in it, as `tierForDungeon` has it.
  const byDungeon = new Map();
  for (const row of dungeons) {
    const name = row?.dungeon;
    const tier = Number(row?.tier);
    if (!name || !TIERS.includes(tier)) continue;
    byDungeon.set(name, Math.max(byDungeon.get(name) ?? 0, tier));
  }
  const zones = new Map();
  const unresolved = [];
  for (const zone of ZONES) {
    const tier = (zone.dungeon ? byDungeon.get(zone.dungeon) : null) ?? zone.tier ?? null;
    if (tier === null || tier === undefined) {
      unresolved.push(zone.name);
      continue;
    }
    zones.set(zone.name, { zone: zone.name, dungeon: zone.dungeon ?? null, tier });
  }
  return { zones, unresolved };
}

/**
 * A flat index entry to the `{name, type, system}` shape the Forge reads.
 *
 * `flags` is lifted OUT rather than swept into `system` with the rest: it is
 * not a system field, and `classicBoss` reads the conversion's own record off
 * it (D-703).
 */
function asBase(entry) {
  const { uuid, name, img, type, affix, flags, ...system } = entry;
  return { uuid, name, img: img ?? null, type, flags: flags ?? null, system };
}

/** An empty `{rare, epic} × {combat, noncombat}` shelf. */
function emptyNamed() {
  return { rare: { combat: [], noncombat: [] }, epic: { combat: [], noncombat: [] } };
}

/**
 * The pools one roll draws from.
 *
 * `fixed` is **the BOOK's own** named Rares and Epics — 08 §20's entries and
 * §10's warded gear — and it keeps that meaning exactly. `found` is D-685's
 * Classic finds (D-702), each tagged with the place it came out of, and a
 * find is never in `fixed`: they are scoped differently and a reader that
 * could not tell them apart would draw a Naxxramas blade in the Deadmines.
 *
 * **With no `zones` argument `found` is empty and a Classic find is simply
 * skipped**, so every caller that does not know about zones behaves exactly
 * as it did before this (the parser's own tools among them).
 *
 * @param {object} p
 * @param {object[]} p.weapons  index entries: `{uuid, name, img, type, ...system}`
 * @param {object[]} p.armor
 * @param {object[]} p.gear
 * @param {object[]} p.affixes  `affixOf` shapes
 * @param {Map<string, {zone, dungeon, tier}>} [p.zones]  `zoneTiers().zones`
 * @returns {{bases: object, affixable: object, fixed: object, found: object, prefixes: object[], suffixes: object[]}}
 */
export function poolsFrom({ weapons = [], armor = [], gear = [], affixes = [], zones = null } = {}) {
  const prefixes = affixes.filter(a => a?.kind === "prefix");
  const suffixes = affixes.filter(a => a?.kind === "suffix");
  const bases = { combat: [], noncombat: [] };
  const affixable = { combat: [], noncombat: [] };
  const fixed = emptyNamed();
  const found = emptyNamed();
  const every = [...weapons, ...armor, ...gear];
  for (const entry of every) {
    const base = asBase(entry);
    const kind = kindOf(base);
    if (!kind) continue;
    const rarity = base.system.rarity ?? "common";
    if (isClassicFind(base)) {
      // A find is Rare or Epic by construction (`SUPPORTED_QUALITIES`), so a
      // rarity outside the named shelf is a conversion that has changed shape
      // and is skipped rather than filed somewhere it does not belong.
      // `found.boss` is the Classic boss it came off, null for a zone drop
      // (D-703). Nothing else about `found` moves.
      const where = zones?.get?.(classicZone(base) ?? "") ?? null;
      if (where && found[rarity]) found[rarity][kind].push({ ...base, found: { ...where, boss: classicBoss(base) } });
      continue;
    }
    if (rarity === "rare" || rarity === "epic") {
      fixed[rarity][kind].push(base);
      continue;
    }
    if (!lootable(base)) continue;
    bases[kind].push(base);
    // A base worth affixing is one at least one affix goes on.
    if (prefixes.some(a => canGoOn(a, base)) || suffixes.some(a => canGoOn(a, base))) affixable[kind].push(base);
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  for (const kind of ["combat", "noncombat"]) {
    bases[kind].sort(byName);
    affixable[kind].sort(byName);
    for (const rarity of ["rare", "epic"]) {
      fixed[rarity][kind].sort(byName);
      found[rarity][kind].sort(byName);
    }
  }
  return { bases, affixable, fixed, found, prefixes, suffixes };
}

/**
 * The Classic finds a place admits, and THE ONE PLACE THE SCOPING LIVES.
 * Three rungs, narrowest first:
 *
 * - a **boss** named draws that boss's drops in that dungeon and **only**
 *   those. A zone drop is trash rather than a boss drop - the record files it
 *   under the zone with no `source.name` at all - so it is excluded, which is
 *   the whole point of naming a boss (D-703).
 * - a **dungeon** named draws **every** find of that dungeon, its boss drops
 *   and its zone drops alike. That is the lead's first sentence -- *dungeon
 *   should be loot from the entire dungeon, not just the last boss* -- and it
 *   was already true before D-703: `found.dungeon` comes off the ZONE binding,
 *   so naming Naxxramas has always reached all 436 of its finds rather than
 *   Kel'Thuzad's 36. **Do not narrow it.**
 * - **neither** named draws the whole tier's, so a find whose zone 14 §14
 *   gives no dungeon at all - Ragefire Chasm, the Stockade, the Ruins of
 *   Ahn'Qiraj - is drawn there and nowhere else. That is *items that do not
 *   belong to a dungeon, add them to the other loot tables* (D-702).
 */
function findsFor(pools, { rarity, kind, dungeon = null, boss = null, tier = null }) {
  const finds = pools?.found?.[rarity]?.[kind] ?? [];
  if (!finds.length) return [];
  if (boss) return finds.filter(b => b.found?.dungeon === dungeon && b.found?.boss === boss);
  if (dungeon) return finds.filter(b => b.found?.dungeon === dungeon);
  return finds.filter(b => b.found?.tier === Number(tier));
}

/**
 * The named things one row may draw: **always the book's own** — 08 §20's
 * entries and §10's warded gear, drawn wherever the party is — plus the
 * Classic finds this place admits, by `findsFor` above (D-702, D-703).
 *
 * @param {object} pools
 * @param {object} p
 * @param {"rare"|"epic"} p.rarity
 * @param {"combat"|"noncombat"} p.kind
 * @param {string|null} [p.dungeon]  14 §14's own name for the place
 * @param {string|null} [p.boss]     the CLASSIC record's boss, inside that dungeon
 * @param {number|null} [p.tier]
 * @returns {object[]}
 */
export function namedPool(pools, { rarity, kind, dungeon = null, boss = null, tier = null } = {}) {
  const book = pools?.fixed?.[rarity]?.[kind] ?? [];
  return [...book, ...findsFor(pools, { rarity, kind, dungeon, boss, tier })];
}

/**
 * The distinct Classic bosses recorded for a dungeon, with a drop count each,
 * for the window's Boss select (D-703). Sorted by count descending, then by
 * name, so the boss the record knows most about is offered first.
 *
 * **14 §14 gives each of its 41 dungeons exactly one Boss**, so the book's own
 * vocabulary could never furnish a submenu; these are the CLASSIC record's,
 * 269 of them across 26 zones, and where 14 also holds the creature the two
 * agree by name (22 of the 41).
 *
 * @param {object} pools
 * @param {string|null} dungeon
 * @returns {Array<{boss: string, count: number}>}  `[]` for a dungeon with no finds
 */
export function bossesIn(pools, dungeon) {
  if (!dungeon) return [];
  const counts = new Map();
  for (const rarity of ["rare", "epic"]) {
    for (const kind of ["combat", "noncombat"]) {
      for (const base of pools?.found?.[rarity]?.[kind] ?? []) {
        if (base.found?.dungeon !== dungeon || !base.found?.boss) continue;
        counts.set(base.found.boss, (counts.get(base.found.boss) ?? 0) + 1);
      }
    }
  }
  return [...counts]
    .map(([boss, count]) => ({ boss, count }))
    .sort((a, b) => b.count - a.count || a.boss.localeCompare(b.boss));
}

/**
 * WHERE A PLACE IS NAMED, ITS OWN CONTENTS OUTRANK THE DIAL (D-703). One
 * function, one call site, and the lead can delete both in a line if the feel
 * is wrong.
 *
 * The fault it cures: Naxxramas holds **436 Epics and no Rare at all**, and the
 * Boss table weights Rare 35 against Epic 15 - so every Rare draw fell through
 * to the book's twelve, and **the book's dozen came out of Naxxramas three
 * times as often as Naxxramas' own 436**. That is the dial saying one thing and
 * the place holding another. This is `foldAtCeiling`'s idea applied to the place
 * instead of the tier: weight that cannot be honoured moves to the rung that
 * can.
 *
 * Measured at the defaults over 400 rolls a cell, the same seeds both sides,
 * as the share of every rolled row that is a Classic find:
 *
 * | Where | Its finds | before | after |
 * |---|---|---|---|
 * | Naxxramas, *A dungeon*, t4 | R0 E436 | 1.6% | **4.6%** |
 * | Naxxramas, *A Boss*, t4 | R0 E436 | 5.3% | **16.9%** |
 * | Ahn'Qiraj, *A Boss*, t4 | R0 E108 | 4.6% | **14.8%** |
 * | The Molten Core, *A Boss*, t4 | R0 E56 | 3.9% | **12.9%** |
 * | Blackrock Depths, *A Boss*, t4 | R120 E9 | 13.0% | 13.0% |
 * | Stratholme, *A Boss*, t4 | R88 E2 | 11.4% | 11.4% |
 * | The Deadmines, *A Boss*, t2 | R22 E0 | 12.3% | 12.3% |
 * | Karazhan, *A Boss*, t4 | R0 E0 | 0.0% | 0.0% |
 *
 * **A place that holds both rungs does not move at all**, which is the shape
 * the rule wants: it is a fallback for a shelf that is empty, never a thumb on
 * the scale. With a boss named it is the same rule one rung narrower — Nefarian
 * (R0/E12) goes 2.1% to 6.2%, Baron Rivendare (R12/E1) does not move.
 *
 * Four things it will not do:
 *
 * - **It fires only where a place is named.** With no dungeon the tier's pool
 *   holds both rarities and there is nothing to fold; the whole rule is about
 *   a named place's own shelf.
 * - **It moves between Rare and Epic only**, and never turns a Common or an
 *   Uncommon row into either.
 * - **The tier's ceiling still binds.** A fold to Epic at tier 1 or 2 is
 *   refused because `CEILING` says so, exactly as `foldAtCeiling` refuses the
 *   weight.
 * - **It touches the NAMED branch alone.** A Rare row that finds no Classic
 *   Rare must still be able to become a forged Rare out of the affix pools:
 *   the forge path is about the item, not the place.
 *
 * @param {object} pools
 * @param {object} p
 * @param {"common"|"uncommon"|"rare"|"epic"} p.rarity  the rarity the dial drew
 * @param {"combat"|"noncombat"} p.kind
 * @param {string|null} [p.dungeon]
 * @param {string|null} [p.boss]
 * @param {number|null} [p.tier]
 * @returns {string} the rarity the NAMED draw should read - `rarity` unless it folded
 */
export function foldAtPlace(pools, { rarity, kind, dungeon = null, boss = null, tier = null } = {}) {
  if (rarity !== "rare" && rarity !== "epic") return rarity;
  if (!dungeon) return rarity;
  const other = rarity === "rare" ? "epic" : "rare";
  const ceiling = CEILING[Number(tier)] ?? "epic";
  if (RARITIES.indexOf(other) > RARITIES.indexOf(ceiling)) return rarity;
  const here = findsFor(pools, { rarity, kind, dungeon, boss, tier });
  if (here.length) return rarity;
  return findsFor(pools, { rarity: other, kind, dungeon, boss, tier }).length ? other : rarity;
}

/* -------------------------------------------- */
/*  Drawing                                      */
/* -------------------------------------------- */

/** One of a list, or null. */
export function pick(list, random) {
  if (!list?.length) return null;
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/** A key by its share of the weights. Raw numbers: the GM may type 3/2/1/0. */
export function weighted(weights = {}, random) {
  const entries = Object.entries(weights).filter(([, n]) => Number(n) > 0);
  const total = entries.reduce((sum, [, n]) => sum + Number(n), 0);
  if (!total) return "common";
  let roll = random() * total;
  for (const [key, n] of entries) {
    roll -= Number(n);
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** An integer in [lo, hi]. */
function between(lo, hi, random) {
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  return a + Math.floor(random() * (b - a + 1));
}

/**
 * How many of a thing a find holds: a bundle of shot, a dose or two, a few
 * bars of ore. A weapon that is not ammunition carries no count at all
 * (`quantity` is nullable on `WeaponData` and the sheet draws the dash).
 */
export function quantityFor(base, random) {
  const section = String(base?.system?.source?.section ?? "");
  if (base?.type === "weapon") return (base.system?.fits ?? []).length ? between(10, 20, random) : null;
  if (sectionNumber(section) === 12) return between(1, 3, random);
  if (sectionNumber(section) === 17) return between(1, 5, random);
  return 1;
}

/** The purse: a figure in days, and what that is in copper (08 §2). */
export function purseFor(days) {
  const d = Math.max(0, Math.trunc(Number(days) || 0));
  return { days: d, copper: d * DAY_WAGE };
}

/** Every legal single affix for a base under a budget. */
function singles(pools, base, ceiling) {
  return [...pools.prefixes, ...pools.suffixes]
    .filter(a => !a.minimumRarity && affixCost(a) <= ceiling && canGoOn(a, base));
}

/** Every legal prefix-and-suffix pair for a base whose spend lands inside [lo, hi]. */
function pairs(pools, base, lo, hi, { greater = false } = {}) {
  const out = [];
  const ps = pools.prefixes.filter(a => canGoOn(a, base));
  const ss = pools.suffixes.filter(a => canGoOn(a, base));
  for (const prefix of ps) {
    for (const suffix of ss) {
      for (const asGreater of greater && prefix.enchantment ? [false, true] : [false]) {
        const spend = affixCost(prefix, { greater: asGreater }) + affixCost(suffix);
        if (spend >= lo && spend <= hi) out.push({ prefix, suffix, greater: asGreater ? [prefix.name] : [] });
      }
    }
  }
  return out;
}

let nextId = 0;
const rowId = () => `loot-${++nextId}`;

/**
 * One find. The caller may fix the rarity and the kind (a re-roll of one
 * row keeps both); otherwise both are drawn.
 *
 * `dungeon` is 14 §14's own name for the place, where the scenario names one
 * (D-702), and `boss` the Classic record's boss inside it, where one is named
 * (D-703). They scope the Classic finds and nothing else: the book's own named
 * things are drawn wherever the party is.
 *
 * @returns {object|null} a row, or null where the pools hold nothing at all
 */
export function rollRow({ tier = 1, table, pools, random, rarity = null, kind = null, dungeon = null, boss = null, taken = new Set() } = {}) {
  const t = TIERS.includes(Number(tier)) ? Number(tier) : 1;
  const want = rarity ?? weighted(table.weights, random);
  const asked = kind ?? (random() < (table.combat ?? 0.5) ? "combat" : "noncombat");
  const notes = [];
  const free = list => list.filter(b => !taken.has(b.uuid));
  // 08 §4's band where the pools can meet it, everything legal where they cannot.
  const banded = (list, rarity) => {
    const inside = list.filter(b => inPriceBand(b, rarity));
    return inside.length ? inside : list;
  };

  const row = (fields) => ({
    id: rowId(), rarity: want, kind: asked, prefix: null, suffix: null, greater: [],
    fixedUuid: null, quantity: null, notes, accepted: true, locked: false, ...fields
  });

  // A named thing out of the packs: 08 §20's Epics, §10's warded gear, and
  // the Classic finds this place admits (D-702). THE FOLD'S ONE CALL SITE
  // (D-703): where a place is named and its own shelf is empty at the rarity
  // drawn, the NAMED draw takes the other rung - and the row is stamped at the
  // rarity it actually drew, because the thing IS that rarity.
  const drawn = foldAtPlace(pools, { rarity: want, kind: asked, dungeon, boss, tier: t });
  const fixedPool = drawn === "epic" || drawn === "rare"
    ? free(namedPool(pools, { rarity: drawn, kind: asked, dungeon, boss, tier: t }))
    : [];
  if (fixedPool.length && random() < (table.named ?? 0.5)) {
    const found = pick(fixedPool, random);
    if (found) {
      return row({ rarity: drawn, base: found, fixedUuid: found.uuid, name: found.name, price: found.system.cost ?? null, spent: found.system.budget ?? null });
    }
  }

  if (want === "common") {
    const base = pick(free(pools.bases[asked]), random);
    if (!base) return null;
    const made = plan({ base, rarity: "common" });
    return row({ base, name: made.name, price: made.price, spent: made.spent, quantity: quantityFor(base, random) });
  }

  // An unnamed Epic is arms: only a weapon, a suit or a shield carries the
  // enchantments a spend of four needs.
  const from = want === "epic" ? (pools.affixable.combat.length ? "combat" : asked) : asked;
  const band = bandFor(want);
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const base = pick(banded(free(pools.affixable[from]), want), random);
    if (!base) break;
    let choice = null;
    if (want === "uncommon") {
      const one = pick(singles(pools, base, band.hi), random);
      if (one) choice = one.kind === "prefix" ? { prefix: one, suffix: null, greater: [] } : { prefix: null, suffix: one, greater: [] };
    } else {
      // Tier 3 keeps an Epic at exactly four: D1 §4.6 budgets +2 there.
      const hi = want === "epic" && t === 3 ? 4 : band.hi;
      choice = pick(pairs(pools, base, band.lo, hi, { greater: want === "epic" && t === 4 }), random);
    }
    if (!choice) continue;
    const proposal = { base, rarity: want, prefixes: choice.prefix ? [choice.prefix] : [], suffix: choice.suffix, greater: choice.greater };
    const made = plan(proposal);
    if (!made.ok) continue;
    const rowNotes = want === "epic" ? [{ code: "unnamedEpic", params: { name: made.name } }] : [];
    return row({
      base, prefix: choice.prefix, suffix: choice.suffix, greater: choice.greater,
      kind: want === "epic" ? from : asked,
      name: made.name, price: made.price, spent: made.spent, notes: rowNotes
    });
  }

  // Nothing legal at that rarity: a Common find, and the window says why.
  const base = pick(free(pools.bases[asked]), random);
  if (!base) return null;
  const made = plan({ base, rarity: "common" });
  return row({
    rarity: "common", base, name: made.name, price: made.price, spent: made.spent,
    quantity: quantityFor(base, random), notes: [{ code: "noLegalRow", params: { rarity: want } }]
  });
}

/**
 * A whole find: the rows, the purse, and what the window should say. Locked
 * rows keep their place and their content.
 *
 * @returns {{rows: object[], coin: {days: number, copper: number}, count: number}}
 */
export function rollLoot({ tier = 1, table, pools, random, dungeon = null, boss = null, locked = [] } = {}) {
  const count = between(table.count[0], table.count[1], random);
  const held = new Map(locked.filter(r => r && Number.isInteger(r.index)).map(r => [r.index, r.row]));
  const rows = [];
  const taken = new Set([...held.values()].map(r => r.base?.uuid).filter(Boolean));
  const total = Math.max(count, held.size ? Math.max(...held.keys()) + 1 : 0);
  for (let i = 0; i < total; i++) {
    if (held.has(i)) {
      rows.push(held.get(i));
      continue;
    }
    const row = rollRow({ tier, table, pools, random, dungeon, boss, taken });
    if (!row) continue;
    if (row.base?.uuid) taken.add(row.base.uuid);
    rows.push(row);
  }
  return { rows, coin: purseFor(table.days), count: rows.length };
}

/* -------------------------------------------- */
/*  Review and payload                           */
/* -------------------------------------------- */

/**
 * What the window prints beside Create: refusals first, then the notes a
 * row carries. Nothing here is 08's - the chapter's refusals were spent in
 * `plan` before a row existed.
 */
export function reviewRows(rows = []) {
  const reasons = [];
  const notes = [];
  const accepted = rows.filter(r => r?.accepted);
  if (!accepted.length) reasons.push({ code: "noRows", params: {} });
  for (const row of accepted) {
    if (!row.base) {
      reasons.push({ code: "rowIllegal", params: { name: row.name ?? "", why: "" } });
      continue;
    }
    for (const note of row.notes ?? []) notes.push(note);
  }
  return { ok: reasons.length === 0, reasons, notes };
}

/**
 * The item data one accepted row becomes.
 *
 * The flags are the FORGE'S shape (`applications/forge.mjs`), not the affix
 * dialog's: `generated.base` carries the whole base system, so the Forge
 * opens on a generated item and re-forges it from what it was. A row the
 * chapter would refuse comes back null and the caller says `rowIllegal`.
 *
 * @param {object} row
 * @param {{name: string, type: string, system: object}} base  the FULL base, off the document
 * @returns {{name: string, type: string, system: object, flags: object}|null}
 */
export function itemDataFor(row, base) {
  if (!row || !base) return null;
  const rarity = row.rarity ?? "common";
  const prefixes = row.prefix ? [row.prefix] : [];
  const proposal = { base, rarity, prefixes, suffix: row.suffix ?? null, greater: [...(row.greater ?? [])] };
  const checked = plan(proposal);
  if (!checked.ok) return null;
  const made = build(proposal);
  const system = { ...made.system };
  if (row.quantity !== null && row.quantity !== undefined && system.quantity !== undefined) system.quantity = row.quantity;
  return {
    name: made.name,
    type: base.type,
    system,
    flags: {
      "azeroth-rpg": {
        grants: made.grants,
        generated: {
          base,
          prefixes: prefixes.map(a => a.id ?? null).filter(Boolean),
          prefix: row.prefix?.id ?? null,
          suffix: row.suffix?.id ?? null,
          greater: [...(row.greater ?? [])],
          signatureKind: null,
          rarity
        }
      }
    }
  };
}

/** Every pool name AZEROTH knows, so a caller can label a row without the window. */
export const KINDS = Object.freeze({ combat: "AZEROTH.Loot.Kind.Combat", noncombat: "AZEROTH.Loot.Kind.Noncombat" });

/** The scenarios as `config.mjs` holds them, for a select. */
export function scenarioLabels() {
  return Object.fromEntries(SCENARIOS.map(key => [key, AZEROTH.lootScenarios?.[key] ?? key]));
}
