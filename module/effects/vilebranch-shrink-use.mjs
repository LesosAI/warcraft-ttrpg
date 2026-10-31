import { VILEBRANCH_SHRINK as SPEC } from "../rules/vilebranch-shrink.mjs";
import { projectionRefusal, projectionPhaseFor } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { layVilebranchShrink } from "./vilebranch-shrink.mjs";

export const VILEBRANCH_SHRINK_QUERY = "azeroth-rpg.vilebranchShrink";
const busy = new Set();
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestVilebranchShrink(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor) };
    const result = writer() ? await vilebranchShrinkQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(VILEBRANCH_SHRINK_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn("Vilebranch Shrink was not completed. Check its report before trying again.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Vilebranch Shrink request", error);
    ui.notifications?.warn("Vilebranch Shrink could not be confirmed. Check the caster's Mana and the target's effects before trying again.");
    return null;
  }
}

/** The GM chooses one concrete scene token and confirms the cost before payment.
 * Checks are repeated after each awaited choice, payment and resistance roll.
 */
export async function vilebranchShrinkQueryHandler({ actorUuid, index, source } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false, target = null;
  const result = {};
  const refuse = reason => ({ ok: false, reason, paid, consumed, result });
  if (!writer() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const scene = game.scenes?.get(source?.sceneId), token = scene?.tokens.get(source?.tokenId);
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const positionOf = t => JSON.stringify([t.x, t.y, t.elevation, t._source?.level]);
  const level = token?._source?.level, originPosition = token ? positionOf(token) : null;
  let targetPosition = null;
  const started = clock(), mana = actor.system.power?.value;
  const dc = actor.system.creatureAbilities?.[index]?.automation?.dc;
  const validate = () => {
    if (!writer() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")) return "owner";
    if (!scene || game.scenes.get(scene.id) !== scene || scene.tokens.get(token?.id) !== token || token?.actor !== actor) return "source";
    if (!scene.levels?.get(level) || token._source?.level !== level || positionOf(token) !== originPosition) return "position";
    if (started === null || clock() !== started) return "clock";
    const row = actor.system.creatureAbilities?.[index];
    if (!Number.isInteger(index) || row?.name !== SPEC.name || row.automation?.kind !== "utility"
      || row.automation.action !== SPEC.action || row.automation.dc !== dc || dc !== SPEC.dc
      || row.automation.cost?.pool !== "power" || row.automation.cost.amount !== SPEC.mana) return "ability";
    if (!(actor.system.health?.value > 0) || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")
      || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability") || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return "source";
    if (!Number.isFinite(mana) || mana < SPEC.mana || (actor.system.power.name ?? "mana") !== "mana"
      || actor.system.power.value !== mana - (consumed ? SPEC.mana : 0)) return "mana";
    if (target) {
      if (scene.tokens.get(target.id) !== target || target.actor !== result.victim || !(target.actor.system.health?.value > 0)) return "target";
      if (target._source?.level !== level || positionOf(target) !== targetPosition) return "position";
      const distance = feetApart(token, target);
      if (!Number.isFinite(distance) || distance < 0 || distance > SPEC.range) return "range";
      if (projectionPhaseFor(target.actor) || realmRefusalFor(target.actor, "ability")) return "protected";
    }
    return null;
  };
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    const candidates = [...scene.tokens.values()].filter(other => {
      if (other._source?.level !== level || !other.actor?.uuid || other.actor === actor || !(other.actor.system.health?.value > 0)) return false;
      const distance = feetApart(token, other);
      return Number.isFinite(distance) && distance >= 0 && distance <= SPEC.range;
    });
    if (!candidates.length) return refuse("empty");
    const menu = { id: `${actor.id}-vilebranch-shrink`, name: SPEC.name };
    const picked = await chooseOption(menu, candidates.map(other => ({ key: other.id, name: other.name,
      description: `Spirit Resilience DC ${dc}, or Strength and Constitution reduced by 2 for two minutes.` })), null, { prompt: "Choose a creature within 60 feet." });
    if (!picked) return refuse("cancelled");
    target = candidates.find(other => other.id === picked.key);
    if (!target) return refuse("target");
    result.victim = target.actor; targetPosition = positionOf(target);
    reason = validate(); if (reason) return refuse(reason);
    const confirm = await chooseOption(menu, [{ key: "cancel", name: "Cancel", description: "Keep your Action and Mana." },
      { key: "curse", name: `Curse ${target.name}`, description: "Spend an Action and 2 Mana." }], null, { prompt: "GM: Confirm the target is visible and has no solid cover, then cast Vilebranch Shrink." });
    if (confirm?.key !== "curse") return refuse("cancelled");
    reason = validate(); if (reason) return refuse(reason);
    if (!await spendTurnBudget(actor, SPEC.action)) return refuse("action");
    paid = true;
    reason = validate(); if (reason) return refuse(reason);
    await actor.update({ "system.power.value": mana - SPEC.mana }); consumed = true;
    reason = validate(); if (reason) return refuse(reason);
    const card = await rollResilience({ actor: target.actor, resilience: SPEC.resilience, dc, subtitle: SPEC.name });
    result.test = card?.id ?? null; result.resisted = card?.rolls?.[0]?.outcome?.success;
    if (typeof result.resisted !== "boolean") return refuse("unresolved");
    reason = validate(); if (reason) return refuse(reason);
    if (!result.resisted) {
      result.effect = await layVilebranchShrink({ victim: target.actor, by: actor, valid: () => validate() === null });
      if (!result.effect.ok) return refuse(result.effect.reason);
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: [game.user.id],
      content: `<p><strong>Vilebranch Shrink</strong></p><p>${foundry.utils.escapeHTML(target.name)} ${result.resisted ? "resisted the curse." : "takes Strength and Constitution reduced by 2 for two minutes. Neither score falls below 1. Mechanical size and reach are unchanged."}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:vilebranch-shrink",
        casting: false, success: true, vilebranchShrink: { test: result.test, resisted: result.resisted, effect: result.effect ?? null },
        targets: [{ sceneId: scene.id, tokenId: target.id, actorUuid: target.actor.uuid, name: target.name }] } } });
    finished = true;
    return { ok: true, paid, consumed, result: { test: result.test, resisted: result.resisted, effect: result.effect ?? null } };
  } catch (error) { console.warn("azeroth-rpg | Vilebranch Shrink", error); return refuse("writeUncertain"); }
  finally {
    delete result.victim;
    busy.delete(actor.uuid);
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: [game.user.id],
        content: "<p>Vilebranch Shrink stopped after payment. Check the Action, Mana, resistance Test and curse effect before resolving it manually. Do not repeat completed steps.</p>",
        flags: { "azeroth-rpg": { kind: "vilebranchShrinkReport", vilebranchShrink: { ...result }, manaConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Vilebranch Shrink report", error); }
    }
  }
}
