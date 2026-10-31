import { sustainEntryTransferPending } from "./sustain-entry-transfer.mjs";

/** Plan the ordinary oldest-first replacement rule before accepting a stolen
 * Sustain. No entries end until the coordinator commits the whole transfer.
 */
export function sustainReplacementPlan({ entries, incomingCast, limit, ownerUuid } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!Array.isArray(entries) || typeof incomingCast !== "string" || !incomingCast.trim()
    || typeof ownerUuid !== "string" || !ownerUuid.trim()
    || !Number.isSafeInteger(limit) || limit < 1) return refuse("capacityInput");
  if (entries.some(entry => !entry || typeof entry !== "object" || Array.isArray(entry))) return refuse("capacityInput");
  if (entries.some(entry => sustainEntryTransferPending(entry, ownerUuid))) return refuse("pendingTransfer");
  if (entries.some(entry => entry.cast === incomingCast)) return refuse("alreadyHeld");
  const count = Math.max(0, entries.length + 1 - limit);
  return { ok: true, limit, dropped: structuredClone(entries.slice(0, count)), retained: structuredClone(entries.slice(count)) };
}
