import { snareTriggerPlan } from "../rules/snare-trigger.mjs";

const pending = new Set();
const SCOPE = "azeroth-rpg";

/** Called by the active-GM movement door. The card owns the durable trigger claim. */
export async function triggerSnareRegion({ region, document, path, enterType, inflict } = {}) {
  const writerId = game.user?.id;
  const authority = () => game.user?.isGM && game.user.id === writerId && game.users?.activeGM?.id === writerId;
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
  plan.record.writerId = writerId;
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
    if (!live() || JSON.stringify(message.flags?.[SCOPE]?.snareTrigger) !== JSON.stringify(plan.record)) return false;
    const completed = { ...plan.record, phase: outcome && outcome.reason !== "error" ? "resolved" : "review",
      condition: { landed: outcome?.landed === true, reason: outcome?.reason ?? null } };
    await message.update({ "flags.azeroth-rpg.snareTrigger": completed });
    return live() && JSON.stringify(message.flags?.[SCOPE]?.snareTrigger) === JSON.stringify(completed);
  } finally { pending.delete(message.id); }
}

const reviewHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;

export function snareTriggerRecoveryViews(actor) {
  if (!reviewHere() || !actor) return [];
  return Array.from(game.messages?.values?.() ?? []).flatMap(message => {
    const flags = message.flags?.[SCOPE], record = flags?.snareTrigger;
    if (flags?.kind !== 'feature' || flags.featureKey !== 'snare' || record?.actorUuid !== actor.uuid
      || !['claimed', 'review'].includes(record.phase)) return [];
    return [structuredClone({ actorUuid: actor.uuid, messageId: message.id, record,
      target: { health: actor.system?.health, effects: Array.from(actor.effects ?? []).map(effect => effect.toObject()) } })];
  });
}

/** The GM reconciles Entangled manually; recorded blast/poison targets then remain usable. */
export async function reviewSnareTrigger({ actorUuid, expected, acknowledged = false } = {}) {
  if (!reviewHere() || acknowledged !== true) return { ok: false, reason: 'permission' };
  const id = expected?.messageId, writerId = game.user.id;
  if (pending.has(id)) return { ok: false, reason: 'busy' };
  const actor = fromUuidSync(actorUuid), message = game.messages.get(id);
  const current = snareTriggerRecoveryViews(actor).find(row => row.messageId === id);
  if (!current || JSON.stringify(current) !== JSON.stringify(expected)) return { ok: false, reason: 'changed' };
  if (!current.record.writerId || (current.record.writerId !== writerId && game.users.get(current.record.writerId)?.active))
    return { ok: false, reason: 'writerActive' };
  const reviewed = { ...current.record, phase: 'resolved', reviewedFrom: current.record.phase,
    reviewedBy: writerId, reviewedAt: Date.now() };
  pending.add(id);
  try {
    await message.update({ 'flags.azeroth-rpg.snareTrigger': reviewed });
    return reviewHere() && game.user.id === writerId && game.messages.get(id) === message
      && JSON.stringify(message.flags?.[SCOPE]?.snareTrigger) === JSON.stringify(reviewed)
      ? { ok: true } : { ok: false, reason: 'unconfirmed' };
  } finally { pending.delete(id); }
}
