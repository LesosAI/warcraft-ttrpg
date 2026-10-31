import { sentinelThornsHit, SENTINEL_THORNS_DAMAGE } from "../rules/sentinel-thorns.mjs";
import { activeSentinelPowers } from "./anubisath-pack.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
export const SENTINEL_THORNS_QUERY = "azeroth-rpg.sentinelThorns";
const queues = new Map();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};
const targetAt = row => row?.sceneId && row?.tokenId
  ? game.scenes?.get(row.sceneId)?.tokens.get(row.tokenId)?.actor
  : row?.actorUuid ? fromUuidSync(row.actorUuid) : null;

export async function requestSentinelThorns({ attacker, target, before, after, messageId } = {}) {
  if (!messageId || !target?.isOwner || !attacker?.uuid || !activeSentinelPowers(target).includes("thorns")) return null;
  const data = { attackerUuid: attacker.uuid, targetUuid: target.uuid, before, after, messageId };
  const gm = game.users?.activeGM;
  if (!gm) return null;
  return gmHere() ? sentinelThornsQueryHandler(data, { user: game.user }) : gm.query(SENTINEL_THORNS_QUERY, data);
}

/** Serialize all targets on the same attack card so simultaneous hits cannot
 * overwrite each other's receipts. The claim is persisted before damage. */
export async function sentinelThornsQueryHandler(data = {}, context = {}) {
  if (!gmHere() || typeof data.messageId !== "string" || !data.messageId) return { ok: false, claimed: false };
  const previous = queues.get(data.messageId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => resolveThorns(data, context));
  queues.set(data.messageId, next);
  try { return await next; }
  finally { if (queues.get(data.messageId) === next) queues.delete(data.messageId); }
}

async function resolveThorns({ attackerUuid, targetUuid, before, after, messageId }, { user }) {
  let claimed = false;
  try {
    const attacker = await fromUuid(attackerUuid), target = await fromUuid(targetUuid);
    const message = game.messages?.get(messageId);
    const index = flagsOf(message).targets?.findIndex(row => targetAt(row) === target) ?? -1;
    const valid = () => gmHere() && user && attacker?.documentName === "Actor" && target?.documentName === "Actor"
      && attacker !== target && fromUuidSync(attackerUuid) === attacker && fromUuidSync(targetUuid) === target
      && target.testUserPermission(user, "OWNER") && game.messages?.get(messageId) === message
      && ChatMessage.getSpeakerActor(message?.speaker) === attacker && attacker.system?.health?.value > 0
      && target.system?.health?.value <= after && targetAt(flagsOf(message).targets?.[index]) === target
      && activeSentinelPowers(target).includes("thorns")
      && sentinelThornsHit({ flags: flagsOf(message), index, before, after });
    if (!valid()) return { ok: false, claimed };
    const claims = flagsOf(message).sentinelThornsClaims ?? [];
    if (!Array.isArray(claims) || claims.some(row => row.targetUuid === targetUuid)) return { ok: false, claimed };
    const receipt = { targetUuid, attackerUuid, index };
    await message.update({ "flags.azeroth-rpg.sentinelThornsClaims": [...claims, receipt] });
    claimed = flagsOf(message).sentinelThornsClaims?.some(row => row.targetUuid === targetUuid && row.attackerUuid === attackerUuid && row.index === index) === true;
    if (!claimed || !valid()) return { ok: false, claimed };
    const lines = await strikeFromArea({ actor: attacker, caster: target,
      spell: { name: "Sentinel Thorns", school: "nature", feature: true, isSpell: false, takesSpellpower: false },
      damage: { rating: SENTINEL_THORNS_DAMAGE, school: "nature" } });
    if (!Array.isArray(lines) || !lines.length) return { ok: false, claimed, uncertain: true };
    const source = flagsOf(message).targets[index];
    const victim = flagsOf(message).source;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }),
      content: `<p><strong>Sentinel Thorns</strong></p><p>${foundry.utils.escapeHTML(lines.join(" "))}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:sentinel-thorns",
        casting: false, success: true, sentinelThorns: receipt,
        targets: victim ? [{ ...victim, actorUuid: attackerUuid }] : [] } } });
    return { ok: true, claimed, lines };
  } catch (error) {
    console.warn("azeroth-rpg | Sentinel Thorns", error);
    return { ok: false, claimed, uncertain: true };
  }
}
