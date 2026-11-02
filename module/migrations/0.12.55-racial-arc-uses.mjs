import { usesFromText } from '../rules/uses.mjs';
import { flat } from './0.12.1-signature-rewrites.mjs';
import { packSystems, rawSystem, walkWorld } from './walk.mjs';
import { racialClarifications } from './0.12.58-racial-clarifications.mjs';

const names = new Set(['The Hunger Mastered', "Elune's Regard", "Zalazane's Lesson"]);
// Exact pre-ruling text remains eligible after the race pack is regenerated.
const oldHunger = 'Once in an arc, draw deeply and regain your full Power pool. Something you did not intend notices, and the Farstriders stop looking at you the same way';

export function racialArcUsesUpdate(raw, name, authored) {
  const descriptions = [flat(authored?.description)];
  if (name === 'The Hunger Mastered' && raw?.race === 'Blood Elf') descriptions.push(flat(oldHunger));
  const prior = racialClarifications.find(row => row.name === name && row.race === raw?.race);
  if (prior) descriptions.push(flat(prior.old));
  if (!names.has(name) || !raw?.race || raw.className || raw.source?.document !== '02-CHARACTER-OPTIONS'
    || !authored || authored.name !== name
    || !descriptions.includes(flat(raw.effect))
    || !descriptions.includes(flat(raw.description))) return null;
  const limit = usesFromText(authored.description, { arc: true });
  if (limit?.per !== 'arc' || limit.max !== 1) return null;
  const held = raw.uses ?? {};
  // Only repair the old parser's unlimited stamp. A custom or already limited
  // counter belongs to the GM. Zero is preserved: prior manual use is unknown.
  if ((held.max ?? 0) !== 0 || (held.per ?? null) !== null || (held.value ?? 0) !== 0) return null;
  return { 'system.uses': { value: 0, max: 1, per: 'arc' } };
}

export async function migrate(log = console.log) {
  const races = await packSystems('azeroth-rpg.races');
  return walkWorld({ item: doc => {
    if (doc.type !== 'talent') return null;
    const raw = rawSystem(doc);
    const authored = races.byName.get(raw.race)?.talents?.find(talent => talent.name === doc.name);
    return racialArcUsesUpdate(raw, doc.name, authored);
  } }, log);
}
