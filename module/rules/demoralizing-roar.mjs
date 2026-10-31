/** Elder Shardtooth's attack-power reduction, adapted to attack Damage Rating. */
export const DEMORALIZING_ROAR = Object.freeze({
  name: "Demoralizing Roar", action: "half", radius: 15,
  dc: 17, resilience: "spirit", penalty: 2, seconds: 12, uses: 1, per: "short"
});
export const DEMORALIZING_ROAR_FLAG = "demoralizingRoar";
const id = value => typeof value === "string" && value.trim().length > 0;

/** Characters use attack lanes; NPCs use the scalar consumed by their attacks. */
export function demoralizingRoarChanges(type) {
  const key = type === "character" ? "system.damageBonus.attack.all"
    : type === "npc" ? "system.damageBonus" : null;
  return key ? [{ key, type: "add", value: String(-DEMORALIZING_ROAR.penalty), phase: "final", priority: 100 }] : [];
}

export function demoralizingRoarEffect({ sourceUuid, targetUuid, targetType, time } = {}) {
  const changes = demoralizingRoarChanges(targetType);
  if (!id(sourceUuid) || !id(targetUuid) || !Number.isFinite(time) || !changes.length) return null;
  return {
    name: DEMORALIZING_ROAR.name, img: "icons/svg/terror.svg", origin: sourceUuid,
    description: "<p>Your attack Damage Rating is reduced by 2 for 12 seconds. This does not reduce spell damage or your attributes. Another Demoralizing Roar refreshes the duration instead of adding another penalty.</p>",
    disabled: false, statuses: [], duration: { units: "seconds", value: DEMORALIZING_ROAR.seconds },
    start: { time }, system: { changes },
    flags: { "azeroth-rpg": { harmful: true, [DEMORALIZING_ROAR_FLAG]: {
      version: 1, sourceUuid, targetUuid, startedAt: time, expiresAt: time + DEMORALIZING_ROAR.seconds
    } } }
  };
}
