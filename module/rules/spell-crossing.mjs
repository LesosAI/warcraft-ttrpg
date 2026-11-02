/** Instant movement with damage along the chosen path, not at the destination. */
export function crossingOriginMatches(token, origin) {
  return Boolean(token && origin && ['x','y','elevation','width','height','depth','shape','level'].every(key => token[key] === origin[key]));
}

export function spellCrossingFrom(item) {
  const system = item?.system;
  if (item?.type !== 'spell' || system?.target !== 'Self' || system?.duration?.kind !== 'instant') return null;
  const text = String(system.effect ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const movements = [...text.matchAll(/\bYou come apart into embers and reform up to (\d+) feet away, in a space you can see\./g)];
  const hits = [...text.matchAll(/\bA creature whose space you cross takes (\d+) Fire damage\./g)];
  if (movements.length !== 1 || hits.length !== 1 || !text.includes('the movement provokes nothing.')) return null;
  const feet = Number(movements[0][1]), rating = Number(hits[0][1]);
  if (![feet, rating].every(n => Number.isSafeInteger(n) && n > 0)) return null;
  return { feet, sight: 'see', path: 'straight', provokes: false, damage: { rating, school: 'fire' }, trigger: 'crossed-space' };
}

/** Intersect the straight centre line with an occupied space. Coordinates on
 * each axis must share units; elevation may use scene units while x/y use pixels.
 * A boundary-only graze does not cross the interior. No travel means no crossing.
 */
export function crossesSpace(from, to, space) {
  if (!from || !to || !space) return false;
  const axes = ['x', 'y', 'elevation'];
  if (!axes.every(axis => [from[axis], to[axis], space.min?.[axis], space.max?.[axis]].every(Number.isFinite))) return false;
  if (axes.every(axis => from[axis] === to[axis])) return false;
  let enter = 0, exit = 1;
  for (const axis of axes) {
    const low = space.min[axis], high = space.max[axis], start = from[axis], delta = to[axis] - start;
    if (high < low || (axis !== 'elevation' && high === low)) return false;
    if (delta === 0) {
      if (low === high ? start !== low : (axis === 'elevation' ? start < low || start >= high : start <= low || start >= high)) return false;
      continue;
    }
    const a = (low - start) / delta, b = (high - start) / delta;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (enter >= exit) return false;
  }
  if (enter >= exit) return false;
  if (space.ellipse) {
    const cx = (space.min.x + space.max.x) / 2, cy = (space.min.y + space.max.y) / 2;
    const rx = (space.max.x - space.min.x) / 2, ry = (space.max.y - space.min.y) / 2;
    const x = (from.x - cx) / rx, y = (from.y - cy) / ry;
    const dx = (to.x - from.x) / rx, dy = (to.y - from.y) / ry;
    const t = Math.max(enter, Math.min(exit, -(x * dx + y * dy) / (dx * dx + dy * dy)));
    return (x + t * dx) ** 2 + (y + t * dy) ** 2 < 1;
  }
  if (!space.polygon) return true;
  const points = space.polygon;
  if (!Array.isArray(points) || points.length < 3 || !points.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))) return false;
  const dx = to.x - from.x, dy = to.y - from.y, cuts = [enter, exit];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const ex = b.x - a.x, ey = b.y - a.y, determinant = dx * ey - dy * ex;
    if (determinant === 0) continue;
    const ax = a.x - from.x, ay = a.y - from.y;
    const t = (ax * ey - ay * ex) / determinant, u = (ax * dy - ay * dx) / determinant;
    if (t > enter && t < exit && u >= 0 && u <= 1) cuts.push(t);
  }
  cuts.sort((a, b) => a - b);
  for (let k = 1; k < cuts.length; k++) {
    if (cuts[k] <= cuts[k - 1]) continue;
    const t = (cuts[k] + cuts[k - 1]) / 2, x = from.x + t * dx, y = from.y + t * dy;
    let inside = false, boundary = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j], b = points[i];
      if ((x - a.x) * (b.y - a.y) === (y - a.y) * (b.x - a.x)
        && x >= Math.min(a.x,b.x) && x <= Math.max(a.x,b.x) && y >= Math.min(a.y,b.y) && y <= Math.max(a.y,b.y)) boundary = true;
      if ((a.y > y) !== (b.y > y) && x < (b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) inside = !inside;
    }
    if (inside && !boundary) return true;
  }
  return false;
}
