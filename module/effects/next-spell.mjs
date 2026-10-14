/**
 * **WHAT THE NEXT SPELL WAS PROMISED, WRITTEN** (04's Nature's Grace and
 * Predator's Swiftness; D-771). `rules/casting.mjs#pendingNextSpell` reads it
 * and `castSpell` takes it whole with its payment; this lays it.
 *
 * Two doors lay one: a Casting Test at SL 2 or better (Nature's Grace, from a
 * spell's cast or a casting feature's Use) and a leave Predator's Swiftness
 * made free. The entries are the caster's own flag, merged by the talent that
 * laid them - a second Nature's Grace before any spell took the first REPLACES
 * it rather than stacking - and an entry for *that turn* is stamped with the
 * fight's turn as it stands.
 */

import { NEXT_SPELL_FLAG } from "../rules/casting.mjs";

/**
 * Lay these grants on the actor, said in words.
 *
 * @param {Actor} actor
 * @param {Array<{source: string, name: string, amount: number, turn: boolean}>} grants
 *   `talent-effects.mjs#nextSpellGrants`'
 * @returns {Promise<object[]>}  the entries now standing
 */
export async function layNextSpell(actor, grants = []) {
  if (!actor || !grants?.length) return [];
  const now = actor.fightTurnNow?.() ?? null;
  const held = (actor.getFlag?.("azeroth-rpg", NEXT_SPELL_FLAG) ?? []).filter(e => e && typeof e === "object");
  const laid = grants.map(g => ({
    source: g.source, name: g.name, amount: g.amount,
    // What else a next spell may be promised (D-775): Backdraft's Half-Action,
    // and Soul Fire's SL and damage.
    ...(g.cast ? { cast: g.cast } : {}),
    // D-779: a discount a casting feature may take (04's Nature's Grace), and 04's
    // Miracle's promise to the next healing spell.
    ...(g.features === true ? { features: true } : {}),
    ...(g.miracle === true ? { miracle: true } : {}),
    ...(Number(g.forcedSl) > 0 ? { forcedSl: Math.trunc(Number(g.forcedSl)) } : {}),
    ...(Number(g.damage) > 0 ? { damage: Math.trunc(Number(g.damage)) } : {}),
    // *That turn* (Predator's Swiftness, Soul Fire): the fight's turn, or - out of
    // a fight, where Soul Fire is no longer refused (D-778; the lead: *"Player can
    // use them at anytime if selected."*) - one round of the world's clock from
    // now (`rules/casting.mjs#pendingNextSpell`).
    turn: g.turn ? (now ?? { clock: Number(game.time?.worldTime) || 0 }) : null
  })).filter(e => !(e.turn === null && grants.find(g => g.source === e.source)?.turn));
  if (!laid.length) return held;
  const sources = new Set(laid.map(e => e.source));
  const next = [...held.filter(e => !sources.has(e.source)), ...laid];
  await actor.setFlag("azeroth-rpg", NEXT_SPELL_FLAG, next);
  for (const e of laid) {
    // Miracle says its own words on its card (`workflows.useFeature`), so no toast here.
    if (e.miracle) continue;
    const key = e.cast ? "AZEROTH.Cast.NextSpellHalf" : e.forcedSl ? "AZEROTH.SoulFire.Laid" : (e.turn ? "AZEROTH.Cast.NextSpellTurn" : "AZEROTH.Cast.NextSpellLaid");
    ui.notifications?.info(game.i18n.format(key, { name: actor.name, talent: e.name, n: e.amount, sl: e.forcedSl ?? 0, damage: e.damage ?? 0 }));
  }
  return next;
}
