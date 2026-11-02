import { spellstealRecoveryRows, recoverSpellsteal } from "../effects/spellsteal-recovery.mjs";
const words = key => game.i18n.localize(`AZEROTH.Spellsteal.${key}`);
const phaseWords = phase => words(({ holdRecipient: "RecoveryHolding", relocateCarriers: "RecoveryMoving",
  releaseSource: "RecoveryReleasing", done: "RecoveryComplete", claimed: "RecoveryPending", pending: "RecoveryPending"
})[phase] ?? "RecoveryNeedsReview");
const stepWords = state => state ? phaseWords(state) : words("RecoveryNotStarted");

export async function reviewSpellstealTransfers() {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id) {
    ui.notifications.warn(words("RecoveryActiveGM")); return null;
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

export function registerSpellstealReview() {
  Hooks.on("renderActorDirectory", (_app, element) => {
    if (!game.user?.isGM) return;
    const footer = element?.querySelector("footer.directory-footer");
    if (!footer || footer.querySelector("[data-spellsteal-review]")) return;
    const button = document.createElement("button"); button.type = "button";
    button.dataset.spellstealReview = ""; button.textContent = words("RecoveryTitle");
    button.addEventListener("click", () => reviewSpellstealTransfers().catch(error => {
      console.warn("azeroth-rpg | Spellsteal review", error); ui.notifications.warn(words("RecoveryChanged"));
    }));
    footer.append(button);
  });
}
