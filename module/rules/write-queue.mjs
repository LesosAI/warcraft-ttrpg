/**
 * **ONE WRITE AT A TIME FOR EACH KEY, AND NEVER STUCK BEHIND ONE THAT DOES NOT
 * ANSWER** (D-761; the final review, 2026-09-30).
 *
 * The turn budget's writes for one combatant run one after another on the
 * client that makes them (`documents/combat.mjs#oneAtATime`), and each reads the
 * budget when its turn comes: that is what closes D-761's race. This is the
 * queue itself, pure, so what it promises is held in Node.
 *
 * **A write can fail to answer at all.** Core sends a document write as a
 * socket request whose promise settles only in the server's acknowledgement,
 * with no timeout (`client/helpers/socket-interface.mjs`, 14.367), and the
 * socket.io client it ships (4.8.3) DROPS a plain acknowledgement when the
 * connection closes: `Socket#_clearAcks` calls back only a handler registered
 * `withError`. Core reloads the page only when a reconnect took five seconds or
 * more (`client/game.mjs`, `reconnectTimeRequireRefresh`), so a shorter blip
 * while a write is in flight leaves that write's promise pending for ever, and
 * a queue that waited for it held every later write for the key until the
 * page was reloaded.
 *
 * **So a write is waited on for `patienceMs` at most**, counted from the moment
 * it STARTS - never from when it was queued, or a write behind a slow one would
 * be judged by the slow one's time - and then the next one goes ahead. The
 * stalled write's own caller keeps its promise, which may stay pending just as
 * core's does. `onStall` is told once, and a write that answers after all tells
 * nothing more.
 */

/**
 * **HOW LONG A WRITE IS WAITED ON: TEN SECONDS.**
 *
 * Core reconnects every half second, ten times (`client/game.mjs`:
 * `reconnectionDelay` and `reconnectionDelayMax` 500, `reconnectionAttempts`
 * 10), gives up after that, and reloads the page after an outage of five
 * seconds or more. So a write that is still going to be answered - one the
 * server received, or one socket.io buffered while the connection was down and
 * sends on reconnecting - is answered within about five seconds and a round
 * trip of being sent. Twice core's five seconds is longer than any write that
 * will land, so the queue never overtakes one that is coming; and a write whose
 * answer was lost frees the queue after one pause at the table, not never.
 */
export const WRITE_PATIENCE_MS = 10_000;

/**
 * A queue of writes, one at a time for each key.
 *
 * `run(key, task, context)` starts `task` once every write queued before it for
 * the same key has landed, thrown, or had no answer for `patienceMs`, and hands
 * back the task's own promise: its value, its error, or - for a write that never
 * answers - a promise that stays pending. Different keys never wait on each
 * other. `onStall(context, {key, patienceMs})` is called once for each write the
 * queue gave up waiting for; a throw from it is reported and stops nothing.
 *
 * @param {{patienceMs?: number, onStall?: ((context: *, info: {key: *, patienceMs: number}) => void)|null}} [options]
 * @returns {Readonly<{run: (key: *, task: () => *, context?: *) => Promise<*>, pending: (key: *) => boolean}>}
 */
export function writeQueue({ patienceMs = WRITE_PATIENCE_MS, onStall = null } = {}) {
  if (!(typeof patienceMs === "number" && patienceMs > 0 && Number.isFinite(patienceMs))) {
    throw new TypeError(`azeroth-rpg | writeQueue: patienceMs is a positive number of milliseconds, not ${patienceMs}`);
  }
  if (onStall !== null && typeof onStall !== "function") {
    throw new TypeError("azeroth-rpg | writeQueue: onStall is a function or null");
  }

  /** @type {Map<*, Promise<void>>}  each key's last write, settled once it landed or was given up on */
  const tails = new Map();

  /**
   * Settle once `write` has, or once it has had no answer for `patienceMs`,
   * whichever is first, and tell `onStall` in the second case, once.
   */
  function waitOn(write, key, context) {
    return new Promise(resolve => {
      let over = false;
      const timer = setTimeout(() => {
        if (over) return;
        over = true;
        try {
          onStall?.(context, { key, patienceMs });
        } catch (err) {
          console.warn("azeroth-rpg | a write queue's stall report threw", err);
        }
        resolve();
      }, patienceMs);
      const landed = () => {
        if (over) return;
        over = true;
        clearTimeout(timer);
        resolve();
      };
      write.then(landed, landed);
    });
  }

  return Object.freeze({
    run(key, task, context = null) {
      const before = tails.get(key) ?? Promise.resolve();
      // The task starts first and the clock beside it: both are reactions to
      // `before`, run in the order they were attached.
      const write = before.then(() => task());
      const tail = before.then(() => waitOn(write, key, context));
      tails.set(key, tail);
      tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
      return write;
    },
    /** Whether a write for this key is queued, running, or not yet given up on. */
    pending: key => tails.has(key)
  });
}
