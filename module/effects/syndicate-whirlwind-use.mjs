import { SYNDICATE_WHIRLWIND as SPEC, beginSyndicateWhirlwind, syndicateWhirlwindStep } from "../rules/syndicate-whirlwind.mjs";
import { WHIRLWIND_FLAG, startWhirlwind, advanceWhirlwind, interruptWhirlwind } from "./syndicate-whirlwind-state.mjs";
import { inspectWhirlwindSource, reviewWhirlwindTargets } from "./syndicate-whirlwind-scene.mjs";
import { rollWhirlwindStrikes } from "./syndicate-whirlwind-strikes.mjs";

export const WHIRLWIND_QUERY = "azeroth-rpg.syndicateWhirlwind";
const busy = new Set(), REQUESTS = "syndicateWhirlwindRequests";
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestWhirlwind(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID(), issuedAt: Date.now() };
    const result = writer() ? await whirlwindQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(WHIRLWIND_QUERY, data, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn("Whirlwind did not finish. Review its saved state, costs and attack cards before trying again.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Whirlwind request", error);
    ui.notifications?.warn("Whirlwind's result could not be confirmed. Review its saved state before repeating any step.");
    return null;
  }
}

/** Await cancellation before another out-of-combat action proceeds. The cast
 * identity prevents a delayed request from cancelling a later channel. */
export async function interruptWhirlwindForAction(actor) {
  const held = actor?.getFlag?.("azeroth-rpg", WHIRLWIND_FLAG);
  if (!["channeling", "striking"].includes(held?.phase)) return true;
  const data = { actorUuid: actor.uuid, castId: held.castId, operation: "interrupt" };
  try {
    const result = writer() ? await whirlwindQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(WHIRLWIND_QUERY, data, { timeout: 300000 });
    if (result?.ok) return true;
  } catch (error) { console.warn("azeroth-rpg | Whirlwind action interruption", error); }
  ui.notifications?.warn("The GM must confirm that Whirlwind has stopped before this action can proceed.");
  return false;
}

export async function whirlwindQueryHandler({ actorUuid, index, source, requestId, issuedAt, castId, operation = "use" } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (operation === "interrupt") {
    const held = actor.getFlag("azeroth-rpg", WHIRLWIND_FLAG);
    if (held?.castId !== castId) return refuse("castChanged");
    if (!["channeling", "striking"].includes(held.phase)) return { ok: true };
    return { ok: await interruptWhirlwind(actor, "actionSpent") };
  }
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const authorized = () => writer() && actor.testUserPermission(user, "OWNER") && fromUuidSync(actor.uuid) === actor;
  try {
    const { chooseOption, spendTurnBudget } = await import("../dice/workflows.mjs");
    const held = actor.getFlag("azeroth-rpg", WHIRLWIND_FLAG);
    if (["paying", "striking"].includes(held?.phase)) return refuse("reconcile");
    if (held?.phase === "channeling") {
      const inspect = () => authorized() && actor.getFlag("azeroth-rpg", WHIRLWIND_FLAG)?.castId === held.castId
        ? inspectWhirlwindSource(actor, held) : null;
      const current = inspect(); if (!current) return refuse("source");
      const step = syndicateWhirlwindStep({ ...current, record: held, interrupted: held.interrupted === true || current.interrupted === true });
      if (step.action === "wait") return { ok: true, waiting: true };
      if (step.action === "refuse") return refuse(step.reason);
      if (step.action === "cancel") return advanceWhirlwind({ actor, inspect: () => ({ ...inspect(), targets: [] }), volley: rollWhirlwindStrikes });
      const review = await reviewWhirlwindTargets({ actor, record: held, inspect, choose: chooseOption });
      if (!review || !authorized()) return refuse("cancelled");
      const result = await advanceWhirlwind({ actor, inspect: review.readCurrent, volley: rollWhirlwindStrikes });
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: result?.ok
        ? "<p>Whirlwind finishes. Resolve damage and reactions on its individual attack cards.</p>"
        : "<p>Whirlwind stopped. Review its saved attack cards; do not repeat completed attacks.</p>",
        flags: { "azeroth-rpg": { kind: "whirlwindReport", castId: held.castId, result } } });
      return result;
    }
    if (operation !== "use") return refuse("notPending");
    const now = Date.now();
    if (typeof requestId !== "string" || !/^[A-Za-z0-9]{16}$/.test(requestId) || !Number.isSafeInteger(issuedAt)
      || issuedAt > now + 5000 || now >= issuedAt + 600000) return refuse("request");
    const token = game.scenes?.get(source?.sceneId)?.tokens?.get(source?.tokenId);
    const initial = inspectWhirlwindSource(actor, { actorUuid: actor.uuid, tokenUuid: token?.uuid });
    if (!initial || !initial.alive || initial.incapacitated) return refuse("source");
    const record = beginSyndicateWhirlwind({ ...initial, castId: requestId });
    if (!record) return refuse("start");
    const stamp = facts => JSON.stringify([facts?.point, facts?.combat, facts?.time, facts?.attacks]);
    const initialStamp = stamp(initial);
    let consumed = false;
    const valid = () => {
      const facts = inspectWhirlwindSource(actor, record), row = actor.system.creatureAbilities?.[index], a = row?.automation;
      return authorized() && facts?.alive && !facts.incapacitated && !facts.interrupted && stamp(facts) === initialStamp
        && Number.isInteger(index) && row?.name === SPEC.name && a?.kind === "utility" && a.action === SPEC.action
        && !a.cost?.amount && a.uses?.max === 1 && a.uses.per === SPEC.per && a.uses.value === (consumed ? 0 : 1);
    };
    if (!valid()) return refuse("ability");
    const answer = await chooseOption({ name: SPEC.name, id: `${actor.id}-whirlwind` }, [
      { key: "start", name: "Begin Whirlwind", description: "Spend an Action and the encounter use. At your next turn, strike every enemy still within 5 feet. Moving or taking another action or reaction interrupts it." },
      { key: "cancel", name: "Cancel", description: "Keep your Action and encounter use." }
    ], null);
    if (answer?.key !== "start") return refuse("cancelled");
    if (!valid()) return refuse("changed");
    const records = actor.getFlag("azeroth-rpg", REQUESTS) ?? [], time = Date.now();
    if (!Array.isArray(records) || time >= issuedAt + 600000) return refuse("request");
    if (records.some(r => r.id === requestId && r.expiresAt > time)) return refuse("replay");
    await actor.setFlag("azeroth-rpg", REQUESTS, [...records.filter(r => r.expiresAt > time), { id: requestId, expiresAt: issuedAt + 600000 }]);
    if (!actor.getFlag("azeroth-rpg", REQUESTS)?.some(r => r.id === requestId)) return refuse("receipt");
    const result = await startWhirlwind({ actor, record, valid, pay: async () => {
      if (!valid() || !await spendTurnBudget(actor, SPEC.action)) return { paid: false, consumed: false };
      if (!valid()) return { paid: true, consumed: false };
      const rows = structuredClone(actor.system.creatureAbilities); rows[index].automation.uses.value = 0;
      await actor.update({ "system.creatureAbilities": rows });
      consumed = actor.system.creatureAbilities[index]?.automation?.uses?.value === 0;
      return { paid: true, consumed };
    } });
    if (result.ok) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: "<p><strong>Whirlwind</strong></p><p>The creature winds up for a sweeping attack. Move beyond 5 feet or interrupt it before its next turn. Outside combat, the wind-up takes six seconds of world time.</p>",
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:syndicate-whirlwind",
        casting: false, success: true, targets: [], castId: requestId, phase: "channeling" } } });
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Whirlwind activation stopped", error); return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
