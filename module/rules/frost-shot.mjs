/** Spitelash Siren's bow rider. Each hit keeps its own duration; Slowed is binary. */
export const FROST_SHOT = Object.freeze({ name: "Frost Shot", action: "action", power: 2,
  range: 60, maximum: 120, bonus: 8, damage: 7, school: "frost" });
export const FROST_SHOT_FLAG = "frostShot";
export const FROST_SHOT_CHANGE = "frostShotSlow";
const id = value => typeof value === "string" && value.trim().length > 0;
const has = (values, value) => Array.from(values ?? []).includes(value);
export const FELGUARD_SLOW_FLAG = "felguardBlastSlow";
const SLOW_FLAGS = Object.freeze([FROST_SHOT_FLAG, FELGUARD_SLOW_FLAG]);

export function frostShotEffect(args = {}) {
  return independentSlowEffect({ ...args, flag: FROST_SHOT_FLAG, name: FROST_SHOT.name, img: "icons/svg/frozen.svg" });
}

/** Independent durations share the existing binary Slowed speed handler. */
export function independentSlowEffect({ sourceUuid, messageUuid, targetUuid, timing, flag, name, img } = {}) {
  if (!SLOW_FLAGS.includes(flag) || !id(name) || !id(img)) return null;
  if (![sourceUuid, messageUuid, targetUuid].every(id) || !timing?.start || !timing?.duration) return null;
  const { duration, start } = timing;
  const world = duration.units === "seconds" && duration.value === 6 && Number.isFinite(start.time);
  const combat = duration.units === "turns" && duration.value === 1 && duration.expiry === "turnEnd"
    && id(start.combat) && id(start.combatant) && Number.isInteger(start.round) && start.round >= 1
    && Number.isInteger(start.turn) && start.turn >= 0 && Number.isFinite(start.time);
  if (!world && !combat) return null;
  return { name, img, origin: sourceUuid,
    disabled: false, statuses: ["slowed"],
    system: { changes: [{ key: "system.speed", type: FROST_SHOT_CHANGE,
      value: messageUuid, phase: "final", priority: 10 }] },
    duration: { ...duration }, start: { ...start },
    flags: { "azeroth-rpg": { harmful: true, laidBy: [sourceUuid],
      [flag]: { version: 1, sourceUuid, messageUuid, targetUuid } } } };
}

/** Plain effect snapshots only. Disabled and suppressed effects never compete.
 * An ordinary Slowed multiplier already supplies the condition's speed penalty.
 * Otherwise exactly one independent Frost Shot carrier supplies it. */
export function frostShotSpeedCarrier(effects, targetUuid) {
  if (!id(targetUuid)) return null;
  const active = Array.from(effects ?? []).filter(effect => effect.active === true && has(effect.statuses, "slowed"));
  if (active.some(effect => (effect.system?.changes ?? []).some(change =>
    change.key === "system.speed" && change.type === "multiply" && Number(change.value) === 0.5))) return null;
  const candidates = active.filter(effect => {
    const flags = effect.flags?.["azeroth-rpg"] ?? {};
    const held = SLOW_FLAGS.filter(flag => flags[flag]);
    const state = held.length === 1 ? flags[held[0]] : null;
    return id(effect.id) && state?.version === 1 && state.targetUuid === targetUuid
      && id(state.sourceUuid) && id(state.messageUuid) && effect.origin === state.sourceUuid
      && (effect.system?.changes ?? []).filter(change => change.type === FROST_SHOT_CHANGE).length === 1
      && effect.system.changes.some(change => change.type === FROST_SHOT_CHANGE
        && change.key === "system.speed" && change.value === state.messageUuid && change.phase === "final");
  });
  return candidates.map(effect => effect.id).sort()[0] ?? null;
}

/** Range is measured by the adapter, so an absent measurement cannot authorize a shot. */
export function frostShotRange(feet, engaged = false) {
  if (!Number.isFinite(feet) || feet < 0 || feet > FROST_SHOT.maximum) return { allowed: false, banes: 0 };
  return { allowed: true, banes: Number(feet > FROST_SHOT.range) + Number(engaged === true) };
}
