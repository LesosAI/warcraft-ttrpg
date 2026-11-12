/**
 * **04's DISTORTION FIELD ON THE BOARD** (the Chronomancer's Guardian of Time, stage 2c: *The
 * ground within 10 feet of you is Difficult ground for your enemies. At rank 2, within 15
 * feet.*). `rules/guardian.mjs#fieldWanted` is the law; this is the one writer, on the active
 * GM's client, because only a GM may give a Region a behavior (D-757's reason for
 * `reconcileGround`).
 *
 * Every token of a creature holding the talent carries exactly ONE Region ATTACHED to it -
 * core moves an attached Region with a drag and deletes it with the token - a circle 10 or 15
 * feet past the token's own squares (D-732: measured from the edge, never the centre), carrying
 * the `difficultFor` behavior (`canvas/behaviors.mjs`) for the holder's ENEMIES (`who:
 * "enemy"`, the holder its `caster`), so the board charges an enemy two feet a foot inside it
 * through core's own movement cost (D-757) and charges the holder and its allies nothing. A
 * talent taken, raised or given back, a token placed, a scene viewed and the world's start
 * each bring the Regions into line; a Region whose holder no longer holds the talent, or whose
 * token is gone, is taken off. The Region names its feature (`featureKey`), so its loop stands
 * while it does (`rules/animation.mjs`'s `region` binding).
 */

import { talentEffect } from "../rules/talent-effects.mjs";
import { FIELD_FLAG, distortionFieldOf, fieldWanted } from "../rules/guardian.mjs";
import { DIFFICULT_BEHAVIOR } from "../rules/area-ground.mjs";
import { DIFFICULT_COST } from "../rules/movement.mjs";
import { pixelsPerFoot, regionDataFor } from "./regions.mjs";
import { GROUND_FLAG, isWriter } from "./sustained-areas.mjs";
import { regionInWorld, sceneInWorld, tokenInWorld } from "./in-world.mjs";

const SCOPE = "azeroth-rpg";

/** The key the field's Region is filed under, the talent's slug (`featureKeyOf`). */
export const FIELD_KEY = "distortion-field";

/** The colour of the field: the sand-gold the Chronomancer's pictures carry (`FILTERS.SAND`). */
const FIELD_COLOR = "#d8b56d";

/** One pass at a time, so two hooks never lay two Regions on one token. */
let QUEUE = Promise.resolve(0);
function serial(task) {
  const run = () => task().catch(err => {
    console.warn("azeroth-rpg | Distortion Field", err);
    return 0;
  });
  QUEUE = QUEUE.then(run, run);
  return QUEUE;
}

/** The field each token of this scene should carry, by token id. */
function wantedOn(scene) {
  const out = new Map();
  for (const token of scene?.tokens ?? []) {
    const actor = token.actor;
    if (!actor || actor.type !== "character") continue;
    const want = fieldWanted({
      talents: actor.takenTalents?.() ?? [], width: token.width ?? 1, distance: scene.grid?.distance ?? 5,
      up: (actor.system?.health?.value ?? 0) > 0
    }, talentEffect);
    if (want) out.set(token.id, { token, actor, want });
  }
  return out;
}

/** The field Regions standing on this scene. */
function fieldsOn(scene) {
  return (scene?.regions ?? []).filter(r => r.flags?.[SCOPE]?.[FIELD_FLAG]);
}

/** Whether a standing Region already is the field this token wants. */
function sameField(region, { token, actor, want }) {
  const f = region.flags?.[SCOPE]?.[FIELD_FLAG] ?? {};
  const attached = region._source?.attachment?.token ?? region.attachment?.token?.id ?? region.attachment?.token ?? null;
  const ground = region.behaviors?.filter?.(b => b.type === DIFFICULT_BEHAVIOR && b.getFlag?.(SCOPE, GROUND_FLAG) === true) ?? [];
  return f.token === token.id && attached === token.id && f.actor === actor.uuid && Number(f.radiusFt) === want.radiusFt && ground.length === 1;
}

/** The Region data for one token's field: attached, the circle at the measured radius, the behavior on it. */
export function fieldRegionData({ scene, token, actor, want }) {
  const centre = token.getCenterPoint?.() ?? { x: token.x, y: token.y };
  const data = regionDataFor({
    areaText: `A ${want.feet} ft radius centered on you`,
    title: game.i18n.format("AZEROTH.Guardian.FieldName", { talent: want.name, name: token.name ?? actor.name, feet: want.feet }),
    color: FIELD_COLOR, scene, origin: { x: centre.x, y: centre.y }, token, attach: true,
    flags: {
      featureKey: FIELD_KEY,
      source: { sceneId: scene.id, tokenId: token.id },
      [FIELD_FLAG]: { token: token.id, actor: actor.uuid, feet: want.feet, radiusFt: want.radiusFt }
    }
  });
  if (!data) return null;
  // The radius from the token's CENTRE: the feet past its edge plus half its width (D-732).
  data.shapes = data.shapes.map(s => (s.type === "circle" ? { ...s, radius: want.radiusFt * pixelsPerFoot(scene) } : s));
  data.behaviors = [{
    type: DIFFICULT_BEHAVIOR,
    name: game.i18n.localize("AZEROTH.DifficultFor.Name"),
    system: { difficulties: { walk: DIFFICULT_COST, swim: DIFFICULT_COST }, who: want.who ?? "enemy", kinds: [], caster: actor.uuid, named: [] },
    flags: { [SCOPE]: { [GROUND_FLAG]: true } }
  }];
  return data;
}

/**
 * **BRING EVERY FIELD INTO LINE** on the scenes given (every scene by default): one attached
 * Region for each token whose creature holds the talent and stands above 0 Health, at the
 * radius its rank and its size give; none anywhere else. Answers how many Regions were
 * written. Only the active GM's client writes.
 *
 * @param {{scenes?: Scene[]|null}} [o]
 * @returns {Promise<number>}
 */
export function reconcileFields(o = {}) {
  return serial(() => reconcileNow(o));
}

async function reconcileNow({ scenes = null } = {}) {
  if (!isWriter()) return 0;
  let written = 0;
  for (const scene of scenes ?? game.scenes ?? []) {
    if (!scene?.regions || !sceneInWorld(scene)) continue;
    const wanted = wantedOn(scene);
    const kept = new Set();
    const stale = [];
    for (const region of fieldsOn(scene)) {
      const f = region.flags?.[SCOPE]?.[FIELD_FLAG] ?? {};
      const w = wanted.get(f.token);
      if (w && !kept.has(f.token) && sameField(region, w)) kept.add(f.token);
      else stale.push(region);
    }
    const gone = stale.filter(r => regionInWorld(r)).map(r => r.id);
    if (gone.length) {
      await scene.deleteEmbeddedDocuments("Region", gone);
      written += gone.length;
    }
    const make = [];
    for (const [id, w] of wanted) {
      if (kept.has(id) || !tokenInWorld(w.token)) continue;
      const data = fieldRegionData({ scene, ...w });
      if (data) make.push(data);
    }
    if (make.length && sceneInWorld(scene)) {
      await scene.createEmbeddedDocuments("Region", make);
      written += make.length;
    }
  }
  return written;
}

/**
 * The hooks that move a field, on the active GM's client: a talent's `taken` written, a talent
 * embedded or deleted, a token placed, Health reaching or leaving 0, a scene viewed, and the
 * world's start. Registered once at `init` (`azeroth.mjs`).
 */
export function registerFieldHooks() {
  const quietly = p => p?.catch?.(err => console.warn("azeroth-rpg | Distortion Field", err));
  const talentMoved = item => item?.type === "talent" && item.parent?.documentName === "Actor";
  Hooks.on("updateItem", (item, changed) => {
    if (!isWriter() || !talentMoved(item) || !foundry.utils.hasProperty(changed ?? {}, "system.taken")) return;
    quietly(reconcileFields());
  });
  Hooks.on("createItem", item => { if (isWriter() && talentMoved(item)) quietly(reconcileFields()); });
  Hooks.on("deleteItem", item => { if (isWriter() && talentMoved(item)) quietly(reconcileFields()); });
  Hooks.on("createToken", token => { if (isWriter() && token?.parent) quietly(reconcileFields({ scenes: [token.parent] })); });
  Hooks.on("updateActor", (actor, changed) => {
    if (!isWriter() || !foundry.utils.hasProperty(changed ?? {}, "system.health.value")) return;
    // Only a holder's Health moves its field (a creature at 0 holds none).
    if (!distortionFieldOf(actor?.takenTalents?.() ?? [], talentEffect)) return;
    quietly(reconcileFields());
  });
  Hooks.on("canvasReady", board => { if (isWriter() && board?.scene) quietly(reconcileFields({ scenes: [board.scene] })); });
  Hooks.once("ready", () => { if (isWriter()) quietly(reconcileFields()); });
}
