/**
 * Migration to 0.12.15 - a player character's token sees (D-759; the lead,
 * 2026-09-29: *Yes, with migration*).
 *
 * **Not a schema change; the repair pass.** Players saw nothing on a scene
 * with Token Vision, because `rules/tokens.mjs#CHARACTER_TOKEN` set no `sight`
 * and core's default is OFF: a token with no sight gives its owner no vision
 * source (14.367, `client/canvas/placeables/token.mjs#_isVisionSource`), and a
 * player with no vision source sees a black board. `AzerothActor#_preCreate`
 * and the creator stamp `sight.enabled` from here on; this is the other half
 * (CLAUDE.md §15), over both places a token lives:
 *
 * 1. **Every character's prototype token**, through `walkWorld` - world
 *    actors and unlocked world packs. The actor of an unlinked token is a
 *    synthetic one with no prototype, and is skipped.
 * 2. **Every token of a character already placed on a scene**, linked or
 *    unlinked. Sight lives on the TokenDocument, never on its actor, so an
 *    unlinked player character's token is repaired here and its delta is
 *    never read or touched.
 *
 * **Sight and nothing else**, and **every** character, a token a GM set blind
 * on purpose included - the lead's words, and `sightRepair`'s reasons. The
 * other five keys are 0.12.6's, which ran once; a GM's choice made since then
 * is not this version's to undo.
 *
 * **Enabled is the one key written**, flat (`"sight.enabled"`), so a range or
 * a vision mode a GM set is kept. A token given none sees at core's range 0:
 * everything lit within its line of sight, and nothing in the dark. Race
 * darkvision is a separate rules question and no people is given a range here.
 *
 * Idempotent by construction: `sightRepair` answers null for a token that
 * already sees, so a second run touches nothing and returns 0.
 */

import { sightRepair } from "../rules/tokens.mjs";
import { repairCharacterTokens } from "./0.12.6-character-tokens.mjs";

export async function migrate(log = console.log) {
  return repairCharacterTokens(sightRepair, log);
}
