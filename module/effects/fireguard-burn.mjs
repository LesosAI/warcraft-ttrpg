import { FIREGUARD } from "../rules/fireguard.mjs";
import { validFireguardBurn, fireguardBurnStart, fireguardBurnClock, fireguardBurnPulse } from "../rules/fireguard-burn.mjs";
import { strikeFromArea } from "./area-strikes.mjs";

const FLAG = "fireguardBurn", path = `flags.azeroth-rpg.${FLAG}`;
const queues = new Map();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const present = actor => actor?.documentName === "Actor" && resolve(actor.uuid) === actor;
const stateOf = effect => effect?.flags?.["azeroth-rpg"]?.[FLAG];
const held = (actor, effect) => present(actor) && actor.effects.get(effect.id) === effect;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fightOf = actor => (game.combats?.contents ?? []).find(c => c.started && c.getCombatantsByActor(actor)?.length) ?? null;
const timing = fight => ({ time: game.time?.worldTime, combatUuid: fight?.uuid ?? null,
  clock: fight ? { round: fight.round, turn: fight.turn } : null });
const warnTick = () => globalThis.ui?.notifications?.warn(game.i18n.localize("AZEROTH.Fireguard.TickInterrupted"));

async function write(uuid, run) {
  const previous = queues.get(uuid) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(run);
  queues.set(uuid, pending);
  try { return await pending; }
  finally { if (queues.get(uuid) === pending) queues.delete(uuid); }
}

/** The cast workflow must durably claim delivery BEFORE calling this function.
 * That receipt survives removal of the burn and prevents a cast being replayed.
 */
export function layFireguardBurn({ source, target, castId, valid } = {}) {
  return write(target?.uuid, async () => {
    const check = () => gmHere() && present(source) && present(target) && typeof valid === "function" && valid();
    if (!check()) return { ok: false, reason: "unavailable" };
    const carriers = [...target.effects].filter(stateOf);
    if (carriers.length > 1) return { ok: false, reason: "conflictingCarriers" };
    let effect = carriers[0];
    if (effect && (!validFireguardBurn(stateOf(effect)) || effect.disabled || effect.active === false))
      return { ok: false, reason: "inactiveCarrier" };
    if (effect && stateOf(effect).castId === castId) return { ok: true, duplicate: true, effectId: effect.id };
    const state = fireguardBurnStart({ sourceUuid: source.uuid, targetUuid: target.uuid, castId, ...timing(fightOf(target)) });
    if (!state) return { ok: false, reason: "invalidCast" };
    try {
      if (effect) await effect.update({ [path]: state, origin: source.uuid });
      else [effect] = await target.createEmbeddedDocuments("ActiveEffect", [{
        name: FIREGUARD.immolate.name, img: "icons/magic/fire/flame-burning-creature-skeleton.webp",
        origin: source.uuid, transfer: false, disabled: false,
        duration: { value: null, units: "seconds", expiry: null },
        flags: { "azeroth-rpg": { [FLAG]: state } }
      }]);
      if (!effect || !check() || !held(target, effect) || !same(stateOf(effect), state))
        return { ok: false, reason: "writeUnconfirmed" };
      return { ok: true, effectId: effect.id };
    } catch (error) {
      console.warn("azeroth-rpg | Fireguard burn application", error);
      return { ok: false, reason: "writeUncertain" };
    }
  });
}

/** One claimed hit at a time; removing the carrier cancels future damage. */
export function advanceFireguardBurn(actor, combat = null) {
  return write(actor?.uuid, async () => {
    const lines = [];
    if (!gmHere() || !present(actor)) return lines;
    if (combat && (!combat.started || combat.combatant?.actor !== actor || fightOf(actor) !== combat)) return lines;
    const carriers = [...actor.effects].filter(stateOf);
    if (carriers.length > 1) return [{ applied: false, reason: "conflictingCarriers" }];
    for (const effect of carriers) {
      for (let n = 0; n < (combat ? 1 : FIREGUARD.immolate.ticks) && gmHere() && held(actor, effect); n++) {
        try {
          const state = stateOf(effect);
          if (!validFireguardBurn(state) || state.targetUuid !== actor.uuid) { await effect.delete(); break; }
          const governing = fightOf(actor);
          const nextClock = fireguardBurnClock(state, timing(governing));
          if (!nextClock) break;
          if (nextClock !== state) { await effect.update({ [path]: nextClock }); break; }
          if ((!combat && governing) || (combat && governing !== combat)) break;
          const plan = fireguardBurnPulse(state, { targetUuid: actor.uuid, ...timing(combat),
            disabled: effect.disabled === true || effect.active === false });
          if (plan.action === "end") { await effect.delete(); break; }
          if (plan.action === "none") break;
          const before = timing(governing);
          await effect.update({ [path]: plan.next });
          if (!gmHere() || !held(actor, effect) || !same(stateOf(effect), plan.next)) {
            warnTick();
            lines.push({ applied: false, reason: "claimUnconfirmed" }); break;
          }
          if (!same(before, timing(fightOf(actor)))) {
            warnTick();
            lines.push({ applied: false, reason: "clockChanged" }); break;
          }
          if (plan.damage && !effect.disabled && effect.active !== false
            && (actor.type !== "npc" || actor.system?.health?.value > 0)) {
            const source = resolve(state.sourceUuid);
            lines.push(...await strikeFromArea({ actor, caster: present(source) ? source : null,
              spell: { name: FIREGUARD.immolate.name, school: "fire", takesSpellpower: false, feature: true, isSpell: false },
              damage: plan.damage }));
          }
          if (gmHere() && held(actor, effect) && plan.endsAfterDamage) { await effect.delete(); break; }
        } catch (error) {
          console.warn("azeroth-rpg | Fireguard burn tick interrupted", error);
          warnTick();
          lines.push({ applied: false, reason: "writeUncertain" }); break;
        }
      }
    }
    return lines;
  });
}

export async function advanceFireguardWorld() {
  if (!gmHere() || !Number.isFinite(game.time?.worldTime)) return [];
  const actors = [...game.actors, ...[...game.scenes].flatMap(scene => [...scene.tokens].map(token => token.actor))];
  const carriers = new Map(actors.filter(actor => actor?.uuid && [...(actor.effects ?? [])].some(stateOf))
    .map(actor => [actor.uuid, actor]));
  const lines = [];
  for (const actor of carriers.values()) lines.push(...await advanceFireguardBurn(actor));
  return lines;
}

export function registerFireguardBurnHooks() {
  let pending = false;
  const sweep = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(async () => {
      pending = false;
      try { await advanceFireguardWorld(); }
      catch (error) { console.warn("azeroth-rpg | Fireguard burn lifecycle", error); warnTick(); }
    });
  };
  for (const hook of ["ready", "updateWorldTime", "updateUser", "deleteActor", "deleteToken", "deleteScene",
    "deleteCombat", "createCombatant", "deleteCombatant", "updateCombat"])
    Hooks.on(hook, sweep);
  Hooks.on("updateActiveEffect", (effect, changed) => {
    if (stateOf(effect) && "disabled" in changed) sweep();
  });
}
