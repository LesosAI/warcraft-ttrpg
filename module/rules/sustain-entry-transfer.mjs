/** Pending held records are recovery state, not active/free Sustains. */
const identity = value => typeof value === "string" && value.trim().length > 0;
const stages = ["holdRecipient", "relocateCarriers", "releaseSource"];
export function sustainEntryTransferPending(entry, ownerUuid = null) {
  const marker = entry?.sustainTransfer;
  return Boolean(marker?.version === 1
    && [marker.transactionId, marker.cast, marker.casterUuid, marker.recipientUuid, marker.ownerUuid].every(identity)
    && marker.casterUuid !== marker.recipientUuid && entry.cast === marker.cast
    && [marker.casterUuid, marker.recipientUuid].includes(marker.ownerUuid)
    && (ownerUuid === null || ownerUuid === marker.ownerUuid));
}

export function suspendSustainTransferEntry({ entry, ownerUuid, receipt } = {}) {
  if (entry?.sustainTransfer?.interrupted === true) return { ok: false, reason: "interrupted" };
  if (receipt?.version !== 1 || receipt.state !== "claimed"
    || ![receipt.transactionId, receipt.cast, receipt.casterUuid, receipt.recipientUuid, ownerUuid].every(identity)
    || receipt.casterUuid === receipt.recipientUuid || entry?.cast !== receipt.cast
    || ![receipt.casterUuid, receipt.recipientUuid].includes(ownerUuid)) return { ok: false, reason: "claim" };
  const marker = { version: 1, transactionId: receipt.transactionId, cast: receipt.cast,
    casterUuid: receipt.casterUuid, recipientUuid: receipt.recipientUuid, ownerUuid };
  if (entry.sustainTransfer != null && (!sustainEntryTransferPending(entry, ownerUuid)
    || Object.keys(marker).some(key => entry.sustainTransfer[key] !== marker[key]))) return { ok: false, reason: "otherClaim" };
  return { ok: true, entry: { ...structuredClone(entry), sustainTransfer: marker } };
}

export function releaseSustainTransferEntry({ entry, ownerUuid, receipt } = {}) {
  const marker = entry?.sustainTransfer;
  if (!sustainEntryTransferPending(entry, ownerUuid) || receipt?.version !== 1 || receipt.state !== "done"
    || marker.interrupted === true
    || receipt.attempted !== null || JSON.stringify(receipt.completed) !== JSON.stringify(stages)
    || ownerUuid !== receipt.recipientUuid
    || ["transactionId", "cast", "casterUuid", "recipientUuid"].some(key => receipt[key] !== marker[key])) {
    return { ok: false, reason: "incomplete" };
  }
  const released = structuredClone(entry);
  delete released.sustainTransfer;
  return { ok: true, entry: released };
}

/** Injury/zero-Health cleanup ends active casts but retains interrupted
 * transaction evidence. A coordinator must reject an interrupted record even
 * if its participant is subsequently healed or its receipt says done.
 */
export function endSustainsPlan(entries = [], ownerUuid) {
  const ended = [], retained = [];
  for (const entry of entries) {
    const copy = structuredClone(entry);
    if (sustainEntryTransferPending(entry, ownerUuid)) {
      copy.sustainTransfer.interrupted = true;
      retained.push(copy);
    } else ended.push(copy);
  }
  return { ended, retained };
}
