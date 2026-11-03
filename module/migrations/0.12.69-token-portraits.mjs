/**
 * Migration to 0.12.69 - a character's directory portrait follows its token
 * art (the lead, 2026-11-02, *option 1*; D-797).
 *
 * **Not a schema change; the repair pass.** From here on
 * `AzerothActor#_preUpdate` moves `img` with the token art wherever `img` is
 * blank, core's placeholder or the token's previous art. Every character made
 * before that carries token art a player set from the banner and the hooded
 * placeholder in the Actor directory, and the door only ever acts on a NEW
 * write - so this is the other half (CLAUDE.md §15: *a rule enforced only on
 * create needs a repair pass over what is already there*).
 *
 * **One rule, `rules/token-art.mjs#migratedImg`**: a placeholder `img` beside
 * token art that is a real image takes the token art. A portrait somebody
 * chose, a token still wearing the placeholder, a wildcard, a random image
 * and a video are all left where they are. The comparison is against core's
 * own placeholder (`CONST.DEFAULT_TOKEN`, the Actor class's `DEFAULT_ICON`),
 * never against an absent field (D-665).
 *
 * Every character `walkWorld` reaches - world actors and unlocked world packs.
 * The actor of an unlinked token is a synthetic one whose `img` belongs to its
 * delta and whose prototype does not exist, and is skipped; the Actor
 * directory draws world actors alone. Idempotent by construction: a repaired
 * `img` is no longer a placeholder, so a second run returns 0.
 */

import { migratedImg } from "../rules/token-art.mjs";
import { walkWorld } from "./walk.mjs";

/**
 * The update for one actor, or null.
 *
 * @param {Actor} actor
 * @param {{placeholders?: string[], extensions?: string[]}} [o]  core's lists, handed in by `migrate`
 * @returns {{img: string}|null}
 */
export function portraitUpdate(actor, { placeholders, extensions } = {}) {
  if (actor?.type !== "character" || actor?.isToken) return null;
  const raw = actor.toObject?.() ?? actor._source ?? {};
  const img = migratedImg({
    img: raw.img,
    tokenSrc: raw.prototypeToken?.texture?.src,
    randomImg: raw.prototypeToken?.randomImg === true,
    ...(placeholders ? { placeholders } : {}),
    ...(extensions ? { extensions } : {})
  });
  return img ? { img } : null;
}

export async function migrate(log = console.log) {
  const placeholders = [globalThis.CONST?.DEFAULT_TOKEN, globalThis.Actor?.implementation?.DEFAULT_ICON].filter(Boolean);
  const extensions = Object.keys(globalThis.CONST?.IMAGE_FILE_EXTENSIONS ?? {});
  return walkWorld({
    actor: doc => portraitUpdate(doc, {
      ...(placeholders.length ? { placeholders } : {}),
      ...(extensions.length ? { extensions } : {})
    })
  }, log);
}
