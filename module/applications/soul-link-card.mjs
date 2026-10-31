import { soulLinkCreationReviewState, requestSoulLinkCreationReview } from "../effects/soul-link-casting.mjs";
import { drawCardPartial } from "../helpers/card-partials.mjs";
const SOUL_LINK_REVIEW = "systems/azeroth-rpg/templates/chat/partials/soul-link-review.hbs";
const words = key => game.i18n.localize(`AZEROTH.SoulLink.${key}`);

export function showSoulLinkCreationState(message, html) {
  const f = message.flags?.["azeroth-rpg"];
  if (f?.kind !== "spell" || f.identifier !== "soul-link" || !f.soulLinkPreparation?.ok) return;
  const body = html.querySelector(".azeroth-card-body");
  if (!body) return;
  let status = body.querySelector("[data-soul-link-status]");
  if (!status) {
    status = document.createElement("p"); status.dataset.soulLinkStatus = "";
    status.className = "azeroth-card-source"; status.setAttribute("role", "status"); body.append(status);
  }
  status.textContent = words(f.soulLinkCreationReview?.stage === "complete" ? "Reviewed"
    : f.success !== true ? "Failed" : f.soulLinkResolution?.stage === "complete" ? "Complete" : "Unresolved");
  let actions = body.querySelector("[data-soul-link-review]");
  if (!actions) {
    actions = document.createElement("div"); actions.dataset.soulLinkReview = "";
    actions.className = "azeroth-card-actions"; body.append(actions);
  }
  // Only GMs read current effects; other clients display the recorded result.
  const pending = game.user.isGM && soulLinkCreationReviewState(message)?.pending;
  actions.hidden = !pending;
  let button = actions.querySelector('[data-action="reviewSoulLinkCreation"]');
  if (!pending) button?.remove();
  else if (!button) {
    button = drawCardPartial(SOUL_LINK_REVIEW, {}, message);
    if (button) actions.append(button);
  }
}

export async function reviewSoulLinkCreationCard(message) {
  if (!game.user.isGM) return null;
  const state = soulLinkCreationReviewState(message);
  if (!state?.pending) return null;
  const recipientLabel = uuid => {
    try { const actor = fromUuidSync(uuid); return actor?.name ? `${actor.name} (${uuid})` : uuid ?? words("Unavailable"); }
    catch { return uuid ?? words("Unavailable"); }
  };
  const describe = effect => {
    const f = effect?.flags?.["azeroth-rpg"];
    return effect ? { name: effect.name, id: effect._id, recipient: recipientLabel(f?.soulLink?.recipientUuid),
      cast: f?.cast ?? words("Unavailable") } : null;
  };
  const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/dialog/soul-link-review.hbs", {
    caster: state.actor.name, missing: state.actor.missing,
    recipient: recipientLabel(state.receipt?.state?.recipientUuid ?? message.flags["azeroth-rpg"].soulLinkPreparation.recipientUuid),
    previous: describe(state.receipt?.previousEffect), current: state.actor.effects.map(describe),
    stage: words(state.receipt?.stage === "complete" ? "RecordedComplete" : state.receipt ? "CreationUncertain" : "NoReceipt")
  });
  const acknowledged = await foundry.applications.api.DialogV2.wait({
    window: { title: words("Review") }, classes: ["azeroth", "azeroth-soul-link-review"], position: { width: 560 },
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
  const result = await requestSoulLinkCreationReview(message, state.expected);
  ui.notifications[result?.ok ? "info" : "warn"](words(result?.ok ? "Reviewed" : "ReviewChanged"));
  return result;
}
