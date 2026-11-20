/**
 * **THE MOMENTUM POOLS A FIGHT DOES NOT EMPTY, AND WHAT DOES** (D-848, D-943). Pure:
 * no Foundry imports (CLAUDE.md §3).
 *
 * 05 §11's Momentum drains with the fight: it starts every fight at 0, a Critical
 * Injury and the Guard action cost all of it, and it is gone when the fight ends. Two
 * pools are kept instead, each emptied by its own short list of events and by
 * NOTHING else:
 *
 * | Pool | Emptied by | The lead |
 * |---|---|---|
 * | **Sand** (the Chronomancer) | a Short Rest, a Long Rest, the Hourglass leaving the Ranged slot | *"It should only drain on a short or long rest"*; *"swamp empties sand."* |
 * | **Runic Power** (the Death Knight) | a Long Rest | *Runic Power keeps out of fights*; **"Only on a Long Rest"**; a Critical Injury and Guard leave it alone (*"yes"*) |
 * | **Essence** (the Necromancer) | nothing | *"keep essence until spent"*; a Critical Injury and Guard leave it alone (the lead, 2026-11-18, *"Yes"*) |
 *
 * This was Sand's own list (`SAND_EMPTIED_BY`, `sandSurvives`, `sandAfter`), and the
 * plan's Phase 3 made it ONE pool-keyed rule so the Death Knight's pool reads the same
 * door at the same events: `fightStart`, `momentumAfter`, `lossOnGuard` and
 * `leaveFightPools` in `momentum.mjs`, and both rests in `rest.mjs`. `sand.mjs` keeps
 * its three names as this rule's Sand case.
 */

/** Every event a door may name. Anything a pool's list does not hold leaves it standing. */
export const KEPT_EVENTS = Object.freeze([
  "fightStart", "fightEnd", "roundEnd", "guard", "criticalInjury", "shortRest", "longRest", "hourglassOut"
]);

/** The events that EMPTY each kept pool, by the pool's key in `AZEROTH.momentumTypes`. */
export const EMPTIED_BY = Object.freeze({
  sand: Object.freeze(["shortRest", "longRest", "hourglassOut"]),
  runicPower: Object.freeze(["longRest"]),
  // No event empties it (the lead: *"keep essence until spent"*). Held through a Long Rest it risks 1 Undeath
  // (`essence.mjs#restExposure`), and spending is the only thing that lowers it.
  essence: Object.freeze([])
});

/** Whether a Momentum pool is one a fight does not empty. */
export function isKeptPool(name) {
  return typeof name === "string" && Object.hasOwn(EMPTIED_BY, name);
}

/** The events a kept pool survives: every event its list does not name. */
export function survivedBy(name) {
  return KEPT_EVENTS.filter(e => keptSurvives(name, e));
}

/**
 * Whether a kept pool survives this event untouched. A pool that is not kept answers
 * false, so a caller asking `isKeptPool(p) && keptSurvives(p, e)` and a caller asking
 * this alone agree.
 */
export function keptSurvives(name, event) {
  if (!isKeptPool(name)) return false;
  return !EMPTIED_BY[name].includes(event);
}

/** What a kept pool holds after an event: unchanged where it survives, 0 where it empties. */
export function keptAfter(name, value, event) {
  const v = Math.max(0, Math.trunc(Number(value)) || 0);
  return keptSurvives(name, event) ? v : 0;
}

/**
 * The pool updates that empty every kept pool a rest empties, in the shape
 * `AzerothActor#updatePool` writes: `{itemId, kind: "momentum", value: 0}`, and what
 * each held for the card. EVERY such pool, whatever the snapshot's clamped value says
 * (`sand.mjs#emptySandUpdates`' reason): `updatePool` skips a write that moves nothing.
 *
 * @param {Array<{itemId: string|null, kind: string, name: string, value: number}>} pools
 * @param {string} event  `shortRest` or `longRest`
 * @returns {{updates: object[], emptied: Record<string, number>}}
 */
export function emptiedAtRest(pools = [], event) {
  const updates = [];
  const emptied = {};
  for (const p of pools ?? []) {
    if (p?.kind !== "momentum" || !isKeptPool(p.name) || keptSurvives(p.name, event)) continue;
    updates.push({ itemId: p.itemId, kind: "momentum", value: 0 });
    emptied[p.name] = (emptied[p.name] ?? 0) + Math.max(0, Number(p.value) || 0);
  }
  return { updates, emptied };
}
