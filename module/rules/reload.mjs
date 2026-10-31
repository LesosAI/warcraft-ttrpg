/** 08 Reload/Swift and 02 Gun Drill. Pure: no document writes or turn clocks. */
export function reloadCost(traits = [], {gunDrill = false} = {}) {
  let base = null;
  let swift = 0;
  for (const trait of traits) {
    const text = String(trait).trim();
    const reload = /^Reload\s*\((\d+)\)$/i.exec(text);
    if (reload) base = Math.max(base ?? 0, Number(reload[1]));
    if (/^Swift\s*\(Lesser\)$/i.test(text)) swift = Math.max(swift, 1);
    if (/^Swift\s*\(Greater\)$/i.test(text)) swift = Math.max(swift, 2);
  }
  if (base === null) return null;
  if (!Number.isSafeInteger(base)) return null;
  const effective = Math.max(0, base - swift);
  // Gun Drill cannot add a cost to a weapon Swift has made free to reload.
  return gunDrill && effective > 0 ? Math.max(1, effective - 1) : effective;
}

/** Progress is Half-Actions actually paid since the last shot, not turns passed.
 * Recompute cost from current equipment/talents without discarding paid work.
 * Missing state describes a weapon that has not fired; malformed state refuses.
 */
export function reloadRemaining(cost, state = null) {
  if (cost === null) return 0;
  if (!Number.isSafeInteger(cost) || cost < 0) return null;
  if (state === null) return 0;
  if (state?.version !== 1 || typeof state.fired !== "boolean"
    || typeof state.shotId !== "string" || !state.shotId.trim()
    || !Number.isSafeInteger(state.paid) || state.paid < 0) return null;
  return state.fired ? Math.max(0, cost - state.paid) : 0;
}

export function reloadAfterShot(shotId) {
  if (typeof shotId !== "string" || !shotId.trim()) return null;
  return {version: 1, shotId, fired: true, paid: 0};
}

/** Called only after the workflow confirms one Half-Action was spent. */
export function reloadAfterPayment(cost, state) {
  const remaining = reloadRemaining(cost, state);
  if (remaining === null || remaining === 0) return null;
  return {...state, paid: state.paid + 1};
}
