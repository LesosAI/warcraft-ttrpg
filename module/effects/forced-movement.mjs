/**
 * **THE ONE DOOR THAT PUSHES OR PULLS A CREATURE** (D-778; the lead, 2026-10-03, on
 * O-158: *"Yes."*). `rules/forced-movement.mjs` is the law; this is the move.
 *
 * - **A displacement**: `TokenDocument#move` with `action: "displace"` (14.367's
 *   own action - `teleport`, `measure: false`, `costMultiplier: 0`), as
 *   `documents/shapes.mjs` resizes a token. Core meters it at nothing, and this
 *   system reads it as no creature moving (`rules/movement.mjs#creatureMoved`), so
 *   it spends no Move, offers no Opportunity Attack and enters no area.
 * - **Walls**: core's displacement passes through them (`walls: null`), so each
 *   candidate the law gives is asked of core's own collision test for a walk
 *   (`Token#checkCollision`, type `move`) where the token is drawn on this client,
 *   and the longest one clear is taken: a creature is pushed against a wall, never
 *   through it. **A token on a scene this client is not drawing is not moved**,
 *   said in words (`rules/forced-movement.mjs#forcedStep`, `unchecked`; the review
 *   of D-778): it used to be moved unasked, through whatever walls stood in the way.
 * - **Immovable** (04: *you cannot be pushed by any effect that does not lift
 *   you*): a push is refused in words; a pull is not a push.
 * - **Who writes**: here where this client may write the token, else on the active
 *   GM's client through `CONFIG.queries` (D-643), the handler asking that the
 *   asker own the creature that caused it - or be the GM's own door, which runs on
 *   the GM's client already (an area's pull at a turn's start, a Test on entering).
 */

import { FORCED_REFUSALS, forcedPlan, forcedStep } from "../rules/forced-movement.mjs";
import { refusesPushFor } from "../rules/class-talents.mjs";
import { shapeCentre } from "../rules/area-ticks.mjs";

/** The query a move of a token this client does not own goes through. */
export const FORCED_QUERY = "azeroth-rpg.forcedMove";

/** The grid's measure, as the law takes it. */
function gridOf(scene) {
  const grid = scene?.grid ?? null;
  const type = grid?.isGridless ? "gridless" : grid?.isHexagonal ? "hex" : "square";
  return { size: Number(grid?.size) || 100, distance: Number(grid?.distance) || 5, type };
}

/** What one forced move came to, for the card. */
function result(name, feet, moved, reason = null) {
  return { name: String(name ?? ""), feet: Math.max(0, Math.trunc(Number(feet)) || 0), moved, reason };
}

/**
 * The position the token takes for one candidate: its top-left moved by the
 * offset, snapped as core snaps a hex.
 */
function positionOf(token, step, grid) {
  let x = Math.round(token.x + step.dx);
  let y = Math.round(token.y + step.dy);
  if (grid.type === "hex" && typeof token.getSnappedPosition === "function") {
    const snapped = token.getSnappedPosition({ x, y });
    x = Math.round(snapped.x);
    y = Math.round(snapped.y);
  }
  return { x, y };
}

/** Whether core's walk collision test can be asked about this token here: it is drawn on this client. */
function wallsAskable(token) {
  return typeof token?.object?.checkCollision === "function";
}

/**
 * Whether core's walk collision test stops the token between where it stands and
 * there. A test that cannot be made, or throws, BLOCKS (the review of D-778): the
 * token is never moved through a wall nobody asked about.
 */
function blocked(token, to) {
  const placeable = token.object ?? null;
  if (!placeable || typeof placeable.checkCollision !== "function") return true;
  try {
    const origin = token.getMovementOrigin(token._source);
    const destination = token.getMovementOrigin({ ...token._source, x: to.x, y: to.y });
    return placeable.checkCollision(destination, { origin, type: "move", mode: "any" }) === true;
  } catch {
    return true;
  }
}

/** Move it here; the caller has established that this client may write the token. */
async function moveHere({ token, from, feet, toward }) {
  const actor = token.actor ?? null;
  const name = token.name ?? actor?.name ?? "";
  if (toward !== "toward" && actor && typeof actor.takenTalents === "function" && refusesPushFor(actor.takenTalents())) {
    return result(name, 0, false, "immovable");
  }
  const grid = gridOf(token.parent);
  const centre = token.getCenterPoint();
  const plan = forcedPlan({ centre, from, feet, toward, grid });
  // The longest candidate core's walk collision test lets through - and none at all
  // where the test cannot be asked on this client (the review of D-778).
  const { step, reason } = forcedStep(plan, { askable: wallsAskable(token), blocked: s => blocked(token, positionOf(token, s, grid)) });
  if (!step) return result(name, 0, false, reason);
  const to = positionOf(token, step, grid);
  const done = await token.move({ x: to.x, y: to.y, action: "displace" });
  return done === false ? result(name, 0, false, "walled") : result(name, step.feet, true, null);
}

/**
 * The GM-side handler (`FORCED_QUERY`). Throws with the reason, which travels back
 * to the caller.
 */
export async function forcedMoveQueryHandler({ tokenUuid = null, from = null, feet = 0, toward = "away", byUuid = null } = {}, { user = null } = {}) {
  const token = tokenUuid ? await fromUuid(tokenUuid) : null;
  if (token?.documentName !== "Token") throw new Error(game.i18n.localize(FORCED_REFUSALS.gone));
  if (user) {
    const by = byUuid ? await fromUuid(byUuid) : null;
    if (by?.documentName !== "Actor" || !by.testUserPermission(user, "OWNER")) {
      throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: by?.name ?? "" }));
    }
  }
  const point = from && Number.isFinite(Number(from.x)) && Number.isFinite(Number(from.y)) ? { x: Number(from.x), y: Number(from.y) } : null;
  if (!point) return result(token.name, 0, false, "unmeasured");
  return moveHere({ token, from: point, feet: Math.max(0, Math.trunc(Number(feet)) || 0), toward: toward === "toward" ? "toward" : "away" });
}

/**
 * **PUSH OR PULL ONE CREATURE'S TOKEN**, and say what came of it.
 *
 * @param {{token: TokenDocument|null, from: {x: number, y: number}|null, feet: number, toward?: "away"|"toward",
 *   by?: Actor|null, name?: string}} o  `from` in the scene's pixels: the caster's centre or the area's
 * @returns {Promise<{name: string, feet: number, moved: boolean, reason: string|null}>}
 */
export async function forceMove({ token = null, from = null, feet = 0, toward = "away", by = null, name = "" } = {}) {
  if (!token?.parent) return result(name, 0, false, "gone");
  if (!from) return result(token.name, 0, false, "unmeasured");
  try {
    if (token.isOwner) return await moveHere({ token, from, feet, toward });
    const gm = game.users?.activeGM ?? null;
    if (!gm) return result(token.name, 0, false, "noGM");
    const done = await gm.query(FORCED_QUERY, { tokenUuid: token.uuid, from: { x: from.x, y: from.y }, feet, toward, byUuid: by?.uuid ?? null }, { timeout: 15000 });
    return done && typeof done === "object" ? result(done.name ?? token.name, done.feet, done.moved === true, done.reason ?? null) : result(token.name, 0, false, "noGM");
  } catch (err) {
    ui.notifications?.warn(err.message);
    return result(token.name, 0, false, "gone");
  }
}

/**
 * **WHAT A FORCED MOVE CAME TO, IN WORDS**, for a card's line: *Ghoul is pushed 10
 * ft*, or why it was not.
 *
 * @param {{name: string, feet: number, moved: boolean, reason: string|null}} r
 * @param {{toward?: "away"|"toward", source?: string}} [o]
 */
export function forcedWords(r, { toward = "away", source = "" } = {}) {
  if (r?.moved) return game.i18n.format(toward === "toward" ? "AZEROTH.Forced.Pulled" : "AZEROTH.Forced.Pushed", { name: r.name, feet: r.feet, source });
  return game.i18n.format(FORCED_REFUSALS[r?.reason] ?? "AZEROTH.Forced.Refuse.Nothing", { name: r?.name ?? "", source });
}

/**
 * **EVERY CREATURE STANDING IN A REGION, MOVED FROM ITS CENTRE** - 04's Typhoon on
 * Hurricane's placed area (*pushes everything in its area*), Void Rift's pull: the
 * tokens of the region's scene the DOCUMENT holds inside (`testInsideRegion`, as
 * `_areaTicks` asks), each through `forceMove`.
 *
 * @param {{region: RegionDocument, feet: number, toward?: "away"|"toward", by?: Actor|null, except?: string[]}} o
 * @returns {Promise<Array<object>>}
 */
export async function forceFromRegion({ region, feet = 0, toward = "away", by = null, except = [] } = {}) {
  const scene = region?.parent ?? null;
  const centre = regionCentreOf(region);
  if (!scene || !centre || !(feet > 0)) return [];
  const out = [];
  const inside = (scene.tokens ?? []).filter(t => !except.includes(t.id) && t.actor && t.testInsideRegion?.(region))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const token of inside) out.push(await forceMove({ token, from: centre, feet, toward, by }));
  return out;
}

/** A Region's centre in pixels: its first shape's, through the area law's one reading. */
export function regionCentreOf(region) {
  const shape = region?.shapes?.[0] ?? null;
  if (!shape) return null;
  return shapeCentre(typeof shape.toObject === "function" ? shape.toObject() : shape);
}
