/**
 * **WHAT A RANGER'S OR A ROGUE'S TALENT LEAVES STANDING ON THEM** (04; D-773):
 * one Active Effect a state, on the character's OWN actor - which its owner may
 * write, so no query is needed - each carrying its flag and the span core counts
 * (D-628; `CONFIG.ActiveEffect.expiryAction = "delete"`):
 *
 * - **Overkill's hold** (*your Opening class feature holds until the end of your
 *   next turn*): `OPENING_HELD_FLAG {targets, source}`, the targets not yet acted
 *   when it was used, until the end of the Rogue's next turn;
 * - **Subterfuge's mark** (*a target you attack while hidden is treated as being
 *   under your Opening ... for a number of rounds equal to your rank*):
 *   `OPENING_MARK_FLAG {actorId, tokenId, name, source}`, one a target;
 * - **Fleet Footed's Defense** (*your Defense rises by 1 per rank until your next
 *   turn*): a `final` change on `system.defense`, laid once a turn;
 * - **Deterrence** (*Attacks against you take a Bane per rank until the start of
 *   your next turn*): `DETERRED_FLAG {banes, source}`, read off the TARGET by the
 *   attacker's dialog (`roll-dialog.mjs#targetSnapshots`) - a flag, never a change,
 *   because a Bane is dice (CLAUDE.md §6);
 * - **Cloak of Shadows' Ward** (*Ward 1 per rank against one school until your next
 *   turn*): a `final` change on `system.ward.<school>`;
 * - **Shadow Dance** (*count as hidden until the end of your next turn even while
 *   observed*): the effect CARRIES core's `invisible` status and `SHADOW_DANCE_FLAG`,
 *   so the hide ends with the effect, and `effects/stealth.mjs#reveal` leaves it
 *   standing while it does.
 *
 * Each reading of these is pure (`rules/class-talents.mjs`); this is the write and
 * the read off the effects.
 */

import { FLEET_FOOTED_FLAG, OPENING_HELD_FLAG, OPENING_MARK_FLAG, namesTarget } from "../rules/class-talents.mjs";
import { HIDDEN_STATUS } from "../rules/stealth.mjs";

/** The flag Deterrence's Banes stand under, on the creature attacked. */
export const DETERRED_FLAG = "deterred";

/** The flag a Shadow Dance's hide stands under (its effect carries the status). */
export const SHADOW_DANCE_FLAG = "shadowDance";

/** The flag Cloak of Shadows' Ward stands under. */
export const CLOAK_FLAG = "cloakWard";

/** The ACTIVE effects on an actor carrying one of the system's flags, with the flag. */
export function flaggedEffects(actor, flag) {
  const out = [];
  for (const effect of actor?.effects ?? []) {
    if (effect.active === false) continue;
    const raw = effect.flags?.["azeroth-rpg"]?.[flag] ?? null;
    if (raw && typeof raw === "object") out.push({ effect, flag: raw });
  }
  return out;
}

/**
 * Lay one state on the actor, replacing what the same flag (and, where given, the
 * same key inside it) laid before.
 *
 * @param {Actor} actor
 * @param {{flag: string, data: object, name: string, img?: string|null, changes?: Array<object>,
 *   statuses?: string[], span?: object|null, sameAs?: (raw: object) => boolean, description?: string}} o
 * @returns {Promise<ActiveEffect|null>}
 */
export async function layState(actor, { flag, data, name, img = null, changes = [], statuses = [], span = null, sameAs = () => true, description = "" } = {}) {
  if (!actor) return null;
  const stale = (actor.effects ?? []).filter(e => {
    const raw = e.flags?.["azeroth-rpg"]?.[flag] ?? null;
    return raw && sameAs(raw);
  }).map(e => e.id);
  if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
  const [made] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name, img: img ?? "icons/svg/aura.svg", origin: actor.uuid, description,
    ...(statuses.length ? { statuses } : {}),
    system: { changes },
    ...(span && typeof span === "object" ? span : {}),
    flags: { "azeroth-rpg": { [flag]: data } }
  }]);
  return made ?? null;
}

/**
 * **WHAT HOLDS A TARGET UNDER THE ROGUE'S OPENING**, off the Rogue's own effects:
 * Overkill's holds and Subterfuge's marks, as `rules/class-talents.mjs#openingFor`
 * reads them.
 *
 * @param {Actor} actor  the Rogue
 * @returns {{held: Array<{targets: object[]}>, marks: Array<{actorId: string|null, tokenId: string|null}>}}
 */
export function openingEntries(actor) {
  return {
    held: flaggedEffects(actor, OPENING_HELD_FLAG).map(r => ({ targets: Array.isArray(r.flag.targets) ? r.flag.targets : [] })),
    marks: flaggedEffects(actor, OPENING_MARK_FLAG).map(r => ({ actorId: r.flag.actorId ?? null, tokenId: r.flag.tokenId ?? null }))
  };
}

/** A Subterfuge mark on one target, replacing the last one on it. */
export function markOpening(actor, target, { rounds, source, span }) {
  const entry = { actorId: target?.actorId ?? null, tokenId: target?.tokenId ?? null, name: String(target?.name ?? ""), source };
  return layState(actor, {
    flag: OPENING_MARK_FLAG, data: entry, span,
    name: game.i18n.format("AZEROTH.Opening.MarkName", { source, name: entry.name, n: rounds }),
    description: `<p>${game.i18n.format("AZEROTH.Opening.MarkText", { name: entry.name, n: rounds })}</p>`,
    sameAs: raw => namesTarget(raw, entry)
  });
}

/** Overkill's hold, replacing the last one. */
export function holdOpening(actor, { targets, source, span }) {
  return layState(actor, {
    flag: OPENING_HELD_FLAG, data: { targets, source }, span,
    name: game.i18n.format("AZEROTH.Opening.HoldName", { source }),
    description: `<p>${game.i18n.format("AZEROTH.Opening.HoldText", { names: targets.map(t => t.name).filter(Boolean).join(", ") || "-" })}</p>`
  });
}

/** The actors whose Fleet Footed is being laid on this client (the architect's review of D-773). */
const FLEET_IN_FLIGHT = new Set();

/**
 * Fleet Footed's Defense, once a turn: a standing one is left alone, so a second
 * walk the same turn writes nothing - and one laid while another walk's is still
 * being written waits for nothing and lays nothing (the in-flight set), since the
 * move charge calls this after its queue rather than inside it.
 *
 * @returns {Promise<ActiveEffect|null>}  the effect laid, or null where one stood or none was due
 */
export async function layFleetFooted(actor, { defense, name, span }) {
  if (!actor || !(defense > 0) || !span) return null;
  if (FLEET_IN_FLIGHT.has(actor.uuid) || flaggedEffects(actor, FLEET_FOOTED_FLAG).length) return null;
  FLEET_IN_FLIGHT.add(actor.uuid);
  try {
    return await layState(actor, {
      flag: FLEET_FOOTED_FLAG, data: { defense, source: name }, span,
      name: game.i18n.format("AZEROTH.FleetFooted.Name", { name, n: defense }),
      changes: [{ key: "system.defense", type: "add", value: String(defense), phase: "final" }]
    });
  } finally {
    FLEET_IN_FLIGHT.delete(actor.uuid);
  }
}

/** The Banes Deterrence lays on attacks against this creature, off its own effects. */
export function deterrencesOf(actor) {
  return flaggedEffects(actor, DETERRED_FLAG).map(r => ({ banes: Math.max(0, Math.trunc(Number(r.flag.banes)) || 0), source: String(r.flag.source ?? "") }));
}

/** Whether a Shadow Dance holds this creature hidden now. */
export function dancing(actor) {
  return flaggedEffects(actor, SHADOW_DANCE_FLAG).length > 0;
}

/** Shadow Dance's hide: the status rides the effect, so the hide ends with it. */
export function layShadowDance(actor, { source, span }) {
  return layState(actor, {
    flag: SHADOW_DANCE_FLAG, data: { source }, span, statuses: [HIDDEN_STATUS],
    name: game.i18n.format("AZEROTH.ShadowDance.Name", { source }),
    description: `<p>${game.i18n.localize("AZEROTH.ShadowDance.Text")}</p>`
  });
}
