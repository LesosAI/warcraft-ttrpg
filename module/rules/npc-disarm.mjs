/** NPC spell 6713, adapted as a six-second restriction on one selected weapon.
 * Selection must establish that the item/row is a held weapon. Names alone
 * cannot distinguish a construct's body part from an actual held weapon.
 * Inventory is never changed; expiration therefore has nothing to re-equip.
 */
export const NPC_DISARM_SECONDS = 6;
export const NPC_DISARM_FLAG = "npcDisarm";
export const NPC_DISARM = Object.freeze({ name: "Disarm", action: "action", feet: 5, dc: 12, seconds: 6 });
const id = value => typeof value === "string" && value.trim().length > 0;

export function disarmWeaponRef({ kind, itemId, index, name, heldWeapon = false } = {}) {
  if (heldWeapon !== true) return null;
  if (kind === "item" && id(itemId)) return { kind, itemId };
  if (kind === "npcRow" && Number.isInteger(index) && index >= 0 && id(name)) return { kind, index, name };
  return null;
}

export function npcDisarmStart({ ownerUuid, sourceUuid, castId, time, weapon } = {}) {
  const reference = disarmWeaponRef({ ...weapon, heldWeapon: true });
  if (!id(ownerUuid) || !id(sourceUuid) || !id(castId) || !Number.isFinite(time) || !reference) return null;
  return { version: 1, ownerUuid, sourceUuid, castId, startedAt: time,
    expiresAt: time + NPC_DISARM_SECONDS, weapon: reference };
}

export function npcDisarmActive(state, { ownerUuid, time, disabled = false } = {}) {
  return Boolean(state?.version === 1 && id(ownerUuid) && state.ownerUuid === ownerUuid
    && id(state.sourceUuid) && id(state.castId) && Number.isFinite(state.startedAt)
    && state.expiresAt === state.startedAt + NPC_DISARM_SECONDS
    && Number.isFinite(time) && time >= state.startedAt && time < state.expiresAt && disabled === false
    && disarmWeaponRef({ ...state.weapon, heldWeapon: true }));
}

/** Both attacks and weapon parries are weapon use. A renamed item keeps its
 * identity. A replaced/reordered NPC row must be selected again, not guessed.
 * Callers pass the current source identity, never a display-only strike form.
 */
export function npcDisarmBlocks(state, { ownerUuid, time, disabled = false, weapon, natural = false } = {}) {
  if (natural === true || !npcDisarmActive(state, { ownerUuid, time, disabled }) || !weapon) return false;
  const target = state.weapon;
  if (target.kind !== weapon.kind) return false;
  return target.kind === "item" ? target.itemId === weapon.itemId
    : target.index === weapon.index && target.name === weapon.name;
}

export function npcDisarmEffect(args = {}) {
  const state = npcDisarmStart(args);
  if (!state || !Number.isInteger(args.time)) return null;
  return { name: "Disarm", img: "icons/svg/sword.svg", origin: state.ownerUuid,
    disabled: false, transfer: false, statuses: [], system: { changes: [] },
    start: { time: args.time }, duration: { value: NPC_DISARM_SECONDS, units: "seconds", expiry: "turnStart", expired: false },
    flags: { "azeroth-rpg": { identifier: "npc-disarm", [NPC_DISARM_FLAG]: state } } };
}

/** 05 section 5: both sides test against DC 12. Success beats failure;
 * two successes compare SL, then total. Two failures or a complete tie
 * change nothing. Missing/cancelled rolls are unresolved, never a defeat.
 */
export function npcDisarmContest(attacker, defender) {
  const complete = roll => typeof roll?.outcome?.success === "boolean"
    && Number.isInteger(roll.outcome.sl) && Number.isFinite(roll.total);
  if (!complete(attacker) || !complete(defender)) return { resolved: false, winner: null };
  const a = attacker.outcome, d = defender.outcome;
  if (!a.success && !d.success) return { resolved: true, winner: null };
  if (a.success !== d.success) return { resolved: true, winner: a.success ? "attacker" : "defender" };
  const comparison = a.sl - d.sl || attacker.total - defender.total;
  return { resolved: true, winner: comparison > 0 ? "attacker" : comparison < 0 ? "defender" : null };
}
