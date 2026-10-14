/**
 * **SPELLSTEAL, WHERE IT TOUCHES THE WORLD** (04-TALENTS, the Mage's Arcane
 * branch; D-775): *Your Counterspell class feature also ends one effect the
 * caster is Sustaining.* `workflows.useFeature` judges the Use, names the caster
 * and asks which Sustain through the one chooser; this ends it through the ONE
 * door that ends one Sustain (`workflows.endSustain`, D-760), matched on the cast
 * the entry recorded (D-724) - here where this client may write the caster, on
 * the active GM's client through `CONFIG.queries` where it may not (never
 * `game.socket`, D-643).
 *
 * Rank 2's *you may Sustain that effect yourself instead* is a question for the
 * lead: a Sustain, what it laid and the area it placed answer to the caster who
 * cast it, and nothing moves one to another caster.
 */

import { counterspellFor } from "../rules/class-talents.mjs";

/** The query a Sustain held by a creature this client does not own is ended through. */
export const STEAL_SUSTAIN_QUERY = "azeroth-rpg.stealSustain";

/** What `endSustain` matches an entry on: its cast where it recorded one, else the spell. */
function keyOf(entry = {}) {
  const cast = entry?.cast ?? null;
  return cast ? { cast, spellId: null, uuid: null } : { cast: null, spellId: entry?.spellId ?? null, uuid: entry?.uuid ?? null };
}

/** End the Sustain on a caster this client may write; the entry ended, or null. */
async function endHere(caster, key) {
  const ended = await game.system.azeroth.workflows.endSustain({
    actor: caster, cast: key.cast, spellId: key.spellId, uuid: key.uuid, notice: "AZEROTH.Spellsteal.Ended"
  });
  return ended ? { name: ended.name ?? "" } : null;
}

/**
 * **END ONE SUSTAIN THE CASTER HOLDS**, by the mage's Counterspell.
 *
 * @param {{caster: Actor, entry: object, by: Actor}} o  `entry` the Sustain entry the chooser named
 * @returns {Promise<{name: string}|null>}  what ended, as far as this client knows
 */
export async function stealSustain({ caster = null, entry = null, by = null } = {}) {
  if (!caster || !entry || !by) return null;
  const key = keyOf(entry);
  if (caster.isOwner) return endHere(caster, key);
  const gm = game.users?.activeGM ?? null;
  if (!gm) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Spellsteal.NoGM"));
    return null;
  }
  try {
    const answer = await gm.query(STEAL_SUSTAIN_QUERY, { casterUuid: caster.uuid, mageUuid: by.uuid, ...key }, { timeout: 15000 });
    return answer?.name !== undefined ? { name: answer.name } : null;
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}

/**
 * The GM-side handler. The asker must own the MAGE - it was their Counterspell -
 * and the mage must still hold Spellsteal, judged again here off the world as the
 * GM's client holds it. Throws with the reason.
 */
export async function stealSustainQueryHandler({ casterUuid = null, mageUuid = null, cast = null, spellId = null, uuid = null } = {}, { user = null } = {}) {
  const caster = casterUuid ? await fromUuid(casterUuid) : null;
  const mage = mageUuid ? await fromUuid(mageUuid) : null;
  if (caster?.documentName !== "Actor" || mage?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !mage.testUserPermission(user, "OWNER")) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: mage.name }));
  }
  if (typeof mage.takenTalents !== "function" || !counterspellFor(mage.takenTalents()).steals) {
    throw new Error(game.i18n.format("AZEROTH.Spellsteal.NoTalent", { name: mage.name }));
  }
  const ended = await endHere(caster, { cast, spellId, uuid });
  if (!ended) throw new Error(game.i18n.format("AZEROTH.Spellsteal.NothingHeld", { target: caster.name }));
  return ended;
}
