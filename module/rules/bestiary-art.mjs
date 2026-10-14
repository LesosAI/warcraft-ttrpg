/**
 * What a creature looks like — its token and its illustration. Pure, no
 * Foundry imports (CLAUDE.md §3).
 *
 * 14 has 164 entries and every one of them wore `icons/svg/mystery-man.svg`,
 * on the sheet and on the canvas both, because `bestiary.mjs`'s `IMG` was a
 * single constant. The lead supplied a full set: an illustration per entry and
 * a transparent circular token cut from that same illustration, with a faction
 * ring drawn on it.
 *
 * **The token is the identity image and the illustration is opened** (the
 * lead's call). `img` carries the token, so the sidebar, the compendium browser
 * and the sheet's banner all show a round, transparent, ring-framed thumbnail —
 * which is what a 64px square frame can actually hold. A 1024×1536 illustration
 * cropped to that square keeps about its middle third and reads as a mistake.
 * `system.art` carries the illustration, and the banner opens it on click.
 *
 * **The map is data, the art is not.** `bestiary-art.json` is tracked and
 * reviewable; the PNGs live under `assets/art/bestiary/`, which is gitignored
 * with `assets/MANIFEST.md` recording where they came from (CLAUDE.md §1). A
 * fresh clone therefore parses the chapter to exactly the same documents and
 * shows `FALLBACK` where the files are not on disk — the paths are decided by
 * the map, never by looking at the folder, because `check-packs.mjs` diffs
 * `img` byte for byte against a fresh parse.
 *
 * **The slug rule is NOT here.** `tools/bestiary-art/build-map.mjs` owns it and
 * this module only looks names up. Two copies of a naming rule drift, and the
 * nine names carrying an apostrophe are exactly where they would: the art was
 * delivered as `aku-mai.png` where the book's `slugify` gives `akumai`, and a
 * mismatch of that kind is silent — the creature falls back to a core icon with
 * its art sitting on disk (`assets/MANIFEST.md` records the same trap costing
 * four book plates).
 */

import map from "./bestiary-art.json" with { type: "json" };

/** Where the art lives, served by Foundry as part of the system directory. */
export const PORTRAIT_DIR = "systems/azeroth-rpg/assets/art/bestiary/portraits";
export const TOKEN_DIR = "systems/azeroth-rpg/assets/art/bestiary/tokens";

/**
 * What a creature with no art wears. This is what every one of the 164 wore
 * before the drop, and it is what a fresh clone shows, so a missing file is
 * never a broken image.
 */
export const FALLBACK = "icons/svg/mystery-man.svg";

/** The map itself, so a test can read what is covered. */
export const ART_SLUGS = Object.freeze(map.slugs);

/** The art slug for a creature name, or null where 14 has no art for it. */
export function slugFor(name) {
  return ART_SLUGS[String(name ?? "").trim()] ?? null;
}

/**
 * The creature's token — its `img` and its `prototypeToken.texture.src`.
 *
 * Always a path Foundry can serve, so a creature outside the map still stands
 * on the canvas as the mystery man rather than as a broken texture.
 */
export function tokenFor(name) {
  const slug = slugFor(name);
  return slug ? `${TOKEN_DIR}/${slug}.png` : FALLBACK;
}

/**
 * The creature's full illustration, or `""` where there is none.
 *
 * Empty rather than the fallback: `system.art` is what the banner opens, and
 * opening a 100px core SVG in an image popout is worse than having no door at
 * all. The sheet draws the affordance only where this is set.
 */
export function portraitFor(name) {
  const slug = slugFor(name);
  return slug ? `${PORTRAIT_DIR}/${slug}.png` : "";
}
