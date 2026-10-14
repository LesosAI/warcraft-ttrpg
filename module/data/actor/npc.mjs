/**
 * The NPC data model — 14-BESTIARY's block, as D4 §10.2 prints it.
 *
 * The field order is the chapter's and the chapter is authoritative (D-512):
 * a number originating in 14 — Health, Defense, AP, Ward, an attack's Bonus —
 * is stated there once and this model is built from it. A number originating
 * elsewhere — a weapon's Rating in 08, a trait definition — is referenced.
 *
 * Two shapes here look like mistakes and are not:
 *
 *  - **Armor Points are nullable per location.** A creature without a head or
 *    limbs cannot be called-shot to one (06 §2), and an ooze prints a Body line
 *    alone. `null` means "has no such location"; `0` means "has one, unarmored".
 *  - **Both pools are always present**, even for a creature with neither
 *    (D-509). The sheet draws an em-dash in the slot so every stat block has
 *    one shape and the GM's eye lands in the same place.
 */

import { AZEROTH } from "../../config.mjs";
import { abilityModifier } from "../../rules/abilities.mjs";
import { trackStates } from "../../rules/corruption.mjs";
import { carryCapacity, flyingPace, loadState } from "../../rules/size.mjs";
import { carriedTotal } from "../../rules/weight.mjs";
import { blockSpeedParts, speedFrom } from "../../rules/speed.mjs";
// How fast a creature swims by 14's own words: the law the movement budget reads (D-757).
import { swimMultiplier } from "../../rules/movement.mjs";
import { addArmorPoints, wornArmorPoints, wornGrants, wornWard } from "../../rules/carried-gear.mjs";
import { creaturePools } from "../../rules/bestiary.mjs";
import { choiceField, descriptionField, optionalNumberField, sourceField } from "../common/fields.mjs";
import { migrateNpcSource } from "../../migrations/0.10.0-creators.mjs";
import { wardMapOf, wardSchoolsNamed } from "../../rules/ward.mjs";
import { isThinned } from "../../rules/swarm.mjs";
// What an ally's aura lays on this creature (D-755).
import { auraBaneRows, auraBoonRows, auraHalvesHealing, auraStandsFree, emptySchoolArmor } from "../../rules/auras.mjs";
import { cleanAutomation, passiveEffects } from "../../rules/ability-automation.mjs";
import { signatureEffects } from "../../rules/signatures.mjs";
import { emptyByTestKind, laidBaneRows, laidBaneTotals, laidBoonRows } from "../../rules/banes.mjs";
import { laidBaneFlags, laidBoonFlags } from "../../effects/banes.mjs";
// A heal Mortal Strike's blow blocks (04, D-772): the character's own reading.
import { healingBlockedBy } from "../../rules/no-healing.mjs";
import { nearbyCreatures } from "../../effects/passives.mjs";
// 05's temporary Health, its stored value cleaned where present (D-777).
import { cleanTempSource } from "../../rules/temporary-health.mjs";

/**
 * An ability's automation (D-647), in `rules/class-features`' vocabulary:
 * every value a `choices`, every number optional, `kind: "none"` the
 * absence. A stored value outside a vocabulary is nulled by `migrateData`
 * rather than refusing the creature.
 */
function automationField() {
  return new fields.SchemaField({
    kind: new fields.StringField({ required: true, blank: false, initial: "none", choices: () => Object.keys(AZEROTH.abilityKinds) }),
    action: choiceField(AZEROTH.actions),
    cost: new fields.SchemaField({ pool: choiceField(AZEROTH.npcPoolKinds), amount: optionalNumberField({ min: 0 }) }),
    casting: new fields.BooleanField({ initial: false }),
    dc: optionalNumberField({ min: 0 }),
    uses: new fields.SchemaField({ max: optionalNumberField({ min: 0 }), value: optionalNumberField({ min: 0 }), per: choiceField(AZEROTH.abilityUsesPer) }),
    heal: optionalNumberField({ min: 0 }),
    damage: new fields.SchemaField({ amount: optionalNumberField({ min: 0 }), type: choiceField(AZEROTH.damageTypes) }),
    resist: choiceField(AZEROTH.resiliences),
    attack: new fields.SchemaField({
      bonus: optionalNumberField(), damage: optionalNumberField({ min: 0 }),
      traits: new fields.ArrayField(new fields.StringField(), { initial: [] })
    }),
    area: new fields.StringField({ required: true, blank: true, initial: "" }),
    inflicts: new fields.SchemaField({ condition: choiceField(AZEROTH.conditions), value: optionalNumberField({ min: 1 }), until: choiceField(AZEROTH.untilKinds) }),
    spell: new fields.StringField({ required: true, blank: true, initial: "" }),
    note: new fields.StringField({ required: true, blank: true, initial: "" }),
    // Why an entry is still prose (D-691): recorded, so the census can print
    // the remainder by name instead of it vanishing.
    reason: new fields.StringField({
      required: true, blank: true, initial: "",
      choices: () => ["", ...Object.keys(AZEROTH.abilityReasons)]
    }),
    // What stands rather than being pressed (D-691). Read on EVERY kind: an
    // entry that both swims and Slows what it hits keeps its button and its
    // senses both.
    passive: new fields.SchemaField({
      // 08 §6 grant sentences, read by `rules/grants.mjs#parseGrant`.
      grants: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      // A1 conditions plus `AZEROTH.refusalExtras`.
      refuses: new fields.ArrayField(
        new fields.StringField({ choices: () => [...Object.keys(AZEROTH.conditions), ...Object.keys(AZEROTH.refusalExtras)] }),
        { initial: [] }
      ),
      senses: new fields.ArrayField(new fields.StringField({ choices: () => Object.keys(AZEROTH.creatureSenses) }), { initial: [] }),
      when: choiceField(AZEROTH.passiveWhen),
      near: new fields.SchemaField({
        name: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
        feet: optionalNumberField({ min: 0 }),
        count: optionalNumberField({ min: 1 })
      })
    }),
    // More bodies on the field, placed from the card (D-691).
    summon: new fields.SchemaField({
      entry: new fields.StringField({ required: true, blank: true, initial: "" }),
      count: optionalNumberField({ min: 1 }),
      side: choiceField(AZEROTH.summonSides, { initial: "summoner", nullable: false }),
      from: choiceField(AZEROTH.summonFrom, { initial: "nextRound", nullable: false })
    }),
    // Regeneration at the start of each of the creature's turns (D-691).
    tick: new fields.SchemaField({
      heal: optionalNumberField({ min: 0 }),
      when: choiceField(AZEROTH.passiveWhen),
      // A damage type: withheld where it has taken this since its last turn.
      unless: choiceField(AZEROTH.damageTypes)
    })
  });
}

/** Every ability row's descriptor made valid before the schema reads it (D-647). */
export function migrateAutomationSource(source) {
  if (!source || typeof source !== "object") return source;
  for (const key of ["creatureAbilities", "bossActions"]) {
    if (!Array.isArray(source[key])) continue;
    source[key] = source[key].map(row => (row && typeof row === "object" ? { ...row, automation: cleanAutomation(row.automation) } : row));
  }
  return source;
}

/**
 * A creature's Ward stored as the pair `{value, school}` (before D-644)
 * becomes the `{school: n}` map, in place; a map passes through cleaned.
 * Runs before validation, where a `validateKey` would otherwise drop the
 * pair's keys and the Ward with them.
 */
export function migrateWardSource(source) {
  if (!source || typeof source !== "object" || !("ward" in source)) return source;
  source.ward = wardMapOf(source.ward);
  return source;
}

const fields = foundry.data.fields;

export class NpcData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      source: sourceField(),

      // The creature's full illustration (D-688). The TOKEN is `img` — the
      // sidebar, the browser and the banner all draw a small square, which a
      // 1024x1536 plate cannot fill without losing the figure — and this is
      // what the banner's portrait opens. Blank where 14 has no art, which is
      // also every creature a GM builds in the generator; the sheet draws the
      // affordance only where it is set.
      art: new fields.FilePathField({ categories: ["IMAGE"], required: true, nullable: false, blank: true, initial: "" }),

      // --- the identity run (D4 §10.2), in printed order ---
      weightClass: choiceField(AZEROTH.weightClasses, { initial: "standard", nullable: false }),
      size: choiceField(AZEROTH.sizes, { initial: "medium", nullable: false }),
      creatureType: choiceField(AZEROTH.creatureTypes, { initial: "humanoid", nullable: false }),
      // `Undead (Mindless)` — the parenthetical that Mind Blast reads.
      typeMarker: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
      // Only where the creature belongs to one of 02 §5's eleven peoples (D-532).
      race: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
      // `—` on a Boss, which is why this is nullable rather than 0. A Chaff is
      // a quarter of a share and a Soldier half (13 §5), so never an integer
      // field: `optionalNumberField` is one, and it refused the pack's 0.25
      // for a version (D-637).
      threatShare: new fields.NumberField({ required: false, nullable: true, integer: false, min: 0, initial: null }),
      tier: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 4 }),
      // Names the track this creature exposes, where it carries one (D-460).
      corruption: choiceField(AZEROTH.corruptionTracks),
      // On every Beast (D-174): what a Ranger's Companion bond Tests against.
      handlingDC: optionalNumberField({ min: 0 }),
      // On every Boss and on nothing else (D-528). `—` for a Boss holding no
      // fixed ground; 14 §12's index is this binding read the other way.
      dungeon: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),

      // --- the defense table: seven rows, fixed order, none omitted ---
      health: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        max: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        // 05's temporary Health (D-777), the character's own field on the other
        // actor type: a creature shielded by a priest takes the blow on it first.
        // 14 prints none, so the bestiary pack carries 0 on every block.
        temp: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      defense: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
      // null = no such location. An ooze reads Body alone.
      ap: new fields.SchemaField({
        body: optionalNumberField({ min: 0 }),
        head: optionalNumberField({ min: 0 }),
        limb: optionalNumberField({ min: 0 })
      }),
      // An absent Ward prints `—` and is never omitted; the absence is
      // load-bearing (D-490). Ward runs 1 to 4 on ordinary creatures by tier,
      // and anything above 4 takes an Immune keyword instead (D-072). The
      // map is the character's shape, a school to its Ward (D-644); the book
      // prints one school and a built creature may hold more. `validateKey`
      // drops a stray key in silence, so `migrateData` reshapes the retired
      // `{value, school}` pair before it gets here.
      ward: new fields.TypedObjectField(
        new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        { initial: {}, validateKey: key => key in AZEROTH.schools }
      ),
      // A swarm (13 §4, D-646): how many of what, or null for one creature.
      // The chapter's Swarm paragraph rides beside it, the rider 14 prints.
      swarm: new fields.SchemaField({
        members: optionalNumberField({ min: 2 }),
        of: new fields.StringField({ required: false, nullable: true, initial: null })
      }),
      swarmNote: descriptionField(),
      // What a bond lays on the block's attacks (D-643): `attacks[]` is an
      // array an effect cannot reach, so the bonus and Sunder sit beside it.
      damageBonus: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      sunders: new fields.BooleanField({ initial: false }),
      speed: new fields.NumberField({ required: true, integer: true, initial: 30, min: 0 }),
      // Printed beside the ground pace: `30 ft · 120 ft flying` (D-530).
      flies: new fields.BooleanField({ initial: false }),
      // 08 §15 gives a trained mount 50 feet and 06 §11 hands a rider the
      // beast's Speed, so a mounted block prints BOTH - `30 ft · 50 ft
      // mounted`. `parseSpeed` read the ground pace and threw the rest away,
      // so the Huntress rode nothing (the lead, 2026-09-07). Unlike flying,
      // this is the block's own number rather than the tier's.
      mountedSpeed: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null, min: 0 }),
      initiative: new fields.NumberField({ required: true, integer: true, initial: 10 }),
      abilities: new fields.SchemaField(
        Object.fromEntries(Object.keys(AZEROTH.abilities).map(k => [k,
          new fields.SchemaField({
            // `—` for a slot the creature does not have: a Mindless thing
            // carries no Int and no Cha.
            value: optionalNumberField({ min: 1, max: 30 })
          })
        ]))
      ),

      // --- attacks, then the spells it casts ---
      attacks: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ required: true, blank: false }),
        bonus: new fields.NumberField({ required: true, integer: true, initial: 0 }),
        // A dash where the shot carries the damage (D-406).
        damage: optionalNumberField({ min: 0 }),
        // 08 §5 names; an italicised ability defined in this entry is allowed.
        traits: new fields.ArrayField(new fields.StringField(), { initial: [] }),
        // Melee is assumed and carries no distance (D-531).
        range: optionalNumberField({ min: 0 })
      }), { initial: [] }),
      spells: new fields.SchemaField({
        dc: optionalNumberField({ min: 0 }),
        names: new fields.ArrayField(new fields.StringField(), { initial: [] })
      }),

      // --- abilities, then Boss Actions where held ---
      // An ability states its rule ON THE BLOCK and never defers it (D-533):
      // a racial trait is printed in the third person with 02's numbers.
      creatureAbilities: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ required: true, blank: false }),
        description: descriptionField(),
        // What Use does (D-647); `kind: "none"` is prose only.
        automation: automationField()
      }), { initial: [] }),
      bossActions: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ required: true, blank: false }),
        description: descriptionField(),
        // A `×2` option costs two, the only time two are spent after one turn.
        cost: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 2 }),
        automation: automationField()
      }), { initial: [] }),
      // 14 §1: *a creature whose stat block lists Boss Actions holds the number
      // printed with the list, each round. [...] They refresh at the top of the
      // round and unspent ones are lost.* `max` is the label's own N, stamped
      // by the parser; `value` is what is left this round. Null on a creature
      // that lists none, which is every block but the Bosses (D-691).
      bossPoints: new fields.SchemaField({
        value: optionalNumberField({ min: 0 }),
        max: optionalNumberField({ min: 0 })
      }),

      // --- the keyword table: seven rows, fixed order, `—` never omitted ---
      // Skills at their Ranks (02 §8's names, 1 to 15). A key the roster
      // lacks is dropped at clean; a value that is not a number refuses the
      // document, which is why `migrateData` coerces first (D-637).
      skills: new fields.TypedObjectField(
        new fields.NumberField({ required: true, integer: true, min: 1, max: AZEROTH.RANK_MAX, initial: 1 }),
        { initial: {}, validateKey: key => key in AZEROTH.skills }
      ),
      resilience: new fields.ArrayField(
        new fields.StringField({ choices: () => Object.keys(AZEROTH.resiliences) }),
        { initial: [] }
      ),
      // 06 §4's damage types as keys, the seven schools and Physical (D-637).
      immune: new fields.ArrayField(
        new fields.StringField({ choices: () => Object.keys(AZEROTH.damageTypes) }),
        { initial: [] }
      ),
      vulnerable: new fields.ArrayField(
        new fields.StringField({ choices: () => Object.keys(AZEROTH.damageTypes) }),
        { initial: [] }
      ),
      // A1 conditions only.
      inflicts: new fields.ArrayField(
        new fields.StringField({ choices: () => Object.keys(AZEROTH.conditions) }),
        { initial: [] }
      ),
      momentum: new fields.SchemaField({
        name: choiceField(AZEROTH.momentumTypes),
        value: optionalNumberField({ min: 0 }),
        max: optionalNumberField({ min: 0 })
      }),
      power: new fields.SchemaField({
        name: choiceField(AZEROTH.powerTypes),
        value: optionalNumberField({ min: 0 }),
        max: optionalNumberField({ min: 0 })
      }),

      // The purse in copper (08 §2's coin, D-422), beside the keyword table
      // rather than in it: **14 PRINTS NO PURSE.** 13 § says *08-EQUIPMENT puts
      // an Epic at the end of something, or in the hands of somebody who has
      // decided to trust the party*, and what a creature is carrying is a
      // world-level GM act rather than anything the chapter states - which is
      // why the bestiary pack gains nothing from this field and every entry
      // reads 0. `helpers/coins.mjs` is the only formatter (D-672).
      coin: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),

      // Closes the block: one paragraph, always present (D-515).
      behavior: descriptionField(),
      // After the block: lore, then Tactics, then Ecology.
      lore: descriptionField(),
      tactics: descriptionField(),
      ecology: descriptionField()
    };
  }

  /**
   * Reshape legacy source before the schema cleans it: the keyword rows'
   * case and the skills' shape (D-637). Verified against the shipped V14
   * source: `TypeDataField#_cleanType` calls `migrateDataSafe`, so this runs
   * before validation, which is the only place a stored `Holy` can be
   * lowercased before the `choices` refuse the document.
   */
  static migrateData(source) {
    migrateNpcSource(source);
    migrateWardSource(source);
    migrateAutomationSource(source);
    // 05's temporary Health (D-777), cleaned where it is present and nowhere else.
    cleanTempSource(source);
    return super.migrateData(source);
  }

  prepareBaseData() {
    super.prepareBaseData();
    for (const [key, ability] of Object.entries(this.abilities)) {
      // `—` stays null rather than becoming a modifier of -5.
      ability.mod = ability.value === null ? null : abilityModifier(ability.value);
      ability.label = AZEROTH.abilities[key];
    }
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    // A creature's Proficiency Bonus is 1 + its tier (14 §1), already baked
    // into every printed attack Bonus. It is exposed for Skill Tests: a Test
    // is attribute + this + the Rank shown, and an unlisted skill is attribute
    // plus this alone.
    this.proficiency = 1 + this.tier;

    // Set by tier, not by the creature (D-530).
    this.flyingSpeed = this.flies ? flyingPace(this.tier) : null;

    // One body for many (13 §4, D-646): Thinned strictly below half.
    this.isSwarm = (this.swarm?.members ?? 0) >= 2;
    this.thinned = this.isSwarm && isThinned(this.health);

    // A creature that casts carries a Power value in place of an em-dash
    // (14 §1), and that Power is what a spell costs (D-647): the one pool,
    // in the shape `castSpell` reads off a character.
    // EVERY creature holds both pools (2026-09-07). 13 §5 publishes a Power
    // row for a Boss and nothing else, so 123 of the 164 had no Power at all
    // and none had Momentum, and an ability written to spend either had
    // nothing to spend. `creaturePools` supplies the floor and says in its own
    // comment that the numbers are the tool's; a block that states a pool
    // keeps what it states.
    const pools = creaturePools(this);
    this.powerMax = pools.power;
    this.momentumMax = pools.momentum;
    // **A POOL NOTHING STORES A VALUE FOR STANDS FULL** (D-705). The floor
    // above gives 123 of the 164 a Power their block never printed, and their
    // stored `power.value` is null — read as 0 that Power could never be
    // spent and nothing could ever fill it, because BOTH rest handlers key on
    // the stored `power.max` and skip the same 123. So a spell given to a
    // Kobold refused with *not enough Mana* against a pool the sheet drew as
    // `0 / 4`. A value that has been spent is stored, zero included, so this
    // fires once and never undoes a spend.
    //
    // MOMENTUM IS NOT SEEDED: 05 §11 GAINS it, and a creature that walks into
    // a fight with 10 Momentum is a different game.
    if (this.power.value === null || this.power.value === undefined) this.power.value = pools.power;
    this.powers = pools.power > 0
      ? [{ itemId: null, name: this.power?.name ?? "mana", value: this.power?.value ?? 0, max: pools.power }]
      : [];
    this.momenta = [{ itemId: null, name: this.momentum?.name ?? "momentum", value: this.momentum?.value ?? 0, max: pools.momentum }];

    // 14 §1 states the Boss DC once and no block repeats it (D-539).
    this.isBoss = this.weightClass === "boss";
    this.bossDC = this.isBoss ? (AZEROTH.BOSS_DC[this.tier] ?? null) : null;
    this.bossActionCount = this.isBoss ? (AZEROTH.BOSS_ACTIONS[this.tier] ?? null) : null;
    // The points held each round: the block's own printed number, else the
    // tier's. `AzerothCombat#_onStartRound` refills them and loses the rest.
    this.bossPointsMax = this.bossPoints?.max ?? (this.bossActions?.length ? this.bossActionCount : null);

    // ---- what the standing passives do (D-691) --------------------------
    // DERIVED, NEVER DOCUMENTS, the way corruption's rungs are (D-654): an
    // Active Effect cannot be created during data preparation, and a `when`
    // that reads the tokens beside the creature has to re-derive on every
    // preparation rather than wait for somebody to toggle it. What each grant
    // does lands on the number it names, below - a derived number after the
    // base it is worked out from, which is the `final` phase's rule read in
    // the one place a creature has.
    //
    // EVERY LINE ADDS TO WHAT IS ALREADY THERE, and never recomputes from
    // `_source`. The source-based version was written first, for idempotence,
    // and it CLOBBERED EVERY ACTIVE EFFECT ON THE SAME FIELD: the `initial`
    // phase lands before this runs, so Hardy Companion's +1 Armor Point on a
    // bound wolf was written back out again (2026-09-09). A passive adds where
    // an effect adds, and both are as idempotent as core's own preparation.
    const rows = [...(this.creatureAbilities ?? []), ...(this.bossActions ?? [])];
    const passives = passiveEffects(rows, {
      health: this.health,
      // Only measured where a gate asks for it: this walks every token on the
      // scene, and data preparation runs on every render.
      nearby: rows.some(r => r?.automation?.passive?.when === "nearAlly") && this.parent
        ? nearbyCreatures(this.parent)
        : null
    });
    this.passives = passives;
    this.refuses = passives.refuses;
    this.senses = passives.senses;

    // ---- and what the SIGNATURES on what it carries do (08 SS20, D-692) ----
    // A CREATURE CARRIES ITEMS TOO. `npcAttackWithDialog` has merged the
    // Signatures into the blow since the roll door was wired, so a creature
    // holding a named blade already crits on its 19 - and NOTHING composed the
    // standing half, so the same creature got no refusal, no grant and no tick
    // from the same item. The character's model has read this since the day the
    // aggregate existed; this is the same three lines on the other actor type.
    //
    // The gate is the bearer's own state, `AzerothActor#signatureState`, which
    // answers for a creature as readily as for a character - a `class` clause
    // fails closed on something with no class, which is right.
    //
    // WHAT IT IS HOLDING AND WHO IS HOLDING IT are read ONCE, here. The grant
    // pass further down reads the same two, so the standing grants, the
    // Signatures and the Armor Points cannot disagree about either.
    const items = [...(this.parent?.items ?? [])];
    const bearer = this.parent?.signatureState ?? {};
    const signature = signatureEffects(items, bearer);
    // The whole aggregate, because five readers already key on this exact path
    // on a character and every one of them takes an actor: the turn tick
    // (`AzerothCombat#_signatureTicks`), the healing a giver adds
    // (`applyHealing`), the Corruption a point is reduced by, the spell damage
    // one school gains, and the Overview column. Setting it is what moves all
    // five onto creatures at once.
    this.signatureEffects = signature;
    // **EVERY LINE ADDS TO WHAT IS THERE** and never recomputes from `_source`
    // (D-691's own scar): the `initial` phase lands before this method, so a
    // plain assignment writes an Active Effect's own point back out again.
    this.conditionImmunities = [...new Set([
      ...(this.conditionImmunities ?? []),
      ...passives.conditionImmunities,
      ...signature.conditionImmunities
    ])];
    // **`refuses` IS THE BLOCK'S OWN ROW** and stays the creature's: 14 §1
    // prints what the creature IS, and a helm it happens to be carrying is not
    // that. `conditionImmunities` above is the ENFORCEMENT door
    // (`toggleStatusEffect`), which is where a carried thing belongs.
    //
    // **AND THE DAMAGE RATING IS NOT ADDED HERE.** Every one of the fourteen
    // Signature grants in the packs is `+N Damage Rating`, and
    // `npcAttackWithDialog` already adds `weaponEffects.damageRating` — which
    // is the merge's, so it carries the Signature's — on top of
    // `system.damageBonus`. Landing it here as well would double it on every
    // blow, and the doubling would look like the bond's bonus.
    if (passives.defense) this.defense += passives.defense;
    if (passives.initiative) this.initiative += passives.initiative;
    if (passives.speed) this.speed = Math.max(0, this.speed + passives.speed);
    // What a bond lays on the attacks is the same field, so a passive's
    // +1 Damage Rating reaches `npcAttackWithDialog` where the bond's does.
    if (passives.damageRating) this.damageBonus += passives.damageRating;
    // The block's attack Bonus is inside an array an effect cannot reach, so
    // the standing bonus sits beside it and the attack door adds it.
    this.attackBonus = passives.attack;
    for (const [key, points] of Object.entries(passives.abilities)) {
      const ability = this.abilities[key];
      if (!ability || ability.value === null || ability.value === undefined || !points) continue;
      ability.value += points;
      ability.mod = abilityModifier(ability.value);
    }
    for (const [school, points] of Object.entries(passives.ward)) {
      if (points) this.ward[school] = (this.ward[school] ?? 0) + points;
    }
    if (passives.armorPoint) {
      for (const key of Object.keys(this.ap)) {
        if (this.ap[key] !== null && this.ap[key] !== undefined) this.ap[key] += passives.armorPoint;
      }
    }
    // **WHAT AN AURA TAKES OFF EVERY BLOW** (08 §20's Bulwark of Tyr's Hand,
    // D-696). `AzerothActor#applyDamage` is one method over both actor types,
    // so the key exists on both or the reduction is a silent no-op on one of
    // them - which is D-681's shape exactly. Derived, never stored, and set
    // here so `effects/auras.mjs`' `final`-phase change has a number to add to.
    // A creature on the holder's side in a fight is an ally (D-755), so an
    // aura reaches it; 14's own auras are still D-691's open item O-97.
    this.damageReduction = Math.max(0, this.damageReduction ?? 0);
    // What an ally's aura adds after the Ward, by school, and the Boons it has
    // laid (04's Avenging Bulwark, 02 §7's Aura of Resolve; D-755) - the
    // character's two lines, on the other actor type, so the dialog and the
    // target snapshot ask one question of either.
    const heldArmour = typeof this.schoolArmor === "object" && this.schoolArmor ? this.schoolArmor : {};
    this.schoolArmor = { ...emptySchoolArmor(), ...heldArmour };
    this.auraBoonRows = auraBoonRows(this.parent?.effects ?? []);
    // What an area lays while it stands there (07, D-757), the character's
    // three lines: the Banes the dialog reads, halved healing, a free stand.
    this.auraBaneRows = auraBaneRows(this.parent?.effects ?? []);
    this.healingHalved = auraHalvesHealing(this.parent?.effects ?? []);
    // **A BLOW THAT LEFT IT RECOVERING NONE** (04's Mortal Strike, D-772): a
    // troll's Regeneration as much as anybody's heal, read by every door.
    const blocked = healingBlockedBy(this.parent?.effects ?? []);
    this.healingBlocked = blocked.blocked;
    this.healingBlockedBy = blocked.by;
    this.standsFree = auraStandsFree(this.parent?.effects ?? []);
    // The Boons and Banes the roll dialog reads, in the character's shape.
    this.skillBoons = passives.boons.skills;
    this.skillBanes = passives.banes.skills;
    this.testBoons = passives.boons.tests;
    this.testBanes = passives.banes.tests;

    // ---- AND WHAT IT IS CARRYING (08 §6, §8, §11, §20; the lead's N1) ------
    // **GEAR ADDS TO THE BLOCK.** A worn suit's Armor Points and every 08 §6
    // grant sentence stack on top of what 14 prints. The block's own numbers
    // are never replaced: they ORIGINATE in 14 (D3 §7) and the same section
    // gives Foundry *current state and computation*, which is what lets a ring
    // move a number without the block and the sheet disagreeing.
    //
    // `NpcData` never imported `rules/grants.mjs` at all, so a ring granting
    // `+2 Defense` dropped on a Kobold landed NOWHERE - right code with no
    // caller, on the other actor type (D-681).
    //
    // **EVERY LINE HERE ADDS**, for the reason the passive block above states
    // twice: the `initial` Active Effect phase lands before this method, so an
    // assignment writes an effect's own point back out again (D-691, whose
    // scar is in this file). The character's model may ASSIGN `ap`, `defense`
    // and `initiative` because not one of the three is in ITS schema and
    // nothing has written them yet; all three are STORED on a creature and
    // every one of them has just been moved by a standing passive.
    const worn = wornGrants(items, bearer);
    // The whole bag, as the character carries it: `roll-dialog.mjs#snapshotOf`
    // reads `system.grants.testBoonSources` and `.testBaneSources` off
    // whichever actor is rolling, so setting this is what puts a worn Boon on
    // a KIND of Test onto a creature's dialog. Kept APART from `testBoons`
    // above, which is the creature's own standing passive: two bags, because
    // the dialog raises two lines with two labels - 14 says *a standing
    // ability of this creature* and 08 §6 says which thing you are wearing.
    this.grants = worn;

    // The attribute family (08 §6's *of the Bear*). The score keeps 14's own
    // number and the grant lands on the TOTAL, which is the character's shape
    // and matters more here: the NPC sheet draws `value` in an EDITABLE input,
    // so a grant written into it would be submitted back onto the block and
    // never come off with the ring.
    for (const [key, ability] of Object.entries(this.abilities)) {
      const points = worn.abilities[key] ?? 0;
      ability.bonus = points;
      ability.sources = worn.abilitySources[key] ?? [];
      // `—` stays `—`: nothing worn gives a Mindless thing an Intelligence.
      if (ability.value === null || ability.value === undefined) {
        ability.total = null;
        continue;
      }
      ability.total = ability.value + points;
      // Taken from the TOTAL rather than left where `prepareBaseData` put it.
      // `mod` is what every reader consumes - a Skill Test, a Resilience Test,
      // an attack - and it is also how an `initial`-phase change to the score
      // reaches them at all: an elixir's +2 Strength raised a creature's score
      // and left its modifier exactly where it was, which is D-668's fault
      // read on the other actor type.
      ability.mod = abilityModifier(ability.total);
    }

    // Spellpower by school (08 §6's suffix, §9's Augments).
    // `workflows.mjs#castSpell` reads `actor.system.spellpower?.[school]` off
    // whichever actor casts, so this is the line that puts the points onto a
    // creature's spell. The creature's OWN passives grant it too and nothing
    // read those either - `passiveEffects` has returned `spellpower` since
    // D-691 and no line in this model consumed it.
    this.spellpower = { ...(this.spellpower ?? {}) };
    for (const bag of [passives.spellpower, worn.spellpower]) {
      for (const [school, n] of Object.entries(bag ?? {})) {
        if (n) this.spellpower[school] = (this.spellpower[school] ?? 0) + n;
      }
    }

    // A Boon or a Bane on a NAMED skill (08 §6). Appended to the creature's own
    // standing rows rather than replacing them: `snapshotOf` reads one bag per
    // skill and both sources belong in it, by name.
    this.skillBoons = { ...(this.skillBoons ?? {}) };
    this.skillBanes = { ...(this.skillBanes ?? {}) };
    for (const [skill, names] of Object.entries(worn.boons)) {
      this.skillBoons[skill] = [...(this.skillBoons[skill] ?? []), ...names];
    }
    for (const [skill, names] of Object.entries(worn.skillBanes)) {
      this.skillBanes[skill] = [...(this.skillBanes[skill] ?? []), ...names];
    }

    // Fortitude is a point of Health (08 §6's Sturdy). `health.max` is STORED
    // on a creature - 14 prints it - so this ADDS rather than recomputing a
    // maximum from a frame the creature does not have. The creature's own
    // passive Fortitude had no reader before this line either.
    const fortitude = (passives.fortitude ?? 0) + worn.fortitude;
    if (fortitude) this.health.max += fortitude;

    // Ward by school (08 §6's suffix, §10's *Warded cloak*). ADDED to the
    // block's own row: 14 prints one school and the map holds as many as the
    // creature turns out to have (D-644).
    for (const [school, n] of Object.entries(wornWard(items, bearer))) {
      if (n) this.ward[school] = (this.ward[school] ?? 0) + n;
    }
    // **A SCHOOL AN EFFECT NAMES STARTS AT 0, NOT AT NOTHING** (D-755). The map
    // holds only the schools the block prints, and a `final`-phase change on a
    // school it lacks meets `undefined`: an `upgrade` writes nothing over it and
    // an `add` makes NaN and is refused with a warning (`NumberField#applyChange`,
    // 14.367). Tree of Life's floor names every school on every ally in reach.
    // ONLY the schools some effect names: the prepared map's shape is what the
    // generator's rework reads back, and `azeroth-rpg.generator` pins it
    // exactly for a creature no effect touches.
    const named = wardSchoolsNamed([...(this.parent?.effects ?? [])]
      .filter(e => e?.active !== false)
      .flatMap(e => e?.system?.changes ?? []));
    for (const school of named) this.ward[school] ??= 0;

    // 08 §20's own grant sentences, which is the only carrier there is: §6's
    // affix pool sells no Defense, Attack, Speed or Initiative at all, and the
    // lead's conversion of the Classic finds turns a dodge rating into
    // `+N Defense`, a hit rating into `+N Attack` and a haste rating into
    // `+N Speed`. **Every one of these is `+=` where the character's is an
    // assignment**, and `grant-doors.test.mjs` is what says so out loud.
    if (worn.scalars.defense) this.defense += worn.scalars.defense;
    if (worn.scalars.initiative) this.initiative += worn.scalars.initiative;
    if (worn.scalars.attack) this.attackBonus += worn.scalars.attack;

    // Armor Points from what is WORN: 08 §8's category row moved by its Cuts,
    // a named suit's or a shield's `apBonus`, and a Signature's points by tier
    // (Stormrage Raiment, D-696), which the character consumed and the creature
    // ignored. `addArmorPoints` is where the null rule lives - a location the
    // creature does not have stays null however much armor is dropped on it,
    // because `hasLocation` is what 06 §2's called shots read and an ooze in a
    // helmet must not sprout a head to aim at. Written INTO the schema's own
    // object rather than over it, so nothing else holding a reference to
    // `system.ap` is left looking at the pre-armor map.
    Object.assign(this.ap, addArmorPoints(this.ap, wornArmorPoints(items, {
      armorPointsPerTier: signature.armorPointsPerTier,
      tier: this.tier
    })));

    // Carrying (05 §10, 08 §11; D-675). A creature stores `size` as a
    // first-class field, which is better than a character - that one reads it
    // off the race item. The Strength is the block's own score, exactly as the
    // character reads `value` rather than `total`, so the two actor types
    // answer the same way.
    //
    // **A `—` STRENGTH HAS NO CARRY LIMIT.** `carryCapacity` answers null and
    // `loadState` never calls such a creature Encumbered: 05 has no rule for
    // what a thing with no Strength score can carry, and a capacity of zero
    // would have Overloaded a Mindless ooze with one dagger.
    this.carryCapacity = carryCapacity(this.abilities.str.value, this.size);
    // What is inside a container is free and the container weighs its own row.
    this.carried = carriedTotal(items);
    this.load = loadState(this.carried, this.abilities.str.value, this.size);

    // Speed as PARTS (CLAUDE.md §4: *encumbrance is a Speed part, not a
    // fifteenth condition*). 14's own pace is the first part and it already
    // carries whatever the `initial` phase and the standing passives made of
    // it; the load and a `+N Speed` grant are parts beside it, so the banner's
    // tooltip can say where each foot went.
    this.speedParts = blockSpeedParts({
      blockSpeed: this.speed,
      load: this.load,
      grantSpeed: worn.scalars.speed
    });
    this.speed = speedFrom(this.speedParts);
    // A sense that is a movement mode is a number: 08 has no swim speed of its
    // own and 14 writes it against the creature's own Speed. Taken AFTER the
    // parts, because a creature dragging three hundred pounds does not swim at
    // its unencumbered pace. `swimMultiplier` is the one reading of *swims at
    // its Speed* and *at twice its Speed*: the movement budget reads it too,
    // off the Speed as the final phase leaves it (the final review of D-757).
    const swims = swimMultiplier(passives.senses);
    this.swimSpeed = swims > 0 ? this.speed * swims : null;

    // A Bane laid on this creature by somebody ELSE (06 §6's Pummel; 08 §20's
    // Gorehowl and two Classic finds; D-693). Kept apart from `testBanes`,
    // which is the creature's own standing passive and is never spent: a laid
    // Bane goes when the next Test of its kind is rolled. The character's
    // model composes the identical three lines, so the dialog asks one
    // question of either actor type. **ADDITIVE**, as everything here is.
    const laid = laidBaneRows(laidBaneFlags(this.parent));
    this.laidBaneRows = laid;
    this.laidBanes = { ...emptyByTestKind(), ...(this.laidBanes ?? {}) };
    for (const [kind, n] of Object.entries(laidBaneTotals(laid))) this.laidBanes[kind] += n;
    // And a Boon somebody else laid (04's Blessing, D-772), the same reading.
    this.laidBoonRows = laidBoonRows(laidBoonFlags(this.parent));

    // Party level is DERIVED from tier, never written (D-535). Printed in
    // 14 §12's index and nowhere else.
    this.partyLevel = { 1: "1-4", 2: "5-10", 3: "11-15", 4: "16-20" }[this.tier] ?? null;

    // Which locations can be called-shot at all (06 §2).
    this.locations = Object.entries(this.ap)
      .filter(([, v]) => v !== null)
      .map(([k]) => k);

    // A creature carries a corruption keyword rather than tracks of its own,
    // but the GM may run one that has them.
    this.corruptionState = this.corruption ? trackStates({}) : null;
  }

  /** Whether this creature can be called-shot to a location (06 §2). */
  hasLocation(location) {
    return this.ap[location] !== null && this.ap[location] !== undefined;
  }
}
