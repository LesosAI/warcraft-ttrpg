/** Vekniss Itch/Catalyst adaptation. Pure transition decisions; the runtime
 * owns effects, permissions, clocks and the one damage-application door. */
export const VEKNISS_FLAG = "veknissCatalyst";
export const VEKNISS = Object.freeze({ ticks: 3, damage: 3, school: "nature", chargeBonus: 4, dc: 20, seconds: 6 });

const nonempty = value => typeof value === "string" && value.trim().length > 0;
const count = value => Number.isInteger(value) && value >= 0;
const validClock = clock => clock && count(clock.round) && count(clock.turn);
const compareClock = (a, b) => a.round - b.round || a.turn - b.turn;

export function validVeknissState(state) {
  return Boolean(state && ["itch", "catalyst"].includes(state.phase)
    && nonempty(state.sourceUuid) && nonempty(state.targetUuid)
    && (state.mode === "world"
      ? state.combatUuid === null && state.last === null && Number.isFinite(state.nextAt)
      : (state.mode === undefined || state.mode === "combat") && nonempty(state.combatUuid) && validClock(state.last))
    && Number.isInteger(state.remaining)
    && state.remaining > 0 && state.remaining <= VEKNISS.ticks);
}

/** Exploration advances on world time, never wall-clock timers. */
export function seedVeknissWorld({ sourceUuid, targetUuid, time, existing = [] } = {}) {
  if (!nonempty(sourceUuid) || !nonempty(targetUuid) || !Number.isFinite(time)) return { ok: false, reason: "invalid", state: null };
  if (existing.some(s => validVeknissState(s) && s.targetUuid === targetUuid)) return { ok: false, reason: "alreadyAffected", state: null };
  return { ok: true, reason: null, state: { phase: "itch", sourceUuid, targetUuid, mode: "world",
    combatUuid: null, last: null, nextAt: time + VEKNISS.seconds, remaining: VEKNISS.ticks } };
}

/** Switch clocks without producing damage or refreshing the remaining dose.
 * A clock switch starts one new interval; the switch itself is not a tick.
 */
export function veknissClock(state, { combatUuid = null, clock = null, time } = {}) {
  if (!validVeknissState(state)) return null;
  if (combatUuid !== null) {
    if (!nonempty(combatUuid) || !validClock(clock)) return null;
    if (state.mode !== "world" && state.combatUuid === combatUuid) return state;
    const { nextAt, ...rest } = state;
    return { ...rest, mode: "combat", combatUuid, last: { round: clock.round, turn: clock.turn } };
  }
  if (state.mode === "world") return state;
  if (!Number.isFinite(time)) return null;
  return { ...state, mode: "world", combatUuid: null, last: null, nextAt: time + VEKNISS.seconds };
}

/** One due event at a time. Persist next before applying damage, then call
 * again to catch up a world-time jump. There can be at most four events.
 */
export function veknissWorld(state, { targetUuid, time, sourceExists = true, disabled = false } = {}) {
  const none = reason => ({ action: "none", reason, next: state, damage: null });
  if (!validVeknissState(state)) return { action: "end", reason: "invalid", next: null, damage: null };
  if (!sourceExists) return { action: "end", reason: "orphaned", next: null, damage: null };
  if (state.mode !== "world" || state.targetUuid !== targetUuid) return none("differentClockOrCarrier");
  if (!Number.isFinite(time)) return none("invalidClock");
  if (disabled) return { ...none("disabled"), next: { ...state, nextAt: Math.max(state.nextAt, time + VEKNISS.seconds) } };
  if (time < state.nextAt) return none("notDue");
  const next = { ...state, nextAt: state.nextAt + VEKNISS.seconds };
  if (state.phase === "itch") return { action: "mature", reason: null, next: { ...next, phase: "catalyst" }, damage: null };
  const remaining = state.remaining - 1;
  return { action: "tick", reason: null, next: remaining ? { ...next, remaining } : null,
    damage: { rating: VEKNISS.damage, school: VEKNISS.school }, endsAfterDamage: remaining === 0 };
}

/** One carrier holds one dose. Reapplication does not refresh or accelerate it. */
export function seedVekniss({ sourceUuid, targetUuid, combatUuid, clock, existing = [] } = {}) {
  if (!nonempty(sourceUuid) || !nonempty(targetUuid) || !nonempty(combatUuid) || !validClock(clock)) {
    return { ok: false, reason: "invalid", state: null };
  }
  if (existing.some(s => validVeknissState(s) && s.targetUuid === targetUuid)) {
    return { ok: false, reason: "alreadyAffected", state: null };
  }
  return { ok: true, reason: null, state: { phase: "itch", sourceUuid, targetUuid, combatUuid,
    last: { round: clock.round, turn: clock.turn }, remaining: VEKNISS.ticks } };
}

/** Call only for a carrier's turn start. Persist `next` before applying a
 * returned tick, under the runtime's per-effect lock. This prevents replay;
 * failures after that claim must be reported, never silently retried. */
export function veknissTurn(state, { targetUuid, combatUuid, clock, sourceExists = true,
  targetExists = true, encounterActive = true, disabled = false } = {}) {
  const no = reason => ({ action: "none", reason, next: state, damage: null });
  const end = reason => ({ action: "end", reason, next: null, damage: null });
  if (!validVeknissState(state)) return end("invalid");
  if (!sourceExists || !targetExists || !encounterActive) return end("orphaned");
  if (targetUuid !== state.targetUuid || combatUuid !== state.combatUuid) return no("differentCarrierOrEncounter");
  if (!validClock(clock)) return no("invalidClock");
  if (disabled) return no("disabled");
  if (compareClock(clock, state.last) <= 0) return no("alreadyProcessed");
  const next = { ...state, last: { round: clock.round, turn: clock.turn } };
  if (state.phase === "itch") return { action: "mature", reason: null,
    next: { ...next, phase: "catalyst" }, damage: null };
  const remaining = state.remaining - 1;
  return { action: "tick", reason: null, next: remaining ? { ...next, remaining } : null,
    damage: { rating: VEKNISS.damage, school: VEKNISS.school }, endsAfterDamage: remaining === 0 };
}

/** The Stinger's charge bonus is specific to an active, mature Catalyst.
 * Ordinary Poisoned, an unhatched Itch, disabled effects and stacked copies
 * never add further damage. The charge workflow must validate movement first. */
export function veknissChargeBonus({ charging = false, targetUuid, combatUuid, effects = [] } = {}) {
  if (!charging) return 0;
  const affected = effects.some(effect => {
    const state = effect?.state;
    return effect?.active === true && validVeknissState(state) && state.phase === "catalyst"
      && state.targetUuid === targetUuid && state.combatUuid === combatUuid;
  });
  return affected ? VEKNISS.chargeBonus : 0;
}

/** Stinger adaptation: declare a target, make an ordinary paid Move toward
 * it, then spend an Attack Half-Action. Geometry and movement provenance are
 * supplied by the GM runtime, never by unchecked client query parameters.
 * This law grants no free movement, action or automatic hit. */
export function beginVeknissCharge({ sourceUuid, targetUuid, combatUuid, sceneId,
  sourceTokenId, targetTokenId, clock, distance, speed, reach = 5,
  onTurn = false, hasAbility = false } = {}) {
  const refuse = reason => ({ ok: false, reason, charge: null });
  if (hasAbility !== true || onTurn !== true) return refuse("unavailable");
  if (![sourceUuid, targetUuid, combatUuid, sceneId, sourceTokenId, targetTokenId].every(nonempty)
    || sourceUuid === targetUuid || sourceTokenId === targetTokenId || !validClock(clock)) return refuse("identity");
  if (![distance, speed, reach].every(Number.isFinite) || reach <= 0 || speed < 10) return refuse("measurement");
  if (distance < reach + 10 || distance > speed + reach) return refuse("range");
  return { ok: true, reason: null, charge: { sourceUuid, targetUuid, combatUuid, sceneId,
    sourceTokenId, targetTokenId, clock: { ...clock }, distance, speed, reach } };
}

/** Evaluate a previously declared charge immediately before the Attack pays.
 * Movement cost is paid by the normal movement door. The runtime consumes the
 * declaration once, including a miss, and must not reuse it on another attack.
 * `moved` is actual distance, not terrain-inflated movement cost. */
export function finishVeknissCharge(charge, { sourceUuid, targetUuid, combatUuid,
  sceneId, sourceTokenId, targetTokenId, clock, distance, moved, speed,
  onTurn = false, hasAbility = false, movementPaid = false, directApproach = false,
  targetStayed = false, effects = [] } = {}) {
  const refuse = reason => ({ ok: false, reason, bonus: 0 });
  if (!charge || !beginVeknissCharge({ ...charge, onTurn: true, hasAbility: true }).ok) return refuse("invalidDeclaration");
  if (onTurn !== true || hasAbility !== true || !validClock(clock) || compareClock(clock, charge.clock) !== 0) return refuse("staleTurn");
  const identity = { sourceUuid, targetUuid, combatUuid, sceneId, sourceTokenId, targetTokenId };
  if (Object.entries(identity).some(([key, value]) => value !== charge[key])) return refuse("identity");
  if (movementPaid !== true || directApproach !== true || targetStayed !== true) return refuse("movement");
  if (!Number.isFinite(moved) || moved < 10 || moved > charge.speed) return refuse("movement");
  if (!Number.isFinite(speed) || moved > speed) return refuse("movement");
  if (!Number.isFinite(distance) || distance < 0 || distance > charge.reach || charge.distance - distance < 10) return refuse("reach");
  if (moved + 0.001 < charge.distance - distance) return refuse("movement");
  return { ok: true, reason: null, bonus: veknissChargeBonus({ charging: true, targetUuid, combatUuid, effects }) };
}
