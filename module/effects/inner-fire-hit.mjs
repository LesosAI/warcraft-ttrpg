import { spendInnerFireCharge } from "./inner-fire.mjs";
import { INNER_FIRE_FLAG, innerFireActive } from "../rules/inner-fire.mjs";

const queues = new Map();
const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const actorAt = row => row?.sceneId && row?.tokenId
  ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`)?.actor
  : !row?.sceneId && !row?.tokenId ? resolve(row?.actorUuid) : null;

/** Capture before applying damage, never select a new buff after the blow. */
export function innerFireHitSnapshot(owner) {
  const carriers = [...(owner?.effects ?? [])].filter(effect => effect.flags?.["azeroth-rpg"]?.[INNER_FIRE_FLAG]);
  if (carriers.length !== 1) return null;
  const effect = carriers[0], state = effect.flags["azeroth-rpg"][INNER_FIRE_FLAG];
  if (effect.origin !== owner.uuid || effect.flags["azeroth-rpg"].identifier !== "inner-fire"
    || !innerFireActive(state, { ownerUuid: owner.uuid, time: game.time?.worldTime,
      disabled: effect.disabled === true || effect.active === false || effect.isSuppressed === true || effect.duration?.expired === true })) return null;
  return { ownerUuid: owner.uuid, effectId: effect.id, castId: state.castId };
}

/** The authorized damage door supplies actual damage (including temp Health),
 * not the card's pre-reaction number. This function never applies damage.
 */
export async function resolveInnerFireHit({ message, index, snapshot, damageApplied } = {}) {
  const key = message?.uuid;
  const task = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const owner = actorAt(flagsOf(message).targets?.[index]);
    const source = flagsOf(message).source;
    const attacker = source ? actorAt(source) : ChatMessage.getSpeakerActor(message?.speaker);
    const valid = () => {
      const flags = flagsOf(message), row = flags.damageByTarget?.[index];
      const armor = flags.targets?.[index]?.innerFire;
      return writer() && resolve(message?.uuid) === message && Number.isInteger(index) && index >= 0
        && owner?.documentName === "Actor" && resolve(owner.uuid) === owner && owner.uuid === snapshot?.ownerUuid
        && actorAt(flags.targets?.[index]) === owner && attacker?.documentName === "Actor" && attacker !== owner
        && armor?.ownerUuid === snapshot?.ownerUuid && armor?.castId === snapshot?.castId
        && armor?.effectId === snapshot?.effectId
        && resolve(attacker.uuid) === attacker && attacker.testUserPermission(message.author, "OWNER")
        && (flags.source ? actorAt(flags.source) : ChatMessage.getSpeakerActor(message.speaker)) === attacker
        && flags.kind === "attack" && !flags.notAttack && !flags.parry && !flags.retaliation
        && ["melee", "ranged"].includes(flags.strike?.rangeKind)
        && message.rolls?.[0]?.outcome?.success === true && row?.hit === true && row.withdrawn !== true
        && Number.isFinite(damageApplied) && damageApplied > 0;
    };
    if (!valid()) return { ok: false, reason: "hit" };
    const current = innerFireHitSnapshot(owner);
    if (!current || current.castId !== snapshot.castId || current.effectId !== snapshot.effectId)
      return { ok: false, reason: "changedCarrier" };
    const claims = flagsOf(message).innerFireClaims ?? [];
    if (!Array.isArray(claims)) return { ok: false, reason: "record" };
    if (claims.some(row => row.index === index || row.ownerUuid === owner.uuid)) return { ok: false, reason: "claimed" };
    const receipt = { ...snapshot, index, damageApplied, phase: "claimed" };
    const confirmed = () => JSON.stringify(flagsOf(message).innerFireClaims?.find(row => row.index === index)) === JSON.stringify(receipt);
    try {
      await message.update({ "flags.azeroth-rpg.innerFireClaims": [...claims, receipt] });
      if (!valid() || !confirmed()) return { ok: false, reason: "claimUnconfirmed" };
      const result = await spendInnerFireCharge({ owner, castId: snapshot.castId,
        attackId: `${message.uuid}:${owner.uuid}`, hit: true, weapon: true, damageApplied,
        valid: () => valid() && confirmed() });
      if (!result.ok) return result;
      await message.update({ "flags.azeroth-rpg.innerFireClaims": flagsOf(message).innerFireClaims.map(row =>
        row.index === index ? { ...receipt, phase: "spent", remaining: result.charges } : row) });
      const saved = flagsOf(message).innerFireClaims?.find(row => row.index === index);
      if (!writer() || saved?.phase !== "spent" || saved.remaining !== result.charges)
        return { ok: false, reason: "receiptUnconfirmed" };
      return result;
    } catch { return { ok: false, reason: "writeUncertain" }; }
  });
  queues.set(key, task);
  try { return await task; }
  finally { if (queues.get(key) === task) queues.delete(key); }
}
