/** Classic spell 19369: brief disorientation and wandering, not fear or stun.
 * Table adaptation: until the end of the victim's next turn; one wander of
 * up to ten feet, limited by its current Speed, in a randomly selected direction. */
export const ANCIENT_DESPAIR = Object.freeze({ name: "Ancient Despair", action: "action",
  radius: 20, dc: 18, resilience: "spirit", wanderFeet: 10, uses: 1, per: "short" });
export const ANCIENT_DESPAIR_FLAG = "ancientDespair";
export const DESPAIR_DIRECTIONS = Object.freeze(["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]);

/** A direction only: the movement adapter must still validate walls, the scene,
 * occupied space and permission. Never turn this into an unchecked teleport. */
export function despairWander({ draw, speed } = {}) {
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1 || !Number.isFinite(speed) || speed < 0) return null;
  const index = Math.floor(draw * DESPAIR_DIRECTIONS.length);
  return { direction: DESPAIR_DIRECTIONS[index], bearing: index * 45,
    feet: Math.min(ANCIENT_DESPAIR.wanderFeet, speed) };
}

export function hasAncientDespair(actor) {
  return [...(actor?.effects ?? [])].some(effect => !effect.disabled && !effect.isSuppressed
    && effect.active !== false && effect.flags?.["azeroth-rpg"]?.[ANCIENT_DESPAIR_FLAG]?.version === 1);
}

/** Resisting an incoming effect and externally forced movement are not chosen
 * actions. All voluntary Uses, attacks, casts, reactions and movement wait. */
export function despairRefusal(actor, operation) {
  if (!hasAncientDespair(actor) || ["resilience", "forcedMovement"].includes(operation)) return null;
  return "AZEROTH.AncientDespair.CannotAct";
}

export function ancientDespairEffect({ origin, timing } = {}) {
  if (typeof origin !== "string" || !origin.trim() || !timing?.duration || !timing?.start) return null;
  return { name: ANCIENT_DESPAIR.name, img: "icons/svg/daze.svg", origin, disabled: false,
    statuses: [], system: { changes: [] }, duration: { ...timing.duration }, start: { ...timing.start },
    flags: { "azeroth-rpg": { harmful: true, [ANCIENT_DESPAIR_FLAG]: { version: 1, wandered: false } } } };
}
