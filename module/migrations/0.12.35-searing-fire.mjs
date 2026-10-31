/** Restore the authored Fire school on existing Searing Totem attacks. */
import { walkWorld } from "./walk.mjs";

const SOURCE = "Compendium.azeroth-rpg.bestiary.Actor.HchBm9kjigtcRz1D";

export function buildSearingFireUpdate(raw) {
  if (raw?.type !== "npc") return null;
  const original = raw._stats?.compendiumSource ?? raw.flags?.core?.sourceId;
  if (original !== SOURCE && !(raw.name === "Searing Totem" && raw.system?.source?.document === "14-BESTIARY")) return null;
  const attacks = raw.system?.attacks;
  if (!Array.isArray(attacks)) return null;
  let changed = false;
  const updated = attacks.map(attack => {
    // Only the old school-less trait list is repaired. Custom school/trait
    // choices remain the GM's; all other attack fields are preserved.
    if (attack.name !== "Searing flame" || attack.traits?.length !== 1 || attack.traits[0] !== "Range 30 ft") return attack;
    changed = true;
    return { ...attack, traits: [...attack.traits, "Flaming"] };
  });
  return changed ? { "system.attacks": structuredClone(updated) } : null;
}

export async function migrate(log = console.log) {
  return walkWorld({ actor: doc => buildSearingFireUpdate(doc.toObject()) }, log);
}
