/**
 * **02's RECALL, MARKED ON THE BOARD** (the lead's play-test, 2026-11-10: *"Recall does not
 * place a region or marker on the map for the recall location."*; D-889).
 *
 * The Chronomancer's own `recallMark` flag (`rules/chronomancer.mjs#recallMark`) is the truth:
 * the Use writes it, a blow counts onto it, the return spends it. This module only SHOWS it:
 * on the active GM's client - only a GM may create a Region - every mark that still stands
 * gets exactly one Region on its scene, a ring on the square the token stood on, named for the
 * feature and the Chronomancer, visible to the whole table; a mark spent by the return,
 * replaced by a new mark, lapsed on the world's clock (its ten minutes) or left by a deleted
 * actor loses its Region. `rules/chronomancer.mjs#recallMarkerPlan` is the law.
 *
 * **A MARKER IS NOT AN AREA**: no behaviors, no restriction, and none of the `area`, `cast`
 * or `featureKey` flags the area sweeps (`canvas/sustained-areas.mjs`), the ground
 * (`difficultFor`) and the animation layer read, so no movement, entry or loop reads it.
 * A mark's own flags do not depend on a GM: with none online the mark still stands and the
 * return still heals; the marker appears when a GM's client next reconciles.
 */

import { RECALL_FLAG, RECALL_MARKER_FLAG, recallMarkKey, recallMarkerPlan } from "../rules/chronomancer.mjs";
import { isWriter } from "./sustained-areas.mjs";
import { regionInWorld, sceneInWorld } from "./in-world.mjs";

const SCOPE = "azeroth-rpg";

/** The ring's colour: the Chronomancer's sand-gold (`canvas/distortion-field.mjs`'s FIELD_COLOR). */
const MARKER_COLOR = "#d8b56d";

/** One pass at a time, so two hooks never lay two markers for one mark. */
let QUEUE = Promise.resolve(0);
function serial(task) {
  const run = () => task().catch(err => {
    console.warn("azeroth-rpg | Recall marker", err);
    return 0;
  });
  QUEUE = QUEUE.then(run, run);
  return QUEUE;
}

/** Every world actor holding a mark, sorted by uuid (never a Map's order). */
function marksHeld() {
  return [...(game.actors ?? [])]
    .map(a => ({ actorUuid: a.uuid, actor: a, mark: a.getFlag?.(SCOPE, RECALL_FLAG) ?? null }))
    .filter(r => r.mark)
    .sort((a, b) => a.actorUuid.localeCompare(b.actorUuid));
}

/** Every marker Region on every scene still in the world. */
function markersStanding() {
  const out = [];
  for (const scene of game.scenes ?? []) {
    if (!sceneInWorld(scene)) continue;
    for (const region of scene.regions ?? []) {
      const f = region.flags?.[SCOPE]?.[RECALL_MARKER_FLAG];
      if (f) out.push({ id: region.id, sceneId: scene.id, key: f.key ?? null, region });
    }
  }
  return out;
}

/**
 * The Region data for one mark: a ring centred on the square the token stood on, inside it,
 * at the mark's elevation, named for the feature and the Chronomancer.
 */
export function markerRegionData({ scene, actor, mark, key }) {
  const size = scene?.grid?.size ?? 100;
  const token = mark.tokenId ? scene?.tokens?.get?.(mark.tokenId) ?? null : null;
  const w = Math.max(1, Number(token?.width) || 1);
  const h = Math.max(1, Number(token?.height) || 1);
  const x = Math.round(Number(mark.x) || 0) + (w * size) / 2;
  const y = Math.round(Number(mark.y) || 0) + (h * size) / 2;
  return {
    name: game.i18n.format("AZEROTH.Chrono.RecallMarkerName", { name: actor.name }),
    color: MARKER_COLOR,
    shapes: [{ type: "circle", x, y, radius: (Math.min(w, h) * size) * 0.45, gridBased: false }],
    elevation: { bottom: Number(mark.elevation) || 0, top: null },
    levels: [],
    restriction: { enabled: false, type: "move", priority: 0 },
    attachment: { token: null },
    behaviors: [],
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    highlightMode: "shapes",
    displayMeasurements: false,
    hidden: false,
    locked: true,
    flags: { [SCOPE]: { [RECALL_MARKER_FLAG]: { key, actor: actor.uuid, expires: Number(mark.expires) || 0 } } }
  };
}

/**
 * **BRING EVERY RECALL MARKER INTO LINE**: one for every mark standing on the world's clock,
 * none anywhere else. Answers how many Regions were written. Only the active GM writes.
 *
 * @returns {Promise<number>}
 */
export function reconcileRecallMarkers() {
  return serial(reconcileNow);
}

async function reconcileNow() {
  if (!isWriter()) return 0;
  const held = marksHeld();
  const standing = markersStanding();
  const plan = recallMarkerPlan({
    marks: held.map(({ actorUuid, mark }) => ({ actorUuid, mark })),
    regions: standing.map(({ id, sceneId, key }) => ({ id, sceneId, key })),
    time: game.time?.worldTime ?? 0
  });
  let written = 0;
  const bySceneGone = new Map();
  for (const { id, sceneId } of plan.remove) {
    const region = standing.find(r => r.id === id && r.sceneId === sceneId)?.region ?? null;
    if (!regionInWorld(region)) continue;
    if (!bySceneGone.has(sceneId)) bySceneGone.set(sceneId, []);
    bySceneGone.get(sceneId).push(id);
  }
  for (const [sceneId, ids] of [...bySceneGone.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const scene = game.scenes.get(sceneId);
    if (!sceneInWorld(scene)) continue;
    await scene.deleteEmbeddedDocuments("Region", ids);
    written += ids.length;
  }
  for (const want of plan.create) {
    const scene = game.scenes.get(want.mark.sceneId) ?? null;
    const actor = held.find(h => h.actorUuid === want.actorUuid)?.actor ?? null;
    if (!scene || !actor || !sceneInWorld(scene)) continue;
    // Asked again at the write: the mark may have moved while the pass waited.
    if (recallMarkKey(actor.uuid, actor.getFlag(SCOPE, RECALL_FLAG)) !== want.key) continue;
    await scene.createEmbeddedDocuments("Region", [markerRegionData({ scene, actor, mark: want.mark, key: want.key })]);
    written += 1;
  }
  return written;
}

/** The marker Region standing for this actor's mark now, or null (the tests' reader). */
export function recallMarkerOf(actor) {
  const key = recallMarkKey(actor?.uuid, actor?.getFlag?.(SCOPE, RECALL_FLAG) ?? null);
  if (!key) return null;
  return markersStanding().find(r => r.key === key)?.region ?? null;
}

/**
 * The hooks that move a marker, on the active GM's client: a mark written, counted onto or
 * spent (its own flag on the actor's update), an actor deleted, the world's clock (the ten
 * minutes), a scene viewed and the world's start. Registered once at `init` (`azeroth.mjs`).
 */
export function registerRecallMarkerHooks() {
  const quietly = p => p?.catch?.(err => console.warn("azeroth-rpg | Recall marker", err));
  const touchesMark = changed => {
    const f = changed?.flags?.[SCOPE];
    if (!f || typeof f !== "object") return false;
    return Object.keys(f).some(k => k.includes(RECALL_FLAG));
  };
  Hooks.on("updateActor", (actor, changed) => { if (isWriter() && touchesMark(changed)) quietly(reconcileRecallMarkers()); });
  Hooks.on("deleteActor", () => { if (isWriter()) quietly(reconcileRecallMarkers()); });
  Hooks.on("updateWorldTime", () => { if (isWriter() && markersStanding().length) quietly(reconcileRecallMarkers()); });
  Hooks.on("canvasReady", () => { if (isWriter()) quietly(reconcileRecallMarkers()); });
  Hooks.once("ready", () => { if (isWriter()) quietly(reconcileRecallMarkers()); });
}
