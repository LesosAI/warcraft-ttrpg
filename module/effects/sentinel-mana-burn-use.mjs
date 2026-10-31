import { SENTINEL_MANA_BURN as SPEC, sentinelManaBurnPlan } from "../rules/sentinel-mana-burn.mjs";
import { activeSentinelPowers } from "./anubisath-pack.mjs";
import { burnSentinelMana } from "./sentinel-mana-burn.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
export const SENTINEL_BURN_QUERY = "azeroth-rpg.sentinelManaBurn";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export async function requestSentinelManaBurn(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor) };
    const result = gmHere() ? await sentinelManaBurnQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(SENTINEL_BURN_QUERY, data, { timeout: 180000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(result?.paid
      ? "Mana Burn stopped after payment. Check the recorded Mana losses and damage before continuing."
      : "Mana Burn was not used. Check the pack power, nearby enemies and remaining Action.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Sentinel Mana Burn request", error);
    ui.notifications?.warn("Mana Burn could not be confirmed. Check the GM's results before trying again.");
    return null;
  }
}

export async function sentinelManaBurnQueryHandler({ actorUuid, index, source } = {}, { user } = {}) {
  let paid = false, selection = null, draining = false, reported = false;
  const results = [], chosen = [];
  const refuse = reason => ({ ok: false, paid, reason, results });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.type !== "npc" || !actor.testUserPermission(user, "OWNER") || !Number.isInteger(index)) return refuse("owner");
  if (busy.has(actor.uuid)) return refuse("busy");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  const clock = () => { const combat = actor.activeFight?.(); return combat?.started
    ? `${combat.uuid}:${combat.round}:${combat.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock();
  const valid = () => gmHere() && fromUuidSync(actor.uuid) === actor && actor.testUserPermission(user, "OWNER")
    && started !== null && clock() === started && actor.system?.health?.value > 0
    && scene && game.scenes.get(scene.id) === scene && scene.tokens.get(origin?.id) === origin && origin?.actor === actor
    && actor.system?.creatureAbilities?.[index]?.name === "Sentinel Mana Burn"
    && actor.system.creatureAbilities[index].automation?.kind === "utility"
    && actor.system.creatureAbilities[index].automation.action === SPEC.action
    && actor.system.creatureAbilities[index].automation.dc === SPEC.dc
    && activeSentinelPowers(actor).includes("mana-burn")
    && !realmRefusalFor(actor, "ability") && !sleepRefusal(actor, "ability") && !despairRefusal(actor, "ability")
    && !actor.statuses?.has("stunned") && !actor.statuses?.has("silenced")
    && (!selection || (selection.valid() && selection.targets.every(target => fromUuidSync(target.actorUuid) === target.actor
      && !realmRefusalFor(target.actor, "ability"))))
    && (draining || chosen.every(target => target.actor.system?.health?.value > 0 && same(target.actor.poolSnapshot(), target.snapshot)));
  const report = () => results.map(row => `${row.name}: ${row.drained === undefined ? "Mana loss not confirmed" : `${row.drained} Mana lost`}; ${row.lines?.join(" ") ?? (row.drained === 0 ? "no damage" : "damage not resolved")}.`).join(" ");
  busy.add(actor.uuid);
  try {
    if (!valid()) return refuse("source");
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken: origin, chooseOption,
      name: "Sentinel Mana Burn", radius: SPEC.radius,
      payment: "Spend one Action. Spirit DC 20 reduces Mana loss from 4 to 2; Shadow damage equals the Mana actually lost." });
    if (!selection.ok) return refuse(selection.reason);
    for (const target of selection.targets) {
      if (!valid()) return refuse("changed");
      if (!(target.actor.system?.health?.value > 0)) continue;
      const snapshot = structuredClone(target.actor.poolSnapshot());
      const pools = snapshot.filter(pool => pool.kind === "power"
        && (pool.name === "mana" || (target.actor.type === "npc" && pool.name == null)));
      let itemId = null;
      if (pools.length) {
        const options = [{ key: "cancel", name: "Cancel", description: "Keep the Action." }, ...pools.map((pool, n) => ({
          key: `pool-${n}`, name: target.actor.items?.get?.(pool.itemId)?.name ?? "Mana",
          description: `Burn Mana from this pool (${pool.value} remaining).` }))];
        const answer = await chooseOption({ id: `${actor.id}-burn`, name: "Sentinel Mana Burn" }, options, null,
          { prompt: `Choose one Mana pool for ${target.token.name}.` });
        const selected = options.findIndex(option => option.key === answer?.key) - 1;
        if (selected < 0) return refuse("cancelled");
        itemId = pools[selected].itemId;
      }
      const row = { ...target, itemId, snapshot, resisted: false, hasMana: pools.length > 0 };
      if (!sentinelManaBurnPlan({ pools: snapshot, itemId, resisted: false, npc: target.actor.type === "npc" })) return refuse("pool");
      chosen.push(row);
    }
    if (!chosen.some(target => target.hasMana)) return refuse("noMana");
    if (!valid()) return refuse("changed");
    if (!await spendTurnBudget(actor, SPEC.action)) return refuse("action");
    paid = true;
    for (const target of chosen) {
      if (!valid()) return refuse("changed");
      const row = { actorUuid: target.actorUuid, name: target.token.name };
      results.push(row);
      if (!target.hasMana) continue;
      const card = await rollResilience({ actor: target.actor, resilience: SPEC.resilience, dc: SPEC.dc, subtitle: "Sentinel Mana Burn" });
      target.resisted = card?.rolls?.[0]?.outcome?.success;
      row.test = card?.id ?? null;
      if (typeof target.resisted !== "boolean") return refuse("unresolved");
    }
    if (!valid()) return refuse("changed");
    draining = true;
    const burned = await burnSentinelMana({ source: actor, targets: chosen, cast: foundry.utils.randomID(), valid });
    for (const loss of burned.losses) results.find(row => row.actorUuid === loss.uuid).drained = loss.drained;
    for (const loss of burned.losses) {
      const target = chosen.find(candidate => candidate.actorUuid === loss.uuid);
      const row = results.find(candidate => candidate.actorUuid === loss.uuid);
      if (!loss.drained) continue;
      if (!valid()) return refuse("changedAfterDrain");
      row.damageAttempted = true;
      row.lines = await strikeFromArea({ actor: target.actor, caster: actor,
        spell: { name: "Sentinel Mana Burn", school: SPEC.school, feature: true, isSpell: false, takesSpellpower: false },
        damage: { rating: loss.drained, school: SPEC.school } });
      if (!Array.isArray(row.lines) || !row.lines.length) return refuse("damageUncertain");
    }
    if (!burned.ok) return refuse(burned.reason);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>Sentinel Mana Burn</strong></p><p>${foundry.utils.escapeHTML(report())}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:sentinel-mana-burn",
        casting: false, success: true, sentinelManaBurn: results,
        targets: chosen.filter(target => results.some(row => row.actorUuid === target.actorUuid && row.drained > 0 && row.lines?.length))
          .map(target => ({ sceneId: scene.id, tokenId: target.token.id, actorUuid: target.actorUuid })) } } });
    reported = true;
    return { ok: true, paid, results };
  } catch (error) { console.warn("azeroth-rpg | Sentinel Mana Burn", error); return refuse("writeUncertain"); }
  finally {
    busy.delete(actor.uuid);
    if (paid && !reported) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p>Mana Burn stopped after payment. Do not repeat completed drains or damage.</p><p>${foundry.utils.escapeHTML(report())}</p>`,
        flags: { "azeroth-rpg": { kind: "sentinelManaBurnReport", sentinelManaBurn: results } } });
      } catch (error) { console.warn("azeroth-rpg | Sentinel Mana Burn report", error); }
    }
  }
}
