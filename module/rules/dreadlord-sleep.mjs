/** Classic Sleep 12098, adapted to a short, damage-breakable enchantment. */
export const SLEEP_FLAG = "dreadlordSleep";
export const DREADLORD_SLEEP = Object.freeze({ name: "Sleep", action: "action", power: 2, feet: 30, dc: 18 });

export function sleepEligible({ kinds = [], immunities = [], health } = {}) {
  return Number.isFinite(health) && health > 0
    && !kinds.some(kind => ["undead", "construct"].includes(String(kind).toLowerCase()))
    && !immunities.includes("sleep");
}

export function hasDreadlordSleep(actor) {
  return [...(actor?.effects ?? [])].some(effect => effect.active !== false && !effect.disabled && !effect.isSuppressed
    && effect.flags?.["azeroth-rpg"]?.[SLEEP_FLAG]?.version === 1
    && effect.flags["azeroth-rpg"][SLEEP_FLAG].targetUuid === actor.uuid);
}

/** Being moved and resisting an incoming effect do not require waking up. */
export function sleepRefusal(actor, operation) {
  return hasDreadlordSleep(actor) && !["resilience", "forcedMovement"].includes(operation)
    ? "AZEROTH.Sleep.CannotAct" : null;
}

export function dreadlordSleepEffect({ origin, targetUuid, timing } = {}) {
  if (typeof origin !== "string" || !origin.trim() || typeof targetUuid !== "string" || !targetUuid.trim()
    || origin === targetUuid || !timing?.duration || !timing?.start) return null;
  return { name: "Sleep", img: "icons/svg/sleep.svg", origin, disabled: false,
    description: "<p>You are asleep. You cannot act, move or take Reactions. Losing Health ends this effect.</p>",
    // This is a dispellable enchantment, not a toggle of the Stunned condition.
    statuses: [], system: { changes: [{ key: "system.speed", type: "override", value: 0, phase: "final", priority: 100 }] },
    duration: { ...timing.duration }, start: { ...timing.start },
    flags: { "azeroth-rpg": { harmful: true, [SLEEP_FLAG]: { version: 1, targetUuid } } } };
}

/** Observe on every client for GM handoff. Loading an actor is never damage. */
export function sleepHealthObserver() {
  const health = new WeakMap(), losses = new WeakMap();
  return {
    losses(actor) { return losses.get(actor) ?? 0; },
    prime(actor) {
      if (actor && typeof actor === "object" && !health.has(actor)) health.set(actor, actor.system?.health?.value);
    },
    observe(actor) {
      if (!actor || typeof actor !== "object") return [];
      const before = health.get(actor), after = actor.system?.health?.value;
      health.set(actor, after);
      if (!Number.isFinite(before) || !Number.isFinite(after) || after < 0 || after >= before) return [];
      losses.set(actor, (losses.get(actor) ?? 0) + 1);
      return [...(actor.effects ?? [])].filter(effect => effect.id
        && effect.flags?.["azeroth-rpg"]?.[SLEEP_FLAG]?.version === 1
        && effect.flags["azeroth-rpg"][SLEEP_FLAG].targetUuid === actor.uuid).map(effect => effect.id);
    }
  };
}
