import { CONSUME_RECOVERIES, startConsumeShadows, advanceConsumeShadows } from "./consume-shadows-state.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";

export const CONSUME_QUERY = "azeroth-rpg.consumeShadows";
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const fighting = actor => values(game.combats).some(combat => combat.started
  && values(combat.combatants).some(row => row.actor === actor || row.actor?.uuid === actor.uuid));
const locationOf = token => token ? { sceneUuid: token.parent?.uuid, tokenUuid: token.uuid,
  level: token._source?.level, x: token.x, y: token.y, elevation: token.elevation } : null;
const unavailable = actor => !(actor.system?.health?.value > 0) || actor.statuses?.has("stunned")
  || actor.statuses?.has("silenced") || realmRefusalFor(actor, "ability")
  || projectionRefusal(actor, "ability") || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability");
const snapshotOf = (actor, token) => ({ now: game.time?.worldTime, location: locationOf(token),
  hp: { value: actor.system?.health?.value, max: actor.system?.health?.max }, inCombat: fighting(actor) });

export function hasConsumeRecovery(actor) {
  const rows = actor?.getFlag?.("azeroth-rpg", CONSUME_RECOVERIES);
  return Array.isArray(rows) && rows.some(r => ["recovering", "healing"].includes(r?.state));
}

export async function requestConsumeShadows(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const payload = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID() };
    const result = gmHere() ? await consumeShadowsQueryHandler(payload, { user: game.user })
      : await game.users?.activeGM?.query(CONSUME_QUERY, payload, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn("Consume Shadows could not begin. Check the remaining use, recovery record and combat state.");
    return result;
  } catch { ui.notifications?.warn("Consume Shadows could not be confirmed. Check its recovery record before trying again."); return null; }
}

export async function consumeShadowsQueryHandler({ actorUuid, index, source, requestId, operation, event } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("request");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (operation === "interrupt") {
    if (event?.kind !== "action" && !(event?.kind === "damage" && Number.isFinite(event.amount) && event.amount > 0)) return refuse("event");
    return advanceConsumeRecovery(actor, event.kind === "action" ? { kind: "action" } : { kind: "damage", amount: event.amount });
  }
  if (operation !== undefined) return refuse("operation");
  const scene = game.scenes?.get(source?.sceneId), token = scene?.tokens.get(source?.tokenId);
  if (!scene || token?.actor !== actor || !scene.levels?.get(token._source?.level)) return refuse("source");
  const position = JSON.stringify(locationOf(token)), level = token._source.level;
  const valid = () => gmHere() && fromUuidSync(actor.uuid) === actor && actor.testUserPermission(user, "OWNER")
    && game.scenes.get(scene.id) === scene && scene.tokens.get(token.id) === token && token.actor === actor
    && scene.levels.get(level) && token._source.level === level && JSON.stringify(locationOf(token)) === position
    && !fighting(actor) && !unavailable(actor) && Number.isInteger(index)
    && actor.system.creatureAbilities?.[index]?.name === "Consume Shadows"
    && actor.system.creatureAbilities[index].automation?.kind === "utility"
    && actor.system.creatureAbilities[index].automation.action === null
    && actor.system.creatureAbilities[index].automation.uses?.max === 1
    && actor.system.creatureAbilities[index].automation.uses.value === 1
    && actor.system.creatureAbilities[index].automation.uses.per === "short";
  if (!valid()) return refuse("changed");
  const { chooseOption } = await import("../dice/workflows.mjs");
  const choice = await chooseOption({ id: `${actor.id}-consume-shadows`, name: "Consume Shadows" },
    [{ key: "begin", name: "Begin recovery" }], null,
    { prompt: "Spend one use and remain still for 1 minute to recover 3 Health. Moving, taking damage, acting or entering combat interrupts recovery." });
  if (!choice) return refuse("cancelled");
  if (choice.key !== "begin" || !valid()) return refuse("changed");
  const result = await startConsumeShadows({ actor, index, requestId, snapshot: () => snapshotOf(actor, token), validate: () => Boolean(valid()) });
  if (result.ok) {
    try {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p><strong>Consume Shadows</strong></p><p>Recovery begins. One use spent. Remain still for 1 minute; moving, taking damage, acting or entering combat interrupts recovery.</p>",
        flags: { "azeroth-rpg": { kind: "ability",
          source: source ?? null,
          featureKey: "ability:consume-shadows",
          casting: false, success: true, consumeShadows: result, targets: [] } } });
    } catch (error) { console.warn("azeroth-rpg | Consume Shadows feedback unavailable", error); }
  }
  return result;
}

/** Wait for the active GM to record an interruption before resolving an action.
 * Damage callers report a confirmed positive amount, including temporary Health.
 */
export async function interruptConsumeFor(actor, kind = "action", amount = 0) {
  if (!hasConsumeRecovery(actor)) return true;
  const event = kind === "damage" ? { kind, amount } : { kind: "action" };
  try {
    const payload = { actorUuid: actor.uuid, operation: "interrupt", event, requestId: foundry.utils.randomID() };
    const result = gmHere() ? await consumeShadowsQueryHandler(payload, { user: game.user })
      : await game.users?.activeGM?.query(CONSUME_QUERY, payload, { timeout: 300000 });
    if (result?.ok) return true;
  } catch (error) { console.warn("azeroth-rpg | Consume Shadows interruption unavailable", error); }
  ui.notifications?.warn("Consume Shadows interruption could not be confirmed. Review the recovery before continuing.");
  return false;
}

/** Called by lifecycle observers with an event captured at delivery time. */
export async function advanceConsumeRecovery(actor, event) {
  if (!gmHere() || !hasConsumeRecovery(actor)) return { ok: true, state: "idle" };
  const rows = actor.getFlag("azeroth-rpg", CONSUME_RECOVERIES);
  const record = rows.find(r => r.state === "recovering");
  const token = record?.location?.tokenUuid ? fromUuidSync(record.location.tokenUuid) : null;
  const snapshot = () => snapshotOf(actor, token?.actor === actor ? token : null);
  const observed = event ?? (fighting(actor) ? { kind: "combat" }
    : { kind: "position", location: token?.actor === actor ? locationOf(token) : null });
  const result = await advanceConsumeShadows({ actor, event: observed, snapshot });
  if (result.ok && ["complete", "interrupted"].includes(result.state)) {
    const text = result.state === "complete" ? `Recovery complete. Restored ${result.healed} Health.`
      : "Recovery was interrupted. The use remains spent.";
    try {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p><strong>Consume Shadows</strong></p><p>${text}</p>` });
    } catch (error) { console.warn("azeroth-rpg | Consume Shadows result feedback unavailable", error); }
  }
  return result;
}
