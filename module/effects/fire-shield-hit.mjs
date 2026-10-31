import { FIRE_SHIELD, FIRE_SHIELD_FLAG, fireShieldCarrier } from "../rules/fire-shield.mjs";
import { countsAsEnemy } from "../rules/distance.mjs";
import { standingOf, combatantIn } from "../canvas/engaged.mjs";
import { lightningShieldHitValid } from "./lightning-shield-hit.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { postFireShieldDischarge } from "./fire-shield-feedback.mjs";

const queues = new Map();
const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const tokenAt = row => row?.sceneId && row?.tokenId ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`) : null;
const actorAt = row => tokenAt(row)?.actor ?? (!row?.sceneId && !row?.tokenId ? resolve(row?.actorUuid) : null);
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const effectsOf = actor => [...(actor?.effects?.values?.() ?? actor?.effects ?? [])];

/** Use the original attack's tokens, not another token representing the actor. */
function enemyAt(message, index, owner, attacker) {
  const flags = flagsOf(message), source = tokenAt(flags.source), target = tokenAt(flags.targets?.[index]);
  const fight = owner.activeFight?.() ?? attacker.activeFight?.();
  return countsAsEnemy(
    standingOf(target ?? { actor: owner }, combatantIn(fight, owner, target), fight),
    standingOf(source ?? { actor: attacker }, combatantIn(fight, attacker, source), fight), { gm: true });
}

/** Claim on the original attack before delivery. A duplicate Apply, replacement
 * shield or uncertain damage write must never deliver the same retaliation twice.
 */
export async function resolveFireShieldHit(message, index) {
  const task = (queues.get(message?.uuid) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const flags = flagsOf(message);
    const attacker = flags.source ? actorAt(flags.source) : ChatMessage.getSpeakerActor(message?.speaker);
    const owner = actorAt(flags.targets?.[index]);
    const valid = () => lightningShieldHitValid(message, index, attacker, owner) && enemyAt(message, index, owner, attacker);
    if (!valid()) return { ok: false, reason: "hit" };
    const effect = fireShieldCarrier(effectsOf(owner), owner.uuid);
    if (!effect) return { ok: false, reason: "absent" };
    const castId = effect.flags["azeroth-rpg"][FIRE_SHIELD_FLAG].castId;
    const held = () => fireShieldCarrier(effectsOf(owner), owner.uuid) === effect
      && effect.flags["azeroth-rpg"][FIRE_SHIELD_FLAG].castId === castId;
    const claims = flagsOf(message).fireShieldClaims ?? [];
    if (!Array.isArray(claims)) return { ok: false, reason: "record" };
    if (claims.some(c => c.index === index || c.ownerUuid === owner.uuid)) return { ok: false, reason: "claimed" };
    let receipt = { index, ownerUuid: owner.uuid, attackerUuid: attacker.uuid, effectId: effect.id, castId, phase: "claimed" };
    const confirmed = () => JSON.stringify(flagsOf(message).fireShieldClaims?.find(c => c.index === index)) === JSON.stringify(receipt);
    const save = async patch => {
      if (!gmHere() || resolve(message.uuid) !== message || !confirmed()) return false;
      receipt = { ...receipt, ...patch };
      await message.update({ "flags.azeroth-rpg.fireShieldClaims": flagsOf(message).fireShieldClaims.map(c => c.index === index ? receipt : c) });
      return confirmed();
    };
    try {
      await message.update({ "flags.azeroth-rpg.fireShieldClaims": [...claims, receipt] });
      if (!valid() || !held() || !confirmed()) return { ok: false, reason: "claimUnconfirmed" };
      if (!await save({ phase: "discharging" }) || !valid() || !held()) return { ok: false, reason: "changed" };
      const lines = await strikeFromArea({ actor: attacker, caster: owner,
        spell: { name: FIRE_SHIELD.name, school: FIRE_SHIELD.school, feature: true, isSpell: false, takesSpellpower: false },
        damage: { rating: FIRE_SHIELD.amount, school: FIRE_SHIELD.school } });
      if (!await save({ phase: "delivered", lines })) return { ok: false, reason: "receiptUnconfirmed" };
      await postFireShieldDischarge({ message, index, owner, attacker, lines });
      return { ok: true, lines };
    } catch (error) {
      console.warn("azeroth-rpg | Fire Shield retaliation", error);
      return { ok: false, reason: "writeUncertain" };
    }
  });
  queues.set(message?.uuid, task);
  try { return await task; }
  finally { if (queues.get(message?.uuid) === task) queues.delete(message?.uuid); }
}
