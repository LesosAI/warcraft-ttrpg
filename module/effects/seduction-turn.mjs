import { seductionTurnCommands } from "../rules/seduction.mjs";
const pending = new Set();

/** Claim the command's turn before posting instructions or moving anything. */
export async function beginSeductionTurn(combat, combatant) {
  const actor = combatant?.actor;
  const clock = { combatId: combat?.id, combatantId: combatant?.id, round: combat?.round, turn: combat?.turn };
  const valid = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && combat.started === true && combat.combatant === combatant && combatant.actor === actor
    && combat.round === clock.round && combat.turn === clock.turn && actor?.uuid
    && fromUuidSync(actor.uuid) === actor;
  if (!actor || !valid() || pending.has(actor.uuid)) return [];
  pending.add(actor.uuid);
  const claimed = [];
  try {
    for (const effect of seductionTurnCommands(actor.effects, actor.uuid, clock)) {
      if (!valid() || effect.flags["azeroth-rpg"].seduction.movementTurn !== null) continue;
      await effect.update({ "flags.azeroth-rpg.seduction.movementTurn": clock });
      if (!valid() || !seductionTurnCommands(actor.effects, actor.uuid, clock).includes(effect)) continue;
      const held = effect.flags["azeroth-rpg"].seduction.movementTurn;
      if (held?.combatId === clock.combatId && held.combatantId === clock.combatantId
        && held.round === clock.round && held.turn === clock.turn) claimed.push(effect);
    }
    return claimed;
  } finally { pending.delete(actor.uuid); }
}
