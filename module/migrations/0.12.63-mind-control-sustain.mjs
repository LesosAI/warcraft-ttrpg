import { packSystems, rawSystem, walkWorld } from './walk.mjs';

export const OLD_MIND_CONTROL = '<p>As an action, spend 8 Mana and make a Casting Test. On success, a target you can see makes a Spirit Resilience Test against your Spell DC or acts on your Initiative under your direction until it takes damage. It repeats the Test at the end of each of its turns.</p>';

/** Exact former standard only; purchased ranks and house rules remain intact. */
export function buildMindControlUpdate(raw, pack) {
  return raw?.effect === OLD_MIND_CONTROL && pack?.effect?.includes('normal Sustain capacity')
    ? { 'system.effect': pack.effect } : null;
}

export async function migrate(log = console.log) {
  const talents = await packSystems('azeroth-rpg.talents');
  const pack = talents.byName.get('Mind Control');
  if (!pack?.effect?.includes('normal Sustain capacity')) throw Error('Rebuild talents before migrating Mind Control.');
  return walkWorld({ item: doc => doc.type === 'talent' && doc.name === 'Mind Control'
    ? buildMindControlUpdate(rawSystem(doc), pack) : null }, log);
}
