/**
 * **SHAPES** (02 §7; D-769): a Druid's Shapeshift form, the Avatar of the Wild,
 * and a Warlock's Metamorphosis. Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The lead's rulings (2026-10-03, verbatim):
 *
 * - Health in a shape: *"Druid's own Health"*.
 * - Other statistics: *"Physical half"* - Strength, Dexterity, Constitution,
 *   Defense, Armor Points, Speed, size and the attack rows come from the
 *   14-BESTIARY block; the character keeps Intelligence, Wisdom, Charisma,
 *   skills, Proficiency and talents.
 * - Worn gear: *"Melds; Signatures count"* - the beast's Armor Points, Defense
 *   and attacks replace the suit's and the weapon's, and the Signatures and
 *   affixes on what is worn still apply.
 * - Scope: *"Avatar of the Wild, Metamorphosis"* take the same treatment.
 * - The Avatar: *"Avatar form uses casters Mana and spells to cast. You can't
 *   use the form without the talent"* - *"No Avatar without it"*: 04's Heart of
 *   the Wild is required (`shapeRefusal`), and in the Avatar the Druid's own
 *   Mana and spells are spent. 02 and 04 do not say so yet (D-769, Phase 12).
 * - Leaving: *"Half-Action to leave"* (`leaveCost`).
 * - A Sustain held in a Shapeshift form: *"Upkeep unchanged"* - still paid in
 *   Mana, so the bar on Mana is on NEW spending alone.
 * - Carrying: *"Druid's own carry"* - bag slots read the character's own
 *   Strength and race size, never the form's.
 * - A block's own Ward is not on the physical half, and is not taken.
 *
 * **ONE ACTIVE EFFECT IS THE SHAPE.** It carries `flags.azeroth-rpg.shape =
 * {kind, forms: [snapshot], ward}` and overrides the three scores in the
 * `initial` phase (D-668: a stored base moves in `initial`, so every modifier
 * and every Test follows it). Everything else the half moves is DERIVED off
 * the snapshot by `CharacterData#prepareDerivedData`, because derived data
 * cannot await a pack read and the numbers therefore have to be on the effect.
 *
 * `documents/shapes.mjs` is the one writer and `AzerothActor#shape` the one
 * reader.
 */

import { DEFAULT_SIZE, isSize, rung, tokenSize } from "./size.mjs";

/** The flag the shape effect carries, under `azeroth-rpg`. */
export const SHAPE_FLAG = "shape";

/** The flag a token keeps its own appearance in while it wears a shape. */
export const RESTORE_FLAG = "shapeRestore";

/** The three scores a shape overrides: the physical half's abilities. */
export const SHAPE_ABILITIES = Object.freeze(["str", "dex", "con"]);

/** The three hit locations a block prints Armor Points for (06 §2). */
const LOCATIONS = Object.freeze(["body", "head", "limb"]);

/**
 * **THE THREE KINDS OF SHAPE, AND WHAT EACH ONE DOES** (02 §7; D-251, D-769).
 *
 * - `feature` and `choice`: the class feature that takes it and its menu.
 * - `ferocity`: Ferocity builds in it (02: *Ferocity builds only while you are
 *   in a Shapeshift form*). D-251 keeps the Avatar out of every Feral talent,
 *   and so out of Ferocity.
 * - `barsMana`: Mana cannot be spent in it, and is paid in Ferocity instead
 *   (02: *You are unable to spend Mana while in a Shapeshift form*; 07, *The
 *   Druid in a form*). The bar names a Shapeshift form, and the Avatar is not
 *   barred (the lead: *"Avatar form uses casters Mana and spells to cast"*). It
 *   bars NEW spending only: a Sustain's upkeep is still Mana (*"Upkeep
 *   unchanged"*), and `rules/turn-effects.mjs#upkeep` reads no shape at all.
 * - `requires`: the talent without which the shape cannot be taken at all
 *   (the lead, 2026-10-03: *"No Avatar without it"* - 04's Heart of the Wild).
 * - `endsAt`: what ends it beside the owner leaving it. The Avatar lasts
 *   *until your next Short Rest or Long Rest*, and reaching 0 Health in it ends
 *   it (the brief's reading of *you take an additional Critical Injury and start
 *   dying*); Metamorphosis lasts *until you dismiss it or your next Short Rest
 *   or Long Rest*. A Shapeshift form has no end of its own.
 * - `melds`: worn gear melds into it (the lead: *"Melds; Signatures count"*).
 */
export const SHAPE_KINDS = Object.freeze({
  shapeshift: Object.freeze({
    feature: "Shapeshift", choice: "forms",
    ferocity: true, barsMana: true, melds: true, requires: null,
    endsAt: Object.freeze([])
  }),
  avatar: Object.freeze({
    feature: "Avatar of the Wild", choice: "avatar",
    ferocity: false, barsMana: false, melds: true, requires: "Heart of the Wild",
    endsAt: Object.freeze(["short", "long", "zeroHealth"])
  }),
  metamorphosis: Object.freeze({
    feature: "Metamorphosis", choice: "greaterDemons",
    ferocity: false, barsMana: false, melds: true, requires: null,
    endsAt: Object.freeze(["short", "long"])
  })
});

/**
 * **WHY A SHAPE CANNOT BE TAKEN AT ALL**, asked before the chooser opens and
 * before anything is paid (D-768's order): a talent the kind `requires` and the
 * character has not taken. The Avatar of the Wild needs Heart of the Wild (the
 * lead, 2026-10-03: *"No Avatar without it"*). The same answer greys the
 * feature on the sheet, in words.
 *
 * @param {string|null} kind
 * @param {{ranks?: (talent: string) => number}} [o]  the character's rank in a talent, by name
 * @returns {{reason: "NeedsTalent", talent: string}|null}
 */
export function shapeRefusal(kind, { ranks = () => 0 } = {}) {
  const talent = SHAPE_KINDS[kind]?.requires ?? null;
  if (!talent) return null;
  return (Number(ranks(talent)) || 0) > 0 ? null : { reason: "NeedsTalent", talent };
}

/** 04's Predator's Swiftness: *Once per Short Rest, leaving a Shapeshift form costs no action.* */
export const SWIFT_LEAVE = "Predator's Swiftness";

/**
 * **WHAT LEAVING A SHAPE COSTS** (the lead, 2026-10-03: *"Half-Action to
 * leave"*), from the sheet's Leave and the Combat chip:
 *
 * - `free` out of a fight, where there is no turn to charge;
 * - `counter` for a SHAPESHIFT form where Predator's Swiftness has a use left -
 *   spent only where the Half-Action would have been, so a leave out of a fight
 *   never wastes it;
 * - `half` otherwise.
 *
 * A shift to another shape, a rest, 0 Health and a hand delete from core's own
 * HUD or effect sheet leave a shape without asking this (the lead: the table's
 * override costs nothing).
 *
 * **AND SAVAGE SHIFT'S ROUND** (D-779; the lead, 2026-10-03, on O-167: *"Yes"*
 * to *does Savage Shift reach the Half-Action for leaving a form?*): `savage`
 * where `freeShift` holds for this leave - the talent at rank 1, a Shapeshift
 * form, the druid's own turn in a fight and the round's free shift unspent -
 * answers `savage`, the one allowance a shift and a leave share. It is asked
 * BEFORE Predator's Swiftness, whose use is spent only where the Half-Action
 * would have been (READING, D-779: the round's allowance renews and the Short
 * Rest's does not).
 *
 * @param {{kind?: string|null, inFight?: boolean, swiftLeft?: number, savage?: boolean}} o
 * @returns {"free"|"savage"|"counter"|"half"}
 */
export function leaveCost({ kind = null, inFight = false, swiftLeft = 0, savage = false } = {}) {
  if (!inFight) return "free";
  if (kind === "shapeshift" && savage === true) return "savage";
  if (kind === "shapeshift" && (Number(swiftLeft) || 0) > 0) return "counter";
  return "half";
}

/**
 * **WHAT METAMORPHOSIS ADDS** (02 §7, the Warlock's level 17): *While in this
 * form, add 2 to your Damage Rating and gain Ward 3 (Fel or Shadow) ... Gain 1
 * Fel Corruption.* `shapes.test.mjs` reads every number off the chapter.
 */
export const METAMORPHOSIS = Object.freeze({
  damageRating: 2,
  ward: 3,
  wardSchools: Object.freeze(["fel", "shadow"]),
  corruption: Object.freeze({ track: "fel", points: 1 })
});

/**
 * **WHAT REACHING 0 HEALTH IN THE AVATAR COSTS** (02 §7, the Druid's level
 * 20): *you take an additional Critical Injury and start dying.*
 */
export const AVATAR = Object.freeze({ extraCriticalInjuries: 1 });

/**
 * Which kind of shape a class feature takes, by its name AND its menu: the
 * Ritual of Summoning shares Metamorphosis's `greaterDemons` menu and calls
 * demons rather than becoming one. Null for every other feature.
 *
 * @param {{name?: string, choice?: string|null}} feature
 * @returns {"shapeshift"|"avatar"|"metamorphosis"|null}
 */
export function shapeKindOf({ name = "", choice = null } = {}) {
  for (const [kind, k] of Object.entries(SHAPE_KINDS)) {
    if (k.feature === name && k.choice === choice) return kind;
  }
  return null;
}

/**
 * **07's FEROCITY FOR MANA**: *While in a Shapeshift form, a Druid may pay
 * Ferocity in place of Mana, at 1 Ferocity for every 2 Mana, rounded up.*
 *
 * @param {number} mana
 * @returns {number}
 */
export function ferocityFor(mana) {
  return Math.ceil(Math.max(0, Number(mana) || 0) / 2);
}

/**
 * Whether a shift keeps the Ferocity held (04's Savage Shift: *At rank 2 you
 * keep your Ferocity when changing from one Shapeshift form to another*).
 * Otherwise it starts from 0 (02: *from 0 each time you shift*), and leaving a
 * Shapeshift form for anything else - the Avatar included - loses all of it.
 *
 * @param {{from?: string|null, to?: string|null, savageShift?: number}} o
 * @returns {boolean}
 */
export function keepsFerocity({ from = null, to = null, savageShift = 0 } = {}) {
  return from === "shapeshift" && to === "shapeshift" && (Number(savageShift) || 0) >= 2;
}

/** 04's Savage Shift: *Once a round, your Shapeshift class feature costs no action* (D-771). */
export const SAVAGE_SHIFT = "Savage Shift";

/** The round's record key Savage Shift's free shift is marked under (D-771). */
export const FREE_SHIFT_MARK = "savage-shift";

/**
 * **WHETHER THIS SHIFT COSTS NO ACTION** (04's Savage Shift at rank 1: *Once a
 * round, your Shapeshift class feature costs no action*; D-771): the Shapeshift
 * feature's own Use, the talent taken, in a fight, on the character's own turn
 * (MY READING, for the lead: a Half-Action is a turn's, so an action that costs
 * nothing is still taken in one), and the round's record not yet holding the
 * free shift. Out of a fight there is no budget to spare and the round is not
 * marked. **Leaving** a Shapeshift form takes the same allowance (D-779; the
 * lead, 2026-10-03, on O-167: *"Yes"*): `leaveCost`'s `savage`, asked through
 * this with the shape's own kind.
 *
 * @param {{kind?: string|null, savageShift?: number, inFight?: boolean, onTurn?: boolean, used?: string[]}} o
 *   `kind` the shape kind the feature takes (`shapeKindOf`), `used` the round's
 *   once-a-round marks
 * @returns {boolean}
 */
export function freeShift({ kind = null, savageShift = 0, inFight = false, onTurn = false, used = [] } = {}) {
  if (kind !== "shapeshift") return false;
  if (!((Number(savageShift) || 0) >= 1)) return false;
  if (!inFight || !onTurn) return false;
  return !(used ?? []).includes(FREE_SHIFT_MARK);
}

/**
 * Whether an event ends a shape: a Short Rest, a Long Rest, or 0 Health.
 * **Demonic Ascendance** (04): *Your Metamorphosis class feature ... does not
 * end at a Short Rest.*
 *
 * @param {string|null} kind
 * @param {"short"|"long"|"zeroHealth"} event
 * @param {{demonicAscendance?: number}} [o]  the talent's rank
 * @returns {boolean}
 */
export function shapeEnds(kind, event, { demonicAscendance = 0 } = {}) {
  const k = SHAPE_KINDS[kind];
  if (!k || !k.endsAt.includes(event)) return false;
  if (kind === "metamorphosis" && event === "short" && (Number(demonicAscendance) || 0) > 0) return false;
  return true;
}

/** Whether worn gear melds into this kind of shape. */
export function meldsGear(kind) {
  return SHAPE_KINDS[kind]?.melds === true;
}

/** A finite number, or null. */
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * **THE BLOCK'S PHYSICAL HALF, TAKEN AT THE SHIFT** (D-769): what the effect
 * stores, so derived data never has to await a pack read. A 14-BESTIARY entry's
 * source (`doc.toObject()`) in, plain JSON out.
 *
 * The token art is the entry's own token (`prototypeToken.texture.src`, else
 * `img`), and the portrait its plate (`system.art`) - the two images 14's pack
 * keeps apart (D-707's note on `portraits/` and `tokens/`).
 *
 * @param {object} source  an actor's source data
 * @param {{uuid?: string|null}} [o]  the entry's uuid, which a source lacks
 * @returns {object}
 */
export function snapshotOf(source = {}, { uuid = null } = {}) {
  const s = source?.system ?? {};
  const attacks = Array.isArray(s.attacks) ? s.attacks : [];
  return {
    uuid: uuid ?? source?.uuid ?? null,
    name: String(source?.name ?? ""),
    abilities: Object.fromEntries(SHAPE_ABILITIES.map(k => [k, num(s.abilities?.[k]?.value)])),
    defense: num(s.defense),
    ap: Object.fromEntries(LOCATIONS.map(l => [l, num(s.ap?.[l])])),
    speed: num(s.speed),
    flies: s.flies === true,
    size: isSize(s.size) ? String(s.size).toLowerCase() : DEFAULT_SIZE,
    attacks: attacks.filter(a => a?.name).map(a => ({
      name: String(a.name),
      bonus: num(a.bonus),
      damage: num(a.damage),
      traits: (Array.isArray(a.traits) ? a.traits : []).map(String),
      range: num(a.range)
    })),
    token: source?.prototypeToken?.texture?.src || source?.img || null,
    portrait: s.art || source?.img || null
  };
}

/** The larger of some numbers, ignoring the absent ones; null where none is there. */
function better(values) {
  const n = values.filter(v => Number.isFinite(v));
  return n.length ? Math.max(...n) : null;
}

/**
 * **WHAT THE SHAPE GIVES THE CHARACTER**: one form's physical half, or 04's
 * Chimera's - *Use the better of the two stat blocks for any Test, and make
 * attacks from either* - read as the better value of every statistic, the
 * larger size, a flight either of them has, and both sets of attack rows (the
 * plan's reading, flagged for the lead). Each row says which form it is.
 *
 * @param {object[]} forms  snapshots
 * @returns {{names: string[], abilities: Record<string, number|null>, defense: number|null,
 *   ap: Record<string, number|null>, speed: number|null, flies: boolean, size: string,
 *   attacks: object[]}|null}
 */
export function physicalHalf(forms = []) {
  const list = (Array.isArray(forms) ? forms : []).filter(f => f && typeof f === "object");
  if (!list.length) return null;
  const pick = read => better(list.map(read));
  const size = list.map(f => f.size).filter(isSize).sort((a, b) => rung(b) - rung(a))[0] ?? DEFAULT_SIZE;
  return {
    names: list.map(f => String(f.name ?? "")),
    abilities: Object.fromEntries(SHAPE_ABILITIES.map(k => [k, pick(f => f.abilities?.[k])])),
    defense: pick(f => f.defense),
    ap: Object.fromEntries(LOCATIONS.map(l => [l, pick(f => f.ap?.[l])])),
    speed: pick(f => f.speed),
    flies: list.some(f => f.flies === true),
    size,
    attacks: list.flatMap((f, formIndex) => (f.attacks ?? []).map(a => ({ ...a, traits: [...(a.traits ?? [])], form: String(f.name ?? ""), formIndex })))
  };
}

/**
 * The effect's changes: the three scores overridden in the `initial` phase,
 * so the modifier, every Test and the derived numbers built from them follow
 * (D-668, `rules/consumables.mjs#phaseFor`). A score the block prints as `—` is
 * left to the character.
 *
 * @param {ReturnType<typeof physicalHalf>} physical
 * @returns {Array<{key: string, type: string, value: string, phase: string}>}
 */
export function shapeChanges(physical) {
  if (!physical) return [];
  return SHAPE_ABILITIES
    .filter(k => Number.isFinite(physical.abilities?.[k]))
    .map(k => ({ key: `system.abilities.${k}.value`, type: "override", value: String(physical.abilities[k]), phase: "initial" }));
}

/**
 * **WHAT THE TOKEN WEARS**: the footprint of the shape's size by the map's
 * convention (`rules/size.mjs#tokenSize`, D-637) and the FIRST form's token
 * art. Chimera takes the larger footprint and its first form's image (the
 * plan's reading).
 *
 * @param {object[]} forms  snapshots
 * @returns {{width: number, height: number, src: string|null}|null}
 */
export function appearanceFor(forms = []) {
  const physical = physicalHalf(forms);
  if (!physical) return null;
  const squares = tokenSize(physical.size);
  const first = (Array.isArray(forms) ? forms : []).find(f => f && typeof f === "object") ?? null;
  return { width: squares, height: squares, src: first?.token ?? null };
}

/**
 * A token's top-left after a resize that holds its centre, on a square grid of
 * `gridSize` pixels: core's own `TokenDocument#resize` arithmetic, for a token
 * that does not exist yet (`preCreateToken`).
 *
 * @param {{x: number, y: number, width: number, height: number}} from
 * @param {{width: number, height: number}} to
 * @param {number} gridSize
 * @returns {{x: number, y: number}}
 */
export function centredResize(from = {}, to = {}, gridSize = 100) {
  const size = Number(gridSize) || 0;
  const dw = (Number(from.width) || 1) - (Number(to.width) || 1);
  const dh = (Number(from.height) || 1) - (Number(to.height) || 1);
  return {
    x: Math.round((Number(from.x) || 0) + (dw * size) / 2),
    y: Math.round((Number(from.y) || 0) + (dh * size) / 2)
  };
}

/**
 * **A BLOCK'S ATTACK ROW, SHAPED AS THE WEAPON `attackWithDialog` SWINGS**
 * (D-769). The bonus is the door's own - the form's Strength modifier and the
 * character's Proficiency - and the printed DMG is the Rating. It is held and
 * melee by nature, so 06 §6's Parry reads it as a melee weapon in hand (the
 * plan's reading). `natural` is what tells every door it is no Item: there is
 * no id, no flag and no coating on it.
 *
 * @param {{name: string, damage?: number|null, traits?: string[], range?: number|null}} row
 * @param {{index?: number, form?: string|null}} [o]
 * @returns {object}
 */
export function naturalWeapon(row = {}, { index = 0, form = null } = {}) {
  return {
    id: null,
    type: "weapon",
    name: String(row?.name ?? ""),
    img: null,
    natural: { index: Math.max(0, Math.trunc(Number(index)) || 0), form: form ?? row?.form ?? null, row: { ...row, traits: [...(row?.traits ?? [])] } },
    system: {
      rating: num(row?.damage),
      traits: [...(row?.traits ?? [])].map(String),
      range: num(row?.range),
      launcher: null,
      isLauncher: false,
      isShot: false,
      equipped: true,
      offHand: false
    }
  };
}

/**
 * A shape's flag, read leniently: a kind the system knows and at least one
 * form that is an object, or null. `ward` is Metamorphosis's school and value.
 *
 * @param {object|null} flag
 * @returns {{kind: string, forms: object[], ward: {school: string, value: number}|null}|null}
 */
export function readShape(flag) {
  if (!flag || typeof flag !== "object") return null;
  if (!SHAPE_KINDS[flag.kind]) return null;
  const forms = (Array.isArray(flag.forms) ? flag.forms : []).filter(f => f && typeof f === "object" && f.name);
  if (!forms.length) return null;
  const ward = flag.ward && typeof flag.ward === "object" && flag.ward.school
    ? { school: String(flag.ward.school), value: Math.max(0, Math.trunc(Number(flag.ward.value)) || 0) }
    : null;
  return { kind: flag.kind, forms, ward };
}

/**
 * **WHAT A SHAPE ADDS TO AN ATTACK'S DAMAGE RATING** (02 §7): Metamorphosis's
 * 2, and nothing for any other shape.
 *
 * @param {{kind?: string}|null} shape
 * @returns {number}
 */
export function shapeDamageBonus(shape) {
  return shape?.kind === "metamorphosis" ? METAMORPHOSIS.damageRating : 0;
}

/**
 * **HOW MANY OF THESE FORMS ONE SHIFT MAY LEARN** (02 §7's Forms table, D-619):
 * *a form taken is a form learned*, and no more forms are known than the table
 * allows. Chimera takes two forms in one shift (04), so a pick of two may learn
 * one form, both, or neither - never more than the room left. Null where the
 * picks fit; the room otherwise.
 *
 * @param {Array<{learn?: boolean}>} picks
 * @param {{known?: number, allowed?: number}} o
 * @returns {{room: number}|null}
 */
export function formPicksRefusal(picks = [], { known = 0, allowed = 0 } = {}) {
  const learning = (Array.isArray(picks) ? picks : []).filter(p => p?.learn === true).length;
  const room = Math.max(0, (Number(allowed) || 0) - (Number(known) || 0));
  return learning > room ? { room } : null;
}
