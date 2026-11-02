import { planRocketJump, rocketJumpSteps } from "./rocket-jump-plan.mjs";
import { withRocketJump } from "./rocket-jump-permission.mjs";
// Who used it, as a Use's card records it for the animation layer (the Legacy branches' door 2).
import { tokenRef } from "../rules/animation-records.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";

export const ROCKET_JUMP_QUERY = "azeroth-rpg.rocketJump";
const busy = new Set();
const scope = "azeroth-rpg";
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const position = t => ({ x: t.x, y: t.y, elevation: t.elevation, level: t.level });
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

export function rocketJumpRecoveryViews(actor){
  return [...(actor?.items??[])].flatMap(item=>{
    const receipt=item.flags?.[scope]?.rocketJump;
    if(!receipt||!['claimed','paid'].includes(receipt.phase))return [];
    const tokens=[...(game.scenes??[])].flatMap(scene=>[...scene.tokens].filter(t=>t.actor===actor)
      .map(t=>({uuid:t.uuid,...position(t)}))).sort((a,b)=>a.uuid.localeCompare(b.uuid));
    const fight=actor.activeFight?.(),combatant=fight?.getCombatantsByActor?.(actor)?.[0];
    return [{actorUuid:actor.uuid,itemUuid:item.uuid,receipt:structuredClone(receipt),uses:structuredClone(item.system.uses),
      health:structuredClone(actor.system.health),budget:combatant?structuredClone(combatant.budget):null,tokens}];
  });
}

/** Reconcile only the saved receipt, after the GM settles movement and costs. */
export async function reviewRocketJump({actorUuid,expected,acknowledged=false}={}){
  if(!gmHere()||acknowledged!==true)return {ok:false,reason:'authority'};
  const actor=await fromUuid(actorUuid),item=actor?.items.get(expected?.itemUuid?.split('.').at(-1));
  if(!actor||!item||busy.has(actor.uuid))return {ok:false,reason:'busy'};
  const current=()=>rocketJumpRecoveryViews(actor).find(row=>row.itemUuid===item.uuid);
  if(!same(current(),expected))return {ok:false,reason:'changed'};
  const old=expected.receipt,writer=game.user.id;
  if(!old.writerId||old.writerId!==writer&&game.users.get(old.writerId)?.active)return {ok:false,reason:'writerActive'};
  busy.add(actor.uuid);
  try{
    const reviewed={...old,phase:'reviewed',reviewedBy:writer,reviewedAt:Date.now()};
    await item.setFlag(scope,'rocketJump',reviewed);
    return {ok:gmHere()&&game.user.id===writer&&same(item.flags?.[scope]?.rocketJump,reviewed)};
  }catch{return {ok:false,reason:'uncertain'};}
  finally{busy.delete(actor.uuid);}
}

/** An unfinished receipt blocks replay: two documents pay for this movement. */
export async function rocketJumpHandler({ tokenUuid, itemUuid, from, to, requestId } = {}, { user } = {}) {
  const no = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.active || game.users.get(user.id) !== user
    || typeof requestId !== "string" || !requestId || requestId.length > 100) return no("authority");
  const token = await fromUuid(tokenUuid), item = await fromUuid(itemUuid), actor = token?.actor;
  if (!actor || item?.parent !== actor || !actor.testUserPermission(user,"OWNER") || busy.has(actor.uuid)) return no("ownerOrBusy");
  const scene = token.parent;
  const talent = actor.items.get(item.flags?.[scope]?.feature?.talentId);
  const clock = () => { const c=actor.activeFight?.();return c?.started ? `${c.uuid}:${c.round}:${c.turn}` : `world:${game.time.worldTime}`; };
  const initialClock = clock();
  const valid = () => gmHere() && game.users.get(user.id) === user && user.active && actor.testUserPermission(user,"OWNER")
    && game.scenes.get(scene?.id) === scene && scene.tokens.get(token.id) === token && token.actor === actor
    && actor.items.get(item.id) === item && item.type === "feature" && actor.items.get(talent?.id) === talent
    && String(talent?.system?.race).toLowerCase() === "goblin" && talent.system.identifier === "rocket-jump"
    && talent.system.taken > 0 && actor.system.health?.value > 0 && !actor.statuses?.has("stunned")
    && !realmRefusalFor(actor,"feature") && clock() === initialClock;
  if (!valid() || !same(position(token),from)) return no("changed");
  const receipt = item.flags?.[scope]?.rocketJump;
  if (receipt?.requestId === requestId || (receipt && !['complete','reviewed'].includes(receipt.phase))) return no("receipt");
  if (item.system.uses?.per !== "encounter" || !(item.system.uses.value > 0)) return no("uses");
  const { turnBudgetRefusal } = await import("../dice/workflows.mjs");
  if (busy.has(actor.uuid) || !valid() || !same(position(token),from)
    || item.flags?.[scope]?.rocketJump !== receipt) return no("changed");
  if (turnBudgetRefusal(actor,"half")) return no("action");
  const plan = planRocketJump(token,to);if (!plan.ok) return no(plan.reason);
  busy.add(actor.uuid);
  let claimed = false;
  try {
    const uses = item.system.uses.value;
    await item.setFlag(scope,"rocketJump",{requestId,phase:"claimed",tokenUuid,from,to:plan.to,clock:initialClock,writerId:game.user.id});
    claimed = true;
    const current = () => valid() && item.flags?.[scope]?.rocketJump?.requestId === requestId;
    if (!current() || !same(position(token),from) || item.system.uses.value !== uses || turnBudgetRefusal(actor,"half")) return no("review");
    const fight = actor.activeFight?.();
    const combatant = fight?.getCombatantsByActor(actor)?.find(c=>!c.tokenId || c.tokenId===token.id);
    if (fight && (!combatant || !(await combatant.spendMoveAction()).ok)) return no("review");
    if (!current() || !same(position(token),from) || item.system.uses.value !== uses) return no("review");
    await item.update({"system.uses.value":uses-1,[`flags.${scope}.rocketJump.phase`]:"paid"});
    if (!current()||item.system.uses.value!==uses-1||item.flags[scope].rocketJump.phase!=='paid') return no("review");
    const checked = planRocketJump(token,to);
    if (!checked.ok || !same(checked.to,plan.to) || !same(position(token),from)) return no("review");
    const moved = await withRocketJump({token,to:plan.to,valid:current,
      run:()=>token.move({...plan.to,elevation:token.elevation,level:token.level,action:"walk"})});
    if (!current()) return no("review");
    // **WHO JUMPED, WHICH FEATURE, AND THE MOVE IT MADE** (the B8a2 pass; the records every
    // Use's card carries, `rules/animation-records.mjs`): the goblin's token, the feature's key,
    // no Casting Test, and the move a COMPLETED jump made - its take-off and its landing off the
    // plan judged here, never off the token, whose document is interpolated while it travels
    // (D-669). A jump that stopped records no move, so its row draws nothing.
    const jumpSource = tokenRef({sceneId:scene.id,tokenId:token.id});
    const jumpSteps = rocketJumpSteps({sceneId:scene.id,tokenId:token.id,from,to:plan.to,width:token.width,height:token.height,
      sizeX:scene.grid?.sizeX ?? scene.grid?.size,sizeY:scene.grid?.sizeY ?? scene.grid?.size,moved:moved===true});
    const message = await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),
      content:`<p>${foundry.utils.escapeHTML(game.i18n.format(moved ? "AZEROTH.RocketJump.Done" : "AZEROTH.RocketJump.Stopped",{name:actor.name}))}</p>`,
      flags:{[scope]:{
        kind: "feature", itemId: item.id, actorUuid: actor.uuid,
        source: jumpSource ?? null,
        featureKey: "rocket-jump",
        casting: false,
        ...(jumpSteps.length ? { steps: jumpSteps } : {})
      }}});
    if (!current() || !message?.id) return no("review");
    await item.update({[`flags.${scope}.rocketJump.phase`] : "complete",[`flags.${scope}.rocketJump.messageId`]:message.id});
    if(!current()||item.flags[scope].rocketJump.phase!=='complete'||item.flags[scope].rocketJump.messageId!==message.id)return no('review');
    return {ok:true,moved:moved===true,messageUuid:message.uuid};
  } catch(error) {
    console.warn("azeroth-rpg | Rocket Jump",error);
    return no(claimed ? "review" : "writeUncertain");
  } finally { busy.delete(actor.uuid); }
}

export async function requestRocketJump(actor,item,source) {
  const gm=game.users?.activeGM;
  const token=source?.sceneId && source?.tokenId ? game.scenes.get(source.sceneId)?.tokens.get(source.tokenId) : null;
  if (!gm || !token || token.actor!==actor || !actor.isOwner) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.RocketJump.Source"));return null;
  }
  const from=position(token);
  const {pickPoint}=await import("../canvas/place.mjs");
  let to=null;
  const picked=await pickPoint({sceneId:token.parent.id,hint:game.i18n.localize("AZEROTH.RocketJump.Pick"),accept:point=>{
    const judged=planRocketJump(token,{x:point.x-token.width*token.parent.grid.size/2,y:point.y-token.height*token.parent.grid.size/2});
    if(!judged.ok){ui.notifications?.warn(game.i18n.localize("AZEROTH.RocketJump.Destination"));return false;}
    to=judged.to;return true;
  }});
  if(!picked || !to)return null;
  const payload={tokenUuid:token.uuid,itemUuid:item.uuid,from,to,requestId:foundry.utils.randomID()};
  try {
    const result=gmHere() ? await rocketJumpHandler(payload,{user:game.user}) : await gm.query(ROCKET_JUMP_QUERY,payload,{timeout:60000});
    if(!result?.ok){ui.notifications?.warn(game.i18n.localize("AZEROTH.RocketJump.Refused"));return null;}
    return result.messageUuid ? fromUuid(result.messageUuid) : null;
  }catch{ui.notifications?.warn(game.i18n.localize("AZEROTH.RocketJump.Refused"));return null;}
}
