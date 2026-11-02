/** Critical Injuries have one GM coordinator. Consent queries never spend or apply.
 * A card is claimed before asking, so another click or a late query cannot duplicate
 * the injury. An interrupted claim stays visible for GM recovery, never auto-replays.
 * User#query verified against local Foundry 14.367 client/documents/user.mjs.
 */
import { sacrificeOffer } from "../rules/sacrifice.mjs";
import { poolNamed } from "../rules/pools.mjs";
import { ownTokenOf } from "./death-holds.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { realmStateFor } from "./spirit-realm.mjs";
import { ASK_MS, answererOf, confirmHere } from "./blow-doors.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";

export const INJURY_QUERY = "azeroth-rpg.injuryApplication";
export const SACRIFICE_QUERY = "azeroth-rpg.sacrificeConsent";
const FLAG = "injuryApplication";
let queue = Promise.resolve();
const active = new Set();
const workflows = () => game.system.azeroth.workflows;
const text = (key, data = {}) => game.i18n.format(`AZEROTH.Sacrifice.${key}`, data);

function facts(holder, target) {
  if (iceBlockFor(holder) || iceBlockFor(target)) return { offer: null, pool: null };
  const origin = ownTokenOf(target);
  const token = origin?.parent?.tokens?.find(t => t.actor?.uuid === holder.uuid);
  const pool = poolNamed(holder.poolSnapshot?.() ?? [], "mana");
  const offer = sacrificeOffer(holder.takenTalents?.() ?? [], {
    distance: origin && token ? feetApart(origin, token) : null,
    self: holder.uuid === target.uuid, health: holder.system?.health?.value ?? 0,
    mana: pool?.value ?? 0, reaction: !workflows().turnBudgetRefusal(holder, "reaction"),
    inRealm: realmStateFor(holder).in === true
  });
  return { offer, pool };
}

/** The owning player's answer is only consent, never authorization to mutate. */
export async function sacrificeConsentHandler({ holderUuid, targetUuid } = {}, { user } = {}) {
  if (!user?.isGM) throw new Error(text("Unauthorized"));
  const holder = await fromUuid(holderUuid);
  const target = await fromUuid(targetUuid);
  if (!holder?.isOwner || !target || !facts(holder, target).offer) return false;
  return confirmHere(holder, {
    title: text("Title"),
    text: text("Ask", { holder: foundry.utils.escapeHTML(holder.name),
      target: foundry.utils.escapeHTML(target.name) })
  });
}

async function recipientFor(target, record = async () => {}, ensure = () => {}) {
  const scene = ownTokenOf(target)?.parent;
  const holders = [...new Map([...(scene?.tokens ?? [])].filter(t => t.actor)
    .map(t => [t.actor.uuid, t.actor])).values()]
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  for (const holder of holders) {
    ensure();
    if (iceBlockFor(target)) return null;
    if (!facts(holder, target).offer) continue;
    const who = answererOf(holder);
    if (!who) continue;
    const payload = { holderUuid: holder.uuid, targetUuid: target.uuid };
    let yes = false;
    try {
      yes = who.id === game.user.id
        ? await sacrificeConsentHandler(payload, { user: game.user })
        : await who.query(SACRIFICE_QUERY, payload, { timeout: ASK_MS });
    } catch { /* No consent means no transfer; the remote query cannot mutate. */ }
    ensure();
    if (iceBlockFor(target)) return null;
    if (yes !== true) continue;
    // Re-read the scene, rank, pools and turn after the answer, not cached distances.
    const { offer, pool } = facts(holder, target);
    if (!offer) continue;
    await record({ recipientUuid: holder.uuid, transferred: true, cost: offer.cost, payment: "starting" });
    if (iceBlockFor(target)) return null;
    if (iceBlockFor(holder)) continue;
    if (!(await workflows().spendTurnBudget(holder, "reaction"))) continue;
    ensure();
    if (iceBlockFor(target) || iceBlockFor(holder)) return null;
    const current = poolNamed(holder.poolSnapshot?.() ?? [], "mana", { itemId: pool.itemId });
    if (!current || current.itemId !== pool.itemId || current.kind !== pool.kind || current.value < offer.cost) throw new Error(text("PaymentChanged"));
    await holder.updatePool({ itemId: current.itemId, kind: current.kind, value: current.value - offer.cost });
    ensure();
    const paid = poolNamed(holder.poolSnapshot?.() ?? [], 'mana', { itemId: current.itemId });
    if (!paid || paid.itemId !== current.itemId || paid.kind !== current.kind || paid.value !== current.value - offer.cost)
      throw new Error(text('PaymentChanged'));
    await record({ recipientUuid: holder.uuid, transferred: true, cost: offer.cost, payment: "paid" });
    return holder;
  }
  return target;
}

/** Caller sends a card id, not editable injury details, for card-originated work. */
export async function injuryQueryHandler(payload = {}, { user } = {}) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) throw new Error(text("NeedGM"));
  const message = payload.messageId ? game.messages.get(payload.messageId) : null;
  if (payload.messageId && !message) throw new Error(text("MissingCard"));
  const flags = message?.flags?.["azeroth-rpg"];
  if (message && flags?.kind !== "critical") throw new Error(text("MissingCard"));
  const actor = message ? ChatMessage.getSpeakerActor(message.speaker) : await fromUuid(payload.actorUuid);
  if (!actor?.testUserPermission(user, "OWNER")) throw new Error(text("Unauthorized"));
  const args = message ? { actor, location: flags.location, band: flags.band, result: flags.result }
    : { actor, location: payload.location, band: payload.band, result: payload.result };
  const writerId = game.user.id;
  const authority = () => game.user?.isGM && game.user.id === writerId && game.users.activeGM?.id === writerId
    && actor.testUserPermission(user, 'OWNER') && (!message || game.messages.get(message.id) === message);
  const run = async () => {
    if (!authority()) throw new Error(text('NeedGM'));
    const previous = message?.getFlag("azeroth-rpg", FLAG);
    if (previous?.state === "done") return previous.recipientUuid;
    if (previous) throw new Error(text("Interrupted"));
    const claimId = foundry.utils.randomID();
    let claimed = false;
    const ensure = () => {
      if (!authority()) throw new Error(text('NeedGM'));
      if (message && claimed && message.getFlag('azeroth-rpg', FLAG)?.claimId !== claimId) throw new Error(text('Interrupted'));
    };
    const record = async details => {
      ensure();
      if (!message) return;
      const expected = {...message.getFlag('azeroth-rpg', FLAG), ...details, claimId, writerId};
      await message.setFlag('azeroth-rpg', FLAG, expected);
      ensure();
      const saved = message.getFlag('azeroth-rpg', FLAG);
      if (!saved || Object.entries(expected).some(([key,value]) => JSON.stringify(saved[key]) !== JSON.stringify(value)))
        throw new Error(text('Interrupted'));
      claimed = true;
    };
    const protectedAtStart = Boolean(iceBlockFor(actor));
    await record({ state: 'pending', at: Date.now() });
    const prevented = async () => {
      const held = message?.getFlag("azeroth-rpg", FLAG) ?? {};
      await record({
        ...held, state: "done", prevented: "iceBlock", recipientUuid: null, transferred: false,
        attemptedRecipientUuid: held.recipientUuid ?? null
      });
      return null;
    };
    try {
      if (protectedAtStart || iceBlockFor(actor)) return await prevented();
      const recipient = await recipientFor(actor, async details => {
        await record({ state: "pending", ...details });
      }, ensure);
      ensure();
      if (!recipient || iceBlockFor(actor) || iceBlockFor(recipient)) return await prevented();
      if (recipient.uuid === actor.uuid) await record({
        state: "pending", recipientUuid: actor.uuid, transferred: false, payment: "none"
      });
      if (iceBlockFor(actor) || iceBlockFor(recipient)) return await prevented();
      // Private callback avoids recursively offering Sacrifice on a transferred injury.
      const applied = await workflows().sufferInjury({ ...args, actor: recipient, coordinated: true });
      if (applied === null) return await prevented();
      await record({
        state: "done", recipientUuid: recipient.uuid, transferred: recipient.uuid !== actor.uuid
      });
      return recipient.uuid;
    } catch (error) {
      if (message && authority() && message.getFlag('azeroth-rpg', FLAG)?.claimId === claimId) await record({
        ...message.getFlag("azeroth-rpg", FLAG), state: "interrupted", at: Date.now()
      });
      throw error;
    }
  };
  const tracked = async () => {
    if (message) active.add(message.id);
    try { return await run(); } finally { if (message) active.delete(message.id); }
  };
  const result = queue.then(tracked, tracked);
  queue = result.catch(() => {});
  return result;
}

const reviewHere = () => game.user?.isGM && game.users.activeGM?.id === game.user.id;
const reviewActor = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const injurySnapshot = actor => actor ? structuredClone({uuid:actor.uuid,name:actor.name,health:actor.system?.health,
  pools:actor.poolSnapshot?.()??[],effects:Array.from(actor.effects??[]).map(effect=>effect.toObject()),
  combat:actor.activeFight?.()?.getCombatantsByActor?.(actor)?.map(c=>({uuid:c.uuid,budget:c.budget}))??[]}) : null;

/** Review only records a GM's manual reconciliation; it cannot replay delivery. */
export function injuryRecoveryViews(actor) {
  if (!reviewHere() || !actor) return [];
  return Array.from(game.messages?.values?.()??[]).flatMap(message=>{
    const record=message.getFlag('azeroth-rpg',FLAG);
    if(message.flags?.['azeroth-rpg']?.kind!=='critical' || !['pending','interrupted'].includes(record?.state)
      || ChatMessage.getSpeakerActor(message.speaker)?.uuid!==actor.uuid)return [];
    return [structuredClone({actorUuid:actor.uuid,messageId:message.id,record,
      target:injurySnapshot(actor),recipient:injurySnapshot(reviewActor(record.recipientUuid))})];
  });
}

export async function reviewInjuryApplication({actorUuid,expected,acknowledged=false}={}) {
  if(!reviewHere() || acknowledged!==true)return {ok:false,reason:'permission'};
  if(active.has(expected?.messageId))return {ok:false,reason:'busy'};
  const run=async()=>{
    if(!reviewHere())return {ok:false,reason:'permission'};
    const actor=reviewActor(actorUuid),message=game.messages.get(expected?.messageId);
    const current=injuryRecoveryViews(actor).find(view=>view.messageId===message?.id);
    if(!current || JSON.stringify(current)!==JSON.stringify(expected))return {ok:false,reason:'changed'};
    const record=current.record;
    if(record.state==='pending' && (!record.writerId || (record.writerId!==game.user.id&&game.users.get?.(record.writerId)?.active)))
      return {ok:false,reason:'writerActive'};
    const reviewed={...record,state:'reviewed',reviewedFrom:record.state,reviewedBy:game.user.id,reviewedAt:Date.now()};
    await message.setFlag('azeroth-rpg',FLAG,reviewed);
    if(!reviewHere() || game.messages.get(message.id)!==message || JSON.stringify(message.getFlag('azeroth-rpg',FLAG))!==JSON.stringify(reviewed))
      return {ok:false,reason:'unconfirmed'};
    return {ok:true};
  };
  const result=queue.then(run,run);queue=result.catch(()=>{});return result;
}

export async function applyInjuryOnce({ actor, messageId = null, location, band, result }) {
  const gm = game.users.activeGM;
  if (!gm) throw new Error(text("NeedGM"));
  const payload = { actorUuid: actor.uuid, messageId, location, band, result };
  const uuid = gm.id === game.user.id ? await injuryQueryHandler(payload, { user: game.user })
    : await gm.query(INJURY_QUERY, payload, { timeout: ASK_MS * 4 });
  return uuid ? fromUuid(uuid) : null;
}
