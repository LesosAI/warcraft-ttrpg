/** Classic's attack/casting slowdown expressed through the table's action
 * steps, not movement speed. A Full Action also consumes the Reaction. */
export const ANCIENT_DREAD = Object.freeze({ name: "Ancient Dread", action: "action",
  radius: 20, dc: 18, resilience: "spirit", minutes: 1, uses: 1, per: "short" });
export const ANCIENT_DREAD_FLAG = "ancientDread";

export function hasAncientDread(actor) {
  return [...(actor?.effects ?? [])].some(effect => !effect.disabled && !effect.isSuppressed
    && effect.active !== false && effect.flags?.["azeroth-rpg"]?.[ANCIENT_DREAD_FLAG]?.version === 1);
}

/** Call after discounts. Free, reaction and already-full costs remain unchanged.
 * The caller must identify an attack or cast; walking and other Uses are exempt. */
export function ancientDreadAction(action, { affected = false, attack = false, casting = false } = {}) {
  if (!affected || (!attack && !casting)) return action;
  return ({ half: "action", action: "full" })[action] ?? action;
}

export function ancientDreadEffect({ origin, timing } = {}) {
  if (typeof origin !== "string" || !origin.trim() || !timing?.duration || !timing?.start) return null;
  return { name: ANCIENT_DREAD.name, img: "icons/svg/clockwork.svg", origin, disabled: false,
    statuses: [], system: { changes: [] }, duration: { ...timing.duration }, start: { ...timing.start },
    flags: { "azeroth-rpg": { harmful: true, [ANCIENT_DREAD_FLAG]: { version: 1 } } } };
}
