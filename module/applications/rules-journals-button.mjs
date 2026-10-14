/**
 * The book's door into the Journals tab (the lead, 2026-09-08): a *Import the
 * book* button in the Journal directory's footer, the compendium browser's own
 * pattern. GM only — it writes 18 documents into the world.
 *
 * NO `data-action` HERE. An unrecognised action falls through ApplicationV2's
 * `#onClickAction` to a no-op, so the listener is attached directly, and the
 * footer's own buttons come from the render context so this appends.
 */

import { importRulesJournalsAndReport } from "./rules-journals.mjs";
import { MAP_BUTTON_CLASS } from "./world-map-button.mjs";

/** Marks our button so a re-render does not stack a second one. */
export const JOURNALS_BUTTON_CLASS = "azeroth-import-rules";

/**
 * Build the button. Exported so a test can assert its shape without a sidebar.
 * @returns {HTMLButtonElement}
 */
export function rulesJournalsButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add(JOURNALS_BUTTON_CLASS);
  button.innerHTML =
    `<i class="fa-solid fa-book" inert></i>`
    + `<span>${game.i18n.localize("AZEROTH.Journals.Import")}</span>`;
  button.addEventListener("click", () => importRulesJournalsAndReport());
  return button;
}

/**
 * Put the button in the Journal sidebar footer, for a GM.
 *
 * **World map first, Import second** (the lead, 2026-09-13). The world map's
 * own door moved onto this footer, and the two hooks fire in registration
 * order, which is not a thing either module should depend on: this one lands
 * AFTER the map button where it is already there and prepends where it is not,
 * and the map button prepends unconditionally. Either order gives the same
 * pair.
 *
 * @param {HTMLElement} element  The directory's rendered element.
 * @returns {boolean}  Whether a button was added.
 */
export function addRulesJournalsButton(element) {
  if (!game.user?.isGM) return false;
  const footer = element?.querySelector("footer.directory-footer");
  if (!footer) return false;
  if (footer.querySelector(`.${JOURNALS_BUTTON_CLASS}`)) return false;
  const map = footer.querySelector(`.${MAP_BUTTON_CLASS}`);
  if (map) map.after(rulesJournalsButton());
  else footer.prepend(rulesJournalsButton());
  return true;
}

export function registerRulesJournalsButton() {
  Hooks.on("renderJournalDirectory", (app, element) => addRulesJournalsButton(element));
}
