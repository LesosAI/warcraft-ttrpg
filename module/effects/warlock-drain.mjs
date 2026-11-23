/**
 * **02's DRAIN, LAID AND READ** (the class talent audit, D-1894). `rules/warlock-drain.mjs` is
 * the law; this lays the state on the warlock and gives the Health back at the damage door.
 */

import { DRAIN_STATE_FLAG, drainHealHeld, drainHealOf, drainStateOf } from "../rules/warlock-drain.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { clockRounds, untilEndOfTurn } from "./durations.mjs";

/** The query that gives the Health back on the GM's client (`module/queries.mjs`). */
export const DRAIN_HEAL_QUERY = "azeroth-rpg.warlockDrain";
const QUERY_MS = 15000;

/**
 * Lay the state on the warlock until the end of this turn, or one round of the world's clock out
 * of a fight (D-778's reading for a turn's span out of one).
 *
 * @param {Actor} actor
 * @param {{name?: string, img?: string|null, divisor?: number}} o
 * @returns {Promise<boolean>}  whether it was laid
 */
export async function layDrainState(actor, { name = "", img = null, divisor = 2 } = {}) {
  if (!actor?.isOwner) return false;
  const span = untilEndOfTurn(actor) ?? clockRounds(1);
  const made = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name, img: img || "icons/svg/aura.svg", origin: actor.uuid, ...span,
    flags: { "azeroth-rpg": { [DRAIN_STATE_FLAG]: { divisor, name } } }
  }]);
  return Array.isArray(made) && made.length > 0;
}

/**
 * **THE HEALTH A BLOW GIVES THE DRAINER** (02's Drain: *damage you deal restores half as much
 * Health to you, rounded down*), at the one damage door, through the one healing door - here
 * where this client may write the warlock, else on the GM's client through `DRAIN_HEAL_QUERY`
 * (04's Life Drain's route), the GM reading the state again and holding the figure to what the
 * creature struck could have lost. With no GM online the heal is said to be lost in words; the
 * blow has already landed, so nothing else is spent.
 *
 * @param {{by: Actor|null, took: number, target?: Actor|null}} o
 * @returns {Promise<number>}  the Health that landed
 */
export async function drainFeatureHeal({ by = null, took = 0, target = null } = {}) {
  if (!by || by.documentName !== "Actor") return 0;
  const state = drainStateOf(by.effects ?? []);
  if (!state) return 0;
  const n = drainHealOf(took, state.divisor);
  if (n <= 0) return 0;
  if (!by.isOwner) {
    if (gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Drain.NoGM", { name: by.name, feature: state.name }));
      return 0;
    }
    try {
      const done = await game.users.activeGM.query(DRAIN_HEAL_QUERY, { byUuid: by.uuid, targetUuid: target?.uuid ?? null, took }, { timeout: QUERY_MS });
      const healed = Math.max(0, Math.trunc(Number(done?.healed)) || 0);
      if (healed > 0) ui.notifications?.info(game.i18n.format("AZEROTH.Drain.Healed", { name: by.name, n: healed, source: state.name, target: target?.name ?? "" }));
      return healed;
    } catch (err) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Drain.Failed", { source: state.name, target: target?.name ?? "" }));
      console.warn("azeroth-rpg | Drain via the GM", err);
      return 0;
    }
  }
  const before = by.system?.health?.value ?? 0;
  await by.applyHealing(n, { from: by, feature: true, featureName: state.name || null });
  const healed = Math.max(0, (by.system?.health?.value ?? before) - before);
  if (healed > 0) ui.notifications?.info(game.i18n.format("AZEROTH.Drain.Healed", { name: by.name, n: healed, source: state.name, target: target?.name ?? "" }));
  return healed;
}

/**
 * The GM-side handler (`DRAIN_HEAL_QUERY`). The asker must own the creature struck - that is the
 * client whose damage door ran - and the Drain must still stand on the warlock; the figure is held
 * to the creature's own most (`drainHealHeld`). Throws with the reason, which travels back.
 *
 * @param {{byUuid?: string, targetUuid?: string|null, took?: number}} payload
 * @param {{user?: User|null}} [o]
 * @returns {Promise<{healed: number}>}
 */
export async function drainHealQueryHandler(payload = {}, { user = null } = {}) {
  const by = payload.byUuid ? await fromUuid(payload.byUuid) : null;
  const target = payload.targetUuid ? await fromUuid(payload.targetUuid) : null;
  if (by?.documentName !== "Actor" || target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
  if (user && !target.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: target.name }));
  const state = drainStateOf(by.effects ?? []);
  const cap = (Number(target.system?.health?.max) || 0) + Math.max(0, Math.trunc(Number(target.system?.health?.temp)) || 0);
  const n = drainHealHeld({ took: payload.took, cap, state });
  if (n === null) throw new Error(game.i18n.format("AZEROTH.Drain.Gone", { name: by.name }));
  const before = by.system?.health?.value ?? 0;
  if (n > 0) await by.applyHealing(n, { from: by, feature: true, featureName: state.name || null });
  return { healed: Math.max(0, (by.system?.health?.value ?? before) - before) };
}
