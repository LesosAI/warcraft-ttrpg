/** Ancient Core Hound's Fire-defense penalty; tabletop numbers. */
export const CAUTERIZING_FLAMES = Object.freeze({ name: "Cauterizing Flames", action: "action",
  radius: 20, dc: 18, resilience: "body", reduction: 3, minutes: 1, uses: 1, per: "short" });
export const CAUTERIZING_FLAMES_FLAG = "cauterizingFlames";

export function cauterizingFlamesEffect({ origin, timing } = {}) {
  if (typeof origin !== "string" || !origin.trim() || !timing?.duration || !timing?.start) return null;
  return { name: CAUTERIZING_FLAMES.name, img: "icons/svg/fire.svg", origin, disabled: false,
    statuses: [], duration: { ...timing.duration }, start: { ...timing.start },
    system: { changes: [
      { key: "system.ward.fire", type: "subtract", value: "3", phase: "final", priority: 100 },
      { key: "system.ward.fire", type: "upgrade", value: "0", phase: "final", priority: 110 }
    ] },
    flags: { "azeroth-rpg": { harmful: true, [CAUTERIZING_FLAMES_FLAG]: { version: 1 } } } };
}
