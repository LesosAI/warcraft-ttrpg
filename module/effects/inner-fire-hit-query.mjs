import { resolveInnerFireHit } from "./inner-fire-hit.mjs";
export const INNER_FIRE_HIT_QUERY = "azeroth-rpg.innerFireHit";
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };

/** Only the owner who applied incoming damage may request the defender's charge. */
export async function innerFireHitQueryHandler({ messageId, snapshot, damageApplied } = {}, { user } = {}) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id || !user?.id)
    return { ok: false, reason: "authority" };
  const owner = resolve(snapshot?.ownerUuid), message = game.messages?.get(messageId);
  if (owner?.documentName !== "Actor" || !owner.testUserPermission(user, "OWNER")
    || message?.documentName !== "ChatMessage") return { ok: false, reason: "permission" };
  const targets = message.flags?.["azeroth-rpg"]?.targets ?? [];
  const indexes = targets.flatMap((row, index) => {
    const actor = row.sceneId && row.tokenId ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`)?.actor
      : !row.sceneId && !row.tokenId ? resolve(row.actorUuid) : null;
    return actor === owner ? [index] : [];
  });
  if (indexes.length !== 1) return { ok: false, reason: "target" };
  return resolveInnerFireHit({ message, index: indexes[0], snapshot, damageApplied });
}

export async function requestInnerFireHit({ messageId, snapshot, damageApplied } = {}) {
  if (!snapshot || !(damageApplied > 0) || !messageId) return null;
  try {
    const data = { messageId, snapshot, damageApplied };
    const result = game.user?.isGM && game.users?.activeGM?.id === game.user.id
      ? await innerFireHitQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(INNER_FIRE_HIT_QUERY, data, { timeout: 60000 });
    if (!result?.ok && !["hit", "changedCarrier", "claimed", "absent", "ineligible"].includes(result?.reason))
      ui.notifications?.warn("Inner Fire's charge could not be confirmed. Check the attack receipt and armor effect before correcting it.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Inner Fire hit", error);
    ui.notifications?.warn("Inner Fire's charge could not be confirmed. Do not repeat the damage to retry it.");
    return null;
  }
}
