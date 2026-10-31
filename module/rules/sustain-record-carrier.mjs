import { cleanAreaTick, emptyAreaTick, hasAreaTick } from "./area-ticks.mjs";

const shapeMatches = (value, shape) => {
  if (Array.isArray(shape)) return Array.isArray(value) && value.length === 0;
  if (shape && typeof shape === "object") return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every(key => Object.hasOwn(shape, key) && shapeMatches(value[key], shape[key]));
  return value === null || ["string", "number", "boolean"].includes(typeof value);
};
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;

/** Immolation's complete runtime carrier is its held record. It contains no
 * token/actor references: the current holder supplies centre and damage source.
 * Reject extensions until their relocation semantics have been reviewed. */
export function isRecordCarriedSustain(entry) {
  const tick = entry?.areaTick, spell = entry?.tickSpell;
  if (entry?.name !== "Immolation" || spell?.name !== "Immolation" || spell.school !== "fire"
    || !Object.keys(spell).every(key => ["name", "school", "tier", "takesSpellpower"].includes(key))
    || !shapeMatches(tick, emptyAreaTick()) || !hasAreaTick(tick) || tick.centre !== "self"
    || tick.lasts?.rounds !== null || tick.retaliate !== true) return false;
  return JSON.stringify(stable(cleanAreaTick(structuredClone(tick)))) === JSON.stringify(stable(tick));
}

export function hasTransferCarrierPlan(plan) {
  if (!plan?.relocation?.ok || !Array.isArray(plan.relocation.moves) || !Array.isArray(plan.relocation.removals)) return false;
  return plan.relocation.moves.length > 0 || (plan.relocation.recordOnly === true
    && plan.relocation.removals.length === 0 && plan.inventory?.effects?.length === 0
    && plan.inventory?.regions?.length === 0 && isRecordCarriedSustain(plan.inventory.entry)
    && isRecordCarriedSustain(plan.recipientEntry));
}
