import { snakeTrapCatchPlan } from "../rules/snake-trap-catches.mjs";
import { snarePoisonEligible } from "../rules/snare-trigger.mjs";

export const SNAKE_TRAP_CATCH_QUERY = "azeroth-rpg.snakeTrapCatch";
const pending = new Set();
const delivering = new Set();
const SCOPE = 'azeroth-rpg';
const deliveryKey = (messageId, actorUuid) => `${messageId}/${actorUuid}`;
const sourceOf = message => {
  const current = message.flags?.[SCOPE] ?? {};
  const { catches, ...trap } = current.snakeTrap ?? {};
  return JSON.stringify([current.kind, current.featureKey, current.poisons, current.snareTrigger, trap]);
};

/** Revalidate before continuing each awaited poison side effect. */
export function assertSnakeTrapDelivery(message, actor, result) {
  const held=message.flags?.[SCOPE]?.snakeTrapDeliveries?.find(row=>row.actorUuid===actor.uuid&&row.resultId===result.id);
  if(!held || held.state!=='pending' || held.userId!==game.user.id || held.writerId!==game.users?.activeGM?.id
    || game.messages.get(message.id)!==message || game.messages.get(result.id)!==result
    || fromUuidSync(actor.uuid)!==actor || !actor.testUserPermission(game.user,'OWNER')
    || held.source!==sourceOf(message) || held.passed!==result.rolls?.[0]?.outcome?.success)
    throw new Error('Snake Trap delivery changed; review the consumed exposure before continuing');
}

export async function snakeTrapCatchHandler({ messageId, actorUuid, resultId = null, action = 'claim', state = 'complete' } = {}, { user } = {}) {
  const writerId = game.user?.id;
  const authority = () => user?.id && game.user?.isGM && game.user.id === writerId && game.users?.activeGM?.id === writerId;
  if (!authority()) return false;
  const actor = await fromUuid(actorUuid);
  const message = game.messages.get(messageId);
  if (!authority() || actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER") || !message || pending.has(messageId)) return false;
  const flags = message.flags?.["azeroth-rpg"];
  if (flags?.kind !== "feature" || flags.featureKey !== "snare" || !flags.poisons?.length
    || !snarePoisonEligible(flags.snareTrigger, actor.uuid)) return false;
  const source = () => sourceOf(message);
  const sourceStamp = source();
  const result = resultId ? game.messages.get(resultId) : null;
  if (resultId && (result?.author?.id !== user.id || ChatMessage.getSpeakerActor(result.speaker)?.uuid !== actorUuid
    || result.flags?.[SCOPE]?.kind !== 'resilience' || typeof result.rolls?.[0]?.outcome?.success !== 'boolean')) return false;
  pending.add(messageId);
  try {
    if (action === 'finish') {
      if (!['complete', 'interrupted'].includes(state)) return false;
      const records = flags.snakeTrapDeliveries ?? [];
      const held = records.find(row => row.actorUuid === actorUuid && row.resultId === resultId);
      if (!held || held.state !== 'pending' || held.userId !== user.id
        || (state === 'complete' && (held.source !== sourceStamp || held.passed !== result?.rolls?.[0]?.outcome?.success))) return false;
      const next = records.map(row => row === held ? {...row, state, finishedAt: Date.now()} : row);
      const expected = JSON.stringify(next);
      await message.update({'flags.azeroth-rpg.snakeTrapDeliveries': next});
      return Boolean(authority() && game.messages.get(messageId) === message && fromUuidSync(actorUuid) === actor
        && actor.testUserPermission(user, 'OWNER') && source() === sourceStamp
        && JSON.stringify(message.flags?.[SCOPE]?.snakeTrapDeliveries) === expected);
    }
    if (action !== 'claim') return false;
    const plan = snakeTrapCatchPlan(flags.snakeTrap, actor.uuid);
    if (!plan.ok) return false;
    const expected = JSON.stringify(plan.catches);
    const records = result ? [...structuredClone(flags.snakeTrapDeliveries ?? []), {
      actorUuid, resultId, passed: result.rolls[0].outcome.success, userId: user.id, writerId,
      state: 'pending', source: sourceStamp, startedAt: Date.now()
    }] : null;
    const expectedRecords = JSON.stringify(records);
    await message.update({ "flags.azeroth-rpg.snakeTrap.catches": plan.catches,
      ...(records ? {'flags.azeroth-rpg.snakeTrapDeliveries': records} : {}) });
    return Boolean(authority() && game.messages.get(messageId) === message && fromUuidSync(actorUuid) === actor
      && actor.uuid === actorUuid && actor.testUserPermission(user, "OWNER") && source() === sourceStamp
      && JSON.stringify(message.flags?.["azeroth-rpg"]?.snakeTrap?.catches) === expected
      && (!records || JSON.stringify(message.flags?.[SCOPE]?.snakeTrapDeliveries) === expectedRecords));
  } finally { pending.delete(messageId); }
}

export async function claimSnakeTrapCatch(message, actor, result = null) {
  const gm = game.users?.activeGM;
  if (!gm) return false;
  const payload = { messageId: message.id, actorUuid: actor.uuid, resultId: result?.id ?? null };
  try {
    const claimed = (gm.id === game.user.id ? await snakeTrapCatchHandler(payload, { user: game.user })
      : await gm.query(SNAKE_TRAP_CATCH_QUERY, payload, { timeout: 15000 })) === true;
    if (claimed && result) delivering.add(deliveryKey(message.id, actor.uuid));
    return claimed;
  } catch { return false; }
}

export async function finishSnakeTrapCatch(message, actor, result, state = 'complete') {
  const gm = game.users?.activeGM;
  const request = {action:'finish',messageId:message.id,actorUuid:actor.uuid,resultId:result.id,state};
  try {
    if (!gm) return false;
    return (gm.id === game.user.id ? await snakeTrapCatchHandler(request,{user:game.user})
      : await gm.query(SNAKE_TRAP_CATCH_QUERY,request,{timeout:15000})) === true;
  } catch { return false; }
  finally { delivering.delete(deliveryKey(message.id,actor.uuid)); }
}

const reviewHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
export function snakeTrapRecoveryViews(actor) {
  if (!reviewHere() || !actor) return [];
  return Array.from(game.messages?.values?.() ?? []).flatMap(message => {
    const flags=message.flags?.[SCOPE];
    if(flags?.kind!=='feature'||flags.featureKey!=='snare')return [];
    return (flags.snakeTrapDeliveries??[]).filter(row=>row.actorUuid===actor.uuid&&['pending','interrupted'].includes(row.state))
      .map(row=>structuredClone({actorUuid:actor.uuid,messageId:message.id,resultId:row.resultId,
        records:flags.snakeTrapDeliveries,catches:flags.snakeTrap?.catches,
        target:{health:actor.system?.health,effects:Array.from(actor.effects??[]).map(effect=>effect.toObject()),
          combat:actor.activeFight?.()?.getCombatantsByActor?.(actor)?.map(c=>({uuid:c.uuid,budget:c.budget}))??[]}}));
  });
}

export async function reviewSnakeTrapDelivery({actorUuid,expected,acknowledged=false}={}) {
  if(!reviewHere()||acknowledged!==true)return {ok:false,reason:'permission'};
  const id=expected?.messageId,writerId=game.user.id;
  if(pending.has(id)||delivering.has(deliveryKey(id,actorUuid)))return {ok:false,reason:'busy'};
  const actor=fromUuidSync(actorUuid),message=game.messages.get(id);
  const current=snakeTrapRecoveryViews(actor).find(row=>row.messageId===id&&row.resultId===expected.resultId);
  if(!current||JSON.stringify(current)!==JSON.stringify(expected))return {ok:false,reason:'changed'};
  const held=current.records.find(row=>row.actorUuid===actorUuid&&row.resultId===expected.resultId);
  if(held.state==='pending'&&(!held.userId||(held.userId!==writerId&&game.users.get(held.userId)?.active)))return {ok:false,reason:'writerActive'};
  const next=current.records.map(row=>row===held?{...row,state:'reviewed',reviewedBy:writerId,reviewedAt:Date.now()}:row);
  pending.add(id);
  try {
    await message.update({'flags.azeroth-rpg.snakeTrapDeliveries':next});
    return reviewHere()&&game.user.id===writerId&&game.messages.get(id)===message
      &&JSON.stringify(message.flags?.[SCOPE]?.snakeTrapDeliveries)===JSON.stringify(next)?{ok:true}:{ok:false,reason:'unconfirmed'};
  }finally{pending.delete(id);}
}
