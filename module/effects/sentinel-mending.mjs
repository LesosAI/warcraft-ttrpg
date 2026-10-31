import { sentinelMendingPlan } from "../rules/sentinel-mending.mjs";
import { activeSentinelPowers } from "./anubisath-pack.mjs";
import { sentinelFeedback } from "./sentinel-feedback.mjs";
const path = "flags.azeroth-rpg.sentinelMending";
const pending = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const present = actor => actor?.uuid && fromUuidSync(actor.uuid) === actor;
const stateOf = actor => actor.flags?.["azeroth-rpg"]?.sentinelMending ?? null;
const fightOf = actor => (game.combats?.contents ?? []).find(combat => combat.started
  && combat.getCombatantsByActor(actor)?.length) ?? null;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const values = collection => collection?.values?.() ?? collection ?? [];

export async function advanceSentinelMending(actor, combat = null, { pulse = true } = {}) {
  if (!gmHere() || !present(actor) || pending.has(actor.uuid)) return [];
  const governing = fightOf(actor);
  if (pulse && (combat ? governing !== combat || combat.combatant?.actor !== actor : governing !== null)) return [];
  const snapshot = () => ({ packId: actor.flags?.["azeroth-rpg"]?.sentinelPack?.assignment?.id,
    known: activeSentinelPowers(actor).includes("mending"), alive: actor.system?.health?.value > 0,
    combatUuid: governing?.uuid ?? null, round: governing?.round, turn: governing?.turn,
    time: game.time?.worldTime, pulse });
  const before = snapshot(), state = stateOf(actor), plan = sentinelMendingPlan(state, before);
  if (same(state, plan.next)) return [];
  pending.add(actor.uuid);
  try {
    await actor.update({ [path]: plan.next });
    if (!gmHere() || !present(actor) || !same(stateOf(actor), plan.next)
      || fightOf(actor) !== governing || !same(snapshot(), before)) return [];
    if (plan.heal > 0) {
      // The clock claim is already persisted. All shared healing modifiers,
      // full-Health limits and healing follow-ups use the normal actor door.
      const healthBefore = actor.system.health.value;
      await actor.applyHealing(plan.heal, { from: actor });
      const restored = Math.max(0, actor.system.health.value - healthBefore);
      if (restored > 0) await sentinelFeedback(actor, "ability:sentinel-mending", `${actor.name}: Mending restored ${restored} Health.`);
      return [`${actor.name}: Mending restored ${restored} Health.`];
    }
    return [];
  } finally { pending.delete(actor.uuid); }
}

export async function advanceAllSentinelMending({ pulse = false } = {}) {
  if (!gmHere()) return;
  const actors = new Map();
  const add = actor => { if (actor?.uuid && (stateOf(actor) || actor.flags?.["azeroth-rpg"]?.sentinelPack)) actors.set(actor.uuid, actor); };
  for (const actor of values(game.actors)) add(actor);
  for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) add(token.actor);
  for (const actor of actors.values()) await advanceSentinelMending(actor, null, { pulse });
}

export function registerSentinelMendingHooks() {
  const warn = error => {
    console.warn("azeroth-rpg | Sentinel Mending", error);
    ui.notifications?.warn("Mending could not be confirmed. Check Health and its recorded clock before making a correction.");
  };
  const clean = () => { void advanceAllSentinelMending().catch(warn); };
  for (const hook of ["ready", "updateActor", "createCombatant", "deleteCombatant", "deleteCombat"]) Hooks.on(hook, clean);
  Hooks.on("updateCombat", clean);
  Hooks.on("updateWorldTime", () => { void advanceAllSentinelMending({ pulse: true }).catch(warn); });
}
