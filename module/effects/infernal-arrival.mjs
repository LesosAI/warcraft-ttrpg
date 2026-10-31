import { INFERNAL, isInfernalArrival, infernalArrivalPlan, infernalArrivalOutcome } from "../rules/infernal.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { dealtHalvedBy } from "../rules/legacy-uses.mjs";
import { inflictCondition } from "./inflict.mjs";

export const INFERNAL_ARRIVALS = "infernalArrivals";
const queues = new Map();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const present = doc => doc?.uuid && fromUuidSync(doc.uuid) === doc;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const physical = actor => !projectionRefusal(actor, "ability") && !realmRefusalFor(actor, "ability");

/** Both entry paths share one combat ledger. Queue simultaneous late arrivals
 * so one flag write cannot overwrite another. No manual-use path creates a
 * landing. Captured or interrupted records never automatically reroll/replay.
 */
export async function advanceInfernalArrivals(combat, combatants) {
  if (!gmHere() || !present(combat) || !combat.started) return { ok: false, reason: "combat" };
  const prior = queues.get(combat.uuid) ?? Promise.resolve();
  const task = prior.catch(() => {}).then(() => resolveArrivals(combat, combatants));
  queues.set(combat.uuid, task);
  try { return await task; }
  finally { if (queues.get(combat.uuid) === task) queues.delete(combat.uuid); }
}

async function resolveArrivals(combat, combatants) {
  const results = [], refuse = reason => ({ ok: false, reason, results });
  const current = () => gmHere() && present(combat) && combat.started;
  if (!current() || !Array.isArray(combatants)) return refuse("combat");
  let expected = structuredClone(combat.getFlag("azeroth-rpg", INFERNAL_ARRIVALS) ?? []);
  if (!Array.isArray(expected)) return refuse("record");
  const save = async next => {
    if (!current() || !same(combat.getFlag("azeroth-rpg", INFERNAL_ARRIVALS) ?? [], expected)) throw Error("Arrival ledger changed");
    await combat.setFlag("azeroth-rpg", INFERNAL_ARRIVALS, next);
    if (!current() || !same(combat.getFlag("azeroth-rpg", INFERNAL_ARRIVALS), next)) throw Error("Arrival write unconfirmed");
    expected = structuredClone(next);
  };
  try {
    // Capture the entire starting roster before the first roll or damage write.
    const entries = [], capturedKeys = new Set();
    for (const combatant of combatants) {
      const actor = combatant?.actor;
      const ability = actor?.type === "npc" && actor.system?.creatureAbilities?.find(isInfernalArrival);
      if (!ability) continue;
      const token = combatant.token, scene = token?.parent, levelId = token?._source?.level;
      if (!present(combatant) || combatant.parent !== combat || !present(actor)
        || scene?.tokens?.get(token?.id) !== token || token.actor !== actor) return refuse("source");
      const key = JSON.stringify([combat.uuid, token.uuid]);
      const previous = expected.find(row => row?.key === key);
      if (previous) { if (previous.stage !== "applied") return refuse("reconcile"); continue; }
      if (capturedKeys.has(key)) continue;
      if (!(actor.system?.health?.value > 0) || !physical(actor)) continue;
      if (!scene.levels?.has(levelId)) return refuse("level");
      const creatures = [], targets = new Map();
      for (const victim of scene.tokens.values()) {
        if (!victim.actor || !physical(victim.actor)) continue;
        if (!present(victim.actor)) return refuse("target");
        creatures.push({ tokenUuid: victim.uuid, actorUuid: victim.actor.uuid, sceneId: scene.id,
          levelId: victim._source?.level,
          distance: victim._source?.level === levelId ? feetApart(token, victim) : null });
        targets.set(victim.uuid, { token: victim, actor: victim.actor });
      }
      const plan = infernalArrivalPlan({ combatUuid: combat.uuid, sourceTokenUuid: token.uuid,
        sceneId: scene.id, levelId, started: true, sourceStanding: true,
        landing: { x: token.x, y: token.y, elevation: token.elevation }, creatures, previous: expected });
      if (!plan) return refuse("geometry");
      capturedKeys.add(key);
      entries.push({ actor, token, scene, targets, plan: { ...plan, halved: Boolean(dealtHalvedBy(actor)), results: [] } });
    }
    if (!entries.length) return { ok: true, results };
    await save([...expected, ...entries.map(entry => entry.plan)]);
    const { rollResilience } = await import("../dice/workflows.mjs");
    for (const entry of entries) {
      const { actor, token, scene, plan } = entry;
      const change = async patch => save(expected.map(row => row.key === plan.key ? { ...row, ...patch } : row));
      const targetResults = [];
      for (const target of plan.targets) {
        const victim = entry.targets.get(target.tokenUuid);
        const valid = () => current() && present(actor) && present(victim.actor)
          && scene.tokens.get(victim.token.id) === victim.token && victim.token.actor === victim.actor;
        if (!valid()) return refuse("targetChanged");
        await change({ stage: "rolling", pendingTarget: target.tokenUuid });
        const card = await rollResilience({ actor: victim.actor, resilience: INFERNAL.arrival.resilience,
          dc: INFERNAL.arrival.dc, subtitle: INFERNAL.arrival.name });
        const resisted = card?.rolls?.[0]?.outcome?.success;
        const outcome = infernalArrivalOutcome({ resisted, dealtHalved: plan.halved });
        if (!outcome || !valid()) return refuse("testUnconfirmed");
        const result = { tokenUuid: target.tokenUuid, actorUuid: target.actorUuid, name: victim.token.name,
          testId: card.id, resisted, damage: outcome.damage, stage: "applying" };
        await change({ stage: "applying", results: [...targetResults, result] });
        if (!valid()) return refuse("targetChanged");
        await victim.actor.applyDamage(result.damage, { struck: true, attack: false, spell: false,
          type: null, by: actor, messageId: card.id });
        result.stage = "damageApplied";
        await change({ results: [...targetResults, result] });
        if (outcome.prone) {
          if (!valid()) return refuse("targetChanged");
          result.prone = await inflictCondition({ victim: victim.actor, id: "prone", by: actor, name: victim.token.name });
          if (!result.prone || ["error", "gone"].includes(result.prone.reason)) return refuse("conditionUnconfirmed");
        }
        result.stage = "applied";
        targetResults.push(result);
        await change({ results: [...targetResults] });
      }
      await change({ stage: "applied", pendingTarget: null });
      results.push({ key: plan.key, targets: targetResults });
      try {
        const escape = foundry.utils.escapeHTML;
        const lines = targetResults.map(result => game.i18n.format(result.resisted
          ? "AZEROTH.Infernal.ArrivalResisted" : "AZEROTH.Infernal.ArrivalFailed",
        { name: result.name, damage: result.damage }) + (result.resisted ? "" : ` ${game.i18n.localize(result.prone?.landed
          ? "AZEROTH.Infernal.ArrivalProne" : result.prone?.reason === "immune"
            ? "AZEROTH.Infernal.ArrivalProneImmune" : "AZEROTH.Infernal.ArrivalProneRefused")}`));
        const cueSource = scene.tokens.get(token.id) === token && token.actor === actor
          && token.x === plan.landing.x && token.y === plan.landing.y && token.elevation === plan.landing.elevation
          && token._source?.level === plan.levelId ? { sceneId: scene.id, tokenId: token.id } : null;
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><strong>${escape(game.i18n.localize("AZEROTH.Infernal.Arrival"))}</strong></p>${lines.map(line => `<p>${escape(line)}</p>`).join("")}`,
          flags: { "azeroth-rpg": { kind: "ability", infernalArrival: plan.key,
            featureKey: cueSource ? "ability:infernal-arrival" : null,
            source: cueSource ?? null,
            casting: false, success: true,
            targets: targetResults.map(result => ({ actorUuid: result.actorUuid, sceneId: scene.id,
              tokenId: entry.targets.get(result.tokenUuid).token.id, name: result.name })), results: targetResults } } });
      } catch { results[results.length - 1].feedbackError = true; }
    }
    return { ok: true, results };
  } catch { return refuse("writeUncertain"); }
}
