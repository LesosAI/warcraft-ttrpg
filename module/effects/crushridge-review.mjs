import { CRUSHRIDGE, crushridgeRecipients } from "../rules/crushridge.mjs";
import { feetApart } from "../canvas/footprints.mjs";
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const position = token => JSON.stringify([token.x, token.y, token.elevation, token._source?.level]);
const has = (actor, name) => actor?.system?.creatureAbilities?.some(row => row.name === name);

/** Capture synchronously at the observed death, before any dialog or await.
 * Kinship and witnessing still require the GM; proximity is historical evidence. */
export function captureCrushridgeDeath(source) {
  const scene = source?.parent, time = globalThis.game?.time?.worldTime;
  if (!scene || !source.actor?.uuid || !Number.isInteger(time)
    || !scene.levels?.get(source._source?.level)) return null;
  const candidates = [...scene.tokens.values()].flatMap(token => {
    const feet = feetApart(source, token);
    return token !== source && token.actor !== source.actor && token.actor?.type === "npc"
      && token.actor.system?.health?.value > 0 && has(token.actor, CRUSHRIDGE.recipientAbility)
      && token._source?.level === source._source?.level && Number.isFinite(feet) && feet >= 0 && feet <= CRUSHRIDGE.feet
      ? [{ tokenUuid: token.uuid, actorUuid: token.actor.uuid, point: position(token), feet }] : [];
  });
  return { version: 1, time, sourceUuid: source.uuid, actorUuid: source.actor.uuid,
    sourcePoint: position(source), candidates };
}

/** Review the actual death source and its recorded candidates. Token disposition
 * is not evidence of kinship or sight; hidden tokens are never revealed. */
export async function reviewCrushridgeDeath({ source, eventId, validEvent, choose, observation } = {}) {
  if (!writer() || !source?.actor || !source.parent || !eventId
    || typeof validEvent !== "function" || typeof choose !== "function") return null;
  const scene = source.parent, donor = source.actor, sourcePoint = position(source), time = game.time?.worldTime;
  if (observation?.version !== 1 || observation.sourceUuid !== source.uuid || observation.actorUuid !== donor.uuid
    || observation.sourcePoint !== sourcePoint || !Number.isInteger(observation.time) || !Number.isInteger(time)
    || observation.time > time || !Array.isArray(observation.candidates)
    || observation.candidates.some(row => !row?.tokenUuid || !row.actorUuid || typeof row.point !== "string"
      || !Number.isFinite(row.feet) || row.feet < 0 || row.feet > CRUSHRIDGE.feet)
    || new Set(observation.candidates.map(row => row.tokenUuid)).size !== observation.candidates.length) return null;
  const observed = new Map(observation.candidates.map(row => [row.tokenUuid, row]));
  const walls = () => JSON.stringify([...(scene.walls?.values?.() ?? [])].map(wall => wall._source));
  const wallStamp = walls();
  const sourceValid = () => writer() && validEvent() && game.scenes?.get(scene.id) === scene
    && scene.tokens?.get(source.id) === source && source.actor === donor && donor.system?.health?.value <= 0
    && has(donor, CRUSHRIDGE.donorAbility) && position(source) === sourcePoint
    && scene.levels?.get(source._source?.level) && game.time?.worldTime === time && walls() === wallStamp;
  const eligible = token => {
    const evidence = observed.get(token.uuid);
    return token !== source && token.actor?.type === "npc" && token.actor !== donor
      && token.actor.system?.health?.value > 0 && has(token.actor, CRUSHRIDGE.recipientAbility)
      && evidence?.actorUuid === token.actor.uuid;
  };
  if (!sourceValid()) return null;
  if (time >= observation.time + CRUSHRIDGE.seconds) return { eventId, targets: [], validTarget: () => false };
  const selected = [], snapshots = new Map();
  for (const token of [...scene.tokens.values()].filter(eligible)) {
    if (!sourceValid() || !eligible(token)) return null;
    const actor = token.actor, point = position(token);
    const answer = await choose({ name: "Fallen-Kin Rage", id: `${source.id}-fallen-kin` }, [
      { key: "include", name: `Enrage ${token.name}`, description: "This Warmonger is allied kin and witnessed this ogre's death." },
      { key: "exclude", name: "Do not enrage", description: "This creature is not allied kin or did not witness the death." },
      { key: "cancel", name: "Stop review", description: "Leave this death event pending for GM review." }
    ], null, { prompt: `GM: Confirm kinship and witnessing at the recorded death (world time ${observation.time}), not the current positions. Only creatures nearby at that death are listed. This does not reveal hidden tokens or start attacks.` });
    if (!sourceValid() || !["include", "exclude"].includes(answer?.key)
      || scene.tokens.get(token.id) !== token || token.actor !== actor || position(token) !== point || !eligible(token)) return null;
    if (answer.key === "include") {
      selected.push(token); snapshots.set(token, { actor, point });
    }
  }
  const validTarget = token => sourceValid() && snapshots.has(token) && scene.tokens.get(token.id) === token
    && token.actor === snapshots.get(token).actor && position(token) === snapshots.get(token).point && eligible(token);
  const pure = crushridgeRecipients(selected.map(token => ({ tokenUuid: token.uuid, actorUuid: token.actor.uuid,
    feet: observed.get(token.uuid).feet, alive: true, kin: true, witnessed: true, sameLevel: true, recipient: true })));
  return pure ? { eventId, targets: selected, validTarget } : null;
}
