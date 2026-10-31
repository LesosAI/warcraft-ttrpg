/** Highwayman Sneak: Classic out-of-combat stealth and half-speed movement.
 * Activation uses the existing tabletop Hide Test; this module is only law.
 * The runtime must remove this carrier on engagement, revelation or hostility.
 */
import { HIDDEN_STATUS } from "./stealth.mjs";

export const NPC_SNEAK_FLAG = "npcSneak";
export const NPC_SNEAK = Object.freeze({ name: "Sneak", identifier: "npc-sneak", speedMultiplier: 0.5 });
const identity = value => typeof value === "string" && value.trim().length > 0;

/** Other workflow refusals (realm, ownership and incapacitation) are runtime
 * responsibilities; these are the ability's own eligibility requirements. */
export function npcSneakAllowed({ type, abilities = [], health, inCombat = false, hidden = false } = {}) {
  if (type !== "npc" || !abilities.some(row => row?.name === NPC_SNEAK.name)) return { ok: false, reason: "ability" };
  if (!Number.isFinite(health) || health <= 0) return { ok: false, reason: "health" };
  if (inCombat !== false) return { ok: false, reason: "combat" };
  if (hidden !== false) return { ok: false, reason: "hidden" };
  return { ok: true, reason: null };
}

/** No timeout: Classic cancels both Sneak auras on aggro. Keep concealment
 * and the slow in one carrier so ending either cannot strand the other. */
export function npcSneakEffect({ ownerUuid, castId } = {}) {
  if (!identity(ownerUuid) || !identity(castId)) return null;
  return {
    name: NPC_SNEAK.name, img: "icons/svg/invisible.svg", origin: ownerUuid,
    disabled: false, transfer: false, statuses: [HIDDEN_STATUS],
    duration: { value: null, units: "seconds", expiry: null, expired: false },
    system: { changes: [{ key: "system.speed", type: "multiply", value: "0.5", phase: "final", priority: 50 }] },
    flags: { "azeroth-rpg": { identifier: NPC_SNEAK.identifier,
      [NPC_SNEAK_FLAG]: { version: 1, ownerUuid, castId } } }
  };
}

/** Never identify another source's invisibility as Sneak by status alone. */
export function isNpcSneakEffect(effect, ownerUuid) {
  const flags = effect?.flags?.["azeroth-rpg"], state = flags?.[NPC_SNEAK_FLAG];
  return Boolean(identity(ownerUuid) && effect?.origin === ownerUuid
    && flags?.identifier === NPC_SNEAK.identifier && state?.version === 1
    && state.ownerUuid === ownerUuid && identity(state.castId));
}

/** A failed attack still reveals the creature. A movement event does not. */
export function npcSneakEnds({ inCombat = false, health, event = null } = {}) {
  return inCombat === true || (Number.isFinite(health) && health <= 0)
    || ["attack", "cast", "reveal"].includes(event);
}
