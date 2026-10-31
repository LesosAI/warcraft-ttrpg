import { NPC_DISARM_FLAG, npcDisarmBlocks } from "../rules/npc-disarm.mjs";
import { stonemaulGrip } from "../rules/stonemaul-grip.mjs";

/** Use document identities, never the animation's inferred weapon form. */
export function disarmedAttack(actor, { weaponId = null, strike = null } = {}) {
  if (stonemaulGrip(actor?.takenTalents?.() ?? [])) return false;
  if (!actor?.uuid) return false;
  const time = globalThis.game?.time?.worldTime;
  let weapon = null;
  const itemId = weaponId ?? strike?.weapon?.id;
  const item = itemId ? actor.items?.get(itemId) : null;
  if (item?.type === "weapon") {
    if (item.natural) return false;
    weapon = { kind: "item", itemId: item.id };
  } else if (Number.isInteger(strike?.row?.index)) {
    const index = strike.row.index;
    const row = actor.system?.attacks?.[index];
    if (row?.name !== strike.row.name) return false;
    weapon = { kind: "npcRow", index, name: row.name };
  }
  if (!weapon) return false;
  return [...(actor.effects ?? [])].some(effect => effect.origin === actor.uuid
    && effect.flags?.["azeroth-rpg"]?.identifier === "npc-disarm"
    && npcDisarmBlocks(effect.flags?.["azeroth-rpg"]?.[NPC_DISARM_FLAG], {
      ownerUuid: actor.uuid, time, weapon,
      disabled: effect.disabled === true || effect.isSuppressed === true || effect.active === false
    }));
}

/** rollTest calls this before the turn budget, ammunition, reveal or dice.
 * Parries also enter rollTest; their earlier Reaction payment has a separate
 * preflight below. A restriction arriving during the dialog still stops dice. */
export function refuseDisarmedAttack(actor, attack = {}) {
  if (!disarmedAttack(actor, attack)) return false;
  globalThis.ui?.notifications?.warn("Disarm prevents using that weapon until the effect ends. Choose another weapon or an unarmed attack.");
  return true;
}

export function refuseDisarmedParry(actor, weaponName) {
  const ready = actor?.readyWeapons?.() ?? [...(actor?.items ?? [])].filter(item => item.type === "weapon" && item.system?.equipped);
  const weapon = ready.find(row => row.name === weaponName) ?? ready[0];
  if (!weapon) return false;
  const attack = weapon.natural
    ? { strike: { row: { index: weapon.natural.index, name: weapon.natural.row?.name } } }
    : { weaponId: weapon.id };
  return refuseDisarmedAttack(actor, attack);
}
