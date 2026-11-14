/**
 * **EVERY POOL WRITE FOR ONE ACTOR, ONE AT A TIME** (the F2 review's should-fix 4; D-761's
 * lesson, which `documents/combat.mjs#oneAtATime` keeps for the turn budget).
 *
 * `AzerothActor#updatePool` writes `system.classes` WHOLE: every class entry, every pool
 * on it. Two writes made at once each read the classes as they stood when they began, so
 * the second landed over the first and lost it - a rune's Runic Power beside a cast's
 * Mana, a feature's price beside the Long Rest, the GM-side Unholy Presence gain beside a
 * player's spend. Run on this client one after another, keyed by the actor's uuid, each
 * write reads the classes when its turn comes and keeps what the last one wrote.
 *
 * **ONE QUEUE FOR THE RUNE DOOR TOO** (`documents/runes.mjs`): a rune spend works out the
 * weapons and the Runic Power and writes both in one update, inside this same queue, so a
 * spend and a cast are ordered against each other as well as two spends. A task in this
 * queue must never await another queued write for the same actor - `updatePool` itself
 * among them - or it waits on itself until the queue's patience runs out
 * (`rules/write-queue.mjs#WRITE_PATIENCE_MS`); the queued writers call
 * `AzerothActor#writePoolsNow`, the unqueued write, instead.
 *
 * Another client's write is not ordered by this one's queue: a GM's client and a player's
 * each keep their own. What the queue closes is the race ONE client makes against itself.
 */

import { writeQueue } from "../rules/write-queue.mjs";

/** One queue a client holds for every actor's pool writes, keyed by the actor's uuid. */
const QUEUE = writeQueue({
  onStall: actor => ui.notifications?.warn(game.i18n.format("AZEROTH.Runes.Stalled", { name: actor?.name ?? "" }))
});

/**
 * Run a pool write for this actor after every one queued before it has landed, and read
 * the actor when its turn comes.
 *
 * @template T
 * @param {Actor|null} actor
 * @param {() => Promise<T>|T} task
 * @returns {Promise<T>}
 */
export function poolWrite(actor, task) {
  return QUEUE.run(actor?.uuid ?? actor?.id ?? "none", task, actor);
}

/** Whether a pool write for this actor is queued or running on this client. */
export function poolWritePending(actor) {
  return QUEUE.pending(actor?.uuid ?? actor?.id ?? "none");
}
