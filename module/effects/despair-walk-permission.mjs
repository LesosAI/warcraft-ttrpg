/** In-memory permission for one GM-controlled checked walking path. It cannot
 * be requested through a token flag or a caller-supplied movement option. */
const held = new WeakMap();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = value => Number.isFinite(value?.x) && Number.isFinite(value?.y);

export async function withDespairWalk({ token, to, valid, run } = {}) {
  if (!gmHere() || !token?.actor || !point(token) || !point(to) || typeof valid !== "function"
    || !valid() || typeof run !== "function" || held.has(token)) return false;
  const permission = { actor: token.actor, scene: token.parent, from: { x: token.x, y: token.y },
    to: { x: to.x, y: to.y }, elevation: token.elevation, level: token.level, valid };
  held.set(token, permission);
  try { return await run(); }
  finally { held.delete(token); }
}

export function permittedDespairWalk(token, movement) {
  const p = held.get(token);
  if (!p || !gmHere() || token.actor !== p.actor || token.parent !== p.scene || !p.valid()) return false;
  const path = movement?.passed?.waypoints;
  if (!Array.isArray(path) || !path.length || !point(movement.origin)
    || movement.origin.x !== p.from.x || movement.origin.y !== p.from.y) return false;
  const end = path.at(-1);
  if (end.x !== p.to.x || end.y !== p.to.y) return false;
  const dx = p.to.x - p.from.x, dy = p.to.y - p.from.y, length2 = dx * dx + dy * dy;
  if (!(length2 > 0)) return false;
  return path.every(w => {
    if (!point(w) || w.action !== "walk" || w.elevation !== p.elevation || w.level !== p.level) return false;
    const x = w.x - p.from.x, y = w.y - p.from.y, along = x * dx + y * dy;
    return along >= 0 && along <= length2 && Math.abs(x * dy - y * dx) <= 0.001;
  });
}
