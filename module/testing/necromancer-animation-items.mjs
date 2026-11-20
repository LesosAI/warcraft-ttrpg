/**
 * **WHAT EACH NECROMANCER ITEM MUST PLAY, AND WHERE ITS CONTROL IS PRESSED** (team ANI). Pure data,
 * read by the five `azeroth-rpg.necromancer-animations-*` batches (`quench-necromancer-animations.mjs`)
 * and held to the class by `module/rules/necromancer-animation-items.test.mjs`: every spell 07 gives
 * the Necromancer, every feature 02 gives it and every talent 04 gives it is an item here, with the
 * cues it must play (trigger, key and the role it plays for) or the quiet reason it plays nothing of
 * its own (`NECRO_NO_ROW`), and the scenario titles whose real controls press it.
 *
 * `from` is a list of title PREFIXES of the tests (in the batch the item is judged in) whose bodies
 * press the item's control; `who` is the role a cue must be placed for: `caster` (the record's source
 * is the Necromancer), `target` (an effect step on a creature other than the Necromancer), `risen`
 * (on a token the record says rose), `source` (the acting creature is the source and is drawn on),
 * `point` (an effect step at a canvas point), `any`.
 */

const cast = (key, who = "caster") => ({ trigger: "cast", key, who });
const rise = key => ({ trigger: "rise", key, who: "risen" });
const resisted = key => ({ trigger: "resist", key, who: "target" });
const region = (key, extra = {}) => ({ trigger: "region", key, who: "any", ...extra });
const use = (key, who = "any") => ({ trigger: "use", key, who });

/** Tiers 1 and 2, and the Essence batch's events. */
export const SPELL_ITEMS = [
  { group: "tier 1 spells", name: "Bone Shards", from: ["Bone Shards: 5 Shadow"], expect: [cast("bone-shards")] },
  { group: "tier 1 spells", name: "Bone Shards on a failed Casting Test (the legitimate skip)", from: ["a failed Casting Test still spends the Essence"], expect: [{ trigger: "cast", key: "bone-shards", skip: "failed-cast" }] },
  { group: "tier 1 spells", name: "Grave Rot", from: ["Grave Rot:"], expect: [cast("grave-rot", "point")] },
  { group: "tier 1 spells", name: "Grave Touch", from: ["Grave Touch:"], expect: [cast("grave-touch", "target")] },
  { group: "tier 1 spells", name: "Dread Whisper", from: ["Dread Whisper:"], expect: [cast("dread-whisper", "target"), resisted("dread-whisper")] },
  { group: "tier 1 spells", name: "Bone Ward", from: ["Bone Ward:"], expect: [cast("bone-ward")] },
  { group: "tier 1 spells", name: "Mend the Dead", from: ["Mend the Dead:"], expect: [cast("mend-the-dead", "target")] },
  { group: "tier 1 spells", name: "Raise Dead", from: ["Raise Dead and Animate Corpse"], expect: [cast("raise-dead"), rise("raise-dead")] },
  { group: "tier 1 spells", name: "Animate Corpse", from: ["Raise Dead and Animate Corpse"], expect: [cast("animate-corpse"), rise("animate-corpse")] },
  { group: "tier 1 spells", name: "Grave Sense", from: ["Grave Sense:"], expect: [cast("grave-sense")] },
  { group: "tier 1 spells", name: "Corpse Candle", from: ["Corpse Candle:"], expect: [cast("corpse-candle")] },
  { group: "tier 1 spells", name: "Deathmask", from: ["Deathmask: the caster wears"], expect: [cast("deathmask")] },
  { group: "tier 1 spells", name: "Bone Courier", from: ["Bone Courier:"], expect: [cast("bone-courier")] },
  { group: "tier 2 spells", name: "Soul Lash", from: ["Soul Lash:"], expect: [cast("soul-lash", "target")] },
  { group: "tier 2 spells", name: "Cripple", from: ["Cripple:"], expect: [resisted("cripple")] },
  { group: "tier 2 spells", name: "Plague Cloud", from: ["Plague Cloud: the placed fog"], expect: [region("plague-cloud", { loop: true })] },
  { group: "tier 2 spells", name: "Field of Bones", from: ["Field of Bones:"], expect: [region("field-of-bones")] },
  { group: "tier 2 spells", name: "Frenzy of the Dead", from: ["Frenzy of the Dead: each raised dead"], expect: [cast("frenzy-of-the-dead", "target")] },
  { group: "tier 2 spells", name: "Grave Step", from: ["Grave Step:"], expect: [cast("grave-step", "any"), { trigger: "arrive", key: "grave-step", who: "any" }] },
  { group: "tier 2 spells", name: "Ghoul Rising", from: ["Ghoul Rising stands"], expect: [cast("ghoul-rising"), rise("ghoul-rising")] },
  { group: "tier 2 spells", name: "Ghostly Servant", from: ["Ghostly Servant:"], expect: [cast("ghostly-servant")] },
  { group: "tier 2 spells", name: "Grave Ward", from: ["Grave Ward:"], expect: [cast("grave-ward")] },
  { group: "tier 2 spells", name: "Borrowed Senses", from: ["Borrowed Senses:"], expect: [cast("borrowed-senses")] },
  { group: "tier 2 spells", name: "Death's Tidings", from: ["Death's Tidings:"], expect: [cast("deaths-tidings")] },
  { group: "events", name: "the Essence wisp (a death within 120 feet)", from: ["a living enemy dying 100 feet away"], expect: [use("essence:gain", "caster")] },
  { group: "events", name: "Soul Harvest (the Warlock's, through the death watch)", from: ["Soul Harvest gives a Warlock 2 Mana"], expect: [use("soul-harvest")] }
];

/** Tier 3 (and the gaps pressed here). */
export const T3_ITEMS = [
  { group: "tier 3 spells", name: "Wraith Bolt", from: ["Wraith Bolt:"], expect: [cast("wraith-bolt", "target")] },
  { group: "tier 3 spells", name: "Plague Wind", from: ["ANI: Plague Wind's cone"], expect: [region("plague-wind")] },
  { group: "tier 3 spells", name: "Grave Tide", from: ["ANI: Grave Tide's line"], expect: [region("grave-tide")] },
  { group: "tier 3 spells", name: "Terror of the Grave", from: ["Terror of the Grave:", "ANI: Terror of the Grave's ground"], expect: [region("terror-of-the-grave"), resisted("terror-of-the-grave")] },
  { group: "tier 3 spells", name: "Bone Shield", from: ["Bone Shield: refused from the sheet"], expect: [cast("bone-shield")] },
  { group: "tier 3 spells", name: "Unholy Restoration", from: ["Unholy Restoration:"], expect: [cast("unholy-restoration", "target")] },
  { group: "tier 3 spells", name: "Stitch Abomination", from: ["Stitch Abomination and Bind Banshee"], expect: [cast("stitch-abomination"), rise("stitch-abomination")] },
  { group: "tier 3 spells", name: "Bind Banshee", from: ["Stitch Abomination and Bind Banshee"], expect: [cast("bind-banshee"), rise("bind-banshee")] },
  { group: "tier 3 spells", name: "Spirit Anchor", from: ["Spirit Anchor: the anchor set"], expect: [cast("spirit-anchor")] },
  { group: "tier 3 spells", name: "Death Trance", from: ["Death Trance:"], expect: [cast("death-trance")] },
  { group: "tier 3 spells", name: "Bone Bridge", from: ["Bone Bridge:"], expect: [cast("bone-bridge")] },
  { group: "tier 3 spells", name: "Mark of the Grave", from: ["Mark of the Grave:"], expect: [cast("mark-of-the-grave", "target")] },
  { group: "tier 3 spells", name: "Graveblight", from: ["ANI: Graveblight's area"], expect: [region("graveblight", { loop: true })] },
  { group: "talents", name: "Barbed Bone", from: ["Bone Shield: refused from the sheet"], expect: [use("barbed-bone", "target")] },
  { group: "grafts", name: "Bone Plating (a standing graft: the stitching as it is given)", from: ["Stitch Abomination and Bind Banshee"], expect: [rise("graft:stitch")] }
];

/** Tiers 4 and 5, the spells the Necromancer shares (and the gaps pressed here). */
export const T45_ITEMS = [
  { group: "tier 4 spells", name: "Raise Crypt Horror", from: ["Raise Crypt Horror and Enslave"], expect: [cast("raise-crypt-horror"), rise("raise-crypt-horror")] },
  { group: "tier 4 spells", name: "Enslave the Dead", from: ["Raise Crypt Horror and Enslave"], expect: [resisted("enslave-the-dead")] },
  { group: "tier 4 spells", name: "Bone Prison", from: ["Bone Prison:"], expect: [resisted("bone-prison")] },
  { group: "tier 4 spells", name: "Necrotic Nova", from: ["ANI: Necrotic Nova's burst"], expect: [region("necrotic-nova")] },
  { group: "tier 4 spells", name: "Soul Cage", from: ["Soul Cage:"], expect: [resisted("soul-cage")] },
  { group: "tier 4 spells", name: "Soul Rip", from: ["Soul Rip:"], expect: [cast("soul-rip", "target")] },
  { group: "tier 4 spells", name: "Shroud of Bone", from: ["Shroud of Bone:"], expect: [cast("shroud-of-bone", "target")] },
  { group: "tier 4 spells", name: "Unholy Renewal", from: ["Unholy Renewal:"], expect: [cast("unholy-renewal", "target")] },
  { group: "tier 4 spells", name: "Call the Departed", from: ["Call the Departed:"], expect: [cast("call-the-departed")] },
  { group: "tier 4 spells", name: "Speak with the Dead", from: ["Speak with the Dead: the corpse answers"], expect: [cast("speak-with-the-dead")] },
  { group: "tier 4 spells", name: "Contagion", from: ["Contagion: under the caster's Graveblight"], expect: [region("contagion")] },
  { group: "tier 5 spells", name: "Puppet of Flesh", from: ["Puppet of Flesh:"], expect: [cast("puppet-of-flesh"), resisted("puppet-of-flesh")] },
  { group: "tier 5 spells", name: "Plague of Undeath", from: ["ANI: Plague of Undeath's ground"], expect: [region("plague-of-undeath")] },
  { group: "tier 5 spells", name: "Reaping", from: ["Reaping:"], expect: [cast("reaping")] },
  { group: "tier 5 spells", name: "Sever the Soul", from: ["Sever the Soul:"], expect: [cast("sever-the-soul", "target"), resisted("sever-the-soul")] },
  { group: "tier 5 spells", name: "The Dead Rise", from: ["The Dead Rise stands the corpses"], expect: [cast("the-dead-rise"), rise("the-dead-rise")] },
  { group: "tier 5 spells", name: "Shroud of the Grave", from: ["Shroud of the Grave:"], expect: [cast("shroud-of-the-grave", "target")] },
  { group: "shared spells", name: "Drain Life", from: ["Drain Life (the lead"], expect: [cast("drain-life", "target")] },
  { group: "shared spells", name: "Curse of Agony", from: ["Curse of Agony: the Apply"], expect: [cast("curse-of-agony")] },
  { group: "shared spells", name: "Curse of Weakness", from: ["Curse of Weakness: a failed"], expect: [cast("curse-of-weakness")] },
  { group: "shared spells", name: "Curse of Tongues", from: ["Curse of Tongues:"], expect: [cast("curse-of-tongues")] },
  { group: "events", name: "the Essence wisp (Soul Cage's and Soul Rip's gains)", from: ["Soul Cage:", "Soul Rip:"], expect: [use("essence:gain", "caster")] }
];

/** 02's features, 04's talents and the horde's events (the talents, horde and verify batches). */
export const FT_ITEMS = [
  { group: "features", name: "Command the Dead", from: ["Command the Dead's Empowered line"], expect: [use("command-the-dead", "caster")] },
  { group: "features", name: "Grave Calling", key: "grave-calling", quiet: true, from: ["Raise Dead from the sheet's Cast"], expect: [cast("raise-dead"), rise("raise-dead")] },
  { group: "features", name: "Deathly Vigor", from: ["Raise Dead twice and Ghoul Rising"], expect: [rise("deathly-vigor")] },
  { group: "features", name: "Claim the Fallen", key: "claim-the-fallen", quiet: true, from: ["Claim the Fallen offers Raise Dead"], expect: [cast("raise-dead"), rise("raise-dead")] },
  { group: "features", name: "Grave Guard", from: ["Grave Guard moves a blow"], expect: [use("grave-guard", "target")] },
  { group: "features", name: "Dark Ritual", from: ["Dark Ritual at tier 3", "Dark Ritual from the sheet"], expect: [use("dark-ritual", "caster")] },
  { group: "features", name: "Unending Dead", from: ["Unending Dead stands a fallen"], expect: [{ trigger: "rise", key: "unending-dead", who: "risen" }] },
  { group: "features", name: "Lichdom (the return)", from: ["a lich takes Ward 3"], expect: [{ trigger: "rise", key: "lichdom", who: "risen" }] },
  { group: "talents", name: "Ghoul Frenzy", from: ["Ghoul Frenzy's and Commander of Bone's Empowered surges"], expect: [use("ghoul-frenzy", "caster")] },
  { group: "talents", name: "Commander of Bone", from: ["Ghoul Frenzy's and Commander of Bone's Empowered surges"], expect: [use("commander-of-bone", "caster")] },
  { group: "talents", name: "Regenerating Tissue", from: ["Regenerating Tissue's Empowered mending"], expect: [use("regenerating-tissue", "target")] },
  { group: "talents", name: "Bone Vanguard", from: ["Regenerating Tissue's Empowered mending"], expect: [use("bone-vanguard", "target")] },
  { group: "talents", name: "Gorge", from: ["Gorge:"], expect: [use("gorge", "target")] },
  { group: "talents", name: "Bone Armor", from: ["Bone Armor at rank 2", "Bone Armor from the sheet"], expect: [use("bone-armor", "caster"), use("horde:collapse", "point")] },
  { group: "talents", name: "Marrowguard", key: "marrowguard", quiet: true },
  { group: "talents", name: "Restless Bones", from: ["Restless Bones: a skeleton felled"], expect: [rise("restless-bones")] },
  { group: "talents", name: "Bloated Dead", from: ["Bloated Dead: a zombie that drops"], expect: [use("bloated-dead", "source")] },
  { group: "talents", name: "Plague Carrier", from: ["Plague Carrier: the ghoul's hit", "Plague Carrier's Empowered surge"], expect: [use("plague-carrier", "caster"), { trigger: "effect", key: "plague-carrier", who: "any" }] },
  { group: "talents", name: "Bone Storm", from: ["Bone Storm: a skeleton beside"], expect: [use("bone-storm", "caster")] },
  { group: "talents", name: "Acolyte's Sacrifice", from: ["Acolyte's Sacrifice: a servant collapses"], expect: [use("acolytes-sacrifice", "caster"), rise("acolytes-sacrifice")] },
  { group: "talents", name: "Watchful Shades", from: ["Acolyte's Sacrifice: a servant collapses"], expect: [use("watchful-shades", "caster")] },
  { group: "talents", name: "Circle of the Damned", from: ["Circle of the Damned at rank 3", "Circle of the Damned pressed on the board"], expect: [region("circle-of-the-damned", { loop: true })] },
  { group: "talents", name: "Grand Circle", from: ["Circle of the Damned pressed on the board"], expect: [use("grand-circle", "caster")] },
  { group: "talents", name: "Cult Fervor", key: "cult-fervor", quiet: true, from: ["Circle of the Damned at rank 3"], expect: [region("circle-of-the-damned", { loop: true })] },
  { group: "talents", name: "Life for a Life", from: ["Life for a Life:"], expect: [{ trigger: "hold", key: "life-for-a-life", who: "target" }] },
  { group: "talents", name: "Unholy Fervor", from: ["Unholy Fervor at rank 2"], expect: [use("unholy-fervor", "target")] },
  { group: "talents", name: "Unsummon", from: ["Unsummon: a servant collapses"], expect: [use("unsummon", "caster")] },
  { group: "talents", name: "Dark Communion", from: ["Dark Communion: out of a fight"], expect: [use("dark-communion", "caster")] },
  { group: "talents", name: "The Black Rite", from: ["The Black Rite: a servant"], expect: [use("the-black-rite", "caster")] },
  { group: "talents", name: "Exhume", from: ["Exhume:"], expect: [use("exhume", "caster")] },
  { group: "talents", name: "Sacrificial Strength", key: "sacrificial-strength", quiet: true, from: ["Sacrificial Strength at rank 2"], expect: [use("horde:collapse", "point")] },
  { group: "talents", name: "Skeletal Archery", key: "skeletal-archery", quiet: true, from: ["Raise Dead from the sheet's Cast"], expect: [rise("raise-dead")] },
  { group: "talents", name: "Swelling Ranks", key: "swelling-ranks", quiet: true },
  { group: "talents", name: "The Endless Host", key: "the-endless-host", quiet: true },
  { group: "grafts", name: "Meat Hook, Warded Hide and Swollen (the stitching as each is given)", from: ["Meat Hook, Warded Hide (Fire) and Swollen"], expect: [rise("graft:stitch")] },
  { group: "events", name: "a raised dead collapsing", from: ["one skeleton of a pair is dismissed alone"], expect: [use("horde:collapse", "point")] },
  { group: "events", name: "raised dead standing with no raise card (Plague of Undeath's victims)", from: ["Plague of Undeath: a creature that fails is plagued"], expect: [rise("horde:rise")] },
  { group: "creatures", name: "the Skeletal Archer's Bone bow", from: ["the Skeletal Archer's Bone bow"], expect: [{ kind: "attack", form: "arrow", who: "source" }] }
];

/** The review and fix batches' items, the grafts and the raised creatures' own abilities. */
export const CREATURE_ITEMS = [
  { group: "features", name: "Lichdom (the phylactery bound)", from: ["ANI: Lichdom's binding", "a lich's heal is refused on a living ally"], expect: [use("lichdom:bind", "caster")] },
  { group: "talents", name: "Shambling Horde", key: "shambling-horde", quiet: true, from: ["Animate Corpse under Shambling Horde 1"], expect: [rise("animate-corpse")] },
  { group: "talents", name: "Ranks of Bone", key: "ranks-of-bone", quiet: true, from: ["Ranks of Bone 1 lets Raise Dead"], expect: [rise("raise-dead")] },
  { group: "talents", name: "Skeletal Mastery", from: ["Skeletal Archery and Mastery 1 offer"], expect: [rise("skeletal-mastery")] },
  { group: "talents", name: "Grafted Flesh", key: "grafted-flesh", quiet: true, from: ["Grafted Flesh gives an Animate Corpse zombie"], expect: [rise("graft:stitch")] },
  { group: "talents", name: "Surgeon's Hand", key: "surgeons-hand", quiet: true, from: ["Grafted Flesh gives an Animate Corpse zombie"], expect: [rise("graft:stitch")] },
  { group: "talents", name: "Practiced Stitcher", key: "practiced-stitcher", quiet: true, from: ["Practiced Stitcher 1 takes 1 off"], expect: [rise("graft:stitch")] },
  { group: "talents", name: "Masterwork Abomination", key: "masterwork-abomination", quiet: true, from: ["Practiced Stitcher 1 takes 1 off"], expect: [rise("stitch-abomination")] },
  { group: "talents", name: "Grim Sacrament", key: "grim-sacrament", quiet: true, from: ["Grim Sacrament 2: Dark Ritual"], expect: [use("dark-ritual", "caster")] },
  { group: "talents", name: "Flesh Offering", key: "flesh-offering", quiet: true, from: ["the dialog draws the lower price"], expect: [cast("bone-shards", "target")] },
  { group: "events", name: "Enslave the Dead's control ending", from: ["takes 07's Bane on a Mindless target"], expect: [use("enslave:end", "target")] },
  { group: "grafts", name: "Meat Hook (the pull)", from: ["a Chain hook hit asks the Test"], expect: [use("graft:meat-hook", "target")] },
  { group: "grafts", name: "Grasping Arms", from: ["a melee hit asks Grasping Arms"], expect: [use("graft:grasping-arms", "target")] },
  { group: "grafts", name: "Plague Bladder", from: ["a melee hit asks Grasping Arms", "a failed Plague Bladder Test lays Poisoned 1"], expect: [use("graft:plague-bladder", "target")] },
  { group: "grafts", name: "Butcher's Arm (a standing graft: the stitching as it is given)", from: ["ANI: Butcher's Arm"], expect: [rise("graft:stitch")] },
  { group: "creatures", name: "the Skeletal Mage's Frostbolt", from: ["ANI: the Skeletal Mage's Frostbolt"], expect: [{ trigger: "cast", key: "frostbolt", who: "source" }] },
  { group: "creatures", name: "the Skeletal Mage's Frost Armor", from: ["ANI: the Skeletal Mage's Frost Armor"], expect: [{ trigger: "cast", key: "frost-armor", who: "source" }] },
  { group: "creatures", name: "the Shade's Numbing Cold", from: ["ANI: the Shade's Numbing Cold"], expect: [use("ability:numbing-cold", "source")] },
  { group: "creatures", name: "the Shade's Unseen", from: ["ANI: the Shade's Unseen"], expect: [use("ability:unseen", "source")] },
  { group: "creatures", name: "the Shade's Chilling touch", from: ["ANI: the Shade's Chilling touch"], expect: [{ kind: "attack", who: "source" }] },
  { group: "creatures", name: "the Abomination's Gut Spill", from: ["ANI: the Abomination's Gut Spill"], expect: [use("ability:gut-spill", "source")] },
  { group: "creatures", name: "the Abomination's Cleaver and Chain hook", from: ["ANI: the Abomination's Cleaver"], expect: [{ kind: "attack", who: "source" }] }
];

/** The items each batch judges, for the Vitest that holds the list to the class (`necromancer-animations-list.test.mjs`). */
export const ANIMATION_ITEMS = Object.freeze({ spells: SPELL_ITEMS, t3: T3_ITEMS, t45: T45_ITEMS, featuresTalents: FT_ITEMS, creatures: CREATURE_ITEMS });
