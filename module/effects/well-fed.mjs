/**
 * Well Fed, laid and ended (D-1922; 05 §16, *Rests and recovery*). The ONE
 * writer of the carrier; `rules/well-fed.mjs` is the law and the roll reads it
 * (`roll-dialog.mjs#prepareRoll`'s ticked line, `AzerothRoll#outcome`).
 *
 * The lead: *"Well Fed gives +1 SL on any test until the next short rest."*
 * Every cooked food from Wilderness Survival grants it; a creature holds ONE
 * at a time, so a second replaces the first. **Starting a Short Rest ends it**,
 * and a cooked food eaten as that rest's food grants a new one once the rest
 * is over (`AzerothActor#shortRest`). A Long Rest ends it too: it is the next
 * rest whatever its length (D-1962).
 *
 * The carrier is an Active Effect with **no `system.changes`** (CLAUDE.md §6:
 * an effect changes numbers, the roll pipeline changes dice), flagged
 * `flags.azeroth-rpg.wellFed {source}`, drawn on the token, with no duration:
 * a rest is its clock (`REST_ENDS_FLAG` names the rest that ends it, read by
 * `AzerothActor#clearRestEnds`).
 */

import { WELL_FED_FLAG, isWellFedEffect } from "../rules/well-fed.mjs";
import { REST_ENDS_FLAG } from "../rules/rest-ends.mjs";

/** The icon the carrier wears: core's own, so a fresh clone never shows a broken image. */
export const WELL_FED_ICON = "icons/consumables/food/bowl-stew-brown.webp";

/**
 * Lay Well Fed on an actor, replacing any it holds (one at a time, D-1922).
 *
 * @param {Actor} actor
 * @param {{source?: string, img?: string|null}} [o]  what was eaten, for the chip and the card
 * @returns {Promise<ActiveEffect|null>}
 */
export async function layWellFed(actor, { source = "", img = null } = {}) {
  if (!actor?.isOwner) return null;
  await endWellFed(actor);
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: game.i18n.localize("AZEROTH.WellFed.Name"),
    img: img || WELL_FED_ICON,
    origin: actor.uuid,
    disabled: false,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON?.ALWAYS ?? 2,
    description: game.i18n.format("AZEROTH.WellFed.Tooltip", { source }),
    flags: { "azeroth-rpg": { [WELL_FED_FLAG]: { source: String(source ?? "") }, [REST_ENDS_FLAG]: "short" } }
  }]);
  return effect ?? null;
}

/** End every Well Fed carrier an actor holds; answers how many went. */
export async function endWellFed(actor) {
  const ids = [...(actor?.effects ?? [])].filter(isWellFedEffect).map(e => e.id);
  if (ids.length && actor.isOwner) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  return ids.length;
}
