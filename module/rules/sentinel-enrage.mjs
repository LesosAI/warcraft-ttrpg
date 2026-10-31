/** Classic threshold with explicit tabletop bonuses. The encounter flag
 * latches after triggering; healing above the threshold does not remove it. */
import { validSentinelPack } from "./anubisath-pack.mjs";
export function sentinelEnrageDue(health, already = false) {
  return already !== true && Number.isFinite(health?.value) && Number.isFinite(health?.max)
    && health.max > 0 && health.value > 0 && health.value < health.max * 0.3;
}

export function sentinelEnrageBonus({ health, pack, actorUuid, abilities = [] } = {}) {
  return pack?.enraged === true && health?.value > 0
    && validSentinelPack(pack.assignment) && pack.assignment.members.some(member => member.uuid === actorUuid)
    && abilities.some(row => row?.name === "Sentinel Enrage") ? 2 : 0;
}
