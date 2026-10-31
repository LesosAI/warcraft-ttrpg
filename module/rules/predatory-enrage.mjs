/** Tabletop adaptation: a brief paid burst of damage and ordinary Extra Attack. */
export function predatoryEnrageEligible(health = {}) {
  return Number.isFinite(health.value) && Number.isFinite(health.max)
    && health.max > 0 && health.value > 0 && health.value * 10 <= health.max * 3;
}
export const PREDATORY_ENRAGE = Object.freeze({ name: "Predatory Enrage", action: "half", seconds: 12, damage: 2, uses: 1, per: "short" });
export const PREDATORY_ENRAGE_FLAG = "predatoryEnrage";
const id = v => typeof v === "string" && v.trim().length > 0;
export function predatoryEnrageEffect({ sourceUuid, cast, time } = {}) {
  if (!id(sourceUuid) || !id(cast) || !Number.isFinite(time)) return null;
  return { name: PREDATORY_ENRAGE.name, img: "icons/svg/terror.svg", origin: sourceUuid, disabled: false, statuses: [],
    description: "<p>For 12 seconds, your attack Damage Rating increases by 2 and each ordinary Attack makes two strikes. This does not stack with Extra Attack or add strikes to special multi-target abilities, off-hand attacks or Reactions. Healing above 30% Health does not end the effect.</p>",
    duration: { units: "seconds", value: PREDATORY_ENRAGE.seconds }, start: { time },
    system: { changes: [{ key: "system.damageBonus", type: "add", value: "2", phase: "final", priority: 100 }] },
    flags: { "azeroth-rpg": { [PREDATORY_ENRAGE_FLAG]: { version: 1, sourceUuid, cast, startedAt: time, expiresAt: time + PREDATORY_ENRAGE.seconds } } } };
}
export function hasPredatoryEnrage(actor, time) {
  if (actor?.type !== "npc" || !id(actor.uuid) || !Number.isFinite(time)) return false;
  return [...(actor.effects ?? [])].some(effect => {
    const mark = effect.flags?.["azeroth-rpg"]?.[PREDATORY_ENRAGE_FLAG];
    return effect.active !== false && !effect.disabled && !effect.isSuppressed && !effect.duration?.expired
      && mark?.version === 1 && mark.sourceUuid === actor.uuid && id(mark.cast)
      && Number.isFinite(mark.startedAt) && mark.expiresAt === mark.startedAt + PREDATORY_ENRAGE.seconds
      && time >= mark.startedAt && time < mark.expiresAt;
  });
}
