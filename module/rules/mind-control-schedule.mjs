export const MIND_CONTROL_SCHEDULE = "mindControlSchedule";

/** A saved order changes placement only. Never duplicate slots, resurrect a
 * removed combatant, or carry last round's completed prefix into a new round.
 */
export function mindControlScheduledSlots(base = [], record = null, round = 0) {
  if (record?.version !== 1 || record.round !== round || !Array.isArray(record.keys)
    || record.keys.some(key => typeof key !== "string")
    || new Set(record.keys).size !== record.keys.length) return [...base];
  const byKey=new Map(base.map(slot=>[slot.key,slot]));
  const saved=record.keys.filter(key=>byKey.has(key));
  const used=new Set(saved);
  return [...saved.map(key=>byKey.get(key)),...base.filter(slot=>!used.has(slot.key))];
}
