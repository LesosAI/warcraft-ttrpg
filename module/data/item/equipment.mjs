/**
 * Equipment item models: weapon, armor, gear, trait.
 *
 * D4 §10.1's field order is a contract the importer reads in order:
 *   Rating, AP, Range, Traits, Rarity, Budget, Cost, Weight, Provenance
 * and a field that does not apply is OMITTED, never stored empty. That is why
 * Rating and Range are nullable rather than defaulting to 0 — a bow's dash and
 * a crossbow's 2 are different facts (D-406).
 */

import { AZEROTH } from "../../config.mjs";
import {
  choiceField,
  descriptionField,
  identifierField,
  itemEconomyFields,
  optionalNumberField,
  sourceField,
  traitsField,
  usesField
} from "../common/fields.mjs";
import { armorPoints, defenseFrom, speedModifier } from "../../rules/armor.mjs";
import { pointsAwaitingSchool, schoolGrants } from "../../rules/grants.mjs";
import { CONSUMABLE_KINDS, GOES_ON, cleanUse } from "../../rules/consumables.mjs";
import { SIGNATURE_KINDS_AUTOMATED, cleanSignature } from "../../rules/signatures.mjs";
import { cleanCapacity, cleanCharges } from "../../rules/containers.mjs";
import { bagSlotsOf, cleanWell } from "../../rules/slots.mjs";
import { augmentOf } from "../../rules/augments.mjs";
import { cleanSlot } from "../../rules/worn.mjs";
import { cleanProvision } from "../../rules/provisions.mjs";
// 02 §7's Consecrated and 04's Sanctified Weapon (D-772): the trait a
// Consecrated weapon carries, derived while the flag stands.
import { CONSECRATED_FLAG, consecratedTrait } from "../../rules/class-features.mjs";

const fields = foundry.data.fields;

const base = () => ({
  identifier: identifierField(),
  description: descriptionField(),
  source: sourceField()
});

/**
 * Where a thing is kept, and WHICH WELL of that panel it sits in (08 SS11,
 * D-671; the lead, 2026-09-20). Foundry has no item inside an item, so the
 * CHILD names its container by id and the sheet groups by it; a container
 * deleted lets its contents fall loose (`AzerothActor`).
 *
 * **`well` is the index of the FIRST well the thing occupies** inside
 * whatever panel `container` names, and a thing of several bag slots takes a
 * CONTIGUOUS run from it. **Null means *no position yet, pack me after the
 * placed ones***, which is what a newcomer, a pack document and a world
 * migrated from 0.12.10 all carry.
 *
 * It is a CLAIM rather than a fact: `rules/slots.mjs#packPanel` honours it
 * where the run is free and inside the panel, and packs anything else into
 * the first free run. So nothing is ever lost to a bag that shrank, and the
 * schema needs no ceiling it could not know (a panel's capacity is derived
 * from the container the thing is in, not from the thing).
 */
const kept = () => ({
  container: new fields.DocumentIdField({ nullable: true, initial: null }),
  well: new fields.NumberField({ required: false, nullable: true, integer: true, min: 0, initial: null })
});

/**
 * What a container holds and what a thing has to spend (08 SS11, SS15;
 * D-671). Seeded off the chapter's own **Holds** and **Carries** runs by
 * `rules/containers.mjs` and stamped by the parser.
 */
function capacityField() {
  return new fields.SchemaField({
    weight: optionalNumberField({ min: 0 }),
    count: optionalNumberField({ min: 0 }),
    of: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
    weightAs: optionalNumberField({ min: 0 }),
    note: new fields.StringField({ required: false, blank: true, initial: "" })
  });
}

function chargesField() {
  return new fields.SchemaField({
    value: optionalNumberField({ min: 0 }),
    max: optionalNumberField({ min: 0 }),
    unit: new fields.StringField({ required: false, nullable: true, blank: false, initial: null })
  });
}

/**
 * Which school the points 08 §10 leaves open are in (D-690).
 *
 * §10 sells its Ward and Spellpower gear as `1, one school` - the points are
 * the item's and the school is the wearer's, chosen when it is bought - and a
 * Classic find whose spell power line names no school is the same shape
 * (D-685). The POINTS ride on `flags.azeroth-rpg.wardPoints` /
 * `spellpowerPoints`, stamped by the parser; the SCHOOL is stored here,
 * because it is a choice nothing in the chapter makes; and the GRANT is
 * derived from the two, so no sentence is stored twice.
 *
 * Null until the choice is made, and an item with no points ignores it.
 */
const chosenSchool = () => ({ school: choiceField(AZEROTH.schools) });

/**
 * The grant those points compose, on the DERIVED system (CLAUDE.md §4), and
 * what is still waiting for a school so the sheet can say so.
 *
 * `rules/grants.mjs#grantsOn` is the one reader; every consumer goes through
 * it, which is what stopped this being a flag nothing looked at (D-681).
 */
function applySchoolPoints(system, flags) {
  system.grants = schoolGrants({ flags, school: system.school });
  system.schoolPoints = pointsAwaitingSchool(flags);
}

/**
 * How many bag slots this thing takes (05 *Speed and movement*, 08 §11;
 * D-735).
 *
 * DERIVED, never stored, on all three physical types: the published weight is
 * already on the document and the ladder reads it, so a stored copy would be
 * a second place for one number to rot (CLAUDE.md §4). A mount, a vehicle and
 * a working animal answer 0 — they are not carried at all.
 *
 * **The quantity is IN it**: three torches take three bag slots and twenty
 * arrows share one, so the number here is what the thing really costs the
 * bags. The character's ledger asks the same function of the same data.
 */
function stampBagSlots(system) {
  system.bagSlots = bagSlotsOf(system);
}

/**
 * A stored WELL made valid before the schema's `min` can refuse the item
 * (the lead, 2026-09-20).
 *
 * **Only where the key is PRESENT** (D-671, and recursively): `migrateData`
 * runs over PARTIAL update data as well as a whole document, so
 * `update({"system.container": null})` reaches here too and a guard that
 * wrote a well it was never handed would throw a thing back to the front of
 * the bag on every move.
 */
function cleanWellField(source) {
  if (!source || typeof source !== "object" || !("well" in source)) return;
  source.well = cleanWell(source.well);
}

/**
 * What a named item carries beyond its affixes (D-632, D-633): a Signature
 * written for it alone, and the spells it casts - each at its own DC or the
 * bearer's, as often as it states. A spell rides by UUID and name; the DC
 * null means the bearer's own Spell DC.
 *
 * **The Signature is prose AND a descriptor.** `signature` is what the sheet
 * draws and `signatureEffect` is what fires; `rules/signatures.mjs` is the law
 * and all three models take both at once, because a Signature sits on a
 * weapon, a suit and a worn thing alike - which is the gap that `use` is on
 * `GearData` alone. The descriptor's position in this key order is FIXED: the
 * parsers stamp it here, beside the sentence it describes, and
 * `tools/check-packs.mjs` diffs every document byte for byte.
 */
const forged = () => ({
  signature: descriptionField(),
  signatureEffect: signatureField(),
  spells: new fields.ArrayField(
    new fields.SchemaField({
      uuid: new fields.StringField({ required: true, blank: false }),
      name: new fields.StringField({ required: true, blank: true, initial: "" }),
      dc: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null, min: 0 }),
      uses: usesField()
    }),
    { required: false, initial: [] }
  )
});

/* -------------------------------------------- */

/**
 * A weapon (08 §7).
 *
 * `rating` is null on a bow, sling or blowgun: THE SHOT CARRIES THE DAMAGE
 * (D-406). A crossbow or firearm carries 1 to 3, which pays for Reload, and it
 * adds to the ammunition's Rating.
 *
 * `range` is a number only on something that shoots. Melee is assumed and
 * carries no distance (D-531); a thrown weapon writes its distance into the
 * 08 §5 trait instead — `Thrown (40 ft)`.
 */
export class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...base(),
      rating: optionalNumberField({ min: 0 }),
      range: optionalNumberField({ min: 0 }),
      traits: traitsField(),
      ...chosenSchool(),
      ...itemEconomyFields(AZEROTH),
      equipped: new fields.BooleanField({ initial: false }),
      ...forged(),
      ...kept(),
      // Which hand, for the off-hand rules (06 §1, D-409).
      offHand: new fields.BooleanField({ initial: false }),
      // Ammunition is counted (D-407, D-453); a bundle tracks the shot.
      quantity: new fields.NumberField({ required: false, nullable: true, integer: true, min: 0, initial: null }),
      // What this shoots with; null on anything that does not shoot (08 §7, D-641).
      launcher: choiceField(AZEROTH.launcherKinds),
      // Which launchers a shot is cut to; empty on anything that is not shot.
      fits: new fields.ArrayField(
        new fields.StringField({ required: true, blank: false, choices: () => Object.keys(AZEROTH.launcherKinds) }),
        { required: false, initial: [] }
      ),
      // The bundle nocked: an owned item's id, resolved leniently by rules/ammunition.mjs.
      ammunition: new fields.DocumentIdField({ nullable: true, initial: null })
    };
  }

  /**
   * A `choices` on a stored value the enum lacks refuses the document at
   * load, and a refused document is invisible to a migration (CLAUDE.md
   * §15): an unknown launcher is nulled and an unknown fit dropped here.
   */
  static migrateData(source) {
    if (source && typeof source === "object") {
      const kinds = Object.keys(AZEROTH.launcherKinds);
      if (source.launcher !== undefined && source.launcher !== null && !kinds.includes(source.launcher)) source.launcher = null;
      if (Array.isArray(source.fits)) source.fits = source.fits.filter(k => kinds.includes(k));
      cleanSchool(source);
      cleanSignatureEffect(source);
      cleanWellField(source);
    }
    return super.migrateData(source);
  }

  /** True where the shot carries the damage rather than the launcher. */
  get shotCarriesDamage() {
    return this.rating === null;
  }

  /** A launcher: it shoots something (08 §7). */
  /**
   * What a stone, an oil or a poison laid on this thing adds while it lasts
   * (08 §13, D-668): *nothing about the item changes, and when the hour is
   * up it is what it was.* So the coating is a flag and the numbers are
   * derived here - the stored Rating and traits are untouched.
   */
  prepareDerivedData() {
    super.prepareDerivedData();
    applyCoating(this, this.parent?.flags?.["azeroth-rpg"]?.coating ?? null);
    applyConsecrated(this);
    applySchoolPoints(this, this.parent?.flags);
    stampBagSlots(this);
  }

  get isLauncher() {
    return this.launcher !== null && this.launcher !== undefined;
  }

  /** A shot: it fits a launcher and carries a Rating. Powder fits and is not one. */
  get isShot() {
    return Array.isArray(this.fits) && this.fits.length > 0 && this.rating !== null;
  }
}

/* -------------------------------------------- */

/**
 * A suit or shield (08 §8).
 *
 * The CATEGORY sets every Armor Point — "a named suit differs in price, weight
 * and provenance and never in what it stops." A Cut then moves points between
 * locations and pays for it elsewhere. Nothing here stores an AP number: they
 * are derived, so a category change cannot leave a stale value behind.
 */
export class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...base(),
      category: choiceField(AZEROTH.armorCategories, { initial: "none", nullable: false }),
      // Closed, Open, Long, Harnessed. rules/armor.mjs holds their legality.
      cuts: new fields.ArrayField(
        new fields.StringField({ choices: () => ["closed", "open", "long", "harnessed"] }),
        { initial: [] }
      ),
      shield: new fields.BooleanField({ initial: false }),
      traits: traitsField(),
      ...chosenSchool(),
      ...itemEconomyFields(AZEROTH),
      equipped: new fields.BooleanField({ initial: false }),
      // Body Armor Points over the category's: a named suit's margin (08 §20),
      // a Reinforced prefix's point, a shield's own (D-632).
      apBonus: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      ...forged(),
      ...kept()
    };
  }

  /** A stored school or Signature outside its vocabulary is nulled, never refused (CLAUDE.md §15). */
  static migrateData(source) {
    cleanSchool(source);
    cleanSignatureEffect(source);
    cleanWellField(source);
    return super.migrateData(source);
  }

  /**
   * Armor Points, Defense and Speed are derived from the category and the Cuts.
   * Storing them would be storing a derived value (CLAUDE.md §4).
   */
  prepareDerivedData() {
    super.prepareDerivedData();
    // A coating raises `apBonus` before the points are worked out (D-668).
    applyCoating(this, this.parent?.flags?.["azeroth-rpg"]?.coating ?? null);
    applySchoolPoints(this, this.parent?.flags);
    this.armorPoints = armorPoints(this.category, this.cuts);
    if (this.apBonus) this.armorPoints = { ...this.armorPoints, body: (this.armorPoints.body ?? 0) + this.apBonus };
    this.defense = defenseFrom(this.category, { shield: this.shield });
    this.speed = speedModifier(this.category, this.cuts);
    stampBagSlots(this);
  }
}

/* -------------------------------------------- */

/** Anything else carried (08 §9 to §17). Cost and Weight, and often nothing more. */
export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...base(),
      traits: traitsField(),
      // Which of 08 §11's thirteen slots this is worn in, or null where it is
      // worn in none (D-686, D-689). STORED, as a suit's category is: the
      // chapter's table says which, and the parser stamps it from the row's
      // own SLOT COLUMN - a sash and a belt name one waist between them.
      slot: choiceField(AZEROTH.wornSlots),
      // What 08 §12's *Food and drink* shelf makes this, or null (D-733).
      // STORED, as `slot` above is: the chapter's own table says which - the
      // Meal, Provision and Drink tables are the only place the distinction
      // exists - and a Short Rest needs one of each to give back anything.
      provision: choiceField(AZEROTH.provisionKinds),
      ...chosenSchool(),
      ...itemEconomyFields(AZEROTH),
      quantity: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      equipped: new fields.BooleanField({ initial: false }),
      ...forged(),
      ...kept(),
      // What it holds, and what it has to spend (08 §11, §15; D-671).
      capacity: capacityField(),
      charges: chargesField(),
      // What pressing Use does (08 §12, §13; D-668). Seeded off the entry's
      // own words by `rules/consumables.mjs` and stamped by the parser;
      // `kind: "none"` is a thing with no Use at all.
      use: useField()
    };
  }

  /**
   * What this is as an Augment (07 §3, 08 §9; D-674), or null.
   *
   * DERIVED, never stored: the pack already says the section and the name
   * already says the category and the grade, so a stored copy would be a
   * third place for the same fact to rot (CLAUDE.md §4).
   *
   * **The flags travel with it** (D-685): a Classic relic says which category
   * it is on `flags.azeroth-rpg.augment`, because it is filed under its
   * instance and never under 08 §9.
   */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.augment = augmentOf({ name: this.parent?.name, system: this, flags: this.parent?.flags });
    applySchoolPoints(this, this.parent?.flags);
    stampBagSlots(this);
  }

  /** A stored descriptor outside its vocabulary is nulled, never refused (CLAUDE.md §15). */
  static migrateData(source) {
    if (source?.use) source.use = cleanUse(source.use, USE_VOCABULARY());
    if (source?.capacity) source.capacity = cleanCapacity(source.capacity);
    if (source?.charges) source.charges = cleanCharges(source.charges);
    // Only when the key is PRESENT: a partial update that does not name the
    // slot must not have one written over it (D-671, D-686). The same rule for
    // the provision beside it (D-733).
    if (source && "slot" in source) source.slot = cleanSlot(source.slot);
    if (source && "provision" in source) source.provision = cleanProvision(source.provision);
    cleanSchool(source);
    cleanSignatureEffect(source);
    cleanWellField(source);
    return super.migrateData(source);
  }
}

/**
 * A stored school outside 07's seven is nulled rather than left to refuse the
 * document at load (CLAUDE.md §15).
 *
 * **Only where the key is PRESENT** (D-671): `update({"system.equipped": true})`
 * reaches this too, and rebuilding the object would write a null over a choice
 * the update never named.
 */
function cleanSchool(source) {
  if (!source || typeof source !== "object" || !("school" in source)) return;
  if (source.school !== null && !AZEROTH.schools[source.school]) source.school = null;
}

/**
 * A stored Signature descriptor made valid before the `choices` can refuse the
 * item (D-692). On weapon, armor and gear alike, because `forged()` is.
 *
 * **Only where the descriptor is actually there** (D-671): `cleanSignature`
 * cleans the keys it is handed and nothing else, so a partial update naming
 * one field of it keeps the rest, and an update naming none never reaches this.
 */
export function cleanSignatureEffect(source) {
  if (!source || typeof source !== "object") return;
  if (!source.signatureEffect || typeof source.signatureEffect !== "object") return;
  source.signatureEffect = cleanSignature(source.signatureEffect);
}

/** The vocabularies `cleanUse` checks a stored value against. */
const USE_VOCABULARY = () => ({
  conditions: Object.keys(AZEROTH.conditions ?? {}),
  schools: Object.keys(AZEROTH.schools ?? {}),
  resiliences: Object.keys(AZEROTH.resiliences ?? {}),
  actions: Object.keys(AZEROTH.actions ?? {})
});

/**
 * 08 §12 and §13's Use, as a schema. Every vocabulary field is nullable and
 * guarded by `migrateData` above, because a `choices` that refuses a stored
 * value makes the whole item invisible at load.
 */
function useField() {
  return new fields.SchemaField({
    kind: new fields.StringField({ required: true, blank: false, initial: "none", choices: CONSUMABLE_KINDS }),
    action: choiceField(AZEROTH.actions),
    target: new fields.StringField({ required: true, blank: false, initial: "self", choices: ["self", "item", "area"] }),
    appliesTo: new fields.StringField({ required: false, nullable: true, blank: false, initial: null, choices: GOES_ON }),
    heal: new fields.SchemaField({
      health: optionalNumberField({ min: 0 }),
      mana: optionalNumberField({ min: 0 }),
      fatigue: optionalNumberField({ min: 0 })
    }),
    ends: new fields.ArrayField(new fields.StringField({ blank: false }), { initial: [] }),
    statuses: new fields.ArrayField(new fields.StringField({ blank: false }), { initial: [] }),
    changes: new fields.ArrayField(new fields.SchemaField({
      key: new fields.StringField({ required: true, blank: false }),
      type: new fields.StringField({ required: true, blank: false, initial: "add" }),
      value: new fields.StringField({ required: true, blank: true, initial: "" }),
      // A stored base moves in `initial`, a derived number in `final` (CLAUDE.md §6).
      phase: new fields.StringField({ required: true, blank: false, initial: "final", choices: ["initial", "final"] })
    }), { initial: [] }),
    trait: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
    rating: optionalNumberField({ min: 0 }),
    damage: new fields.SchemaField({
      amount: optionalNumberField({ min: 0 }),
      type: new fields.StringField({ required: false, nullable: true, blank: false, initial: null })
    }),
    resist: new fields.SchemaField({
      resilience: choiceField(AZEROTH.resiliences),
      dc: optionalNumberField({ min: 0 })
    }, { required: false, nullable: true, initial: null }),
    area: new fields.StringField({ required: false, blank: true, initial: "" }),
    duration: new fields.SchemaField({
      value: optionalNumberField({ min: 0 }),
      units: new fields.StringField({ required: false, nullable: true, blank: false, initial: null })
    }),
    perRest: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
    // 14's Manuals: the experience reading it grants (the lead, 2026-09-07).
    xp: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null, min: 0 }),
    note: new fields.StringField({ required: false, blank: true, initial: "" })
  });
}

/**
 * THE STANDING AND TRIGGER FAMILIES, as schema fields (D-722).
 *
 * `signatureField()` below and `branchField()` beside it both need every one of
 * these: a gated sentence is a branch carrying the trunk's own families under
 * its own gate (the lead, 2026-09-14: a gate covers *only its own sentence*),
 * so two copies of nineteen fields would be two things to keep in step with
 * `AZEROTH`'s vocabularies - and the copy that drifted would refuse a stored
 * value on a branch alone, which makes the whole item invisible at load
 * (CLAUDE.md SS15) with nothing to say why.
 *
 * A FUNCTION, never a shared constant: a `DataField` takes its `name` and its
 * `parent` from the schema it is placed in, so one instance cannot sit in two.
 *
 * The keys are forwarded one at a time in `signatureField()` rather than
 * spread, because `tick` sits after `summon` in the descriptor's own key order
 * and KEY ORDER IS THE PACK DIFF (`tools/check-packs.mjs` compares byte for
 * byte, CLAUDE.md SS9).
 */
function standingSignatureFields() {
  return {
    // 08 SS6 grant sentences, read by `rules/grants.mjs#parseGrant`.
    grants: new fields.ArrayField(new fields.StringField(), { initial: [] }),
    refuses: new fields.ArrayField(
      new fields.StringField({ choices: () => [...Object.keys(AZEROTH.conditions), ...Object.keys(AZEROTH.refusalExtras)] }),
      { initial: [] }
    ),
    // The Critical Injury widened: a d20 face. The book only ever writes 19
    // or 18, and that is POLICY, held by the whole-pack census.
    criticalOn: optionalNumberField({ min: 2, max: 20 }),
    // Ashbringer's *its damage is doubled before Ward is subtracted*. A
    // multiplier under 2 is not one, which is the floor.
    damageMultiplier: optionalNumberField({ min: 2 }),
    // Quel'Serrar's *against dragonkin its Damage Rating IS 8*: a set, not a
    // bonus, since 08 SS6's grammar only adds.
    damageRatingSet: optionalNumberField({ min: 0 }),
    // The Ten Storms: a bonus scoped to ONE SCHOOL'S SPELLS, never to the
    // bearer, or the hammer in their hand would take it too.
    spellDamage: new fields.SchemaField({
      school: choiceField(AZEROTH.schools),
      amount: optionalNumberField({ min: 1 })
    }),
    // What a whole SCHOOL'S spells cost, less (the lead, 2026-09-14: *spell
    // and/or a school should be possible*). `empowers.cost` below is the same
    // rule scoped to ONE spell by name; this is `spellDamage`'s exact mirror
    // and takes its exact guards, `cleanSignature` first so a school outside
    // the vocabulary never reaches the `choices` that would refuse the item at
    // load (CLAUDE.md SS15). A discount of 0 is not one, which is the floor.
    //
    // **NO MIGRATION, AND THIS IS WHY** (CLAUDE.md SS10, D-665). Both subfields
    // carry `initial: null`, so every descriptor stored before this existed is
    // filled by the schema at load and reads as *no discount* - which is what
    // it was. Nothing can be refused at load either: `cleanSignature` runs in
    // every `migrateData` ahead of the `choices` here. And a migration that
    // stamped the key "where absent" could never fire for a field with an
    // initial, because `_source` is the model's cleaned copy and the key is
    // already there - the exact fault that left Arcane Brilliance with no Apply
    // for a version. The packs were regenerated instead, which is where a
    // descriptor comes from (CLAUDE.md SS9).
    spellCost: new fields.SchemaField({
      school: choiceField(AZEROTH.schools),
      amount: optionalNumberField({ min: 1 })
    }),
    // Vestments of Transcendence: what the bearer's own healing adds.
    healingBonus: optionalNumberField({ min: 1 }),
    // Nemesis Raiment: a track of 10's ladder and what comes off it.
    corruptionReduction: new fields.SchemaField({
      track: choiceField(AZEROTH.corruptionTracks),
      amount: optionalNumberField({ min: 1 })
    }),
    // Dragonstalker Armor: the dialog line the bearer does not take. A BANE
    // CANCELLED IS NOT A BOON, which is why this is not a grant.
    cancelsBane: choiceField(AZEROTH.cancellableBanes),
    // Drillborer Disk: *while you have not moved this turn, Block reduces
    // damage by a further 2.* The one Signature in 08 SS20 that modifies a
    // Reaction (06 SS6, D-693); `rules/reactions.mjs` owns the four it adds to.
    blockBonus: optionalNumberField({ min: 1 }),
    // Stormrage Raiment: *adds Armor Points equal to their tier* (D-696). The
    // points PER TIER, since a tier is the bearer's and not the item's;
    // `CharacterData` does the multiplication, where a tier is known.
    armorPointsPerTier: optionalNumberField({ min: 1 }),
    // The Bulwark of Tyr's Hand: the one Signature in 08 SS20 that stands on
    // somebody ELSE (D-696). `rules/auras.mjs` is the law and `cleanAura` the
    // guard; `targets` is left to it rather than given a `choices` here, for
    // the same reason every other vocabulary field is - a refused value makes
    // the whole item invisible at load.
    aura: new fields.SchemaField({
      feet: optionalNumberField({ min: 1 }),
      targets: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
      damageReduction: optionalNumberField({ min: 1 })
    }),
    // ONE NAMED SPELL OR CLASS FEATURE, IMPROVED (D-698). The NAME is free
    // text: 02, 04 and 07 have no roster in `config.mjs`, so the vocabulary is
    // `classic-tables.mjs#ABILITY_NAMED` and the census holds it against the
    // packs - the same treatment a class gate's value gets.
    empowers: new fields.SchemaField({
      name: new fields.StringField({ required: true, blank: true, initial: "" }),
      damageRating: optionalNumberField({ min: 1 }),
      heal: optionalNumberField({ min: 1 }),
      cost: optionalNumberField({ min: 1 })
    }),
    // What every creature the bearer has bound gains (D-698, D-643's bond).
    bound: new fields.SchemaField({ damage: optionalNumberField({ min: 1 }) }),
    onHit: new fields.SchemaField({
      // Null is *on a hit*; 2 is 08 SS5's Standard threshold.
      sl: optionalNumberField({ min: 0 }),
      damage: new fields.SchemaField({ amount: optionalNumberField({ min: 0 }), type: choiceField(AZEROTH.damageTypes) }),
      condition: new fields.SchemaField({
        id: choiceField(AZEROTH.conditions),
        value: optionalNumberField({ min: 1 }),
        until: choiceField(AZEROTH.untilKinds)
      }),
      // The FURTHER conditions the same blow lands (D-698). One item in the
      // union writes two - *Frightened and Slowed* - and `condition` above can
      // only ever be the first of them.
      conditions: new fields.ArrayField(new fields.SchemaField({
        id: choiceField(AZEROTH.conditions),
        value: optionalNumberField({ min: 1 }),
        until: choiceField(AZEROTH.untilKinds)
      }), { initial: [] }),
      // How many Banes the TARGET takes on its next Test.
      bane: optionalNumberField({ min: 1 }),
      sunder: optionalNumberField({ min: 0 }),
      momentum: optionalNumberField({ min: 0 }),
      heal: optionalNumberField({ min: 0 }),
      // Where the healing lands (D-698): null the bearer, a number *one
      // creature within N feet* (Lawbringer Armor).
      healFeet: optionalNumberField({ min: 1 }),
      // Mana the bearer regains off the blow — `heal`'s twin (Fist of Stone).
      mana: optionalNumberField({ min: 0 }),
      // Feet the target is pushed (Earthshaker; 08 §5's Shove). The move is
      // the table's and this is what puts the row on the card.
      push: optionalNumberField({ min: 1 }),
      // Thunderfury's jump. NULL where it does not arc, so a consumer reads
      // `arc` rather than `arc.targets` to know whether there is one.
      arc: new fields.SchemaField({
        targets: optionalNumberField({ min: 1 }),
        feet: optionalNumberField({ min: 0 })
      }, { required: false, nullable: true, initial: null }),
      // How often the row may fire (D-696): Dal'Rend's *each round*, Sulfuron's
      // *each turn*. Null is every hit. The vocabulary is `abilityUsesPer` and
      // `cleanSignature` enforces it, never a `choices` here.
      per: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
      // Perdition's Blade: damage equal to what the TARGET is carrying, `per`
      // points for each point of the condition named (D-696).
      damageFromCondition: new fields.SchemaField({
        id: choiceField(AZEROTH.conditions),
        per: optionalNumberField({ min: 1 })
      }),
      // Sulfuron Hammer: the divisor the condition's value is taken at, so 2 is
      // *half the damage dealt* (D-696). Its exact mirror.
      conditionFromDamage: optionalNumberField({ min: 1 })
    }),
    // Gorehowl: a blow that FINISHES a creature, which is not one that lands.
    onKill: new fields.SchemaField({
      feet: optionalNumberField({ min: 0 }),
      bane: optionalNumberField({ min: 1 }),
      condition: new fields.SchemaField({
        id: choiceField(AZEROTH.conditions),
        value: optionalNumberField({ min: 1 }),
        until: choiceField(AZEROTH.untilKinds)
      })
    }),
    whenStruck: new fields.SchemaField({
      damage: new fields.SchemaField({ amount: optionalNumberField({ min: 0 }), type: choiceField(AZEROTH.damageTypes) }),
      // What the blow leaves on whoever landed it: two Classic finds freeze or
      // slow the attacker and nothing carried it.
      condition: new fields.SchemaField({
        id: choiceField(AZEROTH.conditions),
        value: optionalNumberField({ min: 1 }),
        until: choiceField(AZEROTH.untilKinds)
      })
    }),
    // At the start of each of your turns: the record's own mp5 and hp5.
    tick: new fields.SchemaField({
      health: optionalNumberField({ min: 0 }),
      mana: optionalNumberField({ min: 0 })
    })
  };
}

/** Why a Signature - or one sentence of one - is still prose. */
function reasonField() {
  return new fields.StringField({
    required: true, blank: true, initial: "",
    choices: () => ["", ...Object.keys(AZEROTH.signatureReasons)]
  });
}

/**
 * 08 SS20's gate, as a LIST that must hold all the way through. Eight of
 * SS20's twenty-six write a compound - *a Paladin wielding it ... against
 * undead and demons* is a class gate and a creature-type gate at once -
 * and one pair could only carry the first. Each value may still name more
 * than one thing, comma-separated, and that half is an "any of".
 *
 * THREE LISTS SHARE IT (D-722): the trunk's, the button's own `useGates`, and
 * every branch's.
 */
function gateListField() {
  return new fields.ArrayField(new fields.SchemaField({
    kind: choiceField(AZEROTH.signatureGates),
    value: new fields.StringField({ required: true, blank: true, initial: "" })
  }), { initial: [] });
}

/**
 * ONE GATED SENTENCE (D-722). The lead, 2026-09-14, asked what a gate in one
 * sentence of a multi-sentence Signature covers and answered: *only its own
 * sentence*. *A creature that hits you takes 1 Nature damage. A Shaman wielding
 * it adds 2 to its Damage Rating.* is one Signature saying two things, and a
 * single top-level gate could only ever say *all of it is a Shaman's*.
 *
 * It carries the gate, why it is still prose where nobody could read it, and
 * the standing and trigger families - and **no `kind`, `use`, `useGates`,
 * `summon` or `gated` of its own**, because a Signature carries ONE button and
 * `AzerothActor#resetUses` writes `system.signatureEffect.use.uses.value` by
 * dotted path at every rest: an array index under that is D-671's trap one
 * level deeper, and it has destroyed data here twice.
 */
function branchField() {
  const standing = standingSignatureFields();
  return new fields.SchemaField({
    gates: gateListField(),
    reason: reasonField(),
    grants: standing.grants,
    refuses: standing.refuses,
    criticalOn: standing.criticalOn,
    damageMultiplier: standing.damageMultiplier,
    damageRatingSet: standing.damageRatingSet,
    spellDamage: standing.spellDamage,
    spellCost: standing.spellCost,
    healingBonus: standing.healingBonus,
    corruptionReduction: standing.corruptionReduction,
    cancelsBane: standing.cancelsBane,
    blockBonus: standing.blockBonus,
    armorPointsPerTier: standing.armorPointsPerTier,
    aura: standing.aura,
    empowers: standing.empowers,
    bound: standing.bound,
    onHit: standing.onHit,
    onKill: standing.onKill,
    whenStruck: standing.whenStruck,
    tick: standing.tick
  });
}

/**
 * 08 SS20's Signature, as a schema (D-692). Every vocabulary field is nullable
 * and guarded by `cleanSignature` in each model's `migrateData`, because a
 * `choices` that refuses a stored value makes the whole item invisible at load
 * (CLAUDE.md SS15) - and a migration walking the collection never sees it.
 *
 * `kind: "none"` is a Signature nothing fires, and `reason` says why somebody
 * left it that way.
 *
 * **EXPORTED, because a career carries one too** (03 §5, D-692). `CareerData`
 * gives every career a `{name, description}` Signature and had no descriptor
 * beside it, so `AzerothActor#resetUses` - which walks
 * `system.signatureEffect.use.uses` - could not refill the eight the chapter
 * gives a rest-bounded limit, and the Combat row said the count was the
 * table's. The schema is the same schema: a Signature is a Signature wherever
 * the book writes one, and a second copy of this would be a second thing to
 * keep in step with `rules/signatures.mjs`.
 */
export function signatureField() {
  const standing = standingSignatureFields();
  return new fields.SchemaField({
    kind: new fields.StringField({ required: true, blank: false, initial: "none", choices: SIGNATURE_KINDS_AUTOMATED }),
    reason: reasonField(),
    gates: gateListField(),
    // WHAT QUALIFIES THE BUTTON ALONE (D-722). A Signature carries one button
    // and the sentence that presses may be gated while the sentences beside it
    // are not: *A Shaman may spend a Half-Action to call the elements. Anyone
    // wielding it takes a Boon on Parry.* EMPTY falls back to `gates`, which is
    // what every descriptor written before this key meant, so nothing inverts.
    useGates: gateListField(),
    grants: standing.grants,
    refuses: standing.refuses,
    criticalOn: standing.criticalOn,
    damageMultiplier: standing.damageMultiplier,
    damageRatingSet: standing.damageRatingSet,
    spellDamage: standing.spellDamage,
    spellCost: standing.spellCost,
    healingBonus: standing.healingBonus,
    corruptionReduction: standing.corruptionReduction,
    cancelsBane: standing.cancelsBane,
    blockBonus: standing.blockBonus,
    armorPointsPerTier: standing.armorPointsPerTier,
    aura: standing.aura,
    empowers: standing.empowers,
    bound: standing.bound,
    onHit: standing.onHit,
    onKill: standing.onKill,
    whenStruck: standing.whenStruck,
    // What pressing it does, in `useField()`'s vocabulary above.
    use: new fields.SchemaField({
      action: choiceField(AZEROTH.actions),
      // What the press costs, in `class-features.mjs#cost`'s shape exactly.
      cost: new fields.SchemaField({
        pool: choiceField(AZEROTH.poolTypes),
        amount: optionalNumberField({ min: 1 })
      }),
      uses: new fields.SchemaField({
        max: optionalNumberField({ min: 0 }),
        value: optionalNumberField({ min: 0 }),
        per: choiceField(AZEROTH.abilityUsesPer)
      }),
      heal: new fields.SchemaField({
        health: optionalNumberField({ min: 0 }),
        mana: optionalNumberField({ min: 0 }),
        fatigue: optionalNumberField({ min: 0 })
      }),
      changes: new fields.ArrayField(new fields.SchemaField({
        key: new fields.StringField({ required: true, blank: false }),
        type: new fields.StringField({ required: true, blank: false, initial: "add" }),
        value: new fields.StringField({ required: true, blank: true, initial: "" }),
        // A stored base moves in `initial`, a derived number in `final` (CLAUDE.md SS6).
        phase: new fields.StringField({ required: true, blank: false, initial: "final", choices: ["initial", "final"] })
      }), { initial: [] }),
      statuses: new fields.ArrayField(new fields.StringField({ blank: false }), { initial: [] }),
      ends: new fields.ArrayField(new fields.StringField({ blank: false }), { initial: [] }),
      // `SIGNATURE_DURATION_UNITS` is the vocabulary and `cleanSignature`
      // enforces it, exactly as `useField()` leaves its own units to
      // `cleanUse`: a `choices` here would refuse the document at load
      // instead, and a refused document is invisible to a migration.
      // **`encounter` is a unit and carries no number** (D-692).
      duration: new fields.SchemaField({
        value: optionalNumberField({ min: 0 }),
        units: new fields.StringField({ required: false, nullable: true, blank: false, initial: null })
      }),
      damage: new fields.SchemaField({ amount: optionalNumberField({ min: 0 }), type: choiceField(AZEROTH.damageTypes) }),
      // What it takes OFF one incoming blow (Battlegear of Wrath's halving),
      // never both halves at once.
      mitigates: new fields.SchemaField({
        halve: new fields.BooleanField({ initial: false }),
        amount: optionalNumberField({ min: 1 })
      }),
      resist: new fields.SchemaField({
        resilience: choiceField(AZEROTH.resiliences),
        dc: optionalNumberField({ min: 0 })
      }, { required: false, nullable: true, initial: null }),
      area: new fields.StringField({ required: true, blank: true, initial: "" }),
      note: new fields.StringField({ required: true, blank: true, initial: "" })
    }),
    // More bodies on the field (D-691's own shape, verbatim).
    summon: new fields.SchemaField({
      entry: new fields.StringField({ required: true, blank: true, initial: "" }),
      count: optionalNumberField({ min: 1 }),
      side: choiceField(AZEROTH.summonSides, { initial: "summoner", nullable: false }),
      from: choiceField(AZEROTH.summonFrom, { initial: "nextRound", nullable: false })
    }),
    tick: standing.tick,
    // THE SENTENCES WITH A GATE OF THEIR OWN (D-722). An EMPTY list is exactly
    // what the descriptor meant before this key, so every stored document, hand
    // row and Classic template keeps its value and nothing inverts.
    gated: new fields.ArrayField(branchField(), { initial: [] })
  });
}

/**
 * A coating's numbers, on the DERIVED system. A Rating raises what the
 * thing hits or stops; a trait joins the list the roll pipeline reads
 * (`rules/weapon-traits.mjs`), so an oiled blade deals its school's damage
 * for the hour and is a plain blade after.
 */
function applyCoating(system, coating) {
  if (!coating) return;
  if (coating.trait && !(system.traits ?? []).includes(coating.trait)) {
    system.traits = [...(system.traits ?? []), coating.trait];
  }
  const rating = Number(coating.rating) || 0;
  if (!rating) return;
  if (typeof system.rating === "number") system.rating += rating;
  else if (system.apBonus !== undefined) system.apBonus = (system.apBonus ?? 0) + rating;
}

/**
 * **A CONSECRATED WEAPON** (02 §7: *You may enchant your weapon with
 * **Blessed** at Lesser grade once per Short Rest. This lasts until your next
 * use of this feature*; D-772): the trait joins the DERIVED list while the
 * weapon carries the flag the Use wrote, exactly as a coating's does, so the
 * roll pipeline reads it and the stored traits never change. **At Greater grade
 * while the holder has 04's Sanctified Weapon** (*Your **Consecrated** weapon
 * counts as **Blessed** at Greater grade, converting its damage to Holy*), read
 * at every preparation, so a rank taken after the Use counts at once - and the
 * Greater grade is what `rules/damage-spec.mjs` converts to Holy.
 *
 * @param {object} system  the weapon's derived system
 */
function applyConsecrated(system) {
  const item = system?.parent ?? null;
  if (!item?.flags?.["azeroth-rpg"]?.[CONSECRATED_FLAG]) return;
  const holder = item.parent ?? null;
  const trait = consecratedTrait({ sanctified: holder?.talentRanks?.("Sanctified Weapon") ?? 0 });
  if (!(system.traits ?? []).includes(trait)) system.traits = [...(system.traits ?? []), trait];
}

/* -------------------------------------------- */

/**
 * A trait definition (08 §5). Fifty-four of them, and 08 §5 DEFINES EVERY ONE
 * while 06 §3 carries a names-only roster (D-391). `check-equipment.ps1` fails
 * 06 for restating a definition and fails either document if the name sets
 * differ, which is the only thing making a second roster safe.
 *
 * A trait entry is written like an item: a name, then a bold field run of
 * Kind, Family, School and Fires on, then what it does.
 */
export class TraitData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...base(),
      kind: choiceField(AZEROTH.traitKinds, { initial: "form", nullable: false }),
      // Enchantments only: Craft, School or Bound.
      family: choiceField(AZEROTH.enchantmentFamilies),
      // Every enchantment except Bound has a Lesser and a Greater grade.
      grade: choiceField(AZEROTH.enchantmentGrades),
      school: choiceField(AZEROTH.schools),
      // Effect traits fire on a Success Level threshold.
      firesOn: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
      // Some traits take a value: Pierce X, Versatile (X), Reload (X).
      value: optionalNumberField({ min: 0 }),
      cost: optionalNumberField({ min: 0 })
    };
  }
}
