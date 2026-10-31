/** Tar-beast reactions. Pure decisions over GM-read attack and ability records.
 * Document identity, ownership, scene membership and atomic writes belong to
 * the runtime adapter. A client-supplied snapshot is never sufficient. */
export const TAR_CLAIMS = "tarReactionClaims";
export const TAR_REACTIONS = Object.freeze({
  sticky: Object.freeze({ name: "Sticky Tar", resilience: "body" }),
  burning: Object.freeze({ name: "Burning Tar", resilience: "reflex" })
});
const named = value => typeof value === "string" && value.length > 0;
const ref = value => named(value?.sceneId) && named(value?.tokenId)
  ? { sceneId: value.sceneId, tokenId: value.tokenId } : null;

/** Read one successful melee target from an existing attack card. Damage may
 * be zero: mitigation does not turn a hit into a miss. No target fallback. */
export function tarHit({ messageId, flags, index, success } = {}) {
  if (!named(messageId) || !Number.isInteger(index) || index < 0 || success !== true) return null;
  if (flags?.kind !== "attack" || flags.parry === true || flags.notAttack === true
    || flags.strike?.rangeKind !== "melee") return null;
  const damage = flags.damageByTarget?.[index];
  if (!damage || damage.withdrawn === true || !Number.isFinite(damage.damage) || damage.damage < 0) return null;
  const attacker = ref(flags.source), defender = ref(flags.targets?.[index]);
  if (!attacker || !defender || attacker.sceneId !== defender.sceneId
    || attacker.tokenId === defender.tokenId) return null;
  // Natural rows and unarmed strikes do not become held weapons because a
  // display label resembles one. Unknown forms may still name a real item.
  const weaponId = !flags.strike.row && flags.strike.form !== "unarmed"
    && named(flags.strike.weapon?.id) ? flags.strike.weapon.id : null;
  return { messageId, index, attacker, defender, weaponId };
}

/** Only the authored once-per-rest reactions are offered. DC is taken from
 * the held ability, not inferred from its name or provided by the requester. */
export function tarOptions(rows = [], { weaponId = null } = {}) {
  if (!Array.isArray(rows)) return [];
  const result = [];
  for (const [index, row] of rows.entries()) {
    const key = Object.keys(TAR_REACTIONS).find(k => TAR_REACTIONS[k].name === row?.name);
    if (!key || (key === "sticky" && !named(weaponId))) continue;
    const a = row.automation;
    if (a?.action !== "reaction" || a.uses?.max !== 1 || a.uses?.per !== "short"
      || (a.uses.value ?? 1) !== 1 || !Number.isInteger(a.dc) || a.dc < 1 || a.dc > 30) continue;
    if (result.some(option => option.key === key)) continue;
    result.push({ key, index, name: row.name, resilience: TAR_REACTIONS[key].resilience, dc: a.dc });
  }
  return result;
}

/** Claims are stored on the attack message and cover BOTH reactions. Persist
 * before payment/application, under the GM's per-message lock. A failed or
 * interrupted paid activation must never make its trigger reusable. */
export function claimTarReaction(claims, { index, holderUuid, key } = {}) {
  if (!Array.isArray(claims) || !Number.isInteger(index) || index < 0 || !named(holderUuid)
    || !Object.hasOwn(TAR_REACTIONS, key)) return null;
  if (claims.some(c => c?.index === index || c?.holderUuid === holderUuid)) return null;
  return [...claims, { index, holderUuid, key }];
}

/** A failed test is an explicit boolean. A cancelled or malformed Test never
 * counts as failure and never drops equipment or deals damage. */
export function tarOutcome(key, success) {
  if (!Object.hasOwn(TAR_REACTIONS, key) || typeof success !== "boolean") return null;
  if (success) return { resisted: true };
  return key === "sticky" ? { resisted: false, dropWeapon: true }
    : { resisted: false, damage: { rating: 2, school: "fire" }, condition: { key: "scorched", value: 2 } };
}
