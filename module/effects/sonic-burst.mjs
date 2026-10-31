/** One GM-owned payment and one resolution per reviewed enemy. */
import { SONIC_BURST, sonicBurstOutcome } from "../rules/sonic-burst.mjs";
import { resolveDamage } from "../rules/mitigation.mjs";
import { dealtHalvedBy } from "../rules/legacy-uses.mjs";
import { reviewSonicBurstTargets } from "./sonic-burst-targets.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { inflictCondition } from "./inflict.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";

export const SONIC_BURST_QUERY = "azeroth-rpg.sonicBurst";
const busy = new Set();
const gmHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;

export async function requestSonicBurst(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor) };
    const result = gmHere() ? await sonicBurstQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(SONIC_BURST_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "Sonic Burst was paid for but did not finish. Review its results before resolving anything manually."
      : "Sonic Burst was not used. Check the creature, area and remaining action.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Sonic Burst request", error);
    ui.notifications?.warn("Sonic Burst's result could not be confirmed. Check the GM's results before trying again.");
    return null;
  }
}

export async function sonicBurstQueryHandler({ actorUuid, index, source } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false;
  const results = [], keys = [];
  const refuse = reason => ({ ok: false, reason, paid, results });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (busy.has(actor.uuid)) return refuse("busy");
  keys.push(actor.uuid); busy.add(actor.uuid);
  const scene = game.scenes?.get(source?.sceneId), sourceToken = scene?.tokens.get(source?.tokenId);
  const clock = () => game.combat?.started ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` : `world:${game.time?.worldTime}`;
  const started = clock();
  let selection = null;
  const validate = () => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER")) return "owner";
    if (clock() !== started) return "clock";
    if (!scene || game.scenes.get(scene.id) !== scene || scene.tokens.get(source?.tokenId) !== sourceToken
      || sourceToken?.actor !== actor) return "source";
    if (!(actor.system?.health?.value > 0) || realmRefusalFor(actor, "ability")) return "source";
    const row = actor.system?.creatureAbilities?.[index];
    if (!Number.isInteger(index) || row?.name !== SONIC_BURST.name || row.automation?.action !== SONIC_BURST.action
      || row.automation?.uses?.max !== 1 || row.automation?.uses?.per !== "short"
      || row.automation?.uses?.value !== (consumed ? 0 : 1)) return "ability";
    if (selection && (!selection.valid() || selection.targets.some(t => realmRefusalFor(t.actor, "ability")))) return "changedArea";
    return null;
  };
  try {
    let reason = validate();
    if (reason) return refuse(reason);
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
    selection = await reviewSonicBurstTargets({ actor, scene, sourceToken, chooseOption });
    if (!selection.ok) return refuse(selection.reason);
    if (selection.targets.some(t => busy.has(t.actorUuid))) return refuse("busy");
    for (const target of selection.targets) { keys.push(target.actorUuid); busy.add(target.actorUuid); }
    reason = validate();
    if (reason) return refuse(reason);
    if (!await spendTurnBudget(actor, SONIC_BURST.action)) return refuse("action");
    paid = true;
    reason = validate();
    if (reason) return refuse(reason);
    const abilities = foundry.utils.deepClone(actor.system.creatureAbilities);
    abilities[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": abilities });
    consumed = true;
    for (const target of selection.targets) {
      reason = validate();
      if (reason) return refuse(reason);
      const victim = target.actor;
      const result = { actorUuid: victim.uuid, name: target.token.name, damageAttempted: false, damageApplied: false };
      results.push(result);
      const card = await rollResilience({ actor: victim, resilience: SONIC_BURST.resilience, dc: SONIC_BURST.dc, subtitle: SONIC_BURST.name });
      const resisted = card?.rolls?.[0]?.outcome?.success;
      const outcome = sonicBurstOutcome(resisted);
      result.test = card?.id ?? null;
      if (!outcome) return refuse("unresolved");
      result.resisted = resisted;
      reason = validate();
      if (reason) return refuse(reason);
      const snapshot = targetSnapshots([{ id: target.token.id, actor: victim, name: target.token.name, scene }])[0];
      const damage = resolveDamage({ rating: SONIC_BURST.damage, sl: 0, kind: "physical", school: "physical",
        location: "body", apByLocation: snapshot.apByLocation, immune: snapshot.immune, vulnerable: snapshot.vulnerable,
        slAddsToDamage: false, dealtHalved: dealtHalvedBy(actor), passedHalf: resisted });
      result.damage = damage.damage;
      result.immune = damage.immune;
      if (!damage.immune) {
        result.damageAttempted = true;
        await victim.applyDamage(damage.damage, { struck: true, attack: true, location: "body", type: "physical",
          by: actor, spell: false, messageId: card?.id ?? null, parts: damage.parts ?? null });
        result.damageApplied = true;
      }
      reason = validate();
      if (reason) return refuse(reason);
      if (outcome.condition) {
        result.silence = await inflictCondition({ victim, id: outcome.condition, by: actor, name: target.token.name,
          until: untilEndOfNextTurnOrRound(victim) });
        if (!result.silence || ["error", "gone"].includes(result.silence.reason)) return refuse("condition");
      }
    }
    const text = results.map(r => `${r.name}: ${r.resisted ? "resisted" : "failed the Test"}; ${r.damage} Physical damage${r.silence ? (r.silence.landed ? "; Silenced" : `; silence ${r.silence.reason ?? "refused"}`) : ""}.`).join(" ");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>Sonic Burst</strong></p><p>${foundry.utils.escapeHTML(text)}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:sonic-burst",
        casting: false,
        success: true, sonicBurst: results, targets: selection.targets.map(t => ({ sceneId: scene.id, tokenId: t.token.id, actorUuid: t.actorUuid, name: t.token.name })) } } });
    finished = true;
    return { ok: true, paid, results };
  } catch (error) {
    console.warn("azeroth-rpg | Sonic Burst", error);
    return refuse("write");
  } finally {
    keys.forEach(key => busy.delete(key));
    if (paid && !finished) {
      try {
        const report = results.map(r => `${r.name}: ${r.damageApplied ? `${r.damage} Physical damage applied` : r.damageAttempted ? "damage write uncertain; check Health before applying anything" : "damage not applied"}${r.silence ? `; silence ${r.silence.landed ? "applied" : r.silence.reason ?? "refused"}` : ""}.`).join(" ");
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><strong>Sonic Burst stopped after payment.</strong> Do not repeat completed damage. The GM must resolve any remaining effects.</p><p>${foundry.utils.escapeHTML(report || "No target has been resolved.")}</p>`,
          flags: { "azeroth-rpg": { kind: "sonicBurstReport", sonicBurst: results, useConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Sonic Burst partial report", error); }
    }
  }
}
