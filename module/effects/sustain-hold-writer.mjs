import { suspendSustainTransferEntry } from "../rules/sustain-entry-transfer.mjs";
import { suspendSustainTransferEffect } from "../rules/sustain-transfer-suspension.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";
import { dispersionFor } from "../rules/dispersion.mjs";
import { hasTransferCarrierPlan } from "../rules/sustain-record-carrier.mjs";
import { sustainRegionStagePlans } from '../rules/sustain-region-stage-plans.mjs';
import { writeSustainRegionHold } from './sustain-region-hold-writer.mjs';

const scope = "azeroth-rpg";
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).filter(key => key !== "_stats").sort().map(key => [key, stable(value[key])])) : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const snapshot = effect => ({ ...effect.toObject(), uuid: effect.uuid, parentUuid: effect.parent.uuid });

/** Internal hold stage. The coordinator owns the durable claim and serialization.
 * Capacity replacement needs its own durable ending stage; refuse it here rather
 * than removing an existing spell without tracking its effects and upkeep. */
export async function writeSustainTransferHolds({ plan, receipt, validate } = {}) {
  const regionPlan = plan?.inventory?.regions?.length || plan?.regionTransfers?.length
    ? sustainRegionStagePlans(plan) : {ok:true,regions:[]};
  if (typeof validate !== "function" || receipt?.version !== 1 || receipt.state !== "claimed"
    || receipt.attempted !== "holdRecipient" || !same(receipt.completed, [])
    || !["casterUuid", "recipientUuid", "cast", "transactionId"].every(key => typeof plan?.[key] === "string"
      && plan[key].length > 0 && receipt[key] === plan[key]) || plan.casterUuid === plan.recipientUuid
    || !plan.inventory?.ok || !plan.capacity?.ok || !Array.isArray(plan.capacity.retained)
    || !Array.isArray(plan.capacity.dropped) || plan.capacity.dropped.length
    || !Array.isArray(plan.inventory.effects) || (!plan.inventory.effects.length && !hasTransferCarrierPlan(plan) && !regionPlan.regions?.length)
    || !Array.isArray(plan.inventory.regions) || !regionPlan.ok
    || plan.inventory.casterUuid !== plan.casterUuid || plan.inventory.cast !== plan.cast
    || plan.recipientEntry?.cast !== plan.cast) throw Error("Invalid transfer hold plan");
  plan = structuredClone(plan); receipt = structuredClone(receipt);
  const actors = [plan.casterUuid, plan.recipientUuid].map(uuid => fromUuidSync(uuid));
  if (actors.some((actor, index) => actor?.documentName !== "Actor" || actor.uuid !== [plan.casterUuid, plan.recipientUuid][index])) {
    throw Error("Missing transfer participant");
  }
  const lists = actors.map(actor => structuredClone(actor.getFlag(scope, "sustaining") ?? []));
  if (!lists.every(Array.isArray) || !same(lists[1], plan.capacity.retained)
    || lists[0].filter(entry => entry.cast === plan.cast).length !== 1
    || !same(lists[0].find(entry => entry.cast === plan.cast), plan.inventory.entry)) throw Error("Transfer hold changed");
  const held = [plan.inventory.entry, plan.recipientEntry].map((entry, index) =>
    suspendSustainTransferEntry({ entry, ownerUuid: actors[index].uuid, receipt }));
  if (held.some(result => !result.ok)) throw Error("Cannot suspend transfer hold");
  const effects = new Map(plan.inventory.effects.map(row => [row.uuid, row]));
  if (effects.size !== plan.inventory.effects.length) throw Error("Duplicate transfer carrier");
  const patches = new Map();
  for (const row of effects.values()) {
    const result = suspendSustainTransferEffect({ effect: row, receipt });
    if (!result.ok) throw Error("Cannot suspend transfer carrier");
    patches.set(row.uuid, result.patch);
  }
  const regions = new Map(regionPlan.regions.map(row=>[row.original.uuid,row.original]));
  const check = async (skipRegion = null) => {
    if (await validate() !== true) throw Error("Transfer claim changed");
    if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) throw Error("Transfer authority changed");
    for (const [index, actor] of actors.entries()) {
      if (fromUuidSync(actor.uuid) !== actor || iceBlockFor(actor) || dispersionFor(actor)
        || !same(actor.getFlag(scope, "sustaining") ?? [], lists[index])) throw Error("Transfer participant changed");
    }
    for (const [uuid, row] of effects) {
      const effect = fromUuidSync(uuid);
      if (effect?.documentName !== "ActiveEffect" || !same(snapshot(effect), row)) throw Error("Transfer carrier changed");
    }
    for(const [uuid,row] of regions) {
      if(uuid===skipRegion)continue;
      const region=fromUuidSync(uuid);
      if(region?.documentName!=='Region'||!same(snapshot(region),row))throw Error('Transfer Region changed');
    }
    for(const row of regionPlan.regions) if(fromUuidSync(row.destination.uuid))throw Error('Transfer Region destination occupied');
  };
  await check();
  // Mark Regions inert before changing held records. The inner writer verifies
  // its own intermediate snapshots; the outer check covers every other carrier.
  for(const row of regionPlan.regions) {
    const result=await writeSustainRegionHold({region:row.original,destinationUuid:row.destination.uuid,receipt,
      validate:async()=>{await check(row.original.uuid);return true;}});
    if(!same(result.snapshot,row.held))throw Error('Unconfirmed Region hold');
    regions.set(row.original.uuid,row.held);await check();
  }
  for (const [index, actor] of actors.entries()) {
    const next = index === 0 ? lists[0].map(entry => entry.cast === plan.cast ? held[0].entry : entry)
      : [...lists[1], held[1].entry];
    await check();
    await actor.setFlag(scope, "sustaining", next);
    lists[index] = structuredClone(next);
    await check();
  }
  for (const [uuid, patch] of patches) {
    await check();
    await fromUuidSync(uuid).update(patch);
    const row = effects.get(uuid);
    effects.set(uuid, { ...row, ...(patch.origin ? { origin: patch.origin } : {}), disabled: true, flags: { ...row.flags,
      [scope]: { ...row.flags[scope], sustainTransfer: patch[`flags.${scope}.sustainTransfer`] } } });
    await check();
  }
  return { casterEntry: held[0].entry, recipientEntry: held[1].entry, suspended: [...effects.keys(),...regions.keys()] };
}
