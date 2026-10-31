/** Sample a selected route at native pixel resolution, retaining only new
 * snapped positions. A bounded pass prevents malformed routes from hanging
 * the canvas. Foundry supplies snapping; this module contains no grid rules. */
export function seductionRouteSteps(waypoints, snap, maxSamples = 50000) {
  if (!Array.isArray(waypoints) || waypoints.length < 2 || typeof snap !== "function") return null;
  const valid = p => [p?.x, p?.y, p?.elevation].every(Number.isFinite) && typeof p.level === "string";
  if (!waypoints.every(valid) || !Number.isInteger(maxSamples) || maxSamples < 1) return null;
  const result = [{ ...waypoints[0] }];
  let samples = 0;
  try {
    for (let i = 1; i < waypoints.length; i++) {
      const from = waypoints[i - 1], to = waypoints[i];
      if (from.level !== to.level || from.elevation !== to.elevation) return null;
      const count = Math.max(1, Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))));
      samples += count;
      if (samples > maxSamples) return null;
      for (let n = 1; n <= count; n++) {
        const raw = { x: from.x + (to.x - from.x) * n / count,
          y: from.y + (to.y - from.y) * n / count, elevation: from.elevation, level: from.level };
        const position = n === count ? to : snap(raw);
        if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return null;
        const next = { x: position.x, y: position.y, elevation: raw.elevation, level: raw.level };
        const previous = result.at(-1);
        if (next.x !== previous.x || next.y !== previous.y) result.push(next);
      }
    }
    return result.length > 1 ? result : null;
  } catch { return null; }
}
