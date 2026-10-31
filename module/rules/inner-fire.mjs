/** Classic charged armor; AP and Mana are tabletop adaptations. */
export const INNER_FIRE = Object.freeze({ name: "Inner Fire", mana: 2, action: "action",
  ap: 2, charges: 20, minutes: 10, seconds: 600 });
export const INNER_FIRE_FLAG = "innerFire";
const id = value => typeof value === "string" && value.trim().length > 0;

export function innerFireStart({ ownerUuid, castId, time } = {}) {
  if (!id(ownerUuid) || !id(castId) || !Number.isFinite(time)) return null;
  return { version: 1, ownerUuid, castId, startedAt: time, expiresAt: time + INNER_FIRE.seconds,
    charges: INNER_FIRE.charges, spent: [] };
}

export function innerFireActive(state, { ownerUuid, time, disabled = false } = {}) {
  return Boolean(state?.version === 1 && state.ownerUuid === ownerUuid && id(ownerUuid) && id(state.castId)
    && Number.isFinite(state.startedAt) && state.expiresAt === state.startedAt + INNER_FIRE.seconds
    && Number.isFinite(time) && time >= state.startedAt && time < state.expiresAt && disabled === false
    && Number.isInteger(state.charges) && state.charges > 0 && state.charges <= INNER_FIRE.charges
    && Array.isArray(state.spent) && state.spent.length === INNER_FIRE.charges - state.charges
    && state.spent.every(id) && new Set(state.spent).size === state.spent.length);
}

/** Call AFTER resolved damage so the last charge still protects that hit.
 * Damage to temporary Health qualifies. A fully prevented hit does not.
 * The caller also records the receipt on the attack card, independently of
 * this removable/recastable carrier. No Health-delta inference belongs here.
 */
export function innerFireSpend(state, { ownerUuid, castId, attackId, time, disabled = false,
  hit = false, weapon = false, damageApplied = 0, withdrawn = false } = {}) {
  if (!innerFireActive(state, { ownerUuid, time, disabled }) || castId !== state.castId
    || !id(attackId) || state.spent.includes(attackId) || hit !== true || weapon !== true
    || withdrawn !== false || !Number.isFinite(damageApplied) || damageApplied <= 0) return null;
  const next = { ...state, charges: state.charges - 1, spent: [...state.spent, attackId] };
  return { next, exhausted: next.charges === 0 };
}

export function innerFireEffect({ ap, ownerUuid, castId, time, timing } = {}) {
  const state = innerFireStart({ ownerUuid, castId, time });
  const changes = Object.entries(ap ?? {}).filter(([, value]) => Number.isFinite(value) && value >= 0)
    .map(([location]) => ({ key: `system.ap.${location}`, type: "add", value: String(INNER_FIRE.ap), phase: "final", priority: 50 }));
  if (!state || !changes.length || !timing?.duration || !timing?.start) return null;
  return { name: INNER_FIRE.name, img: "icons/svg/shield.svg", origin: ownerUuid, disabled: false,
    statuses: [], system: { changes }, duration: { ...timing.duration }, start: { ...timing.start },
    flags: { "azeroth-rpg": { identifier: "inner-fire", [INNER_FIRE_FLAG]: state } } };
}
