/**
 * The loot generator's sidebar door (D-666): a Roll loot button in the Item
 * directory's footer, the compendium browser's own pattern. GM only - what
 * a party finds is the GM's to decide.
 *
 * NO `data-action` HERE. An unrecognised action falls through ApplicationV2's
 * `#onClickAction` to a no-op, so the listener is attached directly.
 */

import { AzerothLootGenerator } from "./loot-generator.mjs";

/** Marks our button so a re-render does not stack a second one. */
export const LOOT_BUTTON_CLASS = "azeroth-new-loot";

/**
 * Build the button. Exported so a test can assert its shape without a sidebar.
 * @returns {HTMLButtonElement}
 */
export function lootButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add(LOOT_BUTTON_CLASS);
  button.innerHTML =
    `<i class="fa-solid fa-gem" inert></i>`
    + `<span>${game.i18n.localize("AZEROTH.Loot.New")}</span>`;
  button.addEventListener("click", () => new AzerothLootGenerator().render({ force: true }));
  return button;
}

/**
 * Put the button in the Item sidebar footer, for a GM.
 * @param {HTMLElement} element  The directory's rendered element.
 * @returns {boolean}  Whether a button was added.
 */
export function addLootButton(element) {
  if (!game.user?.isGM) return false;
  const footer = element?.querySelector("footer.directory-footer");
  if (!footer) return false;
  if (footer.querySelector(`.${LOOT_BUTTON_CLASS}`)) return false;
  footer.prepend(lootButton());
  return true;
}

export function registerLootButton() {
  Hooks.on("renderItemDirectory", (app, element) => addLootButton(element));
}
