import {fireReloadWeapon} from "./reload-firing.mjs";
import {RELOAD_PAYMENT,withReloadLock} from "./reload-payment.mjs";
import {RELOAD_FLAG,weaponReloadState} from "./reload-state.mjs";
import {reloadAfterShot} from "../rules/reload.mjs";

export const RESERVE_SHOT_QUERY="azeroth-rpg.reserveReloadShot";
export const FINISH_SHOT_QUERY="azeroth-rpg.finishReloadShot";
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export async function reserveReloadShotHandler({weaponUuid,expected}={}, {user}={},deps={}) {
  try {
    const weapon=await (deps.fromUuid ?? globalThis.fromUuid)(weaponUuid);
    if (!weapon?.parent || weapon.type!=="weapon") return {ok:false,reason:"invalid"};
    return await fireReloadWeapon({actor:weapon.parent,weaponId:weapon.id,expected,user,reserveOnly:true},deps);
  } catch {return {ok:false,reason:"pending"};}
}

/** Complete a reserved shot from its real attack card, or release a confirmed
 * prepayment refusal. Unknown payment/roll outcomes must never call cancellation.
 */
export async function finishReloadShotHandler({weaponUuid,reservation,messageUuid,cancel=false}={}, {user}={},deps={}) {
  const game=deps.game ?? globalThis.game;
  const resolve=deps.fromUuid ?? globalThis.fromUuid;
  const authorized=actor=>game?.user?.isGM && game.users?.activeGM===game.user
    && user?.active && game.users.get(user.id)===user && actor?.testUserPermission(user,"OWNER");
  try {
    const weapon=await resolve(weaponUuid),actor=weapon?.parent;
    if (!authorized(actor) || weaponReloadState(actor,weapon.id)?.weapon!==weapon) return {ok:false,reason:"invalid"};
    return await withReloadLock(weapon,async()=>{
      const unchanged=()=>authorized(actor) && weaponReloadState(actor,weapon.id)?.weapon===weapon
        && same(weapon.getFlag("azeroth-rpg",RELOAD_PAYMENT),reservation)
        && same(weaponReloadState(actor,weapon.id)?.state,reservation?.state);
      if (!unchanged() || reservation?.stage!=="firing" || reservation.version!==1
        || reservation.userId!==user.id) return {ok:false,reason:"changed"};
      const state=reloadAfterShot(reservation.shotId);
      if (!state) return {ok:false,reason:"invalid"};
      let message=null;
      if (cancel!==true) {
        message=await resolve(messageUuid);
        const flags=message?.flags?.["azeroth-rpg"];
        const speaker=(deps.speakerActor ?? (m=>globalThis.ChatMessage.getSpeakerActor(m.speaker)))(message);
        if (!message || game.messages?.get(message.id)!==message || message.author?.id!==user.id
          || speaker!==actor || flags?.kind!=="attack" || flags.parry
          || flags.reloadShot?.shotId!==reservation.shotId || flags.reloadShot?.weaponUuid!==weapon.uuid)
          return {ok:false,reason:"invalid"};
      }
      if (!unchanged()) return {ok:false,reason:"changed"};
      const completed={...reservation,stage:cancel===true ? "refused" : "fired",
        ...(message ? {messageUuid:message.uuid} : {})};
      await weapon.update({
        [`flags.azeroth-rpg.${RELOAD_FLAG}`]:cancel===true ? reservation.state : state,
        [`flags.azeroth-rpg.${RELOAD_PAYMENT}`]:completed
      });
      return same(weapon.getFlag("azeroth-rpg",RELOAD_PAYMENT),completed) ? {ok:true} : {ok:false,reason:"pending"};
    });
  } catch {return {ok:false,reason:"pending"};}
}

export async function requestReloadShot(weapon,data,finish=false) {
  const gm=game.users?.activeGM;
  if (!gm || !weapon?.isOwner) return {ok:false,reason:"permission"};
  const payload={weaponUuid:weapon.uuid,...data};
  try {
    return gm===game.user
      ? await (finish ? finishReloadShotHandler : reserveReloadShotHandler)(payload,{user:game.user})
      : await gm.query(finish ? FINISH_SHOT_QUERY : RESERVE_SHOT_QUERY,payload,{timeout:15000});
  } catch {return {ok:false,reason:"pending"};}
}
