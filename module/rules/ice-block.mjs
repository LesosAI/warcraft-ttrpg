/** Ice Block's identified carrier and rank-2 exception. No document writes.
 * Timing comes from untilEndOfNextTurnOrRound; protection is not a condition. */
import { AZEROTH } from "../config.mjs";
export const ICE_BLOCK_FLAG = "iceBlock";
const scope = "azeroth-rpg";
const id = value => typeof value === "string" && value.trim().length > 0;

/** Lead ruling: end the entire effect when it carries any condition, including
 * unrelated benefits in that same effect. Other effects and combat states stay. */
export function iceBlockConditionPlan(effects = []) {
  if (!Array.isArray(effects)) return null;
  const ids = [], conditions = new Set();
  for (const effect of effects) {
    const statuses = effect?.statuses ?? [];
    if (!Array.isArray(statuses) && !(statuses instanceof Set)) return null;
    const held = [...statuses].filter(status => Object.hasOwn(AZEROTH.conditions, status));
    if (!held.length) continue;
    if (!id(effect.id) || ids.includes(effect.id)) return null;
    ids.push(effect.id);
    held.forEach(status => conditions.add(status));
  }
  return { ids: ids.sort(), conditions: [...conditions].sort() };
}

function validTiming(timing) {
  const { start, duration } = timing ?? {};
  if (!Number.isSafeInteger(start?.time) || start.time < 0) return false;
  if (duration?.units === "seconds") return duration.value === 6;
  return duration?.units === "turns" && duration.value === 1 && duration.expiry === "turnEnd"
    && id(start.combat) && id(start.combatant)
    && Number.isSafeInteger(start.round) && start.round >= 0
    && Number.isSafeInteger(start.turn) && start.turn >= 0;
}

export function iceBlockEffect({ ownerUuid, spellUuid, messageUuid, cast, timing, description = "", img = "icons/svg/shield.svg" } = {}) {
  if (![ownerUuid, spellUuid, messageUuid, cast].every(id) || !validTiming(timing)) return null;
  if (typeof description !== "string" || !id(img)) return null;
  return { name: "Ice Block", img, description, origin: spellUuid,
    disabled: false, transfer: false, statuses: [], system: { changes: [] },
    start: { combat: null, combatant: null, initiative: 0, round: 0, turn: 0, ...structuredClone(timing.start) },
    duration: { expiry: "turnEnd", expired: false, ...structuredClone(timing.duration) },
    flags: { [scope]: { identifier: "ice-block", [ICE_BLOCK_FLAG]: { version: 1, ownerUuid, spellUuid, messageUuid, cast } } } };
}

/** An unrelated effect with the same display name cannot supply protection.
 * Read native effect eligibility rather than interpreting turn counts as time. */
export function iceBlockFor(actor) {
  if (!id(actor?.uuid)) return null;
  return [...(actor.effects ?? [])].find(effect => {
    const flags = effect?.flags?.[scope], record = flags?.[ICE_BLOCK_FLAG];
    return flags?.identifier === "ice-block" && record?.version === 1 && record.ownerUuid === actor.uuid
      && [record.spellUuid, record.messageUuid, record.cast].every(id) && effect.origin === record.spellUuid
      && !effect.disabled && !effect.isSuppressed && effect.active !== false && !effect.duration?.expired
      && validTiming({ start: effect._source?.start ?? effect.start, duration: effect._source?.duration ?? effect.duration });
  }) ?? null;
}

/** A permission check is still required by the writing adapter. Ending the
 * block is an exception to its action prohibition, not a paid action. */
export function iceBlockCanEnd({ actor, rank, onTurn } = {}) {
  return rank === 2 && onTurn === true && iceBlockFor(actor) !== null;
}
