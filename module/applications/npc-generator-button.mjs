/**
 * The NPC generator's sidebar door (D-637): a New creature button in the
 * Actor directory's footer beside the character creator's, the compendium
 * browser's own pattern. GM only - the bestiary is the GM's.
 *
 * NO `data-action` HERE. An unrecognised action falls through ApplicationV2's
 * `#onClickAction` to a no-op, so the listener is attached directly.
 */

import { AzerothNpcGenerator } from "./npc-generator.mjs";

/** Marks our button so a re-render does not stack a second one. */
export const GENERATOR_BUTTON_CLASS = "azeroth-new-creature";

/**
 * Build the button. Exported so a test can assert its shape without a sidebar.
 * @returns {HTMLButtonElement}
 */
export function generatorButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add(GENERATOR_BUTTON_CLASS);
  button.innerHTML =
    `<i class="fa-solid fa-dragon" inert></i>`
    + `<span>${game.i18n.localize("AZEROTH.Generator.New")}</span>`;
  button.addEventListener("click", () => new AzerothNpcGenerator().render({ force: true }));
  return button;
}

/**
 * Put the button in the Actor sidebar footer, for a GM.
 * @param {HTMLElement} element  The directory's rendered element.
 * @returns {boolean}  Whether a button was added.
 */
export function addGeneratorButton(element) {
  if (!game.user?.isGM) return false;
  const footer = element?.querySelector("footer.directory-footer");
  if (!footer) return false;
  if (footer.querySelector(`.${GENERATOR_BUTTON_CLASS}`)) return false;
  footer.prepend(generatorButton());
  return true;
}

export function registerGeneratorButton() {
  Hooks.on("renderActorDirectory", (app, element) => addGeneratorButton(element));
}
