import { GHOUL_ENRAGE } from "./naxxramas-ghoul.mjs";
export { ghoulEnrageEligible } from "./naxxramas-ghoul.mjs";
export const GHOUL_ENRAGE_FLAG = "ghoulEnrage";
const id = value => typeof value === "string" && value.trim().length > 0;

/** V14 timed carrier. Melee damage is read by the attack pipeline, not a
 * global damageBonus change that would also affect ranged attacks. */
export function ghoulEnrageEffect({ sourceUuid, cast, time } = {}) {
  if (!id(sourceUuid) || !id(cast) || !Number.isFinite(time)) return null;
  return { name: GHOUL_ENRAGE.name, img: "icons/svg/terror.svg", origin: sourceUuid,
    disabled: false, statuses: [],
    description: "<p>For 12 seconds, melee attacks gain +2 Damage Rating and ordinary Attack actions gain Extra Attack. This does not stack with Extra Attack or add strikes to named special actions, off-hand attacks or Reactions. Healing above 30% Health does not end this effect.</p>",
    duration: { units: "seconds", value: GHOUL_ENRAGE.seconds }, start: { time },
    system: { changes: [] },
    flags: { "azeroth-rpg": { [GHOUL_ENRAGE_FLAG]: { version: 1, sourceUuid, cast,
      startedAt: time, expiresAt: time + GHOUL_ENRAGE.seconds } } } };
}

export function hasGhoulEnrage(actor, time) {
  if (actor?.type !== "npc" || !id(actor.uuid) || !Number.isFinite(time)) return false;
  return [...(actor.effects ?? [])].some(effect => {
    const mark = effect.flags?.["azeroth-rpg"]?.[GHOUL_ENRAGE_FLAG];
    return effect.active !== false && !effect.disabled && !effect.isSuppressed && !effect.duration?.expired
      && mark?.version === 1 && mark.sourceUuid === actor.uuid && id(mark.cast)
      && Number.isFinite(mark.startedAt) && mark.expiresAt === mark.startedAt + GHOUL_ENRAGE.seconds
      && time >= mark.startedAt && time < mark.expiresAt;
  });
}

export function ghoulEnrageDamage(actor, time, mode) {
  return mode === "hand" && hasGhoulEnrage(actor, time) ? GHOUL_ENRAGE.damage : 0;
}
