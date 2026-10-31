/** Withering Heat keeps its initial loss when refreshed, avoiding compounding. */
export const WITHERING_HEAT = Object.freeze({ name: "Withering Heat", action: "action",
  radius: 20, dc: 18, resilience: "body", fraction: 0.35, minutes: 1, uses: 1, per: "short" });
export const WITHERING_HEAT_FLAG = "witheringHeat";

export function witheringLoss(maximum, held = null) {
  if (held !== null) return held?.version === 1 && Number.isInteger(held.loss) && held.loss >= 0 ? held.loss : null;
  if (!Number.isInteger(maximum) || maximum < 1) return null;
  return Math.min(maximum - 1, Math.ceil(maximum * WITHERING_HEAT.fraction));
}

export function witheringClamp(health = {}) {
  if (!Number.isInteger(health.value) || health.value < 0 || !Number.isInteger(health.max) || health.max < 1) return null;
  return Math.min(health.value, health.max);
}

export function witheringHeatEffect({ loss, origin, timing } = {}) {
  if (!Number.isInteger(loss) || loss < 0 || typeof origin !== "string" || !origin.trim() || !timing?.duration || !timing?.start) return null;
  return { name: WITHERING_HEAT.name, img: "icons/svg/fire.svg", origin, disabled: false,
    statuses: [], duration: { ...timing.duration }, start: { ...timing.start },
    system: { changes: [
      { key: "system.health.max", type: "subtract", value: String(loss), phase: "final", priority: 100 },
      { key: "system.health.max", type: "upgrade", value: "1", phase: "final", priority: 110 }
    ] },
    flags: { "azeroth-rpg": { harmful: true, [WITHERING_HEAT_FLAG]: { version: 1, loss } } } };
}
