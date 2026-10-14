/**
 * Migration to 0.11.6 — the bestiary's art and tokens (D-688).
 *
 * Every one of 14's 164 creatures wore `icons/svg/mystery-man.svg` on the
 * sheet and on the canvas both. The parser now stamps the creature's token as
 * `img` and as `prototypeToken.texture.src`, and its full illustration as
 * `system.art`, so a fresh world takes the art from the pack. A world made
 * before this does not: its actors carry the placeholder and `system.art`
 * carries the schema's `""`.
 *
 * **A GM's own choice is never overwritten.** `img` and the token texture are
 * replaced only where they still hold the exact placeholder this system used
 * to stamp; anything else is the world's own. `system.art` is new, so `""` is
 * genuinely "unset" here rather than D-665's trap of comparing a field with an
 * initial against `undefined` — a loaded document always reads `""`, and the
 * map, not the absence, decides what it should become.
 *
 * **Tokens already standing on a scene are updated too**, which `walkWorld`
 * does not reach: a placed TokenDocument carries its own `texture.src`, copied
 * from the prototype when it was dropped, so restamping the actor alone would
 * leave every creature already in play wearing the mystery man.
 */

import { rawSystem, walkWorld } from "./walk.mjs";
import { portraitFor, tokenFor, FALLBACK } from "../rules/bestiary-art.mjs";

/** What every creature wore before the drop, and the only value we replace. */
const PLACEHOLDER = FALLBACK;

/**
 * The update for one creature, or null.
 *
 * @param {object} raw        the stored system
 * @param {string} name       the creature's name — the map's key
 * @param {string} img        the stored `img`
 * @param {string} tokenSrc   the stored `prototypeToken.texture.src`
 * @param {boolean} synthetic true for an unlinked token's actor, which has no
 *                            prototype of its own to write
 */
export function buildBestiaryArtUpdate(raw, name, img, tokenSrc, synthetic = false) {
  if (!raw || typeof raw !== "object") return null;
  const token = tokenFor(name);
  // Not one of 14's creatures: `tokenFor` answers with the placeholder and
  // there is nothing to stamp.
  if (token === PLACEHOLDER) return null;

  const update = {};
  if (img === PLACEHOLDER) update.img = token;
  if (!raw.art) update["system.art"] = portraitFor(name);
  if (!synthetic && tokenSrc === PLACEHOLDER) update["prototypeToken.texture.src"] = token;
  return Object.keys(update).length ? update : null;
}

/**
 * Restamp the tokens already placed on scenes.
 *
 * Keyed on the token's own actor rather than on its name, because a token may
 * be renamed on the scene while the actor behind it is still *Ragnaros*.
 */
async function migrateSceneTokens(log) {
  let touched = 0;
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token._source?.texture?.src !== PLACEHOLDER) continue;
      const name = token.actor?.name;
      if (!name) continue;
      const src = tokenFor(name);
      if (src === PLACEHOLDER) continue;
      await token.update({ "texture.src": src }, { render: false });
      log(`azeroth-rpg | token on ${scene.name}: ${token.name} (${token.id})`);
      touched++;
    }
  }
  return touched;
}

export async function migrate(log = console.log) {
  const actors = await walkWorld({
    actor: doc => {
      if (doc.type !== "npc") return null;
      const source = doc._source ?? doc.toObject();
      return buildBestiaryArtUpdate(
        rawSystem(doc),
        doc.name,
        source.img,
        source.prototypeToken?.texture?.src,
        doc.isToken === true
      );
    }
  }, log);

  return actors + await migrateSceneTokens(log);
}
