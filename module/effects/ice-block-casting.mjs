/** Successful-cast delivery. Persist a claim before protection or condition
 * removal; an uncertain write is never replayed. */
import { iceBlockEffect, iceBlockFor, iceBlockConditionPlan } from "../rules/ice-block.mjs";
import { clearIceBlockConditions } from "./ice-block-conditions.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";

export const ICE_BLOCK_PREPARE = "azeroth-rpg.iceBlockPrepare";
export const ICE_BLOCK_RESOLVE = "azeroth-rpg.iceBlockResolve";
export const ICE_BLOCK_CLAIM = "iceBlockCreationClaim";
export const ICE_BLOCK_RECEIPT = "iceBlockResolution";
export const ICE_BLOCK_REVIEW = "iceBlockCreationReview";
export const ICE_BLOCK_REVIEW_QUERY = "azeroth-rpg.iceBlockCreationReview";
const SCOPE = "azeroth-rpg";
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const refuse = reason => ({ ok: false, reason });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const owns = (actor, user) => Boolean(user?.id && (user.isGM || actor?.testUserPermission(user, "OWNER")));
let queue = Promise.resolve();

function context({ casterUuid, spellUuid }, user) {
  if (!writer()) return refuse("authority");
  const actor = resolve(casterUuid), spell = resolve(spellUuid);
  if (actor?.documentName !== "Actor" || actor.uuid !== casterUuid || !owns(actor, user)) return refuse("permission");
  if (spell?.type !== "spell" || spell.uuid !== spellUuid || spell.system?.identifier !== "ice-block"
    || (spell.parent && spell.parent !== actor)) return refuse("spell");
  return { ok: true, actor, spell };
}

export async function prepareIceBlockCast(payload = {}, { user } = {}) {
  const ctx = context(payload, user);
  if (!ctx.ok) return ctx;
  if (ctx.actor.getFlag(SCOPE, ICE_BLOCK_CLAIM)) return refuse("reconcile");
  if (iceBlockFor(ctx.actor)) return refuse("protected");
  if (!iceBlockConditionPlan([...ctx.actor.effects])) return refuse("conditions");
  return { ok: true };
}

export async function resolveIceBlockCast({ messageId } = {}, { user } = {}) {
  const run = async () => {
    const card = game.messages?.get(messageId), f = card?.flags?.[SCOPE];
    if (!writer() || f?.kind !== "spell" || f.identifier !== "ice-block" || f.success !== true
      || typeof f.cast !== "string" || !f.cast.trim()) return refuse("card");
    const ctx = context({ casterUuid: f.caster, spellUuid: f.spellUuid }, user);
    if (!ctx.ok) return ctx;
    const { actor, spell } = ctx;
    if (!owns(actor, card.author)) return refuse("permission");
    const identity = () => JSON.stringify([card.flags?.[SCOPE]?.kind, card.flags?.[SCOPE]?.identifier,
      card.flags?.[SCOPE]?.cast, card.flags?.[SCOPE]?.caster, card.flags?.[SCOPE]?.spellUuid, card.flags?.[SCOPE]?.success]);
    const signature = identity(), claim = { messageId, identity: signature };
    const current = () => writer() && game.messages.get(messageId) === card && resolve(actor.uuid) === actor
      && resolve(spell.uuid) === spell && identity() === signature && owns(actor, user) && owns(actor, card.author);
    const cleanup = async () => {
      if (!current()) return false;
      const held = actor.getFlag(SCOPE, ICE_BLOCK_CLAIM);
      if (held && !same(held, claim)) return false;
      if (held) await actor.unsetFlag(SCOPE, ICE_BLOCK_CLAIM);
      return current() && !actor.getFlag(SCOPE, ICE_BLOCK_CLAIM);
    };
    try {
      if (card.getFlag(SCOPE, ICE_BLOCK_REVIEW)) return refuse("reviewed");
      const prior = card.getFlag(SCOPE, ICE_BLOCK_RECEIPT);
      if (prior) {
        if (prior.stage !== "complete" || prior.identity !== signature) return refuse("reconcile");
        return await cleanup() ? { ok: true, already: true, effectId: prior.effectId } : refuse("uncertain");
      }
      if (actor.getFlag(SCOPE, ICE_BLOCK_CLAIM) || iceBlockFor(actor)) return refuse("reconcile");
      const plan = iceBlockConditionPlan([...actor.effects]);
      if (!plan) return refuse("conditions");
      const data = iceBlockEffect({ ownerUuid: actor.uuid, spellUuid: spell.uuid, messageUuid: card.uuid,
        cast: f.cast, timing: untilEndOfNextTurnOrRound(actor), description: spell.system.effect ?? "", img: spell.img });
      if (!data) return refuse("effect");
      const effectId = foundry.utils.randomID(16);
      const receipt = { stage: "applying", identity: signature, effectId,
        previousConditions: [...actor.effects].filter(e => plan.ids.includes(e.id)).map(e => e.toObject()) };
      if (!current()) return refuse("changed");
      await actor.setFlag(SCOPE, ICE_BLOCK_CLAIM, claim);
      const claimed = () => current() && same(actor.getFlag(SCOPE, ICE_BLOCK_CLAIM), claim);
      if (!claimed()) return refuse("uncertain");
      await card.setFlag(SCOPE, ICE_BLOCK_RECEIPT, receipt);
      if (!claimed() || !same(card.getFlag(SCOPE, ICE_BLOCK_RECEIPT), receipt)) return refuse("uncertain");
      await actor.createEmbeddedDocuments("ActiveEffect", [{ _id: effectId, ...data }], { keepId: true });
      const effect = iceBlockFor(actor);
      if (!claimed() || effect?.id !== effectId || !same(effect.flags[SCOPE].iceBlock, data.flags[SCOPE].iceBlock)) return refuse("uncertain");
      const valid = () => claimed() && iceBlockFor(actor) === effect;
      const cleared = await clearIceBlockConditions(actor, { valid });
      if (!cleared.ok || !valid()) return refuse("uncertain");
      const complete = { ...receipt, stage: "complete", ended: cleared.ended, conditions: cleared.conditions };
      await card.setFlag(SCOPE, ICE_BLOCK_RECEIPT, complete);
      if (!valid() || !same(card.getFlag(SCOPE, ICE_BLOCK_RECEIPT), complete)) return refuse("uncertain");
      if (!await cleanup()) return refuse("uncertain");
      return { ok: true, effectId };
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
    : await gm.query(query, payload, { timeout: 30000 }); }
  catch { return refuse("uncertain"); }
}
export const requestIceBlockPreparation = (actor, spell) => request(ICE_BLOCK_PREPARE,
  { casterUuid: actor.uuid, spellUuid: spell.uuid }, prepareIceBlockCast);
export const requestIceBlockResolution = card => request(ICE_BLOCK_RESOLVE, { messageId: card.id }, resolveIceBlockCast);

/** The GM must reconcile protection AND cleared conditions. An existing or
 * missing carrier alone cannot establish whether condition deletion happened. */
export function iceBlockCreationReviewState(card) {
  const f = card?.flags?.[SCOPE];
  if (f?.kind !== "spell" || f.identifier !== "ice-block") return null;
  const receipt = card.getFlag(SCOPE, ICE_BLOCK_RECEIPT) ?? null;
  const review = card.getFlag(SCOPE, ICE_BLOCK_REVIEW) ?? null;
  let original;
  try { original = JSON.parse(receipt?.identity ?? "null"); } catch { original = null; }
  const casterUuid = Array.isArray(original) ? original[3] : f.caster;
  const caster = resolve(casterUuid);
  const claim = caster?.getFlag(SCOPE, ICE_BLOCK_CLAIM) ?? null;
  const effects = [...(caster?.effects ?? [])].map(e => e.toObject())
    .sort((a, b) => String(a._id).localeCompare(String(b._id)));
  const actor = { uuid: casterUuid, name: caster?.name ?? casterUuid, missing: !caster, effects };
  const ownClaim = claim?.messageId === card.id;
  const pending = f.success === true && (ownClaim || (review?.cleanup !== "complete"
    && (Boolean(review) || receipt?.stage !== "complete")));
  const identity = JSON.stringify([f.kind, f.identifier, f.cast, f.caster, f.spellUuid, f.success]);
  const basis = JSON.stringify({ identity, receipt, actor });
  return { pending, actor, claim, receipt, review, basis, expected: JSON.stringify({ basis, claim, review }) };
}

/** Acknowledgement only: never refunds payment, creates protection or repeats
 * condition removal. Serialize with delivery and reject a stale review view. */
export async function reviewIceBlockCreation({ messageId, expected, acknowledged } = {}, { user } = {}) {
  if (!writer() || !user?.isGM || acknowledged !== true) return refuse("permission");
  const run = async () => {
    if (!writer() || !user?.isGM) return refuse("authority");
    const card = game.messages?.get(messageId), state = iceBlockCreationReviewState(card);
    if (!state?.pending || state.expected !== expected) return refuse("changed");
    const caster = resolve(state.actor.uuid);
    const reviewed = state.review ?? { stage: "complete", by: user.id, at: Date.now(), expected };
    const valid = () => writer() && user?.isGM && game.messages.get(messageId) === card
      && resolve(state.actor.uuid) === caster && same(card.getFlag(SCOPE, ICE_BLOCK_REVIEW), reviewed)
      && iceBlockCreationReviewState(card)?.basis === state.basis;
    try {
      if (!state.review) await card.setFlag(SCOPE, ICE_BLOCK_REVIEW, reviewed);
      if (!valid()) return refuse("uncertain");
      if (caster && state.claim?.messageId === messageId) {
        if (!same(caster.getFlag(SCOPE, ICE_BLOCK_CLAIM), state.claim)) return refuse("changed");
        await caster.unsetFlag(SCOPE, ICE_BLOCK_CLAIM);
        if (!valid() || same(caster.getFlag(SCOPE, ICE_BLOCK_CLAIM), state.claim)) return refuse("uncertain");
      }
      const complete = { ...reviewed, cleanup: "complete" };
      await card.setFlag(SCOPE, ICE_BLOCK_REVIEW, complete);
      if (!writer() || game.messages.get(messageId) !== card
        || !same(card.getFlag(SCOPE, ICE_BLOCK_REVIEW), complete)) return refuse("uncertain");
      return { ok: true, reviewed: true };
    } catch { return refuse("uncertain"); }
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}
export const requestIceBlockCreationReview = (card, expected) => request(ICE_BLOCK_REVIEW_QUERY,
  { messageId: card.id, expected, acknowledged: true }, reviewIceBlockCreation);
