/** O-185 / D-779: Miracle promises the next healing spell an unreduced heal. */
import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { plainOf } from "./0.12.12-paladin-areas.mjs";

const OLD = "Once per Long Rest, one healing feature of yours restores its full amount to every friendly target within 60 feet without a Casting Test.";
const CURRENT = "Once per Long Rest, invoke a miracle: your next healing spell requires no Casting Test, and its healing cannot be reduced.";
const standard = system => system?.identifier === "miracle" && system.className === "Priest" && system.branch === "Radiance";

export function buildMiracleTextUpdate(raw, pack) {
  if (!standard(raw) || !standard(pack) || plainOf(pack.effect) !== plainOf(CURRENT)) return null;
  if (![plainOf(OLD), plainOf(CURRENT)].includes(plainOf(raw.effect ?? ""))) return null;
  return raw.effect === pack.effect ? null : { "system.effect": pack.effect };
}

export async function migrate(log = console.log) {
  const talents = await packSystems("azeroth-rpg.talents");
  const pack = talents.byIdentifier.get("miracle");
  if (!standard(pack) || plainOf(pack.effect) !== plainOf(CURRENT)) {
    throw new Error("Miracle's approved next-healing-spell text is missing. Rebuild packs and restart Foundry before retrying this migration.");
  }
  return walkWorld({ item: doc => doc.type === "talent"
    ? buildMiracleTextUpdate(rawSystem(doc), packCopy(talents, rawSystem(doc), doc.name)) : null }, log);
}
