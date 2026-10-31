/** One out-of-combat Stone Rumbler per concrete summoner. World actor and
 * synthetic actor UUIDs are different owners; names never establish a bond. */
export const STONE_GUARDIAN = Object.freeze({
  ability: "Summon Earth Rumbler", entry: "Stone Rumbler", flag: "stoneGuardian"
});
const id = value => typeof value === "string" && value.trim().length > 0;

/** Decide before any writes. A placing receipt means the previous creation
 * is unresolved, not permission to create a second guardian. A wounded or
 * fallen held guardian is still the same creature until explicitly dismissed. */
export function stoneGuardianPlan({ ownerUuid, alive = false, inCombat = false,
  guardianInCombat = false, operation = "summon", record = null, token = null } = {}) {
  const refuse = reason => ({ ok: false, reason, action: null });
  if (!id(ownerUuid) || !["summon", "dismiss"].includes(operation)) return refuse("invalid");
  if (!alive) return refuse("down");
  if (inCombat || guardianInCombat) return refuse("combat");
  if (record === null) return operation === "summon"
    ? { ok: true, action: "create", entry: STONE_GUARDIAN.entry }
    : refuse("none");
  if (record.ownerUuid !== ownerUuid || !id(record.cast)
    || !["placing", "active"].includes(record.phase)) return refuse("record");
  if (record.phase === "placing") return refuse("unconfirmed");
  if (!id(record.tokenUuid)) return refuse("record");
  if (!token) return refuse("unavailable");
  if (token.uuid !== record.tokenUuid || token.ownerUuid !== ownerUuid || token.cast !== record.cast) return refuse("identity");
  return { ok: true, action: operation === "summon" ? "existing" : "dismiss", tokenUuid: token.uuid };
}

export function stoneGuardianClaim(ownerUuid, cast) {
  return id(ownerUuid) && id(cast) ? { ownerUuid, cast, phase: "placing", tokenUuid: null } : null;
}

/** Confirm only the exact token created for this receipt. */
export function confirmStoneGuardian(record, token) {
  if (record?.phase !== "placing" || !id(record.ownerUuid) || !id(record.cast)
    || !id(token?.uuid) || token.ownerUuid !== record.ownerUuid || token.cast !== record.cast) return null;
  return { ...record, phase: "active", tokenUuid: token.uuid };
}

/** Recovery is a separate GM operation after a complete, authoritative token
 * inventory. Never infer absence from an unloaded scene or a failed lookup.
 * A missing receipt may only be cleared explicitly; this never creates a pet. */
export function reconcileStoneGuardian({ ownerUuid, record, tokens = [],
  inventoryComplete = false, clearMissing = false, inCombat = false } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!id(ownerUuid) || record?.ownerUuid !== ownerUuid || !id(record?.cast)
    || !["placing", "active"].includes(record?.phase)) return refuse("record");
  if (!inventoryComplete || !Array.isArray(tokens)) return refuse("inventory");
  if (inCombat) return refuse("combat");
  // Another cast owned by this summoner is also a conflict. Adopting one of
  // several tokens would conceal the duplicate rather than resolve it.
  const owned = tokens.filter(token => token?.ownerUuid === ownerUuid);
  if (owned.some(token => token.inCombat)) return refuse("combat");
  if (owned.length > 1) return refuse("multiple");
  if (owned.length === 0) return clearMissing
    ? { ok: true, action: "clear", record: null }
    : refuse("missing");
  const token = owned[0];
  if (!id(token.uuid) || token.cast !== record.cast
    || (record.phase === "active" && token.uuid !== record.tokenUuid)) return refuse("identity");
  return { ok: true, action: "retain", record: { ...record, phase: "active", tokenUuid: token.uuid } };
}
