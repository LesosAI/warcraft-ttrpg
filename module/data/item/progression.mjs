/**
 * Progression item models: race, class, career, talent, talentTree, legacy,
 * profession. Field orders are the chapters' (D2 §3) because the importer reads
 * them in order.
 */

import { AZEROTH } from "../../config.mjs";
import {
  choiceField,
  descriptionField,
  identifierField,
  optionalNumberField,
  usesField,
  sourceField
} from "../common/fields.mjs";
import { migrateClassSource } from "../../migrations/0.6.0-class-branches.mjs";
// A career's Signature carries a descriptor exactly as a named item's does
// (D-692). One schema, one guard: `equipment.mjs` owns both because
// `forged()` was where the first one landed.
import { cleanSignatureEffect, signatureField } from "./equipment.mjs";

const fields = foundry.data.fields;

/** Common to every item imported from the book. */
const base = () => ({
  identifier: identifierField(),
  description: descriptionField(),
  source: sourceField()
});

/* -------------------------------------------- */

/**
 * A people (02 §5). Eleven of them.
 *
 * Race gives a free trait, eight racial talents of which four are taken across
 * a career, languages, and a SIZE — and it touches no Health, Defense or
 * ability score (02 §5, D-545).
 */
export class RaceData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...base(),
      size: choiceField(AZEROTH.sizes, { initial: "medium", nullable: false }),
      // 30 feet before armor; some races are quicker or slower (05).
      speed: new fields.NumberField({ required: true, integer: true, initial: 30, min: 0 }),
      trait: new fields.SchemaField({
        name: new fields.StringField({ required: false, blank: true, initial: "" }),
        description: descriptionField()
      }),
      // Eight per race; one at creation and one at each tier increase.
      talents: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ required: true, blank: false }),
        tier: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 4 }),
        description: descriptionField()
      }), { initial: [] }),
      // The people's own tongue, from 02 §4 (D-636); the side's is added at
      // creation and never stored here.
      languages: new fields.ArrayField(
        new fields.StringField({ choices: () => Object.keys(AZEROTH.languages) }),
        { initial: [] }
      ),
      // 02 §3's matrix. Warrior is the only class open to all eleven.
      classes: new fields.ArrayField(new fields.StringField(), { initial: [] })
    };
  }
}

/* -------------------------------------------- */

/**
 * A class (02 §6, §7). Nine of them.
 *
 * THE POOL CAPS LIVE HERE AND NOWHERE ELSE (D-507). `rules/progression.mjs`
 * reads them off this document; the actor schema stores no maximum, because a
 * constant there is a constant where 05 §11 has a lookup.
 */
export class ClassData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...base(),
      frame: choiceField(AZEROTH.frames, { initial: "standard", nullable: false }),

      // Momentum: a name and a cap, or neither. 10 for Rage, Zeal and Ferocity;
      // 5 for Quarry and Combo Points.
      momentum: new fields.SchemaField({
        name: choiceField(AZEROTH.momentumTypes),
        max: optionalNumberField({ min: 0 })
      }),

      // Power: a name, a cap and a caster grade, or none of them.
      power: new fields.SchemaField({
        name: choiceField(AZEROTH.powerTypes),
        max: optionalNumberField({ min: 0 }),
        caster: choiceField(AZEROTH.casterGrades, { initial: "none", nullable: false })
      }),

      // A class trains two of the three Resiliences (05 §1).
      resiliences: new fields.ArrayField(
        new fields.StringField({ choices: () => Object.keys(AZEROTH.resiliences) }),
        { initial: [], max: 2 }
      ),

      // Schools this class may learn from (07 §1). A caster never adds one by
      // study; multiclassing adds the second class's schools to the first's.
      schools: new fields.ArrayField(
        new fields.StringField({ choices: () => Object.keys(AZEROTH.schools) }),
        { initial: [] }
      ),
      castingAbility: choiceField(AZEROTH.abilities),

      armor: new fields.ArrayField(
        new fields.StringField({ choices: () => Object.keys(AZEROTH.armorCategories) }),
        { initial: [] }
      ),
      shields: new fields.BooleanField({ initial: false }),
      weapons: new fields.StringField({ required: false, blank: true, initial: "" }),

      // Three named branches. The sheet never invents one (D11 §4).
      //
      // {name, description}, as the pack source and TalentTreeData carry
      // them. Typed as strings until 0.6.0, so `StringField#_cast` turned every
      // imported branch into "[object Object]" and no class in a world named
      // one; the 0.6.0 migration restores them from the pack.
      branches: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ required: true, blank: false }),
        description: descriptionField()
      }), { initial: [], max: 3 }),

      // Features arrive at levels 1, 5, 9, 11, 14, 17 and 20, two at level 1.
      features: new fields.ArrayField(new fields.SchemaField({
        level: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 20 }),
        name: new fields.StringField({ required: true, blank: false }),
        description: descriptionField()
      }), { initial: [] }),
      // The Shaman's totems (02 §7), each gated by level; the Totem feature's
      // chooser lists those the class's level has reached (D-618). Empty on
      // every other class.
      totems: new fields.ArrayField(new fields.SchemaField({
        level: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 20 }),
        name: new fields.StringField({ required: true, blank: false }),
        description: descriptionField()
      }), { initial: [] }),
      // The Druid's Forms table (02 §7): how many Beast forms are known at a
      // level; the Shapeshift chooser reads it (D-619). Empty on every other
      // class. Migration 0.7.0 restores it, and totems, on a class item copied
      // before the table existed.
      forms: new fields.ArrayField(new fields.SchemaField({
        level: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 20 }),
        known: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 })
      }), { initial: [] }),
      // The Warlock's demons (02 §7, D-635): three learned by level and the
      // greater ones from 11; Bound Demon, Metamorphosis and the Ritual of
      // Summoning choose from it. Empty on every other class; migration 0.9.0
      // restores it on a class item copied before the table existed.
      demons: new fields.ArrayField(new fields.SchemaField({
        level: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 20 }),
        name: new fields.StringField({ required: true, blank: false }),
        greater: new fields.BooleanField({ initial: false }),
        description: descriptionField()
      }), { initial: [] }),
      // 01 §6's suggested kit (D-636): what a starting character buys inside
      // the purse, each row the item as 08 names it and which pack holds it,
      // with the road kit everybody buys marked. Parsed from 01 and resolved
      // against the packs; migration 0.10.0 restores it on a class copied
      // before the table existed.
      kit: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ required: true, blank: false }),
        type: new fields.StringField({ required: true, blank: false, initial: "gear", choices: ["weapon", "armor", "gear"] }),
        quantity: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 }),
        road: new fields.BooleanField({ initial: false })
      }), { initial: [] })
    };
  }

  /*
   * THE FEATURE LADDER IS NOT HERE.
   *
   * `ClassData.FEATURE_LEVELS` re-exported `rules/progression.mjs`' union and
   * **nothing read it on either side of the boundary**. Before that it was the
   * model's own copy, and it was wrong - it omitted the level 15 that 02 §6
   * gives the Paladin and the Warlock - for as long as it existed, because a
   * file that reads `foundry.abstract` at import cannot be loaded under Vitest
   * and no test could see it (the lead, 2026-09-07). Wrong and unread at once.
   *
   * The list lives in `rules/progression.mjs`, which is pure: `FEATURE_LADDER`,
   * `EXTRA_FEATURE_LEVELS` and `featureLevelsFor(identifier)`, held against 02
   * §6's own sentence, against the parser's table and against the classes pack
   * by `feature-levels.test.mjs` and the class-feature census. Read it there.
   */

  /**
   * Reshape legacy source before the schema cleans it. Verified against the
   * shipped V14 source: `TypeDataField#_cleanType` calls the model's
   * `migrateDataSafe` (common/data/fields.mjs), so this runs for an embedded
   * class too. A branch stored as a string under the pre-0.6.0 schema would
   * otherwise fail validation and the item would never initialize - and a
   * document that never initializes is one the world migration cannot see.
   */
  static migrateData(source) {
    migrateClassSource(source);
    return super.migrateData(source);
  }
}

/* -------------------------------------------- */

/**
 * A career (03 §2). Eight fields, in this order, and the order is the contract.
 *
 * `inCareer` ACCUMULATES along a road (D-294): a career carries the skills of
 * every career its Entry accepts, in inheritance order, then adds its own. That
 * list is the only reason a Rank is cheap, and D11's skills rail shows it.
 */
export class CareerData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...base(),
      tier: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 4 }),
      // 03 §5's Open to column (D-636): anyone, or one side of the war. The
      // creator notes a career the character's side cannot hold and never
      // refuses it — 03 leaves that to the table.
      side: choiceField(AZEROTH.sides, { initial: "anyone", nullable: false }),
      grantor: new fields.StringField({ required: false, blank: true, initial: "" }),
      entry: new fields.StringField({ required: false, blank: true, initial: "" }),
      inCareer: new fields.ArrayField(
        new fields.StringField({ choices: () => Object.keys(AZEROTH.skills) }),
        { initial: [] }
      ),
      signature: new fields.SchemaField({
        name: new fields.StringField({ required: false, blank: true, initial: "" }),
        description: descriptionField()
      }),
      // WHAT THE CAPABILITY DOES, beside what it says (08 §20's own shape,
      // D-692). 03 §5 gives eight of the fifty-three a rest-bounded limit -
      // *Once between Long Rests* - and nothing could count one: `resetUses`
      // walks `system.signatureEffect.use.uses` and only `forged()` carried
      // that path, so the Combat row printed *the count is the table's*. The
      // parser stamps it from `rules/signatures.mjs#CAREER_SIGNATURES`, which
      // is the hand-reviewed table the census already holds against the pack.
      // It sits after `signature` for the same reason it does on an item: the
      // key order is the diff `tools/check-packs.mjs` reads.
      signatureEffect: signatureField(),
      opens: new fields.StringField({ required: false, blank: true, initial: "" }),
      closes: new fields.StringField({ required: false, blank: true, initial: "" }),
      exits: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ required: true, blank: false }),
        tier: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        note: new fields.StringField({ required: false, blank: true, initial: "" })
      }), { initial: [] })
    };
  }

  /**
   * A stored Signature descriptor made valid before a `choices` can refuse the
   * career at load, and a refused document is invisible to a world migration
   * (CLAUDE.md §15).
   *
   * **Only where the descriptor is present** (D-671): `cleanSignature` cleans
   * the keys it is handed and nothing else, so
   * `update({"system.signatureEffect.use.uses.value": 0})` - which is what
   * pressing a career Signature writes - keeps the maximum and the period
   * beside it.
   */
  static migrateData(source) {
    cleanSignatureEffect(source);
    return super.migrateData(source);
  }
}

/* -------------------------------------------- */

/**
 * A talent (04 §2). Table columns: Tier | Talent | Ranks | Requires | Effect.
 *
 * `tier` is the BRANCH tier, gated by points already spent in that branch —
 * none / 4 / 8 / 12 / 16 — and NOT by character level (04 §1). Getting that
 * wrong turns the tree into a level track.
 */
export class TalentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...base(),
      className: new fields.StringField({ required: false, blank: true, initial: "" }),
      // A racial talent names its race and no class (02 SS2, D-620): eight a
      // race, on their own currency, so the class tree and the points
      // leave them alone.
      race: new fields.StringField({ required: false, blank: true, initial: "" }),
      branch: new fields.StringField({ required: false, blank: true, initial: "" }),
      tier: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 5 }),
      ranks: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 3 }),
      taken: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      // Names a talent lower in the same branch. One rank of it is enough, and
      // the tree draws an arrow from it.
      requires: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
      effect: descriptionField(),
      // Once per Short Rest, once per encounter (04's own words, D-623): read
      // off the effect by the parser and by the race grant. `per` null means
      // unlimited, which is most talents.
      uses: usesField()
    };
  }

  /** Usable now: unlimited, or a use left. */
  get available() {
    return !this.uses?.per || this.uses.value > 0;
  }

  /** Points needed in the branch before a branch tier opens (04 §1). */
  static TIER_GATE = Object.freeze({ 1: 0, 2: 4, 3: 8, 4: 12, 5: 16 });
}

/* -------------------------------------------- */

/**
 * A class feature the character holds (02 §7, D-612): granted by the class
 * at its level and withdrawn with it, never created by hand. The mechanics
 * come from `rules/class-features.mjs` at grant time and are stored here so
 * the sheet and the workflow read the item alone; `uses.value` is the one
 * field that changes in play.
 */
export class FeatureData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...base(),
      className: new fields.StringField({ required: false, blank: true, initial: "" }),
      level: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 20 }),
      kind: new fields.StringField({ required: true, blank: false, initial: "passive", choices: ["action", "passive"] }),
      action: choiceField(AZEROTH.actions),
      cost: new fields.SchemaField({
        pool: new fields.StringField({ required: false, nullable: true, blank: false, initial: null,
          choices: () => [...Object.keys(AZEROTH.momentumTypes), ...Object.keys(AZEROTH.powerTypes)] }),
        amount: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        all: new fields.BooleanField({ initial: false })
      }),
      casting: new fields.BooleanField({ initial: false }),
      dc: optionalNumberField({ min: 1 }),
      uses: usesField(),
      heal: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
      damage: new fields.SchemaField({
        amount: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
        type: choiceField(AZEROTH.damageTypes)
      }),
      resist: choiceField(AZEROTH.resiliences),
      extraAttack: new fields.BooleanField({ initial: false }),
      // The kind of shape the Extra Attack needs (D-769): the Druid's is *while
      // in a Shapeshift form* (02 §7), and null is none. A free string with no
      // `choices` - a refused value would make the item invisible at load
      // (CLAUDE.md §15) - and the sync restamps every held feature at world
      // load (D-621), so a new field with an initial needs no migration.
      extraAttackIn: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
      // Moves this turn that cost no Half-Action (02 §7's Sprint, D-712). The
      // sync restamps every held feature at world load, so a world made before
      // the field takes the initial and is stamped on the next preparation -
      // no migration.
      freeMove: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 2 }),
      // The card's Attack button, where the feature makes an attack (D-616).
      attack: new fields.BooleanField({ initial: false }),
      // HOW MANY ATTACKS that button makes (the architect's review of D-773):
      // null is one (Kill Shot); an amount in `rank` (04's Rapid Fire, `4*rank`);
      // `each` one per creature - those the Use named, else the enemies measured
      // in its area or, with none, within reach (02's Divine Storm, 04's
      // Whirlwind). Barrage's own limit is its talents' (`grantLimitsFor`). A new
      // field with an initial, restamped at world load (D-621): no migration.
      attacks: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
      // A feature that is a menu (D-618, D-619, D-635): Use asks which, from
      // the whole list, with what the class's level has not reached greyed.
      // "totems" and "demons" read the class's tables; "elementals",
      // "forms", "beasts" and "avatar" the bestiary; "schools" the config;
      // "warCry" the feature's own two; "poisons" what the character carries.
      // "skills" is Adaptable's (D-636): the one skill always in-career.
      choice: new fields.StringField({ required: false, nullable: true, blank: false, initial: null,
        choices: ["totems", "elementals", "forms", "demons", "greaterDemons", "beasts", "avatar", "warCry", "schools", "poisons", "skills"] }),
      // How many the menu takes in ONE use (02 §7's Totem Mastery, D-710):
      // one Half-Action places up to four totems, each paying its own Mana.
      // One everywhere else, and the sync stamps it off the feature table -
      // a new field with an initial, so no world needs migrating for it.
      picks: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 8 }),
      // The forms a Shapeshift has learned (D-619): a bestiary uuid and its
      // name, in the order taken, capped by the class's Forms table.
      known: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true, blank: false }),
        name: new fields.StringField({ required: true, blank: false })
      }), { initial: [] }),
      // The area, in 07 SS9's phrasing so `rules/areas.mjs#areaFor` reads it
      // exactly as it reads a spell's Target line (D-616).
      area: new fields.StringField({ required: false, blank: true, initial: "" }),
      restore: new fields.StringField({ required: false, nullable: true, blank: false, initial: null, choices: ["halfMana"] }),
      // A pool paid INTO on use (Blood Fury: 2 Momentum, D-620), the
      // primary class's pool of that kind.
      gain: new fields.SchemaField({
        pool: new fields.StringField({ required: false, nullable: true, blank: false, initial: null, choices: ["momentum", "power"] }),
        amount: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      note: new fields.StringField({ required: false, blank: true, initial: "" }),
      // The talents that changed this feature's stamp (D-642), by name.
      modifiedBy: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { initial: [] }),
      // A creature the feature acts on, and how (D-642; the door is D-643's).
      bound: new fields.SchemaField({
        kind: new fields.StringField({ required: false, nullable: true, blank: false, initial: null,
          choices: ["companion", "demon", "elemental", "totem", "summon"] }),
        action: new fields.StringField({ required: false, nullable: true, blank: false, initial: null,
          choices: ["attack", "heal", "buff", "dismiss", "bind"] })
      }),
      // What the feature calls: 14's entries, how many, for how long.
      summons: new fields.SchemaField({
        entries: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { initial: [] }),
        count: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        until: new fields.StringField({ required: false, nullable: true, blank: false, initial: null, choices: ["encounter", "rest"] })
      }),
      // A Bane laid on the TARGET's next Test of one kind (06 §6's Pummel):
      // *that creature takes two Banes on the next Casting Test it makes.*
      // `rules/banes.mjs` is the law and `effects/banes.mjs` writes it; this
      // is the only field on a feature that touches another creature's sheet.
      lays: new fields.SchemaField({
        kind: choiceField(AZEROTH.testKinds),
        banes: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 3 })
      }),
      // Healing or damage the card's Apply lays on each target, landing at the
      // start of its turns (02's Regrowth, 04's Wild Growth; D-770's carrier,
      // D-771). `amount` is an expression read at the Use; `rounds` the turns,
      // a number once a talent's patch is bound. Free strings with no `choices`
      // (a refused value hides the item at load, CLAUDE.md §15); a new field
      // with initials, restamped by the sync at world load (D-621), so no
      // migration - the precedent of `extraAttackIn`, `picks` and `aura`.
      tick: new fields.SchemaField({
        kind: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
        amount: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
        rounds: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      // The conditions the card offers on each target (02's Hurricane, 04's
      // Typhoon; D-771): an A1 key, its value, and how long - an
      // `AZEROTH.untilKinds` key or null. Free strings, for the reason above;
      // the card reads only what `AZEROTH.conditions` knows.
      inflicts: new fields.ArrayField(new fields.SchemaField({
        condition: new fields.StringField({ required: true, blank: false }),
        value: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null, min: 1 }),
        until: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
        // The Casting Test's SL the card needs before it offers this condition
        // (04's Pyroblast at rank 2; D-775): null for any success. A new key with
        // an initial, restamped by the sync at world load (D-621) - no migration.
        sl: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null, min: 1 })
      }), { initial: [] }),
      // What the roll dialog reminds the roller of (D-613): the kinds of
      // Test it bears on, a line of text, and the Boon or Bane the book names.
      reminder: new fields.SchemaField({
        kinds: new fields.ArrayField(new fields.StringField({ choices: ["attack", "casting", "skill", "resilience", "any"] }), { initial: [] }),
        text: new fields.StringField({ required: false, blank: true, initial: "" }),
        boons: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        banes: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      // What stands on every ALLY in reach (02 §7's Aura of Resolve, D-755):
      // `rules/auras.mjs#auraStamp`'s shape, key for key and initial for
      // initial, because the sync compares its stamp against the stored copy
      // and a key missing from either side would rewrite every feature at
      // every world load. The words are free strings with no `choices` - a
      // refused value would make the item invisible at load (CLAUDE.md §15) -
      // and `rules/auras.mjs` refuses what it cannot read instead. A new field
      // with initials, restamped by the sync at world load (D-621): no
      // migration.
      aura: new fields.SchemaField({
        feet: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null, min: 0 }),
        targets: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
        centre: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
        // Whether the holder is LEFT OUT (the lead, 2026-09-26: *the caster
        // counts as an ally unless the aura specifically says "other than
        // you"*). It replaced `includeOwner`, whose stored `false` meant the
        // opposite; the key is dropped by the model's cleaning at load and the
        // world-load restamp writes this one (D-621), so no migration.
        excludeOwner: new fields.BooleanField({ initial: false }),
        gate: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
        boon: new fields.SchemaField({
          kind: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
          resilience: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
          boons: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
        }),
        schoolArmor: new fields.SchemaField({
          schools: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { initial: [] }),
          from: new fields.StringField({ required: false, nullable: true, blank: false, initial: null })
        }),
        floor: new fields.SchemaField({
          ap: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
          ward: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
        }),
        spellDamage: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        damageReduction: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        // 04's Sacred Duty (D-772): Armor Points added, on an aura that reaches
        // its HOLDER alone while another ally is near. No class feature lays
        // either today; the stamp writes both on every feature, so the schema
        // declares them at the stamp's own initials (D-755's rule above).
        armor: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        holderOnly: new fields.BooleanField({ initial: false })
      })
    };
  }

  /** Whether the feature has a use left, or is not limited at all. */
  get available() {
    return !this.uses.per || this.uses.value > 0;
  }
}

/* -------------------------------------------- */

/** A talent tree: a class and its three branches. Talents reference into it. */
export class TalentTreeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...base(),
      className: new fields.StringField({ required: false, blank: true, initial: "" }),
      branches: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ required: true, blank: false }),
        description: descriptionField()
      }), { initial: [], max: 3 })
    };
  }
}

/* -------------------------------------------- */

/**
 * A Legacy (15, D-581). Seven fields and four ranks. A Legacy REPLACES the
 * career (02 §11) and cannot be lost (D-579) — the holders may disown you and
 * the ranks stay.
 */
export class LegacyData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...base(),
      race: new fields.StringField({ required: false, blank: true, initial: "" }),
      className: new fields.StringField({ required: false, blank: true, initial: "" }),
      entry: new fields.StringField({ required: false, blank: true, initial: "" }),
      rank: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 4 }),
      ranks: new fields.ArrayField(new fields.SchemaField({
        rank: new fields.NumberField({ required: true, integer: true, min: 1, max: 4, initial: 1 }),
        name: new fields.StringField({ required: true, blank: false }),
        description: descriptionField(),
        // Ranks 2 and 4 each raise one ability by 2 and lower another by 1,
        // permanently, and may carry a score past 20 (D-588).
        abilityUp: choiceField(AZEROTH.abilities),
        abilityDown: choiceField(AZEROTH.abilities)
      }), { initial: [], max: 4 })
    };
  }
}

/* -------------------------------------------- */

/** A profession (11). A trade on 05 §8's Rank ladder, picked up in play. */
export class ProfessionData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...base(),
      rank: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0, max: AZEROTH.RANK_MAX }),
      trainer: new fields.StringField({ required: false, blank: true, initial: "" })
    };
  }
}
