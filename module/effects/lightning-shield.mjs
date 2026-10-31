import { lightningShieldStart, lightningShieldDischarge } from "../rules/lightning-shield.mjs";

export const LIGHTNING_SHIELD_FLAG = "lightningShield";
const path = `flags.azeroth-rpg.${LIGHTNING_SHIELD_FLAG}`;
const queues = new Map();
const stateOf = effect => effect?.flags?.["azeroth-rpg"]?.[LIGHTNING_SHIELD_FLAG];
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const current = actor => actor?.documentName === "Actor" && fromUuidSync(actor.uuid) === actor;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Added to the ordinary spell carrier at creation, preserving its spell,
 * identifier, cast and duration metadata for Dispel and animation cleanup.
 */
export function lightningShieldCarrierState(actor, message, time = game.time?.worldTime) {
  const flags = message?.flags?.["azeroth-rpg"];
  if (flags?.identifier !== "lightning-shield" || flags.success === false) return null;
  return lightningShieldStart({ ownerUuid: actor?.uuid, castId: message?.uuid, time });
}

/** Caller must first persist a per-target claim on the original attack card.
 * This function only spends the charge. It returns the immutable damage plan
 * after confirming persistence; it never silently retries an uncertain write.
 */
export async function claimLightningShieldCharge({ owner, attacker, attackId, hit, melee, valid } = {}) {
  const uuid = owner?.uuid;
  const previous = queues.get(uuid) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    const check = () => gmHere() && current(owner) && current(attacker) && typeof valid === "function" && valid();
    if (!check()) return { ok: false, reason: "unavailable" };
    const carriers = [...owner.effects].filter(effect => stateOf(effect));
    if (carriers.length !== 1) return { ok: false, reason: carriers.length ? "conflictingCarriers" : "absent" };
    const effect = carriers[0], state = stateOf(effect), time = game.time?.worldTime;
    if (effect.flags?.["azeroth-rpg"]?.identifier !== "lightning-shield" || effect.origin !== owner.uuid)
      return { ok: false, reason: "foreignCarrier" };
    const plan = lightningShieldDischarge(state, { ownerUuid: owner.uuid, attackerUuid: attacker.uuid,
      attackId, hit, melee, time, disabled: effect.disabled === true || effect.active === false });
    if (!plan) return { ok: false, reason: "inactive" };
    try {
      await effect.update({ [path]: plan.next });
      if (!check() || owner.effects.get(effect.id) !== effect || !same(stateOf(effect), plan.next)
        || effect.disabled || effect.active === false || game.time.worldTime !== time)
        return { ok: false, reason: "claimUnconfirmed" };
      return { ok: true, effect, plan };
    } catch (error) {
      console.warn("azeroth-rpg | Lightning Shield charge write", error);
      return { ok: false, reason: "writeUncertain" };
    }
  });
  queues.set(uuid, task);
  try { return await task; }
  finally { if (queues.get(uuid) === task) queues.delete(uuid); }
}
