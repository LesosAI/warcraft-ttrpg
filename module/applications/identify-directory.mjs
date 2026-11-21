/**
 * **THE ITEMS SIDEBAR NAMES A HIDDEN THING BY ITS KIND** (08 §4, *Unidentified items*; D-1435).
 *
 * The loot offer lends the players OBSERVER on its world copies of what it offers
 * (`documents/loot-offer.mjs`), and a GM may share any unidentified world item, so a player's
 * Item directory lists them - by their true names, which is the one thing the lead's *"Kind +
 * rarity"* ruling keeps from them. Core's entry is `templates/sidebar/partials/document-partial.hbs`
 * at 14.367: an `li.directory-item.entry[data-entry-id]` holding an `a.entry-name` and, where the
 * directory shows thumbnails, an `img.thumbnail` whose `alt` is the name too. Both are rewritten
 * after every render, for a non-GM only, wherever `hiddenToViewer` holds.
 *
 * **The directory's search still matches the true name**: core filters on the document's own
 * name, and a filter rewritten here would be a second search. The lead's table is private, and the
 * CHANGELOG says so.
 */

import { hiddenToViewer, shownName } from "../helpers/identify-words.mjs";

/**
 * Rewrite every hidden entry's name in a rendered Item directory.
 * @param {HTMLElement} element  the directory's rendered element
 * @returns {number}  how many entries were disguised
 */
export function disguiseItemDirectory(element) {
  if (game.user?.isGM || !element?.querySelectorAll) return 0;
  let disguised = 0;
  for (const li of element.querySelectorAll("li.directory-item.entry[data-entry-id]")) {
    const item = game.items?.get(li.dataset.entryId) ?? null;
    if (!item || !hiddenToViewer(item)) continue;
    const shown = shownName(item);
    const name = li.querySelector(".entry-name");
    if (name) name.textContent = shown;
    const thumb = li.querySelector("img.thumbnail");
    if (thumb) thumb.alt = shown;
    disguised += 1;
  }
  return disguised;
}

export function registerIdentifyDirectory() {
  Hooks.on("renderItemDirectory", (app, element) => disguiseItemDirectory(element));
}
