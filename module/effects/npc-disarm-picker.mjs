import { disarmOptions, disarmSelectionValid } from "../rules/npc-disarm-options.mjs";

export function disarmInventory(actor) {
  return { readyItems: actor?.readyWeapons?.() ?? [], rows: actor?.type === "npc" ? actor.system?.attacks ?? [] : [] };
}

/** Runs on the active GM, never trusts a client-supplied NPC weapon label. */
export async function pickDisarmWeapon(victim, { choose, valid } = {}) {
  const permitted = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && victim?.uuid && typeof valid === "function" && valid();
  if (!permitted() || typeof choose !== "function") return null;
  const options = disarmOptions(disarmInventory(victim));
  if (!options.length) return null;
  const menu = { id: `${victim.id}-disarm-weapon`, name: "Disarm" };
  const picked = await choose(menu, options.map(option => ({ key: option.key, name: option.name,
    description: option.confirmHeldWeapon ? "NPC attack row: the GM must confirm this is a held weapon, not a natural attack or body part."
      : "A currently held weapon. Disarm prevents using it for six seconds; it stays in the inventory." })), null,
  { prompt: "Choose the held weapon to disarm." });
  if (!picked || !permitted()) return null;
  const selection = options.find(option => option.key === picked.key);
  if (!selection) return null;
  let rowConfirmed = false;
  if (selection.confirmHeldWeapon) {
    const confirmed = await choose(menu, [
      { key: "cancel", name: "Cancel", description: "Do not apply Disarm to this attack row." },
      { key: "held", name: "Confirm held weapon", description: "This row represents a weapon held by the target, not a bite, claw, unarmed strike, spell or built-in mechanism." }
    ], null, { prompt: `GM: classify ${selection.name}.` });
    rowConfirmed = confirmed?.key === "held";
  }
  if (!permitted() || !disarmSelectionValid(selection, disarmInventory(victim), { rowConfirmed })) return null;
  return { selection, rowConfirmed };
}
