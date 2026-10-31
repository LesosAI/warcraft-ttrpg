import { isLesserInvisibilityEffect } from "../rules/lesser-invisibility.mjs";
import { LESSER_INVISIBILITY_RECEIPTS } from "./lesser-invisibility-state.mjs";

/** A private cue after confirmed delivery. It never applies concealment or
 * spends resources, and a failed card cannot authorize another activation. */
export async function postLesserInvisibility({ actor, userId, effectId, source = null } = {}) {
  const effect = actor?.effects?.get?.(effectId);
  const receipt = actor?.getFlag?.("azeroth-rpg", LESSER_INVISIBILITY_RECEIPTS)?.find?.(row => row.stage === "complete" && row.effectId === effectId);
  if (!effect || !receipt || !isLesserInvisibilityEffect(effect, actor.uuid)) return null;
  const whisper = [...new Set([game.user?.id, userId].filter(id => typeof id === "string" && id.length > 0))];
  if (!whisper.length) return null;
  try {
    return await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }), whisper,
      content: "<p><strong>Lesser Invisibility</strong></p><p>Spent one Action and 2 Mana. Invisible for 1 minute. The effect ends when you attack, use another ability, cast a spell or take damage. Entering combat alone does not end it.</p>",
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:lesser-invisibility",
        casting: false, success: true, targets: [], lesserInvisibilityEffectId: effectId } }
    });
  } catch (error) {
    console.warn("azeroth-rpg | Lesser Invisibility feedback", error);
    ui.notifications?.warn("Lesser Invisibility was applied, but its result card could not be posted. Check the existing effect before using it again.");
    return null;
  }
}
