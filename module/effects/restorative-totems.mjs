import {restorativeTotem, restorativeTotemTurnKey, restorativeTotemRefusal, restorativeTotemSelection} from "../rules/restorative-totems.mjs";
import {bondOf, worldActorOf} from "../documents/bound.mjs";
import {feetApart} from "../canvas/footprints.mjs";
import {projectionRefusal} from "../rules/image-projection.mjs";
import {realmRefusalFor,realmStateFor} from "./spirit-realm.mjs";
import {iceBlockFor} from "../rules/ice-block.mjs";
// The scenes a fight stands on (O-294): core makes a fight unlinked, so `combat.scene` is null at the table.
import {fightOnScene} from "../rules/fight-scenes.mjs";

export const RESTORATIVE_TOTEM_QUERY = "azeroth-rpg.restorativeTotem";
export const RESTORATIVE_TOTEM_FLAG = "restorativeTotemUses";
let queue = Promise.resolve();
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const gmHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const physical = actor => actor && !iceBlockFor(actor) && !projectionRefusal(actor, "ability") && !realmRefusalFor(actor, "ability");
const owns = (actor,user) => Boolean(user?.isGM || actor?.testUserPermission?.(user,"OWNER"));
const position = token => JSON.stringify([token?.x,token?.y,token?.elevation,token?._source?.level]);
const poolsOf = actor => (actor?.poolSnapshot?.() ?? []).filter(p => p.kind === "power" && (actor.type === "npc" || p.name === "mana"));
const poolId = pool => pool.itemId ?? "npc";

/** Read choices from live source-scene documents. No amounts or ranks supplied
 * by a player are trusted. Also used by the forthcoming turn-offer UI. */
export function restorativeTotemContext({combatId,round,turn,sourceUuid} = {}, user = game.user) {
  const combat = game.combats.get(combatId), source = fromUuidSync(sourceUuid ?? "");
  const current = combat?.combatant, token = current?.token;
  const refuse = reason => ({ok:false,reason});
  if (!combat?.started || combat.round !== round || combat.turn !== turn || !token?.actor) return refuse("turn");
  if (source?.documentName !== "Token" || source.parent?.tokens?.get(source.id) !== source || !source.actor) return refuse("source");
  if (source.parent !== token.parent || !fightOnScene(combat, source.parent, game.scenes)) return refuse("scene");
  const bond = bondOf(source.actor), owner = bond?.ownerUuid ? fromUuidSync(bond.ownerUuid) : null;
  const restoration = restorativeTotem(bond,owner?.takenTalents?.() ?? []);
  if (!owner || !restoration || !physical(source.actor)) return refuse("source");
  if (!owns(restoration.trigger === "owner" ? owner : current.actor,user)) return refuse("permission");
  const sourceFacts = {sceneId:source.parent.id,health:source.actor.system?.health?.value,
    defeated:combat.combatants?.some(c=>c.token?.uuid===source.uuid&&c.defeated) === true};
  const currentFacts = {sceneId:token.parent.id,actorUuid:worldActorOf(current.actor)?.uuid,tokenUuid:token.uuid};
  const offered = [], actors = new Set();
  for (const target of source.parent.tokens.values()) {
    const actor = target.actor;
    // An inability to act (for example a projecting caster's physical body)
    // does not prevent receiving recovery. Spirits are outside this scene's
    // physical restoration; the actor API handles ordinary healing restrictions.
    if (!actor || realmStateFor(actor).in) continue;
    if (restoration.trigger === "recipient" && target.uuid !== token.uuid) continue;
    const level = source._source?.level;
    let refusal = level !== target._source?.level || !source.parent.levels?.has(level) ? "level" : null;
    if (iceBlockFor(actor)) refusal = "iceBlock";
    refusal ??= restorativeTotemRefusal({restoration,source:sourceFacts,current:currentFacts,
      target:{sceneId:target.parent.id,tokenUuid:target.uuid},distance:feetApart(source,target)});
    const pools = restoration.resource === "mana" ? poolsOf(actor) : [];
    if (restoration.resource === "mana" && !pools.length) refusal ??= "pool";
    // Linked copies are one Health pool. Prefer an in-range copy and never
    // offer the same actor twice as two Healing Stream targets.
    const prior = offered.find(row=>row.actor===actor);
    const row = {id:target.uuid,name:target.name,token:target,actor,refusal,pools};
    if (actors.has(actor.uuid)) {
      if (prior?.refusal && !refusal) offered.splice(offered.indexOf(prior),1,row);
      continue;
    }
    actors.add(actor.uuid);offered.push(row);
  }
  return {ok:true,combat,source,owner,current,restoration,offered,
    key:restorativeTotemTurnKey({combatId,round,turn,sourceUuid})};
}

/** Serialize claims on the active GM. A pending receipt never auto-replays. */
export async function restorativeTotemQueryHandler(payload = {}, {user = game.user} = {}) {
  const run = async () => {
    const refuse = reason => ({ok:false,reason});
    if (!gmHere()) return refuse("authority");
    if (payload.operation === "review") {
      if (!user?.isGM || payload.acknowledged !== true) return refuse("permission");
      const combat=game.combats.get(payload.combatId);
      const records=combat?.getFlag("azeroth-rpg",RESTORATIVE_TOTEM_FLAG);
      const receipt=Array.isArray(records)?records.find(row=>row.key===payload.key):null;
      if (!receipt) return refuse("record");
      if (["done","reviewed"].includes(receipt.stage)) return {ok:true,already:true,receipt};
      if (!same(receipt,payload.expected)) return refuse("changed");
      const reviewed={...receipt,stage:"reviewed",reviewedBy:user.id,reviewedAt:Date.now()};
      const next=records.map(row=>row.key===receipt.key?reviewed:row);
      try {
        await combat.setFlag("azeroth-rpg",RESTORATIVE_TOTEM_FLAG,next);
        if (!same(combat.getFlag("azeroth-rpg",RESTORATIVE_TOTEM_FLAG),next)) return refuse("writeUncertain");
        return {ok:true,receipt:reviewed};
      } catch {return refuse("writeUncertain");}
    }
    const context = restorativeTotemContext(payload,user);
    if (!context.ok) return context;
    const {combat,source,owner,restoration,key} = context;
    const selected = restorativeTotemSelection(restoration,context.offered,payload.targets);
    if (!selected.ok) return refuse(selected.reason);
    const plans = selected.targets.map(row => {
      const pool = restoration.resource === "mana" ? row.pools.find(p=>poolId(p)===payload.pool) : null;
      return {...row,pool,position:position(row.token)};
    });
    if (restoration.resource === "mana" && plans.some(row=>!row.pool)) return refuse("pool");
    let expected = structuredClone(combat.getFlag("azeroth-rpg",RESTORATIVE_TOTEM_FLAG) ?? []);
    if (!Array.isArray(expected)) return refuse("record");
    const prior = expected.find(row=>row.key===key);
    if (prior) return ["done","reviewed"].includes(prior.stage) ? {ok:true,already:true,receipt:prior} : refuse("reconcile");
    const sourcePosition = position(source);
    const unchanged = () => {
      if (!gmHere() || !same(combat.getFlag("azeroth-rpg",RESTORATIVE_TOTEM_FLAG) ?? [],expected)) return false;
      const now = restorativeTotemContext(payload,user);
      return now.ok && now.combat===combat && now.source===source && now.owner===owner
        && same(now.restoration,restoration) && position(source)===sourcePosition
        && plans.every(row=>now.offered.some(next=>next.id===row.id && next.actor===row.actor && !next.refusal
          && position(next.token)===row.position && (!row.pool || next.pools.some(p=>poolId(p)===poolId(row.pool)))));
    };
    const save = async next => {
      if (!unchanged()) throw Error("Totem restoration changed");
      await combat.setFlag("azeroth-rpg",RESTORATIVE_TOTEM_FLAG,next);
      if (!same(combat.getFlag("azeroth-rpg",RESTORATIVE_TOTEM_FLAG),next)) throw Error("Totem restoration receipt unconfirmed");
      expected = next;
    };
    let receipt = {key,stage:"pending",name:restoration.name,resource:restoration.resource,amount:restoration.amount,
      ownerUuid:owner.uuid,targets:plans.map(row=>({tokenUuid:row.id,actorUuid:row.actor.uuid,stage:"pending"}))};
    try {
      await save([...expected,receipt]);
      for (const row of plans) {
        if (!unchanged()) return refuse("changed");
        receipt = {...receipt,targets:receipt.targets.map(t=>t.tokenUuid===row.id?{...t,stage:"applying"}:t)};
        await save(expected.map(r=>r.key===key?receipt:r));
        if (!unchanged()) return refuse("changed");
        // The claim write yields: another action may change Health/Mana meanwhile.
        // Read immediately before restoration, not before awaiting that write.
        const before = restoration.resource === "health" ? row.actor.system.health.value
          : poolsOf(row.actor).find(p=>poolId(p)===poolId(row.pool))?.value;
        if (restoration.resource === "health") await row.actor.applyHealing(restoration.amount,{from:owner,feature:true,featureName:restoration.name});
        else await row.actor.updatePool({itemId:row.pool.itemId,kind:row.pool.kind,value:before+restoration.amount});
        const after = restoration.resource === "health" ? row.actor.system.health.value
          : poolsOf(row.actor).find(p=>poolId(p)===poolId(row.pool))?.value;
        // Combat flags are shared with players. Record the amount recovered,
        // not another creature's private current Health or Mana values.
        receipt = {...receipt,targets:receipt.targets.map(t=>t.tokenUuid===row.id?{...t,restored:Math.max(0,after-before),stage:"done"}:t)};
        await save(expected.map(r=>r.key===key?receipt:r));
      }
      receipt = {...receipt,stage:"done"};await save(expected.map(r=>r.key===key?receipt:r));
      return {ok:true,receipt};
    } catch { return refuse("writeUncertain"); }
  };
  const result = queue.then(run,run);queue = result.catch(()=>{});
  const outcome=await result;
  const combat=game.combats.get(payload.combatId);
  const key=payload.operation==="review"?payload.key:restorativeTotemTurnKey(payload);
  if (gmHere() && combat && key) {
    try {await (await import("./restorative-totem-offers.mjs")).refreshRestorativeTotemCards(combat,key);}
    catch {outcome.feedbackError=true;}
  }
  return outcome;
}

export async function requestRestorativeTotem(payload) {
  const gm = game.users?.activeGM;
  if (!gm) return {ok:false,reason:"authority"};
  if (gm.id === game.user.id) return restorativeTotemQueryHandler(payload,{user:game.user});
  try { return await gm.query(RESTORATIVE_TOTEM_QUERY,payload,{timeout:15000}); }
  catch { return {ok:false,reason:"writeUncertain"}; }
}
