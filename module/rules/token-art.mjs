/**
 * **A CHARACTER'S DIRECTORY PORTRAIT FOLLOWS ITS TOKEN ART, UNTIL SOMEBODY
 * CHOOSES ONE** (the lead, 2026-11-02, *option 1*; D-797). Pure, no Foundry
 * imports (CLAUDE.md §3).
 *
 * D-700 gave a character three images that are not copies of one another:
 * `img` (the Actor directory's portrait and a chat card's face),
 * `prototypeToken.texture.src` (what stands on the canvas, and what the
 * banner draws) and `system.art` (the Overview's plate). The banner edits the
 * TOKEN, and nothing ever carried that to `img`, so the directory drew core's
 * hooded placeholder beside every player character - the art a player set
 * reached the board and the sheet and never the list the table reads names
 * off.
 *
 * Core already has the rule the other way round (14.367
 * `common/documents/actor.mjs#_preUpdate`): an update that sets `img` and no
 * token art moves the token art too, where the token art was blank or the
 * default. This is its mirror, held to the same restraint:
 *
 * | the update | `img` before | `img` after |
 * |---|---|---|
 * | names `img` itself | anything | what the update says - the write named it (D-737) |
 * | moves the token art | blank, or core's placeholder | the new token art |
 * | moves the token art | the token's PREVIOUS art | the new token art |
 * | moves the token art | anything else | unchanged: a portrait somebody chose |
 * | carries the token art it already had | anything | unchanged: every sheet submit does this |
 *
 * **What is never mirrored**: a wildcard path (`tokens/orc*.png`, the
 * Prototype Token dialog's *Randomize Wildcard Images*) or a token whose
 * `randomImg` is on, because `img` takes no wildcard and would draw a broken
 * picture; and anything that is not an IMAGE by its extension (an animated
 * `.webm` token), because `img` is a `FilePathField({categories: ["IMAGE"]})`
 * and a video there fails validation and refuses the WHOLE update - the
 * token art the player chose would be lost with it.
 *
 * `migratedImg` is the repair pass over a world that already holds characters
 * (migration 0.12.69): a placeholder `img` beside token art that is a real
 * image takes the token art; nothing else moves.
 *
 * **The literals are core's, at 14.367**, because this module is loaded under
 * Vitest where `CONST` does not exist (`rules/tokens.mjs` has the same note).
 * The document door hands in `CONST.DEFAULT_TOKEN`, the Actor class's
 * `DEFAULT_ICON` and `Object.keys(CONST.IMAGE_FILE_EXTENSIONS)` itself, so the
 * defaults below are what a test reads and what an unconfigured caller gets.
 */

/**
 * Core's placeholder for an actor nobody has drawn: `CONST.DEFAULT_TOKEN`,
 * which is `BaseActor.DEFAULT_ICON` and every `getDefaultArtwork` image
 * (14.367 `common/constants.mjs` L345, `common/documents/actor.mjs` L73-89).
 */
export const PLACEHOLDER_IMAGES = Object.freeze(["icons/svg/mystery-man.svg"]);

/** The keys of 14.367's `CONST.IMAGE_FILE_EXTENSIONS` (`common/constants.mjs` L1638-1649). */
export const IMAGE_EXTENSIONS = Object.freeze(["apng", "avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "tiff", "webp"]);

/** A path as a trimmed string, or "" for anything that is not one. */
function pathOf(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Whether a path is a placeholder: blank, or one of core's default icons.
 *
 * @param {string|null|undefined} src
 * @param {string[]} [placeholders]
 * @returns {boolean}
 */
export function isPlaceholderImage(src, placeholders = PLACEHOLDER_IMAGES) {
  const s = pathOf(src);
  return !s || (placeholders ?? []).some(p => pathOf(p) === s);
}

/**
 * Whether a path can stand as a directory portrait: an image by its extension
 * - `validators.hasFileExtension`'s own test, a query string allowed - and no
 * wildcard.
 *
 * @param {string|null|undefined} src
 * @param {{extensions?: string[]}} [o]
 * @returns {boolean}
 */
export function portraitWorthy(src, { extensions = IMAGE_EXTENSIONS } = {}) {
  const s = pathOf(src);
  if (!s || s.includes("*")) return false;
  const list = (extensions ?? []).map(x => String(x).replace(/[^a-z0-9]/gi, "")).filter(Boolean);
  if (!list.length) return false;
  return new RegExp(`\\.(${list.join("|")})(\\?.*)?$`, "i").test(s);
}

/**
 * One key out of an update, nested (`cleanData` expands every update before
 * `_preUpdate` sees it) or, for a caller that hands a flat object, flat.
 */
function read(changed, path) {
  if (Object.hasOwn(changed, path)) return changed[path];
  let at = changed;
  for (const key of path.split(".")) {
    if (!at || typeof at !== "object" || !Object.hasOwn(at, key)) return undefined;
    at = at[key];
  }
  return at;
}

/**
 * **THE `img` AN UPDATE SHOULD CARRY BESIDE THE TOKEN ART IT WRITES**, or null
 * where it should carry none (the table in the module comment).
 *
 * `img`, `tokenSrc` and `randomImg` are the document's STORED values before
 * the update (`_source`): core's `_initializeSource` backfills a blank token
 * art from `img`, so `tokenSrc` is never blank on a loaded actor, and a sheet
 * submit carries that same path straight back - which is why "the token art
 * moved" is read against `tokenSrc` and never off the update's presence.
 *
 * @param {{changed?: object, img?: string, tokenSrc?: string, randomImg?: boolean,
 *   placeholders?: string[], extensions?: string[]}} o
 * @returns {string|null}
 */
export function mirroredImg({ changed = null, img = "", tokenSrc = "", randomImg = false, placeholders = PLACEHOLDER_IMAGES, extensions = IMAGE_EXTENSIONS } = {}) {
  if (!changed || typeof changed !== "object") return null;
  // The write named the portrait: it says what it wants (CLAUDE.md §15, D-737).
  if (read(changed, "img") !== undefined) return null;
  const next = read(changed, "prototypeToken.texture.src");
  if (typeof next !== "string") return null;
  const to = pathOf(next);
  if (to === pathOf(tokenSrc)) return null;
  const random = read(changed, "prototypeToken.randomImg");
  if ((random === undefined ? randomImg : random) === true) return null;
  if (!portraitWorthy(to, { extensions })) return null;
  const was = pathOf(img);
  if (!isPlaceholderImage(was, placeholders) && was !== pathOf(tokenSrc)) return null;
  return was === to ? null : to;
}

/**
 * **THE REPAIR PASS** (migration 0.12.69): the `img` an existing character
 * should take, or null. Only a placeholder portrait moves, and only to token
 * art that is itself a real image - a token still wearing the placeholder,
 * a wildcard and a video are all left where they are.
 *
 * Idempotent by construction: once `img` holds the token art it is no longer
 * a placeholder, and this answers null.
 *
 * @param {{img?: string, tokenSrc?: string, randomImg?: boolean, placeholders?: string[], extensions?: string[]}} o
 * @returns {string|null}
 */
export function migratedImg({ img = "", tokenSrc = "", randomImg = false, placeholders = PLACEHOLDER_IMAGES, extensions = IMAGE_EXTENSIONS } = {}) {
  if (!isPlaceholderImage(img, placeholders)) return null;
  if (randomImg === true) return null;
  const src = pathOf(tokenSrc);
  if (isPlaceholderImage(src, placeholders) || !portraitWorthy(src, { extensions })) return null;
  return src;
}
