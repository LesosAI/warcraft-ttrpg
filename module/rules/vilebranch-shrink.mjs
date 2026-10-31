/** Spell 7289, not 8066: a dispellable curse of Strength/Stamina and visual
 * scale. Tabletop scores use Constitution for Stamina. No size-category,
 * reach, Speed or direct Health mutation is part of this adaptation. */
export const VILEBRANCH_SHRINK = Object.freeze({ name: "Vilebranch Shrink",
  action: "action", mana: 2, range: 60, dc: 17, resilience: "spirit",
  reduction: 2, floor: 1, minutes: 2, visualScale: 0.7 });
export const VILEBRANCH_SHRINK_FLAG = "vilebranchShrink";

/** Multiple carriers never compound the visual multiplier. Core's active
 * state includes suppression; expired effects stop contributing immediately. */
export function vilebranchShrinkScale(effects = []) {
  return [...effects].some(effect => !effect.disabled && effect.active !== false
    && !effect.isSuppressed && !effect.duration?.expired
    && effect.flags?.["azeroth-rpg"]?.[VILEBRANCH_SHRINK_FLAG]?.version === 1)
    ? VILEBRANCH_SHRINK.visualScale : 1;
}

export function vilebranchShrinkChanges(abilities = {}) {
  return ["str", "con"].flatMap(key => {
    if (!Number.isFinite(abilities?.[key]?.value) || abilities[key].value < 1) return [];
    const path = `system.abilities.${key}.value`;
    return [
      { key: path, type: "subtract", value: String(VILEBRANCH_SHRINK.reduction), phase: "initial", priority: 20 },
      { key: path, type: "upgrade", value: String(VILEBRANCH_SHRINK.floor), phase: "initial", priority: 30 }
    ];
  });
}

export function vilebranchShrinkEffect({ abilities, origin, timing } = {}) {
  const changes = vilebranchShrinkChanges(abilities);
  if (!changes.length || typeof origin !== "string" || !origin.trim()
    || !timing?.duration || !timing?.start) return null;
  return { name: VILEBRANCH_SHRINK.name, img: "icons/svg/downgrade.svg", origin,
    disabled: false, statuses: [], system: { changes },
    duration: { ...timing.duration }, start: { ...timing.start },
    flags: { "azeroth-rpg": { harmful: true, curse: true,
      [VILEBRANCH_SHRINK_FLAG]: { version: 1, visualScale: VILEBRANCH_SHRINK.visualScale } } } };
}
