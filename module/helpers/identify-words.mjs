/**
 * **THE WORDS AN UNIDENTIFIED ITEM IS NAMED IN** (08 §4, *Unidentified items*; D-1435). The pure
 * law (`rules/identify.mjs#disguisedName`) takes its words in a bag (D-677); this is the one
 * place that bag is filled from `lang/en.json`, so every surface that disguises a name - the
 * Identify card here, and the sheets, cards and loot rows Phase 4 disguises - reads the same
 * words. Reads `game.i18n`, so it cannot load under Vitest.
 */

import { AZEROTH } from "../config.mjs";
import { disguisedName, hiddenFrom } from "../rules/identify.mjs";

const SLOT_KEYS = Object.freeze(["head", "neck", "shoulder", "back", "clothing", "tabard", "wrist", "hands", "waist", "legs", "feet", "finger", "trinket"]);
// `none` is 08 §8's shields, worded *Shield* (`rules/identify.mjs#SUIT_CATEGORIES`).
const CATEGORY_KEYS = Object.freeze(["cloth", "leather", "studded", "mail", "plate", "none"]);
const TYPE_KEYS = Object.freeze(["weapon", "armor", "gear", "consumable"]);

/** The localised bag `disguisedName` reads. */
export function disguiseWords() {
  const t = key => game.i18n.localize(key);
  return {
    format: t("AZEROTH.Identify.Disguise"),
    // Every slot 08 §11 names has its noun; a slot the config gains reads its own label.
    slots: Object.fromEntries(Object.keys(AZEROTH.wornSlots ?? {}).map(k => [k, SLOT_KEYS.includes(k) ? t(`AZEROTH.Identify.Slot.${k}`) : t(AZEROTH.wornSlots[k])])),
    categories: Object.fromEntries(CATEGORY_KEYS.map(k => [k, t(`AZEROTH.Identify.Category.${k}`)])),
    types: Object.fromEntries(TYPE_KEYS.map(k => [k, t(`AZEROTH.Identify.Type.${k}`)]))
  };
}

/** The kind alone, as the disguised name says it: *Longsword*, *Cloth armor*, *Shield*. */
export function kindNounOf(item) {
  return disguisedName(item, { ...disguiseWords(), format: "{kind}" });
}

/** The name an unidentified item wears, in the table's words: *Longsword (unidentified)*. */
export function disguisedNameOf(item) {
  return disguisedName(item, disguiseWords());
}

/**
 * **WHETHER THE USER AT THIS CLIENT IS KEPT FROM THE ITEM'S TRUE FACE** (08 §4; D-1435). The
 * sheets, the inspector, the tooltips and the item sheet ask this, and it asks
 * `rules/identify.mjs#hiddenFrom` and nothing else: a GM sees the true item everywhere.
 */
export function hiddenToViewer(item) {
  return hiddenFrom(item, { isGM: Boolean(game.user?.isGM) });
}

/** The name the user at this client sees: the disguise where the item is hidden from them. */
export function shownName(item) {
  return hiddenToViewer(item) ? disguisedNameOf(item) : String(item?.name ?? "");
}

/**
 * The name a CHAT CARD carries. A card is public, so it is disguised wherever a player would be
 * kept from the item, whoever posts it; the GM can open the item itself.
 */
export function cardName(item) {
  return hiddenFrom(item, { isGM: false }) ? disguisedNameOf(item) : String(item?.name ?? "");
}

/** What a bonus from a hidden item is credited to: *an unidentified item*. */
export function unidentifiedSource() {
  return game.i18n.localize("AZEROTH.Identify.Source");
}

/**
 * **THE NAME A WORN THING'S BONUS IS CREDITED TO, FOR THIS VIEWER** (D-1435). `CharacterData`
 * derives both names with no viewer in the model - `name`, the true one, and `publicName`, *an
 * unidentified item* where a player is kept from the thing - because derived data is the same on
 * every client and a GM rolling for a player posts a public card. A surface on THIS screen (the
 * In-force column, the plate's tooltip) reads the true name for a GM and the public one for
 * everybody else, which is `hiddenToViewer`'s own answer; a card always reads `publicName`.
 */
export function shownSourceName(source) {
  return game.user?.isGM ? String(source?.name ?? "") : String(source?.publicName ?? source?.name ?? "");
}

/**
 * `system.grants` as THIS viewer reads its source lists: the true names for a GM, the public
 * twins (`grants.public`, derived beside them) for everybody else. The counts are the same.
 */
export function shownGrants(grants) {
  const g = grants ?? {};
  return game.user?.isGM || !g.public ? g : { ...g, ...g.public };
}

/**
 * A refusal's `name`, as THIS user sees the thing (08 §4; D-1435). The bag law is pure and names
 * a thing off its row's true name; the row a hidden thing of the actor's own came from is found
 * again and disguised here, so the rows the law judges stay the same on every client.
 */
export function shownRefusalData(actor, data = {}) {
  if (!data?.name) return data ?? {};
  const item = actor?.items?.find?.(i => i.name === data.name && hiddenToViewer(i)) ?? null;
  return item ? { ...data, name: shownName(item) } : data;
}
