import { isLesserInvisibilityEffect, lesserInvisibilityEnds } from "../rules/lesser-invisibility.mjs";

const queues = new Map();
const values = collection => [...(collection?.values?.() ?? collection ?? [])];

/** Serialize activation and interruption for the same world or synthetic actor.
 * A failed write rejects its caller, but cannot poison subsequent cleanup. */
export async function withLesserInvisibilityLock(uuid, work) {
  const previous = queues.get(uuid) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  queues.set(uuid, next);
  try { return await next; }
  finally { if (queues.get(uuid) === next) queues.delete(uuid); }
}

/** Delete this ability's carriers only. Never toggle core invisibility: that
 * would also remove a different spell or a GM's manually applied effect. */
export async function endLesserInvisibility(actor, { event = null, damage = 0 } = {}) {
  if (!actor?.uuid || actor.isOwner !== true || !lesserInvisibilityEnds({ event, damage })) return false;
  return withLesserInvisibilityLock(actor.uuid, async () => {
    if (actor.isOwner !== true) return false;
    const ids = values(actor.effects)
      .filter(effect => isLesserInvisibilityEffect(effect, actor.uuid))
      .map(effect => effect.id).filter(id => typeof id === "string" && id.length > 0);
    if (!ids.length) return false;
    await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    return true;
  });
}
