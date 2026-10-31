import { claimLightningShieldCharge, LIGHTNING_SHIELD_FLAG } from "./lightning-shield.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { postLightningShieldDischarge } from "./lightning-shield-feedback.mjs";

const queues = new Map();
const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const targetAt = row => row?.sceneId && row?.tokenId ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`)?.actor
  : !row?.sceneId && !row?.tokenId && row?.actorUuid ? resolve(row.actorUuid) : null;
const sourceAt = message => {
  const row = flagsOf(message).source;
  return row ? targetAt(row) : ChatMessage.getSpeakerActor(message?.speaker);
};

/** Zero damage still constitutes a hit. Reflection and area damage are not
 * attack cards and cannot recursively trigger another shield. */
export function lightningShieldHitValid(message, index, attacker, owner) {
  const flags = flagsOf(message), hit = flags.damageByTarget?.[index];
  return gmHere() && resolve(message?.uuid) === message
    && attacker?.documentName === "Actor" && resolve(attacker.uuid) === attacker
    && owner?.documentName === "Actor" && resolve(owner.uuid) === owner && owner !== attacker
    && sourceAt(message) === attacker && targetAt(flags.targets?.[index]) === owner
    && attacker.testUserPermission(message.author, "OWNER")
    && Number.isInteger(index) && index >= 0 && index < (flags.targets?.length ?? 0)
    && flags.kind === "attack" && !flags.parry && !flags.notAttack && !flags.retaliation
    && flags.strike?.rangeKind === "melee" && message.rolls?.[0]?.outcome?.success === true
    && hit?.hit === true && hit.withdrawn !== true && Number.isFinite(hit.damage) && hit.damage >= 0
    && !projectionRefusal(owner, "ability") && !realmRefusalFor(owner, "ability")
    && !projectionRefusal(attacker, "ability") && !realmRefusalFor(attacker, "ability");
}

/** An attack-card claim survives shield removal. Uncertain writes are left
 * claimed for GM review, never retried as another charge or damage delivery. */
export async function resolveLightningShieldHit(message, index) {
  const task = (queues.get(message?.uuid) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const attacker = sourceAt(message), owner = targetAt(flagsOf(message).targets?.[index]);
    const valid = () => lightningShieldHitValid(message, index, attacker, owner);
    if (!valid()) return { ok: false, reason: "hit" };
    const carriers = [...owner.effects].filter(e => e.flags?.["azeroth-rpg"]?.[LIGHTNING_SHIELD_FLAG]);
    if (carriers.length !== 1) return { ok: false, reason: "absent" };
    const effect = carriers[0];
    const held = () => owner.effects.get(effect.id) === effect;
    const claims = flagsOf(message).lightningShieldClaims ?? [];
    if (!Array.isArray(claims)) return { ok: false, reason: "record" };
    if (claims.some(c => c.index === index || c.ownerUuid === owner.uuid)) return { ok: false, reason: "claimed" };
    let receipt = { index, ownerUuid: owner.uuid, attackerUuid: attacker.uuid, effectId: effect.id, phase: "claimed" };
    const confirmed = () => JSON.stringify(flagsOf(message).lightningShieldClaims?.find(c => c.index === index)) === JSON.stringify(receipt);
    const save = async patch => {
      if (!gmHere() || resolve(message.uuid) !== message || !confirmed()) return false;
      receipt = { ...receipt, ...patch };
      await message.update({ "flags.azeroth-rpg.lightningShieldClaims": flagsOf(message).lightningShieldClaims.map(c => c.index === index ? receipt : c) });
      return confirmed();
    };
    try {
      await message.update({ "flags.azeroth-rpg.lightningShieldClaims": [...claims, receipt] });
      if (!valid() || !held() || !confirmed()) return { ok: false, reason: "claimUnconfirmed" };
      const charge = await claimLightningShieldCharge({ owner, attacker, attackId: `${message.uuid}:${owner.uuid}`,
        hit: true, melee: true, valid: () => valid() && held() && confirmed() });
      if (!charge.ok) return charge;
      if (!await save({ phase: "discharging", remaining: charge.plan.next.charges }) || !valid() || !held())
        return { ok: false, reason: "changed" };
      const lines = await strikeFromArea({ actor: attacker, caster: owner,
        spell: { name: "Lightning Shield", school: "nature", takesSpellpower: false }, damage: charge.plan.damage });
      if (!await save({ phase: "delivered", lines })) return { ok: false, reason: "receiptUnconfirmed" };
      // Remove only the exhausted original carrier, never a newly cast shield.
      if (charge.plan.endsAfterDamage && held() && effect.flags?.["azeroth-rpg"]?.[LIGHTNING_SHIELD_FLAG]?.charges === 0) {
        await owner.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
        if (held()) return { ok: false, reason: "cleanupUnconfirmed" };
      }
      await postLightningShieldDischarge({ message, index, owner, attacker, remaining: charge.plan.next.charges, lines });
      return { ok: true, remaining: charge.plan.next.charges, lines };
    } catch (error) {
      console.warn("azeroth-rpg | Lightning Shield retaliation", error);
      return { ok: false, reason: "writeUncertain" };
    }
  });
  queues.set(message?.uuid, task);
  try { return await task; }
  finally { if (queues.get(message?.uuid) === task) queues.delete(message?.uuid); }
}
