import { reactionBarEffect } from "../rules/reaction-bar.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";

export const REACTION_BAR_QUERY = "azeroth-rpg.earthShockBar";
const queues = new Map();
const words = key => game.i18n.localize(`AZEROTH.ReactionBar.${key}`);
const activeGM=()=>game.user?.isGM && game.users.activeGM?.id===game.user.id;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const identityOf=target=>({actorId:target?.actorId ?? null,sceneId:target?.sceneId ?? null,tokenId:target?.tokenId ?? null});

export function earthShockPending(card) {
  const flags=card?.flags?.['azeroth-rpg'],claim=flags?.reactionBarClaim;
  if(flags?.kind!=='spell' || flags.identifier!=='earth-shock' || flags.success!==true || flags.reactionBar!==true
    || claim?.version!==1 || !Number.isSafeInteger(claim.index) || claim.index<0 || !claim.writerId
    || flags.reactionBarPending!==claim.index || !same(identityOf(flags.targets?.[claim.index]),claim.target)
    || !Array.isArray(flags.reactionBarTargets ?? [])) return null;
  return structuredClone({claim,caster:flags.caster,done:flags.reactionBarTargets ?? []});
}

function targetOf({actorId,sceneId,tokenId}) {
  if(sceneId || tokenId) {
    if(!sceneId || !tokenId) return null;
    const token=game.scenes.get(sceneId)?.tokens.get(tokenId);
    return token?.actor && token.actor.id===actorId ? {actor:token.actor,token} : null;
  }
  const actor=game.actors.get(actorId);
  return actor ? {actor,token:null} : null;
}

export async function reactionBarQueryHandler({ messageId } = {}, { user } = {}) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) throw new Error(words("NeedGM"));
  const card = game.messages.get(messageId);
  const flags = card?.flags?.["azeroth-rpg"];
  const caster = flags?.caster ? await fromUuid(flags.caster) : null;
  if (!caster?.testUserPermission(user, "OWNER") || flags?.kind !== "spell" || flags.identifier !== "earth-shock"
    || flags.success !== true || flags.reactionBar !== true) throw new Error(words("Unauthorized"));
  const run = async () => {
    if(!activeGM() || game.messages.get(card.id)!==card) throw new Error(words('NeedGM'));
    const done = [...(card.getFlag("azeroth-rpg", "reactionBarTargets") ?? [])];
    for (const [index, target] of (flags.targets ?? []).entries()) {
      if (done.includes(index)) continue;
      const identity=identityOf(target);
      const resolved=targetOf(identity);
      if (!resolved) throw new Error(words("TargetGone"));
      const {actor,token}=resolved;
      // A server write acknowledged late can be recognized without creating a second carrier.
      const existing = [...actor.effects].some(e => e.getFlag("azeroth-rpg", "reactionBar")?.cardUuid === card.uuid);
      if (!existing && card.getFlag("azeroth-rpg", "reactionBarPending") === index) {
        throw new Error(words("Interrupted"));
      }
      const claim={version:1,index,writerId:game.user.id,target:identity};
      await card.update({'flags.azeroth-rpg.reactionBarPending':index,'flags.azeroth-rpg.reactionBarClaim':claim});
      if(!activeGM() || game.messages.get(card.id)!==card) throw new Error(words('NeedGM'));
      const current=targetOf(identity),row=card.flags?.["azeroth-rpg"]?.targets?.[index];
      if(current?.actor!==actor || current?.token!==token
        || !same(identityOf(row),identity)) throw new Error(words("TargetGone"));
      if (!existing) await actor.createEmbeddedDocuments("ActiveEffect", [reactionBarEffect({
        actorUuid: actor.uuid, cardUuid: card.uuid, timing: untilEndOfNextTurnOrRound(actor), name: words("Name")
      })]);
      if(!activeGM()) throw new Error(words('NeedGM'));
      done.push(index);
      await card.update({'flags.azeroth-rpg.reactionBarTargets':done,'flags.azeroth-rpg.reactionBarPending':null,
        'flags.azeroth-rpg.reactionBarClaim':null});
    }
    return true;
  };
  const pending = (queues.get(card.id) ?? Promise.resolve()).then(run, run);
  queues.set(card.id, pending);
  try { return await pending; } finally { if (queues.get(card.id) === pending) queues.delete(card.id); }
}

/** Active-GM acknowledgement only; never retry effects, payment or the cast. */
export async function reviewEarthShock({card,expected,acknowledged}={}) {
  if(!activeGM() || game.messages.get(card?.id)!==card) return {ok:false,reason:'permission'};
  if(acknowledged!==true) return {ok:false,reason:'acknowledgement'};
  if(queues.has(card.id)) return {ok:false,reason:'busy'};
  const snapshot=earthShockPending(card);
  if(!snapshot || !same(snapshot,expected)) return {ok:false,reason:'changed'};
  const {claim,done}=snapshot;
  if(claim.writerId!==game.user.id && game.users.get(claim.writerId)?.active) return {ok:false,reason:'writerActive'};
  const reviewed={...claim,reviewedBy:game.user.id,reviewedAt:Date.now()};
  const work=(async()=>{
    try {
      await card.update({'flags.azeroth-rpg.reactionBarTargets':[...new Set([...done,claim.index])],
        'flags.azeroth-rpg.reactionBarPending':null,'flags.azeroth-rpg.reactionBarClaim':null,
        'flags.azeroth-rpg.reactionBarReviewed':reviewed});
      return activeGM() && game.messages.get(card.id)===card
        && same(card.getFlag('azeroth-rpg','reactionBarReviewed'),reviewed)
        && card.getFlag('azeroth-rpg','reactionBarPending')===null ? {ok:true} : {ok:false,reason:'pending'};
    } catch {return {ok:false,reason:'pending'};}
  })();
  queues.set(card.id,work);
  try{return await work;} finally {if(queues.get(card.id)===work)queues.delete(card.id);}
}

export async function applyEarthShockBar(card) {
  if (!card?.getFlag?.("azeroth-rpg", "reactionBar")) return;
  const gm = game.users.activeGM;
  if (!gm) throw new Error(words("NeedGM"));
  const payload = { messageId: card.id };
  return gm.id === game.user.id ? reactionBarQueryHandler(payload, { user: game.user }) : gm.query(REACTION_BAR_QUERY, payload);
}
