import { FIRE_SHIELD, FIRE_SHIELD_FLAG, fireShieldCarrier, fireShieldEffect } from "../rules/fire-shield.mjs";
import { roundsOrClock } from "./durations.mjs";

const queues = new Map();
const effectsOf = actor => [...(actor?.effects?.values?.() ?? actor?.effects ?? [])];
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** One carrier per recipient, across all imps. Recasting updates that carrier
 * and renews its duration; it cannot add a second retaliation or any Ward.
 * The caller claims payment and the target before invoking this function.
 */
export function layFireShield({ owner, caster, castId, valid } = {}) {
  if (!owner?.uuid || !caster?.uuid || typeof valid !== "function") return Promise.resolve(null);
  const prior = queues.get(owner.uuid) ?? Promise.resolve();
  const work = prior.then(async () => {
    const current = () => gmHere() && fromUuidSync(owner.uuid) === owner && fromUuidSync(caster.uuid) === caster && valid() === true;
    if (!current()) return null;
    const data = fireShieldEffect({ ownerUuid: owner.uuid, casterUuid: caster.uuid, castId,
      timing: roundsOrClock(owner, FIRE_SHIELD.rounds) });
    if (!data) return null;
    const previous = effectsOf(owner).filter(e => e.flags?.["azeroth-rpg"]?.[FIRE_SHIELD_FLAG]);
    if (previous.length > 1) return null;
    let effect = previous[0];
    if (effect) {
      const state = effect.flags["azeroth-rpg"][FIRE_SHIELD_FLAG];
      if (state.version !== 1 || state.ownerUuid !== owner.uuid) return null;
      if (state.castId === castId && state.casterUuid === caster.uuid) {
        return fireShieldCarrier([effect], owner.uuid) ? { ok: true, effectId: effect.id } : null;
      }
      await effect.update(data);
    } else [effect] = await owner.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!effect?.id || !current() || owner.effects.get(effect.id) !== effect
        || fireShieldCarrier(effectsOf(owner), owner.uuid) !== effect) return null;
    const state = effect.flags["azeroth-rpg"][FIRE_SHIELD_FLAG];
    if (state.castId !== castId || state.casterUuid !== caster.uuid
        || effect.duration?.value !== data.duration.value || effect.duration?.units !== data.duration.units
        || effect.start?.time !== data.start.time) return null;
    return { ok: true, effectId: effect.id };
  }).catch(() => null);
  queues.set(owner.uuid, work);
  return work.finally(() => { if (queues.get(owner.uuid) === work) queues.delete(owner.uuid); });
}
