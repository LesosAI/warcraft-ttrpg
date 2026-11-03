import { utilityDialog } from "../applications/thematic-utility-dialog.mjs";
import { finishHolyCast } from "./thematic-holy.mjs";
import { finishDreamCast } from "./thematic-dream.mjs";
import { finishRelayAttempt, finishSpellRelaySetup } from "./spell-relay.mjs";

const NS = "azeroth-rpg";
const refused = reason => ({ok: false, reason});
const receiptState = (message, flag) => message?.flags?.[NS]?.[flag] ?? null;
const recoveries = new Map();
const activeTickets = new Set();

function matchesOriginalCard(state, card, flags) {
  if (state.identifier && state.identifier !== flags.identifier) return false;
  if (state.source && flags.source && (state.source.sceneId !== flags.source.sceneId
    || state.source.tokenId !== flags.source.tokenId)) return false;
  const sceneId = state.source?.sceneId ?? flags.source?.sceneId;
  const tokenId = state.source?.tokenId ?? flags.source?.tokenId;
  const sourceActor = sceneId && tokenId ? game.scenes?.get(sceneId)?.tokens.get(tokenId)?.actor : null;
  const speakerActor = card.speaker?.actor ? game.actors?.get(card.speaker.actor) : null;
  const actor = sourceActor ?? speakerActor;
  if (state.actorUuid && actor?.uuid && state.actorUuid !== actor.uuid) return false;
  return true;
}

/** Reconcile a paid cast only from its GM-owned receipt and exact card binding. */
export function recoverThematicCastCard(message) {
  const card = message?.documentName === "ChatMessage" ? message : game.messages?.get(message?.id);
  const key = card?.uuid ?? card?.id;
  if (!key) return Promise.resolve(refused("card"));
  const pending = recoveries.get(key);
  if (pending) return pending;
  const flags = card.flags?.[NS] ?? {};
  const kinds = Array.isArray(flags.thematicResolutionPending) ? flags.thematicResolutionPending : [];
  const ticketKeys = [...new Set(kinds.map(kind => kind === "holy" ? flags.holyTicket
    : kind === "dream" ? flags.dreamTicket
      : kind === "relay" ? flags.spellRelayAttemptTicket ?? flags.spellRelayTicket
        : kind === "verdict" ? flags.verdictTicket : null).filter(Boolean))].map(ticket => `receipt:${ticket}`);
  if (ticketKeys.some(ticket => activeTickets.has(ticket))) return Promise.resolve(refused("busy"));
  for (const ticket of ticketKeys) activeTickets.add(ticket);
  const task = reconcileThematicCastCard(card).finally(() => {
    if (recoveries.get(key) === task) recoveries.delete(key);
    for (const ticket of ticketKeys) activeTickets.delete(ticket);
  });
  recoveries.set(key, task);
  return task;
}

async function reconcileThematicCastCard(message) {
  if (game.user?.isGM !== true || game.users?.activeGM?.id !== game.user.id) return refused("authority");
  const card = message?.documentName === "ChatMessage" ? message : game.messages?.get(message?.id);
  const flags = card?.flags?.[NS], cast = flags?.cast;
  const pending = Array.isArray(flags?.thematicResolutionPending) ? [...new Set(flags.thematicResolutionPending)] : [];
  if (!card || !cast) return refused("card");
  if (!pending.length) {
    const resolved = flags.thematicResolution ?? {};
    return Object.keys(resolved).length ? {ok: true, resolved: Object.keys(resolved), pending: []} : refused("card");
  }
  const resolved = {...(flags.thematicResolution ?? {})};
  const remaining = [];

  for (const kind of pending) {
    const ticket = kind === "holy" ? flags.holyTicket
      : kind === "dream" ? flags.dreamTicket
        : kind === "relay" ? flags.spellRelayAttemptTicket ?? flags.spellRelayTicket
          : kind === "verdict" ? flags.verdictTicket : null;
    if (!ticket) { remaining.push(kind); continue; }
    const receipt = game.messages?.get(ticket);
    const key = kind === "dream" ? "dreamReceipt"
      : kind === "relay" ? (flags.spellRelayAttemptTicket ? "spellRelayAttempt" : "spellRelayReceipt")
        : "holyReceipt";
    const state = receiptState(receipt, key);
    if (!receipt || !state || state.ticket && state.ticket !== ticket || !matchesOriginalCard(state, card, flags)) {
      remaining.push(kind); continue;
    }
    const claimMatches = state.claimCast === cast || state.claim?.attemptId === cast || state.claimAttempt === cast;

    if (claimMatches) {
      let result;
      try {
        if (kind === "holy") result = await finishHolyCast(ticket, card.id);
        else if (kind === "dream") result = await finishDreamCast(ticket, card.id);
        else if (kind === "relay") result = flags.spellRelayAttemptTicket
          ? await finishRelayAttempt(ticket, card.id) : await finishSpellRelaySetup(ticket, card.id);
        else result = {ok: true, recovered: true}; // Verdict's own receipt drives the damage hook.
      } catch (error) {
        console.warn(`azeroth-rpg | ${kind} cast recovery`, error);
        result = refused("write");
      }
      if (result?.ok) {
        resolved[kind] = {outcome: "recovered", ticket, cast, at: game.time.worldTime};
        continue;
      }
      remaining.push(kind);
      continue;
    }
    if (state.status !== "prepared" || state.claimCast || state.claim?.attemptId || state.claimAttempt) {
      remaining.push(kind); continue;
    }

    const review = await utilityDialog({title: "Paid spell recovery", note:
      `The GM receipt has no claim for this cast. Confirm that ${kind} resolves without its benefit. The spell's payment and roll remain recorded.`,
      fields: [{name: "withoutBenefit", type: "checkbox", label: "Resolve this effect without benefit"}]});
    if (!review?.withoutBenefit) { remaining.push(kind); continue; }

    // A no-claim receipt cannot be claimed by a later press after this explicit
    // resolution. The original cast card remains the authority for the payment.
    try {
      await receipt.update({[`flags.${NS}.${key}`]: foundry.data.operators.ForcedReplacement.create({
        ...state, status: "resolvedWithoutBenefit", resolvedCast: cast, resolvedMessageId: card.id,
        resolvedAt: game.time.worldTime
      })});
      const after = receiptState(receipt, key);
      if (after?.status !== "resolvedWithoutBenefit" || after.resolvedCast !== cast || after.resolvedMessageId !== card.id) {
        remaining.push(kind); continue;
      }
      resolved[kind] = {outcome: "withoutBenefit", ticket, cast, at: game.time.worldTime};
    } catch (error) {
      console.warn(`azeroth-rpg | ${kind} no-benefit resolution`, error);
      remaining.push(kind);
    }
  }

  await card.update({
    [`flags.${NS}.thematicResolution`]: foundry.data.operators.ForcedReplacement.create(resolved),
    [`flags.${NS}.thematicResolutionPending`]: foundry.data.operators.ForcedReplacement.create(remaining)
  });
  return {ok: true, resolved: Object.keys(resolved), pending: remaining};
}
