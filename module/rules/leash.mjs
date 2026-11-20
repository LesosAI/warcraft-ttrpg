/**
 * **THE LEASH** (the San'layn and Sovereign plan's C7): *it cannot willingly move to a space more than N
 * feet from you*. Shared by 04's Bound to the Court (30 feet), 02 §7's *Latched* (5 feet) and 07's
 * Captivating Gaze (10 feet, or no farther than it started where it began farther away; R62's MY
 * READING). Pure: no Foundry imports. The reader is `documents/combat.mjs#leashRefusalFor`, asked by
 * `onPreMoveToken` - a creature's own move alone, never a forced one (a displacement is no willing move).
 *
 * The leash rides the leashed creature's own effect: `flags.azeroth-rpg.leash = {holder, feet, from,
 * source}` - `holder` the uuid of the token (else the actor) it is held to, `feet` the limit, `from` the
 * feet it stood away when the leash was laid (Captivating Gaze's *no farther than it started*), `source`
 * the name said in the refusal.
 */

/** The flag a leash rides (shared with `sovereign-talents.mjs#LEASH_FLAG`). */
export const LEASH_FLAG = "leash";

/** Latched's own leash (02 §7: *within 5 feet of you ... more than 5 feet from you*). */
export const LATCH_FEET = 5;

const num = v => (Number.isFinite(Number(v)) ? Number(v) : null);

/** A leash record, cleaned, or null. */
export function cleanLeash(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.holder !== "string" || !raw.holder) return null;
  const feet = num(raw.feet);
  if (feet === null || feet < 0) return null;
  const from = num(raw.from);
  return { holder: raw.holder, feet, from: from !== null && from >= 0 ? from : null, source: typeof raw.source === "string" ? raw.source : "" };
}

/** The leashes a creature carries (plain effects), active ones only, sorted by holder. */
export function leashesOn(effects = []) {
  const out = [];
  for (const e of effects ?? []) {
    if (!e || e.disabled === true || e.active === false) continue;
    const l = cleanLeash(e.flags?.["azeroth-rpg"]?.[LEASH_FLAG]);
    if (l) out.push({ id: String(e.id ?? ""), ...l });
  }
  return out.sort((a, b) => a.holder.localeCompare(b.holder) || a.id.localeCompare(b.id));
}

/**
 * **THE LIMIT A LEASH HOLDS A MOVE TO**: its feet, or - where the creature started farther than that
 * (Captivating Gaze) - no farther than it started.
 */
export function leashLimit(leash) {
  if (!leash) return null;
  return leash.from !== null && leash.from > leash.feet ? leash.from : leash.feet;
}

/**
 * **WHETHER A WILLING MOVE BREAKS A LEASH**: the feet from the holder at the destination, against the
 * limit. Unmeasured is never refused (nothing measured is not a breach); a forced move never is.
 *
 * @param {{toFeet?: number|null, leash?: object|null, forced?: boolean}} o
 * @returns {boolean}
 */
export function leashBreaks({ toFeet = null, leash = null, forced = false } = {}) {
  if (forced || !leash) return false;
  const limit = leashLimit(leash);
  if (limit === null || toFeet === null || toFeet === undefined || !Number.isFinite(Number(toFeet))) return false;
  return Number(toFeet) > limit + 0.001;
}

/**
 * **THE FIRST LEASH A MOVE BREAKS**, or null: each leash's holder measured by `measure(holder)` at the
 * destination (feet, or null where the two do not stand on one scene).
 *
 * @param {Array<object>} leashes  `leashesOn`
 * @param {(holder: string) => number|null} measure
 * @param {{forced?: boolean}} [o]
 */
export function brokenLeash(leashes = [], measure = () => null, { forced = false } = {}) {
  if (forced) return null;
  for (const l of leashes ?? []) {
    const toFeet = measure(l.holder);
    if (leashBreaks({ toFeet, leash: l })) return { ...l, toFeet, limit: leashLimit(l) };
  }
  return null;
}
