/**
 * **STARWEAVE AND SKYFALL ON THE BOARD** (07 §11; the spell audit, D-1705, D-1710). The law is
 * `rules/starweave.mjs`; this reads the scene's Regions and writes the link.
 *
 * - **The link is written as the Starweave's Region is created** (`stampAreaLinks`, a
 *   `preCreateRegion` hook on the creating client): the caster's sustained Starfall whose area
 *   holds the Starweave's centre, by Region and cast, through core's `Region#testPoint`.
 * - **Placement waits on a point inside that Starfall** (`castIntoAim`): *Cast into an area where
 *   you are sustaining Starfall*, refused in words while the pick waits on. Skyfall's point must
 *   lie inside the caster's own Starweave (*The area must be your Starweave*).
 * - **Skyfall ends the Starweave it lands on** (*The Starweave ends*): its Region records the
 *   Starweave (`ENDS_AREA`) and the active GM's sweep takes that Region off
 *   (`canvas/sustained-areas.mjs#areaRecord`'s `consumed`).
 * - **The Starfall reads the link** (`starweaveDoubles`): two creatures a turn while a live timed
 *   Starweave names that Starfall cast (`effects/starfall-turn.mjs`, `effects/starfall-use.mjs`).
 */

import { STARWEAVE_LINK, starweaveLinkFor, starweaveLinkLive } from "../rules/starweave.mjs";
import { shapeCentre } from "../rules/area-ticks.mjs";

export { STARWEAVE_LINK };

/** The Region flag a Skyfall writes naming the Starweave it ends. */
export const ENDS_AREA = "endsArea";

const scope = "azeroth-rpg";
const flagsOf = region => region?.flags?.[scope] ?? {};
const snapshot = region => ({ uuid: region.uuid, sceneId: region.parent?.id, identifier: flagsOf(region).identifier,
  caster: flagsOf(region).caster, cast: flagsOf(region).cast, sustained: flagsOf(region).sustained === true });
const heldOf = actor => {
  const held = actor?.getFlag?.(scope, "sustaining") ?? [];
  return Array.isArray(held) ? held : [];
};
const actorOf = uuid => {
  try { return uuid ? fromUuidSync(uuid) : null; } catch { return null; }
};

/** Whether a point (canvas pixels) lies inside a Region, at the Region's own floor. */
function inside(region, point) {
  if (!region || !point) return false;
  const bottom = Number(region.elevation?.bottom);
  try { return region.testPoint({ x: point.x, y: point.y, elevation: Number.isFinite(bottom) ? bottom : 0 }) === true; }
  catch { return false; }
}

/** The caster's live sustained Starfall Regions on a scene, as `starweaveLinkFor` reads them, for a point. */
function fallsAt(scene, caster, point) {
  return [...(scene?.regions ?? [])].filter(region => flagsOf(region).identifier === "starfall")
    .map(region => ({ ...snapshot(region), contains: inside(region, point) }))
    .sort((a, b) => String(a.uuid).localeCompare(String(b.uuid)));
}

/** The caster's Starweave Regions on a scene whose link still stands, sorted by uuid. */
export function liveStarweaves(scene, caster) {
  if (!scene?.regions || !caster?.uuid) return [];
  const held = heldOf(caster);
  const regions = [...scene.regions];
  return regions.filter(region => {
    const f = flagsOf(region);
    if (f.identifier !== "starweave" || f.caster !== caster.uuid) return false;
    const link = f[STARWEAVE_LINK];
    const fall = regions.find(r => r.uuid === link?.starfall?.regionUuid) ?? null;
    return starweaveLinkLive(link, { casterUuid: caster.uuid, sceneId: scene.id, starweave: snapshot(region),
      starfall: fall ? snapshot(fall) : null, held });
  }).sort((a, b) => String(a.uuid).localeCompare(String(b.uuid)));
}

/**
 * **WHETHER THIS STARFALL STRIKES TWO CREATURES** (D-1710): a live timed Starweave of the caster's
 * on the scene names this very Starfall Region and its cast.
 *
 * @param {Actor} caster
 * @param {Scene} scene
 * @param {RegionDocument} starfall
 * @returns {boolean}
 */
export function starweaveDoubles(caster, scene, starfall) {
  if (!starfall?.uuid) return false;
  const cast = flagsOf(starfall).cast;
  return liveStarweaves(scene, caster).some(region => {
    const link = flagsOf(region)[STARWEAVE_LINK];
    return link?.starfall?.regionUuid === starfall.uuid && link.starfall.cast === cast;
  });
}

/**
 * **THE LINK, WRITTEN AS THE REGION IS CREATED** (`preCreateRegion`, on the creating client):
 * a Starweave takes the Starfall its centre lies in, a Skyfall the Starweave its centre lies in.
 * Nothing is written where nothing qualifies: an unlinked Starweave does nothing, and a Skyfall
 * that names no Starweave ends none.
 *
 * @param {RegionDocument} region  the pending document
 * @returns {object|null}  what was stamped
 */
export function stampAreaLinks(region) {
  const f = flagsOf(region);
  if (!["starweave", "skyfall"].includes(f.identifier) || !f.cast || !f.caster) return null;
  const scene = region.parent ?? null;
  const caster = actorOf(f.caster);
  const centre = shapeCentre(region._source?.shapes?.[0] ?? region.shapes?.[0] ?? null);
  if (!scene || !caster || !centre) return null;
  if (f.identifier === "starweave") {
    const found = starweaveLinkFor({ casterUuid: caster.uuid, sceneId: scene.id,
      starweave: { cast: f.cast, identifier: "starweave" }, falls: fallsAt(scene, caster, centre), held: heldOf(caster) });
    if (!found.ok) return null;
    region.updateSource({ [`flags.${scope}.${STARWEAVE_LINK}`]: found.link });
    return found.link;
  }
  const weave = liveStarweaves(scene, caster).find(r => inside(r, centre)) ?? null;
  if (!weave) return null;
  const ends = { regionUuid: weave.uuid, cast: flagsOf(weave).cast };
  region.updateSource({ [`flags.${scope}.${ENDS_AREA}`]: ends });
  return ends;
}

/**
 * **THE ONE HOOK**: `preCreateRegion`, on the client creating the Region (a player's pick included),
 * so the link is part of the creation and never a second write. Registered by
 * `canvas/sustained-areas.mjs#registerSustainedAreaHooks`. It deletes nothing, so it is not one of the
 * active GM's hooks there.
 */
export function registerAreaLinkHooks() {
  Hooks.on("preCreateRegion", region => {
    try { stampAreaLinks(region); } catch (err) { console.warn("azeroth-rpg | a Starweave link was not written", err); }
  });
}

/**
 * **WHERE THE AREA MAY BE PLACED** (*Cast into an area where you are sustaining Starfall*; *The area
 * must be your Starweave*): a point predicate for the pick, refusing in words while it waits on, or
 * null for every other spell.
 *
 * @param {Actor} caster
 * @param {Item|null} item  the spell
 * @param {Scene|null} scene  the board the pick is on
 * @returns {((point: {x: number, y: number}) => boolean)|null}
 */
export function castIntoAim(caster, item, scene) {
  const id = item?.system?.identifier ?? null;
  if (!caster || !scene || !["starweave", "skyfall"].includes(id)) return null;
  return point => {
    const ok = id === "starweave"
      ? starweaveLinkFor({ casterUuid: caster.uuid, sceneId: scene.id, starweave: { cast: "aim", identifier: "starweave" },
        falls: fallsAt(scene, caster, point), held: heldOf(caster) }).ok
      : liveStarweaves(scene, caster).some(region => inside(region, point));
    if (!ok) ui.notifications?.warn(game.i18n.format(id === "starweave" ? "AZEROTH.Starweave.AimOutside" : "AZEROTH.Starweave.SkyfallOutside", { name: item.name }));
    return ok;
  };
}

/**
 * **WHAT THE BOARD HOLDS, FOR A READER** (the GM's inventory; no write): every Starweave of the
 * caster's on the scene, linked and live or with the reason it is not.
 *
 * @param {Actor} caster
 * @param {Scene} scene
 * @returns {{ok: true, links: object[], unresolved: Array<{regionUuid: string, cast: string, reason: string}>}|{ok: false, reason: string}}
 */
export function starweaveContexts(caster, scene) {
  if (!caster?.uuid || !scene?.regions) return { ok: false, reason: "identity" };
  const live = new Set(liveStarweaves(scene, caster).map(region => region.uuid));
  const links = [], unresolved = [];
  for (const region of [...scene.regions].sort((a, b) => String(a.uuid).localeCompare(String(b.uuid)))) {
    const f = flagsOf(region);
    if (f.identifier !== "starweave" || f.caster !== caster.uuid) continue;
    if (live.has(region.uuid)) links.push(f[STARWEAVE_LINK]);
    else unresolved.push({ regionUuid: region.uuid, cast: f.cast ?? null, reason: f[STARWEAVE_LINK] ? "ended" : "unlinked" });
  }
  return { ok: true, links, unresolved };
}
