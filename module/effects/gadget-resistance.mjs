/** Serialize gadget delivery through the active GM. An uncertain delivery stays
 * pending: neither an ordinary replay nor a reroll may silently deliver it again. */
import { verifiedResist, resisterOf } from '../dice/annotate.mjs';
import { resistKey } from '../rules/records.mjs';

export const GADGET_RESISTANCE_QUERY = 'azeroth-rpg.gadgetResistance';
const scope = 'azeroth-rpg', queues = new Map();
export const gadgetResistancePresses = new Set();
export function gadgetReviewState(message, key) {
  const flags = message?.flags?.[scope];
  const claim = flags?.gadgetResistClaims?.[key];
  if (!isResistedGadget(flags) || claim?.state !== 'pending') return null;
  const target = flags.targets?.find(row => resistKey(row) === key);
  const actor = target && resisterOf(target)?.actor;
  const result = game.messages.get(claim.resultId)?.rolls?.[0];
  return structuredClone({ claim, record: flags.resists?.[key] ?? null,
    result: result ? { total: result.total, dc: result.options?.dc, success: result.outcome?.success } : null,
    target: target ?? null, effects: actor ? [...actor.effects].map(e => e.toObject()) : null });
}
export const isResistedGadget = flags => flags?.kind === 'feature'
  && ['discombobulator-ray', 'gnomish-universal-remote', 'gnomish-mind-control-cap']
    .some(key => flags.featureKey === key || flags.featureKey === `gadget:${key}`);

export async function gadgetResistanceRequest(payload) {
  const gm = game.users?.activeGM;
  if (!gm) return { ok: false };
  return gm.id === game.user.id
    ? gadgetResistanceHandler(payload, { user: game.user })
    : gm.query(GADGET_RESISTANCE_QUERY, payload);
}

export async function gadgetResistanceHandler(payload = {}, { user } = {}) {
  const { messageId, resultId, action = 'claim', override = false, expected = null } = payload;
  if (typeof messageId !== 'string' || typeof resultId !== 'string'
    || !['claim', 'complete', 'review'].includes(action)) return { ok: false };
  const run = async () => {
    const message = game.messages.get(messageId);
    const valid = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
      && user?.active && game.users.get(user.id) === user
      && game.messages.get(messageId) === message && isResistedGadget(message?.flags?.[scope]);
    if (!valid()) return { ok: false };
    if (action === 'review') {
      const { key, acknowledged, snapshot } = payload;
      const state = gadgetReviewState(message, key);
      if (!user.isGM || acknowledged !== true || !state || state.claim.resultId !== resultId
        || gadgetResistancePresses.has(messageId)
        || [state.claim.userId, state.claim.writerId].some(id => id !== game.user.id && game.users.get(id)?.active)
        || JSON.stringify(state) !== JSON.stringify(snapshot)) return { ok: false };
      await message.update({ [`flags.${scope}.gadgetResistClaims.${key}`]: {
        ...state.claim, state: 'reviewed', reviewedBy: user.id
      } });
      return { ok: valid() && message.flags[scope].gadgetResistClaims?.[key]?.state === 'reviewed' };
    }
    const verified = await verifiedResist({ messageId, resultId, user });
    const result = game.messages.get(resultId);
    if (!valid() || !verified.ok || typeof result?.rolls?.[0]?.outcome?.success !== 'boolean') return { ok: false };
    const key = resistKey(verified.record);
    if (!key) return { ok: false };
    const flags = message.flags[scope], previous = flags.resists?.[key];
    const held = flags.gadgetResistClaims?.[key];
    if (action === 'complete') {
      if (held?.state !== 'pending' || held.resultId !== resultId || held.userId !== user.id
        || previous?.resultId !== resultId) return { ok: false };
      await message.update({ [`flags.${scope}.gadgetResistClaims.${key}`]: { ...held, state: 'complete' } });
      return { ok: valid() && message.flags[scope].gadgetResistClaims?.[key]?.state === 'complete' };
    }
    if (held && !['complete', 'reviewed'].includes(held.state)) return { ok: false };
    if (override) {
      const prior = previous?.resultId ?? (held?.state === 'reviewed' ? held.resultId : null);
      if (!user.isGM || !prior || prior !== expected || resultId === expected) return { ok: false };
    } else if (previous || held) return { ok: false };
    // Foundry merges nested flag objects. Clear the previous review explicitly
    // and verify fields rather than relying on object key order or replacement.
    const claim = { state: 'pending', resultId, userId: user.id, writerId: game.user.id, reviewedBy: null };
    await message.update({ [`flags.${scope}.gadgetResistClaims.${key}`]: claim });
    const saved = message.flags[scope].gadgetResistClaims?.[key];
    return { ok: valid() && Object.entries(claim).every(([field, value]) => saved?.[field] === value) };
  };
  const task = (queues.get(messageId) ?? Promise.resolve()).catch(() => {}).then(run);
  queues.set(messageId, task);
  try { return await task; } finally { if (queues.get(messageId) === task) queues.delete(messageId); }
}
