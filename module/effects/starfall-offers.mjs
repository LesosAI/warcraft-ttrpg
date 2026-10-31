import { STARFALL_START } from "./starfall-turn.mjs";
import { starfallReceiptSummary } from "../rules/starfall-receipt.mjs";
import { starfallContexts } from "./starfall-context.mjs";

export const STARFALL_OFFER = "starfallOffer";
const pending = new Set();

function offerLive(combat, offer) {
  if (!combat.started || combat.round !== offer.round || combat.turn !== offer.turn
    || combat.combatant?.id !== offer.combatantId) return false;
  const actor = fromUuidSync(offer.actorUuid), scene = combat.combatant?.token?.parent;
  const inventory = starfallContexts(actor, scene);
  const region = scene?.regions?.get(offer.regionId);
  const start = combat.getFlag("azeroth-rpg", STARFALL_START);
  if (start?.version !== 1 || start.refusal || start.combatId !== combat.id || start.round !== combat.round
    || start.turn !== combat.turn || start.combatantId !== offer.combatantId || start.casterUuid !== offer.actorUuid) return false;
  const offered = start.casts?.find(row => row.cast === offer.cast && row.regionUuid === region?.uuid);
  if (!Array.isArray(offered?.candidates)) return false;
  return inventory.ok && inventory.contexts.some(row => row.cast === offer.cast && row.regionUuid === region?.uuid
    && row.candidates.some(candidate => offered.candidates.includes(candidate.uuid)));
}

/** Refresh presentation only; the receipt remains the delivery authority. */
export async function refreshStarfallOffers(combat) {
  const gmHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id
    && game.combats.get(combat?.id) === combat;
  if (!gmHere()) return;
  for (const message of game.messages.filter(row => row.author?.isGM
    && row.flags?.["azeroth-rpg"]?.[STARFALL_OFFER]?.combatId === combat.id)) {
    const offer = message.flags["azeroth-rpg"][STARFALL_OFFER];
    const current = () => JSON.stringify({ receipts: combat.getFlag("azeroth-rpg", "starfallTurns") ?? [],
      round: combat.round, turn: combat.turn, combatantId: combat.combatant?.id, started: combat.started,
      live: offerLive(combat, offer) });
    const before = current(), frame = JSON.parse(before);
    const matches = Array.isArray(frame.receipts) ? frame.receipts.filter(row => row?.key === offer.key) : [];
    const malformed = !Array.isArray(frame.receipts) || matches.length > 1;
    const state = malformed ? "review" : matches.length ? starfallReceiptSummary(matches[0]).state : "ready";
    const expired = state === "ready" && !frame.live;
    const actor = fromUuidSync(offer.actorUuid);
    const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/chat/starfall.hbs", {
      name: actor?.name ?? "Starfall", actorUuid: offer.actorUuid, resolved: state === "done", review: state === "review", expired
    });
    if (!gmHere() || current() !== before) continue;
    if (message.content !== content) await message.update({ content });
  }
}

/** Private reminder only: the Combat snapshot, not this card, authorizes damage. */
export async function postStarfallOffers(combat) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id || !combat?.started) return;
  await refreshStarfallOffers(combat);
  const start = combat.getFlag("azeroth-rpg", STARFALL_START);
  const actor = combat.combatant?.actor;
  if (!start || start.refusal || start.round !== combat.round || start.turn !== combat.turn
    || start.combatantId !== combat.combatant?.id || start.casterUuid !== actor?.uuid) return;
  for (const cast of start.casts ?? []) {
    if (!cast.candidates?.length) continue;
    const key = JSON.stringify([combat.uuid, start.round, start.turn, start.combatantId, actor.uuid, cast.cast]);
    if (pending.has(key) || game.messages.some(message => message.author?.isGM
      && message.flags?.["azeroth-rpg"]?.[STARFALL_OFFER]?.key === key)) continue;
    pending.add(key);
    try {
      const region = fromUuidSync(cast.regionUuid);
      if (!region) continue;
      const offer = { key, combatId: combat.id, combatantId: start.combatantId, round: start.round,
        turn: start.turn, regionId: region.id, cast: cast.cast, actorUuid: actor.uuid };
      const receiptsBefore = JSON.stringify(combat.getFlag("azeroth-rpg", "starfallTurns") ?? []);
      const receipts = JSON.parse(receiptsBefore);
      const matches = Array.isArray(receipts) ? receipts.filter(row => row?.key === key) : [];
      const state = !Array.isArray(receipts) || matches.length > 1 ? "review"
        : matches.length ? starfallReceiptSummary(matches[0]).state : "ready";
      if (state === "ready" && !offerLive(combat, offer)) continue;
      const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/chat/starfall.hbs", {
        name: actor.name, actorUuid: actor.uuid, resolved: state === "done", review: state === "review"
      });
      if (game.users.activeGM?.id !== game.user.id || combat.round !== start.round || combat.turn !== start.turn
        || JSON.stringify(combat.getFlag("azeroth-rpg", "starfallTurns") ?? []) !== receiptsBefore
        || (state === "ready" && !offerLive(combat, offer))) continue;
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content,
        whisper: game.users.filter(user => user.isGM || actor.testUserPermission(user, "OWNER")).map(user => user.id),
        flags: { "azeroth-rpg": { kind: "prompt", actorUuid: actor.uuid, [STARFALL_OFFER]: offer } } });
    } finally { pending.delete(key); }
  }
}
