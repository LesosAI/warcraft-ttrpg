import { reviewAttackReaction } from "./attack-resolution-state.mjs";
export const ATTACK_REACTION_REVIEW_QUERY = "azeroth-rpg.reviewAttackReaction";

export async function attackReactionReviewHandler({ messageUuid, index, expected, acknowledged, damageReconciled = false } = {}, { user } = {}) {
  const message = await fromUuid(messageUuid);
  return reviewAttackReaction({ message, index, expected, acknowledged, damageReconciled, user });
}

export async function requestAttackReactionReview(message, index, expected, damageReconciled = false) {
  if (!game.user?.isGM) return { ok: false, reason: "permission" };
  const gm = game.users?.activeGM;
  if (!gm) return { ok: false, reason: "noGM" };
  const data = { messageUuid: message.uuid, index, expected, acknowledged: true, damageReconciled };
  try {
    return gm.id === game.user.id ? await attackReactionReviewHandler(data, { user: game.user })
      : await gm.query(ATTACK_REACTION_REVIEW_QUERY, data, { timeout: 15000 });
  } catch { return { ok: false, reason: "pending" }; }
}
