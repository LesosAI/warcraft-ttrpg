import { isEquippedShield } from "./armor.mjs";

/** Scarlet Knight's tabletop adaptation of Classic NPC spell 8242.
 * Damage uses the ordinary physical attack pipeline. The separate Body Test
 * governs only Stunned, never whether the attack's damage is applied.
 */
export const NPC_SHIELD_SLAM = Object.freeze({
  name: "Shield Slam", action: "action", feet: 5, bonus: 6, rating: 4,
  damageType: "physical", resist: "body", dc: 15,
  condition: "stunned", until: "endOfNextTurn", uses: 1, per: "encounter"
});

/** Capture an actual held shield by identity, never infer it from a portrait,
 * an attack name, armor points or a creature's name. Recheck the returned ID
 * after a dialog and before payment/rolling; losing it invalidates the use.
 */
export function shieldSlamShield(items = [], selectedId = null) {
  const held = items.filter(item => isEquippedShield(item)
    && typeof (item.id ?? item._id) === "string" && (item.id ?? item._id).length > 0);
  const item = selectedId === null ? held[0] : held.find(item => (item.id ?? item._id) === selectedId);
  return item ? { id: item.id ?? item._id, name: String(item.name ?? "Shield") } : null;
}

/** A successful Attack Test permits the stun resistance even if armor absorbs
 * all damage. Cancellation or malformed roll data must not create a rider.
 */
export function shieldSlamStunTest(outcome) {
  if (outcome?.success !== true || !Number.isInteger(outcome.sl) || outcome.sl < 0) return null;
  return { resilience: NPC_SHIELD_SLAM.resist, dc: NPC_SHIELD_SLAM.dc,
    onFail: { condition: NPC_SHIELD_SLAM.condition, until: NPC_SHIELD_SLAM.until } };
}
