/**
 * **WHAT EACH SOVEREIGN ITEM MUST PLAY, AND WHERE ITS CONTROL IS PRESSED** (the San'layn and Sovereign plan's
 * C14 and C.4; ANIM). Pure data, read by the two `azeroth-rpg.sovereign-animations*` batches
 * (`quench-sovereign-animations.mjs`) and held to the class by `sovereign-animation-items.test.mjs`: every
 * spell 07 gives the Sovereign, every feature 02 gives it and every talent 04 gives it with a row is an item
 * here, with the cues it must play and the scenario titles whose real controls press it.
 *
 * `from` lists title PREFIXES of the tests (in the batch the item is judged in) whose bodies press the
 * control; `who` is the role a cue is placed for: `caster` (the record's source is the Sovereign), `target`
 * (an effect step on a creature other than the Sovereign), `point` (an effect step at a canvas point), `any`.
 * `loop` asks that the row's loop also stood; an expectation with `loopOnly` asks only that.
 */

const cast = (key, who = "caster") => ({ trigger: "cast", key, who });
const resisted = key => ({ trigger: "resist", key, who: "target" });
const region = (key, extra = {}) => ({ trigger: "region", key, who: "point", ...extra });
const use = (key, who = "any", extra = {}) => ({ trigger: "use", key, who, ...extra });
const effect = (key, extra = {}) => ({ trigger: "effect", key, who: "any", ...extra });
/** A loop that stood; with an `asset`, the loop of one state, known by a layer only that state's loop carries. */
const loopOf = (key, asset = null) => ({ loopOnly: true, key, ...(asset ? { asset } : {}) });

/** The thirty-six spells, and the borrowed Drain Life (`azeroth-rpg.sovereign-animations`). */
export const SOV_SPELL_ITEMS = [
  { group: "tier 1", name: "Bloodbolt", from: ["Casting in Vitae and Physical blood"], expect: [cast("bloodbolt", "target")] },
  { group: "tier 1", name: "Decree of Frailty", from: ["Decree of Frailty:"], expect: [cast("decree-of-frailty"), resisted("decree-of-frailty"), effect("blood-curse", { loop: true })] },
  { group: "tier 1", name: "Leaden Decree", from: ["Leaden Decree and Shackles"], expect: [resisted("leaden-decree"), loopOf("blood-curse")] },
  { group: "tier 1", name: "Bleed for Me", from: ["Bleed for Me (R61)"], expect: [cast("bleed-for-me"), resisted("bleed-for-me"), loopOf("sovereigns-blood-magic")] },
  { group: "tier 1", name: "Veil of Majesty", from: ["ANI: Veil of Majesty"], expect: [cast("veil-of-majesty")] },
  { group: "tier 1", name: "Captivating Gaze", from: ["Captivating Gaze (R62)"], expect: [cast("captivating-gaze"), resisted("captivating-gaze"), loopOf("blood-curse")] },
  { group: "tier 1", name: "Royal Approach", from: ["ANI: Royal Approach"], expect: [cast("royal-approach")] },
  { group: "tier 1", name: "Taste of Lineage", from: ["ANI: Taste of Lineage"], expect: [cast("taste-of-lineage")] },
  { group: "tier 1", name: "Royal Seal", from: ["ANI: Royal Seal"], expect: [cast("royal-seal")] },
  { group: "tier 1", name: "Air of Majesty", from: ["Air of Majesty:"], expect: [cast("air-of-majesty")] },
  { group: "tier 2", name: "Twilight Bloodbolt", from: ["ANI: Twilight Bloodbolt, Shadow Lance"], expect: [cast("twilight-bloodbolt", "target")] },
  { group: "tier 2", name: "Sovereign's Kiss", from: ["ANI: Twilight Bloodbolt, Shadow Lance"], expect: [cast("sovereigns-kiss", "target")] },
  { group: "tier 2", name: "Overawe", from: ["ANI: Overawe, Edict of Denial"], expect: [cast("overawe"), resisted("overawe")] },
  { group: "tier 2", name: "Shackles of the Court", from: ["ANI: Overawe, Edict of Denial"], expect: [cast("shackles-of-the-court"), resisted("shackles-of-the-court")] },
  { group: "tier 2", name: "Mirror of Self", from: ["ANI: Mirror of Self"], expect: [cast("mirror-of-self")] },
  { group: "tier 2", name: "Swarming Shadows", from: ["Swarming Shadows:"], expect: [cast("swarming-shadows"), loopOf("swarming-shadows")] },
  { group: "tier 2", name: "Oath of Fealty", from: ["ANI: Oath of Fealty"], expect: [cast("oath-of-fealty")] },
  { group: "tier 2", name: "Royal Herald", from: ["ANI: Oath of Fealty between"], expect: [cast("royal-herald")] },
  { group: "tier 2", name: "Read the Supplicant", from: ["ANI: Veil of Majesty and Read the Supplicant"], expect: [cast("read-the-supplicant")] },
  { group: "tier 3", name: "Shadow Lance", from: ["ANI: Twilight Bloodbolt, Shadow Lance"], expect: [cast("shadow-lance", "target")] },
  { group: "tier 3", name: "Edict of Denial", from: ["ANI: Overawe, Edict of Denial"], expect: [cast("edict-of-denial"), resisted("edict-of-denial")] },
  { group: "tier 3", name: "Tithe of the Many", from: ["Tithe of the Many:"], expect: [cast("tithe-of-the-many"), resisted("tithe-of-the-many")] },
  { group: "tier 3", name: "Bloodbolt Ascension", from: ["ANI: Bloodbolt Ascension among"], expect: [cast("bloodbolt-ascension"), loopOf("sovereigns-blood-magic")] },
  { group: "tier 3", name: "Edict of Stillness", from: ["ANI: Overawe, Edict of Denial"], expect: [cast("edict-of-stillness"), resisted("edict-of-stillness")] },
  { group: "tier 3", name: "Mantle of Majesty", from: ["Mantle of Majesty (R61)"], expect: [cast("mantle-of-majesty"), loopOf("sovereigns-blood-magic")] },
  { group: "tier 3", name: "Eyes of the Swarm", from: ["ANI: Eyes of the Swarm"], expect: [cast("eyes-of-the-swarm")] },
  { group: "tier 3", name: "Royal Command", from: ["Royal Command (R65)"], expect: [cast("royal-command"), resisted("royal-command"), loopOf("sovereigns-blood-magic")] },
  { group: "tier 3", name: "Grant an Audience", from: ["ANI: Overawe, Edict of Denial"], expect: [cast("grant-an-audience"), resisted("grant-an-audience")] },
  { group: "tier 4", name: "Majesty Unbound", from: ["Majesty Unbound:"], expect: [cast("majesty-unbound"), loopOf("sovereigns-blood-magic")] },
  { group: "tier 4", name: "Edict of the Crown", from: ["ANI: Edict of the Crown"], expect: [region("edict-of-the-crown")] },
  { group: "tier 4", name: "Crimson Cascade", from: ["ANI: Crimson Cascade"], expect: [region("crimson-cascade", { who: "any" })] },
  { group: "tier 4", name: "Embrace of the Vampyr", from: ["Embrace of the Vampyr:"], expect: [cast("embrace-of-the-vampyr", "target")] },
  { group: "tier 4", name: "Gaze from the Throne", from: ["ANI: Taste of Lineage"], expect: [cast("gaze-from-the-throne")] },
  { group: "tier 5", name: "The Crimson Tithe", from: ["The Crimson Tithe (R67)"], expect: [cast("the-crimson-tithe")] },
  { group: "tier 5", name: "Aortic Unraveling", from: ["Aortic Unraveling (R70)"], expect: [cast("aortic-unraveling", "target")] },
  { group: "tier 5", name: "Unfading Glory", from: ["Unfading Glory (R68)"], expect: [cast("unfading-glory"), loopOf("sovereigns-blood-magic")] },
  { group: "borrowed", name: "Drain Life (a Warlock's, unchanged)", from: ["A Warlock's Drain Life is unchanged"], expect: [cast("drain-life", "any")] }
];

/**
 * **THE SECOND EIGHTEEN** (07 §17; D-1390 to D-1394), judged in `azeroth-rpg.sovereign-animations2`, which reruns
 * `azeroth-rpg.sovereign-spells2` under the recorder and presses what it leaves unpressed (the three placed areas,
 * and the two charms left standing). A loop with an asset is the loop of THAT state: the blood magic stands one for
 * every spell the Sovereign wears and every charm, and only the asset tells them apart.
 */
const BLOOD_MAGIC = "sovereigns-blood-magic";
const CURSE_LOOP = "jb2a.markers.simple.001.loop.001.red";
const GAPS2 = "ANI2: Incite Terror, Blood Wound and Cauldron of Blood";
const CHARMS2 = "ANI2: Mesmerize and Blood Bond";
export const SOV_SPELL2_ITEMS = [
  { group: "tier 1", name: "Sanguine Barrier", from: ["Sanguine Barrier:"], expect: [cast("sanguine-barrier"), loopOf(BLOOD_MAGIC, "jb2a.shield.01.loop.blue")] },
  { group: "tier 1", name: "Scent of Blood", from: ["Scent of Blood:"], expect: [cast("scent-of-blood"), loopOf(BLOOD_MAGIC, "jb2a.eyes.01.dark_green.single")] },
  { group: "tier 2", name: "Delirious Slash", from: ["Delirious Slash:"], expect: [cast("delirious-slash", "target"), resisted("delirious-slash")] },
  { group: "tier 2", name: "Summons to Court (and its pull)", from: ["Summons to Court:"], expect: [cast("summons-to-court"), resisted("summons-to-court"), { trigger: "arrive", key: "summoned-to-court", who: "any" }] },
  { group: "tier 2", name: "Incite Terror", from: ["Incite Terror:", GAPS2], expect: [cast("incite-terror"), resisted("incite-terror"), region("incite-terror")] },
  { group: "tier 2", name: "Wracking Pain", from: ["Wracking Pain:", "the talents that read a blood curse"], expect: [cast("wracking-pain"), resisted("wracking-pain"), effect("blood-curse"), loopOf("blood-curse", CURSE_LOOP)] },
  { group: "tier 2", name: "Veil of Mist", from: ["Veil of Mist:"], expect: [cast("veil-of-mist"), loopOf(BLOOD_MAGIC, "jb2a.fog_cloud.01.white")] },
  { group: "tier 2", name: "Mesmerize", from: ["Mesmerize:", CHARMS2], expect: [cast("mesmerize"), resisted("mesmerize"), loopOf(BLOOD_MAGIC, "jb2a.sleep.symbol.dark_pink")] },
  { group: "tier 3", name: "Shroud of Sorrow", from: ["Shroud of Sorrow:"], expect: [cast("shroud-of-sorrow"), loopOf("shroud-of-sorrow", "jb2a.darkness.black"), use("shroud:tick", "any")] },
  { group: "tier 3", name: "Burden of Sin (and its strike)", from: ["Burden of Sin:"], expect: [cast("burden-of-sin"), resisted("burden-of-sin"), effect("blood-curse"), use("burden:struck", "any")] },
  { group: "tier 3", name: "Edict of Silence", from: ["Edict of Silence:"], expect: [cast("edict-of-silence"), resisted("edict-of-silence"), loopOf("blood-curse", CURSE_LOOP)] },
  { group: "tier 3", name: "Crimson Carapace", from: ["Crimson Carapace:"], expect: [cast("crimson-carapace"), loopOf(BLOOD_MAGIC, "jb2a.shield_themed.below.molten_earth.01.orange")] },
  { group: "tier 3", name: "Sanguine Draught (and CORE's feeding stream at range)", from: ["Sanguine Draught:"], expect: [cast("sanguine-draught", "target"), use("vitae:feed", "target")] },
  { group: "tier 4", name: "Hemoplague (and its spread)", from: ["Hemoplague:"], expect: [cast("hemoplague"), resisted("hemoplague"), loopOf("blood-curse", CURSE_LOOP), use("hemoplague:spread", "target")] },
  { group: "tier 4", name: "Blood Wound", from: ["Blood Wound:", GAPS2], expect: [cast("blood-wound", "target"), resisted("blood-wound"), region("blood-wound")] },
  { group: "tier 4", name: "Blood Bond", from: ["Blood Bond:", CHARMS2], expect: [cast("blood-bond", "target"), loopOf(BLOOD_MAGIC, "jb2a.markers.heart.pink.01")] },
  { group: "tier 5", name: "Cauldron of Blood", from: ["Cauldron of Blood:", GAPS2], expect: [cast("cauldron-of-blood", "target"), resisted("cauldron-of-blood"), region("cauldron-of-blood")] },
  { group: "tier 5", name: "Hour of the Court", from: ["Hour of the Court:"], expect: [cast("hour-of-the-court"), resisted("hour-of-the-court"), loopOf(BLOOD_MAGIC, "jb2a.bats.loop.01.red")] }
];

/** 02 §7's features, 04's talents with a row, and CORE's pool events (`azeroth-rpg.sovereign-animations-features`). */
export const SOV_FEATURE_ITEMS = [
  { group: "the pools", name: "The Blood Royal's feeding stream (vitae:feed)", from: ["in a fight: a Prone Medium enemy"], expect: [use("vitae:feed", "target")] },
  { group: "the pools", name: "A Blood vial (vitae:vial)", from: ["ANI: the Blood vial drunk"], expect: [use("vitae:vial", "caster")] },
  { group: "the pools", name: "The Tribute wisp (tribute:gain)", from: ["Hunt Mortal, the lanes and Guard"], expect: [use("tribute:gain", "caster")] },
  { group: "the pools", name: "The Health-drain pulse (vitae:overflow)", from: ["Overflow, Overflow to 0"], expect: [use("vitae:overflow", "caster")] },
  { group: "02 §7", name: "Hunt Mortal's prey mark", from: ["Hunt Mortal marks", "Hunt Mortal, the lanes and Guard"], expect: [use("prey-mark", "target", { loop: true })] },
  { group: "02 §7", name: "Prim and Proper", from: ["Prim and Proper:"], expect: [use("prim-and-proper", "caster")] },
  { group: "02 §7", name: "Unending Pursuit", from: ["Hunt Mortal marks"], expect: [use("unending-pursuit", "caster")] },
  { group: "02 §7", name: "Royal Due", from: ["Royal Due:"], expect: [use("royal-due", "target")] },
  { group: "02 §7", name: "Look Upon Me", from: ["Look Upon Me asks"], expect: [use("look-upon-me", "caster"), effect("look-upon-me")] },
  { group: "02 §7", name: "Blood Prison (blood bonds, never shadow)", from: ["Blood Prison costs 10"], expect: [use("blood-prison", "caster"), effect("blood-prison", { loop: true }), use("blood-prison:tear", "any")] },
  { group: "02 §7", name: "Crowned in Blood", from: ["Crowned in Blood costs"], expect: [use("crowned-in-blood", "caster", { loop: true })] },
  { group: "04 Dominion", name: "Bound to the Court", from: ["Bound to the Court:"], expect: [use("bound-to-the-court", "caster"), effect("bound-to-the-court", { loop: true })] },
  { group: "04 Dominion", name: "A blood curse thrown off (Price of Defiance, Lingering Decree, No Pardon)", from: ["Price of Defiance, Lingering Decree"], expect: [use("curse:defied", "target")] },
  { group: "04 Dominion", name: "A blood curse laid by a door, and its loop", from: ["Kneel:", "Homage:", "Unworthy Hand"], expect: [effect("blood-curse", { loop: true })] },
  { group: "04 Dominion", name: "Kneel", from: ["Kneel:"], expect: [use("kneel", "caster")] },
  { group: "04 Dominion", name: "Abject Obedience", from: ["ANI: Abject Obedience"], expect: [use("abject-obedience", "caster"), effect("abject-obedience", { loop: true })] },
  { group: "04 Vainglorious", name: "Above Such Things", from: ["Above Such Things sheds"], expect: [use("above-such-things", "caster")] },
  { group: "04 Vainglorious", name: "Mirrored Self", from: ["ANI: Mirrored Self"], expect: [{ trigger: "hold", key: "mirrored-self", who: "caster" }, { trigger: "arrive", key: "mirrored-self", who: "point" }] },
  { group: "04 Vainglorious", name: "Too Beautiful to Die", from: ["ANI: Too Beautiful to Die holds"], expect: [{ trigger: "hold", key: "too-beautiful-to-die", who: "caster" }] },
  { group: "04 Ravenous", name: "Sanguine Edge", from: ["Sanguine Edge costs"], expect: [use("sanguine-edge", "caster")] },
  { group: "04 Ravenous", name: "Bloodletting", from: ["Bloodletting:"], expect: [use("bloodletting", "caster")] },
  { group: "04 Ravenous", name: "Latch On", from: ["Raking Claws lays Bleeding 2"], expect: [use("latch-on", "target", { loop: true })] },
  { group: "04 Ravenous", name: "The latch's drain", from: ["ANI: the latch's drain"], expect: [use("latch:drain", "caster")] },
  { group: "04 Ravenous", name: "Blood Rush", from: ["Blood Rush costs"], expect: [use("blood-rush", "caster"), { trigger: "arrive", key: "blood-rush", who: "point" }] },
  { group: "04 Ravenous", name: "Tasting Bite", from: ["Tasting Bite on a Prone"], expect: [use("tasting-bite", "target")] },
  { group: "04 Ravenous", name: "The Blood Monarch (a crimson eruption and wings, standing while the form lasts)", from: ["Swift Hunger refuses"], expect: [use("blood-monarch", "caster", { loop: true })] }
];
