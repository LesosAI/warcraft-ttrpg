/**
 * The class crests behind the talent tree (D-758).
 *
 * Nine 320x320 PNGs in `assets/art/classes/crest/`, TRACKED in git and read by
 * nothing until the tree took one as its watermark - WoW's talent frame draws
 * the class's art behind the icons, and these are this system's nearest thing.
 *
 * **A path is answered only for a crest that is on disk.** An `<img>` that
 * 404s is a console error, and the smoke run fails on one (CLAUDE.md §16), so
 * an identifier this list does not hold answers `null` and the tree draws no
 * crest at all rather than a broken one. `crests.test.mjs` holds the list
 * against the class pack and against the folder in both directions.
 *
 * Pure: no Foundry imports.
 */

/** The nine class identifiers that have a crest, as `packs-src/classes` spells them. */
export const CLASS_CRESTS = Object.freeze([
  "druid", "mage", "paladin", "priest", "ranger", "rogue", "shaman", "warlock", "warrior"
]);

/** Where the crests are served from, relative to Foundry's route root. */
export const CREST_ROOT = "systems/azeroth-rpg/assets/art/classes/crest";

/**
 * The crest image for a class identifier, or null.
 *
 * STRICT: the identifier is matched as the class pack spells it and nothing
 * is guessed. A caller holding only a display name slugs it first.
 *
 * @param {string|null|undefined} identifier  e.g. `"warrior"`
 * @returns {string|null}
 */
export function crestPath(identifier) {
  if (typeof identifier !== "string" || !CLASS_CRESTS.includes(identifier)) return null;
  return `${CREST_ROOT}/${identifier}.png`;
}
