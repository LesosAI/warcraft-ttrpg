import { STARFALL_START } from "../effects/starfall-turn.mjs";
import { STARFALL_QUERY, STARFALL_RECEIPTS, deliverStarfall } from "../effects/starfall-use.mjs";
import { STARFALL_OFFER } from "../effects/starfall-offers.mjs";
import { starfallTargetLimit } from "../rules/starfall.mjs";
import { starfallReceiptSummary } from "../rules/starfall-receipt.mjs";

const text = (key, data = {}) => game.i18n.format(`AZEROTH.Starfall.${key}`, data);

async function reviewReceipt(receipt) {
  const summary = starfallReceiptSummary(receipt);
  if (summary.state === "done") { ui.notifications.info(text("Done")); return; }
  // Only the GM sees identities. The original target may now be hidden,
  // off-scene or deleted; opening a historical card must not reveal it.
  const statusKeys = { completed: "ReviewCompleted", attempted: "ReviewAttempted", pending: "ReviewPending" };
  const rows = game.user.isGM ? summary.rows.map(row => {
    let actor;
    try { actor = fromUuidSync(row.uuid); } catch { /* A deleted actor still has a receipt identity. */ }
    return { name: actor?.name ?? row.uuid, status: text(statusKeys[row.state]) };
  }) : [];
  const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/dialog/starfall-review.hbs", {
    valid: summary.valid, summary: summary.valid ? text("ReviewSummary", summary) : "", rows
  });
  await foundry.applications.api.DialogV2.wait({ window: { title: text("ReviewTitle") },
    classes: ["azeroth", "azeroth-starfall-review"], content, rejectClose: false,
    buttons: [{ action: "close", label: text("ReviewClose"), default: true, callback: () => null }] });
}

export async function chooseStarfall(message) {
  const offer = message?.flags?.["azeroth-rpg"]?.[STARFALL_OFFER];
  if (!message?.author?.isGM || !offer) return null;
  const combat = game.combats.get(offer.combatId), actor = fromUuidSync(offer.actorUuid);
  if (!combat || (!game.user.isGM && !actor?.isOwner)) { ui.notifications.warn(text("Unavailable")); return null; }
  const receipts = combat.getFlag("azeroth-rpg", STARFALL_RECEIPTS) ?? [];
  const matching = Array.isArray(receipts) ? receipts.filter(row => row?.key === offer.key) : [];
  // Review remains available after the turn advances. Duplicate/corrupt
  // records never masquerade as a completed strike or unlock a fresh chooser.
  if (!Array.isArray(receipts) || matching.length > 1) { await reviewReceipt(null); return null; }
  if (matching.length) { await reviewReceipt(matching[0]); return null; }
  if (!actor || !combat.started || combat.round !== offer.round || combat.turn !== offer.turn
    || combat.combatant?.id !== offer.combatantId) { ui.notifications.warn(text("Unavailable")); return null; }
  const start = combat.getFlag("azeroth-rpg", STARFALL_START);
  const region = combat.combatant.token?.parent?.regions?.get(offer.regionId);
  const held = start?.casts?.find(row => row.cast === offer.cast && row.regionUuid === region?.uuid);
  if (!held || start.refusal) { ui.notifications.warn(text("Unavailable")); return null; }
  const candidates = [];
  for (const uuid of held.candidates) {
    const tokens = [...region.parent.tokens].filter(token => token.actor?.uuid === uuid && token.testInsideRegion(region));
    if (!tokens.length) continue;
    if (!game.user.isGM && !tokens.some(token => token.actor.isOwner || token.object?.isVisible === true)) {
      ui.notifications.warn(text("GMChoice")); return null;
    }
    candidates.push({ uuid, name: tokens[0].actor.name });
  }
  const rank = Math.max(0, ...(actor.takenTalents?.() ?? []).filter(t => t.className === "Druid" && t.identifier === "starfall").map(t => Number(t.taken) || 0));
  const required = Math.min(candidates.length, starfallTargetLimit({ talentRank: Math.min(rank, held.talentRank) }));
  if (!required) { ui.notifications.info(text("Empty")); return null; }
  const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/dialog/starfall.hbs", {
    candidates, description: text("ChooseCount", { count: required })
  });
  const read = form => [...form.querySelectorAll('input[name="starfall-target"]:checked')].map(input => input.value);
  const targets = await foundry.applications.api.DialogV2.wait({
    window: { title: "Starfall" }, classes: ["azeroth", "azeroth-starfall"], content, rejectClose: false,
    buttons: [
      { action: "strike", label: text("Strike"), callback: (_event, button) => { const ids = read(button.form); return ids.length === required ? ids : null; } },
      { action: "cancel", label: text("Cancel"), default: true, callback: () => null }
    ],
    render: (_event, dialog) => {
      const form = dialog.element.querySelector("form");
      const update = () => { form.querySelector('[data-action="strike"]').disabled = read(form).length !== required; };
      form.addEventListener("change", update); update();
    }
  });
  // DialogV2 may return the button action when its callback returns null.
  // Only a real selection array may cross the damage-query boundary.
  if (!Array.isArray(targets)) return null;
  const gm = game.users.activeGM;
  if (!gm) { ui.notifications.warn(text("Unavailable")); return null; }
  const result = game.user.id === gm.id ? await deliverStarfall({ ...offer, targets })
    : await gm.query(STARFALL_QUERY, { ...offer, targets });
  if (result?.ok) ui.notifications.info(text("Done"));
  else ui.notifications.warn(text(result?.reason === "review" ? "Review" : "Unavailable"));
  return result;
}
