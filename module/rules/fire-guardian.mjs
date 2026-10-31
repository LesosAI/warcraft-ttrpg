import { stoneGuardianPlan, stoneGuardianClaim, confirmStoneGuardian,
  reconcileStoneGuardian } from "./stone-guardian.mjs";

export const FIRE_GUARDIAN = Object.freeze({
  ability: "Summon Fire Elemental", entry: "Fire Elemental", flag: "fireGuardian"
});
const matches = record => record?.entry === FIRE_GUARDIAN.entry;
const refuse = () => ({ ok: false, reason: "species", action: null });

export function fireGuardianPlan(options = {}) {
  if ((options.record && !matches(options.record)) || (options.token && !matches(options.token))) return refuse();
  const plan = stoneGuardianPlan(options);
  return plan.ok && plan.action === "create" ? { ...plan, entry: FIRE_GUARDIAN.entry } : plan;
}

export function fireGuardianClaim(ownerUuid, cast) {
  const claim = stoneGuardianClaim(ownerUuid, cast);
  return claim ? { ...claim, entry: FIRE_GUARDIAN.entry } : null;
}

export function confirmFireGuardian(record, token) {
  return matches(record) && matches(token) ? confirmStoneGuardian(record, token) : null;
}

export function reconcileFireGuardian(options = {}) {
  if (!matches(options.record)) return refuse();
  if (Array.isArray(options.tokens) && options.tokens.some(token => token?.ownerUuid === options.ownerUuid && !matches(token))) return refuse();
  return reconcileStoneGuardian(options);
}
