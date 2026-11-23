/**
 * **TEMPORARY HEALTH ON THE TOKEN HUD** (the lead, 2026-11-23: *"changing the text color when over maximum
 * from temp hp"*). Core's HUD draws the bar as a bare number in a text input and knows nothing of 05's
 * temporary Health, which is stored apart from the Health (`system.health.temp`; D-777). While it stands
 * the bar that reads Health takes the temp ink (`styles/_hud.scss`) and a tooltip says how much, from what
 * and for how long - the same words the sheet's banner carries.
 *
 * **NOTHING IS WRITTEN AND THE INPUT IS LEFT ALONE**: its value is the Health, and an edit to it still
 * writes the Health, so the amount rides the tooltip and never the field.
 */
import { AZEROTH } from "../config.mjs";
import { TEMP_FLAG, temporaryOnSheet } from "../rules/temporary-health.mjs";

/** The bars a token can draw, in the HUD's own names. */
export const HUD_BARS = Object.freeze(["bar1", "bar2"]);

/**
 * The tooltip a HUD bar carries, or null where there is no temporary Health or the bar is not Health.
 * Pure over its arguments: `format` is `game.i18n.format`, handed in so a test needs no `game`.
 *
 * @param {{attribute?: string|null}|null} bar  the token's bar setting (`TokenDocument#bar1`)
 * @param {{temp?: number, record?: object|null}} health  the actor's `health.temp` and its flag
 * @param {(key: string, data: object) => string} format
 * @param {(key: string) => string} localize
 * @returns {string|null}
 */
export function hudTempTip(bar, health, format, localize) {
  if (bar?.attribute !== "health") return null;
  const shown = temporaryOnSheet(health);
  if (!shown) return null;
  const source = shown.source || localize("AZEROTH.Health.TemporaryUnsourced");
  const span = localize(AZEROTH.temporaryHealthSpans[shown.span ?? "longRest"] ?? AZEROTH.temporaryHealthSpans.longRest);
  return `${format("AZEROTH.Health.Temporary", { n: shown.n })}. ${format("AZEROTH.Health.TemporaryTip", { source, span })}`;
}

/** Marks the Health bar on a rendered HUD. */
export function registerTempHealthHud() {
  Hooks.on("renderTokenHUD", (app, element) => {
    const doc = app?.document;
    const actor = doc?.actor;
    if (!actor || !element?.querySelector) return;
    const health = { temp: actor.system?.health?.temp ?? 0, record: actor.getFlag?.("azeroth-rpg", TEMP_FLAG) ?? null };
    for (const name of HUD_BARS) {
      const tip = hudTempTip(doc[name], health, (k, d) => game.i18n.format(k, d), k => game.i18n.localize(k));
      if (!tip) continue;
      const box = element.querySelector(`.attribute.${name}`);
      const input = box?.querySelector("input");
      if (!input) continue;
      input.classList.add("azeroth-hud-temp");
      box.dataset.tooltip = tip;
    }
  });
}
