import { spellstealRecoveryRows, recoverSpellsteal } from "../effects/spellsteal-recovery.mjs";
// The Actor directory's GM doors (D-799): drawn for a GM alone, and refused in
// words at the press for anyone but the active GM.
import { GM_DOOR_REFUSALS, gmDoorRefusal, showsGmDoor } from "../rules/gm-doors.mjs";
const words = key => game.i18n.localize(`AZEROTH.Spellsteal.${key}`);
const phaseWords = phase => words(({ holdRecipient: "RecoveryHolding", relocateCarriers: "RecoveryMoving",
  releaseSource: "RecoveryReleasing", done: "RecoveryComplete", claimed: "RecoveryPending", pending: "RecoveryPending"
})[phase] ?? "RecoveryNeedsReview");
const stepWords = state => state ? phaseWords(state) : words("RecoveryNotStarted");

export async function reviewSpellstealTransfers() {
  // Judged here as well as at the footer (D-799): a macro or a console call
  // reaches this door without the button.
  const refused = gmDoorRefusal(game.user, game.users?.activeGM?.id ?? null);
  if (refused) {
    ui.notifications.warn(game.i18n.format(GM_DOOR_REFUSALS[refused], { door: words("RecoveryTitle") })); return null;
  }
  const rows = spellstealRecoveryRows();
  if (!rows.length) { ui.notifications.info(words("RecoveryNone")); return null; }
  const snapshots = rows.map(({ casterName, mageName, spellName, ...view }) => view);
  const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/dialog/spellsteal-review.hbs", {
    rows: rows.map((row, index) => ({ ...row, index, phase: phaseWords(row.row.delivery?.attempted
      ?? row.row.delivery?.state ?? row.row.request.state), effectCount: row.effects.length,regionCount:row.regions.length,
      replacement: stepWords(row.row.replacement?.state), activation: stepWords(row.row.delivery?.activation?.state) }))
  });
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: words("RecoveryTitle") }, classes: ["azeroth"], position: { width: 620 }, content, rejectClose: false,
    buttons: [
      { action: "resolve", label: words("RecoveryResolve"), callback: (_event, button) => {
        const form = button.form, index = Number(form.elements.attempt.value);
        const action = form.querySelector(`[data-attempt="${index}"] select`)?.value;
        return form.elements.acknowledged.checked && ["confirm", "end"].includes(action) ? { index, action } : null;
      } },
      { action: "cancel", label: words("RecoveryCancel"), default: true, callback: () => null }
    ],
    render: (_event, dialog) => {
      const form = dialog.element.querySelector("form");
      const update = event => {
        if (event?.target === form.elements.attempt) form.elements.acknowledged.checked = false;
        const index = Number(form.elements.attempt.value);
        for (const panel of form.querySelectorAll("[data-attempt]")) panel.hidden = Number(panel.dataset.attempt) !== index;
        const selected = form.querySelector(`[data-attempt="${index}"] select`)?.value;
        form.querySelector('[data-action="resolve"]').disabled = !form.elements.acknowledged.checked || !["confirm", "end"].includes(selected);
      };
      form.addEventListener("change", update); update();
    }
  });
  if (!choice || !snapshots[choice.index]) return null;
  const expected = snapshots[choice.index];
  const result = await recoverSpellsteal({ casterUuid: expected.casterUuid, key: expected.key, action: choice.action, expected });
  ui.notifications[result.ok ? "info" : "warn"](words(result.ok ? "RecoveryDone"
    : result.reason === "writerActive" ? "RecoveryWriterActive" : "RecoveryChanged"));
  return result;
}

/**
 * Put Spellsteal recovery in the Actor directory's footer, for a GM alone
 * (D-799). Exported so a test can render the footer as a player and as a GM.
 *
 * @param {HTMLElement} element  the directory's rendered element
 * @param {User} [user]  whose footer it is
 * @returns {boolean}  whether a button was added
 */
export function addSpellstealReviewButton(element, user = game.user) {
  if (!showsGmDoor(user)) return false;
  const footer = element?.querySelector("footer.directory-footer");
  if (!footer || footer.querySelector("[data-spellsteal-review]")) return false;
  const button = document.createElement("button"); button.type = "button";
  button.dataset.spellstealReview = ""; button.textContent = words("RecoveryTitle");
  button.addEventListener("click", () => reviewSpellstealTransfers().catch(error => {
    console.warn("azeroth-rpg | Spellsteal review", error); ui.notifications.warn(words("RecoveryChanged"));
  }));
  footer.append(button);
  return true;
}

export function registerSpellstealReview() {
  Hooks.on("renderActorDirectory", (_app, element) => addSpellstealReviewButton(element));
}
