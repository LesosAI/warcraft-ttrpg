/**
 * The GM's downtime toggle (D-1914; the plan's M8): **Open downtime** / **Close
 * downtime** in the Actor directory's footer, drawn ONLY while the world setting
 * *Crafting only in downtime* is on - with it off crafting is open and there is
 * nothing to toggle. The NPC generator's own pattern (`npc-generator-button.mjs`).
 *
 * NO `data-action` HERE. An unrecognised action falls through ApplicationV2's
 * `#onClickAction` to a no-op, so the listener is attached directly.
 */

import { CRAFTING_DOWNTIME_SETTING, DOWNTIME_OPEN_SETTING, downtimeState } from "../settings.mjs";

/** Marks our button so a re-render does not stack a second one. */
export const DOWNTIME_BUTTON_CLASS = "azeroth-downtime-toggle";

/**
 * Build the button for the state the world holds now. Exported so a test can
 * assert its shape without a sidebar.
 * @returns {HTMLButtonElement}
 */
export function downtimeButton() {
  const { open } = downtimeState();
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add(DOWNTIME_BUTTON_CLASS);
  button.dataset.downtimeOpen = String(open);
  button.innerHTML =
    `<i class="fa-solid ${open ? "fa-door-closed" : "fa-door-open"}" inert></i>`
    + `<span>${game.i18n.localize(open ? "AZEROTH.Downtime.Close" : "AZEROTH.Downtime.Open")}</span>`;
  button.addEventListener("click", async () => {
    await game.settings.set("azeroth-rpg", DOWNTIME_OPEN_SETTING, !downtimeState().open);
    ui.notifications?.info(game.i18n.localize(downtimeState().open ? "AZEROTH.Downtime.Opened" : "AZEROTH.Downtime.Closed"));
  });
  return button;
}

/**
 * Put the button in the Actor sidebar footer, for a GM, while the rule is
 * enforced; take it away while it is not.
 * @param {HTMLElement} element  The directory's rendered element.
 * @returns {boolean}  Whether a button stands after the call.
 */
export function addDowntimeButton(element) {
  const footer = element?.querySelector("footer.directory-footer");
  if (!footer) return false;
  footer.querySelector(`.${DOWNTIME_BUTTON_CLASS}`)?.remove();
  if (!game.user?.isGM || !downtimeState().enforced) return false;
  footer.prepend(downtimeButton());
  return true;
}

export function registerDowntimeButton() {
  Hooks.on("renderActorDirectory", (app, element) => addDowntimeButton(element));
  // The two settings move the button: draw the directory again when either changes.
  Hooks.on("updateSetting", setting => {
    if ([CRAFTING_DOWNTIME_SETTING, DOWNTIME_OPEN_SETTING].some(k => setting?.key === `azeroth-rpg.${k}`)) ui.actors?.render();
  });
  Hooks.on("createSetting", setting => {
    if ([CRAFTING_DOWNTIME_SETTING, DOWNTIME_OPEN_SETTING].some(k => setting?.key === `azeroth-rpg.${k}`)) ui.actors?.render();
  });
}
