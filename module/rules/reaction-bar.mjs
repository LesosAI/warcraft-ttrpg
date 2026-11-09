export const REACTION_BAR_FLAG = "reactionBar";
export const REACTION_BAR_REASON = "AZEROTH.ReactionBar.Refused";

export function earthShockBars(talents = [], { identifier, success = true, viaItem = null } = {}) {
  return success && !viaItem && identifier === "earth-shock" && talents.some(t =>
    String(t?.className).toLowerCase() === "shaman" && t.identifier === "earth-shock" && Number(t.taken) >= 2);
}

/** A restriction, not a spent Reaction: turn refresh and free reactions cannot bypass it. */
export function reactionBarred(actor) {
  return reactionBarReason(actor) !== null;
}

/** The reason a creature under 04's Weight of Ages at rank 3 takes no Reaction (stage 3B). */
export const WEIGHT_BAR_REASON = "AZEROTH.WeightOfAges.NoReaction";

/**
 * **WHY A CREATURE MAY TAKE NO REACTION AT ALL**, or null: an Earth Shock's bar on it, or -
 * 04's Weight of Ages at rank 3, *it also has no Reaction* - a Slowed laid by a holder of
 * that rank, which the actor reads off who laid its Slowed (`AzerothActor#weightOfAgesBar`).
 * Both are restrictions, not a spent Reaction: neither a turn's refresh nor a free Reaction
 * passes them.
 *
 * @param {Actor} actor
 * @returns {string|null}  an i18n key
 */
export function reactionBarReason(actor) {
  const shocked = [...(actor?.effects ?? [])].some(effect => effect?.flags?.["azeroth-rpg"]?.[REACTION_BAR_FLAG]?.ownerUuid === actor.uuid
    && !effect.disabled && effect.active !== false && !effect.isSuppressed && !effect.duration?.expired);
  if (shocked) return REACTION_BAR_REASON;
  if (actor?.weightOfAgesBar === true) return WEIGHT_BAR_REASON;
  return null;
}

export function reactionBarEffect({ actorUuid, cardUuid, timing, name = "Earth Shock: Reactions blocked" }) {
  return { name, img: "icons/svg/daze.svg", origin: cardUuid,
    ...timing, system: { changes: [] }, flags: { "azeroth-rpg": {
      [REACTION_BAR_FLAG]: { ownerUuid: actorUuid, cardUuid }
    } } };
}
