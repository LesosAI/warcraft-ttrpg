/**
 * Hiding, written (D-717). `rules/stealth.mjs` is the law; this is the write
 * and the ONE door every reveal goes through - the attack, the cast, the
 * sheet's own x and the end of the fight all call the same function, so they
 * cannot come to disagree about what being hidden is.
 *
 * ## Why there is a flag beside the status
 *
 * `invisible` is CORE's status and a GM uses it for things that are simply
 * invisible - a ghost, a spell laid on somebody, a creature that is never seen
 * at all. If a reveal cleared it whoever had set it, a Hide button nobody had
 * pressed would strip a GM's own invisibility off a wraith the moment it swung.
 * So a Hide records `azeroth-rpg.hidden` on the actor and a REVEAL clears the
 * status only where that flag is present. A GM's hand-toggled invisibility
 * carries no flag and survives every attack, which is the table's call to undo
 * from the token HUD as it always was.
 *
 * The sheet's x (`clearHidden`) is the one door that clears it either way: the
 * chip is drawn off the STATUS, so it appears for a GM's toggle too, and a
 * control that draws and does nothing is the fault this system keeps fixing
 * (D-681).
 */

import { HIDDEN_STATUS } from "../rules/stealth.mjs";
// What keeps a Hide standing through an action (04's Master of Shadows and
// Shadow Dance, D-773).
import { keepsHidden } from "../rules/class-talents.mjs";
import { dancing } from "./talent-states.mjs";

/** The flag that says this invisibility is a Hide and nothing else. */
export const HIDDEN_FLAG = "hidden";

/** Whether this actor is out of sight, by any door. */
export function isHidden(actor) {
  return actor?.statuses?.has?.(HIDDEN_STATUS) === true;
}

/**
 * Hide: core's `invisible` status, marked as ours.
 *
 * The owner keeps control and vision of the token; every other player loses
 * sight of it and the GM sees everything (core's `specialStatusEffects.INVISIBLE`,
 * `client/config.mjs`, verified at 14.367).
 */
export async function conceal(actor) {
  if (!actor) return false;
  if (!isHidden(actor)) await actor.toggleStatusEffect(HIDDEN_STATUS, { active: true });
  if (actor.getFlag("azeroth-rpg", HIDDEN_FLAG) !== true) await actor.setFlag("azeroth-rpg", HIDDEN_FLAG, true);
  return true;
}

/**
 * Come out of hiding - an attack, a cast, the end of the fight.
 *
 * Quiet where there is nothing to do, so it can sit on every hot path without
 * a guard at each call site.
 *
 * **AN ACTION THAT LEAVES THE HIDE STANDING** (D-773): `acting` says this is an
 * attack or a cast - the two doors 04 means by *taking actions* - and then 04's
 * Master of Shadows (*Taking actions while hidden does not make you visible*) and a
 * Shadow Dance standing (*count as hidden until the end of your next turn even
 * while observed*) leave it. The fight's end and the sheet's x are no action.
 *
 * @param {Actor} actor
 * @param {{force?: boolean, acting?: boolean}} [options]  `force` clears a GM's own invisibility too.
 * @returns {Promise<boolean>} whether anything was cleared
 */
export async function reveal(actor, { force = false, acting = false } = {}) {
  if (!actor) return false;
  if (acting && !force && (keepsHidden(actor.takenTalents?.() ?? []) || dancing(actor))) return false;
  const ours = actor.getFlag?.("azeroth-rpg", HIDDEN_FLAG) === true;
  if (!ours && !force) return false;
  if (isHidden(actor)) await actor.toggleStatusEffect(HIDDEN_STATUS, { active: false });
  if (ours) await actor.unsetFlag("azeroth-rpg", HIDDEN_FLAG);
  return true;
}
