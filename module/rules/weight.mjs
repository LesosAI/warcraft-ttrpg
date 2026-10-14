/**
 * What a thing weighs, and what that costs you (05 §10, 08 §11; D-675).
 * Pure, no Foundry imports (CLAUDE.md §3).
 *
 * **08 §11 gives weight BY KIND, not by item.** The chapter publishes one
 * table and every item reads its row off what it is, so a weight can never
 * disagree with the catalogue: there is one number per kind and the parser
 * stamps it. Before D-675 the chapter said *nobody weighs a rope* and 26 of
 * 668 items carried a weight, which made 05's Strength × 10 rule unreachable.
 *
 * **What is inside a container is free** (08 §11): the container weighs its
 * own row however much is in it, and its **Holds** column is what limits it.
 * A mount, a vehicle and a working animal are not carried at all.
 *
 * The carrying rule itself lives in `rules/size.mjs` — `carryCapacity` and
 * `loadState` — because 05 owns it as a Speed rule (D-266).
 *
 * **D-735 MOVED A CHARACTER OFF POUNDS.** A character counts bag slots now
 * (`rules/slots.mjs`), read off these same published weights through a
 * ladder; everything here still stands for a creature in 14, which keeps its
 * Strength score in pounds ten times over, and the weights themselves did not
 * move at all — the ladder reads what the parser already stamps.
 */

import { containerOf } from "./containers.mjs";

/**
 * The separators the packs use between a section number and its tail: gear
 * writes ` · ` and weapons ` — `. **The whitespace is load-bearing.** A bare
 * hyphen in the class split *One-handed weapon* on its own hyphen and every
 * one-handed and two-handed weapon came back weightless (2026-09-07).
 */
const SEP = /\s+[·—–]\s+/;

/** The last named part of a `source.section`, or the whole of a bare one. */
export function sectionParts(section) {
  return String(section ?? "").split(SEP).map(s => s.trim()).filter(Boolean);
}

/**
 * 08 §11's table, as keys. A `null` weighs nothing — the chapter prints a
 * dash, and it means a thing too light to be worth carrying rather than a
 * thing with no row.
 */
export const WEIGHTS = Object.freeze({
  // Armor, by the category that sets its Armor Points (08 §8).
  cloth: 10, leather: 10, studded: 20, mail: 40, plate: 65,
  shield: 6, tower: 15, pavise: 30,

  // Weapons, by grip.
  twoHanded: 10, handAndAHalf: 6, oneHanded: 3, light: 1,
  launcher: 3, ammunition: 1,

  // Everything else, by kind.
  kit: 5, fixedTool: 40, device: 2, oil: 1, flask: 1, dressing: null,
  meal: 1, lamp: 2, tome: 3, paper: null, instrument: 3, ritual: 2,
  augment: 1, bedroll: 5, tent: 20, garment: 2, material: 10, reagent: null,
  sundry: 1, barding: 20,

  // Containers. Each weighs its row however much is inside it (08 §11).
  smallContainer: 1, satchel: 3, enchantedSatchel: 20, backpack: 40,
  rations: 25, barrel: 200, body: 150, strongbox: 60
});

/** 08 §11's maker rows. A suit carries its maker's weight (§19 says whose). */
export const MAKER = Object.freeze({
  dwarf: 2 / 3, "night-elf": 2 / 3, "blood-elf": 3 / 4, ogre: 3 / 2
});

/** 08 §15's sections. None of these is ever carried. */
export const NOT_CARRIED = Object.freeze([
  "Trained mounts", "War mounts", "Working animals", "Vehicles"
]);

/** A gear section tail to its row in the table. */
const GEAR_KIND = Object.freeze({
  "Trade kits": "kit",
  "Adventuring tools": "kit",
  "Explosives": "device",
  "Devices": "device",
  "Stones and oils": "oil",
  "Restoratives": "flask",
  "Elixirs": "flask",
  "Utility draughts": "flask",
  "Poisons": "flask",
  "Bandages and dressings": "dressing",
  "Food and drink": "meal",
  "Light": "lamp",
  "Tomes": "tome",
  "Manuals": "tome",
  "Scrolls": "paper",
  "Maps, letters and seals": "paper",
  "Instruments and games": "instrument",
  "Ritual and cultural goods": "ritual",
  "Augments": "augment",
  "Ward": "augment",
  "Spellpower": "augment",
  "Camp and the road": "bedroll",
  "Worn things": "garment",
  "Clothing": "garment",
  "Ore and metal": "material",
  "Cloth and hides": "material",
  "Stones and essences": "material",
  "Herbs": "reagent",
  "Sundries": "sundry",
  "Harness and barding": "barding",
  "Storage and carry": "smallContainer"
});

/** The storage entries 08 §11 weighs on their own line, by name. */
const NAMED_CONTAINER = Object.freeze({
  backpack: "backpack",
  satchel: "satchel",
  "potion bandolier": "satchel",
  "enchanted satchel": "enchantedSatchel",
  barrel: "barrel",
  chest: "barrel",
  strongbox: "strongbox",
  handcart: "barrel",
  saddlebags: "satchel"
});

/**
 * THE LONGEST NAME WINS, and the object's own order does not.
 *
 * `enchanted satchel` contains `satchel`, so a first-hit scan in insertion
 * order stamped 3 lb on the Enchanted satchel where 08 §11 prints 20 - the
 * one row of the table whose number was simply unreachable. It read as a
 * 5-gold bag that weighed less than the sack it replaces, and under D-735 it
 * was a 1-bag-slot thing rather than a 3. Sorting by length is what stops the
 * next `X pouch` doing it again.
 */
const NAMED_CONTAINER_ORDER = Object.freeze(
  Object.keys(NAMED_CONTAINER).sort((a, b) => b.length - a.length || a.localeCompare(b))
);

/** A tool 08 §11 calls too heavy to carry: the chapter says *Not portable*. */
const FIXED_TOOL = /not portable/i;

const round = n => (n === null || n === undefined ? null : Math.round(n));

/**
 * The weight of one parsed document, in pounds, or `null` where its kind
 * weighs nothing.
 *
 * @param {object} doc   `{name, type, system: {...}}` as the parser builds it
 * @param {(name: string) => string|null} [makerOf]  §19's name → people
 */
export function weightFor(doc, makerOf = () => null) {
  if (!doc) return null;
  const sys = doc.system ?? doc;
  const parts = sectionParts(sys?.source?.section);
  const tail = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "";

  // A §20 unique prints its own Weight and always has (D-378).
  if (tail === "Unique") return sys?.weight ?? null;

  // A Classic find weighs its BASE's row (D-685): its section is
  // `Classic · <Zone>`, which 08 §11 has no row for, so the parser works the
  // number out from the base the law converted it onto and stamps it here.
  // Reading the stamp back is what keeps `stampWeights` idempotent — the
  // parser stamps, then stamps every document in the pack, including these.
  if (sys?.source?.document === "Classic") return sys?.weight ?? null;

  if (doc.type === "armor" || sys?.category !== undefined) return armorWeight(doc, makerOf);
  if (doc.type === "weapon" || parts[0] === "7") return weaponWeight(doc);
  return gearWeight(doc);
}

/** 08 §8's categories, then §11's maker multiplier. */
function armorWeight(doc, makerOf) {
  const sys = doc.system ?? doc;
  const name = String(doc.name ?? "").toLowerCase();
  let base;
  if (sys.shield) {
    base = /pavise/.test(name) ? WEIGHTS.pavise : (/tower/.test(name) ? WEIGHTS.tower : WEIGHTS.shield);
  } else {
    base = WEIGHTS[String(sys.category ?? "").toLowerCase()] ?? null;
  }
  if (base === null || base === undefined) return null;
  const maker = makerOf(doc.name);
  const mult = maker ? (MAKER[maker] ?? 1) : 1;
  return round(base * mult);
}

/** 08 §7's tables, by the grip the first header cell names (D-405). */
function weaponWeight(doc) {
  const sys = doc.system ?? doc;
  const parts = sectionParts(sys?.source?.section);
  const kind = parts.length > 1 ? parts[parts.length - 1] : "";
  const traits = Array.isArray(sys.traits) ? sys.traits : [];
  switch (kind) {
    case "Two-handed weapon": return WEIGHTS.twoHanded;
    // Versatile inside the one-handed table is the hand-and-a-half grip: it
    // is swung in two hands for a better Rating and is heavier for it.
    case "One-handed weapon":
      return traits.some(t => /^Versatile\b/i.test(String(t))) ? WEIGHTS.handAndAHalf : WEIGHTS.oneHanded;
    case "Light weapon":
    case "Implement": return WEIGHTS.light;
    case "Thrown weapon": return WEIGHTS.oneHanded;
    case "Bow or sling":
    case "Crossbow or firearm": return WEIGHTS.launcher;
    case "Ammunition": return WEIGHTS.ammunition;
    default: return null;
  }
}

/** 08 §9 to §17, by the section tail the parser stamped. */
function gearWeight(doc) {
  const sys = doc.system ?? doc;
  const name = String(doc.name ?? "").toLowerCase();
  const parts = sectionParts(sys?.source?.section);
  const tail = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "";

  if (NOT_CARRIED.includes(tail)) return null;

  if (tail === "Storage and carry") {
    for (const key of NAMED_CONTAINER_ORDER) {
      if (name.includes(key)) return WEIGHTS[NAMED_CONTAINER[key]];
    }
    return WEIGHTS.smallContainer;
  }
  // *A week of food and water* is its own row; a day's meal is not.
  if (tail === "Camp and the road") {
    if (/rations|food and water/.test(name)) return WEIGHTS.rations;
    if (/tent|pavilion/.test(name)) return WEIGHTS.tent;
    if (/lantern|lamp|torch|candle/.test(name)) return WEIGHTS.lamp;
    return WEIGHTS.bedroll;
  }
  if (tail === "Trade kits" && FIXED_TOOL.test(String(sys.description ?? ""))) return WEIGHTS.fixedTool;

  const kind = GEAR_KIND[tail];
  return kind ? WEIGHTS[kind] : null;
}

/* -------------------------------------------- */
/*  What a character is carrying                 */
/* -------------------------------------------- */

/**
 * What these items come to on the character (08 §11).
 *
 * **A thing inside a container is free**, so only loose things and the
 * containers themselves are added. A container's own row is what it weighs,
 * however full it is. Quantity multiplies a loose thing.
 *
 * @param {Array} items   every physical item the actor holds
 * @returns {number} pounds
 */
export function carriedTotal(items = []) {
  const held = new Set(items.map(i => i?.id ?? i?._id).filter(Boolean));
  let total = 0;
  for (const item of items) {
    const sys = item?.system ?? item ?? {};
    // Inside a container this actor holds: free. Inside one it does not hold,
    // the thing is loose and counts, which is what a deleted pack leaves.
    //
    // **THROUGH `containerOf`, so a worn thing is never inside anything**
    // (D-739): a chain shirt equipped AND naming a backpack used to weigh
    // nothing at all, which is a suit on the figure and no pounds on the
    // line. Worn beats kept, and the weight is charged.
    const inside = containerOf(item);
    if (inside && held.has(inside)) continue;
    const weight = Number(sys.weight);
    if (!Number.isFinite(weight)) continue;
    const quantity = Math.max(1, Number(sys.quantity) || 1);
    total += weight * quantity;
  }
  return Math.round(total * 10) / 10;
}
