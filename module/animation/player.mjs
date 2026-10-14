/**
 * THE ONE PLACE THAT TOUCHES SEQUENCER (D-729).
 *
 * `rules/animation.mjs` decides what a completed action looks like and what
 * the world's state implies; this turns one of its steps into one Sequencer
 * section, and nothing else in `module/` builds a Sequence. That is what lets
 * `module/testing/animation-recorder.mjs` stand in for it whole: a test drives
 * the real doors, the real records and the real law, and reads back the steps
 * this would have played.
 *
 * Verified against sequencer.js 4.2.3; the implementation depends on each:
 *
 *  - **Every section is `.locally()` AND the sequence is `play({local: true})`.**
 *    `.locally()` is what keeps it off the socket (`locally` L22618; the push
 *    test at L25006 for an effect and L26011 for a sound), and `local: true` is
 *    what makes another client refuse one that arrives anyway
 *    (`shouldPlay` L15147). A cue is an EVENT every client plays for itself, so
 *    a section that travelled would play twice on every screen.
 *  - **Every loop is `.persist(true).temporary()`.** A persistent effect is
 *    written into Sequencer's own `sequencerDatabase` journal unless it is
 *    temporary (`_playEffect` L11819, `temporary` L23248), and the test world
 *    is the lead's world: a journal-persisted loop would outlive the fight,
 *    the session and the uninstall.
 *  - **A loop's `play()` is NEVER awaited.** `EffectSection#run` awaits the
 *    effect's own `promise` for a persistent section (L25009-25014), which
 *    resolves when the effect ENDS, and `Sequence#play` awaits its sections
 *    (L27769-27787). Awaiting one hangs the caller for the life of the loop.
 *  - **`.attachTo(token)` ends with the token** (a delete hook per effect,
 *    L16850-16862), as `stretchTo(…, {attachTo: true})` does for the far end
 *    (L16903-16910) and `tieToDocuments` does for a Region (L16929-16943).
 *    `.atLocation(token)` alone does NOT, which is right for a cue: a brief
 *    picture should finish where it started even if the creature is removed.
 *  - **`attachTo` binds visibility by default** (`bindVisibility: true`,
 *    L23334), and its `sightRefresh` hook refuses to draw over a token the GM
 *    has hidden for anybody but a GM (L16871-16878). That is a second guard
 *    under the law's own `no-anchor`, not a replacement for it.
 *  - **A bucketed sound is resolved to a PATH here.**
 *    `Database.entryExists` is a prefix match (L6709-6724) and `FEET_REGEX` is
 *    a stateful global regex (L20, L6752), so a key with `.30ft` appended is
 *    neither safe nor stable. `getEntry(base).getFile(bucket)` is.
 *  - **A bad builder call raises a toast and throws** (`custom_error`
 *    L508-513, thrown by every `_customError` site), so each section is built
 *    inside a `try` and a step that refuses is dropped rather than taking the
 *    rest of the cue with it.
 */

import { CUE_PREFIX, LOOP_PREFIX, filterFor, rangeBucket } from "../rules/animation.mjs";

/** How a section's own name is built: `<key>|<index>`, which `endEffects` globs. */
export function layerName(key, index) {
  return `${key}|${index}`;
}

/**
 * What a loop's `origin` is prefixed with, so a Sequencer manager holding
 * another module's effects can still be read for ours.
 *
 * **It comes OFF again in `activeLoops`.** The reconciler compares what it
 * reads back with `loop.hash`, and a prefixed string never equals a bare one:
 * every reconcile then read every loop as *moved*, ended it and played it
 * again, for ever. Nothing but driving the real window found it - the loops
 * were always briefly in the manager, so a poll could see them, and a unit
 * test has no manager to read.
 */
const ORIGIN_PREFIX = "azeroth-rpg:";

/** The scene every anchor is looked up on. */
function scene() {
  return canvas?.scene ?? null;
}

/** A TokenDocument on the viewed scene, or null. */
function tokenDoc(id) {
  return id ? scene()?.tokens?.get(id) ?? null : null;
}

/** A RegionDocument on the viewed scene, or null. */
function regionDoc(id) {
  return id ? scene()?.regions?.get(id) ?? null : null;
}

/**
 * THE LAID EFFECT AN `effect`-BOUND LOOP FOLLOWS, or null.
 *
 * The loop is anchored on a TOKEN (its key names one, so a linked actor
 * standing twice is two loops), and what it actually follows is the effect the
 * card laid. `effect` names the token in `anchors[0]` and the effect is found
 * on that token's actor by the cast; `effect-region` names the Region and then
 * the effect's own id, so that one is looked up directly.
 */
function effectFor(loop) {
  const binding = loop?.binding ?? null;
  if (binding === "effect") {
    const actor = tokenDoc(loop.anchors?.[0])?.actor ?? null;
    return [...(actor?.effects ?? [])].find(e => e.flags?.["azeroth-rpg"]?.cast === loop.cast) ?? null;
  }
  if (binding !== "effect-region") return null;
  const id = loop.anchors?.[1] ?? null;
  if (!id) return null;
  for (const actor of game.actors ?? []) {
    const found = actor.effects?.get?.(id);
    if (found) return found;
  }
  for (const token of scene()?.tokens ?? []) {
    const found = token.actor?.effects?.get?.(id);
    if (found) return found;
  }
  return null;
}

/** A token's pixel width, for an orbit's radius. Falls back to one square. */
function tokenWidth(id) {
  const doc = tokenDoc(id);
  const placeable = doc?.object ?? null;
  return placeable?.w ?? ((doc?.width ?? 1) * (canvas?.grid?.size ?? 100));
}

/**
 * The FILE a step plays.
 *
 * A plain key is handed to Sequencer, which resolves it (and, for a stretched
 * effect with a `ranged` template, picks the distance bucket itself). A
 * BUCKETED SOUND has no source and target to be measured between, so the
 * bucket is chosen from the law's own `feet` and the path is looked up.
 */
function fileFor(step) {
  if (step.kind !== "sound" || step.bucketed !== true) return step.asset;
  try {
    const entry = globalThis.Sequencer?.Database?.getEntry?.(step.asset, { softFail: true });
    const files = entry && !Array.isArray(entry) ? entry.file : null;
    if (!files || typeof files !== "object" || Array.isArray(files)) return step.asset;
    const bucket = rangeBucket(step.feet ?? null, Object.keys(files));
    if (!bucket || files[bucket] === undefined) return step.asset;
    const chosen = typeof entry.getFile === "function" ? entry.getFile(bucket) : files[bucket];
    return typeof chosen === "string" ? chosen : step.asset;
  } catch {
    return step.asset;
  }
}

/** The named recolour, split into the wash and the matrix. */
function recolour(section, step) {
  const filter = filterFor(step.filter);
  if (!filter) return;
  const { tint: wash, ...matrix } = filter;
  if (wash) section.tint(wash);
  if (Object.keys(matrix).length) section.filter("ColorMatrix", matrix);
}

/** Degrees from one point to another, canvas y running down. */
function degreesBetween(from, to) {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

/** A point displaced sideways from an axis, for a second swarm beside the first. */
function sidestep(point, from, to, distance) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: point.x - (dy / length) * distance, y: point.y + (dx / length) * distance };
}

/**
 * Where one step goes: a creature, a point, a span between two, or a flight.
 *
 * The law has already resolved every anchor into pixels (`at`, `from`, `to`)
 * and, where it knew one, the token it belongs to (`on`, `fromToken`,
 * `toToken`). **The DOCUMENT is preferred where there is one**, because
 * `scaleToObject` needs an object to scale to and a point has no width - but
 * `atLocation`, never `attachTo`, so a cue never follows the creature and
 * never dies with it.
 */
function place(section, step, { persistent }) {
  const from = step.from ?? null;
  const to = step.to ?? null;

  // A span between two things: a swing, a projectile, a channel, a wall.
  if (from && to) {
    if (step.travel === "span") {
      // A file with no `ranged` template cannot be stretched honestly, so it
      // is laid along the axis at its midpoint and sized to the length.
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      section.atLocation(mid).rotate(step.rotation ?? degreesBetween(from, to));
      if (length > 0) section.size({ width: length, height: "auto" });
      return;
    }
    const aside = (step.offset ?? 0) * (canvas?.grid?.size ?? 0);
    const start = aside ? sidestep(from, from, to, aside) : from;
    const end = aside ? sidestep(to, from, to, aside) : to;
    if (step.travel === "move") {
      // Flown rather than stretched: a shape whose frames are not made to be
      // pulled between two points (a bat swarm sweeping down the cone).
      section.atLocation(start).moveTowards(end);
      return;
    }
    // A LOOP's channel is held at BOTH ends, so it follows two creatures and
    // ends with either. A cue is drawn once between where they were.
    const a = persistent ? tokenDoc(step.fromToken) : null;
    const b = persistent ? tokenDoc(step.toToken) : null;
    if (a) section.attachTo(a);
    else section.atLocation(start);
    section.stretchTo(b ?? end, b ? { attachTo: true } : {});
    return;
  }

  if (!step.at) return;
  const holder = tokenDoc(step.on);
  // A LOOP on a creature is ATTACHED - it moves with it, hides with it and
  // ends with it. A cue is placed AT it and outlives it by design.
  if (persistent && holder) section.attachTo(holder);
  else section.atLocation(holder ?? step.at);
}

/**
 * How big it is drawn.
 *
 * **`scaleToObject` MAY NOT BE USED ON A STRETCHED STEP.** Sequencer throws
 * *"you're trying to stretch towards an object, while scaling to fit
 * another"* (L24918-24924) - and a javelin, a sling stone and eight other
 * strike rows carry a scale on a `source>target` stretch, so the whole cue
 * would have been lost. A plain `.scale()` is right there anyway: stretching
 * divides the distance by `scale.x` and multiplies it back
 * (`_applyDistanceScaling` L16930-16950), so the length is preserved and the
 * number thickens the shape - exactly what *a hatchet at 1.25* means.
 */
function size(section, step) {
  const stretched = Boolean(step.from && step.to);
  if (step.travel === "span") return;                       // `place` sized it to the line
  if (!stretched && step.size !== undefined && step.size !== null && step.size > 0) {
    section.size(step.size);
    return;
  }
  if (step.scale === undefined || step.scale === null) return;
  if (!stretched && tokenDoc(step.on)) section.scaleToObject(step.scale, { uniform: true });
  else section.scale(step.scale);
}

/** The look: opacity, layer, timing, playback and the fades. */
function look(section, step, { persistent }) {
  if (step.opacity !== undefined) section.opacity(step.opacity);
  if (step.below === true) section.belowTokens();
  if (step.delay) section.delay(step.delay);
  if (step.speed) section.playbackRate(step.speed);
  // A MISS GOES WIDE OF SOMETHING. `missed` offsets the far end, so it means
  // nothing without one - and the law has already placed a bite's miss BESIDE
  // the target rather than on it, which is what says *miss* there.
  if (step.missed === true && step.to) section.missed();
  if (step.rotation !== undefined && step.travel !== "span" && !step.from) section.rotate(step.rotation);
  recolour(section, step);
  // A LOOP RUNS UNTIL IT IS ENDED. `hold` and `duration` are how long a CUE
  // stands, and setting either on a persistent section would end it early.
  if (!persistent) {
    const span = step.duration ?? step.hold ?? null;
    if (span) section.duration(span);
  }
  if (step.grow) section.scaleIn(0, step.grow, { ease: "easeOutCubic" });
  if (step.fadeIn) section.fadeIn(step.fadeIn);
  if (step.fadeOut) section.fadeOut(step.fadeOut);
  const mask = regionDoc(step.mask);
  if (mask) section.mask(mask);
}

/**
 * THREE CHARGES AT SHOULDER HEIGHT, a third of a turn apart.
 *
 * The sprite is pushed out from the centre inside `spriteContainer`
 * (`spriteOffset` L16317-16323) and the CONTAINER is turned, which is what
 * makes it orbit rather than spin on the spot. `loopProperty` converts a
 * `rotation` to radians itself (L17314-17318), so the values are degrees.
 */
function orbit(section, step) {
  const radius = (step.offset ?? 0.5) * tokenWidth(step.on);
  const phase = step.phase ?? 0;
  const spin = step.spin ?? 3600;
  section.spriteOffset({ x: radius, y: 0 });
  section.loopProperty("spriteContainer", "rotation", { values: [phase, phase + 360], duration: spin });
}

/**
 * THE PLAYER. One instance, held by the director; a test swaps in
 * `RecordingPlayer` and everything above it is unchanged.
 */
export class SequencerPlayer {
  /**
   * Why the last loop built nothing, in the builder's own words.
   *
   * The director gives a loop up after a few attempts and says so ONCE; this is
   * what lets that one sentence name the cause rather than only the key. Set by
   * `#section` and read immediately, so it is never stale by more than a call.
   */
  lastLoopRefusal = null;

  /** A fresh Sequence, soft-failing so a missing file is a no-op, not an error. */
  #sequence() {
    return new globalThis.Sequence({ moduleName: "azeroth-rpg", softFail: true });
  }

  /**
   * PLAY ONE COMPLETED ACTION'S CUE. Fire and forget.
   *
   * **The steps are partitioned by `waitFor` rather than played in order.**
   * A step that waits for the travel does so by `waitUntilFinished` on the
   * section BEFORE it (sequencer.js has no other way to say it), and that
   * section holds up everything after it in the sequence - so a launch sound
   * written between the projectile and the impact would be delayed by the
   * whole flight. Partitioning is stable, and the law already writes the
   * immediate steps first, so the order inside each group is the table's.
   *
   * @param {object[]} steps  from `rules/animation.mjs#plan`
   * @returns {string|null}  the cue's id, which names its sections
   */
  playCue(steps) {
    const list = Array.isArray(steps) ? steps : [];
    if (!list.length) return null;
    const id = foundry.utils.randomID();
    const sequence = this.#sequence();
    const immediate = list.filter(s => s.waitFor !== "travel");
    const waiting = list.filter(s => s.waitFor === "travel");
    let index = 0;
    let last = null;
    let lastEffect = null;

    for (const step of immediate) {
      const section = this.#section(sequence, step, `${CUE_PREFIX}:${id}|${index}`, false);
      if (section) { last = section; index += 1; if (step.kind !== "sound") lastEffect = section; }
    }
    if (waiting.length) {
      const anchor = lastEffect ?? last;
      const overlap = waiting.find(s => typeof s.overlap === "number")?.overlap ?? 0;
      try { anchor?.waitUntilFinished(overlap); } catch { /* the section refused; the delay stands */ }
      for (const step of waiting) {
        const section = this.#section(sequence, step, `${CUE_PREFIX}:${id}|${index}`, false);
        if (section) index += 1;
      }
    }
    if (!index) return null;
    this.#play(sequence);
    return id;
  }

  /**
   * PLAY ONE LOOP, and never wait for it.
   *
   * Every layer is named `<key>|<i>` so `endLoop` can glob them, and carries
   * the loop's hash as its `origin` so the director can tell a loop that has
   * MOVED - a Region dragged, a table row edited - from one that has not.
   *
   * @param {object} loop  from `rules/animation.mjs#loopsFor`
   */
  playLoop(loop) {
    const layers = Array.isArray(loop?.layers) ? loop.layers : [];
    this.lastLoopRefusal = layers.length ? null : "the row carries no layer";
    if (!loop?.key || !layers.length) return null;
    const sequence = this.#sequence();
    let made = 0;
    layers.forEach((layer, i) => {
      const section = this.#section(sequence, layer, layerName(loop.key, i), true, loop);
      if (section) made += 1;
    });
    if (!made) return null;
    this.lastLoopRefusal = null;
    this.#play(sequence);
    return loop.key;
  }

  /** End every layer of one loop on this screen alone. */
  endLoop(key) {
    if (!key) return null;
    try {
      // `push: false` keeps the end local, as the play was. The name filter is
      // an ANCHORED glob (L11695-11700, `*` becomes `.*?`), so `<key>|*` is
      // exactly this loop's layers and no other loop's.
      return globalThis.Sequencer?.EffectManager?.endEffects?.({ name: `${key}|*` }, false) ?? null;
    } catch (err) {
      warn(`ending ${key}: ${err.message}`);
      return null;
    }
  }

  /**
   * The loops playing on this screen, as `key -> hash`.
   *
   * The hash is read back off `origin`, so a loop whose geometry or recipe has
   * moved is replayed in place rather than left standing where it was.
   */
  activeLoops() {
    const out = new Map();
    try {
      const effects = globalThis.Sequencer?.EffectManager?.getEffects?.({ name: `${LOOP_PREFIX}:*` }) ?? [];
      for (const effect of effects) {
        const name = effect?.data?.name ?? "";
        const key = name.slice(0, name.lastIndexOf("|"));
        if (!key) continue;
        const origin = String(effect?.data?.origin ?? "");
        out.set(key, origin.startsWith(ORIGIN_PREFIX) ? origin.slice(ORIGIN_PREFIX.length) : origin);
      }
    } catch (err) {
      warn(`reading the manager: ${err.message}`);
    }
    return out;
  }

  /* -------------------------------------------- */

  /** Build one section, or null where the builder refused it. */
  #section(sequence, step, name, persistent, loop = null) {
    try {
      if (step.kind === "sound") {
        const sound = sequence.sound().file(fileFor(step)).name(name).locally();
        if (step.volume !== undefined) sound.volume(step.volume);
        if (step.delay) sound.delay(step.delay);
        return sound;
      }
      const section = sequence.effect().file(step.asset).name(name).locally();
      if (persistent) {
        // TEMPORARY, ALWAYS. See the header: a persistent effect that is not
        // temporary is written into Sequencer's journal and survives the world.
        section.persist(true).temporary();
        if (loop?.hash) section.origin(`${ORIGIN_PREFIX}${loop.hash}`);
        // A LOOP FADES IN AND OUT unless its own row says otherwise. A standing
        // picture that appears and vanishes on a frame reads as a glitch, and
        // the fade out is what makes a Stop look like a decision rather than a
        // crash. `_removeEffect` takes the effect out of the manager BEFORE it
        // ends it, so the fade never delays what `activeLoops` reports.
        if (step.fadeIn === undefined) section.fadeIn(400);
        if (step.fadeOut === undefined) section.fadeOut(400);
      }
      place(section, step, { persistent });
      size(section, step);
      look(section, step, { persistent });
      if (step.on !== undefined && step.spin !== undefined) orbit(section, step);
      if (persistent) this.#tie(section, loop);
      return section;
    } catch (err) {
      // Kept as well as warned: the director says ONCE why a loop it has given
      // up on could not be built, and a key with no cause beside it is a line
      // nobody can act on.
      this.lastLoopRefusal = `${step.asset}: ${err.message}`;
      warn(`${step.asset}: ${err.message}`);
      return null;
    }
  }

  /**
   * Tie a loop to every document whose existence it follows.
   *
   * `attachTo` already ends a layer with its token. **The other two are not
   * covered by it**: a Region-anchored loop stands on ground nothing is
   * attached to, and **twelve of the twenty-six loops are `effect`-bound** -
   * held on a token by `attachTo` while what they actually follow is the laid
   * ActiveEffect. Without the tie, deleting the effect ended them through the
   * 150 ms reconcile instead of at once; `tieToDocuments` takes any Document
   * and hooks `delete<DocumentName>` off its uuid (sequencer.js L16932-16943,
   * `getHook` reading the second-to-last uuid segment), so an ActiveEffect is
   * as good an anchor as a Region.
   */
  #tie(section, loop) {
    const docs = [];
    if (loop?.binding?.endsWith("region")) {
      const region = regionDoc(loop.anchors?.[0]);
      if (region) docs.push(region);
    }
    const effect = effectFor(loop);
    if (effect) docs.push(effect);
    if (docs.length) section.tieToDocuments(docs);
  }

  /**
   * **NEVER AWAITED.** See the header: a persistent section's `play()` resolves
   * when the effect ends, so awaiting a loop hangs for its lifetime, and a cue
   * is fire-and-forget by design.
   */
  #play(sequence) {
    try {
      const result = sequence.play({ local: true });
      if (result?.catch) result.catch(err => warn(err?.message ?? String(err)));
    } catch (err) {
      warn(err?.message ?? String(err));
    }
  }
}

/**
 * NEVER `console.error`. The smoke spec counts console errors and fails the
 * whole load on one, and an ornament that cannot draw is not a fault in the
 * system underneath it (CLAUDE.md §16.6).
 */
export function warn(message) {
  console.warn(`azeroth-rpg | animation skipped: ${message}`);
}
