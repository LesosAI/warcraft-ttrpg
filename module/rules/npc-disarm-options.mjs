import { swingable } from "./held-attacks.mjs";

/** `readyItems` comes from the actor's readyWeapons door, so melded weapons
 * are not silently offered. NPC rows require a separate GM classification. */
export function disarmOptions({ readyItems = [], rows = [] } = {}) {
  const items = readyItems.filter(item => item?.id && !item.natural && swingable(item)
    && item.system?.identifier !== "unarmed").map(item => ({
    key: `item:${item.id}`, name: item.name, weapon: { kind: "item", itemId: item.id },
    confirmHeldWeapon: false
  }));
  const blockRows = rows.flatMap((row, index) => typeof row?.name === "string" && row.name.trim()
    ? [{ key: `row:${index}`, name: row.name, weapon: { kind: "npcRow", index, name: row.name }, confirmHeldWeapon: true }] : []);
  return [...items, ...blockRows];
}

/** Re-read after every choice and again before effect application. The GM's
 * explicit row classification is scoped to this selected row, not its name. */
export function disarmSelectionValid(selection, current, { rowConfirmed = false } = {}) {
  if (!selection?.key || !selection.weapon) return false;
  const live = disarmOptions(current).find(option => option.key === selection.key);
  if (!live || live.weapon.kind !== selection.weapon.kind) return false;
  if (live.weapon.kind === "item") return live.weapon.itemId === selection.weapon.itemId;
  return rowConfirmed === true && live.weapon.index === selection.weapon.index && live.weapon.name === selection.weapon.name;
}
