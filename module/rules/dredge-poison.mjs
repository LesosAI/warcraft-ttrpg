/** Biological worm poisons. Pure dose and clock rules. A dose is carried until it is cured
 *  (D12): it never counts down and nothing here ends it. Its damage lands at the start of
 *  each of the carrier's turns in a fight and once an hour outside one. The carrier is also
 *  an affliction (`rules/creature-poisons.mjs`) whose beat this module's own advancer owns. */
import { creaturePoisonAff } from "./creature-poisons.mjs";
import { AFFLICTION_FLAG } from "./afflictions.mjs";
import { SHED_DC_FLAG } from "./escapes.mjs";
import { MAGGOT_GOO } from "./maggot-goo.mjs";

export const DREDGE_POISON_FLAG = "dredgePoison";
export const DREDGE_POISONS = Object.freeze({
  venom: Object.freeze({ name: "Venom Spit", action: "half", feet: 60, dc: 17,
    resilience: "body", immediate: 5, damage: 2, seconds: 3600, uses: 1, per: "short" }),
  poison: Object.freeze({ name: "Dredge Poison", action: "half", feet: 5, dc: 17,
    resilience: "body", immediate: 0, damage: 2, seconds: 3600, uses: 1, per: "short" }),
  goo: MAGGOT_GOO
});
const id = value => typeof value === "string" && value.trim().length > 0;
const clockValid = c => Boolean(c && Number.isInteger(c.round) && c.round >= 0 && Number.isInteger(c.turn) && c.turn >= 0);
const later = (a, b) => a.round > b.round || (a.round === b.round && a.turn > b.turn);
const specFor = kind => Object.hasOwn(DREDGE_POISONS, kind ?? "") ? DREDGE_POISONS[kind] : null;

export function validDredgePoison(state) {
  const spec = specFor(state?.kind);
  return Boolean(spec && state.version === 1 && id(state.sourceUuid) && id(state.targetUuid)
    && (state.mode === "world" ? state.combatUuid === null && state.last === null && Number.isFinite(state.nextAt)
      : state.mode === "combat" && id(state.combatUuid) && clockValid(state.last) && state.nextAt === null));
}

/** A given poison cannot stack or restart while its dose remains, even from
 * another worm. Venom Spit and Dredge Poison remain distinct curable doses. */
export function seedDredgePoison({ kind, sourceUuid, targetUuid, combatUuid = null, clock = null, time, existing = [] } = {}) {
  const spec = specFor(kind);
  if (!spec || !id(sourceUuid) || !id(targetUuid)
    || (combatUuid === null ? !Number.isFinite(time) : !id(combatUuid) || !clockValid(clock))) return null;
  if (existing.some(state => validDredgePoison(state) && state.targetUuid === targetUuid && state.kind === kind)) return null;
  return { version: 1, kind, sourceUuid, targetUuid,
    mode: combatUuid === null ? "world" : "combat", combatUuid,
    last: combatUuid === null ? null : { round: clock.round, turn: clock.turn },
    nextAt: combatUuid === null ? time + spec.seconds : null };
}

/** Combat entry/exit preserves the dose without dealing damage on transfer. */
export function dredgePoisonClock(state, { combatUuid = null, clock = null, time } = {}) {
  if (!validDredgePoison(state)) return null;
  if (combatUuid !== null) {
    if (!id(combatUuid) || !clockValid(clock)) return null;
    if (state.mode === "combat" && state.combatUuid === combatUuid) return state;
    return { ...state, mode: "combat", combatUuid, last: { round: clock.round, turn: clock.turn }, nextAt: null };
  }
  if (!Number.isFinite(time)) return null;
  return state.mode === "world" ? state : { ...state, mode: "world", combatUuid: null, last: null,
    nextAt: time + specFor(state.kind).seconds };
}

/** Invoke combat pulses at the victim's turn start only. Persist next before
 * damage. A dose never ends by counting: only its target ending it does (a cure, an
 * immunity, a different carrier). Shedding the Poisoned stack leaves the dose, which the
 * advancer lays again at this beat, so `poisoned` is not asked here. */
export function dredgePoisonPulse(state, { targetUuid, disabled = false,
  combatUuid = null, clock = null, time } = {}) {
  const none = () => ({ action: "none", next: state, damage: null });
  if (!validDredgePoison(state) || state.targetUuid !== targetUuid) {
    return { action: "end", next: null, damage: null };
  }
  const spec = specFor(state.kind);
  let next;
  if (state.mode === "combat") {
    if (combatUuid !== state.combatUuid || !clockValid(clock) || !later(clock, state.last)) return none();
    next = { ...state, last: { round: clock.round, turn: clock.turn } };
  } else {
    if (combatUuid !== null || !Number.isFinite(time) || time < state.nextAt) return none();
    next = { ...state, nextAt: state.nextAt + spec.seconds };
  }
  // Disabled doses cannot bank damage for a burst when re-enabled.
  if (disabled) return { action: "none", next: state.mode === "world"
    ? { ...next, nextAt: time + spec.seconds } : next, damage: null };
  return { action: "tick", next, damage: { rating: spec.damage, school: "nature" } };
}

/** Poisoned's value and shedding DC belong to this same removable carrier, which is also
 *  an affliction carrier (kind "poison", the beat marked as this module's own). */
export function dredgePoisonEffect(state, { now = 0, inFight = false } = {}) {
  if (!validDredgePoison(state)) return null;
  const spec = specFor(state.kind);
  const aff = creaturePoisonAff({ name: spec.name, key: `creature-${state.kind}`, dc: spec.dc,
    sourceUuid: state.sourceUuid, now, inFight, value: 1, damage: spec.damage });
  return { name: spec.name, img: "icons/svg/poison.svg", origin: state.sourceUuid,
    disabled: false, statuses: ["poisoned"], system: { changes: [] },
    flags: { "azeroth-rpg": { harmful: true, value: 1,
      [SHED_DC_FLAG]: { dc: spec.dc, source: spec.name },
      [AFFLICTION_FLAG]: aff,
      [DREDGE_POISON_FLAG]: structuredClone(state) } } };
}
