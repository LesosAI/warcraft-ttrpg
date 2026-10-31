import { reviewMindControlCreation } from './mind-control-creation.mjs';
export const MIND_CONTROL_REVIEW_QUERY = 'azeroth-rpg.reviewMindControl';
export async function mindControlReviewHandler({ messageUuid, expected, acknowledged } = {}, { user } = {}) {
  return reviewMindControlCreation({ message: await fromUuid(messageUuid), expected, acknowledged, user });
}
export async function requestMindControlReview(message, expected) {
  const gm = game.users?.activeGM;
  if (!game.user?.isGM || !gm) return { ok: false, reason: 'permission' };
  const data = { messageUuid: message.uuid, expected, acknowledged: true };
  try {
    return gm === game.user ? await mindControlReviewHandler(data, { user: game.user })
      : await gm.query(MIND_CONTROL_REVIEW_QUERY, data, { timeout: 15000 });
  } catch { return { ok: false, reason: 'pending' }; }
}
