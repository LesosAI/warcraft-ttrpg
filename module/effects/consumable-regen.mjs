/**
 * **A RESTORE AT THE START OF EACH OF YOUR TURNS** (08 §12's Troll's Blood and
 * Mageblood elixirs, D-1919, D-1945; O-665). The drink lays one carrier,
 * `flags.azeroth-rpg.regen {health, mana, source}`, with the rest that ends it
 * named on `flags.azeroth-rpg.restEnds` (`rules/rest-ends.mjs`): there is no
 * duration to count, because *until your next Short Rest* is a rest.
 *
 * `AzerothCombat#_effectTicks` calls `advanceRegen` at the start of the
 * holder's turn, on the active GM's client, as every turn-start beat runs
 * (D-627). Health goes through `applyHealing`, so corruption's reduction and
 * the undead's refusal are honoured (D-946: a consumable heals as anyone);
 * Mana as one delta through the pool queue (`adjustPool`), to the cap. Out of a fight there is no turn,
 * so nothing ticks, which is what *each of your turns* says.
 */

import { manaPool } from "../rules/pools.mjs";
import { adjustPool } from "../documents/pool-writes.mjs";

/** The carrier's flag. */
export const REGEN_FLAG = "regen";

/** What one carrier restores each turn, `{health, mana, source}`, or null. */
export function regenOf(effect) {
  const r = effect?.flags?.["azeroth-rpg"]?.[REGEN_FLAG];
  if (!r || effect?.disabled === true) return null;
  const health = Math.max(0, Math.trunc(Number(r.health)) || 0);
  const mana = Math.max(0, Math.trunc(Number(r.mana)) || 0);
  return health || mana ? { health, mana, source: String(r.source ?? effect.name ?? "") } : null;
}

/**
 * Land every regen carrier an actor holds, at the start of its turn. Answers
 * the card's lines.
 *
 * @param {Actor} actor
 * @returns {Promise<string[]>}
 */
export async function advanceRegen(actor) {
  const lines = [];
  for (const effect of [...(actor?.effects ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const r = regenOf(effect);
    if (!r) continue;
    if (r.health) {
      await actor.applyHealing(r.health, { from: actor, consumable: true });
      lines.push(game.i18n.format("AZEROTH.Use.RegenHealth", { name: actor.name, n: r.health, source: r.source }));
    }
    if (r.mana) {
      const pool = manaPool(actor.poolSnapshot?.() ?? []);
      if (pool) {
        // ONE DELTA INSIDE THE POOL'S QUEUE (`pool-writes.mjs#adjustPool`, D-1086's door; the final
        // review's minor 5): read when its turn comes and capped there, so a spend or a gain landing
        // between a read and the write is never written over. The line says what moved.
        const moved = await adjustPool(actor, { kind: pool.kind, name: pool.name, itemId: pool.itemId ?? null }, r.mana);
        const n = Math.max(0, moved.after - moved.before);
        if (n > 0) lines.push(game.i18n.format("AZEROTH.Use.RegenMana", { name: actor.name, n, source: r.source }));
      }
    }
  }
  return lines;
}
