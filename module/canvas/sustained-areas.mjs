/**
 * AN AREA GOES WHEN ITS SPELL DOES (D-756; the lead's play-test, 2026-09-25).
 *
 * *Nothing deletes a spell's Region when its Sustain ends*: Consecration's
 * circle stood on the board after the Paladin dropped it, and a start-of-turn
 * tick reading it would have gone on striking. Six writers end a Sustain -
 * `castSpell` beginning one over the limit, `endSustain`, the sheet's Stop,
 * the turn's upkeep, and `workflows.mjs#endAllSustains` for a Critical Injury
 * and for 0 Health - and every one of them writes the caster's `sustaining`
 * flag. So this does not hook the six: it watches the FLAG, and asks
 * `rules/area-ticks.mjs#staleAreas` which Regions no longer stand. A timed area
 * (*Instant, 1 minute*) goes when its span is over, judged at every turn
 * boundary of the fight it went down in.
 *
 * **A CASTER WHO IS DOWN HOLDS NOTHING** (the review, M1): 0 Health is a
 * Critical Injury (06 §8, §9) and a Critical Injury ends a Sustain (05 §12).
 * `endAllSustains` writes that off on the client that wrote the Health, and
 * this reads it again whatever the flag says - off the caster, and off the
 * token the card recorded, which is the creature that dies when a WORLD actor
 * cast through an unlinked token (`isDown`, `staleIn`).
 *
 * **The active GM's client only** (`game.users.activeGM?.isSelf`): a Region is
 * deleted once, by one client, and a player's client sees it go. The animation
 * layer's loop ends with the Region by itself (D-729) - there is no second
 * door to close.
 *
 * **AND THE OTHER WAY: AN AREA TAKEN OFF BY HAND ENDS ITS SUSTAIN** (D-760; the
 * lead, 2026-09-29: *Deleting ends it*). A Region deleted by a person - a GM's
 * Delete, a player's own, a macro - ended nothing, so the caster went on paying
 * the upkeep for an area that was no longer there. `deleteRegion` now ends the
 * ONE Sustain whose cast the Region recorded, through `workflows.endSustain`
 * (the door the Spells tab's Stop uses), and never a Region THIS FILE deleted:
 * the sweep deletes with `SWEEP_DELETE` on the operation, which core hands to
 * every client's hook, so a Sustain ended by its flag cannot end twice and the
 * Region the end sweeps away cannot loop back. A Region that went with its
 * token (core deletes an attached area with it) or its scene ends nothing.
 *
 * Every pass is a hook handler, and a hook's rejection is an UNHANDLED one the
 * smoke test fails on, so each is caught and said once in the console.
 */

import { areaLapsed, firstEntry, hasAreaTick, joinFight, staleAreas } from "../rules/area-ticks.mjs";
// Difficult ground on a placed area (D-757): the law of what it lays and on whom,
// the cost it charges, and the talents that lay it.
import { DIFFICULT_BEHAVIOR, groundNow } from "../rules/area-ground.mjs";
import { DIFFICULT_COST } from "../rules/movement.mjs";
import { spellAreaFor } from "../rules/talent-effects.mjs";
// Whether what a queued pass writes is still in the world when the pass runs
// (the full-suite fix of D-757): a deleted scene's object keeps its Regions.
import { actorInWorld, regionInWorld, sceneInWorld } from "./in-world.mjs";

/** The flags scope a placed area carries (`dice/chat.mjs#regionFlagsFromCard`). */
const SCOPE = "azeroth-rpg";

/**
 * **THE SWEEP'S OWN DELETIONS SAY SO** (D-760): the operation option every
 * Region this file deletes carries, so the `deleteRegion` hook never reads one
 * of them as an area taken off by hand. Core passes an operation's own keys
 * through to every client's hook (14.367: the server strips only its own list -
 * `data`, `updates`, `ids`, `parent`, `parentUuid`, `pack`, `restoreDelta`,
 * `deleteAll`, `_result` - before it answers).
 */
export const SWEEP_DELETE = "azerothAreaSweep";

/**
 * The flags a placed area and what it lays keep for the movement phase
 * (D-757): a condition that holds *until it leaves* names its area, a rider
 * held *once it has started its turn there* is armed per token on the area,
 * a creature's first entry on a turn is remembered on the area, and the
 * Difficult-ground behavior the reconciler laid says so.
 */
export const LEAVES_FLAG = "leaves";
export const ARMED_FLAG = "armed";
export const ENTERED_FLAG = "entered";
export const GROUND_FLAG = "ground";

/**
 * Whether this client is the one that writes: the active GM's. The ONE copy
 * (the final review of D-757): `effects/area-strikes.mjs` reads it from here.
 */
export function isWriter() {
  return game.users?.activeGM?.isSelf === true;
}

/**
 * The world's clock, as `staleAreas` reads it: the time, and every STARTED
 * fight's round and turn by id - a fight that has not begun counts no rounds,
 * and one that has gone is absent, which is what ends an area placed in it.
 * The turn is what lets a timed area stand to the same point in the order ten
 * rounds on (`rules/area-ticks.mjs#areaLapsed`, the review's N3).
 */
export function worldClock() {
  const fights = {};
  const turns = {};
  for (const combat of game.combats ?? []) {
    if (!combat.started) continue;
    fights[combat.id] = combat.round ?? 0;
    turns[combat.id] = combat.turn ?? 0;
  }
  return { time: game.time?.worldTime ?? 0, fights, turns };
}

/** A placed area's record, off its flags, or null where it carries no cast. */
export function areaRecord(region) {
  const f = region?.flags?.[SCOPE] ?? {};
  if (!f.cast) return null;
  return {
    id: region.id,
    cast: f.cast,
    caster: f.caster ?? null,
    // The caster's token as the card recorded it (D-724): the creature whose
    // fall ends the Sustain when a world actor cast through an unlinked token.
    source: f.source ?? null,
    sustained: f.sustained === true,
    lasts: f.lasts ?? null,
    placedAt: f.placedAt ?? null,
    // An area whose span is the world's clock alone, fight or no fight (04's
    // Lightwell, D-779): never given a fight's clock by `clockAreasNow`.
    ...(f.worldClock === true ? { worldClock: true } : {})
  };
}

/**
 * **WHETHER A CREATURE IS DOWN** (the review, M1): at 0 Health, carrying core's
 * defeated status, or marked defeated on a started fight's tracker. 0 Health is
 * the Critical Injury that ends a Sustain (05 §12, 06 §8, §9), and a creature
 * the table has marked defeated is out of the fight whatever its Health says.
 * `workflows.mjs#endAllSustains` writes the flag off; this is what the sweep
 * and the tick read whatever the flag still says.
 *
 * The tracker's mark counts only on a combatant whose actor IS this one: a
 * world actor standing behind unlinked tokens is no combatant's, so one
 * goblin's defeat is never read as its template's.
 *
 * @param {Actor|null} actor
 */
export function isDown(actor) {
  if (!actor) return false;
  const health = actor.system?.health?.value;
  if (typeof health === "number" && health <= 0) return true;
  const defeated = globalThis.CONFIG?.specialStatusEffects?.DEFEATED ?? null;
  if (defeated && actor.statuses?.has?.(defeated)) return true;
  for (const combat of globalThis.game?.combats ?? []) {
    if (!combat?.started) continue;
    for (const c of combat.combatants ?? []) {
      if (c?.defeated === true && c.actor?.uuid === actor.uuid) return true;
    }
  }
  return false;
}

/**
 * Every caster's held casts, by uuid. A caster that cannot be found holds
 * nothing, and neither does one that is DOWN (M1): the belt to the flag's
 * braces, so a dead caster's area strikes nobody even before the sweep.
 */
export function heldCasts(uuids) {
  const held = new Map();
  for (const uuid of new Set(uuids)) {
    if (!uuid) continue;
    let actor = null;
    try {
      actor = fromUuidSync(uuid);
    } catch {
      actor = null;
    }
    const entries = actor && !isDown(actor) ? (actor.getFlag?.(SCOPE, "sustaining") ?? []) : [];
    held.set(uuid, new Set(entries.map(e => e?.cast).filter(Boolean)));
  }
  return held;
}

/**
 * Whether the token a placed area records as its caster's is down (M1). A
 * world actor cast from while an unlinked token stood for it holds the Sustain
 * on the WORLD actor (the card's `caster`, the review's S3) - and it is the
 * token's creature that falls. Only a token standing for the caster counts:
 * its actor id is the caster's own.
 */
function sourceDown(row, scene) {
  const ref = row?.source ?? null;
  if (!ref?.tokenId || !scene?.tokens) return false;
  if (ref.sceneId && ref.sceneId !== scene.id) return false;
  const token = scene.tokens.get(ref.tokenId) ?? null;
  const casterId = String(row.caster ?? "").split(".").pop();
  if (!token || !casterId || token.actorId !== casterId) return false;
  return isDown(token.actor);
}

/**
 * **WHICH OF A SCENE'S AREAS NO LONGER STAND**, by id: the pure judgement over
 * these rows, each marked `down` where the token its card recorded has fallen,
 * against every caster's held casts and the world's clock. The sweep and the
 * tick both ask this, so the two cannot disagree about a Region.
 *
 * @param {Scene} scene
 * @param {ReturnType<typeof areaRecord>[]} rows
 * @param {ReturnType<typeof worldClock>} [now]
 * @returns {string[]}
 */
export function staleIn(scene, rows, now = worldClock()) {
  const judged = rows.map(row => ({ ...row, down: sourceDown(row, scene) }));
  return staleAreas(judged, heldCasts(rows.map(row => row.caster)), now);
}

/**
 * **ONE PASS AT A TIME.** A Sustain's end writes the caster's flag, a turn
 * boundary sweeps the fight's scene and a Region's creation sweeps itself, and
 * two of those can be in flight at once on the one client that writes. Both
 * would find the same stale Region and both would delete it - and core answers
 * the second delete with *Region "…" does not exist!* in an error notification,
 * however the promise is caught. So every pass joins one queue; a failed pass
 * says so once and lets the next one run.
 *
 * **AND EVERY WRITE ASKS WHETHER ITS TARGET IS STILL IN THE WORLD** (the
 * full-suite fix of D-757, `canvas/in-world.mjs`), immediately before it is
 * sent: a pass runs after whatever queued it, a GM may delete the scene in
 * between, and the server refuses a write into a scene it no longer has.
 */
let QUEUE = Promise.resolve(0);
/** How many passes are queued or running: what `areasIdle` waits out. */
let OWED = 0;
function serial(task) {
  OWED += 1;
  const run = () => task().catch(err => {
    console.warn("azeroth-rpg | an area sweep did not finish", err);
    return 0;
  }).finally(() => {
    OWED -= 1;
  });
  QUEUE = QUEUE.then(run, run);
  return QUEUE;
}

/** How many passes are queued or running. */
export function areasOwed() {
  return OWED;
}

/**
 * **UNTIL THE QUEUE IS EMPTY** (the full-suite fix of D-757): every pass queued
 * before this, and every pass those passes queued in turn - a Region deleted
 * queues the leavers' sweep - has run. A batch deleting its scene waits here
 * first (`testing/fixtures.mjs#drainAreaWork`), so no pass it started reaches
 * the server after the scene has gone.
 */
export async function areasIdle() {
  while (OWED > 0) await QUEUE;
}

/**
 * **DELETE WHAT NO LONGER STANDS**, over the scenes given (every scene where
 * none is), narrowed to one caster's areas or to named Regions. Queued behind
 * any pass already running.
 *
 * @param {{scenes?: Scene[]|null, caster?: string|null, ids?: string[]|null}} [o]
 * @returns {Promise<number>} how many Regions went
 */
export function sweepAreas(o = {}) {
  return serial(() => sweepAreasNow(o));
}

/** The sweep itself; only ever run from the queue. */
async function sweepAreasNow({ scenes = null, caster = null, ids = null } = {}) {
  if (!isWriter()) return 0;
  const now = worldClock();
  let gone = 0;
  for (const scene of scenes ?? game.scenes ?? []) {
    // A scene deleted while this pass waited in the queue - or one this client
    // has asked to delete - has nothing to delete from, and asking the server
    // to would be an error on the console (`canvas/in-world.mjs`).
    if (!scene?.regions || !sceneInWorld(scene)) continue;
    const rows = [];
    for (const region of scene.regions) {
      const row = areaRecord(region);
      if (!row) continue;
      if (caster && row.caster !== caster) continue;
      if (ids && !ids.includes(row.id)) continue;
      rows.push(row);
    }
    if (!rows.length) continue;
    const stale = staleIn(scene, rows, now).filter(id => regionInWorld(scene.regions.get(id)));
    if (!stale.length || !sceneInWorld(scene)) continue;
    // Marked as the sweep's own (D-760): an area that goes because its Sustain
    // did is not an area taken off by hand, and ends nothing more.
    await scene.deleteEmbeddedDocuments("Region", stale, { [SWEEP_DELETE]: true });
    gone += stale.length;
  }
  return gone;
}

/**
 * **WHICH SUSTAIN AN AREA TAKEN OFF BY HAND ENDS** (D-760; the lead,
 * 2026-09-29: *Deleting ends it*): the caster and the cast, or null where the
 * deletion ends nothing -
 *
 * - **the sweep's own** (`SWEEP_DELETE` on the operation): the Sustain has
 *   already gone, or its caster is down, or its span is over;
 * - **a Region with no cast record** (a measured area, a totem's ground, one a
 *   GM drew) or one whose cast wrote no Sustain (an Instant's minute);
 * - **one that went with its scene**, which the world no longer holds;
 * - **one that went with its TOKEN**: core deletes an attached area when its
 *   token is deleted (14.367, `TokenDocument._onDeleteOperation`), clearing the
 *   live `attachment.token` and leaving the id in `_source`, so an attached
 *   area whose token the scene no longer holds went with it. The caster's
 *   creature leaving the board is not a hand taking the area away.
 *
 * Pure but for `sceneInWorld`, which asks `game.scenes`.
 *
 * @param {RegionDocument} region  the Region as its deletion handed it over
 * @param {object} [options]       the deletion's operation options
 * @returns {{caster: string, cast: string}|null}
 */
export function takenOffSustain(region, options = {}) {
  if (options?.[SWEEP_DELETE] === true) return null;
  const row = areaRecord(region);
  if (!row || row.sustained !== true || !row.caster) return null;
  const scene = region?.parent ?? null;
  if (!sceneInWorld(scene)) return null;
  const attached = region?._source?.attachment?.token ?? null;
  if (attached && scene?.tokens?.has?.(attached) !== true) return null;
  return { caster: row.caster, cast: row.cast };
}

/**
 * **END THE SUSTAIN AN AREA TAKEN OFF BY HAND HELD** (D-760), queued behind
 * every pass already running, on the active GM's client, through the ONE door
 * that ends one Sustain (`workflows.endSustain`, matched on the cast the Region
 * recorded) and only while the caster still holds it: a Sustain that another
 * door ended first is ended once. Its upkeep stops with it, and what it laid
 * is lifted, as any Sustain's end does.
 *
 * `game.system.azeroth.workflows` rather than an import, as `AzerothActor`
 * reaches `endAllSustains`: the workflows module reads `foundry` at import, and
 * this one is loaded by Vitest.
 *
 * @param {RegionDocument} region
 * @param {object} [options]  the deletion's operation options
 * @returns {Promise<object|null>} the Sustain entry ended, or null
 */
export function endTakenOffSustain(region, options = {}) {
  const taken = takenOffSustain(region, options);
  if (!taken) return Promise.resolve(null);
  return serial(async () => {
    if (!isWriter()) return null;
    const caster = actorOf(taken.caster);
    if (!caster || !actorInWorld(caster)) return null;
    if (!(caster.getFlag?.(SCOPE, "sustaining") ?? []).some(entry => entry?.cast === taken.cast)) return null;
    return game.system.azeroth.workflows.endSustain({ actor: caster, cast: taken.cast, notice: "AZEROTH.Area.SustainTakenOff" });
  }).then(ended => ended || null);
}

/**
 * **A TIMED AREA JOINS THE FIGHT IT STANDS IN** (the coating's rule, D-719): an
 * area laid before initiative has a minute and no rounds to count it in, so the
 * first fight on its scene gives it the fight's clock - less the whole rounds
 * the world's clock had already run on it, and one turn back, since it joins at
 * a turn's boundary before that turn is judged (`rules/area-ticks.mjs#joinFight`,
 * the review's N3). One that has already run out by the world's clock is left
 * for the sweep to take. Run only by the turn boundary's own pass
 * (`sweepFightAreas`), inside the one queue.
 *
 * @param {Combat} combat
 * @returns {Promise<number>} how many areas were given the fight's clock
 */
async function clockAreasNow(combat) {
  if (!isWriter() || !combat?.started) return 0;
  const scene = combat.scene ?? null;
  if (!scene?.regions || !sceneInWorld(scene)) return 0;
  const now = worldClock();
  const updates = [];
  for (const region of scene.regions) {
    const row = areaRecord(region);
    if (!row || !(Number(row.lasts?.rounds) > 0) || row.placedAt?.combatId || row.worldClock === true) continue;
    if (areaLapsed(row, now)) continue;
    const placedAt = joinFight(row.placedAt, { combatId: combat.id, round: combat.round ?? 0, turn: combat.turn ?? 0, time: now.time });
    updates.push({ _id: region.id, [`flags.${SCOPE}.placedAt`]: placedAt });
  }
  const clocked = updates.filter(u => regionInWorld(scene.regions.get(u._id)));
  if (clocked.length && sceneInWorld(scene)) await scene.updateEmbeddedDocuments("Region", clocked);
  return clocked.length;
}

/**
 * The turn boundary's pass (`AzerothCombat#_areaTicks`): clock the fight's
 * timed areas, then take away whatever no longer stands on its scene - as ONE
 * queued pass, so nothing lands between the two - and bring the scene's
 * Difficult ground into line with the clock (D-757: Ice Barrage's ends at the
 * end of the caster's next turn, Meteor's crater lands at the start of it).
 */
export function sweepFightAreas(combat) {
  return serial(async () => {
    if (!isWriter() || !combat?.scene) return 0;
    await clockAreasNow(combat);
    const gone = await sweepAreasNow({ scenes: [combat.scene] });
    await reconcileGroundNow({ scenes: [combat.scene] });
    return gone;
  });
}

/* -------------------------------------------- */
/*  The movement phase (D-757)                   */
/* -------------------------------------------- */

/** An actor off a uuid, or null where the uuid names nothing any more. */
export function actorOf(uuid) {
  if (!uuid) return null;
  try {
    return fromUuidSync(uuid) ?? null;
  } catch {
    return null;
  }
}

/**
 * The caster's token on this scene: the one the card recorded, else one of the
 * caster's own, else none - and a caster with no token still has a standing,
 * judged outside the board (`allyStandingOf`).
 *
 * **A token stands for a caster** when its actor IS the caster, or when the
 * caster is a WORLD actor and the token one of its unlinked copies (the rule
 * `dice/chat.mjs#casterTokenOf` records the card's `source` by): a GM who cast
 * from the sidebar sheet while the creature fought as an unlinked token holds
 * the Sustain on the world actor (the review, S3).
 *
 * @param {Scene} scene
 * @param {{sceneId?: string|null, tokenId?: string|null}|null} source  the card's record
 * @param {Actor|null} caster
 * @returns {TokenDocument|null}
 */
export function casterTokenOn(scene, source, caster) {
  if (!scene?.tokens) return null;
  const named = source?.tokenId && (!source.sceneId || source.sceneId === scene.id) ? scene.tokens.get(source.tokenId) ?? null : null;
  if (!caster) return named;
  const theirs = t => Boolean(t) && (t.actor?.uuid === caster.uuid || (!caster.isToken && t.actorId === caster.id));
  if (theirs(named)) return named;
  return scene.tokens.find(t => t.actor?.uuid === caster.uuid) ?? null;
}

/**
 * **THE DIFFICULT GROUND A PLACED AREA WANTS NOW**, as the behavior's own
 * fields, or null (`rules/area-ground.mjs#groundNow`). Only an area whose cast
 * succeeded carries a tick or a ground; one laid by hand off a failed card's
 * record carries neither and lays nothing. A talent's ground is the CASTER's
 * as they stand now - Consecrated Ground taken back takes it with it - and the
 * record's where the caster can no longer be read. An area placed before its
 * spell carried a ground reads the tick's own flag, which is what D-756 wrote.
 *
 * @param {RegionDocument} region
 * @param {ReturnType<typeof worldClock>} [now]
 * @returns {{who: string, kinds: string[], caster: string|null}|null}
 */
export function groundWanted(region, now = worldClock()) {
  const f = region?.flags?.[SCOPE] ?? {};
  if (!f.cast) return null;
  const areaGround = f.areaGround ?? (f.areaTick?.difficult === true ? { difficult: true, lasts: { rounds: null }, from: "" } : null);
  if (!areaGround && !hasAreaTick(f.areaTick)) return null;
  const caster = actorOf(f.caster);
  const talent = caster ? spellAreaFor(caster.takenTalents?.() ?? [], { name: f.spell?.name ?? "" }).ground : undefined;
  const spec = groundNow({ areaGround, ground: f.ground ?? null, placedAt: f.placedAt ?? null }, talent, now);
  return spec ? { who: spec.who, kinds: spec.kinds, caster: f.caster ?? null } : null;
}

/** Whether a laid behavior already says what is wanted. */
function sameGround(behavior, want) {
  const s = behavior?.system ?? {};
  const kinds = [...(s.kinds ?? [])].sort();
  return s.who === want.who && (s.caster ?? null) === (want.caster ?? null)
    && kinds.length === want.kinds.length && kinds.every((k, i) => k === want.kinds[i]);
}

/**
 * **LAY DIFFICULT GROUND ON THE AREAS THAT SAY SO, AND TAKE IT OFF THE ONES THAT
 * NO LONGER DO** (D-757). A player places a Region and only a GM may give one a
 * behavior (14.367, `common/documents/region.mjs#canCreate` and
 * `region-behavior.mjs#canCreate`), so the active GM's client lays exactly one
 * `difficultFor` behavior on each area whose record wants it, replaces one
 * that says something else, and removes the ones nobody wants - its own, the
 * ones flagged `ground`, and never a behavior a GM added by hand. Idempotent:
 * a second pass over an unchanged world writes nothing. Queued behind any pass
 * already running.
 *
 * @param {{scenes?: Scene[]|null, caster?: string|null}} [o]
 * @returns {Promise<number>} how many Regions were written
 */
export function reconcileGround(o = {}) {
  return serial(() => reconcileGroundNow(o));
}

/** The reconcile itself; only ever run from the queue. */
async function reconcileGroundNow({ scenes = null, caster = null } = {}) {
  if (!isWriter()) return 0;
  const now = worldClock();
  let written = 0;
  for (const scene of scenes ?? game.scenes ?? []) {
    if (!scene?.regions || !sceneInWorld(scene)) continue;
    for (const region of scene.regions) {
      const f = region.flags?.[SCOPE] ?? {};
      if (!f.cast) continue;
      if (caster && f.caster !== caster) continue;
      const want = groundWanted(region, now);
      const have = region.behaviors.filter(b => b.type === DIFFICULT_BEHAVIOR && b.getFlag?.(SCOPE, GROUND_FLAG) === true);
      if (want && have.length === 1 && sameGround(have[0], want)) continue;
      if (!want && !have.length) continue;
      // A Region a GM took away by hand while this pass awaited, or its whole
      // scene, is written to by nobody: core answers a write to a missing
      // document with an error however the promise is caught (the final review
      // of D-757). The question starts at the world, because a deleted scene's
      // object still holds its Regions (the full-suite fix).
      if (!regionInWorld(region)) continue;
      if (have.length) await region.deleteEmbeddedDocuments("RegionBehavior", have.map(b => b.id));
      if (want && !regionInWorld(region)) continue;
      if (want) {
        await region.createEmbeddedDocuments("RegionBehavior", [{
          type: DIFFICULT_BEHAVIOR,
          name: game.i18n.localize("AZEROTH.DifficultFor.Name"),
          system: { difficulties: { walk: DIFFICULT_COST, swim: DIFFICULT_COST }, who: want.who, kinds: want.kinds, caster: want.caster },
          flags: { [SCOPE]: { [GROUND_FLAG]: true } }
        }]);
      }
      written++;
    }
  }
  return written;
}

/**
 * **A CONDITION HELD *UNTIL IT LEAVES* GOES WHEN IT LEAVES** (D-757: Blackout's
 * Blinded, The Deep's three, Glacier's and Deep Winter's Slowed), and a rider
 * armed at a turn is disarmed when its creature is no longer inside, so walking
 * back in does not hand it back before the next turn there. Read off the area
 * the effect names and the token's DOCUMENT (`testInsideRegion`, 14.367),
 * never the interpolated position - the caller waits for the move to arrive.
 * An area that has gone takes what it laid with it.
 *
 * @param {{scenes?: Scene[]|null}} [o]
 * @returns {Promise<number>} how many effects were lifted
 */
export function sweepLeavers(o = {}) {
  return serial(() => sweepLeaversNow(o));
}

/** The sweep itself; only ever run from the queue. */
async function sweepLeaversNow({ scenes = null } = {}) {
  if (!isWriter()) return 0;
  let lifted = 0;
  for (const scene of scenes ?? game.scenes ?? []) {
    if (!scene?.tokens || !sceneInWorld(scene)) continue;
    for (const token of scene.tokens) {
      const actor = token.actor;
      if (!actor) continue;
      const stale = [];
      for (const effect of actor.effects ?? []) {
        const at = effect.flags?.[SCOPE]?.[LEAVES_FLAG] ?? null;
        if (!at?.regionId || (at.sceneId && at.sceneId !== scene.id)) continue;
        const region = scene.regions.get(at.regionId) ?? null;
        let inside = false;
        try {
          inside = Boolean(region) && token.testInsideRegion(region);
        } catch {
          inside = false;
        }
        if (!inside) stale.push(effect.id);
      }
      // A token, its scene or the effect itself gone while an earlier write
      // of this pass awaited: nothing to lift, and nothing to ask the server.
      const lift = stale.filter(id => actor.effects?.has?.(id));
      if (lift.length && actorInWorld(actor)) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", lift).catch(() => {});
        lifted += lift.length;
      }
    }
    for (const region of scene.regions) {
      const armed = region.flags?.[SCOPE]?.[ARMED_FLAG] ?? null;
      if (!armed || typeof armed !== "object") continue;
      const keep = {};
      for (const [tokenId, whens] of Object.entries(armed)) {
        const token = scene.tokens.get(tokenId) ?? null;
        let inside = false;
        try {
          inside = Boolean(token) && token.testInsideRegion(region);
        } catch {
          inside = false;
        }
        if (inside) keep[tokenId] = whens;
      }
      // A Region taken away while this pass waited, or its scene, is not
      // written to: the server answers a write to a missing document with an
      // error however the promise is caught.
      if (Object.keys(keep).length !== Object.keys(armed).length && regionInWorld(region)) {
        await region.update({ [`flags.${SCOPE}.${ARMED_FLAG}`]: foundry.data.operators.ForcedReplacement.create(keep) });
      }
    }
  }
  return lifted;
}

/**
 * **A RIDER BEGINS AT A TURN** (D-757): *an ally that starts its turn in the area
 * ... gains Ward 2 ... until it leaves*, *a creature that ends its turn there
 * has its Speed drop*. The area remembers which of its creatures have reached
 * that point, per token, and the aura door reads it (`effects/auras.mjs`).
 * Queued, on the active GM's client.
 *
 * @param {Scene} scene
 * @param {TokenDocument} token
 * @param {"turn"|"turnEnd"} when
 * @returns {Promise<number>} how many areas were armed
 */
export function armAreas(scene, token, when) {
  return serial(async () => {
    if (!isWriter() || !scene?.regions || !token || !sceneInWorld(scene)) return 0;
    let armed = 0;
    for (const region of scene.regions) {
      const f = region.flags?.[SCOPE] ?? {};
      if (!f.cast || !hasAreaTick(f.areaTick)) continue;
      if (!(f.areaTick.remains ?? []).some(r => r.when === when)) continue;
      let inside = false;
      try {
        inside = token.testInsideRegion(region);
      } catch {
        inside = false;
      }
      if (!inside) continue;
      const held = f[ARMED_FLAG]?.[token.id] ?? [];
      if (held.includes(when) || !regionInWorld(region)) continue;
      await region.update({ [`flags.${SCOPE}.${ARMED_FLAG}.${token.id}`]: [...held, when].sort() });
      armed++;
    }
    return armed;
  });
}

/**
 * **THE FIRST ENTRY ON A TURN, CLAIMED INSIDE THE QUEUE** (the final review of
 * D-757): Rain of Fire's *and again the first time it enters the area on a
 * turn* is read and written in ONE queued pass, so two moves judged at once
 * cannot each find the area un-entered and each strike. It was read by the
 * entry's judgement and written beside it outside the queue, where a sweep or
 * a second move could land between the two. `rules/area-ticks.mjs#firstEntry`
 * is the law. Queued, on the active GM's client.
 *
 * @param {RegionDocument} region
 * @param {string} tokenId
 * @param {string} turnKey  the fight's own `combat.round.turn`
 * @returns {Promise<boolean>} whether this entry is the first on the turn
 */
export function claimEntry(region, tokenId, turnKey) {
  return serial(async () => {
    if (!isWriter() || !regionInWorld(region)) return false;
    const next = firstEntry(region.flags?.[SCOPE]?.[ENTERED_FLAG] ?? {}, tokenId, turnKey);
    if (!next.first) return false;
    await region.update({ [`flags.${SCOPE}.${ENTERED_FLAG}.${tokenId}`]: turnKey });
    return true;
  }).then(first => first === true);
}

/**
 * **HOARFROST GROWS** (D-757): *at the start of each of your turns it grows by 5
 * feet in every direction* - the caster's areas whose descriptor carries
 * `grows`, a circle's radius and the `area` record widened together, so the
 * card's size, the tick and the Region agree. Queued, on the active GM's
 * client; a Region is moved by core's own update, and an attached one keeps
 * following its token.
 *
 * **The caster is the card's**: the actor it recorded, or - a world actor cast
 * through while an unlinked token stood for it (the review, S3) - the token the
 * card recorded as the source, which is the combatant whose turn it is.
 *
 * @param {Scene} scene
 * @param {Actor} caster
 * @param {TokenDocument|null} [token]  the caster's token on this scene
 * @returns {Promise<number>} how many areas grew
 */
export function growAreas(scene, caster, token = null) {
  return serial(async () => {
    if (!isWriter() || !scene?.regions || !caster || !sceneInWorld(scene)) return 0;
    const scale = scene.grid?.size && scene.grid?.distance ? scene.grid.size / scene.grid.distance : 1;
    const updates = [];
    for (const region of scene.regions) {
      const f = region.flags?.[SCOPE] ?? {};
      const feet = Number(f.areaTick?.grows) || 0;
      const source = f.source ?? null;
      const theirs = f.caster === caster.uuid
        || Boolean(token && source?.tokenId === token.id && (!source.sceneId || source.sceneId === scene.id));
      if (!f.cast || feet <= 0 || !theirs) continue;
      const shape = region.shapes?.[0] ?? null;
      if (shape?.type !== "circle") continue;
      const data = typeof shape.toObject === "function" ? shape.toObject() : { ...shape };
      const area = f.area && typeof f.area === "object" ? { ...f.area } : null;
      updates.push({
        _id: region.id,
        shapes: [{ ...data, radius: (Number(data.radius) || 0) + feet * scale }],
        ...(area ? { [`flags.${SCOPE}.area`]: { ...area, distanceFt: (Number(area.distanceFt) || 0) + feet } } : {})
      });
    }
    const grown = updates.filter(u => regionInWorld(scene.regions.get(u._id)));
    if (grown.length && sceneInWorld(scene)) await scene.updateEmbeddedDocuments("Region", grown);
    return grown.length;
  });
}

/** Never reject out of a hook: the queue has already said what failed. */
function quietly(promise) {
  return promise.catch(() => 0);
}

/**
 * The hooks. Registered at `init` beside the aura hooks; each acts on the
 * active GM's client alone.
 *
 * - **`updateActor`** with a system flag in the change: a Sustain may have
 *   ended, so that caster's areas are judged on every scene. A synthetic
 *   actor's change fires the same hook (`ActorDelta#_onUpdate`). **And with
 *   Health written to 0** (M1): the creature is down, so every area is judged -
 *   not only this actor's, because a world actor's area answers to the
 *   unlinked token that fell (`staleIn`).
 * - **`createRegion`**: an area placed from a card whose Sustain has already
 *   gone - a player's pick that landed after the drop - is taken straight off.
 * - **`deleteRegion`** (D-760): an area taken off by hand ends the one Sustain
 *   it recorded (`endTakenOffSustain`); the sweep's own deletions are marked
 *   and end nothing.
 * - **`deleteCombat`**: a fight's minute goes with it.
 * - **`deleteActor`** (S2): a caster deleted holds nothing, and neither does
 *   a token actor of it that is left with no base; every area is judged.
 * - **`deleteToken`** (S2): an unlinked caster's synthetic actor dies with its
 *   token, so that token's scene is judged.
 * - **`ready`**: once, over the whole world, for whatever went stale while no
 *   GM was here, and every area's Difficult ground brought into line (D-757).
 * - **`updateItem`** (D-757): a talent taken or given back moves the ground it
 *   lays on its spell's areas - Consecrated Ground's on the Paladin's
 *   Consecrations - so that caster's areas are reconciled.
 * - **`updateWorldTime`** (the final review of D-757): the world's clock is what
 *   a timed area laid OUTSIDE a fight counts its minute by, and what a short
 *   Difficult ground outside one (Ice Barrage's *until the end of your next
 *   turn*) ends by - and nothing else re-judged either while no fight's turn
 *   moved. Both passes go through the one queue.
 */
export function registerSustainedAreaHooks() {
  Hooks.on("updateActor", (actor, changed) => {
    if (!isWriter()) return;
    if (changed?.flags?.[SCOPE]) quietly(sweepAreas({ caster: actor.uuid }));
    if (foundry.utils.getProperty(changed ?? {}, "system.health.value") === 0) quietly(sweepAreas());
  });
  Hooks.on("createRegion", region => {
    if (!isWriter() || !region?.flags?.[SCOPE]?.cast) return;
    quietly(sweepAreas({ scenes: [region.parent], ids: [region.id] }));
    // A placed area whose spell, or whose caster's talent, makes it
    // Difficult ground takes its behavior on the GM's client (D-757).
    quietly(reconcileGround({ scenes: [region.parent] }));
  });
  Hooks.on("deleteRegion", (region, options) => {
    if (!isWriter()) return;
    quietly(endTakenOffSustain(region, options));
  });
  Hooks.on("updateItem", (item, changed) => {
    if (!isWriter() || item?.type !== "talent" || item.parent?.documentName !== "Actor") return;
    if (!foundry.utils.hasProperty(changed ?? {}, "system.taken")) return;
    quietly(reconcileGround({ caster: item.parent.uuid }));
  });
  Hooks.on("deleteCombat", () => {
    if (!isWriter()) return;
    quietly(sweepAreas());
  });
  Hooks.on("deleteActor", () => {
    if (!isWriter()) return;
    quietly(sweepAreas());
  });
  Hooks.on("deleteToken", token => {
    if (!isWriter() || !token?.parent) return;
    quietly(sweepAreas({ scenes: [token.parent] }));
  });
  Hooks.on("updateWorldTime", () => {
    if (!isWriter()) return;
    quietly(sweepAreas());
    quietly(reconcileGround());
  });
  Hooks.once("ready", () => {
    if (!isWriter()) return;
    quietly(sweepAreas());
    quietly(reconcileGround());
  });
}
