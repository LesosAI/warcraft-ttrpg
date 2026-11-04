import { TOXIC_FLAG, TOXIC_POISONS, toxicPoisonDose, toxicPoisonEffect,
  validToxicPoison, toxicPoisonClock, toxicPoisonPulse, confirmToxicPoisonTick, toxicPoisonDamage, toxicStacks } from "../rules/toxic-horror.mjs";
import { dealtHalvedBy } from "../rules/legacy-uses.mjs";
import { creaturePoisonPatch } from "../rules/creature-poisons.mjs";
import { downedTarget } from "../rules/poison-catchup.mjs";

/** A guard against a runaway loop; an hourly catch-up has no cap of its own (D12 R4). */
const CATCH_UP_GUARD = 48;

const queues = new Map();
const stateOf = effect => effect.flags?.["azeroth-rpg"]?.[TOXIC_FLAG];
const valueOf = effect => effect.flags?.["azeroth-rpg"]?.value ?? 1;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const present = actor => {
  try { return actor?.documentName === "Actor" && fromUuidSync(actor.uuid) === actor; }
  catch { return false; }
};
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const immune = actor => (actor.system?.conditionImmunities ?? []).includes("poisoned");
const timing = actor => {
  const combat = (game.combats?.contents ?? []).find(c => c.started && c.getCombatantsByActor(actor)?.length);
  return { time: game.time?.worldTime, combatUuid: combat?.uuid ?? null,
    clock: combat ? { round: combat.round, turn: combat.turn } : null };
};

/** Caller must durably claim this exposure after its failed resistance Test.
 * A failed/uncertain result must remain claimed for reconciliation, never retried
 * with a new exposure ID. This helper is not a public player query. */
export async function layToxicPoison({ source, target, kind, exposureId, valid } = {}) {
  const previous = queues.get(target?.uuid) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    const current = () => gmHere() && present(source) && present(target) && target.system?.health?.value > 0;
    const check = async () => current() && typeof valid === "function" && await valid() && current();
    if (!await check()) return { ok: false, reason: "unavailable" };
    if (immune(target)) return { ok: true, applied: false, reason: "immune" };
    const carriers = () => [...target.effects].filter(e => stateOf(e)?.kind === kind);
    const matches = carriers();
    if (matches.length > 1) return { ok: false, reason: "conflictingCarriers" };
    const existing = matches[0], stamp = timing(target);
    const prior = existing ? structuredClone(stateOf(existing)) : null;
    const value = existing ? valueOf(existing) : 0;
    if (existing && (existing.disabled || existing.isSuppressed))
      return { ok: false, reason: "reconcile" };
    const dose = toxicPoisonDose({ kind, sourceUuid: source.uuid, targetUuid: target.uuid,
      exposureId, existing: prior, currentValue: value, ...stamp });
    if (!dose) return { ok: false, reason: "reconcile" };
    if (!dose.changed) return { ok: true, applied: false, reason: dose.reason, effectId: existing.id };
    const unchanged = () => same(stamp, timing(target)) && !immune(target) && (existing
      ? carriers().length === 1 && target.effects.get(existing.id) === existing
        && same(stateOf(existing), prior) && valueOf(existing) === value && !existing.disabled && !existing.isSuppressed
      : carriers().length === 0);
    if (!await check() || !unchanged()) return { ok: false, reason: "changed" };
    try {
      let effect = existing;
      if (effect) await effect.update({ [`flags.azeroth-rpg.${TOXIC_FLAG}`]: dose.state,
        "flags.azeroth-rpg.value": dose.value, origin: source.uuid, statuses: ["poisoned"],
        ...creaturePoisonPatch({ value: dose.value, damage: TOXIC_POISONS[kind].damage * dose.value, statuses: ["poisoned"] }) });
      else [effect] = await target.createEmbeddedDocuments("ActiveEffect", [{ ...toxicPoisonEffect(dose,
        { now: stamp.time ?? 0, inFight: stamp.combatUuid !== null }),
        transfer: false, start: { time: stamp.time },
        // The poison clock owns expiry; pending writes must survive core cleanup.
        duration: { value: null, units: "seconds", expiry: null } }]);
      if (!effect || !await check() || !same(stamp, timing(target)) || immune(target)
        || target.effects.get(effect.id) !== effect || carriers().length !== 1
        || !same(stateOf(effect), dose.state) || valueOf(effect) !== dose.value
        || effect.disabled || effect.isSuppressed || ![...(effect.statuses ?? [])].includes("poisoned"))
        return { ok: false, reason: "writeUnconfirmed" };
      return { ok: true, applied: true, effectId: effect.id };
    } catch {
      return { ok: false, reason: "writeUncertain" };
    }
  });
  queues.set(target?.uuid, pending);
  try { return await pending; }
  finally { if (queues.get(target?.uuid) === pending) queues.delete(target?.uuid); }
}

/** Combat callers must invoke this at the victim's turn start. World sweeps
 * catch up every hourly tick that is due, each separately mitigated, never pooled damage. */
export async function advanceToxicPoison(actor, combat = null) {
  const previous = queues.get(actor?.uuid) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    const lines = [];
    if (!gmHere() || !present(actor)) return lines;
    if (combat && (!combat.started || combat.combatant?.actor !== actor || timing(actor).combatUuid !== combat.uuid)) return lines;
    const effects = [...actor.effects].filter(stateOf);
    if (new Set(effects.map(e => stateOf(e).kind)).size !== effects.length) return lines;
    for (const effect of effects) {
      for (let i = 0; i < (combat ? 1 : CATCH_UP_GUARD); i++) {
        // A catch-up stops at a target with no Health left to lose (rules/poison-catchup.mjs).
        if (!combat && downedTarget(actor)) break;
        const held = () => gmHere() && present(actor) && actor.effects.get(effect.id) === effect;
        if (!held()) break;
        const prior = structuredClone(stateOf(effect)), stamp = timing(actor), value = valueOf(effect);
        // The dose is the poison's state; the value shown is what is left of it after shedding.
        const stacks = toxicStacks(prior);
        // Preserve invalid or uncertain state for reconciliation.
        if (!validToxicPoison(prior) || prior.targetUuid !== actor.uuid || prior.pending) break;
        const unchanged = () => held() && same(stateOf(effect), prior) && valueOf(effect) === value && same(stamp, timing(actor));
        try {
          if (immune(actor)) {
            if (unchanged()) await effect.delete();
            break;
          }
          const moved = toxicPoisonClock(prior, stamp);
          if (!moved) break;
          if (!same(moved, prior)) {
            if (unchanged()) await effect.update({ [`flags.azeroth-rpg.${TOXIC_FLAG}`]: moved });
            break;
          }
          if ((combat?.uuid ?? null) !== stamp.combatUuid) break;
          const disabled = () => effect.disabled || effect.active === false || effect.isSuppressed
            || !(actor.system?.health?.value > 0);
          const plan = toxicPoisonPulse(prior, { targetUuid: actor.uuid, disabled: disabled(), ...stamp });
          if (!["tick", "advance"].includes(plan.action) || !unchanged()) break;
          // The beat lays the dose's stacks again (D12 R1), in the same write as the claim.
          const relay = plan.action === "tick"
            ? { statuses: ["poisoned"], "flags.azeroth-rpg.value": stacks,
              ...creaturePoisonPatch({ value: stacks, damage: TOXIC_POISONS[prior.kind].damage * stacks, statuses: ["poisoned"] }) } : {};
          await effect.update({ [`flags.azeroth-rpg.${TOXIC_FLAG}`]: plan.next, ...relay });
          const claimed = () => held() && same(stateOf(effect), plan.next);
          if (!claimed() || !same(stamp, timing(actor)) || valueOf(effect) !== (plan.action === "tick" ? stacks : value)) break;
          if (plan.action === "tick" && !disabled() && !immune(actor)) {
            let source;
            try { source = fromUuidSync(prior.sourceUuid); } catch { source = null; }
            const by = present(source) ? source : null;
            const result = toxicPoisonDamage(actor.system, plan.damage.rating, { dealtHalved: dealtHalvedBy(by) });
            if (result.damage > 0) await actor.applyDamage(result.damage, {
              struck: true, attack: false, spell: false, location: "body", type: "nature", by,
              wardTook: result.wardTook ?? 0, parts: result.parts ?? null
            });
            lines.push(game.i18n.format(result.immune ? "AZEROTH.Combat.AreaTickImmune" : "AZEROTH.Combat.AreaTick",
              { name: actor.name, amount: result.damage, type: game.i18n.localize("AZEROTH.School.Nature"),
                spell: TOXIC_POISONS[prior.kind].name }));
          }
          if (!claimed()) break;
          const completed = plan.action === "tick" ? confirmToxicPoisonTick(plan.next, plan.key) : plan.next;
          await effect.update({ [`flags.azeroth-rpg.${TOXIC_FLAG}`]: completed });
          if (!held() || !same(stateOf(effect), completed)) break;
        } catch {
          // Never replay an uncertain damage write. Its saved pending key stays
          // on the carrier until the GM reconciles it.
          break;
        }
      }
    }
    return lines;
  });
  queues.set(actor?.uuid, pending);
  try { return await pending; }
  finally { if (queues.get(actor?.uuid) === pending) queues.delete(actor?.uuid); }
}

export async function sweepToxicPoison() {
  if (!gmHere() || !Number.isFinite(game.time?.worldTime)) return [];
  const actors = new Map();
  for (const actor of game.actors ?? []) actors.set(actor.uuid, actor);
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? [])
    if (token.actor) actors.set(token.actor.uuid, token.actor);
  const lines = [];
  for (const actor of actors.values()) if ([...(actor.effects ?? [])].some(stateOf))
    lines.push(...await advanceToxicPoison(actor));
  return lines;
}

/** Sweeps synchronize clocks but never invent combat turns. */
export function registerToxicPoisonHooks() {
  let pending = false;
  const sweep = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(async () => {
      pending = false;
      try { await sweepToxicPoison(); }
      catch (error) { console.warn("azeroth-rpg | Toxic Horror poison lifecycle", error); }
    });
  };
  for (const hook of ["ready", "updateWorldTime", "updateUser", "deleteCombat", "createCombatant", "deleteCombatant"])
    Hooks.on(hook, sweep);
  Hooks.on("updateCombat", (_combat, changed) => {
    if ("round" in changed || "started" in changed) sweep();
  });
  Hooks.on("updateActiveEffect", effect => { if (stateOf(effect)) sweep(); });
}
