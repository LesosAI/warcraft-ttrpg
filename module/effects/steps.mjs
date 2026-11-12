/**
 * **A STEP TO A CHOSEN POINT, WRITTEN** (the Legacy branches' door 3).
 * `rules/steps.mjs` is the law; this is the measurement, the pick and the move.
 *
 * - **The judgement of one space** (`judgeStep`): the token's top-left snapped as
 *   core snaps it, the feet from the token's space to the space it would fill
 *   (`canvas/footprints.mjs#feetToPoint`, the one way every distance here is
 *   measured, D-732), the line of sight where the step needs one (core's own
 *   `Token#checkCollision`, type `sight`, asked where the token is drawn), and
 *   whether another creature's footprint is in the way.
 * - **The pick** (`pickStep`): `canvas/place.mjs#pickPoint`, whose `accept` refuses
 *   a space in words and keeps the pick open (D-767's one pick at a time; a press
 *   on a registered pick surface counts, D-763). Dismissed, it answers null and the
 *   caller spends nothing.
 * - **The move** (`stepTo`): `TokenDocument#move` with `action: "displace"` -
 *   metered at nothing, no creature moving (`rules/movement.mjs#creatureMoved`), so
 *   no Move is spent, no area is entered and no Opportunity Attack is offered. Here
 *   where this client may write the token, else on the active GM's client through
 *   `CONFIG.queries` (`STEP_QUERY`), never `game.socket`.
 *
 * **WHAT THE GM'S CLIENT TRUSTS** (the B2 review, item h): which token, which space and
 * which item moves it - nothing else. The feet, and whether that token may be moved at
 * all, are read again there off the user's own item (`stepAllowance`) by the step's
 * kind (`rules/steps.mjs#STEP_KINDS`): the user's own token, Slow Time's one ally within
 * its reach, an ally a party step carries landing within the burst, or a creature the
 * user holds Entangled pulled to within the feet of the user.
 *
 * **AND A PULL TO A SPACE THE USER CHOOSES** (04's None Escape; the lead, 2026-10-21:
 * *"A space you choose"*): `judgePull` and `pickPull`, the same pick, the space judged
 * by its distance from the USER's footprint (D-732), never by the step the creature
 * makes to reach it.
 */

// The Chronomancer's steps (stage 2b): Quickstep's feet, Recall's mark, Farstep's companion.
import { RECALL_FLAG, farstepCompanion, quickstepFeet, recallStands } from "../rules/chronomancer.mjs";
import { BLINK, blinkFor, onUseLegacy } from "../rules/class-talents.mjs";
import { spellCrossingFrom } from "../rules/spell-crossing.mjs";
import { onUseOf, talentEffect } from "../rules/talent-effects.mjs";
// A class feature's own `onUse` (02's Draconic Leap; stage 2B).
import { classFeatureOnUse } from "../rules/class-features.mjs";
import { abilityScope } from "../rules/expressions.mjs";
import { laidByOne } from "../rules/forced-movement.mjs";
import { countsAsAlly } from "../rules/distance.mjs";
import {
  FEATURE_STEPS, PULL_REFUSALS, STEP_KINDS, STEP_REFUSALS, occupiedBy, partyRadius, pullRefusal, readSpellStep, stepOf, stepRefusal, topLeftFor
} from "../rules/steps.mjs";
import { feetApart, feetToPoint } from "../canvas/footprints.mjs";
import { allyStandingOf, combatantIn } from "../canvas/engaged.mjs";
import { pickPoint } from "../canvas/place.mjs";
// What a step records for the animation layer (the Legacy branches' door 2).
import { stepRecord } from "../rules/animation-records.mjs";

/** The query a step of a token this client may not write goes through. */
export const STEP_QUERY = "azeroth-rpg.step";

/** A token's document, from a placeable or a document. */
function docOf(token) {
  return token?.document ?? token ?? null;
}

/** The scene's grid, as the law takes it. */
function gridOf(scene) {
  const grid = scene?.grid ?? null;
  return { size: Number(grid?.size) || 100, sizeX: Number(grid?.sizeX ?? grid?.size) || 100, sizeY: Number(grid?.sizeY ?? grid?.size) || 100 };
}

/** The top-left a token takes for a point, snapped as core snaps it. */
function snappedTopLeft(doc, point) {
  const grid = gridOf(doc.parent);
  const raw = topLeftFor(point, { width: doc.width ?? 1, height: doc.height ?? 1, size: grid.size });
  try {
    const snapped = typeof doc.getSnappedPosition === "function" ? doc.getSnappedPosition(raw) : raw;
    return { x: Math.round(snapped.x), y: Math.round(snapped.y) };
  } catch {
    return raw;
  }
}

/** The box a token fills at a top-left, in pixels. */
function boxAt(doc, to) {
  const grid = gridOf(doc.parent);
  return { id: doc.id, x: to.x, y: to.y, width: (doc.width ?? 1) * grid.sizeX, height: (doc.height ?? 1) * grid.sizeY };
}

/** The boxes every OTHER token on the scene fills, in pixels. */
function standingBoxes(doc) {
  const scene = doc.parent;
  const grid = gridOf(scene);
  return (scene?.tokens ?? []).filter(t => t.id !== doc.id && !t.hidden).map(t => ({
    id: t.id, x: t.x, y: t.y, width: (t.width ?? 1) * grid.sizeX, height: (t.height ?? 1) * grid.sizeY
  }));
}

/**
 * Whether the line from the token to a point is open to sight - core's own walk
 * of the walls, type `sight`, where the token is drawn on this client; null where
 * it cannot be asked here.
 */
function inSight(doc, centre) {
  const placeable = doc?.object ?? null;
  if (!placeable || typeof placeable.checkCollision !== "function") return null;
  try {
    return placeable.checkCollision(centre, { type: "sight", mode: "any" }) !== true;
  } catch {
    return null;
  }
}

/**
 * **WHETHER A TOKEN MAY STEP TO A POINT**: the space it would fill, and the reason it
 * may not, or null.
 *
 * @param {Token|TokenDocument} token
 * @param {{x: number, y: number}} point  canvas pixels
 * @param {{feet: number, sight?: "see"|"seen", except?: string[], askSight?: boolean}} o
 *   `except` the tokens that move with it (a party step's companions); `askSight`
 *   false skips the sight test (the GM-side handler, which cannot see for the asker)
 * @returns {{refusal: string|null, to: {x: number, y: number}|null, apart: number|null}}
 */
export function judgeStep(token, point, { feet, sight = "see", except = [], askSight = true } = {}) {
  const doc = docOf(token);
  if (!doc?.parent || !point) return { refusal: "noToken", to: null, apart: null };
  const to = snappedTopLeft(doc, point);
  const box = boxAt(doc, to);
  const centre = { x: to.x + box.width / 2, y: to.y + box.height / 2 };
  const apart = feetToPoint(doc, centre);
  const seen = sight === "see" && askSight ? inSight(doc, centre) : true;
  const occupied = occupiedBy(box, standingBoxes(doc), { except });
  const refusal = stepRefusal({ feet, apart, sight: askSight ? sight : "seen", seen, occupied, same: to.x === Math.round(doc.x) && to.y === Math.round(doc.y) });
  return { refusal, to, apart };
}

/** A refusal in words, for a warning or a card line. */
export function stepWords(refusal, { name = "", feet = 0 } = {}) {
  return game.i18n.format(STEP_REFUSALS[refusal] ?? STEP_REFUSALS.unmeasured, { name, feet });
}

/**
 * **PICK THE SPACE A TOKEN STEPS TO** (D-763's pick), refusing a space in words and
 * waiting for another. Null where the pick is dismissed or the board goes.
 *
 * @param {Token|TokenDocument} token
 * @param {{feet: number, sight?: "see"|"seen", name?: string, hint?: string|null, except?: string[]}} o
 * @returns {Promise<{point: {x: number, y: number}, to: {x: number, y: number}}|null>}
 */
export async function pickStep(token, { feet, sight = "see", name = "", hint = null, except = [] } = {}) {
  const doc = docOf(token);
  if (!doc?.parent) return null;
  let landed = null;
  const point = await pickPoint({
    hint: hint ?? game.i18n.format(sight === "seen" ? "AZEROTH.Step.PickSeen" : "AZEROTH.Step.Pick", { name, feet }),
    sceneId: doc.parent.id,
    accept: p => {
      const judged = judgeStep(doc, p, { feet, sight, except });
      if (!judged.refusal) {
        landed = judged.to;
        return true;
      }
      ui.notifications?.warn(stepWords(judged.refusal, { name, feet }));
      return false;
    }
  });
  return point && landed ? { point, to: landed } : null;
}

/* -------------------------------------------- */
/*  04's None Escape: a space the user chooses    */
/* -------------------------------------------- */

/**
 * **WHETHER A CREATURE MAY BE PULLED TO A POINT** (04's None Escape; door 24; the lead:
 * *"A space you choose"*): the space it would fill, snapped; the feet from the HOLDER's
 * footprint to the creature's footprint laid at that space, at the creature's own height
 * (`canvas/footprints.mjs#feetApart`, D-732); whether another creature, or a space
 * already chosen this Use (`taken`), fills it; and its own space, which leaves it where
 * it stands (`rules/steps.mjs#pullRefusal`).
 *
 * @param {Token|TokenDocument} token   the creature pulled
 * @param {{x: number, y: number}} point  canvas pixels
 * @param {{holder: Token|TokenDocument, within: number, taken?: Array<{id?: string, x: number, y: number, width: number, height: number}>}} o
 * @returns {{refusal: string|null, to: {x: number, y: number}|null, stays: boolean, apart: number|null}}
 */
export function judgePull(token, point, { holder, within = 10, taken = [] } = {}) {
  const doc = docOf(token);
  const holderDoc = docOf(holder);
  if (!doc?.parent || !holderDoc?.parent || holderDoc.parent.id !== doc.parent.id || !point) return { refusal: "unmeasured", to: null, stays: false, apart: null };
  const to = snappedTopLeft(doc, point);
  const same = to.x === Math.round(doc.x) && to.y === Math.round(doc.y);
  const box = boxAt(doc, to);
  const apart = feetApart(holderDoc, doc, same ? {} : { to: { x: to.x, y: to.y } });
  const occupied = !same && (occupiedBy(box, standingBoxes(doc)) || occupiedBy(box, taken ?? []));
  const verdict = pullRefusal({ within, apart, occupied, same });
  return { refusal: verdict.refusal, to, stays: verdict.stays, apart };
}

/** A pull's refusal in words. */
export function pullWords(refusal, { name = "", feet = 0, holder = "" } = {}) {
  return game.i18n.format(PULL_REFUSALS[refusal] ?? PULL_REFUSALS.unmeasured, { name, feet, holder });
}

/**
 * **PICK THE SPACE ONE PULLED CREATURE LANDS IN** (04's None Escape): the one pick, its
 * hint naming the creature and saying that its own space leaves it where it stands; a
 * refused space is said and the pick waits for another. Null where the pick is
 * dismissed - and the caller then makes no Use at all, nothing spent.
 *
 * @param {Token|TokenDocument} token
 * @param {{holder: Token|TokenDocument, within: number, name?: string, holderName?: string, source?: string, taken?: Array<object>}} o
 * @returns {Promise<{to: {x: number, y: number}, stays: boolean, box: object}|null>}
 */
export async function pickPull(token, { holder, within = 10, name = "", holderName = "", source = "", taken = [] } = {}) {
  const doc = docOf(token);
  if (!doc?.parent) return null;
  let landed = null;
  const point = await pickPoint({
    hint: game.i18n.format("AZEROTH.Pull.Pick", { name, feet: within, holder: holderName, source }),
    sceneId: doc.parent.id,
    accept: p => {
      const judged = judgePull(doc, p, { holder, within, taken });
      if (!judged.refusal) {
        landed = judged;
        return true;
      }
      ui.notifications?.warn(pullWords(judged.refusal, { name, feet: within, holder: holderName }));
      return false;
    }
  });
  return point && landed ? { to: landed.to, stays: landed.stays, box: boxAt(doc, landed.to) } : null;
}

/* -------------------------------------------- */
/*  What a step's source allows (the B2 review)   */
/* -------------------------------------------- */

/**
 * **WHAT THE ITEM THAT MOVES A TOKEN ALLOWS** (the B2 review, item h), read the way the
 * door that asked read it - so the GM's client trusts no feet a client sent:
 *
 * - 02's Blink: `class-talents.mjs#blinkFor`'s reach, and Slow Time's ally within its
 *   friendly feet;
 * - 02's Shadowstep (the Rogue's): 60 feet;
 * - a talent's `onUse.step` at its rank (04's Fade Step), and a talent's `pullEntangled`
 *   (04's None Escape) - the granting talent's own row;
 * - a spell: 07's own words (`readSpellStep`), and a party step's burst off its Target
 *   line (`partyRadius`).
 *
 * @param {Actor} by     the user
 * @param {Item|null} item  the feature or spell that moves the token
 * @returns {{feet: number|null, friend: number|null, party: number|null, pull: {feet: number, within: number}|null}|null}
 */
export function stepAllowance(by, item) {
  if (!by || !item) return null;
  if (item.type === "spell") {
    const step = readSpellStep(item.system?.effect ?? "") ?? spellCrossingFrom(item);
    if (!step) return null;
    // 04's Weaver's Lore on Farstep (*you may bring one willing creature within 5 feet of
    // you*; stage 2b): its companion is a party step of the talent's feet.
    const companion = farstepCompanion(by.takenTalents?.() ?? [], { spell: item.name }, talentEffect);
    return { feet: step.feet, friend: null, party: step.who === "selfAndTargets" ? partyRadius(item.system?.target ?? "") : (companion?.feet ?? null), pull: null };
  }
  if (item.type !== "feature") return null;
  if (item.name === BLINK.feature) {
    const reach = blinkFor(by.takenTalents?.() ?? []);
    return { feet: reach.feet ?? FEATURE_STEPS.Blink.feet, friend: reach.friendly?.feet ?? null, party: null, pull: null };
  }
  if (item.name === "Shadowstep" && item.system?.className === "Rogue") return { feet: FEATURE_STEPS.Shadowstep.feet, friend: null, party: null, pull: null };
  const flag = item.getFlag?.("azeroth-rpg", "feature") ?? item.flags?.["azeroth-rpg"]?.feature ?? {};
  const talent = flag.talentId ? (by.items?.get?.(flag.talentId) ?? null) : null;
  // 02's Recall (*you may return to that space*; stage 2b): the user's own token back to the
  // mark it laid, on the mark's scene, whatever the distance - the mark is the reach.
  if (!talent && item.name === "Recall" && item.system?.className === "Chronomancer") {
    const mark = by.getFlag?.("azeroth-rpg", RECALL_FLAG) ?? null;
    return recallStands(mark, game.time?.worldTime ?? 0) ? { feet: 1e6, friend: null, party: null, pull: null } : null;
  }
  // A class feature's own step (02's Draconic Leap; stage 2B), off its row's `onUse`.
  if (!talent) {
    const own = stepOf(classFeatureOnUse(item.system?.className ?? "", item.name), 1);
    return own ? { feet: own.feet, friend: null, party: null, pull: null } : null;
  }
  const rank = talent.system?.taken ?? flag.rank ?? 1;
  const onUse = onUseOf(talentEffect(talent.system?.className, talent.system?.identifier, talent.system?.race ?? null));
  // 04's Quickstep (*One willing ally within 30 feet moves up to 10 feet per rank*; stage 2b):
  // the ally within the reach, moving the rank's feet - a `friend` step.
  if (onUse?.quickstep) return { feet: quickstepFeet(rank, onUse.quickstep.per), friend: onUse.quickstep.feet ?? 30, party: null, pull: null };
  const own = stepOf(onUse, rank);
  if (own) return { feet: own.feet, friend: null, party: null, pull: null };
  const legacy = onUseLegacy(onUse, { rank, tier: by.system?.tier ?? 1, scope: abilityScope(by.system) });
  if (legacy.pullEntangled) return { feet: null, friend: null, party: null, pull: { feet: legacy.pullEntangled.feet, within: legacy.pullEntangled.within } };
  return null;
}

/**
 * The user's own token on a scene: its synthetic actor's token, else the linked token
 * that names its actor. Null where the user stands nowhere on it.
 */
function holderTokenOn(scene, actor) {
  if (!scene || !actor) return null;
  if (actor.isToken && actor.token?.parent?.id === scene.id) return actor.token;
  return (scene.tokens ?? []).find(t => t.actorLink && t.actorId === actor.id) ?? null;
}

/** Whether a creature on the board counts as the user's ally (D-755's one rule), read off the documents. */
function alliedOn(by, holderDoc, doc) {
  const fight = by?.activeFight?.() ?? null;
  const other = doc?.actor ?? null;
  if (!by || !other) return false;
  return countsAsAlly(
    allyStandingOf({ token: holderDoc, actor: by, combatant: combatantIn(fight, by, holderDoc), fight }),
    allyStandingOf({ token: doc, actor: other, combatant: combatantIn(fight, other, doc), fight })
  );
}

/**
 * **WHETHER THIS STEP MAY MOVE THIS TOKEN TO THIS SPACE**, by its kind, off the user's
 * own item - the judgement the GM's client makes for a token the asker does not own
 * (the B2 review, item h). A refusal key, else the space.
 *
 * @param {{token: TokenDocument, centre: {x: number, y: number}, kind: string, allowance: object, holder: TokenDocument|null, by: Actor, except?: string[]}} o
 * @returns {{refusal: string|null, words: string|null, to: {x: number, y: number}|null, stays?: boolean}}
 */
export function judgeMove({ token, centre, kind, allowance, holder, by, except = [] } = {}) {
  const name = token?.name ?? "";
  const refuse = key => ({ refusal: key, words: game.i18n.format(STEP_REFUSALS[key] ?? STEP_REFUSALS.unallowed, { name, feet: allowance?.feet ?? 0 }), to: null });
  if (!allowance || !STEP_KINDS.includes(kind) || !holder) return refuse("unallowed");
  const own = holder.id === token.id;
  if (kind === "self") {
    if (!own || !(allowance.feet > 0)) return refuse("unallowed");
  } else if (kind === "friend") {
    if (own || !(allowance.friend > 0) || !alliedOn(by, holder, token)) return refuse("unallowed");
    const apart = feetApart(holder, token);
    if (apart === null || apart > allowance.friend + 1e-6) return refuse("unallowed");
  } else if (kind === "party") {
    if (own || !(allowance.party > 0) || !alliedOn(by, holder, token)) return refuse("unallowed");
  } else if (kind === "pull") {
    const pull = allowance.pull;
    if (own || !pull) return refuse("unallowed");
    const held = (token.actor?.effects ?? []).some(e => e.active !== false && e.statuses?.has?.("entangled") && laidByOne(e.flags?.["azeroth-rpg"] ?? {}, by.uuid));
    const apart = feetApart(holder, token);
    if (!held || apart === null || apart > pull.feet + 1e-6) return refuse("unallowed");
    const judged = judgePull(token, centre, { holder, within: pull.within });
    if (judged.refusal) return { refusal: judged.refusal, words: pullWords(judged.refusal, { name, feet: pull.within, holder: holder.name ?? "" }), to: null };
    return { refusal: null, words: null, to: judged.to, stays: judged.stays };
  }
  const judged = judgeStep(token, centre, { feet: allowance.feet, sight: "seen", except, askSight: false });
  if (judged.refusal) return { refusal: judged.refusal, words: stepWords(judged.refusal, { name, feet: allowance.feet }), to: null };
  // A party step lands within the burst of the user as the user now stands (the caster
  // moved first, and the party keeps its formation round it).
  if (kind === "party") {
    const after = feetApart(holder, token, { to: { x: judged.to.x, y: judged.to.y } });
    if (after === null || after > allowance.party + 1e-6) return refuse("unallowed");
  }
  return { refusal: null, words: null, to: judged.to };
}

/** Move it here; the caller has established that this client may write the token. */
async function stepHere(doc, to) {
  const done = await doc.move({ x: to.x, y: to.y, action: "displace" });
  return done === true && doc.x === to.x && doc.y === to.y;
}

/**
 * The GM-side handler (`STEP_QUERY`). Throws with the reason, which travels back to
 * the caller. **Nothing in the payload is trusted but which token, which space and
 * which item** (the B2 review, item h): the asker must own the user; the item must be
 * the user's own or a pack's (a spell cast by name); and the space is judged again by
 * the step's kind off that item (`judgeMove`) - its reach, its room, and whether the
 * token is one this step may move. The asker's sight is the asker's to see.
 */
export async function stepQueryHandler({ tokenUuid = null, x = null, y = null, byUuid = null, except = [], move = null } = {}, { user = null } = {}) {
  const token = tokenUuid ? await fromUuid(tokenUuid) : null;
  if (token?.documentName !== "Token") throw new Error(game.i18n.localize(STEP_REFUSALS.gone));
  const by = byUuid ? await fromUuid(byUuid) : null;
  if (by?.documentName !== "Actor" || (user && !by.testUserPermission(user, "OWNER"))) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: by?.name ?? "" }));
  }
  const item = typeof move?.itemUuid === "string" && move.itemUuid ? await fromUuid(move.itemUuid) : null;
  const ownItem = Boolean(item) && (Boolean(item.pack) || item.parent?.id === by.id || item.parent?.uuid === by.uuid);
  const allowance = ownItem ? stepAllowance(by, item) : null;
  const grid = gridOf(token.parent);
  const to = { x: Math.round(Number(x)), y: Math.round(Number(y)) };
  if (!Number.isFinite(to.x) || !Number.isFinite(to.y)) throw new Error(game.i18n.localize(STEP_REFUSALS.unmeasured));
  const centre = { x: to.x + ((token.width ?? 1) * grid.sizeX) / 2, y: to.y + ((token.height ?? 1) * grid.sizeY) / 2 };
  const verdict = judgeMove({
    token, centre, kind: move?.kind ?? null, allowance, holder: holderTokenOn(token.parent, by), by,
    except: Array.isArray(except) ? except.filter(id => typeof id === "string") : []
  });
  if (verdict.refusal) throw new Error(verdict.words ?? stepWords(verdict.refusal, { name: token.name ?? "" }));
  if (verdict.stays) return { moved: false, stays: true, name: token.name ?? "" };
  const moved = await stepHere(token, verdict.to);
  return { moved, name: token.name ?? "" };
}

/**
 * **MOVE A TOKEN TO THE SPACE PICKED**: a displacement, here or on the GM's client.
 *
 * @param {{token: Token|TokenDocument, to: {x: number, y: number}, feet?: number, by?: Actor|null, except?: string[],
 *   move?: {kind: string, itemUuid: string|null}|null}} o  `move` what the GM's client judges
 *   the step by: its kind (`rules/steps.mjs#STEP_KINDS`) and the item that makes it; `feet`
 *   is the caller's own and travels nowhere - the GM reads the item's (the B2 review)
 * @returns {Promise<{moved: boolean, name: string, reason: string|null, step: object|null}>}
 *   `step` the move as a card records it, where the token moved (the Legacy branches'
 *   door 2: `rules/animation-records.mjs#stepRecord`, centres in canvas pixels)
 */
export async function stepTo({ token, to, feet = 0, by = null, except = [], move = null } = {}) {
  const doc = docOf(token);
  const name = doc?.name ?? "";
  if (!doc?.parent || !to) return { moved: false, name, reason: "gone", step: null };
  // **WHERE IT STOOD AND WHERE IT LANDS, TAKEN BEFORE IT MOVES** (door 2): by the time
  // the Use's card arrives the token is at the destination, so the departure can only
  // be recorded - the caller puts this on the card, and the animation layer plays a
  // step's departure and arrival off it, never off where the token stands then.
  const grid = gridOf(doc.parent);
  const record = stepRecord({
    sceneId: doc.parent.id, tokenId: doc.id, kind: move?.kind ?? "self",
    from: { x: doc.x, y: doc.y }, to: { x: to.x, y: to.y },
    width: doc.width ?? 1, height: doc.height ?? 1, sizeX: grid.sizeX, sizeY: grid.sizeY
  });
  try {
    if (doc.isOwner) {
      const moved = await stepHere(doc, to);
      return { moved, name, reason: null, step: moved ? record : null };
    }
    const gm = game.users?.activeGM ?? null;
    if (!gm) return { moved: false, name, reason: "noGM", step: null };
    const done = await gm.query(STEP_QUERY, {
      tokenUuid: doc.uuid, x: to.x, y: to.y, byUuid: by?.uuid ?? null, except,
      move: move && STEP_KINDS.includes(move.kind) ? { kind: move.kind, itemUuid: move.itemUuid ?? null } : null
    }, { timeout: 15000 });
    const moved = done?.moved === true;
    return { moved, name: done?.name ?? name, reason: moved ? null : "gone", step: moved ? record : null };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { moved: false, name, reason: "gone", step: null };
  }
}

/**
 * What a step came to, in words, for a card's line: *Kaelen steps 20 ft*, or why
 * the token stayed.
 *
 * @param {{moved: boolean, name: string, reason: string|null}} r
 * @param {{feet?: number, source?: string}} [o]
 */
export function steppedWords(r, { feet = 0, source = "" } = {}) {
  if (r?.moved) return game.i18n.format("AZEROTH.Step.Moved", { name: r.name, feet, source });
  return game.i18n.format(STEP_REFUSALS[r?.reason] ?? STEP_REFUSALS.gone, { name: r?.name ?? "", feet, source });
}

/**
 * What a None Escape pull came to, in words: *the Plagued Ghoul is pulled to a space
 * within 10 ft of Shandris*, left where it stands, or why it stayed.
 *
 * @param {{moved: boolean, name: string, reason: string|null, stays?: boolean}} r
 * @param {{feet?: number, holder?: string, source?: string}} [o]
 */
export function pulledWords(r, { feet = 0, holder = "", source = "" } = {}) {
  if (r?.stays) return game.i18n.format("AZEROTH.Pull.Stays", { name: r.name, feet, holder, source });
  if (r?.moved) return game.i18n.format("AZEROTH.Pull.Pulled", { name: r.name, feet, holder, source });
  return game.i18n.format(STEP_REFUSALS[r?.reason] ?? STEP_REFUSALS.gone, { name: r?.name ?? "", feet, source });
}
