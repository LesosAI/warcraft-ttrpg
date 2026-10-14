/**
 * Character data model — schema per CLAUDE.md §4 and D2-FOUNDRY-SPEC §2.
 * Derived values (ability modifiers, Health max, Proficiency, armor by
 * location, encumbrance) are computed in prepareDerivedData() and never stored.
 */

import { AZEROTH } from "../../config.mjs";
import { grantsFor, grantsOn } from "../../rules/grants.mjs";
import { signatureEffects } from "../../rules/signatures.mjs";
import { corruptionEffects } from "../../rules/corruption-effects.mjs";
import { wornWeaponEffects } from "../../rules/weapon-traits.mjs";
import { abilityModifier } from "../../rules/abilities.mjs";
import { initiativeFor } from "../../rules/initiative.mjs";
import { derivedThresholds, trackStates } from "../../rules/corruption.mjs";
import { wardFor } from "../../rules/ward.mjs";
import {
  characterLevel,
  clampPool,
  healthMax,
  hostilePairings,
  poolsFor,
  proficiencyBonus,
  schoolsFor,
  secondaryLevel,
  tierForLevel
} from "../../rules/progression.mjs";
import { suitEffects } from "../../rules/armor.mjs";
import { DEFAULT_SIZE, flyingPace } from "../../rules/size.mjs";
// A shape's physical half (02 §7, D-769): what the block gives the character,
// and whether worn gear melds into it.
import { SHAPE_ABILITIES, meldsGear } from "../../rules/shapes.mjs";
// Carrying is counted in bag slots (D-735, D-736); the pounds stay with 14's
// creatures, in `rules/weight.mjs` and `NpcData`.
import { baseCapacity, ledger } from "../../rules/slots.mjs";
import { carryFactor } from "../../rules/talent-effects.mjs";
import { blockSpeedParts, speedFrom, speedParts } from "../../rules/speed.mjs";
import { capFor } from "../../rules/momentum.mjs";
import { emptyByTestKind, laidBaneRows, laidBaneTotals, laidBoonRows } from "../../rules/banes.mjs";
import { laidBaneFlags, laidBoonFlags } from "../../effects/banes.mjs";
// The Warrior's and the Paladin's kinds read on the model (D-772): Unyielding,
// the schools named at a Long Rest, and a heal Mortal Strike blocks.
import { PLATE_FLAG, plateWards, steadfastFor } from "../../rules/class-talents.mjs";
// 04's Frozen Core (D-775): a damage type a talent makes the character Immune to.
import { damageImmunitiesFor } from "../../rules/class-talents.mjs";
import { healingBlockedBy } from "../../rules/no-healing.mjs";
// What an ally's aura lays on this character (D-755).
import { auraBaneRows, auraBoonRows, auraHalvesHealing, auraStandsFree, emptySchoolArmor } from "../../rules/auras.mjs";
import { SOURCE_MIGRATIONS } from "../../migrations/index.mjs";

const fields = foundry.data.fields;

// The tracks are config.mjs's list rather than a copy of it (D-456). This file
// used to carry its own array and the two could drift silently;
// check-corruption.ps1 reads config against the book, so deriving the keys here
// is what puts the schema under that check too.
const CORRUPTION_TRACKS = Object.keys(AZEROTH.corruptionTracks);

export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // The character's own full illustration (D-700), drawn between the two
      // columns of the Overview tab's paper doll.
      //
      // **A CHARACTER HAS THREE IMAGES AND THEY ARE NOT COPIES OF EACH OTHER.**
      // `img` is the Actor directory's portrait and what a chat card prints;
      // `prototypeToken.texture.src` is what stands on the canvas and what the
      // banner draws (the lead: *the token art on the top left*); this is the
      // plate. Shaped exactly as `NpcData.art` — same categories, same
      // `blank: true`, same `""` initial — because it answers the same question
      // on the other actor type.
      //
      // Blank until somebody sets one, and the tab falls back to `img`, so a
      // character made before this field reads exactly as it did.
      art: new fields.FilePathField({ categories: ["IMAGE"], required: true, nullable: false, blank: true, initial: "" }),

      // 05 §1: scores run 3-20 unaided. An affix or a Legacy carries one past
      // 20 (D-482, D-588), so the schema ceiling sits above the natural one and
      // character creation — not the schema — holds the 3-20 line.
      abilities: new fields.SchemaField(
        Object.fromEntries(Object.keys(AZEROTH.abilities).map(k => [k,
          new fields.SchemaField({
            value: new fields.NumberField({ required: true, integer: true, initial: 10, min: 1, max: 30 })
          })
        ]))
      ),

      // "Wounds" was retired as a pool name (D-006); the pool is Health.
      // `max` is derived in prepareDerivedData() and stored only so the token
      // bar has a field to read (system.json primaryTokenAttribute).
      health: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        max:   new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        // 05's TEMPORARY HEALTH (D-777; the lead: *"raise HP past max as temp
        // hp"*): *a buffer laid over the top of your own, and it is not Health*.
        // STORED, because it is spent - damage takes it first - and its own
        // field, because *it is not counted when a rule asks for your maximum
        // Health*. The grant's source and span ride the actor's `temporaryHealth`
        // flag; `rules/temporary-health.mjs` is the law.
        temp:  new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),

      // D-507. 05 §11 has TWO pools and a class may hold either, both or
      // neither. NEITHER STORES A MAXIMUM: the cap comes from the class item —
      // 10 for Rage, Zeal and Ferocity, 5 for Quarry and Combo Points — and
      // rules/progression.mjs reads it there. A hardcoded max here would be a
      // constant where the rules have a lookup, which is the fault D-507 names.
      // A multiclass may hold one from each side: Rage from the Warrior half,
      // Mana from the Priest half.
      momentum: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      power: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),

      // 05 §14: "You begin play with 3." It never recovers from rest.
      spiritTether: new fields.SchemaField({
        value: new fields.NumberField({ integer: true, initial: 3, min: 0 }),
        max:   new fields.NumberField({ integer: true, initial: 3, min: 0 })
      }),

      // 05: 1-2 nothing, 3 a Bane on Skill and Attack Tests, 4 Slowed, 5 a Bane
      // on Resilience too, 6 collapse. A Long Rest removes one.
      fatigue: new fields.NumberField({
        required: true, integer: true, initial: 0, min: 0, max: AZEROTH.FATIGUE_MAX
      }),
      // 06 SS8's dying track (D-629): a failed DC 12 Body Resilience Test at
      // the start of a turn at 0 Health takes a step; Bleeding while dying
      // takes one; the third is the end. Cleared by healing and by a Tether.
      deathSteps: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0, max: AZEROTH.DEATH_STEPS }),

      // Each track runs 0-20. Thresholds at 5/10/15 are derived, never stored
      // (D-457, D-458) — crossing one is a function of the number.
      corruption: new fields.SchemaField(
        Object.fromEntries(CORRUPTION_TRACKS.map(k => [k,
          new fields.NumberField({ integer: true, initial: 0, min: 0, max: AZEROTH.CORRUPTION_MAX })
        ]))
      ),

      // Up to two class tracks. Index 0 is primary; index 1 is the multiclass,
      // always one tier behind (02 §10). Every derived value reads the whole
      // array — never classes[0].
      classes: new fields.ArrayField(
        new fields.SchemaField({
          itemId: new fields.DocumentIdField({ nullable: true }),
          level:  new fields.NumberField({ integer: true, initial: 1, min: 1, max: 20 }),
          // THE POWER POOL BELONGS TO THE CLASS, NOT THE CHARACTER. 02 §10:
          // "Each class keeps its own Power pool and casting chart. There is no
          // combined caster." A Mage/Rogue holds Mana and Energy at once, and
          // one `system.power` on the actor could only ever hold one of them.
          // Momentum stays on the actor: 05 §11 makes Rage, Zeal, Quarry,
          // Combo Points and Ferocity five names for one resource.
          power: new fields.SchemaField({
            value: new fields.NumberField({ integer: true, initial: 0, min: 0 })
          }),
          // Momentum is per class too. A Warrior/Rogue holds Rage AND Combo
          // Points - two resources with different caps, not one pool wearing
          // whichever name came first.
          momentum: new fields.SchemaField({
            value: new fields.NumberField({ integer: true, initial: 0, min: 0 })
          })
        }),
        { max: 2 }
      ),

      career: new fields.SchemaField({
        tier: new fields.NumberField({ integer: true, initial: 1, min: 1, max: 4 }),
        itemId: new fields.DocumentIdField({ nullable: true })
      }),

      // 02 §9: levels are granted and XP is a purse. `spent` is reconciled
      // against the ledger flag rather than trusted (D-508, D2 §2.4).
      xp: new fields.SchemaField({
        earned: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        spent:  new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),

      // 02 §4 (D-636): the tongues spoken, as keys of AZEROTH.languages. The
      // creator writes the race's own and the side's; 02 §9 sells more.
      languages: new fields.ArrayField(
        new fields.StringField({ choices: () => Object.keys(AZEROTH.languages) }),
        { initial: [] }
      ),
      // The purse in copper (D-422): what the creator leaves of 01 §6's ten
      // silver, and what the Gear tab counts from then on (D-636).
      coin: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      // 01 §8's one sentence: why this character is on the road instead of
      // at home (D-636).
      motive: new fields.StringField({ required: false, blank: true, initial: "" }),

      // A FLYING PACE, where something gives the character one (14 §1's
      // second pace, D-530; D-718). **Stored rather than derived**, and that
      // is the whole point: nothing in 02 or 04 grants a character flight, so
      // there is nothing to derive it FROM - it is the GM's field and an
      // Active Effect's target, the way a form or a mount would set it. Null
      // means the character does not fly, which is not the same as flying at
      // nought, so the field is nullable and the banner draws the line only
      // where a number is set.
      //
      // A stored base moves in the `initial` phase (D-668,
      // `rules/consumables.mjs#phaseFor`); `rules/movement.mjs#paceFor` reads
      // it when the move's own action says `fly`.
      flyingSpeed: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null, min: 0 })
    };
  }

  /**
   * Values independent of items and effects. Reading item or effect state here
   * is a bug — see CLAUDE.md §4 (data preparation order). Level and tier come
   * off the stored class array rather than off class items, so they belong
   * here: an Active Effect that raises an ability needs the modifier to exist
   * before the `initial` phase runs.
   */
  /**
   * Reshape legacy source before the schema cleans it.
   *
   * THIS IS THE ONLY PLACE A MIGRATION CAN SEE OLD DATA. `SchemaField` cleaning
   * runs at construction, so by the time `runMigrations()` reads `actor.system`
   * every out-of-schema key has already been dropped and every wrongly-shaped
   * one replaced by its initial. A world migration alone would find nothing to
   * do, advance its version setting, and leave the numbers at zero - which is
   * indistinguishable from a clean run and is what the unit tests could not
   * see, because they hand the update builders legacy data directly.
   *
   * Verified against the shipped V14 source: `DataModel#_initializeSource`
   * calls `cleanData(..., {migrate: true})`, which runs `migrateDataSafe` ->
   * `migrateData` first (`common/abstract/data.mjs`).
   *
   * The chain is applied oldest-first, so a world several versions behind is
   * carried through every step in order.
   */
  static migrateData(source) {
    for (const migrate of SOURCE_MIGRATIONS) migrate(source);
    return super.migrateData(source);
  }

  prepareBaseData() {
    super.prepareBaseData();

    for (const [key, ability] of Object.entries(this.abilities)) {
      ability.mod = abilityModifier(ability.value);
      // **THE SCORE AS STORED, BEFORE ANY EFFECT** (D-769). The `initial`
      // Active Effect phase lands between this method and `prepareDerivedData`,
      // and a change to `value` there - an elixir's +2, a shape's override - has
      // to move the modifier: `prepareDerivedData` reads the delta an effect put
      // on `mod` against THIS score, never against the moved one, which read
      // every change to `value` as a change to `mod` the other way and
      // cancelled it.
      ability.stored = ability.value;
      ability.label = AZEROTH.abilities[key];
    }

    this.level = characterLevel(this.classes);
    this.tier = tierForLevel(this.level);
    this.proficiency = proficiencyBonus(this.level);
  }

  /**
   * Values that depend on items and effects. NOTHING HERE IS PERSISTED.
   *
   * The pool caps and the Frame come off the class items, never off a constant
   * (D-507). A character with no class item yet holds neither pool, which is
   * why `momentum.max` can legitimately be null — the sheet draws an em-dash
   * for a pool nobody has rather than an empty bar (D-509).
   */
  prepareDerivedData() {
    super.prepareDerivedData();

    const classItems = this.#classItems();

    // The bearer, for every Signature gate judged on this sheet (08 §20,
    // D-692). Read ONCE, from the actor's own getter, so the standing grants
    // and the refusals below cannot disagree about who is wearing the thing.
    // A gate naming the creature struck has no answer here and fails closed;
    // it is judged where the attack is built, with the target in the snapshot.
    const bearer = this.parent?.signatureState ?? {};

    // **THE SHAPE WORN, AND THE BLOCK'S PHYSICAL HALF** (02 §7; D-769). The
    // lead's rulings: *"Physical half"* - Strength, Dexterity, Constitution,
    // Defense, Armor Points, Speed, size and attacks are the block's, and the
    // character keeps Intelligence, Wisdom, Charisma, skills, Proficiency and
    // talents; *"Druid's own Health"*; *"Melds; Signatures count"*. The three
    // scores arrive as the effect's `initial` overrides; everything else is
    // read off the snapshot below. Null out of a shape, and nothing moves.
    const shape = this.parent?.shape ?? null;
    const physical = shape?.physical ?? null;
    const melded = Boolean(shape && meldsGear(shape.kind));

    // What is worn grants (08 §6, 2026-09-06): the attribute family lands on
    // the score's TOTAL - the stored value stays the creation score, since
    // the plate's input writes it back - and the modifier is taken from the
    // total. An Active Effect that moved the modifier in the initial phase
    // keeps its delta. Spellpower by school, a Boon by skill and Fortitude
    // ride to the cast, the dialog and the Health maximum. Derived, never
    // stored. **Affixes on a melded thing still grant** (the lead).
    const worn = grantsFor((this.parent?.items ?? []).map(i => ({
      equipped: i.system?.equipped === true, name: i.name, grants: grantsOn(i, bearer)
    })));
    this.grants = worn;
    for (const [key, ability] of Object.entries(this.abilities)) {
      // **THE DELTA IS AN EFFECT'S CHANGE TO `mod`, read against the score as
      // STORED** (D-769): `prepareBaseData` took the modifier off `stored`, and
      // an `initial` change to `value` - an elixir, a shape - lands in `value`
      // and moves the total, so it is no delta at all.
      const stored = ability.stored ?? ability.value;
      const delta = (ability.mod ?? abilityModifier(stored)) - abilityModifier(stored);
      ability.bonus = worn.abilities[key] ?? 0;
      ability.sources = worn.abilitySources[key] ?? [];
      ability.total = ability.value + ability.bonus;
      ability.mod = abilityModifier(ability.total) + delta;
      // **THE CHARACTER'S OWN SCORE, WHERE A SHAPE HAS TAKEN IT** (D-769): what
      // the sheet's tooltip names, and what the Health and a rest read.
      ability.own = physical && SHAPE_ABILITIES.includes(key)
        ? { value: stored, total: stored + ability.bonus, mod: abilityModifier(stored + ability.bonus) + delta }
        : null;
    }
    this.spellpower = { ...worn.spellpower };
    this.skillBoons = worn.boons;

    // ---- what the roll dialog reads off the ROLLER (06 §6, D-693) ----------
    // **A CREATURE HAS HAD THESE SINCE D-691 AND A CHARACTER HAD NONE OF
    // THEM**, which is why nothing in this system could say *that creature
    // takes a Bane on its next Test*: `testBanes` was a creature's own derived
    // number off its own standing passive and a character had no such field at
    // all. The same three keys now exist on both actor types, so the dialog
    // asks one question of either.
    //
    // **EVERY LINE ADDS TO WHAT IS THERE** and never recomputes from `_source`
    // (D-691's own scar): the `initial` Active Effect phase lands before this
    // method, so a plain assignment would write an effect's own point back out
    // again. A character's own standing passives are empty today - nothing in
    // 02 or 04 grants a flat Bane on a KIND of Test - and the fields exist for
    // what an effect and a laid Bane put in them.
    this.testBoons = { ...emptyByTestKind(), ...(this.testBoons ?? {}) };
    this.testBanes = { ...emptyByTestKind(), ...(this.testBanes ?? {}) };
    // A Bane a WORN thing puts on a skill (08 §6's grammar; nothing sells one
    // today, and a Signature may write one). Kept in the same bag the dialog
    // already reads a creature's standing Bane out of, additively.
    this.skillBanes = { ...(this.skillBanes ?? {}) };
    for (const [skill, names] of Object.entries(worn.skillBanes)) {
      this.skillBanes[skill] = [...(this.skillBanes[skill] ?? []), ...names];
    }
    // **WHAT IS WORN IS A SECOND SOURCE AND IT IS KEPT APART** (2026-09-10).
    // `system.testBoons` above is the ROLLER'S OWN — a creature's standing
    // passive and whatever an Active Effect wrote — and `system.grants` carries
    // what the items grant, with the item names beside the counts. Two bags
    // because the roll dialog raises two lines with two labels: 14 says *a
    // standing ability of this creature* and 08 §6 says which thing you are
    // wearing. Folding them together would count each once and say the wrong
    // thing about half of them.
    //
    // A Bane laid by somebody ELSE (06 §6's Pummel, 08 §20's Gorehowl): the
    // Active Effect is the carrier and the clock, and the flag on it is what
    // the roll reads. Kept apart from `testBanes` on purpose - a laid Bane is
    // SPENT by the next Test of its kind and a standing one never is, and
    // folding them together would mean one number with two lifetimes.
    const laid = laidBaneRows(laidBaneFlags(this.parent));
    this.laidBaneRows = laid;
    this.laidBanes = { ...emptyByTestKind(), ...(this.laidBanes ?? {}) };
    for (const [kind, n] of Object.entries(laidBaneTotals(laid))) this.laidBanes[kind] += n;
    // A Boon SOMEBODY ELSE laid (04's Blessing, D-772): the Bane's twin, a flag
    // and never a change, read by the dialog and spent by the Test it bears on.
    this.laidBoonRows = laidBoonRows(laidBoonFlags(this.parent));

    // Pools. The cap is the class's; the stored value is clamped to it.
    // Mana scales with level (02 §6), so the level is part of the lookup.
    const pools = poolsFor(classItems, this.level);
    // A talent that lifts a cap (04, D-627): Zealotry, Hunter's Mark. Items
    // are prepared before the actor's derived data, so the ranks are here.
    const taken = (this.parent?.items ?? []).filter(i => i.type === "talent" && (i.system?.taken ?? 0) > 0);
    const ranksOf = name => taken.filter(t => t.name === name).reduce((n, t) => n + (t.system.taken ?? 0), 0);
    // The talents taken as `rules/` reads them, for the kinds read here (D-772).
    const talentRows = taken.map(t => ({
      id: t.id, identifier: t.system?.identifier, className: t.system?.className, race: t.system?.race ?? null, name: t.name, taken: t.system?.taken
    }));
    for (const pool of pools.momenta) pool.max = capFor(pool, ranksOf);
    if (pools.momentum && !pools.momenta.includes(pools.momentum)) pools.momentum.max = capFor(pools.momentum, ranksOf);
    // A pool the character does not hold keeps its stored value untouched and
    // reports a null cap. Zeroing it here would discard data every time a GM
    // detached a class item, and the null `max` is already what tells the sheet
    // to draw an em-dash rather than an empty bar (D-509).
    // One entry per class that carries Momentum, exactly like the Power pools
    // below. `system.momentum` stays as the primary class's, so a chat card or
    // macro reading a single pool kept working.
    this.momenta = pools.momenta.map(pool => {
      const entry = this.classes.find(c => c.itemId === pool.itemId);
      const stored = entry?.momentum?.value ?? 0;
      return { ...pool, value: clampPool(stored, pool) ?? stored };
    });
    const firstMomentum = this.momenta[0] ?? null;
    this.momentum.pool = pools.momentum;
    this.momentum.max = pools.momentum?.max ?? null;
    this.momentum.value = firstMomentum
      ? firstMomentum.value
      : (clampPool(this.momentum.value, pools.momentum) ?? this.momentum.value);
    // ONE ENTRY PER CLASS THAT CARRIES POWER (02 §10). `system.powers` is what
    // the sheet draws; `system.power` stays as the primary caster's pool so a
    // chat card or macro reading a single pool did not break when this went
    // plural.
    this.powers = pools.powers.map(pool => {
      const entry = this.classes.find(c => c.itemId === pool.itemId);
      const stored = entry?.power?.value ?? 0;
      return {
        ...pool,
        itemId: pool.itemId,
        value: clampPool(stored, pool) ?? stored
      };
    });
    const primary = this.powers[0] ?? null;
    this.power.pool = pools.power;
    this.power.max = pools.power?.max ?? null;
    this.power.value = primary
      ? primary.value
      : (clampPool(this.power.value, pools.power) ?? this.power.value);

    // Health. The frame is the primary class's; a multiclass does not add a
    // second body (02 §10).
    const frame = classItems[0]?.frame ?? "standard";
    this.health.max = healthMax({
      frame,
      // *"Druid's own Health"* (the lead, D-769): the character's OWN
      // Constitution, the stored score and what is worn, never a form's.
      conMod: this.abilities.con.own?.mod ?? this.abilities.con.mod,
      level: this.level,
      // Sturdy's +1 Fortitude (08 §6) is a point of Health.
      bonus: worn.fortitude
    });
    // **NO CLAMP HERE** (D-768). The Health was clamped to this maximum on this
    // line, BEFORE the `final` Active Effect phase - and Toughness (*your
    // Fortitude rises by 2 per rank*) raises the maximum in that phase, so a
    // warrior healed to the raised maximum was cut back to the base one at the
    // next preparation and Health could never stand above it. The clamp is
    // `afterFinalPhase`, which `AzerothActor#prepareData` runs once the phase has
    // landed. Nothing below reads the value against the maximum: `dying` asks
    // whether it is 0, which an upper clamp never moves.

    // Corruption. Thresholds are a function of the number and are never stored
    // (D-457, D-458). There is deliberately no total: tracks never sum.
    this.corruptionState = trackStates(this.corruption);
    // The rungs in force, as rows: derived, never documents (D-596).
    this.derivedEffects = derivedThresholds(this.corruptionState);
    // What the rungs do (10 §4 to §6, §9; 2026-09-06): read here, applied
    // below where each number is made. Nothing stored.
    const rungs = corruptionEffects(this.corruptionState);
    this.corruptionEffects = rungs;
    this.healingReduction = rungs.healingReduction;
    this.vulnerable = [...rungs.vulnerable];
    // What the Signatures on what is WORN add up to (08 §20, D-692). Read
    // here, applied below beside the numbers each of them belongs to.
    const signature = signatureEffects([...(this.parent?.items ?? [])], bearer);
    this.signatureEffects = signature;

    // Damage types the character is Immune to: none from the tracks; the
    // conditions the body refuses are a separate list. **AND A TALENT'S** (04's
    // Frozen Core: *You are Immune (Frost)*; D-775).
    this.immune = damageImmunitiesFor(talentRows);
    // **EVERY LINE ADDS TO WHAT IS THERE** (D-691's own scar). This key is
    // derived rather than stored, so an `initial`-phase Active Effect that
    // wrote one would land before this method and a plain assignment would
    // erase it - which is exactly how a bound wolf lost its Armor Point.
    // 10's rungs and 08 §20's Signatures both append, and neither can silence
    // the other.
    // **AND WHAT A TALENT REFUSES** (04's Unyielding: *you are immune to the
    // Prone condition*; D-772): the door `toggleStatusEffect` already refuses at.
    const steadfast = steadfastFor(talentRows);
    this.conditionImmunities = [...new Set([
      ...(this.conditionImmunities ?? []),
      ...rungs.immune,
      ...signature.conditionImmunities,
      ...steadfast.immune
    ])];
    this.damageRatingBonus = rungs.damageBonus;
    // **WHAT ADDS TO THE DAMAGE, BY LANE AND BY TYPE** (04, D-711 phase 2).
    // Two lanes - an attack and a spell - and one key per damage type plus
    // `all`, every one zero: a `final`-phase Active Effect adds to them
    // (`system.damageBonus.spell.arcane`), and the attack and cast doors read
    // `all` plus the school. Derived, never stored.
    //
    // **MERGED ONTO WHAT IS THERE, never assigned flat** (D-691's own scar):
    // the `initial` phase lands before this method and an assignment would
    // write an effect's own point back out again.
    //
    // **A CREATURE'S `damageBonus` IS A SCALAR** (`NpcData`, D-643), which is
    // why the readers guard on the type: one key, two shapes, and
    // `system.damageBonus ?? 0` on a character used to be an object.
    const damageLanes = () => Object.fromEntries(["all", ...Object.keys(AZEROTH.damageTypes)].map(k => [k, 0]));
    const heldBonus = typeof this.damageBonus === "object" && this.damageBonus ? this.damageBonus : {};
    // **THE TYPED LANES** (D-777; the lead: *"Different damage types in one attack
    // are possible"*): what an effect adds to EVERY blow of a lane AS ITS OWN TYPE
    // - Arcane Power's `typed.spell.arcane` - read by `spell-bonus.mjs
    // #typedLaneExtras` as a second amount on the blow. One key per damage type,
    // no `all`: a typed amount always names its type. Merged, never assigned.
    const typedLanes = () => Object.fromEntries(Object.keys(AZEROTH.damageTypes).map(k => [k, 0]));
    const heldTyped = typeof heldBonus.typed === "object" && heldBonus.typed ? heldBonus.typed : {};
    this.damageBonus = {
      attack: { ...damageLanes(), ...(heldBonus.attack ?? {}) },
      spell: { ...damageLanes(), ...(heldBonus.spell ?? {}) },
      // **AN ATTACK IN A SHAPESHIFT FORM** (04's Berserk, D-771): a third map
      // only the attack door reads, and only while `inShapeshiftForm` holds -
      // an Active Effect cannot ask whether its bearer is in a form.
      form: { ...damageLanes(), ...(heldBonus.form ?? {}) },
      typed: {
        attack: { ...typedLanes(), ...(heldTyped.attack ?? {}) },
        spell: { ...typedLanes(), ...(heldTyped.spell ?? {}) }
      }
    };
    this.fatigueFloor = rungs.fatigueFloor;
    // Fatigue that does not clear (10 §5): the stored number reads no lower.
    if (typeof this.fatigue === "number" && this.fatigue < rungs.fatigueFloor) this.fatigue = rungs.fatigueFloor;

    // Schools and the pairings they trip (02 §10).
    this.schools = schoolsFor(classItems);
    this.hostilePairings = hostilePairings(classItems);

    // Carrying, in BAG SLOTS (05 *Speed and movement*, 08 §11; D-735, D-736).
    // Size comes from the race item; Medium until one is equipped.
    //
    // **A CHARACTER STOPPED COUNTING POUNDS.** `system.carried` and
    // `system.carryCapacity` are gone from this model; a creature in 14 keeps
    // both, because 05 still gives it its Strength score in pounds ten times
    // over and `NpcData` reads exactly that.
    const race = this.parent?.items?.find(i => i.type === "race") ?? null;
    // A shape's size is the block's (D-769): the token, moving through a space
    // and being moved read it. **CARRYING DOES NOT** (the lead, 2026-10-03:
    // *"Druid's own carry"*): the bag slots below read the race's size and the
    // character's OWN Strength, so a shift neither empties nor grows the bags.
    const ownSize = race?.system?.size ?? DEFAULT_SIZE;
    const size = physical?.size ?? ownSize;
    this.size = size;
    // **PACK HOBGOBLIN IS READ INLINE, HERE.** It was a `multiply` change in
    // the `final` phase, which lands after this whole method - so it doubled
    // the number the sheet printed and moved neither the load state, nor the
    // Speed part, nor any refusal. `carryFactor` is the one place the
    // doubling lives now, and it doubles the base rather than what a
    // container or a mount adds (02 §5's own words).
    const talents = (this.parent?.items ?? []).filter(i => i.type === "talent").map(i => ({
      identifier: i.system?.identifier, className: i.system?.className,
      race: i.system?.race, taken: i.system?.taken
    }));
    const base = baseCapacity({ strMod: this.abilities.str.own?.mod ?? this.abilities.str.mod, size: ownSize, factor: carryFactor(talents) });
    // The whole derivation, once. NOTHING IS STORED: where a thing sits is
    // worked out every preparation, so a container taken off can never leave
    // anything hidden inside it and a legacy world reads its overflow in
    // words rather than losing what is over.
    const bags = ledger([...(this.parent?.items ?? [])], base);
    this.bagSlots = { base, capacity: bags.capacity, used: bags.used, over: bags.over, state: bags.state };
    // 05's two rungs, read in slots: the Speed part below is unchanged.
    this.load = bags.state;

    // Armor: the equipped suit's category sets every Armor Point, and a Cut
    // moves them (08 §8). Only leather adds Defense (D-452).
    //
    // **IN A SHAPE THE SUIT AND THE SHIELD MELD** (the lead: *"Melds;
    // Signatures count"*, D-769): the block's Armor Points replace the suit's
    // and `apBonus`, and the suit's Speed cost, its Encumbering and its Banes go
    // with it. What is worn still GRANTS - its affixes above and its Signature
    // below (Stormrage Raiment's points per tier) - and Thick Hide's `final`
    // change lands on these numbers.
    const suit = melded ? null : this.parent?.items?.find(i => i.type === "armor" && i.system?.equipped && !i.system?.shield);
    const shield = melded ? null : this.parent?.items?.find(i => i.type === "armor" && i.system?.equipped && i.system?.shield);
    const category = suit?.system?.category ?? "none";
    const cuts = suit?.system?.cuts ?? [];
    const effects = suitEffects(category, cuts, { shield: Boolean(shield) });
    this.ap = physical ? { body: physical.ap.body, head: physical.ap.head, limb: physical.ap.limb } : effects.armorPoints;
    // A named suit prints one Armor Point number and Body is the one that
    // matters (D-632): its margin over the category, a Reinforced prefix and
    // a shield's own points all ride on `apBonus`.
    const apBonus = (suit?.system?.apBonus ?? 0) + (shield?.system?.apBonus ?? 0);
    if (apBonus) this.ap = { ...this.ap, body: (this.ap.body ?? 0) + apBonus };
    // **ARMOR POINTS SCALED BY THE BEARER** (Stormrage Raiment, 08 §20; D-696):
    // *a Druid wearing it adds Armor Points equal to their tier in any form
    // they take.* The gate - the class and the form - was judged when
    // `signature` was built above, off the same `bearer` every other Signature
    // reads, so the points are here only while the Druid is shapeshifted. They
    // land on the BODY, where §20's printed **AP** and every `apBonus` already
    // do, and they ADD to the suit's rather than replacing them.
    if (signature.armorPointsPerTier) {
      this.ap = { ...this.ap, body: (this.ap.body ?? 0) + signature.armorPointsPerTier * (this.tier ?? 1) };
    }
    this.encumbering = effects.encumbering;
    // An Encumbering weapon worn (08 §5, 2026-09-06): Speed down 5, a Bane on
    // Stealth. A melded weapon is in nobody's hand (D-769).
    const wornWeapons = wornWeaponEffects((melded ? [] : (this.parent?.items ?? []))
      .filter(i => i.type === "weapon" && i.system?.equipped === true).map(i => i.system?.traits ?? []));
    this.armorBanes = [...effects.banes, ...wornWeapons.banes.filter(b => !effects.banes.includes(b))];

    // Speed (05 §10, D-621): the race's own, the suit's cost or gift, and
    // Muffled at Greater grade buying Encumbering's cost back. The parts are
    // kept for the banner's tooltip. Entangled, Prone, Slowed and an
    // injury's reduction reach this in the `final` Active Effect phase, so
    // it must exist by now.
    //
    // **A SHAPE MOVES AT ITS BLOCK'S PACE** (D-769): the block's own Speed is
    // the first part - `block`, 14 §1's pace, which is what it is - with what is
    // carried; the melded suit costs and gives nothing.
    this.speedParts = physical
      ? blockSpeedParts({ blockSpeed: physical.speed ?? race?.system?.speed ?? undefined, load: this.load })
      : speedParts({
        raceSpeed: race?.system?.speed ?? null,
        armorSpeed: effects.speed,
        encumbering: effects.encumbering === true,
        grants: grantsOn(suit, bearer),
        load: this.load
      });
    // Undeath's Speed cost, the track's "in total" (10 §6).
    if (rungs.speed) this.speedParts.push({ key: "corruption", value: rungs.speed });
    if (wornWeapons.speed) this.speedParts.push({ key: "weapon", value: wornWeapons.speed });
    // **`+N Speed` FROM WHAT IS WORN** (08 §20, 2026-09-10): a Signature's own
    // grant sentence, in feet. A PART rather than a term in the sum, so it
    // stacks with Encumbering and with the load exactly as every other part
    // does and the banner's tooltip says where it came from.
    if (worn.scalars.speed) this.speedParts.push({ key: "grant", value: worn.scalars.speed });
    this.speed = speedFrom(this.speedParts);
    // **A SPEED THAT CANNOT BE REDUCED** (04's Unyielding; D-772): what the
    // parts that ADD come to, alone. Held here against a suit's cost, a load and
    // a rung, and again in `afterFinalPhase`, where Slowed, an injury's drop and
    // an area's land. **Entangled's *Your Speed is 0* is NOT held** (A1): whether
    // *cannot be reduced* reaches a condition that SETS the Speed is a QUESTION
    // for the lead, so the movement door still stops an Entangled Paladin.
    this.speedUnreducible = steadfast.speedFloor === true;
    this.speedFloor = this.speedUnreducible ? speedFrom(this.speedParts.filter(p => (Number(p?.value) || 0) >= 0)) : null;
    if (this.speedUnreducible) this.speed = Math.max(this.speed, this.speedFloor);
    // **A FLIER'S FLYING PACE IS THE TIER'S** (14 §1, D-530) while the shape
    // flies, at the character's own tier, and a shape that does not fly flies
    // nowhere (D-769). In memory only: `flyingSpeed` is the GM's stored field,
    // no input on the sheet writes it, and leaving the shape reads it again.
    if (physical) this.flyingSpeed = physical.flies ? flyingPace(this.tier) : null;
    // Dying is Health at 0 (06 SS8): derived, never stored.
    this.dying = (this.health?.value ?? 0) <= 0;

    // **WHAT SOMEBODY ELSE'S SIGNATURE TAKES OFF EVERY BLOW** (the Bulwark of
    // Tyr's Hand, 08 §20; D-696). Derived and never stored, so it exists here
    // as a number for `effects/auras.mjs`' `final`-phase change to ADD to -
    // `final` because a derived key moves in `final` (D-668), and the change
    // would otherwise land before this line and be written back out (D-691).
    // `AzerothActor#applyDamage` is what spends it.
    this.damageReduction = Math.max(0, this.damageReduction ?? 0);
    // **WHAT AN ALLY'S AURA ADDS AFTER THE WARD, BY SCHOOL** (04's Avenging
    // Bulwark, D-755). Zero in every school so the aura's `final`-phase
    // `upgrade` has a number to compare against - `upgrade` over nothing writes
    // nothing (14.367's `_applyChangeUpgrade`) - and MERGED onto what is there,
    // never assigned flat (D-691's scar). `targetSnapshots` carries it and
    // `resolveDamage` spends it.
    const heldArmour = typeof this.schoolArmor === "object" && this.schoolArmor ? this.schoolArmor : {};
    this.schoolArmor = { ...emptySchoolArmor(), ...heldArmour };
    // **AND THE BOONS AN ALLY'S AURA HAS LAID** (02 §7's Aura of Resolve,
    // D-755): `laidBaneRows`' twin, a FLAG on the effect and never a change,
    // because a Boon is dice (CLAUDE.md §6). The roll dialog reads it.
    this.auraBoonRows = auraBoonRows(this.parent?.effects ?? []);
    // **AND WHAT AN AREA LAYS WHILE IT STANDS THERE** (07, D-757): Insect
    // Swarm's Bane on Attack Tests and Rimebind's on every Test - flags, never
    // spent, which the roll dialog reads beside the laid Banes - Graveblight's
    // halved healing, which every healing door reads, and Tidecall's free
    // stand, which the Prone toggle reads.
    this.auraBaneRows = auraBaneRows(this.parent?.effects ?? []);
    this.healingHalved = auraHalvesHealing(this.parent?.effects ?? []);
    // **AND A BLOW THAT LEFT IT RECOVERING NONE** (04's Mortal Strike; D-772):
    // the mark's flag on an effect, read by every healing door.
    const blocked = healingBlockedBy(this.parent?.effects ?? []);
    this.healingBlocked = blocked.blocked;
    this.healingBlockedBy = blocked.by;
    this.standsFree = auraStandsFree(this.parent?.effects ?? []);

    // Defense = 10 + Dex modifier + armor + shield + talents (05), and what is
    // worn grants (08 §20, 2026-09-10 - the lead's dodge and defense ratings).
    //
    // **AN ASSIGNMENT IS RIGHT HERE AND `+=` WOULD BE WRONG**, which is the
    // opposite of the creature's line and worth saying: `defense` is not in
    // this schema, so nothing has written `this.defense` before this statement
    // and there is no effect's point to preserve. An Active Effect on Defense
    // is a `final`-phase change by `consumables.mjs#phaseFor`'s rule - a
    // derived number moves in `final` - so it lands after this method and adds
    // to what is here. `this.abilities.dex.mod` already carries the `initial`
    // phase's own delta, which is where D-691's scar would otherwise bite.
    //
    // **A SHAPE'S DEFENSE IS THE BLOCK'S** (D-769), which already holds the
    // beast's own Dexterity; what is worn still grants.
    this.defense = physical && Number.isFinite(physical.defense)
      ? physical.defense + worn.scalars.defense
      : 10 + this.abilities.dex.mod + effects.defense + worn.scalars.defense;

    // Initiative is never rolled (D-256): it is a static number the side order
    // is compared on. `initiativeFor` rather than `10 +` written a second time,
    // and the bonus is what is worn (08 §20's grant, 2026-09-10);
    // `AzerothCombatant#derivedInitiative` reads this number, so the tracker
    // and the sheet cannot disagree.
    this.initiative = initiativeFor({ dexMod: this.abilities.dex.mod, bonus: worn.scalars.initiative });

    // **THE ATTACK TEST'S OWN BONUS** (08 §20's `+N Attack`, 2026-09-10). It
    // sits beside the number rather than inside it because a character's attack
    // modifier is composed at the door out of an ability and Proficiency -
    // there is no stored `attackBonus` to raise - and `attackWithDialog` and
    // the Parry both add this line. The creature's model carries the same key
    // for the same reason (D-691).
    this.attackBonus = worn.scalars.attack;

    // Resolve refreshes on a Long Rest (05).
    this.resolve = 3 + this.tier;

    // Spell DC = 10 + casting ability modifier + Proficiency (05). Null for a
    // character whose classes cast nothing.
    const casting = classItems.find(c => c.castingAbility)?.castingAbility ?? null;
    this.spellDC = casting ? 10 + this.abilities[casting].mod + this.proficiency : null;

    // Ward by school, from the Ward grants on what is worn (08 SS6, D-607).
    // A grant rides on `flags.azeroth-rpg.grants` (a generated item) or on the
    // affix item's own flag (the affix worn as a thing). Derived, never stored.
    this.ward = wardFor((this.parent?.items ?? []).map(i => ({
      equipped: i.system?.equipped === true, grants: grantsOn(i, bearer)
    })));
    // A rung's Ward joins the worn (10 §6's Shadow; §9's Fel and Shadow).
    for (const [school, n] of Object.entries(rungs.ward)) this.ward[school] = (this.ward[school] ?? 0) + n;
    // Metamorphosis's *Ward 3 (Fel or Shadow)* (02 §7, D-769), the school
    // chosen when the form was taken.
    if (shape?.ward?.school && shape.ward.value > 0) {
      this.ward[shape.ward.school] = (this.ward[shape.ward.school] ?? 0) + shape.ward.value;
    }
    // **THE SCHOOL NAMED AT A LONG REST** (04's Blessed Plate: *You gain Ward 1
    // per rank against it*; D-772), its fixed half. Warded Plate's share of the
    // Armor Points waits for `afterFinalPhase`.
    const named = this.parent?.getFlag?.("azeroth-rpg", PLATE_FLAG) ?? null;
    if (named && typeof named === "object") {
      for (const [school, n] of Object.entries(plateWards(talentRows, { named, part: "fixed" }).ward)) {
        this.ward[school] = (this.ward[school] ?? 0) + n;
      }
    }
    // Kept for `afterFinalPhase`, which reads them after the phase (D-772).
    this.plateTalents = talentRows;
  }

  /**
   * **WHAT LANDS AFTER CORE'S `final` ACTIVE EFFECT PHASE** (D-768): the Health
   * clamped to the maximum as the effects have left it. Called by
   * `AzerothActor#prepareData` straight after `Actor#prepareData` applies the
   * phase (14.367 client/documents/actor.mjs:436); core gives a system model no
   * hook of its own there.
   *
   * Toughness adds to `system.health.max` in that phase, so a clamp in
   * `prepareDerivedData` cut the Health to the BASE maximum on every
   * preparation. Clamped here, a warrior at rank 3 holds 6 above it. Any other
   * `final`-phase change to the maximum - a GM's own effect - is held the same
   * way.
   */
  afterFinalPhase() {
    this.health.value = Math.min(this.health.value, this.health.max);
    // **WHAT D-772's TALENTS READ ONCE THE EFFECTS HAVE LANDED.** Unyielding's
    // *Your Speed cannot be reduced*: Slowed, an injury's drop and an area's -10
    // are `final`-phase changes, so the floor is held again here.
    if (this.speedUnreducible && Number.isFinite(this.speedFloor)) this.speed = Math.max(this.speed ?? 0, this.speedFloor);
    // Warded Plate's *a third of your Armor Points, rounded down* (half at rank
    // 2), off the Body Armor Points every effect has moved by now.
    const named = this.parent?.getFlag?.("azeroth-rpg", PLATE_FLAG) ?? null;
    if (named && typeof named === "object" && Array.isArray(this.plateTalents)) {
      const share = plateWards(this.plateTalents, { named, bodyAP: this.ap?.body ?? 0, part: "armor" });
      for (const [school, n] of Object.entries(share.ward)) this.ward[school] = (this.ward[school] ?? 0) + n;
    }
  }

  /**
   * The class items backing `system.classes[]`, in array order, each carrying
   * the character's own entry for that class.
   *
   * THE ENTRY'S LEVEL HAS TO TRAVEL WITH THE CLASS. 02 §10 runs the second
   * class one tier behind the first, and Mana comes off a band table, so a
   * Mage 9 / Priest 4 has two different Mana pools. Returning the class item's
   * system data alone lost that, and every pool was sized off the character's
   * level instead.
   *
   * A class entry whose item is missing is dropped, so this is not
   * index-aligned with `system.classes[]` - which is why the entry is merged
   * in here rather than read back by index at the far end.
   */
  #classItems() {
    const items = this.parent?.items;
    if (!items) return [];
    return this.classes
      .map(entry => ({ entry, item: items.get(entry.itemId) }))
      .filter(({ item }) => item?.type === "class")
      .map(({ entry, item }, index) => ({
        ...item.system,
        // THE SECOND CLASS'S LEVEL IS A RULE, NOT A FIELD (02 §10). It runs one
        // tier behind the character, floored at tier 1, so it is derived here
        // rather than read off whatever the GM typed into the entry.
        level: index === 0 ? this.level : secondaryLevel(this.level),
        storedLevel: entry.level,
        itemId: entry.itemId,
        // 02 §6 adds the casting ability modifier to Mana (D-636). Read off
        // the class's own casting ability, so a Mage/Priest sizes each pool
        // by its own attribute.
        castingMod: item.system?.castingAbility ? (this.abilities?.[item.system.castingAbility]?.mod ?? 0) : 0
      }));
  }

}
