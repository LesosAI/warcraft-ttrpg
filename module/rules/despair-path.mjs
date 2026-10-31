/** Choose a checked walking destination; callers supply native grid snapping,
 * path cost and collision/occupancy checks. Missing checks never allow a move. */
export function despairPath({ origin, bearing, feet, pixelsPerFoot, snap, measure, clear } = {}) {
  const refuse = reason => ({ ok: false, reason, to: null, feet: 0 });
  if (![origin?.x, origin?.y, bearing, feet, pixelsPerFoot].every(Number.isFinite)
    || bearing < 0 || bearing >= 360 || bearing % 45 !== 0 || feet < 0 || feet > 10 || pixelsPerFoot <= 0
    || typeof snap !== "function" || typeof measure !== "function" || typeof clear !== "function") return refuse("configuration");
  if (feet === 0) return refuse("stationary");
  const diagonal = Math.SQRT1_2;
  const [dx, dy] = [[0, -1], [diagonal, -diagonal], [1, 0], [diagonal, diagonal],
    [0, 1], [-diagonal, diagonal], [-1, 0], [-diagonal, -diagonal]][bearing / 45];
  const seen = new Set();
  try {
    for (let distance = feet; distance > 0; distance = Math.max(0, distance - 1)) {
      const candidate = snap({ x: origin.x + dx * distance * pixelsPerFoot,
        y: origin.y + dy * distance * pixelsPerFoot });
      if (![candidate?.x, candidate?.y].every(Number.isFinite)) return refuse("unchecked");
      const to = { x: candidate.x, y: candidate.y };
      const key = `${to.x}:${to.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cost = measure(origin, to);
      if (!Number.isFinite(cost) || cost < 0) return refuse("unchecked");
      if (cost === 0 || cost > feet) continue;
      if (clear(origin, to) !== true) continue;
      return { ok: true, reason: null, to, feet: cost };
    }
    return refuse("blocked");
  } catch { return refuse("unchecked"); }
}
