/**
 * **A SUSTAIN THAT HOLDS A CREATURE ENDS WHEN THE LAST ONE IS FREED, BY ANY ROUTE** (O-303; the
 * lead, 2026-11-10: *"303 - end it however the creature is freed of the effect"*, widening D-894's
 * *"292 - end when target escapes"*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * 07 §12's Sand Prison: *On a failure it is **Entangled** and **Blinded** ... and leaves the spell
 * when it succeeds. While sustaining this spell you pay 3 Mana at the start of each of your
 * turns.* 07 §12's Stasis says the same words. D-894 ended the Sustain only off a PASSED escape's
 * delete; a creature freed by a GM's hand, Unfading, a rest, an expiry, a removed token or its own
 * fall left the caster holding the spell and paying for it.
 *
 * **WHAT HOLDS**: a condition effect a cast laid that wears the sustained carrier's mark
 * (`sustained`, `cast`) AND the hold mark (`holds`), which `rules/spell-landings.mjs#sustainedMark`
 * and the card's Apply write for a Sustained spell aimed at creatures rather than an area. An area
 * still stands with nobody in it, so an area's conditions never hold its Sustain up. A mark laid
 * before `holds` existed is read by the escape it carries (`leaves`, D-894), Sand Prison's alone.
 *
 * **WHO IS STILL HELD**: a creature on the board (a token on some scene) above 0 Health, carrying
 * such an effect that is on, or switched off only by a hold that switches it back on - Temporal
 * Sanctuary's (`sand-auras.mjs#HELD_FLAG`), Suspended Moment's (`chronomancer.mjs
 * #SUSPENDED_MOMENT_FLAG`) or a Sustain in transfer. A suspended condition is not a freed one.
 */

import { cleanEscape } from "./escapes.mjs";
import { HELD_FLAG } from "./sand-auras.mjs";
import { SUSPENDED_MOMENT_FLAG } from "./chronomancer.mjs";
import { sustainTransferPending } from "./sustain-transfer-suspension.mjs";

const SCOPE = "azeroth-rpg";

/** The flag a hold carrier wears beside `sustained` and `cast`. */
export const HOLDS_FLAG = "holds";

const flagsOf = effect => effect?.flags?.[SCOPE] ?? {};
const statusesOf = effect => [...(effect?.statuses ?? [])].filter(s => typeof s === "string" && s);

/**
 * **THE CAST AN EFFECT HOLDS A CREATURE FOR**, and who cast it: `{cast, by}` where the effect is a
 * hold carrier - sustained, naming a cast, carrying a condition, and marked as holding (or, laid
 * before the mark, riding an escape whose creature leaves the spell) - else null.
 *
 * @param {{flags?: object, statuses?: Iterable<string>, origin?: string|null}|null} effect
 * @returns {{cast: string, by: string|null}|null}
 */
export function holdMarkOf(effect) {
  const f = flagsOf(effect);
  if (f.sustained !== true || typeof f.cast !== "string" || !f.cast) return null;
  if (!statusesOf(effect).length) return null;
  const leaves = cleanEscape(f.escape ?? null)?.leaves === true;
  if (f[HOLDS_FLAG] !== true && !leaves) return null;
  const by = typeof effect?.origin === "string" && effect.origin ? effect.origin : null;
  return { cast: f.cast, by };
}

/**
 * **WHETHER AN EFFECT SWITCHED OFF IS ONLY SUSPENDED**: switched off by a hold that switches it
 * back on - Temporal Sanctuary's stamp on the effect itself, a Suspended Moment on the same
 * creature naming it, or a Sustain in transfer.
 *
 * @param {object} effect
 * @param {object[]} [siblings]  every effect on the same creature
 */
export function suspendedOnly(effect, siblings = []) {
  if (!effect || effect.disabled !== true) return false;
  if (flagsOf(effect)[HELD_FLAG]) return true;
  if (sustainTransferPending(effect)) return true;
  const id = effect.id ?? effect._id ?? null;
  return Boolean(id) && (siblings ?? []).some(s => (flagsOf(s)[SUSPENDED_MOMENT_FLAG]?.held ?? []).includes(id));
}

/**
 * **WHETHER ONE CREATURE IS STILL HELD BY A CAST**: above 0 Health (a creature that keeps none
 * counts), on the board, carrying an effect the cast laid with a condition on it - on, or
 * switched off only by a hold that resumes. Any condition carrier the cast laid counts (the card's
 * Apply as much as a failed Resist), so a creature is free only once all of them are gone.
 *
 * @param {{effects?: object[], cast?: string|null, health?: number|null, onBoard?: boolean}} o
 */
export function creatureHeld({ effects = [], cast = null, health = null, onBoard = true } = {}) {
  if (!cast || onBoard !== true) return false;
  if (typeof health === "number" && Number.isFinite(health) && health <= 0) return false;
  const all = [...(effects ?? [])];
  return all.some(e => {
    const f = flagsOf(e);
    if (f.sustained !== true || f.cast !== cast || !statusesOf(e).length) return false;
    return e.disabled !== true || suspendedOnly(e, all);
  });
}

/**
 * **WHETHER A FREEING ENDS THE SUSTAIN**: the caster still holds the cast and nobody is held.
 * Closed by default: a count that is not a whole number ends nothing.
 *
 * @param {{casterHolds?: boolean, othersHeld?: number|null}} o
 */
export function freedEndsSustain({ casterHolds = false, othersHeld = null } = {}) {
  return casterHolds === true && Number.isInteger(othersHeld) && othersHeld === 0;
}
