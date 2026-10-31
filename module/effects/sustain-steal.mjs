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
 * Rank 2 ruling (2026-10-30): move the effect onto the stealing Mage, who
 * sustains and pays for it. This module implements ENDING only; the paid
 * transfer coordinator is spellsteal-use.mjs. See the automation audit's
 * SPELLSTEAL.md for supported carrier shapes and outstanding work.
 */

import { counterspellFor } from "../rules/class-talents.mjs";
import { refuseIceBlockTarget } from "./ice-block-protection.mjs";
import { refuseDispersion } from "./dispersion-protection.mjs";

/** The query a Sustain held by a creature this client does not own is ended through. */
export const STEAL_SUSTAIN_QUERY = "azeroth-rpg.stealSustain";

/** What `endSustain` matches an entry on: its cast where it recorded one, else the spell. */
function keyOf(entry = {}) {
  const cast = entry?.cast ?? null;
  return cast ? { cast, spellId: null, uuid: null } : { cast: null, spellId: entry?.spellId ?? null, uuid: entry?.uuid ?? null };
}

/** End the Sustain on a caster this client may write; the entry ended, or null. */
async function endHere(caster, key, mage) {
  if (refuseIceBlockTarget(caster) || refuseIceBlockTarget(mage)) return null;
  if (refuseDispersion(caster, "target")) return null;
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
  if (!game.user?.id || !by.testUserPermission?.(game.user, "OWNER")) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: by.name }));
    return null;
  }
  if (typeof by.takenTalents !== "function" || !counterspellFor(by.takenTalents()).steals) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Spellsteal.NoTalent", { name: by.name }));
    return null;
  }
  if (refuseIceBlockTarget(caster) || refuseIceBlockTarget(by)) return null;
  if (refuseDispersion(caster, "target")) return null;
  const key = keyOf(entry);
  if (caster.isOwner) return endHere(caster, key, by);
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
  const requireWriter = () => {
    if (!user?.id || !game.user?.isGM || game.users?.activeGM?.id !== game.user.id) {
      throw new Error(game.i18n.localize("AZEROTH.Spellsteal.QueryAuthority"));
    }
  };
  requireWriter();
  const caster = casterUuid ? await fromUuid(casterUuid) : null;
  const mage = mageUuid ? await fromUuid(mageUuid) : null;
  requireWriter();
  if (caster?.documentName !== "Actor" || mage?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (!mage.testUserPermission(user, "OWNER")) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: mage.name }));
  }
  if (typeof mage.takenTalents !== "function" || !counterspellFor(mage.takenTalents()).steals) {
    throw new Error(game.i18n.format("AZEROTH.Spellsteal.NoTalent", { name: mage.name }));
  }
  const ended = await endHere(caster, { cast, spellId, uuid }, mage);
  if (!ended) throw new Error(game.i18n.format("AZEROTH.Spellsteal.NothingHeld", { target: caster.name }));
  return ended;
}
