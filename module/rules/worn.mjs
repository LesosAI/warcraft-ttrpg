/**
 * The slots a character wears and holds things in (08 §11, D-686, D-689).
 * Pure, no Foundry imports (CLAUDE.md §3).
 *
 * 08 §11's *Worn things* table states the rule and prints the roster:
 * **The Slot column is the rule, and you wear one thing in each slot.**
 *
 * **The Slot column is the vocabulary, and the row name is not.** D-686 read
 * a slot off every row and got sixteen; the chapter now names the slot
 * outright and gets thirteen, because *a sash and a belt are the same slot
 * even if the name is different* (the lead, 2026-09-09). Ring and Signet ring
 * are one finger; Brooch, Amulet and Pendant one neck; Sash and Belt one
 * waist; Mask and Circlet one head. The figure is WoW's own paper doll, so
 * §11 also gained a **Shoulder** (the Mantle) and §11's Clothing table gained
 * a slot of its own.
 *
 * Two things read this module. The gear parser stamps `system.slot` from the
 * chapter's own Slot column, so the pack says what the chapter says; and the
 * character sheet asks `displacedBy` what an equip has to put away, which is
 * the same question a second suit and a second Augment already answered.
 *
 * §10's Ward and Spellpower gear is worn too - a *Warded cloak* is a cloak -
 * so its names run through the keyword table below. **The robes and the
 * Regalia are Clothing** (D-689): nothing but a suit fills the Chest tile, and
 * a garment had nowhere to go before.
 */

import { sectionParts } from "./weight.mjs";
import { fittingBundles, isShot, selectAmmunition } from "./ammunition.mjs";

/**
 * 08 §11's Slot column, in the figure's reading order - left column head to
 * wrist, then the right column - which is the order the tiles are drawn in
 * and the order the item sheet's select offers.
 *
 * The value is the key `config.mjs` builds `AZEROTH.wornSlots` from; the
 * label lives in `lang/en.json` under `AZEROTH.Slot.<Key>` (CLAUDE.md §11).
 */
export const WORN_SLOTS = Object.freeze([
  "head", "neck", "shoulder", "back", "clothing", "tabard", "wrist",
  "hands", "waist", "legs", "feet", "finger", "trinket"
]);

/**
 * How many things a slot holds. Two fingers and two trinkets, one of
 * everything else (D-689).
 *
 * **Nothing hardcodes the 2.** `figureSlots` fills an array this long,
 * `displacedBy` puts something away only when the slot is full, and the
 * figure draws one tile per point of capacity.
 */
export const SLOT_CAPACITY = Object.freeze({ finger: 2, trinket: 2 });

/** How many things this slot holds; 1 for every slot the table does not name. */
export function capacityOf(slot) {
  return SLOT_CAPACITY[slot] ?? 1;
}

/**
 * The tiles that are not one of §11's slots.
 *
 * Five of them draw a tile - `body` is 08 §8's suit, the two hands and the
 * Ranged and Ammunition tiles are 06 §2's and 08 §7's. `shield` and `augment`
 * draw NONE: both are held in the off hand (07 §3, D-674), and they exist
 * here only so the Off hand tile can name what it is showing.
 *
 * `AZEROTH.heldSlots` labels them.
 */
export const HELD_SLOTS = Object.freeze([
  "body", "mainHand", "offHand", "ranged", "ammo", "shield", "augment"
]);

/** 08 §11's row names, as the chapter prints them, to the Slot it prints beside. */
const ROW_SLOTS = Object.freeze({
  sash: "waist",
  belt: "waist",
  mask: "head",
  gloves: "hands",
  tabard: "tabard",
  boots: "feet",
  leggings: "legs",
  bracers: "wrist",
  mantle: "shoulder",
  brooch: "neck",
  amulet: "neck",
  cloak: "back",
  ring: "finger",
  circlet: "head",
  "signet ring": "finger",
  pendant: "neck",
  trinket: "trinket"
});

/**
 * The word a name is recognised by, where it is not a §11 row.
 *
 * ORDER IS THE RULE, first hit wins: `signet` sits above `ring` only because
 * a signet is still a ring, and the neck group carries `brooch` while the
 * shoulder group does not - a brooch is pinned at the collar (D-689). Every
 * pattern is anchored on a word so a fragment inside a longer word cannot
 * match: `cord` was matching nothing until it was bounded, and would have
 * taken a cordial.
 */
const KEYWORDS = Object.freeze([
  [/\bsignets?\b/, "finger"],
  [/\brings?\b/, "finger"],
  [/\b(pendants?|medallions?|talismans?|amulets?|necklaces?|chokers?|brooch(?:es)?)\b/, "neck"],
  [/\b(mantles?|pauldrons?|spaulders?|shoulders?|shoulderpads?|epaulets?)\b/, "shoulder"],
  [/\b(cloaks?|capes?|drapes?)\b/, "back"],
  [/\b(masks?|veils?|visages?|circlets?|crowns?|helms?|hoods?|cowls?|coifs?|diadems?)\b/, "head"],
  [/\b(sash(?:es)?|belts?|girdles?|cords?|waistbands?)\b/, "waist"],
  [/\b(gloves?|gauntlets?|grips?|handguards?|handwraps?)\b/, "hands"],
  [/\b(boots?|sabatons?|greaves?|treads?|sandals?|footpads?|slippers?)\b/, "feet"],
  [/\b(bracers?|wristguards?|wristbands?|bindings?|vambraces?|armguards?|cuffs?)\b/, "wrist"],
  [/\btabards?\b/, "tabard"],
  [/\b(leggings?|legplates?|legguards?|pants|trousers|kilts?|breeches)\b/, "legs"],
  [/\bward stones?\b/, "trinket"],
  [/\b(robes?|regalia|clothes|dress(?:es)?|liver(?:y|ies)|uniforms?|costumes?|shirts?|vestments?)\b/, "clothing"]
]);

/** Lowercase, and every run of anything but a letter or a digit is a space. */
function normalise(name) {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The slot a worn thing goes in, or null where it takes none.
 *
 * @param {string} name  the item's name
 * @returns {string|null} a key in `WORN_SLOTS`
 */
export function wornSlotFor(name) {
  const text = normalise(name);
  if (!text) return null;
  const exact = ROW_SLOTS[text];
  if (exact) return exact;
  for (const [pattern, key] of KEYWORDS) {
    if (pattern.test(text)) return key;
  }
  return null;
}

/** Whether a key is one 08 §11's Slot column prints. */
export function isWornSlot(slot) {
  return typeof slot === "string" && WORN_SLOTS.includes(slot);
}

/* -------------------------------------------- */
/*  How a weapon is gripped (08 §7, D-689)       */
/* -------------------------------------------- */

/** 08 §7's tables, by the grip the first header cell names (D-405). */
const GRIP_BY_SECTION = Object.freeze({
  "Two-handed weapon": "two-handed",
  "Bow or sling": "two-handed",
  "Crossbow or firearm": "two-handed",
  "One-handed weapon": "one-handed",
  "Light weapon": "one-handed",
  "Implement": "one-handed",
  "Thrown weapon": "one-handed"
});

/**
 * How many hands this weapon takes: `"two-handed"`, `"hand-and-a-half"`,
 * `"one-handed"`, or null where nothing says.
 *
 * Read in order:
 *
 * 1. **A Versatile trait is the hand-and-a-half grip** - 08 §7's one-handed
 *    table swung in two hands, which `weight.mjs` already reads exactly this
 *    way. It is checked first because the trait is on the item and the
 *    section only says which table it came off.
 * 2. **The section's last part** is 08 §7's own table heading.
 * 3. **A Classic find's section is `Classic · <Zone>`** (D-685), so the base
 *    the law converted it onto is what answers - `Greataxe, two-handed`. A
 *    §20 unique carries the same flag under `20 · Unique`.
 */
export function gripOf(item) {
  if (!item) return null;
  const sys = item.system ?? {};
  const traits = Array.isArray(sys.traits) ? sys.traits : [];
  if (traits.some(t => /^Versatile\b/i.test(String(t)))) return "hand-and-a-half";

  const parts = sectionParts(sys.source?.section);
  const grip = GRIP_BY_SECTION[parts[parts.length - 1] ?? ""];
  if (grip) return grip;

  const base = String(item.flags?.["azeroth-rpg"]?.base ?? "");
  if (/,\s*two-handed$/i.test(base)) return "two-handed";
  if (/,\s*one-handed$/i.test(base)) return "one-handed";
  return null;
}

/**
 * Whether this weapon is held in BOTH hands, so the off hand is barred.
 *
 * **A launcher is excluded on purpose.** A bow is two-handed and sits in the
 * Ranged tile; a bow has never stopped anyone carrying a shield.
 */
export function isTwoHanded(item) {
  return gripOf(item) === "two-handed" && !item?.system?.launcher;
}

/* -------------------------------------------- */
/*  The figure the Overview tab draws (D-689)    */
/* -------------------------------------------- */

/**
 * The figure, in the three groups the sheet lays out: the left column head to
 * wrist, the right column hands to trinket, and the row of hands beneath. It
 * is WoW's own paper doll (the lead, 2026-09-09).
 *
 * **Twenty tiles, eighteen keys**: `finger` and `trinket` each draw two tiles
 * off one slot key, which is what `index` says. A test asserts every key
 * appears exactly once per point of its capacity, because a slot the figure
 * forgot is a thing a character can wear and never see.
 */
export const FIGURE_LEFT = Object.freeze([
  { slot: "head" }, { slot: "neck" }, { slot: "shoulder" }, { slot: "back" },
  { slot: "body" }, { slot: "clothing" }, { slot: "tabard" }, { slot: "wrist" }
]);
export const FIGURE_RIGHT = Object.freeze([
  { slot: "hands" }, { slot: "waist" }, { slot: "legs" }, { slot: "feet" },
  { slot: "finger", index: 0 }, { slot: "finger", index: 1 },
  { slot: "trinket", index: 0 }, { slot: "trinket", index: 1 }
]);
export const FIGURE_HANDS = Object.freeze([
  { slot: "mainHand" }, { slot: "offHand" }, { slot: "ranged" }, { slot: "ammo" }
]);

/** Every tile the figure draws, in the order the reader meets them. */
export const FIGURE_SLOTS = Object.freeze([...FIGURE_LEFT, ...FIGURE_RIGHT, ...FIGURE_HANDS]);

const byName = (a, b) => String(a?.name ?? "").localeCompare(String(b?.name ?? ""));

/** The flat shape `rules/ammunition.mjs` reads: an id, a name, and the system. */
const flatten = item => ({ id: item?.id, name: item?.name, ...(item?.system ?? {}) });

/**
 * What fills each tile of the figure, out of everything the character holds.
 *
 * ALL DERIVED, nothing stored: the answer is read off `equipped` and the
 * item's own slot every time the sheet renders.
 *
 * - A worn slot takes the equipped gear whose `system.slot` is that key. A
 *   slot of capacity 2 hands back an ARRAY of exactly that length, filled in
 *   the sorted order, so a tile can be empty while its twin is full.
 * - **Body is the FIRST equipped non-shield suit**, found in the collection's
 *   own order, because that is exactly what `CharacterData#prepareDerivedData`
 *   reads for every Armor Point. Picking differently would put a suit on the
 *   tile whose numbers are not the ones In force is printing.
 * - Everything else is sorted by name first. Nothing else in the system picks
 *   a main hand, and an embedded collection's order is not stable across a
 *   re-sync, so a `find` over it would swap two tiles between renders
 *   (CLAUDE.md §15).
 * - **The Off hand falls back**: the off-hand weapon, else the shield, else
 *   the Augment (07 §3 holds it in the off hand, D-674). `offHandKind` says
 *   which, so the tile can name what it is showing.
 * - **The Ammunition tile is the bundle the launcher would actually fire**,
 *   through `selectAmmunition`, over every bundle the character carries
 *   rather than only the equipped ones - which is the pool `attackWithDialog`
 *   and the Combat rows already read. A tile that named a different bundle
 *   from the one the shot spends would be a lie.
 * - **`twoHanded` bars the off hand.** A main hand held in both hands leaves
 *   nothing for a shield, an Augment or a second blade (D-689).
 *
 * @param {Iterable<{type: string, name?: string, system?: object}>} items
 * @returns {object} the shape D-689 froze
 */
export function figureSlots(items = []) {
  const all = [...(items ?? [])].filter(Boolean);
  const held = all.filter(i => i?.system?.equipped === true);

  const filled = {};
  for (const key of WORN_SLOTS) {
    const worn = held.filter(i => i.type === "gear" && i.system?.slot === key).sort(byName);
    const capacity = capacityOf(key);
    filled[key] = capacity > 1
      ? Array.from({ length: capacity }, (_, i) => worn[i] ?? null)
      : worn[0] ?? null;
  }

  filled.body = held.find(i => i.type === "armor" && !i.system?.shield) ?? null;
  const shield = held.find(i => i.type === "armor" && i.system?.shield === true) ?? null;
  const augment = held.find(i => Boolean(i.system?.augment)) ?? null;

  const weapons = held.filter(i => i.type === "weapon").sort(byName);
  filled.mainHand = weapons.find(i => i.system?.offHand !== true && !i.system?.launcher) ?? null;
  filled.ranged = weapons.find(i => Boolean(i.system?.launcher)) ?? null;

  const offWeapon = weapons.find(i => i.system?.offHand === true && !i.system?.launcher) ?? null;
  filled.offHand = offWeapon ?? shield ?? augment ?? null;
  filled.offHandKind = offWeapon ? "weapon" : (shield ? "shield" : (augment ? "augment" : null));

  // The bundle nocked on the launcher, over every bundle carried (D-641).
  let ammo = null;
  if (filled.ranged) {
    const bundles = all.filter(i => i.type === "weapon").map(flatten);
    const chosen = selectAmmunition(filled.ranged.system ?? {}, fittingBundles(filled.ranged.system ?? {}, bundles));
    ammo = chosen ? all.find(i => i.id === chosen.id) ?? null : null;
  }
  filled.ammo = ammo;

  filled.twoHanded = isTwoHanded(filled.mainHand);

  const drawn = new Set([filled.mainHand, offWeapon, filled.ranged, filled.ammo].filter(Boolean));
  filled.alsoReady = weapons.filter(w => !drawn.has(w));
  return filled;
}

/**
 * The hand this weapon goes in when it is equipped from a ROW rather than
 * dropped on a tile (the lead, 2026-09-13).
 *
 * **Two identical weapons could not be held one in each hand.** The Gear tab's
 * Equip and the row's context menu both wrote `system.equipped` and nothing
 * else, and `system.offHand` was written at exactly one door — the Overview
 * figure's — so a second Dagger toggled on stayed a main-hand weapon,
 * `figureSlots` picked between them with a `find` over a name sort (a coin
 * toss for two things with the same name) and parked the loser in
 * `alsoReady`. The figure then showed one Dagger and an empty off hand.
 *
 * The answer, in order:
 *
 * - **A launcher is the Ranged tile.** 08 §7 holds a bow in both hands and it
 *   bars nothing; `isTwoHanded` excludes launchers for the same reason.
 * - **A bundle of shot is nocked, not held**, so it keeps the main hand's
 *   `offHand: false` and the Ammunition tile finds it through
 *   `selectAmmunition`.
 * - **The off hand, when the main hand is already full** and the thing holding
 *   it is one-handed, and nothing — weapon, shield or Augment — is in the off
 *   hand yet, and this weapon is not itself two-handed.
 * - **The main hand otherwise.** A two-handed weapon never goes in the off
 *   hand, and with a barred off hand there is nowhere else for anything.
 *
 * `displacedBy` still decides what comes OFF; this only says where the thing
 * being put on is going.
 *
 * @param {{id?: string, type: string, system?: object}} item  the weapon being equipped
 * @param {Iterable} items  everything the character holds, in its current state
 * @returns {"ranged"|"mainHand"|"offHand"}
 */
export function handFor(item, items = []) {
  const sys = item?.system ?? {};
  if (sys.launcher) return "ranged";
  if (isShot(sys)) return "mainHand";
  if (isTwoHanded(item)) return "mainHand";

  // The item is judged against what ELSE is held. In production it has not
  // been equipped yet, so the distinction never shows; asked about a weapon
  // already in hand it would otherwise answer "the main hand is taken" about
  // itself. `displacedBy` excludes by id for the same reason.
  const same = other => other === item
    || (other?.id !== undefined && item?.id !== undefined && other.id === item.id);
  const figure = figureSlots([...(items ?? [])].filter(other => other && !same(other)));
  // A main hand held in both hands bars the off hand both ways (D-689).
  if (figure.twoHanded) return "mainHand";
  if (!figure.mainHand) return "mainHand";
  // `offHand` falls back through weapon, shield and Augment, so one test
  // covers all three things 07 §3 and 08 §8 put in that hand.
  if (figure.offHand) return "mainHand";
  return "offHand";
}

/**
 * Which copy of a repeated name each item is (the lead, 2026-09-13).
 *
 * A picker listing *Dagger*, *Dagger* cannot be chosen from, and the whole
 * point of the change above is that a character may reasonably carry two of
 * one thing. This numbers them so the rows read *Dagger (copy 1)* and
 * *Dagger (copy 2)*; the sheet supplies the words.
 *
 * **Ordered by id, not by collection order.** An embedded collection's order
 * is not stable across a re-sync (CLAUDE.md §15), so numbering by iteration
 * would swap the two labels between renders.
 *
 * @param {Iterable<{id?: string, name?: string}>} items
 * @returns {Map<string, number|null>} item id to its 1-based copy number, or
 *   null where the name occurs once.
 */
export function copyLabels(items = []) {
  const byName = new Map();
  for (const item of [...(items ?? [])].filter(i => i?.id)) {
    const name = String(item.name ?? "");
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(item);
  }
  const out = new Map();
  for (const group of byName.values()) {
    if (group.length < 2) {
      out.set(group[0].id, null);
      continue;
    }
    group.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    group.forEach((item, i) => out.set(item.id, i + 1));
  }
  return out;
}

/**
 * Whether `item` may be equipped by dropping it on the tile keyed `slot`.
 *
 * The refusal is the point: a drop that lands on the wrong tile says so and
 * changes nothing, rather than equipping the thing somewhere it does not go.
 *
 * @param {{type: string, system?: object}} item
 * @param {string} slot  a `slot` off one of `FIGURE_SLOTS`
 */
export function fitsSlot(item, slot) {
  if (!item) return false;
  const sys = item.system ?? {};
  if (isWornSlot(slot)) return item.type === "gear" && sys.slot === slot;
  if (slot === "body") return item.type === "armor" && sys.shield !== true;
  if (slot === "mainHand") return item.type === "weapon" && !sys.launcher;
  // 07 §3 holds the Augment in the off hand, and 08 §8's shield is held there.
  if (slot === "offHand") {
    return (item.type === "weapon" && !sys.launcher)
      || (item.type === "armor" && sys.shield === true)
      || Boolean(sys.augment);
  }
  if (slot === "ranged") return item.type === "weapon" && Boolean(sys.launcher);
  if (slot === "ammo") return item.type === "weapon" && isShot(sys);
  return false;
}

/**
 * A stored slot outside §11's vocabulary is nulled, never refused.
 *
 * `choiceField` is `blank: false`, so an empty select would fail validation
 * and a document that fails validation is invisible to a world migration
 * (CLAUDE.md §15). The CALLER guards on the key being present, because
 * `migrateData` runs over partial update data as well as a whole document
 * and a guard that writes unconditionally empties the field on every update
 * that does not name it (D-671).
 */
export function cleanSlot(slot) {
  return isWornSlot(slot) ? slot : null;
}

/** Whether this is a thing the off hand holds: a shield, an Augment, an off-hand weapon. */
function isOffHandThing(item) {
  const sys = item?.system ?? {};
  if (item?.type === "weapon") return sys.offHand === true && !sys.launcher;
  if (item?.type === "armor") return sys.shield === true;
  return Boolean(sys.augment);
}

/** Whether this weapon fills the main hand with both hands (D-689). */
function isTwoHandedMain(item) {
  return item?.type === "weapon" && item.system?.offHand !== true && isTwoHanded(item);
}

/**
 * What equipping `item` has to put away.
 *
 * - **One suit.** `prepareDerivedData` reads the first equipped non-shield
 *   suit for every Armor Point, so a second suit displaces the first. A
 *   shield displaces no suit and is displaced by none.
 * - **One Augment.** 07 §3 speaks of a caster holding one throughout.
 * - **A worn slot displaces only when it is FULL** (08 §11, D-689). Most hold
 *   one; a finger and a trinket hold two, so a third ring puts one away - the
 *   one at `index` where the caller gives one (a drop or a pick on Finger 2),
 *   else the first in the sorted order.
 * - **The hands.** A main-hand weapon held in both hands leaves nothing for
 *   an off-hand weapon, a shield or a held Augment, and each of those three
 *   puts the two-hander away in turn. **Symmetric**, because a greyed tile
 *   whose item still granted Armor Points would be a lie. A one-handed weapon
 *   still displaces nothing: 06 §2 owns the hands and `alsoReady` lists the
 *   rest.
 *
 * @param {{id?: string, type: string, system: object}} item   the thing being equipped
 * @param {Iterable<{id?: string, type: string, system: object}>} items  everything held
 * @param {{index?: number}} [options]  which tile of a capacity-2 slot was used
 * @returns {Array} the equipped items to unequip, in the order they were given
 */
export function displacedBy(item, items, { index } = {}) {
  if (!item) return [];
  const all = [...(items ?? [])].filter(Boolean);
  const same = other => other === item
    || (other?.id !== undefined && item.id !== undefined && other.id === item.id);
  const equipped = all.filter(other => !same(other) && other?.system?.equipped === true);

  const victims = new Set();

  // One suit (08 §8), one Augment (07 §3).
  if (item.type === "armor" && !item.system?.shield) {
    for (const other of equipped) if (other.type === "armor" && !other.system?.shield) victims.add(other);
  }
  if (item.system?.augment) {
    for (const other of equipped) if (other.system?.augment) victims.add(other);
  }

  // One thing in each worn slot, and two on a finger or a chain (08 §11).
  const slot = item.type === "gear" && isWornSlot(item.system?.slot) ? item.system.slot : null;
  if (slot) {
    const worn = equipped.filter(o => o.type === "gear" && o.system?.slot === slot).sort(byName);
    // What has to come off for this one to go on. A capacity-1 slot with two
    // things already in it is a world from before D-689 and empties properly.
    const need = worn.length + 1 - capacityOf(slot);
    if (need > 0) {
      const first = (Number.isInteger(index) && worn[index]) || worn[0];
      for (const other of [first, ...worn.filter(o => o !== first)].slice(0, need)) victims.add(other);
    }
  }

  // The two-handed grip, both ways (D-689).
  if (isTwoHandedMain(item)) {
    for (const other of equipped) if (isOffHandThing(other)) victims.add(other);
  } else if (isOffHandThing(item)) {
    for (const other of equipped) if (isTwoHandedMain(other)) victims.add(other);
  }

  return all.filter(other => victims.has(other));
}
