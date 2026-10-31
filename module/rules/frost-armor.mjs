import { sentinelThornsHit } from "./sentinel-thorns.mjs";
import { frostShotEffect } from "./frost-shot.mjs";

/** Read the spell marker written by the normal spell-card Apply path.
 * A renamed ordinary effect or an uncast spell item is not Frost Armor. */
export function frostArmorCarrier(effects = []) {
  return Array.from(effects).find(effect => {
    const flags = effect?.flags?.["azeroth-rpg"];
    return effect?.active === true && !effect.disabled && !effect.isSuppressed && !effect.duration?.expired
      && typeof flags?.spell === "string" && flags.spell.length > 0
      && (flags.identifier === "frost-armor" || (!flags.identifier && flags.spellName === "Frost Armor"));
  }) ?? null;
}

export function frostArmorTriggered({ effects, hit, immunities = [] } = {}) {
  return !Array.from(immunities).includes("slowed") && Boolean(frostArmorCarrier(effects)) && sentinelThornsHit(hit);
}

/** Reuse the independent slowing carrier's speed arbitration, not a second
 * multiplicative penalty. Its frostShot marker is the shared implementation
 * contract; frostArmor distinguishes this spell's source for cleanup. */
export function frostArmorSlowEffect({ sourceUuid, targetUuid, messageUuid, timing } = {}) {
  const effect = frostShotEffect({ sourceUuid, targetUuid, messageUuid, timing });
  if (!effect) return null;
  effect.name = "Frost Armor — Slowed";
  effect.flags["azeroth-rpg"].frostArmor = { sourceUuid, targetUuid, messageUuid };
  return effect;
}
