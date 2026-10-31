/** Crypt Reaver's tabletop poison. One removable Poisoned carrier owns both
 * the value used by ordinary Banes/shedding and this bounded damage clock.
 * DC, damage and duration are tabletop choices, not client damage values.
 */
import { SHED_DC_FLAG } from "./escapes.mjs";
import { validVirulentLedger, virulentTicksLeft, addVirulentExposure, tickVirulentLedger,
  withdrawVirulentExposure } from "./virulent-contributions.mjs";
export const VIRULENT_FLAG = "virulentPoison";
export const VIRULENT = Object.freeze({ name: "Virulent Poison", dc: 20, stacks: 3, ticks: 3, damage: 2, seconds: 6 });
const id = v => typeof v === "string" && v.trim().length > 0;
const validClock = c => Boolean(c && Number.isInteger(c.round) && c.round >= 0 && Number.isInteger(c.turn) && c.turn >= 0);
const later = (a, b) => a.round > b.round || (a.round === b.round && a.turn > b.turn);
const validValue = v => Number.isInteger(v) && v > 0 && v <= VIRULENT.stacks;

export function validVirulent(state) {
  return Boolean(state?.version === 2 && id(state.sourceUuid) && id(state.targetUuid)
    && Array.isArray(state.hits) && state.hits.length > 0 && state.hits.every(id)
    && new Set(state.hits).size === state.hits.length
    && validVirulentLedger(state.ledger) && state.ledger.exposures.length === state.hits.length
    && state.hits.every((hit, i) => hit === state.ledger.exposures[i].id)
    && state.remaining === virulentTicksLeft(state.ledger)
    && Number.isInteger(state.remaining) && state.remaining > 0 && state.remaining <= VIRULENT.ticks
    && (state.mode === "world" ? state.combatUuid === null && state.last === null && Number.isFinite(state.nextAt)
      : state.mode === "combat" && id(state.combatUuid) && validClock(state.last) && state.nextAt === null));
}

/** Moving between clocks never inflicts damage, replenishes ticks or adds a
 * stack. The runtime must serialize this with doses and pulse claims.
 */
export function virulentClock(state, { combatUuid = null, clock = null, time } = {}) {
  if (!validVirulent(state)) return null;
  if (combatUuid !== null) {
    if (!id(combatUuid) || !validClock(clock)) return null;
    if (state.mode === "combat" && state.combatUuid === combatUuid) return state;
    return { ...state, mode: "combat", combatUuid, last: { ...clock }, nextAt: null };
  }
  if (!Number.isFinite(time)) return null;
  return state.mode === "world" ? state : { ...state, mode: "world", combatUuid: null, last: null, nextAt: time + VIRULENT.seconds };
}

/** Call only after an eligible melee hit and a failed Body Test. A hit ID is
 * the authoritative attack card plus victim identity. Duplicate delivery
 * neither adds a stack nor refreshes the duration. currentValue comes from
 * the carrier's ordinary value flag so a successfully shed stack stays shed.
 */
export function virulentDose({ sourceUuid, targetUuid, hitId, existing = null, currentValue = 0,
  combatUuid = null, clock = null, time } = {}) {
  if (!id(sourceUuid) || !id(targetUuid) || !id(hitId)) return null;
  let state;
  if (existing !== null) {
    if (!validVirulent(existing) || existing.targetUuid !== targetUuid || !validValue(currentValue)) return null;
    if (existing.hits.includes(hitId)) return { state: existing, value: currentValue, duplicate: true };
    state = virulentClock(existing, { combatUuid, clock, time });
    if (!state) return null;
    // Keep the next scheduled pulse: a steady stream of hits cannot postpone
    // damage forever. Refresh only the number of pulses still to be resolved.
    const ledger = addVirulentExposure(state.ledger, hitId, currentValue, sourceUuid);
    if (!ledger) return null;
    state = { ...state, sourceUuid, hits: [...state.hits, hitId], remaining: VIRULENT.ticks, ledger };
  } else {
    if (currentValue !== 0) return null;
    state = { version: 2, sourceUuid, targetUuid, hits: [hitId], remaining: VIRULENT.ticks,
      ledger: addVirulentExposure(null, hitId, 0, sourceUuid),
      mode: "world", combatUuid: null, last: null, nextAt: Number.isFinite(time) ? time + VIRULENT.seconds : null };
    if (combatUuid !== null) {
      if (!id(combatUuid) || !validClock(clock)) return null;
      state = { ...state, mode: "combat", combatUuid, last: { ...clock }, nextAt: null };
    }
    if (!validVirulent(state)) return null;
  }
  return { state, value: Math.min(VIRULENT.stacks, currentValue + 1), duplicate: false };
}

/** Invoke combat ticks only at the victim's turn start. Persist next before
 * applying damage. A spent terminal claim is never a second damage request.
 * Out of combat, repeat overdue ticks separately so Ward applies per tick.
 */
export function virulentPulse(state, { targetUuid, value, poisoned = false, disabled = false,
  combatUuid = null, clock = null, time } = {}) {
  const none = () => ({ action: "none", next: state, damage: null });
  if (!validVirulent(state) || state.targetUuid !== targetUuid || !poisoned || !validValue(value))
    return { action: "end", next: null, damage: null };
  let next;
  if (state.mode === "combat") {
    if (combatUuid !== state.combatUuid || !validClock(clock) || !later(clock, state.last)) return none();
    next = { ...state, last: { ...clock } };
  } else {
    if (combatUuid !== null || !Number.isFinite(time) || time < state.nextAt) return none();
    next = { ...state, nextAt: state.nextAt + VIRULENT.seconds };
  }
  next.ledger = tickVirulentLedger(state.ledger, value);
  if (!next.ledger) return { action: "end", next: null, damage: null };
  next.remaining = virulentTicksLeft(next.ledger);
  return { action: disabled ? "advance" : "tick", next,
    damage: disabled ? null : { rating: VIRULENT.damage * value, school: "nature" },
    endsAfterDamage: next.remaining === 0 };
}

export function virulentEffect({ state, value } = {}) {
  if (!validVirulent(state) || !validValue(value)) return null;
  return { name: VIRULENT.name, img: "icons/svg/poison.svg", origin: state.sourceUuid,
    disabled: false, statuses: ["poisoned"], system: { changes: [] },
    flags: { "azeroth-rpg": { harmful: true, poison: true, value,
      [SHED_DC_FLAG]: { dc: VIRULENT.dc, source: VIRULENT.name }, [VIRULENT_FLAG]: structuredClone(state) } } };
}

/** Remove one exposure without recreating shed stacks or restoring ticks. */
export function virulentWithdrawal(state, hitId, value) {
  if (!validVirulent(state)) return null;
  const result = withdrawVirulentExposure(state.ledger, hitId, value);
  if (!result) return null;
  if (!result.value || !result.remaining) return { state: null, value: 0 };
  const sourceUuid = result.ledger.exposures.filter(e => !e.withdrawn).at(-1)?.sourceUuid ?? state.sourceUuid;
  return { state: { ...state, sourceUuid, ledger: result.ledger, remaining: result.remaining }, value: result.value };
}
