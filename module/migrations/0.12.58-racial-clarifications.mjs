import { flat } from './0.12.1-signature-rewrites.mjs';
import { packSystems, rawSystem, walkWorld } from './walk.mjs';

export const racialClarifications = [
  { race: 'Human', name: 'Militia Drill', old: 'An hour drilling untrained people gives them a Boon on their next Test as a group, and they hold a line one round longer than they should' },
  { race: 'Troll', name: "Zalazane's Lesson", old: 'You know the shape of the magic that turns Darkspear against Darkspear. Once in an arc, one creature under magical domination is freed of it for good' }
];

export function racialClarificationUpdate(type, raw, name, races, clarifications = racialClarifications) {
  if (raw?.source?.document !== '02-CHARACTER-OPTIONS') return null;
  const authored = row => races.get(row.race)?.talents?.find(talent => talent.name === row.name);
  if (type === 'talent') {
    const row = clarifications.find(row => row.race === raw.race && row.name === name);
    if (!row || raw.className || flat(raw.description) !== flat(row.old) || flat(raw.effect) !== flat(row.old)) return null;
    const next = authored(row);
    if (!next || flat(next.description) === flat(row.old)) return null;
    return { 'system.description': next.description, 'system.effect': next.description };
  }
  if (type !== 'race' || !Array.isArray(raw.talents)) return null;
  let changed = false;
  const talents = raw.talents.map(talent => {
    const row = clarifications.find(row => row.race === name && row.name === talent.name);
    if (!row || flat(talent.description) !== flat(row.old)) return talent;
    const next = authored(row);
    if (!next || next.tier !== talent.tier || flat(next.description) === flat(row.old)) return talent;
    changed = true;
    return { ...talent, description: next.description };
  });
  return changed ? { 'system.talents': talents } : null;
}

export async function migrate(log = console.log) {
  const { byName } = await packSystems('azeroth-rpg.races');
  for (const row of racialClarifications) {
    const next = byName.get(row.race)?.talents?.find(talent => talent.name === row.name);
    if (!next || flat(next.description) === flat(row.old)) throw new Error(`Rebuild races before migration 0.12.58: ${row.name}`);
  }
  return walkWorld({ item: doc => racialClarificationUpdate(doc.type, rawSystem(doc), doc.name, byName) }, log);
}
