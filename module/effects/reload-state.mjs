import {reloadCost, reloadRemaining} from "../rules/reload.mjs";

export const RELOAD_FLAG = "reload";

/** Resolve the live embedded weapon, never trust a dialog's trait/talent snapshot.
 * Keep this read-only: firing and reloading must share an authoritative lock.
 */
export function weaponReloadState(actor, weaponId) {
  const weapon = actor?.items?.get?.(weaponId);
  if (!weapon || weapon.type !== "weapon" || weapon.parent !== actor) return null;
  const gunDrill = Array.from(actor.items ?? []).some(item => item.type === "talent"
    && item.system?.identifier === "gun-drill"
    && String(item.system?.race ?? "").toLowerCase() === "dwarf"
    && Number(item.system?.taken) > 0);
  const cost = reloadCost(weapon.system?.traits ?? [], {gunDrill});
  const state = weapon.flags?.["azeroth-rpg"]?.[RELOAD_FLAG] ?? null;
  const remaining = reloadRemaining(cost, state);
  return {weapon, cost, state, remaining, gunDrill};
}
