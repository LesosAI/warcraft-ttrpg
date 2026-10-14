/**
 * **SHAPES, WRITTEN** (02 §7; D-769). `rules/shapes.mjs` is the law; this is the
 * Foundry around it and the ONLY writer of a shape:
 *
 * - `takeShape` writes the one Active Effect that IS the shape - created, or
 *   rewritten in place where a shape stands, so a new shape replaces the old in
 *   one go - and dresses the actor's tokens;
 * - `leaveShape` deletes it and puts the tokens back;
 * - `syncShapeTokens` is the one reconciler for the tokens, and it is
 *   idempotent: every token of the actor wears what its actor's shape says, and
 *   keeps its own appearance in `flags.azeroth-rpg.shapeRestore` while it does.
 *
 * **WHO MAY WRITE A TOKEN**: its owner, on any scene (14.367's `BaseToken`
 * holds no `#canUpdate`), so a player's shift is written on the player's own
 * client and needs no GM query.
 *
 * **A RESIZE IS A MOVEMENT IN V14** (14.367 `client/documents/token.mjs`:
 * width or height alone starts one), so the size goes through core's own
 * `TokenDocument#resize`, which holds the centre, with `action: "displace"`:
 * a displacement is metered at nothing and is no creature moving
 * (`rules/movement.mjs#creatureMoved`), so the turn is not charged, no
 * Opportunity Attack is offered and no area is entered. An image alone is
 * no movement and is a plain update.
 */

import { RESTORE_FLAG, SHAPE_FLAG, SHAPE_KINDS, SWIFT_LEAVE, appearanceFor, centredResize, keepsFerocity, physicalHalf, readShape, shapeChanges, shapeEnds, snapshotOf } from "../rules/shapes.mjs";

/** The operation option the writer puts on its own effect writes, so the hooks below leave them alone. */
export const SHAPE_OPTION = "azerothShape";

/** The fallback image for a shape whose block carries no token art. */
const SHAPE_FALLBACK_ICON = "icons/svg/pawprint.svg";

/** Whether an Active Effect is a shape. */
export function isShapeEffect(effect) {
  return Boolean(effect?.getFlag?.("azeroth-rpg", SHAPE_FLAG));
}

/**
 * The shape effects an actor carries, in a fixed order (by id): there is one
 * at most, and the writer cleans up a second whatever door made it.
 *
 * @param {Actor} actor
 * @returns {ActiveEffect[]}
 */
export function shapeEffectsOf(actor) {
  return (actor?.effects?.contents ?? [])
    .filter(isShapeEffect)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/**
 * The name a shape is called by: *Black Bear form*, *Devilsaur form (Avatar of
 * the Wild)*, and Chimera's two names joined in the reader's language.
 *
 * @param {{kind: string, forms: object[]}} shape
 * @returns {string}
 */
export function shapeLabel(shape) {
  if (!shape?.kind) return "";
  const names = (shape.forms ?? []).map(f => f?.name).filter(Boolean);
  const name = game.i18n.getListFormatter({ type: "conjunction" }).format(names);
  return game.i18n.format(`AZEROTH.Shape.EffectName.${shape.kind}`, { name });
}

/**
 * The create data of the shape effect: named for the shape, wearing the first
 * form's token art, drawn on the token always (`showIcon`), the three scores
 * overridden in the `initial` phase, and the flag every reader reads.
 *
 * @param {Actor} actor
 * @param {{kind: string, forms: object[], ward?: object|null}} shape
 */
export function shapeEffectData(actor, { kind, forms, ward = null }) {
  const physical = physicalHalf(forms);
  const label = shapeLabel({ kind, forms });
  return {
    name: label,
    img: forms[0]?.token || SHAPE_FALLBACK_ICON,
    origin: actor.uuid,
    // **WITHOUT THIS CORE NEVER DRAWS IT** (14.367 `Token#_drawEffects`): an
    // effect is drawn at ALWAYS, or at CONDITIONAL only while temporary, and a
    // shape has no duration. The icon on the token is the effect kept.
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    disabled: false,
    description: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Shape.EffectText", { name: label }))}</p>`,
    system: { changes: shapeChanges(physical) },
    // EVERY KEY, EVERY TIME: an update merges a flag object key by key, so a
    // `ward` left out would survive from the shape before.
    flags: { "azeroth-rpg": { [SHAPE_FLAG]: { kind, forms, ward: ward ?? null } } }
  };
}

/**
 * The snapshots of some 14-BESTIARY entries, by document or uuid, in order. An
 * entry that cannot be found is left out.
 *
 * @param {Array<Actor|string>} entries
 * @returns {Promise<object[]>}
 */
export async function formsFrom(entries = []) {
  const out = [];
  for (const entry of entries) {
    const doc = typeof entry === "string" ? await fromUuid(entry) : entry;
    if (!doc) continue;
    const source = typeof doc.toObject === "function" ? doc.toObject() : doc;
    out.push(snapshotOf(source, { uuid: doc.uuid ?? null }));
  }
  return out;
}

/** Empty the Ferocity pool (02 §7: *lose all of it the moment you drop the form*). */
async function zeroFerocity(actor) {
  const ferocity = (actor.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === "ferocity") ?? null;
  if (ferocity && ferocity.value > 0) await actor.updatePool({ itemId: ferocity.itemId, kind: "momentum", value: 0 });
}

/**
 * What follows a shape taken or left, beside the tokens: Thick Hide and kin
 * (D-648, gated on a Shapeshift form) and the bound demon Demonic Ascendance
 * reads (D-643, `inMetamorphosis`).
 */
async function afterShapeChange(actor) {
  await actor.syncTalentEffects?.().catch(err => console.error("azeroth-rpg | talent effects", err));
  await actor.syncBound?.().catch(err => console.error("azeroth-rpg | bound sync", err));
}

/**
 * **EVERYTHING THAT FOLLOWS A SHAPE WRITTEN, AND ALL OF IT, ALWAYS** (D-769, the
 * review): the Ferocity where the change empties it, the tokens, then the
 * talents and the bond. THE EFFECT IS THE TRUTH - each step is reconciled to it,
 * so a step that fails never stops the next one, and `afterShapeChange` runs
 * whatever the tokens did. A token that could not be written is said in words
 * by `syncShapeTokens`.
 *
 * @param {Actor} actor
 * @param {{zero?: boolean}} [o]  whether the Ferocity goes
 */
async function followShape(actor, { zero = false } = {}) {
  try {
    if (zero) await zeroFerocity(actor);
  } catch (err) {
    console.warn("azeroth-rpg | the Ferocity did not empty with the shape", err);
  }
  try {
    await syncShapeTokens(actor);
  } catch (err) {
    console.warn("azeroth-rpg | the tokens did not follow the shape", err);
  }
  await afterShapeChange(actor);
}

/**
 * **TAKE A SHAPE** (D-769): the one writer. Every judgement and the payment
 * have been made by the door that calls this (`workflows.useFeature`, D-768's
 * order); nothing here refuses.
 *
 * - The effect is created, or REWRITTEN IN PLACE where a shape stands - a new
 *   shape replaces the old in one write, so the hand-delete hook never reads a
 *   change of form as leaving one.
 * - Ferocity starts from 0 unless 04's Savage Shift at rank 2 keeps it between
 *   two Shapeshift forms (`keepsFerocity`).
 * - Every token is dressed from its TRUE original, never from the shape before.
 *
 * @param {Actor} actor
 * @param {object} o
 * @param {"shapeshift"|"avatar"|"metamorphosis"} o.kind
 * @param {Array<Actor|string>} [o.entries]  the 14-BESTIARY entries, by document or uuid
 * @param {object[]|null} [o.forms]          snapshots already taken - by the door's
 *   step 1b, before anything was paid (`useFeature`), or by the migration
 * @param {{school: string, value: number}|null} [o.ward]  Metamorphosis's Ward
 * @returns {Promise<ActiveEffect|null>}
 */
export async function takeShape(actor, { kind, entries = [], forms = null, ward = null } = {}) {
  if (!actor || actor.type !== "character" || !SHAPE_KINDS[kind]) return null;
  const snapshots = forms ?? await formsFrom(entries);
  if (!snapshots.length) return null;
  const before = actor.shape;
  const data = shapeEffectData(actor, { kind, forms: snapshots, ward });
  const held = shapeEffectsOf(actor);
  let effect = null;
  try {
    if (held.length) {
      const [keep, ...extra] = held;
      await actor.updateEmbeddedDocuments("ActiveEffect", [{ _id: keep.id, ...data }], { [SHAPE_OPTION]: true });
      const stale = extra.map(e => e.id).filter(id => actor.effects.has(id));
      if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale, { [SHAPE_OPTION]: true });
      effect = actor.effects.get(keep.id) ?? null;
    } else {
      [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [data], { [SHAPE_OPTION]: true });
    }
  } catch (err) {
    // THE EFFECT IS THE SHAPE: one that could not be written is no shape, said
    // in words, and the door that called learns and charges nothing more.
    console.warn("azeroth-rpg | the shape could not be written", err);
    ui.notifications?.warn(game.i18n.format("AZEROTH.Shape.NotWritten", { name: actor.name, form: shapeLabel({ kind, forms: snapshots }) }));
    effect = null;
  }
  const zero = Boolean(effect)
    && !keepsFerocity({ from: before?.kind ?? null, to: kind, savageShift: actor.talentRanks?.("Savage Shift") ?? 0 });
  await followShape(actor, { zero });
  return effect ?? null;
}

/**
 * The leave in flight for an actor on this client: a second door - Leave
 * pressed as 0 Health ends the Avatar - waits for it rather than deleting the
 * same effect twice.
 */
const leaving = new WeakMap();

/**
 * **LEAVE THE SHAPE** (D-769): the effect goes, Ferocity with a Shapeshift form
 * (02 §7), and every token goes back to what it was. Charges nothing: the
 * Half-Action is the sheet's door's (`combat-actions.mjs#leaveShapeControl`),
 * and a rest, 0 Health and a change of shape leave for free.
 *
 * @param {Actor} actor
 * @returns {Promise<object|null>}  the shape left, or null where there was none
 */
export async function leaveShape(actor) {
  if (!actor) return null;
  const running = leaving.get(actor);
  if (running) {
    await running.catch(() => null);
    return null;
  }
  const job = leaveNow(actor);
  leaving.set(actor, job);
  try {
    return await job;
  } finally {
    if (leaving.get(actor) === job) leaving.delete(actor);
  }
}

async function leaveNow(actor) {
  const held = shapeEffectsOf(actor);
  if (!held.length) return null;
  const before = actor.shape ?? readShape(held[0].getFlag("azeroth-rpg", SHAPE_FLAG));
  // ASKED AGAIN AT THE WRITE (the review): core's delete throws on an id the
  // collection no longer holds, and another client's leave - 0 Health on the
  // GM's - may already have landed here.
  const ids = held.map(e => e.id).filter(id => actor.effects.has(id));
  if (!ids.length) return null;
  await actor.deleteEmbeddedDocuments("ActiveEffect", ids, { [SHAPE_OPTION]: true });
  await settleAfterLeaving(actor, before);
  return before;
}

/** What follows a shape gone, whatever door took it away - all of it, always. */
async function settleAfterLeaving(actor, before) {
  await followShape(actor, { zero: Boolean(SHAPE_KINDS[before?.kind]?.ferocity) });
}

/**
 * **THE COUNTER THAT MAKES A LEAVE FREE** (04's Predator's Swiftness, D-769):
 * the feature the talent grants (D-648's `counter`), found by the talent's id
 * on its flag, or null where the talent is not taken.
 *
 * @param {Actor} actor
 * @returns {Item|null}
 */
export function swiftLeaveCounter(actor) {
  const talent = (actor?.items ?? []).find(i => i.type === "talent" && i.name === SWIFT_LEAVE && (Number(i.system?.taken) || 0) > 0);
  if (!talent) return null;
  return actor.items.find(i => i.type === "feature" && i.getFlag("azeroth-rpg", "feature")?.talentId === talent.id) ?? null;
}

/**
 * **A SHAPE ENDED BY AN EVENT**: a Short Rest, a Long Rest, or 0 Health
 * (`rules/shapes.mjs#shapeEnds`). Said in words where it ends.
 *
 * @param {Actor} actor
 * @param {"short"|"long"|"zeroHealth"} event
 * @returns {Promise<object|null>}  the shape that ended, or null
 */
export async function endShapeAt(actor, event) {
  const shape = actor?.shape ?? null;
  if (!shape) return null;
  if (!shapeEnds(shape.kind, event, { demonicAscendance: actor.talentRanks?.("Demonic Ascendance") ?? 0 })) return null;
  const label = shapeLabel(shape);
  await leaveShape(actor);
  ui.notifications?.info(game.i18n.format("AZEROTH.Shape.Ended", { name: actor.name, form: label }));
  return shape;
}

/**
 * Every token this actor's shape reaches: the token of a synthetic actor, or
 * every token of a world actor on every scene - linked or not, because an
 * unlinked token's actor inherits the world actor's effects, and each token is
 * dressed by what its OWN actor holds.
 *
 * @param {Actor} actor
 * @returns {TokenDocument[]}
 */
function tokensOf(actor) {
  if (actor.isToken) return actor.token ? [actor.token] : [];
  return actor.getDependentTokens({ concreteOnly: true }) ?? [];
}

/**
 * Dress one token in an appearance: the size through core's centre-holding
 * resize as a displacement, the image (and the flag that rides with it) in the
 * same write, or a plain update where the size does not move.
 *
 * Resolves whether the token now wears it: **core's `resize` answers `false`**
 * where a movement hook or the movement itself prevented it (14.367
 * `Scene#moveTokens`: *the resizing ... was prevented*), and that is not a
 * token written.
 */
async function dress(token, { width, height, src }, extra = {}) {
  const source = token._source ?? {};
  const texture = src && src !== source.texture?.src ? { texture: { src } } : {};
  if (source.width === width && source.height === height) {
    const update = { ...texture, ...extra };
    if (Object.keys(update).length) await token.update(update);
    return true;
  }
  return (await token.resize({ width, height, action: "displace", ...texture, ...extra })) !== false;
}

/**
 * **EVERY TOKEN WEARS WHAT ITS ACTOR'S SHAPE SAYS** (D-769): the one reconciler,
 * and idempotent - a second call writes nothing.
 *
 * - A shaped actor's token takes the shape's footprint and image; the first
 *   time, it keeps its own in `shapeRestore`, and a change of shape is read from
 *   that TRUE original - Bear to Wolf never restores the bear.
 * - An unshaped actor's token that still keeps an original is put back, and
 *   the flag goes.
 *
 * A token the user cannot write is left for its owner. **Every token is its own
 * write** (the review): one that throws or that core refuses is NOT counted,
 * the rest go on, and the ones left as they were are said in words - the
 * shape on the sheet is the truth and the token is only its picture.
 *
 * @param {Actor} actor
 * @returns {Promise<number>}  the tokens written
 */
export async function syncShapeTokens(actor) {
  if (!actor) return 0;
  let written = 0;
  const failed = [];
  for (const token of tokensOf(actor)) {
    if (!token?.isOwner) continue;
    let done = null;
    try {
      const want = token.actor?.shape ? appearanceFor(token.actor.shape.forms) : null;
      const original = token.getFlag("azeroth-rpg", RESTORE_FLAG) ?? null;
      if (want) {
        const base = original ?? { width: token._source.width, height: token._source.height, src: token._source.texture?.src ?? null };
        const keep = original ? {} : { flags: { "azeroth-rpg": { [RESTORE_FLAG]: base } } };
        const target = { width: want.width, height: want.height, src: want.src || base.src };
        const dressed = token._source.width === target.width && token._source.height === target.height
          && (!target.src || token._source.texture?.src === target.src);
        if (dressed && original) continue;
        done = await dress(token, target, keep);
      } else if (original) {
        done = await dress(token, original, { flags: { "azeroth-rpg": { [RESTORE_FLAG]: foundry.data.operators.ForcedDeletion.create() } } });
      } else continue;
    } catch (err) {
      console.warn(`azeroth-rpg | the token ${token.id} did not follow ${actor.name}'s shape`, err);
      done = false;
    }
    if (done) written++;
    else failed.push(token);
  }
  if (failed.length) {
    const scenes = [...new Set(failed.map(t => t.parent?.name).filter(Boolean))];
    ui.notifications?.warn(game.i18n.format("AZEROTH.Shape.TokenNotDressed", {
      name: actor.name,
      scenes: game.i18n.getListFormatter({ type: "conjunction" }).format(scenes.length ? scenes : ["?"])
    }));
  }
  return written;
}

/**
 * **THE REPAIR PASS** (D-769, the review): every character with a token on the
 * viewed scene has its tokens reconciled to its shape, so a token stranded
 * dressed - a hand edit, a write that failed, a world loaded with a shape left
 * half done - or stranded undressed is put right by the one idempotent
 * reconciler. On the active GM's client alone, at `ready` and at every
 * `canvasReady`; a consistent scene writes nothing.
 *
 * @param {Scene|null} [scene]  the viewed scene by default
 * @returns {Promise<number>}  the tokens written
 */
export async function repairShapeTokens(scene = globalThis.canvas?.scene ?? null) {
  if (!game.user?.isActiveGM || !scene?.tokens) return 0;
  const actors = new Map();
  for (const token of scene.tokens) {
    const actor = token.actor;
    if (actor?.type !== "character") continue;
    // A synthetic actor is its own; a world actor is reconciled once, on every scene.
    actors.set(actor.isToken ? `token:${token.id}` : actor.uuid, actor);
  }
  let written = 0;
  for (const actor of actors.values()) {
    written += await syncShapeTokens(actor).catch(err => {
      console.warn(`azeroth-rpg | the repair pass skipped ${actor.name}`, err);
      return 0;
    });
  }
  return written;
}

/**
 * **A TOKEN PLACED FOR A SHAPED CHARACTER WEARS THE SHAPE** (D-769), dressed
 * before it exists: `preCreateToken` runs on the client that creates it, and
 * the prototype token is never changed. The drop position was worked out for
 * the prototype's size, so the centre is held for the shape's
 * (`centredResize`).
 *
 * **A token that already keeps an original** - a dressed token copied and
 * pasted - is read from that original (the review): dressed in the shape the
 * actor wears NOW, or, where the actor has left its shape since the copy, put
 * back to the original with the flag gone. Before, it was left as it was, and
 * a pasted bear stood beside a Druid who had long since left the form.
 */
function onPreCreateToken(token) {
  const actor = token?.actor ?? null;
  if (!actor || actor.type !== "character") return;
  const source = token._source ?? {};
  const kept = source.flags?.["azeroth-rpg"]?.[RESTORE_FLAG] ?? null;
  const shape = actor.shape;
  const want = shape ? appearanceFor(shape.forms) : null;
  if (!want && !kept) return;
  const grid = token.parent?.grid?.size ?? canvas?.grid?.size ?? 100;
  const now = { x: source.x, y: source.y, width: source.width ?? 1, height: source.height ?? 1 };
  if (!want) {
    const at = centredResize(now, kept, grid);
    token.updateSource({
      width: kept.width ?? 1, height: kept.height ?? 1, x: at.x, y: at.y,
      ...(kept.src ? { texture: { src: kept.src } } : {}),
      flags: { "azeroth-rpg": { [RESTORE_FLAG]: foundry.data.operators.ForcedDeletion.create() } }
    });
    return;
  }
  const original = kept ?? { width: now.width, height: now.height, src: source.texture?.src ?? null };
  const at = centredResize(now, want, grid);
  const src = want.src || original.src;
  token.updateSource({
    width: want.width, height: want.height, x: at.x, y: at.y,
    ...(src ? { texture: { src } } : {}),
    flags: { "azeroth-rpg": { [RESTORE_FLAG]: original } }
  });
}

/** The actor a hook's effect stands on, where it is a shape on an actor. */
function shapedActorOf(effect) {
  if (!isShapeEffect(effect)) return null;
  const parent = effect.parent ?? null;
  return parent instanceof Actor ? parent : null;
}

/**
 * The hooks (D-769), each on the client that wrote the change and never on one
 * the writer already finished (`SHAPE_OPTION`):
 *
 * - **a shape effect deleted by hand** - core's Token HUD, the effect sheet, the
 *   sheet's own list, a macro - IS leaving the shape: the tokens go back,
 *   Ferocity goes with a Shapeshift form, the talents and the bond re-sync;
 * - one **switched off** on core's effect sheet is left the same way (the
 *   review): the Ferocity goes with it too, so the leave is one path whatever
 *   door took it. Free, as a hand delete is - core's HUD and effect sheet are the
 *   table's override (the lead: the Half-Action is the sheet's Leave);
 * - one **created or switched back on** by another door (the migration, a GM's
 *   own effect) dresses the tokens to match;
 * - **the repair pass** reconciles the viewed scene's tokens at `ready` and at
 *   every `canvasReady`, on the active GM's client.
 */
export function registerShapeHooks() {
  Hooks.on("preCreateToken", token => {
    try {
      onPreCreateToken(token);
    } catch (err) {
      console.error("azeroth-rpg | shape token", err);
    }
  });
  Hooks.on("deleteActiveEffect", (effect, options, userId) => {
    if (userId !== game.user.id || options?.[SHAPE_OPTION]) return;
    const actor = shapedActorOf(effect);
    if (!actor) return;
    settleAfterLeaving(actor, readShape(effect.getFlag("azeroth-rpg", SHAPE_FLAG)))
      .catch(err => console.error("azeroth-rpg | shape left", err));
  });
  const redress = (effect, options, userId) => {
    if (userId !== game.user.id || options?.[SHAPE_OPTION]) return;
    const actor = shapedActorOf(effect);
    if (!actor) return;
    syncShapeTokens(actor).then(() => afterShapeChange(actor))
      .catch(err => console.error("azeroth-rpg | shape tokens", err));
  };
  Hooks.on("createActiveEffect", redress);
  Hooks.on("updateActiveEffect", (effect, changes, options, userId) => {
    if (!("disabled" in (changes ?? {}))) return;
    if (changes.disabled === true) {
      if (userId !== game.user.id || options?.[SHAPE_OPTION]) return;
      const actor = shapedActorOf(effect);
      if (!actor) return;
      settleAfterLeaving(actor, readShape(effect.getFlag("azeroth-rpg", SHAPE_FLAG)))
        .catch(err => console.error("azeroth-rpg | shape switched off", err));
      return;
    }
    redress(effect, options, userId);
  });
  const repair = () => repairShapeTokens().catch(err => console.warn("azeroth-rpg | shape repair", err));
  Hooks.once("ready", repair);
  // Before `ready` the world is still loading and its migrations have not run;
  // the `ready` pass covers the first scene.
  Hooks.on("canvasReady", () => {
    if (game.ready) repair();
  });
}
