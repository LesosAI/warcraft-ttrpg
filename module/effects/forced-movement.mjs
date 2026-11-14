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

import { FORCED_REFUSALS, beingMovedRefusal, forcedPlan, forcedStep } from "../rules/forced-movement.mjs";
import { allyOf } from "../canvas/engaged.mjs";
import { refusesPushFor } from "../rules/class-talents.mjs";
import { shapeCentre } from "../rules/area-ticks.mjs";
import { dispersionRefusal } from "../rules/dispersion.mjs";
// 07 §12's Stasis: *cannot act, move, speak or be moved* (O-306).
import { unmovableBy } from "../rules/chronomancer.mjs";
// 02 §7's March of the Damned: *cannot be moved against your will* (door 12).
import { auraHoldsUnmoved } from "../rules/auras.mjs";
// The record a named pull writes on its own displacement, for the animation layer (D-1015).
import { FORCED_MOVE_OPTION, cleanForcedMoveCue, forcedMoveCue } from "../rules/animation-records.mjs";

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

/**
 * The size a creature resists being moved at (05's *Being moved*): what the King's
 * Frame steps up on a character (`system.resistSize`, D-912), else its size.
 */
export function resistingSize(actor) {
  return actor?.system?.resistSize ?? actor?.system?.size ?? null;
}

/**
 * **05's BEING MOVED, AT A DOOR THAT KNOWS WHO MOVES IT** (D-913; the lead: *"Enforce it,
 * include Prone, exempt willing allies"*): the push, the pull and the knocked Prone
 * (`effects/inflict.mjs`) ask this one reading. A creature is WILLING where it is the
 * mover's ally (`canvas/engaged.mjs#allyOf`: the fight's sides, else the Party) - MY
 * READING, for the lead, until a feature or spell names the ally's choice itself.
 *
 * **A MOVE WITH NOBODY BEHIND IT ASKS THE CREATURE'S OWN REFUSAL TOO** (the F2 review's
 * should-fix 8, D-957): an area's push, a pull no creature is named for - 14's *cannot be moved
 * against its will* and March of the Damned's (door 12) hold against it as they hold against
 * a creature's; only the size rule needs a mover to compare against.
 *
 * @param {Actor|null} victim
 * @param {Actor|null} by
 * @returns {"refuses"|"outsized"|null}
 */
export function beingMovedBy(victim, by, { ignoreSize = null } = {}) {
  if (!victim) return null;
  // The creature's own refusal (14's *cannot be moved against its will*), and March of the
  // Damned's while it stands on it (`rules/auras.mjs#auraHoldsUnmoved`).
  const refuses = [...(victim.system?.refuses ?? []), ...(auraHoldsUnmoved([...(victim.effects ?? [])]) ? ["forcedMovement"] : [])];
  if (!by) return refuses.includes("forcedMovement") ? "refuses" : null;
  const self = victim.uuid === by.uuid;
  return beingMovedRefusal({
    targetSize: resistingSize(victim), sourceSize: by.system?.size ?? null,
    self, willing: !self && allyOf(by, victim),
    // Death Grip's waiver of the size rule for anything but a Boss (02 §7).
    refuses, ignoreSize, boss: victim.system?.weightClass === "boss"
  });
}

/** Move it here; the caller has established that this client may write the token. */
async function moveHere({ token, from, feet, toward, by = null, ignoreSize = null, cue = null }) {
  const actor = token.actor ?? null;
  const name = token.name ?? actor?.name ?? "";
  if (dispersionRefusal(actor, "forcedMove")) return result(name, 0, false, "dispersion");
  // **05's BEING MOVED** (*You cannot be pushed, pulled or knocked Prone against your will
  // by anything more than one size smaller than you*; D-912, read at this door for the
  // King's Frame - the lead, on O-319: *"Bag slots and forced movement"*): the size of
  // the creature that caused it against the size the moved one resists at. A move with
  // no creature behind it is not judged.
  const refusedMove = beingMovedBy(actor, by, { ignoreSize });
  if (refusedMove) return result(name, 0, false, refusedMove);
  // **HELD BY STASIS** (07 §12: *it cannot act, move, speak or be moved*; O-306): no push, no pull.
  if (unmovableBy([...(actor?.effects ?? [])])) return result(name, 0, false, "held");
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
  // **THE MOVE, RECORDED ON ITS OWN OPERATION** (D-1015, O-383; every push and pull since O-397):
  // the move as the animation layer reads it - the token's centre before and after, a pull or a
  // push - rides the displacement's operation, which every client's `updateToken` hook is handed,
  // under the feature's key where the caller named one (`cue`) and the generic forced move's
  // otherwise. It decides nothing about the move.
  const record = forcedMoveCue({
    key: cue?.key ?? null, by: cue?.by ?? null, privacy: cue?.privacy ?? null, toward,
    step: { sceneId: token.parent?.id ?? null, tokenId: token.id, from: { x: token.x, y: token.y }, to, width: token.width, height: token.height,
      sizeX: token.parent?.grid?.sizeX ?? grid.size, sizeY: token.parent?.grid?.sizeY ?? grid.size }
  });
  const done = await token.move({ x: to.x, y: to.y, action: "displace" }, record ? { [FORCED_MOVE_OPTION]: record } : {});
  return done === false ? result(name, 0, false, "walled") : result(name, step.feet, true, null);
}

/**
 * The GM-side handler (`FORCED_QUERY`). Throws with the reason, which travels back
 * to the caller.
 */
export async function forcedMoveQueryHandler({ tokenUuid = null, from = null, feet = 0, toward = "away", byUuid = null, ignoreSize = null, cue = null } = {}, { user = null } = {}) {
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
  const mover = byUuid ? await fromUuid(byUuid) : null;
  return moveHere({ token, from: point, feet: Math.max(0, Math.trunc(Number(feet)) || 0), toward: toward === "toward" ? "toward" : "away", by: mover?.documentName === "Actor" ? mover : null,
    ignoreSize: ignoreSize === "nonBoss" ? "nonBoss" : null, cue: cueOf(cue) });
}

/**
 * The animation record a caller names for its pull, cleaned to the three things the GM's handler
 * may carry (D-1015): the feature's key, the token of the creature that caused it and the Use's
 * privacy pair. Null for anything else.
 */
function cueOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const probe = cleanForcedMoveCue({ key: raw.key, by: raw.by, privacy: raw.privacy,
    step: { tokenId: "probe", kind: "pull", from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } });
  return probe ? { key: probe.key, by: probe.by, privacy: probe.privacy ?? null } : null;
}

/**
 * **PUSH OR PULL ONE CREATURE'S TOKEN**, and say what came of it.
 *
 * `cue` (D-1015) names the feature whose pull this is - `{key, by: {sceneId, tokenId}, privacy}` -
 * and the move then writes the record the animation layer plays the pull from.
 *
 * @param {{token: TokenDocument|null, from: {x: number, y: number}|null, feet: number, toward?: "away"|"toward",
 *   by?: Actor|null, name?: string, cue?: object|null}} o  `from` in the scene's pixels: the caster's centre or the area's
 * @returns {Promise<{name: string, feet: number, moved: boolean, reason: string|null}>}
 */
export async function forceMove({ token = null, from = null, feet = 0, toward = "away", by = null, name = "", ignoreSize = null, cue = null } = {}) {
  if (!token?.parent) return result(name, 0, false, "gone");
  if (dispersionRefusal(token.actor, "forcedMove")) return result(token.name ?? name, 0, false, "dispersion");
  if (!from) return result(token.name, 0, false, "unmeasured");
  try {
    if (token.isOwner) return await moveHere({ token, from, feet, toward, by, ignoreSize, cue: cueOf(cue) });
    const gm = game.users?.activeGM ?? null;
    if (!gm) return result(token.name, 0, false, "noGM");
    const done = await gm.query(FORCED_QUERY, { tokenUuid: token.uuid, from: { x: from.x, y: from.y }, feet, toward, byUuid: by?.uuid ?? null, ignoreSize, cue: cueOf(cue) }, { timeout: 15000 });
    return done && typeof done === "object" ? result(done.name ?? token.name, done.feet, done.moved === true, done.reason ?? null) : result(token.name, 0, false, "noGM");
  } catch (err) {
    ui.notifications?.warn(err.message);
    return result(token.name, 0, false, "gone");
  }
}

/**
 * **A CREATURE THAT DOES NOT CROSS, PUT BACK ON ITS OWN SIDE** (07's Ring of Fire and
 * Stormwall: *on a failure it does not cross and its turn ends*; the B9a pass, the lead:
 * *"Build the triggers"*): its token returned to the position the crossing recorded -
 * the side of the edge it stood on before it crossed (`rules/area-ticks.mjs#stopPoint`) -
 * as a displacement, the one way this system moves a creature it did not walk: no Move
 * spent, no area entered, no Opportunity Attack. Only where this client may write the
 * token - the area Test's door runs on the client that rolled the creature's Test, which
 * owns it - and said in words where it may not, or where no position was recorded.
 *
 * @param {{token: TokenDocument|null, to: {x: number, y: number}|null, name?: string}} o
 * @returns {Promise<{name: string, feet: number, moved: boolean, reason: string|null}>}
 */
export async function putBack({ token = null, to = null, name = "" } = {}) {
  if (!token?.parent) return result(name, 0, false, "gone");
  if (dispersionRefusal(token.actor, "forcedMove")) return result(token.name ?? name, 0, false, "dispersion");
  if (unmovableBy([...(token.actor?.effects ?? [])])) return result(token.name ?? name, 0, false, "held");
  const at = to && Number.isFinite(Number(to.x)) && Number.isFinite(Number(to.y)) ? { x: Math.round(Number(to.x)), y: Math.round(Number(to.y)) } : null;
  if (!at) return result(token.name ?? name, 0, false, "unmeasured");
  if (!token.isOwner) return result(token.name ?? name, 0, false, "notYours");
  if (Math.round(token.x) === at.x && Math.round(token.y) === at.y) return result(token.name ?? name, 0, true, null);
  try {
    const done = await token.move({ x: at.x, y: at.y, action: "displace" });
    return done === false ? result(token.name ?? name, 0, false, "walled") : result(token.name ?? name, 0, true, null);
  } catch (err) {
    ui.notifications?.warn(err.message);
    return result(token.name ?? name, 0, false, "gone");
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
  if (r?.reason === "dispersion") return game.i18n.localize("AZEROTH.Dispersion.Restricted");
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
