export const FIRE_SHIELD = Object.freeze({ name: "Fire Shield", amount: 2, school: "fire", radius: 30, rounds: 2, seconds: 12 });
export const FIRE_SHIELD_FLAG = "fireShield";
const id = value => typeof value === "string" && value.trim().length > 0;

/** Only one active, correctly owned carrier may answer a hit. Disabled,
 * expired and ambiguous duplicate carriers never multiply retaliation.
 */
export function fireShieldCarrier(effects = [], ownerUuid) {
  if (!id(ownerUuid)) return null;
  const carriers = [...effects].filter(effect => {
    const state = effect?.flags?.["azeroth-rpg"]?.[FIRE_SHIELD_FLAG];
    return state?.version === 1 && state.ownerUuid === ownerUuid && id(state.castId)
      && id(state.casterUuid) && state.casterUuid !== ownerUuid && effect.origin === state.casterUuid
      && !effect.disabled && effect.active !== false && !effect.duration?.expired;
  });
  return carriers.length === 1 ? carriers[0] : null;
}

/** Empty changes are intentional: this carrier grants no Ward or Armor. */
export function fireShieldEffect({ ownerUuid, casterUuid, castId, timing } = {}) {
  if (![ownerUuid, casterUuid, castId].every(id) || ownerUuid === casterUuid) return null;
  const duration = timing?.duration;
  if (!(duration?.units === "rounds" && duration.value === FIRE_SHIELD.rounds)
      && !(duration?.units === "seconds" && duration.value === FIRE_SHIELD.seconds)) return null;
  if (!Number.isFinite(timing?.start?.time) || timing.start.time < 0) return null;
  return { name: FIRE_SHIELD.name, img: "icons/magic/defensive/shield-barrier-flaming-pentagon-red.webp",
    origin: casterUuid, description: "An enemy that hits this creature with a melee attack takes 2 Fire damage. This shield grants no Ward.",
    disabled: false, transfer: false, statuses: [], system: { changes: [] },
    duration: { expiry: "turnStart", expired: false, ...structuredClone(duration) },
    start: { combat: null, combatant: null, initiative: 0, round: 0, turn: 0, ...structuredClone(timing.start) },
    flags: { "azeroth-rpg": { identifier: "fire-shield", [FIRE_SHIELD_FLAG]: { version: 1, ownerUuid, casterUuid, castId } } } };
}
