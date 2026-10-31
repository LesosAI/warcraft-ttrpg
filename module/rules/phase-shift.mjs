export const PHASE_SHIFT = Object.freeze({ name: "Phase Shift", action: "reaction", seconds: 6 });
export const PHASE_SHIFT_FLAG = "phaseShift";
const id = value => typeof value === "string" && value.trim().length > 0;

/** Failed Attack Tests store a null damage row; that is distinct from an
 * absent or malformed record. Successful Tests may deal zero after mitigation. */
export function phaseShiftAttackState(row, outcome) {
  if (row === null && outcome?.success === false) return "miss";
  if (outcome?.success === true && Number.isFinite(row?.damage) && row.damage >= 0 && row.withdrawn !== true) return "hit";
  return null;
}

/** A specific incoming attack, before its damage is applied. The adapter
 * supplies authority and Reaction-budget verdicts from current documents;
 * an unknown delivery state is not permission to cancel an old attack. */
export function phaseShiftEligible({ reactorUuid, attackerUuid, targetUuid, type, health, abilityName,
  kind, parry, notAttack, retaliation, canReact, alreadyAnswered, damageApplied, unanswerable } = {}) {
  return [reactorUuid, attackerUuid, targetUuid].every(id) && reactorUuid !== attackerUuid
    && targetUuid === reactorUuid && type === "npc" && Number.isFinite(health) && health > 0
    && abilityName === PHASE_SHIFT.name && kind === "attack" && parry === false && notAttack === false
    && retaliation === false && canReact === true && alreadyAnswered === false
    && damageApplied === false && unanswerable === false;
}

/** A dedicated restriction rather than Stunned: Phase Shift does not grant
 * a Defense penalty, immunity, invisibility or exemption from later hits.
 * The runtime supplies the imp's next-turn timing, or six seconds out of combat. */
export function phaseShiftEffect({ ownerUuid, attackUuid, index, timing } = {}) {
  if (![ownerUuid, attackUuid].every(id) || !Number.isInteger(index) || index < 0) return null;
  const duration = timing?.duration, start = timing?.start;
  if (!Number.isSafeInteger(start?.time) || start.time < 0) return null;
  if (duration?.units === "turns") {
    if (duration.value !== 1 || duration.expiry !== "turnStart" || !id(start.combat) || !id(start.combatant)) return null;
  } else if (duration?.units !== "seconds" || duration.value !== PHASE_SHIFT.seconds) return null;
  return { name: PHASE_SHIFT.name, img: "icons/magic/defensive/barrier-shield-dome-pink.webp",
    origin: ownerUuid, description: "You cannot act until the start of your next turn (6 seconds outside combat). Phase Shift cancels only the attack it answered.",
    disabled: false, transfer: false, statuses: [], system: { changes: [] },
    duration: { expiry: "turnStart", expired: false, ...structuredClone(duration) },
    start: { combat: null, combatant: null, initiative: 0, round: 0, turn: 0, ...structuredClone(start) },
    flags: { "azeroth-rpg": { identifier: "phase-shift", [PHASE_SHIFT_FLAG]: { version: 1, ownerUuid, attackUuid, index } } } };
}

/** Any live restriction blocks actions; accidental duplicate carriers cannot
 * let the creature act early. The ability itself remains attack-specific. */
export function phaseShiftBlocksAction({ effects = [], ownerUuid } = {}) {
  if (!id(ownerUuid)) return false;
  return [...effects].some(effect => {
    const state = effect?.flags?.["azeroth-rpg"]?.[PHASE_SHIFT_FLAG];
    return state?.version === 1 && state.ownerUuid === ownerUuid && effect.origin === ownerUuid
      && id(state.attackUuid) && Number.isInteger(state.index) && state.index >= 0
      && !effect.disabled && effect.active !== false && !effect.isSuppressed && !effect.duration?.expired;
  });
}

/** Being forced to resist or displaced is not choosing to act. */
export function phaseShiftRefusal(actor, operation) {
  if (["resilience", "forcedMovement"].includes(operation)) return null;
  const effects = actor?.effects?.values?.() ?? actor?.effects ?? [];
  return phaseShiftBlocksAction({ effects, ownerUuid: actor?.uuid })
    ? "AZEROTH.PhaseShift.CannotAct" : null;
}
