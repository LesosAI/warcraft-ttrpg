/** GM-coordinated consent and one-write Soul Link replacement. An interrupted
 * effect write is never replayed; its actor claim and card receipt remain for
 * review. Approval tickets are GM-local: a restart requires fresh consent.
 */
import { requestSoulLinkConsent, soulLinkCastContext } from "./soul-link-consent.mjs";

export const SOUL_LINK_PREPARE = "azeroth-rpg.soulLinkPrepare";
export const SOUL_LINK_RESOLVE = "azeroth-rpg.soulLinkResolve";
export const SOUL_LINK_RECEIPT = "soulLinkResolution";
export const SOUL_LINK_CLAIM = "soulLinkCreationClaim";
export const SOUL_LINK_REVIEW = "soulLinkCreationReview";
export const SOUL_LINK_REVIEW_QUERY = "azeroth-rpg.soulLinkCreationReview";
const SCOPE = "azeroth-rpg";
const approvals = new Map();
const APPROVAL_MS = 300000;
let queue = Promise.resolve();
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const refuse = reason => ({ ok: false, reason });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const identity = card => {
  const f = card.flags?.[SCOPE];
  return JSON.stringify([f?.kind, f?.identifier, f?.cast, f?.caster, f?.spellUuid,
    f?.targets, f?.source, f?.success, f?.soulLinkPreparation]);
};

export async function prepareSoulLinkCast(payload = {}, { user } = {}) {
  if (!writer()) return refuse("authority");
  const before = soulLinkCastContext(payload, user);
  if (!before.ok) return before;
  if (before.caster.getFlag(SCOPE, SOUL_LINK_CLAIM)) return refuse("reconcile");
  const consent = await requestSoulLinkConsent(payload, { user });
  if (!consent.ok) return consent;
  const fresh = soulLinkCastContext(payload, user);
  if (!fresh.ok || !same(fresh.state, before.state) || fresh.caster.getFlag(SCOPE, SOUL_LINK_CLAIM)) return refuse("changed");
  for (const [key, approval] of approvals) if (approval.expiresAt <= Date.now()) approvals.delete(key);
  const ticket = foundry.utils.randomID(24);
  const state = { ...fresh.state };
  approvals.set(ticket, { state, userId: user.id, consentUserId: consent.consentUserId,
    expiresAt: Date.now() + APPROVAL_MS, messageId: null });
  return { ok: true, ticket, ...state };
}

export async function resolveSoulLinkCast({ messageId } = {}, { user } = {}) {
  const run = async () => {
    const card = game.messages?.get(messageId), f = card?.flags?.[SCOPE];
    if (!writer() || f?.kind !== "spell" || f.identifier !== "soul-link" || f.success !== true
      || !f.cast || !f.soulLinkPreparation?.ok) return refuse("card");
    const caster = resolve(f.caster);
    if (!user?.id || !caster?.testUserPermission(user, "OWNER")
      || (!card.author?.isGM && !caster.testUserPermission(card.author, "OWNER"))) return refuse("permission");
    const signature = identity(card), claim = { messageId, identity: signature };
    const current = () => writer() && game.messages.get(messageId) === card && resolve(f.caster) === caster
      && identity(card) === signature && caster.testUserPermission(user, "OWNER");
    const cleanup = async () => {
      if (!current()) return false;
      if (same(caster.getFlag(SCOPE, SOUL_LINK_CLAIM), claim)) await caster.unsetFlag(SCOPE, SOUL_LINK_CLAIM);
      if (!current() || same(caster.getFlag(SCOPE, SOUL_LINK_CLAIM), claim)) return false;
      const receipt = card.getFlag(SCOPE, SOUL_LINK_RECEIPT);
      if (receipt?.stage === "complete" && receipt.cleanup !== "complete") {
        const cleaned = { ...receipt, cleanup: "complete" };
        await card.setFlag(SCOPE, SOUL_LINK_RECEIPT, cleaned);
        if (!same(card.getFlag(SCOPE, SOUL_LINK_RECEIPT), cleaned)) return false;
      }
      return current() && !same(caster.getFlag(SCOPE, SOUL_LINK_CLAIM), claim);
    };
    try {
      if (card.getFlag(SCOPE, SOUL_LINK_REVIEW)) return refuse("reviewed");
      const prior = card.getFlag(SCOPE, SOUL_LINK_RECEIPT);
      if (prior) {
        if (prior.stage !== "complete" || prior.identity !== signature) return refuse("reconcile");
        return await cleanup() ? { ok: true, already: true, effectId: prior.effectId } : refuse("uncertain");
      }
      if (caster.getFlag(SCOPE, SOUL_LINK_CLAIM)) return refuse("reconcile");
      const approval = approvals.get(f.soulLinkPreparation.ticket);
      if (!approval || approval.userId !== user.id || approval.expiresAt <= Date.now() || approval.messageId) return refuse("consent");
      const payload = { casterUuid: f.caster, spellUuid: f.spellUuid, targets: f.targets, source: f.source };
      const ctx = soulLinkCastContext(payload, user);
      if (!ctx.ok || !same(ctx.state, approval.state)) return refuse("changed");
      const consentUser = game.users?.get(approval.consentUserId);
      if (!consentUser || !ctx.recipient.testUserPermission(consentUser, "OWNER")) return refuse("consent");
      const links = values(caster.effects).filter(e => e.flags?.[SCOPE]?.identifier === "soul-link"
        && e.flags[SCOPE].soulLink?.version === 1 && e.flags[SCOPE].soulLink.casterUuid === caster.uuid);
      if (links.length > 1) return refuse("reconcile");
      const existing = links[0] ?? null, old = existing ? JSON.stringify(existing.toObject()) : null;
      const effectId = existing?.id ?? foundry.utils.randomID(16);
      const data = { name: ctx.spell.name, img: ctx.spell.img, origin: caster.uuid,
        start: { time: game.time.worldTime },
        duration: { value: ctx.state.seconds, units: "seconds", expiry: "turnStart", expired: false }, system: { changes: [] },
        disabled: false, flags: { [SCOPE]: { identifier: "soul-link", sustained: false, cast: f.cast, messageId,
          soulLink: { version: 1, casterUuid: caster.uuid, recipientUuid: ctx.recipient.uuid,
            sourceTokenUuid: ctx.state.sourceTokenUuid, targetTokenUuid: ctx.state.targetTokenUuid } } } };
      const valid = () => {
        const next = soulLinkCastContext(payload, user);
        return current() && next.ok && same(next.state, approval.state)
          && next.recipient.testUserPermission(consentUser, "OWNER");
      };
      approval.messageId = messageId;
      if (!valid() || caster.getFlag(SCOPE, SOUL_LINK_CLAIM)) return refuse("changed");
      await caster.setFlag(SCOPE, SOUL_LINK_CLAIM, claim);
      const claimed = () => valid() && same(caster.getFlag(SCOPE, SOUL_LINK_CLAIM), claim);
      if (!claimed()) return refuse("uncertain");
      const receipt = { stage: "applying", identity: signature, effectId, state: ctx.state,
        consentUserId: approval.consentUserId, previousEffect: old ? JSON.parse(old) : null };
      await card.setFlag(SCOPE, SOUL_LINK_RECEIPT, receipt);
      if (!claimed() || !same(card.getFlag(SCOPE, SOUL_LINK_RECEIPT), receipt)) return refuse("uncertain");
      if (existing) {
        if (caster.effects.get(effectId) !== existing || JSON.stringify(existing.toObject()) !== old) return refuse("changed");
        await existing.update(data);
      } else {
        if (caster.effects.get(effectId)) return refuse("changed");
        await caster.createEmbeddedDocuments("ActiveEffect", [{ _id: effectId, ...data }], { keepId: true });
      }
      const effect = caster.effects.get(effectId);
      const duration = effect?._source?.duration ?? effect?.duration;
      const start = effect?._source?.start ?? effect?.start;
      if (!claimed() || effect?.flags?.[SCOPE]?.identifier !== "soul-link" || effect.flags[SCOPE].cast !== f.cast
        || effect.origin !== caster.uuid || effect.disabled !== false
        || start?.time !== data.start.time || duration?.value !== data.duration.value || duration?.units !== "seconds"
        || !same(effect.flags[SCOPE].soulLink, data.flags[SCOPE].soulLink)) return refuse("uncertain");
      const complete = { ...receipt, stage: "complete" };
      await card.setFlag(SCOPE, SOUL_LINK_RECEIPT, complete);
      if (!claimed() || !same(card.getFlag(SCOPE, SOUL_LINK_RECEIPT), complete)) return refuse("uncertain");
      if (!await cleanup()) return refuse("uncertain");
      return { ok: true, effectId, replaced: Boolean(existing) };
    } catch { return refuse("uncertain"); }
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

async function request(query, payload, handler) {
  const gm = game.users?.activeGM;
  if (!gm) return refuse("authority");
  try { return gm.id === game.user.id ? await handler(payload, { user: game.user })
    : await gm.query(query, payload, { timeout: 45000 }); }
  catch { return refuse("uncertain"); }
}
export const requestSoulLinkPreparation = (actor, spell, targets, source) => request(SOUL_LINK_PREPARE,
  { casterUuid: actor.uuid, spellUuid: spell.uuid, targets, source }, prepareSoulLinkCast);
export const requestSoulLinkResolution = card => request(SOUL_LINK_RESOLVE, { messageId: card.id }, resolveSoulLinkCast);
export const requestSoulLinkCreationReview = (card, expected) => request(SOUL_LINK_REVIEW_QUERY,
  { messageId: card.id, expected, acknowledged: true }, reviewSoulLinkCreation);

/** Snapshot for manual reconciliation. Neither observed effects nor a missing
 * effect prove whether a write happened; review never replays that write. */
export function soulLinkCreationReviewState(card) {
  const f = card?.flags?.[SCOPE];
  if (f?.kind !== "spell" || f.identifier !== "soul-link" || !f.soulLinkPreparation?.ok) return null;
  const receipt = card.getFlag(SCOPE, SOUL_LINK_RECEIPT) ?? null;
  const review = card.getFlag(SCOPE, SOUL_LINK_REVIEW) ?? null;
  let original;
  try { original = JSON.parse(receipt?.identity ?? "null"); } catch { original = null; }
  const casterUuid = Array.isArray(original) ? original[3] : f.caster;
  const caster = resolve(casterUuid);
  const claim = caster?.getFlag(SCOPE, SOUL_LINK_CLAIM) ?? null;
  const effects = values(caster?.effects).filter(e => e.flags?.[SCOPE]?.identifier === "soul-link")
    .map(e => e.toObject()).sort((a, b) => String(a._id).localeCompare(String(b._id)));
  const actor = { uuid: casterUuid, name: caster?.name ?? casterUuid, missing: !caster, effects };
  const ownClaim = claim?.messageId === card.id;
  const pending = f.success === true && (ownClaim || (review?.cleanup !== "complete"
    && (Boolean(review) || receipt?.stage !== "complete")));
  const basis = JSON.stringify({ identity: identity(card), receipt, actor });
  return { pending, actor, claim, receipt, review, basis,
    expected: JSON.stringify({ basis, claim, review }) };
}

/** GM acknowledgement after inspecting/reconciling the effects. Only flags are
 * written, in the same queue as creation; no effect or resource is changed. */
export async function reviewSoulLinkCreation({ messageId, expected, acknowledged } = {}, { user } = {}) {
  if (!writer() || !user?.isGM || acknowledged !== true) return refuse("permission");
  const run = async () => {
    if (!writer() || !user?.isGM) return refuse("authority");
    const card = game.messages?.get(messageId), state = soulLinkCreationReviewState(card);
    if (!state?.pending || state.expected !== expected) return refuse("changed");
    const caster = resolve(state.actor.uuid);
    const reviewed = state.review ?? { stage: "complete", by: user.id, at: Date.now(), expected };
    const valid = () => writer() && user?.isGM && game.messages.get(messageId) === card
      && resolve(state.actor.uuid) === caster && same(card.getFlag(SCOPE, SOUL_LINK_REVIEW), reviewed)
      && soulLinkCreationReviewState(card)?.basis === state.basis;
    try {
      if (!state.review) await card.setFlag(SCOPE, SOUL_LINK_REVIEW, reviewed);
      if (!valid()) return refuse("uncertain");
      if (caster && state.claim?.messageId === messageId) {
        if (!same(caster.getFlag(SCOPE, SOUL_LINK_CLAIM), state.claim)) return refuse("changed");
        await caster.unsetFlag(SCOPE, SOUL_LINK_CLAIM);
        if (!valid() || same(caster.getFlag(SCOPE, SOUL_LINK_CLAIM), state.claim)) return refuse("uncertain");
      }
      const complete = { ...reviewed, cleanup: "complete" };
      await card.setFlag(SCOPE, SOUL_LINK_REVIEW, complete);
      if (!writer() || game.messages.get(messageId) !== card
        || !same(card.getFlag(SCOPE, SOUL_LINK_REVIEW), complete)) return refuse("uncertain");
      return { ok: true, reviewed: true };
    } catch { return refuse("uncertain"); }
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}
