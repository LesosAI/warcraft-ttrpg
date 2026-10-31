/** One timed control carrier. Never writes ownership or creates a bound actor. */
import { INSANITY_FLAG, causeInsanityEffect, insanityEligible, validInsanityState } from "../rules/cause-insanity.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
const pending = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const present = actor => actor?.uuid && fromUuidSync(actor.uuid) === actor;
const eligible = actor => insanityEligible({ health: actor.system?.health?.value,
  typeMarker: actor.system?.typeMarker, immunities: actor.system?.conditionImmunities ?? [] });
const carriers = actor => [...(actor?.effects ?? [])].filter(e => validInsanityState(e.flags?.["azeroth-rpg"]?.[INSANITY_FLAG], actor.uuid));

export async function layCauseInsanity({ victim, by, valid } = {}) {
  const allowed = () => gmHere() && present(victim) && present(by) && victim !== by
    && typeof valid === "function" && valid();
  if (!allowed()) return { ok: false, reason: "authority" };
  if (!eligible(victim)) return { ok: false, reason: "immune", immune: true };
  // Do not replace a different controller, or stack another Speed bonus.
  if (pending.has(victim.uuid) || carriers(victim).length || victim.statuses?.has("charmed")) return { ok: false, reason: "controlledOrBusy" };
  pending.add(victim.uuid);
  let effect;
  try {
    const data = causeInsanityEffect({ sourceUuid: by.uuid, targetUuid: victim.uuid, timing: untilEndOfNextTurnOrRound(victim) });
    if (!data || !allowed() || !eligible(victim)) return { ok: false, reason: "changed" };
    [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
    const held = effect && carriers(victim).some(e => e === effect);
    // Only this newly created carrier may be removed if the cast ceased to be
    // valid while the server write was in flight. Never toggle global Charmed.
    const otherCharm = [...(victim.effects ?? [])].some(e => e !== effect && e.active !== false
      && !e.disabled && !e.isSuppressed && e.statuses?.has?.("charmed"));
    if (!held || !allowed() || !eligible(victim) || otherCharm) {
      if (held && gmHere() && present(victim)) await victim.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      return { ok: false, reason: "changed", effectId: effect?.id ?? null };
    }
    return { ok: true, effectId: effect.id };
  } catch (error) {
    console.warn("azeroth-rpg | Cause Insanity effect could not be confirmed", error);
    return { ok: false, reason: "writeUncertain", effectId: effect?.id ?? null };
  } finally { pending.delete(victim.uuid); }
}
