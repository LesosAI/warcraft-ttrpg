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
  }),
  // **04's GNOMISH BATTLE RIG** (the Tinker's capstone; the Legacy branches' B2):
  // *You take its form in 14-BESTIARY until your next Short Rest or Long Rest, or
  // until you leave it as a Half-Action. You use its Strength, Dexterity,
  // Constitution, Defense, Armor Points, Speed, size and attacks, and your armor and
  // weapons meld into it. You keep your own Health, Energy, Combo Points, Spell DC,
  // gadgets and talents ... While you wear it, your constructs add your tier to their
  // damage. If you are reduced to 0 Health in it, you leave it.* The physical half
  // and the melding are the other shapes' own (D-769), so nothing new reads it but
  // `entry` - ONE block, picked by no menu (`choice: null`) - and `boundDamage`,
  // the constructs' tier (`rules/bound.mjs#boundEffects`). The block's Ejector Seat
  // (*its pilot is thrown to a space within 20 feet and lands Prone*) is the rig's
  // Health reaching 0, and the pilot keeps their own Health (the talent's words), so
  // the leave at 0 Health is the rule and the throw is the table's (MY READING).
  battlerig: Object.freeze({
    feature: "Gnomish Battle Rig", choice: null,
    ferocity: false, barsMana: false, melds: true, requires: null,
    endsAt: Object.freeze(["short", "long", "zeroHealth"]),
    entry: "Gnomish Battle Rig",
    boundDamage: "tier"
  }),
  // **A SHAPE LAID ON A CREATURE BY SOMEBODY ELSE** (D-808; the lead, 2026-11-06):
  // 07's Hex - *A creature that fails a Spirit Resilience Test against your Spell DC
  // becomes a frog: it cannot attack, cast or speak, its Speed is 10 feet, and it
  // keeps its own Health and Defense. Any damage ends the Hex* - and 02's Polymorph,
  // *becomes a rabbit until it takes damage*. `forced`: the shape is the form's SIZE,
  // ART AND NAME and the spell's limits, nothing else - no score overridden, nothing
  // melded, the creature's own Health, Defense and Armor Points kept (the lead:
  // "visual-plus-limits only"; Armor Points are MY READING of *keeps its own*), and
  // the Speed held to `FORCED_SPEED`. `entry` is 14 §15's block, `by` the spell or
  // feature that lays it, `identifier` its card's key (`forcedKindForCard`),
  // `sustained` whether it lives exactly as long as the caster's Sustain (07: Hex is
  // Sustained), and `endsOnDamage` *Any damage ends the Hex*. **Polymorph takes Hex's
  // limits** (the lead: *"Polymorph gets the same limits"*): 02 states none, so that
  // half is THE TOOL'S READING (D2 §7), and it ends on damage alone, as 02 says.
  hexed: Object.freeze({
    feature: null, choice: null, forced: true,
    by: "Hex", identifier: "hex", source: "spell",
    ferocity: false, barsMana: false, melds: false, requires: null,
    endsAt: Object.freeze([]), endsOnDamage: true, sustained: true,
    entry: "Frog"
  }),
  polymorphed: Object.freeze({
    feature: null, choice: null, forced: true,
    by: "Polymorph", identifier: "polymorph", source: "feature",
    ferocity: false, barsMana: false, melds: false, requires: null,
    endsAt: Object.freeze([]), endsOnDamage: true, sustained: false,
    entry: "Rabbit"
  }),
  // **THE CHROMATIC CHAMPION'S DRAKE FORM** (the Chromatic Champion plan, *Drake forms*;
  // the lead: *"have the drake capstone bestiary entry be tier 3 in scaling. Allow the
  // player stats to remain and any signatures from items they have. They should also be
  // able to use class and talent abilities while in the form"*; *"lasts until ended as
  // a half action"*; *"the drake form doesn't end at 0 health but normal death process
  // applies"*), **AS 02 WRITES IT** (*Drake form*; the 1B review's MUST-FIX - the book
  // wins over the plan): *What you wear and carry melds into the form, and the
  // Signatures on it still work* - `melds`, so every `meldsGear` reader follows (the
  // suit, the shield, the off hand, Block, `wieldFacts`); *You fight with the block's
  // attacks in place of your weapons ... and your own Strength modifier and Proficiency
  // Bonus* - `readyWeapons` answers the block's rows alone, and no score is overridden,
  // so the attack door's own Strength and Proficiency are the character's; *Your
  // Defense, and your Armor Points at each location, are the block's or the ones you had
  // before you took the form, whichever is higher* - `overlay`: the block stands BESIDE
  // the character, `CharacterData` works out the character's own numbers (the melded
  // suit included) and `afterFinalPhase` takes the better of each (`overlayDefense`,
  // `overlayArmorPoints`). Health, attributes and the ground pace are the character's;
  // the size, the flying pace (the block's own tier's, D-530) and the look are the
  // block's. `endsAt` is empty: no rest and no 0 Health ends it, only the Champion's
  // Half-Action (`leaveShape`) or a GM deleting the effect; and nobody else's shape
  // replaces it (`shapeMayReplace`; the lead: *"Only when champion ends it."*).
  // `entries` maps the capstone feature's name to its 14 block; the four come from
  // 14 §10 and 04's four capstones.
  drake: Object.freeze({
    feature: null, choice: null, features: Object.freeze(["Red Drake", "Blue Drake", "Bronze Drake", "Black Drake"]),
    ferocity: false, barsMana: false, melds: true, requires: null, overlay: true, keeps: true,
    endsAt: Object.freeze([]),
    entries: Object.freeze({ "Red Drake": "Red Drake", "Blue Drake": "Blue Drake", "Bronze Drake": "Bronze Drake", "Black Drake": "Black Drake" })
  })
});

/**
 * Whether a kind of shape stands BESIDE the character (the drake form): no score
 * overridden, Defense and Armor Points the better of the block's and the character's
 * own. What is worn still melds (`meldsGear`). `SHAPE_KINDS[kind].overlay`.
 *
 * @param {string|null} kind
 * @returns {boolean}
 */
export function isOverlayKind(kind) {
  return SHAPE_KINDS[kind]?.overlay === true;
}

/**
 * **07's HEX: *its Speed is 10 feet*** (D-808). Held to the chapter's sentence by
 * `shapes.test.mjs`; Polymorph takes it too (the tool's reading).
 */
export const FORCED_SPEED = 10;

/** Whether a kind of shape is laid on a creature by somebody else (07's Hex, 02's Polymorph). */
export function isForcedKind(kind) {
  return SHAPE_KINDS[kind]?.forced === true;
}

/** The 14 blocks a forced shape takes the form of: §15's Frog and Rabbit. */
export const FORCED_FORMS = Object.freeze(Object.values(SHAPE_KINDS).filter(k => k.forced).map(k => k.entry));

/**
 * **THE FORCED KIND A CARD LAYS ON A FAILED TEST** (D-808): a spell card by the
 * spell's identifier (07's Hex, whoever casts it - a character, a creature's
 * Spells line, an item), a feature card by the feature's key (02's Polymorph).
 * Null for every other card - and for a card whose Casting Test FAILED, which lays
 * nothing (07 §8: *a failed Casting Test costs the Mana and nothing else*).
 *
 * @param {object} flags  a card's `flags["azeroth-rpg"]`
 * @returns {string|null}
 */
export function forcedKindForCard(flags = {}) {
  const f = flags ?? {};
  if (f.success === false) return null;
  for (const [kind, k] of Object.entries(SHAPE_KINDS)) {
    if (!k.forced) continue;
    if (k.source === "spell" && f.kind === "spell" && f.identifier === k.identifier) return kind;
    if (k.source === "feature" && f.kind === "feature" && f.featureKey === k.identifier) return kind;
  }
  return null;
}

/**
 * **WHAT A FORCED SHAPE SHUTS, IN WORDS** (07's Hex: *it cannot attack, cast or
 * speak*; the lead, 2026-11-06, naming the doors: the attack, the cast, a feature's
 * Use, a creature's ability, a Signature, the Reactions and a Readied action). Each
 * is refused before anything is spent (D-768's order). A Move is open at the form's
 * pace. *Speak* has no mechanism in the system and stays the table's call - the
 * effect's text and the card say so. `leave`: the creature cannot step out of a
 * shape somebody else laid; the Sustain's end, damage or a GM does it.
 */
export const FORCED_REFUSALS = Object.freeze({
  attack: "AZEROTH.ForcedShape.Refuse.Attack",
  cast: "AZEROTH.ForcedShape.Refuse.Cast",
  feature: "AZEROTH.ForcedShape.Refuse.Feature",
  ability: "AZEROTH.ForcedShape.Refuse.Ability",
  signature: "AZEROTH.ForcedShape.Refuse.Signature",
  reaction: "AZEROTH.ForcedShape.Refuse.Reaction",
  ready: "AZEROTH.ForcedShape.Refuse.Ready",
  leave: "AZEROTH.ForcedShape.Refuse.Leave"
});

/**
 * Why a door is shut by the shape worn, as a localization key, or null. A GM may
 * take a forced shape off by hand (the lead: *"a Hex is ended by ending the
 * Sustain, not by hand-deleting, unless a GM"*), so `leave` is open to one.
 *
 * @param {{kind?: string}|null} shape  `AzerothActor#shape`
 * @param {string} door  a `FORCED_REFUSALS` key
 * @param {{gm?: boolean}} [o]
 * @returns {string|null}
 */
export function forcedShapeRefusal(shape, door, { gm = false } = {}) {
  if (!shape || !isForcedKind(shape.kind)) return null;
  if (door === "leave" && gm === true) return null;
  return FORCED_REFUSALS[door] ?? null;
}

/**
 * **WHETHER A BLOW ENDS THE SHAPE** (07's Hex: *Any damage ends the Hex*; 02's
 * Polymorph: *until it takes damage*): a kind that ends on damage, and a blow that
 * TOOK something once every door before the write had it (D-777's order) - Health,
 * or the temporary Health 05 has damage take first. A Parry that negates, a blow
 * moved onto somebody else, a Ward or a reduction that leaves 0 is no damage
 * taken; Health LOST (A1's Bleeding) is not damage at all. THE TOOL'S READING
 * (D-808), the plainer of the two the lead was offered.
 *
 * @param {{kind?: string}|null} shape
 * @param {number} taken  Health and temporary Health the blow removed
 * @returns {boolean}
 */
export function endsOnDamage(shape, taken) {
  return Boolean(shape && SHAPE_KINDS[shape.kind]?.endsOnDamage === true && (Number(taken) || 0) > 0);
}

/**
 * **A SECOND SHAPE** (D-808): a forced shape replaces whatever is worn - a frog over
 * a Druid's bear, a rabbit over a frog - and what it replaced ends with it; a shape
 * a creature takes for itself never replaces one laid on it (every door that takes
 * one refuses first; this is the writer's own guard). MY READING: the simplest rule
 * that keeps ONE shape a creature.
 *
 * **EXCEPT A SHAPE THAT ONLY ITS HOLDER ENDS** (`keeps`, the drake form; the lead:
 * *"Only when champion ends it."*, and the lead's ruling of 2026-11-08, *"I approve
 * those 4"*): 07's Hex and 02's Polymorph do not replace it, and
 * `documents/shapes.mjs#layForcedShape` says so in words on a card.
 *
 * @param {string|null} heldKind
 * @param {string} nextKind
 * @returns {boolean}
 */
export function shapeMayReplace(heldKind, nextKind) {
  if (!SHAPE_KINDS[nextKind]) return false;
  if (isForcedKind(nextKind)) return !keepsAgainstForced(heldKind);
  return !isForcedKind(heldKind);
}

/**
 * Whether a shape refuses to be replaced by one somebody else lays (the drake form;
 * the lead: *"Only when champion ends it."*). `SHAPE_KINDS[kind].keeps`.
 *
 * @param {string|null} kind
 * @returns {boolean}
 */
export function keepsAgainstForced(kind) {
  return SHAPE_KINDS[kind]?.keeps === true;
}

/**
 * **THE FORM'S PACE, AS THE EFFECT'S OWN CHANGES** (07's Hex: *its Speed is 10
 * feet*; D-808), in the `final` phase because the Speed is derived (D-668). An
 * OVERRIDE AT PRIORITY 1, so it is the base every other change on the Speed lands
 * on - Slowed's halving, a drop with its own `upgrade 0` floor, Entangled's 0 - and
 * undoes none of them. A creature with a flying pace keeps none (`flies`): `0`,
 * which `rules/movement.mjs#paceFor` reads as no flying pace, so a flying move goes
 * at the 10 (MY READING: a frog does not fly).
 *
 * @param {string} kind
 * @param {{flies?: boolean}} [o]
 * @returns {Array<{key: string, type: string, value: string, phase: string, priority: number}>}
 */
export function forcedShapeChanges(kind, { flies = false } = {}) {
  if (!isForcedKind(kind)) return [];
  return [
    { key: "system.speed", type: "override", value: String(FORCED_SPEED), phase: "final", priority: 1 },
    ...(flies ? [{ key: "system.flyingSpeed", type: "override", value: "0", phase: "final", priority: 1 }] : [])
  ];
}

/**
 * **THE ONE 14 BLOCK A SHAPE WITH NO MENU TAKES** (the Gnomish Battle Rig's
 * `entry`), or null for a shape picked off a menu.
 *
 * @param {string|null} kind
 * @returns {string|null}
 */
export function shapeEntryOf(kind, { feature = null } = {}) {
  // A kind whose feature names its block (the drake form: one block for each of the
  // four capstones), by the feature that takes it.
  const byFeature = SHAPE_KINDS[kind]?.entries?.[feature] ?? null;
  if (typeof byFeature === "string" && byFeature) return byFeature;
  const entry = SHAPE_KINDS[kind]?.entry ?? null;
  return typeof entry === "string" && entry ? entry : null;
}

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
    // A forced shape is laid by somebody else's failed Test (D-808): no feature
    // of the creature's own takes one, Polymorph's Use included.
    if (k.forced) continue;
    if (k.feature === name && k.choice === choice) return kind;
    // A kind several features take, by name alone (the drake form's four capstones).
    if (Array.isArray(k.features) && k.features.includes(name) && !choice) return kind;
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
  // Source documents do not contain derived senses. Keep only physical
  // locomotion and breathing, never the form's magical or combat passives.
  const movementSenses = [...new Set([...(s.creatureAbilities ?? []), ...(s.bossActions ?? [])]
    .flatMap(row => row?.automation?.passive?.senses ?? []))]
    .filter(sense => ["swim", "swimFast", "aquaticOnly", "waterBreathing"].includes(sense));
  return {
    uuid: uuid ?? source?.uuid ?? null,
    name: String(source?.name ?? ""),
    abilities: Object.fromEntries(SHAPE_ABILITIES.map(k => [k, num(s.abilities?.[k]?.value)])),
    defense: num(s.defense),
    ap: Object.fromEntries(LOCATIONS.map(l => [l, num(s.ap?.[l])])),
    speed: num(s.speed),
    flies: s.flies === true,
    movementSenses,
    size: isSize(s.size) ? String(s.size).toLowerCase() : DEFAULT_SIZE,
    // The block's own tier: a drake form flies at ITS tier's pace (the plan's *"tier 3
    // in scaling"*, D-530), never the character's.
    tier: num(s.tier),
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
    // Chimera can use either body's movement: a land-capable half removes
    // the restriction, while either half can supply swimming or gills.
    movementSenses: [...new Set(list.flatMap(f => f.movementSenses ?? []))]
      .filter(sense => sense !== "aquaticOnly" || list.every(f => (f.movementSenses ?? []).includes(sense))),
    size,
    tier: pick(f => f.tier),
    attacks: list.flatMap((f, formIndex) => (f.attacks ?? []).map(a => ({ ...a, traits: [...(a.traits ?? [])], form: String(f.name ?? ""), formIndex })))
  };
}

/**
 * **THE PHYSICAL HALF A KIND TAKES**: `physicalHalf`'s, with every score left to the
 * character where the kind stands beside it (the drake form, `isOverlayKind`: *"Allow
 * the player stats to remain"*). `shapeChanges` then overrides nothing, and
 * `CharacterData` reads the character's own scores.
 *
 * @param {string|null} kind
 * @param {object[]} forms  snapshots
 * @returns {ReturnType<typeof physicalHalf>}
 */
export function shapePhysical(kind, forms = []) {
  const physical = physicalHalf(forms);
  if (!physical || !isOverlayKind(kind)) return physical;
  return { ...physical, abilities: Object.fromEntries(SHAPE_ABILITIES.map(k => [k, null])) };
}

/**
 * **THE BETTER OF TWO DEFENSES** (the drake form; the lead: *its Defense and Armor
 * Points apply only where better*): the block's where it is the higher, else the
 * character's own. A block that prints none leaves the character's.
 *
 * @param {number|null} block
 * @param {number} own
 * @returns {number}
 */
export function overlayDefense(block, own) {
  const o = Number(own) || 0;
  return Number.isFinite(block) ? Math.max(block, o) : o;
}

/**
 * **THE BETTER OF TWO ARMOR POINTS, PER LOCATION** (the drake form): each of Body,
 * Head and Limb the higher of the block's and the character's own. A location the
 * block prints `—` for is the character's.
 *
 * @param {Record<string, number|null>} block
 * @param {Record<string, number|null>} own
 * @returns {Record<string, number|null>}
 */
export function overlayArmorPoints(block = {}, own = {}) {
  return Object.fromEntries(LOCATIONS.map(l => {
    const b = Number.isFinite(block?.[l]) ? block[l] : null;
    const o = Number.isFinite(own?.[l]) ? own[l] : null;
    return [l, b === null ? o : (o === null ? b : Math.max(b, o))];
  }));
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
 * 02's Beast forms, with the lead's specific Mountain Lion exception (2026-11-01).
 * **NOT 14 §15's FROG AND RABBIT** (D-808): 14 §8 makes a form *any Beast here*, in
 * §8, and those two are the forms Hex and Polymorph lay (MY READING of *here*).
 */
export function isShapeshiftForm(entry = {}) {
  if (FORCED_FORMS.includes(entry.name)) return false;
  return entry.creatureType === "beast"
    && (["chaff", "standard"].includes(entry.weightClass)
      || (entry.name === "Mountain Lion" && entry.weightClass === "soldier"));
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
