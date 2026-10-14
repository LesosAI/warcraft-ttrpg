/**
 * The colour a rarity lends an item's name (the lead, 2026-09-04; D-634).
 *
 * Pure: a class name, so the same rule reaches the sheet rows, the item
 * header and the browser. Common takes no class and stays in ink. Every
 * tint is measured against the parchment and the lighter row ground at
 * 4.5:1 or better (styles/_tokens.scss carries the numbers), because a
 * colour is never the only carrier and never below the floor (D-608).
 */

import { AZEROTH } from "../config.mjs";

export function rarityClass(rarity) {
  if (!rarity || rarity === "common" || !AZEROTH.rarities?.[rarity]) return "";
  return `azeroth-rarity-${rarity}`;
}
