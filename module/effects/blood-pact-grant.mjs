import { BLOOD_PACT, bloodPactGrant } from "../rules/blood-pact.mjs";
import { TEMP_FLAG } from "../rules/temporary-health.mjs";
import { minuteSpan } from "./durations.mjs";

const queues = new Map();
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** A single recipient's grant. Different imps serialize their Blood Pacts on
 * this recipient; no movement observer or aura tick grants the buffer again.
 * The caller durably claims this recipient before invoking this operation.
 */
export function grantBloodPact({ actor, by, requestId, valid } = {}) {
  if (!actor?.uuid || !by?.uuid || typeof requestId !== "string" || !requestId.trim()
      || typeof valid !== "function") return Promise.resolve(null);
  const prior = queues.get(actor.uuid) ?? Promise.resolve();
  const work = prior.then(async () => {
    const current = () => writer() && fromUuidSync(actor.uuid) === actor && fromUuidSync(by.uuid) === by && valid() === true;
    if (!current()) return null;
    const plan = bloodPactGrant(actor.system?.health?.temp);
    if (!plan) return null;
    if (!plan.applies) return { ok: true, landed: false, reason: "existingBuffer", effectId: null };
    const span = minuteSpan(actor, BLOOD_PACT.minutes);
    if (!span || !current()) return null;
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "Blood Pact", img: "icons/magic/life/heart-shadow-red.webp", origin: by.uuid,
      description: "The remaining temporary Health from Blood Pact expires with this effect.",
      system: { changes: [] }, ...span,
      flags: { "azeroth-rpg": { bloodPact: { by: by.uuid, requestId } } }
    }]);
    if (!effect?.id || !current() || actor.effects.get(effect.id) !== effect) return null;
    // Another source may have granted a buffer while the carrier was created.
    const latest = bloodPactGrant(actor.system?.health?.temp);
    if (!latest) return null;
    if (!latest.applies) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      if (!current() || actor.effects.get(effect.id)) return null;
      return { ok: true, landed: false, reason: "existingBuffer", effectId: null };
    }
    const result = await actor.grantTemporaryHealth(BLOOD_PACT.amount, { source: "Blood Pact", span: "effect", effectId: effect.id });
    if (!current() || typeof result?.landed !== "boolean") return null;
    if (result.landed) {
      const record = actor.getFlag("azeroth-rpg", TEMP_FLAG);
      if (record?.effectId !== effect.id || actor.system.health.temp !== BLOOD_PACT.amount) return null;
      return { ok: true, landed: true, effectId: effect.id };
    }
    // A stronger simultaneous grant won. Removing only this unused carrier
    // cannot remove a buffer linked to a different effect.
    await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
    return current() && !actor.effects.get(effect.id)
      ? { ok: true, landed: false, reason: "existingBuffer", effectId: null } : null;
  }).catch(() => null);
  queues.set(actor.uuid, work);
  return work.finally(() => { if (queues.get(actor.uuid) === work) queues.delete(actor.uuid); });
}
