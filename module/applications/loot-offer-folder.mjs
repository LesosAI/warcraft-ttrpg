/**
 * *Offer to players…* on an Item folder's right click (D-721).
 *
 * The generator's own button offers a find the moment it is rolled; this is
 * the door for everything else — a hoard written by hand, a shelf of Classic
 * finds pulled out of the packs, a folder the GM has been filling all session.
 * Both doors go through `presentLoot`, so there is one presentation and one
 * picker however the loot was made.
 *
 * **The hook fires on EVERY directory** — `getFolderContextOptions` is
 * registered by `DocumentDirectory#_createContextMenus` with
 * `parentClassHooks: false`, so one listener hears the Actors, Items, Scenes,
 * Journal, Macros, Playlists and Cards tabs alike (verified at 14.367,
 * `client/applications/sidebar/document-directory.mjs:214-227`). The guard is
 * `app.documentName`, and without it the option would appear on an Actor
 * folder, where `folder.contents` are actors and every one of them is refused.
 *
 * The element handed to `visible` and `onClick` is the folder HEADER, not the
 * row: core's own two entries walk up with `header.closest(".directory-item")`
 * and read the folder off `dataset.uuid` (`:1171-1184`), and this does the
 * same rather than inventing a second way to find it.
 *
 * NO `data-action` ANYWHERE: a context menu entry is a callback core invokes,
 * and the audit's `MENU_ONLY` rule is about the sheets' own maps, not this.
 */

import { presentLoot } from "../documents/loot-offer.mjs";
import { lootOffer } from "../settings.mjs";
import { pickLootPlayers } from "./loot-offer.mjs";

/** What a character can be handed: the three physical types (08). */
export const OFFERABLE = new Set(["weapon", "armor", "gear"]);

/**
 * The things in a folder that may be offered, in the order a reader would
 * expect to see them.
 *
 * Three exclusions, each for its own reason:
 *
 * - **Not a weapon, a suit or gear**: a class, a talent or an affix is not a
 *   find, and `presentLoot` would stamp an offer's mark on it.
 * - **Already given** (`flags.azeroth-rpg.loot.given`, stamped by the settle):
 *   the world copy STAYS in the folder when a player takes it — the lead's
 *   call — so without this the same sword would be offered every session.
 * - **Already under an offer**: one offer at a time, and a find in the open
 *   one is not the folder's to hand out again.
 *
 * Exported so a test can ask what a folder holds without opening a menu.
 *
 * @param {Folder|null} folder
 * @returns {Item[]}
 */
export function offerableIn(folder) {
  // `pack`: a folder inside an open compendium is a world folder's twin and
  // holds pack documents, which are nobody's to offer (see `folderOf`).
  if (!folder || folder.type !== "Item" || folder.pack) return [];
  // `contents` is the folder's DIRECT children (core's own getter): a
  // sub-folder is offered from its own row, which is what makes a tree of
  // *Classic loot / <Zone>* usable one place at a time (D-685).
  return (folder.contents ?? [])
    .filter(item => OFFERABLE.has(item?.type))
    .filter(item => !item.getFlag?.("azeroth-rpg", "loot")?.given)
    .filter(item => !item.getFlag?.("azeroth-rpg", "offer")?.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The folder a right click landed on, off the row core put the uuid on.
 *
 * **A COMPENDIUM FOLDER IS NOT ONE.** `Compendium extends DocumentDirectory`
 * (14.367), so an open Item pack answers `documentName === "Item"` and fires
 * this same hook; a folder inside it is a Folder of type Item like any other.
 * Offering from one would stamp an offer's ownership and flags onto pack
 * documents - on a locked pack it throws, and on an unlocked one it edits the
 * system's own content. `folder.pack` is what tells them apart.
 */
function folderOf(header) {
  const uuid = header?.closest?.(".directory-item")?.dataset?.uuid ?? null;
  if (!uuid) return null;
  const folder = fromUuidSync(uuid);
  if (folder?.documentName !== "Folder" || folder.pack) return null;
  return folder;
}

/**
 * Offer everything the folder holds.
 *
 * THE PICKER RUNS BEFORE ANYTHING IS WRITTEN, as it does in the generator: a
 * dismissed picker leaves the world exactly as it found it.
 *
 * @param {Folder|null} folder
 * @returns {Promise<object|null>} the offer, or null with the reason shown
 */
export async function offerFolder(folder) {
  if (!folder) return null;
  if (lootOffer()) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.LootOffer.AlreadyOpen"));
    return null;
  }
  const items = offerableIn(folder);
  // REFUSED IN WORDS. An empty menu entry that does nothing when pressed is
  // indistinguishable from a broken one.
  if (!items.length) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.LootOffer.NoRows"));
    return null;
  }
  const userIds = await pickLootPlayers({ title: folder.name });
  if (!userIds?.length) return null;
  return presentLoot({ items, copper: 0, label: folder.name, stamp: { folder: folder.name }, userIds });
}

/**
 * Add the entry to an Item directory's folder menu.
 *
 * Exported for the batch, which asserts the option is offered on an Item
 * folder and withheld on an Actor folder — the `documentName` guard is the
 * only thing standing between this and every directory in the sidebar.
 *
 * @param {object} app      The directory the menu is being built for.
 * @param {object[]} options  Core's entries, pushed onto in place.
 * @returns {boolean}  Whether an entry was added.
 */
export function addLootOfferOption(app, options) {
  if (app?.documentName !== "Item" || !Array.isArray(options)) return false;
  options.push({
    label: "AZEROTH.LootOffer.PresentFolder",
    icon: "fa-solid fa-sack-dollar",
    // A player never offers loot; `presentLoot` refuses them at the door as
    // well, because a macro is a door too.
    visible: header => game.user.isGM && Boolean(folderOf(header)),
    onClick: (event, header) => offerFolder(folderOf(header))
  });
  return true;
}

/** Register at init, as the Party's own `getActorContextOptions` entry is. */
export function registerLootOfferFolderDoor() {
  Hooks.on("getFolderContextOptions", (app, options) => addLootOfferOption(app, options));
}
