import {payWeaponReload} from "./reload-payment.mjs";
import {reviewWeaponReload} from "./reload-review.mjs";

export const RELOAD_QUERY = "azeroth-rpg.reloadWeapon";
export const RELOAD_REVIEW_QUERY = "azeroth-rpg.reviewWeaponReload";

async function weaponFor(uuid, resolve) {
  if (typeof uuid !== "string" || !uuid) return null;
  const weapon = await resolve(uuid);
  const actor = weapon?.parent;
  return weapon?.type === "weapon" && actor?.items?.get(weapon.id) === weapon ? weapon : null;
}

export async function reloadQueryHandler({weaponUuid,expected} = {}, {user} = {}, deps = {}) {
  try {
    const weapon = await weaponFor(weaponUuid,deps.fromUuid ?? globalThis.fromUuid);
    if (!weapon) return {ok:false,reason:"invalid"};
    const pay = deps.pay ?? (async (actor,action) => {
      const {spendTurnBudget} = await import("../dice/workflows.mjs");
      return spendTurnBudget(actor,action);
    });
    return await payWeaponReload({actor:weapon.parent,weaponId:weapon.id,expected,user},{...deps,pay});
  } catch {return {ok:false,reason:"pending"};}
}

export async function reloadReviewQueryHandler({weaponUuid,expected,acknowledged,paid,fired} = {}, {user} = {}, deps = {}) {
  try {
    const weapon = await weaponFor(weaponUuid,deps.fromUuid ?? globalThis.fromUuid);
    if (!weapon) return {ok:false,reason:"invalid"};
    return await reviewWeaponReload({actor:weapon.parent,weaponId:weapon.id,expected,user,acknowledged,paid,fired},deps);
  } catch {return {ok:false,reason:"pending"};}
}

/** Payload contains document identity and the displayed state, never a cost or
 * permission supplied by the player. Query context authenticates the requester.
 */
export async function requestWeaponReload(weapon,expected,{game = globalThis.game} = {}) {
  const gm = game?.users?.activeGM;
  if (!gm || !weapon?.isOwner) return {ok:false,reason:"permission"};
  const data = {weaponUuid:weapon.uuid,expected};
  try {
    return gm === game.user ? await reloadQueryHandler(data,{user:game.user})
      : await gm.query(RELOAD_QUERY,data,{timeout:15000});
  } catch {return {ok:false,reason:"pending"};}
}

export async function requestWeaponReloadReview(weapon,expected,decision,{game = globalThis.game} = {}) {
  const gm = game?.users?.activeGM;
  if (!gm || !game.user?.isGM) return {ok:false,reason:"permission"};
  const data = {weaponUuid:weapon.uuid,expected,acknowledged:decision?.acknowledged === true,
    paid:decision?.paid,fired:decision?.fired};
  try {
    return gm === game.user ? await reloadReviewQueryHandler(data,{user:game.user})
      : await gm.query(RELOAD_REVIEW_QUERY,data,{timeout:15000});
  } catch {return {ok:false,reason:"pending"};}
}
