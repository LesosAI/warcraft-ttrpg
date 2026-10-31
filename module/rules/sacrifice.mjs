import { AZEROTH } from "../config.mjs";

/** Approved 2026-10-29: Sacrifice raises the death threshold once, not per rank. */
export function deathStepLimitFor(talents = []) {
  return talents.some(t => String(t?.className ?? "").toLowerCase() === "paladin"
    && t.identifier === "sacrifice" && Number(t.taken) > 0)
    ? AZEROTH.SACRIFICE_DEATH_STEPS : AZEROTH.DEATH_STEPS;
}

/** The injury is transferred unchanged; rank changes reach, never its price. */
export function sacrificeOffer(talents = [], { distance = null, self = false,
  health = 0, mana = 0, reaction = false, inRealm = false } = {}) {
  const rank = Math.max(0, ...talents.filter(t => t?.identifier === "sacrifice"
    && String(t.className ?? "").toLowerCase() === "paladin").map(t => Number(t.taken) || 0));
  if (!rank || self || health <= 0 || inRealm || !reaction || mana < 4
    || !Number.isFinite(distance) || distance < 0 || distance > (rank >= 2 ? 60 : 30)) return null;
  return { cost: 4, range: rank >= 2 ? 60 : 30 };
}
