import { resolveLightningShieldHit } from "./lightning-shield-hit.mjs";

export const LIGHTNING_SHIELD_HIT_QUERY = "azeroth-rpg.lightningShieldHit";
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };

/** The damage Apply action asks the active GM to resolve the defender's shield.
 * A defender's owner may apply an incoming attack without owning its author. */
export async function lightningShieldHitQueryHandler({ messageUuid, index } = {}, { user } = {}) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id || !user?.id || !Number.isInteger(index) || index < 0)
    return { ok: false, reason: "unavailable" };
  const message = resolve(messageUuid), flags = message?.flags?.["azeroth-rpg"], row = flags?.targets?.[index];
  if (message?.documentName !== "ChatMessage" || !row) return { ok: false, reason: "unavailable" };
  const owner = row.sceneId && row.tokenId ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`)?.actor
    : !row.sceneId && !row.tokenId ? resolve(row.actorUuid) : null;
  if (!owner?.testUserPermission(user, "OWNER")) return { ok: false, reason: "permission" };
  return resolveLightningShieldHit(message, index);
}

export async function requestLightningShieldHit(message, index) {
  const flags = message?.flags?.["azeroth-rpg"];
  if (flags?.kind !== "attack" || flags.strike?.rangeKind !== "melee" || flags.notAttack || flags.parry) return null;
  try {
    const data = { messageUuid: message.uuid, index };
    const result = game.user?.isGM && game.users?.activeGM?.id === game.user.id
      ? await lightningShieldHitQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(LIGHTNING_SHIELD_HIT_QUERY, data, { timeout: 60000 });
    if (!result?.ok && !["absent", "inactive", "hit", "claimed"].includes(result?.reason))
      ui.notifications?.warn(game.i18n.localize("AZEROTH.LightningShield.HitInterrupted"));
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Lightning Shield hit request", error);
    ui.notifications?.warn(game.i18n.localize("AZEROTH.LightningShield.HitInterrupted"));
    return null;
  }
}
