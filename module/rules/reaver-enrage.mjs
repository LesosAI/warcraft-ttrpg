/** Tabletop adaptation: a brief paid burst of damage and ordinary Extra Attack. */
import { reaverEnrageEligible } from "./crypt-reaver.mjs";
export { reaverEnrageEligible };
export const REAVER_ENRAGE = Object.freeze({ name: "Reaver Enrage", action: "half", seconds: 12, damage: 2, uses: 1, per: "short" });
export const REAVER_ENRAGE_FLAG = "reaverEnrage";
const id = v => typeof v === "string" && v.trim().length > 0;
export function reaverEnrageEffect({ sourceUuid, cast, time } = {}) {
  if (!id(sourceUuid) || !id(cast) || !Number.isFinite(time)) return null;
  return { name: REAVER_ENRAGE.name, img: "icons/svg/terror.svg", origin: sourceUuid, disabled: false, statuses: [],
    description: "<p>For 12 seconds, your attack Damage Rating increases by 2 and each ordinary Attack makes two strikes. This does not stack with Extra Attack or add strikes to Reaver Cleave, off-hand attacks or Reactions. Healing above half Health does not end the effect.</p>",
    duration: { units: "seconds", value: REAVER_ENRAGE.seconds }, start: { time },
    system: { changes: [{ key: "system.damageBonus", type: "add", value: "2", phase: "final", priority: 100 }] },
    flags: { "azeroth-rpg": { [REAVER_ENRAGE_FLAG]: { version: 1, sourceUuid, cast, startedAt: time, expiresAt: time + REAVER_ENRAGE.seconds } } } };
}
export function hasReaverEnrage(actor, time) {
  if (actor?.type !== "npc" || !id(actor.uuid) || !Number.isFinite(time)) return false;
  return [...(actor.effects ?? [])].some(effect => {
    const mark = effect.flags?.["azeroth-rpg"]?.[REAVER_ENRAGE_FLAG];
    return effect.active !== false && !effect.disabled && !effect.isSuppressed && !effect.duration?.expired
      && mark?.version === 1 && mark.sourceUuid === actor.uuid && id(mark.cast)
      && Number.isFinite(mark.startedAt) && mark.expiresAt === mark.startedAt + REAVER_ENRAGE.seconds
      && time >= mark.startedAt && time < mark.expiresAt;
  });
}
