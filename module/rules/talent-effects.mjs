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
 * O-157 to O-165): `undispellable` (Improved Moonfire), `dispelGate` and
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
import { CLASS_FEATURES, action, bindRank, cost, evaluateAmount, mod, once } from "./class-features.mjs";
// What stands on somebody else (D-755): the descriptor, and the stamp that
// evaluates it at a rank.
import { aura, auraStamp } from "./auras.mjs";
// An area's words widened by a patch (Empowered Mending, D-774).
import { widenAreaText } from "./areas.mjs";

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
const rider = (pool, amount, { once = null, form = false, weapon = null, move = null, onHit = {}, atRank = [], discount = null, pays = null, needs = null, strike = null } = {}) => ({
  cost: { pool, amount }, once, form, weapon, move,
  onHit: { condition: null, value: null, damage: null, prone: false, heal: null, noHealing: null, sl: null, ...onHit },
  atRank, discount,
  // D-772: paid on a hit alone (Bloodthirst), struck with a shield (Shield Slam)
  // at a Rating of its own.
  pays, needs, strike
});

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
  dwarf: {
    // 02 §5: *Climbing and **Difficult ground** cost you no extra movement*
    // (D-757). INLINE: the one terrain door reads `movementFactsFor` when it
    // prices a step (`canvas/behaviors.mjs`), so a dwarf walking Consecration's
    // Difficult ground or climbing a cliff pays a foot a foot - for every
    // source of Difficult ground, a GM's own drawn rubble included.
    "mountain-bred": { automated: "inline", movement: { ignoresGround: true, climbsFree: true } }
  },
  goblin: {
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
  troll: {
    // 02 §5: *You swim at full Speed and hold your breath for ten minutes*
    // (the final review of D-757). INLINE, beside Mountain-Bred: the movement
    // door reads `movementFactsFor` when it prices a step and paces a swim
    // (`canvas/behaviors.mjs#movementFactsOf`), so a Darkspear swims a foot a
    // foot at its Speed where 05 charges everybody else two. The breath is the
    // table's.
    "island-blood": { automated: "inline", movement: { swimsFree: true } }
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
    // your rank in this talent* (D-772): it lands with the blow, as a rider's
    // condition does (the lead, 2026-10-03, on a rider: *"Lands automatically"*).
    "deep-cut": { hitLays: { sl: 2, condition: "bleeding", value: "rank" } },
    // *Cleave triggers on SL 3 rather than only when an attack you made reduces
    // a target to 0 Health. At rank 2 it triggers on SL 2* (D-772): 08 §5's
    // Cleave - *one attack against another target within reach at Damage Rating
    // −2. Once per round* - offered as a button on the card of a blow with a
    // Cleave weapon at the SL. Cleave's own kill trigger stays 08's note.
    "wide-swing": { extraStrike: { sl: 3, trait: "Cleave", count: 1, target: "other", rating: -2, atRank: [{ rank: 2, sl: 2 }] } },
    // *As a Half-Action, spend 4 Rage. Your next attack this turn ignores 1
    // Armor Point per rank* (D-772): the Use lays the promise, held to the turn,
    // and the next attack takes it as Pierce (`rules/next-attack.mjs`).
    "precise-strike": { grants: grant({ action: "half", cost: cost("rage", 4) }), onUse: { nextAttack: { penetration: "rank", lasts: "turn" } } },
    // *When an attack or effect of yours reduces a target to 0 Health, your next
    // attack this round gains a Boon. At rank 2 you also gain a Half-Action*
    // (D-772): from the one damage door (`afterBlow`).
    "follow-through": { kill: { nextAttack: { boons: 1, lasts: "round" }, atRank: [{ rank: 2, halfActions: 1 }] } },
    // *Your Sunder strips 1 more Armor Point per rank* and *costs 2 Rage less per
    // rank, to a minimum of 2*: `rules/maneuvers.mjs` reads both by name (D-626, D-768).
    "rend-armor": { automated: "inline" },
    // *You inflict a Critical Injury on 19 or 20 against a target below half
    // Health. At rank 2 this applies below three quarters* (D-772).
    "executioner": { critical: { on: 19, below: 0.5, atRank: [{ rank: 2, below: 0.75 }] } },
    // *As part of an attack, spend 8 Rage. On a hit, the target recovers no
    // Health from any source until the end of your next turn* (D-772): a rider,
    // and its mark on the target (`rules/no-healing.mjs`).
    "mortal-strike": { rider: rider("rage", 8, { onHit: { noHealing: "strikerTurnEnd" } }) },
    "sundering-blows": { automated: "inline" },
    // *Your first Parry each round costs no Reaction. At rank 2 the second costs
    // none either* (D-772): the round's record, through the queued door.
    "bladeturn": { freeReaction: { reaction: "parry", count: "rank" } },
    "killing-blow": { automated: "inline" },
    // *As a Full Action, spend 10 Rage to make one attack against every enemy
    // within your reach.* The card's Attack button rolls each (D-616); who is
    // within reach is the table's to target.
    // *one attack against every enemy within your reach*: one press per creature
    // (the architect's review of D-773).
    "whirlwind": { grants: grant({ action: "full", cost: cost("rage", 10), attack: true, attacks: "each" }) },
    // ---- Fury ----
    "enrage": { automated: "inline" },
    "quick-draw": none("drawing, sheathing and swapping already cost no action anywhere in this system: 05's Interact Half-Action is not charged (rules/reactions.mjs HALF_ACTIONS.interact), so there is nothing for the talent to waive"),
    // *Your attacks gain a Boon. Until your next turn, attacks against you gain
    // one too. At rank 2 only ranged attacks do* (D-772): a checked line on the
    // holder's attack dialog, and the attack made with it lays the exposure.
    "reckless": { reckless: { boons: 1, exposed: { boons: 1, ranged: false }, atRank: [{ rank: 2, exposed: { boons: 1, ranged: true } }] } },
    // *When one of your attacks hits, spend 6 Rage to recover Health equal to
    // your rank in this talent* (D-772): a rider ticked on the dialog and paid
    // only when the blow lands (MY READING, for the lead).
    "bloodthirst": { rider: rider("rage", 6, { pays: "hit", onHit: { heal: "rank" } }) },
    // *Your Off-Hand Attacks do not take the −2* is built (D-772). *Once a round,
    // when an Attack Test misses, spend 4 Rage to roll it again and take the new
    // result* is not.
    "second-strike": {
      offHand: { noPenalty: true },
      gap: "the re-roll of a missed Attack Test: no door rolls a posted attack again with what it was made with (the dialog's lines, the called shot, the riders paid) and takes the new result"
    },
    "frenzy": { automated: "inline" },
    // *When an attack or effect of yours reduces a target to 0 Health, gain a
    // Half-Action. At rank 2 you also gain 2 Rage* (D-772).
    "rampage": { kill: { halfActions: 1, atRank: [{ rank: 2, gain: { pool: "rage", amount: 2 } }] } },
    // *Your attacks cannot be Parried or Blocked* (the card offers neither;
    // D-772). *Armor Points still apply* needs nothing. *You may wield a
    // two-handed weapon in each hand* is NOT BUILT: D-689's two-way bar on the
    // off hand is read by `rules/worn.mjs` (`figureSlots`, `handFor`,
    // `displacedBy`) and by the bag law's judge (`rules/slots.mjs`, which strips
    // the talents before it judges, D-737), so lifting it for one talent means
    // threading the talent through every equip door and the master rule - and
    // half of that would let a two-hander into the off hand for the judge to
    // take back out. *Neither counts as being held in two hands for Versatile*
    // waits on it.
    "titans-presence": {
      unanswerable: true,
      gap: "a two-handed weapon in each hand: D-689's bar is read by the figure, handFor, displacedBy and the bag law's judge (D-737), which strips the talents before it judges, so lifting it for one talent is threaded through every equip door at once or not at all"
    },
    // *While you hold more than 7 Rage, recover 1 Health per rank at the start of
    // each of your turns* (D-772): `AzerothCombat#_turnTicks`.
    "blood-craze": { turnStart: { heal: "rank", while: { pool: "rage", above: 7 } } },
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
      reason: "whether a blow in the held rounds is floored at 1 is the lead's (CLARIFY, O-173): such a blow is not held, and out of a fight the rounds are the table's"
    },
    // ---- Bulwark ----
    // *While a friendly target is within 5 feet of you, your Block reduces 1 more
    // damage per rank* (D-772): the Block's door measures the friendly target -
    // somebody other than the warrior (MY READING, for the lead).
    "shield-wall": { block: { add: "rank", allyWithin: 5 } },
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
    // *As a Half-Action, spend 10 Rage for temporary Health equal to twice your
    // tier per rank. It lasts until the encounter ends* (D-777; the lead: *"raise
    // HP past max as temp hp"*): the Use grants it to the warrior through 05's
    // law, until the fight ends.
    "last-stand": {
      grants: grant({ action: "half", cost: cost("rage", 10) }),
      onUse: { tempHealth: { amount: "2*tier*rank", span: "encounter" } }
    },
    // *As part of an attack, spend 6 Rage to strike with your shield at Damage
    // Rating 4. At rank 2 a hit at SL 2 also applies Stun* (D-772).
    "shield-slam": { rider: rider("rage", 6, { needs: "shield", weapon: "melee", strike: { rating: 4 }, atRank: [{ rank: 2, onHit: { condition: "stunned", sl: 2 } }] }) },
    // *While you carry a shield, roll any Critical Injury against you twice and
    // take the lower result* (D-772): read by name at the Critical Injury's roll.
    "unbreakable": { automated: "inline" }
  },
  // **THE PALADIN'S THIRTY-SIX** (D-772, the talent plan's Phase 5).
  paladin: {
    // ---- Retribution ----
    // *As part of an attack, spend 4 Zeal to add your tier to its damage. At rank
    // 2 add twice your tier* (D-772): a rider whose hit adds to the Rating.
    "crusader-strike": { rider: rider("zeal", 4, { onHit: { damage: "tier" }, atRank: [{ rank: 2, onHit: { damage: "2*tier" } }] }) },
    "righteous-fury": { automated: "inline" },
    // *Your Zeal caps at 15 rather than 10*: `rules/momentum.mjs#capFor` reads it
    // by name through the actor's `ranksOf` (D-627, D-768).
    "zealotry": { automated: "inline" },
    // *Your attacks gain a Boon against a target below half Health. At rank 2
    // this applies below three quarters* (D-772): a checked line on the dialog.
    "hammer-of-wrath": { targetBoon: { kind: "attack", boons: 1, below: 0.5, atRank: [{ rank: 2, below: 0.75 }] } },
    // *As a Half-Action, spend 6 Zeal. The target takes a Bane on attacks against
    // anyone but you for one round per rank* (D-772).
    "judgement": { grants: grant({ action: "half", cost: cost("zeal", 6) }), onUse: { laysBane: { kind: "attack", banes: 1, except: "user", rounds: "rank" } } },
    // *Your Consecrated weapon counts as Blessed at Greater grade, converting its
    // damage to Holy* (D-772): read by name where the weapon 02's Consecrated
    // enchanted derives its trait (`WeaponData#prepareDerivedData`), and on the
    // Use's card.
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
    "seal-of-command": {
      grants: grant({ action: null, cost: cost("zeal", 5), uses: once("short") }),
      damage: damage(["holy"], "both", { until: "encounter" })
    },
    // *Your Zeal does not drain out of combat. At rank 2 you begin every fight
    // holding 3* (D-627, D-772): `_leaveFight` keeps it, `_fightStart` sets 3.
    // *Your Zeal does not drain out of combat. At rank 2 you begin every fight
    // holding 3* (D-772). INLINE: the fight's end keeps the Zeal and the fight's
    // start reads the rank by name - and the Zeal kept carries into the next fight
    // (D-779; the lead, 2026-10-03, on O-172: *"Yes"*; `momentum.mjs#fightStart`'s
    // `keepsZeal`). Rank 2's 3 is left as built: floor or reset is CLARIFY.
    "fanaticism": { automated: "inline" },
    // *As a Full Action, spend 10 Zeal. Every enemy within 20 feet takes Holy
    // damage at your Damage Rating, and each makes a Spirit Resilience Test
    // against your Spell DC or is blinded until your next turn* (D-772): the
    // damage is the main-hand weapon's Rating (`weapon`, MY READING, for the
    // lead), and Blinded is a button per target, until the paladin's turn starts.
    "wrath-of-the-light": { grants: grant({ action: "full", cost: cost("zeal", 10), resist: "spirit", area: "A 20 ft radius centered on you", damage: { amount: "weapon", type: "holy" }, inflicts: [{ condition: "blinded", value: null, until: "casterTurnStart" }] }) },
    // ---- Benediction ----
    // *As a Half-Action, spend 2 Mana. A friendly target you can see gains a Boon
    // on their next Test. At rank 2 it applies to every Test they make this
    // round* (D-772): a laid Boon on the one creature targeted.
    "blessing": { grants: grant({ action: "half", cost: cost("mana", 2) }), onUse: { laysBoon: { kinds: "all", boons: 1, until: "next", atRank: [{ rank: 2, until: "round" }] }, friendly: true } },
    // *You may use your Lay on Hands class feature one more time per Long
    // Rest* (D-752): the feature's own count goes to two.
    "open-hand": { modifies: mod("Lay on Hands", { uses: { max: 2 } }) },
    // *Every feature of yours that restores Health restores an extra amount
    // equal to your rank* and *Add your rank to the Health restored by any of
    // your healing features* (D-772): a `heal.add` patch on EVERY healing feature
    // the character holds, of any class (the lead, 2026-10-03, on O-160: *"Yes."*
    // to whether a second class's healing feature counts; D-778) - the `healing`
    // kind, laid by the feature sync (`healingPatchesFor`), a class feature's and
    // a talent's granted one alike. It was Lay on Hands' alone.
    "devotion": { healing: { heal: { add: "rank" } } },
    // *You know Cleanse. At rank 2 it ends two effects rather than one.* The
    // spell is taught; ending an effect is the table's (nothing ends one off the
    // card), so the rank's change rides the card's note.
    "cleanse": { spell: { names: ["Cleanse"], learn: true } },
    // *A Short Rest with a drink returns 3 more Mana per rank* (D-772): the rest's
    // own arithmetic takes it, into the Paladin's pool.
    "lights-reserve": { rest: { short: { mana: "3*rank", drink: true } } },
    // *When a Casting Test of yours reaches SL 2 or better, 1 Mana per rank
    // returns to you* (D-772): a spell's and a casting feature's.
    "illumination": { manaBack: { sl: 2, amount: "rank" } },
    // *As a Reaction, spend 4 Mana to take a Critical Injury a target within 30
    // feet would take. You may have one more Critical Injury before dying. At rank
    // 2 the range is 60 feet.* A QUESTION for the lead (D-772): D-777's ruling on
    // moved damage (O-155) left *one more Critical Injury before dying* unanswered
    // (CLARIFY), so nothing of it is built.
    "sacrifice": {
      grants: grant({ action: "reaction", cost: cost("mana", 4) }),
      gap: "06 counts no Critical Injuries before dying (dying is a result on the table), so *one more before dying* has no rule to change - the lead's answer on moved damage (D-777) left it unanswered; and no door moves an INJURY, as D-777's moves a blow's damage"
    },
    // *Choose a friendly target you know during a Long Rest. When another target
    // within 120 feet of you restores Health from your spells and effects, your
    // chosen target restores half as much, rounded down* (D-772): a Use once a
    // Long Rest names the creature (Symbiosis's door), and the healing door passes
    // the share on.
    "beacon": { grants: grant({ action: null, uses: once("long") }), onUse: { beacon: true }, beacon: { share: "half", feet: 120 } },
    // Devotion's twin (D-778): every healing feature of any class.
    "holy-guidance": { healing: { heal: { add: "rank" } } },
    // *A friendly target within 30 feet who would drop to 0 Health stays at 1
    // instead. You may use this a number of times equal to your rank per Long
    // Rest* (D-777; the lead: *"Yes."*): the damage door ASKS the Paladin as the
    // blow would drop a friendly target in reach to 0, and a yes strikes a use of
    // the counter and holds it at 1 (`effects/blow-doors.mjs#holdBlow`).
    "intervention": { grants: counter("rank", "long"), holds: { kind: "intervention", feet: 30 } },
    // *Your first healing feature after each Long Rest costs no Mana. At rank 2
    // the first two cost none* (D-772): the counter's uses are the free ones, and
    // a healing feature's Use takes one instead of its Mana - of any class the
    // character holds (D-778, O-160: `class-talents.mjs#waives`).
    "divine-favor": { grants: counter("rank", "long"), freeHealing: true },
    // *You know Aegis of the Light. A creature held at 1 Health by it restores
    // Health equal to your tier when the spell ends* (D-777): 07's floor is laid
    // by the spell card's Apply and held at the one damage door, and a creature it
    // held restores the tier when the laid floor goes (`effects/blow-doors.mjs`).
    "aegis-of-the-light": {
      spell: { names: ["Aegis of the Light"], learn: true },
      aegis: { heal: "tier" }
    },
    // ---- Aegis ----
    "shield-of-faith": { passive: passive([add("system.defense", "rank")], "shield") },
    // *Your Aura of Resolve class feature reaches 10 feet further per rank*
    // (D-755): 30 at rank 1, 40 at rank 2.
    "wide-aura": { modifies: mod("Aura of Resolve", { auraReach: "10*rank" }) },
    // *Your Block reduces 1 more damage per rank* (D-772).
    "redoubt": { block: { add: "rank" } },
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
    // *Your Quarry maximum increases by 2 per rank*: `rules/momentum.mjs#capFor`
    // reads it by name (D-627), which the `none` row it carried denied (D-768).
    "hunters-mark": { automated: "inline" },
    // *As an action, spend 4 Focus to attack up to four targets within a 10-foot
    // radius. Roll each attack separately* (D-773): the Use refuses a fifth target
    // before anything is paid, and the card's Attack button costs nothing more -
    // the action paid for every attack (a fault every attacking feature shared).
    "barrage": {
      grants: grant({ action: "action", cost: cost("focus", 4), attack: true, area: "A 10 ft radius on the ground" }),
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
    // *Once per Long Rest, spend a Full Action to make four attacks against one
    // target per rank.* The Use pays the Full Action; each attack is the card's
    // Attack button, which costs nothing more (D-773).
    "rapid-fire": {
      // *four attacks against one target per rank*: at most four a rank, the
      // larger of the two readings (the architect's review of D-773).
      grants: grant({ action: "full", uses: once("long"), attack: true, attacks: "4*rank" }),
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
    // to your rank* (D-773): off the owner's talents, landing as Deep Cut's does.
    "ferocious-bite": { hitLays: { sl: 2, condition: "bleeding", value: "rank", via: "companion" } },
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
    // *As part of an attack, spend 2 Focus. On a hit the target's Speed drops 10
    // feet per rank until your next turn* (D-773): an effect on the target's Speed
    // until the start of the STRIKER's next turn.
    "wing-clip": { rider: rider("focus", 2, { onHit: { speedDrop: "10*rank", until: "strikerTurnStart" } }) },
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
      reason: "which dose the Snare spends is the lead's (CLARIFY, O-178): nothing is marked off the poison carried, and the table marks the dose it judges"
    },
    "explosive-trap": { modifies: mod("Snare", { damage: { amount: "3*rank", type: "fire" }, resist: "reflex" }) },
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
    // A further use of a Ranger feature of your choice: the counter is the
    // talent's, struck when the player takes the extra use (D2 §12).
    "readiness": { grants: grant({ action: null, uses: uses("rank", "short") }) },
    // *... You may set your Snare class feature any number of times during your
    // movement* (D-773): no action, as Trapper's. **The first sentence is always on**
    // (D-779; the lead, 2026-10-03, on O-179: *"Always on"*): every ally within 30
    // feet of the Ranger, the Ranger included, pays a foot a foot on Difficult
    // ground no spell, enchanted item or class feature laid, and on a climb or a
    // swim (`canvas/behaviors.mjs`, `class-answers.mjs#landwise`).
    "master-of-the-land": {
      modifies: mod("Snare", { action: null }),
      landwise: { feet: 30 },
      reason: "*leave no trail* is the table's (a Survival Test's terms, D2 §12), and a Speed reduction - a condition, a load - is no terrain"
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
    // *A poison you apply deals 1 more damage per rank.* The rank rides the
    // coating flag (08 §12, D-719) and `coatingFired` carries it onto the blow
    // the poison lands on, so it is applied by name in the code.
    "envenom": { automated: "inline" },
    // *Applying a poison during a weapon attack does not cost an action*:
    // `rules/consumables.mjs#coatingAction` reads the rank by name.
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
    // *Your Finisher class feature may apply Bleeding equal to twice the Combo
    // Points spent plus your rank, instead of dealing damage* (D-773).
    "rupture": { modifies: mod("Finisher", { bleeding: "2*spent+rank" }) },
    // *When you deal damage with an attack to a target affected by Bleeding, you
    // build 1 more Combo Point per rank* (D-773).
    "blood-sport": { momentum: { pool: "comboPoints", amount: "rank", when: "bleedingDealt" } },
    // *Once per Short Rest, name a target you can see. Until your next Short or
    // Long Rest your Finisher class feature against it costs no Combo Points and
    // counts as having spent five* (D-773).
    "death-mark": { modifies: mod("Finisher", { free: true, counts: 5 }), grants: counter(1, "short"), onUse: { deathMark: true } },
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
    "main-gauche": { freeReaction: { reaction: "parry", count: 1, per: "turn", needs: "dualMelee" }, reworked: "O-180" },
    // *Your Energy pool returns 1 more per rank at the start of your turn. Once a
    // round per rank, you may spend 2 Energy to gain 1 Combo Point* (D-773).
    "adrenaline": {
      turnStart: { restore: { pool: "energy", amount: "rank" } },
      grants: grant({ action: null, cost: cost("energy", 2) }),
      onUse: { gain: { pool: "comboPoints", amount: 1 }, perRound: "rank" }
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
    // *When a Riposte of yours reduces a target to 0 Health, make one attack
    // immediately against another target within reach* (D-773).
    "killing-spree": { kill: { strike: { who: "self", riposte: true, target: "other", count: 1 } } },
    // *While you are Engaged with exactly one enemy, your attacks against it deal
    // 1 more damage per rank.* Engaged is measured (06, D-669).
    "deadly-poise": { damage: damage(["all"], "attack", { when: "engagedOne" }) },
    // *Once a round per rank, when you hit with an attack, a second enemy within 5
    // feet of the target takes half the damage, rounded down* (D-773).
    "blade-flurry": { blowShare: { share: "half", feet: 5, count: "rank" } },
    // *You gain one further Reaction each round per rank, usable only to Parry*
    // (D-773): Bladeturn's door, a Parry a rank that costs no Reaction.
    "combat-reflexes": { freeReaction: { reaction: "parry", count: "rank" } },
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
    // *Your attacks while hidden ignore 2 Armor Points per rank* (D-773).
    "find-weakness": { hidden: { pierce: "2*rank" } },
    // *An attack you make while hidden cannot be Parried or Blocked* (D-773).
    "ghostly-strike": { unanswerable: "hidden" },
    "smoke-bomb": {
      grants: grant({ action: "half", uses: uses("rank", "short"), area: "A 15 ft radius on the ground" }),
      reason: "who sees through the obscured area is vision, the table's (D2 §12): the Use places the area and counts the rest's uses"
    },
    // *A target you attack while hidden is treated as being under your Opening
    // class feature, for a number of rounds equal to your rank* (D-773).
    "subterfuge": { modifies: mod("Opening", { marks: "rank" }) },
    // *Taking actions while hidden does not make you visible* (D-773): the attack
    // and the cast leave the Hide standing.
    "master-of-shadows": { stealth: { keep: true } }
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
    // *You know Power Word: Shield. Each rank adds 2 to the temporary Health it
    // grants* (D-777): 07's 6 and the rank's 2 ride the card, and its Apply grants
    // them with the laid effect (`castSpell`, `applySpellEffectFromCard`).
    "power-word-shield": {
      spell: { names: ["Power Word: Shield"], learn: true },
      tempHealth: { spells: ["Power Word: Shield"], add: "2*rank" }
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
      reason: "rank 2's *after the damage is known* is the lead's (CLARIFY, O-181): the card shows the roll and its damage at once, so the Ward answers either moment"
    },
    // *You know Pain Suppression. Each rank adds 1 to the damage it prevents*
    // (D-774): the spell's own *reduced by 3* on the laid effect, and the rank on it.
    "pain-suppression": { spell: { names: ["Pain Suppression"], learn: true, adds: [{ key: "system.damageReduction", amount: "rank" }] } },
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
    // *You know Barrier. Each rank adds 1 to the Ward it grants* (D-779; the lead,
    // 2026-10-03, on O-182: *"Yes"*): the creatures the cast targets are the ones
    // chosen, and the area its card places carries their Ward - 07's 3 and the
    // rank - as a rider the aura door lays while each stays inside
    // (`class-answers.mjs#chosenWardRemains`).
    "barrier": {
      spell: { names: ["Barrier"], learn: true },
      chosenWard: { spells: ["Barrier"], add: "rank" }
    },
    // *Your Ward class feature may name two targets rather than one* (D-774).
    "mass-ward": { modifies: mod("Ward", { targets: 2 }) },
    // *A target carrying your Ward class feature takes 1 less damage per rank
    // from every source* (D-774): the laid Ward carries it on `damageReduction`.
    "shield-discipline": { modifies: mod("Ward", { reduction: "rank" }) },
    // *A target of your Ward class feature whose Health would drop to 0 as the
    // result of an attack instead stays at 1 Health. You may use this a number
    // of times equal to your rank per Long Rest* (D-777): the damage door ASKS the
    // priest whose Ward stands on the creature an attack would drop to 0, and a
    // yes strikes a use and holds it at 1. The Ward's patch names the talent.
    "spirit-shell": {
      modifies: mod("Ward", { shell: true }),
      grants: counter("rank", "long"),
      holds: { kind: "spiritShell" }
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
    // *You know Renew. Each rank adds 1 to the Health it restores each turn*
    // (D-774): D-771's tick row, Rejuvenation's shape.
    "renew": { spell: { names: ["Renew"], learn: true }, tick: { spells: ["Renew"], add: "rank" } },
    // *Add your rank to the Health restored by your Mend and Mass Mend class features* (D-768).
    "serendipity": { modifies: [mod("Mend", { heal: { add: "rank" } }), mod("Mass Mend", { heal: { add: "rank" } })] },
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
    // *Once per Long Rest, one healing feature of yours restores its full amount
    // to every friendly target within 60 feet without a Casting Test* (D-779; the
    // lead, 2026-10-03, on O-185: *"use of it's own, Cast a healing spell without
    // requiring a casting test for the next healing spell. That healing spell
    // amoutn can't be reduced."*): a Use of its own, at no action, laying the
    // promise the next healing spell takes - no Casting Test and a heal nothing
    // reduces (`casting.mjs#takeNextSpell`'s `miracle`).
    "miracle": {
      grants: counter(1, "long"),
      onUse: { miracle: true },
      auraReason: "the lead made Miracle the next healing spell's (O-185): its 60 feet is drafted out of 04 (book-edits-2 d20)"
    },
    // ---- Shadow ----
    // *You know Shadow Word: Pain. Each rank adds 1 to its Damage Rating*
    // (D-774): its Damage Rating IS its tick (D-770), so the rank rides the tick.
    // It was `spell.damage`, which added to a Rating the cast never deals - a
    // no-op since D-770 (D-681's shape).
    "shadow-word-pain": { spell: { names: ["Shadow Word: Pain"], learn: true }, tick: { spells: ["Shadow Word: Pain"], add: "rank" } },
    // *You know Mind Flay. Each rank adds 1 to the damage it deals each turn* (D-774).
    "mind-flay": { spell: { names: ["Mind Flay"], learn: true }, tick: { spells: ["Mind Flay"], add: "rank" } },
    // *If you have not dealt Holy damage or used a healing spell or feature since
    // your last turn, you may add 1 Shadow damage per rank to your spells and
    // attacks* (D-774): the fact is read now - the priest's `shadowform` flag,
    // marked by Holy dealt and a heal given and cleared at the end of their own
    // turn - so the line comes ticked where it holds. It reaches a Shadow blow alone,
    // as built since D-711 (the lead, 2026-10-03, on O-187: *"No it has no effect on
    // non-shadow spells."*; D-779).
    "shadowform": { damage: damage(["shadow"], "both", { when: "shadowform" }) },
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
    // a Short Rest.* 07 §4's own once-a-Short-Rest gate is enforced nowhere (O-110).
    "dispersion": {
      spell: { names: ["Dispersion"], learn: true },
      reason: "07 §4's *A tier 4 spell may be cast once, and not again until you finish a Short Rest* is enforced nowhere (O-110), so there is no gate for the rank to raise; the castings are the table's to count until O-110 is built"
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
    // *You know Void Eruption. Its radius is 40 feet, and a creature that fails
    // the Test is also Silenced until the end of your next turn* (D-756; D-774:
    // the Silenced rides the failure beside 07's own Stunned).
    "void-eruption": { spell: { names: ["Void Eruption"], learn: true, widen: 10, onFail: ["silenced"] } }
  },
  // **THE SHAMAN'S THIRTY-SIX** (D-774, the talent plan's Phase 9).
  shaman: {
    // ---- Elemental ----
    // *Fire and Nature damage you deal increases by 1 per rank against a target
    // that has taken damage from you* (D-768's lane): the attacker's damaged mark.
    "elemental-fury": { damage: damage(["fire", "nature"], "both", { when: "damagedTarget" }) },
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
      reason: "07's arcs are the creatures the caster targets: the card strikes every creature targeted and no door counts a spell's targets, so a further arc is one more creature the table lets the caster name"
    },
    // *After a Casting Test you make meets or exceeds SL 3, your next spell costs 2
    // less Mana per rank* (D-774): Nature's Grace's shape (D-771).
    "elemental-focus": { nextSpell: { amount: "2*rank", on: "casting", sl: 3, turn: false } },
    // *You know Earth Shock. At rank 2 the target is also unable to take a Reaction
    // until the end of its next turn.*
    "earth-shock": {
      spell: { names: ["Earth Shock"], learn: true },
      gap: "rank 2 has no carrier: D-773's lost Reaction is the one held now, and 06's Reaction comes back at the start of the creature's next turn, so a Reaction barred THROUGH that turn needs the turn's reset to read a bar it does not have"
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
      reason: "a second turn each round is the tracker's to give, and it gives one turn a combatant (side-based order, D-256): the table runs the elemental's second turn, its budget restored by the GM's own door (D-718)"
    },
    // *A Storm elemental, an Earth elemental and a Fire elemental appear*: ONE
    // of each. `count` is how many of EACH entry are called, so the 3 this row
    // carried called nine (D-768).
    "storm-earth-and-fire": { grants: grant({ action: null, cost: cost("mana", 15), uses: once("long"), summons: summons(["Storm Elemental", "Earth Elemental", "Fire Elemental"], 1) }) },
    // ---- Enhancement ----
    // *Once a round, when you hit with a weapon attack, add Nature damage equal to
    // your rank* (D-774, D-777; the lead: *"Different damage types in one attack
    // are possible"*): a second amount on the blow, NATURE, met by the target's own
    // Nature Ward, Immune and Vulnerable (`mitigation.mjs#resolveDamage`'s extras).
    "stormlash": { stormlash: { amount: "rank", once: "round", type: "nature" } },
    // *While you Sustain it, your weapon attacks deal Fire damage rather than
    // Physical. At rank 2 they add 1 damage as well*
    // (D-779; the lead, 2026-10-03, on O-188: *"1 mana"*): the Use begins a Sustain
    // of its own for 1 Mana, held for 1 Mana at the start of each of the shaman's
    // turns as any Sustain is (05 §12), and while it stands a weapon blow is Fire
    // (`class-answers.mjs#flametongueStrike`).
    "flametongue": {
      grants: grant({ action: null, cost: cost("mana", 1) }),
      onUse: { sustain: { identifier: "flametongue" } },
      flametongue: { add: 0, atRank: [{ rank: 2, add: 1 }] }
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
    // *While a totem of yours stands, you take 2 less damage from every source*
    // (D-774): a passive gated on a totem bound to the shaman (D-643), on
    // `system.damageReduction` (D-696).
    "earthen-shield": { passive: passive([add("system.damageReduction", 2)], "totem") },
    // *Your weapon attacks count as spells for your own talents and features, and
    // you may make Casting Tests with your Attack Test instead*
    // (D-779; the lead, 2026-10-03, on O-190: *"Any spell cast or magic damage from
    // weapon attacks."*): a weapon blow whose damage is magical takes the spell lane
    // as well as the attack's - the talents' Damage lines and what stands on the
    // shaman (`class-answers.mjs#blademasterReaches`).
    "elemental-blademaster": {
      blademaster: true,
      reason: "*you may make Casting Tests with your Attack Test instead* is not built: the ruling named what the attacks reach, and a Casting Test made off the Attack Test's modifiers has no line on the casting dialog (O-229)"
    },
    // ---- Restoration ----
    // *You know Healing Wave. Each rank adds 1 to the Health it restores* (D-774).
    "healing-wave": { spell: { names: ["Healing Wave"], learn: true, heal: 1 } },
    // *Your Healing Stream totem restores 1 more Health per rank ...*
    "healing-stream-totem": none("the Healing Stream totem's own heal is the table's (D-707: the six totems that do not attack carry their effect as an aura reason), so there is no number for the rank to raise"),
    // *A Casting Test of yours that fails costs no Mana. You may use this a number
    // of times equal to your rank per Short Rest* (D-774): a button on the failed
    // card, the Mana back and a use struck.
    "ancestral-knowledge": { grants: counter("rank", "short"), refund: { failed: true } },
    // *Your Healing Wave also restores half as much, rounded down, to one further
    // friendly target within 10 feet per rank* (D-774).
    "chain-heal": { spell: { names: ["Healing Wave"], further: { count: "rank", share: "half", feet: 10 } } },
    // *When you make a melee attack, you may restore Health to yourself equal to
    // half your tier, rounded down, plus your rank* (D-774): every melee attack,
    // landed or not (MY READING: the door has no moment to ask, and nobody turns
    // the Health down).
    "earthliving": { earthliving: { heal: "floor(tier/2)+rank", melee: true } },
    // *Your Mana Tide totem returns 1 more Mana per rank ...*
    "mana-tide-totem": none("the Mana Tide totem's own Mana is the table's (D-707's aura reason), so there is no number for the rank to raise; the ground the totem holds is drawn from 02's row"),
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
    // *You know Ancestral Tide. Each target also regains 4 Health at the start of
    // their next turn* (D-774): a tick the cast stamps (D-770's carrier).
    "ancestral-tide": { spell: { names: ["Ancestral Tide"], learn: true, addTick: { kind: "heal", amount: 4, rounds: 1 } } }
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
    "arcane-concentration": { upkeep: { less: "rank", min: 1 } },
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
    "overchanneller": {
      overchannel: { less: "rank" }
    },
    // "You know X": the spell is learned with the talent, and the rank's rider rides its card.
    "arcane-missiles": { spell: { names: ["Arcane Missiles"], learn: true, damage: 1 } },
    // *When you Overchannel and the Casting Test succeeds, 2 Mana per rank returns
    // to you* (D-775): Illumination's door (D-772), gated on an Overchannel.
    "clearcasting": { manaBack: { overchannel: true, amount: "2*rank" } },
    // *You know Mana Shield. At rank 2 it costs no Mana to hold* (D-775): the
    // upkeep the turn's start charges it is nothing from rank 2.
    "mana-shield": { spell: { names: ["Mana Shield"], learn: true }, upkeep: { spells: ["Mana Shield"], free: true, minRank: 2 } },
    // *Until the end of your next turn your spells add 1 Arcane damage per
    // rank.* Laid by the feature's own Use and expired by core (D-628). **EVERY
    // spell** (D-775), and **ARCANE** (D-777; the lead: *"Different damage types
    // in one attack are possible"*): the rank rides the typed lane
    // (`system.damageBonus.typed.spell.arcane`), so a Fire spell lands its Fire
    // and a second amount of Arcane, each met by its own Ward - a creature Immune
    // to Fire still takes the Arcane - and an Arcane spell's own Rating takes it.
    "arcane-power": {
      grants: grant({ action: "half", cost: cost("mana", 4), uses: once("short") }),
      damage: damage(["all"], "spell", { until: "endOfNextTurn", as: "arcane" })
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
      modifies: mod("Counterspell", { steals: true }),
      gap: "rank 2's *you may Sustain that effect yourself instead* has no door: a Sustain, the effects it laid and the area it placed answer to the caster who cast it (D-724, D-756), and nothing moves one to another caster"
    },
    // *Your Shape the Weave class feature Sustains 1 further effect per rank,
    // and the Mana each costs at the start of your turn is reduced by the number
    // of effects you are Sustaining* (D-775): the limit, built; the reduction
    // (D-778, O-163) off each entry's own upkeep, by the count held as the turn
    // starts, while the mage holds Shape the Weave. 07 §7's *pays for all five
    // every turn* is the book conflict the records name.
    "netherwind": {
      modifies: mod("Shape the Weave", { sustains: "rank", upkeepLess: "held" })
    },
    // *As a Reaction, spend 6 Mana. You gain Ward 2 against every school until
    // the end of your next turn* (D-775): Cloak of Shadows' door (D-773), every
    // school and no chooser, its span the end of the mage's next turn.
    "prismatic-ward": { grants: grant({ action: "reaction", cost: cost("mana", 6) }), onUse: { ward: { amount: 2, everySchool: true, until: "userTurnEnd" } } },
    // *You know Archmage. While it runs you may sustain one further spell than
    // you otherwise could, and its maximum is four Boons rather than three*
    // (D-775): the limit and 07's Boon line, both while its laid effect stands.
    "archmage": { spell: { names: ["Archmage"], learn: true }, archmage: { sustains: 1, boons: 4 } },
    // ---- Fire ----
    "fireball": { spell: { names: ["Fireball"], learn: true, damage: 1 } },
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
    // takes Fire damage equal to twice your tier plus your rank. At rank 2 a
    // Casting Test at SL 3 or better also applies Stun until your next turn*
    // (D-775): the Stun a button per target, as Hurricane's Slowed is (D-771).
    "pyroblast": {
      grants: grant({
        action: "full", cost: cost("mana", 6), casting: true, damage: { amount: "2*tier+rank", type: "fire" },
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
    // your tier per rank and suffers your Ignite* (D-775): the area's tick, as
    // D-756's (the Use deals nothing itself), the Ignite Ignite's own door's.
    "firestorm": {
      grants: grant({ action: "half", cost: cost("mana", 8), casting: true, uses: once("short"), area: "A 20 ft radius on the ground" }),
      onUse: { areaTick: { who: "creature", amount: "tier*rank", type: "fire", rounds: 1 } }
    },
    // *Once per Long Rest, when you would drop to 0 Health you stay at 1 instead,
    // and every enemy within 10 feet takes Fire damage equal to your tier*
    // (D-775): at the one damage door, the counter's use struck (MY READING: the
    // first such blow, as Divine Favor's first heal).
    "cauterize": { grants: counter(1, "long"), cauterize: { stay: 1, feet: 10, amount: "tier", type: "fire" } },
    // *You know Sunfire. Its Casting Test is against DC 22 rather than 26* (D-775).
    "sunfire": { spell: { names: ["Sunfire"], learn: true, dc: 22 } },
    // ---- Frost ----
    "frostbolt": { spell: { names: ["Frostbolt"], learn: true, damage: 1 } },
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
      reason: "07's Ice Block lays nothing (*nothing can affect you* is the table's), so there is no effect for rank 2 to end early"
    },
    // *Your spells gain a Boon against a target that is Entangled or Slowed, or
    // whose Speed is otherwise reduced. At rank 2 they inflict a Critical Injury
    // on 19 or 20 against such a target* (D-775): an automatic line on the
    // Casting Test, and a Critical Injury button on the spell's card.
    "shatter": {
      targetBoon: { on: ["casting"], boons: 1, when: "slowedTarget" },
      spellCritical: { on: 19, when: "slowedTarget", minRank: 2 }
    },
    // *You know Cone of Cold. Each rank adds 5 feet to the cone* (D-775).
    "cone-of-cold": { spell: { names: ["Cone of Cold"], learn: true, lengthen: "5*rank" } },
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
    // *You know Absolute Zero. A creature it Stuns takes a Bane on every Test to
    // end the Stun* (D-778, O-159): 07's *Stunned until it passes the Test again at
    // the end of one of its turns* is a prompt at the end of each of the creature's
    // turns, Poisoned's shape (D-628), and the Bane rides the escape the Stun carries.
    "absolute-zero": {
      spell: { names: ["Absolute Zero"], learn: true },
      escape: { spells: ["Absolute Zero"], banes: 1 }
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
    "malediction": {
      tick: { spells: ["Curse of Agony", "Curse of Doom"], add: "rank" },
      extend: { spells: ["Curse of Weakness", "Curse of Tongues", "Curse of the Elements", "Curse of Exhaustion", "Curse of Ruin"], features: ["Curse"], minutes: "rank" }
    },
    // *Your Life Tap class feature returns 1 further Mana per rank for each Health
    // you spend* (D-775): on 02's Life Tap, built with it.
    "improved-life-tap": { modifies: mod("Life Tap", { mana: "rank" }) },
    // *At the start of your turn, if any target lost Health to Shadow or Fel
    // damage from you since the start of your last turn, you restore Health equal
    // to the highest amount a single target lost, to a maximum of twice your
    // rank* (D-775): the highest loss recorded at the one damage door, healed at
    // the turn's start (`AzerothCombat#_talentTicks`).
    "siphon": { siphon: { types: ["shadow", "fel"], max: "2*rank" } },
    // *You know Curse of Agony. Each rank adds 1 to its Damage Rating* (D-775): its
    // Damage Rating IS its tick (D-770), so the rank rides the tick, as D-774
    // moved Shadow Word: Pain's.
    "curse-of-agony": { spell: { names: ["Curse of Agony"], learn: true }, tick: { spells: ["Curse of Agony"], add: "rank" } },
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
    "unstable-affliction": { unstable: { amount: "2*tier*rank", type: "fel" } },
    // *Your Curse class feature may name one further target within 30 feet per
    // rank* (D-775): on 02's Curse, built with it (MY READING: within 30 feet of
    // the first, as D-774 read Circle of Healing's further target).
    "pandemic": { modifies: mod("Curse", { further: { count: "rank", feet: 30 } }) },
    // *You know Blood Pact, and it takes Health from a demon of your Bound Demon
    // class feature rather than from one you merely command.*
    "blood-pact": {
      spell: { names: ["Blood Pact"], learn: true },
      reason: "07's Blood Pact carries no descriptor - its Health off a demon and its Mana are the table's - so which demon pays is the table's too"
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
    "everlasting-affliction": {
      extend: { ongoing: true, minutes: "rank" },
      dispelGate: { sl: 2, minRank: 2 }
    },
    // *You know Soul Reaper. Sustaining it costs no Mana, and when the target dies
    // you restore Health equal to twice your tier* (D-775).
    "soul-reaper": {
      spell: { names: ["Soul Reaper"], learn: true },
      upkeep: { spells: ["Soul Reaper"], free: true },
      death: { spell: "Soul Reaper", heal: "2*tier" }
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
      reason: "07's Soul Link moves half of every blow the warlock takes onto the linked creature, past its armor and Ward. The damage door moves and divides a blow since D-777 (Spirit Link Totem's division), but Soul Link's link has no carrier - its Apply lays nothing the door reads, and nothing breaks it at 60 feet or at 0 Health - so the share, and the share rank 2's Ward would apply to, are the table's"
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
    "demonic-knowledge": {
      damage: damage(["fel", "shadow"], "both", { when: "boundDemon" }),
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
    // *Each rank adds 1 to its Damage Rating* - the number, not only the note.
    "shadow-bolt": { spell: { names: ["Shadow Bolt"], learn: true, damage: 1 } },
    // *You know Immolate. Each rank adds 1 to its Damage Rating* (D-775): its
    // Damage Rating IS its tick (D-770), so the rank rides the tick.
    "immolate": { spell: { names: ["Immolate"], learn: true }, tick: { spells: ["Immolate"], add: "rank" } },
    // *If you have spent Health since the start of your last turn…* Nothing
    // records it, so the line is the table's (D2 §12).
    "devastation": { damage: damage(["fel", "fire", "shadow"], "spell", { when: "judgement" }) },
    // *Each rank adds 1 to its Damage Rating, before Immolate doubles it.*
    "conflagrate": {
      spell: { names: ["Conflagrate"], learn: true, damage: 1 },
      reason: "the rank rides the Rating; 07's own doubling against a target burning from Immolate is the table's, as the spell carries no descriptor for it"
    },
    // *When one of your spells inflicts a Critical Injury, roll twice on the table
    // and take the higher result. At rank 2 you also gain 2 Mana* (D-775): read
    // where a spell's Critical Injury is rolled - a creature it drops to 0, and
    // the spell card's own button.
    "ruin": { ruin: { higher: true, mana: 2, minRank: 2 } },
    // *After a Casting Test you make meets or exceeds SL 3, your next spell costs
    // a Half-Action rather than an action. You may use this a number of times
    // equal to your rank per Short Rest* (D-775): Nature's Grace's door (D-771),
    // a use struck when a spell takes it.
    "backdraft": { grants: counter("rank", "short"), nextSpell: { cast: "half", on: "casting", sl: 3, turn: false } },
    // *You know Chaos Bolt. Each rank adds 2 to the damage it deals* (D-775).
    "chaos-bolt": { spell: { names: ["Chaos Bolt"], learn: true, damage: 2 } },
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
    // *You know Cataclysm. Its Casting Test is against DC 22 rather than 26, and it
    // costs you 6 Health rather than 10* (D-775).
    "cataclysm": { spell: { names: ["Cataclysm"], learn: true, dc: 22, health: 6 } }
  },
  druid: {
    // *You know Celestial Alignment. Its duration is 2 minutes, and while it
    // runs your Arcane and Nature spells ignore 2 Ward* (D-771). The span
    // replaces 07's minute on the card and the laid effect; the Ward is
    // ignored while the spell's own laid effect stands on the druid, read by
    // `AzerothActor#spellWardPierce` at the cast and at a tick of theirs.
    "celestial-alignment": {
      spell: {
        names: ["Celestial Alignment"], learn: true, duration: "2 minutes",
        ignoresWard: { amount: 2, schools: ["arcane", "nature"], while: "celestial-alignment" }
      }
    },
    "insect-swarm": { spell: { names: ["Insect Swarm"], learn: true, damage: 1 } },
    // *Each rank adds 1 to the damage it deals at the start of the target's
    // turns* (D-771): the TICK's number, stamped at the cast (D-770).
    "moonfire": { spell: { names: ["Moonfire"], learn: true }, tick: { spells: ["Moonfire"], add: "rank" } },
    // *Each rank adds 1 to the Health it restores each turn* (D-771).
    "rejuvenation": { spell: { names: ["Rejuvenation"], learn: true }, tick: { spells: ["Rejuvenation"], add: "rank" } },
    // *It strikes two creatures of your choice inside the area each turn
    // rather than one* (D-771). 07's own strike - *one creature of your choice
    // inside the area* at the start of the CASTER's turn - is the table's
    // (`ticks.mjs#UNTICKED`'s casterChoice, the pack's reason), so the second
    // creature is the table's with it: there is no door to widen.
    "starfall": {
      spell: { names: ["Starfall"], learn: true },
      automated: "none",
      reason: "07's Starfall strikes a creature of the caster's choice at the caster's turn, which is the table's (the spell's own reason), so the second creature is the table's too"
    },
    "starfire": { spell: { names: ["Starfire"], learn: true, damage: 1 } },
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
    "tree-of-life": {
      // *Its radius is 40 feet*: 07's *every ally within 30 feet* regains its
      // Health 10 feet further out (D-756, the self-centred tick's reach).
      spell: { names: ["Tree of Life"], learn: true, widen: 10 },
      aura: aura({ feet: 40, gate: "spell:tree-of-life", floor: { ap: 2, ward: 2 } })
    },
    // *After a Long Rest, name a friendly target. Whenever either of you
    // restores Health, the other restores half as much, rounded down* (D-771).
    // The Use names the partner - the one creature the user has targeted - and
    // the bond holds until the next Long Rest; `rules/symbiosis.mjs` is the
    // law and `AzerothActor#applyHealing` the door. *Each of you gains a Boon
    // on a Skill Test in which the other holds the higher Skill Rank* turns on
    // two Ranks compared at each Test and 30 feet: the table's call (D2 §12,
    // D-755), said here and built nowhere.
    "symbiosis": {
      grants: grant({ action: null, uses: once("long") }),
      onUse: { partner: true },
      shares: { heal: "half" },
      // The aura census's own word for an ally-radius sentence a built row
      // leaves to the table (Spirit Link Totem's shape, D-755).
      auraReason: "the Boon on a Skill Test is two Skill Ranks compared within 30 feet at each Test, the table's (D2 §12)"
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
    "heart-of-the-wild": { modifies: mod("Avatar of the Wild", { action: "half" }), spell: { schools: ["nature", "arcane"] } },
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
    "tranquillity": { grants: grant({ action: "full", cost: cost("mana", 10), heal: "2*tier", area: "Each ally within 30 ft" }) },
    // *On success, every friendly target within 20 feet restores Health equal
    // to your tier at the start of each of their turns for a number of rounds
    // equal to your rank* (D-771). A TICK laid by the card's Apply on each ally,
    // never a heal at the use - which is what the row used to do.
    "wild-growth": { grants: grant({ action: "action", cost: cost("mana", 5), casting: true, tick: { kind: "heal", amount: "tier", rounds: "rank" }, area: "Each ally within 20 ft" }) },
    // Use counters and passives (D-648).
    // *A healing spell of yours costs a Half-Action rather than an action. You
    // may use this a number of times equal to your rank per Short Rest*
    // (D-771): a line on the cast's own dialog, spending a use of this counter.
    // **AND A FULL ACTION HEALING SPELL, AND A HEALING CLASS FEATURE** (D-779; the
    // lead, 2026-10-03, on O-168: *"Yes to both."*): a Full Action healing spell at a
    // Half-Action, and Regrowth or Mass Mend through the feature's own dialog.
    "natures-swiftness": { grants: counter("rank", "short"), castAs: { action: "half", from: ["action", "full"], healing: true, features: true } },
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
    "lunar-guidance": { damage: damage(["arcane", "nature"], "spell", { when: "damagedTarget" }) },
    // *While in a Shapeshift form, your attacks add 1 damage per rank against
    // a target you are flanking.* The form is the actor's Shapeshift shape
    // (`AzerothActor#inShapeshiftForm`, D-769); flanking is the table's call
    // and is never auto-checked (D2 §12).
    "feral-instinct": { damage: damage(["all"], "attack", { when: "flanking", form: true }) },
    // *Your Moonfire deals 1 further damage per rank. At rank 2 it cannot be ended
    // by Dispel or similar effects.* The row named only the first sentence (O-157):
    // at rank 2 the effect Moonfire's card lays carries the mark, and 02's Dispel
    // lists it greyed in the talent's name (D-778, `undispellableFor`).
    // **AND ITS TICK** (D-779; the lead, 2026-10-03, on O-170: *"Yes."* to *does
    // the rank add to the tick as well?*): the rank rides Moonfire's hit and the
    // number its tick lands each turn, stamped at the cast (`tickBonusFor`).
    "improved-moonfire": { spell: { names: ["Moonfire"], damage: 1 }, tick: { spells: ["Moonfire"], add: "rank" }, undispellable: { spells: ["Moonfire"], minRank: 2 } }
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
export function damageRowsFor(talents = [], { lane = "attack", type = "physical", alsoSpell = false } = {}) {
  const out = [];
  for (const { talent, entry } of takenRows(talents)) {
    const d = entry.damage;
    if (!d) continue;
    // A bound creature's own bonus never reaches the owner's roll (D-643), and
    // an `until` row is switched on by using the feature, not by rolling.
    if (d.via || d.until) continue;
    // **A WEAPON BLOW THAT COUNTS AS A SPELL'S** (04's Elemental Blademaster; the
    // lead, 2026-10-03, on O-190; D-779): `alsoSpell` lets a spell row reach the
    // attack lane where the door found the blow magical.
    if (!laneMatches(d.applies, lane) && !(alsoSpell === true && laneMatches(d.applies, "spell"))) continue;
    if (!typeMatches(d.types, type)) continue;
    const rank = Number(talent.taken) || 1;
    out.push({
      identifier: talent.identifier,
      name: talent.name,
      rank,
      amount: evaluateAmount(String(d.amount ?? "rank"), { rank }) ?? rank,
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
  for (const row of rows) {
    if (row.form && facts.form !== true) continue;
    const readable = row.when === null || DAMAGE_FACTS[row.when] === true;
    out.push({
      id: `talent-damage-${row.identifier}`,
      identifier: row.identifier,
      name: row.name,
      amount: row.amount,
      when: row.when,
      // The words are `lang/en.json`'s; this module is pure and names the key.
      label: `AZEROTH.Dialog.DamageWhen.${row.when ?? "always"}`,
      checked: row.when === null ? true : (readable && facts[row.when] === true)
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
  },
  // *Your Fortitude rises by 2 per rank*, *your Defense rises by 1 per rank*.
  risesBy: {
    re: /\b(?:rises?|increases?)\s+by\s+(?:\d+|a third|half)\b/i,
    // And a weapon's maximum Range (Longshot) and Defense after a walk (Fleet
    // Footed; D-773).
    covers: e => Boolean(e.passive || e.damage || e.aura || e.range || e.moved || e.firstAttack) || modifiesOf(e).some(m => Object.keys(m).length > 1)
      // And D-779's: Armor Points a turn without a move lays (Bracing).
      || Boolean(e.bracing)
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
      || e.bracing || e.chosenWard)
  },
  // 05's temporary Health (D-777): a grant at the healing door or on a named
  // spell (`tempHealth`), or a Use's own (Last Stand's `onUse.tempHealth`).
  temporaryHealth: {
    re: /\btemporary Health\b/i,
    covers: e => Boolean(e.tempHealth || e.onUse?.tempHealth)
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
  return race ? (RACE_TALENT_EFFECTS[classKey(race)]?.[identifier] ?? null) : null;
}

/** The rows a talent's `modifies` names, always as a list. */
function modifiesOf(entry) {
  if (!entry?.modifies) return [];
  return Array.isArray(entry.modifies) ? entry.modifies : [entry.modifies];
}

/** Only the talents taken, with their rows. */
function takenRows(talents = []) {
  return talents
    .filter(t => (Number(t?.taken) || 0) > 0)
    .map(t => ({ talent: t, entry: talentEffect(t.className, t.identifier, t.race) }))
    .filter(r => r.entry);
}

/**
 * The features the talents taken grant (D-642): a descriptor each, named
 * for the talent, carrying its text, its rank and where it came from.
 * @param {Array<{identifier, className, branch?, name, effect?, taken}>} talents
 */
export function grantsFor(talents = []) {
  return takenRows(talents)
    .filter(({ entry }) => entry.grants)
    // **A GRANT A RANK REACHES** (04's Improved Blink: *At rank 2 it costs no
    // Mana once per Short Rest*; D-775): the counter is granted from that rank,
    // and below it there is nothing to count.
    .filter(({ talent, entry }) => (Number(talent.taken) || 1) >= (Number(entry.grants.minRank) || 1))
    .map(({ talent, entry }) => {
      const rank = Number(talent.taken) || 1;
      const { minRank: _minRank, ...grants } = entry.grants;
      // A condition the card offers from a rank (04's Pyroblast: *At rank 2 a
      // Casting Test at SL 3 or better also applies Stun*; D-775): dropped below
      // it, its `sl` kept for the Use.
      if (Array.isArray(grants.inflicts)) {
        grants.inflicts = grants.inflicts
          .filter(i => rank >= (Number(i?.minRank) || 1))
          .map(({ minRank: _r, ...i }) => i);
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
    if (c.uses) d.uses = { max: own(c.uses.max) ?? d.uses?.max ?? 1, per: c.uses.per ?? d.uses?.per ?? null };
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
export function spellDamageFor(talents = [], { name = "", school = null } = {}) {
  return takenRows(talents)
    .filter(({ entry }) => Number(entry.spell?.damage) > 0)
    .filter(({ entry }) => (entry.spell.names ?? []).includes(name) || (school && (entry.spell.schools ?? []).includes(school)))
    .map(({ talent, entry }) => {
      const rank = Math.max(1, Math.trunc(Number(talent.taken) || 0));
      return { name: talent.name, rank, amount: rank * Number(entry.spell.damage) };
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
    let feet = Math.max(0, Math.trunc(Number(row.widen) || 0));
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

/** The spells the talents taken know ("You know Dispersion"), by name, with the talent. */
export function spellGrantsFor(talents = []) {
  return takenRows(talents)
    .filter(({ entry }) => entry.spell?.learn)
    .flatMap(({ talent, entry }) => (entry.spell.names ?? []).map(name => ({ talent, name })));
}

/**
 * The owner-side effects the talents taken lay on the character (D-648),
 * gated by what the sync can see: a Shapeshift form worn, a shield
 * equipped. Each is v14's changes with the rank evaluated in, in the final
 * phase so a derived number takes them.
 * @param {Array<{identifier, className, name, taken, img?}>} talents
 * @param {{form?: boolean, shield?: boolean}} [state]
 */
export function passivesFor(talents = [], { form = false, shield = false, totem = false } = {}) {
  const out = [];
  for (const { talent, entry } of takenRows(talents)) {
    const p = entry.passive;
    if (!p) continue;
    if (p.when === "form" && !form) continue;
    if (p.when === "shield" && !shield) continue;
    // *While a totem of yours stands* (04's Earthen Shield, D-774): a totem
    // bound to the character (D-643).
    if (p.when === "totem" && !totem) continue;
    const rank = Number(talent.taken) || 1;
    const changes = p.changes.map(c => ({
      key: c.key, type: c.type ?? "add", phase: "final",
      value: String(typeof c.value === "number" ? c.value : (evaluateAmount(String(c.value), { rank }) ?? 0))
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
export function talentAurasFor(talents = []) {
  const out = [];
  for (const { talent, entry } of takenRows(talents)) {
    if (!entry.aura) continue;
    const rank = Number(talent.taken) || 1;
    const amount = v => (typeof v === "string" ? (evaluateAmount(v, { rank }) ?? 0) : v);
    out.push({ talent, identifier: talent.identifier, name: talent.name, rank, aura: auraStamp(entry.aura, { amount }) });
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
export function tickBonusFor(talents = [], { name = "" } = {}) {
  let amount = 0;
  const by = [];
  for (const { talent, entry } of takenRows(talents)) {
    const t = entry.tick;
    if (!t || !(t.spells ?? []).includes(name)) continue;
    const n = atRankAmount(t.add, rankOfTaken(talent));
    if (n <= 0) continue;
    amount += n;
    by.push({ name: talent.name, amount: n });
  }
  return { amount, by };
}

/** What a `nextSpell` row is laid on (D-771). */
export const NEXT_SPELL_ON = Object.freeze(["casting", "swiftLeave"]);

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
export function nextSpellGrants(talents = [], { on = "", sl = null } = {}) {
  const out = [];
  for (const { talent, entry } of takenRows(talents)) {
    const n = entry.nextSpell;
    if (!n || n.on !== on) continue;
    if (n.sl !== null && n.sl !== undefined && !((Number(sl) || 0) >= Number(n.sl))) continue;
    // **A NEXT SPELL CAST AT A LOWER RUNG** (04's Backdraft: *your next spell costs
    // a Half-Action rather than an action*; D-775): no Mana, and the rung it
    // promises; the door asks the talent's counter for a use before laying it.
    const cast = n.cast === "half" ? "half" : null;
    const amount = cast && n.amount === undefined ? 0 : atRankAmount(n.amount, rankOfTaken(talent));
    if (amount <= 0 && !cast) continue;
    out.push({ source: talent.identifier, name: talent.name, amount, turn: n.turn === true, ...(cast ? { cast, talentId: talent.id ?? null } : {}), ...(n.features === true ? { features: true } : {}) });
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
export function momentumOnHitFor(talents = [], { sl = 0, form = false, onTurn = true, used = [], facts = {} } = {}) {
  const byPool = {};
  const fired = [];
  for (const { talent, entry } of takenRows(talents)) {
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
    // roll and handed in; an unmeasured one never holds.
    if (m.when && facts?.[m.when] !== true) continue;
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
export function alternateFor(talents = []) {
  for (const { talent, entry } of takenRows(talents)) {
    const a = entry.alternate;
    if (!Array.isArray(a?.schools) || a.schools.length !== 2) continue;
    return { identifier: talent.identifier, name: talent.name, schools: [...a.schools], amount: atRankAmount(a.amount, rankOfTaken(talent)) };
  }
  return null;
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
export function wardPierceFor(talents = [], { school = null, standing = [] } = {}) {
  let amount = 0;
  const by = [];
  if (!school) return { amount, by };
  for (const { talent, entry } of takenRows(talents)) {
    const w = entry.spell?.ignoresWard;
    if (!w || !(w.schools ?? []).includes(school)) continue;
    if (w.while && !(standing ?? []).includes(w.while)) continue;
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
export function healBonusFor(talents = [], { via = null, conditioned = false } = {}) {
  let amount = 0;
  const by = [];
  if (!HEAL_VIA.includes(via)) return { amount, by };
  for (const { talent, entry } of takenRows(talents)) {
    const h = entry.heal;
    if (!h || !(h.via ?? []).includes(via)) continue;
    if (h.when === "conditioned" && conditioned !== true) continue;
    const n = atRankAmount(h.add, rankOfTaken(talent));
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
export function castAsFor(talents = [], { action = null, healing = false, name = "", school = null, feature = false } = {}) {
  for (const { talent, entry } of takenRows(talents)) {
    const c = entry.castAs;
    const from = Array.isArray(c?.from) ? c.from : [c?.from];
    if (!c?.action || !from.includes(action)) continue;
    if (feature === true && c.features !== true) continue;
    if (c.healing === true && healing !== true) continue;
    if (Array.isArray(c.spells) && !c.spells.includes(name)) continue;
    if (Array.isArray(c.schools) && !c.schools.includes(school)) continue;
    const rank = rankOfTaken(talent);
    const perRound = c.perRound !== undefined ? Math.max(1, atRankAmount(c.perRound, rank)) : null;
    // A rank's Ward pierce on the cast it makes cheaper (04's Fire Blast at rank 2:
    // *it also ignores 2 Ward*; D-775), where a clause carries one.
    const pierce = (c.atRank ?? []).filter(cl => rank >= (Number(cl?.rank) || Infinity)).reduce((n, cl) => n + Math.max(0, Math.trunc(Number(cl.pierce)) || 0), 0);
    return { identifier: talent.identifier, name: talent.name, talentId: talent.id ?? null, action: c.action, perRound, ...(pierce > 0 ? { pierce } : {}) };
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
