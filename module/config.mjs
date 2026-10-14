/**
 * AZEROTH global config object. All enums live here, keyed to localization
 * strings in lang/en.json. Never hardcode these keys in templates.
 */

export const AZEROTH = {};

AZEROTH.abilities = {
  str: "AZEROTH.Ability.Str.Label",
  dex: "AZEROTH.Ability.Dex.Label",
  con: "AZEROTH.Ability.Con.Label",
  int: "AZEROTH.Ability.Int.Label",
  wis: "AZEROTH.Ability.Wis.Label",
  cha: "AZEROTH.Ability.Cha.Label"
};

// Three tracks for the first arc (D-456). Arcane Addiction and Curse of Flesh
// are deferred, not struck — 10-CORRUPTION builds these three.
// tools/check-corruption.ps1 fails if this list and the book disagree.
AZEROTH.corruptionTracks = {
  fel: "AZEROTH.Corruption.Fel.Label",
  void: "AZEROTH.Corruption.Void.Label",
  undeath: "AZEROTH.Corruption.Undeath.Label"
};

// Thresholds are automatic and a track ends at CORRUPTION_MAX (D-457).
AZEROTH.CORRUPTION_THRESHOLDS = [5, 10, 15];
AZEROTH.CORRUPTION_MAX = 20;

// Which Resilience answers each track (D-459). 05-CORE-RULES already assigns
// plague to Body and corruption to Spirit; this mirrors it rather than
// inventing a second mapping.
AZEROTH.corruptionResilience = {
  fel: "spirit",
  void: "spirit",
  undeath: "body"
};

// The fifteen conditions (D-323, opened to thirteen by D-472, to fourteen by
// D-519, to fifteen by D-695). A1-CONDITIONS
// is canonical; every other document names them and adds nothing.
// tools/check-conditions.ps1 fails if this list and the book disagree.
AZEROTH.conditions = {
  bleeding:   "AZEROTH.Condition.Bleeding.Label",
  blinded:    "AZEROTH.Condition.Blinded.Label",
  charmed:    "AZEROTH.Condition.Charmed.Label",
  deafened:   "AZEROTH.Condition.Deafened.Label",
  diseased:   "AZEROTH.Condition.Diseased.Label",
  entangled:  "AZEROTH.Condition.Entangled.Label",
  fatigued:   "AZEROTH.Condition.Fatigued.Label",
  frightened: "AZEROTH.Condition.Frightened.Label",
  numbed:     "AZEROTH.Condition.Numbed.Label",
  poisoned:   "AZEROTH.Condition.Poisoned.Label",
  prone:      "AZEROTH.Condition.Prone.Label",
  scorched:   "AZEROTH.Condition.Scorched.Label",
  silenced:   "AZEROTH.Condition.Silenced.Label",
  slowed:     "AZEROTH.Condition.Slowed.Label",
  stunned:    "AZEROTH.Condition.Stunned.Label"
};

// The three conditions that carry a value rather than being on or off.
// Poisoned stacks to 4; 05-CORE-RULES caps the Bane count at 3, so the fourth
// stack is a Test to shed and nothing more (D-472).
// BLEEDING AND SCORCHED CARRY NO CAP, and that is the book's: A1 gives them
// both "values from separate sources add together" and names no ceiling, so
// the sheet's stepper is bounded only by the arbitrary 99 in
// `actions.mjs#effectAction`. A cap on Scorched would be a rule 08 §20 and A1
// do not have (D-695).
AZEROTH.valuedConditions = ["bleeding", "poisoned", "scorched"];
AZEROTH.POISONED_MAX = 4;
AZEROTH.POISONED_BANE_CAP = 3;
// A1's Scorched is FIRE, so Immune (Fire) and Vulnerable (Fire) answer it
// (05 §15). Named here rather than spelled in `combat.mjs`, because a damage
// type is an enum and enums live in this file (D-695).
AZEROTH.SCORCHED_SCHOOL = "fire";

// 05: the Fatigue track. 1-2 nothing, 3 a Bane on Skill and Attack Tests,
// 4 Slowed, 5 a Bane on Resilience too, 6 collapse (treated as 0 Health).
// A Long Rest removes one.
AZEROTH.FATIGUE_MAX = 6;

AZEROTH.careerTiers = {
  1: "AZEROTH.Career.Tier1",
  2: "AZEROTH.Career.Tier2",
  3: "AZEROTH.Career.Tier3",
  4: "AZEROTH.Career.Tier4"
};

// 02 SS4's nine languages (D-636). A people speaks its own and Common or
// Orcish by the side that raised it; 02 SS9 sells the rest at 20 XP.
AZEROTH.languages = {
  common:      "AZEROTH.Language.Common",
  orcish:      "AZEROTH.Language.Orcish",
  darnassian:  "AZEROTH.Language.Darnassian",
  taurahe:     "AZEROTH.Language.Taurahe",
  zandali:     "AZEROTH.Language.Zandali",
  gutterspeak: "AZEROTH.Language.Gutterspeak",
  thalassian:  "AZEROTH.Language.Thalassian",
  goblin:      "AZEROTH.Language.Goblin",
  lowCommon:   "AZEROTH.Language.LowCommon"
};
// Who a career is open to (03 SS5), and which side raised a people (02 SS1):
// four to the Alliance, four to the Horde, and three to neither, whose side
// the creator asks. The side's tongue is what 02 SS4 adds to your own.
AZEROTH.sides = {
  anyone:   "AZEROTH.Side.Anyone",
  alliance: "AZEROTH.Side.Alliance",
  horde:    "AZEROTH.Side.Horde"
};
AZEROTH.SIDE_LANGUAGE = { alliance: "common", horde: "orcish" };
AZEROTH.RACE_SIDE = {
  "human": "alliance", "dwarf": "alliance", "night-elf": "alliance", "gnome": "alliance",
  "orc": "horde", "tauren": "horde", "troll": "horde", "forsaken": "horde",
  "blood-elf": null, "goblin": null, "ogre": null
};

// The seven schools (D-296). School sets the spell list a class may learn from,
// the Ward it meets, and the Immune and Vulnerable keywords that answer it.
// There is no second taxonomy: the traditions of D-005 are retired.
AZEROTH.schools = {
  fire:   "AZEROTH.School.Fire",
  frost:  "AZEROTH.School.Frost",
  arcane: "AZEROTH.School.Arcane",
  nature: "AZEROTH.School.Nature",
  shadow: "AZEROTH.School.Shadow",
  fel:    "AZEROTH.School.Fel",
  holy:   "AZEROTH.School.Holy"
};

// Damage types are the seven schools plus Physical (06 SS4). Immune and
// Vulnerable both read this list.
AZEROTH.damageTypes = { ...AZEROTH.schools, physical: "AZEROTH.DamageType.Physical" };

// The three Resiliences and the ability each reads (05 SS1). A class trains two,
// and the Proficiency Bonus applies only where it is trained.
AZEROTH.resiliences = {
  body:   "AZEROTH.Resilience.Body",
  reflex: "AZEROTH.Resilience.Reflex",
  spirit: "AZEROTH.Resilience.Spirit"
};
AZEROTH.resilienceAbility = { body: "con", reflex: "dex", spirit: "wis" };

// The ability a class FIGHTS with (01 SS3: "A 16 in the ability your class
// fights or casts with"). The casting half of that sentence is the class
// item's own `castingAbility`, which seven of the nine carry; this names the
// three the chapter otherwise leaves the reader to work out - and only those
// three, because a class that casts is answered by its own field.
//
// Keyed by the class's `identifier`, never by its name, so it survives a
// rename. `rules/creation.mjs#primaryAbilities` is the reader.
AZEROTH.primaryAbility = { warrior: "str", rogue: "dex", ranger: "dex" };

// Six size rungs, smallest first (D-545). Medium is the default. Size does
// exactly three things -- carrying, moving through a space, resisting being
// moved -- and changes no Health, Defense, reach or square.
AZEROTH.sizes = {
  tiny:     "AZEROTH.Size.Tiny",
  small:    "AZEROTH.Size.Small",
  medium:   "AZEROTH.Size.Medium",
  large:    "AZEROTH.Size.Large",
  huge:     "AZEROTH.Size.Huge",
  enormous: "AZEROTH.Size.Enormous"
};

// A class Frame sets the Health base (05, D1 SS3).
AZEROTH.frames = {
  slight:   "AZEROTH.Frame.Slight",
  standard: "AZEROTH.Frame.Standard",
  hardy:    "AZEROTH.Frame.Hardy"
};
AZEROTH.FRAME_BASE = { slight: 10, standard: 11, hardy: 13 };

// The pool names (05 SS11). THE CAP IS ON THE CLASS ITEM, not here -- D-507 is
// exactly the fault of keeping a constant where the rules have a lookup.
AZEROTH.momentumTypes = {
  rage:        "AZEROTH.Pool.Rage",
  zeal:        "AZEROTH.Pool.Zeal",
  quarry:      "AZEROTH.Pool.Quarry",
  comboPoints: "AZEROTH.Pool.ComboPoints",
  ferocity:    "AZEROTH.Pool.Ferocity"
};
AZEROTH.powerTypes = {
  mana:   "AZEROTH.Pool.Mana",
  focus:  "AZEROTH.Pool.Focus",
  energy: "AZEROTH.Pool.Energy"
};
// Every pool a feature may spend from (D-612): the five Momentum names and
// the three Power names, one map so a select can offer them together.
AZEROTH.poolTypes = { ...AZEROTH.momentumTypes, ...AZEROTH.powerTypes };
// What feeds Speed (05 §10, D-621), for the banner's tooltip.
AZEROTH.speedParts = {
  race:    "AZEROTH.Speed.Race",
  armor:   "AZEROTH.Speed.Armor",
  muffled: "AZEROTH.Speed.Muffled",
  // Undeath's rungs (10 §6, 2026-09-06).
  corruption: "AZEROTH.Speed.Corruption",
  // An Encumbering weapon worn (08 §5).
  weapon: "AZEROTH.Speed.Weapon",
  // What you are carrying (05 §10, D-675).
  encumbered: "AZEROTH.Speed.Encumbered",
  // A creature's own printed pace (14 §1): its first part, where a character
  // starts from its race. A creature has no race item to name.
  block: "AZEROTH.Speed.Block",
  // `+N Speed` off what is worn (08 §20's Signature, a haste rating on a
  // Classic find). Both models push this part and neither had a word for it,
  // so the tooltip printed the bare key `grant`.
  grant: "AZEROTH.Speed.Grant"
};
// The three kinds of shape a character may wear (02 §7, D-769): the law is
// `rules/shapes.mjs#SHAPE_KINDS`, and `shapes.test.mjs` holds the two in step.
AZEROTH.shapeKinds = {
  shapeshift:    "AZEROTH.Shape.Kind.Shapeshift",
  avatar:        "AZEROTH.Shape.Kind.Avatar",
  metamorphosis: "AZEROTH.Shape.Kind.Metamorphosis"
};
// A class feature is a thing you do or a thing you are (02 §7, D-612).
AZEROTH.featureKinds = {
  action:  "AZEROTH.Feature.Kind.Action",
  passive: "AZEROTH.Feature.Kind.Passive"
};
// How often a limited feature refreshes.
AZEROTH.usesPer = {
  short:     "AZEROTH.Feature.Per.Short",
  long:      "AZEROTH.Feature.Per.Long",
  encounter: "AZEROTH.Feature.Per.Encounter"
};
AZEROTH.FAVORITES_MAX = 15;
// The Momentum maneuvers open to anyone (05 SS11, 06 SS7): name, cost and the
// book's sentence, which the Combat tab shows when a row is opened and the
// card prints (D-617, D-626). Called Shot is paid in the attack dialog.
AZEROTH.maneuvers = [
  { key: "press",      cost: 2, label: "AZEROTH.Maneuver.Press",      text: "AZEROTH.Maneuver.PressText" },
  { key: "sunder",     cost: 4, label: "AZEROTH.Maneuver.Sunder",     text: "AZEROTH.Maneuver.SunderText" },
  { key: "overbear",   cost: 4, label: "AZEROTH.Maneuver.Overbear",   text: "AZEROTH.Maneuver.OverbearText" },
  { key: "calledShot", cost: 2, label: "AZEROTH.Maneuver.CalledShot", text: "AZEROTH.Maneuver.CalledShotText" },
  { key: "disarm",     cost: 4, label: "AZEROTH.Maneuver.Disarm",     text: "AZEROTH.Maneuver.DisarmText" },
  { key: "driveBack",  cost: 4, label: "AZEROTH.Maneuver.DriveBack",  text: "AZEROTH.Maneuver.DriveBackText" },
  { key: "riposte",    cost: 4, label: "AZEROTH.Maneuver.Riposte",    text: "AZEROTH.Maneuver.RiposteText" }
];
// 05 SS5: an Opposed Test is two Tests at DC 12, the higher SL winning.
// Fight states that are statuses but not conditions (D-627): Guard's
// "attackers have a Bane against you until your next turn", and Disengage's
// "move up to your Speed without provoking Opportunity Attacks" (05's
// Half-Action table, D-694). Kept apart from AZEROTH.conditions so the book's
// fourteen stay fourteen.
//
// Guard is lifted at the START of the guarder's next turn, because that is
// how long it lasts. Disengaging is lifted at the END of the mover's own
// turn: it pays for a Move that turn and nothing else, and a state that
// outlived the turn would cover a shove on somebody else's.
AZEROTH.combatStates = {
  guarded: "AZEROTH.Combat.Guarded",
  disengaging: "AZEROTH.Combat.Disengaging"
};
AZEROTH.OPPOSED_DC = 12;
AZEROTH.casterGrades = {
  none: "AZEROTH.Caster.None",
  half: "AZEROTH.Caster.Half",
  full: "AZEROTH.Caster.Full"
};

// The three hit locations (D-411, 06 SS2). Body is free and is the default; a
// Limb costs a Bane and the Head a Bane and -2. The location is CHOSEN before
// the roll and is never read off the die.
AZEROTH.locations = {
  body: "AZEROTH.Location.Body",
  head: "AZEROTH.Location.Head",
  limb: "AZEROTH.Location.Limb"
};

// The six armor categories (08 SS8). "The category sets every Armor Point. A
// named suit differs in price, weight and provenance and never in what it
// stops." A Cut moves points between locations and pays for it elsewhere.
AZEROTH.armorCategories = {
  none:    "AZEROTH.Armor.None",
  cloth:   "AZEROTH.Armor.Cloth",
  leather: "AZEROTH.Armor.Leather",
  studded: "AZEROTH.Armor.Studded",
  mail:    "AZEROTH.Armor.Mail",
  plate:   "AZEROTH.Armor.Plate"
};
/**
 * 08 §5's four Cut traits. `rules/armor.mjs` holds what each one does and
 * which categories may take it; this is only the name a sheet prints.
 *
 * A Cut was stored on twenty suits and drawn NOWHERE — not on the item sheet,
 * which has no descriptor for it, and so a brigandine never said it was
 * Harnessed even though the cut moves a point of Armor from its limbs to its
 * body (the lead, 2026-09-07).
 */
AZEROTH.armorCuts = {
  closed:    "AZEROTH.Cut.Closed",
  open:      "AZEROTH.Cut.Open",
  long:      "AZEROTH.Cut.Long",
  harnessed: "AZEROTH.Cut.Harnessed"
};
AZEROTH.ARMOR_AP = {
  none:    { body: 0, head: 0, limb: 0 },
  cloth:   { body: 2, head: 0, limb: 1 },
  leather: { body: 2, head: 1, limb: 1 },
  studded: { body: 3, head: 2, limb: 2 },
  mail:    { body: 4, head: 3, limb: 3 },
  plate:   { body: 5, head: 4, limb: 4 }
};
// Armor mostly does not make you harder to hit. Only leather adds Defense
// (D-452, 08 SS8), and a shield adds 1 on top of whatever the suit gives.
AZEROTH.ARMOR_DEFENSE = { none: 0, cloth: 0, leather: 1, studded: 0, mail: 0, plate: 0 };
AZEROTH.SHIELD_DEFENSE = 1;

/**
 * 08 §11's Slot column (D-686, D-689), in the figure's reading order.
 *
 * *The Slot column is the rule, and you wear one thing in each slot.* Two
 * rows often name one slot - a sash and a belt are both the waist, a brooch,
 * an amulet and a pendant all the neck - so §11's seventeen rows are thirteen
 * slots. `rules/worn.mjs` is the law - which name goes in which slot, how many
 * each holds, and what an equip has to put away - and `worn.test.mjs` holds
 * this list against its `WORN_SLOTS` and against the chapter.
 */
AZEROTH.wornSlots = {
  head:     "AZEROTH.Slot.Head",
  neck:     "AZEROTH.Slot.Neck",
  shoulder: "AZEROTH.Slot.Shoulder",
  back:     "AZEROTH.Slot.Back",
  clothing: "AZEROTH.Slot.Clothing",
  tabard:   "AZEROTH.Slot.Tabard",
  wrist:    "AZEROTH.Slot.Wrist",
  hands:    "AZEROTH.Slot.Hands",
  waist:    "AZEROTH.Slot.Waist",
  legs:     "AZEROTH.Slot.Legs",
  feet:     "AZEROTH.Slot.Feet",
  finger:   "AZEROTH.Slot.Finger",
  trinket:  "AZEROTH.Slot.Trinket"
};

/**
 * The tiles on the Overview figure that are not one of §11's slots (D-689):
 * 08 §8's suit, 06 §2's two hands, 08 §7's launcher and its bundle, and the
 * shield and the Augment, which are HELD in the off hand (07 §3, D-674).
 *
 * `shield` and `augment` draw no tile of their own - they exist so the Off
 * hand tile can name what it is showing. They key the same vocabulary as
 * `wornSlots` so the figure's roster in `rules/worn.mjs` can carry both, and
 * nothing here is stored on an item: every tile is answered from what is
 * equipped.
 */
AZEROTH.heldSlots = {
  body:     "AZEROTH.Held.Body",
  mainHand: "AZEROTH.Held.MainHand",
  offHand:  "AZEROTH.Held.OffHand",
  ranged:   "AZEROTH.Held.Ranged",
  ammo:     "AZEROTH.Held.Ammo",
  shield:   "AZEROTH.Held.Shield",
  augment:  "AZEROTH.Held.Augment"
};

// Five rarity rungs and the budget each spends on affixes (08 SS2, D-376).
// A Legendary is not costed: it spends no budget and its entry prints a dash.
AZEROTH.rarities = {
  common:    "AZEROTH.Rarity.Common",
  uncommon:  "AZEROTH.Rarity.Uncommon",
  rare:      "AZEROTH.Rarity.Rare",
  epic:      "AZEROTH.Rarity.Epic",
  legendary: "AZEROTH.Rarity.Legendary"
};
AZEROTH.RARITY_BUDGET = { common: 0, uncommon: 1, rare: 3, epic: 5, legendary: null };
AZEROTH.RARITY_PRICE_MULTIPLIER = { common: 1, uncommon: 5, rare: 25, epic: 100, legendary: null };

// What ONE attribute suffix grants, by the item's rarity (08 SS6, D-701).
//
// THE COST DOES NOT MOVE. A suffix is priced at 08 SS4's rate for its rung -
// 1 for the one-point name, 2 for the greater beast - wherever it is set, and
// the rarity says what that rung delivers. SS6's two-rung table serves an
// Uncommon and a Rare; an Epic and a Legendary are named individually (SS4)
// and grant +3 to +5, with the entry naming the number inside the band.
//
// Three rungs rather than two, because a found item's grade is read off its
// cohort rank in `rules/classic-loot.mjs` and the middle of the band is what
// that rank is for. Uncommon and Rare repeat their second, so nothing below
// Epic moves.
AZEROTH.RARITY_ATTRIBUTE_GRANT = {
  common:    [0, 0, 0],
  uncommon:  [1, 2, 2],
  rare:      [1, 2, 2],
  epic:      [3, 4, 5],
  legendary: [3, 4, 5]
};

// Where a find is made (D-666). 12 SS8's classes for the two the setting
// names, 14 SS14's Dungeon and its Boss, and the open road. The odds each
// carries are the TOOL'S, in `rules/loot.mjs`, never the chapter's.
AZEROTH.lootScenarios = {
  wilderness: "AZEROTH.Loot.Scenario.Wilderness",
  site:       "AZEROTH.Loot.Scenario.Site",
  outpost:    "AZEROTH.Loot.Scenario.Outpost",
  dungeon:    "AZEROTH.Loot.Scenario.Dungeon",
  boss:       "AZEROTH.Loot.Scenario.Boss"
};

// The action ladder (D-255). Each rung costs strictly more than the last.
// A turn is two Half-Actions plus one Reaction (D-012).
AZEROTH.actions = {
  half:     "AZEROTH.Action.Half",
  action:   "AZEROTH.Action.Action",
  full:     "AZEROTH.Action.Full",
  reaction: "AZEROTH.Action.Reaction"
};
AZEROTH.HALF_ACTIONS_PER_TURN = 2;
AZEROTH.REACTIONS_PER_TURN = 1;

// 06 §6's five Reactions, in the chapter's own order. `rules/reactions.mjs` is
// the law - what each one requires, what Block takes off, whether a Parry
// held - and these are the words a card and a refusal print.
AZEROTH.reactions = {
  opportunityAttack: "AZEROTH.Reaction.OpportunityAttack",
  parry:             "AZEROTH.Reaction.Parry",
  block:             "AZEROTH.Reaction.Block",
  pummel:            "AZEROTH.Reaction.Pummel",
  readied:           "AZEROTH.Reaction.Readied"
};

// The four kinds of Test the roll dialog knows (05 §2). Written down at last
// because a Bane laid on another creature names one (06 §6's Pummel), and a
// schema `choices` needs a vocabulary rather than a list typed twice.
AZEROTH.testKinds = {
  skill:      "AZEROTH.TestKind.Skill",
  attack:     "AZEROTH.TestKind.Attack",
  casting:    "AZEROTH.TestKind.Casting",
  resilience: "AZEROTH.TestKind.Resilience"
};

// The Tests a GRANT SENTENCE may name (08 SS6's grammar, 08 SS20's Signatures,
// 14's standing passives). 05 SS2's four kinds, and **Parry** - 06 SS6 makes
// that Reaction an Attack Test of its own, and four Classic finds carry a parry
// rating the lead reads as a Boon on it.
//
// **It is NOT `testKinds` and must not be folded into it.** That vocabulary is
// what the roll dialog rolls and what a Bane may be LAID on (`rules/banes.mjs`
// reads its keys), and nothing in the book lays a Bane on a Parry. Parry is a
// NARROWING: a Boon on Attack Tests helps a Parry as well, and a Boon on Parry
// Tests helps nothing else.
AZEROTH.grantTests = {
  ...AZEROTH.testKinds,
  parry: "AZEROTH.TestKind.Parry"
};

// The SCALARS a worn thing may grant, and what each one is called (08 SS20,
// 2026-09-10). 08 SS6's affix pool sells none of them - it sells attributes,
// Fortitude, Spellpower, Ward and skill Boons and nothing else - so the carrier
// is a Signature, which SS20 already prices. The lead's Classic conversion is
// what needs them: a dodge or defense rating is `+N Defense`, a hit rating is
// `+N Attack`, a haste rating is `+N Speed` in feet.
//
// **`damageRating` and `armorPoint` are NOT here**, and `rules/grants.mjs`
// says why at length: both are stamped onto the item's own stored number, so a
// second sum would count each of them twice.
//
// The words are the sheet's existing ones, because the Core tab already prints
// Defense, Speed and Initiative and the In-force column explaining them must
// not invent a second name for the same number.
AZEROTH.wornScalars = {
  defense:    "AZEROTH.Sheet.Defense",
  attack:     "AZEROTH.Sheet.Attack",
  speed:      "AZEROTH.Sheet.Speed",
  initiative: "AZEROTH.Sheet.Initiative"
};

/**
 * What a consumable's Use is (08 §12, §13; D-668), and what a container holds
 * (08 §11, D-671). `rules/consumables.mjs` and `rules/containers.mjs` are the
 * law; these are the words a sheet prints.
 *
 * Neither vocabulary was in config at all, so neither could be drawn: 82 gear
 * items carried a Use and 58 a capacity, and no sheet said a word about either
 * (the lead, 2026-09-07: *check all types of equipment for issues like this*).
 */
AZEROTH.consumableKinds = {
  none:      "AZEROTH.Consumable.None",
  restore:   "AZEROTH.Consumable.Restore",
  elixir:    "AZEROTH.Consumable.Elixir",
  draught:   "AZEROTH.Consumable.Draught",
  dressing:  "AZEROTH.Consumable.Dressing",
  poison:    "AZEROTH.Consumable.Poison",
  coating:   "AZEROTH.Consumable.Coating",
  explosive: "AZEROTH.Consumable.Explosive"
};

/**
 * What 08 §12's *Food and drink* shelf holds (D-733).
 *
 * A Short Rest spends one item of food for the Health and one of drink for the
 * Mana, so the pack has to be able to tell a meal from a pint - and every row
 * on that shelf carried the same `use.kind: "none"` and the same section.
 * `rules/provisions.mjs` is the law and `GearData.provision` is where the
 * parser stamps it, off the table's own category cell. `hotMeal` is 08 §12's
 * *Health equal to your tier again*; it is a kind of its own rather than a
 * second field so the item sheet draws one select and the browser one facet.
 */
AZEROTH.provisionKinds = {
  food:    "AZEROTH.Provision.Food",
  hotMeal: "AZEROTH.Provision.HotMeal",
  drink:   "AZEROTH.Provision.Drink"
};

/** Who or what a Use is aimed at. */
AZEROTH.useTargets = {
  self: "AZEROTH.Consumable.TargetSelf",
  item: "AZEROTH.Consumable.TargetItem",
  area: "AZEROTH.Consumable.TargetArea"
};

/** What a coating may be laid on, as 08 §13's *Goes on* column names it. */
AZEROTH.coatingTargets = {
  weapon:     "AZEROTH.Consumable.OnWeapon",
  melee:      "AZEROTH.Consumable.OnMelee",
  twoHanded:  "AZEROTH.Consumable.OnTwoHanded",
  ammunition: "AZEROTH.Consumable.OnAmmunition",
  shield:     "AZEROTH.Consumable.OnShield",
  armor:      "AZEROTH.Consumable.OnArmor"
};

/** What a container counts, where it counts rather than weighs (08 §11). */
AZEROTH.holdKinds = {
  arrows:  "AZEROTH.Hold.Arrows",
  bolts:   "AZEROTH.Hold.Bolts",
  shots:   "AZEROTH.Hold.Shots",
  scrolls: "AZEROTH.Hold.Scrolls",
  vials:   "AZEROTH.Hold.Vials",
  people:  "AZEROTH.Hold.People"
};

/**
 * Why a thing that looks like a holder adds no bag slots (08 §11; D-736).
 * The keys are `rules/slots.mjs#HOLDER_REASONS`, and a reason is printed
 * because a Barrel that quietly added nothing would read as a bug.
 */
AZEROTH.holderReasons = {
  tooBig:      "AZEROTH.Bags.Why.tooBig",
  words:       "AZEROTH.Bags.Why.words",
  unknownKind: "AZEROTH.Bags.Why.unknownKind",
  noMount:     "AZEROTH.Bags.Why.noMount"
};

/**
 * What an item's Signature DOES (08 SS20). `rules/signatures.mjs` is the law;
 * these are the words a sheet prints.
 *
 * A Signature was prose and nothing else - 533 equipment documents carried one
 * and no roll, no Active Effect and no grant had ever read one. `none` is the
 * absence: a placeholder, or a sentence this system has no equivalent for.
 */
AZEROTH.signatureKinds = {
  none:       "AZEROTH.Signature.Kind.None",
  standing:   "AZEROTH.Signature.Kind.Standing",
  onHit:      "AZEROTH.Signature.Kind.OnHit",
  // A blow that FINISHES a creature is not a blow that lands: Gorehowl's
  // *when an attack with it reduces a creature to 0 Health* fired off nothing
  // the other six kinds carry.
  onKill:     "AZEROTH.Signature.Kind.OnKill",
  whenStruck: "AZEROTH.Signature.Kind.WhenStruck",
  use:        "AZEROTH.Signature.Kind.Use",
  spell:      "AZEROTH.Signature.Kind.Spell",
  tick:       "AZEROTH.Signature.Kind.Tick"
};

// THE SAME EIGHT AS A LABEL RATHER THAN A SENTENCE. `signatureKinds` explains
// what a kind IS - *Something the bearer presses* - which reads as a line on
// the Overview column and reads badly in a 20px chip beside an action and a
// limit, where every other chip is one or two words. The two are different
// strings because they do different work, not because the vocabulary drifted.
AZEROTH.signatureKindsShort = {
  none:       "AZEROTH.Signature.Short.None",
  standing:   "AZEROTH.Signature.Short.Standing",
  onHit:      "AZEROTH.Signature.Short.OnHit",
  onKill:     "AZEROTH.Signature.Short.OnKill",
  whenStruck: "AZEROTH.Signature.Short.WhenStruck",
  use:        "AZEROTH.Signature.Short.Use",
  spell:      "AZEROTH.Signature.Short.Spell",
  tick:       "AZEROTH.Signature.Short.Tick"
};

/**
 * The Banes an item's Signature may take back off the dialog.
 *
 * **A BANE CANCELLED IS NOT A BOON.** 08 SS6's grammar has *A Boon on Attack
 * Tests* and nothing that removes one, and a Boon standing against two Banes
 * is a different roll from one Bane never being taken. Dragonstalker Armor is
 * the entry that says so: *takes no Bane on Attack Tests against dragonkin,
 * whatever the range* - and *whatever the range* names WHICH Bane, 06's
 * second range band, which `rules/distance.mjs` measures and
 * `rules/modifiers.mjs` draws.
 *
 * The keys are that dialog's own line ids, so the label is the line's and the
 * two cannot drift; nothing else in 08 SS20 cancels anything, and a key here
 * with no entry to justify it would be the speculative kind.
 */
AZEROTH.cancellableBanes = {
  longRange: "AZEROTH.Modifier.LongRange"
};

/**
 * What a Signature is gated on. 08 SS20: *a gate names a class, a race, a
 * faction, a school or a condition of the world.* The conditions of the world
 * this can judge are the ones the chapter's own entries write - the bearer
 * below half Health, the form a Druid is in, a Fel Corruption score, and a
 * turn in which the bearer has not moved - plus the two the TARGET carries,
 * its kind and whether it has acted yet, which are judged at the roll.
 *
 * **A GATE IS A LIST AND EVERY PART OF IT MUST HOLD.** Eight of SS20's
 * twenty-six write a compound - *a Paladin wielding it ... against undead and
 * demons* is a class gate and a creature-type gate at once - and a single
 * `{kind, value}` could only carry the first of them. SS20 prices *gated* at 1
 * however many clauses the gate has, so nothing about the budget moves.
 *
 * A gate this system cannot judge is NOT invented here: *against a creature
 * already taking Fire damage over time* is the table's call (D2 SS12), and the
 * Signature takes `signatureReasons.tableCall` instead.
 */
AZEROTH.signatureGates = {
  class:             "AZEROTH.Signature.Gate.Class",
  race:              "AZEROTH.Signature.Gate.Race",
  faction:           "AZEROTH.Signature.Gate.Faction",
  school:            "AZEROTH.Signature.Gate.School",
  creatureType:      "AZEROTH.Signature.Gate.CreatureType",
  belowHalfHealth:   "AZEROTH.Signature.Gate.BelowHalfHealth",
  form:              "AZEROTH.Signature.Gate.Form",
  // *A warlock with Fel Corruption 1 or more may read it.* The value is a
  // track and a floor - `fel 1` - read against 10's own ladder.
  corruption:        "AZEROTH.Signature.Gate.Corruption",
  // *While you have not moved this turn.* The bearer's, off the movement
  // history the turn clears.
  hasNotMoved:       "AZEROTH.Signature.Gate.HasNotMoved",
  // *Against any creature that has not yet acted this combat.* The target's.
  targetHasNotActed: "AZEROTH.Signature.Gate.TargetHasNotActed",
  // *If the blow was an Off-Hand Attack or you moved earlier in the turn*
  // (Dal'Rend's Sacred Charge, D-696). A fact about THE BLOW BEING MADE, so it
  // is knowable only where an attack is being built and fails closed on the
  // standing pass, which is right - the Momentum exists at the blow or not at
  // all. It is a gate rather than a second grammar because the OR the sentence
  // writes is exactly the OR a clause's value already is: the list is an AND
  // and the value inside one clause is an "any of".
  blow: "AZEROTH.Signature.Gate.Blow"
};

// What a `blow` gate may name (D-696). Two, because 08 SS20 writes two: the
// Off-Hand Attack of 06 SS2, and a turn the bearer has already moved in - the
// mirror of `hasNotMoved`, off the same movement halves `spendMovement` records
// (D-659). The keys are the words the chapter uses, so the census can hold the
// descriptor against the sentence.
AZEROTH.signatureBlows = {
  "off-hand": "AZEROTH.Signature.Blow.OffHand",
  moved: "AZEROTH.Signature.Blow.Moved"
};

// WHO A SIGNATURE'S AURA REACHES (08 SS20, D-696). The Bulwark of Tyr's Hand:
// *every other member of your party within 15 feet takes 5 less damage from
// every source* - the one Signature in the chapter that lands on somebody ELSE,
// and the gap D-691 logged for 14's own auras (O-97).
//
// `party` is the Party, D-658's actor flag and the only roster of "your side"
// this system keeps for a character. `allies` is D-755's: the lead's word for
// 02 §7's *allies* and 04's *friendly targets* - in a fight the tracker's side,
// out of one the Party and what it has bound (`rules/distance.mjs
// #countsAsAlly`), the holder among them unless the source's own sentence
// says *other than you* (the lead, 2026-09-26). 14's auras will add whatever THEIR
// sentences name when those entries are written; a key with no entry behind it
// would be the speculative kind.
//
// **A VOCABULARY, NOT A LABEL MAP** (D-755's review), and the same for the two
// lists below. No surface draws an aura's roster, centre or gate for a person:
// the effect an ally carries says whose it is and how far it reaches in its own
// words (`AZEROTH.Aura.*`, `effects/auras.mjs#auraDescription`). A label here
// was a string nothing localised, which `lang-unused.test.mjs` passed through
// its parent-prefix fallback without a word (CLAUDE.md §11, §15). When a sheet
// comes to draw one, the label arrives with its reader.
AZEROTH.auraTargets = ["party", "allies"];

// WHERE AN AURA IS MEASURED FROM (D-755). The holder, or every token of every
// demon bound to them - Demonic Pact's *within 20 feet of it* - so a warlock
// with no token of their own still gives it.
AZEROTH.auraCentres = ["self", "boundDemon"];

// WHAT AN AURA WAITS ON (D-755): Avenging Bulwark's *while you carry a shield*
// and Tree of Life's *while the druid is a tree*, written `spell:<identifier>`
// for the spell's laid effect. `rules/auras.mjs#auraGateOpen` reads the part
// before the colon, and a kind outside this list fails closed.
AZEROTH.auraGates = ["shield", "spell"];

// WHY A SIGNATURE IS STILL PROSE, in `abilityReasons`' shape (D-691). A kind
// of `none` with no reason is a Signature nobody has read; a reason is one
// that was read and left alone, and the census prints the remainder by name
// instead of it vanishing.
AZEROTH.signatureReasons = {
  noEquivalent:   "AZEROTH.Signature.Reason.NoEquivalent",
  tableCall:      "AZEROTH.Signature.Reason.TableCall",
  targetRelative: "AZEROTH.Signature.Reason.TargetRelative",
  scaled:         "AZEROTH.Signature.Reason.Scaled",
  narrative:      "AZEROTH.Signature.Reason.Narrative",
  unwritten:      "AZEROTH.Signature.Reason.Unwritten"
};

// WHY A PRESSABLE SIGNATURE IS UNAVAILABLE RIGHT NOW (08 SS20, D-692).
// `rules/signatures.mjs#pressRefusal` is the one judgement; these are the words
// the door's notification and all three surfaces print. **A greyed control that
// does not say why is the state a player asks the GM about** (D5), so every
// surface prints the sentence beside the button rather than dimming it alone.
AZEROTH.signatureRefusals = {
  gate:    "AZEROTH.Signature.Refusal.Gate",
  spent:   "AZEROTH.Signature.Refusal.Spent",
  noSpell: "AZEROTH.Signature.Refusal.NoSpell"
};

// The five trait kinds (D-416). 08 SS5 defines every trait and 06 SS3 carries a
// names-only roster; Mount belongs to 08 SS15 alone and 06 must not name one.
// The five kinds of creature a character puts under their control (D-643).
// A creature's ability, automated (D-647): what pressing Use does.
AZEROTH.abilityKinds = {
  none: "AZEROTH.AbilityKind.None",
  attack: "AZEROTH.AbilityKind.Attack",
  test: "AZEROTH.AbilityKind.Test",
  spell: "AZEROTH.AbilityKind.Spell",
  heal: "AZEROTH.AbilityKind.Heal",
  utility: "AZEROTH.AbilityKind.Utility",
  // Standing, never pressed: what the creature refuses, what it grants itself,
  // what it senses (D-691).
  passive: "AZEROTH.AbilityKind.Passive",
  // More bodies on the field, placed from the card (D-691, decision 2).
  summon: "AZEROTH.AbilityKind.Summon"
};
// WHY AN ENTRY IS STILL PROSE (D-691). `kind: "none"` with no reason is an
// entry nobody has read; a reason is one that was read and left alone, and the
// census prints the remainder by name instead of it vanishing.
AZEROTH.abilityReasons = {
  aura: "AZEROTH.AbilityReason.Aura",
  tableCall: "AZEROTH.AbilityReason.TableCall",
  targetRelative: "AZEROTH.AbilityReason.TargetRelative",
  scaled: "AZEROTH.AbilityReason.Scaled",
  unnamed: "AZEROTH.AbilityReason.Unnamed",
  replacesBlock: "AZEROTH.AbilityReason.ReplacesBlock",
  onTheBlock: "AZEROTH.AbilityReason.OnTheBlock",
  narrative: "AZEROTH.AbilityReason.Narrative"
};
// The gate a passive re-derives every data preparation (D-691). `null` is
// always. Nothing here is the table's call: 05's own numbers and the tokens
// on the scene are all these read.
AZEROTH.passiveWhen = {
  belowHalfHealth: "AZEROTH.PassiveWhen.BelowHalfHealth",
  standing: "AZEROTH.PassiveWhen.Standing",
  nearAlly: "AZEROTH.PassiveWhen.NearAlly"
};
// What a passive refuses beyond A1's conditions (D-691): the two the book
// names and no condition carries.
AZEROTH.refusalExtras = {
  forcedMovement: "AZEROTH.Refusal.ForcedMovement",
  surprise: "AZEROTH.Refusal.Surprise"
};
// What a creature senses or how it moves (D-691). One vocabulary, because 14
// writes both in the same sentence - *swims at twice its Speed and breathes
// water*.
AZEROTH.creatureSenses = {
  darkvision: "AZEROTH.Sense.Darkvision",
  waterBreathing: "AZEROTH.Sense.WaterBreathing",
  swim: "AZEROTH.Sense.Swim",
  swimFast: "AZEROTH.Sense.SwimFast",
  wallWalking: "AZEROTH.Sense.WallWalking",
  phasing: "AZEROTH.Sense.Phasing"
};
// Whose side what arrives fights on, and when it starts (D-691). Every entry
// in 14 reads *acts on his side from the next round*; the vocabulary carries
// the other half so a GM's own row can say otherwise.
AZEROTH.summonSides = {
  summoner: "AZEROTH.Summon.Side.Summoner",
  opposing: "AZEROTH.Summon.Side.Opposing"
};
AZEROTH.summonFrom = {
  nextRound: "AZEROTH.Summon.From.NextRound",
  now: "AZEROTH.Summon.From.Now"
};
// How long 05's temporary Health lasts (D-777): `rules/temporary-health.mjs
// #TEMP_SPANS`, in the words the banner's tooltip prints.
AZEROTH.temporaryHealthSpans = {
  effect: "AZEROTH.TemporarySpan.Effect",
  encounter: "AZEROTH.TemporarySpan.Encounter",
  longRest: "AZEROTH.TemporarySpan.LongRest"
};
// How long a condition an ability inflicts holds (D-628's durations).
AZEROTH.untilKinds = {
  endOfNextTurn: "AZEROTH.Until.EndOfNextTurn",
  nextTurn: "AZEROTH.Until.NextTurn",
  encounter: "AZEROTH.Until.Encounter",
  // *Until the start of YOUR next turn* - the caster's (02's Hurricane, D-771):
  // the area vocabulary's own word (`rules/area-ticks.mjs#AREA_UNTIL`).
  casterTurnStart: "AZEROTH.Until.CasterTurnStart"
};
// A creature's two pools, by kind: the block names no type (D-637).
AZEROTH.npcPoolKinds = { momentum: "AZEROTH.Momentum.Label", power: "AZEROTH.Sheet.Power" };
AZEROTH.abilityUsesPer = {
  short: "AZEROTH.Feature.Per.Short", long: "AZEROTH.Feature.Per.Long", encounter: "AZEROTH.Feature.Per.Encounter",
  // 14 writes *once a round*, *once a turn* and *once a day* too (D-691).
  round: "AZEROTH.Feature.Per.Round", turn: "AZEROTH.Feature.Per.Turn", day: "AZEROTH.Feature.Per.Day"
};

AZEROTH.boundKinds = {
  companion: "AZEROTH.Bound.Kind.Companion",
  demon: "AZEROTH.Bound.Kind.Demon",
  elemental: "AZEROTH.Bound.Kind.Elemental",
  totem: "AZEROTH.Bound.Kind.Totem",
  summon: "AZEROTH.Bound.Kind.Summon"
};

// The ways a weapon is used to attack (06 §1, 08 §5's Thrown; D-731), in the
// order `rules/ammunition.mjs#ATTACK_MODES` holds them. The roll dialog draws
// the first two as a choice where a weapon has both.
AZEROTH.attackModes = {
  hand: "AZEROTH.Dialog.AttackMode.Hand",
  thrown: "AZEROTH.Dialog.AttackMode.Thrown",
  shot: "AZEROTH.Dialog.AttackMode.Shot"
};

// What a door says when a caller forces a way the weapon or the row has not
// got (D-731's review): a Javelin forced into the hand is refused in words
// rather than quietly thrown. An Opportunity Attack only prefers the hand, so
// it never reaches these.
AZEROTH.attackModeRefusals = {
  hand: "AZEROTH.Attack.NoWay.Hand",
  thrown: "AZEROTH.Attack.NoWay.Thrown",
  shot: "AZEROTH.Attack.NoWay.Shot"
};

// What a launcher is, and what a shot is cut to (08 §7's Fits column, D-641).
AZEROTH.launcherKinds = {
  bow: "AZEROTH.Launcher.Bow",
  sling: "AZEROTH.Launcher.Sling",
  blowgun: "AZEROTH.Launcher.Blowgun",
  boulderSling: "AZEROTH.Launcher.BoulderSling",
  crossbow: "AZEROTH.Launcher.Crossbow",
  heavyCrossbow: "AZEROTH.Launcher.HeavyCrossbow",
  handCrossbow: "AZEROTH.Launcher.HandCrossbow",
  firearm: "AZEROTH.Launcher.Firearm"
};

AZEROTH.traitKinds = {
  form:        "AZEROTH.TraitKind.Form",
  cut:         "AZEROTH.TraitKind.Cut",
  effect:      "AZEROTH.TraitKind.Effect",
  enchantment: "AZEROTH.TraitKind.Enchantment",
  mount:       "AZEROTH.TraitKind.Mount"
};
AZEROTH.enchantmentFamilies = {
  craft:  "AZEROTH.Enchantment.Craft",
  school: "AZEROTH.Enchantment.School",
  bound:  "AZEROTH.Enchantment.Bound"
};
AZEROTH.enchantmentGrades = {
  lesser:  "AZEROTH.Grade.Lesser",
  greater: "AZEROTH.Grade.Greater"
};

// The twenty-three skills, in book order, grouped by the ability each reads
// (02 SS8). Skill Test = ability modifier + Proficiency Bonus + Skill Rank.
AZEROTH.skills = {
  athletics:     "AZEROTH.Skill.Athletics",
  acrobatics:    "AZEROTH.Skill.Acrobatics",
  sleightOfHand: "AZEROTH.Skill.SleightOfHand",
  stealth:       "AZEROTH.Skill.Stealth",
  arcana:        "AZEROTH.Skill.Arcana",
  archaeology:   "AZEROTH.Skill.Archaeology",
  investigation: "AZEROTH.Skill.Investigation",
  medicine:      "AZEROTH.Skill.Medicine",
  tinkering:     "AZEROTH.Skill.Tinkering",
  warfare:       "AZEROTH.Skill.Warfare",
  handling:      "AZEROTH.Skill.Handling",
  insight:       "AZEROTH.Skill.Insight",
  perception:    "AZEROTH.Skill.Perception",
  seafaring:     "AZEROTH.Skill.Seafaring",
  spiritLore:    "AZEROTH.Skill.SpiritLore",
  survival:      "AZEROTH.Skill.Survival",
  barter:        "AZEROTH.Skill.Barter",
  deception:     "AZEROTH.Skill.Deception",
  intimidation:  "AZEROTH.Skill.Intimidation",
  leadership:    "AZEROTH.Skill.Leadership",
  performance:   "AZEROTH.Skill.Performance",
  persuasion:    "AZEROTH.Skill.Persuasion",
  streetwise:    "AZEROTH.Skill.Streetwise"
};
AZEROTH.skillAbility = {
  athletics: "str",
  acrobatics: "dex", sleightOfHand: "dex", stealth: "dex",
  arcana: "int", archaeology: "int", investigation: "int",
  medicine: "int", tinkering: "int", warfare: "int",
  handling: "wis", insight: "wis", perception: "wis",
  seafaring: "wis", spiritLore: "wis", survival: "wis",
  barter: "cha", deception: "cha", intimidation: "cha", leadership: "cha",
  performance: "cha", persuasion: "cha", streetwise: "cha"
};
// Ranks run 0 to 15 (D-291). 05 owns the ladder.
AZEROTH.RANK_MAX = 15;

// Five weight classes (D-489, D-505). Printed on every bestiary entry so a GM
// knows what they are looking at before reading a number.
AZEROTH.weightClasses = {
  chaff:    "AZEROTH.Weight.Chaff",
  soldier:  "AZEROTH.Weight.Soldier",
  standard: "AZEROTH.Weight.Standard",
  elite:    "AZEROTH.Weight.Elite",
  boss:     "AZEROTH.Weight.Boss"
};

// A closed vocabulary of eight, because other chapters read it: a Test that
// targets a demon or an elemental finds one by this word (14 SS1). An optional
// parenthetical marker qualifies it -- `Undead (Mindless)` is what Mind Blast
// looks for.
AZEROTH.creatureTypes = {
  undead:    "AZEROTH.CreatureType.Undead",
  humanoid:  "AZEROTH.CreatureType.Humanoid",
  beast:     "AZEROTH.CreatureType.Beast",
  demon:     "AZEROTH.CreatureType.Demon",
  elemental: "AZEROTH.CreatureType.Elemental",
  dragonkin: "AZEROTH.CreatureType.Dragonkin",
  construct: "AZEROTH.CreatureType.Construct",
  ooze:      "AZEROTH.CreatureType.Ooze"
};

// A Boss's DC comes off its tier (D-539, superseding D-524's flat 20), and is
// the same number for everything it makes you Test against.
AZEROTH.BOSS_DC = { 1: 17, 2: 18, 3: 19, 4: 22 };
// Boss Actions: 2 at tiers 1-2, 3 at tiers 3-4 (D-513).
AZEROTH.BOSS_ACTIONS = { 1: 2, 2: 2, 3: 3, 4: 3 };

// Power pool sizes. A class NAMES its Power pool (02 SS7) but the size is a
// rule rather than a number on the class: Mana scales with level from 02 SS6's
// table, while Focus and Energy are flat (05 SS11). Momentum is the other way
// round -- 02 SS7 prints its cap, so the class carries it (D-507).
AZEROTH.POWER_FLAT = { focus: 6, energy: 10 };
// Mana by level band, full caster then half caster (02 SS6). The casting
// ability modifier is added on top.
AZEROTH.MANA_BY_BAND = [
  { maxLevel: 4,  full: 10, half: 5 },
  { maxLevel: 8,  full: 20, half: 10 },
  { maxLevel: 12, full: 30, half: 15 },
  { maxLevel: 16, full: 40, half: 20 },
  { maxLevel: 20, full: 50, half: 25 }
];
// Recovery rates (05 SS11): Energy refills every round, Focus on a Short Rest
// and by holding position, Mana on a Long Rest with half on a Short Rest.
AZEROTH.POWER_REFILL_PER_TURN = { focus: 2, energy: 3 };

// Success Level bounds — SL = trunc((total - dc) / 5), capped at ±SL_CAP.
AZEROTH.SL_CAP = 6;

// 05 SS3: unless a DC is given, a Standard Test at the tier of whatever caused
// it. Never a world setting - the number is the book's.
AZEROTH.STANDARD_DC = { 1: 12, 2: 16, 3: 20, 4: 24 };

// 05: the Fatigue rungs that reach a Test. 3 is a Bane on Skill and Attack
// Tests; 5 puts one on Resilience as well.
// 05 §16: a Short Rest "twice per day". Counted on the character between Long
// Rests and warned about on the card, never refused (D-623).
AZEROTH.SHORT_RESTS_PER_DAY = 2;
// 05 §9: Slowed arrives at 4; the collapse is FATIGUE_MAX (D-624).
AZEROTH.FATIGUE_SLOWED_AT = 4;
// 06 §8: three Death Steps end the track (D-629).
AZEROTH.DEATH_STEPS = 3;
AZEROTH.DEATH_STEP_DC = 12;
AZEROTH.FATIGUE_BANE_AT = 3;
AZEROTH.FATIGUE_RESILIENCE_BANE_AT = 5;

// 06 SS2, 06 SS7 (D-239): 2 Momentum cancels a called shot's Bane, never the -2.
AZEROTH.CALLED_SHOT_MOMENTUM = 2;

// 07 SS8: Overchannel costs this many Health per tier of the spell per point.
AZEROTH.OVERCHANNEL_HEALTH_PER_TIER = 2;

// 10 SS3: what exposes you, and at what DC. A null DC is the table's to set.
// The three regional grades name no track - the region does; the three
// creature kinds name theirs.
AZEROTH.EXPOSURE_OCCASIONS = {
  touched:   { dc: 12, track: null },
  tainted:   { dc: 15, track: null },
  saturated: { dc: 18, track: null },
  scourge:   { dc: 15, track: "undeath" },
  demon:     { dc: 15, track: "fel" },
  voidThing: { dc: 18, track: "void" },
  handled:   { dc: null, track: null }
};

// Who holds a region on the world map (D-680). THREE states, the lead's call:
// 12 SS2's own vocabulary is wider - held by a body, contested between two, or
// held by nobody, and the chapters add Divided - but 02 SS1 sides only the
// eight seats, so everything else reads neutral. The chapter's own `Held by`
// sentence is carried verbatim and printed, so nothing is lost off the page.
AZEROTH.control = {
  alliance: "AZEROTH.Control.Alliance",
  horde:    "AZEROTH.Control.Horde",
  neutral:  "AZEROTH.Control.Neutral"
};

// 12 SS6's three taint grades. The grade indexes EXPOSURE_OCCASIONS above:
// grade 1 is `touched`, 2 is `tainted`, 3 is `saturated`. Forty-nine regions
// carry a grade or None, and the track is the region's.
AZEROTH.taintGrades = {
  1: "AZEROTH.Taint.Touched",
  2: "AZEROTH.Taint.Tainted",
  3: "AZEROTH.Taint.Saturated"
};

// D-491's six settlement classes. The LOAD-BEARING column: 07 SS5 reads the
// training tier off it and 08 SS3 reads the availability band off it, so 12
// states the kind of place once and neither rule is restated there.
AZEROTH.settlementClasses = {
  capital: "AZEROTH.Settlement.Capital",
  city:    "AZEROTH.Settlement.City",
  town:    "AZEROTH.Settlement.Town",
  village: "AZEROTH.Settlement.Village",
  outpost: "AZEROTH.Settlement.Outpost",
  site:    "AZEROTH.Settlement.Site"
};

// The floating Health change over a token: a canvas fill cannot read a CSS
// token, so the two colours are here. Red for a drop, green for a rise.
AZEROTH.HEALTH_TEXT = { damage: "#d93a3a", heal: "#6dbf2e" };

// WHAT A STANDING ANIMATION FOLLOWS (D-729). A loop runs only while the game
// holds the state it is bound to, so the binding is also the sentence the stop
// door prints: it is what tells a reader why a picture is on their board and
// what would end it. The keys are `rules/animation-table.mjs`'s own.
//
// Every key is written out WHOLE rather than built from a branch: a key joined
// from a prefix leaves only the prefix in the source, and `lang-unused.test.mjs`
// takes a prefix as proof of use for every string beneath it, so a retired
// binding would keep its string for ever with nothing able to say so.
AZEROTH.animationBindings = {
  "sustain-self": "AZEROTH.Animation.Binding.SustainSelf",
  "sustain-target": "AZEROTH.Animation.Binding.SustainTarget",
  "sustain-channel": "AZEROTH.Animation.Binding.SustainChannel",
  "sustain-region": "AZEROTH.Animation.Binding.SustainRegion",
  "sustain-resisted": "AZEROTH.Animation.Binding.SustainResisted",
  effect: "AZEROTH.Animation.Binding.Effect",
  "effect-region": "AZEROTH.Animation.Binding.EffectRegion"
};

// EVERY REASON NOTHING PLAYS, and the sentence each is said in (D-729). The
// order is the order `animationAvailability` asks them in.
//
// Here rather than in `module/animation/availability.mjs` for the reason every
// other enum is here (CLAUDE.md §4): a reason is a word the API answers with
// AND a sentence a reader is owed, and those are one fact. The window held a
// second copy of this and quietly said *There is no scene on screen* for
// `unsettled`, which was not true.
AZEROTH.animationReasons = {
  off: "AZEROTH.Animation.Unavailable.Off",
  noSequencer: "AZEROTH.Animation.Unavailable.NoSequencer",
  noLibrary: "AZEROTH.Animation.Unavailable.NoLibrary",
  effectsOff: "AZEROTH.Animation.Unavailable.EffectsOff",
  photosensitive: "AZEROTH.Animation.Unavailable.Photosensitive",
  noPermission: "AZEROTH.Animation.Unavailable.NoPermission",
  noCanvas: "AZEROTH.Animation.Unavailable.NoCanvas",
  unsettled: "AZEROTH.Animation.Unavailable.Unsettled"
};

// And what one is doing on THIS screen, in words (D-730). `rules/animation.mjs`
// answers with the key; the window localises it. Colour is never the carrier,
// so the sentence is the whole of it.
AZEROTH.animationStates = {
  playing: "AZEROTH.Animation.State.Playing",
  stopped: "AZEROTH.Animation.State.Stopped",
  hidden: "AZEROTH.Animation.State.Hidden",
  off: "AZEROTH.Animation.State.NotDrawn"
};
