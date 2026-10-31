/** Core Hound's bounded Bleeding rider. Separate from unrelated wounds. */
export const SERRATED_BITE = Object.freeze({ name: "Serrated Bite", action: "half",
  feet: 5, bonus: 8, damage: 9, bleeding: 1, uses: 1, per: "short" });
export const SERRATED_BITE_FLAG = "serratedBite";
const id = value => typeof value === "string" && value.trim().length > 0;

/** The attack card is the claim identity, allowing its own rider to be removed
 * if a later defensive reaction withdraws that hit. Caller verifies the hit. */
export function serratedBiteEffect({ sourceUuid, messageUuid, targetUuid, timing } = {}) {
  if (![sourceUuid, messageUuid, targetUuid].every(id) || !timing?.start || !timing?.duration) return null;
  const { duration, start } = timing;
  const world = duration.units === "seconds" && duration.value === 6 && Number.isFinite(start.time);
  const combat = duration.units === "turns" && duration.value === 1 && duration.expiry === "turnEnd"
    && id(start.combat) && id(start.combatant) && Number.isInteger(start.round) && start.round >= 1
    && Number.isInteger(start.turn) && start.turn >= 0 && Number.isFinite(start.time);
  if (!world && !combat) return null;
  return { name: SERRATED_BITE.name, img: "icons/svg/blood.svg", origin: sourceUuid,
    disabled: false, statuses: ["bleeding"], system: { changes: [] },
    duration: { ...duration }, start: { ...start },
    flags: { "azeroth-rpg": { harmful: true, value: SERRATED_BITE.bleeding,
      [SERRATED_BITE_FLAG]: { version: 1, sourceUuid, messageUuid, targetUuid } } } };
}
