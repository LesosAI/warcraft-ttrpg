import { hungerMasteredPools } from '../rules/hunger-mastered.mjs';
import { talentEffect } from '../rules/talent-effects.mjs';
import { refuseAncientDespair } from './ancient-despair-refusal.mjs';
import { AZEROTH } from '../config.mjs';
export const HUNGER_MASTERED_QUERY = 'azeroth-rpg.hungerMastered';
const scope = 'azeroth-rpg', flag = 'hungerMasteredUse', busy = new Set();
const words = key => game.i18n.localize(`AZEROTH.HungerMastered.${key}`);

/** Inspect an interrupted use without deciding whether its effects landed. */
export function hungerMasteredRecoveryView(actor) {
  if (!game.user?.isGM || game.users.activeGM !== game.user || !actor?.uuid
    || fromUuidSync(actor.uuid) !== actor) return null;
  const receipt = actor.getFlag(scope, flag);
  if (!receipt?.requestId || receipt.stage !== 'restored') return null;
  const feature = actor.items.get(receipt.itemId);
  const talent = actor.items.get(feature?.getFlag(scope, 'feature')?.talentId);
  return structuredClone({ actorUuid: actor.uuid, receipt, pools: actor.poolSnapshot(),
    featureUses: feature?.system?.uses ?? null, talentUses: talent?.system?.uses ?? null,
    health: actor.system?.health ?? null });
}

/** Explicit GM attestation closes only the receipt; never replay or refund.
 * Shared with the live-use lock so recovery cannot overlap a local writer. */
export async function reviewHungerMastered({ actorUuid, expected, acknowledged } = {}) {
  const actor = fromUuidSync(actorUuid), view = actor && hungerMasteredRecoveryView(actor);
  if (acknowledged !== true || !view || JSON.stringify(view) !== JSON.stringify(expected)
    || busy.has(actorUuid)) return { ok: false };
  const writerId = game.user.id;
  const priorWriter = game.users.get(view.receipt.writerId);
  if (priorWriter?.active && priorWriter.id !== writerId) return { ok: false, reason: 'writerActive' };
  busy.add(actorUuid);
  try {
    const receipt = { ...view.receipt, stage: 'complete', reviewed: true, reviewedBy: writerId };
    await actor.setFlag(scope, flag, receipt);
    return game.users.activeGM === game.user && game.user.id === writerId
      && fromUuidSync(actorUuid) === actor && JSON.stringify(actor.getFlag(scope, flag)) === JSON.stringify(receipt)
      ? { ok: true } : { ok: false, pending: true };
  } catch { return { ok: false, pending: true }; }
  finally { busy.delete(actorUuid); }
}

export async function hungerMasteredHandler({ actorUuid, itemId, requestId } = {}, { user } = {}) {
  const writer = () => game.user?.isGM && game.users.activeGM === game.user;
  if (!writer() || !user?.active || game.users.get(user.id) !== user
    || typeof requestId !== 'string' || !requestId || requestId.length > 64) return { ok: false };
  const actor = fromUuidSync(actorUuid), item = actor?.items?.get(itemId);
  if (actor?.type !== 'character' || !actor.testUserPermission(user, 'OWNER') || item?.type !== 'feature'
    || !(actor.system?.health?.value > 0) || refuseAncientDespair(actor, 'feature')) return { ok: false };
  const talent = actor.items.get(item.getFlag(scope, 'feature')?.talentId);
  if (!(talent?.system?.taken > 0) || !talentEffect(talent.system.className, talent.system.identifier, talent.system.race)?.onUse?.restoreAllPower
    || item.system.uses?.per !== 'arc' || item.system.uses.max !== 1) return { ok: false };
  const prior = actor.getFlag(scope, flag);
  if (prior?.requestId === requestId) return prior.stage === 'complete'
    ? { ok: true, messageId: prior.messageId } : { ok: false, pending: true };
  if (prior && prior.stage !== 'complete') return { ok: false, pending: true };
  if (busy.has(actor.uuid) || item.system.uses.value !== 1 || talent.system.uses?.value !== 1) return { ok: false };
  const pools = hungerMasteredPools(actor.poolSnapshot());
  if (!pools.length) return { ok: false };
  busy.add(actor.uuid);
  const gmId = game.user.id;
  const receipt = { requestId, userId: user.id, itemId, stage: 'restored', writerId: gmId, pools };
  const expectedReceipt = JSON.stringify(receipt);
  const held = () => writer() && game.user.id === gmId && fromUuidSync(actorUuid) === actor
    && JSON.stringify(actor.getFlag(scope, flag)) === expectedReceipt;
  try {
    // Native Actor.update merges embedded item updates by _id. Restore all
    // pools and consume both views of the arc counter in ONE actor write.
    await actor.updatePool(pools, { items: [{ _id: item.id, 'system.uses.value': 0 },
      { _id: talent.id, 'system.uses.value': 0 }], [`flags.${scope}.${flag}`]: receipt });
    if (!held()
      || actor.items.get(item.id)?.system.uses.value !== 0 || actor.items.get(talent.id)?.system.uses.value !== 0
      || !pools.every(pool => actor.poolSnapshot().some(current => current.itemId === pool.itemId && current.kind === 'power' && current.value === pool.value)))
      return { ok: false, pending: true };
    const content = await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/chat/feature-card.hbs', {
      config: AZEROTH, title: item.name, subtitle: actor.name, speakerName: actor.name,
      uses: { value: 0, max: 1 }, rolled: false, targets: [], provenance: [], note: words('Restored')
    });
    if (!held()) return { ok: false, pending: true };
    const card = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content,
      flags: { [scope]: { kind: 'feature', itemId, hungerMastered: { requestId, pools } } } });
    if (!held()) return { ok: false, pending: true };
    const complete = { ...JSON.parse(expectedReceipt), stage: 'complete', messageId: card.id };
    const expectedComplete = JSON.stringify(complete);
    await actor.setFlag(scope, flag, complete);
    return writer() && game.user.id === gmId && fromUuidSync(actorUuid) === actor
      && JSON.stringify(actor.getFlag(scope, flag)) === expectedComplete
      ? { ok: true, messageId: card.id } : { ok: false, pending: true };
  } catch { return { ok: false, pending: true }; }
  finally { busy.delete(actor.uuid); }
}

export async function useHungerMastered(actor, item) {
  const gm = game.users.activeGM;
  if (!actor.isOwner || !gm) { ui.notifications?.warn(words('Refused')); return null; }
  const data = { actorUuid: actor.uuid, itemId: item.id, requestId: foundry.utils.randomID() };
  let result;
  try { result = gm === game.user ? await hungerMasteredHandler(data, { user: game.user })
    : await gm.query(HUNGER_MASTERED_QUERY, data, { timeout: 15000 }); }
  catch { result = { ok: false, pending: true }; }
  if (!result?.ok) { ui.notifications?.warn(words(result?.pending ? 'Pending' : 'Refused')); return null; }
  return game.messages.get(result.messageId) ?? null;
}
