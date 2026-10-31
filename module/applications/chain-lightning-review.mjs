import { requestChainLightningReview } from "../effects/chain-lightning-cast.mjs";
const words = key => game.i18n.localize(`AZEROTH.ChainLightning.Review.${key}`);

export async function reviewChainLightningCast(actor) {
  if (!game.user?.isGM) return null;
  const record = actor.getFlag("azeroth-rpg", "chainLightningCast");
  if (record?.stage !== "pending") { ui.notifications.info(words("None")); return null; }
  const expected = structuredClone(record);
  const cards = game.messages.filter(message => message.getFlag("azeroth-rpg", "chainLightningRequestId") === record.requestId
    && message.getFlag("azeroth-rpg", "caster") === actor.uuid).map(message => ({ uuid: message.uuid, label: new Date(message.timestamp).toLocaleString() }));
  const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/dialog/chain-lightning-review.hbs", { name: actor.name, cards });
  const acknowledged = await foundry.applications.api.DialogV2.wait({
    window: { title: words("Title") }, classes: ["azeroth", "azeroth-ice-block-review"], position: { width: 560 }, content, rejectClose: false,
    buttons: [{ action: "review", label: words("Confirm"), callback: (_event, button) => button.form.elements.acknowledged?.checked === true },
      { action: "cancel", label: words("Cancel"), default: true, callback: () => false }],
    render: (_event, dialog) => {
      const form = dialog.element.querySelector("form");
      const update = () => { form.querySelector('[data-action="review"]').disabled = form.elements.acknowledged?.checked !== true; };
      form.addEventListener("change", update); update();
    }
  });
  if (acknowledged !== true) return null;
  const result = await requestChainLightningReview(actor, expected);
  ui.notifications[result.ok ? "info" : "warn"](words(result.ok ? "Reviewed" : result.reason === "writerActive" ? "WriterActive" : result.reason === "busy" ? "Busy" : "Changed"));
  return result;
}
