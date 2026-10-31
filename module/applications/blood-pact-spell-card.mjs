import { bloodPactSpellReviewState, requestBloodPactSpellReview } from "../effects/blood-pact-spell.mjs";
const words = key => game.i18n.localize(`AZEROTH.BloodPactSpell.${key}`);

/** Render durable spell-transfer status on every client's real chat card. */
export function showBloodPactSpellState(message, html) {
  const f = message.flags?.["azeroth-rpg"];
  if (f?.kind !== "spell" || f.identifier !== "blood-pact" || !f.bloodPactSpell) return;
  const body = html.querySelector(".azeroth-card-body");
  if (!body) return;
  let status = body.querySelector("[data-blood-pact-spell-status]");
  if (!status) {
    status = document.createElement("p");
    status.dataset.bloodPactSpellStatus = "";
    status.className = "azeroth-card-source";
    status.setAttribute("role", "status");
    body.append(status);
  }
  const receipt = f.bloodPactSpellResolution;
  const reviewed = f.bloodPactSpellReview?.stage === "complete";
  status.textContent = reviewed ? words("Reviewed") : f.success !== true ? game.i18n.localize("AZEROTH.BloodPactSpell.Failed")
    : receipt?.stage === "complete" ? game.i18n.format("AZEROTH.BloodPactSpell.Complete", {
      name: f.bloodPactSpell.donorName, health: receipt.plan.health.spent, mana: receipt.plan.pool.restored })
    : game.i18n.localize("AZEROTH.BloodPactSpell.Unresolved");
  let actions = body.querySelector("[data-blood-pact-review]");
  if (!actions) {
    actions = document.createElement("div"); actions.dataset.bloodPactReview = "";
    actions.className = "azeroth-card-actions"; body.append(actions);
  }
  // Only the GM reads current resources for review; other clients render the
  // receipt and never need observation permission on the donor.
  const pending = game.user.isGM && bloodPactSpellReviewState(message)?.pending;
  actions.hidden = !pending;
  let button = actions.querySelector('[data-action="reviewBloodPactSpell"]');
  if (!pending) button?.remove();
  else if (!button) {
    button = document.createElement("button"); button.type = "button";
    button.dataset.action = "reviewBloodPactSpell"; button.textContent = words("Review"); actions.append(button);
  }
}

export async function reviewBloodPactSpellCard(message) {
  if (!game.user.isGM) return null;
  const state = bloodPactSpellReviewState(message);
  if (!state?.pending) return null;
  const [caster, donor] = state.actors;
  const value = n => n ?? words("Unavailable");
  const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/dialog/blood-pact-review.hbs", {
    caster: caster.name, donor: donor.name,
    healthBefore: value(state.plan.health?.before), healthAfter: value(state.plan.health?.after), healthNow: value(donor.health),
    manaBefore: value(state.plan.pool?.before), manaAfter: value(state.plan.pool?.after), manaNow: value(caster.pool?.value),
    stage: words(state.stage === "complete" ? "RecordedComplete" : state.stage === "manaApplying" ? "ManaUncertain"
      : state.stage === "healthApplying" ? "HealthUncertain" : "NoReceipt")
  });
  const acknowledged = await foundry.applications.api.DialogV2.wait({
    window: { title: words("Review") }, classes: ["azeroth", "azeroth-blood-pact-review"], position: { width: 500 },
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
  const result = await requestBloodPactSpellReview(message, state.expected);
  ui.notifications[result?.ok ? "info" : "warn"](words(result?.ok ? "Reviewed" : "ReviewChanged"));
  return result;
}
