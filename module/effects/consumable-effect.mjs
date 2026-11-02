function contains(actual, expected) {
  if (expected === null || typeof expected !== 'object') return actual === expected;
  if (!actual || typeof actual !== 'object') return false;
  if (Array.isArray(expected) && (!Array.isArray(actual) || actual.length !== expected.length)) return false;
  return Object.entries(expected).every(([key, value]) => contains(actual[key], value));
}

/** Confirm persisted mechanics before reporting a timed consumable as applied.
 * The dose has already been paid. An uncertain write is never retried here. */
export async function writeConsumableEffect(actor, data, existing = null) {
  const owns = () => actor?.isOwner && globalThis.fromUuidSync?.(actor.uuid) === actor;
  if (!owns() || (existing && actor.effects.get(existing.id) !== existing))
    throw Error('Consumable effect recipient changed');
  const expected = structuredClone(data);
  const effect = existing ? await existing.update(data)
    : (await actor.createEmbeddedDocuments('ActiveEffect', [data]))[0];
  const raw = effect?.toObject();
  if (!owns() || !effect || effect.parent !== actor || actor.effects.get(effect.id) !== effect
    || raw?.disabled !== (expected.disabled ?? false)
    || !['origin', 'system', 'flags', 'start', 'duration', 'statuses'].every(key =>
      expected[key] === undefined || contains(raw?.[key], expected[key])))
    throw Error('Consumable effect was not confirmed; review the spent dose before retrying');
  return effect;
}
