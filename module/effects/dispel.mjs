/**
 * **02's DISPEL, WHERE IT TOUCHES THE WORLD** (D-778; the lead, 2026-10-03, on
 * O-157: *"selected Effects, not conditions."*). `rules/dispel.mjs` is the law;
 * this reads a creature's effects into it, ends what the user selected, and posts
 * what 04's Unstable Affliction answers with.
 *
 * - **The read**: every Active Effect on the creature, plain, with the casters a
 *   laid Archmage stands on (07: *no dispel ... touches them*) and the gate each
 *   ongoing effect's warlock sets (04's Everlasting Affliction at rank 2).
 * - **The write**: here, where this client may write the creature, and on the
 *   active GM's client through `CONFIG.queries` where it may not (never
 *   `game.socket`, D-643). The handler asks that the asker own the DISPELLER and
 *   that the dispeller hold 02's Dispel, and judges every id again off the creature
 *   as the GM holds it - a condition, a marked Ward, an aura is never ended
 *   whatever the request says, except as a held Sustained cast, which is ended whole
 *   through `workflows.endSustain` (O-308).
 * - **A held Sustain with nothing of it on the creature** (O-312; the lead: *"312 - yes it
 *   can"*): reached through its caster, a creature standing in its area, or the area itself
 *   (`reachedFor`), listed as a row of its own and ended through `workflows.endSustain` by
 *   `endHeldCasts`, here or through the same query.
 * - **What it answers with**: the effects ended, each with the warlock whose
 *   ongoing effect it was, so 04's Unstable Affliction posts its card on the
 *   creature whose Dispel ended it (`unstableStrikes`).
 *
 * Deleting an effect is enough for everything that rode it: a shape's own hook
 * leaves the shape (D-769), temporary Health ends with the effect that carried it
 * (D-777), a tick or a Ward goes with its effect.
 */

import { AZEROTH } from "../config.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";
import { cleanEffectIds, dispelGated, dispelJudgement, dispelOptions, ongoingOwner, spellCasterOf, sustainOf } from "../rules/dispel.mjs";
// O-312: a held Sustain reached through its caster, a creature in its area, or the area itself.
import { castsReached, cleanAimPoint, cleanCastIds, heldCastKey, judgeHeldCast } from "../rules/dispel.mjs";
import { areaRecord, isDown } from "../canvas/sustained-areas.mjs";
import { sustainEntryTransferPending } from "../rules/sustain-entry-transfer.mjs";
// O-308: a held Sustained cast is ended through the one end door, and the sweep takes what it laid.
import { reconcileSustainedSpells } from "./sustained-spells.mjs";
import { dispelGateFor, unstableFor } from "../rules/class-talents.mjs";
import { wardBySchool } from "../rules/ward.mjs";
import { strikeCard } from "./after-blow.mjs";
// An area's dispel (04's Disenchant; the Legacy branches' door 25), judged off the
// dispeller's own feature.
import { featureOnUse } from "./legacy-uses.mjs";
import { onUseSpirits } from "../rules/legacy-uses.mjs";
// 07's Unweave, cast by a Champion who knows it through a talent (stage 3B).
import { branchSpellOf } from "../rules/chromatic-talents.mjs";
import { talentEffect } from "../rules/talent-effects.mjs";

/** The query an end on a creature this client does not own goes through. */
export const DISPEL_QUERY = "azeroth-rpg.dispel";

/** Resolve an actor by uuid, quietly. */
function actorAt(uuid) {
  if (!uuid) return null;
  try {
    const doc = fromUuidSync(uuid);
    return doc?.documentName === "Actor" ? doc : null;
  } catch {
    return null;
  }
}

/**
 * An Active Effect as the law reads it: plain, and switched off where core does
 * not apply it.
 *
 * @param {ActiveEffect} effect
 */
export function plainEffect(effect) {
  return {
    id: effect.id, name: effect.name ?? "", statuses: [...(effect.statuses ?? [])], origin: effect.origin ?? null,
    flags: effect.flags ?? {}, disabled: effect.disabled === true || effect.active === false
  };
}

/**
 * **THE CASTERS A LAID ARCHMAGE STANDS ON** (07's Archmage: *For the duration your
 * spells can be ended only by you*), among the casters of these effects.
 *
 * @param {Array<object>} effects  plain
 * @returns {Set<string>}
 */
export function archmageCasters(effects = []) {
  const out = new Set();
  const asked = new Set();
  for (const e of effects) {
    // A held Sustained cast's caster too (07's Archmage: *no creature may end a Sustained spell of
    // yours by any means*; O-308).
    const caster = spellCasterOf(e) ?? sustainOf(e)?.by ?? null;
    if (!caster || asked.has(caster)) continue;
    asked.add(caster);
    const actor = actorAt(caster);
    if ((actor?.effects ?? []).some(x => x.active !== false && x.flags?.["azeroth-rpg"]?.identifier === "archmage")) out.add(caster);
  }
  return out;
}

/**
 * **THE CHOOSER'S ROWS FOR ONE CREATURE** (`rules/dispel.mjs#dispelOptions`), off
 * its effects as they stand.
 *
 * **AND THE HELD SUSTAINS REACHED THROUGH IT** (O-312; the lead: *"312 - yes it can"*): every
 * Sustain the creature holds as a caster, and every held area whose Region contains one of its
 * tokens (`tokens`, the one aimed at; every token standing for it where none is named), each a
 * row of its own (`reachedFor`).
 *
 * @param {Actor} actor
 * @param {{tokens?: TokenDocument[]|null}} [o]
 * @returns {Array<object>}
 */
export function dispelOptionsOn(actor, { tokens = null } = {}) {
  const effects = (actor?.effects ?? []).map(plainEffect);
  const reached = reachedFor({ actor, tokens });
  const archmage = new Set([...archmageCasters(effects), ...archmageAmong(Object.values(reached).map(r => r.by))]);
  const options = dispelOptions(effects, { archmage, sustains: sustainsFor(effects), reached })
    // A held cast's row says, in words, whose Sustain it is and the creatures it stands on (O-308).
    .map(row => (row.sustain ? { ...row, name: sustainWords("AZEROTH.Dispel.SustainRow", row.sustain) } : row));
  return iceBlockFor(actor)
    ? options.map(row => ({ ...row, available: false, reason: "iceBlock", by: null }))
    : options;
}

/**
 * **THE CREATURES A CAST STANDS ON** (O-308): every creature on the board - a token on any scene,
 * once per actor - carrying an effect that cast laid (`sustained`, `cast`), by its token's name,
 * sorted.
 *
 * @param {string} cast
 * @returns {string[]}
 */
export function castBearers(cast) {
  if (!cast) return [];
  const names = new Map();
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) {
    const actor = token.actor;
    if (!actor || names.has(actor.uuid)) continue;
    if ((actor.effects ?? []).some(e => e.flags?.["azeroth-rpg"]?.sustained === true && e.flags["azeroth-rpg"].cast === cast)) names.set(actor.uuid, token.name ?? actor.name ?? "");
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * **THE HELD SUSTAINED CASTS THESE EFFECTS BELONG TO** (O-308): for each cast an effect names
 * (`rules/dispel.mjs#sustainOf`) whose caster still holds it on its Sustain list, the spell's
 * name, the caster's and the creatures the cast stands on - what `dispelOptions` folds into one
 * row and `dispelJudgement` reads as `held`. A cast no caster holds is not here, so its effect is
 * judged as a bare effect (and a condition on it greyed, D-778).
 *
 * @param {Array<object>} effects  plain
 * @returns {Record<string, {spell: string, caster: string, held: string[], by: string}>}
 */
export function sustainsFor(effects = []) {
  const out = {};
  for (const e of effects ?? []) {
    const s = sustainOf(e);
    if (!s || Object.hasOwn(out, s.cast)) continue;
    const caster = actorAt(s.by);
    const entry = (caster?.getFlag?.("azeroth-rpg", "sustaining") ?? []).find(row => row?.cast === s.cast) ?? null;
    if (!entry) continue;
    out[s.cast] = { spell: String(entry.name ?? ""), caster: caster.name ?? "", held: castBearers(s.cast), by: s.by };
  }
  return out;
}

/* -------------------------------------------- */
/*  O-312: a held Sustain reached three ways     */
/* -------------------------------------------- */

/**
 * **EVERY TOKEN STANDING FOR THIS ACTOR** on the board: a token actor's own document, or every
 * linked token of a world actor on any scene, in scene and token order.
 *
 * @param {Actor|null} actor
 * @returns {TokenDocument[]}
 */
export function tokensOfActor(actor) {
  if (!actor) return [];
  if (actor.isToken && actor.token) return [actor.token];
  const out = [];
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) {
    if (token.actorLink && token.actorId === actor.id) out.push(token);
  }
  return out;
}

/** Whether a Region contains this token, asked of the DOCUMENT (14.367 `testInsideRegion`). */
function tokenInside(token, region) {
  try {
    return Boolean(token?.parent) && token.parent === region.parent && token.testInsideRegion(region) === true;
  } catch {
    return false;
  }
}

/** Whether a Region contains this point on its scene (14.367 `RegionDocument#testPoint`). */
function pointInside(region, point) {
  try {
    return region.testPoint({ x: point.x, y: point.y, elevation: 0 }) === true;
  } catch {
    return false;
  }
}

/** The names of the tokens standing in a Region, once a name. */
function namesInside(region) {
  const names = new Set();
  for (const token of region?.parent?.tokens ?? []) if (token.actor && tokenInside(token, region)) names.add(token.name ?? token.actor.name ?? "");
  return [...names];
}

/** Every Region on the board recording this Sustained cast, in scene order. */
function regionsOfCast(cast) {
  const out = [];
  for (const scene of game.scenes ?? []) for (const region of scene.regions ?? []) {
    const row = areaRecord(region);
    if (row?.sustained && row.cast === cast) out.push(region);
  }
  return out;
}

/** A talent's mark on an area cast's card (`undispellable`, D-778), or null. */
function areaMark(region) {
  const id = region?.flags?.["azeroth-rpg"]?.messageId ?? null;
  const mark = id ? game.messages?.get(id)?.flags?.["azeroth-rpg"]?.undispellable : null;
  return mark && typeof mark.by === "string" && mark.by ? { by: mark.by } : null;
}

/**
 * **THE CASTERS A LAID ARCHMAGE STANDS ON**, among these casters' uuids (07's Archmage: *no
 * creature may end a Sustained spell of yours by any means*; O-312).
 *
 * @param {Iterable<string>} uuids
 * @returns {Set<string>}
 */
export function archmageAmong(uuids = []) {
  const out = new Set();
  for (const uuid of new Set(uuids)) {
    const actor = actorAt(uuid);
    if ((actor?.effects ?? []).some(x => x.active !== false && x.flags?.["azeroth-rpg"]?.identifier === "archmage")) out.add(uuid);
  }
  return out;
}

/**
 * **THE HELD SUSTAINS A DISPEL AIMED HERE COULD REACH** (O-312): what the creature aimed at holds
 * as a caster (`by`), and every held AREA whose Region contains one of its tokens or the point
 * aimed at (`inside`). A Region counts where it records a Sustained cast (`areaRecord`'s
 * `sustained`) and its caster, not down, still holds that cast; a caster who is down holds
 * nothing (`canvas/sustained-areas.mjs#isDown`).
 *
 * @param {{actor?: Actor|null, tokens?: TokenDocument[]|null, at?: object|null}} aim
 * @returns {{held: Record<string, object>, inside: string[], by: string|null}}
 */
export function heldSustainsAt({ actor = null, tokens = null, at = null } = {}) {
  const held = {};
  const inside = [];
  if (actor && !isDown(actor)) {
    for (const entry of actor.getFlag?.("azeroth-rpg", "sustaining") ?? []) {
      if (!entry?.cast || Object.hasOwn(held, entry.cast)) continue;
      // A held area reached through its caster names the creatures standing in it.
      const placed = regionsOfCast(entry.cast);
      const names = new Set([...castBearers(entry.cast), ...placed.flatMap(namesInside)]);
      held[entry.cast] = {
        spell: String(entry.name ?? ""), caster: actor.name ?? "", by: actor.uuid, area: placed.length > 0,
        marked: placed.map(areaMark).find(Boolean) ?? null,
        transfer: sustainEntryTransferPending(entry, actor.uuid) || placed.some(r => areaRecord(r)?.transferPending === true),
        held: [...names].sort((a, b) => a.localeCompare(b))
      };
    }
  }
  const standing = (tokens ?? tokensOfActor(actor)).filter(Boolean);
  const point = cleanAimPoint(at);
  const scenes = new Set(standing.map(t => t.parent).filter(Boolean));
  const pointScene = point ? (game.scenes?.get(point.sceneId) ?? null) : null;
  if (pointScene) scenes.add(pointScene);
  for (const scene of scenes) for (const region of scene.regions ?? []) {
    const row = areaRecord(region);
    if (!row?.sustained || !row.caster) continue;
    const here = (pointScene === scene && pointInside(region, point)) || standing.some(t => tokenInside(t, region));
    if (!here) continue;
    const caster = actorAt(row.caster);
    if (!caster || isDown(caster)) continue;
    const entry = (caster.getFlag?.("azeroth-rpg", "sustaining") ?? []).find(e => e?.cast === row.cast) ?? null;
    if (!entry) continue;
    const names = new Set([...namesInside(region), ...castBearers(row.cast), ...(held[row.cast]?.held ?? [])]);
    held[row.cast] = {
      spell: String(entry.name ?? ""), caster: caster.name ?? "", by: caster.uuid, area: true, marked: areaMark(region),
      transfer: sustainEntryTransferPending(entry, caster.uuid) || row.transferPending === true,
      held: [...names].sort((a, b) => a.localeCompare(b))
    };
    if (!inside.includes(row.cast)) inside.push(row.cast);
  }
  return { held, inside, by: actor?.uuid ?? null };
}

/**
 * **THE HELD SUSTAINS REACHED** (O-312), keyed by cast: `rules/dispel.mjs#castsReached` over
 * what `heldSustainsAt` gathered - the one law the chooser, the door's re-judgement on the GM's
 * client and the census all read.
 *
 * @param {{actor?: Actor|null, tokens?: TokenDocument[]|null, at?: object|null}} aim
 * @returns {Record<string, object>}
 */
export function reachedFor(aim = {}) {
  const { held, inside, by } = heldSustainsAt(aim);
  return Object.fromEntries(castsReached(held, { by, inside }).map(cast => [cast, held[cast]]));
}

/**
 * **THE CHOOSER'S ROWS FOR THE AREA ITSELF** (O-312): the held areas whose Region contains the
 * point aimed at, each judged as `judgeHeldCast` judges it.
 *
 * @param {{sceneId: string, x: number, y: number}} at
 * @returns {Array<object>}
 */
export function dispelRowsAt(at) {
  const reached = reachedFor({ at, tokens: [] });
  const archmage = archmageAmong(Object.values(reached).map(r => r.by));
  return dispelOptions([], { archmage, reached })
    .map(row => (row.sustain ? { ...row, name: sustainWords("AZEROTH.Dispel.SustainRow", row.sustain) } : row));
}

/**
 * **WHETHER A HELD AREA STANDS ON THIS SCENE** (O-312): what decides whether Dispel, aimed at no
 * creature, offers the point to pick rather than refusing at once.
 *
 * @param {Scene|null} scene
 */
export function heldAreasOn(scene) {
  for (const region of scene?.regions ?? []) {
    const row = areaRecord(region);
    if (!row?.sustained || !row.caster) continue;
    const caster = actorAt(row.caster);
    if (caster && !isDown(caster) && (caster.getFlag?.("azeroth-rpg", "sustaining") ?? []).some(e => e?.cast === row.cast)) return true;
  }
  return false;
}

/**
 * **THE CASTERS WHOSE SUSTAINS THESE REACHED CASTS ARE** (O-312): the door writes on the GM's
 * client unless this one may write every one of them.
 *
 * @param {{target?: Actor|null, tokens?: TokenDocument[]|null, at?: object|null, casts?: string[]}} o
 * @returns {Actor[]}
 */
export function heldCastersOf({ target = null, tokens = null, at = null, casts = [] } = {}) {
  const want = new Set(cleanCastIds(casts));
  const reached = reachedFor({ actor: target, tokens, at });
  const out = new Map();
  for (const [cast, row] of Object.entries(reached)) {
    if (!want.has(cast)) continue;
    const caster = actorAt(row.by);
    if (caster) out.set(caster.uuid, caster);
  }
  return [...out.values()];
}

/**
 * End the reached casts here; the caller has established that this client may write their
 * casters. Judged again off the board as it stands: a cast no longer reached, refused, or
 * already ended by another door is left. Each through `workflows.endSustain` matched on the cast
 * (D-760's one door), so its Region goes through the area sweep's one queue, its ticks, ground,
 * auras and loop with it, and no upkeep is asked.
 */
async function endHeldHere({ target = null, at = null, casts = [] }) {
  const want = new Set(cleanCastIds(casts));
  if (target && iceBlockFor(target)) return { name: target.name, ended: [], kept: [...want].sort() };
  const reached = reachedFor({ actor: target, at });
  const archmage = archmageAmong(Object.values(reached).map(r => r.by));
  const ended = [];
  const done = new Set();
  for (const cast of Object.keys(reached).sort((a, b) => a.localeCompare(b))) {
    if (!want.has(cast)) continue;
    const info = reached[cast];
    if (!judgeHeldCast(info, { archmage }).ok) continue;
    const caster = actorAt(info.by);
    const gone = caster ? await game.system.azeroth.workflows.endSustain({ actor: caster, cast, notice: "AZEROTH.Dispel.SustainNotice" }) : null;
    if (!gone) continue;
    // A Sustained cast is not an ongoing effect (07 §7), so no warlock's talent answers it.
    ended.push({ id: heldCastKey(cast), name: sustainWords("AZEROTH.Dispel.SustainEnded", info), owner: null, sustain: cast });
    done.add(cast);
  }
  if (done.size) await reconcileSustainedSpells();
  return { name: target?.name ?? "", ended, kept: [...want].filter(c => !done.has(c)).sort() };
}

/**
 * **END THE HELD SUSTAINS REACHED, AND SAY WHAT CAME OF IT** (O-312; the lead: *"312 - yes it
 * can"*): the casts the chooser listed through the creature aimed at (`target`) or the point
 * (`at`), here where this client may write every caster, else on the active GM's client through
 * `DISPEL_QUERY`, which judges the dispeller and every cast again. 07's Unweave hands every cast
 * reached (*Every spell effect on the target ends*; the lead: *"unweave - yes"*).
 *
 * @param {{dispeller: Actor, target?: Actor|null, at?: object|null, casts?: string[], name?: string, featureId?: string|null, unweave?: boolean}} o
 * @returns {Promise<{name: string, ended: Array<object>, kept: string[], error?: boolean}>}
 */
export async function endHeldCasts({ dispeller, target = null, at = null, casts = [], name = "", featureId = null, unweave = false } = {}) {
  const keys = cleanCastIds(casts);
  const point = cleanAimPoint(at);
  if (!keys.length) return { name, ended: [], kept: [] };
  if (!target && !point) return { name, ended: [], kept: keys, error: true };
  try {
    if (heldCastersOf({ target, at: point, casts: keys }).every(c => c.isOwner)) {
      const here = await endHeldHere({ target, at: point, casts: keys });
      return { ...here, name: name || here.name };
    }
    const gm = game.users?.activeGM ?? null;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Dispel.NoGM"));
    const done = await gm.query(DISPEL_QUERY, {
      targetUuid: target?.uuid ?? null, dispellerUuid: dispeller?.uuid ?? null, ids: [], featureId: featureId ?? null,
      unweave: unweave === true, casts: keys, at: point
    }, { timeout: 15000 });
    return done && typeof done === "object"
      ? { name: name || done.name || "", ended: Array.isArray(done.ended) ? done.ended : [], kept: Array.isArray(done.kept) ? done.kept : [] }
      : { name, ended: [], kept: keys, error: true };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { name, ended: [], kept: keys, error: true };
  }
}

/** A held cast in words: `{spell, caster, held}` under the key. */
function sustainWords(key, sustain) {
  const held = sustain.held?.length ? sustain.held.join(", ") : game.i18n.localize("AZEROTH.Dispel.SustainNobody");
  return game.i18n.format(key, { spell: sustain.spell, caster: sustain.caster, held });
}

/**
 * **THE GATE EACH SELECTED EFFECT'S WARLOCK SETS** (04's Everlasting Affliction at
 * rank 2), off the warlock's own talents: the effects that wait on a Casting Test,
 * each with its SL.
 *
 * @param {Actor} target
 * @param {string[]} ids  the effects selected
 * @returns {Array<{id: string, sl: number, by: string, owner: string}>}
 */
export function dispelGatesOn(target, ids = []) {
  const want = new Set(ids);
  const effects = (target?.effects ?? []).filter(e => want.has(e.id)).map(plainEffect);
  const gates = {};
  for (const e of effects) {
    const owner = ongoingOwner(e);
    if (!owner || owner in gates) continue;
    const warlock = actorAt(owner);
    gates[owner] = typeof warlock?.takenTalents === "function" ? dispelGateFor(warlock.takenTalents()) : null;
  }
  return dispelGated(effects, gates);
}

/**
 * End them here; the caller has established that this client may. Judged again. **07's
 * Unweave** (*Every spell effect on the target ends*; stage 3B) ends a SPELL's effect alone -
 * a laid spell or a spell's tick (`spellCasterOf`) - under the same judgement, and a held
 * Sustained cast's effect as the cast (O-308).
 */
async function endHere({ target, ids, unweave = false }) {
  const want = new Set(cleanEffectIds(ids));
  if (iceBlockFor(target)) return { name: target.name, ended: [], kept: [...want].sort() };
  const effects = (target.effects ?? []).filter(e => want.has(e.id)).map(plainEffect);
  const archmage = archmageCasters(effects);
  // **A HELD SUSTAINED CAST IS ENDED AS THE CAST** (O-308; the lead: *"308 - sustained spells are
  // ended by dispel, so Sand Prison would be stopped."*): judged with the casts their casters
  // still hold, so an effect of one is ended through the one end door below and never alone.
  const sustains = sustainsFor(effects);
  const judged = effects
    .filter(e => !e.disabled)
    .map(e => ({ e, j: dispelJudgement(e, { archmage, held: Object.keys(sustains) }) }))
    .filter(({ e, j }) => j.ok && (!unweave || spellCasterOf(e) || j.sustain));
  const plain = judged.filter(({ j }) => !j.sustain).map(({ e }) => ({ id: e.id, name: e.name, owner: ongoingOwner(e) }));
  const gone = plain.map(e => e.id).filter(id => target.effects.has(id));
  if (gone.length) await target.deleteEmbeddedDocuments("ActiveEffect", gone);
  const ended = plain.filter(e => gone.includes(e.id));
  const endedIds = new Set(gone);
  // Each cast once, through `workflows.endSustain` matched on the cast (D-760's one door): the
  // Sustain entry comes off, the sweep takes every effect the cast laid on every creature, the area
  // sweep its Region, the reconciler its loop, and no upkeep is asked. A freeing that lands after
  // finds the caster holding nothing (`effects/sustained-spells.mjs#endFreedSustains`).
  const casts = new Map();
  for (const { e, j } of judged) {
    if (!j.sustain) continue;
    if (!casts.has(j.sustain.cast)) casts.set(j.sustain.cast, { first: e, sustain: j.sustain, ids: [] });
    casts.get(j.sustain.cast).ids.push(e.id);
  }
  for (const [cast, row] of [...casts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const caster = actorAt(row.sustain.by);
    const info = sustains[cast] ?? { spell: row.first.name, caster: caster?.name ?? "", held: [] };
    const done = caster ? await game.system.azeroth.workflows.endSustain({ actor: caster, cast, notice: "AZEROTH.Dispel.SustainNotice" }) : null;
    if (!done) continue;
    // A Sustained cast is not an ongoing effect (07 §7), so no warlock's talent answers it.
    ended.push({ id: row.first.id, name: sustainWords("AZEROTH.Dispel.SustainEnded", info), owner: null, sustain: cast });
    for (const id of row.ids) endedIds.add(id);
  }
  if (casts.size) await reconcileSustainedSpells();
  const kept = [...want].filter(id => !endedIds.has(id)).sort();
  return { name: target.name, ended, kept };
}

/**
 * **THE CASTERS WHOSE SUSTAINS A DISPEL OF THESE EFFECTS WOULD END** (O-308): the actors holding
 * the held casts the selected effects belong to - the door writes on the GM's client unless this
 * one may write every one of them as well as the creature.
 *
 * @param {Actor} target
 * @param {string[]} ids
 * @returns {Actor[]}
 */
export function sustainCastersOf(target, ids = []) {
  const want = new Set(ids);
  const effects = (target?.effects ?? []).filter(e => want.has(e.id)).map(plainEffect);
  return Object.values(sustainsFor(effects)).map(s => actorAt(s.by)).filter(Boolean);
}

/**
 * **WHETHER THE DISPELLER'S FEATURE IS AN AREA'S DISPEL** (04's Disenchant: *end one
 * effect on each creature within 15 feet of a point*; the Legacy branches' door 25):
 * the feature the request names, its Use read at the rank off the granting talent
 * (`effects/legacy-uses.mjs#featureOnUse`).
 *
 * @param {Actor} dispeller
 * @param {string|null} featureId
 */
function areaDispelHeld(dispeller, featureId) {
  const item = featureId ? (dispeller?.items?.get?.(featureId) ?? null) : null;
  if (item?.type !== "feature") return false;
  const { onUse, rank } = featureOnUse(dispeller, item);
  return Boolean(onUseSpirits(onUse, { rank }).areaDispel);
}

/**
 * The GM-side handler (`DISPEL_QUERY`). Throws with the reason, which travels back
 * to the caller as the refusal. A dispeller holds 02's Dispel, or the feature the
 * request names is an area's dispel (04's Disenchant; door 25).
 */
export async function dispelQueryHandler({ targetUuid = null, dispellerUuid = null, ids = [], featureId = null, unweave = false, casts = null, at = null } = {}, { user = null } = {}) {
  const target = targetUuid ? await fromUuid(targetUuid) : null;
  // O-312: the held Sustains reached through the creature or the point, judged again here.
  const heldAsked = Array.isArray(casts);
  const point = heldAsked ? cleanAimPoint(at) : null;
  if (target?.documentName !== "Actor" && !point) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user) {
    const dispeller = dispellerUuid ? await fromUuid(dispellerUuid) : null;
    if (dispeller?.documentName !== "Actor" || !dispeller.testUserPermission(user, "OWNER")) {
      throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: dispeller?.name ?? "" }));
    }
    // 07's Unweave is a spell its caster knows: a spell item of that name, or one a taken talent
    // teaches (04's Unraveller; stage 3B).
    const weaves = unweave === true && (dispeller.items?.some?.(i => i.type === "spell" && i.system?.identifier === "unweave")
      || Boolean(branchSpellOf(dispeller.takenTalents?.() ?? [], "Unweave", talentEffect)));
    if (!weaves) {
      if (!dispeller.hasFeature?.("Dispel") && !areaDispelHeld(dispeller, featureId)) throw new Error(game.i18n.format("AZEROTH.Dispel.NoFeature", { name: dispeller.name }));
    }
  }
  if (heldAsked) return endHeldHere({ target: target?.documentName === "Actor" ? target : null, at: point, casts });
  return endHere({ target, ids, unweave: unweave === true });
}

/**
 * **END THE EFFECTS SELECTED ON ONE CREATURE**, and say what came of it.
 *
 * @param {{dispeller: Actor, target: Actor|null, ids: string[], name?: string, featureId?: string|null}} o
 *   `featureId` the area dispel's own feature (04's Disenchant; door 25), which the
 *   GM's handler judges the request by
 * @returns {Promise<{name: string, ended: Array<{id: string, name: string, owner: string|null}>, kept: string[], error?: boolean}>}
 */
export async function endEffects({ dispeller, target, ids = [], name = "", featureId = null, unweave = false } = {}) {
  if (!target) return { name, ended: [], kept: [...ids], error: true };
  try {
    // A held cast's caster is written too (O-308): here only where this client may write it.
    if (target.isOwner && sustainCastersOf(target, ids).every(c => c.isOwner)) return await endHere({ target, ids, unweave });
    const gm = game.users?.activeGM ?? null;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Dispel.NoGM"));
    const done = await gm.query(DISPEL_QUERY, { targetUuid: target.uuid, dispellerUuid: dispeller?.uuid ?? null, ids: cleanEffectIds(ids), featureId: featureId ?? null, unweave: unweave === true }, { timeout: 15000 });
    return done && typeof done === "object"
      ? { name: done.name ?? target.name, ended: Array.isArray(done.ended) ? done.ended : [], kept: Array.isArray(done.kept) ? done.kept : [] }
      : { name: target.name, ended: [], kept: [...ids], error: true };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { name: target.name, ended: [], kept: [...ids], error: true };
  }
}

/**
 * **04's UNSTABLE AFFLICTION** (*A target that ends one of your ongoing effects early
 * takes Fel damage equal to twice your tier per rank*): for each effect a Dispel
 * ended whose warlock holds the talent, a card of Fel damage on the creature whose
 * Dispel ended it, at the warlock's tier - its Apply the table's, its damage met by
 * the dispeller's own Ward (`strikeCard`, Shadowy Apparition's card). One card a
 * warlock, its amount once an effect ended (MY READING, for the lead).
 *
 * @param {{dispeller: Actor, ended: Array<{name: string, owner: string|null}>}} o
 * @returns {Promise<string[]>}  what was posted, in words
 */
export async function unstableStrikes({ dispeller, ended = [] } = {}) {
  const said = [];
  if (!dispeller) return said;
  const byOwner = new Map();
  for (const e of ended) {
    if (!e?.owner) continue;
    byOwner.set(e.owner, [...(byOwner.get(e.owner) ?? []), e.name]);
  }
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  for (const [owner, names] of [...byOwner.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const warlock = actorAt(owner);
    if (typeof warlock?.takenTalents !== "function") continue;
    const row = unstableFor(warlock.takenTalents(), { tier: warlock.system?.tier ?? 1 });
    if (!row) continue;
    const amount = row.amount * names.length;
    const token = dispeller.getActiveTokens?.(true)?.[0] ?? null;
    const targets = token ? targetSnapshots([token]) : [{
      tokenId: null, sceneId: null, actorId: dispeller.id, name: dispeller.name,
      wardBySchool: wardBySchool(dispeller.system?.ward), schoolArmor: {}, immune: dispeller.system?.immune ?? [], vulnerable: dispeller.system?.vulnerable ?? []
    }];
    const posted = await strikeCard({
      holder: warlock, targets, amount, type: row.type, name: row.name, kind: "unstable",
      subtitle: game.i18n.format("AZEROTH.Unstable.Subtitle", { name: dispeller.name }),
      explanation: game.i18n.format("AZEROTH.Unstable.Explanation", { n: row.amount, count: names.length, type: game.i18n.localize(AZEROTH.schools[row.type] ?? row.type) })
    });
    if (posted) said.push(game.i18n.format("AZEROTH.Unstable.Line", { name: dispeller.name, talent: row.name, warlock: warlock.name, n: amount, effects: names.join(", ") }));
  }
  return said;
}
