import { seductionTimedAllowance } from "../rules/seduction.mjs";
import { constructsFor, sharedAllowance } from "../rules/constructs.mjs";
import { realmStateFor } from "./spirit-realm.mjs";

export async function seductionTimedBudget(actor, spent) {
  let halfActions = null;
  if (actor.type === "npc") {
    const { bondOf } = await import("../documents/bound.mjs");
    const bond = bondOf(actor);
    if (Number.isInteger(bond?.halfActions)) halfActions = bond.halfActions;
    else if (bond?.kind === "construct" && bond.ownerUuid) {
      const owner = fromUuidSync(bond.ownerUuid);
      halfActions = sharedAllowance(constructsFor(owner?.takenTalents?.() ?? [], { tier: owner?.system?.tier ?? 1 })).halfActions;
    }
  }
  return seductionTimedAllowance({ speed: actor.system?.speed, statuses: actor.statuses,
    aquaticOnly: (actor.system?.senses ?? []).includes("aquaticOnly"), halfActions, spent,
    realm: actor.type === "character" && realmStateFor(actor).in === true });
}
