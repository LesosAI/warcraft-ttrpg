/**
 * WHETHER ANYTHING MAY PLAY ON THIS SCREEN AT ALL (D-729).
 *
 * The animation layer is an ornament over a system that has to keep working
 * without it: **with Sequencer, JB2A or Jinker's pack missing or disabled every
 * record is still written and every roll still rolls** (the design document's
 * sixth integration rule). So every door into `module/animation/` asks here
 * first, gets a `{ok, reason}` back, and does nothing at all when the answer
 * is no - it never throws, never warns twice and never half-plays.
 *
 * **ALWAYS `globalThis.Sequence` AND `globalThis.Sequencer`.** A bare
 * `Sequencer` is a ReferenceError the moment the module is off, and
 * `unbound.test.mjs` flags a bare global besides. The module's own globals are
 * installed by `initializeModule` (sequencer.js 4.2.3), so a module that is
 * present and disabled leaves them undefined rather than empty.
 *
 * ## The settle gate
 *
 * Sequencer tears down EVERY visible effect - local ones included - between
 * 100 ms and 450 ms after `canvasReady` (`setupModule` L30868-30885 calls
 * `initializePersistentEffects`, whose first line is
 * `tearDownPersistentEffects`, L11919-11920). Anything this system played in
 * that window is destroyed without a word. `sequencerEffectManagerReady`
 * (L11952-11954) is the far side of it, and nothing plays before it; the
 * 4 s fallback after `canvasReady` is for a world where that hook never comes.
 *
 * The flag lives HERE rather than in `director.mjs` so that `player.mjs` and
 * the stop door can both ask without importing the director, which imports
 * them.
 */

import { AZEROTH } from "../config.mjs";
import { LIBRARY_BY_ROOT } from "../rules/animation-table.mjs";
import { animationLoopsEnabled, animationSoundsEnabled, animationsEnabled } from "../settings.mjs";

/** The two libraries that carry pictures. `psfx` carries only sound. */
export const VISUAL_LIBRARIES = Object.freeze(["JB2A_DnD5e", "jaamod"]);

/**
 * The sentence one reason is said in, or the last resort.
 *
 * **The vocabulary is `AZEROTH.animationReasons` in `config.mjs`**, where every
 * other enum lives (CLAUDE.md §4). This is the lookup beside the check that
 * answers with those words, so a reader of `animationAvailability` finds both
 * in one file.
 */
export function unavailableKey(reason) {
  const reasons = AZEROTH.animationReasons ?? {};
  return Object.hasOwn(reasons, reason ?? "") ? reasons[reason] : reasons.noCanvas;
}

/** False until Sequencer says its manager is up; false again on a teardown. */
let settled = false;

/** Whether Sequencer has finished its post-`canvasReady` teardown. */
export function isSettled() {
  return settled;
}

/** The director sets this from `sequencerEffectManagerReady` and `canvasTearDown`. */
export function setSettled(value) {
  settled = value === true;
}

/** Whether a module is installed AND running. */
export function moduleOn(id) {
  try {
    return game.modules?.get(id)?.active === true;
  } catch {
    return false;
  }
}

/** Sequencer is running and has installed its globals. */
export function sequencerOn() {
  return moduleOn("sequencer")
    && typeof globalThis.Sequence === "function"
    && Boolean(globalThis.Sequencer?.EffectManager);
}

/**
 * THE LIBRARY ROOTS THAT ARE RUNNING, as `plan` filters steps by.
 *
 * A step's library is its asset key's root (`animation-table.mjs`), so turning
 * Jinker's pack off costs exactly the steps that name a `jaamod.` key and
 * nothing else. Handed to `plan` as `facts.libraries`: **omit it and `plan`
 * treats every library as on**, which is the opposite of what a missing module
 * should mean.
 */
export function librariesOn() {
  return Object.values(LIBRARY_BY_ROOT).filter(moduleOn);
}

/** One of Sequencer's own client settings, or a default when it is not there. */
function sequencerSetting(key, fallback) {
  try {
    const value = game.settings.get("sequencer", key);
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

/** Core's photosensitive mode, which Sequencer refuses to draw under. */
function photosensitive() {
  try {
    return game.settings.get("core", "photosensitiveMode") === true;
  } catch {
    return false;
  }
}

/**
 * Whether this user may create an effect at all.
 *
 * Sequencer's `user_can_do` is a ROLE THRESHOLD, not a boolean:
 * `game.user.role > game.settings.get("sequencer", <key>)` (sequencer.js
 * L514-516), with `permissions-effect-create` defaulting to 0 (L20880-20889).
 * A world that raised it refuses a player's `play()` with a warning toast, so
 * this is asked before anything is built.
 */
function mayCreateEffects() {
  try {
    return game.user.role > sequencerSetting("permissions-effect-create", 0);
  } catch {
    return false;
  }
}

/**
 * WHETHER CUES AND LOOPS MAY PLAY HERE, AND THE WORD FOR WHY NOT.
 *
 * The reason is a key under `AZEROTH.Animation.Unavailable`, printed on the
 * stop door's own face - a window that draws nothing and says nothing reads as
 * a broken window (CLAUDE.md §12: never the absence alone).
 *
 * @param {{requireSettled?: boolean}} [options]
 * @returns {{ok: boolean, reason: string|null}}
 */
export function animationAvailability({ requireSettled = true } = {}) {
  if (!animationsEnabled()) return { ok: false, reason: "off" };
  if (!sequencerOn()) return { ok: false, reason: "noSequencer" };
  if (!VISUAL_LIBRARIES.some(moduleOn)) return { ok: false, reason: "noLibrary" };
  if (sequencerSetting("effectsEnabled", true) !== true) return { ok: false, reason: "effectsOff" };
  if (photosensitive()) return { ok: false, reason: "photosensitive" };
  if (!mayCreateEffects()) return { ok: false, reason: "noPermission" };
  if (!canvasReady()) return { ok: false, reason: "noCanvas" };
  if (requireSettled && !settled) return { ok: false, reason: "unsettled" };
  return { ok: true, reason: null };
}

/** A board to draw on. */
function canvasReady() {
  try {
    return canvas?.ready === true && Boolean(canvas.scene);
  } catch {
    return false;
  }
}

/**
 * Whether a sound step may be heard: PSFX running, the system's own setting,
 * and Sequencer's client switch. Handed to `plan` as `facts.soundsOn`, which
 * drops every `kind: "sound"` step when it is false.
 */
export function soundsOn() {
  return moduleOn("psfx")
    && animationSoundsEnabled()
    && sequencerSetting("soundsEnabled", true) === true;
}

/** Whether loops run here. Cues are unaffected: the setting is loops alone. */
export function loopsOn() {
  return animationLoopsEnabled();
}
