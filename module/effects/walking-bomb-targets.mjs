import { feetApart } from "../canvas/footprints.mjs";
import { standingOf, combatantIn } from "../canvas/engaged.mjs";
import { countsAsEnemy } from "../rules/distance.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { WALKING_BOMB_BLAST } from "../rules/walking-bomb.mjs";

const position = token => JSON.stringify([token.x, token.y, token.elevation, token._source?.level]);

/** Read the whole scene, independent of selected targets. This collects the
 * radius; intervening cover remains part of the GM's area review. */
export function walkingBombArea({ bomb, source } = {}) {
  const scene = game.scenes?.get(source?.sceneId);
  const origin = scene?.tokens.get(source?.tokenId);
  if (!scene || origin?.parent !== scene || origin.actor !== bomb
    || !scene.levels?.get(origin._source?.level)) return null;
  const originPosition = position(origin);
  const selected = new Set();
  const scan = () => {
    if (game.scenes?.get(scene.id) !== scene || scene.tokens.get(origin.id) !== origin
      || origin.actor !== bomb || position(origin) !== originPosition) return null;
    const fight = bomb.activeFight?.() ?? null;
    const mine = standingOf(origin, combatantIn(fight, bomb, origin), fight);
    const rows = [];
    for (const token of scene.tokens.values()) {
      if (token === origin || token.parent !== scene || !token.actor
        || token.actor.uuid === bomb.uuid || token._source?.level !== origin._source?.level) continue;
      const other = standingOf(token, combatantIn(fight, token.actor, token), fight);
      // An earlier delivery may kill this target. Its death must not invalidate
      // the same explosion before remaining targets and the bomb are resolved.
      const alreadySelected = selected.has(token);
      const relation = alreadySelected ? { ...other, health: 1, defeated: false } : other;
      // The GM resolves the area, including enemies hidden from the bomb.
      if (!countsAsEnemy(mine, relation, { gm: true })
        || (!alreadySelected && (other.defeated === true || !(other.health > 0))) || projectionRefusal(token.actor, "ability")
        || realmRefusalFor(token.actor, "ability")) continue;
      const distance = feetApart(origin, token);
      if (!Number.isFinite(distance) || distance < 0) return null;
      if (distance <= WALKING_BOMB_BLAST.radius) rows.push({ token, actor: token.actor,
        tokenUuid: token.uuid, actorUuid: token.actor.uuid, position: position(token), distance });
    }
    return rows;
  };
  const targets = scan();
  if (!targets) return null;
  targets.forEach(row => selected.add(row.token));
  const valid = () => {
    const now = scan();
    return !!now && now.length === targets.length && targets.every(row => now.some(next =>
      next.token === row.token && next.actor === row.actor && next.position === row.position));
  };
  return { scene, origin, targets, valid };
}
