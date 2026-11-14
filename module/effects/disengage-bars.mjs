/**
 * **THE ONE DOOR EVERY DISENGAGE ASKS** (the F4b review, S5): the facts `rules/disengage-bars.mjs
 * #disengageBar` judges, gathered off the world - the Anchors the creature is Engaged with, a
 * Decay at Heavy Hours' rank 2, a Death Knight's Relentless Advance, the Slowed Chains of Ice
 * laid - and the refusal said in words. Asked before anything is spent by every writer of the
 * `disengaging` state: the sheet's Disengage, Evade on an attack's card, Spirit Walk and a Boss
 * Action's Disengage (`disengage-bars.test.mjs` holds the list).
 */

import { disengageBar } from "../rules/disengage-bars.mjs";

/**
 * The bar that holds over this creature's Disengage, or null.
 * @param {Actor} actor
 * @returns {Promise<{bar: string, key: string, data: object}|null>}
 */
export async function disengageBarFor(actor) {
  if (!actor) return null;
  const { anchoredBy } = await import("../canvas/engaged.mjs");
  const { disengageBarred } = await import("./chronomancer.mjs");
  const { relentlessBars } = await import("./death-knight-talents.mjs");
  const { noDisengageBy } = await import("./death-knight-spells.mjs");
  return disengageBar({
    name: actor.name ?? "",
    anchoredBy: anchoredBy(actor) ?? [],
    heavy: disengageBarred(actor),
    relentless: await relentlessBars(actor),
    chained: noDisengageBy(actor)
  });
}

/**
 * **REFUSE A DISENGAGE IN WORDS, OR LET IT PASS**: true where it was refused (nothing is spent by
 * the caller), false where it may go.
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
export async function refuseDisengage(actor) {
  const bar = await disengageBarFor(actor);
  if (!bar) return false;
  ui.notifications?.warn(game.i18n.format(bar.key, bar.data));
  return true;
}
