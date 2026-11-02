import { explosiveTrapClaimPlan } from "../rules/explosive-trap.mjs";
import { wardBySchool } from "../rules/ward.mjs";
import { schoolArmorBySchool } from "../rules/auras.mjs";
import { buffetStacks } from "../rules/flame-buffet.mjs";

export const EXPLOSIVE_TRAP_QUERY = "azeroth-rpg.explosiveTrap";
const SCOPE = "azeroth-rpg";
const pending = new Set();
const queues = new Map();

/** Keep simultaneous recipients' already-made rolls; do not ask them to reroll
 * just because another victim's damage write is still awaiting acknowledgement. */
export function explosiveTrapHandler(request = {}, context = {}) {
  const key = request.messageId;
  if (typeof key !== "string" || !key) return Promise.resolve({ ok: false, reason: "invalid" });
  const previous = queues.get(key) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(() => resolveExplosiveTrapNow(request, context));
  queues.set(key, task);
  return task.finally(() => { if (queues.get(key) === task) queues.delete(key); });
}

function rollFacts(result) {
  const flags = result?.flags?.[SCOPE] ?? {};
  const roll = result?.rolls?.[0];
  return { kind: flags.kind, resilience: flags.resilience, link: flags.resistOf,
    author: result?.author?.id, speaker: ChatMessage.getSpeakerActor(result?.speaker)?.uuid,
    success: roll?.outcome?.success, dc: roll?.options?.dc, total: roll?.total };
}

function defensesOf(actor) {
  const system = actor.system ?? {};
  return { wardBySchool: wardBySchool(system.ward), schoolArmor: schoolArmorBySchool(system.schoolArmor),
    immune: system.immune ?? [], vulnerable: system.vulnerable ?? [],
    fireTakenBonus: buffetStacks([...(actor.effects ?? [])], game.time?.worldTime) };
}

/** The request supplies identities only. Damage and success come from saved data. */
async function resolveExplosiveTrapNow({ messageId, actorUuid, resultId } = {}, { user } = {}) {
  const writerId = game.user?.id;
  const authority = () => Boolean(user?.id && game.users?.get(user.id) === user
    && game.user?.isGM && game.user.id === writerId && game.users?.activeGM?.id === writerId);
  if (!authority() || typeof messageId !== "string" || typeof actorUuid !== "string"
    || typeof resultId !== "string" || pending.has(messageId)) return { ok: false, reason: "unavailable" };
  const message = game.messages.get(messageId), result = game.messages.get(resultId);
  const flags = message?.flags?.[SCOPE];
  if (!message || !result || flags?.kind !== "feature" || flags.featureKey !== "snare") return { ok: false, reason: "invalid" };
  const sourceStamp = JSON.stringify([flags.explosiveTrap, flags.snareTrigger]);
  pending.add(messageId);
  let reserved = false;
  try {
    const actor = await fromUuid(actorUuid);
    const live = () => authority() && game.messages.get(messageId) === message && game.messages.get(resultId) === result
      && actor?.documentName === "Actor" && actor.uuid === actorUuid && fromUuidSync(actorUuid) === actor
      && actor.testUserPermission(user, "OWNER")
      && JSON.stringify([message.flags?.[SCOPE]?.explosiveTrap, message.flags?.[SCOPE]?.snareTrigger]) === sourceStamp;
    if (!live()) return { ok: false, reason: "unavailable" };
    const facts = rollFacts(result);
    if (facts.kind !== "resilience" || facts.resilience !== "reflex" || facts.author !== user.id
      || facts.speaker !== actorUuid || facts.link?.messageId !== messageId
      || facts.link.identifier !== "explosive-trap" || facts.link.actorId !== actor.id
      || facts.dc !== flags.explosiveTrap?.dc || !Number.isFinite(facts.total)
      || typeof facts.success !== "boolean") return { ok: false, reason: "roll" };
    const resultStamp = JSON.stringify(facts);
    const target = defensesOf(actor), defenseStamp = JSON.stringify(target);
    const plan = explosiveTrapClaimPlan({ snapshot: flags.explosiveTrap, trigger: flags.snareTrigger,
      claims: flags.explosiveTrapClaims, actorUuid, resultId, passed: facts.success,
      target });
    if (!plan.ok) return plan;
    plan.claim.writerId = writerId;
    // The claim survives an uncertain acknowledgement or interrupted damage write.
    // No automatic retry or refund is safe once this write has been attempted.
    reserved = true;
    await message.update({ [`flags.${SCOPE}.explosiveTrapClaims`]: plan.claims });
    const holds = () => live() && JSON.stringify(rollFacts(result)) === resultStamp
      && JSON.stringify(message.flags?.[SCOPE]?.explosiveTrapClaims) === JSON.stringify(plan.claims);
    if (!holds() || JSON.stringify(defensesOf(actor)) !== defenseStamp) return { ok: false, reason: "changed", claimed: true };
    const damage = plan.claim.damage;
    // Even a fully absorbed feature hit carries Ward credit to the damage door.
    const delivered = await actor.applyDamage(damage.damage, { struck: true, attack: false, spell: false,
      location: "body", type: "fire", messageId, by: ChatMessage.getSpeakerActor(message.speaker),
      wardTook: damage.wardTook ?? 0, parts: damage.parts ?? null });
    if (delivered !== actor) return { ok: false, reason: "delivery", claimed: true };
    if (!holds()) return { ok: false, reason: "changed", claimed: true };
    const completed = plan.claims.map(row => row === plan.claim ? { ...row, phase: "complete" } : row);
    await message.update({ [`flags.${SCOPE}.explosiveTrapClaims`]: completed });
    return live() && JSON.stringify(message.flags?.[SCOPE]?.explosiveTrapClaims) === JSON.stringify(completed)
      ? { ok: true, damage: damage.damage, passed: facts.success }
      : { ok: false, reason: "changed", claimed: true };
  } catch (error) {
    console.warn("azeroth-rpg | Explosive Trap resolution could not be confirmed", error);
    return { ok: false, reason: "uncertain", claimed: reserved };
  } finally { pending.delete(messageId); }
}

const reviewHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;

/** Acknowledgement records manual reconciliation; it never retries damage. */
export function explosiveTrapRecoveryViews(actor) {
  if (!reviewHere() || !actor) return [];
  return Array.from(game.messages?.values?.() ?? []).flatMap(message => {
    const flags = message.flags?.[SCOPE];
    if (flags?.kind !== 'feature' || flags.featureKey !== 'snare') return [];
    return (flags.explosiveTrapClaims ?? []).filter(row => row.actorUuid === actor.uuid && row.phase === 'claimed')
      .map(claim => structuredClone({ actorUuid: actor.uuid, messageId: message.id, resultId: claim.resultId,
        claims: flags.explosiveTrapClaims, source: [flags.explosiveTrap, flags.snareTrigger],
        target: { health: actor.system?.health, pools: actor.poolSnapshot?.() ?? [],
          effects: Array.from(actor.effects ?? []).map(effect => effect.toObject()) } }));
  });
}

export async function reviewExplosiveTrap({ actorUuid, expected, acknowledged = false } = {}) {
  if (!reviewHere() || acknowledged !== true) return { ok: false, reason: 'permission' };
  const key = expected?.messageId;
  if (typeof key !== 'string' || pending.has(key) || queues.has(key)) return { ok: false, reason: 'busy' };
  const writerId = game.user.id;
  const run = async () => {
    if (!reviewHere() || game.user.id !== writerId) return { ok: false, reason: 'permission' };
    const actor = fromUuidSync(actorUuid), message = game.messages.get(key);
    const current = explosiveTrapRecoveryViews(actor).find(row => row.messageId === key && row.resultId === expected.resultId);
    if (!current || JSON.stringify(current) !== JSON.stringify(expected)) return { ok: false, reason: 'changed' };
    const claim = current.claims.find(row => row.actorUuid === actorUuid && row.resultId === expected.resultId);
    if (!claim.writerId || (claim.writerId !== writerId && game.users.get(claim.writerId)?.active))
      return { ok: false, reason: 'writerActive' };
    const reviewed = current.claims.map(row => row === claim ? { ...row, phase: 'reviewed', reviewedBy: writerId, reviewedAt: Date.now() } : row);
    await message.update({ [`flags.${SCOPE}.explosiveTrapClaims`]: reviewed });
    return reviewHere() && game.user.id === writerId && game.messages.get(key) === message
      && JSON.stringify(message.flags?.[SCOPE]?.explosiveTrapClaims) === JSON.stringify(reviewed)
      ? { ok: true } : { ok: false, reason: 'unconfirmed' };
  };
  const task = Promise.resolve().then(run);
  queues.set(key, task);
  try { return await task; } finally { if (queues.get(key) === task) queues.delete(key); }
}

export async function resolveExplosiveTrap(message, actor, result) {
  const gm = game.users?.activeGM;
  if (!gm) return { ok: false, reason: "unavailable" };
  const request = { messageId: message.id, actorUuid: actor.uuid, resultId: result.id };
  try {
    return gm.id === game.user.id ? await explosiveTrapHandler(request, { user: game.user })
      : await gm.query(EXPLOSIVE_TRAP_QUERY, request, { timeout: 15000 });
  } catch { return { ok: false, reason: "uncertain" }; }
}
