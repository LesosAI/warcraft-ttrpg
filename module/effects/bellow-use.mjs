const scope = 'azeroth-rpg';
export const BELLOW_USE_QUERY = 'azeroth-rpg.bellowUse';
const busy = new Set(), capabilities = new WeakMap();
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
export function bellowCommitValid(actor, item, commit) {
  const entry = commit && capabilities.get(commit);
  return Boolean(entry && entry.actor === actor && entry.item === item && entry.valid());
}
/** Called after ordinary action-budget payment, before recipient effects. */
export async function payBellowUse(actor, item, commit, journal) {
  if (!bellowCommitValid(actor, item, commit) || item.system.uses?.per !== 'encounter'
    || !Number.isInteger(item.system.uses.value) || item.system.uses.value <= 0) return null;
  const left = item.system.uses.value - 1;
  await item.update({ 'system.uses.value': left });
  if (!bellowCommitValid(actor, item, commit) || item.system.uses.value !== left) return null;
  await journal.delivering();
  if (!bellowCommitValid(actor, item, commit)) return null;
  return { value: left, max: item.system.uses.max };
}
export async function bellowUseHandler({ actorUuid, itemUuid, targets } = {}, { user } = {}) {
  const actor = resolve(actorUuid), item = resolve(itemUuid);
  const talent = actor?.items?.get(item?.getFlag?.(scope, 'feature')?.talentId);
  const valid = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id
    && user?.active && game.users.get(user.id) === user && resolve(actorUuid) === actor
    && actor?.testUserPermission(user, 'OWNER') && resolve(itemUuid) === item
    && actor.items.get(item?.id) === item && item?.type === 'feature'
    && actor.items.get(talent?.id) === talent && talent?.system?.identifier === 'bellow'
    && String(talent.system.race).toLowerCase() === 'ogre' && talent.system.taken > 0;
  if (!valid() || !Array.isArray(targets) || !targets.length) return { ok: false };
  if (busy.has(actorUuid)) return { ok: false };
  busy.add(actorUuid);
  const commit = {};
  capabilities.set(commit, { actor, item, valid });
  try {
    const pending = Object.values(actor.getFlag(scope, 'bellowDeliveries') ?? {})
      .some(row => ['committing', 'delivering', 'unconfirmed'].includes(row?.state));
    if (pending || item.system.uses?.per !== 'encounter' || !(item.system.uses.value > 0)) return { ok: false };
    const { useFeature } = await import('../dice/workflows.mjs');
    if (!valid()) return { ok: false };
    const card = await useFeature({ actor, item, targets: structuredClone(targets), bellowCommit: commit });
    return { ok: Boolean(card && valid()), messageUuid: card?.uuid ?? null };
  } catch { return { ok: false }; }
  finally { capabilities.delete(commit); busy.delete(actorUuid); }
}
export async function requestBellowUse(actor, item, targets) {
  const payload = { actorUuid: actor.uuid, itemUuid: item.uuid, targets };
  let result;
  try {
    const gm = game.users?.activeGM;
    result = gm?.id === game.user.id ? await bellowUseHandler(payload, { user: game.user })
      : await gm?.query(BELLOW_USE_QUERY, payload, { timeout: 60000 });
  } catch { result = null; }
  if (!result?.ok) ui.notifications?.warn(game.i18n.localize('AZEROTH.Bellow.Unresolved'));
  return result?.ok ? resolve(result.messageUuid) : null;
}
