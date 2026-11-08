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

import {
  FORCED_SPEED, RESTORE_FLAG, SHAPE_FLAG, SHAPE_KINDS, SWIFT_LEAVE, appearanceFor, centredResize, endsOnDamage, forcedKindForCard,
  forcedShapeChanges, forcedShapeRefusal, isForcedKind, keepsFerocity, physicalHalf, readShape, shapeChanges, shapeEnds,
  shapeEntryOf, shapeMayReplace, snapshotOf
} from "../rules/shapes.mjs";
// A forced shape is written on a GM's client, judged before anything is spent (D-808).
import { gmAbsentFor } from "../rules/gm-writes.mjs";

/**
 * **THE QUERY A FORCED SHAPE IS LAID THROUGH** (D-808): the bestiary pack is the
 * GM's (`system.json`: `PLAYER: NONE`), so a player who fails a Test against Hex or
 * Polymorph on their own creature has the form read and written on the active GM's
 * client. Never `game.socket` (D-643).
 */
export const FORCED_SHAPE_QUERY = "azeroth-rpg.forcedShape";

/** What each forced kind's end is, in words: Hex's Sustain and damage, Polymorph's damage. */
export const FORCED_ENDS = Object.freeze({
  hexed: "AZEROTH.ForcedShape.Ends.Hexed",
  polymorphed: "AZEROTH.ForcedShape.Ends.Polymorphed"
});

/** The operation option the writer puts on its own effect writes, so the hooks below leave them alone. */
export const SHAPE_OPTION = "azerothShape";

/** The fallback image for a shape whose block carries no token art. */
const SHAPE_FALLBACK_ICON = "icons/svg/pawprint.svg";

/** Whether an Active Effect is a shape. */
export function isShapeEffect(effect) {
  return Boolean(effect?.getFlag?.("azeroth-rpg", SHAPE_FLAG));
}

/** Whether an Active Effect is a shape somebody else laid (07's Hex, 02's Polymorph; D-808). */
export function isForcedShapeEffect(effect) {
  return isForcedKind(effect?.getFlag?.("azeroth-rpg", SHAPE_FLAG)?.kind);
}

/**
 * **WHY A DOOR IS SHUT BY THE SHAPE WORN, IN WORDS** (D-808): the one reading every
 * door asks - the attack, the cast, a Use, an ability, a Signature, a Reaction, a
 * Readied action and the Leave - through `rules/shapes.mjs#forcedShapeRefusal`.
 * Null where the door is open.
 *
 * @param {Actor|null} actor
 * @param {string} door  a `FORCED_REFUSALS` key
 * @returns {string|null}
 */
export function forcedRefusalFor(actor, door) {
  const shape = actor?.shape ?? null;
  const key = forcedShapeRefusal(shape, door, { gm: game.user?.isGM === true });
  if (!key) return null;
  return game.i18n.format(key, {
    name: actor?.name ?? "", form: shapeLabel(shape),
    ends: game.i18n.localize(FORCED_ENDS[shape.kind] ?? "")
  });
}

/**
 * The refusal said and answered: true where the door is shut and the user was told
 * why, before anything was spent.
 *
 * @param {Actor|null} actor
 * @param {string} door
 * @returns {boolean}
 */
export function refuseForcedShape(actor, door) {
  const why = forcedRefusalFor(actor, door);
  if (why) ui.notifications?.warn(why);
  return Boolean(why);
}

/**
 * **A FORCED SHAPE'S LIFETIME, ON ITS EFFECT** (D-808), in the keys every laid spell
 * effect already carries (D-657, D-724): the spell, the card's cast key and the card,
 * whether it is Sustained - `effects/sustained-spells.mjs` deletes a `sustained`
 * effect whose caster (the effect's `origin`) no longer holds the cast or has fallen,
 * which is what makes a dropped Hex, a fallen shaman and a Sustain over the limit end
 * the frog with no code path of their own. EVERY KEY, EVERY TIME: a forced shape is
 * rewritten in place over the one before, and a key left out would survive it.
 *
 * @param {string} kind
 * @param {{spellUuid?: string|null, spellName?: string|null, cast?: string|null, sustained?: boolean, messageId?: string|null}|null} laid
 */
function forcedLifetime(kind, laid = null) {
  const k = SHAPE_KINDS[kind];
  const cast = typeof laid?.cast === "string" && laid.cast ? laid.cast : null;
  return {
    spell: laid?.spellUuid ?? null,
    spellName: laid?.spellName || k.by,
    identifier: k.identifier,
    cast,
    sustained: k.sustained === true && laid?.sustained === true && Boolean(cast),
    messageId: laid?.messageId ?? null
  };
}

/**
 * Whether a creature flies of its OWN (D-808's reading 5): a creature's block says so
 * (`system.flies`), a character's GM-stored pace does. Never the pace a shape or an
 * effect gives it now - a rabbit's grounding rewritten into a frog would otherwise read
 * the 0 it set and give the frog its wings back.
 *
 * @param {Actor} actor
 * @returns {boolean}
 */
function fliesOfItsOwn(actor) {
  if (actor?.type === "npc") return actor.system?.flies === true;
  return (Number(actor?._source?.system?.flyingSpeed) || 0) > 0;
}

/** A forced shape's text: what the creature keeps, what it cannot do, and what ends it. */
function forcedText(kind, label) {
  return game.i18n.format("AZEROTH.ForcedShape.Text", {
    form: label, by: SHAPE_KINDS[kind].by, speed: FORCED_SPEED, ends: game.i18n.localize(FORCED_ENDS[kind] ?? "")
  });
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
 * **A FORCED SHAPE** (D-808) carries no score override and nothing the block's half
 * gives: the form's Speed alone (`rules/shapes.mjs#forcedShapeChanges`), its name and
 * art, the text of what it shuts, and its lifetime (`forcedLifetime`). Its `origin` is
 * whoever laid it.
 *
 * @param {Actor} actor
 * @param {{kind: string, forms: object[], ward?: object|null, laid?: object|null}} shape
 */
export function shapeEffectData(actor, { kind, forms, ward = null, laid = null }) {
  const physical = physicalHalf(forms);
  const label = shapeLabel({ kind, forms });
  const forced = isForcedKind(kind);
  return {
    name: label,
    img: forms[0]?.token || SHAPE_FALLBACK_ICON,
    origin: forced ? (laid?.caster || actor.uuid) : actor.uuid,
    // **WITHOUT THIS CORE NEVER DRAWS IT** (14.367 `Token#_drawEffects`): an
    // effect is drawn at ALWAYS, or at CONDITIONAL only while temporary, and a
    // shape has no duration. The icon on the token is the effect kept.
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    disabled: false,
    description: `<p>${foundry.utils.escapeHTML(forced ? forcedText(kind, label) : game.i18n.format("AZEROTH.Shape.EffectText", { name: label }))}</p>`,
    system: {
      changes: forced
        ? forcedShapeChanges(kind, { flies: fliesOfItsOwn(actor) })
        : shapeChanges(physical)
    },
    // EVERY KEY, EVERY TIME: an update merges a flag object key by key, so a
    // `ward` left out would survive from the shape before.
    flags: { "azeroth-rpg": { [SHAPE_FLAG]: { kind, forms, ward: ward ?? null }, ...(forced ? forcedLifetime(kind, laid) : {}) } }
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
 * @param {object|null} [o.laid]  a FORCED shape's caster and lifetime (D-808):
 *   `{caster, spellUuid, spellName, cast, sustained, messageId}`
 * @returns {Promise<ActiveEffect|null>}
 */
export async function takeShape(actor, { kind, entries = [], forms = null, ward = null, laid = null } = {}) {
  if (!actor || !SHAPE_KINDS[kind]) return null;
  // A creature of any kind may be hexed (D-808); only a character takes a shape of
  // its own.
  if (actor.type !== "character" && !isForcedKind(kind)) return null;
  const snapshots = forms ?? await formsFrom(entries);
  if (!snapshots.length) return null;
  const before = actor.shape;
  // **THE SECOND-SHAPE RULE** (D-808, `rules/shapes.mjs#shapeMayReplace`): a forced
  // shape replaces whatever stands; a shape of the creature's own never replaces one
  // laid on it.
  if (before && !shapeMayReplace(before.kind, kind)) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.ForcedShape.Holds", { name: actor.name, form: shapeLabel(before) }));
    return null;
  }
  const data = shapeEffectData(actor, { kind, forms: snapshots, ward, laid });
  data.flags["azeroth-rpg"].equipmentShapeEntry = !before && kind === "shapeshift"
    && [...(actor.items??[])].some(i=>i.system?.equipped&&i.system.identifier==="wolfshead-helm")
    ? {id:foundry.utils.randomID(32),at:game.time.worldTime} : null;
  const expectedShape = JSON.stringify(data.flags["azeroth-rpg"][SHAPE_FLAG]);
  const held = shapeEffectsOf(actor);
  // What a forced shape rewritten in place was living on: a Hex replaced by a rabbit,
  // or by a second Hex, ends the Sustain that held the first (`endLaidSustain`).
  const replaced = held.length && isForcedShapeEffect(held[0])
    ? { caster: held[0].origin ?? null, cast: held[0].getFlag("azeroth-rpg", "cast") ?? null, sustained: held[0].getFlag("azeroth-rpg", "sustained") === true }
    : null;
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
    if (!effect || actor.effects.get(effect.id) !== effect
      || JSON.stringify(effect.getFlag("azeroth-rpg", SHAPE_FLAG)) !== expectedShape) {
      throw new Error("The requested shape was not confirmed on the actor");
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
  if(effect?.getFlag("azeroth-rpg","equipmentShapeEntry")) {
    const {wolfsheadAfterShape}=await import("../effects/special-equipment.mjs");
    await wolfsheadAfterShape(actor,{before,kind,effect});
  }
  if (effect && replaced?.sustained && replaced.cast && replaced.cast !== (effect.getFlag("azeroth-rpg", "cast") ?? null)) {
    await endLaidSustain(replaced).catch(err => console.warn("azeroth-rpg | the replaced shape's Sustain did not end", err));
  }
  return effect ?? null;
}

/**
 * **THE SUSTAIN A FORCED SHAPE LIVED ON, ENDED WITH IT** (D-808): a Hex the frog it
 * laid has gone from - damage, a GM's hand, a Dispel, a second shape - is over, and
 * the shaman stops paying for it. Through `workflows.endSustain`, the Stop's own door,
 * by the CAST (two Sustains of one spell are two casts, D-760), and only while the
 * caster still holds it: the sweep's own deletions find nothing held and end nothing.
 *
 * @param {{caster?: string|null, cast?: string|null}} o
 * @returns {Promise<object|null>}  the Sustain entry ended
 */
export async function endLaidSustain({ caster = null, cast = null } = {}) {
  if (!caster || !cast) return null;
  let actor = null;
  try {
    actor = fromUuidSync(caster);
  } catch {
    actor = null;
  }
  if (!actor || !(actor.getFlag?.("azeroth-rpg", "sustaining") ?? []).some(s => s?.cast === cast)) return null;
  return game.system.azeroth.workflows.endSustain({ actor, cast, notice: "AZEROTH.ForcedShape.SustainEnded" });
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
 * **ANY DAMAGE ENDS IT** (07's Hex; 02's Polymorph: *until it takes damage*; D-808):
 * asked by the one damage writer, `AzerothActor#adjustHealth`, with what the blow took
 * of Health and temporary Health once every door before the write had it
 * (`rules/shapes.mjs#endsOnDamage`). Here, on the client that wrote the Health, which
 * owns the creature and its tokens. The Sustain a Hex lived on ends on the active GM's
 * client (`registerShapeHooks`), because the shaman is seldom this client's.
 *
 * @param {Actor} actor
 * @param {number} taken
 * @returns {Promise<object|null>}  the shape that ended, or null
 */
export async function endShapeOnDamage(actor, taken) {
  const shape = actor?.shape ?? null;
  if (!endsOnDamage(shape, taken)) return null;
  const label = shapeLabel(shape);
  await leaveShape(actor);
  ui.notifications?.info(game.i18n.format("AZEROTH.ForcedShape.EndedByDamage", { name: actor.name, form: label }));
  return shape;
}

/**
 * The bestiary pack's entry for a forced kind's form (14 §15's Frog or Rabbit), by
 * name, as a uuid - or null where the pack holds none.
 *
 * @param {string} kind
 * @returns {Promise<string|null>}
 */
async function forcedFormUuid(kind) {
  const name = shapeEntryOf(kind);
  const pack = game.packs?.get("azeroth-rpg.bestiary") ?? null;
  if (!name || !pack) return null;
  const index = await pack.getIndex();
  const row = [...index].find(e => e.name === name) ?? null;
  return row ? (row.uuid ?? `Compendium.azeroth-rpg.bestiary.Actor.${row._id}`) : null;
}

/**
 * **WHETHER THIS CLIENT CAN HAVE A FORCED SHAPE WRITTEN** (D-808), judged BEFORE the
 * Test is rolled (D-768's order, `rules/gm-writes.mjs#gmAbsentFor`): a GM writes it
 * here, anybody else through the active GM, and with no GM online nobody can - so the
 * Resist is refused in words with nothing rolled, where a roll would record a failure
 * that laid nothing.
 *
 * @returns {boolean}
 */
export function forcedShapeUnwritable() {
  return gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });
}

/**
 * **LAY A FORCED SHAPE** (D-808): the form's block read off the bestiary pack, its
 * snapshot taken, and the shape written through the one writer with the lifetime the
 * CARD recorded - its caster, cast key and whether the cast is Sustained. On a GM's
 * client: the pack is the GM's.
 *
 * - A Sustained cast the caster no longer holds lays nothing: the Hex was dropped
 *   between the cast and the Test (`AZEROTH.ForcedShape.SustainGone`).
 * - The card says what happened in words: a line in chat, from the creature.
 *
 * @param {{target: Actor, kind: string, card?: ChatMessage|null}} o
 * @returns {Promise<{laid: boolean, reason: string|null}>}
 */
export async function layForcedShape({ target = null, kind = null, card = null } = {}) {
  if (!target || !isForcedKind(kind)) return { laid: false, reason: "refused" };
  const k = SHAPE_KINDS[kind];
  const f = card?.flags?.["azeroth-rpg"] ?? {};
  // WHO HOLDS THE CAST (D-724's record): the card's caster, else its speaker - a
  // feature card records no caster.
  const caster = f.caster ?? (card ? (ChatMessage.getSpeakerActor(card.speaker)?.uuid ?? null) : null);
  const laid = {
    caster,
    spellUuid: f.kind === "spell" ? (f.spellUuid ?? null) : null,
    spellName: f.spellName ?? k.by,
    cast: f.cast ?? null,
    sustained: k.sustained === true && f.sustained === true,
    messageId: card?.id ?? null
  };
  if (laid.sustained) {
    let caster = null;
    try {
      caster = laid.caster ? fromUuidSync(laid.caster) : null;
    } catch {
      caster = null;
    }
    if (!caster || !(caster.getFlag?.("azeroth-rpg", "sustaining") ?? []).some(s => s?.cast === laid.cast)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.ForcedShape.SustainGone", { name: target.name, spell: k.by }));
      return { laid: false, reason: "sustainGone" };
    }
  }
  const uuid = await forcedFormUuid(kind);
  const forms = uuid ? await formsFrom([uuid]) : [];
  if (!forms.length) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Shape.NoBlock", { name: k.by, form: shapeEntryOf(kind) ?? "" }));
    return { laid: false, reason: "noBlock" };
  }
  const effect = await takeShape(target, { kind, forms, laid });
  if (!effect) return { laid: false, reason: "notWritten" };
  const label = shapeLabel({ kind, forms });
  try {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: target }),
      content: `<p class="azeroth-drain">${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.ForcedShape.Card", {
        name: target.name, form: label, by: k.by, speed: FORCED_SPEED, ends: game.i18n.localize(FORCED_ENDS[kind] ?? "")
      }))}</p>`,
      flags: { "azeroth-rpg": { kind: "forcedShape", forcedShape: { kind, form: forms[0]?.name ?? "", by: k.by, messageId: card?.id ?? null } } }
    });
  } catch (err) {
    // The card failing leaves the shape laid, said in the console (CLAUDE.md §16).
    console.warn("azeroth-rpg | the forced shape's card", err);
  }
  return { laid: true, reason: null };
}

/**
 * **A FAILED TEST LAYS THE FORM, THROUGH THE ONE DOOR** (D-808): called by the card's
 * own Resist (`dice/chat.mjs#rollResists`) for a creature that failed its Test against
 * Hex or Polymorph. A GM writes it here; anybody else asks the active GM, who judges
 * the asker, the card and the Test again before writing.
 *
 * @param {{target: Actor, kind: string, message: ChatMessage, result: ChatMessage}} o
 * @returns {Promise<{laid: boolean, reason: string|null}>}
 */
export async function forcedShapeFromTest({ target, kind, message, result } = {}) {
  if (game.user?.isGM) return layForcedShape({ target, kind, card: message });
  const gm = game.users?.activeGM ?? null;
  if (!gm) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.ForcedShape.NoGM", { name: target?.name ?? "", by: SHAPE_KINDS[kind]?.by ?? "" }));
    return { laid: false, reason: "noGM" };
  }
  try {
    const done = await gm.query(FORCED_SHAPE_QUERY, {
      targetUuid: target.uuid, kind, messageId: message?.id ?? null, resultId: result?.id ?? null
    }, { timeout: 15000 });
    return done && typeof done === "object" ? { laid: done.laid === true, reason: done.reason ?? null } : { laid: false, reason: "error" };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { laid: false, reason: "error" };
  }
}

/** A chat message by id, waited for a moment: the asker's own Test may still be on its way here. */
async function messageSoon(id) {
  for (let i = 0; i < 20 && id; i++) {
    const found = game.messages?.get(id) ?? null;
    if (found) return found;
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}

/**
 * **THE GM'S SIDE OF `FORCED_SHAPE_QUERY`** (D-808), every fact judged again here:
 * the creature is the asker's, the card lays this kind, and the Test the asker made
 * is a FAILED Resilience Test answering that card, made by the asker.
 *
 * @param {{targetUuid?: string, kind?: string, messageId?: string, resultId?: string}} data
 * @param {{user?: User|null}} [o]
 * @returns {Promise<{laid: boolean, reason: string|null}>}
 */
export async function forcedShapeQueryHandler({ targetUuid = null, kind = null, messageId = null, resultId = null } = {}, { user = null } = {}) {
  const target = targetUuid ? await fromUuid(targetUuid) : null;
  if (!target || target.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !target.testUserPermission(user, "OWNER")) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: target.name }));
  }
  const card = messageId ? game.messages?.get(messageId) ?? null : null;
  if (!card || !isForcedKind(kind) || forcedKindForCard(card.flags?.["azeroth-rpg"]) !== kind) {
    throw new Error(game.i18n.localize("AZEROTH.ForcedShape.Refused"));
  }
  const result = await messageSoon(resultId);
  const f = result?.flags?.["azeroth-rpg"] ?? {};
  const failed = result?.rolls?.[0]?.outcome?.success === false;
  if (!result || f.resistOf?.messageId !== card.id || !failed || (user && result.author?.id !== user.id)) {
    throw new Error(game.i18n.localize("AZEROTH.ForcedShape.Refused"));
  }
  return layForcedShape({ target, kind, card });
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
    if (!actor) continue;
    // A creature of any kind may wear a forced shape (D-808): one is reconciled
    // where it wears a shape or its token still keeps an original.
    if (actor.type !== "character" && !actor.shape && !token.getFlag?.("azeroth-rpg", RESTORE_FLAG)) continue;
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
  // Any creature, since a forced shape is laid on one of any kind (D-808): a token
  // with neither a shape to wear nor an original to go back to is left below.
  if (!actor) return;
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
  // **A HEX THAT ENDS ENDS ITS SUSTAIN** (D-808): the frog gone by ANY door - damage,
  // a GM's hand, a Dispel, the writer's own leave - and the shaman stops paying for
  // it. On the active GM's client alone, whoever deleted it, because the caster is
  // seldom the deleter's to write; `endLaidSustain` ends nothing the caster no longer
  // holds, which is every deletion the Sustain's own sweep made.
  Hooks.on("deleteActiveEffect", effect => {
    if (game.users?.activeGM?.isSelf !== true || !isForcedShapeEffect(effect)) return;
    if (effect.getFlag("azeroth-rpg", "sustained") !== true) return;
    // A failure is said in words and warned of, never logged as a console error
    // (CLAUDE.md §16): the frog is gone either way, and the Stop still ends the Sustain.
    endLaidSustain({ caster: effect.origin ?? null, cast: effect.getFlag("azeroth-rpg", "cast") ?? null })
      .catch(err => {
        console.warn("azeroth-rpg | the Sustain of a forced shape did not end", err);
        ui.notifications?.warn(game.i18n.localize("AZEROTH.ForcedShape.SustainNotEnded"));
      });
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
