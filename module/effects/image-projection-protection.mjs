import { projectionPhaseFor } from "../rules/image-projection.mjs";

export function refuseProjectionTarget(actor) {
  if (!projectionPhaseFor(actor)) return false;
  ui.notifications?.info(game.i18n.localize("AZEROTH.ImageProjection.ProtectedEffect"));
  return true;
}

/** Block new applications, not expiry or removal of effects already present. */
export function projectionEffectUpdateBlocked(effect, change = {}) {
  if (!projectionPhaseFor(effect?.parent) || change.disabled === true) return false;
  if (effect.disabled && change.disabled === false) return true;
  const touches = path => Object.keys(change).some(key => key === path || key.startsWith(`${path}.`));
  if (touches("system.changes") || Object.hasOwn(change.system ?? {}, "changes")) return true;
  if (Object.keys(change).some(key => key.startsWith("statuses."))) return true;
  if (Array.isArray(change.statuses) && change.statuses.some(status => ![...(effect.statuses ?? [])].includes(status))) return true;
  if (touches("start") || Object.hasOwn(change, "start")) return true;
  const duration = change["duration.value"] ?? change.duration?.value;
  if (Number.isFinite(duration) && duration > (effect.duration?.value ?? 0)) return true;
  const units = change["duration.units"] ?? change.duration?.units;
  if (units !== undefined && units !== effect.duration?.units) return true;
  const value = change["flags.azeroth-rpg.value"] ?? change.flags?.["azeroth-rpg"]?.value;
  if (value !== undefined && Number(value) > Number(effect.flags?.["azeroth-rpg"]?.value ?? 1)) return true;
  return false;
}

export function registerProjectionProtectionHooks() {
  Hooks.on("preCreateActiveEffect", effect => {
    if (effect.parent?.documentName === "Actor" && refuseProjectionTarget(effect.parent)) return false;
  });
  Hooks.on("preUpdateActiveEffect", (effect, change) => {
    if (effect.parent?.documentName === "Actor" && projectionEffectUpdateBlocked(effect, change)) {
      refuseProjectionTarget(effect.parent);
      return false;
    }
  });
}
