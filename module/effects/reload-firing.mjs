import {RELOAD_PAYMENT, withReloadLock} from "./reload-payment.mjs";
import {RELOAD_FLAG, weaponReloadState} from "./reload-state.mjs";
import {reloadAfterShot} from "../rules/reload.mjs";

const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

/** Internal authoritative shot coordinator. `fire` must return {fired:true}
 * only after a confirmed shot, or {fired:false} only before any expenditure.
 * All other outcomes are uncertain and retain the claim for GM review.
 * The callback is server-side code, never a function supplied through a query.
 */
export async function fireReloadWeapon({actor,weaponId,expected,user,reserveOnly = false} = {}, {
  game = globalThis.game, resolve = globalThis.fromUuidSync,
  id = () => globalThis.crypto.randomUUID(), fire
} = {}) {
  const authorized = () => game?.user?.isGM && game.users?.activeGM === game.user
    && user?.active && game.users.get(user.id) === user
    && resolve?.(actor?.uuid) === actor && actor.testUserPermission(user,"OWNER");
  if (!authorized() || (!reserveOnly && typeof fire !== "function")) return {ok:false,reason:"invalid"};
  const first = weaponReloadState(actor,weaponId);
  if (!first || first.cost === null || first.remaining === null) return {ok:false,reason:"invalid"};
  const weapon = first.weapon;
  return withReloadLock(weapon,async()=>{
    const current = weaponReloadState(actor,weaponId);
    if (!authorized() || current?.weapon !== weapon || !same(current.state,expected))
      return {ok:false,reason:"changed"};
    if (current.remaining !== 0) return {ok:false,reason:"unloaded"};
    const previous = weapon.getFlag("azeroth-rpg",RELOAD_PAYMENT);
    if (previous && (previous.version !== 1 || !["paid","fired","refused","reviewed"].includes(previous.stage)))
      return {ok:false,reason:"pending"};
    const next = reloadAfterShot(id());
    if (!next || next.shotId === current.state?.shotId) return {ok:false,reason:"invalid"};
    const claim = {...previous,version:1,stage:"firing",writerId:game.user.id,userId:user.id,
      state:structuredClone(current.state),shotId:next.shotId};
    const unchanged = () => authorized()
      && weaponReloadState(actor,weaponId)?.weapon === weapon
      && same(weaponReloadState(actor,weaponId)?.state,claim.state)
      && same(weapon.getFlag("azeroth-rpg",RELOAD_PAYMENT),claim);
    try {
      await weapon.setFlag("azeroth-rpg",RELOAD_PAYMENT,claim);
      if (!unchanged()) return {ok:false,reason:"pending"};
      if (reserveOnly) return {ok:true,reservation:claim};
      const result = await fire({actor,weapon,shotId:next.shotId});
      if (!unchanged()) return {ok:false,reason:"pending"};
      if (result?.fired === false) {
        await weapon.setFlag("azeroth-rpg",RELOAD_PAYMENT,{...claim,stage:"refused"});
        return {ok:false,reason:"refused"};
      }
      if (result?.fired !== true) return {ok:false,reason:"pending"};
      const completed = {...claim,stage:"fired"};
      await weapon.update({
        [`flags.azeroth-rpg.${RELOAD_FLAG}`]:next,
        [`flags.azeroth-rpg.${RELOAD_PAYMENT}`]:completed
      });
      return authorized() && weaponReloadState(actor,weaponId)?.weapon === weapon
        && same(weaponReloadState(actor,weaponId)?.state,next)
        && same(weapon.getFlag("azeroth-rpg",RELOAD_PAYMENT),completed)
        ? {ok:true,result} : {ok:false,reason:"pending"};
    } catch {return {ok:false,reason:"pending"};}
  });
}
