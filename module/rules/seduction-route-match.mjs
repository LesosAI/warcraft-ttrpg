const point = p => [p?.x, p?.y, p?.elevation].every(Number.isFinite) && typeof p.level === "string";
const axes = ["x", "y", "elevation"];
function fraction(p, a, b) {
  if (![p, a, b].every(point) || p.level !== a.level || p.level !== b.level) return null;
  const delta = axes.map(k => b[k] - a[k]);
  const length2 = delta.reduce((sum, n) => sum + n * n, 0);
  if (!(length2 > 0)) return null;
  const t = axes.reduce((sum, k, i) => sum + (p[k] - a[k]) * delta[i], 0) / length2;
  if (t < -1e-8 || t > 1 + 1e-8) return null;
  if (axes.some((k, i) => Math.abs(p[k] - (a[k] + t * delta[i])) > 0.01)) return null;
  return Math.min(1, Math.max(0, t));
}

/** Native terrain may insert points along a reviewed leg. Permit those and
 * partial progress, but never reverse, leave the route or cut a corner. */
export function movementFollowsSeductionRoute(route, movement) {
  const steps = movement?.passed?.waypoints;
  if (!Array.isArray(route) || route.length < 2 || !route.every(point)
    || !Array.isArray(steps) || !steps.length || !point(movement.origin)
    || !steps.every(p => point(p) && p.action === "walk")) return false;
  const positions = [movement.origin, ...steps];
  let progress = -1;
  for (let n = 0; n < positions.length; n++) {
    const p = positions[n], before = positions[n - 1];
    let selected = null;
    for (let i = 0; i < route.length - 1; i++) {
      const t = fraction(p, route[i], route[i + 1]);
      if (t === null || i + t < progress - 1e-8) continue;
      // A straight native leg can pass collinear route points, but must not
      // skip a bend where the approved route changes direction.
      if (before && axes.some(k => p[k] !== before[k])) {
        let skipsCorner = false;
        for (let j = Math.floor(progress) + 1; j < i + t; j++) {
          if (j >= 0 && fraction(route[j], before, p) === null) { skipsCorner = true; break; }
        }
        if (skipsCorner) continue;
      }
      selected = i + t; break;
    }
    if (selected === null) return false;
    progress = selected;
  }
  return true;
}
