import { ESCAPE_FLAG, cleanEscape } from "./escapes.mjs";

/** Physical net adaptation. Escape follows A1's Entangled rule. */
export const GUARD_NET = Object.freeze({ name: "Guard Net", action: "action", uses: 1,
  per: "encounter", feet: 20, dc: 12, condition: "entangled" });

export function guardNetTarget({ feet, alive, sameLevel, immune = false, hostile } = {}) {
  return Number.isFinite(feet) && feet >= 0 && feet <= GUARD_NET.feet
    && alive === true && sameLevel === true && hostile === true && immune === false;
}

/** One effect owns both the movement restriction and its removable escape.
 * No magical dispel tag, damage, timer or dependency on the thrower's survival. */
export function guardNetEffect({ sourceUuid, eventId } = {}) {
  if (typeof sourceUuid !== "string" || !sourceUuid.trim() || typeof eventId !== "string" || !eventId.trim()) return null;
  return { name: GUARD_NET.name, img: "icons/svg/net.svg", origin: sourceUuid, transfer: false, disabled: false,
    description: "Your Speed is 0. Spend an Action and pass a DC 12 Reflex Resilience Test to escape the net.",
    statuses: [GUARD_NET.condition],
    system: { changes: [{ key: "system.speed", type: "override", value: 0, phase: "final" }] },
    flags: { "azeroth-rpg": { identifier: "guard-net", guardNet: { sourceUuid, eventId }, harmful: true, magic: false,
      [ESCAPE_FLAG]: cleanEscape({ condition: GUARD_NET.condition, on: "action", resilience: "reflex",
        dc: GUARD_NET.dc, by: sourceUuid, source: GUARD_NET.name, banes: 0 }) } } };
}
