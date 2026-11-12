/**
 * Sand: the Chronomancer's Momentum pool, held in an Hourglass (02 §7, 07 §3,
 * 08 §9; D-848). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * The lead's rulings, verbatim:
 * - *"I like the mana and sand idea. the augment should be an Hourglass that
 *   contains the sand resource and is tied to the counter like other power and
 *   momentum resources"*;
 * - *"no hourglass no sand. Higher rarity augment loot can raise the sand cap
 *   higher than 5"*;
 * - *"common has no benefit. then +1 as rarity increases up to epic"*, the
 *   benefit being the *"sand cap"*;
 * - *"let's rework the sand draining. It should only drain on a short or long
 *   rest"*.
 *
 * **THE GATE DEFAULTS CLOSED.** `sandCap(null)` is 0: without an Hourglass in
 * the Ranged slot there is no pool to gain into, so every gain clamps to 0 and
 * nothing has to remember to check. A Legendary Hourglass holds 8 (the
 * orchestrator's reading of *"up to epic"*, recorded in D0).
 *
 * **WHAT EMPTIES IT, AND NOTHING ELSE** (`SAND_EMPTIED_BY`): a finished Short
 * Rest, a finished Long Rest, and the Hourglass leaving the Ranged slot. Not the
 * Warrior-style round-end drain, not a fight's start or end, and - the
 * orchestrator's literal reading of *"only"*, open for the lead as O-259 - not
 * 05 §11's Guard or Critical Injury either. `momentum.mjs` and `rest.mjs` read
 * `sandSurvives` rather than restating the list.
 *
 * **WHAT FILLS IT** (02 §7's Sand paragraph, the drafts' section 1): the two
 * triggers every Momentum pool has (`momentum.mjs#hitGain`, +1 on a hit with an
 * Attack Test and +1 more at SL 2), plus the class's own - +1 when a spell of
 * yours hits a creature and +1 more at SL 2, and +1 when a creature fails a
 * Resilience Test against a spell or feature of yours, once a cast. Each
 * branch's builder is a talent row (Phase 5), never a constant here.
 */

import { augmentOf } from "./augments.mjs";

/** The pool's key in `AZEROTH.momentumTypes`. */
export const SAND = "sand";

/** The Augment category that holds it (07 §3, `augments.mjs`). */
export const HOURGLASS = "hourglass";

/**
 * 08 §9's cap by rarity: Common 5, then +1 a step up to Epic 8 (the lead), and
 * a Legendary 8 (reading). A rarity this table lacks is read as Common: an
 * Hourglass with no rarity stamped is the 4s shop glass.
 */
export const SAND_CAP_BY_RARITY = Object.freeze({
  common: 5, uncommon: 6, rare: 7, epic: 8, legendary: 8
});

/** The cap with no Hourglass in the slot: none. */
export const NO_HOURGLASS_CAP = 0;

/**
 * The cap an Hourglass gives, or 0 with none.
 *
 * @param {{system?: {rarity?: string}, rarity?: string}|null} hourglass  the
 *   equipped Hourglass (an item, its system, or a snapshot), or null
 * @returns {number}
 */
export function sandCap(hourglass) {
  if (!hourglass) return NO_HOURGLASS_CAP;
  const rarity = String(hourglass.system?.rarity ?? hourglass.rarity ?? "common").toLowerCase();
  return SAND_CAP_BY_RARITY[rarity] ?? SAND_CAP_BY_RARITY.common;
}

/** Whether an item is an Hourglass Augment, off its derived or its readable shape. */
export function isHourglass(item) {
  if (!item) return false;
  const derived = item.system?.augment ?? null;
  if (derived) return derived.category === HOURGLASS;
  return augmentOf(item)?.category === HOURGLASS;
}

/**
 * The Hourglass in the Ranged slot, out of everything carried: the first
 * EQUIPPED one, ordered by id so two (a world from before D-850) never swap
 * between preparations (CLAUDE.md §15). Null with none.
 *
 * @param {Iterable<{id?: string, system?: object}>} items
 */
export function equippedHourglass(items = []) {
  const held = [...(items ?? [])].filter(i => i?.system?.equipped === true && isHourglass(i));
  held.sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));
  return held[0] ?? null;
}

/**
 * **THE HOURGLASS THE PAPER DOLL'S RANGED TILE SHOWS** (the 2a review's should-fix, stage 2b):
 * the cap reads the one thing the Ranged slot holds (`rules/worn.mjs#figureSlots`), so the Sand
 * a sheet shows and the glass on the tile can never disagree - a launcher standing in the slot
 * beside a stale Hourglass (a world from before D-850) holds no Sand. Null with none.
 *
 * @param {{ranged?: object|null, rangedKind?: string|null}|null} figure  `figureSlots(items)`
 */
export function hourglassOnTile(figure) {
  const held = figure?.rangedKind === "augment" ? (figure.ranged ?? null) : null;
  return held && isHourglass(held) ? held : null;
}

/**
 * The events that EMPTY the pool, and the ones that do not. Keyed by the word
 * a door passes; anything not listed leaves the Sand as it stands.
 */
export const SAND_EMPTIED_BY = Object.freeze(["shortRest", "longRest", "hourglassOut"]);

/** The events 05 §11 and 02 §7 apply to other Momentum and that Sand survives. */
export const SAND_SURVIVES = Object.freeze(["fightStart", "fightEnd", "roundEnd", "guard", "criticalInjury"]);

/** Whether Sand survives this event untouched. */
export function sandSurvives(event) {
  return !SAND_EMPTIED_BY.includes(event);
}

/** What the pool holds after an event. */
export function sandAfter(value, event) {
  const v = Math.max(0, Math.trunc(Number(value)) || 0);
  return sandSurvives(event) ? v : 0;
}

/**
 * The class's own gain for ONE cast (02 §7): +1 when the spell hits a creature
 * and +1 more at SL 2 or better, and +1 when a creature fails a Resilience Test
 * against it, once a cast however many fail. The hit gain is read once a cast as
 * well: the Casting Test is one roll (the orchestrator's reading, D-863).
 *
 * @param {{hit?: boolean, sl?: number, failedResilience?: boolean}} o
 * @returns {number}
 */
export function sandFromCast({ hit = false, sl = 0, failedResilience = false } = {}) {
  let gain = 0;
  if (hit) gain += 1 + ((Math.trunc(Number(sl)) || 0) >= 2 ? 1 : 0);
  if (failedResilience) gain += 1;
  return gain;
}

/**
 * Sand after a gain, clamped to the cap. With no Hourglass the cap is 0 and so
 * is the result: *"no hourglass no sand"*.
 *
 * @param {number} value
 * @param {number} amount
 * @param {number} cap  `sandCap(equippedHourglass(items))`
 */
export function gainSand(value, amount, cap) {
  const c = Math.max(0, Math.trunc(Number(cap)) || 0);
  const v = Math.max(0, Math.trunc(Number(value)) || 0);
  const a = Math.max(0, Math.trunc(Number(amount)) || 0);
  return Math.min(c, v + a);
}

/**
 * Whether an item write takes an Hourglass OUT of the Ranged slot: it was
 * equipped and the write unequips it. The door that sees this empties the
 * Sand, so re-equipping gives nothing back (the plan's Phase 3).
 *
 * @param {object} item      the item as it stands before the write
 * @param {object} changes   the write: `{system: {equipped: false}}`, its flat
 *   `{"system.equipped": false}`, or the system part alone `{equipped: false}`
 */
export function hourglassLeaves(item, changes = {}) {
  if (!isHourglass(item) || item?.system?.equipped !== true) return false;
  const c = changes ?? {};
  const equipped = Object.hasOwn(c, "system.equipped") ? c["system.equipped"]
    : (c.system && Object.hasOwn(c.system, "equipped")) ? c.system.equipped
      : Object.hasOwn(c, "equipped") ? c.equipped : undefined;
  return equipped === false;
}

/**
 * The pool updates that empty every Sand pool in a snapshot, in the shape
 * `AzerothActor#updatePool` writes: `{itemId, kind: "momentum", value: 0}`.
 * The rests and the Hourglass door share it.
 *
 * **EVERY Sand pool, whatever the snapshot's value says.** The snapshot's value
 * is CLAMPED to the derived cap, and with the Hourglass already out of the slot
 * the cap is 0 - so a filter on `value > 0` would skip the very pool whose
 * STORED Sand has to go, and a re-equip would hand it back. `updatePool`
 * compares against the stored value and skips a write that moves nothing.
 *
 * @param {Array<{itemId: string|null, kind: string, name: string, value: number}>} pools
 */
export function emptySandUpdates(pools = []) {
  return (pools ?? [])
    .filter(p => p?.kind === "momentum" && p.name === SAND)
    .map(p => ({ itemId: p.itemId, kind: "momentum", value: 0 }));
}
