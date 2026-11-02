import { flat } from './0.12.1-signature-rewrites.mjs';
import { packSystems, rawSystem, walkWorld } from './walk.mjs';

const revisions = [
  { race: 'Blood Elf', name: 'The Hunger Mastered', old: 'Once in an arc, draw deeply and regain your full Power pool. Something you did not intend notices, and the Farstriders stop looking at you the same way' },
  { race: 'Night Elf', name: "Elune's Light", old: 'Under an open night sky you stand in Bright light, however dark it is' },
  { race: 'Tauren', name: 'Kodo-Bond', old: 'A beast you have worked with for a month acts on your Initiative' }
];

/** Only unchanged authored prose is replaced. Resource state is never written. */
export function approvedRacialTextUpdate(type, raw, name, races) {
  if (raw?.source?.document !== '02-CHARACTER-OPTIONS') return null;
  if (type === 'talent') {
    const row = revisions.find(row => row.race === raw.race && row.name === name);
    if (!row || raw.className || flat(raw.description) !== flat(row.old) || flat(raw.effect) !== flat(row.old)) return null;
    const authored = races.get(row.race)?.talents?.find(talent => talent.name === row.name);
    if (!authored || flat(authored.description) === flat(row.old)) return null;
    return { 'system.description': authored.description, 'system.effect': authored.description };
  }
  if (type !== 'race' || !Array.isArray(raw.talents)) return null;
  let changed = false;
  const talents = raw.talents.map(talent => {
    const row = revisions.find(row => row.race === name && row.name === talent.name);
    if (!row || flat(talent.description) !== flat(row.old)) return talent;
    const authored = races.get(row.race)?.talents?.find(entry => entry.name === row.name);
    if (!authored || authored.tier !== talent.tier || flat(authored.description) === flat(row.old)) return talent;
    changed = true;
    return { ...talent, description: authored.description };
  });
  return changed ? { 'system.talents': talents } : null;
}

export async function migrate(log = console.log) {
  const { byName } = await packSystems('azeroth-rpg.races');
  // Do not advance the migration version against an old compiled race pack.
  for (const row of revisions) {
    const authored = byName.get(row.race)?.talents?.find(talent => talent.name === row.name);
    if (!authored || flat(authored.description) === flat(row.old))
      throw new Error(`Rebuild the races pack before migration 0.12.56: ${row.name}`);
  }
  return walkWorld({ item: doc => approvedRacialTextUpdate(doc.type, rawSystem(doc), doc.name, byName) }, log);
}
