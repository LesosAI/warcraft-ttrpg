/**
 * **THE SPIRIT REALM AND ETHEREAL FORM, WHERE THEY TOUCH THE WORLD** (06 §10; 04's The
 * Crossing, Ethereal Form and Kindred Spirits; the Legacy branches' door 10).
 * `rules/spirit-realm.mjs` is the law; this reads a creature into it, lays the two
 * states, and lands what a turn there offers.
 *
 * - **The reading** (`realmStateFor`, `etherealOn`): off the creature's own effects,
 *   its Health, its stabilized mark, its Death Steps and its talents - the ONE reading
 *   every door asks (`realmRefusalFor`, `attackRefusalFor`, `castRefusalFor`), so the
 *   attack, the cast, the Use, the gear, the Signature, the maneuver, the ability, the
 *   Reaction and the move cannot come to disagree about where a creature is.
 * - **The Crossing** (`crossInto`): an effect on the user, its own (no query), spanned
 *   to the minute (`effects/durations.mjs#minuteSpan`, D-778), deleted to step back.
 * - **Ethereal Form** (`layEthereal`): the user's own, and Kindred Spirits' friends'
 *   through `effects/legacy-uses.mjs#layStateOn`, each to the USER's next turn.
 * - **The offer** (`takeOffer`): 06 §10's *stand up now, at 1 Health, with your Death
 *   Steps cleared. The price is Corruption* - the track and the price the GM named,
 *   chosen through the one chooser, the Corruption through 10's own unresisted door.
 */

import { AZEROTH } from "../config.mjs";
import {
  ETHEREAL_FLAG, OFFER, SPIRIT_FLAG, SPIRIT_REALM, castFilterRefusal, etherealOf, etherealRefusal, isDying, offerRefusal, offerStands, offerTaken,
  realmRefusal, realmStateOf, spiritRealmFor
} from "../rules/spirit-realm.mjs";
// The offer's price is the GM's to name (06 §10; the B3 review).
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { talentEffect } from "../rules/talent-effects.mjs";
import { flaggedEffects, layState } from "./talent-states.mjs";
import { minuteSpan } from "./durations.mjs";

/** The active effects' `azeroth-rpg` flags, plain. */
function flagsOf(actor) {
  return (actor?.effects ?? []).filter(e => e.active !== false && e.disabled !== true).map(e => e.flags?.["azeroth-rpg"] ?? {});
}

/**
 * **WHETHER A CHARACTER IS DYING NOW** (06 §9), off its own data.
 *
 * @param {Actor} actor
 */
export function dyingNow(actor) {
  return isDying({
    type: actor?.type ?? null, health: actor?.system?.health?.value ?? null,
    stabilized: actor?.getFlag?.("azeroth-rpg", "stabilized") === true,
    steps: actor?.system?.deathSteps ?? 0, max: AZEROTH.DEATH_STEPS
  });
}

/**
 * **WHERE A CREATURE STANDS** - in the Spirit Realm or not (`rules/spirit-realm.mjs
 * #realmStateOf`), off its effects, its Health and its talents.
 *
 * @param {Actor} actor
 */
export function realmStateFor(actor) {
  if (actor?.type !== "character") return realmStateOf({});
  const crossing = flagsOf(actor).map(f => f?.[SPIRIT_FLAG]).find(f => f && typeof f === "object") ?? null;
  const talent = spiritRealmFor(actor.takenTalents?.() ?? [], talentEffect);
  return realmStateOf({ dying: dyingNow(actor), crossing, talent });
}

/** The Ethereal Form standing on a creature, or null. */
export function etherealOn(actor) {
  return etherealOf(flagsOf(actor));
}

/**
 * **WHY A DOOR IS REFUSED FROM THE SPIRIT REALM**, in words ready to warn with, or
 * null. `extras` is the door's own (`wayBack` for a feature).
 *
 * @param {Actor} actor
 * @param {string} door  a `REALM_REFUSALS` key
 * @param {object} [extras]
 * @returns {string|null}
 */
export function realmRefusalFor(actor, door, extras = {}) {
  const key = realmRefusal(realmStateFor(actor), door, extras);
  return key ? game.i18n.format(key, { name: actor?.name ?? "" }) : null;
}

/**
 * **WHY AN ATTACK IS REFUSED** - the Spirit Realm (*You cannot touch the living
 * world*) or Ethereal Form (*you cannot attack*) - in words, or null.
 *
 * @param {Actor} actor
 * @returns {string|null}
 */
export function attackRefusalFor(actor) {
  const realm = realmRefusal(realmStateFor(actor), "attack");
  if (realm) return game.i18n.format(realm, { name: actor?.name ?? "" });
  const ethereal = etherealOn(actor);
  const key = etherealRefusal(ethereal, "attack");
  return key ? game.i18n.format(key, { name: actor?.name ?? "", source: ethereal?.source ?? "" }) : null;
}

/**
 * **WHY A CAST IS REFUSED** - the one healing-only filter both states share
 * (`rules/spirit-realm.mjs#castFilterRefusal`) - in words, or null.
 *
 * @param {Actor} actor
 * @param {{heals?: boolean, selfTargeted?: boolean|null}} cast
 * @returns {string|null}
 */
export function castRefusalFor(actor, cast = {}) {
  const ethereal = etherealOn(actor);
  const key = castFilterRefusal({ realm: realmStateFor(actor), ethereal }, cast);
  return key ? game.i18n.format(key, { name: actor?.name ?? "", source: ethereal?.source ?? "" }) : null;
}

/**
 * **WHETHER A CAST'S TARGETS NAME THE CASTER**, for The Crossing's *on any creature
 * but yourself*: true where one does, false where every one is another, and null
 * where nothing is named - a heal with no creature named falls back to whoever
 * presses its Apply.
 *
 * @param {Actor} actor
 * @param {Array<{actorId?: string|null, tokenId?: string|null}>} targets
 * @returns {boolean|null}
 */
export function castNamesSelf(actor, targets = []) {
  if (!(targets ?? []).length) return null;
  const own = new Set((actor?.getActiveTokens?.(false, true) ?? []).map(t => t.id));
  return targets.some(t => (t?.tokenId && own.has(t.tokenId)) || (!t?.tokenId && t?.actorId && t.actorId === actor?.id));
}

/**
 * **04's THE CROSSING, TAKEN** (*You step into the Spirit Realm for up to one minute
 * and step back where you left*): the state on the user, spanned to the minute and
 * deleted to step back. The body is the token, and it stays where it stands.
 *
 * @param {Actor} actor
 * @param {{source: string, minutes?: number, img?: string|null}} o
 * @returns {Promise<ActiveEffect|null>}
 */
export function crossInto(actor, { source, minutes = 1, img = null } = {}) {
  return layState(actor, {
    flag: SPIRIT_FLAG, data: { source, minutes }, img: img ?? "icons/svg/aura.svg", span: minuteSpan(actor, minutes),
    // *Your body stands where you left it and takes no actions*: a Speed of 0 in the
    // `final` phase, Entangled's own change, so a fight's movement limit refuses every
    // foot (D-757) while the realm's Walk is the GM's.
    changes: [{ key: "system.speed", type: "override", value: "0", phase: "final" }],
    name: game.i18n.format("AZEROTH.Spirit.Name", { source }),
    description: `<p>${game.i18n.format("AZEROTH.Spirit.Text", { source, n: minutes })}</p>`,
    sameAs: () => true
  });
}

/** Whether the user stands in the Spirit Realm by The Crossing now (its effect). */
export function crossed(actor) {
  return flaggedEffects(actor, SPIRIT_FLAG).length > 0;
}

/**
 * **04's ETHEREAL FORM, ON THE USER** (*Until your next turn ...*): the state, its own.
 *
 * @param {Actor} actor
 * @param {{source: string, span: object|null, img?: string|null}} o
 */
export function layEthereal(actor, { source, span = null, img = null } = {}) {
  return layState(actor, {
    flag: ETHEREAL_FLAG, data: { source, by: actor?.uuid ?? null }, img, span,
    name: game.i18n.format("AZEROTH.Ethereal.Name", { source }),
    description: `<p>${game.i18n.format("AZEROTH.Ethereal.Text", { source })}</p>`,
    sameAs: raw => raw?.source === source
  });
}

/**
 * **WHAT A TURN IN THE SPIRIT REALM SAYS** - one line for the prompt: the Half-Actions
 * the turn holds, the four actions that are the GM's to answer, and Reach's Test.
 *
 * @param {Actor} actor
 * @param {{halfActions: number, heals: string|null}} state
 */
export function realmTurnText(actor, state) {
  return game.i18n.format(state.heals === "others" ? "AZEROTH.Spirit.TurnHeals" : "AZEROTH.Spirit.Turn", {
    name: actor?.name ?? "", n: state.halfActions, dc: SPIRIT_REALM.reach.dc
  });
}

/** The query a player's Take asks the GM's client through: the GM names the price (06 §10). */
export const OFFER_QUERY = "azeroth-rpg.spiritOffer";

/** How long the presser waits on the GM's two choosers. */
const OFFER_QUERY_MS = 300000;

/** Why the offer cannot be taken on this client now, a key or null (`rules/spirit-realm.mjs#offerRefusal`). */
function offerRefusalFor(actor) {
  const fight = actor?.activeFight?.() ?? null;
  const mine = fight?.started ? (fight.getCombatantsByActor?.(actor)?.[0] ?? null) : null;
  return offerRefusal({
    owner: actor?.isOwner === true, stands: offerStands({ dying: dyingNow(actor), steps: actor?.system?.deathSteps ?? 0 }),
    inFight: Boolean(mine), onTurn: Boolean(mine) && fight.combatant?.id === mine.id
  });
}

/**
 * **THE OFFER, TAKEN** (06 §10: *the GM decides from the place rather than from a
 * table*; the B3 review): the presser's Take, judged here (`offerRefusal`: their
 * character, the offer standing, its own turn in a fight), and then the GM's - the track
 * and the price named on the GM's client through the one chooser (`OFFER_QUERY`, with no
 * GM online refused in words before anything is asked), where it is judged again and
 * written: the Corruption through 10's unresisted door (`workflows.accrueCorruption`),
 * the character standing at 1 Health with its Death Steps cleared, up from Prone for
 * nothing. A GM's own press chooses here.
 *
 * @param {Actor} actor
 * @returns {Promise<{track: string, points: number}|null>}
 */
export async function takeOffer(actor) {
  const refused = offerRefusalFor(actor);
  if (refused) {
    ui.notifications?.warn(game.i18n.format(refused, { name: actor?.name ?? "" }));
    return null;
  }
  if (game.user?.isGM) return offerHere(actor);
  if (gmAbsentFor({ owned: [false], isGM: false, gmActive: Boolean(game.users?.activeGM) })) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Spirit.Offer.NoGM", { name: actor.name }));
    return null;
  }
  ui.notifications?.info(game.i18n.format("AZEROTH.Spirit.Offer.Asked", { name: actor.name }));
  try {
    const done = await game.users.activeGM.query(OFFER_QUERY, { actorUuid: actor.uuid }, { timeout: OFFER_QUERY_MS });
    if (!done?.track) {
      ui.notifications?.info(game.i18n.format("AZEROTH.Spirit.Offer.Declined", { name: actor.name }));
      return null;
    }
    return { track: done.track, points: Number(done.points) || 0 };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}

/**
 * The GM-side handler (`OFFER_QUERY`): the asker owns the character, the offer is judged
 * again off the world as this client holds it, and the GM names the price. Answers
 * `{track: null}` where the GM dismissed a chooser. Throws with the reason.
 */
export async function offerQueryHandler({ actorUuid = null } = {}, { user = null } = {}) {
  const actor = actorUuid ? await fromUuid(actorUuid) : null;
  if (actor?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !actor.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: actor.name }));
  const refused = offerRefusalFor(actor);
  if (refused) throw new Error(game.i18n.format(refused, { name: actor.name }));
  return (await offerHere(actor)) ?? { track: null, points: 0 };
}

/** The offer on the GM's client: the track and the price chosen, judged again, and written. */
async function offerHere(actor) {
  const { chooseOption, accrueCorruption } = game.system.azeroth.workflows;
  const title = { id: `offer-${actor.id}`, name: game.i18n.localize("AZEROTH.Spirit.Offer.Title") };
  const tracks = Object.keys(AZEROTH.corruptionTracks ?? {});
  const track = await chooseOption(title, tracks.map(key => ({ key, name: game.i18n.localize(AZEROTH.corruptionTracks[key]), description: "" })), null,
    { prompt: game.i18n.localize("AZEROTH.Spirit.Offer.TrackPrompt"), label: "AZEROTH.Spirit.Offer.Take" });
  if (!track) return null;
  const price = await chooseOption(title, OFFER.prices.map(n => ({ key: String(n), name: game.i18n.format(`AZEROTH.Spirit.Offer.Price${n}`, { n }), description: "" })), null,
    { prompt: game.i18n.localize("AZEROTH.Spirit.Offer.PricePrompt"), label: "AZEROTH.Spirit.Offer.Take" });
  if (!price) return null;
  const taken = offerTaken({ track: track.key, points: Number(price.key) }, tracks);
  if (!taken) return null;
  // Asked again: the chooser stood open while the world moved.
  const moved = offerRefusalFor(actor);
  if (moved) {
    ui.notifications?.warn(game.i18n.format(moved, { name: actor.name }));
    return null;
  }
  await accrueCorruption(actor, { track: taken.track, points: taken.points, occasion: game.i18n.format("AZEROTH.Occasion.SpiritOffer", { name: actor.name }) });
  await actor.update({ "system.health.value": taken.health, "system.deathSteps": taken.steps });
  await actor.standUp?.();
  if (actor.statuses?.has?.("prone")) await actor.toggleStatusEffect("prone", { active: false, free: true });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.Spirit.Offer.Taken", {
      name: actor.name, n: taken.points, track: game.i18n.localize(AZEROTH.corruptionTracks[taken.track] ?? taken.track)
    })}</p>`,
    flags: { "azeroth-rpg": { kind: "spiritOffer" } }
  });
  return { track: taken.track, points: taken.points };
}
