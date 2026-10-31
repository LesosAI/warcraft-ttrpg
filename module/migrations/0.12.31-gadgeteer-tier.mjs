/** Gadgeteer's one rank and tier allowance (lead ruling, 2026-10-24).
 * Refresh standard text without replacing a GM's custom description. The lower
 * taken rank returns its point through the existing derived talent budget. */
import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { plainOf } from "./0.12.12-paladin-areas.mjs";
import { withoutGadgetLinks } from "../rules/gadgets.mjs";

const OLD = "You know two gadgets from the Gadgets table below, or four at rank 2. Each gadget you know may be used once between Short Rests. Changing one you know takes a week of downtime.";

export function buildGadgeteerUpdate(raw, pack) {
  if (raw?.identifier !== "gadgeteer" || raw.className !== "Rogue" || raw.branch !== "Tinker") return null;
  if (pack?.ranks !== 1 || !pack.effect?.includes("2 + your tier")) return null;
  const text = plainOf(withoutGadgetLinks(raw.effect ?? ""));
  const current = plainOf(withoutGadgetLinks(pack.effect));
  if (text !== plainOf(OLD) && text !== current) return null;
  const update = {};
  if (raw.ranks !== 1) update["system.ranks"] = 1;
  if (Number(raw.taken) > 1) update["system.taken"] = 1;
  if (raw.effect !== pack.effect) update["system.effect"] = pack.effect;
  return Object.keys(update).length ? update : null;
}

export async function migrate(log = console.log) {
  const talents = await packSystems("azeroth-rpg.talents");
  const pack = talents.byIdentifier.get("gadgeteer");
  if (pack?.ranks !== 1 || !pack.effect?.includes("2 + your tier"))
    throw new Error("Gadgeteer's updated pack is missing. Rebuild the packs and restart Foundry before retrying this migration.");
  return walkWorld({ item: doc => doc.type === "talent"
    ? buildGadgeteerUpdate(rawSystem(doc), packCopy(talents, rawSystem(doc), doc.name)) : null }, log);
}
