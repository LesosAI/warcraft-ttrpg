/** Frostmaul Preserver's temporary self-heal. Pure tabletop adaptation. */
export const WILD_REGENERATION_FLAG = "wildRegeneration";
export const WILD_REGENERATION = Object.freeze({ name: "Wild Regeneration", action: "action",
  mana: 3, uses: 1, per: "short", ticks: 3, heal: 4, seconds: 6 });
const id = value => typeof value === "string" && value.trim().length > 0;
const validClock = value => Boolean(value && Number.isInteger(value.round) && value.round >= 0
  && Number.isInteger(value.turn) && value.turn >= 0);
const later = (a, b) => a.round > b.round || (a.round === b.round && a.turn > b.turn);
const live = health => Number.isFinite(health?.value) && Number.isFinite(health?.max)
  && health.max > 0 && health.value > 0 && health.value <= health.max;

export function canWildRegenerate({ health, mana, existing = [] } = {}) {
  return live(health) && health.value <= health.max / 2
    && Number.isFinite(mana) && mana >= WILD_REGENERATION.mana
    && !existing.some(validWildRegeneration);
}

export function validWildRegeneration(state) {
  return Boolean(state?.version === 1 && id(state.actorUuid)
    && Number.isInteger(state.remaining) && state.remaining > 0 && state.remaining <= WILD_REGENERATION.ticks
    && (state.mode === "world" ? state.combatUuid === null && state.last === null && Number.isFinite(state.nextAt)
      : state.mode === "combat" && id(state.combatUuid) && validClock(state.last) && state.nextAt === null));
}

export function seedWildRegeneration({ actorUuid, health, mana, existing = [], combatUuid = null, clock = null, time } = {}) {
  if (!id(actorUuid) || !canWildRegenerate({ health, mana, existing })
    || (combatUuid === null ? !Number.isFinite(time) : !id(combatUuid) || !validClock(clock))) return null;
  return { version: 1, actorUuid, remaining: WILD_REGENERATION.ticks,
    mode: combatUuid === null ? "world" : "combat", combatUuid,
    last: combatUuid === null ? null : { round: clock.round, turn: clock.turn },
    nextAt: combatUuid === null ? time + WILD_REGENERATION.seconds : null };
}

/** Transfers preserve the pulse budget and never heal on entry or exit. */
export function wildRegenerationClock(state, { combatUuid = null, clock = null, time } = {}) {
  if (!validWildRegeneration(state)) return null;
  if (combatUuid !== null) {
    if (!id(combatUuid) || !validClock(clock)) return null;
    if (state.mode === "combat" && state.combatUuid === combatUuid) return state;
    return { ...state, mode: "combat", combatUuid, last: { round: clock.round, turn: clock.turn }, nextAt: null };
  }
  if (!Number.isFinite(time)) return null;
  return state.mode === "world" ? state : { ...state, mode: "world", combatUuid: null, last: null,
    nextAt: time + WILD_REGENERATION.seconds };
}

/** Call at the owner's turn start or a world pulse. Persist next BEFORE healing.
 * A disabled/blocked pulse is spent, not banked. Healing modifiers and the
 * final Health clamp belong to the normal healing writer, not this clock. */
export function wildRegenerationPulse(state, { actorUuid, health, disabled = false,
  combatUuid = null, clock = null, time } = {}) {
  if (!validWildRegeneration(state) || state.actorUuid !== actorUuid || !live(health)) {
    return { action: "end", next: null, heal: 0 };
  }
  const none = () => ({ action: "none", next: state, heal: 0 });
  let next;
  if (state.mode === "combat") {
    if (combatUuid !== state.combatUuid || !validClock(clock) || !later(clock, state.last)) return none();
    next = { ...state, last: { round: clock.round, turn: clock.turn } };
  } else {
    if (combatUuid !== null || !Number.isFinite(time) || time < state.nextAt) return none();
    next = { ...state, nextAt: state.nextAt + WILD_REGENERATION.seconds };
  }
  next.remaining--;
  return { action: "tick", next, heal: disabled ? 0 : WILD_REGENERATION.heal,
    endsAfterHeal: next.remaining === 0 };
}

/** V14 carrier; no passive healing modifier and no generic tick flag. */
export function wildRegenerationEffect(state) {
  if (!validWildRegeneration(state)) return null;
  return { name: WILD_REGENERATION.name, img: "icons/svg/regen.svg", origin: state.actorUuid,
    disabled: false, statuses: [], system: { changes: [] },
    flags: { "azeroth-rpg": { [WILD_REGENERATION_FLAG]: structuredClone(state) } } };
}
