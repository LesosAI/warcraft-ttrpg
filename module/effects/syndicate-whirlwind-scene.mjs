import { SYNDICATE_WHIRLWIND as SPEC, hasSyndicateWhirlwind } from "../rules/syndicate-whirlwind.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { projectionRefusal, projectionPhaseFor } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";

const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const position = token => ({ x: token.x, y: token.y, elevation: token.elevation, level: token._source?.level });

/** Current source facts for the pure channel clock. No canvas-view assumption
 * or client-supplied distance is used. A missing source stays unresolved.
 */
export function inspectWhirlwindSource(actor, record) {
  if (!writer() || actor?.uuid !== record?.actorUuid) return null;
  const source = fromUuidSync(record.tokenUuid), scene = source?.parent;
  if (source?.actor !== actor || game.scenes?.get(scene?.id) !== scene || scene.tokens?.get(source.id) !== source
    || !scene.levels?.get(source._source?.level)) return null;
  const fight = actor.activeFight?.();
  return { source, actorUuid: actor.uuid, tokenUuid: source.uuid, point: position(source), time: game.time?.worldTime,
    combat: fight?.started ? { id: fight.id, round: fight.round, actorUuid: fight.combatant?.actor?.uuid } : null,
    alive: actor.system?.health?.value > 0, attacks: actor.system?.attacks ?? [],
    interrupted: !!record.phase && !hasSyndicateWhirlwind(actor.system?.creatureAbilities),
    incapacitated: actor.statuses?.has("stunned") || !!projectionRefusal(actor, "ability") || !!sleepRefusal(actor, "ability")
      || !!despairRefusal(actor, "ability") || !!realmRefusalFor(actor, "ability") };
}

/** GM establishes hostility and physical cover for every nearby creature.
 * Disposition alone cannot distinguish all enemies at a tabletop encounter.
 * Review neither reveals hidden tokens nor alters their visibility.
 */
export async function reviewWhirlwindTargets({ actor, record, inspect = () => inspectWhirlwindSource(actor, record), choose } = {}) {
  const initial = inspect();
  if (!initial || !initial.alive || initial.incapacitated || initial.interrupted || typeof choose !== "function") return null;
  const source = initial.source, scene = source.parent;
  const stamp = state => JSON.stringify([state?.point, state?.time, state?.combat, state?.attacks]);
  const sourceStamp = stamp(initial);
  const walls = () => JSON.stringify([...(scene.walls?.values?.() ?? [])].map(wall => wall._source));
  const wallStamp = walls();
  const sourceValid = () => {
    const current = inspect();
    return writer() && current?.source === source && current.alive && !current.incapacitated && !current.interrupted
      && stamp(current) === sourceStamp && walls() === wallStamp;
  };
  const eligible = token => token !== source && token.actor?.uuid && token.actor !== actor
    && token.actor.system?.health?.value > 0 && token._source?.level === source._source?.level
    && !projectionPhaseFor(token.actor) && !realmRefusalFor(token.actor, "ability")
    && Number.isFinite(feetApart(source, token)) && feetApart(source, token) >= 0 && feetApart(source, token) <= SPEC.feet;
  const candidates = [...scene.tokens.values()].filter(eligible), selected = [], snapshots = new Map();
  for (const token of candidates) {
    if (!sourceValid()) return null;
    if (scene.tokens.get(token.id) !== token || !eligible(token)) continue;
    const victim = token.actor, point = JSON.stringify(position(token));
    const answer = await choose({ name: SPEC.name, id: `${source.id}-whirlwind-review` }, [
      { key: "include", name: `Attack ${token.name}`, description: "This creature is an enemy within reach, with no solid cover blocking the attack." },
      { key: "exclude", name: "Do not attack", description: "This creature is not an enemy or is behind solid cover." },
      { key: "cancel", name: "Stop review", description: "Leave this paid Whirlwind unresolved for GM review." }
    ], null, { prompt: "GM: Review every nearby creature. This selection does not reveal hidden creatures." });
    if (!answer || answer.key === "cancel" || !sourceValid()) return null;
    if (!["include", "exclude"].includes(answer.key)) return null;
    if (scene.tokens.get(token.id) !== token || token.actor !== victim || JSON.stringify(position(token)) !== point || !eligible(token)) return null;
    if (answer.key === "include") { selected.push(token); snapshots.set(token, { victim, point }); }
  }
  return { targets: selected, readCurrent: () => {
    if (!sourceValid()) return null;
    return { ...inspect(), targets: selected.filter(token => scene.tokens.get(token.id) === token
      && token.actor === snapshots.get(token).victim && JSON.stringify(position(token)) === snapshots.get(token).point && eligible(token)) };
  } };
}
