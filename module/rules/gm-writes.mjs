/**
 * **A WRITE TO SOMEBODY ELSE'S DOCUMENT, JUDGED BEFORE ANYTHING IS SPENT** (the
 * architect's review of D-774).
 *
 * A creature this client does not own, and a chat card it did not post, are
 * written on the active GM's client through `CONFIG.queries` (D-643; never
 * `game.socket`). With no GM online that write fails - and it failed AFTER the
 * Use, the cast or the press had paid for it: 02's Ward lost its 2 Mana and its
 * Reaction and laid nothing, Hymn of Hope its once a Long Rest, and a card's
 * talent button struck its use and then was refused the write that recorded the
 * press (a card may be written by its author and a GM alone). These are the two
 * judgements every such door asks FIRST. Pure, so a Vitest holds them.
 */

import { cardHealRefusal, talentLaysOnHit } from "./class-talents.mjs";

/**
 * Whether a write this client must make reaches nobody: the user is no GM, no GM
 * is online, and something to be written is not the user's to write.
 *
 * @param {{owned?: boolean[], isGM?: boolean, gmActive?: boolean}} o
 *   `owned` one entry for each document to be written: whether this user may write it
 * @returns {boolean}
 */
export function gmAbsentFor({ owned = [], isGM = false, gmActive = false } = {}) {
  if (isGM === true || gmActive === true) return false;
  return (owned ?? []).some(o => o !== true);
}

/**
 * **AN OPPORTUNITY ATTACK THAT COULD LAY SOMETHING ON A CREATURE THIS CLIENT DOES NOT OWN, WITH NO
 * GM ONLINE** (the F4c review, M1): 04's Relentless Advance at rank 2 and Hold the Hall lay their
 * Speed 0 and Prone on an Opportunity Attack's hit, through the GM's client. The Opportunity Attack
 * door asks this BEFORE it takes the round's free mark or spends the Reaction, so a refusal costs
 * nothing - the attack door's own check came after both were gone.
 *
 * @param {{talents?: Array, owned?: boolean[]|boolean, isGM?: boolean, gmActive?: boolean}} o
 *   `owned` one entry for each creature the blow will strike (`opportunityOwned`)
 * @returns {boolean}  true where the Opportunity Attack must be refused
 */
export function opportunityNeedsGM({ talents = [], owned = [], isGM = false, gmActive = false } = {}) {
  const list = Array.isArray(owned) ? owned : [owned];
  return talentLaysOnHit(talents ?? [], { opportunity: true }) && gmAbsentFor({ owned: list.map(o => o === true), isGM, gmActive });
}

/**
 * **WHOM AN OPPORTUNITY ATTACK WILL STRIKE, AS OWNED OR NOT** (the F4d review, item 1): the mover
 * where its token is on the viewed scene (the door targets it), else whatever the user has
 * targeted - the door then skips the re-target and the attack strikes those, so the judgement
 * reads them rather than skipping.
 *
 * @param {{onCanvas?: boolean, moverOwned?: boolean|null, targetsOwned?: boolean[]}} o
 * @returns {boolean[]}
 */
export function opportunityOwned({ onCanvas = false, moverOwned = null, targetsOwned = [] } = {}) {
  if (onCanvas) return [moverOwned === true];
  return (targetsOwned ?? []).map(o => o === true);
}

/** The card flags a talent button's presses are recorded under. */
export const PRESS_FLAGS = Object.freeze({
  pressed: "pressed",
  healMade: "guidanceMade",
  healed: "guidanceHealed",
  attacks: "attacksMade",
  // D-779: the charges taken from 04's Lightwell's font.
  charges: "lightwellTaken"
});

/** The kinds of press a card records. */
export const PRESS_KINDS = Object.freeze(["once", "heal", "count", "charge"]);

/**
 * **ONE PRESS OF A CARD'S BUTTON, JUDGED AGAINST WHAT THE CARD RECORDS**: the
 * refusal in words where it may not be made, else the card flags to write. The
 * door writes them BEFORE what the press buys, where this client may write the
 * card, and on the GM's client where it may not - judged again there, so two
 * presses at once cannot both pass.
 *
 * - `{kind: "once", press}` - one press of that button a card (04's Overload and
 *   Ancestral Knowledge): `pressed[press]`;
 * - `{kind: "heal", uuid, allowed}` - a heal on a friend, `allowed` presses a
 *   card and never the same creature twice (04's Ancestral Guidance: *one friendly
 *   target ... At rank 2 a second friendly target*): `guidanceMade` and
 *   `guidanceHealed`;
 * - `{kind: "count", flag}` - a press already made, counted (a feature card's
 *   Attack, D-773's allowance): `attacksMade` one higher.
 *
 * @param {object} flags  the card's `flags["azeroth-rpg"]`
 * @param {{kind: string, press?: string, uuid?: string, allowed?: number, flag?: string}} claim
 * @returns {{ok: boolean, reason: string|null, update: object|null}}  `update` the
 *   `flags.azeroth-rpg` keys to write
 */
export function pressClaim(flags = {}, claim = {}) {
  const f = flags ?? {};
  if (claim?.kind === "once") {
    const pressed = f[PRESS_FLAGS.pressed] && typeof f[PRESS_FLAGS.pressed] === "object" ? f[PRESS_FLAGS.pressed] : {};
    if (pressed[claim.press]) return { ok: false, reason: "AZEROTH.TalentLine.Pressed", update: null };
    return { ok: true, reason: null, update: { [PRESS_FLAGS.pressed]: { ...pressed, [claim.press]: true } } };
  }
  if (claim?.kind === "heal") {
    const made = Math.max(0, Math.trunc(Number(f[PRESS_FLAGS.healMade])) || 0);
    const healed = Array.isArray(f[PRESS_FLAGS.healed]) ? f[PRESS_FLAGS.healed] : [];
    // The count is the one reading the card's button has always asked (D-774).
    const spent = cardHealRefusal({ made, allowed: claim.allowed });
    if (spent) return { ok: false, reason: spent, update: null };
    if (claim.uuid && healed.includes(claim.uuid)) return { ok: false, reason: "AZEROTH.Guidance.Again", update: null };
    return { ok: true, reason: null, update: { [PRESS_FLAGS.healMade]: made + 1, [PRESS_FLAGS.healed]: [...healed, claim.uuid] } };
  }
  if (claim?.kind === "count" && claim.flag === PRESS_FLAGS.attacks) {
    return { ok: true, reason: null, update: { [claim.flag]: (Math.max(0, Math.trunc(Number(f[claim.flag])) || 0)) + 1 } };
  }
  // **A CHARGE OF A FONT** (04's Lightwell; the lead, 2026-10-03, on O-184; D-779):
  // `lightwellTaken` one higher, refused once the card's charges are spent.
  if (claim?.kind === "charge") {
    const taken = Math.max(0, Math.trunc(Number(f[PRESS_FLAGS.charges])) || 0);
    if (taken >= Math.max(0, Math.trunc(Number(claim.allowed)) || 0)) return { ok: false, reason: "AZEROTH.Lightwell.Spent", update: null };
    return { ok: true, reason: null, update: { [PRESS_FLAGS.charges]: taken + 1 } };
  }
  throw new Error(`pressClaim: no such claim ${JSON.stringify(claim?.kind ?? null)}`);
}

/**
 * A claim as a query may carry it: the three kinds and their own fields, and
 * nothing a caller slipped in beside them - a `count` writes `attacksMade` and
 * no other flag.
 *
 * @param {object} claim
 * @returns {object|null}
 */
export function cleanClaim(claim = {}) {
  const c = claim ?? {};
  if (c.kind === "once" && typeof c.press === "string" && c.press) return { kind: "once", press: c.press };
  if (c.kind === "heal" && typeof c.uuid === "string" && c.uuid) {
    return { kind: "heal", uuid: c.uuid, allowed: Math.max(1, Math.trunc(Number(c.allowed)) || 1) };
  }
  if (c.kind === "count" && c.flag === PRESS_FLAGS.attacks) return { kind: "count", flag: PRESS_FLAGS.attacks };
  if (c.kind === "charge" && typeof c.uuid === "string" && c.uuid) return { kind: "charge", uuid: c.uuid, allowed: Math.max(0, Math.trunc(Number(c.allowed)) || 0) };
  return null;
}
