import {RELOAD_PAYMENT, withReloadLock} from "./reload-payment.mjs";
import {RELOAD_FLAG, weaponReloadState} from "./reload-state.mjs";
import {reloadAfterPayment, reloadAfterShot} from "../rules/reload.mjs";

const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

/** Reconcile an interrupted payment or shot without repeating either operation.
 * The GM explicitly records whether the Half-Action was paid or the shot fired.
 */
export async function reviewWeaponReload({actor,weaponId,user,expected,
  acknowledged = false, paid, fired} = {}, {game = globalThis.game,
  resolve = globalThis.fromUuidSync, now = Date.now} = {}) {
  const authorized = () => game?.user?.isGM && game.users?.activeGM === game.user
    && user?.isGM && user.active && game.users.get(user.id) === user
    && resolve?.(actor?.uuid) === actor;
  if (!authorized() || acknowledged !== true)
    return {ok:false,reason:"invalid"};
  const first = weaponReloadState(actor,weaponId);
  if (!first) return {ok:false,reason:"invalid"};
  const weapon = first.weapon;
  return withReloadLock(weapon,async()=>{
    const current = weaponReloadState(actor,weaponId);
    const receipt = weapon.getFlag("azeroth-rpg",RELOAD_PAYMENT);
    if (!authorized() || current?.weapon !== weapon
      || !same(receipt,expected) || receipt?.version !== 1
      || !["paying","firing"].includes(receipt.stage) || typeof receipt.writerId !== "string"
      || !receipt.writerId || !same(current.state,receipt.state))
      return {ok:false,reason:"changed"};
    if (receipt.writerId !== game.user.id && game.users.get(receipt.writerId)?.active)
      return {ok:false,reason:"writerActive"};
    const isShot = receipt.stage === "firing";
    const occurred = isShot ? fired : paid;
    if (typeof occurred !== "boolean") return {ok:false,reason:"invalid"};
    const next = isShot ? reloadAfterShot(receipt.shotId) : reloadAfterPayment(receipt.cost,receipt.state);
    if (!next) return {ok:false,reason:"invalid"};
    if (isShot && receipt.shotId === receipt.state?.shotId) return {ok:false,reason:"invalid"};
    const state = occurred ? next : receipt.state;
    const reviewed = {...receipt,stage:"reviewed",previousStage:receipt.stage,
      ...(isShot ? {fired} : {paid}),reviewedBy:user.id,reviewedAt:now()};
    try {
      await weapon.update({
        [`flags.azeroth-rpg.${RELOAD_FLAG}`]:state,
        [`flags.azeroth-rpg.${RELOAD_PAYMENT}`]:reviewed
      });
      return authorized() && weaponReloadState(actor,weaponId)?.weapon === weapon
        && same(weaponReloadState(actor,weaponId)?.state,state)
        && same(weapon.getFlag("azeroth-rpg",RELOAD_PAYMENT),reviewed)
        ? {ok:true} : {ok:false,reason:"pending"};
    } catch {return {ok:false,reason:"pending"};}
  });
}
