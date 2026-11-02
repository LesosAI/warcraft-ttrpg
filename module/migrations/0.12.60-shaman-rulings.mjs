import { packSystems, rawSystem, walkWorld } from './walk.mjs';

export const SHAMAN_RULINGS = {
  'Elemental Blademaster': effect => effect.replace(' The spell retains its printed range.', ''),
  'Ancestral Spirit': effect => effect.replace('reached its death threshold', 'took its third Death Step')
    .replace(' The threshold is normally three Death Steps, or four with Sacrifice.', '')
};

/** Only replace the exact former pack text; preserve custom effects and ranks. */
export function buildShamanRulingUpdate(raw, pack, name) {
  const oldText = pack?.effect && SHAMAN_RULINGS[name]?.(pack.effect);
  if (!oldText || oldText === pack.effect || raw?.effect !== oldText) return null;
  return { 'system.effect': pack.effect };
}

export async function migrate(log = console.log) {
  const talents = await packSystems('azeroth-rpg.talents');
  for (const [name, previous] of Object.entries(SHAMAN_RULINGS)) {
    const effect = talents.byName.get(name)?.effect;
    if (!effect || previous(effect) === effect) throw new Error('Rebuild talents before migrating the approved Shaman wording.');
  }
  return walkWorld({ item: doc => doc.type === 'talent'
    ? buildShamanRulingUpdate(rawSystem(doc), talents.byName.get(doc.name), doc.name) : null }, log);
}
