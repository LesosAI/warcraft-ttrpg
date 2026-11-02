import { feetApart } from '../canvas/footprints.mjs';
import { bellowTargetRefusal } from '../rules/bellow-targets.mjs';

/** Validate recorded token identities on the writer's client, even off canvas. */
export function bellowDeliveryRefusal(victim, originUuid, delivery) {
  if (!delivery) return null;
  const origin = fromUuidSync(originUuid);
  if (!origin || fromUuidSync(victim.uuid) !== victim) return 'changed';
  const resolve = ref => ref?.tokenId ? game.scenes?.get(ref.sceneId)?.tokens?.get(ref.tokenId) : null;
  const from = resolve(delivery.from), to = resolve(delivery.to);
  if ((delivery.from && (!from || from.actor !== origin))
    || (delivery.to && (!to || to.actor !== victim))) return 'changed';
  let distance = null;
  try { distance = from && to ? feetApart(from, to) : null; } catch { return 'range'; }
  if (from && to && from.parent?.id === to.parent?.id && distance === null) return 'range';
  return bellowTargetRefusal({ sameActor: true, deafened: victim.statuses?.has('deafened') === true,
    distance, feet: 20 });
}
