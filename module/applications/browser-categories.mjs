/**
 * The compendium browser's category table — pure data, no Foundry imports.
 *
 * SEPARATE FROM THE APPLICATION ON PURPOSE. `compendium-browser.mjs` reads
 * `foundry.applications.api` at import time, so importing it under Vitest
 * throws `foundry is not defined` and the table cannot be tested at all. The
 * same rule that keeps `module/rules/` Foundry-free applies here: the data is
 * checkable, the widget is not.
 */

import { AZEROTH } from "../config.mjs";
import { coins, copperFrom } from "../helpers/coins.mjs";

/**
 * Packs the browser deliberately does not carry.
 *
 * **A pack with no category is invisible, and that looks exactly like a pack
 * with no content.** Naming the exclusions is what lets a test assert that
 * every pack is either browsable or knowingly not — otherwise a thirteenth
 * pack can be added and simply never appear.
 */
export const NOT_BROWSABLE = Object.freeze({
  criticals:
    "RollTable, not embeddable content — drawn by the roll pipeline and read in the Tables sidebar",
  rules: "JournalEntry, not embeddable content — it is read in the Journals sidebar and is what @UUID links point at"
});

export const CATEGORIES = Object.freeze({
  talents: {
    pack: "azeroth-rpg.talents",
    label: "AZEROTH.Browser.Talents",
    fields: ["system.className", "system.branch", "system.tier", "system.ranks"],
    filters: () => ({
      className: { label: "AZEROTH.Browser.Class", path: "system.className" },
      branch: { label: "AZEROTH.Browser.Branch", path: "system.branch" },
      tier: { label: "AZEROTH.Browser.BranchTier", path: "system.tier" }
    })
  },
  spells: {
    pack: "azeroth-rpg.spells",
    label: "AZEROTH.Browser.Spells",
    fields: ["system.school", "system.tier", "system.mana", "system.classes"],
    filters: () => ({
      school: { label: "AZEROTH.Browser.School", path: "system.school", choices: AZEROTH.schools },
      tier: { label: "AZEROTH.Browser.Tier", path: "system.tier" },
      classes: { label: "AZEROTH.Browser.ClassAccess", path: "system.classes", kind: "includes" }
    })
  },
  careers: {
    pack: "azeroth-rpg.careers",
    label: "AZEROTH.Browser.Careers",
    fields: ["system.tier", "system.grantor", "system.inCareer"],
    filters: () => ({
      tier: { label: "AZEROTH.Browser.Tier", path: "system.tier", choices: AZEROTH.careerTiers },
      inCareer: { label: "AZEROTH.Browser.InCareerSkill", path: "system.inCareer", choices: AZEROTH.skills, kind: "includes" }
    })
  },
  classes: {
    pack: "azeroth-rpg.classes",
    label: "AZEROTH.Browser.Classes",
    fields: ["system.frame", "system.schools"],
    filters: () => ({
      frame: { label: "AZEROTH.Browser.Frame", path: "system.frame", choices: AZEROTH.frames }
    })
  },
  races: {
    pack: "azeroth-rpg.races",
    label: "AZEROTH.Browser.Races",
    fields: ["system.size", "system.classes"],
    filters: () => ({
      size: { label: "AZEROTH.Browser.Size", path: "system.size", choices: AZEROTH.sizes }
    })
  },
  weapons: {
    pack: "azeroth-rpg.weapons",
    label: "AZEROTH.Browser.Weapons",
    fields: ["system.rating", "system.range", "system.traits", "system.rarity", "system.cost", "system.source.section"],
    filters: () => ({
      shelf: { label: "AZEROTH.Browser.Shelf", path: "system.source.section", kind: "tail" },
      traits: { label: "AZEROTH.Item.Traits", path: "system.traits", kind: "includes" },
      rarity: { label: "AZEROTH.Browser.Rarity", path: "system.rarity", choices: AZEROTH.rarities },
      // 08 §2's coin, not copper: the bound is typed as `2s` and parsed (D-672).
      cost: { label: "AZEROTH.Browser.Price", path: "system.cost", kind: "range", coin: true }
    })
  },
  armor: {
    pack: "azeroth-rpg.armor",
    label: "AZEROTH.Browser.Armor",
    // `system.traits` was NOT indexed, so a suit could be neither filtered by
    // its traits nor shown carrying any (the lead, 2026-09-07). An unindexed
    // field silently reads as absent rather than erroring, which is why the
    // gap was invisible.
    fields: ["system.category", "system.cuts", "system.traits", "system.rarity", "system.cost"],
    filters: () => ({
      category: { label: "AZEROTH.Browser.Category", path: "system.category", choices: AZEROTH.armorCategories },
      cut: { label: "AZEROTH.Item.Cuts", path: "system.cuts", kind: "includes", choices: AZEROTH.armorCuts },
      traits: { label: "AZEROTH.Item.Traits", path: "system.traits", kind: "includes" },
      rarity: { label: "AZEROTH.Browser.Rarity", path: "system.rarity", choices: AZEROTH.rarities },
      // 08 §2's coin, not copper: the bound is typed as `2s` and parsed (D-672).
      cost: { label: "AZEROTH.Browser.Price", path: "system.cost", kind: "range", coin: true }
    })
  },
  gear: {
    pack: "azeroth-rpg.gear",
    label: "AZEROTH.Browser.Gear",
    fields: [
      "system.rarity", "system.cost", "system.traits", "system.source.section",
      // 08 §12's Use and §11's containers, the two things a reader most wants
      // to narrow 446 items by.
      //
      // NOT `system.augment`: it is DERIVED (D-674) and so is absent from the
      // stored document that `getIndex` reads. A filter on it would have
      // matched nothing, in silence, which is the same fault that lost armor
      // its traits. 08 §9's shelf is the facet that answers the question.
      "system.use.kind", "system.capacity.weight", "system.capacity.count",
      // 08 §11's slot (D-686, and thirteen of them since D-689), stored
      // rather than derived, so the index holds it and the facet can answer
      // *what can I wear on my finger*.
      "system.slot",
      // 08 §12's food and drink (D-733), stored for the same reason: a Short
      // Rest needs one of each and *what can I eat* is a shopping question.
      "system.provision"
    ],
    filters: () => ({
      shelf: { label: "AZEROTH.Browser.Shelf", path: "system.source.section", kind: "tail" },
      slot: { label: "AZEROTH.Browser.Slot", path: "system.slot", choices: AZEROTH.wornSlots },
      provision: { label: "AZEROTH.Browser.Provision", path: "system.provision", choices: AZEROTH.provisionKinds },
      use: { label: "AZEROTH.Item.Use", path: "system.use.kind", choices: AZEROTH.consumableKinds },
      traits: { label: "AZEROTH.Item.Traits", path: "system.traits", kind: "includes" },
      rarity: { label: "AZEROTH.Browser.Rarity", path: "system.rarity", choices: AZEROTH.rarities },
      // 08 §2's coin, not copper: the bound is typed as `2s` and parsed (D-672).
      cost: { label: "AZEROTH.Browser.Price", path: "system.cost", kind: "range", coin: true }
    })
  },
  traits: {
    pack: "azeroth-rpg.traits",
    label: "AZEROTH.Browser.Traits",
    fields: ["system.kind", "system.family", "system.school"],
    filters: () => ({
      kind: { label: "AZEROTH.Browser.TraitKind", path: "system.kind", choices: AZEROTH.traitKinds }
    })
  },
  affixes: {
    pack: "azeroth-rpg.affixes",
    label: "AZEROTH.Browser.Affixes",
    // 08 publishes the POOLS and Foundry holds the cross-product (D-377), so
    // what is browsable here is the pool: what an affix costs, what it goes on,
    // and the rarity it first appears at.
    fields: [
      "system.rarity", "system.budget",
      "flags.azeroth-rpg.affix.kind", "flags.azeroth-rpg.affix.family",
      "flags.azeroth-rpg.affix.goesOn"
    ],
    filters: () => ({
      kind: { label: "AZEROTH.Browser.AffixKind", path: "flags.azeroth-rpg.affix.kind" },
      family: { label: "AZEROTH.Browser.AffixFamily", path: "flags.azeroth-rpg.affix.family" },
      rarity: { label: "AZEROTH.Browser.Rarity", path: "system.rarity", choices: AZEROTH.rarities }
    })
  },
  conditions: {
    pack: "azeroth-rpg.conditions",
    label: "AZEROTH.Browser.Conditions",
    fields: [],
    filters: () => ({})
  },
  legacies: {
    pack: "azeroth-rpg.legacies",
    label: "AZEROTH.Browser.Legacies",
    fields: ["system.race", "system.className"],
    filters: () => ({})
  },
  bestiary: {
    pack: "azeroth-rpg.bestiary",
    label: "AZEROTH.Browser.Bestiary",
    fields: [
      "system.weightClass", "system.size", "system.creatureType",
      "system.tier", "system.corruption", "system.dungeon"
    ],
    filters: () => ({
      weightClass: { label: "AZEROTH.Browser.WeightClass", path: "system.weightClass", choices: AZEROTH.weightClasses },
      creatureType: { label: "AZEROTH.Browser.CreatureType", path: "system.creatureType", choices: AZEROTH.creatureTypes },
      tier: { label: "AZEROTH.Browser.Tier", path: "system.tier" },
      size: { label: "AZEROTH.Browser.Size", path: "system.size", choices: AZEROTH.sizes },
      corruption: { label: "AZEROTH.Browser.Corruption", path: "system.corruption", choices: AZEROTH.corruptionTracks }
    })
  }
});

/** `11 · Adventuring gear · Trade kits` → `Trade kits`, the row's own shelf. */
export function sectionTail(section) {
  // THE SEPARATOR IS NOT ALWAYS A MIDDOT. 08 writes a weapon's section with an
  // em-dash (`7 \u2014 Light weapon`) and gear's with middots
  // (`11 \u00b7 Adventuring gear \u00b7 Trade kits`), and this split on the middot alone
  // \u2014 so every weapon shelf but `20 \u00b7 Unique` came back as no shelf at all,
  // and the Shelf facet offered one option out of nine (2026-09-07). The other
  // two readers of a section tail, `rules/weight.mjs` and `rules/icons.mjs`,
  // already take all three dashes.
  //
  // The whitespace around the class is load-bearing: a bare hyphen inside it
  // splits *One-handed weapon* on its own hyphen (D-675).
  const parts = String(section ?? "").split(/\s+[\u00b7\u2014\u2013]\s+/).map(s => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : null;
}

/** Localize where a key is one, else the value itself. */
function loc(key) {
  return globalThis.game?.i18n?.localize?.(key) ?? key;
}

/** A row's meta is a run of short strings; the longest a prose field may take before it is cut. */
export const META_PROSE_MAX = 40;

/**
 * A prose field cut to a row's width, at a word, with an ellipsis. A career's
 * Grantor is a sentence - *A clan or a tribe, and the camp itself, which has
 * to keep bringing you things for it to mean anything* - and printed whole it
 * pushed the Camp Chieftain's row out of the list (the lead, 2026-09-06). The
 * whole string rides the row's tooltip; only the meta is cut.
 */
export function clip(text, max = META_PROSE_MAX) {
  const s = String(text ?? "").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max / 2 ? cut.slice(0, at) : cut.slice(0, max)).replace(/[,;:.\s]+$/, "")}…`;
}

/**
 * An item's traits as one short run, or null where it has none.
 *
 * A trait name carries its own rating - `Versatile (5)`, `Pierce 2` - so the
 * run is the names as the pack spells them, clipped as a whole rather than
 * per trait: cutting one trait's name mid-word reads as a different trait.
 */
export function traitRun(traits) {
  const names = (Array.isArray(traits) ? traits : []).map(t => String(t).trim()).filter(Boolean);
  return names.length ? clip(names.join(", ")) : null;
}

/**
 * A row's meta run: the indexed fields a category already loads, as short
 * strings. The browser filtered on these and never showed them, so two
 * spells with similar names were indistinguishable in the list.
 * @param {string} key      The category key.
 * @param {object} entry    An indexed entry: { name, system, flags }.
 * @returns {string[]}
 */
export function summary(key, entry) {
  const s = entry?.system ?? {};
  const f = entry?.flags?.["azeroth-rpg"] ?? {};
  const parts = [];
  const tier = v => (v !== null && v !== undefined && v !== "" ? `T${v}` : null);
  const enumLabel = (map, v) => (v && map?.[v] ? loc(map[v]) : null);
  switch (key) {
    case "talents": parts.push(s.className, s.branch, tier(s.tier)); break;
    case "spells": parts.push(enumLabel(AZEROTH.schools, s.school), tier(s.tier), s.mana != null ? `${s.mana} ${loc("AZEROTH.Card.Mana")}` : null); break;
    case "careers": parts.push(enumLabel(AZEROTH.careerTiers, s.tier), clip(s.grantor)); break;
    case "classes": parts.push(enumLabel(AZEROTH.frames, s.frame), ...(s.schools ?? []).map(k => enumLabel(AZEROTH.schools, k))); break;
    case "races": parts.push(enumLabel(AZEROTH.sizes, s.size)); break;
    // A price is printed in the coin a shop would name (08 §2, D-672): a
    // longsword is `2s 40c`, and `240c` is not a price anybody quotes.
    // THE TRAITS WERE INDEXED AND NEVER PRINTED on any of the three: a
    // longsword's row said `R4 · Common · 2s 40c` and not that it is Versatile,
    // which is the one thing that distinguishes it from the next blade (the
    // lead, 2026-09-07). Clipped, because a §20 unique carries four.
    case "weapons": parts.push(s.rating != null ? `R${s.rating}` : null, s.range != null ? `${s.range} ft` : null, traitRun(s.traits), enumLabel(AZEROTH.rarities, s.rarity), coins(s.cost)); break;
    case "armor": parts.push(enumLabel(AZEROTH.armorCategories, s.category), ...(s.cuts ?? []).map(k => enumLabel(AZEROTH.armorCuts, k)), traitRun(s.traits), enumLabel(AZEROTH.rarities, s.rarity), coins(s.cost)); break;
    case "gear": parts.push(sectionTail(s.source?.section), traitRun(s.traits), enumLabel(AZEROTH.rarities, s.rarity), coins(s.cost)); break;
    case "traits": parts.push(enumLabel(AZEROTH.traitKinds, s.kind), enumLabel(AZEROTH.schools, s.school)); break;
    case "affixes": parts.push(f.affix?.kind, f.affix?.family, f.affix?.cost != null ? `${f.affix.cost} pts` : null); break;
    case "legacies": parts.push(s.race, s.className); break;
    case "bestiary": parts.push(enumLabel(AZEROTH.weightClasses, s.weightClass), tier(s.tier), enumLabel(AZEROTH.creatureTypes, s.creatureType)); break;
    default: break;
  }
  return parts.filter(p => p !== null && p !== undefined && p !== "").map(String);
}

/* -------------------------------------------- */
/*  The filter engine                            */
/* -------------------------------------------- */

/**
 * WHAT A FILTER IS, AND WHY IT LIVES HERE.
 *
 * The browser's matching used to be a nested loop inside the application's
 * `#apply()`, which imports `foundry.applications.api` and therefore cannot be
 * loaded under Vitest at all - so every filter was testable only by driving a
 * live Foundry. Moving the judgement here makes the whole feature checkable in
 * Node, and leaves the application holding the DOM and nothing else.
 *
 * A filter's `kind` says how a value is judged:
 *
 *   set       a scalar equals one of the chosen values (the default)
 *   includes  an ARRAY contains the chosen values - `any` of them or `all`
 *   tail      a scalar's last `·`-separated part equals one of them, so
 *             `11 · Adventuring gear · Trade kits` files under *Trade kits*
 *   range     a number between a floor and a ceiling, both optional
 *
 * `includes` is the one the lead's screenshot asks for by name: a Properties
 * box with **All of above** and **Any of above** beside it.
 */

/** A filter with nothing chosen. `mode` matters only to `includes`. */
export function emptyFilterState() {
  return { values: new Set(), mode: "any", min: null, max: null };
}

/** Whether a state would narrow anything at all. */
export function isActive(state) {
  if (!state) return false;
  return state.values?.size > 0 || state.min !== null || state.max !== null;
}

/** Read a dotted path off an indexed entry. No Foundry: `getProperty` is not available here. */
export function readPath(source, path) {
  return String(path ?? "").split(".").reduce((o, k) => (o == null ? undefined : o[k]), source);
}

/**
 * The value(s) one entry offers a filter, always as an array of strings.
 * A `tail` filter offers the shelf; everything else offers what it holds.
 */
export function valuesFor(entry, def) {
  const raw = readPath(entry, def.path);
  const list = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const v of list) {
    if (v === null || v === undefined || v === "") continue;
    const s = def.kind === "tail" ? sectionTail(v) : String(v);
    if (s) out.push(s);
  }
  return out;
}

/** Whether one entry passes one filter. An empty state passes everything. */
export function matchesFilter(entry, def, state) {
  if (!isActive(state)) return true;
  if (def.kind === "range") {
    // A price is stored in copper and typed in 08 §2's coin (D-672), so the
    // bounds are parsed rather than read as numbers.
    const n = Number(readPath(entry, def.path));
    if (!Number.isFinite(n)) return false;
    if (state.min !== null && n < state.min) return false;
    if (state.max !== null && n > state.max) return false;
    return true;
  }
  const held = valuesFor(entry, def);
  const wanted = [...state.values];
  if (!wanted.length) return true;
  // ALL means every chosen value is present, not that the entry has only
  // those: a longsword filtered on Versatile AND Reach must carry both.
  return def.kind === "includes" && state.mode === "all"
    ? wanted.every(w => held.includes(w))
    : wanted.some(w => held.includes(w));
}

/**
 * Whether an entry survives every filter and the search box together.
 *
 * @param {object} entry
 * @param {object} defs     the category's filter definitions, keyed by id
 * @param {Map<string, object>} states  filter id → state
 * @param {RegExp|null} query
 * @param {(s: string) => string} clean  the search's own cleaner
 */
export function entryMatches(entry, defs, states, query = null, clean = s => s) {
  if (query && !query.test(clean(entry?.name ?? ""))) return false;
  for (const [id, def] of Object.entries(defs ?? {})) {
    if (!matchesFilter(entry, def, states?.get(id))) return false;
  }
  return true;
}

/**
 * Every value a filter could take, with how many entries carry it.
 *
 * The COUNT is the point: a facet listing forty trait names, thirty-eight of
 * which match nothing under the current narrowing, is a worse list than no
 * facet. Counts are computed against the entries that pass every OTHER filter,
 * which is what makes them true rather than decorative.
 */
export function facetOptions(entries, defs, states, id, { label = k => k } = {}) {
  const def = defs[id];
  if (!def || def.kind === "range") return [];
  const others = Object.fromEntries(Object.entries(defs).filter(([k]) => k !== id));
  const pool = entries.filter(e => entryMatches(e, others, states));

  const counts = new Map();
  for (const e of pool) for (const v of new Set(valuesFor(e, def))) counts.set(v, (counts.get(v) ?? 0) + 1);

  // A filter naming its choices keeps the config's ORDER - Common before
  // Legendary, not alphabetical - and lists a choice with no entries as a
  // greyed zero rather than hiding it, so the vocabulary stays visible.
  const chosen = states?.get(id)?.values ?? new Set();
  const rows = def.choices
    ? Object.keys(def.choices).map(value => ({ value, label: label(def.choices[value]) }))
    : [...counts.keys()].sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b)).map(value => ({ value, label: value }));
  return rows.map(r => ({ ...r, count: counts.get(r.value) ?? 0, checked: chosen.has(r.value) }));
}

/** What a category can be sorted by: always the name, plus its own numbers. */
export const SORT_KEYS = Object.freeze({
  weapons: ["name", "system.rating", "system.cost", "system.weight"],
  armor: ["name", "system.cost", "system.weight"],
  gear: ["name", "system.cost", "system.weight"],
  spells: ["name", "system.tier", "system.mana"],
  talents: ["name", "system.tier"],
  careers: ["name", "system.tier"],
  bestiary: ["name", "system.tier"],
  affixes: ["name", "system.budget"]
});

/** The sort keys for one category, the name always first. */
export function sortKeysFor(key) {
  return SORT_KEYS[key] ?? ["name"];
}

/**
 * Entries in order. A missing value sorts LAST in both directions - an item
 * with no Rating is not a Rating of zero, and floating them to the top of an
 * ascending sort buries what the reader asked for.
 */
export function sortEntries(entries, key = "name", dir = "asc") {
  const sign = dir === "desc" ? -1 : 1;
  const of = e => (key === "name" ? e?.name : readPath(e, key));
  return [...entries].sort((a, b) => {
    const [x, y] = [of(a), of(b)];
    const xm = x === null || x === undefined || x === "";
    const ym = y === null || y === undefined || y === "";
    if (xm || ym) return xm && ym ? 0 : (xm ? 1 : -1);
    const nx = Number(x);
    const ny = Number(y);
    if (Number.isFinite(nx) && Number.isFinite(ny) && nx !== ny) return (nx - ny) * sign;
    return String(x).localeCompare(String(y)) * sign;
  });
}

/**
 * A typed range bound as a number. A price is 08 §2's coin, so *2s* is 200
 * copper; everything else is a plain number.
 */
export function boundFrom(text, { coin = false } = {}) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  const n = coin ? copperFrom(s) : Number(s);
  return Number.isFinite(n) ? n : null;
}
