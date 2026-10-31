import { seductionTurnCommands } from "../rules/seduction.mjs";
import { planSeductionWalk } from "./seduction-walk-plan.mjs";
import { withSeductionWalk } from "./seduction-movement.mjs";
const pending = new Set();
const flag = "seductionWalk";

/** Execute a reviewed route through ordinary movement. No displacement,
 * ignore-walls option, free movement, or separate action payment is used. */
export async function executeSeductionWalk({ token, effect, waypoints } = {}) {
  const { seductionTimedCommands } = await import("../rules/seduction.mjs");
  const actor = token?.actor, scene = token?.parent, fight = actor?.activeFight?.();
  const combatant = fight?.combatant;
  const clock = { combatId: fight?.id, combatantId: combatant?.id, round: fight?.round, turn: fight?.turn };
  const record = effect?.flags?.["azeroth-rpg"]?.seduction;
  const timed = effect?.duration?.units === "seconds";
  const commands = () => timed ? seductionTimedCommands(actor?.effects, actor?.uuid, game.time?.worldTime)
    : seductionTurnCommands(actor?.effects, actor?.uuid, clock);
  const source = record?.sourceTokenUuid ? fromUuidSync(record.sourceTokenUuid) : null;
  const valid = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && actor?.uuid && fromUuidSync(actor.uuid) === actor && scene?.tokens?.get(token.id) === token
    && globalThis.canvas?.scene === scene && token.actor === actor && source?.parent === scene
    && source.actor?.uuid === record?.sourceUuid && source.uuid === record?.sourceTokenUuid
    && scene.tokens.get(source.id) === source && token.uuid === record?.targetTokenUuid
    && (actor.activeFight?.() ?? null) === (fight ?? null)
    && (fight?.started ? fight.combatant === combatant && combatant.actor === actor
      && fight.round === clock.round && fight.turn === clock.turn : timed)
    && commands().includes(effect);
  if (!valid()) return { ok: false, reason: "authorityOrTurn" };
  // Do not choose a charmer, or grant a second movement allowance, on behalf
  // of the table when more than one independent command is still held.
  if (commands().length !== 1) return { ok: false, reason: "multipleCommands" };
  if (pending.has(actor.uuid)) return { ok: false, reason: "busy" };
  pending.add(actor.uuid);
  try {
    const prior = effect.flags["azeroth-rpg"][flag];
    if (prior && prior.stage !== "complete") return { ok: false, reason: "reconcileMovement" };
    const spent = timed ? prior?.totalCost ?? 0 : 0;
    if (timed && prior && (!Number.isFinite(prior.totalCost) || prior.totalCost < 0)) return { ok: false, reason: "unknownMovement" };
    const { remainingMovement } = await import("../documents/combat.mjs");
    const allowanceNow = async () => {
      const native = fight?.started ? remainingMovement(token, { action: "walk" }) : null;
      if (!timed) return native;
      const { seductionTimedBudget } = await import("./seduction-timed-budget.mjs");
      const window = await seductionTimedBudget(actor, spent);
      if (!window || native && (!native.metered || native.combatantId !== combatant.id)) return null;
      return { ...window, feetLeft: Math.min(window.feetLeft, native?.feetLeft ?? Infinity),
        stopped: window.stopped || native?.stopped === true, combatantId: combatant?.id ?? null };
    };
    if (!valid()) return { ok: false, reason: "changed" };
    const allowance = await allowanceNow();
    if (!valid() || !allowance?.metered || allowance.stopped || !Number.isFinite(allowance.feetLeft)
      || allowance.feetLeft <= 0 || allowance.combatantId !== (combatant?.id ?? null)) return { ok: false, reason: "movementBudget" };
    const plan = planSeductionWalk({ token, source, waypoints, budget: allowance.feetLeft });
    if (!plan.ok) return plan;
    const path = plan.path.map(point => ({ ...point, action: "walk" }));
    if (prior && JSON.stringify(prior.path) === JSON.stringify(path)) return { ok: false, reason: "alreadyMoved" };
    const claim = { stage: "moving", clock, path, cost: plan.cost, ...(timed ? { totalCost: spent + plan.cost } : {}) };
    await effect.update({ [`flags.azeroth-rpg.${flag}`]: claim });
    if (!valid() || commands().length !== 1 || JSON.stringify(effect.flags["azeroth-rpg"][flag]) !== JSON.stringify(claim))
      return { ok: false, reason: "claimUnconfirmed" };
    // Recheck geometry after the claim's async write; the ordinary move
    // hooks make their own final budget and collision checks as well.
    const freshAllowance = await allowanceNow();
    if (!valid() || commands().length !== 1 || !freshAllowance?.metered || freshAllowance.stopped || !Number.isFinite(freshAllowance.feetLeft)
      || freshAllowance.feetLeft < plan.cost || freshAllowance.combatantId !== (combatant?.id ?? null))
      return { ok: false, reason: "budgetChanged" };
    const checked = planSeductionWalk({ token, source, waypoints, budget: freshAllowance.feetLeft });
    if (!checked.ok || JSON.stringify(checked.path) !== JSON.stringify(plan.path)) return { ok: false, reason: "routeChanged" };
    const completed = await withSeductionWalk({ token, path, valid: () => valid() && commands().length === 1, run: () => token.move(path) });
    const destination = path.at(-1);
    const arrived = ["x", "y", "elevation"].every(key => token[key] === destination[key]) && token._source?.level === destination.level;
    if (completed !== true || !arrived) return { ok: false, reason: "movementUnconfirmed" };
    // Damage during movement may end the charm. Do not recreate its carrier.
    if ([...(actor.effects ?? [])].includes(effect))
      await effect.update({ [`flags.azeroth-rpg.${flag}`]: { ...claim, stage: "complete" } });
    return { ok: true, moved: true, cost: plan.cost };
  } catch (error) {
    console.warn("azeroth-rpg | Seduction movement could not be confirmed", error);
    return { ok: false, reason: "movementUncertain" };
  } finally { pending.delete(actor.uuid); }
}
