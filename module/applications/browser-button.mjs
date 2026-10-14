/**
 * The compendium browser's door.
 *
 * THE BROWSER WAS UNREACHABLE FROM THE INTERFACE. It rendered, it filtered, and
 * fifteen Quench tests covered it — every one of them opening it by calling
 * `browse()` directly, which is exactly the blind spot a test written beside
 * the feature has. The only way a person could open it was from the console.
 *
 * V14's `CompendiumDirectory` renders a `footer` part from
 * `templates/sidebar/directory/footer.hbs`, whose buttons come from the
 * context — too late to extend from a render hook, since the render has
 * already happened. So the button is appended to the rendered footer instead.
 *
 * NO `data-action` HERE. An unrecognised action falls through ApplicationV2's
 * `#onClickAction` to a no-op `_onClickAction`, so the button would look wired
 * and do nothing. The listener is attached directly.
 */

import { AzerothCompendiumBrowser } from "./compendium-browser.mjs";

/** Marks our button so a re-render does not stack a second one. */
export const BUTTON_CLASS = "azeroth-browse";

/**
 * Build the button. Exported so a test can assert its shape without a sidebar.
 * @returns {HTMLButtonElement}
 */
export function browserButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add(BUTTON_CLASS);
  button.innerHTML =
    `<i class="fa-solid fa-book-open-cover" inert></i>`
    + `<span>${game.i18n.localize("AZEROTH.Browser.Title")}</span>`;
  button.addEventListener("click", () => AzerothCompendiumBrowser.browse());
  return button;
}

/**
 * Put the button in the Compendium sidebar footer.
 * @param {HTMLElement} element  The directory's rendered element.
 * @returns {boolean}  Whether a button was added.
 */
export function addBrowserButton(element) {
  const footer = element?.querySelector("footer.directory-footer");
  if (!footer) return false;
  if (footer.querySelector(`.${BUTTON_CLASS}`)) return false;
  footer.prepend(browserButton());
  return true;
}

export function registerBrowserButton() {
  Hooks.on("renderCompendiumDirectory", (app, element) => addBrowserButton(element));
}
