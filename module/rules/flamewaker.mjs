/** Reviewed Classic Flamewaker abilities; tabletop costs and numbers. */
import { LOCATIONS } from "./mitigation.mjs";
export const FLAMEWAKER_SUNDER_FLAG = "flamewakerSunder";
export const FLAMEWAKER_ABILITIES = Object.freeze({
  "Sentinel Shadow Storm": Object.freeze({ name: "Sentinel Shadow Storm", action: "action", power: 0,
    radius: 30, innerRadius: 10, sentinelPower: "shadow-storm", dc: 20, resilience: "spirit",
    kind: "damage", damage: 8, school: "shadow", half: true }),
  "Sentinel Thunderclap": Object.freeze({ name: "Sentinel Thunderclap", action: "action", power: 0,
    radius: 10, sentinelPower: "thunderclap", dc: 20, resilience: "body",
    kind: "damage", damage: 8, school: "nature", half: true }),
  // The Mindslayer uses this same reviewed paid area-damage path. Its name
  // distinguishes the Classic NPC burst from chapter 07's single-target spell.
  "Qiraji Mind Blast": Object.freeze({ name: "Qiraji Mind Blast", action: "action", power: 3, radius: 10,
    dc: 20, resilience: "spirit", kind: "damage", damage: 8, school: "shadow", half: true }),
  "Sunder Armor": Object.freeze({ name: "Sunder Armor", action: "action", power: 0, radius: 10,
    dc: 20, resilience: "body", kind: "sunder", cap: 5, minutes: 1 }),
  "Fist of Ragnaros": Object.freeze({ name: "Fist of Ragnaros", action: "action", power: 2, radius: 10,
    dc: 20, resilience: "body", kind: "stun", uses: 1, per: "short" }),
  "Shadow Shock": Object.freeze({ name: "Shadow Shock", action: "action", power: 3, radius: 10,
    dc: 20, resilience: "spirit", kind: "damage", damage: 8, school: "shadow", half: true })
});

export function validFlamewakerSunder(state, targetUuid = state?.targetUuid) {
  return state?.version === 1 && typeof targetUuid === "string" && targetUuid.length > 0
    && state.targetUuid === targetUuid && Number.isInteger(state.stacks)
    && state.stacks >= 1 && state.stacks <= FLAMEWAKER_ABILITIES["Sunder Armor"].cap;
}

/** One carrier, regardless of which Flamewaker adds the next stack. */
export function nextFlamewakerSunder({ targetUuid, existing = null } = {}) {
  if (typeof targetUuid !== "string" || !targetUuid.trim()) return null;
  if (existing !== null && !validFlamewakerSunder(existing, targetUuid)) return null;
  return { version: 1, targetUuid, stacks: Math.min(5, (existing?.stacks ?? 0) + 1) };
}

/** Do not manufacture a head or limbs on an actor whose location is null. */
export function flamewakerSunderChanges(ap, stacks) {
  if (!Number.isInteger(stacks) || stacks < 1 || stacks > 5) return [];
  return LOCATIONS.filter(location => Number.isFinite(ap?.[location])).flatMap(location => [
    { key: `system.ap.${location}`, type: "subtract", value: String(stacks), phase: "final", priority: 100 },
    { key: `system.ap.${location}`, type: "upgrade", value: "0", phase: "final", priority: 110 }
  ]);
}

export function flamewakerSunderEffect({ state, origin, ap, timing } = {}) {
  if (!validFlamewakerSunder(state) || typeof origin !== "string" || !origin.trim()
    || !timing?.start || !timing?.duration) return null;
  const changes = flamewakerSunderChanges(ap, state.stacks);
  if (!changes.length) return null;
  return { name: "Sunder Armor", img: "icons/svg/hazard.svg", origin, disabled: false, statuses: [],
    description: `<p>Armor Points are reduced by ${state.stacks}, to a minimum of 0. This effect ends after one minute or a Short Rest.</p>`,
    system: { changes }, start: { ...timing.start }, duration: { ...timing.duration },
    flags: { "azeroth-rpg": { harmful: true, sundered: true, [FLAMEWAKER_SUNDER_FLAG]: { ...state } } } };
}
