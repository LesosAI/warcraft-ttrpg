import { FLESH_ROT } from "./naxxramas-ghoul.mjs";
import { resolveDamage } from "./mitigation.mjs";

export const FLESH_ROT_FLAG = "fleshRot";
const id = value => typeof value === "string" && value.trim().length > 0;
const clockKey = (combatUuid, clock) => id(combatUuid) && Number.isInteger(clock?.round)
  && clock.round >= 0 && Number.isInteger(clock?.turn) && clock.turn >= 0
  ? `${combatUuid}:${clock.round}:${clock.turn}` : null;

export function validFleshRot(state) {
  return Boolean(state?.version === 1 && id(state.sourceUuid) && id(state.targetUuid) && id(state.castId)
    && state.sourceUuid !== state.targetUuid && Number.isFinite(state.startedAt)
    && state.expiresAt === state.startedAt + FLESH_ROT.seconds && Array.isArray(state.seen)
    && state.seen.every(id) && new Set(state.seen).size === state.seen.length
    && (state.pending === null || (id(state.pending?.key) && state.seen.includes(state.pending.key))));
}

/** Fixed duration, not a bank of ticks. A new hit must preserve an existing wound. */
export function fleshRotStart({ sourceUuid, targetUuid, castId, time, combatUuid = null, clock = null } = {}) {
  const key = clockKey(combatUuid, clock);
  if (!id(sourceUuid) || !id(targetUuid) || sourceUuid === targetUuid || !id(castId)
    || !Number.isFinite(time) || (combatUuid !== null && !key)) return null;
  return { version: 1, sourceUuid, targetUuid, castId, startedAt: time,
    expiresAt: time + FLESH_ROT.seconds, seen: key ? [key] : [], pending: null };
}

/** Invoke only at the victim's actual turn start. Claim before damage; an
 * uncertain claim stays pending for review instead of being replayed. */
export function fleshRotPulse(state, { targetUuid, time, combatUuid = null, clock = null, disabled = false } = {}) {
  const none = { action: "none", next: state };
  if (!validFleshRot(state) || state.targetUuid !== targetUuid) return { action: "invalid", next: state };
  if (state.pending !== null) return { action: "unresolved", next: state };
  if (!Number.isFinite(time) || time < state.startedAt || typeof disabled !== "boolean") return none;
  if (time >= state.expiresAt) return { action: "end", next: null };
  const key = clockKey(combatUuid, clock);
  if (!key || state.seen.includes(key)) return none;
  return { action: disabled ? "advance" : "tick",
    next: { ...state, seen: [...state.seen, key], pending: disabled ? null : { key } } };
}

/** Physical wound damage reads Body AP, not school Ward or spell bonuses. */
export function fleshRotDamage(target = {}, { dealtHalved = false } = {}) {
  return resolveDamage({ rating: FLESH_ROT.periodicDamage, sl: 0, kind: "physical",
    location: "body", apByLocation: target.apByLocation ?? {}, immune: target.immune ?? [],
    vulnerable: target.vulnerable ?? [], slAddsToDamage: false, dealtHalved });
}
