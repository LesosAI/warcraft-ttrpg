/**
 * The spell item model (07 §9).
 *
 * "The order is fixed because the Foundry compendium reads these entries field
 * by field" — 07 §9's own words. The order is:
 *
 *   Mana, Action, Range, Target, Duration, Damage, Test, Prerequisite, Classes
 *
 * and a field a spell does not use is left off. D-319 gave an older order
 * ending in `Restricted`; D-324 and D-345 replaced that with Prerequisite and
 * Classes, and 07 §9 is the current form.
 */

import { AZEROTH } from "../../config.mjs";
import {
  AREA_CHECK_ON, AREA_REMAINS_WHEN, AREA_TICK_KINDS, AREA_TICK_WHO, AREA_UNTIL, cleanAreaTick
} from "../../rules/area-ticks.mjs";
import { cleanAreaGround } from "../../rules/area-ground.mjs";
import { TICK_KINDS, TICK_UNTIL, TICK_WHEN, cleanTick } from "../../rules/ticks.mjs";
import { cleanSplash } from "../../rules/splash.mjs";
import {
  choiceField,
  descriptionField,
  identifierField,
  optionalNumberField,
  sourceField
} from "../common/fields.mjs";

const fields = foundry.data.fields;

export class SpellData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      identifier: identifierField(),
      // One lore paragraph, then the effect (D-319). The lore is exempt from
      // the rules register; the effect is not.
      description: descriptionField(),
      effect: descriptionField(),
      source: sourceField(),

      // A spell belongs to one of the seven schools (D-296). School sets the
      // list a class may learn from and the Ward that meets it.
      school: choiceField(AZEROTH.schools, { nullable: false, initial: "arcane" }),
      // Five tiers. Tier 5 is FOUND, never granted by level (D-297).
      tier: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 5 }),

      // --- 07 §9's field run, in order ---
      mana: optionalNumberField({ min: 0 }),
      action: choiceField(AZEROTH.actions, { initial: "action" }),
      range: new fields.StringField({ required: false, blank: true, initial: "" }),
      target: new fields.StringField({ required: false, blank: true, initial: "" }),
      duration: new fields.SchemaField({
        // Instant, Sustained, or a span of time (D-317).
        kind: new fields.StringField({
          required: false, nullable: true, blank: false, initial: null,
          choices: () => ["instant", "sustained", "timed"]
        }),
        text: new fields.StringField({ required: false, blank: true, initial: "" })
      }),
      damage: new fields.SchemaField({
        // A spell's Damage Rating. Its Success Level does NOT add to it
        // (D-330) — SL gates riders and nothing else.
        rating: optionalNumberField({ min: 0 }),
        school: choiceField(AZEROTH.schools),
        // **HALF ON A PASSED TEST** (the lead: *"Build it everywhere"*): 07's *and
        // half of that, rounded down, on a success*, read off the entry's own
        // sentence by the parser (`rules/resisted.mjs#halvesOnPass`). The card's
        // Apply lands the half on a creature whose Resist on that card passed.
        // Migration 0.12.26 stamps a world's spells off their pack copies.
        half: new fields.BooleanField({ initial: false }),
        // **NONE OF IT ON A PASSED TEST** (the B8a pass): 07's Rimebind, *On a failure it
        // takes 2 Frost damage* - the failure deals the Rating and a pass deals nothing,
        // read off the entry's own sentence by the parser (`rules/resisted.mjs#noneOnPass`).
        // The card's Apply lands nothing on a creature whose Resist on that card passed.
        // Migration 0.12.27 stamps a world's spells off their pack copies.
        onFail: new fields.BooleanField({ initial: false }),
        // **THE DAMAGE BYPASSES ARMOR AND WARD** (the B8a2 pass): 07's *The target takes 20
        // Nature damage, bypassing armor and Ward* on Stormfury and its eight kin, read off the
        // entry's own sentence by the parser (`rules/bypass.mjs#bypassesArmorAndWard`). The
        // card's mitigation takes neither Armor Points nor Ward off it
        // (`rules/mitigation.mjs#resolveDamage`'s `bypass`). Migration 0.12.28 stamps a
        // world's spells off their pack copies.
        bypass: new fields.BooleanField({ initial: false })
      }),
      test: new fields.SchemaField({
        // The Resilience the target makes against your Spell DC, if any.
        resilience: choiceField(AZEROTH.resiliences)
      }),
      // What the effect says it heals (D-625), read off the prose by
      // rules/healing.mjs: a number on the cast, a number at the start of
      // each of the target's turns, or a share of the damage dealt. 07
      // never raises healing by SL or tier, so the number is the number.
      heal: new fields.SchemaField({
        amount: optionalNumberField({ min: 0 }),
        perTurn: optionalNumberField({ min: 0 }),
        fromDamage: new fields.StringField({ required: false, nullable: true, blank: false, initial: null, choices: ["half", "all"] })
      }),
      // A spell you must already know to learn this one. A gate, not a note:
      // a spell inherits whatever restriction its prerequisite carries.
      prerequisite: new fields.StringField({ required: false, nullable: true, blank: false, initial: null }),
      // Every class that may learn it. Derived in the book from the school
      // heading narrowed by Restricted (D-324), so it can never disagree with
      // 07 §1's access table.
      classes: new fields.ArrayField(new fields.StringField(), { initial: [] }),

      // What casting costs BEYOND the Mana (07 §8). Sixteen spells say a
      // Health price in their own effect - *Casting it costs you 2 Health* -
      // and nothing read a word of it, so Doom Bolt was free (2026-09-07).
      cost: new fields.SchemaField({
        health: optionalNumberField({ min: 0 })
      }),

      // 07 §8: a tier 5 Fel or Shadow spell accrues 1 point of Corruption on
      // its own track when cast, unresisted (10 §3). Fel is always Fel; a
      // Shadow spell puts its point on Void or on Undeath and 07 says the
      // entry names which, so the track is STORED rather than guessed. Null
      // on every other spell, and on a Shadow spell whose entry names none.
      corruption: choiceField(AZEROTH.corruptionTracks),

      prepared: new fields.BooleanField({ initial: false }),

      // What the card can do after the cast (2026-09-06), seeded off the
      // effect by rules/spell-effects.mjs and stamped by the parser: a
      // lasting effect to lay on the targets (`active` where the spell
      // lasts, the changes and statuses the words state), a Rating against a
      // target in a condition (Ice Lance), and the conditions a failed
      // Resist Test lands. Empty where the words say nothing the system can do.
      applies: new fields.SchemaField({
        active: new fields.BooleanField({ initial: false }),
        changes: new fields.ArrayField(new fields.SchemaField({
          key: new fields.StringField({ required: true, blank: false }),
          type: new fields.StringField({ required: true, blank: false, initial: "add" }),
          value: new fields.StringField({ required: true, blank: true, initial: "" })
        }), { initial: [] }),
        statuses: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { initial: [] })
      }),
      rider: new fields.SchemaField({
        statuses: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { initial: [] }),
        rating: optionalNumberField({ min: 0 }),
        mode: new fields.StringField({ required: false, nullable: true, blank: false, initial: null, choices: ["replace", "add"] })
      }),
      onFail: new fields.SchemaField({
        resilience: choiceField(AZEROTH.resiliences),
        statuses: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { initial: [] })
      }),

      // AN AREA THAT STRIKES AT THE START OF A TURN (D-756), read off the
      // effect by `rules/area-ticks.mjs#readAreaTick` and stamped by the parser
      // on every spell - the whole shape, empty where the spell has none, so
      // the pack's key order is the model's. `rules/area-ticks.mjs` documents
      // each key; `AzerothCombat#_areaTicks` is what reads it at a turn.
      areaTick: new fields.SchemaField({
        who: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", ...AREA_TICK_WHO] }),
        damage: new fields.SchemaField({
          rating: optionalNumberField({ min: 0 }),
          school: choiceField(AZEROTH.schools)
        }),
        heal: optionalNumberField({ min: 0 }),
        against: new fields.ArrayField(new fields.SchemaField({
          kinds: new fields.ArrayField(new fields.StringField({ required: true, blank: false, choices: [...AREA_TICK_KINDS] }), { initial: [] }),
          // The subject a kind clause names for itself - Hallowed Ground's
          // *undead or demon enemy* - or "" where it names none (the lead,
          // 2026-09-26). A row stored before the key loads as "".
          who: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", ...AREA_TICK_WHO] }),
          rating: optionalNumberField({ min: 0 }),
          school: choiceField(AZEROTH.schools),
          heal: optionalNumberField({ min: 0 }),
          instead: new fields.BooleanField({ initial: false })
        }), { initial: [] }),
        centre: new fields.StringField({ required: true, blank: false, initial: "area", choices: ["area", "self"] }),
        feet: optionalNumberField({ min: 0 }),
        onEnter: new fields.BooleanField({ initial: false }),
        test: new fields.SchemaField({
          resilience: choiceField(AZEROTH.resiliences)
        }),
        difficult: new fields.BooleanField({ initial: false }),
        lasts: new fields.SchemaField({
          rounds: optionalNumberField({ min: 1 })
        }),
        // D-757: what entering does, the Tests made in the area, what stands on
        // a creature while it remains, the growth and the retaliation. Every
        // leaf present on every spell, in `emptyAreaTick`'s order.
        enter: new fields.SchemaField({
          rating: optionalNumberField({ min: 0 }),
          school: choiceField(AZEROTH.schools),
          once: new fields.BooleanField({ initial: false }),
          rounds: optionalNumberField({ min: 1 }),
          sl: optionalNumberField()
        }),
        checks: new fields.ArrayField(new fields.SchemaField({
          on: new fields.StringField({ required: true, blank: false, initial: "turn", choices: [...AREA_CHECK_ON] }),
          resilience: choiceField(AZEROTH.resiliences),
          where: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", "centre"] }),
          gate: new fields.StringField({ required: true, blank: true, initial: "" }),
          exempt: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", "caster"] }),
          fail: new fields.SchemaField({
            rating: optionalNumberField({ min: 0 }),
            school: choiceField(AZEROTH.schools),
            statuses: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { initial: [] }),
            bane: new fields.StringField({ required: true, blank: true, initial: "" }),
            until: new fields.StringField({ required: true, blank: true, initial: "", choices: [...AREA_UNTIL] }),
            lose: new fields.BooleanField({ initial: false }),
            kinds: new fields.ArrayField(new fields.SchemaField({
              kinds: new fields.ArrayField(new fields.StringField({ required: true, blank: false, choices: [...AREA_TICK_KINDS] }), { initial: [] }),
              not: new fields.BooleanField({ initial: false }),
              statuses: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { initial: [] })
            }), { initial: [] }),
            // *On a failure it does not cross* (07's Ring of Fire and Stormwall; the B9a
            // pass): put back on its own side of the edge.
            stop: new fields.BooleanField({ initial: false })
          }),
          success: new fields.SchemaField({
            statuses: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { initial: [] }),
            until: new fields.StringField({ required: true, blank: true, initial: "", choices: [...AREA_UNTIL] }),
            // Ring of Fire's *on a success it crosses and takes 5 Fire damage* (the B9a pass).
            rating: optionalNumberField({ min: 0 }),
            school: choiceField(AZEROTH.schools)
          }),
          // **THE B9a PASS'S TWO** (the lead: *"Build the triggers"*): Frozen Rune's *The
          // first creature to enter the space* - once an area, ever - and the creatures
          // named at the cast a row spares (Ring of Fire, Blackout, The Deep). The model
          // keeps them, or a spell embedded off the pack drops them and the door that
          // reads them reads nothing.
          first: new fields.BooleanField({ initial: false }),
          spares: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", "named"] })
        }), { initial: [] }),
        remains: new fields.ArrayField(new fields.SchemaField({
          when: new fields.StringField({ required: true, blank: false, initial: "inside", choices: [...AREA_REMAINS_WHEN] }),
          who: new fields.StringField({ required: true, blank: false, initial: "creature", choices: [...AREA_TICK_WHO] }),
          kinds: new fields.ArrayField(new fields.StringField({ required: true, blank: false, choices: [...AREA_TICK_KINDS] }), { initial: [] }),
          exceptKinds: new fields.ArrayField(new fields.StringField({ required: true, blank: false, choices: [...AREA_TICK_KINDS] }), { initial: [] }),
          gear: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", "metal"] }),
          bane: new fields.StringField({ required: true, blank: true, initial: "" }),
          ward: new fields.SchemaField({
            schools: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { initial: [] }),
            amount: optionalNumberField({ min: 0 })
          }),
          boonAgainst: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { initial: [] }),
          speed: optionalNumberField(),
          healing: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", "half"] }),
          standFree: new fields.BooleanField({ initial: false })
        }), { initial: [] }),
        grows: optionalNumberField({ min: 1 }),
        excludesCaster: new fields.BooleanField({ initial: false }),
        retaliate: new fields.BooleanField({ initial: false }),
        reason: new fields.StringField({ required: true, blank: true, initial: "" })
      }),

      // WHERE THE SPELL MAKES THE GROUND DIFFICULT, AND WHETHER ITS TARGET
      // IGNORES IT (D-757), read one sentence at a time by
      // `rules/area-ground.mjs#readAreaGround` and stamped by the parser on
      // every spell. The Region behavior the GM's reconciler lays reads it off
      // the placed area's record; the laid effect's `ignoresGround` flag reads
      // `ignores`.
      areaGround: new fields.SchemaField({
        difficult: new fields.BooleanField({ initial: false }),
        lasts: new fields.SchemaField({
          rounds: optionalNumberField({ min: 1 })
        }),
        // "target": the ground at a single target, which the cast places on the creature
        // (stage 3B of the Chromatic Champion plan; `rules/area-ground.mjs#targetGroundOf`).
        from: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", "landing", "target"] }),
        ignores: new fields.BooleanField({ initial: false }),
        reason: new fields.StringField({ required: true, blank: true, initial: "" })
      }),

      // DAMAGE OR HEALING LAID ON A CREATURE THAT LANDS AT THE START OF EACH OF
      // ITS TURNS (D-770; O-144), read off the effect by `rules/ticks.mjs#readTick`
      // and stamped by the parser on every spell - the whole shape, empty where
      // the spell has none. The card's Apply lays it on the creature's effect;
      // `AzerothCombat#_turnTicks` lands it. `rules/ticks.mjs` documents each key.
      tick: new fields.SchemaField({
        kind: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", ...TICK_KINDS] }),
        type: choiceField(AZEROTH.schools),
        amount: new fields.StringField({ required: true, blank: true, initial: "" }),
        rounds: optionalNumberField({ min: 1 }),
        until: new fields.StringField({ required: true, blank: true, initial: "", choices: [...TICK_UNTIL] }),
        when: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", ...TICK_WHEN] }),
        hit: new fields.BooleanField({ initial: false }),
        sl: optionalNumberField(),
        spellpower: new fields.BooleanField({ initial: false }),
        reason: new fields.StringField({ required: true, blank: true, initial: "" })
      }),

      // WHAT THE SPELL DEALS AROUND ITS TARGET, A TEST AT A TIME (07's Stormfury: *Every
      // creature within 15 feet of it makes a Reflex Resilience Test against your Spell DC
      // or takes 10 Nature damage*; the B8a pass), read off the effect by
      // `rules/splash.mjs#readSplash` and stamped by the parser on every spell - the whole
      // shape, empty where the spell has none. `castSpell` posts each creature inside an
      // area Test card; `reason` names what stays the table's. Migration 0.12.27 stamps a
      // world's spells off their pack copies.
      splash: new fields.SchemaField({
        feet: optionalNumberField({ min: 0 }),
        rating: optionalNumberField({ min: 0 }),
        school: choiceField(AZEROTH.schools),
        resilience: choiceField(AZEROTH.resiliences),
        reason: new fields.StringField({ required: true, blank: true, initial: "" })
      })
    };
  }

  /**
   * A stored `mode` outside the enum would refuse the document; it is nulled
   * here (CLAUDE.md §15). And the area's tick is cleaned KEY BY KEY at every
   * depth (D-756): this runs over a partial update as readily as over a whole
   * document, and a guard that rebuilt `areaTick` would write nulls over every
   * key the update did not name.
   */
  static migrateData(source) {
    if (source?.rider && source.rider.mode !== undefined && source.rider.mode !== null && !["replace", "add"].includes(source.rider.mode)) source.rider.mode = null;
    if (source && typeof source === "object" && "areaTick" in source) {
      if (source.areaTick && typeof source.areaTick === "object" && !Array.isArray(source.areaTick)) cleanAreaTick(source.areaTick);
      else delete source.areaTick;
    }
    // The ground (D-757), cleaned the same way: only the keys handed in.
    if (source && typeof source === "object" && "areaGround" in source) {
      if (source.areaGround && typeof source.areaGround === "object" && !Array.isArray(source.areaGround)) cleanAreaGround(source.areaGround);
      else delete source.areaGround;
    }
    // And the creature's tick (D-770), the same way.
    if (source && typeof source === "object" && "tick" in source) {
      if (source.tick && typeof source.tick === "object" && !Array.isArray(source.tick)) cleanTick(source.tick);
      else delete source.tick;
    }
    // And the splash around the target (the B8a pass), only the keys handed in.
    if (source && typeof source === "object" && "splash" in source) {
      if (source.splash && typeof source.splash === "object" && !Array.isArray(source.splash)) cleanSplash(source.splash);
      else delete source.splash;
    }
    return super.migrateData(source);
  }

  /** Sustaining costs 1 Power at the start of each of your turns (D-355). */
  get isSustained() {
    return this.duration.kind === "sustained";
  }

  /**
   * Whether Spellpower applies. From tier 3 up, a damaging spell deals 1 more
   * damage per point of Spellpower in its school (07 §9). On a damage-over-time
   * spell it raises the ongoing damage, not the initial hit.
   */
  get takesSpellpower() {
    return this.tier >= 3 && this.damage.rating !== null;
  }
}
