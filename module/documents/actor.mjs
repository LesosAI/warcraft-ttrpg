/**
 * AzerothActor.
 *
 * THE ONE THING THAT MUST NOT BE FORGOTTEN HERE:
 *
 *   `Actor#prepareBaseData()` clears `_completedActiveEffectPhases`
 *   (client/documents/actor.mjs:465 at build 14.366). An override that does not
 *   call `super.prepareBaseData()` throws
 *
 *       "ActiveEffect application phase 'initial' has already completed
 *        and cannot be run again"
 *
 *   on the SECOND data preparation, not the first. It looks fine when you write
 *   it and breaks the moment anything updates the actor.
 *
 * V14 applies effects in two phases: `initial` during
 * `prepareEmbeddedDocuments()` and `final` during `prepareData()` after derived
 * data. Anything a later derivation depends on belongs in `initial`; anything
 * that must land after derived data — corruption thresholds, armour-point
 * stacking — belongs in `final` (D2 §5).
 */

import { healingFactorOf } from "../rules/afflictions.mjs";
// 07 §12's ledger of damage taken (D-867).
import { LEDGER_FLAG, appendLedger, ledgerStamp } from "../rules/recent-damage.mjs";
import { BLED_AT_FLAG, attackLessOn, burdenFires, weaponLessOn } from "../rules/sovereign-spells.mjs";
// 07 §12's Dilation (D-866): half a blow put off to the start of the next turn.
import { DEFERRED_FLAG, appendDeferred, deferralOf, splitDeferred } from "../rules/deferred-damage.mjs";
// 04's Stasis Lore and Halt the Sands: a spell bought with Sand (D-869).
// The Chronomancer's dialog lines, its hold and its readers (stage 2b).
import { echoingSandsLine, gritLines, recallCounts, RECALL_FLAG, stormLines } from "../rules/chronomancer.mjs";
import { sharedHours, suspendedNow, witheringHalves } from "../effects/chronomancer.mjs";
import { sandCastLines } from "../rules/sand-casts.mjs";
import { addClassEntry, hostileExposures, poolsFor, removeClassEntry, resyncsFeatures, secondaryLevel, secondaryTier, setCharacterLevel } from "../rules/progression.mjs";
import { hasCauseInsanity } from "../rules/cause-insanity.mjs";
import { racialTalentIcon } from "../rules/icons.mjs";
import { hasReaverEnrage } from "../rules/reaver-enrage.mjs";
import { hasGhoulEnrage } from "../rules/ghoul-enrage.mjs";
import { hasPredatoryEnrage } from "../rules/predatory-enrage.mjs";
import { evaluateAmount, featurePatchesFor, featureRungs, featureTickStamp, featuresFor, raceTraitFor, refreshes, usesMaxFor } from "../rules/class-features.mjs";
// Whom an area Use reaches (the B6 fix; the lead: *"Measure the area"*).
import { cleanWho } from "../rules/area-gather.mjs";
import { grantsFor, healBonusFor, healingPatchesFor, passivesFor, patchFeature, patchesFor, spellGrantsFor, talentEffect, talentEffectDiff, wardPierceFor } from "../rules/talent-effects.mjs";
// 02's healing features that name one target, which Divine Providence's chip reaches (D-778).
import { HEALS_ONE_TARGET } from "../rules/class-talents.mjs";
// What the next spell was promised (04's Nature's Grace, Predator's Swiftness;
// D-771), and a heal shared between two partners (04's Symbiosis).
import { NEXT_SPELL_FLAG, castCapRefusal, castingReach, grantingClass, pendingNextSpell, spellPayment } from "../rules/casting.mjs";
import { endSymbiosis, shareHealing } from "../effects/symbiosis.mjs";
// The Warrior's and the Paladin's kinds (D-772): what the next attack was
// promised, Wounded Beast's price, Light's Reserve, a heal Mortal Strike blocks,
// Beacon's share, and the schools named at a Long Rest.
import { NEXT_ATTACK_FLAG, pendingNextAttack } from "../rules/next-attack.mjs";
import { BEACON_FLAG, DEATH_MARK_FLAG, PLATE_FLAG, openingFor, restBonusFor, woundedBeastTaken } from "../rules/class-talents.mjs";
// What a counter or a charge buys on a roll's own dialog (D-774).
import { CHARGE_FLAG, spellPoolFor, talentLinesFor } from "../rules/class-talents.mjs";
import { FREE_CAST_FLAG, freeCastLines, freeCastRefills } from "../rules/free-casts.mjs";
import { untilEndOfNextTurnOrRound, untilNextTurnOrRound } from "../effects/durations.mjs";
import { askStabilizer } from "../effects/gadget-reactions.mjs";
import { carrierChangesApplied, conditionEffectOf, conditionStatusesHeld, toggleOffTargets } from "../rules/condition-carriers.mjs";
// D-779: the lead's class answers - Shared Quarry's payer, Undying Rage's hold,
// Divine Aegis's Ward and Miracle's heal at the one healing door.
import { companionSpendsFor, undyingRageFor } from "../rules/class-talents.mjs";
import { DEVOURING_PLAGUE, DIVINE_AEGIS, UNDYING_RAGE, aegisChanges, momentumPayer, restoredToFull, undyingRageHold } from "../rules/class-answers.mjs";
import { maneuverPoolOf, maneuverPurse } from "../rules/maneuver-pool.mjs";
// The school 02's Scales of the Flight names where a tie leaves it open (stage 2B).
import { FLIGHT_SCHOOL_FLAG } from "../rules/chromatic-features.mjs";
// The Mage's and the Warlock's (D-775): Cauterize's catch at the damage door,
// Ruin's two dice on a spell's Critical Injury, and the Long Rest's release of a
// demon Command Demon bound and its lifting of Demonic Sacrifice's lock.
import { SACRIFICED_FLAG, cauterizeFor, cauterizes } from "../rules/class-talents.mjs";
// A Ward pierce gated on the target (04's Pyromaniac and Lunar Guidance; the class talent audit, D-1890, D-1892).
import { igniteBurning } from "../rules/class-talents.mjs";
import { LUNAR_DAMAGE_FLAG, lunarDamageQualifies } from "../rules/lunar-guidance.mjs";
// What holds a target under a Rogue's Opening (04's Overkill and Subterfuge; D-773).
import { openingEntries } from "../effects/talent-states.mjs";
import { healingAfterBlock } from "../rules/no-healing.mjs";
import { shareBeacon } from "../effects/beacon.mjs";
// What a talent spends as part of an attack (D-770): the law the dialog's lines
// and the roll's payment both read through `riderLines`.
import { riderDiscountsOf, ridersFor } from "../rules/riders.mjs";
import { FEEDS_ON_BLOWS_MARK, PRESENCE_ENDS_AT_ZERO, UNHOLY_PRESENCE, featureRiders, featureSpellGrants, holdsPresence, maneuverPriceOf, presenceOf } from "../rules/death-knight.mjs";
// The Chromatic Champion's branch talents (stage 3A): Void Corruption as a pool a rider
// pays from, and its write.
import { branchSpellOf, fallHarmless, lifebinderFor, riderWritesSplit, splitOffered, voidPool, voidSpendFor, weightOfAgesBars, weightOfAgesFor } from "../rules/chromatic-talents.mjs";
import { boundOf, releaseAll, releaseAtLongRest, syncBoundFor } from "./bound.mjs";
// A people's faction, for a `faction` gate (02 §1; D-911).
import { factionsFor } from "../rules/factions.mjs";
// 08 §20's Legendary readers at the damage door, and 08 §5's trait Corruption (D-911).
import { ADAPTIVE_WARD_FLAG, ENDS_ON_DAMAGE_FLAG, SIGNATURE_SHIELD_FLAG, adaptiveWardFor, attackerBanesFrom, breathSource, breathTaken, gateHolds, hitThisTurn, pressTrigger, resistBanesForCast, killTemporaryHealth, pressEntryRefusal, pressedWeaponBonus, pressesOf } from "../rules/signatures.mjs";
import { traitExposures } from "../rules/trait-corruption.mjs";
import { chainLightningLiving } from "../rules/chain-lightning.mjs";

/**
 * What 08 §5's Corruption traits on a CHARACTER's equipped weapons charge on this
 * occasion (D-911): the pure law is `rules/trait-corruption.mjs#traitExposures`,
 * this only reads the sheet. A creature's attack rows carry their own traits and
 * are read by the bond's Long Rest, never here.
 */
function traitExposuresOn(actor, occasion) {
  if (actor?.type !== "character") return [];
  // What is WIELDED (`readyWeapons`, D-769): a blade melded into a shape is in nobody's hand.
  const weapons = (actor.readyWeapons?.() ?? []).map(i => ({ name: i.name, traits: i.system?.traits ?? [] }));
  return traitExposures(weapons, occasion, { tier: actor.system?.tier ?? 1, living: livingActor(actor) });
}

/** Whether a creature lives, 07's Chain Lightning's own reading (D-911). */
function livingActor(actor) {
  return chainLightningLiving({
    creatureType: actor?.system?.creatureType ?? null,
    race: actor?.raceItem?.system?.identifier ?? actor?.raceItem?.name ?? actor?.system?.race ?? null,
    statuses: [...(actor?.statuses ?? [])]
  });
}
// The Legacy branches' B2: the tinker's constructs and gadgets, the gnome's two talents.
import { constructsFor, isWrecked } from "../rules/constructs.mjs";
// 08 §4's Identify Test comes back with a Long Rest (D-1435).
import { IDENTIFY_SCOPE, TRIED_FLAG, UNIDENTIFIED_FLAG, isUnidentified, knownBatch, triedThisRest } from "../rules/identify.mjs";
import { cardName, shownName, unidentifiedSource } from "../helpers/identify-words.mjs";
import { BLUEPRINT_FLAG, GADGETS_SPENT_FLAG, OVERCLOCK_ENDS, OVERCLOCK_FLAG, cleanBlueprint, gadgetByKey, gadgetFeature, gadgetSpentSwap, gadgetsKnownFor, knownGadgets } from "../rules/gadgets.mjs";
import { GADGET_TWICE_FLAG, gadgetTwiceKey } from "../rules/gadgets.mjs";
// THE LEGACY BRANCHES' DOORS (B1): one fact-builder for a row's gate (doors 15, 17,
// 18), the ability scope (door 16), and the Watch cleared at a Long Rest (door 18).
import { wieldFacts } from "../rules/wield.mjs";
import { WATCH_FLAG, marksFrom } from "../rules/marks.mjs";
import { targetFactsOf } from "../rules/talent-gates.mjs";
import { abilityScope } from "../rules/expressions.mjs";
import { refillAfter, usesAfterRestamp, usesStamp } from "../rules/uses.mjs";
// A Legacy branch embeds only with its people (04 §1; D-781, door 1).
import { legacyResync, owedTalents } from "../rules/legacy-branches.mjs";
import { fatigueState } from "../rules/fatigue.mjs";
import { gainOnHurt, gainWhenStruck, unkillableFloor } from "../rules/momentum.mjs";
// What a blow does beyond its target, run from the one damage door (D-768).
import { afterBlow, strikeAround } from "../effects/after-blow.mjs";
import * as mindControlHarm from "../effects/mind-control-harm.mjs";
// What a blow on a creature carrying a priest's Ward does for the priest (04's
// Atonement and Absorption; D-774).
import { afterWardedBlow } from "../effects/wards.mjs";
// A shield in hand: Shield of Faith's gate and the doors that re-sync it (D-768).
import { isEquippedShield } from "../rules/armor.mjs";
// What a mark leaves of a blow (06 §6's Parry and Block, 08 §20's halving).
import { markAnswers, mitigatedDamage } from "../rules/reactions.mjs";
// 05's temporary Health (D-777): the law, and what a heal grants beside its Health.
import {
  TEMP_FLAG, absorbDamage, cleanTempRecord, grantTemporary, overflowTemporary, temporaryEnds, wholeTemp
} from "../rules/temporary-health.mjs";
import { healTempFor } from "../rules/class-talents.mjs";
import { HOLD_MARK_FLAG, holdRegimeOf, holdRegimeRefusal, wouldDrop } from "../rules/blow-doors.mjs";
import { recordOf, resolveRecord } from "../rules/blow-records.mjs";
import { damageAboveHealthFloor } from "../rules/sealing-flame.mjs";
import {utilityEffectView} from "../rules/utility-draughts.mjs";
// What another creature does to a blow, asked as it lands (D-777): a blow moved,
// a blow divided, a creature held at 1, and 07's Aegis floor.
import { aegisFloor, askToBorrow, askToHold, divideBlow, landShares, redirectBlow } from "../effects/blow-doors.mjs";
// 04's Exquisite Taste and Overflowing Cup at the one healing door (the Sovereign; pure).
import { INSOLENCE_FLAG, healExtra as sovereignHealExtra, insolenceBoons } from "../rules/sovereign-talents.mjs";
// THE LEGACY BRANCHES' B3 (doors 10, 11 and 25): a Death Step held back or spared, the
// third one recorded, 06 §10's offer at the second, Ethereal Form's halving at the one
// damage door, and Life Drain's Health back off what the blow took.
import { askDeathHold, burialSpares } from "../effects/death-holds.mjs";
import { THIRD_STEP_FLAG, deathStepDue, thirdStepAt } from "../rules/death-holds.mjs";
import { OFFER, offerStands } from "../rules/spirit-realm.mjs";
import { damageTransferStages } from "../rules/damage-transfer-stages.mjs";
import { invulnerabilityPotionActive, preventPhysicalDamage } from "../rules/invulnerability-potion.mjs";
import { consumeAttackTransfer } from "../effects/attack-transfer.mjs";
import { dyingNow, etherealOn, realmRefusalFor } from "../effects/spirit-realm.mjs";
import { postPrompt } from "../effects/prompts.mjs";
import { drainHeal } from "../effects/legacy-uses.mjs";
// The ONE ally rule, for a door that holds both actors (D-755, D-777).
import { allyOf } from "../canvas/engaged.mjs";
import { restCard } from "../dice/rest-card.mjs";
import { burnTether, longRest, shortRest, turnRefill } from "../rules/rest.mjs";
// A San'layn's rest (02 §5; D-1141 to D-1144): the blood it needs, judged before anything is spent.
import { BLOOD_SINCE_REST_FLAG, bloodNeeded, bloodRestPlan, bloodSinceRestOf, vialDraws, vialUnits } from "../rules/rest.mjs";
import { restoreSpellUses } from "../effects/spell-limits.mjs";
import { restoreApprovedSignatureUses } from "../effects/approved-signature-use.mjs";
// What a Short Rest eats and drinks (05 SS16, 08 SS12; D-733).
import { DRINK_KINDS, FOOD_KINDS, foodTier, isProvision, restPicks, restSpends } from "../rules/provisions.mjs";
import {prostheticEffectView} from "../rules/prosthetics.mjs";
import { spendOne } from "../rules/consumables.mjs";

import { AZEROTH } from "../config.mjs";
import { projectionPhaseFor } from "../rules/image-projection.mjs";
import { refuseIceBlockTarget } from "../effects/ice-block-protection.mjs";
import { refuseDispersion } from "../effects/dispersion-protection.mjs";
import { offerElunesRegard } from "../effects/elunes-regard.mjs";
import { dispersionFor, dispersionSuppressesEquipmentEffect } from "../rules/dispersion.mjs";
import { healingReceived } from "../rules/corruption-effects.mjs";
import { DAMAGE_BY_OPTION, dealerRecord } from "../rules/death-watch.mjs";
import { heldAugment } from "../rules/augments.mjs";
import { emptySandUpdates } from "../rules/sand.mjs";
// The Death Knight (D-943, D-946): the one healing judgement, and the runes' Long Rest refill.
import { HEALING_REFUSAL_WORDS, healGiver, healingRefusal } from "../rules/undead.mjs";
// 07 §17's soul marks and 07 §14's Curse of Weakness (run 4c-S).
import { SOUL_MARK_FLAG, curseOn, soulMarkRefusal } from "../rules/necromancer-spells.mjs";
import { creatureSnapshot, kindsOf } from "../rules/creature-kinds.mjs";
import { refillRunesAtLongRest } from "./runes.mjs";
// The Sovereign's hot-path doors, asked before their modules load (O-419; `rules/sovereign-scope.mjs`).
import { blowCutCanReach, burdenCanReach, harmEndsCanReach, majestyCanReach, mirrorCanReach, preyMarksOf, unfadingCanReach } from "../rules/sovereign-scope.mjs";
import { RUNES, RUNIC_POWER } from "../rules/runes.mjs";
// The ONE named-gain refusal (Runic Power, Essence, Tribute, Vitae; the San'layn and Sovereign plan's C3).
import { gainSourceFor, isNamedGainPool, namedGainRefusal, namedGainWords } from "../rules/named-gains.mjs";
// The Sovereign's doors (02 §7): the Vitae payment, the feeding and the prey (`effects/sovereign-core.mjs`).
import { feedOn as sovereignFeedOn, isPrey as sovereignIsPrey, loseHealthForVitae, markPrey as sovereignMarkPrey, payVitae as sovereignPayVitae, preyOf } from "../effects/sovereign-core.mjs";
// The Necromancer's Essence (the plan's Phase 3): the doors a rise comes through, and that it
// never pays a maneuver.
import { ESSENCE, paysByKind, restExposure } from "../rules/essence.mjs";
// The Demon Hunter's Hatred (the Demon Hunter plan): a write never trims it to a fallen cap, and a
// rest turns what is held into Fel Corruption.
import { HATRED, featureFel, hatredAtRest, hatredWrite, keepsAboveCap, restModifiersOf } from "../rules/hatred.mjs";
// The one Energy pool two classes share (02 §10, D-1723): found by any member, written on the holder, mirrored.
import { poolHeldBy } from "../rules/pools.mjs";
import { mirrorMembers, sharedPoolValue } from "../rules/energy-merge.mjs";
// The Demon Hunter's features (the Demon Hunter plan's Phase 4a): the two riders, Fel Surge's lines, the shape's
// Energy refill and its no-gain rule.
import { FEL_SURGE_FEATURE, QUIET_THE_WHISPERS, demonHunterRiders, felSurgeLines, freeFelLash, unleashedGainRefusal, unleashedRefillExtra } from "../rules/demon-hunter-features.mjs";
// The class talent audit's martial law (class agent A, D-1870 to D-1879): the Ranger's riding features.
import { rangerRiders } from "../rules/audit-martial.mjs";
// 04's Demon's Due (the Demon Hunter plan's Phase 5): who makes a Fel Lash free.
import { DEMONS_DUE, felLashFreeBy } from "../rules/demon-hunter-talents.mjs";
import { castDealsDamage } from "../rules/area-ticks.mjs";
import { empowerLines, fleshOfferingLines, skeletalMasteryLines } from "../rules/necromancer-lines.mjs";
import { hordeLeadLines } from "../rules/necromancer-features.mjs";
import { HORDE_LEAD_FLAG, leadFor } from "../rules/horde.mjs";
import { learnDoor, spellFromHonoured, spellLearnRefusal } from "../rules/spell-access.mjs";
import { poolWrite } from "./pool-writes.mjs";
import { displacedBy } from "../rules/worn.mjs";
// What a character's token looks like before anybody touches it (D-718's
// neighbour; the lead, 2026-09-13).
import { characterTokenPatch } from "../rules/tokens.mjs";
// A character's directory portrait follows its token art until one is chosen (D-797).
import { mirroredImg } from "../rules/token-art.mjs";
import { grantsOn } from "../rules/grants.mjs";
// A shape is one Active Effect, read here and written by `./shapes.mjs` alone
// (D-769): the physical half, what melds, and what ends it.
import { AVATAR, SHAPE_FLAG, isForcedKind, meldsGear, naturalWeapon, readShape, shapePhysical } from "../rules/shapes.mjs";
import { endShapeAt, endShapeOnDamage, refuseForcedShape } from "./shapes.mjs";
// THE PROFESSION (D-1903 to D-1930): one at a time, its cheap skills, its tool, and Well Fed.
import {
  PROFESSION_OWED_FLAG, carriedTool, professionSkills as professionSkillSet, professionSwap, professionTier as professionTierAt
} from "../rules/professions.mjs";
import { skillFromKnown } from "../rules/creation.mjs";
import { endsAtRest } from "../rules/rest-ends.mjs";
import { layWellFed } from "../effects/well-fed.mjs";
// What a rest's meal leaves behind: a cooked food's Well Fed, or a shared Feast's (08 §12; the review's M8).
import { restWellFed } from "../rules/well-fed.mjs";
// A glaive Flame Crash threw (07 §15; D-1549): equipped, and out of the hand until it is back.
import { glaiveAway } from "../rules/demon-hunter-spells.mjs";
// 14's Hex the Loudest (D-809): a creature that cannot attack.
import { refuseCannotAttack } from "../effects/boss-doors.mjs";
// What a feature lays on every ally in reach, stamped whole (D-755), and the
// Boons an ally's aura has laid on this creature, named for a card.
import { auraBoonsOn, auraStamp, halvedHealing } from "../rules/auras.mjs";
// The choice a SKIPPED roll dialog makes: every automatic line counted, nothing
// the table judges (D-601). A Long Rest's exposure opens no dialog, so it rolls
// exactly that (D-755's review).
import { defaultChoice } from "../applications/roll-dialog.mjs";
// The Sovereign's Claws: kept by Blood-Forged Claws, read as plain facts (02 §7, 04's Ravenous;
// the San'layn and Sovereign plan, C1 and C16; D-1164, D-1166).
import { CLAWS_FEATURE, CLAWS_SYNC, clawFactsFrom, clawsCreateData, clawsDue } from "../rules/claws.mjs";
import { CLAWS_ID, isClaws as isClawsItem } from "../rules/unarmed.mjs";
import { CLAW_USES_FLAG } from "../rules/initiative.mjs";

/** What the talent grant reads off the pack's index: the class, the people, and a racial talent's race. */
const TALENT_INDEX_FIELDS = Object.freeze(["system.className", "system.identifier", "system.legacy", "system.race"]);

/**
 * Embed a class's talents from the pack: every talent whose `className` is
 * the class item's name, skipping any the actor already holds by identifier
 * (a fixture or a GM may have added some by hand). One create call per
 * grant, so the sheet re-renders once.
 *
 * **A LEGACY'S TWELVE COME ONLY WITH ITS PEOPLE** (04 §1, D-781): a Blademaster
 * talent is a Warrior's, embedded on an orc Warrior and on no other, through
 * `rules/legacy-branches.mjs#owedTalents`. `people` is the race the character
 * holds as the class lands - handed in, because a race arriving in the same
 * batch as a stale one leaves two race items on the actor until the old one's
 * delete lands.
 *
 * @param {Actor} actor
 * @param {Item[]} classItems  The class items just created on the actor.
 * @param {{people?: string|null}} [o]  the race the character holds, by name
 */
async function grantClassTalents(actor, classItems, { people = actor.raceItem?.name ?? null } = {}) {
  const pack = game.packs.get("azeroth-rpg.talents");
  if (!pack || !classItems.length) return;
  const names = [...new Set(classItems.map(c => c.name))];
  const index = await pack.getIndex({ fields: [...TALENT_INDEX_FIELDS] });
  const held = new Set(actor.items.filter(i => i.type === "talent").map(i => i.system?.identifier));
  const wanted = owedTalents(index, { classNames: names, people }).filter(e => !held.has(e.system?.identifier));
  if (!wanted.length) return;
  const docs = await Promise.all(wanted.map(e => pack.getDocument(e._id)));
  // The actor may have been deleted while the pack was read (a test's
  // teardown, a GM's change of mind); creating on it then is refused by the
  // server, and the delete can land between this check and that refusal, so
  // the refusal is caught as well rather than left as an unhandled rejection.
  const gone = () => (actor.isToken ? !actor.token?.parent : !game.actors.has(actor.id));
  if (gone()) return;
  try {
    await actor.createEmbeddedDocuments("Item", docs.filter(Boolean).map(d => d.toObject()));
  } catch (err) {
    if (!gone()) throw err;
  }
}

/**
 * Embed a race's eight talents (02 SS2, D-620), built from the rows on the
 * race item rather than a pack: `race` names the race, `className` is empty,
 * and the class tree and the talent points leave them alone. Any the actor
 * already holds by identifier are skipped.
 *
 * @param {Actor} actor
 * @param {Item} race  The race item just created on the actor.
 */
async function grantRaceTalents(actor, race) {
  const rows = race?.system?.talents ?? [];
  if (!rows.length) return;
  const held = new Set(actor.items.filter(i => i.type === "talent").map(i => i.system?.identifier));
  const docs = rows
    .filter(t => t?.name && !held.has(t.name.slugify()))
    .map(t => ({
      name: t.name,
      type: "talent",
      img: racialTalentIcon(race.name, t.name, race.img),
      system: {
        identifier: t.name.slugify(),
        description: t.description ?? "",
        effect: t.description ?? "",
        source: { document: "02-CHARACTER-OPTIONS", section: race.name },
        className: "",
        race: race.name,
        branch: "",
        tier: t.tier ?? 1,
        ranks: 1,
        taken: 0,
        requires: null,
        uses: usesStamp(t.description ?? "", { arc: true })
      }
    }));
  if (!docs.length) return;
  const gone = () => (actor.isToken ? !actor.token?.parent : !game.actors.has(actor.id));
  if (gone()) return;
  try {
    await actor.createEmbeddedDocuments("Item", docs);
  } catch (err) {
    if (!gone()) throw err;
  }
}

/**
 * **THE LEGACY BRANCHES A CHARACTER'S PEOPLE KEEPS, AND NO OTHER** (04 §1, D-781):
 * the resync a race's arrival, change and departure make. The new people's
 * branch on every class held is embedded untaken; another people's is withdrawn
 * whole, taken ranks and all, and the points spent in it come back with it,
 * because spent points are read off the talents held (`rules/legacy-branches.mjs`
 * says why that is not D-713's refund). What a withdrawn talent granted leaves
 * through the feature sync, run after.
 *
 * `people` is handed in by the race's arrival (two race items stand together
 * until a stale one's delete lands); the departure reads the race left.
 *
 * @param {Actor} actor
 * @param {{people?: string|null}} [o]
 * @returns {Promise<{embedded: number, withdrawn: number}>}
 */
async function syncLegacyTalents(actor, { people = actor.raceItem?.name ?? null } = {}) {
  const none = { embedded: 0, withdrawn: 0 };
  if (actor.type !== "character") return none;
  const pack = game.packs.get("azeroth-rpg.talents");
  if (!pack) return none;
  const gone = () => (actor.isToken ? !actor.token?.parent : !game.actors.has(actor.id));
  if (gone()) return none;
  // Every class item the actor holds: `_preCreate` refuses a third, so these are
  // the classes, linked or about to be.
  const classNames = [...new Set(actor.items.filter(i => i.type === "class").map(i => i.name))];
  const held = actor.items
    .filter(i => i.type === "talent" && !i.system?.race)
    .map(i => ({ id: i.id, className: i.system?.className ?? "", identifier: i.system?.identifier ?? "", legacy: i.system?.legacy ?? "" }));
  const index = await pack.getIndex({ fields: [...TALENT_INDEX_FIELDS] });
  const { embed, withdraw } = legacyResync({ held, index, classNames, people });
  if (!embed.length && !withdraw.length) return none;
  try {
    // Only what is still there: a class leaving at the same moment takes its
    // own talents with it (`_onDeleteDescendantDocuments`).
    const still = withdraw.filter(id => actor.items.has(id));
    if (still.length) await actor.deleteEmbeddedDocuments("Item", still);
    if (embed.length) {
      const docs = await Promise.all(embed.map(e => pack.getDocument(e._id)));
      if (!gone()) await actor.createEmbeddedDocuments("Item", docs.filter(Boolean).map(d => d.toObject()));
    }
    if (withdraw.length && !gone()) await actor.syncClassFeatures?.();
  } catch (err) {
    if (!gone()) throw err;
  }
  return { embedded: embed.length, withdrawn: withdraw.length };
}

/**
 * **A HEALING FEATURE'S STAMP WITH THE `healing` ROWS LAID ON IT** (the lead,
 * 2026-10-03, on O-160: *"Yes."* to *does "your healing features" count a healing
 * feature the character holds from a second class?*; D-778): Devotion's and Holy
 * Guidance's `heal.add` on every feature that restores Health, Divine Providence's
 * chip on every one that names one target - after the feature's own class's
 * patches, so a heal a patch GAVE it (Dreamstate on Dreamwalk) is one too - and the
 * talents' names added to the chips the feature already wears.
 *
 * @param {object} descriptor  the patched descriptor
 * @param {Array} taken  the talents taken, as the sync reads them
 */
function withHealingPatches(descriptor, taken) {
  const healing = healingPatchesFor(taken, descriptor, HEALS_ONE_TARGET);
  if (!healing.length) return descriptor;
  const laid = patchFeature(descriptor, healing, evaluateAmount);
  return { ...laid, modifiedBy: [...(descriptor.modifiedBy ?? []), ...laid.modifiedBy] };
}

/**
 * What the sync stamps on a feature item from its descriptor (D-612): the
 * mechanics the sheet and the workflow read off the item alone. `uses.value`
 * and `known` are the two fields play changes, and the sync keeps them.
 */
function featureStamp(cls, f, { tier = 1, level = 1, int = 0 } = {}) {
  // A talent's grant scales its uses by the rank taken (D-642), and a counter
  // *equal to your tier* by the tier (D-768): the scope used to be the rank
  // alone, so Survival Instincts and Lava Burst read tier 1 at every level. A
  // patched class feature's `"rank"` arrives already bound (`bindRank`).
  const rank = f.rank ?? 1;
  const usesMax = usesMaxFor(f.uses, { rank, tier, level, int });
  return {
    identifier: f.name.slugify(),
    description: f.description,
    source: f.source ?? { document: "02-CHARACTER-OPTIONS", section: cls.name },
    className: cls.name,
    level: f.level,
    kind: f.kind,
    action: f.action ?? null,
    // And when it is paid: on the Test's success, where 02 says so (the B8a2 pass).
    cost: { pool: f.cost?.pool ?? null, amount: f.cost?.amount ?? 0, all: f.cost?.all === true, on: f.cost?.on === "success" ? "success" : null },
    casting: f.casting === true,
    dc: f.dc ?? null,
    // `refill` (D-1868): one use back at each Short Rest, where the descriptor says so.
    uses: { value: usesMax, max: usesMax, per: f.uses?.per ?? null, refill: f.uses?.refill === "short" ? "short" : null },
    heal: f.heal ?? null,
    // The conditions its Use ends on its target by choice (Mercy of Uther on Lay on Hands; D-1875), 0 for none.
    ends: Math.max(0, Math.min(3, Math.trunc(Number(f.ends)) || 0)),
    // And whether a passed Test takes half of it (the lead: *"Build it everywhere"*), or
    // none of it, where the failure is what deals it (02's Shadow Word: Death; the B8a pass).
    damage: { amount: f.damage ? String(f.damage.amount) : null, type: f.damage?.type ?? null, half: f.damage?.half === true, onFail: f.damage?.onFail === true },
    resist: f.resist ?? null,
    // Whom its area reaches (the lead: *"Measure the area"*), and every rung its Use
    // may spend (04's Ethereal Form at rank 2) - the whole shapes, so `same()` holds.
    who: cleanWho(f.who),
    rungs: featureRungs(f.action ?? null, f.rungs),
    // The DC the Resist is made against (the Legacy branches' door 16), or null.
    resistDc: typeof f.resistDc === "string" && f.resistDc ? f.resistDc : null,
    extraAttack: f.extraAttack === true,
    // The shape the Extra Attack needs (02 §7's Druid, D-769), or null.
    extraAttackIn: f.extraAttackIn ?? null,
    // 02 §7's Sprint (D-712): the Moves this turn that cost no Half-Action.
    freeMove: Math.max(0, Math.trunc(Number(f.freeMove ?? 0)) || 0),
    // Draconic Discipline's pool for every universal maneuver (the Chromatic Champion
    // plan), or null for Momentum.
    maneuverPool: typeof f.maneuverPool === "string" && f.maneuverPool ? f.maneuverPool : null,
    // Runic Discipline's price for every maneuver (02 §7, run F2), or null.
    maneuverPrice: Number.isInteger(f.maneuverPrice) && f.maneuverPrice >= 0 ? f.maneuverPrice : null,
    attack: f.attack === true,
    // HOW MANY presses the card's Attack allows (the architect's review of D-773): `each`,
    // an amount in `rank` (04's Rapid Fire, `4*rank`), or null for one. **NEVER STAMPED
    // UNTIL THE LIVE RUN** (B8b): the schema held it and `cardAttackAllowance` read it, so
    // 02's Divine Storm and 04's Whirlwind, Rapid Fire and Bladestorm allowed one press each.
    attacks: typeof f.attacks === "string" && f.attacks.trim() ? f.attacks.trim() : null,
    area: f.area ?? "",
    choice: f.choice ?? null,
    // How many the menu takes in one use (02 §7's Totem Mastery, D-710).
    picks: Math.max(1, Math.trunc(Number(f.picks ?? 1)) || 1),
    gain: { pool: f.gain?.pool ?? null, amount: f.gain?.amount ?? 0 },
    restore: f.restore ?? null,
    note: f.note ?? "",
    // The talents that changed it, the creature it acts on, what it calls (D-642).
    modifiedBy: f.modifiedBy ?? [],
    bound: { kind: f.bound?.kind ?? null, action: f.bound?.action ?? null },
    summons: { entries: f.summons?.entries ?? [], count: f.summons?.count ?? 0, until: f.summons?.until ?? null },
    // The Bane it lays on the target's next Test (06 §6's Pummel, D-693).
    lays: { kind: f.lays?.kind ?? null, banes: f.lays?.banes ?? 0 },
    // What the card's Apply lays at the start of each target's turns (02's
    // Regrowth, 04's Wild Growth; D-771): THE WHOLE SHAPE, initials included,
    // so `same()` never rewrites it at a world load. A talent's grant binds its
    // own rank into the turns here (Wild Growth's *a number of rounds equal to
    // your rank*); a class feature's arrives bound by its patch (Improved
    // Regrowth). The amount keeps `tier` for the Use.
    tick: featureTickStamp(f.tick, rank),
    // The conditions the card offers on each target (02's Hurricane, 04's
    // Typhoon at rank 2; D-771).
    inflicts: (f.inflicts ?? []).filter(i => i?.condition).map(i => ({
      condition: String(i.condition),
      value: Number.isInteger(i.value) && i.value > 0 ? i.value : null,
      until: typeof i.until === "string" && i.until ? i.until : null,
      // The SL the Casting Test must reach for the card to offer it (04's
      // Pyroblast at rank 2: *a Casting Test at SL 3 or better also applies
      // Stun*; D-775), null where any success offers it.
      sl: Number.isInteger(i.sl) && i.sl > 0 ? i.sl : null,
      // The Test to end it (the Legacy branches' door 19), bound at the rank by
      // `grantsFor`: THE WHOLE SHAPE, nulls included, so `same()` matches the
      // schema's initials on a feature that carries none.
      escape: {
        on: typeof i.escape?.on === "string" && i.escape.on ? i.escape.on : null,
        resilience: typeof i.escape?.resilience === "string" && i.escape.resilience ? i.escape.resilience : null,
        dc: typeof i.escape?.dc === "string" && i.escape.dc ? i.escape.dc : null,
        banes: Math.max(0, Math.min(3, Math.trunc(Number(i.escape?.banes)) || 0))
      },
      // Whether the card's Test governs it (the lead: *"Land automatically"*).
      onFail: i.onFail === true
    })),
    reminder: {
      kinds: f.reminder?.kinds ?? [],
      text: f.reminder?.text ?? "",
      boons: f.reminder?.boons ?? 0,
      banes: f.reminder?.banes ?? 0,
      // The skills a skill reminder bears on, where it names any (02's Scales: Stealth; the
      // stage 2 review, should-fix 7). A new key restamped by the sync (D-621).
      skills: f.reminder?.skills ?? []
    },
    // What stands on every ally in reach (02 §7's Aura of Resolve, D-755),
    // widened by a talent's patch (Wide Aura) before it gets here. **THE WHOLE
    // SHAPE, ZEROS INCLUDED**: `same()` below compares it against the stored
    // copy key by key, and a partial stamp would rewrite the feature at every
    // world load.
    aura: auraStamp(f.aura, { amount: v => (typeof v === "string" ? evaluateAmount(v, { rank, tier, level }) : v) })
  };
}

/** A spell document from the spells pack, by name, or null. */
async function spellFromPack(name) {
  const pack = game.packs.get("azeroth-rpg.spells");
  if (!pack) return null;
  const index = await pack.getIndex();
  const entry = index.find(e => e.name === name);
  return entry ? pack.getDocument(entry._id) : null;
}

/**
 * A suit worn or a weapon held (the Legacy branches' door 15): what a wield-gated
 * passive reads, so its arrival or its going re-syncs the talents' effects.
 */
function wornOrWielded(item) {
  return (item?.type === "armor" || item?.type === "weapon") && item?.system?.equipped === true;
}

/** Deep equality over plain data, with null and undefined the same absence. */
function same(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return (a ?? null) === (b ?? null);
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!same(a[k], b[k])) return false;
    return true;
  }
  return false;
}

/**
 * WHOSE aura gave a Boon to a Test rolled with no dialog, as a card row
 * (D-755's review). The dialog names *Aura of Resolve (Uther)* on its ticked
 * line, and a Long Rest's exposure has no dialog, so its card is the only place
 * a reader can see where the Boon came from. The shape `rollTest` writes for a
 * laid Bane: the line's own label, the names as the formula. Keyed on the line
 * the skipped dialog COUNTED, so the row can never name a Boon that was not
 * rolled.
 *
 * @param {Actor} actor
 * @param {string|null} resilience
 * @param {{chosen?: string[]}} choice  what `defaultChoice` returned
 */
function auraBoonProvenance(actor, resilience, choice) {
  if (!(choice?.chosen ?? []).includes("auraBoon")) return [];
  const { sources } = auraBoonsOn(actor.system?.auraBoonRows ?? [], "resilience", resilience);
  const names = sources
    .map(({ source, owner }) => (owner ? game.i18n.format("AZEROTH.Aura.EffectName", { source, owner }) : source))
    .filter(Boolean);
  return names.length ? [{ label: "AZEROTH.Modifier.AuraBoon", value: null, formula: names.join(", ") }] : [];
}

/**
 * A carrier as the application pass reads it (D-997): the carrier itself, unless a condition's
 * own effect holds one of its statuses, in which case a facade whose `system.changes` leaves out
 * the condition's change (`rules/condition-carriers.mjs#carrierChangesApplied`). The facade
 * stays inside the iterator, as `utilityEffectView`'s does; it is never persisted.
 */
function carrierEffectView(effect, held) {
  if (!effect || !held?.size || !effect.system?.changes?.length) return effect;
  const own = carrierChangesApplied(effect, held, id => CONFIG.statusEffects?.[id]?.system?.changes ?? []);
  if (own === effect.system.changes) return effect;
  const system = new Proxy(effect.system, { get(target, key) { return key === "changes" ? own : Reflect.get(target, key, target); } });
  return new Proxy(effect, { get(target, key) {
    if (key === "system") return system;
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

export class AzerothActor extends Actor {
  /**
   * A character's token is a PC's token (the lead, 2026-09-13).
   *
   * Core's defaults are HOSTILE, unlinked and nameless — right for a creature,
   * wrong for every player character — and `core.defaultToken` no longer
   * exists in v14, so nothing but this can set them. `rules/tokens.mjs` is the
   * rule; this is the door on create.
   *
   * **After `super`**, which fills in the token's name and artwork, and **only
   * the keys the create data did not name**: a GM passing `disposition: 0`
   * means it. The migration to 0.12.6 is the same stamp over what a world
   * already holds.
   *
   * @inheritDoc
   */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    if (this.type !== "character") return;
    const patch = characterTokenPatch(data?.prototypeToken ?? {});
    if (Object.keys(patch).length) this.prototypeToken.updateSource(patch);
    // **A CHARACTER MADE WITH ITS THINGS ALREADY ON IT HOLDS THEM KNOWN** (08 §4; D-1435; the
    // Phase 3 review, S6): an imported pregen, a duplicated legacy actor, a compendium character.
    // `Actor.create({items})` runs no item create seam, so those things would carry no flag and be
    // stamped the next time one moved. The migration's own judgement (`knownBatch`) writes them
    // `false`, as 0.15.6 writes what a world already holds; a flag either way is left alone.
    const known = knownBatch([...this.items].map(i => ({ _id: i.id, type: i.type, system: i._source?.system, flags: i._source?.flags })));
    if (known.length) {
      this.updateSource({ items: known.map(({ _id }) => ({ _id, flags: { [IDENTIFY_SCOPE]: { [UNIDENTIFIED_FLAG]: false } } })) });
    }
  }

  /** @inheritDoc */
  prepareBaseData() {
    super.prepareBaseData(); // REQUIRED — see the note above.
    // Subtype work belongs in the DataModel, not here.
  }

  /** Offer result replacement before a Test's outcome-dependent effects run. */
  /**
   * **WHO LAID THIS CREATURE'S SLOWED, WITH THEIR WEIGHT OF AGES** (04's Timewalker; stage
   * 3B): each holder of the talent among the uuids on the Slowed effect's own `laidBy`, with
   * the row at the holder's rank. Read by the attack's dialog (the Bane) and the Reaction
   * gate (rank 3), never stored.
   *
   * @returns {Array<{uuid: string, row: object}>}
   */
  weightOfAgesLayers() {
    const slowed = (this.effects ?? []).filter(e => e.active !== false && e.disabled !== true && e.statuses?.has?.("slowed"));
    const uuids = [...new Set(slowed.flatMap(e => e.flags?.["azeroth-rpg"]?.laidBy ?? []).filter(u => typeof u === "string" && u))].sort();
    const out = [];
    for (const uuid of uuids) {
      let holder = null;
      try {
        holder = fromUuidSync(uuid);
      } catch {
        holder = null;
      }
      if (holder?.documentName !== "Actor" || typeof holder.takenTalents !== "function") continue;
      const row = weightOfAgesFor(holder.takenTalents(), talentEffect);
      if (row) out.push({ uuid, row });
    }
    return out;
  }

  /** Whether a holder of Weight of Ages at rank 3 laid this creature's Slowed: *it also has no Reaction*. */
  get weightOfAgesBar() {
    return weightOfAgesBars(this.weightOfAgesLayers());
  }

  /**
   * **THE AFTER-THE-DIE SEAM** (02's Elune's Regard; and 04's Paradox and Time Lapse, stage
   * 3B): every Test door calls this once its die is evaluated and before anything follows
   * from it. In order: a nearby holder's Paradox on an enemy's Attack or Casting Test
   * (`effects/chromatic-reactions.mjs#askParadox`), the roller's own Time Lapse on a failure,
   * Another Timeline, a Demon Hunter's Beyond Limits on a Body or Reflex Resilience Test
   * (`effects/demon-hunter-features.mjs#offerBeyondLimits`), then Elune's Regard. A Test a Disrupt Weave has failed is the spell's failure, not the
   * die's, and nothing here reaches it.
   */
  async offerElunesRegard(roll) {
    if (roll?.options?.disrupted) return;
    const { askParadox, offerTimeLapse } = await import("../effects/chromatic-reactions.mjs");
    try {
      await askParadox({ roller: this, roll });
      await offerTimeLapse(this, roll);
    } catch (err) {
      console.warn("azeroth-rpg | Paradox or Time Lapse", err);
    }
    // **02's ANOTHER TIMELINE** (*A creature you can see within 30 feet that has just made an
    // Attack Test, a Casting Test or a Resilience Test rolls it again and takes the second
    // result*; stage 2b), asked of each holder near enough at the same seam.
    try {
      const { askAnotherTimeline } = await import("../effects/chrono-timeline.mjs");
      await askAnotherTimeline({ roller: this, roll });
    } catch (err) {
      console.warn("azeroth-rpg | Another Timeline", err);
    }
    // **02's BEYOND LIMITS, AFTER THE DIE** (*add 2 to a Body or Reflex Resilience Test after you roll it and see the
    // result*; D-1720, D-1724): the roller's own, on a Test the door stamped with its Resilience, and only where the 2
    // changes the result or its SL - asked before Elune's Regard, which reads the result this leaves.
    try {
      const { offerBeyondLimits } = await import("../effects/demon-hunter-features.mjs");
      await offerBeyondLimits(this, roll);
    } catch (err) {
      console.warn("azeroth-rpg | Beyond Limits", err);
    }
    return offerElunesRegard(this, roll);
  }

  /** V14 applies transferred Item effects through this iterator in both phases.
   * Dispersion keeps equipment intact but suspends its transferred effects;
   * actor-owned effects and non-equipment grants retain core behavior. */
  *allApplicableEffects() {
    const dispersed = Boolean(dispersionFor(this));
    const physicalItemUuids = dispersed ? new Set([...this.items]
      .filter(item => ["weapon", "armor", "gear"].includes(item.type)).map(item => item.uuid)) : null;
    // **A CONDITION'S CHANGE APPLIES ONCE** (D-997): where a condition's own effect stands beside
    // a carrier holding the same status (a Slowed laid on a creature with Frost Fever), the
    // carrier's copy of the condition's change sits out this pass, or Speed would halve twice.
    const held = conditionStatusesHeld(this.effects ?? []);
    for (const effect of super.allApplicableEffects()) {
      if (dispersed && dispersionSuppressesEquipmentEffect(effect, physicalItemUuids)) continue;
      const utility=utilityEffectView(effect,game.time?.worldTime??0);
      if(utility)yield carrierEffectView(prostheticEffectView(this,utility), held);
    }
  }

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
  }

  /**
   * @inheritDoc
   *
   * **WHAT MUST LAND AFTER THE `final` PHASE** (D-768). Core applies the
   * `final` Active Effect phase inside `Actor#prepareData`, after
   * `prepareDerivedData` (14.367 client/documents/actor.mjs:435-436), and gives
   * the system model no hook after it. Toughness raises the Health maximum in
   * that phase, and `CharacterData` clamped the Health to the maximum BEFORE it,
   * so Health could never stand above the base maximum: healed to the raised
   * maximum, the next preparation cut it back. The model's own `afterFinalPhase`
   * runs here, once the phase has landed. **Public, never `#private`**: this is
   * reached from data preparation (CLAUDE.md's private-method trap).
   */
  prepareData() {
    super.prepareData();
    this.system?.afterFinalPhase?.();
  }

  /**
   * @inheritDoc
   *
   * **ONLY THE TOKENS A SCENE HOLDS ARE THIS ACTOR'S DEPENDENTS** (found live in B8b;
   * 14.367's own `concreteOnly`, which core's JSDoc says becomes the default in v15).
   * Core registers EVERY TokenDocument it constructs with a scene as one of its
   * actor's dependents (client/documents/token.mjs L434) - among them the pending
   * document `ClientDatabaseBackend##preCreateDocumentArray` builds for `_preCreate`
   * on every token created (client/data/client-backend.mjs L92), which stays
   * registered until it is collected - and then visits all of them with the
   * default `false`: an actor update reads `.object` on each
   * (`TokenDocument#_onRelatedUpdate`), building an undrawn Token for one on the
   * viewed scene, and the next special status (Invisible, Blind) reaches that
   * Token in `Actor#prepareData` and throws on its missing mesh - *Failed data
   * preparation*, and the real token's own refresh skipped. A caller that wants
   * the pending ones asks for them by name (`concreteOnly: false`).
   */
  getDependentTokens({ concreteOnly = true, ...options } = {}) {
    return super.getDependentTokens({ ...options, concreteOnly });
  }

  /* -------------------------------------------- */

  /** The class items backing `system.classes[]`, in array order. */
  get classItems() {
    const classes = this.system?.classes;
    if (!Array.isArray(classes)) return [];
    return classes.map(c => this.items.get(c.itemId)).filter(i => i?.type === "class");
  }

  /** The names of the classes held, for a rule that is class-locked (08 §9). */
  get classNames() {
    return this.classItems.map(c => c.name);
  }

  /**
   * The Augment in hand (07 §3, D-674), or null. `system.augment` is derived
   * on the item, so this reads what the sheet reads.
   */
  get heldAugment() {
    return heldAugment(this.items.filter(i => i.type === "gear"));
  }

  /** The race item, if one is equipped. */
  get raceItem() {
    return this.items.find(i => i.type === "race") ?? null;
  }

  /**
   * The bearer, as `rules/signatures.mjs#gateHolds` reads one (08 §20, D-692).
   *
   * **THE ONE PLACE THE ACTOR IS READ FOR A GATE.** The standing pass in
   * `CharacterData#prepareDerivedData`, the refusals, the tick and the attack
   * all judge the same gate, and three copies of this would be three chances
   * for a Paladin's item to grant on one surface and not another.
   *
   * The half that names the TARGET — its kind, whether it has acted — is not
   * here: there is no target until there is an attack, and `attackWithDialog`
   * adds it from the target snapshot.
   *
   * **FOUR** of the nine gate kinds come back unfilled to the standing pass,
   * and each fails closed rather than holding by default:
   *
   * - **`schools`** is DERIVED (`system.schools`), and the standing pass reads
   *   this before that line runs. No §20 entry gates on a school — the Ten
   *   Storms deliberately scopes its bonus to what is CAST instead — so
   *   nothing is withheld by it today.
   * - **`factions`** has nowhere to come from: a character stores no faction
   *   standing yet, and inventing one here would be worse than withholding.
   * - **`moved`** is not here AT ALL, and deliberately. It is the movement
   *   halves the turn has spent, which lives on the COMBATANT, and this getter
   *   runs inside `prepareDerivedData` — walking `game.combats` on every data
   *   preparation to serve a gate that gates one `none` row is the shape that
   *   has already thrown this system into `_safePrepareData` once. The attack
   *   path adds it to the state it builds, because it is on a turn and this is
   *   not.
   * - **`health.max` IS THE STORED MAXIMUM, not the derived one**, for the
   *   standing pass and for it alone (2026-09-10). `CharacterData#prepareDerivedData`
   *   builds the bearer at the TOP of the method and works `health.max` out
   *   near the bottom, so a `belowHalfHealth` gate judged in the standing pass
   *   is judged against whatever was last persisted. **It cannot simply be
   *   moved after the derivation**: the maximum is `healthMax({bonus:
   *   worn.fortitude})` and `worn` is the grant pass, which needs the bearer —
   *   reading it later would be circular. The only pack document with that
   *   gate is a `none` row, so nothing is judged wrongly today; the next entry
   *   that gates on it is the one this bullet is written for. Every OTHER
   *   reader — `signatureTurnState`, the press, the sheet, the attack — runs
   *   outside data preparation and sees the derived maximum.
   *
   * **TWO OF THE SIX WERE THE CHARACTER'S SHAPE AND NOTHING ELSE'S**, and this
   * getter has been the creature's bearer since `NpcData#prepareDerivedData`
   * began composing `signatureEffects` (D-692):
   *
   * - **`race`** was `raceItem?.name`, and a creature holds no race ITEM. Its
   *   people is `system.race` — 14 §1's `**Race** Orc` run, a string — so a
   *   Signature gated *an Orc wielding it* could never hold on an orc.
   * - **`corruption`** is a MAP of track to score on a character and a TRACK
   *   NAME on a creature: 14 §1 says the entry *names the track the creature
   *   exposes*, which is not a score it holds. Handing that string to
   *   `gateHolds` fed a map reader a string; `held["fel"]` is undefined on
   *   every track, so it read as 0 everywhere and a `fel 0` gate held on a
   *   creature carrying the Undeath keyword. **The creature answers `null` —
   *   no snapshot — and the gate fails closed**, which is the law: a clause
   *   that cannot be read is kept and never holds. Giving the keyword a score
   *   would be inventing a number 14 does not print, and it is the lead's to
   *   make if a creature is ever to bear a Corruption-gated Signature.
   */
  get signatureState() {
    const s = this.system ?? {};
    return {
      classes: this.classNames,
      // A character wears its people as an item; a creature states it (14 §1).
      race: this.raceItem?.name ?? (typeof s.race === "string" ? s.race : null),
      // **THE FACTION, OFF THE PEOPLE** (02 §1; D-911): a `faction` gate had no
      // snapshot to read and failed closed on everybody (Warchief's Hammer).
      // And since D-912 the organisations a creature's 14 entry names and what a GM set
      // (`rules/factions.mjs#factionsFor`, the one reader).
      factions: factionsFor({
        people: this.raceItem?.name ?? (typeof s.race === "string" ? s.race : null),
        name: this.type === "npc" ? (this._source?.name ?? this.name ?? "") : "",
        section: this.type === "npc" ? (s.source?.section ?? "") : "",
        set: typeof s.factions === "string" ? s.factions : ""
      }),
      schools: s.schools ?? null,
      // **THE FORMS' NAMES, OR NOTHING** (D-769). The old flag object reached
      // a gate as `[object Object]`, so a form named in a gate never held; any
      // shape counts as *in any form they take* (Stormrage Raiment), the
      // Avatar's and Metamorphosis's included - the plan's reading. **A form somebody
      // else laid is none of them** (D-808): a hexed Druid is in no form of their own.
      form: this.shape && !this.shape.forced ? this.shape.forms.map(f => f.name) : null,
      health: { value: s.health?.value ?? 0, max: s.health?.max ?? 0 },
      // The three tracks and their scores, or nothing. A creature's keyword is
      // not a score, so it is not one of these.
      corruption: s.corruption && typeof s.corruption === "object" ? s.corruption : null,
      // **THE NAME AN UNIDENTIFIED THING'S ROWS CARRY** (08 §4; D-1435): `signatureEffects` is
      // pure and holds no words, and every door that composes it - the attack, the cast, the
      // damage, the reaction, the derived aggregate - reads the bearer off here.
      unidentifiedName: unidentifiedSource()
    };
  }

  /**
   * The bearer on a TURN: `signatureState` plus how far this turn has already
   * moved, for 08 §20's *while you have not moved this turn* (D-692). Out of a
   * fight there are no turns and the gate fails closed, which is right.
   */
  get signatureTurnState() {
    const fight = this.activeFight?.() ?? null;
    const combatant = fight?.getCombatantsByActor?.(this)?.[0] ?? null;
    return {
      ...this.signatureState,
      ...(combatant ? { moved: combatant.getFlag("azeroth-rpg", "moveHalves") ?? 0 } : {})
    };
  }

  /**
   * **THE PROFESSION** (D-1903): the embedded profession item the character's
   * `system.profession.itemId` names, else the one it holds (an actor made with
   * `Actor.create({items})` never ran the link, CLAUDE.md §15), else null. One
   * at a time: `_onCreateDescendantDocuments` deletes any other.
   * Replaces the career's `careerItem`, retired with careers.
   */
  get professionItem() {
    if (this.type !== "character") return null;
    return this.items.get(this.system?.profession?.itemId ?? "")
      ?? this.items.find(i => i.type === "profession") ?? null;
  }

  /** The profession's tier: the character's own (D-1905), 1 to 4. */
  get professionTier() {
    return this.system?.tier ?? professionTierAt(this.system?.level ?? 1);
  }

  /**
   * **THE SKILLS AT THE CHEAP RATE** (D-1906): the profession's five, the picks
   * made at each tier reached, and the skill a Human's Adaptable names, always
   * cheap (02 §5). A Set of skill keys; empty with no profession beside
   * Adaptable's. The sheet's Rank prices and every XP door read it
   * (`xp.mjs#rankCost(rank, set.has(key))`).
   *
   * @returns {Set<string>}
   */
  professionSkills() {
    const p = this.professionItem;
    return professionSkillSet({ profession: p?.system ?? null, tier: this.professionTier, picks: p?.system?.picks ?? null, adaptable: this.adaptableSkill() });
  }

  /**
   * The skill a Human's Adaptable names (02 §5, D-636), off the race trait
   * feature's `known` list, or null: always a cheap skill whatever the
   * profession (D-1934).
   */
  adaptableSkill() {
    const raceId = this.raceItem?.id ?? null;
    if (!raceId) return null;
    const trait = this.items.find(i => i.type === "feature" && i.getFlag("azeroth-rpg", "feature")?.classId === raceId);
    return skillFromKnown(trait?.system?.known ?? []);
  }

  /**
   * The profession's tool this character carries, the best grade of it
   * (D-1923, D-1936), or null: `{item, rarity, bonus}`.
   */
  professionTool() {
    const id = this.professionItem?.system?.identifier ?? null;
    return id ? carriedTool(this.items, id) : null;
  }

  /**
   * **THE SHAPE THIS ACTOR WEARS, OR NULL** (D-769): THE ONE READER. A shape is
   * one Active Effect carrying `flags.azeroth-rpg.shape` (`documents/shapes.mjs`
   * writes it), read while it is active - a switched-off effect overrides
   * nothing, so it is no shape either. `physical` is the block's half the
   * character takes (`rules/shapes.mjs#physicalHalf`), Chimera's better-of
   * included.
   *
   * **Public, never `#private`**: `CharacterData#prepareDerivedData` reads it
   * through `this.parent` (CLAUDE.md's private-method trap).
   *
   * @returns {{id: string, kind: string, forms: object[], ward: object|null, physical: object}|null}
   */
  get shape() {
    const effect = (this.effects?.contents ?? [])
      .filter(e => e.active !== false && e.getFlag?.("azeroth-rpg", SHAPE_FLAG))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
    if (!effect) return null;
    const shape = readShape(effect.getFlag("azeroth-rpg", SHAPE_FLAG));
    if (!shape) return null;
    // **A FORCED SHAPE HAS NO PHYSICAL HALF** (D-808): under Hex or Polymorph the
    // creature keeps its own scores, Defense, Armor Points, size and gear, so every
    // reader of `physical` - `CharacterData` above all - finds nothing to take.
    const forced = isForcedKind(shape.kind);
    // A drake form keeps the character's own scores (`rules/shapes.mjs#shapePhysical`).
    return { id: effect.id, ...shape, forced, physical: forced ? null : shapePhysical(shape.kind, shape.forms) };
  }

  /**
   * Whether the shape is a SHAPESHIFT form (02 §7): the one that builds
   * Ferocity, bars Mana and turns on a Feral talent. The Avatar is not one
   * (D-251), nor is Metamorphosis.
   */
  get inShapeshiftForm() {
    return this.shape?.kind === "shapeshift";
  }

  /**
   * **WHETHER A SHAPE SOMEBODY ELSE LAID SHUTS THIS DOOR, SAID IN WORDS** (07's Hex,
   * 02's Polymorph; D-808): the one question every door that attacks, casts, uses
   * or reacts asks before anything is spent, through `documents/shapes.mjs
   * #refuseForcedShape`. True where the door is shut and the user was told why.
   * A method on the actor, so a door asks it as `actor?.refuseForcedShape?.(door)`.
   *
   * @param {string} door  a `rules/shapes.mjs#FORCED_REFUSALS` key
   * @returns {boolean}
   */
  refuseForcedShape(door) {
    return refuseForcedShape(this, door)
      // **AND 14's HEX THE LOUDEST** (D-809): *Silenced and cannot attack until the end of
      // its next turn* - asked after the shape, at the same question, so every attack door
      // that refuses a hexed creature refuses this one too, in its own words.
      || ((door === "attack" || door === "reaction") && refuseCannotAttack(this));
  }

  /**
   * **THE WEAPONS THIS ACTOR FIGHTS WITH** (D-769): THE ONE ACCESSOR. In a shape
   * whose gear melds - every kind a character takes for itself does, the drake form
   * included (the lead: *"Melds; Signatures count"*; 02, *Drake form*) -
   * they are the block's attack rows, each shaped as a weapon by
   * `rules/shapes.mjs#naturalWeapon`; otherwise the weapons held. The Combat
   * tab, the card's Attack button, the off hand, Parry and the Opportunity
   * Attack all read this, so a melded sword is never swung.
   *
   * @returns {Array<Item|object>}
   */
  readyWeapons() {
    const shape = this.type === "character" ? this.shape : null;
    if (shape && meldsGear(shape.kind)) {
      return (shape.physical?.attacks ?? []).map((row, index) => naturalWeapon(row, { index, form: row.form }));
    }
    // A drake form melds too (02, *Drake form*: *You fight with the block's attacks in
    // place of your weapons*), so it takes the branch above; nothing in hand is added.
    // **A THROWN GLAIVE IS NOT IN THE HAND** (07 §15's Flame Crash: *A thrown glaive lies where it landed until you
    // pick it up or cast Call the Glaives, and you cannot attack with it until then*; C55, C57; D-1549): it keeps its
    // slot and is no ready weapon, so its hand is empty.
    return this.items.filter(i => i.type === "weapon" && i.system?.equipped === true && !glaiveAway(i));
  }

  /**
   * @inheritDoc
   *
   * **Dropping a career on a sheet has to make it THE career.** `careerItem`
   * reads `system.career.itemId`, and nothing was ever setting it - so a GM
   * dragged a career onto a character, the item appeared in the list, and
   * `careerItem` stayed null forever. Every reader of it was dead code.
   *
   * A character is in one career at a time (03 SS2), so the newest one wins.
   * The tier is copied alongside because the eligibility check reads it and a
   * pointer without a tier is half a link.
   *
   * **EVERY BRANCH HERE IS THE CHARACTER'S, AND ONLY THE CLASS ONE SAID SO.**
   * A creature carries items too (D-692), so this method runs on one, and two
   * of its three branches were reaching for fields `NpcData` does not have:
   *
   * - **the career** wrote `system.career.itemId` and `system.career.tier`
   *   against a model with no `career` field at all. Nothing threw and nothing
   *   landed: `ClientDatabaseBackend##preUpdateDocumentArray` cleans the
   *   changes first (`prune: true` is the default), the diff comes back empty
   *   and the update is dropped before it is dispatched — but **`preUpdateActor`
   *   has already fired** by then, so every GM dropping a career on a creature
   *   raised a hook with an empty change for every module in the world to see;
   * - **the race** DELETED whatever race item was already held. A creature's
   *   people is `system.race`, a string off 14 §1's `**Race** Orc` run, and a
   *   race item on a creature is a GM's own note; the *one at a time* rule is
   *   02 §5's and belongs to the actor 02 is about.
   *
   * Both are gated where the class branch already was, and `race` stays in
   * scope as null so the grant chain below reads the same.
   */
  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if (collection !== "items" || game.user.id !== userId) return;

    // A shield created ALREADY IN HAND moves Shield of Faith (D-648, D-768):
    // the sync ran only on an `equipped` or `shield` UPDATE, so a shield dropped
    // straight into the off hand gave no Defense until something else re-synced.
    // And a suit or a weapon arriving in hand moves a wield-gated passive (door 15).
    if (this.type === "character" && documents.some(d => isEquippedShield(d) || wornOrWielded(d))) {
      this.syncTalentEffects().catch(err => console.error("azeroth-rpg | talent effects", err));
    }

    const update = {};

    // **A PROFESSION: THE NEWEST IS THE PROFESSION, ONE AT A TIME, AND THE RANK
    // COMES WITH YOU** (D-1903; 03 §4, D-1933). Replaces the career's link. The
    // others are deleted and the newcomer takes the highest Rank any held
    // (`professions.mjs#professionSwap`), so changing trade never costs a Rank.
    const profession = this.type === "character" ? documents.findLast(d => d.type === "profession") : null;
    let professionChain = null;
    if (profession) {
      const held = this.items.filter(i => i.type === "profession" && i.id !== profession.id);
      const swap = professionSwap({ arriving: profession, held });
      if (this.system?.profession?.itemId !== profession.id) update["system.profession.itemId"] = profession.id;
      if (this.getFlag("azeroth-rpg", PROFESSION_OWED_FLAG) !== undefined) {
        update[`flags.azeroth-rpg.${PROFESSION_OWED_FLAG}`] = foundry.data.operators.ForcedDeletion.create();
      }
      professionChain = async () => {
        if (swap.rankChanged) await profession.update({ "system.rank": swap.rank });
        const stale = swap.remove.filter(id => this.items.has(id));
        if (stale.length) await this.deleteEmbeddedDocuments("Item", stale);
      };
    }

    // A class: linked into `system.classes[]`, which nothing else ever writes.
    // Without this a dropped Warrior sat in the item list while level, tier,
    // pools, schools and Spell DC all stayed at their level-1 defaults - the
    // single largest gap the seam audit found. A new entry's Power opens FULL
    // (05 §12: it belongs to you before the fight starts); Momentum opens at 0
    // (it builds in a fight and dies with it).
    if (this.type === "character") {
      let classes = this.system?.classes ?? [];
      let changed = false;
      for (const item of documents.filter(d => d.type === "class")) {
        if (classes.some(c => c?.itemId === item.id)) continue;
        const level = 1;
        // The casting modifier the pool takes (02 §6; 02 §7's *You start with full Vitae*: the chart times
        // 1.5 PLUS Constitution), read off the actor's own score so a new pool opens at its true top.
        const castingMod = item.system?.castingAbility ? (this.system?.abilities?.[item.system.castingAbility]?.mod ?? 0) : 0;
        const { powers } = poolsFor([{ ...item.system, itemId: item.id, level, castingMod }], level);
        const full = powers.find(p => p.itemId === item.id)?.max ?? 0;
        // **A SECOND ENERGY CLASS JOINS THE POOL ALREADY HELD** (02 §10, D-1723): its entry mirrors the
        // holder's value rather than opening full, so the one pool is not refilled by taking a class.
        const joined = sharedPoolValue(classes, id => this.items.get(id)?.system?.power?.name ?? null, item.system?.power?.name ?? null);
        try {
          classes = addClassEntry(classes, { itemId: item.id, level, power: { value: joined ?? full }, momentum: { value: 0 } });
          changed = true;
        } catch {
          // The item's _preCreate veto should have refused it; if a door got
          // past that, do not leave a dangling third item.
          item.delete();
        }
      }
      if (changed) update["system.classes"] = classes;
    }

    // A race: one at a time (02 §5). The character's — a creature's people is
    // the string on its block, so nothing here may delete its items.
    const race = this.type === "character" ? documents.findLast(d => d.type === "race") : null;
    if (race) {
      const stale = this.items.filter(i => i.type === "race" && i.id !== race.id).map(i => i.id);
      if (stale.length) this.deleteEmbeddedDocuments("Item", stale);
    }

    let linked = Object.keys(update).length ? this.update(update) : Promise.resolve(this);
    if (professionChain) {
      linked = linked.then(professionChain);
      this._professionLink = linked.catch(err => console.warn("azeroth-rpg | profession link", err));
    }

    // A class brings its three branches with it. 04 gives every class thirty-
    // six talents and the tree is drawn from the talents the actor OWNS, so
    // without this a dropped class opened no branch at all and the Progress
    // tab said "add a class" to a character who had. Granted after the link
    // lands, so a listener waiting on the class update sees the talents next.
    // A race brings its eight talents and its trait the same way (02 §5,
    // D-620), on the same chain, so the two grants never run against each
    // other on one actor.
    if (this.type === "character") {
      const classes = documents.filter(d => d.type === "class");
      if (classes.length || race) {
        let grant = linked;
        // The race the character holds as the class lands: the one arriving with
        // it, else the one it already has (a Legacy comes with its people, D-781).
        const people = (race ?? this.raceItem)?.name ?? null;
        if (classes.length) grant = grant.then(() => grantClassTalents(this, classes, { people }));
        if (race) grant = grant.then(() => grantRaceTalents(this, race));
        // A race arriving or changing brings its people's Legacy branch onto every
        // class held and takes another people's away (04 §1, D-781).
        if (race) grant = grant.then(() => this.syncLegacyBranches({ people: race.name }));
        // Exposed so a caller that means to delete the actor straight after
        // (a test's teardown) can wait for it: the server logs a refused
        // create to the console before the rejection reaches any catch.
        // Then the features the class grants at its level, and the race's
        // trait (D-612, D-620).
        this._talentGrant = grant
          .then(() => (game.actors.has(this.id) || this.isToken ? this.syncClassFeatures() : null));
      }
    }
  }

  /**
   * @inheritDoc
   *
   * Deleting the career the actor points at must clear the pointer, or
   * `careerItem` resolves to nothing while the sheet still believes there is
   * one.
   */
  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    // Immunity suppresses the condition, not the stored Fatigue track. Restore
    // its statuses when the carrier ends; another live immunity still gates them.
    if (parent === this && collection === "effects" && this.type === "character" && this.isOwner
      && game.user.id === userId && documents.some(d => d.flags?.["azeroth-rpg"]?.immuneTo?.conditions?.includes("slowed"))) {
      this.syncFatigue().catch(err => console.warn("azeroth-rpg | fatigue after immunity", err));
    }
    if (collection !== "items" || game.user.id !== userId) return;

    // A launcher whose bundle left has nothing nocked (D-641).
    const orphaned = this.items.filter(i => i.type === "weapon" && i.system?.ammunition && ids.includes(i.system.ammunition));
    if (orphaned.length) this.updateEmbeddedDocuments("Item", orphaned.map(i => ({ _id: i.id, "system.ammunition": null })));

    // A shield deleted WHILE HELD takes Shield of Faith's Defense with it (D-648,
    // D-768). The deleted documents still carry their data, and the collection
    // no longer holds them, so the sync reads the hand as it now is. A suit or a
    // weapon deleted while worn or held moves a wield-gated passive (door 15).
    if (this.type === "character" && documents.some(d => isEquippedShield(d) || wornOrWielded(d))) {
      this.syncTalentEffects().catch(err => console.error("azeroth-rpg | talent effects", err));
    }

    const update = {};
    // The profession the character points at, deleted: the pointer moves to
    // any other it still holds, or clears (D-1903). A swap's own delete of the
    // OLD profession leaves the pointer on the new one.
    const heldProfession = this.system?.profession?.itemId;
    if (this.type === "character" && heldProfession && ids.includes(heldProfession)) {
      const remaining = this.items.find(i => i.type === "profession");
      update["system.profession.itemId"] = remaining?.id ?? null;
    }

    // A deleted class leaves `classes[]`; deleting the primary promotes the
    // second, and the character's frame, Health and pools move with it.
    const classes = this.system?.classes ?? [];
    const gone = classes.filter(c => ids.includes(c?.itemId));
    if (gone.length) {
      let next = classes;
      for (const c of gone) next = removeClassEntry(next, c.itemId);
      update["system.classes"] = next;
      if (classes[0] && ids.includes(classes[0].itemId) && next.length) {
        ui.notifications?.info(game.i18n.format("AZEROTH.Sheet.ClassPromoted",
          { name: this.items.get(next[0].itemId)?.name ?? "?" }));
      }
    }

    // The branches leave with the class: its talents go, taken ranks and all.
    // A class still held under the same name (a re-import) keeps them. The
    // features leave through `syncClassFeatures`, which the class array's
    // update below triggers - deleting them here as well met them already
    // gone (D-612).
    const leaving = documents.filter(d => d.type === "class").map(d => d.name);
    if (leaving.length) {
      const kept = new Set(this.items.filter(i => i.type === "class").map(i => i.name));
      const orphaned = this.items
        .filter(i => i.type === "talent" && leaving.includes(i.system?.className) && !kept.has(i.system?.className))
        .map(i => i.id);
      if (orphaned.length) this.deleteEmbeddedDocuments("Item", orphaned);
    }

    // A race leaving takes its eight talents with it (D-620); its trait
    // leaves through the feature sync, which nothing else would trigger.
    const racesLeaving = documents.filter(d => d.type === "race").map(d => d.name);
    if (racesLeaving.length) {
      const keptRaces = new Set(this.items.filter(i => i.type === "race").map(i => i.name));
      const orphaned = this.items
        .filter(i => i.type === "talent" && racesLeaving.includes(i.system?.race) && !keptRaces.has(i.system?.race))
        .map(i => i.id);
      if (orphaned.length) this.deleteEmbeddedDocuments("Item", orphaned);
      if (this.type === "character") this.syncClassFeatures();
      // And its Legacy branch (04 §1, D-781): the people left is the race still
      // held, or none, and the resync withdraws every branch it does not keep.
      // After any grant still landing, so a class granted in the same moment is
      // not given its Legacy twice.
      if (this.type === "character") {
        // A resync that fails is said in words and warned of, never logged as an
        // error (CLAUDE.md §16: the smoke run fails on any console error): the race's
        // change stands either way.
        Promise.resolve(this._talentGrant).catch(() => {})
          .then(() => this.syncLegacyBranches({ people: this.raceItem?.name ?? null }))
          .catch(err => {
            ui.notifications?.warn(game.i18n.format("AZEROTH.Talent.LegacySyncFailed", { name: this.name }));
            console.warn("azeroth-rpg | Legacy branches", err);
          });
      }
    }

    if (Object.keys(update).length) this.update(update);
  }

  /**
   * **THE CHARACTER'S LEGACY BRANCHES, BROUGHT INTO LINE WITH ITS PEOPLE** (04 §1,
   * D-781): its people's Legacy embedded on every class it holds, another
   * people's withdrawn. One write at a time on this actor - a race's arrival and
   * the stale race's departure each ask, and the second must read what the first
   * wrote rather than delete the same talents again.
   *
   * @param {{people?: string|null}} [o]  the race to sync to, by name; the one held by default
   * @returns {Promise<{embedded: number, withdrawn: number}>}
   */
  syncLegacyBranches({ people } = {}) {
    const run = () => syncLegacyTalents(this, people === undefined ? {} : { people });
    const next = (this._legacySync ?? Promise.resolve()).catch(() => {}).then(run);
    this._legacySync = next;
    return next;
  }

  /**
   * @inheritDoc
   *
   * A class's talent grant is in flight for a moment after the class lands.
   * Deleting the actor under it makes the server refuse the create and log
   * the refusal to the console before any catch sees it, so the delete waits
   * for the grant - every door, a sheet's button and a test's teardown alike.
   */
  async delete(operation = {}) {
    await this._talentGrant?.catch?.(() => {});
    // And a race's Legacy resync (D-781), which embeds and withdraws on its own queue.
    await this._legacySync?.catch?.(() => {});
    await this._featureSync?.catch?.(() => {});
    // And the talent effects' own queue (D-768), so no effect is written onto
    // an actor the server has already deleted.
    await this._talentEffectsSync?.catch?.(() => {});
    // The creatures bound to a character are released with it (D-643).
    if (this.type === "character") await releaseAll(this).catch(() => {});
    return super.delete(operation);
  }

  /**
   * Set the character's level (02 §9: granted, and the whole party at once).
   *
   * The primary entry carries it and a second class is stored at the level it
   * functions at, through `rules/progression.mjs#setCharacterLevel`. Health
   * maximum, tier, Proficiency, the Mana band and the talent points all
   * follow at the next data preparation; nothing else is written.
   */
  async setLevel(level) {
    const classes = this.system?.classes ?? [];
    if (!classes.length) return this;
    return this.update({ "system.classes": setCharacterLevel(classes, level) });
  }

  /**
   * Data available to roll formulas.
   *
   * Ability modifiers are exposed both by key and under `abilities`, so a
   * formula can read `@str.mod` or `@abilities.str.mod`. Nothing derived is
   * recomputed here — this reads prepared data.
   */
  getRollData() {
    const data = { ...super.getRollData() };
    const abilities = this.system?.abilities ?? {};
    for (const [key, ability] of Object.entries(abilities)) {
      data[key] = { ...ability };
    }
    data.level = this.system?.level ?? null;
    data.tier = this.system?.tier ?? null;
    data.prof = this.system?.proficiency ?? null;
    return data;
  }

  /**
   * The pools a character holds, as the rest rules want them: one entry per
   * class pool, with the class item id that owns it.
   * @returns {{itemId: string, kind: "power"|"momentum", name: string, value: number, max: number}[]}
   */
  poolSnapshot() {
    const s = this.system ?? {};
    const out = [];
    // A creature's pools are flat (14's block): one Momentum and one Power,
    // each by name, with no class item to key on (D-627).
    if (this.type === "npc") {
      // Held by its VALUE, never by a name: the block prints a number in the
      // pool row and no type, so every pack creature's name is null (D-637).
      //
      // **AND THE MAXIMUM FALLS BACK TO THE DERIVED ONE** (D-705). 13 §5
      // publishes a Power row for a Boss and nothing else, so 123 of the 164
      // store `power.max` null and hold only the floor `creaturePools` derives
      // (`NpcData#prepareDerivedData`). Read off the stored field alone, this
      // returned NO power pool for any of them — so `manaPool` found nothing,
      // a spell dropped on a Kobold cast for free, and the sheet's own pool
      // row disagreed with this one. The derived maximum includes the printed
      // base and any temporary pool-specific cap bonus.
      const powerMax = s.powerMax ?? s.power?.max ?? null;
      if (powerMax !== null && powerMax !== undefined) {
        out.push({ itemId: null, kind: "power", name: s.power.name ?? null, value: s.power.value ?? 0, max: powerMax });
      }
      const momentumMax = s.momentum?.max ?? s.momentumMax ?? null;
      if (momentumMax !== null && momentumMax !== undefined) {
        out.push({ itemId: null, kind: "momentum", name: s.momentum.name ?? null, value: s.momentum.value ?? 0, max: momentumMax });
      }
      return out;
    }
    // **THE ONE ENERGY POOL TWO CLASSES SHARE** (02 §10, D-1723) carries `itemIds`, its members, the
    // holder first; every other row carries none. A write that names any member reaches it
    // (`rules/pools.mjs#poolHeldBy`).
    for (const p of s.powers ?? []) out.push({ itemId: p.itemId, kind: "power", name: p.name, value: p.value ?? 0, max: p.max ?? 0, ...(Array.isArray(p.itemIds) ? { itemIds: [...p.itemIds] } : {}) });
    for (const p of s.momenta ?? []) out.push({ itemId: p.itemId, kind: "momentum", name: p.name, value: p.value ?? 0, max: p.max ?? 0 });
    return out;
  }

  /**
   * Empty every Sand pool (D-848): the door `AzerothItem` calls when an Hourglass
   * leaves the Ranged slot, so re-equipping it gives nothing back. Written
   * through `updatePool`, which skips a write that moves nothing.
   */
  // **ONE AT A TIME** (the 2a review's should-fix, stage 2b): two unequips in quick order - a
  // displacement and a bag move - each read the pool and wrote; queued on the actor, each reads
  // the pool as the last one left it. A throw is said and never stops the next.
  async emptySand() {
    if (this.type !== "character") return this;
    const run = async () => {
      const updates = emptySandUpdates(this.poolSnapshot());
      return updates.length ? this.updatePool(updates) : this;
    };
    const next = (this._sandEmptying ?? Promise.resolve()).then(run, run);
    this._sandEmptying = next.catch(err => console.warn("azeroth-rpg | emptying Sand", err));
    return next;
  }

  /**
   * Write one or more pool values. THE ONLY PLACE `system.classes[]` IS
   * WRITTEN FOR A POOL: the sheet, the workflows and the combat all come
   * through here, so none of them can reach for the legacy `system.power`
   * mirror that `prepareDerivedData` overwrites on the next preparation - which
   * is exactly what the rest handlers used to do, and why a Short Rest never
   * restored the pool the sheet draws.
   *
   * **ONE AT A TIME FOR EACH ACTOR** (the F2 review's should-fix 4, D-761's lesson): the
   * write runs on this client after every pool write queued before it for this actor has
   * landed (`documents/pool-writes.mjs`), and reads the classes then, so a cast beside a
   * rune spend, a feature's price beside a Long Rest, never loses one of the two.
   *
   * @param {{itemId: string, kind: "power"|"momentum", value: number}[]|object} changes
   * @param {object} [extra]  Other fields to write in the same update.
   * @param {{runicGain?: string|null, essenceGain?: string|null}} [options]  core's update
   *   options, and - read here and never sent - the door a RISE of Runic Power comes through
   *   (`rules/runes.mjs#RUNIC_GAIN_SOURCES`), and of Essence (`rules/essence.mjs
   *   #ESSENCE_GAIN_SOURCES`)
   */
  async updatePool(changes, extra = {}, options = {}) {
    return poolWrite(this, () => this.writePoolsNow(changes, extra, options));
  }

  /**
   * **02 §7's UNHOLY PRESENCE ENDS AT 0 HEALTH** (door 10: *until you end it, you drop to 0 Health
   * or you finish a Long Rest*), **AND MARCH OF THE DAMNED** (the lead on O-355, run F4b, D-987:
   * *"Yes."*): every laid state `PRESENCE_ENDS_AT_ZERO` names, called by the struck blow's 0 Health
   * branch. Said and never thrown, so nothing the blow does next is skipped.
   */
  async _endPresenceAtZero() {
    const standing = PRESENCE_ENDS_AT_ZERO.filter(kind => presenceOf(this.effects, kind));
    if (!standing.length) return;
    try {
      const { endPresence } = await import("../effects/death-knight-necromancy.mjs");
      for (const kind of standing) await endPresence(this, kind);
    } catch (err) {
      console.warn("azeroth-rpg | a presence at 0", err);
    }
  }

  /**
   * **THE WRITE ITSELF, UNQUEUED**: for a task already running in this actor's pool queue
   * (`documents/runes.mjs`), which must never await `updatePool` - it would wait behind
   * itself. Everything else calls `updatePool`.
   */
  async writePoolsNow(changes, extra = {}, options = {}) {
    const { runicGain = null, essenceGain = null, tributeGain = null, vitaeGain = null, hatredGain = null, ...updateOptions } = options ?? {};
    const gainSources = { runicGain, essenceGain, tributeGain, vitaeGain, hatredGain };
    options = updateOptions;
    const list = Array.isArray(changes) ? changes : [changes];
    if (!list.length && !Object.keys(extra).length) return this;
    if (this.type === "npc") {
      const update = { ...extra };
      for (const { kind, value } of list) {
        const pool = kind === "momentum" ? this.system?.momentum : this.system?.power;
        // The block's own maximum where it states one, else the floor the tier
        // gives it (D-705). Read off the stored field alone this `continue`d
        // for the 123 creatures that store none, so a spell cast from a
        // Kobold's Spells tab spent nothing at all and the tab still drew
        // `4 / 4` — the sheet's `#pool()` had taken the derived maximum since
        // D-637 and this had not.
        const max = this.system?.[`${kind}Max`] ?? pool?.max ?? null;
        if (max === null || max === undefined) continue;
        const next = Math.max(0, Math.min(max, Math.trunc(value)));
        if (next !== (pool?.value ?? 0)) update[`system.${kind}.value`] = next;
      }
      return Object.keys(update).length ? this.update(update, options) : this;
    }
    const snapshot = this.poolSnapshot();
    const classes = (this.system?.classes ?? []).map(c => ({ ...c, power: { ...c.power }, momentum: { ...c.momentum } }));
    let moved = false;
    for (const { itemId, kind, value } of list) {
      // **ONE ENERGY POOL, WRITTEN ON THE HOLDER AND MIRRORED** (02 §10, D-1723): a write naming any
      // member of the merged pool finds it (`poolHeldBy`), lands on the holder's entry, and the same
      // value is mirrored into every other member's `power.value` below.
      const pool = poolHeldBy(snapshot, itemId, kind);
      const entry = pool ? classes.find(c => c.itemId === pool.itemId) : null;
      if (!entry || !pool) continue;
      // **THE RUNES ARE NEVER WRITTEN HERE** (D-943; the F1 review): the pool is DERIVED off
      // the weapons wielded, and a rune changes only through `documents/runes.mjs`, which
      // gives each rune spent its Runic Power. A write that names it is refused in words and
      // the rest of the batch stands.
      if (pool.kind === "power" && pool.name === RUNES) {
        if (Math.trunc(value) !== (pool.value ?? 0)) ui.notifications?.warn(game.i18n.format("AZEROTH.Runes.Refuse.direct", { name: this.name }));
        continue;
      }
      // **HATRED IS NEVER TRIMMED TO A FALLEN CAP** (the Demon Hunter plan, Q14 left as written): a
      // fall lands as written and a rise stops at the higher of the cap and what is held
      // (`rules/hatred.mjs#hatredWrite`). Every other pool is clamped to its cap, as before.
      const next = keepsAboveCap(pool.name)
        ? hatredWrite({ before: entry[kind]?.value ?? 0, value, cap: pool.max })
        : Math.max(0, Math.min(pool.max, Math.trunc(value)));
      // **RUNIC POWER, ESSENCE, TRIBUTE, VITAE AND HATRED RISE THROUGH A NAMED DOOR ALONE**
      // (`rules/named-gains.mjs#namedGainRefusal`, the ONE refusal the four share; the San'layn and
      // Sovereign plan's C3): a rise this write names no source for - `runicGain`, `essenceGain`,
      // `tributeGain`, `vitaeGain` - is refused in words, and the rest of the batch stands. Vitae is a
      // POWER pool, so the rule is asked whatever the write's kind.
      if (isNamedGainPool(pool.name)) {
        const refusedGain = namedGainRefusal(pool.name, { before: entry[kind]?.value ?? 0, after: next, source: gainSourceFor(pool.name, gainSources), gm: game.user?.isGM === true });
        if (refusedGain) {
          ui.notifications?.warn(game.i18n.format(namedGainWords(pool.name, refusedGain), { name: this.name }));
          continue;
        }
        // **YOU GAIN NO HATRED WHILE UNLEASHED** (02's Demon Unleashed; the Demon Hunter plan's Phase 4a): the one
        // backstop every Hatred door meets, I Have Prepared's own fill, a refund and a GM's hand excepted
        // (`demon-hunter-features.mjs#unleashedGainRefusal`).
        if (pool.name === HATRED && unleashedGainRefusal({ unleashed: this.shape?.kind === "unleashed", source: gainSources.hatredGain, before: entry[kind]?.value ?? 0, after: next })) {
          ui.notifications?.warn(game.i18n.format("AZEROTH.Hatred.Refuse.gain.unleashed", { name: this.name }));
          continue;
        }
      }
      if (next !== (entry[kind]?.value ?? 0)) moved = true;
      entry[kind] = { ...entry[kind], value: next };
      // The mirror: a write that moves only a member's copy still counts as a move, so a stale mirror heals.
      for (const memberId of mirrorMembers(pool)) {
        const member = classes.find(c => c.itemId === memberId);
        if (!member) continue;
        if ((member[kind]?.value ?? 0) !== next) moved = true;
        member[kind] = { ...member[kind], value: next };
      }
    }
    // A write that moves nothing is skipped: the fight's end zeroes twice
    // (before the confirm and again on exit) and the second is silent.
    if (!moved && !Object.keys(extra).length) return this;
    return this.update({ "system.classes": classes, ...extra }, options);
  }

  /**
   * Bring the owned features into step with the classes held, the race and
   * the level (02 §5, §7; D-612, D-620). Every feature a class grants at its
   * level, and the race's trait, exists once as a `feature` item flagged
   * with the item it came from; one above the level, or of a class or race
   * no longer held, is deleted, taken uses and all; one whose table moved
   * under it is restamped, its uses kept (D-621). Called after a class or
   * race lands, after a level changes, after one leaves, and once for every
   * character at world load; idempotent, so a second call changes nothing.
   * Resolves to the counts touched.
   *
   * The mechanics come off `rules/class-features.mjs` at grant time - the
   * pack's class item carries only the book's text.
   */
  async syncClassFeatures() {
    if (this.type !== "character") return this;
    // ONE SYNC AT A TIME. A class landing fires the link update, whose
    // `_onUpdate` syncs, and the grant chain syncs again after the talents;
    // two in flight computed the same creates and the same deletes, and the
    // second delete met items already gone ("Item does not exist" on the
    // server). Queue them on one promise instead.
    const run = () => this._syncClassFeaturesNow().catch(err => console.error("azeroth-rpg | feature sync", err));
    this._featureSync = (this._featureSync ?? Promise.resolve()).then(run, run);
    return this._featureSync;
  }

  async _syncClassFeaturesNow() {
    const level = this.system?.level ?? 1;
    // The talents taken, as `rules/talent-effects.mjs` reads them (D-642).
    // SORTED THE WAY THE TREE READS - branch, then tier, then name - because
    // the item collection's own order is not stable across a re-sync, and it
    // is this order that becomes a feature's `modifiedBy` chips: two talents
    // patching one feature swapped places between renders (2026-09-06).
    const taken = this.items
      .filter(i => i.type === "talent" && (i.system.taken ?? 0) > 0)
      .map(i => ({
        id: i.id, identifier: i.system.identifier, className: i.system.className, branch: i.system.branch,
        // A racial talent's people (02 §5): `RACE_TALENT_EFFECTS` is keyed by it, so a
        // gnome's Overclock and Mekkatorque's Blueprint grant their Uses (B2, door 7).
        race: i.system.race ?? null,
        tier: i.system.tier ?? 0, name: i.name, effect: i.system.effect, taken: i.system.taken, img: i.img
      }))
      .sort((a, b) => String(a.branch ?? "").localeCompare(String(b.branch ?? ""))
        || (a.tier - b.tier)
        || a.name.localeCompare(b.name));
    const wanted = new Map();
    for (const [index, cls] of (this.classItems ?? []).entries()) {
      const at = index === 0 ? level : secondaryLevel(level);
      // The class's features at the level it functions at, held once so the
      // ones that PATCH another can be read off the same list (D-710).
      const granted = featuresFor(cls.system, at);
      for (const f of granted) {
        // A taken talent changes a class feature's stamp (D-642), and a class
        // feature the level has reached may change another (D-710, Totem
        // Mastery on Totem); the feature carries the name of each for it.
        // **AND A HEALING FEATURE TAKES THE `healing` ROWS OF ANY CLASS** (the lead,
        // 2026-10-03, on O-160: *"Yes."*; D-778): Devotion and Holy Guidance on a
        // second class's Mend as on the Paladin's Lay on Hands.
        const patched = withHealingPatches(patchFeature(f, [...featurePatchesFor(granted, f.name), ...patchesFor(taken, cls.name, f.name)], evaluateAmount), taken);
        wanted.set(`${cls.id}/${f.name}`, { cls, f: patched });
      }
    }
    // The race's trait rides the same door (02 SS5, D-620): free, always on,
    // withdrawn with the race. The flag's `classId` is the granting item.
    const race = this.raceItem;
    const trait = race ? raceTraitFor(race.system) : null;
    if (race && trait) wanted.set(`${race.id}/${trait.name}`, { cls: race, f: trait });
    // A taken talent that grants an action grants a feature of its own
    // (D-642), keyed by the talent item as the trait is keyed by the race:
    // withdrawn at rank 0, restamped when the rank moves.
    for (const { talent, feature } of grantsFor(taken)) {
      // A talent's healing Use is a healing feature too (D-778, O-160): Devotion's
      // and Holy Guidance's heal on Swiftmend's, Tranquility's, Guardian Spirit's.
      wanted.set(`${talent.id}/${feature.name}`, {
        cls: { id: talent.id, name: talent.className, img: talent.img }, f: withHealingPatches(feature, taken), talentId: talent.id, rank: feature.rank
      });
    }
    // **EACH GADGET KNOWN IS A FEATURE WITH ITS OWN USE** (04's Gadgeteer: *Each
    // gadget you know may be used once between Short Rests*; the Legacy branches'
    // door 7): the gadgets the Gadgeteer feature's chooser named (`system.known`), as
    // many as the tier and ranks allow (Gadgeteer's 2 + tier, Engineering
    // Upgrade's one a rank), keyed by the granting talent and the gadget, so each
    // keeps its own counter. A rank taken back drops the last named.
    const gadgetsAllowed = gadgetsKnownFor(taken, undefined, { tier: this.system?.tier ?? 1 }).known;
    const gadgetGrants = (item, talentId) => {
      const talent = taken.find(t => t.id === talentId) ?? null;
      return { cls: { id: talentId, name: talent?.className ?? item.system?.className ?? "", img: talent?.img ?? item.img }, talentId, rank: talent?.taken ?? 1 };
    };
    for (const item of this.items.filter(i => i.type === "feature" && i.system?.choice === "gadgets")) {
      const talentId = item.getFlag("azeroth-rpg", "feature")?.talentId ?? null;
      if (!talentId || !taken.some(t => t.id === talentId)) continue;
      const knownList = knownGadgets(item.system?.known ?? [], gadgetsAllowed);
      // Gadgeteer at rank 2's gadget used twice (04; the class talent audit, D-1883).
      const twice = gadgetTwiceKey({ rank: taken.find(t => t.id === talentId)?.taken ?? 1, chosen: item.getFlag("azeroth-rpg", GADGET_TWICE_FLAG) ?? null, known: knownList.map(g => g.key) });
      for (const gadget of knownList) {
        wanted.set(`${talentId}/${gadget.name}`, { ...gadgetGrants(item, talentId), f: gadgetFeature(gadget, { twice: gadget.key === twice }), gadget: gadget.key });
      }
    }
    // **AND THE GADGET MEKKATORQUE'S BLUEPRINT BUILT** (02's gnome: *build one ...
    // gadget from 04-TALENTS ... It works for a day*): one more, keyed by the racial
    // talent, until the Long Rest takes the flag.
    const blueprint = cleanBlueprint(this.getFlag("azeroth-rpg", BLUEPRINT_FLAG));
    const builtGadget = blueprint?.gadget ? gadgetByKey(blueprint.gadget) : null;
    if (builtGadget && blueprint.talentId && taken.some(t => t.id === blueprint.talentId)) {
      const talent = taken.find(t => t.id === blueprint.talentId);
      wanted.set(`${blueprint.talentId}/${builtGadget.name}`, {
        cls: { id: blueprint.talentId, name: talent.className || (talent.race ?? ""), img: talent.img }, f: gadgetFeature(builtGadget),
        talentId: blueprint.talentId, rank: talent.taken ?? 1, gadget: builtGadget.key
      });
    }

    const owned = this.items.filter(i => i.type === "feature");
    const held = new Map();
    const stale = [];
    for (const item of owned) {
      const flag = item.getFlag("azeroth-rpg", "feature") ?? {};
      const key = `${flag.classId}/${flag.name}`;
      if (wanted.has(key) && !held.has(key)) held.set(key, item);
      else stale.push(item.id);
    }
    const creates = [];
    const updates = [];
    // The tier a counter *equal to your tier* is stamped at (D-768): the
    // character's, the one `useFeature` reads for a heal or a damage. A level
    // that moves the tier writes `system.classes`, whose update syncs again, so
    // the counter follows it.
    const tier = this.system?.tier ?? 1;
    for (const [key, { cls, f, talentId = null, rank = null, gadget = null }] of wanted) {
      const stamp = featureStamp(cls, f, { tier, level, int: Math.trunc(Number(this.system?.abilities?.int?.mod)) || 0 });
      const item = held.get(key);
      // A gadget's feature names its gadget (door 7): `useFeature` reads its Use off
      // 04's Gadgets table by that key, never off the talent that granted it.
      const flag = { classId: cls.id, name: f.name, ...(talentId ? { talentId, rank } : {}), ...(gadget ? { gadget } : {}) };
      if (!item) {
        if (talentId && stamp.uses?.per === "arc") {
          const originalUses = this.items.get(talentId)?.system?.uses;
          stamp.uses.value = originalUses?.per === "arc"
            ? Math.max(0, Math.min(stamp.uses.max, Number(originalUses.value) || 0)) : 0;
        }
        creates.push({
          name: f.name, type: "feature", img: cls.img, system: stamp,
          flags: { "azeroth-rpg": { feature: flag } }
        });
        continue;
      }
      // A held feature is restamped when the table moved under it (D-621): a
      // Totem granted before its chooser existed carried no menu and no area,
      // and nothing ever revisited it. The uses in hand MOVE WITH THE MAXIMUM
      // (the review, S4; `rules/uses.mjs#usesAfterRestamp`): Open Hand taken
      // mid-day gives its use now, and taken back leaves no spent use handed
      // out again. A feature newly limited starts full; an unchanged maximum
      // keeps what is in hand, so the world-load restamp writes nothing.
      const current = item.toObject().system ?? {};
      const { uses, ...rest } = stamp;
      const changed = Object.keys(rest).filter(k => !same(current[k], rest[k]));
      const usesChanged = (current.uses?.max ?? 0) !== uses.max || (current.uses?.per ?? null) !== uses.per
        || (current.uses?.refill ?? null) !== (uses.refill ?? null);
      const rankChanged = talentId !== null && (item.getFlag("azeroth-rpg", "feature")?.rank ?? null) !== rank;
      if (!changed.length && !usesChanged && !rankChanged) continue;
      const value = usesChanged
        ? usesAfterRestamp(current.uses ?? {}, uses.max)
        : (current.uses?.value ?? 0);
      updates.push({
        _id: item.id, name: f.name,
        system: { ...Object.fromEntries(changed.map(k => [k, rest[k]])), uses: { value, max: uses.max, per: uses.per, refill: uses.refill ?? null } },
        ...(rankChanged ? { flags: { "azeroth-rpg": { feature: flag } } } : {})
      });
    }

    // "You know Fireball" (D-642): the spell embedded while the talent is
    // taken, flagged with the talent, and withdrawn with it. A spell the
    // character already holds by any other road is left alone.
    // **AND A CLASS FEATURE'S** (02 §7's Unholy Lore: *You know Death Coil. It does not count
    // against your spells known*; O-343): the same embed, flagged with the feature, withdrawn
    // with it (`rules/death-knight.mjs#featureSpellGrants`).
    // ONE grant table (`spellGrantTable`), the one the learning door and the cast cap read to honour
    // a `spellFrom` (the fix runs' review): what the sync embeds is exactly what they honour.
    const known = this.spellGrantTable({ talents: taken }).map(g => ({ talent: { id: g.id }, name: g.name }));
    const fromTalents = this.items.filter(i => i.type === "spell" && i.getFlag("azeroth-rpg", "spellFrom"));
    const staleSpells = fromTalents
      .filter(s => !known.some(k => k.talent.id === s.getFlag("azeroth-rpg", "spellFrom") && k.name === s.name))
      .map(s => s.id);
    for (const { talent, name } of known) {
      if (this.items.some(i => i.type === "spell" && i.name === name)) continue;
      const doc = await spellFromPack(name);
      if (!doc) continue;
      const data = doc.toObject();
      creates.push({ ...data, flags: { ...(data.flags ?? {}), "azeroth-rpg": { ...(data.flags?.["azeroth-rpg"] ?? {}), spellFrom: talent.id } } });
    }

    const doomed = [...stale, ...staleSpells].filter(id => this.items.has(id));
    // **A GADGET SWAPPED OUT AND BACK KEEPS ITS SPENT USE** (04's Gadgeteer; the B2
    // review): what a withdrawn gadget had left is recorded, and a gadget granted again
    // takes it - never a fresh use without a Short Rest (`rules/gadgets.mjs#gadgetSpentSwap`).
    const swap = gadgetSpentSwap(this.getFlag("azeroth-rpg", GADGETS_SPENT_FLAG) ?? {}, {
      withdrawn: doomed.map(id => this.items.get(id)).filter(i => i?.type === "feature" && i.getFlag("azeroth-rpg", "feature")?.gadget)
        .map(i => ({ gadget: i.getFlag("azeroth-rpg", "feature").gadget, value: i.system?.uses?.value ?? 0, max: i.system?.uses?.max ?? 0 })),
      granted: creates.map(c => c.flags?.["azeroth-rpg"]?.feature?.gadget).filter(Boolean)
    });
    for (const c of creates) {
      const key = c.flags?.["azeroth-rpg"]?.feature?.gadget ?? null;
      if (key && key in swap.values && c.system?.uses) c.system = { ...c.system, uses: { ...c.system.uses, value: Math.min(c.system.uses.max ?? 0, swap.values[key]) } };
    }
    if (doomed.length) await this.deleteEmbeddedDocuments("Item", doomed);
    if (updates.length) await this.updateEmbeddedDocuments("Item", updates);
    // A spell a talent or a feature teaches carries `spellFrom` naming it, and passes 07 §9's door (the
    // learning door's closed bypass list; `AzerothItem._preCreateOperation`).
    if (creates.length) await this.createEmbeddedDocuments("Item", creates, { azerothLearn: "bypass" });
    // Replaced whole: a flag object is merged, and a gadget's record that went must go.
    if (swap.changed && this.isOwner) {
      await this.update({ [`flags.azeroth-rpg.${GADGETS_SPENT_FLAG}`]: foundry.data.operators.ForcedReplacement.create(swap.record) });
    }
    // **THE SOVEREIGN'S CLAWS GO WITH BLOOD-FORGED CLAWS** (02 §7; the plan's C1; D-1164):
    // embedded unequipped with the feature, deleted with it, through the one key the
    // item's batch seam lets past.
    await this._syncClaws([...wanted.values()].some(({ f }) => f?.name === CLAWS_FEATURE))
      .catch(err => console.warn("azeroth-rpg | claws sync", err));
    // The creatures bound to this character take its talents' effects (D-643),
    // and the character its own passives (D-648).
    await this.syncBound().catch(err => console.error("azeroth-rpg | bound sync", err));
    await this.syncTalentEffects().catch(err => console.error("azeroth-rpg | talent effects", err));
    return { created: creates.length, updated: updates.length, deleted: doomed.length };
  }

  /**
   * **THE CLAWS' ONE WRITER** (02 §7's Blood-Forged Claws; the plan's C1; D-1164): what
   * `rules/claws.mjs#clawsDue` owes, written with `azerothClaws: "sync"` - the only key
   * `AzerothItem`'s batch seam lets a create or a delete of the claws through on. The
   * claws come off the weapons pack's `sovereign-claws`, unequipped and in no container;
   * where the pack lacks them nothing is made and the console says why.
   *
   * @param {boolean} holdsFeature  Blood-Forged Claws stands after this sync
   */
  async _syncClaws(holdsFeature) {
    if (this.type !== "character" || !this.isOwner) return;
    const due = clawsDue({ holdsFeature, items: this.items });
    const remove = due.remove.filter(id => this.items.has(id));
    if (remove.length) await this.deleteEmbeddedDocuments("Item", remove, { azerothClaws: CLAWS_SYNC });
    if (!due.create) return;
    const pack = game.packs?.get("azeroth-rpg.weapons") ?? null;
    const index = pack ? await pack.getIndex({ fields: ["system.identifier"] }) : [];
    const entry = [...index].find(e => e.system?.identifier === CLAWS_ID) ?? null;
    const doc = entry ? await pack.getDocument(entry._id) : null;
    if (!doc) {
      console.warn(`azeroth-rpg | ${this.name} holds ${CLAWS_FEATURE}, and the weapons pack holds no ${CLAWS_ID}`);
      return;
    }
    // Asked again after the await: a second sync may have made them meanwhile.
    if (this.items.some(i => i.type === "weapon" && isClawsItem(i))) return;
    await this.createEmbeddedDocuments("Item", [clawsCreateData(doc.toObject())], { azerothClaws: CLAWS_SYNC, azerothIdentify: "known" });
  }

  /**
   * **THE CLAW FACTS** (04's Ravenous; the plan's C16; D-1166): what
   * `initiative.mjs#offHandRolls` and `#freeOffHand` read - the claws equipped in the off
   * hand, Blooded Claws' and Raking Claws' ranks by identifier, Red Feast's form off the
   * shape worn, the tier, and the free claw attacks spent since the last rest
   * (`CLAW_USES_FLAG`).
   *
   * @returns {{claws: boolean, bloodedClawsRank: number, rakingClawsRank: number, redFeastForm: boolean, tier: number, spent: number}}
   */
  clawFacts() {
    const ready = this.readyWeapons?.() ?? [];
    return clawFactsFrom({
      talents: this.takenTalents?.() ?? [],
      // `readyWeapons` is what is in hand (D-769): equipped, and never melded.
      claws: ready.some(w => w?.type === "weapon" && isClawsItem(w)),
      shapeKind: this.shape?.kind ?? null,
      tier: this.system?.tier ?? 1,
      spent: this.getFlag?.("azeroth-rpg", CLAW_USES_FLAG) ?? 0
    });
  }

  /**
   * The owner-side effects the taken talents lay on this character (D-648):
   * one Active Effect a talent, flagged by its identifier, diffed against
   * what stands - created, updated when the rank or the state moved, deleted
   * when untaken or its state gone. The state is what the sync can read: a
   * Shapeshift form worn, a shield equipped.
   *
   * **ONE RUN AT A TIME** (D-768), `syncClassFeatures`' own shape: a shield
   * created in hand, a talent's rank and a form all start one without waiting,
   * and two in flight together each found nothing held and each created the
   * effect. Each run reads the actor when its turn comes, so the second sees
   * what the first wrote. The queue's tail never rejects; the caller's own
   * promise carries the run's error.
   */
  syncTalentEffects() {
    if (this.type !== "character") return Promise.resolve({ updated: 0 });
    const run = this._talentEffectsSync ?? Promise.resolve();
    const next = run.then(() => this._syncTalentEffectsNow());
    this._talentEffectsSync = next.catch(() => {});
    return next;
  }

  async _syncTalentEffectsNow() {
    const taken = this.items
      .filter(i => i.type === "talent" && (i.system.taken ?? 0) > 0)
      // `race` rides along because a racial talent carries no class and is
      // looked up under its people instead (D-675, Pack Hobgoblin).
      .map(i => ({ id: i.id, identifier: i.system.identifier, className: i.system.className, race: i.system.race, name: i.name, taken: i.system.taken, img: i.img }));
    const shield = this.items.some(i => isEquippedShield(i));
    // *While in a Shapeshift form* (Thick Hide): the Avatar is not one (D-251).
    const shape = this.shape;
    const form = shape?.kind === "shapeshift";
    // **A SHIELD MELDS INTO A SHAPE** (D-769; the lead: *"Melds; Signatures
    // count"*), so Shield of Faith has no shield to stand on in one.
    // *While a totem of yours stands* (04's Earthen Shield, D-774): a totem bound
    // to this character (D-643). MY READING, for the lead: a bound totem stands,
    // its token placed or not - the bond is the totem, the token the board's.
    const totem = boundOf(this, "totem").length > 0;
    // *While you wear no armor in your Chest slot*, *While you wield a two-handed
    // weapon* (04's Wolf's Pace, Blade Circle; the Legacy branches' door 15): what is
    // worn and held, measured by the one law - melded weapons wielded by nobody.
    const wield = wieldFacts([...this.items], { melded: Boolean(shape && meldsGear(shape.kind)) });
    const desired = passivesFor(taken, { form, shield: shield && !(shape && meldsGear(shape.kind)), totem, wield, tier: this.system?.tier ?? 1 });
    // *While you control a Bound Demon* (04's Demonic Knowledge; the class talent audit, D-1891): the
    // rows gated on a demon bound to this character, laid beside the rest while one is held; the
    // bind and the release re-run this sync (`documents/bound.mjs#syncBoundFor`).
    if (boundOf(this, "demon").length > 0) {
      desired.push(...passivesFor(taken, { boundDemon: true, tier: this.system?.tier ?? 1 }).filter(r => talentEffect(r.talent.className, r.identifier, r.talent.race ?? null)?.passive?.when === "boundDemon"));
    }
    const held = this.effects
      .filter(e => e.getFlag("azeroth-rpg", "talentEffect"))
      .map(e => ({ id: e.id, identifier: e.getFlag("azeroth-rpg", "talentEffect"), changes: e.system?.changes ?? [] }));
    // `rules/talent-effects.mjs#talentEffectDiff` is the judgement, and it
    // deletes every duplicate of an identifier but the one it keeps (D-768).
    const { creates, updates, deletes } = talentEffectDiff(desired, held);
    const data = d => ({
      name: d.name, img: d.talent.img ?? "icons/svg/aura.svg", origin: this.uuid,
      system: { changes: d.changes },
      flags: { "azeroth-rpg": { talentEffect: d.identifier } }
    });
    const doomed = deletes.filter(id => this.effects.has(id));
    if (doomed.length) await this.deleteEmbeddedDocuments("ActiveEffect", doomed);
    if (updates.length) await this.updateEmbeddedDocuments("ActiveEffect", updates.map(u => ({ _id: u.id, ...data(u.row) })));
    if (creates.length) await this.createEmbeddedDocuments("ActiveEffect", creates.map(data));
    return { updated: creates.length + updates.length + doomed.length };
  }

  /** Lay this character's talents on every creature bound to it (D-643). */
  async syncBound(options = {}) {
    if (this.type !== "character") return { updated: 0 };
    return syncBoundFor(this, options);
  }

  /**
   * A talent's rank moved (D-642): the features it grants or changes are
   * restamped, on the client that made the change. Nothing else re-synced
   * on a talent before this; the class array's update was the only door.
   */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if (parent === this && collection === "effects" && this.type === "character" && this.isOwner
      && game.user.id === userId && documents.some((d, i) => d.flags?.["azeroth-rpg"]?.immuneTo?.conditions?.includes("slowed")
        || foundry.utils.hasProperty(changes[i] ?? {}, "flags.azeroth-rpg.immuneTo"))) {
      this.syncFatigue().catch(err => console.warn("azeroth-rpg | fatigue after immunity update", err));
    }
    if (this.type !== "character" || collection !== "items" || game.user.id !== userId) return;
    const moved = documents.some((doc, i) => doc.type === "talent" && foundry.utils.hasProperty(changes[i] ?? {}, "system.taken"));
    if (moved) this.syncClassFeatures();
    // A shield equipped or set down moves Shield of Faith (D-648). **And a suit or
    // a weapon taken up or set down moves a wield-gated passive** (04's Wolf's Pace,
    // Blade Circle; the Legacy branches' door 15): the hand it is in, the type it is.
    const worn = documents.some((doc, i) => (doc.type === "armor" && (foundry.utils.hasProperty(changes[i] ?? {}, "system.equipped") || foundry.utils.hasProperty(changes[i] ?? {}, "system.shield")))
      || (doc.type === "weapon" && ["system.equipped", "system.offHand", "system.weaponType"].some(k => foundry.utils.hasProperty(changes[i] ?? {}, k))));
    if (worn) this.syncTalentEffects().catch(err => console.error("azeroth-rpg | talent effects", err));
    // ONE THING IN EACH SLOT, WHATEVER DOOR IT CAME THROUGH (08 §11, D-686).
    // The Gear tab's button asks `displacedBy` before it writes, and the item
    // sheet's Equipped checkbox does not - it submits through the ordinary
    // form path - so two rings could be worn from their own sheets while the
    // Overview tab's Ring tile drew only the first. A rule enforced at one
    // door is enforced nowhere: this is the same law on the actor, so a macro
    // and an API write meet it too. Unequipping displaces nothing, so it
    // cannot recur.
    const equipped = documents.filter((doc, i) => foundry.utils.hasProperty(changes[i] ?? {}, "system.equipped") && doc.system?.equipped === true);
    if (equipped.length) this.#displaceWorn(equipped);
  }

  /**
   * Put away whatever the newly equipped things displace (D-686).
   *
   * Batched into one update, and quiet where the door that wrote already
   * cleared them - `displacedBy` then returns nothing and no write is made.
   */
  #displaceWorn(equipped) {
    // Two things equipped in ONE batch can want the same slot - a macro, or a
    // creator handing over a kit. The later one wins, so the earlier is
    // displaced by it rather than both surviving each other's exclusion.
    const rank = new Map(equipped.map((item, i) => [item.id, i]));
    const put = new Map();
    for (const [i, item] of equipped.entries()) {
      for (const other of displacedBy(item, this.items)) {
        const theirs = rank.get(other.id);
        if (theirs !== undefined && theirs > i) continue;
        put.set(other.id, { _id: other.id, "system.equipped": false });
      }
    }
    if (!put.size) return;
    this.updateEmbeddedDocuments("Item", [...put.values()])
      .catch(err => console.error("azeroth-rpg | worn slots", err));
  }

  /**
   * Keep the statuses in step with the Fatigue track (05 SS9, A1; D-624):
   * Fatigued while any point is on the track, Slowed from 4 - flagged as the
   * track's own, so a Slowed from elsewhere survives the track falling - and
   * at 6 the collapse: Health 0 and Prone (the lead's ruling, 2026-09-03).
   * Idempotent; runs after the track moves and once for every character at
   * world load. Resolves to the state read.
   */
  async syncFatigue({ notify = false } = {}) {
    if (this.type !== "character") return null;
    const state = fatigueState(this.system?.fatigue ?? 0);
    const has = id => this.statuses?.has(id) ?? false;
    if (state.fatigued !== has("fatigued")) await this.toggleStatusEffect("fatigued", { active: state.fatigued });
    const own = this.effects.find(e => e.statuses?.has("slowed") && e.getFlag("azeroth-rpg", "fromFatigue"));
    const slowed = state.slowed && !(this.system?.conditionImmunities ?? []).includes("slowed");
    // A carrier's Slowed (Frost Fever) is not the condition (D-997): the Fatigue lays its own
    // beside it, so the Slowed outlasts the disease while the track still says so.
    if (slowed && !own && !conditionEffectOf(this.effects, "slowed")) {
      await this.toggleStatusEffect("slowed", { active: true, ownEffect: true });
      const made = conditionEffectOf(this.effects, "slowed");
      if (made) await made.setFlag("azeroth-rpg", "fromFatigue", true);
    } else if (!slowed && own) {
      await own.delete();
    }
    if (state.collapse) {
      if ((this.system?.health?.value ?? 0) > 0) await this.update({ "system.health.value": 0 });
      if (!has("prone")) await this.toggleStatusEffect("prone", { active: true });
      if (notify) ui.notifications?.warn(game.i18n.format("AZEROTH.Sheet.Collapsed", { name: this.name }));
    }
    return state;
  }
  /**
   * What prices a maneuver (D-626): the features held, the talents taken and
   * the grants worn, as plain rows for `rules/maneuvers.mjs`, and whether
   * Charge has a use left.
   */
  maneuverContext() {
    const features = this.items.filter(i => i.type === "feature").map(i => ({ name: i.name, maneuverPrice: i.system?.maneuverPrice ?? null }));
    const talents = this.items.filter(i => i.type === "talent" && (i.system?.taken ?? 0) > 0)
      .map(i => ({ name: i.name, taken: i.system.taken }));
    const grants = this.items.filter(i => i.system?.equipped === true).flatMap(i => grantsOn(i));
    const charge = this.items.find(i => i.type === "feature" && i.name === "Charge");
    return { features, talents, grants, chargeAvailable: Boolean(charge?.system?.uses?.per && charge.system.available) };
  }
  /**
   * Does this actor attack twice each time it Attacks (02 §6, 14 §1)?
   *
   * A CHARACTER holds a feature that grants it — level 5 for the Warrior,
   * Paladin, Hunter and Rogue, and the Druid in a Shapeshift form (D-160,
   * D-612).
   *
   * A CREATURE has no `level` and no feature, so it earns it by saying so:
   * an ability, a Boss Action or a trait named for it, which is how 14 would
   * write one, **or the flag a GM sets from the NPC sheet** (D-704's L1). The
   * name-matching has been here since 2026-09-07 and **matches nothing in the
   * chapter**: no block in 14 carries Extra Attack, by the lead's own call, so
   * the GM's checkbox is what fills it.
   *
   * **THE PATTERN COULD NOT HAVE MATCHED ANYTHING EITHER** (found 2026-09-11).
   * The committed regex read `/<BS>extra attack<BS>|<BS>multiattack<BS>/i` —
   * four literal backspace bytes where `\b` had been written, the collapse
   * CLAUDE.md warns a heredoc makes — so it demanded a control character before
   * the word and was false for every name in the game. Written plainly here;
   * no ability name in 14 needs a word boundary to be read correctly.
   *
   * This used to live on `AzerothCombatant#_hasExtraAttack` alone, where only
   * the turn budget could read it; the attack door needs the same answer to
   * know how many Tests one Attack rolls, and a second reading of the same
   * question is how two of them come to disagree.
   */
  get hasExtraAttack() {
    // Cause Insanity grants the ordinary two-roll Attack while its timed
    // carrier is active. A boolean keeps it from stacking past Extra Attack.
    if (hasCauseInsanity(this)) return true;
    if (hasReaverEnrage(this, game.time?.worldTime)) return true;
    if (hasGhoulEnrage(this, game.time?.worldTime)) return true;
    if (hasPredatoryEnrage(this, game.time?.worldTime)) return true;
    if (this.type === "character") {
      // **A DRUID'S IS IN A SHAPESHIFT FORM ALONE** (02 §7: *while in a
      // Shapeshift form*; D-769). It was an ungated passive, so a Druid in no
      // form at all rolled twice. The feature names the kind it needs.
      const kind = this.shape?.kind ?? null;
      return this.items.some(i => i.type === "feature" && i.system?.extraAttack === true
        && (!i.system.extraAttackIn || i.system.extraAttackIn === kind));
    }
    if (this.getFlag?.("azeroth-rpg", "extraAttack") === true) return true;
    const named = /extra attack|multiattack/i;
    const rows = [...(this.system?.creatureAbilities ?? []), ...(this.system?.bossActions ?? [])];
    if (rows.some(a => named.test(String(a?.name ?? "")))) return true;
    return (this.system?.traits ?? []).some(t => named.test(String(t)));
  }

  /**
   * Restore the uses of every limited thing a rest or an encounter's end
   * refreshes (`rules/uses.mjs#refreshes`), whatever its type: a class
   * feature, a racial trait, a talent (D-612, D-623). Resolves to the names
   * restored, which the rest card prints.
   * @param {"short"|"long"|"encounter"} event
   * @returns {Promise<string[]>}
   */
  async resetUses(event) {
    // **WHAT A LEGENDARY ARMED FOR ITS NEXT USE ENDS AT A REST** (D-913, F12 and the
    // review's LOW): Brood Breath's school (`breathSchool`) and Thunderaan's Fury's
    // widened arc (`arcWiden`, `effects/legendary-doors.mjs`' flags) are struck at a Short
    // Rest and a Long Rest alike.
    if ((event === "short" || event === "long") && this.isOwner) {
      for (const key of ["breathSchool", "arcWiden"]) if (this.getFlag("azeroth-rpg", key)) await this.unsetFlag("azeroth-rpg", key);
      // 04's Blooded Claws: *you regain the uses when you finish a Short or Long Rest* (D-1166).
      if (this.getFlag("azeroth-rpg", CLAW_USES_FLAG)) await this.unsetFlag("azeroth-rpg", CLAW_USES_FLAG);
    }
    await restoreApprovedSignatureUses(this, event);
    await restoreSpellUses(this, event);
    const due = this.items.filter(i => i.system?.uses?.per && refreshes(i.system.uses.per, event)
      && i.system.uses.value < i.system.uses.max);
    const updates = due.map(i => ({ _id: i.id, "system.uses.value": i.system.uses.max }));
    // The rest's card is public: a thing a player is kept from is named by its kind (D-1435).
    const names = due.map(i => cardName(i));
    // **ONE USE BACK AT A SHORTER REST** (`uses.refill`; Mercy of Uther, D-1868): a thing that
    // refills whole at a Long Rest and gives one back at each Short Rest (`rules/uses.mjs#refillAfter`).
    for (const i of this.items) {
      if (due.includes(i)) continue;
      const back = refillAfter(i.system?.uses ?? null, event);
      if (back === null) continue;
      updates.push({ _id: i.id, "system.uses.value": back });
      names.push(cardName(i));
    }
    // An item's castings refresh on the same clock (D-633).
    for (const item of this.items) {
      const spells = Array.isArray(item.system?.spells) ? item.system.spells : [];
      const stale = spells.filter(s => s.uses?.per && refreshes(s.uses.per, event) && (s.uses.value ?? 0) < (s.uses.max ?? 0));
      if (!stale.length) continue;
      const next = foundry.utils.deepClone(item.system.toObject().spells).map(s =>
        (s.uses?.per && refreshes(s.uses.per, event)) ? { ...s, uses: { ...s.uses, value: s.uses.max } } : s);
      updates.push({ _id: item.id, "system.spells": next });
      // A hidden thing's spells are hidden too (D-1435): the card names its kind alone.
      names.push(...(isUnidentified(item) ? [cardName(item)] : stale.map(s => `${s.name} (${item.name})`)));
    }
    // **AND A SIGNATURE'S OWN USES** (08 §20, D-692). They live at
    // `system.signatureEffect.use.uses`, which neither pass above walks -
    // `i.system.uses` is a feature's, a talent's and a piece of gear's - so a
    // pressed Signature would have spent its use and never got it back, and
    // every unit test would have passed anyway (D-681).
    //
    // The write is a DOTTED PATH, which reaches `migrateData` as a partial
    // update: `cleanSignature` keeps only the keys it is handed and
    // `cleanSignatureUse` does the same one level deeper, so the action, the
    // note and everything else the update does not name survive it (D-671).
    for (const item of this.items) {
      const uses = item.system?.signatureEffect?.use?.uses ?? null;
      if (!uses?.per || !refreshes(uses.per, event)) continue;
      if ((uses.value ?? 0) >= (uses.max ?? 0)) continue;
      updates.push({ _id: item.id, "system.signatureEffect.use.uses.value": uses.max });
      names.push(cardName(item));
    }
    // **AND A LEGENDARY'S OTHER BUTTONS** (08 §20: *counts its uses apart from
    // the item's other Signatures*; D-910). Each at its own dotted path under
    // `presses`, which `cleanSignature` cleans present-key at every depth, so the
    // rest of the entry survives the write (D-671).
    for (const item of this.items) {
      const presses = item.system?.signatureEffect?.presses ?? null;
      if (!presses || typeof presses !== "object") continue;
      for (const [key, entry] of Object.entries(presses)) {
        const uses = entry?.uses ?? null;
        if (!uses?.per || !refreshes(uses.per, event)) continue;
        if ((uses.value ?? 0) >= (uses.max ?? 0)) continue;
        updates.push({ _id: item.id, [`system.signatureEffect.presses.${key}.uses.value`]: uses.max });
        names.push(isUnidentified(item) ? cardName(item) : game.i18n.format("AZEROTH.Signature.RunName", { name: item.name, label: entry.label ?? key }));
      }
    }
    // **A FREE CAST COMES BACK WITH ITS REST** (the Chromatic Champion plan: *"once per
    // short rest"*): the spent names on each talent item, emptied where the row's rest
    // is this one (`rules/free-casts.mjs#freeCastRefills`).
    const freeTalents = this.items.filter(i => i.type === "talent").map(i => ({
      id: i.id, identifier: i.system?.identifier, className: i.system?.className, race: i.system?.race ?? null,
      taken: i.system?.taken ?? 0, spent: i.getFlag?.("azeroth-rpg", FREE_CAST_FLAG) ?? []
    }));
    for (const id of freeCastRefills(freeTalents, event, refreshes)) {
      updates.push({ _id: id, [`flags.azeroth-rpg.${FREE_CAST_FLAG}`]: [] });
      names.push(this.items.get(id)?.name ?? "");
    }
    // **AN OVERCLOCK ENDS WITH THE ENCOUNTER, OR AT A REST** (02's gnome; the B2 review):
    // the mark Overclock leaves on a gadget's feature (`rules/gadgets.mjs#OVERCLOCK_FLAG`)
    // comes off unused - it is the next Use's, and *once per encounter* is its clock.
    if (OVERCLOCK_ENDS.includes(event)) {
      for (const item of this.items) {
        if (!item.flags?.["azeroth-rpg"]?.[OVERCLOCK_FLAG]) continue;
        updates.push({ _id: item.id, [`flags.azeroth-rpg.${OVERCLOCK_FLAG}`]: foundry.data.operators.ForcedDeletion.create() });
      }
    }
    // ONE ENTRY PER DOCUMENT. A piece of gear can carry both a `use` of its
    // own and a Signature, and core takes the last of two rows naming the same
    // `_id` - so the second refill would have silently discarded the first.
    const merged = [...updates.reduce((map, row) => {
      map.set(row._id, { ...(map.get(row._id) ?? {}), ...row });
      return map;
    }, new Map()).values()];
    if (merged.length) await this.updateEmbeddedDocuments("Item", merged);
    // A rest refreshes every gadget's use, so the record a swap kept goes with it (the B2 review).
    if ((event === "short" || event === "long") && this.getFlag("azeroth-rpg", GADGETS_SPENT_FLAG) !== undefined && this.isOwner) {
      await this.unsetFlag("azeroth-rpg", GADGETS_SPENT_FLAG);
    }
    return names;
  }

  /** The older name for `resetUses`, kept for the combat document and the tests. */
  async resetFeatureUses(event) {
    await this.resetUses(event);
    return this;
  }

  /**
   * Delete every Sundered effect on this actor (05 SS11: a Sunder holds "until
   * they take a Short Rest"; D-623). Resolves to how many went.
   */
  async clearSundered() {
    const ids = this.effects.filter(e => e.getFlag("azeroth-rpg", "sundered")).map(e => e.id);
    if (ids.length) await this.deleteEmbeddedDocuments("ActiveEffect", ids);
    return ids.length;
  }

  /**
   * **THE LEDGER ROW A BLOW ADDS** (07 §12's Mending Sands and Sands Run Back: *the damage it
   * has taken since the start of your last turn*; D-867): the update keys `adjustHealth`
   * writes beside the Health, in the same write.
   *
   * @param {number} amount  what the write took of Health and temporary Health
   * @returns {object}
   */
  _damageLedger(amount) {
    const fight = this.activeFight?.() ?? null;
    const out = { [`flags.azeroth-rpg.${LEDGER_FLAG}`]: appendLedger(this.getFlag("azeroth-rpg", LEDGER_FLAG) ?? [], amount,
      ledgerStamp({ combatId: fight?.started ? fight.id : null, round: fight?.round, turn: fight?.turn, time: game.time?.worldTime ?? 0 })) };
    // **WHEN ITS BLOOD WAS LAST SPILLED** (07 §17's Taste of Lineage: *A creature's blood, spilled within the
    // last day*; D-1246): the world time, in the same write as the Health.
    if (Number(amount) > 0) out[`flags.azeroth-rpg.${BLED_AT_FLAG}`] = game.time?.worldTime ?? 0;
    // **02's RECALL COUNTS WHAT IS TAKEN SINCE ITS MARK** (*regain Health equal to the damage you
    // have taken since you marked it*; stage 2b): the ledger keeps two minutes, the mark ten,
    // so the mark keeps its own running total, in the same write as the Health.
    const mark = this.getFlag("azeroth-rpg", RECALL_FLAG) ?? null;
    if (mark) out[`flags.azeroth-rpg.${RECALL_FLAG}`] = recallCounts(mark, amount, game.time?.worldTime ?? 0);
    return out;
  }

  /**
   * **THE HALF DILATION PUT OFF, LANDED** (D-866; the 2a review, M1): not reduced again and
   * never put off a second time, but damage all the same - so through `takeStraightDamage`,
   * where 05's temporary Health takes it first, Mana Shield pays for it and 07's Aegis floor
   * and the one hold at 1 keep the creature at 1, as for any damage no Armor or Ward meets.
   *
   * @param {number} amount
   */
  async _landPutOff(amount) {
    const n = Math.max(0, Math.trunc(Number(amount)) || 0);
    if (!n) return this;
    return this.takeStraightDamage(n);
  }

  /**
   * **07 §12's DILATION, AT THE ONE DAMAGE DOOR** (D-866): *it takes half, rounded up, and
   * the other half at the start of its next turn*. In a started fight the half put off waits
   * on the creature's list, landed by `effects/deferred-damage.mjs#landDeferred` at its
   * turn's start through `_landPutOff`, which never puts it off a second time; out of a
   * fight it lands with the blow. **Answers the split and writes nothing** (the 2a review,
   * M2): the half put off is written by `_writeDeferred` just before the Health is, so a
   * blow refused after this point - a harm prevented, a dispersal, Ice Block - leaves no
   * row behind it.
   *
   * @param {number} amount
   * @param {{type?: string|null, by?: Actor|null}} o
   * @returns {{now: number, row: object|null}}
   */
  _deferBlow(amount, { type = null, by = null } = {}) {
    const deferral = deferralOf(this.effects ?? []);
    const fight = deferral ? (this.activeFight?.() ?? null) : null;
    if (!deferral || !fight?.started) return { now: amount, row: null };
    const split = splitDeferred(amount, deferral);
    if (split.later < 1) return { now: amount, row: null };
    return { now: split.now, row: { amount: split.later, type, by: by?.uuid ?? null, source: deferral.source ?? "" } };
  }

  /** The half put off, written on the creature's list (D-866), and said in words. */
  async _writeDeferred(row, now = 0) {
    if (!row || !(row.amount > 0)) return;
    await this.setFlag("azeroth-rpg", DEFERRED_FLAG, appendDeferred(this.getFlag("azeroth-rpg", DEFERRED_FLAG) ?? [], row));
    ui.notifications?.info(game.i18n.format("AZEROTH.Deferred.Put", { name: this.name, now, later: row.amount, source: row.source ?? "" }));
  }

  /**
   * Delete a Decay that lasts until a Short Rest (07's Hour of Dust: *Decay 2, which
   * lasts until it finishes a Short Rest rather than 1 minute*; D-865). A minute's
   * Decay ends by its own span. Both rests finish one. Resolves to how many went.
   */

  /** 02's Suspend held on this creature now (`effects/chronomancer.mjs#suspendedNow`; stage 2b). */
  _suspended() {
    return suspendedNow(this);
  }

  /** 04's Withering Hours on a heal this creature takes (`witheringHalves`; stage 2b). */
  _withered(amount) {
    return witheringHalves(this, amount);
  }

  /** 04's Shared Hours for the giver of a heal this creature took (`sharedHours`; stage 2b). */
  _sharedHoursFrom(giver) {
    return sharedHours(giver, this, "health");
  }

  /**
   * **END WHAT LASTS UNTIL THIS REST** (D-1962): every effect whose
   * `flags.azeroth-rpg.restEnds` this rest ends (`rules/rest-ends.mjs#endsAtRest`),
   * Well Fed among them. Answers how many went.
   *
   * @param {"short"|"long"} kind
   */
  async clearRestEnds(kind) {
    const ids = this.effects.filter(e => endsAtRest(e, kind)).map(e => e.id);
    if (ids.length) await this.deleteEmbeddedDocuments("ActiveEffect", ids);
    return ids.length;
  }

  async clearRestDecay() {
    const ids = this.effects.filter(e => e.getFlag("azeroth-rpg", "decay")?.until === "shortRest").map(e => e.id);
    if (ids.length) await this.deleteEmbeddedDocuments("ActiveEffect", ids);
    return ids.length;
  }

  /**
   * **PAY A COST IN VITAE** (02 §7: *When a cost is more than the Vitae you hold, spend all your Vitae and
   * pay the rest in Health, 1 Health for each 1 Vitae*; the San'layn and Sovereign plan's V4): the one
   * door a feature, a talent and an upkeep pay Vitae through, inside this actor's pool queue, in one
   * update. Judge first (`effects/sovereign-core.mjs#vitaeRefusal`).
   *
   * @param {number} amount
   * @param {{extra?: object, label?: string}} [o]
   */
  payVitae(amount, o = {}) {
    return sovereignPayVitae(this, amount, o);
  }

  /**
   * **FEED** (02 §7's The Blood Royal; the plan's F2): the one feeding door every talent and spell that
   * feeds calls - Latch On's free feeding, Drink Deep, Last Draught, Embrace of the Vampyr, the Blood
   * Monarch's claw hit. `{mode, free, anyDay, vitaeFactor, flat, source, way}`: see
   * `effects/sovereign-core.mjs#feedOn`.
   *
   * @param {Actor|Token|TokenDocument|object} target
   * @param {object} [o]
   */
  feedOn(target, o = {}) {
    return sovereignFeedOn(this, target, o);
  }

  /**
   * **MARK A CREATURE AS YOUR PREY** (02 §7's Hunt Mortal, Blood-Forged Claws, Unending Pursuit; the plan's
   * C4). `way` is `hunt`, `claws` or `pursuit`.
   */
  markPrey(target, { way = "hunt" } = {}) {
    return sovereignMarkPrey(this, target, { way });
  }

  /** The prey mark while it stands (`rules/prey.mjs#preyActive`), or null. */
  preyMark() {
    return preyOf(this);
  }

  /** Whether a creature (an actor, a token or a snapshot row) is this Sovereign's prey. */
  isPrey(target) {
    return sovereignIsPrey(this, target);
  }

  /**
   * **THE FEEDINGS SINCE THE LAST REST** (the plan's B.11 F4 and C-14; D-1143): the units of blood
   * a San'layn has already drunk for its next rest - Open Vein's living failure, and every feeding
   * of the Sovereign's. Read by both rest doors before they ask for a vial.
   * @returns {number}
   */
  get bloodSinceRest() {
    return bloodSinceRestOf(this.getFlag?.("azeroth-rpg", BLOOD_SINCE_REST_FLAG));
  }

  /**
   * **THE ONE WRITER OF THAT COUNT** (D-1143): `n` units more, on this character's own actor. The
   * Sovereign's feeding door and Open Vein call it; a satisfied rest clears it.
   * @param {number} [n]
   * @returns {Promise<number>} the count after
   */
  async addBloodSinceRest(n = 1) {
    const add = Math.max(0, Math.trunc(Number(n)) || 0);
    if (!add || this.type !== "character") return this.bloodSinceRest;
    const next = this.bloodSinceRest + add;
    await this.setFlag("azeroth-rpg", BLOOD_SINCE_REST_FLAG, next);
    return next;
  }

  /**
   * **WHAT A REST'S BLOOD IS, JUDGED WHOLE BEFORE ANYTHING IS SPENT** (02 §5, *Your hunger.*;
   * D-1141 to D-1144). Writes nothing. Answers `{fed, refusal}` and, for a San'layn, the plan.
   *
   * - Somebody who does not rest on blood and names a vial or a fresh unit is refused in words.
   * - A San'layn whose Short Rest names food, a drink or a shared feast is refused in words (*Food
   *   and drink restore nothing on your rests*), and so is a pick that is not a Blood vial it carries.
   * - A Short Rest with no unit at all is refused (`NeedsBlood`), as a meal-less one is.
   * - A Long Rest is never refused for want of blood: the plan comes back unmet, and the door
   *   rests `withheld`.
   *
   * @param {"short"|"long"} kind
   * @param {{food?: *, drink?: *, feast?: *, blood?: *, fresh?: number|boolean}} picks
   */
  _judgeRestBlood(kind, { food = null, drink = null, feast = null, blood = null, fresh = 0 } = {}) {
    const name = this.name;
    const fed = this.system?.bloodFed === true;
    const named = blood === null || blood === undefined || blood === "" ? [] : (Array.isArray(blood) ? blood : [blood]);
    const freshUnits = fresh === true ? 1 : Math.max(0, Math.trunc(Number(fresh)) || 0);
    if (!fed) {
      if (named.length || freshUnits) return { fed: false, refusal: game.i18n.format("AZEROTH.Rest.NotBloodFed", { name }) };
      return { fed: false, refusal: null };
    }
    if (kind === "short" && (food || drink || feast)) {
      return { fed: true, refusal: game.i18n.format("AZEROTH.Rest.BloodNotFood", { name }) };
    }
    const stacks = [];
    for (const given of named) {
      const id = given && typeof given === "object" ? given.id : given;
      const item = id ? (this.items.get(id) ?? null) : null;
      if (!item || !isProvision(item, "blood")) {
        return { fed: true, refusal: game.i18n.format("AZEROTH.Rest.NotBlood", { name: item ? shownName(item) : (given?.name ?? String(given)) }) };
      }
      if (!stacks.some(s => s.itemId === item.id)) stacks.push({ itemId: item.id, quantity: item.system?.quantity ?? 1 });
    }
    let setting = 1;
    if (kind === "long") {
      try { setting = game.settings.get("azeroth-rpg", "bloodLongRest"); } catch { setting = undefined; }
    }
    const needed = bloodNeeded(kind, setting);
    const plan = bloodRestPlan({ needed, sinceRest: this.bloodSinceRest, fresh: freshUnits, vials: vialUnits(stacks) });
    if (kind === "short" && !plan.met) return { fed: true, refusal: game.i18n.format("AZEROTH.Rest.NeedsBlood", { name }) };
    return { fed: true, kind, plan, stacks, refusal: null };
  }

  /**
   * **SPEND WHAT A MET PLAN NEEDS** (D-1144): the vials it still needs after the count and the
   * fresh units, each through `consumables.mjs#spendOne` (`useGear`'s own mark-off), then the count
   * cleared. An unmet plan spends nothing (all or nothing). Answers what the card prints.
   *
   * @param {{plan: object, stacks: object[]}} judgement  `_judgeRestBlood`'s answer
   * @returns {Promise<{needed: number, met: boolean, vials: string[], fresh: number, since: number}>}
   */
  async _spendRestBlood(judgement) {
    const plan = judgement?.plan ?? null;
    if (!plan?.met) return { needed: plan?.needed ?? 0, met: false, vials: [], fresh: 0, since: 0 };
    const vials = [];
    for (const draw of vialDraws(judgement.stacks ?? [], plan.fromVials)) {
      const item = this.items.get(draw.itemId);
      if (!item) continue;
      vials.push(draw.take > 1 ? `${item.name} ${game.i18n.format("AZEROTH.Rest.Quantity", { n: draw.take })}` : item.name);
      let held = item.system?.quantity ?? 1;
      let gone = false;
      for (let i = 0; i < draw.take; i++) {
        const spend = spendOne(held);
        if (!spend || spend.delete) { gone = true; break; }
        held = spend.quantity;
      }
      if (gone) await item.delete();
      else await item.update({ "system.quantity": held });
    }
    if (plan.clearSince) await this.unsetFlag("azeroth-rpg", BLOOD_SINCE_REST_FLAG);
    return { needed: plan.needed, met: true, vials, fresh: plan.fromFresh, since: plan.fromSince };
  }

  /** The starred item ids, in the order they were starred (D-612). */
  get favorites() {
    const ids = this.getFlag("azeroth-rpg", "favorites") ?? [];
    return ids.filter(id => this.items.has(id));
  }

  /**
   * Star or unstar an owned item. Fifteen at most (the lead, D-612); the
   * sixteenth is refused with a notice rather than pushing one out.
   */
  async toggleFavorite(itemId) {
    if (!this.items.has(itemId)) return this;
    const current = this.favorites;
    if (current.includes(itemId)) {
      return this.setFlag("azeroth-rpg", "favorites", current.filter(id => id !== itemId));
    }
    if (current.length >= AZEROTH.FAVORITES_MAX) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Sheet.FavoritesFull", { max: AZEROTH.FAVORITES_MAX }));
      return this;
    }
    return this.setFlag("azeroth-rpg", "favorites", [...current, itemId]);
  }

  /**
   * 05 SS16, 05 SS12: Health, half Mana, full Focus; the uses a Short Rest
   * restores; every Sundered effect cleared; a card saying what came back
   * (D-623). An NPC rests too - Health and its Sundered effects, no pools -
   * so a Sunder on it ends the way the rule says. The count of Short Rests
   * since the last Long Rest rides a flag and the card warns past the second
   * (05 SS16: "Twice per day"); it never refuses, because the day is the
   * table's.
   *
   * **A CHARACTER'S SHORT REST TAKES FOOD OR DRINK** (05 SS16, 08 SS12; D-733).
   * Food recovers the Health, drink the Mana, and rest alone recovers neither.
   * The two picks are validated BEFORE either is spent and a refusal changes
   * NOTHING - no message, no flag, no clear - because half a rest taken and
   * refused is worse than none. `shortRestWithDialog` is the sheet's door and
   * fills them in; a bare call on a character is refused in words.
   *
   * @param {{food?: Item|string|null, drink?: Item|string|null}} [picks]
   */
  async shortRest({ food = null, drink = null, feast = null, blood = null, fresh = false } = {}) {
    // **A SAN'LAYN RESTS ON BLOOD, AND NOBODY ELSE DOES** (02 §5, *Your hunger.*; D-1141 to
    // D-1143). Judged WHOLE before anything is spent, beside the food and drink refusals below.
    const bloodJudgement = this.type === "character" ? this._judgeRestBlood("short", { food, drink, feast, blood, fresh }) : null;
    if (bloodJudgement?.refusal) {
      ui.notifications?.warn(bloodJudgement.refusal);
      return null;
    }
    const {withSpecialEquipmentRest}=await import("../effects/special-equipment.mjs");
    return withSpecialEquipmentRest(this,async()=>{
    const {prepareSpecialRest,finishSpecialRest,rechargeSpecialEquipment}=await import("../effects/special-equipment.mjs");
    const {prepareSharedFeast,finishSharedFeast,pendingSharedFeast,restGeneration}=await import("../effects/shared-feast.mjs");
    if(pendingSharedFeast(this)){ui.notifications?.warn(game.i18n.localize("AZEROTH.SharedFeast.Pending"));return null;}
    let sharedMeal=null;
    // 1. Resolve each pick: an Item, or an id off this actor.
    // ON THIS ACTOR, whichever way it was named: an Item object is looked up
    // by its id in this actor's own collection, so another character's bread
    // (or a pack's) handed in by a macro is no pick at all and is never spent.
    const pick = given => {
      const id = given && typeof given === "object" ? given.id : given;
      return id ? (this.items.get(id) ?? null) : null;
    };
    const eaten = pick(food);
    const drunk = pick(drink);
    let specialRest={ok:true};
    let ate = null;
    let drank = null;
    // A CREATURE IS EXEMPT and the code says so where it rests: 14 gives no
    // block rations and states no such condition, so an NPC's rest recovers
    // exactly what it always did (D-733). A character's picks replace this.
    let picks = { eats: true, drinks: true, tierAgain: false };
    // What a San'layn drank for this rest, for the card (D-1141).
    let bloodTaken = null;

    if (this.type === "character" && bloodJudgement?.fed) {
      // **THE BLOOD, SPENT AFTER EVERY REFUSAL** (`_judgeRestBlood` above): the count since the
      // last rest first, then the fresh unit, then the vial - and only what the plan still needs.
      bloodTaken = await this._spendRestBlood(bloodJudgement);
      picks = { eats: true, drinks: true, tierAgain: false };
    } else if (this.type === "character") {
      // 2. REFUSE BEFORE ANYTHING IS SPENT. Both picks are judged first, so a
      // legal food beside an illegal drink costs the character nothing.
      // A pick that was NAMED and is not this character's is refused by name,
      // before the general refusal: *carrying neither* would be the wrong words
      // for somebody who pointed at another character's ration.
      if (food && !eaten) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Rest.NotFood", { name: food?.name !== undefined ? shownName(food) : String(food) }));
        return null;
      }
      if (drink && !drunk) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Rest.NotDrink", { name: drink?.name !== undefined ? shownName(drink) : String(drink) }));
        return null;
      }
      // **A CHARACTER WHO DOES NOT EAT OR DRINK RESTS WITHOUT EITHER** (the lead: *"They do
      // recover health but do not have to eat or drink."*; D-946): no refusal, and the
      // rest recovers as though fed (`rules/rest.mjs#shortRest`'s `needsNoFood`).
      if (!eaten && !drunk && !feast && this.system?.needsNoFood !== true) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Rest.NeedsProvision", { name: this.name }));
        return null;
      }
      if (eaten && !isProvision(eaten, FOOD_KINDS)) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Rest.NotFood", { name: eaten.name }));
        return null;
      }
      if (drunk && !isProvision(drunk, DRINK_KINDS)) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Rest.NotDrink", { name: drunk.name }));
        return null;
      }
      // 3. What was taken, READ BEFORE THE DELETE: an item spent to nothing is
      // gone by the time the card is written.
      if(feast){if(eaten)return null;sharedMeal=await prepareSharedFeast(this,feast);if(!sharedMeal.ok)return null;}
      specialRest=await prepareSpecialRest(this,eaten,drunk);
      if(!specialRest.ok)return null;
      ate = sharedMeal?.name??eaten?.name ?? null;
      drank = drunk?.name ?? null;
      // **A FOOD ADDS HEALTH EQUAL TO ITS TIER** (O-702, D-2004): read off the eaten item
      // before the spend, as its name is; a shared Feast adds none of its own.
      picks = restPicks({ foodKind: sharedMeal?"hotMeal":eaten?.system?.provision ?? null, hasDrink: Boolean(drunk), foodTier: sharedMeal ? 0 : foodTier(eaten) });
      // 4. One item, one rest, whatever the row says it keeps for. `spendOne`
      // is `useGear`'s own mark-off rule (D-733). **A dish named as the food AND
      // the drink is one dish and is marked off once** (`restSpends`; the final
      // review's M1): twice spent two, and at a quantity of 1 the second delete
      // named a document already gone.
      for (const item of restSpends(eaten, drunk)) {
        if (!item) continue;
        const spend = spendOne(item.system?.quantity ?? 1);
        if (spend?.delete) await item.delete();
        else if (spend) await item.update({ "system.quantity": spend.quantity });
      }
    }

    // **AN AVATAR OR A METAMORPHOSIS ENDS WITH THE REST** (02 §7, D-769):
    // *until your next Short Rest or Long Rest*. After every refusal, so a rest
    // refused leaves the shape standing; Demonic Ascendance keeps a
    // Metamorphosis through a Short one (04).
    await endShapeAt(this, "short");
    // **STARTING A SHORT REST ENDS WELL FED** (D-1922), and every effect that
    // lasts *until your next Short Rest* (D-1962): after every refusal, and
    // before the rest's own cooked food lays a new Well Fed below.
    // A shared Feast lays it for each participant too (08 §12: *each participant ... is Well Fed*).
    const fedBy = restWellFed({ eaten, feast: sharedMeal });
    await this.clearRestEnds("short");
    // **HATRED HELD AT A SHORT REST BECOMES FEL** (the Demon Hunter plan's R2: *gain 1 Fel Corruption
    // for every 3 Momentum held, rounded up, and the pool empties; no Test*), after every refusal
    // above and before the rest empties the pool (`kept-pools.mjs#EMPTIED_BY.hatred`).
    const hatredHeld = this.type === "character" ? await this._hatredAtRest("short") : null;

    // READ AFTER THE SPEND. Deleting an embedded item resets the actor, which
    // rebuilds `this.system`: a reference taken at the top of the method would
    // be the model from before the meal was eaten.
    const s = this.system;
    // **LIGHT'S RESERVE** (04: *A Short Rest with a drink returns 3 more Mana per
    // rank*; D-772): with the drink alone, into the talent's own class's pool.
    const reserve = this.type === "character" ? restBonusFor(this.takenTalents(), { kind: "short", drinks: picks.drinks === true }) : { mana: 0, by: [], className: null };
    const reserveClass = reserve.className ? (this.classItems ?? []).find(c => c.name === reserve.className) ?? null : null;
    const r = shortRest({
      // *Druid's own Health* (the lead, D-769): what a rest recovers reads the
      // character's own Constitution, never a form's.
      health: s.health, conMod: s.abilities?.con?.own?.mod ?? s.abilities?.con?.mod ?? 0, tier: s.tier ?? 1, fatigue: s.fatigue ?? 0,
      pools: this.type === "character" ? this.poolSnapshot() : [],
      ...picks,
      manaExtra: reserve.mana > 0 ? { itemId: reserveClass?.id ?? null, amount: reserve.mana } : null,
      // The Death Knight, the Forsaken and the Risen (D-946).
      needsNoFood: this.type === "character" && this.system?.needsNoFood === true,
      needsNoDrink: this.type === "character" && this.system?.needsNoDrink === true,
      // A San'layn's unit of blood (D-1141): judged met above, or the rest was refused.
      bloodFed: bloodJudgement?.fed === true,
      blood: bloodJudgement?.fed === true && bloodJudgement.plan?.met === true
    });
    if (reserve.mana > 0 && picks.drinks === true) r.gains.push({ kind: "talentMana", name: reserve.by.join(", "), amount: reserve.mana });
    if (hatredHeld) r.gains.push({ kind: "hatredFel", held: hatredHeld.counted, fel: hatredHeld.fel });
    const restBefore = this.system?.health?.value ?? 0;
    if (this.type === "character") await this.updatePool(r.pools, { "system.health.value": r.health, "system.fatigue": Math.max(r.fatigue, this.system.fatigueFloor ?? 0) });
    else {
      // A creature's Power on a rest (2026-09-06): the Mana rule of 05 §16
      // - half back on a Short Rest, all on a Long - since 14 prints a
      // number and no rule of its own for it.
      const power = this.system?.power;
      // The block's own maximum where it states one, else the floor the tier
      // gives it (D-705) - the same fallback `poolSnapshot` and `updatePool`
      // take. Read off the stored field alone this skipped for the 123
      // creatures that store none, so the Power those now SPEND could never
      // be filled again from this sheet's own Short Rest button.
      const powerMax = this.system?.powerMax ?? power?.max ?? null;
      const update = { "system.health.value": r.health };
      if (powerMax !== null && powerMax !== undefined) update["system.power.value"] = Math.min(powerMax, (power?.value ?? 0) + Math.floor(powerMax / 2));
      await this.update(update);
    }
    // 08 SS12: one dressing restores Health across a Short Rest, and the
    // limit is the patient's (D-668). The rest clears it. 08 SS13's stones
    // and oils last an hour, and 05 makes a Short Rest an hour
    // uninterrupted, so a rest is exactly when they wear off (D-670).
    // BOTH BELONG AFTER THE if/else: put between them, the creature's Power
    // branch became the else of the dressing check and ran on a character.
    if (this.getFlag("azeroth-rpg", "dressed")) await this.unsetFlag("azeroth-rpg", "dressed");
    await this.clearCoatings();
    // **04's SYMBIOSIS SHARES A REST'S RECOVERY** (the lead, 2026-10-03, on O-169:
    // *"Yes"*; D-779): what the rest restored, the bond's other half restores half of.
    await this._shareRest(restBefore);
    // 04's Death Mark (D-773): *Until your next Short or Long Rest* - the target
    // named goes with the rest, and the Use the rest gives back names afresh.
    if (this.getFlag("azeroth-rpg", DEATH_MARK_FLAG)) await this.unsetFlag("azeroth-rpg", DEATH_MARK_FLAG);
    // 04's Devouring Plague (D-779): *once per target* runs with its uses, a rest's.
    if (this.getFlag("azeroth-rpg", DEVOURING_PLAGUE.flag)) await this.unsetFlag("azeroth-rpg", DEVOURING_PLAGUE.flag);
    const restored = await this.resetUses("short");
    await finishSpecialRest(this,specialRest);
    await rechargeSpecialEquipment(this,"short");
    const cleared = await this.clearSundered();
    await this.clearRestDecay();
    let count = null;
    if (this.type === "character") {
      count = (this.getFlag("azeroth-rpg", "shortRests") ?? 0) + 1;
      await this.setFlag("azeroth-rpg", "shortRests", count);
    }
    await this.setFlag("azeroth-rpg","restGeneration",restGeneration(this)+1);
    await finishSharedFeast(this,sharedMeal);
    // **A COOKED FOOD EATEN AS THIS REST'S FOOD MAKES THE EATER WELL FED ONCE IT
    // IS OVER** (D-1922): `fedBy` above, read off the eaten item, whose data outlives its mark-off.
    if (fedBy) await layWellFed(this, fedBy);
    await restCard({ actor: this, kind: "short", gains: r.gains, restored, cleared, count, ate, drank, blood: bloodTaken });
    return this;
    });
  }

  /**
   * 05 SS16: a quarter of max plus Constitution - not full; Mana and Focus
   * full; one Fatigue; Resolve refreshed; every limited use back. Diseased
   * (A1) takes the Health and the Fatigue away and the card says so.
   */
  async longRest({ blood = null, fresh = 0 } = {}) {
    // **A SAN'LAYN'S LONG REST TAKES THE GM'S NUMBER OF UNITS, AND IS NEVER REFUSED FOR IT**
    // (02 §5; the plan's A.6 item 2 and F10; D-1144). Judged here, BEFORE the first write below
    // (`endShapeAt`, the Long Watch, the temporary Health): a pick that is not a Blood vial on
    // this character is refused in words with nothing done, and blood that falls short rests
    // `withheld` - no Health, no Power, no Fatigue - with every other reset run.
    const bloodJudgement = this.type === "character" ? this._judgeRestBlood("long", { blood, fresh }) : null;
    if (bloodJudgement?.refusal) {
      ui.notifications?.warn(bloodJudgement.refusal);
      return null;
    }
    const {withSpecialEquipmentRest}=await import("../effects/special-equipment.mjs");
    return withSpecialEquipmentRest(this,async()=>{
    const {pendingSharedFeast,restGeneration}=await import("../effects/shared-feast.mjs");
    if(pendingSharedFeast(this)){ui.notifications?.warn(game.i18n.localize("AZEROTH.SharedFeast.Pending"));return null;}
    // The blood, spent only where the plan is met (all or nothing, A.9 Q15).
    const bloodTaken = bloodJudgement?.fed ? await this._spendRestBlood(bloodJudgement) : null;
    const withheld = bloodJudgement?.fed === true && bloodJudgement.plan?.met !== true;
    const {rechargeSpecialEquipment}=await import("../effects/special-equipment.mjs");
    // **AN AVATAR OR A METAMORPHOSIS ENDS WITH THE REST** (02 §7, D-769).
    await endShapeAt(this, "long");
    // **AND EVERYTHING THAT LASTS UNTIL A REST** (D-1962): a Long Rest is the
    // next rest of either kind, so Well Fed and the elixirs end with it.
    await this.clearRestEnds("long");
    // **THE LONG WATCH ENDS WITH IT** (04: *Until your next Long Rest you know its
    // direction and rough distance*; the Legacy branches' door 18): the user's own flag.
    if (this.getFlag?.("azeroth-rpg", WATCH_FLAG)) await this.unsetFlag("azeroth-rpg", WATCH_FLAG);
    // **AND EVERY TEMPORARY HEALTH IS LOST** (05: *no rest returns it*; the
    // rulings' READING, 2026-10-03, for the lead: lost at a Long Rest whatever its
    // span; D-777).
    await this.endTemporaryHealth({ kind: "longRest" });
    // **HATRED HELD AT A LONG REST BECOMES FEL** (R2), before the rest empties the pool.
    const hatredHeld = this.type === "character" ? await this._hatredAtRest("long") : null;
    const s = this.system;
    const restBefore = s?.health?.value ?? 0;
    const diseased = this.statuses?.has("diseased") ?? false;
    const r = longRest({
      // *Druid's own Health* (the lead, D-769): the character's own Constitution.
      health: s.health, conMod: s.abilities?.con?.own?.mod ?? s.abilities?.con?.mod ?? 0, tier: s.tier ?? 1, fatigue: s.fatigue ?? 0,
      pools: this.poolSnapshot(), diseased, withheld
    });
    if (hatredHeld) r.gains.push({ kind: "hatredFel", held: hatredHeld.counted, fel: hatredHeld.fel });
    // Void's Fatigue does not clear on a Long Rest (10 §5): the floor holds.
    if (this.type === "character") await this.updatePool(r.pools, { "system.health.value": r.health, "system.fatigue": Math.max(r.fatigue, this.system.fatigueFloor ?? 0) });
    else {
      const power = this.system?.power;
      // As the Short Rest above: the stated maximum, else the tier's floor (D-705).
      const powerMax = this.system?.powerMax ?? power?.max ?? null;
      const update = { "system.health.value": r.health };
      if (powerMax !== null && powerMax !== undefined) update["system.power.value"] = powerMax;
      await this.update(update);
    }
    // 08 SS12: one dressing restores Health across a Short Rest, and the
    // limit is the patient's (D-668). The rest clears it. 08 SS13's stones
    // and oils last an hour, and 05 makes a Short Rest an hour
    // uninterrupted, so a rest is exactly when they wear off (D-670).
    // BOTH BELONG AFTER THE if/else: put between them, the creature's Power
    // branch became the else of the dressing check and ran on a character.
    if (this.getFlag("azeroth-rpg", "dressed")) await this.unsetFlag("azeroth-rpg", "dressed");
    await this.clearCoatings();
    // **04's SYMBIOSIS SHARES A REST'S RECOVERY** (the lead, 2026-10-03, on O-169:
    // *"Yes"*; D-779): the Long Rest's own recovery is shared before the bond ends
    // with it (READING: the bond lasts *until* the rest, and the rest is its last).
    await this._shareRest(restBefore);
    // 04's Symbiosis: *The bond lasts until your next Long Rest* (D-771). Ended
    // before the uses come back, so the partner is named afresh after it.
    await endSymbiosis(this);
    // 04's Devouring Plague (D-779): *once per target* runs with its uses.
    if (this.getFlag("azeroth-rpg", DEVOURING_PLAGUE.flag)) await this.unsetFlag("azeroth-rpg", DEVOURING_PLAGUE.flag);
    // **AND WHAT WAS NAMED AT THE LAST ONE** (D-772): Blessed Plate's and Warded
    // Plate's school (*at each Long Rest*) and Beacon's chosen creature (*during
    // a Long Rest*) - each named afresh by the Use the rest gives back.
    if (this.getFlag("azeroth-rpg", PLATE_FLAG)) await this.unsetFlag("azeroth-rpg", PLATE_FLAG);
    if (this.getFlag("azeroth-rpg", BEACON_FLAG)) await this.unsetFlag("azeroth-rpg", BEACON_FLAG);
    // 02's Scales of the Flight (stage 2B): *chosen after each Long Rest where a tie leaves
    // it open* - named afresh by the Use the rest gives back.
    if (this.getFlag("azeroth-rpg", FLIGHT_SCHOOL_FLAG)) await this.unsetFlag("azeroth-rpg", FLIGHT_SCHOOL_FLAG);
    // 04's Death Mark (D-773): *Until your next Short or Long Rest*.
    if (this.getFlag("azeroth-rpg", DEATH_MARK_FLAG)) await this.unsetFlag("azeroth-rpg", DEATH_MARK_FLAG);
    // **THE WARLOCK'S** (D-775): a demon Command Demon bound is bound *until your
    // next Long Rest*, and one Demonic Sacrifice dismissed *cannot be summoned
    // again until your next Long Rest*.
    if (this.type === "character") await releaseAtLongRest(this);
    // **02 §7's UNHOLY PRESENCE ENDS WITH THE REST, AND A DRACOLICH COLLAPSES** (doors 10 and the
    // raises: *until you end it, you drop to 0 Health or you finish a Long Rest*; 07 §17's *It
    // collapses when you finish a Long Rest*): the presence's effect, and every raise carrier the
    // rest ends (its bond's release above deletes the creature; the carrier goes with it).
    if (this.type === "character") {
      const { endAtLongRest } = await import("../effects/death-knight-necromancy.mjs");
      await endAtLongRest(this);
    }
    // **04's BONE ARMOR** (*until you finish a Long Rest*; Phase 4c-T): its stacks end with the rest.
    if (this.type === "character") {
      const { necroLongRest } = await import("../effects/necromancer-talents.mjs");
      await necroLongRest(this);
    }
    // **02 §7's LICHDOM: *When you finish a Long Rest, you may bind yourself to a phylactery you
    // carry*** (the Necromancer plan's door 11): the window Lichdom's Use binds in, opened here.
    if (this.type === "character" && this.hasFeature?.("Lichdom")) {
      const { openPhylacteryWindow } = await import("../effects/necromancer-horde.mjs");
      for (const line of await openPhylacteryWindow(this)) ui.notifications?.info(line);
    }
    if (this.getFlag("azeroth-rpg", SACRIFICED_FLAG)) await this.unsetFlag("azeroth-rpg", SACRIFICED_FLAG);
    // **WHAT MEKKATORQUE'S BLUEPRINT BUILT WORKS FOR A DAY** (02's gnome; the Legacy
    // branches' door 7; next Long Rest approved by the lead, 2026-11-01): the device carried
    // goes, the gadget's flag goes and the sync takes its feature, and the Use the
    // rest gives back builds the next.
    const built = cleanBlueprint(this.getFlag("azeroth-rpg", BLUEPRINT_FLAG));
    if (this.getFlag("azeroth-rpg", BLUEPRINT_FLAG) !== undefined) {
      const expected = JSON.stringify(this.getFlag("azeroth-rpg", BLUEPRINT_FLAG));
      const expiring = [...this.items.values()].filter(item => item.id === built?.itemId
        || (built?.gadget && item.type === "feature"
          && item.flags?.["azeroth-rpg"]?.feature?.gadget === built.gadget
          && item.flags["azeroth-rpg"].feature.talentId === built.talentId)).map(item => item.id);
      if (expiring.length) await this.deleteEmbeddedDocuments("Item", expiring);
      if (expiring.some(id => this.items.has(id))
        || JSON.stringify(this.getFlag("azeroth-rpg", BLUEPRINT_FLAG)) !== expected)
        throw new Error(game.i18n.localize("AZEROTH.Blueprint.CleanupUnconfirmed"));
      await this.unsetFlag("azeroth-rpg", BLUEPRINT_FLAG);
      if (this.getFlag("azeroth-rpg", BLUEPRINT_FLAG) != null)
        throw new Error(game.i18n.localize("AZEROTH.Blueprint.CleanupUnconfirmed"));
      if (built?.gadget) await this.syncClassFeatures();
    }
    const restored = await this.resetUses("long");
    // **THE IDENTIFY TESTS COME BACK** (08 §4: *once per Long Rest*; D-1435): the tried mark on
    // every item this actor holds, in ONE write, deleted rather than written false, so a tried
    // stack and its untried twin merge again (`rules/slots.mjs#stackKey` reads the flags).
    const tried = [...this.items].filter(i => triedThisRest(i))
      .map(i => ({ _id: i.id, [`flags.${IDENTIFY_SCOPE}.${TRIED_FLAG}`]: foundry.data.operators.ForcedDeletion.create() }));
    if (tried.length) await this.updateEmbeddedDocuments("Item", tried);
    await rechargeSpecialEquipment(this,"long");
    // Sealing Flame limits the recipient, not the caster. An unresolved
    // reservation requires review; only a consumed benefit resets at rest.
    if (this.getFlag('azeroth-rpg','sealingFlameRecipient')?.state === 'used') {
      await this.unsetFlag('azeroth-rpg','sealingFlameRecipient');
    }
    const cleared = await this.clearSundered();
    await this.clearRestDecay();
    if (this.getFlag("azeroth-rpg", "shortRests")) await this.unsetFlag("azeroth-rpg", "shortRests");
    await this.setFlag("azeroth-rpg","restGeneration",restGeneration(this)+1);
    // **THE RUNES REFILL WITH THE SAME REST THAT EMPTIES THE RUNIC POWER** (02 §7; D-943):
    // every spent rune on every weapon owned, through the one writer (`documents/runes.mjs`).
    if (this.type === "character") {
      // **A STARVED REST REFILLS NO RUNE** (02 §5: *a rest without the blood it needs restores no Health and no
      // Power*; the review's S3): a rune is the Death Knight's Power, and a San'layn may take the Death Knight.
      const refilled = withheld ? 0 : await refillRunesAtLongRest(this, { restGeneration: restGeneration(this) });
      if (refilled > 0) r.gains.push({ kind: "runesRefilled", amount: refilled });
      if ((this.system?.classKeys ?? []).includes("death-knight")) r.gains.push({ kind: "inscribeOpen" });
    }
    await restCard({ actor: this, kind: "long", gains: r.gains, restored, cleared, diseased, blood: bloodTaken });
    // 07's Haven and Sanctification: *any that take a Long Rest end it with every disease and
    // poison gone* (Sanctification: and one Critical Injury healed). D12 Phase 6.
    if (this.type === "character" && this.isOwner) {
      // A throw here must not skip the hostile-school exposure that follows: warn and carry on.
      try {
        const { cureAtLongRest } = await import("../effects/cures.mjs");
        const rested = await cureAtLongRest(this);
        if (rested.lines.length) {
          const { postAfflictionCard } = await import("../effects/afflictions.mjs");
          await postAfflictionCard(this, { title: rested.by.join(", "), lines: rested.lines, accent: "azeroth-card-spell", kind: "cure" });
        }
      } catch (error) {
        console.warn("azeroth-rpg | long rest cure", error);
      }
    }

    // 10 §7: a character holding two classes in hostile schools is exposed
    // once per Long Rest, at DC 15, on the track the pairing names. The
    // pairings were detected in `prepareDerivedData` and NOTHING consumed
    // them — the cost was worked out and never charged (the lead, 2026-09-07).
    // After the rest card, so the exposure reads as a consequence of it.
    //
    // **WHAT A SKIPPED DIALOG WOULD COUNT** (D-755's review). This door opens
    // no dialog, and it rolled a bare d20: every hostile pairing's exposure is
    // a Spirit Test (10 §3), and none of them took the Boon an ally's Aura of
    // Resolve was giving on every other Spirit Test. `defaultChoice` is the
    // skip path every other Test takes, so the Test counts each AUTOMATIC line
    // the roller's own state raises - the aura's Boon, Fatigue 5's Bane,
    // Poisoned, a laid Bane, what is worn - and nothing the table judges. Read
    // after the rest, so the Fatigue it counts is the Fatigue the rest left.
    for (const { track, dc } of hostileExposures(this.system?.hostilePairings)) {
      const resilience = AZEROTH.corruptionResilience[track];
      const choice = defaultChoice(this, { kind: "resilience", resilience, dc, targets: [] });
      await game.system.azeroth.workflows.corruptionExposure({
        actor: this, track, dc, occasion: "hostileSchools",
        boons: choice.boons, banes: choice.banes,
        provenanceExtra: [...choice.provenanceExtra, ...auraBoonProvenance(this, resilience, choice)]
      });
    }
    // **WHAT HOLDING A THING CHARGES AT A LONG REST** (08 §20, 10 §3; D-909,
    // D-910): Xal'atath's The Black Empire's Price, *at the end of each Long
    // Rest, make a Spirit Resilience Test at DC 20. On a failure, gain 1 Void
    // Corruption.* The aggregate `signatureEffects` already judged the gate and
    // what is held; the Test counts the roller's automatic lines as the hostile
    // pairing's does, and the point lands on a failure alone.
    for (const row of this.system?.signatureEffects?.exposures ?? []) {
      const choice = defaultChoice(this, { kind: "resilience", resilience: row.resilience, dc: row.dc, targets: [] });
      await game.system.azeroth.workflows.corruptionExposure({
        actor: this, track: row.track, dc: row.dc, resilience: row.resilience, points: row.amount, occasion: "signature",
        boons: choice.boons, banes: choice.banes,
        provenanceExtra: [...choice.provenanceExtra, ...auraBoonProvenance(this, row.resilience, choice)]
      });
    }
    // **02 §7's NECROMANCER: HOLDING ESSENCE THROUGH A LONG REST** (*When you finish a Long Rest
    // holding any Essence, make a Body Resilience Test against DC 12 plus the Essence you hold. On a
    // failure, gain 1 Undeath*; the lead: *"DC 12 + essence held"*; the Necromancer plan's door 12):
    // the Essence the rest left, read after it (no rest empties it), through the one exposure door,
    // which makes no Test for a creature that accrues no Undeath (a Forsaken, a lich: `accruesTrack`).
    const essenceHeld = (this.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === ESSENCE)?.value ?? 0;
    const essenceRisk = this.type === "character" ? restExposure({ held: essenceHeld }) : null;
    if (essenceRisk) {
      const choice = defaultChoice(this, { kind: "resilience", resilience: essenceRisk.resilience, dc: essenceRisk.dc, targets: [] });
      await game.system.azeroth.workflows.corruptionExposure({
        actor: this, track: essenceRisk.track, dc: essenceRisk.dc, resilience: essenceRisk.resilience, points: essenceRisk.points, occasion: essenceRisk.occasion,
        boons: choice.boons, banes: choice.banes,
        provenanceExtra: [...choice.provenanceExtra, ...auraBoonProvenance(this, essenceRisk.resilience, choice)]
      });
    }
    // **08 §5's FELWROUGHT** (*For each Long Rest it is kept, its rider makes a Spirit
    // Resilience Test at DC 12 plus twice their tier. On a failure, the rider gains 1 Fel
    // Corruption*; the lead: *"DC is 12+2xtier"*; D-911): every creature bound to this
    // character whose block carries the trait, and every mount the character keeps
    // that names it, through the one exposure door (`rules/trait-corruption.mjs`).
    const kept = [
      ...boundOf(this).map(b => ({ name: b.name, traits: (b.system?.attacks ?? []).flatMap(a => a?.traits ?? []) })),
      ...[...(this.items ?? [])].filter(i => Array.isArray(i.system?.traits)).map(i => ({ name: i.name, traits: i.system.traits }))
    ];
    for (const row of traitExposures(kept, "longRest", { tier: this.system?.tier ?? 1, living: livingActor(this) })) {
      const choice = defaultChoice(this, { kind: "resilience", resilience: row.resilience, dc: row.dc, targets: [] });
      await game.system.azeroth.workflows.corruptionExposure({
        actor: this, track: row.track, dc: row.dc, resilience: row.resilience, points: row.amount, occasion: "gear",
        boons: choice.boons, banes: choice.banes,
        provenanceExtra: [...choice.provenanceExtra, ...auraBoonProvenance(this, row.resilience, choice)]
      });
    }
    // Gadgeteer's replacement is offered within this Long Rest, never banked
    // as permission to change gadgets later in an encounter.
    const gadgeteer = this.items.find(i => i.type === "feature" && i.system?.choice === "gadgets");
    const bench = this.takenTalents?.().some(t => t.className === "Rogue" && t.identifier === "the-bench" && t.taken > 0);
    if (gadgeteer && bench) await game.system.azeroth.workflows.useFeature({ actor: this, item: gadgeteer, gadgetRest: true });
    return this;
    });
  }

  /**
   * **THE HATRED A REST TURNS INTO FEL** (the Demon Hunter plan's R2, C41, C42, C45): the Hatred held,
   * capped at the cap the rest finds (the orchestrator's brief: the cap is enforced when Hatred is
   * gained and at a rest), less Warding Tattoos and Warding Ink, at 1 Fel per 3 (4 or 5 with Bridle
   * the Demon) rounded up, less Measured Breath (`rules/hatred.mjs#hatredAtRest`). The Fel lands
   * unresisted through the ONE unresisted door (`workflows.accrueCorruption`); the pool empties with
   * the rest's own pool write, which runs in the one pool queue. Judged whole before it writes, and
   * never thrown: a Fel write that fails is said and the rest goes on.
   *
   * Quiet the Whispers (04, the Sufferer: a Spirit Test to gain none) is the talent phase's.
   *
   * @param {"short"|"long"} kind
   * @returns {Promise<{held: number, counted: number, fel: number}|null>}
   */
  async _hatredAtRest(kind) {
    // Quiet the Whispers' uses come back at a Long Rest, before its own conversion draws on them (MY READING).
    if (kind === "long" && this.getFlag("azeroth-rpg", "quietWhispers")) await this.unsetFlag("azeroth-rpg", "quietWhispers");
    const pool = (this.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === HATRED) ?? null;
    const judged = pool ? hatredAtRest({ held: pool.value, cap: pool.max, modifiers: restModifiersOf(this) }) : null;
    if (!judged) return null;
    // **04's QUIET THE WHISPERS, ROLLED LAST** (the Sufferer's stacking line; the Demon Hunter plan's Phase 4a):
    // after Warding Tattoos, Warding Ink, Bridle the Demon and Measured Breath have reduced it, a Spirit
    // Resilience Test at DC 10 plus the Hatred held when the rest ended; a success cancels the Fel that remains.
    // Its count is a use a rank, emptied at a Long Rest (above).
    // By the talent's name off the law (`QUIET_THE_WHISPERS.name`); its row is the talents phase's.
    if (judged.fel > 0 && (this.talentRanks?.(QUIET_THE_WHISPERS.name) ?? 0) > 0) {
      try {
        const { quietTheWhispers } = await import("../effects/demon-hunter-features.mjs");
        judged.fel = await quietTheWhispers(this, { fel: judged.fel, held: judged.held, kind });
      } catch (err) {
        console.warn("azeroth-rpg | Quiet the Whispers", err);
      }
    }
    if (judged.fel > 0) {
      try {
        await game.system.azeroth.workflows.accrueCorruption(this, {
          track: "fel", points: judged.fel,
          occasion: game.i18n.format("AZEROTH.Occasion.Hatred", { n: judged.counted, rest: game.i18n.localize(kind === "long" ? "AZEROTH.Sheet.LongRest" : "AZEROTH.Sheet.ShortRest") })
        });
      } catch (err) {
        console.warn("azeroth-rpg | Hatred at a rest", err);
      }
    }
    return judged;
  }

  /** 05 §14, 06 §9: stand at 1 Health for one Tether, no Test. */
  async burnTether() {
    const r = burnTether({ tether: this.system?.spiritTether, health: this.system?.health });
    if (!r) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Sheet.NoTether"));
      return null;
    }
    await this.update({ "system.spiritTether.value": r.tether, "system.health.value": r.health });
    return this.standUp();
  }

  /** 05 §12: Energy and Focus refill at the start of the turn. */
  async refillTurn({ still = false } = {}) {
    // What a feature adds to 05 §12's refill, by pool. 04's Adrenaline refilled Energy here until the class
    // talent audit made it a discount (decision 13, D-1881), so no talent adds to the refill now.
    const extra = {};
    // 02's Demon Unleashed: *At 15 Fel Corruption or more your Energy refills 5 at the start of each of your turns
    // instead of 3* (the Demon Hunter plan's C15), off the Fel a feature's threshold reads (`featureFel`: I Have
    // Prepared's 20, never Embrace the Pain's 5 more; the review's M1).
    const unleashedMore = this.type === "character" ? unleashedRefillExtra({ unleashed: this.shape?.kind === "unleashed", fel: featureFel(this) }) : 0;
    if (unleashedMore > 0) extra.energy = (Number(extra.energy) || 0) + unleashedMore;
    // 02's Focus refills only after a still turn (the Legacy branches' door 9):
    // `still` is the combat door's measure, and a caller that names none refills
    // no Focus (`rules/rest.mjs#turnRefill`, a gate closed by default).
    const changes = turnRefill(this.poolSnapshot(), { extra, still: still === true });
    return changes.length ? this.updatePool(changes) : this;
  }

  /* -------------------------------------------- */
  /*  Health changes float off the token                                      */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preUpdate(changed, options, user) {
    const allowed = await super._preUpdate(changed, options, user);
    if (allowed === false) return false;
    // **THE DIRECTORY PORTRAIT FOLLOWS THE TOKEN ART** (the lead, 2026-11-02,
    // *option 1*; D-797): a character's `img` takes the new token art where it
    // was blank, core's placeholder or the token's previous art, and never where
    // the update names `img` itself. HERE, so every door that writes the token
    // art - the banner's portrait, the Prototype Token dialog, a macro - moves
    // it. After `super`, whose own rule runs the other way (an `img` with no
    // token art); characters alone, and a synthetic actor has no prototype.
    // `rules/token-art.mjs` is the law.
    if (this.type === "character" && !this.isToken && changed) {
      const img = mirroredImg({
        changed,
        img: this._source.img,
        tokenSrc: this._source.prototypeToken?.texture?.src,
        randomImg: this._source.prototypeToken?.randomImg === true,
        placeholders: [CONST.DEFAULT_TOKEN, this.constructor.DEFAULT_ICON],
        extensions: Object.keys(CONST.IMAGE_FILE_EXTENSIONS)
      });
      if (img) changed.img = img;
    }
    // Core's own pattern (TokenDocument#_preUpdate stashes previousActorId):
    // options reach every client's _onUpdate, so the Health before the write
    // rides there and each client draws the change over the tokens it sees.
    if (changed && "system" in changed) options.azerothHealthBefore = this.system?.health?.value ?? null;
    return allowed;
  }

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    // Constitution moves the Health maximum a bound creature's Bonded reads (D-643).
    if (this.type === "character" && game.user.id === userId && foundry.utils.hasProperty(changed, "system.abilities.con")) {
      this.syncBound().catch(err => console.error("azeroth-rpg | bound sync", err));
    }
    // A level or a class array change moves the features with it (D-612):
    // the updating client alone, once, after the write has landed. An
    // Intelligence written to the actor does too (O-272): Recall's and Shared
    // Hours' uses are counted by its modifier (`rules/progression.mjs#resyncsFeatures`).
    if (userId === game.user.id && resyncsFeatures(changed) && this.type === "character") {
      this.syncClassFeatures();
    }
    // The Fatigue track moved: its statuses follow (D-624), on the writing client.
    if (userId === game.user.id && changed.system?.fatigue !== undefined && this.type === "character") {
      this.syncFatigue({ notify: true });
    }
    // A shape worn or left moves Thick Hide and kin (D-648): `documents/shapes.mjs`
    // re-syncs them on every door that writes the shape's effect (D-769).
    //
    // **0 HEALTH ENDS THE AVATAR** (02 §7, D-769; the brief's reading of *you
    // take an additional Critical Injury and start dying*): on the client that
    // wrote the Health, whatever path wrote it. The additional injury is the
    // struck blow's (`_struckBy`), beside the one 06 §8 already rolls there.
    if (userId === game.user.id && this.type === "character" && foundry.utils.getProperty(changed, "system.health.value") === 0 && this.shape) {
      this._shapeEnding = endShapeAt(this, "zeroHealth")
        .catch(err => console.error("azeroth-rpg | a shape did not end at 0 Health", err));
    }
    // **0 HEALTH ENDS WHAT IS SUSTAINED** (the review of D-756, M1). 06 §8 and
    // §9 make reaching 0 a Critical Injury, and 05 §12 ends a Sustain on one:
    // a creature killed while holding Rain of Fire held it on and burned the
    // party every turn. HERE, on the client that wrote the Health, because every
    // path that can write a 0 comes through a document update and not all of
    // them through `adjustHealth` - the sheet, the token bar, a Suffer's 20 row,
    // Fatigue's collapse. `workflows.endAllSustains` is the one writer and
    // `adjustHealth` waits for it. A synthetic actor's change reaches this too.
    if (userId === game.user.id && foundry.utils.getProperty(changed, "system.health.value") === 0
      && (this.getFlag("azeroth-rpg", "sustaining") ?? []).length) {
      game.system.azeroth.workflows.endAllSustains({ actor: this })
        .catch(err => console.error("azeroth-rpg | a Sustain did not end at 0 Health", err));
    }
    const before = options?.azerothHealthBefore;
    const after = this.system?.health?.value;
    if (typeof before !== "number" || typeof after !== "number" || before === after) return;
    this._showHealthChange(after - before);
  }

  /**
   * Red "-N" sinking or green "+N" rising over every visible token of this
   * actor - the shape of core's ActiveEffect#_displayScrollingStatus. Core has
   * no token-bar text of its own in V14, and its `scrollingStatusText`
   * setting is honoured inside createScrollingText. Not a private method:
   * it is reached from an update (D-602).
   */
  _showHealthChange(delta) {
    if (!canvas?.ready || !canvas.scene || !canvas.interface?.createScrollingText) return;
    const text = `${delta < 0 ? "\u2212" : "+"}${Math.abs(delta)}`;
    const fill = delta < 0 ? AZEROTH.HEALTH_TEXT.damage : AZEROTH.HEALTH_TEXT.heal;
    for (const token of this.getActiveTokens(true)) {
      if (!token.visible || token.document.isSecret) continue;
      canvas.interface.createScrollingText(token.center, text, {
        anchor: CONST.TEXT_ANCHOR_POINTS.CENTER,
        direction: delta < 0 ? CONST.TEXT_ANCHOR_POINTS.BOTTOM : CONST.TEXT_ANCHOR_POINTS.TOP,
        distance: 2 * token.h,
        fontSize: 28,
        fill,
        stroke: 0x000000,
        strokeThickness: 4,
        jitter: 0.25
      });
    }
  }

  /**
   * Move Health by a signed amount, clamped to 0..max. The one writer for
   * damage and healing, so the floating text and the clamp live in one place.
   *
   * **AND WHAT A BLOW LEFT OF THE TEMPORARY HEALTH, IN THE SAME WRITE** (05;
   * D-777): `temp` is the creature's temporary Health after the blow took from
   * it, written beside the Health in ONE update (D-761's rule: facts that must
   * agree are written together), and the grant's record goes with the last of
   * it.
   *
   * **AND WHO DEALT IT, ON THE SAME WRITE** (D-1729): `by` is the damage door's dealer, written
   * as `rules/death-watch.mjs#DAMAGE_BY_OPTION` beside `azerothDamageApplied`, so the death watch
   * reads the creature that dropped a character off the write that dropped it (10 §3's exposure).
   *
   * @param {number} delta
   * @param {{temp?: number|null, by?: Actor|null}} [o]
   */
  async adjustHealth(delta, { temp = null, damage = false, manaShield = null, by = null } = {}) {
    if (refuseIceBlockTarget(this)) return this;
    if (damage === true && refuseDispersion(this, "damage")) return this;
    const health = this.system?.health;
    if (!health) return this;
    if (projectionPhaseFor(this) && (delta < 0 || (temp !== null && temp < (health.temp ?? 0)))) {
      ui.notifications?.info(game.i18n.localize("AZEROTH.ImageProjection.Protected"));
      return this;
    }
    const max = typeof health.max === "number" ? health.max : Infinity;
    const value = Math.max(0, Math.min(max, (health.value ?? 0) + Math.trunc(delta)));
    const update = {};
    if (value !== (health.value ?? 0)) update["system.health.value"] = value;
    if (temp !== null && temp !== undefined) {
      const left = wholeTemp(temp);
      if (left !== wholeTemp(health.temp)) {
        update["system.health.temp"] = left;
        if (left === 0 && this.getFlag("azeroth-rpg", TEMP_FLAG)) update[`flags.azeroth-rpg.${TEMP_FLAG}`] = null;
      }
    }
    if (!Object.keys(update).length && !manaShield) return this;
    const damageApplied = damage === true
      ? Math.max(0, (health.value ?? 0) - value) + (temp === null ? 0 : Math.max(0, wholeTemp(health.temp) - wholeTemp(temp))) : 0;
    // **THE LEDGER OF WHAT WAS TAKEN** (07 §12's Mending Sands and Sands Run Back: *the
    // damage it has taken since the start of your last turn*; D-867), one row a blow, in
    // the same write as the Health (`rules/recent-damage.mjs`).
    if (damageApplied > 0) Object.assign(update, this._damageLedger?.(damageApplied) ?? {});
    const controlHarm = damageApplied > 0 && this.effects?.some(effect => effect.flags?.["azeroth-rpg"]?.mindControl)
      ? mindControlHarm : null;
    const controlSnapshot = controlHarm?.mindControlHarmSnapshot(this) ?? [];
    const controlHealthBefore = (this.system.health.value ?? 0) + wholeTemp(this.system.health.temp);
    const damageOptions = damageApplied > 0 ? { azerothDamageApplied: damageApplied, ...(by ? this._damageByOption?.(by) : {}) } : {};
    const written = manaShield
      ? await (await import('../effects/mana-shield-payment.mjs')).commitManaShieldHealth({actor:this,plan:manaShield,update,
        options:damageOptions})
      : damageApplied > 0
      ? await this.update(update, damageOptions)
      : await this.update(update);
    if (controlSnapshot.length) {
      const remaining = (this.system.health.value ?? 0) + wholeTemp(this.system.health.temp);
      try { await controlHarm.endMindControlOnDamage(this, controlSnapshot, Math.max(0, Math.min(damageApplied, controlHealthBefore - remaining))); }
      catch (error) {
        console.warn("azeroth-rpg | Mind Control damage release", error);
        ui.notifications?.warn("Damage was applied, but Mind Control could not be removed. Check the target's effects.");
      }
    }
    // **ANY DAMAGE ENDS HEX AND POLYMORPH** (07: *Any damage ends the Hex*; 02: *until
    // it takes damage*; D-808): what this write took of Health and temporary Health,
    // after every door of the blow had it (`rules/shapes.mjs#endsOnDamage`, the tool's
    // reading). HERE, the one writer `applyDamage` and Scorched's straight damage both
    // reach, and before the early return below, which a blow temporary Health took
    // whole would otherwise leave by.
    if (damageApplied > 0 && this.shape?.forced) {
      try {
        await endShapeOnDamage(this, damageApplied);
      } catch (error) {
        console.warn("azeroth-rpg | a forced shape did not end on damage", error);
      }
    }
    if (!("system.health.value" in update)) return written;
    // What 0 Health ended (05 §12, 06 §9; M1) is over before the door that
    // wrote it goes on: `_onUpdate` began it on this client, during the update.
    if (value === 0) await game.system.azeroth.workflows.sustainsEnding(this);
    // An Avatar ended there too (D-769), and is waited for the same way.
    if (value === 0) await this._shapeEnding;
    return written;
  }

  /**
   * The update option naming who dealt a blow (D-1729): `{[DAMAGE_BY_OPTION]: record}`, or
   * nothing where the dealer cannot be named. A method, so `adjustHealth` reads no module name
   * for it (its body is compiled alone by `consume-damage-adapter.test.mjs`).
   *
   * @param {Actor|null} by
   * @returns {object}
   */
  _damageByOption(by) {
    const dealer = dealerRecord(by);
    return dealer ? { [DAMAGE_BY_OPTION]: dealer } : {};
  }

  /**
   * **DAMAGE THAT NO ARMOR OR WARD MEETS** (A1's Scorched: *you take X Fire
   * damage. Armor and Ward do not apply to it*; 10's Burning; D-777): damage all
   * the same, so 05's temporary Health takes it first, and 07's Aegis floor -
   * *by any source* - holds the creature at 1. Nothing else of the damage door
   * runs: these are no blow.
   *
   * @param {number} amount
   */
  async takeStraightDamage(amount) {
    if (refuseIceBlockTarget(this)) return this;
    if (refuseDispersion(this, "damage")) return this;
    if (projectionPhaseFor(this)) {
      ui.notifications?.info(game.i18n.localize("AZEROTH.ImageProjection.Protected"));
      return this;
    }
    const soaked = absorbDamage({ temp: this.system?.health?.temp ?? 0, amount });
    if (soaked.absorbed > 0) ui.notifications?.info(game.i18n.format("AZEROTH.Temporary.Absorbed", { name: this.name, n: soaked.absorbed }));
    const {manaShieldFor}=await import('../effects/mana-shield-payment.mjs');
    const shield=manaShieldFor(this,soaked.amount);
    const left = await this._floorOnly(shield?.damage??soaked.amount);
    return this.adjustHealth(-left, { temp: soaked.temp, damage: true, manaShield:shield });
  }

  /**
   * **HEALTH LOST, NOT DAMAGE TAKEN** (A1's Bleeding: *you lose X Health*): no
   * temporary Health is touched (05: *Temporary Health cannot be spent at all*),
   * and 07's Aegis floor - *by any source* - still holds the creature at 1.
   *
   * @param {number} amount
   */
  async loseHealth(amount, { vitaeOverflow = false } = {}) {
    // **HEALTH PAID FOR VITAE** (02 §7, *When your Vitae runs out*: *Health you pay this way is not damage.
    // Paying it can drop you to 0 Health*; the San'layn and Sovereign plan's V4, B.13 Q22 and Q23): past
    // the Aegis floor and every hold, no Critical Injury, Prone and Dying at 0, with the drain pulse's cue.
    if (vitaeOverflow === true) return loseHealthForVitae(this, amount);
    if (refuseIceBlockTarget(this)) return this;
    if (projectionPhaseFor(this)) {
      ui.notifications?.info(game.i18n.localize("AZEROTH.ImageProjection.Protected"));
      return this;
    }
    const left = await this._floorOnly(Math.max(0, Math.trunc(Number(amount)) || 0));
    return this.adjustHealth(-left);
  }

  /** 07's Aegis floor alone, for what reaches Health outside the damage door (D-777). */
  async _floorOnly(amount) {
    const before = this.system?.health?.value ?? 0;
    if (!wouldDrop({ before, amount })) return amount;
    try {
      const floor = await aegisFloor({ target: this, before, amount });
      if (floor.held) {
        ui.notifications?.info(game.i18n.format("AZEROTH.AegisLight.Held", { name: this.name, spell: floor.held.name }));
        return floor.amount;
      }
    } catch (err) {
      console.error("azeroth-rpg | aegis floor", err);
    }
    return amount;
  }

  /**
   * **GRANT 05's TEMPORARY HEALTH** (D-777; the lead: *"raise HP past max as temp
   * hp"*), on a creature this client may write. 05's law decides: a larger grant
   * replaces what is held, a smaller one is wasted and said so, and the same
   * source's equal grant refreshes its span (07: *a second casting replaces the
   * first*). The record names the source and the span it lasts for.
   *
   * @param {number} amount
   * @param {{source?: string, span?: "effect"|"encounter"|"longRest", effectId?: string|null, combatId?: string|null}} [o]
   *   an `encounter` span is this creature's fight unless one is named
   * @returns {Promise<{landed: boolean, temp: number, reason: string}>}
   */
  async grantTemporaryHealth(amount, { source = "", span = "longRest", effectId = null, combatId = null } = {}) {
    const record = this.getFlag("azeroth-rpg", TEMP_FLAG) ?? null;
    const fight = span === "encounter" ? (combatId ?? this.activeFight?.()?.id ?? null) : null;
    const judged = grantTemporary({ temp: this.system?.health?.temp ?? 0, record }, { amount, source, span, effectId, combatId: fight });
    if (!judged.applies) {
      if (judged.reason === "smaller") {
        ui.notifications?.info(game.i18n.format("AZEROTH.Temporary.Wasted", { name: this.name, held: judged.temp, n: wholeTemp(amount), source }));
      }
      return { landed: false, temp: judged.temp, reason: judged.reason };
    }
    await this.update({ "system.health.temp": judged.temp, [`flags.azeroth-rpg.${TEMP_FLAG}`]: judged.record });
    ui.notifications?.info(game.i18n.format("AZEROTH.Temporary.Granted", { name: this.name, n: judged.temp, source }));
    return { landed: true, temp: judged.temp, reason: judged.reason };
  }

  /**
   * **TEMPORARY HEALTH ENDS WITH WHAT GRANTED IT** (05: *It lasts as long as the
   * thing that granted it says*; D-777): at a Long Rest, at the end of the
   * holder's fight, or with the effect that carried it - `rules/temporary-health
   * .mjs#temporaryEnds` judges, this writes. Whether anything went.
   *
   * @param {{kind: string, combatId?: string|null, effectId?: string|null}} occasion
   * @returns {Promise<boolean>}
   */
  async endTemporaryHealth(occasion = {}) {
    const temp = wholeTemp(this.system?.health?.temp);
    const record = this.getFlag("azeroth-rpg", TEMP_FLAG) ?? null;
    if (!temp && !record) return false;
    if (!temporaryEnds(record, occasion)) return false;
    await this.update({ "system.health.temp": 0, [`flags.azeroth-rpg.${TEMP_FLAG}`]: null });
    if (temp > 0) {
      ui.notifications?.info(game.i18n.format("AZEROTH.Temporary.Ended", {
        name: this.name, n: temp, source: cleanTempRecord(record)?.source || game.i18n.localize("AZEROTH.Health.TemporaryUnsourced")
      }));
    }
    return true;
  }

  /**
   * The started fight this actor is in (D-627): the active encounter where
   * it holds the actor, else any started combat that does. `game.combat` is
   * whichever encounter the tracker views, which is not always the one the
   * actor is fighting in.
   */
  activeFight() {
    const holds = c => Boolean(c?.started) && (c.getCombatantsByActor(this)?.length ?? 0) > 0;
    if (holds(game.combat)) return game.combat;
    return game.combats?.find(c => holds(c)) ?? null;
  }

  /** Ranks taken of a named talent (D-627). */
  talentRanks(name) {
    return this.items.filter(i => i.type === "talent" && i.name === name).reduce((n, t) => n + (t.system?.taken ?? 0), 0);
  }

  /**
   * Whether a CLASS FEATURE (or a race's trait) of this name is held (D-768).
   * A feature is granted by the sync and never by a talent's rank, so a rule
   * that hangs on one - Unkillable, 02 §7's level 20 - asks this and not
   * `talentRanks`, which no talent named Unkillable could ever answer.
   */
  /**
   * **WHAT THE LEARNING DOOR DOES WITH A SPELL, AND WHY, IN WORDS** (07 §4, §9; the Necromancer
   * plan's learning door; the lead: *"fix this"*, and on tier 5: *"Yes the tier 5 spells learned via
   * tomes should be learnable by the GM manually to the character"*): the class that learns it, the
   * prerequisite known, the prerequisite's restriction and 07 §4's tier 3 rule
   * (`rules/spell-access.mjs#spellLearnRefusal`), then what the door does with that
   * (`learnDoor`): `allow`, `refuse` (a player; a tier 5 spell is the GM's to teach) or `confirm` (a
   * GM, whose *teach anyway* passes every gate).
   *
   * **The batch counts** (the 4a review's SHOULD-FIX): a class or a prerequisite created in the same
   * write is held for the judgement. **A grant's `spellFrom` is honoured only where the grant table
   * pairs the item it names with this spell** - this actor's items or the batch's (`spellGrantTable`,
   * `spellFromHonoured`; the 4a review's MUST-FIX 5, tightened by the fix runs' review); any other flag
   * is reported in `strip` and judged.
   *
   * A creature is held by 14's review instead (D-706).
   *
   * @param {object} data  the spell's data (`name`, `system`, `flags`, `type`)
   * @param {{batch?: object[], gm?: boolean}} [o]  the other documents of the same write, as data
   * @returns {{act: "allow"|"refuse"|"confirm", text: string|null, strip: boolean}}
   */
  learnVerdict(data = {}, { batch = [], gm = game.user?.isGM === true } = {}) {
    const allow = { act: "allow", text: null, strip: false };
    if (this.type !== "character" || data?.type !== "spell") return allow;
    const rows = (batch ?? []).filter(d => d && d !== data);
    const spellFrom = data.flags?.["azeroth-rpg"]?.spellFrom ?? null;
    if (spellFromHonoured({ spellFrom, name: data.name ?? "", grants: this.spellGrantTable({ batch: rows }) })) return allow;
    const spell = data.system ?? {};
    const knownSpells = [...this.items.filter(i => i.type === "spell").map(i => ({ name: i.name, system: i.system ?? {} })),
      ...rows.filter(d => d.type === "spell").map(d => ({ name: d.name ?? "", system: d.system ?? {} }))];
    const pre = String(spell.prerequisite ?? "").trim().toLowerCase();
    const prerequisite = pre ? (knownSpells.find(i => String(i.name).trim().toLowerCase() === pre)?.system ?? null) : null;
    const classes = [...(this.classItems ?? []).map(c => ({ name: c.name, schools: c.system?.schools ?? [] })),
      ...rows.filter(d => d.type === "class").map(d => ({ name: d.name ?? "", schools: d.system?.schools ?? [] }))];
    const refused = spellLearnRefusal({
      classes, spell, known: knownSpells.map(i => i.name), prerequisite, knownTiers: knownSpells.map(i => i.system?.tier ?? 1)
    });
    const door = learnDoor({ gm, refusal: refused, tier: spell.tier ?? 1 });
    if (door.act === "allow") return { ...allow, strip: Boolean(spellFrom) };
    const named = (spell.classes ?? []).filter(Boolean);
    const text = game.i18n.format(`AZEROTH.Spell.LearnRefused.${door.reason}`, {
      name: this.name, spell: data.name ?? "", prerequisite: refused?.prerequisite ?? "",
      classes: named.length ? named.join(", ") : game.i18n.localize("AZEROTH.Spell.LearnRefused.school")
    });
    return { act: door.act, text, strip: Boolean(spellFrom) };
  }

  /**
   * **07 §4's CAST CAP, IN WORDS** (*What you may cast is capped at your own tier, whatever a tome
   * says*; the lead, 2026-11-18: *"Yes"* to it for every class), or null: a character's spell above
   * the tier its granting class reaches on 07 §4's chart (`casting.mjs#castingReach`, a second class
   * one tier behind) is refused before anything is spent. Tier 5 is outside the cap
   * (`castCapRefusal`). **A spell a talent, a feature or a class teaches** (`spellFrom` naming an item the grant
   * table pairs with this spell, `spellGrantTable`; 07 §9) is outside the cap (D-1083; the lead's reversal of R3,
   * D-1869: *"The spells can be cast if talents give them, they shouldn't be blocked"*). A creature's
   * spells are bounded by 14's review (D-706) and an item's spell is the item's, so neither is asked.
   *
   * @param {Item|{name?: string, system?: object}} spell
   * @returns {string|null}
   */
  castCapWords(spell) {
    if (this.type !== "character" || !spell) return null;
    const spellFrom = spell.getFlag?.("azeroth-rpg", "spellFrom") ?? spell.flags?.["azeroth-rpg"]?.spellFrom ?? null;
    // **A SPELL A TALENT, A FEATURE OR A CLASS TEACHES IS NEVER CAPPED** (D-1083; the lead, 2026-11-23,
    // reversing R3: *"The spells can be cast if talents give them, they shouldn't be blocked"*; D-1869).
    if (spellFromHonoured({ spellFrom, name: spell.name ?? "", grants: this.spellGrantTable() })) return null;
    const sys = spell.system ?? {};
    const classes = (this.classItems ?? []).map((c, index) => ({
      itemId: c.id, name: c.name, schools: c.system?.schools ?? [], castingAbility: c.system?.castingAbility ?? null,
      caster: c.system?.power?.caster ?? "none", index
    }));
    const grant = grantingClass(classes, sys.school ?? null, sys.classes ?? null);
    const tier = this.system?.tier ?? 1;
    const reach = castingReach({ caster: grant?.caster ?? "full", tier: grant?.index === 1 ? secondaryTier(tier) : tier });
    const refused = castCapRefusal({ spellTier: sys.tier ?? 1, reach });
    return refused ? game.i18n.format("AZEROTH.Cast.TierCap", { name: this.name, spell: spell.name ?? "", tier: sys.tier ?? 1, reach: refused.reach }) : null;
  }

  /**
   * **THE SPELLS THIS CHARACTER'S TALENTS AND FEATURES TEACH, AS THE SYNC EMBEDS THEM** (D-642's
   * *You know Fireball*; 02 §7's Unholy Lore and Grave Calling): one `{id, name}` row a grant, `id` the
   * teaching item, `name` the spell. The sync embeds exactly these (`_syncClassFeaturesNow`), and a
   * spell's `spellFrom` is honoured at the learning door and the cast cap only where a row pairs that
   * item with that spell (`rules/spell-access.mjs#spellFromHonoured`; the fix runs' review). `batch`
   * adds the talents and features of the same write, as data.
   *
   * @param {{talents?: object[], batch?: object[]}} [o]
   * @returns {Array<{id: string, name: string}>}
   */
  spellGrantTable({ talents = null, batch = [] } = {}) {
    const rows = (batch ?? []).filter(d => d && typeof d === "object");
    const taken = [...(talents ?? this.takenTalents()), ...rows.filter(d => d.type === "talent" && (Number(d.system?.taken) || 0) > 0 && d._id).map(d => ({
      id: d._id, identifier: d.system?.identifier, className: d.system?.className, race: d.system?.race ?? null, branch: d.system?.branch ?? "",
      name: d.name ?? "", effect: d.system?.effect, taken: d.system?.taken
    }))];
    const features = [...this.items.filter(i => i.type === "feature").map(i => ({ id: i.id, name: i.name, className: i.system?.className ?? "" })),
      ...rows.filter(d => d.type === "feature" && d._id).map(d => ({ id: d._id, name: d.name ?? "", className: d.system?.className ?? "" })),
      // **A CLASS THAT TEACHES ITS SPELLS ITSELF** (02 §7's Sovereign: *Drain Life, Bloodbolt and Decree of
      // Frailty are known on top of that count*): the class item, by its name, against `FEATURE_SPELLS`.
      ...this.items.filter(i => i.type === "class").map(i => ({ id: i.id, name: i.name, className: i.name })),
      ...rows.filter(d => d.type === "class" && d._id).map(d => ({ id: d._id, name: d.name ?? "", className: d.name ?? "" }))];
    // Each row says what kind of item teaches it (`spell-access.mjs#GRANT_KINDS`; D-1862). None is
    // capped at the cast (D-1869).
    const kindOf = id => (this.items.get(id)?.type ?? rows.find(d => d._id === id)?.type ?? "feature");
    return [
      ...spellGrantsFor(taken).map(g => ({ id: String(g.talent.id), name: g.name, kind: "talent" })),
      ...featureSpellGrants(features).map(g => ({ id: g.featureId, name: g.spell, kind: kindOf(g.featureId) === "class" ? "class" : "feature" }))
    ];
  }

  /**
   * **WHY THIS CHARACTER MAY NOT LEARN A SPELL, IN WORDS**, or null - `learnVerdict` read as a
   * refusal for a player (a GM's `confirm` is a refusal too, until the GM confirms).
   *
   * @param {object} data
   * @returns {string|null}
   */
  learnRefusal(data = {}) {
    const verdict = this.learnVerdict(data);
    return verdict.act === "allow" ? null : verdict.text;
  }

  hasFeature(name) {
    return this.items.some(i => i.type === "feature" && i.name === name);
  }

  /**
   * The talents taken, as `rules/talent-effects.mjs` wants them: plain rows,
   * no documents. `dice/workflows.mjs` has kept a private copy of these three
   * lines since D-642 and `applications/actions.mjs` needs the same list for
   * the roll dialog's Damage lines (D-711 phase 2), so it lives on the actor
   * rather than in a third copy.
   */
  takenTalents() {
    return this.items
      .filter(i => i.type === "talent" && (i.system?.taken ?? 0) > 0)
      .map(i => ({
        id: i.id, identifier: i.system.identifier, className: i.system.className,
        race: i.system.race ?? null, branch: i.system.branch ?? "",
        name: i.name, effect: i.system.effect, taken: i.system.taken
      }));
  }

  /**
   * **WHAT A COUNTER OR A CHARGE BUYS ON THIS ROLL, AS IT STANDS NOW** (D-774):
   * Inner Focus's free Mana, Lava Burst's Ward ignored, Static Charge's tier on a
   * damage roll - `rules/class-talents.mjs#talentLinesFor` over the uses left on
   * each talent's own counter and the charges held. ONE reading for the dialog
   * that draws the lines and the door that judges the ticked ones again.
   *
   * @param {{roll: "spell"|"feature"|"attack", school?: string|null, damages?: boolean, mana?: number, casting?: boolean, ticks?: boolean}} o
   *   `ticks` the spell deals its damage as a tick (04's Fel Fire on Immolate, D-775)
   * @returns {Array<object>}  none for a creature
   */
  /**
   * **WHO PAYS THIS CREATURE'S MANEUVER** (06 §7; 04's Shared Quarry at rank 1, the
   * lead, 2026-10-03, on O-177: *"Maneuvers or other quarry costing features"*;
   * D-779): its own Momentum pool while it holds `amount`, else - a companion whose
   * owner holds the talent and whose owner this client may write - the owner's
   * Quarry (`rules/class-answers.mjs#momentumPayer`). The called shot's Momentum and
   * a maneuver's Use read it: the roll dialog, `rollTest` and `useManeuver`.
   *
   * @param {{amount?: number}} [options]  what is due
   * @returns {{actor: Actor, pool: object, shared: boolean}|null}
   */
  /**
   * **WHOSE COMBO POINTS A FINISHER ON THIS CREATURE'S BLOW SPENDS** (02 §7; 04's
   * Supercharge: *Your Finisher class feature may be spent on an attack one of your
   * constructs makes*; the Legacy branches' door 6): its own - or, a construct whose
   * tinker holds the talent and whom this client may write, the tinker. The roll
   * dialog's offer and `rollTest`'s payment both read it, so they cannot disagree.
   * A sibling of `momentumPayer` rather than a branch of it: Supercharge pays the
   * Finisher alone, and a maneuver's Momentum is no Finisher.
   *
   * @returns {Actor}
   */
  finisherPayer() {
    if (this.type !== "npc") return this;
    const bond = this.getFlag?.("azeroth-rpg", "bond") ?? null;
    if (bond?.kind !== "construct" || !bond.ownerUuid) return this;
    let owner = null;
    try {
      owner = fromUuidSync(bond.ownerUuid);
    } catch {
      owner = null;
    }
    if (owner?.documentName !== "Actor" || !owner.isOwner) return this;
    return constructsFor(owner.takenTalents?.() ?? [], { tier: owner.system?.tier ?? 1 }).finisher ? owner : this;
  }

  /**
   * **THE POOL THIS CHARACTER PAYS EVERY UNIVERSAL MANEUVER FROM** (the Chromatic
   * Champion plan's Draconic Discipline), read off the features it HOLDS - never its
   * class's name - or null for Momentum. `rules/maneuver-pool.mjs` is the law.
   * @returns {string|null}
   */
  get maneuverPool() {
    if (this.type !== "character") return null;
    return maneuverPoolOf((this.items ?? []).filter(i => i.type === "feature")
      .map(i => ({ name: i.name, maneuverPool: i.system?.maneuverPool ?? null })));
  }

  momentumPayer({ amount = 0 } = {}) {
    // **02's RUNIC DISCIPLINE** (*Each maneuver costs you 1 Runic Power, whatever its listed
    // price*; the Death Knight plan's door 6): the price a held feature sets, which every
    // maneuver's door reads off the payer as `price` - the called shot's included.
    const set = this.type === "character" ? maneuverPriceOf((this.items ?? []).filter(i => i.type === "feature").map(i => ({ maneuverPrice: i.system?.maneuverPrice ?? null }))) : null;
    const price = set === null ? amount : Math.min(Math.max(0, Math.trunc(Number(amount)) || 0), set);
    const priced = pick => (pick ? { ...pick, price } : null);
    // Draconic Discipline: a feature that names a maneuver pool pays every maneuver
    // from it, the called shot's Momentum included (the Chromatic Champion plan).
    const named = this.maneuverPool;
    if (named) {
      const purse = maneuverPurse(this.poolSnapshot?.() ?? [], named);
      return purse ? priced({ actor: this, pool: purse, shared: false }) : null;
    }
    // **ESSENCE NEVER PAYS A MANEUVER** (`rules/essence.mjs#paysByKind`; the Necromancer
    // plan: *It never pays for a spell, for Parry or for a maneuver*): the first Momentum pool
    // that may, and none for a character holding Essence alone.
    // **AND HATRED PAYS EVERY MANEUVER** (the Demon Hunter plan's C62: *"Hatred can pay all
    // maneuvers."*), the called shot among them, and no other cost that names no pool.
    const own = (this.system?.momenta ?? []).find(p => paysByKind(p?.name, "maneuver"))
      ?? (this.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && paysByKind(p.name, "maneuver")) ?? null;
    let owner = null;
    let quarry = null;
    // A companion's Ranger is asked WHATEVER the companion's own pool: every creature
    // holds the tool's Momentum floor, so this read `!own` and never reached the
    // Quarry at all - the price decides, in `momentumPayer` (found live in B8b).
    if (this.type === "npc") {
      const bond = this.getFlag?.("azeroth-rpg", "bond") ?? null;
      if (bond?.kind === "companion" && bond.ownerUuid) {
        try {
          owner = fromUuidSync(bond.ownerUuid);
        } catch {
          owner = null;
        }
      }
      if (owner?.documentName === "Actor" && owner.isOwner && companionSpendsFor(owner.takenTalents?.() ?? [])) {
        quarry = (owner.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === "quarry") ?? null;
      }
    }
    const pick = momentumPayer({ own, owner: quarry, shares: Boolean(quarry), amount: price });
    return pick ? priced({ actor: pick.payer === "own" ? this : owner, pool: pick.pool, shared: pick.payer === "owner" }) : null;
  }

  talentLineOffer({ roll = "spell", school = null, damages = false, mana = 0, casting = false, ticks = false, spell = "", healing = false, action = null } = {}) {
    if (this.type !== "character") return [];
    const talents = this.takenTalents();
    const left = {};
    for (const t of talents) {
      const counter = this.grantedFeature(t.id);
      if (counter?.system?.uses?.per) left[t.identifier] = Math.max(0, Math.trunc(Number(counter.system.uses.value)) || 0);
    }
    // D-779: the spell's name (04's Devouring Plague on Shadow Word: Pain), and a
    // healing feature's own action (Nature's Swiftness on a healing class feature).
    const lines = talentLinesFor(talents, {
      roll, school, damages, mana, casting, left, ticks, spell, healing, action,
      charges: Math.max(0, Math.trunc(Number(this.getFlag("azeroth-rpg", CHARGE_FLAG))) || 0),
      tier: this.system?.tier ?? 1
    });
    // **THE CHAMPION'S BRANCH SPELL LINES** (04's Lifebinder's Flame and Void Surge; stage
    // 3A): unticked, the player's to tick, judged again by `castSpell` - the split on a
    // branch spell dealing Fire (on the cast, or as Smolder's tick through Smoldering Life),
    // and a spend of Void on a branch spell that deals damage.
    if (roll === "spell" && spell) {
      const branch = Boolean(branchSpellOf(talents, spell, talentEffect));
      const form = this.shape?.kind === "drake" ? (this.shape.forms?.[0]?.name ?? null) : null;
      const split = lifebinderFor(talents, { form }, talentEffect);
      if (splitOffered(split, { branch, school, damages, ticks, spell })) {
        lines.push({ id: "talent-line-lifebinders-flame", identifier: "lifebinders-flame", name: split.by, kind: "lifebinder", amount: split.divide, left: 1, available: true, reason: null });
      }
      // On a spell whose damage is its tick (Smolder) the spend is never made - it is paid on
      // the cast's own hit - so the line is not offered there (the 3A review, should-fix 9).
      // **04's GRIT OF AGES, ECHOING SANDS AND STORM OF AGES** (stage 2b): unticked lines priced
      // in Sand, greyed with their reason where the Sand will not cover them; `castSpell`
      // judges every tick again.
      const sandHeld = (this.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === "sand")?.value ?? null;
      lines.push(...gritLines(talents, { sand: sandHeld, damages }, talentEffect));
      const echo = this.activeFight?.()?.started ? echoingSandsLine(talents, { sand: sandHeld, damages }, talentEffect) : null;
      if (echo) lines.push(echo);
      lines.push(...stormLines(talents, { spell, sand: sandHeld }, talentEffect));
      const surge = branch && damages ? voidSpendFor(talents, { tier: this.system?.tier ?? 1, form }, talentEffect) : null;
      if (surge) {
        const held = Math.max(0, Math.trunc(Number(this.system?.corruption?.void)) || 0);
        lines.push({
          id: "talent-line-void-surge", identifier: "void-surge", name: surge.by, kind: "voidSurge",
          amount: Math.min(held, surge.cap), left: held > 0 ? 1 : 0, available: held > 0, reason: held > 0 ? null : "AZEROTH.VoidSpend.NoneHeld"
        });
      }
    }
    // **A FREE CAST, ONCE PER REST** (the Chromatic Champion plan): a TICKED line on
    // the spell's own dialog, its use counted per spell on the talent item
    // (`rules/free-casts.mjs`). Only where the spell has a price to waive.
    if (roll !== "spell" || !spell || !((Number(mana) || 0) > 0)) return lines;
    const spent = Object.fromEntries(this.items.filter(i => i.type === "talent")
      .map(i => [i.id, i.getFlag?.("azeroth-rpg", FREE_CAST_FLAG) ?? []]));
    const pool = spellPayment(spellPoolFor(talents, { name: spell, school }), this.classItems ?? [])?.pool ?? null;
    // **04's STASIS LORE AND HALT THE SANDS** (D-869): the Sand line, unticked, beside the
    // free cast (`rules/sand-casts.mjs`); its rows are the Chronomancer talents'.
    const sandNow = (this.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === "sand")?.value ?? null;
    lines.push(...sandCastLines(talents, { spell, sand: sandNow }, talentEffect));
    return [...lines, ...freeCastLines(talents, { spell, spent, pool })];
  }

  /**
   * **02 §7's FOUR EMPOWER LINES AND 04's FLESH OFFERING ON A SPELL'S DIALOG** (the Necromancer
   * plan's door 2), beside `talentLineOffer`'s and in its shape: unticked, priced in Essence (or a
   * corpse), greyed with the reason in words. `castSpell` judges the ticked ones again, whole,
   * before the budget. Flesh Offering reads the spell's OWN school (O-335), never the damage it
   * deals. None for a creature.
   *
   * @param {object} spellSystem  the spell's `system`
   * @param {{mana?: number}} [o]  the Mana due before Flesh Offering
   * @returns {Array<object>}
   */
  castLineOffer(spellSystem = null, { mana = 0, priced = true } = {}) {
    if (this.type !== "character" || !spellSystem) return [];
    const essenceHeld = (this.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === ESSENCE)?.value ?? null;
    return [
      ...empowerLines(spellSystem, { essence: essenceHeld, tier: this.system?.tier ?? 1 }).map(l => ({ ...l, name: game.i18n.localize(l.name) })),
      // An item's casting and a free cast pay no Mana, so Flesh Offering has nothing to take off (`priced: false`).
      ...(priced ? fleshOfferingLines(this.takenTalents(), { school: spellSystem.school ?? null, mana }) : []),
      // 04's Skeletal Mastery's Empowered line, on Raise Dead (the 4b review's MUST-FIX 5).
      ...skeletalMasteryLines(this.takenTalents(), { identifier: spellSystem.identifier ?? null, essence: essenceHeld }),
      // 02 §7's new lead, named at a cast (the Necromancer plan's door 3).
      ...hordeLeadLines(this.#hordeStanding()).map(l => ({ ...l, name: game.i18n.localize(l.name) })),
      // 02 §7's Fel Surge (the Demon Hunter plan's C64): a line a point, judged again by `castSpell`.
      ...felSurgeLines({
        holds: this.hasFeature?.(FEL_SURGE_FEATURE) === true,
        held: (this.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === HATRED)?.value ?? 0,
        tier: this.system?.tier ?? 1, action: spellSystem.action ?? null,
        hasDamage: castDealsDamage(spellSystem), hasTest: Boolean(spellSystem.test?.resilience)
      })
    ];
  }

  /**
   * The raised dead of this Necromancer's horde standing now, and whether one leads - read off the
   * world's actors with no import of the horde's door (`rules/horde.mjs#leadFor`).
   */
  #hordeStanding() {
    // Only a Necromancer keeps a horde (02 §7), so nobody else's spell dialog reads the world's actors
    // (the final review's nit: this was the cast dialog's one O(actors) read, on every caster).
    if (!this.items.some(i => i.type === "class" && (i.name === "Necromancer" || i.system?.identifier === "necromancer"))) return { standing: 0, lead: false };
    const members = (game.actors?.contents ?? [])
      .map(a => ({ a, b: a.getFlag?.("azeroth-rpg", "bond") ?? null }))
      .filter(({ a, b }) => b?.kind === "raised" && b.horde === true && b.ownerUuid === this.uuid && b.outside !== true && (a.system?.health?.value ?? 0) > 0)
      .map(({ a, b }) => ({ id: a.id, entry: b.entryName ?? a.name, raisedAt: Number(b.since) || 0 }));
    return { standing: members.length, lead: Boolean(leadFor({ flag: this.getFlag("azeroth-rpg", HORDE_LEAD_FLAG) ?? null, members })) };
  }

  /**
   * **THE POOLS A RIDER MAY PAY FROM** (D-770, and 04's Void Surge: *spend up to your tier
   * in Void Corruption*; stage 3A): every class pool, and a character's Void track shaped as
   * one (`rules/chromatic-talents.mjs#voidPool`). The ONE list the attack's dialog, the
   * roll's judgement and its settle read, so the three cannot disagree.
   *
   * @returns {Array<object>}
   */
  riderPools() {
    const pools = this.poolSnapshot();
    return this.type === "character" ? [...pools, voidPool(this.system)] : pools;
  }

  /**
   * Write what a rider settled (D-770): the class pools through `updatePool` and a spend of
   * Void Corruption on the track, in the one update.
   *
   * @param {Array<{itemId: string|null, kind: string, value: number}>} writes
   */
  async writeRiderPools(writes = []) {
    const { pools, extra } = riderWritesSplit(writes);
    if (!pools.length && !Object.keys(extra).length) return this;
    return this.updatePool(pools, extra);
  }

  /**
   * **THE RIDERS THIS CHARACTER COULD SPEND ON AN ATTACK, AS THEY STAND NOW**
   * (04, D-770; the lead: *"Lines on attack dialog"*). ONE reading for the two
   * doors that need it: the roll dialog draws these lines, and `rollTest`
   * judges the ticked ones again at the roll, because a dialog is open for a
   * while and the pool, the form and the round move under it.
   *
   * The once-a-round mark is the combatant's own round flag in the fight this
   * actor is in (`activeFight`, never the tracker's view); out of a fight there
   * is no clock and nothing is spent - the ruling every other turn-bounded thing
   * here makes. A switched-on discount rider is an ACTIVE effect's flag.
   *
   * A rider paid BEFORE the blow from the Combat tab (the lead, 2026-10-03:
   * *"Either order"*) is `primed` on the same record, and counts only while it
   * is still this combatant's turn: *the next attack this turn* is the charge,
   * and a turn that ends without one has spent it.
   *
   * @param {{weapon?: string|null, opening?: boolean|null}} [o]  the blow's range kind,
   *   for a rider's `weapon` gate, and whether the target is under 02's Opening, for
   *   one that needs it (04's Garrote, D-773) - null where nothing could say
   * @returns {Array<object>} `rules/riders.mjs#ridersFor`'s lines; none for a creature
   */
  riderLines({ weapon = null, opening = null, target = null, unarmed = false } = {}) {
    if (this.type !== "character") return [];
    // **WHOSE POOL A RIDER PAYS FROM** (the Demon Hunter review's M2): the class item the row's class names, so a
    // Rogue and a Demon Hunter each pay their own Energy (`riders.mjs#ridersFor`'s `classPool`).
    const classPool = className => (this.classItems ?? []).find(c => c.name === className)?.id ?? null;
    const fight = this.activeFight();
    const combatant = fight ? fight.getCombatantsByActor(this)?.[0] ?? null : null;
    const round = combatant?.getFlag("azeroth-rpg", "round") ?? {};
    const thisRound = Boolean(combatant) && round.number === fight.round;
    const usedThisRound = thisRound ? [...(round.riders ?? [])] : [];
    const primed = thisRound && combatant.isCurrentTurn ? [...(round.primed ?? [])] : [];
    // **THE CLASS FEATURES THAT RIDE AN ATTACK** (02's Death Strike and Plague; the Death
    // Knight plan's doors 4 and 7): the held features' rows through the SAME reading, their
    // lines beside the talents', sorted as every line is.
    const held = featureRiders(this.items.filter(i => i.type === "feature").map(i => i.name), k => game.i18n.localize(k));
    const sharedRiderOptions = {
      pools: this.riderPools(),
      form: this.inShapeshiftForm === true,
      weapon,
      shield: this.shieldInHand === true,
      opening,
      usedThisRound,
      primed,
      activeDiscounts: riderDiscountsOf(this.effects.filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"] ?? {})),
      tier: this.system?.tier ?? 1,
      facts: target ? this.gateFacts(target) : null,
      abilities: abilityScope(this.system),
      classPool
    };
    const dkLines = held.talents.length ? ridersFor(held.talents, { ...sharedRiderOptions, rowOf: held.rowOf }) : [];
    // **AND THE DEMON HUNTER'S** (02 §7's Fel Lash and Mana Rend; the Demon Hunter plan's Phase 4a), through the
    // same reading; Fel Lash costs no Hatred while Demon Unleashed's shape stands (`freeFelLash`).
    // An unarmed strike carries neither (the review's M3: *As part of a weapon attack*; `rules/unarmed.mjs` decides).
    const dh = demonHunterRiders(this.items.filter(i => i.type === "feature").map(i => i.name), { unarmed });
    const dhLines = dh.talents.length
      // And 04's Demon's Due (Phase 5): the promise a devoured demon laid makes the next Fel Lash free too.
      ? freeFelLash(ridersFor(dh.talents, { ...sharedRiderOptions, rowOf: dh.rowOf }), {
        freeBy: felLashFreeBy({ shapeKind: this.shape?.kind ?? null, due: this.effects.some(e => e.active !== false && e.flags?.["azeroth-rpg"]?.[DEMONS_DUE.flag]) })
      })
      : [];
    // **AND THE RANGER'S** (02 §7's Aimed Shot and Kill Shot ride the attack since the class talent audit,
    // D-1872), through the same reading (`rules/audit-martial.mjs#rangerRiders`).
    const ranger = rangerRiders(this.items.filter(i => i.type === "feature").map(i => i.name));
    const rangerLines = ranger.talents.length ? ridersFor(ranger.talents, { ...sharedRiderOptions, rowOf: ranger.rowOf }) : [];
    const featureLines = [...dkLines, ...dhLines, ...rangerLines];
    return [...ridersFor(this.takenTalents(), {
      pools: this.riderPools(),
      form: this.inShapeshiftForm === true,
      weapon,
      // A blow struck WITH a shield needs one in hand (Shield Slam, D-772).
      shield: this.shieldInHand === true,
      // And one at a target under the Opening needs one (Garrote, D-773).
      opening,
      usedThisRound,
      primed,
      activeDiscounts: riderDiscountsOf(this.effects.filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"] ?? {})),
      tier: this.system?.tier ?? 1,
      // **WHAT THE TARGET IS, FOR A RIDER MADE FREE AGAINST IT** (04's Cursed Prey at
      // rank 2: *your Jinx costs no Mana against it*; the Legacy branches' door 17),
      // through the one fact-builder; null where nobody is targeted.
      facts: target ? this.gateFacts(target) : null,
      // And the striker's ability modifiers for an amount that names one (door 16).
      abilities: abilityScope(this.system),
      classPool
    }), ...featureLines].sort((a, b) => a.name.localeCompare(b.name) || a.identifier.localeCompare(b.identifier));
  }

  /**
   * **WHAT A ROW'S GATE READS ABOUT THIS CREATURE AND ONE TARGET** (the Legacy
   * branches' doors 15, 17 and 18): the ONE builder every door hands
   * `rules/talent-gates.mjs#gateHolds` - the attack's dialog lines, the roll's gains
   * after the die, the card's damage, a rider's free cost.
   *
   * - `wield`: `rules/wield.mjs#wieldFacts` off what this creature holds - a shape
   *   melds the weapons (D-769);
   * - `target`: `targetFactsOf` the snapshot - its conditions, its kinds, what this
   *   creature or one of its totems laid on it, and whether this creature's marks
   *   name it;
   * - `challenged`, `watched`: the two mark facts as names, for a row whose `when`
   *   is the word (Mak'gora's `critical`, The Challenge's `targetBoon`).
   *
   * @param {object|null} target  a target snapshot (`roll-dialog.mjs#targetSnapshots`)
   * @returns {{wield: object, target: object|null, challenged: boolean, watched: boolean}}
   */
  gateFacts(target = null) {
    const shape = this.type === "character" ? (this.shape ?? null) : null;
    const wield = wieldFacts([...(this.items ?? [])], { melded: Boolean(shape && meldsGear(shape.kind)) });
    const marks = marksFrom({
      effects: (this.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"] ?? {}),
      watch: this.getFlag?.("azeroth-rpg", WATCH_FLAG) ?? null
    });
    // *You or one of your totems* (04's Cursed Prey): the totems bound to this creature.
    const own = [this.uuid, ...(this.type === "character" ? boundOf(this, "totem").map(t => t.uuid) : [])];
    // The Quarry a Ranger's Hunter's Mark names (`combat-actions.mjs` writes the `mark` flag; D-1868).
    const quarry = this.getFlag?.("azeroth-rpg", "mark") ?? null;
    const facts = targetFactsOf(target, { own, marks: { ...marks, quarry } });
    return { wield, target: facts, challenged: facts?.challenged === true, watched: facts?.watched === true, quarried: facts?.quarried === true };
  }

  /**
   * **A SHIELD IN HAND** (D-772): one equipped and not melded into a shape
   * (D-769: *"Melds; Signatures count"*). Shield Slam's blow is struck with it,
   * and Shield of Faith's gate and the Block read the same two facts.
   */
  get shieldInHand() {
    if (!this.items.some(i => isEquippedShield(i))) return false;
    const shape = this.type === "character" ? (this.shape ?? null) : null;
    return !(shape && meldsGear(shape.kind));
  }

  /**
   * **WHETHER A TARGET IS UNDER THIS ROGUE'S OPENING, NOW** (02 §7; D-773): the
   * ONE reading the card's trade, the dialog's line and Garrote's gate ask, through
   * `rules/class-talents.mjs#openingFor` - a target not yet acted, or one 04's
   * Cheap Shot (an attack made while hidden), Overkill (its hold) or Subterfuge
   * (its mark) puts under it. Nothing for a creature that holds no Opening.
   *
   * @param {{acted?: boolean|null, actorId?: string|null, tokenId?: string|null}|null} target  a snapshot
   * @param {{hidden?: boolean}} [o]  whether the attack is made while hidden
   * @returns {{applies: boolean, why: string[]}}
   */
  openingState(target, { hidden = false } = {}) {
    if (!this.hasFeature?.("Opening")) return { applies: false, why: [], by: [] };
    return openingFor({ acted: target?.acted ?? null, hidden, ...openingEntries(this), target }, this.takenTalents());
  }

  /**
   * **WHAT THE NEXT ATTACK WAS PROMISED, AS IT STANDS NOW** (04's Precise
   * Strike, Follow Through and Vengeance; D-772): ONE reading for the dialog's
   * line and the roll that takes it, through `rules/next-attack.mjs`.
   *
   * @returns {{boons: number, penetration: number, damage: number, live: object[], lapsed: object[]}}
   */
  pendingNextAttack({ targetStatuses = null, secondRoll = false, targetKey = null } = {}) {
    // The target's conditions, where the attack names a target (07 §17's Scent of Blood; D-1370).
    // And whether this is the Attack's second roll, which alone reads a promise to every roll
    // its first roll marked (07 §11's Frost Strike; D-1711). And the target's key (its token id,
    // else its actor id) for a promise held to one creature (Overpower; D-1870).
    return pendingNextAttack(this.getFlag?.("azeroth-rpg", NEXT_ATTACK_FLAG) ?? [], { ...{ now: this.fightTurnNow(), targetStatuses, secondRoll: secondRoll === true }, targetKey });
  }

  /**
   * **WHERE THE FIGHT STANDS, AS A NEXT SPELL'S DISCOUNT READS IT** (D-771):
   * the fight this actor is in, its round, and whose turn it is - or null out
   * of one. Predator's Swiftness lays *that turn*'s discount against this.
   *
   * @returns {{combat: string, round: number, combatant: string}|null}
   */
  fightTurnNow() {
    const fight = this.activeFight?.() ?? null;
    if (!fight?.combatant) return null;
    // `turn` and `own` (the turn order's index of the turn now and of this actor's own):
    // what a promise held *before the end of your next turn* is read against (02's
    // Draconic Leap; `rules/next-attack.mjs#nextTurnStands`).
    const mine = fight.getCombatantsByActor?.(this)?.[0] ?? null;
    const own = mine ? (fight.turns ?? []).findIndex(c => c?.id === mine.id) : -1;
    return { combat: fight.id, round: fight.round, combatant: fight.combatant.id, turn: fight.turn ?? null, own: own >= 0 ? own : null };
  }

  /**
   * **THE NEXT SPELL'S DISCOUNTS THAT STILL STAND** (04's Nature's Grace and
   * Predator's Swiftness; D-771): ONE reading for the cast and its dialog,
   * through `rules/casting.mjs#pendingNextSpell`.
   *
   * @returns {{amount: number, live: object[], lapsed: object[]}}
   */
  pendingNextSpell() {
    // The world's time, which *that turn* out of a fight is counted against (D-778).
    return pendingNextSpell(this.getFlag?.("azeroth-rpg", NEXT_SPELL_FLAG) ?? [], { now: this.fightTurnNow(), time: game.time?.worldTime ?? 0 });
  }

  /**
   * **THE WARD THIS CASTER'S SPELLS OF A SCHOOL IGNORE, NOW** (04's Celestial
   * Alignment, D-771): the talents taken against the laid spell effects that
   * stand on this actor, active. Read by the cast and by an area's or a laid
   * tick's damage, so the card and the turn cannot disagree.
   *
   * @param {string|null} school  the SPELL's school
   * @returns {number}
   */
  spellWardPierce(school) {
    if (this.type !== "character" || !school) return 0;
    const standing = (this.effects?.contents ?? [])
      .filter(e => e.active !== false)
      .map(e => e.getFlag?.("azeroth-rpg", "identifier"))
      .filter(id => typeof id === "string" && id);
    return wardPierceFor(this.takenTalents(), { school, standing }).amount;
  }

  /**
   * **THE WARD THIS CASTER'S SPELLS IGNORE AGAINST ONE TARGET** (04's Pyromaniac: *Your Fire
   * spells ignore 2 Ward against a target burning from Ignite*; Lunar Guidance: *ignore 1 Ward per
   * rank against a target that has taken Arcane or Nature damage from you since the start of your
   * last turn*; the class talent audit, D-1890, D-1892): the target-gated rows alone, read off the
   * creature struck - its Ignite tick of this caster's, and this caster's Lunar mark on it - and
   * added to `spellWardPierce` by the cast and an area's or a tick's blow.
   *
   * @param {string|null} school  the SPELL's school
   * @param {{tokenId?: string|null, sceneId?: string|null, actorId?: string|null, id?: string|null}|Actor|null} target
   * @returns {number}
   */
  spellWardPierceAt(school, target = null) {
    if (this.type !== "character" || !school || !target) return 0;
    const victim = target?.documentName === "Actor" ? target
      : (target?.tokenId ? (game.scenes?.get(target.sceneId ?? canvas?.scene?.id ?? "")?.tokens?.get(target.tokenId)?.actor ?? null)
        : (target?.actorId ? (game.actors?.get(target.actorId) ?? null) : null));
    const ticks = [...(victim?.effects ?? [])].filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"]?.tick ?? null);
    const key = target?.documentName === "Actor" ? (target.token?.id ?? target.id) : (target?.tokenId ?? target?.actorId ?? target?.id ?? null);
    const mine = this.activeFight?.()?.getCombatantsByActor?.(this)?.[0] ?? null;
    const facts = {
      ignited: igniteBurning(ticks, { source: this.uuid }),
      lunarTarget: lunarDamageQualifies(mine?.getFlag?.("azeroth-rpg", LUNAR_DAMAGE_FLAG) ?? null, key)
    };
    return wardPierceFor(this.takenTalents(), { school, facts }).amount;
  }

  /**
   * The feature a taken talent granted (D-648), found by the talent's id on its
   * flag, or null: Nature's Swiftness's counter, Symbiosis's naming.
   *
   * @param {string|null} talentId
   * @returns {Item|null}
   */
  /**
   * **04's INSOLENCE REPAID ON A TEST AT A CREATURE** (the Sovereign; D-1225): the Boon this creature's promise
   * gives a Test of `kind` at the creature whose actor uuid is `targetUuid` - an attack or a Casting Test, any
   * Test at rank 2 - read off its own flag (`effects/sovereign-features.mjs` lays it and takes it). The roll
   * dialog's talent lines ask it.
   *
   * @param {string|null} targetUuid
   * @param {string} kind
   * @returns {number}
   */
  insolenceBoons(targetUuid = null, kind = "attack") {
    const held = this.getFlag?.("azeroth-rpg", INSOLENCE_FLAG) ?? [];
    if (!Array.isArray(held) || !held.length || !targetUuid) return 0;
    return insolenceBoons(held, { target: targetUuid, kind, now: game.time?.worldTime ?? 0 });
  }

  grantedFeature(talentId) {
    if (!talentId) return null;
    return this.items.find(i => i.type === "feature" && i.getFlag("azeroth-rpg", "feature")?.talentId === talentId) ?? null;
  }

  /**
   * **WHY THIS HEAL DOES NOTHING TO THIS CREATURE**, or null (D-946): the facts
   * `rules/undead.mjs#healingRefusal` reads, off the target and the giver. Undead is
   * `creature-kinds.mjs#kindsOf`'s reading, so a Forsaken, The Risen, an Undead block
   * and a Death Knight are one word.
   *
   * @param {{from?: Actor|null, spell?: boolean, school?: string|null, consumable?: boolean}} o
   * @returns {string|null}
   */
  _undeadHealingRefusal({ from = null, givenBy = null, shared = false, spell = false, school = null, consumable = false } = {}) {
    // Who gives it (`rules/undead.mjs#healGiver`): the door's `from`, a `givenBy` named
    // for this judgement alone, or another creature this door cannot name - a share, a
    // cure with no caster, an area whose caster is gone - which is closed by default.
    const named = healGiver({ from, givenBy, shared });
    if (named.foreign) {
      return healingRefusal({
        targetUndead: kindsOf(creatureSnapshot({ type: this.type, system: this.system, race: this.type === "character" ? (this.raceItem?.name ?? null) : null })).has("undead"),
        // An undead CHARACTER (`system.undead`: a Death Knight or a lich; `rules/undead.mjs
        // #undeadStanding`).
        targetDeathKnight: this.type === "character" && this.system?.undead === true,
        sourceDeathKnight: false, self: false, giver: true,
        consumable: consumable === true, spell: spell === true, school
      });
    }
    if (!named.giver) return null;
    from = named.giver;
    const self = from === this || (from?.uuid && from.uuid === this.uuid);
    const snapshot = actor => creatureSnapshot({
      type: actor?.type ?? null, system: actor?.system ?? null,
      race: actor?.type === "character" ? (actor?.raceItem?.name ?? null) : null
    });
    return healingRefusal({
      targetUndead: kindsOf(snapshot(this)).has("undead"),
      // An undead character is healed by another only through a Death spell; a giver who HEALS
      // ONLY THE UNDEAD is a Death Knight or a lich (`system.healsOnlyUndead`; the lead: *"No it
      // can't heal living targets"*), never a Forsaken.
      targetDeathKnight: this.type === "character" && this.system?.undead === true,
      sourceDeathKnight: from?.type === "character" && from?.system?.healsOnlyUndead === true,
      self: Boolean(self), giver: true, consumable: consumable === true, spell: spell === true, school
    });
  }

  /** Healing, never above the maximum; from 0 it stands you up with the Death Steps cleared (D-629). */
  /** Wipe every coating off what this actor carries (08 SS13, D-670). */
  async clearCoatings() {
    const coated = this.items.filter(i => i.getFlag("azeroth-rpg", "coating"));
    for (const item of coated) await item.unsetFlag("azeroth-rpg", "coating");
    return coated.length;
  }

  /**
   * @param {number} amount
   * @param {object} [o]
   * @param {Actor|null} [o.from]     who gives it, where somebody does
   * @param {boolean} [o.spell]       a spell restores it (the Vestments' +2)
   * @param {boolean} [o.feature]     a class feature restores it (D-771): with
   *   `spell`, what 04's Gift of Nature reaches - *your healing spells and features*
   * @param {boolean} [o.shared]      Symbiosis's own share (D-771), which never
   *   shares again
   * @param {string|null} [o.featureName]  the healing FEATURE's name, where a
   *   feature gives it (D-777): 04's Light's Grace reads *Casting Mend*
   * @param {boolean} [o.overflow]     what would land above the maximum is kept as
   *   temporary Health (07's Grave Coil and Exsanguinate; D-777)
   * @param {string} [o.overflowSource]  the spell that keeps it, for the record
   * @param {string|null} [o.school]  the SPELL's own school where a spell gives it
   *   (D-946): a Death Knight is healed by another creature's Death spell alone
   * @param {boolean} [o.consumable]  a consumable gives it (*"normal consumables act as
   *   they would for any other player"*), whoever drinks or applies it
   * @param {Actor|"other"|null} [o.givenBy]  who the heal comes from, for the undead
   *   judgement ALONE (`rules/undead.mjs#healGiver`), where the door withholds `from`:
   *   a Beacon share names its Paladin, a share or a cure with no caster says `"other"`
   * @param {string|null} [o.messageId]  the card whose heal this is, where a card's button gave it: 04's
   *   Twofold Light is judged, marked and read against its Mending Word card (the class talent audit's final review)
   */
  async applyHealing(amount, { from = null, spell = false, feature = false, shared = false, featureName = null, overflow = false, overflowSource = "", aegis = null, unreduced = false, outcome = null, branch = false, school = null, consumable = false, givenBy = null, messageId = null } = {}) {
    // Optional receipt for once-per-turn healing signatures. The Actor remains
    // the return value; incomplete downstream writes are never proof of delivery.
    if (outcome) Object.assign(outcome, { complete: false, restored: 0 });
    if (refuseIceBlockTarget(this)) {
      if (outcome) outcome.complete = true;
      return this;
    }
    // **THE UNDEAD HEALING JUDGEMENT** (D-946; `rules/undead.mjs#healingRefusal`), asked
    // before anything lands: a Death Knight's healing reaches the undead alone, and a
    // Death Knight is healed by nothing another creature does but a Death spell. Said in
    // words, and nothing lands.
    const refused = Math.trunc(amount) > 0 ? this._undeadHealingRefusal({ from, givenBy, shared, spell, school, consumable }) : null;
    if (refused) {
      ui.notifications?.info(game.i18n.format(HEALING_REFUSAL_WORDS[refused], { name: this.name, from: from?.name ?? (givenBy && typeof givenBy === "object" ? givenBy.name : "") ?? "" }));
      if (outcome) outcome.complete = true;
      return this;
    }
    // **07 §17's SOUL MARKS** (Sever the Soul: *nothing can raise or restore it*; Soul Cage: *no one but
    // you can raise, question or restore it*; run 4c-S): a dead creature so marked is restored by
    // nobody, or by its caster alone - said in words, and nothing lands.
    const soulBar = Math.trunc(amount) > 0 && (this.system?.health?.value ?? 0) <= 0
      ? soulMarkRefusal(this.getFlag?.("azeroth-rpg", SOUL_MARK_FLAG) ?? null, { by: (givenBy && typeof givenBy === "object" ? givenBy.uuid : null) ?? from?.uuid ?? null, act: "restore" })
      : null;
    if (soulBar) {
      ui.notifications?.info(game.i18n.format(`AZEROTH.NecroSpell.SoulMark.${soulBar}`, { name: this.name }));
      if (outcome) outcome.complete = true;
      return this;
    }
    const before = this.system?.health?.value ?? 0;
    // **A WRECKED CONSTRUCT TAKES NO HEALING** (04's The Bench: *rebuilding one
    // wrecked at 0 Health* takes a Short Rest and a tinker's kit; the Legacy
    // branches' door 6): The Bench's rebuild stands it up, and a heal is no rebuild
    // (MY READING, for the lead). Said, and nothing lands.
    if (this.type === "npc" && isWrecked({ kind: this.getFlag?.("azeroth-rpg", "bond")?.kind ?? null, health: before }) && Math.trunc(amount) > 0) {
      ui.notifications?.info(game.i18n.format("AZEROTH.Construct.WreckedNoHeal", { name: this.name }));
      if (outcome) outcome.complete = true;
      return this;
    }
    let healed = Math.max(0, Math.trunc(amount));
    // **04's MIRACLE** (the lead, 2026-10-03, on O-185: *"That healing spell amoutn
    // can't be reduced."*; D-779): a heal the card or its tick marks `unreduced` is
    // taken by no rung, no area and no mark below - what a talent ADDS still lands.
    const keep = unreduced === true;
    // **WHAT THE HEALER'S SIGNATURE ADDS** (08 §20, D-692). Vestments of
    // Transcendence: *a Priest wearing it restores 2 additional Health with
    // every **spell** that restores any.* It is what the bearer GIVES, so it is
    // read off `from` and not off this actor - a Priest healing themselves is
    // still the giver and still gets it - and it lands BEFORE 10's reduction,
    // because the rungs reduce what arrives.
    //
    // **AND ONLY A SPELL** (2026-09-10). It read *any* healing that named a
    // giver, so a Priest in the Vestments drinking a healing draught got the
    // +2 the chapter does not give, and so did Lay on Hands - which 02 owns as
    // a class FEATURE and CLAUDE.md §20 says is not a spell at any tier. The
    // book wins (CLAUDE.md §17), so the caller says what kind of healing this
    // is: `dice/chat.mjs` reads the card's own `kind` flag, and `useGear` and
    // `useSignature` pass nothing, which is right for both.
    if (from && spell && healed > 0) healed += Math.max(0, from.system?.signatureEffects?.healingBonus ?? 0);
    // **WHAT THE HEALER'S TALENTS ADD** (04's Gift of Nature: *Your healing
    // spells and features restore 1 further Health per rank to a target
    // suffering a condition*; D-771). Read here because only here is the
    // target known: one of A1's conditions on THIS creature, a heal given by a
    // spell or a feature, and before 10's reduction as the Vestments' is.
    if (from && healed > 0 && (spell || feature) && typeof from.takenTalents === "function") {
      const conditioned = [...(this.statuses ?? [])].some(id => Boolean(AZEROTH.conditions?.[id]));
      // The school and the feature named, and the healer's tier (Healing Hands; D-1875).
      healed += healBonusFor(from.takenTalents(), { via: spell ? "spell" : "feature", conditioned, school, featureName, tier: from.system?.tier ?? 1 }).amount;
    }
    // **04's VAMPIRIC BLOOD** (*Each time you regain Health, you regain 1 additional Health per
    // rank, for 1 minute*; run F4a): read off THIS creature's own standing state, whoever gives the
    // heal, before 10's reduction as the other raises are - the undead judgement above has said
    // whether the heal lands at all (`effects/death-knight-talents.mjs#dkHealBonus`).
    if (healed > 0 && this.type === "character") {
      const { dkHealBonus } = await import("../effects/death-knight-talents.mjs");
      healed += dkHealBonus(this, healed);
    }
    // Healing from ANOTHER creature is reduced by the Fel and Undeath rungs
    // (10 §4, §6; 2026-09-06): the card says what reached the character.
    const reduction = keep ? 0 : (this.system?.healingReduction ?? 0);
    if (from && from !== this && from.uuid !== this.uuid && reduction) {
      const received = healingReceived(healed, reduction);
      ui.notifications?.info(game.i18n.format("AZEROTH.Card.HealingReduced", { name: this.name, from: healed, to: received }));
      healed = received;
    }
    // **AND AN AREA THAT HALVES IT** (07's Graveblight, D-757): *healing it
    // receives while inside is halved* - whatever the source, the creature's
    // own included, after everything else has said what arrives.
    if (!keep && this.system?.healingHalved === true && healed > 0) {
      const received = halvedHealing(healed, true);
      ui.notifications?.info(game.i18n.format("AZEROTH.Card.HealingHalved", { name: this.name, from: healed, to: received }));
      healed = received;
    }
    // **AND WITHERING HOURS' AREA** (04: *At rank 2 or higher, a creature inside its area regains
    // only half the Health any healing gives it, rounded down*; stage 2b).
    if (!keep && healed > 0) {
      const withered = this._withered?.(healed) ?? { amount: healed, by: null };
      if (withered.by) {
        ui.notifications?.info(game.i18n.format("AZEROTH.Card.HealingHalved", { name: this.name, from: healed, to: withered.amount }));
        healed = withered.amount;
      }
    }
    // **AND A POISON CARRIED UNTIL CURED** (D12: Wound poison, *halve all healing the
    // target receives*): the factor the carrier lays, whatever the source.
    if (!keep && healed > 0) {
      const factor = healingFactorOf([...(this.effects ?? [])].map(e => e.flags?.["azeroth-rpg"]?.affliction).filter(a => a?.kind));
      if (factor < 1) {
        const received = Math.floor(healed * factor);
        ui.notifications?.info(game.i18n.format("AZEROTH.Card.HealingHalved", { name: this.name, from: healed, to: received }));
        healed = received;
      }
    }
    // **AND A BLOW THAT LEFT IT RECOVERING NONE** (04's Mortal Strike: *the
    // target recovers no Health from any source until the end of your next
    // turn*; D-772): the derived `healingBlocked` off the mark the blow laid,
    // after everything else has said what would arrive - and nothing does.
    if (!keep && this.system?.healingBlocked === true && healed > 0) {
      ui.notifications?.info(game.i18n.format("AZEROTH.Card.HealingBlocked", { name: this.name, from: healed, by: (this.system?.healingBlockedBy ?? []).join(", ") }));
      healed = healingAfterBlock(healed, true);
    }
    // **WHAT WOULD LAND ABOVE THE MAXIMUM, KEPT** (07's Grave Coil and
    // Exsanguinate: *any of it above your Health maximum is kept as temporary
    // Health until your next Long Rest*; D-777), read before the clamp eats it.
    // **04's EXQUISITE TASTE AND OVERFLOWING CUP** (the Sovereign): a heal its own spell or attack gave it by
    // damaging a creature - `from` the healer itself, no potion - gains 1 Health, and what lands above the
    // maximum is kept as temporary Health to the fight's end, up to 3 a rank plus Charisma (`healExtra`).
    const sovHeal = from === this && this.type === "character" && healed > 0 && !consumable && !overflow && !feature
      ? sovereignHealExtra({ talents: this.takenTalents(), cha: this.system?.abilities?.cha?.mod ?? 0, before, max: this.system?.health?.max ?? 0, healed })
      : null;
    if (sovHeal?.by?.length) healed = sovHeal.healed;
    const excess = overflow ? overflowTemporary({ before, max: this.system?.health?.max ?? 0, healed }) : 0;
    await this.adjustHealth(healed);
    if (this.type === "character" && before === 0 && (this.system?.health?.value ?? 0) > 0) await this.standUp();
    if (excess > 0) await this.grantTemporaryHealth(excess, { source: overflowSource, span: "longRest" });
    if (sovHeal?.temp > 0) await this.grantTemporaryHealth(sovHeal.temp, { source: "Overflowing Cup", span: "encounter" });
    // **04's UNDYING RAGE: A HEAL CANCELS THE FALL** (the lead, 2026-10-03, on O-173:
    // *"Heals cancel the fall."*; D-779): Health restored while the held rounds run
    // takes the effect off with the fall it was counting to, marked so the delete
    // hook knows it was a heal (`effects/undying-rage.mjs`).
    const restoredNow = Math.max(0, (this.system?.health?.value ?? before) - before);
    if (outcome) outcome.restored = restoredNow;
    // **08 §20's SECOND ORDINATION** (*When a spell of a Priest wearing it restores Health
    // to a creature at 0 Health, it also ends one Critical Injury that creature took this
    // encounter*; D-912): a spell's heal off 0 that restored any. Guarded: the Health stands.
    if (spell && from && before === 0 && restoredNow > 0 && (from.system?.signatureEffects?.ordination ?? []).length) {
      try {
        await this._secondOrdination?.(from);
      } catch (err) {
        console.warn("azeroth-rpg | Second Ordination", err);
      }
    }
    // **04's SHARED HOURS** (*When a spell or talent of yours gives an ally Health ... gain 1
    // Sand*; stage 2b): a heal a spell gave, or a feature a talent granted, that restored any.
    if (restoredNow > 0 && from?.type === "character" && (spell || (feature && featureName && from.items?.some?.(i => i.type === "feature" && i.name === featureName && i.getFlag?.("azeroth-rpg", "feature")?.talentId)))) {
      try {
        for (const line of (await this._sharedHoursFrom?.(from)) ?? []) ui.notifications?.info(line);
      } catch (err) {
        console.warn("azeroth-rpg | Shared Hours", err);
      }
    }
    // **04's KINDLING HEART** (*When you heal a creature with a branch spell or talent, gain
    // 1 Rage*; stage 3A): a heal that restored something, given by a Champion's branch - the
    // door says so (`branch`), or the feature named is one a Champion talent granted.
    if (restoredNow > 0 && from && (branch === true || (feature && featureName))) {
      try {
        const { branchFeatureHeal, kindleHealer } = await import("../effects/chromatic-talents.mjs");
        if (branch === true || branchFeatureHeal(from, featureName)) await kindleHealer(from);
      } catch (err) {
        console.warn("azeroth-rpg | Kindling Heart", err);
      }
    }
    // **04's TWOFOLD LIGHT AND FERVOR** (the class talent audit's Benediction, class agent A; D-1875): what a
    // heal that landed sets off for its Paladin (`effects/audit-martial.mjs#martialAfterHeal`). Guarded: the
    // Health stands whatever the share or the Zeal does.
    if (restoredNow > 0 && from) {
      try {
        const { martialAfterHeal } = await import("../effects/audit-martial.mjs");
        await martialAfterHeal({ healed: this, from, spell, school, featureName, restored: restoredNow, shared, messageId });
      } catch (err) {
        console.warn("azeroth-rpg | Twofold Light and Fervor", err);
      }
    }
    if (restoredNow > 0) {
      const held = (this.effects ?? []).filter(e => e.flags?.["azeroth-rpg"]?.[UNDYING_RAGE.flag]).map(e => e.id);
      if (held.length && this.isOwner) {
        await this.deleteEmbeddedDocuments("ActiveEffect", held, { azerothUndying: "healed" });
        ui.notifications?.info(game.i18n.format("AZEROTH.UndyingRage.Healed", { name: this.name }));
      }
    }
    // **04's DIVINE AEGIS** (*When your healing restores a target to full Health, it
    // gains Ward 1 of a number of schools equal to your rank until the end of your
    // next turn*; the lead, 2026-10-03, on O-183: *"The caster"*; D-779): the schools
    // the healer named at the cast, carried here by the card or the tick, laid as one
    // effect - a second from the same healer replaces the first - until the end of
    // the HEALER's next turn, or a round of the world's clock out of a fight.
    if (aegis && Array.isArray(aegis.schools) && aegis.schools.length && restoredToFull({ before, after: this.system?.health?.value ?? before, max: this.system?.health?.max ?? 0 }) && this.isOwner) {
      const healer = aegis.by ? (fromUuidSync(aegis.by) ?? from) : from;
      const stale = (this.effects ?? []).filter(e => e.flags?.["azeroth-rpg"]?.[DIVINE_AEGIS.flag]?.by === (aegis.by ?? null)).map(e => e.id);
      if (stale.length) await this.deleteEmbeddedDocuments("ActiveEffect", stale);
      const span = healer?.documentName === "Actor" ? (untilEndOfNextTurnOrRound(healer) ?? {}) : {};
      await this.createEmbeddedDocuments("ActiveEffect", [{
        name: game.i18n.format("AZEROTH.DivineAegis.Effect", { name: aegis.name ?? DIVINE_AEGIS.talent }),
        img: "icons/magic/holy/barrier-shield-winged-blue.webp",
        origin: aegis.by ?? null,
        description: "",
        system: { changes: aegisChanges(aegis.schools, aegis.ward ?? DIVINE_AEGIS.ward) },
        ...span,
        flags: { "azeroth-rpg": { [DIVINE_AEGIS.flag]: { by: aegis.by ?? null, schools: [...aegis.schools] } } }
      }]);
      ui.notifications?.info(game.i18n.format("AZEROTH.DivineAegis.Laid", { name: this.name, talent: aegis.name ?? DIVINE_AEGIS.talent, schools: aegis.schools.map(k => game.i18n.localize(AZEROTH.schools[k] ?? k)).join(", ") }));
    }
    // **WHAT THE HEALER'S TALENTS GRANT BESIDE THE HEALTH** (04's Living Seed: *When
    // you heal a friendly target to full Health, they gain temporary Health*;
    // Light's Grace: *Casting Mend on a target at full Health grants temporary
    // Health*; D-777), read here because only here are the Health before and after
    // known. 05's law grants each, so the larger stands.
    if (from && typeof from.takenTalents === "function") {
      const max = this.system?.health?.max ?? 0;
      const after = this.system?.health?.value ?? before;
      const seeded = healTempFor(from.takenTalents(), {
        tier: from.system?.tier ?? 1, healedToFull: before < max && after >= max, atFull: before >= max,
        feature: featureName, friendly: allyOf(from, this)
      });
      for (const g of seeded) await this.grantTemporaryHealth(g.amount, { source: g.name, span: g.span });
    }
    // **THE SHARE A SYMBIOSIS BOND PASSES ON** (04's Symbiosis, D-771): half
    // of what LANDED, rounded down, on the other partner - never the share's
    // own share. Guarded: it is bookkeeping beyond this creature, so a throw is
    // said and never undoes the heal.
    if (!shared) {
      const landed = Math.max(0, (this.system?.health?.value ?? before) - before);
      try {
        await shareHealing(this, landed);
      } catch (err) {
        console.error("azeroth-rpg | symbiosis", err);
      }
      // **AND BEACON'S** (04: *When another target within 120 feet of you
      // restores Health from your spells and effects, your chosen target
      // restores half as much, rounded down*; D-772): the HEALER's bond, off
      // what landed here, guarded as the Symbiosis share is. A Paladin healing
      // themselves is *another target* than the one chosen (MY READING, for the
      // lead: D-755's *the holder counts as an ally*).
      if (from) {
        try {
          await shareBeacon({ healed: this, from, restored: landed });
        } catch (err) {
          console.error("azeroth-rpg | beacon", err);
        }
      }
    }
    if (outcome) outcome.complete = true;
    return this;
  }

  /**
   * **WHAT A REST RESTORED, SHARED** (04's Symbiosis; the lead, 2026-10-03, on O-169:
   * *"Yes"*; D-779): the Health the rest landed, through the bond's one door
   * (`effects/symbiosis.mjs#shareHealing`). Guarded: a share is bookkeeping beyond
   * this creature, so a throw is said and never undoes the rest.
   *
   * @param {number} before  the Health before the rest wrote it
   */
  async _shareRest(before = 0) {
    const landed = Math.max(0, (this.system?.health?.value ?? before) - (Number(before) || 0));
    if (!landed) return 0;
    try {
      return await shareHealing(this, landed);
    } catch (err) {
      console.error("azeroth-rpg | symbiosis at a rest", err);
      return 0;
    }
  }

  /** The Party (the lead, 2026-09-06): a character marked as one of the players' own. */
  get isParty() {
    return this.type === "character" && this.getFlag("azeroth-rpg", "party") === true;
  }

  /** Mark or unmark this character as The Party; a GM's call. */
  async setParty(on = true) {
    if (this.type !== "character") return this;
    return on ? this.setFlag("azeroth-rpg", "party", true) : this.unsetFlag("azeroth-rpg", "party");
  }

  /**
   * A condition the body refuses (10 §4, §6; 2026-09-06): Burning cannot be
   * Blinded, Grey cannot be Poisoned, Touched by it takes no disease. The
   * one door every toggle goes through, so a card, a tick and the strip all
   * meet the same refusal.
   * @inheritDoc
   */
  async toggleStatusEffect(statusId, options = {}) {
    const wants = options.active ?? !this.statuses?.has(statusId);

    // A1: *Your Speed is 0 until you **Stand**, a Half-Action.* Standing is
    // the one condition a character ENDS by acting, and clearing the icon
    // spent nothing at all (the lead, 2026-09-07). It costs the budget only
    // in a fight, only on the way OUT of Prone, and only for a character —
    // a GM clearing it from the token HUD out of combat pays nothing, and a
    // refusal leaves the condition where it is.
    // An area that lets a creature stand for nothing (07's Tidecall, D-757:
    // *may stand from **Prone** without spending movement*) waives the charge.
    // **THE BODY IN THE SPIRIT REALM DOES NOT STAND** (06 §9: *Your body falls Prone and
    // does not move*; the B3 review): the realm's one Half-Action paid for a Stand, and
    // the Dying character walked on its next turn. Refused in words before anything is
    // spent; a door that stands the creature up for nothing (`free` - 06 §10's offer
    // taken, Ancestral Spirit's return) is no Stand and passes.
    if (!wants && statusId === "prone" && this.type === "character" && !options.free) {
      const spirit = realmRefusalFor(this, "stand");
      if (spirit) {
        ui.notifications?.warn(spirit);
        return false;
      }
    }
    // **07's EARTHEN SPIKE PINS WHAT IT KNOCKED PRONE** (*While it stands ... a creature it
    // knocked Prone cannot stand up*; the 3B review, should-fix 15): asked of the spike's own
    // Region before anything is spent, for every creature - a GM's HUD clear included, since
    // the spell names no exception - and refused in words. A door that frees for nothing
    // (`free`) is no Stand and passes; deleting the effect outright stays the GM's.
    if (!wants && statusId === "prone" && !options.free && this.statuses?.has?.("prone")) {
      const { pinnedHere } = await import("../effects/target-ground.mjs");
      const pin = pinnedHere(this);
      if (pin) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.TargetGround.Pinned", { name: this.name, spell: pin.spell }));
        return false;
      }
    }
    if (!wants && statusId === "prone" && this.type === "character" && !options.free && this.system?.standsFree !== true) {
      if (!(await game.system.azeroth.workflows.spendTurnBudget(this, "half"))) return false;
    }

    if (wants && (this.system?.conditionImmunities ?? []).includes(statusId)) {
      ui.notifications?.info(game.i18n.format("AZEROTH.Corruption.Refused", {
        name: this.name, condition: game.i18n.localize(AZEROTH.conditions?.[statusId] ?? statusId)
      }));
      return false;
    }
    if (wants && statusId === "prone" && !this.statuses?.has("prone") && await askStabilizer(this)) return false;
    // **A CARRIER IS NOT THE CONDITION** (D-997). Core finds "the effect" for a status with no
    // static id as every single-status effect holding it (14.367 `Actor#toggleStatusEffect`),
    // so a tick or affliction carrier holding the status (Frost Fever's Slowed) counted as the
    // condition both ways: ON made nothing beside it, and OFF deleted the carrier and ended the
    // disease. OFF deletes the condition's own effects and leaves every carrier standing, said in
    // words where a carrier still holds the status; ON with `ownEffect` lays the condition's own
    // effect beside a carrier (`effects/durations.mjs#applyCondition`).
    const { remove, carriers } = toggleOffTargets(this.effects ?? [], statusId);
    if (!wants && carriers.length) {
      if (remove.length) await this.deleteEmbeddedDocuments("ActiveEffect", remove.map(e => e.id));
      ui.notifications?.info(game.i18n.format("AZEROTH.Condition.CarrierHolds", {
        name: this.name, condition: game.i18n.localize(AZEROTH.conditions?.[statusId] ?? statusId),
        carrier: carriers.map(e => e.name).filter(Boolean).join(", ")
      }));
      return false;
    }
    if (wants && options.ownEffect === true && carriers.length && !conditionEffectOf(this.effects ?? [], statusId)) {
      const ActiveEffect = getDocumentClass("ActiveEffect");
      const effect = await ActiveEffect.fromStatusEffect(statusId, { parent: this });
      return ActiveEffect.create(effect.toObject(), { parent: this });
    }
    return super.toggleStatusEffect(statusId, options);
  }

  /**
   * A Death Step (06 SS8): the third is the end, said once in chat and nothing more.
   * EVERY Death Step comes through here - a failed Test at the turn's start, Bleeding
   * on the Dying, an attack against a Dying creature - so the Legacy branches' door 11
   * and 06 §10's offer have one door:
   *
   * - **04's Hold the Thread, asked BEFORE the step is written** (*A creature within 30
   *   feet that would take a Death Step does not take it*): every holder in reach, in
   *   turn, through the blow doors' own query pattern (`effects/death-holds.mjs
   *   #askDeathHold`); a yes paid its Reaction, its Mana and a use, and no step is taken.
   * - **The third step is recorded as it is taken** (`flags.azeroth-rpg.thirdStep`,
   *   `rules/death-holds.mjs#thirdStepAt`): 04's Ancestral Spirit reads *since the end
   *   of your last turn* off it.
   * - **06 §10's offer at the second step** (*When you take your second Death Step,
   *   something notices you*): a prompt the character's owner sees, its Take button
   *   the offer's own door (`effects/spirit-realm.mjs#takeOffer`). It stands until the
   *   character dies or leaves, so each Dying turn after offers it again
   *   (`AzerothCombat#_turnTicks`).
   */
  async takeDeathStep() {
    if (this.type !== "character") return this;
    // **STILL DUE, BEFORE THE ASK AND AFTER IT** (the B3 review; `rules/death-holds.mjs
    // #deathStepDue`): at 0 Health or below and short of the third step. A character
    // already at its third is past every hold, so none is asked or paid for; and a
    // holder's dialog stands open up to `ASK_MS`, so a heal, a Tether or the offer that
    // landed meanwhile leaves no step to write - and no DeathStepsOut card.
    const due = () => deathStepDue({
      type: this.type, health: this.system?.health?.value ?? null, steps: this.system?.deathSteps ?? 0, max: this.system?.deathStepLimit ?? AZEROTH.DEATH_STEPS
    });
    if (!due()) return this;
    let held = { held: false };
    try {
      held = await askDeathHold({ target: this });
    } catch (err) {
      // The ask failing takes the step, said in words and warned of (CLAUDE.md §16).
      ui.notifications?.warn(game.i18n.format("AZEROTH.DeathHold.AskFailed", { name: this.name }));
      console.warn("azeroth-rpg | hold the thread", err);
    }
    if (!held.held && !due()) return this;
    if (held.held) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.DeathHold.Held", { holder: held.holder?.name ?? "", name: this.name, talent: held.name ?? "" })}</p>`,
        // **WHO HELD WHOM, BY WHICH TALENT** (the Legacy branches' door 2): the tokens
        // the reach was measured between and the talent's key, for the hold's cue.
        flags: { "azeroth-rpg": {
          kind: "deathHold",
          featureKey: typeof held.identifier === "string" && held.identifier ? held.identifier : null,
          source: held.holderToken ?? null,
          targets: held.targetToken ? [held.targetToken] : []
        } }
      });
      return this;
    }
    const maxSteps = this.system?.deathStepLimit ?? AZEROTH.DEATH_STEPS;
    const steps = Math.min(maxSteps, (this.system?.deathSteps ?? 0) + 1);
    const fight = this.activeFight?.() ?? null;
    const started = Boolean(fight?.started);
    const third = thirdStepAt({
      steps, max: maxSteps, combatId: started ? fight.id : null, round: started ? fight.round : null,
      turn: started ? fight.turn : null, time: game.time?.worldTime ?? 0
    });
    await this.update({ "system.deathSteps": steps, ...(third ? { [`flags.azeroth-rpg.${THIRD_STEP_FLAG}`]: third } : {}) });
    const key = steps >= maxSteps ? "AZEROTH.Combat.DeathStepsOut" : "AZEROTH.Combat.DeathStep";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p class="azeroth-drain">${game.i18n.format(key, { name: this.name, steps, max: maxSteps })}</p>`,
      flags: { "azeroth-rpg": { kind: "deathStep", steps } }
    });
    if (steps === OFFER.step && offerStands({ dying: dyingNow(this), steps })) {
      try {
        await postPrompt(this, {
          purpose: "spiritOffer", noTest: true, offer: true, ownerSees: true, cardClass: "azeroth-card-critical",
          title: game.i18n.localize("AZEROTH.Spirit.Offer.Title"),
          text: game.i18n.format("AZEROTH.Spirit.Offer.Prompt", { name: this.name })
        });
      } catch (err) {
        // The prompt failing leaves the step written, said in words (CLAUDE.md §16).
        ui.notifications?.warn(game.i18n.format("AZEROTH.Spirit.Offer.Failed", { name: this.name }));
        console.warn("azeroth-rpg | the offer", err);
      }
    }
    return this;
  }

  /** Back from 0: the steps and the stabilized mark go. */
  async standUp() {
    const update = {};
    if ((this.system?.deathSteps ?? 0) > 0) update["system.deathSteps"] = 0;
    if (Object.keys(update).length) await this.update(update);
    if (this.getFlag("azeroth-rpg", "stabilized")) await this.unsetFlag("azeroth-rpg", "stabilized");
    return this;
  }

  /**
   * Apply damage to Health, floored at 0.
   *
   * The arithmetic is NOT here: `rules/mitigation.mjs` owns it, so the sheet,
   * the chat card and this method cannot disagree (CLAUDE.md §7). This only
   * writes the result.
   *
   * @param {number} damage  Damage already through armor and Ward.
   * @param {object} [o]
   * @param {boolean} [o.struck]  A blow that landed (the card's Apply), as
   *   against a hazard: the struck door (D-627) - Rage when it reaches
   *   Health, more with Enrage; Reckoning's Zeal below half; the round's
   *   was-struck mark for the Rage drain; Unkillable's floor before any of it.
   * @param {string|null} [o.messageId]  the card this Apply came from. **A mark
   *   made against ONE attack is spent by that attack** (06 §6: *reduce the
   *   damage of one attack by 4*): a Block pressed on Rothgar's swing was being
   *   spent by whichever Apply happened to be pressed first, which on a busy
   *   card is the wrong blow. A mark with no message id is a Signature's press
   *   with no card behind it and is spent by the next blow, as it always was.
   * @param {boolean} [o.attack]  Whether this blow is an ATTACK (the review of
   *   D-756, S1). An area's start-of-turn tick lands as a blow - Rage, the
   *   Prone and Critical Injury at 0, the was-struck mark, the damage type, the
   *   every-source reduction - and is no attack: a mark made against *one
   *   attack* (Battlegear of Wrath, a Parry, a Block) is left standing, and a
   *   dying character takes no Death Step from it (06 §9: *any attack against
   *   a Dying character adds a Death Step*).
   * @param {Actor|null} [o.by]  Who dealt it, where the door knows (D-768): the
   *   card's speaker, an area's caster. **What a struck blow does beyond its
   *   target runs HERE, once** - Killing Blow's Rage, a Paladin's Zeal, the
   *   attacker's damaged mark (`effects/after-blow.mjs`) - so an area's tick
   *   reaches it as a card's Apply always did. Null where nobody struck it.
   * @param {boolean} [o.spell]  Whether a SPELL dealt it (D-775): a spell's card,
   *   its area's tick or its laid tick - never a feature's, a talent's or a
   *   poison's. 04's Shadowburn (*A spell of yours that reduces a target to 0
   *   Health*) and Ruin (*When one of your spells inflicts a Critical Injury*) read it.
   * @param {boolean} [o.ignite]  Whether the blow is 04's Ignite's own tick (D-775),
   *   which lays no Ignite of its own.
   * @param {boolean} [o.moved]  The blow was MOVED here by another creature's door
   *   (04's Guardian, 02's Shield of the Righteous; D-777): it is never moved or
   *   divided again.
   * @param {boolean} [o.shared]  The blow is a SHARE of one divided among a Spirit
   *   Link (D-777): it is never moved or divided again.
   * @param {Array<object>|null} [o.parts]  the blow's second amounts, each of its
   *   own type (`mitigation.mjs#resolveDamage`'s `parts`; D-777), already in
   *   `damage`: what the damage door records of each type, and what a priest's
   *   Ward took off each.
   * @param {Actor|null} [o.dealtBy]  WHO DEALT IT, for attribution alone (D-1729): a door
   *   that names no striker - so that nothing `by` drives runs (Curse of Weakness, an
   *   after-blow, Devour Soul's record) - may still name the creature whose damage it is,
   *   as a creature's poison tick names the creature that laid it. Only the death watch's
   *   10 §3 exposure reads it; `by` wins where both are given.
   */
  async applyDamage(damage, { struck = false, attack = true, location = "body", type = null, messageId = null, by = null, riposte = false, wardTook = 0, spell = false, ignite = false, moved = false, shared = false, parts = null, drain = null, transfer = null, outcome = null, healthFloor = null, falling = false, breath = false, mitigation = null, dealtBy = null } = {}) {
    // Optional local receipt; retain the historical Actor return value. This
    // reports this actor's committed Health/temp loss, never guesses shares.
    const report = outcome && typeof outcome === "object" ? outcome : null;
    if (report) Object.assign(report, { targetUuid:this.uuid, complete:false, amount:0, dealtDamage:false, transferred:false, transfers:[] });
    const completeOutcome = () => { if (report) report.complete = true; return this; };
    if (falling === true) {
      const {equipmentFallProtected}=await import('../rules/equipment-travel.mjs');
      const protectedFall=equipmentFallProtected(this.effects,game.time?.worldTime??0);
      // This is a committed, explicitly declared landing, including zero damage;
      // readers/previews never remove the fall carrier. Timed draughts remain.
      const {landParachute}=await import('../effects/parachute.mjs');
      if(!await landParachute(this))return this;
      if(protectedFall)return completeOutcome();
    }
    if (refuseIceBlockTarget(this) || refuseDispersion(this, "damage")) {
      if (transfer) await consumeAttackTransfer(transfer, { target: this, messageId }).note("protected");
      return completeOutcome();
    }
    // **02's SUSPEND** (*While held it is Stunned and immune to damage*; stage 2b): nothing of
    // any blow lands, said in words.
    if (this._suspended?.()) {
      if (transfer) await consumeAttackTransfer(transfer, { target: this, messageId }).note("protected");
      ui.notifications?.info(game.i18n.format("AZEROTH.Chrono.SuspendImmune", { name: this.name }));
      return completeOutcome();
    }
    // **02 §5's WINGS BENEATH** (the Chromatic Outcast: *You take no damage from a fall and
    // land on your feet*; stage 3A): nothing of a fall lands, said in words.
    if (falling === true && fallHarmless(this.takenTalents?.() ?? [], talentEffect)) {
      ui.notifications?.info(game.i18n.format("AZEROTH.WingsBeneath.NoFall", { name: this.name }));
      return completeOutcome();
    }
    // **08 §20's WINDSEEKER** (Thunderfury: *a fall deals you no damage*; D-911): the
    // same door, off what is wielded.
    const fallSafe = falling === true ? (this.system?.signatureEffects?.noFallDamage ?? [])[0] ?? null : null;
    if (fallSafe) {
      ui.notifications?.info(game.i18n.format("AZEROTH.Signature.NoFall", { name: this.name, source: fallSafe }));
      return completeOutcome();
    }
    // **08 §20's UTHER'S STAND** (the Hammer of the Lightbringer: *takes no damage from
    // that attack or from any other source until the start of their next turn*; D-911):
    // the press's own effect, while it stands, takes every blow whole.
    const stand = this._signatureShield?.() ?? null;
    if (stand) {
      if (transfer) await consumeAttackTransfer(transfer, { target: this, messageId }).note("protected");
      ui.notifications?.info(game.i18n.format("AZEROTH.Signature.NoDamage", { name: this.name, source: stand.source }));
      return completeOutcome();
    }
    if (projectionPhaseFor(this)) {
      if (transfer) await consumeAttackTransfer(transfer, { target: this, messageId }).note("protected");
      ui.notifications?.info(game.i18n.localize("AZEROTH.ImageProjection.Protected"));
      return completeOutcome();
    }
    // Pin the original charged armor before any reaction or damage write.
    let innerFireSnapshot = null;
    if (struck && attack && !spell && !ignite && !moved && !shared && messageId) {
      const { innerFireHitSnapshot } = await import("../effects/inner-fire-hit.mjs");
      innerFireSnapshot = innerFireHitSnapshot(this);
    }
    const preparedTransfer = transfer ? consumeAttackTransfer(transfer, { target: this, messageId }) : null;
    const dispersedNow = async () => {
      if (!refuseDispersion(this, "damage")) return false;
      if (preparedTransfer) await preparedTransfer.note("protected");
      if (report) report.complete = true;
      return true;
    };
    const linkedTransfer = preparedTransfer?.candidate?.kind === "soulLink" ? preparedTransfer.candidate.plan : null;
    let amount = Math.max(0, Math.trunc(damage));
    // **07 §14's CURSE OF WEAKNESS** (*deals 2 less damage for the duration, and 1 less again for each
    // point of Spellpower: Shadow you carry*; run 4c-S): off every blow its bearer deals, once, before
    // the blow is moved or shared.
    if (by && amount > 0 && !moved && !shared) {
      const weaker = curseOn(by.effects ?? [], "weakness");
      if (weaker > 0) amount = Math.max(0, amount - weaker);
      // **07 §17's DECREE OF FRAILTY AND EDICT OF THE CROWN** (*each of its attacks deals 3 less damage for
      // the duration*; the plan's C11, on every attack; D-1245): the largest of the attacker's own curses,
      // off an attack alone, once, before the blow is moved or shared.
      const cursedLess = attack ? attackLessOn(by.effects ?? []) : { amount: 0, sources: [] };
      if (cursedLess.amount > 0 && amount > 0) {
        amount = Math.max(0, amount - cursedLess.amount);
        ui.notifications?.info(game.i18n.format("AZEROTH.SovSpell.AttackLess.Took", { name: by.name, n: cursedLess.amount, sources: cursedLess.sources.join(", ") }));
      }
      // **02 §7's WITHERING CONTEMPT AND 04's UNWORTHY HAND** (*each of its weapon attacks deals 3 less damage*;
      // *1 less damage per rank*; R27, R31; the plan's C11, on WEAPON attacks alone): beside the curses' own
      // step, whoever the blow strikes, once, before it is moved or shared (`sovereignBlowCut`).
      if (attack && !spell && amount > 0 && blowCutCanReach({ byEffects: by.effects, byUuid: by.uuid, byTokenUuid: by.token?.uuid ?? null, marks: preyMarksOf(game.actors) })) {
        try {
          const { sovereignBlowCut } = await import("../effects/sovereign-features.mjs");
          const withered = await sovereignBlowCut(this, by, { attack, spell, breath: Boolean(breath), ignite, struck });
          if (withered.cut > 0) {
            ui.notifications?.info(game.i18n.format("AZEROTH.Sovereign.Cut", { name: by.name, n: Math.min(amount, withered.cut), sources: withered.by.join(", ") }));
            amount = Math.max(0, amount - withered.cut);
          }
        } catch (err) {
          console.warn("azeroth-rpg | Withering Contempt", err);
        }
      }
      // **07 §17's MAJESTY UNBOUND** (*your spells and attacks deal additional Shadow damage equal to your tier
      // to your prey*; D-1240): through the prey's Shadow Ward, and the caster's heal once a turn.
      if (amount > 0 && majestyCanReach(by.effects)) {
        try {
          const { majestyOnBlow } = await import("../effects/sovereign-spells.mjs");
          const majestic = await majestyOnBlow(this, { by, amount, attack, spell });
          amount = majestic.amount;
        } catch (err) {
          console.warn("azeroth-rpg | Majesty Unbound", err);
        }
      }
    }
    let potionProtected = false;
    const preventPotionPhysical = () => {
      if (!invulnerabilityPotionActive(this.effects)) return;
      potionProtected = true;
      const protectedDamage = preventPhysicalDamage({ damage: amount, type, parts });
      amount = protectedDamage.damage;
      parts = protectedDamage.parts;
      if (!protectedDamage.prevented) return;
      ui.notifications?.info(game.i18n.format("AZEROTH.Use.InvulnerabilityPrevented", { name: this.name, n: protectedDamage.prevented }));
    };
    // Direct callers and cards captured before the potion may still carry
    // physical damage. Filter typed components before scalar actor reductions.
    // Soul Link supplies its already-resolved retained share below instead.
    if (!linkedTransfer) preventPotionPhysical();
    let before = this.system?.health?.value ?? 0;
    // What the blow found, Health and temporary Health both, for 04's Life Drain (*You
    // recover Health equal to the damage it takes*; door 25), read once it is written.
    let tookFrom = before + Math.max(0, Math.trunc(Number(this.system?.health?.temp)) || 0);
    const max = this.system?.health?.max ?? 0;
    // The shape as the blow found it (D-769): reaching 0 ends an Avatar on the
    // write itself, so `_struckBy` is told what stood before it.
    const shapeKind = this.shape?.kind ?? null;
    // A Signature pressed to take a blow down (Battlegear of Wrath's *spend 4
    // Rage as a Reaction to halve the damage of one attack that hits them*,
    // 08 SS20; D-692). **ONE BLOW, so it is a mark and not an Active Effect**:
    // *one attack* is a count, and a duration would take it off whichever blow
    // happened to land inside the span. Spent on the first blow that lands,
    // whatever the number - a press that turned out to be wasted is the
    // player's call and not the tool's.
    //
    // **06 SS6's Parry and Block ride the same mark** (D-693): Block records
    // `amount: 4` and Parry `negate: true`, because *meet or beat it and the
    // attack deals no damage* is all or nothing rather than a big subtraction.
    // One lane, so the two can never both fire on one blow.
    // **AND ONLY AN ATTACK SPENDS IT** (S1): a Consecration tick is a blow and
    // not an attack, so it never eats a mark pressed for the next swing.
    const held = struck && attack ? this.getFlag("azeroth-rpg", "mitigate") ?? null : null;
    // **THE MARK BELONGS TO THE ATTACK IT ANSWERED.** A Parry or a Block
    // records the card it was pressed on, and only that card's Apply spends it
    // (D-720). **A blow with NO card is not that card either**: the sheet's own
    // damage door, a hazard and a tick all arrive with no `messageId`, and
    // reading them as a match let the first of them eat a Block that had been
    // pressed on a swing still waiting to be applied. A mark with no message id
    // of its own is a Signature's press with no card behind it and is spent by
    // the next blow, as it always was. `rules/reactions.mjs#markAnswers` is the
    // judgement; this only writes.
    const mitigate = markAnswers(held, messageId) ? held : null;
    if (mitigate) {
      // ONE function, shared with the card's own annotation (D-681): the number
      // the button prints and the Health that is written cannot disagree.
      const taken = mitigatedDamage(amount, mitigate);
      await this.unsetFlag("azeroth-rpg", "mitigate");
      ui.notifications?.info(game.i18n.format(mitigate.negate ? "AZEROTH.Reaction.Negated" : "AZEROTH.Signature.Mitigated",
        { name: mitigate.name ?? "", from: amount, to: taken }));
      amount = taken;
    }
    // **A BLOW TAKEN ONTO SOMEBODY ELSE** (04's Guardian, 02's Shield of the
    // Righteous; D-777, the lead: *"If the talent moves damage it should just move
    // the damage as directed"*). ASKED IN THE BLOW, before anything of it touches
    // this creature - after its own Parry or Block, which answered the attack it
    // was aimed with - and a yes lands what is left of it on the holder through
    // the holder's own door; this creature takes none of it, and nothing of the
    // blow runs here. Guarded: a door beyond this creature never cancels its blow.
    if (await dispersedNow()) return this;
    if (linkedTransfer) {
      amount = linkedTransfer.damage.caster.damage;
      type = linkedTransfer.damage.caster.type;
      wardTook = linkedTransfer.damage.caster.wardTook;
      parts = linkedTransfer.damage.caster.parts ?? null;
      preventPotionPhysical();
    }
    let transferUsed = moved || shared || Boolean(linkedTransfer);
    if (struck && !transferUsed && amount > 0) {
      let redirected = { moved: false };
      try {
        if (preparedTransfer) {
          const selected = preparedTransfer.candidate?.kind === "redirect" ? preparedTransfer.candidate.plan.key : null;
          if (selected !== null) await preparedTransfer.note("redirectPending");
          redirected = await redirectBlow({ target: this, amount, type, attack, spell, messageId, by, location, parts, breath, selection: selected, mitigation });
          if (selected !== null) {
            if (!redirected.moved) {
              await preparedTransfer.note(redirected.reason === "declined" ? "redirectDeclined" : "redirectChanged");
              // A declined Guardian cannot silently bypass an active Soul Link
              // or substitute another transfer after the target made its choice.
              throw Error("Selected redirection did not land");
            }
            await preparedTransfer.note("redirectApplied");
          }
        } else redirected = await redirectBlow({ target: this, amount, type, attack, spell, messageId, by, location, parts, breath, mitigation });
      } catch (err) {
        if (preparedTransfer) throw err;
        console.error("azeroth-rpg | blow moved", err);
      }
      // **A SHARE MOVED LEAVES THE REST HERE** (04's Shared Burden: *Half the damage that
      // gets past its Armor Points and Ward, rounded down, is dealt to you instead*; the
      // Legacy branches' B6): what the holder did not take lands on this creature through
      // the rest of this door, its second amounts still its own. Guardian's whole blow
      // keeps none, as before.
      if (redirected.moved) {
        // One transfer effect per hit (lead ruling): the retained part of a
        // Shared Burden hit cannot also be divided by Spirit Link Totem.
        transferUsed = true;
        if (report) { report.transferred = true; report.transfers.push(redirected.damageOutcome ?? {complete:false}); }
        if (!(Number(redirected.kept) > 0)) return completeOutcome();
        amount = Math.trunc(Number(redirected.kept));
      }
    }
    // **02 §7's GRAVE GUARD, IN THE BLOW** (*When a blow would damage you, you may use your Reaction
    // to choose one of your raised dead within 10 feet of you. The blow damages that creature
    // instead of you ... Damage beyond that creature's Health is dealt to you*; the Necromancer
    // plan's door 8): asked after the mark and any ally's move, before this creature's own
    // reductions; what passes the servant's Health lands here through the rest of this door.
    // Guarded: a door beyond this creature never cancels its blow.
    // Whether what reaches the rest of this door is Grave Guard's overflow (Bone Shield is asked on it).
    let graveGuardOverflow = false;
    if (this.type === "character" && struck && !transferUsed && amount > 0 && this.hasFeature?.("Grave Guard")) {
      try {
        const { graveGuardInBlow } = await import("../effects/grave-guard.mjs");
        const guard = await graveGuardInBlow(this, { amount, type, attack, spell, location, by, mitigation, messageId });
        if (guard.guarded) {
          transferUsed = true;
          graveGuardOverflow = guard.overflow > 0;
          if (report) report.transferred = true;
          if (!(guard.overflow > 0)) return completeOutcome();
          amount = guard.overflow;
          parts = null;
          wardTook = 0;
          // The overflow's own record (the 4b review's S3): the servant-met blow less its room.
          mitigation = guard.record ?? null;
        }
      } catch (err) {
        console.warn("azeroth-rpg | Grave Guard", err);
      }
    }
    // **04's ICEBOUND FORTITUDE, IN THE BLOW** (*That blow, and each blow until the end of your
    // next turn, deals half its damage to you, rounded down, before Armor Points and Ward apply*;
    // the lead: *"before AP or ward"*; run F4a): where the state stands the blow is halved, and
    // where it does not the knight is asked first (`effects/death-knight-talents.mjs
    // #iceboundInBlow`) - after the mark and the move, so a Parry that negates the blow or a blow
    // taken onto somebody else asks nothing. Where the card recorded the resolver's inputs
    // (`mitigation`), the halving lands BEFORE Armor Points and Ward. Guarded: the blow stands.
    if (this.type === "character" && struck && !linkedTransfer && amount > 0) {
      try {
        const { iceboundInBlow } = await import("../effects/death-knight-talents.mjs");
        const iced = await iceboundInBlow(this, { amount, mitigation, parts, wardTook });
        amount = iced.amount;
        // What reaches the doors below is the HALVED blow, its second amounts and Ward credit
        // with it (the F4a review, S1): Ethereal Form, Atonement and a Legendary's after-blow
        // read `parts` and `wardTook`, never the blow as it was before the halving.
        if (iced.cut > 0) {
          parts = iced.parts ?? parts;
          wardTook = iced.wardTook ?? wardTook;
        }
      } catch (err) {
        console.warn("azeroth-rpg | Icebound Fortitude", err);
      }
    }
    // **07 §17's BONE SHIELD, IN THE BLOW** (*When an attack hits you, you take 6 less damage from that
    // attack*; run 4c-S): asked of the Necromancer struck, after the mark and any move, a yes casting the
    // spell there with its Reaction, its Mana and its Casting Test; what reaches this door is the blow
    // less the shield, and 04's Barbed Bone strikes the attacker. Guarded: the blow stands.
    // **AFTER ICEBOUND FORTITUDE'S HALVING** (D-1098, D-1099; D-777's order): Icebound halves the blow
    // before Armor Points and Ward, re-resolving the card's record, and 6 less is taken off what then
    // arrives - asked before it, Icebound's re-resolution would write the shield back out.
    // **AND ON GRAVE GUARD'S OVERFLOW** (the lead, 2026-11-19: *"yes it should"*): where Grave Guard
    // moved the attack onto a raised dead and the damage beyond its Health reaches the Necromancer, that
    // overflow is an attack that hits them, so Bone Shield is asked on it - once, here, with its own
    // deadline, Reaction and Mana - and Barbed Bone fires as usual. Every other transfer still asks nothing.
    if (this.type === "character" && struck && attack && (!transferUsed || graveGuardOverflow) && !linkedTransfer && amount > 0) {
      try {
        const { boneShieldInBlow } = await import("../effects/necromancer-spells.mjs");
        const shield = await boneShieldInBlow(this, { amount, attack, by });
        if (shield.shielded) {
          amount = shield.amount;
          parts = null;
          if (!(amount > 0)) return completeOutcome();
        }
      } catch (err) {
        console.warn("azeroth-rpg | Bone Shield", err);
      }
    }
    // **07 §17's MIRROR OF SELF** (*When an attack hits you, you gain 8 temporary Health before its damage
    // applies*; D-1240): asked in the blow as Bone Shield is, its temporary Health landing before 05's
    // temporary Health takes the blow below.
    if (this.type === "character" && struck && attack && !moved && !shared && !linkedTransfer && amount > 0 && mirrorCanReach(this.items)) {
      try {
        const { mirrorInBlow } = await import("../effects/sovereign-spells.mjs");
        await mirrorInBlow(this, { amount, attack, by });
      } catch (err) {
        console.warn("azeroth-rpg | Mirror of Self", err);
      }
    }
    // **08 §20's FOROR'S LESSON** (Quel'Serrar: *A breath weapon deals you half its damage,
    // rounded down*; the lead, on O-319: *"Abilities and spells named Breath"*; D-912): the
    // card's record (`breath`: its title, feature key and spell name) is judged by the
    // reader of the creature the breath REACHES - after the move step, beside Ethereal
    // Form's halving (D-914, the final review), so a blow moved onto a holder carries
    // `breath` and halves there, and a blow kept here halves here.
    if (breath && !linkedTransfer && amount > 0) amount = this._breathHalved?.(amount, breath) ?? amount;
    // **04's ETHEREAL FORM** (*Until your next turn physical damage you take is halved,
    // rounded down*; the Legacy branches' door 10): the physical share of what reaches
    // this creature - after its own Parry or Block and after a blow moved onto it lands
    // through its own door, before every standing reduction (a halving halves the whole
    // blow first, the mark's own rule). A blow's second amounts keep their own types
    // (D-777); one of an unnamed type is read as physical (MY READING, for the lead: a
    // creature's attack row names no type for its claws).
    if (await dispersedNow()) return this;
    const ethereal = !linkedTransfer && amount > 0 ? (preparedTransfer
      ? preparedTransfer.input.ethereal ? { source: "Ethereal Form" } : null : etherealOn(this)) : null;
    const damageStages = linkedTransfer
      ? { standingDamage: amount, standingTook: linkedTransfer.damage.plan.standingPrevented }
      : damageTransferStages({ amount, type, parts, ethereal: Boolean(ethereal),
        standing: preparedTransfer?.input.standingReduction ?? this.system?.damageReduction ?? 0 });
    if (ethereal) {
      if (damageStages.etherealPrevented > 0) {
        ui.notifications?.info(game.i18n.format("AZEROTH.Ethereal.Halved", { name: this.name, source: ethereal.source, from: amount, to: damageStages.etherealDamage }));
        amount = damageStages.etherealDamage;
      }
    }
    // **WHAT SOMEBODY ELSE'S SIGNATURE TAKES OFF** (the Bulwark of Tyr's Hand,
    // 08 SS20; D-696): *every other member of your party within 15 feet takes 5
    // less damage from every source.* A STANDING number and not a mark - it is
    // never spent, because *every source* is every blow - so it sits below the
    // one-blow mitigation above rather than inside it. `system.damageReduction`
    // is derived on both actor models and `effects/auras.mjs` is what writes it.
    //
    // **AFTER the mark**, so a Parry that negates leaves nothing for this to
    // take and a halving halves the whole blow first, which is the reading that
    // does not charge the bearer twice for one Reaction. **And on a hazard as
    // readily as on a blow**, since `struck` is not tested: *from every source*
    // is the sentence. A1's Bleeding and Scorched go through `adjustHealth`
    // rather than this door and are untouched, exactly as armor and Ward are.
    const standing = preparedTransfer?.input.standingReduction ?? Math.max(0, Math.trunc(this.system?.damageReduction ?? 0));
    // What the standing reduction took off this blow (D-774): a priest's Ward
    // carrying Shield Discipline's reduction prevented that much (Atonement).
    amount = damageStages.standingDamage;
    const standingTook = damageStages.standingTook;
    // **04's MARROWGUARD** (*While one of your skeletons is adjacent to you, the Physical damage an
    // attack deals you falls by your rank*; Phase 4c-T): a standing reduction on an attack's Physical
    // share alone, beside the others (`effects/necromancer-talents.mjs#marrowguardOn`). Guarded.
    if (this.type === "character" && struck && attack && !linkedTransfer && amount > 0) {
      try {
        const { marrowguardOn } = await import("../effects/necromancer-talents.mjs");
        const guarded = await marrowguardOn(this, { amount, type, parts, attack: true });
        if (guarded.cut > 0) {
          amount = guarded.amount;
          parts = guarded.parts ?? parts;
        }
      } catch (err) {
        console.warn("azeroth-rpg | Marrowguard", err);
      }
    }
    // **07 §17's SANGUINE BARRIER** (*each weapon attack that hits you deals less damage. The reduction is half your
    // Constitution modifier, rounded down, and at least 1*; D-1363): a standing reduction on a WEAPON attack alone - an
    // attack that is no spell, Withering Contempt's reading (`isWeaponBlow`) - the largest standing, once.
    if (struck && attack && !spell && !linkedTransfer && amount > 0) {
      const barrier = weaponLessOn(this.effects ?? []);
      if (barrier.amount > 0) {
        ui.notifications?.info(game.i18n.format("AZEROTH.SovSpell.Barrier.Took", { name: this.name, n: Math.min(amount, barrier.amount), sources: barrier.sources.join(", ") }));
        amount = Math.max(0, amount - barrier.amount);
      }
    }
    // Keep surviving additional lanes bounded after the flat reduction, before
    // a new Wounded Beast amount is added to the main lane.
    if (potionProtected) preventPotionPhysical();
    // **WOUNDED BEAST'S PRICE** (04: *every attack that damages you deals 1 more
    // damage per rank*; D-772). It was built for the Rating the Warrior deals and
    // never for what an attack on them deals. An ATTACK that still gets through
    // after the mark and the standing reduction - a tick, a hazard and a
    // retaliation are no attack - and read by name, the inline row's own way.
    const woundedRanks = linkedTransfer ? 0 : preparedTransfer?.input.woundedRanks
      ?? (struck && attack ? (this.talentRanks?.("Wounded Beast") ?? 0) : 0);
    if (woundedRanks > 0 && amount > 0) {
      const taken = woundedBeastTaken({ amount, attack: true, ranks: woundedRanks });
      ui.notifications?.info(game.i18n.format("AZEROTH.Card.WoundedBeastTaken", { name: this.name, from: amount, to: taken }));
      amount = taken;
    }
    // Wounded Beast can add new damage of the main type after protection.
    // Only re-read lanes already normalized above; never reinterpret stale
    // physical parts after an intervening Ethereal Form halving.
    if (potionProtected) preventPotionPhysical();
    // **DIVIDED AMONG A SPIRIT LINK** (04's Spirit Link Totem; D-777): what this
    // creature takes is divided evenly among every ally within 20 feet of the
    // totem, no one asked; this creature keeps its share and the remainder, and
    // the others' land once its own Health is written. Judged before anything is
    // written: a share another user's creature takes needs a GM.
    let division = null;
    let divisionRecord = null;
    if (struck && !transferUsed && amount > 0) {
      try {
        if (preparedTransfer) {
          const selected = preparedTransfer.candidate?.kind === "division" ? preparedTransfer.candidate.plan.key : null;
          division = divideBlow({ target: this, amount, selection: selected });
          if (selected !== null && !division) throw Error("Selected division changed");
        } else division = divideBlow({ target: this, amount });
      } catch (err) {
        if (preparedTransfer) throw err;
        console.error("azeroth-rpg | blow divided", err);
      }
      // **THE DIVISION'S RECORD** (O-362; run close-F2): the blow's resolver record, handed to the
      // others' shares only where it still resolves to exactly the amount divided - a Block, a
      // standing reduction or this creature's own halving changed the blow, and then each share
      // is halved as it arrives.
      if (division) {
        const carried = mitigation ? recordOf(mitigation) : null;
        divisionRecord = carried && resolveRecord(carried).damage === amount ? carried : null;
        amount = division.keep;
      }
    }
    // **07 §12's DILATION** (D-866): *it takes half, rounded up, and the other half at the
    // start of its next turn* - in a started fight the half put off waits on the creature's
    // list, landed by `effects/deferred-damage.mjs#landDeferred` at its turn's start with
    // `deferred: true`, which never puts it off a second time. Out of a fight it lands now.
    // The split is worked out here and WRITTEN just before the Health (the 2a review, M2).
    const deferredPlan = amount > 0 ? (this._deferBlow?.(amount, { type, by }) ?? null) : null;
    if (deferredPlan) amount = deferredPlan.now;
    // Only the original claimed attack offers the belt. Transferred shares and
    // ongoing/environmental damage cannot create a fresh hit trigger.
    if(struck&&attack&&!moved&&!shared&&!linkedTransfer&&messageId){
      const {offerHarmPrevention}=await import('../effects/harm-prevention.mjs');
      if(!await offerHarmPrevention(this,messageId))return this;
      before=this.system?.health?.value??0;
      tookFrom=before+Math.max(0,Math.trunc(Number(this.system?.health?.temp))||0);
    }
    // **05's TEMPORARY HEALTH FIRST** (D-777; the lead: *"raise HP past max as temp
    // hp"*): *Damage comes off temporary Health first, and only what is left over
    // touches your own.* Written beside the Health in the one update below.
    const soaked = absorbDamage({ temp: this.system?.health?.temp ?? 0, amount });
    if (soaked.absorbed > 0) ui.notifications?.info(game.i18n.format("AZEROTH.Temporary.Absorbed", { name: this.name, n: soaked.absorbed }));
    amount = soaked.amount;
    // **04's UNMARRED** (*Once a round, when your temporary Health, from any source, absorbs all of a blow's
    // damage, gain 1 Tribute*): a blow the temporary Health took whole (`sovereignAbsorbed`). Guarded.
    if (struck && soaked.absorbed > 0 && soaked.amount === 0 && this.type === "character" && this.talentRanks?.("Unmarred") > 0) {
      try {
        const { sovereignAbsorbed } = await import("../effects/sovereign-features.mjs");
        await sovereignAbsorbed(this, { absorbed: soaked.absorbed, reached: soaked.amount });
      } catch (err) {
        console.warn("azeroth-rpg | Unmarred", err);
      }
    }
    const {manaShieldFor}=await import('../effects/mana-shield-payment.mjs');
    const shield=manaShieldFor(this,amount);
    if(shield)amount=shield.damage;
    // The Health floor a standing effect sets (`rules/sealing-flame.mjs#damageAboveHealthFloor`).
    amount = damageAboveHealthFloor(this.system?.health?.value, amount, healthFloor);
    // **04's BORROWED TIME, ASKED ONCE WHAT REACHES THE HEALTH IS KNOWN** (the Chronomancer's
    // Guardian of Time, stage 2c: *As a Reaction when a blow reduces your Health, spend 1 Sand.
    // Take half its damage now, rounded up. At the start of your next turn, take the other half
    // minus your rank.*), and Timeless Sentinel's free use of it: after the blow's own
    // mitigation, the move, the division, Dilation's split, the harm prevention, **temporary
    // Health, Mana Shield and the floor** (D-880: a blow they take whole reduces no Health, so
    // it is not asked and costs no Sand and no Reaction, and what it halves is what would reach
    // the Health), and before the hold at 1 - a halved blow may drop nobody. The half put off is
    // written on the put-off list just before the Health, beside Dilation's, and lands at the
    // turn's start through `_landPutOff` (D-866's carrier); a moved blow (the Sentinel's,
    // Interposed Moment's) is a blow on this creature too. Guarded: an ask that fails leaves
    // the blow whole, said as a warning.
    let borrowed = null;
    if (struck && amount > 1) {
      try {
        borrowed = await askToBorrow({ target: this, amount, type, by });
      } catch (err) {
        console.warn("azeroth-rpg | borrowed time", err);
        borrowed = null;
      }
      if (borrowed?.borrowed) amount = borrowed.now;
    }
    // **THE ONE HOLD AT 1** (D-777): 07's Aegis floor, then the creature's own
    // Unkillable and Cauterize, then another creature's talent, asked in the blow.
    const hold = await this._holdAtOne({ before, amount, attack, struck });
    if (await dispersedNow()) return this;
    amount = hold.amount;
    const seductionHarm = by?.uuid ? await import("../effects/seduction-harm.mjs") : null;
    const seductionSnapshot = seductionHarm?.seductionHarmSnapshot(this, by) ?? [];
    const mindSootheHarm = await import("../effects/mind-soothe.mjs");
    const mindSootheBefore = mindSootheHarm.mindSootheSnapshot(this);
    const healthBeforeSeductionHarm = (this.system?.health?.value ?? 0) + Math.max(0, Number(this.system?.health?.temp) || 0);
    const devourMagic = struck && attack && !spell && !shared && !ignite && !moved && by?.type === "npc" && messageId
      ? await import("../effects/devour-magic-wound.mjs") : null;
    const devourWound = devourMagic?.captureDevourMagicWound({ target: this, attacker: by, messageId });
    if (preparedTransfer) await preparedTransfer.note("originalPending");
    if (await dispersedNow()) return this;
    const healthBeforeWrite = (this.system?.health?.value ?? 0) + Math.max(0, Number(this.system?.health?.temp) || 0);
    const healthBeforeHoly = this.system?.health?.value ?? 0;
    // Dilation's half put off, written now that nothing above can refuse the blow (M2).
    if (deferredPlan?.row) await this._writeDeferred(deferredPlan.row, deferredPlan.now);
    // Borrowed Time's half, written the same way (stage 2c), and its card once it is.
    if (borrowed?.row) await this._writeDeferred(borrowed.row, borrowed.now);
    if (borrowed?.borrowed) {
      const { borrowedCard } = await import("../effects/guardian.mjs");
      await borrowedCard(this, borrowed).catch(err => console.warn("azeroth-rpg | borrowed time card", err));
    }
    // Borrowed Hour's use and the rest of its blow, written the same way (the stage 3 fix): a
    // blow refused after the hold - a late dispersal - strands no row and spends no use.
    if (hold?.borrowedHour) {
      const { commitBorrowedHour } = await import("../effects/guardian.mjs");
      await commitBorrowedHour(this, hold.borrowedHour).catch(err => console.warn("azeroth-rpg | borrowed hour", err));
    }
    // **THE BLOW THAT REACHES ONE OF THE RAISED DEAD'S HEALTH** (04's Restless Bones: *from anything but
    // Holy damage*; Phase 4c-T): its type, written on the creature just before the Health, so the death
    // watch's raised-dead event reads the killing blow off it (`rules/necromancer-talents.mjs
    // #killingBlowType`). Past every refusal above; guarded, so the blow stands whatever it says.
    if (amount > 0 && this.getFlag?.("azeroth-rpg", "bond")?.kind === "raised" && this.isOwner) {
      try {
        const { killingBlowType } = await import("../rules/necromancer-talents.mjs");
        await this.setFlag("azeroth-rpg", "lastBlow", { type: killingBlowType({ type, parts }) });
      } catch (err) {
        console.warn("azeroth-rpg | the last blow's type", err);
      }
    }
    // **02's DEVOUR SOUL: *a creature you damaged this round*, BY ANY MEANS** (the Demon Hunter review's M5; the
    // orchestrator's ruling): a spell's, an area's or an attack's damage landing on this creature is put on the
    // hunter's record here, before the Health is written, so the death watch's offer finds it - and 04's Tear the Soul
    // gives its free devour only to the attack's blow that drops the creature to 0 (L15). Asked only of a Demon Hunter.
    if (by && by !== this && by.type === "character" && (amount > 0 || soaked.absorbed > 0)
      && by.items?.some?.(i => i.type === "class" && i.system?.identifier === "demon-hunter")) {
      try {
        const { noteDamagedBy } = await import("../effects/demon-hunter-features.mjs");
        await noteDamagedBy(by, this, { attack: attack === true && spell !== true, drops: amount > 0 && amount >= (Number(this.system?.health?.value) || 0) });
      } catch (err) {
        console.warn("azeroth-rpg | Devour Soul's record of a creature damaged", err);
      }
    }
    await this.adjustHealth(-amount, { temp: soaked.temp, damage: true, manaShield:shield, by: by ?? dealtBy });
    // **WHAT A HOLD LANDS ONCE THE HEALTH IS WRITTEN** (04's Too Beautiful to Die: *You gain 3 temporary Health
    // for each Tribute you spend*): after the blow's own temporary Health is written, never under it. Guarded.
    if (typeof hold?.afterWrite === "function") {
      try {
        await hold.afterWrite();
      } catch (err) {
        console.warn("azeroth-rpg | a hold's after-write", err);
      }
    }
    // **02 §7's ROYAL DUE** (*Once a turn, when your spell or attack damages your prey, you may spend 2
    // Tribute*): an offer card for the Sovereign who dealt it, judged there (`offerRoyalDue`). Guarded.
    if (by && amount > 0 && (attack || spell) && by.type === "character" && by.hasFeature?.("Royal Due")) {
      try {
        const { offerRoyalDue } = await import("../effects/sovereign-features.mjs");
        await offerRoyalDue({ by, target: this, dealt: amount, attack, spell });
      } catch (err) {
        console.warn("azeroth-rpg | Royal Due", err);
      }
    }
    const healthAfterWrite = (this.system?.health?.value ?? 0) + Math.max(0, Number(this.system?.health?.temp) || 0);
    const healthAfterHoly = this.system?.health?.value ?? 0;
    let verdict = null;
    const verdictTicket = messageId && game.messages?.get(messageId)?.flags?.["azeroth-rpg"]?.verdictTicket;
    if (verdictTicket) {
      const markVerdictPending = async () => {
        const stored = this.flags?.["azeroth-rpg"]?.verdictDamagePending;
        const entries = Array.isArray(stored) ? stored : stored ? [stored] : [];
        await this.setFlag("azeroth-rpg", "verdictDamagePending", [
          ...entries.filter(entry => entry?.messageId !== messageId),
          { ticket: verdictTicket, messageId, healthBefore: healthBeforeHoly, healthAfter: healthAfterHoly }
        ]);
      };
      try {
        const { resolveVerdictDamage } = await import("../effects/thematic-holy.mjs");
        const resolved = await resolveVerdictDamage({ messageId, target: this,
          healthBefore: healthBeforeHoly, healthAfter: healthAfterHoly });
        if (resolved?.ok) {
          verdict = resolved;
          if (verdict.stabilizeAtZero) await this.setFlag("azeroth-rpg", "stabilized", true);
        } else if (["unanswered", "noGM"].includes(resolved?.reason) || !resolved) {
          // The GM may have committed the receipt before its reply was lost.
          // Hold only new injuries until that consequence can be reconciled.
          verdict = { suppressNewCriticalInjury: true, pending: true };
          await markVerdictPending();
          ui.notifications?.warn(game.i18n.localize("AZEROTH.Holy.DamageUnconfirmed"));
        } else {
          console.warn("azeroth-rpg | Gentle Verdict damage refused", resolved.reason);
          ui.notifications?.warn(game.i18n.localize("AZEROTH.Holy.DamageUnconfirmed"));
        }
      } catch (error) {
        verdict ??= { suppressNewCriticalInjury: true, pending: true };
        if (verdict.pending) {
          try {
            await markVerdictPending();
          } catch (markerError) {
            console.warn("azeroth-rpg | Gentle Verdict pending marker", markerError);
          }
        }
        console.warn("azeroth-rpg | Gentle Verdict damage", error);
        ui.notifications?.warn(game.i18n.localize("AZEROTH.Holy.DamageUnconfirmed"));
      }
    }
    // Mindlink shares the shock of committed damage, including temporary
    // Health loss. The GM resolves private membership and boundary crossings.
    if (healthAfterWrite < healthBeforeWrite
      && [...this.effects ?? []].some(effect => effect.flags?.["azeroth-rpg"]?.mindlinkChannel)) {
      try {
        const { requestMindlinkDamage } = await import("../effects/thematic-shadow.mjs");
        const result = await requestMindlinkDamage({ actor: this, before: healthBeforeWrite,
          after: healthAfterWrite, eventId: foundry.utils.randomID() });
        if (result?.ok === false) throw new Error("Mindlink shock could not be confirmed");
      } catch (error) {
        console.warn("azeroth-rpg | Mindlink damage shock", error);
        ui.notifications?.warn(game.i18n.localize("AZEROTH.ThematicShadow.ShockUnresolved"));
      }
    }
    // Outside damage wakes a Dream Theatre participant, including damage
    // absorbed by temporary Health. Run before any subsequent healing.
    if (healthAfterWrite < healthBeforeWrite
      && [...this.effects ?? []].some(effect => effect.flags?.["azeroth-rpg"]?.dreamTheatre)) {
      try {
        const { endDreamOnDamage } = await import("../effects/thematic-dream.mjs");
        const ended = await endDreamOnDamage(this, healthBeforeWrite, healthAfterWrite);
        if (ended?.ok === false) throw new Error(ended.reason ?? "Dream departure was refused");
      } catch (error) {
        console.warn("azeroth-rpg | Dream Theatre damage departure", error);
        ui.notifications?.warn(game.i18n.localize("AZEROTH.Dream.DamageCleanup"));
      }
    }
    // **WHAT 08 §20's LEGENDARIES DO ONCE A BLOW HAS LANDED** (D-911): Emerald
    // Slumber's Stun ends on damage, Adaptive Scales lays its Ward, and a kill pays
    // The Tusk Taken and Fel-touched's Greater Test. Guarded: a door beyond this
    // blow never cancels it.
    if (healthAfterWrite < healthBeforeWrite) {
      try {
        await this._legendaryAfterBlow?.({ before: healthBeforeHoly, after: healthAfterHoly, type, parts, by });
      } catch (error) {
        console.warn("azeroth-rpg | a Legendary after the blow", error);
      }
    }
    // Mending is triggered by actual, nonlethal Health loss, never temporary
    // Health alone. Resolve before another reaction can change that snapshot.
    if (healthAfterHoly > 0 && healthAfterHoly < healthBeforeHoly
      && [...this.effects ?? []].some(effect => effect.flags?.["azeroth-rpg"]?.holyMending)) {
      try {
        const { mendingAfterDamage } = await import("../effects/thematic-holy.mjs");
        const result = await mendingAfterDamage({ targetUuid: this.uuid,
          eventId: foundry.utils.randomID(), healthBefore: healthBeforeHoly,
          healthAfter: healthAfterHoly, sourceMessageId: messageId });
        if (result?.ok === false) throw new Error(result.reason ?? "Mending could not be resolved");
      } catch (error) {
        console.warn("azeroth-rpg | Prayer of Mending damage", error);
        ui.notifications?.warn(game.i18n.localize("AZEROTH.Holy.DamageUnconfirmed"));
      }
    }
    if (mindSootheBefore.length) {
      try {
        await mindSootheHarm.endMindSootheOnDamage(this, mindSootheBefore,
          Math.max(0, Math.min(amount + soaked.absorbed, healthBeforeWrite - healthAfterWrite)));
      } catch (error) {
        console.warn("azeroth-rpg | Mind Soothe cleanup", error);
        ui.notifications?.warn(game.i18n.localize("AZEROTH.Compel.MindSootheCleanup"));
      }
    }
    if (report) {
      report.manaAbsorbed=shield?.absorbed??0;
      report.amount = Math.max(0, Math.min(amount + soaked.absorbed, healthBeforeWrite - healthAfterWrite));
      report.dealtDamage = report.amount > 0;
      report.transferred = report.transferred || Boolean(division?.others?.some(part => part.share > 0) || linkedTransfer);
    }
    if (healthAfterWrite === healthBeforeWrite && await dispersedNow()) return this;
    if (preparedTransfer) await preparedTransfer.note("originalApplied");
    if (devourWound) {
      const recorded = await devourMagic.recordDevourMagicWound(devourWound, amount + soaked.absorbed);
      if (!recorded.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.DevourMagic.WoundUnconfirmed"));
      else if (recorded.wounded) {
        try {
          const { postDevourMagicPrompt } = await import("../effects/devour-magic-use.mjs");
          if (!await postDevourMagicPrompt({ message: game.messages.get(messageId), target: this })) throw Error("Missing prompt");
        } catch (error) {
          console.warn("azeroth-rpg | Devour Magic prompt", error);
          ui.notifications?.warn(game.i18n.localize("AZEROTH.DevourMagic.PromptFailed"));
        }
      }
    }
    // **07 §17's ROYAL COMMAND AND GRANT AN AUDIENCE** (*The spell ends if you or your allies harm the
    // target*; D-1240): a blow that took anything from the creature, dealt by the caster or an ally of it.
    if (by && amount + soaked.absorbed > 0 && harmEndsCanReach(this.effects)) {
      try {
        const { endOnHarm } = await import("../effects/sovereign-spells.mjs");
        await endOnHarm(this, by);
      } catch (err) {
        console.warn("azeroth-rpg | a command ended by harm", err);
      }
    }
    // **07 §17's BURDEN OF SIN** (*each time it damages a creature with an attack, it takes 3 Shadow damage*; D-1365):
    // an attack - no spell, no tick - that took something from this creature, dealt by a cursed attacker, once, the
    // blow neither moved nor shared. Asked first off the attacker's effects (O-419).
    if (by && burdenFires({ attack, spell, moved, shared, took: amount + soaked.absorbed }) && burdenCanReach(by.effects ?? [])) {
      try {
        const { burdenOnBlow } = await import("../effects/sovereign-spells.mjs");
        await burdenOnBlow(by, this);
      } catch (err) {
        console.warn("azeroth-rpg | Burden of Sin", err);
      }
    }
    if (seductionSnapshot.length) {
      const healthAfter = (this.system?.health?.value ?? 0) + Math.max(0, Number(this.system?.health?.temp) || 0);
      const harmed = Math.max(0, Math.min(amount + soaked.absorbed, healthBeforeSeductionHarm - healthAfter));
      try {
        await seductionHarm.endSeductionOnDamage(this, seductionSnapshot, harmed);
      } catch (error) {
        console.warn("azeroth-rpg | Seduction cleanup could not be confirmed", error);
        ui.notifications?.warn("Damage was applied, but Seduction could not be removed. Check the target's effects.");
      }
    }
    if (innerFireSnapshot) {
      const remaining = (this.system?.health?.value ?? 0) + Math.max(0, Number(this.system?.health?.temp) || 0);
      const damageApplied = Math.max(0, Math.min(amount + soaked.absorbed, tookFrom - remaining));
      const { requestInnerFireHit } = await import("../effects/inner-fire-hit-query.mjs");
      await requestInnerFireHit({ messageId, snapshot: innerFireSnapshot, damageApplied });
    }
    // Fear ends on damage from its caster, including damage absorbed by
    // temporary Health. A negated or fully prevented blow ends nothing.
    if (amount + soaked.absorbed > 0 && by?.uuid) {
      try {
        const { endFearOnDamage } = await import("../effects/fear.mjs");
        await endFearOnDamage(this, by, amount + soaked.absorbed);
      } catch (error) {
        console.warn("azeroth-rpg | Fear cleanup", error);
        ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.FearCleanupFailed"));
      }
    }
    // **04's LIFE DRAIN** (*You recover Health equal to the damage it takes*; the Legacy
    // branches' door 25): what this blow took off this creature's Health and temporary
    // Health, given to the drainer through the one healing door - here where this client
    // may write it, else on the GM's client, held there to the card's own number.
    // Guarded: the drainer's heal never undoes the blow.
    if (drain?.by && amount >= 0) {
      try {
        const left = (this.system?.health?.value ?? 0) + Math.max(0, Math.trunc(Number(this.system?.health?.temp)) || 0);
        const took = Math.max(0, tookFrom - left);
        const healer = took > 0 ? fromUuidSync(drain.by) : null;
        if (healer?.documentName === "Actor") {
          const healed = await drainHeal({ healer, amount: took, messageId: drain.messageId ?? messageId, index: Number.isInteger(drain.index) ? drain.index : null, name: drain.name ?? "" });
          if (healed > 0) ui.notifications?.info(game.i18n.format("AZEROTH.Drain.Healed", { name: healer.name, n: healed, source: drain.name ?? "", target: this.name }));
        }
      } catch (err) {
        // The blow stands; the drainer's heal failing is said in words (CLAUDE.md §16).
        ui.notifications?.warn(game.i18n.format("AZEROTH.Drain.Failed", { source: drain.name ?? "", target: this.name }));
        console.warn("azeroth-rpg | life drain", err);
      }
    }
    // **02's DRAIN** (the class talent audit, D-1894: *Until the end of your turn, damage you deal
    // restores half as much Health to you, rounded down*): what this blow took off this creature,
    // halved, to the creature that dealt it while its Drain stands (`effects/warlock-drain.mjs`).
    // Guarded: the drainer's heal never undoes the blow.
    if (amount >= 0 && by) {
      try {
        const left = (this.system?.health?.value ?? 0) + Math.max(0, Math.trunc(Number(this.system?.health?.temp)) || 0);
        const took = Math.max(0, tookFrom - left);
        const dealer = typeof by === "string" ? fromUuidSync(by) : by;
        if (took > 0 && dealer?.documentName === "Actor" && dealer !== this) {
          const { drainFeatureHeal } = await import("../effects/warlock-drain.mjs");
          await drainFeatureHeal({ by: dealer, took, target: this });
        }
      } catch (err) {
        console.warn("azeroth-rpg | Drain", err);
      }
    }
    // **04's LIFEBLOOD** (*As a Reaction when an ally within 30 feet drops below half
    // Health*; stage 3A): the blow that took this creature below half its maximum offers it
    // on a card row to every holder near enough, judged again at the press. Guarded: an
    // offer never undoes the blow.
    try {
      const { offerLifeblood } = await import("../effects/chromatic-talents.mjs");
      await offerLifeblood({ target: this, before, after: this.system?.health?.value ?? 0, max: this.system?.health?.max ?? max });
    } catch (err) {
      console.warn("azeroth-rpg | Lifeblood's offer", err);
    }
    // **04's REWIND** (*as a Reaction when an ally within 30 feet takes damage ... It regains
    // half the Health that blow took*; stage 3B): the blow that took Health off this creature
    // offers it on a card row to every holder near enough, the Health it took on the offer's
    // own record. Guarded: an offer never undoes the blow.
    try {
      const { offerRewind } = await import("../effects/chromatic-flights.mjs");
      await offerRewind({ target: this, before, after: this.system?.health?.value ?? 0 });
    } catch (err) {
      console.warn("azeroth-rpg | Rewind's offer", err);
    }
    // The others' shares of a divided blow, once this creature's is written.
    if (division) {
      try {
        if (preparedTransfer) await landShares({ target: this, plan: division, type, by, strict: true, outcomes: report?.transfers, record: divisionRecord,
          beforeShare: actor => preparedTransfer.note(`sharePending:${actor.uuid}`),
          afterShare: actor => preparedTransfer.note(`shareApplied:${actor.uuid}`) });
        else await landShares({ target: this, plan: division, type, by, outcomes: report?.transfers, record: divisionRecord });
      } catch (err) {
        if (preparedTransfer) throw err;
        console.error("azeroth-rpg | blow divided", err);
      }
    }
    if (linkedTransfer) {
      const share = linkedTransfer.damage.recipient;
      await preparedTransfer.note("recipientPending");
      if (fromUuidSync(linkedTransfer.recipient.uuid) !== linkedTransfer.recipient) throw Error("Soul Link recipient changed");
      // A transferred share is damage, not another Attack Test against its recipient.
      const shareOutcome = report ? {} : null;
      if (report) report.transfers.push(shareOutcome);
      await linkedTransfer.recipient.applyDamage(share.damage, { struck: true, attack: false, spell, location,
        type: share.type, messageId, by, shared: true, wardTook: 0, parts: share.parts ?? null, outcome: shareOutcome });
      await preparedTransfer.note("recipientApplied");
    }
    if (hold.sealingFlame) {
      const {requestSealingFlameFinish} = await import('../effects/sealing-flame-reaction.mjs');
      await requestSealingFlameFinish(this,hold.sealingFlame);
    }
    // The enemies around it take the Fire once the Health is written.
    if (hold.cauterized) {
      const cauterized = hold.cauterized;
      try {
        await strikeAround({ holder: this, feet: cauterized.row.feet, amount: cauterized.row.amount, type: cauterized.row.type, name: cauterized.row.name, subtitle: game.i18n.format("AZEROTH.Cauterize.Subtitle", { name: this.name }) });
      } catch (err) {
        console.error("azeroth-rpg | cauterize", err);
      }
    }
    // **GUARDIAN SPIRIT'S HEAL** (04: *instead stays at 1 and restores Health equal
    // to your tier*): from the priest, once the hold is written. Guarded.
    if (hold.held?.heal > 0) {
      try {
        await this.applyHealing(hold.held.heal, { from: hold.held.holder ?? null, givenBy: hold.held.holder ? null : "other", feature: true });
      } catch (err) {
        console.error("azeroth-rpg | guardian spirit", err);
      }
    }
    if (!struck) return completeOutcome();
    await this._struckBy({ before, amount, location, type, attack, max, shapeKind, by, spell, parts, verdict });
    // What the blow does beyond its target, once, whatever door it came through
    // (D-768): the card's Apply, an area's tick, a failed area Test. **GUARDED**:
    // it runs after the Health is written and is bookkeeping beyond the target,
    // so a throw in it is said and never cancels the blow or stops
    // `strikeFromArea` reaching the next creature in an area.
    try {
      // Whether the blow was 06 §7's Riposte (04's Killing Spree, D-773), and its
      // damage type, which Vampiric Touch, Twisted Faith's mark and Shadowform's
      // Holy read (D-774) - and whether a spell dealt it and whether it was
      // Ignite's own tick (D-775), which Shadowburn and Ignite read.
      await afterBlow({ target: this, before, attacker: by, riposte: riposte === true, attack: attack === true, type, spell: spell === true, ignite: ignite === true, messageId,
        delivered: {amount: Math.max(0, Math.min(amount + soaked.absorbed, healthBeforeWrite - healthAfterWrite)), type, parts} });
    } catch (err) {
      console.error("azeroth-rpg | afterBlow", err);
    }
    // **04's MASTER OF SHADOWS: TAKING DAMAGE DOES** (the class talent audit's B10, D-1882): a blow
    // that took Health ends the minute's state and the Hide (`effects/stealth.mjs#shadowsEndOnDamage`).
    if (before > (this.system?.health?.value ?? before) && (this.effects ?? []).some(e => e.flags?.["azeroth-rpg"]?.masterOfShadows)) {
      await import("../effects/stealth.mjs").then(m => m.shadowsEndOnDamage(this, before - (this.system?.health?.value ?? before)))
        .catch(err => console.warn("azeroth-rpg | Master of Shadows did not end", err));
    }
    // **A PRIEST'S WARD ON THIS CREATURE** (04's Atonement and Absorption, D-774):
    // what the Ward took off this blow - the mitigation's `wardTook` the door
    // carried from the card or the tick, and the standing reduction above - and
    // what the blow came to. Guarded as `afterBlow` is.
    try {
      await afterWardedBlow({ target: this, type, wardTook: Math.max(0, Math.trunc(Number(wardTook)) || 0), standingTook, standing, dealt: amount, parts: parts ?? [] });
    } catch (err) {
      console.error("azeroth-rpg | ward", err);
    }
    return completeOutcome();
  }

  /**
   * **THE BANES THIS CREATURE TAKES ATTACKING A TARGET** (08 §20's Scarlet Reckoning,
   * D-912): the target's `attackerBane` rows whose faction this creature belongs to, read
   * through `rules/factions.mjs#factionsFor` (`signatureState.factions`).
   * @param {Array<{name: string, faction: string, banes: number}>} rows  the target's
   * @returns {number}
   */
  attackerBanesAgainst(rows = []) {
    return attackerBanesFrom(rows, this.signatureState?.factions ?? []).banes;
  }

  /**
   * **THE BANES A CAST'S RESIST TAKES OFF THIS CASTER'S ITEMS** (The Blade Hungers, The
   * Fifth Pylon; D-912): the rows `resistBanesForCast` matches, a row once each round
   * spending the round's own mark in a fight (`markRoundOnce`, the one queue) - and
   * counting at every cast out of one, where there is no round to count (MY READING).
   * @param {{school?: string|null, name?: string}} spell
   * @returns {Promise<Array<{name: string, banes: number, creatureType: string|null}>>}
   */
  async _resistBanesAtCast({ school = null, name = "" } = {}) {
    const rows = resistBanesForCast(this.system?.signatureEffects?.resistBane ?? [], { school, name });
    if (!rows.length) return [];
    const fight = this.activeFight?.() ?? null;
    const mine = fight?.getCombatantsByActor?.(this)?.[0] ?? null;
    const out = [];
    for (const r of rows) {
      if (r.per === "round" && mine) {
        const marked = await mine.markRoundOnce(`signature-resist:${r.name}`);
        if (!marked?.added) continue;
      }
      out.push({ name: r.name, banes: r.banes, creatureType: r.creatureType ?? null });
    }
    return out;
  }

  /**
   * **ONE CRITICAL INJURY OF THIS ENCOUNTER, ENDED** (Second Ordination, D-912): the one
   * taken latest in the fight this creature is in (`effects/injury-provenance.mjs`, the
   * one reading of *this encounter* - an injury of unknown provenance is never guessed
   * into it), said in words; nothing where there is none, or this client may not write.
   * The latest is MY READING of *one*, for the lead.
   * @param {Actor} healer
   */
  async _secondOrdination(healer) {
    const { injuryFightOf, injuriesFromFight } = await import("../effects/injury-provenance.mjs");
    const source = injuryFightOf(this);
    const order = e => { const f = e.flags?.["azeroth-rpg"]?.injuryFight ?? {}; return [Number(f.round) || 0, Number(f.turn) || 0]; };
    const found = injuriesFromFight(this.effects, source)
      .sort((a, b) => order(b)[0] - order(a)[0] || order(b)[1] - order(a)[1] || String(b.id).localeCompare(String(a.id)));
    const ended = found[0] ?? null;
    const by = (healer.system?.signatureEffects?.ordination ?? [])[0] ?? "";
    if (!ended) return;
    if (!this.isOwner) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Signature.OrdinationNotYours", { name: this.name, source: by, injury: ended.name }));
      return;
    }
    await this.deleteEmbeddedDocuments("ActiveEffect", [ended.id]);
    ui.notifications?.info(game.i18n.format("AZEROTH.Signature.OrdinationEnds", { name: this.name, source: by, injury: ended.name }));
  }

  /**
   * A breath weapon's damage, as Foror's Lesson leaves it (D-912): half, rounded down,
   * where something worn says so and the card is a breath's - said in words - and the
   * whole otherwise.
   * @param {number} amount
   * @param {true|{title?: string|null, featureKey?: string|null, spellName?: string|null}} card
   * @returns {number}
   */
  _breathHalved(amount, card = true) {
    const rows = this.system?.signatureEffects?.breathHalf ?? [];
    const isBreath = card === true || breathSource(card ?? {});
    const taken = breathTaken(amount, { halves: rows.length > 0 && isBreath });
    if (rows.length && taken !== amount) {
      ui.notifications?.info(game.i18n.format("AZEROTH.Signature.BreathHalved", { name: this.name, source: rows[0], from: amount, to: taken }));
    }
    return taken;
  }

  /**
   * **THE SHOT A LAUNCHER MAKES WITH NO AMMUNITION** (08 §20's Starfire Arrow, Thori'dal:
   * *You need no ammunition to shoot it. A shot made without ammunition has Damage Rating
   * 5 and deals Arcane damage*; D-912): the held row, where THIS weapon is the one that
   * carries it and is equipped - its gate already judged by the aggregate - else null.
   * @param {Item} weapon
   * @returns {{name: string, rating: number, type: string}|null}
   */
  phantomShotFor(weapon) {
    const held = this.system?.signatureEffects?.phantomShot ?? null;
    if (!held || !weapon?.system?.equipped) return null;
    const own = weapon.system?.signatureEffect ?? null;
    const carries = [own, ...(own?.gated ?? [])].some(p => p?.phantomShot?.type);
    return carries ? held : null;
  }

  /**
   * **WHAT 08 §20's LEGENDARIES DO ONCE A BLOW HAS LANDED** (D-911), from
   * `applyDamage` on the client that wrote this creature's Health:
   *
   * - **Emerald Slumber** (*Stunned until it takes damage or until the end of its
   *   next turn*): every condition laid with `endsOnDamage` ends.
   * - **Adaptive Scales** (*The first time each round you take damage of one of
   *   the seven schools, you have Ward 2 against that school until the end of your
   *   next turn, unless you already have more*): an `upgrade` on that school's
   *   Ward, spanned on this creature, once a round (`rules/signatures.mjs
   *   #adaptiveWardFor`).
   * - **The Tusk Taken** (*When you reduce a Boss or an Elite to 0 Health, you
   *   gain temporary Health equal to twice your tier*): on the KILLER, through
   *   05's own grant (`killTemporaryHealth`).
   * - **Fel-touched (Greater)** (08 §5: *Also make that Test each time an attack
   *   or effect of yours reduces a creature to 0 Health*): the killer's Spirit
   *   Test at DC 12 plus twice their tier, through the exposure door
   *   (`rules/trait-corruption.mjs`).
   *
   * A killer this client cannot write is said in words and left: the victim's
   * owner writes the blow, which is the GM's client for every Boss and Elite.
   */
  async _legendaryAfterBlow({ before = 0, after = 0, type = null, parts = null, by = null } = {}) {
    const ending = [...(this.effects ?? [])].filter(e => e.flags?.["azeroth-rpg"]?.[ENDS_ON_DAMAGE_FLAG]);
    if (ending.length && this.isOwner) {
      await this.deleteEmbeddedDocuments("ActiveEffect", ending.map(e => e.id));
      ui.notifications?.info(game.i18n.format("AZEROTH.Signature.EndedOnDamage", { name: this.name, condition: ending.map(e => e.name).join(", ") }));
    }
    const sig = this.system?.signatureEffects ?? null;
    if (sig?.adaptiveWard && this.isOwner) {
      const fight = this.activeFight?.() ?? null;
      const mark = fight?.started ? `${fight.id}:${fight.round}` : `t:${game.time?.worldTime ?? 0}`;
      const types = [type, ...(parts ?? []).filter(p => (Number(p?.damage) || 0) > 0).map(p => p.type)];
      const laid = adaptiveWardFor({ ward: sig.adaptiveWard, types, spent: this.getFlag("azeroth-rpg", ADAPTIVE_WARD_FLAG) === mark });
      if (laid) {
        const stale = this.effects.filter(e => e.flags?.["azeroth-rpg"]?.adaptiveWard).map(e => e.id);
        if (stale.length) await this.deleteEmbeddedDocuments("ActiveEffect", stale);
        const school = game.i18n.localize(AZEROTH.schools[laid.school] ?? laid.school);
        await this.createEmbeddedDocuments("ActiveEffect", [{
          name: game.i18n.format("AZEROTH.Signature.AdaptiveName", { school }),
          img: "icons/svg/shield.svg", origin: this.uuid,
          showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
          ...(untilEndOfNextTurnOrRound(this) ?? {}),
          system: { changes: [{ key: `system.ward.${laid.school}`, type: "upgrade", value: String(laid.ward), phase: "final" }] },
          flags: { "azeroth-rpg": { adaptiveWard: { school: laid.school } } }
        }]);
        await this.setFlag("azeroth-rpg", ADAPTIVE_WARD_FLAG, mark);
        ui.notifications?.info(game.i18n.format("AZEROTH.Signature.AdaptiveLaid", { name: this.name, n: laid.ward, school }));
      }
    }
    if (!(before > 0 && after === 0) || !by || by.documentName !== "Actor") return;
    const killer = by;
    const temp = killTemporaryHealth(killer.system?.signatureEffects?.killTemp ?? [], { tier: killer.system?.tier ?? 1, weightClass: this.system?.weightClass ?? null });
    if (temp) {
      if (killer.isOwner) await killer.grantTemporaryHealth(temp.amount, { source: temp.name });
      else ui.notifications?.warn(game.i18n.format("AZEROTH.Signature.KillerNotYours", { name: killer.name, source: temp.name }));
    }
    // A killer this client does not own is asked of the GM, whose client re-reads the
    // killer's own weapons (D-913, the review's LOW) - never skipped in silence.
    if (!killer.isOwner) {
      if (traitExposuresOn(killer, "kill").length) {
        const { askTraitExposure } = await import("../effects/legendary-doors.mjs");
        await askTraitExposure(killer, "kill", this);
      }
      return;
    }
    for (const row of traitExposuresOn(killer, "kill")) {
      await game.system.azeroth.workflows.corruptionExposure({
        actor: killer, track: row.track, dc: row.dc, resilience: row.resilience, points: row.amount, occasion: "gear"
      });
    }
  }

  /** What 08 §5's Corruption traits on what this creature wields charge on an occasion (D-911, D-913). */
  traitExposuresFor(occasion) {
    return traitExposuresOn(this, occasion);
  }

  /**
   * **WHAT A PRESS PUT ON ONE WEAPON** (08 §20's Blood of Mannoroth: *an orc wielding it
   * adds 2 to its Damage Rating*; D-911): `rules/signatures.mjs#pressedWeaponBonus` over
   * this actor's effects. The attack door asks it for the weapon it swings.
   *
   * @param {string} weaponId
   * @returns {{damage: number, sources: string[]}}
   */
  pressedWeaponBonus(weaponId) {
    return pressedWeaponBonus([...(this.effects ?? [])], weaponId);
  }

  /**
   * **UTHER'S STAND, WHILE IT STANDS** (08 §20, D-911): the press's own effect, active,
   * as `{source}` - or null. A method, so the damage door names no flag of its own.
   *
   * @returns {{source: string}|null}
   */
  _signatureShield() {
    const effect = [...(this.effects ?? [])].find(e => e.active !== false && e.flags?.["azeroth-rpg"]?.[SIGNATURE_SHIELD_FLAG]) ?? null;
    return effect ? { source: effect.flags["azeroth-rpg"][SIGNATURE_SHIELD_FLAG].source ?? effect.name ?? "" } : null;
  }

  /**
   * **THE MOVES WHAT THIS CREATURE WEARS MAKES** (08 §20's The Raised Gauntlet, D-912):
   * every equipped press that moves a blow onto its bearer (`move.feet`, the trigger
   * `blowMoved`) whose gate holds, as a row `effects/blow-doors.mjs#movesOf` reads -
   * judged with every other move by `rules/blow-doors.mjs#moveJudgement`.
   * @returns {Array<object>}
   */
  signatureMoves() {
    const state = this.signatureState ?? {};
    const out = [];
    for (const item of this.items ?? []) {
      // A press is a Signature's Use, locked while the thing is unidentified (08 §4; D-1435).
      if (item.system?.equipped !== true || isUnidentified(item)) continue;
      for (const { key, press } of pressesOf(item.system?.signatureEffect)) {
        if (press.trigger !== "blowMoved" || !(Number(press.move?.feet) > 0)) continue;
        if (!gateHolds(press.gates ?? [], state)) continue;
        out.push({
          kind: "gauntlet", name: press.label || item.name, feet: Number(press.move.feet),
          usesLeft: press.uses?.value ?? 0, counted: Boolean(press.uses?.per), itemId: item.id, press: key
        });
      }
    }
    return out;
  }

  /**
   * **THE SIGNATURE PRESS THAT TURNS THIS CREATURE'S HIT INTO A MISS** (08 §20's Step
   * Aside, D-912): an equipped item's press that `negates`, its gate holding and a use
   * left - the first by item name. `press` is the key `workflows.useSignature` takes;
   * `applications/actions.mjs#reactionRows` draws the card's row from it.
   * @returns {{id: string, name: string, press: string}|null}
   */
  signatureNegate() {
    const state = this.signatureState ?? {};
    const found = [];
    for (const item of this.items ?? []) {
      // A press is a Signature's Use, locked while the thing is unidentified (08 §4; D-1435).
      if (item.system?.equipped !== true || isUnidentified(item)) continue;
      for (const { key, press } of pressesOf(item.system?.signatureEffect)) {
        if (press.negates !== true) continue;
        if (pressEntryRefusal(press, { holds: gateHolds(press.gates ?? [], state) })) continue;
        found.push({ id: item.id, name: press.label || item.name, press: key, item: item.name });
      }
    }
    found.sort((a, b) => a.item.localeCompare(b.item) || a.id.localeCompare(b.id));
    return found[0] ? { id: found[0].id, name: found[0].name, press: found[0].press } : null;
  }

  /**
   * **THE SIGNATURE PRESSES AN ATTACK CARD OFFERS THIS CREATURE** (D-913): Uther's Stand
   * and The Wyrm's Roar - an equipped item's press whose run answers an attack on its
   * bearer (`rules/signatures.mjs#pressTrigger`), its gate holding and a use left; Step
   * Aside rides the negate button (`signatureNegate`). Sorted by item name.
   * @returns {Array<{id: string, name: string, press: string, trigger: string}>}
   */
  signatureCardPresses() {
    const state = this.signatureState ?? {};
    const found = [];
    for (const item of this.items ?? []) {
      // A press is a Signature's Use, locked while the thing is unidentified (08 §4; D-1435).
      if (item.system?.equipped !== true || isUnidentified(item)) continue;
      for (const { key, press } of pressesOf(item.system?.signatureEffect)) {
        const trigger = pressTrigger(press);
        if (press.negates === true || (trigger !== "hitOnYou" && trigger !== "attackOnYou")) continue;
        if (pressEntryRefusal(press, { holds: gateHolds(press.gates ?? [], state) })) continue;
        found.push({ id: item.id, name: press.label || item.name, press: key, trigger, item: item.name });
      }
    }
    found.sort((a, b) => a.item.localeCompare(b.item) || a.press.localeCompare(b.press));
    return found.map(({ item, ...row }) => row);
  }

  /**
   * **THIS CREATURE'S HIT WITH A WEAPON, RECORDED** (08 §20's Wind of the Doomhammer: *when
   * an Attack Test with it hits*; D-913): written by the attack door where an equipped
   * press answers its own bearer's hit, so nothing is written for anybody else.
   * @param {{itemId: string, messageId: string, index?: number}} o
   */
  async recordSignatureHit({ itemId = null, messageId = null, index = 0 } = {}) {
    if (!itemId || !this.isOwner) return;
    const item = this.items.get(itemId) ?? null;
    if (!pressesOf(item?.system?.signatureEffect).some(({ press }) => pressTrigger(press) === "ownHit")) return;
    const fight = this.activeFight?.() ?? null;
    await this.setFlag("azeroth-rpg", "signatureHit", {
      itemId, messageId, index, combatId: fight?.id ?? null, round: fight?.round ?? null, turn: fight?.turn ?? null, at: game.time?.worldTime ?? null
    });
  }

  /** The hit Wind of the Doomhammer answers with this item, or null (D-913). */
  signatureHitFor(item) {
    const record = this.getFlag("azeroth-rpg", "signatureHit") ?? null;
    const fight = this.activeFight?.() ?? null;
    return hitThisTurn(record, { itemId: item?.id, combatId: fight?.id ?? null, round: fight?.round ?? null, turn: fight?.turn ?? null, now: game.time?.worldTime ?? null }) ? record : null;
  }

  /**
   * **A SIGNATURE THAT HOLDS ITS BEARER AT 1** (Undying, D-911): the first equipped
   * item whose press fires itself on a drop to 0, its gate holding and a use left -
   * judged through the one press judgement but for the trigger itself. Null where
   * none would hold, or this client cannot strike its use.
   *
   * @returns {{item: Item, key: string, press: object}|null}
   */
  _signatureHold({ before = 0, amount = 0 } = {}) {
    if (!this.isOwner || !(before > 0) || amount < before) return null;
    const state = this.signatureState ?? {};
    for (const item of this.items ?? []) {
      if (item.system?.equipped !== true) continue;
      for (const { key, press } of pressesOf(item.system?.signatureEffect)) {
        if (press.trigger !== "dropToZero") continue;
        if (pressEntryRefusal({ ...press, trigger: null }, { holds: gateHolds(press.gates ?? [], state) })) continue;
        return { item, key, press };
      }
    }
    return null;
  }

  /**
   * **THE ONE HOLD AT 1** (D-777; the lead on O-156: *"Yes."*), in `rules/blow-doors
   * .mjs#HOLD_ORDER`: a blow that would take this creature from above 0 to 0 is held
   * by the first of -
   *
   * 1. **07's Aegis of the Light** laid on it (*no target may be reduced below 1
   *    Health by any source*), free and asked of nobody;
   * 2. **02's Unkillable** (*While you have Rage remaining, no single blow can
   *    reduce you below 1 Health. Each time this saves you, lose all Rage*) - a
   *    blow's, as built (D-768);
   * 3. **04's Cauterize** (*Once per Long Rest, when you would drop to 0 Health you
   *    stay at 1 instead*), its counter struck as it saves (D-775);
   * 4. **another creature's talent, ASKED IN THE BLOW**: 04's Intervention, Spirit
   *    Shell (an attack's alone) and Guardian Spirit (`effects/blow-doors.mjs
   *    #askToHold`).
   *
   * Every one reads `blow-doors.mjs#heldAt`, the one judgement. What is left of
   * the blow, and who held it.
   *
   * @param {{before: number, amount: number, attack?: boolean, struck?: boolean}} o
   * @returns {Promise<{amount: number, held: object|null, cauterized?: object}>}
   */
  async _holdAtOne({ before, amount, attack = true, struck = false }) {
    if (!wouldDrop({ before, amount })) return { amount, held: null };
    // **R4: EACH HOLD OBEYS ITS REGIME** (the class talent audit; D-1863): one hold a blow (the
    // first that saves returns), a hold another creature grants once an encounter on this
    // creature, an identity hold (Unkillable) once a round - read off this creature's fight record
    // (`blow-doors.mjs#holdRegimeRefusal`) and claimed through its queued door (`markHold`) before
    // anything is paid. Out of a started fight nothing is counted.
    const holdFight = this.activeFight?.() ?? null;
    const holdMine = holdFight?.started ? (holdFight.getCombatantsByActor?.(this)?.[0] ?? null) : null;
    const holdRecord = holdMine?.getFlag?.("azeroth-rpg", HOLD_MARK_FLAG) ?? null;
    const regimeOpen = (regime, lasting = false) => !holdRegimeRefusal({ regime, record: holdRecord, round: holdFight?.round ?? 0, inFight: Boolean(holdMine), lasting });
    // **FAILS CLOSED** (the wave 1 review): a fight record this client cannot write is no claim, so a
    // once-limited hold does not hold here rather than holding unrecorded. Out of a fight nothing is counted.
    const claimHold = async regime => !holdMine || (holdMine.isOwner === true && (await holdMine.markHold(regime))?.added === true);
    const releaseHold = async regime => { if (holdMine?.isOwner) await holdMine.releaseHold(regime); };
    try {
      const floor = await aegisFloor({ target: this, before, amount });
      if (floor.held) {
        ui.notifications?.info(game.i18n.format("AZEROTH.AegisLight.Held", { name: this.name, spell: floor.held.name }));
        return floor;
      }
    } catch (err) {
      console.error("azeroth-rpg | aegis floor", err);
    }
    // **UNKILLABLE IS A CLASS FEATURE** (02 §7, the Warrior's level 20). This asked
    // `talentRanks` for it, and no talent bears the name, so it never held for
    // anybody (D-768).
    const rage = this.poolSnapshot?.().find(p => p.kind === "momentum" && p.name === "rage") ?? null;
    // Once a round (R4's identity regime, D-1863), claimed before the Rage is spent; a second blow
    // in the round that would have been held is said in words, never passed over in silence.
    if (struck && rage && !regimeOpen(holdRegimeOf({ kind: "unkillable" })) && this.hasFeature("Unkillable") && (rage.value ?? 0) > 0) {
      ui.notifications?.info(game.i18n.format("AZEROTH.BlowDoor.Refuse.identitySpent", { talent: "Unkillable", name: this.name }));
    }
    if (struck && rage && regimeOpen(holdRegimeOf({ kind: "unkillable" }))) {
      const floor = unkillableFloor({ before, amount, rage: rage.value, holds: this.hasFeature("Unkillable") });
      const claimed = floor.saved ? await claimHold(holdRegimeOf({ kind: "unkillable" })) : false;
      if (floor.saved && !claimed) ui.notifications?.warn(game.i18n.format("AZEROTH.BlowDoor.Refuse.unclaimed", { talent: "Unkillable", name: this.name }));
      if (floor.saved && claimed) {
        await this.updatePool({ itemId: rage.itemId, kind: "momentum", value: 0 });
        ui.notifications?.info(game.i18n.format("AZEROTH.Combat.Unkillable", { name: this.name }));
        return { amount: floor.amount, held: { kind: "unkillable", name: "Unkillable" } };
      }
    }
    // **04's UNDYING RAGE** (*When reduced to 0 Health, spend all your Rage. You stay at
    // 1 Health for one round per 2 Rage spent, then fall as usual*; D-779): in a
    // started fight, all the Rage spent and an effect counting the rounds to the fall
    // (`effects/class-answers.mjs#undyingFall` lands it; a heal cancels it, `applyHealing`). A hold
    // already counting is not begun again: only the triggering hit is held
    // (lead ruling 2026-10-29); subsequent damage applies normally.
    if (this.type === "character") {
      const undying = undyingRageFor(this.takenTalents());
      const fightNow = this.activeFight?.() ?? null;
      const mine = fightNow ? (fightNow.getCombatantsByActor(this)?.[0] ?? null) : null;
      const standing = (this.effects ?? []).some(e => e.flags?.["azeroth-rpg"]?.[UNDYING_RAGE.flag]);
      const caught = undyingRageHold({ before, amount, rage: rage?.value ?? 0, holds: Boolean(undying) && Boolean(rage), inFight: Boolean(fightNow?.started && mine), standing });
      if (caught.saved) {
        await this.updatePool({ itemId: rage.itemId, kind: "momentum", value: 0 });
        await this.createEmbeddedDocuments("ActiveEffect", [{
          name: undying.name, img: "icons/skills/melee/strike-axe-blood-red.webp", origin: this.uuid, description: "",
          duration: { value: caught.rounds, units: "rounds", expiry: "turnStart" },
          start: { combat: fightNow.id, combatant: mine.id, round: fightNow.round, turn: fightNow.turn, time: game.time.worldTime },
          flags: { "azeroth-rpg": { [UNDYING_RAGE.flag]: { rounds: caught.rounds, spent: caught.spent, round: fightNow.round } } }
        }]);
        ui.notifications?.info(game.i18n.format("AZEROTH.UndyingRage.Held", { name: this.name, talent: undying.name, n: caught.rounds, rage: caught.spent }));
        return { amount: caught.amount, held: { kind: "undyingRage", name: undying.name } };
      }
    }
    // **CAUTERIZE** (04, D-775): the counter the talent grants holds the use, struck
    // as it saves (MY READING, for the lead: the first such blow, as Divine Favor's
    // first heal). Through this door only: A1's Bleeding and Scorched reach Health
    // through `loseHealth` and `takeStraightDamage`, where only 07's floor holds.
    const cauterized = this.type === "character" ? await this._cauterize({ before, amount }) : null;
    if (cauterized) return { amount: cauterized.amount, held: { kind: "cauterize", name: cauterized.row.name }, cauterized };
    // **04's BORROWED HOUR** (the Chronomancer's Guardian of Time, stage 2c: *Once per Long
    // Rest, when a blow would drop you to 0 Health, you stay at 1 Health. The rest of that blow
    // arrives at the start of your next turn.*): the creature's own, automatic, after
    // Cauterize and before another's is asked (`blow-doors.mjs#HOLD_ORDER`) - its use struck,
    // the rest on the put-off list (`effects/guardian.mjs#borrowedHourHold`).
    if (this.type === "character") {
      try {
        const { borrowedHourHold } = await import("../effects/guardian.mjs");
        const hour = await borrowedHourHold(this, { before, amount });
        if (hour) return hour;
      } catch (err) {
        console.warn("azeroth-rpg | borrowed hour", err);
      }
    }
    // **08 §20's UNDYING** (the Phylactery of Kel'Thuzad: *Once per Long Rest, when
    // damage would reduce you to 0 Health, you are reduced to 1 instead. Then make a
    // Body Resilience Test at DC 20. On a failure, gain 1 Undeath Corruption.*; D-911):
    // the creature's own, automatic - a press that fires itself (`use.trigger`) - after
    // Borrowed Hour and before another's is asked (`blow-doors.mjs#HOLD_ORDER`).
    // **07 §17's UNFADING GLORY** (*when a blow would drop you to 0 Health while you hold 1 or more Tribute, you
    // may spend 1 Tribute. You drop to 1 Health instead*; D-1247): the creature's own, before another's.
    if ((struck || attack) && unfadingCanReach(this.effects)) {
      try {
        const { unfadingHold } = await import("../effects/sovereign-spells.mjs");
        const glory = await unfadingHold(this, { before, amount });
        if (glory) return glory;
      } catch (err) {
        console.warn("azeroth-rpg | Unfading Glory", err);
      }
    }
    // **04's TOO BEAUTIFUL TO DIE** (*Once per Long Rest, when a blow would drop you to 0 Health, you may spend
    // all your Tribute, at least 1. You drop to 1 Health instead*): beside Unfading Glory, a blow alone - a Vitae
    // payment never reaches this door (the plan's B.13 Q22) - its temporary Health landed after the write.
    if ((struck || attack) && this.type === "character" && this.talentRanks?.("Too Beautiful to Die") > 0) {
      try {
        const { sovereignHold } = await import("../effects/sovereign-features.mjs");
        const beautiful = await sovereignHold(this, { before, amount });
        if (beautiful) return beautiful;
      } catch (err) {
        console.warn("azeroth-rpg | Too Beautiful to Die", err);
      }
    }
    const undying = this._signatureHold?.({ before, amount }) ?? null;
    if (undying) {
      // A hold that fires itself works hidden (D-1435) and names no more than *an unidentified item*.
      const source = isUnidentified(undying.item) ? unidentifiedSource() : undying.press.label;
      await undying.item.update({ [`system.signatureEffect.presses.${undying.key}.uses.value`]: Math.max(0, (undying.press.uses?.value ?? 0) - 1) });
      ui.notifications?.info(game.i18n.format("AZEROTH.Signature.Held", { name: this.name, source }));
      const gain = undying.press.corruptionGain ?? null;
      if (gain?.track && gain?.amount && gain?.resilience && gain?.dc) {
        // The hold stands whatever the Test does; a Test that could not be made is SAID,
        // never skipped in silence (D-913, the review's LOW): the table makes it by hand.
        try {
          await game.system.azeroth.workflows.corruptionExposure({ actor: this, track: gain.track, dc: gain.dc, resilience: gain.resilience, points: gain.amount, occasion: "signature" });
        } catch (err) {
          ui.notifications?.error(game.i18n.format("AZEROTH.Signature.CorruptionTestLost", { name: this.name, source, dc: gain.dc }));
          console.warn("azeroth-rpg | Undying's Corruption Test was not made", err);
        }
      }
      return { amount: Math.max(0, before - 1), held: { kind: "signature", name: source } };
    }
    // **02's BEACON OF HOPE** (the class talent audit's A7, class agent A; D-1872): a Paladin's standing Beacon
    // holds an ally within 30 feet the first time it drops, asked of nobody, before another's hold is asked. A
    // LASTING hold (06 §9's rule 2; the wave-2 fix run): it neither reads nor claims the shared granted mark.
    try {
      const { beaconOfHopeHold } = await import("../effects/audit-martial.mjs");
      const beacon = await beaconOfHopeHold({ target: this, before, amount });
      if (beacon) return beacon;
    } catch (err) {
      console.warn("azeroth-rpg | Beacon of Hope", err);
    }
    try {
      // The claim is made before the granter pays and given back on a no (R4, D-1863).
      const asked = await askToHold({ target: this, before, amount, attack: struck && attack, regimeOpen, claim: claimHold, release: releaseHold });
      if (asked.held) {
        ui.notifications?.info(game.i18n.format("AZEROTH.BlowDoor.Held", { holder: asked.held.holder?.name ?? "", name: this.name, talent: asked.held.name }));
        return asked;
      }
    } catch (err) {
      console.error("azeroth-rpg | held at 1", err);
    }
    const {requestSealingFlameHold} = await import('../effects/sealing-flame-reaction.mjs');
    const sealingFlame = await requestSealingFlameHold(this,{before,amount});
    if (sealingFlame) return sealingFlame;
    return { amount, held: null };
  }

  /**
   * **CAUTERIZE'S CATCH** (04, D-775): where this blow would take the character
   * from above 0 to 0, and Cauterize's counter holds a use, the use is struck and
   * the blow leaves 1 Health. Null where it does not catch. The counter is the
   * feature the talent grants (`counter(1, "long")`), refilled by the Long Rest.
   *
   * @param {{before: number, amount: number}} o
   * @returns {Promise<{amount: number, row: object}|null>}
   */
  async _cauterize({ before, amount }) {
    const row = cauterizeFor(this.takenTalents(), { tier: this.system?.tier ?? 1 });
    if (!row) return null;
    const counter = this.grantedFeature(row.talentId);
    const left = Math.max(0, Math.trunc(Number(counter?.system?.uses?.value)) || 0);
    const caught = cauterizes({ before, amount, stay: row.stay, usesLeft: left });
    if (!caught.saved || !counter) return null;
    await counter.update({ "system.uses.value": left - 1 });
    ui.notifications?.info(game.i18n.format("AZEROTH.Cauterize.Saved", { name: this.name, talent: row.name, n: row.stay }));
    return { amount: caught.amount, row };
  }

  /**
   * What a STRUCK blow does to the creature it landed on (06 §8, §9; 05 §11;
   * D-627, D-629, D-691): Prone and the Critical Injury at 0, a Death Step for
   * an attack on the dying, the round's was-struck mark and the damage type,
   * Rage for a blow that reached Health and Reckoning's Zeal. Split out of
   * `applyDamage` so the blow's effects BEYOND the target run after it on every
   * path (D-768); the early returns it holds no longer skip them.
   */
  async _struckBy({ before, amount, location, type, attack, max, shapeKind = null, by = null, spell = false, parts = null, verdict = null }) {
    const after = this.system?.health?.value ?? 0;
    // Reaching 0 (06 SS8, D-629): Prone, and the Critical Injury the VICTIM
    // rolls; an ATTACK on a character already dying costs a Death Step (06 §9),
    // and a tick is not one (S1).
    if (this.type === "character" && amount > 0) {
      if (before > 0 && after === 0) {
        if (!this.statuses?.has("prone")) await this.toggleStatusEffect("prone", { active: true });
        // **02 §7's UNHOLY PRESENCE ENDS AT 0 HEALTH** (*until you end it, you drop to 0 Health or
        // you finish a Long Rest*; door 10), guarded so a throw never skips what the blow does next.
        await this._endPresenceAtZero?.();
        // The Critical Injury a blow to 0 inflicts. Guarded (the final review of D-768 to
        // D-775): a throw here must not skip what the blow does beyond the target
        // (`afterBlow`, the Ward's `afterWardedBlow`), which runs after this. 04's Ruin no
        // longer rolls it twice (the class talent audit, D-1891: Ruin adds damage on a
        // natural 19 or 20, at the cast).
        try {
          if (!verdict?.suppressNewCriticalInjury) await game.system.azeroth.workflows.rollCriticalInjury({ actor: this, location });
        } catch (err) {
          console.error("azeroth-rpg | critical injury at 0", err);
        }
        // **THE AVATAR'S PRICE** (02 §7, D-769): *If you are reduced to 0 Health
        // while in this form, you take an additional Critical Injury and start
        // dying.* The shape it was in when the blow landed, since 0 ends it.
        if (shapeKind === "avatar" && !verdict?.suppressNewCriticalInjury) {
          for (let i = 0; i < AVATAR.extraCriticalInjuries; i++) {
            try {
              await game.system.azeroth.workflows.rollCriticalInjury({ actor: this, location });
            } catch (err) {
              console.error("azeroth-rpg | the Avatar's critical injury", err);
            }
          }
        }
      } else if (before === 0 && attack) {
        // **04's BURIAL GROUND AT RANK 2** (*an attack against a **Dying** friendly target
        // inside it adds no Death Step*; the Legacy branches' door 11): the area this
        // creature stands in, its caster's ally, says so (`effects/death-holds.mjs
        // #burialSpares`), and the attack's step is not taken.
        const spared = burialSpares(this);
        if (spared !== null) ui.notifications?.info(game.i18n.format("AZEROTH.DeathHold.Spared", { name: this.name, area: spared }));
        else await this.takeDeathStep();
      }
    }
    const combat = this.activeFight();
    const combatant = combat ? combat.getCombatantsByActor(this)?.[0] ?? null : null;
    if (combatant?.isOwner) {
      // Struck this round (05 §11), through the combatant's queued door: a record
      // of an older round starts afresh, never carried under this one's number
      // (the final review of D-768 to D-775; `rules/riders.mjs#roundStruck`).
      await combatant.markStruck();
      // WHAT KIND OF DAMAGE, AND WHEN (D-691). 14's Regeneration is withheld
      // *unless he has taken Fire damage since the end of his last turn*, and
      // nothing recorded the kind: the type travelled as far as the card's
      // mitigation and was thrown away there. `_onEndTurn` clears this.
      // **AND EACH SECOND AMOUNT'S OWN TYPE** (D-777): a blow that landed Nature
      // beside its steel took Nature damage too.
      const dealtTypes = [type, ...(parts ?? []).filter(p => (Number(p?.damage) || 0) > 0).map(p => p.type)]
        .filter((t, i, all) => t && AZEROTH.damageTypes[t] && all.indexOf(t) === i);
      if (dealtTypes.length && amount > 0) {
        const taken = combatant.getFlag("azeroth-rpg", "damageTypes") ?? [];
        const more = dealtTypes.filter(t => !taken.includes(t));
        if (more.length) await combatant.setFlag("azeroth-rpg", "damageTypes", [...taken, ...more]);
      }
    }
    if (!combatant || amount <= 0) return this;
    // **02 §7's UNHOLY PRESENCE, FEEDS ON BLOWS** (door 10): *once a round, when a blow damages
    // you, gain 1 Runic Power* - the presence asked, then the round's mark taken through the
    // combatant's queued door, so two blows in a round give one.
    const fed = this.type === "character" && holdsPresence(this.effects) && combatant.isOwner
      && (await combatant.markRoundOnce(FEEDS_ON_BLOWS_MARK))?.added === true ? UNHOLY_PRESENCE.strike : 0;
    const gains = gainWhenStruck({ pools: this.poolSnapshot(), damage: amount, enrageRanks: this.talentRanks?.("Enrage") ?? 0, presence: fed });
    // **08 §20's THE DESTROYER'S TEMPER** (Blackhand's Harness: *A Warrior wearing it
    // gains 1 more Rage the first time each round an attack reduces their Health*;
    // D-911): the round's first such blow, marked through the combatant's queued door,
    // its pool raised beside 05 §11's own gain (`rules/momentum.mjs#gainOnHurt`).
    const hurtRows = attack ? (this.system?.signatureEffects?.poolOnHurt ?? []) : [];
    if (hurtRows.length && await combatant.markHurtByAttack()) {
      for (const g of gainOnHurt({ pools: this.poolSnapshot(), gains, rows: hurtRows })) {
        const at = gains.findIndex(x => x.itemId === g.itemId && x.kind === g.kind && x.name === g.name);
        if (at >= 0) gains[at] = g;
        else gains.push(g);
      }
    }
    // **04's FRENZY AND RECKLESS AT RANK 2** (the class talent audit, class agent A; D-1870): twice the tier
    // the first time each encounter below half, and 1 more Rage for each hit taken while exposed, ADDED to
    // whatever Rage the blow already gave (`effects/audit-martial.mjs#martialWhenStruck`).
    if (this.type === "character") {
      try {
        const { martialWhenStruck } = await import("../effects/audit-martial.mjs");
        for (const g of await martialWhenStruck({ actor: this, before, after, max, attack })) {
          const pool = this.poolSnapshot().find(p => p.itemId === g.itemId && p.kind === g.kind) ?? null;
          const at = gains.findIndex(x => x.itemId === g.itemId && x.kind === g.kind);
          const base = at >= 0 ? gains[at].value : (pool?.value ?? 0);
          const row = { itemId: g.itemId, kind: g.kind, name: g.name, value: Math.min(pool?.max ?? base + g.value, base + g.value) };
          if (at >= 0) gains[at] = row;
          else gains.push(row);
        }
      } catch (err) {
        console.warn("azeroth-rpg | the martial rows on a blow taken", err);
      }
    }
    // Reckoning (04): reduced below half Health, gain 5 Zeal a rank.
    const reckoning = this.talentRanks?.("Reckoning") ?? 0;
    if (reckoning > 0 && before >= max / 2 && after < max / 2) {
      const zeal = this.poolSnapshot().find(p => p.kind === "momentum" && p.name === "zeal");
      if (zeal) gains.push({ itemId: zeal.itemId, kind: "momentum", name: "zeal", value: Math.min(zeal.max, zeal.value + 5 * reckoning) });
    }
    // Feeds on Blows is a named door for a Runic Power rise (`rules/runes.mjs#RUNIC_GAIN_SOURCES`).
    if (gains.length) await this.updatePool(gains.map(g => ({ itemId: g.itemId, kind: g.kind, value: g.value })), {}, fed ? { runicGain: "feedsOnBlows" } : {});
    return this;
  }
}
