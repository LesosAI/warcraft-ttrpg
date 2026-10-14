/**
 * **A SPEED DROP A SPELL'S HIT LAYS, AND PERMAFROST'S FEET** (D-778; the lead,
 * 2026-10-03, on O-165: *"Yes."* to *is Slowed an effect that reduces Speed by a
 * number of feet, so Permafrost's 5 add to it?*; O-203). Pure: no Foundry imports
 * (CLAUDE.md §3).
 *
 * Frostbolt's *its Speed drops by 10 feet until the end of your next turn. At SL 3
 * or better it is **Slowed** until the end of your next turn instead* was prose:
 * the spell's `applies` carried no change and no status (a damaging spell lays no
 * effect of its words, `spell-effects.mjs#seedSpellEffects`), so the card laid
 * neither and Permafrost and Shatter had nothing to read. Ice Spear and Wrath write
 * the same drop at SL 2.
 *
 * - `readSpeedDrop` reads it: the feet, the SL it waits on, and the SL at which
 *   **Slowed** replaces it - *instead*, so the drop is not laid beside it (O-147's
 *   shape: a condition only an SL lands).
 * - `speedDropAt` answers what this cast's Success Level lands.
 * - The drop is laid by the ONE Speed-drop door (`effects/speed-drop.mjs`), keyed on
 *   the CASTER's next turn - *your next turn* - and the door adds the caster's
 *   Permafrost to it; a Slowed laid by the caster's spell or feature carries
 *   Permafrost's feet as its own `add` beside A1's halving (`speedDropChanges`,
 *   written by `effects/speed-drop.mjs#addSlowedFeet`), on the same effect, so the
 *   two end together.
 *
 * **How many feet Slowed itself takes off is A1's** - *Your Speed is halved* - and
 * stays so: the wording for a Slowed IN FEET is drafted for the lead in three
 * options (book-edits-2 (b)), none chosen, so the halving stands and Permafrost adds
 * its feet to it.
 */

/**
 * **THE DROP 07's WORDS STATE ON A HIT**, or null: `{feet, sl, until, slowedAt}`.
 * `until` is always the caster's next turn's end (*until the end of your next
 * turn*); `sl` the Success Level the drop waits on (null: any hit); `slowedAt` the
 * SL at which **Slowed** lands instead.
 *
 * @param {string} effectText  the entry's effect, HTML or flat
 * @returns {{feet: number, sl: number|null, until: string, slowedAt: number|null}|null}
 */
export function readSpeedDrop(effectText) {
  const text = String(effectText ?? "").replace(/<[^>]+>/g, " ").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const slowed = /\bAt SL (\d) or better it is Slowed until the end of your next turn instead\b/.exec(text);
  // Frostbolt: *The target takes 2 Frost damage and its Speed drops by 10 feet until the end of your next turn.*
  let m = /\bThe target takes \d+ \w+ damage and its Speed drops by (\d+) feet until the end of your next turn\b/.exec(text);
  if (m) return { feet: Number(m[1]), sl: null, until: "casterTurnEnd", slowedAt: slowed ? Number(slowed[1]) : null };
  // Ice Spear, Wrath: *At SL 2 or better its Speed drops by 10 feet until the end of your next turn.*
  m = /\bAt SL (\d) or better its Speed drops by (\d+) feet until the end of your next turn\b/.exec(text);
  if (m) return { feet: Number(m[2]), sl: Number(m[1]), until: "casterTurnEnd", slowedAt: slowed ? Number(slowed[1]) : null };
  return null;
}

/**
 * **WHAT THIS CAST LANDS**: the feet the Speed drops by, and whether **Slowed** lands
 * in its place, at the cast's Success Level. Nothing on a failed Test.
 *
 * @param {{feet: number, sl: number|null, slowedAt: number|null}|null} read
 * @param {{sl?: number, success?: boolean}} o
 * @returns {{feet: number, slowed: boolean}}
 */
export function speedDropAt(read, { sl = 0, success = true } = {}) {
  if (!read || success !== true) return { feet: 0, slowed: false };
  const at = Math.trunc(Number(sl)) || 0;
  if (read.slowedAt !== null && read.slowedAt !== undefined && at >= read.slowedAt) return { feet: 0, slowed: true };
  if (read.sl !== null && read.sl !== undefined && at < read.sl) return { feet: 0, slowed: false };
  return { feet: Math.max(0, Math.trunc(Number(read.feet)) || 0), slowed: false };
}

/**
 * **THE CHANGES A SPEED DROP CARRIES**: an `add` of the feet to the derived
 * `system.speed` and its own `upgrade 0` floor beside it, both `final` - a drop laid
 * in the final phase lands after `speed.mjs#speedFrom`'s floor (D-757's lesson).
 * The Speed-drop door's own shape, and what a Slowed carries for Permafrost.
 *
 * @param {number} feet
 * @returns {Array<{key: string, type: string, value: string, phase: string}>}
 */
export function speedDropChanges(feet) {
  const n = Math.max(0, Math.trunc(Number(feet)) || 0);
  if (!(n > 0)) return [];
  return [
    { key: "system.speed", type: "add", value: String(-n), phase: "final" },
    { key: "system.speed", type: "upgrade", value: "0", phase: "final" }
  ];
}

/** The flag Permafrost's feet ride on a Slowed's own effect: `{feet, by}`. */
export const SLOWED_FEET_FLAG = "slowedFeet";
