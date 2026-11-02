/** A transfer carrier is inert but retained until its durable transaction is
 * complete. These patches do not write documents or authorize a transfer.
 */
import { releaseSustainTransferEntry } from "./sustain-entry-transfer.mjs";
export const SUSTAIN_TRANSFER_FLAG = "sustainTransfer";
const scope = "azeroth-rpg";
const identity = value => typeof value === "string" && value.trim().length > 0;
const stages = ["holdRecipient", "relocateCarriers", "releaseSource"];

export function sustainTransferPending(effect) {
  const flags = effect?.flags?.[scope], marker = flags?.[SUSTAIN_TRANSFER_FLAG];
  return Boolean(flags?.sustained === true && marker?.version === 1
    && [marker.transactionId, marker.cast, marker.casterUuid, marker.recipientUuid].every(identity)
    && marker.casterUuid !== marker.recipientUuid && typeof marker.disabledBefore === "boolean"
    && flags.cast === marker.cast && [marker.casterUuid, marker.recipientUuid].includes(effect.origin));
}

const matches = (effect, receipt) => receipt?.version === 1
  && [receipt.transactionId, receipt.cast, receipt.casterUuid, receipt.recipientUuid].every(identity)
  && receipt.casterUuid !== receipt.recipientUuid
  && effect?.flags?.[scope]?.sustained === true && effect.flags[scope].cast === receipt.cast
  && ([receipt.casterUuid, receipt.recipientUuid].includes(effect.origin)
    || (!effect.origin && identity(effect.flags[scope].spell)));

export function suspendSustainTransferEffect({ effect, receipt } = {}) {
  if (!matches(effect, receipt) || receipt.state !== "claimed") return { ok: false, reason: "claim" };
  const existing = effect.flags[scope][SUSTAIN_TRANSFER_FLAG];
  if (existing != null && (!sustainTransferPending(effect) || existing.transactionId !== receipt.transactionId
    || existing.casterUuid !== receipt.casterUuid || existing.recipientUuid !== receipt.recipientUuid)) {
    return { ok: false, reason: "otherClaim" };
  }
  const marker = existing ?? { version: 1, transactionId: receipt.transactionId, cast: receipt.cast,
    casterUuid: receipt.casterUuid, recipientUuid: receipt.recipientUuid, disabledBefore: effect.disabled === true };
  // The inventory already matched a legacy originless carrier to this cast's
  // spell UUID. Give its pending marker an explicit caster so lifecycle readers
  // recognize it as suspended instead of deleting it as an orphan.
  return { ok: true, patch: { ...(!effect.origin ? { origin: receipt.casterUuid } : {}),
    disabled: true, [`flags.${scope}.${SUSTAIN_TRANSFER_FLAG}`]: structuredClone(marker) } };
}

export function releaseSustainTransferEffect({ effect, receipt, entry } = {}) {
  const marker = effect?.flags?.[scope]?.[SUSTAIN_TRANSFER_FLAG];
  if (!releaseSustainTransferEntry({ entry, ownerUuid: receipt?.recipientUuid, receipt }).ok
    || !matches(effect, receipt) || !sustainTransferPending(effect) || marker.transactionId !== receipt.transactionId
    || effect.origin !== receipt.recipientUuid
    || (effect.parent?.uuid ?? effect.parentUuid) !== receipt.recipientUuid
    || marker.casterUuid !== receipt.casterUuid || marker.recipientUuid !== receipt.recipientUuid
    || receipt.state !== "done" || receipt.attempted !== null
    || JSON.stringify(receipt.completed) !== JSON.stringify(stages)) return { ok: false, reason: "incomplete" };
  // Null clears the marker without deprecated -= flag deletion syntax. A
  // previously disabled effect stays disabled rather than being reactivated.
  return { ok: true, patch: { disabled: marker.disabledBefore, [`flags.${scope}.${SUSTAIN_TRANSFER_FLAG}`]: null } };
}
