import {weaponReloadState, RELOAD_FLAG} from "./reload-state.mjs";
import {reloadAfterPayment} from "../rules/reload.mjs";
import {dispersionRefusal} from "../rules/dispersion.mjs";

export const RELOAD_PAYMENT = "reloadPayment";
const busy = new Set();
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

/** Shared with firing: only the active GM may enter this document lock. */
export async function withReloadLock(weapon, operation) {
  if (!weapon?.uuid || busy.has(weapon.uuid)) return {ok:false,reason:"busy"};
  busy.add(weapon.uuid);
  try { return await operation(); }
  finally { busy.delete(weapon.uuid); }
}

/** Internal until firing and sheet controls share this coordinator. The caller
 * supplies the state it displayed; a second click cannot pay against new state.
 * The payment callback must return strict false only for confirmed nonpayment.
 */
export async function payWeaponReload({actor, weaponId, expected, user} = {}, {
  game = globalThis.game, resolve = globalThis.fromUuidSync, pay
} = {}) {
  const authorized = () => game?.user?.isGM && game.users?.activeGM === game.user
    && user?.active && game.users.get(user.id) === user
    && resolve?.(actor?.uuid) === actor && actor.testUserPermission(user,"OWNER");
  if (!authorized() || typeof pay !== "function") return {ok:false,reason:"invalid"};
  if (dispersionRefusal(actor,"gear")) return {ok:false,reason:"dispersion"};
  const first = weaponReloadState(actor,weaponId);
  if (!first || first.remaining === null) return {ok:false,reason:"invalid"};
  const weapon = first.weapon;
  return withReloadLock(weapon, async () => {
    if (dispersionRefusal(actor,"gear")) return {ok:false,reason:"dispersion"};
    const current = weaponReloadState(actor,weaponId);
    if (!authorized() || current?.weapon !== weapon || !same(current.state,expected))
      return {ok:false,reason:"changed"};
    if (!current.remaining) return {ok:false,reason:"loaded"};
    const previous = weapon.getFlag("azeroth-rpg",RELOAD_PAYMENT);
    if (previous && (previous.version !== 1 || !["paid","fired","refused","reviewed"].includes(previous.stage)))
      return {ok:false,reason:"pending"};
    // Foundry merges flag objects; retain prior fields so the expected receipt
    // matches the persisted object instead of mistaking retained fields for a race.
    const claim = {...previous,version:1,stage:"paying",writerId:game.user.id,
      state:structuredClone(current.state),cost:current.cost};
    const unchanged = () => authorized() && !dispersionRefusal(actor,"gear")
      && weaponReloadState(actor,weaponId)?.weapon === weapon
      && same(weaponReloadState(actor,weaponId)?.state,claim.state)
      && same(weapon.getFlag("azeroth-rpg",RELOAD_PAYMENT),claim);
    try {
      await weapon.setFlag("azeroth-rpg",RELOAD_PAYMENT,claim);
      if (!unchanged()) return {ok:false,reason:"pending"};
      const paid = await pay(actor,"half");
      if (!unchanged()) return {ok:false,reason:"pending"};
      if (paid === false) {
        await weapon.setFlag("azeroth-rpg",RELOAD_PAYMENT,{...claim,stage:"refused"});
        return {ok:false,reason:"unpaid"};
      }
      if (paid !== true) return {ok:false,reason:"pending"};
      const next = reloadAfterPayment(claim.cost,claim.state);
      if (!next) return {ok:false,reason:"pending"};
      // One update closes the receipt and records the paid Half-Action.
      await weapon.update({
        [`flags.azeroth-rpg.${RELOAD_FLAG}`]:next,
        [`flags.azeroth-rpg.${RELOAD_PAYMENT}`]:{...claim,stage:"paid"}
      });
      return authorized() && weaponReloadState(actor,weaponId)?.weapon === weapon
        && same(weaponReloadState(actor,weaponId)?.state,next)
        && weapon.getFlag("azeroth-rpg",RELOAD_PAYMENT)?.stage === "paid"
        ? {ok:true,remaining:weaponReloadState(actor,weaponId).remaining}
        : {ok:false,reason:"pending"};
    } catch { return {ok:false,reason:"pending"}; }
  });
}
