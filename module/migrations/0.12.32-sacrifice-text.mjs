/** Approved Sacrifice wording: four Death Steps, independent of rank. */
import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { plainOf } from "./0.12.12-paladin-areas.mjs";

const OLD = "As a Reaction, spend 4 Mana to take a Critical Injury a target within 30 feet would take. You may have one more Critical Injury before dying. At rank 2 the range is 60 feet.";
const CURRENT = OLD.replace("You may have one more Critical Injury before dying.", "You die at four Death Steps instead of three.");
const standard = system => system?.identifier === "sacrifice" && system.className === "Paladin" && system.branch === "Benediction";

export function buildSacrificeTextUpdate(raw, pack) {
  if (!standard(raw) || !standard(pack) || plainOf(pack.effect) !== plainOf(CURRENT)) return null;
  if (![plainOf(OLD), plainOf(CURRENT)].includes(plainOf(raw.effect ?? ""))) return null;
  return raw.effect === pack.effect ? null : {"system.effect": pack.effect};
}

export async function migrate(log = console.log) {
  const talents = await packSystems("azeroth-rpg.talents");
  const pack = talents.byIdentifier.get("sacrifice");
  if (!standard(pack) || plainOf(pack.effect) !== plainOf(CURRENT)) {
    throw new Error("Sacrifice's four-Death-Step pack text is missing. Rebuild packs and restart Foundry before retrying this migration.");
  }
  return walkWorld({item: doc => doc.type === "talent"
    ? buildSacrificeTextUpdate(rawSystem(doc), packCopy(talents, rawSystem(doc), doc.name)) : null}, log);
}
