import { taintedBloodDamage } from "./demon-abilities.mjs";

export const TAINTED_BLOOD = Object.freeze({ name: "Tainted Blood", seconds: 12, cap: 5 });
export const TAINTED_BLOOD_AURA = "taintedBloodAura";
export const TAINTED_BLOOD_PENALTY = "taintedBloodPenalty";
const id = value => typeof value === "string" && value.trim().length > 0;
const time = value => Number.isSafeInteger(value) && value >= 0;
const live = effect => !effect.disabled && effect.active !== false && !effect.isSuppressed && !effect.duration?.expired;

/** Separate carriers let an attacker's penalty outlive the felhunter's aura.
 * Neither carrier alters attack bonuses, Armor, Ward or spell damage. */
function effectData({ ownerUuid, now, flag, state, description }) {
  return { name: TAINTED_BLOOD.name, img: "icons/magic/unholy/strike-body-life-soul-green.webp",
    origin: ownerUuid, description, disabled: false, transfer: false, statuses: [], system: { changes: [] },
    start: { combat: null, combatant: null, initiative: 0, round: 0, turn: 0, time: now },
    duration: { value: TAINTED_BLOOD.seconds, units: "seconds", expiry: "turnStart", expired: false },
    flags: { "azeroth-rpg": { identifier: flag === TAINTED_BLOOD_AURA ? "tainted-blood-aura" : "tainted-blood-penalty",
      [flag]: { version: 1, ownerUuid, ...state } } } };
}

export function taintedBloodAuraEffect({ ownerUuid, castId, now } = {}) {
  if (!id(ownerUuid) || !id(castId) || !time(now)) return null;
  return effectData({ ownerUuid, now, flag: TAINTED_BLOOD_AURA, state: { castId, expiresAt: now + TAINTED_BLOOD.seconds },
    description: "For 12 seconds, an enemy that hits you with a melee attack gains one Tainted Blood stack after the attack resolves." });
}

export function taintedBloodPenaltyEffect({ ownerUuid, record, now } = {}) {
  if (!id(ownerUuid) || !time(now) || record?.expiresAt !== now + TAINTED_BLOOD.seconds
    || !Number.isInteger(record.stacks) || record.stacks < 1 || record.stacks > TAINTED_BLOOD.cap
    || !Array.isArray(record.hitIds) || !record.hitIds.length || !record.hitIds.every(id)
    || new Set(record.hitIds).size !== record.hitIds.length) return null;
  return effectData({ ownerUuid, now, flag: TAINTED_BLOOD_PENALTY, state: structuredClone(record),
    description: `Your melee attacks have ${record.stacks} less Damage Rating, to a minimum of 0. This does not affect ranged attacks or spells. Dispel removes the whole penalty.` });
}

/** Ambiguous duplicates fail closed instead of multiplying a shared penalty. */
export function taintedBloodCarrier(effects, ownerUuid, flag, now) {
  if (!id(ownerUuid) || !time(now) || ![TAINTED_BLOOD_AURA, TAINTED_BLOOD_PENALTY].includes(flag)) return null;
  const matches = [...effects].filter(effect => {
    const state = effect?.flags?.["azeroth-rpg"]?.[flag];
    if (!state || state.version !== 1 || state.ownerUuid !== ownerUuid || effect.origin !== ownerUuid || !live(effect)
      || !time(state.expiresAt) || state.expiresAt <= now) return false;
    return flag === TAINTED_BLOOD_AURA ? id(state.castId)
      : Number.isInteger(state.stacks) && state.stacks >= 1 && state.stacks <= TAINTED_BLOOD.cap
        && Array.isArray(state.hitIds) && state.hitIds.length > 0 && state.hitIds.every(id)
        && new Set(state.hitIds).size === state.hitIds.length;
  });
  return matches.length === 1 ? matches[0] : null;
}

export function taintedBloodAttackRating(rating, { effects = [], ownerUuid, now, meleeAttack, spell = false } = {}) {
  const carrier = taintedBloodCarrier(effects, ownerUuid, TAINTED_BLOOD_PENALTY, now);
  return taintedBloodDamage(rating, carrier?.flags["azeroth-rpg"][TAINTED_BLOOD_PENALTY], { now, meleeAttack, spell });
}
