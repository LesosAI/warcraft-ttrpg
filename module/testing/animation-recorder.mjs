/**
 * THE PLAYER THAT DRAWS NOTHING (D-729).
 *
 * `module/animation/player.mjs` is the one module that touches Sequencer, and
 * this stands in for it whole. That is what lets Phase 5's Quench batch drive
 * the REAL doors - a real attack through `attackWithDialog`, a real cast
 * through `castSpell`, a real Place area, a real Resist - and then read back
 * the steps the layer would have played, on the exact token ids it would have
 * played them on.
 *
 * It is not a spy over the real player: it REPLACES it, because a test that
 * also drew would be a test that fought Sequencer's own teardown, needed a
 * canvas that had settled, and left effects standing in the lead's world.
 *
 * ```js
 * const recorder = new RecordingPlayer();
 * const previous = game.system.azeroth.animations.director.setPlayer(recorder);
 * // ... drive a door ...
 * recorder.cues.at(-1).steps;      // what one completed action played
 * game.system.azeroth.animations.director.setPlayer(previous);
 * ```
 *
 * **`activeLoops()` answers from what it was told**, so the director's
 * reconciler works against it unchanged: a loop played is a loop it reports,
 * a loop ended leaves, and a hash that moves is replayed exactly as it would
 * be on a live board.
 */

export class RecordingPlayer {
  /** Every cue played, newest last: `{id, steps, at}`. */
  cues = [];

  /** Every loop ever played, newest last: `{key, hash, loop, at}`. */
  loops = [];

  /** Every key ended, newest last. */
  ended = [];

  /**
   * Every cue the law REFUSED, newest last: `{skip, record, at}`.
   *
   * A skip is a word from `SKIPS` and a test asserts on it - *a failed Fireball
   * records `failed-cast`*, *a Parry records `parry`* - because a cue that
   * played nothing is otherwise indistinguishable from one that was never
   * asked for. `SequencerPlayer` does not implement `noteSkip`; the director
   * calls it optionally.
   */
  skips = [];

  /** What is "playing": `key -> hash`. */
  #playing = new Map();

  /** A counter, so a cue's id is stable and readable in a failure message. */
  #next = 0;

  /** Forget everything. A batch calls this in `beforeEach`. */
  reset() {
    this.cues = [];
    this.loops = [];
    this.ended = [];
    this.skips = [];
    this.#playing.clear();
    this.#next = 0;
    return this;
  }

  /** @see module/animation/director.mjs - the law's refusal, by word. */
  noteSkip(skip, record = null) {
    this.skips.push({ skip, record, at: Date.now() });
    return skip;
  }

  /** @see module/animation/player.mjs */
  playCue(steps) {
    const list = Array.isArray(steps) ? steps : [];
    if (!list.length) return null;
    this.#next += 1;
    const id = `cue${this.#next}`;
    this.cues.push({ id, steps: list, at: Date.now() });
    return id;
  }

  /** @see module/animation/player.mjs */
  playLoop(loop) {
    if (!loop?.key) return null;
    this.loops.push({ key: loop.key, hash: loop.hash ?? "", loop, at: Date.now() });
    this.#playing.set(loop.key, loop.hash ?? "");
    return loop.key;
  }

  /** @see module/animation/player.mjs */
  endLoop(key) {
    if (!key || !this.#playing.has(key)) return null;
    this.#playing.delete(key);
    this.ended.push(key);
    return key;
  }

  /** @see module/animation/player.mjs */
  activeLoops() {
    return new Map(this.#playing);
  }

  /* -------------------------------------------- */
  /*  What a test asks it                          */
  /* -------------------------------------------- */

  /** The last cue played, or null where nothing was. */
  lastCue() {
    return this.cues.at(-1) ?? null;
  }

  /** The steps of the last cue, or an empty list where nothing was played. */
  lastSteps() {
    return this.cues.at(-1)?.steps ?? [];
  }

  /** Every step of every cue, for a census over one action. */
  allSteps() {
    return this.cues.flatMap(cue => cue.steps);
  }

  /** The word the law last refused a cue with, or null. */
  lastSkip() {
    return this.skips.at(-1)?.skip ?? null;
  }

  /** Whether one loop key is playing here. */
  isPlaying(key) {
    return this.#playing.has(key);
  }
}
