/** 05: a side chooses its order. This only plans an order of existing slots;
 * it never starts a turn, resets a budget, or decides who may request a move.
 * Extra turns required immediately after an owner remain attached to that owner.
 */
export function planNextSideTurn(slots, { currentKey = null, selectedKey } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!Array.isArray(slots) || !slots.length) return refuse("invalidSlots");
  const keys = new Set(), normals = new Set(), seenSides = new Set();
  let groupOwner = null, groupSide = null, lastSide = null;
  for (const slot of slots) {
    if (!slot || typeof slot.key !== "string" || !slot.key || keys.has(slot.key)
      || typeof slot.id !== "string" || !slot.id || typeof slot.extra !== "boolean"
      || !["friendly", "hostile"].includes(slot.side)) return refuse("invalidSlots");
    keys.add(slot.key);
    if (slot.side !== lastSide) {
      if (seenSides.has(slot.side)) return refuse("invalidSlots");
      seenSides.add(slot.side); lastSide = slot.side;
    }
    if (slot.extra) {
      if (!groupOwner || slot.ownerId !== groupOwner || slot.side !== groupSide) return refuse("invalidSlots");
    } else {
      if (normals.has(slot.id)) return refuse("invalidSlots");
      normals.add(slot.id); groupOwner = slot.id; groupSide = slot.side;
    }
  }
  const current = currentKey === null ? -1 : slots.findIndex(slot => slot.key === currentKey);
  if (currentKey !== null && current < 0) return refuse("unknownCurrent");
  const selected = slots.findIndex(slot => slot.key === selectedKey);
  if (selected < 0) return refuse("unknownSelected");
  if (selected <= current) return refuse("alreadyStarted");
  if (slots[selected].extra) return refuse("fixedExtra");
  const side = slots[current < 0 ? 0 : current].side;
  if (slots[selected].side !== side) return refuse("wrongSide");

  // Do not insert between the current owner and any mandatory extra turns.
  let insert = current + 1;
  if (current >= 0) {
    const ownerId = slots[current].extra ? slots[current].ownerId : slots[current].id;
    while (slots[insert]?.extra && slots[insert].ownerId === ownerId) insert++;
  }
  let end = selected + 1;
  while (slots[end]?.extra && slots[end].ownerId === slots[selected].id) end++;
  const ordered = [...slots.slice(0, insert), ...slots.slice(selected, end),
    ...slots.slice(insert, selected), ...slots.slice(end)];
  return { ok: true, keys: ordered.map(slot => slot.key), changed: selected !== insert };
}
