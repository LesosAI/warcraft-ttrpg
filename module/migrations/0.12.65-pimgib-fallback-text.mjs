import { flat } from './0.12.1-signature-rewrites.mjs';
import { sameUse } from './0.11.2-consumable-use.mjs';
import { signatureEffectOf } from '../rules/signatures.mjs';
import { packSystems, rawSystem, walkWorld } from './walk.mjs';

export const PIMGIB_FALLBACK = '. A spell without a granting class uses the casting attribute actually used for its Test;';

/** Replace only the former catalogue prose with unchanged catalogue mechanics. */
export function pimgibFallbackUpdate(raw, pack) {
  if (raw?.identifier !== 'pimgibs-collar' || pack?.identifier !== raw.identifier
    || !pack.signature?.includes(PIMGIB_FALLBACK)) return null;
  const previous = pack.signature.replace(PIMGIB_FALLBACK, ';');
  if (flat(raw.signature) !== flat(previous)
    || !sameUse(signatureEffectOf(raw), signatureEffectOf(pack))) return null;
  return {'system.signature': pack.signature};
}

export async function migrate(log = console.log) {
  const gear = await packSystems('azeroth-rpg.gear');
  const pack = gear.byName.get("Pimgib's Collar");
  if (!pack?.signature?.includes(PIMGIB_FALLBACK)) throw new Error('Rebuild gear before migrating Pimgib fallback text.');
  return walkWorld({item: doc => doc.type === 'gear' ? pimgibFallbackUpdate(rawSystem(doc), pack) : null}, log);
}
