import { pendingSearingUses, requestSearingUseReview } from "../effects/searing-totem-use.mjs";
const words = key => game.i18n.localize(`AZEROTH.Bound.SearingReview.${key}`);

export async function reviewSearingUses(actor) {
  if (!game.user?.isGM) return null;
  const rows = pendingSearingUses(actor);
  if (!rows.length) { ui.notifications.info(words("None")); return null; }
  const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/dialog/searing-totem-review.hbs", { rows, name: actor.name });
  const selected = await foundry.applications.api.DialogV2.wait({
    window: { title: words("Title") }, classes: ["azeroth", "azeroth-ice-block-review"], position: { width: 560 },
    content, rejectClose: false,
    buttons: [{ action: "review", label: words("Confirm"), callback: (_event, button) =>
      button.form.elements.acknowledged?.checked === true ? Number(button.form.elements.receipt.value) : -1 },
    { action: "cancel", label: words("Cancel"), default: true, callback: () => -1 }],
    render: (_event, dialog) => {
      const form = dialog.element.querySelector("form");
      const update = () => { form.querySelector('[data-action="review"]').disabled = form.elements.acknowledged?.checked !== true; };
      form.addEventListener("change", update); update();
    }
  });
  if (!Number.isInteger(selected) || !rows[selected]) return null;
  const result = await requestSearingUseReview(rows[selected]);
  ui.notifications[result.ok ? "info" : "warn"](words(result.ok ? "Reviewed" : "Changed"));
  return result;
}
