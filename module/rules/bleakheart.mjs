/** Classic 6947 -> 6946 -> 6945: melee proc, lingering curse, periodic
 * chest-pain proc. Five percent is one face of a d20, not an attack crit.
 * Damage and round cadence below are deliberate tabletop adaptations. */
export const BLEAKHEART = Object.freeze({ name: "Curse of the Bleakheart",
  minutes: 3, procFace: 1, die: 20, damage: 2, school: "shadow",
  condition: "stunned", seconds: 6 });
export const BLEAKHEART_FLAG = "bleakheartCurse";

export function bleakheartProc(face) {
  if (!Number.isInteger(face) || face < 1 || face > BLEAKHEART.die) return null;
  return face === BLEAKHEART.procFace;
}

/** The curse carries no constant stat penalty. The separate tick resolver
 * owns each possible pain/stun, and the normal Dispel path removes the curse. */
export function bleakheartCurseEffect({ origin, timing } = {}) {
  if (typeof origin !== "string" || !origin.trim() || !timing?.duration || !timing?.start) return null;
  return { name: BLEAKHEART.name, img: "icons/svg/terror.svg", origin,
    disabled: false, statuses: [], system: { changes: [] },
    duration: { ...timing.duration }, start: { ...timing.start },
    flags: { "azeroth-rpg": { harmful: true, curse: true,
      [BLEAKHEART_FLAG]: { version: 1 } } } };
}
