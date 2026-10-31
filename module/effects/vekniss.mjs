/** GM-side V14 effect lifecycle for the Vekniss encounter pair. Activation,
 * resistance and charge validation belong to their workflows. */
import { VEKNISS_FLAG, seedVekniss, seedVeknissWorld, validVeknissState, veknissTurn, veknissClock, veknissWorld } from "../rules/vekniss.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { postVeknissPulse } from "./vekniss-cues.mjs";

const pending = new Set();
const stateOf = effect => effect?.flags?.["azeroth-rpg"]?.[VEKNISS_FLAG];
const gmHere = () => game.user?.isGM === true && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const clockOf = combat => ({ round: combat.round, turn: combat.turn });
const present = actor => actor?.documentName === "Actor" && resolve(actor.uuid) === actor;

/** Called only after the activation door has paid and the victim failed its Test. */
export async function layVeknissItch({ source, target, combat } = {}) {
  if (!gmHere()) throw new Error("Vekniss effects must be applied by the active GM.");
  if (!present(source) || !present(target)) return { ok: false, reason: "missingEncounter" };
  if ((target.system?.conditionImmunities ?? []).includes("poisoned")) return { ok: false, reason: "immune" };
  if (combat && (!combat.started || !combat.getCombatantsByActor(source)?.length || !combat.getCombatantsByActor(target)?.length)) return { ok: false, reason: "differentEncounter" };
  if (pending.has(target.uuid)) return { ok: false, reason: "busy" };
  pending.add(target.uuid);
  try {
    const common = { sourceUuid: source.uuid, targetUuid: target.uuid, existing: [...target.effects].map(stateOf).filter(Boolean) };
    const seeded = combat ? seedVekniss({ ...common, combatUuid: combat.uuid, clock: clockOf(combat) })
      : seedVeknissWorld({ ...common, time: game.time?.worldTime });
    if (!seeded.ok) return seeded;
    const [effect] = await target.createEmbeddedDocuments("ActiveEffect", [{
      name: "Vekniss Itch", img: "icons/svg/poison.svg", origin: source.uuid,
      description: "<p>A pending poison. It becomes Vekniss Catalyst at the start of this creature's next turn. It has no penalties until then.</p>",
      statuses: [], system: { changes: [] },
      flags: { "azeroth-rpg": { [VEKNISS_FLAG]: seeded.state, harmful: true, poison: true } }
    }]);
    if (effect && (!present(source) || !present(target) || (combat && !combat.started) || (target.system?.conditionImmunities ?? []).includes("poisoned"))) {
      if (present(target) && target.effects.get(effect.id) === effect) await effect.delete();
      return { ok: false, reason: "changedEncounter", effectId: null };
    }
    return { ok: Boolean(effect), reason: effect ? null : "notCreated", effectId: effect?.id ?? null };
  } finally { pending.delete(target.uuid); }
}

/** All world and synthetic actors, deduplicated by identity. */
function carriers() {
  const actors = new Map();
  for (const actor of game.actors ?? []) actors.set(actor.uuid, actor);
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (token.actor) actors.set(token.actor.uuid, token.actor);
  return [...actors.values()];
}

/** Exploration pulses are claimed before damage just like combat pulses.
 * Large time advances process at most the one maturation and three ticks.
 */
export async function advanceVeknissWorld() {
  if (!gmHere() || !Number.isFinite(game.time?.worldTime)) return [];
  const lines = [];
  for (const actor of carriers()) {
    if (!present(actor) || pending.has(actor.uuid)) continue;
    pending.add(actor.uuid);
    try {
      for (const effect of [...actor.effects].filter(e => stateOf(e)?.mode === "world")) {
        for (let step = 0; step < 4 && actor.effects.get(effect.id) === effect; step++) {
          const state = stateOf(effect), source = resolve(state?.sourceUuid);
          const fight = (game.combats?.contents ?? []).find(c => c.started && c.getCombatantsByActor(actor)?.length);
          if (fight) {
            const next = veknissClock(state, { combatUuid: fight.uuid, clock: clockOf(fight) });
            if (next) await effect.update({ [`flags.azeroth-rpg.${VEKNISS_FLAG}`]: next });
            break;
          }
          const plan = veknissWorld(state, { targetUuid: actor.uuid, time: game.time.worldTime,
            sourceExists: present(source), disabled: effect.disabled === true || effect.active === false });
          if ((actor.system?.conditionImmunities ?? []).includes("poisoned") || plan.action === "end"
            || (state.phase === "catalyst" && ![...(effect.statuses ?? [])].includes("poisoned"))) { await effect.delete(); break; }
          if (plan.action === "none") {
            if (plan.next !== state) await effect.update({ [`flags.azeroth-rpg.${VEKNISS_FLAG}`]: plan.next });
            break;
          }
          if (plan.action === "mature") {
            await effect.update({ name: "Vekniss Catalyst", statuses: ["poisoned", "slowed"],
              "system.changes": [{ key: "system.speed", type: "multiply", value: 0.5, phase: "final" }],
              [`flags.azeroth-rpg.${VEKNISS_FLAG}`]: plan.next });
            lines.push(`${actor.name}: Vekniss Itch becomes Catalyst without damage.`);
            await postVeknissPulse({ actor, phase: "mature" });
            continue;
          }
          await effect.update({ [`flags.azeroth-rpg.${VEKNISS_FLAG}`]: plan.next ?? { ...state, remaining: 0 } });
          if (actor.effects.get(effect.id) !== effect || !present(actor)) break;
          try {
            if (present(source) && effect.disabled !== true && effect.active !== false
              && [...(effect.statuses ?? [])].includes("poisoned") && (actor.type !== "npc" || actor.system?.health?.value > 0)) {
              lines.push(...await strikeFromArea({ actor, caster: source,
                spell: { name: "Vekniss Catalyst", school: "nature", takesSpellpower: false, feature: true, isSpell: false }, damage: plan.damage }));
              await postVeknissPulse({ actor, phase: "tick" });
            }
          } catch {
            ui.notifications?.warn("Vekniss Catalyst damage failed. This pulse was consumed; check the creature before resolving it manually.");
          } finally {
            if ((plan.endsAfterDamage || !present(source) || ![...(effect.statuses ?? [])].includes("poisoned"))
              && present(actor) && actor.effects.get(effect.id) === effect) await effect.delete();
          }
        }
      }
    } finally { pending.delete(actor.uuid); }
  }
  return lines;
}

/** Run at the carrier's turn start. Claim each transition/tick before doing
 * damage; a failed damage application is reported and is never replayed. */
export async function advanceVekniss(actor, combat) {
  if (!gmHere() || !present(actor) || pending.has(actor.uuid)) return [];
  if (combat?.combatant?.actor?.uuid !== actor.uuid) return [];
  pending.add(actor.uuid);
  const lines = [];
  try {
    const effects = [...actor.effects].filter(stateOf);
    for (const effect of effects) {
      if (actor.effects.get(effect.id) !== effect || !present(actor)) continue;
      if ((actor.system?.conditionImmunities ?? []).includes("poisoned")) { await effect.delete(); continue; }
      const state = stateOf(effect), source = resolve(state?.sourceUuid);
      if (!combat.started) {
        const next = veknissClock(state, { time: game.time?.worldTime });
        if (next) await effect.update({ [`flags.azeroth-rpg.${VEKNISS_FLAG}`]: next });
        continue;
      }
      if (state?.mode === "world" && combat.started) {
        const next = veknissClock(state, { combatUuid: combat.uuid, clock: clockOf(combat) });
        if (next) await effect.update({ [`flags.azeroth-rpg.${VEKNISS_FLAG}`]: next });
        continue;
      }
      const plan = veknissTurn(state, { targetUuid: actor.uuid, combatUuid: combat.uuid, clock: clockOf(combat),
        sourceExists: present(source), targetExists: true, encounterActive: combat.started === true,
        disabled: effect.disabled === true || effect.active === false });
      if (plan.action === "none") continue;
      if (plan.action === "end") { await effect.delete(); continue; }
      if (plan.action === "mature") {
        await effect.update({ name: "Vekniss Catalyst", statuses: ["poisoned", "slowed"],
          "system.changes": [{ key: "system.speed", type: "multiply", value: 0.5, phase: "final" }],
          [`flags.azeroth-rpg.${VEKNISS_FLAG}`]: plan.next,
          description: "<p>Poisoned and Slowed. Takes 3 Nature damage at each of its next three turn starts. A Vekniss Stinger's charge deals 4 additional damage while this Catalyst remains.</p>" });
        if (!present(source) || ![...(effect.statuses ?? [])].includes("poisoned")) {
          if (actor.effects.get(effect.id) === effect) await effect.delete();
          continue;
        }
        lines.push("Vekniss Itch becomes Catalyst. No damage is dealt by the transition.");
        await postVeknissPulse({ actor, combat, phase: "mature" });
        if (!resolve(combat.uuid)?.started && actor.effects.get(effect.id) === effect) {
          const next = veknissClock(stateOf(effect), { time: game.time?.worldTime });
          if (next) await effect.update({ [`flags.azeroth-rpg.${VEKNISS_FLAG}`]: next });
        }
        continue;
      }
      // A terminal claim is deliberately invalid for another tick and can only
      // be cleaned up if this client disappears before the final deletion.
      await effect.update({ [`flags.azeroth-rpg.${VEKNISS_FLAG}`]: plan.next ?? { ...state, remaining: 0, last: clockOf(combat) } });
      if (actor.effects.get(effect.id) !== effect || !present(actor)) continue;
      if (!present(source) || ![...(effect.statuses ?? [])].includes("poisoned")) { await effect.delete(); continue; }
      if (effect.disabled === true || effect.active === false) continue;
      try {
        if (actor.type !== "npc" || actor.system?.health?.value > 0) {
          lines.push(...await strikeFromArea({ actor, caster: source,
            spell: { name: "Vekniss Catalyst", school: "nature", takesSpellpower: false, feature: true, isSpell: false },
            damage: plan.damage }));
          await postVeknissPulse({ actor, combat, phase: "tick" });
        }
      } catch (error) {
        lines.push("Vekniss Catalyst's damage could not be applied. This tick was consumed; resolve it manually.");
        ui.notifications?.warn("Vekniss Catalyst damage failed. Check the turn report before applying it manually.");
      } finally {
        // Cleanup hooks skip this actor while its tick owns the lock. Recheck
        // after the damage await so those events cannot leave a stale Catalyst.
        const ended = plan.endsAfterDamage || !present(source) || ![...(effect.statuses ?? [])].includes("poisoned");
        if (ended && present(actor) && actor.effects.get(effect.id) === effect) await effect.delete();
        else if (!resolve(combat.uuid)?.started && present(actor) && actor.effects.get(effect.id) === effect) {
          const next = veknissClock(stateOf(effect), { time: game.time?.worldTime });
          if (next) await effect.update({ [`flags.azeroth-rpg.${VEKNISS_FLAG}`]: next });
        }
      }
    }
  } finally { pending.delete(actor.uuid); }
  return lines;
}

/** Remove orphaned/ended doses and a Catalyst whose poison was removed. */
export async function cleanVeknissEffects() {
  if (!gmHere()) return 0;
  let removed = 0;
  for (const actor of carriers()) {
    if (!present(actor) || pending.has(actor.uuid)) continue;
    pending.add(actor.uuid);
    try {
      for (const effect of [...actor.effects].filter(stateOf)) {
        const state = stateOf(effect), fight = resolve(state?.combatUuid);
        const poisonGone = state?.phase === "catalyst" && ![...(effect.statuses ?? [])].includes("poisoned");
        if (!validVeknissState(state) || state.targetUuid !== actor.uuid || !present(resolve(state.sourceUuid)) || poisonGone) {
          if (actor.effects.get(effect.id) !== effect) continue;
          await effect.delete();
          removed++;
        } else {
          const active = (game.combats?.contents ?? []).find(c => c.started && c.getCombatantsByActor(actor)?.length)
            ?? (fight?.started && fight.getCombatantsByActor(actor)?.length ? fight : null);
          const next = veknissClock(state, active ? { combatUuid: active.uuid, clock: clockOf(active) } : { time: game.time?.worldTime });
          if (next && next !== state) await effect.update({ [`flags.azeroth-rpg.${VEKNISS_FLAG}`]: next });
        }
      }
    } finally { pending.delete(actor.uuid); }
  }
  return removed;
}

export function registerVeknissHooks() {
  const clean = () => { void cleanVeknissEffects().catch(() => ui.notifications?.warn("Vekniss effect cleanup failed. Check remaining Catalyst effects.")); };
  for (const hook of ["deleteActor", "deleteToken", "deleteCombat", "deleteScene", "ready"]) Hooks.on(hook, clean);
  Hooks.on("updateCombat", (_, changed) => { if ("round" in changed || "started" in changed) clean(); });
  Hooks.on("updateActiveEffect", (effect, changed) => { if (stateOf(effect) && "statuses" in changed) clean(); });
  Hooks.on("updateWorldTime", () => { void cleanVeknissEffects().then(() => advanceVeknissWorld())
    .catch(() => ui.notifications?.warn("Vekniss poison timing failed. Check the affected creatures.")); });
}
