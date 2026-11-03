/** Spell Relay changes a geometric origin, never the identity of a caster.
 * The adapter supplies V14 expiry, visibility and core-measured distance.
 * It commits consumption before attempting the relayed Casting Test. */
import { areaFor } from "./areas.mjs";

const ref = value => typeof value === "string" && value.length > 0 && value.length <= 240;
const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.y);
const no = reason => ({ok: false, reason});

export function createSpellRelay({cast, casterUuid, sceneId, origin} = {}) {
  if (![cast, casterUuid, sceneId].every(ref) || !point(origin)) return no("identity-or-point");
  return {ok: true, relay: {version: 1, cast, casterUuid, sceneId,
    origin: {x: origin.x, y: origin.y}, spentBy: null}};
}

/** `summons` and `teleports` describe the existing spell's mechanics, not words
 * guessed from its lore. Talent-adjusted dimensions may be passed as `area`;
 * their shape must still agree with the authored Target line. */
export function relaySpellRefusal(spell, {viaItem = false, summons = false, teleports = false} = {}) {
  const system = spell?.system;
  if (spell?.type !== "spell" || !system || system.identifier === "spell-relay") return "spell";
  if (viaItem || summons || teleports) return "excluded-source";
  if (!Number.isInteger(system.tier) || system.tier < 1 || system.tier > 3) return "tier";
  if (system.duration?.kind !== "instant") return "duration";
  if (!["cone", "line"].includes(areaFor(system.target)?.shape)) return "shape";
  return null;
}

export function attemptSpellRelay({relay, spell, attemptId, casterUuid, sceneId,
  distanceFt, seesRelay = false, seesArea = false, active = false, area = null,
  viaItem = false, summons = false, teleports = false} = {}) {
  if (!relay || relay.version !== 1 || relay.spentBy || !ref(relay.cast)
    || !point(relay.origin) || !ref(attemptId) || attemptId === relay.cast) return no("relay");
  if (active !== true || relay.casterUuid !== casterUuid || relay.sceneId !== sceneId) return no("inactive");
  if (!Number.isFinite(distanceFt) || distanceFt < 0 || distanceFt > 30) return no("range");
  if (seesRelay !== true || seesArea !== true) return no("visibility");
  const reason = relaySpellRefusal(spell, {viaItem, summons, teleports});
  if (reason) return no(reason);
  const authored = areaFor(spell.system.target);
  const shape = area ?? authored;
  if (shape.shape !== authored.shape || !Number.isFinite(shape.distanceFt) || shape.distanceFt <= 0) return no("area");
  return {ok: true, relay: {...relay, origin: {...relay.origin}, spentBy: attemptId},
    geometry: {sceneId, origin: {...relay.origin}, area: {...shape}, attach: false},
    casterUuid, attemptId};
}
