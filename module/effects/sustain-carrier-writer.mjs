import { suspendSustainTransferEffect } from "../rules/sustain-transfer-suspension.mjs";
import { sustainEntryTransferPending } from "../rules/sustain-entry-transfer.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";
import { dispersionFor } from "../rules/dispersion.mjs";
import { hasTransferCarrierPlan } from "../rules/sustain-record-carrier.mjs";
import { sustainRegionStagePlans } from '../rules/sustain-region-stage-plans.mjs';
import { writeSustainRegionRelocation } from './sustain-region-relocation-writer.mjs';

const scope = "azeroth-rpg";
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).filter(key => key !== "_stats").sort().map(key => [key, stable(value[key])])) : value;
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const snapshot = effect => ({ ...effect.toObject(), uuid: effect.uuid, parentUuid: effect.parent.uuid });
const suspended = (data, receipt) => {
  const result = suspendSustainTransferEffect({ effect: data, receipt });
  if (!result.ok) throw Error("Invalid transfer carrier");
  return { ...structuredClone(data), ...(result.patch.origin ? { origin: result.patch.origin } : {}), disabled: true, flags: { ...structuredClone(data.flags),
    [scope]: { ...structuredClone(data.flags[scope]), sustainTransfer: result.patch[`flags.${scope}.sustainTransfer`] } } };
};

/** Internal relocation stage, not a public spell/query door. The coordinator must
 * first persist the attempted stage and suspend both held records and originals.
 * validate rechecks its durable receipt, request authority and whole-cast claim.
 * A rejected/uncertain write is never retried or rolled back here. */
export async function writeSustainTransferCarriers({ plan, receipt, validate } = {}) {
  const regionPlan = plan?.inventory?.regions?.length || plan?.regionTransfers?.length
    ? sustainRegionStagePlans(plan) : {ok:true,regions:[]};
  const regionsOnly = regionPlan.ok && regionPlan.regions.length > 0 && plan?.relocation?.ok
    && Array.isArray(plan.relocation.moves) && !plan.relocation.moves.length
    && Array.isArray(plan.relocation.removals) && !plan.relocation.removals.length;
  if (typeof validate !== "function" || receipt?.version !== 1 || receipt.state !== "claimed"
    || receipt.attempted !== "relocateCarriers" || !same(receipt.completed, ["holdRecipient"])
    || !["casterUuid", "recipientUuid", "cast", "transactionId"].every(key => typeof plan?.[key] === "string"
      && plan[key].length > 0 && receipt[key] === plan[key])
    || plan.casterUuid === plan.recipientUuid || !plan.relocation?.ok
    || !regionPlan.ok || (!hasTransferCarrierPlan(plan) && !regionsOnly)) throw Error("Invalid transfer stage");
  // Copy caller-owned inputs before the first asynchronous admission check.
  plan = structuredClone(plan); receipt = structuredClone(receipt);
  const actors = [plan.casterUuid, plan.recipientUuid].map(uuid => fromUuidSync(uuid));
  const expected = new Map();
  for (const row of [...plan.relocation.moves.map(move => move.source.expected), ...plan.relocation.removals]) {
    const data = suspended(row, receipt);
    if (expected.has(row.uuid) && !same(expected.get(row.uuid), data)) throw Error("Conflicting source snapshots");
    expected.set(row.uuid, data);
  }
  const regionRows = regionPlan.regions; // Plain relocation rows, not a Foundry Region collection.
  const regions = new Map(regionRows.flatMap(row=>[[row.original.uuid,row.held],[row.destination.uuid,null]]));
  const check = async (skipRegions = []) => {
    if (await validate() !== true) throw Error("Transfer claim changed");
    if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) throw Error("Transfer authority changed");
    for (const [index, actor] of actors.entries()) {
      const uuid = index ? plan.recipientUuid : plan.casterUuid;
      if (actor?.documentName !== "Actor" || actor.uuid !== uuid || fromUuidSync(uuid) !== actor
        || iceBlockFor(actor) || dispersionFor(actor)) throw Error("Transfer participant changed");
      const entries = (actor.getFlag(scope, "sustaining") ?? []).filter(entry => entry.cast === plan.cast);
      const entry = entries[0], marker = entry?.sustainTransfer;
      if (entries.length !== 1 || !sustainEntryTransferPending(entry, uuid) || marker.interrupted
        || marker.transactionId !== plan.transactionId || marker.casterUuid !== plan.casterUuid
        || marker.recipientUuid !== plan.recipientUuid) throw Error("Transfer hold changed");
    }
    for (const [uuid, data] of expected) {
      const effect = fromUuidSync(uuid);
      if (data === null ? effect != null : effect?.documentName !== "ActiveEffect" || !same(snapshot(effect), data)) {
        throw Error("Transfer carrier changed");
      }
    }
    for(const [uuid,data] of regions) {
      if(skipRegions.includes(uuid))continue;
      const region=fromUuidSync(uuid);
      if(data===null ? region!=null : region?.documentName!=='Region'||!same(snapshot(region),data))
        throw Error('Transfer Region changed');
    }
  };
  await check();
  for (const move of plan.relocation.moves) {
    const destination = move.destination;
    if (!move.ok || destination.parentUuid !== plan.recipientUuid
      || destination.uuid !== `${plan.recipientUuid}.ActiveEffect.${destination.id}`
      || destination.data?._id !== destination.id || destination.data.origin !== plan.recipientUuid
      || !["create", "update"].includes(destination.operation)) throw Error("Invalid destination");
    const data = suspended(destination.data, receipt);
    await check();
    if (destination.operation === "create") {
      if (fromUuidSync(destination.uuid)) throw Error("Transfer destination occupied");
      await actors[1].createEmbeddedDocuments("ActiveEffect", [data], { keepId: true });
    } else {
      if (!expected.has(destination.uuid) || move.source.uuid !== destination.uuid) throw Error("Unplanned destination update");
      await actors[1].updateEmbeddedDocuments("ActiveEffect", [data]);
    }
    expected.set(destination.uuid, { ...data, uuid: destination.uuid, parentUuid: plan.recipientUuid });
    await check();
  }
  const destinations = new Set(plan.relocation.moves.map(move => move.destination.uuid));
  for (const removal of plan.relocation.removals) {
    if (destinations.has(removal.uuid)) throw Error("Cannot remove destination");
    await check();
    const effect = fromUuidSync(removal.uuid);
    await effect.delete();
    expected.set(removal.uuid, null);
    await check();
  }
  for(const row of regionPlan.regions) {
    await check();
    const moved=await writeSustainRegionRelocation({input:{...row.input,receipt},validate:async()=>{
      await check([row.original.uuid,row.destination.uuid]);return true;
    }});
    if(!same(moved.snapshot,row.destination))throw Error('Unconfirmed Region relocation');
    regions.set(row.original.uuid,null);regions.set(row.destination.uuid,row.destination);await check();
    destinations.add(row.destination.uuid);
  }
  return { relocated: [...destinations], removed: [...plan.relocation.removals.map(row => row.uuid),...regionPlan.regions.map(row=>row.original.uuid)] };
}
