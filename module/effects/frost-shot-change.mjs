/** Verified against Foundry 14.367 ActiveEffect.applyChange and NumberField's
 * multiply handler. Separate hit durations share one Slowed speed penalty. */
import { FROST_SHOT_CHANGE, frostShotSpeedCarrier } from "../rules/frost-shot.mjs";

export function applyFrostShotChange(target, change, { modifyTarget = true } = {}) {
  if (!modifyTarget || change?.type !== FROST_SHOT_CHANGE || change.key !== "system.speed"
    || !Number.isFinite(target?.system?.speed) || !change.effect?.id
    || typeof target.allApplicableEffects !== "function") return;
  const effects = Array.from(target.allApplicableEffects());
  if (!effects.includes(change.effect)) return;
  const carrier = frostShotSpeedCarrier(effects, target.uuid);
  const ownChange = change.effect.system?.changes?.find(entry => entry.type === FROST_SHOT_CHANGE);
  if (carrier !== change.effect.id || ownChange?.value !== change.value || change.phase !== "final") return;
  target.system.speed *= 0.5;
}

export function registerFrostShotChange() {
  CONFIG.ActiveEffect.changeTypes[FROST_SHOT_CHANGE] = {
    label: "Frost Shot: Slowed", defaultPriority: 10, handler: applyFrostShotChange
  };
}
