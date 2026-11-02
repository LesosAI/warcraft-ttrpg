/** Apply one successful Mana Burn card on the active GM. */
import { manaBurnPlan } from "../rules/mana-burn.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";
import { signatureApplyRows } from "../rules/signature-apply.mjs";
import { signatureRecipientKey } from "../rules/signature-scaling.mjs";
import { deliverChosenSignature } from "./signature-delivery.mjs";
import { queueSignatureCard } from "./signature-card-queue.mjs";

export const MANA_BURN_QUERY = "azeroth-rpg.manaBurn";
const busy = new Set();
const activeGM = () => game.user?.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);

/** Snapshot an uncertain application without inferring which writes succeeded. */
export function manaBurnRecoveryViews(actor) {
  if (!activeGM()) return [];
  return [...(game.messages?.values?.() ?? [])].flatMap(message => {
    const flags = message.flags?.['azeroth-rpg'], receipt = flags?.manaBurnApplied;
    if (flags?.identifier !== 'mana-burn' || flags.kind !== 'spell' || flags.success !== true
      || receipt?.state !== 'claimed' || receipt.target !== actor?.uuid || actorAt(flags.targets?.[0]) !== actor) return [];
    return [{actorUuid:actor.uuid,messageId:message.id,flags:structuredClone(flags),
      health:structuredClone(actor.system?.health ?? {}),pools:structuredClone(actor.poolSnapshot?.() ?? [])}];
  });
}

/** The GM reconciles the actual Mana/Health first. Closing never repeats either write. */
export async function reviewManaBurn({actorUuid,expected,acknowledged=false}={}) {
  if (!activeGM() || !acknowledged) return {ok:false,reason:'authority'};
  const writer = game.user.id, message = game.messages?.get(expected?.messageId);
  if (!message) return {ok:false,reason:'record'};
  return queueSignatureCard(message,async()=>{
    const actor = actorAt(message.flags?.['azeroth-rpg']?.targets?.[0]);
    if (!activeGM() || game.user.id !== writer || actor?.uuid !== actorUuid) return {ok:false,reason:'changed'};
    if (busy.has(actorUuid)) return {ok:false,reason:'busy'};
    const current = manaBurnRecoveryViews(actor).find(row=>row.messageId===message.id);
    if (!current || JSON.stringify(current)!==JSON.stringify(expected)) return {ok:false,reason:'changed'};
    const receipt = current.flags.manaBurnApplied;
    if (!receipt.writer || (receipt.writer!==writer && game.users.get(receipt.writer)?.active)) return {ok:false,reason:'writerActive'};
    const signatures = current.flags.chosenSignatureDelivery;
    if (signatures && (signatures.version!==1 || signatures.cast!==current.flags.cast || !Array.isArray(signatures.entries)
      || JSON.stringify(signatures.entries.map(row=>row.bonus))!==JSON.stringify(current.flags.chosenSignatureBonuses))) return {ok:false,reason:'signatureChanged'};
    if (signatures?.entries.some(row=>row.pending && (!row.pending.writer
      || (row.pending.writer!==writer && game.users.get(row.pending.writer)?.active)))) return {ok:false,reason:'writerActive'};
    busy.add(actorUuid);
    try {
      const reviewed = {...receipt,state:'reviewed',reviewedBy:writer,reviewedAt:Date.now()};
      const closed = signatures ? {...signatures,entries:signatures.entries.map(row=>({...row,used:true,pending:null,
        ...(!row.used||row.pending ? {review:{by:writer,at:reviewed.reviewedAt,previousPending:row.pending??null}} : {})}))} : null;
      // One card write closes the specialized use and its casting allowance together.
      if (closed) await message.update({'flags.azeroth-rpg.manaBurnApplied':reviewed,'flags.azeroth-rpg.chosenSignatureDelivery':closed});
      else await message.setFlag('azeroth-rpg','manaBurnApplied',reviewed);
      if (!activeGM() || game.user.id!==writer || JSON.stringify(message.getFlag('azeroth-rpg','manaBurnApplied'))!==JSON.stringify(reviewed)
        || (closed && JSON.stringify(message.getFlag('azeroth-rpg','chosenSignatureDelivery'))!==JSON.stringify(closed))) return {ok:false,reason:'write'};
      return {ok:true};
    } catch {return {ok:false,reason:'write'};}
    finally {busy.delete(actorUuid);}
  });
}

function actorAt(ref) {
  if (!ref?.actorId) return null;
  if (ref.sceneId || ref.tokenId) {
    if (!ref.sceneId || !ref.tokenId) return null;
    const actor = game.scenes?.get(ref.sceneId)?.tokens.get(ref.tokenId)?.actor;
    return actor?.id === ref.actorId ? actor : null;
  }
  return game.actors?.get(ref.actorId) ?? null;
}

export async function applyManaBurn(messageId, index) {
  const data = { messageId, index };
  if (activeGM()) return manaBurnQueryHandler(data, { user: game.user });
  const gm = game.users?.activeGM;
  if (!gm) return { ok: false, reason: "noGM" };
  return gm.query(MANA_BURN_QUERY, data);
}

/** No caller-supplied damage, pool value or actor is accepted. The casting
 * workflow supplies four mitigated rows, indexed by the missing Mana (0–3).
 * Claim before either write; an interrupted application requires GM repair,
 * never an automatic retry that could drain or damage twice.
 */
export function manaBurnQueryHandler(payload = {}, context = {}) {
  const message = game.messages?.get(payload.messageId);
  return message?.flags?.["azeroth-rpg"]?.chosenSignatureDelivery
    ? queueSignatureCard(message, () => applyHere(payload, context)) : applyHere(payload, context);
}

async function applyHere({ messageId, index } = {}, { user = null } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!activeGM() || !user?.id) return refuse("noGM");
  if (index !== 0) return refuse("target");
  const message = game.messages?.get(messageId);
  const flags = message?.flags?.["azeroth-rpg"];
  if (flags?.kind !== "spell" || flags.identifier !== "mana-burn" || flags.success !== true
    || flags.targets?.length !== 1 || flags.damageByTarget?.[0]?.withdrawn === true) return refuse("card");
  const variants = flags.manaBurn?.[0];
  if (!Array.isArray(variants) || variants.length !== 4 || variants.some(row =>
    !Number.isFinite(row?.damage) || row.damage < 0 || row.type !== "arcane")) return refuse("card");
  const target = actorAt(flags.targets[0]);
  const caster = flags.caster ? await fromUuid(flags.caster) : null;
  if (!target?.uuid || caster?.documentName !== "Actor") return refuse("target");
  if (!user.isGM && !caster.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!message.author?.isGM && !caster.testUserPermission(message.author, "OWNER")) return refuse("author");
  const key = target.uuid;
  if (busy.has(key)) return refuse("busy");
  busy.add(key);
  const originalWriter = game.user.id;
  const protection = iceBlockFor(target);
  const signatureIdentity = f => f?.chosenSignatureBonuses?.length
    ? { cast: f.cast, bonuses: f.chosenSignatureBonuses } : null;
  const fingerprint = JSON.stringify({ targets: flags.targets, caster: flags.caster,
    variants, row: flags.damageByTarget[0], success: flags.success, identifier: flags.identifier,
    signature: signatureIdentity(flags) });
  const current = () => {
    const now = message.flags?.["azeroth-rpg"];
    return activeGM() && game.user.id === originalWriter && game.messages?.get(messageId) === message
      && actorAt(now?.targets?.[0]) === target
      && iceBlockFor(target) === protection
      && JSON.stringify({ targets: now.targets, caster: now.caster,
        variants: now.manaBurn?.[0], row: now.damageByTarget?.[0], success: now.success,
        identifier: now.identifier, signature: signatureIdentity(now) }) === fingerprint;
  };
  let claimed = false;
  try {
    if (!current()) return refuse("changed");
    if (message.getFlag("azeroth-rpg", "manaBurnApplied")) return refuse("used");
    const plan = manaBurnPlan(target.poolSnapshot?.() ?? []);
    if (!plan) return refuse("pool");
    const immune = variants[0].immune === true || Boolean(protection);
    const effective = signatureApplyRows({ ...flags, damageByTarget: [variants[immune ? 0 : plan.shortage]] }, 0);
    if (!effective) return refuse("signatureChanged");
    const row = protection ? { damage: 0 } : effective.row;
    const recipient = signatureRecipientKey(flags.targets[0]);
    const chosen = !effective.consumed && flags.chosenSignatureBonuses?.some(bonus => bonus.recipient === recipient);
    const before = JSON.stringify(target.poolSnapshot?.() ?? []);
    const claim = {
      target: target.uuid, drained: immune ? 0 : plan.drained, damage: row.damage, state: "claimed", writer: originalWriter
    };
    await message.setFlag("azeroth-rpg", "manaBurnApplied", claim);
    if (JSON.stringify(message.getFlag("azeroth-rpg", "manaBurnApplied")) !== JSON.stringify(claim)) return refuse("write");
    claimed = true;
    if (!current() || JSON.stringify(target.poolSnapshot?.() ?? []) !== before) return { ...refuse("changed"), claimed };
    const execute = async ({ valid = current } = {}) => {
      if (!valid() || JSON.stringify(target.poolSnapshot?.() ?? []) !== before) return refuse("changed");
      if (!immune && plan.change) await target.updatePool(plan.change);
      if (!valid()) return refuse("changed");
      const outcome = protection ? { complete: true, dealtDamage: false, transferred: false } : {};
      if (!protection) await target.applyDamage(row.damage, {
        struck: true, attack: true, location: "body", type: "arcane", messageId,
        by: caster, spell: true, wardTook: row.wardTook ?? 0,
        parts: Array.isArray(row.parts) ? row.parts : null, outcome
      });
      return { ok: current(), damageOutcome: outcome };
    };
    const result = chosen
      ? await deliverChosenSignature({ message, cast: flags.cast, recipient, event: "initial:0", validate: current, execute })
      : await execute();
    if (!result?.ok || !current()) return { ...refuse("deliveryUncertain"), claimed };
    const completed = {
      ...claim, state: "applied"
    };
    await message.setFlag("azeroth-rpg", "manaBurnApplied", completed);
    if (!current() || JSON.stringify(message.getFlag("azeroth-rpg", "manaBurnApplied")) !== JSON.stringify(completed)) {
      return { ...refuse("write"), claimed };
    }
    return { ok: true, drained: immune ? 0 : plan.drained, damage: row.damage };
  } catch (error) {
    console.warn("azeroth-rpg | Mana Burn application", error);
    return { ...refuse("write"), claimed };
  } finally {
    busy.delete(key);
  }
}
