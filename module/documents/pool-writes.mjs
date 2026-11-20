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

/**
 * **A POOL MOVED BY A NUMBER, INSIDE THE QUEUE** (the 4b review's last small item: an Essence spend
 * read the snapshot and wrote an absolute value outside the queue, so a gain landing between the
 * read and the write was written over). The pool is read when this task's turn comes, the delta is
 * applied - floored at nothing, capped at the pool's top on a rise - and written through
 * `AzerothActor#writePoolsNow`. With `need`, a spend the pool cannot cover writes nothing and says
 * so. A rise of Essence or Runic Power names its door through `options` (`essenceGain`, `runicGain`).
 *
 * @param {Actor} actor
 * @param {{kind: string, name: string}} which
 * @param {number} delta
 * @param {{need?: boolean, options?: object}} [o]
 * @returns {Promise<{ok: boolean, reason: null|"noPool"|"short", before: number, after: number}>}
 */
export function adjustPool(actor, { kind, name } = {}, delta = 0, { need = false, options = {} } = {}) {
  return poolWrite(actor, async () => {
    const pool = (actor?.poolSnapshot?.() ?? []).find(p => p.kind === kind && p.name === name) ?? null;
    if (!pool) return { ok: false, reason: "noPool", before: 0, after: 0 };
    const before = Math.max(0, Math.trunc(Number(pool.value)) || 0);
    const d = Math.trunc(Number(delta)) || 0;
    if (need && d < 0 && before < -d) return { ok: false, reason: "short", before, after: before };
    const top = Math.trunc(Number(pool.max));
    const raised = before + d;
    const after = Math.max(0, d > 0 && Number.isFinite(top) && top >= 0 ? Math.min(Math.max(top, before), raised) : raised);
    if (after !== before) await actor.writePoolsNow([{ itemId: pool.itemId, kind, value: after }], {}, options);
    return { ok: true, reason: null, before, after };
  });
}
