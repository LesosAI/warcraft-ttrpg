import {reloadCost, reloadRemaining} from "../rules/reload.mjs";
// 08 §20's Dark Iron Hands (D-911): *A dwarf firing it ignores its Reload.*
import {signatureEffects} from "../rules/signatures.mjs";

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
  // **A SIGNATURE THAT IGNORES THE WEAPON'S OWN RELOAD** (the Emperor's Thunder's Dark
  // Iron Hands; D-911): THIS weapon's descriptor alone, its gate judged on the bearer,
  // so a second gun in the other hand reloads as it always did.
  const ignores = weapon.system?.equipped === true
    && signatureEffects([weapon], actor.signatureState ?? {}, {weaponId: weapon.id}).ignoresReload === true;
  const cost = ignores ? null : reloadCost(weapon.system?.traits ?? [], {gunDrill});
  const state = weapon.flags?.["azeroth-rpg"]?.[RELOAD_FLAG] ?? null;
  const remaining = reloadRemaining(cost, state);
  return {weapon, cost, state, remaining, gunDrill};
}
