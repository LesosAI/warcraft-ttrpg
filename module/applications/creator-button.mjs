/**
 * The character creator's sidebar door (D-636): a New character button in
 * the Actor directory's footer, the compendium browser's own pattern
 * (browser-button.mjs). The directory re-renders on every actor change and
 * the footer with it, so the button is added on each render and never
 * stacked.
 *
 * Shown only to a user who may create an Actor - ACTOR_CREATE defaults to
 * the Assistant role, so a player's door is the Build button on a blank
 * sheet the GM handed them.
 *
 * NO `data-action` HERE. An unrecognised action falls through ApplicationV2's
 * `#onClickAction` to a no-op, so the listener is attached directly.
 */

import { AzerothCharacterCreator } from "./creator.mjs";

/** Marks our button so a re-render does not stack a second one. */
export const CREATOR_BUTTON_CLASS = "azeroth-create-character";

/**
 * Build the button. Exported so a test can assert its shape without a sidebar.
 * @returns {HTMLButtonElement}
 */
export function creatorButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add(CREATOR_BUTTON_CLASS);
  button.innerHTML =
    `<i class="fa-solid fa-user-plus" inert></i>`
    + `<span>${game.i18n.localize("AZEROTH.Creator.New")}</span>`;
  button.addEventListener("click", () => new AzerothCharacterCreator().render({ force: true }));
  return button;
}

/**
 * Put the button in the Actor sidebar footer, for a user who may create one.
 * @param {HTMLElement} element  The directory's rendered element.
 * @returns {boolean}  Whether a button was added.
 */
export function addCreatorButton(element) {
  if (!game.user?.can("ACTOR_CREATE")) return false;
  const footer = element?.querySelector("footer.directory-footer");
  if (!footer) return false;
  if (footer.querySelector(`.${CREATOR_BUTTON_CLASS}`)) return false;
  footer.prepend(creatorButton());
  return true;
}

export function registerCreatorButton() {
  Hooks.on("renderActorDirectory", (app, element) => addCreatorButton(element));
}
