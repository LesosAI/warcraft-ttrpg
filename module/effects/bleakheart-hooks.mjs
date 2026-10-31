import { BLEAKHEART_FLAG } from "../rules/bleakheart.mjs";
import { bleakheartWorldTick, bleakheartTurnTick } from "../rules/bleakheart-clock.mjs";
import { resolveBleakheartPulse } from "./bleakheart-pulse.mjs";

const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const snapshot = combat => ({ id: combat.id, started: combat.started === true, round: combat.round,
  turn: combat.turn, actorUuid: combat.combatant?.actor?.uuid ?? null });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fighting = actor => values(game.combats).some(combat => combat.started
  && values(combat.combatants).some(combatant => combatant.actor?.uuid === actor.uuid));
const carriers = actor => values(actor.effects).filter(effect => effect.active === true
  && !effect.disabled && !effect.isSuppressed && !effect.duration?.expired
  && effect.flags?.["azeroth-rpg"]?.[BLEAKHEART_FLAG]?.version === 1);

/** Every client observes transitions, but only the active GM mutates. Loading
 * and GM handoff do not replay a turn or any missed world-clock intervals. */
export function registerBleakheartHooks() {
  let previousTime;
  const combats = new Map();
  const prime = () => {
    previousTime = game.time.worldTime;
    for (const combat of values(game.combats)) combats.set(combat.id, snapshot(combat));
  };
  const pulse = async (actor, effect, tickKey, valid) => {
    const result = await resolveBleakheartPulse({ victim: actor, effect, tickKey, valid });
    if (!result.ok && result.reason !== "receipt" && result.reason !== "inactive")
      ui.notifications?.warn("Chest Pains could not be fully resolved. Check the curse's tick receipt, Health and Stunned effects before correcting it.");
  };
  Hooks.on("ready", prime);
  Hooks.on("createCombat", combat => combats.set(combat.id, snapshot(combat)));
  Hooks.on("deleteCombat", combat => combats.delete(combat.id));
  Hooks.on("updateCombat", async combat => {
    const previous = combats.get(combat.id), current = snapshot(combat);
    // Keep the forward frontier when the GM rewinds the turn tracker.
    if (!previous?.started || current.round > previous.round
      || (current.round === previous.round && current.turn >= previous.turn)) combats.set(combat.id, current);
    if (!gmHere()) return;
    const actor = combat.combatant?.actor;
    if (!actor) return;
    const tickKey = bleakheartTurnTick({ previous, current, actorUuid: actor.uuid });
    const effects = carriers(actor);
    if (!tickKey || effects.length !== 1) return;
    await pulse(actor, effects[0], tickKey, () => game.combats?.get(combat.id) === combat
      && same(snapshot(combat), current));
  });
  Hooks.on("updateWorldTime", async now => {
    const previous = previousTime;
    if (!Number.isFinite(previousTime) || now > previousTime) previousTime = now;
    if (!gmHere() || !Number.isFinite(previous)) return;
    const actors = new Map(values(game.actors).map(actor => [actor.uuid, actor]));
    for (const scene of values(game.scenes)) for (const token of values(scene.tokens))
      if (token.actor) actors.set(token.actor.uuid, token.actor);
    for (const actor of actors.values()) {
      const effects = carriers(actor);
      if (effects.length !== 1) continue;
      const effect = effects[0];
      const tickKey = bleakheartWorldTick({ previous, now, started: effect.start?.time, inCombat: fighting(actor) });
      if (tickKey) await pulse(actor, effect, tickKey, () => game.time.worldTime === now && !fighting(actor));
    }
  });
}
