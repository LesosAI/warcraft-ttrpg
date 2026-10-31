/** Read-only V14 movement evidence for a declared Stinger charge.
 * Verified against installed 14.367 TokenDocument movement history/path API.
 * These helpers run on the GM; never accept a client-supplied snapshot as proof.
 * They do not pay movement or judge walls/direct approach. */
const POSITION = ["x", "y", "elevation", "width", "height", "depth", "shape", "level"];
const position = token => Object.fromEntries(POSITION.map(key => [key, token?._source?.[key] ?? null]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const history = token => structuredClone(token?._source?._movementHistory ?? []);

export function captureVeknissMovement(source, target) {
  if (!source?.uuid || !target?.uuid || source.parent?.id !== target.parent?.id) return null;
  return { sourceUuid: source.uuid, targetUuid: target.uuid, sceneId: source.parent.id,
    sourcePosition: position(source), targetPosition: position(target), history: history(source) };
}

/** `paidFeet` is the current movement allowance already paid on the combatant,
 * not a claimed distance or the number of Half-Actions still available.
 * The caller must derive it for the same movement mode, turn and actor. */
export function observeVeknissMovement(saved, source, target, { paidFeet, action } = {}) {
  const refuse = reason => ({ ok: false, reason, moved: 0, movementPaid: false, targetStayed: false });
  if (!saved || source?.uuid !== saved.sourceUuid || target?.uuid !== saved.targetUuid
    || source.parent?.id !== saved.sceneId || target.parent?.id !== saved.sceneId) return refuse("identity");
  if (!same(position(target), saved.targetPosition)) return refuse("targetMoved");
  if (!["walk", "fly"].includes(action) || !Number.isFinite(paidFeet) || paidFeet < 0) return refuse("allowance");
  const current = history(source);
  if (!Array.isArray(saved.history) || current.length < saved.history.length
    || !same(current.slice(0, saved.history.length), saved.history)) return refuse("historyChanged");
  const added = current.slice(saved.history.length);
  if (!added.length) return refuse("noMovement");
  // Core inserts the initial zero-cost origin when history was empty. Every
  // other waypoint must be actual movement of the declared mode, not teleport.
  if (added.some(w => w.action !== action)) return refuse("movementMode");
  if (current.some(w => !Number.isFinite(w.cost) || w.cost < 0)) return refuse("unmeasuredCost");
  const cost = current.reduce((sum, w) => sum + w.cost, 0);
  if (cost > paidFeet + 0.001) return refuse("unpaidMovement");
  const end = added.at(-1);
  if (POSITION.some(key => end[key] !== undefined && end[key] !== (source._source[key] ?? null))) return refuse("unrecordedPosition");
  // Stored costs include terrain. Omitting them asks V14 for actual distance,
  // so difficult ground cannot satisfy the minimum approach without travel.
  const path = [saved.sourcePosition, ...added].map(({ cost, ...waypoint }) => waypoint);
  let moved;
  try { moved = source.measureMovementPath(path)?.distance; }
  catch { return refuse("measurement"); }
  if (!Number.isFinite(moved) || moved <= 0) return refuse("measurement");
  return { ok: true, reason: null, moved, cost, movementPaid: true, targetStayed: true };
}
