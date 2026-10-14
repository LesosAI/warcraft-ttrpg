/**
 * **A CREATURE LOSES ITS REACTION** (D-773): 04's Concussive Shot at rank 2 (*it
 * also loses its Reaction*), Waylay (*A target you attack while hidden cannot use
 * a Reaction until its next turn*) and Paralytic (*loses its next Reaction*).
 *
 * 06 §6: *You have one Reaction per round and it refreshes at the start of your
 * turn.* Spending the one it holds is the whole of *cannot use a Reaction until
 * its next turn*, so the write is the combatant's own queued budget door
 * (`AzerothCombatant#loseReaction`, inside `oneAtATime`, D-761) and never a flag
 * written beside it.
 *
 * ## A player cannot write the GM's combatant
 *
 * The striker's client asks the active GM's client through `CONFIG.queries`
 * where it does not own the target's combatant - D-693's Bane, D-770's inflict -
 * and never `game.socket`. The handler checks that the asker owns the creature
 * that struck, because core checks only `QUERY_USER`.
 *
 * Out of a started fight there is no Reaction to lose (06 §6's one a round is a
 * rule about rounds), and the answer says so.
 */

export const LOSE_REACTION_QUERY = "azeroth-rpg.loseReaction";

/** The combatant a creature fights as, in the fight it is in, or null. */
function combatantOf(actor) {
  const fight = actor?.activeFight?.() ?? null;
  return fight?.started ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
}

/** What one loss came to: the creature, whether a Reaction went, and why not. */
function loss(name, lost, reason = null) {
  return { name: String(name ?? ""), lost, reason };
}

/** Here, where this client may write the combatant. */
async function loseHere(victim) {
  const combatant = combatantOf(victim);
  if (!combatant) return loss(victim?.name, false, "noFight");
  const done = await combatant.loseReaction();
  return loss(victim.name, done?.lost === true, done?.lost === true ? null : "none");
}

/**
 * The GM-side handler. Throws with the reason, which travels back as the refusal.
 */
export async function loseReactionQueryHandler({ victimUuid = null, originUuid = null } = {}, { user = null } = {}) {
  const victim = victimUuid ? await fromUuid(victimUuid) : null;
  if (!victim || victim.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user) {
    const origin = originUuid ? await fromUuid(originUuid) : null;
    if (origin?.documentName !== "Actor" || !origin.testUserPermission(user, "OWNER")) {
      throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: origin?.name ?? "" }));
    }
  }
  return loseHere(victim);
}

/**
 * Take the Reaction a creature holds, and say what came of it.
 *
 * @param {{victim: Actor|null, by?: Actor|null, name?: string}} o
 * @returns {Promise<{name: string, lost: boolean, reason: string|null}>}
 *   `reason`: `noFight`, `none` (none left to lose), `gone`, `error`
 */
export async function loseReaction({ victim = null, by = null, name = "" } = {}) {
  if (!victim) return loss(name, false, "gone");
  try {
    const combatant = combatantOf(victim);
    if (!combatant) return loss(victim.name, false, "noFight");
    if (combatant.isOwner) return await loseHere(victim);
    const gm = game.users.activeGM;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
    const done = await gm.query(LOSE_REACTION_QUERY, { victimUuid: victim.uuid, originUuid: by?.uuid ?? null }, { timeout: 15000 });
    return done && typeof done === "object" ? loss(done.name ?? victim.name, done.lost === true, done.reason ?? null) : loss(victim.name, false, "error");
  } catch (err) {
    ui.notifications?.warn(err.message);
    return loss(victim.name, false, "error");
  }
}

/** One loss, in words for a card. */
export function reactionLossText(row) {
  if (row?.lost) return game.i18n.format("AZEROTH.ReactionLoss.Lost", { name: row.name });
  if (row?.reason === "none") return game.i18n.format("AZEROTH.ReactionLoss.None", { name: row?.name ?? "" });
  if (row?.reason === "noFight") return game.i18n.format("AZEROTH.ReactionLoss.NoFight", { name: row?.name ?? "" });
  return game.i18n.format("AZEROTH.ReactionLoss.Not", { name: row?.name ?? "" });
}
