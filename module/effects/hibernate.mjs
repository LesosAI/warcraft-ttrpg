/**
 * **02's HIBERNATE, OFFERED TO EACH ALLY RESTING WITH THE DRUID** (the class talent audit's C7, D-1895;
 * the wave-2 review: *you and every ally resting with you take a Short Rest's recovery in ten minutes*).
 * The druid names who rests with them at the Use (the one chooser, before anything is paid); each one
 * named is OFFERED the Short Rest on the client that answers for them - an active player who owns them,
 * else the active GM (`blow-doors.mjs#answererOf`) - through `HIBERNATE_QUERY`, where the rest's own
 * window asks what they eat and drink (`rest-dialog.mjs#shortRestWithDialog`). The offer is not awaited:
 * a player's window may stand open, and the druid's card says whom it was offered to. **Each offer is bound
 * to its Use** (the class talent audit's final review): a ticket written on the Hibernate feature once the
 * Use is paid, judged and claimed once per ally on the answering client (`rules/hibernate.mjs`).
 */

import { answererOf } from "./blow-doors.mjs";
import { HIBERNATE_OFFER_FLAG, HIBERNATE_TAKEN_FLAG, hibernateRefusal } from "../rules/hibernate.mjs";

/** The query that opens an ally's Short Rest on the client answering for them (`module/queries.mjs`). */
export const HIBERNATE_QUERY = "azeroth-rpg.hibernateRest";
const QUERY_MS = 10 * 60 * 1000;

/**
 * The allies a druid may name: every character marked as The Party (D-658) still standing, the druid
 * excepted, sorted by name then id so the list reads the same at every press.
 *
 * @param {Actor} druid
 * @param {Iterable<Actor>} [actors]
 * @returns {Actor[]}
 */
export function hibernateAllies(druid, actors = game.actors ?? []) {
  return [...actors]
    .filter(a => a && a !== druid && a.uuid !== druid?.uuid && a.isParty === true && (a.system?.health?.value ?? 0) > 0)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)));
}

/**
 * **THE USE'S RECORD, WRITTEN ONCE IT IS PAID**: a fresh ticket and the allies named, on the druid's Hibernate
 * feature. The offer carries the ticket; each answering client judges against it (`hibernateRefusal`).
 *
 * @param {Item} feature  the druid's Hibernate
 * @param {Actor[]} allies
 * @returns {Promise<string>}  the ticket
 */
export async function stampHibernateOffer(feature, allies = []) {
  const ticket = foundry.utils.randomID();
  await feature.setFlag("azeroth-rpg", HIBERNATE_OFFER_FLAG, { ticket, allies: (allies ?? []).map(a => a.uuid) });
  return ticket;
}

/**
 * Offer each ally the rest. Answers the names offered and the names nobody could answer for.
 *
 * @param {{druid: Actor, feature: string, featureId?: string|null, ticket?: string|null, allies: Actor[]}} o
 * @returns {{offered: string[], unanswered: string[]}}
 */
export function offerHibernate({ druid, feature = "", featureId = null, ticket = null, allies = [] } = {}) {
  const offered = [], unanswered = [];
  for (const ally of allies ?? []) {
    const who = answererOf(ally);
    if (!who) { unanswered.push(ally.name); continue; }
    offered.push(ally.name);
    const payload = { allyUuid: ally.uuid, druidUuid: druid?.uuid ?? null, feature, featureId, ticket };
    const run = who.id === game.user?.id
      ? hibernateQueryHandler(payload, { user: game.user })
      : who.query(HIBERNATE_QUERY, payload, { timeout: QUERY_MS });
    Promise.resolve(run).catch(err => {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Hibernate.OfferFailed", { name: ally.name, feature }));
      console.warn("azeroth-rpg | Hibernate's offer", err);
    });
  }
  return { offered, unanswered };
}

/** Offers this client is taking now, so two arriving for one ally and one ticket open one window. */
const TAKING = new Set();

/**
 * The answering client's side: this user must own the ally; the druid's feature must be Hibernate by identifier,
 * and its last Use's record must carry this ticket and name this ally, who has not taken it yet
 * (`hibernateRefusal`, the class talent audit's final review). The take is claimed on the ally before the window
 * opens, so a looped request opens no second rest. Opens the ally's own Short Rest; a dismissed window rests not
 * at all.
 *
 * @param {{allyUuid?: string, druidUuid?: string|null, feature?: string, featureId?: string|null, ticket?: string|null}} payload
 * @param {{user?: User|null}} [o]
 * @returns {Promise<{rested: boolean}>}
 */
export async function hibernateQueryHandler(payload = {}, { user = null } = {}) {
  const ally = payload.allyUuid ? await fromUuid(payload.allyUuid) : null;
  const druid = payload.druidUuid ? await fromUuid(payload.druidUuid) : null;
  if (ally?.documentName !== "Actor" || druid?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
  if (!ally.isOwner) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: ally.name }));
  if (user && !druid.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: druid.name }));
  const feature = payload.featureId ? (druid.items?.get?.(payload.featureId) ?? null) : null;
  if (feature?.type !== "feature") throw new Error(game.i18n.format("AZEROTH.LegacyUse.NotHeld", { name: druid.name, feature: payload.feature ?? "" }));
  const key = `${payload.ticket ?? ""}|${ally.uuid}`;
  const judge = () => hibernateRefusal({
    identifier: feature.system?.identifier ?? null, record: feature.getFlag?.("azeroth-rpg", HIBERNATE_OFFER_FLAG) ?? null,
    ticket: payload.ticket ?? null, allyUuid: ally.uuid, taken: ally.getFlag?.("azeroth-rpg", HIBERNATE_TAKEN_FLAG) ?? null
  });
  const refused = TAKING.has(key) ? "AZEROTH.Hibernate.Refuse.taken" : judge();
  if (refused) throw new Error(game.i18n.format(refused, { name: ally.name, druid: druid.name, feature: feature.name }));
  TAKING.add(key);
  try {
    await ally.setFlag("azeroth-rpg", HIBERNATE_TAKEN_FLAG, payload.ticket);
  } finally {
    TAKING.delete(key);
  }
  ui.notifications?.info(game.i18n.format("AZEROTH.Hibernate.Offered", { name: ally.name, druid: druid.name, feature: feature.name }));
  const { shortRestWithDialog } = await import("../applications/rest-dialog.mjs");
  const rested = await shortRestWithDialog(ally);
  return { rested: Boolean(rested) };
}
