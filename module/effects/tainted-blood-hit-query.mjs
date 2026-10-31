import { resolveTaintedBloodHit } from "./tainted-blood-hit.mjs";

export const TAINTED_BLOOD_HIT_QUERY = "azeroth-rpg.taintedBloodHit";
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };

export async function taintedBloodHitQueryHandler({ messageUuid, index } = {}, { user } = {}) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id || !user?.id || !Number.isInteger(index) || index < 0)
    return { ok: false, reason: "unavailable" };
  const message = resolve(messageUuid), row = message?.flags?.["azeroth-rpg"]?.targets?.[index];
  if (message?.documentName !== "ChatMessage" || !row) return { ok: false, reason: "unavailable" };
  const owner = row.sceneId && row.tokenId ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`)?.actor
    : !row.sceneId && !row.tokenId ? resolve(row.actorUuid) : null;
  if (!owner?.testUserPermission(user, "OWNER")) return { ok: false, reason: "permission" };
  return resolveTaintedBloodHit(message, index);
}

export async function requestTaintedBloodHit(message, index) {
  const flags = message?.flags?.["azeroth-rpg"];
  if (flags?.kind !== "attack" || flags.strike?.rangeKind !== "melee" || flags.notAttack || flags.parry || flags.retaliation) return null;
  try {
    const data = { messageUuid: message.uuid, index };
    const result = game.user?.isGM && game.users?.activeGM?.id === game.user.id
      ? await taintedBloodHitQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(TAINTED_BLOOD_HIT_QUERY, data, { timeout: 60000 });
    if (!result?.ok && !["absent", "hit", "claimed"].includes(result?.reason))
      ui.notifications?.warn("Tainted Blood could not confirm its stack. Review the attack and effect before trying again.");
    return result;
  } catch {
    ui.notifications?.warn("Tainted Blood could not confirm its stack. Review the attack and effect before trying again.");
    return null;
  }
}
