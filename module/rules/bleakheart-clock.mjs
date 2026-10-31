import { BLEAKHEART } from "./bleakheart.mjs";

/** Observe only the newest interval: loading or advancing several minutes
 * never queues a backlog of attacks against the victim. */
export function bleakheartWorldTick({ previous, now, started, inCombat = false } = {}) {
  if (inCombat || ![previous, now, started].every(Number.isFinite) || now <= previous || now < started) return null;
  const interval = Math.floor((now - started) / BLEAKHEART.seconds);
  const old = Math.max(0, Math.floor((previous - started) / BLEAKHEART.seconds));
  if (interval < 1 || interval <= old) return null;
  return `world:${started}:${interval}`;
}

/** A linked actor gets one check per round even if duplicated combatants
 * represent it. Rewinding a combat does not create a new pulse. */
export function bleakheartTurnTick({ previous, current, actorUuid } = {}) {
  if (!previous || !current?.started || !current.id || current.actorUuid !== actorUuid
    || !Number.isInteger(current.round) || current.round < 1 || !Number.isInteger(current.turn) || current.turn < 0) return null;
  if (previous.started && (current.round < previous.round
    || (current.round === previous.round && current.turn <= previous.turn))) return null;
  return `combat:${current.id}:${current.round}:${actorUuid}`;
}
