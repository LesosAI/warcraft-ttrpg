/** Swept axis-aligned token rectangle against an occupied rectangle. Touching
 * edges are legal; passing through the interior is not. Invalid shapes block. */
export function wanderCrossesOccupied(from, to, size, obstacle) {
  if (![from?.x, from?.y, to?.x, to?.y, size?.width, size?.height,
    obstacle?.x, obstacle?.y, obstacle?.width, obstacle?.height].every(Number.isFinite)
    || size.width <= 0 || size.height <= 0 || obstacle.width <= 0 || obstacle.height <= 0) return true;
  let low = 0, high = 1;
  for (const [axis, span] of [["x", "width"], ["y", "height"]]) {
    const min = obstacle[axis] - size[span], max = obstacle[axis] + obstacle[span];
    const start = from[axis], delta = to[axis] - start;
    if (delta === 0) { if (start <= min || start >= max) return false; continue; }
    const a = (min - start) / delta, b = (max - start) / delta;
    low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b));
    if (low >= high) return false;
  }
  return low < high;
}
