/**
 * BAG SLOTS: what a character carries, and where it sits (D-735, D-736).
 * Pure, no Foundry imports (CLAUDE.md §3).
 *
 * 05's *Speed and movement* and 08 §11's *Weight, and what you track* are the
 * rule, and `slots.test.mjs` reads all three of §11's ladders off the chapter
 * rather than restating them here. What follows is only the arithmetic.
 *
 * **The unit is the BAG SLOT** and the term is deliberate: 08 §11's worn
 * **Slot** column already owns "slot" (D-689), so a second meaning on the same
 * page would have to be read from context every time. The derived field on an
 * item is `system.bagSlots`; a well is one cell of a panel.
 *
 * **Pounds did not go away — a character stopped counting them.** The chapter
 * still publishes weight by kind, the parser still stamps it (`weight.mjs`),
 * and the ladder here READS what is already there. A creature in 14 keeps its
 * Strength score in pounds ten times over, so `size.mjs#carryCapacity` and
 * `weight.mjs#carriedTotal` stand untouched for the NPC.
 *
 * Three things the rest of the system has to get right, all of them derived
 * and none of them stored:
 *
 * - **Placement.** Where a thing sits is worked out every time: the mount
 *   place or the Stable, a bar place, the figure, the panel its
 *   `system.container` names IF that is an equipped holder that takes it, and
 *   otherwise the base pack. **Nothing is ever hidden** — the contents of an
 *   unequipped, missing, fifth or wrong-kind container land in the base pack
 *   rather than vanishing with their bag.
 * - **A THING SITS IN A WELL, AND GAPS ARE ALLOWED** (the lead, 2026-09-20:
 *   *I need to be able to place a carried/bag item in any slot, not just the
 *   next available*). `system.well` is the index of the FIRST well the thing
 *   occupies inside whatever panel `container` names, and a thing of several
 *   bag slots takes a CONTIGUOUS run from it. The stored number is a CLAIM
 *   rather than a fact: `packPanel` honours it where the run is free and
 *   inside the panel, and packs anything else — no claim, a claim another
 *   thing got to first, a claim past the wells a shrunken bag has left — into
 *   the first free run that fits. So a Strength drain, a bag swapped for a
 *   smaller one and a world migrated from 0.12.10 all read sensibly and
 *   nothing is ever lost; and a shuffled input still gives an identical
 *   ledger, because both passes sort before they place.
 * - **Refusals.** Every one is a literal language KEY in `REFUSALS`, so
 *   `lang-unused.test.mjs` can see each sentence; a pure module holds no
 *   `game.i18n` and the caller localises.
 * - **No write may INCREASE any panel's overflow.** Over capacity can only
 *   arise by LOSING capacity - a Strength drain, a size change, a world
 *   migrated from 0.12.9 - and a character in that state must always be able
 *   to move things out. Every judgement below is against the panel's overflow
 *   before and after, never against a flat "does it fit".
 *
 * Items arrive as plain objects shaped like `item.toObject()` plus `id`, so
 * the Item document's own operation hooks can hand this their `operation`
 * data directly. Everything is deterministic: a shuffled input gives an
 * identical ledger.
 */

import { accepts, containerOf, isWorn, kindOfItem } from "./containers.mjs";
import { CARRY_MULTIPLIER, DEFAULT_SIZE, loadLine } from "./size.mjs";
import { NOT_CARRIED, sectionParts } from "./weight.mjs";
import { displacedBy, figureSlots } from "./worn.mjs";
import { isShot } from "./ammunition.mjs";

/* -------------------------------------------- */
/*  The chapter's three ladders                  */
/* -------------------------------------------- */

/** 05: *You carry 16 bag slots, plus your Strength modifier.* */
export const BASE_SLOTS = 16;

/** 08 §11: *Twenty of the same thing share one bag slot.* */
export const STACK = 20;

/** 08 §11: *You wear up to four containers at once.* */
export const MAX_CONTAINERS = 4;

/**
 * 08 §11's **What a thing takes**, per unit. `upTo` is null on the last rung,
 * which is *More than 40 lb*.
 *
 * **The four boundaries are weights the chapter prints** — 5, 10, 20 and 40 —
 * so *up to* never falls between two rows, and **nothing takes less than
 * one**: a dash weighs nothing worth carrying and still fills a well.
 */
export const SIZE_LADDER = Object.freeze([
  Object.freeze({ upTo: 5, slots: 1 }),
  Object.freeze({ upTo: 10, slots: 2 }),
  Object.freeze({ upTo: 20, slots: 3 }),
  Object.freeze({ upTo: 40, slots: 4 }),
  Object.freeze({ upTo: null, slots: 6 })
]);

/**
 * 08 §11's **What a container adds**, off its own **Holds** cell.
 *
 * **There is no last rung on purpose.** Above 100 lb a container is not
 * wearable at all — Barrel, Chest and Handcart — and the chapter already says
 * none of them travels on a person.
 */
export const CONTAINER_LADDER = Object.freeze([
  Object.freeze({ upTo: 5, wells: 2 }),
  Object.freeze({ upTo: 20, wells: 4 }),
  Object.freeze({ upTo: 30, wells: 6 }),
  Object.freeze({ upTo: 40, wells: 8 }),
  Object.freeze({ upTo: 80, wells: 12 }),
  Object.freeze({ upTo: 100, wells: 16 })
]);

/** 08 §11's **What a mount or a vehicle adds**, off its **Carries** figure. */
export const MOUNT_LADDER = Object.freeze([
  Object.freeze({ upTo: 300, wells: 16 }),
  Object.freeze({ upTo: 500, wells: 20 }),
  Object.freeze({ upTo: 900, wells: 28 }),
  Object.freeze({ upTo: null, wells: 40 })
]);

/**
 * How many of a counted container's own kind share one well: *One for each*
 * of vials and scrolls, *one for every twenty* of arrows, bolts and shots.
 *
 * `people` is a `HOLD_KINDS` word and is deliberately absent: a rowboat's
 * *Four people* is a note rather than a count, and a boat that counted people
 * into bag slots would be reading the wrong sentence.
 */
export const PER_WELL = Object.freeze({ arrows: 20, bolts: 20, shots: 20, scrolls: 1, vials: 1 });

/* -------------------------------------------- */
/*  What a refusal says                          */
/* -------------------------------------------- */

/**
 * Every refusal this module can return, as literal language keys.
 *
 * A key built by concatenation leaves only its parent in the source and
 * `lang-unused.test.mjs` then takes that as proof of use for everything
 * beneath it, so a retired sentence would never be found. Each one is
 * written out (`documents/loot-offer.mjs` does the same and says why).
 */
export const REFUSALS = Object.freeze({
  /** A pickup with no room anywhere: *Inventory is full.* */
  noRoom: "AZEROTH.Bags.Refused.NoRoom",
  /** A move into a container that is not being worn. */
  containerOff: "AZEROTH.Bags.Refused.ContainerOff",
  /** A move into a counted container that does not take this kind. */
  wrongKind: "AZEROTH.Bags.Refused.WrongKind",
  /** A fifth general container. */
  tooManyContainers: "AZEROTH.Bags.Refused.TooManyContainers",
  /** A second quiver, bolt case, powder horn, bandolier or scroll case. */
  oneOfAKind: "AZEROTH.Bags.Refused.OneOfAKind",
  /** A second mount or vehicle with you. */
  oneMount: "AZEROTH.Bags.Refused.OneMount",
  /** Saddlebags, with no mount to hang them on. */
  noMount: "AZEROTH.Bags.Refused.NoMount",
  /** A Barrel, Chest or Handcart: above 100 lb nothing travels on a person. */
  notWearable: "AZEROTH.Bags.Refused.NotWearable",
  /** Taking off a container that still holds things. */
  holderNotEmpty: "AZEROTH.Bags.Refused.HolderNotEmpty",
  /** Taking off an empty container with no room for the container itself. */
  noRoomForHolder: "AZEROTH.Bags.Refused.NoRoomForHolder",
  /** Taking off a worn thing with no bag to put it in. */
  noRoomToRemove: "AZEROTH.Bags.Refused.NoRoomToRemove",
  /** A quantity or a weight that rose past the well it was in. */
  noRoomForMore: "AZEROTH.Bags.Refused.NoRoomForMore",
  /** Deleting a worn container that still holds things. */
  deleteHolder: "AZEROTH.Bags.Refused.DeleteHolder",
  /** Two things that are not the same thing. */
  notTwins: "AZEROTH.Bags.Refused.NotTwins",
  /** A split of none, or of the whole stack. */
  badSplit: "AZEROTH.Bags.Refused.BadSplit",
  /** Two things dropped on one another that will not fit in each other's wells. */
  noSwap: "AZEROTH.Bags.Refused.NoSwap",
  /** A well named by a drop that would push something out of the bag. */
  noRoomHere: "AZEROTH.Bags.Refused.NoRoomHere"
});

/** Why a thing that looks like a holder adds nothing. Not localised: a `reason` is read by the caller. */
export const HOLDER_REASONS = Object.freeze({
  /** A **Holds** cell with no number at all: the Component pouch's *Reagents for one school*. */
  notAHolder: "notAHolder",
  /** Above 100 lb: Barrel, Chest, Handcart. */
  tooBig: "tooBig",
  /** A **Carries** cell that is words: *Four people*, *A crew of eight*. */
  words: "words",
  /** A counted container of a kind `PER_WELL` prices nothing by. */
  unknownKind: "unknownKind",
  /** Saddlebags, and no mount with you. Their own row says so. */
  noMount: "noMount"
});

/** 08 §11's Saddlebags: *80 lb, on a mount*. The chapter's own rider, never the name. */
const ON_A_MOUNT = /\bon a mount\b/i;

/**
 * The item subtypes that are THINGS: 08's weapons, suits and gear.
 *
 * **A TALENT IS NOT CARRIED, AND NOTHING SAID SO.** Every rule below reads a
 * weight, a quantity and a container off whatever it is handed, and a talent
 * has none of the three - so `isLight(undefined)` was true, `unitsOf` fell
 * back to one, and a character with a class took a bag slot for each of its
 * thirty-six talents before a single thing was picked up. The caller hands
 * this module the WHOLE collection (`CharacterData` does, and so does every
 * operation hook, because a batch may hold a talent and a torch at once), so
 * the filter belongs here rather than at each door.
 *
 * A row with NO `type` at all is a thing: a unit test and a hand-built
 * snapshot both write bare system data, and refusing those would make the law
 * unusable from anywhere but a live document.
 */
export const CARRIED_TYPES = Object.freeze(["weapon", "armor", "gear"]);

/** Whether this is something a character could put in a bag at all. */
export function isThing(item) {
  const type = item?.type ?? null;
  return type === null || type === undefined || CARRIED_TYPES.includes(type);
}

/** Every row that is a thing, with an id. The one filter every export opens on. */
function things(items) {
  return [...(items ?? [])].filter(item => item && idOf(item) && isThing(item));
}

/* -------------------------------------------- */
/*  Reading one thing                            */
/* -------------------------------------------- */

const idOf = item => item?.id ?? item?._id ?? null;
const sysOf = item => item?.system ?? item ?? {};

/** A finite number, or null. `null`, `""` and NaN are all "no number". */
function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The first rung a number fits, or null where it fits none. */
function fromLadder(ladder, n, key) {
  for (const rung of ladder) if (rung.upTo === null || n <= rung.upTo) return rung[key];
  return null;
}

/**
 * How many bag slots ONE of a thing takes, off its published weight.
 * A thing with no printed weight is a dash and takes one.
 */
export function sizeOf(weight) {
  const w = num(weight);
  if (w === null) return SIZE_LADDER[0].slots;
  return fromLadder(SIZE_LADDER, w, "slots");
}

/** *A thing of 1 lb or less stacks.* A dash is lighter still. */
export function isLight(weight) {
  const w = num(weight);
  return w === null || w <= 1;
}

/** How many of a thing are carried. A missing or zero count is still one thing. */
export function unitsOf(item) {
  const n = Math.trunc(Number(sysOf(item).quantity));
  return Math.max(1, Number.isFinite(n) ? n : 1);
}

/**
 * The bag slots a thing takes in an ordinary bag: *three torches take three*,
 * and twenty arrows share one.
 *
 * A mount, a vehicle and a working animal are **not carried at all** and take
 * none. Whether the thing is worn or held is the LEDGER's question, not this
 * one: this answers what it would cost if it were in a bag.
 */
export function bagSlotsOf(item) {
  if (isMount(item)) return 0;
  const units = unitsOf(item);
  const weight = sysOf(item).weight;
  return isLight(weight) ? Math.ceil(units / STACK) : sizeOf(weight) * units;
}

/** Whether this is one of 08 §15's mounts, war mounts, working animals or vehicles. */
export function isMount(item) {
  const parts = sectionParts(sysOf(item).source?.section);
  const tail = parts.length ? parts[parts.length - 1] : "";
  return NOT_CARRIED.includes(tail);
}

/** Whether a thing has a **Holds** or **Carries** cell at all, however it reads. */
function hasCapacityCell(item) {
  const capacity = sysOf(item).capacity ?? null;
  if (!capacity) return false;
  return num(capacity.weight) !== null || num(capacity.count) !== null;
}

/**
 * The wells a holder adds, or why it adds none.
 *
 * Four shapes, and the item's own stored capacity says which:
 *
 * - **A mount or a vehicle** reads `MOUNT_LADDER` off its **Carries** pounds;
 *   a cell that is words (*Four people*) adds nothing and says so.
 * - **A counted container** adds `ceil(count / perWell)` wells that take only
 *   its own kind: a Quiver of 40 arrows is two, a Scroll case of 10 is ten.
 * - **A weight container** reads `CONTAINER_LADDER`; above 100 lb it is not
 *   wearable at all.
 * - **Anything else** is not a holder.
 *
 * `mounted` says whether a mount is with you, for the Saddlebags' own rider.
 *
 * @returns {{wells: number, perWell: number|null, of: string|null, reason: string|null}}
 */
export function wellsOf(item, { mounted = true } = {}) {
  const capacity = sysOf(item).capacity ?? null;
  const none = reason => ({ wells: 0, perWell: null, of: null, reason });

  if (isMount(item)) {
    const lb = num(capacity?.weight);
    if (lb === null) return none(HOLDER_REASONS.words);
    return { wells: fromLadder(MOUNT_LADDER, lb, "wells"), perWell: null, of: null, reason: null };
  }

  const count = num(capacity?.count);
  if (count !== null && capacity?.of) {
    const perWell = PER_WELL[capacity.of] ?? null;
    if (!perWell) return none(HOLDER_REASONS.unknownKind);
    return { wells: Math.ceil(count / perWell), perWell, of: capacity.of, reason: null };
  }

  const lb = num(capacity?.weight);
  if (lb === null) return none(HOLDER_REASONS.notAHolder);
  // *Saddlebags add theirs only while a mount is with you* - read off the
  // chapter's own rider in the Holds cell, never off the item's name.
  if (!mounted && ON_A_MOUNT.test(String(capacity?.note ?? ""))) return none(HOLDER_REASONS.noMount);
  const wells = fromLadder(CONTAINER_LADDER, lb, "wells");
  if (wells === null) return none(HOLDER_REASONS.tooBig);
  return { wells, perWell: null, of: null, reason: null };
}

/**
 * The wells a thing takes in a given panel.
 *
 * In a counted container a thing is measured by its OWN kind's rate, not by
 * its weight: twenty arrows are one well of a quiver whatever the bundle
 * weighs.
 */
export function slotsIn(item, panel = null) {
  if (panel?.perWell) return Math.ceil(unitsOf(item) / panel.perWell);
  return bagSlotsOf(item);
}

/**
 * The same number as a RUN of wells, never shorter than one.
 *
 * `slotsIn` answers 0 for a mount, which is never in a panel at all — but a
 * run of zero would occupy nothing and let two things share a well, so the
 * floor is here rather than at each caller. `used` keeps `slotsIn`'s own
 * answer, and for everything that can really reach a panel the two agree.
 */
function runOf(item, panel = null) {
  return Math.max(1, Math.trunc(Number(slotsIn(item, panel))) || 1);
}

/* -------------------------------------------- */
/*  Which well (the lead, 2026-09-20)            */
/* -------------------------------------------- */

/**
 * A stored well made valid, for `migrateData` and for every reader.
 *
 * A non-negative integer, or **null for *no position yet, pack me after the
 * placed ones***. Anything else — a string, a negative, a fraction, NaN — is
 * null rather than refusing the document (CLAUDE.md §15).
 */
export function cleanWell(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** The well a thing CLAIMS inside its panel, or null. */
export function wellOf(item) {
  return cleanWell(sysOf(item).well);
}

/** Whether a run of `size` wells starting at `at` is inside the panel and free. */
function runFree(taken, at, size, wells) {
  if (!Number.isInteger(at) || at < 0 || at + size > wells) return false;
  for (let i = at; i < at + size; i += 1) if (taken[i]) return false;
  return true;
}

/** The first well a run of `size` fits at, or null. */
function firstRun(taken, size, wells) {
  for (let at = 0; at + size <= wells; at += 1) if (runFree(taken, at, size, wells)) return at;
  return null;
}

/** Mark a run as occupied by `id`. */
function fillRun(taken, at, size, id) {
  for (let i = at; i < at + size; i += 1) taken[i] = id;
}

/** Pack a list from well 0, first fit, in the order it is handed over. */
function layOut(rows, panel, wells) {
  const taken = new Array(wells).fill(null);
  const places = [];
  const loose = [];
  for (const item of rows) {
    const size = runOf(item, panel);
    const at = firstRun(taken, size, wells);
    if (at === null) { loose.push(idOf(item)); continue; }
    fillRun(taken, at, size, idOf(item));
    places.push({ id: idOf(item), well: at, size });
  }
  return { places, loose, taken };
}

/**
 * LAY ONE PANEL'S CONTENTS DOWN IN ITS WELLS.
 *
 * Three passes, and every one of them sorts first, so a shuffled input gives
 * an identical answer:
 *
 * 1. **The claims**, in well order and then `byPlace`. A thing whose run is
 *    free and inside the panel keeps the well it asked for; a thing whose run
 *    is taken or out of range falls through to the second pass. Well order is
 *    what decides a collision, so the thing nearer the front of the bag keeps
 *    its place and the other one moves.
 * 2. **Everything else**, in `byPlace` order, into the FIRST free run that
 *    fits. A run has to be CONTIGUOUS, so a bag holding four things spread
 *    one to a corner may have twelve free wells and nowhere to lay a suit.
 * 3. **AND THEN THE PANEL COMPACTS RATHER THAN LEAVING ANYTHING HOMELESS**
 *    (the lead, 2026-09-20). A gap a reader left is kept every ordinary day
 *    and yields the moment something has nowhere else to go: a bag that
 *    refuses a suit while drawing four empty wells is a bug to whoever is
 *    looking at it, and 05 charges for what is carried and never for how it
 *    is arranged (D-743). It re-lays the whole panel from well 0 in the order
 *    it was drawn in and keeps the answer only where it houses MORE than the
 *    first two passes did, so an honestly full bag is untouched and its over
 *    row still says so.
 *
 * `over` therefore reads as it always did — what the bag has no capacity for
 * — and never punishes an arrangement. **The stored wells are not rewritten**
 * (a derivation writes nothing), so after a compaction the claims are stale
 * hints until the next drop or Clean Up normalises them; the derivation is
 * deterministic either way, so the picture does not wobble.
 *
 * @param {{wells: number, perWell?: number|null}} panel
 * @param {Array<object>} items  the things assigned to this panel
 * @returns {{places: Array<{id: string, well: number, size: number}>, loose: string[], taken: Array<string|null>}}
 */
export function packPanel(panel, items = []) {
  const wells = Math.max(0, Math.trunc(Number(panel?.wells)) || 0);
  const taken = new Array(wells).fill(null);
  const rows = [...(items ?? [])].filter(Boolean);
  const byId = new Map(rows.map(item => [idOf(item), item]));
  const places = [];
  const pending = [];

  const claims = rows.filter(row => wellOf(row) !== null)
    .sort((a, b) => wellOf(a) - wellOf(b) || byPlace(a, b));
  for (const item of claims) {
    const at = wellOf(item);
    const size = runOf(item, panel);
    if (!runFree(taken, at, size, wells)) { pending.push(item); continue; }
    fillRun(taken, at, size, idOf(item));
    places.push({ id: idOf(item), well: at, size });
  }

  for (const item of rows) if (wellOf(item) === null) pending.push(item);
  pending.sort(byPlace);

  const loose = [];
  for (const item of pending) {
    const size = runOf(item, panel);
    const at = firstRun(taken, size, wells);
    if (at === null) { loose.push(idOf(item)); continue; }
    fillRun(taken, at, size, idOf(item));
    places.push({ id: idOf(item), well: at, size });
  }

  places.sort((a, b) => a.well - b.well);
  if (!loose.length) return { places, loose, taken };

  // The compaction, in the order the reader was looking at: what lay down, by
  // well, and then what did not.
  const order = [...places.map(p => byId.get(p.id)), ...loose.map(id => byId.get(id))].filter(Boolean);
  const packed = layOut(order, panel, wells);
  return packed.loose.length < loose.length ? packed : { places, loose, taken };
}

/**
 * *You carry 16 bag slots, plus your Strength modifier*, times your size's
 * rung, times Pack Hobgoblin, rounded down.
 *
 * ONE floor at the end, so a Small character with an odd number keeps the
 * doubling the talent promises: (16 + 1) x 0.5 x 2 is 17, not 16.
 *
 * @param {{strMod?: number, size?: string, factor?: number}} o
 */
export function baseCapacity({ strMod = 0, size = DEFAULT_SIZE, factor = 1 } = {}) {
  const mod = Math.trunc(Number(strMod)) || 0;
  const mult = CARRY_MULTIPLIER[String(size ?? DEFAULT_SIZE).toLowerCase()] ?? 1;
  const f = Number(factor) > 0 ? Number(factor) : 1;
  return Math.max(0, Math.floor((BASE_SLOTS + mod) * mult * f));
}

/* -------------------------------------------- */
/*  The ledger                                   */
/* -------------------------------------------- */

/**
 * Where a holder sits in the bar, and where a tile sits in a panel.
 *
 * **Stored `sort`, then name, then id.** An embedded collection's order is not
 * stable across a re-sync (CLAUDE.md §15), so anything a person reads has to
 * be sorted before it is built; and a world that somehow equipped five
 * containers has to lose the same one every render rather than a different
 * one each time.
 */
function byPlace(a, b) {
  const sa = Number(a?.sort) || 0;
  const sb = Number(b?.sort) || 0;
  return sa - sb
    || String(a?.name ?? "").localeCompare(String(b?.name ?? ""))
    || String(idOf(a) ?? "").localeCompare(String(idOf(b) ?? ""));
}

/** Whether a panel will take this thing at all. The base pack and a weight bag take anything. */
function panelTakes(panel, item) {
  if (!panel) return false;
  if (!panel.of) return true;
  return kindOfItem(item) === panel.of;
}

/**
 * THE BAG SLOTS THAT COULD NOT BE HOUSED ANYWHERE.
 *
 * 05's *Speed and movement* is about the character's bag slots as a whole -
 * *if you lose bag slots and carry more than the ones you have left, you are
 * **Encumbered*** - so a panel that overflows while another has free wells is
 * an ARRANGEMENT, not a load. Summing the panels' own overflow read
 * `16 / 24 bag slots … Encumbered` beside a Backpack with seven free wells,
 * which penalises a character for where their rope is sitting.
 *
 * Two passes, both deterministic (the panels and their contents are already
 * sorted by `byPlace`, so a shuffled input gives an identical answer):
 *
 * 1. **Pack each panel in its own order, skipping what will not fit.** Space
 *    only ever shrinks as the pass goes, so nothing left over can fit back
 *    into the panel it came from afterwards.
 * 2. **House the leftovers elsewhere, largest first.** `panelTakes` is what
 *    stops a quiver's free wells absorbing a rope, and a size of 6 left to
 *    last would never find room - which is why the big things go first.
 *
 * What is still homeless is counted at the slots it takes where it stands.
 *
 * **This is not the panel's own over row**, and the two answer different
 * questions on purpose. `panel.over` is what would not LIE DOWN in that bag's
 * wells — a run too short, a gap in the wrong place, a bag that shrank — and
 * is drawn on the panel with **Make room** beside it. This is what fits
 * NOWHERE AT ALL, measured against each panel's whole capacity and ignoring
 * where the gaps are, because 05 charges a character for what they carry and
 * never for how it is arranged: a reader who leaves a gap on purpose has not
 * become Encumbered by doing so, and Make room is one press away.
 */
function unhoused(panels, byId) {
  const room = panels.map(p => ({ key: p.key, wells: p.wells, of: p.of, perWell: p.perWell, used: 0 }));
  const loose = [];
  panels.forEach((panel, i) => {
    const fit = room[i];
    for (const id of panel.itemIds) {
      const item = byId.get(id);
      if (!item) continue;
      const need = slotsIn(item, panel);
      if (fit.used + need <= panel.wells) { fit.used += need; continue; }
      loose.push({ item, need, from: panel.key });
    }
  });
  if (!loose.length) return 0;

  loose.sort((a, b) => b.need - a.need
    || String(a.item.name ?? "").localeCompare(String(b.item.name ?? ""))
    || String(idOf(a.item) ?? "").localeCompare(String(idOf(b.item) ?? "")));
  let over = 0;
  for (const { item, need, from } of loose) {
    const home = room.find(fit => fit.key !== from
      && panelTakes(fit, item)
      && fit.used + slotsIn(item, fit) <= fit.wells);
    if (home) home.used += slotsIn(item, home);
    else over += need;
  }
  return over;
}

/**
 * The whole derivation, once: what the character wears, what hangs in the
 * bar, what stands in the stable, and what is in each panel.
 *
 * Deterministic by construction — every list is sorted by `byPlace` — so a
 * shuffled `items` gives an identical ledger.
 *
 * @param {Iterable<object>} items   every item the character holds, as plain objects
 * @param {number} base              the base pack's wells, from `baseCapacity`
 */
export function ledger(items, base = BASE_SLOTS) {
  const all = things(items).sort(byPlace);
  const wells = Math.max(0, Math.trunc(Number(base)) || 0);

  // 1. The mount place. ONE at a time, and it is with you or it is stabled.
  //    A vehicle whose Carries is words still stands here and adds nothing:
  //    `system.equipped` means "with you" and the reason says the rest.
  const mounts = all.filter(isMount);
  const mount = mounts.find(m => sysOf(m).equipped === true) ?? null;
  const mountId = mount ? idOf(mount) : null;
  const stable = mounts.filter(m => idOf(m) !== mountId).map(idOf);

  // 2. The bar. Four general places, then one of each counted kind beside
  //    them. Anything past that counts as UNEQUIPPED and is an ordinary
  //    thing again, which is what a legacy world needs to be able to unwind.
  const bar = [];
  let general = 0;
  const kinds = new Set();
  for (const item of all) {
    if (isMount(item) || sysOf(item).equipped !== true) continue;
    const held = wellsOf(item, { mounted: Boolean(mount) });
    if (held.reason || held.wells <= 0) continue;
    if (held.of) {
      if (kinds.has(held.of)) continue;
      kinds.add(held.of);
    } else {
      if (general >= MAX_CONTAINERS) continue;
      general += 1;
    }
    bar.push({ id: idOf(item), name: item.name ?? "", wells: held.wells, of: held.of, perWell: held.perWell });
  }
  const barIds = new Set(bar.map(p => p.id));

  // 3. The figure. Worn and held take no bag slot - but a weapon the figure
  //    does not DRAW is not worn for this purpose (nothing caps equipped
  //    weapons, so ten "ready" swords would otherwise ride free), and a
  //    nocked bundle always pays its wells where it is kept.
  const figure = figureSlots(all);
  const worn = [];
  for (const item of all) {
    const id = idOf(item);
    if (id === mountId || barIds.has(id)) continue;
    if (isMount(item)) continue;
    // **A HOLDER IS NEVER WORN IN THIS SENSE.** It is in the bar or it counts
    // as unequipped, and a fifth container, a second quiver and Saddlebags
    // with no mount all reach here still carrying `equipped: true` - so
    // without this they would ride free instead of taking their own weight,
    // which is exactly the thing 08 §11 says happens when a bag comes off.
    if (hasCapacityCell(item)) continue;
    if (!isWorn(item)) continue;
    if (item.type === "weapon") continue;
    worn.push(id);
  }
  for (const key of ["mainHand", "offHand", "ranged"]) {
    const held = figure[key];
    if (held?.type !== "weapon" || isShot(sysOf(held))) continue;
    const id = idOf(held);
    if (id && !worn.includes(id)) worn.push(id);
  }
  worn.sort();
  const wornIds = new Set(worn);

  // 4. The panels: the base pack, then the bar in its own order, then the
  //    mount. A panel is drawn even where it is full.
  const panels = [{
    key: "", kind: "base", containerId: null, wells, used: 0, free: wells, over: 0,
    of: null, perWell: null, reason: null, itemIds: [], places: [], loose: []
  }];
  for (const place of bar) {
    panels.push({
      key: place.id, kind: place.of ? "counted" : "container", containerId: place.id,
      wells: place.wells, used: 0, free: place.wells, over: 0,
      of: place.of, perWell: place.perWell, reason: null, itemIds: [], places: [], loose: []
    });
  }
  if (mount) {
    const held = wellsOf(mount, { mounted: true });
    panels.push({
      key: mountId, kind: "mount", containerId: mountId,
      wells: held.wells, used: 0, free: held.wells, over: 0,
      of: null, perWell: null, reason: held.reason, itemIds: [], places: [], loose: []
    });
  }
  const byKey = new Map(panels.map(p => [p.key, p]));
  const contents = new Map(panels.map(p => [p.key, []]));

  // 5. Everything else goes somewhere, and NOTHING IS EVER HIDDEN: a thing
  //    whose container is unequipped, gone, a fifth bag or the wrong kind
  //    falls into the base pack rather than out of the world.
  for (const item of all) {
    const id = idOf(item);
    if (id === mountId || barIds.has(id) || wornIds.has(id) || isMount(item)) continue;
    const named = containerOf(item);
    const panel = (named && byKey.get(named)) || null;
    const home = panel && panelTakes(panel, item) ? panel : byKey.get("");
    contents.get(home.key).push(item);
    home.used += slotsIn(item, home);
  }

  const byId = new Map(all.map(item => [idOf(item), item]));
  let capacity = 0;
  let used = 0;
  for (const panel of panels) {
    // 6. WHICH WELL each of them sits in, and what will not lie down at all.
    const laid = packPanel(panel, contents.get(panel.key));
    panel.places = laid.places;
    panel.loose = laid.loose;
    // The placed in well order, then the ones with nowhere to lie: the order
    // a reader sees, and the order `arrange` and the over row read.
    panel.itemIds = [...laid.places.map(p => p.id), ...laid.loose];
    panel.free = Math.max(0, panel.wells - panel.used);
    // **THE PANEL'S OWN OVERFLOW IS WHAT WOULD NOT LIE DOWN**, which its over
    // row prints and **Make room** moves. `packPanel` compacts a panel rather
    // than leaving anything homeless it has the capacity for, so this reads
    // as `used - wells` in every ordinary case and the number means exactly
    // what it meant before wells existed: an arrangement is never charged for,
    // here or on the character's own line below (D-743).
    panel.over = laid.loose.reduce((n, id) => n + slotsIn(byId.get(id), panel), 0);
    capacity += panel.wells;
    used += panel.used;
  }
  const over = unhoused(panels, byId);

  // 05's two rungs, read in slots: what fits NOWHERE is Encumbered, and
  // carrying more than twice what the bags hold is Overloaded.
  const state = used > capacity * 2 ? "overloaded" : (over > 0 ? "encumbered" : "unencumbered");
  return { panels, worn, bar, mount: mountId, stable, base: wells, capacity, used, over, state };
}

/**
 * Where one thing sits, read off a ledger. Derived, never stored.
 *
 * @returns {"mount"|"stable"|"bar"|"worn"|string} a panel key; `""` is the base pack
 */
export function placeOf(item, ctx = {}) {
  const id = idOf(item) ?? item;
  if (ctx.mount && ctx.mount === id) return "mount";
  if ((ctx.stable ?? []).includes(id)) return "stable";
  if ((ctx.bar ?? []).some(p => p.id === id)) return "bar";
  if ((ctx.worn ?? []).includes(id)) return "worn";
  const panel = (ctx.panels ?? []).find(p => (p.itemIds ?? []).includes(id));
  return panel ? panel.key : "";
}

/**
 * The carry line the sheet draws, in `loadLine`'s exact shape plus `over`.
 *
 * `loadLine` stays the one place the label key, the Speed penalty and the
 * bar's ceiling are decided, so the character's slots and the creature's
 * pounds cannot drift apart in the template.
 */
export function slotLine(led) {
  const line = loadLine({
    carried: led?.used ?? 0,
    capacity: led?.capacity ?? 0,
    state: led?.state ?? "unencumbered"
  });
  return { ...line, over: Math.max(0, Math.trunc(Number(led?.over) || 0)) };
}

/* -------------------------------------------- */
/*  Finding room                                 */
/* -------------------------------------------- */

/**
 * A throwaway copy of a ledger's panels, so a batch can spend room as it goes.
 *
 * **The OCCUPANCY comes with it**, rebuilt off each panel's own `places`, or
 * a second thing housed in the same batch would be handed a well the first
 * one had just taken.
 */
function roomFrom(led) {
  const panels = led.panels.map(p => {
    const wells = Math.max(0, Math.trunc(Number(p.wells)) || 0);
    const taken = new Array(wells).fill(null);
    for (const place of p.places ?? []) fillRun(taken, place.well, place.size, place.id);
    return { ...p, itemIds: [...p.itemIds], places: [...(p.places ?? [])], loose: [...(p.loose ?? [])], taken };
  });
  return { panels, byKey: new Map(panels.map(p => [p.key, p])) };
}

/**
 * Put one thing somewhere, and spend the room. THE ANSWER IS A WELL, not only
 * a panel (the lead, 2026-09-20).
 *
 * **KIND GOES FIRST.** Arrows go to an equipped quiver before the pack, which
 * is both what a player means and what keeps the counted containers worth
 * wearing at all. A `prefer`red panel — the one a drag landed on, or the one
 * a displaced thing was just taken out of — is tried before that where the
 * caller names one and asks for it.
 *
 * `preferWell` is the well the thing ASKED for: honoured where the run is
 * free inside the preferred panel, and otherwise the first free run there.
 * Nothing is ever refused for wanting a taken well.
 *
 * **CAPACITY DECIDES, AND THE RUN IS A PREFERENCE.** A panel with room but no
 * contiguous run takes the thing anyway and hands back a well of `null` — no
 * claim at all — because `packPanel`'s third pass compacts the panel at the
 * next derivation and lays it down there. Making the run the test instead
 * would refuse a suit taken off into a bag with four scattered free wells,
 * which is a sentence about the shape of the gaps rather than about the load
 * (05, D-743), and it would refuse it with no way out but a Clean Up.
 *
 * @returns {{key: string, well: number|null}|null} where it landed, or null where nothing had room
 */
function houseIn(room, item, { prefer = null, preferWell = null, kindFirst = true, skip = null } = {}) {
  const order = [];
  const push = key => { if (key !== null && key !== undefined && key !== skip && !order.includes(key)) order.push(key); };
  if (!kindFirst) push(prefer);
  const kind = kindOfItem(item);
  if (kind) for (const panel of room.panels) if (panel.of === kind) push(panel.key);
  if (kindFirst) push(prefer);
  for (const panel of room.panels) push(panel.key);

  const wanted = cleanWell(preferWell);
  for (const key of order) {
    const panel = room.byKey.get(key);
    if (!panel || !panelTakes(panel, item)) continue;
    const need = slotsIn(item, panel);
    if (panel.used + need > panel.wells) continue;
    const run = runOf(item, panel);
    const at = (wanted !== null && runFree(panel.taken, wanted, run, panel.wells))
      ? wanted
      : firstRun(panel.taken, run, panel.wells);
    if (at !== null) {
      fillRun(panel.taken, at, run, idOf(item));
      panel.places.push({ id: idOf(item), well: at, size: run });
    }
    panel.used += need;
    panel.itemIds.push(idOf(item));
    return { key: panel.key, well: at };
  }
  return null;
}

/** The `{container, well}` patch a landing writes. A well of null is *pack me*. */
function patchFor(spot) {
  return { container: spot.key === "" ? null : spot.key, well: spot.well };
}

/**
 * A batch of newcomers, judged in order against the room there is.
 *
 * The first that fit are admitted and the rest are named: a drag of twenty
 * torches onto sixteen free wells creates sixteen and says so about the last
 * four, rather than refusing the whole drag or silently losing it.
 *
 * `judged` is the patch the door writes onto the document — `container`,
 * `well` and, where a holder got no place in the bar, `equipped`. The `sort`
 * is still the door's: it is the collection's own order and no longer decides
 * anything a reader sees in a bag, which the WELL does.
 *
 * @param {Iterable<object>} items      what the character already holds
 * @param {number} base                 the base pack's wells
 * @param {Iterable<object>} newcomers  the documents being created
 * @param {{kindFirst?: boolean}} [options]
 * @returns {Array<{source: object, ok: boolean, reason: string|null, panel: string|null, judged: object|null}>}
 */
export function admit(items, base, newcomers, { kindFirst = true } = {}) {
  const led = ledger(items, base);
  const room = roomFrom(led);
  // What the bar already holds, so a container created worn takes a place
  // rather than a well - and the FIFTH one, which gets no place, falls
  // through to the ordinary rule and pays its own weight.
  let general = led.bar.filter(p => !p.of).length;
  const kinds = new Set(led.bar.filter(p => p.of).map(p => p.of));
  let mounted = Boolean(led.mount);

  const out = [];
  for (const source of [...(newcomers ?? [])]) {
    if (!source) continue;
    const sys = sysOf(source);
    const free = (reason, panel) => out.push({ source, ok: true, reason, panel, judged: null });

    // A talent, a spell, a class: not a thing at all, and never judged. The
    // door hands its whole batch over, so one arriving beside a torch has to
    // pass rather than be counted into a well.
    if (!isThing(source)) { free(null, null); continue; }

    // A mount is never carried, worn or unworn.
    if (isMount(source)) {
      if (sys.equipped === true && !mounted) mounted = true;
      free(null, "mount");
      continue;
    }
    if (sys.equipped === true && hasCapacityCell(source)) {
      const held = wellsOf(source, { mounted });
      if (!held.reason && held.wells > 0) {
        if (held.of && !kinds.has(held.of)) { kinds.add(held.of); free(null, "bar"); continue; }
        if (!held.of && general < MAX_CONTAINERS) { general += 1; free(null, "bar"); continue; }
      }
      // No place for it: it is a thing again, and it pays its own weight.
    } else if (isWorn(source)) {
      free(null, "worn");
      continue;
    }
    const prefer = typeof sys.container === "string" && sys.container ? sys.container : null;
    const spot = houseIn(room, source, { prefer, preferWell: wellOf(source), kindFirst });
    if (spot === null) {
      out.push({ source, ok: false, reason: REFUSALS.noRoom, panel: null, judged: null });
      continue;
    }
    const panel = spot.key;
    // **A NOCKED BUNDLE KEEPS ITS FLAG.** Everything else that reaches here
    // with `equipped: true` asked to be worn and was refused a place - a fifth
    // container, saddlebags with no mount - so the flag has to come off or it
    // would ride free. A bundle is the exception `isWorn` already makes: it is
    // *nocked, not held* (D-641, D-735), it pays its wells where it is kept,
    // and clearing the flag took the shot off the string.
    const judged = patchFor(spot);
    if (sys.equipped === true && !isShot(sys)) judged.equipped = false;
    out.push({ source, ok: true, reason: null, panel, judged });
  }
  return out;
}

/* -------------------------------------------- */
/*  Judging a batch of writes                    */
/* -------------------------------------------- */

/**
 * The system keys a bag-slot judgement has to read. Anything else is never
 * judged.
 *
 * **`well` is one of them** (the lead, 2026-09-20): a drop on a well is a
 * write like any other and has to be held to the same master rule, or a
 * reader could put a rope where it does not lie and push something out of the
 * bag in silence.
 */
const JUDGED_KEYS = Object.freeze(["container", "equipped", "quantity", "weight", "well"]);

/** The `system` half of one update, whether it arrived dotted or expanded. */
function systemChange(update) {
  const out = {};
  const sys = update?.system;
  if (sys && typeof sys === "object") {
    for (const key of JUDGED_KEYS) if (Object.prototype.hasOwnProperty.call(sys, key)) out[key] = sys[key];
  }
  for (const key of JUDGED_KEYS) {
    const dotted = `system.${key}`;
    if (Object.prototype.hasOwnProperty.call(update ?? {}, dotted)) out[key] = update[dotted];
  }
  return out;
}

/** One item with an update's judged keys laid on it. */
function withChange(item, change) {
  if (!change || !Object.keys(change).length) return item;
  return { ...item, system: { ...sysOf(item), ...change } };
}

/** Each panel's overflow, by key, so a write can be held to never raising one. */
function overByKey(led) {
  return new Map(led.panels.map(p => [p.key, p.over]));
}

/**
 * A batch of updates, judged whole.
 *
 * Nothing here is a flat "does it fit": every rule is the same one seen from
 * a different door — **no write may increase any panel's overflow** — with a
 * specific refusal in front of it so the sheet can say what happened in
 * words rather than printing *Inventory is full* at a player who was taking
 * a ring off.
 *
 * The order matters. A batch is applied, the displaced are housed, the
 * structural rules are read off the RESULT, and only then is the overflow
 * compared. That is what lets one batch equip a fifth container by
 * unequipping a fourth, or empty a backpack and take it off in one act.
 *
 * @param {Iterable<object>} items   what the character holds
 * @param {number} base              the base pack's wells
 * @param {Array<object>} updates    Foundry's own update array, index-aligned
 * @returns {{ok: boolean, reason: string|null, data: object|null, placements: Array<object|null>}}
 */
export function judge(items, base, updates = []) {
  const list = [...(updates ?? [])];
  const changes = list.map(systemChange);
  const placements = list.map(() => null);
  const pass = { ok: true, reason: null, data: null, placements };

  // THE FAST PATH. A charge spent, a use struck, a sort, a name: none of them
  // can move a bag slot, and a character already over capacity must be able
  // to make every one of those writes.
  if (!changes.some(c => Object.keys(c).length)) return pass;

  const all = things(items);
  const byId = new Map(all.map(item => [idOf(item), item]));
  const before = ledger(all, base);
  const placeBefore = new Map(all.map(item => [idOf(item), placeOf(item, before)]));

  // 1. Lay the batch down.
  const nextById = new Map(byId);
  list.forEach((update, i) => {
    const id = update?._id ?? update?.id ?? null;
    const item = id ? byId.get(id) : null;
    if (item) nextById.set(id, withChange(item, changes[i]));
  });
  const next = [...nextById.values()];

  const refuse = (reason, data = null) => ({ ok: false, reason, data, placements });

  // 2. The bar's structural rules, read off the RESULT rather than the change,
  //    so a swap inside one batch is legal and a legacy world stays where it is.
  const mountedAfter = next.some(item => isMount(item) && sysOf(item).equipped === true);
  const countPlaces = list => {
    const out = { general: 0, kinds: new Map(), mounts: 0, bad: [] };
    for (const item of list) {
      if (sysOf(item).equipped !== true) continue;
      if (isMount(item)) { out.mounts += 1; continue; }
      const held = wellsOf(item, { mounted: mountedAfter });
      if (held.reason === HOLDER_REASONS.tooBig) { out.bad.push(item); continue; }
      if (held.reason === HOLDER_REASONS.noMount) { out.bad.push(item); continue; }
      if (held.reason || held.wells <= 0) continue;
      if (held.of) out.kinds.set(held.of, (out.kinds.get(held.of) ?? 0) + 1);
      else out.general += 1;
    }
    return out;
  };
  const wasPlaces = countPlaces(all);
  const nowPlaces = countPlaces(next);
  const equipping = list.some((u, i) => changes[i].equipped === true);

  if (equipping) {
    for (const item of nowPlaces.bad) {
      // Only a thing this batch just put on: a legacy world keeps its own mess.
      const i = list.findIndex(u => (u?._id ?? u?.id) === idOf(item));
      if (i < 0 || changes[i].equipped !== true) continue;
      const held = wellsOf(item, { mounted: mountedAfter });
      return refuse(held.reason === HOLDER_REASONS.noMount ? REFUSALS.noMount : REFUSALS.notWearable,
        { name: item.name ?? "" });
    }
    if (nowPlaces.mounts > 1 && nowPlaces.mounts > wasPlaces.mounts) return refuse(REFUSALS.oneMount);
    if (nowPlaces.general > MAX_CONTAINERS && nowPlaces.general > wasPlaces.general) {
      return refuse(REFUSALS.tooManyContainers, { max: MAX_CONTAINERS });
    }
    for (const [kind, n] of nowPlaces.kinds) {
      if (n > 1 && n > (wasPlaces.kinds.get(kind) ?? 0)) return refuse(REFUSALS.oneOfAKind, { of: kind });
    }
  }

  // 3. A move into a bag that will not take it. Judged against the result, so
  //    one batch may equip a sack and put something in it.
  const after = ledger(next, base);
  const placedAfter = new Set([...after.bar.map(p => p.id), after.mount].filter(Boolean));
  for (let i = 0; i < list.length; i += 1) {
    const target = changes[i].container;
    if (!target) continue;
    const holder = nextById.get(target) ?? null;
    const moving = nextById.get(list[i]?._id ?? list[i]?.id) ?? null;
    if (!holder || !placedAfter.has(target)) return refuse(REFUSALS.containerOff, { name: holder?.name ?? "" });
    if (!accepts(sysOf(holder).capacity ?? null, moving)) {
      return refuse(REFUSALS.wrongKind, { name: holder.name ?? "", of: sysOf(holder).capacity?.of ?? "" });
    }
  }

  // 4. A holder taken off has to be EMPTY, and then has to fit somewhere
  //    itself. A batch that empties it in the same breath passes both.
  const homeless = [];
  for (let i = 0; i < list.length; i += 1) {
    if (changes[i].equipped !== false) continue;
    const id = list[i]?._id ?? list[i]?.id ?? null;
    const item = id ? nextById.get(id) : null;
    if (!item) continue;
    const was = placeBefore.get(id);
    // **A MOUNT IS LEFT BEHIND EMPTY, EXACTLY AS A BAG COMES OFF EMPTY.** 08
    // §11 says it of both in the same breath - *it is unloaded before you
    // leave it behind* - and this loop skipped every mount whole, so a horse
    // carrying ten ropes was stabled and its load FOLLOWED THE CHARACTER into
    // their own bags in silence where it fit, and was refused as *Inventory is
    // full* where it did not. Both are the same fault: the question is never
    // whether the character can shoulder the load, it is that the load has to
    // come off the animal first. A batch that unloads it in the same breath
    // still passes, which is the rule a bag already had.
    if (was === "bar" || was === "mount") {
      const inside = next.filter(o => idOf(o) !== id && containerOf(o) === id);
      if (inside.length) return refuse(REFUSALS.holderNotEmpty, { name: item.name ?? "", n: inside.length });
    }
    // And there the two part again: a mount is NEVER CARRIED, so there is no
    // homeless path for it. It is with you or it is stabled, and neither of
    // those takes a bag slot of its own.
    if (isMount(item)) continue;
    // **A WRITE THAT NAMES A BAG OR A WELL ALREADY SAYS WHERE IT GOES.**
    // Housing it a second time would put it in the first panel with room and
    // hand that container back to the door, so *put this in the sack* arrived
    // as *take this off* - the caller's own field overwritten with null,
    // silently. `wornXorKept` writes exactly that pair on every such move
    // (D-739), and a ring dragged off the figure onto the ninth well of the
    // base pack writes the WELL with a container of null (the lead,
    // 2026-09-20) - so naming the bag alone would have housed it again and
    // landed it in the first free well instead of the one aimed at.
    if (changes[i].container || changes[i].well !== undefined) continue;
    // It was in the bar or on the figure and now it is a thing again.
    if (was === "worn" || was === "bar") homeless.push({ index: i, id, item });
  }

  // 5. **A CONTAINER PUT ON TAKES WHAT FITS AND THE REST FALLS LOOSE.**
  //    Equipping a bag can only ever ADD capacity, so it may never be
  //    refused — and a legacy sack holding eight things in six wells would
  //    have been refused by the master rule below for exactly the act that
  //    makes the character better off. The contents are re-housed preferring
  //    the bag itself, and whatever will not fit goes where there is room.
  const placedBefore = new Set([...before.bar.map(p => p.id), before.mount].filter(Boolean));
  const spilling = [];
  for (const key of [...after.bar.map(p => p.id), after.mount].filter(Boolean)) {
    if (placedBefore.has(key)) continue;
    for (const item of next) {
      const id = idOf(item);
      if (containerOf(item) !== key || homeless.some(h => h.id === id)) continue;
      spilling.push({ id, item, prefer: key });
    }
  }

  // 6. What a newly worn thing PUTS AWAY has to go somewhere too (08 §11's
  //    one-in-each-slot, 08 §8's one suit, 07 §3's one Augment). The vacated
  //    panel is tried first, so a ring swapped out of a pouch goes back in it.
  const displaced = [];
  for (let i = 0; i < list.length; i += 1) {
    if (changes[i].equipped !== true) continue;
    const id = list[i]?._id ?? list[i]?.id ?? null;
    const item = id ? nextById.get(id) : null;
    if (!item || isMount(item) || sysOf(byId.get(id)).equipped === true) continue;
    const vacated = placeBefore.get(id);
    for (const victim of displacedBy(item, next)) {
      const vid = idOf(victim);
      if (!vid || displaced.some(d => d.id === vid)) continue;
      if (homeless.some(h => h.id === vid) || spilling.some(s => s.id === vid)) continue;
      displaced.push({ id: vid, item: victim, prefer: vacated === "worn" || vacated === "bar" ? null : vacated });
    }
  }

  // 7. House them all.
  //
  // **THE ROOM IS MEASURED WITH THEM OUT OF IT.** A ledger over the batch's
  // result has already put every unequipped thing into a panel, so housing
  // them against that would charge each of them twice and refuse a swap that
  // fits perfectly. They are parked, the room is read, and then they land.
  //
  // The spilling go first, because they mostly stay exactly where they are
  // and the base pack must not be filled out from under them.
  const parked = new Set([...spilling.map(s => s.id), ...homeless.map(h => h.id), ...displaced.map(d => d.id)]);
  const room = roomFrom(ledger(next.filter(item => !parked.has(idOf(item))), base));
  const writes = new Map();
  const land = (id, patch) => {
    const at = list.findIndex(u => (u?._id ?? u?.id) === id);
    if (at >= 0) placements[at] = { _id: id, ...patch };
    else placements.push({ _id: id, ...patch });
    writes.set(id, { container: patch.system.container, well: patch.system.well });
  };
  for (const { id, item, prefer } of spilling) {
    // The bag it names FIRST, then its own kind, then the first with room, and
    // the well it was already in before any of them.
    const spot = houseIn(room, item, { prefer, preferWell: wellOf(item), kindFirst: false });
    if (spot === null) return refuse(REFUSALS.noRoom, { name: item.name ?? "" });
    // It stayed exactly where it was: nothing to write.
    if (spot.key === prefer && spot.well === wellOf(item)) continue;
    land(id, { system: patchFor(spot) });
  }
  for (const { id, item } of homeless) {
    const spot = houseIn(room, item);
    if (spot === null) {
      return refuse(placeBefore.get(id) === "bar" ? REFUSALS.noRoomForHolder : REFUSALS.noRoomToRemove,
        { name: item.name ?? "" });
    }
    land(id, { system: patchFor(spot) });
  }
  for (const { id, item, prefer } of displaced) {
    // **THE VACATED PANEL FIRST**, then kind, then the first with room - the
    // ring swapped off a finger goes back in the pouch it came out of.
    const spot = houseIn(room, { ...item, system: { ...sysOf(item), equipped: false } }, { prefer, kindFirst: false });
    if (spot === null) return refuse(REFUSALS.noRoomToRemove, { name: item.name ?? "" });
    land(id, { system: { equipped: false, ...patchFor(spot) } });
  }

  // 8. THE MASTER RULE. Everything above is a named case of it, and this is
  //    what catches the rest: a quantity that grew, a weight a GM raised, a
  //    move into a bag that was already full.
  const settled = next.map(item => {
    const id = idOf(item);
    if (!writes.has(id)) return item;
    return { ...item, system: { ...sysOf(item), equipped: false, ...writes.get(id) } };
  });
  const finalLedger = ledger(settled, base);
  const wasOver = overByKey(before);
  const nowOver = overByKey(finalLedger);
  for (const [key, n] of nowOver) {
    if (n <= (wasOver.get(key) ?? 0)) continue;
    const onlyCounts = changes.every(c => c.container === undefined
      && c.equipped === undefined && c.well === undefined);
    return refuse(onlyCounts ? REFUSALS.noRoomForMore : REFUSALS.noRoom);
  }
  return pass;
}

/**
 * A foreign thing dropped straight onto a tile of the paper doll: can what it
 * displaces be housed?
 *
 * The newcomer is not on the character yet, so `judge` has nothing to read;
 * this is the same question asked one step earlier.
 *
 * @param {Iterable<object>} items
 * @param {number} base
 * @param {object} newcomer          the document about to be created, worn
 * @param {{index?: number}} [options]  which tile of a capacity-2 slot was used
 * @returns {{ok: boolean, reason: string|null, data: object|null, placements: Array<{_id: string, system: object}>}}
 */
export function wearNew(items, base, newcomer, { index } = {}) {
  const all = things(items);
  const worn = { ...newcomer, system: { ...sysOf(newcomer), equipped: true, container: null } };
  const withIt = [...all, worn];
  const victims = displacedBy(worn, withIt, { index }).filter(v => idOf(v));
  // Measured with the victims out, exactly as `judge` does and for the same
  // reason: they are still equipped in `withIt`, so a ledger that kept them
  // would charge them nothing and then `houseIn` would charge them once more.
  const gone = new Set(victims.map(idOf));
  const room = roomFrom(ledger(withIt.filter(item => !gone.has(idOf(item))), base));
  const placements = [];
  for (const victim of victims) {
    const vid = idOf(victim);
    const spot = houseIn(room, { ...victim, system: { ...sysOf(victim), equipped: false } });
    if (spot === null) {
      return { ok: false, reason: REFUSALS.noRoomToRemove, data: { name: victim.name ?? "" }, placements: [] };
    }
    placements.push({ _id: vid, system: { equipped: false, ...patchFor(spot) } });
  }
  return { ok: true, reason: null, data: null, placements };
}

/* -------------------------------------------- */
/*  Two things changing places                   */
/* -------------------------------------------- */

/**
 * A THING PUT IN A NAMED WELL (the lead, 2026-09-20).
 *
 * The drop is laid down and looked at, exactly as a swap is: the claim goes
 * into the collection, `ledger` packs every panel as it always does, and the
 * placement holds only where the thing ended up **in the well it was sent
 * to**. A four-well suit dropped on well fourteen of a sixteen-well pack has
 * nowhere to lie from there, and saying so is the difference between a
 * control that explains itself and one that moves the thing somewhere else in
 * silence.
 *
 * `container` is the panel's key — `""` or null for the base pack — and the
 * caller has already asked `containersFor` whether the bag takes it at all,
 * so the refusal here is about the WELL and nothing else.
 *
 * @returns {{ok: boolean, reason: string|null, data: object|null, writes: Array<object>}}
 */
export function judgePlace(items, base, itemId, container, well) {
  const all = things(items);
  const item = all.find(i => idOf(i) === itemId) ?? null;
  const at = cleanWell(well);
  const no = (reason, data = null) => ({ ok: false, reason, data, writes: [] });
  if (!item || at === null) return no(REFUSALS.noRoomHere, { name: item?.name ?? "" });

  const key = container || "";
  const patch = { container: key === "" ? null : key, well: at };
  // **WHAT IS SIMULATED IS EXACTLY WHAT IS WRITTEN.** Forcing the thing
  // unworn here would approve a placement the write does not make, and a worn
  // thing has no well at all - so one that somehow reached this door is
  // refused rather than quietly placed.
  const next = all.map(row => (idOf(row) === itemId
    ? { ...row, system: { ...sysOf(row), ...patch } }
    : row));
  const landed = spotOf(ledger(next, base), itemId);
  if (!landed || landed.key !== key || landed.well !== at) {
    return no(REFUSALS.noRoomHere, { name: item.name ?? "" });
  }
  return { ok: true, reason: null, data: null, writes: [{ _id: itemId, system: patch }] };
}

/** The panel and well a thing stands in, off a ledger. Null where it is in none. */
function spotOf(led, id) {
  for (const panel of led.panels ?? []) {
    const place = (panel.places ?? []).find(p => p.id === id);
    if (place) return { key: panel.key, well: place.well };
  }
  return null;
}

/**
 * TWO THINGS CHANGE PLACES (the lead, 2026-09-20: *the function should work
 * like it does in the game*).
 *
 * A drop on an occupied well means *put this here* and *that goes where this
 * was*, exactly as WoW's own bags do — across two panels as readily as inside
 * one. **A twin is a MERGE and that rule wins** (D-741); the caller asks
 * `areTwins` first and never reaches this.
 *
 * **It is judged by laying it down and looking**, rather than by arithmetic
 * over run lengths: the two claims go into the collection, `ledger` packs
 * every panel as it always does, and the swap holds only where BOTH things
 * ended up exactly where they were sent. That is what refuses a one-well
 * thing and a three-well thing changing places in a bag with no gap to take
 * the difference — which cannot be done and has to be said rather than
 * half-done.
 *
 * @returns {{ok: boolean, reason: string|null, data: object|null, writes: Array<object>}}
 */
export function judgeSwap(items, base, aId, bId) {
  const all = things(items);
  const a = all.find(i => idOf(i) === aId) ?? null;
  const b = all.find(i => idOf(i) === bId) ?? null;
  const no = (reason, data = null) => ({ ok: false, reason, data, writes: [] });
  if (!a || !b || !aId || aId === bId) return no(REFUSALS.noSwap, { a: a?.name ?? "", b: b?.name ?? "" });

  const led = ledger(all, base);
  const from = spotOf(led, aId);
  const to = spotOf(led, bId);
  // One of them is worn, in the bar, with the mount or left over: there is no
  // pair of wells to exchange, and the caller's other branches own those.
  if (!from || !to) return no(REFUSALS.noSwap, { a: a.name ?? "", b: b.name ?? "" });

  // A counted container takes its own kind and nothing else (08 §11), and
  // *does not fit there* would name the wrong rule for a rope over a quiver.
  const holderOf = key => (key ? all.find(i => idOf(i) === key) : null);
  for (const [item, key] of [[a, to.key], [b, from.key]]) {
    const holder = holderOf(key);
    if (!holder) continue;
    if (!accepts(sysOf(holder).capacity ?? null, item)) {
      return no(REFUSALS.wrongKind, { name: holder.name ?? "", of: sysOf(holder).capacity?.of ?? "" });
    }
  }

  const patch = {
    [aId]: { container: to.key === "" ? null : to.key, well: to.well },
    [bId]: { container: from.key === "" ? null : from.key, well: from.well }
  };
  const next = all.map(item => {
    const change = patch[idOf(item)];
    return change ? { ...item, system: { ...sysOf(item), ...change } } : item;
  });
  const after = ledger(next, base);
  const landedA = spotOf(after, aId);
  const landedB = spotOf(after, bId);
  const held = (spot, want) => spot && spot.key === want.key && spot.well === want.well;
  if (!held(landedA, to) || !held(landedB, from)) {
    return no(REFUSALS.noSwap, { a: a.name ?? "", b: b.name ?? "" });
  }
  return {
    ok: true,
    reason: null,
    data: null,
    writes: [{ _id: aId, system: patch[aId] }, { _id: bId, system: patch[bId] }]
  };
}

/**
 * A delete, judged.
 *
 * **A worn container that still holds things is refused**, because deleting
 * it would spill its contents into a base pack that may not have room and
 * there would be nothing left to put them back in. A batch that deletes the
 * contents too passes.
 *
 * **A LOADED MOUNT WITH YOU IS REFUSED BY THE SAME SENTENCE**, and it needs
 * no case of its own: a **Carries** figure IS a capacity cell, so
 * `hasCapacityCell` answers true for the horse exactly as it does for the
 * backpack. `judge` says the same about stabling one (08 §11: *it is unloaded
 * before you leave it behind*), and a test pins both rather than leaving the
 * agreement to chance.
 */
export function judgeDelete(items, ids = []) {
  const going = new Set([...(ids ?? [])].filter(Boolean));
  if (!going.size) return { ok: true, reason: null, data: null };
  const all = things(items);
  for (const item of all) {
    const id = idOf(item);
    if (!going.has(id) || !hasCapacityCell(item) || sysOf(item).equipped !== true) continue;
    const inside = all.filter(o => !going.has(idOf(o)) && containerOf(o) === id);
    if (inside.length) {
      return { ok: false, reason: REFUSALS.deleteHolder, data: { name: item.name ?? "", n: inside.length } };
    }
  }
  return { ok: true, reason: null, data: null };
}

/* -------------------------------------------- */
/*  Stacks                                       */
/* -------------------------------------------- */

/**
 * The keys two twins may differ in and still be the same thing.
 *
 * Everything else in `system` is compared, which is deliberate: `offHand`,
 * `ammunition`, a chosen school, a Signature's spent uses and a coating's
 * numbers are all things that make two otherwise identical daggers different
 * daggers.
 *
 * **`well` is WHERE A THING IS, not what it is** (the lead, 2026-09-20), and
 * it belongs beside `container` for exactly the same reason: two bundles of
 * twenty arrows in wells 3 and 7 are one kind of thing sitting in two places,
 * and leaving it out of this list made every drop of one on the other refuse
 * itself as *not the same thing*.
 */
const STACK_IGNORES_SYSTEM = Object.freeze(["quantity", "container", "equipped", "well"]);

/** The document keys that are never part of what a thing IS. */
const STACK_IGNORES_DOC = Object.freeze(["_id", "id", "sort", "folder", "ownership", "_stats", "effects"]);

/** Flags that make a thing its own: a coating laid on it, a find the Forge built. */
const STACK_REFUSING_FLAGS = Object.freeze(["coating", "generated"]);

/** A stable JSON of a value, with object keys sorted, so two twins hash alike whatever order they were built in. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/**
 * What two things have to agree on to be twins, or null where a thing never
 * stacks at all.
 *
 * Three things refuse outright:
 *
 * - **No numeric `quantity`.** A suit has no such field and a sword's is
 *   null, and merging two swords into a quantity of two would be counting a
 *   thing the schema says is not counted.
 * - **A coating, or the Forge's own work.** 08 §13 says a coated weapon is
 *   still the weapon, so the numbers are derived off a FLAG — and two bundles
 *   of arrows, one of them poisoned, are not the same bundle. A generated
 *   find carries its whole base in its flags and re-forges off it (D-666).
 * - **Charges spent.** Two half-drunk waterskins are not one waterskin.
 *
 * @returns {string|null}
 */
export function stackKey(item) {
  if (!item) return null;
  // **A THING THAT IS NEVER CARRIED IS NEVER A TWIN** (O-138). A mount, a
  // vehicle and a working animal are gear items and `GearData.quantity` has
  // an initial of 1, so two Elwynn coursers hashed alike and a drop of one on
  // the other poured it into a *stack of two horses* - which 08 §15 does not
  // have and the bar could not draw: one mount is with you and the rest stand
  // in the Stable, individually. It is refused HERE rather than at the sheet's
  // door, because `judgeMerge`, `judgeSplit` and `#dropForeign`'s join all ask
  // this one question.
  if (isMount(item)) return null;
  const sys = sysOf(item);
  // `Number(null)` is 0 and 0 is finite, so a suit - whose schema has no
  // `quantity` at all - and a weapon that is not a bundle both have to be
  // refused on the VALUE being absent rather than on it failing to be a
  // number. Merging two swords into a quantity of two would be counting a
  // thing the schema says is not counted.
  if (sys.quantity === null || sys.quantity === undefined) return null;
  if (!Number.isFinite(Number(sys.quantity))) return null;

  const flags = item.flags?.["azeroth-rpg"] ?? {};
  for (const key of STACK_REFUSING_FLAGS) if (flags[key] !== null && flags[key] !== undefined) return null;

  const charges = sys.charges ?? null;
  const max = Number(charges?.max);
  if (Number.isFinite(max) && max > 0 && Number(charges?.value) !== max) return null;

  const rest = {};
  for (const [k, v] of Object.entries(sys)) if (!STACK_IGNORES_SYSTEM.includes(k)) rest[k] = v;
  const doc = {};
  for (const [k, v] of Object.entries(item)) {
    if (STACK_IGNORES_DOC.includes(k) || k === "system") continue;
    doc[k] = v;
  }
  return canonical({ ...doc, system: rest });
}

/** Whether two things are the same thing, so one may be poured into the other. */
export function areTwins(a, b) {
  const key = stackKey(a);
  return key !== null && key === stackKey(b);
}

/**
 * Pour one stack into another.
 *
 * A merge never costs the bags more in total — twenty arrows and five arrows
 * are one well together and two apart — but it may cost the TARGET's panel
 * more, so that panel is what is judged.
 *
 * @returns {{ok: boolean, reason: string|null, data: object|null, quantity: number|null}}
 */
export function judgeMerge(items, base, targetId, sourceId) {
  const all = things(items);
  const target = all.find(i => idOf(i) === targetId) ?? null;
  const source = all.find(i => idOf(i) === sourceId) ?? null;
  const no = (reason, data = null) => ({ ok: false, reason, data, quantity: null });
  if (!target || !source || targetId === sourceId) return no(REFUSALS.notTwins);
  if (!areTwins(target, source)) return no(REFUSALS.notTwins, { name: source.name ?? "" });

  const quantity = unitsOf(target) + unitsOf(source);
  const led = ledger(all, base);
  const key = placeOf(target, led);
  const panel = led.panels.find(p => p.key === key) ?? null;
  // Worn, in the bar or on the mount place: there is no well to overflow.
  if (!panel) return { ok: true, reason: null, data: null, quantity };

  const merged = { ...target, system: { ...sysOf(target), quantity } };
  const was = slotsIn(target, panel) + (placeOf(source, led) === key ? slotsIn(source, panel) : 0);
  const now = slotsIn(merged, panel);
  if (panel.used - was + now > panel.wells && now > was) return no(REFUSALS.noRoom, { name: target.name ?? "" });
  return { ok: true, reason: null, data: null, quantity };
}

/**
 * Take `n` off a stack into a new one.
 *
 * A split can only ever cost room — one well of twenty arrows becomes two
 * wells the moment five of them move — so it is judged against the panel the
 * stack is standing in.
 *
 * @returns {{ok, reason, data, quantity, split, panel}}
 */
export function judgeSplit(items, base, sourceId, n) {
  const all = things(items);
  const source = all.find(i => idOf(i) === sourceId) ?? null;
  const take = Math.trunc(Number(n));
  const no = (reason, data = null) => ({ ok: false, reason, data, quantity: null, split: null, panel: null });
  if (!source) return no(REFUSALS.badSplit);
  const held = unitsOf(source);
  if (!Number.isFinite(take) || take < 1 || take >= held) return no(REFUSALS.badSplit, { n: String(n) });
  if (stackKey(source) === null) return no(REFUSALS.notTwins, { name: source.name ?? "" });

  const led = ledger(all, base);
  const key = placeOf(source, led);
  const panel = led.panels.find(p => p.key === key) ?? null;
  const result = { ok: true, reason: null, data: null, quantity: held - take, split: take, panel: key };
  if (!panel) return result;

  const kept = { ...source, system: { ...sysOf(source), quantity: held - take } };
  const gone = { ...source, id: null, _id: null, system: { ...sysOf(source), quantity: take } };
  const now = slotsIn(kept, panel) + slotsIn(gone, panel);
  if (panel.used - slotsIn(source, panel) + now > panel.wells) return no(REFUSALS.noRoom, { name: source.name ?? "" });
  return result;
}

/* -------------------------------------------- */
/*  Making room                                  */
/* -------------------------------------------- */

/**
 * The writes that move what overflows into the room there is.
 *
 * Nothing is refused and nothing is deleted: a thing with nowhere to go stays
 * where it is and the panel keeps reading over, in words. The creator uses
 * this after its one big embed, and the Gear tab can offer it as a button.
 *
 * @returns {Array<{_id: string, system: {container: string|null, well: number}}>}
 */
export function arrange(items, base) {
  const all = things(items);
  const led = ledger(all, base);
  const byId = new Map(all.map(item => [idOf(item), item]));
  const room = roomFrom(led);
  const writes = [];

  for (const panel of room.panels) {
    // **WHAT WOULD NOT LIE DOWN**, which is exactly what the over row draws
    // and what the button says it will move. A panel with room left in the
    // wrong place has things here too, and moving them is the whole use of
    // the press.
    for (const id of [...panel.loose]) {
      const item = byId.get(id);
      if (!item) continue;
      // Out first, so the panel it came from is measured honestly, and never
      // back into the panel it is leaving.
      panel.used -= slotsIn(item, panel);
      const at = panel.itemIds.indexOf(id);
      if (at >= 0) panel.itemIds.splice(at, 1);
      const spot = houseIn(room, item, { skip: panel.key });
      if (spot === null) {
        // Nowhere better: put it back and leave the panel reading over.
        panel.used += slotsIn(item, panel);
        panel.itemIds.push(id);
        continue;
      }
      writes.push({ _id: id, system: patchFor(spot) });
    }
  }
  return writes;
}
