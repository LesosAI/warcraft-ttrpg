/** Validate a supplied approach route and select its affordable prefix.
 * The adapter must provide native movement steps, cumulative terrain cost,
 * collision checks and footprint distance to the original charmer. A detour
 * may initially lead away, provided the complete checked route approaches.
 * This neither invents a route nor moves a token. */
export function seductionApproachPath({ waypoints, budget, measure, clear, distanceToSource } = {}) {
  const refuse = reason => ({ ok: false, reason, path: [], cost: 0 });
  if (!Array.isArray(waypoints) || waypoints.length < 2 || !Number.isFinite(budget) || budget < 0
    || ![measure, clear, distanceToSource].every(fn => typeof fn === "function")) return refuse("configuration");
  if (!waypoints.every(point => [point?.x, point?.y, point?.elevation].every(Number.isFinite)
    && typeof point.level === "string" && point.level.length > 0)) return refuse("geometry");
  const level = waypoints[0].level;
  if (waypoints.some(point => point.level !== level)) return refuse("levelChange");
  const route = waypoints.map(({ x, y, elevation, level }) => ({ x, y, elevation, level }));
  const seen = new Set();
  for (const point of route) {
    const key = JSON.stringify(point);
    if (seen.has(key)) return refuse("loop");
    seen.add(key);
  }
  try {
    const startDistance = distanceToSource(route[0]), endDistance = distanceToSource(route.at(-1));
    if (![startDistance, endDistance].every(n => Number.isFinite(n) && n >= 0)) return refuse("unchecked");
    if (endDistance >= startDistance) return refuse("notApproaching");
    for (let i = 1; i < route.length; i++) {
      if (clear(route[i - 1], route[i]) !== true) return refuse("blocked");
    }
    // Native cumulative costs are nonnegative and monotonic. Binary search
    // avoids measuring every prefix of a pixel-dense gridless route.
    let accepted = 0, acceptedCost = 0, upper = route.length - 1;
    let upperCost = measure(route);
    if (!Number.isFinite(upperCost) || upperCost <= 0) return refuse("unchecked");
    if (upperCost <= budget) return { ok: true, reason: null, path: route, cost: upperCost };
    while (upper - accepted > 1) {
      const middle = Math.floor((accepted + upper) / 2);
      const cost = measure(route.slice(0, middle + 1));
      if (!Number.isFinite(cost) || cost < acceptedCost || cost > upperCost || cost <= 0) return refuse("unchecked");
      if (cost <= budget) { accepted = middle; acceptedCost = cost; }
      else { upper = middle; upperCost = cost; }
    }
    if (!accepted) return refuse("budget");
    return { ok: true, reason: null, path: route.slice(0, accepted + 1), cost: acceptedCost };
  } catch { return refuse("unchecked"); }
}
