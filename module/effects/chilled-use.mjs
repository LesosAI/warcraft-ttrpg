import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { runChilled } from "./chilled-state.mjs";
import { chilledTargetAdapters } from "./chilled-targets.mjs";

export const CHILLED_QUERY = "azeroth-rpg.chilled";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = t => JSON.stringify([t.x, t.y, t.elevation, t.width, t.height, t.rotation, t.disposition, t._source?.level]);

export async function requestChilled(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID() };
    const result = gmHere() ? await chilledQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(CHILLED_QUERY, data, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled")
      ui.notifications?.warn("Chilled could not be completed. Ask the GM to review its saved result before trying again.");
    return result;
  } catch {
    ui.notifications?.warn("Chilled could not be confirmed. Ask the GM to review its saved result before trying again.");
    return null;
  }
}

/** One GM-confirmed enemy in reach; the caller cannot supply the victim or roll. */
export async function chilledQueryHandler({ actorUuid, index, source, requestId } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("gmOrRequest");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || actor.system?.creatureAbilities?.[index]?.name !== "Chilled") return refuse("ability");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  if (!scene || origin?.actor !== actor || !scene.levels?.get(origin._source?.level)) return refuse("source");
  if (busy.has(actor.uuid)) return refuse("busy");
  const initial = [...scene.tokens.values()];
  const snapshots = new Map(initial.map(t => [t, { actor: t.actor, point: point(t) }]));
  const walls = () => JSON.stringify([...(scene.walls?.values?.() ?? [])].map(w => w._source));
  const wallStamp = walls();
  const clock = () => { const c = actor.activeFight?.(); return c?.started ? `${c.uuid}:${c.round}:${c.turn}` : game.time?.worldTime; };
  const started = clock();
  let target = null;
  const validate = () => {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")
      || started == null || clock() !== started || walls() !== wallStamp || game.scenes.get(scene.id) !== scene) return false;
    const rows = actor.system?.creatureAbilities ?? [], row = rows[index], automation = row?.automation;
    if (rows.filter(r => r.name === "Chilled").length !== 1 || row?.name !== "Chilled"
      || automation?.kind !== "utility" || automation.action !== "action" || automation.cost?.amount || automation.uses?.max > 0) return false;
    if (!(actor.system?.health?.value > 0) || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")
      || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return false;
    if (scene.tokens.size !== initial.length || !scene.levels.get(origin._source?.level)
      || !initial.every(t => scene.tokens.get(t.id) === t && t.actor === snapshots.get(t).actor && point(t) === snapshots.get(t).point)) return false;
    return !target || (target._source?.level === origin._source?.level && fromUuidSync(target.actor.uuid) === target.actor
      && target.actor.system?.health?.value > 0 && !realmRefusalFor(target.actor, "ability")
      && !projectionRefusal(target.actor, "ability") && Number.isFinite(feetApart(origin, target)) && feetApart(origin, target) <= 5);
  };
  busy.add(actor.uuid);
  try {
    if (!validate()) return refuse("changed");
    const { chooseOption, spendTurnBudget } = await import("../dice/workflows.mjs");
    const candidates = initial.filter(t => t.actor && t.actor !== actor && t.actor.system?.health?.value > 0
      && t._source?.level === origin._source?.level && Number.isFinite(feetApart(origin, t)) && feetApart(origin, t) <= 5);
    if (!candidates.length) return refuse("target");
    const answer = await chooseOption({ id: actor.id, name: "Chilled" }, candidates.map(t => ({ key: t.id, name: t.name,
      description: "Target this enemy with Chilled." })), null,
    { prompt: "GM: Choose one enemy within 5 feet with a clear path. This spends one Action." });
    if (!answer) return refuse("cancelled");
    target = candidates.find(t => t.id === answer.key);
    if (!target || !validate()) return refuse("target");
    const adapters = chilledTargetAdapters({ actor, source: origin, target, valid: validate });
    if (!adapters) return refuse("target");
    const result = await runChilled({ actor, requestId, targetUuid: target.uuid, validate, ...adapters,
      pay: async () => validate() ? await spendTurnBudget(actor, "action") : false });
    if (result.ok) {
      try {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><strong>Chilled</strong></p><p>${result.passed ? "The target resisted Chilled." : "The target is affected by Chilled."}</p>`,
          flags: { "azeroth-rpg": { kind: "ability",
            source: source ?? null,
            casting: false, success: true,
            featureKey: "ability:chilled", targets: result.applied ? [{ sceneId: scene.id, tokenId: target.id }] : [],
            chilled: { requestId, result } } } });
      } catch (error) { console.warn("azeroth-rpg | Chilled resolved; feedback unavailable", error); }
    }
    return result;
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
