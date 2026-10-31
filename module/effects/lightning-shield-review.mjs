const announced = new WeakMap();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** Post-Apply corrections cannot safely rewind Health, death consequences or
 * a shield subsequently replaced. Preserve the delivery and flag it for review. */
export async function reviewLightningShieldHits(message, { deleted = false } = {}) {
  if (!gmHere()) return [];
  const flags = message?.flags?.["azeroth-rpg"] ?? {};
  const claims = flags.lightningShieldClaims;
  if (!Array.isArray(claims)) return [];
  const pending = claims.filter(claim => {
    const row = flags.damageByTarget?.[claim.index];
    return deleted || row?.withdrawn === true || row?.hit !== true || message.rolls?.[0]?.outcome?.success !== true;
  });
  const seen = announced.get(message) ?? new Set();
  announced.set(message, seen);
  const fresh = pending.filter(claim => !seen.has(claim.index));
  if (!fresh.length) return [];
  for (const claim of fresh) seen.add(claim.index);
  try {
    if (!deleted) {
      const old = Array.isArray(flags.lightningShieldReview) ? flags.lightningShieldReview : [];
      const rows = fresh.filter(claim => !old.some(row => row.index === claim.index)).map(claim => ({
        index: claim.index, ownerUuid: claim.ownerUuid, attackerUuid: claim.attackerUuid,
        deliveryPhase: claim.phase, remaining: claim.remaining ?? null, reason: "hitWithdrawn"
      }));
      if (rows.length) await message.update({ "flags.azeroth-rpg.lightningShieldReview": [...old, ...rows] });
    }
    ui.notifications?.warn(game.i18n.localize("AZEROTH.LightningShield.LateCorrection"));
    return fresh;
  } catch (error) {
    for (const claim of fresh) seen.delete(claim.index);
    console.warn("azeroth-rpg | Lightning Shield correction review", error);
    ui.notifications?.warn(game.i18n.localize("AZEROTH.LightningShield.LateCorrection"));
    return [];
  }
}

export function registerLightningShieldReviewHooks() {
  Hooks.on("updateChatMessage", (message, changed) => {
    if ("rolls" in changed || Object.keys(changed).some(key => key.startsWith("flags.azeroth-rpg.damageByTarget"))
      || changed.flags?.["azeroth-rpg"]?.damageByTarget !== undefined)
      return reviewLightningShieldHits(message);
  });
  Hooks.on("deleteChatMessage", message => reviewLightningShieldHits(message, { deleted: true }));
}
