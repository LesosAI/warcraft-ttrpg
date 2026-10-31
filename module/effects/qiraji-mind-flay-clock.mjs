/** Authoritative, claim-before-write clock for the bounded Mind Flay channel. */
import { MIND_FLAY_FLAG, QIRAJI_MIND_FLAY as SPEC } from "../rules/qiraji-mind-flay.mjs";
import { MIND_FLAY_CLOCK as FLAG, validMindFlayClock, transferMindFlayClock, claimMindFlayPulse } from "../rules/qiraji-mind-flay-clock.mjs";
import { mindFlayParticipants, mindFlayChannelLive, reconcileMindFlay } from "./qiraji-mind-flay-lifecycle.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
const pending = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const stateOf = effect => effect.flags?.["azeroth-rpg"]?.[FLAG];
const linkOf = effect => effect.flags?.["azeroth-rpg"]?.[MIND_FLAY_FLAG];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fightOf = actor => (game.combats?.contents ?? []).find(c => c.started && c.getCombatantsByActor(actor)?.length) ?? null;
const clockOf = combat => combat ? { combatUuid: combat.uuid, turn: { round: combat.round, turn: combat.turn } }
  : { time: game.time?.worldTime };
const held = (actor, effect) => fromUuidSync(actor.uuid) === actor && actor.effects.get(effect.id) === effect;
const warn = () => ui.notifications?.warn("Mind Flay could not be fully resolved. Check Mana, Health and its remaining pulses before resolving it manually.");

/** Damage follows the target's clock; upkeep follows the source's clock. */
export function mindFlayFight(pair) { return fightOf(pair.target); }

export async function advanceMindFlay(actor, combat = null) {
  const lines = [];
  if (!gmHere() || !actor?.uuid || fromUuidSync(actor.uuid) !== actor || pending.has(actor.uuid)) return lines;
  if (combat && (!combat.started || combat.combatant?.actor !== actor)) return lines;
  pending.add(actor.uuid);
  try {
    for (const effect of [...actor.effects].filter(linkOf)) {
      for (let pulse = 0; pulse < (combat ? 1 : SPEC.ticks); pulse++) {
        if (!gmHere() || !held(actor, effect)) break;
        const link = linkOf(effect), state = stateOf(effect), pair = mindFlayParticipants(link);
        if (!pair || !mindFlayChannelLive(link, effect) || !validMindFlayClock(state)
          || state.cast !== link.cast || state.remaining === 0) { await effect.delete(); break; }
        const governing = mindFlayFight(pair), sourceFight = fightOf(pair.source), clock = clockOf(governing);
        const moved = transferMindFlayClock(state, clock);
        if (!moved) break;
        if (!same(moved, state)) { await effect.update({ [`flags.azeroth-rpg.${FLAG}`]: moved }); break; }
        if (governing !== combat) break;
        const plan = claimMindFlayPulse(state, { cast: link.cast, ...clock });
        if (!plan) break;
        // A persisted claim prevents replay after uncertain payment or damage.
        await effect.update({ [`flags.azeroth-rpg.${FLAG}`]: plan.next });
        const valid = () => gmHere() && held(actor, effect) && same(stateOf(effect), plan.next)
          && mindFlayChannelLive(link, effect) && mindFlayFight(pair) === governing
          && fightOf(pair.source) === sourceFight && same(clockOf(governing), clock);
        if (!valid()) break;
        try {
          // Combat already charges the source on its own turn. When it has
          // no combat turn, each target pulse pays the exploration upkeep.
          const upkeep = sourceFight ? 0 : SPEC.upkeep;
          if (upkeep) {
            const mana = pair.source.system?.power?.value;
            if (!Number.isInteger(mana) || mana < upkeep) { await effect.delete(); break; }
            await pair.source.update({ "system.power.value": mana - upkeep });
            if (!valid() || pair.source.system.power.value !== mana - upkeep) break;
          }
          lines.push(...await strikeFromArea({ actor, caster: pair.source,
            spell: { name: SPEC.name, school: "shadow", feature: true, isSpell: false, takesSpellpower: false },
            damage: { rating: SPEC.damage, school: "shadow" } }));
        } catch { warn(); }
        if (!gmHere() || !held(actor, effect)) break;
        if (plan.next.remaining === 0 || !mindFlayChannelLive(link, effect)) { await effect.delete(); break; }
      }
    }
  } finally {
    pending.delete(actor.uuid);
    await reconcileMindFlay();
  }
  return lines;
}

function actorsEverywhere() {
  const actors = new Map();
  for (const actor of game.actors ?? []) actors.set(actor.uuid, actor);
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (token.actor) actors.set(token.actor.uuid, token.actor);
  return [...actors.values()];
}

export async function advanceMindFlayWorld() {
  if (!gmHere() || !Number.isFinite(game.time?.worldTime)) return [];
  const lines = [];
  for (const actor of actorsEverywhere()) lines.push(...await advanceMindFlay(actor));
  return lines;
}

/** Transitions only; these hooks must never inflict damage. */
export async function syncMindFlayClocks() {
  if (!gmHere()) return;
  for (const actor of actorsEverywhere()) {
    if (pending.has(actor.uuid)) continue;
    pending.add(actor.uuid);
    try {
      for (const effect of [...actor.effects].filter(linkOf)) {
        if (!gmHere() || !held(actor, effect)) break;
        const link = linkOf(effect), state = stateOf(effect), pair = mindFlayParticipants(link);
        if (!pair || !mindFlayChannelLive(link, effect) || !validMindFlayClock(state)
          || state.cast !== link.cast || state.remaining === 0) { await effect.delete(); continue; }
        const moved = transferMindFlayClock(state, clockOf(mindFlayFight(pair)));
        if (moved && !same(moved, state)) await effect.update({ [`flags.azeroth-rpg.${FLAG}`]: moved });
      }
    } finally { pending.delete(actor.uuid); }
  }
  await reconcileMindFlay();
}

export function registerMindFlayClockHooks() {
  const sync = () => { void syncMindFlayClocks().catch(warn); };
  for (const hook of ["ready", "deleteCombat", "createCombatant", "deleteCombatant"]) Hooks.on(hook, sync);
  Hooks.on("updateCombat", (_, changed) => { if ("round" in changed || "started" in changed) sync(); });
  Hooks.on("updateWorldTime", () => { void syncMindFlayClocks().then(advanceMindFlayWorld).catch(warn); });
}
