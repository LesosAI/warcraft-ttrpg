/** One carried poison dose per trap, at either Snake Trap rank. */
export function sameSnakeTrapRule(current, selected) {
  return Boolean(current && selected && ["first", "all"].includes(selected.reach)
    && selected.resilience === "reflex" && current.reach === selected.reach
    && current.resilience === selected.resilience);
}

export function snakeTrapDosePlan({ item, trapId, expectedUse } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (typeof trapId !== "string" || !trapId.trim()) return refuse("identity");
  if (item?.type !== "gear" || item.system?.use?.kind !== "poison") return refuse("poison");
  const receipts = item.flags?.["azeroth-rpg"]?.snakeTrapDoses ?? [];
  if (!Array.isArray(receipts) || receipts.some(id => typeof id !== "string")) return refuse("receipts");
  if (receipts.includes(trapId)) return refuse("alreadySpent");
  const quantity = item.system.quantity;
  if (!Number.isInteger(quantity) || quantity < 1) return refuse("empty");
  if (JSON.stringify(item.system.use) !== JSON.stringify(expectedUse)) return refuse("changed");
  return { ok: true, poison: { name: item.name, system: { use: structuredClone(item.system.use) } },
    update: { "system.quantity": quantity - 1, "flags.azeroth-rpg.snakeTrapDoses": [...receipts, trapId] } };
}
