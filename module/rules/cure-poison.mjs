/** 07's Cure Poison: one poison, one disease, OR two Bleeding.
 * Selection only. The casting workflow owns payment, touch and the Test;
 * the GM owns classification of unfamiliar effects and document mutations.
 */
import { nullifyJudgement } from "./nullifier.mjs";

export function curePoisonJudgement(effect, options = {}) {
  const judged = nullifyJudgement(effect, options);
  if (!judged.ok) return judged;
  if (!["poison", "disease"].includes(judged.category)) {
    return { ok: false, reason: "notPoisonOrDisease", category: null };
  }
  return judged;
}

/** Current trusted target snapshot, never classifications from a query choice.
 * The returned effect ID means the WHOLE effect, including linked slowing/ticks.
 * Disease removal does not remove corruption or cure the underlying plague.
 */
export function curePoisonSelection(target, choice, { archmage = [] } = {}) {
  const refuse = reason => ({ ok: false, reason, effectId: null, bleeding: null });
  if (!target || typeof target.id !== "string" || !target.id) return refuse("missingTarget");
  if (!choice || choice.targetId !== target.id) return refuse("wrongTarget");
  if (choice.kind === "bleeding") {
    if (choice.effectId != null) return refuse("mixedChoice");
    const current = target.bleeding;
    if (!Number.isSafeInteger(current) || current <= 0) return refuse("noBleeding");
    return { ok: true, reason: null, effectId: null, bleeding: Math.max(0, current - 2) };
  }
  if (choice.kind !== "effect" || typeof choice.effectId !== "string" || !choice.effectId) return refuse("invalidChoice");
  const matches = (target.effects ?? []).filter(effect => effect.id === choice.effectId);
  if (matches.length !== 1) return refuse("missingEffect");
  const judged = curePoisonJudgement(matches[0], {
    classification: target.classifications?.[choice.effectId] ?? null, archmage
  });
  if (!judged.ok) return refuse(judged.reason);
  return { ok: true, reason: null, effectId: choice.effectId, bleeding: null };
}

/** Bleeding sources add (A1). Spend exactly two points across stable IDs,
 * preserving every unrelated status and every other property of each effect.
 */
export function cureBleedingPlan(effects = [], amount = 2) {
  const rows = effects.filter(e => !e.disabled && e.active !== false && [...(e.statuses ?? [])].includes("bleeding"))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (rows.some(e => typeof e.id !== "string" || !e.id) || new Set(rows.map(e => e.id)).size !== rows.length) return null;
  // `Infinity` is Cure Blight's "to 0": every point comes off.
  let remaining = amount, removed = 0;
  const updates = [];
  for (const effect of rows) {
    const value = effect.flags?.["azeroth-rpg"]?.value ?? 1;
    if (!Number.isSafeInteger(value) || value < 0) return null;
    if (!remaining || !value) continue;
    const take = Math.min(remaining, value), next = value - take;
    remaining -= take;
    removed += take;
    updates.push({ _id: effect.id, "flags.azeroth-rpg.value": next,
      ...(next === 0 ? { statuses: [...effect.statuses].filter(s => s !== "bleeding") } : {}) });
  }
  return { removed, updates };
}
