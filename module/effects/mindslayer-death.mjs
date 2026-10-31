/** Active-GM resolution of an observed Mindslayer death. Never a normal Use. */
import { MINDSLAYER_DEATH as SPEC, dyingMindClaim, dyingMindTargetPlan } from "../rules/mindslayer.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { inflictCondition } from "./inflict.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";

export const MINDSLAYER_DEATH_FLAG = "mindslayerDeath";
const pending = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** Explicit encounter reset. It clears only the attempt record, never Health,
 * ownership or effects. The death observer still requires a later living-to-zero
 * transition, so resetting a corpse does not fire another burst.
 */
export async function resetDyingMind(actor, { choose } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || actor?.type !== "npc" || !actor.uuid) return refuse("gmOrActor");
  if (pending.has(actor.uuid)) return refuse("busy");
  const held = () => actor.flags?.["azeroth-rpg"]?.[MINDSLAYER_DEATH_FLAG];
  const before = JSON.stringify(held());
  if (held() == null) return refuse("noClaim");
  const inFight = () => actor.activeFight?.()?.started || [...(game.combats?.values?.() ?? [])].some(fight =>
    fight.started && [...(fight.combatants?.values?.() ?? [])].some(c => c.actor === actor));
  const valid = () => gmHere() && !inFight() && fromUuidSync(actor.uuid) === actor
    && JSON.stringify(held()) === before
    && (actor.system?.creatureAbilities ?? []).some(row => row.name === SPEC.name);
  if (!valid()) return refuse("actorOrCombat");
  pending.add(actor.uuid);
  try {
    const chooser = choose ?? (await import("../dice/workflows.mjs")).chooseOption;
    const answer = await chooser({ id: `${actor.id}-dying-mind-reset`, name: "Reset Dying Mind" }, [
      { key: "cancel", name: "Cancel", description: "Keep the recorded death burst." },
      { key: "reset", name: "Reset for a new encounter", description: "Clear this actor's death-burst record. This does not restore Health or repeat the previous burst." }
    ], null, { prompt: "GM: Resolve any unfinished Mana loss, damage or fear before resetting. The next burst requires a new death after this creature has been restored to life." });
    if (answer?.key !== "reset") return refuse("cancelled");
    if (!valid()) return refuse("changed");
    await actor.unsetFlag("azeroth-rpg", MINDSLAYER_DEATH_FLAG);
    if (held() != null) return refuse("unconfirmed");
    ui.notifications?.info("Dying Mind is reset for a new encounter. Health has not changed.");
    return { ok: true };
  } catch (error) {
    console.warn("azeroth-rpg | Reset Dying Mind", error);
    ui.notifications?.warn("The reset could not be confirmed. Inspect the death-burst record before trying again.");
    return refuse("writeUncertain");
  } finally { pending.delete(actor.uuid); }
}

export async function resolveDyingMind({ actor, token, observedDeath = false } = {}) {
  const results = [], locks = [];
  let claimed = false, finished = false;
  const refuse = reason => ({ ok: false, reason, claimed, results });
  if (!gmHere() || observedDeath !== true || actor?.type !== "npc" || !actor.uuid || !token?.uuid) return refuse("authority");
  if (pending.has(actor.uuid)) return refuse("busy");
  const scene = token.parent;
  const clock = () => game.combat?.started ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}`
    : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null;
  const started = clock(), position = { x: token.x, y: token.y, elevation: token.elevation, level: token.level };
  const valid = () => gmHere() && started !== null && clock() === started && game.scenes?.get(scene?.id) === scene
    && scene.tokens?.get(token.id) === token && token.actor === actor && actor.system?.health?.value === 0
    && Object.entries(position).every(([key, value]) => token[key] === value)
    && (actor.system?.creatureAbilities ?? []).some(row => row.name === SPEC.name)
    && !realmRefusalFor(actor, "ability");
  if (!valid()) return refuse("source");
  const claim = dyingMindClaim({ sceneId: scene.id, tokenId: token.id, actorUuid: actor.uuid,
    health: actor.system.health, existing: actor.flags?.["azeroth-rpg"]?.[MINDSLAYER_DEATH_FLAG] ?? null });
  if (!claim) return refuse("claimedOrHealth");
  pending.add(actor.uuid); locks.push(actor.uuid);
  const held = () => JSON.stringify(actor.flags?.["azeroth-rpg"]?.[MINDSLAYER_DEATH_FLAG]) === JSON.stringify(claim);
  const report = () => results.map(r => `${r.name}: ${r.drained === undefined ? "Mana loss unconfirmed" : `${r.drained} Mana lost`}; ${r.damageApplied ? "damage resolved" : r.damageAttempted ? "damage unconfirmed" : "no damage applied"}; ${r.frightened ? "Frightened" : r.fearImmune ? "immune to fear" : r.resisted ? "resisted fear" : r.skipped ? "already fallen" : "fear not applied"}.`).join(" ");
  try {
    // Record the attempt before the first dialog or target write. An uncertain
    // setFlag must not be retried automatically by this resolver.
    await actor.setFlag("azeroth-rpg", MINDSLAYER_DEATH_FLAG, claim); claimed = true;
    if (!valid() || !held()) return refuse("claimUnconfirmed");
    const { chooseOption, rollResilience } = await import("../dice/workflows.mjs");
    let selection = await reviewNearbyEnemies({ actor, scene, sourceToken: token, chooseOption,
      name: SPEC.name, radius: SPEC.radius, automatic: true,
      payment: "This death burst spends no Action or Mana. Spirit DC 20 halves Mana loss and prevents fear.",
      validOrigin: () => valid() && held() });
    if (!selection.ok) {
      if (selection.reason === "empty" && valid() && held()) selection = { targets: [], valid: () => valid() && held() };
      else return refuse(selection.reason);
    }
    if (selection.targets.some(t => pending.has(t.actorUuid))) return refuse("busy");
    for (const target of selection.targets) { pending.add(target.actorUuid); locks.push(target.actorUuid); }
    for (const target of selection.targets) {
      const victim = target.actor;
      const still = () => valid() && held() && selection.valid() && scene.tokens.get(target.token.id) === target.token
        && target.token.actor === victim && !realmRefusalFor(victim, "ability");
      if (!still()) return refuse("changedArea");
      const row = { name: target.token.name, actorUuid: victim.uuid }; results.push(row);
      if (!(victim.system?.health?.value > 0)) { row.skipped = true; continue; }
      const card = await rollResilience({ actor: victim, resilience: SPEC.resilience, dc: SPEC.dc, subtitle: SPEC.name });
      row.test = card?.id ?? null; row.resisted = card?.rolls?.[0]?.outcome?.success;
      if (typeof row.resisted !== "boolean") return refuse("unresolved");
      if (!still() || !(victim.system?.health?.value > 0)) return refuse("changedTarget");
      const plan = dyingMindTargetPlan(victim.poolSnapshot?.() ?? [], { resisted: row.resisted });
      if (!plan) return refuse("pool");
      row.drainAttempted = plan.drained;
      if (plan.change) await victim.updatePool(plan.change);
      row.drained = plan.drained;
      if (!still()) return refuse("changedArea");
      if (plan.damage > 0) {
        row.damageAttempted = true;
        row.damage = await strikeFromArea({ actor: victim, caster: actor,
          spell: { name: SPEC.name, school: "shadow", takesSpellpower: false, feature: true, isSpell: false },
          damage: { rating: plan.damage, school: "shadow" } });
        if (!Array.isArray(row.damage) || !row.damage.length) return refuse("damageUnconfirmed");
        row.damageApplied = true;
      }
      if (!still()) return refuse("changedArea");
      if (victim.type === "npc" && !(victim.system?.health?.value > 0)) { row.fallen = true; continue; }
      if (plan.frightened) {
        row.fearAttempted = true;
        const landed = await inflictCondition({ victim, by: actor, id: SPEC.condition, name: target.token.name,
          until: untilEndOfNextTurnOrRound(victim) });
        row.frightened = landed?.landed === true; row.fearImmune = landed?.reason === "immune";
        if (!row.frightened && !row.fearImmune) return refuse("fearUnconfirmed");
      }
      if (!still()) return refuse("changedArea");
    }
    const source = { sceneId: scene.id, tokenId: token.id };
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>Dying Mind</strong></p><p>${foundry.utils.escapeHTML(report() || "No enemies affected.")}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:dying-mind",
        casting: false, success: true, dyingMind: results,
        targets: selection.targets.filter(t => results.some(r => r.actorUuid === t.actorUuid && (r.damageApplied || r.frightened)))
          .map(t => ({ sceneId: scene.id, tokenId: t.token.id, actorUuid: t.actorUuid, name: t.token.name })) } } });
    finished = true;
    return { ok: true, claimed, results };
  } catch (error) { console.warn("azeroth-rpg | Dying Mind", error); return refuse("writeUncertain"); }
  finally {
    locks.forEach(key => pending.delete(key));
    if (!finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p>Dying Mind stopped before completion. Do not repeat completed drains, damage or fear. Inspect the death claim before any manual correction.</p><p>${foundry.utils.escapeHTML(report())}</p>`,
        flags: { "azeroth-rpg": { kind: "dyingMindReport", claimed, dyingMind: results } } });
      } catch (error) { console.warn("azeroth-rpg | Dying Mind report", error); }
    }
  }
}
