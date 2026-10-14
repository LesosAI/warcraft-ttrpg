/**
 * What an item looks like (D-676). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * Before this, every weapon in the game wore `icons/svg/sword.svg` and every
 * suit wore `icons/svg/shield.svg` - about 25 of core's icons across 1,827
 * documents. Now 668 equipment items carry 345 distinct WoW icons, joined to
 * the Classic item database by name where the name exists there (35 of 08
 * §20's 36 uniques are real Warcraft items), to the ICON NAMES by word where
 * it does not, and to the sub-section's default where neither reaches. A MOUNT
 * skips the join: a Classic mount is a summoning object, so it handed
 * *Frostwolf* a picture of a horn.
 *
 * **The map is data, the art is not.** `icon-map.json` is tracked and
 * reviewable; the PNGs live under `assets/art/items/`, which is gitignored
 * with `assets/MANIFEST.md` recording where they came from (CLAUDE.md §1).
 * **A missing file must never be a broken image**, so `CORE_FALLBACK` names a
 * core Foundry icon for every kind and `iconFor` ends there.
 *
 * The kind keys are 08's own sub-section tails, the same key
 * `rules/weight.mjs` reads a weight off (D-675).
 */

import icons from "./icon-map.json" with { type: "json" };

/** Where the art lives, served by Foundry as part of the system directory. */
export const ICON_DIR = "systems/azeroth-rpg/assets/art/items";

/**
 * The core Foundry icon a kind falls back to. These are the icons the packs
 * used before D-676 and they are always present, because core ships them.
 */
export const CORE_FALLBACK = Object.freeze({
  "One-handed weapon": "icons/svg/sword.svg",
  "Two-handed weapon": "icons/svg/sword.svg",
  "Light weapon": "icons/svg/sword.svg",
  "Thrown weapon": "icons/svg/sword.svg",
  "Bow or sling": "icons/svg/sword.svg",
  "Crossbow or firearm": "icons/svg/sword.svg",
  "Implement": "icons/svg/sword.svg",
  "Ammunition": "icons/svg/sword.svg",
  "8": "icons/svg/shield.svg",
  Unique: "icons/svg/aura.svg",

  Augments: "icons/svg/book.svg",
  Ward: "icons/svg/mage-shield.svg",
  Spellpower: "icons/svg/mage-shield.svg",
  Light: "icons/svg/light.svg",
  "Worn things": "icons/svg/cowled.svg",
  Clothing: "icons/svg/cowled.svg",
  Poisons: "icons/svg/poison.svg",
  "Food and drink": "icons/svg/tankard.svg",
  Restoratives: "icons/svg/pill.svg",
  Elixirs: "icons/svg/pill.svg",
  "Utility draughts": "icons/svg/pill.svg",
  "Bandages and dressings": "icons/svg/pill.svg",
  Explosives: "icons/svg/explosion.svg",
  Devices: "icons/svg/clockwork.svg",
  "Stones and oils": "icons/svg/clockwork.svg",
  Tomes: "icons/svg/book.svg",
  Manuals: "icons/svg/book.svg",
  Scrolls: "icons/svg/book.svg",
  "Maps, letters and seals": "icons/svg/book.svg",
  Vehicles: "icons/svg/anchor.svg",
  "Trained mounts": "icons/svg/pawprint.svg",
  "War mounts": "icons/svg/pawprint.svg",
  "Working animals": "icons/svg/pawprint.svg",
  "Harness and barding": "icons/svg/pawprint.svg",
  Herbs: "icons/svg/mountain.svg",
  "Ore and metal": "icons/svg/mountain.svg",
  "Cloth and hides": "icons/svg/mountain.svg",
  "Stones and essences": "icons/svg/mountain.svg",
  Sundries: "icons/svg/mountain.svg",

  // 08 §11's own sub-sections. These were the six the fallback table missed
  // on its first cut, and only a census of the packs' kinds found them.
  "Trade kits": "icons/svg/item-bag.svg",
  "Adventuring tools": "icons/svg/item-bag.svg",
  "Camp and the road": "icons/svg/item-bag.svg",
  "Storage and carry": "icons/svg/item-bag.svg",
  "Instruments and games": "icons/svg/item-bag.svg",
  "Ritual and cultural goods": "icons/svg/item-bag.svg"
});

/**
 * The core Foundry icon each of the OTHER seven packs falls back to — the one
 * every document in that pack used to wear (2026-09-07).
 *
 * A fresh clone has no `assets/` at all, so this is what 884 careers, classes,
 * legacies, races, spells, talents and traits show without the art drop.
 */
export const TYPE_FALLBACK = Object.freeze({
  career: "icons/svg/tower-flag.svg",
  class: "icons/svg/combat.svg",
  legacy: "icons/svg/statue.svg",
  race: "icons/svg/mystery-man.svg",
  spell: "icons/svg/explosion.svg",
  talent: "icons/svg/upgrade.svg",
  trait: "icons/svg/upgrade.svg"
});

/**
 * What a Classic find wears when the map does not name one (D-685).
 *
 * A find's section is `Classic · <Zone>`, which is a zone rather than a kind,
 * so `CORE_FALLBACK` can never have a row for it — and there are 26 zones, so
 * rowing them would be rowing the wrong thing. **Not a `TYPE_FALLBACK` row
 * either**: that table answers by document type and `weapon` there would give
 * an unknown §7 weapon a sword instead of `DEFAULT_ICON`, which
 * `icons.test.mjs` pins.
 *
 * In practice nothing reaches this: every find carries its own WoW icon name
 * on `flags.azeroth-rpg.classic.icon` and `tools/icons/match-icons.mjs` takes
 * it through the `record` pass. This is the first parse, before the map has
 * been built, and the fresh clone with no art at all.
 */
export const CLASSIC_FALLBACK = Object.freeze({
  weapon: "icons/svg/sword.svg",
  armor: "icons/svg/shield.svg",
  gear: "icons/svg/item-bag.svg"
});

/** The last resort: what an unknown kind wears. */
export const DEFAULT_ICON = "icons/svg/item-bag.svg";

/** The map itself, so a test can read what was chosen and how. */
export const ICON_MAP = Object.freeze(icons.map);
export const ICON_HOW = Object.freeze(icons.how);

/**
 * The last named part of a `source.section`. The whitespace around the
 * separator is load-bearing: a bare hyphen in the class split *One-handed
 * weapon* on its own hyphen (D-675).
 */
export function sectionTail(section) {
  const parts = String(section ?? "").split(/\s+[·—–]\s+/).map(s => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : (parts[0] ?? "");
}

/**
 * The map's key.
 *
 * `<type>:<identifier>`, because **52 identifiers collide across the packs** —
 * a talent and the spell it is named for share a slug, and a map keyed on the
 * identifier alone would hand one of them the other's art (2026-09-07).
 */
export function iconKey(type, identifier) {
  return `${type}:${identifier}`;
}

/** The WoW icon name mapped to this document, or null. */
export function iconName(type, identifier) {
  return ICON_MAP[iconKey(type, identifier)] ?? null;
}

/**
 * The `img` a parsed document should carry.
 *
 * @param {object} doc  `{name, type, system: {identifier, source}}`
 * @returns {string} a path Foundry can serve, always
 */
export function iconFor(doc) {
  const sys = doc?.system ?? doc ?? {};
  const name = iconName(doc?.type, sys.identifier);
  if (name) return `${ICON_DIR}/${name}.png`;
  // A Classic find is filed by zone, so no kind fallback can reach it (D-685).
  if (sys?.source?.document === "Classic") return CLASSIC_FALLBACK[doc?.type] ?? DEFAULT_ICON;
  // Equipment falls back by 08's sub-section; the other seven packs by type,
  // to the one core icon every document in that pack used to share.
  const tail = sectionTail(sys?.source?.section);
  return CORE_FALLBACK[tail] ?? TYPE_FALLBACK[doc?.type] ?? DEFAULT_ICON;
}
