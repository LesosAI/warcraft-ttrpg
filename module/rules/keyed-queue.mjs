/**
 * **ONE TASK AT A TIME FOR EACH KEY** (stage 11; D-906). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * A read-modify-write on one document made twice at once reads the same old state twice: two
 * ends of one Sustain both found the cast on the caster's list and the second lifted effects the
 * first had already deleted (*does not exist*), and two Half-Action gifts from one giver both read
 * `halves: 1` and wrote 2. A task queued here runs once every task queued before it under the same
 * key has settled, so it reads the document as the last one left it; a task that throws does not
 * stop the next. Different keys never wait on each other.
 *
 * **A task must never await another task under its own key**, or it waits on itself for ever
 * (D-761's warning for the combatant's queue). Unlike `rules/write-queue.mjs` this queue has no
 * patience timer: what it orders is local work that always settles, never a socket round trip.
 */

/**
 * @returns {{run: (key: string, task: () => Promise<any>|any) => Promise<any>, pending: (key: string) => Promise<any>, size: () => number}}
 */
export function keyedQueue() {
  const tails = new Map();
  return {
    /** Run `task` after every task queued before it under `key`; answers what it answers. */
    run(key, task) {
      const prior = tails.get(key) ?? Promise.resolve();
      const next = prior.then(() => task(), () => task());
      tails.set(key, next);
      const clear = () => { if (tails.get(key) === next) tails.delete(key); };
      next.then(clear, clear);
      return next;
    },
    /** What is still queued under `key`, to wait on: never a rejection, resolved where nothing is. */
    pending(key) {
      const tail = tails.get(key);
      return tail ? tail.catch(() => undefined) : Promise.resolve(undefined);
    },
    /** How many keys have work queued (for a test). */
    size() {
      return tails.size;
    }
  };
}
