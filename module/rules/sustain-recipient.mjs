/** Plan only the recipient's held-record relocation. The GM coordinator must
 * validate ownership, rank, capacity and the actual Mana pool, relocate all
 * effect/Region carriers, and coordinate lifecycle cleanup before writing.
 */
const identity = value => typeof value === "string" && value.trim().length > 0;

export function sustainRecipientEntry({ inventory, recipientUuid, recipientId, manaItemId, source = null, resolvedUpkeep } = {}) {
  if (inventory?.ok !== true || !identity(inventory.casterUuid) || !identity(inventory.cast)
    || inventory.entry?.cast !== inventory.cast || !identity(inventory.entry?.uuid)) return { ok: false, reason: "inventory" };
  if (!identity(recipientUuid) || !identity(recipientId) || recipientUuid === inventory.casterUuid) return { ok: false, reason: "recipient" };
  if (!identity(manaItemId)) return { ok: false, reason: "pool" };
  if (source !== null && (!identity(source?.sceneId) || !identity(source?.tokenId))) return { ok: false, reason: "source" };
  // Legacy records may rely on the original spell's prose. Resolve that base
  // cost before relocation: the recipient does not own the original item.
  // Recipient talents are applied later by the ordinary upkeep pipeline.
  const upkeep = resolvedUpkeep ?? inventory.entry.upkeep;
  if (!upkeep || ![upkeep.mana, upkeep.health].every(value => Number.isSafeInteger(value) && value >= 0)) return { ok: false, reason: "upkeep" };
  const entry = structuredClone(inventory.entry);
  // The original spell UUID remains the identity of the stolen spell, but its
  // embedded ID is NOT an item on the recipient. Ending/upkeep already accept
  // cast/UUID identity and the cached upkeep on the held record.
  entry.spellId = null;
  entry.itemId = manaItemId;
  entry.upkeep = { mana: upkeep.mana, health: upkeep.health };
  entry.source = source === null ? null : { sceneId: source.sceneId, tokenId: source.tokenId };
  entry.targets = [{ sceneId: source?.sceneId ?? null, tokenId: source?.tokenId ?? null, actorId: recipientId }];
  return { ok: true, recipientUuid, entry };
}
