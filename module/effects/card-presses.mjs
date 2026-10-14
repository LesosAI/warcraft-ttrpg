/**
 * **A CARD'S PRESS, RECORDED ON THE CARD** (the architect's review of D-774).
 *
 * A chat card may be written by its author and by a GM alone (14.367: a
 * ChatMessage's OWNER level is its author's). A talent button pressed by an owner
 * of the speaker who did not post the card - a player's character whose card the
 * GM rolled - was refused the write that recorded the press, and refused it AFTER
 * the use, the heal or the attack it counted: Overload's use was struck and the
 * card never knew, and a feature card's Attack (D-773) was never counted, so it
 * could be pressed again for ever. The record is written here where this client
 * may write the card, and on the active GM's client through
 * `azeroth-rpg.cardPress` where it may not, judged again where it is written
 * (`rules/gm-writes.mjs#pressClaim`), so two presses at once cannot both pass.
 * With no GM online and a card this client did not post, the press is refused in
 * words before anything is spent.
 */

import { cleanClaim, gmAbsentFor, pressClaim } from "../rules/gm-writes.mjs";

/** The query a press on a card this client did not post goes through. */
export const CARD_PRESS_QUERY = "azeroth-rpg.cardPress";

/** Write the claim here; the caller has established that this client may write the card. */
async function claimHere(message, claim) {
  const judged = pressClaim(message.flags?.["azeroth-rpg"] ?? {}, claim);
  if (!judged.ok) return { ok: false, reason: judged.reason };
  await message.update(Object.fromEntries(Object.entries(judged.update).map(([k, v]) => [`flags.azeroth-rpg.${k}`, v])));
  return { ok: true, reason: null };
}

/**
 * Whether a press on this card can be recorded at all from this client: it may
 * write the card, or a GM is online to write it.
 *
 * @param {ChatMessage} message
 */
export function cardPressUnrecordable(message) {
  return gmAbsentFor({ owned: [message?.isOwner === true], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });
}

/**
 * Record one press on a card, judged against what the card records.
 *
 * @param {ChatMessage} message
 * @param {object} claim  `rules/gm-writes.mjs#pressClaim`'s
 * @returns {Promise<{ok: boolean, reason: string|null}>}  `reason` an i18n key, or a
 *   GM's refusal already in words
 */
export async function claimCardPress(message, claim) {
  const clean = cleanClaim(claim);
  if (!message || !clean) return { ok: false, reason: "AZEROTH.Card.ActorGone" };
  if (message.isOwner) return claimHere(message, clean);
  const gm = game.users?.activeGM ?? null;
  if (!gm) return { ok: false, reason: "AZEROTH.Card.PressNoGM" };
  try {
    const done = await gm.query(CARD_PRESS_QUERY, { messageId: message.id, claim: clean }, { timeout: 15000 });
    return { ok: done?.ok === true, reason: done?.reason ?? null };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * The GM-side handler (`CARD_PRESS_QUERY`). The asker must own the card's speaker
 * or have posted the card. What the card offers is the CARD's word, never the
 * request's: a heal's allowance is the count the card recorded when it was rolled,
 * and a press is only of a button the card carries.
 */
export async function cardPressQueryHandler({ messageId = null, claim = {} } = {}, { user = null } = {}) {
  const message = messageId ? (game.messages?.get(messageId) ?? null) : null;
  if (!message) throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
  const speaker = ChatMessage.getSpeakerActor(message.speaker);
  const asker = user ?? null;
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const clean = cleanClaim(claim);
  if (!clean) throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
  // **A FONT'S CHARGE IS ANY FRIEND'S** (04's Lightwell; the lead, 2026-10-03, on
  // O-184: *"Other players spend a half-action to expend a charge."*; D-779): the
  // asker must own the creature taking it, and the charges are the card's own.
  if (clean.kind === "charge") {
    if (!flags.lightwell) throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
    const taker = await fromUuid(clean.uuid);
    if (asker && (taker?.documentName !== "Actor" || !taker.testUserPermission(asker, "OWNER"))) throw new Error(game.i18n.localize("AZEROTH.Card.NotYours"));
    clean.allowed = Math.max(0, Math.trunc(Number(flags.lightwell.charges)) || 0);
    return claimHere(message, clean);
  }
  if (asker && message.author?.id !== asker.id && !speaker?.testUserPermission(asker, "OWNER")) {
    throw new Error(game.i18n.localize("AZEROTH.Card.NotYours"));
  }
  if (clean.kind === "once" && !flags[clean.press]) throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
  if (clean.kind === "heal") {
    if (!flags.guidance) throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
    clean.allowed = Math.max(1, Math.trunc(Number(flags.guidance.count)) || 1);
  }
  return claimHere(message, clean);
}
