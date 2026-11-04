/** A Devourer's death burst is one event, not a reusable ability. Its poison is carried until
 *  cured (D12) and repeats once an hour outside a fight (`seconds`). */
export const MAGGOT_GOO_FLAG = "maggotGoo";
export const MAGGOT_GOO = Object.freeze({ name: "Maggot Goo", feet: 10, dc: 16,
  resilience: "body", immediate: 4, damage: 2, seconds: 3600 });
const id = value => typeof value === "string" && value.trim().length > 0;

export function maggotGooDeath({ before, after, hasAbility = false } = {}) {
  return hasAbility === true && Number.isFinite(before) && before > 0 && after === 0;
}

/** Persist the returned claim before resistance, damage, or poison writes.
 * A claimed event is terminal even if some later writes cannot be confirmed. */
export function claimMaggotGoo({ actorUuid, tokenUuid, sceneUuid, deathId, clock,
  health, observedDeath = false, existing = null } = {}) {
  if (![actorUuid, tokenUuid, sceneUuid, deathId, clock].every(id) || health !== 0 || observedDeath !== true)
    return { ok: false, reason: "death" };
  if (existing !== null) {
    if (existing?.version !== 1 || existing.actorUuid !== actorUuid || existing.tokenUuid !== tokenUuid
      || existing.sceneUuid !== sceneUuid || existing.phase !== "claimed" || !id(existing.deathId))
      return { ok: false, reason: "state" };
    return { ok: false, reason: "claimed" };
  }
  return { ok: true, state: { version: 1, actorUuid, tokenUuid, sceneUuid, deathId, clock, phase: "claimed" } };
}
