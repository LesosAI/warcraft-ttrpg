import { sustainLimit } from '../rules/turn-effects.mjs';
import { sustainsFor } from '../rules/class-talents.mjs';
import { sustainReplacementPlan } from '../rules/sustain-replacement.mjs';
import { UPKEEP_DEFAULT } from '../rules/upkeep.mjs';
const casterClaims = new Set();
export function claimMindControlCaster(uuid) {
  if(casterClaims.has(uuid)) return false;
  casterClaims.add(uuid);return true;
}
export function releaseMindControlCaster(uuid) { casterClaims.delete(uuid); }

/** Read-only admission. The creation receipt owns the subsequent writes. */
export function prepareMindControlSustain(caster, message) {
  const entries = structuredClone(caster.getFlag('azeroth-rpg', 'sustaining') ?? []);
  const features = [...caster.items.values()].filter(item => item.type === 'feature');
  const extra = sustainsFor(caster.takenTalents(), {
    holdsWeave: features.some(item => item.name === 'Shape the Weave'),
    archmageStanding: [...caster.effects.values()].some(effect => effect.active !== false
      && effect.getFlag?.('azeroth-rpg', 'identifier') === 'archmage')
  });
  const capacity = sustainReplacementPlan({ entries, incomingCast: message.uuid,
    ownerUuid: caster.uuid, limit: sustainLimit({ features, extra: extra.more }) });
  if (!capacity.ok) return capacity;
  const priests = [...caster.items.values()].filter(item => item.type === 'class' && item.name === 'Priest');
  const pools = caster.poolSnapshot().filter(pool => pool.kind === 'power' && pool.name === 'mana'
    && priests.some(item => item.id === pool.itemId));
  if (pools.length !== 1) return { ok: false, reason: 'priestPool' };
  const featureUuid = message.flags['azeroth-rpg'].mindControlCast.featureUuid;
  if (typeof featureUuid !== 'string' || !featureUuid.startsWith(`${caster.uuid}.Item.`))
    return { ok: false, reason: 'feature' };
  const entry = { name: 'Mind Control', identifier: 'mind-control', spellId: null,
    uuid: featureUuid, cast: message.uuid, itemId: pools[0].itemId,
    upkeep: { ...UPKEEP_DEFAULT }, targets: structuredClone(message.flags['azeroth-rpg'].targets), source: null };
  return { ok: true, before: entries, after: [...capacity.retained, entry], dropped: capacity.dropped, entry };
}
