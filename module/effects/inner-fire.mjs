import { INNER_FIRE_FLAG, innerFireSpend } from "../rules/inner-fire.mjs";
const queues = new Map();
const stateOf = effect => effect?.flags?.["azeroth-rpg"]?.[INNER_FIRE_FLAG];
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** Casting and charge writes share a queue so a refresh cannot be overwritten
 * by a charge computed from the previous cast. */
export async function withInnerFireLock(uuid, work) {
  const task = (queues.get(uuid) ?? Promise.resolve()).catch(() => {}).then(work);
  queues.set(uuid, task);
  try { return await task; }
  finally { if (queues.get(uuid) === task) queues.delete(uuid); }
}

/** Called after damage and an independent attack-card claim. The caller's
 * validation pins that claim, resolved damage and the original cast identity.
 */
export async function spendInnerFireCharge({ owner, castId, attackId, hit, weapon, damageApplied, valid } = {}) {
  const uuid = owner?.uuid;
  return withInnerFireLock(uuid, async () => {
    const check = () => writer() && owner?.documentName === "Actor" && fromUuidSync(uuid) === owner
      && typeof valid === "function" && valid();
    if (!check()) return { ok: false, reason: "authority" };
    const carriers = [...(owner.effects ?? [])].filter(effect => stateOf(effect));
    if (carriers.length !== 1) return { ok: false, reason: carriers.length ? "conflictingCarriers" : "absent" };
    const effect = carriers[0];
    if (effect.origin !== uuid || effect.flags?.["azeroth-rpg"]?.identifier !== "inner-fire")
      return { ok: false, reason: "foreignCarrier" };
    const time = game.time?.worldTime;
    const plan = innerFireSpend(stateOf(effect), { ownerUuid: uuid, castId, attackId, hit, weapon, damageApplied, time,
      disabled: effect.disabled === true || effect.active === false || effect.isSuppressed === true || effect.duration?.expired === true });
    if (!plan) return { ok: false, reason: "ineligible" };
    try {
      // Exhaustion removes AP in the same persisted write as the last charge.
      await effect.update({ [`flags.azeroth-rpg.${INNER_FIRE_FLAG}`]: plan.next,
        name: `Inner Fire (${plan.next.charges} charges)`,
        ...(plan.exhausted ? { disabled: true } : {}) });
      if (!check() || owner.effects.get(effect.id) !== effect || game.time.worldTime !== time
        || JSON.stringify(stateOf(effect)) !== JSON.stringify(plan.next)
        || (plan.exhausted && effect.disabled !== true)) return { ok: false, reason: "writeUnconfirmed" };
      if (plan.exhausted) {
        await owner.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
        if (!check() || owner.effects.get(effect.id)) return { ok: false, reason: "cleanupUnconfirmed" };
      }
      return { ok: true, charges: plan.next.charges, exhausted: plan.exhausted };
    } catch { return { ok: false, reason: "writeUncertain" }; }
  });
}
