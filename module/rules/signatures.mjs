/**
 * What an item's Signature DOES (08 §20). Pure: no Foundry imports
 * (CLAUDE.md §3).
 *
 * 08 §20 prints a Signature as one sentence on the item's entry — *an item
 * carries one Signature, in addition to whatever section 5 allows it* — and
 * `system.signature` carried that sentence and nothing else. 533 of the 2,440
 * equipment documents hold one, 235 of them the same words (*you inflict a
 * Critical Injury on a natural 19 as well as a 20*), and nothing in
 * `module/dice/`, `module/documents/`, `module/effects/` or `rules/grants.mjs`
 * had ever read one: Ashbringer's *against undead, its damage is doubled
 * before Ward is subtracted* reached the sheet as prose and every roll in the
 * game was unaware it existed. **The descriptor beside the prose is what
 * fires; the prose stays exactly what the sheet draws.**
 *
 * The vocabulary is `rules/ability-automation.mjs`' wherever the two say the
 * same thing — a grant is an 08 §6 sentence through `parseGrant`, a refusal is
 * a condition key plus `AZEROTH.refusalExtras`, a summon is `{entry, count,
 * side, from}` verbatim, a condition inflicted carries its `until` — because a
 * creature's ability and an item's Signature post the same card and must not
 * need two readers.
 *
 * Seven kinds, and what each is for:
 *
 * - **standing** — true while the thing is worn. The grants, the refusals and
 *   the widened Critical Injury are read on EVERY kind rather than on this one
 *   alone: a Signature that is pressed may also grant while it is worn,
 *   exactly as a creature's `passive` stands beside its pressable half (D-691).
 * - **onHit** / **whenStruck** — it fires off a blow, in the row shape
 *   `rules/weapon-traits.mjs` already gives 08 §5's Effect traits, so
 *   `firedTraits` fires it by Success Level and the roll card draws it with no
 *   new branch.
 * - **use** — a button, in `useField()`'s vocabulary so `workflows.useGear`'s
 *   order works on it unchanged.
 * - **spell** — it casts. WHICH spell is not named here: `system.spells[]`
 *   already carries the uuid, the name, the DC and the uses, and a second copy
 *   of the name would be a second thing to keep in step.
 * - **tick** — Health or Mana at the start of each of your turns. Fifty
 *   Classic finds say exactly that and nothing read one.
 * - **none** — prose, with a `reason` from `AZEROTH.signatureReasons` where
 *   somebody read it and left it alone. What cannot be read says why (D-691),
 *   so the census prints the remainder by name instead of it vanishing.
 *
 * **A pressed Signature is `use` or `spell` and nothing else.** A standing one
 * gets no control anywhere: a Use button that does nothing when it is pressed
 * is the shape this repository keeps finding (D-681).
 *
 * **A GATE IS A LIST, AND EVERY PART OF IT HOLDS OR NONE OF IT DOES.** Eight
 * of 08 §20's twenty-six write a compound gate — *a Paladin wielding it adds 2
 * to its Damage Rating against undead and demons* is a class gate and a
 * creature-type gate at once — and one `{kind, value}` could only ever carry
 * the first of them. §20 prices *gated* at **1** however many clauses the gate
 * has, so nothing about the budget moves with the shape.
 *
 * **The two hand tables live here**: `BOOK_SIGNATURES`, the twenty-six 08 §20
 * writes by hand, and `CAREER_SIGNATURES`, 03 §5's fifty-three. Both are
 * reviewed one entry at a time against the pack source and both are censused
 * by `signature-tables.test.mjs`, whose ceiling may only fall. A row that
 * states something this system cannot carry is `none(reason)` — never a
 * half-descriptor, and never a number the sentence does not say.
 *
 * ## What the vocabulary gained, and WHAT IS STILL OWED
 *
 * The first pass left fifteen of §20's twenty-six as prose, and three of those
 * were the book's marquee Legendaries — Ashbringer, Quel'Serrar, Gorehowl —
 * because the descriptor had no key for what their sentences say. Eleven keys
 * were added for eleven named entries and nothing else; every one is justified
 * by a real row in `BOOK_SIGNATURES` or by a Classic find, and none is
 * speculative:
 *
 * | Key | Written for |
 * |---|---|
 * | `damageMultiplier` | Ashbringer's *damage is doubled* |
 * | `damageRatingSet` | Quel'Serrar's Damage Rating **is** 8 — a set, not a bonus |
 * | `onKill` | Gorehowl, and the EIGHTH kind beside it |
 * | `use.cost` | Battlegear of Wrath's *spend 4 Rage* |
 * | `use.mitigates` | the same item's *halve the damage* |
 * | `spellDamage` | The Ten Storms — one school's spells, never the hammer |
 * | `healingBonus` | Vestments of Transcendence |
 * | `corruptionReduction` | Nemesis Raiment |
 * | `cancelsBane` | Dragonstalker Armor — a Bane REMOVED is not a Boon |
 * | `whenStruck.condition` | two Classic finds that freeze or slow the attacker |
 * | `onHit.bane` | two Classic finds that lower every attribute of the target |
 *
 * and one unit — `encounter` on a pressed Signature's duration, so
 * `classic-loot.mjs`' two ladders can agree at their top rung.
 *
 * ## WHO READS THIS, AND WHAT IS STILL OWED
 *
 * The whole descriptor was unread for one day and this table said so. **Every
 * door below is open now**, and `rules/signature-doors.test.mjs` is the assertion
 * that each CONSUMER moved rather than that the rule is right — which is the
 * difference D-681 keeps finding, eleven times in nineteen, every one with a
 * passing unit test:
 *
 * | Key | What reads it |
 * |---|---|
 * | `grants` | `grants.mjs#grantsOn`, a FOURTH source; the gate is judged there |
 * | `criticalOn` | `mergeWeaponEffects` into the object 08 §5's traits fill |
 * | `onHit` | the same, as an `EFFECT` row `firedTraits` fires by Success Level |
 * | `damageRating` / `damageRatingSet` / `damageMultiplier` | `attackWithDialog`, with the target in the snapshot; the multiplier is `mitigation.mjs`' own |
 * | `refuses` | `CharacterData#prepareDerivedData`, appended to `conditionImmunities` |
 * | `tick` | `AzerothCombat#_signatureTicks`, at the start of the turn |
 * | `use.uses` | `AzerothActor#resetUses`, a third branch at a path no other pass walks |
 * | `cancelsBane` | `modifiers.mjs`, which never raises the line at all |
 * | `blockBonus` | `reactions.mjs#blockReduction`, through `actions.mjs#blockOffFor` |
 * | `spellDamage` | `workflows.castSpell`, beside the Spellpower |
 * | `spellCost` | `workflows.castSpell`, off the Mana, beside `empowers.cost` |
 * | `healingBonus` | `AzerothActor#applyHealing`, off the GIVER, **and only for a spell** |
 * | `corruptionReduction` | `corruption.mjs#applyExposure`, off the POINT |
 * | `use.*` | `workflows.useSignature`, in `useGear`'s order — and three surfaces |
 * | `use.cost` | that door's pool spend, `class-features.mjs#cost`'s own pair |
 * | `use.mitigates` | a mark the next blow spends, in `AzerothActor#applyDamage` |
 * | `summon` | that door's card, through D-691's own `placeSummon` button |
 * | `whenStruck` | the ATTACKER's card, off the TARGET's items (`actions.mjs#struckBackRows`) |
 * | `onKill` | the attack card's own line, on a hit |
 * | `onHit.momentum` / `onHit.per` | `rollTest`, into `gainOnHit`'s `extra` beside 08 §5's Fast |
 * | `onHit.damageFromCondition` | `signatureEffects` itself, off the target's snapshot |
 * | `onHit.conditionFromDamage` | `rollTest`, after the mitigation, onto the card's Inflict button |
 * | `armorPointsPerTier` | `CharacterData#prepareDerivedData`, onto the Body's Armor Points |
 * | `aura` | `effects/auras.mjs`, as an effect on the ALLY that `applyDamage` reads |
 *
 * **The three surfaces are S3's** — the item sheet, the Overview tab's In-force
 * column and the Combat tab's panel — and every one of them reads `isPressable`
 * and `pressRefusal`, so a control never appears where the door would refuse.
 *
 * **THE ONE THING THAT WAS OWED IS BUILT** (D-693). `onHit.bane` (2 finds) and
 * `onKill.bane` (Gorehowl) both mean *the target takes a Bane on its next
 * Test*, and until 06 §6's Pummel needed the same carrier **nothing in this
 * system could hold a Bane laid on another creature**: `system.testBanes` was a
 * creature's own derived number off its own standing passive, a character had
 * no such field at all, and no condition in A1 means it. `rules/banes.mjs` is
 * the law now and `effects/banes.mjs` the write, `firedSignatureRow` carries
 * `bane` onto the fired row, and `templates/chat/roll-card.hbs` draws a
 * `layBane` button beside the sentence on both.
 */

import { AZEROTH } from "../config.mjs";
import { signatureAugmentAllowed } from "./augments.mjs";
import { parseGrant } from "./grants.mjs";
import { auraStands, cleanAura, emptyAura } from "./auras.mjs";
import { gateHolds as whenHolds } from "./ability-automation.mjs";
import { cost } from "./class-features.mjs";
import { phaseFor } from "./consumables.mjs";
// The four readers `seedSignature` REUSES rather than restates. Each already
// owns one grammar the book writes in more than one place, and a second copy
// here would be a second thing to keep in step with the chapter.
import { usesFromText } from "./uses.mjs";
import { healFromText } from "./healing.mjs";
import { injuryConditions } from "./injuries.mjs";
// THE ONE SENTENCE SPLITTER (D-722). A Signature is read one sentence at a
// time, and `spell-effects.mjs` already owned the regular expression that says
// where a sentence ends; a second copy would be a second thing to keep in step.
// `flatText` comes with it: it keeps a bold run as `**` where `plainText` below
// strips the markup entirely, and `castFromText` and the named Mana discount
// both read that run. Splitting the marked text is what keeps the two halves of
// a sentence — the marked one and the flat one — the same words.
import { flatText, sentences } from "./spell-effects.mjs";

/**
 * The kinds a Signature can take. `none` is the absence — the 196 placeholders
 * and everything 08 §20 states that this system has no equivalent for.
 */
export const SIGNATURE_KINDS_AUTOMATED = Object.freeze([
  "none", "standing", "onHit", "onKill", "whenStruck", "use", "spell", "tick"
]);

/**
 * The units a pressed Signature's duration may be stored in.
 *
 * **`encounter` is the rung the ladder was missing.** `classic-loot.mjs` keeps
 * two ladders off one number — `durationFor` writes the sentence and
 * `durationRungFor` writes the descriptor — and the top rung of the first is
 * *for the rest of the encounter* while the second could only answer
 * `{null, null}`. Two halves of one Signature disagreeing is the exact fault
 * that pair exists to prevent. It holds NO NUMBER by design — an encounter has
 * no length — so a consumer reads the unit and lifts the effect when the fight
 * ends, exactly as a bound creature's encounter effects are lifted (D-643).
 *
 * **Nothing in the record reaches that rung today**: every `Use:` duration in
 * the vendored file is thirty seconds or less. It is the vocabulary being
 * whole rather than a count of items moved, and 08 §20's own *until the end of
 * the encounter* sentences are what will use it.
 */
export const SIGNATURE_DURATION_UNITS = Object.freeze([
  "rounds", "turns", "minutes", "hours", "days", "encounter"
]);

/** A d20 face a Critical Injury may be widened to. 08 §5's Keen is 19 and 18. */
const CRITICAL_MIN = 2;
const CRITICAL_MAX = 20;

/** The descriptor with nothing set. */
export function emptySignature() {
  return {
    kind: "none",
    // WHY THIS IS STILL PROSE. One of `AZEROTH.signatureReasons`, or "" for a
    // Signature nobody has read. Only meaningful at `kind: "none"`.
    reason: "",
    // **THE RUN THIS PART READS** (D-909, D-910). 08 §20 prints a Legendary's
    // Signatures as runs, each with its own name - **Scarlet Reckoning.**,
    // **The Crystal's Light.** - and the prose keeps every run as a paragraph
    // opening on its name in bold. The trunk and each `gated` branch name the
    // run they read, so a card prints that run's words and the census holds a
    // part's numbers against its own run. Empty on an Epic or a Rare, whose one
    // run is the whole prose.
    label: "",
    // 08 §20's gate, as a LIST that must hold all the way through: a class, a
    // race, a faction, a school, the creature struck, the bearer below half
    // Health, a Corruption score, the form they are in, a turn they have not
    // moved in. An EMPTY list is ungated; an entry whose kind cannot be read
    // never holds. Each value may name more than one thing, comma-separated,
    // and that half is an "any of".
    //
    // **IT COVERS THE TRUNK: the sentences that are not in `gated` below.**
    gates: [],
    // **WHAT QUALIFIES THE BUTTON ALONE** (D-722). A Signature carries ONE
    // button, and the sentence that presses may be gated while the sentences
    // beside it are not: *A Shaman may spend a Half-Action to call the
    // elements. Anyone wielding it takes a Boon on Parry.* The press cannot
    // live in a branch — `AzerothActor#resetUses` writes
    // `system.signatureEffect.use.uses.value` by dotted path at every rest, and
    // an array index one level further down is D-671's trap again — so the
    // pressed half stays on the trunk and its gate rides here.
    //
    // **EMPTY MEANS `gates`**, which is what every descriptor written before
    // this key existed says: `pressGates` reads this where it has clauses and
    // the trunk's where it does not, so nothing inverts.
    useGates: [],
    // 08 §6 sentences, read by `rules/grants.mjs#parseGrant` exactly as an
    // affix's are. Standing while the thing is worn and the gate holds.
    grants: [],
    // Condition keys plus `AZEROTH.refusalExtras`.
    refuses: [],
    // The Critical Injury widened (08 §5's Keen, 08 §20's own table). 235
    // Classic finds say *on a natural 19 as well as a 20* and nothing read it.
    criticalOn: null,
    // Ashbringer: *against undead, its damage is doubled before Ward is
    // subtracted.* A MULTIPLIER, applied to the damage before Ward — which is
    // why it cannot be an 08 §6 grant, since every one of those adds.
    damageMultiplier: null,
    // Quel'Serrar: *against dragonkin its Damage Rating IS 8.* A set, not a
    // bonus. `+3 Damage Rating` would be this table doing arithmetic against
    // the entry's own Rating 5 and going stale the day that number moves.
    damageRatingSet: null,
    // The Ten Storms: *adds 1 to the Damage Rating of every Nature spell they
    // cast.* Scoped to ONE SCHOOL'S SPELLS: a flat `+1 Damage Rating` grant on
    // the bearer would raise the hammer in their hand as readily as the spell.
    spellDamage: { school: null, amount: null },
    chosenSpellDamage: { school: null, attribute: null, skill: null, casting: false },
    chosenSpellHealing: false,
    firstParryTest: false,
    weaponKillReward: false,
    scalingHitDamage: false,
    // **WHAT A SCHOOL'S SPELLS COST, LESS** (the lead, 2026-09-14). Asked
    // whether a Signature could say *if a Shaman wields this, reduce Lightning
    // Shield's mana cost by 2*, the lead answered: *spell and/or a school
    // should be possible.* `empowers.cost` below is the NAMED half and has been
    // since D-698; this is the SCHOOL half, and it is `spellDamage`'s exact
    // mirror — one school's spells and never the bearer, because 07's Mana is
    // the spell's own number and a flat grant has nowhere to land. `castSpell`
    // takes this and the named one off together, floored at nothing.
    // `minimum` is the floor the discount stops at (Atiesh, *to a minimum of
    // 1*; D-910), null for none.
    spellCost: { school: null, amount: null, minimum: null },
    // Vestments of Transcendence: *restores 2 additional Health with every
    // spell that restores any.* What the bearer GIVES, where `use.heal` is
    // what the item itself restores.
    healingBonus: null,
    // Nemesis Raiment: *takes 1 less Fel Corruption, to a minimum of 0.* A
    // track of `AZEROTH.corruptionTracks` and the amount taken off it.
    corruptionReduction: { track: null, amount: null },
    // **WHAT HOLDING IT CHARGES** (D-909, D-910): The Black Empire's Price, *at
    // the end of each Long Rest, make a Spirit Resilience Test at DC 20. On a
    // failure, gain 1 Void Corruption.* `corruptionReduction`'s mirror, and a
    // TEST FIRST: the point lands on a failure alone. `at` says when it is
    // offered (`AZEROTH.corruptionGainAt`); a press carries its own on
    // `use.corruptionGain`, offered when it is pressed.
    corruptionGain: emptyCorruptionGain(),
    // Dragonstalker Armor: *takes no Bane on Attack Tests against dragonkin,
    // whatever the range.* A BANE REMOVED IS NOT A BOON — 08 §6's grammar has
    // *A Boon on Attack Tests* and nothing that cancels one, and a Boon
    // standing against two Banes is a different roll. The value names the
    // dialog's own line (`rules/modifiers.mjs`), so `longRange` is 06's
    // second range band and nothing else.
    cancelsBane: null,
    // Drillborer Disk: *while you have not moved this turn, **Block** reduces
    // damage by a further 2.* The ONE item in 08 §20 that modifies a Reaction,
    // and the reason this key exists at all; 06 §6's Block is the thing it is
    // further than, and it did not exist until D-693. `rules/reactions.mjs`
    // owns the four it adds to.
    blockBonus: null,
    // Stormrage Raiment: *a Druid wearing it adds Armor Points equal to their
    // tier in any form they take* (D-696). Armor Points SCALED BY THE BEARER,
    // which no other key in this table is: `grants` writes a fixed sentence and
    // `grantsFor` drops the Armor Point family anyway, because a suit's points
    // are stamped onto its own stored number. The value is the points PER TIER
    // — 1 on the one entry that writes it — and `CharacterData` multiplies by
    // `system.tier`. The gate carries the form; this is only the number.
    armorPointsPerTier: null,
    // The Bulwark of Tyr's Hand: *while you are below half Health, every other
    // member of your party within 15 feet takes 5 less damage from every
    // source* (D-696). **THE ONE SIGNATURE THAT LANDS ON SOMEBODY ELSE.**
    // `rules/auras.mjs` is the law and `effects/auras.mjs` the write; every
    // other key here lands on the bearer, which is why this was
    // `none("noEquivalent")` and why 14's own auras record the same gap
    // (D-691's open item O-97).
    aura: emptyAura(),
    // **ONE NAMED SPELL OR CLASS FEATURE, IMPROVED** (D-698). 08 §20 has
    // `spellDamage`, which is a whole SCHOOL's spells, and nothing that names
    // one thing: a Classic set bonus reading *increases the damage of your
    // Chain Lightning* or *decrease the rage cost of Whirlwind* is the lead's
    // *change to Class Feature or Talent Improvement*, and it is a rule about
    // ONE ability by name. `castSpell` reads it beside the Spellpower and
    // `useFeature` beside the pool cost, so a spell and a feature of the same
    // name need no second key.
    empowers: {
      // 02, 04 or 07's own name for the thing. The vocabulary is
      // `classic-tables.mjs#ABILITY_NAMED`, whose Vitest reads the packs.
      name: "",
      // +N to its Damage Rating, +N to what it restores, N off what it costs.
      damageRating: null,
      heal: null,
      cost: null
    },
    // **WHAT A BOUND CREATURE GAINS** (D-698). Four Ahn'Qiraj set bonuses are
    // *increases your pet's damage*, and D-643's bond is what a pet is here:
    // `rules/bound.mjs#boundSignatureEffects` turns this into the same v14
    // change a talent lays, and `syncBoundFor` diffs it beside them.
    // `creatureType` (D-911): *A DEMON bound to a Warlock holding it* (the Skull
    // of Gul'dan's Master of the Shadow Council) - null is every bound creature.
    bound: { damage: null, creatureType: null },
    // **THE LEGENDARY READERS (D-911)**, each a key one run writes and one door
    // reads. Every one is named for what it does, never for the item.
    //
    // A WARD FLOOR ON THE BEARER (Firelord's Grip, *You have Ward 3 against
    // Fire, unless you already have more*): the higher of the two, read in each
    // model's `afterFinalPhase` once every `final` change has landed, so no
    // token and no aura pass is needed. `schools` empty is every school.
    wardFloor: { ward: null, schools: [] },
    // *A fall deals you no damage* (Thunderfury's Windseeker): the damage door's
    // `falling` blow lands nothing, as 02 §5's Wings Beneath does.
    noFallDamage: false,
    // *A dwarf firing it ignores its Reload* (The Emperor's Thunder): the weapon's
    // own Reload, read at `effects/reload-state.mjs`. Weapon-scoped.
    ignoresReload: false,
    // *Fire damage you deal with it ignores Immune (Fire): a creature immune to
    // Fire takes half of it instead* (The Sorcerer-Thane's Pact): the damage type
    // whose Immune the blow passes at half. Weapon-scoped.
    pastImmune: null,
    // *Gains 1 Sand the first time each round a creature fails a Resilience Test
    // against one of their spells* (Sand of the Bronze): read where the failed
    // Resist's Sand is (`effects/sand.mjs`).
    sandOnFail: null,
    // *Gains 1 more Rage the first time each round an attack reduces their
    // Health* (The Destroyer's Temper): the pool and the amount, at the struck door.
    poolOnHurt: { pool: null, amount: null },
    // WHAT A BLOCK DOES BEYOND THE FOUR (Molten Seam's *gains 2 Rage each time
    // they Block*, Neltharion's Heat's *a creature whose melee attack you Block
    // gains Scorched 2*): read at 06 §6's own Block door.
    onBlock: { pool: { pool: null, amount: null }, condition: { id: null, value: null, until: null }, melee: false },
    // *A spell cast by a Druid carrying it that restores Health at the start of a
    // creature's turn restores 1 more Health each time* (The Dream's Bounty): read
    // at the laid tick's heal, off the caster.
    tickHealBonus: null,
    // A refusal SCOPED TO ITS SOURCE (Dragonslayer's Nerve, *A dragonkin cannot
    // make you Frightened*): `{id, creatureType}` rows, read where a condition is
    // laid and the layer is known.
    refusesFrom: [],
    // *A Boss cannot ignore a Critical Injury a Rogue wearing it inflicts with an
    // attack made while hidden from that Boss* (Kingslayer): 14 §1's first two
    // ignored injuries, refused off the card's own `hiddenAtRoll`.
    bossCannotIgnore: false,
    // *The first time each round you take damage of one of the seven schools,
    // you have Ward N against that school until the end of your next turn,
    // unless you already have more* (Adaptive Scales): the N.
    adaptiveWard: null,
    // *When you reduce a Boss or an Elite to 0 Health, you gain temporary Health
    // equal to twice your tier* (The Tusk Taken): the multiple of the tier, and
    // the weight classes a kill counts on.
    killTemp: { perTier: null, weightClasses: [] },
    // **PHASE B2 (D-912)**, each again one run's mechanic and one door's read.
    //
    // *A breath weapon deals you half its damage, rounded down* (Foror's Lesson):
    // the damage door halves a blow whose source is a breath (`breathSource`).
    breathHalf: false,
    // *A member of the Scarlet Crusade takes a Bane on every Attack Test it makes
    // against you* (Scarlet Reckoning): the attacker's faction and the Banes, read
    // off the TARGET's items at the attack door (`rules/factions.mjs`).
    attackerBane: { faction: null, banes: null },
    // *You need no ammunition to shoot it. A shot made without ammunition has
    // Damage Rating 5 and deals Arcane damage* (Starfire Arrow). Weapon-scoped.
    phantomShot: { rating: null, type: null },
    // *Each creature makes that Test with a Bane* (The Blade Hungers: a Shadow
    // spell, once a round; The Fifth Pylon: a demon, against Banish): the Banes a
    // spell card's Resist takes, by school or by the spell's name, and the kind of
    // creature that takes them.
    resistBane: { school: null, name: "", creatureType: null, banes: null, per: null },
    // *Pays no Mana to cast Banish* (The Fifth Pylon): the spell named, free.
    freeSpell: "",
    // *Casts healing spells with a Range of Touch at a range of 30 feet* (Hand of
    // the Church): the feet a Touch healing spell reaches.
    touchHealingFeet: null,
    // *When a spell of a Priest wearing it restores Health to a creature at 0
    // Health, it also ends one Critical Injury that creature took this encounter*
    // (Second Ordination): read at `applyHealing`, off the giver.
    ordination: false,
    // *The first time each round a Frost spell of yours deals damage, one creature
    // it damaged makes a Body Resilience Test against your Signature DC. On a
    // failure it is Numbed until the end of its next turn* (Breath of the
    // Necropolis): the school, the Test and what a failure lays.
    spellDamageTest: { school: null, resilience: null, onFail: { id: null, value: null, until: null } },
    // *Counts as one size larger for what it carries and for resisting being
    // moved* (The King's Frame): rungs of 05's ladder, for those two alone.
    sizeStep: null,
    // *Has a second Reaction each turn, and spends it only on Blink or
    // Counterspell* (Ten Thousand Years of Practice): the features it may pay for.
    secondReaction: [],
    // What a blow that lands does beyond its damage, in `weapon-traits.mjs`'
    // Effect-trait shape: `sl` null is *on a hit*, `sl: 2` is 08 §5's Standard
    // threshold. `arc` is Thunderfury's jump — null where it does not arc.
    onHit: {
      sl: null,
      damage: { amount: null, type: null },
      condition: { id: null, value: null, until: null },
      // **THE FURTHER CONDITIONS THE SAME BLOW LANDS** (D-698). One blow, more
      // than one condition: *the target is Frightened and Slowed until the end
      // of its next turn* (Dark Edge of Insanity, the lead's own sentence).
      // `condition` above is the first and this is the rest, in the same
      // shape; `signatureEffects` emits one fired row per condition so the
      // card offers each of them, and a descriptor with none of these is
      // exactly what it was before.
      conditions: [],
      // How many Banes the TARGET takes on its next Test. Two Classic finds
      // lower every attribute of what they hit, which is a Bane in this
      // system's vocabulary and not a stat change on somebody else's sheet.
      bane: null,
      sunder: null,
      momentum: null,
      heal: null,
      // WHERE THE HEALING LANDS (D-698). Null is the bearer, which is every
      // life-stealing blade in the record; a number is *one creature within N
      // feet*, which is the Lawbringer Armor's eight-piece bonus and the only
      // thing in the pool that heals somebody else off a blow. The card draws
      // the second as a button rather than paying it, because nothing but the
      // table knows which creature.
      healFeet: null,
      // Mana the BEARER regains off the blow (Fist of Stone's *restores 50
      // mana*). `heal` above is Health; this is its twin, paid the same way.
      mana: null,
      // FEET THE TARGET IS PUSHED (Earthshaker; 08 §5's own Shove). The move
      // itself is the table's — a token is dragged, and D2 §12 keeps that
      // call — but the row FIRES now, where a threshold with nothing behind it
      // never joined the card at all.
      push: null,
      arc: null,
      // HOW OFTEN THE ROW MAY FIRE (D-696), in `AZEROTH.abilityUsesPer`'s own
      // words. Null is every hit, which is what every row before these two was.
      // Two of §20's entries write a limit on a blow — Dal'Rend's *the first
      // time you hit each round* and Sulfuron's *once each turn* — and 08 §5's
      // Fast carries the same shape hard-coded in `rollTest`, which is where
      // this is honoured beside it.
      per: null,
      // Perdition's Blade: *against a **Scorched** creature, this weapon deals
      // additional damage equal to that creature's Scorched value* (D-696).
      // Damage read off the TARGET rather than written here — `per` points of
      // damage for each point of the condition — which is why the sentence
      // needs no gate: a creature that is not Scorched contributes 0 and the
      // row does not fire at all. `signatureEffects` resolves it against
      // `state.target.conditions`, so the arithmetic stays in the pure rule.
      damageFromCondition: { id: null, per: null },
      // Sulfuron Hammer: *the target gains **Scorched** equal to half the
      // damage dealt, rounded down* (D-696). The exact MIRROR of the key above
      // — that one reads a condition to make damage, this one reads the damage
      // to make a condition — and the number is the DIVISOR, so 2 is half.
      // `condition.id` says which condition; `rollTest` fills the value once
      // the mitigation has run, because *the damage dealt* is what arrived.
      conditionFromDamage: null,
      // *An undead creature it hits cannot regain Health until the end of ITS
      // next turn* (Ash of the Risen, D-911): 04's Mortal Strike mark
      // (`effects/no-healing.mjs`), spanned on the creature struck.
      noHealing: false,
      // *... and makes its Test to break free (or to shed it) against your
      // Signature DC* (Unholy Grasp, Soulflayer's Venom; D-911): the condition
      // carries the bearer's Signature DC on its own effect, as 07's escape and
      // A1's Poisoned shed DC already ride (`rules/escapes.mjs`).
      signatureDC: false
    },
    // Gorehowl: *when an attack with it reduces a creature to 0 Health, every
    // enemy within 30 feet that saw it takes a Bane on their next Attack
    // Test.* A kill is not a hit: `onHit` fires off a blow that lands and
    // nothing fired off one that finished.
    onKill: { feet: null, bane: null, condition: { id: null, value: null, until: null } },
    // What a blow that lands ON THE BEARER does back (08 §20's thorns), and
    // what it leaves on whoever landed it.
    whenStruck: {
      damage: { amount: null, type: null },
      condition: { id: null, value: null, until: null }
    },
    // What pressing it does, in `equipment.mjs#useField()`'s vocabulary.
    use: {
      action: null,
      // What the press costs the bearer, in `class-features.mjs#cost`'s shape
      // exactly — a pool of `AZEROTH.poolTypes` and an amount — because
      // Battlegear of Wrath's *spend 4 Rage as a Reaction* is a class
      // feature's cost written on an item.
      cost: { pool: null, amount: null },
      uses: { max: null, value: null, per: null },
      heal: { health: null, mana: null, fatigue: null },
      changes: [],
      statuses: [],
      ends: [],
      duration: { value: null, units: null },
      damage: { amount: null, type: null },
      // What it takes OFF one incoming blow: `halve` is Battlegear's, and
      // `amount` a flat reduction. Never both.
      mitigates: { halve: false, amount: null },
      resist: null,
      area: "",
      note: "",
      // **WHAT A FAILED RESIST LANDS ON THE CREATURE THAT FAILED IT** (D-910).
      // `statuses` above lands on the BEARER, which is what a draught means;
      // Hellscream's *every enemy within 30 feet ... On a failure it is
      // Frightened of you* lands on whoever rolled the Test and failed, through
      // the feature card's own door (`dice/chat.mjs`' `onFailInflicts`).
      onFail: [],
      // **THE CORRUPTION THE PRESS OFFERS** (D-909, D-910): Blood of Mannoroth,
      // Raise the Fallen, The Skull's Reserve. A Resilience Test first, a point
      // on a failure, through `workflows.corruptionExposure`.
      corruptionGain: emptyCorruptionGain(),
      // **THE LEGENDARY PRESSES (D-911)**, each read by `workflows.useSignature`:
      //
      // *takes no damage from that attack or from any other source until the
      // start of their next turn* (Uther's Stand): an effect `applyDamage` reads.
      noDamage: false,
      // *Gain Sand up to its cap* (Stolen Hour): the pool filled.
      fill: null,
      // *makes two more Attack Tests against the same creature as part of the
      // same Attack* (Wind of the Doomhammer), *one Attack Test with it against
      // each creature of your choice* (Starfall Volley): Attack Tests through the
      // attack door with nothing more spent - `same` is the creature targeted, a
      // count each; otherwise one each creature targeted.
      attacks: { count: null, same: false },
      // A press that FIRES ITSELF (Undying: *when damage would reduce you to 0
      // Health, you are reduced to 1 instead*): the door that strikes its use.
      // No surface draws it live.
      trigger: null,
      // *When you cast a spell, you may choose it: its damage and healing land
      // again* (Echo of the Infinite): arms the next cast as 02's Recurrence does.
      echo: false,
      // *An orc wielding it adds 2 to its Damage Rating* (Blood of Mannoroth): a
      // bonus on THIS weapon's blows alone, never the bearer's attack lane.
      weaponDamage: null,
      // **PHASE B2 PRESSES (D-912)**, each read by `workflows.useSignature`:
      //
      // *plants one totem ... paying the totem's Mana and no Half-Action for it*
      // (Call of the Elements): the class feature used, through `useFeature`.
      feature: "",
      // *casts a healing spell on up to 12 creatures ... with one Casting Test and
      // no Mana* (The Archbishop's Prayer): the most creatures it reaches.
      castHeal: null,
      // *every other ... creature within N feet of you* (Drain the Chamber, The
      // Sunwell's Torrent): the creatures the press gathers itself, ally or enemy,
      // by a condition they carry or a Sustain they hold.
      gather: { feet: null, condition: null, sustaining: false },
      // *loses Health equal to its Bleeding value, and you regain the total*
      // (Drain the Chamber): the condition whose value is drained.
      drain: null,
      // *On a failure one spell it is sustaining ends, of its choice* (The
      // Sunwell's Torrent): what a failed Resist ends beside its conditions.
      onFailEnds: null,
      // *tethers one demon ... At the start of each of the Warlock's turns until
      // the end of the encounter, or until the demon is more than 60 feet from the
      // Warlock, the demon loses 2 Health and the Warlock regains 2 Mana* (Pylon
      // Tether).
      tether: { creatureType: null, feet: null, loss: null, mana: null },
      // *that ally returns to the Health it had at the start of its last turn*
      // (Staghelm's Regret): the creature targeted, at 0.
      rewind: false,
      // *the attack hits you instead, and your Armor Points apply* (The Raised
      // Gauntlet): asked IN the blow by D-777's move door, so it fires itself.
      move: { feet: null },
      // *the attack misses you* (Step Aside): pressed from the attack's own card,
      // through 04's Afterimage's door.
      negates: false,
      // *it arcs to four other creatures ... instead of one* (Thunderaan's Fury):
      // the next arc's count.
      arcWiden: null,
      // *chooses their Breath's school from the seven* (Brood Breath): the next
      // Breath's school, chosen at the press.
      breathSchool: false
    },
    // More bodies on the field (D-691's own shape, verbatim).
    summon: { entry: "", count: null, side: "summoner", from: "nextRound" },
    // At the start of each of your turns. The `mp5` and `hp5` of the record.
    tick: { health: null, mana: null },
    // **THE SENTENCES WITH A GATE OF THEIR OWN** (D-722; the lead,
    // 2026-09-14). Asked what a gate in one sentence of a multi-sentence
    // Signature covers, the lead answered *only its own sentence*.
    //
    // *A creature that hits you takes 1 Nature damage. A Shaman wielding it
    // adds 2 to its Damage Rating.* is one Signature saying two things: the
    // retaliation is for whoever carries it and the Damage Rating is a
    // Shaman's. A single top-level gate could only ever say *all of it is a
    // Shaman's*, which silently took the retaliation away from everybody else.
    //
    // A branch is `{gates, reason, …the standing and trigger families}` — the
    // SAME keys as the trunk's, minus `kind`, `use`, `useGates`, `summon` and
    // `gated`, because a Signature carries one button and nothing nests.
    // **An EMPTY list is exactly what the descriptor meant before this key**,
    // so every hand row, Classic template and stored document keeps its value.
    //
    // An unreadable sentence drops ALONE (the lead, the same day): it becomes a
    // branch carrying its gates and its `reason` and no families, where before
    // one unqualifiable *against …* clause withheld the whole Signature.
    gated: [],
    // **THE OTHER BUTTONS** (D-909, D-910). A Legendary may print more than one
    // run that is pressed - Gorehowl's Hellscream and Blood of Mannoroth - and
    // the trunk's `use` is ONE button. A MAP keyed by the run's slug, never a
    // list: `resetUses` and `useSignature` write
    // `system.signatureEffect.presses.<key>.uses.value` by dotted path, and an
    // array index there is D-671's trap. Each entry is `emptyPress()`: the
    // run's label, its own gate, and `use`'s whole shape. Empty on everything
    // that is not a Legendary.
    presses: {}
  };
}

/**
 * WHEN A PRESS FIRES ITSELF (D-911): `dropToZero` is Undying's *when damage
 * would reduce you to 0 Health*, read by `AzerothActor#_holdAtOne`.
 */
export const SIGNATURE_TRIGGERS = Object.freeze(["dropToZero", "blowMoved"]);

/** A corruption charge with nothing set (D-910). */
export function emptyCorruptionGain() {
  return { track: null, amount: null, resilience: null, dc: null, at: null };
}

/**
 * ONE MORE BUTTON ON A LEGENDARY (D-910): the run's label, the gate on that
 * button alone, then the trunk `use`'s own keys in their own order, so every
 * door that reads a `use` reads a press with no second branch.
 */
export function emptyPress() {
  return { label: "", gates: [], ...emptySignature().use };
}

/**
 * A run's name as the key of `presses` (D-910): lower case, apostrophes gone,
 * every other run of non-letters a hyphen - `tools/parse-book`'s own slug, so a
 * dotted path never meets a space, a full stop or a quote.
 *
 * @param {string} label
 * @returns {string}
 */
export function pressKey(label) {
  return String(label ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * **THE SIGNATURE DC** (08 §20, D-909; the lead's ruling, D-910): *your Spell
 * DC or 12 plus twice your tier, whichever is higher*. A character with no
 * Spell DC takes the floor. The tier is the bearer's, 1 to 4, and a tier that
 * is not a number is tier 1.
 *
 * @param {{spellDC?: number|null, tier?: number|null}} bearer
 * @returns {number}
 */
export function signatureDC({ spellDC = null, tier = 1 } = {}) {
  const t = Math.max(1, Math.trunc(Number(tier)) || 1);
  const floor = 12 + 2 * t;
  const own = Number(spellDC);
  return spellDC !== null && spellDC !== undefined && Number.isFinite(own) ? Math.max(Math.trunc(own), floor) : floor;
}

/**
 * **THE ONE SIGNATURE DC OF A BEARER** (D-914, the final review: three derivations in
 * `workflows.mjs` had drifted - a creature's Resist with no Spell DC asked for none). A
 * character's is `signatureDC` (08 §20, D-910: its Spell DC or 12 plus twice its tier,
 * whichever is higher); a creature's is its block's Spell DC (14 §1's `**Spells** (DC n)`,
 * `system.spells.dc`), else 12 plus twice its tier.
 *
 * @param {{type?: string, system?: object}|null} actor
 * @returns {number}
 */
export function signatureDcOf(actor) {
  const sys = actor?.system ?? {};
  const spell = sys.spellDC ?? sys.spells?.dc ?? null;
  const tier = sys.tier ?? 1;
  return actor?.type === "character" ? signatureDC({ spellDC: spell, tier }) : (spell ?? signatureDC({ tier }));
}

/**
 * THE LABELLED RUNS OF A SIGNATURE'S PROSE (D-909, D-910). A Legendary's prose
 * is one paragraph a run, each opening on its name in bold and a full stop -
 * `<p><strong>Scarlet Reckoning.</strong> A member of …</p>` - which is what
 * `tools/parse-book/equipment.mjs#parseUnique` writes. **Two runs or more, every
 * paragraph labelled**, or the whole prose is one unlabelled run: an Epic's
 * sentence, a Classic find's and a GM's own are never split, so nothing they
 * said reads differently.
 *
 * @param {string} html
 * @returns {Array<{label: string, html: string}>}
 */
export function signatureRuns(html) {
  const text = String(html ?? "");
  const whole = [{ label: "", html: text }];
  const paragraphs = text.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [];
  if (paragraphs.length < 2) return whole;
  const runs = [];
  for (const p of paragraphs) {
    const m = /^<p\b[^>]*>\s*<strong>([^<]+?)\.\s*<\/strong>\s*([\s\S]*?)\s*<\/p>$/i.exec(p.trim());
    if (!m) return whole;
    runs.push({ label: m[1].trim(), html: `<p>${m[2]}</p>` });
  }
  return runs;
}

/**
 * One run's words, as plain text, by its label (D-910): what a card prints for
 * a fired row and what the census holds a part's numbers against. An empty or
 * unknown label is the whole prose.
 *
 * @param {string} html
 * @param {string} [label]
 * @returns {string}  the run's HTML
 */
export function runProse(html, label = "") {
  if (!label) return String(html ?? "");
  const run = signatureRuns(html).find(r => r.label.toLowerCase() === String(label).toLowerCase());
  return run ? run.html : String(html ?? "");
}

/**
 * THE OTHER BUTTONS, in the order the row wrote them (D-910), each with its
 * key, made whole. A map's own order is its insertion order, and the hand row
 * and the parser write them in the order the chapter prints them.
 *
 * @param {object|null} signature
 * @returns {Array<{key: string, press: object}>}
 */
export function pressesOf(signature) {
  const held = signature?.presses;
  if (!held || typeof held !== "object") return [];
  return Object.entries(held).map(([key, raw]) => ({ key, press: merge(emptyPress(), raw ?? {}) }));
}

/**
 * THE FAMILIES A BRANCH CARRIES, in `emptySignature()`'s own order (D-722).
 *
 * Everything that is true while the thing is worn or fires off a trigger, and
 * nothing that is pressed: `kind`, `use`, `useGates` and `summon` are the ONE
 * button and stay on the trunk, and `gated` does not nest.
 *
 * It is a list rather than a second object literal because three things have to
 * agree — `emptyBranch()`, `cleanBranch()` and `equipment.mjs#branchField()` —
 * and a fourth copy of nineteen key names is a fourth thing to keep in step.
 */
export const BRANCH_FAMILIES = Object.freeze([
  "grants", "refuses", "criticalOn", "damageMultiplier", "damageRatingSet",
  "spellDamage", "chosenSpellDamage", "chosenSpellHealing", "firstParryTest", "weaponKillReward", "scalingHitDamage", "spellCost", "healingBonus", "corruptionReduction", "corruptionGain", "cancelsBane",
  "blockBonus", "armorPointsPerTier", "aura", "empowers", "bound",
  // The Legendary readers (D-911), in `emptySignature()`'s own order.
  "wardFloor", "noFallDamage", "ignoresReload", "pastImmune", "sandOnFail", "poolOnHurt", "onBlock",
  "tickHealBonus", "refusesFrom", "bossCannotIgnore", "adaptiveWard", "killTemp",
  // Phase B2 (D-912).
  "breathHalf", "attackerBane", "phantomShot", "resistBane", "freeSpell", "touchHealingFeet", "ordination",
  "spellDamageTest", "sizeStep", "secondReaction",
  "onHit", "onKill", "whenStruck", "tick"
]);

/**
 * One gated sentence, with nothing set. The gate and the reason first, then
 * `BRANCH_FAMILIES` in the trunk's own order — key order is the pack diff
 * (`tools/check-packs.mjs` compares byte for byte, CLAUDE.md §9).
 */
export function emptyBranch() {
  const whole = emptySignature();
  // The run's name rides after the reason, as it does on the trunk (D-910).
  const out = { gates: [], reason: "", label: "" };
  for (const key of BRANCH_FAMILIES) out[key] = whole[key];
  return out;
}

/**
 * WHETHER A BRANCH SAYS ANYTHING AT ALL (D-722's own correction, 2026-09-15).
 *
 * A gate is not content. The sentence *A Shaman wielding it may spend a
 * Half-Action to regain 4 Health.* hands its pressed half UP to the trunk
 * (`liftPress`), and what it leaves behind is a branch carrying its gate and
 * not one family — so a Rogue read the Shaman clause TWICE on one row: once
 * beside the greyed button through `pressGates`, and once as *One sentence
 * only — Only for one class: Shaman · That sentence does not apply to you*
 * standing over nothing at all. `seedSignature` drops such a branch.
 *
 * **A `reason` IS content and is kept.** An unreadable sentence's branch is
 * exactly `{gates, reason}` with no families — that is what *drops alone* means
 * — and it has to keep saying why, because what cannot be read records a reason
 * under a ceiling that may only fall (D-691).
 *
 * It is a STRUCTURAL test rather than `branchKind()`, which answers a different
 * question: what a reader would CALL the branch. That one knows nothing about
 * `onKill` or `bound`, so a branch carrying only Gorehowl's kill rider or a
 * bound creature's damage would come back `none` and be thrown away. Here a
 * family that carries anything at any depth keeps the branch, and a family
 * added to `BRANCH_FAMILIES` tomorrow is covered without a second edit.
 *
 * @param {object|null} branch  one entry of `gated[]`
 * @returns {boolean}
 */
export function branchIsEmpty(branch) {
  if (!branch || typeof branch !== "object") return true;
  if (branch.reason) return false;
  return BRANCH_FAMILIES.every(key => carriesNothing(branch[key]));
}

/**
 * Whether a value is what `emptyBranch()` carries: nothing, at any depth.
 *
 * Every default in `BRANCH_FAMILIES` is null, `""` or `[]`, so this reads as
 * *unset* over a whole branch and as *unset* over a FRAGMENT too — a stored
 * branch cleaned present-key (`cleanBranch`) simply has no key where the blank
 * one has a null, and `undefined` has to answer the same way or a partial write
 * would read as content. A zero is NOT nothing: `tick: {health: 0}` is a number
 * somebody wrote, and keeping the branch is the safe direction to be wrong in.
 */
function carriesNothing(value) {
  if (value === null || value === undefined || value === "" || value === false) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.values(value).every(carriesNothing);
  return false;
}

const num = v => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : null;
};
const oneOf = (v, keys) => (typeof v === "string" && keys.includes(v) ? v : null);
const strings = v => (Array.isArray(v) ? v.map(x => String(x)).filter(Boolean) : []);
const text = v => (typeof v === "string" ? v : "");
/**
 * A whole number at or above a floor, else null. **The floor is the point
 * below which the key would mean the opposite of itself**: a damage
 * MULTIPLIER of 1 changes nothing and one of 0 erases the blow, a healing
 * bonus of 0 is no bonus, a pool cost of 0 is free. The schema carries the
 * same `min`, and a value it would refuse makes the whole item invisible at
 * load (CLAUDE.md §15), so it is nulled here first.
 */
const atLeast = (v, floor) => {
  const n = num(v);
  return n !== null && n >= floor ? n : null;
};

/**
 * A stored descriptor made valid: a value outside its vocabulary is nulled
 * rather than refusing the document, and a grant sentence `parseGrant` cannot
 * read is dropped rather than carried. Runs in `migrateData`, before a
 * `choices` can refuse the item at load (CLAUDE.md §15).
 *
 * **ONLY THE KEYS THAT ARE THERE**, because core runs `migrateData` over
 * PARTIAL update data too: rebuilding the object would write a null over every
 * field the update did not name, which is how a waterskin lost its maximum and
 * its unit to `update({"system.charges.value": 0})` (D-671). Every `cleanX` in
 * `rules/` follows that rule; one that does not passes every test until
 * somebody writes a single field.
 *
 * **AND IT IS PRESENT-KEY AT EVERY DEPTH, WHICH IT WAS NOT.** The rule was
 * kept at the top level and at `use`'s own, and broken one level below: a
 * dotted `update({"system.signatureEffect.use.uses.value": 1})` — the write
 * `AzerothActor#resetUses` makes at every rest — arrives as
 * `{use: {uses: {value: 1}}}`, and rebuilding `uses` wholesale wrote a NULL
 * over `max` and over `per`. The Signature then refilled once and never again,
 * because `refreshes(null, "short")` is false. Every unit test passed, and the
 * live use test in `module/testing/quench-signatures.mjs` is what caught it.
 * `nested()` below is the guard, and it is used for every sub-object here.
 */
export function cleanSignature(raw) {
  if (!raw || typeof raw !== "object") return emptySignature();
  return nested(raw, {
    kind: v => oneOf(v, SIGNATURE_KINDS_AUTOMATED) ?? "none",
    reason: cleanReason,
    // The run the trunk reads (D-910): free text, the chapter's own name.
    label: text,
    gates: cleanGates,
    // The gate on the BUTTON alone, in the trunk's own vocabulary (D-722).
    useGates: cleanGates,
    ...standingCleaners(),
    use: cleanSignatureUse,
    summon: v => nested(v, {
      entry: text,
      count: num,
      side: s => oneOf(s, Object.keys(AZEROTH.summonSides)) ?? "summoner",
      from: f => oneOf(f, Object.keys(AZEROTH.summonFrom)) ?? "nextRound"
    }),
    // THE GATED SENTENCES (D-722). **An array is replaced WHOLE**, which is
    // already `merge`'s rule for `gates` and `grants`, so the present-key
    // recursion never walks into a branch: a dotted write into an array index
    // is not a shape anything in this system makes, and treating one as a
    // partial would be D-671's trap with an index in it.
    gated: cleanBranches,
    // THE OTHER BUTTONS (D-910). A MAP, so the dotted refill
    // `presses.<key>.uses.value` arrives as `{presses: {<key>: {uses: {value}}}}`
    // and is cleaned PRESENT-KEY at every depth, exactly as the trunk's `use`.
    presses: cleanPresses
  });
}

/**
 * The other buttons made valid, key by key and present-key all the way down
 * (D-910, CLAUDE.md §15). A key that is not a slug is dropped - it could never
 * be written by dotted path - and so is a value that is not an object.
 */
function cleanPresses(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) || !value || typeof value !== "object") continue;
    out[key] = cleanPress(value);
  }
  return out;
}

/** One press made valid: its label, its gate, then `use`'s own cleaner. */
function cleanPress(raw) {
  const head = nested(raw, { label: text, gates: cleanGates });
  const { label, gates, ...rest } = raw;
  return { ...head, ...cleanSignatureUse(rest) };
}

/**
 * A corruption charge made valid, present-key (D-910). A track 10 does not
 * build, a Resilience 05 does not name or an `at` outside the vocabulary is
 * nulled, and the amount and the DC floor at 1: a charge of nothing is none,
 * and a Test against DC 0 is no Test.
 */
function cleanCorruptionGain(raw) {
  return nested(raw, {
    track: t => oneOf(t, Object.keys(AZEROTH.corruptionTracks)),
    amount: a => atLeast(a, 1),
    resilience: r => oneOf(r, Object.keys(AZEROTH.resiliences)),
    dc: d => atLeast(d, 1),
    at: a => oneOf(a, AZEROTH.corruptionGainAt)
  });
}

/** A stored reason that `AZEROTH.signatureReasons` does not name is no reason. */
const cleanReason = v => oneOf(v, Object.keys(AZEROTH.signatureReasons)) ?? "";

/**
 * THE STANDING AND TRIGGER FAMILIES, as cleaners (D-722).
 *
 * `cleanSignature` and `cleanBranch` both need every one of these and neither
 * needs a copy: a branch is the trunk's own families under its own gate, so two
 * tables would be two things to keep in step with `AZEROTH`'s vocabularies —
 * and the one that drifted would null a stored value on a branch alone, which
 * nothing would notice until a Signature quietly stopped firing.
 *
 * A FUNCTION rather than a frozen object, because the closures read `AZEROTH`
 * and the keys are handed to `nested()`, which iterates them in order.
 */
function standingCleaners() {
  const damageTypes = () => Object.keys(AZEROTH.damageTypes);
  return {
    grants: v => strings(v).filter(g => parseGrant(g) !== null),
    refuses: v => strings(v).filter(r => r in AZEROTH.conditions || r in AZEROTH.refusalExtras),
    // A d20 face and nothing else. The book only ever widens to 19 or 18, but
    // that is POLICY and belongs to the whole-pack census; what is checked here
    // is that the number could be a face at all.
    criticalOn: face,
    // 08 §20 doubles and nothing else, so a multiplier under 2 is not one.
    damageMultiplier: v => atLeast(v, 2),
    damageRatingSet: v => atLeast(v, 0),
    spellDamage: v => nested(v, {
      school: s => oneOf(s, Object.keys(AZEROTH.schools)),
      amount: a => atLeast(a, 1)
    }),
    chosenSpellHealing: v => v === true,
    firstParryTest: v => v === true,
    weaponKillReward: v => v === true,
    scalingHitDamage: v => v === true,
    chosenSpellDamage: v => nested(v, {
      school: s => oneOf(s, Object.keys(AZEROTH.schools)),
      attribute: a => oneOf(a, ["str", "dex", "con", "int", "wis", "cha"]),
      skill: s => oneOf(s, Object.keys(AZEROTH.skills)),
      casting: v => v === true
    }),
    // The Mana a school's spells cost, less (the lead, 2026-09-14). The same
    // guard as the line above it: a school outside `AZEROTH.schools` is nulled
    // rather than refusing the document at load, and a discount of 0 is not
    // one. `nested` keeps this present-key at THIS depth as at every other, so
    // `update({"system.signatureEffect.spellCost.amount": 2})` leaves the
    // school alone (D-671, D-692).
    spellCost: v => nested(v, {
      school: s => oneOf(s, Object.keys(AZEROTH.schools)),
      amount: a => atLeast(a, 1),
      minimum: m => atLeast(m, 1)
    }),
    healingBonus: v => atLeast(v, 1),
    corruptionReduction: v => nested(v, {
      track: t => oneOf(t, Object.keys(AZEROTH.corruptionTracks)),
      amount: a => atLeast(a, 1)
    }),
    // What holding it charges, a Test first (D-910).
    corruptionGain: cleanCorruptionGain,
    cancelsBane: v => oneOf(v, Object.keys(AZEROTH.cancellableBanes)),
    // Drillborer Disk's *a further 2* on a Block (06 §6's Reaction).
    blockBonus: v => atLeast(v, 1),
    // Stormrage Raiment's Armor Points per tier: 0 a tier is not a bonus.
    armorPointsPerTier: v => atLeast(v, 1),
    // The Bulwark's aura. `rules/auras.mjs` owns the guard, and it keeps only
    // the keys it is handed, at this depth as at every other (D-692).
    aura: cleanAura,
    // One named ability improved (D-698). The NAME is free text — 02, 04 and
    // 07 have no roster in `config.mjs` — and the census holds it against the
    // packs, exactly as a class gate's value is held against the chapters.
    empowers: v => nested(v, {
      name: text,
      damageRating: n => atLeast(n, 1),
      heal: n => atLeast(n, 1),
      cost: n => atLeast(n, 1)
    }),
    bound: v => nested(v, {
      damage: n => atLeast(n, 1),
      creatureType: t => oneOf(typeof t === "string" ? t.toLowerCase() : t, Object.keys(AZEROTH.creatureTypes))
    }),
    // The Legendary readers (D-911), present-key at every depth.
    wardFloor: v => nested(v, {
      ward: n => atLeast(n, 1),
      schools: s => [...new Set((Array.isArray(s) ? s : []).filter(x => typeof x === "string" && x in AZEROTH.schools))]
    }),
    noFallDamage: v => v === true,
    ignoresReload: v => v === true,
    pastImmune: t => oneOf(t, Object.keys(AZEROTH.damageTypes)),
    sandOnFail: n => atLeast(n, 1),
    poolOnHurt: v => nested(v, { pool: p => oneOf(p, Object.keys(AZEROTH.poolTypes)), amount: a => atLeast(a, 1) }),
    onBlock: v => nested(v, {
      pool: p => nested(p, { pool: q => oneOf(q, Object.keys(AZEROTH.poolTypes)), amount: a => atLeast(a, 1) }),
      condition: cleanInflicted,
      melee: m => m === true
    }),
    tickHealBonus: n => atLeast(n, 1),
    // A row naming no condition A1 holds, or no creature type, refuses nothing.
    refusesFrom: v => (Array.isArray(v) ? v : [])
      .map(r => ({
        id: oneOf(r?.id, Object.keys(AZEROTH.conditions)),
        creatureType: oneOf(typeof r?.creatureType === "string" ? r.creatureType.toLowerCase() : null, Object.keys(AZEROTH.creatureTypes))
      }))
      .filter(r => r.id && r.creatureType),
    bossCannotIgnore: v => v === true,
    adaptiveWard: n => atLeast(n, 1),
    killTemp: v => nested(v, {
      perTier: n => atLeast(n, 1),
      weightClasses: w => [...new Set((Array.isArray(w) ? w : []).filter(x => typeof x === "string" && x in AZEROTH.weightClasses))]
    }),
    // Phase B2 (D-912), present-key at every depth.
    breathHalf: v => v === true,
    attackerBane: v => nested(v, { faction: f => (typeof f === "string" && f.trim() ? f.trim() : null), banes: n => atLeast(n, 1) }),
    phantomShot: v => nested(v, { rating: n => atLeast(n, 0), type: t => oneOf(t, Object.keys(AZEROTH.damageTypes)) }),
    resistBane: v => nested(v, {
      school: t => oneOf(t, Object.keys(AZEROTH.schools)),
      name: text,
      creatureType: t => oneOf(typeof t === "string" ? t.toLowerCase() : t, Object.keys(AZEROTH.creatureTypes)),
      banes: n => atLeast(n, 1),
      per: p => oneOf(p, Object.keys(AZEROTH.abilityUsesPer))
    }),
    freeSpell: text,
    touchHealingFeet: n => atLeast(n, 1),
    ordination: v => v === true,
    spellDamageTest: v => nested(v, {
      school: t => oneOf(t, Object.keys(AZEROTH.schools)),
      resilience: r => oneOf(r, Object.keys(AZEROTH.resiliences)),
      onFail: cleanInflicted
    }),
    sizeStep: n => atLeast(n, 1),
    secondReaction: v => strings(v),
    onHit: v => nested(v, {
      sl: num,
      damage: d => nested(d, { amount: num, type: t => oneOf(t, damageTypes()) }),
      condition: cleanInflicted,
      // The further conditions one blow lands. An entry that names no
      // condition is dropped, unlike a GATE — a condition nobody can read
      // inflicts nothing, where a clause nobody can read must not loosen a
      // gate that was written.
      conditions: v2 => (Array.isArray(v2) ? v2 : []).map(cleanInflicted).filter(c => c.id),
      bane: b => atLeast(b, 1),
      sunder: num,
      momentum: num,
      heal: num,
      healFeet: f => atLeast(f, 1),
      mana: num,
      push: p => atLeast(p, 1),
      // Null where it does not arc, so a consumer reads `arc` and not
      // `arc.targets` to know whether there is one.
      // `all` (Magma Shot, D-912): *every other creature within 5 feet of the target*.
      arc: a => (a && typeof a === "object" ? nested(a, { targets: num, feet: num, all: x => x === true }) : null),
      // How often the row may fire (D-696); null is every hit.
      per: p => oneOf(p, Object.keys(AZEROTH.abilityUsesPer)),
      // Damage read off the target's own condition (Perdition's Blade).
      damageFromCondition: d => nested(d, {
        id: i => oneOf(i, Object.keys(AZEROTH.conditions)),
        per: p => atLeast(p, 1)
      }),
      // The divisor the condition's value is taken at (Sulfuron Hammer). A
      // divisor of 0 is not one, and of 1 would be *all* of the damage - which
      // is a legal rule and simply not one 08 §20 writes today.
      conditionFromDamage: v2 => atLeast(v2, 1),
      noHealing: v2 => v2 === true,
      signatureDC: v2 => v2 === true
    }),
    onKill: v => nested(v, { feet: f => atLeast(f, 0), bane: b => atLeast(b, 1), condition: cleanInflicted }),
    whenStruck: v => nested(v, {
      damage: d => nested(d, { amount: num, type: t => oneOf(t, damageTypes()) }),
      condition: cleanInflicted
    }),
    tick: v => nested(v, { health: num, mana: num })
  };
}

/**
 * The gated sentences, made valid (D-722). **The LIST is replaced whole** — an
 * array always is, here and in `merge` — and each branch inside it is cleaned
 * present-key like everything else.
 *
 * A branch carrying `kind`, `use`, `useGates`, `summon` or a `gated` of its own
 * is DROPPED of those keys rather than refused: a Signature carries one button
 * and nothing nests, so a stored branch that grew one is a descriptor somebody
 * wrote by hand and the pressed half belongs on the trunk.
 *
 * **AND A BRANCH THAT SAYS NOTHING IS DROPPED ON THE WAY IN** (D-722's own
 * correction, 2026-09-15). `seedSignature` drops one already, but that is the
 * SEEDER alone: a descriptor forged at the bench in the window between D-722
 * landing and that fix still holds the vestigial branch in a world, and
 * `0.12.8-signature-branches.mjs` will never re-read it — one of its four guards
 * is *the stored descriptor has NO branch of its own*. `cleanSignature` runs in
 * every model's `migrateData`, so filtering HERE makes the load self-healing
 * and needs neither a migration nor a version bump; the Combat panel, the item
 * sheet, the Overview column and the Forge's preview then read the same
 * descriptor, which is why the seeder's drop was put in the seeder rather than
 * in four filters.
 *
 * Two things it deliberately does not do:
 *
 * - **It does not write a second test of emptiness.** `branchIsEmpty` is the
 *   one rule, and it KEEPS a branch carrying a `reason` — an unreadable
 *   sentence's branch is exactly gates + reason + no family, and it has to go
 *   on saying why (D-691).
 * - **It does not break the present-key rule** (CLAUDE.md §15, D-671 and
 *   D-692, which is recursive at every depth). An array is replaced whole, and
 *   `cleanSignature` calls this only where `gated` is a key it was handed, so a
 *   partial update naming another key leaves the stored list alone. The filter
 *   reads the CLEANED branch rather than the raw one, because a family stored
 *   outside its own vocabulary is nulled above and what it leaves behind is the
 *   same gate standing over no rule.
 */
function cleanBranches(raw) {
  return (Array.isArray(raw) ? raw : []).map(cleanBranch).filter(branch => !branchIsEmpty(branch));
}

/** One gated sentence, made valid: the gate, why it is still prose, its families. */
export function cleanBranch(raw) {
  if (!raw || typeof raw !== "object") return emptyBranch();
  const standing = standingCleaners();
  const cleaners = { gates: cleanGates, reason: cleanReason, label: text };
  for (const key of BRANCH_FAMILIES) cleaners[key] = standing[key];
  return nested(raw, cleaners);
}

/**
 * **ONLY THE KEYS THAT ARE THERE**, one object at a time, at every depth.
 *
 * The whole guard in one function: a key the raw object does not carry is not
 * written, so a partial update leaves its siblings alone. Everything the raw
 * object DOES carry is cleaned, and a key outside the table is dropped — a
 * stored field the vocabulary no longer has must not survive into the model.
 */
function nested(raw, cleaners) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const [key, clean] of Object.entries(cleaners)) if (key in src) out[key] = clean(src[key]);
  return out;
}

/**
 * A condition a Signature puts on somebody, made valid. **One reader for all
 * three triggers** — the blow that lands, the blow that kills and the blow
 * that lands on the bearer — because the shape is `{id, value, until}`
 * wherever it appears and a second copy would be a second thing to keep in
 * step with `AZEROTH.untilKinds`.
 */
function cleanInflicted(raw) {
  return nested(raw, {
    id: v => oneOf(v, Object.keys(AZEROTH.conditions)),
    value: num,
    until: v => oneOf(v, Object.keys(AZEROTH.untilKinds))
  });
}

/** A stored Critical Injury threshold that could be a d20 face, else null. */
function face(value) {
  const n = num(value);
  return n !== null && n >= CRITICAL_MIN && n <= CRITICAL_MAX ? n : null;
}

/**
 * The gate list made valid. **Nothing is dropped**: an entry whose kind is
 * outside the vocabulary keeps its place with `kind: null` and never holds,
 * because dropping it would loosen the gate — *only a Paladin, and only by
 * moonlight* would become *only a Paladin*, and a gate of one unreadable
 * clause would become no gate at all.
 */
function cleanGates(raw) {
  return (Array.isArray(raw) ? raw : []).map(cleanGate);
}

/**
 * One gate made valid. A kind that NEEDS a value keeps its kind when the value
 * cannot be read, because a gated Signature turning always-on is worse than
 * one that withholds itself; `gateHolds` fails such a gate closed.
 *
 * Only the kinds with an enum behind them have their value checked. There is
 * no roster of the nine classes, the eleven races or 12's factions in
 * `config.mjs`, so those stay free strings and the census holds them against
 * the chapters instead.
 */
function cleanGate(raw) {
  const kind = oneOf(raw?.kind, Object.keys(AZEROTH.signatureGates));
  if (!kind) return { kind: null, value: "" };
  // The gates that name nothing at all, so anything stored beside one is junk.
  // A `form` gate is the other way round: it MAY name a form, and an empty one
  // is any form the bearer takes.
  if (VALUELESS_GATES.includes(kind)) return { kind, value: "" };
  const parts = gateValues(raw?.value);
  // A school and a creature type are CONFIG KEYS and are stored as keys; a
  // class, a people, a faction and a form are NAMES and keep the case the item
  // was written in, since `gateHolds` compares them case-blind anyway and the
  // sheet has to print one of them. A Corruption gate is a track and a floor.
  if (kind === "corruption") return { kind, value: parts.filter(p => corruptionFloor(p)).join(", ") };
  const known = kind === "school" ? Object.keys(AZEROTH.schools)
    : kind === "creatureType" ? Object.keys(AZEROTH.creatureTypes)
      : kind === "blow" ? Object.keys(AZEROTH.signatureBlows)
        : null;
  const kept = known ? parts.map(p => p.toLowerCase()).filter(p => known.includes(p)) : parts;
  return { kind, value: kept.join(", ") };
}

/** The gates that are a condition of the world and name nothing beside it. */
const VALUELESS_GATES = Object.freeze(["belowHalfHealth", "atOrAboveHalfHealth", "hasNotMoved", "targetHasNotActed", "hidden"]);

/**
 * A gate's value, as the list of things it names. 08 §20 writes *against
 * undead and demons* on four named items, so one gate names more than one
 * thing and the reader is an "any of".
 */
function gateValues(value) {
  return String(value ?? "").split(",").map(s => s.trim()).filter(Boolean);
}

/**
 * `fel 1` → `{track: "fel", floor: 1}`, or null where the pair is not a track
 * 10 builds and a number. The Grimoire of the Fourth Signatory is the one
 * entry in the chapter that writes it: *a warlock with Fel Corruption 1 or
 * more may read it.*
 */
function corruptionFloor(part) {
  const m = /^([A-Za-z]+)\s+(\d+)$/.exec(String(part ?? "").trim());
  if (!m) return null;
  const track = m[1].toLowerCase();
  return track in AZEROTH.corruptionTracks ? { track, floor: Number(m[2]) } : null;
}

/**
 * The pressed half, in `equipment.mjs#useField()`'s vocabulary so nothing
 * downstream needs a second branch. `cleanUse`'s own rules apply: a change
 * lands in the phase its key belongs to (D-668), and a `resist` naming no
 * Resilience is no Test at all.
 *
 * **Present keys at EVERY depth**, not merely at this one.
 * `update({"system.signatureEffect.use.uses.value": 1})` — which is what
 * `AzerothActor#resetUses` writes at every rest — arrives here as
 * `{uses: {value: 1}}`. Rebuilding `uses` from that wrote a NULL over `max`
 * and over `per`, so the Signature refilled once and never again, because
 * `refreshes(null, "short")` is false. The guard had been kept at this level
 * and broken one below it, which is D-671 exactly; `nested()` is the fix and
 * every sub-object goes through it.
 */
function cleanSignatureUse(raw) {
  if (!raw || typeof raw !== "object") return emptySignature().use;
  const conditions = Object.keys(AZEROTH.conditions);
  const ids = list => (Array.isArray(list) ? list.map(String).filter(id => conditions.includes(id)) : []);
  const out = nested(raw, {
    action: v => oneOf(v, Object.keys(AZEROTH.actions)),
    // A pool of `AZEROTH.poolTypes` and an amount, in
    // `class-features.mjs#cost`'s shape. A cost of nothing is not a cost, so
    // the amount floors at 1.
    cost: v => nested(v, { pool: p => oneOf(p, Object.keys(AZEROTH.poolTypes)), amount: a => atLeast(a, 1) }),
    uses: v => nested(v, { max: num, value: num, per: p => oneOf(p, Object.keys(AZEROTH.abilityUsesPer)) }),
    heal: v => nested(v, { health: num, mana: num, fatigue: num }),
    changes: v => (Array.isArray(v) ? v : [])
      .filter(c => c && typeof c.key === "string" && c.key)
      .map(c => ({
        key: c.key,
        type: typeof c.type === "string" && c.type ? c.type : "add",
        value: String(c.value ?? ""),
        phase: oneOf(c.phase, ["initial", "final"]) ?? phaseFor(c.key)
      })),
    statuses: ids,
    ends: ids,
    duration: v => nested(v, { value: num, units: u => oneOf(u, SIGNATURE_DURATION_UNITS) }),
    damage: v => nested(v, { amount: num, type: t => oneOf(t, Object.keys(AZEROTH.damageTypes)) }),
    // *Halve the damage of one attack that hits them*, or take a flat amount
    // off it. NEVER BOTH: a halving that also subtracts is two rules, and 08
    // §20 writes one.
    mitigates: v => nested(v, { halve: h => h === true, amount: a => atLeast(a, 1) }),
    // A `resist` naming no Resilience is no Test at all — but only where the
    // update NAMED the Resilience. One that writes the DC alone leaves the
    // Resilience where it was rather than emptying the Test.
    resist: v => {
      if (!v || typeof v !== "object") return null;
      if ("resilience" in v && !oneOf(v.resilience, Object.keys(AZEROTH.resiliences))) return null;
      return nested(v, { resilience: r => oneOf(r, Object.keys(AZEROTH.resiliences)), dc: num });
    },
    area: text,
    note: text,
    // What a failed Resist lands on whoever failed it (D-910), in the shape a
    // condition inflicted takes everywhere; an entry naming none is dropped.
    // An entry may carry `endsOnDamage` (Emerald Slumber: *Stunned until it
    // takes damage or until the end of its next turn*; D-911), only where named.
    onFail: v => (Array.isArray(v) ? v : []).map(f => {
      const c = cleanInflicted(f);
      return f?.endsOnDamage === true ? { ...c, endsOnDamage: true } : c;
    }).filter(c => c.id),
    corruptionGain: cleanCorruptionGain,
    // The Legendary presses (D-911).
    noDamage: n => n === true,
    fill: f => oneOf(f, ["sand"]),
    attacks: a => nested(a, { count: n => atLeast(n, 1), same: s => s === true }),
    trigger: t => oneOf(t, SIGNATURE_TRIGGERS),
    echo: e => e === true,
    weaponDamage: n => atLeast(n, 1),
    // Phase B2 (D-912).
    feature: text,
    castHeal: n => atLeast(n, 1),
    gather: g => nested(g, { feet: n => atLeast(n, 1), condition: c => oneOf(c, Object.keys(AZEROTH.conditions)), sustaining: x => x === true }),
    drain: c => oneOf(c, Object.keys(AZEROTH.conditions)),
    onFailEnds: e => oneOf(e, ["sustain"]),
    tether: t => nested(t, {
      creatureType: c => oneOf(typeof c === "string" ? c.toLowerCase() : c, Object.keys(AZEROTH.creatureTypes)),
      feet: n => atLeast(n, 1), loss: n => atLeast(n, 1), mana: n => atLeast(n, 1)
    }),
    rewind: x => x === true,
    move: m => nested(m, { feet: n => atLeast(n, 1) }),
    negates: x => x === true,
    arcWiden: n => atLeast(n, 1),
    breathSchool: x => x === true
  });
  // `halve` wins where a caller writes each, and it can only be judged once
  // both are in hand.
  if (out.mitigates?.halve === true) out.mitigates.amount = null;
  return out;
}

/** Whether a Signature does anything at all. */
export function hasSignature(signature) {
  return Boolean(signature?.kind) && signature.kind !== "none";
}

/**
 * Whether there is a button to press. A standing Signature, one that fires off
 * a blow and one that gives back at the top of the turn are all enforced
 * elsewhere and nobody uses them, so a Use control on any of those rows would
 * do nothing at all — which is the shape D-681 keeps finding.
 */
export function isPressable(signature) {
  return hasSignature(signature) && (signature.kind === "use" || signature.kind === "spell");
}

/**
 * WHAT QUALIFIES THE BUTTON (D-722; the lead, 2026-09-14: *a gated sentence may
 * carry the button*).
 *
 * *A Shaman may spend a Half-Action to call the elements. Anyone wielding it
 * takes a Boon on Parry.* is a press for a Shaman and a Boon for everybody, and
 * the trunk's `gates` is the second half's — empty. `useGates` is the press's
 * own, and an EMPTY one falls back to the trunk's, which is exactly what every
 * descriptor written before this key meant.
 *
 * ONE reader, because the door (`workflows.refuseSignaturePress`) and the three
 * surfaces (`actions.mjs#signatureContext`) must not disagree about which list
 * greys the button.
 *
 * @param {object|null} signature
 * @returns {Array<{kind: string|null, value: string}>}
 */
export function pressGates(signature) {
  const own = signature?.useGates ?? null;
  if (Array.isArray(own) && own.length) return own;
  return signature?.gates ?? [];
}

/**
 * WHY A PRESSABLE SIGNATURE CANNOT BE PRESSED RIGHT NOW, or null where it can.
 *
 * **One law for the door and for the three surfaces** (S3). `useSignature`
 * refuses on this and names the reason; the item sheet, the Overview row and
 * the Combat row grey their button on it and print the same words. Two copies
 * of the judgement would be two things to keep in step, and the one that drifts
 * is always the sheet's — a control that looks live and refuses on the click.
 *
 * **A reason is never a greyed button alone** (D5): every surface says it in
 * words, because *unavailable* with no cause is the state a player asks the GM
 * about.
 *
 * A Signature that is not pressable returns null, which is NOT permission: the
 * caller asks `isPressable` first, and a standing Signature has no control at
 * all (D-681).
 *
 * @param {object} signature  a whole descriptor, as `signatureEffectOf` returns
 * @param {object} [o]
 * @param {boolean} [o.holds]   whether `gateHolds` passed for the bearer, over
 *   **`pressGates(signature)`** and not over `gates` — the press has a gate of
 *   its own where the sentence that presses is not the sentence that is gated
 *   (D-722). Every caller reads it through that one function.
 * @param {number} [o.spells]   how many entries `system.spells[]` carries
 * @returns {"gate"|"spent"|"noSpell"|null}
 */
export function pressRefusal(signature, { holds = true, spells = 0, worn = true } = {}) {
  if (!isPressable(signature)) return null;
  // **A LEGENDARY WORKS WHILE IT IS WORN** (08 §20; D-913): `signatureWorn` is the
  // caller's reading of the item, and a press of an item not worn is refused in words.
  if (worn === false) return "unequipped";
  if (!holds) return "gate";
  // **A `spell` KIND NAMES NO SPELL** (the descriptor's own comment): which one
  // it casts is `system.spells[]`, and Benediction and Netherwind Regalia are
  // both `spell` with an empty list. A Cast button over nothing is the shape
  // D-681 keeps finding, so it says so instead.
  if (signature.kind === "spell" && spells <= 0) return "noSpell";
  const uses = signature.use?.uses ?? null;
  if (uses?.per && (uses.value ?? 0) <= 0) return "spent";
  return null;
}

/**
 * WHY ONE OF A LEGENDARY'S OTHER BUTTONS CANNOT BE PRESSED, or null (D-910).
 * `pressRefusal`'s own two judgements over one `presses` entry: its gate, then
 * its own uses - *counts its uses apart from the item's other Signatures* is
 * 08 §20's sentence, and the entry's own counter is what makes it true.
 *
 * @param {object|null} press  one entry of `presses`, made whole
 * @param {{holds?: boolean}} [o]  `gateHolds` over the entry's OWN gate
 * @returns {"gate"|"spent"|null}
 */
export function pressEntryRefusal(press, { holds = true, worn = true } = {}) {
  if (!press) return null;
  // **A PRESS THAT FIRES ITSELF IS NEVER PRESSED** (Undying, D-911): its door is
  // the blow that would drop the bearer, and a live button over it would spend
  // the use on nothing (D-681). Said in words on every surface.
  if (press.trigger) return "automatic";
  if (worn === false) return "unequipped";
  if (!holds) return "gate";
  const uses = press.uses ?? null;
  if (uses?.per && (uses.value ?? 0) <= 0) return "spent";
  return null;
}

/** The refusals `pressRefusal` returns, for `config.mjs` to name and a test to hold. */
export const SIGNATURE_REFUSALS = Object.freeze(["gate", "spent", "noSpell", "automatic", "unequipped", "fromCard"]);

/**
 * **WHETHER AN ITEM'S PRESS MAY BE MADE AS IT IS CARRIED** (08 §20's callout: *a
 * Signature works only while its item is wielded, worn or held*; D-913, and D-914 for
 * every rarity - the callout is general, so a Rare's or an Epic's press is the
 * Legendary's rule too). An item in a pack or a bag presses nothing; a pack sheet has no
 * bearer and is never worn.
 *
 * @param {{system?: {equipped?: boolean}}|null} item
 * @returns {boolean}
 */
export function signatureWorn(item) {
  if (!item) return false;
  // A career is held, never carried (03 §5's Signature capability): it has no `equipped`
  // to read, and the rule above read it as set down, so no career press was ever made
  // (the D-914 live pass: the Field Surgeon's card stopped posting).
  if (item.type === "career") return true;
  return item.system?.equipped === true;
}

/**
 * **WHAT A LEGENDARY PRESS ANSWERS** (D-913; the lead's adopted recommendation: *press
 * only with their trigger recorded where a card or a hit exists*). Each run's own
 * sentence names its moment:
 *
 * - `hitOnYou` - *as a Reaction when an attack hits you* (Step Aside, which `negates`;
 *   Uther's Stand): pressed from the attack card's row naming the bearer, a hit not
 *   withdrawn;
 * - `attackOnYou` - *as a Reaction when a creature ... makes an Attack Test against you*
 *   (The Wyrm's Roar): pressed from the attack card's row naming the bearer;
 * - `ownHit` - *when an Attack Test with it hits* (Wind of the Doomhammer): the bearer's
 *   own hit with this weapon, this turn, recorded at the attack door.
 *
 * Keyed by the run's label, because 08 §20 prints each once; a Classic find carries none.
 */
export const PRESS_TRIGGERS = Object.freeze({
  "Step Aside": "hitOnYou",
  "Uther's Stand": "hitOnYou",
  "The Wyrm's Roar": "attackOnYou",
  "Wind of the Doomhammer": "ownHit"
});

/**
 * **WHETHER A SIGNATURE'S `area` IS AN AREA A REGION CAN OCCUPY** (D-916, a live finding:
 * The Wyrm's Roar's card drew *Place area: 30 ft circle* over *A creature within 30 ft*,
 * a button over nothing - D-681's shape). The `area` field carries two kinds of phrase:
 *
 * - **an AREA** - a shape (*a 15 ft radius*, a cone, a line) or every creature in reach
 *   (*Each enemy within 30 ft*, *Every other Bleeding creature within 30 ft*): the card
 *   offers Place area, as it always did;
 * - **a TARGET** - one creature in reach (*A creature within 30 ft*, *An ally within 30
 *   ft*, *One demon within 30 ft*): a range for who may be named, which no Region holds,
 *   so the card offers no Place area.
 *
 * Answers the phrase where it is an area, else null. A phrase that is neither is kept as
 * an area (the card's old behaviour), and the census in `signature-d916.test.mjs` fails
 * on one, so a new kind of phrase is read before it ships.
 *
 * @param {string|null} text
 * @returns {string|null}
 */
export function signatureAreaOf(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (SIGNATURE_AREA_SHAPE.test(t)) return t;
  if (SIGNATURE_TARGET_PHRASE.test(t)) return null;
  return t;
}

/** A shape, or every creature in reach: an area a Region occupies (D-916). */
export const SIGNATURE_AREA_SHAPE = /\b(?:radius|cone|line|cube|circle|sphere|square)\b|^(?:every|each|all)\b/i;

/** One creature in reach: a target's range, never an area (D-916). */
export const SIGNATURE_TARGET_PHRASE = /^(?:a|an|one)\s+(?:[A-Za-z'-]+\s+){0,3}?(?:creature|ally|enemy|demon|corpse|undead|beast|target)\b.*\bwithin\s+\d+\s*(?:ft|feet)\b/i;

/**
 * **WHAT A PRESS LEAVES TO THE TABLE**, said on the item sheet (D-914, the final review;
 * no new mechanic): The Wyrm's Roar is pressed from the attack's card once the Attack
 * Test is rolled, so *that Attack Test takes the Bane Frightened gives* is the table's to
 * apply. Keyed by the run's label to an `AZEROTH.signatureReasons` key.
 */
export const PRESS_REASONS = Object.freeze({
  "The Wyrm's Roar": "attackBane"
});

/**
 * The moment a press answers, or null where it is pressed at will (D-913).
 * @param {{label?: string, negates?: boolean}|null} press
 * @returns {"hitOnYou"|"attackOnYou"|"ownHit"|null}
 */
export function pressTrigger(press) {
  if (press?.negates === true) return "hitOnYou";
  return PRESS_TRIGGERS[String(press?.label ?? "")] ?? null;
}

/**
 * **WHETHER A PRESS'S MOMENT IS ON RECORD** (D-913): the i18n key of the refusal, or null.
 * The facts are the caller's reading of the card it was pressed from, or of the bearer's
 * recorded hit.
 *
 * @param {string|null} trigger  `pressTrigger`'s
 * @param {{named?: boolean, attackCard?: boolean, own?: boolean, hit?: boolean, withdrawn?: boolean,
 *   unanswered?: boolean, hitRecord?: boolean}} facts
 * @returns {string|null}
 */
export function pressAnswerRefusal(trigger, { named = false, attackCard = false, own = false, hit = false, withdrawn = false, unanswered = false, hitRecord = false } = {}) {
  if (!trigger) return null;
  if (trigger === "ownHit") return hitRecord ? null : "AZEROTH.Signature.NoHitThisTurn";
  if (!named) return "AZEROTH.Signature.FromCard";
  if (!attackCard) return "AZEROTH.Signature.NotAttackCard";
  if (!own) return "AZEROTH.Signature.NotYourRow";
  if (trigger === "hitOnYou" && (!hit || withdrawn)) return "AZEROTH.Signature.NotHit";
  if (unanswered) return "AZEROTH.Signature.Unanswered";
  return null;
}

/**
 * **WHETHER A GM MAY TRUST A BOOKKEEPING ASK FROM A CLIENT THAT DOES NOT OWN THE BEARER**
 * (D-914, the final review; `effects/legendary-doors.mjs#justifiedAct`'s rule: nothing off
 * the request is trusted that the GM's client cannot re-derive). Where the asker owns the
 * bearer the ask is its own and stands. Otherwise:
 *
 * - `traitExposure` (Fel-touched (Greater) on a kill): the creature killed is at 0 Health
 *   and this bearer's kill Test has not been asked over it before (`marked`);
 * - `roundMark` (Breath of the Necropolis): the card it answers is a spell card the bearer
 *   spoke, of a school one of the bearer's rows names, and the mark is that row's own.
 *
 * @param {string} act
 * @param {{askerOwnsBearer?: boolean, victimHealth?: number|null, marked?: boolean, cardByBearer?: boolean,
 *   cardSchool?: string|null, rows?: Array<{name: string, school: string}>, key?: string}} facts
 * @returns {boolean}
 */
export function legendaryAskTrusted(act, { askerOwnsBearer = false, victimHealth = null, marked = false, cardByBearer = false, cardSchool = null, rows = [], key = "" } = {}) {
  if (askerOwnsBearer === true) return true;
  if (act === "traitExposure") return Number.isFinite(Number(victimHealth)) && victimHealth !== null && Number(victimHealth) <= 0 && marked !== true;
  if (act === "roundMark") {
    if (cardByBearer !== true || !cardSchool) return false;
    return (rows ?? []).some(r => r?.school === cardSchool && key === `signature-spell-test:${r.name}`);
  }
  return false;
}

/**
 * Whether a recorded hit is the one Wind of the Doomhammer answers (D-913): with this
 * weapon, in this fight's current round and turn - or, out of a fight, at this moment of
 * the world's clock.
 *
 * @param {{itemId?: string, combatId?: string|null, round?: number|null, turn?: number|null, at?: number|null}|null} record
 * @param {{itemId: string, combatId?: string|null, round?: number|null, turn?: number|null, now?: number|null}} here
 */
export function hitThisTurn(record, { itemId, combatId = null, round = null, turn = null, now = null } = {}) {
  if (!record || record.itemId !== itemId) return false;
  if (record.combatId || combatId) return record.combatId === combatId && record.round === round && record.turn === turn;
  return record.at === now;
}

/**
 * **GATE KINDS THAT NAME THE TARGET OR THE BLOW, NOT THE BEARER** (D-913, the live
 * run): *Only against one kind of creature: demon* says nothing about who may hold
 * the item, so a surface never prints *That sentence does not apply to you* over it.
 */
export const TARGET_GATE_KINDS = Object.freeze(["creatureType", "targetHasNotActed", "blow", "hidden"]);

/**
 * A gate split by whom it judges (D-913): the bearer's clauses, and the target's.
 * @param {Array<{kind: string}>} gates
 * @returns {{bearer: object[], target: object[]}}
 */
export function splitGates(gates = []) {
  const bearer = [], target = [];
  for (const g of gates ?? []) (TARGET_GATE_KINDS.includes(g?.kind) ? target : bearer).push(g);
  return { bearer, target };
}

/**
 * WHAT IS TRUE OF THE BLOW BEING MADE, as a `blow` gate reads it (Dal'Rend's
 * Sacred Charge, 08 §20; D-696).
 *
 * The words are `AZEROTH.signatureBlows`' own, so what the attack door reports
 * and what a gate may name cannot drift apart. It is here rather than at the
 * door because `applications/` reads `foundry` at import and cannot load under
 * Vitest at all — and a fact this small, written where nothing can test it, is
 * how a gate quietly stops holding.
 *
 * `moved` is the movement halves the turn has already spent, which
 * `AzerothCombatant#spendMovement` records (D-659). **Out of a fight there is
 * no number**, so nothing has moved and the clause does not hold — the same
 * ruling `hasNotMoved` makes from the other side.
 *
 * @param {{offHand?: boolean, moved?: number|null}} o
 * @returns {string[]}
 */
export function blowFacts({ offHand = false, moved = null } = {}) {
  const out = [];
  if (offHand) out.push("off-hand");
  if (Number.isFinite(moved) && moved > 0) out.push("moved");
  return out;
}

/**
 * The descriptor an item carries, made whole. **Never `item.signature`** —
 * that is the PROSE, an `HTMLField` on the same `system`, and reading it as a
 * descriptor would hand a string to every consumer here.
 *
 * @param {{signatureEffect?: object, system?: {signatureEffect?: object}}} item
 *   a document, a `system` object, or a plain snapshot
 * @returns {object|null}
 */
export function signatureEffectOf(item) {
  const raw = item?.signatureEffect ?? item?.system?.signatureEffect ?? null;
  if (!raw || typeof raw !== "object") return null;
  // `cleanSignature` keeps only the keys it was handed, which is right for
  // `migrateData` and wrong for a reader. A stored document is always whole
  // (the schema fills every key), so this only ever fills in for a fragment.
  //
  // **DEEP, through `merge`.** A one-level spread replaces a whole sub-object
  // with the fragment's own, so a fragment naming `whenStruck.condition.id`
  // came back with no `value` beside it and a consumer read `undefined` where
  // every other path gives null. `merge` is the hand tables' own, so a
  // descriptor read off a fragment and one written by `standing()` have the
  // same shape.
  const whole = merge(emptySignature(), cleanSignature(raw));
  // **AND EVERY BRANCH IS MADE WHOLE THE SAME WAY** (D-722). `merge` replaces
  // an array outright, so a `gated` read off a fragment holds branches with
  // only the keys the fragment named; `applyPart` and `signatureSummary` read a
  // branch exactly as they read the trunk and must not find `undefined` where
  // every other path gives null.
  whole.gated = (whole.gated ?? []).map(branch => merge(emptyBranch(), branch));
  return whole;
}

/**
 * Whether a Signature's gate holds, from a snapshot of the bearer and — where
 * a clause is about the creature being struck — of the target. A PLAIN OBJECT,
 * never a Foundry Actor: this module is pure and the caller does the reading.
 *
 * **The list is an AND and the value inside a clause is an OR.** *A Paladin
 * wielding it adds 2 to its Damage Rating against undead and demons* is two
 * clauses — a class and a creature type — and the second names two kinds. An
 * empty list is ungated and holds.
 *
 * A gate the law cannot judge returns **false** and its Signature's standing
 * part is dropped, exactly as an ungateable creature passive is (D-691). Three
 * consequences worth knowing:
 *
 * - **A `creatureType` gate never holds with no target.** That is right in
 *   both directions: *against undead, +2 Damage Rating* must not stand as a
 *   flat bonus on the Overview tab, and it must hold at the roll, where the
 *   caller passes the creature the blow is aimed at.
 * - **A bearer gate with no snapshot never holds.** The bearer is always
 *   knowable, so a missing `classes` is a caller that did not build one, and
 *   giving every character a Paladin's bonus is worse than withholding it
 *   until the caller is fixed.
 * - **Anything that is not a list fails closed**, so a caller still passing
 *   Phase 1's single `{kind, value}` withholds the Signature rather than
 *   handing it to everybody.
 *
 * @param {Array<{kind: string|null, value: string}>|null} gates
 * @param {object} state
 * @param {string[]} [state.classes]   the bearer's class names
 * @param {string} [state.race]        the bearer's people
 * @param {string[]} [state.factions]  the factions the bearer stands with
 * @param {string[]} [state.schools]   the schools the bearer casts from
 * @param {string|string[]|boolean} [state.form]  the forms worn - every name in
 *   the shape, Chimera's two included (D-769) - or one name, or true for any
 * @param {{value: number, max: number}} [state.health]
 * @param {Record<string, number>} [state.corruption]  the three tracks
 * @param {number} [state.moved]       how far the turn has already moved. The
 *   only question is whether it is more than none, so the caller may hand over
 *   feet or the movement HALVES the turn spent — which is the only record
 *   `AzerothCombatant#spendMovement` keeps. Nothing is *has not moved*: out of
 *   a fight there are no turns and the gate fails closed.
 * @param {{creatureType?: string, acted?: boolean}} [state.target]  what the
 *   blow is aimed at
 * @returns {boolean}
 */
export function gateHolds(gates, state = {}) {
  if (gates === null || gates === undefined) return true;
  if (!Array.isArray(gates)) return false;
  return gates.every(clause => oneGateHolds(clause, state));
}

/** One clause of the gate. Every failure fails closed. */
function oneGateHolds(clause, state) {
  const kind = clause?.kind ?? null;
  // AN ENTRY IN THE LIST IS A GATE SOMEBODY WROTE. One whose kind cannot be
  // read is withheld rather than ignored; an ungated Signature carries an
  // EMPTY list and never reaches here at all.
  if (!kind || !(kind in AZEROTH.signatureGates)) return false;
  const wanted = gateValues(clause.value).map(v => v.toLowerCase());

  // ONE implementation of below-half, shared with the creature passives, so
  // the two cannot disagree about what half a Health pool is.
  if (kind === "belowHalfHealth") return whenHolds("belowHalfHealth", { health: state.health ?? null });
  // *At or above half Health* (The Black Hand Raised, D-911): the same one
  // reading of half a pool, the other side of it - and no snapshot fails closed.
  if (kind === "atOrAboveHalfHealth") {
    const h = state.health ?? null;
    if (!h || !Number.isFinite(Number(h.max)) || Number(h.max) <= 0) return false;
    return !whenHolds("belowHalfHealth", { health: h });
  }
  // *While hidden from that creature* (Hexed Fang, D-911): only the attack door
  // knows, and hands `hidden: true`; everything else fails closed.
  if (kind === "hidden") return state.hidden === true;

  // *While you have not moved this turn* — the feet the turn has spent, which
  // `AzerothCombatant#spendMovement` already records (D-659). No number is no
  // snapshot, and it fails closed like every other bearer gate.
  if (kind === "hasNotMoved") return Number.isFinite(state.moved) && state.moved <= 0;

  // *Against any creature that has not yet acted this combat* — the target's
  // own flag, so with nothing to strike there is nothing to judge.
  if (kind === "targetHasNotActed") return state.target?.acted === false;

  // *If the blow was an Off-Hand Attack or you moved earlier in the turn*
  // (Dal'Rend's Sacred Charge, D-696). A fact about the blow being made, which
  // only the attack door knows, so every other caller fails it closed - and
  // that is right: the Momentum this gates exists at a blow or not at all.
  if (kind === "blow") {
    const held = Array.isArray(state.blow) ? state.blow.map(v => String(v).toLowerCase()) : null;
    if (!held) return false;
    return wanted.some(w => held.includes(w));
  }

  if (kind === "corruption") {
    // A MAP OF TRACK TO SCORE, or no snapshot at all. Anything else is a
    // caller that did not build one and fails closed with the rest of the
    // bearer gates: an NPC's `system.corruption` is the track it EXPOSES
    // (14 §1), a bare string, and indexing a string by `fel` reads undefined
    // on every track — which came back as 0 and passed a `<track> 0` floor.
    const held = state.corruption;
    if (!held || typeof held !== "object" || Array.isArray(held)) return false;
    // ANY of the pairs, as with every other value: *Fel 1 or more*.
    return gateValues(clause.value).some(part => {
      const floor = corruptionFloor(part);
      return floor !== null && (Number(held[floor.track]) || 0) >= floor.floor;
    });
  }

  if (kind === "form") {
    // *A Druid wearing it keeps its Armor Points and its Signature in any form
    // they take* names no form, so an empty value is any form at all. The
    // bearer's forms are a LIST since D-769 - Chimera wears two - and a named
    // gate holds where ANY of them is the one named (the review: `String()` on
    // the list read *Black Bear,Raptor* and matched neither).
    const form = state.form ?? null;
    const worn = (Array.isArray(form) ? form : [form]).filter(f => f === true || (typeof f === "string" && f !== ""));
    if (!worn.length) return false;
    if (!wanted.length) return true;
    return worn.some(f => typeof f === "string" && wanted.includes(f.toLowerCase()));
  }

  if (kind === "creatureType") {
    const type = state.target?.creatureType ?? null;
    if (!type) return false;
    return wanted.includes(String(type).toLowerCase());
  }

  const held = { class: state.classes, race: state.race, faction: state.factions, school: state.schools }[kind];
  if (held === null || held === undefined) return false;
  const names = (Array.isArray(held) ? held : [held]).map(n => String(n).toLowerCase());
  // An empty `wanted` is a gate whose value could not be read: it fails closed.
  return wanted.some(w => names.includes(w));
}

/**
 * Whether an on-hit row does anything. A row that carries only an `sl` is a
 * threshold with nothing behind it and must not join the card.
 */
function firesOnHit(onHit) {
  if (!onHit) return false;
  return Boolean(onHit.damage?.amount || onHit.condition?.id || onHit.bane || onHit.sunder
    || onHit.momentum || onHit.heal || onHit.mana || onHit.push || onHit.arc?.targets || onHit.arc?.all === true
    || onHit.noHealing === true
    || (onHit.conditions ?? []).some(c => c?.id));
}

/**
 * An on-hit row with what only the TARGET can answer filled in (D-696).
 *
 * Perdition's Blade deals *additional damage equal to that creature's Scorched
 * value*, so the number is not on the item at all: it is `per` points for each
 * point of the condition the creature struck is carrying. The arithmetic is
 * here, in the pure rule, and the caller hands over the snapshot — which is the
 * same seam every other target-side clause already uses (`creatureType`,
 * `acted`).
 *
 * **A creature carrying none of it contributes 0 and the row does not fire**,
 * which is what makes *against a Scorched creature* true without a second gate
 * naming the condition a third time.
 *
 * @param {object} onHit   the descriptor's own row
 * @param {{conditions?: Record<string, number>}|null} target
 */
function resolveOnHit(onHit, target = null) {
  const from = onHit?.damageFromCondition ?? null;
  if (!from?.id || !from?.per) return onHit;
  const value = Math.max(0, Math.trunc(Number(target?.conditions?.[from.id])) || 0);
  const extra = value * from.per;
  if (!extra) return onHit;
  return { ...onHit, damage: { ...onHit.damage, amount: (onHit.damage?.amount ?? 0) + extra } };
}

/**
 * Whether a blow that lands on the bearer answers. The thorns damage and the
 * condition left on the attacker are each enough on their own.
 */
function firesWhenStruck(whenStruck) {
  if (!whenStruck) return false;
  return Boolean(whenStruck.damage?.amount || whenStruck.condition?.id);
}

/** Whether a kill does anything. The distance alone is not an effect. */
function firesOnKill(onKill) {
  if (!onKill) return false;
  return Boolean(onKill.bane || onKill.condition?.id);
}

/**
 * An item's Signature PROSE as one line of plain text, for a chat card.
 *
 * `rules/bestiary.mjs#proseFromHtml` is the other direction — it renders back
 * to the markdown 14 is written in, bold runs and all — and a `**` on a card
 * is a literal pair of asterisks. This strips instead.
 */
/**
 * THE SENTENCE, whichever shape the document keeps it in.
 *
 * `system.signature` is a string on a weapon, a suit and a piece of gear —
 * `forged()`'s `HTMLField` — and a PAIR on a career, `{name, description}`,
 * because 03 §5 names the capability as well as stating it. Every reader here
 * and in `dice/workflows.mjs` wants the same thing out of both, and a bare
 * `item.system.signature` handed to `enrich` on a career prints
 * `[object Object]` on the card rather than failing (D-610's shape).
 *
 * @param {{signature?: any, system?: {signature?: any}}} item
 * @returns {string}
 */
export function signatureProse(item) {
  const held = item?.signature ?? item?.system?.signature ?? "";
  if (typeof held === "string") return held;
  return typeof held?.description === "string" ? held.description : "";
}

function plainText(html) {
  return String(html ?? "")
    // A SPACE and not nothing: `is <strong>Slowed</strong>and` would otherwise
    // read as one word. The space before a full stop that leaves behind is
    // taken back on the next line - it is on a card a player reads.
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/**
 * Everything the Signatures on the EQUIPPED things add up to, with each gate
 * judged against the state handed in. Pure: the caller reads the actor.
 *
 * `passiveEffects`' shape, and its rule — **read on every kind**, because a
 * Signature that is pressed may also grant while it is worn. It differs from
 * the creature case in one place, deliberately: a creature's refusals are what
 * it IS and no gate reaches them, while an item's are conditional on wearing
 * it, so a gated refusal is gated here.
 *
 * An `onHit` row comes back in `weapon-traits.mjs#weaponTraitEffects`' own
 * `effects[]` shape — `{key, name, sl, …}` — so `firedTraits` fires it by
 * Success Level with no reshaping. **`sl` null becomes 0**, since `firedTraits`
 * reads a missing threshold as `Infinity` and *on a hit* would never fire.
 * `onKill` and `whenStruck` come back as rows of their own, named the same way.
 *
 * How the scalars added up, and why each is what it is:
 *
 * - **`criticalOn` and `damageRatingSet` take the BEST, never a sum.** Two
 *   things that each widen the Critical Injury do not make a third number, and
 *   two that each set a Damage Rating do not add: the higher set wins.
 * - **`damageMultiplier` takes the LARGEST, and multipliers do not compound.**
 *   Two items that each double are not a quadrupling; 08 §20 has one item
 *   doing it and the honest answer to a second is the bigger of the two.
 * - **`healingBonus`, `spellDamage`, `spellCost` and `corruptionReduction`
 *   SUM**, each by its own school or track, because those are bonuses and
 *   bonuses add. A Mana discount that took the BEST rather than the sum would
 *   make a second item naming the same school worth nothing, which is not what
 *   two suffixes of the same family do anywhere else in this system; the floor
 *   at nothing is `castSpell`'s own `Math.max(0, …)`.
 * - **`cancelsBane` is a list.** Two suits cancelling two different Banes
 *   cancel both.
 * - **`damageRating` is the ONE scalar family summed here**, because it is the
 *   one the ATTACK reads: 08 §20's three gated grants and eleven Classic finds
 *   write `+1`/`+2 Damage Rating`, and `attackWithDialog` adds it to the blow
 *   with the creature struck in the snapshot. It is the same sentence through
 *   the same `parseGrant` — the sentences travel on `grants` as well, for
 *   `grantsOn` to hand to the standing readers — and **`grantsFor` drops this
 *   one on purpose**, so nothing counts it twice.
 *
 *   The OTHER scalars are the mirror of that (2026-09-10): `grantsFor` sums
 *   `+N Defense`, `+N Attack`, `+N Speed` and `+N Initiative` for the standing
 *   readers and nothing sums them here, because none of them is a property of
 *   a blow. One rule, one summer, each way round.
 *
 * **A WEAPON'S SIGNATURE REACHES ITS OWN BLOW AND NO OTHER.** *You inflict a
 * Critical Injury on a natural 19* on the sword in your left hand is about
 * that sword; Judgment Armor's identical sentence is about the wearer. So
 * `weaponId` names the weapon being swung and every OTHER equipped weapon is
 * skipped, while armor and gear always count. With no `weaponId` — the
 * standing pass, the tick, the refusals — everything equipped counts.
 *
 * @param {Array<{name?: string, id?: string, type?: string, equipped?: boolean,
 *   signature?: string, signatureEffect?: object, system?: object}>} items
 * @param {object} state  as `gateHolds` takes it
 * @param {{weaponId?: string|null}} [o]
 * @returns {{grants: string[], damageRating: number, refuses: string[],
 *   conditionImmunities: string[], criticalOn: number|null,
 *   damageMultiplier: number|null,
 *   damageRatingSet: number|null, spellDamage: Record<string, number>,
 *   spellCost: Record<string, number>,
 *   healingBonus: number, corruptionReduction: Record<string, number>,
 *   cancelsBane: string[], onHit: object[], onKill: object[],
 *   whenStruck: object[], tick: {health: number, mana: number}}}
 */
export function signatureEffects(items = [], state = {}, { weaponId = null } = {}) {
  const out = {
    grants: [], damageRating: 0, refuses: [], conditionImmunities: [],
    criticalOn: null, damageMultiplier: null, damageRatingSet: null,
    spellDamage: {},
    // Kept out of the aggregate school bonus: these need one chosen recipient
    // and an attribute snapshot at cast commitment, not a bonus to every hit.
    chosenSpellDamage: [],
    chosenSpellHealing: [],
    firstParryTest: [],
    weaponKillReward: [],
    scalingHitDamage: [],
    // What a school's spells cost, LESS, keyed by school (the lead,
    // 2026-09-14). `castSpell` reads it by the spell's own school beside
    // `empowers[name].cost`, and both come off the Mana together.
    spellCost: {},
    // The floor a school's discount stops at, by school (Atiesh; D-910), read
    // by `casting.mjs#spellManaCost`.
    spellCostFloor: {},
    healingBonus: 0, corruptionReduction: {}, cancelsBane: [],
    // What a Block takes off ON TOP of 06 §6's four (Drillborer Disk, D-693).
    blockBonus: 0,
    // Armor Points a tier (Stormrage Raiment, D-696). SUMMED, like every other
    // bonus - the multiplication by the bearer's tier belongs to the model,
    // which is the only place a tier is known.
    armorPointsPerTier: 0,
    // What stands on somebody ELSE (the Bulwark of Tyr's Hand, D-696), each
    // with the item that laid it, because `effects/auras.mjs` keys its diff on
    // the bearer and the item together.
    auras: [],
    // ONE NAMED ABILITY, IMPROVED (D-698), keyed by 02/04/07's own name and
    // summed, so two items naming the same spell add up the way two Spellpower
    // suffixes do. `castSpell` and `useFeature` are the two doors.
    empowers: {},
    // What every creature the bearer has bound gains (D-698), each with the
    // item that gave it, because `syncBoundFor` diffs the effects by source.
    bound: [],
    // WHAT HOLDING IT CHARGES AT A LONG REST (D-910): one Test each, in the
    // order the items and their runs are written. `AzerothActor#longRest`
    // offers each through `workflows.corruptionExposure`.
    exposures: [],
    // THE LEGENDARY READERS (D-911), each read by one door:
    // the Ward floor by school, the highest any part names (`afterFinalPhase`);
    wardFloor: {},
    // the parts that make a fall harmless, by item name (`applyDamage`);
    noFallDamage: [],
    // whether this weapon's Reload is ignored (`effects/reload-state.mjs`);
    ignoresReload: false,
    // the damage types whose Immune this weapon's blow passes at half;
    pastImmune: [],
    // Sand the first failed Resist each round gives (`effects/sand.mjs`);
    sandOnFail: 0,
    // a pool gained the first time each round an attack hurts the bearer;
    poolOnHurt: [],
    // what a Block does beyond its four (`applications/actions.mjs#blockNow`);
    onBlock: [],
    // Health a laid heal tick of the bearer's spell restores more;
    tickHealBonus: 0,
    // conditions refused from a creature of one type (`effects/inflict.mjs`);
    refusesFrom: [],
    // whether a Boss may ignore the bearer's hidden Critical Injury;
    bossCannotIgnore: [],
    // the Ward a damaging school gives (`AzerothActor#applyDamage`);
    adaptiveWard: 0,
    // temporary Health a kill gives, by the tier's multiple and the weight classes;
    killTemp: [],
    // Phase B2 (D-912): what halves a breath, the attacker's Banes off the target,
    // a shot of nothing, a Resist's Banes, a free spell, Touch healing's reach,
    // Second Ordination, a spell's damage Test, a size step and the second Reaction.
    breathHalf: [], attackerBane: [], phantomShot: null, resistBane: [], freeSpell: [],
    touchHealingFeet: 0, ordination: [], spellDamageTest: [], sizeStep: 0, secondReaction: [],
    onHit: [], onKill: [], whenStruck: [], tick: { health: 0, mana: 0 }
  };
  for (const item of items) {
    // A thing in the pack is not worn (08 §6), exactly as `grantsFor` has it.
    const equipped = item?.equipped ?? item?.system?.equipped ?? false;
    if (!equipped) continue;
    if (!signatureAugmentAllowed(item,items,state.classes ?? [])) continue;
    // Another weapon in the other hand is not the one making this attack.
    const type = item?.type ?? null;
    if (weaponId !== null && type === "weapon" && (item?.id ?? null) !== weaponId) continue;
    const signature = signatureEffectOf(item);
    if (!signature) continue;
    const name = item?.name ?? "";
    // The item's own sentence, for a card that would otherwise print one
    // generic line for all 288 of them - and on a Legendary THE RUN'S OWN
    // (D-910), so Wrath of Ragnaros's card prints Wrath of Ragnaros and not
    // all four of Sulfuras's runs.
    const prose = signatureProse(item);
    const ctx = part => ({ item, name, text: plainText(runProse(prose, part?.label ?? "")), state });

    // THE TRUNK, under the trunk's own gate.
    if (gateHolds(signature.gates, state)) applyPart(out, signature, ctx(signature));
    // AND EVERY GATED SENTENCE, under ITS OWN (D-722). The lead, 2026-09-14:
    // a gate covers *only its own sentence*. The aggregate's shape does not
    // move an inch — twenty-odd readers downstream see the same object they
    // always did — because a branch is folded into it by the same function the
    // trunk goes through.
    for (const branch of signature.gated ?? []) {
      if (gateHolds(branch?.gates ?? [], state)) applyPart(out, branch, ctx(branch));
    }
  }
  return out;
}

/**
 * ONE PART OF A SIGNATURE, FOLDED INTO THE AGGREGATE (D-722).
 *
 * The trunk and every gated branch go through this, so the sums, the bests and
 * the row shapes are stated once. It was the body of `signatureEffects`' loop
 * and is unchanged line for line; what moved is the gate, which is judged by
 * the caller because the trunk's list and a branch's are different lists.
 *
 * @param {object} out    the aggregate being built
 * @param {object} part   a whole descriptor or one of its `gated` branches
 * @param {{item: object, name: string, text: string, state: object}} ctx
 */
function applyPart(out, part, { item, name, text, state }) {
  // Every sentence here has already been through `parseGrant` — that is what
  // `cleanSignature` drops an unreadable one at — so these are handed on as
  // 08 §6 sentences for `grantsOn` and `grantsFor` to read, one door and not
  // a second parser (D-681).
  out.grants.push(...part.grants);
  for (const sentence of part.grants) {
    const parsed = parseGrant(sentence);
    if (parsed?.kind === "damageRating") out.damageRating += parsed.points;
  }
  for (const id of part.refuses) {
    if (!out.refuses.includes(id)) out.refuses.push(id);
    if (id in AZEROTH.conditions && !out.conditionImmunities.includes(id)) out.conditionImmunities.push(id);
  }
  if (part.criticalOn !== null) {
    // The LOWER of the two: two things that each widen the Critical Injury
    // do not stack into a third number.
    out.criticalOn = out.criticalOn === null ? part.criticalOn : Math.min(out.criticalOn, part.criticalOn);
  }
  if (part.damageMultiplier !== null) {
    out.damageMultiplier = Math.max(out.damageMultiplier ?? 0, part.damageMultiplier);
  }
  if (part.damageRatingSet !== null) {
    out.damageRatingSet = Math.max(out.damageRatingSet ?? 0, part.damageRatingSet);
  }
  if (part.spellDamage.school && part.spellDamage.amount) {
    const school = part.spellDamage.school;
    out.spellDamage[school] = (out.spellDamage[school] ?? 0) + part.spellDamage.amount;
  }
  if (part.chosenSpellHealing === true) out.chosenSpellHealing.push({
    itemId:item.id ?? item._id ?? null, identifier:item.system?.identifier ?? item.identifier ?? null, name
  });
  if (part.firstParryTest === true) out.firstParryTest.push({
    itemId:item.id ?? item._id ?? null, identifier:item.system?.identifier ?? item.identifier ?? null, name
  });
  if (part.weaponKillReward === true) out.weaponKillReward.push({
    itemId:item.id ?? item._id ?? null, identifier:item.system?.identifier ?? item.identifier ?? null, name
  });
  if (part.scalingHitDamage === true) out.scalingHitDamage.push({
    itemId:item.id ?? item._id ?? null, identifier:item.system?.identifier ?? item.identifier ?? null, name
  });
  if (part.chosenSpellDamage?.school && (part.chosenSpellDamage.attribute || part.chosenSpellDamage.skill || part.chosenSpellDamage.casting)) {
    out.chosenSpellDamage.push({
      itemId: item.id ?? item._id ?? null,
      identifier: item.system?.identifier ?? item.identifier ?? null,
      name, school: part.chosenSpellDamage.school,
      ...(part.chosenSpellDamage.attribute ? {attribute:part.chosenSpellDamage.attribute} : {}),
      ...(part.chosenSpellDamage.skill ? {skill:part.chosenSpellDamage.skill} : {}),
      ...(part.chosenSpellDamage.casting ? {casting:true} : {})
    });
  }
  // The Mana off a whole school's spells, summed by school — `spellDamage`'s
  // exact mirror one line up, because the two are one sentence apart in the
  // prose and a second shape here would be a second thing to keep in step.
  if (part.spellCost?.school && part.spellCost?.amount) {
    const school = part.spellCost.school;
    out.spellCost[school] = (out.spellCost[school] ?? 0) + part.spellCost.amount;
    // The HIGHEST floor any discount on the school names (D-910).
    if (part.spellCost.minimum) out.spellCostFloor[school] = Math.max(out.spellCostFloor[school] ?? 0, part.spellCost.minimum);
  }
  out.healingBonus += part.healingBonus ?? 0;
  if (part.corruptionReduction.track && part.corruptionReduction.amount) {
    const track = part.corruptionReduction.track;
    out.corruptionReduction[track] = (out.corruptionReduction[track] ?? 0) + part.corruptionReduction.amount;
  }
  // A Long Rest's price (The Black Empire's Price, D-910): only a whole charge
  // is one, and a press's own charge is never here - it is offered when pressed.
  const gain = part.corruptionGain ?? null;
  if (gain?.at === "longRest" && gain.track && gain.amount && gain.resilience && gain.dc) {
    out.exposures.push({
      key: item?.id ?? item?.uuid ?? name, name, label: part.label ?? "",
      track: gain.track, amount: gain.amount, resilience: gain.resilience, dc: gain.dc
    });
  }
  if (part.cancelsBane && !out.cancelsBane.includes(part.cancelsBane)) {
    out.cancelsBane.push(part.cancelsBane);
  }
  out.blockBonus += part.blockBonus ?? 0;
  out.armorPointsPerTier += part.armorPointsPerTier ?? 0;
  if (auraStands(part.aura)) {
    // The KEY is the item, so a second preparation finds the same effect and
    // the diff leaves it alone; the name is what the effect is called on the
    // ally's own sheet.
    // `label` is the run that lays it (D-910), so the writer reads THAT run's
    // words for *other than you* and not every run the item prints.
    out.auras.push({ key: item?.id ?? item?.uuid ?? name, name, label: part.label ?? "", ...part.aura });
  }
  // One named ability improved (D-698). Summed by name, so a second item
  // naming the same spell adds to the first.
  const empowered = part.empowers ?? {};
  if (empowered.name && (empowered.damageRating || empowered.heal || empowered.cost)) {
    const held = out.empowers[empowered.name] ?? { damageRating: 0, heal: 0, cost: 0, sources: [] };
    held.damageRating += empowered.damageRating ?? 0;
    held.heal += empowered.heal ?? 0;
    held.cost += empowered.cost ?? 0;
    held.sources.push(name);
    out.empowers[empowered.name] = held;
  }
  if (part.bound?.damage) {
    // *A DEMON bound to a Warlock* (D-911): the type the bond reads, or null for every one.
    out.bound.push({ key: item?.id ?? item?.uuid ?? name, name, damage: part.bound.damage, ...(part.bound.creatureType ? { creatureType: part.bound.creatureType } : {}) });
  }
  // The Legendary readers (D-911).
  applyLegendary(out, part, { item, name });
  // The target answers the parts of the row only it can (Perdition's Blade).
  const hit = resolveOnHit(part.onHit, state.target ?? null);
  if (firesOnHit(hit)) {
    out.onHit.push({ key: "signature", name, text, ...hit, sl: hit.sl ?? 0 });
    // **ONE ROW A CONDITION** (D-698). The card draws one Inflict button off
    // a fired row, so a blow landing two conditions needs two rows; both
    // carry the item's own sentence, which names both. One item in 2,115
    // writes it, and a second grammar on the card would be the more
    // expensive half of that trade.
    for (const extra of hit.conditions ?? []) {
      if (!extra?.id) continue;
      out.onHit.push({
        key: "signature", name, text, sl: hit.sl ?? 0,
        condition: { ...extra }
      });
    }
  }
  if (firesOnKill(part.onKill)) out.onKill.push({ key: "signature", name, text, ...part.onKill });
  if (firesWhenStruck(part.whenStruck)) {
    out.whenStruck.push({
      key: "signature", name, text,
      damage: { ...part.whenStruck.damage },
      condition: { ...part.whenStruck.condition }
    });
  }
  out.tick.health += part.tick.health ?? 0;
  out.tick.mana += part.tick.mana ?? 0;
  return out;
}

/**
 * **THE LEGENDARY READERS' PART OF THE AGGREGATE** (D-911). Every one is a key
 * a run of 08 §20 writes and ONE door reads, and each sums, takes the best or
 * lists exactly as the family beside it in `applyPart` does:
 *
 * - a Ward FLOOR takes the higher per school (*unless you already have more*
 *   is a floor, never a sum);
 * - a pool gain, a Block's answer, a kill's temporary Health and a refusal by
 *   source are LISTS, each with the item's name, because the door says whose;
 * - Sand, Ward and a heal tick's extra SUM, as bonuses do everywhere here.
 *
 * Pure, and folded through the same gate the trunk and every branch go through.
 */
function applyLegendary(out, part, { item, name }) {
  const ward = part.wardFloor?.ward ?? null;
  if (ward) {
    const schools = part.wardFloor.schools?.length ? part.wardFloor.schools : Object.keys(AZEROTH.schools);
    for (const school of schools) out.wardFloor[school] = Math.max(out.wardFloor[school] ?? 0, ward);
  }
  if (part.noFallDamage === true && !out.noFallDamage.includes(name)) out.noFallDamage.push(name);
  if (part.ignoresReload === true) out.ignoresReload = true;
  if (part.pastImmune && !out.pastImmune.includes(part.pastImmune)) out.pastImmune.push(part.pastImmune);
  out.sandOnFail += part.sandOnFail ?? 0;
  if (part.poolOnHurt?.pool && part.poolOnHurt?.amount) out.poolOnHurt.push({ name, pool: part.poolOnHurt.pool, amount: part.poolOnHurt.amount });
  const block = part.onBlock ?? null;
  if ((block?.pool?.pool && block?.pool?.amount) || block?.condition?.id) {
    out.onBlock.push({
      name, label: part.label ?? "",
      ...(block.pool?.pool && block.pool?.amount ? { pool: { pool: block.pool.pool, amount: block.pool.amount } } : {}),
      ...(block.condition?.id ? { condition: { id: block.condition.id, value: block.condition.value ?? null, until: block.condition.until ?? null } } : {}),
      melee: block.melee === true
    });
  }
  out.tickHealBonus += part.tickHealBonus ?? 0;
  for (const r of part.refusesFrom ?? []) {
    if (r?.id && r?.creatureType) out.refusesFrom.push({ id: r.id, creatureType: r.creatureType, name });
  }
  if (part.bossCannotIgnore === true) out.bossCannotIgnore.push(name);
  out.adaptiveWard = Math.max(out.adaptiveWard, part.adaptiveWard ?? 0);
  if (part.killTemp?.perTier) {
    out.killTemp.push({ name, perTier: part.killTemp.perTier, weightClasses: [...(part.killTemp.weightClasses ?? [])] });
  }
  // Phase B2 (D-912).
  if (part.breathHalf === true && !out.breathHalf.includes(name)) out.breathHalf.push(name);
  if (part.attackerBane?.faction && part.attackerBane?.banes) out.attackerBane.push({ name, faction: part.attackerBane.faction, banes: part.attackerBane.banes });
  if (part.phantomShot?.rating !== null && part.phantomShot?.rating !== undefined && part.phantomShot?.type) {
    if (!out.phantomShot || part.phantomShot.rating > out.phantomShot.rating) out.phantomShot = { name, rating: part.phantomShot.rating, type: part.phantomShot.type };
  }
  const rb = part.resistBane ?? null;
  if (rb?.banes && (rb.school || rb.name)) {
    out.resistBane.push({ name, label: part.label ?? "", school: rb.school ?? null, spell: rb.name || null, creatureType: rb.creatureType ?? null, banes: rb.banes, per: rb.per ?? null });
  }
  if (part.freeSpell && !out.freeSpell.includes(part.freeSpell)) out.freeSpell.push(part.freeSpell);
  out.touchHealingFeet = Math.max(out.touchHealingFeet, part.touchHealingFeet ?? 0);
  if (part.ordination === true && !out.ordination.includes(name)) out.ordination.push(name);
  const sdt = part.spellDamageTest ?? null;
  if (sdt?.school && sdt?.resilience && sdt?.onFail?.id) {
    out.spellDamageTest.push({ name, label: part.label ?? "", school: sdt.school, resilience: sdt.resilience, onFail: { id: sdt.onFail.id, value: sdt.onFail.value ?? null, until: sdt.onFail.until ?? null } });
  }
  out.sizeStep += part.sizeStep ?? 0;
  for (const n of part.secondReaction ?? []) if (!out.secondReaction.includes(n)) out.secondReaction.push(n);
}

/** The turn budget's key Ten Thousand Years of Practice's second Reaction spends (D-912), reset at the Mage's own turn start (D-913). */
export const SECOND_REACTION_MARK = "secondReaction";

/**
 * **WHETHER A USE MAY TAKE THE SECOND REACTION** (Ten Thousand Years of Practice, D-912:
 * *spends it only on Blink or Counterspell*): the use's name among the Signature's, case
 * and spacing forgiven.
 *
 * @param {string[]} names  `signatureEffects().secondReaction`
 * @param {string} used     the feature's name
 */
export function secondReactionHolds(names = [], used = "") {
  const flat = v => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return Boolean(used) && (names ?? []).map(flat).includes(flat(used));
}

/**
 * **WHETHER A BLOW'S SOURCE IS A BREATH WEAPON** (Foror's Lesson; the lead, on O-319:
 * *"Abilities and spells named Breath"*; D-912): a creature ability, a Boss Action or
 * a spell whose name holds *Breath*, and 02's Chromatic Champion's Breath feature -
 * read off the card's own record (its title, its feature key, its spell's name).
 *
 * @param {{title?: string|null, featureKey?: string|null, spellName?: string|null}} card
 * @returns {boolean}
 */
export function breathSource({ title = null, featureKey = null, spellName = null } = {}) {
  return [title, featureKey, spellName].some(v => typeof v === "string" && /breath/i.test(v));
}

/**
 * **HALF OF A BREATH, ROUNDED DOWN** (Foror's Lesson, D-912), or the whole where the
 * bearer holds nothing that halves it.
 */
export function breathTaken(amount, { halves = false } = {}) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  return halves ? Math.floor(n / 2) : n;
}

/**
 * **THE BANES AN ATTACKER TAKES OFF WHAT ITS TARGET WEARS** (Scarlet Reckoning,
 * D-912: *A member of the Scarlet Crusade takes a Bane on every Attack Test it makes
 * against you*): the target's rows whose faction the attacker belongs to, summed.
 *
 * @param {Array<{name: string, faction: string, banes: number}>} rows  the TARGET's
 * @param {string[]} attackerFactions
 * @returns {{banes: number, names: string[]}}
 */
export function attackerBanesFrom(rows = [], attackerFactions = []) {
  const held = (attackerFactions ?? []).map(f => String(f).toLowerCase());
  const hit = (rows ?? []).filter(r => r?.faction && held.includes(String(r.faction).toLowerCase()));
  return { banes: hit.reduce((n, r) => n + (Math.trunc(Number(r.banes)) || 0), 0), names: [...new Set(hit.map(r => r.name))] };
}

/**
 * **THE BANES A SPELL'S RESIST TAKES OFF ITS CASTER'S ITEMS** (The Blade Hungers, The
 * Fifth Pylon; D-912): the rows a cast of this school or this name matches, at the
 * cast; the creature-type half is judged at the Resist, off the resister.
 *
 * @param {Array<object>} rows  the caster's `resistBane`
 * @param {{school?: string|null, name?: string}} spell
 * @returns {Array<{name: string, banes: number, creatureType: string|null, per: string|null}>}
 */
export function resistBanesForCast(rows = [], { school = null, name = "" } = {}) {
  const n = String(name ?? "").toLowerCase();
  return (rows ?? []).filter(r => (r.spell ? String(r.spell).toLowerCase() === n : true) && (r.school ? r.school === school : true))
    .map(r => ({ name: r.label || r.name, banes: r.banes, creatureType: r.creatureType ?? null, per: r.per ?? null }));
}

/**
 * The Banes one resister takes off a card's recorded rows (D-912): a row naming a
 * creature type reaches that type alone.
 *
 * @param {Array<{name: string, banes: number, creatureType?: string|null}>} rows
 * @param {string|null} creatureType  the resister's, lower case
 * @returns {{banes: number, names: string[]}|null}
 */
export function resistBanesOn(rows = [], creatureType = null) {
  const type = typeof creatureType === "string" ? creatureType.toLowerCase().split(/\s|\(/)[0] : null;
  const hit = (rows ?? []).filter(r => !r?.creatureType || r.creatureType === type);
  const banes = hit.reduce((n, r) => n + (Math.trunc(Number(r.banes)) || 0), 0);
  return banes > 0 ? { banes, names: hit.map(r => r.name) } : null;
}

/**
 * **05's LADDER, STEPPED** (The King's Frame, D-912: *counts as one size larger for
 * what it carries and for resisting being moved*): the size `step` rungs up, never
 * past Enormous. The caller decides what the stepped size is read for.
 *
 * @param {string} size
 * @param {number} step
 * @param {string[]} sizes  05's six rungs, smallest first
 * @returns {string}
 */
export function steppedSize(size, step = 0, sizes = ["tiny", "small", "medium", "large", "huge", "enormous"]) {
  const at = sizes.indexOf(String(size ?? "").toLowerCase());
  const n = Math.max(0, Math.trunc(Number(step)) || 0);
  if (at < 0 || !n) return size;
  return sizes[Math.min(sizes.length - 1, at + n)];
}

/**
 * **WHICH OTHER CREATURES AN ARC REACHES** (Thunderfury; the lead, on O-319: *"Automate
 * the arc and the Fury"*; Magma Shot; D-912). Pure: the caller measured each creature's
 * distance from the creature struck. `all` takes every one in reach (Magma Shot's *every
 * other creature*); otherwise the `targets` nearest, enemies of the striker before the
 * rest (MY READING, D-912), ties by id - never the creature struck, never the striker.
 *
 * @param {Array<{id: string, feet: number|null, enemy?: boolean, self?: boolean, struck?: boolean}>} creatures
 * @param {{targets?: number|null, feet?: number|null, all?: boolean}} arc
 * @returns {string[]}  the ids reached
 */
export function arcPicks(creatures = [], { targets = 1, feet = 0, all = false } = {}) {
  const reach = Number(feet) || 0;
  // Never the creature struck and never the striker (D-913: an arc never reaches the one
  // who made it, Magma Shot's *every other creature* included).
  const near = (creatures ?? []).filter(c => c?.id && !c.struck && !c.self && typeof c.feet === "number" && c.feet <= reach + 0.01);
  if (all === true) return near.map(c => c.id);
  const count = Math.max(0, Math.trunc(Number(targets)) || 0);
  return near
    .sort((a, b) => (a.enemy === b.enemy ? 0 : a.enemy ? -1 : 1) || a.feet - b.feet || String(a.id).localeCompare(String(b.id)))
    .slice(0, count).map(c => c.id);
}

/** The effect flag Uther's Stand lays: no damage while it stands (D-911). */
export const SIGNATURE_SHIELD_FLAG = "signatureShield";

/**
 * The mark a condition laid by Emerald Slumber carries: the damage door ends it
 * (D-911, *until it takes damage*). `effects/inflict.mjs` keeps it as a mark.
 */
export const ENDS_ON_DAMAGE_FLAG = "endsOnDamage";

/** The actor flag Adaptive Scales keeps its once-a-round in (D-911). */
export const ADAPTIVE_WARD_FLAG = "adaptiveWardRound";

/** The effect flag Blood of Mannoroth lays: Damage Rating on ONE weapon's blows (D-911). */
export const SIGNATURE_WEAPON_FLAG = "signatureWeapon";

/**
 * **WHAT A PRESSED WEAPON BONUS ADDS TO THIS BLOW** (Blood of Mannoroth, D-911):
 * the sum the bearer's ACTIVE effects flagged for this weapon carry, with the
 * names that gave it. Pure: the caller hands the effects' flags.
 *
 * @param {Array<{active?: boolean, flags?: object}>} effects
 * @param {string|null} weaponId
 * @returns {{damage: number, sources: string[]}}
 */
export function pressedWeaponBonus(effects = [], weaponId = null) {
  let damage = 0;
  const sources = [];
  if (!weaponId) return { damage, sources };
  for (const e of effects ?? []) {
    if (e?.active === false || e?.disabled === true) continue;
    const f = e?.flags?.["azeroth-rpg"]?.[SIGNATURE_WEAPON_FLAG] ?? null;
    if (!f || f.itemId !== weaponId) continue;
    const n = Math.max(0, Math.trunc(Number(f.damage)) || 0);
    if (!n) continue;
    damage += n;
    if (f.source) sources.push(String(f.source));
  }
  return { damage, sources };
}

/**
 * **THE SIGNATURE DC THE CONDITIONS A BLOW LANDS CARRY** (Unholy Grasp's *makes
 * its Test to break free against your Signature DC*, Soulflayer's Venom's *makes
 * its Test to shed it against your Signature DC*; D-911): off the fired rows that
 * say so, the attack card's `inflictEscapes` - 07's escape on the condition's own
 * effect (`rules/escapes.mjs`), A1's *An action and a Reflex Resilience Test ...
 * or at the DC the source names* for Entangled - and its `inflictShedDc` for
 * Poisoned (A1: *against the DC of the poison*). Pure.
 *
 * @param {Array<object>} fired  the card's fired rows
 * @param {{dc?: number|null, by?: string|null}} o  the bearer's Signature DC and uuid
 * @returns {{escapes: Record<string, object>, shed: Record<string, {dc: number, source: string}>}}
 */
export function signatureConditionMarks(fired = [], { dc = null, by = null } = {}) {
  const out = { escapes: {}, shed: {} };
  const n = Math.trunc(Number(dc));
  if (!(n > 0)) return out;
  for (const f of fired ?? []) {
    const id = f?.signatureDC === true ? f.condition?.id ?? null : null;
    if (!id) continue;
    if (id === "poisoned") out.shed.poisoned = { dc: n, source: String(f.name ?? "") };
    else if (SIGNATURE_ESCAPES[id]) {
      out.escapes[id] = { condition: id, ...SIGNATURE_ESCAPES[id], dc: n, banes: 0, talents: [], by: by ?? null, source: String(f.name ?? ""), cast: null };
    }
  }
  return out;
}

/** A1's own Test to end each condition a Signature's DC may ride (D-911). */
export const SIGNATURE_ESCAPES = Object.freeze({
  // *An action and a Reflex Resilience Test at DC 12, or at the DC the source names.*
  entangled: Object.freeze({ on: "action", resilience: "reflex" })
});

/**
 * **THE CREATURES A PRESS'S ATTACK TESTS ARE AIMED AT** (D-911): `same` is the
 * first creature targeted, `count` times (Wind of the Doomhammer); otherwise
 * each creature targeted, `count` times each (Starfall Volley). Nothing where
 * the press makes none.
 *
 * @param {{count?: number|null, same?: boolean}|null} attacks
 * @param {Array<object>} targets  the press's target snapshots
 * @returns {Array<object>}
 */
export function pressAttackTargets(attacks, targets = []) {
  const n = Math.max(0, Math.trunc(Number(attacks?.count)) || 0);
  if (!n || !(targets ?? []).length) return [];
  const aimed = attacks.same === true ? [targets[0]] : targets;
  return aimed.flatMap(t => Array.from({ length: n }, () => t));
}

/**
 * **WHETHER A CONDITION IS REFUSED FROM THIS SOURCE** (Dragonslayer's Nerve,
 * D-911: *A dragonkin cannot make you Frightened*). Pure: the bearer's aggregate
 * rows and the creature laying it. A layer with no type refuses nothing - the
 * door that cannot name who laid it lands it as before.
 *
 * @param {Array<{id: string, creatureType: string, name?: string}>} rows
 * @param {string} id               the condition being laid
 * @param {string|null} creatureType  the layer's type, lower case
 * @returns {string|null}  the name of the item that refuses it, or null
 */
export function refusedFromSource(rows = [], id, creatureType) {
  const type = typeof creatureType === "string" ? creatureType.toLowerCase().split(/\s|\(/)[0] : null;
  if (!id || !type) return null;
  const row = (rows ?? []).find(r => r?.id === id && r?.creatureType === type);
  return row ? (row.name ?? "") : null;
}

/**
 * **THE TEMPORARY HEALTH A KILL GIVES** (The Tusk Taken, D-911: *When you
 * reduce a Boss or an Elite to 0 Health, you gain temporary Health equal to
 * twice your tier*). Pure: the killer's rows, its tier, the creature killed.
 * The largest row that counts wins - 05 says temporary Health does not stack.
 *
 * @param {Array<{name: string, perTier: number, weightClasses: string[]}>} rows
 * @param {{tier?: number, weightClass?: string|null}} o
 * @returns {{amount: number, name: string}|null}
 */
export function killTemporaryHealth(rows = [], { tier = 1, weightClass = null } = {}) {
  const t = Math.max(1, Math.trunc(Number(tier)) || 1);
  let best = null;
  for (const row of rows ?? []) {
    const classes = row?.weightClasses ?? [];
    if (classes.length && !classes.includes(String(weightClass ?? ""))) continue;
    const amount = Math.max(0, Math.trunc(Number(row?.perTier)) || 0) * t;
    if (amount > 0 && (!best || amount > best.amount)) best = { amount, name: row.name ?? "" };
  }
  return best;
}

/**
 * **THE WARD A DAMAGING SCHOOL GIVES** (Adaptive Scales, D-911: *The first time
 * each round you take damage of one of the seven schools in 07-MAGIC, you have
 * Ward 2 against that school until the end of your next turn, unless you already
 * have more*). Pure: the amount, the blow's types, and whether the round's mark
 * is already spent. Answers the school the FIRST of the blow's types names, or
 * null - Physical is no school.
 *
 * @param {{ward?: number, types?: string[], spent?: boolean}} o
 * @returns {{school: string, ward: number}|null}
 */
export function adaptiveWardFor({ ward = 0, types = [], spent = false } = {}) {
  const n = Math.max(0, Math.trunc(Number(ward)) || 0);
  if (!n || spent) return null;
  const school = (types ?? []).find(t => typeof t === "string" && t in AZEROTH.schools) ?? null;
  return school ? { school, ward: n } : null;
}

/**
 * The Signatures folded into what the weapon's own traits do to this attack.
 *
 * **A MERGE, NOT A SECOND PATH.** `rules/weapon-traits.mjs#weaponTraitEffects`
 * already returns everything the roll pipeline reads — `criticalOn`, the
 * `effects[]` that `firedTraits` fires by Success Level, the notes — and
 * `templates/chat/roll-card.hbs` already draws a fired row's condition button
 * and its Sunder button. So 288 Classic finds and Judgment Armor reach the die
 * through the door 08 §5's Keen has used since D-662, and not one template
 * changed.
 *
 * What each key does, and why:
 *
 * - **`criticalOn` takes the LOWER**, exactly as two Keen enchantments do.
 *   This is the largest behavioural change in the pass: 288 items say *you
 *   inflict a Critical Injury on a natural 19 as well as a 20* and every roll
 *   in the game was unaware of it.
 * - **An `onHit` row joins `effects[]` in `EFFECT`'s own shape**, with its
 *   threshold at `sl` — 0, *on a hit*, where the descriptor names none, since
 *   `firedTraits` reads a missing one as `Infinity` and the row would never
 *   fire. It carries the item's own SENTENCE as `text`, so the card says what
 *   the item says instead of one line shared by all of them.
 * - **The damage on an ARCING row is the arc's, not the blow's** (Thunderfury:
 *   *the attack arcs to one other creature within 15 feet for 3 Nature
 *   damage*). Adding it to `extraDamage` would put the arc's damage on the
 *   creature that was struck, so a row that arcs contributes none and the
 *   sentence on the card is what tells the table to resolve it.
 * - **`damageRating`, `damageRatingSet` and `damageMultiplier` ride along**
 *   for the caller to lay on the damage: a bonus adds, a SET replaces, and the
 *   multiplier is Ashbringer's *doubled before Ward is subtracted*, which is
 *   `rules/mitigation.mjs`' own `multiplier` and not an 08 §6 grant.
 * - **`cancelsBane` is a list of the dialog's own line ids**, which
 *   `rules/modifiers.mjs` refuses to raise. A Bane REMOVED is not a Boon.
 * - **`onKill` rides along as a list of its own and NEVER joins `effects[]`.**
 *   `firedTraits` fires by Success Level off a blow that LANDS, and a kill is
 *   not a hit: Gorehowl's rows would then fire on every hit that missed the
 *   kill. The card draws them in a section of their own, on a hit, as the
 *   sentence the table reads when the blow finishes something.
 *
 * @param {ReturnType<typeof import("./weapon-traits.mjs").weaponTraitEffects>} effects
 * @param {ReturnType<typeof signatureEffects>|null} signature
 */
export function mergeWeaponEffects(effects, signature) {
  const out = {
    ...(effects ?? {}),
    effects: [...(effects?.effects ?? [])],
    notes: [...(effects?.notes ?? [])],
    cancelsBane: [...(effects?.cancelsBane ?? [])],
    onKill: [...(effects?.onKill ?? [])],
    damageRating: effects?.damageRating ?? 0,
    damageRatingSet: effects?.damageRatingSet ?? null,
    damageMultiplier: effects?.damageMultiplier ?? null
  };
  if (!signature) return out;
  out.onKill.push(...(signature.onKill ?? []));
  if (signature.criticalOn !== null && signature.criticalOn !== undefined) {
    out.criticalOn = Math.min(out.criticalOn ?? CRITICAL_MAX, signature.criticalOn);
  }
  for (const row of signature.onHit ?? []) out.effects.push(firedSignatureRow(row));
  for (const id of signature.cancelsBane ?? []) if (!out.cancelsBane.includes(id)) out.cancelsBane.push(id);
  out.damageRating += signature.damageRating ?? 0;
  if (signature.damageRatingSet !== null && signature.damageRatingSet !== undefined) {
    out.damageRatingSet = Math.max(out.damageRatingSet ?? 0, signature.damageRatingSet);
  }
  if (signature.damageMultiplier !== null && signature.damageMultiplier !== undefined) {
    out.damageMultiplier = Math.max(out.damageMultiplier ?? 0, signature.damageMultiplier);
  }
  return out;
}

/**
 * One `onHit` row in `weapon-traits.mjs#EFFECT`'s shape, so `firedTraits`
 * fires it and the card draws it with no new branch.
 *
 * A key that the row does not carry is LEFT OFF rather than set null: the card
 * tests `{{#if f.condition}}` and a `{id: null}` object is truthy, which would
 * draw an Inflict button naming nothing.
 */
export function firedSignatureRow(row) {
  const out = { key: row.key ?? "signature", name: row.name ?? "", text: row.text ?? "", sl: row.sl ?? 0 };
  if (row.condition?.id) out.condition = { ...row.condition };
  // *The target gains Scorched equal to half the damage dealt* (Sulfuron
  // Hammer, D-696): the value is not known until the mitigation has run, so
  // the DIVISOR travels and `rollTest` fills the number in.
  if (row.condition?.id && row.conditionFromDamage) out.conditionFromDamage = row.conditionFromDamage;
  // *The first time you hit each round* / *once each turn* (D-696). Dropped
  // here for as long as it did not exist, which would have made both limits
  // right code with no caller.
  if (row.per) out.per = row.per;
  // *Gain 1 additional Momentum* (Dal'Rend's Sacred Charge). `signatureSummary`
  // has printed this key since D-692 and NOTHING carried it as far as the roll:
  // the pool it feeds is `gainOnHit`'s own `extra`, beside 08 §5's Fast.
  if (row.momentum) out.momentum = row.momentum;
  if (row.sunder) out.sunder = row.sunder;
  // A Bane on the TARGET's next Test (Frightalon, The Cruel Hand of Timmy).
  // It was dropped here for as long as nothing could carry one; 06 §6's
  // Pummel needed the same carrier and `effects/banes.mjs` is it (D-693).
  if (row.bane) out.bane = row.bane;
  // **WHAT THE BLOW GIVES BACK** (D-698). `onHit.heal` had been in the
  // descriptor since D-692 and reached the card as nothing at all, so five
  // life-stealing blades said *you regain 1 Health* and no Health ever moved
  // — right code with no caller (D-681). It is paid at the attack door where
  // `healFeet` is null and drawn as a button where it names a distance,
  // because nothing but the table knows which ally is within fifteen feet.
  if (row.heal) {
    out.heal = row.heal;
    if (row.healFeet) out.healFeet = row.healFeet;
  }
  if (row.mana) out.mana = row.mana;
  // Feet the target is pushed (Earthshaker). The move is the table's; what
  // this does is put the row on the card at all.
  if (row.push) out.push = row.push;
  // Ash of the Risen's *cannot regain Health until the end of its next turn*,
  // and Unholy Grasp's and Soulflayer's Venom's *against your Signature DC*
  // (D-911): `rollTest` lays the mark and the attack card carries the DC.
  if (row.noHealing === true) out.noHealing = true;
  if (row.signatureDC === true && row.condition?.id) out.signatureDC = true;
  // **THE ARC LANDS NOW** (Thunderfury, Magma Shot; the lead, on O-319: *"Automate the arc
  // and the Fury"*; D-912): its damage and its condition are the creatures it arcs TO, so
  // the row carries them for `effects/legendary-doors.mjs#landArcs` and lays nothing on
  // the creature struck - its Inflict button would have put the arc's Slowed there.
  const arcs = Boolean(row.arc?.targets) || row.arc?.all === true;
  if (arcs) {
    out.arc = { targets: row.arc.targets ?? null, feet: row.arc.feet ?? 0, all: row.arc.all === true };
    out.arcDamage = row.damage?.amount ? { amount: row.damage.amount, type: row.damage.type ?? null } : null;
    out.arcCondition = row.condition?.id ? { ...row.condition } : null;
    delete out.condition;
    delete out.conditionFromDamage;
  }
  // The arc's damage belongs to the creature it arcs TO (Thunderfury).
  if (!arcs && row.damage?.amount) {
    out.extraDamage = row.damage.amount;
    // **ITS OWN TYPE, WHERE IT NAMES ONE** (D-777; the lead: *"Different damage
    // types in one attack are possible"*): *1 Nature damage* on a steel blow is a
    // second amount the target's Nature Ward meets, and the attack door rides one
    // of the blow's own type on the Rating as before.
    if (row.damage.type) out.extraType = row.damage.type;
  }
  return out;
}

/* -------------------------------------------- */
/*  The vocabulary the two hand tables write in  */
/* -------------------------------------------- */

/**
 * A patch laid over a descriptor, sub-object by sub-object, so a row may name
 * `onHit.condition.id` without emptying `onHit.condition.until` beside it.
 * An ARRAY is replaced whole: `gates` and `grants` are what the row says and
 * nothing is inherited into them.
 */
function merge(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch ?? {})) {
    const nested = value && typeof value === "object" && !Array.isArray(value)
      && base[key] && typeof base[key] === "object" && !Array.isArray(base[key]);
    out[key] = nested ? merge(base[key], value) : value;
  }
  return out;
}

const built = (kind, extra = {}) => {
  const out = merge(emptySignature(), extra);
  out.kind = kind;
  return out;
};

// The constructors the tables are written in, in `rules/class-features.mjs`'
// style (D-612): one per kind, plus the gate and the limit.
export const standing = (extra = {}) => built("standing", extra);
export const onHit = (extra = {}) => built("onHit", extra);
/** A blow that FINISHES a creature, which is not a blow that lands (Gorehowl). */
export const onKill = (extra = {}) => built("onKill", extra);
export const whenStruck = (extra = {}) => built("whenStruck", extra);
export const use = (extra = {}) => built("use", extra);
export const spell = (extra = {}) => built("spell", extra);
export const tick = (extra = {}) => built("tick", extra);
/** Prose, and WHY: a key of `AZEROTH.signatureReasons` and nothing else. */
export const none = (reason, extra = {}) => built("none", { reason, ...extra });
/** One clause of the gate. Every clause in the list must hold. */
export const gate = (kind, value = "") => ({ kind, value });
/** A limit, stamped full. `rules/uses.mjs` is the grammar the prose is read with. */
export const once = per => ({ max: 1, value: 1, per });
/**
 * One labelled run of a Legendary that is not the trunk (D-910): a `gated`
 * branch carrying the run's name. An ungated run is a branch with an empty
 * gate, which holds for everybody.
 */
export const run = (label, extra = {}) => merge(emptyBranch(), { ...extra, label });
/**
 * One labelled run that is a BUTTON of its own (D-910): an entry of
 * `presses`, keyed by `pressKey(label)` where the row writes it.
 */
export const press = (label, extra = {}) => merge(emptyPress(), { ...extra, label });
/** A row's `presses` map, keyed by each press's own label (D-910). */
export const pressMap = (...entries) => Object.fromEntries(entries.map(p => [pressKey(p.label), p]));
/**
 * A run the next phase builds a reader for (D-910): the family it waits on,
 * as the reason `AZEROTH.signatureReasons` names.
 */
/** A Corruption charge, a Test first (D-910): *a Spirit Resilience Test at DC 20 ... gain 1 Fel Corruption*. */
export const corruption = (track, amount, resilience, dc, at = null) => ({ track, amount, resilience, dc, at });
/**
 * What a press costs the bearer. **`class-features.mjs#cost` itself**, not a
 * copy of it: Battlegear of Wrath's *spend 4 Rage as a Reaction* is a class
 * feature's cost written on an item, and two constructors returning the same
 * pair would be two things to keep in step with `AZEROTH.poolTypes`.
 */
export { cost };

/* -------------------------------------------- */
/*  A Signature no table names, read off itself  */
/* -------------------------------------------- */

/**
 * WHICH SPELL a Signature casts, off the sentence that says so.
 *
 * 08 §20 writes it one way on both of its casting entries — *a Priest holding
 * it may cast **Renew** once per Short Rest without spending Mana* — with the
 * spell's name in bold and the limit in `rules/uses.mjs`' own grammar. The
 * DESCRIPTOR deliberately names no spell (`system.spells[]` carries the uuid,
 * the name, the DC and the uses, and a second copy of the name would be a
 * second thing to keep in step), so this is what the §20 parser reads to fill
 * that list and what `seedSignature` reads to know the kind.
 *
 * **The name may come back null and the sentence still casts.** A GM typing
 * *may cast Renew once per Short Rest* into the Forge names no bold run;
 * `kind: "spell"` with an empty `system.spells[]` is exactly the state
 * `pressRefusal` answers `noSpell` for, which says so on all three surfaces
 * rather than drawing a live button over nothing (D-681).
 *
 * @param {string} text  the Signature's prose, HTML or Markdown
 * @returns {{name: string|null, uses: {max: number, value: number, per: string}|null}|null}
 */
export function castFromText(text = "") {
  const html = String(text ?? "");
  // *may cast*, *can cast* — never a bare *cast*, which reads *cannot be cast*
  // and *the spell it was cast from* as castings of their own.
  if (!/\b(?:may|can)\s+cast\b/i.test(plainText(html).replace(/\*\*/g, ""))) return null;
  const named = /\bcasts?\s+(?:<strong>|<b>|\*\*)\s*([^<*]+?)\s*(?:<\/strong>|<\/b>|\*\*)/i.exec(html);
  const limit = usesFromText(html);
  return {
    name: named ? named[1].trim() : null,
    uses: limit ? { max: limit.max, value: limit.max, per: limit.per } : null
  };
}

/**
 * THE DESCRIPTOR A SIGNATURE'S OWN WORDS STATE, where the words are
 * unambiguous — one number, one school, one condition.
 *
 * `rules/consumables.mjs#seedUse` is the technique: read the raw HTML's bold
 * runs first, then the plain text, and stop rather than guess. It is the door
 * for the two places no hand table reaches — a GM's Signature typed at the
 * Forge bench (`rules/forge.mjs#build` stamps what this returns beside the
 * sentence, which is where the kind used to be thrown away) and a hand-made
 * item the migration finds in a world and the packs do not hold.
 *
 * **IT NEVER ASSERTS A NUMBER THE SENTENCE DOES NOT SAY.** Every digit it
 * writes is a digit it read, and `signatures.test.mjs` holds that over every
 * distinct Signature in the three packs. Three shapes 08 §20 states in WORDS
 * are therefore left to the hand tables rather than half-read here:
 *
 * - Ashbringer's `damageMultiplier` — *its damage is doubled*, never a 2;
 * - Gorehowl's `onKill.bane` — *takes a Bane*, one by construction;
 * - Thunderfury's `arc.targets` — *one other creature*.
 *
 * A **placeholder** is read as what it is. 141 Classic finds open on
 * *Signature to be written*, and reading the clause after it as a mechanic
 * would be this function inventing content; it comes back `none("unwritten")`,
 * and the specific clause belongs to `classic-tables.mjs#REASON_TEXT`, which
 * writes those sentences and travels with its own descriptor.
 *
 * `name` and `section` are accepted so a caller hands over the entry it
 * already has, exactly as `seedUse` does. A Signature says what it does in its
 * own sentence, and neither the item's name nor the shelf it sits on changes
 * the reading.
 *
 * @param {{name?: string, text?: string, section?: string}} entry
 * @param {{classes?: string[]}} [known]  the class names a gate may name (02
 *   §6's nine). There is no roster of them in `config.mjs`, so the caller reads
 *   the pack; with none, a class gate is not read rather than guessed at.
 * @returns {object} a whole descriptor; `kind: "none"` where nothing is readable
 */
export function seedSignature({ name = "", text = "", section = "" } = {}, { classes = [] } = {}) {
  const html = String(text ?? "");
  const flat = plainText(html).replace(/\*\*/g, "").trim();
  if (!flat) return emptySignature();
  // *Signature to be written.* — the shelf of 141 finds nobody has written yet.
  // Read over the WHOLE text and before anything is split, because four of
  // those entries write a second sentence after the placeholder (*The rest of
  // the set carried it.*) and splitting first would hand that sentence to the
  // readers as a mechanic.
  if (/^Signature to be written\b/i.test(flat)) return none("unwritten");

  // ---- step 0: A LEGENDARY'S LABELLED RUNS ARE UNITS (D-909, D-910). Each run
  // is read whole, as the single Signature it would be on an Epic, and never
  // split across another run's sentences.
  const runs = signatureRuns(html);
  if (runs.length >= 2) return seedRuns(runs, classes);

  // ---- step 1 and 2: the sentences, with the inert ones folded back in.
  const parts = signatureParts(html, classes);

  // ---- step 3: ONE GATE AND NOTHING ELSE FIRING IS A GATE ON THE TRUNK.
  //
  // This is what makes every one-sentence Signature — all twenty-two of 08
  // §20's, every Classic template, every sentence a GM has typed — read exactly
  // as it always has: one part, or one gated part and nothing else that fires,
  // is the whole text read in one pass and no branches at all. Splitting such a
  // sentence would move its gate into a branch for no gain and break the two
  // whole-pack censuses in `signatures.test.mjs`.
  const gatedParts = parts.filter(p => p.gates.length || p.unreadable);
  const otherFires = parts.some(p => !p.gates.length && !p.unreadable && hasSignature(p.descriptor));
  const oneGate = parts.length === 1 || gatedParts.length === 0 || (gatedParts.length === 1 && !otherFires);
  if (oneGate) return seedWhole({ html, flat }, classes);

  // ---- step 4: the ungated sentences are the trunk; each gated one branches.
  //
  // The trunk is read over the ungated sentences JOINED, rather than by merging
  // their descriptors: every reader here is a regular expression over a run of
  // prose and two of them write across a clause boundary (*every creature
  // within 20 feet … takes 8 Fire damage*), so a join is the reading and a
  // descriptor merge would be arithmetic on top of it. Its gate list is known
  // to be empty — that is what put the sentence in this pile — so the join
  // cannot invent one across a boundary.
  const ungated = parts.filter(p => !p.gates.length && !p.unreadable);
  const out = ungated.length
    ? seedWhole(joinParts(ungated), classes, { gates: [], unreadable: false })
    : emptySignature();

  for (const part of gatedParts) {
    const branch = merge(emptyBranch(), { gates: part.gates });
    if (part.unreadable) {
      // AN UNREADABLE SENTENCE DROPS ALONE (the lead, 2026-09-14). Before this
      // one unqualifiable *against …* clause returned `none("targetRelative")`
      // for the WHOLE Signature and took every other sentence down with it.
      branch.reason = "targetRelative";
    } else {
      for (const key of BRANCH_FAMILIES) branch[key] = part.descriptor[key];
    }
    out.gated.push(branch);
  }

  // **THE PRESS STAYS ON THE TRUNK, AND ITS GATE RIDES `useGates`** (D-722).
  // A branch never carries `use`, so a gated sentence that presses hands its
  // pressed half up to the trunk and leaves its gate behind on the button.
  // `AzerothActor#resetUses` writes `system.signatureEffect.use.uses.value` by
  // dotted path at every rest and an array index below that is D-671's trap
  // with an index in it.
  const lifted = liftPress(out, gatedParts);

  // **AND A BRANCH THAT IS NOW ONLY ITS GATE IS DROPPED** (D-722's own
  // correction, 2026-09-15). The sentence whose press was just lifted has
  // nothing left in it — its gate went to `useGates` and its `use` to the trunk
  // — and a branch of gate and nothing else draws on the Combat tab, the item
  // sheet, the Overview column and the Forge's preview as *One sentence only —
  // Only for one class: Shaman · That sentence does not apply to you* standing
  // over no rule at all. A Rogue then read the same clause twice on one row.
  // A sentence that gates something and states nothing (`gatesWithNothingBehind`)
  // is the other way in, and it is the same empty row; the Forge NOTES it at the
  // bench instead. The fix is HERE rather than in the surfaces' filter, so all
  // four read the same descriptor.
  out.gated = out.gated.filter(branch => !branchIsEmpty(branch));

  // WHAT THE READER WOULD CALL THE WHOLE THING. The trunk's own kind first,
  // then the button a branch handed up, then the branches — because an item
  // whose only effect is in a gated sentence is not prose (`hasSignature` is
  // `kind !== "none"`, and a `none` kind would put it on the census of
  // Signatures nobody has read).
  if (lifted) out.kind = lifted;
  else if (out.kind === "none") out.kind = branchKind(out.gated);
  if (out.kind === "spell") out.use = emptySignature().use;
  return out;
}

/**
 * A LEGENDARY'S RUNS, each read whole (D-910) - the seeder's half of the
 * labelled prose `signatureRuns` reads. It is the door for a GM's own
 * Legendary at the Forge and for a world item no pack holds; the book's thirty
 * are `BOOK_SIGNATURES`' hand rows and never come through here.
 *
 * - **The trunk is the first run that fires**, or the first run where none
 *   does, carrying its label. A trunk that fires nothing would make the whole
 *   item read as prose while a later run worked.
 * - **A later run that presses is a `presses` entry**, keyed by its slug, with
 *   its own gate; one that casts is not read (an item casts through
 *   `system.spells[]`, which one press already owns).
 * - **Every other later run is a branch** under its own gate and label, and a
 *   run that itself reads as several gated sentences hands each up as a branch
 *   of its own, labelled with the run.
 *
 * @param {Array<{label: string, html: string}>} runs
 * @param {string[]} classes
 */
function seedRuns(runs, classes) {
  const read = runs.map(r => ({ label: r.label, d: seedSignature({ text: r.html }, { classes }) }));
  const first = read.findIndex(r => hasSignature(r.d) && r.d.kind !== "spell");
  const trunkAt = first >= 0 ? first : 0;
  const out = merge(emptySignature(), read[trunkAt].d);
  out.label = read[trunkAt].label;
  out.gated = out.gated.map(b => ({ ...b, label: read[trunkAt].label }));
  read.forEach(({ label, d }, i) => {
    if (i === trunkAt) return;
    if (d.kind === "use") {
      const gates = (d.useGates ?? []).length ? d.useGates : d.gates;
      out.presses[pressKey(label)] = merge(emptyPress(), { ...d.use, label, gates });
      return;
    }
    if (d.kind === "spell") return;
    const branch = merge(emptyBranch(), { label, gates: d.gates, reason: d.kind === "none" ? d.reason : "" });
    for (const key of BRANCH_FAMILIES) branch[key] = d[key];
    if (!branchIsEmpty(branch)) out.gated.push(branch);
    for (const sub of d.gated ?? []) out.gated.push({ ...sub, label });
  });
  if (out.kind === "none" && !out.reason) out.kind = branchKind(out.gated);
  return out;
}

/**
 * The kind a Signature whose trunk fires nothing takes, off its branches
 * (D-722). A branch never presses, so the four standing and trigger kinds are
 * the only answers; the order is `seedKind`'s own.
 */
function branchKind(branches) {
  for (const branch of branches ?? []) {
    if (firesOnHit(branch.onHit)) return "onHit";
    if (firesWhenStruck(branch.whenStruck)) return "whenStruck";
    if (branch.tick.health !== null || branch.tick.mana !== null) return "tick";
    if (seedStands(branch)) return "standing";
  }
  return "none";
}

/**
 * ONE RUN OF PROSE, READ WHOLE — `seedSignature`'s body before D-722 split it.
 *
 * It is handed the text twice, marked and flat, because the readers want both:
 * `castFromText` and the named Mana discount need the bold run, and everything
 * else reads the flattened sentence.
 *
 * @param {{html: string, flat: string}} run
 * @param {string[]} classes
 * @param {{gates: object[], unreadable: boolean}|null} [known]  the gate already
 *   read, where the caller knows it — the joined trunk, whose sentences each
 *   read no gate at all, so a clause found across a join is an artefact of the
 *   join and not something any sentence says.
 */
function seedWhole({ html, flat }, classes, known = null) {
  const out = emptySignature();
  // The gate first: every line below is qualified by it, and a `none` row
  // still carries one where the sentence states it (BOOK_SIGNATURES' rule).
  const read = known ?? seedGates(flat, classes);
  // **AN UNREADABLE GATE WITHHOLDS THIS SENTENCE**, exactly as `gateHolds`
  // drops the standing part of one it cannot judge. Perdition's Blade is the
  // entry that says why: *against a creature already taking Fire damage over
  // time, add 2 to this weapon's Damage Rating* — nothing records a damage over
  // time, and reading the bonus without the clause that scopes it would hand
  // every bearer a flat +2 against everything. A descriptor that disagrees with
  // its own sentence is worse than none.
  if (read.unreadable) return none("targetRelative", { gates: read.gates });
  out.gates = read.gates;
  seedStanding(out, flat);
  // The Mana a spell costs, less (the lead, 2026-09-14). Its own family rather
  // than a line inside `seedStanding`, because the named half has to see the
  // RAW HTML for the bold run and `seedStanding` is handed the flattened text
  // alone — the same split `seedPress` already carries for `usesFromText`.
  seedManaDiscount(out, flat, html);
  seedStruck(out, flat);
  seedHit(out, flat);
  seedPress(out, flat, html);

  out.kind = seedKind(out, html);
  // A `spell` COUNTS ITS CASTINGS ON THE SPELL (D-633): `system.spells[].uses`
  // is the counter `resetUses` refills and the card strikes. A second limit on
  // the descriptor would be two counters over one *once per Short Rest*, so the
  // pressed half is cleared and `BOOK_SIGNATURES`' own `spell({gates})` is
  // reproduced exactly.
  if (out.kind === "spell") out.use = emptySignature().use;
  return out;
}

/**
 * THE SENTENCES OF A SIGNATURE, EACH READ ON ITS OWN (D-722; steps 1 and 2).
 *
 * The splitter is `spell-effects.mjs#sentences` — the repository's one — and it
 * breaks on `.`, `!` and `?` and on nothing else. That is load-bearing: the
 * Doomhammer's gate stands before a COLON and its whole effect after it, and
 * Ashbringer and Quel'Serrar are the same shape with `, and`.
 *
 * **A SENTENCE THAT GATES NOTHING AND FIRES NOTHING MERGES INTO THE ONE BEFORE
 * IT.** Sulfuron Hammer's *Once each turn.*, Bonereaver's *It stacks with
 * itself three times.* and every lore tail belong to the sentence they qualify,
 * not to a part of their own — and the readers are regular expressions over a
 * run of prose, so a limit read off the joined run is a limit read at all.
 *
 * @returns {Array<{html: string, flat: string, gates: object[], unreadable: boolean, descriptor: object}>}
 */
function signatureParts(html, classes) {
  // `flatText` keeps the bold runs as `**`, which `castFromText` and the named
  // Mana discount both read; `plainText` strips them and is what every other
  // reader wants. Both are derived from the same split so the two halves of a
  // part are always the same words.
  const marked = sentences(flatText(html));
  const raw = marked.map(m => readPart(m, classes));

  // Fold an inert sentence into the one before it and read the pair afresh.
  const merged = [];
  for (const part of raw) {
    const inert = !part.gates.length && !part.unreadable && !hasSignature(part.descriptor);
    if (inert && merged.length) merged[merged.length - 1] = `${merged[merged.length - 1]} ${part.html}`;
    else merged.push(part.html);
  }
  return merged.map(m => readPart(m, classes));
}

/**
 * THE SENTENCES THAT PRESS, for the Forge's one-button refusal (D-722).
 *
 * A Signature carries ONE button — `use`, `kind`, `spell` and `summon` are on
 * the trunk and a branch never carries them, because `AzerothActor#resetUses`
 * writes `system.signatureEffect.use.uses.value` by dotted path at every rest
 * and an array index under that is D-671's trap one level deeper. So a second
 * pressing sentence would be silently dropped, and `rules/forge.mjs#plan` says
 * so in words instead.
 *
 * @param {string} text  the Signature's prose, HTML or Markdown
 * @param {{classes?: string[]}} [known]
 * @returns {string[]}  the pressing sentences, flattened, in order
 */
export function pressedSentences(text = "", { classes = [] } = {}) {
  return sentenceReads(text, classes)
    .filter(p => p.descriptor.kind === "use" || p.descriptor.kind === "spell")
    .map(p => p.flat);
}

/**
 * THE SENTENCES THAT GATE SOMETHING AND STATE NOTHING (D-722; the lead's own
 * call: print a warning, because the GM has probably mis-phrased it).
 *
 * *A Paladin wielding it shines faintly.* gates a rule that is not there. It is
 * legal — a Legendary may say anything — so `plan()` raises a NOTE rather than
 * a reason, and the bench prints it beside Apply.
 *
 * @returns {string[]}  the sentences, flattened, in order
 */
export function gatesWithNothingBehind(text = "", { classes = [] } = {}) {
  return sentenceReads(text, classes)
    .filter(p => p.gates.length && !p.unreadable && !hasSignature(p.descriptor))
    .map(p => p.flat);
}

/**
 * The sentences of a Signature as they are read, for the two questions above.
 * A placeholder is not split at all — the shelf of 141 finds that open on
 * *Signature to be written* carries a second sentence saying what the old item
 * did, and reading that as a mechanic is what `seedSignature` refuses.
 */
function sentenceReads(text, classes) {
  const html = String(text ?? "");
  const flat = plainText(html).replace(/\*\*/g, "").trim();
  if (!flat || /^Signature to be written\b/i.test(flat)) return [];
  return signatureParts(html, classes);
}

/** One sentence, as its marked run, its flat run, its gate and its descriptor. */
function readPart(marked, classes) {
  const run = { html: marked, flat: plainText(marked).replace(/\*\*/g, "").trim() };
  const read = seedGates(run.flat, classes);
  return { ...run, gates: read.gates, unreadable: read.unreadable, descriptor: seedWhole(run, classes, read) };
}

/** Several parts as one run, marked and flat, for a single reading. */
function joinParts(parts) {
  const html = parts.map(p => p.html).join(" ");
  return { html, flat: plainText(html).replace(/\*\*/g, "").trim() };
}

/**
 * THE ONE BUTTON, LIFTED OFF WHICHEVER SENTENCE CARRIES IT (D-722).
 *
 * A Signature carries one button. Where the sentence that presses is a gated
 * one, its `use` and its `summon` move to the trunk and its gate is written to
 * `useGates`, so `pressGates` greys the control for the wrong bearer while the
 * ungated sentences beside it keep firing for everybody.
 *
 * **THE FIRST PRESSED SENTENCE WINS AND THE FORGE REFUSES A SECOND**
 * (`rules/forge.mjs#plan`): two buttons on one row is not a shape any surface
 * draws, and choosing silently between them would be the tool inventing a rule.
 *
 * @returns {"use"|"spell"|null}  the kind the lifted button makes the whole
 *   Signature, or null where nothing was lifted
 */
function liftPress(out, gatedParts) {
  // The trunk already presses: its sentence is the button and a gated one
  // beside it is the second the Forge refuses.
  if (out.kind === "use" || out.kind === "spell") return null;
  for (const part of gatedParts) {
    if (part.unreadable) continue;
    const d = part.descriptor;
    if (d.kind !== "use" && d.kind !== "spell") continue;
    out.use = d.use;
    out.summon = d.summon;
    out.useGates = part.gates;
    return d.kind;
  }
  return null;
}

/** A class name into a regular expression, since a pack may hold any word. */
const escapeRe = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The gate clauses a sentence states, and whether one of them defeated the
 * reading. Each clause fails to nothing rather than to a guess: an unread gate
 * makes a Signature always on, which is the wrong way to be wrong, so only the
 * shapes 08 §20 writes verbatim are read.
 *
 * @returns {{gates: Array<{kind: string, value: string}>, unreadable: boolean}}
 */
function seedGates(flat, classes) {
  const gates = [];
  // *A Paladin wielding it*, *a Priest holding it*, *a Ranger drawing it*.
  // EXACTLY ONE, because a sentence naming two classes is one this cannot
  // read - §20 never writes one and a guess would gate the wrong bearer out.
  const named = (classes ?? []).filter(c => c && new RegExp(`\\ban?\\s+${escapeRe(c)}\\b`, "i").test(flat));
  if (named.length === 1) gates.push(gate("class", named[0]));

  // *against undead and demons* - the creature STRUCK, never the bearer. The
  // window is short on purpose: the rest of the sentence is what the blow
  // does, and *a creature reduced to 0 Health* is not a second gate.
  // *A Reflex Test against DC 10 + your Intelligence modifier* names a Test's
  // DC and no creature at all (`againstClause`), so it is no gate to read.
  const against = againstClause(flat);
  let struck = false;
  if (against >= 0) {
    const run = flat.slice(against + "against ".length, against + "against ".length + AGAINST_WINDOW);
    const kinds = Object.keys(AZEROTH.creatureTypes).filter(k => new RegExp(`\\b${k}s?\\b`, "i").test(run));
    if (kinds.length) {
      gates.push(gate("creatureType", kinds.join(", ")));
      struck = true;
    }
  }

  // The three conditions of the world 08 §20's own entries write, and 10's
  // ladder as a track and a floor.
  if (/\bbelow half (?:your )?Health\b/i.test(flat)) gates.push(gate("belowHalfHealth"));
  if (/\bhave not moved this turn\b/i.test(flat)) gates.push(gate("hasNotMoved"));
  if (/\bhas not yet acted\b/i.test(flat)) {
    gates.push(gate("targetHasNotActed"));
    // Bloodfang Armor: *against any creature that has not yet acted this
    // combat*. The clause after *against* IS read; it simply names a state
    // rather than a kind.
    struck = true;
  }
  const corrupt = /\b(Fel|Void|Undeath) Corruption (\d+) or more\b/i.exec(flat);
  if (corrupt) gates.push(gate("corruption", `${corrupt[1].toLowerCase()} ${corrupt[2]}`));
  return { gates, unreadable: against >= 0 && !struck };
}

/** How far past *against* a creature type may be named. */
const AGAINST_WINDOW = 60;

/**
 * *against DC 10 + ...*, *against your Spell DC*, *against a Standard DC*: the
 * DC a Test is made against (D4's own wording), which says nothing of the
 * creature struck. Cannonball Runner and the Piccolo of the Flaming Fire write
 * it, and reading it as an unqualifiable target clause dropped their sentence.
 */
const AGAINST_DC = /^against (?:(?:a|an|the|your|its|their)\s+)?(?:[a-z]+\s+)?DC\b/i;

/** Where the first *against* that could name the creature struck stands, or -1. */
function againstClause(flat) {
  const lower = flat.toLowerCase();
  for (let at = lower.indexOf("against "); at >= 0; at = lower.indexOf("against ", at + 1)) {
    if (!AGAINST_DC.test(flat.slice(at))) return at;
  }
  return -1;
}

/** What is true while the thing is worn. */
function seedStanding(out, flat) {
  // *inflicts a Critical Injury on a natural 19 as well as a 20* - 266 finds
  // and two of §20's own say it, and nothing read one before D-692.
  const crit = /Critical Injur(?:y|ies)[^.]*?on a natural (\d+)/i.exec(flat);
  if (crit) out.criticalOn = face(crit[1]);

  // *At the start of each of your turns, regain 1 Mana* - 92 finds.
  const beat = /at the start of (?:each of )?(?:your|its|their) turns?,?\s*(?:you\s+)?(?:regains?|restores?|recovers?|gains?)\s+(\d+)\s+(Health|Mana)\b/i.exec(flat);
  if (beat) {
    if (/mana/i.test(beat[2])) out.tick.mana = Number(beat[1]);
    else out.tick.health = Number(beat[1]);
  }

  // 08 §6's own grant sentence, through `parseGrant` so nothing else has to
  // read one. *of every Nature spell* is REFUSED here and read below: a bonus
  // scoped to what is cast is not a bonus on the bearer, and a flat grant
  // would raise the hammer in their hand as readily as the spell.
  // *Against beasts, add 1 to your Damage Rating* is the finds' phrasing and
  // *adds 2 to its Damage Rating against undead* is §20's; one reader.
  const rating = /\badds?\s+(\d+)\s+to\s+(?:its|your|the|this weapon's|the weapon's|the ammunition's)\s+Damage Rating\b(?!\s+of\b)/i.exec(flat);
  if (rating) out.grants.push(`+${rating[1]} Damage Rating`);
  for (const m of flat.matchAll(/\+(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\b/g)) {
    out.grants.push(`+${m[1]} ${m[2]}`);
  }
  out.grants = [...new Set(out.grants)].filter(g => parseGrant(g) !== null);

  // Quel'Serrar: *against dragonkin its Damage Rating IS 8.* A set, not a
  // bonus - 08 §6's grammar only adds.
  const set = /\bDamage Rating is (\d+)\b/i.exec(flat);
  if (set) out.damageRatingSet = atLeast(set[1], 0);

  // The Ten Storms: one SCHOOL'S spells and never the bearer.
  const schooled = /\badds?\s+(\d+)\s+to\s+the Damage Rating of every\s+([A-Za-z]+)\s+spell\b/i.exec(flat);
  if (schooled && AZEROTH.schools[schooled[2].toLowerCase()]) {
    out.spellDamage = { school: schooled[2].toLowerCase(), amount: atLeast(schooled[1], 1) };
  }

  // Vestments of Transcendence: what the bearer GIVES.
  const given = /\brestores?\s+(\d+)\s+additional Health\b/i.exec(flat);
  if (given) out.healingBonus = atLeast(given[1], 1);

  // Nemesis Raiment: what 10 charges them, less.
  const spared = /\btakes?\s+(\d+)\s+less\s+(Fel|Void|Undeath)\s+Corruption\b/i.exec(flat);
  if (spared && AZEROTH.corruptionTracks[spared[2].toLowerCase()]) {
    out.corruptionReduction = { track: spared[2].toLowerCase(), amount: atLeast(spared[1], 1) };
  }

  // Dragonstalker Armor: *takes no Bane on Attack Tests ... whatever the
  // range.* A BANE CANCELLED IS NOT A BOON, and *whatever the range* is what
  // names which Bane - 06's second band, the dialog's own `longRange` line.
  if (/\btakes no Bane\b[^.]*\bwhatever the range\b/i.test(flat)) out.cancelsBane = "longRange";

  // Drillborer Disk: *Block reduces damage by a further 2* (06 §6, D-693).
  const block = /\bBlock reduces damage by a further (\d+)\b/i.exec(flat);
  if (block) out.blockBonus = atLeast(block[1], 1);
}

/**
 * WHAT A SPELL COSTS, LESS — by NAME or by SCHOOL (the lead, 2026-09-14).
 *
 * Asked whether a Signature could say *if a Shaman wields this, reduce
 * Lightning Shield's mana cost by 2*, the lead answered: *spell and/or a school
 * should be possible.* Both halves already had somewhere to land and neither
 * was reachable from a typed sentence — `empowers.cost` was written for a
 * Classic set bonus and only `BOOK_SIGNATURES` and `classic-tables.mjs` ever
 * set it, and the school half did not exist at all — so a GM typing either one
 * at the Forge bench got a blank preview and an item that did nothing.
 *
 * **THE SCHOOL IS READ FIRST AND RETURNS.** *Nature spells cost 1 less Mana*
 * would read as a spell NAMED "Nature spells" to the named reader below, and a
 * whole school's discount would then hang on a spell nobody can cast — a
 * descriptor that disagrees with its own sentence, which is worse than none.
 *
 * **THE BOLD RUN IS PREFERRED, EXACTLY AS `castFromText` PREFERS IT.** A bare
 * name has no reliable boundary in English prose, so the bare pass is
 * case-SENSITIVE on the name (up to four Title Case words, a leading
 * determiner dropped) and lenient on the words around it — 07's spell names are
 * all Title Case and the lead's own sentence writes *mana cost* in lower case.
 * `/i` on those patterns would make `[A-Z]` meaningless and *reduce lightning
 * shield's mana cost* would capture a sentence rather than a spell.
 *
 * @param {object} out   the descriptor being built
 * @param {string} flat  the sentence, flattened and unmarked
 * @param {string} html  the same sentence with its markup, for the bold run
 */
function seedManaDiscount(out, flat, html) {
  for (const re of SCHOOL_MANA_COST) {
    const m = re.exec(flat);
    if (!m) continue;
    const school = String(m[1]).toLowerCase();
    const amount = atLeast(m[2], 1);
    if (!AZEROTH.schools[school] || amount === null) continue;
    out.spellCost = { school, amount };
    return;
  }

  // ONE NAMED SPELL OR FEATURE (D-698's own key). The marked name first,
  // because it is the only one with a boundary the prose gives for free.
  for (const re of NAMED_MANA_COST_MARKED) {
    const m = re.exec(html);
    if (!m) continue;
    if (setEmpoweredCost(out, m[1], m[2])) return;
  }
  for (const re of NAMED_MANA_COST_BARE) {
    const m = re.exec(flat);
    if (!m) continue;
    if (setEmpoweredCost(out, m[1], m[2])) return;
  }
}

/**
 * *Nature spells cost 1 less Mana*, *your Fire spells cost 2 less Mana*, and
 * the same rule written the other way round. A word that is not one of
 * `AZEROTH.schools` reads as NOTHING rather than as a guess.
 */
const SCHOOL_MANA_COST = Object.freeze([
  /\b([A-Za-z]+)\s+spells?\s+costs?\s+(\d+)\s+less\s+Mana\b/i,
  /\breduces?\s+the\s+Mana\s+cost\s+of\s+(?:your\s+|their\s+)?([A-Za-z]+)\s+spells?\s+by\s+(\d+)\b/i
]);

/** *<strong>Renew</strong> costs 1 less Mana*, and the reduce form beside it. */
const NAMED_MANA_COST_MARKED = Object.freeze([
  /(?:<strong>|<b>|\*\*)\s*([^<*]+?)\s*(?:<\/strong>|<\/b>|\*\*)\s+costs?\s+(\d+)\s+less\s+Mana\b/i,
  /\breduces?\s+(?:the\s+)?(?:<strong>|<b>|\*\*)\s*([^<*]+?)\s*(?:<\/strong>|<\/b>|\*\*)(?:['’]s)?\s+Mana\s+cost\s+by\s+(\d+)\b/i
]);

/**
 * The same two with the name BARE. Case-sensitive on the name and lenient on
 * everything else, for the reason the function's own comment gives.
 */
const NAMED_MANA_COST_BARE = Object.freeze([
  /\b([A-Z][A-Za-z'’]*(?:\s+[A-Z][A-Za-z'’]*){0,3})\s+[Cc]osts?\s+(\d+)\s+[Ll]ess\s+[Mm]ana\b/,
  /\b[Rr]educes?\s+(?:[Tt]he\s+)?([A-Z][A-Za-z'’]*(?:\s+[A-Z][A-Za-z'’]*){0,3})['’]s\s+[Mm]ana\s+[Cc]ost\s+by\s+(\d+)\b/
]);

/** *Your Renew* is Renew; the determiner is not part of 07's name for it. */
const LEADING_DETERMINER = /^(?:Your|Their|Its|His|Her|The|This|That|An?)\s+/;

/**
 * *Lightning Shield's* is Lightning Shield. The possessive may sit INSIDE the
 * bold run (`**Lightning Shield's** Mana cost`) as readily as outside it, and
 * 07 holds no spell whose name ends in one.
 */
const TRAILING_POSSESSIVE = /['’]s$/;

/**
 * The named half, written onto the descriptor. **FIELD BY FIELD, never as a
 * fresh object**, so `empowers.damageRating` and `empowers.heal` — which a hand
 * table may have set on the same descriptor — keep their places.
 *
 * @returns {boolean} whether anything was written
 */
function setEmpoweredCost(out, name, amount) {
  const spell = String(name ?? "").replace(LEADING_DETERMINER, "").replace(TRAILING_POSSESSIVE, "").trim();
  const off = atLeast(amount, 1);
  if (!spell || off === null) return false;
  // *Custard Spells cost 1 less Mana* is a school sentence whose first word is
  // not a school, and 07 names no spell *Spells*. The school reader above has
  // already refused it; naming it here would invent an ability instead.
  if (/\bspells?$/i.test(spell)) return false;
  out.empowers.name = spell;
  out.empowers.cost = off;
  return true;
}

/** What a blow that lands ON THE BEARER answers with (08 §20's thorns). */
function seedStruck(out, flat) {
  const back = /\b(?:a creature|an enemy|anything|any creature) that (?:hits|strikes) you\b[^.]*?\btakes (\d+)\s+([A-Za-z]+)\s+damage/i.exec(flat);
  if (!back) return;
  const type = String(back[2]).toLowerCase();
  if (!AZEROTH.damageTypes[type]) return;
  out.whenStruck.damage = { amount: Number(back[1]), type };
}

/** What a blow that lands DOES beyond its damage. */
function seedHit(out, flat) {
  // *On a hit* is 08 §5's own *on a hit* threshold, which `firedTraits` reads
  // as 0; *On SL 2* is its Standard rung, and 08 §20 and the Classic EFFECT
  // templates both write it that way.
  const opener = /\bon (?:a hit|SL (\d+))\s*,\s*/i.exec(flat);
  if (!opener) return;
  if (opener[1] !== undefined) out.onHit.sl = Number(opener[1]);
  const run = flat.slice(opener.index + opener[0].length);

  const damage = /\b(\d+)\s+([A-Za-z]+)\s+damage\b/i.exec(run);
  if (damage && AZEROTH.damageTypes[String(damage[2]).toLowerCase()]) {
    out.onHit.damage = { amount: Number(damage[1]), type: String(damage[2]).toLowerCase() };
  }
  // ONE CONDITION OR NONE, through the reader 06 §8's own tables use: a run
  // naming two is one this cannot say which of, and a guess puts the wrong
  // button on somebody's card (D-691's Netherborn).
  const landed = injuryConditions(run);
  if (landed.conditions.length === 1) {
    const [held] = landed.conditions;
    out.onHit.condition = { id: held.id, value: held.value ?? null, until: untilIn(run) };
  }
  const sunder = /\bArmor Points? fall by (\d+)\b/i.exec(run);
  if (sunder) out.onHit.sunder = Number(sunder[1]);
  const gained = /\bgains?\s+(\d+)\s+(?:additional\s+)?Momentum\b/i.exec(run);
  if (gained) out.onHit.momentum = Number(gained[1]);
  const back = /\b(?:you\s+)?regains?\s+(\d+)\s+Health\b/i.exec(run);
  if (back) out.onHit.heal = Number(back[1]);
}

/**
 * How long a condition a blow leaves holds, in `AZEROTH.untilKinds`' words.
 *
 * `injuryConditions` reads the same clause for 06 §8's tables, and its own
 * test is `until the end of YOUR next turn` — the second person the Critical
 * Injury tables are written in. 08 §20 and the finds write *until the end of
 * ITS next turn*, because the condition lands on the creature struck, so
 * Thunderfury's Slowed came back with no duration at all.
 */
function untilIn(text) {
  if (/until the end of (?:its|their|your|his|her) next turn\b/i.test(text)) return "endOfNextTurn";
  if (/until (?:its|their|your) next turn\b/i.test(text)) return "nextTurn";
  if (/until the end of the (?:encounter|fight)\b|for the rest of the (?:encounter|fight)\b/i.test(text)) return "encounter";
  return null;
}

/** What pressing it does, in `useField()`'s vocabulary. */
function seedPress(out, flat, html) {
  const action = /\bas a Half-Action\b/i.test(flat) || /\bspends? a Half-Action\b/i.test(flat) ? "half"
    : /\bas a Full Action\b/i.test(flat) || /\bspends? a Full Action\b/i.test(flat) ? "full"
      : /\bas a Reaction\b/i.test(flat) ? "reaction"
        : /\bas an Action\b/i.test(flat) ? "action"
          : null;
  if (action) out.use.action = action;

  const paid = /\bspends?\s+(\d+)\s+(Rage|Zeal|Quarry|Combo Points|Ferocity|Mana|Focus|Energy)\b/i.exec(flat);
  if (paid) {
    const pool = paid[2].toLowerCase() === "combo points" ? "comboPoints" : paid[2].toLowerCase();
    if (AZEROTH.poolTypes[pool]) out.use.cost = { pool, amount: atLeast(paid[1], 1) };
  }

  // Battlegear of Wrath: *halve the damage of one attack that hits them.*
  if (/\bhalve the damage\b/i.test(flat)) out.use.mitigates = { halve: true, amount: null };

  // The area and the damage inside it travel together, because *every
  // creature within 20 feet takes 8 Fire damage* is one clause.
  const area = /\bevery creature within (\d+) (?:feet|ft)\b[^.]*?\btakes (\d+)\s+([A-Za-z]+)\s+damage/i.exec(flat);
  if (area && AZEROTH.damageTypes[String(area[3]).toLowerCase()]) {
    out.use.area = `Each creature within ${area[1]} ft`;
    out.use.damage = { amount: Number(area[2]), type: String(area[3]).toLowerCase() };
  }

  // What it restores, through 07's own reader. The beat at the top of the turn
  // is `tick` and was taken above, so a sentence with one does not also heal.
  if (out.tick.health === null) {
    const healed = healFromText(flat);
    if (healed?.amount && out.onHit.heal === null) out.use.heal.health = healed.amount;
  }
  if (out.tick.mana === null) {
    const mana = /\b(?:regains?|restores?|recovers?)\s+(\d+)\s+Mana\b/i.exec(flat);
    if (mana) out.use.heal.mana = Number(mana[1]);
  }

  const limit = usesFromText(html);
  if (limit) out.use.uses = { max: limit.max, value: limit.max, per: limit.per };
}

/** Whether the pressed half does anything at all when it is pressed. */
function firesUse(use) {
  if (!use) return false;
  return Boolean(use.action || use.cost?.pool || use.uses?.per || use.heal?.health || use.heal?.mana
    || use.heal?.fatigue || use.damage?.amount || use.mitigates?.halve || use.mitigates?.amount
    || use.statuses?.length || use.ends?.length || use.changes?.length);
}

/** Whether anything is true while the thing is worn. */
function seedStands(d) {
  return Boolean(d.grants.length || d.refuses.length || d.criticalOn !== null
    || d.damageMultiplier !== null || d.damageRatingSet !== null || d.spellDamage.school
    || d.chosenSpellHealing === true
    || d.firstParryTest === true
    || d.weaponKillReward === true
    || d.scalingHitDamage === true
    || (d.chosenSpellDamage?.school && (d.chosenSpellDamage.attribute || d.chosenSpellDamage.skill || d.chosenSpellDamage.casting))
    // A Mana discount is true while the thing is worn, by school or by name.
    // Without these two the seeder would read the lead's own sentence, write
    // the descriptor and hand back `kind: "none"` — right code that says of
    // itself that it does nothing (D-681).
    || d.spellCost.school
    || (d.empowers.name && (d.empowers.damageRating || d.empowers.heal || d.empowers.cost))
    || d.healingBonus !== null || d.corruptionReduction.track || d.cancelsBane
    || d.blockBonus !== null || d.armorPointsPerTier !== null || auraStands(d.aura));
}

/**
 * Which kind the sentence turned out to be. The order is what a reader would
 * say the Signature IS: a casting is a casting whatever else the sentence
 * carries, a press is a press, and *standing* is the answer only where nothing
 * fires off a trigger at all.
 */
function seedKind(out, html) {
  if (castFromText(html)) return "spell";
  if (firesUse(out.use)) return "use";
  if (firesOnHit(out.onHit)) return "onHit";
  if (firesWhenStruck(out.whenStruck)) return "whenStruck";
  if (out.tick.health !== null || out.tick.mana !== null) return "tick";
  if (seedStands(out)) return "standing";
  return "none";
}

/* -------------------------------------------- */
/*  WHAT THE READER UNDERSTANDS, said out loud   */
/* -------------------------------------------- */

/**
 * THE PHRASINGS `seedSignature` READS, one row per reader family.
 *
 * The lead, 2026-09-14: *can we add an explanation on the creator to show what
 * trigger words and phrases are possible?* Everything above this line is a
 * regular expression over a sentence a GM types free-hand into the Forge's
 * Signature box, and the only feedback was the preview beneath it — which says
 * what was read AFTER the fact and never what could be. A GM writing *deals 2
 * extra fire damage when it strikes* has no way to learn that the reader wants
 * *on a hit, 2 Fire damage*.
 *
 * **A HELP LIST THAT CANNOT ROT.** Every `example` here is run through
 * `seedSignature` by `signature-phrases.test.mjs` and must satisfy its own
 * `check`, so a row on the Forge's panel is a phrase the reader really reads
 * and a reader that changes fails a test rather than leaving the panel lying.
 * That is the whole reason this table is in the pure module and not in the
 * application: the window cannot be imported under Vitest at all.
 *
 * **A ROW IS A PROMISE.** `check(descriptor)` is true exactly when the reader
 * set what the phrase advertises — never `d => true`, and the test asserts
 * each one is FALSE over `emptySignature()` so a vacuous predicate cannot pass.
 *
 * **ONE ROW PER FAMILY, AND NOTHING THE READER DOES NOT KNOW.** The descriptor
 * carries more than this — `onKill`, `arc`, `push`, `aura`, `summon`,
 * `damageMultiplier`, `armorPointsPerTier` and the rest — but every one of
 * those reaches an item from `BOOK_SIGNATURES`, `CAREER_SIGNATURES` or a
 * Classic template, never from a typed sentence. Listing one would promise a
 * GM something typing cannot buy. **Add a row here whenever a reader above
 * gains a family**, or the panel goes quietly out of date; the census in
 * `signature-phrases.test.mjs` holds a floor on the count for that reason.
 *
 * The words themselves are 08 §20's own, trimmed to the clause the regular
 * expression matches, because the chapter is what the readers were written
 * against. `lang/en.json` carries the example and what it becomes, under
 * `AZEROTH.Forge.Phrases.Example.<key>` and `.Reads.<key>`.
 *
 * @type {ReadonlyArray<{key: string, group: string, check: (d: object) => boolean}>}
 */
export const SIGNATURE_PHRASES = Object.freeze([
  /* ---- who it is for, and when (seedGates) ---- */
  { key: "classGate", group: "gate", check: d => (d.gates ?? []).some(g => g.kind === "class") },
  { key: "creatureTypeGate", group: "gate", check: d => (d.gates ?? []).some(g => g.kind === "creatureType") },
  { key: "belowHalfHealth", group: "gate", check: d => (d.gates ?? []).some(g => g.kind === "belowHalfHealth") },
  { key: "hasNotMoved", group: "gate", check: d => (d.gates ?? []).some(g => g.kind === "hasNotMoved") },
  { key: "targetHasNotActed", group: "gate", check: d => (d.gates ?? []).some(g => g.kind === "targetHasNotActed") },
  { key: "corruptionGate", group: "gate", check: d => (d.gates ?? []).some(g => g.kind === "corruption" && g.value === "fel 1") },

  /* ---- true while it is worn (seedStanding) ---- */
  { key: "damageRatingBonus", group: "standing", check: d => (d.grants ?? []).includes("+2 Damage Rating") },
  { key: "damageRatingSet", group: "standing", check: d => d.damageRatingSet === 8 },
  { key: "attributeGrant", group: "standing", check: d => (d.grants ?? []).includes("+2 Strength") },
  { key: "schoolSpellDamage", group: "standing", check: d => d.spellDamage?.school === "nature" && d.spellDamage?.amount === 1 },
  // The lead, 2026-09-14: *spell and/or a school should be possible.* Two rows,
  // because they are two readers and a GM has to be able to learn either.
  { key: "spellCostSchool", group: "standing", check: d => d.spellCost?.school === "nature" && d.spellCost?.amount === 1 },
  { key: "spellCostNamed", group: "standing", check: d => d.empowers?.name === "Lightning Shield" && d.empowers?.cost === 2 },
  { key: "extraHealing", group: "standing", check: d => d.healingBonus === 2 },
  { key: "corruptionReduction", group: "standing", check: d => d.corruptionReduction?.track === "fel" && d.corruptionReduction?.amount === 1 },
  { key: "blockBonus", group: "standing", check: d => d.blockBonus === 2 },
  { key: "criticalRange", group: "standing", check: d => d.criticalOn === 19 },
  { key: "cancelsBane", group: "standing", check: d => d.cancelsBane === "longRange" },

  /* ---- when your blow lands (seedHit) ---- */
  { key: "onHitDamage", group: "hit", check: d => d.onHit?.damage?.amount === 3 && d.onHit?.damage?.type === "nature" },
  { key: "onHitCondition", group: "hit", check: d => d.onHit?.sl === 2 && d.onHit?.condition?.id === "slowed" && d.onHit?.condition?.until === "endOfNextTurn" },
  { key: "sunder", group: "hit", check: d => d.onHit?.sunder === 1 },
  { key: "momentum", group: "hit", check: d => d.onHit?.momentum === 1 },
  { key: "onHitHeal", group: "hit", check: d => d.onHit?.heal === 2 },

  /* ---- when a blow lands on you (seedStruck) ---- */
  { key: "whenStruckDamage", group: "struck", check: d => d.whenStruck?.damage?.amount === 3 && d.whenStruck?.damage?.type === "fire" },

  /* ---- at the top of your turn (seedStanding's beat) ---- */
  { key: "tickHealth", group: "tick", check: d => d.tick?.health === 1 },
  { key: "tickMana", group: "tick", check: d => d.tick?.mana === 1 },

  /* ---- what pressing it costs (seedPress) ---- */
  { key: "halfAction", group: "cost", check: d => d.use?.action === "half" },
  { key: "poolCost", group: "cost", check: d => d.use?.cost?.pool === "rage" && d.use?.cost?.amount === 4 },

  /* ---- what pressing it does (seedPress) ---- */
  { key: "regainHealth", group: "press", check: d => d.use?.heal?.health === 4 },
  { key: "regainMana", group: "press", check: d => d.use?.heal?.mana === 12 },
  { key: "areaDamage", group: "press", check: d => d.use?.damage?.amount === 8 && Boolean(d.use?.area) },
  { key: "halveDamage", group: "press", check: d => d.use?.mitigates?.halve === true },

  /* ---- it casts (castFromText) ---- */
  { key: "mayCast", group: "cast", check: d => d.kind === "spell" },

  /* ---- how often, and how long (usesFromText, untilIn) ---- */
  { key: "onceLongRest", group: "limit", check: d => d.use?.uses?.per === "long" && d.use?.uses?.max === 1 },
  { key: "duration", group: "limit", check: d => d.onHit?.condition?.until === "encounter" },

  /* ---- ONE SENTENCE AT A TIME (D-722; the lead, 2026-09-14) ---- */
  // The row the whole shape exists for, and the one a GM cannot learn any other
  // way: a gate covers ONLY ITS OWN SENTENCE, so a Signature that retaliates for
  // everybody and adds a Damage Rating for a Shaman is written as two sentences
  // and read as two. It sits in the `gate` group because that is what the
  // sentence teaches — where a gate reaches.
  {
    key: "gatedSentence",
    group: "gate",
    check: d => (d.gated ?? []).length === 1
      && (d.gated[0].gates ?? []).some(g => g.kind === "class")
      && (d.gated[0].grants ?? []).includes("+2 Damage Rating")
      && d.whenStruck?.damage?.amount === 1
  }
]);

/**
 * The groups, in the order the panel prints them: who it is for, then what it
 * does standing, off a blow, off a blow taken, each turn, then what a press
 * costs and does, then a casting, then the qualifiers that bound it. A group
 * with no row is not drawn.
 */
export const SIGNATURE_PHRASE_GROUPS = Object.freeze([
  "gate", "standing", "hit", "struck", "tick", "cost", "press", "cast", "limit"
]);

/* -------------------------------------------- */
/*  What a descriptor says, in short lines       */
/* -------------------------------------------- */

/**
 * WHAT THIS DESCRIPTOR WILL ACTUALLY DO, as short lines a window can print.
 *
 * `rules/consumables.mjs#useLines` is the shape — a code and its numbers, so
 * the rule stays pure and the caller localises `AZEROTH.Signature.Summary.*`.
 * It exists for the Forge's preview: a GM typing a Signature at the bench had
 * no way to see whether the system read a word of it, and the kind that
 * `plan()` priced was thrown away at the storage boundary rather than shown.
 *
 * Every family the descriptor carries has a line, so a preview that prints
 * nothing means nothing was read — which is the answer the GM needs.
 *
 * @param {object} signature  a whole descriptor
 * @returns {Array<{code: string, params: object}>}
 */
export function signatureSummary(signature) {
  const d = signature ?? emptySignature();
  const lines = [];
  if (d.label) lines.push({ code: "Run", params: { label: d.label } });
  lines.push(...partLines(d));

  // WHAT PRESSING IT COSTS AND DOES. Only the trunk has a button (D-722), so
  // this half is never asked of a branch.
  const say = (code, params = {}) => lines.push({ code, params });
  const u = d.use ?? {};
  if (u.cost?.pool && u.cost?.amount) say("UseCost", { n: u.cost.amount, pool: u.cost.pool });
  if (u.uses?.per) say("UseUses", { n: u.uses.max ?? 0, per: u.uses.per });
  if (u.heal?.health) say("UseHealth", { n: u.heal.health });
  if (u.heal?.mana) say("UseMana", { n: u.heal.mana });
  if (u.heal?.fatigue) say("UseFatigue", { n: u.heal.fatigue });
  if (u.damage?.amount) say("UseDamage", { n: u.damage.amount, type: u.damage.type ?? "" });
  if (u.area) say("UseArea", { area: u.area });
  if (u.mitigates?.halve) say("UseHalves", {});
  if (u.mitigates?.amount) say("UseReduces", { n: u.mitigates.amount });
  for (const id of u.statuses ?? []) say("UseStatus", { key: id });
  for (const id of u.ends ?? []) say("UseEnds", { key: id });
  // A change names a DATA PATH, never a config key: `path` rather than `key`
  // so a caller localising every `key` it is handed does not try to look up
  // `system.speed` in `lang/en.json`.
  for (const change of u.changes ?? []) say("UseChange", { path: change.key, value: change.value });
  if (u.resist?.resilience) say("UseResist", { key: u.resist.resilience, dc: u.resist.dc ?? 0 });
  pressLines(u, say);
  if (d.summon?.entry) say("Summon", { entry: d.summon.entry, n: d.summon.count ?? 1 });

  // THE OTHER BUTTONS (D-910): each under its run's name, in the trunk's own
  // press vocabulary.
  for (const { press } of pressesOf(d)) {
    say("Press", { label: press.label });
    if (press.cost?.pool && press.cost?.amount) say("UseCost", { n: press.cost.amount, pool: press.cost.pool });
    if (press.uses?.per) say("UseUses", { n: press.uses.max ?? 0, per: press.uses.per });
    if (press.heal?.health) say("UseHealth", { n: press.heal.health });
    if (press.heal?.mana) say("UseMana", { n: press.heal.mana });
    if (press.damage?.amount) say("UseDamage", { n: press.damage.amount, type: press.damage.type ?? "" });
    if (press.area) say("UseArea", { area: press.area });
    for (const change of press.changes ?? []) say("UseChange", { path: change.key, value: change.value });
    if (press.resist?.resilience) say("UseResist", { key: press.resist.resilience, dc: press.resist.dc ?? 0 });
    pressLines(press, say);
  }

  // AND EVERY GATED SENTENCE, UNDER ITS OWN GATE (D-722). A `GatedBy` line
  // opens each one, so a preview that lists a Damage Rating bonus says which
  // bearer gets it instead of reading as a flat bonus for everybody. The gate
  // clauses travel as they are stored and the caller localises them — this
  // module is pure and `AZEROTH.signatureGates` is a table of lang keys.
  for (const branch of d.gated ?? []) {
    // A Legendary's run names itself first (D-910), so a preview of four runs
    // reads as four things and not as one list.
    if (branch.label) say("Run", { label: branch.label });
    say("GatedBy", { gates: branch.gates ?? [] });
    lines.push(...partLines(branch));
  }
  return lines;
}

/**
 * The two press families D-910 added, for the trunk's `use` and for each
 * entry of `presses` alike. `say` is the caller's, spelled out so
 * `signatures.test.mjs` reads the codes out of this source.
 */
function pressLines(u, say) {
  for (const f of u?.onFail ?? []) if (f?.id) say("UseOnFail", { key: f.id });
  const gain = u?.corruptionGain ?? null;
  if (gain?.track && gain?.amount) {
    say("CorruptionGain", { n: gain.amount, track: gain.track, key: gain.resilience ?? "", dc: gain.dc ?? 0 });
  }
  // The Legendary presses (D-911).
  if (u?.noDamage) say("UseNoDamage", {});
  if (u?.fill) say("UseFill", { pool: u.fill });
  if (u?.attacks?.count) say("UseAttacks", { n: u.attacks.count });
  if (u?.trigger) say("UseTrigger", {});
  if (u?.echo) say("UseEcho", {});
  if (u?.weaponDamage) say("UseWeaponDamage", { n: u.weaponDamage });
  // Phase B2 (D-912).
  if (u?.feature) say("UseFeature", { name: u.feature });
  if (u?.castHeal) say("UseCastHeal", { n: u.castHeal });
  if (u?.gather?.feet) say("UseGather", { feet: u.gather.feet });
  if (u?.drain) say("UseDrain", { key: u.drain });
  if (u?.onFailEnds) say("UseOnFailEnds", {});
  if (u?.tether?.feet) say("UseTether", { feet: u.tether.feet });
  if (u?.rewind) say("UseRewind", {});
  if (u?.move?.feet) say("UseMove", { feet: u.move.feet });
  if (u?.negates) say("UseNegates", {});
  if (u?.arcWiden) say("UseArcWiden", { n: u.arcWiden });
  if (u?.breathSchool) say("UseBreathSchool", {});
}

/**
 * The lines one PART says — the trunk's standing and trigger families, or a
 * gated branch's (D-722). Split out of `signatureSummary` so a branch is
 * summarised by the same code as the trunk and neither can gain a family the
 * other's preview omits.
 *
 * **`say` is spelled out here for a reason**: `signatures.test.mjs` reads the
 * codes out of this source with `say("…"` and holds `lang/en.json` against
 * them, so a code emitted through any other name is invisible to that census.
 */
function partLines(d) {
  const lines = [];
  const say = (code, params = {}) => lines.push({ code, params });

  for (const text of d.grants ?? []) say("Grant", { text });
  for (const id of d.refuses ?? []) say("Refuses", { key: id });
  if (d.criticalOn !== null && d.criticalOn !== undefined) say("CriticalOn", { n: d.criticalOn });
  if (d.damageMultiplier) say("DamageMultiplier", { n: d.damageMultiplier });
  if (d.damageRatingSet !== null && d.damageRatingSet !== undefined) say("DamageRatingSet", { n: d.damageRatingSet });
  if (d.spellDamage?.school && d.spellDamage?.amount) say("SpellDamage", { n: d.spellDamage.amount, school: d.spellDamage.school });
  if (d.chosenSpellHealing === true) say("ChosenSpellHealing");
  if (d.firstParryTest === true) say("FirstParryTest");
  if (d.weaponKillReward === true) say("WeaponKillReward");
  if (d.scalingHitDamage === true) say("ScalingHitDamage");
  if (d.chosenSpellDamage?.school && d.chosenSpellDamage?.attribute) say("ChosenSpellDamage", {
    school: d.chosenSpellDamage.school, attribute: d.chosenSpellDamage.attribute
  });
  if (d.chosenSpellDamage?.school && d.chosenSpellDamage?.skill) say("ChosenSkillSpellDamage", {
    school: d.chosenSpellDamage.school, skill: d.chosenSpellDamage.skill
  });
  if (d.chosenSpellDamage?.school && d.chosenSpellDamage?.casting) say("ChosenCastingSpellDamage", {school:d.chosenSpellDamage.school});
  if (d.spellCost?.school && d.spellCost?.amount) say("SpellCost", { n: d.spellCost.amount, school: d.spellCost.school });
  if (d.healingBonus) say("HealingBonus", { n: d.healingBonus });
  if (d.corruptionReduction?.track && d.corruptionReduction?.amount) {
    say("CorruptionReduction", { n: d.corruptionReduction.amount, track: d.corruptionReduction.track });
  }
  if (d.corruptionGain?.track && d.corruptionGain?.amount) {
    say("CorruptionGain", { n: d.corruptionGain.amount, track: d.corruptionGain.track, key: d.corruptionGain.resilience ?? "", dc: d.corruptionGain.dc ?? 0 });
  }
  if (d.cancelsBane) say("CancelsBane", { key: d.cancelsBane });
  if (d.blockBonus) say("BlockBonus", { n: d.blockBonus });
  if (d.armorPointsPerTier) say("ArmorPointsPerTier", { n: d.armorPointsPerTier });
  // An aura says what it gives, one line a payload (D-910's two and D-911's four); the
  // reduction line names the reach itself, every other names it once on its own.
  if (auraStands(d.aura)) {
    if (d.aura.damageReduction) say("Aura", { n: d.aura.damageReduction, feet: d.aura.feet, key: d.aura.targets });
    else say("AuraReach", { feet: d.aura.feet, key: d.aura.targets });
    if (d.aura.spellDamage) say("AuraSpellDamage", { n: d.aura.spellDamage });
    if (d.aura.floor?.ward) say("AuraFloor", { n: d.aura.floor.ward });
    if (d.aura.boon?.boons) say("AuraBoon", { n: d.aura.boon.boons, key: d.aura.boon.resilience ?? "" });
    if (d.aura.bane?.banes) say("AuraBane", { n: d.aura.bane.banes, key: d.aura.bane.resilience ?? "" });
    if (d.aura.attackDamage) say("AuraAttack", { n: d.aura.attackDamage });
    if (d.aura.tick?.damage) say("AuraTick", { n: d.aura.tick.damage, type: d.aura.tick.type ?? "" });
  }
  if (d.empowers?.name) {
    if (d.empowers.damageRating) say("EmpowerDamage", { n: d.empowers.damageRating, name: d.empowers.name });
    if (d.empowers.heal) say("EmpowerHeal", { n: d.empowers.heal, name: d.empowers.name });
    if (d.empowers.cost) say("EmpowerCost", { n: d.empowers.cost, name: d.empowers.name });
  }
  if (d.bound?.damage) say("BoundDamage", { n: d.bound.damage });
  // The Legendary readers (D-911).
  if (d.wardFloor?.ward) say("WardFloor", { n: d.wardFloor.ward, schools: (d.wardFloor.schools ?? []).join(", ") });
  if (d.noFallDamage) say("NoFallDamage", {});
  if (d.ignoresReload) say("IgnoresReload", {});
  if (d.pastImmune) say("PastImmune", { type: d.pastImmune });
  if (d.sandOnFail) say("SandOnFail", { n: d.sandOnFail });
  if (d.poolOnHurt?.pool && d.poolOnHurt?.amount) say("PoolOnHurt", { n: d.poolOnHurt.amount, pool: d.poolOnHurt.pool });
  if (d.onBlock?.pool?.pool && d.onBlock?.pool?.amount) say("OnBlockPool", { n: d.onBlock.pool.amount, pool: d.onBlock.pool.pool });
  if (d.onBlock?.condition?.id) say("OnBlockCondition", { key: d.onBlock.condition.id });
  if (d.tickHealBonus) say("TickHealBonus", { n: d.tickHealBonus });
  for (const r of d.refusesFrom ?? []) if (r?.id) say("RefusesFrom", { key: r.id, creature: r.creatureType ?? "" });
  if (d.bossCannotIgnore) say("BossCannotIgnore", {});
  if (d.adaptiveWard) say("AdaptiveWard", { n: d.adaptiveWard });
  if (d.killTemp?.perTier) say("KillTemp", { n: d.killTemp.perTier });
  // Phase B2 (D-912).
  if (d.breathHalf) say("BreathHalf", {});
  if (d.attackerBane?.faction && d.attackerBane?.banes) say("AttackerBane", { n: d.attackerBane.banes, faction: d.attackerBane.faction });
  if (d.phantomShot?.type) say("PhantomShot", { n: d.phantomShot.rating ?? 0, type: d.phantomShot.type });
  if (d.resistBane?.banes) say("ResistBane", { n: d.resistBane.banes, spell: d.resistBane.name || d.resistBane.school || "" });
  if (d.freeSpell) say("FreeSpell", { spell: d.freeSpell });
  if (d.touchHealingFeet) say("TouchHealing", { feet: d.touchHealingFeet });
  if (d.ordination) say("Ordination", {});
  if (d.spellDamageTest?.school && d.spellDamageTest?.onFail?.id) say("SpellDamageTest", { school: d.spellDamageTest.school, key: d.spellDamageTest.onFail.id });
  if (d.sizeStep) say("SizeStep", { n: d.sizeStep });
  if ((d.secondReaction ?? []).length) say("SecondReaction", { names: d.secondReaction.join(", ") });

  if (d.onHit?.damage?.amount) say("OnHitDamage", { n: d.onHit.damage.amount, type: d.onHit.damage.type ?? "" });
  if (d.onHit?.damageFromCondition?.id) {
    say("OnHitDamageFromCondition", { n: d.onHit.damageFromCondition.per, key: d.onHit.damageFromCondition.id });
  }
  if (d.onHit?.condition?.id && d.onHit?.conditionFromDamage) {
    say("OnHitConditionFromDamage", { key: d.onHit.condition.id, n: d.onHit.conditionFromDamage });
  } else if (d.onHit?.condition?.id) say("OnHitCondition", { key: d.onHit.condition.id });
  for (const extra of d.onHit?.conditions ?? []) if (extra?.id) say("OnHitCondition", { key: extra.id });
  if (d.onHit?.bane) say("OnHitBane", { n: d.onHit.bane });
  if (d.onHit?.sunder) say("OnHitSunder", { n: d.onHit.sunder });
  if (d.onHit?.momentum) say("OnHitMomentum", { n: d.onHit.momentum });
  // Two calls and not one ternary: `signatures.test.mjs` reads the CODES out
  // of this source with `say("…"` and a computed one is invisible to it, which
  // would leave a lang key nobody could be shown to emit.
  if (d.onHit?.heal && d.onHit?.healFeet) say("OnHitHealAlly", { n: d.onHit.heal, feet: d.onHit.healFeet });
  else if (d.onHit?.heal) say("OnHitHeal", { n: d.onHit.heal });
  if (d.onHit?.mana) say("OnHitMana", { n: d.onHit.mana });
  if (d.onHit?.push) say("OnHitPush", { feet: d.onHit.push });
  if (d.onHit?.arc?.targets) say("OnHitArc", { n: d.onHit.arc.targets, feet: d.onHit.arc.feet ?? 0 });
  if (d.onHit?.per) say("OnHitPer", { per: d.onHit.per });
  if (d.onHit?.noHealing) say("OnHitNoHealing", {});
  if (d.onHit?.signatureDC) say("OnHitSignatureDC", {});

  if (d.onKill?.bane) say("OnKillBane", { n: d.onKill.bane, feet: d.onKill.feet ?? 0 });
  if (d.onKill?.condition?.id) say("OnKillCondition", { key: d.onKill.condition.id });

  if (d.whenStruck?.damage?.amount) say("WhenStruckDamage", { n: d.whenStruck.damage.amount, type: d.whenStruck.damage.type ?? "" });
  if (d.whenStruck?.condition?.id) say("WhenStruckCondition", { key: d.whenStruck.condition.id });

  if (d.tick?.health) say("TickHealth", { n: d.tick.health });
  if (d.tick?.mana) say("TickMana", { n: d.tick.mana });
  return lines;
}

/* -------------------------------------------- */
/*  08 §20's twenty-six, by hand                 */
/* -------------------------------------------- */

/**
 * What each 08 §20 named item's Signature DOES, keyed by the item's
 * `system.identifier` and written in the chapter's own order.
 *
 * Reviewed one entry at a time against §20 and against the pack copy in
 * `packs-src/{weapons,armor,gear}`; `signature-tables.test.mjs` fails on an
 * item the pack carries a Signature for and this lacks, on a row naming an
 * item the pack does not hold, and on a §20 item with no Signature that has a
 * row anyway.
 *
 * **ALL TWENTY-SIX FIRE** (D-696). It was fifteen inert, then seven, then six,
 * and the last six went in one pass because the lead WROTE THEM: five of them
 * were not gaps in this vocabulary at all but sentences that turned on
 * something no system could judge — *a creature already taking Fire damage over
 * time*, *a creature standing in fire*, *while you hold both this and its
 * pair*, a book that refuses to open, a rule about what Shapeshift does not
 * take away — and rewriting the sentence is what made them readable. The
 * ceiling in `signature-tables.test.mjs` is 0 now and it may only stay there.
 *
 * What the last pass added, and what each was written for:
 *
 * | Key | Written for |
 * |---|---|
 * | `onHit.damageFromCondition` | Perdition's Blade: damage off the TARGET's Scorched |
 * | `onHit.conditionFromDamage` | Sulfuron Hammer: Scorched off the DAMAGE, its mirror |
 * | `onHit.per` | Dal'Rend's *each round* and Sulfuron's *each turn* |
 * | `gate("blow")` | Dal'Rend's *an Off-Hand Attack or you moved* — an OR of two |
 * | `armorPointsPerTier` | Stormrage Raiment: Armor Points scaled by the bearer |
 * | `aura` | the Bulwark of Tyr's Hand: the one Signature that lands on SOMEBODY ELSE |
 *
 * and the Grimoire needed no key at all — its gate already read, and all it
 * was missing was something to grant.
 *
 * **A `standing` row with nothing in its arrays would meet the census while
 * doing nothing**, which is why every one of these ships with the assertion
 * that its consumer moved (`signature-doors.test.mjs`) rather than with a unit
 * test over the rule alone.
 *
 * **A `none` row still carries its gate** where the chapter states one. The
 * gate reads even where the effect does not, and the item's Signature block
 * has to be able to say who the sentence is for. It contributes nothing to
 * `signatureEffects`, which reads a `none` row's empty parts like any other.
 *
 * **The three `+N Damage Rating` grants belong to the ROLL, not to the
 * standing column.** Every one of them is gated on the creature struck or on
 * whether it has acted, so there is no answer to *what does this grant* until
 * there is a target — and `grants.mjs#grantsFor`, which the Overview tab
 * reads, drops a scalar family on purpose because no affix sells one. Wire
 * them where the attack is built, with the target in the snapshot.
 */
export const BOOK_SIGNATURES = Object.freeze({
  /* ---- Legendary weapons ---- */
  //
  // **A LEGENDARY PRINTS EACH SIGNATURE AS ITS OWN RUN** (D-909), and each row
  // names every run the chapter prints (D-910): the TRUNK is a run that fires -
  // the one button where a run presses - carrying its `label`, every other run
  // is a `run()` branch under its own gate, and a second button is a `press()`
  // in `presses`. A run whose mechanic waits on a reader the next phase builds
  // is `parked()` with the family it waits on, under a ceiling of its own in
  // `signature-tables.test.mjs` that may only fall. `tools/parse-book` throws
  // on a run this row names no part for, and on a part naming no run.

  // *Against undead, its damage is doubled before Ward is subtracted, and a
  // creature reduced to 0 Health by it leaves nothing to raise.* The
  // multiplier is `damageMultiplier`, which says BEFORE Ward by being a
  // multiplier at all — 08 §6's grammar only adds, and `onHit.damage` would
  // add a flat amount after. The second clause is what the corpse does
  // afterwards and stays on the item's own sentence.
  //
  // *The Crystal's Light: On a hit against an undead creature, you regain 2
  // Health* - `onHit.heal`, paid to the bearer at the attack door.
  //
  // *Ash of the Risen: An undead creature it hits cannot regain Health until the
  // end of its next turn* - 04's Mortal Strike mark (`onHit.noHealing`, D-911),
  // spanned on the creature struck. *Scarlet Reckoning* is a Bane the ATTACKER
  // takes off this item at the attack door (`attackerBane`, D-912), a member of
  // the Scarlet Crusade read through `rules/factions.mjs` (the lead, on O-319:
  // *"Bestiary entries naming it"*, and a GM-set faction).
  ashbringer: standing({
    label: "Signature",
    gates: [gate("creatureType", "undead")], damageMultiplier: 2,
    gated: [
      run("Scarlet Reckoning", { attackerBane: { faction: "Scarlet Crusade", banes: 1 } }),
      run("Ash of the Risen", { gates: [gate("creatureType", "undead")], onHit: { noHealing: true } }),
      run("The Crystal's Light", { gates: [gate("creatureType", "undead")], onHit: { heal: 2 } })
    ]
  }),

  // *A Shaman wielding it may spend a Half-Action to call the elements: every
  // creature within 15 feet takes 4 Nature damage, and Ward applies.* Ward is
  // the damage pipeline's and needs no saying.
  //
  // D-911: *Wind of the Doomhammer* is a press of its own - two more Attack
  // Tests through the attack door at the creature targeted, nothing more spent
  // (`use.attacks`); *when an Attack Test with it hits* is the table's moment
  // to press it. *Warchief's Hammer* is the item aura's Boon on Spirit
  // Resilience Tests, reaching the Horde alone (`aura.who.faction`, 02 §1's
  // peoples through `rules/factions.mjs`). Call of the Elements (a totem
  // planted as part of an Attack for no Half-Action) waits: 02's Totem is a
  // class feature's Use with its own chooser, budget and Mana, and no door
  // takes it from an item.
  "the-doomhammer": use({
    label: "Signature",
    gates: [gate("class", "Shaman")],
    use: { action: "half", damage: { amount: 4, type: "nature" }, area: "Each creature within 15 ft" },
    gated: [
      run("Warchief's Hammer", {
        gates: [gate("faction", "Horde")],
        aura: { feet: 30, targets: "allies", boon: { kind: "resilience", resilience: "spirit", boons: 1 }, who: { faction: "Horde" } }
      }),
    ],
    presses: pressMap(
      press("Wind of the Doomhammer", {
        gates: [gate("class", "Shaman")],
        uses: once("short"), attacks: { count: 2, same: true }
      }),
      // *Call of the Elements* (D-912): 02's Totem through `useFeature`, its Mana
      // paid and no Half-Action (`use.feature`), once an encounter.
      press("Call of the Elements", {
        gates: [gate("class", "Shaman")],
        uses: once("encounter"), feature: "Totem"
      })
    )
  }),

  // *When an attack with it reduces a creature to 0 Health, every enemy within
  // 30 feet that saw it takes a Bane on their next Attack Test.* The seventh
  // kind: `onHit` fires off a blow that LANDS and this fires off one that
  // FINISHES. *That saw it* is the table's — the descriptor says 30 feet and
  // the sentence beside it says who was watching.
  //
  // **TWO BUTTONS, so `presses`** (D-910). Hellscream's Test is the Signature
  // DC (`signatureDC`, at the door) and its Frightened lands on whoever FAILS,
  // through `use.onFail`. Blood of Mannoroth's +2 is THIS AXE's (*adds 2 to its
  // Damage Rating*; D-911, the architect's review of D-910): `use.weaponDamage`
  // on an effect naming the item, which the attack door adds to this weapon's
  // blows alone, until the encounter ends - and its Corruption is a Spirit Test
  // at DC 20 first.
  gorehowl: onKill({
    label: "Signature",
    onKill: { feet: 30, bane: 1 },
    gated: [run("Mannoroth's End", { gates: [gate("creatureType", "demon")], criticalOn: 18 })],
    presses: pressMap(
      press("Hellscream", {
        action: "half", uses: once("short"), area: "Each enemy within 30 ft",
        resist: { resilience: "spirit", dc: null },
        onFail: [{ id: "frightened", value: null, until: "endOfNextTurn" }]
      }),
      press("Blood of Mannoroth", {
        gates: [gate("race", "Orc")],
        action: "half", uses: once("long"),
        weaponDamage: 2,
        duration: { value: null, units: "encounter" },
        corruptionGain: corruption("fel", 1, "spirit", 20, "press")
      })
    )
  }),

  // *On a hit, the attack arcs to one other creature within 15 feet for 3
  // Nature damage, and that creature is Slowed until the end of its next
  // turn.* The whole sentence, and `arc` was written for this item.
  //
  // Windseeker's +10 Speed is an 08 §6 grant, and *a fall deals you no damage*
  // is the damage door's `falling` blow landing nothing (`noFallDamage`, D-911),
  // as 02 §5's Wings Beneath already does. Thunderaan's Fury (the next arc
  // widened to four) waits: the arc itself is resolved by the table - the card
  // prints the sentence and `arc` lays no damage on anybody (D-692) - so a
  // press that widens it would be a button over nothing (D-681).
  "thunderfury-blessed-blade-of-the-windseeker": onHit({
    label: "Signature",
    onHit: {
      damage: { amount: 3, type: "nature" },
      condition: { id: "slowed", until: "endOfNextTurn" },
      arc: { targets: 1, feet: 15 }
    },
    gated: [run("Windseeker", { grants: ["+10 Speed"], noFallDamage: true })],
    // *Thunderaan's Fury* (D-912; the lead, on O-319: *"Automate the arc and the
    // Fury"*): the arc lands now (`effects/legendary-doors.mjs#landArcs`), and the
    // press widens the NEXT one to four (`use.arcWiden`).
    presses: pressMap(press("Thunderaan's Fury", { uses: once("short"), arcWiden: 4 }))
  }),

  // *As a Full Action, every creature within 20 feet takes 8 Fire damage. The
  // bearer is not exempt.* The area says every creature, so the exemption
  // clause is the entry telling a reader that it meant it.
  //
  // Wrath of Ragnaros is an on-hit push and a Prone at SL 2. Hand of Ragnaros
  // is the item aura on the bearer's ENEMIES within 5 feet carrying a laid
  // Fire tick (`aura.tick`, D-911), landed at each one's own turn start with
  // Ward by `effects/ticks.mjs`. Firelord's Grip is a Ward FLOOR on the bearer
  // (`wardFloor`, D-911) - *unless you already have more* - taken in
  // `afterFinalPhase`, where an 08 §6 grant would ADD.
  "sulfuras-hand-of-ragnaros": use({
    label: "Signature",
    use: { action: "full", damage: { amount: 8, type: "fire" }, area: "Each creature within 20 ft" },
    gated: [
      run("Hand of Ragnaros", { aura: { feet: 5, targets: "enemies", tick: { damage: 2, type: "fire" } } }),
      run("Wrath of Ragnaros", { onHit: { sl: 2, push: 15, condition: { id: "prone" } } }),
      run("Firelord's Grip", { wardFloor: { ward: 3, schools: ["fire"] } })
    ]
  }),

  // *Against dragonkin its Damage Rating is 8, and a dragonkin it strikes
  // cannot use a breath weapon until the end of its next turn.* A Damage
  // Rating SET, not a bonus: 08 §6's grammar only adds, and writing `+3` here
  // would be this table doing arithmetic against the entry's own Rating 5 and
  // going stale the day that moves. The breath weapon is a refusal scoped to
  // the creature struck rather than to the bearer, which nothing carries, so
  // that clause stays on the item's own sentence. Dragonslayer's Nerve is a
  // refusal scoped to its source (`refusesFrom`, D-911), judged where the
  // condition is laid and the layer is known. Foror's Lesson (a breath as a
  // SOURCE) waits: nothing a creature's ability, a feature or a card records
  // says that its damage is a breath weapon, so the damage door cannot tell.
  quelserrar: standing({
    label: "Signature",
    gates: [gate("creatureType", "dragonkin")], damageRatingSet: 8,
    gated: [
      // *Foror's Lesson* (D-912; the lead, on O-319: *"Abilities and spells named
      // Breath"*): the damage door halves a blow whose card names a Breath.
      run("Foror's Lesson", { breathHalf: true }),
      run("Dragonslayer's Nerve", { refusesFrom: [{ id: "frightened", creatureType: "dragonkin" }] })
    ]
  }),

  // *While a Mage, Priest, Warlock or Druid wields it, every ally within 30
  // feet adds 1 to the Damage Rating of every spell they cast. The wielder
  // counts as an ally.* The item's aura carries `spellDamage` now (D-910),
  // the payload Demonic Pact's aura already lays. Guardian's Economy is a
  // school discount with a floor (`spellCost.minimum`); The Way to Karazhan
  // is a door to a place.
  "atiesh-greatstaff-of-the-guardian": standing({
    label: "Aura of the Guardian",
    gates: [gate("class", "Mage, Priest, Warlock, Druid")],
    aura: { feet: 30, targets: "allies", spellDamage: 1 },
    gated: [
      run("Guardian's Economy", { gates: [gate("class", "Mage")], spellCost: { school: "arcane", amount: 2, minimum: 1 } }),
      run("The Way to Karazhan", { reason: "narrative" })
    ]
  }),

  // *Raise the Fallen: Once per Long Rest, as a Full Action, ... two Risen
  // Skeletons rise beside it and fight on your side until the end of the
  // encounter. Then make a Body Resilience Test at DC 20. On a failure, gain
  // 1 Undeath Corruption.* D-691's summon, placed from the card, and the
  // charge offered at the press. Unholy Grasp is an on-hit Entangled at SL 2
  // whose Test to break free is against the Signature DC (`onHit.signatureDC`,
  // D-911): the attack card carries 07's escape (`rules/escapes.mjs`) and the
  // Inflict door writes it on the condition. Rivendare's Dread is the item aura
  // on LIVING enemies (`aura.who.living`, 07's Chain Lightning's reading) laying
  // a Bane on their Spirit Resilience Tests (D-911).
  "dreadwake-runeblade-of-rivendare": use({
    label: "Raise the Fallen",
    use: { action: "full", uses: once("long"), corruptionGain: corruption("undeath", 1, "body", 20, "press") },
    summon: { entry: "Risen Skeleton", count: 2, side: "summoner", from: "now" },
    gated: [
      run("Unholy Grasp", { onHit: { sl: 2, condition: { id: "entangled" }, signatureDC: true } }),
      run("Rivendare's Dread", {
        aura: { feet: 15, targets: "enemies", bane: { kind: "resilience", resilience: "spirit", banes: 1 }, who: { living: true } }
      })
    ]
  }),

  // *The Lightbringer's Verdict: Once per encounter, on a hit at SL 3, the
  // target is Stunned.* An on-hit row once an encounter (`onHit.per`), and the
  // Stun ends where A1 ends one the source does not span: *At the end of your
  // next turn* (`until: "endOfNextTurn"`; the architect's review of D-910, which
  // found it laid with no end). The Lightbringer's Ward is the item aura's Ward
  // FLOOR in one school (D-910). *Uther's Stand* is a press of its own, a
  // Reaction once per Long Rest laying an effect the damage door reads as no
  // damage at all until the start of the Paladin's next turn (`use.noDamage`).
  "hammer-of-the-lightbringer": onHit({
    label: "The Lightbringer's Verdict",
    onHit: { sl: 3, condition: { id: "stunned", until: "endOfNextTurn" }, per: "encounter" },
    presses: pressMap(
      press("Uther's Stand", {
        gates: [gate("class", "Paladin")],
        action: "reaction", uses: once("long"), noDamage: true
      })
    ),
    gated: [
      run("The Lightbringer's Ward", {
        gates: [gate("class", "Paladin")],
        aura: { feet: 30, targets: "allies", floor: { ward: 2, schools: ["shadow"] } }
      })
    ]
  }),

  // *The Prophet's Command: Once per Short Rest, as a Half-Action, a creature
  // you hit this turn makes a Spirit Resilience Test against your Signature
  // DC. On a failure it is Charmed by you until the end of its next turn.*
  // Soulflayer's Venom is an on-hit Poisoned 2 at SL 2 shed against the
  // Signature DC (`onHit.signatureDC`: A1's Poisoned shed DC on the effect,
  // D-911). Hexed Fang is an on-hit Silenced behind a `hidden` gate, the fact
  // the attack door reads off `effects/stealth.mjs#isHiddenFor` (D-911).
  "serpent-fang-of-the-prophet": use({
    label: "The Prophet's Command",
    use: {
      action: "half", uses: once("short"), resist: { resilience: "spirit", dc: null },
      onFail: [{ id: "charmed", value: null, until: "endOfNextTurn" }]
    },
    gated: [
      run("Soulflayer's Venom", { onHit: { sl: 2, condition: { id: "poisoned", value: 2 }, signatureDC: true } }),
      run("Hexed Fang", {
        gates: [gate("class", "Rogue"), gate("hidden")],
        onHit: { condition: { id: "silenced", until: "endOfNextTurn" } }
      })
    ]
  }),

  // *Farstrider's Poise: A Ranger drawing it takes no Bane for shooting while
  // Engaged.* 06's Engaged Bane on a ranged attack, cancelled on the dialog
  // (`AZEROTH.cancellableBanes.engagedRanged`). Starfall Volley is a press of
  // its own (D-911): an action, then one Attack Test through the attack door at
  // each creature targeted (`use.attacks`, `same: false`), the 15-foot circle
  // the table's. Starfire Arrow (a shot with no bundle) waits: 06's launcher
  // fires the bundle nocked (D-641) and a shot made of nothing has no row there.
  "thoridal-the-stars-fury": standing({
    label: "Farstrider's Poise",
    gates: [gate("class", "Ranger")], cancelsBane: "engagedRanged",
    // *Starfire Arrow* (D-912): a shot of nothing at the launcher's own door.
    gated: [run("Starfire Arrow", { phantomShot: { rating: 5, type: "arcane" } })],
    presses: pressMap(
      press("Starfall Volley", {
        action: "action", uses: once("short"), area: "Each creature of your choice in a 15 ft radius",
        attacks: { count: 1, same: false }
      })
    )
  }),

  // Dark Iron Hands is the Reload this weapon's own state reads
  // (`ignoresReload`, D-911); The Sorcerer-Thane's Pact passes the creature's
  // Immune (Fire) at half (`pastImmune`, D-911) at the mitigation. Magma Shot
  // (every creature within 5 feet of the target) waits: `arc` is a count the
  // table resolves, and the splash is no row any door lands.
  // *Magma Shot* (D-912): an arc to EVERY other creature within 5 feet of the
  // creature struck (`arc.all`), landed by the arc's own door.
  "the-emperors-thunder": onHit({
    label: "Magma Shot",
    onHit: { sl: 2, damage: { amount: 3, type: "fire" }, arc: { targets: null, feet: 5, all: true } },
    gated: [
      run("Dark Iron Hands", { gates: [gate("race", "Dwarf")], ignoresReload: true }),
      run("The Sorcerer-Thane's Pact", { pastImmune: "fire" })
    ]
  }),

  // *Blood of the Gurubashi: On a hit, the target is Bleeding 2.* Loa's Edge is
  // an 08 §6 grant on this weapon's own blow, gated on a troll. Drain the
  // Chamber (Health taken off a condition's value across an area) waits.
  "bloodglaive-of-the-hakkari": onHit({
    label: "Blood of the Gurubashi",
    onHit: { condition: { id: "bleeding", value: 2 } },
    gated: [run("Loa's Edge", { gates: [gate("race", "Troll")], grants: ["+2 Damage Rating"] })],
    // *Drain the Chamber* (D-912): the press gathers every other Bleeding
    // creature within 30 feet itself, ally or enemy (`use.gather`), drains each
    // and heals the bearer the total (`use.drain`).
    presses: pressMap(press("Drain the Chamber", {
      action: "half", uses: once("short"), area: "Every other Bleeding creature within 30 ft",
      gather: { feet: 30, condition: "bleeding" }, drain: "bleeding"
    }))
  }),

  // *Whispers of the Black Empire: A Priest holding it adds 2 to the Damage
  // Rating of every Shadow spell they cast* - `spellDamage`, which
  // `spell-bonus.mjs#standingSpellBonus` adds to the cast and to every tick.
  // *The Black Empire's Price: At the end of each Long Rest, make a Spirit
  // Resilience Test at DC 20. On a failure, gain 1 Void Corruption* - a charge
  // offered at a Long Rest (`exposures`, read by `AzerothActor#longRest`).
  // The Blade Hungers (a Bane laid on a creature's Test from the CASTER's
  // item) waits.
  "xalatath-blade-of-the-black-empire": standing({
    label: "Whispers of the Black Empire",
    gates: [gate("class", "Priest")], spellDamage: { school: "shadow", amount: 2 },
    gated: [
      // *The Blade Hungers* (D-912): the Shadow spell's card carries the Bane, once a round.
      run("The Blade Hungers", { gates: [gate("class", "Priest")], resistBane: { school: "shadow", banes: 1, per: "round" } }),
      run("The Black Empire's Price", { corruptionGain: corruption("void", 1, "spirit", 20, "longRest") })
    ]
  }),

  // Sand of the Bronze is 1 Sand more off the first failed Resist each round
  // against the Chronomancer's spell (`sandOnFail`, D-911), at the door 02's
  // Sand paragraph already gains it at (`effects/sand.mjs`). The Scarab Gong
  // opens a gate in the world. Staghelm's Regret (an ally put back at the
  // Health it had at the start of its last turn) waits: no door records a
  // creature's Health at the start of its turn.
  "the-scepter-of-the-shifting-sands": standing({
    label: "Sand of the Bronze",
    gates: [gate("class", "Chronomancer")], sandOnFail: 1,
    gated: [run("The Scarab Gong", { reason: "narrative" })],
    // *Staghelm's Regret* (D-912): the Health each creature had at the start of its
    // last turn, kept on its combatant, given back to the ally targeted at 0.
    presses: pressMap(press("Staghelm's Regret", {
      action: "reaction", uses: once("long"), area: "An ally within 30 ft", rewind: true
    }))
  }),

  // *The Skull's Reserve: Once per Long Rest, as a Half-Action, a Warlock
  // holding it regains 12 Mana, then makes a Spirit Resilience Test at DC 20.
  // On a failure, the Warlock gains 1 Fel Corruption.* Master of the Shadow
  // Council is D-698's bound damage, reaching a bound DEMON alone
  // (`bound.creatureType`; D-911, the architect's review of D-910): a Warlock's
  // talents call creatures that are not demons too, and the sentence names one.
  "the-skull-of-guldan": use({
    label: "The Skull's Reserve",
    gates: [gate("class", "Warlock")],
    use: { action: "half", uses: once("long"), heal: { mana: 12 }, corruptionGain: corruption("fel", 1, "spirit", 20, "press") },
    gated: [run("Master of the Shadow Council", { gates: [gate("class", "Warlock")], bound: { damage: 2, creatureType: "demon" } })]
  }),

  /* ---- Epic weapons ---- */

  // *Against a **Scorched** creature, this weapon deals additional damage equal
  // to that creature's Scorched value.* **A1 HAS THE CONDITION NOW** (D-695),
  // so the thing the old sentence asked the table to judge - *a creature
  // already taking Fire damage over time* - is a number on the creature struck.
  // `damageFromCondition` reads it off the target's snapshot: 1 point of damage
  // for each point of Scorched, and a creature carrying none contributes 0 and
  // the row does not fire, which is *against a Scorched creature* stated once
  // instead of twice (D-696).
  "perditions-blade": onHit({ onHit: { damageFromCondition: { id: "scorched", per: 1 } } }),

  // *On a hit, the target's Armor Points fall by 1 until the end of the fight,
  // to a floor of 0. It stacks with itself three times.* `onHit.sunder` is the
  // key 08 §5's Sundering already fires; the cap of three is not carried,
  // because the descriptor counts no stacks, and the sentence stays on the
  // item where a reader will see it.
  "bonereavers-edge": onHit({ onHit: { sunder: 1 } }),

  // *A Paladin wielding it adds 2 to its Damage Rating against undead and
  // demons.* The compound gate this shape was rewritten for.
  "verigans-fist": standing({
    gates: [gate("class", "Paladin"), gate("creatureType", "undead, demon")],
    grants: ["+2 Damage Rating"]
  }),

  // *A Ranger drawing it adds 2 to the ammunition's Damage Rating against
  // demons, and knows the direction of the nearest demon within 300 feet.* The
  // Damage Rating is carried — a shot's Rating is what a Ranger's damage is
  // (D-641) — and the direction-finding is a sense with no key, left as prose.
  "rhokdelar-longbow-of-the-ancient-keepers": standing({
    gates: [gate("class", "Ranger"), gate("creatureType", "demon")],
    grants: ["+2 Damage Rating"]
  }),

  // *Gain 1 additional Momentum the first time you hit each round, if the blow
  // was an Off-Hand Attack or you moved earlier in the turn.* **THE PAIR IS
  // GONE** (the lead, D-696): it was never in the book - the entry's own lore
  // says *the other is still up there* - so the requirement could only ever be
  // the table's call. What replaces it is two things the system already knows
  // about a blow, and the sentence's OR is the OR a gate clause's value already
  // is. The Momentum rides `gainOnHit`'s `extra`, beside 08 §5's Fast, and
  // `per` is what makes *the first time each round* true.
  "dalrends-sacred-charge": onHit({
    gates: [gate("blow", "off-hand, moved")],
    onHit: { momentum: 1, per: "round" }
  }),

  // *A Priest holding it may cast Renew once per Short Rest without spending
  // Mana, at their own Casting Test.* WHICH spell is `system.spells[]`, which
  // already carries the uuid, the name, the DC and the uses; naming it again
  // here would be a second thing to keep in step.
  benediction: spell({ gates: [gate("class", "Priest")] }),

  // *On a hit, the target gains **Scorched** equal to half the damage dealt,
  // rounded down. Once each turn.* The old sentence turned on a creature
  // *standing in fire*, which is a place on a map and nothing else; the hammer
  // sets the fire itself now, in A1's own condition (D-695, D-696). It is the
  // exact mirror of Perdition's Blade: that one reads Scorched to make damage
  // and this one reads the damage to make Scorched, so the pair works together
  // without either knowing about the other.
  "sulfuron-hammer": onHit({
    onHit: { condition: { id: "scorched" }, conditionFromDamage: 2, per: "turn" }
  }),

  // *A Warlock with Fel Corruption 1 or more gains 2 Spellpower in Fel; one
  // with none cannot open it at all.* The gate was the whole Signature and
  // withheld an item that granted nothing (D-696); it grants now, and the
  // second clause is the same gate said in the entry's own words - which is
  // what the third signatory's joke is about. **The Spellpower is NOT the
  // Augment's +2** (07 §3, D-674): an Augment reaches the Casting Test alone
  // and touches neither damage nor Mana, and 08 §6 prices Spellpower by the
  // school, which is what this grants.
  "grimoire-of-the-fourth-signatory": standing({
    gates: [gate("class", "Warlock"), gate("corruption", "fel 1")],
    grants: ["+2 Spellpower in Fel"]
  }),

  /* ---- Legendary armor ---- */

  // *While you are below half Health, every other member of your party within
  // 15 feet takes 5 less damage from every source.* **THE AURA IS BUILT**
  // (D-696), which is what this row was `noEquivalent` for: every other key
  // here lands on the bearer, and D-691 logged the same gap for 14's own auras
  // as open item O-97. `rules/auras.mjs` is the law and `effects/auras.mjs` the
  // write - an Active Effect on the ALLY, flagged, carrying a real change on
  // `system.damageReduction` because damage reduction is a number (CLAUDE.md
  // §6). The 2 became 5 and *allies* became *your party* on the lead's own
  // call; a Legendary carries no budget, so neither costs anything.
  "the-bulwark-of-tyrs-hand": standing({
    label: "Signature",
    gates: [gate("belowHalfHealth")],
    aura: { feet: 15, targets: "party", damageReduction: 5 },
    // *The Raised Gauntlet* (D-912): D-777's move door asks the bearer IN the
    // blow, so the press fires itself (`trigger: "blowMoved"`) and strikes its
    // own use; the blow lands on the bearer's own Armor Points.
    presses: pressMap(press("The Raised Gauntlet", {
      action: "reaction", uses: once("short"), move: { feet: 15 }, trigger: "blowMoved"
    }))
  }),

  // The Destroyer's Temper is 1 Rage more off the first attack each round that
  // reduces the Warrior's Health (`poolOnHurt`, D-911), at the struck door
  // where 05 §11's Rage is gained. The Black Hand Raised is the item aura's
  // attack Damage Rating (`aura.attackDamage`) behind an *at or above half
  // Health* gate (`atOrAboveHalfHealth`, D-911), the holder an ally as it says.
  "blackhands-harness": standing({
    label: "The Destroyer's Temper",
    gates: [gate("class", "Warrior")], poolOnHurt: { pool: "rage", amount: 1 },
    gated: [
      run("The Black Hand Raised", {
        gates: [gate("atOrAboveHalfHealth")],
        aura: { feet: 15, targets: "allies", attackDamage: 1 }
      })
    ]
  }),

  // *Vat-Born: While you are below half Health, you regain 2 Health at the
  // start of each of your turns* - the turn's tick, judged when the turn
  // starts. Adaptive Scales is a Ward laid off the school of a blow taken
  // (`adaptiveWard`, D-911), at the damage door, the first time each round.
  // Brood Breath (a press that sets the next Breath's school) waits: the
  // Champion's Breath takes its school from the drake form held, and no door
  // lets a Signature hand it another.
  "mail-of-the-fifth-brood": tick({
    label: "Vat-Born",
    gates: [gate("belowHalfHealth")], tick: { health: 2 },
    gated: [run("Adaptive Scales", { adaptiveWard: 2 })],
    // *Brood Breath* (D-912): the press chooses the school the next Breath takes.
    presses: pressMap(press("Brood Breath", {
      gates: [gate("class", "Chromatic Champion")], uses: once("short"), breathSchool: true
    }))
  }),

  // *The Leash Cut: You cannot be Charmed.* Kingslayer is 14 §1's two ignored
  // injuries refused (`bossCannotIgnore`, D-911) off the attack card's own
  // `hiddenAtRoll`, so the *while hidden* is the card's record of the moment.
  "garonas-leathers": standing({
    label: "The Leash Cut",
    refuses: ["charmed"],
    gated: [run("Kingslayer", { gates: [gate("class", "Rogue")], bossCannotIgnore: true })]
  }),

  // Every run waits: The Archbishop's Prayer is one cast on many creatures,
  // Second Ordination a Critical Injury ended by a heal, Hand of the Church a
  // spell's Range overridden.
  // *The Archbishop's Prayer* (D-912): one healing spell the Priest knows, on up to
  // 12 creatures targeted, through `castSpell` with no Mana (`use.castHeal`).
  // *Second Ordination* ends one Critical Injury taken this encounter at the healing
  // door; *Hand of the Church* reaches a Touch healing spell to 30 feet at the range door.
  "vestments-of-alonsus-faol": use({
    label: "The Archbishop's Prayer",
    gates: [gate("class", "Priest")],
    use: { uses: once("short"), castHeal: 12 },
    gated: [
      run("Second Ordination", { gates: [gate("class", "Priest")], ordination: true }),
      run("Hand of the Church", { gates: [gate("class", "Priest")], touchHealingFeet: 30 })
    ]
  }),

  // Both runs fire off a Block (`onBlock`, D-911), read at 06 §6's own Block
  // door: Molten Seam's Rage on the blocker, Neltharion's Heat's Scorched on the
  // attacker of a MELEE blow (the attack card's `strike.rangeKind`, D-779).
  "scale-of-the-earth-warder": standing({
    label: "Molten Seam",
    gates: [gate("class", "Warrior, Chromatic Champion")],
    onBlock: { pool: { pool: "rage", amount: 2 } },
    gated: [run("Neltharion's Heat", { onBlock: { condition: { id: "scorched", value: 2 }, melee: true } })]
  }),

  /* ---- Legendary worn things and Augments ---- */

  // *Courtier's Tongue: You have a Boon on Deception and Persuasion Tests* -
  // two 08 §6 grants. The Wyrm's Roar is a press of its own (D-911): a
  // Reaction once per Short Rest, a Spirit Resilience Test against the
  // Signature DC for the creature targeted, Frightened on a failure through
  // the card's own `onFail`. *That Attack Test takes the Bane Frightened gives*
  // is THE TABLE'S: the attack has already rolled when its card posts, and
  // nothing rolls it again (D-911's reading). Borrowed Face is a disguise.
  "lady-prestors-mantle": standing({
    label: "Courtier's Tongue",
    grants: ["A Boon on Deception Tests", "A Boon on Persuasion Tests"],
    gated: [run("Borrowed Face", { reason: "narrative" })],
    presses: pressMap(
      press("The Wyrm's Roar", {
        action: "reaction", uses: once("short"), area: "A creature within 30 ft",
        resist: { resilience: "spirit", dc: null },
        onFail: [{ id: "frightened", value: null, until: "endOfNextTurn" }]
      })
    )
  }),

  // The Tusk Taken is temporary Health off a kill (`killTemp`, D-911), read
  // where the damage door writes a Boss's or an Elite's 0, through 05's own
  // grant. The King's Frame (one size larger for carrying and for resisting a
  // push) waits: the bag slots read the race's size and the forced move reads
  // nobody's, so a size step has two doors to reach and neither takes one.
  // The Court Kneels is how a court behaves, which the table plays.
  "the-gordok-tusk-crown": standing({
    label: "The Tusk Taken",
    killTemp: { perTier: 2, weightClasses: ["boss", "elite"] },
    gated: [
      // *The King's Frame* (D-912; the lead, on O-319: *"Bag slots and forced movement"*).
      run("The King's Frame", { gates: [gate("race", "Ogre")], sizeStep: 1 }),
      run("The Court Kneels", { reason: "tableCall" })
    ]
  }),

  // Both runs wait: a second Reaction restricted by name, and a hit turned
  // into a miss after the roll.
  // *Ten Thousand Years of Practice* (D-912): a second Reaction a round, spent only
  // on Blink or Counterspell, at the one budget door (`spendTurnBudget`). *Step
  // Aside* is pressed from the attack's own card, through 04's Afterimage's door.
  "signet-of-the-shendralar": standing({
    label: "Ten Thousand Years of Practice",
    gates: [gate("class", "Mage")], secondReaction: ["Blink", "Counterspell"],
    presses: pressMap(press("Step Aside", { action: "reaction", uses: once("short"), negates: true }))
  }),

  // *The Font Remembers: A blood elf wearing it regains 2 Mana at the start of
  // each of their turns.* The Sunwell's Torrent (a Sustain ended on a failed
  // Test) waits.
  "shard-of-the-sunwell": tick({
    label: "The Font Remembers",
    gates: [gate("race", "Blood Elf")], tick: { mana: 2 },
    // *The Sunwell's Torrent* (D-912): every other creature within 10 feet holding a
    // Sustain, gathered by the press, ally or enemy; a failed Test ends one Sustain
    // the creature chooses (`use.onFailEnds`).
    presses: pressMap(press("The Sunwell's Torrent", {
      action: "half", uses: once("short"), area: "Every other creature within 10 ft sustaining a spell",
      gather: { feet: 10, sustaining: true }, resist: { resilience: "spirit", dc: null }, onFailEnds: "sustain"
    }))
  }),

  // *The Master's Voice: You cannot be Silenced.* Undying is D-777's one hold
  // at 1 (`use.trigger: "dropToZero"`, D-911), a press that fires itself in
  // `AzerothActor#_holdAtOne`, strikes its own Long Rest use and offers its
  // Body DC 20 Undeath charge through the exposure door. Breath of the
  // Necropolis (a creature a Frost spell damaged makes a Test) waits: the spell
  // card's damage is applied by its Apply, and no door there offers a Test
  // that the caster's item names.
  "the-phylactery-of-kelthuzad": standing({
    label: "The Master's Voice",
    refuses: ["silenced"],
    // *Breath of the Necropolis* (D-912): the spell card's Apply posts the Test.
    gated: [run("Breath of the Necropolis", {
      spellDamageTest: { school: "frost", resilience: "body", onFail: { id: "numbed", until: "endOfNextTurn" } }
    })],
    presses: pressMap(
      press("Undying", {
        uses: once("long"), trigger: "dropToZero",
        corruptionGain: corruption("undeath", 1, "body", 20, "press")
      })
    )
  }),

  // Both runs wait: a tick laid on a demon that pays the Warlock, and a free
  // Banish whose Test a demon makes with a Bane.
  // *Pylon Tether* (D-912): the tether rides the Warlock, landed at each of the
  // Warlock's turn starts by the combat's own hook. *The Fifth Pylon*: Banish for no
  // Mana (`freeSpell`) and a demon's Resist against it with a Bane (`resistBane`).
  "codex-of-the-five-pylons": use({
    label: "Pylon Tether",
    gates: [gate("class", "Warlock")],
    use: {
      action: "half", uses: once("short"), area: "One demon within 30 ft",
      tether: { creatureType: "demon", feet: 60, loss: 2, mana: 2 }
    },
    gated: [run("The Fifth Pylon", {
      gates: [gate("class", "Warlock")], freeSpell: "Banish",
      resistBane: { name: "Banish", creatureType: "demon", banes: 1 }
    })]
  }),

  // Emerald Slumber is a press (D-911): a Spirit Resilience Test against the
  // Signature DC for the creature named, Stunned on a failure *until it takes
  // damage or until the end of its next turn* - the effect carries
  // `endsOnDamage`, which the damage door ends. The Dream's Bounty raises a
  // laid heal tick of the Druid's spell by 1 each landing (`tickHealBonus`).
  "idol-of-the-dreamer": use({
    label: "Emerald Slumber",
    gates: [gate("class", "Druid")],
    use: {
      action: "half", uses: once("short"), area: "One creature within 60 ft",
      resist: { resilience: "spirit", dc: null },
      onFail: [{ id: "stunned", value: null, until: "endOfNextTurn", endsOnDamage: true }]
    },
    gated: [run("The Dream's Bounty", { gates: [gate("class", "Druid")], tickHealBonus: 1 })]
  }),

  // Stolen Hour fills the Sand to the Hourglass's cap (`use.fill`, D-911).
  // Echo of the Infinite arms the next cast as 02's Recurrence does
  // (`use.echo`), and the cast lands again at the caster's next turn: its card
  // posted again, so each creature makes the spell's Resilience Test again, and
  // a tick the spell laid is laid again (D-911; the lead: *"Yes, Yes, Yes"*).
  "the-hourglass-of-the-infinite": use({
    label: "Stolen Hour",
    use: { action: "half", uses: once("long"), fill: "sand" },
    presses: pressMap(
      press("Echo of the Infinite", { uses: once("short"), echo: true })
    )
  }),

  /* ---- Epic armor ---- */

  // *A Paladin wearing it inflicts a Critical Injury on a natural 19 as well
  // as a 20 against undead and demons.*
  "judgment-armor": standing({
    gates: [gate("class", "Paladin"), gate("creatureType", "undead, demon")],
    criticalOn: 19
  }),

  // *A Warrior wearing it may spend 4 Rage as a Reaction to halve the damage
  // of one attack that hits them.* Pressed, and both halves are written now:
  // `use.cost` is `class-features.mjs#cost`'s own pair, and `use.mitigates`
  // takes the blow down rather than adding anything to it.
  "battlegear-of-wrath": use({
    gates: [gate("class", "Warrior")],
    use: { action: "reaction", cost: cost("rage", 4), mitigates: { halve: true } }
  }),

  // *A Shaman wearing it adds 1 to the Damage Rating of every Nature spell
  // they cast.* `+1 Damage Rating` as a grant is a bonus on the BEARER and
  // would raise the hammer in their hand as readily as the spell, so the
  // school rides on `spellDamage` instead. **The school is NOT a second gate**:
  // a `school` gate asks whether the bearer casts in Nature, which every
  // Shaman does, and it would fail closed wherever the caller has no list of
  // schools to hand. The scope belongs to what is cast, not to who wears it.
  "the-ten-storms": standing({
    gates: [gate("class", "Shaman")],
    spellDamage: { school: "nature", amount: 1 }
  }),

  // *A Ranger wearing it takes no Bane on Attack Tests against dragonkin,
  // whatever the range.* A Bane CANCELLED, which is not a Boon: 08 §6's
  // grammar has *A Boon on Attack Tests* and nothing that removes one, and a
  // Boon standing against two Banes is a different roll. *Whatever the range*
  // names which Bane — 06's second band, `rules/distance.mjs`' own, which the
  // dialog draws as `longRange`.
  "dragonstalker-armor": standing({
    gates: [gate("class", "Ranger"), gate("creatureType", "dragonkin")],
    cancelsBane: "longRange"
  }),

  // *A Rogue wearing it adds 2 to its Damage Rating against any creature that
  // has not yet acted this combat.*
  "bloodfang-armor": standing({
    gates: [gate("class", "Rogue"), gate("targetHasNotActed")],
    grants: ["+2 Damage Rating"]
  }),

  // *A Druid wearing it adds Armor Points equal to their tier in any form they
  // take.* The old sentence was a rule ABOUT the rules - it said what
  // Shapeshift does not take away, and nothing in this system takes a suit's
  // Armor Points away in a form for it to give back - so it was `noEquivalent`
  // and correctly so. It GIVES now (the lead, D-696), and the points are the
  // bearer's tier rather than a number, which is why `armorPointsPerTier`
  // exists: 08 §6's grant grammar writes a fixed sentence and `grantsFor` drops
  // the Armor Point family anyway. **The form gate names no form**, which
  // `gateHolds` reads as any form at all - the entry's own *in any form they
  // take*.
  //
  // **The points ADD to the suit's** and never replace them, which is what
  // *adds* says; `CharacterData` puts them on the Body, where 08 §20's printed
  // **AP** and every `apBonus` already land.
  "stormrage-raiment": standing({
    gates: [gate("class", "Druid"), gate("form")],
    armorPointsPerTier: 1
  }),

  // *A Warlock wearing it takes 1 less Fel Corruption, to a minimum of 0, each
  // time they would take any.* The floor of 0 is not carried — nothing in 10
  // charges a negative amount, so the minimum is arithmetic rather than a
  // second rule — and it stays on the item's own sentence.
  "nemesis-raiment": standing({
    gates: [gate("class", "Warlock")],
    corruptionReduction: { track: "fel", amount: 1 }
  }),

  // *A Mage wearing it may cast Mana Shield once per Short Rest without
  // spending Mana.*
  "netherwind-regalia": spell({ gates: [gate("class", "Mage")] }),

  // *A Priest wearing it restores 2 additional Health with every spell that
  // restores any.* Healing the bearer GIVES, where `use.heal` is what the item
  // itself restores. *Every spell that restores any* is the whole scope — the
  // amount rides on the healing rather than on any one school.
  "vestments-of-transcendence": standing({ gates: [gate("class", "Priest")], healingBonus: 2 }),

  // *A creature that hits you in melee takes 3 Fire damage, and Ward applies.*
  "skullflame-shield": whenStruck({ whenStruck: { damage: { amount: 3, type: "fire" } } }),

  // *While you have not moved this turn, Block reduces damage by a further 2.*
  // **THERE IS A BLOCK NOW** (06 §6, D-693): this row was `noEquivalent`
  // because the chapter's Reaction table was unbuilt except for Pummel, and
  // *a further 2* had nothing to be further than. `blockBonus` was written
  // for this one entry - the only Signature in 08 §20 that modifies a
  // Reaction - and `rules/reactions.mjs#blockReduction` is what adds it to
  // the four. The gate already read: `hasNotMoved` is the feet the turn has
  // spent, which `AzerothCombatant#spendMovement` records (D-659).
  "drillborer-disk": standing({ gates: [gate("hasNotMoved")], blockBonus: 2 })
});

/* -------------------------------------------- */
/*  03 §5's fifty-three, by hand                 */
/* -------------------------------------------- */

/**
 * What each career's Signature DOES, keyed by the career's
 * `system.identifier` and written in tier order.
 *
 * D7 records that every one is *a capability with a scope, a time cost and a
 * limit*, and reading all fifty-three against the pack that is true of the
 * SCOPE and the TIME in prose and of the LIMIT in numbers only eight times.
 * **Forty-five are `none`**, and it is the same honesty as the bestiary's
 * sixty-five: *Any Horde camp feeds you, houses you and finds you a post* is
 * the world answering, not a rule with a number in it, and a `standing` row
 * with nothing in its arrays would meet the census while doing nothing at all
 * — which is precisely the shape D-681 keeps finding.
 *
 * The eight that read are the ones the chapter gives a rest-bounded limit, and
 * `rules/uses.mjs#usesFromText` is what says so: the census reads every
 * career's own description through it and fails a row whose uses disagree, so
 * these numbers cannot drift from 03 §5's own sentence.
 *
 * The six `tableCall` rows are *once in an arc* — a real limit in a unit the
 * campaign keeps and `AZEROTH.abilityUsesPer` does not — and the Hedge-Warden,
 * whose *you cannot be ambushed* is a genuine refusal of `surprise` scoped to
 * a place the table names. An ungated refusal there would mean the character
 * could never be ambushed anywhere.
 */
export const CAREER_SIGNATURES = Object.freeze({
  /* ---- Tier 1 ---- */

  // *Any workshop of your craft will let you in, lend you a bench and sell you
  // materials at trade price, on your master's name rather than your own.*
  "bound-apprentice": none("narrative"),
  // *Anywhere in Forsaken country you know which roads are held tonight.*
  deathguard: none("narrative"),
  // *Any vessel in a trading port takes you and one companion as working passage.*
  deckhand: none("narrative"),
  // *An hour with a site tells you what is buried there.*
  digger: none("narrative"),
  // *Stabilizing a Dying character costs you a Half-Action and needs no Test.
  // Once between Short Rests.* The one tier 1 Signature that is a turn.
  "field-surgeon": use({ use: { action: "half", uses: once("short") } }),
  // *Ten minutes lays a body so that it will not rise.*
  "grave-tender": none("narrative"),
  // *Any Horde camp feeds you, houses you and finds you a post.*
  grunt: none("narrative"),
  // *In a place you have wardened for a month you cannot be ambushed.* A real
  // refusal of `surprise`, scoped to a place only the table can name — and
  // ungated it would mean the character can never be ambushed at all.
  "hedge-warden": none("tableCall"),
  // *Any non-hostile Beast treats you as familiar rather than as a stranger.*
  houndmaster: none("narrative"),
  // *A day in unfamiliar country tells you where the water is.*
  "hunt-sworn": none("narrative"),
  // *Given a parish's books and an afternoon, you learn who is related to whom.*
  "lay-brother": none("narrative"),
  // *Given an hour and materials, you bring down a wall, a door, a bridge span.*
  "powder-hand": none("narrative"),
  // *Once between Long Rests, produce one piece of ordinary equipment from the
  // party's baggage that nobody said they had.* WHICH piece is the table's;
  // the limit is the character sheet's, and nothing tracked it before.
  "quartermasters-clerk": use({ use: { uses: once("long") } }),
  // *An hour and a surface gives you one rune... You may hold one at a time.*
  // A limit in a unit nothing counts, over three effects with no mechanic.
  "runewrights-apprentice": none("narrative"),
  // *Once between Long Rests, name a person you believe is in a settlement.*
  runner: use({ use: { uses: once("long") } }),
  // *In a settlement you have watched for a month, you may detain, question or
  // enter on your own authority.*
  watchman: none("narrative"),

  /* ---- Tier 2 ---- */

  // *A dozen answer to you at your post.*
  "blood-guard": none("narrative"),
  // *Name a good you want. It arrives at the next cartel port within a week.*
  "cartel-factor": none("narrative"),
  // *Over a Long Rest spent working on one patient, you remove one Critical
  // Injury.* A Critical Injury is a lasting Active Effect off a RollTable
  // rather than a condition, and `use.ends` names condition keys alone.
  chirurgeon: none("noEquivalent"),
  // *Once between Long Rests, name a question about who did what.*
  constable: use({ use: { uses: once("long") } }),
  // *The Scourge do not react to you unless you act first.*
  deathstalker: none("narrative"),
  // *Ten minutes and materials drop one thing you name... Once between Long
  // Rests. In a fight it costs a Full Action instead.*
  demolitionist: use({ use: { action: "full", uses: once("long") } }),
  // *Name a ruin you can walk. You learn who built it.*
  "field-archaeologist": none("narrative"),
  // *Name a dispute, a family, a debt or a death within your people's memory.*
  firekeeper: none("narrative"),
  // *Once in an arc, a debt comes due.* An arc is the campaign's unit and
  // `AZEROTH.abilityUsesPer` does not keep one.
  fixer: none("tableCall"),
  // *Any guild town has work for you within the day at the going rate.*
  journeyman: none("narrative"),
  // *Once between Long Rests, in a settlement with a church, you learn what is
  // actually wrong there.*
  "parish-priest": use({ use: { uses: once("long") } }),
  // *An hour with a body, a well, a field or a beast tells you what strain
  // took it.*
  "plague-worker": none("narrative"),
  // *Once in an arc the country answers.*
  "warden-of-the-march": none("tableCall"),

  /* ---- Tier 3 ---- */

  // *Forty people do what you say.*
  "camp-chieftain": none("narrative"),
  // *You state the Church's position on a local matter and it is the Church's
  // position.*
  canon: none("narrative"),
  // *Call a council and it convenes... Once between Long Rests, and it takes a
  // day.*
  elder: use({ use: { uses: once("long") } }),
  // *The Deathguard of your holding do what you say without confirmation.*
  executor: none("narrative"),
  // *You hold a season's expedition.*
  "expedition-head": none("narrative"),
  // *You run four people... Once between Long Rests, one of them answers a
  // question within the day.*
  handler: use({ use: { uses: once("long") } }),
  // *Your ruling stands in your town and is honored across the Alliance.*
  magistrate: none("narrative"),
  // *Once in an arc, forty people turn out armed for a week.*
  marchlord: none("tableCall"),
  // *You command a house of medicine.*
  "master-chirurgeon": none("narrative"),
  // *You keep a shop with hands in it.*
  "master-of-the-craft": none("narrative"),
  // *You run a cartel port.*
  "senior-factor": none("narrative"),
  // *A day with a fortification tells you how long it holds.*
  "siege-master": none("narrative"),

  /* ---- Tier 4 ---- */

  // *Forty parishes act on your word.*
  bishop: none("narrative"),
  // *Several thousand people go where you send them.*
  "clan-chieftain": none("narrative"),
  // *You set prices, standards and admissions for a whole city's trade.*
  guildmaster: none("narrative"),
  // *Every Forsaken holding, patrol and deathstalker on your front acts on
  // your word.*
  "high-executor": none("narrative"),
  // *Name any ruin, artefact, people or event of the deep past.*
  "keeper-of-the-hall": none("narrative"),
  // *Your ruling binds a province.*
  "lord-justice": none("narrative"),
  // *Once in an arc, several hundred people turn out for a season.*
  "lord-warden": none("tableCall"),
  // *Name a work — a bridge, a wall, a road, a shaft, a harbor.*
  "master-of-works": none("narrative"),
  // *Name a practice, a quarantine, a supply or a training.*
  "physician-general": none("narrative"),
  // *Name a question about a place, a person or an intention.*
  spymaster: none("narrative"),
  // *Once in an arc, commit a trade prince at a scale that changes a campaign.*
  "trade-princes-voice": none("tableCall"),
  // *Your word commits a tribe, and the Horde treats it as the tribe's word.*
  "tribe-speaker": none("narrative")
});
