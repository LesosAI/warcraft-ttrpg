/** Crypt Horror's guardian summon. Counts and duration are explicit tabletop
 * choices; see CLASSIC-CRYPT-AND-BOG-REVIEW.md for retained Classic evidence. */
export const CARRION_SCARAB = Object.freeze({ name: "Summon Carrion Scarab", entry: "Carrion Scarab",
  flag: "carrionScarabs", tokenFlag: "carrionScarab", action: "action", within: 5,
  seconds: 60, capacity: 3, uses: 3, per: "short" });
const id = value => typeof value === "string" && value.trim().length > 0;

export function validScarabClaim(claim) {
  return claim?.version === 1 && [claim.ownerUuid, claim.cast, claim.tokenUuid, claim.sceneId].every(id)
    && ["claimed", "paid", "active"].includes(claim.phase)
    && Number.isFinite(claim.startedAt) && claim.expiresAt === claim.startedAt + CARRION_SCARAB.seconds;
}

/** Reserve the exact token identity before payment. Lost responses may only be
 * reconciled against this reservation, never by spawning another copy.
 */
export function scarabClaim({ ownerUuid, cast, tokenUuid, sceneId, now } = {}) {
  const claim = { version: 1, ownerUuid, cast, tokenUuid, sceneId, phase: "claimed",
    startedAt: now, expiresAt: now + CARRION_SCARAB.seconds };
  return validScarabClaim(claim) ? claim : null;
}

/** Require a complete scene inventory before deciding there is capacity. */
export function scarabSummonPlan({ ownerUuid, alive, uses, claims = [], tokens = [], now, inventoryComplete = false } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!inventoryComplete || !id(ownerUuid) || !Array.isArray(claims) || !Array.isArray(tokens) || !Number.isFinite(now)) return refuse("inventory");
  if (!alive) return refuse("down");
  if (claims.some(c => !validScarabClaim(c) || c.ownerUuid !== ownerUuid)) return refuse("record");
  if (new Set(claims.map(c => c.cast)).size !== claims.length || new Set(claims.map(c => c.tokenUuid)).size !== claims.length) return refuse("conflict");
  const owned = tokens.filter(t => t?.ownerUuid === ownerUuid);
  if (owned.some(t => !claims.some(c => c.tokenUuid === t.uuid && c.cast === t.cast && c.expiresAt === t.expiresAt))) return refuse("orphan");
  for (const claim of claims) {
    if (claim.phase !== "active") return refuse("unconfirmed");
    const matches = owned.filter(t => t.uuid === claim.tokenUuid && t.cast === claim.cast);
    if (matches.length > 1) return refuse("conflict");
    const token = matches[0];
    if (!token || !Number.isFinite(token.health) || token.health <= 0 || now >= claim.expiresAt) return refuse("cleanup");
  }
  if (claims.length >= CARRION_SCARAB.capacity) return refuse("capacity");
  if (!Number.isInteger(uses) || uses < 1 || uses > CARRION_SCARAB.uses) return refuse("uses");
  return { ok: true, action: "summon", usesAfter: uses - 1 };
}

/** A recovery does not refund, repay, extend the clock or create a token.
 * Missing paid/claimed tokens need an explicit GM decision to clear the claim.
 */
export function recoverScarab({ claim, tokens = [], inventoryComplete = false, clearMissing = false } = {}) {
  if (!inventoryComplete || !validScarabClaim(claim) || !Array.isArray(tokens)) return { ok: false, reason: "review" };
  const owned = tokens.filter(t => t?.ownerUuid === claim.ownerUuid && t.cast === claim.cast);
  if (owned.length > 1) return { ok: false, reason: "conflict" };
  const token = owned[0];
  if (!token) return clearMissing ? { ok: true, action: "clear", claim: null } : { ok: false, reason: "missing" };
  if (token.uuid !== claim.tokenUuid || token.expiresAt !== claim.expiresAt || token.sceneId !== claim.sceneId) return { ok: false, reason: "identity" };
  // A token created before the resource write was confirmed is inconsistent.
  if (claim.phase === "claimed") return { ok: false, reason: "payment" };
  return { ok: true, action: "retain", claim: { ...claim, phase: "active" } };
}

/** Delete only this reservation's token. Missing tokens clear active claims;
 * unconfirmed payment/creation remains a recovery task, never an auto-retry.
 */
export function scarabCleanup({ claim, tokens = [], now, ownerAlive = true, inventoryComplete = false } = {}) {
  if (!inventoryComplete || !validScarabClaim(claim) || claim.phase !== "active" || !Number.isFinite(now) || !Array.isArray(tokens))
    return { ok: false, reason: "review" };
  const owned = tokens.filter(t => t?.ownerUuid === claim.ownerUuid && t.cast === claim.cast);
  if (owned.length > 1) return { ok: false, reason: "conflict" };
  const token = owned[0];
  if (!token) return { ok: true, action: "clear", tokenUuid: null };
  if (token.uuid !== claim.tokenUuid || token.expiresAt !== claim.expiresAt || token.sceneId !== claim.sceneId) return { ok: false, reason: "identity" };
  if (!ownerAlive || now >= claim.expiresAt || (Number.isFinite(token.health) && token.health <= 0))
    return { ok: true, action: "delete", tokenUuid: token.uuid };
  if (!Number.isFinite(token.health)) return { ok: false, reason: "health" };
  return { ok: true, action: "retain", tokenUuid: token.uuid };
}
