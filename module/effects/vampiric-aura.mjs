/** The owner who wrote Health loss asks the active GM to resolve the passive. */
import { vampiricAuraHeal, VAMPIRIC_AURA_FLAG as FLAG } from "../rules/vampiric-aura.mjs";
export const VAMPIRIC_AURA_QUERY = "azeroth-rpg.vampiricAura";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestVampiricAura({ attacker, target, before, after, messageId } = {}) {
  if (!messageId || !target?.isOwner || !attacker?.system?.creatureAbilities?.some(row => row.name === "Vampiric Aura")) return null;
  const data = { attackerUuid: attacker.uuid, targetUuid: target.uuid, before, after, messageId };
  const gm = game.users?.activeGM;
  if (!gm) return null;
  return gmHere() ? vampiricAuraQueryHandler(data, { user: game.user }) : gm.query(VAMPIRIC_AURA_QUERY, data);
}

export async function vampiricAuraQueryHandler({ attackerUuid, targetUuid, before, after, messageId } = {}, { user } = {}) {
  if (!gmHere() || !user || !messageId || busy.has(messageId)) return { claimed: false, healed: 0 };
  busy.add(messageId);
  let claimed = false;
  try {
    const attacker = await fromUuid(attackerUuid);
    const target = await fromUuid(targetUuid);
    const message = game.messages?.get(messageId);
    const valid = () => {
      if (!gmHere() || fromUuidSync(attackerUuid) !== attacker || fromUuidSync(targetUuid) !== target || game.messages?.get(messageId) !== message) return false;
      if (attacker?.documentName !== "Actor" || target?.documentName !== "Actor" || !target.testUserPermission(user, "OWNER")) return false;
      if (!message || ChatMessage.getSpeakerActor(message.speaker)?.uuid !== attackerUuid) return false;
      const health = target.system?.health;
      if (!Number.isFinite(health?.value) || !Number.isFinite(health?.max) || before > health.max || health.value > after) return false;
      return vampiricAuraHeal({ attacker, targetUuid, before, after, flags: message.flags?.["azeroth-rpg"] }) > 0;
    };
    if (!valid() || message.getFlag("azeroth-rpg", FLAG)) return { claimed, healed: 0 };
    // One attack card, even if its damage was shared or moved to another actor.
    // Claim before healing; an uncertain heal must never be automatically replayed.
    const claim = { attackerUuid, targetUuid, before, after };
    await message.setFlag("azeroth-rpg", FLAG, claim);
    const held = message.getFlag("azeroth-rpg", FLAG);
    claimed = held?.attackerUuid === attackerUuid && held?.targetUuid === targetUuid && held?.before === before && held?.after === after;
    if (!claimed || !valid()) return { claimed, healed: 0 };
    const old = attacker.system.health.value;
    await attacker.applyHealing(2, { from: attacker, feature: true });
    const healed = Math.max(0, attacker.system.health.value - old);
    if (healed > 0) {
      const source = message.flags?.["azeroth-rpg"]?.source ?? null;
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: attacker }),
        content: `<p>Vampiric Aura restores ${healed} Health.</p>`,
        flags: { "azeroth-rpg": { kind: "ability",
          featureKey: "ability:vampiric-aura",
          casting: false,
          source: source ?? null,
          targets: [], healed } } });
    }
    return { claimed, healed };
  } catch (error) {
    console.warn("azeroth-rpg | Vampiric Aura could not be confirmed; do not replay the heal", error);
    return { claimed, healed: 0, uncertain: true };
  } finally {
    busy.delete(messageId);
  }
}
