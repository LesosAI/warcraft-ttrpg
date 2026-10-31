/** Gameplay-relevant placement state, independent of native schema defaults. */
export function snarePlacementProof(data) {
  const shapes = data?.shapes;
  const flags = data?.flags?.["azeroth-rpg"];
  if (!Array.isArray(shapes) || shapes.length !== 1 || shapes[0]?.type !== "circle"
    || ![shapes[0].x, shapes[0].y, shapes[0].radius].every(Number.isFinite) || shapes[0].radius <= 0
    || !flags?.messageId || flags.featureKey !== "snare" || !flags.caster) return null;
  const shape = shapes[0];
  return {
    shape: { type: "circle", x: shape.x, y: shape.y, radius: shape.radius, gridBased: shape.gridBased === true, hole: shape.hole === true },
    elevation: { bottom: data.elevation?.bottom ?? null, top: data.elevation?.top ?? null },
    levels: [...(data.levels ?? [])].sort(), attachedTo: data.attachment?.token ?? null,
    restriction: data.restriction?.enabled === true, behaviors: (data.behaviors ?? []).length,
    hidden: data.hidden === true,
    source: { messageId: flags.messageId, caster: flags.caster, featureKey: flags.featureKey, cast: flags.cast ?? null,
      spellUuid: flags.spellUuid ?? null }
  };
}

export function snarePlacementReviewPlan(record, region, { triggered = false, pending = false } = {}) {
  if (pending) return { ok: false, reason: "pending" };
  if (record?.version !== 1 || record.phase !== "claimed" || !record.proof || triggered) return { ok: false, reason: "state" };
  if (!region || region._id !== record.regionId) return { ok: false, reason: "missing" };
  const proof = snarePlacementProof(region);
  if (!proof || JSON.stringify(proof) !== JSON.stringify(record.proof)) return { ok: false, reason: "changed" };
  return { ok: true, proof };
}
