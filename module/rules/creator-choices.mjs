/** Draft-only choices. Reuse the sheet's tree law without owning an Actor. */
import { buildTree } from "./talents.mjs";
import { keptBy } from "./legacy-branches.mjs";

export function startingTalents(talents, cls, race) {
  return talents.filter(t => cls && t.className === cls.name && !t.race && keptBy(t, race?.name ?? null));
}

export function startingSpell(spell, cls) {
  return Boolean(cls && Number(spell?.tier) === 1 && cls.schools?.includes(spell.school)
    && (!spell.classes?.length || spell.classes.includes(cls.name)));
}

export function draftTree(talents, selected) {
  const rows = talents.map(t => ({ ...t, _id: t.uuid ?? t.identifier, taken: t.identifier === selected ? 1 : 0 }));
  return buildTree(rows, selected ? 0 : 1);
}

/** Only invalid choices are proposed for removal; the UI confirms this patch. */
export function invalidatedChoices(state, { race, cls, talents, spells }) {
  const patch = {}, removed = [];
  if (state.racialTalent && !race?.talents?.some(t => t.name === state.racialTalent && Number(t.tier ?? 1) <= 1)) {
    patch.racialTalent = null;
    removed.push(state.racialTalent);
  }
  if (state.classTalent && !startingTalents(talents, cls, race).some(t => t.identifier === state.classTalent && Number(t.tier) === 1)) {
    patch.classTalent = null;
    removed.push(talents.find(t => t.identifier === state.classTalent)?.name ?? state.classTalent);
  }
  const retained = (state.spells ?? []).filter(uuid => {
    const spell = spells.find(s => s.uuid === uuid);
    if (startingSpell(spell, cls)) return true;
    removed.push(spell?.name ?? uuid);
    return false;
  });
  if (retained.length !== (state.spells ?? []).length) patch.spells = retained;
  return { patch, removed };
}
