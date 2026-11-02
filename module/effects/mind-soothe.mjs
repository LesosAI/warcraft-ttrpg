/** Mind Soothe is a timed truce, not Charmed. Keep its caster identity so
 * Dominate can require the caster's own active spell. */
import { resistRecordOn } from '../rules/resisted.mjs';
const scope = 'azeroth-rpg', queues = new Map();
const receiptsFlag = 'mindSootheDeliveries';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const MIND_SOOTHE_QUERY = 'azeroth-rpg.mindSoothe';

/** A surviving identified carrier proves this cast was already delivered.
 * Preserve that evidence before later expiry, deletion or damage can erase it. */
export async function recordLegacyMindSoothe(actor, effects = actor?.effects ?? [], { witnessUserId = null } = {}) {
  const valid = () => {
    const gm = game.users?.activeGM;
    const writer = gm ? game.user?.isGM === true && gm.id === game.user.id
      : Boolean(game.user?.id && witnessUserId === game.user.id);
    return writer && actor?.isOwner && fromUuidSync(actor.uuid) === actor;
  };
  if (!valid()) return 0;
  const evidence = [...effects].filter(effect => effect.flags?.[scope]?.identifier === 'mind-soothe')
    .map(effect => ({ cast: effect.flags[scope].cast, caster: effect.origin,
      messageId: effect.flags[scope].messageId ?? null, effectId: effect.id }));
  const task = (queues.get(actor.uuid) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (!valid()) return 0;
    const receipts = actor.getFlag(scope, receiptsFlag) ?? [];
    if (!Array.isArray(receipts)) throw new Error('Invalid Mind Soothe delivery receipts');
    const recorded = [...receipts];
    for (const row of evidence) {
      if (typeof row.cast !== 'string' || !row.cast || typeof row.caster !== 'string' || !row.caster
        || recorded.some(receipt => receipt?.cast === row.cast && receipt?.caster === row.caster)) continue;
      recorded.push({ ...row, state: 'complete', legacyCarrier: true, writerId: game.user.id });
    }
    if (recorded.length === receipts.length) return 0;
    await actor.setFlag(scope, receiptsFlag, recorded);
    return valid() && same(actor.getFlag(scope, receiptsFlag), recorded) ? recorded.length - receipts.length : 0;
  });
  queues.set(actor.uuid, task);
  try { return await task; } finally { if (queues.get(actor.uuid) === task) queues.delete(actor.uuid); }
}

export function registerMindSootheReceipts() {
  const sweep = async () => {
    if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return;
    const actors = new Map([...(game.actors?.values() ?? [])].map(actor => [actor.uuid, actor]));
    for (const scene of game.scenes?.values() ?? []) for (const token of scene.tokens?.values() ?? [])
      if (token.actor) actors.set(token.actor.uuid, token.actor);
    for (const actor of actors.values()) await recordLegacyMindSoothe(actor);
  };
  const failed = error => {
    console.warn('azeroth-rpg | Mind Soothe legacy receipts', error);
    ui.notifications?.warn(game.i18n.localize('AZEROTH.Compel.MindSoothePending'));
  };
  const run = () => sweep().catch(failed);
  const actorCreated = actor => recordLegacyMindSoothe(actor).catch(failed);
  const effectChanged = (effect, _options, userId) => {
    if (effect?.parent?.documentName !== 'Actor' || effect.flags?.[scope]?.identifier !== 'mind-soothe') return;
    // The deletion hook still supplies the removed document. Capture its
    // identity now, even though the actor's collection no longer contains it.
    // Without a GM, only the owning client that performed this document
    // operation records its evidence. Other observing owners remain read-only.
    return recordLegacyMindSoothe(effect.parent, [effect], { witnessUserId: userId }).catch(failed);
  };
  Hooks.once('ready', run);
  Hooks.on('updateUser', run);
  Hooks.on('createActor', actorCreated);
  Hooks.on('createToken', token => actorCreated(token.actor));
  Hooks.on('createActiveEffect', effectChanged);
  Hooks.on('deleteActiveEffect', effectChanged);
}

export function mindSootheRecoveryViews(actor) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id || !actor?.uuid
    || fromUuidSync(actor.uuid) !== actor) return [];
  const receipts = actor.getFlag(scope, receiptsFlag);
  if (!Array.isArray(receipts)) return [];
  const effects = [...(actor.effects ?? [])].filter(effect => effect.flags?.[scope]?.identifier === 'mind-soothe')
    .map(effect => ({ id: effect.id, origin: effect.origin, flags: effect.flags[scope], disabled: effect.disabled === true }));
  return receipts.filter(row => row?.state === 'pending' && row.cast && row.caster).map(receipt => structuredClone({
    actorUuid: actor.uuid, cast: receipt.cast, caster: receipt.caster, receipts, effects, health: actor.system?.health ?? null
  }));
}

export async function reviewMindSoothe({ actorUuid, expected, acknowledged } = {}) {
  const actor = fromUuidSync(actorUuid);
  const view = mindSootheRecoveryViews(actor).find(row => row.cast === expected?.cast && row.caster === expected?.caster);
  if (acknowledged !== true || !view || !same(view, expected) || queues.has(actorUuid)) return { ok: false };
  const receipt = view.receipts.find(row => row.cast === view.cast && row.caster === view.caster), gmId = game.user.id;
  if (receipt.writerId && receipt.writerId !== gmId && game.users.get(receipt.writerId)?.active) return { ok: false };
  const updated = view.receipts.map(row => row === receipt ? { ...row, state: 'complete', reviewed: true, reviewedBy: gmId } : row);
  const task = Promise.resolve().then(async () => {
    try {
      if (!mindSootheRecoveryViews(actor).some(current => same(current, view))) return { ok: false };
      await actor.setFlag(scope, receiptsFlag, updated);
      return game.user.id === gmId && game.users.activeGM?.id === gmId && fromUuidSync(actorUuid) === actor
        && same(actor.getFlag(scope, receiptsFlag), updated) ? { ok: true } : { ok: false, pending: true };
    } catch { return { ok: false, pending: true }; }
  });
  queues.set(actorUuid, task);
  try { return await task; } finally { if (queues.get(actorUuid) === task) queues.delete(actorUuid); }
}

function recordedTarget(row) {
  if (row?.sceneId || row?.tokenId) {
    if (!row.sceneId || !row.tokenId) return null;
    const actor = game.scenes?.get(row.sceneId)?.tokens?.get(row.tokenId)?.actor;
    return actor?.id === row.actorId ? actor : null;
  }
  return game.actors?.get(row?.actorId) ?? null;
}

export async function mindSootheHandler({ actorUuid, messageId, resultId } = {}, { user } = {}) {
  if (![actorUuid, messageId, resultId].every(value => typeof value === 'string' && value)) return { ok: false };
  const actor = fromUuidSync(actorUuid), message = game.messages?.get(messageId), result = game.messages?.get(resultId);
  const casterUuid = message?.flags?.[scope]?.caster;
  const caster = typeof casterUuid === 'string' ? fromUuidSync(casterUuid) : null;
  const valid = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && user?.active && game.users.get(user.id) === user && fromUuidSync(actorUuid) === actor
    && actor?.testUserPermission(user, 'OWNER') && game.messages.get(messageId) === message
    && game.messages.get(resultId) === result && result?.author?.id === user.id
    && message?.author && caster?.testUserPermission(message.author, 'OWNER')
    && fromUuidSync(casterUuid) === caster && result?.speaker?.actor === actor.id
    && (message?.flags?.[scope]?.targets ?? []).some(row => recordedTarget(row) === actor)
    && recordedTarget(result?.flags?.[scope]?.resistOf) === actor;
  if (!valid()) return { ok: false };
  const { spellTiming } = await import('./durations.mjs');
  const effect = await layMindSoothe(actor, message, spellTiming(actor, message.flags[scope].duration) ?? {}, result, valid);
  return { ok: Boolean(effect && valid()), effectId: effect?.id ?? null };
}

export async function requestMindSoothe(actor, message, result) {
  const data = { actorUuid: actor.uuid, messageId: message.id, resultId: result?.id };
  let reply;
  try {
    const gm = game.users?.activeGM;
    reply = gm?.id === game.user.id ? await mindSootheHandler(data, { user: game.user })
      : await gm?.query(MIND_SOOTHE_QUERY, data, { timeout: 15000 });
  } catch { reply = null; }
  if (!reply?.ok) ui.notifications?.warn(game.i18n.localize('AZEROTH.Compel.MindSoothePending'));
  return reply ?? { ok: false };
}

export function mindSootheSnapshot(actor) {
  return [...(actor?.effects ?? [])].filter(effect => !effect.disabled && effect.active !== false
    && effect.flags?.[scope]?.identifier === 'mind-soothe')
    .map(effect => ({ id: effect.id, cast: effect.flags[scope].cast, origin: effect.origin }));
}

export async function endMindSootheOnDamage(actor, snapshot, amount) {
  if (!actor?.isOwner || !Number.isFinite(amount) || amount <= 0 || !snapshot?.length) return 0;
  return endCapturedMindSoothe(actor, snapshot, 'damage');
}

export async function endMindSootheForHarm(actor, snapshot) {
  const valid = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && fromUuidSync(actor?.uuid) === actor;
  if (!actor?.isOwner || !snapshot?.length || !valid()) return 0;
  return endCapturedMindSoothe(actor, snapshot, 'harm', valid);
}

async function endCapturedMindSoothe(actor, snapshot, reason, valid = () => true) {
  const task = (queues.get(actor.uuid) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (!actor.isOwner || !valid()) return 0;
    const captured = () => mindSootheSnapshot(actor).filter(effect => snapshot.some(row => row.id === effect.id
      && row.cast === effect.cast && row.origin === effect.origin));
    const receipts = actor.getFlag(scope, receiptsFlag) ?? [];
    if (!Array.isArray(receipts)) throw new Error('Invalid Mind Soothe delivery receipts');
    const recorded = [...receipts];
    for (const effect of captured()) {
      if (typeof effect.cast !== 'string' || !effect.cast || typeof effect.origin !== 'string' || !effect.origin
        || recorded.some(row => row?.cast === effect.cast && row?.caster === effect.origin)) continue;
      // Preserve legacy application evidence before removing its last carrier.
      recorded.push({ cast: effect.cast, caster: effect.origin, effectId: effect.id,
        state: 'complete', ...(reason === 'damage' ? { endedByDamage: true } : { endedByHarm: true }), writerId: globalThis.game?.user?.id ?? null });
    }
    if (recorded.length !== receipts.length) {
      await actor.setFlag(scope, receiptsFlag, recorded);
      if (!actor.isOwner || !valid() || !same(actor.getFlag(scope, receiptsFlag), recorded)) return 0;
    }
    const ids = captured().map(effect => effect.id);
    if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
    return ids.length;
  });
  queues.set(actor.uuid, task);
  try { return await task; } finally { if (queues.get(actor.uuid) === task) queues.delete(actor.uuid); }
}

export async function layMindSoothe(actor, message, timing = {}, result = null, valid = () => true) {
  const run = async () => {
    const cast = message?.flags?.[scope], save = result?.flags?.[scope];
    const signature = flags => JSON.stringify(['kind', 'identifier', 'success', 'cast', 'caster', 'spellDC'].map(key => flags?.[key]));
    const original = signature(cast);
    const eligible = () => {
      const currentSave = result?.flags?.[scope], roll = result?.rolls?.[0];
      return valid() && actor?.isOwner && signature(message?.flags?.[scope]) === original
        && cast?.kind === 'spell' && cast.identifier === 'mind-soothe' && cast.success === true
        && Boolean(cast.cast && cast.caster) && currentSave?.kind === 'resilience' && currentSave.resilience === 'spirit'
        && currentSave.resistOf?.messageId === message.id && currentSave.resistOf.actorId === actor.id
        && roll?.outcome?.success === false
        && (!Number.isSafeInteger(cast.spellDC) || cast.spellDC <= 0 || roll.options?.dc === cast.spellDC);
    };
    if (!eligible()) return null;
    const existing = [...actor.effects].find(effect => effect.origin === cast.caster
      && effect.flags?.[scope]?.identifier === 'mind-soothe' && effect.flags[scope].cast === cast.cast);
    if (existing) return existing;
    const receipts = actor.getFlag(scope, receiptsFlag) ?? [];
    if (!Array.isArray(receipts) || receipts.some(row => row?.cast === cast.cast && row?.caster === cast.caster)) return null;
    // Claim before creation. Removal, expiration, or a lost creation reply must
    // not turn the same old cast into a fresh application.
    const receipt = { cast: cast.cast, caster: cast.caster, messageId: message.id, state: 'pending', writerId: globalThis.game?.user?.id ?? null };
    const legacyResistance = resistRecordOn(cast.resists, save.resistOf);
    if (legacyResistance) receipt.legacyResistance = structuredClone(legacyResistance);
    const claimed = [...receipts, receipt];
    await actor.setFlag(scope, receiptsFlag, claimed);
    if (!eligible() || JSON.stringify(actor.getFlag(scope, receiptsFlag)) !== JSON.stringify(claimed)) return null;
    // A historical Test proves a prior attempt, not whether its effect expired,
    // was dispelled or failed to land. Preserve it for review without replay.
    if (legacyResistance) return null;
    const [effect] = await actor.createEmbeddedDocuments('ActiveEffect', [{
      ...timing, name: cast.spellName ?? 'Mind Soothe', img: cast.spellImg ?? 'icons/svg/aura.svg',
      origin: cast.caster, description: cast.effectHTML ?? '', statuses: [], system: { changes: [] },
      flags: { [scope]: { identifier: 'mind-soothe', cast: cast.cast, spell: cast.spellUuid ?? null,
        spellName: cast.spellName ?? 'Mind Soothe', messageId: message.id } }
    }]);
    if (effect) {
      const current = actor.getFlag(scope, receiptsFlag);
      if (!valid() || !actor.isOwner || JSON.stringify(current) !== JSON.stringify(claimed)) return null;
      await actor.setFlag(scope, receiptsFlag, [...receipts, { ...receipt, state: 'complete', effectId: effect.id }]);
    }
    return effect ?? null;
  };
  const task = (queues.get(actor?.uuid) ?? Promise.resolve()).then(run, run);
  queues.set(actor?.uuid, task);
  try { return await task; } finally { if (queues.get(actor?.uuid) === task) queues.delete(actor?.uuid); }
}
