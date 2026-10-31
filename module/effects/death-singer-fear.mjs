import { projectionPhaseFor } from "../rules/image-projection.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";

/** A separate timed condition: expiring this scream must not remove another
 * creature's Frightened effect, and ordinary damage does not break this fear.
 */
export async function applyDeathSingerFear({ victim, by, cast } = {}) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id
    || victim?.documentName !== "Actor" || !by?.uuid || typeof cast !== "string" || !cast) return { landed: false, reason: "authority" };
  if (projectionPhaseFor(victim)) return { landed: false, reason: "protected" };
  if ((victim.system?.conditionImmunities ?? []).includes("frightened")) return { landed: false, reason: "immune" };
  const prior = [...(victim.effects ?? [])].find(e => {
    const mark = e.flags?.["azeroth-rpg"]?.deathSingerFear;
    return mark?.by === by.uuid && mark.cast === cast && !e.disabled && e.active !== false;
  });
  if (prior) return { landed: true, effectId: prior.id };
  const [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [{
    name: "Death Singer Screech", img: "icons/svg/terror.svg", origin: by.uuid,
    statuses: ["frightened"], ...untilEndOfNextTurnOrRound(victim),
    flags: { "azeroth-rpg": { deathSingerFear: { by: by.uuid, cast } } }
  }]);
  return effect ? { landed: true, effectId: effect.id } : { landed: false, reason: "refused" };
}
