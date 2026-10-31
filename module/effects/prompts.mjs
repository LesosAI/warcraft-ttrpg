/**
 * **THE ONE WRITER OF A PROMPT CARD** (D-628, D-629; the Legacy branches' B3): one
 * button naming its creature - a Test (the Death Step's, Poisoned's, 07's escape,
 * 06 §10's Reach) - and, where the prompt carries one, Stabilize, 06 §10's offer or
 * a construct's Cutting Gear. `AzerothCombat#_prompt` writes through this, and so does
 * the Death Step's door, which posts the offer whether or not a fight is running.
 */

/** The template every prompt renders. */
export const PROMPT_TEMPLATE = "systems/azeroth-rpg/templates/chat/prompt-card.hbs";

/**
 * Post one prompt card for a creature.
 *
 * @param {Actor} actor
 * @param {{purpose: string, title: string, text: string, testLabel?: string, dc?: number|null, stabilize?: boolean,
 *   cardClass?: string, resilience?: string, effectId?: string|null, escape?: object|null, noTest?: boolean,
 *   offer?: boolean, cuttingGear?: boolean, ownerSees?: boolean}} o
 * @returns {Promise<ChatMessage>}
 */
export async function postPrompt(actor, {
  purpose, title, text, testLabel = "", dc = null, stabilize = false, cardClass = "azeroth-card-attack", resilience = "body",
  effectId = null, escape = null, noTest = false, offer = false, cuttingGear = false, ownerSees = false, seduction = false,
  whisper = null, blind = false
} = {}) {
  const { renderTemplate } = foundry.applications.handlebars;
  const seductionMessageUuid = seduction && effectId
    ? [...(actor.effects ?? [])].find(effect => effect.id === effectId)?.flags?.["azeroth-rpg"]?.seduction?.messageUuid : null;
  const content = await renderTemplate(PROMPT_TEMPLATE, {
    cardClass, title, name: actor.name, text, testLabel, dc, actorUuid: actor.uuid, purpose, stabilize, resilience, effectId,
    noTest, offer, cuttingGear, ownerSees, seduction
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    ...(Array.isArray(whisper) ? { whisper: [...whisper], blind: Boolean(blind) } : {}),
    flags: { "azeroth-rpg": { kind: "prompt", purpose, actorUuid: actor.uuid,
      ...(seduction && effectId ? { seduction: { effectId, ...(seductionMessageUuid ? { messageUuid: seductionMessageUuid } : {}) } } : {}),
      ...(purpose === "poisoned" && effectId ? { poisoned: { effectId } } : {}),
      ...(escape ? { escape: { effectId, ...escape } } : {}) } }
  });
}
