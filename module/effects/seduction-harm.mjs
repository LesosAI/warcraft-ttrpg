import { activeSeductions, seductionEndsOnHarm } from "../rules/seduction.mjs";
import { countsAsAlly } from "../rules/distance.mjs";
import { allyStandingOf, combatantIn } from "../canvas/engaged.mjs";

const pending = new Map();

/** Capture only charms present when this harm is resolved, using the same
 * combat-side/party definition of ally as the aura system. */
export function seductionHarmSnapshot(actor, by) {
  if (!actor?.uuid || !by?.uuid) return [];
  return activeSeductions(actor.effects, actor.uuid).filter(effect => {
    const record = effect.flags["azeroth-rpg"].seduction;
    if (by.uuid === record.sourceUuid) return true;
    const token = fromUuidSync(record.sourceTokenUuid);
    const source = token?.actor;
    if (source?.uuid !== record.sourceUuid) return false;
    const fight = source.activeFight?.() ?? null;
    const attackerToken = by.token ?? null;
    const standing = (who, body) => allyStandingOf({ actor: who, token: body,
      combatant: combatantIn(fight, who, body), fight });
    return seductionEndsOnHarm({ harmed: true, attackerUuid: by.uuid, sourceUuid: source.uuid,
      attackerIsCharmerAlly: countsAsAlly(standing(source, token), standing(by, attackerToken)) });
  }).map(effect => ({ id: effect.id, messageUuid: effect.flags["azeroth-rpg"].seduction.messageUuid }));
}

/** The damage writer owns the target. Remove only captured carriers after
 * confirmed Health or temporary Health loss; never toggle global Charmed. */
export async function endSeductionOnDamage(actor, snapshot, amount) {
  if (!actor?.isOwner || !Number.isFinite(amount) || amount <= 0 || !snapshot?.length) return 0;
  const previous = pending.get(actor.uuid) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    if (!actor.isOwner) return 0;
    const ids = activeSeductions(actor.effects, actor.uuid).filter(effect => snapshot.some(row => row.id === effect.id
      && row.messageUuid === effect.flags["azeroth-rpg"].seduction.messageUuid)).map(effect => effect.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    return ids.length;
  });
  pending.set(actor.uuid, task);
  try { return await task; }
  finally { if (pending.get(actor.uuid) === task) pending.delete(actor.uuid); }
}
