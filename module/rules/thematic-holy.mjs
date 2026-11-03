/** Pure state laws for the two new Holy spells. Document writes, consent,
 * distance measurement, Health caps and damage provenance belong to adapters. */

const SPELLS = Object.freeze({
  "prayer-of-mending": Object.freeze({ identifier: "prayer-of-mending", name: "Prayer of Mending", classes: ["Priest"], mana: 5,
    action: "action", rangeFt: 30, jumpFt: 15, charges: 3, heal: 3, seconds: 60 }),
  "gentle-verdict": Object.freeze({ identifier: "gentle-verdict", name: "Gentle Verdict", classes: ["Priest", "Paladin"], mana: 3,
    action: "halfAction", rangeFt: 0, duration: "endOfNextTurn" })
});
for (const spell of Object.values(SPELLS)) Object.freeze(spell.classes);

const ref = value => typeof value === "string" && value.trim().length > 0 && value.length <= 200 && !/\s/u.test(value);
const clock = value => Number.isSafeInteger(value) && value >= 0;
const health = value => Number.isSafeInteger(value) && value >= 0;
const result = value => ({ ok: true, value });
const refused = reason => ({ ok: false, reason });

export function holySpell(identifier) {
  const spell = Object.hasOwn(SPELLS, identifier) ? SPELLS[identifier] : null;
  return spell ? { ...spell, classes: [...spell.classes] } : null;
}

function validMending(state) {
  return state?.version === 1 && state.identifier === "prayer-of-mending" && ref(state.cast)
    && ref(state.casterUuid) && (state.holderUuid === null || ref(state.holderUuid))
    && clock(state.startsAt) && state.expiresAt === state.startsAt + 60
    && Number.isInteger(state.charges) && state.charges >= 0 && state.charges <= 3
    && ["active", "choosing", "ended"].includes(state.status)
    && Array.isArray(state.seenEventIds) && state.seenEventIds.length <= 3
    && state.seenEventIds.every(ref) && new Set(state.seenEventIds).size === state.seenEventIds.length;
}

/** `alreadyHeld` is the adapter's check for any other live Mending on the
 * intended recipient. The cast has one shared charge pool and one clock. */
export function startMending({ cast, casterUuid, holderUuid, now, alreadyHeld = false } = {}) {
  if (!ref(cast) || !ref(casterUuid) || !ref(holderUuid) || !clock(now) || !clock(now + 60)) return refused("cast");
  if (alreadyHeld) return refused("stack");
  return result({ version: 1, identifier: "prayer-of-mending", cast, casterUuid, holderUuid,
    charges: 3, startsAt: now, expiresAt: now + 60, status: "active", seenEventIds: [] });
}

/** Process a resolved damage event after the actual Health write. The event ID
 * is recorded only for a trigger; at most three such IDs can be retained. */
export function mendingOnDamage(state, { eventId, holderUuid, healthBefore, healthAfter, hostile, now } = {}) {
  if (!validMending(state) || !ref(eventId) || !ref(holderUuid) || !health(healthBefore)
    || !health(healthAfter) || !clock(now)) return refused("event");
  if (now >= state.expiresAt || state.charges === 0) {
    return { ok: true, triggered: false, heal: 0, state: { ...state, holderUuid: null, status: "ended" } };
  }
  if (state.status !== "active") return { ok: true, triggered: false, heal: 0, state };
  if (state.holderUuid !== holderUuid || state.seenEventIds.includes(eventId) || hostile !== true
    || healthAfter >= healthBefore || healthAfter <= 0) {
    return { ok: true, triggered: false, heal: 0, state };
  }
  const charges = state.charges - 1;
  const ended = charges === 0;
  return { ok: true, triggered: true, heal: 3,
    state: { ...state, charges, holderUuid: ended ? null : holderUuid, status: ended ? "ended" : "choosing",
      seenEventIds: [...state.seenEventIds, eventId] } };
}

/** Complete a triggered jump. Passing no recipient means the GM found none;
 * an illegal suggested recipient refuses so a different one may be chosen. */
export function mendingJump(state, { targetUuid = null, willing = false, distanceFt, alreadyHeld = false, now } = {}) {
  if (!validMending(state) || state.status !== "choosing" || !clock(now)) return refused("state");
  if (now >= state.expiresAt || targetUuid === null) {
    return result({ ...state, holderUuid: null, status: "ended" });
  }
  if (!ref(targetUuid) || targetUuid === state.holderUuid || willing !== true
    || typeof distanceFt !== "number" || !Number.isFinite(distanceFt) || distanceFt < 0 || distanceFt > 15
    || alreadyHeld) return refused("recipient");
  return result({ ...state, holderUuid: targetUuid, status: "active" });
}

/** Accept only the v14 timing produced by untilEndOfNextTurnOrRound: one
 * combatant turn ending at turnEnd, or one six-second round out of combat. */
function verdictTiming(timing) {
  const start = timing?.start, duration = timing?.duration;
  if (!clock(start?.time)) return null;
  if (duration?.value === 1 && duration.units === "turns" && duration.expiry === "turnEnd"
    && ref(start.combat) && ref(start.combatant) && clock(start.round) && clock(start.turn)) {
    return { start: { combat: start.combat, combatant: start.combatant, round: start.round, turn: start.turn, time: start.time },
      duration: { value: 1, units: "turns", expiry: "turnEnd" } };
  }
  if (duration?.value === 6 && duration.units === "seconds") {
    return { start: { time: start.time }, duration: { value: 6, units: "seconds" } };
  }
  return null;
}

export function startVerdict({ cast, casterUuid, timing } = {}) {
  const valid = verdictTiming(timing);
  if (!ref(cast) || !ref(casterUuid) || !valid) return refused("cast");
  return result({ version: 1, identifier: "gentle-verdict", cast, casterUuid, timing: valid, status: "ready" });
}

function validVerdict(state) {
  return state?.version === 1 && state.identifier === "gentle-verdict" && ref(state.cast)
    && ref(state.casterUuid) && ["ready", "spent", "expired"].includes(state.status)
    && verdictTiming(state.timing) !== null;
}

/** Consume when the caster *attempts* the next qualifying direct Holy spell,
 * before the Test. `active` is the adapter's live V14 duration check. */
export function verdictOnAttempt(state, attempt = {}) {
  if (!validVerdict(state)) return refused("state");
  if (state.status !== "ready") return { ok: true, consumed: false, state, grant: null };
  if (attempt.active !== true) return { ok: true, consumed: false, state: { ...state, status: "expired" }, grant: null };
  const qualifies = ref(attempt.attemptId) && attempt.casterUuid === state.casterUuid
    && attempt.sourceKind === "spell" && attempt.school === "holy" && attempt.damaging === true
    && attempt.direct === true && attempt.targetKind === "living" && attempt.targetCount === 1
    && attempt.area !== true && attempt.ongoing !== true && attempt.weapon !== true;
  if (!qualifies) return { ok: true, consumed: false, state, grant: null };
  return { ok: true, consumed: true, state: { ...state, status: "spent" },
    grant: { version: 1, cast: state.cast, attemptId: attempt.attemptId,
      casterUuid: state.casterUuid, canRestrain: attempt.explicitDestroy !== true } };
}

/** Applied only to this attempt's resolved blow. The flag suppresses a new
 * Critical Injury; stabilization applies only if this blow drops Health to 0. */
export function verdictConsequence(grant, { attemptId, hit, healthBefore, healthAfter } = {}) {
  if (grant?.version !== 1 || !ref(grant.cast) || !ref(grant.attemptId) || !ref(grant.casterUuid)
    || grant.attemptId !== attemptId || typeof grant.canRestrain !== "boolean" || typeof hit !== "boolean") {
    return refused("attempt");
  }
  if (!hit || !grant.canRestrain) return { ok: true, suppressNewCriticalInjury: false, stabilizeAtZero: false };
  if (!health(healthBefore) || !health(healthAfter)) return refused("health");
  return { ok: true, suppressNewCriticalInjury: true,
    stabilizeAtZero: healthBefore > 0 && healthAfter === 0 };
}
