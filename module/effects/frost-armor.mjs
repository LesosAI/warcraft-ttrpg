import { frostArmorCarrier, frostArmorTriggered, frostArmorSlowEffect } from "../rules/frost-armor.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
export const FROST_ARMOR_QUERY = "azeroth-rpg.frostArmor";
const queues = new Map();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};
const targetAt = row => row?.sceneId && row?.tokenId
  ? game.scenes?.get(row.sceneId)?.tokens.get(row.tokenId)?.actor
  : row?.actorUuid ? fromUuidSync(row.actorUuid) : null;

export async function requestFrostArmor({ attacker, target, before, after, messageId } = {}) {
  if (!target?.isOwner || !attacker?.uuid || !messageId || !frostArmorCarrier(target.effects)) return null;
  const data = { attackerUuid: attacker.uuid, targetUuid: target.uuid, before, after, messageId };
  return gmHere() ? frostArmorQueryHandler(data, { user: game.user })
    : game.users?.activeGM?.query(FROST_ARMOR_QUERY, data);
}

export async function frostArmorQueryHandler(data = {}, context = {}) {
  if (!gmHere() || typeof data.messageId !== "string" || !data.messageId) return { ok: false, claimed: false };
  const prior = queues.get(data.messageId) ?? Promise.resolve();
  const task = prior.catch(() => {}).then(() => resolveSlow(data, context));
  queues.set(data.messageId, task);
  try { return await task; }
  finally { if (queues.get(data.messageId) === task) queues.delete(data.messageId); }
}

async function resolveSlow({ attackerUuid, targetUuid, before, after, messageId }, { user }) {
  let claimed = false, effect;
  try {
    const attacker = await fromUuid(attackerUuid), target = await fromUuid(targetUuid);
    const message = game.messages?.get(messageId), carrier = frostArmorCarrier(target?.effects);
    const index = flagsOf(message).targets?.findIndex(row => targetAt(row) === target) ?? -1;
    const timing = untilEndOfNextTurnOrRound(attacker);
    const valid = () => gmHere() && user && attacker?.documentName === "Actor" && target?.documentName === "Actor"
      && attacker !== target && fromUuidSync(attackerUuid) === attacker && fromUuidSync(targetUuid) === target
      && target.testUserPermission(user, "OWNER") && game.messages?.get(messageId) === message
      && ChatMessage.getSpeakerActor(message?.speaker) === attacker && attacker.system?.health?.value > 0
      && target.system?.health?.value <= after && targetAt(flagsOf(message).targets?.[index]) === target
      && carrier && frostArmorCarrier(target.effects) === carrier
      && JSON.stringify(untilEndOfNextTurnOrRound(attacker)) === JSON.stringify(timing)
      && frostArmorTriggered({ effects: target.effects, immunities: attacker.system?.conditionImmunities,
        hit: { flags: flagsOf(message), index, before, after } });
    if (!valid()) return { ok: false, claimed };
    const data = frostArmorSlowEffect({ sourceUuid: targetUuid, targetUuid: attackerUuid, messageUuid: message.uuid, timing });
    if (!data) return { ok: false, claimed };
    const claims = flagsOf(message).frostArmorClaims ?? [];
    if (!Array.isArray(claims) || claims.some(row => row.targetUuid === targetUuid)) return { ok: false, claimed };
    const receipt = { targetUuid, attackerUuid, index };
    await message.update({ "flags.azeroth-rpg.frostArmorClaims": [...claims, receipt] });
    claimed = flagsOf(message).frostArmorClaims?.some(row => row.targetUuid === targetUuid && row.attackerUuid === attackerUuid && row.index === index) === true;
    if (!claimed || !valid()) return { ok: false, claimed };
    [effect] = await attacker.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!effect?.id || ![...(attacker.effects ?? [])].includes(effect)) return { ok: false, claimed, uncertain: true };
    if (!valid()) {
      if (gmHere()) await attacker.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      return { ok: false, claimed, uncertain: !gmHere(), effectId: effect.id };
    }
    const source = flagsOf(message).targets[index];
    const victim = flagsOf(message).source;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }),
      content: "<p><strong>Frost Armor</strong></p><p>The melee attacker is Slowed until the end of its next turn.</p>",
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:frost-armor-slow",
        casting: false, success: true, frostArmor: receipt,
        targets: victim ? [{ ...victim, actorUuid: attackerUuid }] : [] } } });
    return { ok: true, claimed, effectId: effect.id };
  } catch (error) {
    console.warn("azeroth-rpg | Frost Armor", error);
    return { ok: false, claimed, uncertain: true, effectId: effect?.id ?? null };
  }
}

/** Remove only this withdrawn attack's slowing carrier; other slows retain their clocks. */
export async function withdrawFrostArmor(message) {
  if (!gmHere() || game.messages?.get(message?.id) !== message) return [];
  const removed = [];
  for (const claim of flagsOf(message).frostArmorClaims ?? []) {
    const hit = flagsOf(message).damageByTarget?.[claim.index];
    if (hit?.withdrawn !== true && hit?.hit !== false) continue;
    const attacker = await fromUuid(claim.attackerUuid);
    if (!gmHere() || attacker?.documentName !== "Actor") continue;
    const ids = [...(attacker.effects ?? [])].filter(effect => {
      const state = effect.flags?.["azeroth-rpg"]?.frostArmor;
      return state?.messageUuid === message.uuid && state.targetUuid === claim.attackerUuid
        && state.sourceUuid === claim.targetUuid && effect.origin === claim.targetUuid;
    }).map(effect => effect.id);
    if (ids.length) { await attacker.deleteEmbeddedDocuments("ActiveEffect", ids); removed.push(...ids); }
  }
  return removed;
}

export function registerFrostArmorHooks() {
  const clean = message => void withdrawFrostArmor(message).catch(error => {
    console.warn("azeroth-rpg | Frost Armor withdrawal", error);
    ui.notifications?.warn("Frost Armor's withdrawn slowing effect could not be removed. Check the attacker's effects.");
  });
  Hooks.on("updateChatMessage", clean);
  Hooks.on("ready", () => { for (const message of game.messages?.contents ?? []) clean(message); });
}
