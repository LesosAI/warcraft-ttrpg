/** Full-pool Obsidian Purge. Review the area before spending its Action and Mana. */
import { OBSIDIAN_DESTROYER as SPEC, destroyerPurgePlan, destroyerPurgeEffect } from "../rules/obsidian-destroyer.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { inflictCondition } from "./inflict.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { plainEffect, archmageCasters } from "./dispel.mjs";
import { endDestroyerPurgeEffect } from "./obsidian-purge-effect.mjs";
import { castingDC } from "../rules/casting.mjs";
import { completeSpellLockGates } from "./spell-lock-gates.mjs";
import { initializeDestroyerEncounter, destroyerOperations } from "./obsidian-encounter.mjs";
export const DESTROYER_PURGE_QUERY = "azeroth-rpg.destroyerPurge";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestDestroyerPurge(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor) };
    const result = gmHere() ? await destroyerPurgeQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(DESTROYER_PURGE_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "Obsidian Purge stopped after payment. Check its recorded results before continuing."
      : "Obsidian Purge requires a full Mana pool, an available Action and enemies within 20 feet.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Obsidian Purge request", error);
    ui.notifications?.warn("Obsidian Purge could not be confirmed. Check the result before trying again.");
    return null;
  }
}

export async function destroyerPurgeQueryHandler({ actorUuid, index, source } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false, selection;
  const results = [], locks = [];
  const refuse = reason => ({ ok: false, reason, paid, consumed, results });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.type !== "npc" || actor.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || busy.has(actor.uuid)) return refuse("abilityOrBusy");
  const initialized = await initializeDestroyerEncounter(actor);
  if (!initialized.ok || destroyerOperations.has(actor.uuid)) return refuse("initializationOrBusy");
  destroyerOperations.add(actor.uuid);
  busy.add(actor.uuid); locks.push(actor.uuid);
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock();
  const valid = () => {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER") || started === null || clock() !== started) return false;
    if (!scene || game.scenes.get(scene.id) !== scene || scene.tokens.get(origin?.id) !== origin || origin?.actor !== actor) return false;
    const row = actor.system?.creatureAbilities?.[index];
    if (row?.name !== "Obsidian Purge" || row.automation?.kind !== "utility" || row.automation.action !== "action" || row.automation.dc !== SPEC.dc) return false;
    if (!(actor.system?.health?.value > 0) || realmRefusalFor(actor, "ability") || sleepRefusal(actor, "ability")
      || despairRefusal(actor, "ability") || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")) return false;
    if ((actor.system.power?.name ?? "mana") !== "mana" || actor.system.power?.max !== SPEC.capacity
      || actor.system.power.value !== (consumed ? 0 : SPEC.capacity)) return false;
    return !selection || (selection.valid() && selection.targets.every(t => fromUuidSync(t.actorUuid) === t.actor && !realmRefusalFor(t.actor, "ability")));
  };
  try {
    if (!valid()) return refuse("invalid");
    const { chooseOption, spendTurnBudget, rollResilience, gateCastingTest } = await import("../dice/workflows.mjs");
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken: origin, chooseOption, name: "Obsidian Purge", radius: SPEC.purgeRadius,
      payment: "Spend one Action and all 12 Mana. Body DC 20 halves Nature damage and prevents stun and effect removal." });
    if (!selection.ok) return refuse(selection.reason);
    if (selection.targets.some(t => busy.has(t.actorUuid))) return refuse("busy");
    for (const t of selection.targets) { busy.add(t.actorUuid); locks.push(t.actorUuid); }
    if (!valid()) return refuse("changed");
    if (!await spendTurnBudget(actor, "action")) return refuse("action");
    paid = true;
    if (!valid()) return refuse("changed");
    await actor.update({ "system.power.value": 0 }); consumed = true;
    if (!valid()) return refuse("paymentUnconfirmed");
    const gateRolls = [];
    for (const t of selection.targets) {
      const victim = t.actor, row = { actorUuid: t.actorUuid, name: t.token.name };
      results.push(row);
      if (!valid()) return refuse("changed");
      if (!(victim.system?.health?.value > 0)) { row.skipped = true; continue; }
      const card = await rollResilience({ actor: victim, resilience: "body", dc: SPEC.dc, subtitle: "Obsidian Purge" });
      row.test = card?.id ?? null; row.resisted = card?.rolls?.[0]?.outcome?.success;
      const plan = destroyerPurgePlan({ mana: 12, maximum: 12, resisted: row.resisted,
        stunImmune: (victim.system?.conditionImmunities ?? []).includes("stunned") });
      if (!plan) return refuse("unresolved");
      if (!valid()) return refuse("changed");
      row.damageAttempted = true;
      row.damage = await strikeFromArea({ actor: victim, caster: actor,
        spell: { name: "Obsidian Purge", school: "nature", feature: true, isSpell: false, takesSpellpower: false },
        damage: { rating: plan.damage, school: "nature" } });
      if (!Array.isArray(row.damage)) return refuse("damageUnconfirmed");
      if (!valid()) return refuse("changed");
      if (!(victim.system?.health?.value > 0)) continue;
      if (plan.stunned) {
        row.stun = await inflictCondition({ victim, by: actor, id: "stunned", name: t.token.name, until: untilEndOfNextTurnOrRound(victim) });
        if (!row.stun?.landed && row.stun?.reason !== "immune") return refuse("stunUnconfirmed");
      }
      if (!valid()) return refuse("changed");
      if (!plan.dispel) continue;
      const options = [{ key: "none", name: "No eligible beneficial magical effect", description: "Resolve without removing an effect." }];
      const reviewedEffects = new Map();
      for (const effect of victim.effects ?? []) {
        const plain = plainEffect(effect);
        if (destroyerPurgeEffect(plain, { beneficial: true, magical: true, archmage: archmageCasters([plain]) }).ok) {
          reviewedEffects.set(effect.id, { effect, snapshot: JSON.stringify(plain) });
          options.push({ key: effect.id, name: effect.name, description: "GM: Select only if this is a beneficial magical effect." });
        }
      }
      if (options.length === 1) continue;
      const choice = await chooseOption({ id: `${actor.id}-purge`, name: "Obsidian Purge" }, options, null,
        { prompt: `GM: Choose one beneficial magical effect on ${t.token.name}. Protected effects are excluded.` });
      if (!choice || !options.some(option => option.key === choice.key)) return refuse("effectUnresolved");
      if (!valid()) return refuse("changed");
      if (choice.key === "none") continue;
      const reviewed = reviewedEffects.get(choice.key);
      const current = [...(victim.effects ?? [])].find(effect => effect.id === choice.key);
      if (!reviewed || current !== reviewed.effect || JSON.stringify(plainEffect(current)) !== reviewed.snapshot) return refuse("changedEffect");
      row.dispel = await endDestroyerPurgeEffect({ dispeller: actor, target: victim, effectId: choice.key, reviewed: true, valid,
        gateTest: async () => {
          const roll = await gateCastingTest(actor, { source, dc: castingDC({ tier: actor.system.tier ?? 4, targetDefense: victim.system?.defense ?? null }) });
          if (roll) gateRolls.push(roll);
          return roll;
        } });
      if (!row.dispel.ok && !["gateFailed", "marked", "archmage", "condition"].includes(row.dispel.reason)) return refuse("dispelUnconfirmed");
    }
    if (!valid()) return refuse("changed");
    const message = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls: gateRolls,
      content: `<p><strong>Obsidian Purge</strong></p><p>Spent 12 Mana. ${results.map(r => `${foundry.utils.escapeHTML(r.name)}: ${r.skipped ? "already fallen" : r.resisted ? "resisted" : "failed resistance"}; ${foundry.utils.escapeHTML((r.damage ?? []).join(" "))}${r.stun?.landed ? "; Stunned" : ""}${r.dispel?.ended?.length ? "; magical effect removed" : ""}`).join(". ")}.</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:obsidian-purge",
        casting: false, success: true, obsidianPurge: results } } });
    await completeSpellLockGates({ actor, rolls: gateRolls, message });
    finished = true; return { ok: true, paid, consumed, results };
  } catch (error) { console.warn("azeroth-rpg | Obsidian Purge", error); return refuse("writeUncertain"); }
  finally {
    locks.forEach(key => busy.delete(key));
    destroyerOperations.delete(actor.uuid);
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p>Obsidian Purge stopped after payment. Check Mana, damage, stun and removed effects in the recorded results. Do not repeat completed writes.</p>",
        flags: { "azeroth-rpg": { kind: "obsidianPurgeReport", consumed, results } } });
      } catch (error) { console.warn("azeroth-rpg | Obsidian Purge partial report", error); }
    }
  }
}
