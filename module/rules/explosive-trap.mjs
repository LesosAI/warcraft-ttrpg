import { resolveRecordedDamage } from "./damage-record.mjs";

/** The prepared feature damage, before any victim's mitigation. No documents. */
export function explosiveTrapSnapshot({ rating, dc, extras = [], dealtHalved = false } = {}) {
  if (!Number.isFinite(rating) || !Number.isFinite(dc) || dc <= 0
    || !Array.isArray(extras) || extras.some(row => !row || typeof row.type !== "string" || !row.type
      || !Number.isFinite(row.amount))) return null;
  return { version: 1, rating, dc, type: "fire", resilience: "reflex",
    extras: extras.map(({ type, amount }) => ({ type, amount })),
    dealtHalved: dealtHalved === true || Boolean(dealtHalved && typeof dealtHalved === "object") };
}

/** Same feature damage lane as Use, with the responding victim's defenses. */
export function explosiveTrapDamage(snapshot, target = {}, { passed = false } = {}) {
  if (snapshot?.version !== 1 || snapshot.type !== "fire" || snapshot.resilience !== "reflex"
    || !explosiveTrapSnapshot(snapshot) || typeof passed !== "boolean") return null;
  return resolveRecordedDamage({
    rating: snapshot.rating, sl: 0, kind: "magical", school: "fire", location: "body",
    slAddsToDamage: false, passedHalf: passed, dealtHalved: snapshot.dealtHalved,
    extras: snapshot.extras,
    ward: target.wardBySchool?.fire ?? 0, wardBySchool: target.wardBySchool ?? {},
    schoolArmor: target.schoolArmor?.fire ?? 0, schoolArmorBySchool: target.schoolArmor ?? {},
    immune: target.immune ?? [], vulnerable: target.vulnerable ?? [],
    fireTakenBonus: target.fireTakenBonus ?? 0
  });
}

/** Reserve one answer per caught actor; callers verify the actual roll first. */
export function explosiveTrapClaimPlan({ snapshot, trigger, claims = [], actorUuid, resultId, passed, target } = {}) {
  if (trigger?.version !== 1 || trigger.phase !== "resolved" || !Array.isArray(trigger.areaTargets)
    || typeof actorUuid !== "string" || !actorUuid || !trigger.areaTargets.includes(actorUuid)
    || typeof resultId !== "string" || !resultId || typeof passed !== "boolean"
    || !Array.isArray(claims) || claims.some(row => !row || typeof row.actorUuid !== "string" || !row.actorUuid)) {
    return { ok: false, reason: "invalid" };
  }
  if (claims.some(row => row.actorUuid === actorUuid || row.resultId === resultId)) return { ok: false, reason: "claimed" };
  const damage = explosiveTrapDamage(snapshot, target, { passed });
  if (!damage) return { ok: false, reason: "invalid" };
  const claim = { actorUuid, resultId, passed, phase: "claimed", damage };
  return { ok: true, claim, claims: [...structuredClone(claims), claim] };
}
