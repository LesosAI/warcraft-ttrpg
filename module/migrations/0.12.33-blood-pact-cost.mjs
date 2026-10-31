/** Approved Blood Pact cost: sacrifice demon Health without a Mana charge. */
import { packSystems, rawSystem, walkWorld } from "./walk.mjs";

const standard = system => system?.identifier === "blood-pact"
  && system.school === "fel" && system.tier === 2
  && system.source?.document === "07-MAGIC";

/** Preserve custom costs and all unrelated fields, including preparation. */
export function buildBloodPactCostUpdate(raw, pack) {
  if (!standard(raw) || !standard(pack) || pack.mana !== 0 || raw.mana !== 4) return null;
  return { "system.mana": 0 };
}

export async function migrate(log = console.log) {
  const spells = await packSystems("azeroth-rpg.spells");
  const pack = spells.byIdentifier.get("blood-pact");
  if (!standard(pack) || pack.mana !== 0) {
    throw new Error("Blood Pact's zero-Mana spell is missing. Rebuild packs and restart Foundry before retrying this migration.");
  }
  return walkWorld({ item: doc => doc.type === "spell"
    ? buildBloodPactCostUpdate(rawSystem(doc), pack) : null }, log);
}
