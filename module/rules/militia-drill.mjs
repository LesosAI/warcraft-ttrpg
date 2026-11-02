export const MILITIA_DRILL_FLAG = 'militiaDrill';
export const MILITIA_DRILL_CHOICE = 'militia-drill-group';

/** Read the original single-group flag without losing a pending claim. New
 * writes use the versioned group list; malformed/duplicate IDs are refused. */
export function militiaDrillGroups(value) {
  if (value == null) return [];
  const groups = value.version === 1 && Array.isArray(value.groups) ? value.groups : value.id ? [value] : null;
  if (!groups || groups.some(row => !row || typeof row.id !== 'string' || !row.id
    || typeof row.trainerUuid !== 'string' || !row.trainerUuid || !['ready', 'claimed', 'spent'].includes(row.state))
    || new Set(groups.map(row => row.id)).size !== groups.length) return null;
  return groups;
}

/** The representative rolls once for this drilled group. A personal Test
 * does not spend the benefit; the group circumstance is a table judgement. */
export function militiaDrillChoice(value, kind) {
  if (!['skill', 'ability', 'resilience'].includes(kind)) return [];
  return (militiaDrillGroups(value) ?? []).filter(record => record.state === 'ready').map(record => ({
    id: `${MILITIA_DRILL_CHOICE}:${record.id}`, name: record.name ?? record.id,
    label: 'AZEROTH.MilitiaDrill.GroupTest', boons: 1, banes: 0, modifier: 0, checked: false }));
}

export function militiaDrillSelection(value, chosen, kind) {
  if (!Array.isArray(chosen) || chosen.some(id => typeof id !== 'string')) return { ok: false };
  const selected = chosen.filter(id => id === MILITIA_DRILL_CHOICE || id.startsWith(`${MILITIA_DRILL_CHOICE}:`));
  if (!selected.length) return { ok: true, record: null };
  if (selected.length !== 1) return { ok: false };
  const groups = militiaDrillGroups(value);
  const record = selected[0] === MILITIA_DRILL_CHOICE ? (groups?.length === 1 ? groups[0] : null)
    : groups?.find(row => selected[0] === `${MILITIA_DRILL_CHOICE}:${row.id}`);
  return record && militiaDrillChoice(record, kind).length ? { ok: true, record } : { ok: false };
}
