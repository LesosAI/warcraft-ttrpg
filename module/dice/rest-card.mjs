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
  ate = null, drank = null, blood = null
}) {
  const lines = [];
  // What was NOT recovered, and why (D-733). A rest that gives nothing back
  // has to say which half was missing, or it reads as a broken button.
  const flags = [];
  // **WHERE A SAN'LAYN'S BLOOD CAME FROM** (02 §5; D-1141, D-1143): the feedings since the last
  // rest, a living source the GM approved (the line the window ticks, printed for the GM), and the
  // vials drunk. `bloodLines` is what the card prints beside *Ate* and *Drank*.
  const bloodLines = [];
  if (blood?.met) {
    if (blood.since > 0) bloodLines.push(game.i18n.format("AZEROTH.Rest.BloodSince", { n: blood.since }));
    if (blood.fresh > 0) bloodLines.push(game.i18n.format("AZEROTH.Rest.BloodFresh", { n: blood.fresh }));
    if (blood.vials?.length) bloodLines.push(game.i18n.format("AZEROTH.Rest.BloodVials", { names: blood.vials.join(", ") }));
    if (!bloodLines.length && blood.needed === 0) bloodLines.push(game.i18n.localize("AZEROTH.Rest.BloodNoneNeeded"));
  }
  for (const g of gains) {
    if (g.kind === "health") lines.push({ label: game.i18n.localize("AZEROTH.Rest.Health"), value: `+${g.amount}` });
    // 08 \u00a712's hot meal and feast: *Health equal to your tier again*, beside
    // the Health it was added to.
    else if (g.kind === "tierAgain") lines.push({ label: game.i18n.localize("AZEROTH.Rest.TierAgain"), value: `+${g.amount}` });
    // A food's own tier (O-702, D-2004): *Health equal to its tier*, on its own line.
    else if (g.kind === "foodTier") lines.push({ label: game.i18n.localize("AZEROTH.Rest.FoodTier"), value: `+${g.amount}` });
    else if (g.kind === "pool") lines.push({ label: game.i18n.localize(AZEROTH.poolTypes[g.name] ?? g.name), value: `+${g.amount}` });
    else if (g.kind === "fatigue") lines.push({ label: game.i18n.localize("AZEROTH.Rest.Fatigue"), value: `\u2212${Math.abs(g.amount)}` });
    else if (g.kind === "noFood") flags.push(game.i18n.localize("AZEROTH.Rest.NoFood"));
    else if (g.kind === "noDrink") flags.push(game.i18n.localize("AZEROTH.Rest.NoDrink"));
    // A pool no rest refills (the Sovereign's Vitae: *"Feeding only"*, R9), said so the rest does not
    // read as a pool forgotten.
    else if (g.kind === "noRefill") flags.push(game.i18n.format("AZEROTH.Rest.NoRefill", { pool: game.i18n.localize(AZEROTH.poolTypes[g.name] ?? g.name) }));
    // What a talent added to the Mana line above (04's Light's Reserve, D-772),
    // said beside it so the number reads as what it is.
    else if (g.kind === "talentMana") flags.push(game.i18n.format("AZEROTH.Rest.TalentMana", { name: g.name ?? "", n: g.amount ?? 0 }));
    // Sand empties when a rest finishes (D-848), and the card says how much went.
    else if (g.kind === "sandEmptied") lines.push({ label: game.i18n.localize("AZEROTH.Pool.Sand"), value: `\u2212${Math.abs(g.amount)}` });
    // Runic Power empties when a Long Rest finishes, and only then (D-943).
    else if (g.kind === "runicPowerEmptied") lines.push({ label: game.i18n.localize("AZEROTH.Pool.RunicPower"), value: `\u2212${Math.abs(g.amount)}` });
    // Hatred empties when a Short or Long Rest finishes (the Demon Hunter plan's R2), and the Fel it
    // gave is said beside it; the Fel's own card follows from the unresisted door.
    else if (g.kind === "hatredEmptied") lines.push({ label: game.i18n.localize("AZEROTH.Pool.Hatred"), value: `\u2212${Math.abs(g.amount)}` });
    else if (g.kind === "hatredFel") flags.push(game.i18n.format("AZEROTH.Rest.HatredFel", { n: g.held ?? 0, fel: g.fel ?? 0 }));
    // A character who does not eat or drink recovered with neither (D-946), said so the
    // rest does not read as a meal forgotten.
    else if (g.kind === "needsNoFood") flags.push(game.i18n.localize("AZEROTH.Rest.NeedsNoFood"));
    // The runes a Long Rest refilled (D-943).
    else if (g.kind === "runesRefilled") lines.push({ label: game.i18n.localize("AZEROTH.Pool.Runes"), value: `+${g.amount}` });
    // And the inscription window the rest opened (D-950), said so the knight knows it may.
    else if (g.kind === "inscribeOpen") flags.push(game.i18n.localize("AZEROTH.Rest.InscribeOpen"));
    // A San'layn's rest without its blood (02 §5; D-1141, D-1144): what it did not restore.
    else if (g.kind === "noBlood") flags.push(game.i18n.localize(kind === "long" ? "AZEROTH.Rest.NoBloodLong" : "AZEROTH.Rest.NoBlood"));
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
    bloodLines,
    flags,
    // A capped rest that ate still ate: without the two picks here the card
    // would print *Nothing to recover.* over the meal (D-733).
    nothing: !lines.length && !restored.length && !cleared && !diseased && !ate && !drank && !bloodLines.length
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { "azeroth-rpg": { kind: "rest", rest: kind } }
  });
}
