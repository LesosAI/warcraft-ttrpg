export const REACTION_BAR_FLAG = "reactionBar";
export const REACTION_BAR_REASON = "AZEROTH.ReactionBar.Refused";

export function earthShockBars(talents = [], { identifier, success = true, viaItem = null } = {}) {
  return success && !viaItem && identifier === "earth-shock" && talents.some(t =>
    String(t?.className).toLowerCase() === "shaman" && t.identifier === "earth-shock" && Number(t.taken) >= 2);
}

/** A restriction, not a spent Reaction: turn refresh and free reactions cannot bypass it. */
export function reactionBarred(actor) {
  return [...(actor?.effects ?? [])].some(effect => effect?.flags?.["azeroth-rpg"]?.[REACTION_BAR_FLAG]?.ownerUuid === actor.uuid
    && !effect.disabled && effect.active !== false && !effect.isSuppressed && !effect.duration?.expired);
}

export function reactionBarEffect({ actorUuid, cardUuid, timing, name = "Earth Shock: Reactions blocked" }) {
  return { name, img: "icons/svg/daze.svg", origin: cardUuid,
    ...timing, system: { changes: [] }, flags: { "azeroth-rpg": {
      [REACTION_BAR_FLAG]: { ownerUuid: actorUuid, cardUuid }
    } } };
}
