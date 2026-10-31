import { stoneGuardianPlan, stoneGuardianClaim, confirmStoneGuardian,
  reconcileStoneGuardian } from "./stone-guardian.mjs";

/** Persistent NPC companions, not the player's Bound Demon progression.
 * The concrete ability controls the species; a held choice cannot be changed
 * by requesting another summon. Dismissal is a separate operation. */
export const DEMON_GUARDIANS = Object.freeze({
  "Summon Imp Guardian": Object.freeze(["Imp"]),
  "Summon Voidwalker Guardian": Object.freeze(["Voidwalker"]),
  "Summon Hellcaller Guardian": Object.freeze(["Imp", "Voidwalker"])
});
export const DEMON_GUARDIAN_FLAG = "demonGuardian";
const allowed = (ability, entry) => DEMON_GUARDIANS[ability]?.includes(entry) === true;
const refuse = reason => ({ ok: false, reason, action: null });

export function demonGuardianPlan(options = {}) {
  const { ability, entry, record = null, token = null } = options;
  if (!allowed(ability, entry)) return refuse("species");
  if (record && (record.ability !== ability || record.entry !== entry)) return refuse("heldChoice");
  if (token && (token.ability !== ability || token.entry !== entry)) return refuse("identity");
  const plan = stoneGuardianPlan(options);
  return plan.ok && plan.action === "create" ? { ...plan, entry } : plan;
}

export function demonGuardianClaim({ ownerUuid, cast, ability, entry } = {}) {
  const claim = stoneGuardianClaim(ownerUuid, cast);
  return claim && allowed(ability, entry) ? { ...claim, ability, entry } : null;
}

export function confirmDemonGuardian(record, token) {
  if (!allowed(record?.ability, record?.entry) || token?.ability !== record.ability
    || token?.entry !== record.entry) return null;
  return confirmStoneGuardian(record, token);
}

export function reconcileDemonGuardian(options = {}) {
  const { record, ownerUuid, tokens = [] } = options;
  if (!allowed(record?.ability, record?.entry)) return refuse("species");
  if (!Array.isArray(tokens)) return refuse("inventory");
  if (tokens.some(token => token?.ownerUuid === ownerUuid
    && (token.ability !== record.ability || token.entry !== record.entry))) return refuse("identity");
  return reconcileStoneGuardian(options);
}
