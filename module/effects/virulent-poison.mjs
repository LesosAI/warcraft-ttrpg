import { VIRULENT, VIRULENT_FLAG as FLAG, validVirulent, virulentDose, virulentClock,
  virulentPulse, virulentEffect, virulentWithdrawal } from "../rules/virulent-poison.mjs";
import { creaturePoisonPatch } from "../rules/creature-poisons.mjs";
import { downedTarget } from "../rules/poison-catchup.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
/** A guard against a runaway loop; an hourly catch-up has no cap of its own (D12 R4). */
const CATCH_UP_GUARD = 48;
const queues = new Map();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const present = actor => actor?.documentName === "Actor" && resolve(actor.uuid) === actor;
const stateOf = e => e?.flags?.["azeroth-rpg"]?.[FLAG];
const valueOf = e => e?.flags?.["azeroth-rpg"]?.value;
const held = (actor, effect) => present(actor) && actor.effects.get(effect.id) === effect;
const immune = actor => (actor.system?.conditionImmunities ?? []).includes("poisoned");
const poisoned = e => [...(e.statuses ?? [])].includes("poisoned") && Number.isInteger(valueOf(e)) && valueOf(e) > 0 && valueOf(e) <= VIRULENT.stacks;
const fightOf = actor => (game.combats?.contents ?? []).find(c => c.started && c.getCombatantsByActor(actor)?.length) ?? null;
const timing = fight => fight ? { combatUuid: fight.uuid, clock: { round: fight.round, turn: fight.turn } } : { time: game.time?.worldTime };
const path = `flags.azeroth-rpg.${FLAG}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** All applications, clock transfers and damage claims share this queue. */
export async function virulentWrite(uuid, run) {
  const task = (queues.get(uuid) ?? Promise.resolve()).catch(() => {}).then(run);
  queues.set(uuid, task);
  try { return await task; }
  finally { if (queues.get(uuid) === task) queues.delete(uuid); }
}

/** Caller has claimed the attack receipt and resolved the failed Body Test.
 * This operation never repeats that Test or damages immediately.
 */
export function layVirulentPoison({ source, target, hitId, valid } = {}) {
  return virulentWrite(target?.uuid, async () => {
    const check = () => gmHere() && present(source) && present(target) && typeof valid === "function" && valid();
    if (!check()) return { ok: false, reason: "unavailable" };
    if (immune(target)) return { ok: true, immune: true };
    const carriers = [...target.effects].filter(stateOf);
    if (carriers.length > 1) return { ok: false, reason: "conflictingCarriers" };
    let effect = carriers[0] ?? null;
    if (effect && (effect.disabled || effect.active === false)) return { ok: false, reason: "inactiveCarrier" };
    const dose = virulentDose({ sourceUuid: source.uuid, targetUuid: target.uuid, hitId,
      existing: effect ? stateOf(effect) : null, currentValue: 0, ...timing(fightOf(target)) });
    if (!dose) return { ok: false, reason: "invalidDose" };
    if (dose.duplicate) return { ok: true, duplicate: true, effectId: effect.id };
    try {
      if (effect) {
        // A new hit lays the dose's stacks again, shed or not.
        await effect.update({ [path]: dose.state, "flags.azeroth-rpg.value": dose.value, origin: source.uuid,
          statuses: ["poisoned"],
          ...creaturePoisonPatch({ value: dose.value, damage: VIRULENT.damage * dose.value, statuses: ["poisoned"] }) });
      } else {
        [effect] = await target.createEmbeddedDocuments("ActiveEffect", [virulentEffect(dose,
          { now: game.time?.worldTime ?? 0, inFight: Boolean(fightOf(target)) })]);
      }
      if (!effect || !check() || !held(target, effect) || !poisoned(effect) || immune(target)
        || valueOf(effect) !== dose.value || !same(stateOf(effect), dose.state)) return { ok: false, reason: "writeUnconfirmed", effectId: effect?.id };
      return { ok: true, effectId: effect.id, value: dose.value };
    } catch (error) {
      console.warn("azeroth-rpg | Virulent Poison application", error);
      return { ok: false, reason: "writeUncertain", effectId: effect?.id };
    }
  });
}

function carriers() {
  const actors = [...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))];
  return [...new Map(actors.filter(a => a?.uuid && [...(a.effects ?? [])].some(stateOf)).map(a => [a.uuid, a])).values()];
}

/** Withdrawing a hit edits only its surviving contribution. A cured or
 * expired carrier stays gone; the attack claim itself is retained elsewhere.
 */
export function withdrawVirulentPoison({ target, hitId, valid } = {}) {
  return virulentWrite(target?.uuid, async () => {
    const check = () => gmHere() && present(target) && typeof valid === "function" && valid();
    if (!check()) return { ok: false, reason: "unavailable" };
    const found = [...target.effects].filter(e => stateOf(e)?.hits?.includes(hitId));
    if (!found.length) return { ok: true, absent: true };
    if (found.length !== 1) return { ok: false, reason: "conflictingCarriers" };
    const effect = found[0];
    const plan = virulentWithdrawal(stateOf(effect), hitId);
    if (!plan) return { ok: false, reason: "invalidCarrier" };
    try {
      if (!plan.state) {
        await effect.delete();
        return { ok: check() && !held(target, effect), removed: !held(target, effect) };
      }
      // Withdrawing a contribution lowers the dose; the condition's value follows it.
      await effect.update({ [path]: plan.state, "flags.azeroth-rpg.value": plan.value, origin: plan.state.sourceUuid,
        ...creaturePoisonPatch({ value: plan.value, damage: VIRULENT.damage * plan.value }) });
      return { ok: check() && held(target, effect) && same(stateOf(effect), plan.state) && valueOf(effect) === plan.value,
        value: plan.value };
    } catch (error) {
      console.warn("azeroth-rpg | Virulent Poison withdrawal", error);
      return { ok: false, reason: "writeUncertain" };
    }
  });
}

/** Persist each tick claim before ordinary Nature mitigation. An uncertain
 * damage write is reported and never replayed. World catch-up lands every hour due,
 * each tick mitigated by Ward separately.
 */
export function advanceVirulentPoison(actor, combat = null) {
  return virulentWrite(actor?.uuid, async () => {
    const lines = [];
    if (!gmHere() || !present(actor)) return lines;
    if (combat && (!combat.started || combat.combatant?.actor !== actor || fightOf(actor) !== combat)) return lines;
    for (const effect of [...actor.effects].filter(stateOf)) {
      for (let n = 0; n < (combat ? 1 : CATCH_UP_GUARD) && gmHere() && held(actor, effect); n++) {
        // A catch-up stops at a target with no Health left to lose (rules/poison-catchup.mjs).
        if (!combat && downedTarget(actor)) break;
        try {
          const state = stateOf(effect);
          if (!validVirulent(state) || state.targetUuid !== actor.uuid || immune(actor)) {
            await effect.delete(); break;
          }
          const governing = fightOf(actor);
          const nextClock = virulentClock(state, timing(governing));
          if (!nextClock) break;
          if (nextClock !== state) { await effect.update({ [path]: nextClock }); break; }
          if ((!combat && governing) || (combat && governing !== combat)) break;
          const plan = virulentPulse(state, { targetUuid: actor.uuid,
            disabled: effect.disabled === true || effect.active === false, ...timing(combat) });
          if (plan.action === "end") { await effect.delete(); break; }
          if (plan.action === "none") break;
          const clockBefore = JSON.stringify(timing(governing));
          // The beat lays the dose's stacks again (D12 R1): whatever was shed, Poisoned returns at
          // the dose's value, and the damage below is worked out from that value.
          const relay = plan.action === "tick"
            ? { statuses: ["poisoned"], "flags.azeroth-rpg.value": plan.value,
              ...creaturePoisonPatch({ value: plan.value, damage: VIRULENT.damage * plan.value, statuses: ["poisoned"] }) } : {};
          await effect.update({ [path]: plan.next, ...relay });
          if (!gmHere() || !held(actor, effect) || !same(stateOf(effect), plan.next)) {
            lines.push({ applied: false, reason: "claimUnconfirmed" }); break;
          }
          if (JSON.stringify(timing(fightOf(actor))) !== clockBefore) {
            lines.push({ applied: false, reason: "clockChanged" });
            globalThis.ui?.notifications?.warn("Virulent Poison's turn changed during its tick. Review that tick before resolving it manually.");
            break;
          }
          if (plan.damage && !immune(actor) && !effect.disabled && effect.active !== false
            && (actor.type !== "npc" || actor.system?.health?.value > 0)) {
            const source = resolve(state.sourceUuid);
            lines.push(...await strikeFromArea({ actor, caster: present(source) ? source : null,
              spell: { name: VIRULENT.name, school: "nature", takesSpellpower: false, feature: true, isSpell: false },
              damage: plan.damage }));
          }
          if (gmHere() && held(actor, effect) && immune(actor)) {
            await effect.delete(); break;
          }
        } catch (error) {
          console.warn("azeroth-rpg | Virulent Poison tick interrupted", error);
          lines.push({ applied: false, reason: "writeUncertain" });
          globalThis.ui?.notifications?.warn("Virulent Poison's damage could not be confirmed. Review Health and the remaining ticks before resolving it manually.");
          break;
        }
      }
    }
    return lines;
  });
}

export async function advanceVirulentWorld() {
  if (!gmHere() || !Number.isFinite(game.time?.worldTime)) return [];
  const lines = [];
  for (const actor of carriers()) lines.push(...await advanceVirulentPoison(actor));
  return lines;
}

export function registerVirulentPoisonHooks() {
  let pending = false;
  const sweep = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(async () => {
      pending = false;
      try { await advanceVirulentWorld(); }
      catch (error) { console.warn("azeroth-rpg | Virulent Poison lifecycle", error); }
    });
  };
  for (const hook of ["ready", "updateWorldTime", "updateUser", "deleteActor", "deleteToken", "deleteScene", "deleteCombat", "createCombatant", "deleteCombatant", "updateCombat"])
    Hooks.on(hook, sweep);
  Hooks.on("updateActiveEffect", (effect, changed) => {
    if (stateOf(effect) && ("statuses" in changed || "disabled" in changed || "flags.azeroth-rpg.value" in changed)) sweep();
  });
}
