import { bleakheartProc, BLEAKHEART } from "../rules/bleakheart.mjs";
import { sentinelThornsHit } from "../rules/sentinel-thorns.mjs";
import { layBleakheartCurse } from "./bleakheart.mjs";
import { postBleakheartResult } from "./bleakheart-feedback.mjs";

export const BLEAKHEART_QUERY = "azeroth-rpg.bleakheartHit";
const queues = new Map();
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};
const hasCurse = actor => actor?.type === "npc"
  && actor.system?.creatureAbilities?.some(row => row.name === BLEAKHEART.name);
const targetAt = row => row?.sceneId && row?.tokenId
  ? game.scenes?.get(row.sceneId)?.tokens.get(row.tokenId)?.actor
  : row?.actorUuid ? fromUuidSync(row.actorUuid) : null;

export async function requestBleakheartHit({ attacker, target, before, after, messageId } = {}) {
  if (!hasCurse(attacker) || !target?.isOwner || !messageId) return null;
  const data = { attackerUuid: attacker.uuid, targetUuid: target.uuid, before, after, messageId };
  return gmHere() ? bleakheartHitQueryHandler(data, { user: game.user })
    : game.users?.activeGM?.query(BLEAKHEART_QUERY, data, { timeout: 180000 });
}

/** Claim before rolling. Failed procs and uncertain rolls cannot be rerolled
 * by pressing Apply again, reconnecting, or handing control to another GM. */
export async function bleakheartHitQueryHandler(data = {}, context = {}) {
  if (!gmHere() || !context.user || typeof data.messageId !== "string" || !data.messageId) return { ok: false, claimed: false };
  const prior = queues.get(data.messageId) ?? Promise.resolve();
  const task = prior.catch(() => {}).then(() => resolveHit(data, context));
  queues.set(data.messageId, task);
  try { return await task; }
  finally { if (queues.get(data.messageId) === task) queues.delete(data.messageId); }
}

async function resolveHit({ attackerUuid, targetUuid, before, after, messageId }, { user }) {
  let claimed = false;
  try {
    const attacker = await fromUuid(attackerUuid), target = await fromUuid(targetUuid);
    const message = game.messages?.get(messageId);
    const index = flagsOf(message).targets?.findIndex(row => targetAt(row) === target) ?? -1;
    const clock = game.time.worldTime;
    const valid = () => gmHere() && game.time.worldTime === clock
      && attacker?.documentName === "Actor" && target?.documentName === "Actor" && attacker !== target
      && fromUuidSync(attackerUuid) === attacker && fromUuidSync(targetUuid) === target
      && game.messages?.get(messageId) === message && target.testUserPermission(user, "OWNER")
      && ChatMessage.getSpeakerActor(message?.speaker) === attacker && hasCurse(attacker)
      && attacker.system?.health?.value > 0 && target.system?.health?.value > 0
      && target.system.health.value <= after && targetAt(flagsOf(message).targets?.[index]) === target
      && sentinelThornsHit({ flags: flagsOf(message), index, before, after });
    if (!valid()) return { ok: false, claimed };
    const receipts = flagsOf(message).bleakheartClaims ?? [];
    if (!Array.isArray(receipts) || receipts.some(row => row.targetUuid === targetUuid)) return { ok: false, claimed };
    const receipt = { attackerUuid, targetUuid, index, state: "rolling" };
    const held = state => flagsOf(message).bleakheartClaims?.some(row => row.attackerUuid === attackerUuid
      && row.targetUuid === targetUuid && row.index === index && row.state === state);
    await message.update({ "flags.azeroth-rpg.bleakheartClaims": [...receipts, receipt] });
    claimed = held("rolling") === true;
    if (!claimed || !valid()) return { ok: false, claimed, uncertain: true };
    const roll = await new Roll("1d20").evaluate();
    const proc = bleakheartProc(roll.total);
    if (proc === null || !valid() || !held("rolling")) return { ok: false, claimed, uncertain: true };
    const resolved = { ...receipt, state: proc ? "applying" : "finished", face: roll.total };
    await message.update({ "flags.azeroth-rpg.bleakheartClaims": [...receipts, resolved] });
    if (!valid() || !held(resolved.state)) return { ok: false, claimed, uncertain: true };
    if (!proc) return { ok: true, claimed, proc: false };
    const result = await layBleakheartCurse({ victim: target, by: attacker, valid: () => valid() && held("applying") });
    if (!result.ok) return { ok: false, claimed, uncertain: true };
    await message.update({ "flags.azeroth-rpg.bleakheartClaims": [...receipts, { ...resolved, state: "finished", effectId: result.effectId }] });
    const ok = valid() && held("finished");
    if (ok) await postBleakheartResult({ victim: target, kind: "curse", preferred: flagsOf(message).targets[index],
      receipt: { ...resolved, state: "finished", effectId: result.effectId } });
    return { ok, claimed, proc: true, effectId: result.effectId };
  } catch (error) {
    console.warn("azeroth-rpg | Bleakheart curse could not be confirmed; inspect its attack receipt before correcting", error);
    return { ok: false, claimed, uncertain: true };
  }
}
