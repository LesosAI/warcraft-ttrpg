import { reviewAttackTransfer } from "./attack-resolution-state.mjs";
export const ATTACK_TRANSFER_REVIEW_QUERY = "azeroth-rpg.reviewAttackTransfer";

export async function attackTransferReviewHandler({ messageUuid, index, expected, acknowledged } = {}, { user } = {}) {
  return reviewAttackTransfer({ message: await fromUuid(messageUuid), index, expected, acknowledged, user });
}

export async function requestAttackTransferReview(message, index, expected) {
  const gm = game.users?.activeGM;
  if (!game.user?.isGM || !gm) return { ok: false, reason: "permission" };
  const data = { messageUuid: message.uuid, index, expected, acknowledged: true };
  try {
    return gm.id === game.user.id ? await attackTransferReviewHandler(data, { user: game.user })
      : await gm.query(ATTACK_TRANSFER_REVIEW_QUERY, data, { timeout: 15000 });
  } catch { return { ok: false, reason: "pending" }; }
}
