/**
 * **THE ONE WRITER OF A BOSS'S BOSS ACTION POINTS** (14 §1, D-809).
 *
 * Every Boss Action press - a Test, a summon, an attack, a heal, a spell and a door,
 * an announcement included - spends its points HERE, once, after every refusal and
 * before anything else is paid or written (D-768's order). `rules/boss-actions.mjs
 * #bossPressJudgement` is the judgement; this is the write:
 *
 * - **Judged where it is written.** On the active GM's client through
 *   `azeroth-rpg.bossPoints` (`CONFIG.queries`), where one queue a creature runs the
 *   claims one at a time - read, judge, write `{value, bossPress}` in ONE update - so a
 *   double click and a GM and an owning player pressing together spend twice only if
 *   the points hold for two. A GM's own press, or an owner's press with no GM online,
 *   runs the same queue here (`rules/gm-writes.mjs#gmAbsentFor`).
 * - **Idempotent.** A press id is made once at the press; a claim that names an id the
 *   creature already holds answers what that claim answered and writes nothing.
 * - **One a turn.** The press records the fight's turn (`bossTurnKey`), and a second
 *   press after the same turn is refused in words. Out of a fight there are no turns
 *   and the count is not kept (the lead's rulings on Q17 and Q18).
 * - **The refresh**: full at the top of every round (`AzerothCombat#_onStartRound`) and
 *   at the fight's end (`refreshBossPoints`, from `_leaveFight`), the record cleared.
 */

import { bossPressJudgement, bossTurnKey } from "../rules/boss-actions.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";

export const BOSS_POINTS_QUERY = "azeroth-rpg.bossPoints";
/** The actor flag the last press is recorded under. */
export const BOSS_PRESS_FLAG = "bossPress";

/** One queue a creature, keyed by uuid: a claim runs after the last one has landed. */
const QUEUES = new Map();

function queued(uuid, task) {
  const prior = QUEUES.get(uuid) ?? Promise.resolve();
  const next = prior.catch(() => null).then(task);
  QUEUES.set(uuid, next.finally(() => { if (QUEUES.get(uuid) === next) QUEUES.delete(uuid); }));
  return next;
}

/** The fight a creature stands in now, or null. */
function fightOf(actor) {
  return actor?.activeFight?.() ?? (game.combat?.started && game.combat.getCombatantsByActor?.(actor)?.length ? game.combat : null);
}

/**
 * Judge and write, here. The caller has established that this client may write the
 * creature.
 *
 * @returns {Promise<{ok: boolean, reason: string|null, held: number, left: number, cost: number, again?: boolean}>}
 */
async function claimHere(actor, { cost = 1, pressId = null } = {}) {
  return queued(actor.uuid, async () => {
    const prior = actor.getFlag("azeroth-rpg", BOSS_PRESS_FLAG) ?? null;
    if (pressId && prior?.id === pressId) return { ...(prior.result ?? { ok: true, reason: null }), again: true };
    const turnKey = bossTurnKey(fightOf(actor));
    const verdict = bossPressJudgement({
      points: actor.system?.bossPoints ?? {}, cost, turnKey,
      lastTurnKey: prior?.turnKey ?? null
    });
    if (!verdict.ok) return verdict;
    const result = { ok: true, reason: null, held: verdict.held, left: verdict.left, cost: verdict.cost };
    await actor.update({
      "system.bossPoints.value": verdict.left,
      [`flags.azeroth-rpg.${BOSS_PRESS_FLAG}`]: { id: pressId, turnKey, cost: verdict.cost, result }
    });
    return result;
  });
}

/**
 * The GM-side handler. Throws with the reason, which travels back as the refusal.
 */
export async function bossPointsQueryHandler({ actorUuid = null, cost = 1, pressId = null } = {}, { user = null } = {}) {
  const actor = actorUuid ? await fromUuid(actorUuid) : null;
  if (!actor || actor.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
  if (user && !actor.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: actor.name }));
  return claimHere(actor, { cost, pressId });
}

/**
 * The refusal in words: none held, too few, or one taken after this turn already.
 *
 * @param {Actor} actor
 * @param {{name: string, cost: number}} row
 * @param {{reason: string, held: number}} verdict
 */
export function bossRefusalWords(actor, row, verdict) {
  const key = verdict.reason === "none" ? "AZEROTH.Boss.NoPoints"
    : verdict.reason === "turnTaken" ? "AZEROTH.Boss.TurnTaken" : "AZEROTH.Boss.Short";
  return game.i18n.format(key, { name: row?.name ?? "", boss: actor?.name ?? "", cost: verdict.cost ?? row?.cost ?? 1, held: verdict.held ?? 0 });
}

/**
 * **CLAIM A BOSS ACTION'S POINTS** for one press: judged and written once, on the
 * active GM's client where there is one, else here where this client owns the
 * creature. A refusal is said in words and nothing is written.
 *
 * @param {Actor} actor  the Boss
 * @param {{name: string, cost?: number}} row  the Boss Action
 * @param {{pressId?: string}} [o]
 * @returns {Promise<{ok: boolean, reason: string|null, held: number, left: number, cost: number}>}
 */
export async function claimBossPoints(actor, row, { pressId = foundry.utils.randomID() } = {}) {
  const cost = Math.max(1, Math.trunc(Number(row?.cost)) || 1);
  const refuse = verdict => {
    ui.notifications?.warn(bossRefusalWords(actor, row, verdict));
    return verdict;
  };
  try {
    const gm = game.users?.activeGM ?? null;
    let verdict;
    if (game.user?.isGM || !gm) {
      if (gmAbsentFor({ owned: [actor?.isOwner === true], isGM: game.user?.isGM === true, gmActive: Boolean(gm) })) {
        ui.notifications?.warn(game.i18n.localize("AZEROTH.Boss.NoGM"));
        return { ok: false, reason: "noGM", held: 0, left: 0, cost };
      }
      verdict = await claimHere(actor, { cost, pressId });
    } else {
      verdict = await gm.query(BOSS_POINTS_QUERY, { actorUuid: actor.uuid, cost, pressId }, { timeout: 15000 });
    }
    return verdict?.ok ? verdict : refuse(verdict ?? { reason: "none", held: 0, cost });
  } catch (err) {
    ui.notifications?.warn(err?.message ?? String(err));
    return { ok: false, reason: "error", held: 0, left: 0, cost };
  }
}

/**
 * Full again, and the turn's record cleared: the top of a round and a fight's end.
 *
 * @param {Actor} actor
 */
export async function refreshBossPoints(actor) {
  const points = actor?.system?.bossPoints ?? null;
  if (actor?.type !== "npc" || !((points?.max ?? 0) > 0)) return false;
  const update = {};
  if (points.value !== points.max) update["system.bossPoints.value"] = points.max;
  // v14's operator, never the deprecated `-=key` (CLAUDE.md §15).
  if (actor.getFlag("azeroth-rpg", BOSS_PRESS_FLAG) !== undefined) update[`flags.azeroth-rpg.${BOSS_PRESS_FLAG}`] = foundry.data.operators.ForcedDeletion.create();
  if (!Object.keys(update).length) return false;
  await queued(actor.uuid, () => actor.update(update));
  return true;
}
