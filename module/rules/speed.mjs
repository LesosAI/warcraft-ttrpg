/**
 * Speed (05 SS10): 30 feet before race and armor. Pure: no Foundry imports.
 *
 * What feeds it, as parts a tooltip can print, and the total:
 *  - the race's own Speed (30 for every people 02 writes up);
 *  - the suit: Encumbering costs 5 feet and an Open cut gives 5 back (08 SS8);
 *  - Muffled at Greater grade buys Encumbering's Speed back (08 SS6).
 *
 * Entangled, Prone and Slowed, and a Critical Injury's "Speed reduced by N
 * feet" (06 SS8), arrive as Active Effects in the `final` phase, after the
 * derived number exists - so they are not parts here and the sheet's number
 * can be lower than the parts sum.
 */

import { BASE_SPEED, LOAD_PENALTY } from "./size.mjs";
import { ENCUMBERING_SPEED_PENALTY } from "./armor.mjs";

/** The grant that cancels Encumbering's Speed cost (08 SS6). */
export const GREATER_MUFFLED = /Muffled \(Greater\)/i;

/**
 * @param {object} [input]
 * @param {number|null} [input.raceSpeed]   The race item's Speed; 30 with no race.
 * @param {number} [input.armorSpeed]       The suit's modifier (`rules/armor.mjs#speedModifier`).
 * @param {boolean} [input.encumbering]     Whether the suit's category is Encumbering.
 * @param {string[]} [input.grants]         The suit's affix grants.
 * @param {string} [input.load]             `rules/size.mjs#loadState` (D-675).
 * @returns {{key: string, value: number}[]}
 */
export function speedParts({ raceSpeed = null, armorSpeed = 0, encumbering = false, grants = [], load = "unencumbered" } = {}) {
  const parts = [{ key: "race", value: Number.isFinite(raceSpeed) ? raceSpeed : BASE_SPEED }];
  if (armorSpeed) parts.push({ key: "armor", value: armorSpeed });
  if (encumbering && grants.some(g => GREATER_MUFFLED.test(String(g)))) {
    parts.push({ key: "muffled", value: ENCUMBERING_SPEED_PENALTY });
  }
  // What you are carrying (05 §10, D-675). A PART rather than a condition:
  // the state is derived from the load every time data is prepared, and a
  // fifteenth condition would put A1's list and `config.mjs` out of step.
  // It stacks with Encumbering, which is a property of the suit and not of
  // the load.
  const carried = LOAD_PENALTY[load] ?? 0;
  if (carried) parts.push({ key: "encumbered", value: -carried });
  return parts;
}

/**
 * A CREATURE'S Speed as parts (14 §1, 05 §10).
 *
 * A creature has no race item and no suit of its own: 14 prints one pace and
 * that number ORIGINATES there (D3 §7), so it is the first part rather than
 * something rebuilt out of a base and a race. What is carried and what is worn
 * grants are parts beside it, which is CLAUDE.md §4's rule — *encumbrance is a
 * Speed part, not a fifteenth condition* — read on the other actor type.
 *
 * `blockSpeed` is the number as it stands when this is called, so it already
 * carries whatever an `initial`-phase Active Effect and the creature's own
 * standing passives made of it. Nothing here recomputes it from `_source`.
 *
 * @param {object} [input]
 * @param {number} [input.blockSpeed]   14's own printed pace, as it stands
 * @param {string} [input.load]         `rules/size.mjs#loadState` (D-675)
 * @param {number} [input.grantSpeed]   `+N Speed` off what is worn (08 §20)
 * @returns {{key: string, value: number}[]}
 */
export function blockSpeedParts({ blockSpeed = BASE_SPEED, load = "unencumbered", grantSpeed = 0 } = {}) {
  const parts = [{ key: "block", value: Number.isFinite(blockSpeed) ? blockSpeed : BASE_SPEED }];
  const carried = LOAD_PENALTY[load] ?? 0;
  if (carried) parts.push({ key: "encumbered", value: -carried });
  if (grantSpeed) parts.push({ key: "grant", value: Number(grantSpeed) || 0 });
  return parts;
}

/** The parts summed, never below zero. */
export function speedFrom(parts = []) {
  return Math.max(0, parts.reduce((n, p) => n + (Number(p?.value) || 0), 0));
}
