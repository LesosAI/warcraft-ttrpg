import { sustainTransferPending } from '../rules/sustain-transfer-suspension.mjs';
const scope = 'azeroth-rpg', flag = 'deletedDomination', queues = new Map();
const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const gmWriter = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function originalTargetMatches(actor, caster, row) {
  const message = game.messages?.get(row.messageId), flags = message?.flags?.[scope];
  if (!message?.author || caster.testUserPermission?.(message.author, 'OWNER') !== true) return false;
  if (flags?.kind !== 'spell' || flags.success !== true || flags.caster !== row.casterUuid
    || flags.cast !== row.cast || flags.identifier !== row.identifier) return false;
  return flags.targets?.some(target => {
    const resolved = target.tokenId ? game.scenes?.get?.(target.sceneId)?.tokens?.get(target.tokenId)?.actor
      : values(game.actors).find(candidate => candidate.id === target.actorId);
    return resolved === actor;
  }) === true;
}
async function queued(actor, run) {
  const task = (queues.get(actor.uuid) ?? Promise.resolve()).catch(() => {}).then(run);
  queues.set(actor.uuid, task);
  try { return await task; } finally { if (queues.get(actor.uuid) === task) queues.delete(actor.uuid); }
}

export function dominationDeletionViews(actor) {
  if (!gmWriter() || !actor || fromUuidSync(actor.uuid) !== actor) return [];
  const receipts = actor.getFlag?.(scope, flag) ?? [];
  if (!Array.isArray(receipts)) return [];
  return receipts.filter(row => row?.state === 'pending').map(row => {
    const caster = fromUuidSync(row.casterUuid), message = game.messages?.get(row.messageId);
    return structuredClone({ actorUuid: actor.uuid, casterUuid: row.casterUuid, cast: row.cast, receipts,
      effects: values(actor.effects).map(effect => effect.toObject?.() ?? {
        id: effect.id, origin: effect.origin, flags: effect.flags, disabled: effect.disabled, statuses: [...(effect.statuses ?? [])] }),
      sustaining: caster?.getFlag(scope, 'sustaining') ?? null,
      originalCard: message ? { authorId: message.author?.id ?? null, flags: message.flags?.[scope] ?? null } : null });
  });
}

/** Acknowledgement closes only the evidence record after manual reconciliation. */
export async function reviewDominationDeletion({ actorUuid, expected, acknowledged } = {}) {
  const actor = fromUuidSync(actorUuid);
  if (!gmWriter() || acknowledged !== true || !actor) return { ok: false, reason: 'authority' };
  if (queues.has(actorUuid)) return { ok: false, reason: 'busy' };
  return queued(actor, async () => {
    const current = dominationDeletionViews(actor).find(row => row.cast === expected?.cast && row.casterUuid === expected?.casterUuid);
    if (!current || !same(current, expected)) return { ok: false, reason: 'changed' };
    const receipt = current.receipts.find(row => row.cast === current.cast && row.casterUuid === current.casterUuid);
    if (receipt.writerId !== game.user.id && game.users.get?.(receipt.writerId)?.active) return { ok: false, reason: 'writerActive' };
    receipt.state = 'complete'; receipt.reviewedBy = game.user.id; receipt.reviewed = true;
    await actor.setFlag(scope, flag, current.receipts);
    return { ok: true };
  });
}

/** Only the deleting owner witnesses a no-GM deletion. Never infer domination
 * from ordinary Charmed, nor treat a suspended transfer carrier as ended. */
export async function rememberDeletedDomination(effect, userId) {
  const actor = effect?.parent, f = effect?.flags?.[scope];
  const valid = () => !game.users?.activeGM && game.user?.id === userId && actor?.isOwner
    && fromUuidSync(actor.uuid) === actor;
  if (!valid() || f?.sustained !== true || !f.cast || !effect.origin || !effect.statuses?.has('charmed')
    || !['compel', 'dominate', 'enslave-demon'].includes(f.identifier) || sustainTransferPending(effect)) return false;
  const caster = fromUuidSync(effect.origin);
  const entry = (caster?.getFlag(scope, 'sustaining') ?? []).find(row => row.cast === f.cast);
  if (!entry) return false;
  const evidence = { casterUuid: caster.uuid, cast: f.cast, identifier: f.identifier,
    effectId: effect.id, messageId: f.messageId ?? null, entry: structuredClone(entry), state: 'pending', writerId: userId };
  return queued(actor, async () => {
    if (!valid()) return false;
    const held = actor.getFlag(scope, flag) ?? [];
    if (!Array.isArray(held)) throw Error('Invalid domination deletion receipts');
    if (held.some(row => row.casterUuid === evidence.casterUuid && row.cast === evidence.cast)) return false;
    await actor.setFlag(scope, flag, [...held, evidence]);
    return true;
  });
}

export async function reconcileDeletedDomination() {
  if (!gmWriter()) return 0;
  const actors = new Map(values(game.actors).map(actor => [actor.uuid, actor]));
  for (const scene of values(game.scenes)) for (const token of values(scene.tokens))
    if (token.actor) actors.set(token.actor.uuid, token.actor);
  let completed = 0;
  for (const actor of actors.values()) await queued(actor, async () => {
    const held = structuredClone(actor.getFlag?.(scope, flag) ?? []);
    if (!Array.isArray(held)) return;
    for (const row of held.filter(row => row.state === 'pending')) {
      if (!gmWriter() || fromUuidSync(actor.uuid) !== actor) return;
      const caster = fromUuidSync(row.casterUuid);
      if (!caster) continue;
      const entry = (caster.getFlag(scope, 'sustaining') ?? []).find(entry => entry.cast === row.cast);
      // Owner-written flags cannot authorize ending an unrelated caster's spell.
      // Missing original cards/targets remain pending rather than being guessed.
      if (entry && !originalTargetMatches(actor, caster, row)) continue;
      // A restored carrier or changed/transfer entry requires manual review.
      if (entry && (!same(entry, row.entry) || [...actors.values()].some(other => values(other.effects)
        .some(effect => effect.origin === row.casterUuid && effect.flags?.[scope]?.cast === row.cast)))) continue;
      if (entry) {
        const { endSustain } = await import('../dice/workflows.mjs');
        if (!gmWriter() || !same(actor.getFlag(scope, flag) ?? [], held)
          || !same((caster.getFlag(scope, 'sustaining') ?? []).find(entry => entry.cast === row.cast), row.entry)) return;
        await endSustain({ actor: caster, cast: row.cast });
        if ((caster.getFlag(scope, 'sustaining') ?? []).some(entry => entry.cast === row.cast)) throw Error('Domination cleanup incomplete');
      }
      if (!gmWriter() || !same(actor.getFlag(scope, flag) ?? [], held)) return;
      row.state = 'complete';
      await actor.setFlag(scope, flag, structuredClone(held));
      completed++;
    }
  });
  return completed;
}

export function registerDominationDeletion() {
  const failed = error => {
    console.warn('azeroth-rpg | Deferred domination cleanup', error);
    ui.notifications?.warn(game.i18n.localize('AZEROTH.Card.SustainCleanupFailed'));
  };
  const sweep = () => reconcileDeletedDomination().catch(failed);
  Hooks.on('deleteActiveEffect', (effect, _options, userId) => rememberDeletedDomination(effect, userId).catch(failed));
  Hooks.on('updateUser', sweep);
  Hooks.on('updateActor', (_actor, changes) => {
    if (Object.hasOwn(changes, `flags.${scope}.${flag}`) || changes.flags?.[scope]?.[flag] !== undefined) return sweep();
  });
  Hooks.once('ready', sweep);
}
