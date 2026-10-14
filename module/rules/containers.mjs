/**
 * What a thing holds, and what it holds it in (08 §11, §15; 2026-09-07).
 * Pure, no Foundry imports (CLAUDE.md §3).
 *
 * 08 §11's *Storage and carry* gives every container a **Holds** column and
 * §15's vehicles a **Carries** one, and the gear parser already writes both
 * as a bold-led run. Two shapes, and the column says which:
 *
 * - **By weight.** A sack holds 30 lb, a backpack 40, a wagon 1,500. An
 *   enchanted satchel holds *100 lb at the weight of 20*, which is the one
 *   entry that weighs less than what is in it.
 * - **By count, of one thing.** A quiver holds 40 arrows, a scroll case 10
 *   scrolls, a potion bandolier 6 vials. What may go in is what the column
 *   names, so a bolt case takes no arrows.
 *
 * A column that names neither - the component pouch's *Reagents for one
 * school*, the rowboat's *Four people* - carries the words and no number,
 * and the sheet prints them rather than counting anything.
 *
 * **Charges are the other half** (the lead, 2026-09-07): a waterskin is not
 * a container of items but a thing *holding a day*, spent and filled again.
 * 09 §5 is why it matters - a day with no water costs a point of Fatigue.
 */

import { isShot } from "./ammunition.mjs";

/** The words 08 uses for what a counted container takes. */
export const HOLD_KINDS = Object.freeze(["arrows", "bolts", "shots", "scrolls", "vials", "people"]);

/* -------------------------------------------- */
/*  Worn or kept, never both (D-739)             */
/* -------------------------------------------- */

/**
 * Whether this thing is ON the character rather than IN a bag.
 *
 * 08 §11 and 05's *Speed and movement* both say it: *what you wear and what
 * you hold takes no bag slot*. Two states, and a thing is in exactly one of
 * them - which nothing enforced, so a chain shirt could be equipped AND sit
 * inside a backpack, weighing nothing and drawn on the paper doll at the
 * same time.
 *
 * **A NOCKED BUNDLE IS THE ONE EXCEPTION.** `worn.mjs` already calls a
 * bundle *nocked, not held*: it is found through `selectAmmunition` over
 * everything carried rather than through `equipped`, so a quiver that emptied
 * itself the moment its arrows were nocked would be the result. A bundle
 * stays where it is kept and pays its wells there (D-735, the lead's call).
 *
 * The judgement is per item and reads nothing else, so it is safe anywhere.
 * **Which SLOT a thing is worn in, and whether the figure draws a second
 * sword at all, is `rules/slots.mjs`' question**, because that one needs the
 * whole collection.
 *
 * @param {{system?: object}|object} item  an item, or a bare system object
 */
export function isWorn(item) {
  const sys = item?.system ?? item ?? {};
  if (sys.equipped !== true) return false;
  return !isShot(sys);
}

/**
 * The container this thing is kept in, or null.
 *
 * **Worn beats kept**, so a legacy document carrying both reads as worn and
 * `system.container` is ignored rather than migrated at read time. Every
 * reader that asks "is this inside something" goes through here, so the two
 * fields can never be believed at once.
 *
 * @returns {string|null} an item id
 */
export function containerOf(item) {
  if (isWorn(item)) return null;
  const sys = item?.system ?? item ?? {};
  const id = sys.container;
  return typeof id === "string" && id ? id : null;
}

/**
 * The other half of `containerOf`, at the WRITE (D-739): the extra field a
 * change has to carry so the document never holds both.
 *
 * The rules, in order, and each of them is a case that has happened:
 *
 * - **A write naming neither field changes nothing here** - a charge spent, a
 *   quantity, a sort - and returns null rather than an empty object, so the
 *   caller can skip the merge entirely.
 * - **A write whose RESULTING state is not both is left alone.** The check is
 *   against the next state, never the change: unequipping a thing already in
 *   a bag must not blank the bag.
 * - **Equipping clears the container.** Taking a ring out of the pouch to put
 *   it on is one act.
 * - **Putting a thing in a bag takes it off.** The same act the other way
 *   round.
 * - **Both in one write: equipped wins**, because the only door that writes
 *   both is a drop on the paper doll and it means the figure.
 *
 * **AND A NOCKED BUNDLE IS EXEMPT**, for the same reason `isWorn` refuses it:
 * `worn.mjs` calls a bundle *nocked, not held*, it pays its wells where it is
 * kept (D-641, D-735), and `containerOf` honours its container while it is
 * nocked. Forcing the pair apart would empty the quiver the moment an arrow
 * was drawn from it - or, the other way round, take the shot off the string
 * because the bundle is in a bag, which is where every bundle lives. The whole
 * stored system is read where the caller has it, so `fits` and `rating` are
 * there to be seen.
 *
 * @param {object} current  the item's stored system data
 * @param {object} change   the `system` half of the update being made
 * @returns {{container: null}|{equipped: false}|null}
 */
export function wornXorKept(current = {}, change = {}) {
  const c = change ?? {};
  const namesEquipped = Object.prototype.hasOwnProperty.call(c, "equipped");
  const namesContainer = Object.prototype.hasOwnProperty.call(c, "container");
  if (!namesEquipped && !namesContainer) return null;
  if (isShot({ ...(current ?? {}), ...c })) return null;

  const next = {
    equipped: namesEquipped ? c.equipped === true : (current?.equipped === true),
    container: namesContainer ? (c.container || null) : (current?.container || null)
  };
  if (!next.equipped || !next.container) return null;

  if (namesEquipped && c.equipped === true) return { container: null };
  return { equipped: false };
}

/** Nothing held, nothing to fill. */
export function emptyCapacity() {
  return { weight: null, count: null, of: null, weightAs: null, note: "" };
}

export function emptyCharges() {
  return { value: null, max: null, unit: null };
}

/** Whether a thing holds other things at all. */
export function isContainer(capacity) {
  return Boolean(capacity) && (capacity.weight !== null || capacity.count !== null);
}

/**
 * What a container holds, as the parts a sheet prints.
 *
 * Structured rather than a sentence, because this module is pure and the words
 * are `lang/en.json`'s. 58 gear items carried a capacity and no sheet drew any
 * of it: a backpack never said it holds 40 lb (the lead, 2026-09-07).
 *
 * @returns {{key: string, n: number, of: string|null, note: string}|null}
 */
export function capacityParts(capacity) {
  if (!isContainer(capacity)) return null;
  const note = typeof capacity.note === "string" ? capacity.note : "";
  if (capacity.count !== null && capacity.count !== undefined) {
    return { key: "count", n: capacity.count, of: capacity.of ?? null, note };
  }
  return { key: "weight", n: capacity.weight, of: null, note };
}

/** Whether a thing has charges to spend and fill. */
export function hasCharges(charges) {
  return Boolean(charges) && charges.max !== null && charges.max > 0;
}

const num = v => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.trunc(Number(String(v).replace(/,/g, "")));
  return Number.isFinite(n) ? n : null;
};

/**
 * A stored capacity made valid, for `migrateData`: a value outside its
 * vocabulary is nulled rather than refusing the document.
 *
 * **ONLY THE KEYS THAT ARE THERE.** Core runs `migrateData` over PARTIAL
 * update data as well as a whole stored document, so a guard that rebuilds
 * the object writes a null over every field the update did not mention:
 * `update({"system.charges.value": 0})` emptied the waterskin's maximum and
 * its unit, and the sheet then showed no charges at all (D-671).
 */
export function cleanCapacity(raw) {
  if (!raw || typeof raw !== "object") return emptyCapacity();
  const out = {};
  if ("weight" in raw) out.weight = num(raw.weight);
  if ("count" in raw) out.count = num(raw.count);
  if ("of" in raw) out.of = typeof raw.of === "string" && raw.of ? raw.of : null;
  if ("weightAs" in raw) out.weightAs = num(raw.weightAs);
  if ("note" in raw) out.note = typeof raw.note === "string" ? raw.note : "";
  return out;
}

/** The same rule: a partial update keeps everything it did not name. */
export function cleanCharges(raw) {
  if (!raw || typeof raw !== "object") return emptyCharges();
  const out = {};
  if ("max" in raw) out.max = num(raw.max);
  if ("unit" in raw) out.unit = typeof raw.unit === "string" && raw.unit ? raw.unit : null;
  if ("value" in raw) {
    const value = num(raw.value);
    const ceiling = "max" in raw ? out.max : null;
    out.value = value === null ? null : Math.max(0, ceiling === null ? value : Math.min(ceiling, value));
  }
  return out;
}

/* -------------------------------------------- */
/*  Reading the chapter's own words              */
/* -------------------------------------------- */

/**
 * The capacity a **Holds** or **Carries** run states.
 *
 * @param {string} run   the words after the bold lead
 * @returns {object} the capacity; every field null where the words name none
 */
export function capacityFrom(run) {
  const out = emptyCapacity();
  const text = String(run ?? "").trim();
  if (!text) return out;

  // *100 lb at the weight of 20* - the one thing lighter than its contents.
  const trick = /^([\d,]+)\s*lb\s+at the weight of\s+([\d,]+)/i.exec(text);
  if (trick) {
    out.weight = num(trick[1]);
    out.weightAs = num(trick[2]);
    return out;
  }
  const pounds = /^([\d,]+)\s*lb\b/i.exec(text);
  if (pounds) {
    out.weight = num(pounds[1]);
    // *800 lb, on snow* - the rider is worth printing and is not a number.
    const rider = text.slice(pounds[0].length).replace(/^,\s*/, "").trim();
    if (rider) out.note = rider;
    return out;
  }
  const counted = new RegExp(`^([\\d,]+)\\s+(${HOLD_KINDS.join("|")})\\b`, "i").exec(text);
  if (counted) {
    out.count = num(counted[1]);
    out.of = counted[2].toLowerCase();
    const rider = text.slice(counted[0].length).replace(/^,\s*/, "").trim();
    if (rider) out.note = rider;
    return out;
  }
  // *Four people*, *Reagents for one school*: the words, and no number.
  out.note = text;
  return out;
}

/** *holding a day* is a day of water: one charge, filled again (09 §5). */
export function chargesFrom(description) {
  const text = String(description ?? "");
  const m = /holding\s+(a|one|two|three|\d+)\s+(day|days|hour|hours)\b/i.exec(text);
  if (!m) return emptyCharges();
  const WORDS = { a: 1, one: 1, two: 2, three: 3 };
  const max = /^\d+$/.test(m[1]) ? Number(m[1]) : (WORDS[m[1].toLowerCase()] ?? null);
  if (max === null) return emptyCharges();
  return { value: max, max, unit: m[2].toLowerCase().replace(/s$/, "") };
}

/* -------------------------------------------- */
/*  What goes in, and what it comes to           */
/* -------------------------------------------- */

/** The word a container counts, matched against a thing's own kind. */
export function kindOfItem(item) {
  const section = String(item?.system?.source?.section ?? item?.source?.section ?? "");
  const name = String(item?.name ?? "").toLowerCase();
  const fits = item?.system?.fits ?? item?.fits ?? [];
  if (Array.isArray(fits) && fits.length) {
    if (fits.some(f => /crossbow/i.test(f))) return "bolts";
    if (fits.some(f => /firearm/i.test(f))) return "shots";
    if (fits.some(f => /bow|sling|blowgun/i.test(f))) return "arrows";
  }
  if (/· Scrolls$/.test(section)) return "scrolls";
  if (/· (Restoratives|Elixirs|Utility draughts)$/.test(section)) return "vials";
  if (/\bscroll\b/.test(name)) return "scrolls";
  return null;
}

/**
 * Whether a container takes this thing at all. A weight container takes
 * anything; a counted one takes what its column names.
 */
export function accepts(capacity, item) {
  if (!isContainer(capacity)) return false;
  if (capacity.count === null) return true;
  return capacity.of !== null && kindOfItem(item) === capacity.of;
}

/* -------------------------------------------- */
/*  RETIRED FOR A CHARACTER (D-735, D-736)       */
/* -------------------------------------------- */

/**
 * **`loadOf`, `fits`, `carriedWeight` and `fillOf` are GONE**, with their
 * Vitest cases, and this note is what is left of them.
 *
 * They were D-671's POUNDS-AND-COUNTS arithmetic for what is in a bag, and a
 * character counts bag slots now (05 *Speed and movement*, 08 SS11): the Gear
 * tab's panels, `actions.mjs#containersFor` and `putInContainer` all read
 * `slots.mjs#ledger`, and nothing in `module/` reached any of the four. A
 * creature still counts pounds, through `weight.mjs#carriedTotal` and
 * `size.mjs#carryCapacity`, which are untouched. **Right code with no caller
 * is the commonest real fault here** (D-681), and four functions with a
 * passing test and no reader are exactly that shape: the test said they
 * worked and nothing said they mattered.
 *
 * The numbers they were held to are still pinned where they ORIGINATE:
 * `weight.test.mjs` holds the Enchanted satchel's 20 lb against the chapter,
 * and `slots.test.mjs` holds every SS11 container against the bag slots it
 * adds.
 *
 * `accepts`, `kindOfItem`, `isWorn`, `containerOf`, `wornXorKept`,
 * `capacityParts`, the charges pair and the two `clean*` guards are all live.
 *
 * **`wouldLoop` below outlives them on purpose.** D-736 retired the nesting
 * REFUSAL - a bag no longer goes in a bag - but it is the only thing in the
 * repository that can answer *is this container inside itself*, it costs five
 * lines, and `containers.test.mjs` still holds it. Flagged to the lead rather
 * than swept, because the brief named four and this is a fifth.
 */

/**
 * A container may never be put inside itself, nor inside anything it
 * already holds - a sack in a sack in the first sack has no bottom.
 *
 * @param {string} containerId   where the thing is going
 * @param {string} itemId        the thing going in
 * @param {Map<string, string|null>} parents   item id → the container it is in
 */
export function wouldLoop(containerId, itemId, parents = new Map()) {
  if (!containerId || !itemId) return false;
  if (containerId === itemId) return true;
  let at = containerId;
  const seen = new Set();
  while (at && !seen.has(at)) {
    seen.add(at);
    if (at === itemId) return true;
    at = parents.get(at) ?? null;
  }
  return false;
}
