import { resolveAttackOperation } from "./attack-resolution-state.mjs";
import { canReact, parryPoolFor, PARRY_COST, standingMarkRefusal } from "../rules/reactions.mjs";
import { confirmedParryOutcome, confirmedStandaloneParryOutcome } from "../rules/parry-outcome.mjs";
import { AZEROTH } from "../config.mjs";
import { refuseDisarmedParry } from "./npc-disarm.mjs";
import {parrySignatureBonus} from '../rules/signature-parry.mjs';
import {deliverTurnSignatures} from './signature-turn-use.mjs';

export const PARRY_QUERY = "azeroth-rpg.resolveAttackParry";
export const PARRY_PERFORM_QUERY = "azeroth-rpg.performClaimedParry";
export const PARRY_PAY_QUERY = "azeroth-rpg.payClaimedParry";
export const STANDALONE_PARRY_QUERY='azeroth-rpg.signatureStandaloneParry';
const local = new Map(), payments = new Map();
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const gmHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const signatureFor=actor=>parrySignatureBonus({signatures:actor?.system?.signatureEffects?.firstParryTest??[],
 ranks:actor?.type==='npc'?actor.system?.skills??{}:actor?.getFlag?.('azeroth-rpg','skillRanks')??{}});
export function claimedParryBonus(token){const entry=local.get(token);return entry?.valid()?entry.parryBonus??null:null;}
export const hasParrySignature=actor=>Boolean(signatureFor(actor));
const targetOf = (message, index) => {
  const row = message?.flags?.["azeroth-rpg"]?.targets?.[index];
  return row?.sceneId && row?.tokenId ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`)?.actor
    : !row?.sceneId && !row?.tokenId && row?.actorId ? game.actors.get(row.actorId) : null;
};
const legacyParryTarget=(message,index,actor)=>message?.documentName==='ChatMessage'
 &&Number.isInteger(index)&&index>=0&&targetOf(message,index)===actor
 &&message.flags?.['azeroth-rpg']?.kind==='attack'&&!message.flags['azeroth-rpg'].parry
 &&!message.flags['azeroth-rpg'].notAttack&&!message.getFlag('azeroth-rpg','attackResolution')
 &&Number.isFinite(message.rolls?.[0]?.total);

export function parryCommitValid(token, actor, messageId, index) {
  const entry = local.get(token);
  return !!entry && entry.actor === actor && (entry.message?.id??null) === messageId && entry.index === index && entry.valid();
}
export function recordParryOutcome(token, outcome, card = null) {
  if (token === null) return;
  const entry = local.get(token);
  if (!entry?.valid()) throw Error("Parry claim changed");
  if (outcome === "started") entry.started = true;
  else { entry.outcome = outcome; entry.cardUuid = card?.uuid ?? null; }
}

/** The GM alone pays the pool, once per active claim. */
export async function parryPayQueryHandler({ key } = {}, { user } = {}) {
  const entry = payments.get(key);
  if (!gmHere() || !entry || entry.user.id !== user?.id || !entry.valid()
    || !entry.actor.testUserPermission(user, "OWNER")) return { ok: false };
  if (entry.payment === "paid") return { ok: true, paid: entry.paid };
  if (entry.payment === "unavailable") return { ok: true, paid: null };
  if (entry.payment !== "none") return { ok: false };
  const purse = parryPoolFor(entry.actor.poolSnapshot?.() ?? [], { maneuverPool: entry.actor.maneuverPool ?? null });
  if (!purse || purse.value < PARRY_COST) { entry.payment = "unavailable"; return { ok: true, paid: null }; }
  const { itemId, kind } = purse;
  const expectedValue = purse.value - PARRY_COST;
  entry.payment = "paying";
  try {
    await entry.actor.updatePool({ itemId, kind, value: expectedValue });
    const current = entry.actor.poolSnapshot().find(p => p.itemId === itemId && p.kind === kind);
    if (!entry.valid() || current?.value !== expectedValue) throw Error("Parry payment unconfirmed");
    entry.payment = "paid";
    entry.paid = { cost: PARRY_COST, name: game.i18n.localize(AZEROTH.poolTypes[purse.name] ?? "AZEROTH.Momentum.Label") };
    return { ok: true, paid: entry.paid };
  } catch { entry.payment = "uncertain"; return { ok: false }; }
}
export async function payClaimedParry(token) {
  const entry = local.get(token);
  if (!entry?.valid()) throw Error("Parry claim changed");
  const response = gmHere() ? await parryPayQueryHandler({ key: entry.key }, { user: game.user })
    : await game.users.activeGM.query(PARRY_PAY_QUERY, { key: entry.key }, { timeout: 60000 });
  if (!response?.ok) throw Error("Parry payment unconfirmed");
  return response.paid;
}

/** Called by the active GM on the requesting player's client. */
export async function performParryQueryHandler({ actorUuid, messageUuid, index, key, attackTotal, parryBonus = null, standalone = false } = {}, { user } = {}) {
  if (!user?.isGM || user.id !== game.users?.activeGM?.id || typeof key !== "string" || !key) return { ok: false };
  const actor = resolve(actorUuid), message = resolve(messageUuid);
  const valid = () => actor?.isOwner && resolve(actorUuid) === actor && (standalone
    ? messageUuid===null&&index===null||resolve(messageUuid)===message&&legacyParryTarget(message,index,actor)
    : resolve(messageUuid) === message&&targetOf(message, index) === actor
      && message?.getFlag("azeroth-rpg", "attackResolution")?.targets?.[index]?.stage === "parrying"
      && message.getFlag("azeroth-rpg", "attackResolution").targets[index].parryKey === key);
  if (!valid()) return { ok: false };
  if(parryBonus&&JSON.stringify(signatureFor(actor))!==JSON.stringify(parryBonus))return {ok:false};
  const token = Symbol("Parry"), entry = { actor, message, index, key, valid, parryBonus, started: false, outcome: null, cardUuid: null };
  local.set(token, entry);
  try {
    const { reactWithDialog } = await import("../applications/actions.mjs");
    await reactWithDialog(actor, "parry", { attackTotal, messageId: message?.id??null, targetIndex: index, parryCommit: token });
    return { ok: valid(), started: entry.started, outcome: entry.outcome, cardUuid: entry.cardUuid };
  } finally { local.delete(token); }
}

/** Reaction-menu and legacy-card Parry lack a tracked attack claim. The
 * actor's durable signature claim covers the Test, preserving any legacy
 * card association. Pool payment still uses the existing GM registry. */
export async function standaloneParryQueryHandler({actorUuid,attackTotal=null,messageUuid=null,index=null}={}, {user}={}){
 const actor=resolve(actorUuid),message=messageUuid?resolve(messageUuid):null;
 if(!gmHere()||actor?.documentName!=='Actor'||!actor.testUserPermission(user,'OWNER')
  ||(attackTotal!==null&&!Number.isFinite(attackTotal)))return {ok:false,reason:'permission'};
 if(messageUuid!==null){
  const incoming=message?.flags?.['azeroth-rpg']?.damageByTarget?.[index];
  if(!legacyParryTarget(message,index,actor)||incoming?.hit!==true||incoming.withdrawn)return {ok:false,reason:'permission'};
  attackTotal=message.rolls[0].total;
 }else if(index!==null)return {ok:false,reason:'permission'};
 const bonus=signatureFor(actor);if(!bonus)return {ok:false,reason:'source'};
 const key=foundry.utils.randomID(32),valid=()=>gmHere()&&resolve(actorUuid)===actor&&actor.testUserPermission(user,'OWNER')
   &&JSON.stringify(signatureFor(actor))===JSON.stringify(bonus)
   &&(!messageUuid||(resolve(messageUuid)===message&&legacyParryTarget(message,index,actor)&&message.rolls[0].total===attackTotal));
 const payment={actor,user,payment:'none',valid:()=>false};payments.set(key,payment);let response;
 try{
  const result=await deliverTurnSignatures({actor,identifiers:[bonus.identifier],event:`parry:${key}`,validate:valid,
   execute:async({identifiers,valid:held})=>{
    payment.valid=held;
    const payload={actorUuid,messageUuid,index,key,attackTotal,standalone:true,parryBonus:identifiers.length?bonus:null};
    response=user.id===game.user.id?await performParryQueryHandler(payload,{user:game.user})
      : await user.query(PARRY_PERFORM_QUERY,payload,{timeout:180000});
    const card=response?.cardUuid?await fromUuid(response.cardUuid):null;
    const roll=card?.rolls?.[0],flags=card?.flags?.['azeroth-rpg'];
    const noTest=!card&&payment.payment==='none'&&response?.started===false&&response?.outcome===null;
    const confirm=message?confirmedParryOutcome:confirmedStandaloneParryOutcome;
    const test=confirm({outcome:response?.outcome,started:response?.started,paymentConfirmed:payment.payment==='paid',
      messageId:message?.id,index,incoming:message?.flags?.['azeroth-rpg']?.damageByTarget?.[index],
      actorId:actor.id,reacted:actor.getFlag('azeroth-rpg','reacted'),mark:actor.getFlag('azeroth-rpg','mitigate'),
      card:card?{actorId:card.speaker.actor,parry:flags?.parry,answers:flags?.answers,total:roll?.total,dc:roll?.options?.dc??attackTotal??0}:null});
    return {complete:response?.ok===true&&held()&&(noTest||test),committed:Boolean(card)};
   }});
  return result.ok?{ok:true,messageUuid:response?.cardUuid??null}:result;
 }finally{payments.delete(key);}
}
export async function requestStandaloneParry(actor,attackTotal=null,{message=null,index=null}={}){
 const gm=game.users.activeGM;if(!gm){ui.notifications?.warn(game.i18n.localize('AZEROTH.Signature.UseUnavailable'));return null;}
 try{
  const payload={actorUuid:actor.uuid,attackTotal,messageUuid:message?.uuid??null,index};
  const result=gm.id===game.user.id?await standaloneParryQueryHandler(payload,{user:game.user}):await gm.query(STANDALONE_PARRY_QUERY,payload,{timeout:240000});
  if(result.ok)return result.messageUuid?await fromUuid(result.messageUuid):null;
 }catch{/* An uncertain Test keeps its durable actor claim. */}
 ui.notifications?.warn(game.i18n.localize('AZEROTH.Signature.UseUnavailable'));return null;
}

export async function attackParryQueryHandler({ actorUuid, messageUuid, index } = {}, { user } = {}) {
  if (!gmHere() || !user?.id || !Number.isInteger(index) || index < 0) return { ok: false, reason: "permission" };
  const actor = resolve(actorUuid), message = resolve(messageUuid);
  const valid = () => actor?.documentName === "Actor" && message?.documentName === "ChatMessage"
    && resolve(actorUuid) === actor && resolve(messageUuid) === message && targetOf(message, index) === actor
    && actor.testUserPermission(user, "OWNER") && message.flags?.["azeroth-rpg"]?.kind === "attack"
    && !message.flags["azeroth-rpg"].parry && !message.flags["azeroth-rpg"].notAttack;
  const incoming = message?.flags?.["azeroth-rpg"]?.damageByTarget?.[index];
  const attackTotal = message?.rolls?.[0]?.total;
  if (!valid() || incoming?.hit !== true || incoming.withdrawn || !Number.isFinite(attackTotal)) return { ok: false, reason: "permission" };
  const { reactionStateOf, parryRangeContext } = await import("../applications/actions.mjs");
  const state = reactionStateOf(actor, { messageId: message.id, targetIndex: index, against: ChatMessage.getSpeakerActor(message.speaker) });
  const may = canReact("parry", state);
  if (!may.ok || standingMarkRefusal(actor.getFlag("azeroth-rpg", "mitigate"), { door: "reaction" })
    || !parryRangeContext(actor, { messageId: message.id, targetIndex: index }).ok || refuseDisarmedParry(actor, may.with))
    return { ok: false, reason: "unavailable" };
  const key = foundry.utils.randomID(32); let response;
  const payment = { actor, message, index, user, payment: "none", valid: () => false };
  payments.set(key, payment);
  try {
    const result = await resolveAttackOperation({ message, index, targetUuid: actor.uuid, operation: "parry", parryKey: key, validate: valid,
      execute: async ({ valid: stillValid }) => {
        payment.valid = stillValid;
        const perform=async(parryBonus=null)=>{
        const payload = { actorUuid, messageUuid, index, key, attackTotal, parryBonus };
        response = user.id === game.user.id ? await performParryQueryHandler(payload, { user: game.user })
          : await user.query(PARRY_PERFORM_QUERY, payload, { timeout: 180000 });
        const card = response?.cardUuid ? await fromUuid(response.cardUuid) : null;
        const roll = card?.rolls?.[0], flags = card?.flags?.["azeroth-rpg"];
        const confirmed = confirmedParryOutcome({ outcome: response?.outcome, started: response?.started,
          paymentConfirmed: payment.payment === "paid", messageId: message.id, index, actorId: actor.id,
          reacted: actor.getFlag("azeroth-rpg", "reacted"), mark: actor.getFlag("azeroth-rpg", "mitigate"),
          incoming: message.flags["azeroth-rpg"].damageByTarget[index],
          card: card ? { actorId: card.speaker.actor, parry: flags?.parry, answers: flags?.answers, total: roll?.total, dc: roll?.options?.dc } : null });
        return { ok: response?.ok === true && confirmed && stillValid() };
        };
        const bonus=signatureFor(actor);
        if(!bonus)return perform();
        const result=await deliverTurnSignatures({actor,identifiers:[bonus.identifier],event:`parry:${key}`,
          validate:()=>stillValid()&&JSON.stringify(signatureFor(actor))===JSON.stringify(bonus),
          execute:async({identifiers,valid:held})=>{
            if(!held())return {complete:false};
            const finished=await perform(identifiers.length?bonus:null);
            return {complete:finished.ok,committed:Boolean(response?.cardUuid)};
          }});
        return {ok:result.ok&&stillValid()};
      } });
    return result.ok ? { ok: true, messageUuid: response.cardUuid, outcome: response.outcome } : result;
  } finally { payments.delete(key); }
}

export async function requestAttackParry(actor, message, index) {
  try {
    const payload = { actorUuid: actor.uuid, messageUuid: message.uuid, index };
    const result = gmHere() ? await attackParryQueryHandler(payload, { user: game.user })
      : await game.users?.activeGM?.query(PARRY_QUERY, payload, { timeout: 240000 });
    if (result?.ok) return result.messageUuid ? await fromUuid(result.messageUuid) : null;
  } catch { /* A timeout leaves the durable claim for review. */ }
  ui.notifications?.warn(game.i18n.localize("AZEROTH.Reaction.Refuse.AttackState"));
  return null;
}
