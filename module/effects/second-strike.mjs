import { SECOND_STRIKE, secondStrikeOffer } from "../rules/second-strike.mjs";

const pending = new WeakMap();

/** Resolve the choice before any hit/miss side effects. Core Roll#reroll clones
 * the formula, data and options (verified locally against Foundry 14.367).
 * The attack workflow is not re-entered, so ammo, riders and actions are not paid twice. */
export function offerSecondStrike(actor, roll, context) {
  if (!actor) return Promise.resolve(roll);
  const before = pending.get(actor) ?? Promise.resolve();
  const task = before.catch(() => {}).then(() => resolve(actor, roll, context));
  pending.set(actor, task);
  return task.finally(() => { if (pending.get(actor) === task) pending.delete(actor); });
}

async function resolve(actor, roll, { kind, parry = false } = {}) {
  const fight = actor.activeFight?.() ?? null;
  const combatant = fight?.getCombatantsByActor?.(actor)?.[0] ?? null;
  const worldRound = () => Math.floor((Number(game.time.worldTime) || 0) / (CONFIG.time.roundTime || 6));
  const stamp = combatant ? fight.round : worldRound();
  const used = () => {
    if (!combatant) return actor.getFlag("azeroth-rpg", "secondStrikeRound") === worldRound() ? [SECOND_STRIKE] : [];
    const round = combatant.getFlag("azeroth-rpg", "round") ?? {};
    return round.number === fight.round ? (round.once ?? []) : [];
  };
  const offer = () => secondStrikeOffer(actor.takenTalents?.() ?? [], {
    kind, parry, success: roll.outcome.success, pools: actor.poolSnapshot?.() ?? [], used: used()
  });
  const initial = offer();
  if (!initial || combatant && !combatant.isOwner) return roll;
  const yes = await foundry.applications.api.DialogV2.confirm({
    id: `azeroth-second-strike-${actor.id}`,
    window: { title: game.i18n.localize("AZEROTH.SecondStrike.Title") },
    content: `<p>${game.i18n.format("AZEROTH.SecondStrike.Prompt", { total: roll.total, dc: roll.options.dc, cost: initial.cost })}</p>`,
    yes: { label: "AZEROTH.SecondStrike.RollAgain" }, no: { label: "AZEROTH.SecondStrike.Keep" }, rejectClose: false
  });
  if (yes !== true || (combatant ? fight.round : worldRound()) !== stamp || (actor.activeFight?.() ?? null) !== fight) return roll;
  const current = offer();
  if (!current || current.cost > initial.cost) return roll;
  if (combatant) {
    if (!(await combatant.markRoundOnce(SECOND_STRIKE))?.added) return roll;
  } else await actor.setFlag("azeroth-rpg", "secondStrikeRound", stamp);
  await actor.updatePool({ itemId: current.pool.itemId, kind: current.pool.kind, value: current.pool.value - current.cost });
  // Core clone shares options with the original. Snapshot before adding any
  // replacement metadata or it would contain itself through original.options.
  const original = JSON.parse(JSON.stringify(roll.toJSON()));
  const replacement = await roll.reroll();
  replacement.options.provenance ??= [];
  replacement.options.provenance.push({ label: "AZEROTH.SecondStrike.Title", value: null,
    formula: game.i18n.format("AZEROTH.SecondStrike.Record", { total: roll.total, cost: current.cost }) });
  replacement.options.secondStrike = { original, cost: current.cost };
  return replacement;
}
