import { packSystems, rawSystem, walkWorld } from './walk.mjs';

export const PARRY_DEMON_RULINGS = {
  'Main Gauche': effect => effect.replace('you may <strong>Parry</strong> without spending a Reaction once per rank each turn', 'your <strong>Parry</strong> reduces 1 more damage per rank'),
  'Command Demon': effect => effect.replace('<p>As a Full Action', '<p>Your Bound Demons take their turns apart from yours, at any point during your side\'s turn rather than only when you act. As a Full Action')
};

/** Preserve custom text and purchased ranks; replace only former standard prose. */
export function buildParryDemonUpdate(raw, pack, name) {
  const old = pack?.effect && PARRY_DEMON_RULINGS[name]?.(pack.effect);
  return old && old !== pack.effect && raw?.effect === old ? {'system.effect':pack.effect} : null;
}

export async function migrate(log = console.log) {
  const talents = await packSystems('azeroth-rpg.talents');
  for (const [name, previous] of Object.entries(PARRY_DEMON_RULINGS)) {
    const effect = talents.byName.get(name)?.effect;
    if (!effect || previous(effect) === effect) throw new Error('Rebuild talents before migrating Parry and demon rulings.');
  }
  return walkWorld({item:doc => doc.type === 'talent'
    ? buildParryDemonUpdate(rawSystem(doc), talents.byName.get(doc.name), doc.name) : null}, log);
}
