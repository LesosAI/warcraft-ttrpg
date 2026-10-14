/**
 * The rest card (D-623): who rested and what came back. No buttons - a rest
 * has nothing left to decide once it is taken.
 */

import { AZEROTH } from "../config.mjs";

const { renderTemplate } = foundry.applications.handlebars;

export const REST_TEMPLATE = "systems/azeroth-rpg/templates/chat/rest-card.hbs";

/**
 * @param {object} o
 * @param {Actor} o.actor
 * @param {"short"|"long"} o.kind
 * @param {object[]} [o.gains]      From `rules/rest.mjs`.
 * @param {string[]} [o.restored]   Names whose uses came back.
 * @param {number} [o.cleared]      Sundered effects removed.
 * @param {boolean} [o.diseased]
 * @param {number|null} [o.count]   Short Rests since the last Long Rest.
 * @param {string|null} [o.ate]     The food spent on this rest (D-733).
 * @param {string|null} [o.drank]   The drink spent on this rest (D-733).
 */
export async function restCard({
  actor, kind, gains = [], restored = [], cleared = 0, diseased = false, count = null,
  ate = null, drank = null
}) {
  const lines = [];
  // What was NOT recovered, and why (D-733). A rest that gives nothing back
  // has to say which half was missing, or it reads as a broken button.
  const flags = [];
  for (const g of gains) {
    if (g.kind === "health") lines.push({ label: game.i18n.localize("AZEROTH.Rest.Health"), value: `+${g.amount}` });
    // 08 \u00a712's hot meal and feast: *Health equal to your tier again*, beside
    // the Health it was added to.
    else if (g.kind === "tierAgain") lines.push({ label: game.i18n.localize("AZEROTH.Rest.TierAgain"), value: `+${g.amount}` });
    else if (g.kind === "pool") lines.push({ label: game.i18n.localize(AZEROTH.poolTypes[g.name] ?? g.name), value: `+${g.amount}` });
    else if (g.kind === "fatigue") lines.push({ label: game.i18n.localize("AZEROTH.Rest.Fatigue"), value: `\u2212${Math.abs(g.amount)}` });
    else if (g.kind === "noFood") flags.push(game.i18n.localize("AZEROTH.Rest.NoFood"));
    else if (g.kind === "noDrink") flags.push(game.i18n.localize("AZEROTH.Rest.NoDrink"));
    // What a talent added to the Mana line above (04's Light's Reserve, D-772),
    // said beside it so the number reads as what it is.
    else if (g.kind === "talentMana") flags.push(game.i18n.format("AZEROTH.Rest.TalentMana", { name: g.name ?? "", n: g.amount ?? 0 }));
  }
  if (kind === "long" && actor.type === "character" && actor.system?.resolve != null) {
    lines.push({ label: game.i18n.localize("AZEROTH.Rest.Resolve"), value: String(actor.system.resolve) });
  }
  const max = AZEROTH.SHORT_RESTS_PER_DAY;
  const content = await renderTemplate(REST_TEMPLATE, {
    title: game.i18n.localize(kind === "long" ? "AZEROTH.Sheet.LongRest" : "AZEROTH.Sheet.ShortRest"),
    name: actor.name,
    lines,
    restored: restored.length ? restored.join(", ") : null,
    cleared,
    diseased,
    count: kind === "short" && count ? { value: count, max, over: count > max } : null,
    ate,
    drank,
    flags,
    // A capped rest that ate still ate: without the two picks here the card
    // would print *Nothing to recover.* over the meal (D-733).
    nothing: !lines.length && !restored.length && !cleared && !diseased && !ate && !drank
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { "azeroth-rpg": { kind: "rest", rest: kind } }
  });
}
