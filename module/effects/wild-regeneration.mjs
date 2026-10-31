/** Active-GM writer for the Preserver's paid, temporary self-heal. */
import { WILD_REGENERATION_FLAG as FLAG, WILD_REGENERATION as SPEC,
  validWildRegeneration, wildRegenerationClock, wildRegenerationPulse,
  wildRegenerationEffect } from "../rules/wild-regeneration.mjs";
import { strikeFromArea } from "./area-strikes.mjs";

const pending = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const present = actor => actor?.documentName === "Actor" && resolve(actor.uuid) === actor;
const stateOf = effect => effect?.flags?.["azeroth-rpg"]?.[FLAG];
const held = (actor, effect) => present(actor) && actor.effects.get(effect.id) === effect;
const alive = actor => actor.system?.health?.value > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const path = `flags.azeroth-rpg.${FLAG}`;
const fightOf = actor => (game.combats?.contents ?? []).find(c => c.started && c.getCombatantsByActor(actor)?.length) ?? null;
const clockArgs = combat => combat ? { combatUuid: combat.uuid, clock: { round: combat.round, turn: combat.turn } }
  : { time: game.time?.worldTime };
const warn = () => ui.notifications?.warn("Wild Regeneration could not be fully resolved. Check Health and the effect's remaining pulses before resolving it manually.");

/** The caller seeds before payment, pays once, then supplies a live validator.
 * This door never pays again or restarts an existing effect. */
export async function layWildRegeneration({ actor, state, valid } = {}) {
  if (!gmHere() || !present(actor) || !alive(actor) || pending.has(actor.uuid)
    || typeof valid !== "function" || !valid() || !validWildRegeneration(state)
    || state.actorUuid !== actor.uuid || state.remaining !== SPEC.ticks) return { ok: false, reason: "unavailable" };
  pending.add(actor.uuid);
  try {
    if ([...actor.effects].some(stateOf)) return { ok: false, reason: "existing" };
    const current = wildRegenerationClock(state, clockArgs(fightOf(actor)));
    if (!current || !same(current, state)) return { ok: false, reason: "clock" };
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [wildRegenerationEffect(state)]);
    if (!effect) return { ok: false, reason: "notCreated" };
    if (!gmHere() || !valid() || !alive(actor) || !held(actor, effect) || !same(stateOf(effect), state)) {
      // A created carrier is reported, never blindly retried after payment.
      if (gmHere() && held(actor, effect) && !alive(actor)) await effect.delete();
      return { ok: false, reason: "changedDuringWrite", effectId: effect.id };
    }
    return { ok: true, effectId: effect.id };
  } finally { pending.delete(actor.uuid); }
}

function carriers() {
  const actors = new Map();
  for (const actor of game.actors ?? []) actors.set(actor.uuid, actor);
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (token.actor) actors.set(token.actor.uuid, token.actor);
  return [...actors.values()];
}

async function advance(actor, combat = null) {
  if (!gmHere() || !present(actor) || pending.has(actor.uuid)) return [];
  if (combat && (!combat.started || combat.combatant?.actor !== actor || fightOf(actor) !== combat)) return [];
  pending.add(actor.uuid);
  const lines = [];
  try {
    for (const effect of [...actor.effects].filter(stateOf)) {
      for (let i = 0; i < (combat ? 1 : SPEC.ticks) && gmHere() && held(actor, effect); i++) {
        const state = stateOf(effect);
        if (!validWildRegeneration(state) || state.actorUuid !== actor.uuid || !alive(actor)) {
          await effect.delete(); break;
        }
        const governing = fightOf(actor);
        const moved = wildRegenerationClock(state, clockArgs(governing));
        if (!moved) break;
        if (!same(moved, state)) { await effect.update({ [path]: moved }); break; }
        if ((!combat && governing) || (combat && governing !== combat)) break;
        const clock = clockArgs(combat);
        const plan = wildRegenerationPulse(state, { actorUuid: actor.uuid, health: actor.system.health,
          disabled: effect.disabled === true || effect.active === false, ...clock });
        if (plan.action === "end") { await effect.delete(); break; }
        if (plan.action === "none") break;
        // The persisted countdown is the claim. Failed or uncertain healing is
        // not retried, even if deletion of the final carrier later fails.
        await effect.update({ [path]: plan.next });
        if (!gmHere() || !held(actor, effect) || !same(stateOf(effect), plan.next)) break;
        try {
          if (plan.heal > 0 && alive(actor) && effect.disabled !== true && effect.active !== false
            && fightOf(actor) === governing && same(clockArgs(combat), clock)) {
            lines.push(...await strikeFromArea({ actor, caster: actor,
              spell: { name: SPEC.name, school: "nature", feature: true, isSpell: false, takesSpellpower: false },
              heal: plan.heal }));
          }
        } catch { warn(); }
        if (!gmHere() || !held(actor, effect)) break;
        if (plan.endsAfterHeal || !alive(actor)) { await effect.delete(); break; }
      }
    }
  } finally { pending.delete(actor.uuid); }
  return lines;
}

export async function advanceWildRegeneration(actor, combat) { return advance(actor, combat); }
export async function advanceWildRegenerationWorld() {
  const lines = [];
  if (!gmHere() || !Number.isFinite(game.time?.worldTime)) return lines;
  for (const actor of carriers()) lines.push(...await advance(actor));
  return lines;
}

export async function cleanWildRegenerationEffects() {
  if (!gmHere()) return;
  for (const actor of carriers()) {
    if (!gmHere() || !present(actor) || pending.has(actor.uuid)) continue;
    pending.add(actor.uuid);
    try {
      for (const effect of [...actor.effects].filter(stateOf)) {
        if (!gmHere() || !held(actor, effect)) break;
        const state = stateOf(effect);
        if (!validWildRegeneration(state) || state.actorUuid !== actor.uuid || !alive(actor)) {
          await effect.delete(); continue;
        }
        const next = wildRegenerationClock(state, clockArgs(fightOf(actor)));
        if (next && !same(next, state)) await effect.update({ [path]: next });
      }
    } finally { pending.delete(actor.uuid); }
  }
}

export function registerWildRegenerationHooks() {
  const clean = () => { void cleanWildRegenerationEffects().catch(warn); };
  for (const hook of ["ready", "deleteActor", "deleteToken", "deleteScene", "deleteCombat", "createCombatant", "deleteCombatant", "updateActor"]) Hooks.on(hook, clean);
  Hooks.on("updateCombat", (_, changed) => { if ("round" in changed || "started" in changed) clean(); });
  Hooks.on("updateWorldTime", () => {
    void cleanWildRegenerationEffects().then(advanceWildRegenerationWorld).catch(warn);
  });
}
