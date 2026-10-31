import { MADE_OF_FIRE, madeOfFireHit } from "../rules/made-of-fire.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { reachOf } from "../rules/distance.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
export const MADE_OF_FIRE_RETALIATION_QUERY = "azeroth-rpg.madeOfFireRetaliation";
const queues = new Map();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};
const activeMadeOfFire = actor => actor?.type === "npc"
  ? actor.system?.creatureAbilities?.find(row => row.name === MADE_OF_FIRE.name) ?? null : null;
const tokenAt = row => row?.sceneId && row?.tokenId ? game.scenes?.get(row.sceneId)?.tokens.get(row.tokenId) : null;
const targetAt = row => row?.sceneId && row?.tokenId
  ? game.scenes?.get(row.sceneId)?.tokens.get(row.tokenId)?.actor
  : row?.actorUuid ? fromUuidSync(row.actorUuid) : null;

export async function requestMadeOfFireRetaliation({ attacker, target, before, after, messageId } = {}) {
  if (!messageId || !target?.isOwner || !attacker?.uuid || !activeMadeOfFire(target)) return null;
  const data = { attackerUuid: attacker.uuid, targetUuid: target.uuid, before, after, messageId };
  const gm = game.users?.activeGM;
  if (!gm) return null;
  return gmHere() ? madeOfFireRetaliationQueryHandler(data, { user: game.user }) : gm.query(MADE_OF_FIRE_RETALIATION_QUERY, data);
}

/** Serialize all targets on the same attack card so simultaneous hits cannot
 * overwrite each other's receipts. The claim is persisted before damage. */
export async function madeOfFireRetaliationQueryHandler(data = {}, context = {}) {
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
    const carrier = activeMadeOfFire(target);
    const index = flagsOf(message).targets?.findIndex(row => targetAt(row) === target) ?? -1;
    const origin = tokenAt(flagsOf(message).source), defender = tokenAt(flagsOf(message).targets?.[index]);
    const position = token => JSON.stringify([token?.x, token?.y, token?.elevation, token?._source?.level]);
    const originPosition = position(origin), defenderPosition = position(defender);
    const geometry = () => {
      if (!origin || !defender || origin.actor !== attacker || defender.actor !== target
        || origin.parent !== defender.parent || tokenAt(flagsOf(message).source) !== origin
        || tokenAt(flagsOf(message).targets?.[index]) !== defender
        || position(origin) !== originPosition || position(defender) !== defenderPosition) return null;
      const level = defender._source?.level;
      if (!defender.parent?.levels?.has(level) || origin._source?.level !== level) return null;
      return { feet: feetApart(origin, defender), sameLevel: true,
        reach: Math.max(5, ...(target.system.attacks ?? []).filter(row => !row.range).map(row => reachOf(row.traits))) };
    };
    const valid = () => gmHere() && user && attacker?.documentName === "Actor" && target?.documentName === "Actor"
      && attacker !== target && fromUuidSync(attackerUuid) === attacker && fromUuidSync(targetUuid) === target
      && target.testUserPermission(user, "OWNER") && game.messages?.get(messageId) === message
      && ChatMessage.getSpeakerActor(message?.speaker) === attacker && attacker.system?.health?.value > 0
      && target.system?.health?.value <= after && targetAt(flagsOf(message).targets?.[index]) === target
      && carrier && activeMadeOfFire(target) === carrier
      && geometry() && madeOfFireHit({ flags: flagsOf(message), index, before, after, ...geometry() });
    if (!valid()) return { ok: false, claimed };
    const claims = flagsOf(message).madeOfFireRetaliationClaims ?? [];
    if (!Array.isArray(claims) || claims.some(row => row.targetUuid === targetUuid)) return { ok: false, claimed };
    const receipt = { targetUuid, attackerUuid, index, effectId: carrier.id ?? null };
    await message.update({ "flags.azeroth-rpg.madeOfFireRetaliationClaims": [...claims, receipt] });
    claimed = flagsOf(message).madeOfFireRetaliationClaims?.some(row => row.targetUuid === targetUuid && row.attackerUuid === attackerUuid && row.index === index) === true;
    if (!claimed || !valid()) return { ok: false, claimed };
    const lines = await strikeFromArea({ actor: attacker, caster: target,
      spell: { name: "Made of Fire", school: "fire", feature: true, isSpell: false, takesSpellpower: false },
      damage: { rating: MADE_OF_FIRE.damage, school: "fire" } });
    if (!Array.isArray(lines) || !lines.length) return { ok: false, claimed, uncertain: true };
    const source = flagsOf(message).targets[index];
    const victim = flagsOf(message).source;
    try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }),
      content: `<p><strong>Made of Fire</strong></p><p>${foundry.utils.escapeHTML(lines.join(" "))}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:made-of-fire-retaliation",
        casting: false, success: true, madeOfFireRetaliation: receipt,
        targets: victim ? [{ ...victim, actorUuid: attackerUuid }] : [] } } });
    } catch (error) { console.warn("azeroth-rpg | Made of Fire resolved; feedback unavailable", error); }
    return { ok: true, claimed, lines };
  } catch (error) {
    console.warn("azeroth-rpg | Made of Fire", error);
    return { ok: false, claimed, uncertain: true };
  }
}
