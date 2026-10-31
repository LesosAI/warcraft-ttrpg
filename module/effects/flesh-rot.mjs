import { FLESH_ROT_FLAG as FLAG, validFleshRot, fleshRotStart, fleshRotPulse, fleshRotDamage } from "../rules/flesh-rot.mjs";
import { dealtHalvedBy } from "../rules/legacy-uses.mjs";

const path = `flags.azeroth-rpg.${FLAG}`, queues = new Map();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const present = actor => actor?.documentName === "Actor" && resolve(actor.uuid) === actor;
const stateOf = effect => effect?.flags?.["azeroth-rpg"]?.[FLAG];
const held = (actor, effect) => present(actor) && actor.effects.get(effect.id) === effect;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fightOf = actor => (game.combats?.contents ?? []).find(c => c.started && c.getCombatantsByActor(actor)?.length) ?? null;
const timing = actor => { const fight = fightOf(actor); return { time: game.time?.worldTime,
  combatUuid: fight?.uuid ?? null, clock: fight ? { round: fight.round, turn: fight.turn } : null }; };
const warn = () => globalThis.ui?.notifications?.warn(game.i18n.localize("AZEROTH.FleshRot.TickInterrupted"));

async function write(uuid, run) {
  const previous = queues.get(uuid) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(run);
  queues.set(uuid, pending);
  try { return await pending; }
  finally { if (queues.get(uuid) === pending) queues.delete(uuid); }
}

/** The attack's Apply receipt must be claimed before entering this function. */
export function layFleshRot({ source, target, castId, valid } = {}) {
  return write(target?.uuid, async () => {
    const current = () => gmHere() && present(source) && present(target) && target.system?.health?.value > 0;
    const check = async () => current() && typeof valid === "function" && await valid() && current();
    if (!await check()) return { ok: false, reason: "unavailable" };
    const stamp = timing(target);
    const state = fleshRotStart({ sourceUuid: source.uuid, targetUuid: target.uuid, castId, ...stamp });
    if (!state) return { ok: false, reason: "invalidCast" };
    const carriers = [...target.effects].filter(stateOf);
    if (carriers.length > 1) return { ok: false, reason: "conflictingCarriers" };
    const existing = carriers[0];
    if (existing) {
      const prior = stateOf(existing);
      if (!validFleshRot(prior) || prior.targetUuid !== target.uuid || prior.pending)
        return { ok: false, reason: "reconcile" };
      if (stamp.time < prior.expiresAt) return { ok: true, applied: false, reason: "alreadyWounded", effectId: existing.id };
      await existing.delete();
    }
    if (!await check() || !same(stamp, timing(target)) || [...target.effects].some(stateOf))
      return { ok: false, reason: "changed" };
    try {
      const [effect] = await target.createEmbeddedDocuments("ActiveEffect", [{
        name: game.i18n.localize("AZEROTH.FleshRot.Name"), img: "icons/svg/blood.svg", origin: source.uuid,
        transfer: false, disabled: false, statuses: [], system: { changes: [] },
        // The flag owns the fixed 12-second deadline. Core auto-deletes timed
        // effects here; keeping expiry manual preserves an uncertain tick for review.
        start: { time: stamp.time }, duration: { value: null, units: "seconds", expiry: null },
        description: game.i18n.localize("AZEROTH.FleshRot.Description"),
        flags: { "azeroth-rpg": { [FLAG]: state } }
      }]);
      if (!effect || !await check() || !held(target, effect) || !same(stateOf(effect), state))
        return { ok: false, reason: "writeUnconfirmed" };
      return { ok: true, applied: true, effectId: effect.id };
    } catch (error) {
      console.warn("azeroth-rpg | Flesh Rot application", error);
      return { ok: false, reason: "writeUncertain" };
    }
  });
}

/** Only the combat turn-start caller may tick. World sweeps expire carriers
 * but never synthesize turns or catch up missed damage. */
export function advanceFleshRot(actor, combat = null) {
  return write(actor?.uuid, async () => {
    const lines = [];
    if (!gmHere() || !present(actor)) return lines;
    if (combat && (!combat.started || combat.combatant?.actor !== actor || fightOf(actor) !== combat)) return lines;
    const carriers = [...actor.effects].filter(stateOf);
    if (carriers.length > 1) { warn(); return lines; }
    const effect = carriers[0];
    if (!effect) return lines;
    const state = structuredClone(stateOf(effect)), stamp = timing(actor);
    if (!validFleshRot(state) || state.targetUuid !== actor.uuid || state.pending) { warn(); return lines; }
    const plan = fleshRotPulse(state, { targetUuid: actor.uuid, time: stamp.time,
      combatUuid: combat?.uuid ?? null, clock: combat ? stamp.clock : null,
      disabled: effect.disabled === true || effect.active === false || effect.isSuppressed === true || !(actor.system?.health?.value > 0) });
    const unchanged = () => gmHere() && held(actor, effect) && same(stateOf(effect), state);
    try {
      if (plan.action === "end") { if (unchanged()) await effect.delete(); return lines; }
      if (!["tick", "advance"].includes(plan.action) || !unchanged()) return lines;
      await effect.update({ [path]: plan.next });
      const claimed = () => gmHere() && held(actor, effect) && same(stateOf(effect), plan.next);
      if (!claimed() || !same(stamp, timing(actor))) { warn(); return lines; }
      if (plan.action === "advance") return lines;
      // A disabled or removed carrier must not deal damage after an awaited write.
      if (effect.disabled || effect.active === false || effect.isSuppressed || !(actor.system?.health?.value > 0)) {
        await effect.update({ [path]: { ...plan.next, pending: null } }); return lines;
      }
      const source = resolve(state.sourceUuid), by = present(source) ? source : null;
      const result = fleshRotDamage(actor.system, { dealtHalved: dealtHalvedBy(by) });
      if (result.damage > 0) await actor.applyDamage(result.damage, {
        struck: true, attack: false, spell: false, location: "body", type: "physical", by
      });
      if (!claimed()) { warn(); return lines; }
      const completed = { ...plan.next, pending: null };
      await effect.update({ [path]: completed });
      if (!gmHere() || !held(actor, effect) || !same(stateOf(effect), completed)) { warn(); return lines; }
      lines.push(game.i18n.format("AZEROTH.FleshRot.Tick", { name: actor.name, amount: result.damage }));
    } catch (error) { console.warn("azeroth-rpg | Flesh Rot tick interrupted", error); warn(); }
    return lines;
  });
}

export async function sweepFleshRot() {
  if (!gmHere() || !Number.isFinite(game.time?.worldTime)) return;
  const actors = [...game.actors, ...[...game.scenes].flatMap(scene => [...scene.tokens].map(token => token.actor))];
  const unique = new Map(actors.filter(actor => actor?.uuid && [...(actor.effects ?? [])].some(stateOf)).map(actor => [actor.uuid, actor]));
  for (const actor of unique.values()) await advanceFleshRot(actor);
}

export function registerFleshRotHooks() {
  let pending = false;
  const sweep = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(async () => {
      pending = false;
      try { await sweepFleshRot(); }
      catch (error) { console.warn("azeroth-rpg | Flesh Rot lifecycle", error); warn(); }
    });
  };
  for (const hook of ["ready", "updateWorldTime", "updateUser", "deleteCombat", "createCombatant", "deleteCombatant"])
    Hooks.on(hook, sweep);
}
