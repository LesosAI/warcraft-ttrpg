/**
 * **A PUBLIC CARD FOR A TALENT'S EVENT NO USE CARD RECORDS** (the class talent audit's wave-2 review;
 * the lead's bar: every action or visible effect has an effect step and a sound step). 04's Dark
 * Harvest strikes at the warlock's turn start and Shattering Cold's Stun lands inside the damage door;
 * neither is a Use, so no card records them and every other client would see nothing. This posts one
 * card, spoken from the token it happened at, flagged `featureEvent` with the talent's key, the source
 * and the creatures reached; `animation/records.mjs#cardRecord` reads it as the talent's `use` cue.
 *
 * Null where there is nothing to say, or the card could not be written; the event itself has already
 * happened, so a card that fails is a warning, never a refusal.
 */

const SCOPE = "azeroth-rpg";

/** A token as a record keeps one, or null. */
function refOf(token) {
  const doc = token?.document ?? token ?? null;
  if (!doc?.id || doc.documentName !== "Token") return null;
  return { sceneId: doc.parent?.id ?? null, tokenId: doc.id };
}

/**
 * @param {{actor: Actor, token?: Token|TokenDocument|null, featureKey: string, lines: string[], targets?: Array<Token|TokenDocument>}} o
 * @returns {Promise<ChatMessage|null>}
 */
export async function postFeatureEvent({ actor, token = null, featureKey, lines = [], targets = [] } = {}) {
  const body = (lines ?? []).filter(Boolean).map(l => `<p class="azeroth-drain">${l}</p>`).join("");
  if (!actor || !featureKey || !body) return null;
  const doc = token?.document ?? token ?? null;
  const speaker = doc ? ChatMessage.getSpeaker({ token: doc, actor }) : ChatMessage.getSpeaker({ actor });
  try {
    return await ChatMessage.create({
      speaker,
      content: `<div class="azeroth azeroth-card"><div class="azeroth-card-body">${body}</div></div>`,
      flags: { [SCOPE]: {
        kind: "featureEvent", featureKey,
        source: refOf(doc),
        targets: (targets ?? []).map(refOf).filter(Boolean)
      } }
    });
  } catch (err) {
    console.warn("azeroth-rpg | feature event card", err);
    return null;
  }
}
