/**
 * An effect that lasts **until your next Short Rest** or **until your next Long
 * Rest** (08 §12's elixirs and Troll's Blood, Well Fed; D-1922, D-1962). Pure,
 * no Foundry imports (CLAUDE.md §3).
 *
 * Core's duration counts rounds, turns and world seconds, and a rest is none
 * of them, so such an effect carries no duration at all and names the rest
 * that ends it on `flags.azeroth-rpg.restEnds` (`"short"` or `"long"`). The
 * rest doors ask `endsAtRest` for every effect the actor holds
 * (`AzerothActor#clearRestEnds`): a Short Rest ends what a Short Rest ends,
 * and a Long Rest ends both, because it is the next rest of either kind.
 */

/** The flag an effect names its ending rest on. */
export const REST_ENDS_FLAG = "restEnds";

/** The two words the flag may hold. */
export const REST_ENDS = Object.freeze(["short", "long"]);

/** The duration units a seeded Use carries for one (`consumables.mjs#seedUse`). */
export const REST_UNITS = Object.freeze({ shortRest: "short", longRest: "long" });

/** The rest an effect names, or null. */
export function restEndsOf(effect) {
  const v = effect?.flags?.["azeroth-rpg"]?.[REST_ENDS_FLAG] ?? null;
  return REST_ENDS.includes(v) ? v : null;
}

/**
 * Whether a rest of this kind ends the effect: a Short Rest ends a `short`
 * effect, a Long Rest ends a `short` and a `long` one.
 *
 * @param {object} effect
 * @param {"short"|"long"} kind
 */
export function endsAtRest(effect, kind) {
  const ends = restEndsOf(effect);
  if (!ends) return false;
  return kind === "long" ? true : ends === "short";
}

/** The rest a seeded duration names (`{units: "shortRest"}`), or null. */
export function restOfDuration(duration) {
  return REST_UNITS[duration?.units] ?? null;
}
