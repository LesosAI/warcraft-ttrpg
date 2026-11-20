/**
 * **THE SOVEREIGN'S POOL CUES** (the San'layn and Sovereign plan's C14, CORE's share: *the Tribute wisp and
 * feeding stream (riding the pool write, D-994); the Health-drain pulse (riding the `vitaeOverflow`
 * write)*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * Three events ride the pool write that makes them, as the Death Knight's rune flare and the
 * Necromancer's Essence wisp do (D-994, D-1069): the door writes a small record under its own option on
 * the SAME update that moves the pool, every client's `updateActor` hook reads it, and each plays it for
 * itself (D-729). A pool moved with no record - a GM's hand, a refund - plays nothing.
 *
 * | Event | Option | Key | Picture |
 * |---|---|---|---|
 * | a feeding (02 §7's The Blood Royal and its kin) | `FEEDING_CUE_OPTION` | `vitae:feed` (`vitae:vial` with no creature) | a blood stream from the creature to the Sovereign, gulped down |
 * | a Tribute gain (the claw and will lanes, the named doors) | `TRIBUTE_CUE_OPTION` | `tribute:gain` (`tribute:gain-self` with no creature) | a red wisp from the prey to the Sovereign |
 * | Health paid for Vitae (02 §7's *When your Vitae runs out*) | `vitae.mjs#VITAE_OVERFLOW_OPTION` | `vitae:overflow` | a dark heartbeat pulse at the Sovereign |
 *
 * Every cue has a sound step and every asset is a full leaf key of `tools/animation/assets.json`
 * (`sovereign-core-animations.test.mjs` holds both).
 */

import { VITAE_OVERFLOW_OPTION } from "./vitae.mjs";

/** The feeding's option on the Vitae write. */
export const FEEDING_CUE_OPTION = "azerothFeeding";
/** The Tribute gain's option on the Tribute write. */
export const TRIBUTE_CUE_OPTION = "azerothTributeGain";
export { VITAE_OVERFLOW_OPTION };

export const FEEDING_KEY = "vitae:feed";
export const VIAL_KEY = "vitae:vial";
export const TRIBUTE_KEY = "tribute:gain";
export const TRIBUTE_SELF_KEY = "tribute:gain-self";
export const OVERFLOW_KEY = "vitae:overflow";

/** The event keys no one feature owns (the census's `VALID_KEYS` takes them). */
export const SOVEREIGN_CORE_EVENT_KEYS = Object.freeze([FEEDING_KEY, VIAL_KEY, TRIBUTE_KEY, TRIBUTE_SELF_KEY, OVERFLOW_KEY]);

const idOf = value => (typeof value === "string" && /^[A-Za-z0-9]+$/.test(value) ? value : null);
const refOf = raw => {
  const tokenId = idOf(raw?.tokenId);
  return tokenId ? { sceneId: idOf(raw?.sceneId), tokenId } : null;
};

/**
 * One pool cue, cleaned, or null where no holder token was recorded (D-724: what happened is written
 * where it happened, never read off the board later).
 *
 * @param {{holder?: {sceneId?: string|null, tokenId?: string}|null, from?: {sceneId?: string|null, tokenId?: string}|null, amount?: number}} o
 * @returns {{sceneId: string|null, tokenId: string, from: {sceneId: string|null, tokenId: string}|null, amount: number}|null}
 */
export function poolCue({ holder = null, from = null, amount = 1 } = {}) {
  return cleanPoolCue({ sceneId: holder?.sceneId ?? null, tokenId: holder?.tokenId ?? null, from, amount });
}

/** A pool cue as an operation carried it, cleaned, or null. */
export function cleanPoolCue(raw) {
  const tokenId = idOf(raw?.tokenId);
  if (!tokenId) return null;
  const from = refOf(raw?.from);
  return {
    sceneId: idOf(raw?.sceneId), tokenId,
    from: from && !(from.tokenId === tokenId) ? from : null,
    amount: Math.max(1, Math.trunc(Number(raw?.amount)) || 1)
  };
}

/** A finished `use` record in `animation/records.mjs#featureRecord`'s shape. */
function recordOf(identifier, cue) {
  const source = { sceneId: cue.sceneId, tokenId: cue.tokenId };
  return {
    trigger: "use", kind: "feature", contentVisible: true, sceneId: cue.sceneId, identifier, casting: false, success: true,
    area: null, source, targets: cue.from ? [cue.from] : [], steps: [], risen: [], hold: null
  };
}

/**
 * **THE RECORDS AN ACTOR UPDATE'S OPTIONS IMPLY**: one for each of the three options present, keyed to its
 * own row - the stream or the wisp from the creature where one was recorded, else the self row.
 *
 * @param {object} options  an `updateActor` hook's operation options
 * @returns {object[]}
 */
export function sovereignCoreRecords(options = {}) {
  const out = [];
  const feed = cleanPoolCue(options?.[FEEDING_CUE_OPTION] ?? null);
  if (feed) out.push(recordOf(feed.from ? FEEDING_KEY : VIAL_KEY, feed));
  const tribute = cleanPoolCue(options?.[TRIBUTE_CUE_OPTION] ?? null);
  if (tribute) out.push(recordOf(tribute.from ? TRIBUTE_KEY : TRIBUTE_SELF_KEY, tribute));
  const drain = cleanPoolCue(options?.[VITAE_OVERFLOW_OPTION] ?? null);
  if (drain) out.push(recordOf(OVERFLOW_KEY, { ...drain, from: null }));
  return out;
}

const fx = (asset, options = {}) => Object.freeze({ kind: "effect", asset, ...options });
const snd = (asset, options = {}) => Object.freeze({ kind: "sound", asset, ...options });
const cue = (trigger, steps) => Object.freeze({ trigger, steps: Object.freeze(steps) });

/** The three rows (and their two self variants), spread into `animation-table.mjs#FEATURE_ANIMATIONS`. */
export const SOVEREIGN_CORE_ANIMATIONS = Object.freeze({
  // A blood stream drawn from the creature fed on into the Sovereign, and a gulp at the Sovereign.
  [FEEDING_KEY]: Object.freeze({
    cues: [cue("use", [
      // The strands turned round to red, never tinted (FIXC, O-482: a tint on purple read black on the board).
      fx("jb2a.energy_strands.range.standard.purple.01", { place: "target>source", travel: "stretch", filter: "SOV_STREAM" }),
      snd("psfx.ranged-magic.generic.energy-strands.001", { volume: 0.45 }),
      fx("jb2a.extras.tmfx.inflow.circle.01", { place: "source", scale: 1.1, filter: "BLOOD_T", waitFor: "travel", overlap: -150 }),
      snd("psfx.consumables.potions-vials.drink-liquid.002", { volume: 0.5, waitFor: "travel", overlap: -150 })
    ])]
  }),
  // A Blood vial drunk: the inflow at the Sovereign alone, and the gulp.
  [VIAL_KEY]: Object.freeze({
    cues: [cue("use", [
      fx("jb2a.extras.tmfx.inflow.circle.01", { place: "source", scale: 1, filter: "BLOOD_T" }),
      snd("psfx.consumables.potions-vials.drink-liquid.002", { volume: 0.5 })
    ])]
  }),
  // A red wisp from the prey to the Sovereign, and a drop of blood marked at the Sovereign.
  [TRIBUTE_KEY]: Object.freeze({
    cues: [cue("use", [
      fx("jb2a.ranged.04.projectile.01.green", { place: "target>source", travel: "stretch", scale: 0.6, opacity: 0.85, filter: "BLOOD_G" }),
      snd("psfx.incantations.whispers.fem.001.forward.standard.002", { volume: 0.3 }),
      fx("jb2a.markers.drop.red.01", { place: "source", scale: 0.6, opacity: 0.9, waitFor: "travel", overlap: -150 }),
      snd("psfx.weapon-swooshes.necrotic.v1.group01", { volume: 0.25, waitFor: "travel", overlap: -150 })
    ])]
  }),
  // Tribute with no creature to draw it from (Unending Pursuit on a token gone): the drop alone.
  [TRIBUTE_SELF_KEY]: Object.freeze({
    cues: [cue("use", [
      fx("jb2a.markers.drop.red.01", { place: "source", scale: 0.6, opacity: 0.9 }),
      snd("psfx.incantations.whispers.fem.001.forward.standard.002", { volume: 0.3 })
    ])]
  }),
  // Health paid for Vitae: a heartbeat washed blood red at the Sovereign, and blood dripping.
  [OVERFLOW_KEY]: Object.freeze({
    cues: [cue("use", [
      fx("jb2a.ui.heartbeat.01.green", { place: "source", scale: 0.9, filter: "BLOOD_T" }),
      fx("jb2a.markers.drop.red.02", { place: "source", scale: 0.7, delay: 200, opacity: 0.85 }),
      snd("psfx.weapon-swooshes.necrotic.v1.group01", { volume: 0.4 })
    ])]
  })
});

/** What each key's door fires (the census's contract, `necromancer-animations.mjs#NECRO_RECORDS`'s shape). */
const r = (door, marker) => Object.freeze({ triggers: Object.freeze(["use"]), states: Object.freeze([]), bindings: Object.freeze([]), door, marker });
export const SOVEREIGN_CORE_RECORDS = Object.freeze({
  [FEEDING_KEY]: r("a feeding's Vitae write carries FEEDING_CUE_OPTION with the creature it fed on", "FEEDING_CUE_OPTION"),
  [VIAL_KEY]: r("a Blood vial's Vitae write carries FEEDING_CUE_OPTION with no creature", "FEEDING_CUE_OPTION"),
  [TRIBUTE_KEY]: r("a Tribute gain's write carries TRIBUTE_CUE_OPTION with the creature it came from", "TRIBUTE_CUE_OPTION"),
  [TRIBUTE_SELF_KEY]: r("a Tribute gain's write carries TRIBUTE_CUE_OPTION with no creature", "TRIBUTE_CUE_OPTION"),
  [OVERFLOW_KEY]: r("Health paid for Vitae carries VITAE_OVERFLOW_OPTION on the same update", "VITAE_OVERFLOW_OPTION")
});
