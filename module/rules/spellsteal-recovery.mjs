import { hasTransferCarrierPlan } from "./sustain-record-carrier.mjs";
import { sustainRegionStagePlans } from './sustain-region-stage-plans.mjs';

const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).filter(key => key !== "_stats").sort().map(key => [key, stable(value[key])])) : value;
export const sameSpellstealRecoveryState = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

/** A lost final acknowledgement can be certified without applying anything.
 * Confirm only the exact active destination described by the saved plan. */
export function spellstealAlreadyDelivered(view) {
  const receipt = view?.row?.delivery, plan = receipt?.plan;
  const regionPlan = plan?.inventory?.regions?.length || plan?.regionTransfers?.length
    ? sustainRegionStagePlans(plan) : {ok:true,regions:[]};
  const regionsOnly = regionPlan.ok && regionPlan.regions.length > 0 && plan?.relocation?.ok
    && Array.isArray(plan.relocation.moves) && !plan.relocation.moves.length
    && Array.isArray(plan.relocation.removals) && !plan.relocation.removals.length;
  if (receipt?.state !== "done" || receipt.attempted !== null
    || !sameSpellstealRecoveryState(receipt.completed, ["holdRecipient", "relocateCarriers", "releaseSource"])
    || !regionPlan.ok || (!hasTransferCarrierPlan(plan) && !regionsOnly) || view.survivingOriginals?.length > 0 || view.casterEntries.some(entry => entry.cast === view.cast)
    || !sameSpellstealRecoveryState(view.mageEntries.filter(entry => entry.cast === view.cast), [plan.recipientEntry])) return false;
  const destinations = plan.relocation.moves.map(move => ({ uuid: move.destination.uuid, parentUuid: plan.recipientUuid,
    ...structuredClone(move.destination.data), flags: { ...structuredClone(move.destination.data.flags),
      "azeroth-rpg": { ...structuredClone(move.destination.data.flags?.["azeroth-rpg"]), sustainTransfer: null } } }));
  const regions=regionPlan.regions.map(row=>{
    const region=structuredClone(row.destination),marker=region.flags['azeroth-rpg'].sustainRegionTransfer;
    region.restriction.enabled=marker.restrictionBefore;
    for(const behavior of region.behaviors)behavior.disabled=marker.behaviors.find(saved=>saved._id===behavior._id).disabled;
    region.flags['azeroth-rpg'].sustainRegionTransfer=null;
    return region;
  });
  const ordered=rows=>[...rows].sort((a,b)=>a.uuid.localeCompare(b.uuid));
  return sameSpellstealRecoveryState(ordered(view.effects),ordered(destinations))
    && sameSpellstealRecoveryState(ordered(view.regions ?? []),ordered(regions));
}
