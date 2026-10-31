/** Boulderfist Shaman's Classic Searing Totem, adapted to the existing
 * tabletop totem actor. Seven rounds approximate the client's 40 seconds.
 * World time supplies one clock both inside and outside combat. */
export const NPC_SEARING_TOTEM = Object.freeze({
  ability: "Searing Totem", entry: "Searing Totem", flag: "npcSearingTotem",
  action: "half", power: 2, within: 5, seconds: 42
});
const id = value => typeof value === "string" && value.trim().length > 0;
export function searingTotemPlan({ ownerUuid, alive = false, power = 0, now,
  record = null, tokens = [] } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!id(ownerUuid) || !Number.isFinite(now) || !Array.isArray(tokens)) return refuse("invalid");
  if (!alive) return refuse("down");
  const owned = tokens.filter(token => token?.ownerUuid === ownerUuid);
  if (owned.length > 1 || (!record && owned.length)) return refuse("conflict");
  if (record) {
    if (record.ownerUuid !== ownerUuid || !id(record.cast) || !Number.isFinite(record.expiresAt)) return refuse("record");
    if (record.phase !== "active") return refuse("unconfirmed");
    const token = owned[0];
    if (token && (token.uuid !== record.tokenUuid || token.cast !== record.cast)) return refuse("identity");
    // Expired and destroyed tokens must be cleaned up before another paid
    // creation. A missing token is not proof of a failed creation.
    if (!token || !(token.health > 0) || now >= record.expiresAt) return refuse("cleanup");
    return { ok: true, action: "existing", tokenUuid: token.uuid };
  }
  if (!Number.isInteger(power) || power < NPC_SEARING_TOTEM.power) return refuse("power");
  return { ok: true, action: "create", powerAfter: power - NPC_SEARING_TOTEM.power };
}

export function searingTotemClaim({ ownerUuid, cast, now } = {}) {
  return id(ownerUuid) && id(cast) && Number.isFinite(now)
    ? { ownerUuid, cast, phase: "placing", tokenUuid: null, expiresAt: now + NPC_SEARING_TOTEM.seconds }
    : null;
}

/** Authoritative, complete scene inventory only. Cleanup never pays, spawns,
 * heals or retries a placement. Unconfirmed records require explicit review. */
export function searingTotemCleanup({ record, tokens = [], now, inventoryComplete = false } = {}) {
  if (!inventoryComplete || !record || !id(record.ownerUuid) || !id(record.cast)
    || record.phase !== "active" || !id(record.tokenUuid) || !Number.isFinite(record.expiresAt)
    || !Number.isFinite(now) || !Array.isArray(tokens)) return { ok: false, reason: "review" };
  const owned = tokens.filter(token => token?.ownerUuid === record.ownerUuid);
  if (owned.length > 1) return { ok: false, reason: "conflict" };
  const token = owned[0];
  if (!token) return { ok: true, action: "clear", tokenUuid: null };
  if (token.uuid !== record.tokenUuid || token.cast !== record.cast) return { ok: false, reason: "identity" };
  if (now >= record.expiresAt || (Number.isFinite(token.health) && token.health <= 0))
    return { ok: true, action: "delete", tokenUuid: token.uuid };
  return { ok: true, action: "retain", tokenUuid: token.uuid };
}

/** Explicit GM recovery never repeats payment or placement. The expiry on
 * the created token must match the receipt, so recovery cannot extend life. */
export function recoverSearingTotem({ record, tokens = [], inventoryComplete = false, clearMissing = false } = {}) {
  if (!inventoryComplete || !record || !id(record.ownerUuid) || !id(record.cast)
    || !["placing", "active"].includes(record.phase) || !Number.isFinite(record.expiresAt)
    || !Array.isArray(tokens)) return { ok: false, reason: "review" };
  const owned = tokens.filter(token => token?.ownerUuid === record.ownerUuid);
  if (owned.length > 1) return { ok: false, reason: "conflict" };
  const token = owned[0];
  if (!token) return clearMissing ? { ok: true, action: "clear", record: null } : { ok: false, reason: "missing" };
  if (!id(token.uuid) || token.cast !== record.cast || token.expiresAt !== record.expiresAt
    || (record.phase === "active" && token.uuid !== record.tokenUuid)) return { ok: false, reason: "identity" };
  return { ok: true, action: "retain", record: { ...record, phase: "active", tokenUuid: token.uuid } };
}
