import { freshTurn } from "./initiative.mjs";
import { movementLeft, paceFor, stoppedBy } from "./movement.mjs";
export const SEDUCTION = Object.freeze({ name: "Seduction", action: "half", range: 30, dc: 15, resilience: "spirit" });
export const SEDUCTION_FLAG = "seduction";
const id = value => typeof value === "string" && value.trim().length > 0;

/** Keep the movement command on its own Charmed carrier. Removing or
 * expiring that carrier must end both the charm and the command together. */
export function seductionEffect({ sourceUuid, sourceTokenUuid, targetUuid, targetTokenUuid, messageUuid, timing } = {}) {
  if (![sourceUuid, sourceTokenUuid, targetUuid, targetTokenUuid, messageUuid].every(id)) return null;
  const duration = timing?.duration, start = timing?.start;
  if (!Number.isSafeInteger(start?.time) || start.time < 0) return null;
  if (duration?.units === "turns") {
    if (duration.value !== 1 || duration.expiry !== "turnEnd" || !id(start.combat) || !id(start.combatant)) return null;
  } else if (duration?.units !== "seconds" || duration.value !== 6) return null;
  return { name: SEDUCTION.name, img: "icons/svg/sleep.svg", origin: sourceUuid,
    description: "Charmed until the end of your next turn. Spend that turn moving toward the succubus. The charm ends if the succubus or one of its allies harms you.",
    disabled: false, transfer: false, statuses: ["charmed"], system: { changes: [] },
    duration: { expiry: "turnEnd", expired: false, ...structuredClone(duration) },
    start: { combat: null, combatant: null, initiative: 0, round: 0, turn: 0, ...structuredClone(start) },
    flags: { "azeroth-rpg": { identifier: "seduction", [SEDUCTION_FLAG]: {
      version: 1, sourceUuid, sourceTokenUuid, targetUuid, targetTokenUuid, messageUuid, movementTurn: null
    } } } };
}

/** Only this effect's own Charmed status authorizes its command. A different
 * charm on the actor cannot keep a removed Seduction command alive. */
export function activeSeductions(effects, targetUuid) {
  if (!id(targetUuid)) return [];
  return [...(effects ?? [])].filter(effect => {
    const record = effect?.flags?.["azeroth-rpg"]?.[SEDUCTION_FLAG];
    const statuses = effect?.statuses;
    return record?.version === 1 && record.targetUuid === targetUuid && effect.origin === record.sourceUuid
      && [record.sourceUuid, record.sourceTokenUuid, record.targetTokenUuid, record.messageUuid].every(id)
      && (statuses?.has?.("charmed") || Array.isArray(statuses) && statuses.includes("charmed"))
      && !effect.disabled && !effect.isSuppressed && effect.active !== false && !effect.duration?.expired;
  });
}

/** The damage/condition workflow establishes whether harm occurred and
 * whether its source is an ally of the charmer. A mere attack is not harm. */
export function seductionEndsOnHarm({ harmed, attackerUuid, sourceUuid, attackerIsCharmerAlly } = {}) {
  return harmed === true && id(attackerUuid) && id(sourceUuid)
    && (attackerUuid === sourceUuid || attackerIsCharmerAlly === true);
}

/** Select the victim's next turn, never the turn on which the charm landed.
 * A persisted turn claim keeps reloads and initiative rewinds from issuing a
 * second command. The carrier's expiry still owns the end of Charmed. */
export function seductionTurnCommands(effects, targetUuid, clock = {}) {
  const { combatId, combatantId, round, turn } = clock;
  if (!id(combatId) || !id(combatantId) || !Number.isInteger(round) || round < 1
    || !Number.isInteger(turn) || turn < 0) return [];
  return activeSeductions(effects, targetUuid).filter(effect => {
    const start = effect.start, state = effect.flags["azeroth-rpg"][SEDUCTION_FLAG];
    if (effect.duration?.units !== "turns" || start?.combat !== combatId || start.combatant !== combatantId) return false;
    if (!Number.isInteger(start.round) || !Number.isInteger(start.turn)) return false;
    if (round < start.round || round === start.round && turn <= start.turn) return false;
    const claimed = state.movementTurn;
    return claimed === null || claimed?.combatId === combatId && claimed.combatantId === combatantId
      && claimed.round === round && claimed.turn === turn;
  });
}

/** Outside a fight, the existing duration door gives Seduction six seconds of
 * world time. That same interval owns the command: opening a prompt, reloading
 * or claiming movement must never start a fresh six-second interval. */
export function seductionTimedCommands(effects, targetUuid, time) {
  if (!Number.isFinite(time) || time < 0) return [];
  return activeSeductions(effects, targetUuid).filter(effect => {
    const start = effect.start, duration = effect.duration;
    if (duration?.units !== "seconds" || duration.value !== 6
      || !Number.isSafeInteger(start?.time) || start.time < 0
      || time < start.time || time >= start.time + duration.value) return false;
    const claimed = effect.flags["azeroth-rpg"][SEDUCTION_FLAG].movementTurn;
    return claimed === null || claimed?.kind === "world"
      && claimed.start === start.time && claimed.end === start.time + duration.value;
  });
}

/** One ordinary turn's Moves during the existing six-second window. Combat's
 * first-turn free Moves are not granted outside a fight. Route cost, including
 * terrain, is measured by the native movement planner and accumulated. */
export function seductionTimedAllowance({ speed, statuses = [], halfActions = null,
  aquaticOnly = false, realm = false, spent = 0 } = {}) {
  if (!Number.isFinite(speed) || speed < 0 || !Number.isFinite(spent) || spent < 0) return null;
  const budget = freshTurn({ halfActions });
  const pace = paceFor({ speed, aquaticOnly, stopped: realm || stoppedBy(statuses) }, "walk");
  return movementLeft({ pace, distance: spent, paid: 0, halfActionsLeft: budget.halfActions, freeMove: 0 });
}

/** The commanded turn is spent approaching. Movement and involuntary Tests
 * remain available; this is not a general incapacitation condition. */
export function seductionActionRefusal({ effects, targetUuid, clock, operation } = {}) {
  if (!["action", "attack", "casting", "feature", "ability", "gear", "signature", "reaction"].includes(operation)) return null;
  return seductionTurnCommands(effects, targetUuid, clock).length
    || seductionTimedCommands(effects, targetUuid, clock?.time).length ? "AZEROTH.Seduction.MustApproach" : null;
}
