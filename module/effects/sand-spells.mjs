/**
 * **WHAT A SAND SPELL DOES AFTER ITS CAST, THROUGH THE DOORS THAT EXIST** (07 §12, D-864;
 * the lead: *"We need automation and animations fully complete for everything"*). The
 * cast's own door (`dice/workflows.mjs#castSpell`) calls this once the Casting Test went
 * off, and prints the lines it answers on the card:
 *
 * - **Hourstrike** - the next-attack promise held to the turn (`effects/next-attack.mjs`),
 *   carrying its 2 damage and its Decay 1 (`rules/next-attack.mjs`, D-865);
 * - **Hour of Haste** - a Half-Action on each target's next turn through Bloodlust's and
 *   Hasten's one write (`effects/chromatic-flights.mjs#layBloodlust`);
 * - **Divert Timeway** - the life count, and from the second casting on the permanent
 *   Fatigue and the Spirit's Tether (`rules/sand-spells.mjs#lifePriceFor`), judged before
 *   the Mana by `divertRefusal`. **What is undone is the GM's** (D2 §12; the lead's text:
 *   *"The GM decides what implications this may have"*): the card says so in words.
 *
 * Pure judgement lives in `rules/sand-spells.mjs`; this module only writes.
 */

import { AZEROTH } from "../config.mjs";
import { LIFE_COUNT_FLAG, grantsHalfAction, lifeFatigue, lifePriceFor, readLifePrice, readNextAttack } from "../rules/sand-spells.mjs";

/** The permanent Fatigue a life of Divert Timeway has laid (the Fatigue floor reads it). */
export const PERMANENT_FATIGUE_FLAG = "permanentFatigue";

/**
 * **WHAT DIVERT TIMEWAY WOULD COST THIS CASTER**, judged before anything is paid: the
 * price past the first casting, or the refusal in words where the caster holds no Spirit's
 * Tether to spend. Null for any other spell.
 *
 * @param {Actor} actor
 * @param {object} sys  the spell's system data
 * @returns {{price: object, words: string, refused: boolean}|null}
 */
export function divertRefusal(actor, sys) {
  const price = readLifePrice(sys?.effect ?? "");
  if (!price) return null;
  const plan = lifePriceFor({
    count: actor?.getFlag?.("azeroth-rpg", LIFE_COUNT_FLAG) ?? 0,
    tether: actor?.system?.spiritTether?.value ?? 0, price
  });
  const words = plan.first
    ? game.i18n.localize("AZEROTH.Divert.First")
    : game.i18n.format(plan.refused ? "AZEROTH.Divert.NoTether" : "AZEROTH.Divert.Price", { fatigue: plan.fatigue, tether: plan.tether });
  return { price: plan, words, refused: Boolean(plan.refused) };
}

/**
 * Whether Hour of Haste may be cast: its Half-Action is a turn's, so a started fight.
 * Answers the refusal's words or null.
 */
export function hasteRefusal(actor, sys, spell) {
  if (!grantsHalfAction(sys?.effect ?? "")) return null;
  return actor?.activeFight?.()?.started ? null : game.i18n.format("AZEROTH.Bloodlust.NoFight", { name: spell?.name ?? "", target: actor?.name ?? "" });
}

/**
 * @param {{actor: Actor, spell: Item, sys: object, targets?: Array<{actor: Actor|null, name: string}>, viaItem?: boolean}} o
 * @returns {Promise<string[]>}
 */
export async function sandSpellAfterCast({ actor, spell, sys, targets = [], viaItem = false } = {}) {
  const lines = [];
  const promise = readNextAttack(sys?.effect ?? "");
  if (promise) {
    const { layNextAttack } = await import("./next-attack.mjs");
    const laid = await layNextAttack(actor, [{ source: spell.uuid ?? spell.name, name: spell.name, damage: promise.damage, type: promise.type, decay: promise.decay, lasts: promise.span }]);
    lines.push(game.i18n.format(laid.length ? "AZEROTH.NextAttack.SpellLaid" : "AZEROTH.NextAttack.NoFight", { name: actor.name, talent: spell.name, n: promise.damage, decay: promise.decay }));
  }
  if (grantsHalfAction(sys?.effect ?? "")) {
    const fight = actor.activeFight?.() ?? null;
    const { layBloodlust } = await import("./chromatic-flights.mjs");
    for (const t of targets) {
      if (!t?.actor) continue;
      const laid = fight ? await layBloodlust({ shaman: actor, target: t.actor, source: spell.name, combatId: fight.id }) : false;
      lines.push(game.i18n.format(laid ? "AZEROTH.Bloodlust.Line" : "AZEROTH.Bloodlust.NotLaid", { name: t.name, talent: spell.name }));
      // 04's Shared Hours (*When a spell ... of yours gives an ally ... a Half-Action, gain 1 Sand*).
      if (laid) {
        const { sharedHours } = await import("./chronomancer.mjs");
        lines.push(...(await sharedHours(actor, t.actor, "half")));
      }
    }
  }
  // An item's casting pays no life price, exactly as `divertRefusal` never judged one (the
  // 2a review, M5): the life count, the Fatigue and the Tether are the Chronomancer's own cast's.
  const price = viaItem ? null : readLifePrice(sys?.effect ?? "");
  if (price) {
    const plan = lifePriceFor({ count: actor.getFlag("azeroth-rpg", LIFE_COUNT_FLAG) ?? 0, tether: actor.system?.spiritTether?.value ?? 0, price });
    const update = { [`flags.azeroth-rpg.${LIFE_COUNT_FLAG}`]: (Math.trunc(Number(actor.getFlag("azeroth-rpg", LIFE_COUNT_FLAG))) || 0) + 1 };
    if (!plan.first && !plan.refused) {
      update[`flags.azeroth-rpg.${PERMANENT_FATIGUE_FLAG}`] = (Math.trunc(Number(actor.getFlag("azeroth-rpg", PERMANENT_FATIGUE_FLAG))) || 0) + plan.fatigue;
      // **THE 2 FATIGUE ARE GAINED, AND THE FLOOR RISES UNDER THEM** (the 2a review, M5;
      // D-877): the stored Fatigue rises by the price as the floor does, so a character
      // already above the old floor gains the 2 as well (`lifeFatigue`).
      const stored = actor._source?.system?.fatigue;
      if (typeof stored === "number") update["system.fatigue"] = lifeFatigue({ stored, fatigue: plan.fatigue, max: AZEROTH.FATIGUE_MAX });
      update["system.spiritTether.value"] = Math.max(0, (Math.trunc(Number(actor.system?.spiritTether?.value)) || 0) - plan.tether);
      lines.push(game.i18n.format("AZEROTH.Divert.Paid", { name: actor.name, fatigue: plan.fatigue, tether: plan.tether }));
    }
    await actor.update(update);
    lines.push(game.i18n.localize("AZEROTH.Divert.GmDecides"));
  }
  return lines;
}
