import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { inflictCondition } from "./inflict.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
import { runEnvelopingGale } from "./enveloping-gale-state.mjs";

export const GALE_QUERY = "azeroth-rpg.envelopingGale";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = t => JSON.stringify([t.x, t.y, t.elevation, t.width, t.height, t.rotation, t.disposition, t._source?.level]);

export async function requestEnvelopingGale(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID() };
    const result = gmHere() ? await envelopingGaleQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(GALE_QUERY, data, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled")
      ui.notifications?.warn("Enveloping Gale could not be completed. Ask the GM to review its saved results before trying again.");
    return result;
  } catch {
    ui.notifications?.warn("Enveloping Gale could not be confirmed. Ask the GM to review its saved results before trying again.");
    return null;
  }
}

export async function envelopingGaleQueryHandler({ actorUuid, index, source, requestId } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("gmOrRequest");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index)) return refuse("ability");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  if (!scene || origin?.actor !== actor || !scene.levels?.get(origin._source?.level)) return refuse("source");
  if (busy.has(actor.uuid)) return refuse("busy");
  const initial = [...scene.tokens.values()];
  const snapshots = new Map(initial.map(t => [t, { actor: t.actor, point: point(t) }]));
  const walls = () => JSON.stringify([...(scene.walls?.values?.() ?? [])].map(w => w._source));
  const wallStamp = walls();
  const clock = () => { const c = actor.activeFight?.(); return c?.started ? `${c.uuid}:${c.round}:${c.turn}`
    : Number.isFinite(game.time?.worldTime) ? game.time.worldTime : null; };
  const started = clock(), mana = actor.system?.power?.value;
  let consumed = false, targets = [], selection;
  const validate = () => {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")
      || started == null || clock() !== started || walls() !== wallStamp || game.scenes.get(scene.id) !== scene) return false;
    const rows = actor.system?.creatureAbilities ?? [], row = rows[index], a = row?.automation;
    if (rows.filter(r => r.name === "Enveloping Gale").length !== 1 || row?.name !== "Enveloping Gale"
      || a?.kind !== "utility" || a.action !== "action" || a.dc !== 17
      || a.cost?.pool !== "power" || a.cost.amount !== 3 || a.uses?.max !== 1 || a.uses.per !== "short"
      || a.uses.value !== (consumed ? 0 : 1)) return false;
    if (!Number.isFinite(mana) || mana < 3 || (actor.system.power.name ?? "mana") !== "mana"
      || actor.system.power.value !== mana - (consumed ? 3 : 0)) return false;
    if (!(actor.system?.health?.value > 0) || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")
      || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return false;
    if (scene.tokens.size !== initial.length || !scene.levels.get(origin._source?.level)
      || !initial.every(t => scene.tokens.get(t.id) === t && t.actor === snapshots.get(t).actor && point(t) === snapshots.get(t).point)) return false;
    return targets.every(t => t !== origin && t.actor !== actor && t.actor?.uuid !== actor.uuid
      && t._source?.level === origin._source?.level && fromUuidSync(t.actor?.uuid) === t.actor
      && t.actor.system?.health?.value > 0 && !realmRefusalFor(t.actor, "ability") && !projectionRefusal(t.actor, "ability")
      && Number.isFinite(feetApart(origin, t)) && feetApart(origin, t) >= 0 && feetApart(origin, t) <= 10);
  };
  busy.add(actor.uuid);
  try {
    if (!validate()) return refuse("changed");
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken: origin, name: "Enveloping Gale", radius: 10,
      validOrigin: validate, includeToken: t => t._source?.level === origin._source?.level,
      payment: "Spend one Action, 3 Mana and one Short Rest use.",
      chooseOption: (menu, options, note, settings) => chooseOption(menu, options.map(option => option.key === "enemy"
        ? { ...option, description: "This living enemy has a clear path to the gale, with no solid cover blocking it." }
        : option.key === "other" ? { ...option, name: "Unaffected creature", description: "An ally, neutral creature, dead creature or enemy behind solid cover." }
          : option), note, settings) });
    if (!selection.ok) return refuse(selection.reason);
    targets = selection.targets.map(row => row.token);
    if (!targets.length || !validate() || !selection.valid()) return refuse("target");
    const byUuid = new Map(targets.map(t => [t.uuid, t]));
    const result = await runEnvelopingGale({ actor, requestId, targets: [...byUuid.keys()], validate,
      pay: async () => {
        if (!validate() || !selection.valid()) return false;
        if (!await spendTurnBudget(actor, "action")) return false;
        if (!validate() || !selection.valid()) return undefined;
        const rows = foundry.utils.deepClone(actor.system.creatureAbilities); rows[index].automation.uses.value = 0;
        await actor.update({ "system.power.value": mana - 3, "system.creatureAbilities": rows });
        consumed = actor.system.power.value === mana - 3 && actor.system.creatureAbilities[index]?.automation?.uses?.value === 0;
        return consumed && validate() ? true : undefined;
      },
      resist: async uuid => {
        const token = byUuid.get(uuid); if (!token || !validate()) return null;
        const card = await rollResilience({ actor: token.actor, resilience: "reflex", dc: 17, subtitle: "Enveloping Gale" });
        return { passed: card?.rolls?.[0]?.outcome?.success, cardUuid: card?.uuid };
      },
      apply: async (uuid, claim) => {
        const token = byUuid.get(uuid); if (!token || !claim.valid()) return null;
        const landed = await inflictCondition({ victim: token.actor, by: actor, id: "stunned", name: token.name,
          until: untilEndOfNextTurnOrRound(token.actor) });
        if (landed?.reason === "immune") return { ok: true, immune: true };
        const effect = [...(token.actor.effects ?? [])].find(e => !e.disabled && !e.isSuppressed && e.statuses?.has("stunned"));
        return landed?.landed === true && effect?.id ? { ok: true, effectId: effect.id } : null;
      } });
    if (result.ok) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p><strong>Enveloping Gale</strong></p><p>Each enemy's resistance and any resulting stun are recorded separately.</p>",
        flags: { "azeroth-rpg": { kind: "ability",
          source: source ?? null,
          featureKey: "ability:enveloping-gale",
          casting: false, success: true, targets: targets.filter(t => result.results.some(r => r.targetUuid === t.uuid && r.applied))
            .map(t => ({ sceneId: scene.id, tokenId: t.id })), envelopingGale: { requestId, results: result.results } } } });
      } catch (error) { console.warn("azeroth-rpg | Enveloping Gale resolved; feedback unavailable", error); }
    }
    return result;
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
