/**
 * **SHADOWFORM'S MARK** (04: *If you have not dealt Holy damage or used a healing
 * spell or feature since your last turn, you may add 1 Shadow damage per rank to
 * your spells and attacks*; D-774). The damage line was the table's (`when:
 * "judgement"`) because nothing recorded either: a Holy blow dealt is marked by
 * the one damage door (`effects/after-blow.mjs`), a healing spell or feature
 * used by the cast and the Use, and the mark is cleared at the end of the
 * holder's own turn (`AzerothCombat#_onEndTurn`). `rules/class-talents.mjs
 * #shadowformHolds` reads it for the dialog's line, ticked where nothing has been
 * marked since the holder's last turn.
 *
 * The actor's own flag, written where this client may write the holder; a mark
 * nobody here may write is left (MY READING, for the lead: the GM applies a
 * blow, and the GM may write every holder).
 */

import { SHADOWFORM_FLAG, marksLightUse } from "../rules/class-talents.mjs";

/**
 * Mark the holder, in a fight, once a fight's turn.
 *
 * @param {Actor|null} actor
 */
export async function markLightUsed(actor) {
  if (!actor?.isOwner || actor.type !== "character") return false;
  if (!marksLightUse(actor.takenTalents?.() ?? [])) return false;
  const fight = actor.activeFight?.() ?? null;
  if (!fight || actor.getFlag("azeroth-rpg", SHADOWFORM_FLAG)?.combat === fight.id) return false;
  await actor.setFlag("azeroth-rpg", SHADOWFORM_FLAG, { combat: fight.id, round: fight.round });
  return true;
}

/**
 * Clear the mark at the end of the holder's own turn (*since your last turn*: MY
 * READING, for the lead - a heal made during your turn counts until that turn
 * ends, and one made during somebody else's until your next turn ends).
 *
 * @param {Actor|null} actor
 */
export async function clearLightUsed(actor) {
  if (!actor?.isOwner || !actor.getFlag?.("azeroth-rpg", SHADOWFORM_FLAG)) return false;
  await actor.unsetFlag("azeroth-rpg", SHADOWFORM_FLAG);
  return true;
}
