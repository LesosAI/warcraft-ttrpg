/** Passive Mending: four Health per own turn, or one six-second world pulse.
 * No elapsed-time backlog: a large world-time jump resolves one pulse only.
 * Persist `next` before healing. Mode changes and acquisition never heal. */
export const SENTINEL_MENDING_HEAL = 4;
const id = value => typeof value === "string" && value.length > 0;
const clock = value => Number.isInteger(value?.round) && value.round >= 0
  && Number.isInteger(value?.turn) && value.turn >= 0;
const valid = state => id(state?.packId) && (state.mode === "world"
  ? Number.isFinite(state.nextAt) : state.mode === "combat" && id(state.combatUuid) && clock(state.last));

export function sentinelMendingPlan(state, { packId, known = false, alive = false,
  combatUuid = null, round, turn, time, pulse = false } = {}) {
  if (!known || !alive || !id(packId)) return { next: null, heal: 0 };
  if (combatUuid !== null && (!id(combatUuid) || !clock({ round, turn }))) return { next: state, heal: 0 };
  if (combatUuid === null && !Number.isFinite(time)) return { next: state, heal: 0 };
  const mode = combatUuid === null ? "world" : "combat";
  if (!valid(state) || state.packId !== packId || state.mode !== mode
    || (mode === "combat" && state.combatUuid !== combatUuid)) {
    return { next: mode === "world" ? { packId, mode, nextAt: time + 6 }
      : { packId, mode, combatUuid, last: { round, turn } }, heal: 0 };
  }
  if (!pulse) return { next: state, heal: 0 };
  if (mode === "world") return time >= state.nextAt
    ? { next: { ...state, nextAt: time + 6 }, heal: SENTINEL_MENDING_HEAL }
    : { next: state, heal: 0 };
  if (round < state.last.round || (round === state.last.round && turn <= state.last.turn)) return { next: state, heal: 0 };
  return { next: { ...state, last: { round, turn } }, heal: SENTINEL_MENDING_HEAL };
}
