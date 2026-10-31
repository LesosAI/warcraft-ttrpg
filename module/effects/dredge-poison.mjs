/** Active-GM lifecycle for Dredge Worm's biological poison doses. */
import { DREDGE_POISON_FLAG, DREDGE_POISONS, dredgePoisonClock, dredgePoisonEffect,
  dredgePoisonPulse, seedDredgePoison, validDredgePoison } from "../rules/dredge-poison.mjs";
import { strikeFromArea } from "./area-strikes.mjs";

const pending = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const present = actor => actor?.documentName === "Actor" && resolve(actor.uuid) === actor;
const stateOf = effect => effect?.flags?.["azeroth-rpg"]?.[DREDGE_POISON_FLAG];
const held = (actor, effect) => present(actor) && actor.effects.get(effect.id) === effect;
const poisoned = effect => [...(effect.statuses ?? [])].includes("poisoned")
  && (effect.flags?.["azeroth-rpg"]?.value ?? 1) > 0;
const immune = actor => (actor.system?.conditionImmunities ?? []).includes("poisoned");
const fightOf = actor => (game.combats?.contents ?? []).find(c => c.started && c.getCombatantsByActor(actor)?.length) ?? null;
const clockArgs = combat => combat ? { combatUuid: combat.uuid, clock: { round: combat.round, turn: combat.turn } }
  : { time: game.time?.worldTime };
const warn = key => ui.notifications?.warn(game.i18n.localize(`AZEROTH.DredgePoison.${key}`));
const statePath = `flags.azeroth-rpg.${DREDGE_POISON_FLAG}`;

/** Called after payment and the failed resistance Test. The activation
 * validator pins source, range, authority and encounter across awaited work. */
export async function layDredgePoison({ source, target, kind, valid } = {}) {
  if (!gmHere() || !present(source) || !present(target) || typeof valid !== "function" || !valid()
    || pending.has(target.uuid)) return { ok: false, reason: "unavailable" };
  if (immune(target)) return { ok: true, immune: true };
  pending.add(target.uuid);
  try {
    const state = seedDredgePoison({ kind, sourceUuid: source.uuid, targetUuid: target.uuid,
      ...clockArgs(fightOf(target)), existing: [...target.effects].map(stateOf).filter(Boolean) });
    if (!state) return { ok: false, reason: "alreadyAffectedOrInvalidClock" };
    const data = dredgePoisonEffect(state);
    const [effect] = await target.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!effect) return { ok: false, reason: "notCreated" };
    if (!gmHere() || !valid()) return { ok: false, reason: "changedDuringWrite", effectId: effect.id };
    if (!held(target, effect) || !poisoned(effect) || immune(target)) {
      if (held(target, effect)) await effect.delete();
      return { ok: false, reason: "changedTarget" };
    }
    const next = dredgePoisonClock(state, clockArgs(fightOf(target)));
    if (next && next !== state && held(target, effect)) await effect.update({ [statePath]: next });
    return { ok: true, effectId: effect.id };
  } finally { pending.delete(target.uuid); }
}

function carriers() {
  const actors = new Map();
  for (const actor of game.actors ?? []) actors.set(actor.uuid, actor);
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (token.actor) actors.set(token.actor.uuid, token.actor);
  return [...actors.values()];
}

async function advance(actor, combat = null) {
  if (!gmHere() || !present(actor) || pending.has(actor.uuid)) return [];
  if (combat && (!combat.started || combat.combatant?.actor?.uuid !== actor.uuid || fightOf(actor) !== combat)) return [];
  pending.add(actor.uuid);
  const lines = [];
  try {
    for (const effect of [...actor.effects].filter(stateOf)) {
      // No catch-up can exceed the largest authored dose, even on a huge jump.
      for (let i = 0; i < (combat ? 1 : 3) && gmHere() && held(actor, effect); i++) {
        const state = stateOf(effect);
        if (!validDredgePoison(state) || state.targetUuid !== actor.uuid || !poisoned(effect) || immune(actor)) {
          await effect.delete(); break;
        }
        const governing = fightOf(actor);
        const nextClock = dredgePoisonClock(state, clockArgs(governing));
        if (nextClock && nextClock !== state) {
          await effect.update({ [statePath]: nextClock }); break;
        }
        if ((!combat && governing) || (combat && governing !== combat)) break;
        const plan = dredgePoisonPulse(state, { targetUuid: actor.uuid, poisoned: poisoned(effect),
          disabled: effect.disabled === true || effect.active === false, ...clockArgs(combat) });
        if (plan.action === "end") { await effect.delete(); break; }
        if (plan.next !== state) await effect.update({ [statePath]: plan.next });
        if (plan.action === "none") break;
        // Claim before damage. A rejected/uncertain damage write is never retried.
        try {
          if (gmHere() && held(actor, effect) && poisoned(effect) && !immune(actor)
            && effect.disabled !== true && effect.active !== false
            && (actor.type !== "npc" || actor.system?.health?.value > 0)) {
            const source = resolve(state.sourceUuid);
            lines.push(...await strikeFromArea({ actor, caster: present(source) ? source : null,
              spell: { name: DREDGE_POISONS[state.kind].name, school: "nature", takesSpellpower: false,
                feature: true, isSpell: false }, damage: plan.damage }));
          }
        } catch { warn("DamageFailed"); }
        finally {
          if (gmHere() && held(actor, effect)) {
            if (plan.endsAfterDamage || !poisoned(effect) || immune(actor)) await effect.delete();
            else {
              const next = dredgePoisonClock(stateOf(effect), clockArgs(fightOf(actor)));
              if (next && next !== stateOf(effect)) await effect.update({ [statePath]: next });
            }
          }
        }
      }
    }
  } finally { pending.delete(actor.uuid); }
  return lines;
}

export async function advanceDredgePoison(actor, combat) { return advance(actor, combat); }
export async function advanceDredgePoisonWorld() {
  const lines = [];
  if (!gmHere() || !Number.isFinite(game.time?.worldTime)) return lines;
  for (const actor of carriers()) lines.push(...await advance(actor));
  return lines;
}

export async function cleanDredgePoisonEffects() {
  if (!gmHere()) return;
  for (const actor of carriers()) {
    if (!gmHere() || !present(actor) || pending.has(actor.uuid)) continue;
    pending.add(actor.uuid);
    try {
      for (const effect of [...actor.effects].filter(stateOf)) {
        if (!gmHere() || !held(actor, effect)) break;
        const state = stateOf(effect);
        if (!validDredgePoison(state) || state.targetUuid !== actor.uuid || !poisoned(effect) || immune(actor)) {
          await effect.delete(); continue;
        }
        const next = dredgePoisonClock(state, clockArgs(fightOf(actor)));
        if (next && next !== state) await effect.update({ [statePath]: next });
      }
    } finally { pending.delete(actor.uuid); }
  }
}

export function registerDredgePoisonHooks() {
  const clean = () => { void cleanDredgePoisonEffects().catch(() => warn("TimingFailed")); };
  for (const hook of ["ready", "deleteActor", "deleteToken", "deleteScene", "deleteCombat", "createCombatant", "deleteCombatant"]) Hooks.on(hook, clean);
  Hooks.on("updateCombat", (_, changed) => { if ("round" in changed || "started" in changed) clean(); });
  Hooks.on("updateActiveEffect", (effect, changed) => {
    if (stateOf(effect) && ("statuses" in changed || "flags.azeroth-rpg.value" in changed)) clean();
  });
  Hooks.on("updateWorldTime", () => {
    void cleanDredgePoisonEffects().then(advanceDredgePoisonWorld).catch(() => warn("TimingFailed"));
  });
}
