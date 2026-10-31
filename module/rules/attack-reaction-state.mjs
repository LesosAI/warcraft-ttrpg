/** Pre-payment refusal for cards that participate in durable attack resolution.
 * Legacy cards retain their existing path. This is admission, not a reservation:
 * a caller must still coordinate writes against changes after this check.
 */
export function attackReactionRefusal(state, index, actorUuid) {
  if (state === null || state === undefined) return null;
  if (state.version !== 1 || !Array.isArray(state.targets)) return "unknownDelivery";
  if (!Number.isInteger(index) || index < 0 || !actorUuid || state.targets[index]?.targetUuid !== actorUuid) return "targetChanged";
  if (state.targets.some(row => !["pending", "applied", "phased"].includes(row?.stage))) return "reconcile";
  return state.targets[index].stage === "pending" ? null : "resolved";
}
