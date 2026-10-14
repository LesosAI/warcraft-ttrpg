/**
 * The world map's sidebar door (D-680): a World map button in the **Journal**
 * directory's footer, the compendium browser's own pattern. NOT GM-gated —
 * who holds a province is what the table is playing for, and a player reading
 * the map is the point of it.
 *
 * **IT USED TO HANG OFF THE SCENE DIRECTORY** and the lead could not find it
 * (2026-09-13): a player has no business in the Scenes tab — it is GM-only
 * furniture in most worlds — and the map is a thing you READ, which is what
 * the Journals tab is. It sits beside *Import the book*, first, because the
 * two are the same kind of door: the world as written and the world as drawn.
 *
 * NO `data-action` HERE. An unrecognised action falls through ApplicationV2's
 * `#onClickAction` to a no-op, so the listener is attached directly.
 *
 * The footer's buttons come from the render context and cannot be extended
 * from a render hook, so this appends instead.
 */

import { AzerothWorldMap } from "./world-map.mjs";
import { MAP_AT_LOGIN_SETTING } from "../settings.mjs";

/** Marks our button so a re-render does not stack a second one. */
export const MAP_BUTTON_CLASS = "azeroth-world-map-open";

/** The one window, so a second click raises it rather than opening another. */
let open = null;

/** Open the world map, or bring the open one forward. */
export function openWorldMap() {
  open ??= new AzerothWorldMap();
  return open.render({ force: true });
}

/**
 * Build the button. Exported so a test can assert its shape without a sidebar.
 * @returns {HTMLButtonElement}
 */
export function worldMapButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add(MAP_BUTTON_CLASS);
  button.innerHTML =
    `<i class="fa-solid fa-map-location-dot" inert></i>`
    + `<span>${game.i18n.localize("AZEROTH.Map.Button")}</span>`;
  button.addEventListener("click", () => openWorldMap());
  return button;
}

/**
 * Put the button in the Journal sidebar footer, first.
 *
 * `prepend` rather than an insertion relative to *Import the book*: whichever
 * of the two render hooks fires first, this lands ahead of it, and
 * `addRulesJournalsButton` puts itself AFTER this one where it is already
 * there. The pair reads World map, then Import, in either order.
 *
 * @param {HTMLElement} element  The directory's rendered element.
 * @returns {boolean}  Whether a button was added.
 */
export function addWorldMapButton(element) {
  const footer = element?.querySelector("footer.directory-footer");
  if (!footer) return false;
  if (footer.querySelector(`.${MAP_BUTTON_CLASS}`)) return false;
  footer.prepend(worldMapButton());
  return true;
}

export function registerWorldMapButton() {
  Hooks.on("renderJournalDirectory", (app, element) => addWorldMapButton(element));

  // The landing page, per client and opt-in. A window that opens itself for
  // everybody is a window somebody closes every session.
  Hooks.once("ready", () => {
    let wanted = false;
    try { wanted = game.settings.get("azeroth-rpg", MAP_AT_LOGIN_SETTING); } catch { wanted = false; }
    if (wanted) openWorldMap();
  });
}
