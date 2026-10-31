import { previewSustainRelocation } from "./sustain-relocation-preview.mjs";
import { sustainRecipientEntry } from "../rules/sustain-recipient.mjs";
import { counterspellFor } from "../rules/class-talents.mjs";
import { upkeepOf } from "../rules/upkeep.mjs";
import { sustainEntryTransferPending } from "../rules/sustain-entry-transfer.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";
import { dispersionFor } from "../rules/dispersion.mjs";

/** Read-only recipient-record preparation. No resource payment or transfer is
 * performed; the transaction must validate these snapshots again before writes.
 */
export async function prepareSustainRecipient({ caster, recipient, cast, source = null } = {}) {
  const refuse = reason => ({ ok: false, reason });
  const selectedSource = source === null ? null : { sceneId: source?.sceneId, tokenId: source?.tokenId };
  const sourceValid = () => {
    if (selectedSource === null) return true;
    const { sceneId, tokenId } = selectedSource;
    if (![sceneId, tokenId].every(value => typeof value === "string" && value.trim())) return false;
    const token = fromUuidSync(`Scene.${sceneId}.Token.${tokenId}`);
    return token?.documentName === "Token" && token.id === tokenId && token.parent?.id === sceneId && token.actor === recipient;
  };
  const eligible = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id
    && recipient?.documentName === "Actor" && fromUuidSync(recipient.uuid) === recipient
    && counterspellFor(recipient.takenTalents()).transfers;
  if (!eligible()) return refuse("transferAuthority");
  const protectedParticipant = () => [caster, recipient].some(actor => iceBlockFor(actor) || dispersionFor(actor));
  if (protectedParticipant()) return refuse("protectedParticipant");
  if (!sourceValid()) return refuse("source");
  const initial = previewSustainRelocation({ caster, recipient, cast });
  if (!initial.ok) return initial;
  if (sustainEntryTransferPending(initial.inventory.entry, caster.uuid)) return refuse("pendingSourceTransfer");
  const originalSpell = initial.inventory.entry.upkeep == null ? await fromUuid(initial.inventory.entry.uuid) : null;
  if (!eligible()) return refuse("transferAuthority");
  if (protectedParticipant()) return refuse("protectedParticipant");
  if (!sourceValid()) return refuse("source");
  // Loading a compendium can yield. Re-read the entire preparation afterward.
  const preview = previewSustainRelocation({ caster, recipient, cast });
  if (!preview.ok) return preview;
  const entry = preview.inventory.entry;
  if (sustainEntryTransferPending(entry, caster.uuid)) return refuse("pendingSourceTransfer");
  if (entry.uuid !== initial.inventory.entry.uuid) return refuse("changedSpell");
  if (entry.upkeep == null && (originalSpell?.documentName !== "Item" || originalSpell.type !== "spell"
    || originalSpell.uuid !== entry.uuid)) return refuse("upkeepSource");
  const classes = [...recipient.items.values()].filter(item => item.type === "class" && item.name === "Mage");
  if (classes.length !== 1) return refuse("mageClass");
  const pools = recipient.poolSnapshot().filter(pool => pool.kind === "power" && pool.name === "mana" && pool.itemId === classes[0].id);
  if (pools.length !== 1) return refuse("magePool");
  const resolvedUpkeep = entry.upkeep == null ? upkeepOf(entry, originalSpell.system) : entry.upkeep;
  const held = sustainRecipientEntry({ inventory: preview.inventory, recipientUuid: recipient.uuid, recipientId: recipient.id,
    manaItemId: pools[0].itemId, resolvedUpkeep, source: selectedSource });
  if (!held.ok) return held;
  return { ...preview, recipientEntry: held.entry, manaPool: structuredClone(pools[0]) };
}
