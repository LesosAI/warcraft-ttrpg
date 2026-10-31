import { iceBlockCreationReviewState, requestIceBlockCreationReview } from "../effects/ice-block-casting.mjs";
import { AZEROTH } from "../config.mjs";
import { drawCardPartial } from "../helpers/card-partials.mjs";
const ICE_BLOCK_REVIEW = "systems/azeroth-rpg/templates/chat/partials/ice-block-review.hbs";
const words = key => game.i18n.localize(`AZEROTH.IceBlock.${key}`);

export function showIceBlockCreationState(message, html) {
  const f = message.flags?.["azeroth-rpg"];
  if (f?.kind !== "spell" || f.identifier !== "ice-block") return;
  const body = html.querySelector(".azeroth-card-body");
  if (!body) return;
  let status = body.querySelector("[data-ice-block-status]");
  if (!status) {
    status = document.createElement("p"); status.dataset.iceBlockStatus = "";
    status.className = "azeroth-card-source"; status.setAttribute("role", "status"); body.append(status);
  }
  status.textContent = words(f.iceBlockCreationReview?.cleanup === "complete" ? "Reviewed"
    : f.iceBlockCreationReview ? "ReviewPending" : f.success !== true ? "Failed"
      : f.iceBlockResolution?.stage === "complete" ? "Complete" : "Unresolved");
  let actions = body.querySelector("[data-ice-block-review]");
  if (!actions) {
    actions = document.createElement("div"); actions.dataset.iceBlockReview = "";
    actions.className = "azeroth-card-actions"; body.append(actions);
  }
  const pending = game.user.isGM && iceBlockCreationReviewState(message)?.pending;
  actions.hidden = !pending;
  let button = actions.querySelector('[data-action="reviewIceBlockCreation"]');
  if (!pending) button?.remove();
  else if (!button) {
    button = drawCardPartial(ICE_BLOCK_REVIEW, {}, message);
    if (button) actions.append(button);
  }
}

export async function reviewIceBlockCreationCard(message) {
  if (!game.user.isGM) return null;
  const state = iceBlockCreationReviewState(message);
  if (!state?.pending) return null;
  const describe = effect => ({ name: effect.name, id: effect._id,
    conditions: (effect.statuses ?? []).map(s => game.i18n.localize(AZEROTH.conditions[s] ?? s)).join(", ") || words("NoConditions"),
    changes: (effect.system?.changes ?? []).map(c => `${c.key}: ${c.type} ${c.value}`).join("; ") || words("NoChanges") });
  const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/dialog/ice-block-review.hbs", {
    caster: state.actor.name, missing: state.actor.missing,
    previous: (state.receipt?.previousConditions ?? []).map(describe), current: state.actor.effects.map(describe)
  });
  const acknowledged = await foundry.applications.api.DialogV2.wait({
    window: { title: words("Review") }, classes: ["azeroth", "azeroth-ice-block-review"], position: { width: 620 },
    content, rejectClose: false,
    buttons: [{ action: "review", label: words("MarkReviewed"), callback: (_event, button) => button.form.elements.acknowledged?.checked === true },
      { action: "cancel", label: words("Cancel"), default: true, callback: () => false }],
    render: (_event, dialog) => {
      const form = dialog.element.querySelector("form");
      const update = () => { form.querySelector('[data-action="review"]').disabled = form.elements.acknowledged?.checked !== true; };
      form.addEventListener("change", update); update();
    }
  });
  if (!acknowledged) return null;
  const result = await requestIceBlockCreationReview(message, state.expected);
  ui.notifications[result?.ok ? "info" : "warn"](words(result?.ok ? "Reviewed" : "ReviewChanged"));
  return result;
}
