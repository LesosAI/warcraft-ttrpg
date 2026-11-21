/**
 * Unidentified items (08 §4, *Unidentified items*; D-1435). Pure: no Foundry
 * imports, so the law is testable without a running world.
 *
 * **An Uncommon or higher item a character gains is unidentified**, and its
 * owner knows its kind and its quality and nothing more. It works when worn or
 * wielded (the lead: *"Works, hidden"*), but a Use or a spell it carries cannot
 * be called on until it is identified. Identifying it is an Arcana Test at the
 * quality's DC, once per item per Long Rest, and a Rare, Epic or Legendary attempt
 * uses up one 08 §17 stone whether the Test succeeds or fails.
 *
 * **The state is a FLAG, never a schema field.** `flags.azeroth-rpg.unidentified
 * === true` is hidden and an absent flag is known, so every world item, pack
 * document and creature's item stays identified with no migration. The flag is
 * stamped on arrival at a character (`shouldStamp`), and the GM's toggle writes
 * it both ways.
 *
 * **Every surface asks `hiddenFrom` and nothing else.** A second reading of the
 * flag beside it is how one panel ends up showing what another hides.
 *
 * **Words arrive in a bag** (D-677): `kindWord` answers a descriptor, never an
 * English word the module made up, and `disguisedName` composes the name from
 * the caller's localised words.
 */

// The ONE reader of the loot offer's mark (CLAUDE.md §4, D-721).
import { underOffer } from "./loot-offer.mjs";

/** The flag scope every key below lives under. */
export const IDENTIFY_SCOPE = "azeroth-rpg";

/** `flags.azeroth-rpg.unidentified`: `true` hides the item; absent is known. */
export const UNIDENTIFIED_FLAG = "unidentified";

/**
 * `flags.azeroth-rpg.identifyTried`: this item has had its Test since the last
 * Long Rest. It lives on the ITEM so it travels with it, and the owner's Long
 * Rest clears it (a Short Rest bumps `restGeneration`, so that cannot be used).
 */
export const TRIED_FLAG = "identifyTried";

/**
 * The create OPTION that says *this arrives known*: `{azerothIdentify: "known"}`.
 * A closed list of doors holds it (the creator's Finish, the claws, the
 * migration walk, the sheet's stack split, item custody and the Quench fixtures), and
 * `identify-doors.test.mjs` scans `module/` for any other use.
 */
export const IDENTIFY_OPTION = "azerothIdentify";

/**
 * The value of `IDENTIFY_OPTION` that opts a create out of the stamp AND writes the item
 * KNOWN: an absent flag becomes `false` (the architect's review of Phases 1-2, must-fix 1).
 * An absent flag is stamped on the next create anywhere, so a thing that is known has to say
 * so, or the next split, drag or hand-off hides it again.
 */
export const IDENTIFY_KNOWN = "known";

/**
 * The value of `IDENTIFY_OPTION` that opts a create out of the stamp and writes NOTHING: the
 * item arrives with exactly the flags it left with. Item custody alone holds it, because its
 * transfer compares the created document with the parcel byte for byte
 * (`effects/item-custody-transactions.mjs#same`), and a flag written on the way is a failed
 * transfer there.
 */
export const IDENTIFY_AS_IS = "asIs";

/** 08 §4's table: the Arcana Test's DC by quality. Common is never unidentified. */
export const IDENTIFY_DC = Object.freeze({ uncommon: 12, rare: 16, epic: 20, legendary: 26 });

/**
 * 08 §4's Component column, as 08 §17 stone identifiers in the gear pack. Used
 * up on every attempt, success or failure. Uncommon needs none; Rare takes a Lesser magic essence (the lead, 2026-11-21).
 */
export const IDENTIFY_COMPONENT = Object.freeze({ rare: "lesser-magic-essence", epic: "greater-magic-essence", legendary: "large-brilliant-shard" });

/** The item types that carry a quality and can be found: 08's three physical kinds. */
export const IDENTIFIABLE_TYPES = Object.freeze(["weapon", "armor", "gear"]);

/**
 * The armor categories `kindWord` names a suit by (`AZEROTH.armorCategories`' keys): the five
 * suit categories, and `none`, which is 08 §8's shields.
 */
export const SUIT_CATEGORIES = Object.freeze(["cloth", "leather", "studded", "mail", "plate", "none"]);

/** Every refusal `identifyRefusal` can answer, in the order it judges them. */
export const IDENTIFY_REFUSALS = Object.freeze(["known", "notOwner", "triedThisRest", "noComponent"]);

/* -------------------------------------------- */

/** The azeroth-rpg flags of a document or a plain object, never null. */
function ownFlags(item) {
  const flags = item?.flags?.[IDENTIFY_SCOPE];
  return flags && typeof flags === "object" ? flags : {};
}

/** Whether a quality has a row in 08 §4's table. */
export function identifiable(rarity) {
  return Object.hasOwn(IDENTIFY_DC, String(rarity ?? ""));
}

/** The Arcana Test's DC for this quality, or null where it is never unidentified. */
export function identifyDC(rarity) {
  return identifiable(rarity) ? IDENTIFY_DC[rarity] : null;
}

/** The stone an attempt at this quality uses up, or null where it needs none. */
export function identifyComponent(rarity) {
  return IDENTIFY_COMPONENT[String(rarity ?? "")] ?? null;
}

/**
 * Whether the item is unidentified: the flag is exactly `true` AND its quality
 * has a DC. A flag left on an item whose rarity was later dropped to Common
 * hides nothing, because there would be no Test to lift it. Reads `flags`
 * directly, so a Foundry Item and a plain object answer alike.
 */
export function isUnidentified(item) {
  return ownFlags(item)[UNIDENTIFIED_FLAG] === true && identifiable(item?.system?.rarity);
}

/** Whether the item has had its Test since the last Long Rest. */
export function triedThisRest(item) {
  return ownFlags(item)[TRIED_FLAG] === true;
}

/**
 * **A FIND UNDER A LOOT OFFER IS HIDDEN TOO** (08 §4; the plan's default: *the loot offer
 * disguises Uncommon+ rows for players*). The world copy of an offered find carries the offer's
 * mark (`flags.azeroth-rpg.offer.id`, `rules/loot-offer.mjs#underOffer`) and no identify flag
 * yet, because the settle stamps it on arrival at a character. So an offered weapon, suit or
 * gear item of Uncommon or higher is unidentified to a player unless the GM wrote it known
 * (`unidentified: false`). Read here so `hiddenFrom` stays the one question.
 */
export function offeredUnknown(item) {
  if (!underOffer(item)) return false;
  const flags = ownFlags(item);
  if (!IDENTIFIABLE_TYPES.includes(item?.type)) return false;
  if (!identifiable(item?.system?.rarity)) return false;
  return flags[UNIDENTIFIED_FLAG] !== false;
}

/**
 * Whether this viewer is kept from the item's true face. The GM always sees it.
 * **The one question every surface asks**: an unidentified thing, and a find under offer.
 */
export function hiddenFrom(item, { isGM = false } = {}) {
  return !isGM && (isUnidentified(item) || offeredUnknown(item));
}

/* -------------------------------------------- */

/**
 * The noun a base name is known by: the part before 08's descriptive comma
 * (`Longsword, one-handed` → `longsword`) without a Classic conversion's grade
 * mark (`Idol (+2)` → `idol`), lower-cased. Empty where there is none.
 */
function nounOf(name) {
  if (typeof name !== "string") return "";
  // THE BASE'S OWN CASING (the architect's review, must-fix 8b): *Kirin Tor weave* and
  // *Sen'jin hide* are proper nouns, and lower-casing them read as a typo.
  return name.split(",")[0].replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** A content word, kept only where it does not give the item's own name away. */
function wordUnlessName(word, item) {
  if (!word) return null;
  const own = String(item?.name ?? "").trim().toLowerCase();
  return own && word.toLowerCase() === own ? null : word;
}

/**
 * What kind of thing this is, as much as an unidentified item's owner knows.
 *
 * Tried in order, each step only where the one before it has nothing:
 *
 * 1. **The Forge's base** (`flags.azeroth-rpg.generated.base`, the loot
 *    generator's too): the plain 08 item it was forged from. Only a COMMON base
 *    counts, because the Forge stashes the item as it was when first forged and
 *    a re-forged Rare would hand over its own proper name.
 * 2. **A Classic find's base** (`flags.azeroth-rpg.classic.how`, the `base`
 *    step's `to`: `Half-plate`, `Chain shirt`, `Idol (+2)`), the 08 item the
 *    record was converted onto (D-685).
 * 3. **The base flag** (`flags.azeroth-rpg.base`) that 08 §20's named items and
 *    every Classic find carry (`Longsword, one-handed`, `Plate`).
 * 4. **The slot** (08 §11, `rules/worn.mjs`'s vocabulary) a worn thing names.
 * 5. **The type**: a gear item with a Use is a `consumable`, anything else its
 *    document type.
 *
 * **An armor with a category answers `{category}` before any of these** (the lead,
 * 2026-11-21): *Plate armor*, never *Half-plate* or *Homespun*; a shield answers `none`
 * (*Shield*). Steps 1 to 5 still serve every weapon and gear item, and an armor that names
 * no category at all.
 *
 * @returns {{word: string}|{category: string}|{slot: string}|{type: string}}
 *   `word` is content in the base's own casing (an 08 base name, which is book text like an
 *   item's own name); `category`, `slot` and `type` are KEYS the caller localises.
 */
export function kindWord(item) {
  const flags = ownFlags(item);

  // **A SUIT IS NAMED BY ITS CATEGORY, NEVER BY ITS BASE** (the lead, 2026-11-21: *"use 'Cloth
  // armor' instead of homespun for armor names"*): *Homespun*, *Hide* and *Chain shirt* read as
  // a fabric or a garment, while *Cloth armor* says what the owner knows. A shield (08 §8's
  // category `none`) answers `none`, which the bag words *Shield*. Only an armor with no
  // category at all falls through to the chain below.
  if (item?.type === "armor") {
    const cat = String(item?.system?.category ?? "");
    if (SUIT_CATEGORIES.includes(cat)) return { category: cat };
  }

  const base = flags.generated?.base;
  if (base && typeof base === "object" && (base.system?.rarity ?? "common") === "common") {
    const word = wordUnlessName(nounOf(base.name), item);
    if (word) return { word };
  }

  const how = Array.isArray(flags.classic?.how) ? flags.classic.how : [];
  const step = how.find(h => h?.kind === "base");
  const classic = wordUnlessName(nounOf(step?.to), item);
  if (classic) return { word: classic };

  const category = item?.type === "armor" ? String(item?.system?.category ?? "") : "";
  if (category && nounOf(flags.base).toLowerCase() === category.toLowerCase()) return { category };
  const named = wordUnlessName(nounOf(flags.base), item);
  if (named) return { word: named };

  const slot = item?.system?.slot;
  if (typeof slot === "string" && slot) return { slot };

  const type = String(item?.type ?? "");
  const use = item?.system?.use?.kind;
  if (type === "gear" && typeof use === "string" && use && use !== "none") return { type: "consumable" };
  return { type: type || "gear" };
}

/**
 * The name an unidentified item wears: *Longsword (unidentified)*.
 *
 * @param {object} item
 * @param {object} words  the caller's localised bag
 * @param {string} words.format  a template holding `{kind}`, e.g. `{kind} (unidentified)`
 * @param {Record<string,string>} [words.categories]  a noun per armor category key (`Plate armor`)
 * @param {Record<string,string>} [words.slots]  a noun per slot key
 * @param {Record<string,string>} [words.types]  a noun per type key (`weapon`, `armor`, `gear`, `consumable`)
 */
export function disguisedName(item, words = {}) {
  const kind = kindWord(item);
  const types = words.types ?? {};
  let noun;
  if ("word" in kind) noun = kind.word;
  else if ("category" in kind) noun = words.categories?.[kind.category] ?? types.armor ?? kind.category;
  else if ("slot" in kind) noun = words.slots?.[kind.slot] ?? types.gear ?? kind.slot;
  else noun = types[kind.type] ?? types.gear ?? kind.type;
  const format = typeof words.format === "string" && words.format.includes("{kind}") ? words.format : "{kind}";
  // A FUNCTION replacement (must-fix 8a): a string one expands `$&` and `$1` in the noun.
  return format.replace("{kind}", () => noun);
}

/* -------------------------------------------- */

/**
 * Whether a create should arrive unidentified. True only where every one holds:
 * the item is a weapon, armor or gear item; its quality has a DC; the parent is
 * a CHARACTER (a creature's things are never hidden); the flag is absent (an
 * item a GM identified keeps `false` and is never stamped again); and the
 * operation does not carry `azerothIdentify: "known"`.
 *
 * @param {{type: string, rarity: string, flags?: object}} doc
 * @param {string|null} parentType  the parent actor's type, or null for a world item
 * @param {object} [options]  the create operation's options
 */
export function shouldStamp(doc = {}, parentType = null, options = {}) {
  return arrivalFlag(doc, parentType, options) === true;
}

/**
 * What a create writes into `flags.azeroth-rpg.unidentified`, or null where it writes
 * nothing. The one judgement `AzerothItem._preCreateOperation` asks.
 *
 * Only a weapon, armor or gear item of Uncommon or higher arriving at a CHARACTER with no
 * flag yet is written at all: `true` (found, unidentified) by default, `false` (known) where
 * the operation says `azerothIdentify: "known"`, and nothing where it says `"asIs"`.
 *
 * @param {{type: string, rarity: string, flags?: object}} doc
 * @param {string|null} parentType
 * @param {object} [options]
 * @returns {true|false|null}
 */
export function arrivalFlag({ type, rarity, flags } = {}, parentType = null, options = {}) {
  if (!IDENTIFIABLE_TYPES.includes(type)) return null;
  if (!identifiable(rarity)) return null;
  if (parentType !== "character") return null;
  const own = flags?.[IDENTIFY_SCOPE];
  if (own && typeof own === "object" && own[UNIDENTIFIED_FLAG] !== undefined && own[UNIDENTIFIED_FLAG] !== null) return null;
  const opt = options?.[IDENTIFY_OPTION];
  if (opt === IDENTIFY_AS_IS) return null;
  return opt === IDENTIFY_KNOWN ? false : true;
}

/**
 * **WHAT A CHARACTER ALREADY HOLDS IS KNOWN** (migration 0.15.6; the architect's review,
 * must-fix 2): one `false` for every Uncommon+ weapon, suit or gear item with no flag yet, as
 * embedded-item updates. Anything already carrying the flag, either way, is left alone, so a
 * second run answers nothing.
 *
 * @param {Array<{_id: string, type: string, system?: object, flags?: object}>} items
 * @returns {Array<object>}
 */
export function knownBatch(items = []) {
  const out = [];
  for (const item of items ?? []) {
    if (arrivalFlag({ type: item?.type, rarity: item?.system?.rarity, flags: item?.flags }, "character", { [IDENTIFY_OPTION]: IDENTIFY_KNOWN }) !== false) continue;
    out.push({ _id: item._id, [`flags.${IDENTIFY_SCOPE}.${UNIDENTIFIED_FLAG}`]: false });
  }
  return out;
}

/** Whether a carried thing is this stone and is there to use up. */
function isComponent(thing, identifier) {
  if (typeof thing === "string") return thing === identifier;
  if (thing?.system?.identifier !== identifier) return false;
  const quantity = thing.system.quantity;
  return quantity === null || quantity === undefined || Number(quantity) > 0;
}

/**
 * Why this Identify attempt may not be made, or null where it may. Judged
 * whole before anything is spent (D-768's order).
 *
 * @param {object} args
 * @param {object} args.item  the item to identify
 * @param {boolean} [args.tried]  tried since the last Long Rest; read off the item where omitted
 * @param {Array<object|string>} [args.carried]  the actor's items (or their identifiers)
 * @param {boolean} [args.isOwner]  whether the asking user owns the character holding it
 * @returns {null|{reason: "known"}|{reason: "notOwner"}|{reason: "triedThisRest"}|{reason: "noComponent", component: string}}
 */
export function identifyRefusal({ item, tried, carried = [], isOwner = true } = {}) {
  if (!isUnidentified(item)) return { reason: "known" };
  if (!isOwner) return { reason: "notOwner" };
  if (tried ?? triedThisRest(item)) return { reason: "triedThisRest" };
  const component = identifyComponent(item.system.rarity);
  if (component && !(carried ?? []).some(thing => isComponent(thing, component))) {
    return { reason: "noComponent", component };
  }
  return null;
}
