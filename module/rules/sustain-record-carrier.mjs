import { cleanAreaTick, emptyAreaTick, hasAreaTick } from "./area-ticks.mjs";
import { mirrorImageState } from './mirror-image.mjs';

const shapeMatches = (value, shape) => {
  if (Array.isArray(shape)) return Array.isArray(value) && value.length === 0;
  if (shape && typeof shape === "object") return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every(key => Object.hasOwn(shape, key) && shapeMatches(value[key], shape[key]));
  return value === null || ["string", "number", "boolean"].includes(typeof value);
};
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;

/** Allow reviewed spells whose complete runtime carrier is their held record.
 * Reject extensions until their relocation semantics have been reviewed. */
export function isRecordCarriedSustain(entry) {
  // These defenses live on the held cast. Recipient preparation rebases the
  // pool and source/targets; Mirror Image retains its exact remaining count.
  // Neither transfer manufactures an Active Effect or replenishes resources.
  const mirror=entry?.identifier==='mirror-image'&&entry.name==='Mirror Image';
  if(mirror || entry?.identifier==='mana-shield'&&entry.name==='Mana Shield'){
    const keys=new Set(['spellId','uuid','name','itemId','cast','identifier','targets','source','upkeep']);
    if(mirror){
      if(!mirrorImageState(entry))return false;
      keys.add('mirrorImages');
    }
    return typeof entry.cast==='string'&&entry.cast.trim().length>0
      &&typeof entry.uuid==='string'&&entry.uuid.trim().length>0
      &&Object.hasOwn(entry,'itemId')&&(entry.itemId===null||typeof entry.itemId==='string'&&entry.itemId.trim().length>0)
      &&Object.keys(entry).every(key=>keys.has(key));
  }
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
