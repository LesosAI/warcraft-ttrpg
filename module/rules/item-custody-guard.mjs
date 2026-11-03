/** A delivered Pact deposit stays unavailable until its exchange receipt commits. */
const NS = "azeroth-rpg";
export const ITEM_CUSTODY_PENDING_FLAG = "itemCustodyPending";

function flagsOf(item) {
  return item?.flags ?? item?.toObject?.()?.flags ?? {};
}

/** Return the deterministic receipt provenance attached to a pending Item. */
export function pendingItemCustody(item) {
  const marker = flagsOf(item)?.[NS]?.[ITEM_CUSTODY_PENDING_FLAG];
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return null;
  const keys = ["ticket", "transactionId", "parcelId", "ownerUuid", "recipientUuid"];
  if (Object.keys(marker).length !== keys.length || keys.some(key => typeof marker[key] !== "string" || !marker[key])) return null;
  return marker;
}

export function isItemCustodyPending(item) {
  return pendingItemCustody(item) !== null;
}

/** Apply before an Item is used, equipped, moved, or deleted. */
export function guardPendingCustodyItem(item) {
  const marker = pendingItemCustody(item);
  return marker ? {ok: false, reason: "item-custody-pending", ticket: marker.ticket, parcelId: marker.parcelId}
    : {ok: true};
}
