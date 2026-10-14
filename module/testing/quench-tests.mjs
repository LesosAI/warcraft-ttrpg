/**
 * Quench integration test batches — run inside a live Foundry world.
 * Registration is a no-op when the Quench module is absent or disabled,
 * so this is safe to import unconditionally from the entry point.
 *
 * Batch key convention (Quench README): <package>.<identifier>
 */

import { placeArea } from "../canvas/regions.mjs";
import { AIM_PREVIEW, placeSpellArea } from "../canvas/place.mjs";
import { clearMeasuredAreas } from "../canvas/measure.mjs";
import { castSpell } from "../dice/workflows.mjs";
import { isEligible } from "../rules/careers.mjs";
import { checkClipping, checkColumns, checkNotEmpty, checkOverlap, checkText } from "./geometry.mjs";
// The talent frame's batch (D-758) builds a real Warrior through the one
// fixture factory and measures colour through the one colour module.
import { chooseControl, cleanup as cleanupFixtures, makeCharacter, openSheet, pinDie, pressTool, settle, toolButton } from "./fixtures.mjs";
import { parseColour } from "./colour.mjs";
import { sameTalent } from "../rules/talents.mjs";
// A pool's count is an input on an editable sheet (2026-09-13).
import { poolCount } from "./expectations.mjs";
import { geometryExtendedBatch, sheetMatrixBatch, dropsBatch, itemSubtypesBatch } from "./quench-phase0.mjs";
import { seamBatch } from "./quench-phase1.mjs";
import { rollDialogBatch } from "./quench-phase2.mjs";
import { configuredRollsBatch } from "./quench-phase3.mjs";
import { editingBatch } from "./quench-phase4.mjs";
import { toolsBatch } from "./quench-phase5.mjs";
import { feedbackBatch } from "./quench-phase6.mjs";
import { automationBatch } from "./quench-phase7.mjs";
import { forgeBatch } from "./quench-phase8.mjs";
import { creatorBatch } from "./quench-phase9.mjs";
import { generatorBatch } from "./quench-phase10.mjs";
import { ammunitionBatch, boundBatch, passiveBatch, talentGrantBatch } from "./quench-phase11.mjs";
import { creatorSpellsBatch, spellEffectBatch, tableBatch } from "./quench-phase12.mjs";
import { lootBatch } from "./quench-phase13.mjs";
// The offer that carries a rolled find to the players (D-721).
import { lootOfferBatch } from "./quench-phase21.mjs";
import { consumableBatch } from "./quench-phase14.mjs";
import { distanceBatch } from "./quench-phase15.mjs";
import { containerBatch } from "./quench-phase16.mjs";
import { augmentBatch } from "./quench-phase17.mjs";
import { weightBatch } from "./quench-phase18.mjs";
import { worldMapBatch } from "./quench-phase19.mjs";
import { bestiaryAutomationBatch } from "./quench-phase20.mjs";
import { overviewBatch } from "./quench-overview.mjs";
import { classicBatch } from "./quench-classic.mjs";
import { signatureBatch } from "./quench-signatures.mjs";
import { reactionBatch } from "./quench-reactions.mjs";
import { creatureGearBatch } from "./quench-npc-gear.mjs";
import { creatureSwingBatch } from "./quench-npc-swing.mjs";
import { creatureGearTabBatch } from "./quench-npc-gear-tab.mjs";
import { creatureSpellsBatch } from "./quench-npc-spells.mjs";
// 02 §6, 06 §2 and 14 §1's attack economy (D-704).
import { attacksPerRoundBatch } from "./quench-attacks.mjs";
// 02 §7's totems, planted with the ground they hold (D-708).
import { totemBatch } from "./quench-totems.mjs";
// 08 §7's school, 08 §5's Pierce, 04's damage talents and 02 §7's Finisher
// (D-711 phase 2).
import { damagePipelineBatch } from "./quench-damage.mjs";
// What the animation layer plays, and what it never does (D-727 to D-730).
import { animationBatch } from "./quench-animation.mjs";
// 05 §16 and 08 §12's food and drink at a Short Rest (D-733).
import { restBatch } from "./quench-rests.mjs";
// WoW's character pane: core's frame, the band and the hanging tabs (D-734).
import { frameBatch } from "./quench-frame.mjs";
import { bagsBatch } from "./quench-bags.mjs";
// What stands on an ally: Aura of Resolve, Avenging Bulwark, Tree of Life and
// Demonic Pact (D-755).
import { aurasBatch } from "./quench-auras.mjs";
// The Paladin's play-test: Lay on Hands and Open Hand, Consecrated Ground, and
// the areas that strike at the start of a turn (D-752, D-753, D-756).
import { paladinBatch } from "./quench-paladin.mjs";
// What an area does to who moves through it and stands in it: Difficult
// ground, entering, the Tests, the riders, Immolation's answer (D-757).
import { areasBatch } from "./quench-areas.mjs";
// A player character's token sees, and 0.12.15 turns every existing one on (D-759).
import { visionBatch } from "./quench-vision.mjs";
// An area taken off by hand ends its Sustain, and the sweep's own deletion does not (D-760).
import { areaSustainBatch } from "./quench-area-sustain.mjs";
// Overlapping moves charged once, and the feet a token has left (D-761, D-762).
import { movementBatch } from "./quench-movement.mjs";
// A pick pressed on a view that is not the board, and the aim announced (D-763).
import { pickSurfaceBatch } from "./quench-pick-surface.mjs";
// A late bookkeeping write never puts the turn back (D-765).
import { turnStampBatch } from "./quench-turn-stamp.mjs";
// The Measure control, pressed on the real scene-control bar (D-766).
import { measureBatch } from "./quench-measure.mjs";
// A pick announced as it begins and ends, and cancelled from outside (D-767).
import { pickStateBatch } from "./quench-pick-state.mjs";
// The talent plan's shared roots: rank, tier, lanes, afterBlow, Unkillable, the
// Half-Action a refusal keeps (D-768).
import { talentRootsBatch } from "./quench-talent-roots.mjs";
// A shape on one token and one sheet (02 §7, D-769).
import { shapesBatch } from "./quench-shapes.mjs";
// What a talent spends as part of an attack, and a tick laid on a creature (D-770).
import { ridersTicksBatch } from "./quench-riders-ticks.mjs";
// The Druid's thirty-six (D-771): written in Phase 3, run by the lead.
import { druidTalentsBatch } from "./quench-druid-talents.mjs";
// The Warrior's and the Paladin's thirty-six (D-772): written in Phases 4 and
// 5, run by the lead.
import { warriorTalentsBatch } from "./quench-warrior-talents.mjs";
import { paladinTalentsBatch } from "./quench-paladin-talents.mjs";
// The Ranger's and the Rogue's thirty-six (D-773): written in Phases 6 and 7,
// run by the lead.
import { rangerTalentsBatch } from "./quench-ranger-talents.mjs";
import { rogueTalentsBatch } from "./quench-rogue-talents.mjs";
// The Priest's and the Shaman's thirty-six (D-774): written in Phases 8 and 9,
// run by the lead.
import { priestTalentsBatch } from "./quench-priest-talents.mjs";
import { shamanTalentsBatch } from "./quench-shaman-talents.mjs";
// The Mage's and the Warlock's thirty-six (D-775): written in Phases 10 and 11,
// run by the lead.
import { mageTalentsBatch } from "./quench-mage-talents.mjs";
import { warlockTalentsBatch } from "./quench-warlock-talents.mjs";
// The damage door's rulings (D-777): temporary Health, a blow moved, divided or
// held at 1, and a second amount of its own type. Written in Phase B1, run by
// the lead.
import { damageDoorsBatch } from "./quench-damage-doors.mjs";
// The cross-class rulings (D-778): 02's Dispel, a creature pushed or pulled, the
// Test to break free, a second class's healing feature, a Use at any time, the
// upkeep by the entry and a Speed drop in feet. Written in Phase B2, run by the lead.
import { crossClassBatch } from "./quench-cross-class.mjs";
// The class answers (D-779): Unyielding, Fanaticism, Improved Moonfire, Undying
// Rage, Bracing, Main Gauche and the melee Parry, Overchannel Mastery, Miracle,
// Divine Aegis, Flametongue, the standing Curses, Shared Quarry and Devouring
// Plague. Written in D-779 and not run there.
import { classAnswersBatch } from "./quench-class-answers.mjs";
// The counts live in ONE place and both readers take them from there
// (CLAUDE.md §9); a second copy here went stale twice in a day.
import { PACK_COUNTS } from "./pack-counts.mjs";

export function registerQuenchTests() {
  Hooks.on("quenchReady", (quench) => {
    quench.registerBatch("azeroth-rpg.system-sanity", sanityBatch, {
      displayName: "AZEROTH: System sanity"
    });
    quench.registerBatch("azeroth-rpg.character-data", characterDataBatch, {
      displayName: "AZEROTH: Character DataModel"
    });
    quench.registerBatch("azeroth-rpg.item-data", itemDataBatch, {
      displayName: "AZEROTH: Item DataModels"
    });
    quench.registerBatch("azeroth-rpg.npc-data", npcDataBatch, {
      displayName: "AZEROTH: NPC DataModel and documents"
    });
    quench.registerBatch("azeroth-rpg.dice-and-effects", diceAndEffectsBatch, {
      displayName: "AZEROTH: Dice and Active Effects"
    });
    quench.registerBatch("azeroth-rpg.chat-cards", chatCardBatch, {
      displayName: "AZEROTH: Chat cards and workflows"
    });
    quench.registerBatch("azeroth-rpg.packs", packBatch, {
      displayName: "AZEROTH: Compendium packs"
    });
    quench.registerBatch("azeroth-rpg.sheet", sheetBatch, {
      displayName: "AZEROTH: Character sheet"
    });
    quench.registerBatch("azeroth-rpg.npc-sheet", npcSheetBatch, {
      displayName: "AZEROTH: NPC sheet and browser"
    });
    quench.registerBatch("azeroth-rpg.combat", combatBatch, {
      displayName: "AZEROTH: Side-based combat"
    });
    quench.registerBatch("azeroth-rpg.item-sheet", itemSheetBatch, {
      displayName: "AZEROTH: Item sheet"
    });
    quench.registerBatch("azeroth-rpg.regions", regionBatch, {
      displayName: "AZEROTH: Areas of effect"
    });
    quench.registerBatch("azeroth-rpg.talent-tree", talentTreeBatch, {
      displayName: "AZEROTH: Talent tree"
    });
    quench.registerBatch("azeroth-rpg.geometry", geometryBatch, {
      displayName: "AZEROTH: Sheet geometry"
    });
    quench.registerBatch("azeroth-rpg.derived-effects", derivedEffectBatch, {
      displayName: "AZEROTH: Effects reaching derived data"
    });
    quench.registerBatch("azeroth-rpg.migrations", migrationBatch, {
      displayName: "AZEROTH: Migration chain"
    });
    quench.registerBatch("azeroth-rpg.multiclass", multiclassBatch, {
      displayName: "AZEROTH: Multiclass pools"
    });
    quench.registerBatch("azeroth-rpg.usable", usableBatch, {
      displayName: "AZEROTH: Things a person clicks"
    });
    // Phase 0 of the seam plan: the instruments, in their own file.
    quench.registerBatch("azeroth-rpg.geometry-extended", geometryExtendedBatch, {
      displayName: "AZEROTH: Geometry checks, extended (break tests)"
    });
    quench.registerBatch("azeroth-rpg.sheet-matrix", sheetMatrixBatch, {
      displayName: "AZEROTH: Sheet matrix - every surface measured"
    });
    quench.registerBatch("azeroth-rpg.drops", dropsBatch, {
      displayName: "AZEROTH: Drops on every target"
    });
    quench.registerBatch("azeroth-rpg.item-subtypes", itemSubtypesBatch, {
      displayName: "AZEROTH: Item sheet, every subtype as a use"
    });
    quench.registerBatch("azeroth-rpg.seam", seamBatch, {
      displayName: "AZEROTH: The seam - rest, pools, the fight, items"
    });
    quench.registerBatch("azeroth-rpg.roll-dialog", rollDialogBatch, {
      displayName: "AZEROTH: The roll dialog"
    });
    quench.registerBatch("azeroth-rpg.configured-rolls", configuredRollsBatch, {
      displayName: "AZEROTH: Rolls with somewhere to be configured"
    });
    quench.registerBatch("azeroth-rpg.editing", editingBatch, {
      displayName: "AZEROTH: The editing surface"
    });
    quench.registerBatch("azeroth-rpg.tools", toolsBatch, {
      displayName: "AZEROTH: The tools around the sheet"
    });
    quench.registerBatch("azeroth-rpg.feedback", feedbackBatch, {
      displayName: "AZEROTH: The feedback pass"
    });
    quench.registerBatch("azeroth-rpg.automation", automationBatch, {
      displayName: "AZEROTH: The automation pass"
    });
    quench.registerBatch("azeroth-rpg.forge", forgeBatch, {
      displayName: "AZEROTH: The catalogue and the Forge"
    });
    quench.registerBatch("azeroth-rpg.creator", creatorBatch, {
      displayName: "AZEROTH: The character creator"
    });
    quench.registerBatch("azeroth-rpg.generator", generatorBatch, {
      displayName: "AZEROTH: The NPC generator"
    });
    quench.registerBatch("azeroth-rpg.ammunition", ammunitionBatch, {
      displayName: "AZEROTH: Ammunition"
    });
    quench.registerBatch("azeroth-rpg.talents", talentGrantBatch, {
      displayName: "AZEROTH: Talents on the sheet"
    });
    quench.registerBatch("azeroth-rpg.bound", boundBatch, {
      displayName: "AZEROTH: Bound creatures"
    });
    quench.registerBatch("azeroth-rpg.passives", passiveBatch, {
      displayName: "AZEROTH: Talent passives and counters"
    });
    quench.registerBatch("azeroth-rpg.table", tableBatch, {
      displayName: "AZEROTH: Grants, corruption and the table's fixes"
    });
    quench.registerBatch("azeroth-rpg.spell-effects", spellEffectBatch, {
      displayName: "AZEROTH: What a spell's card can lay"
    });
    quench.registerBatch("azeroth-rpg.creator-spells", creatorSpellsBatch, {
      displayName: "AZEROTH: The creator's spells step and shelves"
    });
    quench.registerBatch("azeroth-rpg.loot", lootBatch, {
      displayName: "AZEROTH: The loot generator"
    });
    quench.registerBatch("azeroth-rpg.loot-offer", lootOfferBatch, {
      displayName: "AZEROTH: The loot offer"
    });
    quench.registerBatch("azeroth-rpg.consumables", consumableBatch, {
      displayName: "AZEROTH: Using a consumable"
    });
    quench.registerBatch("azeroth-rpg.distance", distanceBatch, {
      displayName: "AZEROTH: Reach and range"
    });
    quench.registerBatch("azeroth-rpg.containers", containerBatch, {
      displayName: "AZEROTH: Containers and charges"
    });
    quench.registerBatch("azeroth-rpg.augments", augmentBatch, {
      displayName: "AZEROTH: Augments"
    });
    quench.registerBatch("azeroth-rpg.weight", weightBatch, {
      displayName: "AZEROTH: Weight and encumbrance"
    });
    quench.registerBatch("azeroth-rpg.world-map", worldMapBatch, {
      displayName: "AZEROTH: The world map"
    });
    quench.registerBatch("azeroth-rpg.overview", overviewBatch, {
      displayName: "AZEROTH: The Overview tab"
    });
    quench.registerBatch("azeroth-rpg.classic", classicBatch, {
      displayName: "AZEROTH: Classic dungeon and raid loot"
    });
    quench.registerBatch("azeroth-rpg.bestiary-automation", bestiaryAutomationBatch, {
      displayName: "AZEROTH: The bestiary, automated"
    });
    quench.registerBatch("azeroth-rpg.signatures", signatureBatch, {
      displayName: "AZEROTH: What a Signature does"
    });
    quench.registerBatch("azeroth-rpg.reactions", reactionBatch, {
      displayName: "AZEROTH: Parry, Block and the Bane Pummel lays"
    });
    quench.registerBatch("azeroth-rpg.npc-gear", creatureGearBatch, {
      displayName: "AZEROTH: What a creature is carrying"
    });
    quench.registerBatch("azeroth-rpg.npc-swing", creatureSwingBatch, {
      displayName: "AZEROTH: What a creature swings"
    });
    quench.registerBatch("azeroth-rpg.npc-gear-tab", creatureGearTabBatch, {
      displayName: "AZEROTH: A creature's Gear tab"
    });
    quench.registerBatch("azeroth-rpg.npc-spells", creatureSpellsBatch, {
      displayName: "AZEROTH: A creature's Spells tab"
    });
    quench.registerBatch("azeroth-rpg.attacks-per-round", attacksPerRoundBatch, {
      displayName: "AZEROTH: Attacks per round"
    });
    quench.registerBatch("azeroth-rpg.totems", totemBatch, {
      displayName: "AZEROTH: Totems planted, and the ground they hold"
    });
    quench.registerBatch("azeroth-rpg.damage", damagePipelineBatch, {
      displayName: "AZEROTH: Damage school, Pierce, talents and Finisher"
    });
    quench.registerBatch("azeroth-rpg.animation", animationBatch, {
      displayName: "AZEROTH: Animations, cues and loops"
    });
    quench.registerBatch("azeroth-rpg.rests", restBatch, {
      displayName: "AZEROTH: A Short Rest takes food or drink"
    });
    quench.registerBatch("azeroth-rpg.frame", frameBatch, {
      displayName: "AZEROTH: The character sheet's frame and tabs"
    });
    quench.registerBatch("azeroth-rpg.bags", bagsBatch, {
      displayName: "AZEROTH: Bag slots, and what will not fit"
    });
    quench.registerBatch("azeroth-rpg.auras", aurasBatch, {
      displayName: "AZEROTH: What stands on an ally"
    });
    quench.registerBatch("azeroth-rpg.paladin", paladinBatch, {
      displayName: "AZEROTH: Lay on Hands, Consecrated Ground, and areas that strike at a turn"
    });
    quench.registerBatch("azeroth-rpg.areas", areasBatch, {
      displayName: "AZEROTH: Difficult ground, and what an area does to who enters and stands in it"
    });
    quench.registerBatch("azeroth-rpg.vision", visionBatch, {
      displayName: "AZEROTH: A player character's token sees"
    });
    quench.registerBatch("azeroth-rpg.area-sustain", areaSustainBatch, {
      displayName: "AZEROTH: An area taken off by hand ends its Sustain"
    });
    quench.registerBatch("azeroth-rpg.movement", movementBatch, {
      displayName: "AZEROTH: A turn's movement, charged once, by the squares it enters, and read back"
    });
    quench.registerBatch("azeroth-rpg.pick-surface", pickSurfaceBatch, {
      displayName: "AZEROTH: A pick pressed on a view that is not the board"
    });
    quench.registerBatch("azeroth-rpg.turn-stamp", turnStampBatch, {
      displayName: "AZEROTH: A late bookkeeping write never puts the turn back"
    });
    quench.registerBatch("azeroth-rpg.measure", measureBatch, {
      displayName: "AZEROTH: The Measure control, through the real scene-control bar"
    });
    quench.registerBatch("azeroth-rpg.pick-state", pickStateBatch, {
      displayName: "AZEROTH: A pick announced as it begins and ends, and cancelled from outside"
    });
    quench.registerBatch("azeroth-rpg.talent-roots", talentRootsBatch, {
      displayName: "AZEROTH: Talent roots - rank, tier, lanes, afterBlow, Unkillable, the Half-Action"
    });
    quench.registerBatch("azeroth-rpg.shapes", shapesBatch, {
      displayName: "AZEROTH: Shapes - one effect, one token, the physical half, Ferocity, Avatar and Metamorphosis"
    });
    quench.registerBatch("azeroth-rpg.riders-ticks", ridersTicksBatch, {
      displayName: "AZEROTH: Riders on the attack dialog, and ticks laid on a creature"
    });
    quench.registerBatch("azeroth-rpg.druid-talents", druidTalentsBatch, {
      displayName: "AZEROTH: The Druid's thirty-six talents"
    });
    quench.registerBatch("azeroth-rpg.warrior-talents", warriorTalentsBatch, {
      displayName: "AZEROTH: The Warrior's thirty-six talents"
    });
    quench.registerBatch("azeroth-rpg.paladin-talents", paladinTalentsBatch, {
      displayName: "AZEROTH: The Paladin's thirty-six talents"
    });
    quench.registerBatch("azeroth-rpg.ranger-talents", rangerTalentsBatch, {
      displayName: "AZEROTH: The Ranger's thirty-six talents"
    });
    quench.registerBatch("azeroth-rpg.rogue-talents", rogueTalentsBatch, {
      displayName: "AZEROTH: The Rogue's thirty-six talents"
    });
    quench.registerBatch("azeroth-rpg.priest-talents", priestTalentsBatch, {
      displayName: "AZEROTH: The Priest's thirty-six talents"
    });
    quench.registerBatch("azeroth-rpg.shaman-talents", shamanTalentsBatch, {
      displayName: "AZEROTH: The Shaman's thirty-six talents"
    });
    quench.registerBatch("azeroth-rpg.mage-talents", mageTalentsBatch, {
      displayName: "AZEROTH: The Mage's thirty-six talents"
    });
    quench.registerBatch("azeroth-rpg.warlock-talents", warlockTalentsBatch, {
      displayName: "AZEROTH: The Warlock's thirty-six talents"
    });
    quench.registerBatch("azeroth-rpg.damage-doors", damageDoorsBatch, {
      displayName: "AZEROTH: The damage door's rulings (D-777)"
    });
    quench.registerBatch("azeroth-rpg.cross-class", crossClassBatch, {
      displayName: "AZEROTH: The cross-class rulings (D-778)"
    });
    quench.registerBatch("azeroth-rpg.class-answers", classAnswersBatch, {
      displayName: "AZEROTH: The class answers (D-779)"
    });
  });
}

function sanityBatch(context) {
  const { describe, it, assert } = context;

  describe("System registration", function () {
    it("is running as the azeroth-rpg system", function () {
      assert.equal(game.system.id, "azeroth-rpg");
    });

    it("has the character data model registered", function () {
      assert.ok(CONFIG.Actor.dataModels.character, "CONFIG.Actor.dataModels.character is missing");
    });

    it("exposes CONFIG.AZEROTH with the expected enums", function () {
      assert.ok(CONFIG.AZEROTH, "CONFIG.AZEROTH is missing");
      assert.hasAllKeys(CONFIG.AZEROTH.abilities, ["str", "dex", "con", "int", "wis", "cha"]);
      assert.hasAllKeys(CONFIG.AZEROTH.corruptionTracks, ["fel", "void", "undeath"]);
    });

    it("localizes ability and corruption labels (no missing i18n keys)", function () {
      for (const key of Object.values(CONFIG.AZEROTH.abilities)) {
        const localized = game.i18n.localize(key);
        assert.notEqual(localized, key, `Unlocalized string: ${key}`);
      }
      for (const key of Object.values(CONFIG.AZEROTH.corruptionTracks)) {
        const localized = game.i18n.localize(key);
        assert.notEqual(localized, key, `Unlocalized string: ${key}`);
      }
    });
  });
}

function characterDataBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Character actor", function () {
    /** @type {Actor} */
    let actor;

    before(async function () {
      actor = await Actor.create({ name: "Quench Test Character", type: "character" });
    });

    after(async function () {
      if (actor) await actor.delete();
    });

    it("creates with schema defaults", function () {
      const sys = actor.system;
      for (const key of ["str", "dex", "con", "int", "wis", "cha"]) {
        assert.equal(sys.abilities[key].value, 10, `abilities.${key}.value default`);
      }
      // "Wounds" was retired as a pool name (D-006); the pool is Health.
      // `max` is DERIVED, not stored: a Standard frame at level 1 with Con 10
      // is 11 + 0 + 0 (D1 section 3). The schema's initial of 10 is only what
      // the token bar reads before preparation runs.
      assert.equal(sys.health.max, 11, "Health max should be derived, not the stored placeholder");
      assert.isAtMost(sys.health.value, sys.health.max);
      // D-507: two pools, each an object, neither carrying a maximum.
      assert.equal(sys.momentum.value, 0);
      assert.equal(sys.power.value, 0);
      assert.equal(sys.fatigue, 0);
      // 05-CORE-RULES section 14: "You begin play with 3."
      assert.equal(sys.spiritTether.value, 3);
      assert.equal(sys.spiritTether.max, 3);
      // Read the tracks from config rather than a literal list. The schema derives
      // its keys from the same place, so this asserts the two agree in a live world.
      const tracks = Object.keys(CONFIG.AZEROTH.corruptionTracks);
      assert.lengthOf(tracks, 3, "expected three corruption tracks (D-456)");
      for (const track of tracks) {
        assert.equal(sys.corruption[track], 0, `corruption.${track} default`);
      }
      assert.deepEqual(sys.classes, []);
      // Derived in prepareBaseData/prepareDerivedData, never persisted.
      assert.equal(sys.abilities.str.mod, 0, "ability modifier is derived");
      assert.equal(sys.level, 1);
      assert.equal(sys.tier, 1);
      assert.equal(sys.proficiency, 2);
      assert.equal(sys.size, "medium", "Medium is the default (05 section 10)");
      // **BAG SLOTS, NOT POUNDS** (05 *Speed and movement*, D-735): a
      // character carries 16 plus their Strength modifier, and
      // `carryCapacity` left the model entirely. A creature in 14 keeps it.
      assert.equal(sys.bagSlots.base, 16, "Strength 10 carries sixteen bag slots");
      assert.isUndefined(sys.carryCapacity, "a character is still counting pounds");
      // A character with no class item holds neither pool. Null, not zero:
      // the sheet draws an em-dash for a pool nobody has (D-509).
      assert.isNull(sys.momentum.max, "no class means no Momentum cap");
      assert.isNull(sys.power.max, "no class means no Power cap");
      // Thresholds are a function of the number and are never stored, and
      // there is deliberately no total (tracks never sum).
      assert.equal(sys.corruptionState.fel.crossed, 0);
      assert.notProperty(sys.corruptionState, "total");
      assert.equal(sys.career.tier, 1);
      assert.equal(sys.xp.earned, 0);
      assert.equal(sys.xp.spent, 0);
    });

    it("stores Momentum and Power as separate pools", async function () {
      await actor.update({ "system.momentum.value": 5, "system.power.value": 12 });
      assert.equal(actor.system.momentum.value, 5);
      assert.equal(actor.system.power.value, 12);
    });

    it("stores no maximum for either pool, because the class sets the cap", function () {
      // D-507. A hardcoded max here would be a constant where 05 section 11 has
      // a lookup: 10 for Rage, Zeal and Ferocity, 5 for Quarry and Combo
      // Points. rules/progression.mjs reads the cap off the class item, so a
      // Power value of 12 above is legal for a full caster and not for a Rogue.
      const schema = actor.system.schema;
      assert.notProperty(schema.get("momentum").fields, "max", "momentum stores a max");
      assert.notProperty(schema.get("power").fields, "max", "power stores a max");
    });

    it("rejects a negative pool value at the schema layer", async function () {
      let failed = false;
      try {
        await actor.update({ "system.momentum.value": -1 });
      } catch (err) {
        failed = true;
      }
      assert.ok(failed || actor.system.momentum.value >= 0, "momentum went below zero");
    });

    it("supports up to two class entries and no more", async function () {
      await actor.update({ "system.classes": [{ itemId: null, level: 3 }, { itemId: null, level: 1 }] });
      assert.lengthOf(actor.system.classes, 2);
      assert.equal(actor.system.classes[0].level, 3, "index 0 is the primary class");

      let failed = false;
      try {
        await actor.update({
          "system.classes": [
            { itemId: null, level: 1 },
            { itemId: null, level: 1 },
            { itemId: null, level: 1 }
          ]
        });
      } catch (err) {
        failed = true;
      }
      assert.ok(failed || actor.system.classes.length <= 2, "classes[] accepted a third entry");
    });
  });
}
/** The system's own Item subtypes: an array, minus core's "base" sentinel. */
function declaredItemTypes() {
  return (game.documentTypes?.Item ?? []).filter(t => t !== "base");
}

function itemDataBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Item subtypes", function () {
    const created = [];

    after(async function () {
      // One batched delete, not seventeen sequential ones: Mocha's default
      // hook timeout is 2s and per-document deletes blew straight through it.
      const ids = created.map(d => d.id).filter(Boolean);
      if (ids.length) await Item.deleteDocuments(ids);
      created.length = 0;
    });

    it("registers a DataModel for every declared subtype", function () {
      // game.documentTypes.Item is an ARRAY of type names, and it always
      // carries core's "base" sentinel alongside the system's own subtypes.
      const declared = declaredItemTypes();
      assert.isAbove(declared.length, 0, "system.json declares no Item subtypes");
      for (const type of declared) {
        assert.ok(CONFIG.Item.dataModels[type], `no DataModel registered for Item type ${type}`);
      }
    });

    it("localizes every subtype name", function () {
      for (const type of declaredItemTypes()) {
        const key = `TYPES.Item.${type}`;
        assert.notEqual(game.i18n.localize(key), key, `Unlocalized subtype: ${key}`);
      }
    });

    it("creates one of every subtype with schema defaults", async function () {
      // Twelve sequential document creations do not fit Mocha's 2s default.
      this.timeout(15000);
      for (const type of Object.keys(CONFIG.Item.dataModels)) {
        const item = await Item.create({ name: `Quench ${type}`, type });
        assert.ok(item, `failed to create Item of type ${type}`);
        created.push(item);
      }
    });

    it("omits a field that does not apply rather than storing it empty", async function () {
      // D4 section 10.1. A bow's Damage Rating is a dash, not a zero: the shot
      // carries the damage (D-406), and null and 0 are different facts.
      const bow = await Item.create({ name: "Quench Shortbow", type: "weapon" });
      created.push(bow);
      assert.isNull(bow.system.rating, "a weapon's Rating should default to absent, not 0");
      assert.isTrue(bow.system.shotCarriesDamage);
    });

    it("derives a suit's Armor Points from its category, never storing them", async function () {
      const suit = await Item.create({
        name: "Quench Hauberk", type: "armor", system: { category: "mail" }
      });
      created.push(suit);
      assert.deepEqual(suit.system.armorPoints, { body: 4, head: 3, limb: 3 });
      assert.equal(suit.system.defense, 0, "only leather adds Defense (D-452)");
      assert.equal(suit.system.speed, -5, "mail is Encumbering");
      // Nothing is persisted: the source has no armorPoints key at all.
      assert.notProperty(suit.toObject().system, "armorPoints");
    });

    it("moves Armor Points with a Cut and refuses an illegal one", async function () {
      const closed = await Item.create({
        name: "Quench Closed Helm", type: "armor", system: { category: "mail", cuts: ["closed"] }
      });
      created.push(closed);
      assert.equal(closed.system.armorPoints.head, 4, "Closed should add a Head point");

      const bad = await Item.create({
        name: "Quench Harnessed Plate", type: "armor",
        system: { category: "plate", cuts: ["harnessed"] }
      });
      created.push(bad);
      // "Never on plate." The Cut is ignored rather than applied.
      assert.deepEqual(bad.system.armorPoints, { body: 5, head: 4, limb: 4 });
    });

    it("keeps 07 section 9's field order available on a spell", async function () {
      const spell = await Item.create({
        name: "Quench Fireball", type: "spell",
        system: { school: "fire", tier: 1, mana: 2, action: "action", damage: { rating: 5, school: "fire" } }
      });
      created.push(spell);
      const order = ["mana", "action", "range", "target", "duration", "damage", "test", "prerequisite", "classes"];
      for (const field of order) {
        assert.property(spell.system, field, `spell is missing the ${field} field`);
      }
      assert.isFalse(spell.system.takesSpellpower, "Spellpower starts at tier 3");
    });
  });

  describe("A class item drives the actor's pools (D-507)", function () {
    let actor;

    before(async function () {
      actor = await Actor.create({ name: "Quench Pool Character", type: "character" });
    });

    after(async function () {
      if (actor) await actor.delete();
    });

    it("takes the Momentum cap off the class, not off a constant", async function () {
      const [warrior] = await actor.createEmbeddedDocuments("Item", [{
        name: "Warrior", type: "class",
        system: { frame: "hardy", momentum: { name: "rage", max: 10 } }
      }]);
      await actor.update({ "system.classes": [{ itemId: warrior.id, level: 1 }] });

      assert.equal(actor.system.momentum.max, 10, "Rage caps at 10");
      assert.isNull(actor.system.power.max, "a Warrior holds no Power");
      // The cap appears nowhere in stored data -- that is the whole point.
      assert.notProperty(actor.toObject().system.momentum, "max");
    });

    it("reads a different cap off a different class", async function () {
      const [rogue] = await actor.createEmbeddedDocuments("Item", [{
        name: "Rogue", type: "class",
        system: {
          frame: "standard",
          momentum: { name: "comboPoints", max: 5 },
          power: { name: "energy", max: 10, caster: "none" }
        }
      }]);
      await actor.update({ "system.classes": [{ itemId: rogue.id, level: 1 }] });

      assert.equal(actor.system.momentum.max, 5, "Combo Points cap at 5");
      assert.equal(actor.system.power.max, 10, "Energy caps at 10");
    });

    it("lets a multiclass hold one pool from each side", async function () {
      const items = actor.items.filter(i => i.type === "class");
      const warrior = items.find(i => i.name === "Warrior");
      const [priest] = await actor.createEmbeddedDocuments("Item", [{
        name: "Priest", type: "class",
        system: {
          frame: "slight",
          power: { name: "mana", max: 20, caster: "full" },
          schools: ["holy", "shadow"],
          castingAbility: "wis"
        }
      }]);
      await actor.update({
        "system.classes": [
          { itemId: warrior.id, level: 9 },
          { itemId: priest.id, level: 5 }
        ]
      });

      // D11 section 2's worked case: Rage from the Warrior half, Mana from the
      // Priest half. There is no combined caster.
      assert.equal(actor.system.momentum.max, 10, "Rage from the Warrior half");
      assert.equal(actor.system.power.max, 20, "Mana from the Priest half");
      assert.equal(actor.system.level, 9, "character level is the highest, not the sum");
      assert.equal(actor.system.tier, 2);
      assert.equal(actor.system.proficiency, 3);
      // Frame comes from the primary class: Hardy, so 13 + Con mod + Fortitude.
      assert.equal(actor.system.health.max, 13 + 0 + 16);
      assert.includeMembers(actor.system.schools, ["holy", "shadow"]);
    });

    it("finds a hostile pairing when the schools trip one", async function () {
      const warrior = actor.items.find(i => i.name === "Warrior");
      // THE VETO IS REAL NOW. A character holds two classes (02 §10) and a
      // third is refused at _preCreate, so this fixture - which held Warrior
      // and Priest - drops to the Priest alone before the Warlock arrives.
      const priestFirst = actor.items.find(i => i.name === "Priest");
      await actor.update({ "system.classes": [{ itemId: priestFirst.id, level: 9 }] });
      const [warlock] = await actor.createEmbeddedDocuments("Item", [{
        name: "Warlock", type: "class",
        system: { frame: "slight", power: { name: "mana", max: 20, caster: "full" }, schools: ["fel", "shadow"] }
      }]);
      const priest = actor.items.find(i => i.name === "Priest");
      await actor.update({
        "system.classes": [
          { itemId: priest.id, level: 9 },
          { itemId: warlock.id, level: 5 }
        ]
      });
      // Holy and Fel. "A Paladin who takes up warlockry is possible and ruinous."
      const pairs = actor.system.hostilePairings.map(p => p.join("/"));
      assert.include(pairs, "holy/fel");
      assert.ok(warrior, "warrior item still present");
    });
  });
}
function npcDataBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("NPC block", function () {
    let ghoul;

    before(async function () {
      // D4 section 10.2's worked example, field for field.
      ghoul = await Actor.create({
        name: "Quench Plagued Ghoul",
        type: "npc",
        system: {
          weightClass: "standard", size: "medium", creatureType: "undead",
          threatShare: 1, tier: 1, corruption: "undeath",
          health: { value: 12, max: 12 },
          defense: 12,
          ap: { body: 2, head: 1, limb: 1 },
          ward: { value: 2, school: "shadow" },
          speed: 30, initiative: 10,
          abilities: {
            str: { value: 14 }, dex: { value: 14 }, con: { value: 14 },
            int: { value: 3 }, wis: { value: 10 }, cha: { value: 3 }
          },
          attacks: [
            { name: "Claws", bonus: 4, damage: 4, traits: ["Fast", "Light"] },
            { name: "Diseased bite", bonus: 4, damage: 5, traits: ["Slow"] }
          ],
          resilience: ["body"],
          vulnerable: ["holy"],
          inflicts: ["diseased"],
          behavior: "Goes for whoever bled most recently."
        }
      });
    });

    after(async function () {
      if (ghoul) await ghoul.delete();
    });

    it("carries the identity run and the defense table", function () {
      const sys = ghoul.system;
      assert.equal(sys.weightClass, "standard");
      assert.equal(sys.size, "medium");
      assert.equal(sys.creatureType, "undead");
      assert.equal(sys.threatShare, 1);
      assert.equal(sys.tier, 1);
      assert.equal(sys.corruption, "undeath");
      assert.equal(sys.health.max, 12);
      assert.equal(sys.defense, 12);
      assert.deepEqual(sys.ap, { body: 2, head: 1, limb: 1 });
      // Made with the retired pair on purpose: migrateData turns it into the map (D-644).
      assert.deepEqual(sys.ward, { shadow: 2 }, "the retired Ward pair did not become the map");
    });

    it("derives the ability modifiers D4's example prints", function () {
      // Str 14 (+2), Int 3 (-4), Wis 10 (+0), Cha 3 (-4).
      assert.equal(ghoul.system.abilities.str.mod, 2);
      assert.equal(ghoul.system.abilities.int.mod, -4);
      assert.equal(ghoul.system.abilities.wis.mod, 0);
      assert.equal(ghoul.system.abilities.cha.mod, -4);
    });

    it("gives a creature Proficiency of 1 plus its tier", function () {
      // 14 section 1. Already baked into every printed attack Bonus.
      assert.equal(ghoul.system.proficiency, 2);
    });

    it("draws both pools even for a creature with neither (D-509)", function () {
      assert.property(ghoul.system, "momentum");
      assert.property(ghoul.system, "power");
      assert.isNull(ghoul.system.momentum.name);
      assert.isNull(ghoul.system.power.name);
    });

    it("is not a Boss, so carries no Boss DC or Actions", function () {
      assert.isFalse(ghoul.system.isBoss);
      assert.isNull(ghoul.system.bossDC);
      assert.isNull(ghoul.system.bossActionCount);
    });

    it("derives the party level band from tier, never storing it", function () {
      assert.equal(ghoul.system.partyLevel, "1-4");
      assert.notProperty(ghoul.toObject().system, "partyLevel");
    });

    it("distinguishes a missing location from an unarmored one", async function () {
      // An ooze prints a Body line alone and cannot be called-shot elsewhere
      // (06 section 2). null means no such location; 0 means one, unarmored.
      const ooze = await Actor.create({
        name: "Quench Ooze", type: "npc",
        system: { creatureType: "ooze", ap: { body: 2, head: null, limb: null } }
      });
      try {
        assert.isTrue(ooze.system.hasLocation("body"));
        assert.isFalse(ooze.system.hasLocation("head"));
        assert.deepEqual(ooze.system.locations, ["body"]);
      } finally {
        await ooze.delete();
      }
    });

    it("takes a Boss's DC and Action count off its tier", async function () {
      const boss = await Actor.create({
        name: "Quench Boss", type: "npc",
        system: { weightClass: "boss", tier: 2, threatShare: null, dungeon: "Scarlet Monastery" }
      });
      try {
        // D-539 superseded D-524's flat 20: 17 / 18 / 19 / 22 by tier.
        assert.equal(boss.system.bossDC, 18);
        assert.equal(boss.system.bossActionCount, 2);
        assert.equal(boss.system.partyLevel, "5-10");
      } finally {
        await boss.delete();
      }
    });

    it("takes a flying pace from the tier, not from the creature", async function () {
      const drake = await Actor.create({
        name: "Quench Drake", type: "npc",
        system: { creatureType: "dragonkin", tier: 3, flies: true, speed: 30 }
      });
      try {
        assert.equal(drake.system.speed, 30);
        assert.equal(drake.system.flyingSpeed, 240, "tiers 3-4 fly at 240 (D-530)");
      } finally {
        await drake.delete();
      }
    });
  });

  describe("Document classes", function () {
    it("registers the system's Actor and Item classes", function () {
      assert.equal(CONFIG.Actor.documentClass.name, "AzerothActor");
      assert.equal(CONFIG.Item.documentClass.name, "AzerothItem");
    });

    it("survives repeated data preparation", async function () {
      // The V14 trap: Actor#prepareBaseData clears the Active Effect phase
      // tracker, and an override that skips super throws
      // "phase 'initial' has already completed" on the SECOND preparation --
      // never the first. Two explicit rounds is what catches it.
      const actor = await Actor.create({ name: "Quench Prepare", type: "character" });
      try {
        actor.prepareData();
        actor.prepareData();
        await actor.update({ "system.abilities.str.value": 16 });
        assert.equal(actor.system.abilities.str.mod, 3);
      } finally {
        await actor.delete();
      }
    });

    it("exposes roll data a formula can read", async function () {
      const actor = await Actor.create({
        name: "Quench Roll Data", type: "character",
        system: { abilities: { dex: { value: 16 } } }
      });
      try {
        const data = actor.getRollData();
        assert.equal(data.dex.mod, 3);
        assert.equal(data.prof, 2);
        assert.equal(data.level, 1);
      } finally {
        await actor.delete();
      }
    });

    it("applies damage through the actor, floored at zero", async function () {
      const actor = await Actor.create({ name: "Quench Damage", type: "character" });
      try {
        await actor.applyDamage(4);
        assert.equal(actor.system.health.value, 6);
        await actor.applyDamage(999);
        assert.equal(actor.system.health.value, 0, "Health never falls below 0");
      } finally {
        await actor.delete();
      }
    });
  });
}
function diceAndEffectsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("AzerothRoll", function () {
    it("is registered as a roll class", function () {
      assert.include(CONFIG.Dice.rolls.map(c => c.name), "AzerothRoll");
    });

    it("builds an even roll as a single d20", async function () {
      const roll = CONFIG.Dice.rolls[0].build({
        dc: 12,
        modifiers: [{ label: "Dexterity", value: 3 }, { label: "Proficiency", value: 2 }]
      });
      assert.equal(roll.formula, "1d20 + 3 + 2");
      await roll.evaluate();
      assert.equal(roll.total, roll.natural + 5);
      assert.equal(roll.dc, 12);
    });

    it("rolls extra dice for Boons and keeps the highest", async function () {
      const roll = CONFIG.Dice.rolls[0].build({ dc: 12, boons: 2, modifiers: [] });
      assert.equal(roll.formula, "3d20kh");
      await roll.evaluate();
      // The kept die is the natural roll for every purpose (05 section 4).
      const faces = roll.faces;
      assert.lengthOf(faces, 3);
      const kept = faces.filter(f => f.kept);
      assert.lengthOf(kept, 1);
      assert.equal(roll.natural, kept[0].value);
      assert.equal(roll.natural, Math.max(...faces.map(f => f.value)));
    });

    it("rolls extra dice for Banes and keeps the lowest", async function () {
      const roll = CONFIG.Dice.rolls[0].build({ dc: 12, banes: 3, modifiers: [] });
      assert.equal(roll.formula, "4d20kl");
      await roll.evaluate();
      assert.equal(roll.natural, Math.min(...roll.faces.map(f => f.value)));
    });

    it("cancels Boons against Banes one for one", function () {
      const roll = CONFIG.Dice.rolls[0].build({ boons: 2, banes: 1, modifiers: [] });
      assert.equal(roll.formula, "2d20kh");
    });

    it("carries provenance for every modifier, including the zeroes", function () {
      const roll = CONFIG.Dice.rolls[0].build({
        dc: 14,
        location: "head",
        modifiers: [
          { label: "Strength", value: 3 },
          { label: "Proficiency", value: 2 },
          { label: "Called shot to the Head", value: -2 },
          { label: "Rank", value: 0 }
        ]
      });
      // A zero modifier is dropped from the FORMULA and kept in the
      // PROVENANCE: "+0 from Rank" is worth seeing on the card.
      assert.notInclude(roll.formula, "+ 0");
      const labels = roll.provenance.map(p => p.label);
      assert.include(labels, "Rank");
      assert.include(labels, "Called shot to the Head");
      assert.equal(roll.location, "head");
      // The Head's -2 is in the formula as a subtraction.
      assert.include(roll.formula, "- 2");
    });

    it("computes a Success Level once evaluated", async function () {
      // Pinned: a natural 1 fails whatever the modifier (05 SS1), and this
      // rolled it once in twenty runs. Core maps r to ceil((1 - r) * 20).
      const real = CONFIG.Dice.randomUniform;
      CONFIG.Dice.randomUniform = () => 0.5; // face 10
      let roll;
      try {
        roll = CONFIG.Dice.rolls[0].build({ dc: 10, modifiers: [{ label: "flat", value: 100 }] });
        await roll.evaluate();
      } finally {
        CONFIG.Dice.randomUniform = real;
      }
      // Far past the DC, so the SL cap holds.
      assert.equal(roll.successLevel, 6);
      assert.isTrue(roll.outcome.success);
    });

    it("evaluates asynchronously and reports nothing before it does", function () {
      const roll = CONFIG.Dice.rolls[0].build({ dc: 10, modifiers: [] });
      assert.isNull(roll.successLevel, "an unevaluated roll has no Success Level");
    });
  });

  describe("Conditions as status effects", function () {
    it("registers all fourteen, keyed by id", function () {
      // V14 keys CONFIG.statusEffects by id where V13 had an array.
      for (const id of Object.keys(CONFIG.AZEROTH.conditions)) {
        assert.ok(CONFIG.statusEffects[id], `no status effect registered for ${id}`);
        assert.equal(CONFIG.statusEffects[id].id, id);
      }
    });

    it("localizes every condition name", function () {
      for (const id of Object.keys(CONFIG.AZEROTH.conditions)) {
        const name = CONFIG.statusEffects[id].name;
        assert.notEqual(game.i18n.localize(name), name, `Unlocalized condition: ${name}`);
      }
    });

    it("puts changes under system.changes, not at the root", function () {
      // V14 moved them; the root shim is deprecated and the smoke test fails
      // on any deprecation warning.
      const prone = CONFIG.statusEffects.prone;
      assert.property(prone, "system");
      assert.isArray(prone.system.changes);
      assert.notProperty(prone, "changes");
    });

    it("uses string change types, not the retired numeric modes", function () {
      const slowed = CONFIG.statusEffects.slowed;
      const change = slowed.system.changes[0];
      assert.isString(change.type, "change.type should be a string on V14");
      assert.equal(change.type, "multiply");
      assert.notProperty(change, "mode");
    });

    it("leaves a Bane-only condition without changes", function () {
      // "Active Effects change numbers, the roll pipeline changes dice."
      // Blinded imposes a Bane and nothing numeric, so it carries no change.
      assert.isUndefined(CONFIG.statusEffects.blinded.system);
    });

    it("actually applies Slowed to Speed on an actor", async function () {
      const actor = await Actor.create({ name: "Quench Slowed", type: "character" });
      try {
        const before = actor.system.speed;
        assert.equal(before, 30, "base Speed is 30 before race and armor");
        await actor.toggleStatusEffect("slowed", { active: true });
        assert.equal(actor.system.speed, 15, "Slowed halves Speed");
        await actor.toggleStatusEffect("slowed", { active: false });
        assert.equal(actor.system.speed, 30);
      } finally {
        await actor.delete();
      }
    });

    it("lets Prone override a halved Speed to zero", async function () {
      const actor = await Actor.create({ name: "Quench Prone", type: "character" });
      try {
        await actor.toggleStatusEffect("slowed", { active: true });
        await actor.toggleStatusEffect("prone", { active: true });
        // Within a phase, multiply (10) resolves before override (50), so the
        // two together end at 0 rather than at half.
        assert.equal(actor.system.speed, 0);
      } finally {
        await actor.delete();
      }
    });

    it("caps Poisoned's Banes below its stack maximum", function () {
      assert.equal(CONFIG.AZEROTH.POISONED_MAX, 4);
      assert.equal(CONFIG.AZEROTH.POISONED_BANE_CAP, 3);
    });
  });
}
function chatCardBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Chat cards", function () {
    let actor;
    const messages = [];

    before(async function () {
      actor = await Actor.create({
        name: "Quench Card Character", type: "character",
        system: { abilities: { str: { value: 16 } } }
      });
    });

    after(async function () {
      const ids = messages.map(m => m?.id).filter(Boolean);
      if (ids.length) await ChatMessage.deleteDocuments(ids);
      if (actor) await actor.delete();
    });

    const workflows = () => game.system.azeroth?.workflows;

    it("exposes the workflows on the system API", function () {
      assert.ok(workflows(), "game.system.azeroth.workflows is missing");
    });

    it("prices a called shot the way 06 section 2 does", function () {
      const { calledShotCost } = workflows();
      // Body is free and is the default; a Limb costs a Bane; the Head costs
      // a Bane AND -2, and Momentum never cancels the -2 (D-080, D-239).
      assert.deepEqual(calledShotCost("body"), { banes: 0, modifier: 0 });
      assert.deepEqual(calledShotCost("limb"), { banes: 1, modifier: 0 });
      assert.deepEqual(calledShotCost("head"), { banes: 1, modifier: -2 });
    });

    it("posts a Test card carrying its provenance", async function () {
      const message = await workflows().rollTest({
        actor, kind: "skill", dc: 12,
        modifiers: [{ label: "Strength", value: 3 }, { label: "Proficiency", value: 2 }],
        title: "Athletics"
      });
      messages.push(message);

      assert.ok(message, "no ChatMessage was created");
      assert.include(message.content, "azeroth-card");
      assert.include(message.content, "azeroth-provenance");
      // The provenance names every part, including the die.
      assert.include(message.content, "Strength");
      assert.include(message.content, "Proficiency");
      assert.lengthOf(message.rolls, 1);
      assert.equal(message.rolls[0].dc, 12);
    });

    it("adds the Head's Bane and its -2 to the roll itself", async function () {
      const message = await workflows().rollTest({
        actor, kind: "attack", dc: 12, location: "head",
        modifiers: [{ label: "Strength", value: 3 }]
      });
      messages.push(message);
      const roll = message.rolls[0];
      // One Bane means 2d20kl, and the -2 is a term in the formula.
      assert.include(roll.formula, "2d20kl");
      assert.include(roll.formula, "- 2");
      assert.equal(roll.location, "head");
    });

    it("meets Head AP on a head shot rather than Body AP", async function () {
      // A head shot rolls 2d20kl, so the KEPT die is a natural 1 about one
      // time in ten — and a natural 1 always fails (D-046), which computes no
      // damage at all. Pinning the die is the difference between testing the
      // rule and gambling on it.
      const realRandom = CONFIG.Dice.randomUniform;
      // mapRandomFace(r) = ceil((1 - r) * faces), so the mapping is INVERTED:
      // 0 gives a 20 and 0.999 gives a 1. 0.95 lands on 1.0000000000000009 and
      // ceils to 2 only by floating-point luck — do not rely on it.
      CONFIG.Dice.randomUniform = () => 0; // a natural 20 on every die
      let message;
      try {
        message = await workflows().rollTest({
          actor, kind: "attack", dc: 5, location: "head",
          modifiers: [{ label: "flat", value: 50 }],
          damage: { rating: 6, kind: "physical" },
          target: { apByLocation: { body: 5, head: 4, limb: 4 } }
        });
      } finally {
        CONFIG.Dice.randomUniform = realRandom;
      }
      messages.push(message);
      const applied = message.flags["azeroth-rpg"].damage;
      assert.ok(applied, "the attack hit, so damage should have been computed");
      assert.equal(applied.mitigation, 4, "a head shot meets Head AP, not Body AP");
    });

    it("computes no damage on a natural 1, however large the modifier", async function () {
      // The other half of the same rule, made deterministic the same way.
      const realRandom = CONFIG.Dice.randomUniform;
      CONFIG.Dice.randomUniform = () => 0.999; // a natural 1 on every die
      let message;
      try {
        message = await workflows().rollTest({
          actor, kind: "attack", dc: 5,
          modifiers: [{ label: "flat", value: 50 }],
          damage: { rating: 6, kind: "physical" },
          target: { apByLocation: { body: 5 } }
        });
      } finally {
        CONFIG.Dice.randomUniform = realRandom;
      }
      messages.push(message);
      assert.equal(message.rolls[0].natural, 1);
      assert.isTrue(message.rolls[0].isFumble);
      assert.isNull(message.flags["azeroth-rpg"].damage, "a natural 1 always fails");
    });

    it("moves a corruption track and says which threshold was crossed", async function () {
      const subject = await Actor.create({
        name: "Quench Corrupted", type: "character",
        system: { corruption: { fel: 4 } }
      });
      try {
        // A HIGH DC DOES NOT FORCE A FAILURE. `resolveTest` gives a natural 20
        // automatic success however impossible the DC (05 §2), so `dc: 99`
        // alone loses one run in twenty - the same flake the passed-exposure
        // test below pins against, in the other direction. This one fired in
        // the wild before the die was pinned. Pin to an ordinary middling face:
        // a natural 1 would be a fumble and test a different rule.
        const realRandom = CONFIG.Dice.randomUniform;
        CONFIG.Dice.randomUniform = () => 0.5;
        let message;
        try {
          message = await workflows().corruptionExposure({
            actor: subject, track: "fel", dc: 99
          });
        } finally {
          CONFIG.Dice.randomUniform = realRandom;
        }
        messages.push(message);
        const flags = message.flags["azeroth-rpg"];
        assert.equal(flags.from, 4);
        assert.equal(flags.to, 5, "a failed exposure gains exactly one point");
        assert.equal(subject.system.corruption.fel, 5);
        // 5 is the first threshold, and it arrives automatically (D-458).
        assert.include(message.content, "azeroth-card-corruption");
        assert.equal(subject.system.corruptionState.fel.crossed, 1);
      } finally {
        await subject.delete();
      }
    });

    it("gains nothing on a passed exposure Test", async function () {
      const subject = await Actor.create({
        name: "Quench Resisted", type: "character",
        system: { corruption: { void: 2 } }
      });
      try {
        // A natural 1 always fails however low the DC (D-046), so an
        // unpinned "passes" case loses one run in twenty. This is the same
        // flake the head-shot test had; pin the die rather than hope.
        const realRandom = CONFIG.Dice.randomUniform;
        CONFIG.Dice.randomUniform = () => 0; // a natural 20 on every die
        let message;
        try {
          message = await workflows().corruptionExposure({
            actor: subject, track: "void", dc: -50
          });
        } finally {
          CONFIG.Dice.randomUniform = realRandom;
        }
        messages.push(message);
        assert.equal(subject.system.corruption.void, 2, "no partial exposure");
      } finally {
        await subject.delete();
      }
    });

    it("rolls a Critical Injury on the table for the location struck", async function () {
      const message = await workflows().rollCriticalInjury({ actor, location: "limb" });
      messages.push(message);
      assert.include(message.content, "azeroth-card-critical");
      const flags = message.flags["azeroth-rpg"];
      assert.equal(flags.location, "limb");
      // 06 section 8's bands, on a d20.
      assert.isAtLeast(flags.band.min, 1);
      assert.isAtMost(flags.band.max, 20);
      assert.equal(message.rolls[0].formula, "1d20");
    });

    it("never lets a Critical Injury kill outright (D-082)", function () {
      const { CRITICAL_BANDS } = workflows();
      const worst = CRITICAL_BANDS.at(-1);
      assert.equal(worst.min, 20);
      assert.isTrue(worst.dying, "the worst result starts the dying track");
      assert.notProperty(worst, "dead");
    });

    it("registers the card templates as partials", function () {
      // Preloaded at setup; a missing partial renders as an empty card.
      assert.property(Handlebars.partials, "systems/azeroth-rpg/templates/chat/partials/provenance.hbs");
    });

    it("registers the azeroth Handlebars helpers", function () {
      for (const name of ["azerothSigned", "azerothSL", "azerothDash", "azerothLabel"]) {
        assert.property(Handlebars.helpers, name);
      }
      assert.equal(Handlebars.helpers.azerothSigned(3), "+3");
      assert.equal(Handlebars.helpers.azerothDash(null), "\u2014");
    });
  });
}
function packBatch(context) {
  const { describe, it, assert } = context;

  describe("Compendium packs", function () {
    const ours = () => game.packs.filter(p => p.metadata.packageName === "azeroth-rpg");

    it("loads the packs the manifest declares", function () {
      const names = ours().map(p => p.metadata.name).sort();
      assert.includeMembers(names, ["conditions", "talents"]);
    });

    it("holds the fifteen conditions the chapter defines", async function () {
      const pack = game.packs.get("azeroth-rpg.conditions");
      assert.ok(pack, "the conditions pack did not load");
      const index = await pack.getIndex();
      assert.equal(index.size, PACK_COUNTS.conditions.count, PACK_COUNTS.conditions.why);
    });

    it("holds 324 talents: nine classes, three branches, twelve each", async function () {
      const pack = game.packs.get("azeroth-rpg.talents");
      assert.ok(pack, "the talents pack did not load");
      const index = await pack.getIndex();
      assert.equal(index.size, 324);
    });

    it("organizes the big packs into folders, not one flat list (D-593)", async function () {
      this.timeout(20000);
      // A FLAT PACK OF 406 SPELLS IS A JUMBLE. The browser filters it and the
      // sidebar does not, so Fire and Frost sit next to each other by accident
      // of spelling. The folder tree is the book's own organization.
      const cases = [
        { pack: "spells", folders: 42, top: "Fire", nested: "Tier 1" },
        { pack: "talents", folders: 36, top: "Mage", nested: null },
        { pack: "bestiary", folders: 13, top: null, nested: null },
        // §20's named weapons join §7's eight categories (D-632), and the
        // Classic finds add `Classic loot` with a folder per zone (D-685):
        // 8 + Unique + Classic loot + 26 zones = 36.
        { pack: "weapons", folders: 36, top: "Unique", nested: null }
      ];

      for (const c of cases) {
        const pack = game.packs.get(`azeroth-rpg.${c.pack}`);
        assert.ok(pack, `the ${c.pack} pack did not load`);
        await pack.getIndex();
        assert.equal(pack.folders.size, c.folders, `${c.pack} folder count`);
        if (c.top) {
          assert.ok(pack.folders.find(f => f.name === c.top),
            `${c.pack} has no "${c.top}" folder`);
        }
      }

      // 07 runs school THEN tier, so the tree is two deep rather than 35 flat.
      const spells = game.packs.get("azeroth-rpg.spells");
      const fire = spells.folders.find(f => f.name === "Fire");
      assert.isNull(fire.folder, "a school sits at the root");
      // `Folder#folder` is a ForeignDocumentField WITHOUT `idOnly`, so it
      // resolves to the parent Folder document rather than to its id. An index
      // entry's `folder` is the raw id, which is why the next test compares
      // differently. Comparing a document to an id here silently matched
      // nothing and read as "the tree is flat".
      const tiers = spells.folders.filter(f => f.folder?.id === fire.id);
      assert.isAbove(tiers.length, 1, "Fire holds its tiers");
    });

    it("puts every foldered document in a folder that exists", async function () {
      this.timeout(20000);
      // A document pointing at a folder id the pack does not hold is not an
      // error in Foundry - it simply renders at the root, so the tree looks
      // right until you count what is in it.
      const pack = game.packs.get("azeroth-rpg.spells");
      const index = await pack.getIndex({ fields: ["folder"] });
      const ids = new Set(pack.folders.map(f => f.id));

      const orphans = index.filter(e => e.folder && !ids.has(e.folder));
      assert.equal(orphans.length, 0,
        `${orphans.length} spell(s) point at a folder the pack does not hold`);

      const homeless = index.filter(e => !e.folder);
      assert.equal(homeless.length, 0, "every spell has a school and a tier");
    });

    it("holds the three Critical Injury tables, d20 over seven bands", async function () {
      const pack = game.packs.get("azeroth-rpg.criticals");
      assert.ok(pack, "the criticals pack did not load");
      const index = await pack.getIndex();
      assert.equal(index.size, 3, "06 §8: Body, Head and Limb");

      const body = await pack.getDocument(
        index.find(e => e.name.includes("Body"))._id
      );
      assert.equal(body.formula, "1d20");

      // A RESULT WHOSE PARENT KEY IS WRONG IS DROPPED IN SILENCE on compile,
      // exactly like a document with no _key, so an empty table compiles and
      // reports success. Count them.
      assert.equal(body.results.size, 7, "seven bands");

      const first = body.results.contents.find(r => r.range[0] === 1);
      assert.deepEqual(first.range, [1, 4]);
      // V14 carries `name` and `description`; `text` was V13's and is gone.
      assert.equal(first.name, "Winded");
      assert.include(first.description, "Bane on Attack Tests");

      // 20 starts the dying track on every table — no single blow kills outright.
      const worst = body.results.contents.find(r => r.range[0] === 20);
      assert.match(worst.description, /dying/i);
    });

    it("keeps the Critical Injury tables away from players", async function () {
      // A player browsing the outcomes before the blow lands is reading the
      // GM's side of the screen (CLAUDE.md §9).
      const pack = game.packs.get("azeroth-rpg.criticals");
      assert.equal(pack.metadata.ownership?.PLAYER, "NONE");
    });

    it("holds one rules journal per chapter, each with pages", async function () {
      const pack = game.packs.get("azeroth-rpg.rules");
      assert.ok(pack, "the rules journal pack did not load");
      const index = await pack.getIndex();
      assert.equal(index.size, 18, "one JournalEntry per chapter in docs/book");

      const combat = await pack.getDocument(index.find(e => e.name === "06-COMBAT")._id);
      assert.ok(combat.pages.size > 1, "06 should be split into its level-2 sections");
    });

    it("resolves a rewritten @UUID against the compiled pack", async function () {
      // THE ONE THING packs-src CANNOT PROVE. Everything else here checks the
      // YAML the parser wrote; this checks that the deterministic ids in that
      // YAML survive compilation into LevelDB and that Foundry itself will
      // follow the link. A wrong id, a wrong UUID grammar, or a page that did
      // not compile all look identical on disk and all fail here.
      const pack = game.packs.get("azeroth-rpg.conditions");
      const index = await pack.getIndex();
      const doc = await pack.getDocument(index.find(e => e.name === "Fatigued")._id);

      const found = JSON.stringify(doc.toObject()).match(/@UUID\[([^\]]+)\]/);
      assert.ok(found, "Fatigued carries no cross-reference to resolve");

      const target = await fromUuid(found[1]);
      assert.ok(target, `@UUID[${found[1]}] resolved to nothing`);
      assert.equal(target.documentName, "JournalEntryPage");
      assert.equal(target.parent.pack, "azeroth-rpg.rules");
    });

    it("holds 406 spells across seven schools and five tiers", async function () {
      const pack = game.packs.get("azeroth-rpg.spells");
      assert.ok(pack, "the spells pack did not load");
      const index = await pack.getIndex();
      assert.equal(index.size, 406);
    });

    it("holds 53 careers across four tiers", async function () {
      const pack = game.packs.get("azeroth-rpg.careers");
      assert.ok(pack, "the careers pack did not load");
      const index = await pack.getIndex();
      assert.equal(index.size, 53);
    });

    it("derives a spell's CLASSES from its school, narrowed by Restricted", async function () {
      // D-324: the source field is `Restricted` and CLASSES is derived, so it
      // can never disagree with 07 section 1's access table.
      const pack = game.packs.get("azeroth-rpg.spells");
      const index = await pack.getIndex();
      const fireball = index.find(e => e.name === "Fireball");
      assert.ok(fireball, "Fireball is missing from the spells pack");
      const doc = await pack.getDocument(fireball._id);
      assert.equal(doc.system.school, "fire");
      assert.deepEqual(doc.system.classes, ["Mage"], "Fireball is Restricted to the Mage");

      const scorch = index.find(e => e.name === "Scorch");
      const open = await pack.getDocument(scorch._id);
      // Unrestricted Fire is open to every class holding Fire.
      assert.includeMembers(open.system.classes, ["Mage", "Shaman", "Warlock"]);
      assert.notInclude(open.system.classes, "Priest");
    });

    it("parses a career's In-career list into real skill keys", async function () {
      const pack = game.packs.get("azeroth-rpg.careers");
      const index = await pack.getIndex();
      const runner = index.find(e => e.name === "Runner");
      const doc = await pack.getDocument(runner._id);
      assert.equal(doc.system.tier, 1);
      // The list is what makes a Rank cheap, so it has to be keys the sheet
      // can look up, not prose.
      for (const key of doc.system.inCareer) {
        assert.property(CONFIG.AZEROTH.skills, key, `${key} is not a skill key`);
      }
      assert.includeMembers(doc.system.inCareer, ["stealth", "streetwise", "sleightOfHand"]);
    });

    it("generates talents that validate against the talent DataModel", async function () {
      const pack = game.packs.get("azeroth-rpg.talents");
      const doc = await pack.getDocument(pack.index.contents[0]._id);
      assert.equal(doc.type, "talent");
      // The branch tier gate is points spent in the branch, not character
      // level (04 section 1), so tier runs 1 to 5.
      assert.isAtLeast(doc.system.tier, 1);
      assert.isAtMost(doc.system.tier, 5);
      assert.isAtLeast(doc.system.ranks, 1);
      assert.isAtMost(doc.system.ranks, 3);
      assert.isString(doc.system.className);
      assert.isString(doc.system.branch);
    });

    it("holds the eleven peoples and the nine classes", async function () {
      const races = game.packs.get("azeroth-rpg.races");
      const classes = game.packs.get("azeroth-rpg.classes");
      assert.equal((await races.getIndex()).size, 11);
      assert.equal((await classes.getIndex()).size, 9);
    });

    it("gives a real Warrior from the pack its Rage cap", async function () {
      // The end of the D-507 chain: 02 section 7 prints "Rage, capped at 10",
      // the parser reads it onto the class item, and the actor derives its cap
      // from that item with no constant anywhere in between.
      const pack = game.packs.get("azeroth-rpg.classes");
      const index = await pack.getIndex();
      const entry = index.find(e => e.name === "Warrior");
      assert.ok(entry, "the Warrior is missing from the classes pack");
      const warriorClass = await pack.getDocument(entry._id);

      assert.equal(warriorClass.system.frame, "hardy");
      assert.equal(warriorClass.system.momentum.name, "rage");
      assert.equal(warriorClass.system.momentum.max, 10);
      // 02 section 7 prints no Power pool SIZE, so the class carries none.
      assert.isNull(warriorClass.system.power.name);
      assert.lengthOf(warriorClass.system.branches, 3);

      const actor = await Actor.create({ name: "Quench Real Warrior", type: "character" });
      try {
        const [copy] = await actor.createEmbeddedDocuments("Item", [warriorClass.toObject()]);
        await actor.update({ "system.classes": [{ itemId: copy.id, level: 1 }] });
        assert.equal(actor.system.momentum.max, 10, "Rage caps at 10, from the pack");
        assert.isNull(actor.system.power.max, "a Warrior holds no Power");
        assert.equal(actor.system.health.max, 13 + 0 + 0, "Hardy frame at level 1");
      } finally {
        await actor.delete();
      }
    });

    it("derives a Priest's Mana from level, which the class does not print", async function () {
      // A class embedded on an actor grants its thirty-six talents (D-610)
      // before the delete can land; Mocha's two seconds were never enough.
      this.timeout(60000);
      const pack = game.packs.get("azeroth-rpg.classes");
      const index = await pack.getIndex();
      const priestClass = await pack.getDocument(index.find(e => e.name === "Priest")._id);
      assert.equal(priestClass.system.power.name, "mana");
      assert.isNull(priestClass.system.power.max, "02 section 7 prints no Mana size");
      assert.equal(priestClass.system.power.caster, "full");

      const actor = await Actor.create({ name: "Quench Real Priest", type: "character" });
      try {
        const [copy] = await actor.createEmbeddedDocuments("Item", [priestClass.toObject()]);
        await actor.update({ "system.classes": [{ itemId: copy.id, level: 1 }] });
        assert.equal(actor.system.power.max, 10, "a full caster at level 1 holds 10 Mana");
        await actor.update({ "system.classes": [{ itemId: copy.id, level: 17 }] });
        assert.equal(actor.system.power.max, 50, "and 50 at level 17");
      } finally {
        await actor.delete();
      }
    });

    it("keeps a race's Size, which eight rules read (D-545)", async function () {
      const pack = game.packs.get("azeroth-rpg.races");
      const index = await pack.getIndex();
      const gnome = await pack.getDocument(index.find(e => e.name === "Gnome")._id);
      const tauren = await pack.getDocument(index.find(e => e.name === "Tauren")._id);
      assert.equal(gnome.system.size, "small");
      assert.equal(tauren.system.size, "large");
      // 02 section 3's matrix, read onto the race.
      assert.includeMembers(gnome.system.classes, ["Warrior", "Rogue", "Mage", "Warlock"]);
      assert.notInclude(gnome.system.classes, "Druid");
    });

    it("holds 08's traits, weapons and armor", async function () {
      const counts = {};
      for (const name of ["traits", "weapons", "armor"]) {
        const pack = game.packs.get(`azeroth-rpg.${name}`);
        assert.ok(pack, `the ${name} pack did not load`);
        counts[name] = (await pack.getIndex()).size;
      }
      // 08 section 5: 59 weapon and armor traits matching 06 section 3's
      // roster, plus 15 Mount traits that belong to 08 section 15 alone.
      assert.equal(counts.traits, 74);
      assert.isAbove(counts.weapons, 100);
      assert.isAbove(counts.armor, 40);
    });

    it("leaves a bow's Damage Rating absent, because the shot carries it", async function () {
      // D-406, and D4 section 10.1's rule that a field which does not apply is
      // omitted. null and 0 are different facts.
      const pack = game.packs.get("azeroth-rpg.weapons");
      const index = await pack.getIndex();
      const bow = index.find(e => e.name === "Elven longbow");
      assert.ok(bow, "the Elven longbow is missing");
      const doc = await pack.getDocument(bow._id);
      assert.isNull(doc.system.rating, "a bow carries no Damage Rating");
      assert.isTrue(doc.system.shotCarriesDamage);
      assert.equal(doc.system.range, 200);

      const sword = await pack.getDocument(index.find(e => e.name === "Longsword")._id);
      assert.equal(sword.system.rating, 4, "a melee weapon does carry one");
    });

    it("prices in copper against the wage that anchors the chapter", async function () {
      // D-422: 100 copper make a silver, and the wage is twelve coppers a day.
      // A longsword at 240 copper is twenty days of unskilled labour.
      const pack = game.packs.get("azeroth-rpg.weapons");
      const index = await pack.getIndex();
      const sword = await pack.getDocument(index.find(e => e.name === "Longsword")._id);
      assert.equal(sword.system.cost, 240);
      assert.equal(sword.system.cost / 12, 20, "twenty days at the wage");
    });

    it("derives a suit's Armor Points from its category rather than storing them", async function () {
      const pack = game.packs.get("azeroth-rpg.armor");
      const index = await pack.getIndex();
      const plate = index.find(e => e.name === "Argent plate");
      const doc = await pack.getDocument(plate._id);
      assert.equal(doc.system.category, "plate");
      // Plate is Body 5 / Head 4 / Limb 4, and Closed adds a Head point.
      assert.include(doc.system.cuts, "closed");
      assert.deepEqual(doc.system.armorPoints, { body: 5, head: 5, limb: 4 });
      assert.notProperty(doc.toObject().system, "armorPoints");
    });

    it("holds every creature 14 prints, across five weight classes", async function () {
      // THE COUNT LIVES IN ONE PLACE (CLAUDE.md §9). This assertion carried a
      // literal 164 and went stale the moment D-707 added the six totems, so
      // it failed the whole smoke run for a number that had moved on purpose.
      const pack = game.packs.get("azeroth-rpg.bestiary");
      assert.ok(pack, "the bestiary pack did not load");
      assert.equal((await pack.getIndex()).size, PACK_COUNTS.bestiary.count, PACK_COUNTS.bestiary.why);
    });

    it("keeps the bestiary out of a player's reach", function () {
      // CLAUDE.md section 9: ownership keeps players off the GM-facing packs.
      const pack = game.packs.get("azeroth-rpg.bestiary");
      assert.equal(pack.metadata.ownership?.PLAYER, "NONE");
    });

    it("reproduces D4 section 10.2's worked example field for field", async function () {
      const pack = game.packs.get("azeroth-rpg.bestiary");
      const index = await pack.getIndex();
      const entry = index.find(e => e.name === "Plagued Ghoul");
      assert.ok(entry, "the Plagued Ghoul is missing");
      const g = (await pack.getDocument(entry._id)).system;

      assert.equal(g.weightClass, "standard");
      assert.equal(g.size, "medium");
      assert.equal(g.creatureType, "undead");
      assert.equal(g.threatShare, 1);
      assert.equal(g.tier, 1);
      assert.equal(g.corruption, "undeath");
      assert.equal(g.health.max, 12);
      assert.equal(g.defense, 12);
      assert.deepEqual(g.ap, { body: 2, head: 1, limb: 1 });
      assert.deepEqual(g.ward, { shadow: 2 }, "the pack's Ward is not the map (D-644)");
      assert.equal(g.speed, 30);
      assert.equal(g.initiative, 10);
      // Str 14 (+2) ... Int 3 (-4)
      assert.equal(g.abilities.str.value, 14);
      assert.equal(g.abilities.str.mod, 2);
      assert.equal(g.abilities.int.value, 3);
      assert.equal(g.abilities.int.mod, -4);
      assert.lengthOf(g.attacks, 2);
      assert.equal(g.attacks[0].name, "Claws");
      assert.equal(g.attacks[0].bonus, 4);
      // A creature's Proficiency is 1 plus its tier, already in that Bonus.
      assert.equal(g.proficiency, 2);
      // A damage-type key since 0.10.0 (D-637), not the chapter's capitalised word.
      assert.includeMembers(g.vulnerable, ["holy"]);
      assert.includeMembers(g.inflicts, ["diseased"]);
      // Both pools drawn even though it has neither (D-509).
      assert.isNull(g.momentum.name);
      assert.isNull(g.power.name);
    });

    it("distinguishes a location a creature does not have from an unarmored one", async function () {
      const pack = game.packs.get("azeroth-rpg.bestiary");
      const index = await pack.getIndex();
      const ooze = index.find(e => e.name === "Plague Ooze");
      const doc = await pack.getDocument(ooze._id);
      // An ooze reads Body alone and cannot be called-shot elsewhere (06 §2).
      assert.equal(doc.system.ap.body, 2);
      assert.isNull(doc.system.ap.head);
      assert.deepEqual(doc.system.locations, ["body"]);
      assert.isFalse(doc.system.hasLocation("head"));
    });

    it("gives a Boss its dungeon, its tier DC, and no Threat Share", async function () {
      const pack = game.packs.get("azeroth-rpg.bestiary");
      const index = await pack.getIndex();
      const boss = await pack.getDocument(index.find(e => e.name === "Aku'mai")._id);
      assert.equal(boss.system.weightClass, "boss");
      assert.isNull(boss.system.threatShare, "a Boss prints a dash for Threat Share");
      assert.equal(boss.system.dungeon, "Blackfathom Deeps");
      // D-539's ladder, derived from tier rather than stored.
      assert.equal(boss.system.tier, 2);
      assert.equal(boss.system.bossDC, 18);
      assert.equal(boss.system.partyLevel, "5-10");
    });

    it("takes a flying pace from the tier, not from the creature (D-530)", async function () {
      const pack = game.packs.get("azeroth-rpg.bestiary");
      const index = await pack.getIndex();
      const drake = await pack.getDocument(index.find(e => e.name === "Azuregos")._id);
      assert.isTrue(drake.system.flies);
      assert.equal(drake.system.tier, 3);
      assert.equal(drake.system.flyingSpeed, 240, "tiers 3-4 fly at 240");
      assert.equal(drake.system.speed, 40, "the ground pace stays the creature's own");
    });

    it("holds the seven Legacies and 08 section 6's affix pools", async function () {
      assert.equal((await game.packs.get("azeroth-rpg.legacies").getIndex()).size, 7);
      // 27 prefixes + 12 attribute + 7 Ward + 7 Spellpower + 23 skill.
      assert.equal((await game.packs.get("azeroth-rpg.affixes").getIndex()).size, 76);
    });

    it("moves ability scores on a Legacy's ranks 2 and 4 alone (D-588)", async function () {
      const pack = game.packs.get("azeroth-rpg.legacies");
      const index = await pack.getIndex();
      const doc = await pack.getDocument(index.find(e => e.name === "Blademaster")._id);
      assert.lengthOf(doc.system.ranks, 4);
      for (const rank of doc.system.ranks) {
        const moves = rank.abilityUp !== null;
        assert.equal(moves, rank.rank === 2 || rank.rank === 4,
          `rank ${rank.rank} should ${rank.rank % 2 === 0 ? "" : "not "}move scores`);
      }
    });

    it("generates an affixed instance rather than storing the cross-product", async function () {
      // D-377: "Foundry generates the instance." 183 bases x 27 prefixes x 49
      // suffixes would be 242,109 documents, so the packs hold the POOLS and
      // rules/affixes.mjs makes one when somebody asks.
      const { affixes } = game.system.azeroth;
      const weapons = game.packs.get("azeroth-rpg.weapons");
      const wIndex = await weapons.getIndex();
      const base = (await weapons.getDocument(wIndex.find(e => e.name === "Longsword")._id)).toObject();

      const pool = game.packs.get("azeroth-rpg.affixes");
      const aIndex = await pool.getIndex();
      const keenDoc = await pool.getDocument(aIndex.find(e => e.name === "Keen")._id);
      const bearDoc = await pool.getDocument(aIndex.find(e => e.name === "of the Bear")._id);
      const keen = keenDoc.flags["azeroth-rpg"].affix;
      const bear = bearDoc.flags["azeroth-rpg"].affix;

      const made = affixes.generate({ base, prefix: keen, suffix: bear });
      assert.isTrue(made.ok, made.reason);
      assert.equal(made.item.name, "Keen Longsword of the Bear");
      assert.equal(made.item.system.rarity, "rare");
      assert.equal(made.item.system.budget, 3);
      // 08 section 2's worked example: a longsword is 2 silver 40, so a Rare
      // one is x25.
      assert.equal(made.item.system.cost, 240 * 25);
    });

    it("refuses an affix the base item cannot carry", async function () {
      const { affixes } = game.system.azeroth;
      const armor = game.packs.get("azeroth-rpg.armor");
      const aIndex = await armor.getIndex();
      const suit = (await armor.getDocument(aIndex.contents[0]._id)).toObject();
      const pool = game.packs.get("azeroth-rpg.affixes");
      const pIndex = await pool.getIndex();
      const keen = (await pool.getDocument(pIndex.find(e => e.name === "Keen")._id))
        .flags["azeroth-rpg"].affix;

      const made = affixes.generate({ base: suit, prefix: keen });
      assert.isFalse(made.ok, "Keen goes on weapons, not armor");
      assert.isNull(made.item);
    });

    it("carries a type hint so the browser can skip a pack it cannot match", function () {
      const pack = game.packs.get("azeroth-rpg.talents");
      assert.deepEqual(pack.metadata.flags?.["azeroth-rpg"]?.types, ["talent"]);
    });

    it("gives every generated document a stable id", async function () {
      // Ids are derived from the pack and the slug, so regenerating the packs
      // does not break every @UUID link and every actor's held items.
      const pack = game.packs.get("azeroth-rpg.conditions");
      const index = await pack.getIndex();
      for (const entry of index) {
        assert.match(entry._id, /^[A-Za-z0-9]{16}$/, `bad id on ${entry.name}`);
      }
    });
  });
}
function sheetBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Character sheet", function () {
    let actor;
    let sheet;
    let root;

    before(async function () {
      actor = await Actor.create({
        name: "Quench Sheet Character", type: "character",
        system: { abilities: { str: { value: 16 }, dex: { value: 14 } }, corruption: { fel: 7 } }
      });
      sheet = actor.sheet;
      await sheet.render(true);
      root = sheet.element;
    });

    after(async function () {
      await sheet?.close();
      if (actor) await actor.delete();
    });

    it("is the system's ApplicationV2 sheet, not a V1 fallback", function () {
      assert.equal(sheet.constructor.name, "AzerothCharacterSheet");
      // ApplicationV2 hands back a native HTMLElement, never jQuery.
      assert.instanceOf(root, HTMLElement);
    });

    it("renders every part of D11 section 1's map", function () {
      for (const selector of [
        ".azeroth-banner", "nav.sheet-tabs", ".azeroth-attributes", ".azeroth-skills"
      ]) {
        assert.ok(root.querySelector(selector), `missing ${selector}`);
      }
    });

    it("keeps attributes and skills OUT of the tab panel (D-506)", function () {
      // The single most important layout fact: they are consulted constantly
      // and the tabs switch only the right-hand panel.
      const attributes = root.querySelector(".azeroth-attributes");
      const skills = root.querySelector(".azeroth-skills");
      assert.isNull(attributes.closest("[data-tab]"), "attributes sit inside a tab");
      assert.isNull(skills.closest("[data-tab]"), "skills sit inside a tab");
    });

    it("draws the six attribute plates with their modifiers", function () {
      const plates = root.querySelectorAll(".azeroth-plate");
      assert.lengthOf(plates, 6);
      const str = root.querySelector('[data-ability="str"]');
      // The score is an input on the plate since D-610; a locked sheet draws a span.
      const score = str.querySelector(".azeroth-score");
      assert.equal(String(score.value ?? score.textContent).trim(), "16");
    });

    it("draws all twenty-three skills in book order", function () {
      const rows = root.querySelectorAll(".azeroth-skill");
      assert.lengthOf(rows, 23);
      const first = rows[0].querySelector(".azeroth-skill-name").textContent.trim();
      assert.equal(first, "Athletics", "Athletics opens the list (02 section 8)");
    });

    it("shows a skill total of modifier plus Proficiency plus Rank", function () {
      // Athletics reads Strength: +3 from a 16, +2 Proficiency, Rank 0.
      const athletics = root.querySelector(".azeroth-skill .azeroth-skill-total");
      assert.equal(athletics.textContent.trim(), "+5");
    });

    it("has no progress bar anywhere (D-508)", function () {
      assert.lengthOf(root.querySelectorAll("progress"), 0);
      assert.lengthOf(root.querySelectorAll("meter"), 0);
      // The XP purse is a number in Progress's ledger, not a fill, and the
      // banner no longer carries it at all (D-612).
      assert.ok(root.querySelector(".azeroth-ledger"));
      assert.notOk(root.querySelector(".azeroth-banner .azeroth-xp"), "the banner still carries the XP purse");
    });

    it("keeps the corruption badge in the banner, visible from every tab", function () {
      // fel 7 has crossed the first threshold, so the badge is drawn.
      const badge = root.querySelector(".azeroth-banner .azeroth-threshold.is-fel");
      assert.ok(badge, "a crossed threshold should show in the persistent banner");
    });

    it("marks a crossed rung and leaves the others alone", async function () {
      await sheet.changeTab("corruption", "primary");
      const rungs = root.querySelectorAll(".azeroth-track.is-fel .azeroth-rung");
      assert.lengthOf(rungs, 3, "thresholds at 5, 10 and 15");
      assert.isTrue(rungs[0].classList.contains("is-crossed"), "7 has crossed 5");
      assert.isFalse(rungs[1].classList.contains("is-crossed"), "7 has not crossed 10");
    });

    it("drops a grid track AND hides Skills together on a wide tab", async function () {
      // Both halves have to fire: a hidden element is not a grid item, so
      // hiding Skills without dropping the track leaves the panel in column 2.
      await sheet.changeTab("gear", "primary");
      assert.isTrue(sheet.element.classList.contains("is-wide"));
      assert.isTrue(root.querySelector(".azeroth-skills").hidden, "Skills should be hidden");

      await sheet.changeTab("core", "primary");
      assert.isFalse(sheet.element.classList.contains("is-wide"));
      assert.isFalse(root.querySelector(".azeroth-skills").hidden);
    });

    it("draws an em-dash for a pool the character does not hold (D-509)", async function () {
      await sheet.changeTab("core", "primary");
      // Core's pools alone: the Spells header draws the Power pools again (D-614).
      const absent = root.querySelectorAll('section[data-tab="core"] .azeroth-pool-head.is-absent');
      // No class item, so neither pool is held.
      assert.lengthOf(absent, 2);
      assert.lengthOf(root.querySelectorAll(".azeroth-segment"), 0);
    });
  });
}
function npcSheetBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("NPC sheet", function () {
    let actor;
    let sheet;
    let root;

    before(async function () {
      // A real creature out of the pack, so the sheet is tested against
      // generated content rather than a hand-built fixture.
      const pack = game.packs.get("azeroth-rpg.bestiary");
      const index = await pack.getIndex();
      const ghoul = await pack.getDocument(index.find(e => e.name === "Plagued Ghoul")._id);
      actor = await Actor.create(ghoul.toObject());
      sheet = actor.sheet;
      await sheet.render(true);
      root = sheet.element;
    });

    after(async function () {
      await sheet?.close();
      if (actor) await actor.delete();
    });

    it("uses the NPC sheet, not the character one", function () {
      assert.equal(sheet.constructor.name, "AzerothNpcSheet");
      assert.instanceOf(root, HTMLElement);
    });

    it("prints the identity run in D4 section 10.2's order", function () {
      const line = root.querySelector(".azeroth-identity-line").textContent;
      assert.match(line, /Standard/);
      assert.match(line, /Medium/);
      assert.match(line, /Undead/);
    });

    it("keeps the attribute rail, as the character sheet has", function () {
      assert.lengthOf(root.querySelectorAll(".azeroth-plate"), 6);
    });

    it("draws BOTH pools, at the floor the tier gives a block that states none (D-509)", function () {
      // D-509's rule is that both are DRAWN, so every stat block has one shape
      // and the GM's eye lands in the same place. What changed is that a
      // non-Boss now HOLDS both: `creaturePools` floors Momentum at 10 and a
      // tier-1 Power at 4 (2026-09-07, the lead's *NPCs should all generate
      // momentum and have Power*). That floor reached the model and its unit
      // tests and NOT the sheet, which went on reading the stored maximum, so
      // 123 of the 164 still drew two em-dashes — and this test asserted the
      // em-dash, which is why nothing failed (2026-09-08).
      const heads = [...root.querySelectorAll(".azeroth-pool-head")];
      assert.lengthOf(heads, 2);
      assert.isEmpty(heads.filter(h => h.classList.contains("is-absent")), "a pool reads as absent");
      // THROUGH `poolCount`, because the count stopped being text (the lead,
      // 2026-09-13): an editable pool draws a stepper and its value lives in
      // an `<input>`, which contributes nothing to `textContent`.
      const text = heads.map(h => poolCount(h));
      // **AND THE POWER NOW STANDS FULL** (D-705). Momentum is GAINED (05
      // §11), so it starts at 0; Power is SPENT, and read as 0 the floor
      // above could never be spent and nothing could ever fill it — both rest
      // handlers key on the stored `power.max` and skip the same 123. So a
      // spell given to a creature that states no Power refused for want of
      // Mana against a pool this test asserted as `0 / 4`.
      assert.ok(text.some(t => /0 \/ 10/.test(t)), `no Momentum at 0 / 10: ${text.join(" | ")}`);
      assert.ok(text.some(t => /4 \/ 4/.test(t)), `no tier-1 Power at 4 / 4: ${text.join(" | ")}`);
      assert.isEmpty(text.filter(t => /—/.test(t)), `a pool still prints an em-dash: ${text.join(" | ")}`);
      // A pool the block does not NAME still says which pool it is.
      const labels = heads.map(h => h.querySelector(".azeroth-pool-label")?.textContent.trim() ?? "");
      assert.isEmpty(labels.filter(l => !l), `a pool draws no label: ${JSON.stringify(labels)}`);
      // Drawn, not omitted.
      assert.isAbove(root.querySelectorAll(".azeroth-segment").length, 0);
    });

    it("puts armour by location at the centre, Head listed separately", function () {
      const locations = root.querySelectorAll(".azeroth-ap-location");
      // Body, Head, Limb, plus Ward.
      assert.isAtLeast(locations.length, 4);
      const text = root.querySelector(".azeroth-ap").textContent;
      assert.include(text, "Head");
    });

    it("prints a NUMBER in the Resilience chip, the one the die adds (14 §1, D-714)", async function () {
      this.timeout(30000);
      // `attributes.hbs` has drawn `{{azerothSigned this.save}}` on every
      // Resilience chip since Phase 3 and this sheet never set `save`, so all
      // three read `+0` while `rollResilience` added the real rows — D-681's
      // shape exactly, right code with no caller.
      //
      // The Alliance Footman is the block to read it off: Con 14 (+2) trained
      // in Body, tier 1 (Proficiency 2) → +4; Dex 12 (+1) untrained → +1.
      const pack = game.packs.get("azeroth-rpg.bestiary");
      const index = await pack.getIndex();
      const entry = await pack.getDocument(index.find(e => e.name === "Alliance Footman")._id);
      const footman = await Actor.create(entry.toObject());
      const its = footman.sheet;
      try {
        await its.render({ force: true });
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const chip = key => its.element
          .querySelector(`.azeroth-chip-save[data-resilience="${key}"]`)?.textContent.trim() ?? "";
        assert.equal(chip("body"), "+4", "the Body chip is not the Constitution modifier plus Proficiency");
        assert.equal(chip("reflex"), "+1", "the Reflex chip is not the Dexterity modifier alone");
        // And the chip is the SAME sum the die is handed.
        const rows = game.system.azeroth.workflows.resilienceModifiers(footman, "body");
        assert.equal(rows.reduce((n, r) => n + r.value, 0), 4,
          "the chip and the roll would print two different numbers");
      } finally {
        await its?.close();
        await footman.delete();
      }
    });
  });

  describe("Compendium browser", function () {
    it("is reachable from the Compendium sidebar, not only from the console", async function () {
      const { addBrowserButton, BUTTON_CLASS } = await import(
        "/systems/azeroth-rpg/module/applications/browser-button.mjs"
      );
      // THE HOOK IS THE HALF THAT CANNOT BE UNIT-TESTED. Render the real
      // directory and assert the button is in its footer - calling
      // `browserButton()` alone would pass with the hook unregistered.
      const directory = ui.compendium;
      assert.ok(directory, "there is no compendium sidebar tab to hang a button on");
      await directory.render({ force: true });
      const button = directory.element.querySelector(`.${BUTTON_CLASS}`);
      assert.ok(button, "the compendium sidebar has no button opening the browser");
      assert.equal(button.tagName, "BUTTON");

      // And it does not stack on a re-render.
      assert.isFalse(addBrowserButton(directory.element),
        "a second button was added on top of the first");
    });

    it("is built on core's CategoryBrowser rather than from scratch", function () {
      const Browser = game.system.azeroth.browser;
      assert.ok(Browser, "the browser is not exposed on the system API");
      const CategoryBrowser = foundry.applications.api.CategoryBrowser;
      assert.isTrue(Browser.prototype instanceof CategoryBrowser);
    });

    it("declares a category for every content pack", function () {
      const Browser = game.system.azeroth.browser;
      const app = new Browser();
      const categories = app.constructor.name;
      assert.isString(categories);
      // The pack each category reads must actually exist.
      const { CATEGORIES } = game.system.azeroth;
      if (CATEGORIES) {
        for (const [key, category] of Object.entries(CATEGORIES)) {
          assert.ok(game.packs.get(category.pack), `${key} reads a missing pack`);
        }
      }
    });

    it("opens narrowed to a category", async function () {
      const Browser = game.system.azeroth.browser;
      const app = await Browser.browse({ category: "spells" });
      try {
        assert.ok(app.rendered || app.element, "the browser did not render");
        assert.equal(app.options.initialCategory, "spells");
      } finally {
        await app.close();
      }
    });
  });
}
function combatBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Side-based combat", function () {
    let combat;
    const actors = [];

    before(async function () {
      this.timeout(15000);
      // A slow ally and a fast enemy: the case a per-combatant sort gets wrong.
      const make = async (name, dex) => {
        const a = await Actor.create({
          name, type: "character", system: { abilities: { dex: { value: dex } } }
        });
        actors.push(a);
        return a;
      };
      await make("Quench Kaelen", 18); // +4 -> initiative 14
      await make("Quench Mira", 12);   // +1 -> initiative 11
      await make("Quench Ghoul", 16);  // +3 -> initiative 13

      // `{ scene: null }` is rejected; an empty payload is how a combat is
      // made outside a scene.
      combat = await Combat.create({});
      await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({ actorId: a.id })));

      // With no tokens every combatant defaults to hostile, so the sides are
      // set explicitly. The Ghoul is FASTER than Mira on purpose: that is the
      // case a per-combatant sort gets wrong.
      for (const c of combat.combatants) {
        await c.setSide(c.name.includes("Ghoul") ? "hostile" : "friendly");
      }
      combat.setupTurns();
    });

    after(async function () {
      if (combat) await combat.delete();
      for (const a of actors) await a.delete();
    });

    it("uses the system's Combat and Combatant classes", function () {
      assert.equal(CONFIG.Combat.documentClass.name, "AzerothCombat");
      assert.equal(CONFIG.Combatant.documentClass.name, "AzerothCombatant");
    });

    it("derives initiative and never rolls it (D-256)", function () {
      const kaelen = combat.combatants.find(c => c.name.includes("Kaelen"));
      // 10 + Dex modifier. An 18 is +4.
      assert.equal(kaelen.derivedInitiative, 14);
      // CONFIG.Combat.initiative carries no formula to roll.
      assert.isNull(CONFIG.Combat.initiative.formula);
    });

    it("gives every combatant a turn budget of two Half-Actions and a Reaction", function () {
      const c = combat.combatants.contents[0];
      assert.equal(c.budget.halfActions, 2);
      assert.equal(c.budget.reactions, 1);
      // No Attack counter since D-711: each Half-Action may be an Attack.
      assert.notProperty(c.budget, "attacks");
      assert.isFalse(c.budget.attacked);
      assert.equal(c.budget.offHandAttacks, 1);
    });

    it("refuses a third Half-Action and says why, in the lang file's words", async function () {
      const c = combat.combatants.contents[0];
      await c.resetBudget();
      assert.isTrue((await c.spendAction("half")).ok);
      assert.isTrue((await c.spendAction("half")).ok);
      const third = await c.spendAction("half");
      assert.isFalse(third.ok);
      // The reason is an i18n KEY now (D-711), and the toast is the sentence.
      assert.equal(third.reason, "AZEROTH.Budget.Refuse.NeedsHalves");
      assert.match(game.i18n.format(third.reason, third.params), /Half-Action/);
      await c.resetBudget();
    });

    it("lets the GM put a spent Half-Action or the Reaction back (D-718)", async function () {
      const c = combat.combatants.contents[0];
      await c.resetBudget();
      await c.spendAction("full");
      assert.equal(c.budget.halfActions, 0);
      assert.equal(c.budget.reactions, 0);
      assert.isTrue((await c.restoreAction("half")).ok);
      assert.equal(c.budget.halfActions, 1);
      assert.isTrue((await c.restoreAction("reaction")).ok);
      assert.equal(c.budget.reactions, 1);
      // And it never buys a third: a full turn has nothing to put back.
      await c.restoreAction("half");
      const refused = await c.restoreAction("half");
      assert.isFalse(refused.ok);
      assert.equal(refused.reason, "AZEROTH.Budget.Refuse.NothingToRestore");
      assert.equal(c.budget.halfActions, 2);
      await c.resetBudget();
    });

    it("makes a Full Action take the Reaction as well (D-255)", async function () {
      const c = combat.combatants.contents[0];
      await c.resetBudget();
      const result = await c.spendAction("full");
      assert.isTrue(result.ok);
      assert.equal(result.budget.halfActions, 0);
      assert.equal(result.budget.reactions, 0);
      await c.resetBudget();
    });

    it("draws the restore buttons on the tracker only where something was spent (D-718)", async function () {
      this.timeout(30000);
      // A click dispatches an async handler, so the write is polled for rather
      // than awaited - the same shape every lifecycle test here uses (D-627).
      const until = async (fn, what, ms = 10000) => {
        const start = Date.now();
        while (!fn()) {
          if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
          await new Promise(r => setTimeout(r, 50));
        }
      };
      const c = combat.combatants.contents[0];
      await combat.activate();
      await c.resetBudget();
      await ui.combat.render({ force: true });
      const row = () => ui.combat.element.querySelector(`[data-combatant-id="${c.id}"]`);
      const restore = action => row()?.querySelector(`[data-action="${action}"]`) ?? null;
      assert.isNull(restore("restoreHalf"), "a full turn offers a Half-Action to put back");
      assert.isNull(restore("restoreReaction"), "a full turn offers a Reaction to put back");

      await c.spendAction("half");
      await ui.combat.render({ force: true });
      // **RE-QUERY AFTER EVERY RENDER**: a control held across one is detached.
      const half = restore("restoreHalf");
      assert.ok(half, "a spent Half-Action offers no way back");
      assert.ok(half.querySelector("i.fa-rotate-left"), "the restore button carries no glyph of its own");
      half.click();
      await until(() => c.budget.halfActions === 2, "the Half-Action to come back");
      await ui.combat.render({ force: true });
      assert.isNull(restore("restoreHalf"), "the button stands after there is nothing to restore");

      await c.spendAction("reaction");
      await ui.combat.render({ force: true });
      const reaction = restore("restoreReaction");
      assert.ok(reaction, "a spent Reaction offers no way back");
      reaction.click();
      await until(() => c.budget.reactions === 1, "the Reaction to come back");
      await c.resetBudget();
    });

    it("allows an Attack for each Half-Action, and the off hand rides one (D-711)", async function () {
      const c = combat.combatants.contents[0];
      await c.resetBudget();
      assert.isTrue((await c.spendAction("half", { isAttack: true })).ok);
      assert.isTrue((await c.spendAction("half", { isAttack: true })).ok, "the second Attack was refused");
      assert.isFalse((await c.spendAction("half", { isAttack: true })).ok, "a third Attack was allowed");
      await c.resetBudget();
      // **THE OFF HAND IS MADE IN YOUR OWN TURN** (06 §1, D-720), and this
      // fight is never started: `combat.combatant` is null, so nobody holds a
      // turn and every off-hand spend through the combatant's own door is
      // refused. The turn is pointed at this combatant for the rides below and
      // put back in the `finally`.
      const held = combat.turn;
      await combat.update({ turn: combat.turns.findIndex(t => t.id === c.id) });
      try {
        // The off hand costs nothing after an Attack, and both Half-Actions stand.
        assert.isTrue((await c.spendAction("half", { isAttack: true })).ok);
        assert.isTrue((await c.spendAction("half", { isAttack: true, isOffHand: true })).ok);
        assert.equal(c.budget.halfActions, 1, "the off hand charged a Half-Action");
        const second = await c.spendAction("half", { isAttack: true, isOffHand: true });
        assert.isFalse(second.ok, "a second Off-Hand Attack was allowed in one round");
        assert.equal(second.reason, "AZEROTH.Budget.Refuse.OffHandSpent");

        // And with nobody holding the turn it is refused by its own name,
        // whatever the budget still has in it.
        await c.resetBudget();
        assert.isTrue((await c.spendAction("half", { isAttack: true })).ok);
        await combat.update({ turn: null });
        const late = await c.spendAction("half", { isAttack: true, isOffHand: true });
        assert.isFalse(late.ok, "an off-hand blow was allowed on nobody's turn");
        assert.equal(late.reason, "AZEROTH.Budget.Refuse.OffHandNotYourTurn");
      } finally {
        await combat.update({ turn: held ?? null });
        await c.resetBudget();
      }
    });

    it("defaults a combatant with no token to hostile", async function () {
      // NAME THE COMBATANT. `contents[0]` is not deterministic — the embedded
      // collection follows randomly generated ids — so this test used to clear
      // whichever combatant came first and then restore it to "friendly"
      // regardless of the side it actually held. When it drew the Ghoul it left
      // the enemy on the party's side, and the ordering test below failed with
      // "expected 'Quench Ghoul' to equal 'Quench Mira'" about once a run.
      const kaelen = combat.combatants.find(c => c.name.includes("Kaelen"));

      // The safe default: a neutral creature never silently joins the players.
      await kaelen.setSide(null);
      assert.equal(kaelen.side, "hostile");
      await kaelen.setSide("friendly");
      assert.equal(kaelen.side, "friendly", "the fixture was left mutated");
    });

    it("orders side by side, not combatant by combatant", function () {
      // Kaelen 14 and Mira 11 are friendly; the Ghoul at 13 is hostile.
      // A per-combatant sort gives Kaelen, Ghoul, Mira. Side-based order keeps
      // the whole party together and the ghoul last.
      // Assert the fixture before the behaviour: a mutated side makes this look
      // like a broken sort when it is a broken setup.
      const sides = Object.fromEntries(combat.combatants.map(c => [c.name, c.side]));
      assert.deepEqual(sides, {
        "Quench Kaelen": "friendly",
        "Quench Mira": "friendly",
        "Quench Ghoul": "hostile"
      }, "an earlier test left a combatant on the wrong side");

      const order = combat.turns.map(t => t.name);
      assert.equal(order[0], "Quench Kaelen");
      assert.equal(order[1], "Quench Mira", "a slower ALLY still acts before a faster enemy");
      assert.equal(order[2], "Quench Ghoul");
      assert.equal(combat.leadingSide, "friendly");
    });

    it("hands the round to the enemy when they hold the highest", async function () {
      const ghoul = combat.combatants.find(c => c.name.includes("Ghoul"));
      const kaelen = combat.combatants.find(c => c.name.includes("Kaelen"));
      await kaelen.setSide("hostile");
      combat.setupTurns();
      assert.equal(combat.leadingSide, "hostile");
      await kaelen.setSide("friendly");
      combat.setupTurns();
      assert.ok(ghoul);
    });
  });

  describe("The content module", function () {
    it("is installed alongside the system", function () {
      // Only presence is checked here. What the manifest SAYS is a fact about
      // a file and is asserted in tools/content-module.test.mjs, where it does
      // not depend on somebody having run `npm run link`.
      const mod = game.modules.get("azeroth-content");
      assert.ok(mod, "azeroth-content is not installed — run npm run link");
      assert.equal(mod.id, "azeroth-content");
    });
  });
}


function itemSheetBatch(context) {
  const { describe, it, assert, after } = context;

  describe("Item sheet", function () {
    const made = [];
    const SUBTYPES = Object.keys(game.system.documentTypes.Item);

    after(async function () {
      this.timeout(15000);
      for (const item of made) await item.delete();
    });

    it("registers one sheet for every Item subtype", function () {
      // Registering none left all 1,339 compendium documents opening with
      // core's default sheet, which knows nothing about these DataModels.
      assert.isAbove(SUBTYPES.length, 10);
      for (const type of SUBTYPES) {
        const cfg = CONFIG.Item.sheetClasses[type];
        const active = Object.values(cfg ?? {}).find(s => s.default);
        assert.ok(active, `no default sheet for Item subtype "${type}"`);
        assert.equal(active.cls.name, "AzerothItemSheet", `subtype "${type}"`);
      }
    });

    it("renders every subtype without throwing", async function () {
      this.timeout(30000);
      for (const type of SUBTYPES) {
        const item = await Item.create({ name: `Quench ${type}`, type });
        made.push(item);

        const sheet = item.sheet;
        await sheet.render({ force: true });
        assert.ok(sheet.element, `subtype "${type}" rendered no element`);

        // A blank panel is not an error, so geometry alone reports it clean.
        // Assert the sheet actually SAYS something about the item.
        const text = sheet.element.textContent ?? "";
        assert.include(text, item.name, `subtype "${type}" did not render its name`);
        await sheet.close();
      }
    });

    it("draws a real compendium spell in 07 §9's field order", async function () {
      this.timeout(15000);
      // A synthetic item exercises the widgets; a REAL one exercises the field
      // paths against data the parser actually produced. A path that no longer
      // matches the schema renders an empty row, not an error.
      const pack = game.packs.get("azeroth-rpg.spells");
      const index = await pack.getIndex();
      const spell = await pack.getDocument(index.contents[0]._id);

      const sheet = spell.sheet;
      await sheet.render({ force: true });
      const labels = [...sheet.element.querySelectorAll(".azeroth-item__field dt")]
        .map(dt => dt.textContent.trim());

      // Whichever of these the spell carries must appear in this relative
      // order. A spell omits what does not apply (D4 §10.1's rule).
      const expected = ["School", "Tier", "Mana", "Action", "Range", "Target",
        "Duration", "Damage", "Test", "Prerequisite", "Classes"];
      const seen = expected.filter(l => labels.includes(l));
      const order = labels.filter(l => expected.includes(l));
      assert.deepEqual(order, seen, "the sheet reordered 07 §9's fields");
      assert.isAbove(seen.length, 3, "the spell sheet drew almost nothing");

      await sheet.close();
    });

    // ---- a price is coin, not copper (08 §2, D-672) ------------------------

    it("prints a price in the coin a shop would name, never in raw copper", async function () {
      this.timeout(20000);
      // 08 §2: prices are *quoted in the coin a shop would actually name -
      // coppers for rope and bread, silver for weapons and armor*. A longsword
      // is 2s 40c on the page and read `240` on the sheet for a version.
      const pack = game.packs.get("azeroth-rpg.weapons");
      const sword = (await pack.getDocuments()).find(d => d.name === "Longsword");
      assert.ok(sword, "no Longsword in the weapons pack");
      assert.equal(sword.system.cost, 240, "the pack no longer prices a longsword at 240 copper");

      const sheet = sword.sheet;
      await sheet.render({ force: true });
      try {
        const field = [...sheet.element.querySelectorAll(".azeroth-item__field")]
          .find(f => f.querySelector("dt")?.textContent.trim() === game.i18n.localize("AZEROTH.Item.Cost"));
        assert.ok(field, "the sheet draws no Cost field");
        const shown = field.querySelector("input")?.value ?? field.querySelector("dd").textContent.trim();
        assert.equal(shown, "2s 40c", "the price is not in coin");
        assert.notInclude(shown, "240", "raw copper is still on the sheet");
      } finally {
        await sheet.close();
      }
    });

    it("takes a price typed the way it is printed and stores copper", async function () {
      this.timeout(20000);
      const item = await Item.create({ name: "Quench priced", type: "gear" });
      made.push(item);
      const sheet = item.sheet;
      await sheet.render({ force: true });
      try {
        const input = sheet.element.querySelector('input[data-coin]');
        assert.ok(input, "the Cost field is not an editable coin box");
        // The GM types what the book prints; the schema stores copper.
        input.value = "1g 20s";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        for (let i = 0; i < 100 && item.system.cost !== 12000; i++) await new Promise(r => setTimeout(r, 50));
        assert.equal(item.system.cost, 12000, "a typed price did not reach the document as copper");

        // A bare number is still copper - every pack source is written that way.
        const again = sheet.element.querySelector('input[data-coin]');
        again.value = "240";
        again.dispatchEvent(new Event("change", { bubbles: true }));
        for (let i = 0; i < 100 && item.system.cost !== 240; i++) await new Promise(r => setTimeout(r, 50));
        assert.equal(item.system.cost, 240, "a bare number was not read as copper");
      } finally {
        await sheet.close();
      }
    });
  });
}


function regionBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Areas of effect as Regions", function () {
    let scene;
    const made = [];

    before(async function () {
      this.timeout(20000);
      // A 100px / 5ft grid, so a foot is 20 pixels and the arithmetic below is
      // checkable by hand.
      scene = await Scene.create({
        name: "Quench Area Scene",
        width: 2000, height: 2000,
        grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 5, units: "ft" }
      });
    });

    const messages = [];

    after(async function () {
      this.timeout(30000);
      for (const message of messages) await message?.delete();
      for (const item of made) await item.delete();
      if (scene) await scene.delete();
    });

    const spellWith = async (name, target, school = "fire") => {
      const item = await Item.create({
        name, type: "spell",
        system: { target, school, tier: 1 }
      });
      made.push(item);
      return item;
    };

    it("places a circle whose radius is in PIXELS", async function () {
      this.timeout(15000);
      const spell = await spellWith("Quench Blast", "A 20 ft radius on the ground");
      const region = await placeArea({
        spell, scene, origin: { x: 500, y: 500 }
      });

      assert.ok(region, "no Region was created");
      const shape = region.shapes[0];
      assert.equal(shape.type, "circle");
      // 20 ft * (100px / 5ft) = 400px. Feet passed through would give 20.
      assert.equal(shape.radius, 400);
      assert.equal(region.attachment.token, null, "a ground spell follows nobody");
    });

    it("gives a cone 07 SS9's angle and a line its five feet", async function () {
      this.timeout(15000);
      const cone = await placeArea({
        spell: await spellWith("Quench Cone", "A 15 ft cone"),
        scene, origin: { x: 400, y: 400 }, rotation: 90
      });
      assert.equal(cone.shapes[0].type, "cone");
      assert.closeTo(cone.shapes[0].angle, 53.130102, 0.001);
      assert.equal(cone.shapes[0].radius, 300);

      const line = await placeArea({
        spell: await spellWith("Quench Line", "A 100 ft line on the ground"),
        scene, origin: { x: 400, y: 400 }, rotation: 0
      });
      assert.equal(line.shapes[0].type, "line");
      assert.equal(line.shapes[0].length, 2000);
      assert.equal(line.shapes[0].width, 100, "five feet at 20px a foot");
    });

    it("places nothing at all for a single-target spell", async function () {
      this.timeout(15000);
      // 153 of 406 spells say "One creature". Offering a placement tool for
      // those is worse than offering none.
      const region = await placeArea({
        spell: await spellWith("Quench Bolt", "One creature"),
        scene, origin: { x: 100, y: 100 }
      });
      assert.isNull(region);
    });

    it("records whether the area picks its targets (07 SS9)", async function () {
      this.timeout(15000);
      const everyone = await placeArea({
        spell: await spellWith("Quench Nova", "A 20 ft radius on the ground"),
        scene, origin: { x: 700, y: 700 }
      });
      assert.isFalse(everyone.getFlag("azeroth-rpg", "picks"),
        "a plain area catches allies too");

      const picky = await placeArea({
        spell: await spellWith("Quench Blessing", "Each ally within 15 ft"),
        scene, origin: { x: 900, y: 900 }
      });
      assert.isTrue(picky.getFlag("azeroth-rpg", "picks"));
    });

    it("tells the chat card whether there is anything to place", async function () {
      this.timeout(20000);
      // The card's button appears off this flag. 153 of the 406 spells say
      // "One creature", so the flag is what keeps a placement button off them.
      const caster = await Actor.create({ name: "Quench Caster", type: "character" });
      made.push(caster);

      const withArea = await spellWith("Quench Nova Card", "A 20 ft radius on the ground");
      const single = await spellWith("Quench Bolt Card", "One creature");

      // PINNED TO GO OFF: a failed Casting Test's card offers no Place area at
      // all (the lead, 2026-09-26), so an unpinned d20 made this a coin toss.
      const unpin = pinDie(20);
      let a;
      let b;
      try {
        a = await castSpell({ actor: caster, spell: withArea });
        b = await castSpell({ actor: caster, spell: single });
      } finally {
        unpin();
      }
      messages.push(a, b);
      assert.isTrue(a.getFlag("azeroth-rpg", "success"), "a natural 20 did not go off");

      const areaFlag = a.getFlag("azeroth-rpg", "area");
      assert.ok(areaFlag, "an area spell's card carries its area");
      assert.equal(areaFlag.shape, "circle");
      assert.equal(areaFlag.distanceFt, 20);
      assert.isNotOk(b.getFlag("azeroth-rpg", "area"),
        "a single-target spell carries no area");

      // The button is rendered off that flag, so check the markup too.
      const htmlA = await a.renderHTML();
      const htmlB = await b.renderHTML();
      assert.ok(htmlA.querySelector('[data-action="placeArea"]'),
        "the area card has no place button");
      assert.isNull(htmlB.querySelector('[data-action="placeArea"]'),
        "the single-target card should have no place button");
    });

    it("places a 'centered on you' area on the caster without asking", async function () {
      this.timeout(30000);
      // 07 §9 measures from the caster unless the entry says otherwise, so this
      // path must NOT wait for a click - asking would be asking the caster
      // where they are standing. The test would hang if it did.
      const previous = canvas.scene;
      await scene.view();

      const caster = await Actor.create({ name: "Quench Self Caster", type: "character" });
      made.push(caster);
      const [tokenDoc] = await scene.createEmbeddedDocuments("Token", [{
        name: "Quench Self Caster",
        actorId: caster.id,
        x: 600, y: 600, width: 1, height: 1
      }]);

      const spell = await spellWith("Quench Aura", "A 15 ft radius centered on you");
      const region = await placeSpellArea({ spell, actor: caster });

      assert.ok(region, "no Region was placed");
      // `RegionDocument` REPLACES the attachment id with the resolved
      // TokenDocument on initialize (client/documents/region.mjs:174), even
      // though the schema declares `idOnly: true`. The id written to the
      // database is at `_source`. Same shape as `Folder#folder`.
      assert.equal(region.attachment.token?.id, tokenDoc.id,
        "a 'centered on you' area follows the caster");
      assert.equal(region._source.attachment.token, tokenDoc.id,
        "the stored value is the id");
      assert.equal(region.shapes[0].radius, 300, "15 ft at 20px a foot");

      await tokenDoc.delete();
      if (previous) await previous.view();
    });

    // ---- D-723: a cone and a line face where the caster chooses -----------
    //
    // Every cone and line placed from a card faced EAST: a cone never asked
    // for a click, so it aimed from the token's centre at the token's centre,
    // and `atan2(0, 0)` is 0. No test pinned a facing, which is why it
    // shipped. These press the board the way a player does - a pointerdown on
    // the canvas element at the client point of a canvas point - and read the
    // Region back off the scene.

    /** Press the board at a canvas point. */
    const pressBoard = (point, { button = 0 } = {}) => {
      const client = canvas.clientCoordinatesFromCanvas(point);
      canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
        clientX: client.x, clientY: client.y, button, buttons: button === 2 ? 2 : 1,
        pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
      }));
    };

    /** The aim preview, while a facing is being picked, or null. */
    const aimPreview = () => canvas.controls?.children?.find(c => c.name === AIM_PREVIEW && !c.destroyed) ?? null;

    /** Poll for a state rather than sleeping for one. */
    const until = async (predicate, ms = 5000) => {
      for (let i = 0; i < ms / 25; i++) {
        if (predicate()) return true;
        await new Promise(r => setTimeout(r, 25));
      }
      return Boolean(predicate());
    };

    /** Degrees between two facings, the short way round: 359.99 is 0. */
    const facingGap = (a, b) => {
      const gap = Math.abs((((a - b) % 360) + 360) % 360);
      return Math.min(gap, 360 - gap);
    };

    /**
     * View the area scene and ASSERT that it drew. The guard comes after the
     * view it is about, and it fails rather than skips (CLAUDE.md §15).
     */
    const viewAreaScene = async () => {
      await scene.view();
      assert.equal(canvas.scene?.id, scene.id, "the area scene is not the one on the board");
      assert.isTrue(canvas.ready, "the canvas did not draw the area scene");
    };

    /** A caster with a one-square token whose centre is (650, 650). */
    const casterOnBoard = async name => {
      const caster = await Actor.create({ name, type: "character" });
      made.push(caster);
      const [tokenDoc] = await scene.createEmbeddedDocuments("Token", [{
        name, actorId: caster.id, x: 600, y: 600, width: 1, height: 1
      }]);
      assert.isTrue(await until(() => caster.getActiveTokens(false, false).length > 0), `${name} has no token on the board`);
      return { caster, tokenDoc };
    };

    it("aims a cone from its caster's token with one press and leaves it on the ground (D-723)", async function () {
      this.timeout(30000);
      const previous = canvas.scene;
      let placed = null;
      try {
        await viewAreaScene();
        placed = await casterOnBoard("Quench Cone Caster");
        const spell = await spellWith("Quench Aimed Cone", "A 15 ft cone", "frost");
        const before = scene.regions.size;

        const placing = placeSpellArea({ spell, actor: placed.caster });
        // The cone starts on the token, so the one thing it asks is its
        // facing: the aim is drawn before any press has landed.
        assert.isTrue(await until(() => aimPreview() !== null), "no aim preview for a cone whose caster is on the board");
        assert.equal(scene.regions.size, before, "the cone was placed before it was aimed");

        pressBoard({ x: 650, y: 950 });
        const region = await placing;
        assert.ok(region, "no Region was placed");
        const shape = region.shapes[0];
        assert.equal(shape.type, "cone");
        assert.closeTo(shape.x, 650, 0.5, "the cone does not start at the token's centre");
        assert.closeTo(shape.y, 650, 0.5, "the cone does not start at the token's centre");
        assert.isBelow(facingGap(shape.rotation, 90), 0.5, `the cone faces ${shape.rotation}, not the press below its caster`);
        assert.isNull(region._source.attachment.token, "an aimed cone must not follow its caster");
        assert.isNull(aimPreview(), "the aim preview outlived the pick");
      } finally {
        await placed?.tokenDoc?.delete();
        if (previous) await previous.view();
      }
    });

    it("starts a line where it is pressed and runs it towards the second press (D-723)", async function () {
      this.timeout(30000);
      const previous = canvas.scene;
      try {
        await viewAreaScene();
        const spell = await spellWith("Quench Aimed Wall", "A 20 ft line on the ground", "frost");
        const before = scene.regions.size;

        // A line on the ground is pressed where it starts, caster or not.
        const placing = placeSpellArea({ spell });
        assert.isNull(aimPreview(), "the line was aimed before it had a start");
        pressBoard({ x: 1000, y: 400 });
        assert.isTrue(await until(() => aimPreview() !== null), "the first press did not open the aim");
        assert.equal(scene.regions.size, before, "one press placed the line");

        pressBoard({ x: 1000, y: 1000 });
        const region = await placing;
        assert.ok(region, "no Region was placed");
        const shape = region.shapes[0];
        assert.equal(shape.type, "line");
        assert.closeTo(shape.x, 1000, 0.5, "the line does not start at the first press");
        assert.closeTo(shape.y, 400, 0.5, "the line does not start at the first press");
        assert.isBelow(facingGap(shape.rotation, 90), 0.5, `the line runs at ${shape.rotation}, not towards the second press`);
        assert.equal(shape.length, 400, "20 ft at 20px a foot, whatever the distance between the presses");
        assert.equal(shape.width, 100, "07 SS9's five feet at 20px a foot");
        assert.isNull(region._source.attachment.token, "a line on the ground follows nobody");
        assert.isNull(aimPreview(), "the aim preview outlived the pick");
      } finally {
        if (previous) await previous.view();
      }
    });

    it("places nothing when the aim is cancelled with Escape or a right-click (D-723)", async function () {
      this.timeout(30000);
      const previous = canvas.scene;
      let placed = null;
      try {
        await viewAreaScene();
        placed = await casterOnBoard("Quench Cancelling Caster");
        const spell = await spellWith("Quench Cancelled Cone", "A 15 ft cone");
        const before = scene.regions.size;

        const escaped = placeSpellArea({ spell, actor: placed.caster });
        assert.isTrue(await until(() => aimPreview() !== null), "there was no aim to cancel");
        // Dispatched on the body, so the key travels the capture path a real
        // one does and the picker on the window hears it first. **An Escape
        // that got past it would reach core's dismiss, which closes EVERY open
        // window** - Quench's results window too, and its reporter then stalls
        // the whole run - so a guard one step further down the capture path
        // stops a leaked key before core's window listener and says so.
        let leaked = false;
        const guard = event => {
          if (event.key !== "Escape") return;
          leaked = true;
          event.stopPropagation();
        };
        document.addEventListener("keydown", guard, true);
        try {
          document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
        } finally {
          document.removeEventListener("keydown", guard, true);
        }
        assert.isFalse(leaked, "the Escape that cancelled the aim went on past the picker to the page");
        assert.isNull(await escaped, "Escape placed a Region");
        assert.isNull(aimPreview(), "the aim preview outlived Escape");

        const refused = placeSpellArea({ spell, actor: placed.caster });
        assert.isTrue(await until(() => aimPreview() !== null), "there was no aim to cancel");
        pressBoard({ x: 650, y: 950 }, { button: 2 });
        assert.isNull(await refused, "a right-click placed a Region");
        assert.isNull(aimPreview(), "the aim preview outlived the right-click");

        assert.equal(scene.regions.size, before, "a cancelled aim left a Region behind");
      } finally {
        await placed?.tokenDoc?.delete();
        if (previous) await previous.view();
      }
    });

    it("asks a caster with no token where the cone starts, then where it faces (D-723)", async function () {
      this.timeout(30000);
      const previous = canvas.scene;
      const warned = [];
      const warn = ui.notifications.warn;
      try {
        await viewAreaScene();
        // Nothing controlled, or the cone would take that token as its caster.
        canvas.tokens.releaseAll();
        const caster = await Actor.create({ name: "Quench Tokenless Caster", type: "character" });
        made.push(caster);
        const spell = await spellWith("Quench Tokenless Cone", "A 15 ft cone");
        ui.notifications.warn = (...args) => {
          warned.push(String(args[0]));
          return warn.apply(ui.notifications, args);
        };
        const before = scene.regions.size;

        const placing = placeSpellArea({ spell, actor: caster });
        assert.isNull(aimPreview(), "a cone with nowhere to spread from was aimed before it had a start");
        pressBoard({ x: 400, y: 400 });
        assert.isTrue(await until(() => aimPreview() !== null), "the first press did not open the aim");
        assert.equal(scene.regions.size, before, "one press placed a cone whose caster is not on the board");

        // A press on the start names no direction: refused in words, and the
        // aim waits for another press rather than ending.
        pressBoard({ x: 400, y: 400 });
        const refusal = game.i18n.format("AZEROTH.Area.AimSamePoint", { name: spell.name });
        assert.isTrue(await until(() => warned.includes(refusal)), `a press on the start was not refused; warned: ${JSON.stringify(warned)}`);
        assert.equal(scene.regions.size, before, "a press on the start placed the cone");
        assert.isNotNull(aimPreview(), "the refusal ended the aim");

        pressBoard({ x: 400, y: 100 });
        const region = await placing;
        assert.ok(region, "no Region was placed");
        const shape = region.shapes[0];
        assert.equal(shape.type, "cone");
        assert.closeTo(shape.x, 400, 0.5, "the cone does not start at the first press");
        assert.closeTo(shape.y, 400, 0.5, "the cone does not start at the first press");
        assert.isBelow(facingGap(shape.rotation, 270), 0.5, `the cone faces ${shape.rotation}, not the last press`);
        assert.isNull(region._source.attachment.token, "a cone with no caster token follows nobody");
      } finally {
        ui.notifications.warn = warn;
        if (previous) await previous.view();
      }
    });

    it("places one Region when a second placement starts before the first is pressed (D-723)", async function () {
      this.timeout(30000);
      const previous = canvas.scene;
      try {
        await viewAreaScene();
        const first = await spellWith("Quench First Circle", "A 10 ft radius on the ground");
        const second = await spellWith("Quench Second Circle", "A 10 ft radius on the ground");
        const before = scene.regions.size;

        // Two Place area presses before a click used to leave two picks
        // waiting, and the one click resolved both. The second pick cancels
        // the first now, which hands its caller nothing.
        const waiting = placeSpellArea({ spell: first });
        const replacing = placeSpellArea({ spell: second });
        pressBoard({ x: 1500, y: 1500 });
        const [cancelled, region] = await Promise.all([waiting, replacing]);

        assert.isNull(cancelled, "the first placement was not cancelled when the second began");
        assert.ok(region, "the second placement placed nothing");
        assert.isTrue(region.name.startsWith("Quench Second Circle"), `the Region placed was ${region.name}`);
        assert.equal(scene.regions.size, before + 1, "one press placed more than one Region");
      } finally {
        if (previous) await previous.view();
      }
    });

    it("keeps a press made while aiming off the layer, so aiming at a token does not select it (D-723)", async function () {
      this.timeout(30000);
      const previous = canvas.scene;
      let placed = null;
      let targetDoc = null;
      try {
        await viewAreaScene();
        canvas.tokens.activate();
        placed = await casterOnBoard("Quench Aiming Caster");
        const target = await Actor.create({ name: "Quench Aimed-At Target", type: "character" });
        made.push(target);
        [targetDoc] = await scene.createEmbeddedDocuments("Token", [{
          name: "Quench Aimed-At Target", actorId: target.id, x: 900, y: 900, width: 1, height: 1
        }]);
        assert.isTrue(await until(() => target.getActiveTokens(false, false)[0]?.renderable === true), "the target token was never drawn");
        const spell = await spellWith("Quench Cone At A Token", "A 15 ft cone");
        canvas.tokens.releaseAll();

        const placing = placeSpellArea({ spell, actor: placed.caster });
        assert.isTrue(await until(() => aimPreview() !== null), "there was no aim to press");

        // HOVER FIRST. Core's interaction manager takes a press on a token
        // only once the pointer is over it, so a synthetic press with no hover
        // selects nothing whatever the picker does, and this test could not
        // fail. With the hover, the listener that sat on the board element
        // let PIXI hand the press to the token, and the token was selected.
        const client = canvas.clientCoordinatesFromCanvas({ x: 950, y: 950 });
        const init = { clientX: client.x, clientY: client.y, pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true };
        const board = canvas.app.view;
        board.dispatchEvent(new PointerEvent("pointerover", { ...init, button: 0, buttons: 0 }));
        board.dispatchEvent(new PointerEvent("pointermove", { ...init, button: 0, buttons: 0 }));
        assert.isTrue(await until(() => canvas.tokens.hover?.id === targetDoc.id), "the pointer never came over the target, so the press below proves nothing");
        board.dispatchEvent(new PointerEvent("pointerdown", { ...init, button: 0, buttons: 1 }));
        await new Promise(r => setTimeout(r, 30));
        board.dispatchEvent(new PointerEvent("pointerup", { ...init, button: 0, buttons: 0 }));

        const region = await placing;
        assert.ok(region, "no Region was placed");
        assert.isBelow(facingGap(region.shapes[0].rotation, 45), 0.5, `the cone faces ${region.shapes[0].rotation}, not the token it was aimed at`);
        await new Promise(r => setTimeout(r, 300));
        assert.deepEqual(canvas.tokens.controlled.map(t => t.name), [], "the press that aimed the cone also selected the token under it");
      } finally {
        canvas.tokens.releaseAll();
        await targetDoc?.delete();
        await placed?.tokenDoc?.delete();
        if (previous) await previous.view();
      }
    });

    it("measures a line from where it is pressed, marked as it is made (D-723)", async function () {
      this.timeout(30000);
      const previous = canvas.scene;
      const told = [];
      const info = ui.notifications.info;
      // Whether the measured mark was on the Region the moment it existed,
      // rather than written after it by a second update.
      let markedAtBirth = null;
      // The line the bar's tool lands: a tool pressed on the bar hands nothing
      // back to the test, so the Region is taken as it is made.
      let lineRegion = null;
      const hook = Hooks.on("createRegion", doc => {
        if (doc.parent?.id === scene.id && doc.shapes?.[0]?.type === "line") {
          markedAtBirth = doc.getFlag("azeroth-rpg", "measured") === true;
          lineRegion = doc;
        }
      });
      try {
        await viewAreaScene();
        canvas.tokens.activate();
        canvas.tokens.releaseAll();
        // THROUGH THE BAR (D-766): calling the tool's `onChange` by hand passed
        // while the bar itself never offered Line at all.
        await chooseControl("azerothMeasure");
        assert.ok(toolButton("line"), "the Measure control draws no Line tool on the bar");
        ui.notifications.info = (...args) => {
          told.push(String(args[0]));
          return info.apply(ui.notifications, args);
        };

        pressTool("line");
        let dialog = null;
        assert.isTrue(await until(() => {
          dialog = foundry.applications.instances.get("azeroth-measure-dialog") ?? null;
          return Boolean(dialog?.rendered && dialog.element?.querySelector('input[name="distance"]'));
        }), "the Measure control's distance dialog did not open");
        dialog.element.querySelector('input[name="distance"]').value = "20";
        dialog.element.querySelector('button[data-action="place"]').click();

        const start = game.i18n.format("AZEROTH.Area.ClickToStart", { name: "A 20 ft line on the ground" });
        assert.isTrue(await until(() => told.includes(start)), `the measured line did not ask where it starts; told: ${JSON.stringify(told)}`);
        pressBoard({ x: 1000, y: 400 });
        assert.isTrue(await until(() => aimPreview() !== null), "the start press did not open the aim");
        pressBoard({ x: 1400, y: 400 });

        assert.isTrue(await until(() => lineRegion !== null), "the Measure control placed nothing");
        const region = lineRegion;
        const shape = region.shapes[0];
        assert.equal(shape.type, "line");
        assert.closeTo(shape.x, 1000, 0.5, "the measured line does not start at the first press");
        assert.closeTo(shape.y, 400, 0.5, "the measured line does not start at the first press");
        assert.isBelow(facingGap(shape.rotation, 0), 0.5, `the measured line runs at ${shape.rotation}, not towards the second press`);
        assert.equal(shape.length, 400, "20 ft at 20px a foot");
        assert.isTrue(region.getFlag("azeroth-rpg", "measured"), "the measured line is not marked");
        assert.isTrue(markedAtBirth, "the measured mark arrived after the Region rather than with it");
      } finally {
        Hooks.off("createRegion", hook);
        ui.notifications.info = info;
        // A dialog left open by a failure above would hold the tool's promise.
        await foundry.applications.instances.get("azeroth-measure-dialog")?.close?.();
        await clearMeasuredAreas(scene);
        // Back on the Tokens control, where the rest of the batch expects the bar.
        await chooseControl("tokens").catch(() => {});
        if (previous) await previous.view();
      }
    });

    it("survives the round trip through the document schema", async function () {
      this.timeout(15000);
      // THE POINT OF DOING THIS IN A LIVE WORLD. A field Foundry does not
      // recognise is dropped on create with no error, so a shape that looks
      // right in a unit test can come back empty from the database.
      const spell = await spellWith("Quench Persist", "A 30 ft radius on the ground");
      const region = await placeArea({ spell, scene, origin: { x: 300, y: 300 } });

      const fetched = scene.regions.get(region.id);
      assert.ok(fetched, "the Region was not stored on the scene");
      assert.equal(fetched.shapes.length, 1);
      assert.equal(fetched.shapes[0].radius, 600);
      assert.equal(fetched.flags["azeroth-rpg"].spellUuid, spell.uuid);
    });
  });
}


function talentTreeBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The talent tree", function () {
    let actor;
    let sheet;

    before(async function () {
      this.timeout(30000);
      actor = await Actor.create({ name: "Quench Talent Taker", type: "character" });

      // A real branch out of the compendium, not a hand-built one. 04's
      // branches are all shaped 3/3/3/2/1 and the tree depends on that.
      const pack = game.packs.get("azeroth-rpg.talents");
      const index = await pack.getIndex({ fields: ["system.className", "system.branch"] });
      const first = index.find(e => e.system?.branch);
      const branch = index.filter(e =>
        e.system.className === first.system.className
        && e.system.branch === first.system.branch);
      assert.equal(branch.length, 12, "a branch is twelve talents");

      const docs = [];
      for (const entry of branch) docs.push((await pack.getDocument(entry._id)).toObject());
      await actor.createEmbeddedDocuments("Item", docs);

      sheet = actor.sheet;
      await sheet.render({ force: true });
    });

    after(async function () {
      this.timeout(20000);
      await sheet?.close();
      await actor?.delete();
    });

    it("lists the branch and nothing is spent yet", async function () {
      const element = sheet.element;
      const branches = element.querySelectorAll('[data-action="openBranch"]');
      assert.equal(branches.length, 1, "one branch on the sheet");
      assert.include(branches[0].textContent, "0", "nothing spent yet");
    });

    it("opens the tree and draws five tiers of the right shape", async function () {
      this.timeout(20000);
      const button = sheet.element.querySelector('[data-action="openBranch"]');
      button.click();
      // The action re-renders the part; wait for it to land.
      await new Promise(r => setTimeout(r, 300));

      const tiers = sheet.element.querySelectorAll(".azeroth-talent-tier");
      assert.equal(tiers.length, 5, "04 SS1: five branch tiers");

      const counts = [...tiers].map(t => t.querySelectorAll(".azeroth-talent").length);
      assert.deepEqual(counts, [3, 3, 3, 2, 1], "3/3/3/2/1");
    });

    it("locks every tier but the first while nothing is spent", function () {
      // THE GATE IS POINTS IN THE BRANCH, not character level. A level-1
      // character and a level-20 character who has spent nothing here see the
      // same tree, and that is the rule rather than a bug.
      const tiers = [...sheet.element.querySelectorAll(".azeroth-talent-tier")];
      const locked = tiers.map(t => t.classList.contains("azeroth-talent-tier--locked"));
      assert.deepEqual(locked, [false, true, true, true, true]);
    });

    it("refuses a locked talent even when its button is clicked", async function () {
      this.timeout(20000);
      // A disabled button is a hint, not a rule: the rendered state can be
      // stale. The action re-checks the gate.
      const tier5 = sheet.element.querySelector('[data-tier="5"] .azeroth-talent');
      const id = tier5.dataset.itemId;
      const before = actor.items.get(id).system.taken;

      await sheet.options.actions.takeTalent.call(
        sheet, new Event("click"), { dataset: { itemId: id } });

      assert.equal(actor.items.get(id).system.taken, before,
        "a tier-5 talent was taken with nothing spent in the branch");
    });

    it("shows the roads out of a career, with what each still needs", async function () {
      this.timeout(30000);
      // A REAL career out of the compendium. 03 gates on a prior career and
      // nothing else, and the prose half of an Entry is the GM's call - so an
      // exit shows both what it mechanically needs and what it narratively
      // asks, rather than a bare green light.
      const pack = game.packs.get("azeroth-rpg.careers");
      const index = await pack.getIndex({ fields: ["system.tier"] });
      const tier1 = index.find(e => e.system?.tier === 1);
      const career = await pack.getDocument(tier1._id);

      const walker = await Actor.create({ name: "Quench Career Walker", type: "character" });
      await walker.createEmbeddedDocuments("Item", [career.toObject()]);

      // The Actor points itself at the career it was just given, in an
      // `_onCreateDescendantDocuments` update. Let that land before rendering.
      await new Promise(r => setTimeout(r, 200));
      assert.ok(walker.careerItem, "the actor did not adopt the career it was given");

      const app = walker.sheet;
      await app.render({ force: true });

      const exits = app.element.querySelectorAll(".azeroth-career-exit");
      assert.isAbove(exits.length, 0, "a tier-1 career has roads out");

      // THE ROADS OUT ARE OPEN, and that is the rule rather than a hole in it:
      // each names this very career in its Entry, and the character holds it.
      // The first draft of this test asserted the opposite and was wrong about
      // 03 rather than about the code.
      const blocked = app.element.querySelectorAll(".azeroth-career-exit--blocked");
      assert.equal(blocked.length, 0,
        "holding the named career is what opens its roads");

      // What is NOT satisfied is the prose half, and the sheet states it
      // rather than hiding it behind a green light.
      const narrative = app.element.querySelectorAll(".azeroth-career-exit-narrative");
      assert.isAbove(narrative.length, 0,
        "03's prose requirement should be shown beside the road");

      // And a career this one does not lead to stays shut.
      const stranger = await pack.getDocument(
        index.find(e => e.system?.tier === 4)._id
      );
      const state = isEligible(
        { current: career.name, held: [career.name], tier: 1 },
        stranger
      );
      assert.isFalse(state.ok, "a tier-4 career is not reachable from tier 1");
      assert.isAbove(state.requires.length, 0, "and it names what it wants");

      await app.close();
      await walker.delete();
    });

    it("takes a tier-1 talent and moves the points", async function () {
      this.timeout(20000);
      const tier1 = sheet.element.querySelector('[data-tier="1"] .azeroth-talent');
      const id = tier1.dataset.itemId;
      const before = actor.items.get(id).system.taken;

      await sheet.options.actions.takeTalent.call(sheet, new Event("click"), { dataset: { itemId: id } });

      assert.equal(actor.items.get(id).system.taken, before + 1);
    });
  });

  /**
   * WoW Classic's talent frame (D-758), measured on a real Warrior's Arms and
   * driven through the real controls - never a class added by hand (D-748: a
   * test that stages its own state proves the stylesheet and not the sheet).
   *
   * Every query is scoped to the Progress tab's own section (D-751). The
   * talents are named because the shots name them; `before` asserts each is
   * still the rank and tier the tests assume, so a change to 04 fails there,
   * in words, rather than three assertions later.
   */
  describe("The talent tree as WoW's talent frame (D-758)", function () {
    let actor;
    let sheet;

    const tab = () => sheet.element.querySelector('section[data-tab="progress"]');
    const tree = () => tab()?.querySelector(".azeroth-tree") ?? null;
    const arms = () => actor.items.filter(i => i.type === "talent" && !i.system.race
      && i.system.className === "Warrior" && i.system.branch === "Arms");
    const talent = name => arms().find(i => i.name === name) ?? null;
    const tile = name => {
      const item = talent(name);
      return item ? tab()?.querySelector(`.azeroth-talent[data-item-id="${item.id}"]`) ?? null : null;
    };
    const socketOf = name => tile(name)?.querySelector(".azeroth-talent-socket") ?? null;
    const badgeOf = name => tile(name)?.querySelector(".azeroth-talent-rank")?.textContent.trim() ?? null;
    const waitFor = async (fn, ms = 10000) => {
      for (let i = 0; i < ms / 50; i++) {
        if (fn()) return true;
        await new Promise(r => setTimeout(r, 50));
      }
      return Boolean(fn());
    };
    /** Press a control as a pointer would (`detail` 1) or as a key would (`detail` 0). */
    const press = (el, detail = 1) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail }));
    /** Learn a rank through the card's own button, and wait for exactly what the badge will say. */
    const learn = async (name, detail = 1) => {
      const item = talent(name);
      const want = (Number(item.system.taken) || 0) + 1;
      const button = tile(name)?.querySelector('[data-action="takeTalent"]');
      assert.ok(button, `${name} offers no Learn`);
      press(button, detail);
      assert.isTrue(await waitFor(() => talent(name)?.system.taken === want), `${name} did not reach ${want}`);
      assert.isTrue(await waitFor(() => badgeOf(name) === `${want}/${item.system.ranks}`), `${name}'s badge never read ${want}/${item.system.ranks}`);
      await settle();
    };

    before(async function () {
      this.timeout(90000);
      actor = await makeCharacter({ name: "ZZ Quench Talent Frame", classes: [["Warrior", 6]] });
      // The talents the tests name, as 04 prints them.
      for (const [name, tier, ranks] of [["Heavy Hand", 1, 1], ["Deep Cut", 1, 3], ["Wide Swing", 1, 2],
        ["Precise Strike", 2, 3], ["Follow Through", 2, 2], ["Sundering Blows", 3, 2], ["Whirlwind", 5, 1]]) {
        const item = talent(name);
        assert.ok(item, `Arms holds no ${name}`);
        assert.deepEqual([item.system.tier, item.system.ranks], [tier, ranks], `${name} is no longer tier ${tier} with ${ranks} rank(s)`);
      }
      sheet = await openSheet(actor);
      sheet.changeTab("progress", "primary");
      await settle();
      const open = [...tab().querySelectorAll('[data-action="openBranch"]')].find(b => b.dataset.branch === "Warrior/Arms");
      assert.ok(open, "no Warrior/Arms branch to open");
      press(open);
      assert.isTrue(await waitFor(() => tree()?.querySelector(".azeroth-tree-field")), "the tree never drew");
      await settle();
    });

    after(async function () {
      this.timeout(30000);
      await sheet?.close();
      await cleanupFixtures();
    });

    it("puts focus on Back when a branch opens, since the button pressed is gone", function () {
      assert.equal(document.activeElement, tree().querySelector(".azeroth-tree-back"), "focus fell off the drill-down");
    });

    it("draws every arrow the branch names, the ones from the first column included", function () {
      // D-758's bug: `{{#if requiresColumn}}` dropped every arrow whose
      // prerequisite sat in column 0.
      const arrows = [...tab().querySelectorAll(".azeroth-tree .azeroth-talent-arrow")];
      const requires = arms().filter(i => i.system.requires);
      assert.equal(arrows.length, requires.length, "an arrow is missing");
      const fromFirst = requires.filter(i => {
        const pre = arms().find(t => sameTalent(i.system.requires, { name: t.name, identifier: t.system.identifier }));
        return pre && tab().querySelector(`.azeroth-talent[data-item-id="${pre.id}"]`)?.dataset.column === "1";
      });
      assert.isAbove(fromFirst.length, 0, "no arrow runs from the first column");
      for (const dependent of requires) {
        assert.ok(tab().querySelector(`.azeroth-talent[data-item-id="${dependent.id}"] > .azeroth-talent-arrow`),
          `${dependent.name} names ${dependent.system.requires} and draws no arrow`);
      }
    });

    it("runs each arrow from its prerequisite's socket to its own, vertically", function () {
      for (const dependent of arms().filter(i => i.system.requires)) {
        const pre = arms().find(t => sameTalent(dependent.system.requires, { name: t.name, identifier: t.system.identifier }));
        const from = tab().querySelector(`.azeroth-talent[data-item-id="${pre.id}"] > .azeroth-talent-socket`).getBoundingClientRect();
        const to = tab().querySelector(`.azeroth-talent[data-item-id="${dependent.id}"] > .azeroth-talent-socket`).getBoundingClientRect();
        const arrow = tab().querySelector(`.azeroth-talent[data-item-id="${dependent.id}"] > .azeroth-talent-arrow`).getBoundingClientRect();
        assert.isAtMost(Math.abs(arrow.top - from.bottom), 2, `${dependent.name}'s arrow starts ${arrow.top - from.bottom}px off ${pre.name}`);
        assert.isAtMost(Math.abs(arrow.bottom - to.top), 3, `${dependent.name}'s arrow ends ${to.top - arrow.bottom}px off its socket`);
        const mid = r => (r.left + r.right) / 2;
        assert.isAtMost(Math.abs(mid(arrow) - mid(from)), 1, `${dependent.name}'s arrow is not under ${pre.name}`);
        assert.isAtMost(Math.abs(mid(from) - mid(to)), 1, `${dependent.name} is not in ${pre.name}'s column`);
      }
    });

    it("stands each rail cell level with its tier row", function () {
      const centre = el => { const r = el.getBoundingClientRect(); return (r.top + r.bottom) / 2; };
      for (let n = 1; n <= 5; n++) {
        const rail = tab().querySelector(`.azeroth-tree-rail [data-rail-tier="${n}"]`);
        const row = tab().querySelector(`.azeroth-tree-field .azeroth-talent-tier[data-tier="${n}"]`);
        assert.ok(rail && row, `tier ${n} has no rail cell or no row`);
        assert.isAtMost(Math.abs(centre(rail) - centre(row)), 1, `tier ${n}'s rail cell stands ${centre(rail) - centre(row)}px off its row`);
        assert.equal(row.getAttribute("aria-labelledby"), rail.id, `tier ${n}'s row is not named by its rail cell`);
      }
      // A shut tier says so in words, and the first is open.
      assert.include(tab().querySelector('[data-rail-tier="2"]').textContent, "4");
      assert.isNull(tab().querySelector('[data-rail-tier="1"] .azeroth-tree-rail-gate'));
    });

    it("hangs the class crest behind the field, faint, and nothing but a plate or the card over it", async function () {
      const crest = tab().querySelector(".azeroth-tree-field > .azeroth-tree-crest");
      assert.ok(crest, "no crest");
      assert.match(crest.src, /\/crest\/warrior\.png$/);
      assert.equal(crest.getAttribute("alt"), "");
      assert.equal(crest.getAttribute("aria-hidden"), "true");
      assert.isTrue(await waitFor(() => crest.complete && crest.naturalWidth > 0), "the crest never loaded");
      assert.equal(crest.naturalWidth, 320);
      assert.equal(getComputedStyle(crest).opacity, "0.14");
      // Every text node whose painted box overlaps the crest is a badge or a card.
      const box = crest.getBoundingClientRect();
      const walker = document.createTreeWalker(tab(), NodeFilter.SHOW_TEXT);
      const loose = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const over = [...range.getClientRects()].some(r => r.width > 0 && r.height > 0
          && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top);
        if (over && !node.parentElement.closest(".azeroth-talent-rank, .azeroth-talent-card")) loose.push(node.textContent.trim().slice(0, 24));
      }
      assert.deepEqual(loose, [], "unplated text over the crest");
    });

    it("draws each socket as a real button inside the sheet's form, so Escape never closes the window", function () {
      const socket = socketOf("Heavy Hand");
      assert.equal(socket.tagName, "BUTTON");
      assert.equal(socket.type, "button");
      assert.ok(socket.form, "the socket is outside the sheet's form, so core's KeyboardManager would close the window on Escape");
      assert.equal(socket.getAttribute("aria-controls"), tile("Heavy Hand").querySelector(".azeroth-talent-card").id);
      assert.ok(document.getElementById(socket.getAttribute("aria-describedby")), "the description points at nothing");
      assert.match(socket.getAttribute("aria-label"), /^Heavy Hand, 0 of 1\. /);
    });

    it("spends through Learn: each tile wears its state, its badge and its arrow", async function () {
      this.timeout(60000);
      await learn("Heavy Hand");
      await learn("Deep Cut");
      await learn("Deep Cut");
      await learn("Wide Swing");
      // Four spent opens tier 2 (04 §1).
      await learn("Precise Strike");
      const has = (name, cls) => tile(name)?.classList.contains(`azeroth-talent--${cls}`);
      assert.isTrue(has("Heavy Hand", "maxed"), "Heavy Hand is not maxed");
      assert.isTrue(has("Heavy Hand", "taken"), "the taken class is gone");
      assert.equal(badgeOf("Heavy Hand"), "1/1");
      assert.isTrue(has("Deep Cut", "raisable"));
      assert.equal(badgeOf("Deep Cut"), "2/3");
      assert.isTrue(has("Wide Swing", "raisable"));
      assert.isTrue(has("Precise Strike", "raisable"));
      assert.equal(badgeOf("Precise Strike"), "1/3");
      assert.isTrue(has("Follow Through", "available"));
      assert.equal(badgeOf("Follow Through"), "0/2");
      assert.isTrue(has("Sundering Blows", "locked"));
      assert.include(socketOf("Deep Cut").getAttribute("aria-label"), "2 of 3");
      // One rank of the prerequisite meets the arrow; none leaves it unmet.
      assert.isTrue(tile("Precise Strike").querySelector(".azeroth-talent-arrow").classList.contains("is-met"), "Heavy Hand's arrow is not met");
      assert.isFalse(tile("Sundering Blows").querySelector(".azeroth-talent-arrow").classList.contains("is-met"));
      assert.isFalse(tile("Whirlwind").querySelector(".azeroth-talent-arrow").classList.contains("is-met"));
      // The ring's colour carries the state, measured off the element.
      const ring = name => parseColour(getComputedStyle(socketOf(name)).borderTopColor)?.slice(0, 3).map(Math.round);
      const token = name => parseColour(getComputedStyle(sheet.element).getPropertyValue(name).trim())?.slice(0, 3);
      assert.deepEqual(ring("Deep Cut"), token("--azeroth-green-text"));
      assert.deepEqual(ring("Heavy Hand"), token("--azeroth-alliance-gold"));
      assert.deepEqual(ring("Sundering Blows"), token("--azeroth-stone"));
    });

    it("opens the card on focus, measured clean, with its title in its own ink (O-115)", async function () {
      const socket = socketOf("Follow Through");
      socket.focus();
      await settle();
      const card = tile("Follow Through").querySelector(".azeroth-talent-card");
      assert.equal(getComputedStyle(card).display, "block", "focus did not open the card");
      assert.deepEqual(checkText(card, { requireGroundWithin: true }), []);
      const h5 = parseColour(getComputedStyle(card.querySelector("h5")).color)?.slice(0, 3).map(Math.round);
      assert.deepEqual(h5, parseColour(getComputedStyle(sheet.element).getPropertyValue("--azeroth-ink-light").trim())?.slice(0, 3));
      socket.blur();
      await settle();
    });

    it("puts the card away on Escape and leaves the sheet open", async function () {
      const socket = socketOf("Follow Through");
      socket.focus();
      await settle();
      const card = () => tile("Follow Through").querySelector(".azeroth-talent-card");
      assert.equal(getComputedStyle(card()).display, "block");
      socket.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
      await settle();
      assert.equal(getComputedStyle(card()).display, "none", "Escape left the card open");
      assert.isTrue(sheet.rendered, "Escape closed the sheet");
      assert.equal(document.activeElement, socket, "Escape took the focus off the socket");
      socket.blur();
      await settle();
      assert.isFalse(tile("Follow Through").classList.contains("is-dismissed"), "leaving the tile did not clear the dismissal");
    });

    it("pins a card on a click, one at a time, and says so on the socket", async function () {
      const a = socketOf("Follow Through");
      const b = socketOf("Deep Cut");
      press(a);
      assert.equal(a.getAttribute("aria-expanded"), "true");
      assert.isTrue(tile("Follow Through").classList.contains("is-pinned"));
      press(b);
      assert.equal(b.getAttribute("aria-expanded"), "true");
      assert.equal(a.getAttribute("aria-expanded"), "false", "two cards are pinned at once");
      press(b);
      assert.equal(b.getAttribute("aria-expanded"), "false");
      assert.isTrue(tile("Deep Cut").classList.contains("is-dismissed"), "the unpinning click did not put the card away");
      b.blur();
      await settle();
    });

    it("opens the last column's card on the right where the tab holds it, and keeps every card on a narrow tab", async function () {
      this.timeout(30000);
      // The flip used to be unconditional, and at the sheet's own width the
      // last column's card landed across the rail and cut its labels mid-word
      // while 240px of slab stood free on the right (`character-tree-flip.png`).
      // The tree is a size container now, and a column flips only below the
      // width its card needs (D11 §4: *so it stays on the sheet*).
      const measure = async name => {
        const socket = socketOf(name);
        socket.focus();
        await settle();
        const card = tile(name).querySelector(".azeroth-talent-card");
        assert.equal(getComputedStyle(card).display, "block", `focus opened no card on ${name}`);
        const out = { socket: socket.getBoundingClientRect(), card: card.getBoundingClientRect(), tab: tab().getBoundingClientRect() };
        socket.blur();
        await settle();
        return out;
      };
      const onTab = m => m.card.left >= m.tab.left - 1 && m.card.right <= m.tab.right + 1;
      const width = sheet.position.width;
      try {
        const wide = await measure("Sundering Blows");
        assert.isAbove(wide.card.left, wide.socket.right, "the last column's card flipped over the rail where the tab holds it");
        assert.isTrue(onTab(wide), "the last column's card runs off the tab");

        // The window's floor: the last column flips, and no card leaves the tab.
        await sheet.setPosition({ width: 720 });
        await settle();
        const last = await measure("Sundering Blows");
        assert.isBelow(last.card.right, last.socket.left, "the last column's card did not flip on a narrow tab");
        for (const [name, m] of [["Sundering Blows", last], ["Follow Through", await measure("Follow Through")], ["Heavy Hand", await measure("Heavy Hand")]]) {
          assert.isTrue(onTab(m), `${name}'s card runs off the tab at 720px (card ${Math.round(m.card.left)}-${Math.round(m.card.right)}, tab ${Math.round(m.tab.left)}-${Math.round(m.tab.right)})`);
        }
      } finally {
        await sheet.setPosition({ width });
        await settle();
      }
    });

    it("hands focus back to the socket after a keyboard Learn, and the spent tree reads held", async function () {
      this.timeout(30000);
      // The last point: Deep Cut from 2 to 3, pressed as a key would press it.
      await learn("Deep Cut", 0);
      // The grant sync re-renders after the press; the socket's id keeps it.
      await new Promise(r => setTimeout(r, 500));
      await settle();
      assert.isTrue(tile("Deep Cut").contains(document.activeElement), "focus fell off the tile after a keyboard Learn");
      assert.isTrue(tile("Deep Cut").classList.contains("azeroth-talent--maxed"));
      assert.isTrue(tile("Wide Swing").classList.contains("azeroth-talent--held"), "a partly ranked talent with no points left is not held");
      assert.isTrue(tile("Precise Strike").classList.contains("azeroth-talent--held"));
      assert.isTrue(tile("Follow Through").classList.contains("azeroth-talent--locked"));
      document.activeElement?.blur?.();
      await settle();
    });

    it("hands focus to the branch that was open when Back is pressed", async function () {
      press(tree().querySelector(".azeroth-tree-back"), 0);
      assert.isTrue(await waitFor(() => !tree() && tab().querySelector('[data-action="openBranch"]')), "Back did not close the tree");
      await settle();
      assert.equal(document.activeElement?.dataset?.branch, "Warrior/Arms", "focus did not return to the branch");
    });
  });
}


function derivedEffectBatch(context) {
  const { describe, it, assert, after } = context;

  describe("Active Effects reaching derived data", function () {
    const made = [];

    after(async function () {
      this.timeout(20000);
      for (const actor of made) await actor.delete();
    });

    const withEffect = async (name, changes) => {
      const actor = await Actor.create({ name, type: "character" });
      made.push(actor);
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: `${name} effect`,
        system: { changes }
      }]);
      return actor;
    };

    it("reaches Armor Points by location in the final phase", async function () {
      this.timeout(20000);
      // THE QUESTION THIS ANSWERS: whether the system needs its own registered
      // change type for AP-by-location stacking (CLAUDE.md SS6, plan Phase 5).
      // `system.ap` is assigned in prepareDerivedData, so a change in the
      // `initial` phase is overwritten - but `final` lands AFTER derived data.
      // If a plain `add` works here, a custom change type buys nothing.
      const actor = await withEffect("Quench AP", [
        { key: "system.ap.body", type: "add", value: 2, phase: "final" }
      ]);

      const base = 0;   // no armor equipped
      assert.equal(actor.system.ap.body, base + 2,
        "a final-phase change did not reach derived Armor Points");
    });

    it("is overwritten in the initial phase, which is why final exists", async function () {
      this.timeout(20000);
      // The paired half: the same change in `initial` is wiped by
      // prepareDerivedData. Without this the test above proves nothing about
      // WHICH phase did the work.
      const actor = await withEffect("Quench AP Initial", [
        { key: "system.ap.body", type: "add", value: 2, phase: "initial" }
      ]);
      assert.equal(actor.system.ap.body, 0,
        "an initial-phase change survived prepareDerivedData - the phases are "
        + "not behaving as CLAUDE.md SS6 describes");
    });

    it("stacks two sources on one location", async function () {
      this.timeout(20000);
      // AP-BY-LOCATION STACKING is what the plan wanted a change type for.
      // Two effects on the same key in the same phase stack by priority, and
      // `add` is commutative, so no ordering rule is needed.
      const actor = await Actor.create({ name: "Quench AP Stack", type: "character" });
      made.push(actor);
      await actor.createEmbeddedDocuments("ActiveEffect", [
        { name: "Ward of Iron", system: { changes: [
          { key: "system.ap.body", type: "add", value: 2, phase: "final" }] } },
        { name: "Barding", system: { changes: [
          { key: "system.ap.body", type: "add", value: 1, phase: "final" }] } }
      ]);
      assert.equal(actor.system.ap.body, 3, "two AP sources did not stack");
    });

    it("leaves the other locations alone", async function () {
      this.timeout(20000);
      const actor = await withEffect("Quench AP Head", [
        { key: "system.ap.head", type: "add", value: 3, phase: "final" }
      ]);
      assert.equal(actor.system.ap.head, 3);
      assert.equal(actor.system.ap.body, 0, "AP is per location, not global");
    });
  });
}

function geometryBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Sheet geometry (D11 SS9)", function () {
    let actor;
    let sheet;

    before(async function () {
      this.timeout(30000);
      actor = await Actor.create({ name: "Quench Geometry", type: "character" });
      sheet = actor.sheet;
      await sheet.render({ force: true });
      // A rendered element is not a laid-out one. Give the browser a frame.
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    });

    after(async function () {
      this.timeout(20000);
      await sheet?.close();
      await actor?.delete();
    });

    it("measures something rather than reporting an empty sheet clean", function () {
      // The guard on the whole batch: every check below passes trivially
      // against a sheet that rendered nothing.
      const columns = [...sheet.element.querySelectorAll(".window-content > *")]
        .filter(el => el.getBoundingClientRect().width > 0);
      assert.isAbove(columns.length, 1, "the sheet should have laid out columns");
      assert.isAbove(sheet.element.textContent.trim().length, 50,
        "the sheet rendered almost no text");
    });

    it("keeps every column inside itself", function () {
      const columns = [...sheet.element.querySelectorAll(".window-content > *")]
        .filter(el => el.getBoundingClientRect().width > 0);
      const findings = checkColumns(columns);
      assert.deepEqual(findings, [],
        "Column faults:\n" + findings.map(f => `  ${f.kind}: ${f.detail}`).join("\n"));
    });

    it("hangs nothing outside a clip-path ancestor", function () {
      // D11 SS9 records this biting twice - the attribute chips, then the
      // talent badges - and says to assume it happens again. An overhanging
      // chip must be a SIBLING of the clipped plate, never a child.
      const findings = checkClipping(sheet.element);
      assert.deepEqual(findings, [],
        "Clip faults:\n" + findings.map(f => `  ${f.detail}`).join("\n"));
    });

    it("draws no blank panel", function () {
      // Geometry alone reports a blank panel as clean, which is why this is a
      // separate check rather than a consequence of the other two.
      const panels = [...sheet.element.querySelectorAll(
        ".tab.active, .azeroth-attributes, .azeroth-skills")];
      assert.isAbove(panels.length, 0, "found no panel to measure");
      const findings = checkNotEmpty(panels);
      assert.deepEqual(findings, [],
        "Blank panels:\n" + findings.map(f => `  ${f.detail}`).join("\n"));
    });

    /*
     * THE CHECKS ABOVE HAVE NEVER FAILED, so on their own they are not known
     * to work - a measurement that silently matches nothing passes exactly
     * like a clean sheet. These build each fault in a real DOM and assert it
     * is caught. They are the break tests, kept rather than run once.
     */
    describe("the checks catch what they are for", function () {
      let scratch;

      before(function () {
        scratch = document.createElement("div");
        scratch.style.cssText = "position:fixed;top:0;left:0;width:400px;height:200px;visibility:hidden;";
        document.body.appendChild(scratch);
      });

      after(function () {
        scratch?.remove();
      });

      it("catches two columns that overlap", function () {
        scratch.innerHTML = `
          <div id="a" style="position:absolute;left:0;top:0;width:200px;height:50px;">A</div>
          <div id="b" style="position:absolute;left:100px;top:0;width:200px;height:50px;">B</div>`;
        const findings = checkColumns([scratch.querySelector("#a"), scratch.querySelector("#b")]);
        assert.isAbove(findings.length, 0, "an overlap was not caught");
        assert.include(findings.map(f => f.kind), "intersect");
      });

      it("passes two columns that do not overlap", function () {
        scratch.innerHTML = `
          <div id="a" style="position:absolute;left:0;top:0;width:100px;height:50px;">A</div>
          <div id="b" style="position:absolute;left:120px;top:0;width:100px;height:50px;">B</div>`;
        const findings = checkColumns([scratch.querySelector("#a"), scratch.querySelector("#b")]);
        assert.deepEqual(findings, [], "a clean pair was reported as a fault");
      });

      it("catches a column that scrolls sideways", function () {
        scratch.innerHTML = `
          <div id="a" style="width:80px;height:40px;overflow:auto;">
            <div style="width:400px;">wide</div>
          </div>`;
        const findings = checkColumns([scratch.querySelector("#a")]);
        assert.include(findings.map(f => f.kind), "overflow");
      });

      it("catches text straying outside its column", function () {
        // The fault neither of the other two column measurements sees: the
        // column does not scroll and nothing intersects, but a leaf has
        // escaped the box.
        scratch.innerHTML = `
          <div id="a" style="position:absolute;left:100px;top:0;width:80px;height:40px;">
            <span style="position:absolute;left:-90px;">stray</span>
          </div>`;
        const findings = checkColumns([scratch.querySelector("#a")]);
        assert.include(findings.map(f => f.kind), "stray");
      });

      it("does not measure what a closed <details> is hiding", function () {
        // A CLOSED `<details>` STILL HANDS BACK A REAL RECT. Chromium collapses
        // it with `content-visibility: hidden`, which skips the paint and
        // leaves the children a layout of their own, so `getBoundingClientRect`
        // reports a box for text nobody can see. The compendium browser's
        // closed filter facets measured as 10px-wide strips lying across the
        // entry list and `checkOverlap` reported 33 overprints (2026-09-07).
        scratch.innerHTML = `
          <div style="position:absolute;left:0;top:0;width:300px;">
            <details><summary>Kind</summary>
              <span id="buried">Enchantment</span>
            </details>
            <span id="row" style="position:absolute;left:0;top:0;">Anchored</span>
          </div>`;
        const buried = scratch.querySelector("#buried");
        // The premise: it is not painted, and it has a box all the same.
        const r = buried.getBoundingClientRect();
        assert.isAbove(r.width + r.height, 0, "a closed <details> gave its child no box; this test has nothing to guard");
        assert.deepEqual(checkOverlap(scratch), [], "text inside a closed <details> was measured");

        // And opening it puts the content back in play.
        scratch.querySelector("details").open = true;
        assert.isAbove(checkOverlap(scratch).length, 0, "an OPEN <details> was skipped too");
      });

      it("catches a child hung outside a clip-path ancestor", function () {
        // D11 SS9's recurring trap: the chip must be a SIBLING of the clipped
        // plate. As a child it is silently cut off.
        scratch.innerHTML = `
          <div id="plate" style="position:absolute;left:0;top:0;width:60px;height:60px;
                                 clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);">
            <span style="position:absolute;left:70px;top:0;">chip</span>
          </div>`;
        const findings = checkClipping(scratch);
        assert.isAbove(findings.length, 0, "an escaping child was not caught");
        assert.include(findings[0].detail, "SIBLING");
      });

      it("passes a chip that is a sibling of the clipped plate", function () {
        scratch.innerHTML = `
          <div style="position:relative;">
            <div style="position:absolute;left:0;top:0;width:60px;height:60px;
                        clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);"></div>
            <span style="position:absolute;left:70px;top:0;">chip</span>
          </div>`;
        assert.deepEqual(checkClipping(scratch), [],
          "a correctly-built overhang was reported as a fault");
      });

      it("catches a panel that rendered nothing", function () {
        scratch.innerHTML = `<div id="p"></div>`;
        const findings = checkNotEmpty([scratch.querySelector("#p")]);
        assert.isAbove(findings.length, 0, "a blank panel was reported clean");
        assert.equal(findings[0].kind, "blank");
      });

      it("passes a panel with text in it", function () {
        scratch.innerHTML = `<div id="p">Strength 14</div>`;
        assert.deepEqual(checkNotEmpty([scratch.querySelector("#p")]), []);
      });
    });

    it("holds on every tab, not just the one that opens", async function () {
      this.timeout(30000);
      // A layout fault on a tab nobody opened is still a layout fault, and the
      // grid loses a track on the wide tabs (D11 SS1) - which is exactly where
      // a column check earns its keep. The tabs are read off the rendered nav:
      // Spells is drawn only where there is a spell to show (D-639).
      const tabs = [...sheet.element.querySelectorAll("nav.tabs [data-tab]")].map(a => a.dataset.tab);
      assert.isAtLeast(tabs.length, 5, "the nav draws fewer than five tabs");
      for (const tab of tabs) {
        sheet.changeTab(tab, "primary");
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        const columns = [...sheet.element.querySelectorAll(".window-content > *")]
          .filter(el => el.getBoundingClientRect().width > 0);
        const findings = [
          ...checkColumns(columns),
          ...checkClipping(sheet.element),
          ...checkNotEmpty([...sheet.element.querySelectorAll(".tab.active")])
        ];
        assert.deepEqual(findings, [],
          `Faults on the "${tab}" tab:\n`
          + findings.map(f => `  ${f.check}/${f.kind}: ${f.detail}`).join("\n"));
      }
    });
  });
}

/**
 * The migration chain against real documents.
 *
 * WHAT THE UNIT TESTS COULD NOT SEE: they hand `buildActorUpdate` a legacy
 * plain object, and a live actor never presents one. `SchemaField` cleaning
 * runs at construction, so `system.wounds` and `system.resource` are dropped
 * and a numeric `system.momentum` is replaced by its initial before any
 * migration code runs. Twenty-two green unit tests sat on top of a migration
 * that would have zeroed every character's Momentum and class resource in a
 * real world, and reported success while doing it.
 *
 * These tests write legacy source and assert the values arrive, which is the
 * only formulation that can fail if `CharacterData.migrateData` is removed.
 */
function migrationBatch(context) {
  const { describe, it, assert, after } = context;

  describe("Migration chain", function () {
    const made = [];

    const legacyActor = async (system, name = "ZZ Legacy Actor") => {
      const actor = await Actor.create({ name, type: "character", system });
      made.push(actor);
      return actor;
    };

    after(async function () {
      // ONE DELETE, NOT N. Mocha gives a hook 2s by default and a per-document
      // delete blew through it once the batch grew past a handful - a teardown
      // failure that names the last test, not the fixture that got heavy.
      this.timeout(20000);
      for (const doc of made) await doc.delete().catch(() => {});
      made.length = 0;
    });

    it("recovers a numeric momentum that cleaning would have discarded", async function () {
      const actor = await legacyActor({ momentum: 3 });
      assert.equal(actor.system.momentum.value, 3,
        "momentum was reset to its initial - migrateData did not run before cleaning");
    });

    it("carries the unnamed class resource across to Power", async function () {
      const actor = await legacyActor({ resource: { value: 4 } });
      assert.equal(actor.system.power.value, 4, "the class resource was lost");
      assert.notProperty(actor._source.system, "resource",
        "the legacy key is still in the stored source");
    });

    it("renames wounds to health, keeping both numbers", async function () {
      const actor = await legacyActor({ wounds: { value: 7, max: 9 } });
      assert.equal(actor._source.system.health.value, 7);
      assert.equal(actor._source.system.health.max, 9);
      assert.notProperty(actor._source.system, "wounds");
    });

    it("does not overwrite a health value the world already carries", async function () {
      const actor = await legacyActor({
        wounds: { value: 7, max: 9 },
        health: { value: 12, max: 12 }
      });
      assert.equal(actor._source.system.health.value, 12,
        "a half-migrated world lost its newer number");
    });

    it("raises a Spirit Tether still sitting on the old default", async function () {
      const actor = await legacyActor({ spiritTether: { value: 2, max: 2 } });
      assert.equal(actor.system.spiritTether.max, 3);
      assert.equal(actor.system.spiritTether.value, 3);
    });

    it("leaves a Tether the character has spent in play alone", async function () {
      const actor = await legacyActor({ spiritTether: { value: 1, max: 2 } });
      assert.equal(actor.system.spiritTether.max, 3, "the maximum still rises");
      assert.equal(actor.system.spiritTether.value, 1, "the spent value was refilled");
    });

    it("drops the two deferred corruption tracks", async function () {
      const actor = await legacyActor({
        corruption: { fel: 5, void: 0, undeath: 0, arcane: 2, flesh: 1 }
      });
      const keys = Object.keys(actor._source.system.corruption).sort();
      assert.deepEqual(keys, ["fel", "undeath", "void"]);
      assert.equal(actor.system.corruption.fel, 5, "a surviving track lost its value");
    });

    it("carries a world several versions behind through every step in order", async function () {
      const actor = await legacyActor({
        momentum: 6,
        resource: { value: 2 },
        wounds: { value: 4, max: 11 },
        spiritTether: { value: 2, max: 2 },
        corruption: { fel: 3, arcane: 9 }
      });
      assert.equal(actor.system.momentum.value, 6);
      assert.equal(actor.system.power.value, 2);
      assert.equal(actor._source.system.health.max, 11);
      assert.equal(actor.system.spiritTether.max, 3);
      assert.notProperty(actor._source.system.corruption, "arcane");
    });

    it("is idempotent - a migrated actor round-trips unchanged", async function () {
      const actor = await legacyActor({ momentum: 3, resource: { value: 4 } });
      const first = foundry.utils.duplicate(actor._source.system);
      const again = new Actor.implementation({
        name: "ZZ Round Trip", type: "character", system: first
      });
      assert.equal(again.system.momentum.value, 3);
      assert.equal(again.system.power.value, 4);
    });

    /* ---------------------------------------------------------------- */
    /*  0.12.6 — a character's token is a PC's token                     */
    /* ---------------------------------------------------------------- */

    it("gives a character created now all five token defaults, and keeps what the payload names", async function () {
      this.timeout(30000);
      // Core's defaults are HOSTILE, unlinked, no name and no bars, and
      // `core.defaultToken` no longer exists in v14 — so a PC dropped on a
      // scene came up red and drew nothing. `_preCreate` stamps them.
      const { CHARACTER_TOKEN } = await import("/systems/azeroth-rpg/module/rules/tokens.mjs");
      const actor = await legacyActor({}, "ZZ Token Defaults");
      const token = actor.prototypeToken;
      assert.equal(token.actorLink, true, "a character's token is not linked");
      assert.equal(token.disposition, CONST.TOKEN_DISPOSITIONS.FRIENDLY, "a character's token is not friendly");
      assert.equal(token.displayName, CONST.TOKEN_DISPLAY_MODES.ALWAYS, "a character's token shows no name");
      assert.equal(token.displayBars, CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER, "a character's token shows no bar");
      assert.equal(token.bar1.attribute, "health", "bar 1 reads nothing");
      // And the literals in the pure module are the constants' own values.
      assert.equal(CHARACTER_TOKEN.disposition, CONST.TOKEN_DISPOSITIONS.FRIENDLY);
      assert.equal(CHARACTER_TOKEN.displayName, CONST.TOKEN_DISPLAY_MODES.ALWAYS);
      assert.equal(CHARACTER_TOKEN.displayBars, CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER);

      // WHAT THE CREATE DATA CHOOSES WINS: a neutral doppelganger is a thing a
      // GM may want, and 0 is falsy, which is what `??` would have eaten.
      const neutral = await Actor.create({
        name: "ZZ Token Explicit", type: "character",
        prototypeToken: { disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL }
      });
      made.push(neutral);
      assert.equal(neutral.prototypeToken.disposition, CONST.TOKEN_DISPOSITIONS.NEUTRAL,
        "an explicit disposition was overwritten by the default");
      assert.equal(neutral.prototypeToken.displayName, CONST.TOKEN_DISPLAY_MODES.ALWAYS,
        "naming one key lost the other four");

      // **AND A PAYLOAD SPELLING OUT CORE'S OWN DEFAULTS HAS CHOSEN NOTHING**
      // (the final review, 2026-09-13). *Duplicate* and *Import Data* carry
      // EVERY prototype key, so a character made before 0.12.6 arrived HOSTILE,
      // unlinked, nameless and barless and the patch came back empty - the copy
      // kept core's defaults for good, because the migration had already run
      // and never revisits. The cost is that HOSTILE is no longer a choice a
      // create payload can make for a character; it is set after the create.
      const copied = await Actor.create({
        name: "ZZ Token Imported", type: "character",
        prototypeToken: {
          actorLink: false,
          disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE,
          displayName: CONST.TOKEN_DISPLAY_MODES.NONE,
          displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,
          bar1: { attribute: null }
        }
      });
      made.push(copied);
      assert.equal(copied.prototypeToken.disposition, CONST.TOKEN_DISPOSITIONS.FRIENDLY,
        "an imported character stayed red");
      assert.equal(copied.prototypeToken.actorLink, true, "an imported character stayed unlinked");
      assert.equal(copied.prototypeToken.displayName, CONST.TOKEN_DISPLAY_MODES.ALWAYS,
        "an imported character stayed nameless");
      assert.equal(copied.prototypeToken.displayBars, CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
        "an imported character drew no bar");
      assert.equal(copied.prototypeToken.bar1.attribute, "health", "an imported character's bar reads nothing");

      // A creature takes core's own defaults, untouched.
      const npc = await Actor.create({ name: "ZZ Token Creature", type: "npc" });
      made.push(npc);
      assert.notEqual(npc.prototypeToken.disposition, CONST.TOKEN_DISPOSITIONS.FRIENDLY,
        "a creature was made friendly");
    });

    it("0.12.6 repairs a character already in the world, prototype and placed token, and twice changes nothing", async function () {
      this.timeout(90000);
      const { migrate } = await import("/systems/azeroth-rpg/module/migrations/0.12.6-character-tokens.mjs");
      const actor = await legacyActor({}, "ZZ Token Repair");
      // Stale it ON PURPOSE: `_preCreate` already stamped it, and a test on a
      // clean world would pass with the migration doing nothing (CLAUDE.md §15).
      await actor.update({
        "prototypeToken.actorLink": false,
        "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.HOSTILE,
        "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.NONE,
        "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.NONE,
        "prototypeToken.bar1.attribute": null
      });
      assert.equal(actor.prototypeToken.disposition, CONST.TOKEN_DISPOSITIONS.HOSTILE, "the stale did not take");

      // AND A TOKEN ALREADY ON A SCENE. `walkWorld` walks an unlinked token's
      // ACTOR and never the TokenDocument, and a linked token carries its own
      // disposition, so a party standing on the map would have stayed red.
      const scene = await Scene.create({ name: "ZZ Token Scene", width: 1000, height: 1000 });
      made.push(scene);
      const [placed] = await scene.createEmbeddedDocuments("Token", [{
        name: actor.name, actorId: actor.id, x: 100, y: 100,
        actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE,
        displayName: CONST.TOKEN_DISPLAY_MODES.NONE, displayBars: CONST.TOKEN_DISPLAY_MODES.NONE
      }]);

      const touched = await migrate(() => {});
      assert.isAbove(touched, 0, "the migration touched nothing at all");
      assert.equal(actor.prototypeToken.disposition, CONST.TOKEN_DISPOSITIONS.FRIENDLY, "the prototype is still hostile");
      assert.equal(actor.prototypeToken.actorLink, true, "the prototype is still unlinked");
      assert.equal(actor.prototypeToken.displayName, CONST.TOKEN_DISPLAY_MODES.ALWAYS);
      assert.equal(actor.prototypeToken.displayBars, CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER);
      assert.equal(actor.prototypeToken.bar1.attribute, "health");

      const after = scene.tokens.get(placed.id);
      assert.equal(after.disposition, CONST.TOKEN_DISPOSITIONS.FRIENDLY, "the placed token is still hostile");
      assert.equal(after.displayName, CONST.TOKEN_DISPLAY_MODES.ALWAYS, "the placed token shows no name");
      assert.equal(after.displayBars, CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER, "the placed token shows no bar");
      assert.equal(after.bar1.attribute, "health");

      // IDEMPOTENT: a second run has nothing left to do.
      assert.equal(await migrate(() => {}), 0, "a second run touched documents again");
    });

    /* ---------------------------------------------------------------- */
    /*  0.12.13 — 04's row order on the talents a world holds (D-758)    */
    /* ---------------------------------------------------------------- */

    it("0.12.13 stamps a character's talents with the rebuilt pack's row order, and twice changes nothing", async function () {
      this.timeout(90000);
      const { migrate, TALENTS_PACK, rowKey, rowsFromIndex } = await import(
        "/systems/azeroth-rpg/module/migrations/0.12.13-talent-row-order.mjs"
      );
      // The pack's rows, read exactly as the migration reads them. An EMPTY
      // map is a pack that predates D-758, and the migration then stamps
      // nothing and passes a test that asked only for no error - so the
      // rebuilt pack is asserted first, in words.
      const index = await game.packs.get(TALENTS_PACK).getIndex({ fields: ["sort", "system.className", "system.identifier"] });
      const rowOf = rowsFromIndex(index);
      assert.equal(rowOf.size, 324, "the talents pack carries no row order: it was not rebuilt from packs-src");

      const actor = await makeCharacter({ name: "ZZ Row Order", classes: [["Warrior", 1]] });
      try {
        const classTalents = () => actor.items.filter(i => i.type === "talent" && !i.system.race);
        assert.lengthOf(classTalents(), 36, "the Warrior did not bring its thirty-six");
        // THE GRANT CARRIES THE ROW ALREADY: `grantClassTalents` embeds the
        // pack's document whole, so a character made now needs no migration.
        for (const t of classTalents()) assert.equal(t.sort, rowOf.get(rowKey(t.system)), `${t.name} arrived off its row`);

        // Stale it ON PURPOSE, or a clean world passes with the migration doing
        // nothing (CLAUDE.md §15). A world made before D-758 holds every
        // talent at core's initial 0; a GM's drag leaves any number at all.
        // Neither 0 nor 7n+3 is ever a row, which runs 100 to 1200.
        await actor.updateEmbeddedDocuments("Item", classTalents().map((t, n) => ({ _id: t.id, sort: n % 2 ? 0 : (7 * n) + 3 })));
        assert.isTrue(classTalents().every(t => t.sort !== rowOf.get(rowKey(t.system))), "the stale did not take");

        const touched = await migrate(() => {});
        assert.isAtLeast(touched, 36, "the migration did not stamp all thirty-six");
        for (const t of classTalents()) assert.equal(t.sort, rowOf.get(rowKey(t.system)), `${t.name} is off its row after the migration`);

        // IDEMPOTENT: a second run has nothing left to do, here or anywhere.
        assert.equal(await migrate(() => {}), 0, "a second run touched documents again");
      } finally {
        await cleanupFixtures();
      }
    });

    /* ---------------------------------------------------------------- */
    /*  0.12.14 — what an area does to who enters and stands in it       */
    /* ---------------------------------------------------------------- */

    it("0.12.14 restamps a held spell's tick and ground off the rebuilt pack, keeps a GM's own words, and twice changes nothing", async function () {
      this.timeout(90000);
      const { migrate } = await import("/systems/azeroth-rpg/module/migrations/0.12.14-area-movement.mjs");
      const actor = await makeCharacter({ name: "ZZ Frost Keeper", classes: [["Mage", 5]], spells: ["Hoarfrost", "Blizzard"] });
      try {
        const spell = name => actor.items.find(i => i.type === "spell" && i.name === name);
        // The rebuilt pack carries D-757's descriptors, or this proves nothing:
        // said first, in words.
        assert.equal(spell("Hoarfrost").system.areaTick.grows, 5, "the spells pack carries no growth: it was not rebuilt from packs-src");
        assert.isTrue(spell("Blizzard").system.areaGround.difficult, "the spells pack carries no ground: it was not rebuilt from packs-src");
        // Stale both ON PURPOSE to the initials a world made before this
        // version reads (D-665), or a clean world passes with the migration
        // doing nothing (CLAUDE.md §15). Blizzard's words are a GM's own now.
        await spell("Hoarfrost").update({ "system.areaTick.grows": null, "system.areaTick.remains": [], "system.areaGround.difficult": false });
        await spell("Blizzard").update({ "system.areaGround.difficult": false, "system.effect": "<p>A cold wind of the GM's own making.</p>" });
        assert.isNull(spell("Hoarfrost").system.areaTick.grows, "the stale did not take");

        const touched = await migrate(() => {});
        assert.isAtLeast(touched, 1, "the migration touched nothing at all");
        assert.equal(spell("Hoarfrost").system.areaTick.grows, 5, "Hoarfrost's growth was not restamped");
        assert.isAbove(spell("Hoarfrost").system.areaTick.remains.length, 0, "Hoarfrost's rider was not restamped");
        assert.isTrue(spell("Hoarfrost").system.areaGround.difficult, "Hoarfrost's ground was not restamped");
        // A GM's own words keep the descriptor they have.
        assert.isFalse(spell("Blizzard").system.areaGround.difficult, "a rewritten Blizzard was restamped over the GM's words");

        // IDEMPOTENT: a second run has nothing left to do, here or anywhere.
        assert.equal(await migrate(() => {}), 0, "a second run touched documents again");
      } finally {
        await cleanupFixtures();
      }
    });

    it("runs the world migration without error and advances the setting", async function () {
      // **THE CHAIN READS THE PACKS NOW.** 0.12.0, 0.12.1 and 0.12.2 each
      // restore a field from the weapons, armor and gear packs, which are
      // 2,443 documents, and the whole chain went past 20 seconds when the
      // third arrived (D-697). `walk.mjs` reads each pack once for the run
      // rather than once per migration; this is the headroom above that, not
      // instead of it.
      this.timeout(120000);
      const { runMigrations, SETTING_KEY, pending } = await import(
        "/systems/azeroth-rpg/module/migrations/index.mjs"
      );
      // READ THE NEWEST VERSION OFF THE CHAIN, never a literal. This test was
      // written against "0.3.0" and went red the moment 0.4.0 was added -
      // catching a real bump, but a test that has to be edited every time the
      // chain grows will eventually be edited without being read.
      const newest = pending("0.0.0").at(-1).version;
      const before = game.settings.get("azeroth-rpg", SETTING_KEY);
      await game.settings.set("azeroth-rpg", SETTING_KEY, "0.0.0");
      try {
        await runMigrations();
        assert.equal(
          game.settings.get("azeroth-rpg", SETTING_KEY), newest,
          "the chain did not reach the newest version"
        );
      } finally {
        await game.settings.set("azeroth-rpg", SETTING_KEY, before);
      }
    });

    it("leaves every actor's data intact after a full chain run", async function () {
      // The same whole chain, and the same reason as the test above (D-697).
      this.timeout(120000);
      const actor = await legacyActor({ momentum: 5, resource: { value: 3 } },
        "ZZ Survives Migration");
      const { runMigrations, SETTING_KEY } = await import(
        "/systems/azeroth-rpg/module/migrations/index.mjs"
      );
      const before = game.settings.get("azeroth-rpg", SETTING_KEY);
      await game.settings.set("azeroth-rpg", SETTING_KEY, "0.0.0");
      try {
        await runMigrations();
      } finally {
        await game.settings.set("azeroth-rpg", SETTING_KEY, before);
      }
      assert.equal(actor.system.momentum.value, 5, "the migration zeroed a live actor");
      assert.equal(actor.system.power.value, 3);
    });
  });
}

/**
 * 02 §10's per-class Power pools, against the real class items.
 */
function multiclassBatch(context) {
  const { describe, it, assert, before, after } = context;

  // 02 §10's per-class Power pools, end to end against the real class items.
  //
  // THE UNIT TESTS CANNOT REACH THIS. `poolsFor` takes plain objects; what is
  // checked here is that the class item's published pool, the character's
  // `classes[]` entry and the sheet all line up - three layers that each
  // passed on their own while the middle one dropped a pool.
  describe("Multiclass Power pools", function () {
    const made = [];
    let classes;

    before(async function () {
      this.timeout(20000);
      const pack = game.packs.get("azeroth-rpg.classes");
      assert.ok(pack, "the classes pack is missing");
      const docs = await pack.getDocuments();
      classes = Object.fromEntries(docs.map(d => [d.name, d]));
    });

    after(async function () {
      // ONE DELETE, NOT N. Mocha gives a hook 2s by default and a per-document
      // delete blew through it once the batch grew past a handful - a teardown
      // failure that names the last test, not the fixture that got heavy.
      this.timeout(20000);
      for (const doc of made) await doc.delete().catch(() => {});
      made.length = 0;
    });

    // SHARE THE READ-ONLY FIXTURES. Building an actor, embedding two compendium
    // class items and rendering a sheet costs a few seconds each; six of them
    // pushed the whole Quench run past its 60s ceiling. Cached by pairing, and
    // the one test that MUTATES a fixture asks for its own - a shared fixture
    // that someone writes to blames the next test, not the one that broke it.
    const cache = new Map();
    const shared = async pairs => {
      const key = pairs.map(p => p.join(":")).join("+");
      if (!cache.has(key)) cache.set(key, await build(pairs, `ZZ ${key}`));
      return cache.get(key);
    };

    const build = async (pairs, name) => {
      const actor = await Actor.create({ name, type: "character" });
      made.push(actor);
      const items = await actor.createEmbeddedDocuments(
        "Item", pairs.map(([n]) => classes[n].toObject())
      );
      // MATCH BY NAME, NEVER BY RETURN ORDER. `createEmbeddedDocuments` makes no
      // promise about the order it hands documents back, and index 0 of
      // `system.classes` is what "primary" means - so a fixture that trusted
      // the order put the Rogue first about half the time and failed the
      // primary-pool assertion while its neighbour passed.
      await actor.update({
        "system.classes": pairs.map(([name, level]) => ({
          itemId: items.find(i => i.name === name).id,
          level,
          power: { value: 0 }
        }))
      });
      assert.equal(
        actor.items.get(actor.system.classes[0].itemId).name, pairs[0][0],
        "the fixture did not put the intended class first"
      );
      return actor;
    };

    it("gives a Mage/Rogue both Mana and Energy, not one of them", async function () {
      this.timeout(20000);
      const actor = await shared([["Mage", 9], ["Rogue", 5]]);
      const names = actor.system.powers.map(p => p.name);
      assert.deepEqual(names, ["mana", "energy"],
        "a double-caster lost a Power pool - 02 §10 has no combined caster");
    });

    it("sizes each pool from its own class's level", async function () {
      this.timeout(20000);
      const actor = await shared([["Mage", 9], ["Priest", 4]]);
      const [primary, second] = actor.system.powers;
      assert.isAbove(primary.max, second.max,
        "the second class did not run behind the first");
    });

    it("keeps each pool's spent value with its own class", async function () {
      this.timeout(20000);
      const actor = await build([["Mage", 9], ["Rogue", 5]], "ZZ Spent Pools");
      const [mage, rogue] = actor.system.classes;
      await actor.update({
        "system.classes": [
          { ...mage.toObject?.() ?? mage, power: { value: 3 } },
          { ...rogue.toObject?.() ?? rogue, power: { value: 7 } }
        ]
      });
      const [mana, energy] = actor.system.powers;
      assert.equal(mana.value, 3);
      assert.equal(energy.value, 7, "the two pools are sharing one number");
    });

    it("gives a multiclass every Momentum pool its classes carry", async function () {
      this.timeout(20000);
      // THE LEAD RULED THIS. 05 §11's "whichever of these you have" names the
      // resource; it does not merge two of them. A Warrior/Rogue holds Rage at
      // 10 AND Combo Points at 5 - two caps, two bars.
      const actor = await shared([["Warrior", 9], ["Rogue", 5]]);
      assert.deepEqual(
        actor.system.momenta.map(m => [m.name, m.max]),
        [["rage", 10], ["comboPoints", 5]]
      );
      assert.equal(actor.system.momentum.pool.name, "rage",
        "the primary class's pool is still the one `system.momentum` reports");
    });

    it("runs the second class one tier behind the character", async function () {
      this.timeout(20000);
      // 02 §10 as ruled: one tier below, floored at 1. A level 9 character is
      // tier 2, so the second class is tier 1 - which runs to level 4.
      const actor = await shared([["Mage", 9], ["Priest", 4]]);
      const [primary, second] = actor.system.powers;
      assert.equal(primary.level, 9);
      assert.equal(second.level, 4,
        "the second class did not drop to the top of the tier below");
    });

    it("never runs a second class ahead of the character", async function () {
      this.timeout(20000);
      // Tier 1 runs to level 4, but a level 3 character's second class cannot
      // be further along than the character carrying it.
      const actor = await shared([["Mage", 3], ["Priest", 1]]);
      assert.equal(actor.system.powers[1].level, 3);
    });

    it("draws every pool on the sheet, not just the first", async function () {
      this.timeout(20000);
      const actor = await shared([["Mage", 9], ["Rogue", 5]]);
      const sheet = actor.sheet;
      await sheet.render({ force: true });
      try {
        // Core's pools alone: the Spells header draws the Power pools again (D-614).
        const labels = [...sheet.element.querySelectorAll('section[data-tab="core"] .azeroth-pool-label')]
          .map(el => el.textContent.trim());
        // A Mage carries no Momentum and a Rogue carries Combo Points, so the
        // Momentum side is one real pool; both classes carry Power. Four bars
        // would mean an absent-pool placeholder was drawn alongside a real one.
        assert.equal(labels.length, 3,
          `the sheet drew ${labels.length} pools, expected 3: ${labels.join(", ")}`);
      } finally {
        await sheet.close();
      }
    });

    it("still exposes the primary caster's pool as system.power", async function () {
      this.timeout(20000);
      const actor = await shared([["Mage", 9], ["Rogue", 5]]);
      assert.equal(actor.system.power.pool.name, "mana");
      assert.equal(actor.system.power.max, actor.system.powers[0].max);
    });
  });
}

/**
 * The interactions a person actually performs.
 *
 * ALL THREE OF THESE WERE REPORTED BY SOMEONE USING THE SYSTEM, not by a test.
 * Every one had a passing test beside it: the browser rendered its rows, the
 * sheet rendered its combat tab, and the geometry checks called both clean -
 * because a panel with nothing in it is still a panel that renders, and a row
 * with no handler still has the right box. What none of them asserted was that
 * clicking the thing does anything.
 *
 * The rule this encodes: A RENDER TEST IS NOT A USE TEST. Assert the handler
 * exists and that the markup carries what the handler reads.
 */
function usableBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Things a person clicks", function () {
    const made = [];

    after(async function () {
      // ONE DELETE, NOT N. Mocha gives a hook 2s by default and a per-document
      // delete blew through it once the batch grew past a handful - a teardown
      // failure that names the last test, not the fixture that got heavy.
      this.timeout(20000);
      for (const doc of made) await doc.delete().catch(() => {});
      made.length = 0;
    });

    describe("Compendium browser", function () {
      let browser;

      before(async function () {
        this.timeout(30000);
        browser = await game.system.azeroth.browser.browse({ category: "weapons" });
        // `CategoryBrowser` RENDERS BEFORE ITS DATA ARRIVES, deliberately - it
        // shows a loading message rather than blocking on twelve pack indexes,
        // so `browse()` resolves with an empty list and re-renders later. A
        // test that asserts straight after the await is testing the loading
        // message.
        for (let i = 0; i < 100; i++) {
          if (browser.element?.querySelector(".azeroth-browser-entry")) break;
          await new Promise(r => setTimeout(r, 100));
        }
      });

      after(async function () {
        await browser?.close();
      });

      it("gives every row an action that opens it", function () {
        const row = browser.element.querySelector(".azeroth-browser-entry");
        assert.ok(row, "the browser rendered no entries to click");
        assert.equal(row.dataset.action, "openEntry",
          "the row carries no action - clicking it does nothing");
        assert.ok(browser.options.actions.openEntry,
          "there is no openEntry handler for the row to reach");
      });

      it("resolves the uuid a row carries to a real document", async function () {
        const row = browser.element.querySelector(".azeroth-browser-entry");
        const doc = await fromUuid(row.dataset.uuid);
        assert.ok(doc, `the row's uuid does not resolve: ${row.dataset.uuid}`);
      });

      it("makes rows draggable", function () {
        const row = browser.element.querySelector(".azeroth-browser-entry");
        // `DragDrop#bind` sets this attribute itself; the markup must not.
        assert.equal(row.getAttribute("draggable"), "true",
          "the row is not draggable - DragDrop was never bound");
      });

      it("carries the pack's own document type in the uuid", function () {
        const row = browser.element.querySelector(".azeroth-browser-entry");
        const parts = row.dataset.uuid.split(".");
        assert.equal(parts[0], "Compendium");
        assert.equal(parts[3], "Item", "a creature dropped as an Item is ignored");
      });
    });

    describe("Character sheet", function () {
      let actor;
      let sheet;

      before(async function () {
        this.timeout(30000);
        actor = await Actor.create({ name: "ZZ Armed Character", type: "character" });
        made.push(actor);
        const pack = game.packs.get("azeroth-rpg.weapons");
        const weapons = await pack.getDocuments();
        await actor.createEmbeddedDocuments("Item", [weapons[0].toObject()]);
        sheet = actor.sheet;
        await sheet.render({ force: true });
      });

      after(async function () {
        await sheet?.close();
      });

      it("lists the weapons the character is carrying", function () {
        const rows = sheet.element.querySelectorAll(".azeroth-weapon[data-item-id]");
        assert.isAtLeast(rows.length, 1,
          "the combat tab lists no weapons - there is nothing on it to click");
      });

      it("gives each weapon a button wired to a handler", function () {
        const button = sheet.element.querySelector('[data-action="rollAttack"]');
        assert.ok(button, "no attack button on any weapon");
        assert.ok(sheet.options.actions.rollAttack,
          "the button names an action the sheet does not define");
        assert.ok(button.closest("[data-item-id]"),
          "the button cannot tell the handler which weapon it belongs to");
      });

      it("offers the three hit locations as a choice before the roll", function () {
        // D-411: the location is an INPUT. A sheet that cannot express it makes
        // every attack a Body hit.
        // Not a form field since Phase 3: a per-attack default, never saved.
        // The three tiles of the armour figure are the choice (D-617); the
        // hidden field carries the lit one to the attack door.
        const field = sheet.element.querySelector("[data-field=azeroth-location]");
        assert.ok(field, "there is no way to call a shot");
        const tiles = sheet.element.querySelectorAll('[data-action="calledShot"]');
        assert.equal(tiles.length, 3);
        assert.equal(field.value, "body", "an attack opens on the Body unless paid for (06 SS2)");
      });

      it("rolls an attack and posts a card when the button is used", async function () {
        this.timeout(20000);
        const before = game.messages.size;
        const button = sheet.element.querySelector('[data-action="rollAttack"]');
        // Shift inverts the roll-dialog setting (Phase 2): under the default
        // "always" this rolls straight through with the automatic modifiers.
        // The dialog itself is the roll-dialog batch's to test.
        await sheet.options.actions.rollAttack.call(sheet, new MouseEvent("click", { shiftKey: true }), button);
        assert.isAbove(game.messages.size, before,
          "clicking Attack produced no chat card");
        const message = game.messages.contents.at(-1);
        made.push(message);
        assert.ok(message.rolls.length, "the card carries no roll");
      });

      it("lists what the character is carrying on the Gear tab", function () {
        // The tab is BAG PANELS now (D-738): one tile for every thing, in the
        // panel of the bag it is kept in.
        const tiles = sheet.element.querySelectorAll('section[data-tab="gear"] .azeroth-bag-tile[data-item-id]');
        assert.isAtLeast(tiles.length, 1, "the Gear tab lists nothing carried");
      });
    });

    describe("Casting a spell", function () {
      let caster;
      let spell;

      before(async function () {
        this.timeout(30000);
        caster = await Actor.create({ name: "ZZ Caster", type: "character" });
        made.push(caster);
        const pack = game.packs.get("azeroth-rpg.spells");
        const index = await pack.getIndex();
        const source = await pack.getDocument(index.contents[0]._id);
        [spell] = await caster.createEmbeddedDocuments("Item", [source.toObject()]);
      });

      it("offers Cast on an owned spell's sheet", async function () {
        this.timeout(20000);
        // 406 SPELLS AND NO WAY TO CAST ONE. `castSpell` was written, tested
        // and never called from anywhere; D11's PARTS map names no spells
        // region, so the owned item's own sheet is the door.
        const sheet = spell.sheet;
        await sheet.render({ force: true });
        try {
          const button = sheet.element.querySelector('[data-action="castSpell"]');
          assert.ok(button, "an owned spell's sheet offers no way to cast it");
          assert.ok(sheet.options.actions.castSpell,
            "the button names an action the sheet does not define");
        } finally {
          await sheet.close();
        }
      });

      it("does not offer Cast on a spell nobody owns", async function () {
        this.timeout(20000);
        // An unowned spell has no caster, so `castSpell` has no actor to spend
        // Power from - the button would be a guaranteed warning.
        const pack = game.packs.get("azeroth-rpg.spells");
        const index = await pack.getIndex();
        const unowned = await pack.getDocument(index.contents[0]._id);
        const sheet = unowned.sheet;
        await sheet.render({ force: true });
        try {
          assert.isNull(sheet.element.querySelector('[data-action="castSpell"]'),
            "a compendium spell offers a Cast button with nothing to cast from");
        } finally {
          await sheet.close();
        }
      });

      it("posts a spell card when cast", async function () {
        this.timeout(20000);
        const before = game.messages.size;
        await game.system.azeroth.workflows.castSpell({ actor: caster, spell });
        assert.isAbove(game.messages.size, before, "casting produced no card");
        made.push(game.messages.contents.at(-1));
      });
    });

    describe("Critical Injuries", function () {
      let actor;

      before(async function () {
        this.timeout(20000);
        actor = await Actor.create({ name: "ZZ Crit", type: "character" });
        made.push(actor);
      });

      it("offers the injury on a natural 20 attack, and only then", async function () {
        this.timeout(20000);
        // 06 §8: a natural 20 ON AN ATTACK. Pinned rather than hoped for.
        const real = CONFIG.Dice.randomUniform;
        CONFIG.Dice.randomUniform = () => 0; // a natural 20 on every die
        let crit;
        let plain;
        try {
          crit = await game.system.azeroth.workflows.rollTest({
            actor, kind: "attack", dc: 10
          });
          plain = await game.system.azeroth.workflows.rollTest({
            actor, kind: "skill", dc: 10
          });
        } finally {
          CONFIG.Dice.randomUniform = real;
        }
        made.push(crit, plain);
        assert.include(crit.content, 'data-action="criticalInjury"',
          "a critical hit offers no Critical Injury");
        assert.notInclude(plain.content, 'data-action="criticalInjury"',
          "a critical Athletics Test should not break a rib");
      });

      it("draws from the table for the location that was struck", async function () {
        this.timeout(20000);
        // D-411: the location was chosen before the attack, so the injury is
        // drawn from ITS table rather than from Body by default.
        const message = await game.system.azeroth.workflows.rollCriticalInjury({
          actor, location: "head"
        });
        made.push(message);
        assert.equal(message.flags["azeroth-rpg"].location, "head");
      });
    });
  });
}
