import { DEMORALIZING_ROAR as SPEC } from "../rules/demoralizing-roar.mjs";
import { applyDemoralizingRoar } from "./demoralizing-roar.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
export const DEMORALIZING_ROAR_QUERY = "azeroth-rpg.demoralizingRoar";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestDemoralizingRoar(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor) };
    const result = gmHere() ? await demoralizingRoarQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(DEMORALIZING_ROAR_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid !== false
      ? "Demoralizing Roar was interrupted. Review the Half-Action, remaining use and individual results before continuing."
      : "Demoralizing Roar could not be used. Check its source token, available use and reviewed area.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Demoralizing Roar request", error);
    ui.notifications?.warn("Demoralizing Roar's response was interrupted. Check its payment and effects before trying again.");
    return null;
  }
}

export async function demoralizingRoarQueryHandler({ actorUuid, index, source } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false, selection = null;
  const results = [], refuse = reason => ({ ok: false, reason, paid, consumed, results });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const scene = game.scenes?.get(source?.sceneId), token = scene?.tokens.get(source?.tokenId);
  const time = game.time?.worldTime;
  const clock = () => { const c = actor.activeFight?.(); return c?.started ? [c.uuid, c.round, c.turn].join(":") : null; };
  const started = clock();
  const valid = () => {
    const row = actor.system?.creatureAbilities?.[index], a = row?.automation;
    return gmHere() && fromUuidSync(actor.uuid) === actor && actor.testUserPermission(user, "OWNER")
      && Number.isFinite(time) && game.time.worldTime === time && clock() === started
      && scene && game.scenes.get(scene.id) === scene && scene.tokens.get(token?.id) === token && token?.actor === actor
      && actor.system.health?.value > 0 && !actor.statuses?.has("stunned")
      && !realmRefusalFor(actor, "ability") && !projectionRefusal(actor, "ability")
      && !sleepRefusal(actor, "ability") && !despairRefusal(actor, "ability")
      && Number.isInteger(index) && row?.name === SPEC.name && a?.kind === "utility" && a.action === SPEC.action
      && !a.cost?.amount && a.uses?.max === 1 && a.uses.per === SPEC.per && a.uses.value === (consumed ? 0 : 1)
      && (!selection || (selection.valid() && selection.targets.every(t => fromUuidSync(t.actorUuid) === t.actor
        && t.actor.system?.health?.value > 0 && !realmRefusalFor(t.actor, "ability") && !projectionRefusal(t.actor, "ability"))));
  };
  const report = () => results.map(r => r.name + ": " + (r.resisted ? "resisted" : r.applied ? "weakened" : "unresolved")).join("; ");
  try {
    if (!valid()) return refuse("invalid");
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken: token, chooseOption, name: SPEC.name,
      radius: SPEC.radius, payment: "Spend one Half-Action and the Short Rest use." });
    if (!selection.ok) return refuse(selection.reason);
    if (!valid()) return refuse("changed");
    paid = null;
    if (!await spendTurnBudget(actor, SPEC.action)) { paid = false; return refuse("action"); }
    paid = true;
    if (!valid()) return refuse("changed");
    const rows = foundry.utils.deepClone(actor.system.creatureAbilities); rows[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": rows }); consumed = true;
    for (const target of selection.targets) {
      if (!valid()) return refuse("changed");
      const result = { actorUuid: target.actorUuid, name: target.token.name, applied: false }; results.push(result);
      const card = await rollResilience({ actor: target.actor, resilience: SPEC.resilience, dc: SPEC.dc, subtitle: SPEC.name });
      result.test = card?.id ?? null; result.resisted = card?.rolls?.[0]?.outcome?.success;
      if (!valid()) return refuse("changed");
      if (typeof result.resisted !== "boolean") return refuse("unresolved");
      if (!result.resisted) {
        const landed = await applyDemoralizingRoar({ source: actor, target: target.actor, valid });
        result.applied = landed.ok === true; result.effectId = landed.effectId ?? null;
        if (!landed.ok) return refuse("effect");
      }
    }
    if (!valid()) return refuse("changed");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: "<p><strong>Demoralizing Roar</strong></p><p>" + foundry.utils.escapeHTML(report()) + "</p>",
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:demoralizing-roar",
        casting: false, success: true, demoralizingRoar: results,
        targets: selection.targets.map(t => ({ sceneId: scene.id, tokenId: t.token.id, actorUuid: t.actorUuid })) } } });
    finished = true; return { ok: true, paid, consumed, results };
  } catch (error) {
    console.warn("azeroth-rpg | Demoralizing Roar", error); return refuse("writeUncertain");
  } finally {
    busy.delete(actor.uuid);
    if (paid !== false && !finished) {
      try {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: "<p>Demoralizing Roar was interrupted. Review payment and the recorded results; do not repeat resolved Tests.</p><p>" + foundry.utils.escapeHTML(report()) + "</p>",
          flags: { "azeroth-rpg": { kind: "demoralizingRoarReport", paid, consumed, results } } });
      } catch (error) { console.warn("azeroth-rpg | Demoralizing Roar partial report", error); }
    }
  }
}
