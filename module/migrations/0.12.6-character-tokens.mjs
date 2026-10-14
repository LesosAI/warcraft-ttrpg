/**
 * Migration to 0.12.6 — a character's token is a PC's token (the lead,
 * 2026-09-13).
 *
 * **This is not a schema change**; it is the repair pass. Nothing in this
 * system had ever set a character's `prototypeToken` except the creator's
 * `actorLink: true`, so every character made by hand, imported, or built
 * before the creator existed carries core's own defaults: HOSTILE (a red ring
 * on every player character), `displayName` NONE, `displayBars` NONE, an
 * UNLINKED actor, and no attribute on bar 1. `core.defaultToken` was removed
 * in v14, so there was no world setting standing behind any of it either.
 *
 * `AzerothActor#_preCreate` stamps `rules/tokens.mjs`'s `CHARACTER_TOKEN` from
 * here on. That is the half a rule enforced only on create gets; this is the
 * other half (CLAUDE.md §15 — *a rule enforced only on create needs a repair
 * pass over what is already there*), and it covers both places a token lives:
 *
 * 1. **Every character's prototype token**, through `walkWorld` — world
 *    actors, the actors of unlinked tokens, and any unlocked world pack.
 * 2. **Every token of a character already placed on a scene.** `walkWorld`
 *    walks an unlinked token's ACTOR and its items and never the TokenDocument
 *    itself, and a linked token holds its own `disposition` and display modes
 *    whatever the prototype says — so a party standing on the map would have
 *    stayed red. This is `documents/bound.mjs#adopt`'s own pattern.
 *
 * **`actorLink` is held back for a placed token carrying a delta.** Flipping
 * an unlinked token to linked DISCARDS its `ActorDelta`, and on a player
 * character that delta is their Health and whatever they picked up: a repair
 * pass that loses a session is worse than the ring it was curing. Such a token
 * takes the other four and keeps its delta. `rules/tokens.mjs#deltaIsEmpty` is
 * the test and `tokenRepair` is the rule.
 *
 * Idempotent by construction: `tokenRepair` returns null once a token holds
 * every value, so a second run touches nothing and returns 0.
 *
 * **THE WALK IS SHARED, AND THE REPAIR IS AN ARGUMENT** (D-759). Migration
 * 0.12.15 walks the same two places for one key alone - `sight.enabled` - so
 * the builders and the walk take the rule they apply, and this version keeps
 * `tokenRepair`, which now carries sight too: a world this old gets all six
 * in one pass, and 0.12.15 then finds nothing left to do.
 */

import { deltaIsEmpty, tokenRepair } from "../rules/tokens.mjs";
import { walkWorld } from "./walk.mjs";

/**
 * The prototype token update for one actor, or null.
 *
 * **A SYNTHETIC ACTOR IS SKIPPED.** `walkWorld` hands over the actor of every
 * unlinked token as well as every world actor, and an unlinked token's actor
 * is an `ActorDelta` wearing an Actor's face: its schema carries no
 * `prototypeToken` at all, so the write would be dropped on the floor and
 * `tokenRepair` would ask for it again on the next run — which is exactly the
 * shape that makes a migration report work it never did. The TOKEN's own
 * repair is the loop in `repairCharacterTokens` below, which is where that
 * case belongs.
 *
 * @param {Actor} actor
 * @param {(token: object, options?: object) => object|null} [repair]  the rule applied
 */
export function prototypeUpdate(actor, repair = tokenRepair) {
  if (actor?.type !== "character" || actor?.isToken) return null;
  const raw = actor.toObject?.().prototypeToken ?? actor.prototypeToken ?? {};
  const update = repair(raw);
  if (!update) return null;
  // Flattened onto `prototypeToken.`, so nothing else in the prototype moves.
  return Object.fromEntries(Object.entries(update).map(([key, value]) => [`prototypeToken.${key}`, value]));
}

/**
 * The update for one placed token, or null.
 *
 * @param {TokenDocument} token
 * @param {(token: object, options?: object) => object|null} [repair]  the rule applied
 */
export function placedUpdate(token, repair = tokenRepair) {
  if (token?.actor?.type !== "character") return null;
  const raw = token.toObject?.() ?? token;
  return repair(raw, { linkable: token.actorLink === true || deltaIsEmpty(token.delta?._source ?? null) });
}

/**
 * Bring every character's token in the world up to a rule: each prototype,
 * through `walkWorld` (world actors, unlinked token actors - skipped, since a
 * synthetic actor has no prototype - and unlocked world packs), then every
 * token of a character already placed on a scene, linked or not. Every
 * document touched is logged and counted.
 *
 * @param {(token: object, options?: object) => object|null} repair
 * @param {Function} [log]
 * @returns {Promise<number>}
 */
export async function repairCharacterTokens(repair, log = console.log) {
  let touched = await walkWorld({ actor: doc => prototypeUpdate(doc, repair) }, log);

  // AND THE TOKENS ALREADY ON THE TABLE. A linked token carries its own
  // disposition and display modes, so repairing the prototype leaves a party
  // standing on a scene exactly as red as it was.
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens) {
      const update = placedUpdate(token, repair);
      if (!update) continue;
      await token.update(update, { render: false, diff: false });
      log(`azeroth-rpg | token on ${scene.name}: ${token.name} (${token.id})`);
      touched++;
    }
  }

  return touched;
}

export async function migrate(log = console.log) {
  return repairCharacterTokens(tokenRepair, log);
}
