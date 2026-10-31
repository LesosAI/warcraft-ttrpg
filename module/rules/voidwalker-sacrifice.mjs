/** The Voidwalker's printed Sacrifice, not the Warlock talent Demonic Sacrifice.
 * The five feet is measured from the Voidwalker to its bound owner, for
 * both melee and ranged attacks (confirmed 2026-10-26).
 */
export const VOIDWALKER_SACRIFICE = Object.freeze({ name: "Sacrifice", action: "half", seconds: 6 });
export const VOIDWALKER_SACRIFICE_FLAG = "voidwalkerSacrifice";
const id = value => typeof value === "string" && value.trim().length > 0;

function validRecord(state) {
  return state?.version === 1 && [state.sourceUuid, state.ownerUuid, state.sourceTokenUuid, state.ownerTokenUuid, state.activationId].every(id)
    && state.sourceUuid !== state.ownerUuid && state.sourceTokenUuid !== state.ownerTokenUuid;
}

/** Carrier on the Voidwalker, timed to its own next turn. The adapter supplies
 * localized labels and the existing untilNextTurnOrRound(voidwalker) result.
 * This changes no armor, Ward, Health, status or Reaction allowance.
 */
export function voidwalkerSacrificeEffect({ sourceUuid, ownerUuid, sourceTokenUuid, ownerTokenUuid, activationId, timing, labels } = {}) {
  const state = { version: 1, sourceUuid, ownerUuid, sourceTokenUuid, ownerTokenUuid, activationId };
  if (!validRecord(state) || !id(labels?.name) || !id(labels?.description)) return null;
  const start = timing?.start, duration = timing?.duration;
  if (!Number.isSafeInteger(start?.time) || start.time < 0) return null;
  if (duration?.units === "turns") {
    if (duration.value !== 1 || duration.expiry !== "turnStart" || !id(start.combat) || !id(start.combatant)
      || !Number.isSafeInteger(start.round) || start.round < 1 || !Number.isSafeInteger(start.turn) || start.turn < 0) return null;
  } else if (duration?.units !== "seconds" || duration.value !== VOIDWALKER_SACRIFICE.seconds) return null;
  return {
    name: labels.name, description: labels.description, img: "icons/svg/shield.svg", origin: sourceUuid,
    disabled: false, transfer: false, statuses: [], system: { changes: [] },
    duration: { expiry: "turnStart", expired: false, ...structuredClone(duration) },
    start: { combat: null, combatant: null, initiative: 0, round: 0, turn: 0, ...structuredClone(start) },
    flags: { "azeroth-rpg": { identifier: "voidwalker-sacrifice", [VOIDWALKER_SACRIFICE_FLAG]: state } }
  };
}

/** Read only carriers on this exact source and its current bound owner.
 * Rebinding, release, token replacement or effect expiry breaks the link.
 * This identifies candidates; it does not decide range or redirect attacks.
 */
export function activeVoidwalkerSacrifices(effects, { sourceUuid, ownerUuid, sourceTokenUuid, ownerTokenUuid } = {}) {
  if (![sourceUuid, ownerUuid, sourceTokenUuid, ownerTokenUuid].every(id)) return [];
  return [...(effects ?? [])].filter(effect => {
    const state = effect?.flags?.["azeroth-rpg"]?.[VOIDWALKER_SACRIFICE_FLAG];
    return validRecord(state) && state.sourceUuid === sourceUuid && state.ownerUuid === ownerUuid
      && state.sourceTokenUuid === sourceTokenUuid && state.ownerTokenUuid === ownerTokenUuid
      && effect.origin === sourceUuid && !effect.disabled && effect.active !== false && !effect.isSuppressed
      && !effect.isExpired && !effect.duration?.expired;
  });
}

/** Protection is proximity to the owner, not reach to the attacker.
 * The adapter supplies measured feet and current scene/level identity. */
export function voidwalkerSacrificeInRange({ feet, sameScene, sameLevel } = {}) {
  return sameScene === true && sameLevel === true && Number.isFinite(feet) && feet >= 0 && feet <= 5;
}
