import { mindControlOn, mindControlEnds } from '../rules/mind-control.mjs';
const pending = new Map();

export function mindControlHarmSnapshot(actor) {
  return [...(actor?.effects ?? [])].flatMap(effect => {
    const record = mindControlOn(effect, actor.uuid);
    return record ? [{ id: effect.id, record }] : [];
  });
}

/** Only controls present before the confirmed damage may end. The cast's
 * separate replay receipt is never erased by ending its carrier. */
export async function endMindControlOnDamage(actor, snapshot, amount) {
  if (!actor?.isOwner || !snapshot?.length || !mindControlEnds({ damage: amount })) return 0;
  const run = (pending.get(actor.uuid) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (!actor.isOwner) return 0;
    const ids = mindControlHarmSnapshot(actor).filter(current => snapshot.some(before => before.id === current.id
      && JSON.stringify(before.record) === JSON.stringify(current.record))).map(row => row.id);
    if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
    return ids.length;
  });
  pending.set(actor.uuid, run);
  try { return await run; } finally { if (pending.get(actor.uuid) === run) pending.delete(actor.uuid); }
}
