import { sentinelThornsHit } from "../rules/sentinel-thorns.mjs";
import { JADEFIRE } from "../rules/jadefire.mjs";
import { activeJadefire } from "./jadefire.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
export const JADEFIRE_RETALIATION_QUERY = "azeroth-rpg.jadefireRetaliation";
const queues = new Map();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};
const targetAt = row => row?.sceneId && row?.tokenId
  ? game.scenes?.get(row.sceneId)?.tokens.get(row.tokenId)?.actor
  : row?.actorUuid ? fromUuidSync(row.actorUuid) : null;

export async function requestJadefireRetaliation({ attacker, target, before, after, messageId } = {}) {
  if (!messageId || !target?.isOwner || !attacker?.uuid || !activeJadefire(target)) return null;
  const data = { attackerUuid: attacker.uuid, targetUuid: target.uuid, before, after, messageId };
  const gm = game.users?.activeGM;
  if (!gm) return null;
  return gmHere() ? jadefireRetaliationQueryHandler(data, { user: game.user }) : gm.query(JADEFIRE_RETALIATION_QUERY, data);
}

/** Serialize all targets on the same attack card so simultaneous hits cannot
 * overwrite each other's receipts. The claim is persisted before damage. */
export async function jadefireRetaliationQueryHandler(data = {}, context = {}) {
  if (!gmHere() || typeof data.messageId !== "string" || !data.messageId) return { ok: false, claimed: false };
  const previous = queues.get(data.messageId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => resolveRetaliation(data, context));
  queues.set(data.messageId, next);
  try { return await next; }
  finally { if (queues.get(data.messageId) === next) queues.delete(data.messageId); }
}

async function resolveRetaliation({ attackerUuid, targetUuid, before, after, messageId }, { user }) {
  let claimed = false;
  try {
    const attacker = await fromUuid(attackerUuid), target = await fromUuid(targetUuid);
    const message = game.messages?.get(messageId);
    const carrier = activeJadefire(target);
    const index = flagsOf(message).targets?.findIndex(row => targetAt(row) === target) ?? -1;
    const valid = () => gmHere() && user && attacker?.documentName === "Actor" && target?.documentName === "Actor"
      && attacker !== target && fromUuidSync(attackerUuid) === attacker && fromUuidSync(targetUuid) === target
      && target.testUserPermission(user, "OWNER") && game.messages?.get(messageId) === message
      && ChatMessage.getSpeakerActor(message?.speaker) === attacker && attacker.system?.health?.value > 0
      && target.system?.health?.value <= after && targetAt(flagsOf(message).targets?.[index]) === target
      && carrier && activeJadefire(target) === carrier
      && sentinelThornsHit({ flags: flagsOf(message), index, before, after });
    if (!valid()) return { ok: false, claimed };
    const claims = flagsOf(message).jadefireRetaliationClaims ?? [];
    if (!Array.isArray(claims) || claims.some(row => row.targetUuid === targetUuid)) return { ok: false, claimed };
    const receipt = { targetUuid, attackerUuid, index, effectId: carrier.id ?? null };
    await message.update({ "flags.azeroth-rpg.jadefireRetaliationClaims": [...claims, receipt] });
    claimed = flagsOf(message).jadefireRetaliationClaims?.some(row => row.targetUuid === targetUuid && row.attackerUuid === attackerUuid && row.index === index) === true;
    if (!claimed || !valid()) return { ok: false, claimed };
    const lines = await strikeFromArea({ actor: attacker, caster: target,
      spell: { name: "Jadefire", school: "fire", feature: true, isSpell: false, takesSpellpower: false },
      damage: { rating: JADEFIRE.damage, school: "fire" } });
    if (!Array.isArray(lines) || !lines.length) return { ok: false, claimed, uncertain: true };
    const source = flagsOf(message).targets[index];
    const victim = flagsOf(message).source;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }),
      content: `<p><strong>Jadefire</strong></p><p>${foundry.utils.escapeHTML(lines.join(" "))}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:jadefire-retaliation",
        casting: false, success: true, jadefireRetaliation: receipt,
        targets: victim ? [{ ...victim, actorUuid: attackerUuid }] : [] } } });
    return { ok: true, claimed, lines };
  } catch (error) {
    console.warn("azeroth-rpg | Jadefire", error);
    return { ok: false, claimed, uncertain: true };
  }
}
