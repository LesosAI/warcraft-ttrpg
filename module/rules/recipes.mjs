/**
 * Recipes (D-1907, D-1908, D-1911, D-1918, D-1920, D-1921, D-1927 to D-1929).
 * Pure functions, no Foundry imports (CLAUDE.md §3).
 *
 * A recipe is an ITEM in the weapons, armor or gear pack that carries a
 * `system.craft {trade, tier, reagents, family, sundry}` stamp (D-1918): the
 * parser stamps it off 08's *Crafting* tables. A Classic dungeon find is never
 * a recipe. What a character may make is every recipe of its profession at its
 * tier and below (D-1913), and nothing above the tier is returned at all
 * (D-1927: no locked rows).
 *
 * **Reagents are named §17 materials** (D-1907). A recipe's own list wins
 * (D-1921: Classic's reagents, stamped by the parser); a recipe with none
 * DERIVES them from its family's ladder at the effective tier, worth about
 * half the price, plus a sundry, plus a surcharge for each affix and a
 * Signature. `deriveReagents` is the mockup's `derive` exactly, half-up
 * rounding and all, and `recipes.test.mjs` holds the two together over every
 * derived recipe in the mockup's JSON.
 *
 * Quality is the Forge's (D-1908): `forge.mjs#plan` judges a choice and this
 * module only says what to OFFER (D-1929) and what a craft costs.
 */

import { AZEROTH } from "../config.mjs";
import { SIGNATURE_KINDS, affixCost, bandFor, isEnchantmentTrait, plan } from "./forge.mjs";
import { canGoOn, generate } from "./affixes.mjs";
import { baseTrait } from "./bestiary.mjs";
import { PROFESSION_BY_ID, clampTier, rungFor } from "./professions.mjs";
import { downtimeRefusal } from "./downtime.mjs";
import { cutRefusal } from "./craft-cuts.mjs";

/* -------------------------------------------- */
/*  Rarity and tier (D-1911)                     */
/* -------------------------------------------- */

/** The rarities a craft may make, in order. Legendary is never crafted (D-1908). */
export const CRAFTABLE_RARITIES = Object.freeze(["common", "uncommon", "rare", "epic"]);

/** The tier a rarity's recipe stands at. */
export const RARITY_TIER = Object.freeze({ common: 1, uncommon: 2, rare: 3, epic: 4 });

/** The best rarity each tier may make (D-1911: T1 Common ... T4 Epic). */
export const RARITY_CEILING = Object.freeze({ 1: "common", 2: "uncommon", 3: "rare", 4: "epic" });

/** The rarities a character of this tier may choose, Common first. */
export function raritiesFor(tier) {
  const t = clampTier(tier);
  return CRAFTABLE_RARITIES.filter(r => RARITY_TIER[r] <= t);
}

/**
 * A recipe's effective tier (D-1911): the higher of the base item's craft tier
 * and its rarity's tier. It sets the DC and the interval (`crafting.mjs`).
 */
export function recipeTier(base, rarity = "common", trade = null) {
  const own = craftOf(base, trade)?.tier ?? 1;
  return Math.max(own, RARITY_TIER[rarity] ?? 1);
}

/* -------------------------------------------- */
/*  The stamp                                    */
/* -------------------------------------------- */

/** The item types a recipe can be: the three the weapons, armor and gear packs hold (D-1918). */
export const CRAFTED_TYPES = Object.freeze(["weapon", "armor", "gear"]);

/** One stamp, `{trade, tier, reagents, family, sundry}`, read closed; null where the trade is no profession. */
function readStamp(craft) {
  if (!craft || typeof craft !== "object" || !PROFESSION_BY_ID[craft.trade]) return null;
  return {
    trade: craft.trade,
    tier: clampTier(craft.tier),
    reagents: Array.isArray(craft.reagents)
      ? craft.reagents.filter(r => r && typeof r.identifier === "string" && r.identifier).map(r => ({ identifier: r.identifier, count: Math.max(1, Math.trunc(Number(r.count)) || 1) }))
      : [],
    family: typeof craft.family === "string" && LADDERS[craft.family] ? craft.family : null,
    sundry: typeof craft.sundry === "string" && craft.sundry ? craft.sundry : null
  };
}

/**
 * **EVERY PROFESSION THAT MAKES AN ITEM** (O-662, resolved by D-1960): the
 * stamp's own `{trade, ...}` first and each of its `alt` stamps after, in 03's
 * order. The seven smelted bars are Blacksmithing's and Engineering's, and
 * Truesilver bar is Alchemy's transmute too, from a list of its own. Empty for
 * anything that is not a recipe.
 *
 * @returns {Array<{trade: string, tier: number, reagents: Array, family: string|null, sundry: string|null}>}
 */
export function craftsOf(item) {
  if (!CRAFTED_TYPES.includes(item?.type)) return [];
  const craft = item?.system?.craft;
  if (!craft || typeof craft !== "object") return [];
  const out = [];
  for (const stamp of [craft, ...(Array.isArray(craft.alt) ? craft.alt : [])]) {
    const read = readStamp(stamp);
    if (read && !out.some(s => s.trade === read.trade)) out.push(read);
  }
  return out;
}

/**
 * The craft stamp on an item, or null. Reads `system.craft` only; a document
 * with no stamp is not a recipe, and nor is any type but a weapon, a suit or a
 * piece of gear whatever it carries (D-737: a law handed the whole collection
 * must not price non-things).
 *
 * **WITH A TRADE, THAT TRADE'S STAMP** (O-662, D-1960): an item two professions
 * make answers each its own tier and reagents; a trade that does not make it
 * answers the first stamp, so a caller judging *this is somebody else's work*
 * still sees whose. With no trade, the first stamp, as before.
 *
 * @param {object} item
 * @param {string|null} [trade]
 * @returns {{trade: string, tier: number, reagents: Array<{identifier: string, count: number}>, family: string|null, sundry: string|null}|null}
 */
export function craftOf(item, trade = null) {
  const all = craftsOf(item);
  if (!all.length) return null;
  return (trade ? all.find(s => s.trade === trade) : null) ?? all[0];
}

/** A Classic dungeon find (D-685) is never craftable, whatever it carries. */
export function isClassicFind(item) {
  return item?.system?.source?.document === "Classic" || Boolean(item?.flags?.["azeroth-rpg"]?.classic);
}

/**
 * Whether the Forge's quality applies (D-1908, the plan's M3b): a weapon that
 * is not a shot or powder, a suit or a shield, a worn thing, and barding. A
 * thing that is used up, a container, a tool or clothing is made Common.
 */
export function forgeable(item) {
  const sys = item?.system;
  if (!sys) return false;
  // A recipe made at a rarity the book fixes takes no quality (08 §18; the review's M5).
  if (fixedRarity(item)) return false;
  return takesQuality(item);
}

/** The KIND of thing a quality goes on: a weapon that is no shot or powder, a suit or shield, a worn thing, barding. */
function takesQuality(item) {
  const sys = item?.system;
  if (!sys) return false;
  if (sys.use && sys.use.kind && sys.use.kind !== "none") return false;
  if (item.type === "weapon") return !(Array.isArray(sys.fits) && sys.fits.length);
  if (item.type === "armor") return true;
  if (item.type === "gear") return Boolean(sys.slot && sys.slot !== "clothing") || /barding/i.test(String(item.name ?? ""));
  return false;
}

/**
 * **WHAT *LAY AN ENCHANTMENT* LISTS** (08 §18; the phase 5 run): an item the enchanter CARRIES, of a
 * kind a quality goes on, whatever rarity it already has. `forgeable` asks a RECIPE whether the
 * book fixes its rarity, and reads an Uncommon, Rare or Epic item's own rarity as fixed - so the
 * window, which filtered by it, listed no Rare or Epic item at all, and the Enchanter's Signatures
 * (Rare or Epic alone, D-2147) could never be reached from it, nor a second affix on an Uncommon.
 * Section 10's Ward and Spellpower gear stays out, as before (08 §18 makes it Common). What each
 * item may take is the door's judgement (`enchantVerdict`, `enchanterSignatureVerdict`), never this.
 *
 * @param {{type?: string, name?: string, system?: object}} item
 */
export function enchantable(item) {
  const sys = item?.system;
  if (!sys) return false;
  if (SECTION_TEN.test(String(sys.source?.section ?? "").trim())) return false;
  return takesQuality(item);
}

/** 08 §10's Ward and Spellpower gear, which 08 §18 names among what is made Common. */
const SECTION_TEN = /^10\b/;

/**
 * **THE RARITY A RECIPE IS MADE AT WHEN THE BOOK FIXES IT** (08 §18; the professions
 * review's M5), or null where the crafter chooses (a Common weapon, suit or worn thing)
 * or the recipe is simply made Common (a consumable, a material, a kit).
 *
 * 08 §18: *Everything else is made Common and takes no affix: ... the Ward and
 * Spellpower gear of section 10. The four flasks and the Invulnerability Potion in
 * section 20 are made Epic, at tier 4.* So:
 *
 * - section 10's gear is made **Common** (its target 2) whatever its own stamp says - the
 *   pack stamps it Rare, and the book names it Common here by name;
 * - every other recipe whose own rarity is above Common is made **at that rarity** - the
 *   five Epic flasks of section 20, and the one Rare design, the Catseye Ultra Goggles
 *   (section 11's Special designs, a tier 3 Engineering recipe; MY READING, D-1992: a
 *   named Rare is made Rare, its target 5, as the flasks are made Epic);
 * - a Common recipe answers null.
 *
 * A fixed recipe is never forgeable: its rarity is the item's, not a choice, and the
 * Forge would charge its budget again on top of a base that already spent one.
 *
 * @param {{system?: object}} item
 * @returns {string|null}
 */
export function fixedRarity(item) {
  const sys = item?.system;
  if (!sys) return null;
  if (SECTION_TEN.test(String(sys.source?.section ?? "").trim())) return "common";
  const own = sys.rarity;
  return own && own !== "common" && CRAFTABLE_RARITIES.includes(own) ? own : null;
}

/** The rarity a craft is made at: the book's where it fixes one, else the crafter's choice. */
export function craftRarity(item, asked = "common") {
  return fixedRarity(item) ?? (asked || "common");
}

/**
 * A Signature as the craft's law reads it (the review's M6, settled by D-1990; the
 * lead: *"The signatures should be chosen from a list, not typed like the GM can.
 * Exclude legendary signatures"*): the RESOLVED catalogue row `{id, kind, text,
 * effect}` (`craft-signatures.mjs#resolveCraftSignature`), whose words and
 * descriptor are the book's. Anything else - a bare kind, a typed sentence, a row
 * the door did not resolve - comes back with no words, and `craftRefusals`
 * refuses it rather than buying an empty or a home-made Signature. A bare
 * `{id}` (the sheet's pick, not yet resolved) still asks for a Signature's
 * materials. Null for none.
 *
 * @param {{id?: string, kind?: string, text?: string, effect?: object}|string|null} signature
 * @returns {{id: string|null, kind: string|null, text: string, effect: object|null}|null}
 */
export function signatureOf(signature) {
  if (!signature) return null;
  if (typeof signature === "string") return { id: null, kind: signature, text: "", effect: null };
  if (typeof signature !== "object" || (!signature.kind && !signature.id)) return null;
  const resolved = Boolean(signature.id && signature.kind && signature.effect);
  return {
    id: signature.id ?? null,
    kind: signature.kind ? String(signature.kind) : null,
    text: resolved ? String(signature.text ?? "").trim() : "",
    effect: resolved ? signature.effect : null
  };
}

/* -------------------------------------------- */
/*  What a profession makes (D-1913, D-1927)      */
/* -------------------------------------------- */

const SECTION_SPLIT = /\s+[·—–]\s+/;

/**
 * The group a recipe is listed under: the tail of the item's 08 section (`7 —
 * Light weapon` is *Light weapon*), and for a suit its category, since 08 §8's
 * section names none. `localize` says whether `label` is a lang key.
 */
export function categoryOf(item) {
  const section = String(item?.system?.source?.section ?? "").trim();
  const number = Number.parseInt(section, 10);
  const order = Number.isFinite(number) ? number : 99;
  if (item?.type === "armor") {
    if (item.system?.shield) return { key: "armor:shield", label: AZEROTH.heldSlots.shield, localize: true, order, rank: 99 };
    const cat = item.system?.category;
    const keys = Object.keys(AZEROTH.armorCategories);
    if (keys.includes(cat)) return { key: `armor:${cat}`, label: AZEROTH.armorCategories[cat], localize: true, order, rank: keys.indexOf(cat) };
  }
  const parts = section.split(SECTION_SPLIT).filter(Boolean);
  const tail = parts.length > 1 ? parts[parts.length - 1] : "";
  if (!tail) return { key: "other", label: "AZEROTH.Profession.Group.Other", localize: true, order, rank: 0 };
  return { key: tail, label: tail, localize: false, order, rank: 0 };
}

/**
 * Every recipe a profession may make at a tier, grouped (D-1927): ONLY the
 * tier and below, never a Classic find, never a document without a stamp.
 * Groups are sorted by 08's section order, then the suit categories' order,
 * then the label; recipes inside by tier, price, name and identifier, so two
 * renders never swap a row.
 *
 * @param {string} profession    a key of AZEROTH.professions
 * @param {object[]} items       pack documents or index entries `{name, type, system}`
 * @param {number} tier          the character's tier
 * @returns {Array<{key: string, label: string, localize: boolean, recipes: Array<{item: object, craft: object}>}>}
 */
export function recipesFor(profession, items = [], tier = 1) {
  const t = clampTier(tier);
  const groups = new Map();
  for (const item of items ?? []) {
    if (isClassicFind(item)) continue;
    const craft = craftOf(item, profession);
    if (!craft || craft.trade !== profession || craft.tier > t) continue;
    const cat = categoryOf(item);
    if (!groups.has(cat.key)) groups.set(cat.key, { ...cat, recipes: [] });
    groups.get(cat.key).recipes.push({ item, craft });
  }
  const list = [...groups.values()];
  for (const g of list) g.recipes.sort(byRecipe);
  list.sort((a, b) => a.order - b.order || a.rank - b.rank || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
  return list.map(({ key, label, localize, recipes }) => ({ key, label, localize, recipes }));
}

function byRecipe(a, b) {
  return a.craft.tier - b.craft.tier
    || (Number(a.item.system?.cost) || 0) - (Number(b.item.system?.cost) || 0)
    || String(a.item.name ?? "").localeCompare(String(b.item.name ?? ""))
    || String(a.item.system?.identifier ?? "").localeCompare(String(b.item.system?.identifier ?? ""));
}

/* -------------------------------------------- */
/*  Reagents (D-1907, D-1921)                    */
/* -------------------------------------------- */

/**
 * The material ladders a derivation climbs, by family and tier, cheapest first
 * (the mockup's `LADDERS`, by identifier). `dust` is Enchanting's: dust, then
 * the essences, then the shard.
 */
export const LADDERS = Object.freeze({
  metal: ladder({ 1: ["copper-bar", "bronze-bar"], 2: ["iron-bar", "steel-bar"], 3: ["mithril-bar"], 4: ["truesilver-bar", "thorium-bar", "arcanite-bar"] }),
  hide: ladder({ 1: ["light-leather"], 2: ["medium-leather"], 3: ["heavy-leather"], 4: ["thick-leather", "rugged-leather"] }),
  cloth: ladder({ 1: ["linen-cloth", "wool-cloth"], 2: ["silk-cloth"], 3: ["mageweave-cloth"], 4: ["runecloth"] }),
  dust: ladder({ 1: ["arcane-dust"], 2: ["lesser-magic-essence"], 3: ["greater-magic-essence"], 4: ["large-brilliant-shard"] }),
  herb: ladder({ 1: ["peacebloom", "silverleaf", "earthroot", "mageroyal", "briarthorn"], 2: ["bruiseweed", "kingsblood", "liferoot"], 3: ["fadeleaf", "goldthorn"], 4: ["sungrass", "gromsblood", "dreamfoil", "mountain-silversage"] })
});

function ladder(rungs) {
  return Object.freeze(Object.fromEntries(Object.entries(rungs).map(([t, l]) => [t, Object.freeze([...l])])));
}

/**
 * The family and sundry a trade derives from where its recipe names neither
 * (`craft.family` / `craft.sundry` override it per recipe: an alchemist's
 * stones and oils derive from metal).
 */
export const TRADE_DERIVE = Object.freeze({
  blacksmithing: Object.freeze({ family: "metal", sundry: "charcoal-and-flux" }),
  leatherworking: Object.freeze({ family: "hide", sundry: "tanning-salts" }),
  tailoring: Object.freeze({ family: "cloth", sundry: null }),
  alchemy: Object.freeze({ family: "herb", sundry: "vial-empty" }),
  enchanting: Object.freeze({ family: "dust", sundry: null }),
  engineering: Object.freeze({ family: "metal", sundry: "charcoal-and-flux" }),
  "wilderness-survival": Object.freeze({ family: "cloth", sundry: null })
});

/** A derived line's count stays within this (D-1907). */
export const REAGENT_COUNT = Object.freeze({ min: 1, ladderMax: 14, max: 20 });

/** The essences the surcharges name. */
export const SURCHARGE = Object.freeze({
  shard: "large-brilliant-shard",
  lesser: "lesser-magic-essence",
  greater: "greater-magic-essence",
  dust: "arcane-dust"
});

/** Half-up rounding, the mockup's and Python's `floor(x + 0.5)`. */
const halfUp = x => Math.floor(x + 0.5);

const priceOf = (materials, id) => Number(materials?.[id]?.price ?? materials?.[id]) || 0;

/**
 * The derivation (D-1907): climb the family's ladder from the tier, taking the
 * first material whose count to reach half the price (less the sundry) is 14
 * or fewer; past tier 4 take the ladder's last at up to 20. A sundry rides at
 * a quarter of the count, rounded up. `materials` maps an identifier to its
 * price in copper (or `{price}`).
 *
 * @returns {Array<{identifier: string, count: number}>}
 */
export function deriveReagents({ price = 0, family = null, tier = 1, sundry = null, materials = {} } = {}) {
  const rungs = LADDERS[family];
  if (!rungs || !(Number(price) > 0)) return [];
  const sun = sundry ? priceOf(materials, sundry) : 0;
  const target = Math.max(Number(price) / 2, 1);
  let pick = null;
  let n = 1;
  for (let t = clampTier(tier); t <= 4 && !pick; t++) {
    for (const m of rungs[t] ?? []) {
      const each = priceOf(materials, m);
      if (!each) continue;
      const c = halfUp((target - sun) / each);
      if (c <= REAGENT_COUNT.ladderMax) { pick = m; n = Math.max(REAGENT_COUNT.min, c); break; }
    }
  }
  if (!pick) {
    const top = rungs[4] ?? [];
    pick = top[top.length - 1];
    const each = priceOf(materials, pick) || 1;
    n = Math.min(REAGENT_COUNT.max, Math.max(REAGENT_COUNT.min, halfUp((target - sun) / each)));
  }
  const out = [{ identifier: pick, count: n }];
  if (sundry) out.push({ identifier: sundry, count: Math.max(1, Math.ceil(n / 4)) });
  return out;
}

/** Sum lines naming one material, keeping the first line's place. */
export function mergeReagents(list = []) {
  const out = [];
  const at = new Map();
  for (const line of list ?? []) {
    if (!line?.identifier) continue;
    const n = Math.trunc(Number(line.count)) || 0;
    if (at.has(line.identifier)) out[at.get(line.identifier)].count += n;
    else { at.set(line.identifier, out.length); out.push({ identifier: line.identifier, count: n }); }
  }
  return out;
}

/**
 * What quality adds to a craft (the mockup's `surcharge`): an Epic a shard; an
 * enchantment affix a lesser essence and two dust; a Ward or Spellpower affix
 * two lesser essences; an attribute or skill suffix its cost in dust; a smith's
 * prefix twice its cost in the metal of the rarity's tier; a Signature a
 * greater essence, or a shard on an Epic. A Common craft adds nothing.
 */
export function surcharge({ rarity = "common", affixes = [], signature = null } = {}) {
  const out = [];
  if (!rarity || rarity === "common") return out;
  if (rarity === "epic") out.push({ identifier: SURCHARGE.shard, count: 1 });
  for (const a of (affixes ?? []).filter(Boolean)) {
    if (a.enchantment) out.push({ identifier: SURCHARGE.lesser, count: 1 }, { identifier: SURCHARGE.dust, count: 2 });
    else if (a.family === "ward" || a.family === "spellpower") out.push({ identifier: SURCHARGE.lesser, count: 2 });
    else if (a.family === "attribute" || a.family === "skill") out.push({ identifier: SURCHARGE.dust, count: affixCost(a) });
    else out.push({ identifier: LADDERS.metal[Math.min(4, RARITY_TIER[rarity] ?? 1)]?.[0] ?? "copper-bar", count: affixCost(a) * 2 });
  }
  if (signature) out.push({ identifier: rarity === "epic" ? SURCHARGE.shard : SURCHARGE.greater, count: 1 });
  return out;
}

/**
 * What a craft consumes (D-1907, D-1921). **A recipe's own list wins**, at
 * whatever rarity; otherwise the derivation at the EFFECTIVE tier (a Rare
 * Longsword is made of tier 3 metal) from the recipe's family or its trade's.
 * The quality surcharge is added and the lines merged.
 *
 * @param {object} o
 * @param {object} o.base          the recipe item `{name, type, system}`
 * @param {string} o.rarity
 * @param {object[]} o.affixes     affix shapes (`flags.azeroth-rpg.affix`)
 * @param {object|string|null} o.signature a chosen Signature (any truthy value asks for its materials), or null
 * @param {object} o.materials     identifier -> price in copper (or `{price}`)
 * @returns {Array<{identifier: string, count: number}>}
 */
export function reagentsFor({ base = null, rarity = "common", affixes = [], signature = null, materials = {}, trade = null } = {}) {
  const craft = craftOf(base, trade);
  if (!craft) return [];
  // A rarity the book fixes is the item's, never a quality bought (08 §18; the review's M5):
  // it sets the derivation's tier, and it adds no surcharge, since nothing was chosen.
  const fixed = fixedRarity(base);
  const made = fixed ?? rarity;
  let own = craft.reagents;
  if (!own.length) {
    const fallback = TRADE_DERIVE[craft.trade] ?? {};
    own = deriveReagents({
      price: base.system?.cost,
      family: craft.family ?? fallback.family,
      tier: recipeTier(base, made, craft.trade),
      sundry: craft.family ? craft.sundry : (craft.sundry ?? fallback.sundry),
      materials
    });
  }
  if (fixed) return mergeReagents(own);
  return mergeReagents([...own, ...surcharge({ rarity, affixes, signature: signatureOf(signature) ? "chosen" : null })]);
}

/** Each line against what the bags hold: `{identifier, need, have, short}`. */
export function shortfall(reagents = [], have = {}) {
  return (reagents ?? []).map(r => {
    const held = Math.max(0, Math.trunc(Number(have?.[r.identifier])) || 0);
    return { identifier: r.identifier, need: r.count, have: held, short: Math.max(0, r.count - held) };
  });
}

/** How many times the bags could pay for this list; 0 where it names nothing (the mockup's `makeable`). */
export function makeableCount(reagents = [], have = {}) {
  if (!reagents?.length) return 0;
  return Math.min(...reagents.map(r => Math.floor((Math.max(0, Number(have?.[r.identifier]) || 0)) / Math.max(1, r.count))));
}

/* -------------------------------------------- */
/*  Who lays which affix (the plan's ownership)  */
/* -------------------------------------------- */

/** The smith's three prefixes (08 §6): Blacksmithing's alone. */
export const SMITH_PREFIXES = Object.freeze(["Sturdy", "Honed", "Reinforced"]);

/**
 * The trade an affix belongs to, or null where any trade may lay it on its
 * own item: an enchantment, a Ward and a Spellpower are Enchanting's; the
 * smith's three Blacksmithing's; an attribute or skill suffix is open.
 */
export function affixOwner(affix) {
  if (!affix) return null;
  if (affix.enchantment || affix.family === "ward" || affix.family === "spellpower") return "enchanting";
  if (SMITH_PREFIXES.includes(affix.name)) return "blacksmithing";
  return null;
}

/** The affixes a trade may lay, from the pool handed in, in its own order. */
export function tradeAffixes(trade, affixes = []) {
  return (affixes ?? []).filter(a => {
    const owner = affixOwner(a);
    return owner === null || owner === trade;
  });
}

const RANK = Object.freeze({ common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 });

/** Why an affix may not go on this item at this rarity for this trade, as a code, or null. */
export function affixBar(affix, { item, rarity = "common", trade } = {}) {
  const owner = affixOwner(affix);
  if (owner && owner !== trade) return "trade";
  if (affix.minimumRarity && (RANK[rarity] ?? 0) < (RANK[affix.minimumRarity] ?? 0)) return "rarity";
  if (!canGoOn(affix, item)) return "goesOn";
  if (affix.enchantment && (item?.system?.traits ?? []).some(isEnchantmentTrait)) return "enchanted";
  return null;
}

/**
 * A Signature's cost out of the budget (08 §20), 0 for none: a kind, or a catalogue row
 * (`{kind, cost}`, D-1990) whose kind is read off its descriptor.
 */
export function signatureCost(signature) {
  if (!signature) return 0;
  const kind = typeof signature === "object" ? signature.kind : signature;
  return SIGNATURE_KINDS[kind]?.cost ?? (typeof signature === "object" ? Number(signature.cost) || 0 : 0);
}

/**
 * **A dropdown lists only what can be picked** (D-1929): the affixes of one
 * slot that are legal for the item, the rarity and the trade, fit the budget
 * left after the other slot and a Signature, and are not the other slot's
 * pick. An Uncommon carries ONE affix (08 §4), so its second slot offers
 * nothing once the first is taken. The current pick is kept so a select never
 * loses its own value.
 *
 * @param {object} o
 * @param {object} o.item          the base item
 * @param {string} o.rarity
 * @param {string} o.trade
 * @param {"prefix"|"suffix"} o.kind  the slot being offered
 * @param {object[]} o.affixes     the whole pool
 * @param {object|null} o.other    the other slot's affix
 * @param {object|null} o.current  this slot's affix
 * @param {string|null} o.signature a Signature kind
 * @returns {object[]}
 */
export function affixChoices({ item, rarity = "common", trade, kind = "prefix", affixes = [], other = null, current = null, signature = null } = {}) {
  if (!item || rarity === "common" || !RARITY_TIER[rarity]) return [];
  if (rarity === "uncommon" && other && !current) return [];
  const hi = bandFor(rarity)?.hi ?? 0;
  const left = hi - affixCost(other) - signatureCost(signature);
  return (affixes ?? []).filter(a => {
    if (a.kind !== kind) return false;
    if (current && a.name === current.name) return true;
    if (other && a.name === other.name) return false;
    if (affixCost(a) > left) return false;
    return affixBar(a, { item, rarity, trade }) === null;
  });
}

/**
 * Which of the Forge's rows the craft window draws (D-1929): Rarity on a
 * forgeable item; Prefix and Suffix from Uncommon; Signature from Rare.
 */
export function visibleRows(rarity = "common", { forgeable: canForge = true } = {}) {
  const t = RARITY_TIER[rarity] ?? 1;
  return { rarity: canForge, prefix: canForge && t >= 2, suffix: canForge && t >= 2, signature: canForge && t >= 3 };
}

/* -------------------------------------------- */
/*  Enchanting in place                          */
/* -------------------------------------------- */

/** The grade an enchantment is laid at by its cost (the mockup's `enchRarity`). */
export function enchantGrade(affix) {
  const c = affixCost(affix);
  return c >= 4 ? "epic" : c >= 2 ? "rare" : "uncommon";
}

/** The recipe tier laying it stands at: tier 2 at the least, higher by grade. */
export function enchantTier(affix) {
  return Math.max(2, RARITY_TIER[enchantGrade(affix)]);
}

/** *Lay an enchantment* lists only what the item can carry at a grade the tier opens (D-1929). */
export function enchantChoices({ item, tier = 1, affixes = [] } = {}) {
  if (!item) return [];
  const t = clampTier(tier);
  return tradeAffixes("enchanting", affixes).filter(a =>
    enchantTier(a) <= t && affixBar(a, { item, rarity: enchantGrade(a), trade: "enchanting" }) === null);
}

/**
 * **THE ENCHANTMENT'S FINAL DOOR, JUDGED BEFORE ANYTHING IS SPENT** (the professions
 * review's M4; D-768's order). The project ends in `affix-dialog.mjs#applyAffixInPlace`,
 * which refuses a slot the item already fills (*AlreadyHas*) and rebuilds the item through
 * `affixes.mjs#generate` from its stashed base; judged only at the end, the materials were
 * spent and the project worked to its target before the refusal, and the project then
 * stood ready for ever. This reads the same things `applyAffixInPlace` reads, from the
 * item's plain data (`item.toObject()`):
 *
 * - `alreadyHas`: `flags.azeroth-rpg.generated[kind]` is set;
 * - `forgeBuilt`: the item came off the Forge (a craft or the GM's bench) carrying what
 *   `generate` cannot rebuild - a Signature kind, a Greater affix or two prefixes - so laying
 *   an affix in place would silently strip it;
 * - `affixRefused`: `generate` itself refuses the result, with its reason as `text`.
 *
 * On success it answers the RARITY the item will have once enchanted, which sets the
 * project's target (11 §10: *the item's rarity once enchanted sets the target*).
 *
 * @param {{item: {name?: string, type: string, system: object, flags?: object}, affix: object, pool?: object[]}} o
 *   `pool` the affix pool's plain shapes, for the other slot's affix the item already carries
 * @returns {{ok: true, rarity: string}|{ok: false, reason: string, slot?: string, text?: string}}
 */
export function enchantVerdict({ item = null, affix = null, pool = [] } = {}) {
  if (!item || !affix || !["prefix", "suffix"].includes(affix.kind)) return { ok: false, reason: "notRecipe" };
  // **A CLASSIC FIND TAKES NO AFFIX IN PLACE** (D-685's finds are converted whole, and `generate` cannot
  // rebuild one): the window lists a find for an Enchanter's Signature alone (O-778, the lead: *"yes, allow
  // Signatures on Classic finds"*; D-2171), so the affix branch refuses it here, at the door's own judgement.
  if (isClassicFind(item)) return { ok: false, reason: "classicFind" };
  const generated = item.flags?.["azeroth-rpg"]?.generated ?? {};
  if (generated[affix.kind]) return { ok: false, reason: "alreadyHas", slot: affix.kind };
  if (generated.base && (generated.signatureKind || (generated.greater ?? []).length || (generated.prefixes ?? []).length > 1)) {
    return { ok: false, reason: "forgeBuilt" };
  }
  // An item carrying a Signature by ANY road - an Enchanter's Signature laid in place on an
  // item with no stashed base, a printed §20 run, a hand-typed sentence - is refused the
  // same way: `generate` rebuilds from the base and would strip the Signature AND its cost
  // (the phase 4 review). The test mirrors `enchanter-signatures.mjs#carriesSignature`,
  // inlined because that module imports this one.
  if (item.flags?.["azeroth-rpg"]?.enchanterSignature || itemCarriesSignature(item)) {
    return { ok: false, reason: "forgeBuilt" };
  }
  const byId = id => (id ? (pool ?? []).find(a => a.id === id) ?? null : null);
  const prefix = affix.kind === "prefix" ? affix : byId(generated.prefix);
  const suffix = affix.kind === "suffix" ? affix : byId(generated.suffix);
  // The other slot's affix the item carries, gone from the pool: the rebuild would drop it.
  if ((affix.kind === "suffix" && generated.prefix && !prefix) || (affix.kind === "prefix" && generated.suffix && !suffix)) {
    return { ok: false, reason: "forgeBuilt" };
  }
  const base = generated.base ?? { name: item.name, type: item.type, system: item.system };
  const result = generate({ base, prefix, suffix });
  if (!result.ok) return { ok: false, reason: "affixRefused", text: String(result.reason ?? "") };
  const rarity = result.item?.system?.rarity ?? enchantGrade(affix);
  return { ok: true, rarity };
}

/** Whether an item's plain data carries a Signature: prose, or a descriptor of any kind but `none`. */
function itemCarriesSignature(item) {
  const sys = item?.system ?? {};
  if (String(sys.signature ?? "").replace(/<[^>]+>/g, "").trim()) return true;
  const kind = sys.signatureEffect?.kind;
  return Boolean(kind) && kind !== "none";
}

/** What laying one enchantment consumes (the mockup's `enchantReagents`). */
export function enchantReagents(affix) {
  if (!affix) return [{ identifier: SURCHARGE.dust, count: 2 }];
  return mergeReagents(surcharge({ rarity: affixCost(affix) >= 2 ? "rare" : "uncommon", affixes: [affix] }));
}

/* -------------------------------------------- */
/*  Trait tooltips (D-1928)                      */
/* -------------------------------------------- */

/**
 * A trait's base entry for its tooltip, read through a parameter: `Thrown (40
 * ft)`, `Pierce 1`, `Pierce X` and `Impale (X)` find Thrown, Pierce and Impale
 * (`bestiary.mjs#baseTrait`, the one normaliser). `traits` is the trait pack's
 * documents (`{name, system}`) or a map of name to entry. Null where the pack
 * has no such trait.
 *
 * @returns {{name: string, as: string, entry: object}|null}
 */
export function traitEntry(name, traits = []) {
  const shown = String(name ?? "").trim();
  if (!shown) return null;
  const want = baseTrait(shown).toLowerCase();
  const pairs = Array.isArray(traits)
    ? traits.map(t => [t?.name, t])
    : Object.entries(traits ?? {});
  for (const [key, entry] of pairs) {
    if (key && baseTrait(String(key)).toLowerCase() === want) return { name: String(key), as: shown, entry };
  }
  return null;
}

/* -------------------------------------------- */
/*  The craft's judgement (D-768's order)        */
/* -------------------------------------------- */

/**
 * Every reason a craft may not START, judged WHOLE before anything is spent
 * (D-768's order), as reason codes the sheet localizes through
 * `AZEROTH.craftRefusals`: the profession is not this recipe's; the recipe is
 * above the tier (a guard: the sheet never draws it); downtime is closed while
 * the GM enforces it; the rarity is over the tier's ceiling or the item takes
 * no quality; the tool is not carried; a material is short; the Forge refuses
 * the quality (`forge.mjs#plan`'s own sentences); there is no bag room for the
 * result. **No project stands in the way**: D-1924 lets several stand at once,
 * which retires the plan's one-project refusal.
 *
 * @param {object} s
 * @param {string} s.profession   the character's profession key
 * @param {object} s.base         the recipe item
 * @param {number} s.tier         the character's tier
 * @param {string} s.rarity
 * @param {object[]} s.affixes    the chosen affix shapes, prefix first
 * @param {object|null} s.signature a RESOLVED catalogue row `{id, kind, text, effect}` (D-1990), or null
 * @param {boolean} s.enforced    *Crafting only in downtime* is on
 * @param {boolean} s.open        downtime is open
 * @param {boolean} s.toolCarried
 * @param {Array} s.reagents      what the craft consumes (`reagentsFor`)
 * @param {object} s.have         identifier -> count in the bags
 * @param {boolean} s.room        the bags can take the result
 * @param {string|null} [s.cut]   a Cut asked for (D-2009), one of `craft-cuts.mjs#cutChoices`' or refused (`cut`)
 * @param {boolean} [s.prefixRow] whether the Prefix row is drawn (`craft-cuts.mjs#prefixRowDrawn`); a Cut is never offered beside it
 * @returns {Array<{reason: string}>}
 */
export function craftRefusals(s = {}) {
  const out = [];
  const craft = craftOf(s.base, s.profession);
  if (!craft) return [{ reason: "notRecipe" }];
  const tier = clampTier(s.tier);
  const asked = s.rarity ?? "common";
  // **A RARITY THE BOOK FIXES** (08 §18; the review's M5): the five Epic flasks are made Epic,
  // section 10's gear Common, whatever was asked. Asking the default (Common) is no choice and
  // takes the fixed rarity; asking any other is refused, because the item takes no quality.
  const fixed = fixedRarity(s.base);
  const rarity = fixed ?? asked;
  const signature = signatureOf(s.signature);
  if (craft.trade !== s.profession) out.push({ reason: "trade", trade: craft.trade });
  if (craft.tier > tier) out.push({ reason: "tierLocked", tier: craft.tier, level: rungFor(craft.tier).minLevel });
  const closed = downtimeRefusal({ enforced: s.enforced, open: s.open });
  if (closed) out.push(closed);
  if (!RARITY_TIER[rarity] || RARITY_TIER[rarity] > tier) out.push({ reason: "rarityCeiling", rarity, ceiling: RARITY_CEILING[tier] });
  else if (fixed ? (asked !== "common" && asked !== fixed) : (rarity !== "common" && !forgeable(s.base))) out.push({ reason: "notForgeable" });
  if (s.toolCarried !== true) out.push({ reason: "tool", tool: PROFESSION_BY_ID[craft.trade]?.tool ?? null });
  const short = shortfall(s.reagents ?? [], s.have ?? {}).filter(l => l.short > 0);
  if (short.length) out.push({ reason: "short", lines: short });
  // **A SIGNATURE IS THE BOOK'S, CHOSEN FROM THE LIST** (D-1990; the lead: *"chosen from a
  // list, not typed like the GM can"*): only a catalogue row the door resolved carries words and
  // a descriptor. A bare kind or a typed sentence is refused before anything is spent - it would
  // buy the kind's budget and price for an item that carries no Signature, or one nobody wrote.
  if (signature && !signature.text) out.push({ reason: "signatureUnknown" });
  // **A CUT IS ONE THE WINDOW OFFERS** (D-2009): a Cut-less suit with no Prefix row, a Cut its
  // category takes. Anything else is refused here, before anything is spent.
  const badCut = cutRefusal({ base: s.base, cut: s.cut ?? null, prefixRow: s.prefixRow === true });
  if (badCut) out.push(badCut);
  if (forgeable(s.base) && RARITY_TIER[rarity]) {
    const affixes = (s.affixes ?? []).filter(Boolean);
    const forge = plan({
      base: s.base,
      rarity,
      prefixes: affixes.filter(a => a.kind === "prefix"),
      suffix: affixes.find(a => a.kind === "suffix") ?? null, floor: false,
      signature: signature?.text ? { kind: signature.kind, text: signature.text, effect: signature.effect } : null
    });
    for (const text of forge.reasons) out.push({ reason: "forge", text });
    for (const a of affixes) {
      const bar = affixBar(a, { item: s.base, rarity, trade: craft.trade });
      if (bar === "trade") out.push({ reason: "affixTrade", affix: a.name, trade: affixOwner(a) });
    }
  }
  if (s.room === false) out.push({ reason: "room" });
  return out;
}

/* -------------------------------------------- */
/*  The stored shapes                            */
/* -------------------------------------------- */

/** 08 §17's material families, keys of `AZEROTH.materialFamilies`. */
export const MATERIAL_FAMILIES = Object.freeze(Object.keys(AZEROTH.materialFamilies));

/**
 * A stored `craft` made valid before the schema can refuse it (CLAUDE.md §15),
 * ONLY where each key is present, at every depth: an unknown trade is null, a
 * tier is held to 1..4, a reagent line needs an identifier and a whole count
 * of at least 1, a family must be a ladder's. Mutates and returns `source`.
 */
export function cleanCraft(source) {
  if (!source || typeof source !== "object" || !("craft" in source)) return source;
  const c = source.craft;
  if (c === null || c === undefined) { source.craft = null; return source; }
  if (typeof c !== "object") { source.craft = null; return source; }
  if ("trade" in c && !PROFESSION_BY_ID[c.trade]) c.trade = null;
  if ("tier" in c) c.tier = clampTier(c.tier);
  if ("reagents" in c) {
    c.reagents = Array.isArray(c.reagents)
      ? c.reagents.filter(r => r && typeof r.identifier === "string" && r.identifier)
        .map(r => ({ identifier: r.identifier, count: Math.max(1, Math.trunc(Number(r.count)) || 1) }))
      : [];
  }
  if ("family" in c && c.family !== null && !LADDERS[c.family]) c.family = null;
  if ("sundry" in c && c.sundry !== null && (typeof c.sundry !== "string" || !c.sundry)) c.sundry = null;
  // The other professions' stamps (O-662, D-1960): each cleaned as the first, and a
  // non-list is no list. Only where present (CLAUDE.md §15).
  if ("alt" in c) {
    c.alt = Array.isArray(c.alt)
      ? c.alt.filter(a => a && typeof a === "object").map(a => cleanCraft({ craft: { ...a } }).craft).filter(a => a && a.trade)
      : [];
  }
  return source;
}

/**
 * A stored `material {family, tier}` made valid (08 §17), only where present:
 * an unknown family is null and a tier is held to 0..4 (0 for a sundry).
 */
export function cleanMaterial(source) {
  if (!source || typeof source !== "object" || !("material" in source)) return source;
  const m = source.material;
  if (m === null || m === undefined || typeof m !== "object") { source.material = null; return source; }
  if ("family" in m && m.family !== null && !MATERIAL_FAMILIES.includes(m.family)) m.family = null;
  if ("tier" in m && m.tier !== null) {
    const t = Math.trunc(Number(m.tier));
    m.tier = Number.isFinite(t) ? Math.min(4, Math.max(0, t)) : null;
  }
  return source;
}
