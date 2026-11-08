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
import { actorRevealedByMobileFlare } from "./mobile-alert-visibility.mjs";
// A concealment's own end (the Legacy branches' door 25: 04's Gnomish Cloaking Device,
// *It ends for each of you who attacks or casts a spell*; Wind Walk at rank 2, *until
// you next attack*).
import { CONCEAL_FLAG, concealEnds } from "../rules/legacy-uses.mjs";
// What keeps a Hide standing through an action (04's Master of Shadows and
// Shadow Dance, D-773).
import { keepsHidden } from "../rules/class-talents.mjs";
import { dancing } from "./talent-states.mjs";
import { endNpcSneak } from "./npc-sneak.mjs";
import { refuseIceBlockTarget } from "./ice-block-protection.mjs";
import { endEquipmentInvisibility } from "./equipment-travel.mjs";

/** The flag that says this invisibility is a Hide and nothing else. */
export const HIDDEN_FLAG = "hidden";

/** Whether this actor is out of sight, by any door. */
export function isHidden(actor) {
  return actor?.statuses?.has?.(HIDDEN_STATUS) === true;
}

/** Effective concealment for a particular attack. Keep isHidden's raw check
 * for removing/ending an underlying Hide even while Flare suppresses it. */
export function isHiddenFor(actor, source = null) {
  return isHidden(actor) && !actorRevealedByMobileFlare(actor, source);
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
  if (refuseIceBlockTarget(actor)) return false;
  if (!isHidden(actor)) await actor.toggleStatusEffect(HIDDEN_STATUS, { active: true });
  if (refuseIceBlockTarget(actor)) return false;
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
 * **A CONCEALMENT ENDS BY ITS OWN WORDS** (the Legacy branches' door 25): `kind` says
 * which act this is - `attack` or `cast` - and every concealment effect on the actor
 * whose words end at that act is taken off first (`rules/legacy-uses.mjs#concealEnds`):
 * the Cloaking Device's at either, Wind Walk's at an attack alone. It is the device's
 * own sentence, so Master of Shadows and a Shadow Dance - which keep a HIDE - leave it
 * to end. Core's `toggleStatusEffect` deletes every effect that carries the status
 * alone, so a Hide revealed takes a concealment standing beside it with it (MY
 * READING, for the lead: one invisibility, ended once).
 *
 * @param {Actor} actor
 * @param {{force?: boolean, acting?: boolean, kind?: "attack"|"cast"|null}} [options]  `force` clears a GM's own invisibility too.
 * @returns {Promise<boolean>} whether anything was cleared
 */
export async function reveal(actor, { force = false, acting = false, kind = null, valid = () => true,
  preserveIndependentInvisibility = false } = {}) {
  if (!actor || !valid()) return false;
  const equipmentEnded = acting ? await endEquipmentInvisibility(actor, {event:kind}) : false;
  if (!valid()) return equipmentEnded;
  const sneakEnded = await endNpcSneak(actor, { event: acting ? kind : "reveal" });
  if (!valid()) return equipmentEnded || sneakEnded;
  const concealmentEnded = acting && (kind === "attack" || kind === "cast") ? await endConcealments(actor, kind) : false;
  const ended = sneakEnded || concealmentEnded || equipmentEnded;
  if (!valid()) return ended;
  if (acting && !force && (keepsHidden(actor.takenTalents?.() ?? []) || dancing(actor))) return ended;
  const ours = actor.getFlag?.("azeroth-rpg", HIDDEN_FLAG) === true;
  if (!ours && !force) return ended;
  if (isHidden(actor)) {
    if (preserveIndependentInvisibility && ours && !force) {
      // The core Hide is a plain, source-free status carrier. Do not use
      // toggleStatusEffect here: V14 would also delete a spell's single-status
      // carrier. Custom/source-bearing invisibility is independent of Hide.
      const ids=[...(actor.effects??[])].filter(effect=>!effect.origin
        &&effect.statuses?.size===1&&effect.statuses.has(HIDDEN_STATUS)
        &&!Object.keys(effect.flags?.['azeroth-rpg']??{}).length
        &&!(effect.system?.changes??[]).length).map(effect=>effect.id);
      if(ids.length&&valid()){
        await actor.deleteEmbeddedDocuments('ActiveEffect',ids);
        if(ids.some(id=>actor.effects.get(id)))return false;
      }
      else if(valid())ui.notifications?.warn(game.i18n.localize('AZEROTH.AlarmBot.AmbiguousHide'));
    }else await actor.toggleStatusEffect(HIDDEN_STATUS, { active: false });
  }
  if (ours && valid()) await actor.unsetFlag("azeroth-rpg", HIDDEN_FLAG);
  return true;
}

/**
 * The concealments that end at this act, deleted (door 25). Quiet where there are
 * none, and only where this client may write the actor - an attack or a cast is made
 * by the creature's own owner.
 *
 * @param {Actor} actor
 * @param {"attack"|"cast"} kind
 * @returns {Promise<boolean>}
 */
async function endConcealments(actor, kind) {
  const ids = (actor.effects ?? [])
    .filter(e => concealEnds(e.flags?.["azeroth-rpg"]?.[CONCEAL_FLAG] ?? null, kind))
    .map(e => e.id);
  if (!ids.length || !actor.isOwner) return false;
  await actor.deleteEmbeddedDocuments("ActiveEffect", ids.filter(id => actor.effects.has(id)));
  return true;
}
