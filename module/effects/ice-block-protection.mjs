import { iceBlockFor } from "../rules/ice-block.mjs";

const valueAt = (change, path) => Object.hasOwn(change, path) ? change[path]
  : path.split(".").reduce((value, key) => value?.[key], change);
const touches = (change, path) => Object.keys(change).some(key => key === path || key.startsWith(`${path}.`))
  || valueAt(change, path) !== undefined;

/** Stop actual Health changes, including temporary Health, without obstructing
 * unrelated document bookkeeping. Higher-level damage/healing gates are also
 * needed to prevent their non-Health side effects. */
export function iceBlockHealthUpdateBlocked(actor, change = {}) {
  if (!iceBlockFor(actor)) return false;
  return ["value", "temp"].some(key => {
    const next = valueAt(change, `system.health.${key}`);
    return next !== undefined && next !== (actor.system?.health?.[key] ?? 0);
  });
}

/** New effects and renewed mechanics are blocked; native expiry, disabling,
 * condition removal and bookkeeping must remain possible. */
export function iceBlockEffectUpdateBlocked(effect, change = {}) {
  if (!iceBlockFor(effect?.parent) || change.disabled === true) return false;
  if (effect.disabled && change.disabled === false) return true;
  if (touches(change, "system.changes") || touches(change, "start")) return true;
  if (Object.keys(change).some(key => key.startsWith("statuses."))) return true;
  if (Array.isArray(change.statuses) && change.statuses.some(status => ![...(effect.statuses ?? [])].includes(status))) return true;
  const duration = valueAt(change, "duration.value"), units = valueAt(change, "duration.units");
  const expired = valueAt(change, "duration.expired"), expiry = valueAt(change, "duration.expiry");
  if (expired === false && (effect.duration?.expired || effect._source?.duration?.expired)) return true;
  // A null duration removes the limit. Changing/removing the expiry event can
  // likewise prolong or reactivate a held effect without increasing its value.
  if (duration === null && Number.isFinite(effect.duration?.value)) return true;
  if (expiry !== undefined && expiry !== effect.duration?.expiry) return true;
  if (Number.isFinite(duration) && duration > (effect.duration?.value ?? 0)) return true;
  if (units !== undefined && units !== effect.duration?.units) return true;
  const magnitude = valueAt(change, "flags.azeroth-rpg.value");
  return magnitude !== undefined && Number(magnitude) > Number(effect.flags?.["azeroth-rpg"]?.value ?? 1);
}

const notify = () => ui.notifications?.info(game.i18n.localize("AZEROTH.IceBlock.Protected"));
export function refuseIceBlockTarget(actor) {
  if (!iceBlockFor(actor)) return false;
  notify();
  return true;
}

export function registerIceBlockProtectionHooks() {
  // V14 calls this before committing movement, including forced displacement,
  // teleportation and changes of elevation/level. Do not consult turn budgets:
  // Ice Block forbids being moved even outside combat.
  Hooks.on("preMoveToken", document => {
    if (refuseIceBlockTarget(document.actor)) return false;
  });
  Hooks.on("preUpdateActor", (actor, change) => {
    if (iceBlockHealthUpdateBlocked(actor, change)) { notify(); return false; }
  });
  Hooks.on("preCreateActiveEffect", effect => {
    if (effect.parent?.documentName === "Actor" && iceBlockFor(effect.parent)) { notify(); return false; }
  });
  Hooks.on("preUpdateActiveEffect", (effect, change) => {
    if (effect.parent?.documentName === "Actor" && iceBlockEffectUpdateBlocked(effect, change)) { notify(); return false; }
  });
}
