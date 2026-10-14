/**
 * **HAUNT, WHERE IT TOUCHES THE WORLD** (04-TALENTS, the Warlock's Affliction
 * branch; D-775): *On success each ongoing effect of yours on that target deals 1
 * further damage per rank, of that effect's own damage type, and you restore
 * Health equal to your tier when the target dies.* `rules/class-talents.mjs#hauntedTick`
 * is the law - the tick's own amount raised, its type untouched, the heal carried
 * on it for `effects/after-blow.mjs#deathRewards` to read off the fallen creature -
 * and this writes it: here where this client may write the creature, on the
 * active GM's client through `CONFIG.queries` where it may not (never
 * `game.socket`, D-643).
 *
 * *Each ongoing effect of yours* is each damage tick the warlock laid there (MY
 * READING, for the lead: an effect that deals no damage has nothing to raise).
 */

import { hauntedTick, onUseMageWarlock } from "../rules/class-talents.mjs";
import { onUseOf, talentEffect } from "../rules/talent-effects.mjs";
import { tickEffectsOf } from "./ticks.mjs";

/** The query a Haunt on a creature this client does not own goes through. */
export const HAUNT_QUERY = "azeroth-rpg.haunt";

/** Raise the warlock's ticks on a creature this client may write; how many. */
async function raiseHere({ target, warlock, add, heal }) {
  const updates = [];
  for (const effect of tickEffectsOf(target)) {
    const tick = effect.flags?.["azeroth-rpg"]?.tick ?? null;
    if (!tick || tick.kind !== "damage" || tick.source !== warlock.uuid) continue;
    updates.push({ _id: effect.id, "flags.azeroth-rpg.tick": hauntedTick(tick, { add, by: warlock.uuid, heal }) });
  }
  if (updates.length) await target.updateEmbeddedDocuments("ActiveEffect", updates);
  return updates.length;
}

/**
 * **HAUNT THE CREATURE**: every damage tick of the warlock's on it raised.
 *
 * @param {{target: Actor, by: Actor, add: number, heal: number}} o
 * @returns {Promise<number>}  how many ticks were raised, as far as this client knows
 */
export async function hauntTarget({ target = null, by = null, add = 0, heal = 0 } = {}) {
  if (!target || !by) return 0;
  const n = Math.max(0, Math.trunc(Number(add)) || 0);
  const h = Math.max(0, Math.trunc(Number(heal)) || 0);
  if (target.isOwner) return raiseHere({ target, warlock: by, add: n, heal: h });
  const gm = game.users?.activeGM ?? null;
  if (!gm) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Haunt.NoGM"));
    return 0;
  }
  try {
    const answer = await gm.query(HAUNT_QUERY, { targetUuid: target.uuid, warlockUuid: by.uuid, add: n, heal: h }, { timeout: 15000 });
    return Math.max(0, Math.trunc(Number(answer?.raised)) || 0);
  } catch (err) {
    ui.notifications?.warn(err.message);
    return 0;
  }
}

/**
 * The GM-side handler. The asker must own the WARLOCK, and the raise is read off
 * the warlock's own Haunt row here - never the request's numbers - at the rank
 * and tier the GM's world holds. Throws with the reason.
 */
export async function hauntQueryHandler({ targetUuid = null, warlockUuid = null } = {}, { user = null } = {}) {
  const target = targetUuid ? await fromUuid(targetUuid) : null;
  const warlock = warlockUuid ? await fromUuid(warlockUuid) : null;
  if (target?.documentName !== "Actor" || warlock?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !warlock.testUserPermission(user, "OWNER")) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: warlock.name }));
  }
  // The row's own reading (`onUseMageWarlock`), at the warlock's rank and tier.
  const talent = (warlock.items ?? []).find(i => i.type === "talent" && (Number(i.system?.taken) || 0) > 0
    && onUseOf(talentEffect(i.system?.className, i.system?.identifier, i.system?.race ?? null))?.haunt);
  const haunt = talent
    ? onUseMageWarlock(onUseOf(talentEffect(talent.system.className, talent.system.identifier, talent.system.race ?? null)), {
        rank: Number(talent.system.taken) || 1, tier: warlock.system?.tier ?? 1
      }).haunt
    : null;
  if (!haunt) throw new Error(game.i18n.format("AZEROTH.Haunt.NoTalent", { name: warlock.name }));
  return { raised: await raiseHere({ target, warlock, add: haunt.add, heal: haunt.heal }) };
}
