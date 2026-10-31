/** The book's Lightning Shield, also used for the Dust Stormer adaptation.
 * This is retaliation, never Ward. Runtime claims the attack independently
 * of this removable carrier, then persists the spent charge before damage.
 */
export const LIGHTNING_SHIELD = Object.freeze({ name: "Lightning Shield", charges: 3,
  damage: 2, school: "nature", mana: 2, action: "half", seconds: 3600 });
const id = value => typeof value === "string" && value.trim().length > 0;

export function lightningShieldStart({ ownerUuid, castId, time } = {}) {
  if (!id(ownerUuid) || !id(castId) || !Number.isFinite(time)) return null;
  return { ownerUuid, castId, charges: LIGHTNING_SHIELD.charges, startedAt: time,
    expiresAt: time + LIGHTNING_SHIELD.seconds };
}

export function lightningShieldActive(state, { ownerUuid, time, disabled = false } = {}) {
  return Boolean(state && id(state.castId) && id(state.ownerUuid) && state.ownerUuid === ownerUuid
    && Number.isInteger(state.charges) && state.charges > 0 && state.charges <= LIGHTNING_SHIELD.charges
    && Number.isFinite(state.startedAt) && Number.isFinite(state.expiresAt)
    && state.expiresAt === state.startedAt + LIGHTNING_SHIELD.seconds
    && Number.isFinite(time) && time >= state.startedAt && time < state.expiresAt && disabled === false);
}

/** A hit can trigger even when Ward/armor absorbed all damage. Misses, ranged
 * attacks, spells and retaliation do not. Range is validated at the hit by
 * the ordinary melee attack path, not re-invented as a five-foot limit here.
 */
export function lightningShieldDischarge(state, { ownerUuid, attackerUuid, attackId,
  melee = false, hit = false, retaliation = false, time, disabled = false } = {}) {
  if (!lightningShieldActive(state, { ownerUuid, time, disabled }) || !id(attackerUuid)
    || attackerUuid === ownerUuid || !id(attackId) || melee !== true || hit !== true || retaliation !== false) return null;
  const next = { ...state, charges: state.charges - 1 };
  return { next, endsAfterDamage: next.charges === 0, attackId, targetUuid: attackerUuid,
    damage: { rating: LIGHTNING_SHIELD.damage, school: LIGHTNING_SHIELD.school } };
}
