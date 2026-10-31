import { resolveRecordedDamage } from "./damage-record.mjs";

/** Recompute a recorded hit with only the Ward change caused by this use.
 * Other defenses retain their attack-time values. The caller captures the
 * recipient's Ward maps immediately before and after replacing the effect.
 * Reaction marks remain separate and apply after this resolution.
 * Missing provenance refuses: final damage cannot reconstruct Ward's SL cut.
 */
export function foresightDamage(row, { schools = [], before = {}, after = {} } = {}) {
  const source = row?.mitigationSource;
  if (row?.hit !== true || row.withdrawn === true || source?.version !== 1
    || !source.input || typeof source.input !== "object" || Array.isArray(source.input)
    || !Number.isFinite(row.damage) || row.damage < 0) return null;
  const original = resolveRecordedDamage(source.input, { shrink: source.shrink ?? 0 });
  if (original.damage !== row.damage) return null;
  const input = structuredClone(source.input);
  input.wardBySchool = { ...(input.wardBySchool ?? {}) };
  for (const school of new Set(schools)) {
    if (typeof school !== "string" || school === "physical") continue;
    const oldWard = before[school] ?? 0, newWard = after[school] ?? 0;
    if (!Number.isFinite(oldWard) || !Number.isFinite(newWard) || oldWard < 0 || newWard < 0) return null;
    const delta = newWard - oldWard;
    input.wardBySchool[school] = Math.max(0, (input.wardBySchool[school] ?? 0) + delta);
    if (input.kind === "magical" && input.school === school)
      input.ward = Math.max(0, (input.ward ?? 0) + delta);
  }
  const resolution = resolveRecordedDamage(input, { shrink: source.shrink ?? 0 });
  return { resolution, prevented: row.damage - resolution.damage };
}
