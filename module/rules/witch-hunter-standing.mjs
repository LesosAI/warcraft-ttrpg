/**
 * **WHERE A WITCH HUNTER STANDS: THE TOME, THE BREWS ACTING, THE OILS AND THE PANEL** (02 §7's Field Brews,
 * Tome of Silver and Ash, Studied and Decoctions; 08 §12's *Witch hunter's brews*; the Witch Hunter plan's
 * wave 2a-A). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The law of each rule is wave 1b's (`tome.mjs`, `toxicity.mjs`, `brewing.mjs`, `witch-hunter-brews.mjs`,
 * `tempo.mjs`); this module is the ONE reading of what the doors STORE for it, so the sheet, the roll dialog,
 * the attack door, the data preparation and the Resist roll cannot read the same flags two ways:
 *
 * - **The Tome** is a flag on the character (`TOME_FLAG`): the types known, the types **Studied**, the types
 *   damaged since the last learning chance (the Long Rest's Investigation Test), the types defeated since the
 *   last Long Rest (Decoctions), and whether the learning Test has been made. `cleanTome` reads it whole.
 * - **A brew acting** is an Active Effect carrying the stamped brew (`BREW_EFFECT_FLAG`), which `stampBrew`
 *   made at the moment of the drink. Nothing about Toxicity is stored: `toxicityOf` counts the carriers
 *   (`toxicity.mjs#toxicityState`), so the penalty falls the moment an elixir ends.
 * - **An oil** is a flag on the weapon (`OIL_FLAG`), one at a time (*A weapon carries one oil at a time*), read
 *   through `oilStands` against the world clock (*1 hour passes*); the fight's end takes it off at the door.
 * - **What a weapon attack gains against one creature** is `witchHunterBlowFor`: the Tome's Armor Point and
 *   Ward, Studied's damage and Tempo, Hunter's oil, Silvering oil and the Construct Decoction, each a named row.
 * - **What the Resist roll reads**: the weakness Bane a card carries (`weaknessRecord`, `weaknessBaneOn`) and
 *   Studied's Boon against a Studied creature's ability (`studiedBoonOn`).
 * - **What the dialog reads**: overdose's −1 a point on every Test, ticked, and a brew's Boon (`brewLines`).
 */

import { BREW_IDENTIFIERS, brewEffects, brewOf, isBrewIdentifier } from "./witch-hunter-brews.mjs";
import { decoctionDrinkRefusal, decoctionLimit, dosesFor, knownCount, knownRefusal, FORMULA_KINDS } from "./brewing.mjs";
import { drinkPreview, nonMakerDrink, toxicityState } from "./toxicity.mjs";
import {
  CREATURE_TYPES, TOME_START, cleanType, knownWith, learnBoons, learnDC, learnRefusal, learnableTypes, studiedCount,
  studiedResistBoon, studiedTypes, tomeHitBonus, weaknessBane, weaknessOf
} from "./tome.mjs";

const int = v => Math.trunc(Number(v)) || 0;
const tierOf = t => Math.min(4, Math.max(1, int(t) || 1));
const asList = v => (Array.isArray(v) ? v : (v instanceof Set ? [...v] : []));

/** The class's identifier. */
export const WITCH_HUNTER_CLASS = "witch-hunter";

/** The Tome on the character: `{known, studied, damaged, defeated, learned, learnOpen, started}`. */
export const TOME_FLAG = "whTome";
/** The formulas the character knows, by identifier (the pick Field Brews grants). */
export const FORMULAS_FLAG = "whFormulas";
/** The brewing a rest opens: `{generation, rest, open}` (the inscription window's shape, `documents/runes.mjs`). */
export const BREW_WINDOW_FLAG = "whBrewWindow";
/** On an Active Effect: the stamped brew acting on its bearer (`stampBrew`'s answer, with its maker). */
export const BREW_EFFECT_FLAG = "whBrew";
/** On a brew item: `{maker, generation, brewed, type, school, spellDC, tier}` - what it was brewed as. */
export const BREWED_FLAG = "whBrewed";
/** On a weapon: the oil coating it (`{identifier, name, coating, at, by}`). */
export const OIL_FLAG = "whOil";
/** On an Active Effect: 02's The Last Hunt standing (wave 2a-B lays it). */
export const LAST_HUNT_FLAG = "whLastHunt";
/** On a token: Fadeleaf drops wrote its sight (put back when the drops end). */
export const FADELEAF_SIGHT_MARK = "whFadeleafSight";
/** On a card: the weakness record its Resist reads (`weaknessRecord`). */
export const WEAKNESS_CARD_FLAG = "whWeakness";
/** On a card: the bomb thrown (its failure's extra lines, Silver dust's). */
export const BOMB_CARD_FLAG = "whBomb";

/** An oil's span in world seconds (*1 hour passes*). */
export const OIL_SECONDS = 3600;
/** Fadeleaf drops' sight in feet (*you see in darkness within 60 feet*). */
export const FADELEAF_FEET = 60;

/** Whether a set of class identifiers holds the Witch Hunter. */
export function isWitchHunterClass(classKeys = []) {
  return asList(classKeys).includes(WITCH_HUNTER_CLASS);
}

/** The eight types in 14 §1's order, cleaned and once each. */
function typeList(v) {
  const have = new Set(asList(v).map(cleanType).filter(Boolean));
  return CREATURE_TYPES.filter(t => have.has(t));
}

/** On an Active Effect: the type The First Tome's The Drust Chapter made Studied to the encounter's end (D-2162). */
export const DRUST_STUDIED_FLAG = "whDrustStudied";

/**
 * **THE TYPES A CARRIED BOOK ADDS** (08 §20's The First Tome of Silver and Ash, Every Lesson Written:
 * *knows two additional creature types of their choice*; D-2162): the types chosen on every carried
 * item `signatureEffects().knownTypes` names, each once, in 14 §1's order. Nothing is written into the
 * Tome's flag, so the types go with the book.
 *
 * @param {{knownTypes?: Array<{picks?: string[]}>}|null} signatureEffects
 * @returns {string[]}
 */
export function carriedTypes(signatureEffects = null) {
  return typeList((signatureEffects?.knownTypes ?? []).flatMap(row => asList(row?.picks)));
}

/** The types The Drust Chapter's effects in force make Studied (D-2162), each once. */
export function drustStudied(effects = []) {
  return typeList([...(effects ?? [])].filter(e => Boolean(e) && e.active !== false && e.disabled !== true)
    .map(e => e?.flags?.["azeroth-rpg"]?.[DRUST_STUDIED_FLAG]?.type ?? null));
}

/**
 * **THE TOME AS ITS READERS SEE IT, THE CARRIED BOOK INCLUDED** (D-2162): the stored flag with the
 * carried book's types known, and The Drust Chapter's type Studied while its effect stands. The flag
 * is never written from this - `effects/witch-hunter-tome.mjs#patchTome` merges onto the raw flag - so
 * a book put down takes its types with it. A Tome not begun stays not begun.
 *
 * @param {object|null} raw  the actor's `TOME_FLAG`
 * @param {object|null} signatureEffects  `actor.system.signatureEffects`
 * @param {Iterable<object>} effects  the actor's effects
 * @returns {object|null}
 */
export function withCarried(raw = null, signatureEffects = null, effects = []) {
  if (!raw || typeof raw !== "object") return raw;
  const known = carriedTypes(signatureEffects);
  const studied = drustStudied(effects);
  if (!known.length && !studied.length) return raw;
  return { ...raw, known: typeList([...asList(raw.known), ...known, ...studied]), studied: typeList([...asList(raw.studied), ...studied]) };
}

/**
 * **THE TOME OF AN ACTOR, AS ITS READERS SEE IT** (D-2162): `withCarried` over the actor's flag, its
 * derived Signatures and its effects. Pure: it reads what it is handed and writes nothing.
 *
 * @param {{getFlag?: Function, system?: object, effects?: Iterable<object>}|null} actor
 * @returns {object|null}
 */
export function tomeFlagOf(actor) {
  return withCarried(actor?.getFlag?.("azeroth-rpg", TOME_FLAG) ?? null, actor?.system?.signatureEffects ?? null, actor?.effects ?? []);
}

/**
 * **THE TOME AS STORED, READ WHOLE**: every list cleaned to 14 §1's types in its order, the two marks as
 * booleans, the open learning chance as `"short"`, `"long"` or null. A missing flag is a Tome not begun.
 *
 * @param {object|null} raw  the actor's `TOME_FLAG`
 * @returns {{known: string[], studied: string[], damaged: string[], defeated: string[], learned: boolean, learnOpen: "short"|"long"|null, started: boolean}}
 */
export function cleanTome(raw = null) {
  const r = raw && typeof raw === "object" ? raw : {};
  const known = typeList(r.known);
  return {
    known,
    // Studied names only a type known (`tome.mjs#studiedTypes`'s rule, read here once).
    studied: typeList(r.studied).filter(t => known.includes(t)),
    damaged: typeList(r.damaged),
    defeated: typeList(r.defeated),
    learned: r.learned === true,
    learnOpen: r.learnOpen === "short" || r.learnOpen === "long" ? r.learnOpen : null,
    started: known.length > 0
  };
}

/** The six keys the Tome's flag stores (`started` is derived from `known` and never stored). */
const TOME_KEYS = Object.freeze(["known", "studied", "damaged", "defeated", "learned", "learnOpen"]);
/** The four of them that are lists of types, which a patch may ADD to. */
const TOME_LISTS = Object.freeze(["known", "studied", "damaged", "defeated"]);

/**
 * **ONE WRITE OF THE TOME, MERGED ONTO THE FLAG AS IT IS NOW** (the Witch Hunter's final architect review, finding
 * 1). `effects/witch-hunter-tome.mjs#patchTome` reads the flag inside its per-actor queue and hands it here with
 * the writer's patch: `set` replaces a key whole (a learning Test's spent chance, a Long Rest's new record of
 * types defeated), then `add` puts types into a list as a union, so two records made a moment apart both stay.
 * `unstarted` refuses the write (null) where the Tome is begun already (the Tome begun is written once). Answers
 * the six keys as stored, cleaned (`cleanTome`), or null.
 *
 * @param {object|null} raw  the flag as stored now
 * @param {{set?: object, add?: object, unstarted?: boolean}} [patch]
 * @returns {{known: string[], studied: string[], damaged: string[], defeated: string[], learned: boolean, learnOpen: "short"|"long"|null}|null}
 */
export function mergeTome(raw = null, patch = {}) {
  const fresh = cleanTome(raw);
  const p = patch && typeof patch === "object" ? patch : {};
  if (p.unstarted === true && fresh.started) return null;
  const set = p.set && typeof p.set === "object" ? p.set : {};
  const add = p.add && typeof p.add === "object" ? p.add : {};
  const next = { ...fresh };
  for (const key of TOME_KEYS) if (Object.hasOwn(set, key)) next[key] = set[key];
  for (const key of TOME_LISTS) for (const type of asList(add[key])) next[key] = withType(next[key], type);
  const clean = cleanTome(next);
  return Object.fromEntries(TOME_KEYS.map(key => [key, clean[key]]));
}

/**
 * **THE TOME BEGUN**: *You know two creature types: Undead, and one of your choice.* Refused where the
 * choice is no type (`type`) or is Undead itself (`undead`), which the Tome gives already.
 *
 * @param {string|null} choice
 * @returns {{refusal: "type"|"undead"|null, known: string[]}}
 */
export function tomeStart(choice = null) {
  const t = cleanType(choice);
  if (!t) return { refusal: "type", known: [] };
  if (TOME_START.fixed.includes(t)) return { refusal: "undead", known: [] };
  return { refusal: null, known: typeList([...TOME_START.fixed, t]) };
}

/** A type added to a list (a record or the known types), 14 §1's order, once (`tome.mjs#knownWith`: no cap, P6). */
export function withType(list = [], type = null) {
  return knownWith(asList(list), type);
}

/** Whether an effect is in force. */
const live = e => Boolean(e) && e.active !== false && e.disabled !== true;
const flagsOf = e => e?.flags?.["azeroth-rpg"] ?? {};

/** Whether 02's The Last Hunt stands: an effect in force carrying `LAST_HUNT_FLAG`. */
export function lastHuntStands(effects = []) {
  return [...(effects ?? [])].some(e => live(e) && Boolean(flagsOf(e)[LAST_HUNT_FLAG]));
}

/**
 * **THE TYPES STUDIED NOW**: the ones chosen at the last rest, or every type known while The Last Hunt stands
 * (`tome.mjs#studiedTypes`).
 *
 * @param {{tome?: object, lastHunt?: boolean}} o  `tome` a `cleanTome` answer (or the raw flag)
 * @returns {string[]}
 */
export function studiedNow({ tome = null, lastHunt = false } = {}) {
  const t = cleanTome(tome);
  return studiedTypes({ studied: t.studied, known: t.known, lastHunt });
}

/**
 * The `tome` option `talent-gates.mjs#targetFactsOf` reads: the types known and the types Studied now, or
 * null for a character who keeps no Tome (every type fact then reads null, never false).
 *
 * @param {{tome?: object|null, effects?: Iterable<object>}} o
 * @returns {{known: string[], studied: string[]}|null}
 */
export function tomeFacts({ tome = null, effects = [] } = {}) {
  const t = cleanTome(tome);
  if (!t.started) return null;
  return { known: t.known, studied: studiedNow({ tome: t, lastHunt: lastHuntStands(effects) }) };
}

/* ------------------------------------------------------------------ */
/*  The brews acting                                                    */
/* ------------------------------------------------------------------ */

/**
 * **THE BREWS ACTING ON A CREATURE**: the stamped brew of every effect in force carrying `BREW_EFFECT_FLAG`, in
 * the effects' id order so a list a person reads never wobbles. A stamp naming no brew is skipped.
 *
 * @param {Iterable<object>} effects
 * @returns {object[]}
 */
export function actingBrews(effects = []) {
  return [...(effects ?? [])]
    .filter(live)
    .sort((a, b) => String(a.id ?? a._id ?? "").localeCompare(String(b.id ?? b._id ?? "")))
    .map(e => flagsOf(e)[BREW_EFFECT_FLAG])
    .filter(b => b && typeof b === "object" && isBrewIdentifier(b.identifier));
}

/** What the brews acting add together (`witch-hunter-brews.mjs#brewEffects`). */
export function brewStanding(effects = []) {
  return brewEffects(actingBrews(effects));
}

/**
 * **WHERE THE TOXICITY STANDS**, off the carriers: the brews counted, the limit, the overdose and the penalty
 * (`toxicity.mjs#toxicityState`). A non-maker's poisoned drink lays no brew carrier, so it counts nothing.
 *
 * @param {{effects?: Iterable<object>, conMod?: number, seasonedBlood?: number, refinedDecoctions?: number}} o
 */
export function toxicityOf({ effects = [], conMod = 0, seasonedBlood = 0, refinedDecoctions = 0 } = {}) {
  return toxicityState({ active: actingBrews(effects).map(b => b.identifier), conMod, seasonedBlood, refinedDecoctions });
}

/** The Decoctions acting now. */
export function decoctionsActing(effects = []) {
  return actingBrews(effects).filter(b => b.kind === "decoction").length;
}

/**
 * **WHAT A DRINK WOULD DO, JUDGED BEFORE ANYTHING IS SPENT** (D-768): for a drinker who is not a Witch Hunter,
 * the poison (`toxicity.mjs#nonMakerDrink`); for a Witch Hunter, the overdose it would bring (never a refusal,
 * P3) and the Decoction limit (*You may be under the effect of only one Decoction at a time*), which refuses.
 *
 * @param {{identifier: string, witchHunter?: boolean, effects?: Iterable<object>, conMod?: number, seasonedBlood?: number,
 *   refinedDecoctions?: number, makerDC?: number|null}} o
 * @returns {{refusal: "decoctionLimit"|"notDrink"|null, nonMaker: object|null, preview: object|null}}
 */
export function drinkJudgement({ identifier, witchHunter = false, effects = [], conMod = 0, seasonedBlood = 0, refinedDecoctions = 0, makerDC = null } = {}) {
  const row = brewOf(identifier);
  if (!row || !["elixir", "decoction"].includes(row.kind)) return { refusal: "notDrink", nonMaker: null, preview: null };
  if (witchHunter !== true) return { refusal: null, nonMaker: nonMakerDrink({ identifier, witchHunter: false, spellDC: makerDC }), preview: null };
  if (row.kind === "decoction") {
    const why = decoctionDrinkRefusal({ active: decoctionsActing(effects), refinedDecoctions });
    if (why) return { refusal: why, nonMaker: null, preview: null };
  }
  const active = actingBrews(effects).map(b => b.identifier);
  return { refusal: null, nonMaker: null, preview: drinkPreview(identifier, { active, conMod, seasonedBlood, refinedDecoctions }) };
}

/** The elixirs Silverleaf tonic ends: every brew acting that is an elixir (*It ends every elixir acting on you*). */
export function elixirsSilverleafEnds(effects = []) {
  return [...(effects ?? [])]
    .filter(e => live(e) && brewOf(flagsOf(e)[BREW_EFFECT_FLAG]?.identifier)?.kind === "elixir")
    .map(e => String(e.id ?? e._id ?? ""))
    .filter(Boolean)
    .sort();
}

/** Mageroyal draught's Energy at the turn's refill, added to 05 §12's 3. */
export function brewRefillExtra(effects = []) {
  return brewStanding(effects).refill.energy;
}

/** The conditions the brews acting refuse (Goldthorn draught, the Ooze Decoction), for `conditionImmunities`. */
export function brewImmunities(effects = []) {
  return brewStanding(effects).immune;
}

/** The highest Firebloom cordial in force: what it adds to the Spell DC for Signs. */
export function brewSignDC(effects = []) {
  return brewStanding(effects).signDC;
}

/**
 * **WHAT THE ROLL DIALOG DRAWS FOR THE BREWS** (P3, F3: *-1 on every Test*; the brews' Boons): one line a
 * source, in `modifiers.mjs`' shape (`{id, label, name, boons, banes, modifier, checked}`). Overdose is the
 * roller's own state, so automatic and checked, on every Test. A Boon is checked where the brew names the Test
 * outright (Wintersbite draught's Reflex Resilience and Parry, the Humanoid Decoction's Insight and Deception),
 * and unchecked where what the Test is FOR is the table's call (D2 §12: Fadeleaf drops' *to find a hidden
 * creature*, the Beast Decoction's *to track*). `labels` are the lang keys the door hands in.
 *
 * @param {{effects?: Iterable<object>, conMod?: number, seasonedBlood?: number, refinedDecoctions?: number,
 *   kind?: string, skill?: string|null, resilience?: string|null, parry?: boolean}} o
 * @returns {Array<{id: string, label: string, name: string, boons: number, banes: number, modifier: number, checked: boolean}>}
 */
export function brewLines({ effects = [], conMod = 0, seasonedBlood = 0, refinedDecoctions = 0, kind = "skill", skill = null, resilience = null, parry = false } = {}) {
  const lines = [];
  const tox = toxicityOf({ effects, conMod, seasonedBlood, refinedDecoctions });
  if (tox.overdose > 0) {
    lines.push({ id: "wh-overdose", label: "AZEROTH.WitchHunter.Overdose", name: String(tox.overdose), boons: 0, banes: 0, modifier: tox.penalty, checked: true });
  }
  const names = new Map(actingBrews(effects).map(b => [b.identifier, b.name ?? brewOf(b.identifier)?.name ?? b.identifier]));
  for (const boon of brewStanding(effects).boons) {
    const reaches = (boon.test === "resilience" && kind === "resilience" && boon.resilience === resilience)
      || (boon.test === "parry" && kind === "attack" && parry === true)
      || (boon.test === "skill" && kind === "skill" && boon.skill === skill);
    if (!reaches) continue;
    lines.push({
      id: `wh-boon-${boon.source}-${boon.test}-${boon.skill ?? boon.resilience ?? "any"}`,
      label: "AZEROTH.WitchHunter.BrewBoon", name: names.get(boon.source) ?? boon.source,
      boons: 1, banes: 0, modifier: 0, checked: boon.ticked === true
    });
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Oils                                                                */
/* ------------------------------------------------------------------ */

/**
 * **WHETHER AN OIL STILL COATS ITS WEAPON** (*until the fight ends or 1 hour passes, whichever comes first*):
 * laid less than an hour ago by the world's clock. The fight's end is the door's, which takes every oil off.
 *
 * @param {object|null} oil  the weapon's `OIL_FLAG`
 * @param {{now?: number}} [o]  the world time in seconds
 * @returns {boolean}
 */
export function oilStands(oil = null, { now = 0 } = {}) {
  if (!oil || typeof oil !== "object" || !brewOf(oil.identifier) || brewOf(oil.identifier).kind !== "oil") return false;
  const at = Number(oil.at);
  if (!Number.isFinite(at)) return true;
  return Number(now) - at < OIL_SECONDS;
}

/**
 * **WHAT A WEAPON ATTACK GAINS AGAINST ONE CREATURE** (02's Tome of Silver and Ash and Studied; 08's Hunter's
 * oil, Silvering oil and the Construct Decoction). Every number is a row with its source, for the card's
 * provenance:
 *
 * - a type known: 1 Armor Point and 1 Ward of every school ignored (P7);
 * - a type **Studied**: extra damage equal to the tier, and 1 more Tempo on a hit;
 * - Hunter's oil: its damage against the type it names;
 * - Silvering oil: its damage, 1 Armor Point and 1 Fire Ward ignored, against an undead or a demon (D-753's
 *   kinds, P19);
 * - the Construct Decoction: 1 more Armor Point ignored, against any creature.
 *
 * @param {{types?: string[], kinds?: Iterable<string>, tome?: {known?: string[], studied?: string[]}|null, tier?: number,
 *   oil?: object|null, penetration?: number}} o  `oil` the stamped coating standing; `penetration` the brews' (Construct)
 * @returns {{rating: number, penetration: number, wardPierce: number, firePierce: number, tempo: number,
 *   rows: Array<{key: string, value: number}>}}
 */
export function witchHunterBlowFor({ types = [], kinds = [], tome = null, tier = 1, oil = null, penetration = 0 } = {}) {
  const out = { rating: 0, penetration: 0, wardPierce: 0, firePierce: 0, tempo: 0, rows: [] };
  const type = typeList(types)[0] ?? null;
  if (tome) {
    const hit = tomeHitBonus({ type, known: tome.known ?? [], studied: tome.studied ?? [], tier: tierOf(tier) });
    if (hit.known) {
      out.penetration += hit.penetration;
      out.wardPierce += hit.wardPierce;
      out.rows.push({ key: "tome", value: hit.penetration });
    }
    if (hit.studied) {
      out.rating += hit.extraDamage;
      out.tempo += hit.tempo;
      out.rows.push({ key: "studied", value: hit.extraDamage });
    }
  }
  const coating = oil?.coating ?? null;
  if (coating) {
    const against = coating.against ?? null;
    const kindSet = new Set(asList(kinds));
    const reaches = !against ? false
      : against.type ? Boolean(type) && cleanType(against.type) === type
        : Array.isArray(against.targetKind) ? against.targetKind.some(k => kindSet.has(k)) : false;
    if (reaches) {
      if (int(coating.damage) > 0) {
        out.rating += int(coating.damage);
        out.rows.push({ key: `oil:${oil.identifier}`, value: int(coating.damage) });
      }
      if (coating.pierce) {
        out.penetration += int(coating.pierce.armor);
        out.firePierce += int(coating.pierce.ward?.fire);
      }
    }
  }
  if (int(penetration) > 0) {
    out.penetration += int(penetration);
    out.rows.push({ key: "decoction", value: int(penetration) });
  }
  return out;
}

/**
 * A target's Ward map with what the blow ignores taken off: `all` from every school, `fire` from Fire as well,
 * never below 0. The map is the snapshot's (`roll-dialog.mjs#targetSnapshots`'s `wardBySchool`).
 *
 * @param {Record<string, number>} ward
 * @param {{all?: number, fire?: number}} pierce
 * @returns {Record<string, number>}
 */
export function wardAfterPierce(ward = {}, { all = 0, fire = 0 } = {}) {
  const out = {};
  for (const [school, n] of Object.entries(ward ?? {})) {
    out[school] = Math.max(0, int(n) - int(all) - (school === "fire" ? int(fire) : 0));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  What the Resist roll reads                                          */
/* ------------------------------------------------------------------ */

/**
 * **THE WEAKNESS RECORD A CARD CARRIES** (02's Tome: *It also takes a Bane on its Resilience Test against a Sign
 * from **Signs** or a bomb from **Field Brews** that its row in the weakness table names*): the types the maker
 * knows that the row names for this source, so the Resist roll judges the resister's own type against it with no
 * read of the maker's flags. Null where no known type's row names the source.
 *
 * @param {{known?: string[], source?: {sign?: string, bomb?: string}, name?: string}} o
 * @returns {{types: string[], source: object, name: string}|null}
 */
export function weaknessRecord({ known = [], source = {}, name = "" } = {}) {
  const types = typeList(known).filter(t => weaknessBane({ type: t, known, source }) > 0);
  return types.length ? { types, source: { ...source }, name: String(name ?? "") } : null;
}

/**
 * **WHERE A CARD CARRIES ITS WEAKNESS RECORD**: at the top of a Sign's or a bomb's card (`whWeakness`), or on the check
 * row an area Test's card copied off its Region (the Ash ring's Spirit Test at a turn's start: `area.check.whWeakness`;
 * the architect review's A1, wave 2d-A, D-2131). Null where neither holds one.
 *
 * @param {object} flags  the card's `flags["azeroth-rpg"]`
 * @returns {{types: string[], source: object, name: string}|null}
 */
export function weaknessRecordOnCard(flags = {}) {
  const record = flags?.[WEAKNESS_CARD_FLAG] ?? flags?.area?.check?.[WEAKNESS_CARD_FLAG] ?? null;
  return record && typeof record === "object" && Array.isArray(record.types) ? record : null;
}

/** The Banes a card's weakness record lays on this resister's type: 1 or 0. */
export function weaknessBaneOn(record = null, type = null) {
  const t = cleanType(type);
  return record && t && typeList(record.types).includes(t) ? 1 : 0;
}

/**
 * **STUDIED'S BOON** (*you have a Boon on Resilience Tests against its abilities*): 1 where the resister keeps a
 * Tome and the creature whose card it resists is of a type Studied now.
 *
 * @param {{tome?: object|null, effects?: Iterable<object>, sourceType?: string|null}} o
 * @returns {number}
 */
export function studiedBoonOn({ tome = null, effects = [], sourceType = null } = {}) {
  const t = cleanTome(tome);
  if (!t.started) return 0;
  return studiedResistBoon({ sourceType, studied: t.studied, known: t.known, lastHunt: lastHuntStands(effects) });
}

/* ------------------------------------------------------------------ */
/*  The Prepare window                                                  */
/* ------------------------------------------------------------------ */

/**
 * **WHAT THE PREPARE WINDOW DRAWS** (02's Field Brews, Studied and Decoctions), worked out whole off what the
 * character holds, so the window and the batches read one answer. A stepper row for each formula known (and the
 * Decoction where **Decoctions** is held), the doses (2 plus Wisdom, at least 2, Extra Measure adds), the types
 * that may be **Studied** and how many, the Hunter's oil type and the elemental Decoction's school.
 *
 * @param {{formulas?: string[], tier?: number, wisMod?: number, extraMeasure?: number, forewarned?: number,
 *   tome?: object|null, decoctions?: boolean, picks?: Record<string, number>}} o
 */
export function prepareView({ formulas = [], tier = 1, wisMod = 0, extraMeasure = 0, forewarned = 0, tome = null, decoctions = false, picks = {} } = {}) {
  const t = cleanTome(tome);
  const known = BREW_IDENTIFIERS.filter(id => asList(formulas).includes(id) && brewOf(id).kind !== "decoction");
  const rows = known.map(id => ({ identifier: id, name: brewOf(id).name, kind: brewOf(id).kind, doses: Math.max(0, int(picks?.[id])) }));
  if (decoctions) rows.push({ identifier: "decoction", name: brewOf("decoction").name, kind: "decoction", doses: Math.max(0, int(picks?.decoction)) });
  const doses = dosesFor(wisMod, { extraMeasure });
  const used = rows.reduce((n, r) => n + r.doses, 0);
  return {
    rows,
    doses,
    used,
    left: doses - used,
    studiedCount: studiedCount(wisMod, forewarned),
    types: t.known,
    // A Decoction is brewed for a type known AND defeated since the last Long Rest (`brewing.mjs#decoctionRefusal`).
    decoctionTypes: t.known.filter(x => t.defeated.includes(x)),
    oil: known.includes("hunters-oil"),
    learnDC: learnDC(tier)
  };
}

/**
 * **THE FORMULAS STILL TO PICK, BY KIND** (02's Field Brews: four elixirs, then two more a tier; one oil and one
 * bomb, then one more of each a tier): the count the tier gives less the count known, never below 0.
 *
 * @param {{formulas?: string[], tier?: number}} o
 * @returns {Record<string, number>}
 */
export function formulasOpen({ formulas = [], tier = 1 } = {}) {
  const out = {};
  for (const kind of FORMULA_KINDS) {
    const have = new Set(asList(formulas).filter(id => brewOf(id)?.kind === kind)).size;
    out[kind] = Math.max(0, knownCount(kind, tier) - have);
  }
  return out;
}

/** Why a set of formulas is refused (`brewing.mjs#knownRefusal`), re-exported for the one door. */
export function formulasRefusal({ formulas = [], tier = 1 } = {}) {
  return knownRefusal({ known: formulas, tier });
}

/* ------------------------------------------------------------------ */
/*  The Tome's learning Test                                            */
/* ------------------------------------------------------------------ */

/**
 * **THE LEARNING TEST, JUDGED** (02's Tome; 04's Field Notes): why it may not be made now, or the DC, the Boon
 * and the types it may teach. The rest opens the chance (`learnOpen`), the Test spends it (`learned`).
 *
 * @param {{tome?: object|null, tier?: number, fieldNotes?: number}} o
 * @returns {{refusal: string|null, dc: number, boons: number, types: string[]}}
 */
export function learnJudgement({ tome = null, tier = 1, fieldNotes = 0 } = {}) {
  const t = cleanTome(tome);
  const dc = learnDC(tier);
  const types = learnableTypes({ damaged: t.damaged, known: t.known });
  if (!t.learnOpen) return { refusal: "closed", dc, boons: 0, types };
  const refusal = learnRefusal({ rest: t.learnOpen, spent: t.learned, damaged: t.damaged, known: t.known, fieldNotes });
  return { refusal, dc, boons: learnBoons(fieldNotes), types };
}

/* ------------------------------------------------------------------ */
/*  Fadeleaf drops' sight (O-720)                                       */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A TOKEN SEES BY WHILE FADELEAF DROPS ACT** (*you see in darkness within 60 feet*; the lead's P2, *"This
 * should be gained from a class potion, not baseline"*): darkness seen through as darkvision to 60 feet, in the
 * flat keys Spectral Sight writes (`demon-hunter-features.mjs#spectralSightPatch`, verified against v14's
 * `TokenDocument.sight`), with the token's own mark. Lit vision is never capped.
 *
 * @returns {Record<string, unknown>}
 */
export function fadeleafPatch() {
  return {
    "sight.enabled": true,
    "sight.range": FADELEAF_FEET,
    "sight.visionMode": "darkvision",
    [`flags.azeroth-rpg.${FADELEAF_SIGHT_MARK}`]: FADELEAF_FEET
  };
}

/**
 * **THE SIGHT PUT BACK** once the drops end: core's own sight for a character (`rules/tokens.mjs#CHARACTER_TOKEN`:
 * sight on, range 0, basic) and the mark cleared. Nothing for a token the drops never wrote.
 *
 * @param {object} token  the plain source
 * @returns {{"sight.enabled": boolean, "sight.range": number, "sight.visionMode": string}|null}
 */
export function fadeleafWithdrawn(token = {}) {
  if (token?.flags?.["azeroth-rpg"]?.[FADELEAF_SIGHT_MARK] === undefined) return null;
  return { "sight.enabled": true, "sight.range": 0, "sight.visionMode": "basic" };
}

/** Whether Fadeleaf drops act on a creature now. */
export function fadeleafActs(effects = []) {
  return actingBrews(effects).some(b => b.identifier === "fadeleaf-drops");
}

/* ------------------------------------------------------------------ */
/*  The Hunter panel                                                    */
/* ------------------------------------------------------------------ */

/**
 * **WHAT THE HUNTER PANEL DRAWS** (D11's Hunter panel, the minimal one): the brews held with their doses, the
 * Toxicity used and limit with any overdose, the types known and **Studied**, the doses a brewing makes, the
 * brewing window, and the learning chance. `brews` is each held brew `{id, identifier, name, img, quantity}`.
 *
 * @param {{brews?: object[], effects?: Iterable<object>, conMod?: number, wisMod?: number, tier?: number, tome?: object|null,
 *   formulas?: string[], window?: object|null, seasonedBlood?: number, refinedDecoctions?: number, extraMeasure?: number,
 *   fieldNotes?: number}} o
 */
export function hunterPanel({ brews = [], effects = [], conMod = 0, wisMod = 0, tier = 1, tome = null, formulas = [], window = null,
  seasonedBlood = 0, refinedDecoctions = 0, extraMeasure = 0, fieldNotes = 0 } = {}) {
  const t = cleanTome(tome);
  const order = id => BREW_IDENTIFIERS.indexOf(id);
  const held = [...(brews ?? [])]
    .filter(b => isBrewIdentifier(b?.identifier))
    .map(b => ({ id: b.id, identifier: b.identifier, name: b.name ?? brewOf(b.identifier).name, img: b.img ?? null, kind: brewOf(b.identifier).kind, quantity: Math.max(0, int(b.quantity ?? 1)), tip: typeof b.tip === "string" ? b.tip : "" }))
    .sort((a, b) => order(a.identifier) - order(b.identifier) || String(a.id).localeCompare(String(b.id)));
  const tox = toxicityOf({ effects, conMod, seasonedBlood, refinedDecoctions });
  const acting = actingBrews(effects).map(b => b.name ?? brewOf(b.identifier)?.name ?? b.identifier);
  const learn = learnJudgement({ tome: t, tier, fieldNotes });
  return {
    brews: held,
    acting,
    toxicity: tox,
    known: t.known,
    studied: studiedNow({ tome: t, lastHunt: lastHuntStands(effects) }),
    started: t.started,
    doses: dosesFor(wisMod, { extraMeasure }),
    formulas: BREW_IDENTIFIERS.filter(id => asList(formulas).includes(id)),
    formulasOpen: formulasOpen({ formulas, tier }),
    window: window?.open === true,
    learnOpen: learn.refusal === null,
    learnRefusal: learn.refusal,
    decoctionLimit: decoctionLimit(refinedDecoctions)
  };
}

/**
 * **A BREW'S TOOLTIP** (the lead, 2026-11-27: *"The Prepare Brews selection box should have a mouseover tooltip explaining
 * each option, as well as on the character sheet under Brews Held"*): what the brew does, as plain text, off its item's
 * description. The description is a lore paragraph and then a bold-led paragraph for each rule (*Effect.*); the lore is
 * dropped and the rules kept. A description with no bold-led paragraph is returned whole.
 *
 * @param {string|null|undefined} html
 * @returns {string}
 */
export function brewTip(html) {
  const parts = brewTipParts(html);
  return parts.map(p => p.text).join(" ");
}

/**
 * A brew description's rule paragraphs as `{lead, text}`: the bold lead (*Effect*, *Undead*) and the plain text of the
 * whole paragraph. A description with no bold-led paragraph gives its paragraphs with an empty lead. The Decoction's
 * per-type lines are looked up by their lead (`decoctionTypeTip`).
 *
 * @param {string|null|undefined} html
 * @returns {{lead: string, text: string}[]}
 */
function brewTipParts(html) {
  const source = typeof html === "string" ? html : "";
  const plain = s => s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
  const paragraphs = [...source.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map(m => m[1]);
  const led = paragraphs.filter(p => /^\s*<strong>/i.test(p));
  const use = led.length ? led : paragraphs;
  const rows = use.map(p => ({ lead: led.length ? plain((p.match(/<strong>([\s\S]*?)<\/strong>/i) ?? [])[1] ?? "").replace(/\.$/, "") : "", text: plain(p) })).filter(r => r.text);
  return rows.length ? rows : (plain(source) ? [{ lead: "", text: plain(source) }] : []);
}

/** The Decoction's line for one type (its lead is the type's name), or "". */
export function decoctionTypeTip(html, label) {
  const hit = brewTipParts(html).find(p => p.lead.toLowerCase() === String(label ?? "").toLowerCase());
  return hit?.text ?? "";
}

/** The weakness row of a type, re-exported for the panel's tooltip. */
export function weaknessRowOf(type) {
  return weaknessOf(type);
}
