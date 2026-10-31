/** Reviewed NPC bursts: one area review and payment for all enemies. */
import { FLAMEWAKER_ABILITIES } from "../rules/flamewaker.mjs";
import { activeSentinelPowers } from "./anubisath-pack.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { layFlamewakerSunder } from "./flamewaker-sunder.mjs";
import { inflictCondition } from "./inflict.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
import { strikeFromArea } from "./area-strikes.mjs";

export const FLAMEWAKER_QUERY = "azeroth-rpg.flamewaker";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const cueKeys = { "Sentinel Shadow Storm": "ability:sentinel-shadow-storm", "Sentinel Thunderclap": "ability:sentinel-thunderclap", "Qiraji Mind Blast": "ability:qiraji-mind-blast", "Sunder Armor": "ability:sunder-armor", "Fist of Ragnaros": "ability:fist-of-ragnaros", "Shadow Shock": "ability:shadow-shock" };

export async function requestFlamewakerAbility(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor) };
    const result = gmHere() ? await flamewakerQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(FLAMEWAKER_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "This ability stopped after payment. Check the recorded results before continuing."
      : "This ability cannot be used now. Check its action, Mana, remaining uses and nearby enemies.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Flamewaker request", error);
    ui.notifications?.warn("The result could not be confirmed. Check the creature and targets before trying again.");
    return null;
  }
}

export async function flamewakerQueryHandler({ actorUuid, index, source } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false, selection = null;
  const results = [], keys = [];
  const refuse = reason => ({ ok: false, reason, paid, results });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  const spec = Number.isInteger(index) ? FLAMEWAKER_ABILITIES[actor.system?.creatureAbilities?.[index]?.name] : null;
  if (!spec) return refuse("ability");
  if (busy.has(actor.uuid)) return refuse("busy");
  keys.push(actor.uuid); busy.add(actor.uuid);
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock(), mana = actor.system?.power?.value;
  const validate = () => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER") || fromUuidSync(actor.uuid) !== actor) return "owner";
    if (started === null || clock() !== started) return "clock";
    if (!scene || game.scenes.get(scene.id) !== scene || scene.tokens.get(origin?.id) !== origin || origin?.actor !== actor) return "source";
    if (!(actor.system?.health?.value > 0) || realmRefusalFor(actor, "ability") || sleepRefusal(actor, "ability")
      || despairRefusal(actor, "ability") || actor.statuses?.has("stunned")
      || (spec.kind === "damage" && actor.statuses?.has("silenced"))) return "sourceOrRealm";
    const row = actor.system?.creatureAbilities?.[index], auto = row?.automation;
    if (row?.name !== spec.name || auto?.kind !== "utility" || auto.action !== spec.action || auto.dc !== spec.dc) return "ability";
    if (spec.sentinelPower && !activeSentinelPowers(actor).includes(spec.sentinelPower)) return "power";
    if (spec.power && (auto.cost?.pool !== "power" || auto.cost.amount !== spec.power)) return "ability";
    if (spec.uses && (auto.uses?.max !== spec.uses || auto.uses.per !== spec.per || auto.uses.value !== (consumed ? 0 : 1))) return "uses";
    if (spec.power && ((actor.system?.power?.name ?? "mana") !== "mana" || !Number.isFinite(mana) || mana < spec.power
      || actor.system.power.value !== mana - (consumed ? spec.power : 0))) return "mana";
    if (selection && (!selection.valid() || selection.targets.some(t => fromUuidSync(t.actorUuid) !== t.actor || realmRefusalFor(t.actor, "ability")))) return "changedArea";
    return null;
  };
  const report = () => results.map(row => `${row.name}: ${row.lines?.join(" ") ?? (row.immune ? "immune" : row.applied ? "effect applied"
    : row.resisted ? "resisted" : row.skipped ? "already at 0 Health" : row.attempted ? "effect not confirmed" : "not resolved")}.`).join(" ");
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken: origin, chooseOption, name: spec.name, radius: spec.radius,
      ...(spec.innerRadius !== undefined ? { innerRadius: spec.innerRadius,
        areaLabel: `more than ${spec.innerRadius} feet away and within ${spec.radius} feet` } : {}),
      payment: `Spend one Action${spec.power ? ` and ${spec.power} Mana` : ""}${spec.uses ? "; this use returns after a Short Rest" : ""}.` });
    if (!selection.ok) return refuse(selection.reason);
    if (selection.targets.some(t => busy.has(t.actorUuid))) return refuse("busy");
    for (const target of selection.targets) { keys.push(target.actorUuid); busy.add(target.actorUuid); }
    reason = validate(); if (reason) return refuse(reason);
    if (!await spendTurnBudget(actor, spec.action)) return refuse("action");
    paid = true;
    reason = validate(); if (reason) return refuse(reason);
    const update = {};
    if (spec.power) update["system.power.value"] = mana - spec.power;
    if (spec.uses) {
      const abilities = foundry.utils.deepClone(actor.system.creatureAbilities);
      abilities[index].automation.uses.value = 0;
      update["system.creatureAbilities"] = abilities;
    }
    if (Object.keys(update).length) await actor.update(update);
    consumed = true;
    for (const target of selection.targets) {
      reason = validate(); if (reason) return refuse(reason);
      const victim = target.actor;
      const row = { actorUuid: victim.uuid, name: target.token.name, attempted: false, applied: false };
      results.push(row);
      if (!(victim.system?.health?.value > 0)) { row.skipped = true; continue; }
      const card = await rollResilience({ actor: victim, resilience: spec.resilience, dc: spec.dc, subtitle: spec.name });
      row.test = card?.id ?? null; row.resisted = card?.rolls?.[0]?.outcome?.success;
      if (typeof row.resisted !== "boolean") return refuse("unresolved");
      reason = validate(); if (reason) return refuse(reason);
      if (!(victim.system?.health?.value > 0)) return refuse("targetChanged");
      if (spec.kind === "damage") {
        row.attempted = true;
        row.lines = await strikeFromArea({ actor: victim, caster: actor, spell: { name: spec.name, school: spec.school, feature: true,
          ...(spec.sentinelPower ? { isSpell: false, takesSpellpower: false } : {}) },
          damage: { rating: row.resisted ? Math.floor(spec.damage / 2) : spec.damage, school: spec.school } });
        row.applied = Array.isArray(row.lines) && row.lines.length > 0;
        if (!row.applied) return refuse("damageUncertain");
      } else if (!row.resisted) {
        row.attempted = true;
        if (spec.kind === "sunder") {
          const landed = await layFlamewakerSunder({ victim, by: actor, valid: () => validate() === null });
          row.effectId = landed?.effectId ?? null; row.stacks = landed?.stacks ?? null;
          row.applied = landed?.ok === true;
        } else {
          const landed = await inflictCondition({ victim, by: actor, id: "stunned", name: target.token.name, until: untilEndOfNextTurnOrRound(victim) });
          row.immune = landed?.reason === "immune"; row.applied = landed?.landed === true;
        }
        if (!row.applied && !row.immune) return refuse("effectUncertain");
      }
      reason = validate(); if (reason) return refuse(reason);
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>${spec.name}</strong></p><p>${foundry.utils.escapeHTML(report())}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: cueKeys[spec.name],
        casting: false, success: true, flamewaker: results,
        targets: selection.targets.filter(t => results.some(row => row.actorUuid === t.actorUuid && row.applied))
          .map(t => ({ sceneId: scene.id, tokenId: t.token.id, actorUuid: t.actorUuid, name: t.token.name })) } } });
    finished = true;
    return { ok: true, paid, results };
  } catch (error) { console.warn("azeroth-rpg | Flamewaker ability", error); return refuse("writeUncertain"); }
  finally {
    keys.forEach(key => busy.delete(key));
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p>${spec.name} stopped after payment. Check Mana, uses and the recorded results before continuing.</p><p>${foundry.utils.escapeHTML(report())}</p>`,
        flags: { "azeroth-rpg": { kind: "flamewakerReport", flamewaker: results, resourcesConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Flamewaker partial report", error); }
    }
  }
}
