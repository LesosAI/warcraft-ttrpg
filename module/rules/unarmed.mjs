/**
 * **ONE ANSWER TO "IS THIS AN UNARMED STRIKE"** (the San'layn and Sovereign plan, C15;
 * the lead, R5: *"this is considered "unarmed" but should be able to be "equipped" on the
 * character sheet without taking a gear slot"*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * 08 §7's **Unarmed** row and the Sovereign's **Sovereign's Claws** are the two unarmed
 * strikes the book prints, and every rule that reads *unarmed* reads both (the plan's
 * B.5, MY READING of R5, taken as recommended):
 *
 * - never disarmed (06 §7's Disarm, the NPC and the player doors);
 * - never caught by 14's Sticky Tar, which spares *unarmed blows*;
 * - always trained, with no word on a class's Weapons row;
 * - never carried: no weight and no bag slot (`slots.mjs#isThing`);
 * - never sold, looted, forged or coated.
 *
 * **A closed list, keyed by identifier** (the plan's C-3: the race's *clawed hands* are
 * lore and add no weapon). A census in `unarmed.test.mjs` fails any other comparison to
 * `"unarmed"` in `module/`, so a new reader asks this module or the census names it.
 */

/** The identifiers of every unarmed strike 08 §7 prints. */
export const UNARMED_IDS = Object.freeze(["unarmed", "sovereign-claws"]);

/** The Sovereign's Claws, by identifier (02 §7's Blood-Forged Claws; 08 §7's row). */
export const CLAWS_ID = "sovereign-claws";

/** An item's or a bare system row's identifier, lower case, or "". */
function identifierOf(item) {
  const sys = item?.system ?? item ?? {};
  return String(sys?.identifier ?? item?.identifier ?? "").trim().toLowerCase();
}

/**
 * Whether this weapon is an unarmed strike: 08 §7's Unarmed or the Sovereign's Claws.
 * Read by identifier, else by the bare name *Unarmed* (a hand-made row with no
 * identifier, which `equipment-training.mjs` always accepted).
 *
 * @param {{system?: {identifier?: string}, identifier?: string, name?: string}|null} item
 * @returns {boolean}
 */
export function isUnarmed(item) {
  if (!item) return false;
  if (UNARMED_IDS.includes(identifierOf(item))) return true;
  return /^unarmed$/i.test(String(item?.name ?? "").trim());
}

/** Whether this weapon is the Sovereign's Claws (the off hand's own, 02 §7). */
export function isClaws(item) {
  return Boolean(item) && identifierOf(item) === CLAWS_ID;
}

/**
 * Whether a card's strike record (`rules/strikes.mjs#strikeFor`) is an unarmed blow: the
 * `unarmed` form (a fist, a cestus read as one) or a weapon the record names by an
 * unarmed identifier (the claws record the `claw` form and stay unarmed). A creature's
 * row is read by its form alone.
 *
 * @param {{form?: string|null, weapon?: {identifier?: string|null}|null}|null} strike
 * @returns {boolean}
 */
export function isUnarmedStrike(strike) {
  if (!strike || typeof strike !== "object") return false;
  if (strike.form === "unarmed") return true;
  const id = String(strike.weapon?.identifier ?? "").trim().toLowerCase();
  return UNARMED_IDS.includes(id);
}

/** Whether a strike record is a claw blow of the Sovereign's Claws. */
export function isClawStrike(strike) {
  return String(strike?.weapon?.identifier ?? "").trim().toLowerCase() === CLAWS_ID;
}
