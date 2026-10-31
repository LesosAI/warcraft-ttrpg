/** One checked GM movement may suppress Opportunity Attacks, never movement
 * payment or area entry. No document flag or caller movement option grants it. */
const held = new WeakMap();
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = p => Number.isFinite(p?.x) && Number.isFinite(p?.y);

export async function withRocketJump({ token, to, valid, run } = {}) {
  if (!gmHere() || !token?.actor || !point(token) || !point(to) || typeof valid !== "function"
    || !valid() || typeof run !== "function" || held.has(token)) return false;
  const permission = { actor: token.actor, scene: token.parent, from: { x: token.x, y: token.y },
    to: { x: to.x, y: to.y }, elevation: token.elevation, level: token.level, valid, used: false };
  held.set(token, permission);
  try { return await run(); }
  finally { held.delete(token); }
}

/** Consume synchronously in moveToken, before its asynchronous payment queue. */
export function consumeRocketJump(token, movement) {
  const p = held.get(token);
  if (!p || p.used || !gmHere() || token.actor !== p.actor || token.parent !== p.scene || !p.valid()) return false;
  const path = movement?.passed?.waypoints;
  if (!Array.isArray(path) || !path.length || !point(movement.origin)
    || movement.origin.x !== p.from.x || movement.origin.y !== p.from.y) return false;
  const dx = p.to.x - p.from.x, dy = p.to.y - p.from.y, length2 = dx * dx + dy * dy;
  if (!(length2 > 0)) return false;
  let previous = 0;
  for (const w of path) {
    if (!point(w) || w.action !== "walk" || w.elevation !== p.elevation || w.level !== p.level) return false;
    const x = w.x - p.from.x, y = w.y - p.from.y, along = x * dx + y * dy;
    if (along < previous || along > length2 || Math.abs(x * dy - y * dx) > 0.001) return false;
    previous = along;
  }
  if (previous <= 0) return false;
  p.used = true;
  return true;
}
