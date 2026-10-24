/**
 * **AN AREA USE GATHERS ITS OWN TARGETS** (the Legacy branches' B6 fix; the lead:
 * *"Measure the area"*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * 04 writes a Use's reach as *every enemy within 10 feet of you* (Thunder Clap),
 * *every creature within 10 feet of that point* (Cluster Rockets), *every friendly
 * target within 30 feet* (Tranquillity). A feature's area was a button that drew a
 * Region, and its card's Apply, Resist and Inflict reached whatever tokens the table
 * had selected (D-647), with one damage number and no damage type - so no creature's
 * Ward was taken off it. Now the Use measures the area itself, the creatures its
 * `who` names are the card's targets, and every button works per creature.
 *
 * - `who` is the row's word for whom the area reaches: `enemy` (04's *every enemy*),
 *   `creature` (*every creature*, allies and the user included) or `ally` (*every
 *   friendly target*, the user counting as their own ally unless the words say
 *   otherwise - D-755). A row with no `who` gathers nothing and keeps D-647's
 *   selected tokens.
 * - **Only a circle is measured**: every gathering area 04 writes is one, *centered
 *   on you* (measured from the user's footprint) or *on the ground* (at a point the
 *   Use picks, held to its reach). A cone or a line names no `who`.
 * - **Never a defeated creature, never a token hidden from the user**
 *   (`rules/distance.mjs#countsAsEnemy`'s own two refusals, put in front of all three
 *   words), and an enemy is the tracker's or the dispositions' one reading.
 * - **What no Test governs lands at once on every creature measured** (`landsAtOnce`;
 *   the lead: *"Land automatically"*): Thunder Clap's Slowed is laid as the card is
 *   written, and its Prone waits on each creature's failed Resist.
 */

import { areaFor } from "./areas.mjs";
import { countsAsAlly, countsAsEnemy } from "./distance.mjs";
import { governed } from "./resisted.mjs";

/** The words a row's `who` may take. */
export const GATHER_WHO = Object.freeze(["enemy", "creature", "ally"]);

/** Where a gathered circle stands: about the user, or at a picked point. */
export const GATHER_ORIGINS = Object.freeze(["self", "point"]);

/**
 * A stored `who`, cleaned: one of `GATHER_WHO`, else null - never refused, since a
 * feature's stamp is a free string (CLAUDE.md §15).
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function cleanWho(value) {
  return GATHER_WHO.includes(value) ? value : null;
}

/**
 * **WHAT AN AREA USE MEASURES**: the circle's radius, where it stands and whom it
 * reaches - or null where the feature gathers nothing (no `who`, no circle).
 *
 * @param {{who?: string|null, area?: string|null}} feature  the stamped feature's own fields
 * @returns {{who: string, origin: "self"|"point", feet: number}|null}
 */
export function gatherOf({ who = null, area = "" } = {}) {
  const word = cleanWho(who);
  if (!word) return null;
  const shape = areaFor(String(area ?? ""));
  if (!shape || shape.shape !== "circle" || !(shape.distanceFt > 0)) return null;
  if (!GATHER_ORIGINS.includes(shape.origin)) return null;
  return { who: word, origin: shape.origin, feet: shape.distanceFt };
}

/**
 * **WHETHER ONE CREATURE ON THE BOARD IS GATHERED**, by the area's word.
 *
 * `roller` and `other` are `canvas/engaged.mjs#standingOf`'s readings - for the
 * enemy rule - and `holder` and `otherAlly` `allyStandingOf`'s, for the ally rule.
 * A defeated creature and one hidden from a reader who is no GM are never gathered,
 * whatever the word; *every creature* is every other creature still standing.
 *
 * @param {string} who
 * @param {{roller?: object|null, other?: object|null, holder?: object|null, otherAlly?: object|null, gm?: boolean}} o
 * @returns {boolean}
 */
export function gathers(who, { roller = null, other = null, holder = null, otherAlly = null, gm = false } = {}) {
  if (!other) return false;
  if (other.defeated === true) return false;
  if (other.hidden === true && gm !== true) return false;
  if (who === "enemy") return countsAsEnemy(roller, other, { gm });
  if (who === "ally") return countsAsAlly(holder, otherAlly ?? other);
  if (who === "creature") return !(typeof other.health === "number" && other.health <= 0);
  return false;
}

/**
 * **WHETHER A MEASURED DISTANCE IS INSIDE THE CIRCLE**: *within 10 feet* is 10 feet
 * or less, between the nearest squares (D-732) or from a point to the nearest
 * square. Nothing measured is nothing inside.
 *
 * @param {number|null} feet
 * @param {number} radius
 * @returns {boolean}
 */
export function insideCircle(feet, radius) {
  return typeof feet === "number" && Number.isFinite(feet) && feet <= Number(radius);
}

/**
 * **WHAT A MEASURED AREA LAYS AT ONCE, ON EVERY CREATURE IT REACHES** (the lead:
 * *"Land automatically"*; the B6 fix: *Thunder Clap's Slowed lands on everyone
 * (unresisted); its Prone only on a failure*). The conditions an area Use's card offers
 * that no Test of its governs: every one where the Use offers no Test, and where it
 * does, the ones its row leaves unmarked (`rules/resisted.mjs#governed`) - a marked one
 * is the failure's to land (`dice/chat.mjs#rollResists`). Each condition once.
 *
 * The door lays them only where it measured the area (`creaturesInArea` answered); a Use
 * that measured nothing keeps D-647's buttons on the tokens the table selects.
 *
 * @param {Array<{condition?: string, onFail?: boolean}>} inflicts  the card's conditions
 * @param {{resisted?: boolean}} [o]  whether the Use offers a Resilience Test
 * @returns {Array<object>}  the conditions to lay, in the card's order
 */
export function landsAtOnce(inflicts = [], { resisted = false } = {}) {
  const list = Array.isArray(inflicts) ? inflicts : [];
  const { onFail, open } = governed(list);
  return resisted === true ? open : [...open, ...onFail].sort((a, b) => list.indexOf(a) - list.indexOf(b));
}
