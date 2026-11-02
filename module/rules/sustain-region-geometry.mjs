/** Relocate the native circle/cone/line shapes produced by regions.mjs.
 * Distances remain in feet across differently scaled scenes; facing, relative
 * offsets and vertical span are preserved. Attachment is an explicit policy
 * supplied by the coordinator, not inferred from a ground area's new location.
 * No document mutation or authorization is performed here. */
export function sustainRegionGeometry({ region, sourceScale, targetScale, target, attach } = {}) {
  const fail = reason => ({ ok: false, reason });
  const finite = value => typeof value === "number" && Number.isFinite(value);
  if (![sourceScale, targetScale].every(value => finite(value) && value > 0)
    || ![target?.x, target?.y, target?.elevation].every(finite)
    || !Array.isArray(target?.levels) || !target.levels.every(value => typeof value === "string" && value)
    || typeof attach !== "boolean" || (attach && (typeof target.tokenId !== "string" || !target.tokenId))) return fail("destination");
  if (!Array.isArray(region?.shapes) || region.shapes.length === 0) return fail("shapes");
  const anchor = region.shapes[0], ratio = targetScale / sourceScale;
  const shapes = [];
  for (const original of region.shapes) {
    if (!original || !["circle", "cone", "line"].includes(original.type)
      || original.gridBased !== false || ![original.x, original.y].every(finite)) return fail("shapeType");
    const dimensions = original.type === "line" ? ["length", "width"] : ["radius"];
    if (!dimensions.every(key => finite(original[key]) && original[key] > 0)
      || (original.type !== "circle" && !finite(original.rotation))
      || (original.type === "cone" && (!finite(original.angle) || original.angle <= 0 || original.angle > 360))) return fail("shapeDimensions");
    const shape = structuredClone(original);
    shape.x = target.x + (original.x - anchor.x) * ratio;
    shape.y = target.y + (original.y - anchor.y) * ratio;
    for (const key of dimensions) shape[key] *= ratio;
    if (![shape.x, shape.y, ...dimensions.map(key => shape[key])].every(finite)) return fail("shapeDimensions");
    shapes.push(shape);
  }
  const oldElevation = region.elevation ?? {};
  if (oldElevation.bottom != null && !finite(oldElevation.bottom)) return fail("elevation");
  if (oldElevation.top != null && (!finite(oldElevation.top) || oldElevation.bottom == null
    || oldElevation.top < oldElevation.bottom)) return fail("elevation");
  const top = oldElevation.top == null ? null : target.elevation + oldElevation.top - oldElevation.bottom;
  if (top !== null && !finite(top)) return fail("elevation");
  return { ok: true, patch: {
    shapes, elevation: { ...structuredClone(oldElevation), bottom: target.elevation, top },
    levels: [...target.levels], attachment: { token: attach ? target.tokenId : null }
  } };
}

/** Spellsteal's approved attachment policy: stationary ground stays stationary;
 * an attached area follows the stealing Mage's token. Caller input cannot
 * override that policy. The generic geometry helper remains useful separately.
 */
export function stolenRegionGeometry({region,sourceScale,targetScale,target} = {}) {
  const token = region?.attachment?.token;
  if (token != null && (typeof token !== "string" || !token.trim())) return {ok:false,reason:"sourceAttachment"};
  return sustainRegionGeometry({region,sourceScale,targetScale,target,attach:token != null});
}
