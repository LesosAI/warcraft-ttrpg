import { ringSpots } from "./summon-places.mjs";
import { MOBILE_ALERT } from "./mobile-alert.mjs";

/** Unlike ordinary summon placement, an alarm must not stack its two guards
 * when the ring is full. Refuse the ring helper's occupied fallback. */
export function mobileSentrySpots({ origin, cell, size, standing = [], board } = {}) {
  if (![origin?.x, origin?.y, cell?.w, cell?.h, size?.width, size?.height,
    board?.x, board?.y, board?.width, board?.height].every(Number.isFinite)
    || cell.w <= 0 || cell.h <= 0 || size.width <= 0 || size.height <= 0) return null;
  const spots = ringSpots({ origin, cell, size, standing, board, count: MOBILE_ALERT.count, includeOrigin: false });
  const taken = [...standing];
  for (const spot of spots) {
    const box = { ...spot, ...size };
    if (box.x < board.x || box.y < board.y || box.x + box.width > board.x + board.width
      || box.y + box.height > board.y + board.height) return null;
    if (taken.some(other => box.x < other.x + other.width && other.x < box.x + box.width
      && box.y < other.y + other.height && other.y < box.y + box.height)) return null;
    taken.push(box);
  }
  return spots;
}
