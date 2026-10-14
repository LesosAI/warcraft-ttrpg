/**
 * **WHAT A PRIEST'S OR A SHAMAN'S USE GIVES ANOTHER CREATURE** (04; D-774):
 *
 * - **Hymn of Hope's Mana** (*As a Full Action, every friendly target within 30
 *   feet regains Mana equal to your tier per rank*): into each ally's own Mana
 *   pool (`rules/pools.mjs#manaPool` - a creature's lone Power pool is its Mana),
 *   never past its maximum;
 * - **Undying Spirit's friend** (*one Dying friendly target within 30 feet returns
 *   with you at 1 Health*): a creature at 0 Health set to 1, its Death Steps
 *   cleared as any heal from 0 clears them (D-629);
 * - **Ancestral Guidance's friend** (*When your Earthliving triggers, one friendly
 *   target within 10 feet restores the same amount*): Earthliving's heal through
 *   the one healing door, the shaman its giver.
 *
 * Here where this client may write the creature, and on the active GM's client
 * through `CONFIG.queries` where it may not (never `game.socket`, D-643). The
 * handler asks that the asker own the GIVER and that the giver hold the talent,
 * and works the number out again off the giver's own talents - never off the
 * request.
 */

import { earthlivingFor, guidanceFor, onUsePriestShaman, reincarnationFor } from "../rules/class-talents.mjs";
import { talentEffect } from "../rules/talent-effects.mjs";
import { manaPool } from "../rules/pools.mjs";

/** The query a gift to a creature this client does not own goes through. */
export const GIFT_QUERY = "azeroth-rpg.talentGift";

/** The identifier of the talent whose Use gives Mana (04's Hymn of Hope). */
const HYMN = "hymn-of-hope";

/** What the giver's Hymn of Hope restores, worked out off the giver's own talents, or 0. */
function hymnAmount(giver) {
  const t = (giver?.takenTalents?.() ?? []).find(x => x.identifier === HYMN) ?? null;
  if (!t) return 0;
  const row = talentEffect(t.className, t.identifier);
  return onUsePriestShaman(row?.onUse ?? null, { rank: Math.max(1, Math.trunc(Number(t.taken)) || 1), tier: giver.system?.tier ?? 1 }).restores?.amount ?? 0;
}

/**
 * What the giver's Ancestral Guidance restores a friend - Earthliving's own heal,
 * a melee attack's - worked out off the giver's own talents, or 0 where the giver
 * holds no Ancestral Guidance.
 */
function guidanceAmount(giver) {
  const talents = giver?.takenTalents?.() ?? [];
  if (!guidanceFor(talents)) return 0;
  return earthlivingFor(talents, { melee: true, tier: giver.system?.tier ?? 1 })?.heal ?? 0;
}

/** Mana into a creature's Mana pool here. Answers what landed. */
async function manaHere(recipient, amount) {
  const pool = manaPool(recipient?.poolSnapshot?.() ?? []);
  if (!pool || !(amount > 0)) return 0;
  const value = Math.min(pool.max, pool.value + amount);
  if (value <= pool.value) return 0;
  await recipient.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  return value - pool.value;
}

/** A Dying creature stood up at 1 Health here. Answers whether it rose. */
async function riseHere(recipient) {
  if ((recipient.system?.health?.value ?? 1) > 0) return false;
  await recipient.update({ "system.health.value": 1 });
  if (recipient.type === "character") await recipient.standUp?.();
  return true;
}

/** Ask the active GM, or say why nothing happened. */
async function viaGM(payload) {
  const gm = game.users?.activeGM ?? null;
  if (!gm) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Gift.NoGM"));
    return null;
  }
  try {
    return await gm.query(GIFT_QUERY, payload, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}

/**
 * Hymn of Hope's Mana into one ally.
 *
 * @param {{giver: Actor, recipient: Actor, amount: number}} o
 * @returns {Promise<number>}  the Mana that landed
 */
export async function giveMana({ giver, recipient, amount }) {
  if (!giver || !recipient || !(amount > 0)) return 0;
  if (recipient.isOwner) return manaHere(recipient, Math.trunc(amount));
  const done = await viaGM({ act: "mana", giverUuid: giver.uuid, recipientUuid: recipient.uuid });
  return Number(done?.gained) || 0;
}

/**
 * Undying Spirit's friend, returned at 1 Health with the shaman.
 *
 * @param {{giver: Actor, recipient: Actor}} o
 * @returns {Promise<boolean>}
 */
export async function raiseAlly({ giver, recipient }) {
  if (!giver || !recipient) return false;
  if (recipient.isOwner) return riseHere(recipient);
  const done = await viaGM({ act: "rise", giverUuid: giver.uuid, recipientUuid: recipient.uuid });
  return done?.risen === true;
}

/**
 * Ancestral Guidance's heal on one friend, the shaman its giver (so a Fel or
 * Undeath rung on the friend reduces it, 10 §4).
 *
 * @param {{giver: Actor, recipient: Actor, amount: number}} o  `amount` the card's own
 * @returns {Promise<boolean>}  whether the heal was given
 */
export async function healAlly({ giver, recipient, amount }) {
  if (!giver || !recipient || !(amount > 0)) return false;
  if (recipient.isOwner) {
    await recipient.applyHealing(Math.trunc(amount), { from: giver });
    return true;
  }
  const done = await viaGM({ act: "heal", giverUuid: giver.uuid, recipientUuid: recipient.uuid });
  return done?.healed === true;
}

/**
 * The GM-side handler (`GIFT_QUERY`). Throws with the reason, which travels back
 * to the caller.
 */
export async function giftQueryHandler({ act = "mana", giverUuid = null, recipientUuid = null } = {}, { user = null } = {}) {
  const giver = giverUuid ? await fromUuid(giverUuid) : null;
  const recipient = recipientUuid ? await fromUuid(recipientUuid) : null;
  if (giver?.documentName !== "Actor" || recipient?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !giver.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: giver.name }));
  if (act === "rise") {
    if (!reincarnationFor(giver.takenTalents?.() ?? []).ally) return { risen: false };
    return { risen: await riseHere(recipient) };
  }
  if (act === "heal") {
    const n = guidanceAmount(giver);
    if (!(n > 0)) return { healed: false };
    await recipient.applyHealing(n, { from: giver });
    return { healed: true };
  }
  return { gained: await manaHere(recipient, hymnAmount(giver)) };
}
