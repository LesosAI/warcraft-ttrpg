/**
 * CUES ARE EVENTS; LOOPS ARE STATE (D-729).
 *
 * That one sentence is the whole design, and everything awkward about
 * animating a tabletop falls out of it:
 *
 *  - **A cue fires once, on the client that saw the record arrive.** Every
 *    client runs the same hook, reads the same card, asks the same pure law
 *    and plays it for itself, with every section `.locally()`. Nothing crosses
 *    the socket, so a card the chat selector hid for one reader is not
 *    announced to them by an explosion somebody else's client pushed.
 *  - **A loop is not started and stopped; it is RECONCILED.** Each client
 *    works out, from the world as it stands, which loops the world implies
 *    (`loopsFor`), compares that with what it is playing, ends what is no
 *    longer wanted and plays what is missing. So a Sustain dropped by any of
 *    its five paths, an effect deleted or expired, a Region deleted, a token
 *    deleted and a scene changed all end the loop **with no code path of their
 *    own**. There is no `endAnimation` anywhere in this system, and that is
 *    deliberate: every one of those endings would have been a place to forget.
 *
 * The key is built from the world (`azeroth-rpg:loop:<binding>:<cast>:<scene>:
 * <anchors>`), so every client computes the SAME key - which is what lets a
 * GM's Stop hold on every screen (D-730) and what makes a recast, with its own
 * `cast`, show again.
 *
 * ## Two things that will bite a reader of this file
 *
 *  - **Nothing plays before `sequencerEffectManagerReady`.** Sequencer tears
 *    down every visible effect 100-450 ms after `canvasReady` (see
 *    `availability.mjs`), so anything played in that window is destroyed in
 *    silence. The settle gate is not an optimisation.
 *  - **Never `console.error` in a hook handler.** The smoke spec counts
 *    console errors and fails the world load on one. Every handler here sits
 *    in a `try` and warns.
 */

import { loopsFor, plan, pruneKeys, visibleLoops } from "../rules/animation.mjs";
import * as tables from "../rules/animation-table.mjs";
import { animationAvailability, isSettled, loopsOn, setSettled } from "./availability.mjs";
import { SequencerPlayer, warn } from "./player.mjs";
import {
  cardRecord, effectRecord, factsFor, markPrivacySeeded, notePrivacy, privateCasts,
  regionRecord, resistCueRecord, stateSnapshot
} from "./records.mjs";
import {
  animationHidden, animationStops, setAnimationHidden, setAnimationStops
} from "../settings.mjs";
import { openAnimations } from "../applications/animations.mjs";
import { RecordingPlayer } from "../testing/animation-recorder.mjs";

/** How long a loop may be "being played" before the reconciler tries again. */
const PENDING_MS = 5000;

/** How long after `canvasReady` the settle gate opens on its own. */
const SETTLE_FALLBACK_MS = 4000;

/**
 * How many times a loop whose every section refuses is re-asked before it is
 * given up on.
 *
 * Without a ceiling, one asset renamed by a library update is a warning every
 * five seconds for the life of the world: nothing enters Sequencer's manager,
 * so the key never counts as playing, and the `PENDING_MS` lapse re-asks for
 * ever. Three is enough for a transient (a texture that was not ready, a
 * document that arrived a tick late) and small enough that a real fault says
 * so once and stops.
 */
const MAX_PLAY_ATTEMPTS = 3;

/** The thing that touches Sequencer. A test swaps in a recorder. */
let player = new SequencerPlayer();

/** Loops whose `play()` has been asked for and not yet seen in the manager. */
const pending = new Map();

/** Loops whose `play()` built nothing, by key, and how many times. */
const failures = new Map();

/** Resilience Tests already cued, by the id of the card that rolled them. */
const seenResists = new Set();

/** Whether chat has been read for what it already holds. */
let chatSeeded = false;

/** The last set of loops the reconciler announced, so it announces a CHANGE. */
let announced = null;

/** Reasons the layer has already explained to the console, said once each. */
const explained = new Set();

/** The `canvasReady` fallback, cleared when the canvas goes. */
let settleTimer = null;

/* ------------------------------------------------------------------ */
/*  Cues                                                               */
/* ------------------------------------------------------------------ */

/**
 * Play what one completed action implies on THIS screen, or nothing.
 *
 * Every refusal is the law's (`plan` answers a skip code), so the reasons live
 * in one place and a Quench test can assert the word rather than the silence.
 */
function playCueFor(record) {
  if (!record) return null;
  const availability = animationAvailability();
  if (!availability.ok) {
    // **A SILENCE WITH NO WORD FOR IT WAS THE ONE PATH LEFT.** The settle gate
    // is shut for up to four seconds after a canvas is ready, so a GM who
    // reloads mid-fight and rolls at once got no picture and no reason; the
    // same for a world that raised the effect permission. The refusal is
    // recorded like any other, prefixed so it is never mistaken for one of
    // `SKIPS` - those are the LAW's words and this is the client's.
    player.noteSkip?.(`unavailable:${availability.reason}`, record);
    explainOnce(availability.reason);
    return null;
  }
  const { skip, steps } = plan(record, factsFor(record));
  if (skip || !steps.length) {
    // THE WORD, NOT THE SILENCE. `SKIPS` is a vocabulary the law answers with
    // and a test asserts on, and a cue that played nothing is otherwise
    // indistinguishable from a cue that was never asked for. Only the
    // recorder implements this; the real player has nowhere to put it.
    player.noteSkip?.(skip ?? "no-anchor", record);
    return null;
  }
  return player.playCue(steps);
}

/**
 * Say why nothing is playing, ONCE per reason for the life of the client.
 *
 * The stop door prints the same sentence on its own face, which is the surface
 * a reader is meant to find; this is for the reader who does not think to open
 * it. Once, because a fight posts a card every few seconds.
 */
function explainOnce(reason) {
  if (!reason || explained.has(reason)) return;
  explained.add(reason);
  warn(`nothing is playing on this screen (${reason}); the roll, the cost and the card are unaffected`);
}

/**
 * A card just posted: an attack or a spell. Anything else is not ours.
 *
 * **A CARD THAT ARRIVES ALREADY CARRYING RESIST RECORDS HAS THEM COUNTED AS
 * SEEN.** A spell card is normally created bare and written to later, but an
 * import, a copied message or a restored backup lands whole - and without this
 * the FIRST unrelated update to it would cue its entire history at once.
 * `seedResists` runs at `ready` and cannot see a card made after it.
 *
 * **AND ITS PRIVACY IS NOTED BEFORE ANYTHING ELSE** (D-729): a cast whose card
 * this client may not read must not stand a loop on the board where the card
 * itself was hidden.
 */
function onChatMessage(message) {
  seedResistsOf(message);
  notePrivacy(message);
  playCueFor(cardRecord(message));
}

/**
 * A card was written to.
 *
 * **The `changed` argument is not read.** A resist record is written by dotted
 * path from one client and expanded by core before it reaches here, and the
 * shape of that diff is not worth depending on; the message itself is the
 * record of what is true, and `seenResists` - seeded from the whole of chat on
 * `ready` - is what keeps history from replaying and a re-render from cueing
 * twice. A Test that is re-rolled writes a NEW `resultId` (D-726, latest wins)
 * and cues again, which is right: the table accepted the second result.
 */
function onChatMessageUpdated(message) {
  const flags = message?.flags?.["azeroth-rpg"] ?? {};
  if (flags.kind !== "spell") return;
  for (const entry of Object.values(flags.resists ?? {})) {
    if (!entry?.resultId || seenResists.has(entry.resultId)) continue;
    seenResists.add(entry.resultId);
    playCueFor(resistCueRecord(message, entry));
  }
}

/** One card's records counted as seen, so they are never cued as new. */
function seedResistsOf(message) {
  const flags = message?.flags?.["azeroth-rpg"] ?? {};
  if (flags.kind !== "spell") return;
  for (const entry of Object.values(flags.resists ?? {})) {
    if (entry?.resultId) seenResists.add(entry.resultId);
  }
}

/**
 * ONE WALK OF CHAT, for both things a card tells this client: which Resilience
 * Tests it has already recorded, and whether this reader may read it at all
 * (D-729). Two passes over a session's log would be two passes for no reason.
 *
 * **CALLED AT `ready` AND AGAIN AT THE SETTLE GATE**, and it walks once. `ready`
 * is where chat is certainly there; `sequencerEffectManagerReady` is where the
 * first reconcile that can actually PLAY anything happens, and the two are not
 * ordered by anything this system controls - Sequencer's own hook is a
 * `setTimeout` off `canvasReady`, which may land either side of `ready`. The
 * privacy set guards itself besides (`records.mjs#privateCasts`), so the
 * seeding cannot be missed; this is what keeps it to one walk.
 */
function seedFromChat() {
  if (chatSeeded || !game.messages) return;
  chatSeeded = true;
  for (const message of game.messages.contents) {
    seedResistsOf(message);
    notePrivacy(message);
  }
  // The walk above did the privacy half too, so the set must not walk again.
  markPrivacySeeded();
}

/* ------------------------------------------------------------------ */
/*  Loops                                                              */
/* ------------------------------------------------------------------ */

/**
 * Everything the world implies, and the part of it this screen should be
 * playing.
 *
 * Both halves are wanted: the stop door lists what EXISTS - a stopped loop is
 * still a row, saying who stopped it - while only what `visibleLoops` returns
 * is played. Computing them together is what lets the window be handed the
 * answer rather than walking the world a second time.
 */
export function loopsNow(state = stateSnapshot()) {
  if (!animationAvailability().ok) return { loops: [], wanted: [] };
  const loops = loopsFor(state);
  return {
    loops,
    wanted: visibleLoops(loops, {
      stops: animationStops(),
      hidden: animationHidden(),
      loopsOn: loopsOn(),
      // **A CAST THIS CLIENT MAY NOT READ STANDS NO PICTURE** (D-729). The
      // world state says a Sustain is held; it does not say the roll that
      // began it was public.
      privateCasts: privateCasts()
    })
  };
}

/** The loops this screen should be playing right now. */
export function wantedLoops(state = stateSnapshot()) {
  return loopsNow(state).wanted;
}

/** What a reconcile amounted to, so the next one can tell it apart. */
function signatureOf(loops, wanted) {
  return `${loops.map(l => `${l.key}|${l.hash}`).join(",")}#${wanted.map(l => l.key).join(",")}`;
}

/**
 * END WHAT IS NO LONGER WANTED, PLAY WHAT IS MISSING.
 *
 * A loop whose HASH has moved - a Region dragged, a table row edited - is
 * ended and replayed in place rather than left standing where it was.
 *
 * **THE HOOK ANNOUNCES A CHANGE, NOT A PASS** (unless a caller asks). A token
 * dragged across the board fires this seven times a second, and the stop door
 * listens: an unconditional hook meant seven ApplicationV2 re-renders a second
 * of a list that had not moved, each one walking every actor and every scene
 * token a second time. So the hook fires only when what the world implies -
 * or what this screen may play of it - has actually changed, and it CARRIES
 * both lists so the window never recomputes them. `force` is for a caller that
 * wants the hook whatever happened: `game.system.azeroth.animations.director
 * .reconcile()` does, because a test waiting on the hook must not hang on a
 * pass that changed nothing.
 *
 * @param {{force?: boolean}} [options]
 * @returns {Array<object>}  the loops that should be playing
 */
export function reconcileNow({ force = false } = {}) {
  let wanted = [];
  let loops = [];
  try {
    ({ loops, wanted } = loopsNow());
    const playing = player.activeLoops();
    const byKey = new Map(wanted.map(loop => [loop.key, loop]));

    for (const [key, hash] of playing) {
      const loop = byKey.get(key);
      if (loop && loop.hash === hash) continue;
      player.endLoop(key);
      playing.delete(key);
      pending.delete(key);
      // A recipe that has MOVED deserves a fresh hearing: a loop given up on
      // for an asset that no longer resolved may resolve under a new one.
      if (loop) failures.delete(key);
    }

    // A key nobody wants any more is a key nothing will ever clear, and the
    // two maps would grow for as long as the world ran.
    for (const key of [...pending.keys()]) if (!byKey.has(key)) pending.delete(key);
    for (const key of [...failures.keys()]) if (!byKey.has(key)) failures.delete(key);

    const now = Date.now();
    for (const loop of wanted) {
      if (playing.has(loop.key)) { pending.delete(loop.key); failures.delete(loop.key); continue; }
      // **GIVEN UP ON.** Nothing entered the manager, so the key never counts
      // as playing and the lapse below would re-ask for ever: one asset
      // renamed by a library update is a warning every five seconds for the
      // life of the world.
      if ((failures.get(loop.key) ?? 0) >= MAX_PLAY_ATTEMPTS) continue;
      // A persistent `play()` is not awaited (it would resolve when the loop
      // ended), so the manager does not hold it the instant this returns. The
      // mark is what stops the next reconcile - 150 ms later - playing a
      // second copy, and it lapses so a play that failed is retried.
      const asked = pending.get(loop.key);
      if (asked && now - asked < PENDING_MS) continue;
      pending.set(loop.key, now);
      if (player.playLoop(loop) === null) noteFailure(loop);
    }
  } catch (err) {
    warn(`reconcile: ${err?.message ?? err}`);
  }

  const signature = signatureOf(loops, wanted);
  if (force || signature !== announced) {
    announced = signature;
    Hooks.callAll("azerothAnimationsReconciled", wanted, loops);
  }
  return wanted;
}

/** One loop built nothing; count it, and say so ONCE when it is given up on. */
function noteFailure(loop) {
  const count = (failures.get(loop.key) ?? 0) + 1;
  failures.set(loop.key, count);
  if (count < MAX_PLAY_ATTEMPTS) return;
  const why = player.lastLoopRefusal ?? "no layer of it could be built";
  warn(`${loop.identifier ?? loop.name ?? "a loop"} (${loop.key}): ${why}; it will not be tried again`);
}

/** The debounced door every hook uses: a fight moves many documents at once. */
const reconcileSoon = foundry.utils.debounce(() => reconcileNow(), 150);

/* ------------------------------------------------------------------ */
/*  Pruning                                                            */
/* ------------------------------------------------------------------ */

/** The `cast` a loop key names. See the file header for the key's shape. */
function keyCast(key) {
  const parts = String(key ?? "").split(":");
  return parts.length > 3 ? parts[3] : null;
}

/** The scene a loop key names. */
function keyScene(key) {
  const parts = String(key ?? "").split(":");
  return parts.length > 4 ? parts[4] : null;
}

/**
 * EVERY CAST THE WORLD STILL HOLDS, on any scene.
 *
 * A stop must not be pruned because the GM is looking at another board - the
 * loop is still running on the players' screens - so this asks the question
 * the snapshot cannot: is this cast held by a Sustain, worn as an effect or
 * marked on a Region ANYWHERE?
 */
function liveCasts() {
  const casts = new Set();
  const seen = new Set();
  const carriers = [];
  for (const actor of game.actors ?? []) carriers.push(actor);
  for (const scene of game.scenes ?? []) {
    for (const region of scene.regions ?? []) {
      const cast = region.flags?.["azeroth-rpg"]?.cast;
      if (cast) casts.add(cast);
    }
    for (const token of scene.tokens ?? []) if (token.actor) carriers.push(token.actor);
  }
  for (const actor of carriers) {
    if (!actor || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    for (const entry of actor.getFlag?.("azeroth-rpg", "sustaining") ?? []) {
      if (entry?.cast) casts.add(entry.cast);
    }
    for (const effect of actor.effects ?? []) {
      const cast = effect.flags?.["azeroth-rpg"]?.cast;
      if (cast) casts.add(cast);
    }
  }
  return casts;
}

/**
 * Take the dead keys out of both maps.
 *
 * Without it the two settings grow for as long as the world runs: every stop a
 * GM ever pressed and every hide a player ever pressed would still be in the
 * world's Settings collection a year later.
 *
 * The world map is the ACTIVE GM's to write (a player cannot write a world
 * setting at all); the hidden map is each client's own.
 */
export async function pruneAnimationKeys() {
  try {
    const stops = animationStops();
    const hidden = animationHidden();
    // NOTHING TO PRUNE IS THE COMMON CASE, and `liveCasts` walks every scene
    // and every actor. Asking first is what keeps this free during a fight.
    if (!Object.keys(stops).length && !Object.keys(hidden).length) return;

    const casts = liveCasts();
    const known = new Set((game.scenes ?? []).map(s => s.id));
    const keep = map => Object.keys(map).filter(key => casts.has(keyCast(key)));

    if (game.users?.activeGM?.isSelf) {
      const kept = keep(stops);
      if (kept.length !== Object.keys(stops).length) await setAnimationStops(pruneKeys(stops, kept));
    }
    // A hide for a scene this client has never heard of is left alone: it is
    // not proof the loop is gone, only that the reader cannot see the board.
    const keptHidden = Object.keys(hidden)
      .filter(key => casts.has(keyCast(key)) || !known.has(keyScene(key)));
    if (keptHidden.length !== Object.keys(hidden).length) {
      await setAnimationHidden(pruneKeys(hidden, keptHidden));
    }
  } catch (err) {
    warn(`pruning: ${err?.message ?? err}`);
  }
}

const pruneSoon = foundry.utils.debounce(() => pruneAnimationKeys(), 4000);

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

/** Wrap a handler so a fault in it can never reach the console as an error. */
function guarded(name, handler) {
  return (...args) => {
    try {
      handler(...args);
    } catch (err) {
      warn(`${name}: ${err?.message ?? err}`);
    }
  };
}

/**
 * Register everything. Called at init, right after `registerMeasureControls()`.
 */
export function registerAnimationHooks() {
  // THE SETTLE GATE. See `availability.mjs`: Sequencer destroys every visible
  // effect, local ones included, shortly after the canvas is ready.
  Hooks.on("sequencerEffectManagerReady", guarded("settle", () => {
    setSettled(true);
    // **BEFORE THE FIRST RECONCILE THAT CAN PLAY ANYTHING.** Everything before
    // this gate is refused by `animationAvailability`, so this is where the
    // privacy set has to be standing - `ready` usually gets there first, and
    // usually is not a guarantee (see `seedFromChat`). It walks once.
    seedFromChat();
    reconcileSoon();
  }));

  Hooks.on("canvasTearDown", guarded("teardown", () => {
    setSettled(false);
    pending.clear();
    failures.clear();
    announced = null;
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
  }));

  Hooks.on("canvasReady", guarded("canvasReady", () => {
    pending.clear();
    failures.clear();
    // A new board implies a different set; the last one is no comparison.
    announced = null;
    if (settleTimer) clearTimeout(settleTimer);
    // The fallback is for a world where the hook never comes - Sequencer off,
    // or a build that stops firing it. Without it the layer would be silent
    // for ever and nothing would say why.
    settleTimer = setTimeout(() => {
      settleTimer = null;
      if (!isSettled()) setSettled(true);
      reconcileNow();
    }, SETTLE_FALLBACK_MS);
    reconcileSoon();
  }));

  // CUES.
  Hooks.on("createChatMessage", guarded("chat", message => onChatMessage(message)));
  Hooks.on("updateChatMessage", guarded("resist", message => onChatMessageUpdated(message)));
  Hooks.on("createRegion", guarded("region", region => playCueFor(regionRecord(region))));
  Hooks.on("createActiveEffect", guarded("effect", effect => playCueFor(effectRecord(effect))));

  // LOOPS. Everything that could move what the world holds.
  for (const hook of [
    "createToken", "updateToken", "deleteToken",
    "createActiveEffect", "updateActiveEffect", "deleteActiveEffect",
    "createRegion", "updateRegion", "deleteRegion",
    "deleteChatMessage",
    "azerothAnimationStops", "azerothAnimationHidden", "azerothAnimationSettings"
  ]) {
    Hooks.on(hook, guarded(hook, () => reconcileSoon()));
  }

  // A Sustain is an actor flag, and nothing else on an actor concerns a loop.
  Hooks.on("updateActor", guarded("actor", (actor, changed) => {
    if (changed?.flags?.["azeroth-rpg"] === undefined) return;
    reconcileSoon();
  }));

  // Pruning follows the same signals, far more lazily: a stop whose loop has
  // just ended is often stopped again a moment later by a recast. `updateActor`
  // is gated on the flag for the reason the reconcile is - it fires on every
  // Health change of every creature in a fight.
  for (const hook of ["deleteRegion", "deleteActiveEffect", "deleteToken"]) {
    Hooks.on(hook, guarded(`prune:${hook}`, () => pruneSoon()));
  }
  Hooks.on("updateActor", guarded("prune:actor", (actor, changed) => {
    if (changed?.flags?.["azeroth-rpg"] === undefined) return;
    pruneSoon();
  }));

  Hooks.once("ready", guarded("ready", () => {
    seedFromChat();
    pruneAnimationKeys();
    reconcileSoon();
  }));
}

/* ------------------------------------------------------------------ */
/*  The API                                                            */
/* ------------------------------------------------------------------ */

/** Swap the player out. The Quench batch hands in a `RecordingPlayer`. */
export function setPlayer(next) {
  const previous = player;
  if (next) player = next;
  return previous;
}

/** Put the real one back. */
export function resetPlayer() {
  player = new SequencerPlayer();
  pending.clear();
  failures.clear();
  announced = null;
  return player;
}

/** What is playing, as `key -> hash`. */
export function activeLoops() {
  return player.activeLoops();
}

/**
 * The surface a macro, the batches and the shots reach this layer through.
 * Hung on `game.system.azeroth.animations` at init.
 */
export const animations = {
  plan,
  loopsFor,
  tables,
  records: { cardRecord, regionRecord, effectRecord, resistCueRecord, factsFor, stateSnapshot },
  director: { reconcile: (options = { force: true }) => reconcileNow(options), setPlayer, resetPlayer, activeLoops, wantedLoops, prune: pruneAnimationKeys },
  // The player that draws nothing, so a batch, a macro or a Playwright script
  // can swap it in without knowing a module path (`quench-tests.mjs` already
  // ships `module/testing/`, so this costs nothing new).
  Recorder: RecordingPlayer,
  open: openAnimations
};
