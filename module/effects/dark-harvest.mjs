/**
 * **04's DARK HARVEST** (the class talent audit, C1, D-1891; it was Soul Reaper, which taught
 * the tier 5 spell): *At the start of your turn, each creature within 60 feet carrying two or
 * more of your ongoing effects takes Shadow damage equal to your tier.*
 *
 * Read at the warlock's turn start (`AzerothCombat#_talentTicks`, Siphon's door), which runs on
 * the active GM's client. *Your ongoing effects* is `class-talents.mjs#swappableEffects`' one
 * reading (a tick the warlock's hand laid, a laid spell whose origin is the warlock, a Bane the
 * warlock's Curse laid); the distance is the nearest squares two tokens occupy (D-732), and a
 * creature or a warlock with no token on the viewed scene is measured by nothing and reached by
 * nothing. The blow is typed and meets Ward through the one area door (`strikeFromArea`), as a
 * tick's does, and it is no spell's (`item: true`), so nothing the warlock's spells add reaches it.
 *
 * **Its lines go on a card of its own** (`effects/feature-events.mjs#postFeatureEvent`), spoken from
 * the warlock's token and naming the creatures struck, which every client plays as the talent's
 * picture (the wave-2 review); the turn's card carries none of them, so nothing is said twice.
 */

import { harvestFor, harvested, swappableEffects } from "../rules/class-talents.mjs";
import { feetBetweenTokens } from "../canvas/engaged.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { postFeatureEvent } from "./feature-events.mjs";

/**
 * @param {Actor} actor  the warlock whose turn starts
 * @param {Combat} combat  the fight it starts in
 * @returns {Promise<string[]>}  the lines for the turn's card: none, since its own card says them
 */
export async function darkHarvest(actor, combat) {
  const lines = [];
  if (actor?.type !== "character" || typeof actor.takenTalents !== "function") return lines;
  const row = harvestFor(actor.takenTalents(), { tier: actor.system?.tier ?? 1 });
  if (!row) return lines;
  const own = actor.getActiveTokens?.(true)?.[0] ?? null;
  if (!own) return lines;
  const seen = new Set();
  const struck = [];
  for (const c of combat?.combatants ?? []) {
    const victim = c.actor ?? null;
    if (!victim || victim === actor || seen.has(victim.uuid)) continue;
    seen.add(victim.uuid);
    const token = c.token?.object ?? null;
    const held = swappableEffects([...(victim.effects ?? [])].filter(e => e.active !== false), { caster: actor.uuid }).length;
    const feet = token ? feetBetweenTokens(own, token) : null;
    if (!harvested(row, { held, feet })) continue;
    for (const line of await strikeFromArea({ actor: victim, caster: actor, spell: { name: row.name, item: true }, damage: { rating: row.amount, school: row.type } })) lines.push(line);
    if (token) struck.push(token);
  }
  if (!lines.length) return [];
  lines.unshift(game.i18n.format("AZEROTH.DarkHarvest.Line", { name: actor.name, talent: row.name, n: row.amount }));
  await postFeatureEvent({ actor, token: own, featureKey: "dark-harvest", lines, targets: struck });
  return [];
}
