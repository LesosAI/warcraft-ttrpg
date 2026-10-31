import { HIDDEN_STATUS } from "./stealth.mjs";
import { CONCEAL_FLAG } from "./legacy-uses.mjs";

export const LESSER_INVISIBILITY_FLAG = "lesserInvisibility";
export const LESSER_INVISIBILITY = Object.freeze({
  name: "Lesser Invisibility", identifier: "lesser-invisibility", mana: 2, minutes: 1
});
const identity = value => typeof value === "string" && value.trim().length > 0;

/** Ownership, realm, incapacitation and payment are checked by the workflow. */
export function lesserInvisibilityAllowed({ type, health, mana, inCombat = false, active = false } = {}) {
  return type === "npc" && Number.isFinite(health) && health > 0
    && Number.isFinite(mana) && mana >= LESSER_INVISIBILITY.mana
    && inCombat === false && active === false;
}

/** A failed attack or Casting Test still ends the effect. Cancelled menus and
 * prevented damage do not. Combat entry and movement alone never end it. */
export function lesserInvisibilityEnds({ event, damage = 0 } = {}) {
  if (["attack", "cast", "ability"].includes(event)) return true;
  return event === "damage" && Number.isFinite(damage) && damage > 0;
}

/** This ability starts outside combat, so its minute uses the world clock even
 * if a fight begins later. It shares core visibility and the normal attack/cast
 * reveal path, without setting the actor's unrelated Hide flag. */
export function lesserInvisibilityEffect({ ownerUuid, castId, worldTime } = {}) {
  if (!identity(ownerUuid) || !identity(castId) || !Number.isInteger(worldTime) || worldTime < 0) return null;
  return {
    name: LESSER_INVISIBILITY.name, img: "icons/svg/invisible.svg", origin: ownerUuid,
    disabled: false, transfer: false, statuses: [HIDDEN_STATUS],
    duration: { value: LESSER_INVISIBILITY.minutes, units: "minutes", expiry: "turnStart", expired: false },
    start: { time: worldTime, combat: null, combatant: null, initiative: 0, round: 0, turn: 0 },
    system: { changes: [] },
    flags: { "azeroth-rpg": { identifier: LESSER_INVISIBILITY.identifier,
      [LESSER_INVISIBILITY_FLAG]: { version: 1, ownerUuid, castId },
      [CONCEAL_FLAG]: { ends: ["attack", "cast"] } } }
  };
}

export function isLesserInvisibilityEffect(effect, ownerUuid) {
  const flags = effect?.flags?.["azeroth-rpg"], state = flags?.[LESSER_INVISIBILITY_FLAG];
  return Boolean(identity(ownerUuid) && effect?.origin === ownerUuid
    && flags?.identifier === LESSER_INVISIBILITY.identifier && state?.version === 1
    && state.ownerUuid === ownerUuid && identity(state.castId));
}

/** Read the carrier without trusting delayed core expiry cleanup. A duplicate
 * carrier grants no additional benefit; visibility suppression is checked by
 * the caller against the particular token involved in the Test. */
export function lesserInvisibilityActive(effects, ownerUuid, worldTime) {
  if (!Number.isFinite(worldTime)) return false;
  return [...(effects?.values?.() ?? effects ?? [])].some(effect => {
    if (!isLesserInvisibilityEffect(effect, ownerUuid) || effect.active === false
      || effect.disabled === true || effect.isSuppressed === true || effect.duration?.expired === true) return false;
    const start = effect.start?.time;
    return Number.isFinite(start) && start >= 0 && worldTime >= start
      && worldTime < start + LESSER_INVISIBILITY.minutes * 60;
  });
}
