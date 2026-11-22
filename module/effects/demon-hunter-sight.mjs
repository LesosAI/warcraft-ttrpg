/**
 * **WHAT A DEMON HUNTER'S SPELL LETS IT SEE, AND WHERE ITS GROUND HOLDS** (07 §15's Hunter's Brand, Gaze of the
 * Sightless and Hunting Ground, and Unnatural Agility's Opportunity Attacks; the Demon Hunter plan's Phase 4b,
 * D-1544 to D-1546). The law is `rules/demon-hunter-spells.mjs`; this module reads the board and is imported
 * STATICALLY by the hot paths that ask it (the roll dialog's target snapshot, the terrain's cost function, the
 * Opportunity Attack), so it holds no import that touches Foundry at load and nothing here writes.
 *
 * - **Seeing through** (`dhRevealTo`, `revealedToUser`): *A demon you brand cannot be invisible to you or hidden
 *   from you*; *no creature inside [Hunting Ground] can be invisible to you or hidden from you*; Gaze of the
 *   Sightless' *each invisible creature inside the area is outlined for you and for those allies*. The roll
 *   dialog drops the invisible target's Banes for an attacker named here, and core's own invisibility (14.367
 *   `TokenDocument#hasStatusEffect`, which the detection modes and the invisibility filter ask) answers false on
 *   the client of a user who owns such a hunter, so the token is drawn for them.
 * - **The ground** (`huntingGroundFree`): Hunting Ground's *Inside the area you ignore Difficult ground* - a step
 *   whose square lies inside the circle costs a foot a foot, and a step outside it costs what the ground costs.
 * - **No Opportunity Attack** (`dhSparesOpportunity`): Unnatural Agility for its span, and Hunting Ground for a
 *   move that stays inside the area.
 *
 * **An area centred on the caster is a circle fixed where the caster stood at the cast** (MY READING: 07 says
 * *centered on you* and not *the area moves with you*, which is Shroud of Sorrow's words for a carried area), its
 * radius the feet from the caster's footprint, the convention every token-centred area here uses.
 */

import { AGILITY_FLAG, BRAND_FLAG, GAZE_FLAG, HUNTING_FLAG, agilityNoOpportunity, brandRevealsTo, gazeOf, huntingGroundOf, insideCircle } from "../rules/demon-hunter-spells.mjs";

const SCOPE = "azeroth-rpg";
const list = c => [...(c?.values?.() ?? c ?? [])];
const docOf = token => token?.document ?? token ?? null;

/** A token document's centre on its scene, in canvas pixels; `at` a top-left to lay it at instead. */
export function centreOf(doc, at = null) {
  const scene = doc?.parent ?? null;
  const sx = scene?.grid?.sizeX ?? scene?.grid?.size ?? 100;
  const sy = scene?.grid?.sizeY ?? scene?.grid?.size ?? 100;
  const x = Number(at?.x ?? doc?.x);
  const y = Number(at?.y ?? doc?.y);
  return { x: x + ((doc?.width ?? 1) * sx) / 2, y: y + ((doc?.height ?? 1) * sy) / 2 };
}

/**
 * The circle an area centred on a token covers, in canvas pixels: the feet from the footprint's edge, so a
 * Large caster's 30 ft reaches 30 ft past its own squares (`effects/sovereign-spells.mjs#placePreyArea`'s rule).
 */
export function circleAround(doc, feet) {
  const scene = doc?.parent ?? null;
  const size = scene?.grid?.size ?? 100;
  const per = Number(scene?.grid?.distance) || 5;
  return { sceneId: scene?.id ?? null, ...centreOf(doc), radius: (Number(feet) / per) * size + ((doc?.width ?? 1) * size) / 2 };
}

/** Whether a token's centre lies in a laid circle (`{centre: {sceneId, x, y, radius}}`), on that circle's scene. */
function inCircleOf(row, doc, at = null) {
  const c = row?.centre ?? null;
  if (!c || !doc?.parent || c.sceneId !== doc.parent.id) return false;
  return insideCircle(centreOf(doc, at), c, c.radius);
}

/** Every token document on a scene, with its actor. */
const tokensOn = scene => list(scene?.tokens).filter(t => t?.actor);

/**
 * **THE ACTORS WHO SEE THROUGH THIS CREATURE'S INVISIBILITY** (uuids, sorted): every hunter whose brand stands on
 * it where it is a demon, every holder of a Hunting Ground whose circle holds its token, and every caster of a
 * Gaze of the Sightless whose circle holds it with the allies that caster chose.
 *
 * @param {Actor} actor  the creature looked at
 * @param {Token|TokenDocument|null} token  its token on the board
 * @returns {string[]}
 */
export function dhRevealTo(actor, token = null) {
  const out = new Set(brandRevealsTo(list(actor?.effects)));
  const doc = docOf(token);
  if (doc?.parent) {
    for (const other of tokensOn(doc.parent)) {
      const effects = list(other.actor.effects);
      const hunting = huntingGroundOf(effects);
      if (hunting?.reveals === true && inCircleOf(hunting, doc)) out.add(other.actor.uuid);
      const gaze = gazeOf(effects);
      if (gaze && inCircleOf(gaze, doc)) {
        out.add(other.actor.uuid);
        for (const ally of gaze.allies ?? []) if (typeof ally === "string" && ally) out.add(ally);
      }
    }
  }
  return [...out].sort();
}

/** Whether any token on the board carries a flag the sight reads (the fast way out of `hasStatusEffect`). */
function anySight(scene) {
  return tokensOn(scene).some(t => list(t.actor.effects).some(e => e.active !== false && (e.flags?.[SCOPE]?.[BRAND_FLAG] || e.flags?.[SCOPE]?.[HUNTING_FLAG] || e.flags?.[SCOPE]?.[GAZE_FLAG])));
}

/**
 * **WHETHER THIS USER SEES THE TOKEN THROUGH ITS INVISIBILITY**: one of the user's own actors is named by
 * `dhRevealTo`. A GM sees everything already, and is never asked.
 *
 * @param {TokenDocument} doc
 * @param {User} [user]
 */
export function revealedToUser(doc, user = globalThis.game?.user ?? null) {
  if (!doc?.actor || !user || user.isGM) return false;
  // **READ ONCE A REFRESH** (the review's L10): core asks `hasStatusEffect` on every draw, so the answer is kept until
  // the next refresh (a sight effect or a sight-bearing scene's token moving clears it, `clearRevealCache`).
  const key = `${doc.uuid ?? doc.id}|${user.id ?? ""}`;
  if (REVEAL_CACHE.has(key)) return REVEAL_CACHE.get(key);
  const answer = revealedNow(doc, user);
  REVEAL_CACHE.set(key, answer);
  return answer;
}

/** The answers `revealedToUser` keeps between refreshes. */
const REVEAL_CACHE = new Map();

/** Forget every kept answer (each refresh, and a test). */
export function clearRevealCache() {
  REVEAL_CACHE.clear();
}

/** `revealedToUser`'s judgement, read off the board now. */
function revealedNow(doc, user) {
  if (!anySight(doc.parent)) return false;
  const seers = dhRevealTo(doc.actor, doc);
  if (!seers.length) return false;
  return seers.some(uuid => {
    let a = null;
    try { a = globalThis.fromUuidSync?.(uuid) ?? null; } catch { a = null; }
    return Boolean(a?.testUserPermission?.(user, "OWNER"));
  });
}

/**
 * **CORE'S INVISIBILITY, ANSWERED FOR THE HUNTER** (14.367: `DetectionMode` and the invisibility filter ask
 * `TokenDocument#hasStatusEffect(INVISIBLE)`): false on the client of a user who sees through it, so the token is
 * drawn for that user and for nobody else. Extends whatever class stands, as the Flare's reveal does
 * (`effects/mobile-alert-visibility.mjs`), and refreshes the board's vision when a sight effect or a token moves.
 */
export function registerHunterSight() {
  const Base = CONFIG.Token.documentClass;
  CONFIG.Token.documentClass = class HunterSightTokenDocument extends Base {
    hasStatusEffect(statusId) {
      const present = super.hasStatusEffect(statusId);
      if (present && statusId === CONFIG.specialStatusEffects.INVISIBLE && revealedToUser(this)) return false;
      return present;
    }
  };
  const refresh = () => {
    clearRevealCache();
    if (globalThis.canvas?.ready !== true) return;
    for (const token of canvas.tokens?.placeables ?? []) {
      if (token.mesh) token._updateSpecialStatusFilterEffects?.();
      token.renderFlags?.set({ refreshVisibility: true });
    }
    canvas.perception?.update({ refreshVision: true });
  };
  const sightEffect = e => Boolean(e?.flags?.[SCOPE]?.[BRAND_FLAG] || e?.flags?.[SCOPE]?.[HUNTING_FLAG] || e?.flags?.[SCOPE]?.[GAZE_FLAG]);
  for (const hook of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect"]) Hooks.on(hook, e => { if (sightEffect(e)) refresh(); });
  // A move refreshes the board only on a scene where a sight effect stands (the review's L10): every other move was
  // refreshing every token's vision on every step.
  Hooks.on("updateToken", (doc, change) => { if (("x" in (change ?? {}) || "y" in (change ?? {})) && anySight(doc?.parent)) refresh(); });
  Hooks.on("canvasReady", () => clearRevealCache());
}

/**
 * **THE HUNTING GROUND A MOVER STANDS IN** (Hunting Ground's own circle, on the mover's scene), or null - read once
 * per path, and handed to `huntingGroundFree` for each step.
 */
export function huntingGroundFor(token) {
  const doc = docOf(token);
  const held = huntingGroundOf(list(doc?.actor?.effects));
  return held?.ground === true && held.centre?.sceneId === doc?.parent?.id ? held : null;
}

/**
 * **WHETHER A STEP IGNORES DIFFICULT GROUND** (Hunting Ground: *Inside the area you ignore Difficult ground*): the
 * square the step ENTERS lies inside the holder's circle. `to` is core's: a grid offset on a square or hex grid,
 * a top-left on a gridless one (14.367 `Token#_getMovementCostFunction`).
 *
 * @param {Token|TokenDocument} token
 * @param {{i?: number, j?: number, x?: number, y?: number}} to
 * @param {object|null} [held]  `huntingGroundFor(token)`, read once per path
 */
export function huntingGroundFree(token, to, held = undefined) {
  const doc = docOf(token);
  const row = held === undefined ? huntingGroundFor(doc) : held;
  if (!row || !to) return false;
  const grid = doc?.parent?.grid ?? null;
  let point = null;
  if (Number.isFinite(Number(to.i)) && Number.isFinite(Number(to.j)) && typeof grid?.getCenterPoint === "function") point = grid.getCenterPoint({ i: to.i, j: to.j });
  else if (Number.isFinite(Number(to.x)) && Number.isFinite(Number(to.y))) point = centreOf(doc, to);
  return Boolean(point) && insideCircle(point, row.centre, row.centre.radius);
}

/**
 * **WHETHER A MOVE PROVOKES NO OPPORTUNITY ATTACK** (Unnatural Agility: *you provoke no Opportunity Attacks* for
 * its span; Hunting Ground: *Inside the area you ... provoke no Opportunity Attacks* - every position the move
 * passes lies inside the holder's circle). `points` are core's passed waypoints (top-lefts), the origin first.
 *
 * @param {Actor} actor
 * @param {TokenDocument} mover
 * @param {Array<{x: number, y: number}>} points
 */
export function dhSparesOpportunity(actor, mover, points = []) {
  const effects = list(actor?.effects);
  if (agilityNoOpportunity(effects) !== null) return true;
  const held = huntingGroundOf(effects);
  if (held?.noOpportunity !== true || !mover?.parent || held.centre?.sceneId !== mover.parent.id || !points.length) return false;
  return points.every(p => insideCircle(centreOf(mover, p), held.centre, held.centre.radius));
}

/** The flag key Unnatural Agility rides (re-exported for the sheet and the tests). */
export { AGILITY_FLAG };
