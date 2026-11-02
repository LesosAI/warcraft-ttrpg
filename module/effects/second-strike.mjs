import { SECOND_STRIKE, secondStrikeOffer } from "../rules/second-strike.mjs";

const pending = new WeakMap();
const payments = new Map();
export const SECOND_STRIKE_QUERY = 'azeroth-rpg.secondStrike';

/** One authoritative payment queue across all owning clients. The existing
 * round marker remains spent if any later write or acknowledgement is uncertain. */
export async function secondStrikeQueryHandler(request = {}, {user = game.user} = {}) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id || !user) return {ok:false, reason:'authority'};
  const writerId = game.user.id;
  const actor = request.actorUuid ? await fromUuid(request.actorUuid) : null;
  if (actor?.documentName !== 'Actor' || !actor.testUserPermission(user, 'OWNER')) return {ok:false, reason:'owner'};
  const before = payments.get(actor.uuid) ?? Promise.resolve();
  const task = before.catch(()=>{}).then(async()=>{
    const authority = () => game.user?.isGM && game.user.id === writerId
      && game.users?.activeGM?.id === writerId && fromUuidSync(actor.uuid) === actor
      && actor.testUserPermission(user,'OWNER');
    if (!authority()) return {ok:false,reason:'authority'};
    const fight = actor.activeFight?.() ?? null;
    const combatant = fight?.getCombatantsByActor?.(actor)?.[0] ?? null;
    const stamp = () => combatant ? fight.round : Math.floor((Number(game.time.worldTime)||0)/(CONFIG.time.roundTime||6));
    const current = () => authority() && (actor.activeFight?.()??null) === fight && stamp() === request.stamp
      && (!combatant || fight.getCombatantsByActor?.(actor)?.[0] === combatant);
    if ((fight?.id??null)!==request.combatId || (combatant?.id??null)!==request.combatantId || !current()) return {ok:false,reason:'stale'};
    const used = () => {
      if(!combatant)return actor.getFlag('azeroth-rpg','secondStrikeRound')===stamp()?[SECOND_STRIKE]:[];
      const round=combatant.getFlag('azeroth-rpg','round')??{};
      return round.number===fight.round?(round.once??[]):[];
    };
    const offer=secondStrikeOffer(actor.takenTalents?.()??[],{kind:'attack',success:false,pools:actor.poolSnapshot?.()??[],used:used()});
    if(!offer || !Number.isFinite(request.maxCost) || offer.cost>request.maxCost)return {ok:false,reason:'ineligible'};
    try {
      if(combatant){if(!(await combatant.markRoundOnce(SECOND_STRIKE))?.added)return {ok:false,reason:'used'};}
      else await actor.setFlag('azeroth-rpg','secondStrikeRound',request.stamp);
      if(!current() || !used().includes(SECOND_STRIKE))return {ok:false,reason:'claim'};
      const payment=secondStrikeOffer(actor.takenTalents?.()??[],{kind:'attack',success:false,pools:actor.poolSnapshot?.()??[]});
      if(!payment || payment.cost>request.maxCost || payment.pool.itemId!==offer.pool.itemId || payment.pool.kind!==offer.pool.kind)return {ok:false,reason:'payment'};
      await actor.updatePool({itemId:payment.pool.itemId,kind:payment.pool.kind,value:payment.pool.value-payment.cost});
      const paid=actor.poolSnapshot?.().find(pool=>pool.itemId===payment.pool.itemId&&pool.kind===payment.pool.kind);
      if(!current() || paid?.value!==payment.pool.value-payment.cost)return {ok:false,reason:'payment'};
      return {ok:true,cost:payment.cost};
    }catch(error){console.warn('azeroth-rpg | Second Strike payment',error);return {ok:false,reason:'payment'};}
  });
  payments.set(actor.uuid,task);
  try{return await task;}finally{if(payments.get(actor.uuid)===task)payments.delete(actor.uuid);}
}

/** Resolve the choice before any hit/miss side effects. Core Roll#reroll clones
 * the formula, data and options (verified locally against Foundry 14.367).
 * The attack workflow is not re-entered, so ammo, riders and actions are not paid twice. */
export function offerSecondStrike(actor, roll, context) {
  if (!actor) return Promise.resolve(roll);
  const before = pending.get(actor) ?? Promise.resolve();
  const task = before.catch(() => {}).then(() => resolve(actor, roll, context));
  pending.set(actor, task);
  return task.finally(() => { if (pending.get(actor) === task) pending.delete(actor); });
}

async function resolve(actor, roll, { kind, parry = false } = {}) {
  const fight = actor.activeFight?.() ?? null;
  const combatant = fight?.getCombatantsByActor?.(actor)?.[0] ?? null;
  const worldRound = () => Math.floor((Number(game.time.worldTime) || 0) / (CONFIG.time.roundTime || 6));
  const stamp = combatant ? fight.round : worldRound();
  const used = () => {
    if (!combatant) return actor.getFlag("azeroth-rpg", "secondStrikeRound") === worldRound() ? [SECOND_STRIKE] : [];
    const round = combatant.getFlag("azeroth-rpg", "round") ?? {};
    return round.number === fight.round ? (round.once ?? []) : [];
  };
  const offer = () => secondStrikeOffer(actor.takenTalents?.() ?? [], {
    kind, parry, success: roll.outcome.success, pools: actor.poolSnapshot?.() ?? [], used: used()
  });
  const initial = offer();
  if (!initial || combatant && !combatant.isOwner) return roll;
  const yes = await foundry.applications.api.DialogV2.confirm({
    id: `azeroth-second-strike-${actor.id}`,
    window: { title: game.i18n.localize("AZEROTH.SecondStrike.Title") },
    content: `<p>${game.i18n.format("AZEROTH.SecondStrike.Prompt", { total: roll.total, dc: roll.options.dc, cost: initial.cost })}</p>`,
    yes: { label: "AZEROTH.SecondStrike.RollAgain" }, no: { label: "AZEROTH.SecondStrike.Keep" }, rejectClose: false
  });
  if (yes !== true || (combatant ? fight.round : worldRound()) !== stamp || (actor.activeFight?.() ?? null) !== fight) return roll;
  const current = offer();
  if (!current || current.cost > initial.cost) return roll;
  const request={actorUuid:actor.uuid,combatId:fight?.id??null,combatantId:combatant?.id??null,stamp,maxCost:current.cost};
  let payment;
  try {
    const gm=game.users?.activeGM;
    payment=gm?.id===game.user?.id ? await secondStrikeQueryHandler(request)
      : await gm?.query(SECOND_STRIKE_QUERY,request,{timeout:15000});
  }catch(error){console.warn('azeroth-rpg | Second Strike acknowledgement',error);}
  if (!payment?.ok) {
    ui.notifications?.warn(game.i18n.localize(payment?.reason==='claim' ? 'AZEROTH.SecondStrike.ClaimUnconfirmed' : 'AZEROTH.SecondStrike.PaymentUnconfirmed'));
    return roll;
  }
  // Core clone shares options with the original. Snapshot before adding any
  // replacement metadata or it would contain itself through original.options.
  let original, replacement;
  try {
    original = JSON.parse(JSON.stringify(roll.toJSON()));
    replacement = await roll.reroll();
  } catch (error) {
    console.warn('azeroth-rpg | Second Strike reroll', error);
    const warning = game.i18n.format('AZEROTH.SecondStrike.RerollUnconfirmed', { cost: payment.cost });
    roll.options.provenance ??= [];
    roll.options.provenance.push({ label: 'AZEROTH.SecondStrike.Title', value: null, formula: warning });
    roll.options.secondStrikeInterrupted = { cost: payment.cost };
    ui.notifications?.warn(warning);
    return roll;
  }
  replacement.options.provenance ??= [];
  replacement.options.provenance.push({ label: "AZEROTH.SecondStrike.Title", value: null,
    formula: game.i18n.format("AZEROTH.SecondStrike.Record", { total: roll.total, cost: payment.cost }) });
  replacement.options.secondStrike = { original, cost: payment.cost };
  return replacement;
}
