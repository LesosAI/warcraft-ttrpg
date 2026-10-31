/** Reflection Field's target-routing law. No casting, payment, damage or
 * document writes happen here. Call before target-specific mitigation and
 * before applying any spell payload. The casting workflow consumes this plan.
 */
export const REFLECTION_FLAG = "reflectionField";

/** An omitted school list is the original unrestricted Reflection Field.
 * A restricted field requires an explicitly matching spell school. */
export function reflectionCovers(field, school) {
  return field != null && (!Object.hasOwn(field, "schools")
    || (Array.isArray(field.schools) && field.schools.includes(school)));
}

export function reflectionTargetKey(target) {
  if (typeof target?.sceneId === "string" && target.sceneId && typeof target?.tokenId === "string" && target.tokenId) {
    return `token:${target.sceneId}:${target.tokenId}`;
  }
  return typeof target?.actorUuid === "string" && target.actorUuid ? `actor:${target.actorUuid}` : null;
}

/** `fields` and per-target `harmful` decisions are trusted current snapshots.
 * An active field must name its source; the adapter verifies expiry/source
 * existence. A spell of uncertain intent requires review instead of guessing
 * from its name or school. Areas and existing periodic ticks never reflect.
 * Markers belong to one cast and target index, preserving independent hits.
 */
export function reflectionPlan({ castId, caster = null, targets = [], fields = {}, harmful = {},
  area = false, periodic = false, success = true, previous = [], school = null } = {}) {
  const unchanged = reason => ({ ok: true, reason, targets: [...targets], reflections: [], needsReview: [] });
  if (!success || area || periodic) return unchanged(!success ? "failedCast" : area ? "area" : "periodic");
  if (typeof castId !== "string" || !castId) return { ...unchanged("missingCast"), ok: false };
  const reflections = [], needsReview = [];
  const routed = [...targets];
  const casterKey = reflectionTargetKey(caster);
  for (const [index, target] of targets.entries()) {
    const from = reflectionTargetKey(target);
    if (!from || !Object.hasOwn(fields, from)) continue;
    const field = fields[from];
    if (field?.active !== true || typeof field.sourceUuid !== "string" || !field.sourceUuid) continue;
    if (!reflectionCovers(field, school)) continue;
    if (previous.some(mark => mark.castId === castId && mark.index === index)) continue;
    if (casterKey === from) continue;
    const intent = Object.hasOwn(harmful, from) ? harmful[from] : null;
    if (intent === false) continue;
    if (intent !== true) { needsReview.push({ index, target: from }); continue; }
    if (!casterKey) return { ...unchanged("missingCaster"), ok: false };
    routed[index] = caster;
    reflections.push({ castId, index, from, to: casterKey, sourceUuid: field.sourceUuid });
  }
  if (needsReview.length) return { ...unchanged("needsReview"), ok: false, needsReview };
  return { ok: true, reason: null, targets: routed, reflections, needsReview: [] };
}

/** Validate recorded return paths before the animation reader draws them. */
export function reflectionPaths(flags = {}) {
  if (flags.kind !== "spell" || flags.success !== true || flags.area || !flags.cast) return [];
  const seen = new Set(), paths = [];
  for (const mark of flags.reflections ?? []) {
    if (!Number.isInteger(mark.index) || mark.index < 0 || seen.has(mark.index) || mark.castId !== flags.cast) continue;
    const source = flags.originalTargets?.[mark.index], target = flags.targets?.[mark.index];
    if (!source?.sceneId || !source.tokenId || !target?.tokenId || source.sceneId !== target.sceneId) continue;
    if (reflectionTargetKey(source) !== mark.from || reflectionTargetKey(target) !== mark.to || mark.from === mark.to) continue;
    if (reflectionTargetKey(flags.source) !== mark.to) continue;
    seen.add(mark.index);
    paths.push({ index: mark.index, source, target });
  }
  return paths;
}
