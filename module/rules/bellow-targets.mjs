/** Revalidate the original selection; never silently substitute a recipient. */
export function bellowTargetRefusal({ sameActor, deafened, distance, feet = 20 } = {}) {
  if (!sameActor) return 'changed';
  if (deafened) return 'hearing';
  if (distance !== null && (!Number.isFinite(distance) || distance > feet)) return 'range';
  return null;
}

/** A missing writer acknowledgement is uncertain, not proof of no effect. */
export function bellowDeliveryResult({ actorUuid, name, delivery, result }) {
  const effectId = typeof result?.effectId === 'string' && result.effectId ? result.effectId : null;
  return { actorUuid, name, delivery: structuredClone(delivery), effectId,
    state: effectId ? 'confirmed' : 'unconfirmed' };
}
