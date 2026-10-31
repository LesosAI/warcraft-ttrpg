import { DEATH_SINGER_SCREECH as SPEC } from "../rules/banshee-roles.mjs";
import { projectionRefusal, projectionPhaseFor } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { applyDeathSingerFear } from "./death-singer-fear.mjs";

export const DEATH_SINGER_SCREECH_QUERY = "azeroth-rpg.deathSingerScreech";
const busy = new Set();
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestDeathSingerScreech(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor) };
    const result = writer() ? await deathSingerScreechQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(DEATH_SINGER_SCREECH_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn("Death Singer Screech was not completed. Check its report before trying again.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Death Singer Screech request", error);
    ui.notifications?.warn("Death Singer Screech was not completed. Check its report before trying again.");
    return null;
  }
}

export async function deathSingerScreechQueryHandler({ actorUuid, index, source } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false, selection = null;
  const results = [], keys = [];
  const cast = foundry.utils.randomID();
  const refuse = reason => ({ ok: false, reason, paid, results });
  if (!writer() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (busy.has(actor.uuid)) return refuse("busy");
  keys.push(actor.uuid); busy.add(actor.uuid);
  const scene = game.scenes?.get(source?.sceneId), token = scene?.tokens.get(source?.tokenId);
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock(), mana = actor.system.power?.value;
  const validate = () => {
    if (!writer() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")) return "owner";
    if (!scene || game.scenes.get(scene.id) !== scene || scene.tokens.get(token?.id) !== token || token?.actor !== actor) return "source";
    if (started === null || clock() !== started) return "clock";
    const row = actor.system.creatureAbilities?.[index];
    if (!Number.isInteger(index) || row?.name !== SPEC.name || row.automation?.kind !== "utility"
      || row.automation.action !== SPEC.action || row.automation.dc !== SPEC.dc
      || row.automation.cost?.pool !== "power" || row.automation.cost.amount !== SPEC.mana
      || row.automation.uses?.max !== SPEC.uses || row.automation.uses.per !== SPEC.per
      || row.automation.uses.value !== (consumed ? 0 : 1)) return "ability";
    if (!(actor.system.health?.value > 0) || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")
      || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability") || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return "source";
    if (!Number.isFinite(mana) || mana < SPEC.mana || (actor.system.power.name ?? "mana") !== "mana"
      || actor.system.power.value !== mana - (consumed ? SPEC.mana : 0)) return "mana";
    if (selection && !selection.valid()) return "area";
    return null;
  };
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken: token, chooseOption, name: SPEC.name, radius: SPEC.radius,
      payment: "Spend a Half-Action, 2 Mana and your use for this Short Rest. Each enemy makes a Spirit Resilience Test at DC 17." });
    if (!selection.ok) return refuse(selection.reason);
    if (selection.targets.some(t => busy.has(t.actorUuid))) return refuse("busy");
    for (const target of selection.targets) { keys.push(target.actorUuid); busy.add(target.actorUuid); }
    reason = validate(); if (reason) return refuse(reason);
    if (!await spendTurnBudget(actor, SPEC.action)) return refuse("action");
    paid = true;
    reason = validate(); if (reason) return refuse(reason);
    const abilities = foundry.utils.deepClone(actor.system.creatureAbilities);
    abilities[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": abilities, "system.power.value": mana - SPEC.mana });
    consumed = true;
    for (const target of selection.targets) {
      reason = validate(); if (reason) return refuse(reason);
      const victim = target.actor;
      const result = { actorUuid: victim.uuid, name: target.token.name, attempted: false, applied: false };
      results.push(result);
      if (projectionPhaseFor(victim) || realmRefusalFor(victim, "ability")) { result.protected = true; continue; }
      const card = await rollResilience({ actor: victim, resilience: SPEC.resilience, dc: SPEC.dc, subtitle: SPEC.name });
      result.test = card?.id ?? null; result.resisted = card?.rolls?.[0]?.outcome?.success;
      if (typeof result.resisted !== "boolean") return refuse("unresolved");
      reason = validate(); if (reason) return refuse(reason);
      if (projectionPhaseFor(victim) || realmRefusalFor(victim, "ability")) { result.protected = true; continue; }
      if (!result.resisted) {
        result.attempted = true;
        const landed = await applyDeathSingerFear({ victim, by: actor, cast });
        result.applied = landed?.landed === true; result.immune = landed?.reason === "immune";
        if (!result.applied && !result.immune) return refuse("condition");
      }
    }
    const report = results.map(r => `${r.name}: ${r.protected ? "protected" : r.immune ? "immune" : r.resisted ? "resisted" : "Frightened until the end of its next turn"}.`).join(" ");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>Death Singer Screech</strong></p><p>${foundry.utils.escapeHTML(report)}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:death-singer-screech",
        casting: false, success: true, deathSingerScreech: results,
        targets: selection.targets.map(t => ({ sceneId: scene.id, tokenId: t.token.id, actorUuid: t.actorUuid, name: t.token.name })) } } });
    finished = true;
    return { ok: true, paid, results };
  } catch (error) { console.warn("azeroth-rpg | Death Singer Screech", error); return refuse("writeUncertain"); }
  finally {
    keys.forEach(key => busy.delete(key));
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p>Death Singer Screech stopped after payment. Review the recorded Tests, conditions, Mana and use counter before resolving anything manually. Do not repeat completed effects.</p>",
        flags: { "azeroth-rpg": { kind: "deathSingerScreechReport", deathSingerScreech: results, useConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Death Singer Screech partial report", error); }
    }
  }
}
