import { seductionActionRefusal, seductionTurnCommands, seductionTimedCommands } from "../rules/seduction.mjs";

export function seductionCommandClock(actor) {
  if (!actor?.uuid) return null;
  const fight = actor.activeFight?.(), combatant = fight?.combatant;
  if (fight?.started && combatant?.actor?.uuid !== actor.uuid) return null;
  return { time: globalThis.game?.time?.worldTime, ...(fight?.started
    ? { combatId: fight.id, combatantId: combatant.id, round: fight.round, turn: fight.turn } : {}) };
}

export function seductionCommandsNow(actor) {
  const clock = seductionCommandClock(actor);
  return clock ? [...seductionTurnCommands(actor.effects, actor.uuid, clock),
    ...seductionTimedCommands(actor.effects, actor.uuid, clock.time)] : [];
}

export function seductionRefusal(actor, operation) {
  const clock = seductionCommandClock(actor);
  if (!clock) return null;
  return seductionActionRefusal({ effects: actor.effects, targetUuid: actor.uuid, operation,
    clock });
}
