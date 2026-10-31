/** Explicit tabletop adaptation of Classic Cause Insanity 26079.
 * Direction remains table-managed; ownership and initiative are never rewritten.
 */
export const INSANITY_FLAG = "causeInsanity";
export const CAUSE_INSANITY = Object.freeze({ name: "Cause Insanity", action: "action",
  mana: 4, feet: 30, dc: 20, resilience: "spirit", uses: 1, per: "short", speed: 10 });

export function insanityEligible({ health, typeMarker = "", immunities = [] } = {}) {
  return Number.isFinite(health) && health > 0 && String(typeMarker).toLowerCase() !== "mindless"
    && Array.isArray(immunities) && !immunities.includes("charmed");
}

export function validInsanityState(state, targetUuid) {
  return state?.version === 1 && typeof targetUuid === "string" && !!targetUuid.trim()
    && state.targetUuid === targetUuid && typeof state.sourceUuid === "string"
    && !!state.sourceUuid.trim() && state.sourceUuid !== targetUuid;
}

/** One active carrier grants the normal two-roll Attack, not an additive count.
 * The ordinary attack door still excludes off-hand and Reaction attacks.
 */
export function hasCauseInsanity(actor) {
  return [...(actor?.effects ?? [])].some(effect => effect.active !== false && !effect.disabled
    && !effect.isSuppressed && validInsanityState(effect.flags?.["azeroth-rpg"]?.[INSANITY_FLAG], actor?.uuid));
}

export function causeInsanityEffect({ sourceUuid, targetUuid, timing } = {}) {
  const state = { version: 1, sourceUuid, targetUuid };
  if (!validInsanityState(state, targetUuid)) return null;
  const duration = timing?.duration, start = timing?.start;
  if (!duration || !start) return null;
  const world = duration.units === "seconds" && duration.value === 6 && Number.isFinite(start.time);
  const combat = duration.units === "turns" && duration.value === 1 && duration.expiry === "turnEnd"
    && typeof start.combat === "string" && !!start.combat && typeof start.combatant === "string" && !!start.combatant
    && Number.isInteger(start.round) && start.round >= 1 && Number.isInteger(start.turn) && start.turn >= 0;
  if (!world && !combat) return null;
  return {
    name: CAUSE_INSANITY.name, img: "icons/svg/terror.svg", origin: sourceUuid, disabled: false,
    description: "<p>Until the end of your next turn, the Mindslayer directs your actions. Keep your normal Initiative and player ownership; the GM gives directions and you make the rolls. Your Speed increases by 10 feet, and you make two weapon attacks each time you take the Attack action. This does not add attacks to Extra Attack, an off-hand attack or a Reaction. Ending this effect ends both benefits.</p>",
    statuses: ["charmed"], duration: { ...duration }, start: { ...start },
    system: { changes: [{ key: "system.speed", type: "add", value: CAUSE_INSANITY.speed, phase: "final", priority: 5 }] },
    flags: { "azeroth-rpg": { harmful: true, [INSANITY_FLAG]: state } }
  };
}
