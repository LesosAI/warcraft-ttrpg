import { commandDemonSightRefusal } from "./command-demon-sight.mjs";

export const COMMAND_DEMON_SIGHT_QUERY = "azeroth-rpg.commandDemonSight";
const unavailable = "AZEROTH.CommandDemon.SightUnavailable";
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
// Scene collections may arrive in a different order on the two clients.
const canonical = value => Array.isArray(value)
  ? value.map(canonical).sort((a, b) => a?._id && b?._id ? a._id.localeCompare(b._id) : 0)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

function sightState(owner, target, placement) {
  const sourceScene = game.scenes?.get(placement?.source?.sceneId);
  const source = sourceScene?.tokens.get(placement?.source?.tokenId);
  const destination = game.scenes?.get(placement?.target?.sceneId)?.tokens.get(placement?.target?.tokenId);
  if (!source || !destination || source.actor?.uuid !== owner?.uuid || destination.actorId !== target?.id
    || source.parent?.id !== destination.parent?.id) return null;
  // Include all scene sources: walls, light, levels, environment and tokens can
  // change sight. Never accept a positive answer from an older scene revision.
  const stamp = JSON.stringify(canonical({ scene: sourceScene.toObject(),
    ownerStatuses: [...owner.statuses].sort(), targetStatuses: [...(destination.actor?.statuses ?? [])].sort() }));
  return { source, destination, stamp };
}

/** Read-only reply on the caster's client. Only the active GM may request it. */
export function commandDemonSightHandler({ ownerUuid, actorUuid, placement } = {}, { user } = {}) {
  const owner = resolve(ownerUuid), target = resolve(actorUuid);
  if (!user?.isGM || user.id !== game.users?.activeGM?.id || !owner?.testUserPermission(game.user, "OWNER")) {
    return { ok: false, reason: unavailable };
  }
  const state = sightState(owner, target, placement);
  if (!state || canvas?.scene?.id !== state.source.parent.id) return { ok: false, reason: unavailable };
  const reason = owner.statuses.has("blinded") ? "AZEROTH.CommandDemon.CannotSee"
    : commandDemonSightRefusal(state.source.object, state.destination.object);
  return { ok: !reason, reason, stamp: state.stamp };
}

/** The writer asks the actual casting client, not whichever GM sees the board.
 * This function neither spends nor writes. The caller must revalidate its grant
 * and target after the awaited reply, before beginning adoption.
 */
export async function verifyCommandDemonSight(owner, target, placement, user) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id || !user
    || !owner.testUserPermission(user, "OWNER")) return unavailable;
  if (owner.statuses.has("blinded")) return "AZEROTH.CommandDemon.CannotSee";
  if (placement === null) return null; // Established off-scene table adjudication.
  const before = sightState(owner, target, placement);
  if (!before) return unavailable;
  const payload = { ownerUuid: owner.uuid, actorUuid: target.uuid, placement };
  let answer;
  try {
    answer = user.id === game.user.id ? commandDemonSightHandler(payload, { user: game.user })
      : await user.query(COMMAND_DEMON_SIGHT_QUERY, payload, { timeout: 5000 });
  } catch { return unavailable; }
  const after = sightState(owner, target, placement);
  if (game.users?.activeGM?.id !== game.user.id || !owner.testUserPermission(user, "OWNER") || !after || before.stamp !== after.stamp
    || answer?.stamp !== after.stamp) return unavailable;
  return answer?.ok === true ? null : answer?.reason === "AZEROTH.CommandDemon.CannotSee" ? answer.reason : unavailable;
}
