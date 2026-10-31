/** Bloodpetal Trapper's bounded root. Pure timing and reapplication law. */
export const BLOODPETAL_FLAG = "bloodpetalRoots";
export const BLOODPETAL = Object.freeze({ name: "Entangling Roots", dc: 17, feet: 30, ticks: 3, damage: 2, seconds: 6 });
/** The authored creature's DC, with compatibility for the first Trapper
 * descriptors which did not store their printed DC 17. */
export function rootDifficulty(automation = {}) {
  const dc = automation.dc ?? BLOODPETAL.dc;
  return Number.isInteger(dc) && dc >= 1 && dc <= 30 ? dc : null;
}
const id = value => typeof value === "string" && value.trim().length > 0;
const clockValid = c => Boolean(c && Number.isInteger(c.round) && c.round >= 0 && Number.isInteger(c.turn) && c.turn >= 0);
const later = (a, b) => a.round > b.round || (a.round === b.round && a.turn > b.turn);

export function validBloodpetal(state) {
  return Boolean(state && id(state.sourceUuid) && id(state.targetUuid)
    && Number.isInteger(state.remaining) && state.remaining > 0 && state.remaining <= BLOODPETAL.ticks
    && (state.mode === "world" ? state.combatUuid === null && state.last === null && Number.isFinite(state.nextAt)
      : state.mode === "combat" && id(state.combatUuid) && clockValid(state.last) && state.nextAt === null));
}

export function seedBloodpetal({ sourceUuid, targetUuid, combatUuid = null, clock = null, time, existing = [] } = {}) {
  if (!id(sourceUuid) || !id(targetUuid)
    || (combatUuid === null ? !Number.isFinite(time) : !id(combatUuid) || !clockValid(clock))) return null;
  if (existing.some(s => validBloodpetal(s) && s.targetUuid === targetUuid)) return null;
  return { sourceUuid, targetUuid, remaining: BLOODPETAL.ticks, mode: combatUuid === null ? "world" : "combat",
    combatUuid, last: combatUuid === null ? null : { round: clock.round, turn: clock.turn },
    nextAt: combatUuid === null ? time + BLOODPETAL.seconds : null };
}

/** A clock transfer never causes damage, restores pulses or resets the effect. */
export function bloodpetalClock(state, { combatUuid = null, clock = null, time } = {}) {
  if (!validBloodpetal(state)) return null;
  if (combatUuid !== null) {
    if (!id(combatUuid) || !clockValid(clock)) return null;
    if (state.mode === "combat" && state.combatUuid === combatUuid) return state;
    return { ...state, mode: "combat", combatUuid, last: { round: clock.round, turn: clock.turn }, nextAt: null };
  }
  if (!Number.isFinite(time)) return null;
  return state.mode === "world" ? state : { ...state, mode: "world", combatUuid: null, last: null, nextAt: time + BLOODPETAL.seconds };
}

/** Caller must invoke combat pulses only at this carrier's turn start.
 * Claim `next` before damage; remaining zero is a terminal claim, never valid
 * for another pulse. Losing the Entangled status ends the entire effect. */
export function bloodpetalPulse(state, { targetUuid, combatUuid = null, clock = null, time,
  entangled = false, sourceExists = false, disabled = false } = {}) {
  const none = reason => ({ action: "none", reason, next: state, damage: null });
  if (!validBloodpetal(state) || state.targetUuid !== targetUuid || !entangled || !sourceExists) {
    return { action: "end", reason: "ended", next: null, damage: null };
  }
  let next;
  if (state.mode === "combat") {
    if (combatUuid !== state.combatUuid || !clockValid(clock) || !later(clock, state.last)) return none("notDue");
    next = { ...state, last: { round: clock.round, turn: clock.turn } };
  } else {
    if (combatUuid !== null || !Number.isFinite(time) || time < state.nextAt) return none("notDue");
    next = { ...state, nextAt: state.nextAt + BLOODPETAL.seconds };
  }
  // Disabled effects neither deal damage nor accumulate a burst of delayed
  // pulses. Record the observed boundary, preserving their remaining pulses.
  if (disabled) return { action: "none", reason: "disabled", next: state.mode === "world"
    ? { ...next, nextAt: time + BLOODPETAL.seconds } : next, damage: null };
  next.remaining--;
  return { action: "tick", reason: null, next, damage: { rating: BLOODPETAL.damage, school: "nature" }, endsAfterDamage: next.remaining === 0 };
}
