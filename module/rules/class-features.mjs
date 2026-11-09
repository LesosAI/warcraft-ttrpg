/**
 * Class features as mechanics (02 §7, D-612).
 *
 * The class items carry each feature as the book prints it - a level, a
 * name, a paragraph. Nothing in that paragraph is machine-readable, so this
 * table says, feature by feature, what the sheet can do with it: what kind
 * of thing it is, what it costs, whether it makes a Casting Test, how often
 * it may be used, and what number it heals or deals. Reviewed one class at
 * a time against the pack source; the test beside this file fails if a
 * feature in a class has no entry here or an entry names no feature.
 *
 * Pure: no Foundry imports. `featuresFor` and `evaluateAmount` are what the
 * actor and the workflow read.
 *
 * Descriptor:
 *   kind      "action" | "passive"
 *   action    "half" | "action" | "full" | "reaction" | null  (null: a rider on
 *             another action, or something done outside a turn)
 *   cost      { pool, amount, all? } | null   pool is a momentumTypes or
 *             powerTypes key; `all` spends the whole pool (Finisher, Kill Shot)
 *   casting   true where the feature makes a Casting Test
 *   dc        a fixed DC for that Test, where the book names one
 *   uses      { max, per: "short" | "long" | "encounter" } | null
 *   heal      an amount expression, or null
 *   damage    { amount, type } | null   type is a damageTypes key
 *   resist    "body" | "reflex" | "spirit" | null   the target's Test
 *   extraAttack  true on the level-5 feature the turn budget reads
 *   extraAttackIn  the kind of shape the Extra Attack needs (`rules/shapes.mjs`
 *             SHAPE_KINDS), or absent where it needs none: the Druid's is
 *             *while in a Shapeshift form* (02 §7, D-769)
 *   freeMove  how many Moves cost no Half-Action (02 §7's Sprint, D-712). The
 *             budget carries the number and `AzerothCombatant#_freeMoves`
 *             decides whether this turn holds one - *your first turn of a
 *             fight* is the combatant's own, not the fight's round 1. A talent
 *             that ever grants one is read through the same field.
 *   restore   "halfMana" (Evocation) | null
 *   lays      { kind, banes } | null   a Bane laid on the TARGET's next Test
 *             of that kind (06 §6's Pummel). `rules/banes.mjs` is the law and
 *             `effects/banes.mjs` is the write.
 *   aura      `rules/auras.mjs#aura(...)` | absent   what stands on every ALLY
 *             in reach (D-755): 02 §7's Aura of Resolve. The sync stamps it on
 *             the feature item whole (`auraStamp`), a talent may widen it
 *             (`auraReach`, Wide Aura), and `effects/auras.mjs` lays it. With
 *             `lays`, the only fields here that touch another creature's sheet.
 *   picks     how many the menu takes in ONE use (02 §7's Totem Mastery,
 *             D-710). 1 everywhere the field is absent, which is everywhere
 *             but the feature Totem Mastery patches.
 *   modifies  `{feature, ...patch}` in `talent-effects.mjs`' vocabulary: a
 *             feature of the SAME class, restamped while this feature is held
 *             (D-710). A class feature may change another class feature -
 *             Totem Mastery is the first, and a talent has been able to do
 *             this since D-642. The chip is this feature's name.
 *   note      a short mechanical note the card prints under the effect
 *   tick      { kind, amount, rounds } | absent   healing or damage the card's
 *             Apply lays on each target, landing at the start of its turns
 *             (D-770's carrier, `rules/ticks.mjs#featureTick`; D-771): 02's
 *             Regrowth *On the target's next turn, they restore Health equal to
 *             your tier*. `amount` is read at the Use, `rounds` is a number
 *             once stamped (Improved Regrowth's `tickRounds` adds to it)
 *   inflicts  [{ condition, value, until }] | absent   conditions the card
 *             offers as a button per target (D-771): 02's Hurricane *are
 *             Slowed until the start of your next turn* - `casterTurnStart` -
 *             and 04's Typhoon's Prone at rank 2
 *
 * Amount expressions: "tier", "level", "2*tier", "2*tier+sl", "level+sl",
 * or a number.
 */

// 06 §6's Reaction table owns Pummel's numbers; this table names the feature.
import { PUMMEL_BANES, PUMMEL_KIND } from "./reactions.mjs";
// What stands on somebody else (D-755): one descriptor for a feature's aura and
// a talent's, and `rules/auras.mjs` owns it.
import { aura } from "./auras.mjs";
// A Mana price in a Shapeshift form is Ferocity (07, D-769): ONE reading, the
// spell's and the feature's.
import { manaPrice } from "./casting.mjs";
// ONE reader for an amount expression (the D-770 review, item B): a feature's,
// a talent's, a rider's and a tick's.
import { evaluateExpression } from "./expressions.mjs";
// 05 §3's Standard Test at a tier (the B8a pass: 02's War Stomp's Resist DC).
import { standardDC } from "./modifiers.mjs";
// The Chromatic Champion's numbers (02 §7; stage 2B): one home for each, read by these
// rows and by the doors alike.
import { BREATH, CHROMATIC_BREATH, DRACONIC_LEAP, DREAD_PRESENCE, GREAT_BREATH, WING_BUFFET } from "./chromatic-features.mjs";

// The descriptor vocabulary, shared with `rules/talent-effects.mjs` (D-642).
export const passive = (extra = {}) => ({ kind: "passive", action: null, cost: null, casting: false, uses: null, heal: null, damage: null, resist: null, ...extra });
export const action = (extra = {}) => ({ kind: "action", action: "action", cost: null, casting: false, uses: null, heal: null, damage: null, resist: null, ...extra });
export const cost = (pool, amount) => ({ pool, amount });
/**
 * **A PRICE PAID ON THE TEST'S SUCCESS** (the B8a2 pass; 02's *make a Casting Test. On
 * success, spend 8 Mana*): the price, marked `on: "success"`, which the Use judges before
 * anything is spent and takes off only once its Casting Test has succeeded
 * (`paysOnSuccess`). A failed Test pays nothing.
 */
export const onSuccess = price => ({ ...price, on: "success" });
export const once = per => ({ max: 1, per });
/**
 * A patch laid on another feature's stamp. `rules/talent-effects.mjs` has
 * built talent patches with this shape since D-642 and kept the constructor
 * private; a CLASS FEATURE may lay one now too (D-710), so the one definition
 * lives here - the file both readers already import - rather than in two.
 */
export const mod = (feature, patch = {}) => ({ feature, ...patch });
/** A Bane laid on the target's next Test of one kind (06 §6, `rules/banes.mjs`). */
export const lays = (kind, banes) => ({ kind, banes });

export const CLASS_FEATURES = Object.freeze({
  warrior: {
    "Second Wind": action({ action: "half", cost: cost("rage", 6), heal: "tier" }),
    // 06 §6: *that creature takes two Banes on the next Casting Test it
    // makes.* The count and the kind are the Reaction table's, never typed
    // here, and `effects/banes.mjs` is what writes them onto the caster.
    "Pummel": action({ action: "reaction", lays: lays(PUMMEL_KIND, PUMMEL_BANES), note: "AZEROTH.Feature.Note.Pummel" }),
    "Shieldbearer": passive(),
    // Passive with a use (D-623): the maneuver strikes it when the first
    // Overbear or Sunder of the encounter goes free.
    "Charge": passive({ uses: once("encounter"), note: "AZEROTH.Feature.Note.Charge" }),
    "Extra Attack": passive({ extraAttack: true }),
    "Sunder Armor": passive(),
    "Unbroken": action({ action: "action", uses: once("encounter") }),
    "War Cry": action({ action: "half", uses: once("short"), area: "Each ally within 30 ft", choice: "warCry" }),
    "Deathwish": passive(),
    "Unkillable": passive()
  },
  paladin: {
    // *Once per Long Rest, as a Half-Action, spend 2 Mana …* (D-752; the lead's
    // play-test, 2026-09-25). It had no limit at all. Open Hand's patch gives
    // it a second use, and the uses census below holds every rest-bound limit
    // 02 writes to the descriptor that counts it.
    "Lay on Hands": action({ action: "half", cost: cost("mana", 2), heal: "level", uses: once("long") }),
    "Consecrated": action({ action: null, uses: once("short") }),
    "Extra Attack": passive({ extraAttack: true }),
    // 02 §7: *Allies within 20 feet of you gain a Boon on Resilience (Spirit)
    // Tests.* It was `passive()` and a reminder on the PALADIN's own dialog, on
    // Body and Reflex as well as Spirit, and it reached no ally at all (the
    // lead's play-test, 2026-09-25). It is an aura now (D-755): stamped on the
    // feature item, laid on every ally in reach by `effects/auras.mjs`, and
    // read by the ally's dialog as a ticked line. Wide Aura widens it.
    "Aura of Resolve": passive({ aura: aura({ feet: 20, boon: { kind: "resilience", resilience: "spirit", boons: 1 } }) }),
    "Shield of the Righteous": action({ action: "reaction", cost: cost("zeal", 6), choice: "schools" }),
    // *an attack against any number of enemies within 10 feet of you*: one press
    // per creature (the architect's review of D-773).
    "Divine Storm": action({ action: "action", cost: cost("zeal", 10), attack: true, attacks: "each", area: "A 10 ft radius centered on you" }),
    "Charger's Blessing": passive(),
    "Avenging Wrath": action({ action: "half", cost: cost("mana", 12) }),
    "Beacon of Hope": passive()
  },
  ranger: {
    "Quarry": passive(),
    // A menu of 14's Beasts (D-635); the bond is recorded as the one known.
    "Companion": action({ action: null, choice: "beasts" }),
    // *The first creature to enter is **Entangled** until it spends an action and
    // passes a Reflex Resilience Test against your Spell DC* (02 §7). The Entangled
    // was never built (found beside Entrapment, D-773): a button per target on the
    // card, and the Reflex Test is the card's own escape (`SNARE`).
    "Snare": action({
      action: "half", resist: "reflex", area: "A 15 ft radius on the ground",
      inflicts: [{ condition: "entangled", value: null, until: null }]
    }),
    "Extra Attack": passive({ extraAttack: true }),
    "Aimed Shot": action({ action: null, cost: cost("focus", 3) }),
    "Disengage": action({ action: "reaction", uses: once("encounter") }),
    "Killing Ground": action({ action: "half", cost: cost("focus", 3), area: "A 30 ft radius on the ground" }),
    "Kill Shot": action({ action: "action", cost: { pool: "quarry", amount: 0, all: true }, attack: true }),
    "Wild Bond": passive({ heal: "tier", note: "AZEROTH.Feature.Note.WildBond" })
  },
  rogue: {
    "Opening": passive(),
    // **A PASSIVE ON THE ATTACK, NOT A USE** (02 §7, the lead's item 11).
    // *Spend all your Combo Points and add that many to the damage of one
    // attack.* As an `action` it drew a Use button that spent the pool and
    // posted a card while the attack it belongs to was a separate roll, so the
    // points went and the damage never moved. It is a CHECKBOX on the attack's
    // own roll dialog now, paid before the die beside the called shot's
    // Momentum - and the three talents that `mod("Finisher")` patch a passive,
    // exactly as Totem Mastery patches Totem (D-710).
    "Finisher": passive({ note: "AZEROTH.Feature.Note.Finisher" }),
    // 06 §6: *that creature takes two Banes on the next Casting Test it
    // makes.* The count and the kind are the Reaction table's, never typed
    // here, and `effects/banes.mjs` is what writes them onto the caster.
    "Pummel": action({ action: "reaction", lays: lays(PUMMEL_KIND, PUMMEL_BANES), note: "AZEROTH.Feature.Note.Pummel" }),
    // 02 §7 (D-712): *on your first turn of a fight you may Move once without
    // spending a Half-Action.* The FIRST TURN is the combatant's, not the
    // fight's round 1, and `AzerothCombatant#_freeMoves` is what decides it;
    // this only says the Rogue holds one.
    "Sprint": passive({ freeMove: 1, note: "AZEROTH.Feature.Note.Sprint" }),
    "Extra Attack": passive({ extraAttack: true }),
    "Evasion": passive(),
    "Vanish": action({ action: "half", cost: cost("energy", 5), uses: once("encounter") }),
    // The poisons carried (08 SS12), as the menu (D-635).
    "Poisoner": action({ action: null, choice: "poisons" }),
    "Assassinate": passive(),
    "Shadowstep": action({ action: "half", cost: cost("comboPoints", 4) })
  },
  priest: {
    "Mend": action({ action: "half", cost: cost("mana", 2), casting: true, heal: "2*tier+sl" }),
    "Ward": action({ action: "reaction", cost: cost("mana", 2), choice: "schools" }),
    "Dispel": action({ action: "action", cost: cost("mana", 4) }),
    // *As a Full Action, make a Casting Test. On success, spend 6 Mana to restore Health ...*
    // (02 §7): the price is the success's (`onSuccess`; the B8a2 pass), and a failed Test
    // costs nothing. So are Shadow Word: Death's 8, Divine Hymn's 15 and the Warlock's Curse.
    "Mass Mend": action({ action: "full", cost: onSuccess(cost("mana", 6)), casting: true, heal: "tier", area: "Each ally within 20 ft" }),
    "Sustained Faith": passive(),
    // *On success, spend 8 Mana to force a target to make a Spirit Resilience Test against
    // your Spell DC. On a failed save, the target takes your level plus the SL bonus of the
    // Casting Test in Shadow damage* (02 §7): the damage is the failure's (`onFail`; the
    // B8a pass), so the card's Apply lands none of it on a target whose Test passed - it
    // dealt the whole whatever the Test came to.
    // And its 8 Mana is paid on the success (the B8a2 pass): it was paid before the Test.
    "Shadow Word: Death": action({ action: "action", cost: onSuccess(cost("mana", 8)), casting: true, damage: { amount: "level+sl", type: "shadow", onFail: true }, resist: "spirit" }),
    "Resurrection": action({ action: "full", cost: cost("mana", 20), casting: true, dc: 22, uses: once("long") }),
    "Divine Hymn": action({ action: "action", cost: onSuccess(cost("mana", 15)), casting: true, area: "Each ally within 60 ft", choice: "schools" })
  },
  shaman: {
    "Totem": action({ action: "half", cost: cost("mana", 2), area: "A 30 ft radius centered on you", choice: "totems" }),
    "Ancestral Ear": action({ action: null }),
    // *Once between Long Rests, return from Dying at 1 Health without spending a
    // Tether* (02 §7). It was a counter and nothing more: a Use now, refused
    // unless the shaman is Dying (06 §9: at 0 Health), and 04's Undying Spirit
    // patches what it returns them at and whom it brings (D-774).
    "Reincarnation": action({ action: null, uses: once("long") }),
    "Forked Lightning": action({ action: "half", casting: true, damage: { amount: 6, type: "nature" } }),
    // 02 §7, D-710: *as a Half-Action, you may place up to four totems at
    // once, each within 5 feet of you and each paying its Mana*, and the
    // tether widens to sixty feet - which the row has always said and nothing
    // automated. The STANDING limit stays the tier's (D-709), so a level 11
    // shaman places three of the four and a level 16 all four.
    "Totem Mastery": passive({ modifies: mod("Totem", { picks: 4, area: "A 60 ft radius centered on you" }) }),
    // *Up to 6 targets within 30 feet gain an extra Half-Action on their next turn* (02 SS7;
    // the lead, 2026-11-08: *"Fix it now"*): nothing gave the Half-Action. `onUse.bloodlust`
    // is judged before the Mana (`rules/extra-halves.mjs#bloodlustRefusal`) and lays the
    // effect Hasten's Half-Action rides, given at each target's next turn.
    "Bloodlust": action({ action: "full", cost: cost("mana", 8), area: "Each ally within 30 ft", onUse: { bloodlust: { feet: 30, max: 6 } } }),
    "Elemental Bond": action({ action: "action", cost: cost("mana", 12), choice: "elementals" }),
    // *Everyone in this area must make a Reflex Resilience Test against your Spell DC. On
    // failure, they are knocked **Prone*** (02 §7; the lead: *"Land automatically"*, the
    // Legacy branches' B6 fix): the Prone was never on the card. A failure on it lays the
    // Prone at once (`onFail`); the dropped weapons and the minute of Difficult ground
    // stay the table's, and its circle names no size, so it measures nobody.
    "Earthquake": action({ action: "full", cost: cost("mana", 15), resist: "reflex", inflicts: [{ condition: "prone", value: null, until: null, onFail: true }] })
  },
  mage: {
    "Evocation": action({ action: "action", uses: once("short"), restore: "halfMana" }),
    "Blink": action({ action: "reaction", cost: cost("mana", 2) }),
    "Counterspell": action({ action: "reaction", cost: cost("mana", 4) }),
    "Overchannel Mastery": passive(),
    "Shape the Weave": passive(),
    // A failure on the card's own Resist lays the Rabbit (D-808, `dice/chat.mjs
    // #rollResists`); *Some targets are immune* names none, so the note leaves that
    // to the GM in words (O-236).
    "Polymorph": action({ action: "action", cost: cost("mana", 8), casting: true, resist: "spirit", note: "AZEROTH.Feature.Note.Polymorph" }),
    "Time Warp": action({ action: "action", cost: cost("mana", 12), casting: true, uses: once("long") }),
    "Arcane Mastery": action({ action: "half", cost: cost("mana", 20) })
  },
  warlock: {
    "Life Tap": action({ action: "half", note: "AZEROTH.Feature.Note.LifeTap" }),
    "Bound Demon": action({ action: "full", cost: cost("mana", 4), choice: "demons" }),
    "Drain": action({ action: "reaction", cost: cost("mana", 4) }),
    // *On success, spend 4 Mana* (02 §7; D-775 paid it on the success by the feature's name
    // alone): the row's own `onSuccess` now, the door every such price shares (the B8a2 pass).
    "Curse": action({ action: "action", cost: onSuccess(cost("mana", 4)), casting: true, resist: "spirit" }),
    "Greater Demon": passive(),
    "Soul Harvest": passive(),
    "Ritual of the Steed": passive(),
    "Metamorphosis": action({ action: "full", cost: cost("mana", 12), choice: "greaterDemons" }),
    "Ritual of Summoning": action({ action: "full", cost: cost("mana", 20), casting: true, dc: 26, choice: "greaterDemons" })
  },
  druid: {
    "Shapeshift": action({ action: "half", choice: "forms" }),
    // *On success, a target within 30 feet you can see restores Health equal to
    // twice your tier. On the target's next turn, they restore Health equal to
    // your tier* (02 §7). The second sentence is a TICK the card's Apply lays
    // (D-771): it was never built, so Regrowth healed once.
    "Regrowth": action({ action: "action", cost: cost("mana", 3), casting: true, heal: "2*tier", tick: { kind: "heal", amount: "tier", rounds: 1 } }),
    // *Two attacks each time you Attack, while in a Shapeshift form* (02 §7).
    // The gate is the shape's KIND (D-769): an Avatar is not a Shapeshift form
    // (D-251), so it does not double a Druid's blow.
    "Extra Attack": passive({ extraAttack: true, extraAttackIn: "shapeshift" }),
    // *... take 6 Nature damage and are Slowed until the start of your next
    // turn* (02 §7). The Slowed was never built (found beside Typhoon, D-771):
    // a button per target on the card, ending as the DRUID's next turn starts.
    "Hurricane": action({
      action: "action", cost: cost("mana", 6), casting: true, damage: { amount: 6, type: "nature" }, area: "A 20 ft radius on the ground",
      inflicts: [{ condition: "slowed", value: null, until: "casterTurnStart" }]
    }),
    "Dreamwalk": passive(),
    // *On success, any number of targets within a 20-foot area are **Entangled** until
    // each spends an action and passes a Reflex Resilience Test against your Spell DC*
    // (02 §7). The Reflex Test is the ESCAPE, not a Resist: the row carried `resist:
    // "reflex"`, so the card offered a Test at the cast that governed nothing, and no
    // Entangled to lay (found beside the Legacy branches' B6 fix). The Entangled is a
    // button per target the caster chose, Hurricane's shape (D-771), carrying its
    // escape on the action at the Spell DC (door 19's record), which the creature's own
    // turn prompts (`AzerothCombat#_escapePrompts`).
    "Entangling Roots": action({
      action: "action", cost: cost("mana", 8), casting: true, area: "A 20 ft radius on the ground",
      inflicts: [{ condition: "entangled", value: null, until: null, escape: { on: "action", resilience: "reflex", dc: "spellDc" } }]
    }),
    "Hibernate": passive({ uses: once("long") }),
    "Avatar of the Wild": action({ action: "full", cost: cost("mana", 15), choice: "avatar" })
  },
  // **THE CHROMATIC CHAMPION** (02 §7, *Features by level*; stage 2B of the plan). Every
  // number is `rules/chromatic-features.mjs`'s, held to the pack's own text by
  // `chromatic-features.test.mjs`. A feature's `onUse` is read by `useFeature` and by
  // the sheet's `featureAims` exactly as a talent's grant's is (`classFeatureOnUse`).
  "chromatic-champion": {
    // *While you wear Mail or Plate, its Encumbering trait costs you no Speed and
    // imposes no Bane on your Stealth Tests*: read by `CharacterData` off the feature
    // held (`chromatic-features.mjs#scalesWaive`), never a Use.
    "Scales": passive({ note: "AZEROTH.Feature.Note.Scales" }),
    // *Your race is the Chromatic Outcast ... you never take a second class*: the guise
    // and the creation-only refusal are stage 1B's (`rules/guise.mjs`,
    // `rules/multiclass.mjs`), so the feature itself does nothing a sheet can press.
    "Chromatic Blood": passive({ note: "AZEROTH.Feature.Note.ChromaticBlood" }),
    // *You pay for maneuvers in Energy rather than Momentum, at the same price*: the
    // pool every universal maneuver, the called shot and a Parry are paid from
    // (`rules/maneuver-pool.mjs`), stamped as `maneuverPool` on the feature item.
    "Draconic Discipline": passive({ maneuverPool: "energy" }),
    // A cone from the Champion's token, aimed before anything is paid, gathering every
    // creature in it (`who`); the school asked where the branches tie and the area
    // where Great Breath gives two (`onUse.breath`).
    "Breath": action({
      action: "half", cost: cost("energy", BREATH.energy), resist: BREATH.resist, who: "creature", area: BREATH.area,
      damage: { amount: BREATH.damage, type: null, half: true }, onUse: { breath: "branch" }
    }),
    // *Once per Short Rest, as a Half-Action, gain Ward 1 against Fire, Frost and Nature
    // for 10 minutes, added to any Ward you already hold*: a laid `final` add on the
    // Champion (`onUse.hardenScales`).
    "Hardened Scales": action({ action: "half", uses: once("short"), onUse: { hardenScales: true } }),
    // *Each creature of your choice within 5 feet of you is pushed 10 feet away, and one
    // that fails a Body Resilience Test against your Spell DC is also knocked Prone*.
    "Wing Buffet": action({
      action: "half", cost: cost("energy", WING_BUFFET.energy), resist: WING_BUFFET.resist,
      inflicts: [{ condition: WING_BUFFET.condition, value: null, until: null, onFail: true }],
      onUse: { push: { feet: WING_BUFFET.push, from: "user" }, within: WING_BUFFET.within }
    }),
    // *Spend 3 Energy and a Half-Action, or your Reaction on another creature's turn, to
    // leap up to 20 feet ... ends Entangled on you, and your next attack before the end
    // of your next turn gains a Boon*: `rungs` gives the Reaction, `offTurn` keeps it to
    // another creature's turn, `step` is the leap through the one step door (a space you
    // can see, picked before anything is paid, then a displacement: no Move, no
    // Opportunity Attack, no Difficult ground - `effects/steps.mjs`), `frees` the
    // Entangled, `nextAttack` the Boon.
    "Draconic Leap": action({
      action: "half", rungs: ["reaction"], cost: cost("energy", DRACONIC_LEAP.energy),
      onUse: {
        step: { feet: DRACONIC_LEAP.feet, sight: "see" }, offTurn: "reaction", frees: [...DRACONIC_LEAP.frees],
        nextAttack: { boons: DRACONIC_LEAP.boons, lasts: "nextTurn" }
      }
    }),
    // *Once per encounter, as a Half-Action, each creature of your choice within 10 feet
    // of you makes a Spirit Resilience Test against your Spell DC. On a failure it is
    // Frightened of you until the end of its next turn*.
    "Dread Presence": action({
      action: "half", uses: once("encounter"), resist: DREAD_PRESENCE.resist,
      inflicts: [{ condition: DREAD_PRESENCE.condition, value: null, until: "endOfNextTurn", onFail: true }],
      onUse: { aims: true, within: DREAD_PRESENCE.within }
    }),
    // *Your Breath may fill a cone 30 feet long or a line 60 feet long, chosen as you
    // breathe*: the cone laid on Breath's stamp (its chip), and the line offered beside
    // it by `chromatic-features.mjs#breathAreas`.
    "Great Breath": passive({ modifies: mod("Breath", { area: GREAT_BREATH.areas[0] }) }),
    // *Ward 1 against your Breath's school, chosen after each Long Rest where a tie
    // leaves it open*: derived on the character (`flightSchool`), and the Use names the
    // school where the branches tie - once a Long Rest, as Blessed Plate's is.
    "Scales of the Flight": action({ action: null, uses: once("long"), choice: "flightSchools" }),
    // *Once per Long Rest, as a Half-Action and for no Energy, breathe in a cone 60 feet
    // long, in a school you choose from the seven in 07-MAGIC ... twice your Breath's
    // damage*.
    "Chromatic Breath": action({
      action: "half", uses: once("long"), resist: CHROMATIC_BREATH.resist, who: "creature", area: CHROMATIC_BREATH.area,
      damage: { amount: CHROMATIC_BREATH.damage, type: null, half: true }, onUse: { breath: "any" }
    })
  }
});

/**
 * **WHAT A CLASS FEATURE'S USE DOES BEYOND ITS STAMP** (stage 2B): the row's own
 * `onUse`, in `talent-effects.mjs`' vocabulary, read off this table by the feature's
 * class and name - never stamped, so no schema holds it twice. `useFeature` and the
 * sheet's `featureAims` read it where no talent granted the feature, as they read a
 * granting talent's row. Null for every feature that carries none.
 *
 * @param {string} className  the feature item's `className`, as 02 names the class
 * @param {string} name       the feature's name
 * @returns {object|null}
 */
export function classFeatureOnUse(className = "", name = "") {
  const key = String(className ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const o = CLASS_FEATURES[key]?.[name]?.onUse ?? null;
  return o && typeof o === "object" ? o : null;
}

/**
 * The eleven racial traits (02 SS5), reviewed one by one as the class
 * features were (D-612, D-620). Keyed by the race's identifier; the test
 * holds each name against the pack. A trait is free and always on: a
 * passive where it changes nothing the sheet can do, an action where the
 * book spends one. Blood Fury's Momentum is `gain`, paid into the primary
 * class's pool on use - or, where the character holds no Momentum pool at
 * all, the fury `rules/blood-fury.mjs` lays instead (the lead, D-798);
 * Regeneration and Underfoot stay text, as Bleeding's tick does.
 */
export const RACE_TRAITS = Object.freeze({
  // Adaptable names one skill at creation, always in-career (02 SS5): the
  // creator writes it, and Use re-picks it through the chooser (D-636).
  human: { name: "Adaptable", ...action({ action: null, choice: "skills" }) },
  dwarf: { name: "Stonefast", ...passive() },
  "night-elf": { name: "Shadowmeld", ...action({ action: "half" }) },
  gnome: { name: "Underfoot", ...passive() },
  orc: { name: "Blood Fury", ...action({ action: "half", uses: once("encounter"), gain: { pool: "momentum", amount: 2 } }) },
  tauren: { name: "Endurance", ...passive() },
  troll: { name: "Regeneration", ...passive() },
  // No action of its own: the once-a-day automatic success is struck as a use.
  forsaken: { name: "Will of the Forsaken", ...action({ action: null, uses: once("long") }) },
  "blood-elf": { name: "Arcane Torrent", ...action({ action: "half", uses: once("encounter"), area: "A 10 ft radius centered on you" }) },
  goblin: { name: "Best Deal Anywhere", ...passive() },
  ogre: { name: "Great Frame", ...passive() },
  // *You have Ward equal to your tier against Fire, Frost, Arcane and Nature* (02 §5's
  // twelfth people): derived on the character (`chromatic-features.mjs#flightbloodWard`),
  // never a Use. Found beside stage 2B's Hardened Scales, which adds to it.
  "chromatic-outcast": { name: "Flightblood", ...passive() }
});

/** The traits that could bear on a roll (D-613), by race identifier. */
export const RACE_REMINDERS = Object.freeze({
  dwarf: { kinds: ["resilience"], text: "AZEROTH.Feature.Reminder.Stonefast", boons: 1 },
  tauren: { kinds: ["resilience"], text: "AZEROTH.Feature.Reminder.Endurance", boons: 1 },
  forsaken: { kinds: ["resilience"], text: "AZEROTH.Feature.Reminder.WillOfTheForsaken" }
});

/**
 * The trait a race grants, shaped as a feature the sync can stamp (D-620):
 * the pack's name and text with the reviewed descriptor. Null with no trait.
 * A race the table does not know still grants its trait, as a passive.
 *
 * @param {{identifier?: string, trait?: {name?: string, description?: string}}} raceSystem
 */
export function raceTraitFor(raceSystem) {
  const name = raceSystem?.trait?.name;
  if (!name) return null;
  const known = RACE_TRAITS[raceSystem?.identifier] ?? null;
  const { name: _tableName, ...descriptor } = known ?? { name, ...passive() };
  return {
    name,
    level: 1,
    description: raceSystem.trait?.description ?? "",
    ...descriptor,
    reminder: RACE_REMINDERS[raceSystem?.identifier] ?? null
  };
}

/**
 * What a feature reminds the roller of at the dialog (D-613): the features
 * that could bear on a roll, by the kind of Test, with the Boon or Bane the
 * book names where it names one. D2 §12 stands - nothing here is applied
 * for the player; a reminder with a number is an unchecked line, one
 * without is a note. Reviewed against the same sixty-three.
 *
 *   kinds   "attack" | "casting" | "skill" | "resilience", or "any"
 *   skills  the skill keys a `skill` reminder bears on, where it names any (02's Scales)
 *   text    an i18n key
 *   boons / banes   the line's count when ticked, or none
 */
export const FEATURE_REMINDERS = Object.freeze({
  warrior: {
    "Charge": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.Charge" },
    "Extra Attack": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.ExtraAttack" },
    "Deathwish": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.Deathwish" }
  },
  paladin: {
    "Consecrated": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.Consecrated" },
    "Extra Attack": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.ExtraAttack" },
    // Aura of Resolve has NO reminder (D-755): it is the ALLIES' Boon, laid on
    // them by the aura door, and the Paladin's own dialog carried it on every
    // Resilience Test while no ally's ever did.
    "Avenging Wrath": { kinds: ["any"], text: "AZEROTH.Feature.Reminder.AvengingWrath", boons: 1 }
  },
  ranger: {
    "Quarry": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.Quarry" },
    "Extra Attack": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.ExtraAttack" },
    "Aimed Shot": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.AimedShot" },
    "Kill Shot": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.KillShot" },
    "Wild Bond": { kinds: ["resilience"], text: "AZEROTH.Feature.Reminder.WildBond" }
  },
  rogue: {
    "Opening": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.Opening", boons: 1 },
    "Finisher": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.Finisher" },
    "Extra Attack": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.ExtraAttack" },
    "Evasion": { kinds: ["resilience"], text: "AZEROTH.Feature.Reminder.Evasion" },
    "Poisoner": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.Poisoner" },
    "Assassinate": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.Assassinate" }
  },
  priest: {
    "Sustained Faith": { kinds: ["casting"], text: "AZEROTH.Feature.Reminder.SustainedFaith" }
  },
  shaman: {},
  mage: {
    "Overchannel Mastery": { kinds: ["casting"], text: "AZEROTH.Feature.Reminder.OverchannelMastery" },
    "Shape the Weave": { kinds: ["casting"], text: "AZEROTH.Feature.Reminder.ShapeTheWeave" },
    "Arcane Mastery": { kinds: ["casting"], text: "AZEROTH.Feature.Reminder.ArcaneMastery" }
  },
  warlock: {
    "Metamorphosis": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.Metamorphosis" }
  },
  druid: {
    "Shapeshift": { kinds: ["casting"], text: "AZEROTH.Feature.Reminder.Shapeshift" },
    "Extra Attack": { kinds: ["attack"], text: "AZEROTH.Feature.Reminder.ExtraAttackForm" }
  },
  // Scales bears on a Stealth Test (a skill), and the waiver itself is automatic: a note,
  // drawn on a Stealth Test alone (`skills`; the stage 2 review, should-fix 7).
  "chromatic-champion": {
    "Scales": { kinds: ["skill"], skills: ["stealth"], text: "AZEROTH.Feature.Reminder.Scales" }
  }
});

/** The reminder for a class's feature, or null. */
export function featureReminder(classIdentifier, name) {
  return FEATURE_REMINDERS[classIdentifier]?.[name] ?? null;
}

/**
 * The reminder lines for a roll of one kind (D-613): the features whose
 * reminder names that kind, as dialog lines - `line` where a Boon or Bane
 * rides on it (unchecked, counted only when ticked), `note` where the
 * feature only bears on the roll. Talents taken are read for the words
 * the book uses - Boon, Bane, attack, Casting Test, Resilience - and offered
 * as notes, never lines: nothing has reviewed them one by one.
 *
 * @param {{name: string, reminder: {kinds: string[], text: string, boons?: number, banes?: number}|null}[]} features
 * @param {{name: string, taken: number, effect: string}[]} talents
 * @param {string} kind
 * @returns {{lines: object[], notes: object[]}}
 */
export function featureReminders(features = [], talents = [], kind = "skill", { skill = null } = {}) {
  const lines = [];
  const notes = [];
  for (const f of features) {
    const r = f.reminder;
    if (!r?.text || !Array.isArray(r.kinds)) continue;
    if (!r.kinds.includes("any") && !r.kinds.includes(kind)) continue;
    // A reminder that names its skills is drawn on a Test of one of them alone (02's Scales).
    if (kind === "skill" && Array.isArray(r.skills) && r.skills.length && !r.skills.includes(skill)) continue;
    const entry = { id: `feature-${slug(f.name)}`, name: f.name, label: r.text, boons: r.boons ?? 0, banes: r.banes ?? 0, checked: false };
    if (entry.boons || entry.banes) lines.push(entry);
    else notes.push(entry);
  }
  const WORDS = {
    attack: /\battack|damage rating|weapon/i,
    casting: /casting test|\bspell|\bmana\b|overchannel|sustain/i,
    resilience: /resilience/i,
    skill: /\bskill|\btest\b/i
  };
  for (const t of talents) {
    if (!(Number(t.taken) > 0)) continue;
    const text = String(t.effect ?? "").replace(/<[^>]+>/g, " ");
    if (!/\bboon|\bbane/i.test(text)) continue;
    const named = Object.entries(WORDS).filter(([, re]) => re.test(text)).map(([k]) => k);
    if (named.length && !named.includes(kind)) continue;
    notes.push({ id: `talent-${slug(t.name)}`, name: t.name, label: null, text: text.replace(/\s+/g, " ").trim(), boons: 0, banes: 0, checked: false });
  }
  return { lines, notes };
}

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** The descriptor for a class's feature, or null where the table has none. */
export function featureDescriptor(classIdentifier, name) {
  return CLASS_FEATURES[classIdentifier]?.[name] ?? null;
}

/**
 * The features a class grants at a level, each merged with its descriptor,
 * in level order. A feature with no descriptor is still granted, as a
 * passive: the book's text is on it and the sheet can at least list it.
 *
 * @param {{identifier: string, features: {level: number, name: string, description: string}[]}} classSystem
 * @param {number} level  The level the class functions at.
 */
export function featuresFor(classSystem, level) {
  const l = Math.trunc(Number(level)) || 1;
  const features = Array.isArray(classSystem?.features) ? classSystem.features : [];
  return features
    .filter(f => (f.level ?? 1) <= l)
    .sort((a, b) => (a.level ?? 1) - (b.level ?? 1))
    .map(f => ({
      name: f.name,
      level: f.level ?? 1,
      description: f.description ?? "",
      ...(featureDescriptor(classSystem?.identifier, f.name) ?? passive()),
      reminder: featureReminder(classSystem?.identifier, f.name)
    }));
}

/**
 * The patches the features a class has ALREADY GRANTED lay on one of its own
 * features (D-710), in the same shape `talent-effects.mjs#patchFeature`
 * consumes - so the two sources merge with no second reader.
 *
 * `features` is what `featuresFor` returned, which is level-filtered: a
 * feature the level has not reached is not in the list and patches nothing,
 * and a level that falls takes the patch back off on the next sync. A feature
 * never patches itself.
 *
 * @param {Array<{name: string, modifies?: object|object[]}>} features
 * @param {string} featureName
 * @returns {Array<{source: {name: string}, patch: object, rank: number}>}
 */
export function featurePatchesFor(features = [], featureName) {
  const out = [];
  for (const f of features) {
    if (!f?.modifies || f.name === featureName) continue;
    const rows = Array.isArray(f.modifies) ? f.modifies : [f.modifies];
    for (const patch of rows) {
      if (patch?.feature === featureName) out.push({ source: { name: f.name }, patch, rank: 1 });
    }
  }
  return out;
}

/**
 * An amount expression, evaluated. "tier", "level", "2*tier", "2*tier+sl",
 * "level+sl", or a number; and, for a talent's rank-scaled numbers (D-642),
 * "rank", "3*rank", "tier*rank", "2*tier+rank". A term may open on a minus
 * ("-2*rank", a cost reduced), and the whole is never negative.
 *
 * **A TERM MAY BE A BARE NUMBER** (D-768): "2*tier+sl+3" is Mend at rank 3 of
 * Serendipity once `bindRank` has put the rank in. A sum of a variable and a
 * constant read `null` before, which is why a patch could only ever carry the
 * word `rank` and never the number it stood for.
 *
 * **A THIN WRAPPER OVER `rules/expressions.mjs#evaluateExpression`** (the D-770
 * review, item B): one grammar for every amount in the system, so a feature's
 * heal and a rider's Bleeding cannot be read two ways. What stays this
 * function's own is its scope: `tier`, `level` and `rank` default to 1, a
 * failed Test's negative Success Level is floored at 0 (*never lets a failed
 * Test's negative SL subtract*), a number comes back as it is, and an empty
 * expression is 0, as the old reader's sum of no terms was. The grammar is
 * WIDER than the old reader's - a product of any two terms, a division,
 * `floor` and `ceil` - and `amounts.test.mjs` runs every amount string in the
 * tables and the packs through both and holds them to the same number.
 */
export function evaluateAmount(expr, { tier = 1, level = 1, sl = 0, rank = 1, weapon = 0, str = 0, dex = 0, con = 0, int = 0, wis = 0, cha = 0, prof = 0 } = {}) {
  if (expr === null || expr === undefined) return null;
  if (typeof expr === "number") return expr;
  if (!String(expr).trim()) return 0;
  return evaluateExpression(expr, {
    tier: Number(tier) || 0,
    level: Number(level) || 0,
    sl: Math.max(0, Number(sl) || 0),
    rank: Number(rank) || 0,
    // The striker's own Damage Rating (04's Wrath of the Light, D-772): 0 where
    // the door hands in none, as every name the caller did not give reads.
    weapon: Math.max(0, Number(weapon) || 0),
    // **THE ABILITY MODIFIERS AND PROFICIENCY** (door 16): the door's own
    // `expressions.mjs#abilityScope`; 0 where it hands in none. A modifier may be
    // negative, and is passed as it is.
    str: Number(str) || 0, dex: Number(dex) || 0, con: Number(con) || 0,
    int: Number(int) || 0, wis: Number(wis) || 0, cha: Number(cha) || 0,
    prof: Number(prof) || 0
  });
}

/**
 * **WHICH DC A USE'S RESIST IS MADE AGAINST** (door 16; the lead on 04's Thunder
 * Clap: *"10 + Str modifier + Proficiency"*): `str` is 10 + the Strength modifier
 * + Proficiency, and ONLY where the feature names it; `spellDc`, or nothing named,
 * is the Spell DC - the character's derived one, or a creature's own (14's
 * `**Spells** (DC n)`), which the door hands in - and null where there is none (the
 * B1 review: a class with no Spell DC took the Strength one in silence, so every
 * Rogue's *against your Spell DC* read as the Warrior's DC until 02's Intelligence
 * line is stamped). A null DC is the table's, as a Resist with no DC always was.
 *
 * **`standard` IS 05 §3's STANDARD TEST AT THE USER'S TIER** (02 §5's War Stomp: *a
 * Reflex Resilience Test at a Standard DC for your tier — 12, 16, 20 or 24*; the B8a
 * pass): `rules/modifiers.mjs#standardDC`, the roll dialog's own fallback, at the tier the
 * door hands in - a DC kind no door read before, so the racial talent had no row.
 *
 * **`con8` IS 8 + THE CONSTITUTION MODIFIER + PROFICIENCY** (02 §5's Tail Sweep; the
 * lead, 2026-11-09: *"Pay 4 from your Momentum or your Power pool (Rage, Energy,
 * Mana...). The DC is 8 + Constitution modifier + proficiency, so it works the same for
 * every class."*). It is not the Spell DC, so a Warrior, who holds none, has a DC too.
 * `con8DC` is the arithmetic.
 */
export const RESIST_DCS = Object.freeze(["spellDc", "str", "standard", "con8"]);

/**
 * **8 + THE CONSTITUTION MODIFIER + PROFICIENCY** (02 §5's Tail Sweep; the lead,
 * 2026-11-09). A modifier may be negative and is passed as it is.
 *
 * @param {{conMod?: number, proficiency?: number}} o
 * @returns {number}
 */
export function con8DC({ conMod = 0, proficiency = 0 } = {}) {
  return 8 + (Math.trunc(Number(conMod)) || 0) + (Math.trunc(Number(proficiency)) || 0);
}

/**
 * The DC a feature's card offers its Resist at.
 *
 * @param {{kind?: "spellDc"|"str"|"standard"|"con8"|null, spellDC?: number|null, strMod?: number, conMod?: number,
 *   proficiency?: number, tier?: number}} o
 * @returns {number|null}
 */
export function resistDcFor({ kind = null, spellDC = null, strMod = 0, conMod = 0, proficiency = 0, tier = 1 } = {}) {
  if (kind === "str") return 10 + (Math.trunc(Number(strMod)) || 0) + (Math.trunc(Number(proficiency)) || 0);
  if (kind === "standard") return standardDC(tier);
  if (kind === "con8") return con8DC({ conMod, proficiency });
  const spell = Math.trunc(Number(spellDC));
  return spellDC !== null && spellDC !== undefined && Number.isFinite(spell) ? spell : null;
}

/**
 * **YOUR DAMAGE RATING, AS A FEATURE READS IT** (04's Wrath of the Light: *Holy
 * damage at your Damage Rating*; D-772): the Rating of the weapon in the main
 * hand - what 08 prints, with whatever a coating's derived Rating adds - else 08
 * §7's Unarmed 1. MY READING, for the lead: *your Damage Rating* is the weapon
 * you fight with, and what stands on you (a Seal, a rung) adds as it adds to any
 * feature's damage.
 *
 * @param {Array<{rating?: number|null, offHand?: boolean, launcher?: string|null}>} ready  what is in hand
 * @returns {number}
 */
export function weaponRatingOf(ready = []) {
  const main = (ready ?? []).find(w => w && w.offHand !== true && !w.launcher && Number.isFinite(Number(w.rating)) && w.rating !== null);
  return main ? Math.max(0, Math.trunc(Number(main.rating))) : UNARMED_RATING;
}

/** 08 §7's Unarmed: a Rating of 1. */
export const UNARMED_RATING = 1;

/**
 * **THE WEAPON IN THE MAIN HAND**, out of what `AzerothActor#readyWeapons`
 * answers: the first held in neither the off hand nor as a launcher, or null
 * (D-772). `weaponRatingOf` reads the same hand.
 *
 * @param {Array<{id?: string, system?: object}>} ready
 */
export function mainHandOf(ready = []) {
  return (ready ?? []).find(w => w?.id && w.system?.offHand !== true && !w.system?.launcher) ?? null;
}

/**
 * **02 §7's CONSECRATED** (*You may enchant your weapon with **Blessed** at
 * Lesser grade once per Short Rest. This lasts until your next use of this
 * feature*; D-772): the feature's name, the weapon flag the Use writes, and
 * the talent that raises the grade - 04's Sanctified Weapon, *Your
 * **Consecrated** weapon counts as **Blessed** at Greater grade, converting its
 * damage to Holy*. The trait is DERIVED on the weapon while the flag stands
 * (`WeaponData#prepareDerivedData`), as a coating's is (D-668), so the stored
 * traits never change.
 */
export const CONSECRATED = Object.freeze({ feature: "Consecrated", trait: "Blessed" });

/**
 * **02's SNARE, AND ITS ESCAPE** (D-773): *The first creature to enter is
 * **Entangled** until it spends an action and passes a Reflex Resilience Test
 * against your Spell DC*. Which creature is caught is the table's from the card
 * (the trap's own trigger is not detected); the card offers its Entangled, and
 * its escape - the action and the Reflex Test, a pass ending the Entangled - is
 * the card's own Test button, where 04's Entrapment deals its 5 as it pulls clear.
 */
export const SNARE = Object.freeze({ feature: "Snare", resilience: "reflex", condition: "entangled", action: "action" });

/**
 * The effect flag a Snare's own Entangled carries (the architect's review of
 * D-773): `{source}`, the Ranger whose Snare caught the creature. The escape ends
 * THAT effect and no other - Entangling Roots' Entangled is not the Snare's.
 */
export const SNARE_FLAG = "snare";

/**
 * Whether this Ranger's Snare holds the creature: an ACTIVE effect carrying the
 * Snare's flag with this maker's hand.
 *
 * @param {Array<object>} flagsList  each active effect's `flags["azeroth-rpg"]`
 * @param {string|null} makerUuid
 */
export function snareHolds(flagsList = [], makerUuid = null) {
  if (!makerUuid) return false;
  return (flagsList ?? []).some(f => f?.[SNARE_FLAG]?.source === makerUuid);
}

/**
 * **HOW MANY ATTACKS A FEATURE CARD'S ATTACK BUTTON MAKES** (the architect's
 * review of D-773). The Use paid the feature's action, so a press costs no budget
 * (`data-budget="none"`) - and a card that counted nothing let a Kill Shot, a
 * Barrage, a Divine Storm or a Whirlwind be pressed without end.
 *
 * - Barrage and Chimaera Shot (`targets`, `class-talents.mjs#grantLimitsFor`):
 *   one for each creature the Use named, else their limit - four, or six;
 * - `attacks: "each"` (02's Divine Storm, 04's Whirlwind): one per creature the
 *   Use named, else per enemy the door measured, and at least one;
 * - an amount (04's Rapid Fire, `4*rank`), at the rank;
 * - one, everywhere else (Kill Shot).
 *
 * @param {{attacks?: string|null, named?: number, targets?: number|null, measured?: number|null, rank?: number}} o
 * @returns {number}
 */
export function cardAttackAllowance({ attacks = null, named = 0, targets = null, measured = null, rank = 1 } = {}) {
  const n = Math.max(0, Math.trunc(Number(named)) || 0);
  if (targets !== null && targets !== undefined && Number.isFinite(Number(targets))) {
    const limit = Math.max(1, Math.trunc(Number(targets)));
    return n > 0 ? Math.min(n, limit) : limit;
  }
  if (attacks === "each") return n > 0 ? n : Math.max(1, Math.trunc(Number(measured)) || 0);
  if (attacks !== null && attacks !== undefined && String(attacks).trim()) {
    return Math.max(1, Math.trunc(Number(evaluateAmount(String(attacks), { rank }))) || 1);
  }
  return 1;
}

/** A press past a card's allowance, refused in words (the architect's review of D-773). */
export const CARD_ATTACKS_SPENT = "AZEROTH.Feature.AttacksSpent";

/**
 * Whether one more press of a feature card's Attack is refused: the presses the
 * card records against its allowance. A card posted before the allowance was
 * recorded is allowed one (MY READING).
 *
 * @param {{made?: number, allowed?: number|null}} o
 * @returns {string|null}  a lang key, or null where the press may be made
 */
export function cardAttackRefusal({ made = 0, allowed = null } = {}) {
  const cap = Math.max(1, Math.trunc(Number(allowed)) || 1);
  return (Math.max(0, Math.trunc(Number(made)) || 0)) >= cap ? CARD_ATTACKS_SPENT : null;
}

/**
 * Why a Snare's escape is refused, judged before anything is spent (D-768's
 * order): the creature is not held by THIS Snare (`snareHolds`, the architect's
 * review of D-773) - Entangling Roots' Entangled is not the Snare's to end.
 *
 * @param {{entangled?: boolean}} o  `entangled`: this Snare holds the creature
 * @returns {string|null}  an i18n key, or null where the escape may be made
 */
export function snareEscapeRefusal({ entangled = false } = {}) {
  return entangled === true ? null : "AZEROTH.Snare.NotCaught";
}

/** The weapon flag a Consecrated Use writes, and the next Use moves. */
export const CONSECRATED_FLAG = "consecrated";

/**
 * The trait a Consecrated weapon carries: `Blessed (Lesser)`, or
 * `Blessed (Greater)` while the holder has Sanctified Weapon.
 *
 * @param {{sanctified?: number}} [o]  Sanctified Weapon's ranks
 */
export function consecratedTrait({ sanctified = 0 } = {}) {
  return `${CONSECRATED.trait} (${(Number(sanctified) || 0) > 0 ? "Greater" : "Lesser"})`;
}

/**
 * **AN AMOUNT EXPRESSION WITH A TALENT'S RANK PUT IN** (D-768), for the stamp a
 * patch lays on a CLASS FEATURE.
 *
 * A class feature's item carries no rank of its own - its flag names the class,
 * never a talent - so a patch that copied `"3*rank"` onto Snare was evaluated at
 * Use with the fallback rank of 1: Explosive Trap dealt 3 at every rank, and
 * Serendipity, Improved Regrowth and Dreamstate never moved past their first.
 * The sync knows the PATCHING talent's rank, so the rank is bound in there and
 * the stamp stores the number.
 *
 * **ONLY THE RANK IS BOUND.** `tier`, `level` and `sl` are what the Use reads
 * when it happens - a Success Level exists only after the Test, and the tier a
 * heal is worked at is the one the character holds at the moment of healing -
 * so `"2*tier+sl"` with Serendipity's `"rank"` at rank 3 becomes
 * `"2*tier+sl+3"`, and `"tier*rank"` at rank 2 becomes `"2*tier"`.
 *
 * An expression with no `rank` in it, a number, and a term outside the grammar
 * `evaluateAmount` reads all come back exactly as written, so nothing this
 * cannot read is silently rewritten.
 *
 * @param {string|number|null|undefined} expr
 * @param {number} rank
 * @returns {string|number|null|undefined}  a string wherever a string came in
 */
export function bindRank(expr, rank = 1) {
  if (expr === null || expr === undefined || typeof expr === "number") return expr;
  const s = String(expr).replace(/\s+/g, "");
  if (!/rank/.test(s)) return expr;
  const r = Math.trunc(Number(rank)) || 0;
  let constant = 0;
  const vars = new Map();
  const addVar = (name, k) => vars.set(name, (vars.get(name) ?? 0) + k);
  for (const term of s.replace(/-/g, "+-").split("+").filter(Boolean)) {
    const sign = term.startsWith("-") ? -1 : 1;
    const body = term.replace(/^-/, "");
    let m;
    if ((m = /^(\d+)$/.exec(body))) { constant += sign * Number(m[1]); continue; }
    if ((m = /^(?:(\d+)\*)?rank$/.exec(body))) { constant += sign * (m[1] ? Number(m[1]) : 1) * r; continue; }
    if ((m = /^(tier|level)\*rank$/.exec(body) ?? /^rank\*(tier|level)$/.exec(body))) { addVar(m[1], sign * r); continue; }
    // The ability modifiers and Proficiency (door 16) stay for the Use, as `tier` does.
    if ((m = /^(?:(\d+)\*)?(tier|level|sl|str|dex|con|int|wis|cha|prof)$/.exec(body))) { addVar(m[2], sign * (m[1] ? Number(m[1]) : 1)); continue; }
    return expr;
  }
  const parts = [];
  for (const name of ["tier", "level", "sl", "str", "dex", "con", "int", "wis", "cha", "prof"]) {
    const k = vars.get(name) ?? 0;
    if (!k) continue;
    const term = Math.abs(k) === 1 ? name : `${Math.abs(k)}*${name}`;
    parts.push(k < 0 ? `-${term}` : term);
  }
  if (constant || !parts.length) parts.push(String(constant));
  return parts.join("+").replace(/\+-/g, "-");
}

/**
 * **A FEATURE'S TICK AS THE SYNC STAMPS IT** (D-771): the whole shape every
 * time - `{kind: null, amount: null, rounds: 0}` where the feature lays none -
 * so the stored copy and the stamp compare equal key for key. The rank is
 * bound into both expressions (a talent's grant: Wild Growth's *a number of
 * rounds equal to your rank*); `tier` stays in the amount for the Use, and the
 * turns become a number.
 *
 * @param {{kind?: string, amount?: string|number, rounds?: string|number}|null|undefined} tick
 * @param {number} [rank]
 * @returns {{kind: string|null, amount: string|null, rounds: number}}
 */
export function featureTickStamp(tick, rank = 1) {
  if (!tick?.kind) return { kind: null, amount: null, rounds: 0 };
  const amount = tick.amount === null || tick.amount === undefined || tick.amount === "" ? null : String(bindRank(tick.amount, rank));
  const rounds = typeof tick.rounds === "string" ? evaluateAmount(bindRank(tick.rounds, rank), { rank }) : tick.rounds;
  return { kind: String(tick.kind), amount, rounds: Math.max(0, Math.trunc(Number(rounds)) || 0) };
}

/**
 * **A USE COUNTER'S MAXIMUM, AT THE RANK AND THE TIER IT IS STAMPED AT**
 * (D-642, D-768). `uses.max` may say `"rank"` - Inner Focus, Readiness - or
 * `"tier"`: Survival Instincts and Lava Burst are *a number of times equal to
 * your tier per Short Rest*, and the stamp evaluated the expression with the
 * rank alone, so `tier` read 1 at every level. The sync passes the character's
 * tier, the same one `useFeature` reads for a heal or a damage, and restamps
 * when the level moves it.
 *
 * @param {{max?: string|number}|null} uses
 * @param {{rank?: number, tier?: number, level?: number}} [scope]
 * @returns {number}
 */
export function usesMaxFor(uses, { rank = 1, tier = 1, level = 1 } = {}) {
  const max = uses?.max;
  if (typeof max === "string") return evaluateAmount(max, { rank, tier, level }) ?? 0;
  return max ?? 0;
}

/** The rungs a Use may be taken at (D-255's ladder). */
export const FEATURE_RUNGS = Object.freeze(["half", "action", "full", "reaction"]);

/**
 * **EVERY RUNG A USE MAY SPEND, ITS OWN FIRST** (04's Ethereal Form: *As a
 * Half-Action, spend 6 Mana ... At rank 2 you may use it as a Reaction*; the B6
 * review). A rank's clause that ADDS a rung lays `rungs` beside the grant's own
 * `action`, which stays the first: the Use asks which through the one chooser where
 * more than one can be paid, and a Use of one rung carries none - an empty list,
 * which is every feature but this one.
 *
 * @param {string|null} action  the Use's own rung
 * @param {unknown} rungs       the rungs a clause names
 * @returns {string[]}
 */
export function featureRungs(action, rungs = []) {
  const out = [];
  for (const r of [action, ...(Array.isArray(rungs) ? rungs : [])]) {
    if (FEATURE_RUNGS.includes(r) && !out.includes(r)) out.push(r);
  }
  return out.length > 1 ? out : [];
}

/**
 * **EVERY RUNG A USE MAY BE TAKEN AT, AS ITS CHIP SAYS IT** (04's Ethereal Form: *As a
 * Half-Action ... At rank 2 you may use it as a Reaction*): the sheet's chip named the
 * Use's own rung alone, so a rank 2 Ethereal Form read *Half-Action* beside a Use the
 * door offers as a Reaction too. Composed here, the localised words handed in from the
 * sheet (CLAUDE.md §4): each rung's word, its own first, joined two at a time by `or` -
 * *Half-Action or Reaction*. Null for a Use of one rung, which keeps its own label.
 *
 * @param {string|null} action  the Use's own rung
 * @param {unknown} rungs       the stamped rungs (`FeatureData.rungs`)
 * @param {{label?: (rung: string) => string, or?: (first: string, second: string) => string}} [words]
 * @returns {string|null}
 */
export function rungsChip(action, rungs = [], { label = r => r, or = (first, second) => `${first} or ${second}` } = {}) {
  const all = featureRungs(action, rungs);
  if (all.length < 2) return null;
  return all.map(r => label(r)).reduce((first, second) => or(first, second));
}

/**
 * **THE RUNG A USE IS TAKEN AT** (the B6 review on Ethereal Form): with one rung,
 * the Use's own; with several, out of a fight the Use's own (no turn is spent), and
 * in one the rungs the turn can still pay - the one alone where only one can, and the
 * chooser's answer where more than one can. Null `ask` means nothing to ask.
 *
 * **OFF ITS OWN TURN ONLY THE REACTION IS OPEN** (05: two Half-Actions and a Reaction
 * each turn; found live in B8b). The budget the payment asks keeps a turn's unspent
 * Half-Actions until the creature's next turn resets it, and `initiative.mjs#spend`
 * reads whose turn it is for the off hand alone - so off the shaman's turn both of
 * Ethereal Form's rungs read as payable and the chooser asked, where the Use is the
 * Reaction. `onTurn` is the creature's own turn in its fight.
 *
 * **A RUNG OPEN ONLY OFF ITS OWN TURN** (02's Draconic Leap: *a Half-Action, or your
 * Reaction on another creature's turn*; stage 2B): `offTurnOnly` names it, and on the
 * creature's own turn that rung is closed.
 *
 * @param {{action?: string|null, rungs?: string[], inFight?: boolean, onTurn?: boolean, payable?: (rung: string) => boolean, offTurnOnly?: string|null}} o
 * @returns {{rung: string|null, ask: string[]|null}}
 */
export function rungChoice({ action = null, rungs = [], inFight = false, onTurn = true, payable = () => true, offTurnOnly = null } = {}) {
  const all = Array.isArray(rungs) && rungs.length > 1 ? rungs : [];
  if (!all.length || !inFight) return { rung: action ?? null, ask: null };
  const open = all.filter(r => (onTurn !== false || r === "reaction") && !(onTurn !== false && r === offTurnOnly) && payable(r) === true);
  if (!open.length) return { rung: action ?? null, ask: null };
  if (open.length === 1) return { rung: open[0], ask: null };
  return { rung: null, ask: open };
}

/**
 * **WHAT A FEATURE'S USE COSTS, AND WHETHER THE POOL CAN PAY IT**, judged
 * before anything is spent (D-768; the lead, 2026-10-03: *Keeps the
 * Half-Action*). `useFeature` spent the turn's budget and THEN found the pool
 * short, so a refused feature cost a Half-Action for nothing.
 *
 * The cost is the descriptor's amount less what is worn takes off a named
 * feature (08 §20's *decrease the rage cost of Whirlwind*, D-698), floored at
 * nothing, once per creature the use binds (02 §7's Totem Mastery, D-710);
 * `all` spends the whole pool (Finisher, Kill Shot). A feature with no cost
 * pays nothing and is never refused here.
 *
 * **A MANA PRICE IN A SHAPESHIFT FORM IS PAID IN FEROCITY** (07, *The Druid in
 * a form*; D-769): `casting.mjs#manaPrice` is the one reading, and the caller
 * hands the Ferocity pool as `pool` (`payingPool` says which). 1 Ferocity for
 * every 2 Mana, rounded up, on the price the discounts leave - so an Avatar of
 * the Wild taken from a bear's shape costs 8 Ferocity (the plan's reading).
 *
 * @param {{cost?: {pool?: string|null, amount?: number, all?: boolean}|null, pool?: {value: number}|null,
 *   discount?: number, times?: number, inShapeshiftForm?: boolean}} o
 * @returns {{spent: number, refusal: "NoPool"|"Short"|null}}
 */
export function featurePayment({ cost = null, pool = null, discount = 0, times = 1, inShapeshiftForm = false } = {}) {
  if (!cost?.pool) return { spent: 0, refusal: null };
  if (!pool) return { spent: 0, refusal: "NoPool" };
  const value = Number(pool.value) || 0;
  if (cost.all) return { spent: value, refusal: null };
  const due = Math.max(0, (Number(cost.amount) || 0) - (Number(discount) || 0)) * Math.max(1, Math.trunc(Number(times)) || 1);
  const spent = cost.pool === "mana" ? manaPrice(due, { inShapeshiftForm }).amount : due;
  return { spent, refusal: value < spent ? "Short" : null };
}

/**
 * **WHETHER A USE PAYS ITS PRICE ONLY ON ITS TEST'S SUCCESS** (the B8a2 pass; 02's Mass
 * Mend, Shadow Word: Death, Divine Hymn and Curse: *make a Casting Test. On success, spend
 * N Mana*): a feature that makes a Casting Test and whose price is marked `on: "success"`
 * (`onSuccess`). `useFeature` judges the price with every other before anything is spent,
 * pays nothing at the payment, and takes it off once the Test has succeeded - and a success
 * the pool can no longer pay does nothing at all, said in words. D-775 built this for the
 * Curse alone, by its name; it is the row's word now, and the one door.
 *
 * @param {{casting?: boolean, cost?: {on?: string|null}|null}|null} sys  a feature's stamp or row
 * @returns {boolean}
 */
export function paysOnSuccess(sys) {
  return sys?.casting === true && sys?.cost?.on === "success";
}

/**
 * **WHICH POOL A FEATURE'S COST COMES OUT OF**: its own, or - for a Mana price
 * in a Shapeshift form - Ferocity (07, D-769). `featurePayment` prices it.
 *
 * @param {string|null} costPool  the descriptor's `cost.pool`
 * @param {{inShapeshiftForm?: boolean}} [o]
 * @returns {string|null}
 */
export function payingPool(costPool, { inShapeshiftForm = false } = {}) {
  if (costPool === "mana" && inShapeshiftForm) return manaPrice(1, { inShapeshiftForm }).pool;
  return costPool ?? null;
}

/**
 * **WHAT A FEATURE'S ROW SAYS IT COSTS** (D-769): the pool `payingPool` names
 * and, for a Mana price in a Shapeshift form, 07's Ferocity through
 * `manaPrice`, so the sheet never prints *3 Mana* over a Use that takes 2
 * Ferocity. Undiscounted, as the chip always was; `featurePayment` prices the
 * press itself.
 *
 * @param {{pool?: string, amount?: number, all?: boolean}|null} cost
 * @param {{inShapeshiftForm?: boolean}} [o]
 * @returns {{pool: string, amount: number, all: boolean}|null}
 */
export function featurePrice(cost, { inShapeshiftForm = false } = {}) {
  if (!cost?.pool) return null;
  const amount = Number(cost.amount) || 0;
  return {
    pool: payingPool(cost.pool, { inShapeshiftForm }),
    amount: cost.pool === "mana" ? manaPrice(amount, { inShapeshiftForm }).amount : amount,
    all: cost.all === true
  };
}

/**
 * Does a rest or an encounter's end restore this feature's uses? The
 * hierarchy is the book's: a Long Rest includes a Short Rest, and both end
 * whatever encounter was running.
 */
export { refreshes } from "./uses.mjs";

/**
 * How many Beast forms a Druid knows at a level (02 §7's Forms table,
 * D-619): the highest count on a row the level has reached. Zero with no
 * table, so a class without one can never learn a form.
 *
 * @param {{level: number, known: number}[]} forms
 * @param {number} level
 * @returns {number}
 */
export function formsKnown(forms = [], level = 1) {
  let known = 0;
  for (const row of forms) {
    if ((row?.level ?? 1) <= level && (row?.known ?? 0) > known) known = row.known;
  }
  return known;
}
