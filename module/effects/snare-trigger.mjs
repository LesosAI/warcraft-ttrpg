import { snareTriggerPlan } from "../rules/snare-trigger.mjs";

const pending = new Set();
const SCOPE = "azeroth-rpg";

/** Called by the active-GM movement door. The card owns the durable trigger claim. */
export async function triggerSnareRegion({ region, document, path, enterType, inflict } = {}) {
  const authority = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
  const scene = region?.parent;
  const actor = document?.actor;
  const regionFlags = region?.flags?.[SCOPE];
  const message = game.messages?.get(regionFlags?.messageId);
  const flags = message?.flags?.[SCOPE];
  const live = () => authority() && game.scenes?.get(scene?.id) === scene
    && scene.regions?.get(region.id) === region && scene.tokens?.get(document.id) === document
    && document.actor === actor && game.messages?.get(message?.id) === message;
  if (!authority() || !message || !actor || document.parent !== scene || document.hidden
    || !live() || pending.has(message.id) || (actor.system?.health?.value ?? 1) <= 0
    || flags?.kind !== "feature" || flags.featureKey !== "snare" || flags.success === false
    || (flags.cast ?? null) !== (regionFlags.cast ?? null) || !regionFlags.caster
    || (flags.caster && flags.caster !== regionFlags.caster)) return false;
  if (flags.snarePlacement != null && (flags.snarePlacement.phase !== "placed"
    || flags.snarePlacement.sceneId !== scene.id || flags.snarePlacement.regionId !== region.id)) return false;
  let entered;
  try { entered = document.segmentizeRegionMovementPath(region, path).some(segment => segment.type === enterType); }
  catch { return false; }
  if (!entered) return false;
  const reach = flags.snakeTrap?.reach ?? null;
  const inside = [];
  // Capture the complete circle on every Snare, not just Snake Trap rank 2.
  // Later resolution must use who was here when it fired, not current selection
  // or the occupants remaining after an asynchronous condition write.
  for (const token of scene.tokens) {
    if (!token.actor || token.hidden) continue;
    try { if (token.testInsideRegion(region)) inside.push(token.actor.uuid); }
    catch { return false; } // An incomplete radius snapshot must not authorize partial delivery.
  }
  const plan = snareTriggerPlan({ held: flags.snareTrigger ?? null, regionUuid: region.uuid,
    tokenUuid: document.uuid, actorUuid: actor.uuid, reach, inside });
  if (!plan.ok) return false;
  pending.add(message.id);
  try {
    const setter = await fromUuid(regionFlags.caster);
    if (!live() || !setter || (!flags.caster && setter.id !== message.speaker?.actor)
      || message.flags?.[SCOPE]?.snareTrigger != null) return false;
    await message.update({ "flags.azeroth-rpg.snareTrigger": plan.record });
    if (!live() || JSON.stringify(message.flags?.[SCOPE]?.snareTrigger) !== JSON.stringify(plan.record)) return false;
    const outcome = await inflict({ victim: actor, id: "entangled", by: setter,
      name: document.name ?? actor.name,
      // Do not relabel an unrelated Entangled effect as this Snare's escape.
      marks: actor.statuses?.has("entangled") ? {} : { snare: { source: setter.uuid } } });
    // Never retry a claimed delivery. An interrupted write remains visibly claimed for review.
    if (live()) await message.update({ "flags.azeroth-rpg.snareTrigger.phase": outcome && outcome.reason !== "error" ? "resolved" : "review",
      "flags.azeroth-rpg.snareTrigger.condition": { landed: outcome?.landed === true, reason: outcome?.reason ?? null } });
    return true;
  } finally { pending.delete(message.id); }
}
