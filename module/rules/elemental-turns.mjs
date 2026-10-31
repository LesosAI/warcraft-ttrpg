/** 04, Elemental Mastery: a second turn immediately after the owner's.
 * Slots reference the SAME combatant. Budgets, resources, reactions, movement,
 * effects and once-per-round marks therefore keep their existing single owner.
 */
export function elementalTurnSlots(ordered = []) {
  const granted = new Set();
  // Multiple tokens may reference one world actor. Use its earliest combatant,
  // not whichever token's name happens to sort first after a reinforcement joins.
  const primary = new Map();
  for (const row of [...ordered].sort((a,b) => (a.sourceOrder ?? ordered.indexOf(a)) - (b.sourceOrder ?? ordered.indexOf(b)))) {
    if (row.actorUuid && !primary.has(row.actorUuid)) primary.set(row.actorUuid, row.id);
  }
  const slots = [];
  for (const owner of ordered) {
    slots.push({ key: `normal:${owner.id}`, id: owner.id, extra: false, side: owner.side });
    const trained = (owner.talents ?? []).some(t => String(t?.className).toLowerCase() === "shaman"
      && t.identifier === "elemental-mastery" && Number(t.taken) > 0);
    if (!trained || !owner.actorUuid || primary.get(owner.actorUuid) !== owner.id) continue;
    for (const elemental of ordered) {
      if (elemental.id === owner.id || elemental.bond?.kind !== "elemental"
        || elemental.bond.ownerUuid !== owner.actorUuid || !elemental.actorUuid
        || primary.get(elemental.actorUuid) !== elemental.id || granted.has(elemental.actorUuid)) continue;
      granted.add(elemental.actorUuid);
      slots.push({ key: `mastery:${owner.id}:${elemental.id}`, id: elemental.id,
        extra: true, ownerId: owner.id, side: owner.side });
    }
  }
  return slots;
}

/** Keep the selected occurrence when a document update recomputes turn order. */
export function matchingTurnSlot(slots = [], key = null) {
  return key ? slots.findIndex(slot => slot.key === key) : -1;
}
