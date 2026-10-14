/**
 * **SOUL SWAP, WHERE IT TOUCHES THE WORLD** (04-TALENTS, the Warlock's Affliction
 * branch; D-775): *Every ongoing effect of yours ends on the first target and
 * begins on the second, keeping its remaining duration, its damage and its damage
 * type.* `rules/class-talents.mjs#swappableEffects` says which effects are the
 * warlock's; `workflows.useFeature` judges the two creatures and the reach. This
 * moves them - here where this client may write both creatures, on the active
 * GM's client through `CONFIG.queries` where it may not (never `game.socket`,
 * D-643).
 *
 * - **Whole**: each effect is copied as it stands - its tick, its changes, its
 *   statuses, its `duration` and its `start` - so the turns left, the damage and
 *   the type travel with it.
 * - **Its turn follows the creature**: a span keyed on the first creature's own
 *   combatant (`effects/durations.mjs` writes the victim's, D-628) is keyed on the
 *   second's in the same fight.
 * - **Created first, then ended**: a create that fails leaves the first creature
 *   carrying everything (a duplicate is curable and a loss is not, D-745).
 */

import { swappableEffects } from "../rules/class-talents.mjs";

/** The query a swap touching a creature this client does not own goes through. */
export const SOUL_SWAP_QUERY = "azeroth-rpg.soulSwap";

/** An actor's effects as `swappableEffects` reads them. */
function plainEffects(actor) {
  return (actor?.effects ?? []).map(e => ({ id: e.id, origin: e.origin ?? null, flags: e.flags ?? {} }));
}

/** One effect's data, re-keyed onto the second creature's turn where it named the first's. */
function movedData(effect, { from, to }) {
  const data = effect.toObject();
  delete data._id;
  const combat = data.start?.combat ? (game.combats?.get(data.start.combat) ?? null) : null;
  if (combat && data.start?.combatant) {
    const first = combat.getCombatantsByActor?.(from)?.[0] ?? null;
    const second = combat.getCombatantsByActor?.(to)?.[0] ?? null;
    if (first && second && data.start.combatant === first.id) data.start.combatant = second.id;
  }
  return data;
}

/** Move what the warlock laid, on a client that may write both creatures. */
async function moveHere({ from, to, warlock }) {
  const ids = swappableEffects(plainEffects(from), { caster: warlock.uuid });
  const effects = ids.map(id => from.effects.get(id)).filter(Boolean);
  if (!effects.length) return 0;
  const made = await to.createEmbeddedDocuments("ActiveEffect", effects.map(e => movedData(e, { from, to })));
  const still = effects.map(e => e.id).filter(id => from.effects.has(id));
  if (still.length) await from.deleteEmbeddedDocuments("ActiveEffect", still);
  return made?.length ?? 0;
}

/**
 * **MOVE EVERY ONGOING EFFECT OF THE WARLOCK'S** from the first creature to the
 * second.
 *
 * @param {{from: Actor, to: Actor, by: Actor}} o
 * @returns {Promise<number>}  how many moved, as far as this client knows
 */
export async function swapEffects({ from = null, to = null, by = null } = {}) {
  if (!from || !to || !by) return 0;
  if (from.isOwner && to.isOwner) return moveHere({ from, to, warlock: by });
  const gm = game.users?.activeGM ?? null;
  if (!gm) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.SoulSwap.NoGM"));
    return 0;
  }
  try {
    const answer = await gm.query(SOUL_SWAP_QUERY, { firstUuid: from.uuid, secondUuid: to.uuid, warlockUuid: by.uuid }, { timeout: 15000 });
    return Math.max(0, Math.trunc(Number(answer?.moved)) || 0);
  } catch (err) {
    ui.notifications?.warn(err.message);
    return 0;
  }
}

/**
 * The GM-side handler. The asker must own the WARLOCK - it was their Use - and the
 * effects are read again here off the first creature as the GM's world holds it.
 * Throws with the reason.
 */
export async function soulSwapQueryHandler({ firstUuid = null, secondUuid = null, warlockUuid = null } = {}, { user = null } = {}) {
  const from = firstUuid ? await fromUuid(firstUuid) : null;
  const to = secondUuid ? await fromUuid(secondUuid) : null;
  const warlock = warlockUuid ? await fromUuid(warlockUuid) : null;
  if (from?.documentName !== "Actor" || to?.documentName !== "Actor" || warlock?.documentName !== "Actor") {
    throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  }
  if (user && !warlock.testUserPermission(user, "OWNER")) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: warlock.name }));
  }
  return { moved: await moveHere({ from, to, warlock }) };
}
