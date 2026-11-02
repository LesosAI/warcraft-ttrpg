import { readSustainTransferInventory } from "./sustain-transfer-inventory.mjs";
import { sustainCastRelocation, sustainCarrierParent } from "../rules/sustain-cast-relocation.mjs";
import { sustainReplacementPlan } from "../rules/sustain-replacement.mjs";
import { sustainLimit } from "../rules/turn-effects.mjs";
import { sustainsFor } from "../rules/class-talents.mjs";
import { previewSustainRegions } from "./sustain-region-preview.mjs";

/** Active-GM read-only preparation of actor and supported Region carriers. This is not
 * authorization to transfer: no rank, payment or immunity decision is
 * made here. The coordinator must revalidate snapshots before every write.
 */
export function previewSustainRelocation({ caster, recipient, cast, source = null, allocateId = () => foundry.utils.randomID() } = {}) {
  const inventory = readSustainTransferInventory(caster, cast);
  if (!inventory.ok) return inventory;
  if (recipient?.documentName !== "Actor" || !recipient.uuid || fromUuidSync(recipient.uuid) !== recipient
    || recipient.uuid === caster.uuid) return { ok: false, reason: "recipient" };
  const features = [...recipient.items.values()].filter(item => item.type === "feature").map(item => ({ name: item.name }));
  const more = sustainsFor(recipient.takenTalents(), {
    holdsWeave: features.some(feature => feature.name === "Shape the Weave"),
    archmageStanding: [...recipient.effects.values()].some(effect => effect.active !== false && effect.getFlag?.("azeroth-rpg", "identifier") === "archmage")
  });
  const capacity = sustainReplacementPlan({ entries: recipient.getFlag("azeroth-rpg", "sustaining") ?? [],
    incomingCast: cast, ownerUuid: recipient.uuid, limit: sustainLimit({ features, extra: more.more }) });
  if (!capacity.ok) return capacity;
  const replacements = [];
  for (const entry of capacity.dropped) {
    if (typeof entry.cast !== "string" || !entry.cast.trim()) return { ok: false, reason: "replacementIdentity" };
    const replacement = readSustainTransferInventory(recipient, entry.cast);
    if (!replacement.ok) return { ok: false, reason: "replacementInventory", detail: replacement.reason };
    replacements.push(replacement);
  }
  const effects = [...recipient.effects.values()].map(effect => ({ ...effect.toObject(), uuid: effect.uuid, parentUuid: recipient.uuid }));
  // Use the same bundle selection as final planning, including unequal states.
  const chosen = sustainCarrierParent(inventory, recipient.uuid);
  const count = inventory.effects.filter(effect => effect.parentUuid === chosen).length;
  const destinationIds = chosen === recipient.uuid ? [] : Array.from({ length: count }, () => allocateId());
  const regions = previewSustainRegions({inventory,recipient,source,allocateId});
  if (!regions.ok) return regions;
  // Region validation belongs to the Region planner; retain the full original
  // inventory in the transaction while planning actor carriers separately.
  const relocation = inventory.regions.length && !inventory.effects.length
    ? {ok:true,moves:[],removals:[]}
    : sustainCastRelocation({ inventory:{...inventory,regions:[]}, recipientUuid: recipient.uuid, destinationIds, recipientEffects: effects });
  if (!relocation.ok) return relocation;
  return { ok: true, inventory, relocation, capacity, replacements,
    ...(regions.regionTransfers.length ? {regionTransfers:regions.regionTransfers} : {}),
    recipient: { uuid: recipient.uuid, effects } };
}
