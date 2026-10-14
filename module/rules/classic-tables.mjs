/**
 * The data the Classic-loot fetch and the conversion law share (D-685).
 * Pure, no Foundry imports (CLAUDE.md §3), no `fs`: this is a table, and the
 * records arrive from the caller.
 *
 * The vendored record (`tools/classic/classic-loot.json`) is filtered with
 * these tables and converted with them, so **one vocabulary** answers for both
 * halves. A slot this file does not name is not fetched; a zone it does not
 * name is not fetched; a set it does not name is not fetched. That is what
 * makes the record's own header a scope statement rather than a byproduct.
 *
 * **`kind` is upstream's own word pluralised.** `zones.json` categorises an
 * instance as `Dungeon` or `Raid`; this file says `Dungeons` and `Raids`
 * because that is what the pack's folders and the browser's shelf read. The
 * fetch asserts the two agree and writes upstream's `category` into the
 * record, so the vendored file is where the drift would show.
 *
 * **`dungeon` is 14 §14's own name for the place, and `tier` is a hand row
 * ONLY where the index has no dungeon.** D-666 already reads a dungeon's tier
 * off that index, so the index is the source wherever it speaks: Scholomance
 * is tier 3 and Stratholme 4 because their Bosses' party-level bands say so,
 * not because anybody typed a number here. Ragefire Chasm, the Stockade and
 * the Ruins of Ahn'Qiraj have no Boss in the index, so those three carry a
 * hand row and `classic-tables.test.mjs` fails a fourth.
 *
 * The law's own tables follow the fetch's: `BASES` (what a WoW subclass and
 * slot becomes), `KNOWN_AS` (the §20 names a record must not duplicate),
 * `OVERRIDES` (the lead's hand, empty on day one), `STAT_MAP`,
 * `SCHOOL_OF_CLASS`, `ENCHANT_OF_SCHOOL` and `TEMPLATES`.
 */

import {
  gate, none, onHit as onHitSig, once, standing, tick as tickSig,
  use as useSig, whenStruck as whenStruckSig
} from "./signatures.mjs";

/**
 * The upstream `slot` vocabulary this conversion supports — every slot the
 * filtered pool actually carries, and no other. A Shirt, a Tabard, a Bag, a
 * Quiver, Ammo and `Non-equippable` are outside it and are counted as
 * rejections rather than dropped in silence.
 */
export const SUPPORTED_SLOTS = Object.freeze([
  "One-Hand", "Two-Hand", "Main Hand", "Off Hand", "Held In Off-hand",
  "Ranged", "Thrown", "Relic",
  "Head", "Neck", "Shoulder", "Back", "Chest", "Wrist", "Hands", "Waist",
  "Legs", "Feet", "Finger", "Trinket"
]);

/** The upstream `quality` words a find may carry. Legendaries are 08 §20's. */
export const SUPPORTED_QUALITIES = Object.freeze(["Rare", "Epic"]);

/** The upstream `class` words. Everything else is a consumable or a reagent. */
export const SUPPORTED_CLASSES = Object.freeze(["Weapon", "Armor"]);

/** The upstream `source.category` words a drop may carry. */
export const DROP_CATEGORIES = Object.freeze(["Boss Drop", "Zone Drop"]);

/**
 * The 26 Classic instances, in progression order — Ragefire Chasm first,
 * Naxxramas last — which is the order the pack's folders take.
 *
 * `aliases` carries the other zone ids upstream files the same place under.
 * Only one does: the Sunken Temple (1417) and the Temple of Atal'Hakkar
 * (1477) are two ids for one dungeon, and both appear on drops.
 */
export const ZONES = Object.freeze([
  { id: 2437, aliases: Object.freeze([]), name: "Ragefire Chasm", kind: "Dungeons", dungeon: null, tier: 2 },
  { id: 1581, aliases: Object.freeze([]), name: "The Deadmines", kind: "Dungeons", dungeon: "The Deadmines", tier: null },
  { id: 718, aliases: Object.freeze([]), name: "Wailing Caverns", kind: "Dungeons", dungeon: "The Wailing Caverns", tier: null },
  { id: 209, aliases: Object.freeze([]), name: "Shadowfang Keep", kind: "Dungeons", dungeon: "Shadowfang Keep", tier: null },
  { id: 796, aliases: Object.freeze([]), name: "Scarlet Monastery", kind: "Dungeons", dungeon: "The Scarlet Monastery", tier: null },
  { id: 719, aliases: Object.freeze([]), name: "Blackfathom Deeps", kind: "Dungeons", dungeon: "Blackfathom Deeps", tier: null },
  { id: 717, aliases: Object.freeze([]), name: "The Stockade", kind: "Dungeons", dungeon: null, tier: 2 },
  { id: 491, aliases: Object.freeze([]), name: "Razorfen Kraul", kind: "Dungeons", dungeon: "Razorfen Kraul", tier: null },
  { id: 721, aliases: Object.freeze([]), name: "Gnomeregan", kind: "Dungeons", dungeon: "Gnomeregan", tier: null },
  { id: 722, aliases: Object.freeze([]), name: "Razorfen Downs", kind: "Dungeons", dungeon: "Razorfen Downs", tier: null },
  { id: 1176, aliases: Object.freeze([]), name: "Zul'Farrak", kind: "Dungeons", dungeon: "Zul'Farrak", tier: null },
  { id: 1337, aliases: Object.freeze([]), name: "Uldaman", kind: "Dungeons", dungeon: "Uldaman", tier: null },
  { id: 2100, aliases: Object.freeze([]), name: "Maraudon", kind: "Dungeons", dungeon: "Maraudon", tier: null },
  {
    id: 1477, aliases: Object.freeze([1417]), name: "The Temple of Atal'Hakkar",
    kind: "Dungeons", dungeon: "The Temple of Atal'Hakkar", tier: null
  },
  // 14 §14 files three Bosses under three wings; the north wing is the row a
  // zone-wide drop takes, and all three sit in the same band.
  { id: 2557, aliases: Object.freeze([]), name: "Dire Maul", kind: "Dungeons", dungeon: "Dire Maul, the north wing", tier: null },
  { id: 1584, aliases: Object.freeze([]), name: "Blackrock Depths", kind: "Dungeons", dungeon: "Blackrock Depths", tier: null },
  { id: 1583, aliases: Object.freeze([]), name: "Blackrock Spire", kind: "Dungeons", dungeon: "Blackrock Spire", tier: null },
  { id: 2057, aliases: Object.freeze([]), name: "Scholomance", kind: "Dungeons", dungeon: "Scholomance", tier: null },
  { id: 2017, aliases: Object.freeze([]), name: "Stratholme", kind: "Dungeons", dungeon: "Stratholme", tier: null },
  { id: 2717, aliases: Object.freeze([]), name: "Molten Core", kind: "Raids", dungeon: "The Molten Core", tier: null },
  { id: 2159, aliases: Object.freeze([]), name: "Onyxia's Lair", kind: "Raids", dungeon: "Onyxia's Lair", tier: null },
  // 14 §14 files Nefarian under *The mountain's peak*, which is Blackwing Lair.
  { id: 2677, aliases: Object.freeze([]), name: "Blackwing Lair", kind: "Raids", dungeon: "The mountain's peak", tier: null },
  { id: 1977, aliases: Object.freeze([]), name: "Zul'Gurub", kind: "Raids", dungeon: "Zul'Gurub", tier: null },
  { id: 3429, aliases: Object.freeze([]), name: "Ruins of Ahn'Qiraj", kind: "Raids", dungeon: null, tier: 4 },
  { id: 3428, aliases: Object.freeze([]), name: "Ahn'Qiraj", kind: "Raids", dungeon: "Ahn'Qiraj", tier: null },
  { id: 3456, aliases: Object.freeze([]), name: "Naxxramas", kind: "Raids", dungeon: "Naxxramas", tier: null }
]);

/** Every upstream zone id the filter accepts, aliases included. */
export const ZONE_IDS = Object.freeze(ZONES.flatMap(z => [z.id, ...z.aliases]));

const BY_ID = new Map();
for (const zone of ZONES) {
  BY_ID.set(zone.id, zone);
  for (const alias of zone.aliases) BY_ID.set(alias, zone);
}

/** The zone row an upstream id belongs to, aliases resolved, or null. */
export function zoneFor(id) {
  return BY_ID.get(Number(id)) ?? null;
}

/**
 * The class sets a token is turned in for, and the instance the token comes
 * out of. A set piece carries `source.category: "Quest"` and no zone of its
 * own, so this roster is the only thing that says where it is from.
 *
 * Zul'Gurub's nine at five pieces, the Ruins of Ahn'Qiraj's nine at three,
 * Ahn'Qiraj's nine at five, Naxxramas's nine at nine. **The names are
 * upstream's**, verified against the data by the fetch, which throws on a
 * roster name no set line carries.
 */
export const SETS = Object.freeze({
  // Zul'Gurub (1977) — the tier 1.5 sets, five pieces each.
  "Augur's Regalia": 1977,
  "Confessor's Raiment": 1977,
  "Demoniac's Threads": 1977,
  "Freethinker's Armor": 1977,
  "Haruspex's Garb": 1977,
  "Illusionist's Attire": 1977,
  "Madcap's Outfit": 1977,
  "Predator's Armor": 1977,
  "Vindicator's Battlegear": 1977,
  // Ruins of Ahn'Qiraj (3429) — three pieces each.
  "Battlegear of Eternal Justice": 3429,
  "Battlegear of Unyielding Strength": 3429,
  "Emblems of Veiled Shadows": 3429,
  "Finery of Infinite Wisdom": 3429,
  "Gift of the Gathering Storm": 3429,
  "Implements of Unspoken Names": 3429,
  "Symbols of Unending Life": 3429,
  "Trappings of the Unseen Path": 3429,
  "Trappings of Vaulted Secrets": 3429,
  // Ahn'Qiraj (3428) — the tier 2.5 sets, five pieces each.
  "Avenger's Battlegear": 3428,
  "Conqueror's Battlegear": 3428,
  "Deathdealer's Embrace": 3428,
  "Doomcaller's Attire": 3428,
  "Enigma Vestments": 3428,
  "Garments of the Oracle": 3428,
  "Genesis Raiment": 3428,
  "Stormcaller's Garb": 3428,
  "Striker's Garb": 3428,
  // Naxxramas (3456) — the tier 3 sets, nine pieces each.
  "Bonescythe Armor": 3456,
  "Cryptstalker Armor": 3456,
  "Dreadnaught's Battlegear": 3456,
  "Dreamwalker Raiment": 3456,
  "Frostfire Regalia": 3456,
  "Plagueheart Raiment": 3456,
  "Redemption Armor": 3456,
  "The Earthshatterer": 3456,
  "Vestments of Faith": 3456
});

/**
 * The set line a tooltip opens a set block with: `Augur's Regalia (0/5)`,
 * at `format: "Misc"`. It is the only place a piece names its set.
 */
export const SET_LINE = /^(.+?) \(0\/(\d+)\)$/;

/**
 * The set a record belongs to, read off its tooltip, or null.
 * @param {{tooltip?: Array<{label?: string, format?: string}>}} record
 * @returns {{name: string, size: number}|null}
 */
export function setLineOf(record) {
  for (const line of record?.tooltip ?? []) {
    if (line?.format !== "Misc") continue;
    const m = SET_LINE.exec(String(line.label ?? ""));
    if (m) return { name: m[1], size: Number(m[2]) };
  }
  return null;
}

/* ===================================================== the conversion law */

/**
 * The §20 names a Classic record would otherwise duplicate, in the WoW
 * spelling on the left and the book's on the right.
 *
 * **The fetch already dropped the 81 records the chapter holds** (they are in
 * the header's `excluded.bookNames`), so this is the parser's second door
 * rather than its first: it compares `knownAs(name)` against the chapter's own
 * document names and skips a match. `Judgement` is the WoW spelling and
 * `Judgment` the book's, which is the one collision a straight name compare
 * would miss.
 */
export const KNOWN_AS = Object.freeze({
  "Judgement Armor": "Judgment Armor",
  "Judgement Belt": "Judgment Armor",
  "Judgement Bindings": "Judgment Armor",
  "Judgement Breastplate": "Judgment Armor",
  "Judgement Crown": "Judgment Armor",
  "Judgement Gauntlets": "Judgment Armor",
  "Judgement Legplates": "Judgment Armor",
  "Judgement Sabatons": "Judgment Armor",
  "Judgement Spaulders": "Judgment Armor",
  "Rhok'delar": "Rhok'delar, Longbow of the Ancient Keepers",
  Thunderfury: "Thunderfury, Blessed Blade of the Windseeker",
  Sulfuras: "Sulfuras, Hand of Ragnaros"
});

/** The book's name for a WoW one, where the two differ. */
export function knownAs(name) {
  return KNOWN_AS[String(name ?? "")] ?? String(name ?? "");
}

/**
 * The lead's hand, applied AFTER `fill` and recorded in `how[]`.
 *
 * Keyed by upstream `itemId`, because a name is not unique across a re-fetch
 * and an id is. Every key is optional: `skip` drops the record, `base` names a
 * different base row, `rating`, `apBonus`, `traits`, `grants`, `signature` and
 * `worn` replace what the law worked out, and `note` is printed in the report
 * beside the item.
 *
 * **Empty on day one, and that is the point.** Nothing here is a fix for a
 * rule; a rule that is wrong is fixed in the law. This is for the items whose
 * conversion the lead wants to write by hand.
 */
export const OVERRIDES = Object.freeze({});

/** A WoW attribute line to the attribute 05 §1 names. Spirit is Wisdom. */
export const STAT_MAP = Object.freeze({
  strength: "Strength",
  agility: "Dexterity",
  stamina: "Constitution",
  intellect: "Intelligence",
  spirit: "Wisdom"
});

/**
 * The school a class's Spellpower answers to (A5).
 *
 * **The later client's tooltip took the school off the line.** Classic wrote
 * *Increases damage done by Fire spells and effects by up to N*; the dump this
 * record comes from writes *Increases spell power by N* and never names a
 * school. So the school comes from the `Classes:` line or from nowhere, and an
 * item with no class line has its Spellpower candidate withheld and is flagged
 * `spellpower:school`.
 *
 * The three classes that cast in no school of their own — Warrior, Rogue and
 * Ranger — are absent, which is what makes a Spellpower line on a warrior's
 * item withheld rather than guessed.
 */
export const SCHOOL_OF_CLASS = Object.freeze({
  Warlock: "fel",
  Mage: "arcane",
  Priest: "holy",
  Paladin: "holy",
  Druid: "nature",
  Shaman: "nature"
});

/** 08 §6's School enchantment for a school, by the prefix's own name. */
export const ENCHANT_OF_SCHOOL = Object.freeze({
  fire: "Flaming",
  frost: "Frostbound",
  holy: "Blessed",
  shadow: "Shadowed",
  nature: "Storm-called",
  arcane: "Arcanum",
  fel: "Fel-touched"
});

/**
 * What a WoW subclass and slot becomes, keyed `<subclass>|<slot>` with
 * `*|<slot>` as the fallback, so the twelve worn slots need one row each
 * whatever the subclass says.
 *
 * `rows` is the candidate base list **in priority order**: `classify` takes the
 * first row whose `trait` is the Effect trait a proc wants — free, because 08
 * §4 prices no Effect trait and §20 never adds one — and otherwise takes
 * `rows[0]`. `byName` refines on the item's own name and `bySpeed` on its
 * swing, both read before the trait.
 *
 * `grip` is the word `flags.azeroth-rpg.base` carries after the base name, in
 * §20's own vocabulary (*Scimitar, one-handed*). `flag` names a code the
 * conversion records on every item that takes the row, so an assumption is one
 * row to flip and its scope is countable.
 */
export const BASES = Object.freeze({
  // --- A2: a main-hand dagger is a Scimitar, an off-hand one a Dagger ---
  "Dagger|One-Hand": {
    type: "weapon", grip: "one-handed", flag: "base:dagger",
    rows: [
      { name: "Scimitar", trait: null },
      { name: "Cutlass", trait: "Hook" },
      { name: "Gurubashi tusk-blade", trait: "Bleed" },
      { name: "Farstrider's blade", trait: "Nick" }
    ]
  },
  "Dagger|Off Hand": {
    type: "weapon", grip: "one-handed", offHand: true,
    rows: [
      { name: "Dagger", trait: null },
      { name: "Main-gauche", trait: "Nick" },
      { name: "Punch dagger", trait: "Pierce" }
    ]
  },
  "Fist Weapon|*": {
    type: "weapon", grip: "one-handed",
    rows: [{ name: "Cestus", trait: null }]
  },
  "Sword|One-Hand": {
    type: "weapon", grip: "one-handed",
    // A fast sword is a Scimitar; 08 §7 gives the Longsword no Fast at all.
    bySpeed: { max: 1.8, name: "Scimitar" },
    rows: [
      { name: "Longsword", trait: null },
      { name: "Cutlass", trait: "Hook" },
      { name: "Khopesh", trait: "Nick" },
      { name: "Dark Iron blade", trait: "Bleed" }
    ]
  },
  "Sword|Two-Hand": {
    type: "weapon", grip: "two-handed",
    rows: [
      { name: "Greatsword", trait: null },
      { name: "Highland claymore", trait: "Nick" }
    ]
  },
  "Axe|One-Hand": {
    type: "weapon", grip: "one-handed",
    rows: [
      { name: "Battleaxe", trait: null },
      { name: "Orcish war axe", trait: "Bleed" },
      { name: "Warsong axe", trait: "Rattle" }
    ]
  },
  "Axe|Two-Hand": {
    type: "weapon", grip: "two-handed",
    rows: [
      { name: "Greataxe", trait: null },
      { name: "Blackrock cleaver", trait: "Bleed" },
      { name: "Executioner's axe", trait: "Maim" }
    ]
  },
  "Mace|One-Hand": {
    type: "weapon", grip: "one-handed",
    // 08 §7 files the Sceptre as an Implement, which is what a caster's mace is.
    casterRow: "Sceptre",
    rows: [
      { name: "Warhammer", trait: null },
      { name: "Morningstar", trait: "Nick" },
      { name: "Flail", trait: "Shove" }
    ]
  },
  "Mace|Two-Hand": {
    type: "weapon", grip: "two-handed",
    rows: [
      { name: "Maul", trait: null },
      { name: "Ragetotem war-maul", trait: "Daze" },
      { name: "Spiked maul", trait: "Pierce" },
      { name: "Bronzebeard greathammer", trait: "Rattle" }
    ]
  },
  "Polearm|Two-Hand": {
    type: "weapon", grip: "two-handed",
    rows: [
      { name: "Halberd", trait: "Hook" },
      { name: "Poleaxe", trait: null },
      { name: "Bardiche", trait: "Nick" },
      { name: "Pike", trait: "Impale" }
    ]
  },
  "Staff|Two-Hand": {
    type: "weapon", grip: "two-handed",
    rows: [
      { name: "Quarterstaff", trait: null },
      { name: "Carved pole", trait: "Shove" },
      { name: "Gnarled staff", trait: "Snag" },
      { name: "Totem-staff", trait: "Rattle" },
      { name: "Ancestor stake", trait: "Nick" }
    ]
  },
  "Bow|Ranged": {
    type: "weapon", grip: "two-handed",
    epicRow: { tier: 4, name: "Elven longbow" },
    rows: [{ name: "Longbow", trait: null }]
  },
  "Crossbow|Ranged": {
    type: "weapon", grip: "two-handed",
    bySpeed: { min: 3, name: "Heavy crossbow" },
    rows: [{ name: "Light crossbow", trait: null }]
  },
  "Gun|Ranged": {
    type: "weapon", grip: "two-handed",
    byName: [
      [/\b(blunderbuss|scattergun|shotgun)\b/i, "Blunderbuss"],
      [/\b(pistol|flintlock|hand cannon)\b/i, "Flintlock pistol"],
      [/\b(carbine|repeater)\b/i, "Dwarven carbine"]
    ],
    rows: [{ name: "Rifle", trait: null }]
  },
  "Thrown|Thrown": {
    type: "weapon", grip: "one-handed",
    byName: [
      [/\b(spear|javelin|harpoon)\b/i, "Javelin"],
      [/\b(star|glaive|disc|chakram|boomerang)\b/i, "Chakram"]
    ],
    rows: [{ name: "Throwing axe", trait: null }]
  },
  "Wand|Ranged": {
    type: "weapon", grip: "one-handed",
    byName: [[/\b(skull|bone|bones|grave)\b/i, "Skull-set wand"]],
    rows: [{ name: "Wand", trait: null }]
  },
  "*|Held In Off-hand": {
    type: "weapon", grip: "one-handed", offHand: true,
    rows: [{ name: "Orb", trait: null }]
  },

  // --- the suits: a WoW chest piece is a whole suit of its category ---
  "Cloth|Chest": { type: "armor", category: "cloth", flagBase: "Cloth", rows: [{ name: "Homespun", trait: null }] },
  "Leather|Chest": { type: "armor", category: "leather", flagBase: "Leather", rows: [{ name: "Hide", trait: null }] },
  "Mail|Chest": { type: "armor", category: "mail", flagBase: "Mail", rows: [{ name: "Chain shirt", trait: null }] },
  "Plate|Chest": { type: "armor", category: "plate", flagBase: "Plate", rows: [{ name: "Half-plate", trait: null }] },

  "Shield|Off Hand": {
    type: "armor", category: "none", shield: true, flagBase: "Shield",
    byName: [
      [/\b(buckler|targe)\b/i, "Buckler"],
      [/\b(kite|heater)\b/i, "Kite shield"],
      [/\b(tower|bulwark|aegis|barricade)\b/i, "Tower shield"]
    ],
    rows: [{ name: "Shield", trait: null }]
  },

  // --- 08 §11's worn things, one row a slot ---
  "*|Back": { type: "gear", rows: [{ name: "Cloak", trait: null }] },
  "*|Head": {
    type: "gear",
    byName: [[/\b(mask|cowl|veil|visage)\b/i, "Mask"]],
    rows: [{ name: "Circlet", trait: null }]
  },
  // 08 §11 gained a Shoulder and the Mantle that fills it (D-689). A brooch
  // is pinned at the collar and is worn at the neck, so a shoulder piece
  // converts onto the garment rather than onto the jewellery.
  "*|Shoulder": { type: "gear", rows: [{ name: "Mantle", trait: null }] },
  "Cloth|Waist": { type: "gear", rows: [{ name: "Sash", trait: null }] },
  "*|Waist": { type: "gear", rows: [{ name: "Belt", trait: null }] },
  "*|Hands": { type: "gear", rows: [{ name: "Gloves", trait: null }] },
  "*|Feet": { type: "gear", rows: [{ name: "Boots", trait: null }] },
  "*|Wrist": { type: "gear", rows: [{ name: "Bracers", trait: null }] },
  "*|Neck": {
    type: "gear",
    byName: [[/\b(pendant|medallion|talisman)\b/i, "Pendant"]],
    rows: [{ name: "Amulet", trait: null }]
  },
  "*|Finger": {
    type: "gear",
    byName: [[/\b(signet|seal)\b/i, "Signet ring"]],
    rows: [{ name: "Ring", trait: null }]
  },
  "*|Trinket": { type: "gear", rows: [{ name: "Trinket", trait: null }] },
  "*|Legs": { type: "gear", rows: [{ name: "Leggings", trait: null }] },

  // --- A6: a relic is that class's Augment, at the tier's bonus ---
  "Libram|Relic": {
    type: "gear", flag: "base:relic", augment: { className: "Paladin", category: "Libram" },
    rows: [{ name: "Libram", trait: null }]
  },
  "Idol|Relic": {
    type: "gear", flag: "base:relic", augment: { className: "Druid", category: "Idol" },
    rows: [{ name: "Idol", trait: null }]
  },
  "Totem|Relic": {
    type: "gear", flag: "base:relic", augment: { className: "Shaman", category: "Totem" },
    rows: [{ name: "Totem", trait: null }]
  }
});

/**
 * The slots that are a one-handed grip by another name. Upstream files a
 * weapon that cannot be paired as `Main Hand` and one that can only be paired
 * as `Off Hand`, which is a rule about the OTHER hand rather than about the
 * weapon: a main-hand mace is a mace. Only the dagger keeps its own off-hand
 * row, because A2 turns the two into different bases.
 */
const SLOT_ALIAS = Object.freeze({ "Main Hand": "One-Hand", "Off Hand": "One-Hand" });

/**
 * The base row a WoW subclass and slot resolves to, or null.
 *
 * The subclass-specific key wins over the `*` one, which is what gives a cloth
 * waist a Sash and everything else a Belt; the alias is read after the exact
 * slot, so `Dagger|Off Hand` keeps its own row.
 */
export function baseRowFor(subclass, slot) {
  return BASES[`${subclass}|${slot}`]
    ?? BASES[`${subclass}|${SLOT_ALIAS[slot]}`]
    ?? BASES[`${subclass}|*`]
    ?? BASES[`*|${slot}`]
    ?? null;
}

/**
 * The Signature sentences, with the placeholders `signatureFor` fills:
 * `{K}` a damage rider, `{School}` its school, `{H}` a Health or temporary
 * Health figure off D1 §4.4a's healing band, `{M}` a Mana figure off 08 §12's
 * two draughts, `{Rest}` the rest a cooldown becomes, `{duration}` the book's
 * own duration ladder, `{Class}` the class a gate names, `{kinds}` the
 * creatures a gate names, `{Condition}` a condition it inflicts, `{entry}` a
 * bestiary creature, `{pair}` the other half of a pair and `{because}` why a
 * placeholder is still a placeholder.
 *
 * **Every row carries an `automation`** (D-692), and it is a FUNCTION of the
 * same substitution bag the sentence is built from — so the descriptor's
 * numbers and the sentence's cannot disagree, whatever the record says. One
 * row answers for every item that takes it: 23 rows covered all 1,769 Classic
 * finds and nothing read a single one of them until this. Eight more were
 * added as the placeholders were read — the last two, `T-struck` and
 * `T-debuff`, once the descriptor gained a condition on the attacker and a
 * Bane on the target.
 *
 * **`status` is what the lead approves.** `book` means a §20 entry already
 * carries this exact sentence, so nothing is being invented; `proposed` means
 * the tool wrote it and every item taking it is flagged
 * `signature:proposed:<id>` until the status here changes — one edit clears
 * hundreds of flags. `placeholder` means the sentence is NOT written and the
 * item waits for a hand.
 *
 * **A placeholder no longer quotes the tooltip** (D-692, the lead's S1:
 * *stop quoting WoW at the player*). Eleven `T-pair` items carried the raw
 * line with no prefix at all, so *Proc chance: 1%, 4m cooldown* read as
 * finished rules on a player's sheet. The words are still on the item, in
 * `flags.azeroth-rpg.classic.flagged`, and in `tools/classic/REPORT.md`,
 * which is where the lead reads them.
 *
 * `gateable` marks a template that becomes `gated` (1) where the record
 * carries a `Classes:` line and stays `alwaysOn` (2) where it does not.
 * **No template rolls a die** (D2 §12): a WoW proc chance becomes a Success
 * Level threshold or an always-on rider, never a percentage.
 */
export const TEMPLATES = Object.freeze({
  "T-reflect": {
    kind: "alwaysOn", status: "book",
    text: "A creature that hits you in melee takes {K} {School} damage, and Ward applies.",
    note: "08 §20's Skullflame Shield",
    automation: v => whenStruckSig({ whenStruck: { damage: { amount: v.K, type: v.school } } })
  },
  "T-sunder": {
    kind: "alwaysOn", status: "book",
    text: "On a hit, the target's Armor Points fall by 1 until the end of the fight, to a floor of 0. It stacks with itself three times.",
    note: "08 §20's Bonereaver's Edge",
    // The key 08 §5's Sundering already fires. The cap of three is not carried
    // — the descriptor counts no stacks — and stays on the item's own sentence,
    // exactly as `BOOK_SIGNATURES`' Bonereaver's Edge has it.
    automation: () => onHitSig({ onHit: { sunder: 1 } })
  },
  "T-momentum": {
    kind: "alwaysOn", status: "book",
    text: "Gain 1 additional Momentum the first time you hit each round.",
    note: "08 §20's Dal'Rend's Sacred Charge",
    automation: () => onHitSig({ onHit: { momentum: 1 } })
  },
  // **IT HAS ONE PRODUCER NOW, AND IT TOOK D-698 TO FIND IT.** D-692 went
  // looking for the chain branch the plan called for and reported that the
  // record has no chain proc at all: the only lines carrying *jump*, *chain*
  // or *arc* beside a damage run were four set bonuses naming WoW's own Chain
  // Lightning and a handful of Arcane damage rows the word *arc* matched
  // inside. The one it missed says it in other words — the Ravager's *you
  // attack all nearby enemies* — and `procArcIn` is what reads it, so this row
  // has an item rather than being a sentence nobody sees (D-681).
  "T-arc": {
    kind: "alwaysOn", status: "book",
    text: "On a hit, the attack arcs to one other creature within 15 feet for {K} {School} damage.",
    note: "08 §20's Thunderfury",
    automation: v => onHitSig({
      onHit: { damage: { amount: v.K, type: v.school }, arc: { targets: 1, feet: 15 } }
    })
  },
  "T-crit": {
    kind: "alwaysOn", gateable: true, status: "book",
    text: "You inflict a Critical Injury on a natural 19 as well as a 20.",
    gatedText: "A {Class} {holds} it inflicts a Critical Injury on a natural 19 as well as a 20.",
    note: "08 §20's Judgment Armor",
    automation: v => standing({ gates: v.gates, criticalOn: 19 })
  },
  "T-slow": {
    kind: "alwaysOn", status: "proposed",
    text: "On SL 2, the target is <strong>Slowed</strong> until the end of its next turn.",
    automation: () => onHitSig({ onHit: { sl: 2, condition: { id: "slowed", until: "endOfNextTurn" } } })
  },
  "T-stun": {
    kind: "alwaysOn", status: "proposed",
    text: "On SL 2, the target is <strong>Stunned</strong> until the end of its next turn.",
    automation: () => onHitSig({ onHit: { sl: 2, condition: { id: "stunned", until: "endOfNextTurn" } } })
  },
  "T-root": {
    kind: "alwaysOn", status: "proposed",
    text: "On SL 2, the target is <strong>Entangled</strong> until the end of its next turn.",
    automation: () => onHitSig({ onHit: { sl: 2, condition: { id: "entangled", until: "endOfNextTurn" } } })
  },
  "T-bleed": {
    kind: "alwaysOn", status: "proposed",
    text: "On SL 2, the target gains <strong>Bleeding 1</strong>.",
    // `weapon-traits.mjs#EFFECT.bleed` exactly: SL 2, one stack, no duration.
    automation: () => onHitSig({ onHit: { sl: 2, condition: { id: "bleeding", value: 1 } } })
  },
  "T-shove": {
    kind: "alwaysOn", status: "proposed",
    text: "On SL 2, the target is pushed 5 feet directly away.",
    // **THE SENTENCE WAS ALREADY RIGHT AND NOTHING FIRED IT** (D-698, the
    // lead: *keep 5ft push on SL 2*). `onHit` carried damage, a condition, a
    // sunder, Momentum, healing and an arc and nothing that moved a body, so
    // this row was `none("noEquivalent")` and `firesOnHit` dropped it: the one
    // item taking it never put a line on a card. `onHit.push` is the key, and
    // the MOVE stays the table's — a token is dragged, and D2 §12 keeps that
    // call — exactly as 08 §5's own Shove is a fired note and not an
    // automatic step.
    automation: () => onHitSig({ onHit: { sl: 2, push: 5 } })
  },
  "T-use-dr": {
    kind: "alwaysOn", status: "proposed",
    text: "{Rest}, as a Half-Action, add 1 to your Damage Rating {duration}.",
    automation: v => useSig({
      use: {
        action: "half", uses: once(v.per), duration: v.duration,
        // DERIVED, so `final` (D-668). `system.damageRatingBonus.all` is what
        // `actions.mjs` and `workflows.mjs` already add to the damage.
        changes: [{ key: "system.damageRatingBonus.all", type: "add", value: "1", phase: "final" }]
      }
    })
  },
  "T-use-spell": {
    kind: "alwaysOn", status: "proposed",
    text: "{Rest}, as a Half-Action, carry +1 Spellpower in every school {duration}.",
    // **NO CHANGE, ON PURPOSE.** `system.spellpower` is a map that holds only
    // the schools something granted, and core's `add` on a key that is not
    // there computes `undefined + 1` and writes NaN. *Every school* is seven
    // keys that may each be absent, so the press spends its use and the table
    // reads the sentence.
    automation: v => useSig({ use: { action: "half", uses: once(v.per), duration: v.duration } })
  },
  "T-use-heal": {
    kind: "alwaysOn", status: "proposed",
    text: "{Rest}, as a Half-Action, regain {H} Health.",
    automation: v => useSig({ use: { action: "half", uses: once(v.per), heal: { health: v.H } } })
  },
  "T-use-absorb": {
    kind: "alwaysOn", status: "proposed",
    text: "{Rest}, as a Half-Action, gain {H} temporary Health until the end of the encounter.",
    // TEMPORARY HEALTH HAS NO KEY ON THE DESCRIPTOR — `use.heal.health` is
    // damage healed, which is a different thing — and needs none since D-777:
    // `workflows.useSignature` reads this sentence through
    // `temporary-health.mjs#readTemporaryHealth` and grants it through 05's law
    // as the use is counted.
    automation: v => useSig({ use: { action: "half", uses: once(v.per) } })
  },
  "T-use-mana": {
    kind: "alwaysOn", status: "proposed",
    text: "{Rest}, as a Half-Action, regain {M} Mana.",
    automation: v => useSig({ use: { action: "half", uses: once(v.per), heal: { mana: v.M } } })
  },
  "T-use-armor": {
    kind: "alwaysOn", status: "proposed",
    text: "{Rest}, as a Half-Action, add 1 Armor Point {duration}.",
    automation: v => useSig({
      use: {
        action: "half", uses: once(v.per), duration: v.duration,
        changes: [{ key: "system.ap.body", type: "add", value: "1", phase: "final" }]
      }
    })
  },
  "T-use-speed": {
    kind: "alwaysOn", status: "proposed",
    text: "{Rest}, as a Half-Action, your Speed rises by 10 feet {duration}.",
    automation: v => useSig({
      use: {
        action: "half", uses: once(v.per), duration: v.duration,
        changes: [{ key: "system.speed", type: "add", value: "10", phase: "final" }]
      }
    })
  },
  "T-use-free": {
    kind: "alwaysOn", status: "proposed",
    text: "{Rest}, as a Half-Action, you cannot be made <strong>Slowed</strong>, <strong>Entangled</strong>, <strong>Stunned</strong> or <strong>Prone</strong> {duration}, and any of the four already on you ends.",
    note: "the sentence is 08 §20's Free Action Potion",
    // The four END, which `use.ends` carries. The REFUSAL is only for the
    // duration, and `refuses` is what the bearer refuses while the thing is
    // worn, so writing it there would make it permanent.
    automation: v => useSig({
      use: {
        action: "half", uses: once(v.per), duration: v.duration,
        ends: ["slowed", "entangled", "stunned", "prone"]
      }
    })
  },
  "T-mp5": {
    kind: "alwaysOn", status: "proposed",
    text: "At the start of each of your turns, regain 1 Mana.",
    automation: () => tickSig({ tick: { mana: 1 } })
  },
  "T-hp5": {
    kind: "alwaysOn", status: "proposed",
    text: "At the start of each of your turns, regain 1 Health.",
    automation: () => tickSig({ tick: { health: 1 } })
  },

  /* ---- D-697's ratings, which 08 §6's affix pool cannot carry ---- */

  /**
   * **THE CARRIER IS THE SIGNATURE, NOT AN AFFIX** (the lead, 2026-09-10).
   * 08 §6's pool sells attributes, Fortitude, Spellpower, Ward and skill Boons
   * and nothing else — there is no Defense, Attack or Speed affix, and the two
   * whose names suggest otherwise are neither (*Deflecting* is Block 4→6 on a
   * shield, *Swift* is Reload −1 on a crossbow). So `offerAbility` and
   * `offerBoon` would drop every one of these as `noAffix`. A standing
   * Signature carrying an 08 §6 GRANT SENTENCE needs no affix and §20 already
   * prices one: always on 2, gated 1.
   *
   * **`{N}` is a RANK, never a divisor.** `buildCohorts` ranks the rating
   * against every other line of its own kind in the file and `pointsForRank`
   * turns that into one point or two, exactly as a weapon's Damage Rating is
   * graded — because the pool spans Ragefire Chasm to Naxxramas and an
   * absolute threshold (*20 hit rating is +1 Attack*) would put every
   * Naxxramas item at the ceiling and every Uldaman one at the floor.
   * **Speed's step is 5 FEET**, because 05 and 10 are the rungs 10-CORRUPTION
   * and 05 §10's encumbrance already move Speed in; one foot is not a number
   * this game says.
   */
  "T-hit": {
    // A hit rating, a spell hit rating and an expertise rating. Expertise in
    // Classic is anti-dodge and anti-parry, so the Attack Test is the nearest
    // true thing this system has (D-697).
    kind: "alwaysOn", gateable: true, status: "proposed",
    text: "It adds {N} to your Attack Tests.",
    gatedText: "A {Class} {holds} it adds {N} to their Attack Tests.",
    automation: v => standing({ gates: v.gates, grants: [`+${v.N} Attack`] })
  },
  "T-guard": {
    // A dodge rating and a defense rating. Both are Defense in 05 §2.
    kind: "alwaysOn", gateable: true, status: "proposed",
    text: "It adds {N} to your Defense.",
    gatedText: "A {Class} {holds} it adds {N} to their Defense.",
    automation: v => standing({ gates: v.gates, grants: [`+${v.N} Defense`] })
  },
  "T-parry": {
    // 06 §6's Parry is a Reaction that costs no Momentum, so there is nothing
    // to discount: a Boon on the Test is what a parry rating means here. It
    // carries no {N} — a Boon is a Boon, and 05 §2 counts them, not points.
    kind: "alwaysOn", gateable: true, status: "proposed",
    text: "You take a Boon on Parry Tests.",
    gatedText: "A {Class} {holds} it takes a Boon on Parry Tests.",
    automation: v => standing({ gates: v.gates, grants: ["A Boon on Parry Tests"] })
  },
  "T-haste": {
    // 06 gives a round two Half-Actions and one Attack and there is no faster,
    // so haste is FEET (the lead's W4). It lands as a Speed part beside 05
    // §10's load and 08 §8's Encumbering rather than as a floor.
    kind: "alwaysOn", gateable: true, status: "proposed",
    text: "Your Speed is {N} feet greater.",
    gatedText: "A {Class} {holds} it moves {N} feet further.",
    automation: v => standing({ gates: v.gates, grants: [`+${v.N} Speed`] })
  },
  "T-block": {
    // A block rating on something that is not a shield, which 08 §5's
    // Deflecting cannot go on. `blockBonus` is 08 §20's own key — Drillborer
    // Disk's *Block reduces damage by a further 2* — and 06 §6's Block is
    // what it is further than.
    kind: "alwaysOn", gateable: true, status: "proposed",
    text: "A <strong>Block</strong> you make takes off a further {N}.",
    gatedText: "A {Class} {holds} it Blocks for a further {N}.",
    automation: v => standing({ gates: v.gates, blockBonus: v.N })
  },

  /* ---- D-692's new families, out of the 196 placeholders ---- */

  "T-lifesteal": {
    kind: "alwaysOn", status: "proposed",
    text: "On a hit, you regain {K} Health.",
    // The blade ALSO carries 08 §5's Thirsting, which `foundTraits` adds off
    // the same line and which costs nothing. They are not the same rule:
    // Thirsting pays on a KILL and this pays on the blow.
    automation: v => onHitSig({ onHit: { heal: v.K } })
  },
  "T-vs-kind": {
    // Gated on the creature struck, which is 08 §20's own Verigan's Fist.
    kind: "gated", status: "proposed",
    text: "Against {kinds}, add 1 to your Damage Rating.",
    automation: v => standing({ gates: [gate("creatureType", v.creatureType)], grants: ["+1 Damage Rating"] })
  },
  "T-summon": {
    kind: "alwaysOn", status: "proposed",
    text: "{Rest}, as a Half-Action, one <strong>{entry}</strong> arrives and fights on your side.",
    automation: v => useSig({
      use: { action: "half", uses: once(v.per) },
      summon: { entry: v.entry, count: 1, side: "summoner", from: "nextRound" }
    })
  },
  "T-guaranteed": {
    // 08 §20's *converting* row: it changes what a blow does rather than
    // adding to it.
    kind: "converting", status: "proposed",
    text: "{Rest}, as a Half-Action, your next Attack this round hits and inflicts a Critical Injury.",
    // A guaranteed hit has no key. The limit is real and the button spends it.
    automation: v => useSig({ use: { action: "half", uses: once(v.per) } })
  },
  "T-struck": {
    // 08 §20's Skullflame Shield is the register — *a creature that hits you
    // in melee …* — and this is the same sentence with a condition where the
    // thorns damage goes. Three finds carry a struck line the tables could not
    // read; two of them freeze or slow whoever landed the blow, and the third
    // reduces the damage taken, which has no key (`Force of Will`).
    kind: "alwaysOn", status: "proposed",
    text: "A creature that hits you in melee is <strong>{Condition}</strong> until the end of its next turn.",
    automation: v => whenStruckSig({
      whenStruck: { condition: { id: v.condition, until: "endOfNextTurn" } }
    })
  },
  "T-debuff": {
    // *Lowers all attributes of target by 10 for 1 min* is a Bane in this
    // system's vocabulary and not a stat change on somebody else's sheet.
    // **A Bane on its NEXT Test**, which is Gorehowl's own wording, so the
    // sentence carries no duration the descriptor cannot hold.
    kind: "alwaysOn", status: "proposed",
    text: "On a hit, the target takes a Bane on its next Test.",
    automation: () => onHitSig({ onHit: { bane: 1 } })
  },
  "T-onhit-damage": {
    kind: "alwaysOn", status: "proposed",
    text: "On a hit, the target takes {K} {School} damage.",
    // A blow that lands an element on a WEAPON is that school's enchantment
    // (08 §5); on a worn thing there is nowhere for the enchantment to sit,
    // and this is the rider that carries it instead.
    automation: v => onHitSig({ onHit: { damage: { amount: v.K, type: v.school } } })
  },
  "T-use-damage": {
    kind: "alwaysOn", status: "proposed",
    text: "{Rest}, as a Half-Action, one creature you can see takes {K} {School} damage.",
    automation: v => useSig({
      use: { action: "half", uses: once(v.per), damage: { amount: v.K, type: v.school } }
    })
  },

  /* ---- D-698's own, out of the 60 that fired nothing ---- */

  /**
   * **THE LEAD'S SL 3 RIDER** (2026-09-10). *Chance on hit* is a rate this
   * system does not keep, and the lead's answer for the whole group is *SL 3
   * or higher "Effect"*: the WoW percentage becomes a Success Level threshold
   * (D2 §12 — no template rolls a die) and the effect is whatever the line's
   * own words name, out of 06 and A1.
   *
   * **These sit at SL 3 while `T-slow`, `T-stun`, `T-root` and `T-bleed` sit
   * at 08 §5's Standard 2.** Those four were already written and firing before
   * this pass and are left where they are; the lead's new rule governs the
   * rows that fired NOTHING. One number in one row unifies them if that is
   * wanted.
   */
  "T-onhit-condition": {
    kind: "alwaysOn", status: "proposed",
    text: "On SL 3, the target is {Conditions} until the end of its next turn.",
    // ONE BLOW MAY LAND MORE THAN ONE (D-698). *The target is Frightened and
    // Slowed* is the lead's own sentence for the Dark Edge of Insanity, and
    // `onHit.condition` could only ever be the first of them.
    automation: v => onHitSig({
      onHit: {
        sl: 3,
        condition: { id: v.conditions[0] ?? null, value: null, until: "endOfNextTurn" },
        conditions: v.conditions.slice(1).map(id => ({ id, value: null, until: "endOfNextTurn" }))
      }
    })
  },
  "T-onhit-bane": {
    // *Reduces target's Strength*, *reduces target enemy's attack power*: one
    // number on somebody else's sheet, which this system says as a Bane.
    // `T-debuff` is the same effect off a line that lowers EVERY attribute and
    // fires on any hit; this is the SL 3 group's.
    kind: "alwaysOn", status: "proposed",
    text: "On SL 3, the target takes a Bane on its next Test.",
    automation: () => onHitSig({ onHit: { sl: 3, bane: 1 } })
  },
  "T-onhit-rating": {
    // The lead's own words for the Lord General's Sword: *SL3 add 2 more
    // damage to weapons rating*. It carries NO damage type - the blow is the
    // weapon's own and this adds to it, where a typed rider would be a second
    // school landing beside it.
    kind: "alwaysOn", status: "proposed",
    text: "On SL 3, the blow deals 2 more damage.",
    automation: () => onHitSig({ onHit: { sl: 3, damage: { amount: 2, type: null } } })
  },
  "T-proc-damage": {
    // The lead's *SL 3 or higher trigger* for an Equip line that lands damage
    // of its own — the Bandit's Insignia and the Misplaced Servo Arm.
    // `T-onhit-damage` is the same rider off a PROC the tooltip reader already
    // typed, which fires on every hit; this is the SL 3 group's.
    kind: "alwaysOn", status: "proposed",
    text: "On SL 3, the target takes {K} {School} damage.",
    automation: v => onHitSig({ onHit: { sl: 3, damage: { amount: v.K, type: v.school } } })
  },
  "T-onhit-mana": {
    // *Restores 50 mana* on a blow. ONE Mana, not 08 §12's draught of six: it
    // fires off every hit that reaches SL 3, where a draught is drunk once.
    kind: "alwaysOn", status: "proposed",
    text: "On SL 3, you regain 1 Mana.",
    automation: () => onHitSig({ onHit: { sl: 3, mana: 1 } })
  },
  "T-ally-heal": {
    // The Lawbringer Armor's eight-piece bonus, in the lead's own words:
    // *heal one target in 15ft radius on melee attack*. The ONE thing in the
    // union that heals somebody else off a blow, and the card draws it as a
    // button because nothing but the table knows which creature.
    kind: "alwaysOn", gateable: true, status: "proposed",
    text: "On a hit, one creature within 15 feet regains {K} Health.",
    gatedText: "A {Class} {holds} it heals one creature within 15 feet for {K} on a hit.",
    automation: v => onHitSig({ gates: v.gates, onHit: { heal: v.K, healFeet: 15 } })
  },
  "T-healing": {
    // *Your direct healing spells ... healing N over 12 sec.* The rate is not
    // one these rules keep; what the line says the bearer does is heal more,
    // which is 08 §20's own Vestments of Transcendence key.
    kind: "alwaysOn", gateable: true, status: "proposed",
    text: "Every spell you cast that restores Health restores 1 more.",
    gatedText: "A {Class} {holds} it restores 1 more Health with every spell of theirs that restores any.",
    automation: v => standing({ gates: v.gates, healingBonus: 1 })
  },
  "T-attribute": {
    // A `Use:` that raises an attribute becomes a PASSIVE while the thing is
    // worn (the lead: *passive effects while equipped, not a use with
    // cooldown*). 08 §20 prices a standing Signature carrying an 08 §6 grant
    // sentence directly, which is what D-697's ratings already ride.
    kind: "alwaysOn", gateable: true, status: "proposed",
    text: "It adds 1 to your {Attribute}.",
    gatedText: "A {Class} {holds} it adds 1 to their {Attribute}.",
    automation: v => standing({ gates: v.gates, grants: [`+1 ${v.attribute}`] })
  },
  "T-bound": {
    // *Increases your pet's damage*, *5% increased damage from your summoned
    // pets*. D-643's bond is what a pet is here, and `boundSignatureEffects`
    // lays the same v14 change a talent lays on the creature.
    kind: "alwaysOn", gateable: true, status: "proposed",
    text: "Every creature you have bound deals 1 more damage.",
    gatedText: "A {Class} {holds} it gives every creature they have bound 1 more damage.",
    automation: v => standing({ gates: v.gates, bound: { damage: 1 } })
  },

  /**
   * **ONE NAMED SPELL OR CLASS FEATURE, IMPROVED** (D-698, the lead's *change
   * to Class Feature or Talent Improvement*). The name comes off
   * `ABILITY_NAMED`, so a line naming something the book does not have records
   * a reason instead of pointing at the nearest thing that sounds like it.
   */
  "T-empower-damage": {
    kind: "alwaysOn", gateable: true, status: "proposed",
    text: "Your <strong>{ability}</strong> adds 1 to its Damage Rating.",
    gatedText: "A {Class} {holds} it adds 1 to the Damage Rating of their <strong>{ability}</strong>.",
    automation: v => standing({ gates: v.gates, empowers: { name: v.ability, damageRating: 1 } })
  },
  "T-empower-heal": {
    kind: "alwaysOn", gateable: true, status: "proposed",
    text: "Your <strong>{ability}</strong> restores 1 more Health.",
    gatedText: "A {Class} {holds} it restores 1 more Health with their <strong>{ability}</strong>.",
    automation: v => standing({ gates: v.gates, empowers: { name: v.ability, heal: 1 } })
  },
  "T-empower-cost": {
    kind: "alwaysOn", gateable: true, status: "proposed",
    text: "Your <strong>{ability}</strong> costs 1 less.",
    gatedText: "A {Class} {holds} it pays 1 less for their <strong>{ability}</strong>.",
    automation: v => standing({ gates: v.gates, empowers: { name: v.ability, cost: 1 } })
  },

  /* ---- the three that are still waiting for a hand ---- */

  "T-set": {
    kind: "gated", status: "placeholder",
    text: "Signature to be written. The rest of the set carried it. {because}",
    automation: v => none(v.reason)
  },
  "T-pair": {
    kind: "alwaysOn", status: "placeholder",
    text: "Signature to be written. It works with {pair}. {because}",
    automation: v => none(v.reason)
  },
  "T-quote": {
    kind: "alwaysOn", gateable: true, status: "placeholder",
    text: "Signature to be written. {because}",
    gatedText: "Signature to be written. A {Class} only. {because}",
    automation: v => none(v.reason, { gates: v.gates })
  }
});

/**
 * WHY A PLACEHOLDER IS STILL A PLACEHOLDER, in words, for the sentence the
 * player reads. Keyed by `AZEROTH.signatureReasons`; the descriptor carries
 * the key and this carries the clause.
 *
 * A reason with no clause leaves the bare *Signature to be written.*
 */
export const REASON_TEXT = Object.freeze({
  noEquivalent: "What it did has no equivalent in these rules.",
  scaled: "What it did is a rate these rules do not keep.",
  targetRelative: "What it did depends on what it was used against.",
  tableCall: "What it did is the table's to judge.",
  narrative: "",
  unwritten: ""
});

/**
 * The creature a summoning line names, in the bestiary's own entry name — the
 * only thing `documents/summon.mjs` can place (D-691).
 *
 * Read narrowly: three words, four items. *Summons the Black Brewmaiden* and
 * *Summons a cannon* name nothing 14 holds, so those keep a placeholder rather
 * than being pointed at the nearest creature.
 */
export const SUMMON_ENTRY = Object.freeze({
  "dragon whelp": "Dragon Whelp",
  infernal: "Infernal",
  skeleton: "Risen Skeleton"
});

/**
 * The word a condition a template inflicts is printed with — A1's own name,
 * capitalised, since 08 §20 writes *that creature is **Slowed** until the end
 * of its next turn*.
 *
 * The three a struck line can name, plus the two D-698's SL 3 rider adds:
 * **Frightened** (the lead's own answer for *disorients the target*, where the
 * system has no Feared) and **Silenced** (*silences an enemy preventing it
 * from casting*). A condition with no template that inflicts it would be a
 * word nothing ever substitutes, so nothing else is here.
 */
export const CONDITION_WORD = Object.freeze({
  slowed: "Slowed",
  entangled: "Entangled",
  stunned: "Stunned",
  frightened: "Frightened",
  silenced: "Silenced"
});

/**
 * **THE ABILITIES A CLASSIC LINE NAMES THAT THIS BOOK REALLY HAS** (D-698,
 * the lead's *change to Class Feature or Talent Improvement*).
 *
 * A set bonus reading *increases the damage of your Chain Lightning spell by
 * 5%* names a thing 07 holds; one reading *increase the damage of Thunder
 * Clap* names a thing nothing in the book has ever had. This is the whole
 * vocabulary, keyed by the lower-cased words the tooltip writes, and
 * `classic-loot.test.mjs` fails a row whose `name` no pack carries **and** a
 * row no line in the vendored record ever names — the two ways a table like
 * this rots (D-681).
 *
 * `kind` is what the thing IS, and it is here because the LINE cannot say:
 * *increases your chance of a critical hit with Prayer of Healing* and
 * *increases the damage of your Shadow Word: Pain* are the same verb about a
 * heal and a damaging spell, and only the entry knows which. A `utility` row
 * is a name the record uses whose numbers this system does not keep — Mana
 * Shield's absorb, Devotion Aura's armor — so a line about its *damage*
 * records a reason while one about its COST still reads.
 */
export const ABILITY_NAMED = Object.freeze({
  "chain lightning": { name: "Chain Lightning", kind: "damage" },
  "shadow word: pain": { name: "Shadow Word: Pain", kind: "damage" },
  starfire: { name: "Starfire", kind: "damage" },
  "prayer of healing": { name: "Prayer of Healing", kind: "heal" },
  "mind control": { name: "Mind Control", kind: "utility" },
  whirlwind: { name: "Whirlwind", kind: "utility" },
  judgement: { name: "Judgement", kind: "utility" },
  reincarnation: { name: "Reincarnation", kind: "utility" },
  "mana shield": { name: "Mana Shield", kind: "utility" },
  "devotion aura": { name: "Devotion Aura", kind: "utility" }
});

/**
 * The attribute 05 §1 names for a WoW one a `Use:` line raises. Spirit is
 * Wisdom, exactly as `STAT_MAP` has it for a stat line — the two vocabularies
 * are one, and this is the words rather than the tooltip's own keys.
 */
export const USE_ATTRIBUTE = Object.freeze({
  strength: "Strength",
  agility: "Dexterity",
  stamina: "Constitution",
  intellect: "Intelligence",
  spirit: "Wisdom"
});

/**
 * The word a creature-type gate is printed with. 08 §20 writes *against undead
 * and demons* — lower case, and plural where the English is.
 */
export const CREATURE_WORD = Object.freeze({
  undead: "undead",
  humanoid: "humanoids",
  beast: "beasts",
  demon: "demons",
  elemental: "elementals",
  dragonkin: "dragonkin",
  construct: "constructs",
  ooze: "oozes"
});
