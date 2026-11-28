/**
 * Talents as mechanics (04-TALENTS, D-642).
 *
 * A talent's effect is a paragraph. Nothing in it is machine-readable, so
 * this table says, talent by talent, what the sheet can do with the ones
 * that grant or change something - reviewed one class at a time against
 * the pack source, as `class-features.mjs` was; the test beside this file
 * fails on a talent whose text grants, changes or casts and has no row
 * here, and on a row that names a talent or a feature the packs lack.
 *
 * Pure: no Foundry imports. The actor's feature sync reads `grantsFor` and
 * `patchesFor`, the spell workflow `spellNotesFor`.
 *
 * A row is one or more of:
 *   grants     a feature descriptor in class-features' vocabulary. Taken, the
 *              talent grants a feature item the sheet can Use; withdrawn at
 *              rank 0. Amounts may say "rank" ("2*tier+rank", "tier*rank"),
 *              evaluated at the rank taken; `uses.max` may be "rank" or
 *              "tier" (the stamp is made at the character's tier, D-768).
 *              `bound {kind, action}` names the creature the feature acts
 *              on and `summons {entries, count, until}` what it calls:
 *              `workflows.useFeature` reads both (D-643) - a summon calls
 *              `count` of EACH entry, and is judged before anything is paid,
 *              so an entry 14 does not print refuses the Use in words.
 *   modifies   `{feature, ...patch}` or an array of them: a class feature
 *              of the talent's class, restamped with the patch while the
 *              talent is taken - `action` (a rung, or null for none),
 *              `cost {delta}` (an expression, floored at 0), `uses {max,
 *              per}`, `heal {add}`, `damage {amount, type}`, `resist`,
 *              `area`, `choiceExtra [{name, level, greater}]`, and `atRank
 *              [{rank, ...patch}]` for a clause the rank reaches. **Every
 *              expression is stamped at the PATCHING talent's rank**
 *              (`bindRank`, D-768): a class feature's item carries no rank of
 *              its own, so the stamp holds the number and `tier`, `level` and
 *              `sl` stay for the Use. A row with only a feature name changes
 *              nothing the machine can express; the feature carries the
 *              talent's name and text as the change, and the census lists the
 *              row on the worklist (`talentCensus`, `emptyPatch`) unless it is
 *              `inline` - applied by name elsewhere - or carries a `reason`.
 *   spell      `{names, schools, learn}`: the talent's text prints as a note
 *              on the card of a spell it names or a school it names, and
 *              `learn: true` embeds each named spell while the talent is
 *              taken (Dispersion, Blood Pact: "You know …").
 *              What the talent does to the named spell's AREA (D-756), read by
 *              `spellAreaFor` and nothing else:
 *                widen    feet the radius is wider at every rank - *Its radius
 *                         is 40 feet* on a 30-foot spell is `widen: 10`
 *                atRank   `[{rank, widen}]`, feet added once the rank is
 *                         reached - Consecrated Ground's *At rank 2 its radius
 *                         is 10 feet wider*
 *                ground   `{difficult: [kinds], who}` - the area is also
 *                         **Difficult ground** to a creature of those kinds
 *                         (`creature-kinds.mjs`) standing in that relation to
 *                         the caster: Consecrated Ground's *to an enemy that is
 *                         undead or fel*. Carried on the card and the Region;
 *                         the movement cost is the Region behavior's
 *                         (`canvas/behaviors.mjs`, D-757).
 *   damage     `{amount, types, applies, when, form, via, until}` (D-711 phase
 *              2): the talent adds to the DAMAGE of something, per rank. 04
 *              carries twenty of these and not one number reached a card - the
 *              words printed as a note on the roll dialog and the Rating never
 *              moved (the lead's items 20 and 30).
 *                amount   "rank", "2*rank" - `evaluateAmount` at the rank taken
 *                types    damageTypes keys, or ["all"]
 *                applies  "attack" | "spell" | "both"
 *                when     null (always) | a fact the door can read
 *                         ("damagedTarget", "engagedOne", "boundDemon",
 *                         "riposte") | one the TABLE reads ("flanking",
 *                         "judgement"), which is never auto-checked (D2 §12)
 *                form     true where the talent asks for a Shapeshift form
 *                via      "bound": it lands on the bound creature's own
 *                         `system.damageBonus` through `boundEffects`, never
 *                         on the owner's roll
 *                until    "encounter" | "endOfNextTurn": it is switched ON by
 *                         using the feature the talent grants, and `useFeature`
 *                         lays it as a self effect
 *   passive    `{changes, when}` (D-648): an owner-side Active Effect while the
 *              talent is taken - `changes` in v14's shape with amounts that
 *              may say "rank", laid in the final phase so a derived number
 *              takes them; `when` gates it on a state the sync can read:
 *              "form" (a Shapeshift form worn - the Avatar is not one, D-251,
 *              D-769), "shield" (a shield equipped, and not melded into a shape).
 *   automated  "inline": applied by name in the code already (D-627 and
 *              kin); listed so the census knows them, and the census fails
 *              one no rank accessor in `module/` reads - `talentRanks`,
 *              `ranks`, `ranksOf` by name or `rankOf` by identifier (D-768).
 *              "none" with a `reason`: reviewed and left to the table, and
 *              the card's note - a rest's arithmetic, a school named at a
 *              rest, a condition only the table can see (D2 §12).
 *   gap        a string: REVIEWED AND NOT BUILT, and buildable (D-768). It
 *              says what is missing, beside whatever the row does build, and
 *              the census lists the talent on the worklist until a later
 *              phase removes it. It is the honest replacement for a `none`
 *              whose reason went stale - Earthen Shield's *damage taken has
 *              no field* outlived `system.damageReduction` (D-696) - and for
 *              an `inline` row that builds one rank and not the next.
 *   aura       `rules/auras.mjs#aura(...)` (D-755): what stands on every ALLY
 *              in reach while the talent is taken - Avenging Bulwark, Demonic
 *              Pact, Tree of Life. `talentAurasFor` evaluates its `"rank"` at
 *              the rank taken and `effects/auras.mjs` lays it. A row whose
 *              words name an ally radius and whose aura is not built carries
 *              `auraReason` beside what it does build (Spirit Link Totem), or
 *              is `none` with its reason; `auras.test.mjs`' census holds 04 to
 *              that.
 *   modifies   also takes `auraReach` (D-755): feet added to the class
 *              feature's aura, per rank - Wide Aura's *10 feet further per
 *              rank* on Aura of Resolve.
 *   rider      what the talent SPENDS AS PART OF AN ATTACK (D-770; the lead,
 *              2026-10-03: *"Lines on attack dialog"*): an unticked, priced
 *              line on the attack's own roll dialog, paid when the attack
 *              rolls, its on-hit effect landing with the blow. `rules/riders.mjs`
 *              is the law and documents the shape: `cost {pool, amount|"all"}`,
 *              `once` ("round"), `form`, `weapon`, `move` ("speed", bought by
 *              the spend), `onHit {condition, value, damage, prone}` with the
 *              expressions in `rank`, `spent` and `tier`, `atRank [{rank,
 *              onHit}]`, and `discount {pool, amount, min}` for a rider that
 *              changes the rule rather than adding one (Berserk, Phase 3).
 *              The census clears *as part of an attack, spend* only for a
 *              rider that pays something, and a condition laid on a hit only
 *              for one whose hit lays it.
 *
 * **THE DRUID'S KINDS** (D-771, the talent plan's Phase 3). Each is read by ONE
 * door, named beside it, and the census covers the wording it builds:
 *
 *   tick       `{spells, add}`: what the talent adds to a named spell's TICK
 *              (D-770's laid number), per rank - Moonfire's *adds 1 to the
 *              damage it deals at the start of the target's turns*,
 *              Rejuvenation's *to the Health it restores each turn*. Read by
 *              `tickBonusFor`, which `castSpell` adds as the tick is stamped.
 *   nextSpell  `{amount, on, sl, turn}`: a one-shot Mana discount on the NEXT
 *              spell, laid on the caster when `on` happens - `casting` (a
 *              Casting Test at `sl` or better: Nature's Grace) or `swiftLeave`
 *              (the free leave: Predator's Swiftness), `turn` where it lasts
 *              *that turn* only. `nextSpellGrants` reads it; the cast's Mana
 *              takes it through `casting.mjs#spellManaCost`.
 *   momentum   `{pool, amount, sl, form, once}`: a FURTHER gain into one pool
 *              on a hit - Primal Fury's *if an Attack Test you make in a
 *              Shapeshift form meets or exceeds SL 2, gain 1 further Ferocity
 *              per rank*, `once: "turn"`. `momentumOnHitFor` reads it, into
 *              `momentum.mjs#gainOnHit`'s `poolExtra`.
 *   alternate  `{schools, amount}`: Eclipse - a cast of one school makes the
 *              next spell of the other add `amount` to its damage.
 *              `alternateCast` is the state's law; `castSpell` keeps the state.
 *   heal       `{add, when, via}`: what the talent adds to a heal THIS
 *              character gives - Gift of Nature's *1 further Health per rank to
 *              a target suffering a condition*, by a spell or a feature.
 *              `healBonusFor` reads it at `AzerothActor#applyHealing`.
 *   tickWard   `{amount, schools}`: Nature's Ward - every heal over time this
 *              character lays carries Ward per rank against one school, chosen
 *              as it is laid. `tickWardFor` reads it at the Apply.
 *   castAs     `{action, from, healing}`: Nature's Swiftness - a healing spell
 *              cast at a Half-Action rather than an action, spending a use of
 *              the counter the talent grants. `castAsFor`; `castSpell`'s budget.
 *   onUse      what the Use of the feature the talent GRANTS does beyond its
 *              descriptor, read by `workflows.useFeature` off the granting
 *              talent's row (as `damageBuffFor` already is): `requires`
 *              (a shape kind the Use needs), `mitigate` ("halve": the one-attack
 *              mark Block and Parry ride), `gain` `{pool, amount}`, `ends`
 *              ("healTick": Swiftmend's ongoing healing effect) and `partner`
 *              (Symbiosis's friendly target).
 *   shares     `{heal}`: Symbiosis - healing either partner restores, the other
 *              restores the share of. `rules/symbiosis.mjs` is the law.
 *   spell      also takes `duration` (a span 07's phrasing reads, replacing
 *              the entry's - Celestial Alignment's *2 minutes*) and
 *              `ignoresWard {amount, schools, while}` (Ward the caster's spells
 *              ignore while a laid spell stands on them).
 *
 * **THE WARRIOR'S AND THE PALADIN'S KINDS** (D-772, the talent plan's Phases 4
 * and 5): `calledShot`, `hitLays`, `critical`, `targetBoon`, `kill`,
 * `allyDown`, `turnStart`, `extraStrike`, `freeReaction`, `block`,
 * `blockRetort`, `offHand`, `reckless`, `unanswerable`,
 * `manaBack`, `rest`, `freeHealing`, `steadfast`, `plate` and `beacon`, and
 * `onUse` gained `nextAttack`, `laysBane`, `laysBoon`, `plate` and `beacon`;
 * `rider` gained `pays`, `needs`, `strike` and `onHit.heal`, `noHealing` and
 * `sl`; an `aura` may be `holderOnly` with `armor`. `rules/class-talents.mjs`
 * documents each and holds its ONE reader; the census covers the wording each
 * builds. A row may carry a `reason` beside what it builds where the rest is the
 * table's (Guardian's moved hit), as a `none` row does.
 *
 * **THE PRIEST'S AND THE SHAMAN'S KINDS** (D-774, the talent plan's Phases 8
 * and 9): `castLine`, `charge`, `drain`, `apparition`, `overload`, `refund`,
 * `stormlash`, `firstAttack`, `maelstrom`, `earthliving` and `guidance`; `spell`
 * gained `adds`, `heal`, `further`, `onFail` and `addTick`, and its
 * `ignoresWard.amount` reads the rank; `onUse` gained `restores`, `inflicts`,
 * `ascend`, `walk`, `doomWinds` and `cloudburst`; a `modifies` patch may carry
 * `widen` (feet a feature's area grows, Empowered Mending) and `choice` (the
 * menu a feature asks, or null for none: Aegis Eternal's every school), and the
 * Ward's, Mend's and Reincarnation's patches carry their talents' mechanism
 * (`wardOptionsFor`, `healTargetsFor`, `reincarnationFor`); a `passive` may be
 * gated on a totem standing (`"totem"`, Earthen Shield). `rules/class-talents.mjs`
 * documents each and holds its ONE reader.
 *
 * **THE MAGE'S AND THE WARLOCK'S KINDS** (D-775, the talent plan's Phases 10 and
 * 11): `upkeep`, `overchannel`, `ignite`, `retaliate`, `immuneAsWard`, `immune`,
 * `spellCritical`, `spellCost`, `castingBoon`, `extend`, `siphon`, `death`,
 * `archmage`, `cauterize`, `ruin` and `freeUse`; `spell` gained `dc`, `health`
 * and `lengthen`, and `adds` a `minRank`; `castAs` gained `schools` and an
 * `atRank` Ward pierce (Fire Blast); `castLine` gained `convert` (Fel Fire);
 * `manaBack` gained `overchannel` (Clearcasting); `nextSpell` gained `cast`
 * (Backdraft); `kill` gained `spell` (Shadowburn); `apparition` gained `from`
 * (Living Bomb); `onUse` gained `ward.everySchool`, `veins`, `areaTick`,
 * `haunt`, `swap`, `sacrifice`, `command` and `soulFire`; a grant may carry a
 * `minRank` and its `inflicts` an `sl` and a `minRank` (Pyroblast); and the
 * Blink, Counterspell, Shape the Weave, Life Tap, Curse and Bound Demon patches
 * carry their talents' mechanism (`blinkFor`, `counterspellFor`, `sustainsFor`,
 * `lifeTapFor`, `curseFor`, `aegisWardFor`). `rules/class-talents.mjs`
 * documents each and holds its ONE reader.
 *
 * **THE DAMAGE DOOR'S KINDS** (D-777; the lead's rulings of 2026-10-03 on
 * O-154, O-155, O-156 and O-162): `tempHealth` (05's temporary Health - a heal's
 * grant, a named spell's raise, or an `onUse`'s own), `holds` (another creature
 * held at 1 Health, asked of the holder in the blow), `moves` (a hit taken onto
 * the holder, asked in the blow), `links` (a blow divided among allies) and
 * `aegis` (07's floor's heal when it ends); a `damage` row may carry `as`, the
 * type its amount IS (Arcane Power), and Stormlash and a rider's `onHit` a
 * `type` - a second amount on the blow, met by its own Ward. `rules/class-
 * talents.mjs` documents each and holds its ONE reader.
 *
 * **THE CROSS-CLASS RULINGS' KINDS** (D-778; the lead's answers of 2026-10-03 on
 * O-157 to O-165): `dispelGate` (Improved Moonfire since the class talent audit) and
 * `unstable` (Everlasting Affliction, Unstable Affliction), `immovable`,
 * `escape` (Frost Nova, Deep Freeze, Absolute Zero), `slowing` (Permafrost) and
 * `healing` (Devotion, Holy Guidance, Divine Providence: a patch every healing
 * feature of ANY class takes, `healingPatchesFor`); `upkeep` gained `less`
 * (Arcane Concentration); a `modifies` patch may carry `further` (Rapture on
 * Dispel), `push` (Typhoon on Hurricane) and `upkeepLess` (Netherwind on Shape the
 * Weave); `spell` gained `push` (Blast Wave) and `onUse` gained `push`
 * (Thunderstorm). `rules/class-talents.mjs` documents each and holds its ONE
 * reader.
 *
 * **THE CLASS ANSWERS' KINDS** (D-779; the lead's answers of 2026-10-03 on O-166
 * to O-195): `rangedParry` (Anticipation), `undying` (Undying Rage), `bracing`,
 * `landwise` (Master of the Land), `foresight`, `chosenWard` (Barrier), `aegis`
 * (Divine Aegis), `flametongue`, `lavaLash` and `blademaster`; `freeReaction`
 * gained `per` and `needs` (Main Gauche), `quarry` gained `companionSpends`
 * (Shared Quarry), `castAs` gained a list of rungs and `features` (Nature's
 * Swiftness), `castLine` gained `double` (Devouring Plague), Snare's patch
 * gained `poison` (Snake Trap), `onUse` gained `lightwell`, `miracle` and
 * `sustain` (Flametongue), and a row the lead REWORKED says so (`reworked`, Main
 * Gauche). `rules/class-talents.mjs` holds each reader; `rules/class-answers.mjs`
 * the arithmetic.
 *
 * A talent with a use rider - "You may use this a number of times equal to
 * your rank per Short Rest", "Once per Long Rest" - grants a feature that
 * counts it (D-648): `counter(max, per)`.
 */

// `mod` moved to `class-features.mjs` with D-710: a CLASS FEATURE lays a
// patch of the same shape now (Totem Mastery on Totem), and one constructor
// in the file both readers already import beats two that must agree.
import { CLASS_FEATURES, FULL_HEAL, action, bindRank, cost, evaluateAmount, mod, once } from "./class-features.mjs";
// A people's key, the parser's `slugify` (D-1140): the race lookup in `talentEffect`.
import { peopleKey } from "./peoples.mjs";
// 02 §5's Tail Sweep: a price from any pool (the lead, 2026-11-09).
import { ANY_POOL } from "./pools.mjs";
// What stands on somebody else (D-755): the descriptor, and the stamp that
// evaluates it at a rank.
import { aura, auraStamp } from "./auras.mjs";
// An area's words widened by a patch (Empowered Mending, D-774).
import { widenAreaText } from "./areas.mjs";
// ONE reading of a row's gate (the Legacy branches' doors 15, 17 and 18): a
// target's condition or kind, the user's marks, what the user wields and wears.
import { gateHolds, gateLabel, wieldFails } from "./talent-gates.mjs";
// A feature's condition's own escape, bound at the rank (the Legacy branches' door 19).
import { boundFeatureEscape } from "./escapes.mjs";
// The Necromancer's numbers, each in one place (Phase 4c-T): every row below names its constant.
import * as NT from "./necromancer-talents.mjs";
// The Sovereign's numbers (04's Dominion, Vainglorious and Ravenous; the San'layn and Sovereign plan's Phase 5).
import * as ST from "./sovereign-talents.mjs";
// The Demon Hunter's numbers (04's Betrayer, Souleater and Sufferer; the Demon Hunter plan's Phase 5).
import * as DT from "./demon-hunter-talents.mjs";
// The Witch Hunter's numbers (04's Wolf, Gryphon, Bear and Cat; the Witch Hunter plan's wave 2b).
import * as WT from "./witch-hunter-talents.mjs";
// A summon's count by rank, bound at the stamp (the Legacy branches' door 4).
import { summonCountAt } from "./summon-places.mjs";
// R1's cap on a per-rank bonus (the class talent audit; D-1861).
import { capAmount } from "./expressions.mjs";

const uses = (max, per) => ({ max, per });
const grant = (extra = {}) => action(extra);
const bound = (kind, act) => ({ kind, action: act });
const summons = (entries, count, until = "encounter") => ({ entries, count, until });
/** A feature that only counts a rider's uses (D-648). */
const counter = (max, per, act = null) => grant({ action: act, uses: uses(max, per) });
/** An owner-side effect while the talent is taken (D-648). */
const passive = (changes, when = null) => ({ changes, when });
/**
 * Damage the talent adds, per rank (D-711 phase 2). `types: ["all"]` is any
 * damage; anything else is a `damageTypes` key. `when` null is always.
 */
const damage = (types, applies, extra = {}) => ({ amount: "rank", types, applies, when: null, ...extra });
const add = (key, value) => ({ key, type: "add", value });
// A `multiply` change helper stood here for Pack Hobgoblin alone and went
// with it (D-735): a doubling in the `final` phase lands after the derivation
// it was meant to move, and there is no second row that wants one.
/** Reviewed and left to the table, with the reason (D-648). */
const none = reason => ({ automated: "none", reason });
/**
 * What a talent spends as part of an attack (D-770), in `rules/riders.mjs`'s
 * shape: every key present, so a row never differs in shape from another.
 */
const rider = (pool, amount, { once = null, form = false, weapon = null, move = null, onHit = {}, atRank = [], discount = null, pays = null, needs = null, strike = null, ammo = undefined, throwAs = undefined } = {}) => ({
  cost: { pool, amount }, once, form, weapon, move,
  onHit: { condition: null, value: null, damage: null, prone: false, heal: null, noHealing: null, sl: null, ...onHit },
  atRank, discount,
  // D-772: paid on a hit alone (Bloodthirst), struck with a shield (Shield Slam)
  // at a Rating of its own.
  pays, needs, strike,
  // B1 (the Legacy branches' doors 15 and 26), NAMED ONLY WHERE A ROW CARRIES ONE so
  // every rider before them keeps its shape: no ammunition spent (Black Arrow), and
  // the throw a hammer or a mace makes for this attack (Storm Bolt).
  ...(ammo === false ? { ammo: false } : {}),
  ...(throwAs ? { throwAs } : {})
});

/**
 * **A SPELL A CHROMATIC CHAMPION'S BRANCH TEACHES** (02 §7: *A spell a branch teaches is
 * cast with Constitution, and you pay Rage where 07-MAGIC asks for Mana*): a `spell` row
 * that learns its names, priced in Rage and cast with Constitution - the shape
 * `class-talents.mjs#spellPoolFor` reads (04's Shadowcraft's, door 8).
 */
const branchSpell = (names, extra = {}) => ({ names, learn: true, pool: "rage", ability: "con", ...extra });

/**
 * A RACE talent's mechanics (D-675). Racial talents are embedded as real
 * talent items but carry `className: ""` and `race: "Goblin"`, so
 * `TALENT_EFFECTS` — keyed by class — can never match one, and Pack
 * Hobgoblin had no carrier at all.
 *
 * Keyed by the race the way `TALENT_EFFECTS` is keyed by the class. Only the
 * rows with a mechanic on a derived number live here; a racial talent whose
 * effect is prose stays prose.
 */
export const RACE_TALENT_EFFECTS = Object.freeze({
  // **THE CHROMATIC OUTCAST'S EIGHT** (02 §5; stage 3A of the Chromatic Champion plan). The
  // guise people's own talents are never embedded (`rules/guise.mjs`); these are.
  "chromatic-outcast": {
    // *You know by smell which flight a dragon or dragonkin belongs to, and you know a dragon
    // wearing a mortal shape when you stand within 30 feet of it. It knows you as well.*
    "scent-of-the-flight": none("what a smell tells the Outcast, and that the dragon knows it back, is what the GM says: the table's (D2 §12)"),
    // *Handling a coin, a gem or a piece of worked metal tells you what it is worth and where
    // it was made, and in any room you can tell which thing in it is worth the most.*
    "hoard-sense": none("a price and a maker the GM names, and the most valuable thing in a room the GM points to: the table's (D2 §12)"),
    // *You speak Draconic, the tongue of every flight and its dragonkin, and you read anything
    // they have written. A dragonkin will hear you out before it fights you.*
    // The lead, 2026-11-08: *"Add Draconic"* - 02 SS4 lists it now and `AZEROTH.languages`
    // carries it. A `language` row ADDS the tongue to what the character speaks, derived and
    // never stored (`talentLanguages`, read by `CharacterData` and the creator); the
    // dragonkin hearing the Outcast out stays the GM's call (D2 SS12).
    "draconic": { language: "draconic", reason: "*A dragonkin will hear you out before it fights you* is the GM's call (D2 SS12): no door decides whether a creature fights" },
    // *You take no damage from a fall and land on your feet.* INLINE: the falling door
    // (`AzerothActor#applyDamage`'s `falling`) reads the talent by name and lands nothing;
    // the sideways drift while falling is the table's.
    "wings-beneath": { automated: "inline", fall: { noDamage: true } },
    // *Spend a Half-Action and 4 Momentum or Power. Every enemy within 5 feet makes a Reflex Resilience Test against 8 plus your Constitution modifier plus
    // your Proficiency Bonus. On a failure it is knocked Prone.* The lead, 2026-11-09:
    // *"Pay 4 from your Momentum or your Power pool (Rage, Energy, Mana...). The DC is 8 +
    // Constitution modifier + proficiency, so it works the same for every class."* War
    // Stomp's shape: the circle measured by the Use, the price from the pool the payer picks
    // (`rules/pools.mjs#ANY_POOL`, asked before anything is paid), the Test at `con8`
    // (`class-features.mjs#con8DC`, never the Spell DC), the Prone landing on a failure.
    "tail-sweep": {
      grants: grant({
        action: "half", cost: cost(ANY_POOL, 4), area: "A 5 ft radius centered on you", who: "enemy",
        resist: "reflex", resistDc: "con8",
        inflicts: [{ condition: "prone", value: null, until: null, onFail: true }]
      })
    },
    // *Once between Long Rests, ask one question about a place, a ruin or a creature that the
    // four flights would remember. What returns is true and comes as one sentence.* A counter;
    // the answer is the GM's.
    "blood-memory": {
      grants: grant({ action: null, uses: uses(1, "long") }),
      reason: "the one true sentence that returns is the GM's to give (D2 §12); the Use counts the Long Rest's question"
    },
    // *A thing you have kept through a Long Rest is yours by the old law. You always know its
    // direction and rough distance out to 100 miles, and you have a Boon on Tests to track
    // whoever took it from you.*
    "hoarder's-claim": none("which thing was kept through a Long Rest, where it is and whether a Test tracks its taker are the table's; the roll dialog prints the talent's words on a Test as a note"),
    // *Once in an arc, address a true dragon as kin. It hears you out and grants one favor
    // that costs it nothing it values. Afterward it remembers you, and so does Nefarian.* A
    // counter; the favor is the GM's.
    "wyrm's-regard": {
      grants: grant({ action: null, uses: uses(1, "arc") }),
      reason: "the favor a true dragon grants, and what Nefarian remembers, are the GM's (D2 §12); the Use counts the arc's address"
    }
  },
  // **THE SAN'LAYN'S EIGHT** (02 §5's thirteenth people; the San'layn plan's A.6 item 4; D-1148).
  // Keyed `sanlayn`, the parser's key: `talentEffect` reads a people through `peopleKey` (F2).
  sanlayn: {
    // *Your bite leaves no mark, and a sleeping creature you feed from does not wake.*
    "clean-feeder": none("whether a bite shows and whether a sleeper wakes are the GM's to judge at the table (D2 §12); no door feeds from a sleeper"),
    // *You smell fresh blood within 60 feet, even through a closed door. You can tell from the
    // scent whether the blood is diseased or poisoned.*
    "blood-sense": none("what the San'layn smells within 60 feet, and whether the blood is diseased or poisoned, is what the GM tells the player (D2 §12)"),
    // *You know who marched with Kael'thas, which house each came from, and who died at Icecrown.*
    "the-prince's-march": none("what the San'layn knows of the march, and what a blood elf says of the ones it lost, is the GM's to give (D2 §12)"),
    // *When a creature tries to see through your cover, you have a Boon on any Test you make to
    // keep it. Where the GM has only the creature roll, it takes a Bane instead.* The plan's A.6
    // item 4: a granted passive whose `reminder` draws an UNTICKED judgement line on every skill
    // Test - no `skills` filter, because the GM picks the skill (the lead, R2: *"Deception or
    // Medicine can be used as examples but it's the GM's decision"*). Whether a creature is trying
    // to see through the cover is the table's, so the line is never ticked for the player.
    "courtly-masquerade": {
      grants: grant({ kind: "passive", action: null, reminder: { kinds: ["skill"], text: "AZEROTH.Feature.Reminder.CourtlyMasquerade", boons: 1 } }),
      reason: "the Bane where only the creature rolls is on the GM's own roll for that creature, and whether a creature is trying to see through the cover is the table's call (D2 §12); the San'layn's own Test carries the Boon as an unticked line"
    },
    // *Once per encounter, spend a Half-Action and bite a creature within 5 feet. It makes a Body
    // Resilience Test against 8 plus your Constitution modifier plus your Proficiency Bonus, taking
    // Physical damage equal to twice your tier on a failure. You recover Health equal to the damage
    // it takes, and a living creature that fails gives you 1 unit of blood for your next Short
    // Rest.* Life Drain's shape (`onUse.healsDealt`, the one damage door heals the San'layn by what
    // the blow took), the Test at `con8` (`class-features.mjs#con8DC`, never the Spell DC), the
    // damage on a failure alone (`onFail`), the one creature named within 5 feet (`aim`), and the
    // unit read off this row by the Resist's failure (`effects/blood.mjs#bloodFromResist`).
    "open-vein": {
      grants: grant({
        action: "half", uses: uses(1, "encounter"), resist: "body", resistDc: "con8",
        damage: { amount: "2*tier", type: "physical", onFail: true }
      }),
      onUse: { healsDealt: true, aim: { feet: 5 } },
      bloodUnit: { living: true, onFail: true, units: 1 },
      reason: "*Every creature that sees the bite knows what you are* is the table's (D2 §12)"
    },
    // *For 1 hour after you drink a unit of blood, your skin is warm and your heart beats.*
    "borrowed-warmth": none("what a touch or a Medicine Test finds, and what sees through it, is the GM's at the table (D2 §12); the hour after a unit is drunk is the table's to keep"),
    // *Once between Long Rests, when you drink from a living creature, learn one thing it saw in the
    // last day.* A counter; what surfaces is the GM's.
    "what-the-blood-remembers": {
      grants: grant({ action: null, uses: uses(1, "long") }),
      reason: "what surfaces from the blood - a face, a place or words - is the GM's to choose (D2 §12); the Use counts the Long Rest's one memory"
    },
    // *Once in an arc, call in a debt from a San'layn who still serves in Northrend.* A counter.
    "a-debt-in-icecrown": {
      grants: grant({ action: null, uses: uses(1, "arc") }),
      reason: "the one thing the court does, and who in Icecrown learns where you are, is the GM's (D2 §12); the Use counts the arc's debt"
    }
  },
  human: {
    'militia-drill': { grants: grant({ action: null }), onUse: { militiaDrill: true } }
  },
  "blood-elf": {
    "the-hunger-mastered": { grants: grant({ action: null, uses: uses(1, "arc") }), onUse: { restoreAllPower: true } }
  },
  "night-elf": {
    "elune's-light": { grants: grant({ action: null }), onUse: { elunesLight: true } },
    "elune's-regard": { automated: "inline", failedTestSuccess: { sl: 0, per: "arc" }, reason: "Actor.offerElunesRegard replaces a failed Test with success at SL 0 before consequences; the active GM spends its arc counter." }
  },
  dwarf: {
    // 02 §5: *Climbing and **Difficult ground** cost you no extra movement*
    // (D-757). INLINE: the one terrain door reads `movementFactsFor` when it
    // prices a step (`canvas/behaviors.mjs`), so a dwarf walking Consecration's
    // Difficult ground or climbing a cliff pays a foot a foot - for every
    // source of Difficult ground, a GM's own drawn rubble included.
    "mountain-bred": { automated: "inline", movement: { ignoresGround: true, climbsFree: true } }
  },
  gnome: {
    "escape-artist": { escapeAction: "half", reason: "rules/escapes.mjs escapeAction reduces Entangled and grapple escapes; chat escape and Snare payment read it" },
    // 02 §5, tier 3: *Once per encounter, a device you built or a gadget you know
    // works one step better and then breaks. This costs no action* (the lead, phase 0:
    // *"Yes, gadgets too"*; the Legacy branches' B2). A counter, its Use costing no
    // action: the one chooser names the gadget known (04's Gadgeteer) or the device
    // carried (08 §13) that works one step better, and the gadget's own use is
    // struck - *then breaks* is the gadget spent until it comes back at a Short Rest
    // (MY READING, for the lead). What *one step better* is stays the table's (D2
    // §12), and the card says so in words.
    overclock: {
      grants: grant({ action: null, uses: uses(1, "encounter"), choice: "overclock" }),
      overclock: { gadgets: true, devices: true },
      reason: "what one step better is - a longer reach, a harder Test, a second target - is the table's call (D2 §12); the door names the gadget or device and strikes the gadget's use"
    },
    // 02 §5, tier 4: *Between Long Rests, build one device from 08-EQUIPMENT or one
    // gadget from 04-TALENTS that you have the parts for, at no cost in gold. It works
    // for a day* (the lead: *"Yes, gadgets too"*). A Use once a Long Rest whose one
    // chooser lists every gadget and every 08 §13 device: a gadget stands as a
    // gadget known with its own use, a device is carried, each until the next Long
    // Rest (*It works for a day*; MY READING: the day is the Long Rest's).
    "mekkatorque's-blueprint": {
      grants: grant({ action: null, uses: uses(1, "long"), choice: "blueprint" }),
      blueprint: { gadgets: true, devices: true }
    }
  },
  orc: {
    // 02 §5, tier 3: *Spend 4 Momentum to grant a friendly target you can see within 60
    // feet a Boon on their next Test. This costs no action* (the B8a2 pass: it had no row).
    // 04's Blessing's shape (D-772): one friendly creature targeted, measured where both
    // tokens stand (*within 60 feet*), its Boon laid through the one door
    // (`effects/banes.mjs#layBoon`) and spent by its next Test; 4 of 05 §11's kind word
    // `momentum` - the Momentum pool the orc's class holds, War Stomp's reading
    // (`rules/pools.mjs#ANY_MOMENTUM`), refused in words for a class with none. *You can
    // see* is the table's, as Blessing's is.
    "thrall's-discipline": {
      grants: grant({ action: null, cost: cost("momentum", 4) }),
      onUse: { laysBoon: { kinds: "all", boons: 1, until: "next", feet: 60 }, friendly: true }
    }
  },
  ogre: {
    "two-heads": {
      castingBoon: { boons: 1 },
      gap: "Odd-dice forced failure and 1 Power return await the ruling for Casting Tests rolling other than two dice."
    },
    "bellow": {
      grants: grant({ action: "half", uses: uses(1, "encounter") }),
      onUse: { laysBane: { kind: "all", banes: 1, until: "next", many: true, feet: 20, hearing: true } }
    },
    "stonemaul-grip": { disarmImmune: true, reason: "rules/stonemaul-grip.mjs guards Disarm selection, application and held-weapon restrictions" }
  },
  goblin: {
    "rocket-jump": { grants: grant({ action: "half", uses: uses(1, "encounter") }), onUse: { rocketJump: true } },
    // 02 §5: *The bag slots you carry yourself are doubled and nobody asks
    // how.* The only line in the book that changes capacity by name. A goblin
    // is Small (×½ on 05's ladder), so this returns them to a Medium load.
    //
    // **IT WAS AN ACTIVE EFFECT AND IT NEVER MOVED A THING** (D-735).
    // `passivesFor` forces every change to the `final` phase, which lands
    // AFTER `CharacterData#prepareDerivedData` has already worked the load
    // out - so the number on the sheet doubled and the load state, the Speed
    // penalty and every refusal read the undoubled one. It is INLINE now:
    // `carryFactor` below is read inside the derivation, before anything
    // depends on it, and `syncTalentEffects` deletes the stale effect at the
    // next world load because the row no longer asks for one.
    "pack-hobgoblin": { automated: "inline", carry: 2 }
  },
  tauren: {
    'kodo-bond': { grants: grant({ action: null }), onUse: { kodoBond: true } },
    // 02 §5, tier 2: *Spend a Half-Action and 4 Momentum. Every enemy within 5 feet makes a
    // Reflex Resilience Test at a Standard DC for your tier — 12, 16, 20 or 24. On a failure
    // it is knocked **Prone*** (the B8a pass: it had no row, and the Standard DC for a tier
    // was a DC kind no door read). A Use: the Half-Action; 4 of the Momentum pool the
    // tauren's class holds (`rules/pools.mjs#ANY_MOMENTUM` - a Shaman holds none and is
    // refused in words); every enemy within 5 feet gathered by the Use itself (the lead:
    // *"Measure the area"*); each one's Reflex Test at 05 §3's Standard DC for the tauren's
    // tier (`resistDc: "standard"`); and the Prone its failure lands at once (`onFail`; the
    // lead: *"Land automatically"*).
    "war-stomp": {
      grants: grant({
        action: "half", cost: cost("momentum", 4), area: "A 5 ft radius centered on you", who: "enemy",
        resist: "reflex", resistDc: "standard",
        inflicts: [{ condition: "prone", value: null, until: null, onFail: true }]
      })
    }
  },
  troll: {
    "zalazane's-lesson": { grants: grant({ action: null, uses: uses(1, "arc") }), onUse: { zalazane: true } },
    "da-voodoo": {
      grants: grant({ action: "half", uses: uses(1, "encounter") }),
      onUse: { sight: true, laysBane: { kind: "all", banes: 1, until: "next" } }
    },
    // 02 §5: *You swim at full Speed and hold your breath for ten minutes*
    // (the final review of D-757). INLINE, beside Mountain-Bred: the movement
    // door reads `movementFactsFor` when it prices a step and paces a swim
    // (`canvas/behaviors.mjs#movementFactsOf`), so a Darkspear swims a foot a
    // foot at its Speed where 05 charges everybody else two. The breath is the
    // table's.
    "island-blood": { automated: "inline", movement: { swimsFree: true } },
    // 02 §5, tier 3: *Once per Short Rest, spend a Half-Action and 4 Momentum. Your attacks
    // gain a Boon until the end of the encounter* (the B8a2 pass: it had no row). A Use: the
    // Half-Action, 4 of the class's Momentum pool (War Stomp's reading), once a Short Rest;
    // the Boon laid on the troll's OWN Attack Tests through the one door
    // (`effects/banes.mjs#layBoon`), LASTING - every attack takes it and none spends it - and
    // lifted when the troll leaves the fight (`AzerothCombat#_leaveFight`'s encounter lift).
    berserking: {
      grants: grant({ action: "half", cost: cost("momentum", 4), uses: uses(1, "short") }),
      onUse: { laysBoon: { kinds: "attack", boons: 1, until: "encounter" }, self: true }
    }
  }
});

export const TALENT_EFFECTS = Object.freeze({
  // **THE WARRIOR'S THIRTY-SIX** (D-772, the talent plan's Phase 4): every
  // talent built or carrying its reason, each kind read by the one door
  // `rules/class-talents.mjs` names; `warrior-talents.test.mjs` holds every number
  // to 04's own Effect cell.
  warrior: {
    // ---- Arms ----
    // *When making a called shot to the Head, you do not suffer the −2 to your
    // Attack Test* (D-772): `calledShotCost`'s Head modifier, at the roll and on
    // the dialog's own line.
    "heavy-hand": { calledShot: { headModifier: 0 } },
    // *When an attack of yours reaches SL 2, the target gains Bleeding equal to
    // your rank in this talent, to no more than your tier* (D-772; the class talent
    // audit's R1 and R8, D-1870): it lands with the blow, as a rider's condition does
    // (the lead, 2026-10-03, on a rider: *"Lands automatically"*), named for its source.
    "deep-cut": { hitLays: { sl: 2, condition: "bleeding", value: "min(rank,tier)" } },
    // *Cleave triggers on SL 3 rather than only when an attack you made reduces
    // a target to 0 Health. At rank 2 it triggers on SL 2* (D-772): 08 §5's
    // Cleave - *one attack against another target within reach at Damage Rating
    // −2. Once per round* - offered as a button on the card of a blow with a
    // Cleave weapon at the SL. Cleave's own kill trigger stays 08's note.
    "wide-swing": { extraStrike: { sl: 3, trait: "Cleave", count: 1, target: "other", rating: -2, atRank: [{ rank: 2, sl: 2 }] } },
    // *As part of an attack, spend 4 Rage. That attack ignores 1 Armor Point per
    // rank* (the class talent audit, D-1870): a rider, its Pierce on the blow's own
    // (`riders.mjs#riderPierce`). It was a Half-Action's promise to the next attack.
    "precise-strike": { rider: rider("rage", 4, { onHit: { pierce: "rank" } }) },
    // *When an attack or effect of yours reduces a target to 0 Health, your next
    // attack this round gains a Boon. At rank 2 that attack also adds your tier to
    // its damage* (D-772; the audit, D-1870): from the one damage door (`afterBlow`),
    // the tier in scope (`killRewardsFor`).
    "follow-through": { kill: { nextAttack: { boons: 1, lasts: "round" }, atRank: [{ rank: 2, nextAttack: { boons: 1, damage: "tier", lasts: "round" } }] } },
    // *Your Sunder strips 1 more Armor Point per rank* and *costs 2 Rage less per
    // rank, to a minimum of 2*: `rules/maneuvers.mjs` reads both by name (D-626, D-768).
    "rend-armor": { automated: "inline" },
    // *You inflict a Critical Injury on 19 or 20 against a target below half
    // Health. At rank 2 this applies below three quarters* (D-772).
    "executioner": { critical: { on: 19, below: 0.5, atRank: [{ rank: 2, below: 0.75 }] } },
    // *As part of an attack, spend 8 Rage. On a hit the attack adds twice your tier
    // to its damage, and the target recovers no Health until the end of your next
    // turn* (D-772; the audit, D-1870): a rider, its damage on the Rating and its
    // mark on the target (`rules/no-healing.mjs`).
    "mortal-strike": { rider: rider("rage", 8, { onHit: { damage: "2*tier", noHealing: "strikerTurnEnd" } }) },
    // *Once a round, when you hit a target that has lost Armor Points to your Sunder,
    // gain 1 more Rage. At rank 2 that hit also adds 1 to its damage* (the audit,
    // D-1870): the hit door (`effects/audit-martial.mjs#martialOnRoll`) reads who
    // sundered the target off its Sundered effect (`audit-martial.mjs#sunderedBy`).
    "sundering-blows": { automated: "inline", martial: { kind: "sunderingBlows" } },
    // *When an attack of yours misses, or is Parried or Blocked, gain 1 Rage per rank.
    // Once a turn, your next attack against that target this turn gains a Boon*
    // (renamed from Bladeturn by the audit, D-1870): the miss at the roll and the
    // Parry or Block at the Reaction's door, the Boon a promise held to the turn.
    "overpower": { automated: "inline", martial: { kind: "overpower" } },
    "killing-blow": { automated: "inline" },
    // *As an action, spend 8 Rage. Make two attacks against every enemy within your
    // reach, each rolled separately* (the audit's R5, D-1871): two presses of the
    // card's Attack per creature (`cardAttackAllowance`'s `each:2`), counted as one
    // Attack on the turn (R6).
    "whirlwind": { grants: grant({ action: "action", cost: cost("rage", 8), attack: true, attacks: "each:2" }) },
    // ---- Fury ----
    "enrage": { automated: "inline" },
    "quick-draw": none("drawing, sheathing and swapping already cost no action anywhere in this system: 05's Interact Half-Action is not charged (rules/reactions.mjs HALF_ACTIONS.interact), so there is nothing for the talent to waive"),
    // *Your attacks gain a Boon. Until your next turn, attacks against you gain
    // one too. At rank 2, each hit against you while this lasts gives you 1 more
    // Rage* (D-772; the audit, D-1870): a checked line on the holder's attack
    // dialog, the attack made with it laying the exposure, and the struck door's
    // further Rage at rank 2 (`effects/audit-martial.mjs#martialWhenStruck`).
    "reckless": { automated: "inline", reckless: { boons: 1, exposed: { boons: 1, ranged: false } }, martial: { kind: "reckless", rank: 2 } },
    // *When one of your attacks hits, spend 4 Rage. You recover Health equal to
    // your tier plus your rank* (D-772; the audit's T4, D-1870): a rider ticked on
    // the dialog and paid only when the blow lands (MY READING, for the lead).
    "bloodthirst": { rider: rider("rage", 4, { pays: "hit", onHit: { heal: "tier+rank" } }) },
    // A failed Test offers the reroll before its consequences are resolved;
    // its original action, ammunition and riders are never paid a second time.
    "second-strike": {
      offHand: { noPenalty: true },
      reroll: { pool: "rage", cost: 4, rank2: 2, per: "round" }
    },
    // *The first time each encounter you drop below half Health, gain Rage equal to
    // twice your tier* (the audit, D-1870): the struck door, its once an encounter the
    // counter the talent grants (`effects/audit-martial.mjs#martialWhenStruck`).
    "frenzy": { grants: counter(1, "encounter"), martial: { kind: "frenzy" } },
    // *When an attack or effect of yours reduces a target to 0 Health, gain a
    // Half-Action. It cannot buy a third Attack. At rank 2 you also gain 2 Rage*
    // (D-772; the audit's R6, D-1864): the budget refuses the third Attack.
    "rampage": { kill: { halfActions: 1, atRank: [{ rank: 2, gain: { pool: "rage", amount: 2 } }] } },
    // The equipment law reads the taken talent before filtering physical items.
    // Each weapon takes one hand; the category remains two-handed for talent
    // gates, and no Versatile benefit is granted by this exception.
    "titans-presence": {
      unanswerable: true
    },
    // *While you hold more than 7 Rage, you cannot be Frightened. At rank 2 you cannot
    // be Charmed either* (the audit, D-1870): refused at `toggleStatusEffect` through
    // the derived `conditionImmunities`, read off the Rage this preparation holds.
    "blood-craze": { steadfast: { immune: ["frightened"], while: { pool: "rage", above: 7 }, atRank: [{ rank: 2, immune: ["frightened", "charmed"] }] } },
    // *Once a round, when an attack reaches SL 2, make one extra attack against
    // the same target. At rank 2 this may happen twice a round* (D-772): a button
    // on the card, the round's record its clock.
    "flurry": { extraStrike: { sl: 2, count: "rank", target: "same", rating: 0 } },
    "wounded-beast": { automated: "inline" },
    // *When reduced to 0 Health, spend all your Rage. You stay at 1 Health for one
    // round per 2 Rage spent, then fall as usual* (D-779; the lead, 2026-10-03, on
    // O-173: *"Heals cancel the fall."*): the one hold at 1 asks it in the blow, in a
    // fight - all the Rage spent, an effect counting the rounds - and the warrior
    // falls when they run out unless a heal landed in them
    // (`class-answers.mjs#undyingRageHold`, `undyingFalls`).
    "undying-rage": {
      undying: { per: 2 },
      reason: "Lead ruling 2026-10-29: only the triggering hit leaves 1 Health; subsequent damage applies normally. Out of a fight the rounds are the table's."
    },
    // ---- Bulwark ----
    // *While a friendly target is within 5 feet of you, your Block reduces 1 more
    // damage per rank, to no more than your tier* (D-772; R1, D-1870): the Block's
    // door measures the friendly target - somebody other than the warrior (MY READING,
    // for the lead) - and reads the cap at the blocker's tier.
    "shield-wall": { block: { add: "min(rank,tier)", allyWithin: 5 } },
    // *you cannot be pushed by any effect that does not lift you* (D-778): the
    // forced-movement door refuses the holder a push, in words (`refusesPushFor`).
    // MY READING, for the lead: none of the pushes the system makes lifts, and a
    // pull is no push.
    "immovable": {
      immovable: { pushes: true },
      reason: "*Press and Overbear cannot move you*: 06 §7's maneuvers move no token by any door, so the move they make is the table's and so is its refusal; Overbear's Prone is not a move"
    },
    // Passives (D-648): Fortitude is Health (05).
    "toughness": { passive: passive([add("system.health.max", "2*rank")]) },
    // *As a Half-Action, spend 4 Rage. A target that can see you takes a Bane,
    // per rank, attacking anyone but you until the end of your next turn*
    // (D-772): a laid Bane that spares the warrior, on the one creature targeted.
    "taunt": { grants: grant({ action: "half", cost: cost("rage", 4) }), onUse: { laysBane: { kind: "attack", banes: "rank", except: "user", until: "userTurnEnd" } } },
    // *Your first Block each round costs no Reaction. At rank 2, your second each
    // round costs no Reaction* (D-772).
    "deflection": { freeReaction: { reaction: "block", count: "rank" } },
    // *If you do not move by the end of your turn, your Armor Points increase by
    // 1 per rank* (D-779; the lead, 2026-10-03, on O-174: *"Next move"*): laid at
    // the end of a turn the warrior did not move in, and lifted by their next move
    // (`AzerothCombat#_bracing`, `effects/bracing.mjs`).
    "bracing": { bracing: { ap: "rank" } },
    // *Name a school during a Long Rest. A third of your Armor Points, rounded
    // down, applies to your Ward of that school. At rank 2 you may apply half*
    // (D-772): a Use once a Long Rest names the school; the Ward is derived off
    // the BODY's Armor Points (MY READING, for the lead, after D-755's Avenging
    // Bulwark) after every effect has landed.
    "warded-plate": { grants: grant({ action: null, uses: once("long"), choice: "schools" }), onUse: { plate: true }, plate: { fromBodyAP: 3, atRank: [{ rank: 2, fromBodyAP: 2 }] } },
    // *As a Reaction, spend 6 Rage to take a hit aimed at a friendly target
    // within 5 feet. You take the damage in full. At rank 2 the range is 10 feet*
    // (D-777; the lead: *"If the talent moves damage it should just move the
    // damage as directed"*): the damage door ASKS the warrior as a hit lands on a
    // friendly target in reach, and a yes pays the Rage and the Reaction and moves
    // the hit whole (`effects/blow-doors.mjs#redirectBlow`). The Use stays the
    // table's own door for a hit no card carried.
    "guardian": { grants: grant({ action: "reaction", cost: cost("rage", 6) }), moves: { kind: "guardian", feet: 5, cost: { pool: "rage", amount: 6 }, atRank: [{ rank: 2, feet: 10 }] } },
    // *Enemies Engaged with you cannot Disengage, and moving away from you
    // provokes as normal* (D-772): read by name at the departure's measure and
    // at the Disengage control.
    "anchor": { automated: "inline" },
    // *As a Half-Action, spend 6 Rage for temporary Health equal to twice your
    // tier per rank. It lasts until the encounter ends* (D-777; the audit, D-1870:
    // 6 Rage, it was 10; the lead: *"raise HP past max as temp hp"*): the Use grants
    // it to the warrior through 05's law, until the fight ends.
    "last-stand": {
      grants: grant({ action: "half", cost: cost("rage", 6) }),
      onUse: { tempHealth: { amount: "2*tier*rank", span: "encounter" } }
    },
    // *As part of an attack while you carry a shield, spend 6 Rage. On a hit it adds
    // your tier plus 2 to its damage, and the target's next attack before the end of
    // your next turn takes a Bane. At rank 2 a hit at SL 2 also ends one spell the
    // target is Sustaining* (the audit, D-1870): the shield still needed, the weapon's
    // own Rating kept, the Bane laid through 06 §6's door, and the Sustain ended after
    // the card stands (`effects/audit-martial.mjs#martialAfterCard`).
    "shield-slam": { rider: rider("rage", 6, { needs: "shield", onHit: { damage: "tier+2", bane: { kind: "attack", banes: 1, until: "strikerTurnEnd" } } }), martial: { kind: "shieldSlam", rank: 2, sl: 2 } },
    // *While you carry a shield, roll any Critical Injury against you twice and take
    // the lower. Once per encounter, as a Reaction, spend 6 Rage. Until the start of
    // your next turn every attack against a friendly target within 10 feet of you
    // targets you instead, and you Block each without spending a Reaction* (the audit,
    // D-1870): the first sentence read by name at the Critical Injury's roll; the Use
    // lays one effect on the warrior, read by the damage door as Timeless Sentinel's
    // move is (`effects/blow-doors.mjs#movesOf`) and by the Block's door as a free Block.
    "unbreakable": {
      automated: "inline",
      grants: grant({ action: "reaction", cost: cost("rage", 6), uses: once("encounter") }),
      onUse: { martial: "unbreakable" }
    },
    // ---- Blademaster (Orc; the Legacy branches, D-781) ----
    // **THE LEGACY BRANCHES' ROWS** (the plan's phase B6): every one rides a door
    // phases B1 to B3 built, named beside it; `warrior-talents.test.mjs` holds each
    // number to 04's own Effect cell at every rank.
    // *While you wear no armor in your Chest slot, your Speed rises by 5 feet per
    // rank*: an owner-side passive gated on what is worn (door 15's `noSuit` - only a
    // suit fills the Chest tile), laid again by the sync on every equip.
    "wolfs-pace": { passive: passive([add("system.speed", "5*rank")], { wields: ["noSuit"] }) },
    // *While you wear no armor in your Chest slot, a successful Parry gives 2 Rage per
    // rank* (the lead's own wording): read at the Parry that holds (`parryGainsFor`).
    "read-the-blade": { parry: { gain: { pool: "rage", amount: "2*rank" }, when: { wields: ["noSuit"] } } },
    // *When an attack of yours reaches SL 2, gain 1 further Rage per rank*: a further
    // gain on the hit (`momentumOnHitFor`), Aimed Volley's shape with no once.
    "telling-blow": { momentum: { pool: "rage", amount: "rank", sl: 2, form: false } },
    // *As a Reaction at any time, spend 4 Rage. Move up to your Speed, ignoring Difficult
    // ground. No creature may take a Reaction against you until your next turn. At rank 2
    // you are also hidden, even while observed, until you next attack, and that attack
    // adds your Dexterity modifier to its damage* (the lead, phase 0: *"No limit"* - the
    // Reaction is the limit): one Move that costs no Half-Action and ignores the ground
    // (door 25), the unanswered state (door 14), and at rank 2 the concealment the next
    // attack ends, CARRYING THE DEXTERITY THAT ATTACK ADDS (`conceal.damage`, read at the
    // Use; `rules/legacy-uses.mjs#concealStrike`): *that attack* is the one that ends the
    // hiding, whenever it comes - the B6 review found a promise held to the encounter,
    // which out of a fight was never laid while the hiding was.
    "wind-walk": {
      grants: grant({ action: "reaction", cost: cost("rage", 4) }),
      onUse: {
        unanswered: true, freeMove: { ignoresGround: true },
        atRank: [{ rank: 2, conceal: { until: "attack", damage: "dex" } }]
      }
    },
    // *Your Riposte costs 2 Rage less per rank* (the lead, phase 0: *"Keep it free"* at
    // rank 2): `rules/maneuvers.mjs#maneuverCost` reads it by name, off whatever price
    // stands, never below nothing.
    "return-stroke": { automated: "inline" },
    // *Once per turn, name a creature that can see you. This costs no action and no Rage.
    // Until the end of your next turn your attacks against it gain a Boon. Naming another
    // creature ends it on the first* (the class talent audit's A3, D-1870: the taunt's Bane
    // went): door 18's mark, once on each of your own turns, and the Boon its fact gates
    // (`targetBoonsWith`). `noBane` tells the mark's door to lay no Bane.
    "the-challenge": {
      grants: grant({ action: null }),
      onUse: { mark: "challenge", noBane: true },
      targetBoon: { kind: "attack", boons: 1, when: "challenged" },
      reason: "whether the creature named can see you is the table's (D2 §12)"
    },
    // *While you wield a two-handed weapon, an attack of yours that reaches SL 2 adds
    // half your Dexterity modifier, rounded up, to its damage. At rank 2 an attack that
    // reaches SL 3 adds twice that instead and ignores Armor Points*: damage after the
    // die at its SL (door 26), the wield gate read off the hands (door 15).
    "critical-strike": {
      damage: damage(["all"], "attack", {
        amount: "ceil(dex/2)", sl: 2, when: { wields: ["twoHanded"] },
        atRank: [{ rank: 2, steps: [{ sl: 3, amount: "2*ceil(dex/2)", ignoresArmor: true }] }]
      })
    },
    // *While you wield a two-handed weapon and wear no armor in your Chest slot, your
    // Defense rises by 1 per rank*: a passive gated on both.
    "blade-circle": { passive: passive([add("system.defense", "rank")], { wields: ["twoHanded", "noSuit"] }) },
    // *Against the creature you named with The Challenge, you inflict a Critical Injury on
    // 19 or 20. At rank 2 this applies on 18 to 20*: the mark's fact (door 18).
    "makgora": { critical: { on: 19, when: "challenged", atRank: [{ rank: 2, on: 18 }] } },
    // *As a Reaction when an attack hits you, spend 6 Rage. The attack misses. You may use
    // this a number of times equal to your rank per Short Rest*: pressed from the incoming
    // card beside Parry and Block, the hit withdrawn whole (door 13).
    "afterimage": {
      grants: grant({ action: "reaction", cost: cost("rage", 6), uses: uses("rank", "short") }),
      onUse: { mitigate: "negate" }
    },
    // *While you wield a two-handed weapon and wear no armor in your Chest slot, when an
    // attack of yours inflicts a Critical Injury, gain 3 Rage per rank*: a further gain on
    // the attack's own Critical Injury, both wield facts read off the hands.
    "bloodied-blade": { momentum: { pool: "rage", amount: "3*rank", form: false, when: ["critical", { wields: ["twoHanded", "noSuit"] }] } },
    // *As an action while you wield a two-handed weapon, spend 10 Rage. Move up to your
    // Speed. No creature may take a Reaction against you until your next turn. Make two
    // attacks against each enemy that comes within your reach during the move, rolled
    // separately; no enemy is attacked more than twice. Until your next turn your Armor
    // Points rise by your Dexterity modifier* (the class talent audit's R5, D-1871): the
    // wield refused in words, the free Move, the unanswered state, two presses of the
    // card's Attack for each creature named (Whirlwind's shape, `each:2`), and the Armor
    // Points on the Use's own effect until the warrior's next turn.
    "bladestorm": {
      grants: grant({ action: "action", cost: cost("rage", 10), attack: true, attacks: "each:2" }),
      onUse: { wields: ["twoHanded"], unanswered: true, freeMove: {}, armor: { ap: "dex", until: "userTurnStart" } },
      reason: "which enemies come within reach during the move is the table's to name: target them before the Use and the card's Attack makes one roll for each, as Whirlwind's does"
    },
    // ---- Mountain King (Dwarf; the Legacy branches, D-781) ----
    // *As part of a melee attack, spend 2 Rage. On a hit the target loses its Reaction. At
    // rank 2 a hit at SL 2 also knocks it Prone*: a rider whose rank clause's SL gates that
    // clause alone (`riders.mjs#riderOutcome`), so the Reaction goes on any hit.
    "bash": { rider: rider("rage", 2, { weapon: "melee", onHit: { loseReaction: true }, atRank: [{ rank: 2, onHit: { prone: true, sl: 2 } }] }) },
    // *Your Second Wind class feature restores 1 more Health per rank*: a patch, its rank
    // bound into the stamp (D-768).
    "stout-heart": { modifies: mod("Second Wind", { heal: { add: "rank" } }) },
    // *While you hold melee weapons of two different types, one in each hand, such as an
    // axe and a hammer, your Off-Hand Attack builds Rage as your other hits do and deals 1
    // more damage per rank* (the lead, phase 0: *"Type, not kind"*): read at the off-hand
    // blow off 08 §7's Type (door 26).
    "axe-and-hammer": { offHand: { builds: true, damage: "rank", when: { wields: ["twoTypes"] } } },
    // *As part of an attack with a Thrown weapon, spend 6 Rage. For this attack a weapon of
    // the hammer or mace type counts as Thrown (20 ft), and an attack made with one uses
    // Strength. On a hit at SL 2 the target is Stunned until the end of its next turn. At
    // rank 2 any hit also costs the target its Reaction. The weapon returns to your hand*: a
    // rider on a throw, the throw a hammer or a mace makes on Strength (door 15), the Stun
    // spanned to the creature's own next turn, and the Reaction taken on any hit at rank 2.
    "storm-bolt": {
      rider: rider("rage", 6, {
        weapon: "thrown", throwAs: { types: ["hammer", "mace"], feet: 20, ability: "str" },
        onHit: { condition: "stunned", sl: 2, until: "endOfNextTurn" },
        atRank: [{ rank: 2, onHit: { loseReaction: true } }]
      }),
      reason: "*The weapon returns to your hand* asks nothing: no door takes a thrown weapon out of the hand"
    },
    // *When you end your turn without having moved, gain 1 Rage* (the class talent audit's T3,
    // D-1870; it was 2): Bracing's own measure.
    "unmoved": { stood: { gain: { pool: "rage", amount: 1 } } },
    // *Your Charge class feature applies to one more Overbear or Sunder each encounter per
    // rank*: Charge's own count of uses, 1 and the rank, struck by each maneuver it frees.
    "rockslide": { modifies: mod("Charge", { uses: { max: "1+rank" } }) },
    // *As a Half-Action, spend 6 Rage. Every enemy within 10 feet of you takes Nature damage
    // equal to your tier and is Slowed until the end of its next turn. At rank 2 each also
    // makes a Body Resilience Test against a DC of 10 plus your Strength modifier plus your
    // Proficiency Bonus, and is knocked Prone on a failure* (the lead, phase 0: *"10 + Str
    // modifier + Proficiency"*): the Use gathers every enemy within 10 feet (`who`; the
    // lead: *"Measure the area"*), the card's damage and Slowed on each of them whatever
    // the Test comes to - neither is the Test's (no `half`, no `onFail`) - and from rank 2
    // its Resist at the Strength DC (door 16), whose failure alone lays the Prone, at once
    // (`onFail`; the lead: *"Land automatically"*). THE ONE ROW (with Wrath of the Light)
    // WHOSE TEST GOVERNS ONE CLAUSE AND NOT THE OTHERS (the B6 review).
    "thunder-clap": {
      grants: grant({
        action: "half", cost: cost("rage", 6), area: "A 10 ft radius centered on you", who: "enemy",
        damage: { amount: "tier", type: "nature" },
        inflicts: [{ condition: "slowed", value: null, until: "endOfNextTurn" }, { condition: "prone", value: null, minRank: 2, onFail: true }],
        atRank: [{ rank: 2, resist: "body", resistDc: "str" }]
      })
    },
    // *Friendly targets within 5 feet of you, other than you, gain 1 Armor Point. At rank 2
    // this reaches 10 feet*: an aura on every ally in reach but the dwarf (D-755), its
    // reach 5 feet a rank.
    "shoulder-to-shoulder": { aura: aura({ feet: "5*rank", excludeOwner: true, armor: 1 }) },
    // *Your attacks deal 1 more damage per rank against a target that is Prone, Slowed or
    // Stunned*: a dialog line its gate ticks off the target's own conditions (door 17).
    "hammer-and-anvil": { damage: damage(["all"], "attack", { when: { targetHas: ["prone", "slowed", "stunned"] } }) },
    // *As a Reaction when an attack hits you, spend 4 Rage. You take half its damage,
    // rounded down. You may use this a number of times equal to your rank per Short Rest*:
    // Survival Instincts' halving mark, spent by the blow that lands.
    "bedrock": {
      grants: grant({ action: "reaction", cost: cost("rage", 4), uses: uses("rank", "short") }),
      onUse: { mitigate: "halve" }
    },
    // *An enemy within your reach that moves provokes an Opportunity Attack from you,
    // whether or not it leaves your reach. On a hit it is knocked Prone. At rank 2 your
    // first Opportunity Attack each round costs no Reaction* (door 22).
    "hold-the-hall": {
      provokes: { moving: true },
      hitLays: { condition: "prone", when: "opportunity" },
      freeReaction: { reaction: "opportunityAttack", count: 0, atRank: [{ rank: 2, count: 1 }] }
    },
    // *As a Half-Action, spend 10 Rage. Until the encounter ends your Armor Points rise by
    // 2, you have Ward 2 against every school, and your weapon attacks add 2 to their
    // Damage Rating. You may use this once per Long Rest*: one encounter effect on the
    // dwarf carrying all three (door 25), lifted when the fight ends.
    "the-mountain-wakes": {
      grants: grant({ action: "half", cost: cost("rage", 10), uses: once("long") }),
      onUse: { armor: { ap: 2, ward: 2 } },
      damage: damage(["all"], "attack", { amount: 2, until: "encounter" })
    }
  },
  // **THE PALADIN'S THIRTY-SIX** (D-772, the talent plan's Phase 5).
  paladin: {
    // ---- Retribution ----
    // *As part of an attack, spend 4 Zeal to add your tier to its damage. At rank
    // 2 it costs 3 Zeal* (D-772; the class talent audit's T5, D-1874): a rider whose
    // hit adds to the Rating, its rank clause lowering the price (`ridersFor`).
    "crusader-strike": { rider: rider("zeal", 4, { onHit: { damage: "tier" }, atRank: [{ rank: 2, cost: { amount: 3 } }] }) },
    // *Whenever a friendly target within 20 feet takes damage, gain 1 Zeal, to no more
    // than your rank each round* (the audit, D-1874): the damage door's Zeal walk, its
    // ceiling the round's counted marks (`effects/audit-martial.mjs#claimRoundCount`).
    "righteous-fury": { automated: "inline", martial: { kind: "righteousFury" } },
    // *Your Zeal caps at 15 rather than 10*: `rules/momentum.mjs#capFor` reads it
    // by name through the actor's `ranksOf` (D-627, D-768).
    "zealotry": { automated: "inline" },
    // *Your attacks gain a Boon against a target below half Health. At rank 2
    // this applies below three quarters* (D-772): a checked line on the dialog.
    "hammer-of-wrath": { targetBoon: { kind: "attack", boons: 1, below: 0.5, atRank: [{ rank: 2, below: 0.75 }] } },
    // *As a Half-Action, spend 6 Zeal. The target takes a Bane on attacks against
    // anyone but you for one round per rank* (D-772).
    "judgement": { grants: grant({ action: "half", cost: cost("zeal", 6) }), onUse: { laysBane: { kind: "attack", banes: 1, except: "user", rounds: "rank" } } },
    // *Against an undead or a demon, your Consecrated weapon counts as Blessed at
    // Greater grade, converting its damage to Holy* (D-772; the audit's A5, D-1874):
    // read by name where the weapon 02's Consecrated enchanted derives its trait
    // (`WeaponData#prepareDerivedData`), the grade a Greater one only against a target
    // whose kinds name undead or demon (`effects/audit-martial.mjs#sanctifiedAgainst`).
    "sanctified-weapon": { automated: "inline" },
    // Rank 1, *1 Zeal per rank returns* (D-627), and rank 2, *a spell or feature
    // of yours that cost 5 or more Zeal also applies Hammer of Justice to its
    // target ... costing no Mana and no action* (D-772), both read by name in
    // `useFeature`; the spell goes through `actions.mjs#castFreeSpell`.
    "hammer-of-justice": { automated: "inline" },
    // *When a friendly target within 20 feet drops to 0 Health, your next attack
    // this encounter adds your tier per rank to its damage* (D-772).
    "vengeance": { allyDown: { feet: 20, self: false, nextAttack: { damage: "tier*rank", lasts: "encounter" } } },
    // *You know Repentance. The first damage dealt to the target does not end
    // it.* The spell is taught; 07's *Any damage dealt to it ends the spell* is
    // the table's (nothing ends a laid spell on damage), so the talent's change
    // to it rides the card's note and is the table's with it.
    "repentance": { spell: { names: ["Repentance"], learn: true } },
    // *Until the encounter ends, all Holy damage you deal adds 1 damage per
    // rank.* Switched on by USING the feature the talent grants, so
    // `useFeature` lays it as a self effect and `_leaveFight` lifts it.
    // *Once per encounter* since the class talent audit (D-1874; it was once per Short Rest).
    "seal-of-command": {
      grants: grant({ action: null, cost: cost("zeal", 5), uses: once("encounter") }),
      damage: damage(["holy"], "both", { until: "encounter" })
    },
    // *You begin every fight holding 2 Zeal per rank* (the class talent audit, D-1874; it
    // kept the Zeal out of combat and began at 3 from rank 2). INLINE: the fight's start
    // reads the rank by name (`momentum.mjs#fightStart`), and the fight's end drains Zeal
    // as it drains every pool.
    "fanaticism": { automated: "inline" },
    // *As a Full Action, spend 10 Zeal. Every enemy within 20 feet takes Holy
    // damage at your Damage Rating, and each makes a Spirit Resilience Test
    // against your Spell DC or is blinded until your next turn* (D-772): the
    // damage is the main-hand weapon's Rating (`weapon`, MY READING, for the
    // lead), and Blinded is a button per target, until the paladin's turn starts.
    // The B6 fix (the lead: *"Measure the area"*, *"Land automatically"*): every enemy
    // within 20 feet gathered, the Holy on each whatever its Test comes to, and the
    // Blinded the Test's alone - laid at once on a failure (`onFail`).
    "wrath-of-the-light": { grants: grant({ action: "full", cost: cost("zeal", 10), resist: "spirit", area: "A 20 ft radius centered on you", who: "enemy", damage: { amount: "weapon", type: "holy" }, inflicts: [{ condition: "blinded", value: null, until: "casterTurnStart", onFail: true }] }) },
    // ---- Benediction (reworked by the class talent audit after Uther, A8; D-1875) ----
    // *As a Half-Action, spend 4 Zeal. A friendly target within 30 feet that you can see
    // recovers Health equal to twice your tier. At rank 2 add your Charisma modifier*: a
    // granted feature whose card heals the one friendly creature named (Blessing's
    // `friendly` judgement), its reach the Use's own 30 feet off the text.
    "mending-word": {
      grants: grant({ action: "half", cost: cost("zeal", 4), heal: "2*tier", atRank: [{ rank: 2, heal: "2*tier+cha" }] }),
      onUse: { friendly: true }
    },
    // *Your Holy spells and your Lay on Hands class feature restore 1 more Health per rank,
    // to no more than your tier*: the `heal` kind at the one healing door, reached by a
    // Holy spell or Lay on Hands alone (`healBonusFor`'s `schools` and `features`).
    "healing-hands": { heal: { add: "min(rank,tier)", via: ["spell", "feature"], schools: ["holy"], features: ["Lay on Hands"] } },
    // *When Mending Word restores Health, one other friendly target within 10 feet of its
    // target recovers half as much, rounded down*: the healing door passes it on
    // (`effects/audit-martial.mjs#martialAfterHeal`).
    "twofold-light": { martial: { kind: "twofold" } },
    // *As a Half-Action, spend 2 Mana. A friendly target you can see gains a Boon on every
    // Test it makes until the start of your next turn. At rank 2 choose two targets*: a
    // lasting Boon spanned to the Paladin's next turn, on one creature or two.
    "blessing": { grants: grant({ action: "half", cost: cost("mana", 2) }), onUse: { laysBoon: { kinds: "all", boons: 1, until: "userTurnStart", atRank: [{ rank: 2, targets: 2 }] }, friendly: true } },
    // *You may use your Lay on Hands class feature one more time per Long
    // Rest* (D-752): the feature's own count goes to two.
    "open-hand": { modifies: mod("Lay on Hands", { uses: { max: 2 } }) },
    // *You know Cleanse. At rank 2 it ends two effects rather than one.* The
    // spell is taught; ending an effect is the table's (nothing ends one off the
    // card), so the rank's change rides the card's note. A talent's spell casts
    // whatever the caster's tier (the lead, 2026-11-23).
    "cleanse": { spell: { names: ["Cleanse"], learn: true } },
    // *When a Casting Test of yours reaches SL 2 or better, 1 Mana per rank
    // returns to you* (D-772): a spell's and a casting feature's.
    "illumination": { manaBack: { sl: 2, amount: "rank" } },
    // *When a Holy spell of yours restores Health to a friendly target, gain 1 Zeal, to no
    // more than your rank each round*: the healing door, its ceiling the round's counted
    // marks (`effects/audit-martial.mjs#martialAfterHeal`).
    "fervor": { automated: "inline", martial: { kind: "fervor" } },
    // Approved 2026-10-29: four Death Steps at either rank. The injury application
    // coordinator offers the original injury at 30/60 feet before applying it,
    // pays Reaction + 4 Mana, and guards the card against repeat application.
    "sacrifice": {
      grants: grant({ action: "reaction", cost: cost("mana", 4) })
    },
    // *A friendly target within 30 feet who would drop to 0 Health stays at 1
    // instead. You may use this a number of times equal to your rank per Long
    // Rest* (D-777; the lead: *"Yes."*): the damage door ASKS the Paladin as the
    // blow would drop a friendly target in reach to 0, and a yes strikes a use of
    // the counter and holds it at 1 (`effects/blow-doors.mjs#holdBlow`).
    "intervention": { grants: counter("rank", "long"), holds: { kind: "intervention", feet: 30 } },
    // *Once a round, and once per encounter per rank, you may cast a Holy spell that
    // restores Health as a Half-Action when it would cost an action* (the class talent
    // audit's R7, D-1875; a different talent under the same identifier): Nature's
    // Swiftness's door (`castAsFor`), once a round on the round's record and counted on
    // the encounter counter the talent grants.
    "divine-favor": {
      grants: counter("rank", "encounter"),
      castAs: { action: "half", from: "action", healing: true, schools: ["holy"], perRound: 1, counted: true }
    },
    // *Your Lay on Hands restores all of the target's Health and ends one condition on it
    // of your choice. Each Short Rest returns one use of it* (the audit's R2 capstone,
    // D-1875): a patch on Lay on Hands - the full heal (`FULL_HEAL`), the condition its
    // Use ends through the one chooser (`ends`, `effects/audit-martial.mjs`), and one use
    // back at each Short Rest (`refill`, `uses.mjs#refillAfter`).
    "mercy-of-uther": { modifies: mod("Lay on Hands", { heal: FULL_HEAL, ends: 1, refill: "short" }) },
    // ---- Aegis ----
    "shield-of-faith": { passive: passive([add("system.defense", "rank")], "shield") },
    // *Your Aura of Resolve class feature reaches 10 feet further per rank*
    // (D-755): 30 at rank 1, 40 at rank 2.
    "wide-aura": { modifies: mod("Aura of Resolve", { auraReach: "10*rank" }) },
    // *Your Block reduces 1 more damage per rank, to no more than your tier* (D-772; R1,
    // D-1874).
    "redoubt": { block: { add: "min(rank,tier)" } },
    // *You know Consecration. Your Consecration is also Difficult ground to an
    // enemy that is undead or fel. At rank 2 its radius is 10 feet wider.*
    // (D-753, D-756).
    "consecrated-ground": { spell: { names: ["Consecration"], learn: true, ground: { difficult: ["undead", "fel"], who: "enemy" }, atRank: [{ rank: 2, widen: 10 }] } },
    "ardent-defender": { modifies: mod("Shield of the Righteous", { cost: { delta: "-2*rank" } }) },
    // *Whenever you Block, the attacker takes Holy damage equal to your rank*
    // (D-772): the Block's message carries the blow back at the attacker.
    "holy-shield": { blockRetort: { amount: "rank", type: "holy" } },
    // *Name a school at each Long Rest. You gain Ward 1 per rank against it*
    // (D-772): the Use once a Long Rest names it.
    "blessed-plate": { grants: grant({ action: null, uses: once("long"), choice: "schools" }), onUse: { plate: true }, plate: { ward: "rank" } },
    // *Your Shield of the Righteous class feature reaches 20 feet rather than 5*
    // (D-777): the redirect the damage door asks is measured at the patch's reach
    // (`class-talents.mjs#righteousReach`).
    "guardian-of-the-weak": { modifies: mod("Shield of the Righteous", { reach: 20 }) },
    // *Your Speed cannot be reduced, and you are immune to the Prone condition*
    // (D-772): both derived on the character - every drop the Speed parts and
    // the `final` phase carry (a suit, a load, Slowed, an injury, an area).
    // **AND A CONDITION THAT SETS THE SPEED TO 0 IS PREVENTED** (D-779; the lead,
    // 2026-10-03, on O-175: *"It prevents that condition."*): refused at
    // `toggleStatusEffect`, as an immunity is. A1 sets the Speed to 0 in two
    // conditions, Entangled (*Your Speed is 0*) and Prone (*Your Speed is 0 until
    // you Stand*), and the talent names Prone already (`SPEED_ZERO_CONDITIONS`).
    "unyielding": { steadfast: { immune: ["prone"], speedZero: true, speedFloor: true } },
    "reckoning": { automated: "inline" },
    // *While a friendly target is within 5 feet of you, your Armor Points rise by
    // 1 per rank* (D-772): an aura on the Paladin alone while another ally stands
    // within 5 feet (MY READING, for the lead), laid by the aura door.
    "sacred-duty": { aura: aura({ feet: 5, holderOnly: true, armor: "rank" }) },
    // *While you carry a shield, friendly targets within 15 feet gain your
    // Armor Points against Shadow and Fel damage* (D-755; the lead's reading).
    "avenging-bulwark": { aura: aura({ feet: 15, gate: "shield", schoolArmor: { schools: ["shadow", "fel"], from: "bodyAP" } }) }
  },
  // **THE RANGER'S THIRTY-SIX** (D-773, the talent plan's Phase 6): every talent
  // built or carrying its reason, each kind read by the one door
  // `rules/class-talents.mjs` names; `ranger-talents.test.mjs` holds every number
  // to 04's own Effect cell.
  ranger: {
    // ---- Marksmanship ----
    // *Spending a Half-Action on Steady returns 1 Focus per rank* (D-773). MY
    // READING, for the lead: 05's Steady is a line on the roll dialog and nothing
    // spends its Half-Action (O-100), so an attack rolled with that line ticked
    // IS the Half-Action spent on Steady.
    "steady-aim": { steady: { pool: "focus", amount: "rank" } },
    // *Your weapon's maximum Range increases by 25% per rank, rounded up* (D-773):
    // 06 §5's *twice that distance* grows (MY READING); the Range does not.
    "longshot": { range: { percent: "25*rank" } },
    // *Your ranged attacks ignore the Bane for being Engaged. At rank 2 they
    // ignore the Bane from a target behind cover* (D-773): the dialog's two lines
    // are never raised on a ranged attack.
    "careful-shot": { cancels: { ranged: ["engagedRanged"], atRank: [{ rank: 2, ranged: ["engagedRanged", "coverLight"] }] } },
    // *As part of an attack, spend 3 Focus. The attack gains Pierce equal to your
    // rank* (D-773): a rider, its Pierce on the blow's own.
    "piercing-shot": { rider: rider("focus", 3, { onHit: { pierce: "rank" } }) },
    // *Your attacks against your marked target add 1 to their damage per rank* (the class
    // talent audit, D-1876; it lifted the Quarry cap): a damage line gated on the target
    // being the Ranger's Quarry (`talent-gates.mjs`' `quarried` fact, D-1868).
    "hunters-mark": { damage: damage(["all"], "attack", { when: { quarried: true } }) },
    // *As a Half-Action, spend 4 Focus to attack up to four targets within a 10-foot
    // radius. Roll each attack separately* (D-773; the audit's R5, D-1876): the Use refuses
    // a fifth target before anything is paid, and the card's Attack button costs nothing
    // more - the Half-Action paid for every attack, counted as one Attack (R6).
    "barrage": {
      grants: grant({ action: "half", cost: cost("focus", 4), attack: true, area: "A 10 ft radius on the ground" }),
      barrage: { grant: "barrage", targets: 4 }
    },
    // *Once a round, when an attack reaches SL 2, 2 Focus per rank returns to you*
    // (D-773): a further gain into the Focus pool, the round's record its clock.
    "aimed-volley": { momentum: { pool: "focus", amount: "2*rank", sl: 2, form: false, once: "round" } },
    // *As part of an attack, spend 2 Focus. On a hit the target's Speed is reduced
    // by half, rounded down, until your next turn. At rank 2 it also loses its
    // Reaction* (D-773): A1's Slowed is *Your Speed is halved* (MY READING), laid
    // until the start of the STRIKER's next turn.
    "concussive-shot": { rider: rider("focus", 2, { onHit: { condition: "slowed", until: "strikerTurnStart" }, atRank: [{ rank: 2, onHit: { loseReaction: true } }] }) },
    // *Your Barrage may attack up to six targets within a 15-foot radius. If more
    // than four targets are chosen, 2 Focus returns to you* (D-773).
    "chimaera-shot": { barrage: { grant: "barrage", targets: 6, widen: 5, refund: { pool: "focus", amount: 2, over: 4 } } },
    // *As part of an attack, spend 5 Focus. The attack hits without a roll and
    // counts as SL 2, or SL 3 at rank 2* (D-773).
    "trueshot": { rider: rider("focus", 5, { onHit: { forced: 2 }, atRank: [{ rank: 2, onHit: { forced: 3 } }] }) },
    // *Once per encounter, as an action, make three attacks against one target per rank*
    // (the audit's R5, D-1876). The Use pays the action; each attack is the card's Attack
    // button, which costs nothing more (D-773).
    "rapid-fire": {
      // *three attacks against one target per rank*: at most three a rank, the larger of
      // the two readings (the architect's review of D-773).
      grants: grant({ action: "action", uses: once("encounter"), attack: true, attacks: "3*rank" }),
      reason: "the attacks are the card's Attack button, each costing nothing more: how many of the rank's fours the table presses, and at which targets, is the table's count"
    },
    // *While your Quarry is full, you inflict a Critical Injury on 17 to 20* (D-773).
    "deadeye": { critical: { on: 17, while: { pool: "quarry", full: true } } },
    // ---- Beast Mastery ----
    // The bond's talents (D-643): `rules/bound.mjs` reads all four BY IDENTIFIER
    // - Bonded's third of the Ranger's Health a rank, Hardy Companion's Armor
    // Point a rank, Master of Wilds' Dragonkin and the band one tier up, Second
    // Beast's second bond - and none had a row, so the census could not see the
    // code that applies them (D-768).
    "bonded": { automated: "inline" },
    "sic-em": { grants: grant({ action: "reaction", cost: cost("focus", 2), bound: bound("companion", "attack") }) },
    "hardy-companion": { automated: "inline" },
    // *You and your companion always count as flanking a target you are both
    // Engaged with. At rank 2 any friendly target counts as flanking alongside your
    // companion* (D-773): 06 §5's Boon, ticked where the door measured both.
    "pack-tactics": { flank: { companion: true, any: false, atRank: [{ rank: 2, any: true }] } },
    // *When your companion's attack reaches SL 2, the target gains Bleeding equal
    // to your rank, to no more than your tier* (D-773; R1 and R8, D-1876): off the
    // owner's talents, landing as Deep Cut's does, at the owner's tier.
    "ferocious-bite": { hitLays: { sl: 2, condition: "bleeding", value: "min(rank,tier)", via: "companion" } },
    // *As a Half-Action, spend 3 Focus. Your companion recovers Health equal to
    // your tier per rank* (D-773): the companion heals, never the Ranger - the
    // card's heal used to fall back on the speaker.
    "mend-pet": { grants: grant({ action: "half", cost: cost("focus", 3), heal: "tier*rank", bound: bound("companion", "heal") }) },
    // *Your companion's attacks add 2 damage per rank until the encounter
    // ends.* The number lands on the BOUND creature's own `system.damageBonus`
    // through `boundEffects` (D-643), never on the Ranger's roll.
    "bestial-wrath": {
      grants: grant({ action: "half", cost: cost("focus", 4), bound: bound("companion", "buff") }),
      damage: { amount: "2*rank", types: ["all"], applies: "attack", when: null, via: "bound" }
    },
    // *Your companion may spend your Quarry as you can. At rank 2 its hits build
    // Quarry for you as well.* Rank 2 is built (D-773): a companion's hit on the
    // Ranger's mark builds the Ranger's Quarry. **Rank 1** (D-779; the lead,
    // 2026-10-03, on O-177: *"Maneuvers or other quarry costing features"*): a
    // companion whose own Momentum cannot pay the price pays 06 §7's maneuvers - a
    // maneuver's Use and the called shot's Momentum - from the Ranger's Quarry
    // (`class-answers.mjs#momentumPayer`; every creature holds the tool's Momentum
    // floor, so the price is what hands the Quarry over).
    "shared-quarry": {
      quarry: { companionHits: false, companionSpends: true, atRank: [{ rank: 2, companionHits: true }] }
    },
    "second-beast": { automated: "inline" },
    // *When your companion hits, the target makes a Spirit Resilience Test against
    // your Spell DC or takes a Bane for one round per rank* (D-773): a Test button
    // on the companion's card; MY READING, an unqualified Bane is on every Test.
    "intimidation": { hitTest: { resilience: "spirit", bane: { kind: "all", banes: 1, rounds: "rank" }, via: "companion" } },
    // *Once a round per rank, when an attack your companion made reduces a target
    // to 0 Health, it may attack again immediately* (D-773): an offer card from the
    // one damage door, the companion's attack at no budget.
    "beast-frenzy": { kill: { strike: { who: "companion", count: "rank", target: "any" } } },
    "master-of-wilds": { automated: "inline" },
    // ---- Survival ----
    "trapper": { modifies: mod("Snare", { action: null }) },
    "track": none("following a trail of an age and never becoming lost in a natural landscape are the terms of a Survival Test the table sets (D2 §12): no door rolls for a trail"),
    // *As part of a melee attack, spend 2 Focus. On a hit the target's Speed drops 10
    // feet per rank until your next turn* (D-773; the audit, D-1876: melee alone): an
    // effect on the target's Speed until the start of the STRIKER's next turn.
    "wing-clip": { rider: rider("focus", 2, { weapon: "melee", onHit: { speedDrop: "10*rank", until: "strikerTurnStart" } }) },
    "camouflage": none("Stealth's cover, terrain and pace are the table's: the Hide door (D-717) asks none of them, so there is nothing for the talent to waive"),
    // *As a Reaction when an attack targets you, spend 3 Focus. Attacks against you
    // take a Bane per rank until the start of your next turn* (D-773).
    "deterrence": { grants: grant({ action: "reaction", cost: cost("focus", 3) }), onUse: { deters: { banes: "rank", until: "userTurnStart" } } },
    // *Your Snare class feature also applies a poison you carry to the first
    // creature caught. At rank 2 it applies to everything in the radius* (D-779;
    // the lead, 2026-10-03, on O-178: *"Yes, Dexterity"*): the Snare's Use names a
    // tick poison the Ranger carries, and its card offers each creature caught a
    // Reflex Test at the poison's DC, its failure laying the poison's ticks.
    "snake-trap": {
      modifies: mod("Snare", { poison: { resilience: "reflex", reach: "first" }, atRank: [{ rank: 2, poison: { resilience: "reflex", reach: "all" } }] }),
      reason: "one chosen poison dose is spent per trap at either rank; automatic Snare Region triggering, geometric poison eligibility and one placement per card are implemented; interrupted-delivery recovery and remaining boundary acceptance remain under remediation"
    },
    // *Each makes a Reflex Resilience Test against your Spell DC for half, rounded down*
    // (the lead: *"Build it everywhere"*): the half a passed Test leaves (`half`).
    "explosive-trap": { modifies: mod("Snare", { damage: { amount: "3*rank", type: "fire", half: true }, resist: "reflex" }) },
    // *You may apply a poison you carry without spending an action. At rank 2 the
    // poison needs no Test to take hold* (D-773).
    "coated-blades": { coating: { free: true, atRank: [{ rank: 2, noTest: true }] } },
    // *A creature that frees itself from your Snare class feature takes 5 damage as
    // it pulls clear* (D-773): the Snare card's escape Test, on a pass.
    "entrapment": { modifies: mod("Snare", { escape: { damage: 5 } }) },
    "feign-death": {
      grants: grant({ action: "half", uses: once("short") }),
      reason: "being treated as dead, how convincing it is and for how long are the table's (D2 §12): the Use pays the Half-Action and counts the rest's use"
    },
    // *Once per Short Rest per rank, as no action, refill your Focus* (the class talent
    // audit, D-1876): a Use of no action whose counter is the rank a Short Rest, refilling
    // the Focus through the one pool queue (`effects/audit-martial.mjs#landMartialUse`).
    "readiness": { grants: grant({ action: null, uses: uses("rank", "short") }), onUse: { martial: "readiness" } },
    // *Any number of friendly targets within 30 feet of you ignore movement penalties from
    // non-magical sources and leave no trail for a day. Your Snare Entangles every creature
    // that enters its radius, not only the first, and you may keep twice as many Snares set*
    // (the audit, D-1876). **The first sentence is always on** (D-779; the lead, 2026-10-03,
    // on O-179: *"Always on"*): every ally within 30 feet of the Ranger, the Ranger included,
    // pays a foot a foot on Difficult ground no spell, enchanted item or class feature laid,
    // and on a climb or a swim (`canvas/behaviors.mjs`, `class-answers.mjs#landwise`). The
    // Snare's patch catches every creature (`catches: "all"`) and doubles the standing count
    // (`snares: 2`), both read by the Snare's own door (`effects/audit-martial.mjs`).
    "master-of-the-land": {
      modifies: mod("Snare", { catches: "all", snares: 2 }),
      landwise: { feet: 30 },
      reason: "*leave no trail* is the table's (a Survival Test's terms, D2 §12), and a Speed reduction - a condition, a load - is no terrain"
    },
    // ---- Dark Ranger (Forsaken; the Legacy branches, D-781) ----
    // **THE LEGACY BRANCHES' ROWS** (the plan's phase B6): every one rides a door
    // phases B1 to B3 built, named beside it; `ranger-talents.test.mjs` holds each
    // number to 04's own Effect cell at every rank. The Dark Ranger's Spell DC is
    // Wisdom's (the lead, phase 0), the Ranger class item's `castingAbility`.
    // *Once a round, when a ranged attack of yours reaches SL 2, the target makes a Spirit
    // Resilience Test against your Spell DC or is Frightened of you for one round per
    // rank* (door 26): the Test's button on the attack's card, its failure laying
    // Frightened for the rounds, the round's once marked before it is offered.
    "keening-arrows": { hitTest: { via: "self", resilience: "spirit", condition: "frightened", rounds: "rank", sl: 2, once: "round", weapon: "ranged" } },
    // *Your Companion class feature may bond a Mindless Undead that is not a Boss. Spend
    // the hour over its remains rather than with food. In place of the Handling Test, it
    // makes a Spirit Resilience Test against your Spell DC, and on a failure it is bound to
    // you* (the lead, phase 0: *"Use wisdom based formula"*, *"The undead resists your
    // Spell DC"*, *"No cap"*): the Companion's chooser opens to them and rolls their Test
    // at the pick (door 26).
    "grave-bond": {
      graveBond: { resist: "spirit" },
      reason: "the hour spent over the remains rather than with food is the table's, as the Companion's own hour is (D2 §12)"
    },
    // *You know Shadow Ward and Shadow Walk. Cast them with Wisdom, paying Focus where
    // 07-MAGIC asks for Mana. Shadow Walk counts as moving for your Focus. At rank 2 your
    // Shadow spells cost 1 Focus less* (the lead, phase 0: *"Yes"*, Shadow Walk counts as
    // moving): the two spells taught, paid and cast as door 8 reads them, the move door 9
    // reads, and from rank 2 a Focus off every Shadow spell paid in Focus.
    "shadowcraft": {
      spell: { names: ["Shadow Ward", "Shadow Walk"], learn: true, pool: "focus", ability: "wis", moves: ["Shadow Walk"] },
      spellCost: { schools: ["shadow"], less: 1, minRank: 2, pool: "focus" }
    },
    // *As part of a ranged attack, spend 2 Focus. The attack spends no ammunition. On a hit
    // the target takes Shadow damage equal to your rank and recovers no Health until the end
    // of your next turn*: a rider spending no shot (door 26), its Shadow a second amount on
    // the blow met by its own Ward (D-777), and Mortal Strike's mark - which Dark Minion's
    // raise reads by this talent's name.
    "black-arrow": { rider: rider("focus", 2, { weapon: "ranged", ammo: false, onHit: { damage: "rank", type: "shadow", noHealing: "strikerTurnEnd" } }) },
    // *You need no sleep and cannot be Frightened. You may speak with a creature that died
    // within the hour, and it answers as it was*: Frightened refused at the condition door.
    "cold-company": {
      steadfast: { immune: ["frightened"] },
      reason: "needing no sleep, and speaking with a creature that died within the hour, are the table's (D2 §12): no door counts sleep, and the dead's answers are the GM's to give"
    },
    // *You know Dark Passage, cast as Shadowcraft casts*: taught, paid in Focus and cast
    // with Wisdom; Shadowcraft's rank 2 reaches it as the Shadow spell it is.
    "embrace-the-shadows": { spell: { names: ["Dark Passage"], learn: true, pool: "focus", ability: "wis" } },
    // *When a creature hit by your Black Arrow drops to 0 Health before the end of your next
    // turn, it rises as a Risen Skeleton that acts on your Initiative until the encounter
    // ends. You may control one per rank* (door 5): off Black Arrow's own mark.
    "dark-minion": { raise: { from: "black-arrow", entry: "Risen Skeleton", until: "encounter", count: "rank" } },
    // *As a Half-Action, spend 2 Quarry. Every enemy within 20 feet that can hear you makes a
    // Spirit Resilience Test against your Spell DC or is Frightened of you for one minute. You
    // may use this a number of times equal to your rank per Short Rest*: every enemy within
    // 20 feet gathered (`who`), and the Frightened laid at once on each that fails (`onFail`).
    "banshees-wail": {
      grants: grant({
        action: "half", cost: cost("quarry", 2), uses: uses("rank", "short"), area: "A 20 ft radius centered on you", who: "enemy", resist: "spirit",
        inflicts: [{ condition: "frightened", value: null, until: "minute", onFail: true }]
      }),
      reason: "whether each enemy can hear the wail is the table's (D2 §12)"
    },
    // *Your attacks against a Frightened creature gain a Boon and deal 1 more damage per
    // rank*: a Boon and a damage line, both gated on the target's own condition (door 17).
    "dread": {
      targetBoon: { kind: "attack", boons: 1, when: { targetHas: ["frightened"] } },
      damage: damage(["all"], "attack", { when: { targetHas: ["frightened"] } })
    },
    // *As a Half-Action, spend 4 Focus. Every enemy within 15 feet of a point within 60 feet
    // makes a Spirit Resilience Test against your Spell DC or is Silenced until the start of
    // your next turn. You may use this a number of times equal to your rank per Short Rest*:
    // the point picked within 60 feet of the ranger's own token (`aimFrom`, Cluster
    // Rockets' door aimed from the user), every enemy within 15 feet of it gathered
    // (`who`), and the Silenced laid at once on each that fails (`onFail`), keyed on the
    // ranger's own turn.
    "hush-of-the-grave": {
      grants: grant({
        action: "half", cost: cost("focus", 4), uses: uses("rank", "short"), area: "A 15 ft radius on the ground", who: "enemy", resist: "spirit",
        inflicts: [{ condition: "silenced", value: null, until: "casterTurnStart", onFail: true }]
      }),
      onUse: { aimFrom: { kind: "self", feet: 60 } }
    },
    // *As a Half-Action, spend 3 Quarry. A creature within 60 feet makes a Body Resilience
    // Test against your Spell DC, taking Shadow damage equal to twice your tier plus your
    // rank on a failure and half that, rounded down, on a success. You recover Health equal
    // to the damage it takes* (door 25's `healsDealt`): one creature named within 60 feet,
    // and the half its passed Test leaves landed by the card's own Apply (`half`; the lead:
    // *"Build it everywhere"*) - so the drain heals what the half took.
    "life-drain": {
      grants: grant({ action: "half", cost: cost("quarry", 3), resist: "body", damage: { amount: "2*tier+rank", type: "shadow", half: true } }),
      onUse: { healsDealt: true, aim: { feet: 60 } }
    },
    // *Once per Long Rest, as a Full Action, spend 4 Focus. A creature within 30 feet that is
    // not a Boss makes a Spirit Resilience Test against your Spell DC or is Charmed by you for
    // one minute, obeys your spoken commands and acts on your Initiative. It remembers all of
    // it* (the lead: *"Have the creature stat block for the token set to bound to the player
    // by GM who can then remove it"*): the named creature's failed Resist lays the Charmed
    // and D-643's bond on its own token (door 25, D-784).
    "thrall-of-the-banshee": {
      grants: grant({ action: "full", cost: cost("focus", 4), uses: once("long"), resist: "spirit" }),
      onUse: { thrall: { feet: 30, minutes: 1 } },
      reason: "obeying spoken commands is the GM's to play, and what the thrall remembers is the table's (D2 §12)"
    }
  },
  // **THE ROGUE'S THIRTY-SIX** (D-773, the talent plan's Phase 7).
  rogue: {
    // ---- Assassination ----
    // *Your Opening class feature applies against any target that has not seen
    // you, whether or not it has acted. At rank 2 that attack builds 1 Combo Point
    // without spending Energy* (D-773): MY READING, an attack made while hidden is
    // one no target has seen; the free point lands on the hit, in place of the
    // Opening's paid trade.
    "cheap-shot": { modifies: mod("Opening", { unseen: true, atRank: [{ rank: 2, freeCombo: 1 }] }) },
    // *A poison you apply that deals damage deals 1 more damage per rank, to no more
    // than your tier* (the class talent audit's R1, D-1880): the rank, capped at the
    // tier (`consumables.mjs#envenomFor`), rides the coating flag (08 §12, D-719) and
    // `coatingFired` carries it onto the blow the poison lands on, so it is applied by
    // name in the code.
    "envenom": { automated: "inline" },
    // *A poison you apply uses your Spell DC in place of its own when yours is higher*
    // (the audit's adopted method, D-1880): the higher of the two DCs stamped on the
    // coating as it is laid (`consumables.mjs#poisonDcFor`), read by name in the code.
    // The free application is 02's Poisoner's now, not this talent's.
    "deft-hands": { automated: "inline" },
    // *A target already suffering one of your poisons takes a Bane per rank on
    // Resilience Tests against your poisons* (D-773).
    "vile-concoction": { poisonTest: { banes: "rank" } },
    // *As part of an attack against a target affected by your Opening class
    // feature, spend 2 Energy. On a hit the target gains Bleeding equal to your
    // rank and cannot cast while that Bleeding lasts* (D-773): a rider now - it was
    // a Use button that paid onto a card of its own (the Finisher's fault).
    "garrote": { rider: rider("energy", 2, { needs: "opening", onHit: { condition: "bleeding", value: "rank", noCasting: true } }) },
    // *When your Finisher class feature reaches SL 2, 1 Combo Point per rank
    // returns to you* (D-773).
    "ruthlessness": { modifies: mod("Finisher", { back: { sl: 2, amount: "rank" } }) },
    // *When you inflict a Critical Injury, gain 1 Combo Point per rank* (D-773): MY
    // READING, the attack's own Critical Injury.
    "seal-fate": { momentum: { pool: "comboPoints", amount: "rank", when: "critical" } },
    // *Once per Short Rest, your Opening class feature holds until the end of your
    // next turn* (D-773): MY READING, for the targets it applied to when it was used.
    "overkill": { modifies: mod("Opening", { held: true }), grants: counter(1, "short"), onUse: { holdOpening: { until: "userTurnEnd" } } },
    // *A target that fails a Resilience Test against one of your poisons loses its
    // next Reaction. At rank 2 it is Entangled until it passes a Resilience Test
    // against your poisons* (D-773).
    "paralytic": { poisonFail: { loseReaction: true, atRank: [{ rank: 2, entangle: true }] } },
    // *Your Finisher class feature may lay Bleeding equal to the Combo Points spent
    // instead of adding damage. At rank 2, ending that Bleeding takes a Medicine Test
    // against your Spell DC* (B9, D-1880): the points, and at rank 2 the Rogue's Spell
    // DC stamped on the Bleeding as the DC its source names (A1's *or at the DC the
    // source names*). R8: Rupture is the Bleeding's source.
    "rupture": { modifies: mod("Finisher", { bleeding: "spent", atRank: [{ rank: 2, endsDc: "spellDc" }] }) },
    // *When you deal damage with an attack to a target affected by Bleeding, you
    // build 1 more Combo Point per rank* (D-773).
    "blood-sport": { momentum: { pool: "comboPoints", amount: "rank", when: "bleedingDealt" } },
    // *Once per Short Rest, name a target you can see. Until your next Short or
    // Long Rest, once a round, your Finisher class feature against it costs no Combo
    // Points and counts as having spent five* (B15, D-1880): `perRound` 1, the free
    // Finisher claimed on the round's record when it lands (`DEATH_MARK_ROUND`).
    "death-mark": { modifies: mod("Finisher", { free: true, counts: 5, perRound: 1 }), grants: counter(1, "short"), onUse: { deathMark: true } },
    // ---- Duelling ----
    // *While you have moved at least 10 feet this turn, your Defense rises by 1
    // per rank until your next turn* (D-773).
    "fleet-footed": { moved: { feet: 10, defense: "rank" } },
    // *Your Riposte deals 1 more damage per rank.* 06 §7's Riposte is the blow
    // after a Parry held, and the roller says whether this is one.
    "counterstrike": { damage: damage(["all"], "attack", { when: "riposte" }) },
    // *As a Half-Action, spend 2 Energy. The target's next attack against you takes
    // a Bane per rank* (D-773): a Bane on the one creature targeted, spent by its
    // next attack AGAINST THE ROGUE.
    "feint": { grants: grant({ action: "half", cost: cost("energy", 2) }), onUse: { laysBane: { kind: "attack", banes: "rank", only: "user" } } },
    // *While you hold a melee weapon in each hand, your Parry reduces 1 more damage
    // per rank.* **REWORKED** (D-779; the lead, 2026-10-03, on O-180: *"Main gauge
    // can be reworked to allow 1 parry per turn without spending a reaction."*):
    // with a melee weapon in each hand, one Parry each turn costs no Reaction -
    // Bladeturn's door, counted on the fight's turn (`class-answers.mjs#turnMark`).
    // 04's words are drafted for the lead in `book-edits-2.md` (a).
    "main-gauche": { freeReaction: { reaction: "parry", count: "rank", per: "turn", needs: "dualMelee" }, reworked: "O-180" },
    // *Your Rogue features and talents cost 1 less Energy per rank, to a minimum of 1.
    // Once a round, you may spend 2 Energy to gain 1 Combo Point* (decision 13 and B12,
    // D-1881): a DISCOUNT on what a Rogue feature or talent costs in Energy
    // (`class-talents.mjs#classDiscountFor`, read at `useFeature`'s payment, a rider's
    // price and Elusive's), never a refill - so nothing reaches the Energy pool a
    // Demon Hunter or a Chromatic Champion shares with the Rogue (02 §10, D-1723).
    "adrenaline": {
      classDiscount: { pool: "energy", amount: "rank", className: "Rogue", min: 1 },
      grants: grant({ action: null, cost: cost("energy", 2) }),
      onUse: { gain: { pool: "comboPoints", amount: 1 }, perRound: 1 }
    },
    // *A Parry that reduces an attack's damage to 0 builds 1 Combo Point* (D-773):
    // a Parry that holds, since 06 §6's Parry is all or nothing.
    "perfect-timing": { parry: { gain: { pool: "comboPoints", amount: 1 } } },
    // *You may Parry a ranged attack made within 30 feet, once a round, or twice a
    // round at rank 2* (D-779; the lead, 2026-10-03, on O-180: *"Parry is limited
    // to melee unless a feature allows ranged parry."*): the card offers its holder
    // a Parry of a ranged blow struck within 30 feet, marked on the round's record
    // (`class-answers.mjs#parryReaches`).
    "anticipation": { rangedParry: { feet: 30, count: "rank" } },
    // *Once a round, when your attack or your Riposte reduces a creature to 0 Health,
    // you may move up to 10 feet, provoking nothing, and make one attack against another
    // creature within reach* (the audit, D-1882): any kill of the Rogue's, the round's
    // record its clock (`once: "round"`), a free 10-foot displacement picked before the
    // attack (`step`), and one roll (R6's triggered attack).
    "killing-spree": { kill: { strike: { who: "self", target: "other", count: 1, once: "round", step: 10 } } },
    // *While you are Engaged with exactly one enemy, your attacks against it deal
    // 1 more damage per rank.* Engaged is measured (06, D-669).
    "deadly-poise": { damage: damage(["all"], "attack", { when: "engagedOne" }) },
    // *Once a round per rank, when you hit with an attack, a second enemy within 5
    // feet of the target takes half the damage, rounded down* (D-773).
    "blade-flurry": { blowShare: { share: "half", feet: 5, count: "rank" } },
    // *Once a round, your Riposte costs no Combo Points. At rank 2 it gains a Boon*
    // (the audit, D-1882): 06 §7's Riposte priced at nothing once a round
    // (`maneuvers.mjs#maneuverCost`, the round's record `COMBAT_REFLEXES_ROUND`), and the
    // Riposte's attack an automatic Boon at rank 2 (`riposte` is the attack door's fact).
    "combat-reflexes": { riposteFree: { per: "round" }, targetBoon: { kind: "attack", boons: 0, when: "riposte", atRank: [{ rank: 2, boons: 1 }] } },
    // *While you are Engaged with exactly one enemy, your attacks against it gain a
    // Boon and inflict a Critical Injury on 19 or 20* (D-773).
    "master-duellist": { critical: { on: 19, when: "engagedOne" }, targetBoon: { kind: "attack", boons: 1, when: "engagedOne" } },
    // ---- Subtlety ----
    "silent-tread": none("the roll dialog raises no Bane on a Stealth Test for moving at full Speed or for the ground crossed - both are the table's to judge (D2 §12) - so there is nothing for the talent to take off"),
    // *Once a round, an attack made while hidden builds 1 more Combo Point per
    // rank* (D-773).
    "shadow-focus": { momentum: { pool: "comboPoints", amount: "rank", when: "hidden", once: "round" } },
    // *A target you attack while hidden cannot use a Reaction until its next turn.
    // At rank 2 that attack builds 1 further Combo Point* (D-773).
    "waylay": { hidden: { loseReaction: true }, momentum: { pool: "comboPoints", amount: 0, when: "hidden", atRank: [{ rank: 2, amount: 1 }] } },
    // *As a Reaction, spend 3 Energy. You gain Ward 1 per rank against one school
    // until your next turn* (D-773): the school asked at the Use.
    "cloak-of-shadows": { grants: grant({ action: "reaction", cost: cost("energy", 3), choice: "schools" }), onUse: { ward: { amount: "rank", until: "userTurnStart" } } },
    // *When an attack against you misses or deals no damage, you may spend 2 Energy
    // and move 5 feet per rank as though you had Disengaged* (D-773).
    "elusive": { evade: { cost: { pool: "energy", amount: 2 }, feet: "5*rank" } },
    // *When Initiative is determined, you may make a Stealth Test, opposed by
    // Perception. On a success you gain 1 Combo Point per rank* (D-773): a Use once
    // a fight, its Test 05 §5's Opposed DC (Hide's own reading, D-717).
    "preparation": { grants: grant({ action: null, uses: once("encounter") }), onUse: { skillTest: { skill: "stealth", dc: "opposed", gain: { pool: "comboPoints", amount: "rank" } } } },
    // *As a Half-Action, spend 4 Energy to count as hidden until the end of your
    // next turn even while observed* (D-773).
    "shadow-dance": { grants: grant({ action: "half", cost: cost("energy", 4), uses: uses("rank", "short") }), onUse: { hide: { until: "userTurnEnd" } } },
    // *Your attacks while hidden ignore 1 Armor Point per rank* (the audit, D-1882).
    "find-weakness": { hidden: { pierce: "rank" } },
    // *An attack you make while hidden cannot be Parried or Blocked* (D-773).
    "ghostly-strike": { unanswerable: "hidden" },
    "smoke-bomb": {
      grants: grant({ action: "half", uses: uses("rank", "short"), area: "A 15 ft radius on the ground" }),
      reason: "who sees through the obscured area is vision, the table's (D2 §12): the Use places the area and counts the rest's uses"
    },
    // *A target you attack while hidden is treated as being under your Opening
    // class feature, for a number of rounds equal to your rank* (D-773).
    "subterfuge": { modifies: mod("Opening", { marks: "rank" }) },
    // *Once per Short Rest, as a Half-Action, for one minute taking actions while hidden
    // does not make you visible. Taking damage does* (B10, D-1882): the Use lays a
    // minute's state (`SHADOWS_FLAG`); while it stands the attack and the cast leave the
    // Hide standing (`effects/stealth.mjs#reveal`), and a blow that deals damage ends the
    // state and the Hide (`effects/after-blow.mjs`).
    "master-of-shadows": { grants: grant({ action: "half", uses: once("short") }), onUse: { shadows: { minutes: 1 } } },
    // ---- Warden (the Night Elf's Legacy; D-781, the Legacy branches' phase B6) ----
    // *You may wear studded and mail armor. At rank 2 the Encumbering trait does not
    // reduce your Speed* (door 23): the categories added to the class's own Access,
    // which `creation.mjs#accessNote` reads, and Encumbering's 5 feet given back in
    // the Speed's parts (`class-talents.mjs#armorAccessFor`).
    "wardens-mail": { armorAccess: { categories: ["studded", "mail"], atRank: [{ rank: 2, waivesEncumbering: true }] } },
    // *As a Half-Action, spend 3 Energy and set a trap at a point within 30 feet. The
    // first enemy to come within 5 feet of it is Entangled until it spends an action
    // and passes a Reflex Resilience Test against your Spell DC. One may stand at a
    // time, or two at rank 2* (door 26): the point picked before anything is paid, the
    // trap a Region the first enemy springs (`rules/traps.mjs`), its Entangled carrying
    // the escape at the Rogue's Spell DC (Intelligence, D-781).
    "shadow-trap": {
      grants: grant({ action: "half", cost: cost("energy", 3) }),
      onUse: { trap: { within: 30, radius: 5, condition: "entangled", escape: { on: "action", resilience: "reflex", dc: "spellDc" }, standing: 1, atRank: [{ rank: 2, standing: 2 }] } }
    },
    // *Once a round, a hit against a target that is Slowed, Entangled or Stunned builds
    // 1 more Combo Point per rank* (door 17): a further gain on the hit, gated on the
    // target's conditions (`talent-gates.mjs#gateHolds`), the round's record its clock
    // (`momentumOnHitFor`).
    "run-to-ground": { momentum: { pool: "comboPoints", amount: "rank", once: "round", when: { targetHas: ["slowed", "entangled", "stunned"] } } },
    // *As an action, spend 4 Energy to attack up to two enemies within 10 feet of you,
    // or three at rank 2. Roll each attack separately. At rank 2 each attack gains a
    // Boon* (door 26): Barrage's shape - the Use refuses a third target (a fourth at
    // rank 2) and one past 10 feet of the Rogue before anything is paid (`within`), the
    // card's Attack makes one attack a creature named, and at rank 2 each draws its Boon
    // as a ticked line (`cardBoons`).
    "fan-of-knives": {
      grants: grant({ action: "action", cost: cost("energy", 4), attack: true }),
      barrage: { grant: "fan-of-knives", targets: 2, within: 10, atRank: [{ rank: 2, targets: 3, boons: 1 }] }
    },
    // *As a Half-Action, spend 3 Energy and make a thrown attack. On a hit the target
    // gains Bleeding equal to your rank and is Slowed until the start of your next
    // turn*: the Half-Action IS the attack (05's Attack), so it is a rider on a THROWN
    // blow's own dialog (D-770; B1's `weapon: "thrown"`), counted against the round's
    // one Attack as any attack is. Its Bleeding and its Slowed land with the hit, the
    // Slowed on the striker's clock (`onHit.also`, phase B6's widening of the rider).
    "shadow-strike": { rider: rider("energy", 3, { weapon: "thrown", onHit: { condition: "bleeding", value: "rank", also: [{ condition: "slowed", until: "strikerTurnStart" }] } }) },
    // *As a Reaction, spend 2 Energy. Slowed ends on you, and you cannot be Slowed until
    // your next turn. At rank 2 the same holds for Entangled* (door 25): the conditions
    // ended and refused until the user's next turn (`IMMUNE_FLAG`), and A1's *cannot be
    // X* is read as ending it too (the plan's *As read*).
    "unfettered": {
      grants: grant({ action: "reaction", cost: cost("energy", 2) }),
      onUse: { immunity: { conditions: ["slowed"], ends: true, until: "userTurnStart", atRank: [{ rank: 2, conditions: ["slowed", "entangled"] }] } }
    },
    // *Your Finisher class feature may, instead of adding damage, leave the target of a
    // hit Entangled for one round per Combo Point spent. Ending it takes an action and a
    // Reflex Resilience Test against your Spell DC, with a Bane at rank 2* (door 26): a
    // Finisher mode on the attack's dialog, the patch carrying the escape
    // (`class-talents.mjs#finisherOptionsFor`, `shackleRounds`).
    "shackle": { modifies: mod("Finisher", { shackle: { condition: "entangled", escape: { on: "action", resilience: "reflex", dc: "spellDc", banes: 1, minRank: 2 } } }) },
    // *As a Half-Action, mark one creature you can see. Until your next Long Rest you
    // know its direction and rough distance, it does not know you have done this, and
    // your attacks against it ignore 2 Armor Points. Marking another ends the first*
    // (door 18): the mark on the Rogue's own flag, its card whispered to the owners (the
    // lead: *"Yes"*), a Use with nothing targeted reporting the bearing, and the Pierce
    // on every attack the gate names (`pierceFor`).
    "the-long-watch": { grants: grant({ action: "half" }), onUse: { mark: "watch" }, pierce: { amount: 2, when: { watched: true } } },
    // *As a Reaction when an enemy ends its move within 10 feet of you, spend 4 Energy.
    // Move to a space you can see within 20 feet, or 30 feet at rank 2, provoking
    // nothing. You cannot do this while Entangled* (door 3): the space picked before
    // anything is paid, the token displaced (no Opportunity Attack), refused while
    // Entangled (`rules/steps.mjs#stepOf`).
    "fade-step": {
      grants: grant({ action: "reaction", cost: cost("energy", 4) }),
      onUse: { step: { feet: 20, sight: "see", refuseWhile: ["entangled"], atRank: [{ rank: 2, feet: 30 }] } },
      reason: "*when an enemy ends its move within 10 feet of you* is the Reaction's trigger, judged by the player who presses it (D2 §12): no door records where another creature's move ended"
    },
    // *As a Full Action, every enemy within 20 feet makes a Reflex Resilience Test
    // against your Spell DC. On a failure it is Entangled for one minute, and ending it
    // takes an action and a Reflex Resilience Test against your Spell DC. Usable a number
    // of times equal to your rank between Long Rests* (doors 19 and 26): every enemy within
    // 20 feet gathered (`who`), each one's Resist on the card, and its failure laying the
    // minute's Entangled with its escape at once (`onFail`; *"Land automatically"*).
    "the-vault-opens": {
      grants: grant({
        action: "full", uses: uses("rank", "long"), area: "A 20 ft radius centered on you", who: "enemy", resist: "reflex",
        inflicts: [{ condition: "entangled", until: "minute", escape: { on: "action", resilience: "reflex", dc: "spellDc" }, onFail: true }]
      })
    },
    // *As a Half-Action, spend 4 Energy. A creature within 30 feet makes a Reflex
    // Resilience Test against your Spell DC or is Stunned. It makes a Body Resilience
    // Test against your Spell DC at the end of each of its turns, and a success ends it.
    // Usable a number of times equal to your rank between Short Rests* (door 19): one
    // creature, within 30 feet (`onUse.aim`), its Stun carrying the turn's-end escape and
    // laid at once on its failed Reflex Test (`onFail`; *"Land automatically"*).
    "wardens-cage": {
      grants: grant({
        action: "half", cost: cost("energy", 4), uses: uses("rank", "short"), resist: "reflex",
        inflicts: [{ condition: "stunned", escape: { on: "turnEnd", resilience: "body", dc: "spellDc" }, onFail: true }]
      }),
      onUse: { aim: { feet: 30 } }
    },
    // *Once per Short Rest, as a Half-Action, spend 5 Energy. Every creature within 60
    // feet that you have Entangled is pulled to a space you choose within 10 feet of
    // you, and stays Entangled* (door 24; the lead: *"A space you choose"*): one pick a
    // creature, each a displacement the GM's client judges again.
    "none-escape": { grants: grant({ action: "half", cost: cost("energy", 5), uses: once("short") }), onUse: { pullEntangled: { feet: 60, within: 10 } } },
    // ---- Tinker (the Gnome's Legacy; D-781, the Legacy branches' phase B6) ----
    // *You build constructs from the Constructs table below, one whose tier is no higher
    // than yours. Building one takes a Short Rest and a tinker's kit, and so does
    // rebuilding one wrecked at 0 Health. You hold one at a time. Your constructs act on
    // your Initiative ... and between them take one Half-Action and one Reaction each
    // turn* (door 6): the one chooser over 04's table at the gnome's tier
    // (`rules/constructs.mjs`), the bind (D-643's sixth kind) and its token, the shared
    // turn on the gnome's combatant.
    "the-bench": {
      grants: grant({ action: null, choice: "constructs" }),
      constructs: { holds: 1 },
      reason: "*Building one takes a Short Rest* is the table's clock (D2 §12): the Use is refused in a fight and without a tinker's kit, builds or rebuilds on its pick, and says on its card how long the work takes"
    },
    // Gadgeteer grants 2 + character tier known gadgets. The Bench replaces one during
    // a Long Rest; each has its own Short Rest use. *At rank 2, choose one gadget you
    // know: you may use it twice between Short Rests* (B17, D-1883): the Use asks which
    // at rank 2 (`GADGET_TWICE_FLAG` on the feature) and the sync stamps that gadget two
    // uses (`gadgets.mjs#gadgetFeature`).
    "gadgeteer": {
      grants: grant({ action: null, choice: "gadgets" }),
      gadgets: { known: "2+tier", atRank: [{ rank: 2, twice: 1 }] },
      reason: "During a Long Rest, The Bench lets you replace one known gadget. Initial learning and newly earned slots can be filled outside a fight; replacing a gadget never refreshes a spent use."
    },
    // *Constructs you build with The Bench gain Health equal to three times your tier
    // per rank. At rank 3 they also gain 1 Armor Point* (door 6): laid on each construct
    // through `rules/bound.mjs#boundEffects`.
    "reinforced-plating": { constructs: { health: "3*tier*rank", atRank: [{ rank: 3, ap: 1 }] } },
    // *As a Half-Action, spend 4 Energy. One of your constructs fires at a point within
    // 60 feet of it. Every creature within 10 feet of that point makes a Reflex
    // Resilience Test against your Spell DC, taking Fire damage equal to your tier plus
    // your rank on a failure and half that, rounded down, on a success. Usable a
    // number of times equal to your tier between Short Rests* (door 6): the construct
    // picked, the point picked within its 60 feet (`onUse.aimFrom`), every creature within
    // 10 feet of it gathered - allies and the gnome included (`who`; the lead: *"Measure
    // the area"*) - and the half a passed Test leaves landed by the card's Apply (`half`;
    // *"Build it everywhere"*).
    "cluster-rockets": {
      grants: grant({ action: "half", cost: cost("energy", 4), uses: uses("tier", "short"), resist: "reflex", area: "A 10 ft radius on the ground", who: "creature", damage: { amount: "tier+rank", type: "fire", half: true } }),
      onUse: { aimFrom: { kind: "construct", feet: 60 } }
    },
    // *Your constructs take two Half-Actions each turn between them, rather than one. At
    // rank 2, as a Reaction, spend 2 Energy: one of your constructs within 60 feet takes
    // a Half-Action at once* (door 6): the shared turn's allowance, and the rank's
    // Reaction granting the Half-Action on both budgets.
    "remote-control": {
      constructs: { halfActions: 2 },
      grants: grant({ action: "reaction", cost: cost("energy", 2), minRank: 2 }),
      onUse: { constructHalf: { feet: 60 } }
    },
    // *As a Half-Action, spend 3 Energy. A construct within 30 feet recovers Health equal
    // to your tier per rank, and one condition on it ends ... At rank 2 rebuilding a
    // wrecked construct takes ten minutes rather than a Short Rest* (doors 6 and 25): ONE
    // construct named within 30 feet (`aim.kinds`, the B3 review - without it the cure
    // fell on the gnome), its condition chosen and ended, the card's heal on it; a
    // wrecked one takes no healing (`AzerothActor#applyHealing`).
    "arclight-spanner": {
      grants: grant({ action: "half", cost: cost("energy", 3), heal: "tier*rank" }),
      onUse: { cures: 1, aim: { feet: 30, kinds: ["construct"] } },
      constructs: { atRank: [{ rank: 2, tenMinutes: true }] },
      reason: "*Outside a fight, ten minutes' work repairs a broken weapon or suit of armor, or opens a mechanical lock whose DC is no higher than your Spell DC* is the table's (D2 §12): nothing in the system breaks an item or stands a lock for the work to mend or open"
    },
    // *Your constructs' attacks and your Gnomish Battle Rig's attacks deal 1 more damage
    // per rank, and you know one more gadget per rank* (doors 6 and 7; the lead: *"Yes,
    // the fist too"*): on each construct's own damage bonus, a line on the rig's blow, and
    // the gadgets known.
    "engineering-upgrade": {
      constructs: { damage: "rank" },
      gadgets: { known: "rank" },
      damage: damage(["all"], "attack", { when: "battleRig" })
    },
    // *As an action, spend 4 Energy. Two Clockwork Gnomes, or three at rank 2, assemble
    // in spaces within 30 feet and stay until the encounter ends. They are not
    // constructs you hold, and each takes one Half-Action a turn of its own. Usable a
    // number of times equal to your rank between Short Rests* (door 4): a summon by rank,
    // placed at a point picked within 30 feet, each bound for the encounter with its own
    // Half-Action (`rules/summon-places.mjs`).
    "pocket-factory": {
      grants: grant({ action: "action", cost: cost("energy", 4), uses: uses("rank", "short"), summons: summons(["Clockwork Gnome"], "1+rank") }),
      onUse: { place: { within: 30, halfActions: 1 } }
    },
    // *You may hold two constructs at once. They still share one turn* (door 6).
    "assembly-line": { constructs: { holds: 1 } },
    // *Your Finisher class feature may be spent on an attack one of your constructs
    // makes. At rank 2 your constructs' hits build your Combo Points and keep them from
    // draining* (door 6): `AzerothActor#finisherPayer`, and a construct's hit building
    // the gnome's points and marking the gnome's last hit.
    "supercharge": { constructs: { finisher: true, atRank: [{ rank: 2, buildsCombo: true }] } },
    // *Over a Short Rest, set a transporter pad where you stand; setting another removes
    // the first. Once per Long Rest, as a Full Action, you and up to two willing creatures
    // per rank within 10 feet of you arrive on the pad from anywhere on the same
    // continent. Roll a d6 for each; on a 1 that creature arrives Fatigued* (door 25).
    "ultrasafe-transporter": {
      grants: grant({ action: "full", uses: once("long") }),
      onUse: { transporter: { feet: 10, perRank: 2 } },
      reason: "*from anywhere on the same continent* is the table's (D2 §12), and the card says so: the pad is set over a Short Rest with nothing paid, and the travel is the Full Action and the Long Rest's one use"
    },
    // *Once per Short Rest, as a Full Action, spend 5 Energy and climb into your Gnomish
    // Battle Rig. You take its form in 14-BESTIARY until your next Short Rest or Long
    // Rest, or until you leave it as a Half-Action ... If you are reduced to 0 Health in
    // it, you leave it* (D-769's door; the lead: *"Rename it Gnomish Battle Rig"*): the
    // feature's name is `rules/shapes.mjs#SHAPE_KINDS.battlerig`'s, taken with no menu.
    "gnomish-battle-rig": { grants: grant({ action: "full", cost: cost("energy", 5), uses: once("short") }) }
  },
  // **THE PRIEST'S THIRTY-SIX** (D-774, the talent plan's Phase 8): every talent
  // built or carrying its reason, each kind read by the one door
  // `rules/class-talents.mjs` names; `priest-talents.test.mjs` holds every number
  // to 04's own Effect cell. Eight of them hang on 02's **Ward**, which was a card
  // and nothing more: it is a laid effect now (`effects/wards.mjs`), and the
  // talents ride its `mod("Ward")` patch (D-773's pattern: the patch carries the
  // mechanism and its reader reads the patch).
  priest: {
    // ---- Discipline ----
    // *You know Power Word: Shield. Each rank adds your tier to the temporary Health it
    // grants* (the audit, D-1884): 07's 6 and the rank's tier ride the card, and its
    // Apply grants them with the laid effect (`castSpell`, `applySpellEffectFromCard`).
    "power-word-shield": {
      spell: { names: ["Power Word: Shield"], learn: true },
      tempHealth: { spells: ["Power Word: Shield"], add: "tier*rank" }
    },
    // *A number of times equal to your rank per Short Rest, a spell or feature
    // requiring a Casting Test costs no Mana* (D-774): a line on the Casting
    // Test's own dialog, unticked (MY READING, for the lead: 04 does not say
    // *first*, as Divine Favor does, so the use is the priest's to spend), a use
    // of the counter struck once the cast is paid for.
    "inner-focus": { grants: counter("rank", "short"), castLine: { free: true, casting: true } },
    // *You may spend a Reaction to use your Ward class feature after an attack
    // is rolled, or after the damage is known at rank 2* (D-779; the lead,
    // 2026-10-03, on O-181: *"Yes"*): the incoming attack's card offers the priest
    // a Ward on the creature struck, and the Ward laid answers that blow - its
    // amount off a blow of its school, a one-blow mark the damage door spends.
    "foresight": {
      modifies: mod("Ward"),
      foresight: true,
      reason: "Rank 1 answers before damage reveal; rank 2 may also answer afterwards, before Apply. Payment/delivery coordination and interrupted-operation recovery remain under audit."
    },
    // *You know Pain Suppression. At rank 2 it reduces damage by 1 more* (the audit,
    // D-1884): the spell's own *reduced by 3* on the laid effect, and rank 2's 1 on it.
    "pain-suppression": { spell: { names: ["Pain Suppression"], learn: true, adds: [{ key: "system.damageReduction", amount: "rank-1" }] } },
    // *When a target of your Ward class feature reduces damage to 0, you gain 1
    // Mana per rank* (D-774): read at the one damage door (`effects/wards.mjs`).
    "absorption": { modifies: mod("Ward", { absorb: { mana: "rank" } }) },
    // *Your Dispel class feature may end one condition on an additional target
    // within 20 feet. You may use this a number of times equal to your rank per
    // Short Rest* (D-778; the lead, 2026-10-03, on O-157: *"selected Effects, not
    // conditions."*): 02's Dispel names a second creature within 20 feet of the
    // first and ends ONE effect it carries, through the same chooser and the same
    // refusals, striking a use of the counter. MY READING, for the lead: 04's *one
    // condition* is one effect, since Dispel ends no condition (book-edits-2 d7).
    "rapture": {
      modifies: mod("Dispel", { further: { count: 1, feet: 20 } }),
      grants: counter("rank", "short")
    },
    // *You know Barrier. At rank 2 sustaining it costs 3 Mana a turn rather than 4*
    // (the audit, D-1884): 07's Ward stays the spell's own (`chosenWard` adds nothing
    // now), and rank 2 sets the Sustain's upkeep (`rules/upkeep.mjs#upkeepFor`). The
    // creatures the cast targets are still the ones chosen (O-182).
    "barrier": {
      spell: { names: ["Barrier"], learn: true },
      chosenWard: { spells: ["Barrier"], add: 0 },
      upkeep: { spells: ["Barrier"], less: 1, min: 3, minRank: 2 }
    },
    // *Your Ward class feature may name two targets rather than one* (D-774).
    "mass-ward": { modifies: mod("Ward", { targets: 2 }) },
    // *A target carrying your Ward class feature takes 1 less damage per rank from
    // every source, to no more than your tier* (R1, D-1884): the laid Ward carries it
    // on `damageReduction`.
    "shield-discipline": { modifies: mod("Ward", { reduction: "min(rank,tier)" }) },
    // *As an action, spend 6 Mana. Every friendly target within 20 feet of you gains
    // your Ward class feature against a school you name. You may use this a number of
    // times equal to your rank per Short Rest* (B13, D-1884): no hold at 1 any more
    // (R4). The Use asks the school, gathers every ally within 20 feet - the priest
    // included (D-755) - before anything is paid, and lays 02's Ward with its talents
    // on each through the Ward's one door (`effects/wards.mjs#layWard`).
    "spirit-shell": {
      grants: grant({ action: "action", cost: cost("mana", 6), uses: uses("rank", "short"), choice: "schools", area: "Each ally within 20 ft" }),
      onUse: { wardArea: { feet: 20 } },
      auraReason: "the Ward each ally within 20 feet gains is laid once by the Use's own door (`onUse.wardArea`, then `effects/wards.mjs#layWard`) and lasts as 02's Ward does; nothing follows the priest, so it is no aura"
    },
    // *When your Ward class feature prevents damage, the target may restore
    // Health equal to your tier* (D-774): at the one damage door, automatic (MY
    // READING, for the lead: the door has no moment to ask the target).
    "atonement": { modifies: mod("Ward", { atone: { heal: "tier" } }) },
    // *Your Ward class feature cannot be removed by Dispel or similar effects,
    // and it includes every school* (D-774): every school, and no chooser. The
    // laid Ward carries the mark (`priestWard.undispellable`), and 02's Dispel
    // lists it greyed in the talent's own name (D-778, `rules/dispel.mjs`).
    "aegis-eternal": {
      modifies: mod("Ward", { choice: null, everySchool: true, undispellable: true })
    },
    // ---- Radiance ----
    // *You know Renew. Each rank adds 1 to the Health it restores each turn, to no more
    // than your tier* (R1, D-1884): D-771's tick row, Rejuvenation's shape.
    "renew": { spell: { names: ["Renew"], learn: true }, tick: { spells: ["Renew"], add: "min(rank,tier)" } },
    // *Add your rank, to no more than your tier, to the Health restored by your Mend
    // and Mass Mend class features* (R1, D-1884).
    "serendipity": { modifies: [mod("Mend", { heal: { add: "min(rank,tier)" } }), mod("Mass Mend", { heal: { add: "min(rank,tier)" } })] },
    // *Casting Mend on a target at full Health grants temporary Health equal to
    // your tier plus your rank* (D-777): read at the one healing door, where the
    // creature's Health before the heal is known. 04 names no span: until a Long
    // Rest (the rulings' READING, for the lead).
    "lights-grace": { tempHealth: { on: "atFull", feature: "Mend", amount: "tier+rank", span: "longRest" } },
    // *Your Mend class feature also restores half as much, rounded down, to one
    // further target within 10 feet, or to two further targets at rank 2*
    // (D-774): the card's further targets at half (`healTargetsFor`).
    "circle-of-healing": { modifies: mod("Mend", { further: { count: "rank", share: "half", feet: 10 } }) },
    // *When your healing restores a target to full Health, it gains Ward 1 of a
    // number of schools equal to your rank until the end of your next turn*
    // (D-779; the lead, 2026-10-03, on O-183: *"The caster"*): the schools are named
    // at the cast of a healing spell or feature, carried on its card and its tick,
    // and laid as Ward by the one healing door when the heal restores the target to
    // full (`class-answers.mjs#restoredToFull`, `aegisChanges`).
    "divine-aegis": { aegis: { ward: 1, schools: "rank" } },
    // *Your Mass Mend class feature reaches 10 feet further per rank, and at rank
    // 2 it costs an action rather than a Full Action* (D-774: the reach was never
    // built; the area's radius grows with the rank).
    "empowered-mending": { modifies: mod("Mass Mend", { widen: "10*rank", atRank: [{ rank: 2, action: "action" }] }) },
    // *A target you can see whose Health would drop to 0 instead stays at 1 and
    // restores Health equal to your tier. You may use this a number of times equal
    // to your rank per Long Rest* (D-774, D-777): the damage door ASKS the priest
    // as a blow would drop a creature to 0 - the seeing is the table's (D2 §12) -
    // and a yes strikes a use, holds it at 1 and restores the tier. The Use stays
    // the table's own door for a fall no blow carried: it restores the tier to the
    // creature targeted.
    "guardian-spirit": {
      grants: grant({ action: null, uses: uses("rank", "long"), heal: "tier" }),
      onUse: { aims: "one" },
      holds: { kind: "guardianSpirit", heal: "tier" }
    },
    // *As an action, spend 6 Mana to set a font of Light within 30 feet. It holds
    // five charges ...* (D-779; the lead, 2026-10-03, on O-184: *"10 minutes, caster
    // chooses place.  Other players spend a half-action to expend a charge."*): the
    // Use places the font where the priest clicks, a 30-foot area lasting 10
    // minutes, and its card's charge button heals a friend standing in it for a
    // Half-Action (`class-answers.mjs#lightwellRefusal`).
    "lightwell": {
      grants: grant({ action: "action", cost: cost("mana", 6) }),
      onUse: { lightwell: { feet: 30, charges: 5, minutes: 10 } }
    },
    // *Your Holy damage ignores 2 Ward per rank* (D-774): D-771's Ward pierce,
    // read by the cast, a casting feature, an area's tick and a laid tick.
    "chastise": { spell: { schools: ["holy"], ignoresWard: { amount: "2*rank", schools: ["holy"] } } },
    // *As a Full Action, every friendly target within 30 feet regains Mana equal
    // to your tier per rank. You may use this once per Long Rest* (D-774): the
    // Use measures every ally within 30 feet, the priest included (the lead's
    // D-755 reading of *friendly*), and restores each one's Mana.
    "hymn-of-hope": { grants: grant({ action: "full", uses: once("long"), area: "Each ally within 30 ft" }), onUse: { restores: { pool: "mana", amount: "tier*rank", feet: 30 } } },
    // *Any healing feature of yours that names one target may name two* (D-774):
    // every one of 02's healing features that names one target - Mend, Lay on
    // Hands, Regrowth - of any class the character holds (D-778, O-160:
    // `class-talents.mjs#healTargetsFor`), its chip laid by the feature sync.
    "divine-providence": { healing: { names: 2, oneTarget: true } },
    // *Once per Short Rest, as a Half-Action, spend 8 Mana. For one minute your Mend
    // class feature costs no Mana, and once a round you may use it as a Reaction* (R2's
    // capstone, D-1884; O-185's next-spell promise is retired with the old text): the
    // Use lays a minute's state (`MIRACLE_FLAG`); while it stands Mend's Mana is
    // nothing and Mend offers a Reaction rung beside its Half-Action, the Reaction once
    // a round on the round's record (`MIRACLE_ROUND`).
    "miracle": {
      grants: grant({ action: "half", cost: cost("mana", 8), uses: once("short") }),
      onUse: { miracle: { minutes: 1 } }
    },
    // ---- Shadow ----
    // *You know Shadow Word: Pain. Each rank adds 1 to its Damage Rating*
    // (D-774): its Damage Rating IS its tick (D-770), so the rank rides the tick.
    // It was `spell.damage`, which added to a Rating the cast never deals - a
    // no-op since D-770 (D-681's shape).
    // R1 (D-1884): *to no more than your tier*.
    "shadow-word-pain": { spell: { names: ["Shadow Word: Pain"], learn: true }, tick: { spells: ["Shadow Word: Pain"], add: "min(rank,tier)" } },
    // *You know Mind Flay. Each rank adds 1 to the damage it deals each turn, to no
    // more than your tier* (D-774; R1, D-1884).
    "mind-flay": { spell: { names: ["Mind Flay"], learn: true }, tick: { spells: ["Mind Flay"], add: "min(rank,tier)" } },
    // *If you have not dealt Holy damage or used a healing spell or feature since
    // your last turn, you may add 1 Shadow damage per rank to your spells and
    // attacks* (D-774): the fact is read now - the priest's `shadowform` flag,
    // marked by Holy dealt and a heal given and cleared at the end of their own
    // turn - so the line comes ticked where it holds. It reaches a Shadow blow alone,
    // as built since D-711 (the lead, 2026-10-03, on O-187: *"No it has no effect on
    // non-shadow spells."*; D-779).
    // **ONCE A ROUND** (the audit, D-1884: *once a round you may add*): the line is
    // offered while the round's record holds no `SHADOWFORM_ROUND`, and taking it marks
    // the record (`effects/shadowform.mjs#markShadowformRound`).
    "shadowform": { damage: damage(["shadow"], "both", { when: "shadowform", once: "round" }) },
    // *At rank 2 its radius is 15 feet*: 07's is 10 (D-756, `spellAreaFor`).
    "psychic-scream": { spell: { names: ["Psychic Scream"], learn: true, atRank: [{ rank: 2, widen: 5 }] } },
    // *Once a round, when Shadow damage from you reduces a target's Health, you
    // restore Health equal to your rank* (D-774): from the one damage door.
    "vampiric-touch": { drain: { type: "shadow", heal: "rank", once: "round" } },
    // *Casting Tests against a target dealt Shadow damage by you gain a Boon. At
    // rank 2 your attacks do as well* (D-774): the attacker's damaged mark records
    // the type, and the Boon is an automatic line.
    "twisted-faith": { targetBoon: { on: ["casting"], boons: 1, when: "shadowDamaged", atRank: [{ rank: 2, on: ["casting", "attack"] }] } },
    // *As an action, spend 8 Mana and make a Casting Test. On success, a target
    // ... acts on your Initiative under your direction until it takes damage.*
    "mind-control": {
      grants: grant({ action: "action", cost: cost("mana", 8), casting: true, resist: "spirit" }),
      reason: "the Use pays, makes its Casting Test and offers the target's Spirit Test; a creature acting under another's direction, its Test repeated at the end of each of its turns, is the table's (D2 §12)"
    },
    // *You know Dispersion. Each rank lets you cast it once more before you finish
    // a Short Rest.* The per-spell character gate is rules/spell-limits.mjs.
    "dispersion": {
      spell: { names: ["Dispersion"], learn: true },
      reason: "rules/spell-limits.mjs adds one cast per taken rank to Dispersion's base allowance; effects/spell-limits.mjs pays the turn budget and records the use together on the active GM, and the actor's resetUses refreshes it at a Short or Long Rest"
    },
    // *Your Shadow Word: Pain damage doubles for one round when a target drops
    // below half Health, once per target* (D-779; the lead, 2026-10-03, on O-186:
    // *"tick on cast, and 1 turn after."*): a line on Shadow Word: Pain's dialog,
    // its use struck at the cast, on a target below half Health; the tick the cast
    // lays lands doubled twice (`rules/ticks.mjs#tickLanding`).
    "devouring-plague": {
      grants: counter("rank", "short"),
      castLine: { double: { spells: ["Shadow Word: Pain"], landings: 2, below: 0.5 } }
    },
    // *As a Reaction, spend 4 Mana. A caster you can see within 30 feet cannot
    // cast until your next turn* (D-774): A1's Silenced on the one creature
    // targeted, within 30 feet where both stand, until the priest's next turn
    // starts. Whether the creature is *a caster* is the table's.
    "silence": { grants: grant({ action: "reaction", cost: cost("mana", 4), uses: uses("rank", "short") }), onUse: { inflicts: { condition: "silenced", until: "userTurnStart", feet: 30 } } },
    // *When a target dies while suffering Shadow damage from you, every other
    // enemy within 20 feet takes Shadow damage equal to your tier* (D-774): from
    // the one damage door, a card of its own with an Apply for each.
    "shadowy-apparition": { apparition: { feet: 20, amount: "tier", type: "shadow" } },
    // *Once per Short Rest, as a Half-Action, spend 8 Mana. For one minute you may
    // Sustain one more effect than you could, and when a Shadow spell you Sustain deals
    // damage at the start of a creature's turn, one other creature of your choice
    // within 10 feet of it takes the same damage* (B7, R2's capstone, D-1885; it
    // replaces Void Eruption, which taught a tier 5 spell): the Use lays a minute's
    // state (`HERALD_FLAG`); while it stands the Sustain cap reads one more
    // (`class-talents.mjs#sustainsFor`'s `heraldStanding`), and a sustained Shadow tick landing posts the spread
    // on its own card for the GM to apply (`effects/audit-cunning.mjs#heraldSpreadAfterTicks`).
    "herald-of-the-void": {
      grants: grant({ action: "half", cost: cost("mana", 8), uses: once("short") }),
      onUse: { herald: { minutes: 1, sustains: 1, spread: { feet: 10, school: "shadow" } } }
    }
  },
  // **THE SHAMAN'S THIRTY-SIX** (D-774, the talent plan's Phase 9).
  shaman: {
    // ---- Elemental ----
    // *Fire and Nature damage you deal increases by 1 per rank, to no more than your
    // tier, against a target that has taken damage from you* (D-768's lane; R1,
    // D-1886): the attacker's damaged mark.
    "elemental-fury": { damage: damage(["fire", "nature"], "both", { when: "damagedTarget", amount: "min(rank,tier)" }) },
    // *When a Casting Test you make meets or exceeds SL 2, you gain a Static
    // Charge. You may hold a number of Static Charges equal to your rank. When you
    // deal damage you may spend a Static Charge to add your tier to that damage*
    // (D-774): the charges on the shaman's flag, a line on every damage roll.
    "static-charge": { charge: { sl: 2, max: "rank", damage: "tier" } },
    // *Your Searing totem adds 1 to its damage per rank* (D-707: the totem's own
    // number). *At rank 2 it attacks one further target within 30 feet each turn.*
    "call-of-flame": {
      damage: damage(["all"], "attack", { via: "bound" }),
      reason: "rank 2's further target is the totem's own attack, which the table makes from its block each turn (02's *once per turn* is the block's words and nothing counts it), so a second target is the table's too"
    },
    // *You know Chain Lightning. Each rank adds one further arc.*
    "chain-lightning": {
      spell: { names: ["Chain Lightning"], learn: true },
      arcBonus: 1,
      reason: "rules/chain-lightning.mjs enforces three hits plus one per rank before payment. Per-arc range, target choice and return arcs remain pending; the table currently selects the arc targets."
    },
    // *After a Casting Test you make meets or exceeds SL 3, your next spell costs 2
    // less Mana per rank* (D-774): Nature's Grace's shape (D-771).
    "elemental-focus": { nextSpell: { amount: "2*rank", on: "casting", sl: 3, turn: false } },
    // *You know Earth Shock. At rank 2 the target is also unable to take a Reaction
    // until the end of its next turn.*
    "earth-shock": {
      spell: { names: ["Earth Shock"], learn: true }
    },
    // *A Fire spell of yours ignores 2 Ward per rank. You may use this a number of
    // times equal to your tier per Short Rest* (D-768's counter; D-774's line on a
    // Fire spell's own dialog, a use struck once the cast is paid for).
    "lava-burst": { grants: counter("tier", "short"), castLine: { pierce: "2*rank", schools: ["fire"] } },
    // *As an action, spend 6 Mana and make a Casting Test. On success, any number
    // of targets within 15 feet of you take Nature damage equal to your tier and
    // are moved 10 feet away from you in any direction.*
    // The push (D-778; the lead, 2026-10-03, on O-158: *"Yes."*): once the Use
    // succeeds, every creature it names is moved 10 feet straight away from the
    // shaman through the forced-movement door - a displacement, never metered and
    // never an Opportunity Attack. MY READING, for the lead: *in any direction* is
    // away along the line from the shaman, and another way is the table's hand.
    "thunderstorm": {
      grants: grant({ action: "action", cost: cost("mana", 6), casting: true, damage: { amount: "tier", type: "nature" }, area: "A 15 ft radius centered on you" }),
      onUse: { push: { feet: 10, from: "user" } }
    },
    // *When a Casting Test you make for a spell that deals damage meets or exceeds
    // SL 3, that spell fires a second time at half damage, rounded down, against
    // the same target. You may use this a number of times equal to your rank per
    // Short Rest* (D-774): a button on the spell's card, a use struck when pressed.
    "overload": { grants: counter("rank", "short"), overload: { sl: 3, share: "half" } },
    // *As a Half-Action, your Fire and Nature damage spells count as reaching one
    // SL higher until your next turn* (D-774): the Use lays the state; the cast
    // reads it (MY READING, for the lead: the SL the riders read, never whether
    // the Test succeeded - success is the margin's, CLAUDE.md §7).
    "ascendance": { grants: grant({ action: "half", uses: uses("rank", "long") }), onUse: { ascend: { schools: ["fire", "nature"], sl: 1, until: "userTurnStart" } } },
    // *The elemental from your Elemental Bond class feature takes a second turn
    // each round, immediately after your own.*
    "elemental-mastery": {
      modifies: mod("Elemental Bond"),
      reason: "rules/elemental-turns.mjs adds a second slot immediately after the owner in AzerothCombat's turn order; both slots use the same combatant, ordinary start/end events and refreshed turn budget, with shared once-per-round marks"
    },
    // *Once per Short Rest, as a Half-Action, spend 10 Mana. While you Sustain it, at the
    // start of each of your turns one creature of your choice within 60 feet takes
    // Nature damage equal to your tier plus 2, and you gain a Static Charge, to no more
    // than you may hold. Sustaining it costs 2 Mana a turn* (B8, D-1886; it replaces
    // Storm, Earth and Fire): a Sustain of its own keyed `eye-of-the-storm` (Big Bad
    // Voodoo's shape), whose turn start posts the strike on a card of its own and gives
    // the Static Charge (`effects/audit-cunning.mjs#shamanTurnStart`, from `AzerothCombat#_turnTicks`).
    "eye-of-the-storm": {
      grants: grant({ action: "half", cost: cost("mana", 10), uses: once("short") }),
      onUse: { sustain: { identifier: "eye-of-the-storm", upkeep: { mana: 2 } } },
      eyeOfTheStorm: { feet: 60, damage: { amount: "tier+2", type: "nature" }, charge: 1 }
    },
    // ---- Enhancement ----
    // *Once a round, when you hit with a weapon attack, add Nature damage equal to
    // your rank* (D-774, D-777; the lead: *"Different damage types in one attack
    // are possible"*): a second amount on the blow, NATURE, met by the target's own
    // Nature Ward, Immune and Vulnerable (`mitigation.mjs#resolveDamage`'s extras).
    // R1 (D-1886): *to no more than your tier*.
    "stormlash": { stormlash: { amount: "min(rank,tier)", once: "round", type: "nature" } },
    // *While you Sustain it, your weapon hits lay Scorched 1 on the target, or Scorched 2
    // at rank 2. A creature holds no more Scorched from this talent than that. Beginning
    // it costs 1 Mana* (B11, D-1886; the 1 Mana is O-188's): the Use begins a Sustain of
    // its own, held for 1 Mana at the start of each of the shaman's turns as any Sustain
    // is (05 §12), and while it stands a weapon hit lays the Scorched with no button
    // pressed - its source the talent, so a second hit keeps the higher value rather than
    // adding (`applications/actions.mjs#attackWithDialog`'s `landsOnHit`). The blow's own type is untouched.
    "flametongue": {
      grants: grant({ action: null, cost: cost("mana", 1) }),
      onUse: { sustain: { identifier: "flametongue" } },
      flametongue: { scorched: 1, atRank: [{ rank: 2, scorched: 2 }] }
    },
    // *While you carry a shield, your Armor Points rise by 1 per rank against the
    // first attack each round* (D-774): the target snapshot carries them, and the
    // attack marks the round's record.
    "rockbiter": { firstAttack: { ap: "rank", needs: "shield" } },
    // *As part of an attack, spend 3 Mana. On a hit the target takes Nature damage
    // equal to your tier and takes a Bane on its next attack. At rank 2 it takes
    // two Banes* (D-774): a rider; the Bane lands with the blow (the lead's *"Lands
    // automatically"*), and the damage is a second amount, NATURE, met by the
    // target's own Nature Ward (D-777: *"Different damage types in one attack are
    // possible"*).
    "stormstrike": { rider: rider("mana", 3, { onHit: { damage: "tier", type: "nature", bane: { kind: "attack", banes: 1 } }, atRank: [{ rank: 2, onHit: { bane: { kind: "attack", banes: 2 } } }] }) },
    // *Every third weapon hit returns 2 Mana per rank to you* (D-774): the count on
    // the shaman's own flag (MY READING: it runs across fights until it pays).
    "maelstrom": { maelstrom: { every: 3, mana: "2*rank" } },
    // *As a Reaction, reduce the damage of one attack against you by half, rounded
    // down, and regain Mana equal to your tier* (D-774): Survival Instincts' shape.
    "shamanistic-rage": { grants: grant({ action: "reaction", uses: uses("rank", "short") }), onUse: { mitigate: "halve", gain: { pool: "mana", amount: "tier" } } },
    // *Call two spirit wolves.* 14 §13 prints the Spirit Wolf (D-776; the lead:
    // *"Add Spirit Wolf to 14"*, D-768, and *"Beast"*, O-191), so the call binds
    // two from the pack by this name. `useFeature` still judges every summon
    // BEFORE the action and the Mana are paid, and refuses in words an entry
    // the pack does not hold (`rules/bound.mjs#summonRefusal`).
    "feral-spirit": { grants: grant({ action: "action", cost: cost("mana", 6), summons: summons(["Spirit Wolf"], 2) }) },
    // *Your Stormstrike spreads any Fire effect on the target to one enemy within 10
    // feet, or to two enemies at rank 2*
    // (D-779; the lead, 2026-10-03, on O-189: *"ablaze or whatever it's called
    // condition."*): A1's Scorched, at the struck target's value, on the nearest
    // enemies within 10 feet of it as Stormstrike's hit lands; its span is A1's own.
    "lava-lash": { lavaLash: { condition: "scorched", feet: 10, count: "rank", on: "stormstrike" } },
    // *As a Half-Action, move your Speed without provoking and ignoring Difficult
    // ground ... Leaving Ghost Wolf no longer costs a Half-Action* (D-774): the
    // Use's Half-Action IS the Move, as Disengage's is, and lays the two states
    // until the end of the turn.
    "spirit-walk": {
      grants: grant({ action: "half", uses: uses("rank", "short") }),
      onUse: { walk: { until: "userTurnEnd" } },
      reason: "*Leaving Ghost Wolf no longer costs a Half-Action*: 07's Ghost Wolf is ended by the table's hand and no door charges for leaving it, so there is nothing to waive"
    },
    // *Your Stormlash triggers on every hit until your next turn. You may use this
    // a number of times equal to your rank per Short Rest* (D-774).
    "doom-winds": { grants: counter("rank", "short"), onUse: { doomWinds: { until: "userTurnStart" } } },
    // *While a totem of yours stands, you take less damage from every source, equal to
    // half your tier, rounded down* (the audit, D-1886): a passive gated on a totem bound
    // to the shaman (D-643), on `system.damageReduction` (D-696).
    "earthen-shield": { passive: passive([add("system.damageReduction", "floor(tier/2)")], "totem") },
    // *Your weapon attacks count as spells for your own talents and features, and
    // you may make Casting Tests with your Attack Test instead*
    // (D-779; the lead, 2026-10-03, on O-190: *"Any spell cast or magic damage from
    // weapon attacks."*): a weapon blow whose damage is magical takes the spell lane
    // as well as the attack's - the talents' Damage lines and what stands on the
    // shaman (`class-answers.mjs#blademasterReaches`).
    "elemental-blademaster": {
      blademaster: true,
      reason: "Casting Tests with your Attack Test use the selected readied attack's calculation without Augment (actions.mjs, roll-dialog.mjs, workflows.castSpell). GM and player combat acceptance passed. O-229 retains an open range interpretation: the current implementation keeps spell range rather than weapon range."
    },
    // ---- Restoration ----
    // *You know Healing Wave. Each rank adds 1 to the Health it restores, to no more
    // than your tier* (D-774; R1, D-1886).
    "healing-wave": { spell: { names: ["Healing Wave"], learn: true, heal: 1, cap: "tier" } },
    // *Your Healing Stream totem restores 1 more Health per rank ...*
    "healing-stream-totem": { restorativeTotem: "Healing Stream",
      reason: "rules/restorative-totems.mjs adds Health and target count by rank; the owner's turn offers the GM-coordinated recovery" },
    // *A Casting Test of yours that fails costs no Mana. You may use this a number
    // of times equal to your rank per Short Rest* (D-774): a button on the failed
    // card, the Mana back and a use struck.
    "ancestral-knowledge": { grants: counter("rank", "short"), refund: { failed: true } },
    // *Your Healing Wave also restores half as much, rounded down, to one further
    // friendly target within 10 feet per rank* (D-774).
    "chain-heal": { spell: { names: ["Healing Wave"], further: { count: "rank", share: "half", feet: 10 } } },
    // *Once a round, when you hit with a melee attack, you may restore Health to yourself
    // equal to half your tier, rounded down, plus your rank* (the audit, D-1886): a melee
    // HIT, once a round on the round's record (`EARTHLIVING_ROUND`); nobody turns the
    // Health down, so it lands with the hit.
    "earthliving": { earthliving: { heal: "floor(tier/2)+rank", melee: true, hit: true, once: "round" } },
    // *Your Mana Tide totem returns 1 more Mana per rank ...*
    "mana-tide-totem": { restorativeTotem: "Mana Tide",
      reason: "rules/restorative-totems.mjs adds Mana and range by rank; each recipient chooses a Mana pool on their turn" },
    // *You may cast Healing Wave as a Half-Action once a round, or twice a round at
    // rank 2* (D-774): Nature's Swiftness's line (D-771), its clock the round's record.
    "riptide": { spell: { names: ["Healing Wave"] }, castAs: { action: "half", from: "action", spells: ["Healing Wave"], perRound: "rank" } },
    // *As a Half-Action, add this effect to a totem of yours already standing.
    // While that totem stands, damage taken by any friendly target within 20 feet
    // of it is divided evenly among all of them* (D-777; the lead: *"If the talent
    // moves damage it should just move the damage as directed"*): the Use names
    // the totem (`onUse.link`), and the damage door divides what a linked ally
    // takes among every ally within 20 feet of it (`effects/blow-doors.mjs
    // #divideBlow`). It is read at the blow and laid on nobody, so it is no aura.
    "spirit-link-totem": {
      grants: grant({ action: "half", bound: bound("totem", "buff") }),
      onUse: { link: true },
      links: { feet: 20 },
      auraReason: "the damage divided among every ally within 20 feet of the totem is the damage door's division (D-777), read at each blow and laid on nobody"
    },
    // *When your Earthliving triggers, one friendly target within 10 feet restores
    // the same amount. At rank 2 a second friendly target within 10 feet does as
    // well* (D-774): a button on the attack's card, a press a rank.
    "ancestral-guidance": { guidance: { feet: 10, count: "rank" } },
    // *The next healing spell or feature you use restores the same amount to every
    // friendly target within 20 feet of its target* (D-774): the Use lays the
    // promise; the next heal's card offers it to every ally measured there.
    "cloudburst": { grants: counter("rank", "long"), onUse: { cloudburst: { feet: 20 } } },
    // *Your Reincarnation class feature returns you at half your maximum Health
    // rather than 1, and one Dying friendly target within 30 feet returns with you
    // at 1 Health* (D-774): Reincarnation's Use is built, and this patches it.
    "undying-spirit": { modifies: mod("Reincarnation", { returnAt: "half", ally: { feet: 30 } }) },
    // *Once per Short Rest, as a Half-Action, spend 10 Mana and set a totem within 5 feet
    // of you. It stands as your other totems do and does not count against how many you
    // may have. At the start of each of your turns, every friendly target within 30 feet
    // of it regains Health equal to your tier, and one condition on one of them ends. It
    // lasts until the encounter ends or it is destroyed* (B7, R2's capstone, D-1887; it
    // replaces Ancestral Tide, which taught a tier 5 spell): the totem planted through
    // the one door (`documents/totems.mjs#plantTotem`) off `bound.mjs#totemBlock`, bound
    // outside the tier's count (`uncounted`), for the encounter; its heal and its one
    // ended condition are offered on a card at the start of the shaman's turns
    // (`effects/audit-cunning.mjs#shamanTurnStart`, the condition through `tideEndCondition`).
    "tide-of-the-ancestors": {
      grants: grant({ action: "half", cost: cost("mana", 10), uses: once("short") }),
      onUse: { tide: { totem: "Tide of the Ancestors", within: 5, feet: 30, heal: "tier", cures: 1 } }
    },
    // ---- Shadow Hunter (the Troll's Legacy; D-781, the Legacy branches' phase B6) ----
    // *As a Half-Action, spend 2 Mana. A friendly target within 30 feet restores Health
    // equal to your rank at the start of each of its turns for one minute* (D-770's
    // carrier; the audit, D-1887): one friendly creature within 30 feet (`onUse.aim`), the
    // card's Apply laying the tick for ten of its turns.
    "trolls-blood": {
      grants: grant({ action: "half", cost: cost("mana", 2), tick: { kind: "heal", amount: "rank", rounds: 10 } }),
      onUse: { aim: { feet: 30, friendly: true } }
    },
    // *You know Hex. At rank 2 sustaining it costs no Mana* (D-778's upkeep): the spell
    // embedded, and its Sustain's Mana nothing from rank 2 (`upkeepFor`).
    "witch-doctor": { spell: { names: ["Hex"], learn: true }, upkeep: { spells: ["Hex"], free: true, minRank: 2 } },
    // *Once a round, as part of a melee attack, spend 2 Mana. On a hit the target takes a
    // Bane on its next Resilience Test, or two Banes at rank 2* (D-770, D-774's laid
    // Bane): a line on a melee attack's dialog, the Bane landing with the hit.
    "jinx": { rider: rider("mana", 2, { once: "round", weapon: "melee", onHit: { bane: { kind: "resilience", banes: 1 } }, atRank: [{ rank: 2, onHit: { bane: { kind: "resilience", banes: 2 } } }] }) },
    // *As a Half-Action, spend 5 Mana. A friendly target within 30 feet restores Health
    // equal to twice your tier plus your rank, and one condition of your choice on it
    // ends, Charmed and Stunned included* (door 25): one friendly creature within 30
    // feet, its condition chosen through the one chooser before anything is paid, the
    // card's heal on it.
    "voodoo-mending": {
      grants: grant({ action: "half", cost: cost("mana", 5), heal: "2*tier+rank" }),
      onUse: { cures: { count: 1, friendly: true }, aim: { feet: 30, friendly: true } }
    },
    // *Your Searing totem spits venom. Its attack deals Nature damage rather than Fire,
    // and a creature it hits that is not already Poisoned is Poisoned 1, and the DC to
    // shed it is your Spell DC. At rank 2 that creature is also Slowed until the end of
    // its next turn* (door 20; the audit, D-1887): the bound totem's attack patched, its
    // hit laying what the row lays, the Poisoned only on a creature not already Poisoned
    // (`unless`).
    "serpent-ward": { boundAttack: { kind: "totem", match: "Searing", school: "nature", lays: [{ condition: "poisoned", value: 1, shed: "spellDc", unless: "poisoned" }, { condition: "slowed", until: "endOfNextTurn", minRank: 2 }] } },
    // *Your melee attacks gain a Boon against a creature suffering a condition that you
    // or one of your totems laid. At rank 2 your Jinx costs no Mana against it* (door
    // 17): the Boon an automatic line where the gate holds, and Jinx's line priced at
    // nothing there (`riders.mjs#freeRiderCosts`).
    "cursed-prey": {
      targetBoon: { kind: "attack", boons: 1, when: ["melee", { laidByUser: true }] },
      riderCost: { riders: ["jinx"], free: true, when: { laidByUser: true }, minRank: 2 }
    },
    // *You know Shadow Ward and Shadow Walk, and at rank 2 Darkward and Dark Passage as
    // well. You cast them at your own Casting Test and Spell DC. Holding them is no
    // exposure under 10-CORRUPTION* (door 25): the spells by rank (`spellNamesAtRank`),
    // cast at the shaman's own Mana, Test and DC. Holding a spell exposes nothing in the
    // system - 10's only casting exposure is a tier 5 Fel or Shadow spell, and these are
    // tiers 1 and 2 - so there is nothing to waive.
    "shadow-hunt": { spell: { names: ["Shadow Ward", "Shadow Walk"], learn: true, atRank: [{ rank: 2, names: ["Darkward", "Dark Passage"] }] } },
    // *As a Half-Action, spend 5 Mana and make a Casting Test. On success, every enemy
    // within 15 feet of you makes a Spirit Resilience Test against your Spell DC. On a
    // failure it is Frightened of you until the end of its next turn, and at rank 2 it
    // is Slowed as well*: every enemy within 15 feet gathered on a success (`who`), each
    // one's Resist on the card, and its failure laying the Frightened - and the rank's
    // Slowed beside it - at once (`onFail`; *"Land automatically"*).
    "evil-eye": {
      grants: grant({
        action: "half", cost: cost("mana", 5), casting: true, resist: "spirit", area: "A 15 ft radius centered on you", who: "enemy",
        inflicts: [{ condition: "frightened", until: "endOfNextTurn", onFail: true }, { condition: "slowed", until: "endOfNextTurn", minRank: 2, onFail: true }]
      })
    },
    // *While your Tremor totem stands, every enemy within 30 feet of it takes a Bane on
    // Spirit Resilience Tests* (door 20; the lead: *"Every Spirit Resilience Test"*): an
    // aura on the shaman's ENEMIES, centred on the bound Tremor totem.
    "loa-drum": { aura: aura({ feet: 30, targets: "enemies", centre: "boundTotem:Tremor", bane: { kind: "resilience", resilience: "spirit", banes: 1 } }) },
    // *You may have one more totem standing than your tier allows* (`bound.mjs#capacity`).
    "the-loa-gather": { totems: { more: 1 } },
    // *As an action, spend 10 Mana and make a Casting Test. On success, a creature within
    // 30 feet makes a Spirit Resilience Test against your Spell DC. On a failure it is
    // Stunned until it passes the Test again at the end of one of its turns. At rank 2
    // that Test takes a Bane* (door 19): one creature within 30 feet, its Stun carrying
    // the turn's-end escape, the rank's Bane bound at the stamp, and the Stun laid at once
    // on its failed Spirit Test (`onFail`; *"Land automatically"*).
    "bad-mojo": {
      grants: grant({
        action: "action", cost: cost("mana", 10), casting: true, resist: "spirit",
        inflicts: [{ condition: "stunned", escape: { on: "turnEnd", resilience: "spirit", dc: "spellDc", banes: 1, minRank: 2 }, onFail: true }]
      }),
      onUse: { aim: { feet: 30 } }
    },
    // *Once per Long Rest, as a Full Action, spend 15 Mana. While you Sustain it, no ally
    // within 20 feet of you other than yourself may be reduced below 1 Health by any
    // source. It does not stop a Critical Injury or anything a Critical Injury does.
    // Sustaining it costs 5 Mana a turn* (door 12): a Sustain of its own, keyed
    // `big-bad-voodoo` (the animation layer's loop reads the key), and an aura gated on
    // it laying 07's Aegis floor's own flag, `noCritical` false.
    "big-bad-voodoo": {
      grants: grant({ action: "full", cost: cost("mana", 15), uses: once("long") }),
      onUse: { sustain: { identifier: "big-bad-voodoo", upkeep: { mana: 5 } } },
      aura: aura({ feet: 20, targets: "allies", excludeOwner: true, gate: "sustain:big-bad-voodoo", healthFloor: 1 })
    },
    // ---- Spirit Walker (the Tauren's Legacy; D-781, the Legacy branches' phase B6) ----
    // *You have Ward against Nature and Shadow equal to your rank, to no more than your
    // tier. As a Reaction, spend 2 Mana. A creature within 30 feet that would take a Death
    // Step does not take it. You may use this a number of times equal to your rank per
    // Short Rest* (door 11; R1, D-1887): the standing Ward, the hold asked at the one Death
    // Step door, and the counter the hold strikes (`effects/death-holds.mjs`) - never
    // pressed from the sheet.
    "hold-the-thread": {
      passive: passive([add("system.ward.nature", "min(rank,tier)"), add("system.ward.shadow", "min(rank,tier)")]),
      deathHold: { feet: 30, cost: { pool: "mana", amount: 2 } },
      grants: grant({ action: "reaction", cost: cost("mana", 2), uses: uses("rank", "short") })
    },
    // *As a Reaction when an attack or spell damages a friendly target within 30 feet,
    // spend 2 Mana. Half the damage that gets past its Armor Points and Ward, rounded
    // down, is dealt to you instead, or all of it at rank 2* (D-777's move, phase B6's
    // widening): asked IN the blow, as Guardian is, the share met by the Spirit Walker's
    // own Armor Points and Ward (the plan's *As read*; `blow-doors.mjs#burdenMet`) and
    // landing through their own damage door, the rest staying where it was aimed.
    "shared-burden": {
      grants: grant({ action: "reaction", cost: cost("mana", 2) }),
      moves: { kind: "burden", feet: 30, cost: { pool: "mana", amount: 2 }, share: "half", atRank: [{ rank: 2, share: "all" }] }
    },
    // *Your spells and attacks deal 1 more damage per rank to an undead creature. A
    // Forsaken counts as undead* (door 17): a Damage line on both lanes, ticked where the
    // target's kinds hold undead (`creature-kinds.mjs`, the Forsaken included).
    "laid-to-rest": { damage: damage(["all"], "both", { when: { targetKind: ["undead"] } }) },
    // *As a Half-Action, spend 4 Mana. Every Dying friendly target within 30 feet
    // restores Health equal to your tier per rank and stands* (phase B6's `lift`): every
    // ally within the feet who is Dying, measured before anything is paid, healed
    // through the one healing door and stood up from Prone.
    "ancestors-hand": {
      grants: grant({ action: "half", cost: cost("mana", 4) }),
      onUse: { lift: { feet: 30, heal: "tier*rank" } }
    },
    // *As a Full Action, spend 4 Mana. You step into the Spirit Realm for up to one
    // minute and step back where you left ... While you are in the Spirit Realm, by this
    // or while Dying, you may cast spells that restore Health on any creature but
    // yourself. At rank 2 you take two Half-Actions a turn in the Spirit Realm rather
    // than one, there and while you are Dying* (door 10).
    "the-crossing": {
      grants: grant({ action: "full", cost: cost("mana", 4) }),
      onUse: { crossing: { minutes: 1 } },
      spiritRealm: { heals: "others", halfActions: 1, atRank: [{ rank: 2, halfActions: 2 }] }
    },
    // *As an action, spend 4 Mana and make a Casting Test. On success, end one effect on
    // each creature within 15 feet of a point within 60 feet, or two at rank 2. A
    // summoned or bound creature there also takes Nature damage equal to twice your
    // tier* (door 25): 02's Dispel's law over every creature in the area, the effects
    // chosen before anything is paid and ended on the success.
    "disenchant": {
      grants: grant({ action: "action", cost: cost("mana", 4), casting: true }),
      onUse: { areaDispel: { within: 60, radius: 15, count: 1, atRank: [{ rank: 2, count: 2 }], damage: { amount: "2*tier", type: "nature" } } }
    },
    // *As an action, spend 6 Mana and make a Casting Test. On success, choose a 15 ft
    // radius on the ground within 60 feet. For one minute, every friendly target inside
    // it gains a Boon on Resilience Tests. At rank 2 an attack against a Dying friendly
    // target inside it adds no Death Step* (doors 11 and 25): Firestorm's area, its
    // `remains` the Boon and the spared step, and the card's area held within 60 feet
    // of the shaman's own token (`aimFrom`, Hush of the Grave's door).
    "burial-ground": {
      grants: grant({ action: "action", cost: cost("mana", 6), casting: true, area: "A 15 ft radius on the ground" }),
      onUse: {
        areaTick: { who: "ally", rounds: 10, remains: [{ who: "ally", boon: "resilience" }], atRank: [{ rank: 2, remains: [{ who: "ally", boon: "resilience" }, { who: "ally", noDeathStep: true }] }] },
        aimFrom: { kind: "self", feet: 60 }
      },
      auraReason: "the Boon on Resilience Tests is the placed area's own payload on whoever remains inside it (D-757's `remains`), read at the roll; nothing is laid on an ally standing in reach of the shaman, so it is no aura"
    },
    // *As a Half-Action, spend 6 Mana. Until your next turn physical damage you take is
    // halved, rounded down, and you may move through the space of any creature. While it
    // holds you cannot attack or cast, except spells that restore Health. At rank 2 you
    // may use it as a Reaction* (door 10): the state to the user's next turn, the halving
    // at the one damage door; nothing in the system stops a walk through another
    // creature's space, so the passage needs no door. **Rank 2 ADDS the Reaction** (the
    // B6 review: *you may use it as a Reaction* is a second way, never the only one): both
    // rungs on the one feature (`rungs`), the Use asking which where the turn can pay both
    // (`class-features.mjs#rungChoice`).
    "ethereal-form": {
      grants: grant({ action: "half", cost: cost("mana", 6), atRank: [{ rank: 2, rungs: ["half", "reaction"] }] }),
      onUse: { ethereal: { until: "userTurnStart" } }
    },
    // *Your Reincarnation class feature may be used twice between Long Rests*.
    "the-way-back": { modifies: mod("Reincarnation", { uses: { max: 2, per: "long" } }) },
    // *As a Half-Action, spend 8 Mana and make a Casting Test. On success, a creature
    // within 30 feet makes a Spirit Resilience Test against your Spell DC. A Boss makes
    // the Test with a Boon. On a failure, the damage it deals is halved, rounded down,
    // until the end of its next turn* (door 25): the one creature named, its failed
    // Resist laying the halving that every damage door reads off a blow's source.
    "drawn-across": {
      grants: grant({ action: "half", cost: cost("mana", 8), casting: true, resist: "spirit" }),
      onUse: { halvesDealt: { until: "endOfNextTurn", bossBoon: true }, aim: { feet: 30 } }
    },
    // *Your Ethereal Form also covers one friendly target within 30 feet per rank* (door 10).
    "kindred-spirits": { etherealAllies: { feet: 30, count: "rank" } },
    // *Once per Long Rest, as a Full Action, spend 15 Mana. A creature within 30 feet that
    // took its third Death Step since the end of your last turn stands at half its
    // maximum Health, rounded down, with its Death Steps cleared, and spends no Spirit's
    // Tether. You gain Fatigued. A creature with no Spirit's Tether left does not return,
    // and no creature returns this way twice* (doors 11 and 25; the lead: *"Until the GM
    // moves the clock"*).
    "ancestral-spirit": {
      grants: grant({ action: "full", cost: cost("mana", 15), uses: once("long") }),
      onUse: { revive: { feet: 30 }, self: { condition: "fatigued" } }
    }
  },
  // **THE MAGE'S THIRTY-SIX** (D-775, the talent plan's Phase 10): every talent
  // built or carrying its reason, each kind read by the one door
  // `rules/class-talents.mjs` names; `mage-talents.test.mjs` holds every number
  // to 04's own Effect cell.
  mage: {
    // ---- Arcane ----
    // *Each effect you Sustain costs 1 less Mana per rank at the start of your
    // turn, to a minimum of 1* (D-778): the upkeep is the entry's own now (the
    // lead, 2026-10-03, on O-163: *"cost by the entry or 1 Power if not
    // mentioned."*), and the rank comes off each Sustain's Mana at the turn's
    // start, never below 1 by the talent's own hand (`rules/upkeep.mjs`).
    // **THE CLASS TALENT AUDIT** (C, D-1890): *The upkeep of an effect you Sustain falls
    // by 1 at the start of your turn, to a minimum of 0, for a number of effects equal
    // to your rank* - 1 off each of the first `effects` Sustains that pay Mana, in the
    // order the caster holds them (`upkeepFor`'s `index`; MY READING, for the lead).
    "arcane-concentration": { upkeep: { less: 1, min: 0, effects: "rank" } },
    // *Your Blink class feature reaches 10 feet further per rank. At rank 2 it
    // costs no Mana once per Short Rest* (D-775): the reach on Blink's patch
    // (`blinkFor`), and rank 2's free Blink the counter the talent grants at
    // that rank, struck as Divine Favor's is (D-772). The move itself is the
    // table's: 02's Blink moves a token by no door.
    "improved-blink": {
      modifies: mod("Blink", { feet: "10*rank" }),
      grants: { ...counter(1, "short"), minRank: 2 },
      freeUse: { feature: "Blink", minRank: 2 }
    },
    // *When you Overchannel, its cost to you is reduced by 1 per rank - the
    // Health, or the doubled Mana once you hold Overchannel Mastery* (D-775):
    // the Health half off each cast's Overchannel (MY READING: per cast, not per
    // point). The Mana half waits on 02's Overchannel Mastery, a QUESTION.
    // **AND THE DOUBLED MANA** (D-779; the lead, 2026-10-03, on O-192: *"Per
    // cast"*): with 02's Overchannel Mastery an Overchannel costs the spell's Mana
    // once more a cast and no Health, and the rank comes off that second charge
    // (`casting.mjs#overchannelPrice`).
    // **PER POINT NOW** (the class talent audit, C3; 07 §8 and 04 agree): *Each point
    // of Overchannel you take costs 1 less per rank, to a minimum of 1: 1 less Health,
    // or 1 less Mana once you hold Overchannel Mastery* - off EACH point's price, never
    // below 1 a point (`casting.mjs#overchannelPrice`). O-192's per-cast reading is overturned.
    "overchanneller": {
      overchannel: { less: "rank", min: 1 }
    },
    // "You know X": the spell is learned with the talent, and the rank's rider rides its card.
    // R1 (D-1861): *to no more than your tier*.
    "arcane-missiles": { spell: { names: ["Arcane Missiles"], learn: true, damage: 1, cap: "tier" } },
    // *When you Overchannel and the Casting Test succeeds, you may take up to your rank
    // in points of Overchannel on your next spell before the end of your next turn
    // without paying for them* (the class talent audit, D-1890): free points on the
    // next spell (`nextSpell.overchannel`), laid only by an Overchannelled success
    // (`on: "overchannelSuccess"`), lapsing after the mage's next turn (`through`).
    // The Mana back is gone, and with it the endless pool.
    "clearcasting": { nextSpell: { overchannel: "rank", on: "overchannelSuccess", sl: null, turn: false, through: "nextTurn" } },
    // *You know Mana Shield. At rank 2, every 2 damage it takes costs you 1 Mana,
    // rounded up* (the class talent audit, D-1890): the shield's own payment
    // (`rules/mana-shield.mjs#manaShieldDamage`'s `ratio`), read at the damage door.
    "mana-shield": { spell: { names: ["Mana Shield"], learn: true }, manaShield: { ratio: 2, minRank: 2 } },
    // *Until the end of your next turn your spells add 1 Arcane damage per
    // rank.* Laid by the feature's own Use and expired by core (D-628). **EVERY
    // spell** (D-775), and **ARCANE** (D-777; the lead: *"Different damage types
    // in one attack are possible"*): the rank rides the typed lane
    // (`system.damageBonus.typed.spell.arcane`), so a Fire spell lands its Fire
    // and a second amount of Arcane, each met by its own Ward - a creature Immune
    // to Fire still takes the Arcane - and an Arcane spell's own Rating takes it.
    // **THE CLASS TALENT AUDIT** (D-1890): *Once per Short Rest, using no action, spend 4
    // Mana. Until the end of your turn your spells deal additional damage equal to your
    // tier, of each spell's own type. At rank 2 it lasts until the end of your next
    // turn* - the tier on the spell lane of every type (each spell's own, never a second
    // Arcane amount), laid by the Use's own door at the mage's tier (`onUse.arcanePower`,
    // `onUseMageWarlock`), its span the turn and rank 2's the next turn's end.
    "arcane-power": {
      grants: grant({ action: null, cost: cost("mana", 4), uses: once("short") }),
      onUse: { arcanePower: { amount: "tier", until: "endOfTurn", atRank: [{ rank: 2, until: "endOfNextTurn" }] } }
    },
    // *You may use your Blink class feature on a friendly target you can see
    // within 30 feet instead of on yourself* (D-775): the Use names the friend,
    // refused in words past 30 feet or hostile.
    "slow-time": { modifies: mod("Blink", { friendly: { feet: 30 } }) },
    // *Your Counterspell class feature also ends one effect the caster is
    // Sustaining. At rank 2 you may Sustain that effect yourself instead* (D-775):
    // rank 1 ends one Sustain the creature targeted holds, through the GM's
    // client where it is another's (`effects/sustain-steal.mjs`).
    "spellsteal": {
      modifies: mod("Counterspell", { steals: true, atRank: [{ rank: 2, transfers: true }] }),
      gap: "rank 2 transfers reviewed sustained effects, areas and record-only defenses; specialized Mind Control transfer still requires its targeting ruling and implementation. Remaining carrier and recovery acceptance is tracked in the automation audit's SPELLSTEAL.md."
    },
    // *Your Shape the Weave class feature Sustains 1 further effect per rank,
    // and the Mana each costs at the start of your turn is reduced by the number
    // of effects you are Sustaining* (D-775): the limit, built; the reduction
    // (D-778, O-163) off each entry's own upkeep, by the count held as the turn
    // starts, while the mage holds Shape the Weave. 07 §7's *pays for all five
    // every turn* is the book conflict the records name.
    // **THE CLASS TALENT AUDIT** (D-1890): *Your Shape the Weave class feature Sustains 1
    // further effect per rank* - the limit alone; the upkeep reduction is gone, so a mage
    // holding five Sustains pays for all five as 07 §7 says.
    "netherwind": {
      modifies: mod("Shape the Weave", { sustains: "rank" })
    },
    // *As a Reaction, spend 6 Mana. You gain Ward 2 against every school until
    // the end of your next turn* (D-775): Cloak of Shadows' door (D-773), every
    // school and no chooser, its span the end of the mage's next turn.
    "prismatic-ward": { grants: grant({ action: "reaction", cost: cost("mana", 6) }), onUse: { ward: { amount: 2, everySchool: true, until: "userTurnEnd" } } },
    // **MASTER OF THE WEAVE** (the class talent audit, C1, D-1890; it was Archmage, which
    // taught the tier 5 spell and broke 05 §4's cap with four Boons): *You may Sustain one
    // more effect than your features and talents allow. While you Sustain three or more
    // effects, your Casting Tests gain a Boon, and Dispel and similar effects end a
    // Sustained spell of yours only on a Casting Test that meets or exceeds SL 2* - the
    // limit (`sustainsFor`'s `weave`), an automatic Casting Test line on the count held
    // (`castingBoonsFor`'s `sustainingThree`), and D-248's SL floor on the mage's
    // Sustained casts (`dispelGatesFor`'s `sustained`).
    "master-of-the-weave": {
      weave: { sustains: 1 },
      castingBoon: { boons: 1, while: "sustainingThree" },
      dispelGate: { sl: 2, sustained: true }
    },
    // ---- Fire ----
    // R1 (the class talent audit, D-1861): *Each rank adds 1 to its Damage Rating, to
    // no more than your tier* - the first row to carry `cap`, the engine's proof.
    "fireball": { spell: { names: ["Fireball"], learn: true, damage: 1, cap: "tier" } },
    // *When your Fire damage reduces a target's Health, it takes 1 further Fire
    // damage per rank at the start of its next turn* (D-775): a tick laid from
    // the one damage door (`afterBlow`), its own landing never laying another (MY
    // READING: a burn that re-lit itself would never go out).
    "ignite": { ignite: { amount: "rank", type: "fire" } },
    // *Once a round, a Fire spell of yours costs a Half-Action rather than an
    // action. At rank 2 it also ignores 2 Ward* (D-775): Riptide's line (D-774) by
    // school, its clock the round's record, and the Ward pierce on that cast.
    "fire-blast": { castAs: { action: "half", from: "action", schools: ["fire"], perRound: 1, atRank: [{ rank: 2, pierce: 2 }] } },
    // *Your Fire damage against a target already burning from Ignite adds your
    // rank* (D-775): a fact the door reads off the target's own Ignite tick.
    "combustion": { damage: damage(["fire"], "both", { when: "ignited" }) },
    // *You know Blast Wave. Each rank adds 5 feet to the push* (D-778; the lead,
    // 2026-10-03, on O-158: *"Yes."*): 07's own push - 5 feet away from the mage
    // on a failed Reflex Test, 10 at SL 2 or better - landed through the
    // forced-movement door from the Test's own card, and the rank's 5 feet on it.
    "blast-wave": {
      spell: { names: ["Blast Wave"], learn: true, push: "5*rank" }
    },
    // *You gain Ward 1 per rank against Fire, and a creature that hits you in
    // melee takes Fire damage equal to your rank* (D-775): the Ward is a passive;
    // the blow back rides Immolation's door (`retaliationRows`, D-757).
    "molten-skin": { passive: passive([add("system.ward.fire", "rank")]), retaliate: { type: "fire", amount: "rank", melee: true } },
    // *As a Full Action, spend 6 Mana and make a Casting Test. On success a target
    // takes Fire damage equal to three times your tier plus your rank. At rank 2 a
    // Casting Test at SL 3 or better also applies Stunned until your next turn*
    // (D-775; the class talent audit's Tune, D-1890): the Stun a button per target,
    // as Hurricane's Slowed is (D-771).
    "pyroblast": {
      grants: grant({
        action: "full", cost: cost("mana", 6), casting: true, damage: { amount: "3*tier+rank", type: "fire" },
        inflicts: [{ condition: "stunned", value: null, until: "casterTurnStart", sl: 3, minRank: 2 }]
      })
    },
    // *When a target burning from Ignite drops to 0 Health, every enemy within 10
    // feet takes Fire damage equal to your tier per rank* (D-775): Shadowy
    // Apparition's door (D-774), off the fallen creature's own Ignite.
    "living-bomb": { apparition: { feet: 10, amount: "tier*rank", type: "fire", from: "ignite" } },
    // *Your Fire spells treat Immune (Fire) as Ward 3 instead* (D-775).
    "burning-soul": { immuneAsWard: { schools: ["fire"], ward: 3 } },
    // *Once per Short Rest, as a Half-Action, spend 8 Mana and make a Casting
    // Test. On success a 20-foot area within 60 feet burns until the end of your
    // next turn, and anything starting its turn there takes Fire damage equal to
    // your tier plus your rank and suffers your Ignite* (D-775; the class talent
    // audit's Tune, D-1890): the area's tick, as D-756's (the Use deals nothing
    // itself), the Ignite Ignite's own door's.
    "firestorm": {
      grants: grant({ action: "half", cost: cost("mana", 8), casting: true, uses: once("short"), area: "A 20 ft radius on the ground" }),
      onUse: { areaTick: { who: "creature", amount: "tier+rank", type: "fire", rounds: 1 } }
    },
    // *Once per Long Rest, when you would drop to 0 Health you stay at 1 instead,
    // and every enemy within 10 feet takes Fire damage equal to your tier*
    // (D-775): at the one damage door, the counter's use struck (MY READING: the
    // first such blow, as Divine Favor's first heal).
    "cauterize": { grants: counter(1, "long"), cauterize: { stay: 1, feet: 10, amount: "tier", type: "fire" } },
    // **PYROMANIAC** (the class talent audit, C1, D-1890; it was Sunfire): *Your Ignite
    // deals Fire damage equal to your tier rather than your rank. Your Fire spells
    // ignore 2 Ward against a target burning from Ignite* - Ignite's amount restated
    // (`igniteFor` reads `igniteAmount`), and a Ward pierce gated on the TARGET's own
    // Ignite tick (`wardPierceFor`'s `facts.ignited`, `AzerothActor#spellWardPierceAt`).
    "pyromaniac": {
      igniteAmount: "tier",
      spell: { schools: ["fire"], ignoresWard: { amount: 2, schools: ["fire"], whenTarget: "ignited" } }
    },
    // ---- Frost ----
    // R1 (D-1861): *to no more than your tier*.
    "frostbolt": { spell: { names: ["Frostbolt"], learn: true, damage: 1, cap: "tier" } },
    // *You know Frost Armor. At rank 2 its Ward against Frost is 2* (D-775): the
    // laid effect's own Ward 1 and one more from rank 2.
    "frost-armor": { spell: { names: ["Frost Armor"], learn: true, adds: [{ key: "system.ward.frost", amount: 1, minRank: 2 }] } },
    // *Your effects that reduce Speed reduce it 5 feet further per rank* (D-778;
    // the lead, 2026-10-03, on O-165: *"Yes."* to *is Slowed an effect that reduces
    // Speed by a number of feet, so Permafrost's 5 add to it?*): a Speed drop the
    // mage lays through the Speed-drop door (Frostbolt's 10 feet, Ice Spear's, a
    // rider's) drops 5 feet further a rank, and a **Slowed** the mage's spell or
    // feature lays carries the 5 a rank beside A1's halving, on the same effect.
    // MY READING, for the lead: *your effects* are the ones laid on another
    // creature - Winterheart's drop on the mage is not one.
    "permafrost": { slowing: { add: "5*rank" } },
    // *You know Frost Nova. At rank 2 a creature it holds takes a Bane on the Test
    // to break free* (D-778; the lead, 2026-10-03, on O-159: *"Yes."*): 07's own
    // *until it spends an action and passes another Reflex Resilience Test* is a
    // prompt at the held creature's turn (`rules/escapes.mjs`), and the Bane rides
    // the escape the Entangled carries.
    "frost-nova": {
      spell: { names: ["Frost Nova"], learn: true },
      escape: { spells: ["Frost Nova"], banes: 1, minRank: 2 }
    },
    // *You know Ice Block. At rank 2 you may end it early on your turn at no cost.*
    "ice-block": {
      spell: { names: ["Ice Block"], learn: true },
      reason: "Ice Block casting creates timed protection and clears condition effects; rank 2 has an own-turn early-end control. Full external-effect immunity and uncertain-write recovery acceptance remain under review."
    },
    // *Your spells gain a Boon against a target that is Entangled or Slowed, or
    // whose Speed is otherwise reduced. At rank 2 they inflict a Critical Injury
    // on 19 or 20 against such a target* (D-775): an automatic line on the
    // Casting Test, and a Critical Injury button on the spell's card.
    "shatter": {
      targetBoon: { on: ["casting"], boons: 1, when: "slowedTarget" },
      spellCritical: { on: 19, when: "slowedTarget", minRank: 2 }
    },
    // *You know Cone of Cold. A creature that fails its Test takes Frost damage equal to
    // your tier plus your rank, and each rank adds 5 feet to the cone* (D-775; the class
    // talent audit's Tune, D-1890). MY READING, for the lead: the tier plus the rank
    // RESTATES 07's 2 - `spell.amount` is the difference over 07's own Rating, read by
    // `spellDamageFor` (`mage-talents.test.mjs` holds the 2 to the pack) - so a success still
    // takes half of it, as 07 says.
    "cone-of-cold": { spell: { names: ["Cone of Cold"], learn: true, lengthen: "5*rank", amount: "max(0,tier+rank-2)" } },
    // *You know Ice Barrier. Each rank adds 2 to the temporary Health it grants*
    // (D-777): 07's 8 and the rank's 2 ride the card, and its Apply grants them
    // with the laid effect.
    "ice-barrier": {
      spell: { names: ["Ice Barrier"], learn: true },
      tempHealth: { spells: ["Ice Barrier"], add: "2*rank" }
    },
    // *A target held by your Frost Nova that fails a second Test against it is
    // Stunned until the end of your next turn* (D-778, O-159): the second Test is
    // the escape the Entangled carries, and its failure lays **Stunned** until the
    // end of the MAGE's next turn, keyed on the mage's combatant (D-628).
    "deep-freeze": { escape: { spells: ["Frost Nova"], failStun: "casterTurnEnd" } },
    // *Once per Short Rest, as a Half-Action. Until the end of your next turn your
    // Casting Tests gain a Boon and your Frost spells cost 1 less Mana per rank*
    // (D-775): a state on the mage (`effects/talent-states.mjs`), read by the
    // Casting Test's line and the cast's Mana.
    "icy-veins": {
      grants: grant({ action: "half", uses: once("short") }),
      onUse: { veins: { boons: 1, schools: ["frost"], less: "rank", until: "userTurnEnd" } }
    },
    // *You are Immune (Frost), and your Frost damage ignores 2 Ward* (D-775): the
    // derived `system.immune`, and Chastise's Ward pierce (D-774).
    "frozen-core": { immune: { types: ["frost"] }, spell: { schools: ["frost"], ignoresWard: { amount: 2, schools: ["frost"] } } },
    // **SHATTERING COLD** (the class talent audit, C1, D-1890; it was Absolute Zero): *A
    // creature you have Slowed or Entangled takes a Bane on Resilience Tests against your
    // Frost spells. Once a round, when a Frost spell of yours damages an Entangled
    // creature, it is Stunned until the end of its next turn unless it succeeds on a Body
    // Resilience Test against your Spell DC.* The Bane rides the Resist a Frost spell's
    // card asks (`resistTalentsOn`, off the resister's own `laidBy`), and the Stun is
    // asked of the damage door's Frost blow (`effects/after-blow.mjs#shatteringColdFrom`),
    // once a round on the mage's round record.
    "shattering-cold": {
      resistBane: { banes: 1, schools: ["frost"], laidBy: ["slowed", "entangled"] },
      frozenStun: { on: "entangled", schools: ["frost"], condition: "stunned", resilience: "body", once: "round" }
    }
  },
  // **THE WARLOCK'S THIRTY-SIX** (D-775, the talent plan's Phase 11).
  warlock: {
    // ---- Affliction ----
    // *Your curses deal 1 more damage per rank at the start of the target's
    // turns. A curse that deals no damage lasts a further minute per rank*
    // (D-775): the tick of a curse that has one, and a further minute on every
    // other - 07's *Curse of ...* by name and 02's Curse (MY READING: *your
    // curses* are those).
    // **THE CLASS TALENT AUDIT** (D-1891): *Your curses deal 1 more damage per rank at the
    // start of the target's turns, to no more than your tier. A creature takes a −1 penalty
    // per rank on a Resilience Test against a curse of yours that deals no damage* - the
    // tick raised under R1's cap, and the penalty a modifier on the Resist the curse's card
    // asks (`resistTalentsOn`); the minute a rank is gone.
    "malediction": {
      tick: { spells: ["Curse of Agony", "Curse of Doom"], add: "rank", cap: "tier" },
      resistPenalty: { amount: "rank", spells: ["Curse of Weakness", "Curse of Tongues", "Curse of the Elements", "Curse of Exhaustion", "Curse of Ruin"], features: ["Curse"] }
    },
    // *Your Life Tap class feature returns 1 further Mana for every 2 Health you spend,
    // per rank* (D-775; the class talent audit's Tune, D-1891): on 02's Life Tap, built
    // with it - `perTwo` a rank, read by `lifeTapFor` and priced by `lifeTapChoices`.
    "improved-life-tap": { modifies: mod("Life Tap", { perTwo: "rank" }) },
    // *At the start of your turn, if any target lost Health to Shadow or Fel
    // damage from you since the start of your last turn, you restore Health equal
    // to the highest amount a single target lost, to a maximum of twice your
    // rank* (D-775): the highest loss recorded at the one damage door, healed at
    // the turn's start (`AzerothCombat#_talentTicks`).
    "siphon": { siphon: { types: ["shadow", "fel"], max: "2*rank" } },
    // *You know Curse of Agony. Each rank adds 1 to its Damage Rating* (D-775): its
    // Damage Rating IS its tick (D-770), so the rank rides the tick, as D-774
    // moved Shadow Word: Pain's.
    // **THE RAMP** (the class talent audit, D-1891; Classic's Curse of Agony): *Its damage
    // rises by 1 at the start of each of the target's turns after the first, to no more than
    // 1 more per rank* - nothing at the cast, a rise the tick carries (`tick.rises`), read by
    // `rules/ticks.mjs#risenAmount` at each landing.
    "curse-of-agony": { spell: { names: ["Curse of Agony"], learn: true }, tickRise: { spells: ["Curse of Agony"], by: 1, max: "rank" } },
    // *You know Drain Soul. Each rank adds 1 Mana to what its target's death
    // returns* (D-775): 07's 3 Mana on the death of a target the warlock is
    // holding it on, built with it, and the rank beside it.
    "drain-soul": { spell: { names: ["Drain Soul"], learn: true }, death: { spell: "Drain Soul", mana: "rank" } },
    // *A target that ends one of your ongoing effects early takes Fel damage equal
    // to twice your tier per rank* (D-778; the lead, 2026-10-03, on O-157:
    // *"selected Effects, not conditions."*): 02's Dispel is the door that ends one,
    // and the creature whose Dispel ended it is posted a card of Fel damage at the
    // warlock's tier, met by its own Ward. MY READING, for the lead: once an
    // effect ended, and a hand's delete or a span running out is no ending by a
    // target.
    // **THE CLASS TALENT AUDIT** (D-1891): *A creature that ends one of your ongoing effects
    // early, by Dispel, by a Resilience Test or by any other means, takes Fel damage equal to
    // your tier per rank* - the amount halved, and the trigger widened: 02's Dispel's door
    // and the escape Test's (`effects/escapes`' success, `unstableStrikes`).
    "unstable-affliction": { unstable: { amount: "tier*rank", type: "fel" } },
    // *Your Curse class feature may name one further target within 30 feet per
    // rank* (D-775): on 02's Curse, built with it (MY READING: within 30 feet of
    // the first, as D-774 read Circle of Healing's further target).
    "pandemic": { modifies: mod("Curse", { further: { count: "rank", feet: 30 } }) },
    // **DARK PACT** (the class talent audit, C1 and decision 14, D-1891; it was Blood Pact,
    // and Classic's Dark Pact drained the pet's mana): *Once per Short Rest, as a Half-Action,
    // a demon of your Bound Demon class feature within 30 feet loses Health equal to twice
    // your tier, and you gain that much Mana. It cannot drop below 1 Health this way.* The
    // Use picks the demon (`bound.action: "drain"`), judges the 30 feet and the Health left
    // before anything is paid, and the Mana is what the demon lost, into the Warlock's own
    // pool (`darkPactDrain`). Once a Short Rest, so a healer cannot make the demon a well.
    "dark-pact": {
      grants: grant({ action: "half", uses: once("short"), bound: bound("demon", "drain") }),
      onUse: { darkPact: { feet: 30, amount: "2*tier" } }
    },
    // *As a Half-Action, name a target within 30 feet suffering an ongoing effect
    // of yours and a second target within 30 feet of the first. Every ongoing
    // effect of yours ends on the first target and begins on the second ...*
    // (D-775): the ticks and the spells the warlock laid there, moved whole
    // through the GM's client (`effects/soul-swap.mjs`).
    "soul-swap": { grants: grant({ action: "half" }), onUse: { swap: { feet: 30 } } },
    // *As an action, spend 4 Mana and make a Casting Test. On success each ongoing
    // effect of yours on that target deals 1 further damage per rank, of that
    // effect's own damage type, and you restore Health equal to your tier when the
    // target dies* (D-775): the ticks raised, and the heal carried on them.
    "haunt": {
      grants: grant({ action: "action", cost: cost("mana", 4), casting: true }),
      onUse: { haunt: { add: "rank", heal: "tier" } }
    },
    // *Your ongoing effects last one further minute per rank. At rank 2, Dispel
    // and similar effects end one of them only on a Casting Test that meets or
    // exceeds SL 2* (D-775): the minute, built; rank 2 (D-778) gates every one of
    // the warlock's effects a Dispel selects on the DISPELLER's Casting Test at SL
    // 2 or better, one Test an effect (MY READING, for the lead).
    // **THE CLASS TALENT AUDIT** (D-1891; D-248's SL floor): *Dispel and similar effects end
    // one of your ongoing effects only on a Casting Test that meets or exceeds SL 1 per rank*
    // - the gate at the rank (`dispelGatesFor` reads `sl: "rank"`); the minute is gone.
    "everlasting-affliction": {
      dispelGate: { sl: "rank" }
    },
    // **DARK HARVEST** (the class talent audit, C1, D-1891; it was Soul Reaper): *At the
    // start of your turn, each creature within 60 feet carrying two or more of your ongoing
    // effects takes Shadow damage equal to your tier. Once a round, Soul Swap costs no
    // action.* The harvest is read at the warlock's turn start (`AzerothCombat#_talentTicks`,
    // Siphon's door, through `effects/dark-harvest.mjs`), the count by `swappableEffects`'
    // one reading of *your ongoing effects*; the free Soul Swap is `freeUse`, once a round
    // on the round's record.
    "dark-harvest": {
      harvest: { feet: 60, count: 2, amount: "tier", type: "shadow" },
      freeUse: { feature: "Soul Swap", per: "round", action: true }
    },
    // ---- Demonology ----
    "demonic-embrace": { modifies: mod("Bound Demon"), automated: "inline" },
    "fel-domination": { modifies: mod("Bound Demon", { action: "half", cost: { delta: "-2*rank" } }) },
    // The demon's talents (D-643): `rules/bound.mjs#boundEffects` reads these BY
    // IDENTIFIER and lays them on the demon; the patch on Bound Demon is the chip.
    // *At rank 2 it gains Ward 1 against Fel or against Shadow, chosen when you
    // summon it* (D-775): asked through the one chooser after the demon, and the
    // bond's own `school` carries it.
    "demonic-aegis": {
      modifies: mod("Bound Demon", { aegis: { ward: 1, schools: ["fel", "shadow"], minRank: 2 } }), automated: "inline"
    },
    "soul-link": {
      spell: { names: ["Soul Link"], learn: true },
      automated: "inline", // The damage preparation adapter reads the rank; delivery remains partial below.
      reason: "Soul Link now has consent, successful-cast replacement and an identified carrier with Health, range and time cleanup. Its approved per-type split and rank-2 Ward calculation are tested, but damage delivery remains unwired: transferred damage and the caster's adjusted share still require table handling. Interrupted-cast recovery and broader player acceptance remain under review."
    },
    "demonic-empowerment": {
      grants: grant({ action: "half", cost: cost("mana", 3), bound: bound("demon", "buff") }),
      damage: { amount: "2*rank", types: ["all"], applies: "attack", when: null, via: "bound" }
    },
    // *Dismissing and summoning a demon costs no action. At rank 2 you may hold
    // two Bound Demons at once*: `rules/bound.mjs#capacity` reads rank 2 by
    // identifier, and the patch makes Bound Demon's summon free (D-775). 02's
    // dismissal Half-Action is charged by no door, so there is nothing to waive.
    "master-summoner": { modifies: mod("Bound Demon", { free: true }), automated: "inline" },
    // *As a Half-Action, dismiss a demon of your Bound Demon class feature. You
    // gain Mana equal to twice your tier per rank, and that demon's Ward until the
    // encounter ends. The dismissed demon cannot be summoned again until your next
    // Long Rest* (D-775): the Ward read off the demon before it goes, laid on the
    // warlock for the encounter, and the demon greyed in the chooser until a Long Rest.
    "demonic-sacrifice": { grants: grant({ action: "half", bound: bound("demon", "dismiss") }), onUse: { sacrifice: { ward: true } } },
    "felguard": { modifies: mod("Bound Demon", { choiceExtra: [{ name: "Felguard", level: 1, greater: false }] }) },
    // *Fel and Shadow damage from your spells and features adds 1 damage of that
    // type per rank. At rank 2 your Casting Tests gain a Boon while you control a
    // Bound Demon* (D-775: the Boon an automatic line on the Casting Test).
    // **THE CLASS TALENT AUDIT** (D-1891): *While you control a Bound Demon, you gain Ward 1
    // against Fel and against Shadow. At rank 2 your Casting Tests also gain a Boon while you
    // control a Bound Demon* - the damage lane gone, a passive gated on a Bound Demon held
    // (`passivesFor`'s `boundDemon`, re-synced when a bond is made or released).
    "demonic-knowledge": {
      passive: passive([add("system.ward.fel", 1), add("system.ward.shadow", 1)], "boundDemon"),
      castingBoon: { boons: 1, while: "boundDemon", minRank: 2 }
    },
    // *While you control a Bound Demon, you and every friendly target within 20
    // feet of it add 1 damage per rank to the damage of your spells.* AN AURA
    // (D-755; the lead's reading).
    "demonic-pact": { aura: aura({ feet: 20, centre: "boundDemon", spellDamage: "rank" }) },
    // *As a Full Action you may make a Casting Test targeting a Demon you can see
    // within 20 feet. On success that Demon is Bound to you until your next Long
    // Rest and does not count against the number of Bound Demons you may hold*
    // (D-775): D-649's adopt, through the GM's client, uncounted and released at
    // the next Long Rest.
    "command-demon": {
      grants: grant({ action: "full", casting: true, bound: bound("demon", "bind") }),
      onUse: { command: { feet: 20, kind: "demon" } },
      reason: "*take their turns apart from yours, at any point during your side's turn*: the tracker gives every bound creature its own turn on its owner's Initiative and side (D2 §7, D-643), and when within the side the table moves to it is the table's"
    },
    // *Your Metamorphosis class feature costs a Half-Action and does not end at a
    // Short Rest. While you hold that form, your Bound Demons add your tier to
    // their damage.* All three halves are built (D-769).
    "demonic-ascendance": {
      modifies: [mod("Metamorphosis", { action: "half" }), mod("Bound Demon")], automated: "inline"
    },
    // ---- Destruction ----
    // *Each rank adds 1 to its Damage Rating, to no more than your tier* - the number,
    // not only the note; R1's cap (D-1861).
    "shadow-bolt": { spell: { names: ["Shadow Bolt"], learn: true, damage: 1, cap: "tier" } },
    // *You know Immolate. Each rank adds 1 to the damage it deals at the start of the
    // target's turns, to no more than your tier* (D-775; R1, D-1861): the tick's number.
    "immolate": { spell: { names: ["Immolate"], learn: true }, tick: { spells: ["Immolate"], add: "rank", cap: "tier" } },
    // *If you have spent Health since the start of your last turn…* Nothing
    // records it, so the line is the table's (D2 §12).
    "devastation": { damage: damage(["fel", "fire", "shadow"], "spell", { when: "judgement" }) },
    // *Each rank adds 1 to its Damage Rating, or 2 against a target burning from Immolate,
    // to no more than your tier* (the class talent audit, D-1891). MY READING, for the lead:
    // the cap holds the ranks counted at the tier, and 07's Immolate doubles the whole Rating
    // the talent's part included - so 1 a counted rank, or 2 against Immolate, as printed.
    "conflagrate": {
      spell: { names: ["Conflagrate"], learn: true, damage: 1, cap: "tier" },
      reason: "the rank rides the Rating before the Conflagrate casting workflow doubles it against Immolate; GM queries consume the recorded Sustains and apply damage once"
    },
    // **RUIN** (the class talent audit, D-1891; Classic's Ruin raised critical damage):
    // *When your Casting Test against a creature's Defense shows a natural 19 or 20, the
    // spell deals additional damage equal to your tier per rank* - read off the cast's own
    // die where its DC was a creature's Defense (`ruinFor`, `castSpell`'s `ruinAdd`).
    "ruin": { onNatural: { faces: [19, 20], damage: "tier*rank", vsDefense: true } },
    // **R7** (the class talent audit, D-1865, D-1891): *After a Casting Test you make meets
    // or exceeds SL 2, your next spell may cost a Half-Action rather than an action. You may
    // use this once a round, and a number of times each encounter equal to your rank* - the
    // rung laid on SL 2, once a round on the round's record and counted an encounter.
    "backdraft": { grants: counter("rank", "encounter"), nextSpell: { cast: "half", on: "casting", sl: 2, turn: false, perRound: true } },
    // *You know Curse of Doom and Chaos Bolt. Each rank adds 2 to the damage Chaos Bolt
    // deals* (D-775; the class talent audit's C11, D-1891): the row moved to branch tier 4
    // and teaches 07's Prerequisite with it. A talent-taught spell casts whatever the tier
    // (the lead's reversal of R3: *"The spells can be cast if talents give them, they
    // shouldn't be blocked"*).
    "chaos-bolt": { spell: { names: ["Curse of Doom", "Chaos Bolt"], learn: true, damage: 2, damageNames: ["Chaos Bolt"] } },
    // *A spell of yours that reduces a target to 0 Health returns 3 Mana per rank
    // to you* (D-775): a kill row (D-772), a spell's alone.
    "shadowburn": { kill: { spell: true, gain: { pool: "mana", amount: "3*rank" } } },
    // *Your Fire and Fel spells cost 2 less Mana, to a minimum of 2* (D-775).
    "emberstorm": { spellCost: { schools: ["fire", "fel"], less: 2, min: 2 } },
    // *When you cast a Fire spell you may have it deal Fel damage instead. A spell
    // cast this way adds your rank to its damage against anything not Immune
    // (Fel)* (D-775): a line on the Fire spell's own dialog, unticked.
    "fel-fire": { spell: { schools: ["fire"] }, castLine: { convert: { from: ["fire"], to: "fel" }, add: "rank" } },
    // *Once per Short Rest, spend Health equal to twice your tier. Your next spell
    // this turn counts its Casting Test as reaching SL 3 and adds your tier to its
    // damage* (D-775): the Health paid at the Use, the promise the next spell's.
    "soul-fire": { grants: grant({ action: null, uses: once("short") }), onUse: { soulFire: { health: "2*tier", sl: 3, damage: "tier" } } },
    // **SHADOWFURY** (the class talent audit, C1 and C11, D-1891; it was Cataclysm): *Once
    // per Short Rest, as a Half-Action, spend Health equal to twice your tier. Each creature
    // you choose in a 10-foot radius within 60 feet takes Shadow damage equal to twice your
    // tier and makes a Body Resilience Test against your Spell DC. On a failure it is Stunned
    // until the end of its next turn.* The Health is judged before anything is paid and
    // paid with the Use, never below 1 (05, *Spending Health*; Soul Fire's door through
    // `onUse.payHealth`); the damage and the Resist ride the card as Hurricane's do, a
    // failure laying the Stun at once (`onFail`), until the end of the CREATURE's next turn.
    "shadowfury": {
      grants: grant({
        action: "half", uses: once("short"), area: "A 10 ft radius within 60 ft", who: "creature",
        damage: { amount: "2*tier", type: "shadow" }, resist: "body",
        inflicts: [{ condition: "stunned", value: null, until: "targetTurnEnd", onFail: true }]
      }),
      onUse: { payHealth: "2*tier" }
    }
  },
  druid: {
    // *You know Celestial Alignment. Its duration is 2 minutes, and while it
    // runs your Arcane and Nature spells ignore 2 Ward* (D-771). The span
    // replaces 07's minute on the card and the laid effect; the Ward is
    // ignored while the spell's own laid effect stands on the druid, read by
    // `AzerothActor#spellWardPierce` at the cast and at a tick of theirs.
    // **CELESTIAL FOCUS** (the class talent audit, C1 and R7, D-1892; it was Celestial
    // Alignment): *When a spell of yours takes Eclipse's bonus, it adds your tier rather than
    // your rank. Once per encounter, that spell may cost a Half-Action rather than an
    // action.* Eclipse's amount restated (`alternateFor` reads `alternateAmount`), and the
    // rung a cast-dialog line through `castAsFor` (`eclipse: true`: only a cast that takes
    // the bonus), counted on the encounter counter the talent grants.
    "celestial-focus": {
      alternateAmount: "tier",
      grants: counter(1, "encounter"),
      castAs: { action: "half", from: "action", eclipse: true, counted: true, perRound: 1 }
    },
    // *You know Insect Swarm. Each rank adds 5 feet to its radius* (the class talent audit's
    // Tune, D-1892): the radius widened (`spellAreaFor`'s `widen`, at the rank).
    "insect-swarm": { spell: { names: ["Insect Swarm"], learn: true, widen: "5*rank" } },
    // *Each rank adds 1 to the damage it deals at the start of the target's
    // turns* (D-771): the TICK's number, stamped at the cast (D-770).
    "moonfire": { spell: { names: ["Moonfire"], learn: true }, tick: { spells: ["Moonfire"], add: "rank" } },
    // *Each rank adds 1 to the Health it restores each turn* (D-771).
    // R1 (D-1861, D-1892): *to no more than your tier*.
    "rejuvenation": { spell: { names: ["Rejuvenation"], learn: true }, tick: { spells: ["Rejuvenation"], add: "rank", cap: "tier" } },
    // The caster-turn chooser delivers the talent's two distinct targets
    // (`effects/starfall-use.mjs`, `rules/starfall.mjs#starfallTargetLimit`'s
    // `talentRank`), and since the spell audit made Starweave a timed minute
    // (D-1705) its own second target rides the same chooser through the link its
    // Region records (`rules/starweave.mjs`, D-1710). Nothing is left to the table.
    "starfall": { spell: { names: ["Starfall"], learn: true } },
    // R1 (D-1861, D-1892): *to no more than your tier*.
    "starfire": { spell: { names: ["Starfire"], learn: true, damage: 1, cap: "tier" } },
    // *After a Casting Test you make meets or exceeds SL 2, your next spell
    // costs 1 less Mana per rank* (D-771): laid on the druid by the Test,
    // taken by the next cast's Mana.
    // **AND A CASTING FEATURE'S MANA** (D-779; the lead, 2026-10-03, on O-168: *"Yes
    // to both."*): `features` lets a class feature making a Casting Test take the
    // discount as a spell would (`casting.mjs#takeForFeature`).
    "natures-grace": { nextSpell: { amount: "rank", on: "casting", sl: 2, turn: false, features: true } },
    // *You know Tree of Life. Its radius is 40 feet, and every ally inside it
    // has AP 2 and Ward 2 against every school.* A FLOOR (D-755; the lead's
    // reading): at least AP 2 at each location the ally has and Ward 2 against
    // each school, while the druid carries the spell's laid effect - the druid
    // among them, since the caster counts as an ally (the lead, 2026-09-26).
    // The spell's own AP 4 and Ward 4 on the druid is O-143.
    // **HEART OF THE GROVE** (the class talent audit, C1, D-1892; it was Tree of Life, the
    // talent that taught the tier 5 spell): *While you are not in a Shapeshift form, each ally
    // within 30 feet of you, you included, who carries one of your ongoing healing effects has
    // 1 more Armor Point at every location and Ward 1 against every school, or 2 and 2 from
    // tier 4.* An aura (D-755's door): centred on the druid, reaching only an ally carrying a
    // heal over time this druid laid (`who.healTick`), ADDING Armor Points and Ward in every
    // school (`armor`, `ward`; amounts at the tier, `talentAurasFor`), and shut in a Shapeshift
    // form (`gate: "notForm"`). The druid is an ally (D-755), as the words say.
    "heart-of-the-grove": {
      aura: aura({
        feet: 30, gate: "notForm", armor: "1+min(1,max(0,tier-3))",
        ward: { schools: ["arcane", "fel", "fire", "frost", "holy", "nature", "shadow"], amount: "1+min(1,max(0,tier-3))" },
        who: { healTick: true }
      })
    },
    // *After a Long Rest, name a friendly target. Whenever either of you
    // restores Health, the other restores half as much, rounded down* (D-771).
    // The Use names the partner - the one creature the user has targeted - and
    // the bond holds until the next Long Rest; `rules/symbiosis.mjs` is the
    // law and `AzerothActor#applyHealing` the door. *Each of you gains a Boon
    // on a Skill Test in which the other holds the higher Skill Rank* is read
    // at each Test by effects/symbiosis-skills.mjs and shared roll preparation.
    "symbiosis": {
      grants: grant({ action: null, uses: once("long") }),
      onUse: { partner: true },
      shares: { heal: "half" },
      // This is a per-Test comparison, not a persistent aura effect.
      auraReason: "the Skill Boon compares live bonded partners' Skill Ranks within 30 feet in effects/symbiosis-skills.mjs and prepareRoll; unknown geometry remains the table's judgement"
    },
    "wrath": { spell: { names: ["Wrath"], learn: true, damage: 1 } },
    // *After you cast a Nature spell, your next Arcane spell adds your rank to
    // its damage. After you cast an Arcane spell, your next Nature spell adds
    // your rank to its damage* (D-771). `alternateCast` is the law; the state
    // is the druid's own flag, written by `castSpell`.
    "eclipse": { spell: { schools: ["nature", "arcane"] }, alternate: { schools: ["nature", "arcane"], amount: "rank" } },
    "force-of-nature": { grants: grant({ action: "action", cost: cost("mana", 6), summons: summons(["Treant"], 3) }) },
    // *Your Hurricane class feature also pushes everything in its area 10 feet
    // per rank. At rank 2 it knocks them Prone as well* (D-771). The Prone is a
    // condition button per target on Hurricane's card, beside its own Slowed.
    // **THE PUSH** (D-778; the lead, 2026-10-03, on O-158: *"Yes."* to *away from
    // the area's centre*): when the card's area is placed, every creature standing
    // in it is moved 10 feet a rank away from its centre through the
    // forced-movement door - a displacement, never metered and never an
    // Opportunity Attack (`pushFor`, `dice/chat.mjs#placeAreaFromCard`).
    "typhoon": {
      modifies: mod("Hurricane", { push: { feet: "10*rank", from: "area" }, atRank: [{ rank: 2, inflicts: [{ condition: "prone", value: null, until: null }] }] })
    },
    // *Once per Short Rest, spend a Half-Action. Until the end of your next
    // turn your attacks in a Shapeshift form cost 1 less Ferocity, to a minimum
    // of 1, and add your rank to their damage* (D-771). The Use lays ONE
    // effect until the end of the next turn: its `final` change on the FORM
    // lane (`damageBuffFor`, read by the attack door only in a Shapeshift form)
    // and its `riderDiscount` flag, which takes 1 off every fixed-price rider
    // in Ferocity (`rules/riders.mjs#discountedCost`; Rip's *all* is all,
    // D-770's law).
    "berserk": {
      grants: grant({ action: "half", uses: once("short") }),
      rider: { discount: { pool: "ferocity", amount: 1, min: 1 }, form: true },
      damage: damage(["all"], "attack", { until: "endOfNextTurn", form: true })
    },
    // *Your Shapeshift class feature may hold two Shapeshift forms at once,
    // merged into a single shape* (D-769): the chooser takes two, and
    // `rules/shapes.mjs#physicalHalf` merges them - the better of the two
    // blocks for any Test, the attacks of either.
    "chimera": { modifies: mod("Shapeshift", { picks: 2 }) },
    // **THREE RIDERS** (D-770; the lead: *"Lines on attack dialog"*). Each is a
    // line on the attack's own dialog in a Shapeshift form, paid when the
    // attack rolls. Feral Charge's *spend 2 Ferocity to move up to your Speed*
    // was a Use button of its own, which spent the pool onto a card the attack
    // never saw - the Finisher's fault (the lead's item 11) - and the sync
    // withdraws that feature now the row grants none.
    //
    // *On a hit the target gains Bleeding equal to your rank.*
    "mangle": { rider: rider("ferocity", 2, { form: true, onHit: { condition: "bleeding", value: "rank" } }) },
    // *Spend all your Ferocity. The target gains Bleeding equal to half the
    // Ferocity spent, rounded down, plus your rank.* MY READING (D-770), for the
    // lead: the Bleeding is the HIT's, as Mangle's says outright - a blow that
    // misses has touched no target to bleed.
    "rip": { rider: rider("ferocity", "all", { form: true, onHit: { condition: "bleeding", value: "floor(spent/2)+rank" } }) },
    // *Once a round, ... spend 2 Ferocity to move up to your Speed. At rank 2 a
    // hit also knocks the target Prone.* The move is a MOVEMENT ALLOWANCE - one
    // Move this turn that costs no Half-Action, D-712's door, the one Sprint
    // uses - granted when the attack rolls: the table walks the token, and the
    // walk is metered, provokes and enters areas as any walk does. A
    // displacement would carry the druid with none of that (D-769: *displace
    // meters 0 and reads as "put"*). **Either order** (the lead, 2026-10-03):
    // the Combat tab's control pays it BEFORE the blow on the druid's own turn,
    // and the next attack is the charge (`combat-actions.mjs#primeRider`).
    "feral-charge": { rider: rider("ferocity", 2, { once: "round", form: true, move: "speed", atRank: [{ rank: 2, onHit: { prone: true } }] }) },
    // *You begin each Shapeshift form with Ferocity equal to your tier. Your Avatar of the
    // Wild class feature costs a Half-Action* (the class talent audit, D-1892): the Ferocity
    // written by `documents/shapes.mjs#takeShape` in the shape's own update
    // (`shapeStartFor`), never above the pool's cap, and never lower than what is held.
    "heart-of-the-wild": { modifies: mod("Avatar of the Wild", { action: "half" }), shapeStart: { pool: "ferocity", amount: "tier", kinds: ["shapeshift"] }, spell: { schools: ["nature", "arcane"] } },
    // *Once a round, your Shapeshift class feature costs no action. At rank 2
    // you keep your Ferocity when changing from one Shapeshift form to
    // another.* INLINE, both ranks (D-771): `useFeature` reads rank 1 by name
    // (`rules/shapes.mjs#freeShift`, the round's record through the queued
    // `markRoundOnce`), and `takeShape` rank 2 (`keepsFerocity`, D-769). **And
    // leaving a form** (D-779; the lead, 2026-10-03, on O-167: *"Yes"*): the
    // Leave control takes the same round's allowance (`leaveCost`'s `savage`).
    "savage-shift": { automated: "inline" },
    // *Your Dreamwalk class feature may be entered for one hour rather than
    // eight, and restores Health equal to twice your tier to everyone resting
    // with you. You may use this a number of times equal to your rank per Long
    // Rest* (D-771). With the talent Dreamwalk has a Use: it counts the rank's
    // uses (D-768) and its card carries the heal, whose button reaches the
    // tokens the table selects - who rests with the druid, and the hour, are
    // the table's (D2 §12). Without it Dreamwalk stays the passive 02 prints.
    "dreamstate": { modifies: mod("Dreamwalk", { kind: "action", action: null, uses: uses("rank", "long"), heal: { add: "2*tier" } }) },
    // *Your Regrowth class feature restores a further amount equal to your
    // rank, and its lingering healing lasts one further turn per rank* (D-771):
    // the heal (D-768) and the tick's turns, both stamped at the rank.
    "improved-regrowth": { modifies: mod("Regrowth", { heal: { add: "rank" }, tickRounds: { add: "rank" } }) },
    // *As a Half-Action, end one of your ongoing healing effects on a friendly
    // target. That target immediately restores Health equal to twice your tier
    // plus your rank* (D-771). The Use asks for the one target the user has
    // targeted, refuses in words where it carries no heal over time this druid
    // laid - before anything is paid - and then ends it and heals at once,
    // through the GM's client where the druid does not own the target.
    "swiftmend": { grants: grant({ action: "half", heal: "2*tier+rank" }), onUse: { ends: "healTick" } },
    // *Every friendly target within 30 feet restores Health equal to twice your tier*: the
    // allies the Use measures (`who`; the lead: *"Measure the area"*), the druid among them
    // (D-755), each with a heal button of their own.
    "tranquillity": { grants: grant({ action: "full", cost: cost("mana", 10), heal: "2*tier", area: "Each ally within 30 ft", who: "ally" }) },
    // *On success, every friendly target within 20 feet restores Health equal
    // to your tier at the start of each of their turns for a number of rounds
    // equal to your rank* (D-771). A TICK laid by the card's Apply on each ally,
    // never a heal at the use - which is what the row used to do - and the allies
    // the Use measures (`who`; the lead: *"Measure the area"*), each with its own Apply.
    "wild-growth": { grants: grant({ action: "action", cost: cost("mana", 5), casting: true, tick: { kind: "heal", amount: "tier", rounds: "rank" }, area: "Each ally within 20 ft", who: "ally" }) },
    // Use counters and passives (D-648).
    // *A healing spell of yours costs a Half-Action rather than an action. You
    // may use this a number of times equal to your rank per Short Rest*
    // (D-771): a line on the cast's own dialog, spending a use of this counter.
    // **AND A FULL ACTION HEALING SPELL, AND A HEALING CLASS FEATURE** (D-779; the
    // lead, 2026-10-03, on O-168: *"Yes to both."*): a Full Action healing spell at a
    // Half-Action, and Regrowth or Mass Mend through the feature's own dialog.
    // **R7** (the class talent audit, D-1865, D-1892): *Once a round, a healing spell of yours
    // may cost a Half-Action rather than an action. You may use this a number of times each
    // encounter equal to your rank* - once a round on the round's record, counted on the
    // encounter counter the talent grants (`counted`).
    "natures-swiftness": { grants: counter("rank", "encounter"), castAs: { action: "half", from: ["action", "full"], healing: true, features: true, perRound: 1, counted: true } },
    // *While in a Shapeshift form, reduce the damage of one attack against you
    // by half, rounded down, and gain 1 Ferocity per rank* (D-771): the Use is
    // refused out of a Shapeshift form, lays the one-attack mark a Block and a
    // Parry ride (`mitigate`), and pays the Ferocity in.
    "survival-instincts": { grants: counter("tier", "short"), onUse: { requires: "shapeshift", mitigate: "halve", gain: { pool: "ferocity", amount: "rank" } } },
    // *Once per Short Rest, leaving a Shapeshift form costs no action, and your
    // next spell that turn costs 2 Mana less* (D-769's free leave; D-771's
    // discount, laid where the counter is spent and lapsing with the turn).
    "predators-swiftness": { grants: counter(1, "short"), nextSpell: { amount: 2, on: "swiftLeave", sl: null, turn: true } },
    "thick-hide": { passive: passive([add("system.ap.body", "rank"), add("system.ap.head", "rank"), add("system.ap.limb", "rank")], "form") },
    // *Your healing spells and features restore 1 further Health per rank to a
    // target suffering a condition* (D-771): read at the one healing door,
    // where the target's conditions are known. MY READING, for the lead: *your*
    // is every healing spell and feature the character holds, a second class's
    // included - D-768's open Holy Guidance question is the same one.
    "gift-of-nature": { heal: { add: "rank", when: "conditioned", via: ["spell", "feature"] } },
    // *Once during your turn, if an Attack Test you make in a Shapeshift form
    // meets or exceeds SL 2, gain 1 further Ferocity per rank* (D-771). A
    // further gain beside 05's, and so refused on an off-hand blow with it (06
    // §2: an off-hand attack builds none; MY READING, for the lead). **A hit that
    // gains nothing does not spend the once** (D-779; the lead, 2026-10-03, on
    // O-171: *"No."*): `momentum.mjs#furtherGains`, asked before the mark.
    "primal-fury": { momentum: { pool: "ferocity", amount: "rank", sl: 2, form: true, once: "turn" } },
    // *When you heal a friendly target to full Health, they gain temporary
    // Health equal to your tier per rank until the encounter ends* (D-771, D-777):
    // read at the one healing door, where the heal's own before and after are known.
    "living-seed": { tempHealth: { on: "healedToFull", amount: "tier*rank", span: "encounter" } },
    // *Your ongoing healing effects also grant Ward 1 per rank against Nature
    // or against Shadow, chosen when the effect begins* (D-771): every heal over
    // time this druid lays carries the Ward, the school asked of whoever lays
    // it at the Apply.
    "natures-ward": { tickWard: { amount: "rank", schools: ["nature", "shadow"] } },
    // *Your Arcane and Nature spells add 1 damage per rank against a target
    // that has taken Arcane or Nature damage from you since the start of your
    // last turn.* The damaged mark is the attacker's own flag; WHICH school
    // was dealt is not recorded, so the line comes checked and the table may
    // untick it.
    // **THE CLASS TALENT AUDIT** (D-1892): *Your Arcane and Nature spells ignore 1 Ward per
    // rank against a target that has taken Arcane or Nature damage from you since the start
    // of your last turn* - the damage lane gone, a Ward pierce gated on the TARGET's mark
    // (`wardPierceFor`'s `facts.lunarTarget`, `AzerothActor#spellWardPierceAt`).
    "lunar-guidance": { spell: { schools: ["arcane", "nature"], ignoresWard: { amount: "rank", schools: ["arcane", "nature"], whenTarget: "lunarTarget" } } },
    // *While in a Shapeshift form, your attacks add 1 damage per rank against
    // a target you are flanking.* The form is the actor's Shapeshift shape
    // (`AzerothActor#inShapeshiftForm`, D-769); flanking is the table's call
    // and is never auto-checked (D2 §12).
    "feral-instinct": { damage: damage(["all"], "attack", { when: "flanking", form: true }) },
    // *Your Moonfire deals 1 further damage per rank. At rank 2 it cannot be ended
    // by Dispel or similar effects.* The row named only the first sentence (O-157):
    // at rank 2 the effect Moonfire's card lays carries the mark, and 02's Dispel
    // lists it greyed in the talent's name (D-778; its reader went with the audit's rewrite below).
    // **AND ITS TICK** (D-779; the lead, 2026-10-03, on O-170: *"Yes."* to *does
    // the rank add to the tick as well?*): the rank rides Moonfire's hit and the
    // number its tick lands each turn, stamped at the cast (`tickBonusFor`).
    // **THE CLASS TALENT AUDIT** (D-1892; the front matter's wording; D-248's SL floor): *Your
    // Moonfire deals its damage at the start of the target's turns for 1 more round per rank.
    // At rank 2 Dispel and similar effects end it only on a Casting Test that meets or exceeds
    // SL 2* - the spell tick's count raised at the cast (`tick.rounds`, read by
    // `tickRoundsFor` where `castSpell` stamps the tick), and the gate on Moonfire alone.
    "improved-moonfire": { spell: { names: ["Moonfire"] }, tickRounds: { spells: ["Moonfire"], add: "rank" }, dispelGate: { sl: 2, minRank: 2, spells: ["Moonfire"] } }
  },
  // **THE CHROMATIC CHAMPION'S FORTY-EIGHT** (04's Life-Binder, Spell-Weaver, Timewalker and
  // Earth-Warder). Every *You know* talent of all four branches is a `spell` row through
  // `branchSpell`: learned while taken, paid in Rage and cast with Constitution
  // (`class-talents.mjs#spellPoolFor`), a rank's spell named in its `atRank` clause beside
  // the row's own (so `atRankOf` and `spellNamesAtRank` agree), a utility spell's free cast
  // once a Short Rest in `free` (`rules/free-casts.mjs`), and the Black branch's Void in
  // `void` (`castVoidFor`). Nothing here teaches a spell above tier 3
  // (`chromatic-champion-talents.test.mjs` holds the pack to it). Stage 3A builds the
  // Life-Binder's and the Earth-Warder's mechanics; the Spell-Weaver's and the Timewalker's
  // are stage 3B's, and their rows here carry only the spells they teach.
  "chromatic-champion": {
    // ---- Life-Binder ----
    // *You know Scorch and Blazing Speed. At rank 2 you also know Fire Ward. Once per Short
    // Rest you may cast Blazing Speed without paying Rage, and the same for Fire Ward.*
    "kindled-blood": {
      spell: branchSpell(["Scorch", "Blazing Speed"], {
        free: { names: ["Blazing Speed", "Fire Ward"], per: "shortRest" },
        atRank: [{ rank: 2, names: ["Scorch", "Blazing Speed", "Fire Ward"] }]
      })
    },
    // *When you cast a branch spell that deals Fire damage, you may split it. Work out the
    // damage it deals after Armor Points and Ward. Its target takes half of that, rounded
    // down, and one creature within the spell's range, you included, regains Health equal
    // to the other half plus your Constitution modifier.* A line on the cast's own dialog,
    // the creature chosen before anything is paid (`castSpell`, `rules/chromatic-talents.mjs
    // #lifebinderSplit`).
    // *... or your Breath or Chromatic Breath deals Fire damage ... A Breath splits the damage of
    // every creature it strikes, adds the other halves together, and heals a creature within 30
    // feet* (the lead, 2026-11-09; D-845): the two class features, asked
    // through the one chooser once the school is Fire and the cone is aimed
    // (`workflows.mjs#breathSplitPick`), and the 30 feet (MY READING, for the lead).
    "lifebinders-flame": { lifebinder: { split: true, breath: { features: ["Breath", "Chromatic Breath"], feet: 30 } } },
    // *Your weapon attacks may deal Fire damage instead of their own type. When one of them
    // reaches SL 2, the target is Scorched. At rank 2 this happens at SL 1, and at rank 3 on
    // any hit.* The swap is a line on the attack's dialog (`convert {to, attack}`); the
    // Scorched lands with the blow (`hitLays`, read at its rank).
    "ember-strikes": {
      castLine: { convert: { to: "fire", attack: true } },
      hitLays: { sl: 2, condition: "scorched", value: null, atRank: [{ rank: 2, sl: 1 }, { rank: 3, sl: 0 }] }
    },
    // *A creature you heal with Lifebinder's Flame regains 1 more Health per rank.*
    "rekindle": { lifebinder: { add: "rank" } },
    // *You know Kindle and Immolation. Once per Short Rest you may cast Kindle without paying
    // Rage. Your Immolation deals no damage. Instead, each ally that starts its turn within 5
    // feet of you regains Health equal to the spell's damage.* The caster's own copy of the
    // tick, rewritten at the cast (`hearthfireTick`).
    "hearthfire": {
      spell: branchSpell(["Kindle", "Immolation"], { free: { names: ["Kindle"], per: "shortRest" } }),
      hearthfire: { spell: "Immolation" }
    },
    // *When you heal a creature with Lifebinder's Flame, it loses 1 Undeath Corruption. At
    // rank 2 its Bleeding also ends.*
    "cleansing-fire": { lifebinder: { cleanse: { undeath: 1, bleedingAt: 2 } } },
    // *You know Emberlash and Purging Flame. At rank 2 you also know Cinderburst.*
    "dragonfire": {
      spell: branchSpell(["Emberlash", "Purging Flame"], { atRank: [{ rank: 2, names: ["Emberlash", "Purging Flame", "Cinderburst"] }] })
    },
    // *As a Reaction when an ally within 30 feet drops below half Health, spend 3 Rage. It
    // regains Health equal to your tier plus your rank.* A Use the blow offers on a card
    // row shown to the holder's owner (`effects/chromatic-talents.mjs#offerLifeblood`, D-779),
    // judged at the press: a friendly creature within 30 feet, below half Health.
    "lifeblood": {
      grants: grant({ action: "reaction", cost: cost("rage", 3), heal: "tier+rank" }),
      onUse: { aim: { feet: 30, friendly: true }, belowHalf: true },
      lifeblood: { feet: 30, below: 0.5 }
    },
    // *When you heal a creature with a branch spell or talent, gain 1 Rage.* Read at the one
    // healing door, for a heal the door is told is a branch heal.
    "kindling-heart": { kindling: { gain: { pool: "rage", amount: 1 } } },
    // *You know Smolder and Firebreak. Each tick of your Smolder may be split as Lifebinder's
    // Flame splits a spell.* The split chosen at the cast rides the tick it stamps.
    "smoldering-life": {
      spell: branchSpell(["Smolder", "Firebreak"]),
      lifebinder: { ticks: ["Smolder"] }
    },
    // *Lifebinder's Flame may divide its heal between two creatures within range. At rank 2
    // it may divide it between three.*
    "pyre-of-renewal": { lifebinder: { divide: 2, atRank: [{ rank: 2, divide: 3 }] } },
    // *In it your Breath deals Fire damage, and every heal you give with Lifebinder's Flame
    // also heals you for your tier.*
    "red-drake": {
      grants: grant({ action: "half" }),
      modifies: mod("Breath", { inForm: { form: "Red Drake", school: "fire" } }),
      lifebinder: { self: "tier", form: "Red Drake" }
    },
    // ---- Spell-Weaver (stage 3B) ----
    // *You know Frostbite and Arcane Explosion. At rank 2 you also know Blizzard.*
    "arcane-blood": {
      spell: branchSpell(["Frostbite", "Arcane Explosion"], { atRank: [{ rank: 2, names: ["Frostbite", "Arcane Explosion", "Blizzard"] }] })
    },
    // *As a Half-Action, spend any amount of Rage. One ally within 30 feet regains that much
    // Mana, to no more than its maximum. At rank 2 it regains 1 more.* A Use at the ally
    // targeted, the amount picked through the one chooser before anything is paid, the Mana
    // landed through `effects/gifts.mjs#giveMana`'s Rage branch (`fontOfMagicFor`).
    "font-of-magic": {
      grants: grant({ action: "half" }),
      onUse: { font: true, aim: { feet: 30, friendly: true } },
      font: { feet: 30, add: 0, atRank: [{ rank: 2, add: 1 }] }
    },
    // *Once a round, when a creature within 30 feet of you casts a spell, gain 1 Rage. At
    // rank 2, gain 2.* Read at `castSpell` once the cast is paid for, on the active GM's
    // client, the round's once on the holder's round record (`manaHungerFor`).
    "mana-hunger": { manaHunger: { feet: 30, gain: 1, atRank: [{ rank: 2, gain: 2 }] } },
    // *You know Detect Magic, Dampen Magic and Arcane Intellect. Once per Short Rest you may
    // cast each of them without paying Rage.*
    "weavers-sight": {
      spell: branchSpell(["Detect Magic", "Dampen Magic", "Arcane Intellect"], {
        free: { names: ["Detect Magic", "Dampen Magic", "Arcane Intellect"], per: "shortRest" }
      })
    },
    // *As a Full Action, end one Sustained spell that a creature within 30 feet is
    // sustaining. Gain Rage equal to twice your rank.* A Use at the creature targeted, the
    // Sustain picked through the one chooser, ended through `workflows.endSustain` - on the
    // GM's client through `CONFIG.queries` where this one does not own the creature.
    "spellbreak": {
      grants: grant({ action: "full" }),
      onUse: { spellbreak: { feet: 30 } }
    },
    // *Your attacks against a Slowed or Entangled creature deal 1 more damage per rank.*
    "frozen-grip": { damage: damage(["all"], "attack", { when: { targetHas: ["slowed", "entangled"] } }) },
    // *You know Nullify and Rimeshard. At rank 2 you also know Chilblain.*
    "deep-weave": {
      spell: branchSpell(["Nullify", "Rimeshard"], { atRank: [{ rank: 2, names: ["Nullify", "Rimeshard", "Chilblain"] }] })
    },
    // *As a Reaction when an enemy within 60 feet that you can see casts a spell, spend Rage
    // equal to that spell's tier plus 2. The caster makes a Spirit Resilience Test against
    // your Spell DC. On a failure the spell fails and its Mana is spent. At rank 2 the Test
    // takes a Bane.* Asked IN the cast, after its payment and before its Casting Test lands
    // (D-777's door for what another creature does to an event in flight), of whoever
    // answers for the holder of whom the caster is an enemy (the lead, 2026-11-08: *"Enemies
    // only"*, the one reading Paradox uses); seeing the caster is the table's, and the
    // question says so (`effects/chromatic-reactions.mjs#askDisruptWeave`).
    "disrupt-weave": {
      disruptWeave:{ feet: 60, resilience: "spirit", banes: 0, atRank: [{ rank: 2, banes: 1 }] }
    },
    // *Font of Magic gives 1 more Mana per rank.*
    "overflow": { font: { add: "rank" } },
    // *You know Unweave and Manafount.*
    "unraveller": { spell: branchSpell(["Unweave", "Manafount"]) },
    // *When Spellbreak or Unweave ends a spell effect, gain Rage equal to your tier. At rank 2
    // one ally within 30 feet also regains 2 Mana.*
    "spellthief": { spellthief: { gain: "tier", allyMana: 0, feet: 30, atRank: [{ rank: 2, allyMana: 2 }] } },
    // *In it your Breath deals Frost damage, and each ally within 30 feet regains 1 Mana
    // at the start of each of your turns.* The Mana on the active GM's client as the drake's
    // turn starts (`AzerothCombat#_onStartTurn`, `blueDrakeTurnFor`).
    "blue-drake": {
      grants: grant({ action: "half" }),
      modifies: mod("Breath", { inForm: { form: "Blue Drake", school: "frost" } }),
      turnStart: { form: "Blue Drake", allyMana: 1, feet: 30 }
    },
    // ---- Timewalker (stage 3B) ----
    // *You know Slow and Displacement. At rank 2 you also know Ley Snare. Once per Short Rest
    // you may cast Displacement without paying Rage.*
    "sands-of-time": {
      spell: branchSpell(["Slow", "Displacement"], {
        free: { names: ["Displacement"], per: "shortRest" },
        atRank: [{ rank: 2, names: ["Slow", "Displacement", "Ley Snare"] }]
      })
    },
    // *Your Initiative rises by 1 per rank. At rank 2 you cannot be surprised.* A flat
    // passive on the derived Initiative, `final` because the number is derived; rank 2 is
    // the table's, since nothing in the system declares a creature surprised.
    "glimpse-ahead": {
      passive: passive([add("system.initiative", "rank")]),
      reason: "rank 2's *you cannot be surprised*: surprise is the table's call (D2 §12), and no door in the system declares a creature surprised"
    },
    // *When one of your attacks hits a Slowed creature, gain 1 Rage. At rank 2, gain 2.*
    "temporal-drag": { momentum: { pool: "rage", amount: "rank", when: { targetHas: ["slowed"] } } },
    // *Once per encounter, as a Half-Action, spend 5 Rage. One ally within 30 feet gains a
    // Half-Action on its next turn. At rank 2 it costs 3 Rage.* (the lead: *"Change Hasten to
    // once per encounter"*). The Half-Action waits on the creature as an effect and is given
    // as its next turn starts (`AzerothCombat#_onStartTurn`, the door 02's Bloodlust shares).
    "hasten": {
      grants: grant({ action: "half", cost: cost("rage", 5), uses: uses(1, "encounter"), atRank: [{ rank: 2, cost: cost("rage", 3) }] }),
      onUse: { hasten: true },
      hasten: { feet: 30 }
    },
    // *Once per Short Rest, when you fail a Test, roll it again and take the new result.*
    // Offered on the roller's own client after the die and before anything follows from it
    // (the seam 02's Elune's Regard takes), its use struck on the counter.
    "time-lapse": { grants: counter(1, "short"), timeLapse: true },
    // *A creature you have Slowed takes a Bane on Attack Tests against you. At rank 2 the Bane
    // applies to its Attack Tests against anyone. At rank 3 it also has no Reaction.* Read off
    // who laid the attacker's Slowed (the condition's own `laidBy`): an automatic line on the
    // attack's dialog, and at rank 3 the one Reaction gate (`rules/reaction-bar.mjs`).
    "weight-of-ages": { weightOfAges: { against: "you", atRank: [{ rank: 2, against: "anyone" }, { rank: 3, noReaction: true }] } },
    // *You know Translocate. At rank 2 you also know Ley Rift. Once per Short Rest you may
    // cast Translocate without paying Rage.*
    "fold-space": {
      spell: branchSpell(["Translocate"], {
        free: { names: ["Translocate"], per: "shortRest" },
        atRank: [{ rank: 2, names: ["Translocate", "Ley Rift"] }]
      })
    },
    // *Once per Short Rest, as a Reaction when an ally within 30 feet takes damage, spend 2
    // Rage. It regains half the Health that blow took, rounded up. At rank 2 it regains all
    // of it.* Offered on a card row from the one damage door to the holder's owner (D-779),
    // the blow's Health read off that offer's own record (`effects/chromatic-talents.mjs
    // #offerRewind`), and judged again at the press through the granted feature's own door.
    "rewind": {
      grants: grant({ action: "reaction", cost: cost("rage", 2), uses: uses(1, "short") }),
      onUse: { rewind: true },
      rewind: { feet: 30, whole: false, atRank: [{ rank: 2, whole: true }] }
    },
    // *Hasten may target you. At rank 2 the creature you Hasten also gains 10 feet of Speed
    // until the end of its next turn.* Read with Hasten (`hastenFor`); the Speed a laid
    // `final` change spanned to the creature's next turn's end, or a round of the world's
    // clock out of a fight (D-778).
    "borrowed-moment": { hasten: { self: true, speed: 0, atRank: [{ rank: 2, speed: 10 }] } },
    // *You know Arcane Anchor. A creature that starts its turn inside your Arcane Anchor must
    // pass a Spirit Resilience Test against your Spell DC or be Entangled while it stays
    // there.* The Champion's own copy of the spell's tick, a check added at the cast
    // (`anchorTick`): the area's start-of-turn Test (`AzerothCombat#_areaTicks`), its
    // Entangled ended by leaving the area - or by A1's own way out, an action and a Reflex
    // Resilience Test at *the DC the source names*, which the lead ruled is the *"Champion's
    // Spell DC"* (2026-11-08; the 3B review, M2): D-778's escape on the condition's effect.
    "anchor-of-ages": {
      spell: branchSpell(["Arcane Anchor"]),
      anchor: { spell: "Arcane Anchor", resilience: "spirit", condition: "entangled", escape: { on: "action", resilience: "reflex", dc: "spellDc" } }
    },
    // *As a Reaction when an enemy within 60 feet makes an Attack Test or a Casting Test, it
    // rolls twice and takes the lower. You may do this a number of times per Short Rest equal
    // to your rank.* Asked IN the enemy's Test, before its result is shown, of whoever answers
    // for the holder (`effects/chromatic-reactions.mjs#askParadox`); the counter's uses are
    // the rank's.
    "paradox": { grants: counter("rank", "short"), paradox: { feet: 60 } },
    // *In it your Breath deals Arcane damage and leaves each creature that fails its Test
    // Slowed until the end of its next turn. The turn you take the form, you gain a
    // Half-Action.*
    "bronze-drake": {
      grants: grant({ action: "half" }),
      modifies: mod("Breath", {
        inForm: { form: "Bronze Drake", school: "arcane", inflicts: [{ condition: "slowed", value: null, until: "endOfNextTurn", onFail: true }] }
      }),
      drakeHalf: { form: "Bronze Drake" }
    },
    // ---- Earth-Warder ----
    // *You know Lightning Bolt and Lightning Shield. At rank 2 you also know Stone Grip.*
    "stormblood": {
      spell: branchSpell(["Lightning Bolt", "Lightning Shield"], { atRank: [{ rank: 2, names: ["Lightning Bolt", "Lightning Shield", "Stone Grip"] }] })
    },
    // *Once per Long Rest, take the guise of one particular humanoid you have studied for an
    // hour, its face and voice included. Arcana and Investigation Tests to see through it take
    // a Bane. At rank 2 you may do this twice per Long Rest.* A Use at the humanoid targeted,
    // its appearance swapped onto the Champion and restored when the effect goes
    // (`effects/chromatic-talents.mjs#takeCourtGuise`); the Bane an automatic line on a Test
    // of those skills at a creature wearing one (`roll-dialog.mjs#prepareRoll`).
    "court-guise": {
      grants: grant({ action: null, uses: uses("rank", "long") }),
      onUse: { courtGuise: true },
      courtGuise: { boons: 0 }
    },
    // *While you wear a Court Guise, your Deception and Persuasion Tests gain a Boon. At rank 2
    // a creature that sees through your Court Guise does not learn your true form; it knows
    // only that something about you is unusual.* (the lead, 2026-11-08: *"reword the talent on
    // number 5 to only work with the court guise"*). An automatic line while a Court Guise
    // effect is worn, never the mortal guise (`silverTongueFor`); rank 2 is what the GM says,
    // and stays the table's.
    "silver-tongue": {
      silverTongue: { skills: ["deception", "persuasion"], boons: 1 },
      reason: "rank 2's *does not learn your true form* is what the GM tells a creature that sees through the Court Guise: the table's (D2 §12)"
    },
    // *When an attack or a branch spell of yours deals damage, spend up to your tier in Void
    // Corruption. The blow deals 1 more damage per rank for each Void Corruption spent.* A
    // line on the attack's dialog (a rider paid in the Void track, `cap` the tier, paid on
    // the hit) and on a branch spell's (`castSpell`), what a spend lands read by
    // `voidSpendFor`.
    "void-surge": {
      rider: { ...rider("void", "all", { pays: "hit" }), cap: "tier" },
      voidSpend: { surge: "rank", cap: "tier" }
    },
    // *As a Half-Action, spend 3 Rage. Your next attack this turn cannot be met with a Parry
    // or a Block. At rank 2 it also gains a Boon.* The next attack's promise
    // (`rules/next-attack.mjs`'s `unanswerable`), read by the attack's card and the press.
    "false-opening": {
      grants: grant({ action: "half", cost: cost("rage", 3) }),
      onUse: {
        nextAttack: { unanswerable: true, lasts: "turn" },
        atRank: [{ rank: 2, nextAttack: { unanswerable: true, boons: 1, lasts: "turn" } }]
      }
    },
    // *When you hit a creature with a weapon attack, your next branch spell to damage that
    // creature before the end of your next turn deals 1 more damage per rank.*
    "charged-steel": { chargedSteel: { amount: "rank" } },
    // *You know Thunderlash and Earthmeld. At rank 2 you also know Earthen Spike. Once per
    // Short Rest you may cast Earthmeld without paying Rage. Each time you cast one of these
    // tier 2 spells, you gain 1 Void Corruption.*
    "earth-warders-craft": {
      spell: branchSpell(["Thunderlash", "Earthmeld"], {
        free: { names: ["Earthmeld"], per: "shortRest" },
        void: 1,
        atRank: [{ rank: 2, names: ["Thunderlash", "Earthmeld", "Earthen Spike"] }]
      })
    },
    // *As a Half-Action, gain 4 Void Corruption. A humanoid within 30 feet that fails a Spirit
    // Resilience Test against your Spell DC is Charmed until the end of your next turn.* No
    // Rage (the lead: *"Rework this to not cost rage"*), the Void gained whatever the Test
    // comes to (*"yes"*); the Charmed lands on a failure, held to the Champion's next turn.
    "whisper-of-madness": {
      grants: grant({
        action: "half", resist: "spirit",
        inflicts: [{ condition: "charmed", value: null, until: "casterTurnEnd", onFail: true }]
      }),
      onUse: { aim: { feet: 30, kinds: ["humanoid"] }, voidGain: 4 }
    },
    // *Each Void Corruption you spend gives you 1 temporary Health per rank.*
    "obsidian-skin": { voidSpend: { tempHealth: "rank" } },
    // *You know Shattering Bolt. Each time you cast it, you gain 2 Void Corruption.*
    "deathwings-malice": { spell: branchSpell(["Shattering Bolt"], { void: 2 }) },
    // *When you spend 3 or more Void Corruption on one blow, the target is knocked Prone. At
    // rank 2, if the blow reached SL 2, it is also Stunned.*
    "earthshatter": { voidSpend: { prone: 3, stun: { rank: 2, sl: 2 } } },
    // *In it your Breath deals Nature damage, Void Surge adds 1 more damage per Void spent,
    // and when you land from flight each creature within 10 feet must pass a Reflex
    // Resilience Test against your Spell DC or be knocked Prone.*
    "black-drake": {
      grants: grant({ action: "half" }),
      modifies: mod("Breath", { inForm: { form: "Black Drake", school: "nature" } }),
      voidSpend: { add: 1, form: "Black Drake" },
      // The landing: a token in the form whose elevation comes down to the ground, read on
      // the active GM's client (`effects/chromatic-talents.mjs#blackDrakeLanding`).
      landing: { form: "Black Drake", feet: 10, resilience: "reflex", condition: "prone" }
    }
  },
  // THE CHRONOMANCER (D-847; stage 2b, D-870 to D-877). 04's Shifting Sands and
  // Chronoweaver, every talent a row and every row a door with a caller - the lead: *"We
  // need automation and animations fully complete for everything"*. The law is
  // `rules/chronomancer.mjs`; the Use doors are `workflows.mjs#judgeChronoUse` and
  // `#landChronoUse`, the writes `effects/chronomancer.mjs`; Guardian of Time's twelve (stage
  // 2c) read `rules/guardian.mjs` and `rules/echoes.mjs` and write through
  // `effects/guardian.mjs`. A spell a talent teaches is the Chronomancer's to cast whatever its
  // Restricted line says (D-852): the sync embeds by name and the cast takes the class's
  // own Casting Test and Spell DC (`casting.mjs#grantingClass`).
  chronomancer: {
    // ---- Shifting Sands ----
    // *As you make a Casting Test, before you roll, you may spend Sand, up to twice your
    // rank, on one of two things: 1 more damage for each Sand, or 1 more SL for each 2 Sand.
    // Choose one; the Sand cannot be split between them.* Lines on the cast's own dialog,
    // unticked and priced (`chronomancer.mjs#gritLines`), one taken (`gritPicked`), paid
    // with the cast (`castSpell`).
    "grit-of-ages": { grit: { damage: 1, sl: 2, cap: 2 } },
    // *A creature carrying your Decay takes a Bane on Reflex Resilience Tests against your
    // spells. At rank 2 it cannot Disengage.* A Bane on the Resist off the caster's talents
    // and the Decay's own `by` (`dice/chat.mjs#rollResists`), and the Disengage refused at
    // the one Disengage door (`effects/chronomancer.mjs#disengageBarred`).
    "heavy-hours": { heavyHours: { banes: 1, atRank: [{ rank: 2, noDisengage: true }] } },
    // *When a spell of yours damages a Slowed or Entangled creature, gain 1 Sand, once a cast.*
    "dragging-sands": { dragging: { gain: 1, conditions: ["slowed", "entangled"] } },
    // *When a spell of yours damages a creature, you may spend 2 Sand. At the start of your
    // next turn that creature takes half the damage it took, rounded down, again. At rank 2
    // it takes all of it again.* A line on the cast's dialog (`echoingSandsLine`), the Sand
    // paid where the spell hits; the first creature its card's Apply damages takes it again
    // at the caster's next turn start, after Armor Points and never reduced a second time
    // (D-858's reading; `effects/chronomancer.mjs#landAgain`).
    "echoing-sands": { echoing: { sand: 2, whole: false, atRank: [{ rank: 2, whole: true }] } },
    // *Once per Short Rest, when a creature you have Slowed fails a Resilience Test against a
    // spell of yours, it is also Stunned until the end of its next turn. At rank 2, twice per
    // Short Rest.* The counter's uses, struck where the failed Resist lays the Stun.
    "arrested-moment": {
      grants: grant({ action: null, uses: uses("rank", "short") }),
      arrested: { condition: "stunned" }
    },
    // *When a spell of yours lays Decay on a creature, that Decay is 1 higher. At rank 2 your
    // Decay adds to any Decay the creature already carries, to no more than your tier.*
    "erosion": { decay: { more: 1, adds: true, capTier: true, atRank: 2 } },
    // *Your Sandstorm's radius is 5 feet larger. At rank 2, as you cast it you may spend Sand,
    // and each Sand adds 5 feet more.* The widened area through `spellAreaFor`, and rank 2's
    // Sand lines on the dialog (`stormLines`).
    "storm-of-ages": {
      spell: { names: ["Sandstorm"], widen: 5 },
      storm: { spell: "Sandstorm", perSand: 5, spend: false, atRank: [{ rank: 2, spend: true }] }
    },
    // *Your Withering Sands deals 1 more damage per rank. At rank 2 or higher, a creature
    // inside its area regains only half the Health any healing gives it, rounded down.*
    "withering-hours": {
      spell: { names: ["Withering Sands"], damage: 1 },
      withering: { spell: "Withering Sands", halves: false, atRank: [{ rank: 2, halves: true }] }
    },
    // *As a Reaction when a creature you can see within 60 feet ends a move, spend 2 Sand. It
    // makes a Spirit Resilience Test against your Spell DC. On a failure it returns to the
    // space it started that move from.* Offered on a card when an enemy's move ends
    // (`effects/chronomancer.mjs#offerTemporalLoop`), pressed through the granted feature.
    "temporal-loop": {
      grants: grant({ action: "reaction", cost: cost("sand", 2), resist: "spirit" }),
      onUse: { temporalLoop: true },
      loop: { feet: 60, sand: 2 }
    },
    // *You know Stasis, and your Stasis needs no Arcane Anchor: any targets within its range
    // may be held. You may cast it for 5 Sand in place of its Mana.*
    "stasis-lore": { spell: { names: ["Stasis"], learn: true, noPrerequisite: ["Stasis"], sandCast: { cost: 5, names: ["Stasis"], succeeds: [] } } },
    // *Once per encounter, as a Half-Action, spend all your Sand, at least 3. Each creature
    // within 60 feet that you have Slowed or that carries your Decay takes Physical damage
    // equal to your tier plus the Sand spent. At rank 2, twice your tier plus the Sand spent.*
    "collapse-of-hours": {
      grants: grant({ action: "half", uses: uses(1, "encounter") }),
      onUse: { collapse: { feet: 60, least: 3, twice: false, atRank: [{ rank: 2, twice: true }] } }
    },
    // *You know Halt. You may cast it for 5 Sand in place of its Mana, and when you do, its
    // Casting Test succeeds.*
    "halt-the-sands": { spell: { names: ["Halt"], learn: true, sandCast: { cost: 5, names: ["Halt"], succeeds: ["Halt"] } } },
    // ---- Chronoweaver ----
    // *As a Half-Action, spend 2 Sand. One ally within 30 feet gains a Boon on its next Test
    // before the end of its next turn. At rank 2 it also gains 10 feet of Speed until the end
    // of its next turn.*
    "gift-of-moments": {
      grants: grant({ action: "half", cost: cost("sand", 2) }),
      onUse: { gift: { feet: 30, boons: 1, speed: 0, atRank: [{ rank: 2, speed: 10 }] } }
    },
    // *As a Half-Action, spend 1 Sand. One willing ally within 30 feet moves up to 10 feet per
    // rank at once, without provoking Opportunity Attacks.* The ally's space picked before
    // the Sand is paid, then the step door's displacement (`effects/steps.mjs`).
    "quickstep": {
      grants: grant({ action: "half", cost: cost("sand", 1) }),
      onUse: { quickstep: { feet: 30, per: 10 } }
    },
    // *When a spell or talent of yours gives an ally Health, a Boon, a Half-Action or a
    // Reaction, gain 1 Sand. At rank 2, gain 2. You may gain Sand this way a number of times
    // per Long Rest equal to your Intelligence modifier.*
    "shared-hours": {
      grants: counter("int", "long"),
      shared: { gain: 1, atRank: [{ rank: 2, gain: 2 }] }
    },
    // *As a Half-Action, spend 3 Sand. An ally within 30 feet gains an extra Reaction, which it
    // may use until the end of its next turn. At rank 2 it costs 2 Sand.* The combatant's own
    // queued door (`AzerothCombatant#giveReaction`).
    "second-chance": {
      grants: grant({ action: "half", cost: cost("sand", 3), atRank: [{ rank: 2, cost: cost("sand", 2) }] }),
      onUse: { secondChance: { feet: 30 } }
    },
    // *As a Reaction when an ally within 90 feet gains a condition, spend 2 Sand. The condition
    // ends, and the ally cannot gain it again until the end of its next turn. You may do this a
    // number of times per encounter equal to your rank.*
    "unfading": {
      grants: grant({ action: "reaction", cost: cost("sand", 2), uses: uses("rank", "encounter") }),
      onUse: { unfading: true },
      unfading: { feet: 90, sand: 2 }
    },
    // *Your Slipstream reaches 60 feet. At rank 2 it costs 2 Mana.*
    "swift-current": {
      modifies: mod("Slipstream", { atRank: [{ rank: 2, cost: { delta: -2 } }] }),
      slipstream: { feet: 60, atRank: [{ rank: 2, mana: 2 }] }
    },
    // *As a Half-Action, spend 3 Sand. One ally within 30 feet regains up to 2 per rank of one
    // Momentum or Power pool it holds, other than Sand, to no more than its maximum.*
    "echo-of-power": {
      grants: grant({ action: "half", cost: cost("sand", 3) }),
      onUse: { echoOfPower: { feet: 30, per: 2 } }
    },
    // *As a Half-Action, spend 2 Sand. Until the start of your next turn, the conditions on a
    // number of allies within 30 feet equal to your rank are suspended: they do nothing and do
    // not count down.*
    "suspended-moment": {
      grants: grant({ action: "half", cost: cost("sand", 2) }),
      onUse: { suspendedMoment: { feet: 30 } }
    },
    // *You may use Slipstream twice per encounter. At rank 2 it may target you.*
    "twinned-hours": {
      modifies: mod("Slipstream", { uses: { max: 2, per: "encounter" } }),
      slipstream: { uses: 2, atRank: [{ rank: 2, self: true }] }
    },
    // *You know Farstep and Aftersight. When you cast Farstep you may bring one willing
    // creature within 5 feet of you.*
    "weavers-lore": {
      spell: { names: ["Farstep", "Aftersight"], learn: true },
      companion: { spell: "Farstep", feet: 5, count: 1 }
    },
    // *Once per Short Rest, as a Half-Action, spend 4 Sand. A number of allies within 30 feet
    // equal to your rank each regain one spent use of a feature, talent or spell they may use
    // once per encounter or once per Short Rest.*
    "recovered-hours": {
      grants: grant({ action: "half", cost: cost("sand", 4), uses: uses(1, "short") }),
      onUse: { recover: { feet: 30, pers: ["encounter", "short"], self: false } }
    },
    // *Once per Long Rest, as an action, spend all your Sand, at least 3. Each ally within 60
    // feet, you included, regains one spent use of a feature, talent or spell other than this
    // one that it may use once per encounter, once per Short Rest or once per Long Rest, and
    // regains up to 3 of one Momentum or Power pool it holds.*
    "the-glass-turns-back": {
      grants: grant({ action: "action", uses: uses(1, "long") }),
      onUse: { glassTurnsBack: { feet: 60, least: 3, pers: ["encounter", "short", "long"], pool: 3 } }
    },
    // ---- Guardian of Time (stage 2c; the law is `rules/guardian.mjs`, the writes
    // `effects/guardian.mjs`) ----
    // *You may wear studded and mail armor and carry a shield.* (D-855): the Access Bane,
    // the creator's notes and the owned-item warnings read it (`armorAccessFor`).
    "bronzed-steel": { armorAccess: { categories: ["studded", "mail"], shields: true } },
    // *As a Half-Action, spend 2 Sand. A creature within 30 feet that can see you takes a
    // Bane, per rank, attacking anyone but you until the end of your next turn.* Taunt's
    // laid Bane, the one door (`effects/banes.mjs#layBane` through `useFeature`).
    "time-lock": {
      grants: grant({ action: "half", cost: cost("sand", 2) }),
      onUse: { laysBane: { kind: "attack", banes: "rank", except: "user", until: "userTurnEnd", feet: 30 } }
    },
    // *When you Block an attack, gain 1 Sand. At rank 2 you also gain 1 when an attack
    // against you misses. At rank 3 a Block gives 2.* The Block's own door
    // (`actions.mjs#blockNow`) and the miss read off the attack's card on the active GM's
    // client (`effects/guardian.mjs#turnedAsideOnMiss`).
    "turned-aside": { turnedAside: { block: 1, miss: 0, atRank: [{ rank: 2, miss: 1 }, { rank: 3, block: 2 }] } },
    // *While you wield a shield, when your Attack Test's d20 shows 18, 19 or 20, make one
    // more attack roll, an echo ... When that echo's d20 shows 16 or higher, it echoes again,
    // and when the second echo's d20 shows 14 or higher, it echoes a third time. A third echo
    // does not echo.* (`rules/echoes.mjs`, rolled by `actions.mjs#rollWithDialog`).
    "echo-of-the-blade": { echo: { floors: [18, 16, 14], shield: true } },
    // *As a Reaction when a blow reduces your Health, spend 1 Sand. Take half its damage now,
    // rounded up. At the start of your next turn, take the other half minus your rank.*
    // Asked IN the blow (`AzerothActor#applyDamage`, through `azeroth-rpg.blowAsk`), the half
    // put off on the creature's list and landed at its turn's start (D-866's carrier).
    "borrowed-time": {
      grants: grant({ action: "reaction", cost: cost("sand", 1) }),
      onUse: { askedInBlow: true },
      borrowed: { sand: 1, less: "rank" }
    },
    // *When you Block, the attacker makes a Spirit Resilience Test against your Spell DC. On
    // a failure it is Slowed until the end of its next turn. At rank 2 your Block takes 1 more
    // damage off.* The Test rides the Block's own card; the 1 more is the Block's bonus.
    "grinding-block": {
      grind: { resilience: "spirit", condition: "slowed", until: "endOfNextTurn" },
      block: { add: "rank-1" }
    },
    // *As a Reaction when a creature you can see attacks an ally within 10 feet of you, spend
    // 2 Sand. You and that ally swap places without provoking Opportunity Attacks, and the
    // attack targets you instead. At rank 2, within 20 feet.* A move asked in the blow, as
    // Guardian's is (`effects/blow-doors.mjs#redirectBlow`), the swap a displacement.
    "interposed-moment": {
      grants: grant({ action: "reaction", cost: cost("sand", 2) }),
      moves: { kind: "interposed", feet: 10, cost: { pool: "sand", amount: 2 }, atRank: [{ rank: 2, feet: 20 }] }
    },
    // *As a Half-Action, spend 2 Sand. Half the damage Borrowed Time has put off, rounded
    // down, never arrives. At rank 2, none of it arrives.*
    "unmade-wound": {
      grants: grant({ action: "half", cost: cost("sand", 2) }),
      onUse: { unmade: { whole: false, atRank: [{ rank: 2, whole: true }] } }
    },
    // *Your Fortitude rises by 2 per rank.* Fortitude is Health (05), as Toughness's.
    "weathered-by-ages": { passive: passive([add("system.health.max", "2*rank")]) },
    // *Once per Long Rest, when a blow would drop you to 0 Health, you stay at 1 Health. The
    // rest of that blow arrives at the start of your next turn.* Among the holds at 1
    // (`AzerothActor#_holdAtOne`), the rest on the put-off list.
    "borrowed-hour": { grants: counter(1, "long"), borrowedHour: { stay: 1 } },
    // *The ground within 10 feet of you is Difficult ground for your enemies. At rank 2,
    // within 15 feet.* A Region attached to the token, carrying the `difficultFor` behavior
    // for the holder's enemies, laid by the active GM (`canvas/distortion-field.mjs`).
    "distortion-field": { field: { feet: 10, who: "enemy", atRank: [{ rank: 2, feet: 15 }] } },
    // *As an action, spend 5 Sand. Until the end of your next turn, every attack against an
    // ally within 30 feet of you targets you instead, and you may use Borrowed Time on each
    // blow without spending Sand or your Reaction.* An effect on the Guardian, read as an
    // automatic move in the blow and as a free Borrowed Time.
    "timeless-sentinel": {
      grants: grant({ action: "action", cost: cost("sand", 5) }),
      onUse: { timelessSentinel: { feet: 30 } }
    }
  },
  // **THE DEATH KNIGHT** (D-942; the plan's Phase 5, run F4a): Blood's and Frost's
  // twenty-four, each written against 04's words and read by ONE door. The law for every kind
  // only these rows carry is `rules/death-knight-talents.mjs`; `death-knight-talents.test.mjs`
  // holds every number to 04 at every rank. Every rune a row spends goes through the one rune
  // door (`documents/runes.mjs#spendRunesOn`), so it gives its Runic Power (the lead: *"make
  // sure that runes being consumed for any reason like talents, etc provide runic power"*).
  "death-knight": {
    // ---- Blood ----
    // *When Death Strike restores your Health, you gain temporary Health equal to twice your
    // rank until the end of the encounter.* Read where Death Strike's heal lands (`rollTest`),
    // through 05's grant (`AzerothActor#grantTemporaryHealth`).
    "blood-shield": { tempHealth: { on: "deathStrike", amount: "2*rank", span: "encounter" } },
    // *While you wield a two-handed weapon, or a Versatile weapon in both hands, when your melee
    // attack hits a creature that has half its Health or less, you regain 1 Health per rank.*
    // On the hit (`rollTest`), the knight's own feature heal through the one healing door.
    // *While you wield a one-handed weapon in each hand, when your Off-Hand Attack hits a
    // creature, you regain 1 Health per rank, or 2 Health per rank if it has half its Health or
    // less.* The grip alternate (D-1017), on the Off-Hand Attack's own hit.
    "grim-harvest": { dk: { harvest: {
      heal: "rank", atMost: 0.5, when: ["melee", { wields: ["bothHands"] }],
      alt: { offHand: true, heal: "rank", low: "2*rank", atMost: 0.5, when: { wields: ["oneInEach"] } }
    } } },
    // *When your Death Coil damages a creature, you gain temporary Health equal to the damage it
    // dealt until the end of the encounter.* At the spell card's Apply, off what the blow took.
    "crimson-coil": { spell: { names: ["Death Coil"] }, tempHealth: { on: "coilDealt", amount: "dealt", span: "encounter" } },
    // *As a Half-Action, spend 1 Blood rune. You regain Health equal to your tier plus 2 per rank.*
    "rune-tap": {
      grants: grant({ action: "half", cost: cost("runes", 1) }),
      onUse: { runes: { kind: "blood" }, dk: { regain: "tier+2*rank" } }
    },
    // *As a Half-Action, spend 1 Blood rune. Choose one creature within 30 feet. Each time that
    // creature's attack damages you, you regain Health equal to twice your rank after the blow,
    // for 1 minute.* The mark on the creature (`aim`), the heal at the card's Apply.
    "mark-of-blood": {
      grants: grant({ action: "half", cost: cost("runes", 1) }),
      onUse: { runes: { kind: "blood" }, aim: { feet: 30 }, dk: { markOfBlood: { heal: "2*rank", minutes: 1 } } }
    },
    // *While you wield a two-handed weapon, or a Versatile weapon in both hands, once a round,
    // when a creature within your reach damages you with a melee attack, it takes Shadow damage
    // equal to your rank.* At the card's Apply, on the GM's client, the round's mark spent.
    // *While you wield a one-handed weapon in each hand, once a round, when a creature within your
    // reach damages you with a melee attack, you may make your Off-Hand Attack for the round
    // against it as a Reaction, and on a hit it deals additional Shadow damage equal to your
    // rank plus 1.* The grip alternate (D-1017), raised by O-398's A (the lead: *"Yes and yes"*):
    // an offer card from the same Apply, the press judged whole, the Reaction and the round's
    // Off-Hand Attack spent by the attack door.
    "vengeful-blood": { dk: { vengeful: {
      amount: "rank", type: "shadow", once: "round", when: { wields: ["bothHands"] },
      alt: { riposte: true, amount: "rank + 1", type: "shadow", once: "round", when: { wields: ["oneInEach"] } }
    } } },
    // *As a Half-Action, spend 2 Runic Power. Choose one creature within 30 feet that can see
    // you. It takes a Bane on attacks against anyone but you until the end of your next turn.*
    // Taunt's Bane mark, Time Lock's own shape (`effects/banes.mjs#layBane`).
    "dark-command": {
      grants: grant({ action: "half", cost: cost("runicPower", 2) }),
      onUse: { laysBane: { kind: "attack", banes: 1, except: "user", until: "userTurnEnd", feet: 30 } }
    },
    // *Once per encounter, as a Half-Action, spend 1 Blood rune. Each time you regain Health, you
    // regain 1 additional Health per rank, for 1 minute.* A state on the knight, read at
    // `AzerothActor#applyHealing`.
    "vampiric-blood": {
      grants: grant({ action: "half", cost: cost("runes", 1), uses: uses(1, "encounter") }),
      onUse: { runes: { kind: "blood" }, dk: { vampiric: { add: "rank", minutes: 1 } } }
    },
    // *Once a round, when you spend a Blood rune, each enemy within 10 feet of you takes Shadow
    // damage equal to your rank. You regain 1 Health for each creature damaged this way.* At the
    // rune door, once the spend is written.
    "sanguine-tide": { dk: { tide: { amount: "rank", type: "shadow", feet: 10, regain: 1, once: "round" } } },
    // *Once per Short Rest, as a Half-Action, refill a number of your spent Blood runes equal to
    // your rank.* Through the rune door's refill (`documents/runes.mjs#refillRunesOn`).
    "blood-tap": {
      grants: grant({ action: "half", uses: uses(1, "short") }),
      onUse: { dk: { refill: { kind: "blood", count: "rank" } } }
    },
    // *When your Blood Plague damages a creature, you immediately regain Health equal to the
    // damage it dealt.* The Plague's patch, read where the tick lands (`effects/ticks.mjs`).
    "sanguine-plague": { modifies: mod("Plague", { plagueHeals: "dealt" }) },
    // *Once per encounter, while you wield a two-handed weapon, or a Versatile weapon in both
    // hands, as a Half-Action, spend 3 Blood runes. Your Dancing Runeweapon ... fights beside you
    // for three rounds. When you make an Attack, the Dancing Runeweapon makes one more attack
    // roll against the same creature as part of the same Attack. You regain Health equal to half
    // the damage the Dancing Runeweapon deals, rounded down.* A state on the knight; the roll
    // rides Extra Attack's `budget: "none"` door, as the Chronomancer's echo does.
    // D-1017 opens the Use to *a one-handed weapon in each hand* as well (`eitherGrip`), where
    // the roll rides the Off-Hand Attack and heals *the damage the Dancing Runeweapon deals*.
    "dancing-runeweapon": {
      grants: grant({ action: "half", cost: cost("runes", 3), uses: uses(1, "encounter") }),
      onUse: { runes: { kind: "blood" }, wields: ["eitherGrip"], dk: { dancing: { rounds: 3, heal: 0.5, alt: { offHand: true, heal: 1 } } } }
    },
    // ---- Frost ----
    // *While you wield a one-handed weapon in each hand, your Off-Hand Attack takes no -2. While
    // you wield a one-handed weapon in each hand, your melee hits against a Slowed creature deal
    // 1 additional Frost damage per rank.* The -2 is Second Strike's door (an Off-Hand Attack is
    // made with a one-handed weapon in each hand, so its gate always holds); the Frost is its
    // own amount on the hit (D-777's extras).
    // *While you wield a two-handed weapon, or a Versatile weapon in both hands, your first melee
    // hit each turn makes the creature Slowed until the end of its next turn, and your melee hits
    // against a Slowed creature deal 1 additional Frost damage per rank.* The grip alternate
    // (D-1017): the same Frost behind its own gate, and the Slowed through the one condition door
    // on the turn's first melee hit (`turnMark`).
    "frozen-edge": {
      offHand: { noPenalty: true },
      dk: { frozenEdge: {
        amount: "rank", type: "frost", when: ["melee", { targetHas: ["slowed"], wields: ["oneInEach"] }],
        alt: {
          amount: "rank", type: "frost", when: ["melee", { targetHas: ["slowed"], wields: ["bothHands"] }],
          slows: { condition: "slowed", until: "endOfNextTurn", once: "turn", when: ["melee", { wields: ["bothHands"] }] }
        }
      } }
    },
    // *A creature you pull with Death Grip is Slowed until the end of its next turn. At rank 2,
    // Death Grip's range is 60 feet.* The Slowed rides the patch (`patchRowsOf`); the 60 feet is
    // read by identifier (`rules/death-knight.mjs#deathGripFeet`), so the patch carries no reach.
    "icy-grip": { modifies: mod("Death Grip", { slows: { condition: "slowed", until: "endOfNextTurn" } }) },
    // *A creature your Death Coil damages is Slowed until the end of its next turn.*
    "chill-of-the-grave": { spell: { names: ["Death Coil"] }, dk: { coilSlows: { condition: "slowed", until: "endOfNextTurn" } } },
    // *Your Frost Fever deals 1 additional Frost damage per rank.* The Plague's patch, read as the
    // Fever is laid (`effects/death-knight.mjs#plagueHere`).
    "black-ice": { modifies: mod("Plague", { feverAdds: "rank" }) },
    // *A Slowed creature within your reach cannot Disengage. At rank 2, when your Opportunity
    // Attack hits, the creature's Speed is 0 until the end of its turn. At rank 2, while you
    // wield a one-handed weapon in each hand, your Opportunity Attack includes your Off-Hand
    // Attack.* The bar at the one Disengage door, the Speed 0 through Hold the Hall's `hitLays`
    // (`speedZero`: no condition and no escape Test; the lead, run F4b, D-988: *"Speed 0"*), and
    // the off hand at the Opportunity Attack's door.
    // *At rank 2, while you wield a two-handed weapon, or a Versatile weapon in both hands, your
    // Opportunity Attacks reach 5 feet further and deal additional Frost damage equal to your
    // tier.* The grip alternate (D-1017): the reach where an Opportunity Attack is offered and
    // where it is struck, and the Frost on its hit.
    "relentless-advance": {
      dk: { relentless: {
        noDisengage: true, offHand: false, when: { wields: ["oneInEach"] }, atRank: [{ rank: 2, offHand: true }],
        alt: { when: { wields: ["bothHands"] }, atRank: [{ rank: 2, reach: 5, damage: "tier", type: "frost" }] }
      } },
      hitLays: { condition: null, when: "opportunity", atRank: [{ rank: 2, speedZero: true, until: "endOfTurn" }] }
    },
    // *While you wield a one-handed weapon in each hand, each Frost rune you spend gives 1
    // additional Runic Power per rank. At rank 2, while you wield a one-handed weapon in each
    // hand, your attack against a Slowed creature inflicts a Critical Injury on a natural 19 or
    // 20.* The rune door's `frostBonus` (the lead: *"this should increase the power gained by
    // consuming a frost rune"*), and Keen's `criticalOn` through the shared `critical` row.
    // *While you wield a two-handed weapon, or a Versatile weapon in both hands, once a round,
    // your melee hit at SL 2 or more gives you 1 Runic Power per rank. At rank 2, while you wield a
    // two-handed weapon, or a Versatile weapon in both hands, your melee hit on a Slowed creature at
    // SL 2 or more inflicts a Critical Injury.* The grip alternate (D-1017), raised by O-398's C
    // (the lead: *"Yes and yes"*): the Runic Power needs no Slowed creature and rides the pool door
    // naming `killingMachine`; the Critical Injury keeps the Slowed gate under its own sentence
    // (MY READING of C) and rides the card's own button.
    "killing-machine": {
      dk: { killingMachine: {
        frostBonus: "rank", when: { wields: ["oneInEach"] },
        alt: { gain: "rank", sl: 2, once: "round", when: ["melee", { wields: ["bothHands"] }],
          atRank: [{ rank: 2, critical: { when: ["melee", { targetHas: ["slowed"], wields: ["bothHands"] }] } }] }
      } },
      // No `on` below rank 2: `Number(null)` is 0, which `criticalRangeFor` would read as a range.
      critical: { when: { targetHas: ["slowed"], wields: ["oneInEach"] }, atRank: [{ rank: 2, on: 19 }] }
    },
    // *Once a round, when you spend a Frost rune, the next Frost spell you cast before the end of
    // your turn costs 2 less Runic Power.* Laid by the rune door, taken by the next Frost cast.
    "runic-frost": { nextSpell: { amount: 2, on: "frostRune", schools: ["frost"], turn: true, once: "round" } },
    // *An enemy that starts its turn in your Desecration is Slowed until the end of its turn. At
    // rank 2, Desecration's radius is 15 feet.* The Slowed rides the patch; the radius is read by
    // identifier (`rules/death-knight.mjs#desecrationFeet`).
    "frozen-desecration": { modifies: mod("Desecration", { slows: { condition: "slowed", until: "endOfTurn" } }) },
    // *Once per encounter, as a Half-Action, spend 1 Frost rune. Every enemy within 10 feet of you
    // makes a Body Resilience Test against your Spell DC. On a failure it is Entangled. It repeats
    // the Test at the end of each of its turns, and the Entangled ends only when it succeeds. At
    // rank 2 the radius is 15 feet, and at rank 3 it is 20 feet.* The Vault Opens' shape; the
    // escape is the turn end's Body Test and nothing else (the lead, D-939).
    "hungering-cold": {
      grants: grant({
        action: "half", cost: cost("runes", 1), uses: uses(1, "encounter"),
        area: "A 10 ft radius centered on you", who: "enemy", resist: "body",
        inflicts: [{ condition: "entangled", until: null, escape: { on: "turnEnd", resilience: "body", dc: "spellDc" }, onFail: true }],
        atRank: [{ rank: 2, area: "A 15 ft radius centered on you" }, { rank: 3, area: "A 20 ft radius centered on you" }]
      }),
      onUse: { runes: { kind: "frost" } }
    },
    // *Once per Short Rest, as a Half-Action, end every Frost Fever you laid on creatures within
    // 15 feet of you. Refill 1 spent Frost rune for each Frost Fever you end. You refill no more
    // runes than the rune slots of the weapons you wield. At rank 2, the radius is 30 feet.*
    // Judged whole before anything is paid (`death-knight-talents.mjs#empowerPlan`).
    "empower-runeweapon": {
      grants: grant({ action: "half", uses: uses(1, "short") }),
      onUse: { dk: { empower: { feet: 15, atRank: [{ rank: 2, feet: 30 }] } } }
    },
    // *Once per encounter, as a Reaction when a blow damages you, spend 1 Frost rune. That blow,
    // and each blow until the end of your next turn, deals half its damage to you, rounded down,
    // before Armor Points and Ward apply.* Asked IN the blow (`AzerothActor#applyDamage`, through
    // `azeroth-rpg.blowAsk`), as Borrowed Time is.
    "icebound-fortitude": {
      grants: grant({ action: "reaction", cost: cost("runes", 1), uses: uses(1, "encounter") }),
      onUse: { runes: { kind: "frost" }, askedInBlow: true, dk: { icebound: true } }
    },
    // *Once per encounter, as a Half-Action, spend 3 Frost runes. A winter surrounds you to 15
    // feet for three rounds. An enemy that starts its turn inside the winter takes Frost damage
    // equal to your tier and is Slowed until the end of its turn. An enemy that is already Slowed
    // when it starts its turn inside the winter makes a Body Resilience Test against your Spell
    // DC instead. On a failure it is Entangled until the end of its turn.* A state on the knight,
    // read at every turn's start (`effects/death-knight-talents.mjs#dkTurnStart`).
    "remorseless-winter": {
      grants: grant({ action: "half", cost: cost("runes", 3), uses: uses(1, "encounter") }),
      onUse: { runes: { kind: "frost" }, dk: { winter: { feet: 15, rounds: 3 } } }
    }
  },
  // **THE NECROMANCER** (04's Flesh, Bone and Damned; the Necromancer plan's Phase 4c-T and Phase 5).
  // Every row names its door in `necro` - the numbers are `rules/necromancer-talents.mjs`' constants,
  // held to 04 at every rank by `necromancer-talents.test.mjs` - and a Use rides `grants` and
  // `onUse.necro`, judged by `effects/necromancer-talents.mjs#judgeNecroTalentUse` before anything is
  // paid. The raise talents are read by the horde's own doors (`effects/necromancer-horde.mjs`), the
  // passives on the raised dead by `rules/bound.mjs#boundEffects`' `raised` branch.
  necromancer: {
    /* ---- Flesh ---- */
    // *Each of your Plagued Ghouls adds your rank to its Damage Rating. At rank 3, ... 10 additional feet
    // of Speed. Empowered. As a Half-Action, spend 1 Essence ...* The bound sync and the surge's Use.
    "ghoul-frenzy": { grants: grant({ action: "half", cost: cost("essence", NT.GHOUL_FRENZY.essence) }), onUse: { necro: { surge: NT.GHOUL_FRENZY.identifier } }, necro: { bound: NT.GHOUL_FRENZY } },
    // *Your Animate Corpse may target 1 additional corpse per rank* (`raise.mjs#RAISE_WIDENED_BY`).
    "shambling-horde": { necro: { corpses: { spell: "animate-corpse", perRank: 1 } } },
    // *... a corpse within its reach. The corpse is destroyed. That creature regains all its Health.
    // Empowered ... temporary Health equal to twice your tier.*
    "gorge": { grants: grant({ action: "half" }), onUse: { necro: { gorge: true } }, necro: { heal: "all", tempHealth: "2*tier", door: NT.GORGE } },
    // *you may give it one graft ... At rank 2, ... two grafts* (`grafts.mjs#graftMenu`).
    "grafted-flesh": { necro: { grafts: { entries: ["Risen Zombie", "Plagued Ghoul"], perRank: 1 } } },
    // *... Body Resilience Test against your Spell DC. On a failure it takes Shadow damage equal to your
    // rank at the start of each of its turns for 1 minute. Empowered ... Poisoned 1 ...* The hit's Test
    // card (`effects/graft-riders.mjs`) and the surge's Use.
    "plague-carrier": { grants: grant({ action: "half", cost: cost("essence", NT.PLAGUE_CARRIER.essence) }), onUse: { necro: { surge: NT.PLAGUE_CARRIER.identifier } }, necro: { turnStart: true, hitTest: NT.PLAGUE_CARRIER } },
    // *... destroy one corpse within 30 feet of you. The spell costs 1 less Mana per rank, to a minimum
    // of 1* (`necromancer-lines.mjs#FLESH_OFFERING`, a line on the cast dialog).
    "flesh-offering": { necro: { discount: { perRank: 1, floor: 1, feet: 30 } } },
    // *Stitch Abomination's list of grafts gains Butcher's Arm and Plague Bladder. At rank 2, ... Grasping
    // Arms* (`grafts.mjs`; the bladder and the arms fire on their own, `effects/graft-riders.mjs`).
    "surgeons-hand": { necro: { grafts: { gains: ["butchersArm", "plagueBladder"], atRank2: ["graspingArms"] }, inflicts: ["poisoned", "entangled"] } },
    // *... cost 1 less Essence in total per rank, to a minimum of 0. This discount applies once a casting.*
    "practiced-stitcher": { necro: { discount: { perRank: 1, floor: 0, once: "casting" } } },
    // *... drops to 0 Health, each enemy within a 5 ft radius of it takes Shadow damage equal to your
    // tier ...* The raised-dead event's burst (`effects/necromancer-talents.mjs#bloatedDeadOn`).
    "bloated-dead": { necro: { burst: NT.BLOATED_DEAD } },
    // *... regains Health equal to your tier at the start of its turn. At rank 2, ... twice your tier.
    // Empowered ...* The turn start's mending and the Empowered Use.
    "regenerating-tissue": { grants: grant({ action: "half", cost: cost("essence", NT.REGENERATING_TISSUE.essence) }), onUse: { necro: { mend: NT.REGENERATING_TISSUE.identifier } }, necro: { heal: "tier", turnStart: true } },
    // *Once per Long Rest, you may cast Stitch Abomination with no corpses ... The GM judges the place.*
    "exhume": { grants: counter(1, "long", null), onUse: { necro: { exhume: true } }, necro: { exhume: NT.EXHUME }, reason: "where the dead lie buried - a graveyard, a battlefield, a barrow or a crypt - is the GM's to judge (the lead: *enforced by the GM not automation/code*); Stitch Abomination asks for no corpse, and the Use counts the Long Rest's casting" },
    // *... rises with twice its 14-BESTIARY Health. You may give it each graft twice* (`horde-stamps.mjs`, `grafts.mjs`).
    "masterwork-abomination": { necro: { health: 2, perGraft: 2 } },
    /* ---- Bone ---- */
    // *... any of the skeletons may rise as Skeletal Archers* (`raise.mjs#entryCompositions`).
    "skeletal-archery": { necro: { entry: "Skeletal Archer" } },
    // *... up to your rank may rise as Skeletal Mages. Empowered ... One more* (`necromancer-lines.mjs#SKELETAL_MASTERY`).
    "skeletal-mastery": { necro: { entry: "Skeletal Mage", perRank: 1, empowered: 1 } },
    // *... It collapses. You have 1 additional Armor Point at every location until you finish a Long
    // Rest ... up to your rank. Empowered ... until the end of the encounter ...*
    "bone-armor": { grants: grant({ action: "half" }), onUse: { necro: { boneArmor: true } }, necro: { ap: NT.BONE_ARMOR } },
    // *... adds your rank to its Damage Rating and to its Defense. Empowered ... three times your tier.*
    "bone-vanguard": { grants: grant({ action: "half", cost: cost("essence", NT.BONE_VANGUARD.essence) }), onUse: { necro: { mend: NT.BONE_VANGUARD.identifier } }, necro: { heal: "3*tier", lead: true } },
    // *... it stands again with half its Health at the start of your next turn ... once. At rank 2 ...
    // immediately. Empowered ... all its Health.* The one 0-Health judgement's second source.
    "restless-bones": { necro: { turnStart: true, standAgain: NT.RESTLESS_BONES } },
    // *... the Physical damage an attack deals you falls by your rank* (the damage door's standing reduction).
    "marrowguard": { necro: { reduce: NT.MARROWGUARD } },
    // *Your horde has 1 additional place per rank, for skeletons only* (`horde.mjs#hordeCapacity`).
    "swelling-ranks": { necro: { places: { perRank: 1, skeletons: true } } },
    // *Your Raise Dead may target 1 additional corpse per rank* (`raise.mjs#RAISE_WIDENED_BY`).
    "ranks-of-bone": { necro: { corpses: { spell: "raise-dead", perRank: 1 } } },
    // *When your Bone Shield reduces an attack's damage, the attacker takes Shadow damage equal to twice
    // your rank ...* Bone Shield's Reaction is team 4c-S's door, and its card posts under `BARBED_BONE_KEY`.
    "barbed-bone": { necro: { retaliate: { amount: "2*rank", spellpower: "shadow", spell: "Bone Shield" } } },
    // *Each of your skeletons adds your rank to its Damage Rating. Empowered ... twice your rank.*
    "commander-of-bone": { grants: grant({ action: "half", cost: cost("essence", NT.COMMANDER_OF_BONE.essence) }), onUse: { necro: { surge: NT.COMMANDER_OF_BONE.identifier } }, necro: { bound: NT.COMMANDER_OF_BONE } },
    // *Once per encounter, as a Half-Action, choose any number of your skeletons within 60 feet ...*
    "bone-storm": { grants: grant({ action: "half", uses: uses(1, "encounter") }), onUse: { necro: { boneStorm: true } }, necro: { burst: NT.BONE_STORM } },
    // *Your horde has additional places equal to your Arcana Ranks, for skeletons only.*
    "the-endless-host": { necro: { places: { arcana: true, skeletons: true } } },
    /* ---- Damned ---- */
    // *... It collapses. A Shade ... rises in its space ... Empowered ... no place in your horde.*
    "acolytes-sacrifice": { grants: grant({ action: "half" }), onUse: { necro: { sacrifice: true } }, necro: { raise: NT.ACOLYTES_SACRIFICE } },
    // *Once a round, as a Half-Action ... Mana equal to your Intelligence modifier ... At rank 2,
    // Unsummon takes no action* (the architect's Q1).
    "unsummon": { grants: grant({ action: "half", atRank: [{ rank: NT.UNSUMMON.freeRank, action: null }] }), onUse: { necro: { unsummon: true } }, necro: { mana: "int", once: "round" } },
    // *... A 10 ft radius around it is your circle for 1 minute. Each ally that starts its turn in your
    // circle gains temporary Health equal to your rank ... Empowered ...*
    "circle-of-the-damned": { grants: grant({ action: "half" }), onUse: { necro: { circle: true } }, necro: { tempHealth: "rank", area: NT.CIRCLE } },
    // *Each ally in your circle has a Boon on Spirit Resilience Tests. At rank 2, ... Body* (the circle's riders).
    "cult-fervor": { necro: { boons: NT.CULT_FERVOR } },
    // *... each ally within 10 feet of it gains temporary Health equal to your tier per rank* (a collapse by choice).
    "sacrificial-strength": { necro: { tempHealth: "tier*rank", feet: NT.SACRIFICIAL_STRENGTH.feet } },
    // *... its hits deal additional Shadow damage equal to half your Intelligence modifier, rounded down.
    // It loses 1 Health at the start of its next turn ... At rank 2, choose two living allies.*
    "unholy-fervor": { grants: grant({ action: "half" }), onUse: { necro: { fervor: true } }, necro: { turnStart: true, typed: NT.UNHOLY_FERVOR } },
    // *Your Shades see invisible creatures within 60 feet ... At rank 2, ... a Half-Action to see and hear
    // through one of your Shades* (core's `seeInvisibility` on the Shade, and the rank 2 Use).
    "watchful-shades": { grants: grant({ action: "half", minRank: NT.WATCHFUL_SHADES.sightRank }), onUse: { necro: { borrow: true } }, necro: { sees: NT.WATCHFUL_SHADES } },
    // *Your circle's radius is 15 feet. At rank 2, it is 20 feet. At rank 2, you may move your circle ...*
    "grand-circle": { grants: grant({ action: "half", minRank: NT.GRAND_CIRCLE.moveRank }), onUse: { necro: { moveCircle: true } }, necro: { radius: NT.GRAND_CIRCLE } },
    // *Once a round, when an ally in your circle would drop to 0 Health, you may collapse one of your
    // raised dead ... The ally drops to 1 Health instead. At rank 2, ... regains Health equal to your
    // tier.* The asked hold (`blow-doors.mjs#ASKED_HOLDS`).
    "life-for-a-life": { holds: { kind: "lifeForALife" }, necro: { heal: "tier", hold: NT.LIFE_FOR_A_LIFE } },
    // *Your Dark Ritual's cap rises by 2 Mana per rank* (`necromancer-features.mjs#darkRitualCap`).
    "grim-sacrament": { necro: { cap: NT.GRIM_SACRAMENT } },
    // *Once per Short Rest, ... a 10-minute rite with up to five willing allies ... three times your tier.*
    "dark-communion": { grants: grant({ action: null, uses: uses(1, "short") }), onUse: { necro: { communion: true } }, necro: { heal: "3*tier", rite: NT.DARK_COMMUNION } },
    // *Once per Long Rest, as a Half-Action ... five times your tier ... Boon on every Test ... Empowered ...*
    "the-black-rite": { grants: grant({ action: "half", uses: uses(1, "long") }), onUse: { necro: { blackRite: true } }, necro: { heal: "5*tier", tempHealth: "int", rite: NT.BLACK_RITE } }
  },
  // **THE DEMON HUNTER** (04's Betrayer, Souleater and Sufferer; the Demon Hunter plan's Phase 5, D-1560 to
  // D-1569). Every number is `rules/demon-hunter-talents.mjs`' (DT), held to 04 at every rank by
  // `demon-hunter-talents.test.mjs`, and every door is named, function by function, in `DT.DH_TALENT_DOORS`. A
  // talent that changes one of 02's features rides the `mod(...)` patch on its row (`patchRowsOf`, D-773 to
  // D-775); a Use's `onUse.dh.talent` is judged by `effects/demon-hunter-talents.mjs#judgeDhTalentUse` before
  // anything is paid. C8: no row here holds the hunter above 0.
  "demon-hunter": {
    /* ---- Betrayer ---- */
    // *With a glaive in each hand, your Off-Hand Attack takes no −2 even if the weapon lacks Light. At rank 2,
    // your Off-Hand Attack deals 1 more damage.* The −2's waiver behind the grip (`offHandPenaltyFor`), and the
    // damage on the off-hand blow (`offHandBuildsFor`), both at the attack door.
    "twin-blades": { offHand: { noPenalty: true, when: { wields: [DT.TWIN_BLADES.wields] }, atRank: [{ rank: DT.TWIN_BLADES.damageRank, damage: DT.TWIN_BLADES.damage }] }, dh: { offHand: true } },
    // *Fel Lash deals 1 more damage per rank*: the patch on 02's Fel Lash, read by its hit.
    "fel-tempered": { modifies: mod("Fel Lash", { dh: { damage: "rank" } }) },
    // *You gain 1 Armor Point on your Body per rank, and +1 per rank on Intimidation Tests*: the Armor Point a
    // passive, the Intimidation a row of the Skill Test's one door (`skills.mjs#skillRowsFor`).
    "demonic-visage": { passive: passive([add("system.ap.body", "rank")]), dh: { skill: DT.DEMONIC_VISAGE.skill } },
    // *Once per Short Rest per rank, as a free action, gain 1 Fel Corruption, with no Test. Your Hatred fills to
    // your cap and you gain 3 Energy.*
    "taste-of-power": { grants: grant({ action: null, uses: uses("rank", DT.TASTE_OF_POWER.per) }), onUse: { dh: { talent: "taste" } } },
    // *As a Half-Action, spend 4 Hatred. You take a demon's shape for your rank plus 1 rounds ...*: the `skull` shape.
    "gift-of-the-skull": { grants: grant({ action: "half", cost: cost("hatred", DT.GIFT_OF_THE_SKULL.hatred) }), onUse: { dh: { talent: "skull" } } },
    // *Spectral Sight, Fel Lash and your Hatred cap treat your Fel Corruption as 5 higher*: `hatred.mjs#felFor`.
    "embrace-the-pain": { dh: { felFor: DT.EMBRACE_THE_PAIN.step } },
    // *... you have wings whatever your Fel Corruption, and a flying Speed of 30 feet. At rank 2, it is 60 feet.*
    "wings-of-the-betrayer": { dh: { wings: true } },
    // *... as a Half-Action, spend 3 Energy. One creature within 60 feet makes a Reflex Resilience Test against your
    // Spell DC. On a failure it takes Fel damage equal to 2 plus twice your rank, and on a success half of that.*
    "chaos-blast": {
      grants: grant({ action: "half", cost: cost("energy", DT.CHAOS_BLAST.energy), resist: DT.CHAOS_BLAST.resilience,
        damage: { amount: `${DT.CHAOS_BLAST.base}+${DT.CHAOS_BLAST.perRank}*rank`, type: DT.CHAOS_BLAST.type, half: true } }),
      onUse: { aim: { feet: DT.CHAOS_BLAST.feet }, dh: { talent: "chaosBlast" } }
    },
    // *When Fel Lash hits a demon or a creature that holds Mana, gain 1 Energy per rank.*
    "feed-on-power": { modifies: mod("Fel Lash", { dh: { energy: "rank" } }) },
    // *Demon Unleashed adds 1 more to your Damage Rating per rank and lasts 1 more round per rank.*
    "eternal-hunger": { modifies: mod("Demon Unleashed", { dh: { damage: "rank", rounds: "rank" } }) },
    // *When you finish a Hunter's Leap while you are in the demon's shape ... Body Resilience Test against your
    // Spell DC. On a failure it takes Fel damage equal to your tier and falls Prone.* A splash Test a creature.
    "fall-upon-them": { modifies: mod("Hunter's Leap", { dh: { fall: true } }), dh: { onFail: true } },
    // *When you use Demon Unleashed, you may make it last until you finish a Short Rest ... gain 5 Fel Corruption
    // when it ends, with no Test.* The hostility is the GM's (C28), a line on the card.
    "betrayers-bargain": { modifies: mod("Demon Unleashed", { dh: { bargain: DT.BETRAYERS_BARGAIN.fel } }) },
    /* ---- Souleater ---- */
    // *You can devour souls ... within 5 feet ... regain Health equal to your tier per rank ... When you devour a
    // soul with Devour Soul, add your tier per rank.* The death watch's offer and the press.
    "soul-hunger": { modifies: mod("Devour Soul", { dh: { heal: "tier*rank" } }), dh: { heal: true } },
    // *While you wield a scythe in two hands, add 1 per rank to its Damage Rating, and Soul Hunger reaches ... 10 feet*.
    "reapers-grip": { damage: damage(["all"], "attack", { when: { wields: [DT.REAPERS_GRIP.wields] } }), dh: { reach: DT.REAPERS_GRIP.reach } },
    // *When Fel Lash hits, you regain 1 Health per rank.*
    "gorging-lash": { modifies: mod("Fel Lash", { dh: { heal: "rank" } }), dh: { heal: true } },
    // *... you may keep it instead of regaining Health. It becomes a Crystalized Soul in your bags if you have a free
    // bag slot ... use one to regain the Health it would have restored, gain 3 Energy, or gain 2 Hatred.*
    "hoarded-soul": { modifies: mod("Devour Soul", { dh: { hoard: true } }), dh: { heal: true } },
    // *When you devour a demon's soul, your next Fel Lash before the end of your next turn costs no Hatred and deals 1
    // more damage per rank.*
    "demons-due": { modifies: mod("Fel Lash", { dh: { damage: "rank", free: true } }) },
    // *While you wield a scythe in two hands, once a turn when your attack hits, one other enemy within your reach
    // takes Shadow damage equal to half your Wisdom modifier, rounded down, and at least 1 ...*
    "sweeping-arc": { dh: { sweep: true } },
    // *When you devour a soul, you may make a Hunter's Leap without spending Energy or your Reaction. At rank 2, your
    // next attack this turn gains a Boon.*
    "kill-after-kill": { modifies: mod("Hunter's Leap", { dh: { free: true } }) },
    // *Fel Lash against a creature below half its Health deals 1 more damage per rank. If the blow drops it to 0 ...
    // without spending your Reaction.*
    "tear-the-soul": { modifies: mod("Fel Lash", { dh: { damage: "rank", freeDevour: true } }) },
    // *... once a round when your attack hits a creature, it is Slowed until the end of its next turn.*
    "hobbling-reap": { dh: { inflicts: [DT.HOBBLING_REAP.condition] } },
    // *Devour Soul reaches 20 feet further per rank, and once a round it costs no Reaction.*
    "endless-appetite": { modifies: mod("Devour Soul", { dh: { reach: `${DT.ENDLESS_APPETITE.feetPerRank}*rank`, free: "round" } }) },
    // *When you devour a creature that held Mana or a Power pool, gain 2 Hatred. Every spell that creature cast and
    // that is still in force ends ...*
    "swallow-their-magic": { dh: { swallow: true } },
    // *When you devour a soul ... Spirit Resilience Test against your Spell DC. On a failure it takes Shadow damage
    // equal to your Wisdom modifier. Gain 1 Hatred for each creature this damage reduces to 0 Health.*
    "feast-of-souls": { dh: { feast: true, onFail: true } },
    /* ---- Sufferer ---- */
    // *You gain +1 per rank on Spirit Resilience Tests against Fel, and against being Charmed or Frightened.*
    "iron-will": { dh: { line: "ironWill" } },
    // *... gain 1 less Fel Corruption per rank, to no lower than 0*: the rest door's `less` (`hatred.mjs#restFel`).
    "measured-breath": { dh: { rest: "less" } },
    // *Spectral Sight reaches 20 feet further*: the token's sight (`syncSpectralSight`). The stone and the wood
    // are the table's: a Foundry wall has no thickness to see through.
    "eyes-of-the-nether": { modifies: mod("Spectral Sight", { dh: { feet: `${DT.EYES_OF_THE_NETHER.feet}*rank` } }), reason: "seeing through 1 foot of stone or wood is the GM's to show: a Foundry wall has no thickness (D2 §12)" },
    // *... leave 1 Hatred per rank out of the count*: the rest door's `leftOut`.
    "warding-ink": { dh: { rest: "leftOut" } },
    // *As a Reaction when a spell targets you, spend 3 Energy. You gain Ward equal to your rank plus 1 against that
    // spell's school for that casting.* A laid Ward (D-774's rule), spent with the casting's turn.
    "glaive-ward": { grants: grant({ action: "reaction", cost: cost("energy", DT.GLAIVE_WARD.energy) }), onUse: { dh: { talent: "glaiveWard" } } },
    // *Whichever Beyond Limits choice you make, it also ends Slowed and Entangled on you.*
    "steady-footing": { modifies: mod("Beyond Limits", { dh: { ends: [...DT.STEADY_FOOTING.ends] } }) },
    // *Once per Long Rest per rank ... make a Spirit Resilience Test after every other talent and feature has reduced
    // it*: the rest door reads it by name, rolled last (`effects/demon-hunter-features.mjs#quietTheWhispers`).
    "quiet-the-whispers": { automated: "inline", dh: { rest: "quiet" } },
    // *When you succeed on a Resilience Test against a spell, gain 1 Energy per rank, and the spell's caster takes Fel
    // damage equal to your rank.* The spell card's Resist door.
    "turn-their-fire": { dh: { turnFire: true } },
    // *At rank 2, you see the true form of a shapeshifted or disguised creature*: a whisper when such a creature is
    // targeted. *Illusions never deceive you* is the GM's: no document records an illusion.
    "sight-beyond-sight": { dh: { trueForm: DT.SIGHT_BEYOND_SIGHT.trueFormRank }, reason: "an illusion is the GM's to show as false: no document records an illusion (D2 §12)" },
    // *... at 1 for each 4 Hatred at rank 1, or 1 for each 5 at rank 2*: the rest door's `per`.
    "bridle-the-demon": { dh: { rest: "per" } },
    // *You cannot be Charmed by a demon. When a demon casts a spell at a creature within ... of you, its Casting Test
    // takes a Bane.* The effect's creation refused, and the cast door's Bane.
    "refuse-the-legion": { dh: { legion: true } },
    // *Once per Short Rest, as an Action, end every spell and spell effect of tier 3 or lower within 30 feet ...*
    "silence-the-weave": { grants: grant({ action: "action", uses: uses(1, DT.SILENCE_THE_WEAVE.per) }), onUse: { dh: { talent: "silence" } } }
  },
  // **THE WITCH HUNTER** (04's Wolf, Gryphon, Bear and Cat; the Witch Hunter plan's wave 2b, D-2080 to D-2094). Every
  // number is `rules/witch-hunter-talents.mjs`' (WT), held to 04 at every rank by `witch-hunter-talents.test.mjs`, and
  // every door is named, function by function, in `WT.WH_TALENT_DOORS`. A row reuses a kind another class built where
  // one fits; `wh` names what only this class's doors read (`effects/witch-hunter-talents.mjs`, the brews, the Signs and
  // the Tome), and a Use's `onUse.wh.talent` is judged by `effects/witch-hunter-talents.mjs#judgeWhTalentUse` before
  // anything is paid.
  "witch-hunter": {
    /* ---- Wolf ---- */
    // *When you brew with Field Brews, you brew 1 more dose per rank*: `brewing.mjs#dosesFor`, at the rest and in Prepare.
    "extra-measure": { wh: { doses: WT.EXTRA_MEASURE_TALENT.perRank } },
    // *... that restore Health restore 1 more per rank, and your bombs ... deal 1 more damage per rank*: the brew's
    // stamp at the Use (`witch-hunter-brews.mjs#stampBrew`).
    "potent-brews": { wh: { brew: "potent", heal: true, damage: true } },
    // *Once a round per rank, you may use an elixir or an oil ... as a free action*: claimed before the budget
    // (`effects/witch-hunter-talents.mjs#freeBrewFor`).
    "practiced-hands": { wh: { free: WT.PRACTICED_HANDS.kinds } },
    // *Your Hunter's oil ... adds 1 more damage per rank*: the oil's stamp.
    "sharper-oils": { wh: { brew: "oil", damage: true } },
    // *You have a Boon on the Investigation Test ... At rank 2 ... when you finish a Short Rest*: the learning Test and
    // the rest's chance (`tome.mjs#learnBoons`, `learnRefusal`).
    "field-notes": { wh: { learn: true } },
    // *Your bombs ... land 10 feet farther away per rank, and their radius grows by 5 feet per rank*: the bomb's stamp.
    "wide-blast": { wh: { brew: "bomb" } },
    // *Your elixirs ... that last 1 minute last 1 more minute per rank*: the elixir's stamp.
    "lasting-brews": { wh: { brew: "duration" } },
    // *When you choose types for Studied, you may choose 1 more per rank*: `tome.mjs#studiedCount`, in Prepare.
    "forewarned": { wh: { studied: WT.FOREWARNED_TALENT.perRank } },
    // *Once a round per rank, after you throw a bomb ... you may throw another as a free action*: claimed before the
    // budget, after a bomb this turn (`freeBrewFor`, `markBombThrown`).
    "cluster-bomb": { wh: { free: ["bomb"] } },
    // *The Decoction ... does not count toward your Toxicity limit ... At rank 2 ... two Decoctions at a time*:
    // `toxicity.mjs#countsToward`, `brewing.mjs#decoctionLimit`.
    "refined-decoctions": { wh: { toxicity: true } },
    // *Your Toxicity limit from Field Brews rises by 1*: `toxicity.mjs#toxicityLimit`.
    "seasoned-blood": { wh: { toxicity: true, stat: true } },
    // *Once per Long Rest, as a Half-Action, each elixir and Decoction you brewed ... returns to the number of doses you
    // brewed*: the brewing's own record (`WH_BREW_LOG_FLAG`), restored on the hunter.
    "second-brewing": { grants: grant({ action: WT.SECOND_BREWING_TALENT.action, uses: uses(1, WT.SECOND_BREWING_TALENT.per) }), onUse: { wh: { talent: "secondBrewing" } } },
    /* ---- Gryphon ---- */
    // *The cones ... grow by 5 feet per rank, and your Ash Sign and Lull Sign reach 10 feet farther per rank*:
    // `witch-hunter-features.mjs#signEffect`, read by the Sign's own door.
    "far-signs": { wh: { sign: "reach" } },
    // *Your Ember Sign deals 1 more damage per rank*: `signEffect`.
    "searing-script": { wh: { sign: "damage", damage: true } },
    // *Your first Sign each turn from Signs costs 1 Energy less per rank*: `signCost`.
    "quick-script": { wh: { sign: "cost", discount: true } },
    // *A creature that fails its Test against your Gale Sign takes Physical damage equal to your rank plus your tier*:
    // the cone card's damage on a failure (`signEffect`, `coneSys`).
    "shattering-gale": { wh: { sign: "damage" } },
    // *A creature your Lull Sign leaves Charmed stays Charmed 1 more round per rank*: the Charmed's span lengthened at
    // the failed Test (`witch-hunter-talents.mjs#lengthenSpan`).
    "deep-lull": { wh: { sign: "lull" } },
    // *When you use the Rowan Sign, each enemy within 5 feet of the creature that gains the Ward takes Fire damage*:
    // the burst after the Ward lands (`burstFromRowan`).
    "bursting-rowan": { wh: { sign: "burst" } },
    // *The radius ... grows by 5 feet per rank, and an undead or a demon that starts its turn in it takes Holy damage*:
    // the ring's radius and its `against` row (`signEffect`, `ashRingTick`).
    "ashen-ring": { wh: { sign: "ash" } },
    // *The cone of your Ember Sign stays alight until the start of your next turn ...*: an area that strikes, set down
    // where the cone was aimed (`placeFirestream`).
    "firestream": { wh: { sign: "linger" } },
    // *The Ward your Rowan Sign gives rises by 1 per rank*: `signEffect`.
    "living-rowan": { wh: { sign: "ward", stat: true } },
    // *Your second Sign each turn from Signs costs 1 Energy less per rank*: `signCost`.
    "twin-signs": { wh: { sign: "cost", discount: true } },
    // *When you use the Ember Sign, you may make it deal Holy damage instead of Fire*: asked in the Sign's judgement.
    "holy-ember": { wh: { sign: "holy" } },
    // *Each Sign from Signs costs 1 Energy less, to the minimum of 1*: `signCost`.
    "sign-of-the-order": { wh: { sign: "cost", discount: true } },
    /* ---- Bear ---- */
    // *You may wear plate without a Bane. At rank 2 you ignore the Encumbering trait of the suit you wear* (T3): plate
    // added to the class's Access, and at rank 2 the suit's Encumbering waived whole - its Speed part and its Stealth
    // Bane - and never a weapon's (`armorAccessFor`'s `waivesSuitEncumbering`; O-719).
    "bears-hide": { armorAccess: { categories: [...WT.BEARS_HIDE.categories], atRank: [{ rank: WT.BEARS_HIDE.suitRank, waivesSuitEncumbering: true }] } },
    // *You have a Boon on Body Resilience Tests. At rank 2 you also have a Boon on Spirit Resilience Tests* (the lead,
    // 2026-11-27, replacing the +1 SL a rank): an automatic line on the roll dialog (`ironStomachBoons`).
    "iron-stomach": { wh: { roll: "ironStomach" } },
    // *Your Sunder costs 1 Tempo less per rank*: `maneuvers.mjs#maneuverCost` reads it by name, floor 1.
    "splitting-blow": { automated: "inline", wh: { discount: true } },
    // *You have a Boon on Resilience Tests against being knocked Prone or moved. At rank 2, while you wield a weapon in
    // two hands, you cannot be moved against your will*: the Resist door's Boon on a card that moves or knocks Prone
    // (`unbowedBoons`), the table's line on any other Resilience Test, and the forced-move door's refusal.
    "unbowed": { wh: { boon: "moved", immovable: WT.UNBOWED.immovableRank } },
    // *Your attacks with a weapon in two hands deal 1 more damage per rank*: a damage line gated on the grip.
    "bears-weight": { damage: damage(["all"], "attack", { when: { wields: [WT.BEARS_WEIGHT.wields] } }) },
    // *While you wield a weapon in two hands, a successful Parry gives you 1 Tempo per rank*: the Parry that holds
    // (`parryGainsFor`).
    "steel-guard": { parry: { gain: { pool: WT.STEEL_GUARD.pool, amount: "rank" }, when: { wields: [WT.STEEL_GUARD.wields] } } },
    // *Once a round per rank, when a melee attack hits you, you gain 1 Tempo*: the struck door (`whWhenStruck`).
    "bears-wrath": { wh: { struck: true } },
    // *Your Whirling Steel costs 1 Tempo less per rank*: a patch on 02's Whirling Steel's price (O-734).
    "crushing-sweep": { modifies: mod("Whirling Steel", { cost: { delta: "-rank" } }) },
    // *The first time in a fight that your Health drops below half, you gain temporary Health*: the struck door, its
    // once a fight the counter the talent grants (`whWhenStruck`).
    "bears-endurance": { grants: counter(1, "encounter"), wh: { tempHealth: true } },
    // *Your Tempo is capped at 8 instead of 5*: `momentum.mjs#capFor` reads it through `tempo.mjs#URSINE_FURY`.
    "ursine-fury": { wh: { cap: WT.URSINE_FURY_TALENT.cap } },
    // *When you hit with a weapon in two hands, the target is pushed 5 feet away from you per rank*: the hit door
    // (`whTalentsOnHit`) through `forceMove`.
    "thunderous-swing": { wh: { push: WT.THUNDEROUS_SWING.feet } },
    // *Once per Short Rest, as a Half-Action, for 1 minute: ... extra damage equal to your tier, and you gain 1 Armor
    // Point on every location*: one effect on the hunter (`landMountainBear`), its damage read by `witchHunterBlow`.
    "mountain-bear": { grants: grant({ action: WT.MOUNTAIN_BEAR.action, uses: uses(1, WT.MOUNTAIN_BEAR.per) }), onUse: { wh: { talent: "mountainBear" } }, wh: { stat: true } },
    /* ---- Cat ---- */
    // *While you wear studded armor or lighter, your Defense rises by 1 per rank*: an owner-side passive gated on the
    // suit's category (`talent-gates.mjs`' `wears`, D-2113).
    "feline-reflexes": { passive: passive([add("system.defense", "rank")], { wears: { atMost: WT.FELINE_REFLEXES.atMost } }) },
    // *Once a round, when a melee attack misses you, you may move 5 feet per rank. This movement does not provoke
    // Opportunity Attacks*: Elusive's button on the attack's card, free, melee, a miss, once a round.
    "tumble": { evade: { feet: `${WT.TUMBLE.feet}*rank`, free: true, melee: true, missOnly: true, once: "round" } },
    // *When you hit at SL 2 or higher, the target is Slowed until the end of its next turn. At rank 2 ... SL 1*.
    "hobbling-cut": { hitLays: { sl: WT.HOBBLING_CUT.sl, condition: WT.HOBBLING_CUT.condition, until: "endOfNextTurnOrRound", atRank: [{ rank: 2, sl: WT.HOBBLING_CUT.rank2Sl }] } },
    // *While you wear studded armor or lighter, your Speed rises by 5 feet per rank*: the same gate.
    "cats-step": { passive: passive([add("system.speed", `${WT.CATS_STEP.feet}*rank`)], { wears: { atMost: WT.CATS_STEP.atMost } }) },
    // *Your Riposte costs 1 Tempo less per rank, to a minimum of 1. At rank 2, a Riposte against a creature of a Studied
    // type deals extra damage equal to your tier*: `maneuverCost` by name, and a damage line on the Riposte.
    "hunters-riposte": { automated: "inline", wh: { discount: true }, damage: damage(["all"], "attack", { amount: "tier", minRank: WT.HUNTERS_RIPOSTE.damageRank, when: ["riposte", { typeStudied: true }] }) },
    // *Your weapon attacks inflict a Critical Injury on 19 or 20. At rank 2 this applies on 18 to 20 against a creature
    // of a Studied type*: the attack door's range (`criticalRangeFor`, whose `or` is the rank's second range).
    "lethal-edge": { critical: { on: WT.LETHAL_EDGE.on, when: "weaponAttack", atRank: [{ rank: 2, or: [{ on: WT.LETHAL_EDGE.studiedOn, when: ["weaponAttack", { typeStudied: true }] }] }] } },
    // *When you have moved at least 10 feet this turn, your next attack this turn deals 1 more damage per rank*: a
    // promise to the next attack, laid by the move door (`layLeapingStrike`).
    "leaping-strike": { wh: { leap: true, damage: true } },
    // *In dim light or darkness, you have a Boon on Stealth Tests. Your first attack while hidden deals extra damage
    // equal to your rank plus your tier*: the table's line on a Stealth Test, and a damage line on a hidden attack.
    "night-eyes": { damage: damage(["all"], "attack", { amount: "rank+tier", when: "hidden" }), wh: { skill: WT.NIGHT_EYES.skill } },
    // *Once a round, after you hit, you may spend 2 Tempo to make one more attack against the same target. At rank 2 it
    // costs 1 Tempo*: a button on the hit's card, paid at the press, one roll.
    "second-cut": { extraStrike: { target: "same", count: 1, cost: { pool: WT.SECOND_CUT.pool, amount: WT.SECOND_CUT.cost }, triggered: true,
      atRank: [{ rank: 2, cost: { pool: WT.SECOND_CUT.pool, amount: WT.SECOND_CUT.rank2Cost } }] } },
    // *When you inflict a Critical Injury, gain 1 Tempo per rank*: a further gain on the critical hit.
    "kill-rhythm": { momentum: { pool: WT.KILL_RHYTHM.pool, amount: "rank", when: "critical" } },
    // *When an effect lets you halve its damage with a successful Reflex Resilience Test, you take no damage on a success
    // and half on a failure* (T5): the Apply door's question (`nineLivesFor`).
    "nine-lives": { wh: { evasion: true } },
    // *Once a round, when you hit with a weapon, you may spend 2 Tempo to make one attack with a Boon against a
    // different creature within your reach*: a button on the hit's card, paid at the press, one roll with a Boon.
    "cats-dance": { extraStrike: { target: "other", count: 1, cost: { pool: WT.CATS_DANCE.pool, amount: WT.CATS_DANCE.cost }, boons: WT.CATS_DANCE.boons, reach: true, weapon: true, triggered: true } }
  },
  // **THE SOVEREIGN** (04's Dominion, Vainglorious and Ravenous; the San'layn and Sovereign plan's Phase 5).
  // Every number is `rules/sovereign-talents.mjs`' (ST), held to 04 at every rank by
  // `sovereign-talents.test.mjs`, and every door is `effects/sovereign-features.mjs`' - named, function by
  // function, in `ST.SOV_DOORS`, which the test slices with the comments blanked. A Use's `onUse.sov` is
  // judged by `judgeSovereignUse` and landed by `landSovereignUse`; `sov` itself names what the row does.
  sovereign: {
    /* ---- Dominion ---- */
    // *When a creature repeats a Resilience Test to end one of your blood curses, it takes a −1 penalty per
    // rank on that Test*: the repeat's prompt, its DC raised by the rank (`postCurseRepeats`).
    "sovereign-will": { automated: "inline", sov: { will: ST.SOVEREIGN_WILL.perRank } },
    // *While a creature is under your blood curse, its Speed falls by 5 feet per rank*: stamped on the curse's
    // own effect at the lay (`bloodCurseEffectData`).
    "heavy-tread": { sov: { tread: ST.HEAVY_TREAD.perRank } },
    // *When a creature succeeds on a Resilience Test to end your blood curse, it takes Shadow damage equal to
    // your tier*: the repeat's success (`curseRepeatLanded`), and 07's own escape on a curse.
    "price-of-defiance": { sov: { price: true } },
    // *... it is Slowed until the end of its next turn. At rank 2, it also takes a Bane on its next Attack Test*.
    "lingering-decree": { sov: { inflicts: [ST.LINGERING_DECREE.condition], bane: ST.LINGERING_DECREE.baneRank } },
    // *... each of its weapon attacks deals 1 less damage per rank*: the damage door's attacker-keyed step.
    "unworthy-hand": { sov: { cut: ST.UNWORTHY_HAND.perRank } },
    // *Once a round, when a creature other than your prey fails ... gain 1 Tribute. At rank 2, twice a round*.
    "homage": { sov: { homage: true } },
    // *As a Half-Action, spend 6 Vitae ... Body Resilience Test ... 30 feet ... At rank 2, ... Slowed*.
    "bound-to-the-court": {
      grants: grant({ action: "half", cost: cost("vitae", ST.BOUND_TO_THE_COURT.vitae), resist: ST.BOUND_TO_THE_COURT.resilience }),
      onUse: { sov: { bound: true } }, sov: { leash: ST.BOUND_TO_THE_COURT.leash, inflicts: ["slowed"] }
    },
    // *... you may lay that spell's blood curse on another creature within a 15 ft radius of it ... no Vitae*:
    // an offer card on the death (`onSovereignDeath`).
    "example-to-others": { sov: { example: true } },
    // *... it is Frightened of you until the end of its next turn. At rank 2, Price of Defiance deals ...*.
    "no-pardon": { sov: { inflicts: [ST.NO_PARDON.condition] } },
    // *Once per encounter, as a Half-Action, spend 3 Tribute ... Prone and Stunned ... Only your prey is Stunned*.
    "kneel": {
      grants: grant({ action: "half", cost: cost("tribute", ST.KNEEL.tribute), uses: uses(1, "encounter"), resist: ST.KNEEL.resilience }),
      onUse: { sov: { kneel: true } }, sov: { inflicts: ["prone", "stunned"] }
    },
    // *Your Blood Prison costs 6 Vitae. It deals Shadow damage equal to twice your tier plus your Charisma
    // modifier*: the price a patch on the feature's stamp (10 to 6), the damage read at the turn's end.
    "gilded-cage": { modifies: mod("Blood Prison", { cost: { delta: ST.GILDED_CAGE.vitae - ST.BLOOD_PRISON.vitae } }), sov: { cage: true } },
    // *Once per Long Rest, as an action, spend 15 Vitae ... you control it on your turns for 1 minute*.
    "abject-obedience": {
      grants: grant({ action: "action", cost: cost("vitae", ST.ABJECT_OBEDIENCE.vitae), uses: uses(1, "long"), resist: ST.ABJECT_OBEDIENCE.resilience }),
      onUse: { sov: { obedience: true } }
    },
    /* ---- Vainglorious ---- */
    // *You may take this talent once you have Prim and Proper. Your Prim and Proper grants 1 additional
    // temporary Health per rank*: the take is gated (`talents.mjs#canTake`), the Health read at the Use.
    "gilded-skin": { sov: { tempHealth: ST.GILDED_SKIN.perRank, needs: ST.GILDED_SKIN.needs } },
    // *Once a round, when an attack misses you, gain 1 Tribute. At rank 2, twice a round*.
    "beneath-me": { sov: { beneath: true } },
    // *... you regain 1 additional Health*: the one healing door (`healExtra`).
    "exquisite-taste": { sov: { heal: ST.EXQUISITE_TASTE.add } },
    // *While you have temporary Health, your Defense rises by 1 per rank*: derived on the character.
    "untouchable": { sov: { stat: "defense", tempHealth: true } },
    // *Once a round, spend 2 Tribute. Shed one condition that a Resilience Test could have prevented. At rank
    // 2, it costs 1 Tribute*: the Use judges the price at its rank and pays it once judged.
    "above-such-things": { grants: grant({ action: null }), onUse: { sov: { above: true } } },
    // *... the Health it would restore above your maximum becomes temporary Health, up to 3 per rank plus your
    // Charisma modifier*: the one healing door (`healExtra`).
    "overflowing-cup": { sov: { heal: 0, tempHealth: ST.OVERFLOWING_CUP.perRank } },
    // *When a creature's attack misses you, your next attack or spell against that creature ... takes a Boon*.
    "insolence-repaid": { sov: { insolence: true } },
    // *Once per encounter, as a Reaction when an attack hits you, spend 3 Tribute. You take no damage from that
    // attack. You then move up to 15 feet*: the negating Reaction (Afterimage's door), then the step.
    "mirrored-self": {
      grants: grant({ action: "reaction", cost: cost("tribute", ST.MIRRORED_SELF.tribute), uses: uses(1, "encounter") }),
      onUse: { mitigate: "negate", sov: { mirrored: true } }
    },
    // *While you have 1 or more Tribute, you cannot be Frightened. At rank 2, ... Charmed*: derived.
    "serene-disdain": { sov: { immune: true } },
    // *Once per Long Rest, when a blow would drop you to 0 Health, you may spend all your Tribute*: the one
    // hold at 1, its use the counter's; a press of the counter refuses in words.
    "too-beautiful-to-die": { automated: "inline", grants: counter(1, "long"), onUse: { sov: { offered: true } }, sov: { tempHealth: true, hold: true } },
    // *Once a round, when your temporary Health ... absorbs all of a blow's damage, gain 1 Tribute*.
    "unmarred": { automated: "inline", sov: { unmarred: true, tempHealth: true } },
    // *Your Tribute cap rises by 2. ... While you have 5 or more Tribute, weapon attacks against you take a Bane*.
    "the-crimson-throne": { sov: { stat: "tributeCap", throne: true } },
    /* ---- Ravenous ---- */
    // *Your claw hits deal 1 additional Shadow damage per rank. You may make your Off-Hand Attack with your
    // claws in a turn in which you do not Attack ... At rank 3, ... two attack rolls*: the Shadow a fired row
    // (`sovereignOnHit`); the free attack and the rolls WEAPON's (`initiative.mjs#freeOffHand`, `offHandRolls`).
    "blooded-claws": { sov: { damage: ST.BLOODED_CLAWS.perRank, uses: "tier" } },
    // *As a Half-Action, spend 2 Vitae. Until the end of your turn ... At rank 2, ... your next turn*.
    "sanguine-edge": { grants: grant({ action: "half", cost: cost("vitae", ST.SANGUINE_EDGE.vitae) }), onUse: { sov: { sanguine: true } } },
    // *When your claws hit a creature that is Bleeding, Prone or Stunned, you may spend 1 Tribute*: an offer card.
    "tasting-bite": { sov: { tempHealth: true, offer: "tastingBite" } },
    // *When your claws hit your prey, you may spend 1 Tribute to latch on to it ... At the start of each of
    // your turns ... you regain that much Health*: an offer card, the latch and the holder's turn start.
    "latch-on": { automated: "inline", sov: { offer: "latchOn", turnStart: true, heal: true } },
    // *When your claws hit a creature, it is Bleeding 2 ... At rank 2, it is Bleeding 3 ... one extra claw attack
    // roll*: the Bleeding on the claw-hit door; the roll WEAPON's (`offHandRolls`).
    "raking-claws": { automated: "inline", sov: { inflicts: ["bleeding"] } },
    // *When you cast a Death spell as a Half-Action, your next weapon or claw attack ... takes a Boon. At rank
    // 2, ... costs 2 less Vitae, to a minimum of 1*.
    "crimson-flourish": { sov: { discount: ST.CRIMSON_FLOURISH.discount } },
    // *In a fight, you may also feed (The Blood Royal) on a Bleeding creature within your reach ...*: CORE's
    // feeding judgement and return read the rank (`feedVerdict`, `feedingReturn`).
    "drink-deep": { automated: "inline", sov: { feed: true } },
    // *As a Half-Action, spend 5 Vitae. Each Bleeding enemy within your reach ...*.
    "bloodletting": { grants: grant({ action: "half", cost: cost("vitae", ST.BLOODLETTING.vitae) }), onUse: { sov: { bloodletting: true } }, sov: { tempHealth: true } },
    // *Once per encounter, as a Half-Action, spend 4 Vitae. Move to an unoccupied space within your reach of
    // your prey ... 30 feet ... At rank 2, the range is 60 feet*.
    "blood-rush": { grants: grant({ action: "half", cost: cost("vitae", ST.BLOOD_RUSH.vitae), uses: uses(1, "encounter") }), onUse: { sov: { bloodRush: true } } },
    // *Once a round, when a creature within your reach dies while it is Bleeding or under your blood curse ...
    // feed on it, making no Test, for half the Vitae*: an offer card on the death.
    "last-draught": { sov: { feed: true, offer: "lastDraught" } },
    // *Once a round, you may cast a Death spell that costs an action as a Half-Action, if it targets only one
    // creature ... within your reach. It costs 3 more Vitae*: the cast dialog's Half-Action line.
    "swift-hunger": { castAs: { action: "half", from: "action", schools: ["death", "shadow"], perRound: 1, surcharge: ST.SWIFT_HUNGER.surcharge, oneInReach: true }, sov: { swift: true } },
    // *Once per Long Rest, as a Half-Action, spend 35 Vitae. For 1 minute you take your Blood Monarch form ...*.
    "blood-monarch": { grants: grant({ action: "half", cost: cost("vitae", ST.BLOOD_MONARCH.vitae), uses: uses(1, "long") }), onUse: { sov: { monarch: true } } }
  }
});

/* -------------------------------------------- */
/*  Damage a talent adds (D-711 phase 2)         */
/* -------------------------------------------- */

/** The two lanes damage travels on. A row may name one or both. */
export const DAMAGE_LANES = Object.freeze(["attack", "spell"]);

/** Every `when` a `damage` row may carry, and whether the DOOR can read it. */
export const DAMAGE_FACTS = Object.freeze({
  // The attacker's own combatant flag, written where a blow is applied.
  damagedTarget: true,
  lunarTarget: true,
  // Measured: exactly one enemy inside the roller's reach (06, D-669).
  engagedOne: true,
  // The bond (D-643).
  boundDemon: true,
  // The roller says so: 06 §7's Riposte is a Reaction's blow after a Parry.
  riposte: true,
  // 04's Shadowform (D-774): no Holy dealt and no heal given since the priest's
  // last turn, off the priest's own `lightUsed` flag - readable in a fight.
  shadowform: true,
  // 04's Combustion (D-775): the target carries an Ignite tick this roller laid.
  ignited: true,
  // 04's Engineering Upgrade (*your Gnomish Battle Rig's attacks deal 1 more damage
  // per rank*; the lead: *"Yes, the fist too"*): the roller wears the Gnomish Battle
  // Rig (`AzerothActor#shape`, the Legacy branches' B2).
  battleRig: true,
  // 04's Night Eyes (*Your first attack while hidden*; the Witch Hunter plan's wave 2b): the attacker is hidden as the
  // attack door reads it (`effects/stealth.mjs#isHiddenFor`), before the roll's reveal.
  hidden: true,
  // **THE TABLE'S CALL** (D2 §12), so never auto-checked.
  flanking: false,
  judgement: false
});

/** Whether a row's `applies` reaches a lane. */
function laneMatches(applies, lane) {
  return applies === "both" || applies === lane;
}

/** Whether a row's `types` reach this damage type. `all` reaches every one. */
function typeMatches(types = [], type = "physical") {
  return types.includes("all") || types.includes(type ?? "physical");
}

/**
 * The damage rows the talents taken could add to THIS roll: the right lane,
 * the right damage type, and nothing that belongs to a bound creature or waits
 * on a Use.
 *
 * @param {Array} talents
 * @param {{lane?: "attack"|"spell", type?: string|null}} o  the damage type is
 *   the school for magical damage and `physical` otherwise (06 §4).
 * @returns {Array<{identifier, name, rank, amount, when, form, types}>}
 */
export function damageRowsFor(talents = [], { lane = "attack", type = "physical", alsoSpell = false, feature = false, scope = {} } = {}, rowOf = talentEffect) {
  const out = [];
  for (const { talent, entry } of takenRows(talents, rowOf)) {
    const d = entry.damage;
    if (!d) continue;
    // A bound creature's own bonus never reaches the owner's roll (D-643), and
    // an `until` row is switched on by using the feature, not by rolling.
    if (d.via || d.until) continue;
    // **AN SL-KEYED ROW LANDS AFTER THE DIE** (the Legacy branches' door 26: 04's
    // Critical Strike, *an attack of yours that reaches SL 2 adds ...*): it is no
    // dialog line, since the Success Level does not exist until the roll -
    // `slDamageFor` is its one reader, inside `rollTest`.
    if (Number(d.sl) > 0) continue;
    // **A CLAUSE A RANK REACHES** (04's Hunter's Riposte: *At rank 2, a Riposte ... deals extra damage*; the Witch Hunter
    // plan's wave 2b): a row naming `minRank` is no line below it.
    if (Number(d.minRank) > 0 && (Number(talent.taken) || 0) < Number(d.minRank)) continue;
    // **A WEAPON BLOW THAT COUNTS AS A SPELL'S** (04's Elemental Blademaster; the
    // lead, 2026-10-03, on O-190; D-779): `alsoSpell` lets a spell row reach the
    // attack lane where the door found the blow magical.
    // A feature need not make a Casting Test. Keep its provenance separate
    // from the damage lane so "spells and features" never includes ordinary weapons.
    if (!laneMatches(d.applies, lane) && !(alsoSpell === true && laneMatches(d.applies, "spell"))
      && !(feature === true && d.features === true)) continue;
    if (!typeMatches(d.types, type)) continue;
    const rank = Number(talent.taken) || 1;
    out.push({
      identifier: talent.identifier,
      name: talent.name,
      rank,
      // The door's ability scope (door 16): an amount may name a modifier.
      amount: evaluateAmount(String(d.amount ?? "rank"), { ...scope, rank }) ?? rank,
      when: d.when ?? null,
      form: d.form === true,
      types: [...(d.types ?? [])]
    });
  }
  return out;
}

/**
 * Those rows as the roll dialog's *Damage* lines: checked where the fact holds
 * and the door could read it, unchecked where the TABLE decides (D2 §12).
 *
 * A row that asks for a Shapeshift form is not offered at all out of one - a
 * line that can never hold is noise on every dialog.
 *
 * @param {Array} rows      `damageRowsFor`'s output
 * @param {object} facts    what the door measured: `{damagedTarget, engagedOne,
 *                          boundDemon, riposte, form}`
 */
export function damageLinesFor(rows = [], facts = {}) {
  const out = [];
  // **A GATE OBJECT IS READ BY THE ONE PREDICATE** (the Legacy branches' doors 15
  // and 17, `rules/talent-gates.mjs`): a target's condition or kind, the user's
  // marks, what the user wields and wears. The TABLE's own facts (flanking, a
  // judgement) never tick a line through it either (D2 §12).
  const doorFacts = Object.fromEntries(Object.entries(facts ?? {}).filter(([k]) => DAMAGE_FACTS[k] !== false));
  for (const row of rows) {
    if (row.form && facts.form !== true) continue;
    // A line whose wield half fails can never hold this roll (door 15), the form
    // row's rule: *While you wield a two-handed weapon* with none in hand.
    if (wieldFails(row.when, facts.wield ?? null)) continue;
    const named = row.when === null || typeof row.when === "string";
    const readable = row.when === null || (typeof row.when === "string" && DAMAGE_FACTS[row.when] === true);
    out.push({
      id: `talent-damage-${row.identifier}`,
      identifier: row.identifier,
      name: row.name,
      amount: row.amount,
      when: row.when,
      // The words are `lang/en.json`'s; this module is pure and names the key.
      label: `AZEROTH.Dialog.DamageWhen.${gateLabel(row.when)}`,
      checked: row.when === null ? true : (named ? (readable && facts[row.when] === true) : gateHolds(row.when, doorFacts) === true)
    });
  }
  return out;
}

/**
 * The rows a Use switches on (`until`), for `workflows.useFeature` to lay as a
 * self effect, with the changes already in v14's shape.
 *
 * The key is `system.damageBonus.<lane>.<type>` and the phase is `final`,
 * because the damage bonus is a DERIVED map: an `initial` change would land
 * before `prepareDerivedData` wrote the zeros over it (CLAUDE.md §15).
 */
export function damageBuffFor(entry, rank = 1) {
  const d = entry?.damage ?? null;
  if (!d?.until) return null;
  const amount = evaluateAmount(String(d.amount ?? "rank"), { rank }) ?? rank;
  if (!(amount > 0)) return null;
  // **A ROW THAT ASKS FOR A SHAPESHIFT FORM RIDES THE FORM LANE** (04's Berserk,
  // D-771: *your attacks in a Shapeshift form ... add your rank to their
  // damage*). An Active Effect cannot ask whether its bearer is in a form, so
  // the change lands on `system.damageBonus.form` and the attack door adds that
  // lane only while `inShapeshiftForm` holds - the buff outlives a leave and a
  // re-shift inside its span, and never reaches a blow struck in the druid's
  // own skin.
  const lanes = d.form === true ? [FORM_LANE] : (d.applies === "both" ? DAMAGE_LANES : [d.applies]);
  const changes = [];
  for (const lane of lanes) {
    // **A SECOND AMOUNT OF ITS OWN TYPE** (04's Arcane Power: *your spells add 1
    // Arcane damage per rank*; D-777, the lead: *"Different damage types in one
    // attack are possible"*): `as` names the type the amount IS, on the TYPED
    // lane, and every blow of the lane carries it beside its own damage
    // (`spell-bonus.mjs#typedExtras`), each met by its own Ward.
    if (d.as) {
      changes.push({ key: `system.damageBonus.${TYPED_LANE}.${lane}.${d.as}`, type: "add", value: String(amount), phase: "final" });
      continue;
    }
    for (const type of d.types ?? []) {
      changes.push({ key: `system.damageBonus.${lane}.${type}`, type: "add", value: String(amount), phase: "final" });
    }
  }
  return changes.length ? { until: d.until, amount, changes } : null;
}

/**
 * The lane an attack in a Shapeshift form adds besides `attack` (D-771). The
 * character's derived `system.damageBonus` carries it beside the two lanes,
 * every key zero, and only the attack door reads it - and only in a form.
 */
export const FORM_LANE = "form";

/**
 * **THE TYPED LANES** (D-777): what a standing effect adds to every blow of a
 * lane AS ITS OWN TYPE - `system.damageBonus.typed.<lane>.<type>` - rather than
 * to that type's blows. 04's Arcane Power is the first: *your spells add 1
 * Arcane damage per rank*, so a Fire spell lands its Fire and a second, Arcane
 * amount the target's Arcane Ward meets.
 */
export const TYPED_LANE = "typed";

/**
 * The `damage` rows that land on a BOUND creature rather than on the owner's
 * roll (`via: "bound"`).
 *
 * **These are already built and this table only records them**: `rules/bound
 * .mjs#boundEffects` has laid Bestial Wrath's, Demonic Empowerment's and Call
 * of Flame's on the creature's own `system.damageBonus` since D-643, and
 * `talent-effects.test.mjs` holds the two against each other so a number cannot
 * move in one and not the other. Nothing new reads this; it is the census's
 * answer for why those three rows need no door here.
 */
export function boundDamageRows() {
  const out = [];
  for (const [cls, rows] of Object.entries(TALENT_EFFECTS)) {
    for (const [identifier, entry] of Object.entries(rows)) {
      if (entry.damage?.via === "bound") out.push({ cls, identifier, damage: entry.damage });
    }
  }
  return out;
}

/** The words the census reads for (the test holds the table to them). */
export const GRANT_RE =/\bAs (?:a|an) (?:Reaction|Half-Action|Full Action|action)\b|\bspend (?:a|an) (?:Full Action|Half-Action|Reaction|action)\b|\bOnce (?:per|a|an) [A-Za-z ]*(?:Rest|encounter|round)\b,? (?:spend|as|you may spend|make)/i;
export const MODIFY_RE = /class feature/i;
export const SPELL_RE = /\bcast\b/i;
/** "You know Fireball": the forty-six spell talents, case-sensitive so "a target you know" is not one. */
export const KNOW_RE = /\bYou know\b/;
/**
 * A use rider the sheet can count (D-648): "You may use this a number of
 * times equal to your rank per Short Rest", "Once per Long Rest, ...".
 * Sentence-initial "Once" only, so a clause reached at rank 2 mid-sentence
 * ("At rank 2 it costs no Mana once per Short Rest") stays a note. And *one
 * more time per Long Rest* (Open Hand, D-752): a use ADDED to a feature's
 * count, which the census holds to a `uses` patch on that feature.
 */
export const USES_RE = /\ba number of times equal to your (?:rank|tier) per (?:Short|Long) Rest\b|(?:^|\. )Once per (?:Short|Long) Rest\b|\bone more time per (?:Short|Long) Rest\b/;
/**
 * *…adds 1 damage per rank*, *…deals 1 more damage per rank*, *Fire damage you
 * deal increases by 1 per rank* (D-711 phase 2). The AMOUNT has to sit beside
 * the word, which is what keeps *when you deal damage … 1 more Combo Point per
 * rank* and *misses or deals no damage … 5 feet per rank* out of it.
 */
export const DAMAGE_RE = /\b(?:adds?|deals?)\s+\d+\s+(?:\w+\s+){0,3}damage\b[^.]{0,60}\bper rank\b|\bdamage\b[^.]{0,30}\bincreases?\s+by\s+\d+\s+per rank\b/i;

/* -------------------------------------------- */
/*  The hardened census (D-768)                  */
/* -------------------------------------------- */

/**
 * The words 04 uses for a maneuver, a Reaction or a Half-Action (06 §2, §6, §7;
 * 05's Half-Action table): a talent that names one changes it, and the census
 * wants a row for it. Case-sensitive, with the inflections 04 writes.
 */
const MANEUVER_WORDS = Object.freeze([
  "Press", "Sunder", "Overbear", "called shot", "Disarm", "Drive Back", "Riposte",
  "Parr(?:y|ied|ies)", "Block(?:s|ed)?", "Opportunity Attacks?", "Disengag(?:e|ed|es)",
  "Steady", "Guard", "Assist", "Off-Hand Attacks?"
]);

/**
 * Class feature names that are also an ordinary word, a pool or a spell in 04's
 * prose - *Ward 1 per rank*, *your Quarry maximum*, *Drain Soul*, *Curse of
 * Agony*, *your Searing totem*, *your companion*, *Feral Charge* - and so say
 * nothing about the feature on their own. A talent that changes one of these
 * features says *class feature*, which `MODIFY_RE` already demands a row for.
 */
const AMBIGUOUS_FEATURES = new Set(["Ward", "Quarry", "Drain", "Curse", "Totem", "Companion", "Charge"]);

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A1's conditions as 04 writes them laid on somebody, with *Stun* and *Stuns*
 * (*also applies Stun*, *A creature it Stuns*). Written out rather than read
 * from `config.mjs`, which this pure module does not import; the census test
 * holds the list to `AZEROTH.conditions` so the two cannot drift.
 */
export const CONDITION_WORDS = "Bleeding|Blinded|Charmed|Deafened|Diseased|Entangled|Fatigued|Frightened|Numbed|Poisoned|Prone|Scorched|Silenced|Slowed|Stunned|Stuns?";

/** A maneuver's or a class feature's name in a talent's text (case-sensitive). */
const NAMES_FEATURE_RE = new RegExp(`\\b(?:${[
  ...MANEUVER_WORDS,
  ...[...new Set(Object.values(CLASS_FEATURES).flatMap(rows => Object.keys(rows)))]
    .filter(n => !AMBIGUOUS_FEATURES.has(n))
    .sort((a, b) => b.length - a.length)
    .map(n => `${escapeRe(n)}s?`)
].join("|")})\\b`);

/** A `modifies` row's patches with nothing in them but the feature's name. */
function emptyPatches(entry) {
  return modifiesOf(entry).filter(m => Object.keys(m).every(k => k === "feature"));
}

/** Whether any `passive` change on the row writes one of these keys. */
const passiveTouches = (entry, test) => (entry?.passive?.changes ?? []).some(c => test(String(c.key ?? "")));

/**
 * Whether a row's rider PAYS something (D-770): a pool and a price, a number or
 * `"all"`. `rules/riders.mjs#isRider` is the door's own reading; this is the
 * census's, kept here because that module reads this one and a census that
 * imported it back would be a cycle.
 */
const riderPays = r => Boolean(r?.cost && typeof r.cost.pool === "string" && r.cost.pool
  && (r.cost.amount === "all" || (Number.isInteger(r.cost.amount) && r.cost.amount > 0)));

/** Whether a rider's hit lays a condition at any rank: its own `onHit`, or a rank's clause. */
const riderInflicts = r => riderPays(r)
  && [r.onHit, ...(r.atRank ?? []).map(c => c?.onHit)].some(h => Boolean(h?.condition || h?.prone));

/** Whether a rider's hit, at any rank, waits on a Success Level (Shield Slam's rank 2, D-772). */
const riderSl = r => riderPays(r)
  && [r.onHit, ...(r.atRank ?? []).map(c => c?.onHit)].some(h => Number(h?.sl) > 0);

/** Whether a rider's hit restores the striker's Health (Bloodthirst, D-772). */
const riderHeals = r => riderPays(r) && r.onHit?.heal !== null && r.onHit?.heal !== undefined;

/**
 * **THE WORDINGS THAT SLIPPED THROUGH WITH NO ROW** (D-768). The census above
 * demands a row for four shapes of sentence, and the audit for the plan found
 * about eighty talents whose text plainly does something and whose row is
 * missing, partial or empty - Mortal Strike, Blood Craze, Shield Slam, Redoubt
 * and Mangle among them. Each detector is a wording and what COVERS it: a row
 * kind that can carry that mechanic. A talent the wording finds and nothing
 * covers lands on the worklist (`talentCensus`); a row that is `inline` (applied
 * by name), `none` (the table's, with its reason) or `gap` (its own worklist
 * entry) is covered by all of them.
 *
 * Every pattern is matched against WHITESPACE-FLATTENED text, because 04 is
 * hard-wrapped and a sentence can straddle a newline in the pack's HTML.
 *
 * `rider` (Phase 2a's attack riders, D-770) is built: a row carrying one that
 * PAYS something clears *as part of an attack, spend*, one whose hit lays a
 * condition clears an infliction, and one carrying a `discount` clears *costs
 * N less*. A rider with nothing in it clears nothing. `tick` (a talent's raise
 * of a spell's tick), a granted feature's `tick` and a patch's `tickRounds` clear
 * a start-of-turn sentence; `nextSpell` and `momentum` with a Success Level clear
 * an SL trigger; `heal`, `shares` and a tick clear a restore of Health;
 * `tickWard` clears a Ward per rank (D-771). `tempHealth` (D-777) clears 05's
 * temporary Health: `system.health.temp` is its field now.
 */
export const CENSUS_DETECTORS = Object.freeze({
  // *As part of an attack, spend 8 Rage*, *When one of your attacks hits, spend 6 Rage*.
  attackSpend: {
    re: /\b(?:as part of an attack|when (?:one of )?your attacks? hits?)\b[^.]*?\bspend\b/i,
    covers: e => riderPays(e.rider)
  },
  // *costs 2 Zeal less per rank*, *cost 1 less Mana*, *2 Mana less per rank*.
  // A next spell's discount (Nature's Grace, Predator's Swiftness; D-771).
  costsLess: {
    re: /\bcosts?\s+\d+\s+(?:\w+\s+)?less\b|\b\d+\s+(?:Mana|Rage|Zeal|Focus|Energy|Ferocity|Quarry|Combo Points?)\s+less\b/i,
    covers: e => Boolean(e.discount || e.rider?.discount || e.nextSpell?.amount || e.castLine?.free) || modifiesOf(e).some(m => m.cost?.delta !== undefined)
      // And D-775's: a school's spells made cheaper for good (Emberstorm) or while
      // a Use's state stands (Icy Veins).
      || Boolean(e.spellCost?.less || e.onUse?.veins?.less)
      // And D-778's: a Sustain's upkeep made cheaper (Arcane Concentration).
      || Boolean(e.upkeep?.less)
      // And the Necromancer's (Phase 4c-T; `rules/necromancer-talents.mjs`): Flesh Offering's Mana and Practiced Stitcher's Essence.
      || Boolean(e.necro?.discount)
      // And the Sovereign's (Phase 5): Crimson Flourish's 2 less Vitae on a Half-Action Death spell.
      || Boolean(e.sov?.discount)
      // And the class talent audit's Adrenaline (class agent B, D-1881): a Rogue spend's Energy, for good.
      || Boolean(e.classDiscount)
      // And the class talent audit's Overchanneller (class agent C, D-1890): each point's price.
      || Boolean(e.overchannel?.less)
      // And the Witch Hunter's (wave 2b): the Sign discounts (`signCost`) and the two maneuvers (`maneuverCost`).
      || Boolean(e.wh?.discount)
  },
  // *your Block reduces 1 more damage per rank*, *you take 2 less damage*.
  // A Block's own bonus (Redoubt, Shield Wall; D-772).
  reducesDamage: {
    re: /\breduces?\s+\d+\s+more\s+damage\b|\btakes?\s+\d+\s+less\s+damage\b/i,
    // And a laid Ward's reduction on every source (Shield Discipline, D-774).
    covers: e => passiveTouches(e, k => k === "system.damageReduction") || Boolean(e.aura?.damageReduction) || Boolean(e.block?.add)
      || modifiesOf(e).some(m => m.reduction !== undefined)
      // And D-779's: a talent the lead REWORKED, whose 04 words are drafted for
      // change (Main Gauche's free Parry, O-180; `book-edits-2.md` (a)).
      || Boolean(e.reworked)
  },
  // *recover 1 Health per rank*, *restores Health equal to your tier*. Never
  // *recovers no Health* (Mortal Strike), which is a refusal.
  // A heal a feature gives, a tick it lays, what a talent adds to a heal given
  // (Gift of Nature) and a heal shared (Symbiosis; D-771).
  // And a turn's start (Blood Craze), a rider's hit (Bloodthirst) and a share
  // of another's healing (Beacon; D-772).
  restoresHealth: {
    re: /\b(?:restores?|recovers?|regains?)\s+(?!no\b)(?:[\w-]+\s+){0,3}?Health\b/i,
    // And D-774's: a Ward that atones, Health back off a blow of a type (Vampiric
    // Touch), a melee attack's own (Earthliving) and a tick a spell is given
    // (Ancestral Tide).
    covers: e => Boolean(e.grants?.heal || e.grants?.tick || e.tick || e.heal?.add || e.shares?.heal || e.turnStart?.heal || e.beacon?.share)
      || riderHeals(e.rider) || modifiesOf(e).some(m => m.heal || m.tickRounds || m.atone?.heal)
      || Boolean(e.drain?.heal || e.earthliving?.heal || e.spell?.addTick)
      || e.restorativeTotem === "Healing Stream"
      // And D-775's: Siphon's turn-start Health, and Health on a death (Soul
      // Reaper's, Haunt's).
      || Boolean(e.siphon || e.death?.heal || e.onUse?.haunt?.heal)
      // And D-777's: a hold that restores (Guardian Spirit), and Aegis of the
      // Light's heal when the floor that held a creature ends.
      || Boolean(e.holds?.heal || e.aegis?.heal)
      // And D-778's: a heal on every healing feature of any class (Devotion).
      || Boolean(e.healing?.heal)
      // And D-779's: a font whose charges heal (Lightwell).
      || Boolean(e.onUse?.lightwell)
      // And the Legacy branches' (B3): Health back for the damage a Use dealt (Life
      // Drain's *You recover Health equal to the damage it takes*).
      || e.onUse?.healsDealt === true
      // And phase B6's: every Dying friend in reach restored and stood (Ancestor's
      // Hand, `onUse.lift`), and the ONE cast filter that lets *spells that restore
      // Health* through - from the Spirit Realm (The Crossing's `spiritRealm.heals`)
      // and under Ethereal Form (`rules/spirit-realm.mjs#castFilterRefusal`).
      || Boolean(e.onUse?.lift) || e.spiritRealm?.heals === "others" || Boolean(e.onUse?.ethereal)
      // And the Chromatic Champion's (stage 3A): Lifebinder's Flame's split and what the
      // Life-Binder adds to it (`chromatic-talents.mjs#lifebinderFor`), and Hearthfire's ring.
      || Boolean(e.lifebinder || e.hearthfire)
      // And the Timewalker's (stage 3B): Rewind's Health back off the blow's record.
      || Boolean(e.rewind)
      // And the Chronomancer's (stage 2b): Withering Hours' halving of what a heal gives inside
      // the area (`chronomancer.mjs#witheredHeal`, read at `AzerothActor#applyHealing`).
      || Boolean(e.withering)
      // And the Death Knight's (run F4a; `rules/death-knight-talents.mjs`): Blood Shield's grant on
      // Death Strike's restore, Grim Harvest's and Rune Tap's Health, Mark of Blood's heal after
      // the blow, Vampiric Blood's raise, Sanguine Tide's Health for each creature, Dancing
      // Runeweapon's half, and Sanguine Plague's patch.
      || e.tempHealth?.on === "deathStrike" || Boolean(e.dk?.harvest || e.dk?.tide)
      || Boolean(e.onUse?.dk?.regain || e.onUse?.dk?.markOfBlood || e.onUse?.dk?.vampiric || e.onUse?.dk?.dancing)
      || modifiesOf(e).some(m => m.plagueHeals)
      // And the Necromancer's (Phase 4c-T; `rules/necromancer-talents.mjs`): Gorge, the mendings, Life for a Life's
      // hold, Dark Communion and The Black Rite.
      || Boolean(e.necro?.heal)
      // And the Sovereign's (Phase 5): Exquisite Taste and Overflowing Cup at the one healing door, Latch On's
      // turn-start drain (`healExtra`, `sovereignTurnStart`).
      || (e.sov?.heal !== undefined && e.sov?.heal !== null && e.sov?.heal !== false)
      // And the Demon Hunter's (Phase 5): Soul Hunger's devour, Gorging Lash's Health on a Fel Lash hit and a
      // Crystalized Soul's Health (`effects/demon-hunter-talents.mjs`, `rules/demon-hunter-talents.mjs`).
      || e.dh?.heal === true
      // And the class talent audit's Benediction (class agent A, D-1875): Twofold Light's share and Fervor's Zeal
      // at the healing door (`effects/audit-martial.mjs#martialAfterHeal`), and Divine Favor's Holy healing spell
      // cast at a Half-Action (`castAs.healing`).
      || e.martial?.kind === "twofold" || e.martial?.kind === "fervor" || e.castAs?.healing === true
      // And class agent B's (D-1887): Tide of the Ancestors' heal at the shaman's turn start
      // (`effects/audit-cunning.mjs#shamanTurnStart`).
      || Boolean(e.onUse?.tide?.heal)
      // And the Witch Hunter's (wave 2b): Potent Brews' Health on an elixir, at the brew's stamp (`stampBrew`).
      || e.wh?.heal === true
  },
  // *Your Fortitude rises by 2 per rank*, *your Defense rises by 1 per rank*.
  risesBy: {
    re: /\b(?:rises?|increases?)\s+by\s+(?:\d+|a third|half)\b/i,
    // And a weapon's maximum Range (Longshot) and Defense after a walk (Fleet
    // Footed; D-773).
    covers: e => Boolean(e.passive || e.damage || e.aura || e.range || e.moved || e.firstAttack) || modifiesOf(e).some(m => Object.keys(m).length > 1)
      // And D-779's: Armor Points a turn without a move lays (Bracing).
      || Boolean(e.bracing)
      // And the Legacy branches' (B3): Armor Points and Ward a Use lays for the
      // encounter (The Mountain Wakes' *your Armor Points rise by 2*).
      || Boolean(e.onUse?.armor)
      // And the Necromancer's (Phase 4c-T; `rules/necromancer-talents.mjs`): Grim Sacrament's cap on Dark Ritual.
      || Boolean(e.necro?.cap)
      // And the Sovereign's (Phase 5): Untouchable's Defense and the Crimson Throne's Tribute cap, derived.
      || Boolean(e.sov?.stat)
      // And the class talent audit's Curse of Agony (class agent C, D-1891): a tick that rises.
      || Boolean(e.tickRise)
      // And the Witch Hunter's (wave 2b): Living Rowan's Ward and Seasoned Blood's Toxicity limit, each read by its own door.
      || Boolean(e.wh?.stat)
  },
  // A number per rank beside Defense, Armor Points or Ward: *1 more Defense per
  // rank*, *Ward 1 per rank*, *ignore 2 Armor Points per rank*. Not *your Ward
  // class feature*, which is the Priest's feature and not the score.
  // A heal over time's Ward (Nature's Ward, D-771) is laid with the tick.
  // And the next attack's Pierce (Precise Strike) and a Ward named at a Long
  // Rest (Blessed Plate; D-772).
  perRankStat: {
    re: /\b(?:Defense|Armor Points?|Ward(?! class feature))\b[^.]{0,25}?\b\d+\b[^.]{0,25}?\bper rank\b|\b\d+\s+(?:more\s+|further\s+)?(?:Defense|Armor Points?|Ward)\b[^.]{0,30}?\bper rank\b/i,
    // And D-773's: a Ward laid by a Use (Cloak of Shadows), Armor Points an
    // attack from hiding ignores (Find Weakness), Defense after a walk (Fleet Footed).
    covers: e => Boolean(e.passive || e.aura || e.tickWard || e.onUse?.nextAttack?.penetration || e.plate
      || e.onUse?.ward || e.hidden?.pierce || e.moved
      // And D-774's: Ward a Holy blow ignores (Chastise), a Fire spell's on a use
      // (Lava Burst), and Armor Points against the first attack (Rockbiter).
      || e.spell?.ignoresWard || e.castLine?.pierce || e.firstAttack
      // And D-779's: Bracing's Armor Points, and the Ward 07's Barrier gives the
      // creatures chosen (Barrier's rank).
      || e.bracing || e.chosenWard
      // And the Legacy branches' (B1): Armor Points a gated attack ignores (The Long
      // Watch's *your attacks against it ignore 2 Armor Points*).
      || e.pierce
      // And the Sovereign's (Phase 5): Untouchable's Defense a rank while temporary Health lasts.
      || e.sov?.stat === "defense"
      // And the class talent audit's Precise Strike (class agent A, D-1870): a rider's Pierce on its own blow.
      || (e.rider?.onHit?.pierce !== undefined && e.rider?.onHit?.pierce !== null))
  },
  // 05's temporary Health (D-777): a grant at the healing door or on a named
  // spell (`tempHealth`), or a Use's own (Last Stand's `onUse.tempHealth`).
  temporaryHealth: {
    re: /\btemporary Health\b/i,
    // And Obsidian Skin's, on a spend of Void (stage 3A, `chromatic-talents.mjs#voidSpendFor`).
    covers: e => Boolean(e.tempHealth || e.onUse?.tempHealth) || e.voidSpend?.tempHealth !== undefined
      // And the Necromancer's (Phase 4c-T; `rules/necromancer-talents.mjs`): Gorge's and The Black Rite's Empowered lines,
      // the circle's turn starts and Sacrificial Strength.
      || Boolean(e.necro?.tempHealth)
      // And the Sovereign's (Phase 5): Gilded Skin, Overflowing Cup, Too Beautiful to Die, Tasting Bite and
      // Bloodletting.
      || Boolean(e.sov?.tempHealth)
      // And the Witch Hunter's (wave 2b): Bear's Endurance at the struck door (`effects/witch-hunter-talents.mjs#whWhenStruck`).
      || Boolean(e.wh?.tempHealth)
  },
  // *at the start of each of your turns*, *at the start of the target's turns*,
  // *anything starting its turn there*: a tick (the plan's Phase 2b).
  // A tick a talent raises (Moonfire), lays (Wild Growth) or lengthens
  // (Improved Regrowth; D-771).
  // And a talent's own turn-start Health (Blood Craze, D-772).
  startOfTurn: {
    re: /\bat the start of (?:each of )?(?:your|their|its|the target's)(?: next)? turns?\b|\bstarting its turn\b/i,
    // And a tick a spell is given (Ancestral Tide, D-774).
    covers: e => Boolean(e.tick || e.grants?.tick || e.turnStart || e.spell?.addTick) || modifiesOf(e).some(m => m.tick || m.tickRounds)
      // And D-775's: Ignite's tick, Siphon's turn start, and a Use's area that
      // strikes at the start of a turn (Firestorm).
      || Boolean(e.ignite || e.siphon || e.onUse?.areaTick)
      // And D-778's: a Sustain's upkeep, which the turn's start charges (Arcane
      // Concentration; Netherwind's patch on Shape the Weave).
      || Boolean(e.upkeep) || modifiesOf(e).some(m => m.upkeepLess)
      // And the class talent audit's (class agent C, D-1891, D-1892): Curse of Agony's rise, Improved
      // Moonfire's further rounds, Dark Harvest's turn start.
      || Boolean(e.tickRise || e.tickRounds || e.harvest)
      // And the Chronomancer's (stage 2b): Echoing Sands' landing at the caster's turn start
      // (`effects/chronomancer.mjs#landAgain`).
      || Boolean(e.echoing)
      // And the Guardian of Time's (stage 2c): the half Borrowed Time puts off and the rest
      // of a blow Borrowed Hour holds, landed at the turn's start (`deferred-damage.mjs`).
      || Boolean(e.borrowed || e.borrowedHour)
      // And the Necromancer's (Phase 4c-T; `rules/necromancer-talents.mjs`): Plague Carrier's tick, Regenerating Tissue's
      // mending, Restless Bones' stand and Unholy Fervor's Health loss.
      || Boolean(e.necro?.turnStart)
      // And the Sovereign's (Phase 5): Latch On's drain at the holder's turn start.
      || Boolean(e.sov?.turnStart)
      // And class agent B's (D-1886, D-1887): Eye of the Storm's strike and Tide of the Ancestors' heal
      // at the shaman's turn start (`effects/audit-cunning.mjs#shamanTurnStart`).
      || Boolean(e.eyeOfTheStorm || e.onUse?.tide)
  },
  // **THREE THE PLAN'S LIST DID NOT NAME** (D-768), each a family of talents
  // with no row and no carrier, found reading the worklist against 04: a
  // condition laid on a hit (*the target gains Bleeding*, *also applies Stun*,
  // *knocks them Prone*, *is blinded until*) - Phase 2a's `rider` carries
  // `onHit.condition`; a Success Level that triggers something (*When an attack
  // of yours reaches SL 2*); and a widened Critical Injury range (*a Critical
  // Injury on 19 or 20*). *A target that IS Entangled* is a check, not an
  // infliction, so the `is` form wants the *until* that ends what was laid.
  // A rider's hit, or a feature's card a patch makes lay one (Typhoon, D-771).
  // And an attack's own (Deep Cut) and a granted feature's card (Wrath of the
  // Light's Blinded; D-772).
  inflictsCondition: {
    re: new RegExp(`\\b(?:gains?|applies|knocks?\\s+(?:it|them|the target|everything))\\s+(?:also\\s+)?(?:${CONDITION_WORDS})\\b|\\b(?:is|are)\\s+(?:also\\s+)?(?:${CONDITION_WORDS})\\s+until\\b`, "i"),
    covers: e => riderInflicts(e.rider) || Boolean(e.hitLays?.condition)
      // A failed Resist's further condition (Void Eruption's Silenced, D-774).
      || (Array.isArray(e.spell?.onFail) && e.spell.onFail.length > 0)
      // A failed poison Test's Entangled (Paralytic at rank 2, D-773).
      || [e.poisonFail, ...(e.poisonFail?.atRank ?? [])].some(c => c?.entangle === true)
      || (e.grants?.inflicts ?? []).some(i => i?.condition)
      || modifiesOf(e).some(m => [m, ...(m.atRank ?? [])].some(c => Array.isArray(c?.inflicts) && c.inflicts.some(i => i?.condition)))
      // And D-778's: a Stun a failed escape lays (Deep Freeze).
      || Boolean(e.escape?.failStun)
      // And the class talent audit's Shattering Cold (class agent C, D-1890): the Stun a Frost blow lays.
      || Boolean(e.frozenStun?.condition)
      // And the Legacy branches' bodies (B2): a trap's condition (Shadow Trap's *is
      // Entangled until*) and what a bound creature's hit lays (Serpent Ward's *is
      // also Slowed until*).
      || Boolean(e.onUse?.trap?.condition) || (e.boundAttack?.lays ?? []).some(l => l?.condition)
      // And B1's own, which no cover named: a condition the Use lays on its user
      // (Ancestral Spirit's *You gain **Fatigued***, door 26).
      || Boolean(e.onUse?.self?.condition)
      // And the Chronomancer's (stage 2b): Arrested Moment's Stun on a failed Resist
      // (`effects/chronomancer.mjs#afterResist`).
      || Boolean(e.arrested?.condition)
      // And the Guardian of Time's (stage 2c): Grinding Block's Slowed on the attacker's
      // failed Test (`effects/guardian.mjs#grindAfterResist`).
      || Boolean(e.grind?.condition)
      // A condition a rank's clause lays on a hit (Relentless Advance's Entangled at rank 2).
      || (e.hitLays?.atRank ?? []).some(c => c?.condition)
      // And the Death Knight's (run F4a): Chill of the Grave's Slowed on a Death Coil's damage, a
      // feature's patch that slows (Icy Grip on Death Grip, Frozen Desecration), and Remorseless
      // Winter's Slowed and Entangled at a turn's start.
      || Boolean(e.dk?.coilSlows || e.onUse?.dk?.winter) || modifiesOf(e).some(m => m.slows?.condition)
      // And the Necromancer's (Phase 4c-T; `rules/necromancer-talents.mjs`): Surgeon's Hand's Plague Bladder and Grasping Arms.
      || (e.necro?.inflicts ?? []).length > 0
      // And the Sovereign's (Phase 5): Lingering Decree's Slowed, No Pardon's Frightened, Kneel's Prone and
      // Stunned, Bound to the Court's Slowed and Raking Claws' Bleeding.
      || (e.sov?.inflicts ?? []).length > 0
      // And the Demon Hunter's (Phase 5): Hobbling Reap's Slowed on a scythe hit (`dhTalentsOnHit`).
      || (e.dh?.inflicts ?? []).length > 0
  },
  // A row whose trigger IS a Success Level (D-771): Nature's Grace's next
  // spell and Primal Fury's further Ferocity. And D-772's: Deep Cut's
  // condition, an extra attack off a card (Flurry, Wide Swing), Illumination's
  // Mana, and a rider's rank whose hit waits on one (Shield Slam).
  slTrigger: {
    re: /\b(?:reaches|meets or exceeds|at)\s+SL\s+\d\b/i,
    covers: e => [e.nextSpell, e.momentum, e.hitLays, e.extraStrike, e.manaBack, e.charge, e.overload].some(r => Number(r?.sl) > 0) || riderSl(e.rider)
      // The Finisher's own SL (Ruthlessness, D-773), on its patch.
      || modifiesOf(e).some(m => Number(m.back?.sl) > 0)
      // A condition a granted feature's card offers at an SL (Pyroblast, D-775).
      || (e.grants?.inflicts ?? []).some(i => Number(i?.sl) > 0)
      // And D-778's: a Dispel that ends the holder's effect only at an SL
      // (Everlasting Affliction at rank 2).
      || Number(e.dispelGate?.sl) > 0
      // And at the rank (the class talent audit's Everlasting Affliction: *SL 1 per rank*; D-1891).
      || (typeof e.dispelGate?.sl === "string" && e.dispelGate.sl.length > 0)
      // And the Legacy branches' (B1): damage a hit adds at an SL (Critical Strike,
      // door 26), and a Test the user's own hit forces at one (Keening Arrows).
      || Number(e.damage?.sl) > 0 || Number(e.hitTest?.sl) > 0
      // And D-1019's: Killing Machine's two-handed half, a hit at SL 2 on its row's `alt`.
      || Number(e.dk?.killingMachine?.alt?.sl) > 0
      // And the class talent audit's Shield Slam at rank 2 (class agent A, D-1870): a hit at SL 2 ends a Sustain,
      // after the card stands (`effects/audit-martial.mjs#martialAfterCard`).
      || Number(e.martial?.sl) > 0
  },
  // A widened Critical Injury range (Executioner, D-772), and a spell's (Shatter, D-775).
  criticalRange: {
    re: /\bCritical Injury on \d+\b/i,
    covers: e => Number(e.critical?.on) > 0 || Number(e.spellCritical?.on) > 0
  },
  // A talent that names a maneuver, a Reaction, a Half-Action or a class
  // feature changes it: any row at all answers this one.
  namesFeature: {
    re: NAMES_FEATURE_RE,
    covers: () => true
  }
});

/** The census's detector keys, the order the worklist prints them in. */
export const CENSUS_KEYS = Object.freeze(["gap", "emptyPatch", ...Object.keys(CENSUS_DETECTORS)]);

/** A talent's text as the census reads it: tags out, whitespace flattened. */
export function censusText(text = "") {
  return String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * **THE WORKLIST** (D-768): every `(class, talent, detector)` the hardened
 * census finds, sorted - the floor each class phase of the plan drives to zero.
 *
 * - `gap`: the row says it is reviewed and not built (its own reason).
 * - `emptyPatch`: a `modifies` patch carrying only the feature's name, on a row
 *   that is not `inline` (applied by name elsewhere) and carries no `reason`
 *   saying the patch is the table's. The sheet showed the talent's name as a
 *   chip on the feature and nothing changed.
 * - every `CENSUS_DETECTORS` key whose wording the text carries and nothing on
 *   the row covers.
 *
 * Pure. `rowOf` is the table lookup, injectable so the census's own break tests
 * can hand it a row that covers or one that does not.
 *
 * @param {Array<{className: string, identifier: string, text?: string, effect?: string}>} talents
 * @param {{rowOf?: Function}} [o]
 * @returns {Array<{cls: string, identifier: string, detector: string}>}
 */
export function talentCensus(talents = [], { rowOf = talentEffect } = {}) {
  const out = [];
  for (const t of talents) {
    const cls = classKey(t.className);
    const entry = rowOf(t.className, t.identifier) ?? null;
    const text = censusText(t.text ?? t.effect ?? "");
    const hit = detector => out.push({ cls, identifier: t.identifier, detector });
    if (entry?.gap) hit("gap");
    if (entry && !entry.automated && !entry.reason && !entry.gap && emptyPatches(entry).length) hit("emptyPatch");
    for (const [key, d] of Object.entries(CENSUS_DETECTORS)) {
      if (!d.re.test(text)) continue;
      if (entry && (entry.automated || entry.gap || d.covers(entry))) continue;
      hit(key);
    }
  }
  const order = new Map(CENSUS_KEYS.map((k, i) => [k, i]));
  return out.sort((a, b) => a.cls.localeCompare(b.cls) || a.identifier.localeCompare(b.identifier)
    || (order.get(a.detector) ?? 99) - (order.get(b.detector) ?? 99));
}

/**
 * The census as `{class: {identifier: [detectors]}}`, every level sorted: the
 * shape the worklist is recorded in and printed from.
 */
export function censusByClass(rows = []) {
  const out = {};
  for (const { cls, identifier, detector } of rows) ((out[cls] ??= {})[identifier] ??= []).push(detector);
  return Object.fromEntries(Object.keys(out).sort().map(cls => [cls,
    Object.fromEntries(Object.keys(out[cls]).sort().map(id => [id, out[cls][id]]))]));
}

/* -------------------------------------------- */
/*  A class feature's damage (D-768)             */
/* -------------------------------------------- */

/**
 * **WHICH LANE A CLASS FEATURE'S DAMAGE RIDES** (D-768). `useFeature` built no
 * talent damage line and read no lane, so Elemental Fury never reached Forked
 * Lightning and Seal of Command's Holy never reached a feature.
 *
 * A feature that makes a CASTING TEST is resolved as a spell is - a Casting
 * Test against the Spell DC, its damage magical and through the Ward - so it
 * rides the spell lane, and a talent row reaching `spell` or `both` reaches it.
 * One that makes none is set by the character's own hand (Snare), so it rides
 * the attack lane. `both` rows reach either. **THE LEAD'S RULING** (2026-10-03):
 * asked whether *your spells* rows - Arcane Power, Lunar Guidance, Devastation,
 * Demonic Pact - reach a feature that makes a Casting Test, though 04 writes
 * *your spells and features* where it means both: *"Yes, casting features
 * count"* (D-768).
 *
 * @param {{casting?: boolean}} feature  the feature item's system
 * @returns {"spell"|"attack"}
 */
export function featureDamageLane(feature = {}) {
  return feature?.casting === true ? "spell" : "attack";
}

/**
 * The Damage lines the roller left ticked - or, with no dialog, the ones that
 * came ticked - summed, with their names (D-711 phase 2). One function for the
 * roll dialog and the feature door (D-768), so a skipped dialog and a feature
 * that opens none count the same lines.
 *
 * @param {Array<{id: string, name: string, amount: number, checked: boolean}>} lines
 * @param {Set<string>|null} [checked]  the ids the form left ticked, or null for the lines' own state
 * @returns {{extraRating: number, damageRows: Array<{name: string, amount: number}>}}
 */
export function damageChosen(lines = [], checked = null) {
  const kept = (lines ?? []).filter(l => (checked ? checked.has(l.id) : l.checked));
  return {
    extraRating: kept.reduce((n, l) => n + (Number(l.amount) || 0), 0),
    damageRows: kept.map(l => ({ name: l.name, amount: Number(l.amount) || 0 }))
  };
}

/** A class name as the table keys it: "Ranger" → "ranger". */
export function classKey(className) {
  return String(className ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * The row for a talent, or null. A racial talent carries no class, so the
 * race is the key it is found under instead (D-675).
 */
export function talentEffect(className, identifier, race = null) {
  const byClass = TALENT_EFFECTS[classKey(className)]?.[identifier];
  if (byClass) return byClass;
  // A people keys as the parser keys it (`peoples.mjs#peopleKey`, D-1140): "San'layn" is
  // `sanlayn`, where `classKey` would split it into `san-layn` and miss every row (F2).
  return race ? (RACE_TALENT_EFFECTS[peopleKey(race)]?.[identifier] ?? null) : null;
}

/** The rows a talent's `modifies` names, always as a list. */
function modifiesOf(entry) {
  if (!entry?.modifies) return [];
  return Array.isArray(entry.modifies) ? entry.modifies : [entry.modifies];
}

/** Only the talents taken, with their rows. */
function takenRows(talents = [], rowOf = talentEffect) {
  return talents
    .filter(t => (Number(t?.taken) || 0) > 0)
    .map(t => ({ talent: t, entry: rowOf(t.className, t.identifier, t.race) }))
    .filter(r => r.entry);
}

/**
 * The features the talents taken grant (D-642): a descriptor each, named
 * for the talent, carrying its text, its rank and where it came from.
 * @param {Array<{identifier, className, branch?, name, effect?, taken}>} talents
 */
export function grantsFor(talents = [], rowOf = talentEffect) {
  return takenRows(talents, rowOf)
    .filter(({ entry }) => entry.grants)
    // **A GRANT A RANK REACHES** (04's Improved Blink: *At rank 2 it costs no
    // Mana once per Short Rest*; D-775): the counter is granted from that rank,
    // and below it there is nothing to count.
    .filter(({ talent, entry }) => (Number(talent.taken) || 1) >= (Number(entry.grants.minRank) || 1))
    .map(({ talent, entry }) => {
      const rank = Number(talent.taken) || 1;
      const { minRank: _minRank, atRank: rankClauses = [], ...grants } = entry.grants;
      // **A RANK'S CLAUSE LAID OVER THE GRANT** (the Legacy branches' door 26:
      // 04's Ethereal Form, *At rank 2 you may use it as a Reaction*): every
      // `atRank` the rank has reached, `{rank, action, ...}`, in order.
      for (const clause of Array.isArray(rankClauses) ? rankClauses : []) {
        if (rank >= (Number(clause?.rank) || Infinity)) {
          const { rank: _cr, ...rest } = clause;
          Object.assign(grants, rest);
        }
      }
      // A condition the card offers from a rank (04's Pyroblast: *At rank 2 a
      // Casting Test at SL 3 or better also applies Stun*; D-775): dropped below
      // it, its `sl` kept for the Use. **And its escape bound at the rank** (door
      // 19: Bad Mojo's *At rank 2 that Test takes a Bane*), so the stamp holds it.
      if (Array.isArray(grants.inflicts)) {
        grants.inflicts = grants.inflicts
          .filter(i => rank >= (Number(i?.minRank) || 1))
          .map(({ minRank: _r, ...i }) => (i.escape ? { ...i, escape: boundFeatureEscape(i.escape, rank) } : i));
      }
      // **HOW MANY A SUMMON CALLS, AT THE RANK** (the Legacy branches' door 4: 04's
      // Pocket Factory, *Two Clockwork Gnomes, or three at rank 2* - `"1+rank"`):
      // bound into a number here, since the feature's stamp holds a number.
      if (grants.summons && typeof grants.summons === "object") {
        grants.summons = { ...grants.summons, count: summonCountAt(grants.summons.count, rank) };
      }
      return {
        talent,
        feature: {
          name: talent.name,
          level: 1,
          description: talent.effect ?? "",
          ...grants,
          rank,
          source: { document: "04-TALENTS", section: talent.branch ?? "" }
        }
      };
    });
}

/**
 * The patches the talents taken lay on one class feature, in the order
 * taken, each with the talent that laid it.
 */
export function patchesFor(talents = [], className, featureName) {
  const key = classKey(className);
  const out = [];
  for (const { talent, entry } of takenRows(talents)) {
    if (classKey(talent.className) !== key) continue;
    for (const m of modifiesOf(entry)) {
      if (m.feature === featureName) out.push({ talent, patch: m, rank: Number(talent.taken) || 1 });
    }
  }
  return out;
}

/**
 * **THE PATCHES EVERY HEALING FEATURE TAKES, OF ANY CLASS** (D-778; the lead,
 * 2026-10-03, on O-160: *"Yes."* to *does "your healing features" count a healing
 * feature the character holds from a second class?*). `patchesFor` is a talent's
 * patch on a feature of its OWN class; a `healing` row reaches every feature the
 * character holds that restores Health - a class feature of either class and a
 * talent's granted one alike - and the feature sync lays both
 * (`AzerothActor#_syncClassFeaturesNow`):
 *
 * - Devotion's and Holy Guidance's `heal.add`, on every feature with a heal;
 * - Divine Providence's `names` (`oneTarget`), whose number `class-talents.mjs
 *   #healTargetsFor` reads, on the features that name one target - here only its
 *   chip, so the feature names the talent that changed it.
 *
 * In the order taken, each with the talent that laid it. `oneTarget` is the list
 * of features that name one target (`class-talents.mjs#HEALS_ONE_TARGET`), handed
 * in so this file never imports the readers that import it.
 *
 * @param {Array} talents
 * @param {{name?: string, heal?: string|null}} feature  the descriptor as it stands
 * @param {string[]} [oneTarget]
 * @returns {Array<{talent: object, patch: object, rank: number}>}
 */
export function healingPatchesFor(talents = [], feature = {}, oneTarget = []) {
  if (!feature?.heal) return [];
  const out = [];
  for (const { talent, entry } of takenRows(talents)) {
    const h = entry.healing;
    if (!h || typeof h !== "object") continue;
    if (h.oneTarget === true && !(oneTarget ?? []).includes(feature.name)) continue;
    const { oneTarget: _one, names: _names, ...patch } = h;
    out.push({ talent, patch: { feature: feature.name, ...patch }, rank: Number(talent.taken) || 1 });
  }
  return out;
}

/** One patch onto a descriptor, the rank's clauses included. */
function applyPatch(descriptor, patch, rank, evaluate) {
  const d = { ...descriptor };
  const clauses = [patch, ...(patch.atRank ?? []).filter(c => rank >= (c.rank ?? 1))];
  for (const c of clauses) {
    if ("action" in c && c !== patch) d.action = c.action;
    else if ("action" in c && c === patch && c.action !== undefined) d.action = c.action;
    if (c.cost?.delta !== undefined && d.cost) {
      const delta = evaluate(c.cost.delta, { rank }) ?? 0;
      d.cost = { ...d.cost, amount: Math.max(0, (d.cost.amount ?? 0) + delta) };
    }
    // **EVERY EXPRESSION A PATCH STAMPS CARRIES ITS OWN TALENT'S RANK** (D-768).
    // A class feature's item has no rank to evaluate `"rank"` with at Use, so a
    // raw copy read rank 1 for ever: Explosive Trap's `"3*rank"` was 3 at every
    // rank. `bindRank` puts the number in and leaves `tier`, `level` and `sl`
    // for the Use, and each patch binds its OWN rank, so two talents on one
    // feature cannot borrow each other's.
    const own = v => (v === null || v === undefined ? v : bindRank(v, rank));
    if (c.uses) d.uses = { max: own(c.uses.max) ?? d.uses?.max ?? 1, per: c.uses.per ?? d.uses?.per ?? null,
      ...((c.uses.refill ?? d.uses?.refill) ? { refill: c.uses.refill ?? d.uses.refill } : {}) };
    // **ONE USE BACK AT EACH SHORT REST** (the class talent audit's Mercy of Uther; D-1868): a patch's
    // `refill: "short"` on the feature's own uses (`rules/uses.mjs#refillAfter`).
    if (c.refill && d.uses) d.uses = { ...d.uses, refill: c.refill };
    // **ALL OF THE TARGET'S HEALTH** (Mercy of Uther: *restores all of the target's Health*; D-1868):
    // `heal: "max"` makes the feature's heal `FULL_HEAL`, which the Use resolves per target.
    if (c.heal === FULL_HEAL) d.heal = FULL_HEAL;
    // **CONDITIONS THE USE ENDS ON ITS TARGET** (the class talent audit's Mercy of Uther: *ends one condition
    // on it of your choice*; D-1875): the count, chosen through the one chooser at the Use
    // (`effects/audit-martial.mjs#landMartialUse`). The largest patch wins; a number, never stacked.
    if (Number(c.ends) > 0) d.ends = Math.max(Math.trunc(Number(d.ends) || 0), Math.trunc(Number(c.ends)));
    if (c.heal?.add) {
      const more = String(own(c.heal.add));
      d.heal = d.heal ? `${d.heal}+${more}` : more;
    }
    if (c.damage) d.damage = { ...c.damage, amount: own(c.damage.amount) };
    // A passive made usable (04's Dreamstate on Dreamwalk, D-771): the kind is
    // what draws the Use button, and `action` beside it what the Use costs.
    if (c.kind === "action" || c.kind === "passive") d.kind = c.kind;
    // A tick's turns made longer (04's Improved Regrowth, D-771: *its lingering
    // healing lasts one further turn per rank*): a NUMBER at the stamp, since a
    // laid tick counts its turns down from what it was stamped with (D-770).
    if (c.tickRounds?.add !== undefined && d.tick) {
      const more = Math.trunc(Number(evaluate(own(c.tickRounds.add), { rank }))) || 0;
      d.tick = { ...d.tick, rounds: Math.max(1, (Math.trunc(Number(d.tick.rounds)) || 0) + more) };
    }
    // The conditions a feature's card lays on its targets (04's Typhoon at rank
    // 2 on Hurricane, D-771), appended to what the feature already lays.
    if (Array.isArray(c.inflicts) && c.inflicts.length) d.inflicts = [...(d.inflicts ?? []), ...c.inflicts.map(i => ({ ...i }))];
    if (c.resist) d.resist = c.resist;
    if (c.area) d.area = c.area;
    // An area that reaches further (04's Empowered Mending: *reaches 10 feet
    // further per rank*; D-774): the feet are added to the number the area's
    // words carry, so the sheet and the card read the wider circle.
    if (c.widen !== undefined && typeof d.area === "string" && d.area) {
      d.area = widenAreaText(d.area, Math.trunc(Number(evaluate(own(c.widen), { rank }))) || 0);
    }
    // The menu a feature asks, or none (04's Aegis Eternal: *it includes every
    // school*, so 02's Ward asks for no school; D-774).
    if ("choice" in c && c !== null) d.choice = c.choice ?? null;
    // How many the menu takes in one use (02 §7's Totem Mastery, D-710).
    if (c.picks !== undefined) d.picks = c.picks;
    if (c.choiceExtra) d.choiceExtra = [...(d.choiceExtra ?? []), ...c.choiceExtra];
    // Feet added to the feature's aura (Wide Aura, D-755). **A COPY, never the
    // table's own object**: `aura()` freezes the descriptor, and widening it in
    // place would widen every Paladin in the world - which a frozen object
    // turns into a thrown error rather than a silent one.
    if (c.auraReach !== undefined && d.aura?.feet) {
      const reach = Math.trunc(Number(evaluate(c.auraReach, { rank }))) || 0;
      d.aura = { ...d.aura, feet: d.aura.feet + reach };
    }
  }
  return d;
}

/**
 * A class feature's descriptor with every patch laid on it, and the names of
 * what changed it. `evaluate` is class-features' `evaluateAmount`, passed in
 * so this file stays free of it.
 *
 * A patch names its source as `talent` (D-642) or as `source` - another CLASS
 * FEATURE since D-710, whose name becomes the chip exactly as a talent's does.
 */
export function patchFeature(descriptor, patches = [], evaluate = () => 0) {
  let d = { ...descriptor, modifiedBy: [] };
  for (const { talent = null, source = null, patch, rank } of patches) {
    d = applyPatch(d, patch, rank, evaluate);
    d.modifiedBy = [...d.modifiedBy, (source ?? talent)?.name ?? ""];
  }
  // **A PATCH THAT MAKES THE FEATURE COST NO ACTION WINS** (04's Master Summoner:
  // *Dismissing and summoning a demon costs no action*; D-775), whatever order the
  // talents were taken in: Fel Domination's Half-Action is a smaller price, and
  // a patch applied after it in the items' own order would have put it back.
  if (patches.some(({ patch, rank }) => [patch, ...(patch?.atRank ?? []).filter(c => rank >= (c.rank ?? 1))].some(c => c?.free === true))) {
    d.action = null;
  }
  return d;
}

/**
 * The talents taken whose text rides a spell's card (D-642): those naming
 * the spell, or its school.
 */
export function spellNotesFor(talents = [], { name = "", school = null } = {}) {
  return takenRows(talents)
    .filter(({ entry }) => entry.spell)
    .filter(({ entry }) => (entry.spell.names ?? []).includes(name) || (school && (entry.spell.schools ?? []).includes(school)))
    .map(({ talent }) => ({ name: talent.name, effect: talent.effect ?? "", talentId: talent.id ?? null }));
}

/**
 * The DAMAGE a talent adds to a spell, per rank (2026-09-07).
 *
 * The Warlock's *Shadow Bolt* reads *Each rank adds 1 to its Damage Rating*,
 * and the talent's text reached the card as a note while the number reached
 * nothing at all - the card kept the pack's Rating (the lead, 2026-09-07).
 * A `spell.damage` on the row is that number; `spellNotesFor` still prints
 * the words, and this is what the Rating adds.
 *
 * @param {Array} talents            the actor's talent items
 * @param {{name: string, school: string|null}} spell
 * @returns {Array<{name: string, rank: number, amount: number}>}
 */
/**
 * **WHAT THE TALENTS TAKEN DO TO A DECAY THE CASTER LAYS** (07 §9's *unless a talent
 * says the two add together*; D-865): a row's `decay {more, adds, capTier, atRank}` -
 * `more` an amount at the rank added to the X laid (04's Erosion: *that Decay is 1
 * higher*), `adds` the two applications added rather than the higher kept (*at rank 2
 * your Decay adds to any Decay the creature already has*), `capTier` the sum held to the
 * caster's tier (*to no more than your tier*), `atRank` the rank `adds` waits on. The
 * cast door reads this and `effects/decay.mjs#layDecay` writes it; the rows are the
 * Chronomancer talents' (Phase 5).
 *
 * @returns {{more: number, adds: boolean, cap: number|null, by: string[]}}
 */
export function decayScaleFor(talents = [], { tier = 1 } = {}, rowOf = talentEffect) {
  const out = { more: 0, adds: false, cap: null, by: [] };
  for (const { talent, entry } of takenRows(talents, rowOf)) {
    const d = entry.decay;
    if (!d) continue;
    const rank = Math.max(1, Math.trunc(Number(talent.taken) || 0));
    const more = Math.max(0, Math.trunc(Number(typeof d.more === "function" ? d.more(rank) : d.more)) || 0);
    out.more += more;
    const reaches = !d.atRank || rank >= Number(d.atRank);
    if (d.adds && reaches) {
      out.adds = true;
      if (d.capTier) out.cap = Math.max(0, Math.trunc(Number(tier)) || 0);
    }
    out.by.push(talent.name);
  }
  return out;
}

/**
 * **AND A PER-RANK BONUS STOPS AT THE TIER WHERE THE ROW SAYS SO** (the class
 * talent audit's R1, the lead's *"3 - okay"*; D-1861): a row's `spell.cap` -
 * `"tier"` for *to no more than your tier*, or an expression at the same scope -
 * holds `rank * damage` under it through `expressions.mjs#capAmount`. Every caller
 * hands in the caster's `tier` (a census in `rank-caps.test.mjs` reads the three);
 * one that does not withholds at tier 1. A row with no `cap` is unchanged.
 */
export function spellDamageFor(talents = [], { name = "", school = null, tier = 1 } = {}, rowOf = talentEffect) {
  return takenRows(talents, rowOf)
    .filter(({ entry }) => Number(entry.spell?.damage) > 0 || typeof entry.spell?.amount === "string")
    // **`damageNames`** (04's Chaos Bolt, the class talent audit: *You know Curse of Doom and Chaos
    // Bolt. Each rank adds 2 to the damage Chaos Bolt deals*; D-1891): the spells the damage
    // reaches where the row teaches more than it raises.
    .filter(({ entry }) => (entry.spell.damageNames ?? entry.spell.names ?? []).includes(name) || (school && (entry.spell.schools ?? []).includes(school)))
    .map(({ talent, entry }) => {
      const rank = Math.max(1, Math.trunc(Number(talent.taken) || 0));
      const at = Number(tier) || 1;
      // **AN AMOUNT AT THE RANK AND THE TIER** (04's Cone of Cold: *Frost damage equal to your
      // tier plus your rank*, restating 07's 2; D-1890): `spell.amount`, an expression.
      const raw = typeof entry.spell.amount === "string"
        ? Math.max(0, Math.trunc(Number(evaluateAmount(entry.spell.amount, { rank, tier: at }))) || 0)
        : rank * Number(entry.spell.damage);
      const amount = capAmount(raw, entry.spell.cap, { tier: at, rank });
      return { name: talent.name, rank, amount };
    })
    .filter(r => r.amount > 0);
}

/**
 * **WHAT THE TALENTS TAKEN DO TO ONE SPELL'S AREA** (D-756): how many feet
 * wider its radius is, the Difficult ground it also lays, and the talents that
 * said so - the card's *30 ft circle*, the Region's radius, and the ground a
 * Phase 2b behavior reads.
 *
 * It reads the `spell` row's `widen`, the `atRank` clauses the rank has
 * reached, and `ground`, off the TAKEN rows alone. **It never asks the actor's
 * `talentRanks` for Consecrated Ground by name**: the inline census reads every
 * such call in `module/` as a talent the code applies by name, and would then
 * demand an inline row for a talent this table already carries.
 *
 * **AND THE LENGTH OF A CONE OR A LINE** (04's Cone of Cold: *Each rank adds 5
 * feet to the cone*; D-775): `lengthen`, an expression at the rank, which
 * `areas.mjs#lengthenArea` lays on a cone or a line and on nothing else - a
 * circle's radius is `widen`'s, and 04 names the two apart.
 *
 * @param {Array} talents  the actor's talents taken, as `takenTalents` hands them
 * @param {{name?: string}} spell
 * @returns {{widen: number, lengthen: number, ground: {difficult: string[], who: string}|null, by: string[]}}
 */
export function spellAreaFor(talents = [], { name = "" } = {}) {
  let widen = 0;
  let lengthen = 0;
  let ground = null;
  const by = [];
  for (const { talent, entry } of takenRows(talents)) {
    const row = entry.spell;
    if (!row || !(row.names ?? []).includes(name)) continue;
    const rank = Math.max(1, Math.trunc(Number(talent.taken) || 0));
    // A number, or an amount at the rank (04's Insect Swarm: *Each rank adds 5 feet to its
    // radius*, `"5*rank"`; the class talent audit, D-1892).
    let feet = typeof row.widen === "string" ? atRankAmount(row.widen, rank) : Math.max(0, Math.trunc(Number(row.widen) || 0));
    for (const clause of row.atRank ?? []) {
      if (rank >= (clause?.rank ?? 1)) feet += Math.max(0, Math.trunc(Number(clause.widen) || 0));
    }
    const longer = row.lengthen !== undefined ? atRankAmount(row.lengthen, rank) : 0;
    const lays = row.ground && Array.isArray(row.ground.difficult) && row.ground.difficult.length ? row.ground : null;
    if (!feet && !lays && !longer) continue;
    widen += feet;
    lengthen += longer;
    if (lays) {
      // Two talents laying ground on one spell: every kind either names, and
      // the wider subject (*a creature* over *an enemy*).
      ground = ground
        ? { difficult: [...new Set([...ground.difficult, ...lays.difficult])], who: ground.who === "creature" || lays.who === "creature" ? "creature" : ground.who }
        : { difficult: [...lays.difficult], who: lays.who ?? "enemy" };
    }
    by.push(talent.name);
  }
  return { widen, lengthen, ground, by };
}

/**
 * **WHAT THE TALENTS TAKEN DO TO MOVING** (D-757): whether Difficult ground
 * costs this creature a foot a foot, and whether a climb does - 02 §5's
 * Mountain-Bred, off a racial row's `movement` - and whether a swim does, 02
 * §5's Island Blood (the final review of D-757). Read off the TAKEN rows alone;
 * `canvas/behaviors.mjs#movementFactsOf` adds what a laid spell says and what
 * a creature's own block says it swims at.
 *
 * @param {Array} talents  the actor's talents taken, as `takenTalents` hands them
 * @returns {{ignoresGround: boolean, climbsFree: boolean, swimsFree: boolean, by: string[]}}
 */
export function movementFactsFor(talents = []) {
  const out = { ignoresGround: false, climbsFree: false, swimsFree: false, by: [] };
  for (const { talent, entry } of takenRows(talents)) {
    const m = entry?.movement;
    if (!m) continue;
    if (m.ignoresGround === true) out.ignoresGround = true;
    if (m.climbsFree === true) out.climbsFree = true;
    if (m.swimsFree === true) out.swimsFree = true;
    out.by.push(talent.name);
  }
  out.by.sort();
  return out;
}

/**
 * The spells the talents taken know ("You know Dispersion"), by name, with the talent.
 *
 * **AND THE ONES A RANK ADDS** (the Legacy branches' door 25: 04's Shadow Hunt, *You
 * know Shadow Ward and Shadow Walk, and at rank 2 Darkward and Dark Passage as
 * well*): a `spell.atRank [{rank, names}]` clause the rank has reached adds its names
 * beside the row's own, each once; a rank taken back withdraws them with the sync's
 * own stale sweep (`AzerothActor#_syncClassFeaturesNow`).
 */
export function spellGrantsFor(talents = [], rowOf = talentEffect) {
  return takenRows(talents, rowOf)
    .filter(({ entry }) => entry.spell?.learn)
    .flatMap(({ talent, entry }) => spellNamesAtRank(entry.spell, Number(talent.taken) || 1).map(name => ({ talent, name })));
}

/**
 * A spell row's names at a rank: its own, then every `atRank` clause's the rank has
 * reached, each once and in that order.
 *
 * @param {{names?: string[], atRank?: Array<{rank: number, names?: string[]}>}} spell
 * @param {number} rank
 * @returns {string[]}
 */
export function spellNamesAtRank(spell, rank = 1) {
  const out = [];
  const take = list => { for (const n of list ?? []) if (typeof n === "string" && n && !out.includes(n)) out.push(n); };
  take(spell?.names);
  for (const clause of Array.isArray(spell?.atRank) ? spell.atRank : []) {
    if ((Number(rank) || 0) >= (Number(clause?.rank) || Infinity)) take(clause?.names);
  }
  return out;
}

/**
 * The owner-side effects the talents taken lay on the character (D-648),
 * gated by what the sync can see: a Shapeshift form worn, a shield
 * equipped. Each is v14's changes with the rank evaluated in, in the final
 * phase so a derived number takes them.
 * @param {Array<{identifier, className, name, taken, img?}>} talents
 * @param {{form?: boolean, shield?: boolean}} [state]
 */
export function passivesFor(talents = [], { form = false, shield = false, totem = false, wield = null, boundDemon = false, tier = 1 } = {}, rowOf = talentEffect) {
  const out = [];
  for (const { talent, entry } of takenRows(talents, rowOf)) {
    const p = entry.passive;
    if (!p) continue;
    if (p.when === "form" && !form) continue;
    if (p.when === "shield" && !shield) continue;
    // *While you control a Bound Demon* (04's Demonic Knowledge; the class talent audit, D-1891):
    // a demon bound to the character (D-643), re-synced when a bond is made or released.
    if (p.when === "boundDemon" && !boundDemon) continue;
    // *While a totem of yours stands* (04's Earthen Shield, D-774): a totem
    // bound to the character (D-643).
    if (p.when === "totem" && !totem) continue;
    // **WHAT THE USER WIELDS AND WEARS** (the Legacy branches' door 15): 04's
    // Wolf's Pace's *While you wear no armor in your Chest slot*, Blade Circle's
    // *While you wield a two-handed weapon and wear no armor in your Chest slot* -
    // `{wields: [...]}`, laid only where the sync measured every fact true
    // (`rules/wield.mjs#wieldFacts`). An amount here names no ability modifier
    // (door 16): a laid effect's value is fixed when it is written and would not
    // move with the score, so a row that needs one names v14's `@` data path.
    if (p.when && typeof p.when === "object" && gateHolds(p.when, { wield }) !== true) continue;
    const rank = Number(talent.taken) || 1;
    const changes = p.changes.map(c => ({
      key: c.key, type: c.type ?? "add", phase: "final",
      // The tier rides the scope (R1's `min(rank,tier)`, Earthen Shield's `floor(tier/2)`; the class
      // talent audit, D-1886, D-1887): the sync re-lays the effect when the tier moves.
      value: String(typeof c.value === "number" ? c.value : (evaluateAmount(String(c.value), { rank, tier: Number(tier) || 1 }) ?? 0))
    }));
    out.push({ talent, identifier: talent.identifier, name: talent.name, changes });
  }
  return out;
}

/**
 * **WHAT THE OWNER-SIDE TALENT EFFECT SYNC WRITES** (D-648, D-768): one effect a
 * talent, keyed by its identifier, diffed against what stands.
 *
 * - a desired row nothing holds is CREATED;
 * - a held effect whose changes moved is UPDATED - the one whose changes already
 *   match is kept where there is one, else the first by id;
 * - **EVERY OTHER HELD EFFECT OF THE SAME IDENTIFIER IS DELETED**, and so is one
 *   no desired row names. Two runs of the sync in flight together could each
 *   find nothing held and each create the effect, and the old diff kept the
 *   first and never looked at the second: a doubled Shield of Faith gave its
 *   Defense twice for good. The actor runs the sync one at a time now, and this
 *   cleans up a world where it already happened.
 *
 * Pure, and deterministic: the holds are read in id order and the deletes come
 * back sorted.
 *
 * @param {Array<{identifier: string, changes: object[]}>} desired  `passivesFor`'s rows
 * @param {Array<{id: string, identifier: string, changes: object[]}>} held  the effects flagged `talentEffect`
 * @returns {{creates: object[], updates: Array<{id: string, row: object}>, deletes: string[]}}
 */
export function talentEffectDiff(desired = [], held = []) {
  const shape = changes => JSON.stringify((changes ?? []).map(c => [c.key, c.type, String(c.value), c.phase ?? null]));
  const holds = new Map();
  for (const h of [...held].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    if (!holds.has(h.identifier)) holds.set(h.identifier, []);
    holds.get(h.identifier).push(h);
  }
  const creates = [];
  const updates = [];
  const deletes = [];
  const wanted = new Set();
  for (const row of desired) {
    // One effect an identifier, even where two taken rows share one.
    if (wanted.has(row.identifier)) continue;
    wanted.add(row.identifier);
    const have = holds.get(row.identifier) ?? [];
    const keep = have.find(h => shape(h.changes) === shape(row.changes)) ?? have[0] ?? null;
    if (!keep) creates.push(row);
    else if (shape(keep.changes) !== shape(row.changes)) updates.push({ id: keep.id, row });
    for (const h of have) if (h !== keep) deletes.push(h.id);
  }
  for (const [identifier, rows] of holds) {
    if (!wanted.has(identifier)) deletes.push(...rows.map(h => h.id));
  }
  return { creates, updates, deletes: deletes.sort() };
}

/**
 * **THE AURAS THE TALENTS TAKEN LAY ON ALLIES** (D-755), `passivesFor`'s
 * shape: one row a talent, its descriptor evaluated at the rank taken and
 * stamped whole (`rules/auras.mjs#auraStamp`), so Demonic Pact's `"rank"` is
 * a number by the time the aura door reads it. The gate is NOT judged here -
 * a shield or a laid spell is the holder's state, which `effects/auras.mjs`
 * reads and `ownerAuras` judges.
 *
 * @param {Array<{identifier, className, race?, name, taken}>} talents
 * @returns {Array<{talent: object, identifier: string, name: string, rank: number, aura: object}>}
 */
export function talentAurasFor(talents = [], rowOf = talentEffect, { tier = 1 } = {}) {
  const out = [];
  for (const { talent, entry } of takenRows(talents, rowOf)) {
    if (!entry.aura) continue;
    const rank = Number(talent.taken) || 1;
    // The holder's tier in scope beside the rank (04's Heart of the Grove: *or 2 and 2 from
    // tier 4*; the class talent audit, D-1892). A caller that hands none reads tier 1.
    const amount = v => (typeof v === "string" ? (evaluateAmount(v, { rank, tier: Number(tier) || 1 }) ?? 0) : v);
    const stamped = auraStamp(entry.aura, { amount });
    // **A BANE THE AURA LAYS** (the Legacy branches' door 20: 04's Loa Drum, *a Bane on
    // Spirit Resilience Tests*): carried beside the stamp - a feature's stored aura
    // has no `bane` in its schema, and a talent's is read here fresh every pass.
    // **AND A FLOOR UNDER HEALTH** (door 12: 04's Big Bad Voodoo), the same way.
    // **AND WARD ADDED, AND WHO IT REACHES** (04's Heart of the Grove, D-1892), the same way.
    const beside = {
      ...(entry.aura.bane ? { bane: { ...entry.aura.bane } } : {}),
      ...(entry.aura.healthFloor ? { healthFloor: amount(entry.aura.healthFloor) } : {}),
      ...(entry.aura.ward ? { ward: { schools: [...(entry.aura.ward.schools ?? [])], amount: amount(entry.aura.ward.amount) } } : {}),
      ...(entry.aura.who ? { who: { ...entry.aura.who } } : {})
    };
    out.push({ talent, identifier: talent.identifier, name: talent.name, rank, aura: Object.keys(beside).length ? { ...stamped, ...beside } : stamped });
  }
  return out;
}

/** The talent row carrying an aura, for a talent item's own fields, or null. */
export function talentAuraOf(system = {}) {
  return talentEffect(system?.className, system?.identifier, system?.race ?? null)?.aura ?? null;
}

/**
 * The spells whose laid effect an aura waits on (`spell:<identifier>` gates),
 * off both tables. A spell effect landing on or leaving an actor re-syncs the
 * auras when its identifier is one of these (D-755), because nothing else about
 * the druid moved when the tree grew.
 *
 * @returns {Set<string>}
 */
export function auraSpellGates() {
  const out = new Set();
  const read = descriptor => {
    const gate = descriptor?.aura?.gate ?? null;
    if (typeof gate === "string" && gate.startsWith("spell:")) out.add(gate.slice("spell:".length));
  };
  for (const rows of Object.values(TALENT_EFFECTS)) for (const entry of Object.values(rows)) read(entry);
  for (const rows of Object.values(CLASS_FEATURES)) for (const descriptor of Object.values(rows)) read(descriptor);
  return out;
}

/**
 * **THE TONGUES A RACIAL TALENT ADDS** (02 SS5's Chromatic Outcast's Draconic; the lead,
 * 2026-11-08: *"Add Draconic"*): every `language` row a taken talent carries, sorted, each
 * once. Derived - added to `system.languages` at data preparation and to the creator's
 * numbers, never written over the stored list a GM may edit.
 *
 * @param {Array} talents
 * @param {Function} [rowOf]
 * @returns {string[]}
 */
export function talentLanguages(talents = [], rowOf = talentEffect) {
  const out = new Set();
  for (const { entry } of takenRows(talents, rowOf)) {
    if (typeof entry.language === "string" && entry.language) out.add(entry.language);
  }
  return [...out].sort();
}

/**
 * What the talents taken MULTIPLY the bag slots a character carries by
 * (D-735). One today, Pack Hobgoblin, and 02 §5 says *the bag slots you carry
 * yourself are doubled* — so it doubles the base and never what a container
 * or a mount adds.
 *
 * **INLINE rather than an Active Effect.** The number is read inside
 * `CharacterData#prepareDerivedData`, before the ledger, the load state, the
 * Speed part and every refusal depend on it; a `final`-phase change lands
 * after all five and moved none of them.
 *
 * Factors multiply, so two of them would double twice; there is one row and
 * the shape is honest about what would happen if a second arrived.
 *
 * @param {Array<{identifier, className?, race?, taken}>} talents
 * @returns {number} 1 where nothing taken says otherwise
 */
export function carryFactor(talents = []) {
  let factor = 1;
  for (const { entry } of takenRows(talents)) {
    const n = Number(entry.carry);
    if (Number.isFinite(n) && n > 0) factor *= n;
  }
  return factor;
}

/* -------------------------------------------- */
/*  The Druid's kinds (D-771)                    */
/* -------------------------------------------- */

/** A taken row's rank, a whole number from 1. */
const rankOfTaken = talent => Math.max(1, Math.trunc(Number(talent?.taken) || 0));

/** An amount expression at a rank, a whole number, never below nothing. */
const atRankAmount = (expr, rank) => Math.max(0, Math.trunc(Number(evaluateAmount(String(expr ?? "rank"), { rank }))) || 0);

/**
 * **WHAT THE TALENTS TAKEN ADD TO ONE SPELL'S TICK** (04's Moonfire and
 * Rejuvenation; D-771): the `tick` rows naming the spell, each at its rank.
 * `castSpell` adds the total to the number it stamps on the laid tick (D-770),
 * so the card's *Each turn* line and every turn's landing carry it.
 *
 * @param {Array} talents  the talents taken
 * @param {{name?: string}} spell
 * @returns {{amount: number, by: Array<{name: string, amount: number}>}}
 */
export function tickBonusFor(talents = [], { name = "", tier = 1 } = {}, rowOf = talentEffect) {
  let amount = 0;
  const by = [];
  for (const { talent, entry } of takenRows(talents, rowOf)) {
    const t = entry.tick;
    if (!t || !(t.spells ?? []).includes(name)) continue;
    // **R1's CAP** (D-1861): `add` is read with the caster's tier in scope, so
    // `min(rank,tier)` reads; `cap` holds the result under the tier as a spell
    // damage row's does. A caller that hands no tier withholds at tier 1.
    const rank = rankOfTaken(talent);
    const at = Number(tier) || 1;
    const n = capAmount(Math.max(0, Math.trunc(Number(evaluateAmount(String(t.add ?? "rank"), { rank, tier: at }))) || 0), t.cap, { tier: at, rank });
    if (n <= 0) continue;
    amount += n;
    by.push({ name: talent.name, amount: n });
  }
  return { amount, by };
}

/**
 * **THE ROUNDS A TALENT ADDS TO A SPELL'S TICK** (04's Improved Moonfire, the class talent audit:
 * *Your Moonfire deals its damage at the start of the target's turns for 1 more round per rank*;
 * D-1892): each taken `tickRounds` row naming the spell, at its rank. `castSpell` adds the sum to
 * the tick's `rounds` as it stamps it, where the tick counts rounds at all.
 *
 * @param {Array} talents
 * @param {{name?: string}} spell
 * @returns {{add: number, by: string[]}}
 */
export function tickRoundsFor(talents = [], { name = "" } = {}, rowOf = talentEffect) {
  let add = 0;
  const by = [];
  for (const { talent, entry } of takenRows(talents, rowOf)) {
    const r = entry.tickRounds;
    if (!r || !(r.spells ?? []).includes(name)) continue;
    const n = atRankAmount(r.add ?? "rank", rankOfTaken(talent));
    if (n <= 0) continue;
    add += n;
    by.push(talent.name);
  }
  return { add, by };
}

/**
 * **A TICK THAT RISES** (04's Curse of Agony, the class talent audit: *Its damage rises by 1 at
 * the start of each of the target's turns after the first, to no more than 1 more per rank*;
 * D-1891): the step and the most it rises, at the rank, or null. `castSpell` stamps it on the tick
 * (`rise {by, max}`) and `rules/ticks.mjs#risenAmount` reads it at each landing.
 *
 * @param {Array} talents
 * @param {{name?: string}} spell
 * @returns {{by: number, max: number, name: string}|null}
 */
export function tickRiseFor(talents = [], { name = "" } = {}, rowOf = talentEffect) {
  for (const { talent, entry } of takenRows(talents, rowOf)) {
    const r = entry.tickRise;
    if (!r || !(r.spells ?? []).includes(name)) continue;
    const by = Math.max(0, Math.trunc(Number(r.by)) || 0);
    const max = atRankAmount(r.max ?? "rank", rankOfTaken(talent));
    if (by > 0 && max > 0) return { by, max, name: talent.name };
  }
  return null;
}

/** What a `nextSpell` row is laid on (D-771). */
// And 04's Runic Frost's Frost rune spent, laid by the rune door (run F4a).
// And 04's Clearcasting's Overchannelled success (the class talent audit, D-1890).
export const NEXT_SPELL_ON = Object.freeze(["casting", "swiftLeave", "frostRune", "overchannelSuccess"]);

/**
 * **THE NEXT SPELL'S DISCOUNTS A TRIGGER LAYS** (04's Nature's Grace and
 * Predator's Swiftness; D-771): one entry a taken row whose `on` is this
 * trigger and whose Success Level - where it names one - the Test reached.
 * The door stamps `turn` with the fight's turn where the row says *that turn*;
 * `casting.mjs#pendingNextSpell` reads what stands, and the next cast takes it.
 *
 * @param {Array} talents
 * @param {{on: string, sl?: number|null}} o
 * @returns {Array<{source: string, name: string, amount: number, turn: boolean}>}
 */
export function nextSpellGrants(talents = [], { on = "", sl = null } = {}, rowOf = talentEffect) {
  const out = [];
  for (const { talent, entry } of takenRows(talents, rowOf)) {
    const n = entry.nextSpell;
    if (!n || n.on !== on) continue;
    if (n.sl !== null && n.sl !== undefined && !((Number(sl) || 0) >= Number(n.sl))) continue;
    // **A NEXT SPELL CAST AT A LOWER RUNG** (04's Backdraft: *your next spell costs
    // a Half-Action rather than an action*; D-775): no Mana, and the rung it
    // promises; the door asks the talent's counter for a use before laying it.
    const cast = n.cast === "half" ? "half" : null;
    // **FREE OVERCHANNEL POINTS** (04's Clearcasting, the class talent audit: *you may take up to
    // your rank in points of Overchannel on your next spell before the end of your next turn
    // without paying for them*; D-1890): `overchannel` at the rank, lapsing after the caster's
    // next turn (`through: "nextTurn"`, `casting.mjs#pendingNextSpell`).
    const overchannel = n.overchannel !== undefined ? atRankAmount(n.overchannel, rankOfTaken(talent)) : 0;
    const amount = (cast || overchannel > 0) && n.amount === undefined ? 0 : atRankAmount(n.amount, rankOfTaken(talent));
    if (amount <= 0 && !cast && overchannel <= 0) continue;
    out.push({ source: talent.identifier, name: talent.name, amount, turn: n.turn === true, ...(cast ? { cast, talentId: talent.id ?? null } : {}), ...(n.features === true ? { features: true } : {}),
      ...(overchannel > 0 ? { overchannel } : {}), ...(n.through === "nextTurn" ? { through: "nextTurn" } : {}),
      // R7 (D-1865): a lowered rung once a round, on the round's record (`takeNextSpell`'s `roundUsed`).
      ...(cast && n.perRound === true ? { perRound: true } : {}),
      // A next spell of one school alone (04's Runic Frost: *the next Frost spell*; run F4a).
      ...(Array.isArray(n.schools) && n.schools.length ? { schools: [...n.schools] } : {}) });
  }
  return out.sort((a, b) => a.source.localeCompare(b.source));
}

/**
 * **A FURTHER GAIN ON A HIT, INTO ONE POOL** (04's Primal Fury; D-771): the
 * `momentum` rows whose Success Level the Attack Test reached, in a Shapeshift
 * form where the row asks for one, and - `once: "turn"` - only on the
 * character's own turn and only where the round's record has not spent it.
 *
 * @param {Array} talents
 * @param {{sl?: number, form?: boolean, onTurn?: boolean, used?: string[]}} o
 *   `used` the once-a-turn rows the round's record already holds
 * @returns {{byPool: Record<string, number>, fired: Array<{identifier: string, name: string, pool: string, amount: number, once: string|null}>}}
 */
export function momentumOnHitFor(talents = [], { sl = 0, form = false, onTurn = true, used = [], facts = {} } = {}, rowOf = talentEffect) {
  const byPool = {};
  const fired = [];
  for (const { talent, entry } of takenRows(talents, rowOf)) {
    const rank = rankOfTaken(talent);
    // A rank's clause laid over the row (04's Waylay: *At rank 2 that attack
    // builds 1 further Combo Point*; D-773).
    const m = entry.momentum ? { ...entry.momentum, ...Object.assign({}, ...(entry.momentum.atRank ?? []).filter(c => rank >= (Number(c?.rank) || Infinity)).map(({ rank: _r, ...c }) => c)) } : null;
    if (!m?.pool) continue;
    if (m.form === true && form !== true) continue;
    if (m.sl !== null && m.sl !== undefined && !((Math.trunc(Number(sl)) || 0) >= Number(m.sl))) continue;
    // **A FACT ABOUT THIS BLOW** (D-773): an attack made while hidden (Shadow
    // Focus, Waylay), the attack's own Critical Injury (Seal Fate), a target
    // affected by Bleeding the blow damaged (Blood Sport) - each measured by the
    // roll and handed in; an unmeasured one never holds. **And a gate object**
    // (the Legacy branches' doors 15 and 17, `rules/talent-gates.mjs`): Run to
    // Ground's *a target that is Slowed, Entangled or Stunned*, Bloodied Blade's
    // *While you wield a two-handed weapon and wear no armor in your Chest slot* -
    // a gain after the die is given only where the gate HOLDS, never where the door
    // could not tell.
    if (m.when && gateHolds(m.when, facts ?? {}) !== true) continue;
    if (m.once === "turn" && (!onTurn || (used ?? []).includes(talent.identifier))) continue;
    // *Once a round* (04's Aimed Volley, Shadow Focus; D-773): any turn, once.
    if (m.once === "round" && (used ?? []).includes(talent.identifier)) continue;
    const amount = atRankAmount(m.amount, rank);
    if (amount <= 0) continue;
    byPool[m.pool] = (byPool[m.pool] ?? 0) + amount;
    fired.push({ identifier: talent.identifier, name: talent.name, pool: m.pool, amount, once: m.once ?? null });
  }
  return { byPool, fired };
}

/** The facts a `momentum` row's `when` may name (D-773), each measured by the roll. */
export const MOMENTUM_WHEN = Object.freeze(["hidden", "critical", "bleedingDealt"]);

/**
 * The actor flag Eclipse's state stands under (D-771): the school whose next
 * spell takes the bonus, or null.
 */
export const ALTERNATE_FLAG = "alternate";

/**
 * **ECLIPSE'S ROW, AT ITS RANK** (D-771): the first taken `alternate` row, or
 * null.
 *
 * @param {Array} talents
 * @returns {{identifier: string, name: string, schools: string[], amount: number}|null}
 */
export function alternateFor(talents = [], { tier = 1 } = {}) {
  // **CELESTIAL FOCUS** (the class talent audit, D-1892: *When a spell of yours takes Eclipse's
  // bonus, it adds your tier rather than your rank*): a taken `alternateAmount` restates it.
  const restated = takenRows(talents).find(({ entry }) => typeof entry.alternateAmount === "string") ?? null;
  for (const { talent, entry } of takenRows(talents)) {
    const a = entry.alternate;
    if (!Array.isArray(a?.schools) || a.schools.length !== 2) continue;
    const amount = restated
      ? Math.max(0, Math.trunc(Number(evaluateAmount(restated.entry.alternateAmount, { rank: rankOfTaken(restated.talent), tier: Number(tier) || 1 }))) || 0)
      : atRankAmount(a.amount, rankOfTaken(talent));
    return { identifier: talent.identifier, name: talent.name, schools: [...a.schools], amount, ...(restated ? { restatedBy: restated.talent.name } : {}) };
  }
  return null;
}

/**
 * **WHETHER THIS CAST WILL TAKE ECLIPSE'S BONUS** (04's Celestial Focus's rung; the class
 * talent audit, D-1892), asked before the Test: the pending school is the spell's own and
 * the druid holds Eclipse. A failed Test then takes nothing (MY READING, as `alternateCast`).
 *
 * @param {string|null} pending
 * @param {string|null} school  the spell's own school
 * @param {{schools: string[]}|null} alt  `alternateFor`'s
 * @returns {boolean}
 */
export function eclipseDue(pending = null, school = null, alt = null) {
  return Boolean(alt) && typeof pending === "string" && pending === school && (alt.schools ?? []).includes(school);
}

/**
 * **WHAT A CAST DOES TO ECLIPSE'S STATE** (04: *After you cast a Nature spell,
 * your next Arcane spell adds your rank to its damage. After you cast an
 * Arcane spell, your next Nature spell adds your rank to its damage*; D-771).
 *
 * `pending` is the school whose next spell takes the bonus, or null. A cast of
 * one of the two schools takes the bonus where it is the pending one and
 * leaves the OTHER pending; a cast of any other school leaves the state alone.
 * **MY READING, for the lead**: a cast whose Casting Test failed is no cast
 * here (07 §8: *the spell does not go off*), so the door asks this only on a
 * success, and a pending bonus waits for a cast that lands.
 *
 * @param {string|null} pending
 * @param {string|null} school  the spell's own school
 * @param {{schools: string[], amount: number}|null} alt  `alternateFor`'s
 * @returns {{bonus: number, next: string|null}}
 */
export function alternateCast(pending = null, school = null, alt = null) {
  const held = typeof pending === "string" && pending ? pending : null;
  if (!alt || !Array.isArray(alt.schools) || !alt.schools.includes(school)) return { bonus: 0, next: held };
  return {
    bonus: held === school ? Math.max(0, Math.trunc(Number(alt.amount)) || 0) : 0,
    next: alt.schools.find(s => s !== school) ?? null
  };
}

/**
 * **A SPELL'S SPAN AS A TALENT RESTATES IT** (04's Celestial Alignment: *Its
 * duration is 2 minutes*; D-771), in 07's phrasing so `effectDuration` reads it
 * as it reads an entry's Duration line - or null where no taken row names the
 * spell.
 *
 * @param {Array} talents
 * @param {{name?: string}} spell
 * @returns {string|null}
 */
export function spellDurationFor(talents = [], { name = "" } = {}) {
  for (const { entry } of takenRows(talents)) {
    const s = entry.spell;
    if (typeof s?.duration === "string" && s.duration && (s.names ?? []).includes(name)) return s.duration;
  }
  return null;
}

/**
 * **THE WARD A CASTER'S SPELLS IGNORE, NOW** (04's Celestial Alignment: *while
 * it runs your Arcane and Nature spells ignore 2 Ward*; D-771): the taken rows'
 * `spell.ignoresWard` whose schools hold the SPELL's school and whose spell is
 * standing on the caster (`standing`: the identifiers of the laid spell effects
 * the caster carries, active).
 *
 * @param {Array} talents
 * @param {{school?: string|null, standing?: string[]}} o
 * @returns {{amount: number, by: string[]}}
 */
export function wardPierceFor(talents = [], { school = null, standing = [], facts = null } = {}) {
  let amount = 0;
  const by = [];
  if (!school) return { amount, by };
  for (const { talent, entry } of takenRows(talents)) {
    const w = entry.spell?.ignoresWard;
    if (!w || !(w.schools ?? []).includes(school)) continue;
    if (w.while && !(standing ?? []).includes(w.while)) continue;
    // **A PIERCE GATED ON THE TARGET** (04's Pyromaniac: *against a target burning from Ignite*;
    // Lunar Guidance: *against a target that has taken Arcane or Nature damage from you since the
    // start of your last turn*; the class talent audit, D-1890, D-1892): read ONLY where the door
    // hands the target's `facts` (`AzerothActor#spellWardPierceAt`), and the caster-wide reading
    // (no `facts`) never counts it, so the two never add one row twice.
    if (w.whenTarget ? !(facts && facts[w.whenTarget] === true) : facts !== null) continue;
    // A number, or an amount at the rank (04's Chastise: *2 Ward per rank*; D-774).
    const n = typeof w.amount === "number" ? Math.max(0, Math.trunc(w.amount)) : atRankAmount(w.amount, rankOfTaken(talent));
    if (n <= 0) continue;
    amount += n;
    by.push(talent.name);
  }
  return { amount, by };
}

/**
 * **THE WARD A HEAL OVER TIME CARRIES** (04's Nature's Ward: *Ward 1 per rank
 * against Nature or against Shadow, chosen when the effect begins*; D-771),
 * at its rank, or null.
 *
 * @param {Array} talents
 * @returns {{identifier: string, name: string, talentId: string|null, amount: number, schools: string[]}|null}
 */
export function tickWardFor(talents = []) {
  for (const { talent, entry } of takenRows(talents)) {
    const w = entry.tickWard;
    if (!Array.isArray(w?.schools) || !w.schools.length) continue;
    const amount = atRankAmount(w.amount, rankOfTaken(talent));
    if (amount <= 0) continue;
    return { identifier: talent.identifier, name: talent.name, talentId: talent.id ?? null, amount, schools: [...w.schools] };
  }
  return null;
}

/**
 * The `system.changes` a heal over time's Ward lays (Nature's Ward, D-771):
 * the `final` phase, because a character's Ward is derived (D-668's rule).
 *
 * @param {{amount: number}|null} ward  `tickWardFor`'s
 * @param {string|null} school
 * @returns {Array<{key: string, type: string, value: string, phase: string}>}
 */
export function tickWardChanges(ward, school) {
  if (!ward || !school || !(ward.schools ?? []).includes(school) || !(ward.amount > 0)) return [];
  return [{ key: `system.ward.${school}`, type: "add", value: String(ward.amount), phase: "final" }];
}

/** How a heal arrives, for a `heal` row's `via` (D-771). */
export const HEAL_VIA = Object.freeze(["spell", "feature"]);

/**
 * **WHAT THE HEALER'S TALENTS ADD TO A HEAL THEY GIVE** (04's Gift of Nature:
 * *Your healing spells and features restore 1 further Health per rank to a
 * target suffering a condition*; D-771). Read at the one healing door, where
 * the target's conditions are known.
 *
 * @param {Array} talents  the HEALER's
 * @param {{via?: "spell"|"feature"|null, conditioned?: boolean}} o
 *   `conditioned` the target carries one of A1's conditions
 * @returns {{amount: number, by: string[]}}
 */
export function healBonusFor(talents = [], { via = null, conditioned = false, school = null, featureName = null, tier = 1 } = {}) {
  let amount = 0;
  const by = [];
  if (!HEAL_VIA.includes(via)) return { amount, by };
  for (const { talent, entry } of takenRows(talents)) {
    const h = entry.heal;
    if (!h || !(h.via ?? []).includes(via)) continue;
    if (h.when === "conditioned" && conditioned !== true) continue;
    // **A HEAL OF ONE SCHOOL OR ONE FEATURE** (the class talent audit's Healing Hands: *Your Holy spells and
    // your Lay on Hands class feature restore 1 more Health per rank, to no more than your tier*; D-1875): a
    // spell's heal reaches the row only where its school is named, a feature's only where its name is.
    if (via === "spell" && Array.isArray(h.schools) && !h.schools.includes(school)) continue;
    if (via === "feature" && Array.isArray(h.features) && !h.features.includes(featureName)) continue;
    // The healer's tier in scope, so `min(rank,tier)` reads (R1).
    const n = Math.max(0, Math.trunc(Number(evaluateAmount(String(h.add ?? "rank"), { rank: rankOfTaken(talent), tier: Math.max(1, Math.trunc(Number(tier)) || 1) }))) || 0);
    if (n <= 0) continue;
    amount += n;
    by.push(talent.name);
  }
  return { amount, by };
}

/**
 * **A SPELL CAST AT A LOWER RUNG** (04's Nature's Swiftness: *A healing spell of
 * yours costs a Half-Action rather than an action*; D-771): the taken row whose
 * `castAs.from` is the spell's own action and which this spell qualifies for,
 * or null. **MY READING, for the lead**: *an action* is the middle rung of 05's
 * ladder, so a Full Action spell is not reached; and a healing CLASS FEATURE is
 * not a spell here (the lead's *"casting features count"* was a damage lane's).
 *
 *
 * **AND 04's RIPTIDE** (*You may cast Healing Wave as a Half-Action once a round,
 * or twice a round at rank 2*; D-774): a row may name its `spells` and count its
 * uses on the round's record (`perRound`, at the rank) rather than on a counter
 * the talent grants; the doors read `perRound` and mark the round as Adrenaline's
 * Use does (D-773).
 *
 * **AND 04's FIRE BLAST** (*Once a round, a Fire spell of yours costs a
 * Half-Action rather than an action. At rank 2 it also ignores 2 Ward*; D-775): a
 * row may name the `schools` it reaches, and a rank's clause (`atRank`) the Ward
 * the spell cast at the lower rung ignores (`pierce`).
 *
 * **AND A FULL ACTION, AND A HEALING FEATURE** (the lead, 2026-10-03, on O-168:
 * *"Yes to both."*; D-779): a row's `from` may be a list of rungs - Nature's
 * Swiftness reaches a healing spell of an action or a Full Action - and a row
 * carrying `features: true` reaches a healing class feature through the same
 * reading (`feature: true` from the feature's own door, `useFeature`); a row
 * without it reaches spells alone.
 *
 * @param {Array} talents
 * @param {{action?: string|null, healing?: boolean, name?: string, school?: string|null, feature?: boolean}} spell
 * @returns {{identifier: string, name: string, talentId: string|null, action: string, perRound: number|null, pierce: number}|null}
 */
export function castAsFor(talents = [], { action = null, healing = false, name = "", school = null, feature = false, eclipse = false } = {}) {
  for (const { talent, entry } of takenRows(talents)) {
    const c = entry.castAs;
    const from = Array.isArray(c?.from) ? c.from : [c?.from];
    if (!c?.action || !from.includes(action)) continue;
    if (feature === true && c.features !== true) continue;
    if (c.healing === true && healing !== true) continue;
    // **ONLY A SPELL TAKING ECLIPSE'S BONUS** (04's Celestial Focus: *Once per encounter, that
    // spell may cost a Half-Action*; the class talent audit, D-1892): the door says whether this
    // cast takes it (`eclipseDue`: Eclipse's pending school is the spell's own).
    if (c.eclipse === true && eclipse !== true) continue;
    if (Array.isArray(c.spells) && !c.spells.includes(name)) continue;
    if (Array.isArray(c.schools) && !c.schools.includes(school)) continue;
    const rank = rankOfTaken(talent);
    const perRound = c.perRound !== undefined ? Math.max(1, atRankAmount(c.perRound, rank)) : null;
    // A rank's Ward pierce on the cast it makes cheaper (04's Fire Blast at rank 2:
    // *it also ignores 2 Ward*; D-775), where a clause carries one.
    const pierce = (c.atRank ?? []).filter(cl => rank >= (Number(cl?.rank) || Infinity)).reduce((n, cl) => n + Math.max(0, Math.trunc(Number(cl.pierce)) || 0), 0);
    // 04's Swift Hunger (the Sovereign): *It costs 3 more Vitae*, and *if it targets only one creature and that
    // creature is within your reach* - named only where a row carries them.
    // R7 (D-1865): `counted` - the talent's counter binds beside `perRound` (uses an encounter
    // equal to the rank, once a round). A row with no `perRound` is counted as it always was.
    return { identifier: talent.identifier, name: talent.name, talentId: talent.id ?? null, action: c.action, perRound, ...(c.counted === true ? { counted: true } : {}), ...(pierce > 0 ? { pierce } : {}),
      ...(Number(c.surcharge) > 0 ? { surcharge: Math.trunc(Number(c.surcharge)) } : {}), ...(c.oneInReach === true ? { oneInReach: true } : {}) };
  }
  return null;
}

/**
 * What the Use of a talent-granted feature does beyond its descriptor (D-771):
 * the granting talent's `onUse`, or null.
 *
 * @param {object|null} entry  the granting talent's row
 * @returns {{requires?: string, mitigate?: string, gain?: {pool: string, amount: string|number}, ends?: string, partner?: boolean}|null}
 */
export function onUseOf(entry) {
  const o = entry?.onUse ?? null;
  return o && typeof o === "object" ? o : null;
}

/** The rows reviewed and left to the table, each with its reason (D-648). */
export function noneRows() {
  const out = [];
  for (const [cls, rows] of Object.entries(TALENT_EFFECTS)) {
    for (const [identifier, entry] of Object.entries(rows)) if (entry.automated === "none") out.push({ cls, identifier, reason: entry.reason ?? "" });
  }
  return out;
}

/** The talents the code applies by name (D-627 and kin), as the table lists them. */
export function inlineTalents() {
  const out = [];
  for (const [cls, rows] of Object.entries(TALENT_EFFECTS)) {
    for (const [identifier, entry] of Object.entries(rows)) if (entry.automated === "inline") out.push({ cls, identifier });
  }
  return out;
}
