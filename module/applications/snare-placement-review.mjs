import { SNARE_PLACEMENT_REVIEW_QUERY, snarePlacementReviewHandler, snarePlacementReviewState } from "../effects/snare-placement.mjs";
import { snareOwnsCondition } from "../rules/snare-trigger.mjs";
import { drawCardPartial } from "../helpers/card-partials.mjs";
const SNARE_PLACEMENT_REVIEW = "systems/azeroth-rpg/templates/chat/partials/snare-placement-review.hbs";
const words = key => game.i18n.localize(`AZEROTH.Snare.${key}`);

export function showSnarePlacementState(message, html) {
  const flags = message.flags?.["azeroth-rpg"];
  if (!snareOwnsCondition(flags, "entangled")) return;
  const body = html.querySelector(".azeroth-card-body");
  if (!body) return;
  for (const button of body.querySelectorAll('[data-action="applyCondition"]')) {
    if (!snareOwnsCondition(flags, button.dataset.condition)) continue;
    const group = button.closest(".azeroth-card-actions"); button.remove();
    if (group && !group.querySelector("button")) group.remove();
  }
  let entry = body.querySelector("[data-snare-entry-status]");
  if (!entry) {
    entry = document.createElement("p"); entry.dataset.snareEntryStatus = "";
    entry.className = "azeroth-card-source"; entry.setAttribute("role", "status"); body.append(entry);
  }
  entry.textContent = words(flags.featureKey !== "snare" ? "LegacyCard"
    : flags.snareTrigger ? flags.snareTrigger.phase === "resolved" ? "Triggered" : "TriggerUnresolved" : "AutomaticEntry");
  if (!flags.snarePlacement) return;
  let status = body.querySelector("[data-snare-placement-status]");
  if (!status) {
    status = document.createElement("p"); status.dataset.snarePlacementStatus = "";
    status.className = "azeroth-card-source"; status.setAttribute("role", "status"); body.append(status);
  }
  status.textContent = words(flags.snarePlacement.phase === "placed" ? "PlacementConfirmed" : "PlacementUnresolved");
  let actions = body.querySelector("[data-snare-placement-review]");
  if (!actions) {
    actions = document.createElement("div"); actions.dataset.snarePlacementReview = "";
    actions.className = "azeroth-card-actions"; body.append(actions);
  }
  const pending = game.user.isGM && flags.snarePlacement.phase === "claimed";
  actions.hidden = !pending;
  let button = actions.querySelector('[data-action="reviewSnarePlacement"]');
  if (!pending) button?.remove();
  else if (!button) {
    button = drawCardPartial(SNARE_PLACEMENT_REVIEW, {}, message);
    if (button) actions.append(button);
  }
}

export async function reviewSnarePlacementCard(message) {
  if (!game.user.isGM) return null;
  const state = snarePlacementReviewState(message);
  const record = message.flags?.["azeroth-rpg"]?.snarePlacement;
  if (record?.phase !== "claimed") return null;
  const scene = game.scenes.get(record.sceneId), region = scene?.regions.get(record.regionId);
  const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/dialog/snare-placement-review.hbs", {
    scene: scene?.name ?? words("ReviewUnavailable"), region: region?.name ?? words("ReviewUnavailable"),
    regionId: record.regionId, canConfirm: state.ok, reason: state.ok ? words("ReviewMatch") : words(`ReviewReason_${state.reason}`)
  });
  const confirmed = await foundry.applications.api.DialogV2.wait({
    window: { title: words("ReviewPlacement") }, classes: ["azeroth", "azeroth-snare-placement-review"], position: { width: 520 },
    content, rejectClose: false,
    buttons: [{ action: "confirm", label: words("ConfirmPlacement"), callback: (_event, button) => state.ok && button.form.elements.acknowledged?.checked === true },
      { action: "cancel", label: words("ReviewCancel"), default: true, callback: () => false }],
    render: (_event, dialog) => {
      const form = dialog.element.querySelector("form");
      const update = () => { form.querySelector('[data-action="confirm"]').disabled = !state.ok || form.elements.acknowledged?.checked !== true; };
      form.addEventListener("change", update); update();
    }
  });
  if (!confirmed) return null;
  let result;
  try {
    const gm = game.users.activeGM;
    const payload = { messageId: message.id, expected: state.stamp };
    result = gm?.id === game.user.id ? await snarePlacementReviewHandler(payload, { user: game.user })
      : gm ? await gm.query(SNARE_PLACEMENT_REVIEW_QUERY, payload, { timeout: 15000 }) : null;
  } catch { result = null; }
  ui.notifications?.[result?.ok ? "info" : "warn"](words(result?.ok ? "PlacementConfirmed" : "ReviewChanged"));
  return result;
}
