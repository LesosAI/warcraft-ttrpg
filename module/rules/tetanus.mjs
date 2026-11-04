/** Harvest Golem's disease, carried as Lockjaw until cured (D12; the ability keeps the name Tetanus). */
export const TETANUS = Object.freeze({ name: "Tetanus", action: "action", feet: 5,
  dc: 12, resilience: "body", reduction: 2, floor: 3 });
export const TETANUS_REQUESTS = "tetanusRequests";
const REQUEST_LIFETIME = 600000;

/** Expired requests are refused even after their receipts have been pruned. */
export function tetanusRequestClaim({ requestId, issuedAt, now, receipts = [] } = {}) {
  if (typeof requestId !== "string" || !/^[A-Za-z0-9]{16}$/.test(requestId)
    || !Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(now)
    || issuedAt > now + 5000 || now >= issuedAt + REQUEST_LIFETIME)
    return { ok: false, reason: "expiredRequest" };
  if (!Array.isArray(receipts)) return { ok: false, reason: "receipts" };
  const current = receipts.filter(row => Number.isFinite(row?.expiresAt) && row.expiresAt > now);
  if (current.some(row => row.requestId === requestId)) return { ok: false, reason: "replayedRequest" };
  return { ok: true, receipts: [...current, { requestId, expiresAt: issuedAt + REQUEST_LIFETIME }] };
}

/**
 * Persist only excess current Health after the character's effects have prepared.
 * The caller must read fresh source/current maximum after applying the carrier.
 * Never save a derived maximum, change NPC stat-block Health, or restore Health
 * on cure. This patch is idempotent and cannot raise the source Health value.
 */
export function tetanusHealthPatch({ type, storedHealth, preparedMaximum } = {}) {
  if (type !== "character" || !Number.isFinite(storedHealth) || storedHealth < 0
    || !Number.isFinite(preparedMaximum) || preparedMaximum < 0
    || storedHealth <= preparedMaximum) return null;
  return { "system.health.value": preparedMaximum };
}
