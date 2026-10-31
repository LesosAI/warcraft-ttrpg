export const TRANSFER_DELIVERIES = "damageTransferDeliveries";
const id = value => typeof value === "string" && value.trim().length > 0;
const amount = value => Number.isSafeInteger(value) && value >= 0;
const phases = new Set(["claimed", "protected", "originalPending", "originalApplied", "recipientPending",
  "recipientApplied", "redirectPending", "redirectApplied", "redirectDeclined", "redirectChanged", "complete"]);

/** Only an identifiable, unfinished claimed hit can be reconciled. */
export function transferReviewRow(state, receipts, index) {
  if (state?.version !== 1 || !Array.isArray(state.targets) || !Array.isArray(receipts)
    || !Number.isInteger(index) || index < 0) return null;
  const hit = state.targets[index], matches = receipts.filter(row => row?.index === index);
  if (hit?.stage !== "applying" || !id(hit.targetUuid) || matches.length !== 1) return null;
  const receipt = matches[0], delivery = receipt.delivery;
  if (receipt.version !== 1 || receipt.targetUuid !== hit.targetUuid || !id(receipt.writerId) || !id(receipt.key)
    || !["soulLink", "redirect", "division"].includes(receipt.kind)
    || !Array.isArray(receipt.history) || receipt.history[0] !== "claimed" || receipt.history.at(-1) !== receipt.phase
    || !Array.isArray(delivery?.recipients) || !delivery.recipients.length
    || delivery.recipients.some(row => !id(row.actorUuid) || !amount(row.damage))
    || (receipt.kind !== "redirect" && !amount(delivery.original?.damage))) return null;
  const sharePhase = receipt.kind === "division" && delivery.recipients.some(row =>
    receipt.phase === `sharePending:${row.actorUuid}` || receipt.phase === `shareApplied:${row.actorUuid}`);
  return phases.has(receipt.phase) || sharePhase ? receipt : null;
}

export function reviewedDamageTransfer(state, receipts, index, { userId, at } = {}) {
  const receipt = transferReviewRow(state, receipts, index);
  if (!receipt || !id(userId) || !Number.isSafeInteger(at) || at < 0) return null;
  const nextState = structuredClone(state), nextReceipts = structuredClone(receipts);
  nextState.targets[index] = { ...nextState.targets[index], stage: "applied", reviewedBy: userId, reviewedAt: at };
  const reviewed = nextReceipts.find(row => row.index === index);
  Object.assign(reviewed, { phase: "reviewed", review: { userId, at, previousPhase: receipt.phase },
    history: [...reviewed.history, "reviewed"] });
  return { state: nextState, receipts: nextReceipts };
}
