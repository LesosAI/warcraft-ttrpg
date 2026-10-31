import { runDemonTaunt } from "./demon-taunt-state.mjs";
import { endLesserInvisibility } from "./lesser-invisibility.mjs";
import { DEMON_TORMENT_GROUP } from "../rules/banes.mjs";
import { layBane, endBane } from "./banes.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";

export const DEMON_TAUNT_QUERY = "azeroth-rpg.demonTaunt";
export const DEMON_TORMENT_TURN = "demonTormentTurn";
export const DEMON_TAUNTS = Object.freeze({
  Torment: Object.freeze({ action: "half", range: 30, one: true }),
  Suffering: Object.freeze({ action: "action", range: 10, one: false }),
  "Soothing Kiss": Object.freeze({ action: "half", range: 30, one: true, mana: 1, dc: 15 })
});
const busy = new Set();
const ANIMATION_KEYS = Object.freeze({ Torment: "ability:torment", Suffering: "ability:suffering", "Soothing Kiss": "ability:soothing-kiss" });
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = t => JSON.stringify([t.x, t.y, t.elevation, t.width, t.height, t.rotation, t.disposition, t._source?.level]);
const warning = "This demon ability could not be confirmed. Review its recorded payment and effects before trying again.";

export async function requestDemonTaunt(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const payload = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID() };
    const result = gmHere() ? await demonTauntQueryHandler(payload, { user: game.user })
      : await game.users?.activeGM?.query(DEMON_TAUNT_QUERY, payload, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(warning);
    return result;
  } catch { ui.notifications?.warn(warning); return null; }
}

export async function demonTauntQueryHandler({ actorUuid, index, source, requestId } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("gmOrRequest");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index)) return refuse("ability");
  const name = actor.system?.creatureAbilities?.[index]?.name;
  const spec = Object.hasOwn(DEMON_TAUNTS, name ?? "") ? DEMON_TAUNTS[name] : null;
  if (!spec) return refuse("ability");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  if (!scene || origin?.actor !== actor || !scene.levels?.get(origin._source?.level)) return refuse("source");
  if (busy.has(actor.uuid)) return refuse("busy");
  const initial = [...scene.tokens.values()];
  const snapshots = new Map(initial.map(t => [t, { actor: t.actor, point: point(t) }]));
  const walls = () => JSON.stringify([...(scene.walls?.values?.() ?? [])].map(w => w._source));
  const wallStamp = walls();
  const clock = () => { const c = actor.activeFight?.(); return c?.started ? `${c.uuid}:${c.round}:${c.turn}` : game.time?.worldTime; };
  const started = clock(), mana = actor.system?.power?.value;
  const kiss = name === "Soothing Kiss", torment = name === "Torment";
  let consumed = false, targets = [], selection;
  const validate = () => {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")
      || started == null || clock() !== started || walls() !== wallStamp || game.scenes.get(scene.id) !== scene) return false;
    const rows = actor.system?.creatureAbilities ?? [], a = rows[index]?.automation;
    if (rows.filter(r => r.name === name).length !== 1 || rows[index]?.name !== name || a?.kind !== "utility"
      || a.action !== spec.action) return false;
    if (kiss ? a.cost?.pool !== "power" || a.cost.amount !== 1 || a.dc !== 15 : a.cost?.amount > 0) return false;
    if (kiss && (!Number.isFinite(mana) || mana < 1 || (actor.system.power.name ?? "mana") !== "mana"
      || actor.system.power.value !== mana - (consumed ? 1 : 0) || actor.statuses?.has("silenced"))) return false;
    if (!torment && (a.uses?.max !== 1 || a.uses.per !== "short" || a.uses.value !== (consumed ? 0 : 1))) return false;
    if (torment) {
      if (a.uses?.max > 0) return false;
      const mark = actor.getFlag("azeroth-rpg", DEMON_TORMENT_TURN);
      if (consumed ? mark !== started : mark === started) return false;
    }
    if (!(actor.system?.health?.value > 0) || actor.statuses?.has("stunned")
      || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return false;
    if (!scene.levels?.get(origin._source?.level) || scene.tokens.size !== initial.length || !initial.every(t => scene.tokens.get(t.id) === t
      && t.actor === snapshots.get(t).actor && point(t) === snapshots.get(t).point)) return false;
    return targets.every(t => t !== origin && t.actor !== actor && t.actor?.uuid !== actor.uuid
      && t._source?.level === origin._source?.level && fromUuidSync(t.actor?.uuid) === t.actor
      && t.actor.system?.health?.value > 0 && !realmRefusalFor(t.actor, "ability") && !projectionRefusal(t.actor, "ability")
      && Number.isFinite(feetApart(origin, t)) && feetApart(origin, t) >= 0 && feetApart(origin, t) <= spec.range);
  };
  busy.add(actor.uuid);
  try {
    if (!validate()) return refuse("changed");
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken: origin, name, radius: spec.range,
      validOrigin: validate, includeToken: t => t._source?.level === origin._source?.level && t.actor?.system?.health?.value > 0,
      payment: kiss ? "Spend one Half-Action, 1 Mana and one Short Rest use." : spec.one ? "Spend one Half-Action." : "Spend one Action and one Short Rest use.",
      chooseOption: (menu, options, note, settings) => chooseOption(menu, options.map(option => option.key === "enemy"
        ? { ...option, description: kiss ? "An enemy with a clear path to the succubus." : "An enemy that can see the voidwalker and has a clear path to it. Confirm vision, including invisibility and blindness." }
        : option.key === "other" ? { ...option, name: "Unaffected", description: kiss ? "An ally or a creature behind an obstacle." : "An ally, a creature that cannot see the voidwalker, or a creature behind an obstacle." }
          : option), note, settings) });
    if (!selection.ok) return refuse(selection.reason);
    targets = selection.targets.map(r => r.token);
    if (!targets.length || !validate() || !selection.valid()) return refuse("target");
    if (spec.one) {
      const picked = await chooseOption({ id: `${actor.id}-torment-target`, name }, targets.map(t => ({ key: t.id, name: t.name })), null, { prompt: kiss ? "Choose one enemy." : "Choose one enemy that can see the voidwalker." });
      if (!picked) return refuse("cancelled");
      const token = targets.find(t => t.id === picked.key);
      if (!token || !validate() || !selection.valid()) return refuse("target");
      targets = [token];
    }
    const byUuid = new Map(targets.map(t => [t.actor.uuid, t]));
    if (byUuid.size !== targets.length) return refuse("duplicateActor");
    const result = await runDemonTaunt({ actor, name, requestId, targets: [...byUuid.keys()], validate,
      pay: async () => {
        if (!validate() || !selection.valid()) return false;
        if (!await spendTurnBudget(actor, spec.action)) return false;
        if (!validate() || !selection.valid()) return undefined;
        if (torment) await actor.setFlag("azeroth-rpg", DEMON_TORMENT_TURN, started);
        else {
          const rows = foundry.utils.deepClone(actor.system.creatureAbilities); rows[index].automation.uses.value = 0;
          await actor.update({ "system.creatureAbilities": rows, ...(kiss ? { "system.power.value": mana - 1 } : {}) });
        }
        consumed = true;
        if (!validate()) return undefined;
        await endLesserInvisibility(actor, { event: "ability" });
        return validate() ? true : undefined;
      },
      resist: async (uuid, claim) => {
        const target = byUuid.get(uuid)?.actor;
        if (!kiss || !target || !claim.valid() || !selection.valid()) return null;
        const card = await rollResilience({ actor: target, resilience: "spirit", dc: 15, subtitle: name });
        return { passed: card?.rolls?.[0]?.outcome?.success, cardUuid: card?.uuid };
      },
      apply: async (uuid, claim) => {
        const target = byUuid.get(uuid)?.actor;
        if (!target || !claim.valid() || !selection.valid()) return null;
        const made = await layBane({ victim: target, kind: "attack", banes: 1, source: name, by: actor, lasting: true,
          ...(kiss ? { only: { actorId: actor.id, tokenId: origin.id } }
            : { except: { actorId: actor.id, tokenId: origin.id }, stackGroup: DEMON_TORMENT_GROUP }),
          span: untilEndOfNextTurnOrRound(kiss ? target : actor) });
        return made?.effectId ? { ok: true, effectId: made.effectId } : null;
      },
      clear: async (uuid, claim) => {
        if (!claim.valid()) return false;
        const target = fromUuidSync(uuid);
        if (!target) return true;
        await endBane({ victim: target, source: "Torment", by: actor });
        return ![...(target.effects ?? [])].some(e => e.origin === actor.uuid && e.flags?.["azeroth-rpg"]?.laidBane?.source === "Torment");
      } });
    if (result.ok) {
      try {
        const description = kiss
          ? result.results[0]?.passed === true ? "The target resisted Soothing Kiss. No Bane was applied."
            : "The target takes one Bane on attacks against the succubus until the end of its next turn. It still chooses its actions and movement."
          : "The affected enemies take one Bane on attacks that do not include the voidwalker. They still choose their actions and movement.";
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><strong>${foundry.utils.escapeHTML(name)}</strong></p><p>${description}</p>`,
          flags: { "azeroth-rpg": { kind: "ability",
            source: source ?? null,
            featureKey: ANIMATION_KEYS[name],
            casting: false, success: true,
            targets: targets.map(t => ({ sceneId: scene.id, tokenId: t.id })), demonTaunt: { requestId, results: result.results } } } });
      } catch (error) { console.warn("azeroth-rpg | Demon taunt feedback unavailable", error); }
    }
    return result;
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
