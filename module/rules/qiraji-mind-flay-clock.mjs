/** Mind Flay's bounded pulse clock. Persist a claim before paying or striking. */
export const MIND_FLAY_CLOCK = "qirajiMindFlayClock";
const id = value => typeof value === "string" && value.trim().length > 0;
const validTurn = value => value && Number.isInteger(value.round) && value.round >= 0
  && Number.isInteger(value.turn) && value.turn >= 0;
const later = (a, b) => a.round > b.round || (a.round === b.round && a.turn > b.turn);

export function validMindFlayClock(state) {
  return Boolean(state?.version === 1 && id(state.cast)
    && Number.isInteger(state.remaining) && state.remaining >= 0 && state.remaining <= 3
    && (state.mode === "combat"
      ? id(state.combatUuid) && validTurn(state.last) && state.nextAt === null
      : state.mode === "world" && state.combatUuid === null && state.last === null && Number.isFinite(state.nextAt)));
}

export function seedMindFlayClock({ cast, combatUuid = null, turn = null, time } = {}) {
  if (!id(cast) || (combatUuid === null ? !Number.isFinite(time) : !id(combatUuid) || !validTurn(turn))) return null;
  return { version: 1, cast, remaining: 3, mode: combatUuid === null ? "world" : "combat", combatUuid,
    last: combatUuid === null ? null : { round: turn.round, turn: turn.turn },
    nextAt: combatUuid === null ? time + 6 : null };
}

/** Moving to another clock never replenishes pulses or strikes immediately. */
export function transferMindFlayClock(state, { combatUuid = null, turn = null, time } = {}) {
  if (!validMindFlayClock(state)) return null;
  if (combatUuid !== null) {
    if (!id(combatUuid) || !validTurn(turn)) return null;
    if (state.mode === "combat" && state.combatUuid === combatUuid) return state;
    return { ...state, mode: "combat", combatUuid, last: { round: turn.round, turn: turn.turn }, nextAt: null };
  }
  if (!Number.isFinite(time)) return null;
  return state.mode === "world" ? state : { ...state, mode: "world", combatUuid: null, last: null, nextAt: time + 6 };
}

/** Combat caller supplies only target turn starts; source upkeep remains in
 * ordinary combat upkeep. Exploration pulses pay 2 Mana before damage. */
export function claimMindFlayPulse(state, { cast, combatUuid = null, turn = null, time } = {}) {
  if (!validMindFlayClock(state) || state.cast !== cast || state.remaining === 0) return null;
  if (state.mode === "combat") {
    if (combatUuid !== state.combatUuid || !validTurn(turn) || !later(turn, state.last)) return null;
    return { next: { ...state, remaining: state.remaining - 1, last: { round: turn.round, turn: turn.turn } }, upkeep: 0 };
  }
  if (combatUuid !== null || !Number.isFinite(time) || time < state.nextAt) return null;
  return { next: { ...state, remaining: state.remaining - 1, nextAt: state.nextAt + 6 }, upkeep: 2 };
}
