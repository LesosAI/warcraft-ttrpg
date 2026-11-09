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
 * - **Font of Magic's Mana** (04's Spell-Weaver: *spend any amount of Rage. One ally within
 *   30 feet regains that much Mana, to no more than its maximum*; stage 3B): the Rage
 *   branch of the one Mana gift. The Rage is the giver's choice, so it cannot be worked
 *   out again off the talents: the giver's own `fontOfMagic` flag records what was spent
 *   and for whom, written after the payment, and the GM's handler reads THAT - never the
 *   request - and clears it, so one Font lands once. **And Spellthief's 2 Mana** at rank 2,
 *   worked out again off the giver's talents.
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
import { fontMana, fontOfMagicFor, spellthiefFor } from "../rules/chromatic-talents.mjs";

/** The giver's flag one Font's spend waits under until its Mana lands (stage 3B). */
export const FONT_FLAG = "fontOfMagic";

/** The giver's flag one Spellthief's Mana waits under until it lands (stage 3B). */
export const THIEF_FLAG = "spellthiefGift";

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

/**
 * **ONE FONT, WORKED OUT** (04's Font of Magic and Overflow): what the ally's pool takes for
 * the Rage spent, off the giver's talents as they stand.
 */
function fontAmount(giver, recipient, spent) {
  const plan = fontOfMagicFor(giver?.takenTalents?.() ?? [], talentEffect);
  const pool = manaPool(recipient?.poolSnapshot?.() ?? []);
  if (!plan || !pool) return 0;
  return fontMana({ spent, add: plan.add, value: pool.value, max: pool.max });
}

/** What the giver's Spellthief gives an ally at rank 2, off the giver's own talents, or 0. */
function thiefAmount(giver) {
  return spellthiefFor(giver?.takenTalents?.() ?? [], { tier: giver?.system?.tier ?? 1 }, talentEffect)?.allyMana ?? 0;
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
export async function giveMana({ giver, recipient, amount, pool = null }) {
  if (!giver || !recipient || !(amount > 0)) return 0;
  // **THE RAGE BRANCH** (04's Font of Magic; stage 3B): the spend recorded on the giver
  // first, so the GM's handler reads the giver's record and never the request.
  if (pool === "rage") {
    const spent = Math.max(0, Math.trunc(Number(amount)) || 0);
    if (recipient.isOwner) return manaHere(recipient, fontAmount(giver, recipient, spent));
    await giver.setFlag("azeroth-rpg", FONT_FLAG, { recipient: recipient.uuid, spent });
    const done = await viaGM({ act: "font", giverUuid: giver.uuid, recipientUuid: recipient.uuid });
    return Number(done?.gained) || 0;
  }
  // **SPELLTHIEF'S MANA** (stage 3B), worked out again off the giver's talents.
  if (pool === "spellthief") {
    if (recipient.isOwner) return manaHere(recipient, thiefAmount(giver));
    await giver.setFlag("azeroth-rpg", THIEF_FLAG, { recipient: recipient.uuid });
    const done = await viaGM({ act: "spellthief", giverUuid: giver.uuid, recipientUuid: recipient.uuid });
    return Number(done?.gained) || 0;
  }
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
  if (act === "font") {
    // The giver's record of the spend, read here and cleared, so one Font lands once.
    const record = giver.getFlag("azeroth-rpg", FONT_FLAG) ?? null;
    if (!record || record.recipient !== recipient.uuid) return { gained: 0 };
    await giver.unsetFlag("azeroth-rpg", FONT_FLAG);
    return { gained: await manaHere(recipient, fontAmount(giver, recipient, Math.max(0, Math.trunc(Number(record.spent)) || 0))) };
  }
  if (act === "spellthief") {
    const record = giver.getFlag("azeroth-rpg", THIEF_FLAG) ?? null;
    if (!record || record.recipient !== recipient.uuid) return { gained: 0 };
    await giver.unsetFlag("azeroth-rpg", THIEF_FLAG);
    return { gained: await manaHere(recipient, thiefAmount(giver)) };
  }
  return { gained: await manaHere(recipient, hymnAmount(giver)) };
}
