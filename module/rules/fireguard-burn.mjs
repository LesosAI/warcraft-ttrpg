import { FIREGUARD } from "./fireguard.mjs";

const id = value => typeof value === "string" && value.trim().length > 0;
const clockOk = value => value && Number.isInteger(value.round) && value.round >= 0
  && Number.isInteger(value.turn) && value.turn >= 0;
const later = (a, b) => a.round > b.round || (a.round === b.round && a.turn > b.turn);
const contextOk = ({ combatUuid = null, clock = null, time }) => Number.isFinite(time)
  && (combatUuid === null || (id(combatUuid) && clockOk(clock)));

export function validFireguardBurn(state) {
  return Boolean(state && id(state.sourceUuid) && id(state.targetUuid) && id(state.castId)
    && Number.isInteger(state.remaining) && state.remaining >= 0 && state.remaining <= FIREGUARD.immolate.ticks
    && (state.mode === "combat" ? id(state.combatUuid) && clockOk(state.last)
      : state.mode === "time" && state.combatUuid === null && Number.isFinite(state.nextAt)));
}

/** One carrier per victim. A new failed resistance refreshes, never stacks.
 * Runtime must serialize writes and remember cast delivery independently of
 * the carrier, so removing an effect cannot replay an old cast.
 */
export function fireguardBurnStart({ sourceUuid, targetUuid, castId, time,
  combatUuid = null, clock = null } = {}) {
  if (!id(sourceUuid) || !id(targetUuid) || sourceUuid === targetUuid || !id(castId)
    || !contextOk({ time, combatUuid, clock })) return null;
  return { sourceUuid, targetUuid, castId, remaining: FIREGUARD.immolate.ticks,
    mode: combatUuid === null ? "time" : "combat", combatUuid,
    last: combatUuid === null ? null : { ...clock },
    nextAt: combatUuid === null ? time + FIREGUARD.immolate.seconds : null };
}

/** Clock changes preserve remaining ticks and never deal damage immediately. */
export function fireguardBurnClock(state, { time, combatUuid = null, clock = null } = {}) {
  if (!validFireguardBurn(state) || !contextOk({ time, combatUuid, clock })) return null;
  if (state.combatUuid === combatUuid) return state;
  return { ...state, mode: combatUuid === null ? "time" : "combat", combatUuid,
    last: combatUuid === null ? null : { ...clock },
    nextAt: combatUuid === null ? time + FIREGUARD.immolate.seconds : null };
}

/** Combat callers invoke only at the victim's turn start. Persist next BEFORE
 * damage; each overdue real-time tick is a separate Ward-resolved hit.
 * Disabled effects spend their tick without damage, rather than banking it.
 */
export function fireguardBurnPulse(state, { targetUuid, time, combatUuid = null,
  clock = null, disabled = false } = {}) {
  const none = { action: "none", next: state, damage: null };
  if (!validFireguardBurn(state) || state.targetUuid !== targetUuid || state.remaining === 0)
    return { action: "end", next: null, damage: null };
  if (typeof disabled !== "boolean") return none;
  let next;
  if (state.mode === "combat") {
    if (combatUuid !== state.combatUuid || !clockOk(clock) || !later(clock, state.last)) return none;
    next = { ...state, last: { ...clock } };
  } else {
    if (combatUuid !== null || !Number.isFinite(time) || time < state.nextAt) return none;
    next = { ...state, nextAt: state.nextAt + FIREGUARD.immolate.seconds };
  }
  next.remaining--;
  return { action: disabled ? "advance" : "tick", next,
    damage: disabled ? null : { rating: FIREGUARD.immolate.tickDamage, school: "fire" },
    endsAfterDamage: next.remaining === 0 };
}
