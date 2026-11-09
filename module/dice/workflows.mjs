/**
 * Roll workflows: Test → Success Level → damage → mitigation → chat card
 * (D2 §4).
 *
 * These assemble modifiers, build an AzerothRoll, evaluate it and post a card.
 * They compute NOTHING themselves — every number comes from `rules/`, so the
 * sheet, the card and the roll cannot disagree (CLAUDE.md §7).
 */

import { AZEROTH } from "../config.mjs";
import { equipmentMeleeBonus, equipmentModifiers } from "../rules/special-equipment.mjs";
import { claimEquipmentTest, finishEquipmentTest } from "../effects/equipment-test.mjs";
import {claimProvisionTest,finishProvisionTest} from "../effects/provision-benefits.mjs";
import {drinkTestBenefits,DRINK_BENEFITS,PROVISION_BENEFIT} from "../rules/provision-benefits.mjs";
import {validateDeviceChoices,breakSelectedDevices} from "../effects/device-context.mjs";
import {prostheticWieldAllowed} from "../rules/prosthetics.mjs";
import {useRocketBoots} from "../effects/rocket-boots.mjs";
import {usePlacedDevice} from "../effects/placed-devices.mjs";
import {ordinaryDrinkOf,useOrdinaryDrink} from "../effects/ordinary-drinks.mjs";
import { offerChiliReaction } from "../effects/equipment-chili.mjs";
import { dispersionFor } from "../rules/dispersion.mjs";
import { refuseUnreliableWeapon, prepareUnreliableDamage, recordUnreliableDamage, useMechanicalRepairKit } from "../effects/equipment-repair.mjs";
import {explosiveRule,explosiveAction} from "../rules/equipment-explosives.mjs";
import {authorizeExplosiveCard,prepareExplosiveUse} from "../effects/equipment-explosives.mjs";
import { militiaDrillSelection, MILITIA_DRILL_FLAG } from '../rules/militia-drill.mjs';
import { approvedRestSignature, requestApprovedSignatureUse, SIGNATURE_USE_AUTHORITY } from "../effects/approved-signature-use.mjs";
import {approvedHitSignature,charmUseView,SIGNATURE_USES_FLAG} from '../rules/approved-signature-uses.mjs';
import { prepareChosenSignatures, signatureRecipientKey } from "../effects/chosen-signature-casting.mjs";
import { prepareHealingSignatures } from "../effects/chosen-signature-healing.mjs";
import { chosenSignatureExtras } from "../rules/signature-scaling.mjs";
import { signatureDeliverySeed } from "../rules/signature-delivery.mjs";
import { offerSecondStrike } from "../effects/second-strike.mjs";
import { applyInjuryOnce } from "../effects/injury-application.mjs";
import { spellLimitRefusal, spendSpellBudget } from "../effects/spell-limits.mjs";
import { validDispersionExecution } from "../effects/dispersion-reaction-cast.mjs";
import { earthShockBars, reactionBarReason, reactionBarred, REACTION_BAR_REASON } from "../rules/reaction-bar.mjs";
import { applyEarthShockBar } from "../effects/reaction-bar.mjs";
import { crushridgeMeleeBonus } from "../rules/crushridge.mjs";
import { taintedBloodAttackRating } from "../rules/tainted-blood.mjs";
import { attackResolutionSeed } from "../effects/attack-resolution-state.mjs";
import { phaseShiftRefusal } from "../rules/phase-shift.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";
import { refuseDispersion } from "../effects/dispersion-protection.mjs";
import { seductionRefusal } from "../effects/seduction-refusal.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { refuseAncientDespair } from "../effects/ancient-despair-refusal.mjs";
import { refuseMobileAlertAttack } from "../effects/mobile-alert-restrictions.mjs";
import { refuseDisarmedAttack } from "../effects/npc-disarm.mjs";
import { stonemaulGrip } from "../rules/stonemaul-grip.mjs";
import { shieldSlamShield } from "../rules/npc-shield-slam.mjs";
import { effectDuration, riderRating } from "../rules/spell-effects.mjs";
import { abilityModifier } from "../rules/abilities.mjs";
import { applyExposure, castingCorruption, thresholdsCrossed } from "../rules/corruption.mjs";
import { explainDamage } from "../rules/mitigation.mjs";
import { resolveRecordedDamage as resolveDamage } from "../rules/damage-record.mjs";
import { explosiveTrapSnapshot, explosiveTrapDamage } from "../rules/explosive-trap.mjs";
import { blastRadius } from "../rules/blast-radius.mjs";
import { featureReady } from "../effects/feature-ready.mjs";
import { afflictPoison, markFirstTestBane } from "./afflictions-workflows.mjs";
import { AzerothRoll } from "./azeroth-roll.mjs";
import { routeSignatureHit, prepareSignatureHitTarget } from "../effects/signature-hit-routing.mjs";
import { hitBonusDamageForTarget } from "../rules/signature-hit-target.mjs";
import { resultName, succeeded } from "../rules/resolution.mjs";
import { areaFor, lengthenArea, widenArea } from "../rules/areas.mjs";
// An area that strikes at the start of a turn (D-756): the cast deals none of
// it, and the tick adds what the caster STANDS on, as the cast does.
import { areaCarriesSpell, castDealsDamage, castHeals, emptyAreaTick, hasAreaTick, roundsIn, tickParts } from "../rules/area-ticks.mjs";
import { standingFeatureBonus, standingSpellBonus } from "../rules/spell-bonus.mjs";
import { calledShotCost, situationalModifiers } from "../rules/modifiers.mjs";
import { endLesserInvisibility } from "../effects/lesser-invisibility.mjs";
import { requestSpellLockWindow, completeSpellLockWindow } from "../effects/spell-lock-query.mjs";
import { completeSpellLockGates } from "../effects/spell-lock-gates.mjs";
import { NEXT_SPELL_FLAG, castRefusal, castingDC, castingManaPool, grantingClass, isHealingSpell, manaPrice, overchannelCost, overchannelledSL, payFromNow, spellDCFor, spellManaCost, statedCastingDC, swiftCast, takeNextSpell } from "../rules/casting.mjs";
import { resilienceAbility, resilienceRows } from "../rules/resilience.mjs";
import { injuryConditions } from "../rules/injuries.mjs";
import { injuryFightOf, injuryProvenance } from "../effects/injury-provenance.mjs";
import { enrich } from "../helpers/enrich.mjs";
import { CONSECRATED, CONSECRATED_FLAG, SNARE, cardAttackAllowance, consecratedTrait, evaluateAmount, featurePayment, formsKnown, mainHandOf, payingPool, paysOnSuccess, resistDcFor, rungChoice, weaponRatingOf } from "../rules/class-features.mjs";
// The Chromatic Champion's class features (02 §7; stage 2B): a class feature's own
// `onUse`, and the law its doors read.
import { classFeatureOnUse } from "../rules/class-features.mjs";
import {
  FLIGHT_SCHOOL_FLAG, HARDENED_SCALES, HARDENED_SCALES_FLAG, branchPointsFor, breathAreas, breathSchools, flightSchool,
  hardenedScalesChanges, outOfReach
} from "../rules/chromatic-features.mjs";
import { drakeBreathFor, healthBelow } from "../rules/class-talents.mjs";
// The Chromatic Champion's branch talents (stage 3A): the law, and the one write.
import {
  branchSpellOf, courtGuiseRecord, fontMana, fontOfMagicFor, hastenFor, lifebinderFor, lifebinderSplit, splitOffered, splitRows, voidSpendFor, voidSpendOutcome, voidSpendWrites, hearthfireTick, anchorTick
} from "../rules/chromatic-talents.mjs";
// 02's Bloodlust and 04's Hasten: one Half-Action for the next turn (the lead, 2026-11-08: *"Fix it now"*).
import { BLOODLUST, bloodlustRefusal } from "../rules/extra-halves.mjs";
import { BREATH_CUE_MS } from "../rules/chromatic-features.mjs";
// Shapeshift, the Avatar of the Wild and Metamorphosis (02 §7, D-769): the law,
// and the one writer of a shape.
// The free shift's own law and its once-a-round mark (04's Savage Shift, D-771).
import { FORCED_FORMS, FREE_SHIFT_MARK, METAMORPHOSIS, forcedKindForCard, formPicksRefusal, freeShift, isShapeshiftForm, shapeKindOf, shapeRefusal } from "../rules/shapes.mjs";
import { formsFrom, takeShape } from "../documents/shapes.mjs";
import { secondaryLevel, tierForLevel } from "../rules/progression.mjs";
import { skillFromKnown, skillUuid } from "../rules/creation.mjs";
import { maneuverCost, sizeNote, sunderAmount } from "../rules/maneuvers.mjs";
import { HAMMER_OF_JUSTICE_SPELL, appliesHammerOfJustice, furtherGains, gainOnHit, momentumAfter, refundOnSpend } from "../rules/momentum.mjs";
import { applyCondition, spellTiming, untilEndOfNextTurn, untilNextTurn } from "../effects/durations.mjs";
// 06 SS6 (D-693): a Bane laid on ANOTHER creature - Pummel's two, Gorehowl's one.
import { endBane, layBane, layBoon, spendLaidBanes, spendLaidBoons } from "../effects/banes.mjs";
import { bellowTargetRefusal, bellowDeliveryResult } from "../rules/bellow-targets.mjs";
import { beginBellowJournal } from "../effects/bellow-journal.mjs";
import { requestBellowUse, bellowCommitValid, payBellowUse } from "../effects/bellow-use.mjs";
import { UNANSWERED_FLAG, blockReduction, canReact, meleeInHand, parryHolds, shieldsHeld, standingMarkRefusal, unansweredBy } from "../rules/reactions.mjs";
import { POISON_ROUNDS, coatingAction, coatingFired, consumableEnds, consumableImmunities, endsOnHit, flatten, goesOn, hasUse, poisonTick, runAfter, spendOne } from "../rules/consumables.mjs";
import { guardPendingCustodyItem } from "../rules/item-custody-guard.mjs";
import { wardingElixir, wardingElixirChange, supremePower, supremePowerChange, SUPREME_POWER_FLAG } from "../rules/consumable-schools.mjs";
import { thistleTeaRefill, thistleTeaFatigue } from "../rules/thistle-tea.mjs";
import { WISDOM_FLAG, isDistilledWisdom } from "../rules/distilled-wisdom.mjs";
import { isAntivenom } from "../rules/antivenom.mjs";
import { isRemedy } from "../rules/cures.mjs";
import { INVULNERABILITY_POTION_FLAG, isInvulnerabilityPotion } from "../rules/invulnerability-potion.mjs";
import { useAntivenom } from "../effects/antivenom-use.mjs";
import { acquireConsumableUse } from "../effects/consumable-use-lock.mjs";
import { writeConsumableEffect } from "../effects/consumable-effect.mjs";
import { requestConsumableReceipt } from "../effects/consumable-receipt.mjs";
import { consumableSourceCurrent, payConsumableDose } from "../effects/consumable-payment.mjs";
import { sustainLimit } from "../rules/turn-effects.mjs";
import { standardDC } from "../rules/modifiers.mjs";
import { spendShot } from "../rules/ammunition.mjs";
import { weaponReloadState } from "../effects/reload-state.mjs";
import { requestReloadShot } from "../effects/reload-shot-query.mjs";
import { firedTraits, traitLandings } from "../rules/weapon-traits.mjs";
import { failRiderRecord, hitBaneAt, readSlRider, riderSl, slGatedStatuses, slRiderHolds } from "../rules/spell-sl-riders.mjs";
import { layHitMark, loseMomentum } from "../effects/hit-marks.mjs";
// What a talent spends as part of an attack (04, D-770): the plan the roll pays
// by, the payment off the pools as they stand when it is made, what the blow
// does with it, the condition it lays with no button pressed, and the words.
import { RIDER_DISCOUNT_FLAG, RIDER_REFUSALS, outcomeOfLine, riderConditions, riderPlan, riderWritesOnTarget, settleRiders } from "../rules/riders.mjs";
// A write to a creature this client does not own, asked before anything is spent
// (the architect's review of D-774).
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { landedText, riderCardText, riderReason } from "../helpers/rider-words.mjs";
import { inflictCondition } from "../effects/inflict.mjs";
// Damage or healing laid on a creature, at the start of each of its turns (D-770):
// the tick a card's Apply lays, a poison's, and the card's words for one.
import { featureTick, layTick, tickHasClock } from "../rules/ticks.mjs";
import { endTickAndHeal, tickEffectsOf, tickLaidBy, tickWords } from "../effects/ticks.mjs";
// The Warrior's and the Paladin's kinds (D-772): what each reads at the attack,
// the cast and the Use, the next attack's promise, a heal Mortal Strike blocks,
// a Boon laid on somebody else, and Beacon's chosen creature.
import {
  EXPOSED_FLAG, PLATE_FLAG, boonSpan, calledShotFor, criticalRollCount, extraStrikesFor, freeHealingFor, hitConditionsFor,
  lowerRoll, manaBackFor, nextRoundMark, offHandPenaltyFor, onUseLays, onUseNextAttack, recklessFor, waives
} from "../rules/class-talents.mjs";
// The Ranger's and the Rogue's kinds (D-773): what each reads at the attack, the
// cast and the Use.
import {
  DEATH_MARK_FLAG, NO_CASTING_FLAG, barrageJudgement, blowShareFor, coatingTalentsFor, companionHitConditionsFor, companionHitTestsFor,
  companionQuarryFor, criticalRangeFor, evadeFor, finisherOffer, finisherOptionsFor, grantLimitsFor, halfShare, hiddenAttackFor,
  namesTarget, noCastingFrom, onUseRogueRanger, openingGate, openingMarkRoundsFor, powerReturns,
  ruptureBleeding, steadyReturnFor, unseenComboFor
} from "../rules/class-talents.mjs";
import { forcedSl, riderPierce } from "../rules/riders.mjs";
// THE LEGACY BRANCHES' DOORS (B1): a throw a rider makes possible (door 15), a shot
// not spent (door 26), a cast counted as moving (door 9).
import { spendsShot, throwRefusedFor } from "../rules/riders.mjs";
// A rider's second condition on its own span (04's Shadow Strike; the Legacy branches' B6).
import { riderConditionSpan } from "../rules/riders.mjs";
import { MOVED_MARK } from "../rules/rest.mjs";
import { abilityScope } from "../rules/expressions.mjs";
// The Priest's and the Shaman's kinds (D-774): 02's Ward and the talents on it,
// whom a heal reaches, what a counter or a charge buys on a roll, what a cast's
// card offers after the die, a blow's riders that cost nothing, and 02's
// Reincarnation.
import {
  ASCEND_FLAG, CHARGE_FLAG, CLOUDBURST_FLAG, DOOM_WINDS_FLAG, FIRST_ATTACK_MARK, MAELSTROM_FLAG, REINCARNATION, SPIRIT_WALK_FLAG,
  WARD_BASE, ascendedSl, chargeFor, chargesAfterTest, earthlivingFor, firstAttackFor, guidanceFor, halfDamage, healShares, healTargetRefusal,
  healTargetsFor, maelstromStep, onUsePriestShaman, overloadFor, reincarnatedHealth, reincarnationFor,
  reincarnationRefusal, refundFor, roundMarksLeft, spellAddsFor, spellHealFor, spellOnFailFor, spellTickFor, stormlashFor,
  talentLinesTaken, wardOptionsFor, wardSchools, wardTargetRefusal
} from "../rules/class-talents.mjs";
import { foresightAdmission, foresightCommitValid, requestForesightUse, layWard } from "../effects/wards.mjs";
// The Mage's and the Warlock's kinds (D-775): what each reads at the cast, the
// Use, the card and a Critical Injury's roll.
import {
  BLINK, COUNTERSPELL, CURSE, LIFE_TAP, SACRIFICED_FLAG, VEINS_FLAG, aegisWardFor, blinkFor, blinkTargetRefusal, commandRefusal,
  counterspellFor, curseFor, extendTickRounds, extendedSpan, freeUseFor, higherRoll, immuneAsWardFor, immuneReadAsWard, isSacrificed, lifeTapChoices,
  lifeTapFor, onUseMageWarlock, overchannelReliefFor, ruinFor, sacrificeRecord, sacrificedWardChanges, soulFireRefusal, spanExtensionFor,
  spellCriticalFor, spellDcFor, spellDiscountFor, spellHealthFor, speedReducedFact, sustainsFor, swappableEffects, veinsStates
} from "../rules/class-talents.mjs";
// THE LEGACY BRANCHES' KINDS (B1): what each reads at the cast, the attack and the Use.
import {
  castMovesFor, offHandBuildsFor, onUseLegacy, pierceFor, selfHitTestsFor, slDamageFor, spellPoolFor
} from "../rules/class-talents.mjs";
import { stealSustain } from "../effects/sustain-steal.mjs";
import { requestSpellstealUse, spellstealUseChoice, spellstealUseValid, finishSpellstealUse } from "../effects/spellsteal-use.mjs";
import { spendSnakeTrapDose } from "../effects/snake-trap-dose.mjs";
import { sameSnakeTrapRule, snakeTrapDosePlan } from "../rules/snake-trap-dose.mjs";
import { refuseSustainTransferStart } from "../effects/sustain-transfer-admission.mjs";
import { endSustainsPlan, sustainEntryTransferPending } from "../rules/sustain-entry-transfer.mjs";
import { swapEffects } from "../effects/soul-swap.mjs";
import { hauntTarget } from "../effects/haunt.mjs";
import { commandDemonSightRefusal } from "../effects/command-demon-sight.mjs";
import { commandDemonRangeRefusal } from "../effects/command-demon-range.mjs";
import { giveMana, raiseAlly } from "../effects/gifts.mjs";
import { markLightUsed } from "../effects/shadowform.mjs";
// Spirit Walk's *ignoring Difficult ground* (D-774): the terrain door's own flag (D-757).
import { IGNORES_GROUND_FLAG, targetGroundOf } from "../rules/area-ground.mjs";
// THE DAMAGE DOOR'S RULINGS (D-777): 05's temporary Health - what a spell, a
// draught, a Signature and a Use grant - 07's Aegis floor and the Critical Injury
// it refuses, Spirit Link Totem's named totem, and a blow's second amount of its
// own type.
import { readTemporaryHealth } from "../rules/temporary-health.mjs";
import { RALLYING_CRY, SPIRIT_LINK_FLAG, spellTempFor, spiritLinkFor, tempHealthOnUse } from "../rules/class-talents.mjs";
import { rallyAlly } from "../effects/temporary-health.mjs";
import { floorRefusesCritical, readFloor } from "../rules/blow-doors.mjs";
import { typedLaneExtras } from "../rules/spell-bonus.mjs";
import { loseReaction, reactionLossText } from "../effects/reaction-loss.mjs";
import { laySpeedDrop } from "../effects/speed-drop.mjs";
import { CLOAK_FLAG, DETERRED_FLAG, flaggedEffects, holdOpening, layShadowDance, layState, markOpening } from "../effects/talent-states.mjs";
import { layPoison } from "../effects/ticks.mjs";
import { layNextAttack, takeNextAttack } from "../effects/next-attack.mjs";
import { attackTestPromises } from "../rules/blademaster-test.mjs";
import { spellHitCondition } from "../rules/spell-hit-condition.mjs";
import { chainLightningTargetRefusal } from "../rules/chain-lightning.mjs";
import { layNoHealing } from "../effects/no-healing.mjs";
import { nameBeacon } from "../effects/beacon.mjs";
import {
  ALTERNATE_FLAG, alternateCast, alternateFor, castAsFor, damageBuffFor, featureDamageLane, momentumOnHitFor, nextSpellGrants, onUseOf,
  patchesFor, spellAreaFor, spellDamageFor, spellDurationFor, spellNotesFor, talentEffect, tickBonusFor, tickWardChanges
} from "../rules/talent-effects.mjs";
// What the next spell was promised (04's Nature's Grace, Predator's Swiftness;
// D-771), and Symbiosis's partner, named by the Use.
import { layNextSpell } from "../effects/next-spell.mjs";
import { nameSymbiosisPartner } from "../effects/symbiosis.mjs";
import { partnerRefusal } from "../rules/symbiosis.mjs";
import { adopt, bind, bondOf, boundCount, boundOf, commandDemon, featureForKind, heldNames, release, syncBoundFor } from "../documents/bound.mjs";
import { bindingFor, boundAttacksFor, capacity, eligible, summonRefusal, totemBlock } from "../rules/bound.mjs";
// A totem is planted, and the ground it holds is drawn (02 §7, D-708).
import { plantTotem, plantedLine } from "../documents/totems.mjs";
import { totemAura } from "../rules/totems.mjs";
import { abilityDC, hasAutomation, spendBossPoints } from "../rules/ability-automation.mjs";
import { BOSS, ignoresCritical } from "../rules/bestiary.mjs";
// 08 SS20 (D-692): the pressed half, and the judgement all three surfaces share.
import { gateHolds, isPressable, pressGates, pressRefusal, signatureEffectOf, signatureProse } from "../rules/signatures.mjs";
import {deliverJangthrazeHit} from '../effects/signature-hit-use.mjs';
import {publishHelmetHit} from '../effects/helmet-hit-use.mjs';
// WHICH POOL IS THE MANA POOL (D-637's own pitfall, 2026-09-10): a creature's
// block names no pool type, so `find(p => p.name === "mana")` matched nothing
// on one and both handlers below said *no Mana pool* to a creature holding one.
// And `poolNamed` is the same reading for a COST — `poolFor` below matched a
// pool by name alone, so a Signature that costs a pool refused on all 164.
import { ANY_MOMENTUM, ANY_POOL, anyPoolChoice, anyPoolKey, manaPool, poolNamed } from "../rules/pools.mjs";
// A free cast once per rest, and the Void a branch spell builds (the Chromatic Champion plan).
import { FREE_CAST_FLAG, castVoidFor, spentAfter } from "../rules/free-casts.mjs";
import { MIRROR_IMAGE_COUNT } from "../rules/mirror-image.mjs";
// Attacking and casting end a Hide (D-717).
import { isHiddenFor, reveal } from "../effects/stealth.mjs";
// 06 §5's Engaged, for a creature's casting ability, which has no dialog (D-732).
import { allyOf, creaturesInArea, creaturesWithin, engagedNow, enemyDistances, feetBetweenTokens, reachOfActor } from "../canvas/engaged.mjs";
// An area Use's own targets, and what a Resist on its card governs (the B6 fix; the
// lead: *"Measure the area"*, *"Build it everywhere"*, *"Land automatically"*).
import { gatherOf, landsAtOnce } from "../rules/area-gather.mjs";
// And whether 07 asks a spell's Test at the cast at all, and the half an ability's passed
// Test leaves (the B8a2 pass).
import { castTestGate, castTestOf, castTestRefusal, governed, passedHalf } from "../rules/resisted.mjs";
// What a creature is, for a cast Test only a kind makes (Holy Wrath's undead; the B9a pass).
import { creatureSnapshot, kindsOf } from "../rules/creature-kinds.mjs";
// 07's Nature's Grasp: the Test the next blow on the caster asks (the B9a pass).
import { cleanStruckTest, readStruckTest } from "../rules/struck-tests.mjs";
// What a spell deals around its target, a Test at a time (07's Stormfury; the B8a pass).
import { splashCheck } from "../rules/splash.mjs";
// What a budget would refuse, asked without spending (the architect's review of D-773).
import { spend as judgeSpend } from "../rules/initiative.mjs";
// Who resisted a spell (D-726): the key a target's row records under, and the
// link a Resilience card carries back to the card it answered.
import { resistKey, resistLink } from "../rules/records.mjs";
// THE CROSS-CLASS RULINGS (D-778; the lead's answers of 2026-10-03): 02's Dispel and
// the talents on it, forced movement, the Test 07 gives a held or Stunned creature,
// a Sustain's upkeep by its entry, a Speed drop off a spell's hit and Permafrost's
// feet, and a span out of a fight on the world's clock.
import { DISPEL, DISPEL_REFUSALS, dispelTargetRefusal, gatePassed, spellCasterOf } from "../rules/dispel.mjs";
import { dispelGatesOn, dispelOptionsOn, endEffects, unstableStrikes } from "../effects/dispel.mjs";
import {
  escapeTalentsFor, pushFor, raptureFor, slowingFor, spellPushFor, undispellableFor
} from "../rules/class-talents.mjs";
import { cleanForced, forcedFeet, laidByOne, readForced } from "../rules/forced-movement.mjs";
import { forceMove, forcedWords } from "../effects/forced-movement.mjs";
import { escapeRecord, featureEscapeRecord, readEscape } from "../rules/escapes.mjs";
// THE LEGACY BRANCHES' USES (B1): a hit turned into a miss (door 13), the wield
// gate (door 15), the two marks (door 18) and a condition for one minute (door 26).
import { withdrawHit, withdrawnWords } from "../effects/miss.mjs";
import { negateRefusal, reactionLostToBlow } from "../rules/miss.mjs";
import { annotateMitigation } from "./annotate.mjs";
import { cardPressUnrecordable } from "../effects/card-presses.mjs";
import { wieldRefusal } from "../rules/wield.mjs";
import { CHALLENGE_FLAG, CHALLENGE_TURN_MARK, WATCH_FLAG, bearingTo, challengeRefusal, cleanMark, markOf, markReplaced, marksFrom, watchRefusal } from "../rules/marks.mjs";
import { readUpkeep } from "../rules/upkeep.mjs";
import { SLOWED_FEET_FLAG, readSpeedDrop, speedDropAt } from "../rules/slowing.mjs";
import { clockRounds, minuteSpan, roundsOrClock, untilEndOfNextTurnOrRound, untilNextTurnOrRound } from "../effects/durations.mjs";
// 02 §5's Blood Fury for an orc with no Momentum pool (the lead, 2026-11-02; D-798).
import { BLOOD_FURY_FLAG, ENCOUNTER_CLOCK_ROUNDS, furyEffectData, gainOutcome } from "../rules/blood-fury.mjs";
// D-779: the lead's class answers of 2026-10-03 (O-166 to O-195).
import {
  DEVOURING_PLAGUE, FLAMETONGUE, LIGHTWELL, aegisSchools, chosenWardRemains, curseRoom, lavaLashSpread, parryReaches,
  plagueRefusal, readChosenWard, snakeTrapCatches, standingCurses
} from "../rules/class-answers.mjs";
import {
  chosenWardFor, divineAegisFor, foresightFor, lavaLashFor, plagueFor, rangedParryFor, snakeTrapFor
} from "../rules/class-talents.mjs";
import { OVERCHANNEL_MAX_POINTS, overchannelPrice, takeForFeature } from "../rules/casting.mjs";
import { ROUNDS_PER_MINUTE } from "../rules/area-ticks.mjs";
import { areaOriginFor, pickPoint, pickFacing } from "../canvas/place.mjs";
import { placeArea, regionDataFor, schoolColor } from "../canvas/regions.mjs";
import { feetToPoint } from "../canvas/footprints.mjs";
// THE LEGACY BRANCHES' BODIES (B2): a step to a chosen point (door 3), a called
// creature placed (door 4), the constructs, their shared turn and their tinker
// (door 6), the gadgets (door 7), a trap (door 26), Shackle (door 26) and the
// Gnomish Battle Rig.
import { ESCAPE_FLAG, SHED_DC_FLAG } from "../rules/escapes.mjs";
import { FEATURE_STEPS, STEP_REFUSALS, partyRadius, partyStep, readSpellStep, stepHeldBy, stepOf } from "../rules/steps.mjs";
import { judgeStep, pickPull, pickStep, pulledWords, stepTo, stepWords, steppedWords } from "../effects/steps.mjs";
import { placeOf, placeRefusal } from "../rules/summon-places.mjs";
import { placeSummon } from "../documents/summon.mjs";
import { CONSTRUCTS, CONSTRUCT_KIT, constructEligible, constructsFor, isWrecked, rebuildTime } from "../rules/constructs.mjs";
import { stabilizerIsTriggered } from "../effects/gadget-reactions.mjs";
// Each gadget's row and card link its entry in the Gadgets compendium (`GADGETS_PACK`,
// `gadgetLinkLine`; the lead, 2026-10-24).
import {
  DEVICE_SECTION, GADGETS, GADGETS_PACK, GADGET_REASONS, OVERCLOCK_FLAG, blueprintFor, cleanOverclock, gadgetByKey,
  gadgetChangeRefusal, gadgetSelectionRefusal, gadgetTargetRefusal, gadgetAttackAt, gadgetHealthCost, gadgetLinkLine, gadgetsKnownFor, knownGadgets, knownRowOf, overclockFor, shrinkAmount
} from "../rules/gadgets.mjs";
import { GRAVE_BOND_RESISTED_FLAG, graveBondFor, resistedBonds, withResistedBond } from "../rules/bound.mjs";
import { TRAP_FLAG, cleanTrap, trapArea, trapOf, trapsToLift } from "../rules/traps.mjs";
import { shackleRounds } from "../rules/class-talents.mjs";
import { shapeEntryOf } from "../rules/shapes.mjs";
// THE LEGACY BRANCHES' B3 (doors 10, 11, 12 and 25): the Spirit Realm and Ethereal Form
// (06 §10; 04's The Crossing, Ethereal Form, Kindred Spirits), a death hold's sheet
// refusal, and the Uses that write beyond their descriptor.
import { crossingOf, etherealAlliesFor, etherealAlliesRefusal, featureRestoresOnly, restoresOnly } from "../rules/spirit-realm.mjs";
import { attackRefusalFor, castNamesSelf, castRefusalFor, crossInto, crossed, layEthereal, realmRefusalFor } from "../effects/spirit-realm.mjs";
import { reviveRefusal } from "../rules/death-holds.mjs";
import {
  CONCEAL_FLAG, IMMUNE_FLAG, PAD_FLAG, areaDispelReaches, armorChanges, cleanPad, concealStrike, cureRefusal, dealtHalvedBy, halvedAmount, halvesDealtRefusal, isThrallBond,
  onUseSpirits, summonedOrBound, thrallRefusal, transportFatigues, transportRefusal, usesAskedLater
} from "../rules/legacy-uses.mjs";
import { cureCondition, curableConditionsOn, layStateOn, reviveCreature, reviveFacts, tokenFightsNow, transportTo, useCuttingGear } from "../effects/legacy-uses.mjs";
// 04's Ancestor's Hand: every Dying friend in reach, lifted (the Legacy branches' B6).
import { liftDying } from "../effects/legacy-uses.mjs";
import { dyingNow } from "../effects/spirit-realm.mjs";
// Disenchant's area reads each creature's standing on its own scene (the B3 review).
import { combatantIn, standingOf } from "../canvas/engaged.mjs";
import { holdsCuttingGear } from "../rules/escapes.mjs";
import { HIDDEN_STATUS } from "../rules/stealth.mjs";
import { SUMMONED_FLAG } from "../documents/summon.mjs";
import { worldActorOf } from "../documents/bound.mjs";
// What a Use, an attack and a step record for the animation layer (the Legacy
// branches' door 2): records of what happened, as `source` and `strike` are.
import { abilityKeyOf, cleanFromFeature, featureKeyOf, risenRecord, tokenRef } from "../rules/animation-records.mjs";
import { PRESENTATION_ONLY_ABILITIES, CREATURE_PRESENTATION_AREAS } from "../rules/creature-animation-table.mjs";
import { castingBonusOf } from "../rules/item-bonuses.mjs";
// 14 §1's Boss Actions, for every Boss (D-809): the points' one writer, the doors a
// plan names, and the reads an attack makes of what a Boss Action laid.
import { bossRefusalWords, claimBossPoints } from "../effects/boss-points.mjs";
import { afterBossPress, bossCardFlags, prepareBossPress, takeMarkedExtra, takeMissNext } from "../effects/boss-doors.mjs";
import { bossPressJudgement, bossTurnKey, cleanBossPlan } from "../rules/boss-actions.mjs";
// A creature's ability that carries a plan, and a summon that arrives later (D-811).
import { hasCreaturePlan, summonDue } from "../rules/creature-plans.mjs";

/**
 * **THE FINISHER AS IT STANDS NOW** (02 §7 with 04's Death Mark, Rupture and
 * Ruthlessness laid over it; D-773): the dialog's own reading, asked again at the
 * roll. Null where there is nothing to offer.
 *
 * @param {Actor} actor
 * @param {object|null} target  the first target snapshot
 */
function finisherStateOf(actor, target) {
  // **WHOSE COMBO POINTS** (04's Supercharge: *Your Finisher class feature may be
  // spent on an attack one of your constructs makes*; the Legacy branches' door 6):
  // the striker's own, or - a construct's blow - its tinker's (`AzerothActor
  // #finisherPayer`), with the tinker's talents laid over it.
  const payer = actor?.finisherPayer?.() ?? actor;
  const pool = (payer?.system?.momenta ?? []).find(p => p.name === "comboPoints") ?? null;
  const marked = namesTarget(payer?.getFlag?.("azeroth-rpg", DEATH_MARK_FLAG) ?? null, target);
  return finisherOffer(pool, finisherOptionsFor(payer?.takenTalents?.() ?? []), { marked });
}

/**
 * **THE OWNER A COMPANION FIGHTS FOR** (D-643's bond; D-773's Ferocious Bite,
 * Intimidation and Shared Quarry read the OWNER's talents off the companion's
 * blow): the world actor its bond names, where the bond is a companion's.
 *
 * @param {Actor} actor
 * @returns {Actor|null}
 */
function companionOwnerOf(actor) {
  if (actor?.type !== "npc") return null;
  const bond = bondOf(actor);
  if (bond?.kind !== "companion" || !bond.ownerUuid) return null;
  try {
    const owner = fromUuidSync(bond.ownerUuid);
    return owner?.documentName === "Actor" ? owner : null;
  } catch {
    return null;
  }
}

/**
 * **THE OWNER ANY BOUND CREATURE FIGHTS FOR** (D-643's bond): the world actor its
 * bond names, whatever the kind - a totem's shaman (04's Serpent Ward), a
 * construct's tinker (04's Supercharge; the Legacy branches' doors 6 and 20).
 *
 * @param {Actor} actor
 * @returns {Actor|null}
 */
function boundOwnerOf(actor) {
  if (actor?.type !== "npc") return null;
  const bond = bondOf(actor);
  if (!bond?.ownerUuid) return null;
  try {
    const owner = fromUuidSync(bond.ownerUuid);
    return owner?.documentName === "Actor" ? owner : null;
  } catch {
    return null;
  }
}

/**
 * **WHAT AN ATTACK CARD RECORDS OF WHAT DREW ITS BLOW** (the Legacy branches' door
 * 2), for the animation layer to read as it reads `strike` (D-725): the feature card
 * the attack was made from (`fromFeature {messageId, key}`), the bound attack patches
 * that shaped it - the owner's `boundAttack` rows on this creature, door 20's own
 * reading (`patchedBy`) - and the riders ridden with it (`ridden`), each a key the
 * feature table is filed under. Written hit or miss: a `hit` cue on a miss is the
 * law's word `missed`, never a silence. Empty keys are left off.
 *
 * @param {{actor: Actor, fromFeature?: object|null, riderRows?: Array<{identifier?: string}>}} o
 * @returns {{fromFeature?: object, patchedBy?: string[], ridden?: string[]}}
 */
function attackRecords({ actor, fromFeature = null, riderRows = [] } = {}) {
  const out = {};
  const from = cleanFromFeature(fromFeature);
  if (from) out.fromFeature = from;
  const owner = boundOwnerOf(actor);
  const patchedBy = owner
    ? boundAttacksFor(owner.takenTalents?.() ?? [], { kind: bondOf(actor)?.kind ?? null, name: actor.name ?? "" }).map(r => r.identifier)
    : [];
  if (patchedBy.length) out.patchedBy = patchedBy;
  const ridden = [...new Set((riderRows ?? []).map(p => p?.identifier).filter(id => typeof id === "string" && id))].sort();
  if (ridden.length) out.ridden = ridden;
  return out;
}

/**
 * **04's FLAMETONGUE, HELD** (the lead, 2026-10-03, on O-188: *"1 mana"*; D-779): a
 * Sustain entry of its own on the shaman - no spell behind it, its upkeep 1 Mana at
 * the start of each of the shaman's turns out of the pool that paid for it (05 §12,
 * `rules/upkeep.mjs#upkeepOf`), counted against the Sustains the shaman may hold,
 * dropped from the sheet's strip like any other. While it stands the attack door
 * makes a Physical weapon blow Fire (`applications/actions.mjs#attackWithDialog`).
 *
 * @param {Actor} actor
 * @param {{name?: string, poolItemId?: string|null}} o
 * @returns {Promise<string>}  the card's line
 */
async function sustainFlametongue(actor, { name = FLAMETONGUE.talent, poolItemId = null } = {}) {
  const sustaining = foundry.utils.deepClone(actor.getFlag("azeroth-rpg", "sustaining") ?? []);
  sustaining.push({
    spellId: null, uuid: null, name, itemId: poolItemId, cast: foundry.utils.randomID(),
    identifier: FLAMETONGUE.identifier, targets: [], source: null, upkeep: { ...FLAMETONGUE.upkeep }
  });
  const features = actor.items.filter(i => i.type === "feature").map(i => ({ name: i.name }));
  const more = sustainsFor(actor.takenTalents?.() ?? [], {
    holdsWeave: features.some(f => f.name === "Shape the Weave"),
    archmageStanding: (actor.effects ?? []).some(e => e.active !== false && e.getFlag?.("azeroth-rpg", "identifier") === "archmage")
  });
  const limit = sustainLimit({ features, extra: more.more });
  while (sustaining.length > limit) {
    const dropped = sustaining.shift();
    await liftSpellEffects(actor, actor.items.get(dropped.spellId)?.uuid ?? dropped.uuid ?? null, dropped.cast ?? null);
    ui.notifications?.info(game.i18n.format("AZEROTH.Combat.SustainEnded", { name: actor.name, spell: dropped.name }));
  }
  await actor.setFlag("azeroth-rpg", "sustaining", sustaining);
  return game.i18n.format("AZEROTH.Flametongue.Held", { name, n: FLAMETONGUE.upkeep.mana });
}

/**
 * **04's LIGHTWELL, SET** (the lead, 2026-10-03, on O-184: *"10 minutes, caster
 * chooses place."*; D-779): the font as a 30-foot area on the viewed scene at the
 * point the priest picked, a timed area the sweep takes off when its ten minutes
 * are over - and the card's record of it: the Region, the charges, the heal (the
 * priest's tier) and who set it. Null where nothing could be placed.
 *
 * **TEN MINUTES OF THE WORLD'S CLOCK, IN A FIGHT OR OUT** (READING, D-779): a timed
 * area placed in a fight ends with that fight (D-756), and one placed outside joins
 * the first fight on its scene (`sustained-areas.mjs#clockAreasNow`) - either of
 * which would end a font the lead gave ten minutes with the fight it was set in.
 * The record carries `worldClock`, no fight, and the world time it went down
 * (`area-ticks.mjs#areaLapsed` then counts six seconds a round, which core's fight
 * advances), and the join passes it over.
 *
 * @param {Actor} actor  the priest
 * @param {{origin: {x: number, y: number}, item: Item, row?: object}} o
 */
async function placeLightwell(actor, { origin = null, item = null, row = null } = {}) {
  const scene = canvas?.scene ?? null;
  if (!scene || !origin) return null;
  const minutes = Math.max(1, Math.trunc(Number(row?.minutes)) || LIGHTWELL.minutes);
  const cast = foundry.utils.randomID();
  const now = Number(game.time?.worldTime) || 0;
  const region = await placeArea({
    areaText: LIGHTWELL.area, name: item?.name ?? LIGHTWELL.talent, color: schoolColor("holy"), scene, origin, rotation: 0, token: null, attach: false,
    flags: {
      cast, caster: actor.uuid, sustained: false, lightwell: true, worldClock: true,
      lasts: { rounds: minutes * ROUNDS_PER_MINUTE },
      placedAt: { combatId: null, round: null, turn: null, time: now },
      spell: { name: item?.name ?? LIGHTWELL.talent, school: "holy", tier: null, takesSpellpower: false, img: item?.img ?? null, feature: true }
    }
  });
  if (!region) return null;
  return {
    regionId: region.id, sceneId: scene.id, cast, by: actor.uuid,
    charges: Math.max(1, Math.trunc(Number(row?.charges)) || LIGHTWELL.charges),
    heal: Math.max(1, Math.trunc(Number(actor.system?.tier)) || 1),
    expires: now + minutes * ROUNDS_PER_MINUTE * 6
  };
}

/**
 * **EVERY CREATURE A CURSE COULD STAND ON** (O-194, D-779): the world's actors and
 * the unlinked tokens of every scene that carry an effect of their own, each as the
 * plain shape `rules/class-answers.mjs#standingCurses` reads. A token whose delta
 * holds no effect carries no Curse, and is never materialized to find that out.
 *
 * @returns {Array<{uuid: string, effects: Array<{origin: string|null, active: boolean, flags: object}>}>}
 */
function creaturesForCurses() {
  const out = [];
  const seen = new Set();
  const take = a => {
    if (!a?.uuid || seen.has(a.uuid)) return;
    seen.add(a.uuid);
    out.push({ uuid: a.uuid, effects: (a.effects ?? []).map(e => ({ origin: e.origin ?? null, active: e.active !== false, flags: e.flags ?? {} })) });
  };
  for (const a of game.actors ?? []) take(a);
  for (const scene of game.scenes ?? []) {
    for (const t of scene.tokens ?? []) {
      if (t.actorLink || !((t.delta?.effects?.size ?? 0) > 0)) continue;
      take(t.actor);
    }
  }
  return out;
}

/**
 * **04's DIVINE AEGIS, NAMED AT THE CAST** (the lead, 2026-10-03, on O-183: *"The
 * caster"*; D-779): where a healing spell or feature is cast by a healer holding the
 * talent, the schools - as many as the rank - through the one chooser (D-673). Null
 * where nothing heals, the talent is not held, or the chooser was dismissed (said).
 *
 * @param {Actor} actor  the healer
 * @param {{heals?: boolean, name?: string}} o
 * @returns {Promise<{name: string, ward: number, schools: string[], by: string}|null>}
 */
async function nameAegisSchools(actor, { heals = false, name = "" } = {}) {
  if (!heals || actor?.type !== "character") return null;
  const row = divineAegisFor(actor.takenTalents?.() ?? []);
  if (!row) return null;
  const talent = (row.talentId ? actor.items.get(row.talentId) : null) ?? { id: null, name: row.name };
  const options = Object.keys(AZEROTH.schools).map(key => ({ key, name: game.i18n.localize(AZEROTH.schools[key]), description: "" }));
  const prompt = game.i18n.format("AZEROTH.DivineAegis.Prompt", { name: row.name, n: row.count, spell: name });
  const pick = await chooseOption(talent, options, null, { prompt, max: row.count, label: "AZEROTH.DivineAegis.Name" });
  const schools = aegisSchools((Array.isArray(pick) ? pick : (pick ? [pick] : [])).map(p => p.key), row.count);
  if (!schools.length) {
    ui.notifications?.info(game.i18n.format("AZEROTH.DivineAegis.None", { name: row.name }));
    return null;
  }
  return { name: row.name, ward: row.ward, schools, by: actor.uuid };
}

/**
 * Whether a character who could answer this attack holds 04's Foresight and 02's
 * Ward (D-779): an attack card offers a Foresight Ward only where somebody could
 * press it. **Inside a fight only a priest IN that fight counts** (2026-11-04):
 * Foresight *spends a Reaction*, and a priest who is not a combatant has none, so a
 * Foresight priest anywhere in the world held the damage of every hit in every
 * fight behind a reveal nobody there could press. Out of a fight, any character.
 */
function foresightHeld(fight = null) {
  const holds = a => a?.type === "character" && a.hasFeature?.("Ward") && foresightFor(a.takenTalents?.() ?? []);
  if (fight?.combatants) return fight.combatants.some(c => holds(c.actor));
  return (game.actors?.contents ?? []).some(holds);
}

/**
 * The once-a-round marks an actor's combatant holds THIS round in the fight it is
 * in, or none out of one (D-761's record, read).
 *
 * @param {Actor|null} actor
 * @returns {string[]}
 */
function roundUsedOf(actor) {
  const fight = actor?.activeFight?.() ?? null;
  const combatant = fight ? (fight.getCombatantsByActor?.(actor)?.[0] ?? null) : null;
  if (!combatant) return [];
  const r = combatant.getFlag("azeroth-rpg", "round") ?? {};
  return r.number === fight.round ? (r.once ?? []) : [];
}

/**
 * **A PARRY ANSWERS A MELEE BLOW** (D-779; the lead, 2026-10-03, on O-180:
 * *"Parry is limited to melee unless a feature allows ranged parry."*): the card's
 * reaction rows, a defender's Parry kept on a ranged or thrown blow only where its
 * 04 Anticipation reaches it - within its feet of the striker, a mark of its round
 * left (`class-answers.mjs#parryReaches`). A blow whose way was never recorded is
 * the table's, as it was. A row left with neither button goes; the press judges
 * it all again (`applications/actions.mjs#reactWithDialog`).
 *
 * @param {Array<object>} rows  `reactionRows`'
 * @param {{actor?: Actor|null, list?: Array, strike?: object|null}} o
 */
function parryOffered(rows = [], { actor = null, list = [], strike = null, unanswerable = false } = {}) {
  // **AN ATTACK PROMISED NO ANSWER** (04's False Opening: *Your next attack this turn cannot
  // be met with a Parry or a Block*; stage 3A): neither row is offered; the press refuses it
  // too (`actions.mjs#reactionStateOf` reads the card's own `unanswerable`).
  if (unanswerable === true) {
    return (rows ?? []).map(row => ({ ...row, parry: null, block: null })).filter(row => row?.negate || row?.phaseShift);
  }
  const rangeKind = strike?.rangeKind ?? null;
  if (!rangeKind || rangeKind === "melee") return rows ?? [];
  const from = actor?.getActiveTokens?.(true)?.[0] ?? null;
  return (rows ?? []).map(row => {
    if (!row?.parry) return row;
    const t = list[row.index] ?? null;
    const defender = targetActorOf(t);
    const ranged = typeof defender?.takenTalents === "function" ? rangedParryFor(defender.takenTalents()) : null;
    const verdict = parryReaches({ rangeKind, feet: feetBetweenTokens(from, tokenOfTarget(t)), ranged, used: roundUsedOf(defender) });
    return verdict.ok ? row : { ...row, parry: null };
  // A row Afterimage alone answers stays (the Legacy branches' door 13): *when an
  // attack hits you* is any attack, a shot or a throw as well.
  }).filter(row => row?.block || row?.parry || row?.negate || row?.phaseShift);
}

/**
 * Mana back into one pool, never past its maximum (04's Illumination, D-772),
 * read again because the cast's own payment has just moved it. Answers what
 * landed, so the card says the number that moved.
 * @param {Actor} actor
 * @param {{itemId: string, name: string}|null} pool
 * @param {number} amount
 */
async function restoreMana(actor, pool, amount) {
  if (!pool || !(Number(amount) > 0)) return 0;
  const now = (actor.poolSnapshot?.() ?? []).find(p => p.itemId === pool.itemId && p.name === pool.name) ?? null;
  if (!now) return 0;
  const value = Math.min(now.max, now.value + Math.trunc(Number(amount)));
  if (value <= now.value) return 0;
  await actor.updatePool({ itemId: now.itemId, kind: now.kind, value });
  return value - now.value;
}

// Still reachable here: the Quench combat batch and the card read it from the workflows.
export { calledShotCost };
export { medicineTest, exposeAffliction, addAffliction, afflictionCatalogue, chooseAffliction, afflictPoison, afflictDisease,
  resolveRelapse, markFirstTestBane } from "./afflictions-workflows.mjs";

/**
 * The actor a target snapshot points at: its token on its scene, else the
 * world actor. `applications/actions.mjs` and `dice/chat.mjs` keep the same
 * three lines; a snapshot is deliberately plain data and each side resolves it.
 */
function targetActorOf(t) {
  const scene = (t?.sceneId && game.scenes.get(t.sceneId)) || canvas?.scene || null;
  const token = t?.tokenId ? scene?.tokens?.get(t.tokenId) : null;
  return token?.actor ?? (t?.actorId ? game.actors.get(t.actorId) : null) ?? null;
}

/** Resolve again at payment: a snapshot predating Dispersion is not permission
 * to target its owner now. Reject the whole selection without silently changing it. */
function refuseDispersedTargets(targets = []) {
  return (targets ?? []).some(target => refuseDispersion(targetActorOf(target), "target"));
}

/**
 * **WHETHER WRITING THESE CREATURES NEEDS A GM, AND NONE IS ONLINE** (the
 * architect's review of D-774): a creature this client does not own is written on
 * the active GM's client through `CONFIG.queries`, and with no GM that write
 * failed after the Use, the cast or the rider had paid for it. Every such door
 * asks this with its other refusals - the summons' own check in the same shape.
 * A creature that is gone needs nobody.
 *
 * @param {Array<Actor|null>} actors
 */
function gmAbsentForActors(actors = []) {
  return gmAbsentFor({
    owned: (actors ?? []).filter(Boolean).map(a => a.isOwner === true),
    isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM)
  });
}

/** The placeable a target snapshot names on the viewed scene, or null (D-774). */
function tokenOfTarget(t) {
  const viewed = canvas?.scene ?? null;
  if (!t?.tokenId || !viewed || (t.sceneId && t.sceneId !== viewed.id)) return null;
  return canvas.tokens?.get?.(t.tokenId) ?? null;
}

/**
 * The token DOCUMENT a target snapshot names, on its own scene, viewed or not
 * (D-778): a forced move writes the document, and the door asks the walls only
 * where it is drawn.
 */
function tokenDocOfTarget(t) {
  const scene = (t?.sceneId && game.scenes.get(t.sceneId)) || canvas?.scene || null;
  return t?.tokenId ? scene?.tokens?.get(t.tokenId) ?? null : null;
}

/** The Sustain entries a creature holds (05 §12, D-724), as it stores them. */
function sustainsOf(actor) {
  const held = actor?.getFlag?.("azeroth-rpg", "sustaining") ?? [];
  return Array.isArray(held) ? held.filter(e => e && typeof e === "object") : [];
}

/**
 * **THE FURTHER TARGETS OF A HEAL THAT STAND BEYOND ITS REACH** (04's Circle of
 * Healing and Chain Heal: *within 10 feet*; D-774), by name: MY READING, for the
 * lead, within that many feet of the FIRST target, measured between the nearest
 * squares (D-732); a pair that cannot be measured is left to the table.
 *
 * @param {Array<object>} list  the target snapshots
 * @param {{primary: number, further: {feet: number}|null}|null} limits
 * @returns {string[]}
 */
function furtherTooFar(list = [], limits = null) {
  if (!limits?.further || list.length <= limits.primary) return [];
  const first = tokenOfTarget(list[0]);
  const out = [];
  for (const t of list.slice(limits.primary)) {
    const d = feetBetweenTokens(first, tokenOfTarget(t));
    if (d !== null && d > limits.further.feet) out.push(t?.name ?? "");
  }
  return out;
}

/**
 * **A STATIC CHARGE GAINED** (04: *When a Casting Test you make meets or exceeds
 * SL 2, you gain a Static Charge*; D-774), on the caster's own flag, never past
 * what may be held. Answers whether one was gained.
 *
 * @param {Actor} actor
 * @param {number} sl
 */
async function gainCharge(actor, sl) {
  const row = chargeFor(actor.takenTalents(), { tier: actor.system?.tier ?? 1 });
  if (!row || !actor.isOwner) return false;
  const held = Math.max(0, Math.trunc(Number(actor.getFlag("azeroth-rpg", CHARGE_FLAG))) || 0);
  const next = chargesAfterTest(held, row, sl);
  if (next === held) return false;
  await actor.setFlag("azeroth-rpg", CHARGE_FLAG, next);
  return next > held;
}

/**
 * **A STATIC CHARGE SPENT** (D-774): one off the caster's flag, read again at the
 * write. Answers whether one was there to spend.
 *
 * @param {Actor} actor
 */
async function spendCharge(actor) {
  const held = Math.max(0, Math.trunc(Number(actor.getFlag("azeroth-rpg", CHARGE_FLAG))) || 0);
  if (held < 1) return false;
  await actor.setFlag("azeroth-rpg", CHARGE_FLAG, held - 1);
  return true;
}

/**
 * **A TALENT'S COUNTER, STRUCK** (D-774): the use of the feature the talent
 * grants, once what it bought is paid for (Inner Focus, Lava Burst, Overload,
 * Ancestral Knowledge).
 *
 * @param {Actor} actor
 * @param {string} identifier  the talent's
 */
export async function strikeTalentUse(actor, identifier) {
  const counter = talentCounterOf(actor, identifier);
  const left = talentUsesLeft(actor, identifier);
  if (!counter || left < 1) return false;
  await counter.update({ "system.uses.value": left - 1 });
  return true;
}

/** The feature counting a talent's uses (D-648), or null. */
function talentCounterOf(actor, identifier) {
  const talent = actor?.items?.find(i => i.type === "talent" && i.system?.identifier === identifier) ?? null;
  const counter = talent ? (actor.grantedFeature?.(talent.id) ?? null) : null;
  return counter?.system?.uses?.per ? counter : null;
}

/**
 * **WHAT IS LEFT ON A TALENT'S COUNTER, READ WITHOUT STRIKING IT** (the
 * architect's review of D-774): a card's talent button asks it before it records
 * the press, and strikes the use only once the press is recorded.
 *
 * @param {Actor} actor
 * @param {string} identifier  the talent's
 * @returns {number}
 */
export function talentUsesLeft(actor, identifier) {
  const counter = talentCounterOf(actor, identifier);
  return counter ? Math.max(0, Math.trunc(Number(counter.system.uses.value)) || 0) : 0;
}

/**
 * **CLOUDBURST'S PROMISE, TAKEN** (04: *The next healing spell or feature you use
 * restores the same amount to every friendly target within 20 feet of its target*;
 * D-774): the allies measured around the heal's first target, as target snapshots
 * the card's heal buttons reach, the promise lifted. None where nothing is
 * promised, or the first target stands on no viewed scene (said in words).
 *
 * @param {Actor} actor  the healer
 * @param {Array<object>} list  the heal's own targets
 * @returns {Promise<{extra: Array<object>, by: string|null}>}
 */
async function takeCloudburst(actor, list = []) {
  const promise = actor.getFlag("azeroth-rpg", CLOUDBURST_FLAG) ?? null;
  if (!promise?.feet) return { extra: [], by: null };
  await actor.unsetFlag("azeroth-rpg", CLOUDBURST_FLAG);
  const first = tokenOfTarget(list[0]);
  if (!first) {
    ui.notifications?.info(game.i18n.format("AZEROTH.Cloudburst.Unmeasured", { name: promise.source ?? "" }));
    return { extra: [], by: promise.source ?? null };
  }
  const named = new Set(list.map(t => t?.tokenId).filter(Boolean));
  const near = creaturesWithin(actor, promise.feet, { from: first, who: "ally" }).filter(r => !named.has(r.token.id));
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  return { extra: targetSnapshots(near.map(r => r.token)), by: promise.source ?? null };
}

const { renderTemplate } = foundry.applications.handlebars;

const TEMPLATE = {
  roll: "systems/azeroth-rpg/templates/chat/roll-card.hbs",
  spell: "systems/azeroth-rpg/templates/chat/spell-card.hbs",
  corruption: "systems/azeroth-rpg/templates/chat/corruption-card.hbs",
  critical: "systems/azeroth-rpg/templates/chat/critical-card.hbs",
  feature: "systems/azeroth-rpg/templates/chat/feature-card.hbs",
  maneuver: "systems/azeroth-rpg/templates/chat/maneuver-card.hbs",
  choose: "systems/azeroth-rpg/templates/dialog/choose.hbs"
};

/* -------------------------------------------- */

/**
 * The card's verdict (D-622): the outcome in a word - Success or Failure,
 * Hit or Miss on an attack - and 05 SS2's name for the margin. Null with no
 * roll. The keys are built from literal prefixes so the language file's
 * audit can see them.
 */
function verdictFor(outcome, { attack = false, word = null } = {}) {
  if (!outcome) return null;
  const won = outcome.success === true;
  const key = attack ? (won ? "Hit" : "Miss") : (won ? "Success" : "Failure");
  const name = resultName({ sl: outcome.sl, success: won });
  return {
    success: won,
    outcome: word ?? game.i18n.localize("AZEROTH.Roll.Outcome." + key),
    margin: game.i18n.localize("AZEROTH.Roll.Result." + name[0].toUpperCase() + name.slice(1))
  };
}

/* -------------------------------------------- */

/**
 * Roll a Test and post a card.
 *
 * @param {object} o
 * @param {Actor} o.actor
 * @param {string} [o.kind]        skill | attack | casting | resilience
 * @param {number} [o.dc]
 * @param {Array<{label: string, value: number}>} [o.modifiers]
 * @param {number} [o.boons]
 * @param {number} [o.banes]
 * @param {string} [o.location]    body | head | limb, for an attack
 * @param {object} [o.damage]      { rating, kind, school, penetration }
 * @param {object} [o.target]      { apByLocation, ward, immune, vulnerable }
 * @param {string} [o.title]
 */
export async function rollTest({
  actor,
  kind = "skill",
  skill = null,
  ability = null,
  equipmentPrepared = false,
  equipmentTestIds = null,
  provisionTestIds = null,
  dc = 10,
  modifiers = [],
  boons = 0,
  banes = 0,
  location = null,
  damage = null,
  target = null,
  targets = null,
  momentumSpent = 0,
  provenanceExtra = [],
  // WHAT A TALENT ADDS TO THE DAMAGE (04, D-711 phase 2): the Damage lines the
  // roller left ticked on the dialog, summed, with their names for the card.
  // Twenty talents in 04 say *adds 1 damage per rank* and not one number
  // reached a card before this (the lead's items 20 and 30).
  extraRating = 0,
  damageRows = [],
  // 02 §7's Finisher (the lead's item 11): *spend all your Combo Points and add
  // that many to the damage of one attack.* The dialog's own checkbox decided
  // the number; this pays it before the die, beside the called shot's Momentum.
  finisherSpent = 0,
  // **WHAT THE TALENTS SPEND AS PART OF THIS ATTACK** (04, D-770; the lead:
  // *"Lines on attack dialog"*): the identifiers of the rider lines the roller
  // ticked. Judged again here against the pools as they stand, paid with the
  // called shot's Momentum and the Finisher, and their on-hit effect landing
  // with the blow.
  riders = [],
  title = "",
  subtitle = "",
  offHand = false,
  budget = null,
  gainsMomentum = true,
  ammunition = null,
  traits = [],
  // What the weapon's traits do to the blow (08 §5, 2026-09-06), from rules/weapon-traits.mjs.
  weaponEffects = null,
  // WHAT THE TARGET IS WEARING ANSWERS BACK (08 SS20, D-692). The rows are the
  // TARGET's `signatureEffects().whenStruck`, resolved at the attack door
  // because a snapshot carries no items - Skullflame Shield's *a creature that
  // hits you in melee takes 3 Fire damage* is about the creature being struck
  // and reaches nothing on the attacker's own aggregate.
  struckBack = [],
  // WHAT THE DEFENDER MAY ANSWER WITH (06 §6, D-693): Parry and Block, one
  // row per target, resolved at the attack door because a snapshot carries no
  // items. `dice/chat.mjs` shows a row only to whoever owns that target.
  reactions = [],
  // A stone, an oil or a poison on the blade (08 §12, §13; D-670): what it
  // says when the blow lands, and a poison leaves with it.
  coating = null,
  weaponId = null,
  // 14 §1: *a Boss Action is not a Half-Action; it touches neither the
  // creature's own turn nor its Reaction*, and *a Boss's Boss Actions are
  // separate from both.* The points were spent when the action was used
  // (D-691), so the turn's budget is not asked at all here. (The chapter's
  // old *exception to the once-per-round Attack limit* went with the limit
  // itself, D-711: each Half-Action may be an Attack and there is nothing
  // left to be exempt from.)
  bossAction = false,
  // **THIS ATTACK TEST IS A PARRY** (06 §6, D-693). *Roll an Attack Test
  // against the attacker's total* - so it takes the weapon's own Banes and
  // the dialog's attack lines - but it is not an attack: 06 §8's Critical
  // Injury happens *on a natural 20 on an attack*, and a Parry that rolled
  // one would otherwise offer to break a rib. It says Success or Failure
  // rather than Hit or Miss for the same reason, and it offers no Reaction
  // of its own.
  parry = false,
  // **WHAT A READER AFTER THE DIE NEEDS** (D-724, D-725). `source` is the token
  // that acted, as the roll dialog found it before it opened; `strike` is what
  // an attack is struck with, as a form and never an asset; `answers` is the
  // card a Parry answers. Records of what happened, as `damageByTarget` is:
  // written onto the card and read by nothing in this function.
  source = null,
  strike = null,
  answers = null,
  // **THE FEATURE CARD THIS ATTACK WAS MADE FROM** (the Legacy branches' door 2):
  // `{messageId, key}`, handed in by the card's Attack button
  // (`dice/chat.mjs#attackFromCardNow`), a record as `strike` is.
  fromFeature = null,
  npcShieldSlamShieldId = null,
  // **WHICH SPELL CARD'S RESIST THIS TEST ANSWERS** (D-726): the row, the
  // creature and the cast, as `rules/records.mjs#resistLink` builds them.
  // Named here on purpose - `rollResilience` hands its caller's keys on with
  // `...rest`, and a key this list does not name is dropped without a word.
  resistOf = null,
  // Preserve which Resilience was actually rolled for validated effect answers.
  resilience = null,
  // **THE LINES THE ROLLER LEFT TICKED** (D-772), by id, as the dialog's choice
  // carries them: 04's Reckless lays its exposure only where its own Boon was
  // taken.
  chosen = [],
  // **WHAT THE RANGER'S AND THE ROGUE'S TALENTS READ AT THE ROLL** (D-773): the
  // one enemy Engaged being the target, as the attack door measured it (Master
  // Duellist's Critical Injury); the blow being 06 §7's Riposte (Killing Spree,
  // recorded on the card for the damage door); and the Finisher's shape the
  // dialog chose - Death Mark's free use by name, Rupture's Bleeding.
  engagedOne = false,
  riposte = false,
  finisherFree = null,
  finisherMode = "damage",
  // **WHAT A TALENT'S CHARGE BUYS ON THIS BLOW** (D-774): the identifiers the
  // roller ticked - Static Charge's tier - judged again before anything is spent.
  talentLines = [],
  // **THE SECOND ROLL OF AN EXTRA ATTACK** (D-774): one Attack, two rolls (D-704),
  // so what *a melee attack* earns (Earthliving) rides the first roll alone.
  secondRoll = false,
  // **AN OPPORTUNITY ATTACK** (the Legacy branches' door 22): 04's Hold the Hall's *On
  // a hit it is knocked Prone* rides one alone (`hitLays` with `when: "opportunity"`).
  opportunity = false,
  // **A THROW A RIDER MADE POSSIBLE** (04's Storm Bolt; door 15): the rider's
  // identifier, from the way the dialog chose - the throw is refused without it.
  throwAs = null,
  // **WHAT THIS ATTACK'S HIT LAYS, WHATEVER STRIKES IT** (the Legacy branches' door 7:
  // 04's Net-o-Matic Projector, *On a hit it is Entangled until it spends an action
  // and passes a Reflex Resilience Test against your Spell DC*): `[{condition, value,
  // until, escape}]`, each landing on every target the card records through the one
  // landing door, its escape at the striker's Spell DC - and withdrawn with the hit.
  landsOnHit = []
} = {}) {
  if (!militiaDrillSelection(actor.getFlag?.('azeroth-rpg', MILITIA_DRILL_FLAG), chosen, kind).ok) {
    ui.notifications.warn(game.i18n.localize('AZEROTH.MilitiaDrill.Refused')); return null;
  }
  if (kind === "attack" && !parry && refuseDispersion(actor, "attack")) return null;
  if (parry && weaponId && refuseDispersion(actor, "gear")) return null;
  if (refuseAncientDespair(actor, kind)) return null;
  // **07's HEX: *it cannot attack*** (D-808): no attack and no Parry under Hex or
  // Polymorph, whichever door rolled it - before the budget, the Momentum or a shot.
  if (kind === "attack" && actor?.refuseForcedShape?.(parry ? "reaction" : "attack")) return null;
  if (kind === "attack" && refuseDisarmedAttack(actor, { weaponId, strike })) return null;
  if(kind==="attack"&&weaponId&&!prostheticWieldAllowed(actor,actor.items?.get?.(weaponId))){
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Prosthetic.HandRefused"));return null;
  }
  if (npcShieldSlamShieldId !== null && (actor?.type !== "npc" || kind !== "attack" || parry
    || typeof npcShieldSlamShieldId !== "string"
    || !shieldSlamShield([...(actor.items?.values() ?? [])], npcShieldSlamShieldId))) {
    ui.notifications?.warn("Shield Slam requires its selected shield to remain equipped.");
    return null;
  }
  if (kind === "attack" && !parry && refuseMobileAlertAttack(actor, source)) return null;
  if (kind === "attack" && refuseUnreliableWeapon(actor,weaponId)) return null;
  ability ??= AZEROTH.skillAbility?.[skill] ?? null;
  if(!validateDeviceChoices(actor,{kind,skill},chosen)){
    ui.notifications?.warn(game.i18n.localize("AZEROTH.SpecialEquipment.Refused"));return null;
  }
  // Dialog choices carry the pending effect they offered, so stale cached
  // Boons cannot survive a concurrent roll consuming that meal.
  const equipmentAutomatic = equipmentPrepared ? [] : equipmentModifiers({
    actor,rangeKind:strike?.rangeKind??null,
    items: dispersionFor(actor) ? [] : actor?.items ?? [], effects: actor?.effects ?? [], kind, skill,
    ability, resilience, now: game.time?.worldTime
  }).automatic;
  const equipmentClaim = await claimEquipmentTest(actor, {kind, ability, expectedIds: equipmentTestIds, chosen});
  if (!equipmentClaim.ok) { ui.notifications?.warn(game.i18n.localize("AZEROTH.SpecialEquipment.Refused")); return null; }
  let equipmentRolled = false;
  let provisionClaim = null;
  const spiritDrinkIds=drinkTestBenefits(actor.effects??[],{kind,resilience}).filter(e=>DRINK_BENEFITS[e.flags["azeroth-rpg"][PROVISION_BENEFIT].key].family==="spirit").map(e=>`provision:${e.id??e._id}`);
  try {
  provisionClaim = await claimProvisionTest(actor,{kind,resilience,expectedIds:provisionTestIds,chosen});
  if(!provisionClaim.ok){ui.notifications?.warn(game.i18n.localize("AZEROTH.SpecialEquipment.Refused"));return null;}
  // Kreeg's fear Boon and an ordinary Spirit drink are alternatives, even if both boxes were checked.
  if(equipmentPrepared && chosen.includes("equipment:kreeg-fear") && chosen.some(id=>id.startsWith("provision:"))
    && kind==="resilience" && resilience==="spirit")boons=Math.max(0,boons-chosen.filter(id=>spiritDrinkIds.includes(id)).length);
  boons += equipmentAutomatic.filter(row=>!(chosen.includes("equipment:kreeg-fear")&&kind==="resilience"&&resilience==="spirit"&&row.id.startsWith("provision:"))).reduce((n,row) => n + row.boons,0);
  banes += equipmentAutomatic.reduce((n,row) => n + row.banes,0);
  provenanceExtra = [...provenanceExtra, ...equipmentAutomatic.map(row => ({label:row.name,value:null,formula:row.note}))];
  // The targets, read once and first: the Finisher and the riders are judged
  // against the first before anything is spent (D-773).
  const list = targets ?? (target ? [target] : []);
  const signatureTarget=kind==='attack'&&!parry&&damage
    ?await prepareSignatureHitTarget({actor,weaponId,strike,targets:list,chosen,choose:chooseOption}):{ok:true,index:-1};
  if(!signatureTarget.ok)return null;
  const first = target ?? list[0] ?? null;
  if (kind === "attack" && !parry && refuseDispersedTargets(list)) return null;
  // **WHETHER THIS ATTACK IS MADE WHILE HIDDEN** (D-773), read before the reveal
  // below takes the Hide: Find Weakness, Waylay, Subterfuge, Shadow Focus and
  // Cheap Shot all ask it. A Parry is no attack.
  const hiddenAtRoll = kind === "attack" && !parry ? isHiddenFor(actor, source) : false;
  // **THE SPIRIT REALM AND ETHEREAL FORM REFUSE AN ATTACK** (06 §10: *You cannot touch the
  // living world*; 04's Ethereal Form: *While it holds you cannot attack*; the Legacy
  // branches' door 10), in words and before anything below is judged or spent. A Parry
  // is no attack: the Reaction door refuses a spirit's (`rules/reactions.mjs#canReact`).
  if (kind === "attack" && !parry) {
    const refusedAttack = attackRefusalFor(actor);
    if (refusedAttack) {
      ui.notifications?.warn(refusedAttack);
      return null;
    }
  }
  // 0. **EVERY REFUSAL, BEFORE ANYTHING IS SPENT** (D-768's order: judgement,
  // budget, reveal, payment; the lead, 2026-10-03: *"Keeps the Half-Action"*).
  // An empty bundle, a called shot the pool cannot pay and a rider that cannot
  // pay all refuse the roll with the turn's action, the Hide and every pool
  // still in hand. The shot used to be marked off FIRST and the Momentum asked
  // AFTER the budget, so a refused budget lost the arrow and a short pool lost
  // the Half-Action (found on the way, D-770).
  // Recovering what was shot is the GM's call and is never automated.
  let bundle = null;
  let bundleLeft = 0;
  const reloadInfo = kind === "attack" && !parry && strike?.rangeKind === "ranged" && weaponId
    ? weaponReloadState(actor, weaponId) : null;
  if (reloadInfo?.cost !== null && reloadInfo && reloadInfo.remaining !== 0) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Reload.Unloaded"));
    return null;
  }
  if (ammunition?.itemId) {
    bundle = actor?.items?.get(ammunition.itemId) ?? null;
    bundleLeft = bundle?.system?.quantity ?? 0;
    if (!bundle || bundleLeft <= 0) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Attack.EmptyBundle", { weapon: title, launcher: "" }));
      return null;
    }
  }
  // The called shot's Momentum (06 SS7) comes off the primary pool, asked here
  // and paid below.
  // **A COMPANION PAYS FROM ITS RANGER'S QUARRY** (04's Shared Quarry at rank 1; the
  // lead, 2026-10-03, on O-177: *"Maneuvers or other quarry costing features"*;
  // D-779): the called shot is 06 §7's maneuver, paid from the creature's own pool,
  // else from its owner's Quarry where the owner's talent lets it
  // (`AzerothActor#momentumPayer`).
  const momentumPayerNow = momentumSpent > 0 ? (actor?.momentumPayer?.({ amount: momentumSpent }) ?? null) : null;
  const momentumPool = momentumSpent > 0 ? (momentumPayerNow?.pool ?? null) : null;
  if (momentumSpent > 0 && (!momentumPool || momentumPool.value < momentumSpent)) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Dialog.NoMomentum"));
    return null;
  }
  // **THE RIDERS, JUDGED WHOLE** (D-770): the lines as they stand NOW - a
  // dialog is open for a while and the pool, the form and the round move under
  // it - against the pools as they will stand once the called shot's Momentum
  // and the Finisher are paid, the fixed prices first and *spend all* last. One
  // that cannot pay refuses the roll in its own words, and nothing is spent. A
  // Parry is not an attack and rides none, and nor does a maneuver's Test that
  // deals no blow - the dialog's own gate (`roll-dialog.mjs#riderOffer`).
  //
  // **A RIDER PAID BEFORE THE BLOW** (the lead, 2026-10-03, on Feral Charge:
  // *"Either order"*): one the Combat tab's control paid this turn is PRIMED,
  // and this attack is its charge whether or not the dialog was even shown -
  // nothing more is paid, its hit lands what the rank says, and the round's
  // record lets it go below.
  const riderAttack = kind === "attack" && !parry && damage !== null && damage !== undefined;
  // A rider that needs the Opening (04's Garrote, D-773) is judged against the
  // target as it stands now, through the one reading the dialog asked.
  const riderLinesNow = riderAttack
    ? (actor?.riderLines?.({ weapon: strike?.rangeKind ?? null, opening: openingGate(actor?.openingState?.(first, { hidden: hiddenAtRoll }) ?? null, first), target: first }) ?? [])
    : [];
  const primedLines = riderLinesNow.filter(l => l.primed);
  const primedIds = primedLines.map(l => l.identifier);
  const riderPicks = riderAttack && Array.isArray(riders) ? [...new Set(riders.filter(id => id && !primedIds.includes(id)))] : [];
  let plan = null;
  if (riderPicks.length) {
    const lines = riderLinesNow;
    // Every pool a rider may pay from, Void Corruption among them (04's Void Surge; stage 3A).
    const projected = (actor?.riderPools?.() ?? actor?.poolSnapshot?.() ?? []).map(p => ({ ...p }));
    if (momentumPool) {
      const p = projected.find(x => x.kind === "momentum" && x.itemId === momentumPool.itemId);
      if (p) p.value -= momentumSpent;
    }
    if (finisherSpent > 0) {
      const c = projected.find(x => x.kind === "momentum" && x.name === "comboPoints");
      if (c) c.value -= Math.min(Math.trunc(Number(finisherSpent)) || 0, c.value);
    }
    plan = riderPlan(lines, riderPicks, { pools: projected });
    if (!plan.ok) {
      ui.notifications?.warn(riderReason(plan.reason));
      return null;
    }
    // **A RIDER THAT WRITES ON A CREATURE THIS CLIENT DOES NOT OWN NEEDS A GM**
    // (the architect's review of D-774): its condition, Bane, lost Reaction,
    // Speed drop or no-healing mark lands through the GM's client, and with none
    // online it was paid for and then laid nothing. Refused here, nothing spent.
    // **AND A SPEND OF VOID THAT REACHES EARTHSHATTER'S PRONE** (the 3A review, M1): Void
    // Surge's row names no `onHit`, so its Prone and Stunned were never asked for a GM.
    const surgeWrites = riderPicks.includes("void-surge") && voidSpendWrites(
      voidSpendFor(actor?.takenTalents?.() ?? [], { tier: actor?.system?.tier ?? 1, form: actor?.shape?.kind === "drake" ? (actor.shape.forms?.[0]?.name ?? null) : null }, talentEffect),
      (actor?.riderPools?.() ?? []).find(p => p.kind === "corruption" && p.name === "void")?.value ?? 0
    );
    const writes = surgeWrites || riderPicks.map(id => lines.find(l => l.identifier === id)).filter(Boolean)
      .some(line => riderWritesOnTarget(line, { tier: actor?.system?.tier ?? 1 }));
    if (writes && gmAbsentForActors(list.map(t => targetActorOf(t)))) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
      return null;
    }
  }
  // **A THROW A RIDER MAKES POSSIBLE IS MADE ONLY AS PART OF IT** (04's Storm Bolt: *For
  // this attack a weapon of the hammer or mace type counts as Thrown*; the Legacy
  // branches' door 15): a hammer thrown with its line left unticked is refused in
  // words, nothing spent. The second roll of an Extra Attack is the same Attack.
  if (riderAttack && throwAs && !secondRoll) {
    const needs = throwRefusedFor({ throwAs }, [...riderPicks, ...primedIds], riderLinesNow);
    if (needs) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Wield.ThrowNeedsRider", { weapon: title, talent: needs }));
      return null;
    }
  }
  // **THE FINISHER, JUDGED AGAIN** (D-773): what it spends, what it counts and
  // whether Rupture's Bleeding is on offer, read the way the dialog read it.
  // Death Mark's free use holds only while the mark still names this target - a
  // rest taken while the dialog stood open ends it - and is refused in words
  // before anything is spent.
  // **A CHARGE TICKED, JUDGED AGAIN** (D-774): Static Charge's line no longer
  // offered - the charge spent since the dialog opened - refuses the roll in
  // words, nothing spent.
  const lineOffer = kind === "attack" && !parry && (talentLines ?? []).length ? (actor?.talentLineOffer?.({ roll: "attack", damages: true }) ?? []) : [];
  const linesNow = talentLinesTaken(lineOffer, kind === "attack" && !parry ? talentLines : []);
  if (linesNow.lost.length) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.TalentLine.Lost", { name: title, lines: linesNow.lost.join(", ") }));
    return null;
  }
  const chargeLine = linesNow.taken.find(l => l.kind === "charge") ?? null;
  // **04's EMBER STRIKES** (*Your weapon attacks may deal Fire damage instead of their own
  // type*; stage 3A): the line ticked, the blow a magical one of that school, as a creature's
  // patched school is (`npcAttackWithDialog`) - its Ward and Immune read on that school.
  const convertAttack = linesNow.taken.find(l => l.kind === "convertAttack") ?? null;
  if (convertAttack && damage && AZEROTH.schools?.[convertAttack.to]) {
    damage = { ...damage, kind: "magical", school: convertAttack.to };
  }
  const finisherNow = kind === "attack" && (finisherSpent > 0 || finisherFree) ? finisherStateOf(actor, first) : null;
  if (finisherFree && !finisherNow?.free) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Finisher.MarkGone", { talent: finisherFree }));
    return null;
  }
  // **A HIT'S OTHER WRITES ON A CREATURE THIS CLIENT DOES NOT OWN NEED A GM** (the B2
  // review): what this attack lays whatever strikes it (04's Net-o-Matic's Entangled,
  // `landsOnHit`), Shackle's Entangled bought with the Finisher's points, and what a
  // bound creature's hit lays by its owner's talents (Serpent Ward's venom,
  // `boundAttacksFor`'s lays) all land through the GM's client - and with none online
  // they were paid for and laid nothing. Refused here with the riders' own, nothing spent.
  if (kind === "attack" && !parry && list.length) {
    const boundOwner = boundOwnerOf(actor);
    // **AND WHAT A TALENT LAYS WITH THE HIT** (the 3A review, should-fix 4): 04's Ember
    // Strikes' Scorched and Deep Cut's Bleeding (`hitConditionsFor`, read at the highest SL a
    // hit could reach, so a blow that could lay one is asked).
    const lays = (Array.isArray(landsOnHit) && landsOnHit.some(l => AZEROTH.conditions?.[l?.condition]))
      || hitConditionsFor(actor?.takenTalents?.() ?? [], { sl: 6, hit: true }).length > 0
      || (finisherMode === "shackle" && Boolean(finisherNow?.shackle))
      || (Boolean(boundOwner) && boundAttacksFor(boundOwner.takenTalents?.() ?? [], { kind: bondOf(actor)?.kind ?? null, name: actor.name ?? "" })
        .some(row => (row.lays ?? []).some(l => AZEROTH.conditions?.[l?.condition])));
    if (lays && gmAbsentForActors(list.map(t => targetActorOf(t)))) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
      return null;
    }
  }
  // **WHAT THE WARRIOR'S AND THE PALADIN'S TALENTS READ AT AN ATTACK** (D-772),
  // off the taken rows once: the Head's called shot, the off hand's −2, a
  // Critical Injury against a hurt target, a condition at an SL, Reckless, an
  // extra attack off the card. And the next attack's promise (Precise Strike,
  // Follow Through, Vengeance), read now and TAKEN once the attack is paid for.
  const talentsHeld = kind === "attack" ? actor.takenTalents() : [];
  // **WHAT A LEGACY'S GATE READS AT THIS BLOW** (the Legacy branches' doors 15, 17 and
  // 18): what is wielded and worn, the first target's conditions and kinds, what this
  // creature laid on it, its marks - the actor's one fact-builder - and the blow's own
  // way. And the striker's ability modifiers for an amount that names one (door 16).
  const gateFacts = kind === "attack" && !parry
    ? { ...(actor?.gateFacts?.(first) ?? {}), melee: (strike?.rangeKind ?? null) === "melee", ranged: Boolean(strike?.rangeKind) && strike.rangeKind !== "melee" }
    : {};
  const abilities = abilityScope(actor?.system ?? {});
  // **AN OFF-HAND BLOW THAT BUILDS, AND HITS HARDER** (04's Axe and Hammer: *While you
  // hold melee weapons of two different types, one in each hand ... your Off-Hand
  // Attack builds Rage as your other hits do and deals 1 more damage per rank*; door 26).
  const offHandBuild = kind === "attack" && offHand && !parry ? offHandBuildsFor(talentsHeld, { facts: gateFacts, scope: abilities }) : { builds: false, damage: 0, by: [] };
  // What 05 §11's gain on a hit reads as the off hand: an off hand that builds is read as any other hand.
  const momentumOffHand = offHand && !offHandBuild.builds;
  const promised = riderAttack ? (actor?.pendingNextAttack?.() ?? null) : null;
  // **WHAT THE ATTACK THAT ENDS A CONCEALMENT ADDS** (04's Wind Walk at rank 2: *until
  // you next attack, and that attack adds your Dexterity modifier to its damage*; the B6
  // review): read off the concealment before the reveal below takes it - in a fight or
  // out of one, since the hiding is what the attack ends.
  const concealHit = riderAttack
    ? concealStrike((actor?.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"]?.[CONCEAL_FLAG] ?? null))
    : { damage: 0, by: [] };
  // In a started fight an attack spends the turn's Half-Action - a Reaction
  // where the card says so - and a budget that cannot pay refuses the roll with
  // the rule's reason (D-630). **Each Half-Action may be an Attack** (05 §10,
  // D-711), so two is a turn's worth and there is no counter beside them; an
  // Off-Hand Attack RIDES one already made and costs nothing (06 §1).
  // `budget: "none"` is the CALLER HAS ALREADY PAID (06 §6, D-693): a Parry is
  // an Attack Test that spends a Reaction rather than a Half-Action.
  // `useReaction` spends the Reaction before it opens the dialog's roll, so
  // nothing is owed here.
  const fight = kind === "attack" ? (actor?.activeFight?.() ?? null) : null;
  const crushridgeRating = crushridgeMeleeBonus(actor, { kind, parry, rangeKind: strike?.rangeKind, now: game.time?.worldTime });
  if (kind === "attack" && !fight && budget !== "none") {
    const { interruptWhirlwindForAction } = await import("../effects/syndicate-whirlwind-use.mjs");
    if (!await interruptWhirlwindForAction(actor)) return null;
    const { interruptConsumeFor } = await import("../effects/consume-shadows-use.mjs");
    if (!await interruptConsumeFor(actor)) return null;
  }
  let reloadReservation = null;
  let reloadPaymentStarted = false;
  let reloadMessage = null;
  if (parry && weaponId && refuseDispersion(actor, "gear")) return null;
  if (kind === "attack" && !parry && refuseDispersion(actor, "attack")) return null;
  if (kind === "attack" && !parry && refuseDispersedTargets(list)) return null;
  if (reloadInfo && reloadInfo.cost !== null) {
    const reserved = await requestReloadShot(reloadInfo.weapon, {expected: structuredClone(reloadInfo.state)});
    if (!reserved.ok) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Reload.Pending"));
      return null;
    }
    reloadReservation = reserved.reservation;
  }
  try {
  if (kind === "attack" && !parry && refuseDispersion(actor, "attack")) return null;
  if (kind === "attack" && !parry && refuseDispersedTargets(list)) return null;
  if (fight && !bossAction && budget !== "none") {
    const combatant = fight.getCombatantsByActor(actor)?.[0] ?? null;
    if (combatant) {
      reloadPaymentStarted = true;
      const spent = await combatant.spendAction(budget ?? "half", { isAttack: true, isOffHand: offHand, rangeKind: strike?.rangeKind });
      if (!spent.ok) { reloadPaymentStarted = false; return null; }
    }
  }
  // **AN ATTACK ENDS A HIDE** (D-717): the blow is the thing that gives you
  // away, so it is revealed here rather than on the card - after the budget
  // has agreed the attack happens, before the die. **A PARRY IS NOT AN
  // ATTACK** (06 §6): it is an Attack Test spent on somebody else's blow, and
  // a hidden creature that parries has not shown itself. `reveal` is quiet
  // where there is nothing to clear, so this costs a flag read on every roll.
  // An ACTION taken while hidden (D-773): 04's Master of Shadows and a Shadow
  // Dance leave the Hide standing (`effects/stealth.mjs#reveal`).
  reloadPaymentStarted = true;
  if (kind === "attack" && !parry) await reveal(actor, { acting: true, kind: "attack" });
  // Pay first, everything judged above: one marked off the bundle (08 §7,
  // D-407), then the Momentum off the primary pool (06 SS7) before any die is
  // rolled.
  let fired0 = null;
  // **A SHOT A RIDER SPENDS NONE OF** (04's Black Arrow: *The attack spends no
  // ammunition*; the Legacy branches' door 26): a rider this attack pays saying
  // `ammo: false` keeps the bundle whole - the shot is still the bundle's, so its
  // Rating and its traits ride the blow as before.
  const shotKeptBy = (plan?.paid ?? []).find(p => p.line?.ammo === false)?.name ?? null;
  if (bundle && spendsShot(plan?.paid ?? [])) {
    const remaining = spendShot(bundleLeft);
    await bundle.update({ "system.quantity": remaining });
    fired0 = { itemId: bundle.id, name: bundle.name, remaining };
  } else if (bundle) fired0 = { itemId: bundle.id, name: bundle.name, remaining: bundleLeft };
  // **OFF THE POOL AS IT STANDS NOW** (the D-770 review, item D): the pool read
  // for the judgement was read before the budget's queued spend and the reveal,
  // and writing `value - spent` off THAT wrote over anything that moved it in
  // between. Read again here; a pool that fell below the price pays what it
  // holds - the Finisher's rule below - because the Half-Action is spent.
  if (momentumSpent > 0 && momentumPool) {
    const payer = momentumPayerNow?.actor ?? actor;
    // A creature's snapshot holds its Power and its Momentum both at itemId null and
    // name null (D-637), so the kind is what tells them apart.
    // Draconic Discipline's Energy is a Power pool (the Chromatic Champion plan): the
    // payer's own `kind`, Momentum where the row names none.
    const payKind = momentumPool.kind ?? "momentum";
    const momentumNow = (payer.poolSnapshot?.() ?? []).find(p => p.kind === payKind && p.itemId === momentumPool.itemId && p.name === momentumPool.name) ?? momentumPool;
    await payer.updatePool({ itemId: momentumPool.itemId, kind: payKind, value: Math.max(0, (Number(momentumNow.value) || 0) - momentumSpent) });
    if (momentumPayerNow?.shared) provenanceExtra = [...provenanceExtra, { label: "AZEROTH.SharedQuarry.Label", value: null, formula: game.i18n.format("AZEROTH.SharedQuarry.Paid", { n: momentumSpent, owner: payer.name }) }];
  }
  // **FINISHER** (02 §7): *spend ALL your Combo Points and add that many to the
  // damage of one attack.* Paid before the die, like the called shot's
  // Momentum; a pool that has moved since the dialog opened pays what is in it.
  // **AND WITH THE TALENTS LAID OVER IT** (D-773): Death Mark spends nothing and
  // counts five; Rupture's Bleeding takes the place of the added damage (MY
  // READING: the Finisher's own +N, the attack's damage still lands) and lands
  // with the hit below.
  let finisher = 0;
  let finisherCounted = 0;
  let finisherBleeding = 0;
  // Shackle's rounds of Entangled in place of the added damage (door 26).
  let finisherShackle = 0;
  // Who pays: the striker, or a construct's tinker (04's Supercharge, door 6).
  const finisherPayer = finisherNow ? (actor?.finisherPayer?.() ?? actor) : null;
  if (finisherNow) {
    const combo = (finisherPayer?.system?.momenta ?? []).find(p => p.name === "comboPoints") ?? null;
    const paidPoints = finisherFree ? 0 : Math.min(Math.trunc(Number(finisherSpent)) || 0, combo?.value ?? 0);
    if (paidPoints > 0) await finisherPayer.updatePool({ itemId: combo.itemId, kind: "momentum", value: combo.value - paidPoints });
    finisherCounted = finisherFree ? finisherNow.counts : paidPoints;
    if (finisherMode === "bleeding" && finisherNow.bleeding) finisherBleeding = ruptureBleeding(finisherNow.bleeding, finisherCounted);
    else if (finisherMode === "shackle" && finisherNow.shackle) finisherShackle = shackleRounds(finisherNow.shackle, finisherCounted);
    else finisher = finisherCounted;
    if (finisherPayer && finisherPayer !== actor && paidPoints > 0) {
      provenanceExtra = [...provenanceExtra, { label: "AZEROTH.Construct.FinisherPaid", value: null, formula: game.i18n.format("AZEROTH.Construct.FinisherPaidRow", { n: paidPoints, owner: finisherPayer.name }) }];
    }
  }
  // **AND THE RIDERS** (D-770). The round's record first, through the
  // combatant's own queued door (D-761): the once-a-round riders marked, and a
  // charge paid before the blow taken. **The record is the one gate both doors
  // read** (the lead, 2026-10-03: *"Either order"* - whichever is used first
  // pays), so a once-a-round rider the write finds already marked was paid by
  // the Combat tab's control while this attack was being asked for: it is not
  // paid twice, and the card says so. Then the payment, settled against the
  // pools as they stand NOW (the review's item D), in one write, and the free
  // Move the spend bought. Out of a fight there is no round to mark and no
  // budget to move on.
  const riderCombatant = (plan?.paid.length || primedIds.length) && fight ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
  let riderLost = [];
  if (riderCombatant?.isOwner && ((plan?.once.length ?? 0) || primedIds.length)) {
    const marked = await riderCombatant.markRoundRiders(plan?.once ?? [], { consume: primedIds });
    const added = marked?.added ?? plan?.once ?? [];
    riderLost = (plan?.once ?? []).filter(id => !added.includes(id));
  }
  const keptPaid = (plan?.paid ?? []).filter(p => !riderLost.includes(p.identifier));
  // **A RIDER PAID ONLY WHEN THE BLOW LANDS** (04's Bloodthirst: *When one of
  // your attacks hits, spend 6 Rage*; D-772) waits for the die; every other one
  // is paid now, as D-770 pays it.
  const paidNow = keptPaid.filter(p => p.line?.pays !== "hit");
  const paidOnHit = keptPaid.filter(p => p.line?.pays === "hit");
  const settled = settleRiders({ paid: paidNow }, { pools: actor?.riderPools?.() ?? actor?.poolSnapshot?.() ?? [] });
  if (settled.writes.length) await (actor.writeRiderPools ? actor.writeRiderPools(settled.writes) : actor.updatePool(settled.writes));
  // **WHAT A PAID RIDER DOES TO THE ROLL ITSELF** (D-773): Trueshot's SL, the hit
  // made without a roll (*counts as SL 2, or SL 3 at rank 2*), and Piercing
  // Shot's Pierce on the blow - a charge paid before the blow from the Combat
  // tab included.
  const riderPaidAll = [...settled.paid, ...primedLines.map(line => ({ line, name: line.name, spent: line.cost ?? 0 }))];
  const forced = riderAttack ? forcedSl(riderPaidAll) : null;
  const forcedBy = forced !== null ? (riderPaidAll.find(p => Number(p.line?.onHit?.forced) === forced)?.name ?? "") : "";
  const riderPierceN = riderAttack ? riderPierce(riderPaidAll, { tier: actor?.system?.tier ?? 1 }) : 0;
  if (riderCombatant?.isOwner && settled.paid.some(p => p.line?.move === "speed")) await riderCombatant.grantFreeMove(1);
  // **THE NEXT ATTACK'S PROMISE IS TAKEN WITH THE ATTACK** (D-772): every one
  // standing, the lapsed swept with them, in one write.
  if (promised && (promised.live.length || promised.lapsed.length)) await takeNextAttack(actor, promised);
  // **A BLOW STRUCK WITH A SHIELD** (04's Shield Slam: *strike with your shield
  // at Damage Rating 4*; D-772): the shield's Rating replaces the weapon's own,
  // what stands on the striker still adds, the weapon's Pierce goes with it, and
  // nothing the weapon carries fires - neither its Effect traits nor what is on
  // its blade.
  const shieldStrike = [...settled.paid, ...primedLines.map(line => ({ line }))].find(p => p.line?.strike && Number.isFinite(Number(p.line.strike.rating))) ?? null;
  if (shieldStrike && damage) {
    const own = Math.max(0, Math.trunc(Number(damage.weaponRating)) || 0);
    damage = { ...damage, rating: Math.max(0, (Number(damage.rating) || 0) - own) + Math.trunc(Number(shieldStrike.line.strike.rating)), penetration: 0 };
    weaponEffects = null;
    coating = null;
  }
  // 04's Heavy Hand (D-772): the Head's −2 is not suffered; the Bane is untouched.
  const shot = calledShotCost(location, {
    paid: momentumSpent >= AZEROTH.CALLED_SHOT_MOMENTUM,
    headModifier: kind === "attack" ? calledShotFor(talentsHeld).headModifier : null
  });
  const allModifiers = [...modifiers];
  // An Off-Hand Attack takes -2 (06 SS2, D-409) - not with 04's Second Strike
  // (*Your Off-Hand Attacks do not take the −2*; D-772).
  const offHandWaived = kind === "attack" && offHand ? offHandPenaltyFor(talentsHeld) : { waived: false, by: [] };
  if (kind === "attack" && offHand && !offHandWaived.waived) allModifiers.push({ label: "AZEROTH.Dialog.OffHand", value: -2 });
  if (shot.modifier) {
    allModifiers.push({ label: "AZEROTH.Card.CalledShotPenalty", value: shot.modifier });
  }

  let roll = AzerothRoll.build({
    dc,
    modifiers: allModifiers,
    boons,
    banes: banes + shot.banes,
    kind,
    location,
    rollData: actor?.getRollData() ?? {}
  });

  // The dialog's rows - what circumstance was counted - and the Momentum
  // paid, after the die and the modifiers. A formula row carries no value,
  // so the card's sum of values still reconstructs the total.
  roll.options.provenance.push(...provenanceExtra);
  if (momentumSpent > 0) {
    roll.options.provenance.push({ label: "AZEROTH.Dialog.MomentumSpent", value: null, formula: `-${momentumSpent}` });
  }
  // The shot a rider kept (door 26), named on the card.
  if (shotKeptBy) roll.options.provenance.push({ label: shotKeptBy, value: null, formula: game.i18n.localize("AZEROTH.Rider.Card.NoAmmo") });

  // **TRUESHOT** (D-773): a hit at a set SL without a roll, carried on the
  // options so the card read back off its message says the same.
  if (forced !== null) {
    roll.options.forcedSl = forced;
    roll.options.provenance.push({ label: forcedBy, value: null, formula: game.i18n.format("AZEROTH.Card.Forced", { n: forced }) });
  }
  // **WHAT AN ATTACK FROM HIDING IGNORES** (04's Find Weakness, D-773) and
  // Piercing Shot's Pierce, each named on the card beside the next attack's.
  const hiddenRow = hiddenAtRoll ? hiddenAttackFor(talentsHeld) : { pierce: 0, loseReaction: false, by: [] };
  // **ARMOR POINTS A GATE LETS THE BLOW IGNORE** (04's The Long Watch: *your attacks
  // against it ignore 2 Armor Points*; the Legacy branches' door 17).
  const gatePierce = kind === "attack" && !parry ? pierceFor(talentsHeld, { facts: gateFacts, scope: abilities }) : { pierce: 0, by: [] };
  const talentPierce = riderPierceN + hiddenRow.pierce + gatePierce.pierce;
  if (riderPierceN > 0) roll.options.provenance.push({ label: riderPaidAll.filter(p => p.line?.onHit?.pierce).map(p => p.name).join(", "), value: null, formula: game.i18n.format("AZEROTH.NextAttack.PierceRow", { n: riderPierceN }) });
  if (hiddenRow.pierce > 0) roll.options.provenance.push({ label: hiddenRow.by.join(", "), value: null, formula: game.i18n.format("AZEROTH.NextAttack.PierceRow", { n: hiddenRow.pierce }) });
  if (gatePierce.pierce > 0) roll.options.provenance.push({ label: gatePierce.by.join(", "), value: null, formula: game.i18n.format("AZEROTH.NextAttack.PierceRow", { n: gatePierce.pierce }) });
  // Keen's wider Critical Injury (08 §5).
  if (weaponEffects?.criticalOn && weaponEffects.criticalOn < 20) roll.options.criticalOn = weaponEffects.criticalOn;
  // **EXECUTIONER** (04: *You inflict a Critical Injury on 19 or 20 against a
  // target below half Health. At rank 2 this applies below three quarters*;
  // D-772): off the target's Health as the snapshot took it, the wider of this
  // and the weapon's own Keen. Never on a Parry, which is no attack.
  // And 04's Deadeye (*While your Quarry is full*) and Master Duellist (*While
  // you are Engaged with exactly one enemy*), each gate read the one way (D-773).
  if (kind === "attack" && !parry) {
    // And a Legacy's gate (Mak'gora's *Against the creature you named with The
    // Challenge*; the Legacy branches' door 18), through the actor's one fact-builder.
    const exec = criticalRangeFor(talentsHeld, { health: first?.health ?? null, pools: actor?.poolSnapshot?.() ?? [], facts: { ...gateFacts, engagedOne: engagedOne === true } });
    if (exec.on && exec.on < (roll.options.criticalOn ?? 20)) {
      roll.options.criticalOn = exec.on;
      roll.options.provenance.push({ label: exec.by.join(", "), value: null, formula: game.i18n.format("AZEROTH.Card.CriticalOn", { n: exec.on }) });
    }
  }
  // **WHAT THE NEXT ATTACK WAS PROMISED** (D-772), named on the card: the
  // Armor Points it ignores (Precise Strike) and the damage it adds (Vengeance).
  // The Boon (Follow Through) was the dialog's own line.
  const promisedPierce = promised?.penetration ?? 0;
  const promisedDamage = promised?.damage ?? 0;
  for (const e of promised?.live ?? []) {
    if ((e.penetration ?? 0) > 0) roll.options.provenance.push({ label: e.name, value: null, formula: game.i18n.format("AZEROTH.NextAttack.PierceRow", { n: e.penetration }) });
    if ((e.boons ?? 0) > 0) roll.options.provenance.push({ label: e.name, value: null, formula: game.i18n.format("AZEROTH.NextAttack.BoonRow", { n: e.boons }) });
  }
  const { claimMilitiaDrill } = await import('../effects/militia-drill.mjs');
  const militia = await claimMilitiaDrill(actor, chosen, kind);
  if (!militia.ok) { ui.notifications.warn(game.i18n.localize('AZEROTH.MilitiaDrill.Refused')); return null; }
  if (militia.claim) roll.options.militiaDrill = militia.claim;
  if (kind === "attack" && refuseUnreliableWeapon(actor,weaponId)) return null;
  if(!validateDeviceChoices(actor,{kind,skill},chosen)){
    ui.notifications?.warn(game.i18n.localize("AZEROTH.SpecialEquipment.Refused"));return null;
  }
  await roll.evaluate();
  equipmentRolled = true;
  const unreliableMarker=kind==="attack"?await prepareUnreliableDamage({actor,weaponId,roll}):null;
  const provisionPayment=await finishProvisionTest(actor,provisionClaim,{rolled:true});
  if(!provisionPayment.ok)throw Error("Provision Test payment remains pending GM review");
  const equipmentPayment = await finishEquipmentTest(actor,equipmentClaim,{rolled:true});
  if (!equipmentPayment.ok) throw Error("Equipment Test payment remains pending GM review");
  await breakSelectedDevices(actor,{kind,skill,chosen,roll});
  roll = await offerSecondStrike(actor, roll, { kind, parry });
  await actor.offerElunesRegard?.(roll);
  // **14's SHADOW STEP, STEP ASIDE AND GYTH TAKES THE AIR** (D-809): *the next attack
  // against him this round misses* - the first target's mark, taken by this attack and
  // read by the roll's own outcome, so the card says Miss in words.
  if (kind === "attack" && !parry) {
    const missNext = await takeMissNext(actor, first);
    if (missNext) {
      roll.options.forcedMiss = missNext;
      roll.options.provenance.push({ label: missNext.name, value: null, formula: game.i18n.localize("AZEROTH.Boss.MissNextRow") });
    }
  }
  const outcome = roll.outcome;
  // 06 §6 (D-693): a Bane somebody laid on this creature is spent by the Test
  // it was laid for - *on the NEXT Casting Test it makes* is a count, not a
  // span. After the die, so the roll that took it is the roll that spends it,
  // and whether the roller left the line ticked is not the tool's business.
  // One that bears only on a Test against one creature (04's Feint, D-773) is
  // spent only by a Test at it.
  const baneSources = await spendLaidBanes(actor, kind, { target: first });
  if (baneSources.length) {
    roll.options.provenance.push({ label: "AZEROTH.Modifier.LaidBane", value: null, formula: baneSources.join(", ") });
  }
  // And a Boon somebody laid (04's Blessing, D-772): spent the same way.
  // D12: a carried poison's Bane on the first Attack or Casting Test of the turn is spent by this one.
  await markFirstTestBane(actor, kind);
  const boonSources = await spendLaidBoons(actor, kind);
  if (boonSources.length) {
    roll.options.provenance.push({ label: "AZEROTH.Modifier.LaidBoon", value: null, formula: boonSources.join(", ") });
  }
  // The Effect traits the roll fired (08 §5, 2026-09-06): Nick's damage, a
  // condition the card offers, Maim's table, the rest as fired notes.
  const fired = kind === "attack" ? firedTraits(weaponEffects, outcome) : [];
  // 08 §12: a poison lands when the weapon lands, and is used up doing it.
  const landed = coatingFired(coating, { success: outcome.success });
  if (landed) fired.push(landed);
  if (landed && endsOnHit(coating) && weaponId) {
    await actor.items.get(weaponId)?.unsetFlag("azeroth-rpg", "coating");
  }
  // **WHAT THE RIDERS PAID FOR, ON THE CARD** (D-770): a row each, saying what
  // was spent and what the blow did with it. The damage rides the blow's Rating
  // through the row's `extraDamage`; on a miss the row says nothing landed. The
  // move was the spend's, hit or miss, and a charge paid before the blow says
  // that instead.
  //
  // **ON A HIT THE CONDITION LANDS, WITH NO BUTTON PRESSED** (the lead,
  // 2026-10-03: *"Lands automatically"*): on every target the card records,
  // through the Inflict button's own door (`effects/inflict.mjs`), and the row
  // says what landed on whom - or that it did not take. A blow with no target
  // recorded has nowhere to lay it, and keeps the Inflict button, which reaches
  // the selected tokens as it always has. What the rider does is read off its
  // ROW at its rank (`outcomeOfLine`, the review's item C).
  const riderDamageRows = [];
  // **WHAT THE BLOW LANDED, BY TARGET, FOR A PARRY TO TAKE BACK** (D-779; the lead,
  // 2026-10-03, on O-166: *"No"* to *does a Parry leave a landed condition on?*):
  // every condition landed with no button pressed - a rider's, Deep Cut's,
  // Ferocious Bite's, Rupture's - with whether the creature had it before, recorded
  // on the card for `applications/actions.mjs#parryNow` (`class-answers.mjs#parryUndoes`).
  const landedOnHit = [];
  const recordLanding = (index, landing) => {
    // And the layer this landing ADDED to the condition's `laidBy` (the B1 review), so a
    // withdrawn hit takes it back off a condition the creature already had.
    if (landing?.landed) landedOnHit.push({ index, id: landing.id, landed: true, had: landing.had ?? null, prior: landing.prior ?? null, ...(landing.laidByAdded ? { laidByAdded: landing.laidByAdded } : {}) });
    return landing;
  };
  // **AND EVERYTHING ELSE A HIT LAYS** (the lead: *"Conditions only apply on hit unless
  // otherwise stated"*; the Legacy branches' door 13): a Reaction it took, a Speed
  // drop, a no-healing mark, a Bane - each with the effect it made - and a Test the
  // card offers on the hit, each row of `rules/miss.mjs#HIT_RECORD_KINDS`, so a Parry
  // that holds or 04's Afterimage withdraws the lot (`effects/miss.mjs#withdrawHit`).
  const recordHit = (index, row) => {
    if (Number.isInteger(index) && row?.kind) landedOnHit.push({ index, ...row });
  };
  // Resolve before posting this attack card. Its landedOnHit ledger then
  // contains the stun before a defender can answer with Parry/Afterimage.
  if (npcShieldSlamShieldId && actor?.type === "npc" && kind === "attack" && !parry && outcome.success) {
    const { resolveShieldSlamHit } = await import("../effects/npc-shield-slam-hit.mjs");
    for (const [ti, t] of list.entries()) {
      const resolved = await resolveShieldSlamHit({ victim: targetActorOf(t), by: actor, outcome,
        roll: rollResilience, inflict: inflictCondition, until: untilEndOfNextTurnOrRound });
      if (resolved.landing) recordLanding(ti, resolved.landing);
      fired.push({ key: "ability", name: "Shield Slam", text: resolved.reason === "unresolved"
        ? "Body Test unresolved. Resolve the stun manually; do not repeat the attack."
        : resolved.resisted ? "Body Test passed; no stun."
          : resolved.landing ? landedText(resolved.landing) : "Stun could not be confirmed." });
    }
  }
  // **WHAT THE HIT BUILT, FOR A MISS TO TAKE BACK** (the lead, 2026-10-21: *"Yes, take
  // it back"*; door 13): every pool the hit raised, on whoever holds it - the striker's
  // Momentum and a Power pool's further gain, a construct's tinker's Combo Points, a
  // companion's owner's Quarry, a Finisher's returned Combo Points - and the round's
  // once-marks its further gains spent (O-171: a hit that gains nothing spends no
  // once). `dice/annotate.mjs` takes it back when the card hits nobody any more.
  const builtOnHit = [];
  const recordBuilt = (who, gains) => {
    for (const g of gains ?? []) {
      if ((g?.gained ?? 0) > 0 && who?.uuid) builtOnHit.push({ actorUuid: who.uuid, itemId: g.itemId ?? null, kind: g.kind, pool: g.name, amount: g.gained });
    }
  };
  const onceMarkedOnHit = [];
  let fastMarkedOnHit = false;
  let onceOnMiss = null;
  for (const id of riderLost) {
    const line = riderLinesNow.find(l => l.identifier === id) ?? null;
    fired.push({ key: "rider", name: line?.name ?? id, text: riderReason({ key: RIDER_REFUSALS.once, params: { name: line?.name ?? id, pool: line?.pool ?? "", cost: line?.cost ?? 0, value: 0 } }) });
  }
  // **A RIDER PAID ONLY WHEN THE BLOW LANDS** (Bloodthirst, D-772): settled now,
  // off the pools as they stand after the die, and on a miss nothing is spent.
  const settledOnHit = outcome.success && paidOnHit.length
    ? settleRiders({ paid: paidOnHit }, { pools: actor?.riderPools?.() ?? actor?.poolSnapshot?.() ?? [] })
    : { paid: [], writes: [] };
  if (settledOnHit.writes.length) await (actor.writeRiderPools ? actor.writeRiderPools(settledOnHit.writes) : actor.updatePool(settledOnHit.writes));
  // **WHAT A SPEND OF VOID LANDS** (04's Void Surge, Obsidian Skin, Earthshatter and the
  // Black Drake; stage 3A): the Void the hit actually spent, read off the settle - its damage
  // on the blow's own Rating (`riderDamageRows`, below), the temporary Health on the
  // Champion and Earthshatter's Prone and Stunned on every creature struck.
  const voidSpent = settledOnHit.paid.filter(p => p.pool === "void").reduce((n, p) => n + (Math.trunc(Number(p.spent)) || 0), 0);
  const voidPlan = voidSpent > 0 ? voidSpendFor(talentsHeld, { tier: actor?.system?.tier ?? 1, form: actor?.shape?.kind === "drake" ? (actor.shape.forms?.[0]?.name ?? null) : null }, talentEffect) : null;
  const voidDone = voidPlan ? voidSpendOutcome(voidPlan, { spent: voidSpent, sl: outcome.sl, hit: outcome.success }) : null;
  // **AND WHAT A WITHDRAWN HIT TAKES BACK OF IT** (the 3A review, M4; the lead: *"Yes, take
  // it back"*): each Prone and Stunned it laid recorded by target through `recordLanding`, so
  // a Parry or Afterimage takes them off; the temporary Health it granted, recorded for the
  // card's settle below.
  // What the grant ADDED and the record it replaced (the 3B review, should-fix 7), so the
  // take-back acts only while that grant still stands (`rules/temporary-health.mjs#grantTakenBack`).
  let voidTempTaken = null;
  if (voidDone) {
    const { landVoidSpend } = await import("../effects/chromatic-talents.mjs");
    const voidLanded = await landVoidSpend({ actor, outcome: voidDone, targets: list, source: voidPlan.names.join(", "), recordLanding });
    voidTempTaken = voidLanded.tempTaken ?? null;
    fired.push({ key: "talent", name: voidPlan.by, text: [game.i18n.format("AZEROTH.VoidSpend.Spent", { name: actor.name, n: voidSpent, damage: voidDone.damage }), ...voidLanded.lines].join(" "), extraDamage: voidDone.damage });
    if (voidDone.damage > 0) riderDamageRows.push({ name: voidPlan.by, amount: voidDone.damage, type: null });
  }
  // **WHAT THE HIT WAS PAID, FOR A MISS TO GIVE BACK** (the Legacy branches' door 13:
  // Bloodthirst's *When one of your attacks hits, spend 6 Rage*): the riders paid on
  // the hit, by pool, refunded once if a Parry or Afterimage withdraws it
  // (`dice/annotate.mjs`) - once EVERY row of the card is withdrawn, since a blow that
  // landed on two is still a hit on the one nobody answered (the B1 fix run: the same
  // settle as the Momentum the hit built, `rules/miss.mjs#everyRowWithdrawn`).
  // Every pool a rider may pay from, the Void track among them (the 3A review, M4): the track
  // is no `poolSnapshot` pool, so its spend was dropped from the refund.
  const poolsAfterHit = actor?.riderPools?.() ?? actor?.poolSnapshot?.() ?? [];
  const refundOnMiss = outcome.success && list.length > 0
    ? [
      ...settledOnHit.paid.filter(p => (Number(p.spent) || 0) > 0).map(p => {
        const pool = poolsAfterHit.find(x => x.name === p.pool) ?? null;
        return { actorUuid: actor.uuid, itemId: pool?.itemId ?? null, kind: pool?.kind ?? null, pool: p.pool, amount: p.spent };
      }).filter(r => r.kind),
      ...(voidTempTaken?.amount > 0 ? [{ actorUuid: actor.uuid, itemId: null, kind: "tempHealth", pool: "temp", amount: voidTempTaken.amount, source: voidTempTaken.source, prior: voidTempTaken.prior }] : [])
    ]
    : [];
  const riderRows = [
    ...settled.paid.map(p => ({ ...p, primed: false })),
    ...(outcome.success ? settledOnHit.paid : paidOnHit.map(p => ({ ...p, spent: 0 }))).map(p => ({ ...p, primed: false })),
    ...primedLines.map(line => ({ identifier: line.identifier, name: line.name, pool: line.pool, spent: line.cost ?? 0, line, primed: true }))
  ];
  for (const p of riderRows) {
    // The striker's ability modifiers (door 16), for an amount that names one.
    const done = outcomeOfLine(p.line, { hit: outcome.success, spent: p.spent, tier: actor?.system?.tier ?? 1, sl: outcome.sl, abilities });
    const lay = riderConditions(done);
    // **THE STRIKER'S CLOCK AND WHAT THE CONDITION CARRIES** (D-773): Concussive
    // Shot's *until your next turn* is the striker's next turn start, keyed on the
    // striker's combatant (D-628's rule for a clock that is somebody else's); out
    // of a fight it holds as a hand-laid condition does. Garrote's Bleeding
    // carries *cannot cast while that Bleeding lasts* on its own effect.
    // **AND THE CREATURE'S OWN NEXT TURN** (04's Storm Bolt: *Stunned until the end of
    // its next turn*; the Legacy branches' B6): the word itself, which the landing door
    // resolves on the creature struck, keyed on ITS combatant (`applyCondition`, D-628).
    const riderSpan = done.until === "strikerTurnStart" ? untilNextTurn(actor) : (done.until === "endOfNextTurn" ? "endOfNextTurn" : null);
    const riderMarks = done.noCasting ? { [NO_CASTING_FLAG]: { source: p.name } } : {};
    let landed = null;
    if (lay.length && list.length) {
      landed = [];
      for (const [ti, t] of list.entries()) {
        const victim = targetActorOf(t);
        for (const c of lay) {
          const own = c.id === done.condition?.id;
          // Each on its own span (the Legacy branches' B6: Shadow Strike's Bleeding keeps
          // A1's count, its Slowed the striker's next turn - `riderConditionSpan`).
          const span = riderConditionSpan(c, riderSpan, c.also ? untilNextTurn(actor) : null);
          landed.push(recordLanding(ti, await inflictCondition({ victim, id: c.id, value: c.value, by: actor, name: t?.name ?? "", until: span, marks: own ? riderMarks : {} })));
        }
      }
    }
    // Concussive Shot's rank 2 (*it also loses its Reaction*), through the
    // combatant's own queued door (D-761) on the GM's client where needed.
    if (done.loseReaction && list.length) {
      const lost = [];
      for (const [ti, t] of list.entries()) {
        const loss = await loseReaction({ victim: targetActorOf(t), by: actor, name: t?.name ?? "" });
        if (loss?.lost) recordHit(ti, { kind: "reaction", lost: true });
        lost.push(reactionLossText(loss));
      }
      fired.push({ key: "rider", name: p.name, text: lost.join(" ") });
    }
    // Wing Clip's *Speed drops 10 feet per rank until your next turn*: a span
    // only a fight has; out of one the drop is the table's, and said so.
    if ((done.speedDrop ?? 0) > 0 && list.length) {
      const span = untilNextTurn(actor);
      const words = [];
      for (const [ti, t] of list.entries()) {
        if (!span) { words.push(game.i18n.format("AZEROTH.SpeedDrop.NoFight", { name: t?.name ?? "", feet: done.speedDrop })); continue; }
        const dropped = await laySpeedDrop({ victim: targetActorOf(t), feet: done.speedDrop, source: p.name, by: actor, span, name: t?.name ?? "" });
        if (dropped?.landed) recordHit(ti, { kind: "speedDrop", landed: true, effectId: dropped.effectId ?? null, source: p.name });
        // The feet that LANDED: the door adds the striker's Permafrost (D-778).
        words.push(game.i18n.format(dropped?.landed ? "AZEROTH.SpeedDrop.Landed" : "AZEROTH.SpeedDrop.NotLanded", { name: dropped?.name || t?.name || "", feet: dropped?.landed ? dropped.feet : done.speedDrop }));
      }
      fired.push({ key: "rider", name: p.name, text: words.join(" ") });
    }
    // **THE STRIKER'S HEALTH** (04's Bloodthirst: *recover Health equal to your
    // rank*; D-772), through the one healing door, and what landed said.
    let healed = null;
    if (outcome.success && (done.heal ?? 0) > 0) {
      const before = actor.system?.health?.value ?? 0;
      await actor.applyHealing(done.heal, { from: actor });
      healed = Math.max(0, (actor.system?.health?.value ?? before) - before);
    }
    // **A TARGET THAT RECOVERS NONE** (04's Mortal Strike, D-772): the mark on
    // every target the card records, through the GM's client where needed.
    let noHealing = null;
    if (outcome.success && done.noHealing && list.length) {
      noHealing = [];
      for (const [ti, t] of list.entries()) {
        const mark = await layNoHealing({ victim: targetActorOf(t), striker: actor, source: p.name, name: t?.name ?? "" });
        if (mark?.landed) recordHit(ti, { kind: "noHealing", landed: true, effectId: mark.effectId ?? null, source: p.name });
        noHealing.push(mark);
      }
    }
    // **A BANE ON THE TARGET'S NEXT TEST** (04's Stormstrike: *takes a Bane on its
    // next attack. At rank 2 it takes two Banes*; D-774), landing with the blow as
    // a rider's condition does (the lead: *"Lands automatically"*), through 06
    // §6's door - a count, spent by that creature's next Test of the kind.
    const banedOn = [];
    if (outcome.success && done.bane && list.length) {
      for (const [ti, t] of list.entries()) {
        const victim = targetActorOf(t);
        const laid = victim ? await layBane({ victim, kind: done.bane.kind, banes: done.bane.banes, source: p.name, by: actor }) : null;
        if (laid) {
          banedOn.push(t?.name ?? victim.name);
          recordHit(ti, { kind: "bane", landed: true, effectId: laid.effectId ?? null, source: p.name });
        }
      }
    }
    // **04's LAVA LASH** (*Your Stormstrike spreads any Fire effect on the target to
    // one enemy within 10 feet, or to two enemies at rank 2*; the lead, 2026-10-03,
    // on O-189: *"ablaze or whatever it's called condition."*; D-779): on
    // Stormstrike's hit, A1's Scorched the struck creature carries, at its value, onto
    // the nearest of the striker's enemies within 10 feet of it, through the one
    // landing door; its span is A1's own (READING).
    const spread = [];
    const lash = outcome.success && list.length ? lavaLashFor(talentsHeld) : null;
    if (lash && lash.on === p.identifier) {
      const struckActor = targetActorOf(list[0]);
      const scorchedOn = (struckActor?.effects ?? []).find(e => e.active !== false && e.statuses?.has?.(lash.condition)) ?? null;
      const held = scorchedOn ? Math.trunc(Number(scorchedOn.getFlag?.("azeroth-rpg", "value"))) || 1 : null;
      const struckToken = tokenOfTarget(list[0]);
      const near = struckToken ? creaturesWithin(actor, lash.feet, { from: struckToken, who: "enemy", except: [struckToken.id] })
        .sort((a, b) => (a.feet - b.feet) || String(a.token.name ?? "").localeCompare(String(b.token.name ?? ""))) : [];
      const plan = lavaLashSpread({ scorched: held, count: lash.count, enemies: near });
      for (const e of plan?.onto ?? []) spread.push(landedText(await inflictCondition({ victim: e.actor, id: lash.condition, value: plan.value, by: actor, name: e.token.name ?? e.actor.name })));
      if (plan && !plan.onto.length) spread.push(game.i18n.format("AZEROTH.LavaLash.Nobody", { talent: lash.name, feet: lash.feet }));
      if (spread.length) spread.unshift(game.i18n.format("AZEROTH.LavaLash.Spread", { talent: lash.name }));
    }
    const text = [riderCardText(p, done, {
      hit: outcome.success, inFight: Boolean(riderCombatant), landed, primed: p.primed,
      paysOnHit: p.line?.pays === "hit", healed, noHealing
    }), banedOn.length ? game.i18n.format("AZEROTH.Rider.Card.Bane", { n: done.bane.banes, names: banedOn.join(", ") }) : null, ...spread].filter(Boolean).join(" ");
    const buttons = landed ? [] : lay;
    // A rider's damage of a NAMED type (04's Stormstrike's Nature; D-777) is a
    // second amount of that type; one naming none rides the blow's own.
    fired.push({ key: "rider", name: p.name, text, condition: buttons[0] ?? null, extraDamage: done.damage, extraType: done.damageType ?? null });
    // A further button's words are its own condition's (a second condition, B6), else Prone's.
    for (const c of buttons.slice(1)) {
      const words = c.id === "prone" ? game.i18n.localize("AZEROTH.Rider.Card.Prone")
        : game.i18n.format(c.value !== null && c.value !== undefined ? "AZEROTH.Rider.Card.Condition" : "AZEROTH.Rider.Card.ConditionBare",
          { condition: game.i18n.localize(AZEROTH.conditions[c.id] ?? c.id), value: c.value });
      fired.push({ key: "rider", name: p.name, text: words, condition: c });
    }
    if (done.damage) riderDamageRows.push({ name: p.name, amount: done.damage, type: done.damageType ?? null });
  }
  // **A CONDITION AN ATTACK LAYS AT AN SL** (04's Deep Cut: *When an attack of
  // yours reaches SL 2, the target gains Bleeding equal to your rank*; D-772):
  // with the blow, as a rider's condition lands (the lead, 2026-10-03: *"Lands
  // automatically"*), and a button where the card records no target.
  if (kind === "attack" && !parry) {
    // And on an Opportunity Attack alone where the row says so (04's Hold the Hall:
    // *On a hit it is knocked Prone*; the Legacy branches' door 22).
    for (const hit of hitConditionsFor(talentsHeld, { sl: outcome.sl, hit: outcome.success, opportunity: opportunity === true })) {
      let landed = null;
      if (list.length) {
        landed = [];
        for (const [ti, t] of list.entries()) landed.push(recordLanding(ti, await inflictCondition({ victim: targetActorOf(t), id: hit.id, value: hit.value, by: actor, name: t?.name ?? "" })));
      }
      fired.push({
        key: "talent", name: hit.name,
        text: landed ? landed.map(landedText).join(" ") : game.i18n.format("AZEROTH.Talent.Card.LaysOnHit", { condition: game.i18n.localize(AZEROTH.conditions[hit.id] ?? hit.id), value: hit.value ?? "" }),
        condition: landed ? null : { id: hit.id, value: hit.value }
      });
    }
    // **04's CHARGED STEEL** (*When you hit a creature with a weapon attack, your next branch
    // spell to damage that creature before the end of your next turn deals 1 more damage per
    // rank*; stage 3A): the promise laid on the striker for each creature this hit struck.
    if (outcome.success && list.length && actor?.type === "character") {
      const { markChargedSteel } = await import("../effects/chromatic-talents.mjs");
      const steel = await markChargedSteel(actor, list);
      if (steel) fired.push({ key: "talent", name: steel.name, text: steel.text });
    }
  }
  // **WHAT FOUR EFFECT TRAITS LAND ON A HIT** (08 SS5; D-812; the lead: *"complete
  // them"*): Rattle's point of Momentum, Snag's bar on Opportunity Attacks until the
  // creature's next turn, Shove's 5 feet straight away from the striker and Daze's
  // Reaction - on every creature the card records, through the doors that already
  // write each (`effects/hit-marks.mjs`, `effects/forced-movement.mjs#forceMove`,
  // `effects/reaction-loss.mjs`), recorded for a Parry or Afterimage to take back,
  // and the row says what landed on whom (D-770's *"Lands automatically"*). A blow
  // with no target recorded keeps the trait's own line, for the table. A creature
  // that is another's, with no GM online to write it, is judged before any write and
  // said in words (`rules/gm-writes.mjs#gmAbsentFor`). A Signature's `onHit` row rides
  // the same list and `traitLandings` reads none of it.
  if (kind === "attack" && !parry && outcome.success && list.length) {
    const strikerDoc = actor?.getActiveTokens?.(false, true)?.[0] ?? null;
    for (const f of fired) {
      const lands = traitLandings(f);
      if (!lands.length) continue;
      const words = [];
      for (const [ti, t] of list.entries()) {
        const victim = targetActorOf(t);
        const name = t?.name ?? victim?.name ?? "";
        if (!victim) { words.push(game.i18n.format("AZEROTH.TraitLanding.Gone", { name })); continue; }
        if (gmAbsentForActors([victim])) { words.push(game.i18n.format("AZEROTH.TraitLanding.NoGM", { name, trait: f.name })); continue; }
        for (const l of lands) {
          if (l.kind === "momentum") {
            const lost = await loseMomentum({ victim, amount: l.amount, by: actor, name });
            if (lost.lost > 0) recordHit(ti, { kind: "momentum", landed: true, itemId: lost.itemId, amount: lost.lost });
            words.push(game.i18n.format(lost.lost > 0 ? "AZEROTH.TraitLanding.Momentum" : (lost.reason === "none" ? "AZEROTH.TraitLanding.NoMomentum" : "AZEROTH.TraitLanding.MomentumNot"), { name, n: lost.lost || l.amount }));
          } else if (l.kind === "noOpportunity") {
            const laid = await layHitMark({ victim, mark: { kind: "noOpportunity", source: f.name }, by: actor, span: untilNextTurnOrRound(victim), name });
            if (laid.landed) recordHit(ti, { kind: "mark", landed: true, effectId: laid.effectId, source: f.name });
            words.push(game.i18n.format(laid.landed ? "AZEROTH.TraitLanding.Snag" : "AZEROTH.TraitLanding.SnagNot", { name }));
          } else if (l.kind === "push") {
            const token = tokenDocOfTarget(t);
            const before = token ? { x: token.x, y: token.y } : null;
            const from = strikerDoc && token && strikerDoc.parent === token.parent ? (strikerDoc.getCenterPoint?.() ?? null) : null;
            const r = from ? await forceMove({ token, from, feet: l.feet, toward: "away", by: actor, name }) : { name, feet: 0, moved: false, reason: "unmeasured" };
            if (r.moved && r.feet > 0 && before) recordHit(ti, { kind: "push", landed: true, from: before });
            words.push(forcedWords(r, { toward: "away", source: f.name }));
          } else if (l.kind === "reaction") {
            const loss = await loseReaction({ victim, by: actor, name });
            if (loss?.lost) recordHit(ti, { kind: "reaction", lost: true });
            words.push(reactionLossText(loss));
          }
        }
      }
      f.text = [game.i18n.localize(`AZEROTH.Trait.Fired.${f.key}`), ...words].join(" ");
    }
  }
  // **WHAT A COMPANION'S BLOW DOES BY ITS OWNER'S TALENTS** (D-773): 04's
  // Ferocious Bite (*When your companion's attack reaches SL 2, the target gains
  // Bleeding equal to your rank*) lands as Deep Cut's does, and Intimidation (*the
  // target makes a Spirit Resilience Test against your Spell DC or takes a Bane
  // for one round per rank*) is a Test button per target at the OWNER's Spell DC.
  const companionOwner = kind === "attack" && !parry ? companionOwnerOf(actor) : null;
  const ownerTalents = companionOwner ? companionOwner.takenTalents() : [];
  const intimidations = [];
  if (companionOwner) {
    for (const hit of companionHitConditionsFor(ownerTalents, { sl: outcome.sl, hit: outcome.success })) {
      let landed = null;
      if (list.length) {
        landed = [];
        for (const [ti, t] of list.entries()) landed.push(recordLanding(ti, await inflictCondition({ victim: targetActorOf(t), id: hit.id, value: hit.value, by: actor, name: t?.name ?? "" })));
      }
      fired.push({
        key: "talent", name: hit.name,
        text: landed ? landed.map(landedText).join(" ") : game.i18n.format("AZEROTH.Talent.Card.LaysOnHit", { condition: game.i18n.localize(AZEROTH.conditions[hit.id] ?? hit.id), value: hit.value ?? "" }),
        condition: landed ? null : { id: hit.id, value: hit.value }
      });
    }
    if (outcome.success) {
      for (const row of companionHitTestsFor(ownerTalents)) {
        const index = intimidations.length;
        intimidations.push({ name: row.name, bane: row.bane });
        // A Test the hit offers (door 13): withdrawn with the hit, target by target.
        for (const ti of list.keys()) recordHit(ti, { kind: "test", name: row.name });
        fired.push({
          key: "talent", name: row.name,
          text: game.i18n.format("AZEROTH.Intimidation.Card", { n: row.bane.rounds, banes: row.bane.banes }),
          intimidate: { index, resilience: row.resilience, label: AZEROTH.resiliences[row.resilience], dc: companionOwner.system?.spellDC ?? null }
        });
      }
    }
  }
  // **WHAT A BOUND CREATURE'S HIT LAYS BY ITS OWNER'S TALENTS** (04's Serpent Ward:
  // *a creature it hits is **Poisoned** 1, and the DC to shed it is your Spell DC. At
  // rank 2 that creature is also **Slowed** until the end of its next turn*; the
  // Legacy branches' door 20): each condition the owner's `boundAttack` rows lay, on
  // every target the card records, through the one landing door - the shed DC the
  // OWNER's Spell DC, written on the condition's own effect for the turn-end prompt.
  const boundOwnerNow = kind === "attack" && !parry && outcome.success ? boundOwnerOf(actor) : null;
  const boundKindNow = boundOwnerNow ? (bondOf(actor)?.kind ?? null) : null;
  if (boundOwnerNow) {
    for (const row of boundAttacksFor(boundOwnerNow.takenTalents?.() ?? [], { kind: boundKindNow, name: actor.name ?? "" })) {
      for (const lay of row.lays) {
        if (!AZEROTH.conditions?.[lay.condition]) continue;
        const shedDc = lay.shed === "spellDc" ? (boundOwnerNow.system?.spellDC ?? boundOwnerNow.system?.spells?.dc ?? null) : null;
        const marks = shedDc ? { [SHED_DC_FLAG]: { dc: shedDc, source: row.name } } : {};
        let landed = null;
        if (list.length) {
          landed = [];
          for (const [ti, t] of list.entries()) {
            landed.push(recordLanding(ti, await inflictCondition({ victim: targetActorOf(t), id: lay.condition, value: lay.value, by: actor, name: t?.name ?? "", until: lay.until, marks })));
          }
        }
        fired.push({
          key: "talent", name: row.name,
          text: landed ? landed.map(landedText).join(" ") : game.i18n.format("AZEROTH.Talent.Card.LaysOnHit", { condition: game.i18n.localize(AZEROTH.conditions[lay.condition] ?? lay.condition), value: lay.value ?? "" }),
          condition: landed ? null : { id: lay.condition, value: lay.value }
        });
      }
    }
  }
  // **A CONSTRUCT'S HIT BUILDS ITS TINKER'S COMBO POINTS** (04's Supercharge at rank 2:
  // *your constructs' hits build your Combo Points and keep them from draining*;
  // door 6): 02 §7's gain on the tinker's own pool, in the tinker's fight, and the
  // tinker's last hit marked this round, which is what keeps the points from
  // draining (`rules/momentum.mjs#idleDecay`). Written where this client may write
  // the tinker - the construct's controller is the tinker's player.
  if (boundOwnerNow && boundKindNow === "construct" && gainsMomentum && !offHand && boundOwnerNow.isOwner) {
    const ownerFight = boundOwnerNow.activeFight?.() ?? null;
    if (ownerFight && constructsFor(boundOwnerNow.takenTalents?.() ?? [], { tier: boundOwnerNow.system?.tier ?? 1 }).buildsCombo) {
      const comboBuilt = gainOnHit({ pools: (boundOwnerNow.poolSnapshot?.() ?? []).filter(p => p.name === "comboPoints"), sl: outcome.sl });
      if (comboBuilt.length) {
        await boundOwnerNow.updatePool(comboBuilt.map(g => ({ itemId: g.itemId, kind: g.kind, value: g.value })));
        recordBuilt(boundOwnerNow, comboBuilt);
        roll.options.provenance.push({ label: "AZEROTH.Construct.Supercharge", value: null, formula: game.i18n.format("AZEROTH.Construct.ComboBuilt", { n: comboBuilt[0].gained, name: boundOwnerNow.name }) });
      }
      const tinkerCombatant = ownerFight.getCombatantsByActor(boundOwnerNow)?.[0] ?? null;
      if (tinkerCombatant?.isOwner) await tinkerCombatant.setFlag("azeroth-rpg", "lastHitRound", ownerFight.round);
    }
  }
  // **A TEST THE USER'S OWN HIT FORCES** (04's Keening Arrows: *Once a round, when a
  // ranged attack of yours reaches SL 2, the target makes a Spirit Resilience Test
  // against your Spell DC or is Frightened of you for one round per rank*; the Legacy
  // branches' door 26): Intimidation's own button, a failure laying the condition for
  // its rounds rather than a Bane (`dice/chat.mjs#rollResists`), the round's once
  // marked through the queued door before the button is offered.
  if (kind === "attack" && !parry && outcome.success) {
    const mine = fight ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
    for (const row of selfHitTestsFor(talentsHeld, { sl: outcome.sl, hit: true, rangeKind: strike?.rangeKind ?? null, used: roundUsedOf(actor) })) {
      if (row.once === "round" && mine?.isOwner && !((await mine.markRoundOnce(row.identifier))?.added === true)) continue;
      const index = intimidations.length;
      intimidations.push({ name: row.name, condition: row.condition, rounds: row.rounds });
      for (const ti of list.keys()) recordHit(ti, { kind: "test", name: row.name });
      fired.push({
        key: "talent", name: row.name,
        text: game.i18n.format("AZEROTH.HitTest.Card", { condition: game.i18n.localize(AZEROTH.conditions[row.condition] ?? row.condition), n: row.rounds }),
        intimidate: { index, resilience: row.resilience, label: AZEROTH.resiliences[row.resilience], dc: actor.system?.spellDC ?? null }
      });
    }
  }
  // **DAMAGE A HIT ADDS AT AN SL, AFTER THE DIE** (04's Critical Strike: *an attack of
  // yours that reaches SL 2 adds half your Dexterity modifier, rounded up, to its
  // damage. At rank 2 an attack that reaches SL 3 adds twice that instead and ignores
  // Armor Points*; the Legacy branches' door 26): a fired row riding the blow's own
  // Rating, its gate (*While you wield a two-handed weapon*) read by the one predicate.
  const slDamage = kind === "attack" && !parry && damage ? slDamageFor(talentsHeld, { sl: outcome.sl, hit: outcome.success, facts: gateFacts, scope: abilities }) : [];
  for (const row of slDamage) {
    fired.push({ key: "talent", name: row.name, text: game.i18n.format(row.ignoresArmor ? "AZEROTH.SlDamage.CardIgnores" : "AZEROTH.SlDamage.Card", { n: row.amount, sl: row.sl }), extraDamage: row.amount });
  }
  const slIgnoresArmor = slDamage.some(r => r.ignoresArmor === true);
  // **AN ATTACK MADE WHILE HIDDEN** (D-773), hit or miss - *a target you
  // attack*: 04's Waylay takes the Reaction it holds, *until its next turn* being
  // 06 §6's own refresh; Subterfuge holds it under the Opening for its rounds,
  // a span only a fight has.
  if (hiddenAtRoll && list.length) {
    if (hiddenRow.loseReaction) {
      const lost = [];
      for (const t of list) lost.push(reactionLossText(await loseReaction({ victim: targetActorOf(t), by: actor, name: t?.name ?? "" })));
      fired.push({ key: "talent", name: hiddenRow.by.join(", "), text: lost.join(" ") });
    }
    const subterfuge = openingMarkRoundsFor(talentsHeld);
    const span = subterfuge.rounds > 0 ? spellTiming(actor, { value: subterfuge.rounds, units: "rounds", expiry: "turnEnd" }) : null;
    if (span) {
      for (const t of list) await markOpening(actor, t, { rounds: subterfuge.rounds, source: subterfuge.name, span });
      fired.push({ key: "talent", name: subterfuge.name, text: game.i18n.format("AZEROTH.Opening.Marked", { names: list.map(t => t?.name).filter(Boolean).join(", "), n: subterfuge.rounds }) });
    }
  }
  // **RUPTURE'S BLEEDING** (04: *Bleeding equal to twice the Combo Points spent
  // plus your rank, instead of dealing damage*; D-773), on the hit, as Rip's
  // lands (D-770).
  if (finisherBleeding > 0 && outcome.success) {
    let landed = null;
    if (list.length) {
      landed = [];
      for (const [ti, t] of list.entries()) landed.push(recordLanding(ti, await inflictCondition({ victim: targetActorOf(t), id: "bleeding", value: finisherBleeding, by: actor, name: t?.name ?? "" })));
    }
    fired.push({
      key: "talent", name: finisherNow.bleeding.name,
      text: landed ? landed.map(landedText).join(" ") : game.i18n.format("AZEROTH.Talent.Card.LaysOnHit", { condition: game.i18n.localize(AZEROTH.conditions.bleeding), value: finisherBleeding }),
      condition: landed ? null : { id: "bleeding", value: finisherBleeding }
    });
  }
  // **SHACKLE'S ENTANGLED** (04: *Your Finisher class feature may, instead of adding
  // damage, leave the target of a hit Entangled for one round per Combo Point spent.
  // Ending it takes an action and a Reflex Resilience Test against your Spell DC, with
  // a Bane at rank 2*; the Legacy branches' door 26): on the hit, through the one
  // landing door, for the rounds counted (the world's rounds out of a fight), and
  // carrying the escape at the payer's Spell DC (door 19's record).
  if (finisherShackle > 0 && outcome.success) {
    const shackle = finisherNow.shackle;
    const who = finisherPayer ?? actor;
    const record = featureEscapeRecord(shackle.escape ?? null, {
      condition: shackle.condition, spellDc: who.system?.spellDC ?? who.system?.spells?.dc ?? null,
      strDc: resistDcFor({ kind: "str", strMod: who.system?.abilities?.str?.mod ?? 0, proficiency: who.system?.proficiency ?? 0 }),
      caster: who.uuid, source: shackle.name
    });
    const span = roundsOrClock(who, finisherShackle);
    let landed = null;
    if (list.length) {
      landed = [];
      for (const [ti, t] of list.entries()) {
        landed.push(recordLanding(ti, await inflictCondition({ victim: targetActorOf(t), id: shackle.condition, by: actor, name: t?.name ?? "", until: span, marks: record ? { [ESCAPE_FLAG]: record } : {} })));
      }
    }
    fired.push({
      key: "talent", name: shackle.name,
      text: landed ? landed.map(landedText).join(" ") : game.i18n.format("AZEROTH.Shackle.Card", { condition: game.i18n.localize(AZEROTH.conditions[shackle.condition] ?? shackle.condition), n: finisherShackle }),
      condition: landed ? null : { id: shackle.condition, value: null }
    });
    roll.options.provenance.push({ label: shackle.name, value: null, formula: game.i18n.format("AZEROTH.Shackle.Row", { n: finisherShackle }) });
  }
  // **WHAT THIS ATTACK'S HIT LAYS, WHATEVER STRIKES IT** (the Legacy branches' door 7:
  // 04's Net-o-Matic Projector): each condition on every target the card records,
  // with its escape at the striker's Spell DC.
  if (kind === "attack" && !parry && outcome.success && Array.isArray(landsOnHit) && landsOnHit.length) {
    for (const lay of landsOnHit) {
      if (!lay?.condition || !AZEROTH.conditions?.[lay.condition]) continue;
      const record = featureEscapeRecord(lay.escape ?? null, {
        condition: lay.condition, spellDc: actor.system?.spellDC ?? actor.system?.spells?.dc ?? null,
        strDc: resistDcFor({ kind: "str", strMod: actor.system?.abilities?.str?.mod ?? 0, proficiency: actor.system?.proficiency ?? 0 }),
        caster: actor.uuid, source: lay.source ?? title
      });
      let landed = null;
      if (list.length) {
        landed = [];
        for (const [ti, t] of list.entries()) {
          landed.push(recordLanding(ti, await inflictCondition({ victim: targetActorOf(t), id: lay.condition, value: lay.value ?? null, by: actor, name: t?.name ?? "", until: lay.until ?? null, marks: record ? { [ESCAPE_FLAG]: record } : {} })));
        }
      }
      fired.push({
        key: "talent", name: lay.source ?? title,
        text: landed ? landed.map(landedText).join(" ") : game.i18n.format("AZEROTH.Talent.Card.LaysOnHit", { condition: game.i18n.localize(AZEROTH.conditions[lay.condition] ?? lay.condition), value: lay.value ?? "" }),
        condition: landed ? null : { id: lay.condition, value: lay.value ?? null }
      });
    }
  }
  // **RUTHLESSNESS** (04: *When your Finisher class feature reaches SL 2, 1 Combo
  // Point per rank returns to you*; D-773), on a Finisher that counted - to whoever
  // paid it (a construct's tinker, door 6).
  if (finisherCounted > 0 && finisherNow?.back && outcome.success && outcome.sl >= finisherNow.back.sl) {
    const backTo = finisherPayer ?? actor;
    const combo = (backTo.poolSnapshot?.() ?? []).find(p => p.name === "comboPoints") ?? null;
    if (combo) {
      const value = Math.min(combo.max, combo.value + finisherNow.back.amount);
      if (value > combo.value) await backTo.updatePool({ itemId: combo.itemId, kind: combo.kind, value });
      // What the SL returned is Combo Points the hit built (MY READING of the lead's
      // *"Yes, take it back"*): a withdrawn Finisher takes them back off (door 13).
      recordBuilt(backTo, [{ itemId: combo.itemId, kind: combo.kind, name: combo.name, gained: value - combo.value }]);
      roll.options.provenance.push({ label: finisherNow.back.name, value: null, formula: game.i18n.format("AZEROTH.Card.Returned", { n: value - combo.value, pool: game.i18n.localize(AZEROTH.poolTypes.comboPoints) }) });
    }
  }
  // **STEADY AIM** (04: *Spending a Half-Action on Steady returns 1 Focus per
  // rank*; D-773): the dialog's own Steady line ticked on this attack is that
  // Half-Action (MY READING: 05's Steady has no door of its own, O-100).
  if (kind === "attack" && !parry && (chosen ?? []).includes("steady")) {
    const back = steadyReturnFor(talentsHeld);
    const into = back ? ((actor.poolSnapshot?.() ?? []).find(p => p.name === back.pool) ?? null) : null;
    if (back && into) {
      const value = Math.min(into.max, into.value + back.amount);
      if (value > into.value) await actor.updatePool({ itemId: into.itemId, kind: into.kind, value });
      roll.options.provenance.push({ label: back.by.join(", "), value: null, formula: game.i18n.format("AZEROTH.Card.Returned", { n: value - into.value, pool: game.i18n.localize(AZEROTH.poolTypes[into.name] ?? into.name) }) });
    }
  }
  // **RECKLESS'S EXPOSURE** (04: *Until your next turn, attacks against you gain
  // one too. At rank 2 only ranged attacks do*; D-772): laid on the striker by
  // an attack made with its Boon ticked. Out of a fight there is no next turn to
  // end on and nothing is laid (MY READING, for the lead).
  if (kind === "attack" && !parry && (chosen ?? []).includes("reckless")) {
    const exposed = await layExposure(actor, recklessFor(talentsHeld));
    if (exposed) roll.options.provenance.push({ label: exposed.name, value: null, formula: game.i18n.localize(exposed.ranged ? "AZEROTH.Reckless.ExposedRanged" : "AZEROTH.Reckless.Exposed") });
  }
  // **08 §12's TICK POISON** (O-114, D-770): a poison that landed with the blow
  // and carries a tick stamps it here, with the poisoner's hand, and the card
  // offers the target's Resilience Test at the poison's DC; a failure lays it
  // (`dice/chat.mjs#rollResists`).
  // **04's COATED BLADES AT RANK 2** (*the poison needs no Test to take hold*;
  // D-773): the tick lands on each creature struck through the one landing a
  // failed Test uses (`effects/ticks.mjs#poisonTakesHold`), and the card says so
  // in place of the Test.
  const coatedBlades = kind === "attack" && !parry ? coatingTalentsFor(talentsHeld) : { noTest: false, by: [] };
  const poisons = [];
  for (const f of fired) {
    // **A POISON CARRIED UNTIL IT IS CURED** (D12): no Test lays it on every creature struck;
    // a Test offers the target's Resilience Test on the card and a failure lays it
    // (`dice/chat.mjs#rollResists`). Coated Blades' rank 2 skips the Test as it does for a tick.
    if (f.afflict) {
      const a = f.afflict;
      if (!a.resilience || coatedBlades.noTest) {
        const words = [];
        for (const t of list) {
          const victim = targetActorOf(t);
          if (!victim) continue;
          const done = await afflictPoison({ victim, name: a.name, key: a.key, dc: a.dc, resilience: a.resilience ?? "body", carried: a.carried, by: actor });
          words.push(game.i18n.format(done?.ok ? "AZEROTH.Afflictions.Card.Laid" : (done?.reason === "immune" ? "AZEROTH.Afflictions.Card.Immune" : "AZEROTH.Afflictions.Card.Already"), { name: t?.name ?? victim.name, affliction: a.name }));
        }
        if (words.length) f.text = [f.text, ...words].filter(Boolean).join(" ");
      } else {
        f.poison = { index: poisons.length, resilience: a.resilience, label: AZEROTH.resiliences[a.resilience], dc: a.dc ?? null };
        poisons.push({ name: f.name, afflict: a });
        for (const ti of list.keys()) recordHit(ti, { kind: "test", name: f.name });
      }
      continue;
    }
    if (!f.tick || !f.resist?.resilience) continue;
    const laidPoison = layTick(f.tick, { source: actor?.uuid ?? null, name: f.name });
    if (!laidPoison) continue;
    if (coatedBlades.noTest && list.length) {
      const words = [];
      for (const t of list) {
        const held = await layPoison({ victim: targetActorOf(t), tick: laidPoison });
        words.push(game.i18n.format(held.landed ? "AZEROTH.CoatedBlades.Landed" : (held.reason === "noClock" ? "AZEROTH.CoatedBlades.NoClock" : "AZEROTH.CoatedBlades.NotLanded"), { name: t?.name ?? "", poison: f.name, talent: coatedBlades.by.join(", ") }));
      }
      f.text = [f.text, ...words].filter(Boolean).join(" ");
      continue;
    }
    f.poison = { index: poisons.length, resilience: f.resist.resilience, label: AZEROTH.resiliences[f.resist.resilience], dc: f.resist.dc ?? null };
    poisons.push({ name: f.name, tick: laidPoison });
    // A Test the hit offers (door 13): withdrawn with the hit, target by target.
    for (const ti of list.keys()) recordHit(ti, { kind: "test", name: f.name });
  }
  // **A ROW THAT MAY FIRE ONLY ONCE A ROUND** (08 SS20, D-696). Dal'Rend's
  // Sacred Charge says *the first time you hit each round* and Sulfuron Hammer
  // says *once each turn*, and 08 SS5's Fast has kept exactly this mark since
  // D-662 - so the limit rides beside it on the combatant's own round flag
  // rather than inventing a second clock.
  //
  // **A combatant takes ONE turn a round**, so *each turn* and *each round* are
  // the same clock for whoever is swinging; the two could differ only on a
  // Reaction, and SS20 writes neither of these on one. Out of a started fight
  // there is no clock at all and the row fires on every blow, which is the
  // ruling every other turn-bounded thing here makes. **Nothing is spent on a
  // miss**: `firedTraits` returns no rows at all when the Test failed.
  // **THE SHAMAN'S BLOWS** (D-774). STORMLASH (*Once a round, when you hit with a
  // weapon attack, add Nature damage equal to your rank*; Doom Winds lifts the
  // once until the shaman's next turn) rides the blow's Rating, MY READING (a blow
  // carries one damage type - D-770's convention for what a talent adds), the
  // round's record its clock; out of a fight there is no clock and it rides every
  // hit, the ruling every other once-a-round thing here makes.
  const weaponHit = kind === "attack" && !parry && Boolean(weaponId) && outcome.success;
  if (weaponHit && damage) {
    const lash = stormlashFor(talentsHeld, { doomWinds: flaggedEffects(actor, DOOM_WINDS_FLAG).length > 0 });
    if (lash) {
      const mine = fight ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
      const due = !lash.once || !mine || (mine.isOwner && (await mine.markRoundOnce(lash.identifier))?.added === true);
      // Its NATURE is its own (D-777): a second amount the target's Nature Ward meets.
      if (due) fired.push({ key: "talent", name: lash.name, text: game.i18n.format("AZEROTH.Stormlash.Card", { n: lash.amount, type: game.i18n.localize(AZEROTH.damageTypes[lash.type] ?? lash.type ?? "") }), extraDamage: lash.amount, extraType: lash.type ?? null });
    }
  }
  // MAELSTROM (*Every third weapon hit returns 2 Mana per rank to you*): the count
  // on the shaman's own flag.
  const storm = weaponHit && actor?.isOwner ? maelstromStep(talentsHeld, Number(actor.getFlag("azeroth-rpg", MAELSTROM_FLAG)) || 0) : null;
  if (storm) {
    await actor.setFlag("azeroth-rpg", MAELSTROM_FLAG, storm.count);
    const back = storm.mana > 0 ? await restoreMana(actor, (actor.poolSnapshot?.() ?? []).find(p => p.name === "mana") ?? null, storm.mana) : 0;
    if (back > 0) roll.options.provenance.push({ label: storm.name, value: null, formula: game.i18n.format("AZEROTH.Cast.ManaBackRow", { n: back }) });
  }
  // EARTHLIVING (*When you make a melee attack, you may restore Health to yourself
  // equal to half your tier, rounded down, plus your rank*): every melee attack,
  // landed or not, the second roll of an Extra Attack excepted (one Attack) - and
  // ANCESTRAL GUIDANCE's heal on a friend beside the shaman, a button on the card.
  let guidance = null;
  const living = kind === "attack" && !parry && !secondRoll && actor?.isOwner
    ? earthlivingFor(talentsHeld, { melee: (strike?.rangeKind ?? null) === "melee", tier: actor.system?.tier ?? 1 })
    : null;
  if (living) {
    const before = actor.system?.health?.value ?? 0;
    await actor.applyHealing(living.heal, { from: actor });
    fired.push({ key: "talent", name: living.name, text: game.i18n.format("AZEROTH.Earthliving.Card", { n: Math.max(0, (actor.system?.health?.value ?? before) - before) }) });
    const g = guidanceFor(talentsHeld);
    if (g) guidance = { name: g.name, heal: living.heal, count: g.count, feet: g.feet };
  }
  // ROCKBITER (*your Armor Points rise by 1 per rank against the first attack each
  // round*): the attack marks each target holding it, so the next attack's
  // snapshot carries no rise (`roll-dialog.mjs#targetSnapshots`). Where this
  // client may write the target's combatant - the GM, who rolls the attacks a
  // shaman takes.
  if (kind === "attack" && !parry && fight) {
    for (const t of list) {
      const victim = targetActorOf(t);
      if (!victim?.takenTalents || !firstAttackFor(victim.takenTalents(), { shield: true })) continue;
      const theirs = fight.getCombatantsByActor(victim)?.[0] ?? null;
      if (theirs?.isOwner) await theirs.markRoundOnce(FIRST_ATTACK_MARK);
    }
  }
  await spendLimitedRows(fired, { actor, fight });
  const publishAttackCard = async ({bonuses=[],receipt=null,valid=()=>true}={}) => {
  if(!valid())throw Error('Signature hit authorization changed before damage calculation');
  for(const bonus of bonuses)fired.push({name:bonus.name,key:'signature',
    text:game.i18n.format('AZEROTH.Signature.HitBonus',{n:bonus.extraDamage,
      type:game.i18n.localize(AZEROTH.damageTypes[bonus.extraType??damage?.school??'physical']??bonus.extraType??'physical')})});
  // **A SECOND AMOUNT OF ITS OWN TYPE** (D-777; the lead, 2026-10-03: *"Different
  // damage types in one attack are possible"*): a fired row whose damage names a
  // type other than the blow's own - Stormlash's and Stormstrike's Nature, a
  // Signature's *Fire damage* - is its own amount, met by the target's own Ward of
  // that type; one of the blow's own type, or of none, rides the Rating as before.
  const blowType = damage?.kind === "magical" && damage?.school ? damage.school : "physical";
  const ownExtra = f => !f.extraType || f.extraType === blowType;
  const extraDamage = fired.reduce((n, f) => n + (ownExtra(f) ? (f.extraDamage ?? 0) : 0), 0);
  const typedExtras = [
    ...fired.filter(f => !ownExtra(f) && (f.extraDamage ?? 0) > 0).map(f => ({ type: f.extraType, amount: f.extraDamage })),
    // What a standing effect adds to every attack AS ITS OWN TYPE (the typed lane).
    ...(kind === "attack" && !parry ? typedLaneExtras(actor?.system, "attack") : [])
  ];
  const criticalLocation = fired.find(f => f.location)?.location ?? null;
  // **WHAT A FIRED ROW GIVES BACK IN MOMENTUM** (Dal'Rend's Sacred Charge).
  // `signatureSummary` has printed this key since D-692 and `firedSignatureRow`
  // dropped it on the floor, so the descriptor said *gain 1 additional
  // Momentum* and no pool ever moved - right code with no caller (D-681).
  const signatureMomentum = fired.reduce((n, f) => n + (f.momentum ?? 0), 0);
  // **WHAT A FIRED ROW GIVES BACK IN HEALTH AND MANA** (D-698). `onHit.heal`
  // has been in the descriptor since D-692 and `firedSignatureRow` dropped it,
  // so five life-stealing blades said *you regain 1 Health* and nothing ever
  // moved — the same shape as the Momentum above (D-681). A row naming a
  // DISTANCE heals somebody else and is a button on the card instead, because
  // nothing but the table knows which creature is within fifteen feet.
  const signatureHeal = fired.reduce((n, f) => n + (f.healFeet ? 0 : (f.heal ?? 0)), 0);
  const signatureMana = fired.reduce((n, f) => n + (f.mana ?? 0), 0);
  if (outcome.success && signatureHeal > 0) await actor.applyHealing(signatureHeal, { from: actor });
  if (outcome.success && signatureMana > 0) {
    const manaPool = (actor.system.powers ?? []).find(p => p.name === "mana") ?? null;
    if (manaPool) {
      await actor.updatePool({
        itemId: manaPool.itemId, kind: "power",
        value: Math.min(manaPool.max, manaPool.value + signatureMana)
      });
    }
  }

  // Damage only where the Test hit and the caller supplied a Rating - once
  // per target, since each carries its own armour and Ward, and the card's
  // Apply button is per row.
  // What the talents left ticked add, and WHY the number was what it was.
  // And what the next attack was promised (04's Vengeance, D-772), taken above.
  // **A STATIC CHARGE SPENT ON THIS BLOW** (04: *When you deal damage you may spend
  // a Static Charge to add your tier to that damage*; D-774): where it lands.
  const charged = chargeLine && damage && outcome.success && await spendCharge(actor) ? chargeLine.amount : 0;
  if (charged) roll.options.provenance.push({ label: chargeLine.name, value: charged });
  // **14's SELL THEM OUT** (D-809): *the first of those attacks to hit deals 4 extra
  // damage* - taken off the target's mark by the hit, for the marking Boss's side alone.
  const markedHit = kind === "attack" && !parry && damage && outcome.success ? await takeMarkedExtra(actor, first) : null;
  if (markedHit) roll.options.provenance.push({ label: markedHit.name, value: markedHit.damage });
  const talentRating = Math.max(0, Math.trunc(Number(extraRating)) || 0) + finisher + (damage ? promisedDamage : 0) + charged
    + (markedHit?.damage ?? 0)
    // Axe and Hammer's damage on the off hand (door 26).
    + (damage ? offHandBuild.damage : 0)
    + (damage ? crushridgeRating : 0)
    // Wind Walk's Dexterity, on the attack that ended its hiding (the B6 review).
    + (damage ? concealHit.damage : 0);
  if (damage) {
    if (crushridgeRating > 0) roll.options.provenance.push({ label: "Fallen-Kin Rage", value: crushridgeRating });
    if (offHandBuild.damage > 0) roll.options.provenance.push({ label: offHandBuild.by.join(", "), value: offHandBuild.damage });
    if (concealHit.damage > 0) roll.options.provenance.push({ label: concealHit.by.join(", "), value: concealHit.damage });
    // The TALENT'S OWN NAME is the label, as `castSpell`'s talent rows have
    // been since 2026-09-07: a row carrying a `formula` prints the formula
    // INSTEAD of the value, so a name in that slot loses the number.
    for (const row of damageRows) roll.options.provenance.push({ label: row.name, value: row.amount });
    // Death Mark's Finisher spent nothing and counted its five (D-773), so the
    // row is named for the talent rather than for points spent.
    if (finisher > 0) roll.options.provenance.push({ label: finisherFree ?? "AZEROTH.Card.FinisherSpent", value: finisher });
    // Rupture's Bleeding in place of the added damage (D-773).
    if (finisherBleeding > 0) roll.options.provenance.push({ label: finisherNow.bleeding.name, value: null, formula: game.i18n.format("AZEROTH.Card.FinisherBleeding", { n: finisherBleeding }) });
    // A rider's damage, named for its talent (D-770), on a hit alone - and one of
    // its own type said as that type, never as a point on the Rating (D-777).
    if (outcome.success) {
      for (const row of riderDamageRows) {
        if (!row.type || row.type === blowType) roll.options.provenance.push({ label: row.name, value: row.amount });
        else roll.options.provenance.push({ label: row.name, value: null, formula: game.i18n.format("AZEROTH.Card.PartRow", { n: row.amount, type: game.i18n.localize(AZEROTH.damageTypes[row.type] ?? row.type) }) });
      }
    }
    // The next attack's promised damage, by the talent that promised it (D-772).
    for (const e of promised?.live ?? []) if ((e.damage ?? 0) > 0) roll.options.provenance.push({ label: e.name, value: e.damage });
    // 04's Ember Strikes' Fire, said by name (stage 3A).
    if (convertAttack) roll.options.provenance.push({ label: convertAttack.name, value: null, formula: game.i18n.format("AZEROTH.EmberStrikes.Row", { school: game.i18n.localize(AZEROTH.schools[convertAttack.to] ?? convertAttack.to) }) });
  }
  // **04's DRAWN ACROSS ON THE STRIKER** (*the damage it deals is halved, rounded down*;
  // the Legacy branches' door 25): the blow's worth halved before Armor Points and Ward,
  // read off the striker as the one damage door's every caller reads it.
  const halvedBy = damage ? dealtHalvedBy(actor) : null;
  const shrink = kind === "attack" && !parry ? shrinkAmount([...(actor.effects ?? [])]) : 0;
  // Reduce the combined melee Rating once, before halving, Armor or Ward.
  // Separate damage components retain their own amounts and mitigation.
  const rawAttackRating = damage ? (damage.rating ?? 0) + extraDamage + talentRating : 0;
  const ratingWithBonus = extra => taintedBloodAttackRating(rawAttackRating+extra, {
    effects: actor.effects?.values?.() ?? actor.effects ?? [], ownerUuid: actor.uuid, now: game.time?.worldTime,
    meleeAttack: kind === "attack" && !parry && strike?.rangeKind === "melee"
  }) ?? (rawAttackRating+extra);
  const attackRating=ratingWithBonus(0);
  if (damage && outcome.success && attackRating < rawAttackRating)
    roll.options.provenance.push({ label: "Tainted Blood", value: attackRating - rawAttackRating });
  const equipmentDamage = equipmentMeleeBonus(actor.effects ?? [], {
    melee: strike?.rangeKind === "melee", attack: kind === "attack" && !parry,
    now: game.time?.worldTime
  });
  if (damage && outcome.success && equipmentDamage)
    roll.options.provenance.push({ label: "Winterfall Firewater", value: equipmentDamage });
  const mitigate = (t,index=-1) => {
  const bonus=hitBonusDamageForTarget(bonuses,index,blowType);
  return resolveDamage({
    ...(equipmentDamage ? { sourceDamageBonus: equipmentDamage } : {}),
    fireTakenBonus: t?.fireTakenBonus ?? 0,
    rating: ratingWithBonus(bonus.rating),
    sl: outcome.sl,
    kind: damage.kind ?? "physical",
    school: damage.school ?? null,
    location: location ?? "body",
    apByLocation: t?.apByLocation ?? {},
    // And the Armor Points the next attack was promised it ignores (04's
    // Precise Strike, D-772), on the blow's own Pierce - and what Piercing Shot
    // and an attack from hiding ignore (D-773). **Every one of them, where a hit at
    // an SL ignores Armor Points** (04's Critical Strike at rank 2; door 26): the
    // Pierce raised to the target's own Armor Points at the location struck.
    penetration: slIgnoresArmor
      ? Math.max((damage.penetration ?? 0) + promisedPierce + talentPierce, Math.trunc(Number(t?.apByLocation?.[location ?? "body"])) || 0)
      : (damage.penetration ?? 0) + promisedPierce + talentPierce,
    ward: damage.school ? (t?.wardBySchool?.[damage.school] ?? 0) : 0,
    // What an ally's aura adds after the Ward, on a magical blow (04's
    // Avenging Bulwark, D-755). `resolveDamage` takes it on that lane alone.
    schoolArmor: damage.school ? (t?.schoolArmor?.[damage.school] ?? 0) : 0,
    immune: t?.immune ?? [],
    vulnerable: t?.vulnerable ?? [],
    // A Signature's *damage is doubled before Ward is subtracted* (08 §20,
    // D-692). It is the mitigation's own multiplier and never a Rating bonus,
    // because 08 §6's grammar only adds and adding lands after the SL.
    multiplier: damage.multiplier ?? 1,
    // The blow's second amounts, each met by the target's own type (D-777).
    extras: [...typedExtras,...bonus.extras], wardBySchool: t?.wardBySchool ?? {}, schoolArmorBySchool: t?.schoolArmor ?? {},
    dealtHalved: halvedBy
  }, { shrink });
  };
  const hit = Boolean(damage) && outcome.success;
  if (hit && halvedBy) roll.options.provenance.push({ label: halvedBy.source, value: null, formula: game.i18n.localize("AZEROTH.HalvesDealt.Row") });
  const damageByTarget = list.map((t,index) => (hit ? mitigate(t,index) : null));
  const damageResult = hit ? (damageByTarget[0] ?? mitigate(first)) : null;

  // Momentum on a hit (05 SS11, D-627): every pool the actor holds gains by
  // its own trigger, in a started fight, on a successful Attack Test - a
  // hit absorbed to nothing included. The off hand builds none, and so does
  // a feature that says so. Opening's trade is the card's button.
  let momentumGained = [];
  let opening = false;
  if (fight && outcome.success && gainsMomentum) {
    const combatant = fight.getCombatantsByActor(actor)?.[0] ?? null;
    if (combatant) {
      const mark = actor.getFlag?.("azeroth-rpg", "mark") ?? null;
      const againstMark = Boolean(mark && first && ((first.tokenId && mark.tokenId === first.tokenId) || (first.actorId && mark.actorId === first.actorId)));
      // Ferocity builds in a SHAPESHIFT form alone (02 §7; D-251, D-769).
      const inForm = actor.inShapeshiftForm === true;
      // A Fast weapon's point, once a round (08 §5): the round flag says whether it was had.
      const roundFlag = combatant.getFlag("azeroth-rpg", "round") ?? {};
      const fastDue = (weaponEffects?.fastMomentum ?? 0) > 0 && !(roundFlag.number === fight.round && roundFlag.fast);
      // **A FURTHER GAIN INTO ONE POOL** (04's Primal Fury: *Once during your
      // turn, if an Attack Test you make in a Shapeshift form meets or exceeds
      // SL 2, gain 1 further Ferocity per rank*; D-771). On the attacker's own
      // turn, off the hand that strikes (06 §2), and once: the round's record is
      // marked through the queued door before the gain, and a mark another door
      // spent first leaves this one without it.
      const roundBefore = combatant.getFlag("azeroth-rpg", "round") ?? {};
      const usedOnce = roundBefore.number === fight.round ? (roundBefore.once ?? []) : [];
      // **WHAT IS TRUE OF THIS BLOW** (D-773), measured here and handed to the
      // rows that ask: made while hidden (Shadow Focus, Waylay), the attack's own
      // Critical Injury (Seal Fate), and damage dealt to a creature already
      // Bleeding (Blood Sport).
      const facts = {
        // And what a Legacy's gate reads (doors 15, 17): Run to Ground's *a target
        // that is Slowed, Entangled or Stunned*, Bloodied Blade's wield gates.
        ...gateFacts,
        hidden: hiddenAtRoll,
        critical: outcome.critical === true && !parry,
        bleedingDealt: hit && list.some((t, i) => (t?.statuses ?? []).includes("bleeding") && (damageByTarget[i]?.damage ?? 0) > 0)
      };
      // An off hand that builds is read as any other hand (04's Axe and Hammer; door 26).
      const further = !momentumOffHand && combatant.isOwner
        ? momentumOnHitFor(actor.takenTalents(), { sl: outcome.sl, form: inForm, onTurn: fight.combatant?.id === combatant.id, used: usedOnce, facts })
        : { byPool: {}, fired: [] };
      const poolExtra = { ...further.byPool };
      const furtherGiven = [];
      // **04's CHEAP SHOT AT RANK 2** (*that attack builds 1 Combo Point without
      // spending Energy*; D-773): an attack made while hidden, against a target
      // that has not seen it, builds its point free - in place of 02's paid trade
      // (MY READING), so the card offers no trade beside it.
      const unseenCombo = hiddenAtRoll && !offHand && actor.hasFeature?.("Opening") ? unseenComboFor(talentsHeld) : { amount: 0, name: null };
      if (unseenCombo.amount > 0) {
        poolExtra.comboPoints = (poolExtra.comboPoints ?? 0) + unseenCombo.amount;
        furtherGiven.push({ name: unseenCombo.name, pool: "comboPoints", amount: unseenCombo.amount });
      }
      for (const f of further.fired) {
        // *Once a round* (Aimed Volley, Shadow Focus) is marked on the same
        // record as Primal Fury's *once during your turn*.
        if (f.once === "turn" || f.once === "round") {
          // **NOT SPENT ON A HIT THAT GAINS NOTHING** (D-779; the lead, 2026-10-03,
          // on O-171: *"No."*): a pool already full - or filled by 05's own gain -
          // keeps the once for a later hit (`momentum.mjs#furtherGains`).
          const gainArgs = { pools: actor.poolSnapshot?.() ?? [], sl: outcome.sl, offHand: momentumOffHand, againstMark, inForm, extra: fastDue ? weaponEffects.fastMomentum : 0, always: signatureMomentum, poolExtra };
          if (!furtherGains(gainArgs, f.pool, f.amount)) {
            poolExtra[f.pool] = Math.max(0, (poolExtra[f.pool] ?? 0) - f.amount);
            continue;
          }
          const marked = await combatant.markRoundOnce(f.identifier);
          if (!marked?.added) {
            poolExtra[f.pool] = Math.max(0, (poolExtra[f.pool] ?? 0) - f.amount);
            continue;
          }
          // The once this hit spent, given back if the hit is withdrawn (door 13).
          onceMarkedOnHit.push(f.identifier);
        }
        furtherGiven.push(f);
      }
      // A Signature's own point rides `always` and NOT `extra` (Dal'Rend's
      // Sacred Charge, D-696): 06 §2 refuses an off-hand blow every other kind
      // of Momentum, and this Signature names the off hand as the thing it pays
      // for. The row's once-a-round mark was already spent above, so anything
      // still on `fired` is due.
      momentumGained = gainOnHit({ pools: actor.poolSnapshot?.() ?? [], sl: outcome.sl, offHand: momentumOffHand, againstMark, inForm, extra: fastDue ? weaponEffects.fastMomentum : 0, always: signatureMomentum, poolExtra });
      // A row naming a POWER pool returns into it (04's Aimed Volley, D-773):
      // 05's gain reaches the Momentum pools alone.
      const powerBack = powerReturns(actor.poolSnapshot?.() ?? [], poolExtra);
      for (const f of furtherGiven) {
        if (momentumGained.some(g => g.name === f.pool) || powerBack.some(g => g.name === f.pool)) {
          roll.options.provenance.push({ label: f.name, value: null, formula: game.i18n.format("AZEROTH.Card.FurtherMomentum", { n: f.amount, pool: game.i18n.localize(AZEROTH.poolTypes[f.pool] ?? f.pool) }) });
        }
      }
      if (momentumGained.length) await actor.updatePool(momentumGained.map(g => ({ itemId: g.itemId, kind: g.kind, value: g.value })));
      if (powerBack.length) await actor.updatePool(powerBack.map(g => ({ itemId: g.itemId, kind: g.kind, value: g.value })));
      // What the hit built on the striker, for a withdrawal to take back (door 13).
      recordBuilt(actor, momentumGained);
      recordBuilt(actor, powerBack);
      if (fastDue && momentumGained.length) roll.options.provenance.push({ label: "AZEROTH.Card.FastMomentum", value: null, formula: `+${weaponEffects.fastMomentum}` });
      if (signatureMomentum && momentumGained.length) {
        roll.options.provenance.push({ label: "AZEROTH.Card.SignatureMomentum", value: null, formula: `+${signatureMomentum}` });
      }
      if (combatant.isOwner) {
        const round = combatant.getFlag("azeroth-rpg", "round") ?? {};
        const sameRound = round.number === fight.round;
        if (!round.struck || (fastDue && !offHand && momentumGained.length)) {
          await combatant.setFlag("azeroth-rpg", "round", { ...(sameRound ? round : {}), number: fight.round, struck: true, fast: (sameRound && round.fast) || (fastDue && !offHand && momentumGained.length > 0) });
        }
        if (!momentumOffHand) await combatant.setFlag("azeroth-rpg", "lastHitRound", fight.round);
        // The Fast point this hit had, given back with the hit (door 13).
        fastMarkedOnHit = fastDue && !offHand && momentumGained.length > 0;
      }
      if (onceMarkedOnHit.length || fastMarkedOnHit) {
        onceOnMiss = { combatantUuid: combatant.uuid, round: fight.round, once: [...onceMarkedOnHit].sort(), fast: fastMarkedOnHit };
      }
      // 02's Opening trade, through the one reading the dialog and Garrote ask
      // (`AzerothActor#openingState`, D-773): a target not yet acted, or one a
      // talent puts under it - and not where Cheap Shot built the point free.
      opening = (actor.openingState?.(first, { hidden: hiddenAtRoll })?.applies === true) && !(unseenCombo.amount > 0);
    }
  }
  // **SHARED QUARRY AT RANK 2** (04: *its hits build Quarry for you as well*;
  // D-773): a companion's hit on its owner's marked target builds the owner's
  // Quarry as the owner's own hit would (02 §7), in the owner's fight. Written
  // where this client may write the owner - the companion's controller is the
  // Ranger's player - and said on the card.
  if (companionOwner && outcome.success && gainsMomentum && !offHand && companionOwner.activeFight?.()) {
    const shared = companionQuarryFor(ownerTalents);
    if (shared && companionOwner.isOwner) {
      const ownerMark = companionOwner.getFlag?.("azeroth-rpg", "mark") ?? null;
      const quarryBuilt = gainOnHit({ pools: (companionOwner.poolSnapshot?.() ?? []).filter(p => p.name === "quarry"), sl: outcome.sl, againstMark: namesTarget(ownerMark, first) });
      if (quarryBuilt.length) {
        await companionOwner.updatePool(quarryBuilt.map(g => ({ itemId: g.itemId, kind: g.kind, value: g.value })));
        recordBuilt(companionOwner, quarryBuilt);
        roll.options.provenance.push({ label: shared.name, value: null, formula: game.i18n.format("AZEROTH.Card.SharedQuarry", { n: quarryBuilt[0].gained, name: companionOwner.name }) });
      }
    }
  }
  // **HALF THE BLOW ON A SECOND ENEMY** (04's Blade Flurry, D-773): a button
  // where the blow dealt damage and the round's record still holds a mark; the
  // press names the second creature and is judged again.
  let blowShare = null;
  const flurry = kind === "attack" && !parry && hit && (damageResult?.damage ?? 0) > 0 ? blowShareFor(talentsHeld) : null;
  if (flurry) {
    const mine = fight ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
    const round = mine?.getFlag("azeroth-rpg", "round") ?? {};
    const used = mine && round.number === fight.round ? (round.once ?? []) : [];
    const half = halfShare(damageResult.damage);
    if (half > 0 && (!mine || nextRoundMark(flurry.identifier, flurry.count, used) !== null)) {
      blowShare = { identifier: flurry.identifier, name: flurry.name, count: flurry.count, feet: flurry.feet, half };
    }
  }
  // **A STEP OFF A BLOW THAT MISSED** (04's Elusive: *When an attack against you
  // misses or deals no damage*; D-773): a button for each target holding the
  // talent, shown to that target's owner alone.
  const evades = [];
  if (kind === "attack" && !parry) {
    list.forEach((t, i) => {
      const victim = targetActorOf(t);
      const ev = victim ? evadeFor(victim.takenTalents()) : null;
      if (!ev) return;
      const nothing = !outcome.success || (Boolean(damage) && (damageByTarget[i]?.damage ?? 0) === 0);
      if (nothing) evades.push({ actorUuid: victim.uuid, name: t?.name ?? victim.name, talent: ev.name, cost: ev.cost, feet: ev.feet });
    });
  }

  // **THE OFF HAND RIDES THIS BLOW** (06 §1, D-711): *when you Attack with the
  // weapon in your main hand you may also make one attack with the weapon in
  // your off hand. It costs no Half-Action.* The moment it is free is the
  // moment this card exists, so the button belongs here - the weapon row's
  // context menu is still the other door, and it is the only one outside a
  // turn. It is drawn on a hit and a miss alike, because the off hand rides the
  // ATTACK rather than the result, and the door re-checks the budget at the
  // press: a card is a record of a moment (D-693).
  //
  // **AN ATTACK THAT PAID FOR ITSELF IS THE ONLY THING TO RIDE**, so a blow
  // bought with a Reaction draws no button: an Opportunity Attack is struck on
  // somebody else's turn and 06 gives the off hand *in a turn in which you
  // Attack*. `budget: "none"` also covers the second roll of an Extra Attack,
  // which would otherwise offer the same strike twice on one Half-Action.
  //
  // **AND ONLY IN THE ATTACKER'S OWN TURN** (06 §1: *in a turn in which you
  // Attack*). Out of a fight there is no turn to be in and the button stands;
  // in one, a blow struck when the fight is standing on somebody else draws
  // none. `spend` refuses it at the press as well - the button is the door and
  // the budget is the rule - but a control nobody may use should not be drawn.
  const paidForItself = budget !== "none" && budget !== "reaction";
  const myTurn = !fight || (fight.getCombatantsByActor?.(actor) ?? []).some(c => c.id === fight.combatant?.id);
  // **WHAT IS IN THE OFF HAND IS READ THROUGH `readyWeapons`** (D-769): a
  // weapon melded into a shape is in no hand, so a shifted Druid's blow offers
  // no off-hand strike.
  const offHandWeapon = kind === "attack" && !parry && !offHand && paidForItself && myTurn
    ? ((actor?.readyWeapons?.() ?? []).find(i => i?.id && i.system?.offHand === true) ?? null)
    : null;
  // **AN EXTRA ATTACK OFF THIS CARD** (04's Flurry: *Once a round, when an
  // attack reaches SL 2, make one extra attack against the same target*; Wide
  // Swing's Cleave at SL 3, *one attack against another target within reach at
  // Damage Rating −2*; D-772): a button where the blow reached the SL and the
  // round's record still holds one, struck with the same weapon.
  const extraStrikes = kind === "attack" && !parry && weaponId && outcome.success
    ? extraStrikeOffers(actor, { talents: talentsHeld, sl: outcome.sl, traits: (traits ?? []).map(t => t?.name ?? t), fight, weaponId })
    : [];

  const foresightOffered = Boolean(kind === "attack" && !parry && outcome.success && damageResult
    && list.length && foresightHeld(fight));
  const content = await renderTemplate(TEMPLATE.roll, {
    config: AZEROTH,
    kind,
    title: title || game.i18n.localize("AZEROTH.Card.Test"),
    subtitle,
    total: roll.total,
    // THE DIE ITSELF. The card printed the total and never the face, so a
    // reader could not tell a 19 plus 1 from a 4 plus 16 - nor see a Boon's
    // kept die at all (the lead, 2026-09-07).
    natural: roll.natural ?? null,
    modifier: roll.natural === null || roll.natural === undefined ? null : roll.total - roll.natural,
    dc,
    sl: outcome.sl,
    success: outcome.success,
    verdict: verdictFor(outcome, { attack: kind === "attack" && !parry }),
    critical: outcome.critical,
    fumble: outcome.fumble,
    location,
    calledShotCost: shot.banes
      ? game.i18n.localize("AZEROTH.Card.CalledShotBane")
      : null,
    damage: damageResult
      ? {
          final: damageResult.damage,
          // WHAT KIND OF DAMAGE THIS WAS, in words on the card (08 §7, the
          // lead's item 26). It reached the mitigation and stopped there, so a
          // Greater Flaming blade and a mace printed the same line.
          // And every second amount's own type beside it (D-777): *Physical + Nature*.
          type: damageTypeWords(damageResult),
          explanation: damageExplanation(damageResult, { ...damage, rating: attackRating, penetration: (damage.penetration ?? 0) + promisedPierce + talentPierce }, outcome.sl, {
            // A hit at an SL that ignores Armor Points says so, naming the talent (the B1 review).
            ignoresArmor: slIgnoresArmor ? slDamage.filter(r => r.ignoresArmor === true).map(r => r.name).join(", ") : null
          })
        }
      : null,
    targets: list.map((t, index) => ({ ...t, index, damage: damageByTarget[index]?.damage ?? null })),
    // The off-hand blow this Attack carries (06 §1, D-711).
    offHandStrike: offHandWeapon ? { id: offHandWeapon.id, name: offHandWeapon.name } : null,
    // The extra attacks a talent offers off this blow (D-772).
    extraStrikes,
    // Half the blow on a second enemy (04's Blade Flurry, D-773), and a
    // defender's step off a blow that missed (Elusive).
    blowShare,
    evades,
    // Ancestral Guidance's heal on a friend beside the shaman (D-774).
    guidance: guidance ? { ...guidance, label: game.i18n.format("AZEROTH.Guidance.Button", { name: guidance.name, n: guidance.heal, feet: guidance.feet }) } : null,
    // The shot fired and what the bundle has left (D-641).
    shot: fired0 ? { name: fired0.name, remaining: fired0.remaining } : null,
    // The traits defined (D-649), as the caller resolved them.
    traits,
    // The Effect traits the roll fired (08 §5, 2026-09-06), with a condition to lay where one names it.
    fired: fired.map(f => ({
      key: f.key, name: f.name,
      // A ROW MAY CARRY ITS OWN SENTENCE (08 §20, D-692). An Effect trait is
      // one of eleven and takes its localised line; a Signature is one of 288
      // different sentences, and `AZEROTH.Trait.Fired.signature` would print
      // the same words under every one of them. `signatureEffects` puts the
      // item's own prose on the row.
      text: f.text || game.i18n.localize(`AZEROTH.Trait.Fired.${f.key}`),
      // **A VALUE TAKEN OFF THE DAMAGE** (Sulfuron Hammer's *Scorched equal to
      // half the damage dealt, rounded down*, 08 SS20; D-696). It cannot be
      // known until the mitigation has run, so the DIVISOR travelled on the row
      // and the number is worked out here, against what actually arrived. A
      // blow small enough that half of it rounds to nothing leaves NO button,
      // because *Scorched 0* is not a condition.
      condition: firedCondition(f, damageResult),
      // Sundering breaks armor on the Critical Injury (08 §5, D-691): the same
      // Sundered effect the maneuver lays, from the trait's own button.
      sunder: f.sunder ?? null,
      // A Bane on the TARGET's next Attack Test (Frightalon, The Cruel Hand of
      // Timmy; 08 §20). It fired as a row and wrote nowhere until 06 §6's
      // carrier existed (D-693); now it is a button like the condition beside it.
      bane: f.bane ?? null,
      // A tick poison's Test (08 §12, O-114; D-770): a button per target, and
      // a failure lays the ticks the card carries under `poisons`.
      poison: f.poison ?? null,
      // A companion's hit forcing a Test (04's Intimidation, D-773): a button
      // per target at the owner's Spell DC; a failure lays the Bane.
      intimidate: f.intimidate ?? null,
      // **HEALING THAT LANDS ON SOMEBODY ELSE** (Lawbringer Armor, D-698). A
      // row with no distance is the bearer's own and was already paid above;
      // one with a distance is a button, because the creature within fifteen
      // feet is the table's to name.
      allyHeal: f.healFeet ? { n: f.heal, feet: f.healFeet } : null
    })),
    // WHAT THE BLOW THAT LANDED ANSWERS BACK (08 SS20, D-692): the target's own
    // whenStruck Signature, on a HIT and never on a miss, with its damage and
    // its condition landing on the ATTACKER - which is what `data-self` on the
    // card's two existing buttons means.
    //
    // **A ROW MARKED `melee` ANSWERS A MELEE BLOW ALONE** (07's Immolation,
    // D-757: *hits you with a melee attack*), judged here because the dialog's
    // Strike select may have moved a Dagger from the hand to a throw. A blow
    // whose way was never recorded is left to the table, and shows it.
    struckBack: (kind === "attack" && outcome.success ? struckBack : [])
      .filter(row => row.melee !== true || (strike?.rangeKind ?? "melee") === "melee")
      .map(row => ({
        name: row.name,
        text: row.text,
        target: row.target ?? "",
        // The row of the card it answers (the B1 review): a hit turned into a miss
        // is answered by nothing.
        index: Number.isInteger(row.index) ? row.index : null,
        signatureRetaliation: row.signatureRetaliation ?? null,
        damage: row.damage?.amount ?? null,
        // The kind the blow back is, so 14's Regeneration can withhold (D-691).
        damageType: row.damage?.type ?? null,
        condition: row.condition?.id
          ? {
              id: row.condition.id,
              value: row.condition.value ?? null,
              until: row.condition.until ?? null,
              label: game.i18n.localize(AZEROTH.conditions[row.condition.id] ?? row.condition.id)
            }
          : null
      })),
    // WHAT A BLOW THAT FINISHES A CREATURE DOES (Gorehowl, 08 SS20). A kill is
    // not a hit, so this is never a fired row: it is the sentence the table
    // reads if the blow drops the target, printed on a successful attack.
    //
    // **IT HAS A BUTTON NOW** (D-693). It had none because the only payload in
    // the packs is a Bane on somebody else's next Test and nothing in this
    // system carried one; 06 SS6's Pummel needed the same carrier and both have
    // it. WHO takes it is still the table's - *every enemy within 30 feet that
    // saw it* - so the button reaches the selected tokens, as every other
    // multi-target button on a card does.
    onKill: (kind === "attack" && outcome.success ? (weaponEffects?.onKill ?? []) : []).map(row => ({
      name: row.name,
      text: row.text,
      feet: row.feet ?? null,
      bane: row.bane ?? null
    })),
    // WHAT THE DEFENDER MAY ANSWER WITH (06 SS6, D-693). Parry and Block are
    // the two Reactions a card can offer, and they only mean anything against a
    // blow that landed and deals damage - a Parry of a miss is nothing. The
    // rows carry the target they belong to, and `dice/chat.mjs` shows each one
    // only to whoever owns that creature.
    // **AND A PARRY ANSWERS A MELEE BLOW** (D-779; the lead, 2026-10-03, on O-180:
    // *"Parry is limited to melee unless a feature allows ranged parry."*): a ranged
    // or thrown blow keeps a defender's Parry only where 04's Anticipation reaches it
    // (`parryOffered`), and a row left with neither button goes.
    reactions: (kind === "attack" && !parry
      ? outcome.success && damageResult ? parryOffered(reactions, { actor, list, strike, unanswerable: promised?.unanswerable === true })
        : (reactions ?? []).filter(row => row.phaseShift).map(row => ({ ...row, block: null, parry: null, negate: null }))
      : []),
    // **A WARD PRESSED FROM THIS CARD** (04's Foresight; the lead, 2026-10-03, on
    // O-181: *"Yes"*; D-779): a blow that landed offers a priest holding the
    // talent 02's Ward on each creature struck - shown to that priest's owner alone
    // (`dice/chat.mjs`) and offered only where such a priest exists.
    foresight: foresightOffered
      ? list.map((t, index) => ({ index, name: t?.name ?? "" }))
      : [],
    // *Parry cannot be used against an attack you cannot see, and neither can
    // Block.* The table's judgement (D2 SS12), so it is a line and never a
    // refusal - nothing here knows what a creature can see.
    reactionNote: game.i18n.localize("AZEROTH.Reaction.Unseen"),
    // Unreliable on a natural 1 (08 §5): damaged until repaired.
    unreliable: outcome.fumble && weaponEffects?.unreliable === true,
    // The Form traits the table applies, named on the card.
    traitNotes: (weaponEffects?.notes ?? []).map(n => ({ name: n.name, text: game.i18n.localize(`AZEROTH.Trait.Note.${n.key}`) })),
    // 06 §8's first trigger: a natural 20 ON AN ATTACK. `outcome.critical` is
    // set by any natural 20, so the kind is part of the condition - a critical
    // Athletics Test does not break a rib.
    // A swarm has no Critical Injury table (13 §4, D-646): none on it, none
    // rolled by it.
    criticalInjury: kind === "attack" && !parry && outcome.critical && actor?.system?.isSwarm !== true && !list.some(t => t?.swarm),
    momentumGained: momentumGained.map(g => ({ label: game.i18n.localize(AZEROTH.momentumTypes[g.name] ?? g.name), gained: g.gained })),
    opening,
    provenance: roll.provenance
  });

  // Which spell card's row a Resilience Test answered (D-726): nine keys and
  // nothing a caller slipped in beside them, and only on a Resilience card.
  const resisted = kind === "resilience" ? resistLink(resistOf ?? {}) : null;

  // Phase Shift and Apply must agree on whether this new attack has landed.
  // Freeze document identities; an older card without this record is unknown.
  const phaseTargets = kind === "attack" && !parry ? list.map(t => targetActorOf(t)) : [];
  // Jangthraze's optional reward is offered only after this hit is confirmed.
  // Ordinary targets need the same Apply/Parry receipt as Phase Shift targets.
  const hitUseWeapon=kind==='attack'&&!parry?actor?.items?.get(weaponId):null;
  const hitUseReceipt=hitUseWeapon?.system.identifier==='jangthraze-the-protector'
    &&hitUseWeapon.system.signatureEffect?.kind==='onHit'
    ||kind==='attack'&&!parry&&(hitUseWeapon?.type==='weapon'||Number.isInteger(strike?.row?.index))&&strike?.rangeKind==='melee'&&actor.items.some(item=>
      item.system.identifier==='horned-viking-helmet'&&item.system.equipped===true&&item.system.signatureEffect?.kind==='onHit');
  // A defensive Sustain can begin after publication but before Apply. Give
  // every resolved targeted attack the durable claim needed at that moment.
  const attackResolution = hitUseReceipt || foresightOffered || (phaseTargets.length>0&&phaseTargets.every(target=>target?.uuid)) || phaseTargets.some(target => target?.type === "npc"
    && target.system?.creatureAbilities?.some(ability => ability.name === "Phase Shift"))
    ? attackResolutionSeed(phaseTargets.map(target => target?.uuid), { damageRevealed: !foresightOffered }) : null;

  if(!valid())throw Error('Signature hit authorization changed before publication');
  reloadMessage = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    // Maim draws the Critical Injury on the Limb table whatever the blow struck (08 §5).
    flags: { "azeroth-rpg": { kind, location: criticalLocation ?? location, struck: location, damage: damageResult, targets: list, damageByTarget, momentumSpent, offHand,
      hiddenAtRoll,
      // 04's False Opening (stage 3A): this attack took the promise no Parry or Block answers.
      ...(promised?.unanswerable === true ? { unanswerable: true } : {}),
      ...(unreliableMarker?{unreliableWeapon:unreliableMarker}:{}),
      signatureRetaliations: (kind==='attack'&&outcome.success&&(strike?.rangeKind??'melee')==='melee'?struckBack:[])
        .filter(row=>row.signatureRetaliation&&Number.isInteger(row.index)).map(row=>({...row.signatureRetaliation,index:row.index})),
      ...(receipt?{signatureHitBonuses:receipt}:{}),
      ...(attackResolution ? { attackResolution } : {}),
      ...(reloadReservation ? {reloadShot:{shotId:reloadReservation.shotId,weaponUuid:reloadInfo.weapon.uuid}} : {}),
      // WHAT KIND OF DAMAGE THIS WAS (D-691). It reached the mitigation and
      // stopped there, so nothing downstream could tell Fire from a mace -
      // which is what 14's Regeneration asks.
      damageType: damage?.school ?? (damage?.kind === "physical" ? "physical" : null),
      ammunition: fired0,
      // The tick poisons the blow landed (O-114, D-770), each laid tick as it
      // was stamped, for the Test's button to lay on a failure.
      ...(poisons.length ? { poisons } : {}),
      // The extra attacks this blow offered (D-772), as the press reads them.
      ...(extraStrikes.length ? { extraStrikes: extraStrikes.map(x => ({ identifier: x.identifier, name: x.name, count: x.count, target: x.target, rating: x.rating, weaponId: x.weaponId })) } : {}),
      // **WHAT THE RANGER'S AND THE ROGUE'S PRESSES READ** (D-773): the blow was
      // 06 §7's Riposte (Killing Spree, at the damage door), Intimidation's
      // Banes, Blade Flurry's half, and the defenders Elusive lets step away.
      ...(riposte === true ? { riposte: true } : {}),
      // What the blow landed with no button pressed, by target (D-779): a Parry that
      // holds takes it back off (`applications/actions.mjs#parryNow`) - and, since the
      // Legacy branches' door 13, everything else the hit laid, and what it was paid.
      ...(landedOnHit.length ? { landedOnHit } : {}),
      ...(refundOnMiss.length ? { refundOnMiss } : {}),
      // And the Momentum the hit built, with the once-marks its further gains spent (the
      // lead: *"Yes, take it back"*), taken back once the card hits nobody.
      ...(builtOnHit.length ? { momentumOnMiss: builtOnHit } : {}),
      ...(onceOnMiss ? { onceOnMiss } : {}),
      ...(intimidations.length ? { intimidations } : {}),
      ...(blowShare ? { blowShare } : {}),
      ...(evades.length ? { evades } : {}),
      // Ancestral Guidance's heal, its presses counted on the message (D-774).
      ...(guidance ? { guidance } : {}),
      momentumGained: momentumGained.map(g => ({ name: g.name, gained: g.gained })),
      // WHO ACTED, WITH WHAT, AND WHAT IT ANSWERED (D-724, D-725). `source` is
      // on every card and null where nobody could be named; `parry` is what
      // tells a reader this Attack Test was not an attack.
      source: source ?? null,
      ...(kind === "attack" && strike ? { strike } : {}),
      // **WHAT ELSE DREW THE BLOW, AND WHAT IT CARRIED** (the Legacy branches' door
      // 2): the feature card it was made from, the bound attack patches that shaped
      // it (04's Serpent Ward on the Searing totem), and the riders ridden with it -
      // whatever the die said, since a miss is the animation layer's word to say.
      ...(kind === "attack" && !parry ? attackRecords({ actor, fromFeature, riderRows }) : {}),
      ...(parry ? { parry: true } : {}),
      // **`answers` IS A RECORD WITH NO READER YET, AND DELIBERATELY SO**
      // (D-724). Nothing in `module/` or `templates/` reads it: the
      // animation layer needs only `parry` to refuse a Parry Test, and the
      // card it answered is already the card the button was pressed on. It
      // is here for the same reason `damageByTarget` is - a card is the
      // only record of a moment, and *which blow this Parry answered* is a
      // fact nothing else in the world will hold once the log is cleared.
      // A Quench assertion is its only consumer; that is not an oversight.
      ...(answers ? { answers } : {}),
      // And which spell card's row a Resilience Test answered (D-726), which is
      // what lets the record on that card be built from THIS card's roll.
      ...(resisted ? { resistOf: resisted } : {}),
      ...(kind === "resilience" && AZEROTH.resiliences[resilience] ? { resilience } : {}) } }
  });
  return reloadMessage;
  };
  const publishedAttack = kind==='attack'&&!parry&&damage&&outcome.success
    ? await routeSignatureHit({actor,roll,weaponId,idolSource:signatureTarget.idolSource,bandSource:signatureTarget.bandSource,bladeSource:signatureTarget.bladeSource,targets:list,targetIndex:signatureTarget.index,publish:publishAttackCard})
    : await publishAttackCard();
  if(unreliableMarker)await recordUnreliableDamage(publishedAttack);
  if (kind === "attack" && !parry && outcome.success && strike?.rangeKind === "melee")
    await offerChiliReaction({actor, message: publishedAttack});
  return publishedAttack;
  } finally {
    if (reloadReservation) {
      const result = reloadMessage || !reloadPaymentStarted
        ? await requestReloadShot(reloadInfo.weapon, {reservation:reloadReservation,
          ...(reloadMessage ? {messageUuid:reloadMessage.uuid} : {cancel:true})}, true)
        : {ok:false};
      if (!result.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Reload.Pending"));
    }
  }
  } finally {
    if (!equipmentRolled) await finishEquipmentTest(actor,equipmentClaim,{rolled:false});
    if (!equipmentRolled) await finishProvisionTest(actor,provisionClaim,{rolled:false});
  }
}

/**
 * **THE EXTRA ATTACKS A CARD OFFERS** (04's Flurry and Wide Swing, D-772): the
 * talents the blow reached, each only where the round's record still holds one
 * of its marks (`class-talents.mjs#nextRoundMark` over the combatant's `once`
 * list). Out of a fight there is no round to count and every one is offered.
 *
 * @param {Actor} actor
 * @param {{talents: Array, sl: number, traits: string[], fight: Combat|null, weaponId: string}} o
 * @returns {Array<{identifier: string, name: string, count: number, target: string, rating: number, weaponId: string, label: string}>}
 */
function extraStrikeOffers(actor, { talents, sl, traits, fight, weaponId }) {
  const offered = extraStrikesFor(talents, { sl, hit: true, traits });
  if (!offered.length) return [];
  const combatant = fight ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
  const round = combatant?.getFlag("azeroth-rpg", "round") ?? {};
  const used = combatant && round.number === fight.round ? (round.once ?? []) : [];
  return offered
    .filter(x => !combatant || nextRoundMark(x.identifier, x.count, used) !== null)
    .map(x => ({
      ...x, weaponId,
      label: game.i18n.format(x.target === "other" ? "AZEROTH.ExtraStrike.Other" : "AZEROTH.ExtraStrike.Same", { name: x.name, rating: x.rating })
    }));
}

/**
 * **RECKLESS'S EXPOSURE, ON THE STRIKER** (04: *Until your next turn, attacks
 * against you gain one too. At rank 2 only ranged attacks do*; D-772): one
 * effect, keyed on the striker's own next turn, flagged for the attacker's
 * dialog to read (`rules/class-talents.mjs#exposedBoonsOn`) and carrying no
 * change - a Boon is dice (CLAUDE.md §6). A second attack replaces the first.
 * Nothing out of a fight, where no next turn would end it.
 *
 * @param {Actor} actor
 * @param {{name: string, exposed: {boons: number, ranged: boolean}}|null} reckless
 * @returns {Promise<{name: string, ranged: boolean}|null>}
 */
async function layExposure(actor, reckless) {
  if (!actor?.isOwner || !reckless || !(reckless.exposed?.boons > 0)) return null;
  const span = untilNextTurn(actor);
  if (!span) return null;
  // Reckless's OWN exposure only (D-811): a Sell Them Out mark or a Named Quarry laid on this
  // creature by somebody else is theirs, and a Reckless swing used to wipe it.
  const stale = actor.effects.filter(e => e.getFlag("azeroth-rpg", EXPOSED_FLAG)?.source === reckless.name).map(e => e.id);
  if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: game.i18n.format("AZEROTH.Reckless.EffectName", { name: reckless.name }),
    img: "icons/svg/target.svg",
    origin: actor.uuid,
    description: `<p>${game.i18n.localize(reckless.exposed.ranged ? "AZEROTH.Reckless.ExposedRanged" : "AZEROTH.Reckless.Exposed")}</p>`,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    ...span,
    flags: { "azeroth-rpg": { [EXPOSED_FLAG]: { boons: reckless.exposed.boons, ranged: reckless.exposed.ranged === true, source: reckless.name } } }
  }]);
  return { name: reckless.name, ranged: reckless.exposed.ranged === true };
}

/**
 * The condition a fired row leaves, with a value taken off the damage where the
 * row asks for one (Sulfuron Hammer, 08 SS20; D-696).
 *
 * `conditionFromDamage` is the DIVISOR, so 2 is *half the damage dealt, rounded
 * down*, and the arithmetic waits for `resolveDamage` because *the damage
 * dealt* is what arrived rather than what was rolled. A row whose value works
 * out at nothing returns null and the card draws no button at all.
 */
function firedCondition(f, damageResult) {
  if (!f.condition?.id) return null;
  const label = game.i18n.localize(AZEROTH.conditions[f.condition.id] ?? f.condition.id);
  if (!f.conditionFromDamage) return { id: f.condition.id, value: f.condition.value ?? null, label };
  const value = Math.floor(Math.max(0, damageResult?.damage ?? 0) / f.conditionFromDamage);
  return value > 0 ? { id: f.condition.id, value, label } : null;
}

/**
 * Spend the once-a-round mark on every fired row that carries one, and DROP the
 * rows that have already had it this round (08 SS20's `onHit.per`; D-696).
 *
 * The mark is the combatant's own round flag, beside 08 SS5's Fast. Out of a
 * fight, or with the actor in none, there is no clock and every row stands -
 * the same ruling `spendTurnBudget` makes for an action.
 *
 * Mutates `fired` in place, because the caller reads its damage, its Momentum
 * and its rows out of the same array immediately afterwards.
 *
 * @param {Array<object>} fired
 * @param {{actor: Actor, fight: Combat|null}} o
 */
async function spendLimitedRows(fired, { actor, fight } = {}) {
  if (!fired.some(f => f.per)) return;
  const combatant = fight ? fight.getCombatantsByActor(actor)?.[0] ?? null : null;
  if (!combatant) return;
  const round = combatant.getFlag("azeroth-rpg", "round") ?? {};
  const sameRound = round.number === fight.round;
  const already = sameRound ? (round.signatures ?? []) : [];
  const held = [...already];
  for (let i = fired.length - 1; i >= 0; i--) {
    const row = fired[i];
    if (!row.per) continue;
    const id = `${row.key}:${row.name}`;
    if (held.includes(id)) fired.splice(i, 1);
    else held.push(id);
  }
  if (combatant.isOwner && held.length !== already.length) {
    await combatant.setFlag("azeroth-rpg", "round", { ...(sameRound ? round : {}), number: fight.round, signatures: held });
  }
}

/**
 * A one-line account of how the damage got to its number, and WHICH LANE took
 * the mitigation off (the lead's items 28 and 29).
 *
 * It used to print `5 + 2 − 3` with no word for the 3: a Ward read exactly
 * like Armor Points, and a Pierce that had already eaten two Armor Points was
 * invisible, because the card printed the REDUCED number. `explainDamage` is
 * the pure rule; the words are here.
 */
function damageExplanation(result, damage, sl, { ignoresArmor = null } = {}) {
  const e = explainDamage(result, { rating: damage.rating ?? 0, sl });
  if (e.immune) return game.i18n.localize("AZEROTH.Card.Immune");
  const sum = e.parts
    .map((p, i) => (i === 0 ? String(p.n) : `${p.sign === "-" ? "−" : "+"} ${p.n}`))
    .join(" ");
  const bits = [sum];
  if (e.vulnerable) bits.push(game.i18n.localize("AZEROTH.Card.Vulnerable"));
  else if (e.note?.kind === "ward") bits.push(game.i18n.format("AZEROTH.Card.VsWard", { ward: e.note.ward }));
  // **ARMOR POINTS IGNORED ARE SAID SO** (04's Critical Strike at rank 2: *ignores Armor
  // Points*; the B1 review): the Pierce was raised to the AP struck, and the card said
  // *(- Pierce N)* where the blow ignored the armor outright.
  else if ((e.note?.kind === "pierce" || e.note?.kind === "armor") && ignoresArmor) {
    bits.push(game.i18n.format("AZEROTH.Card.IgnoresAP", { ap: e.note.ap, source: ignoresArmor }));
  } else if (e.note?.kind === "pierce") {
    bits.push(`${game.i18n.format("AZEROTH.Card.VsAP", { ap: e.note.ap })} ${game.i18n.format("AZEROTH.Card.PierceNote", { pierce: e.note.pierce })}`);
  } else if (e.note?.kind === "armor") bits.push(game.i18n.format("AZEROTH.Card.VsAP", { ap: e.note.ap }));
  // An ally's aura after the Ward (D-755), named rather than folded in.
  if (e.schoolArmor) bits.push(game.i18n.format("AZEROTH.Card.VsAuraArmor", { ap: e.schoolArmor }));
  // And each second amount of its own type (D-777).
  const parts = partsWords(e.extras);
  if (parts) bits.push(parts);
  if (result.shrinkReduction) bits.push(game.i18n.format("AZEROTH.Gadget.ShrinkDamage", { n: result.shrinkReduction }));
  return bits.join(" · ");
}

/**
 * **THE BLOW'S SECOND AMOUNTS, IN WORDS** (D-777): each type, what landed of it
 * and what met it - *+ 1 Arcane*, *+ 0 Nature (Immune)*, *+ 2 Nature, vs Ward 1* -
 * off `mitigation.mjs#explainDamage`'s `extras`. Empty where the blow carries none.
 *
 * @param {Array<object>|undefined} extras
 * @returns {string}
 */
function partsWords(extras = []) {
  return (extras ?? []).map(p => {
    const type = game.i18n.localize(AZEROTH.damageTypes[p.type] ?? p.type ?? "");
    if (p.immune) return game.i18n.format("AZEROTH.Card.PartImmune", { type });
    if (p.vulnerable) return game.i18n.format("AZEROTH.Card.PartVulnerable", { n: p.n, type });
    if (p.ward) return game.i18n.format("AZEROTH.Card.PartWard", { n: p.n, type, ward: p.ward });
    if (p.armor) return game.i18n.format("AZEROTH.Card.PartArmor", { n: p.n, type, ap: p.armor });
    return game.i18n.format("AZEROTH.Card.Part", { n: p.n, type });
  }).join(" \u00b7 ");
}

/**
 * The blow's damage types in words (D-777): its own, and each second amount's
 * beside it - *Physical + Nature*.
 *
 * @param {object} result  what `resolveDamage` returned
 * @returns {string}
 */
function damageTypeWords(result = {}) {
  const types = [result?.type ?? "physical", ...(result?.parts ?? []).map(p => p.type)]
    .filter((t, i, all) => t && all.indexOf(t) === i);
  return types.map(t => game.i18n.localize(AZEROTH.damageTypes[t] ?? t)).join(" + ");
}

/* -------------------------------------------- */

/**
 * Cast a spell and post a card - 07 §2 in order.
 *
 *   1. The granting class (02 §10): the class whose schools hold the spell's
 *      school, else the first that casts. Its ability, its Mana, its Spell DC.
 *   2. Pay first (07 §8): the Mana off that class's pool, the Overchannel
 *      Health off the character, both before any die. A pool that cannot pay
 *      refuses the cast; an actor with no Mana pool at all - a creature - casts.
 *   3. The Casting Test: d20 + casting ability + Proficiency + Augment,
 *      against the target's Defense or 10 + 2 per tier (07 §2).
 *   4. The Success Level, plus one per Overchannel point, decides the riders
 *      and NEVER the damage (D-330): a spell deals its Rating, and Ward comes
 *      off both the SL and the damage (D-300).
 *   5. A Resist line where the spell forces one, at this class's Spell DC.
 *
 * Every input the dialog settles arrives as an argument; nothing is asked
 * for here.
 */
/**
 * In a started fight, the thing used spends its action off the turn's
 * budget (06 §6, D-255; the lead, 2026-09-06): a spell's Action line, a
 * feature's, a creature's ability's. Refused with the rule's reason where
 * the budget cannot pay, BEFORE anything else is spent, as the attack is
 * (D-630). Out of a fight, or with no action named, nothing is spent.
 * @param {Actor} actor
 * @param {string|null} action  An AZEROTH.actions key.
 * @returns {Promise<boolean>} Whether the use may go on.
 */
/**
 * **WHAT THE TURN'S BUDGET WOULD SAY, ASKED WITHOUT SPENDING** (the architect's
 * review of D-773): the refusal `spendTurnBudget` would give, or null, read off
 * the combatant's budget as it stands through the same pure `spend`. A door that
 * must open a dialog before it pays (02's Snare escape: the action is spent once
 * the Test is confirmed, so a dismissed dialog costs nothing) asks this first.
 *
 * @param {Actor} actor
 * @param {"half"|"action"|"full"|"reaction"|null} action
 * @returns {{reason: string, params: object}|null}
 */
export function turnBudgetRefusal(actor, action) {
  if (iceBlockFor(actor)) return { reason: "AZEROTH.IceBlock.Protected", params: {} };
  if (action === "reaction" && reactionBarred(actor)) return { reason: reactionBarReason(actor) ?? REACTION_BAR_REASON, params: { name: actor?.name ?? "" } };
  const projection = projectionRefusal(actor, "action");
  if (projection) return { reason: projection, params: {} };
  const sleeping = sleepRefusal(actor, "action");
  if (sleeping) return { reason: sleeping, params: {} };
  const despair = despairRefusal(actor, "action");
  if (despair) return { reason: despair, params: {} };
  const phaseShift = phaseShiftRefusal(actor, "action");
  if (phaseShift) return { reason: phaseShift, params: {} };
  const seduction = seductionRefusal(actor, "action");
  if (seduction) return { reason: seduction, params: {} };
  const cost = { half: "half", action: "action", full: "full", reaction: "reaction" }[action] ?? null;
  if (!cost) return null;
  // **A SPIRIT TAKES NO REACTION** (06 §10; the Legacy branches' door 10), in a fight or out.
  if (cost === "reaction" && realmRefusalFor(actor, "reaction")) return { reason: "AZEROTH.Spirit.Refuse.Reaction", params: { name: actor?.name ?? "" } };
  const fight = actor?.activeFight?.() ?? null;
  if (!fight) return null;
  const combatant = fight.getCombatantsByActor(actor)?.[0] ?? null;
  if (!combatant) return null;
  const judged = judgeSpend(combatant.budget, cost, { onTurn: combatant.isCurrentTurn });
  if (judged.ok) return null;
  // **A CONSTRUCT THE SHARED TURN REFUSES SAYS SO** (the B2 review): the escape, the
  // Snare's, Lightwell's and the blow doors' pre-checks gave it the generic *no
  // Half-Action left*, where `spendAction` says the constructs have spent it between them.
  const shared = combatant._sharedRefusal?.(cost, { onTurn: combatant.isCurrentTurn }) ?? null;
  if (shared) return { reason: shared, params: { name: combatant.name ?? "" } };
  return { reason: judged.reason, params: judged.params ?? {} };
}

export async function spendTurnBudget(actor, action) {
  if (action === "reaction" && reactionBarred(actor)) {
    ui.notifications?.warn(game.i18n.format(reactionBarReason(actor) ?? REACTION_BAR_REASON, { name: actor?.name ?? "" }));
    return false;
  }
  if (refuseAncientDespair(actor, "action")) return false;
  const cost = { half: "half", action: "action", full: "full", reaction: "reaction" }[action] ?? null;
  if (!cost) return true;
  // **A SPIRIT TAKES NO REACTION** (06 §10; the Legacy branches' door 10), in a fight or out.
  if (cost === "reaction") {
    const spirit = realmRefusalFor(actor, "reaction");
    if (spirit) {
      ui.notifications?.warn(spirit);
      return false;
    }
  }
  const fight = actor?.activeFight?.() ?? null;
  if (!fight) {
    const { interruptWhirlwindForAction } = await import("../effects/syndicate-whirlwind-use.mjs");
    if (!await interruptWhirlwindForAction(actor)) return false;
    const { interruptConsumeFor } = await import("../effects/consume-shadows-use.mjs");
    return interruptConsumeFor(actor);
  }
  const combatant = fight.getCombatantsByActor(actor)?.[0] ?? null;
  if (!combatant) return true;
  const spent = await combatant.spendAction(cost);
  return spent.ok;
}

export async function castSpell({
  actor,
  spell,
  sealingFlameClaim = null,
  attackTest = null,
  modifier = 0,
  dc = null,
  boons = 0,
  banes = 0,
  overchannel = 0,
  augment = 0,
  targets = null,
  provenanceExtra = [],
  // The Damage lines a talent put on the dialog and the roller left ticked
  // (04, D-711 phase 2). The spell lane, read exactly as the attack lane is.
  extraRating = 0,
  damageRows = [],
  // An item casting (D-633): no Mana, the item's DC where it has one, a use struck.
  viaItem = null,
  // The token that cast it, as the roll dialog found it before it opened (D-724).
  source = null,
  // **CAST AT A HALF-ACTION** (04's Nature's Swiftness, D-771): the dialog's own
  // line, ticked. Judged with every refusal before anything is spent, and a use
  // of the talent's counter struck once it is paid.
  swift = false,
  // **A CAST THAT COSTS NO MANA AND NO ACTION** (04's Hammer of Justice at rank
  // 2, D-772): `{by}` names what paid for it, for the card's source line. It
  // takes none of the next spell's discounts, since it paid no Mana.
  free = null,
  // **A BOSS ACTION THAT CASTS** (D-809, the audit's F8): its points paid it at the press
  // (`applications/actions.mjs#useAbilityWithDialog`), so the cast spends no action.
  bossAction = false,
  // **WHAT A TALENT'S COUNTER OR CHARGE BUYS ON THIS CAST** (D-774): the
  // identifiers the roller ticked - Inner Focus's free Mana, Lava Burst's Ward
  // ignored, Static Charge's tier - judged again here before anything is spent.
  talentLines = [],
  conflagrateBurning = false,
  chainExecution = null,
  dispersionExecution = null
} = {}) {
  if (dispersionExecution && !validDispersionExecution(dispersionExecution, actor, spell)) return null;
  // 07's Hex: *it cannot attack, cast or speak* (D-808), before anything is spent.
  if (actor?.refuseForcedShape?.("cast")) return null;
  if (refuseDispersion(actor, "cast")) return null;
  if (refuseDispersedTargets(targets)) return null;
  if (spell?.system?.identifier === "chain-lightning") {
    if (source == null) {
      const { chainLightningSource } = await import("../effects/chain-lightning-source.mjs");
      source = chainLightningSource(actor, targets);
    }
    if (!source?.sceneId || !source?.tokenId) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.ChainLightning.SourceRequired"));
      return null;
    }
    const bridge = await import("../effects/chain-lightning-cast.mjs");
    if (!bridge.isChainLightningExecution(chainExecution)) return bridge.requestChainLightningCast(actor, spell, {
      attackTest, modifier, dc, boons, banes, overchannel, augment, targets, provenanceExtra,
      extraRating, damageRows, viaItem, source, swift, talentLines
    });
  }
  if (refuseAncientDespair(actor, "casting")) return null;
  const {isThematicSpell} = await import("../rules/thematic-spell-catalogue.mjs");
  const {utilitySpell} = await import("../rules/thematic-utility.mjs");
  const objectTools = await import("../effects/thematic-object-state.mjs");
  const thematicFel = ["summoners-writ", "fel-surety"].includes(spell?.system?.identifier);
  const felTools = thematicFel ? await import("../effects/thematic-fel.mjs") : null;
  const burdenTools = spell?.system?.identifier === "pilgrims-burden" ? await import("../effects/pilgrims-burden.mjs") : null;
  const custodyTools = ["pact-escrow", "phoenix-courier"].includes(spell?.system?.identifier)
    ? await import("../effects/item-custody-transactions.mjs") : null;
  const shadowTools = ["phantom-footsteps", "mindstatic"].includes(spell?.system?.identifier)
    ? await import("../effects/thematic-shadow.mjs") : null;
  const thematicStateReady = ["prayer-of-mending", "gentle-verdict", "dream-theatre", "spell-relay"].includes(spell?.system?.identifier);
  // Enable an authored entry only after its state adapter is connected.
  if (isThematicSpell(spell) && !utilitySpell(spell?.system?.identifier) && !objectTools.supportsThematicObject(spell?.system?.identifier) && !thematicFel && !burdenTools && !custodyTools && !shadowTools && !thematicStateReady) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.Pending"));
    return null;
  }
  if (spell?.system?.duration?.kind === "sustained" && refuseSustainTransferStart(actor)) return null;
  const chainRefusal=chainLightningTargetRefusal(spell,targets,viaItem ? [] : actor.takenTalents?.() ?? []);
  if(chainRefusal){ui.notifications?.warn(game.i18n.format("AZEROTH.ChainLightning.TooMany",chainRefusal));return null;}
  // Resolve scene-backed GM casts from one chosen initial target. Keep the
  // initial target alone for the Casting Test and its Reflection window.
  const chainTools = spell?.system?.identifier === "chain-lightning" && source?.sceneId
    && game.user?.isGM && game.users?.activeGM?.id === game.user.id
    ? await import("../effects/chain-lightning-path.mjs") : null;
  if (chainTools && !chainTools.resolveChainLightningPath({ actor, spell, source, targets, viaItem }).ok) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.ChainLightning.BeforeFailed"));
    return null;
  }
  let chainUnresolved = false, chainPrivate = false;
  const attackCalculation = attackTest ? await (await import("../applications/actions.mjs")).prepareBlademasterTest(actor,attackTest,{targets}) : null;
  if (attackTest && !attackCalculation) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Blademaster.Unavailable"));
    return null;
  }
  const attackPromises=attackCalculation ? attackTestPromises(actor.pendingNextAttack?.() ?? {}) : null;
  const limited = spellLimitRefusal(actor, spell);
  if (limited) { ui.notifications?.warn(limited); return null; }
  const sys = spell.system;
  const {sealingFlameFrom} = await import('../rules/sealing-flame.mjs');
  const sealingFlame = sealingFlameFrom(spell);
  if (sealingFlame) {
    const {sealingFlameWindow} = await import('../effects/sealing-flame-reaction.mjs');
    let target;try{target=fromUuidSync(sealingFlameClaim?.targetUuid);}catch{}
    if (!sealingFlameWindow({caster:actor,target,claim:sealingFlameClaim?.claim,before:sealingFlameClaim?.before})) {
      ui.notifications?.warn('Sealing Flame must be cast through its reaction when a creature would drop to 0 Health.');
      return null;
    }
  }
  const reactionBar = earthShockBars(actor.takenTalents?.() ?? [], { identifier: sys.identifier, viaItem });
  if (reactionBar && !game.users.activeGM) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.ReactionBar.NeedGM"));
    return null;
  }
  const school = sys.school;
  const classes = (actor?.classItems ?? []).map(c => ({
    itemId: c.id, schools: c.system?.schools ?? [], castingAbility: c.system?.castingAbility ?? null
  }));
  const grant = grantingClass(classes, school);
  // **A SPELL A TALENT PAYS IN ANOTHER POOL, AND CASTS WITH ANOTHER ABILITY** (04's
  // Shadowcraft: *Cast them with Wisdom, paying Focus where 07-MAGIC asks for
  // Mana*; the Legacy branches' door 8): the talent's pool and ability, where it
  // names this spell. An item's casting and a free cast pay nothing either way.
  const talentPool = viaItem || free ? null : spellPoolFor(actor?.takenTalents?.() ?? [], { name: spell.name, school });
  const ability = talentPool?.ability ?? grant?.castingAbility ?? null;
  const abilityMod = ability ? (actor.system.abilities?.[ability]?.mod ?? 0) : 0;
  const proficiency = actor.system.proficiency ?? 0;
  let list = [...(targets ?? [])];
  let first = list[0] ?? null;

  const missileTools=sys.identifier==='arcane-missiles'?await import('../effects/arcane-missiles-targets.mjs'):null;
  if(missileTools&&!missileTools.validArcaneMissilesTargets(list)){
    ui.notifications?.warn(game.i18n.localize('AZEROTH.Cast.ArcaneMissilesTargets'));return null;
  }

  const compelTools = ["compel", "dominate", "enslave-demon"].includes(sys.identifier) ? await import("../effects/compel.mjs") : null;
  const compelledTarget = compelTools?.dominationTarget(sys.identifier, actor, list) ?? null;
  if (compelTools && !compelledTarget) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Compel.DominationTarget"));
    return null;
  }

  const soulLinkTools = sys.identifier === "soul-link" ? await import("../effects/soul-link-casting.mjs") : null;
  const iceBlockTools = sys.identifier === "ice-block" ? await import("../effects/ice-block-casting.mjs") : null;
  const dispersionTools = sys.identifier === "dispersion" ? await import("../effects/dispersion-casting.mjs") : null;
  if (dispersionTools && !(await dispersionTools.requestDispersionPreparation(actor, spell))?.ok) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Dispersion.BeforeFailed"));
    return null;
  }
  if (iceBlockTools && !(await iceBlockTools.requestIceBlockPreparation(actor, spell))?.ok) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.IceBlock.BeforeFailed"));
    return null;
  }
  const soulLinkPreparation = soulLinkTools ? await soulLinkTools.requestSoulLinkPreparation(actor, spell, list, source) : null;
  if (soulLinkTools && !soulLinkPreparation?.ok) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.SoulLink.BeforeFailed"));
    return null;
  }

  const bloodPactTools = sys.identifier === "blood-pact" ? await import("../effects/blood-pact-spell.mjs") : null;
  let bloodPactSpell = null;
  if (bloodPactTools) {
    bloodPactSpell = await bloodPactTools.requestBloodPactSpellPreparation(actor, spell, list, source);
    if (!bloodPactSpell?.ok) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.BloodPactSpell.BeforeFailed"));
      return null;
    }
    const choice = await chooseOption(spell, [
      { key: "use", name: game.i18n.localize("AZEROTH.BloodPactSpell.Confirm"),
        description: game.i18n.format("AZEROTH.BloodPactSpell.Preview", { name: bloodPactSpell.donorName,
          before: bloodPactSpell.health.before, after: bloodPactSpell.health.after, mana: bloodPactSpell.pool.restored }) },
      { key: "cancel", name: game.i18n.localize("AZEROTH.BloodPactSpell.Cancel"), description: "" }
    ], null, { prompt: game.i18n.localize("AZEROTH.BloodPactSpell.Prompt") });
    if (choice?.key !== "use") return null;
    const confirmed = await bloodPactTools.requestBloodPactSpellPreparation(actor, spell, list, source);
    if (!confirmed?.ok || JSON.stringify(confirmed) !== JSON.stringify(bloodPactSpell)) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.BloodPactSpell.BeforeFailed"));
      return null;
    }
  }

  const conflagrateTools = sys.identifier === "conflagrate" ? await import("../effects/conflagrate.mjs") : null;
  let conflagrate = conflagrateTools ? await conflagrateTools.requestConflagratePreparation(actor, spell, list, {burning:conflagrateBurning}) : null;
  if (conflagrateTools && !conflagrate?.ok) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Conflagrate.BeforeFailed"));
    return null;
  }

  // 1. **EVERY REFUSAL, BEFORE ANYTHING IS SPENT** (D-768; the lead,
  // 2026-10-03, asked *does the caster keep the Half-Action?*: *Keeps the
  // Half-Action*). The budget was spent and the Hide ended first, and the Mana,
  // the form and the Health price were asked after, so a cast refused for a
  // short pool cost the Half-Action and the cover for nothing.
  // `rules/casting.mjs#castRefusal` asks all three; nothing below it refuses.
  // The Mana pool - a creature's Power pool whatever its block names it (the B1 review;
  // `casting.mjs#castingManaPool`, the one reading the dialog shares).
  // **THE SPIRIT REALM AND ETHEREAL FORM CAST ONLY WHAT RESTORES HEALTH** (06 §10 with
  // 04's The Crossing: *you may cast spells that restore Health on any creature but
  // yourself*; Ethereal Form: *you cannot ... cast, except spells that restore Health*;
  // the Legacy branches' door 10): the one healing-only filter both states share
  // (`rules/spirit-realm.mjs#castFilterRefusal`), before anything is spent. An item's
  // casting and a free cast are the caster's own casting.
  // **A HEAL THAT ALSO BURNS IS NO HEAL HERE** (the B3 review): `restoresOnly` - it
  // restores Health and deals nothing (Holy Nova, Halo, Starsurge and their kin passed).
  if (sys.identifier === "mana-burn" && (list.length !== 1 || (!game.user?.isGM && !game.users?.activeGM))) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.ManaBurn.BeforeFailed"));
    return null;
  }
  const filtered = castRefusalFor(actor, { heals: restoresOnly(sys), selfTargeted: castNamesSelf(actor, list) });
  if (filtered) {
    ui.notifications?.warn(filtered);
    return null;
  }
  const pool = castingManaPool({ creature: actor.type === "npc", powers: actor.system.powers ?? [], snapshot: actor.poolSnapshot?.() ?? [], grantItemId: grant?.itemId ?? null });
  // **ONE NAMED SPELL, AND ONE WHOLE SCHOOL, IMPROVED BY WHAT IS WORN** (08 §20,
  // D-698; the lead, 2026-09-14: *spell and/or a school should be possible*):
  // `empowers[name].cost` and `spellCost[school]` - the SPELL's own school, since
  // the Mana is charged by what the spell IS - floored at nothing, and nothing at
  // all for an item's casting. `spellManaCost` is the ONE reading, which the
  // dialog's `canPay` takes too (D-768).
  // **AND WHAT THE NEXT SPELL WAS PROMISED** (04's Nature's Grace and
  // Predator's Swiftness, D-771): the discounts standing on the caster, taken
  // WHOLE by this cast once it is paid for. An item's casting costs no Mana and
  // takes none of them.
  const pending = viaItem || free ? { amount: 0, live: [], lapsed: [] } : (actor.pendingNextSpell?.() ?? { amount: 0, live: [], lapsed: [] });
  // **WHAT THIS CAST TAKES OF IT** (D-775): a discount and Soul Fire's promise
  // whatever the spell, Backdraft's Half-Action only where it costs an action -
  // and never where Nature's Swiftness or Fire Blast's line already lowers it.
  const take = takeNextSpell(pending.live, { action: swift ? null : (sys.action ?? null), healing: isHealingSpell(sys) });
  // The talents this cast reads, once.
  const talentsNow = actor.takenTalents();
  // **WHAT A TALENT TAKES OFF THE MANA** (04's Emberstorm: *Your Fire and Fel
  // spells cost 2 less Mana, to a minimum of 2*; Icy Veins: *your Frost spells
  // cost 1 less Mana per rank*; D-775), against the entry's own Mana. An item's
  // casting and a free cast pay none and take none.
  // The pool the cast is paid in, so a discount named in one pool (04's Shadowcraft's
  // Focus; the Legacy branches' B6) reaches no other.
  const discount = viaItem || free ? { amount: 0, by: [] } : spellDiscountFor(talentsNow, { school, mana: sys.mana ?? 0, states: veinsStates(flaggedEffects(actor, VEINS_FLAG).map(r => r.flag)), pool: talentPool?.pool ?? null });
  const manaDue = spellManaCost({ mana: sys.mana ?? 0, name: spell.name, school }, actor.system?.signatureEffects, { viaItem: Boolean(viaItem) || Boolean(free), next: take.amount, less: discount.amount });
  // **WHAT A COUNTER OR A CHARGE BUYS, JUDGED AGAIN** (D-774): a ticked line no
  // longer offered - its counter or charge spent since the dialog opened -
  // refuses the cast in words with nothing spent. An item's casting and a free
  // cast take none.
  const lineOffer = (talentLines ?? []).length && !viaItem && !free ? (actor.talentLineOffer?.({
    roll: "spell", school: sys.damage?.school ?? school ?? null, damages: castDealsDamage(sys), mana: manaDue, spell: spell.name,
    // A spell whose damage is its tick (D-770) - Fel Fire's line reaches it (D-775).
    ticks: sys.tick?.kind === "damage"
  }) ?? []) : [];
  const linesNow = talentLinesTaken(lineOffer, viaItem || free ? [] : talentLines);
  if (linesNow.lost.length) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.TalentLine.Lost", { name: spell.name, lines: linesNow.lost.join(", ") }));
    return null;
  }
  const freeLine = linesNow.taken.find(l => l.kind === "free") ?? null;
  // **A FREE CAST, ONCE PER REST** (the Chromatic Champion plan: *"the utility spells
  // can be cast without rage once per short rest"*): the ticked line, judged again by
  // `talentLinesTaken` against the talent item's flag as it stands now, and marked
  // spent once the cast is paid for (`rules/free-casts.mjs`).
  const freeCastLine = linesNow.taken.find(l => l.kind === "freeCast") ?? null;
  const pierceLine = linesNow.taken.find(l => l.kind === "pierce") ?? null;
  const chargeLine = linesNow.taken.find(l => l.kind === "charge") ?? null;
  // **FEL FIRE** (04: *you may have it deal Fel damage instead*; D-775): the line
  // ticked, the spell's damage Fel and the rank added to it.
  const convertLine = linesNow.taken.find(l => l.kind === "convert") ?? null;
  // **04's DEVOURING PLAGUE** (the lead, 2026-10-03, on O-186: *"tick on cast, and 1
  // turn after."*; D-779): the line ticked on Shadow Word: Pain's dialog, judged with
  // the refusals - the first target below half Health, not doubled by this priest
  // before, a use left - and refused in words with nothing spent where it cannot be.
  const doubleLine = linesNow.taken.find(l => l.kind === "double") ?? null;
  const plague = doubleLine ? plagueFor(talentsNow) : null;
  const plagueOn = doubleLine ? targetActorOf(first) : null;
  if (doubleLine) {
    const done = actor.getFlag("azeroth-rpg", DEVOURING_PLAGUE.flag) ?? [];
    const refused = plagueRefusal({ health: plagueOn?.system?.health ?? null, doubledBefore: Boolean(plagueOn) && done.includes(plagueOn.uuid), usesLeft: doubleLine.left });
    if (refused || !plagueOn) {
      ui.notifications?.warn(game.i18n.format(refused ?? "AZEROTH.DevouringPlague.Unmeasured", { name: spell.name, talent: doubleLine.name, target: plagueOn?.name ?? first?.name ?? "" }));
      return null;
    }
  }
  const splitLine = linesNow.taken.find(l => l.kind === "lifebinder") ?? null;
  const surgeLine = linesNow.taken.find(l => l.kind === "voidSurge") ?? null;
  let splitPicked = null;
  // **INNER FOCUS** (04: *a spell or feature requiring a Casting Test costs no
  // Mana*; D-774): nothing to pay, and its use struck once the cast is paid for.
  const manaBase = freeLine || freeCastLine ? 0 : manaDue;
  // The item naming this spell, read again further down for what it adds to the
  // Health the spell restores (D-698's heal half).
  const empowered = actor.system?.signatureEffects?.empowers?.[spell.name] ?? null;
  // **OVERCHANNELLER** (04: *When you Overchannel, its cost to you is reduced by 1
  // per rank*; D-775): off the whole Overchannel's Health, never below nothing.
  const relief = viaItem ? 0 : overchannelReliefFor(talentsNow).amount;
  // **02's OVERCHANNEL MASTERY** (*Overchannelling does not cost you Health, instead you
  // may spend twice the Mana cost for the effect*; the lead, 2026-10-03, on O-192:
  // *"Per cast"*; D-779): the spell's Mana once more, a cast, and no Health; 04's
  // Overchanneller's rank off that second charge (`casting.mjs#overchannelPrice`).
  const mastery = !viaItem && !free && actor.hasFeature?.("Overchannel Mastery") === true;
  const oc = overchannelPrice({ points: overchannel, health: actor.system.health?.value ?? 0, tier: sys.tier, relief, mastery, mana: manaBase });
  const mana = manaBase + oc.mana;
  // 07 §8's OWN Health price, where the entry names one: *Casting it costs you
  // 2 Health* (Doom Bolt). Sixteen spells say it and nothing read a word of
  // it, so every one of them was free (the lead, 2026-09-07). It is paid with
  // the Mana, whether the Test lands or not, and never below 1 Health — the
  // same floor Overchannel takes.
  // **OR AS A TALENT RESTATES IT** (04's Cataclysm: *it costs you 6 Health rather
  // than 10*; D-775).
  const health = actor.system.health?.value ?? 0;
  const restatedHealth = viaItem ? null : spellHealthFor(talentsNow, { name: spell.name });
  const spellHealth = viaItem ? 0 : Math.max(0, Math.trunc(restatedHealth ?? sys.cost?.health ?? 0));
  // 02 SS7: no Mana can be spent while in a Shapeshift form (D-627) - and 07's
  // *The Druid in a form* pays it in Ferocity instead, 1 for every 2 Mana,
  // rounded up (D-769). `casting.mjs#manaPrice` is the one reading.
  const inForm = actor.inShapeshiftForm === true;
  const ferocity = inForm ? ((actor.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === "ferocity") ?? null) : null;
  // The pool a talent pays in (door 8): the actor's own pool of that name.
  const payPool = talentPool ? ((actor.poolSnapshot?.() ?? []).find(p => p.name === talentPool.pool) ?? null) : null;
  const price = manaPrice(mana, { inShapeshiftForm: inForm, pool: talentPool?.pool ?? null, free: Boolean(freeCastLine) });
  // 04's Garrote (D-773): *cannot cast while that Bleeding lasts* - the
  // Bleeding's own effect carries the mark, so it ends with the Bleeding.
  const noCasting = noCastingFrom((actor.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"] ?? {}));
  const refused = castRefusal({ mana, pool, inForm, ferocity, health, overchannelHealth: oc.health, spellHealth, noCasting, payWith: talentPool?.pool ?? null, payPool });
  // **A PRICE WITH NOTHING TO PAY IT** (door 8): a learned spell on a class that
  // holds no Mana was cast free; it is refused in words now, nothing spent.
  if (refused?.reason === "NoPool") {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Cast.NoPool", { name: spell.name, pool: game.i18n.localize(AZEROTH.poolTypes[refused.pool] ?? refused.pool ?? ""), n: refused.amount ?? mana }));
    return null;
  }
  if (refused?.reason === "NoPower") {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Cast.NoPower", { name: spell.name, pool: game.i18n.localize(AZEROTH.poolTypes[refused.pool] ?? refused.pool ?? ""), n: refused.amount ?? mana, talent: talentPool?.name ?? "" }));
    return null;
  }
  if (refused?.reason === "Garroted") {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Cast.Garroted", { name: spell.name, by: refused.by.join(", ") }));
    return null;
  }
  if (refused?.reason === "InForm") {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Cast.InForm", { name: spell.name, form: (actor.shape?.forms ?? []).map(f => f.name).join(", ") }));
    return null;
  }
  if (refused?.reason === "NoFerocity") {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Cast.NoFerocity", { name: spell.name, mana, ferocity: refused.amount }));
    return null;
  }
  if (refused?.reason === "NoMana") {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Cast.NoMana", { name: spell.name, mana }));
    return null;
  }
  if (refused?.reason === "NoHealth") {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Cast.NoHealth", { name: spell.name, health: spellHealth }));
    return null;
  }
  // **04's LIFEBINDER'S FLAME, CHOSEN BEFORE ANYTHING IS PAID, AFTER THE POOL'S REFUSALS** (the
  // 3A review, should-fix 1: a Champion short of Rage was asked to pick and then refused) (*one creature within the
  // spell's range, you included, regains Health*; Pyre of Renewal's two or three; stage 3A):
  // the line ticked, the creatures to heal picked now through the one chooser - every
  // creature on the board within the spell's reach of the caster, the caster first - and a
  // dismissed chooser casts nothing. A creature this client does not own needs a GM to heal,
  // judged here with the rest. With no token on the board the caster is the one choice.
  if (splitLine) {
    // *Work out the damage it deals after Armor Points and Ward. Its target takes half*: a
    // split needs the creature the spell strikes, so a cast with none targeted is refused
    // in words before the chooser (the 3A review, M3).
    if (!list.some(t => targetActorOf(t))) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Lifebinder.NeedsTarget", { name: spell.name, talent: splitLine.name }));
      return null;
    }
    const plan = lifebinderFor(talentsNow, { form: actor.shape?.kind === "drake" ? (actor.shape.forms?.[0]?.name ?? null) : null }, talentEffect);
    const reachFt = /^touch$/i.test(String(sys.range ?? "").trim()) ? 5 : (Number(/(\d+)\s*ft/i.exec(String(sys.range ?? ""))?.[1]) || 0);
    const near = reachFt > 0 ? creaturesWithin(actor, reachFt, { who: "creature" }) : [];
    const options = [{ key: actor.uuid, name: actor.name, description: "", actor }];
    for (const r of near) if (r.actor && r.actor.uuid !== actor.uuid && !options.some(o => o.key === r.actor.uuid)) options.push({ key: r.actor.uuid, name: r.token?.name ?? r.actor.name, description: "", actor: r.actor });
    const picks = options.length === 1 ? [options[0]] : await (async () => {
      const max = Math.max(1, plan?.divide ?? 1);
      const answer = await chooseOption(spell, options.map(({ actor: _a, ...o }) => o), null, { max, prompt: game.i18n.format("AZEROTH.Lifebinder.Prompt", { name: spell.name, talent: splitLine.name, count: max }) });
      const keys = (Array.isArray(answer) ? answer : (answer ? [answer] : [])).map(o => o.key);
      return options.filter(o => keys.includes(o.key));
    })();
    if (!picks.length) return null;
    const { lifebinderNeedsGM } = await import("../effects/chromatic-talents.mjs");
    if (lifebinderNeedsGM(picks.map(p => p.actor))) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Lifebinder.NoGMBefore"));
      return null;
    }
    splitPicked = { plan, picks: picks.map(p => ({ uuid: p.actor.uuid, name: p.name })) };
  }
  // **A HEALING SPELL AT A HALF-ACTION** (04's Nature's Swiftness, D-771), asked
  // with the refusals: the spell has to be a healing spell that costs an action
  // and the talent's counter a use left, or the cast is refused in words with
  // nothing spent. `castAction` is the rung the budget is charged.
  // And 04's Riptide (*You may cast Healing Wave as a Half-Action once a round,
  // or twice a round at rank 2*; D-774): the same line, by the spell's name, its
  // uses the round's record, marked once the cast is paid for.
  // And 04's Fire Blast (*Once a round, a Fire spell of yours costs a Half-Action
  // rather than an action*; D-775): the same line, by the spell's school.
  const swiftRow = swift && !viaItem ? castAsFor(talentsNow, { action: sys.action ?? null, healing: isHealingSpell(sys), name: spell.name, school }) : null;
  const swiftCounter = swiftRow && !swiftRow.perRound ? (actor.grantedFeature?.(swiftRow.talentId) ?? null) : null;
  const swiftFight = swiftRow?.perRound ? (actor.activeFight?.() ?? null) : null;
  const swiftMine = swiftFight ? (swiftFight.getCombatantsByActor(actor)?.[0] ?? null) : null;
  const swiftUsed = swiftMine ? ((r => (r.number === swiftFight.round ? r.once ?? [] : []))(swiftMine.getFlag("azeroth-rpg", "round") ?? {})) : [];
  const swiftMark = swiftRow?.perRound && swiftMine ? nextRoundMark(swiftRow.identifier, swiftRow.perRound, swiftUsed) : null;
  const swiftLeft = swiftRow?.perRound ? (swiftMine ? roundMarksLeft(swiftRow.identifier, swiftRow.perRound, swiftUsed) : swiftRow.perRound) : (swiftCounter?.system?.uses?.value ?? 0);
  let castAction = free || bossAction ? null : sys.action;
  if (swift && !viaItem && !free) {
    const judged = swiftCast({ row: swiftRow, spellAction: sys.action ?? null, healing: isHealingSpell(sys), usesLeft: swiftLeft });
    if (!judged.ok) {
      ui.notifications?.warn(game.i18n.format(judged.reason, { name: spell.name, talent: swiftRow?.name ?? "" }));
      return null;
    }
    castAction = judged.action;
  }
  // **BACKDRAFT** (04: *After a Casting Test you make meets or exceeds SL 3, your
  // next spell costs a Half-Action rather than an action*; D-775): the promise
  // this cast takes, where it is still charged an action. Its use is struck once
  // the cast is paid for.
  const backdraft = take.cast && castAction === "action" ? take.cast : null;
  if (backdraft) castAction = "half";
  const { ancientDreadAction, hasAncientDread } = await import("../rules/ancient-dread.mjs");
  const beforeDreadAction = castAction;
  castAction = ancientDreadAction(castAction, { affected: hasAncientDread(actor), casting: true });
  if (castAction !== beforeDreadAction) provenanceExtra = [...provenanceExtra, {
    label: "AZEROTH.AncientDread.Label", value: null,
    formula: game.i18n.format("AZEROTH.AncientDread.CastingCost", { cost: game.i18n.localize(AZEROTH.actions[castAction]) })
  }];

  // **WHOM A HEAL REACHES** (04's Chain Heal: *one further friendly target within
  // 10 feet per rank*; D-774): with the talent, no more named than it reaches, the
  // further ones friendly and within their reach of the first - asked with the
  // refusals. Without it a spell's targets are counted by nothing, as before.
  const healLimits = isHealingSpell(sys) && !viaItem ? healTargetsFor(actor.takenTalents(), { spell: spell.name }) : null;
  if (healLimits) {
    const refused = healTargetRefusal({ named: list.length, limits: healLimits });
    if (refused) {
      ui.notifications?.warn(game.i18n.format(refused.key, { name: spell.name, max: refused.max }));
      return null;
    }
    const far = furtherTooFar(list, healLimits);
    if (far.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Heal.TooFar", { name: spell.name, names: far.join(", "), feet: healLimits.further.feet }));
      return null;
    }
    const hostile = list.slice(healLimits.primary).find(t => {
      const scene = (t?.sceneId && game.scenes.get(t.sceneId)) || canvas?.scene || null;
      return t?.tokenId && scene?.tokens?.get(t.tokenId)?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE;
    });
    if (hostile) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.NotFriendly", { name: spell.name, target: hostile.name ?? "" }));
      return null;
    }
  }
  // **A SPEED DROP THE HIT LAYS ITSELF** (07's Frostbolt, Ice Spear, Wrath; D-778,
  // O-203): written with the blow on every creature the card records, on the GM's
  // client where this one does not own it - so with no GM online the cast is
  // refused before anything is spent (`rules/gm-writes.mjs#gmAbsentFor`).
  const speedRead = readSpeedDrop(sys.effect);
  if (speedRead && list.length && gmAbsentForActors(list.map(t => targetActorOf(t)))) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.SpeedDrop.NoGM"));
    return null;
  }
  // **AND EVERY OTHER WRITE THE HIT LAYS ON THE CREATURE STRUCK** (the 3A review, M1 and
  // should-fix 3): 07's SL riders - Searing Pain's Bane, Fel Bolt's Ward drop, Shattering
  // Bolt's Armor Points - land through the GM's client where this one does not own the
  // creature, and so does a spend of Void that reaches Earthshatter's Prone, and 07's
  // Unweave's ending. With no GM online each was paid for and laid nothing; refused here,
  // before the budget, nothing spent.
  const slWrites = ["hitBane", "hitWardDrop", "hitApDrop"].includes(readSlRider(sys.effect)?.kind);
  const surgeWrites = Boolean(surgeLine) && !viaItem && voidSpendWrites(
    voidSpendFor(talentsNow, { tier: actor.system?.tier ?? 1, form: actor.shape?.kind === "drake" ? (actor.shape.forms?.[0]?.name ?? null) : null }, talentEffect),
    actor.system?.corruption?.void ?? 0
  );
  const unweaving = sys.identifier === "unweave";
  if ((slWrites || surgeWrites || unweaving) && list.length && gmAbsentForActors(list.map(t => targetActorOf(t)))) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
    return null;
  }
  // **04's SPELLTHIEF'S ALLY, PICKED BEFORE ANYTHING IS PAID** (the 3B review, should-fix 5;
  // D-768's order): an Unweave that may end a spell effect - a target carrying one - asks
  // which ally regains Spellthief's Mana now, before the budget and the Mana, never in the
  // middle of the cast. A dismissed chooser casts nothing; a picked ally this client does
  // not own needs a GM, judged here with the rest.
  let unweaveThief = { ally: null };
  if (unweaving && !viaItem && list.length) {
    const { plainEffect } = await import("../effects/dispel.mjs");
    const ends = list.some(t => (targetActorOf(t)?.effects ?? []).some(e => { const p = plainEffect(e); return !p.disabled && spellCasterOf(p); }));
    if (ends) {
      const { pickSpellthiefAlly } = await import("../effects/chromatic-flights.mjs");
      const picked = await pickSpellthiefAlly(actor);
      if (!picked) return null;
      if (picked.ally && gmAbsentForActors([picked.ally.actor])) {
        ui.notifications?.warn(game.i18n.localize("AZEROTH.Gift.NoGM"));
        return null;
      }
      unweaveThief = picked;
    }
  }

  // **04's DIVINE AEGIS** (*When your healing restores a target to full Health, it
  // gains Ward 1 of a number of schools equal to your rank*; the lead, 2026-10-03, on
  // O-183: *"The caster"*; D-779): a healing spell's caster names the schools now,
  // through the one chooser, before anything is spent - the card and its tick carry
  // them to the one healing door. A chooser dismissed casts the spell carrying none,
  // said in words. An item's casting is the caster's spell too (READING).
  const aegisNamed = await nameAegisSchools(actor, { heals: isHealingSpell(sys), name: spell.name });

  // **A SPELL THAT MOVES ITS CASTER TO A CHOSEN SPACE** (07's Shadow Walk: *You move
  // up to 30 feet to a space you can see*; Dark Passage: *You and each target move up
  // to 60 feet to spaces you can see*; the Legacy branches' door 3): the space picked
  // now, before the budget and the Mana - a dismissed pick costs nothing - and the
  // tokens moved once the Casting Test succeeds. Darkness and shadow at both ends
  // are the table's, and the pick's hint says so.
  const { spellCrossingFrom } = await import('../rules/spell-crossing.mjs');
  const spellCrossing = spellCrossingFrom(spell);
  if (spellCrossing && !game.users.activeGM) {
    ui.notifications?.warn('Emberflight requires an active GM to resolve crossing damage.');
    return null;
  }
  const spellStep = readSpellStep(sys.effect ?? "") ?? (spellCrossing ? { ...spellCrossing, who: 'self' } : null);
  let stepPicked = null;
  if (spellStep) {
    const casterDoc = actor.getActiveTokens?.(true)?.[0]?.document ?? null;
    if (casterDoc?.parent && casterDoc.parent.id === canvas?.scene?.id) {
      // **THE PARTY IS THE BURST'S ALLIES** (07's Dark Passage: *Target: Each ally within
      // 10 ft*; the B2 review): every creature the caster counts as an ally (D-755's one
      // rule) inside the circle the spell's Target line reads, targeted or not - and no
      // enemy, whatever is targeted. It moved every targeted token, enemies included.
      const radius = spellStep.who === "selfAndTargets" ? partyRadius(sys.target ?? "") : null;
      const party = radius !== null
        ? creaturesWithin(actor, radius, { who: "ally" }).map(r => r.token?.document ?? null).filter(d => d && d.id !== casterDoc.id && d.parent?.id === casterDoc.parent.id)
        : [];
      if ([casterDoc, ...party].some(d => !d.isOwner) && !game.user.isGM && !game.users.activeGM) {
        ui.notifications?.warn(stepWords("noGM", { name: spell.name, feet: spellStep.feet }));
        return null;
      }
      const stepName = casterDoc.name ?? actor.name;
      const picked = await pickStep(casterDoc, {
        feet: spellStep.feet, sight: spellStep.sight, name: stepName, except: party.map(d => d.id),
        hint: spellStep.shadow ? game.i18n.format("AZEROTH.Step.PickShadow", { name: stepName, feet: spellStep.feet }) : null
      });
      if (!picked) return null;
      stepPicked = { doc: casterDoc, from: Object.fromEntries(['x','y','elevation','width','height','depth','shape','level'].map(key=>[key,casterDoc[key]])), to: picked.to, party };
    } else stepPicked = { skipped: true };
  }

  // Review before payment; redirect only after the original Casting Test wins.
  const { prepareReflection } = await import("../effects/reflection-review.mjs");
  const { reflectionPlan } = await import("../rules/reflection.mjs");
  source ??= (await import("../applications/roll-dialog.mjs")).sourceOf(actor);
  const reflectionReview = await prepareReflection({ actor, spell, source, targets: list });
  if (!reflectionReview?.ok) {
    if (reflectionReview?.reason !== "cancelled") ui.notifications?.warn("Reflection could not be resolved. Check the caster, targets, and active GM before casting again.");
    return null;
  }
  const cast = foundry.utils.randomID();
  const reflectedPlan = reflectionPlan({ castId: cast, caster: reflectionReview.caster, targets: list,
    fields: reflectionReview.fields, harmful: reflectionReview.harmful, school: sys.school, area: Boolean(areaFor(sys.target ?? "")) });
  if (!reflectedPlan.ok) {
    ui.notifications?.warn("Reflection needs further GM review. Nothing was spent.");
    return null;
  }

  let cureReview = null;
  if (spell.name === "Cure Poison") {
    const { prepareCurePoison } = await import("../effects/cure-poison-use.mjs");
    cureReview = await prepareCurePoison({ actor, spell, source, targets: list });
    if (!cureReview?.ok) {
      if (cureReview?.reason !== "cancelled") ui.notifications?.warn(game.i18n.localize("AZEROTH.CurePoison.BeforeFailed"));
      return null;
    }
  }

  // The five single-target cures (D12 Phase 6) are judged and chosen before payment.
  let doorCure = null;
  if ((await import("../effects/cures.mjs")).DOOR_CURES.includes(spell.name)) {
    const { prepareDoorCure } = await import("../effects/cures.mjs");
    doorCure = await prepareDoorCure({ actor, spell, source, targets: list });
    if (!doorCure?.ok) return null;
  }

  // Reviewed utility choices live only on the GM's receipt. Cancellation is
  // before budget/Mana payment; the cast card carries only its opaque ticket.
  const utilityTools = await import("../effects/thematic-utility.mjs");
  const utilityReview = await utilityTools.prepareThematicUtility({actor, spell, source, targets: list});
  if (utilityReview && !utilityReview.ok) {
    if (utilityReview.reason !== "cancelled") ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }
  const shadowReview = shadowTools ? await shadowTools.prepareShadowCastWithPoint({actor, spell, source, targets: list}) : null;
  if (shadowReview && !shadowReview.ok) {
    if (shadowReview.reason !== "cancelled") ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }
  const custodyReview = custodyTools ? await custodyTools.prepareItemCustodyCast({actor, spell, source}) : null;
  if (custodyReview && !custodyReview.ok) {
    if (custodyReview.reason !== "cancelled") ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }
  const objectReview = custodyTools ? null : await objectTools.prepareThematicObject({actor, spell, source, targets: list});
  if (objectReview && !objectReview.ok) {
    if (objectReview.reason !== "cancelled") ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }
  const felReview = felTools ? await felTools.prepareThematicFel({actor, spell, source, targets: list}) : null;
  if (felReview && !felReview.ok) {
    if (felReview.reason !== "cancelled") ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }
  const burdenReview = burdenTools ? await burdenTools.preparePilgrimsBurden({actor, spell, source}) : null;
  if (burdenReview && !burdenReview.ok) {
    if (burdenReview.reason !== "cancelled") ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }
  const holyTools = await import("../effects/thematic-holy.mjs");
  const holyReview = await holyTools.prepareHolyCast({actor, spell, source, targets: list});
  if (holyReview && !holyReview.ok) {
    if (holyReview.reason !== "cancelled") ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }
  const dreamTools = await import("../effects/thematic-dream.mjs");
  const dreamReview = await dreamTools.prepareDreamCast({actor, spell, source, targets: list});
  if (dreamReview && !dreamReview.ok) {
    if (dreamReview.reason !== "cancelled") ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }
  const spellRelayTools = await import("../effects/spell-relay.mjs");
  const relayMode = sys.identifier === "spell-relay" ? "setup" : "attempt";
  const relayTalentArea = spellAreaFor(actor.takenTalents?.() ?? [], {name: spell.name});
  const relayArea = lengthenArea(widenArea(areaFor(sys.target ?? ""), relayTalentArea.widen), relayTalentArea.lengthen);
  const relayReview = relayMode === "setup"
    ? await spellRelayTools.prepareSpellRelay({actor, spell, source, targets: list})
    : await spellRelayTools.prepareRelayAttempt({actor, spell, source, targets: list, area: relayArea,
      viaItem: Boolean(viaItem)});
  if (relayReview && !relayReview.ok) {
    if (relayReview.reason !== "cancelled") ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }

  // Single-recipient signature choices precede every action/resource payment.
  const {spellRetaliationFrom} = await import('../rules/spell-retaliation.mjs');
  const spellRetaliation = spellRetaliationFrom(spell);
  const {endTurnDamageFrom} = await import('../rules/end-turn-damage.mjs');
  const endTurnDamage = endTurnDamageFrom(spell);
  const separateSignatureTargets = Boolean(spellCrossing || spellRetaliation || (endTurnDamage && !castDealsDamage(sys))) || sys.areaTick?.checks?.some(row=>row.spares === "named") === true;
  const { areaSignatureRecipients } = separateSignatureTargets ? await import('../effects/area-signature-recipients.mjs') : {};
  const signatureScene = separateSignatureTargets
    ? game.scenes.get(source?.sceneId ?? list.find(ref=>ref.sceneId)?.sceneId ?? globalThis.canvas?.scene?.id) : null;
  const { crossingPath } = spellCrossing ? await import('../effects/spell-crossing-path.mjs') : {};
  if (spellCrossing && stepPicked?.doc && !crossingPath(stepPicked.doc,stepPicked.to,stepPicked.from)) {
    ui.notifications?.warn('Emberflight cannot measure this path. No casting cost was paid.');
    return null;
  }
  const readSignatureTargets = () => spellCrossing
    ? (stepPicked?.doc ? crossingPath(stepPicked.doc, stepPicked.to, stepPicked.from)?.targets ?? [] : [])
      .filter(ref => game.user.isGM || game.scenes.get(ref.sceneId)?.tokens.get(ref.tokenId)?.object?.visible === true)
    : separateSignatureTargets
    ? areaSignatureRecipients({scene:signatureScene,exempt:list})
    : list.filter(t=>{
      if(t.sceneId || t.tokenId) return game.scenes.get(t.sceneId)?.tokens.get(t.tokenId)?.actor?.id===t.actorId;
      return Boolean(game.actors.get(t.actorId));
    });
  const chosenSignaturePreparation = (sealingFlame || spellCrossing || endTurnDamage || spellRetaliation || castDealsDamage(sys) || sys.tick?.kind === "damage"
    || sys.areaTick?.damage?.rating>0 || sys.areaTick?.enter?.rating>0
    || sys.areaTick?.against?.some(row=>row?.rating>0)
    || sys.areaTick?.checks?.some(row=>row?.fail?.rating>0 || row?.success?.rating>0))
    ? await prepareChosenSignatures({actor,spell,targets:list,choose:chooseOption,readTargets:readSignatureTargets,castingAbility:ability}) : {ok:true,bonuses:[]};
  if(!chosenSignaturePreparation.ok) {
    if(chosenSignaturePreparation.reason!=="cancelled") ui.notifications?.warn(game.i18n.localize("AZEROTH.Signature.ChosenTargetRequired"));
    return null;
  }
  const chosenSignatureTargets = separateSignatureTargets ? readSignatureTargets().filter(ref=>
    chosenSignaturePreparation.bonuses.some(bonus=>bonus.recipient===signatureRecipientKey(ref))) : null;

  const healingClassNow=()=>{
    const held=actor.classItems??[];
    const current=grantingClass(held.map(c=>({itemId:c.id,schools:c.system?.schools??[],castingAbility:c.system?.castingAbility??null})),school);
    return held.find(c=>c.id===current?.itemId)?.name??null;
  };
  // Drains heal their caster, never the creature damaged. Preserve the source
  // token identity when present; ordinary spells retain their chosen targets.
  const healingRecipients=sys.heal?.fromDamage
    ? [{actorId:actor.id,name:actor.name,...(source?.sceneId&&source?.tokenId?{sceneId:source.sceneId,tokenId:source.tokenId}:{})}]
    : list;
  const healingSignaturePreparation=(isHealingSpell(sys)||Boolean(sys.heal?.fromDamage))
    ? await prepareHealingSignatures({actor,spell,grantingClass:healingClassNow(),readGrantingClass:healingClassNow,
      targets:healingRecipients,choose:chooseOption,readTargets:()=>healingRecipients.filter(t=>{
        if(t.sceneId||t.tokenId)return game.scenes.get(t.sceneId)?.tokens.get(t.tokenId)?.actor?.id===t.actorId;
        return Boolean(game.actors.get(t.actorId));
      })}) : {ok:true,bonuses:[]};
  if(!healingSignaturePreparation.ok){
    if(healingSignaturePreparation.reason!=="cancelled")ui.notifications?.warn(game.i18n.localize("AZEROTH.Signature.ChosenTargetRequired"));
    return null;
  }

  // 1b. The turn's budget, in a fight (2026-09-06): the spell's Action line, or
  // the rung Nature's Swiftness casts it at (D-771). Asked once every refusal
  // has passed, so a refusal leaves the Half-Action.
  if (refuseDispersion(actor, "cast")) return null;
  if (refuseDispersedTargets(list)) return null;
  if (compelTools && compelTools.dominationTarget(sys.identifier, actor, list) !== compelledTarget) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Compel.DominationTarget"));
    return null;
  }
  if (sys.duration?.kind === "sustained" && refuseSustainTransferStart(actor)) return null;
  // Gentle Verdict is reviewed before the final coordinator checks and budget.
  // Its separate claim below consumes only after the budget and Mana are paid.
  const verdictReview = await holyTools.prepareVerdictAttempt({actor, spell, targets: list, attemptId: cast,
    viaItem: Boolean(viaItem)});
  if (verdictReview && !verdictReview.ok) {
    if (verdictReview.reason !== "cancelled") ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }
  if (utilityReview?.ticket && !(await utilityTools.claimThematicUtility(utilityReview.ticket, cast))?.ok) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }
  if (objectReview?.ticket && !(await objectTools.claimThematicObject(objectReview.ticket, cast))?.ok) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }
  if (felReview?.ticket && !(await felTools.claimThematicFel(felReview.ticket, cast))?.ok) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }
  if (burdenReview?.ticket && !(await burdenTools.claimPilgrimsBurden(burdenReview.ticket, cast))?.ok) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }
  if (custodyReview?.ticket && !(await custodyTools.requestItemCustodyClaim({ticket: custodyReview.ticket,
    cast, casterUuid: actor.uuid, spellUuid: spell.uuid}))?.ok) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }
  if (shadowReview?.ticket && !(await shadowTools.claimShadowCast(shadowReview.ticket, cast))?.ok) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.BeforeFailed"));
    return null;
  }
  // **A GM-RUN CAST'S CLAIM IS ASKED LAST, BEFORE THE BUDGET AND NEVER AFTER IT**
  // (D-768; the lead: *"I don't want a half-action wasted bug"*): Chain
  // Lightning's request and Dispersion's Reaction were asked again after the
  // budget and after the Hide, and a claim that moved while either write was in
  // flight returned in silence with the Half-Action or the Reaction spent. From
  // the budget on the cast is made; what moved is the coordinator's to settle
  // off the card (`chain-lightning-cast.mjs` keeps the claim pending, and
  // `dispersion-reaction-resolution.mjs` annotates no blow that changed).
  if (chainExecution && !chainExecution.valid()) return null;
  if (dispersionExecution && !validDispersionExecution(dispersionExecution, actor, spell)) return null;
  if (chainExecution) chainExecution.started = true;
  if (!(await spendSpellBudget(actor, spell, castAction, spendTurnBudget))) {
    if (chainExecution) chainExecution.started = false;
    if (verdictReview?.ticket) await holyTools.releaseVerdictAttempt({ticket: verdictReview.ticket, attemptId: cast});
    if (custodyReview?.ticket) {
      try {
        const released = await custodyTools.requestItemCustodyAbort(custodyReview.ticket, cast);
        if (!released?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
      } catch (error) {
        console.warn("azeroth-rpg | Unpaid custody reservation", error);
        ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
      }
    }
    return null;
  }

  // 1c. **A CAST ENDS A HIDE** (D-717), before the Mana is paid: the budget
  // has already agreed the cast happens, so from here it is being made
  // whatever the Test does. Quiet where nothing is hidden. A cast is an action
  // (D-773): Master of Shadows and a Shadow Dance leave the Hide standing.
  await reveal(actor, { acting: true, kind: "cast" });

  // 2. Pay: everything judged above, so nothing here can be half done. In a
  // Shapeshift form the price is Ferocity and the Mana is never touched (D-769).
  // **OFF THE POOLS AND THE HEALTH AS THEY STAND NOW** (the final review of D-768
  // to D-775; `rollTest`'s rule since the D-770 review, item D): the judgement read
  // them before the budget's queued spend and the reveal, and writing `value -
  // price` off THAT wrote over a gain landing in between. Read again here by item
  // and kind; one that fell short pays what it holds, down to 05's floor of 1
  // Health (`casting.mjs#payFromNow`).
  const poolsNow = actor.poolSnapshot?.() ?? [];
  const extra = {};
  const paidHealth = oc.health + spellHealth;
  if (paidHealth > 0) extra["system.health.value"] = payFromNow(actor.system.health?.value ?? 0, paidHealth, { floor: 1 }).value;
  // The next spell's discounts are TAKEN by this cast, in the payment's own
  // write (D-771): a count, not a span, so every one standing goes, and one
  // that lapsed with its turn is swept with them. **What it does not take is
  // KEPT** (D-775): Backdraft's Half-Action waits for a spell that costs an action.
  if (take.taken.length || pending.lapsed.length) extra[`flags.azeroth-rpg.${NEXT_SPELL_FLAG}`] = take.kept;
  if (price.pool === "ferocity" && ferocity && price.amount > 0) {
    const ferocityNow = poolsNow.find(p => p.itemId === ferocity.itemId && p.kind === "momentum" && p.name === ferocity.name) ?? ferocity;
    await actor.updatePool({ itemId: ferocity.itemId, kind: "momentum", value: payFromNow(ferocityNow.value, price.amount).value }, extra);
  } else if (pool && mana > 0 && price.pool === "mana") {
    const manaNow = poolsNow.find(p => p.itemId === pool.itemId && p.kind === "power" && p.name === pool.name) ?? pool;
    await actor.updatePool({ itemId: pool.itemId, kind: "power", value: payFromNow(manaNow.value, mana).value }, extra);
  } else if (payPool && price.pool === payPool.name && price.amount > 0) {
    // In the pool a talent names (door 8: Shadowcraft's Focus), off the pool as it stands now.
    const payNow = poolsNow.find(p => p.itemId === payPool.itemId && p.kind === payPool.kind && p.name === payPool.name) ?? payPool;
    await actor.updatePool({ itemId: payPool.itemId, kind: payPool.kind, value: payFromNow(payNow.value, price.amount).value }, extra);
  } else if (Object.keys(extra).length) await actor.update(extra);
  // The free cast's use, marked on its talent item STRAIGHT AFTER THE PAYMENT (the
  // Chromatic Champion plan; the 1B review, item 5 - D-761's shape): judged before the
  // budget, so no other write may stand between the price waived and the use spent.
  const freeCast = Boolean(freeCastLine) && manaDue > 0 && await markFreeCast(actor, freeCastLine);
  // Nature's Swiftness's use, struck once the cast is paid for (D-771).
  const castSwift = (Boolean(swiftCounter) || Boolean(swiftRow?.perRound)) && !free && beforeDreadAction !== sys.action;
  if (castSwift && swiftCounter) await swiftCounter.update({ "system.uses.value": Math.max(0, (swiftCounter.system?.uses?.value ?? 1) - 1) });
  // Riptide's once a round, marked through the queued door (D-761); a mark another
  // door took first leaves this cast its Half-Action as Adrenaline's does (D-773).
  if (castSwift && swiftMark && swiftMine?.isOwner) await swiftMine.markRoundOnce(swiftMark);
  // Inner Focus's use, struck now that the cast is paid for (D-774).
  const focused = Boolean(freeLine) && manaDue > 0 && await strikeTalentUse(actor, freeLine.identifier);
  // Backdraft's use, struck now that the cast is paid for (D-775).
  const backdrafted = Boolean(backdraft) && await strikeTalentUse(actor, backdraft.source);
  // Shadowform's mark: a healing spell used (D-774; MY READING, for the lead: a
  // cast made, whatever its Test).
  if (isHealingSpell(sys)) await markLightUsed(actor);
  // Devouring Plague's use, struck now that the cast is paid for, and the target
  // recorded so it is doubled once (D-779).
  const plagued = Boolean(doubleLine) && await strikeTalentUse(actor, doubleLine.identifier);
  if (plagued && plagueOn) {
    const done = actor.getFlag("azeroth-rpg", DEVOURING_PLAGUE.flag) ?? [];
    if (!done.includes(plagueOn.uuid)) await actor.setFlag("azeroth-rpg", DEVOURING_PLAGUE.flag, [...done, plagueOn.uuid]);
  }
  let relayPlacement = null;
  const thematicResolutionPending = [];
  // A paid attempt is a cast even if its durable claim write fails. Keep the
  // card and its ticket for GM reconciliation; never return after payment or
  // let a failed claim grant its effect.
  const recordThematicClaim = async (name, operation) => {
    try {
      const result = await operation();
      if (result?.ok) return result;
    } catch (error) {
      console.warn(`azeroth-rpg | ${name} claim`, error);
    }
    thematicResolutionPending.push(name);
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
    return false;
  };
  if (holyReview?.ticket) await recordThematicClaim("holy", () => holyTools.claimHolyCast(holyReview.ticket, cast));
  if (dreamReview?.ticket) await recordThematicClaim("dream", () => dreamTools.claimDreamCast(dreamReview.ticket, cast));
  if (relayReview?.ticket) {
    const claimedRelay = await recordThematicClaim("relay", () => relayMode === "setup"
      ? spellRelayTools.claimSpellRelaySetup(relayReview.ticket, cast)
      : spellRelayTools.claimRelayAttempt(relayReview.ticket, cast));
    if (claimedRelay?.placementOverride && relayMode === "attempt") relayPlacement = claimedRelay.placementOverride;
  }
  if (verdictReview?.ticket) await recordThematicClaim("verdict", () => holyTools.claimVerdictAttempt({ticket: verdictReview.ticket, attemptId: cast}));

  // 2b. 07 §8: casting a tier 5 Fel or Shadow spell accrues 1 point of
  // Corruption on its own track. Here, with the Mana, because CASTING is what
  // charges — a failed Casting Test still spends the Mana (D-301), so the
  // spell was cast either way. Unresisted: 10 §3 puts this among the
  // occasions *agreed to rather than suffered*, so there is no Test.
  await accrueCastingCorruption(actor, spell);
  // **AND THE VOID A BRANCH SPELL BUILDS** (the Chromatic Champion plan's Black branch:
  // *"have the black spells at tier 2 and tier 3 give void corruption"*): the talent
  // row's `void`, after the payment and whatever the Test, through the same
  // unresisted door. An item's casting is not the talent's.
  if (!viaItem) await accrueCastVoid(actor, spell, talentsNow);
  // **04's MANA HUNGER** (*Once a round, when a creature within 30 feet of you casts a spell,
  // gain 1 Rage*; stage 3B): a cast made is a cast whatever its Test comes to, so the holders
  // near the caster are fed here, once it is paid for - a creature's Spells line comes through
  // this door too (`applications/actions.mjs#castNamedSpell`). The active GM judges. **NOT
  // AWAITED** (the 3B review, should-fix 4): nothing in the cast depends on the Rage, and the
  // door asks nobody where no holder stands near.
  import("../effects/chromatic-flights.mjs").then(m => m.feedManaHunger({ caster: actor, source }))
    .catch(err => console.warn("azeroth-rpg | Mana Hunger", err));

  // 2c. **A CAST THAT COUNTS AS MOVING** (04's Shadowcraft: *Shadow Walk counts as
  // moving for your Focus*; the lead: *"Yes"*; the Legacy branches' door 9): the
  // round's record marked through the queued door, so the turn's end records a move
  // and the next turn's Focus refill waits (`rules/rest.mjs#turnMoved`).
  const movesBy = viaItem || free ? null : castMovesFor(talentsNow, { name: spell.name });
  if (movesBy) {
    const fightOfCast = actor.activeFight?.() ?? null;
    const castCombatant = fightOfCast ? (fightOfCast.getCombatantsByActor(actor)?.[0] ?? null) : null;
    if (castCombatant?.isOwner) await castCombatant.markRoundOnce(MOVED_MARK);
  }

  // **WHICH CAST THIS IS** (D-724): one key the card, the Sustain entry and
  // everything later laid or placed from the card all carry. It is generated
  // before payment and is NOT the message id, for four reasons. The Sustain entry below
  // is written before the card exists. Creating the card first would change
  // what a Sustain's own tests wait on, and would lose the Sustain the Mana has
  // already paid for if the card's creation threw. A message made with a fixed
  // `_id` and `keepId` overwrites rather than locks (D-721). And the key has to
  // outlive the card: a GM clearing the chat mid-fight must not orphan a
  // Blizzard somebody is still holding.

  // 3. The Test.
  const spellLock = await requestSpellLockWindow({ actor, source,
    test: { kind: "spell", itemUuid: spell.uuid } });
  if (!spellLock?.ok) {
    ui.notifications?.warn("The casting reaction window could not be confirmed. No Casting Test was rolled. Check the spell's paid costs and reaction records before trying again.");
    return null;
  }
  const modifiers = attackCalculation ? attackCalculation.modifiers.map(row=>({...row})) : [];
  if (!attackCalculation) {
    if (ability) modifiers.push({ label: AZEROTH.abilities[ability], value: abilityMod });
    modifiers.push({ label: "AZEROTH.Sheet.Proficiency", value: proficiency });
    if (Number(augment)) modifiers.push({ label: "AZEROTH.Cast.Augment", value: Number(augment) });
  } else if (Number.isFinite(Number(modifier)) && Number(modifier)) {
    modifiers.push({label:"AZEROTH.Dialog.Circumstance",value:Number(modifier)});
  }
  // **A GM's Casting Test bonus on what is equipped** (2026-11-02): a standing
  // line on every Casting Test, named for what the sheet calls it, never a
  // checkbox - it is the thing's number, not a judgement call (D2 §12).
  const itemCasting = castingBonusOf(actor?.system?.itemBonus?.casting);
  if (itemCasting) modifiers.push({ label: "AZEROTH.Cast.ItemBonus", value: itemCasting });
  // **THE DC THE ENTRY STATES, OR A TALENT RESTATES** (07: *Make a Casting Test
  // against DC 26*; 04's Sunfire and Cataclysm: *against DC 22 rather than 26*;
  // D-775), where no dialog handed one in. An item's casting reads the entry's own
  // DC through the same reader (the architect's review); a talent's restatement is
  // the caster's, and reaches none of an item's casting, as nothing else does.
  const statedDc = (viaItem ? null : spellDcFor(talentsNow, { name: spell.name })) ?? statedCastingDC(sys.effect);
  const resolvedDC = dc ?? statedDc ?? castingDC({ tier: sys.tier, targetDefense: first?.defense ?? null });
  const roll = AzerothRoll.build({
    dc: resolvedDC, modifiers, boons, banes: banes + spellLock.banes, kind: attackCalculation ? "attack" : "casting", rollData: actor.getRollData()
  });
  if (attackCalculation) {
    roll.options.attackTest = {...attackTest};
    roll.options.provenance.push({label:"AZEROTH.Blademaster.Row",value:null,formula:attackCalculation.title});
  }
  roll.options.spellLock = { castId: spellLock.castId, banes: spellLock.banes };
  if (spellLock.banes > 0) roll.options.provenance.push({ label: "Spell Lock", value: null,
    formula: `${spellLock.banes} ${spellLock.banes === 1 ? "Bane" : "Banes"}` });
  roll.options.provenance.push(...provenanceExtra);
  // What the talents took off the Mana, by name (D-775).
  for (const d of discount.by) roll.options.provenance.push({ label: d.name, value: null, formula: game.i18n.format("AZEROTH.Cast.NextSpellRow", { n: d.amount }) });
  if (oc.relief) roll.options.provenance.push({ label: "AZEROTH.Cast.OverchannelRelief", value: null, formula: game.i18n.format("AZEROTH.Cast.OverchannelReliefRow", { n: oc.relief }) });
  if (backdrafted) roll.options.provenance.push({ label: backdraft.name, value: null, formula: game.i18n.localize("AZEROTH.Cast.Swift.Row") });
  // WHAT PAID FOR IT, where it was not Mana (07, *The Druid in a form*; D-769).
  if (price.pool === "ferocity" && price.amount > 0) {
    roll.options.provenance.push({
      label: "AZEROTH.Shape.FerocityPaid", value: null,
      formula: game.i18n.format("AZEROTH.Shape.FerocityPaidRow", { ferocity: price.amount, mana })
    });
  }
  if (spellHealth) {
    roll.options.provenance.push({
      label: "AZEROTH.Cast.HealthCost", value: null,
      formula: game.i18n.format("AZEROTH.Cast.HealthCostRow", { health: spellHealth })
    });
  }
  if (oc.points) {
    roll.options.provenance.push({
      label: "AZEROTH.Cast.Overchannel", value: null,
      formula: mastery
        ? game.i18n.format("AZEROTH.Cast.OverchannelManaRow", { points: oc.points, mana: oc.mana })
        : game.i18n.format("AZEROTH.Cast.OverchannelRow", { points: oc.points, health: oc.health })
    });
  }
  // WHAT THE NEXT SPELL WAS PROMISED, AND TOOK (D-771): each talent's discount
  // by name, and the rung Nature's Swiftness cast it at. Only a discount names
  // Mana (D-775): Backdraft's rung and Soul Fire's promise say their own.
  for (const e of take.taken.filter(t => Math.trunc(Number(t.amount)) > 0)) {
    roll.options.provenance.push({ label: e.name || "AZEROTH.Cast.NextSpell", value: null, formula: game.i18n.format("AZEROTH.Cast.NextSpellRow", { n: e.amount }) });
  }
  if (castSwift) roll.options.provenance.push({ label: swiftRow.name, value: null, formula: game.i18n.localize("AZEROTH.Cast.Swift.Row") });
  if (focused) roll.options.provenance.push({ label: freeLine.name, value: null, formula: game.i18n.format("AZEROTH.TalentLine.FreeRow", { n: manaDue }) });
  if (freeCast) roll.options.provenance.push({ label: freeCastLine.name, value: null, formula: game.i18n.format("AZEROTH.FreeCast.Row", {
    n: manaDue, pool: game.i18n.localize(AZEROTH.poolTypes[freeCastLine.pool ?? "mana"] ?? freeCastLine.pool ?? "mana") }) });
  await roll.evaluate();
  // **SOUL FIRE** (04: *Your next spell this turn counts its Casting Test as
  // reaching SL 3*; D-775): the Test counts as a success at SL 3 - or at the SL
  // it rolled, where that is higher (MY READING, for the lead: *reaching SL 3* is
  // at least 3) - on the roll's own options, as Trueshot's forced hit is (D-773).
  const soulFire = take.taken.find(e => Math.trunc(Number(e.forcedSl)) > 0) ?? null;
  if (soulFire) {
    const rolled = roll.outcome;
    roll.options.forcedSl = Math.max(take.forcedSl, rolled?.success ? (rolled.sl ?? 0) : take.forcedSl);
    roll.options.provenance.push({ label: soulFire.name || "AZEROTH.SoulFire.Label", value: null, formula: game.i18n.format("AZEROTH.SoulFire.Row", { sl: take.forcedSl, n: take.damage }) });
  }
  // **04's MIRACLE** (the lead, 2026-10-03, on O-185: *"... without requiring a
  // casting test for the next healing spell ..."*; D-779): the healing spell takes no
  // Casting Test - it succeeds, at the SL it rolled or a bare success where that is
  // lower (READING: no Test, so no Success Level is lost to the die) - on the roll's
  // own options, as Soul Fire's and Trueshot's are.
  if (take.miracle) {
    const rolled = roll.outcome;
    roll.options.forcedSl = rolled?.success ? Math.max(0, rolled.sl ?? 0) : 0;
    roll.options.provenance.push({ label: take.miracle.name || "AZEROTH.Miracle.Label", value: null, formula: game.i18n.localize("AZEROTH.Miracle.Row") });
  }
  // **04's DISRUPT WEAVE, ASKED IN THE CAST** (*spend Rage equal to that spell's tier plus 2.
  // The caster makes a Spirit Resilience Test against your Spell DC. On a failure the spell
  // fails and its Mana is spent*; stage 3B): after the payment and the die, before anything
  // follows from either, of each holder near enough (`effects/chromatic-reactions.mjs`). A
  // spell cast through an Attack Test (04's Blademaster's) is no Casting Test.
  if (!attackCalculation) {
    try {
      await (await import("../effects/chromatic-reactions.mjs")).askDisruptWeave({ caster: actor, spell, roll });
    } catch (err) {
      console.warn("azeroth-rpg | Disrupt Weave", err);
    }
  }
  await actor.offerElunesRegard?.(roll);
  const outcome = roll.outcome;
  // 06 §6 (D-693): Pummel's two Banes land on *the next Casting Test it
  // makes*, and this is that Test. Spent after the die, whatever the roller
  // did with the dialog's line.
  if (attackPromises) await takeNextAttack(actor,attackPromises);
  const pummelled = await spendLaidBanes(actor, attackCalculation ? "attack" : "casting");
  if (pummelled.length) {
    roll.options.provenance.push({ label: "AZEROTH.Modifier.LaidBane", value: null, formula: pummelled.join(", ") });
  }
  // And a Boon somebody laid (04's Blessing, D-772): spent the same way.
  const blessed = await spendLaidBoons(actor, attackCalculation ? "attack" : "casting");
  if (blessed.length) {
    roll.options.provenance.push({ label: "AZEROTH.Modifier.LaidBoon", value: null, formula: blessed.join(", ") });
  }
  const success = outcome.success;
  const reflectedTargets = success && reflectedPlan.reflections.length ? [...list] : null;
  if (reflectedTargets) {
    list = reflectedPlan.targets;
    first = list[0] ?? null;
    roll.options.provenance.push({ label: "Reflection Field", value: null,
      formula: `${reflectedPlan.reflections.length} target effect(s) returned toward the caster.` });
  }
  if (chainTools && success) {
    const route = chainTools.resolveChainLightningPath({ actor, spell, source, targets: list, viaItem });
    chainUnresolved = !route.ok;
    if (route.ok) {
      const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
      list = targetSnapshots(route.tokens.map(token => ({ id: token.id, name: token.name, actor: token.actor, scene: token.parent })));
      chainPrivate = route.tokens.some(token => token.hidden === true);
    } else {
      // The cast is already paid. Post its roll without damage controls;
      // never guess a route or invite the player to pay for the cast again.
      list = [];
      ui.notifications?.warn(game.i18n.localize("AZEROTH.ChainLightning.RouteUnresolved"));
    }
    first = list[0] ?? null;
  }
  // Read the final recipient after reflection. A failed read is a paid,
  // unresolved cast, never permission to use guessed damage or repeat payment.
  if (conflagrateTools && success) {
    conflagrate = await conflagrateTools.requestConflagratePreparation(actor, spell, list, {burning:!reflectedTargets && conflagrateBurning});
    if (!conflagrate?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Conflagrate.Unresolved"));
  }
  // **THE STEP, NOW THAT THE SPELL WENT OFF** (door 3): the caster displaced to the
  // space picked, and Dark Passage's targets each by the caster's own displacement,
  // so the party arrives as it stood - each space judged again for its room, and
  // one refused said and left. A failed Casting Test moves nobody (07 §8).
  const crossingPublication = spellCrossing && success && stepPicked?.doc
    ? await import('../effects/spell-crossing-publication.mjs') : null;
  const crossingRecord = crossingPublication ? await crossingPublication.recordCrossingMove({
    actor,spell,cast,bonuses:chosenSignaturePreparation.bonuses,
    plan:{sceneId:stepPicked.doc.parent.id,tokenId:stepPicked.doc.id,origin:stepPicked.from,destination:stepPicked.to},
    perform:()=>castStepLines({actor,spell,step:spellStep,picked:stepPicked,success})
  }) : null;
  const stepLines = crossingRecord?.lines ?? await castStepLines({ actor, spell, step: spellStep, picked: stepPicked, success });
  // **ASCENDANCE** (04: *your Fire and Nature damage spells count as reaching one
  // SL higher until your next turn*; D-774): the SL everything after the die
  // reads, never whether the Test succeeded (MY READING, for the lead).
  const ascended = flaggedEffects(actor, ASCEND_FLAG)[0]?.flag ?? null;
  const testSl = overchannelledSL(outcome.sl, oc.points);
  const sl = ascendedSl(testSl, { school: sys.damage?.school ?? school, damages: sys.damage?.rating !== null && sys.damage?.rating !== undefined, success, ascended });
  if(missileTools){
    const {arcaneMissilesCount}=await import('../rules/arcane-missiles.mjs');
    const valid=missileTools.validArcaneMissilesTargets(list);
    list=list.slice(0,valid?arcaneMissilesCount({success,sl,count:list.length}):1);
    if(!valid)ui.notifications?.warn(game.i18n.localize('AZEROTH.Cast.ArcaneMissilesTargets'));
    first=list[0]??null;
  }
  if (sl !== testSl) roll.options.provenance.push({ label: ascended?.source || "AZEROTH.Ascendance.Label", value: null, formula: game.i18n.format("AZEROTH.Ascendance.Row", { n: sl - testSl }) });
  // **A STATIC CHARGE** (04: *When a Casting Test you make meets or exceeds SL 2,
  // you gain a Static Charge*; D-774).
  // A failed Test's SL is never lifted into a rider by Overchannel's points (07 SS8:
  // *The spell does not go off*; D-812): the Test's own SL is what a failure reads.
  const riderSlNow = success ? sl : outcome.sl;
  if (!viaItem && await gainCharge(actor, riderSlNow)) roll.options.provenance.push({ label: "AZEROTH.TalentLine.ChargeGained", value: null, formula: game.i18n.format("AZEROTH.TalentLine.ChargesNow", { n: Number(actor.getFlag("azeroth-rpg", CHARGE_FLAG)) || 0 }) });
  // **MANA BACK AT SL 2** (04's Illumination: *When a Casting Test of yours
  // reaches SL 2 or better, 1 Mana per rank returns to you*; D-772), into the
  // pool that paid, never past its maximum - and on a cast that paid nothing as
  // well, since the words ask only for the Test.
  // **AND CLEARCASTING** (04: *When you Overchannel and the Casting Test succeeds,
  // 2 Mana per rank returns to you*; D-775).
  const manaBack = manaBackFor(talentsNow, { sl, overchannelled: oc.points > 0, success });
  const illuminated = manaBack.amount > 0 ? await restoreMana(actor, pool, manaBack.amount) : 0;
  if (illuminated > 0) {
    roll.options.provenance.push({ label: manaBack.by.join(", "), value: null, formula: game.i18n.format("AZEROTH.Cast.ManaBackRow", { n: illuminated }) });
  }
  // **A CASTING TEST AT SL 2 OR BETTER** (04's Nature's Grace, D-771): *your
  // next spell costs 1 less Mana per rank*, laid on the caster now - after this
  // cast's own payment took whatever stood. Overchannel's points are the
  // Test's own SL (07 §8: *each point adds +1 SL to the Casting Test*).
  // **AND BACKDRAFT** at SL 3 (D-775), laid only while its counter holds a use.
  const graces = nextSpellGrants(talentsNow, { on: "casting", sl: riderSlNow }).filter(g => !g.cast || talentUsesLeft(actor, g.source) > 0);
  if (graces.length) await layNextSpell(actor, graces);
  // **ECLIPSE** (04, D-771): a Nature or Arcane cast that went off takes the
  // bonus a cast of the other school left pending, and leaves the other
  // pending in turn. The state is the caster's own flag.
  const alternate = alternateFor(actor.takenTalents());
  const eclipse = alternate && success ? alternateCast(actor.getFlag("azeroth-rpg", ALTERNATE_FLAG) ?? null, school, alternate) : { bonus: 0, next: null };
  if (alternate && success && eclipse.next !== (actor.getFlag("azeroth-rpg", ALTERNATE_FLAG) ?? null)) {
    await actor.setFlag("azeroth-rpg", ALTERNATE_FLAG, eclipse.next);
  }
  const eclipseBonus = eclipse.bonus;

  // 4. Damage, per target, on the spell lane. From tier 3 up a damaging
  // spell deals 1 more per point of Spellpower the caster carries in its
  // school (07 §9, 2026-09-06); the entry is the authority below that.
  // **FEL FIRE** (04: *When you cast a Fire spell you may have it deal Fel damage
  // instead*; D-775): the line ticked makes the damage Fel, and every reading keyed
  // on the damage's type - Spellpower, the Ward, Immune - reads Fel (MY READING,
  // for the lead).
  const damageSchool = convertLine ? convertLine.to : (sys.damage?.school ?? school);
  // **WHAT A TALENT ADDS TO THIS CAST'S OWN DAMAGE** (D-775): Fel Fire's rank (*adds
  // your rank to its damage against anything not Immune (Fel)* - an Immune target
  // takes none of it anyway) and Soul Fire's tier (*adds your tier to its damage*):
  // on the cast's hit where it deals one, else on its tick (MY READING, for the
  // lead: *its damage* is the tick of a spell whose damage is its tick).
  const promisedDamage = (convertLine?.amount ?? 0) + take.damage;
  const hitAdd = castDealsDamage(sys) ? promisedDamage : 0;
  const tickAdd = castDealsDamage(sys) ? 0 : promisedDamage;
  // A talent that raises this spell's Damage Rating (2026-09-07): the
  // Warlock's *Shadow Bolt* reads *Each rank adds 1 to its Damage Rating*, and
  // the words reached the card as a note while the number reached nothing.
  const talentDamage = spellDamageFor(actor.takenTalents(), { name: spell.name, school });
  // **WHAT THE CASTER STANDS ON, IN ONE FUNCTION** (D-756): Spellpower (tier 3
  // up, 07 §9), a Corruption rung's Damage Rating (10 §4, §9), the talent rows
  // above, a Signature scoped to a school's spells (08 §20, D-692) or to this
  // spell by name (D-698), and the spell lane a `final`-phase effect wrote -
  // Seal of Command's Holy, Arcane Power's, Demonic Pact's aura. An area's tick
  // adds exactly these at the start of a turn (`AzerothCombat#_areaTicks`), so
  // the card and the tick cannot disagree about them.
  const standing = standingSpellBonus(actor.system, { name: spell.name, damageSchool, takesSpellpower: sys.takesSpellpower === true }, talentDamage);
  const { spellpower, corruption: corruptionBonus, talents: talentBonus, signatureSchool: signatureSpell, signatureNamed, lane: laneBonus } = standing;
  // The Damage lines the roller left ticked on the dialog: THIS roll's alone.
  const lineBonus = Math.max(0, Math.trunc(Number(extraRating)) || 0);
  const rating = sys.damage?.rating === null || sys.damage?.rating === undefined
    ? null
    : sys.damage.rating + spellpower + corruptionBonus + talentBonus + signatureSpell + signatureNamed + laneBonus + lineBonus + eclipseBonus + hitAdd;
  // **A CARD NAMES WHAT ADDS TO A DAMAGE IT DEALS** (the review, N6). Where the
  // damage is the area's tick (`castDealsDamage`), the cast deals none, so the
  // card lists no Spellpower, rung, Signature or talent row for it: the tick
  // reads what the caster stands on at the start of each turn, and a row here
  // would promise the card a number it never lands.
  const namesBonuses = rating !== null && castDealsDamage(sys);
  if (namesBonuses && spellpower) roll.options.provenance.push({ label: "AZEROTH.Card.Spellpower", value: spellpower });
  if (namesBonuses && corruptionBonus) roll.options.provenance.push({ label: "AZEROTH.Corruption.DamageBonus", value: corruptionBonus });
  if (namesBonuses && signatureSpell) roll.options.provenance.push({ label: "AZEROTH.Card.SignatureRating", value: signatureSpell });
  if (namesBonuses && signatureNamed) roll.options.provenance.push({ label: "AZEROTH.Card.SignatureRating", value: signatureNamed });
  if (namesBonuses) for (const t of talentDamage) roll.options.provenance.push({ label: t.name, value: t.amount });
  if (namesBonuses && laneBonus) roll.options.provenance.push({ label: "AZEROTH.Card.TalentDamage", value: laneBonus });
  if (namesBonuses && lineBonus) {
    for (const row of damageRows) roll.options.provenance.push({ label: row.name, value: row.amount });
  }
  if (namesBonuses && eclipseBonus) roll.options.provenance.push({ label: alternate.name, value: eclipseBonus });
  if (namesBonuses && convertLine?.amount) roll.options.provenance.push({ label: convertLine.name, value: convertLine.amount });
  if (namesBonuses && take.damage) roll.options.provenance.push({ label: soulFire?.name || "AZEROTH.SoulFire.Label", value: take.damage });
  // **THE WARD THIS CAST IGNORES** (04's Celestial Alignment: *while it runs
  // your Arcane and Nature spells ignore 2 Ward*; D-771), off the SPELL's
  // school, through the one reading an area's tick and a laid tick take too.
  // **AND LAVA BURST** (04: *A Fire spell of yours ignores 2 Ward per rank*;
  // D-774): the line ticked, its use struck where the spell went off.
  // **AND FIRE BLAST AT RANK 2** (04: *At rank 2 it also ignores 2 Ward*; D-775):
  // the Fire spell cast at a Half-Action through its line.
  const lavaPierce = pierceLine && success ? pierceLine.amount : 0;
  const blastPierce = castSwift ? Math.max(0, Math.trunc(Number(swiftRow?.pierce)) || 0) : 0;
  const wardPierce = Math.max(0, Math.trunc(Number(actor.spellWardPierce?.(school)) || 0)) + lavaPierce + blastPierce;
  if (lavaPierce > 0 && await strikeTalentUse(actor, pierceLine.identifier)) {
    roll.options.provenance.push({ label: pierceLine.name, value: null, formula: game.i18n.format("AZEROTH.Cast.WardPierceRow", { n: lavaPierce }) });
  }
  if (namesBonuses && wardPierce) {
    roll.options.provenance.push({ label: "AZEROTH.Cast.WardPierce", value: null, formula: game.i18n.format("AZEROTH.Cast.WardPierceRow", { n: wardPierce }) });
  }
  // Ice Lance's rider (2026-09-06): the Rating against a target in one of
  // its conditions, taken where the target is, offered where the table
  // knows better. The extras ride the rider's Rating as they ride the base.
  const rider = sys.rider?.rating !== null && sys.rider?.rating !== undefined && sys.rider.statuses?.length ? sys.rider : null;
  const extras = spellpower + corruptionBonus + talentBonus + signatureSpell + signatureNamed + laneBonus + lineBonus + eclipseBonus + hitAdd;
  const ratingFor = t => (missileTools&&list.indexOf(t)===1?{rating:2,applied:false}
    :rider ? riderRating(rider, sys.damage.rating, t?.statuses ?? []) : { rating: sys.damage?.rating ?? null, applied: false });
  // **BURNING SOUL** (04: *Your Fire spells treat Immune (Fire) as Ward 3 instead*;
  // D-775): the immunity read as Ward on the damage's own school.
  const asWard = viaItem ? 0 : immuneAsWardFor(talentsNow, { school: damageSchool }).ward;
  // **WHAT A STANDING EFFECT ADDS TO EVERY SPELL AS ITS OWN TYPE** (04's Arcane
  // Power: *your spells add 1 Arcane damage per rank*; D-777, the lead:
  // *"Different damage types in one attack are possible"*): a second amount, met
  // by the target's own Ward of its type - an Arcane spell's own Rating takes it -
  // and never a Ward the spell's own school ignores. An item's casting is the
  // caster's spell too.
  const typedSpell = typedLaneExtras(actor.system, "spell");
  const conflagrateRules = conflagrateTools ? await import("../rules/conflagrate.mjs") : null;
  const castRating = value => conflagrateRules
    ? conflagrateRules.conflagrateRating(value, conflagrate?.targets?.[0] ?? {}).rating ?? 0 : value;
  // 04's Drawn Across on the caster (door 25): the spell's damage halved before Ward.
  const halvedCast = dealtHalvedBy(actor);
  const mitigate = (t, forced = null, { typed = true, passed = false, signatureIndex = null } = {}) => {
    const read = immuneReadAsWard({ immune: t?.immune ?? [], ward: Math.max(0, (t?.wardBySchool?.[damageSchool] ?? 0) - wardPierce), school: damageSchool, asWard });
    return resolveDamage({
      rating: castRating(forced ?? (rating === null ? 0 : ratingFor(t).rating + extras)), sl, kind: "magical", school: damageSchool,
      fireTakenBonus: t?.fireTakenBonus ?? 0,
      ward: read.ward,
      // An ally's aura, after the Ward (04's Avenging Bulwark, D-755).
      schoolArmor: t?.schoolArmor?.[damageSchool] ?? 0,
      immune: read.immune, vulnerable: t?.vulnerable ?? [],
      slAddsToDamage: false,
      extras: typed ? [...typedSpell, ...chosenSignatureExtras(chosenSignaturePreparation.bonuses,list.map(signatureRecipientKey),signatureIndex)] : [], wardBySchool: t?.wardBySchool ?? {}, schoolArmorBySchool: t?.schoolArmor ?? {},
      dealtHalved: halvedCast,
      // Half on a passed Test (the lead: *"Build it everywhere"*), before Armor and Ward.
      passedHalf: passed,
      // 07's *bypassing armor and Ward* (the B8a2 pass): neither comes off it.
      bypass: sys.damage?.bypass === true
    });
  };
  // **AN AREA THAT STRIKES AT THE START OF A TURN DEALS NOTHING ON THE CAST**
  // (D-756; the lead's play-test): 07's Consecration lands its 2 Holy on an
  // enemy that STARTS ITS TURN inside, and the card applied it to whoever was
  // targeted when the Paladin cast. The tick carries it now, and the card
  // offers no damage, no Apply and no rider for it.
  const hit = rating !== null && success && !chainUnresolved && castDealsDamage(sys)
    && (!conflagrateTools || (conflagrate?.ok && conflagrate.targets[0].burning));
  if (hit && halvedCast) roll.options.provenance.push({ label: halvedCast.source, value: null, formula: game.i18n.localize("AZEROTH.HalvesDealt.Row") });
  // **A STATIC CHARGE SPENT ON THIS DAMAGE** (04: *When you deal damage you may
  // spend a Static Charge to add your tier to that damage*; D-774): where the
  // spell deals it, off the flag as it stands now.
  const charged = hit && chargeLine && await spendCharge(actor) ? chargeLine.amount : 0;
  if (charged) roll.options.provenance.push({ label: chargeLine.name, value: charged });
  // **04's VOID SURGE ON A BRANCH SPELL** (*When an attack or a branch spell of yours deals
  // damage, spend up to your tier in Void Corruption. The blow deals 1 more damage per rank
  // for each Void Corruption spent*; stage 3A): the line ticked, spent where the spell deals
  // its damage - the most the track holds up to the cap, off the track as it stands now -
  // and the Black Drake's further 1 a Void in its form (`voidSpendFor`).
  const champForm = actor.shape?.kind === "drake" ? (actor.shape.forms?.[0]?.name ?? null) : null;
  const surgePlan = hit && surgeLine && !viaItem ? voidSpendFor(talentsNow, { tier: actor.system?.tier ?? 1, form: champForm }, talentEffect) : null;
  const voidHeld = Math.max(0, Math.trunc(Number(actor.system?.corruption?.void)) || 0);
  const surgeSpent = surgePlan ? Math.min(voidHeld, surgePlan.cap) : 0;
  const surgeDone = surgeSpent > 0 ? voidSpendOutcome(surgePlan, { spent: surgeSpent, sl, hit: true }) : null;
  if (surgeDone) {
    await actor.update({ "system.corruption.void": Math.max(0, voidHeld - surgeSpent) });
    roll.options.provenance.push({ label: surgePlan.by, value: surgeDone.damage });
  }
  const surgeAdd = surgeDone?.damage ?? 0;
  // **04's CHARGED STEEL** (*your next branch spell to damage that creature before the end of
  // your next turn deals 1 more damage per rank*; stage 3A): each creature's own promise,
  // taken off the caster's flag by this branch spell.
  const steel = hit && !viaItem && branchSpellOf(talentsNow, spell.name, talentEffect)
    ? await (await import("../effects/chromatic-talents.mjs")).takeChargedSteel(actor, list.map(t => targetActorOf(t)?.uuid).filter(Boolean))
    : { by: {}, names: [] };
  for (const n of steel.names) roll.options.provenance.push({ label: n, value: null, formula: game.i18n.localize("AZEROTH.ChargedSteel.Row") });
  const boostOf = t => charged + surgeAdd + (steel.by[targetActorOf(t)?.uuid] ?? 0);
  const forcedFor = t => (boostOf(t) ? (ratingFor(t).rating ?? 0) + extras + boostOf(t) : null);
  const damageByTarget = list.map((t,index) => (hit ? mitigate(t, forcedFor(t),{signatureIndex:index}) : null));
  // **04's LIFEBINDER'S FLAME, SPLIT** (*Work out the damage it deals after Armor Points and
  // Ward. Its target takes half of that, rounded down, and one creature ... regains Health
  // equal to the other half plus your Constitution modifier*; stage 3A): each row's damage
  // after its Armor Points and Ward halved, rounded down, on the card's own Apply, and the
  // heal recorded for the creatures picked - landed once the card stands (`landLifebinder`).
  // A row's second amounts ride its halved number (MY READING, for the lead).
  let lifebinderRecord = null;
  const splitLines = [];
  if (splitPicked && hit) {
    const split = lifebinderSplit({
      dealt: damageByTarget.map(r => r?.damage ?? 0), conMod: actor.system?.abilities?.con?.mod ?? 0,
      heals: splitPicked.picks.length, plan: splitPicked.plan, tier: actor.system?.tier ?? 1
    });
    for (const [i, r] of damageByTarget.entries()) if (r) damageByTarget[i] = { ...r, damage: split.takes[i] ?? r.damage, parts: null, split: true };
    lifebinderRecord = {
      by: actor.uuid, name: splitLine.name, cleanse: splitPicked.plan?.cleanse ?? null, self: split.self,
      selfBy: splitPicked.plan?.selfBy ?? null,
      heals: splitPicked.picks.map((p, i) => ({ ...p, amount: split.shares[i] ?? 0 })), landed: []
    };
    roll.options.provenance.push({ label: splitLine.name, value: null, formula: game.i18n.localize("AZEROTH.Lifebinder.Row") });
    splitLines.push(game.i18n.format("AZEROTH.Lifebinder.Line", {
      talent: splitLine.name, heals: lifebinderRecord.heals.map(h => `${h.name} ${h.amount}`).join(", ")
    }));
  }
  // Current Mana is read when Apply is pressed. Store each possible shortage
  // through the SAME mitigation path, so Ward and halving meet the whole hit.
  const manaBurn = hit && sys.identifier === "mana-burn"
    ? list.map((t,index) => Array.from({ length: 4 }, (_, shortage) =>
      mitigate(t, (ratingFor(t).rating ?? 0) + extras + charged + shortage,{signatureIndex:index})))
    : null;
  const damageResult = hit ? (damageByTarget[0] ?? mitigate(null, (charged + surgeAdd) ? (rating ?? 0) + charged + surgeAdd : null)) : null;
  // What the card's one button adds where no target is recorded (Static Charge, Void Surge).
  const looseBoost = charged + surgeAdd;
  // **WHAT A CREATURE THAT PASSES ITS TEST TAKES** (07's *and half of that, rounded down,
  // on a success*, stamped as `damage.half` off the entry's own sentence; the lead:
  // *"Build it everywhere"*): each row's half, halved before the same creature's Ward, and
  // the one button's, ready for the card's Apply to land on a creature whose Resist on
  // this card is recorded as passed (`rules/resisted.mjs#halvesFor`).
  const halfOnPass = hit && sys.damage?.half === true && Boolean(sys.test?.resilience);
  // A split cast's passed rows are halved too (D-845, the Breath's reading; no branch Fire spell
  // carries a half on a pass today, so this guards the next one that does).
  const passedRaw = halfOnPass ? list.map((t,index) => mitigate(t, forcedFor(t), { passed: true, signatureIndex:index })) : [];
  const passedByTarget = lifebinderRecord ? splitRows(passedRaw) : passedRaw;
  const passedLoose = halfOnPass ? mitigate(null, looseBoost ? (rating ?? 0) + looseBoost : null, { passed: true }).damage : null;
  const damagePassed = lifebinderRecord && passedLoose !== null ? Math.floor(Math.max(0, Number(passedLoose) || 0) / 2) : passedLoose;
  // **AND WHAT IT TAKES WHERE ITS FAILURE IS WHAT DEALS THE DAMAGE** (07's Rimebind: *On a
  // failure it takes 2 Frost damage*, stamped as `damage.onFail` off the entry's own
  // sentence; the B8a pass): nothing - the card's Apply lands none of it on a creature
  // whose Resist on this card is recorded as passed (`rules/resisted.mjs#sparedFor`), and
  // the damage line says so in words.
  const noneOnPass = hit && !halfOnPass && sys.damage?.onFail === true && Boolean(sys.test?.resilience);
  // **SHATTER AT RANK 2** (04: *At rank 2 they inflict a Critical Injury on 19 or 20
  // against such a target*; D-775): a spell that struck, its die on the face or
  // above, against a first target Entangled, Slowed or with its Speed dropped. The
  // card offers the injury's roll, the attack card's own button.
  const shatter = hit && !viaItem ? spellCriticalFor(talentsNow, { facts: { slowedTarget: speedReducedFact({ statuses: first?.statuses ?? [], speedDropped: first?.speedDropped === true }) } }) : null;
  const spellCritical = shatter && (Number(roll.natural) || 0) >= shatter.on ? { on: shatter.on, by: shatter.by } : null;
  if (spellCritical) roll.options.provenance.push({ label: spellCritical.by.join(", "), value: null, formula: game.i18n.format("AZEROTH.Shatter.CriticalRow", { n: spellCritical.on }) });
  // **THE SPEED DROP A HIT LAYS** (07's Frostbolt: *its Speed drops by 10 feet until
  // the end of your next turn. At SL 3 or better it is **Slowed** until the end of
  // your next turn instead*; Ice Spear and Wrath at SL 2; D-778, O-203): with the
  // blow, on every creature the card records - the lead's *"Lands automatically"*
  // for what a hit lays (D-770) - through the ONE Speed-drop door, keyed on the
  // CASTER's next turn, the door adding the caster's Permafrost; or Slowed in its
  // place, carrying Permafrost's feet on its own effect. Out of a fight there is no
  // turn to end it on and it is the table's, said in words (Wing Clip's rule, D-773).
  const speedLines = [];
  const conditionLines = [...splitLines];
  // What a Void Surge spend on this cast lands beside its damage (04's Obsidian Skin and
  // Earthshatter; stage 3A), on every creature the card records.
  if (surgeDone) {
    const { landVoidSpend } = await import("../effects/chromatic-talents.mjs");
    conditionLines.push(game.i18n.format("AZEROTH.VoidSpend.Spent", { name: actor.name, n: surgeSpent, damage: surgeDone.damage }),
      ...(await landVoidSpend({ actor, outcome: surgeDone, targets: list, source: surgePlan.names.join(", ") })).lines);
  }
  // **A WARD COMES OFF THE SUCCESS LEVEL AS WELL AS OFF THE DAMAGE** (07 SS8; D-812):
  // each creature's rider reads the SL its own Ward left (`rules/spell-sl-riders.mjs
  // #riderSl`), so a target with Ward 3 shrugs off a rider an SL 3 cast carried.
  const hitConditionRead = hit && !sys.test?.resilience ? spellHitCondition(sys.effect,{success,sl}) : null;
  if (hitConditionRead) for (const [ti, target] of list.entries()) {
    const victim=targetActorOf(target);
    const name=target?.name ?? victim?.name ?? "";
    const hitCondition = spellHitCondition(sys.effect,{success,sl:riderSl(damageByTarget[ti],sl)});
    if (!hitCondition) {
      conditionLines.push(game.i18n.format("AZEROTH.SlRider.Warded",{name,spell:spell.name}));
      continue;
    }
    // 07's Stone Spike: *knocked Prone* carries no span of its own (D-812).
    const span=victim && hitCondition.until ? untilEndOfNextTurn(victim) : null;
    if (hitCondition.until && !span) {
      conditionLines.push(game.i18n.format("AZEROTH.SpellHitCondition.NoTurn",{name,spell:spell.name,condition:game.i18n.localize(AZEROTH.conditions[hitCondition.status])}));
      continue;
    }
    conditionLines.push(landedText(await inflictCondition({victim,id:hitCondition.status,by:actor,name,until:span})));
  }
  const dropCast = hit && !viaItem ? speedDropAt(speedRead, { sl, success }) : { feet: 0, slowed: false };
  if ((dropCast.feet > 0 || dropCast.slowed) && list.length) {
    const span = untilEndOfNextTurn(actor);
    for (const [ti, t] of list.entries()) {
      const victim = targetActorOf(t);
      const name = t?.name ?? victim?.name ?? "";
      // Each creature's own SL after its Ward (07 SS8; D-812).
      const dropNow = speedDropAt(speedRead, { sl: riderSl(damageByTarget[ti], sl), success });
      if (!(dropNow.feet > 0 || dropNow.slowed)) {
        speedLines.push(game.i18n.format("AZEROTH.SlRider.Warded", { name, spell: spell.name }));
        continue;
      }
      const slowing = dropNow.slowed ? slowingFor(talentsNow) : null;
      if (!span) {
        speedLines.push(game.i18n.format("AZEROTH.SpeedDrop.NoFightSpell", { name, spell: spell.name }));
        continue;
      }
      if (dropNow.slowed) {
        const landed = await inflictCondition({
          victim, id: "slowed", by: actor, name, until: span,
          marks: slowing ? { [SLOWED_FEET_FLAG]: { feet: slowing.feet, source: slowing.by.join(", ") } } : {}
        });
        speedLines.push(landedText(landed));
        if (landed?.landed && slowing) speedLines.push(game.i18n.format("AZEROTH.SpeedDrop.SlowedFeet", { name, feet: slowing.feet, talent: slowing.by.join(", ") }));
      } else {
        const dropped = await laySpeedDrop({ victim, feet: dropNow.feet, source: spell.name, by: actor, span, name });
        speedLines.push(game.i18n.format(dropped?.landed ? "AZEROTH.SpeedDrop.LandedSpell" : "AZEROTH.SpeedDrop.NotLanded", { name: dropped?.name || name, feet: dropped?.landed ? dropped.feet : dropNow.feet, spell: spell.name }));
      }
    }
  }
  // **WHAT THE SUCCESS LEVEL ADDS WHERE NO OTHER READER TAKES IT** (07; D-812; the
  // lead: *"complete them"*): Searing Pain's Bane on the creature's next Attack Test,
  // a span to the end of its next turn at SL 2, through 06 SS6's Bane door; and Fel
  // Bolt's Ward against Fel dropping by 1 until the end of the CASTER's next turn at
  // SL 3, through the hit-mark door - each on every creature the card records, at the
  // SL its own Ward leaves, and said on the card. Out of a fight the Ward drop has no
  // turn to end on and is the table's, said in words (the Speed drop's rule).
  const slRead = readSlRider(sys.effect);
  if (hit && slRead?.kind === "hitBane") {
    for (const [ti, t] of list.entries()) {
      const victim = targetActorOf(t);
      const name = t?.name ?? victim?.name ?? "";
      const bane = hitBaneAt(slRead, { sl: riderSl(damageByTarget[ti], sl), success });
      if (!bane || !victim) continue;
      const laid = await layBane({ victim, kind: bane.test, banes: bane.banes, source: spell.name, by: actor, lasting: bane.lasting, span: bane.lasting ? untilEndOfNextTurnOrRound(victim) : null });
      conditionLines.push(game.i18n.format(!laid ? "AZEROTH.SlRider.BaneNot" : (bane.lasting ? "AZEROTH.SlRider.BaneLasting" : "AZEROTH.SlRider.Bane"),
        { name, spell: spell.name, kind: game.i18n.localize(AZEROTH.testKinds[bane.test] ?? bane.test) }));
    }
  }
  if (hit && slRead?.kind === "hitWardDrop") {
    const span = untilEndOfNextTurn(actor);
    const schoolName = game.i18n.localize(AZEROTH.schools[slRead.school] ?? slRead.school);
    for (const [ti, t] of list.entries()) {
      const victim = targetActorOf(t);
      const name = t?.name ?? victim?.name ?? "";
      if (!slRiderHolds(slRead, { sl: riderSl(damageByTarget[ti], sl), success })) {
        if (slRiderHolds(slRead, { sl, success })) conditionLines.push(game.i18n.format("AZEROTH.SlRider.Warded", { name, spell: spell.name }));
        continue;
      }
      if (!span) {
        conditionLines.push(game.i18n.format("AZEROTH.SlRider.WardDropNoFight", { name, spell: spell.name, n: slRead.amount, school: schoolName }));
        continue;
      }
      const laid = await layHitMark({ victim, mark: { kind: "wardDrop", source: spell.name, school: slRead.school, amount: slRead.amount }, by: actor, span, name });
      conditionLines.push(game.i18n.format(laid.landed ? "AZEROTH.SlRider.WardDrop" : "AZEROTH.SlRider.WardDropNot", { name, spell: spell.name, n: slRead.amount, school: schoolName }));
    }
  }
  // **07's SHATTERING BOLT AT SL 2** (*At SL 2 or better the target loses 1 Armor Point at
  // every location until it finishes a Short Rest*; stage 3A): a mark the hit-mark door lays
  // on each creature at the SL its own Ward left, carrying Sunder's own `sundered` flag, so
  // the Short Rest door that ends a Sunder ends it (`AzerothActor#clearSundered`).
  if (hit && slRead?.kind === "hitApDrop") {
    for (const [ti, t] of list.entries()) {
      const victim = targetActorOf(t);
      const name = t?.name ?? victim?.name ?? "";
      if (!slRiderHolds(slRead, { sl: riderSl(damageByTarget[ti], sl), success })) {
        if (slRiderHolds(slRead, { sl, success })) conditionLines.push(game.i18n.format("AZEROTH.SlRider.Warded", { name, spell: spell.name }));
        continue;
      }
      const laid = await layHitMark({ victim, mark: { kind: "apDrop", source: spell.name, amount: slRead.amount }, by: actor, span: null, name });
      conditionLines.push(game.i18n.format(laid.landed ? "AZEROTH.SlRider.ApDrop" : "AZEROTH.SlRider.ApDropNot", { name, spell: spell.name, n: slRead.amount }));
    }
  }
  // **07's UNWEAVE** (*Every spell effect on the target ends, whoever cast it*; the Chromatic
  // Champion plan's Phase 4, door 4): on a cast that went off, each creature the card records
  // has every spell effect on it ended - a laid spell or a spell's tick, by
  // `rules/dispel.mjs#spellCasterOf` - that 02's Dispel's own judgement lets end
  // (`dispelJudgement`: never a condition, a marked effect or an Archmage's), through
  // Dispel's one write (`effects/dispel.mjs#endEffects`, on the GM's client where this one
  // does not own the creature). **And 04's Spellthief** on the Champion who ended something.
  // The second half - *may not benefit from a spell of the school you name* - is the
  // entry's own words, carried by no condition, and stays the table's.
  if (success && sys.identifier === "unweave" && list.length) {
    const { endEffects, plainEffect } = await import("../effects/dispel.mjs");
    let endedAny = false;
    for (const t of list) {
      const victim = targetActorOf(t);
      if (!victim) continue;
      const ids = (victim.effects ?? []).map(plainEffect).filter(e => !e.disabled && spellCasterOf(e)).map(e => e.id);
      const done = ids.length ? await endEffects({ dispeller: actor, target: victim, ids, name: t?.name ?? victim.name, unweave: true }) : { ended: [] };
      if (done.ended?.length) endedAny = true;
      conditionLines.push(game.i18n.format(done.ended?.length ? "AZEROTH.Unweave.Ended" : "AZEROTH.Unweave.Nothing", {
        name: t?.name ?? victim.name, spell: spell.name, effects: (done.ended ?? []).map(e => e.name).join(", ")
      }));
    }
    if (endedAny && !viaItem) {
      const { stealAfterEnding } = await import("../effects/chromatic-flights.mjs");
      conditionLines.push(...(await stealAfterEnding({ actor, ally: unweaveThief.ally })));
    }
  }
  // **THE GROUND AT A SINGLE TARGET** (07's Lightning Strike, Earthen Spike and Shattering
  // Bolt; stage 3B): on a cast that went off, a Region on each creature the card records -
  // its footprint, widened by the feet 07 names - carrying the ground and its span, so the
  // one reconciler lays its Difficult ground and the one sweep takes it off
  // (`effects/target-ground.mjs`). Read off 07's own words (`targetGroundOf`), so a spell
  // embedded before its descriptor named the target places its ground too.
  const targetGround = success ? targetGroundOf(sys.effect ?? "", { target: sys.target ?? "" }) : null;
  if (targetGround && list.length) {
    // Guarded (the 3B review, should-fix 12): the cast is paid for by now, and a Region the
    // server refuses - no REGION_CREATE, a scene gone - must not lose the card. The card
    // says the ground was not placed.
    try {
      const { placeTargetGround } = await import("../effects/target-ground.mjs");
      conditionLines.push(...(await placeTargetGround({ actor, spell, cast, targets: list, ground: targetGround, areaGround: sys.areaGround ?? null, source })));
    } catch (err) {
      console.warn("azeroth-rpg | the ground at a single target", err);
      for (const t of list) conditionLines.push(game.i18n.format("AZEROTH.TargetGround.NotPlaced", { name: t?.name ?? "", spell: spell.name }));
    }
  }
  // **WHAT THE CAST CARRIES FOR THE DOORS AFTER IT** (D-778): a forced move 07's
  // words state (Blast Wave's and Gust of Wind's push and Ley Rift's pull on a failed
  // Test; Tempest's push on entering, Void Rift's pull at a turn's start), its feet at
  // this cast's SL with what the caster's talents add (04's Blast Wave); and whether a
  // talent marks what the Apply lays as no Dispel's to end (04's Improved Moonfire at
  // rank 2).
  const forcedRead = success ? readForced(sys.effect, { test: sys.test }) : null;
  const pushAdd = forcedRead && !viaItem ? spellPushFor(talentsNow, { spell: spell.name }) : { feet: 0, by: [] };
  const forced = forcedRead ? cleanForced({ ...forcedRead, feet: forcedFeet(forcedRead, { sl, add: pushAdd.feet }) }) : null;
  if (forced && pushAdd.feet > 0) roll.options.provenance.push({ label: pushAdd.by.join(", "), value: null, formula: game.i18n.format("AZEROTH.Forced.AddRow", { n: pushAdd.feet }) });
  const undispellable = !viaItem ? undispellableFor(talentsNow, { spell: spell.name }) : null;
  // The rider as a button, per target not already in the condition.
  const riderForced = rider ? (rider.mode === "add" ? sys.damage.rating + rider.rating : rider.rating) + extras : null;
  const riderByTarget = rider && hit ? list.map((t,index) => (ratingFor(t).applied ? null : mitigate(t, riderForced,{signatureIndex:index}).damage)) : [];
  const riderContext = rider && hit ? {
    conditions: rider.statuses.map(id => game.i18n.localize(AZEROTH.conditions[id] ?? id)).join(", "),
    rating: riderForced,
    targets: list.map((t, index) => ({ index, name: t.name, applied: ratingFor(t).applied, damage: riderByTarget[index] })).filter(r => !r.applied),
    loose: !list.length ? mitigate(null, riderForced).damage : null
  } : null;
  // **THE TICK THE CARD'S APPLY LAYS ON THE CREATURE** (D-770; O-144): the
  // spell's stored descriptor at this cast - its number, this caster's hand,
  // this cast - where the Casting Test succeeded and the cast's Success Level
  // reaches it (Fireball's *At SL 3 or better*). A tier 3 spell's Spellpower
  // rides its ongoing damage (07 §9: *it raises the ongoing damage, not the
  // initial hit*), as an entry's own Spellpower clause does.
  // **AND WHAT A TALENT ADDS TO EACH TURN'S NUMBER** (04's Moonfire and
  // Rejuvenation, D-771: *each rank adds 1*), stamped with it.
  const tickBonus = tickBonusFor(talentsNow, { name: spell.name });
  // **A TICK A TALENT GIVES THE SPELL** (04's Ancestral Tide: *Each target also
  // regains 4 Health at the start of their next turn*; D-774), where the entry
  // carries none of its own.
  const talentTick = sys.tick?.kind ? null : spellTickFor(talentsNow, { name: spell.name });
  // **A LONGER SPAN** (04's Malediction: *A curse that deals no damage lasts a
  // further minute per rank*; Everlasting Affliction: *Your ongoing effects last one
  // further minute per rank*; D-775): an effect laid with a timed span, and a tick
  // counted over it, last the minutes longer.
  const longer = viaItem ? { minutes: 0, by: [] } : spanExtensionFor(talentsNow, { spell: spell.name, ongoing: sys.duration?.kind === "timed" });
  const laidRaw = success
    ? layTick(talentTick ?? { ...(sys.tick ?? {}), spellpower: sys.tick?.spellpower === true || sys.takesSpellpower === true }, {
        source: actor.uuid, castUuid: spell.uuid ?? null, cast, name: spell.name, tier: actor.system?.tier ?? 1, sl, add: tickBonus.amount + tickAdd
      })
    : null;
  // Fel Fire makes the tick Fel as well (D-775), and a longer span counts it on.
  // **AND WHAT D-779's ANSWERS STAMP ON IT**: 04's Devouring Plague's doubled
  // landings (*"tick on cast, and 1 turn after."*), the schools Divine Aegis was
  // named for (*"The caster"*), and Miracle's heal nothing reduces.
  const extendedTick = laidRaw
    ? extendTickRounds(convertLine && laidRaw.kind === "damage" ? { ...laidRaw, type: convertLine.to } : laidRaw, { spanRounds: roundsIn(sys.duration ?? {}), minutes: longer.minutes })
    : null;
  const stampedTick = extendedTick ? {
    ...extendedTick,
    ...(chosenSignaturePreparation.bonuses.length && extendedTick.kind === "damage" ? {signatureCast:cast} : {}),
    ...(healingSignaturePreparation.bonuses.length && extendedTick.kind === "heal" ? {signatureHealingCast:cast} : {}),
    ...(plagued && extendedTick.kind === "damage" ? { doubled: plague?.landings ?? 2 } : {}),
    ...(aegisNamed && extendedTick.kind === "heal" ? { aegis: aegisNamed } : {}),
    ...(take.miracle && extendedTick.kind === "heal" ? { unreduced: true } : {}),
    // **04's SMOLDERING LIFE** (*Each tick of your Smolder may be split as Lifebinder's Flame
    // splits a spell*; stage 3A): the creatures picked at the cast and what the split adds,
    // carried on the tick each turn lands (`effects/chromatic-talents.mjs#landSplitTick`).
    ...(splitPicked && extendedTick.kind === "damage" && (splitPicked.plan?.ticks ?? []).includes(spell.name) ? { split: {
      by: actor.uuid, name: splitLine.name, heals: splitPicked.picks.map(p => p.uuid), conMod: actor.system?.abilities?.con?.mod ?? 0,
      add: splitPicked.plan.add, self: splitPicked.plan.self, tier: actor.system?.tier ?? 1, cleanse: splitPicked.plan.cleanse ?? null
    } } : {})
  } : null;
  if (stampedTick?.doubled) roll.options.provenance.push({ label: plague?.name ?? doubleLine?.name ?? "", value: null, formula: game.i18n.format("AZEROTH.DevouringPlague.Row", { n: stampedTick.doubled }) });
  if (stampedTick) for (const b of tickBonus.by) roll.options.provenance.push({ label: b.name, value: null, formula: game.i18n.format("AZEROTH.Tick.BonusRow", { n: b.amount }) });
  if (stampedTick && tickAdd) roll.options.provenance.push({ label: convertLine?.name || soulFire?.name || "", value: null, formula: game.i18n.format("AZEROTH.Tick.BonusRow", { n: tickAdd }) });
  // **A SPAN A TALENT RESTATES** (04's Celestial Alignment: *Its duration is 2
  // minutes*; D-771), read as 07's own Duration line is - or the entry's own,
  // the minutes longer (D-775).
  const talentSpan = spellDurationFor(talentsNow, { name: spell.name }) ?? extendedSpan(sys.duration ?? {}, longer.minutes);
  if (longer.minutes > 0 && talentSpan) roll.options.provenance.push({ label: longer.by.join(", "), value: null, formula: game.i18n.format("AZEROTH.Cast.LongerRow", { n: longer.minutes }) });
  const duration = effectDuration(talentSpan ? { text: talentSpan } : (sys.duration ?? {}), { inFight: Boolean(actor.activeFight?.()) });
  // **A COUNTED TICK WITH NOTHING TO END IT IS NOT LAID** (the D-770 review,
  // item A): out of a fight a creature has no turns to count Moonfire's or Holy
  // Fire's one tick down, and an instant spell's effect carries no span core can
  // expire, so it stood on the creature and landed at the first turn of
  // whatever fight came next. `rules/ticks.mjs#tickHasClock` is the rule; the
  // carrier is the caster for a Self spell, else the targets the card records
  // (else the caster's own fight, the door judging each creature again when the
  // Apply is pressed). The card says so in words and offers no Apply for it.
  const casterFights = Boolean(actor.activeFight?.());
  const selfCast = /^self$/i.test(String(sys.target ?? "").trim());
  const carrierFights = selfCast || !list.length ? casterFights : list.some(t => Boolean(targetActorOf(t)?.activeFight?.()));
  const laidTick = stampedTick && tickHasClock(stampedTick, { duration, carrierInFight: carrierFights, casterInFight: casterFights }) ? stampedTick : null;
  const tickNoClock = stampedTick && !laidTick ? game.i18n.format("AZEROTH.Tick.NoClock", { spell: spell.name }) : null;
  // **05's TEMPORARY HEALTH THE APPLY GRANTS** (07's Power Word: Shield, Ice
  // Barrier, Earthskin, Necrotic Shell, Soulshield; 04's Power Word: Shield and
  // Ice Barrier, *Each rank adds 2*; D-777): read off the entry, raised by the
  // talent, carried on the card and granted with the effect its Apply lays.
  const temporary = success ? castTemporary(spell, talentsNow, actor) : null;
  if (temporary) for (const b of temporary.by) roll.options.provenance.push({ label: b.name, value: null, formula: game.i18n.format("AZEROTH.Temporary.AddRow", { n: b.amount }) });
  // **07's FLOOR** (Aegis of the Light; D-777): laid by the Apply on each target,
  // held at the one damage door until the end of the caster's next turn.
  const floor = success ? readFloor(sys.effect) : null;
  // **07's BARRIER** (*Every creature you choose inside the area has Ward 3 against
  // every school for as long as it stays inside*; 04's Barrier: *Each rank adds 1 to
  // the Ward it grants*; the lead, 2026-10-03, on O-182: *"Yes"*; D-779): the
  // creatures this cast targets are the ones chosen, and the area the card places
  // carries their Ward while each stays inside (the aura door's region centre).
  const chosenWard = success
    ? chosenWardRemains(readChosenWard(sys.effect), { add: chosenWardFor(talentsNow, { spell: spell.name })?.add ?? 0, chosen: list.map(t => targetActorOf(t)?.uuid).filter(Boolean) })
    : null;
  // A lasting spell to lay on the targets (2026-09-06) - **never where a placed
  // area carries the spell's rule** (D-757): Hallowed Ground's Ward, Tidecall's
  // Slowed and Thornguard's Entangled are what a creature IN the area takes,
  // through its Tests and its riders, and laying them on whoever was targeted
  // at the cast was never 07's rule for an area on the ground. **And wherever a
  // tick is laid** (D-770): Moonfire carries a Damage, so it lays no effect of
  // its own words, and the effect is what carries its 2 at the next turn.
  // **AND NEVER WHERE A FAILED TEST LAYS A FORM** (D-808): 07's Hex is the frog its
  // Resist lays (`dice/chat.mjs#rollResists`), and an Apply would lay a second Hex.
  const applies = !["compel", "soul-link"].includes(sys.identifier) && !forcedKindForCard({ kind: "spell", identifier: sys.identifier ?? null })
    && (sys.applies?.active || laidTick || floor) && success && !areaCarriesSpell(sys) ? {
    self: selfCast,
    targets: list.map((t, index) => ({ index, name: t.name }))
  } : null;

  // 5. The Resist line, and what else the entry carries.
  const spellDC = viaItem?.dc ?? (ability ? spellDCFor({ abilityMod, proficiency }) : (actor.system.spellDC ?? actor.system.spells?.dc ?? null));
  // **THE TEST 07 GIVES A HELD OR STUNNED CREATURE** (D-778; the lead, 2026-10-03, on
  // O-159: *"Yes."*): what the Entangled or the Stun a failure lays carries - 07's
  // escape (*until it spends an action and passes another Reflex Resilience Test*,
  // *until it passes the Test again at the end of one of its turns*, *it may repeat
  // the Test at the end of each of its turns*) at THIS caster's Spell DC, with the
  // caster's talents on it (04's Frost Nova at rank 2, Absolute Zero, Deep Freeze).
  // A record of the cast (D-724): the escape is never read off the caster again.
  const escape = success
    ? escapeRecord(readEscape(sys.effect, { test: sys.test }), {
        dc: spellDC, talents: viaItem ? {} : escapeTalentsFor(talentsNow, { spell: spell.name }), caster: actor.uuid, source: spell.name, cast
      })
    : null;
  // 04's Permafrost on a Slowed this spell lays (D-778): the caster's feet, carried
  // on the card for whichever door lays it - the Resist's failure, a placed area's.
  const slowing = viaItem ? null : slowingFor(talentsNow);
  // **THE TEST THE NEXT BLOW ASKS** (07's Nature's Grasp: *The next creature to hit you
  // with a melee attack must pass a Reflex Resilience Test against your Spell DC or be
  // **Entangled***; the B9a pass, the lead: *"Build the triggers"*): read off the entry's
  // words at the cast, at THIS caster's Spell DC, and laid on the caster by the card's
  // Apply with the spell's own effect - the active GM's door answers the blow
  // (`effects/struck-tests.mjs`). A record of the cast (D-724), never read off the caster again.
  const struckRead = success ? readStruckTest(sys.effect) : null;
  const struckTest = struckRead ? cleanStruckTest({ ...struckRead, dc: spellDC, caster: actor.uuid, spell: spell.name, cast }) : null;
  const struckLines = struckTest ? [game.i18n.format(struckTest.noOpportunity ? "AZEROTH.Struck.CardLineNoOpportunity" : "AZEROTH.Struck.CardLine", {
    name: actor.name, spell: spell.name, dc: struckTest.dc ?? "—",
    resilience: game.i18n.localize(AZEROTH.resiliences[struckTest.resilience] ?? struckTest.resilience),
    conditions: struckTest.statuses.map(id => game.i18n.localize(AZEROTH.conditions[id] ?? id)).join(", ")
  })] : [];
  // **A FAILED CAST OFFERS NO RESIST** (the lead, 2026-09-26; 07 §8: *A failed
  // Casting Test costs the Mana and nothing else. The spell does not go off*).
  // There is nothing to resist, so the card draws no row and no button, and
  // says in words why (`didNotGoOff`); a Resist pressed on a card written
  // before this is refused at the door (`dice/chat.mjs#resistTestFromCard`).
  // **AND ONLY WHERE 07 ASKS THE TEST AT THE CAST** (the B8a2 pass; the lead: *"Build them
  // now"*): Thornguard, Entangling Vines, Frozen Ground, Hailstorm, Starweave, The Deep,
  // Nether Collapse and their kin ask it of a creature entering the area, starting its
  // turn there, crossing it or striking the caster - the area's own Test card makes it
  // then (D-756, D-757) - so their card offers none, and Thornguard's failure no longer
  // lays its Entangled on whoever was targeted (`rules/resisted.mjs#castTestOf`).
  const castTest = castTestOf(sys);
  const resist = success && castTest
    ? { key: castTest, label: AZEROTH.resiliences[castTest], dc: spellDC }
    : null;
  // **ONE RESIST ROW PER RECORDED TARGET** (07 §2, D-616, D-726). The Test is
  // the TARGET's to make and the card is the caster's, so each row names its
  // creature's uuid and `dice/chat.mjs` shows it to that creature's owner and
  // the GM and to nobody else. Every row carries whole what the template
  // draws: a bare name inside `#each` resolves against the row (D-609).
  // With no target recorded the card draws the one button it always had.
  // **WHO MAY MAKE IT, AND WHAT A FAILURE ENDS** (the B9a pass; 07 now prints Holy
  // Wrath's and Earth Shock's **Test**): Holy Wrath's *an undead creature that fails*,
  // Enslave Demon's and Compel's *A demon that fails*, Earth Shock's *If it is holding a
  // Sustained spell it must pass ... or lose it* (`rules/resisted.mjs#castTestGate`). A
  // target that does not qualify is drawn no button and told why in words; the press
  // judges again off the creature as it stands.
  const testGate = resist ? castTestGate(sys.effect) : null;
  const gateOf = t => {
    const victim = targetActorOf(t);
    const why = testGate ? castTestRefusal(testGate, {
      kinds: kindsOf(creatureSnapshot({ type: victim?.type ?? null, system: victim?.system ?? null, race: victim?.raceItem?.name ?? null })),
      sustaining: (victim?.getFlag?.("azeroth-rpg", "sustaining") ?? []).length
    }) : null;
    return why ? game.i18n.format(why, { name: t?.name ?? victim?.name ?? "", spell: spell.name }) : null;
  };
  const resistRows = resist
    ? list.map((t, index) => ({
        index,
        name: t?.name ?? "",
        actorUuid: targetActorOf(t)?.uuid ?? "",
        key: resistKey(t),
        resilience: resist.key,
        label: resist.label,
        dc: resist.dc,
        // Not this creature's Test (the B9a pass): said, never a button.
        gated: gateOf(t)
      }))
    : [];
  const testGateLine = testGate ? game.i18n.format(testGate.holds === "sustain"
    ? (testGate.loses === "sustain" ? "AZEROTH.Card.TestGate.SustainLine" : "AZEROTH.Card.TestGate.HoldsLine")
    : "AZEROTH.Card.TestGate.KindLine", {
    spell: spell.name, kinds: (testGate.kinds ?? []).map(k => game.i18n.localize(`AZEROTH.CreatureKind.${k}`)).join(", ")
  }) : null;
  // **WHAT THE SPELL DEALS AROUND ITS TARGET, A TEST AT A TIME** (07's Stormfury: *Every
  // creature within 15 feet of it makes a Reflex Resilience Test against your Spell DC or
  // takes 10 Nature damage*; the B8a pass). Nothing carried the 10: on a cast that struck,
  // every creature still standing within the splash's feet of the first target's token -
  // the target itself, whose Test the entry names, and the caster where they stand inside -
  // is measured now, and once the card stands each is posted the area Test card its failure
  // lands through (`effects/area-strikes.mjs#postSplashTest`); a pass lands nothing. Said on
  // the card in words, with what stays the table's. A target on no viewed board is measured
  // nowhere, and the splash is the table's.
  const splashRow = hit ? splashCheck(sys.splash) : null;
  const splashFrom = splashRow ? tokenOfTarget(first) : null;
  const splashed = splashFrom ? creaturesWithin(actor, Number(sys.splash.feet), { from: splashFrom, who: "creature" }) : [];
  const splashLines = [];
  if (splashRow) {
    const words = {
      spell: spell.name, feet: sys.splash.feet, around: first?.name ?? "", rating: splashRow.fail.rating,
      school: game.i18n.localize(AZEROTH.schools[splashRow.fail.school] ?? splashRow.fail.school ?? ""),
      resilience: game.i18n.localize(AZEROTH.resiliences[splashRow.resilience] ?? splashRow.resilience), dc: spellDC ?? "—",
      names: splashed.map(r => r.token.name ?? r.actor?.name ?? "").join(", ")
    };
    splashLines.push(game.i18n.format(splashFrom ? (splashed.length ? "AZEROTH.Splash.Line" : "AZEROTH.Splash.None") : "AZEROTH.Splash.Unmeasured", words));
    if (sys.splash.reason) splashLines.push(game.i18n.format("AZEROTH.Splash.Table", { spell: spell.name, reason: sys.splash.reason }));
  }

  // **WHAT A TALENT DOES TO THE AREA** (D-756): Consecrated Ground's rank 2
  // radius is 10 feet wider, so the card offers a *30 ft circle* and the Region
  // it places is that size; its Difficult ground rides the card to the Region
  // for Phase 2b. A cone and a line are never widened (`widenArea`).
  const spellArea = spellAreaFor(talentsNow, { name: spell.name });
  // And a cone a talent makes longer (04's Cone of Cold, D-775).
  const area = lengthenArea(widenArea(areaFor(sys.target ?? ""), spellArea.widen), spellArea.lengthen);
  // The area's tick, said on the card in words (D-756), and carried on it for
  // the Region to take.
  // **04's HEARTHFIRE** (*Your Immolation deals no damage. Instead, each ally that starts its
  // turn within 5 feet of you regains Health equal to the spell's damage*; stage 3A): the
  // caster's own copy of the tick, rewritten here - the Sustain's entry and the card both
  // carry it - and an item's casting is the item's, not the talent's.
  const heldTick = hasAreaTick(sys.areaTick)
    ? (viaItem ? foundry.utils.deepClone(sys.areaTick) : hearthfireTick(foundry.utils.deepClone(sys.areaTick), talentsNow, spell.name, talentEffect))
    : null;
  // **04's ANCHOR OF AGES** (*A creature that starts its turn inside your Arcane Anchor must
  // pass a Spirit Resilience Test against your Spell DC or be Entangled while it stays
  // there*; stage 3B): the caster's own copy of the tick, a check added, whether or not the
  // spell held one of its own (`anchorTick`); an item's casting is the item's.
  const areaTick = viaItem ? heldTick : anchorTick(heldTick, talentsNow, spell.name, talentEffect, emptyAreaTick(), { dc: actor.system?.spellDC ?? null, caster: actor.uuid, cast });
  const tickLine = areaTick ? areaTickLine(areaTick, { widen: spellArea.widen }) : null;
  // **THE CREATURES NAMED AT THE CAST** (07's Ring of Fire: *Name any number of creatures
  // as you cast: the ring lets them through and does not burn them*; Blackout's and The
  // Deep's *You and any creature you name as you cast*; the B9a pass): the creatures this
  // cast targets, as D-779's Barrier reads its chosen, carried to the Region its card
  // places, and said on the card in words.
  const namedAtCast = success && (areaTick?.checks ?? []).some(c => c.spares === "named")
    ? [...new Set(list.map(t => targetActorOf(t)?.uuid).filter(Boolean))]
    : [];
  const namedLines = namedAtCast.length || (success && (areaTick?.checks ?? []).some(c => c.spares === "named"))
    ? [game.i18n.format(namedAtCast.length ? "AZEROTH.Area.NamedAtCast" : "AZEROTH.Area.NoneNamed", {
        spell: spell.name, names: list.filter(t => namedAtCast.includes(targetActorOf(t)?.uuid)).map(t => t?.name ?? "").join(", ")
      })]
    : [];
  // What a tick's standing bonuses are keyed by, carried beside it (the review,
  // S6): the Region's `spell` block, the Sustain entry and the laid effect all
  // take it, because a spell cast by name from the pack or through an item is
  // on no actor for the tick to read it back from.
  const tickSpell = {
    name: spell.name, school: school ?? null, tier: sys.tier ?? null, takesSpellpower: sys.takesSpellpower === true,
    // A Hearthfire ring heals as a branch spell (04's Kindling Heart; stage 3A).
    ...(areaTick?.hearthfire ? { branch: true } : {})
  };

  // 6. Healing (D-625): the entry's own number, never raised by SL or tier
  // (07 SS9); a drain is a share of what the spell dealt, to the caster.
  // On a successful Casting Test only, as the damage is - and **never where
  // the healing is an area's at the start of a turn** (D-756): Healing Rain's
  // 3 is an ally's who starts its turn in the rain, not the target's now.
  const healSpec = sys.heal ?? {};
  let heal = null;
  if (success && castHeals(sys)) {
    if (healSpec.fromDamage && damageResult) {
      const dealt = damageResult.damage ?? 0;
      const amount = healSpec.fromDamage === "half" ? Math.floor(dealt / 2) : dealt;
      if (amount > 0) {
        heal = { amount, self: true,
          explanation: game.i18n.localize(`AZEROTH.Card.HealFromDamage.${healSpec.fromDamage === "half" ? "Half" : "All"}`) };
        // **AND WHAT WOULD LAND ABOVE THE MAXIMUM IS KEPT** (07's Grave Coil and
        // Exsanguinate: *any of it above your Health maximum is kept as temporary
        // Health until your next Long Rest*; D-777): the card says so, and its
        // self Apply keeps it.
        if (readTemporaryHealth(sys.effect)?.overflow === true) {
          heal.overflow = true;
          heal.explanation = `${heal.explanation} \u00b7 ${game.i18n.localize("AZEROTH.Temporary.Overflow")}`;
        }
      }
    } else if (healSpec.amount != null || healSpec.perTurn != null) {
      const perTurnOnly = healSpec.amount == null;
      heal = {
        amount: healSpec.amount ?? healSpec.perTurn,
        explanation: healSpec.perTurn != null
          ? game.i18n.format(perTurnOnly ? "AZEROTH.Card.HealPerTurn" : "AZEROTH.Card.HealThenPerTurn", { n: healSpec.perTurn })
          : ""
      };
    }
    // **AND THIS SPELL BY NAME RESTORES MORE** (08 §20, D-698). `healingBonus`
    // is what the bearer adds to EVERY spell of theirs that restores any; this
    // is the item that names one — *your Prayer of Healing* — and it lands on
    // the same number rather than on a second line of the card.
    if (heal && empowered?.heal) heal.amount += empowered.heal;
    // **AND WHAT A TALENT ADDS TO THIS SPELL'S HEAL** (04's Healing Wave: *Each rank
    // adds 1 to the Health it restores*; D-774).
    const talentHeal = heal && !heal.self ? spellHealFor(actor.takenTalents(), { name: spell.name }) : { amount: 0, by: [] };
    if (talentHeal.amount > 0) {
      heal.amount += talentHeal.amount;
      for (const b of talentHeal.by) roll.options.provenance.push({ label: b.name, value: null, formula: game.i18n.format("AZEROTH.Card.HealAddRow", { n: b.amount }) });
    }
  }
  // **WHAT EACH NAMED TARGET RESTORES** (04's Chain Heal, D-774): the first the
  // whole heal, the further ones half, rounded down - and CLOUDBURST's allies the
  // whole of it (*restores the same amount to every friendly target within 20
  // feet of its target*), added to the card's targets.
  const cloud = heal && !heal.self ? await takeCloudburst(actor, list) : { extra: [], by: null };
  if (cloud.extra.length) {
    list.push(...cloud.extra);
    roll.options.provenance.push({ label: cloud.by ?? "AZEROTH.Cloudburst.Label", value: null, formula: game.i18n.format("AZEROTH.Cloudburst.Row", { names: cloud.extra.map(t => t.name).join(", ") }) });
  }
  const healByTarget = heal && !heal.self ? [
    ...healShares(heal.amount, healLimits, list.length - cloud.extra.length),
    ...cloud.extra.map(() => heal.amount)
  ] : [];
  if (heal && (healLimits?.further || cloud.extra.length)) heal.perTarget = true;

  // **WHAT THE TALENTS LAY BESIDE THE SPELL'S OWN** (D-774): Pain Suppression's
  // rank on the laid effect's damage reduction, and Void Eruption's Silenced on a
  // failed Test beside 07's Stunned.
  const adds = spellAddsFor(sys.applies?.changes ?? [], actor.takenTalents(), { name: spell.name });
  const appliesChanges = adds.changes;
  for (const a of adds.by) roll.options.provenance.push({ label: a.name, value: null, formula: game.i18n.format("AZEROTH.Card.AddsRow", { n: a.amount }) });
  const failMore = spellOnFailFor(actor.takenTalents(), { name: spell.name });
  const failStatuses = [...new Set([...(sys.onFail?.statuses ?? []), ...(success ? failMore.statuses : [])])];
  // **OVERLOAD** (04: *that spell fires a second time at half damage, rounded
  // down, against the same target*) and **ANCESTRAL KNOWLEDGE** (*A Casting Test
  // of yours that fails costs no Mana*; D-774): each a button on the card that
  // strikes a use of the counter the talent grants, judged again at the press.
  const halfRating = hit ? halfDamage((rating ?? 0) + charged) : 0;
  const overloadRow = !viaItem && !free && halfRating > 0 ? overloadFor(actor.takenTalents(), { sl, damages: hit, success }) : null;
  const overload = overloadRow ? {
    identifier: overloadRow.identifier, name: overloadRow.name, rating: halfRating, school: damageSchool,
    // The second firing is HALF the spell's own damage; a second amount of
    // another type rides the first firing alone (MY READING, D-777).
    byTarget: list.map(t => mitigate(t, halfDamage((ratingFor(t).rating ?? 0) + extras + charged), { typed: false }))
  } : null;
  const paidMana = price.pool === "mana" && !freeLine ? mana : 0;
  const refundRow = !viaItem && !free ? refundFor(actor.takenTalents(), { success, paid: paidMana }) : null;
  const refund = refundRow ? { identifier: refundRow.identifier, name: refundRow.name, mana: paidMana, itemId: pool?.itemId ?? null } : null;
  const talentPresses = [
    ...(overload ? [{ press: "overload", label: game.i18n.format("AZEROTH.Overload.Button", { name: overload.name, n: halfRating }) }] : []),
    ...(refund ? [{ press: "refund", label: game.i18n.format("AZEROTH.AncestralKnowledge.Button", { name: refund.name, n: refund.mana }) }] : [])
  ];

  // A sustained spell is charged 1 Power at the start of each turn (D-355)
  // until it is dropped from the sheet. `sustained` says whether an entry was
  // WRITTEN, which is what an area placed from the card answers to (D-756): a
  // caster with no Mana pool holds nothing (O-145), and the Region it places
  // stands until a hand removes it rather than vanishing on a Sustain that
  // was never recorded.
  let sustained = false;
  // **A SPELL A TALENT PAYS IN ANOTHER POOL IS HELD IN THAT POOL** (the Chromatic
  // Champion plan, finding 2): a Champion holds no Mana, so its Rage-paid Immolation
  // was never recorded and never upkept. The entry names the pool (`pool`) and
  // `turn-effects.mjs#upkeep` charges it there.
  const holdPool = talentPool && payPool ? payPool : pool;
  if (success && sys.duration?.kind === "sustained" && holdPool) {
    const sustaining = foundry.utils.deepClone(actor.getFlag("azeroth-rpg", "sustaining") ?? []);
    sustaining.push({
      spellId: spell.id, uuid: spell.uuid, name: spell.name, itemId: holdPool.itemId,
      ...(holdPool === payPool && talentPool?.pool && talentPool.pool !== "mana" ? { pool: talentPool.pool } : {}),
      // WHICH CAST IS HELD, WHAT IT WAS AIMED AT AND WHO HOLDS IT (D-724): the
      // same `cast` the card carries, and the targets as ids alone - an entry
      // is a record of the moment, and the snapshot's Defense and Ward are the
      // card's business. An entry written before this carries none of the
      // four, and a reader takes that as nothing recorded.
      cast,
      identifier: sys.identifier ?? null,
      ...(sys.identifier === "mirror-image" ? { mirrorImages: MIRROR_IMAGE_COUNT } : {}),
      targets: list.map(t => ({ sceneId: t?.sceneId ?? null, tokenId: t?.tokenId ?? null, actorId: t?.actorId ?? null })),
      source: source ?? null,
      // A self-centred tick has no Region to carry it (Immolation), so the
      // entry does - read before the spell item, which a Spells line cast by
      // name from the pack never embeds (the review, S6).
      ...(areaTick?.centre === "self" ? { areaTick, tickSpell,
        ...(chosenSignaturePreparation.bonuses.length ? {signatureDamageCast:cast} : {}) } : {}),
      // **ITS UPKEEP, AS THE ENTRY NAMES IT** (the lead, 2026-10-03, on O-163:
      // *"cost by the entry or 1 Power if not mentioned."*; D-778): 07's *While
      // sustaining this spell you pay N Mana* - and Health, for Felfire Aura and
      // Felstep - read now and charged at each turn's start (`rules/upkeep.mjs`);
      // null where the entry names none, which costs 05's 1.
      upkeep: readUpkeep(sys.effect)
    });
    // 05 SS12: one effect at a time unless a feature says otherwise; beginning
    // one more than you may hold ends the oldest (D-628). **AND WHAT A TALENT
    // ADDS** (04's Netherwind on Shape the Weave, Archmage while its laid effect
    // stands on the mage; D-775).
    const features = actor.items.filter(i => i.type === "feature").map(i => ({ name: i.name }));
    const more = sustainsFor(talentsNow, {
      holdsWeave: features.some(f => f.name === "Shape the Weave"),
      archmageStanding: (actor.effects ?? []).some(e => e.active !== false && e.getFlag?.("azeroth-rpg", "identifier") === "archmage")
    });
    const limit = sustainLimit({ features, extra: more.more });
    while (sustaining.length > limit) {
      const dropped = sustaining.shift();
      await liftSpellEffects(actor, actor.items.get(dropped.spellId)?.uuid ?? dropped.uuid ?? null, dropped.cast ?? null);
      ui.notifications?.info(game.i18n.format("AZEROTH.Combat.SustainEnded", { name: actor.name, spell: dropped.name }));
    }
    await actor.setFlag("azeroth-rpg", "sustaining", sustaining);
    sustained = true;
  }

  // An item's casting strikes a use (D-633); the card is posted either way.
  if (viaItem?.itemId) {
    const carrier = actor.items.get(viaItem.itemId);
    const spells = foundry.utils.deepClone(carrier?.system?.toObject?.().spells ?? []);
    const entry = spells[viaItem.index];
    if (carrier && entry?.uses?.max > 0) {
      entry.uses.value = Math.max(0, (entry.uses.value ?? 0) - 1);
      await carrier.update({ "system.spells": spells });
    }
  }

  // **WHAT A FAILED RESIST LANDS AT THIS SL** (07; D-812): Frostbite's Entangled for
  // the first round, Shadow Wave's Blinded, Slow's lost Reaction, Turn Undead's
  // destruction - a record of the cast for the card's Resist (`dice/chat.mjs
  // #rollResists`), which judges the SL again on the creature that failed it.
  const failRider = failRiderRecord(slRead, { success, resist: Boolean(resist) });
  if (failRider) conditionLines.push(game.i18n.format(`AZEROTH.SlRider.FailCard.${failRider.kind}`, {
    n: failRider.at, spell: spell.name,
    condition: failRider.status ? game.i18n.localize(AZEROTH.conditions[failRider.status] ?? failRider.status) : "",
    creature: failRider.creature ?? "", tier: failRider.tier ?? ""
  }));
  const content = await renderTemplate(TEMPLATE.spell, {
    dismissEverburn:success&&sys.identifier==='everburn',
    chainLightning: sys.identifier === "chain-lightning",
    conflagrate: Boolean(conflagrateTools),
    bloodPactSpell: Boolean(bloodPactTools),
    config: AZEROTH,
    title: spell.name,
    subtitle: game.i18n.localize(AZEROTH.schools[school] ?? ""),
    mana,
    action: sys.action,
    range: sys.range,
    target: sys.target,
    // A talent's own span, where one restates it (Celestial Alignment, D-771).
    duration: talentSpan ?? (sys.duration?.text || sys.duration?.kind),
    effect: await enrich(sys.effect, { relativeTo: spell }),
    rolled: true,
    total: roll.total,
    natural: roll.natural ?? null,
    modifier: roll.natural === null || roll.natural === undefined ? null : roll.total - roll.natural,
    dc: resolvedDC,
    sl,
    success,
    verdict: verdictFor({ sl, success }),
    critical: outcome.critical,
    fumble: outcome.fumble,
    overchannel: oc.points ? oc : null,
    healthCost: spellHealth || null,
    damage: damageResult ? {
      final: damageResult.damage,
      // A damage its Test's failure deals says so on the line (the B8a pass).
      // And one that bypasses armor and Ward says so (the B8a2 pass).
      explanation: [spellDamageExplanation(damageResult, castRating((first ? ratingFor(first).rating + extras : rating) + charged)), noneOnPass ? game.i18n.localize("AZEROTH.Card.DamageOnFail") : null, damageResult.bypass === true ? game.i18n.localize("AZEROTH.Card.Bypass") : null].filter(Boolean).join(" · ")
    } : null,
    // Shatter's Critical Injury at rank 2 (D-775): the attack card's own button.
    criticalInjury: Boolean(spellCritical),
    riderApplied: rider && hit && first && ratingFor(first).applied ? riderContext?.conditions ?? null : null,
    rider: riderContext,
    applies,
    // The Resist Test's failure lands the conditions the entry names (2026-09-06).
    onFail: resist && failStatuses.length ? failStatuses.map(id => game.i18n.localize(AZEROTH.conditions[id] ?? id)).join(", ") : null,
    heal,
    speakerName: actor.name,
    source: [viaItem ? game.i18n.format("AZEROTH.Card.FromItem", { name: viaItem.name })
      : (free ? game.i18n.format("AZEROTH.Cast.FreeBy", { name: free.by ?? "" }) : null),
      chainUnresolved ? game.i18n.localize("AZEROTH.ChainLightning.RouteUnresolved") : null,
      conflagrateTools && success ? game.i18n.localize(!conflagrate?.ok ? "AZEROTH.Conflagrate.Unresolved"
        : !conflagrate.targets[0].burning ? "AZEROTH.Conflagrate.Fizzle"
        : conflagrate.targets[0].immolates.length ? "AZEROTH.Conflagrate.Immolate"
        : conflagrate.targets[0].manualBurning ? "AZEROTH.Conflagrate.EnvironmentalCard" : "AZEROTH.Conflagrate.Burning") : null
    ].filter(Boolean).join(" · ") || null,
    resist,
    resistRows,
    // Who may make it, in words (the B9a pass).
    testGate: testGateLine,
    // **A FAILED CAST PLACES NOTHING, AND THE CARD OFFERS NOTHING TO PLACE**
    // (the lead, 2026-09-26). The card's `flags.area` below keeps the shape
    // the animation layer's record carries, which refuses a failed cast off
    // `success` (D-728); an old card's Place area refuses at its door.
    area: success ? area : null,
    // 07 §8's own words where the Test failed, in place of the controls.
    didNotGoOff: !success,
    // What the area does at the start of a turn, in words (D-756). A failed
    // Casting Test lays no area that strikes anybody, so it says nothing.
    areaTick: success ? tickLine : null,
    // And what the Apply lays on the creature itself, in words (D-770) - or why
    // a counted tick with nothing to end it is not laid (the review's item A).
    tick: laidTick ? tickWords(laidTick) : null,
    tickNoClock,
    // The temporary Health the Apply grants, and 07's floor it lays (D-777), in words.
    temporaryHealth: temporary ? game.i18n.format("AZEROTH.Temporary.CardLine", { n: temporary.amount }) : null,
    floorLine: floor ? game.i18n.format("AZEROTH.AegisLight.CardLine", { n: floor.stay }) : null,
    // **WHAT THE CROSS-CLASS RULINGS ADD TO THE CARD** (D-778), each in words: the
    // Speed drop or the Slowed a hit laid, the forced move a failed Test or the
    // area makes, the escape a held or Stunned creature is given, and a laid
    // effect no Dispel may end.
    crossLines: crossCardLines({ speedLines, conditionLines, forced, escape, undispellable, stepLines, splashLines, namedLines, struckLines }),
    targets: list.map((t, index) => ({ ...t, index, damage: damageByTarget[index]?.damage ?? null, healAmount: healByTarget[index] ?? null })),
    // **WHAT THE CARD OFFERS AFTER THE DIE** (D-774): Overload's second firing and
    // Ancestral Knowledge's Mana back, each a button that strikes a use.
    talentPresses,
    // A taken talent that names this spell or its school rides the card (D-642).
    talentNotes: await Promise.all(spellNotesFor(actor.takenTalents(), { name: spell.name, school })
      .map(async n => ({ name: n.name, effect: await enrich(n.effect) }))),
    provenance: roll.provenance
  });

  const publishSpellCard = data => crossingRecord
    ? crossingPublication.publishCrossingCard(crossingRecord,data) : ChatMessage.create(data);
  const spellCard = await publishSpellCard({
    speaker: ChatMessage.getSpeaker({ actor }),
    ...(chainPrivate ? { whisper: [...game.users].filter(user => user.isGM).map(user => user.id) } : {}),
    content,
    rolls: [roll],
    flags: {
      "azeroth-rpg": {
        kind: "spell",
        spellLockCaster: actor.uuid,
        reactionBar: reactionBar && success,
        spellLockCasts: [spellLock.castId],
        spellId: spell.id,
        // A compendium spell has no id on the actor, so carry the uuid too.
        spellUuid: spell.uuid,
        ...(cureReview?.ticket ? { cureTicket: cureReview.ticket } : {}),
        ...(utilityReview?.ticket ? {utilityTicket: utilityReview.ticket, utilityCastTime: game.time.worldTime} : {}),
        ...(objectReview?.ticket ? {thematicObjectTicket: objectReview.ticket, thematicObjectCastTime: game.time.worldTime} : {}),
        ...(felReview?.ticket ? {felTicket: felReview.ticket} : {}),
        ...(burdenReview?.ticket ? {pilgrimsBurdenTicket: burdenReview.ticket, pilgrimsBurdenCastTime: game.time.worldTime} : {}),
        ...(custodyReview?.ticket ? {itemCustodyTicket: custodyReview.ticket, itemCustodyCastTime: game.time.worldTime} : {}),
        ...(shadowReview?.ticket ? {shadowTicket: shadowReview.ticket} : {}),
        ...(["mindlink", "sending", "mind-vision", "distant-mind"].includes(sys.identifier)
          ? {mentalCastTime: game.time.worldTime} : {}),
        ...(holyReview?.ticket ? {holyTicket: holyReview.ticket} : {}),
        ...(dreamReview?.ticket ? {dreamTicket: dreamReview.ticket} : {}),
        ...(relayReview?.ticket && relayMode === "setup" ? {spellRelayTicket: relayReview.ticket} : {}),
        ...(relayReview?.ticket && relayMode === "attempt" ? {spellRelayAttemptTicket: relayReview.ticket} : {}),
        ...(relayPlacement ? {spellRelayPlacement: relayPlacement} : {}),
        ...(verdictReview?.ticket ? {verdictTicket: verdictReview.ticket} : {}),
        ...(thematicResolutionPending.length ? {thematicResolutionPending} : {}),
        // WHAT WAS CAST, WHICH CAST, WHETHER IT WORKED AND WHO CAST IT (D-724).
        // `success` is this workflow's own verdict as it was decided above, so
        // a reader never re-derives it from the roll; `source` is the caster's
        // token and has nothing to do with the render context's `source`, which
        // is the *From item* line.
        identifier: sys.identifier ?? null,
        ...(chainTools ? { chainLightningRoute: { automatic: true, unresolved: chainUnresolved } } : {}),
        ...(chainExecution ? { chainLightningRequestId: chainExecution.requestId } : {}),
        ...(conflagrateTools ? { conflagrate } : {}),
        ...(bloodPactTools ? { bloodPactSpell } : {}),
        ...(soulLinkTools ? { soulLinkPreparation } : {}),
        ...(success && healingSignaturePreparation.bonuses.length ? {
          chosenHealingBonuses:healingSignaturePreparation.bonuses
        } : {}),
        ...(success && (sealingFlame || spellCrossing || endTurnDamage || spellRetaliation || chosenSignaturePreparation.bonuses.length) ? {
          chosenSignatureBonuses:chosenSignaturePreparation.bonuses,
          ...(chosenSignatureTargets ? {chosenSignatureTargets} : {}),
          chosenSignatureDelivery:signatureDeliverySeed({cast,bonuses:chosenSignaturePreparation.bonuses})
        } : {}),
        cast,
        success,
        ...(sealingFlame && sealingFlameClaim ? {sealingFlame:{...sealingFlameClaim,descriptor:sealingFlame}} : {}),
        source: source ?? null,
        // **WHERE THE SPELL MOVED ITS CASTER AND ITS PARTY** (07's Shadow Walk and Dark
        // Passage; the Legacy branches' door 2): each move's centre before and after,
        // made by `castStepLines` on the pick it answered.
        ...(stepPicked?.made?.length ? { steps: stepPicked.made } : {}),
        ...(spellCrossing && stepPicked?.made?.length ? { spellCrossing: {
          descriptor: spellCrossing, sceneId: stepPicked.doc.parent.id, tokenId: stepPicked.doc.id,
          spell: {type:'spell',system:{target:sys.target,duration:sys.duration,effect:sys.effect}},
          origin: stepPicked.from, destination: stepPicked.to
        } } : {}),
        // **WHO HOLDS THE CAST** (the review, S3): the actor the Sustain entry
        // is written on, which the speaker is not when a world creature is cast
        // from while an unlinked token speaks for it. `dice/chat.mjs#casterOf`.
        caster: actor.uuid,
        viaItem,
        area,
        // **WHAT THE REGION PLACED FROM THIS CARD ANSWERS TO** (D-756): whether
        // a Sustain entry was written for this cast, the tick as it stood at
        // the cast, the Difficult ground a talent lays, and how many feet a
        // talent widened the circle. `dice/chat.mjs#regionFlagsFromCard` copies
        // them onto the Region.
        sustained,
        areaTick,
        // Whether the area is Difficult ground, off 07's own sentences (D-757),
        // and the caster's Spell DC its Tests are made against.
        areaGround: sys.areaGround ? foundry.utils.deepClone(sys.areaGround) : null,
        spellDC: spellDC ?? null,
        ground: spellArea.ground,
        widen: spellArea.widen,
        // A cone a talent made longer (04's Cone of Cold, D-775): the card's Place
        // area draws it (`dice/chat.mjs#placeAreaFromCard`).
        lengthen: spellArea.lengthen,
        // Shatter's Critical Injury (D-775), which the card's one press rolls.
        ...(spellCritical ? { spellCritical } : {}),
        tickSpell,
        ...(success && endTurnDamage ? {endTurnDamage} : {}),
        ...(success && spellRetaliation ? {spellRetaliation: {
          version:1, descriptor:spellRetaliation,
          spell:{type:'spell',system:{target:sys.target,effect:sys.effect}},
          casterUuid:actor.uuid
        }} : {}),
        targets: list,
        damageByTarget,
        // 04's Lifebinder's Flame (stage 3A): the heal the split owes, landed once the card stands.
        ...(lifebinderRecord ? { lifebinder: lifebinderRecord } : {}),
        // A return arc is another hit even when it names the same actor.
        // Seed only new cards; old cards provide no proof of prior delivery.
        ...(hit && (sys.identifier === "chain-lightning" || ((chosenSignaturePreparation.bonuses.length
          || (list.length>0&&list.every(target=>targetActorOf(target)?.uuid)))
          && !["mana-burn", "conflagrate"].includes(sys.identifier))) ? {
          mirrorImageDefense: true,
          attackResolution: attackResolutionSeed(list.map(target => targetActorOf(target)?.uuid))
        } : {}),
        riderByTarget,
        ...(manaBurn ? { manaBurn } : {}),
        ...(reflectedTargets ? { reflections: reflectedPlan.reflections, originalTargets: reflectedTargets } : {}),
        // The half a passed Test leaves, by row and on the one button (the B6 fix).
        ...(halfOnPass ? { halfOnPass: true, passedByTarget, damagePassed } : {}),
        // And nothing, where the failure is what deals it (the B8a pass).
        ...(noneOnPass ? { noneOnPass: true } : {}),
        heal: heal?.amount ?? null,
        ...(healingSignaturePreparation.bonuses.length ? {healingSignatureSelf:heal?.self===true,
          healingSignatureAmounts:healByTarget,healingSignatureCaster:actor.uuid} : {}),
        sl,
        overchannel: oc.points,
        // **WHAT D-779's ANSWERS CARRY TO THE DOORS AFTER THE CAST**: the schools
        // Divine Aegis was named for, Miracle's heal nothing reduces (both read by the
        // card's heal and its tick), and 07's Barrier's Ward on the creatures chosen
        // (`regionFlagsFromCard` copies it onto the area).
        ...(aegisNamed ? { aegis: aegisNamed } : {}),
        ...(take.miracle && success ? { miracle: true } : {}),
        ...(chosenWard ? { chosenWard } : {}),
        // The creatures named at the cast, for the area to spare (the B9a pass).
        ...(namedAtCast.length ? { named: namedAtCast } : {}),
        // What the next blow on the caster asks of its striker, for the Apply to lay (the B9a pass).
        ...(struckTest ? { struckTest } : {}),
        // What the card's buttons lay (2026-09-06): the effect, its timing, the failure's conditions.
        // A spell that lays only its tick lays an effect of no changes (D-770).
        // **WHAT A TALENT LAYS MORE OF** (04's Pain Suppression: *Each rank adds 1
        // to the damage it prevents*; D-774), laid over the spell's own changes.
        // **NEVER A CONDITION 07 GATES ON THE SL** (D-812): Frostbite's copy laid its
        // *Entangled for the first round* on every Apply; the failure rider lays it now.
        applies: sys.applies?.active
          ? { changes: appliesChanges, statuses: (sys.applies.statuses ?? []).filter(id => !slGatedStatuses(sys.effect).includes(id)) }
          : (laidTick || floor ? { changes: [], statuses: [] } : null),
        // **WHAT THE APPLY GRANTS AND LAYS BESIDE** (D-777): 05's temporary Health,
        // 07's floor, and whether the self heal keeps its overflow.
        temporaryHealth: temporary ? { amount: temporary.amount, source: spell.name } : null,
        floor: floor ?? null,
        healOverflow: heal?.overflow === true,
        // THE TICK THE APPLY LAYS (D-770), stamped at this cast: the number, the
        // hand, the spell and the cast, as `rules/ticks.mjs#layTick` made it.
        tick: laidTick,
        // Only where the card offers its Test (the B8a2 pass): a Test 07 asks later lands
        // through the area's own card, never through this one.
        onFail: resist && failStatuses.length ? { resilience: sys.onFail?.resilience ?? null, statuses: [...failStatuses] } : null,
        // What a failure lands at this SL (D-812), judged again at the Resist.
        ...(failRider ? { slRider: failRider } : {}),
        // Who may make the card's Test and what a failure ends (the B9a pass), judged again
        // at the press (`dice/chat.mjs#rollResists`).
        ...(testGate ? { testGate } : {}),
        // What the card's after-the-die buttons read (D-774): Overload's half and
        // its same targets, and the Mana a failed Test paid.
        ...(overload ? { overload } : {}),
        ...(refund ? { refund } : {}),
        // **WHAT THE DOORS AFTER THE CAST READ** (D-778): the forced move (the
        // Resist's failure pushes; `regionFlagsFromCard` copies it onto the area
        // for Tempest's entering and Void Rift's turn start), the escape a failure's
        // condition carries, the mark no Dispel ends, and Permafrost's feet on a
        // Slowed a failure lays.
        ...(forced ? { forced } : {}),
        ...(escape ? { escape } : {}),
        ...(undispellable ? { undispellable } : {}),
        ...(slowing ? { slowing: { feet: slowing.feet, source: slowing.by.join(", ") } } : {}),
        duration,
        spellName: spell.name,
        spellImg: spell.img,
        effectHTML: await enrich(sys.effect, { relativeTo: spell })
      }
    }
  });
  // **THE SPLIT'S HEAL, ONCE THE CARD STANDS** (04's Lifebinder's Flame; stage 3A): every
  // creature picked, through the one healing door, the card's own record the GM reads.
  if (spellCard && lifebinderRecord) {
    try {
      const { landLifebinder } = await import("../effects/chromatic-talents.mjs");
      const healed = await landLifebinder(spellCard);
      if (healed.length) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: healed.map(l => `<p class="azeroth-drain">${foundry.utils.escapeHTML(l)}</p>`).join(""), flags: { "azeroth-rpg": { kind: "lifebinder", messageId: spellCard.id } } });
    } catch (err) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Lifebinder.Unresolved"));
      console.warn("azeroth-rpg | Lifebinder's Flame", err);
    }
  }
  if (spellCard && spellCrossing && success && stepPicked?.made?.length) {
    const { requestSpellCrossing } = await import('../effects/spell-crossing-delivery.mjs');
    const result = await requestSpellCrossing(spellCard);
    if (!result?.ok) ui.notifications?.warn('Emberflight crossing damage could not be confirmed. Do not cast again to retry damage.');
  }
  if (spellCard && conflagrateTools && success && conflagrate?.ok && conflagrate.targets[0].burning) {
    const consumed = await conflagrateTools.requestConflagrateConsumption(spellCard);
    if (!consumed?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Conflagrate.Unresolved"));
  }
  if (spellCard && bloodPactTools && success) {
    const result = await bloodPactTools.requestBloodPactSpellResolution(spellCard);
    if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.BloodPactSpell.Unresolved"));
  }
  if (spellCard && soulLinkTools && success) {
    const result = await soulLinkTools.requestSoulLinkResolution(spellCard);
    if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.SoulLink.Unresolved"));
  }
  if (spellCard && iceBlockTools && success) {
    const result = await iceBlockTools.requestIceBlockResolution(spellCard);
    if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.IceBlock.Unresolved"));
  }
  if (spellCard && dispersionTools && success) {
    const result = await dispersionTools.requestDispersionResolution(spellCard);
    if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Dispersion.Unresolved"));
  }
  // A cure lands only on a successful Casting Test (07 §8).
  if (doorCure?.ok && success) {
    try {
      const { finishDoorCure } = await import("../effects/cures.mjs");
      // The Test's SL with Overchannel's points (07 SS8; D-812), as every rider reads it.
      await finishDoorCure(doorCure, { actor, spell, sl });
    } catch (error) {
      console.warn("azeroth-rpg | cure", error);
    }
  }
  if (spellCard && cureReview?.ticket) {
    try {
      const { finishCurePoison } = await import("../effects/cure-poison-use.mjs");
      const result = await finishCurePoison(cureReview.ticket, spellCard.id);
      if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.CurePoison.AfterFailed"));
    } catch (error) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.CurePoison.AfterFailed"));
      console.warn("azeroth-rpg | Cure Poison", error);
    }
  }
  if (spellCard && utilityReview?.ticket) {
    try {
      const result = await utilityTools.finishThematicUtility(utilityReview.ticket, spellCard.id);
      if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
    } catch (error) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
      console.warn("azeroth-rpg | Thematic utility resolution", error);
    }
  }
  if (spellCard && objectReview?.ticket) {
    try {
      const result = await objectTools.finishThematicObject(objectReview.ticket, spellCard.id);
      if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
    } catch (error) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
      console.warn("azeroth-rpg | Thematic object resolution", error);
    }
  }
  if (spellCard && felReview?.ticket) {
    try {
      const result = await felTools.finishThematicFel(felReview.ticket, spellCard.id, cast);
      if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
    } catch (error) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
      console.warn("azeroth-rpg | Thematic Fel resolution", error);
    }
  }
  if (spellCard && burdenReview?.ticket) {
    try {
      const result = await burdenTools.finishPilgrimsBurden(burdenReview.ticket, spellCard.id);
      if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
    } catch (error) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
      console.warn("azeroth-rpg | Pilgrims' Burden resolution", error);
    }
  }
  if (spellCard && shadowReview?.ticket) {
    try {
      const result = await shadowTools.finishShadowCast(shadowReview.ticket, spellCard.id);
      if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
    } catch (error) {
      console.warn("azeroth-rpg | Shadow spell resolution", error);
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
    }
  }
  if (spellCard?.flags?.["azeroth-rpg"]?.success === true
      && ["mindlink", "sending", "mind-vision", "distant-mind"].includes(spellCard.flags["azeroth-rpg"].identifier)) {
    try {
      const {openMentalChannel} = await import("../effects/thematic-shadow.mjs");
      const result = await openMentalChannel(spellCard.id);
      if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
    } catch (error) {
      console.warn("azeroth-rpg | Mental channel opening", error);
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
    }
  }
  if (spellCard && custodyReview?.ticket) {
    try {
      const result = await custodyTools.requestItemCustodyFinish({ticket: custodyReview.ticket, messageId: spellCard.id});
      if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
    } catch (error) {
      console.warn("azeroth-rpg | Item custody resolution", error);
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
    }
  }
  if (spellCard && holyReview?.ticket && !thematicResolutionPending.includes("holy")) {
    try {
      const result = await holyTools.finishHolyCast(holyReview.ticket, spellCard.id);
      if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
    } catch (error) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
      console.warn("azeroth-rpg | Thematic Holy resolution", error);
    }
  }
  if (spellCard && dreamReview?.ticket && !thematicResolutionPending.includes("dream")) {
    try {
      const result = await dreamTools.finishDreamCast(dreamReview.ticket, spellCard.id);
      if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
    } catch (error) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
      console.warn("azeroth-rpg | Dream Theatre resolution", error);
    }
  }
  if (spellCard && relayReview?.ticket && !thematicResolutionPending.includes("relay")) {
    try {
      const result = relayMode === "setup"
        ? await spellRelayTools.finishSpellRelaySetup(relayReview.ticket, spellCard.id)
        : await spellRelayTools.finishRelayAttempt(relayReview.ticket, spellCard.id);
      if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
    } catch (error) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Utility.AfterFailed"));
      console.warn("azeroth-rpg | Spell Relay resolution", error);
    }
  }
  if (spellCard && reactionBar && success) {
    try { await applyEarthShockBar(spellCard); }
    catch (error) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.ReactionBar.ApplyFailed"));
      console.warn("azeroth-rpg | Earth Shock restriction", error);
    }
  }
  // **THE SPLASH'S TESTS, ONCE THE CARD STANDS** (07's Stormfury; the B8a pass): one area
  // Test card for each creature measured, made once and landed at the spell card's own
  // Resist door. Guarded and said in words: the cast has gone off whatever a card does.
  if (spellCard && splashRow && splashed.length) {
    try {
      const { postSplashTest } = await import("../effects/area-strikes.mjs");
      for (const r of splashed) {
        await postSplashTest({
          actor: r.actor, token: r.token?.document ?? null, check: splashRow, caster: actor, spell: tickSpell,
          dc: spellDC ?? null, cast, source: source ?? null, around: first?.name ?? "", feet: Number(sys.splash.feet) || 0
        });
      }
    } catch (err) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Splash.PostFailed", { spell: spell.name }));
      console.warn("azeroth-rpg | splash", err);
    }
  }
  const aftermath = await completeSpellLockWindow({ actor, castId: spellLock.castId, message: spellCard });
  if (!aftermath?.ok) ui.notifications?.warn("The spell resolved, but Spell Lock's resistance or Silence could not be confirmed. Check the reaction records; do not repeat the spell.");
  return spellCard;
}

/**
 * **05's TEMPORARY HEALTH A SPELL GRANTS** (D-777; the lead: *"raise HP past max
 * as temp hp"*): what the entry's own words grant *for the duration* - 07's Power
 * Word: Shield and Ice Barrier, Earthskin, Necrotic Shell's first 6, Soulshield -
 * at the caster's level and tier, raised by the caster's talent (04's Power Word:
 * Shield and Ice Barrier: *Each rank adds 2 to the temporary Health it grants*),
 * for the card's Apply to grant with the effect it lays. Null where the words
 * grant none a laid effect can carry: a drain's overflow rides its heal, and a
 * demon's remaining Health or a grove's rest is the table's.
 *
 * @param {Item} spell
 * @param {Array} talents  the caster's
 * @param {Actor} actor
 * @returns {{amount: number, by: Array<{name: string, amount: number}>}|null}
 */
function castTemporary(spell, talents = [], actor = null) {
  const sys = spell?.system ?? {};
  const read = readTemporaryHealth(sys.effect ?? "");
  if (!read?.amount || read.span !== "effect" || sys.applies?.active !== true) return null;
  const base = Math.max(0, Math.trunc(Number(evaluateAmount(read.amount, { level: actor?.system?.level ?? 1, tier: actor?.system?.tier ?? 1 }))) || 0);
  const more = spellTempFor(talents, { name: spell?.name ?? "" });
  const amount = base + more.add;
  return amount > 0 ? { amount, by: more.by } : null;
}

/**
 * **A SPELL'S STEP, MADE** (07's Shadow Walk and Dark Passage; the Legacy branches'
 * door 3): the caster's token displaced to the space picked before the payment, and
 * each of Dark Passage's targets by the same displacement (`rules/steps.mjs
 * #partyStep`), every space judged again for its room - the other movers excepted,
 * since they are moving too - here or on the GM's client. Lines for the card: what
 * moved, what was refused and why, a failed Test's *moved nobody*, and a caster with
 * no token on the viewed scene left to the table.
 *
 * @returns {Promise<string[]>}
 */
async function castStepLines({ actor, spell, step = null, picked = null, success = false } = {}) {
  if (!step || !picked) return [];
  if (picked.skipped) return [game.i18n.format("AZEROTH.Step.NoTokenLine", { name: actor.name, feet: step.feet })];
  if (!success) return [game.i18n.format("AZEROTH.Step.NotCast", { name: spell.name })];
  if (step.trigger === 'crossed-space') {
    const { crossingOriginMatches } = await import('../rules/spell-crossing.mjs');
    const size = picked.doc.getSize();
    const destination = {x:picked.to.x+size.width/2,y:picked.to.y+size.height/2};
    if (!crossingOriginMatches(picked.doc,picked.from)
      || judgeStep(picked.doc,destination,{feet:step.feet,sight:step.sight}).refusal) {
      return ['Emberflight movement was not applied because its origin or destination changed. The paid cast needs GM review.'];
    }
  }
  const movers = [picked.doc, ...picked.party];
  const except = movers.map(d => d.id);
  const lines = [];
  // **EVERY MOVE MADE, ON THE PICK IT ANSWERS** (the Legacy branches' door 2): the card
  // records them as `steps`, which the animation layer plays a departure and an
  // arrival off.
  picked.made = [];
  // The caster's own step, and each ally's as a `party` one (the B2 review, item h).
  const moved = await stepTo({ token: picked.doc, to: picked.to, feet: step.feet, by: actor, except, move: { kind: "self", itemUuid: spell.uuid } });
  lines.push(steppedWords(moved, { feet: step.feet, source: spell.name }));
  if (moved.step) picked.made.push(moved.step);
  if (!moved.moved || !picked.party.length) return lines;
  const grid = picked.doc.parent?.grid ?? null;
  const sizeX = Number(grid?.sizeX ?? grid?.size) || 100;
  const sizeY = Number(grid?.sizeY ?? grid?.size) || 100;
  for (const spot of partyStep(picked.from, picked.to, picked.party.map(d => ({ id: d.id, x: d.x, y: d.y })))) {
    const doc = picked.party.find(d => d.id === spot.id);
    if (!doc?.parent) continue;
    const centre = { x: spot.x + ((doc.width ?? 1) * sizeX) / 2, y: spot.y + ((doc.height ?? 1) * sizeY) / 2 };
    const judged = judgeStep(doc, centre, { feet: step.feet, sight: "seen", except, askSight: false });
    if (judged.refusal) {
      lines.push(stepWords(judged.refusal, { name: doc.name ?? "", feet: step.feet }));
      continue;
    }
    const carried = await stepTo({ token: doc, to: judged.to, feet: step.feet, by: actor, except, move: { kind: "party", itemUuid: spell.uuid } });
    lines.push(steppedWords(carried, { feet: step.feet, source: spell.name }));
    if (carried.step) picked.made.push(carried.step);
  }
  return lines;
}

/**
 * **WHAT THE CROSS-CLASS RULINGS PUT ON A SPELL'S CARD, IN WORDS** (D-778): one
 * labelled line each - the Speed drop or the Slowed a hit laid (07's Frostbolt, Ice
 * Spear, Wrath), the forced move a failed Test or the area makes (Blast Wave, Gust
 * of Wind, Ley Rift, Tempest, Void Rift), the escape 07 gives a held or Stunned
 * creature (Frost Nova, Absolute Zero, Rimebind, Thornguard ...), and a laid effect
 * no Dispel may end (04's Improved Moonfire at rank 2). Never colour alone.
 *
 * @param {{speedLines?: string[], forced?: object|null, escape?: object|null, undispellable?: {by: string}|null}} o
 * @returns {Array<{label: string, text: string}>}
 */
function crossCardLines({ speedLines = [], conditionLines = [], forced = null, escape = null, undispellable = null, stepLines = [], splashLines = [], namedLines = [], struckLines = [] } = {}) {
  const out = [];
  const label = key => game.i18n.localize(key);
  // Where the spell moved its caster and its targets (the Legacy branches' door 3).
  for (const text of stepLines) out.push({ label: label("AZEROTH.Step.Label"), text });
  // The creatures named at the cast, whom the area lets be (the B9a pass).
  for (const text of namedLines) out.push({ label: label("AZEROTH.Area.NamedLabel"), text });
  // What the next blow on the caster asks of its striker (the B9a pass).
  for (const text of struckLines) out.push({ label: label("AZEROTH.Struck.Label"), text });
  // Whom the spell's splash reaches around its target, and what stays the table's (the B8a pass).
  for (const text of splashLines) out.push({ label: label("AZEROTH.Splash.Label"), text });
  for (const text of speedLines) out.push({ label: label("AZEROTH.SpeedDrop.Label"), text });
  for (const text of conditionLines) out.push({label:label("AZEROTH.Condition.Label"),text});
  if (forced) {
    out.push({
      label: label("AZEROTH.Forced.Label"),
      text: game.i18n.format(`AZEROTH.Forced.CardLine.${forced.on}${forced.toward === "toward" ? "Toward" : "Away"}`, {
        feet: forced.feet, resilience: game.i18n.localize(AZEROTH.resiliences[forced.resilience] ?? forced.resilience ?? ""),
        // Nether Rift's reach at the caster's turn (the B9a pass).
        within: forced.within ?? ""
      })
    });
  }
  if (escape) {
    // The Test 07 states, then what the talents put on it: Frost Nova's and Absolute
    // Zero's Bane, Deep Freeze's Stun on a failure - each named.
    const by = escape.talents.length ? ` (${escape.talents.join(", ")})` : "";
    const parts = [game.i18n.format(`AZEROTH.Escape.CardLine.${escape.on}`, {
      condition: game.i18n.localize(AZEROTH.conditions[escape.condition] ?? escape.condition),
      resilience: game.i18n.localize(AZEROTH.resiliences[escape.resilience] ?? escape.resilience),
      dc: escape.dc ?? "—"
    })];
    if (escape.banes > 0) parts.push(game.i18n.format("AZEROTH.Escape.CardBanes", { n: escape.banes, by }));
    if (escape.failStun) parts.push(game.i18n.format("AZEROTH.Escape.CardFailStun", { by }));
    out.push({ label: label("AZEROTH.Escape.Label"), text: parts.join(" ") });
  }
  if (undispellable?.by) out.push({ label: label("AZEROTH.Dispel.Label"), text: game.i18n.format("AZEROTH.Dispel.CardMarked", { by: undispellable.by }) });
  return out;
}

/**
 * Why 02's Dispel greys a row, in words (D-778): the law's reason
 * (`rules/dispel.mjs#DISPEL_REFUSALS`) with what it names.
 *
 * @param {{reason: string|null, by: string|null, conditions: string[]}} row
 */
function dispelRefusalWords(row) {
  return game.i18n.format(DISPEL_REFUSALS[row?.reason] ?? DISPEL_REFUSALS.status, {
    conditions: (row?.conditions ?? []).map(id => game.i18n.localize(AZEROTH.conditions[id] ?? id)).join(", "),
    by: row?.by || game.i18n.localize("AZEROTH.Dispel.Refuse.ByTalent")
  });
}

/**
 * **A CASTING TEST A USE MAKES FOR A GATE** (04's Everlasting Affliction at rank 2:
 * *Dispel and similar effects end one of them only on a Casting Test that meets or
 * exceeds SL 2*; D-778): the user's casting ability and Proficiency, against the DC
 * the door names, rolled straight - the Use opens no dialog (MY READING, for the
 * lead: a Bane laid on the user's next Casting Test is left for one made through the
 * dialog).
 *
 * @param {Actor} actor
 * @param {{dc: number}} o
 * @returns {Promise<AzerothRoll>}
 */
export async function gateCastingTest(actor, { dc, source = null }) {
  const gateSource = source ?? (await import("../applications/roll-dialog.mjs")).sourceOf(actor);
  const spellLock = await requestSpellLockWindow({ actor, source: gateSource, test: { kind: "gate" } });
  if (!spellLock?.ok) {
    ui.notifications?.warn("The casting reaction window could not be confirmed. No gate Casting Test was rolled. Check the operation's paid costs and reaction records before trying again.");
    return null;
  }
  const casting = (actor.classItems ?? []).find(c => c.system?.castingAbility)?.system?.castingAbility ?? null;
  const modifiers = [];
  if (casting) modifiers.push({ label: AZEROTH.abilities[casting], value: actor.system.abilities?.[casting]?.mod ?? 0 });
  modifiers.push({ label: "AZEROTH.Sheet.Proficiency", value: actor.system.proficiency ?? 0 });
  // A Casting Test made while Engaged takes its Bane (06 §5), as every casting roll does.
  const engaged = engagedNow(actor);
  const roll = AzerothRoll.build({ dc, modifiers, boons: 0, banes: (engaged ? 1 : 0) + spellLock.banes, kind: "casting", rollData: actor.getRollData() });
  roll.options.spellLock = { castId: spellLock.castId, banes: spellLock.banes };
  if (spellLock.banes > 0) roll.options.provenance.push({ label: "Spell Lock", value: null,
    formula: `${spellLock.banes} ${spellLock.banes === 1 ? "Bane" : "Banes"}` });
  if (engaged) roll.options.provenance.push({ label: "AZEROTH.Dialog.Circumstance", value: null, formula: game.i18n.localize("AZEROTH.Modifier.EngagedCasting") });
  await roll.evaluate();
  await actor.offerElunesRegard?.(roll);
  return roll;
}

/**
 * Lift a spell's laid effects (D-657) from every actor the user can write:
 * the world's actors and every scene's tokens, where the effect's
 * `spell` flag is the spell's uuid and its origin is the caster. What a
 * Sustain held ends with it (the lead, 2026-09-06; closes O-93).
 */
export async function liftSpellEffects(actor, spellUuid, cast = null) {
  if (!spellUuid) return 0;
  const seen = new Set();
  const carriers = [];
  for (const a of game.actors ?? []) carriers.push(a);
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) if (token.actor) carriers.push(token.actor);
  }
  let lifted = 0;
  for (const carrier of carriers) {
    if (seen.has(carrier.uuid) || !carrier.isOwner) continue;
    seen.add(carrier.uuid);
    const ids = carrier.effects.filter(e =>
      // New sustained carriers have one writer: the active-GM lifecycle sweep.
      // That writer also reaches targets the caster's player cannot modify.
      e.getFlag("azeroth-rpg", "sustained") !== true &&
      e.getFlag("azeroth-rpg", "spell") === spellUuid &&
      (!e.origin || e.origin === actor.uuid) &&
      (!cast || e.getFlag("azeroth-rpg", "cast") === cast)
    ).map(e => e.id);
    if (!ids.length) continue;
    await carrier.deleteEmbeddedDocuments("ActiveEffect", ids);
    lifted += ids.length;
  }
  return lifted;
}

/**
 * End a Sustain from the Spells tab (the lead, 2026-09-06): the spell comes
 * off the sustaining list, its laid effects are lifted, and the tab says so.
 *
 * **THE ONE DOOR THAT ENDS ONE SUSTAIN.** The Spells tab's Stop and the sheet's
 * name the spell; an area taken off the board by hand (D-760; the lead,
 * 2026-09-29: *Deleting ends it*) names the CAST its Region recorded
 * (`dice/chat.mjs#regionFlagsFromCard`, D-724's key), because two Sustains of
 * one spell - a caster whose feature raises the limit - are two casts, and the
 * spell's name would end whichever came first. `notice` is the key the
 * notification says it in.
 */
export async function endSustain({ actor, spellId = null, uuid = null, cast = null, notice = "AZEROTH.Combat.SustainDropped" } = {}) {
  const sustaining = foundry.utils.deepClone(actor.getFlag("azeroth-rpg", "sustaining") ?? []);
  const index = cast
    ? sustaining.findIndex(s => s?.cast === cast)
    : sustaining.findIndex(s => (spellId && s.spellId === spellId) || (uuid && s.uuid === uuid));
  if (index === -1) return null;
  if (sustainEntryTransferPending(sustaining[index], actor.uuid)) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Spellsteal.TransferPending", { name: actor.name, spell: sustaining[index].name }));
    return null;
  }
  const [ended] = sustaining.splice(index, 1);
  // **A TOKEN ACTOR WRITES AN EMPTY LIST** (the final review of D-757), as
  // `endAllSustains` below does: an unset on a synthetic actor's delta lets
  // the world actor's list show through, so the Stop dropped nothing.
  if (sustaining.length || actor.isToken) await actor.setFlag("azeroth-rpg", "sustaining", sustaining);
  else await actor.unsetFlag("azeroth-rpg", "sustaining");
  const spell = actor.items.get(ended.spellId) ?? null;
  await liftSpellEffects(actor, spell?.uuid ?? ended.uuid ?? null, ended.cast ?? null);
  ui.notifications?.info(game.i18n.format(notice, { name: actor.name, spell: ended.name }));
  return ended;
}

/** `endAllSustains` in flight, by the actor's uuid: one end at a time per actor. */
const SUSTAIN_ENDS = new Map();

/**
 * **EVERYTHING AN ACTOR SUSTAINS ENDS AT ONCE** (05 §12; the review of D-756,
 * M1), and this is the ONE writer for it. *Taking a Critical Injury ends what
 * you are Sustaining*, and a Critical Injury happens on reaching 0 Health (06
 * §8, §9; 05: *At 0 Health you take a Critical Injury and your part in the
 * fight is over*). So two doors call it: `sufferInjury`, for the injury a
 * natural 20 dealt, and `AzerothActor#_onUpdate`, the moment Health is written
 * to 0 by ANY path - `adjustHealth`, a Suffer's 20 row, Fatigue's collapse, the
 * sheet, the token bar. At 0 a character's injury card is rolled at that same
 * moment, and its Suffer then finds nothing held: a Sustain is never ended
 * twice. A creature has no Suffer at 0, and until this nothing ended its
 * Sustain at all, so its area went on striking the party that killed it.
 *
 * The flag goes before what it held is lifted, and the sweep watching the flag
 * takes the areas (`canvas/sustained-areas.mjs`). **A token's synthetic actor
 * may INHERIT the flag from its world actor**, and an unset on the delta
 * leaves the base's list standing, so a token actor writes an empty list over
 * it. One end at a time per actor: two doors racing would read the same list
 * and lift the same effects twice, which core answers with an error.
 *
 * @param {{actor: Actor}} o
 * @returns {Promise<object[]>} the entries ended
 */
export function endAllSustains({ actor } = {}) {
  if (!actor) return Promise.resolve([]);
  const key = actor.uuid;
  const run = async () => {
    const held = actor.getFlag?.("azeroth-rpg", "sustaining") ?? [];
    if (!held.length) return [];
    const { ended, retained } = endSustainsPlan(held, actor.uuid);
    if (retained.length || actor.isToken) await actor.setFlag("azeroth-rpg", "sustaining", retained);
    else await actor.unsetFlag("azeroth-rpg", "sustaining");
    for (const entry of ended) {
      await liftSpellEffects(actor, actor.items.get(entry?.spellId)?.uuid ?? entry?.uuid ?? null, entry?.cast ?? null);
      ui.notifications?.info(game.i18n.format("AZEROTH.Combat.SustainEnded", { name: actor.name, spell: entry?.name ?? "" }));
    }
    if (retained.length) ui.notifications?.warn(game.i18n.format("AZEROTH.Spellsteal.TransferInterrupted", { name: actor.name }));
    return ended;
  };
  const prior = SUSTAIN_ENDS.get(key) ?? Promise.resolve([]);
  const next = prior.then(run, run);
  SUSTAIN_ENDS.set(key, next);
  const clear = () => { if (SUSTAIN_ENDS.get(key) === next) SUSTAIN_ENDS.delete(key); };
  next.then(clear, clear);
  return next;
}

/**
 * What `endAllSustains` is still doing for an actor, to wait on - resolved
 * where nothing is, and never a rejection: the door that began it has already
 * said what failed. `AzerothActor#adjustHealth` waits on this, so a tick or a
 * blow that drops a caster to 0 returns with the Sustain already gone.
 *
 * @param {Actor} actor
 * @returns {Promise<object[]>}
 */
export function sustainsEnding(actor) {
  const pending = actor ? SUSTAIN_ENDS.get(actor.uuid) : null;
  return pending ? pending.catch(() => []) : Promise.resolve([]);
}

/**
 * **WHAT AN AREA DOES AT THE START OF A TURN, IN WORDS** (D-756), for the
 * card's *Each turn* line: `rules/area-ticks.mjs#tickParts` decides the
 * parts and this hands them their words. Null where the tick lands nothing
 * on its own - a base clause that is a Test lands through the creature's own
 * Resist card at its turn (`effects/area-strikes.mjs#postAreaTest`, D-757).
 *
 * @param {object} tick
 * @param {{widen?: number}} [o]  feet a talent adds to a self-centred reach
 * @returns {{text: string, note: string}|null}
 */
function areaTickLine(tick, { widen = 0 } = {}) {
  const parts = tickParts(tick);
  if (!parts.length) return null;
  const self = tick.centre === "self";
  const where = self
    ? game.i18n.format("AZEROTH.Card.AreaTickWhere.self", { feet: (Number(tick.feet) || 0) + (Number(widen) || 0) })
    : game.i18n.localize("AZEROTH.Card.AreaTickWhere.area");
  const or = ` ${game.i18n.localize("AZEROTH.Card.AreaTickOr")} `;
  // A kind clause that names its own subject says it: Hallowed Ground's *an
  // undead or demon enemy* (the lead, 2026-09-26) reads *an undead enemy or a
  // demon enemy*, never the bare kinds that would promise the 4 to an ally.
  const kindWords = (kinds, who = null) => kinds
    .map(k => game.i18n.localize(who === "enemy" ? `AZEROTH.CreatureKindEnemy.${k}` : `AZEROTH.CreatureKind.${k}`))
    .join(or);
  const school = key => game.i18n.localize(AZEROTH.schools[key] ?? key ?? "");
  const said = parts.map(p => {
    if (p.instead) {
      return p.kind === "damage"
        ? game.i18n.format("AZEROTH.Card.AreaTickInstead", { kinds: kindWords(p.kinds), rating: p.rating, school: school(p.school) })
        : game.i18n.format("AZEROTH.Card.AreaTickInsteadHeal", { kinds: kindWords(p.kinds), amount: p.amount });
    }
    const who = p.kinds.length ? kindWords(p.kinds, p.who) : game.i18n.localize(`AZEROTH.Card.AreaTickWho.${p.who}`);
    return p.kind === "damage"
      ? game.i18n.format("AZEROTH.Card.AreaTickDamage", { who, where, rating: p.rating, school: school(p.school) })
      : game.i18n.format("AZEROTH.Card.AreaTickHeal", { who, where, amount: p.amount });
  });
  return {
    text: said.join("; "),
    note: game.i18n.localize(self ? "AZEROTH.Card.AreaTickNoteSelf" : "AZEROTH.Card.AreaTickNote")
  };
}

/**
 * A one-line account of a spell's damage: the Rating, less any Ward, less what
 * an ally's aura adds after it (D-755) - which is named, because a bare second
 * minus reads as a second Ward.
 */
function spellDamageExplanation(result, rating) {
  // Each second amount of its own type, after the spell's own lane (D-777).
  const parts = partsWords(explainDamage(result).extras);
  const tail = text => (parts ? `${text} \u00b7 ${parts}` : text);
  if (result.immune) return tail(game.i18n.localize("AZEROTH.Card.Immune"));
  if (result.vulnerable) return tail(`${rating} ${game.i18n.localize("AZEROTH.Card.Vulnerable")}`);
  const sum = result.mitigation ? `${rating} \u2212 ${result.mitigation}` : `${rating}`;
  if (!result.schoolArmor) return tail(sum);
  // What the aura TOOK, then the Armor Points it stands at (D-755's review).
  return tail(`${sum} \u2212 ${result.schoolArmor} \u00b7 ${game.i18n.format("AZEROTH.Card.VsAuraArmor", { ap: result.auraAP ?? result.schoolArmor })}`);
}

/* -------------------------------------------- */

/* -------------------------------------------- */
/*  The Legacy branches' B3 Uses (door 25)       */
/* -------------------------------------------- */

/** The Armor Point locations a creature HAS: a null is no such location (06 §2). */
function apLocationsOn(actor) {
  const ap = actor?.system?.ap ?? {};
  return Object.keys(AZEROTH.locations ?? {}).filter(k => ap[k] !== null && ap[k] !== undefined);
}

/**
 * **04's THE MOUNTAIN WAKES' ARMOR, ON THE USE'S OWN ENCOUNTER EFFECT** (*Until the
 * encounter ends your Armor Points rise by 2, you have Ward 2 against every school*;
 * the Legacy branches' door 25): the changes `rules/legacy-uses.mjs#armorChanges` lays,
 * every one `final`, merged into the damage buff the same Use switches on - one effect
 * a Use, lifted by `_leaveFight` with every encounter buff - or an encounter effect of
 * their own where the row has no damage buff.
 *
 * @param {{until: string, amount: number|null, changes: Array<object>}|null} buff  `damageBuffFor`'s
 * @param {object|null} plan  `judgeSpiritUses`'
 * @param {Actor} actor
 */
function withSpiritArmor(buff, plan, actor) {
  const armor = plan?.armor ?? null;
  if (!armor) return buff;
  const changes = armorChanges(armor, { apLocations: apLocationsOn(actor), schools: Object.keys(AZEROTH.schools ?? {}) });
  if (!changes.length) return buff;
  if (buff) return { ...buff, changes: [...buff.changes, ...changes] };
  // **OR UNTIL THE USER'S NEXT TURN** (04's Bladestorm: *Until your next turn your Armor
  // Points rise by your Dexterity modifier*; the Legacy branches' B6): the armor's own
  // span where the Use switches on no damage buff (`legacy-uses.mjs#ARMOR_SPANS`).
  return { until: armor.until ?? "encounter", amount: null, changes };
}

/**
 * **A SUSTAIN A USE HOLDS, WITH ITS STATED UPKEEP** (04's Big Bad Voodoo: *While you
 * Sustain it ... Sustaining it costs 5 Mana a turn*; the Legacy branches' door 12): an
 * entry on the user's `sustaining` - the flag 05 §12's turn charges at the entry's own
 * upkeep (`rules/upkeep.mjs#upkeepOf`) and every door that ends a Sustain clears - under
 * 05 §12's limit, the oldest dropped first, as Flametongue's (D-779) is held.
 *
 * @param {Actor} actor
 * @param {{name: string, identifier: string, upkeep: {mana: number, health: number}|null, poolItemId?: string|null}} o
 * @returns {Promise<string>}  the card's line
 */
async function holdUseSustain(actor, { name, identifier, upkeep = null, poolItemId = null } = {}) {
  const sustaining = foundry.utils.deepClone(actor.getFlag("azeroth-rpg", "sustaining") ?? []);
  const cost = { mana: Math.max(0, Math.trunc(Number(upkeep?.mana)) || 0), health: Math.max(0, Math.trunc(Number(upkeep?.health)) || 0) };
  sustaining.push({
    spellId: null, uuid: null, name, itemId: poolItemId, cast: foundry.utils.randomID(),
    identifier, targets: [], source: null, upkeep: cost
  });
  const features = actor.items.filter(i => i.type === "feature").map(i => ({ name: i.name }));
  const more = sustainsFor(actor.takenTalents?.() ?? [], {
    holdsWeave: features.some(f => f.name === "Shape the Weave"),
    archmageStanding: (actor.effects ?? []).some(e => e.active !== false && e.getFlag?.("azeroth-rpg", "identifier") === "archmage")
  });
  const limit = sustainLimit({ features, extra: more.more });
  while (sustaining.length > limit) {
    const dropped = sustaining.shift();
    await liftSpellEffects(actor, actor.items.get(dropped.spellId)?.uuid ?? dropped.uuid ?? null, dropped.cast ?? null);
    ui.notifications?.info(game.i18n.format("AZEROTH.Combat.SustainEnded", { name: actor.name, spell: dropped.name }));
  }
  await actor.setFlag("azeroth-rpg", "sustaining", sustaining);
  return game.i18n.format("AZEROTH.Sustain.Held", { name, n: cost.mana });
}

/**
 * **WHAT THE LEGACY BRANCHES' B3 USES NEED, JUDGED AND PICKED BEFORE ANYTHING IS PAID**
 * (door 25; D-768's order: every refusal, then the budget, the reveal and the
 * payment). `rules/legacy-uses.mjs#onUseSpirits` reads the granting talent's (or the
 * gadget's) `onUse` at the rank; each mechanism here is judged off the world as this
 * client holds it, and each pick - a condition, a point, the effects an area's dispel
 * ends, the transporter's choice - is made now, so a dismissed one costs nothing.
 *
 * Answers `null` where the Use is refused (said in words, or a pick dismissed), `{early}`
 * where the Use is done without a payment (the Crossing stepped back from, a
 * transporter pad set over a Short Rest), and otherwise the plan the writes read.
 *
 * @param {{actor: Actor, item: Item, sys: object, onUse: object|null, rank: number, list: object[],
 *   talentRow: object|null, ownToken: Token|null}} o
 * @returns {Promise<object|null>}
 */
async function judgeSpiritUses({ actor, item, sys, onUse, rank, list, talentRow, ownToken }) {
  const tier = actor.system?.tier ?? 1;
  const spirits = onUseSpirits(onUse, { rank, tier, scope: abilityScope(actor.system ?? {}), conditions: Object.keys(AZEROTH.conditions ?? {}) });
  const plan = { spirits };
  const aimed = list.filter(t => targetActorOf(t));
  const warn = (key, data = {}) => {
    ui.notifications?.warn(game.i18n.format(key, { name: item.name, ...data }));
    return null;
  };

  if (spirits.waterBreathing) {
    const target = aimed[0] ? targetActorOf(aimed[0]) : actor;
    if (!target) return warn("AZEROTH.Card.TargetGone");
    if (gmAbsentForActors([target])) return warn("AZEROTH.LegacyUse.NoGM");
    plan.waterBreathing = { target, feet: feetBetweenTokens(ownToken, tokenOfTarget(aimed[0])) };
  }

  // **04's HOLD THE THREAD IS ASKED AT THE STEP** (*As a Reaction ... A creature within
  // 30 feet that would take a Death Step does not take it*; door 11): the counter the
  // talent grants is struck by the hold itself (`effects/death-holds.mjs`), never
  // pressed from the sheet.
  if (talentRow?.deathHold) return warn("AZEROTH.DeathHold.SheetUse", { feet: Math.max(0, Math.trunc(Number(talentRow.deathHold.feet)) || 0) });
  // **A BLOW TAKEN ONTO THE HOLDER IS ASKED IN THE BLOW** (04's Guardian and Shared Burden;
  // D-777, the Legacy branches' B6): pressed from the sheet it paid its price and its
  // Reaction for nothing, so it is refused in words before anything is spent. The feet at
  // the rank (Guardian's 10 at rank 2).
  if (talentRow?.moves) {
    const reach = [talentRow.moves, ...(talentRow.moves.atRank ?? []).filter(c => rank >= (Number(c?.rank) || Infinity))]
      .reduce((feet, c) => (c?.feet !== undefined ? Math.max(0, Math.trunc(Number(c.feet)) || 0) : feet), 0);
    return warn("AZEROTH.BlowDoor.SheetUse", { feet: reach });
  }

  // **04's THE CROSSING** (*You step into the Spirit Realm for up to one minute and step
  // back where you left*; door 10): stepping back is free, before the minute is out.
  const crossing = crossingOf(onUse, rank);
  if (crossing) {
    if (crossed(actor)) {
      const ids = (actor.effects ?? []).filter(e => e.flags?.["azeroth-rpg"]?.spiritRealm).map(e => e.id);
      if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
      const posted = await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.Spirit.SteppedBack", { name: actor.name, feature: item.name })}</p>`,
        flags: { "azeroth-rpg": { kind: "spiritRealm" } }
      });
      return { early: posted };
    }
    plan.crossing = crossing;
  }

  // **A CONCEALMENT** (the Gnomish Cloaking Device: *You and every ally within 10 feet
  // are hidden, even while observed, for one minute*; Wind Walk at rank 2): the allies
  // measured now, between the nearest squares (D-732); one this client does not own is
  // hidden on the GM's client, so with none online the Use is refused first.
  if (spirits.conceal) {
    const allies = spirits.conceal.allies && ownToken
      ? creaturesWithin(actor, spirits.conceal.feet, { who: "ally", except: [ownToken.id] }).filter(r => r.actor && r.actor.uuid !== actor.uuid)
      : [];
    if (gmAbsentForActors(allies.map(r => r.actor))) return warn("AZEROTH.LegacyUse.NoGM");
    plan.conceal = { ...spirits.conceal, allies: allies.map(r => ({ actor: r.actor, feet: r.feet })) };
  }

  // **ONE CONDITION ENDED** (Voodoo Mending: *A friendly target within 30 feet ... one
  // condition of your choice on it ends, **Charmed** and **Stunned** included*; the
  // Recombobulator; Arclight Spanner): the creature targeted, else the user; the
  // condition chosen through the one chooser (D-673) where it carries more than one.
  if (spirits.cures) {
    const one = aimed[0] ?? null;
    const target = one ? targetActorOf(one) : actor;
    if (!target) return warn("AZEROTH.Card.TargetGone");
    const refused = cureRefusal(spirits.cures, { hostile: target.uuid !== actor.uuid && !allyOf(actor, target) });
    if (refused) return warn(refused, { target: one?.name ?? target.name });
    if (target.uuid !== actor.uuid && gmAbsentForActors([target])) return warn("AZEROTH.LegacyUse.NoGM");
    const open = curableConditionsOn(target, spirits.cures);
    let id = open[0] ?? null;
    if (open.length > 1) {
      const pick = await chooseOption(item, open.map(c => ({ key: c, name: game.i18n.localize(AZEROTH.conditions[c] ?? c), description: "" })), null, {
        label: "AZEROTH.Cure.End", prompt: game.i18n.format("AZEROTH.Cure.Prompt", { target: one?.name ?? target.name })
      });
      if (!pick) return null;
      id = pick.key;
    }
    plan.cure = { target, id, name: one?.name ?? target.name };
  }

  // **AN AREA'S DISPEL** (04's Disenchant: *On success, end one effect on each creature
  // within 15 feet of a point within 60 feet, or two at rank 2. A summoned or bound
  // creature there also takes Nature damage equal to twice your tier*): the point picked
  // within the feet of the user's token, every creature whose space reaches the radius,
  // and - for each - the effects 02's Dispel's law lets it end (`dispelOptionsOn`),
  // chosen now. Ended on the Test's success (`landSpiritCasting`).
  if (spirits.areaDispel) {
    const d = spirits.areaDispel;
    if (!ownToken?.document?.parent || ownToken.document.parent.id !== canvas?.scene?.id) return warn("AZEROTH.Disenchant.NoToken");
    const at = await pickPoint({
      hint: game.i18n.format("AZEROTH.Disenchant.Pick", { name: item.name, feet: d.within, radius: d.radius }),
      accept: point => {
        const feet = feetToPoint(ownToken, point);
        if (feet !== null && feet <= d.within) return true;
        ui.notifications?.warn(game.i18n.format("AZEROTH.Disenchant.PickTooFar", { name: item.name, feet: d.within }));
        return false;
      }
    });
    if (!at) return null;
    // **THE SCENE'S OWN TOKENS, NEVER A DEFEATED OR A HIDDEN ONE** (the B3 review): the
    // viewed board's placeables put a GM-hidden creature and a defeated one in a player's
    // chooser (`rules/legacy-uses.mjs#areaDispelReaches`, over `standingOf`).
    const scene = ownToken.document.parent;
    const fightNow = actor.activeFight?.() ?? null;
    const gmHere = game.user?.isGM === true;
    const defeatedStatus = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
    const inside = [...(scene.tokens ?? [])]
      .filter(doc => {
        if (!doc.actor) return false;
        const standing = standingOf(doc, combatantIn(fightNow, doc.actor, doc), fightNow);
        return areaDispelReaches({ ...standing, defeated: standing.defeated || doc.actor.statuses?.has?.(defeatedStatus) === true }, { gm: gmHere });
      })
      .map(doc => ({ token: doc.object ?? doc, actor: doc.actor, feet: feetToPoint(doc, at) }))
      .filter(r => r.feet !== null && r.feet <= d.radius)
      .sort((a, b) => String(a.token.name ?? "").localeCompare(String(b.token.name ?? "")) || String(a.token.id).localeCompare(String(b.token.id)));
    if (gmAbsentForActors(inside.map(r => r.actor))) return warn("AZEROTH.Dispel.NoGM");
    const picks = [];
    for (const r of inside) {
      const rows = dispelOptionsOn(r.actor);
      const open = rows.filter(x => x.available);
      if (!open.length) continue;
      const options = rows.map(x => ({
        key: x.id, name: x.name, available: x.available, reason: x.reason,
        tag: x.available ? null : dispelRefusalWords(x),
        description: r.actor.effects.get(x.id)?.description ?? ""
      }));
      const answer = await chooseOption(item, options, null, {
        max: Math.min(d.count, open.length), label: "AZEROTH.Dispel.End",
        prompt: game.i18n.format("AZEROTH.Disenchant.Prompt", { target: r.token.name ?? r.actor.name, n: d.count })
      });
      const chosen = answer === null ? [] : (Array.isArray(answer) ? answer : [answer]);
      if (!chosen.length) return null;
      const closed = chosen.find(c => c.available === false);
      if (closed) return warn("AZEROTH.Dispel.Refused", { name: closed.name, reason: closed.tag ?? "" });
      const ids = chosen.map(c => c.key);
      picks.push({ target: r.actor, name: r.token.name ?? r.actor.name, ids, names: chosen.map(c => c.name), gated: dispelGatesOn(r.actor, ids) });
    }
    const struck = d.damage
      ? inside.filter(r => summonedOrBound({ bond: bondOf(r.actor), summoned: r.actor.getFlag?.("azeroth-rpg", SUMMONED_FLAG) ?? null })).map(r => r.token)
      : [];
    if (!picks.length && !struck.length) return warn("AZEROTH.Disenchant.Nothing", { radius: d.radius });
    plan.areaDispel = { at, picks, struck, damage: d.damage };
  }

  // **A THRALL** (04's Thrall of the Banshee: *A creature within 30 feet that is not a
  // Boss makes a Spirit Resilience Test against your Spell DC or is **Charmed** by you
  // for one minute*): one creature targeted, within the feet, never a Boss - bound on
  // the card's Resist failing (`dice/chat.mjs#rollResists`).
  if (spirits.thrall) {
    const one = aimed[0] ?? null;
    const target = one ? targetActorOf(one) : null;
    const apart = one ? feetBetweenTokens(ownToken, tokenOfTarget(one)) : null;
    // **ONE OF THE GM'S CREATURES, BOUND ONCE, ON THE GM'S CLIENT** (the lead, 2026-10-22:
    // *"Have the creature stat block for the token set to bound to the player by GM who can
    // then remove it"*): never a character, never a creature bound already, and - the
    // bind being the GM's write - refused here with no GM online, before anything is paid.
    const refused = thrallRefusal({
      named: aimed.length, boss: target?.system?.isBoss === true, distance: apart, feet: spirits.thrall.feet,
      self: Boolean(target) && target.uuid === actor.uuid, character: target?.type === "character", bound: Boolean(target && bondOf(target))
    });
    if (refused) return warn(refused, { target: one?.name ?? "", feet: spirits.thrall.feet });
    if (gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) return warn("AZEROTH.LegacyUse.NoGM");
    // The creature the card's Resist binds, and its row on the card (the B3 review).
    plan.thrall = {
      ...spirits.thrall, target, index: list.indexOf(one),
      record: { actorUuid: target.uuid, sceneId: one.sceneId ?? null, tokenId: one.tokenId ?? null, actorId: one.actorId ?? null, name: one.name ?? target.name }
    };
  }

  // **A CREATURE CALLED BACK** (04's Ancestral Spirit): one creature, within the feet,
  // whose THIRD Death Step came since the end of the user's last turn, with a Tether
  // left and never called back this way before (`rules/death-holds.mjs#reviveRefusal`).
  if (spirits.revive) {
    const one = aimed[0] ?? null;
    // **THE CREATURE THE DYING TRACK WROTE ON** (the B3 review): the token's own actor - for
    // an unlinked one, never its world actor, which carries none of its steps.
    const target = one ? targetActorOf(one) : null;
    const apart = one ? feetBetweenTokens(ownToken, tokenOfTarget(one)) : null;
    const facts = target ? reviveFacts(actor, target, { distance: apart, feet: spirits.revive.feet }) : {};
    const refused = reviveRefusal({ ...facts, named: aimed.length, feet: spirits.revive.feet });
    if (refused) return warn(refused, { target: one?.name ?? "", feet: spirits.revive.feet });
    if (gmAbsentForActors([target])) return warn("AZEROTH.LegacyUse.NoGM");
    plan.revive = { target, distance: apart, name: one?.name ?? target?.name ?? "" };
  }

  // **EVERY DYING FRIEND IN REACH, LIFTED** (04's Ancestor's Hand: *Every Dying friendly
  // target within 30 feet restores Health equal to your tier per rank and stands*; the
  // Legacy branches' B6): the allies within the feet who are Dying (06 §9), measured now,
  // between the nearest squares (D-732). None there refuses in words before anything is
  // paid, as does one this client cannot write on with no GM online.
  if (spirits.lift) {
    const near = ownToken
      ? creaturesWithin(actor, spirits.lift.feet, { who: "ally", except: [ownToken.id] }).filter(r => r.actor && r.actor.uuid !== actor.uuid)
      : [];
    const dying = near.filter(r => dyingNow(r.actor));
    if (!dying.length) return warn("AZEROTH.Lift.NoneDying", { feet: spirits.lift.feet });
    if (gmAbsentForActors(dying.map(r => r.actor))) return warn("AZEROTH.LegacyUse.NoGM");
    plan.lift = { amount: spirits.lift.amount, feet: spirits.lift.feet, dying: dying.map(r => ({ actor: r.actor, feet: r.feet, token: r.token ?? null })) };
  }

  // **THE TRANSPORTER** (04's Ultrasafe Transporter): set a pad (*Over a Short Rest*:
  // never in a fight, no action and no use - done now, with nothing paid), or travel to
  // it (*Once per Long Rest, as a Full Action, you and up to two willing creatures per
  // rank within 10 feet of you arrive on the pad*), judged now.
  if (spirits.transporter) {
    const t = spirits.transporter;
    const pad = cleanPad(actor.getFlag("azeroth-rpg", PAD_FLAG) ?? null);
    const padScene = Boolean(pad && game.scenes?.get(pad.sceneId));
    // **THE LONG REST'S ONE USE IS THE TRAVEL'S** (the B3 review): asked here, after the
    // choice - `useFeature`'s *A use left?* lets a transporter through
    // (`usesAskedLater`) - so a spent use greys the travel and never the pad.
    const spent = Boolean(sys.uses?.per) && (Number(sys.uses?.value) || 0) <= 0;
    const travelTag = spent ? game.i18n.format("AZEROTH.Transporter.Refuse.Spent", { name: item.name })
      : padScene ? null : game.i18n.localize(pad ? "AZEROTH.Transporter.Refuse.PadGone" : "AZEROTH.Transporter.Refuse.NoPad");
    const choice = await chooseOption(item, [
      { key: "set", name: game.i18n.localize("AZEROTH.Transporter.Set"), description: pad ? game.i18n.format("AZEROTH.Transporter.SetReplaces", { scene: pad.sceneName }) : "" },
      {
        key: "travel", name: game.i18n.localize("AZEROTH.Transporter.Travel"),
        description: pad ? game.i18n.format("AZEROTH.Transporter.TravelTo", { scene: pad.sceneName, n: t.count, feet: t.feet }) : "",
        available: padScene && !spent, tag: travelTag
      }
    ], null, { prompt: game.i18n.format("AZEROTH.Transporter.Prompt", { name: item.name }) });
    if (!choice) return null;
    const inFight = Boolean(actor.activeFight?.()?.started);
    const tokenDoc = ownToken?.document ?? null;
    if (choice.key === "set") {
      const refused = transportRefusal("set", { inFight, token: Boolean(tokenDoc) });
      if (refused) return warn(refused);
      const centre = tokenDoc.getCenterPoint?.() ?? { x: tokenDoc.x, y: tokenDoc.y };
      await actor.setFlag("azeroth-rpg", PAD_FLAG, { sceneId: tokenDoc.parent.id, x: Math.round(centre.x), y: Math.round(centre.y), sceneName: tokenDoc.parent.name ?? "", source: item.name });
      const posted = await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p class="azeroth-drain">${game.i18n.format(pad ? "AZEROTH.Transporter.SetAgain" : "AZEROTH.Transporter.SetLine", { name: actor.name, feature: item.name, scene: tokenDoc.parent.name ?? "" })}</p>`,
        flags: { "azeroth-rpg": { kind: "transporterPad" } }
      });
      return { early: posted };
    }
    const others = aimed.filter(x => {
      const a = targetActorOf(x);
      return a && a.uuid !== actor.uuid;
    });
    const far = others.some(x => (feetBetweenTokens(ownToken, tokenOfTarget(x)) ?? Infinity) > t.feet);
    const hostile = others.some(x => !allyOf(actor, targetActorOf(x)));
    const docs = [tokenDoc, ...others.map(x => tokenDocOfTarget(x)).filter(Boolean)].filter(Boolean);
    // **NOT TO ANOTHER SCENE WHILE A TRAVELLER FIGHTS** (the B3 review): the carry makes the
    // token anew on the pad's scene and deletes the old one, which orphans its combatant.
    const refused = transportRefusal("travel", {
      pad, padScene, token: Boolean(tokenDoc), others: others.length, allowed: t.count, far, hostile, spent,
      inFight: docs.some(doc => tokenFightsNow(doc)), padHere: Boolean(pad) && tokenDoc?.parent?.id === pad.sceneId
    });
    if (refused) return warn(refused, { n: t.count, feet: t.feet });
    const needsGM = docs.some(doc => !doc.isOwner) || docs.some(doc => doc.parent?.id !== pad.sceneId);
    if (needsGM && !game.user?.isGM && !game.users?.activeGM) return warn("AZEROTH.LegacyUse.NoGM");
    plan.transport = { pad, docs };
  }

  // **ETHEREAL FORM, AND KINDRED SPIRITS' FRIENDS** (*Your Ethereal Form also covers one
  // friendly target within 30 feet per rank*): with the talent, the creatures targeted
  // besides the user - no more than it covers, each friendly and within its feet. Without
  // it the Use covers the user alone, whatever is targeted.
  if (spirits.ethereal) {
    const kin = etherealAlliesFor(actor.takenTalents?.() ?? [], talentEffect, (expr, scope) => evaluateAmount(String(expr), scope));
    const others = kin ? aimed.filter(x => {
      const a = targetActorOf(x);
      return a && a.uuid !== actor.uuid;
    }) : [];
    if (others.length) {
      const refused = etherealAlliesRefusal({
        named: others.length, allowed: kin.count,
        far: others.some(x => (feetBetweenTokens(ownToken, tokenOfTarget(x)) ?? Infinity) > kin.feet),
        hostile: others.some(x => !allyOf(actor, targetActorOf(x)))
      });
      if (refused) return warn(refused, { talent: kin.name, n: kin.count, feet: kin.feet });
      if (gmAbsentForActors(others.map(x => targetActorOf(x)))) return warn("AZEROTH.LegacyUse.NoGM");
    }
    plan.ethereal = { allies: others.map(x => ({ actor: targetActorOf(x), name: x.name ?? "", feet: feetBetweenTokens(ownToken, tokenOfTarget(x)) })) };
  }

  // **A SUSTAIN OF ITS OWN** (04's Big Bad Voodoo; door 12): one at a time. Flametongue's
  // is D-779's own door and is left to it.
  if (spirits.sustain && spirits.sustain.identifier !== FLAMETONGUE.identifier) {
    if ((actor.getFlag("azeroth-rpg", "sustaining") ?? []).some(e => e?.identifier === spirits.sustain.identifier)) return warn("AZEROTH.Sustain.AlreadyHeld");
    plan.sustain = spirits.sustain;
  }
  if (spirits.immunity) plan.immunity = spirits.immunity;
  if (spirits.freeMove) plan.freeMove = spirits.freeMove;
  if (spirits.armor) plan.armor = spirits.armor;
  plan.healsDealt = spirits.healsDealt === true;
  // **DRAWN ACROSS NAMES ITS ONE CREATURE** (*a creature within 30 feet makes a Spirit
  // Resilience Test*; the B3 review): the card's Resist halves that creature alone, so
  // one is named, never the user, and recorded with its row on the card.
  plan.halvesDealt = null;
  if (spirits.halvesDealt) {
    const one = aimed[0] ?? null;
    const target = one ? targetActorOf(one) : null;
    const refusedHalving = halvesDealtRefusal({ named: aimed.length, self: Boolean(target) && target.uuid === actor.uuid });
    if (refusedHalving) return warn(refusedHalving);
    plan.halvesDealt = {
      ...spirits.halvesDealt, index: list.indexOf(one),
      record: { actorUuid: target.uuid, sceneId: one.sceneId ?? null, tokenId: one.tokenId ?? null, actorId: one.actorId ?? null, name: one.name ?? target.name }
    };
  }
  return plan;
}

/**
 * **WHAT THE B3 USES WRITE, NOW THAT THEY ARE PAID FOR** (door 25): each judged in
 * `judgeSpiritUses`, before the payment. The lines the card says.
 *
 * @param {object|null} plan
 * @param {{actor: Actor, item: Item, poolItemId?: string|null}} o
 * @returns {Promise<string[]>}
 */
async function writeSpiritUses(plan, { actor, item, poolItemId = null }) {
  const lines = [];
  if (!plan) return lines;
  // The Crossing (door 10): the state on the user, to the minute.
  if (plan.crossing) {
    const laid = await crossInto(actor, { source: item.name, minutes: plan.crossing.minutes, img: item.img });
    lines.push(game.i18n.format(laid ? "AZEROTH.Spirit.Crossed" : "AZEROTH.Spirit.NotCrossed", { name: actor.name, n: plan.crossing.minutes }));
  }
  // A concealment: on the user, then each ally measured.
  if (plan.conceal) {
    const span = plan.conceal.until === "minute" ? minuteSpan(actor) : null;
    const mine = await layState(actor, {
      // And what the attack that ends it adds (04's Wind Walk at rank 2; the B6 review).
      flag: CONCEAL_FLAG, data: { source: item.name, by: actor.uuid, ends: [...plan.conceal.ends], ...(plan.conceal.damage > 0 ? { damage: plan.conceal.damage } : {}) }, statuses: [HIDDEN_STATUS], img: item.img, span,
      name: game.i18n.format("AZEROTH.Conceal.Name", { source: item.name }),
      description: `<p>${game.i18n.format("AZEROTH.Conceal.Text", { source: item.name })}</p>`,
      sameAs: raw => raw?.source === item.name
    });
    const hidden = mine ? [actor.name] : [];
    for (const a of plan.conceal.allies) {
      const done = await layStateOn({ target: a.actor, kind: "conceal", by: actor, item, source: item.name, ends: plan.conceal.ends, span: plan.conceal.until === "minute" ? minuteSpan(a.actor) : null, feet: a.feet, img: item.img });
      if (done.landed) hidden.push(done.name);
    }
    lines.push(game.i18n.format(plan.conceal.until === "attack" ? "AZEROTH.Conceal.LineAttack" : "AZEROTH.Conceal.Line", { names: hidden.join(", ") || "\u2014", feature: item.name }));
  }
  // One condition ended.
  if (plan.waterBreathing) {
    const done = await layStateOn({ target: plan.waterBreathing.target, kind: "waterBreathing", by: actor, item,
      source: item.name, feet: plan.waterBreathing.feet, img: item.img });
    lines.push(game.i18n.format(done.landed ? "AZEROTH.Gadget.RebreatherApplied" : "AZEROTH.Gadget.RebreatherFailed", { name: done.name }));
  }
  if (plan.cure) {
    if (!plan.cure.id) lines.push(game.i18n.format("AZEROTH.Cure.Nothing", { target: plan.cure.name }));
    else {
      const done = await cureCondition({ target: plan.cure.target, id: plan.cure.id, by: actor, item });
      lines.push(game.i18n.format(done.ended ? "AZEROTH.Cure.Ended" : "AZEROTH.Cure.NotEnded", { target: plan.cure.name, condition: game.i18n.localize(AZEROTH.conditions[plan.cure.id] ?? plan.cure.id) }));
    }
  }
  // A creature called back.
  if (plan.revive) {
    const done = await reviveCreature({ target: plan.revive.target, by: actor, item, distance: plan.revive.distance });
    // Whether it stood, for the Use's card to record (the Legacy branches' door 2).
    plan.revive.risen = done.risen === true;
    lines.push(game.i18n.format(done.risen ? "AZEROTH.Revive.Risen" : "AZEROTH.Revive.NotRisen", { target: plan.revive.name, n: done.health }));
  }
  // Ancestor's Hand's Dying friends (phase B6): each healed through the one healing door
  // and stood, here or on the GM's client - judged again there off the user's own row.
  if (plan.lift) {
    const stood = [];
    plan.lift.risen = [];
    for (const d of plan.lift.dying) {
      const done = await liftDying({ target: d.actor, by: actor, item, feet: d.feet });
      if (!done.lifted) continue;
      stood.push(done.name);
      const tokenId = d.token?.document?.id ?? d.token?.id ?? null;
      if (tokenId) plan.lift.risen.push({ sceneId: d.token?.document?.parent?.id ?? null, tokenIds: [tokenId] });
    }
    lines.push(stood.length
      ? game.i18n.format("AZEROTH.Lift.Line", { feature: item.name, names: stood.join(", "), n: plan.lift.amount })
      : game.i18n.format("AZEROTH.Lift.Nobody", { feature: item.name }));
  }
  // The transporter's carry, each creature its own d6.
  if (plan.transport) {
    const moved = await transportTo({ by: actor, item, docs: plan.transport.docs, pad: plan.transport.pad });
    for (const m of moved) {
      const roll = await new Roll("1d6").evaluate();
      let fatigued = false;
      if (m.moved && transportFatigues(roll.total)) {
        let who = null;
        try {
          who = m.actorUuid ? fromUuidSync(m.actorUuid) : null;
        } catch {
          who = null;
        }
        if (who) fatigued = (await inflictCondition({ victim: who, id: "fatigued", by: actor, name: m.name })).landed === true;
      }
      lines.push(game.i18n.format(m.moved ? (fatigued ? "AZEROTH.Transporter.ArrivedFatigued" : "AZEROTH.Transporter.Arrived") : "AZEROTH.Transporter.NotMoved", { name: m.name, scene: m.scene, n: roll.total }));
    }
    if (!moved.length) lines.push(game.i18n.format("AZEROTH.Transporter.NoneMoved", { feature: item.name }));
    lines.push(game.i18n.localize("AZEROTH.Transporter.Reason.Continent"));
  }
  // Ethereal Form, on the user and Kindred Spirits' friends, to the USER's next turn.
  if (plan.ethereal) {
    const span = untilNextTurnOrRound(actor);
    const laid = await layEthereal(actor, { source: item.name, span, img: item.img });
    const covered = laid ? [actor.name] : [];
    for (const a of plan.ethereal.allies) {
      const done = await layStateOn({ target: a.actor, kind: "ethereal", by: actor, item, source: item.name, span, feet: a.feet, img: item.img });
      if (done.landed) covered.push(done.name);
    }
    lines.push(game.i18n.format("AZEROTH.Ethereal.Line", { names: covered.join(", ") || "\u2014", feature: item.name }));
  }
  // A timed immunity: the conditions ended, then refused until the span ends.
  if (plan.immunity) {
    const names = plan.immunity.conditions.map(id => game.i18n.localize(AZEROTH.conditions[id] ?? id));
    const ended = [];
    if (plan.immunity.ends) {
      for (const id of plan.immunity.conditions) {
        if (!actor.statuses?.has?.(id)) continue;
        const done = await cureCondition({ target: actor, id, by: actor, item });
        if (done.ended) ended.push(game.i18n.localize(AZEROTH.conditions[id] ?? id));
      }
    }
    const span = plan.immunity.until === "userTurnEnd" ? untilEndOfNextTurnOrRound(actor) : untilNextTurnOrRound(actor);
    await layState(actor, {
      flag: IMMUNE_FLAG, data: { conditions: [...plan.immunity.conditions], source: item.name }, img: item.img, span,
      name: game.i18n.format("AZEROTH.Immune.Name", { source: item.name }),
      sameAs: raw => raw?.source === item.name
    });
    lines.push(game.i18n.format(ended.length ? "AZEROTH.Immune.LineEnded" : "AZEROTH.Immune.Line", { name: actor.name, conditions: names.join(", "), ended: ended.join(", ") }));
  }
  // A Sustain of its own, its upkeep the row's.
  if (plan.sustain) lines.push(await holdUseSustain(actor, { name: item.name, identifier: plan.sustain.identifier, upkeep: plan.sustain.upkeep, poolItemId }));
  // A Move that costs no Half-Action (D-712's door), the ground ignored for it.
  if (plan.freeMove) {
    const fight = actor.activeFight?.() ?? null;
    const mine = fight?.started ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
    if (mine?.isOwner) await mine.grantFreeMove(1);
    if (plan.freeMove.ignoresGround) {
      const stale = (actor.effects ?? []).filter(e => e.flags?.["azeroth-rpg"]?.freeWalk?.source === item.name).map(e => e.id);
      if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: game.i18n.format("AZEROTH.FreeWalk.Name", { source: item.name }), img: item.img ?? "icons/svg/wingfoot.svg", origin: actor.uuid,
        ...(untilNextTurnOrRound(actor) ?? {}),
        flags: { "azeroth-rpg": { [IGNORES_GROUND_FLAG]: true, freeWalk: { source: item.name } } }
      }]);
    }
    lines.push(game.i18n.format(plan.freeMove.ignoresGround ? "AZEROTH.FreeWalk.LineGround" : "AZEROTH.FreeWalk.Line", { name: actor.name, feature: item.name }));
  }
  // The Mountain Wakes' Armor Points and Ward, written with the Use's encounter buff.
  if (plan.armor) {
    // Bladestorm's are until the warrior's next turn (the Legacy branches' B6).
    lines.push(plan.armor.until === "userTurnStart"
      ? game.i18n.format("AZEROTH.UseArmor.UntilTurn", { name: actor.name, ap: plan.armor.ap, feature: item.name })
      : game.i18n.format("AZEROTH.MountainWakes.Line", { name: actor.name, ap: plan.armor.ap, ward: plan.armor.ward }));
  }
  return lines;
}

/**
 * **WHAT A B3 CASTING USE LANDS ON ITS SUCCESS** (04's Disenchant: *make a Casting
 * Test. On success ...*; door 25): each creature's chosen effects ended through 02's
 * Dispel's one door (`effects/dispel.mjs#endEffects`, the feature named so the GM's
 * handler judges it), Everlasting Affliction's gates and Unstable Affliction's answer
 * as 02's Dispel takes them, and the summoned or bound creatures there struck on a card
 * of their own. A failed Test ends nothing.
 *
 * @param {object|null} plan
 * @param {{actor: Actor, item: Item, success: boolean, tierNow: number, extraRolls: Roll[]}} o
 * @returns {Promise<string[]>}
 */
async function landSpiritCasting(plan, { actor, item, success, tierNow, extraRolls, source = null }) {
  const lines = [];
  const d = plan?.areaDispel ?? null;
  if (!d) return lines;
  if (!success) {
    lines.push(game.i18n.format("AZEROTH.Disenchant.Failed", { name: item.name }));
    return lines;
  }
  for (const pick of d.picks) {
    const nameOf = Object.fromEntries(pick.ids.map((id, i) => [id, pick.names[i] ?? id]));
    const blocked = [];
    for (const g of pick.gated) {
      const gateDc = castingDC({ tier: tierNow, targetDefense: pick.target.system?.defense ?? null });
      const test = await gateCastingTest(actor, { dc: gateDc, source });
      if (!test) return null;
      extraRolls.push(test);
      const passed = gatePassed(test.outcome, g.sl);
      if (!passed) blocked.push(g.id);
      lines.push(game.i18n.format(passed ? "AZEROTH.Dispel.GatePassed" : "AZEROTH.Dispel.GateFailed", {
        effect: nameOf[g.id] ?? g.id, talent: g.by, total: test.total, dc: gateDc, sl: test.outcome?.sl ?? 0, need: g.sl
      }));
    }
    const ids = pick.ids.filter(id => !blocked.includes(id));
    const done = ids.length ? await endEffects({ dispeller: actor, target: pick.target, ids, name: pick.name, featureId: item.id }) : { name: pick.name, ended: [], kept: [] };
    lines.push(done.ended.length
      ? game.i18n.format("AZEROTH.Dispel.Ended", { target: pick.name, effects: done.ended.map(e => e.name).join(", ") })
      : game.i18n.format("AZEROTH.Dispel.EndedNone", { target: pick.name }));
    for (const line of await unstableStrikes({ dispeller: actor, ended: done.ended })) lines.push(line);
  }
  if (d.damage && d.struck.length) {
    const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
    const { strikeCard } = await import("../effects/after-blow.mjs");
    const type = d.damage.type ?? "nature";
    const posted = await strikeCard({
      holder: actor, targets: targetSnapshots(d.struck), amount: d.damage.amount, type, name: item.name, kind: "disenchant",
      subtitle: game.i18n.format("AZEROTH.Disenchant.Subtitle", { name: actor.name }),
      explanation: game.i18n.format("AZEROTH.Disenchant.Explanation", { n: d.damage.amount, type: game.i18n.localize(AZEROTH.schools[type] ?? type) })
    });
    if (posted) lines.push(game.i18n.format("AZEROTH.Disenchant.Struck", { names: d.struck.map(t => t.name ?? "").join(", "), n: d.damage.amount }));
  }
  return lines;
}

/**
 * **WHAT THE CARD CARRIES FOR A B3 USE'S OTHER DOORS** (door 25): Life Drain's drainer
 * (the Apply heals it by what the blow took), and - on a Use that landed - Drawn
 * Across's halving and Thrall of the Banshee's owner, each laid by the card's Resist
 * failing (`dice/chat.mjs#rollResists`).
 *
 * @param {object|null} plan
 * @param {{actor: Actor, item: Item, success?: boolean}} o
 */
function spiritCardFlags(plan, { actor, item, success = true }) {
  if (!plan) return {};
  const out = {};
  if (plan.healsDealt) out.healsDealt = { by: actor.uuid, name: item.name };
  // Each with the ONE creature the Use named (the B3 review): the card's Resist lands on
  // it alone (`dice/chat.mjs#rollResists`, `rules/legacy-uses.mjs#namesCreature`).
  if (plan.halvesDealt && success) {
    out.halvesDealt = { by: actor.uuid, name: item.name, until: plan.halvesDealt.until, bossBoon: plan.halvesDealt.bossBoon === true, target: plan.halvesDealt.record ?? null };
  }
  if (plan.thrall && success) out.thrall = { by: actor.uuid, ownerName: actor.name, source: item.name, minutes: plan.thrall.minutes, target: plan.thrall.record ?? null };
  return out;
}

/**
 * **THE ROW ON THE CARD THE USE'S RESIST NAMES** (the B3 review): the index, in the card's
 * own `targets`, of the one creature Thrall of the Banshee or Drawn Across named - so the
 * Resist button is that creature's (`data-target-index`, `dice/chat.mjs#resistersOf`'s
 * second door) and never every token the presser holds. Null for any other Use.
 *
 * @param {object|null} plan  `judgeSpiritUses`'
 * @returns {string|null}
 */
function spiritResistIndex(plan) {
  const index = plan?.thrall?.index ?? plan?.halvesDealt?.index ?? -1;
  return Number.isInteger(index) && index >= 0 ? String(index) : null;
}

/**
 * Use a class feature (02 \u00a77, D-612). The order is the spell's: refuse
 * where a use or the pool is short, pay, make the Casting Test if the
 * feature makes one, then post the card with the numbers the table gives -
 * a heal or a damage line, with its apply button, the Resist line where a
 * target Tests, and one use struck off a limited feature.
 *
 * A passive feature can be "used" too: the card is the reminder of what it
 * does, and nothing is spent.
 */
export async function useFeature({
  actor, item, dc = null, boons = 0, banes = 0, targets = null, provenanceExtra = [],
  gadgetRest = false,
  // The Damage lines a talent put on the dialog and the roller left ticked - or,
  // with no dialog, the ones that came ticked (04, D-711 phase 2; D-768). The
  // feature's own lane, read exactly as `castSpell` reads the spell lane's.
  extraRating = 0, damageRows = [],
  // **WHAT A TALENT'S COUNTER OR CHARGE BUYS ON THIS USE** (D-774): the
  // identifiers the roller ticked on the dialog - Inner Focus's free Mana,
  // Static Charge's tier - judged again here before anything is paid.
  talentLines = [],
  // **THE CARD A WARD ANSWERS** (04's Foresight; the lead, 2026-10-03, on O-181:
  // *"Yes"*; D-779): `{messageId, index}` of the incoming attack's card the Ward was
  // pressed from (`dice/chat.mjs#foresightWardFromCard`).
  foresight = null,
  // GM-local continuation capability and the already selected school. The
  // capability is never serialized or accepted from a player query.
  foresightCommit = null, foresightSchool = null,
  spellstealCommit = null, bellowCommit = null,
  // **THE CARD A HIT-INTO-A-MISS ANSWERS** (04's Afterimage; the Legacy branches'
  // door 13): `{messageId, index}` of the incoming attack's card and the row struck,
  // as `dice/chat.mjs#negateFromCard` hands it. A negating Use refuses without it.
  answers = null,
  // **WHO IS USING IT** (D-724, the Legacy branches' door 2): the token the roll
  // dialog found before it opened, for a casting feature; taken here otherwise.
  source = null
} = {}) {
  if (item?.getFlag?.("azeroth-rpg", "feature")?.gadget && refuseDispersion(actor, "gear")) return null;
  if (spellstealCommit !== null && !spellstealUseValid(actor, item, spellstealCommit)) return null;
  if (!(await featureReady(actor, item))) return null;
  if (refuseAncientDespair(actor, "feature")) return null;
  // A creature under Hex or Polymorph uses no feature (D-808), before anything is paid.
  if (actor?.refuseForcedShape?.("feature")) return null;
  const sys = item.system;
  // A copy, never the caller's own array: an area Use replaces it with the creatures it
  // gathers (the B6 fix; the lead: *"Measure the area"*), and Cloudburst adds to it.
  const list = [...(targets ?? [])];
  const first = list[0] ?? null;
  // An answering Ward must never fall back to an ordinary (paid) Ward.
  // Check again after asynchronous choices, immediately before the budget.
  const refuseForesight = () => {
    if (foresight === null) return false;
    const refused = item.name !== WARD_BASE.feature || list.length !== 1
      || foresightAdmission({ priest: actor, target: targetActorOf(list[0]), answers: foresight, commit: foresightCommit });
    if (!refused) return false;
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Foresight.CannotAnswer"));
    return true;
  };
  if (refuseForesight()) return null;
  // A talent's grant scales by the rank taken (D-642).
  const grantFlag = item.getFlag?.("azeroth-rpg", "feature") ?? {};
  const grantingTalent = grantFlag.talentId ? actor.items.get(grantFlag.talentId) ?? null : null;
  let mindControlTarget = null;
  const refuseMindControl = () => {
    if (grantingTalent?.system?.identifier !== "mind-control") return false;
    const row = list.length === 1 ? list[0] : null;
    const target = row?.sceneId && row?.tokenId ? fromUuidSync(`Scene.${row.sceneId}.Token.${row.tokenId}`)?.actor
      : row?.actorId && !row.sceneId && !row.tokenId ? game.actors.get(row.actorId) : null;
    if (!target || (mindControlTarget && mindControlTarget !== target)) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.MindControl.OneTarget"));
      return true;
    }
    if (iceBlockFor(actor) || iceBlockFor(target)) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.IceBlock.Protected"));
      return true;
    }
    mindControlTarget = target;
    return false;
  };
  if (refuseMindControl()) return null;
  if (grantingTalent?.system?.className === "Paladin" && grantingTalent.system.identifier === "sacrifice") {
    ui.notifications?.info(game.i18n.localize("AZEROTH.Sacrifice.Trigger"));
    return null;
  }
  // **WHAT THE CARD RECORDS FOR THE ANIMATION LAYER** (the Legacy branches' door 2):
  // who used it - taken now, before any pick or chooser, by the roll dialog's own rule
  // (`roll-dialog.mjs#sourceOf`, D-724) - and which feature it is, by the key its row
  // is filed under (`rules/animation-records.mjs#featureKeyOf`); then what the Use
  // moved, stood up and held, gathered by the doors below as they happen.
  const useSource = tokenRef(source) ?? (await import("../applications/roll-dialog.mjs")).sourceOf(actor);
  const useKey = featureKeyOf({ gadget: grantFlag.gadget ?? null, talent: grantingTalent?.name ?? null, name: item.name });
  const stepsMade = [];
  const risenMade = [];
  const noteRisen = placed => {
    const risen = risenRecord(placed);
    if (risen) risenMade.push(risen);
  };
  let holdMade = null;
  const rank = grantingTalent ? (grantingTalent.system?.taken ?? grantFlag.rank ?? 1) : (grantFlag.rank ?? 1);
  // **A GADGET'S USE IS THE GADGET'S** (the Legacy branches' door 7): a feature the
  // sync granted for a gadget known reads what its Use does off 04's Gadgets table
  // (`rules/gadgets.mjs`), never off the Gadgeteer row that granted it - the row
  // below is the gadget's own, so no buff or rider of the Gadgeteer's reaches it.
  const gadget = grantFlag.gadget ? gadgetByKey(grantFlag.gadget) : null;
  if(gadget?.key==="harm-prevention-belt"){
    ui.notifications?.warn(game.i18n.localize("AZEROTH.HarmBelt.Trigger"));return null;
  }
  if (gadget?.key === "parachute-cloak") {
    const {useParachute}=await import('../effects/parachute.mjs');
    return useParachute({actor,item,source});
  }
  if (gadget?.key === "alarm-o-bot") {
    const {useAlarmBot}=await import('../effects/alarm-bot.mjs');
    return useAlarmBot({actor,item,source});
  }
  if (gadget?.onUse?.preventsProne && !stabilizerIsTriggered(actor)) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Gadget.StabilizerTrigger"));
    return null;
  }
  // The granting talent's row: a damage buff the Use switches on (D-711), and
  // what the Use does beyond its descriptor (D-771's `onUse`).
  // **A CLASS FEATURE'S OWN `onUse`** (stage 2B): read off `CLASS_FEATURES` where no
  // talent granted the feature and it is no gadget - the Champion's Breath, Wing Buffet,
  // Draconic Leap, Dread Presence and Hardened Scales - as a talent's grant's is read off
  // its row. Only the `onUse`, so nothing else a talent row carries is read off it.
  const classUse = !gadget && !grantingTalent ? classFeatureOnUse(item.system?.className ?? "", item.name) : null;
  const talentRow = gadget ? { onUse: gadget.onUse ?? {} } : grantingTalent
    ? talentEffect(grantingTalent.system?.className, grantingTalent.system?.identifier, grantingTalent.system?.race ?? null)
    : (classUse ? { onUse: classUse } : null);
  const onUse = onUseOf(talentRow);
  const isBellow = grantingTalent?.system?.identifier === 'bellow' && String(grantingTalent.system.race).toLowerCase() === 'ogre';
  if (isBellow && bellowCommit === null) return requestBellowUse(actor, item, list);
  if (isBellow && !bellowCommitValid(actor, item, bellowCommit)) return null;
  if (onUse?.militiaDrill) {
    const { useMilitiaDrill } = await import('../effects/militia-drill.mjs');
    return useMilitiaDrill(actor, item);
  }
  if (onUse?.zalazane) {
    const { useZalazane } = await import('../effects/zalazanes-lesson.mjs');
    return useZalazane(actor, item);
  }
  if (onUse?.elunesLight) {
    const { useElunesLight } = await import('../canvas/elunes-light.mjs');
    return useElunesLight(actor, useSource);
  }
  if (onUse?.kodoBond) {
    const { useKodoBond } = await import('../effects/kodo-bond.mjs');
    return useKodoBond(actor, item);
  }
  if (onUse?.restoreAllPower) {
    const { useHungerMastered } = await import('../effects/hunger-mastered.mjs');
    return useHungerMastered(actor, item);
  }
  if (onUse?.rocketJump === true) {
    const { requestRocketJump } = await import("../effects/rocket-jump-use.mjs");
    return requestRocketJump(actor, item, useSource);
  }
  if (onUse?.sustain && refuseSustainTransferStart(actor)) return null;

  // 1. A use left? **Not yet for a Use whose first choice is free** (04's Ultrasafe
  // Transporter: a pad is set over a Short Rest, and the Long Rest's one use is the
  // travel's; the B3 review): `judgeSpiritUses` asks it of the travel alone.
  if (sys.uses?.per && sys.uses.value <= 0 && !usesAskedLater(onUse)) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NoUses", { name: item.name }));
    return null;
  }

  // 1-. **THE SPIRIT REALM REFUSES A USE** (06 §10: *You cannot touch the living world*;
  // the Legacy branches' door 10): every feature but a way back from Dying (02's
  // Reincarnation, which 06 names), and stepping back from 04's The Crossing, which is
  // free. **And Ethereal Form refuses a casting feature that restores no Health** (*you
  // cannot ... cast, except spells that restore Health*): a casting feature casts (the
  // lead's *"Yes, casting features count"*, D-777), through the one filter.
  const crossingNow = crossingOf(onUse, rank);
  if (!(crossingNow && crossed(actor))) {
    const spirit = realmRefusalFor(actor, "feature", { wayBack: item.name === REINCARNATION.feature });
    if (spirit) {
      ui.notifications?.warn(spirit);
      return null;
    }
  }
  if (sys.casting) {
    // A casting feature that restores Health and deals nothing (the B3 review).
    const filtered = castRefusalFor(actor, { heals: featureRestoresOnly(sys, onUse), selfTargeted: castNamesSelf(actor, list) });
    if (filtered) {
      ui.notifications?.warn(filtered);
      return null;
    }
  }

  // 1+. **WHAT THE USE NEEDS, ASKED BEFORE ANYTHING IS PAID** (D-771, D-768's
  // order). Survival Instincts is *While in a Shapeshift form*; Swiftmend ends
  // a heal over time THIS druid laid on the one creature targeted, and refuses
  // in words where it carries none; Symbiosis names one friendly creature.
  if (onUse?.requires === "shapeshift" && actor.inShapeshiftForm !== true) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NeedsForm", { name: item.name }));
    return null;
  }
  // A mark already standing - a Parry or a Block not yet applied, a halving
  // pressed before - is never written over: the use, the pool or the Reaction
  // it was bought with would be lost in silence (`standingMarkRefusal`, D-771).
  // **A MARK THAT ANSWERS ONE CARD IS A REACTION'S** (the B1 review): 04's Afterimage
  // (`negate`) is pressed from an incoming card and writes a mark bound to it, as a
  // Parry does - so a Parry's or a Block's mark standing on ANOTHER card, not yet
  // applied, is that card's and refuses it no more than it refuses a Parry; a mark
  // with no card (Survival Instincts, a Signature's halving) still does.
  if (onUse?.mitigate) {
    const stands = standingMarkRefusal(actor.getFlag("azeroth-rpg", "mitigate") ?? null, { door: onUse.mitigate === "negate" ? "reaction" : "use" });
    if (stands) {
      ui.notifications?.warn(game.i18n.format(stands.key, { name: actor.name, ...stands.params }));
      return null;
    }
  }
  // **THE LEGACY BRANCHES' USES, JUDGED BEFORE ANYTHING IS PAID** (B1; D-768's
  // order). `rules/class-talents.mjs#onUseLegacy` reads the granting talent's row at
  // the rank, its amounts in the user's ability modifiers (door 16).
  const legacy = onUseLegacy(onUse, { rank, tier: actor.system?.tier ?? 1, scope: abilityScope(actor.system) });
  // *While you wield a two-handed weapon* (04's Bladestorm; door 15): read off what
  // is in hand and worn now, refused in words.
  if (legacy.wields.length) {
    const needs = wieldRefusal(legacy.wields, actor.gateFacts?.()?.wield ?? null);
    if (needs) {
      ui.notifications?.warn(game.i18n.format(needs, { name: item.name }));
      return null;
    }
  }
  // *As a Reaction when an attack hits you ... The attack misses* (04's Afterimage;
  // door 13): the incoming card's row, the user's own, a hit not yet turned into a
  // miss, from a striker a Reaction may be taken against (door 14). Where the blow
  // itself took the user's Reaction (a Bash), the Reaction that answers it is that
  // one, so none is spent and none comes back (`answeredWithLost`).
  let negating = null;
  if (legacy.negate) {
    const card = answers?.messageId ? (game.messages?.get(answers.messageId) ?? null) : null;
    const index = Number.isInteger(answers?.index) ? answers.index : null;
    const cardFlags = card?.flags?.["azeroth-rpg"] ?? {};
    const struck = index !== null ? targetActorOf(cardFlags.targets?.[index] ?? null) : null;
    const striker = card ? (ChatMessage.getSpeakerActor(card.speaker) ?? null) : null;
    const strikerUnanswered = unansweredBy((striker?.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"] ?? {}));
    const refused = negateRefusal({
      named: Boolean(card) && index !== null,
      own: Boolean(struck) && (struck.uuid === actor.uuid || struck.id === actor.id),
      hit: index !== null && Boolean(cardFlags.damageByTarget?.[index]),
      withdrawn: index !== null && cardFlags.damageByTarget?.[index]?.withdrawn === true,
      unanswered: strikerUnanswered.length > 0
    });
    if (refused) {
      ui.notifications?.warn(game.i18n.format(refused, { name: item.name, source: strikerUnanswered.join(", ") }));
      return null;
    }
    // The card is the striker's: the miss is written on it on the GM's client where
    // this one may not write it, so with no GM online the Use is refused before its
    // Rage and its Reaction are spent (D-774's review; the Parry's annotation's door).
    if (cardPressUnrecordable(card)) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.PressNoGM"));
      return null;
    }
    const fightOfNegate = actor.activeFight?.() ?? null;
    const mineOfNegate = fightOfNegate?.getCombatantsByActor?.(actor)?.[0] ?? null;
    negating = {
      messageId: card.id, index,
      answeredWithLost: sys.action === "reaction" && Boolean(mineOfNegate)
        && reactionLostToBlow(cardFlags.landedOnHit ?? [], index) && (mineOfNegate.budget?.reactions ?? 0) < 1
    };
  }
  // **NO REACTION AGAINST A CREATURE NOBODY MAY TAKE ONE AGAINST** (door 14, the B1
  // review: 04's Wind Walk and Bladestorm, *No creature may take a Reaction against
  // you*): a Use that is itself a Reaction - 02's Pummel, Counterspell - taken at a
  // creature the state holds is refused in words before anything is paid. Only one
  // AGAINST it: a target the user counts as an ally (D-755's one reading) is answered
  // for, not against - Foresight's Ward, Hold the Thread - and Afterimage asked its
  // striker above.
  if (sys.action === "reaction" && !legacy.negate) {
    const heldAgainst = list.map(t => targetActorOf(t)).filter(a => a && a.uuid !== actor.uuid && !allyOf(actor, a))
      .flatMap(a => unansweredBy((a.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"] ?? {})));
    if (heldAgainst.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.Refuse.Unanswered", { source: [...new Set(heldAgainst)].sort().join(", ") }));
      return null;
    }
  }
  // **THE CHALLENGE AND THE LONG WATCH NAME ONE CREATURE** (door 18). With nothing
  // targeted and a Watch standing, the Use says where the watched creature is and
  // spends nothing (*you know its direction and rough distance*).
  let marking = null;
  if (legacy.mark) {
    const aimed = list.filter(t => targetActorOf(t));
    if (legacy.mark === "watch" && !aimed.length) return reportWatch(actor);
    const self = aimed.some(t => {
      const a = targetActorOf(t);
      return Boolean(a) && (a.uuid === actor.uuid || a.id === actor.id);
    });
    let refused = null;
    let markCombatant = null;
    if (legacy.mark === "challenge") {
      const fightOfMark = actor.activeFight?.() ?? null;
      markCombatant = fightOfMark?.getCombatantsByActor?.(actor)?.[0] ?? null;
      const r = markCombatant?.getFlag("azeroth-rpg", "round") ?? {};
      refused = challengeRefusal({
        named: aimed.length, self, inFight: Boolean(markCombatant),
        onTurn: Boolean(markCombatant) && fightOfMark.combatant?.id === markCombatant.id,
        used: r.number === fightOfMark?.round ? (r.once ?? []) : []
      });
    } else refused = watchRefusal({ named: aimed.length, self });
    if (refused) {
      ui.notifications?.warn(game.i18n.format(refused, { name: item.name }));
      return null;
    }
    const target = aimed[0];
    const standing = legacy.mark === "challenge"
      ? marksFrom({ effects: (actor.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"] ?? {}) }).challenge
      : cleanMark(actor.getFlag("azeroth-rpg", WATCH_FLAG) ?? null);
    const replaced = markReplaced(standing, markOf(target));
    const replacedActor = replaced ? targetActorOf(replaced) : null;
    // The Challenge's Bane is laid on the creature named and ended on the first, each
    // through the GM's client where this one does not own it: with none online,
    // refused before anything is paid (D-774's review).
    if (legacy.mark === "challenge" && gmAbsentForActors([targetActorOf(target), replacedActor])) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
      return null;
    }
    marking = { kind: legacy.mark, target, combatant: markCombatant, replaced, replacedActor };
  }
  // **EVERY CREATURE YOU HAVE ENTANGLED, PULLED TO YOU** (04's None Escape; door 24):
  // within its feet, measured between the nearest spaces (D-732), of any side - a
  // neutral one included, as *every creature* says - held by an Entangled whose effect
  // names the user (`laidBy`, door 17). None held, no token to pull them to, or one a
  // GM must move and none online, is refused before anything is paid. Where each
  // lands is the user's to choose (the lead: *"A space you choose"*), picked below
  // once the price is known to be payable.
  let pulling = [];
  const ownTokenOfPull = legacy.pullEntangled ? (actor.getActiveTokens?.(true)?.[0] ?? null) : null;
  if (legacy.pullEntangled) {
    const reach = legacy.pullEntangled.feet;
    pulling = (ownTokenOfPull ? (canvas?.tokens?.placeables ?? []) : [])
      .filter(t => t && t !== ownTokenOfPull && t.actor && t.document?.parent?.id === ownTokenOfPull.document?.parent?.id)
      .map(t => ({ token: t, actor: t.actor, feet: feetBetweenTokens(ownTokenOfPull, t) }))
      .filter(r => r.feet !== null && r.feet <= reach
        && (r.actor.effects ?? []).some(e => e.active !== false && e.statuses?.has?.("entangled") && laidByOne(e.flags?.["azeroth-rpg"] ?? {}, actor.uuid)))
      .sort((a, b) => String(a.token.name ?? "").localeCompare(String(b.token.name ?? "")) || String(a.token.id).localeCompare(String(b.token.id)));
    if (!pulling.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Pull.NoneHeld", { name: item.name, feet: reach }));
      return null;
    }
    if (gmAbsentForActors(pulling.map(r => r.actor))) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Forced.NoGM"));
      return null;
    }
  }
  let endsOn = null;
  if (onUse?.ends === "healTick") {
    const aimed = (targets ?? []).map(t => targetActorOf(t)).filter(Boolean);
    if (aimed.length !== 1) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Swiftmend.OneTarget", { name: item.name }));
      return null;
    }
    if (aimed[0].uuid !== actor.uuid && !allyOf(actor, aimed[0])) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.NotFriendly", { name: item.name, target: aimed[0].name }));
      return null;
    }
    const held = tickLaidBy(aimed[0], { from: actor, kind: "heal" });
    if (!held) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Swiftmend.NoTick", { name: item.name, target: aimed[0].name }));
      return null;
    }
    endsOn = { target: aimed[0], effect: held };
  }
  let partner = null;
  if (onUse?.partner) {
    const aimed = (targets ?? []).map(t => {
      const a = targetActorOf(t);
      const scene = (t?.sceneId && game.scenes.get(t.sceneId)) || canvas?.scene || null;
      const disposition = t?.tokenId ? scene?.tokens?.get(t.tokenId)?.disposition : null;
      return { actor: a, actorUuid: a?.uuid ?? null, hostile: disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE };
    });
    const refused = partnerRefusal({ targets: aimed, self: actor.uuid });
    if (refused) {
      ui.notifications?.warn(game.i18n.format(refused.key, { name: item.name, target: aimed[0]?.actor?.name ?? "" }));
      return null;
    }
    partner = aimed[0].actor;
    if (iceBlockFor(actor) || iceBlockFor(partner)) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.IceBlock.Protected"));
      return null;
    }
  }
  // **WHAT D-772's USES NEED, ASKED HERE TOO** - before anything is paid.
  // Beacon names one friendly creature, Symbiosis's way (04: *Choose a friendly
  // target you know*).
  let beaconPartner = null;
  if (onUse?.beacon) {
    const aimed = (targets ?? []).map(t => {
      const a = targetActorOf(t);
      const scene = (t?.sceneId && game.scenes.get(t.sceneId)) || canvas?.scene || null;
      const disposition = t?.tokenId ? scene?.tokens?.get(t.tokenId)?.disposition : null;
      return { actor: a, actorUuid: a?.uuid ?? null, hostile: disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE };
    });
    const refused = partnerRefusal({ targets: aimed, self: actor.uuid });
    if (refused) {
      ui.notifications?.warn(game.i18n.format(refused.key, { name: item.name, target: aimed[0]?.actor?.name ?? "" }));
      return null;
    }
    beaconPartner = aimed[0].actor;
    if (iceBlockFor(actor) || iceBlockFor(beaconPartner)) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.IceBlock.Protected"));
      return null;
    }
  }
  // Taunt's and Judgement's Bane, and Blessing's Boon, land on ONE creature the
  // user has targeted (04: *A target that can see you*, *The target*, *A friendly
  // target you can see*). **Out of a fight too** (the lead, 2026-10-03, on O-161:
  // *"Player can use them at anytime if selected."*; D-778): the span - *until the
  // end of your next turn*, *one round per rank* - is then the world's clock
  // (`effects/durations.mjs#untilEndOfNextTurnOrRound`, `roundsOrClock`).
  const lays = onUse?.laysBane || onUse?.laysBoon ? onUseLays(onUse, rank) : { bane: null, boon: null };
  // **02's RACIAL BOONS** (the B8a2 pass): the troll's Berserking lays its Boon on the user
  // (`onUse.self`) for the encounter, and names nobody; the orc's Thrall's Discipline names one
  // friendly creature *within 60 feet* (`lays.boon.feet`), measured where both stand (D-732).
  const boonWhere = boonSpan(lays.boon, onUse);
  if (onUse?.sight === true && actor.statuses?.has("blinded")) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.NeedsSight", { name: item.name }));
    return null;
  }
  let laysOn = null;
  let baneTargets = [];
  const bellowResults = [];
  if (lays.boon && boonWhere.self && !lays.bane) {
    laysOn = { t: null, actor };
  } else if (lays.bane || lays.boon) {
    const aimed = [...new Map((targets ?? []).map(t => ({ t, actor: targetActorOf(t) }))
      .filter(r => r.actor).map(r => [r.actor.uuid, r])).values()];
    const many = onUse?.laysBane?.many === true && !lays.boon;
    if (!aimed.length || (!many && aimed.length !== 1)) {
      ui.notifications?.warn(game.i18n.format(many ? "AZEROTH.Laid.SomeTargets" : "AZEROTH.Laid.OneTarget", { name: item.name }));
      return null;
    }
    if (lays.boon && onUse?.friendly) {
      const scene = (aimed[0].t?.sceneId && game.scenes.get(aimed[0].t.sceneId)) || canvas?.scene || null;
      const disposition = aimed[0].t?.tokenId ? scene?.tokens?.get(aimed[0].t.tokenId)?.disposition : null;
      if (disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.NotFriendly", { name: item.name, target: aimed[0].actor.name }));
        return null;
      }
    }
    // *within 60 feet* (Thrall's Discipline), where both tokens stand; unmeasured, the table's.
    const boonReach = lays.boon?.feet ?? onUse?.laysBane?.feet ?? 0;
    for (const chosen of aimed) {
      const apart = boonReach > 0 ? feetBetweenTokens(actor.getActiveTokens?.(true)?.[0] ?? null, tokenOfTarget(chosen.t)) : null;
      if (apart !== null && apart > boonReach) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.TooFar", { name: item.name, target: chosen.t?.name ?? chosen.actor.name, feet: boonReach }));
        return null;
      }
      if (onUse?.laysBane?.hearing === true && chosen.actor.statuses?.has("deafened")) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.CannotHear", { name: item.name, target: chosen.actor.name }));
        return null;
      }
    }
    // **A BANE OR A BOON LAID ON ANOTHER'S CREATURE IS WRITTEN ON THE GM'S CLIENT** (the
    // B8a2 pass, `rules/gm-writes.mjs#gmAbsentFor`): with no GM online it was refused only
    // after the Use had paid - Taunt's and Blessing's too. Refused here, before anything is spent.
    if (gmAbsentForActors(aimed.map(r => r.actor))) {
      ui.notifications?.warn(game.i18n.localize(lays.boon ? "AZEROTH.Laid.BoonNoGM" : "AZEROTH.Laid.BaneNoGM"));
      return null;
    }
    laysOn = aimed[0];
    baneTargets = aimed;
    if (lays.bane) {
      const { sentinelRejectsTaunt } = await import("../effects/sentinel-taunt.mjs");
      if (sentinelRejectsTaunt(laysOn.actor, item.name)) {
        ui.notifications?.warn("This Sentinel's Knock Away power protects it from Taunt. Nothing was spent.");
        return null;
      }
    }
  }
  // A Long Rest's school (Blessed Plate, Warded Plate) comes off the Use's own
  // chooser (`choice: "schools"`, asked at 1b) and is written once paid.
  // **02 §7's CONSECRATED** (*You may enchant your weapon with Blessed at Lesser
  // grade*; D-772): the weapon in the main hand, asked before anything is paid -
  // a Use with no weapon to enchant is refused in words and costs nothing.
  let consecrating = null;
  if (item.name === CONSECRATED.feature) {
    const held = mainHandOf(actor.readyWeapons?.() ?? []);
    consecrating = held ? actor.items.get(held.id) ?? null : null;
    if (consecrating?.type !== "weapon") {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Consecrated.NoWeapon", { name: item.name }));
      return null;
    }
  }

  // **WHAT D-773's USES NEED, ASKED HERE TOO** - before anything is paid.
  // 04's Garrote: *cannot cast while that Bleeding lasts* - a feature that makes
  // a Casting Test is a cast (06 §6 counts it one; MY READING).
  if (sys.casting) {
    const barred = noCastingFrom((actor.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"] ?? {}));
    if (barred.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Cast.Garroted", { name: item.name, by: barred.join(", ") }));
      return null;
    }
  }
  // 04's Mend Pet heals the COMPANION (*Your companion recovers Health equal to
  // your tier per rank*), never the Ranger: the one held, or the one picked
  // through the one chooser where Second Beast holds two; none refuses in words.
  let healsBound = null;
  if (sys.bound?.action === "heal") {
    // **A WRECKED CONSTRUCT IS REBUILT, NEVER HEALED** (04's The Bench: *rebuilding
    // one wrecked at 0 Health* takes a rest; the Legacy branches' door 6): 04's
    // Arclight Spanner reaches the constructs standing, and one at 0 Health is left
    // out of its list.
    const held = boundOf(actor, sys.bound.kind).filter(b => !isWrecked({ kind: bondOf(b)?.kind ?? null, health: b.system?.health?.value ?? null }));
    if (!held.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Bound.NoCreature", { name: actor.name, kind: game.i18n.localize(AZEROTH.boundKinds[sys.bound.kind] ?? sys.bound.kind) }));
      return null;
    }
    if (held.length === 1) healsBound = held[0];
    else {
      const pick = await chooseOption(item, held.map(b => ({ key: b.uuid, uuid: b.uuid, name: b.name, description: "" })), null);
      healsBound = pick ? (held.find(b => b.uuid === pick.uuid) ?? null) : null;
      if (!healsBound) return null;
    }
  }
  // 04's Barrage (*attack up to four targets*) and Chimaera Shot (*up to six ...
  // If more than four targets are chosen, 2 Focus returns to you*): more targets
  // than the talents allow is refused before the Focus is spent.
  const barrageLimits = grantingTalent?.system?.identifier ? grantLimitsFor(actor.takenTalents(), grantingTalent.system.identifier) : null;
  const barrage = barrageLimits?.by.length ? barrageJudgement(barrageLimits, list.length) : null;
  if (barrage?.refused) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Barrage.TooMany", { name: item.name, n: list.length, max: barrageLimits.targets }));
    return null;
  }
  // **EACH TARGET WITHIN THE FEET OF THE USER** (04's Fan of Knives: *attack up to two
  // enemies within 10 feet of you*; the Legacy branches' B6): one named farther, measured
  // between the nearest squares (D-732), is refused in words before anything is paid.
  if (barrageLimits?.within) {
    const from = actor.getActiveTokens?.(true)?.[0] ?? null;
    const far = list.filter(t => {
      const feet = from ? feetBetweenTokens(from, tokenOfTarget(t)) : null;
      return feet !== null && feet > barrageLimits.within;
    });
    if (far.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Barrage.TooFar", { name: item.name, names: far.map(t => t.name ?? "").join(", "), feet: barrageLimits.within }));
      return null;
    }
  }
  // The Ranger's and the Rogue's Uses at the rank (D-773). A state that lasts
  // *until your next turn* or *the end of your next turn* takes the fight's turn,
  // or out of one a round of the world's clock (D-778; it was refused there).
  const rr = onUseRogueRanger(onUse, rank);
  // Death Mark: *name a target you can see* - one, targeted.
  let deathMarkOn = null;
  if (rr.deathMark) {
    const aimed = list.filter(t => targetActorOf(t));
    if (aimed.length !== 1) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.DeathMark.OneTarget", { name: item.name }));
      return null;
    }
    deathMarkOn = aimed[0];
  }
  // Adrenaline: *Once a round per rank* - the round's record, judged before the
  // Energy is spent and marked once it is (D-761's queued door).
  let perRoundMark = null;
  let perRoundCombatant = null;
  if (rr.perRound && grantingTalent?.system?.identifier) {
    const fightOfUse = actor.activeFight?.() ?? null;
    perRoundCombatant = fightOfUse ? (fightOfUse.getCombatantsByActor(actor)?.[0] ?? null) : null;
    if (perRoundCombatant) {
      const r = perRoundCombatant.getFlag("azeroth-rpg", "round") ?? {};
      const used = r.number === fightOfUse.round ? (r.once ?? []) : [];
      perRoundMark = nextRoundMark(grantingTalent.system.identifier, rr.perRound, used);
      if (!perRoundMark) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.ExtraStrike.Spent", { name: item.name }));
        return null;
      }
    }
  }

  // **WHAT THE PRIEST'S AND THE SHAMAN'S USES NEED, ASKED HERE TOO** (D-774) -
  // before anything is paid.
  const tierNow = actor.system?.tier ?? 1;
  if (gadgetHealthCost(gadget, { tier: tierNow, health: actor.system?.health?.value ?? 0 }).refused) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Gadget.HealthRefused", { name: item.name }));
    return null;
  }
  const ps = onUsePriestShaman(onUse, { rank, tier: tierNow });
  // A state that lasts *until your next turn* (Ascendance, Doom Winds, Silence's
  // *cannot cast until your next turn*) and a walk made this turn (Spirit Walk)
  // take the fight's turn, or out of one a round of the world's clock, which core
  // ends when the clock passes it (D-778; the lead: *"Player can use them at
  // anytime if selected."* - they were refused out of a fight).
  // Silence (*A caster you can see within 30 feet*) and Guardian Spirit (*A
  // target you can see*): one creature, targeted.
  let aimedAtOne = null;
  if (ps.inflicts || ps.aims === "one") {
    const aimed = list.filter(t => targetActorOf(t));
    if (aimed.length !== 1) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.OneTarget", { name: item.name }));
      return null;
    }
    aimedAtOne = aimed[0];
    // *within 30 feet* (Silence), measured where both stand (D-732).
    const apart = ps.inflicts?.feet ? feetBetweenTokens(actor.getActiveTokens?.(true)?.[0] ?? null, tokenOfTarget(aimedAtOne)) : null;
    if (apart !== null && apart > ps.inflicts.feet) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.TooFar", { name: item.name, target: aimedAtOne.name ?? "", feet: ps.inflicts.feet }));
      return null;
    }
    // Silenced lands through the GM's client on a creature this one does not own
    // (the architect's review of D-774): with no GM online, refused before the
    // Mana and the Reaction are paid.
    if (ps.inflicts && gmAbsentForActors([targetActorOf(aimedAtOne)])) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
      return null;
    }
  }
  // **02's WARD** (*As a Reaction, spend 2 Mana to grant a target Ward 1 of one
  // school until your next turn*; D-774): the span is the priest's next turn, or
  // out of a fight a round of the world's clock (D-778; the lead: *"Player can use
  // them at anytime if selected."* - it was refused there); one creature, or two
  // with Mass Ward.
  const isWard = item.name === WARD_BASE.feature;
  const wardOpts = isWard ? wardOptionsFor(actor.takenTalents(), { tier: tierNow }) : null;
  let wardOn = [];
  if (isWard) {
    const aimed = list.filter(t => targetActorOf(t));
    const refused = wardTargetRefusal({ named: aimed.length, allowed: wardOpts.targets });
    if (refused) {
      ui.notifications?.warn(game.i18n.format(refused, { name: item.name, n: wardOpts.targets }));
      return null;
    }
    // A creature this client does not own is warded on the GM's client (the
    // architect's review of D-774): with no GM online the Ward laid nothing AFTER
    // its 2 Mana and its Reaction were paid. Refused here, nothing spent.
    if (gmAbsentForActors(aimed.map(t => targetActorOf(t)))) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Ward.NoGM"));
      return null;
    }
    wardOn = aimed;
  }
  // **02's REINCARNATION** (*Once between Long Rests, return from Dying at 1
  // Health without spending a Tether*) with 04's Undying Spirit (*one Dying
  // friendly target within 30 feet returns with you at 1 Health*; D-774): the
  // shaman Dying, and the friend named Dying, friendly and within reach.
  const isReincarnation = item.name === REINCARNATION.feature;
  const reinc = isReincarnation ? reincarnationFor(actor.takenTalents()) : null;
  let riseWith = null;
  if (isReincarnation) {
    const aimed = reinc.ally ? list.filter(t => targetActorOf(t)) : [];
    if (aimed.length > 1) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Reincarnation.OneAlly", { name: item.name }));
      return null;
    }
    riseWith = aimed.length ? targetActorOf(aimed[0]) : null;
    const refused = reincarnationRefusal({ health: actor.system?.health?.value ?? 0, allyHealth: riseWith ? (riseWith.system?.health?.value ?? 0) : null });
    if (refused) {
      ui.notifications?.warn(game.i18n.format(refused, { name: actor.name, ally: riseWith?.name ?? "" }));
      return null;
    }
    const scene = (aimed[0]?.sceneId && game.scenes.get(aimed[0].sceneId)) || canvas?.scene || null;
    const disposition = aimed[0]?.tokenId ? scene?.tokens?.get(aimed[0].tokenId)?.disposition : null;
    if (riseWith && disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.NotFriendly", { name: item.name, target: riseWith.name }));
      return null;
    }
    const apart = riseWith ? feetBetweenTokens(actor.getActiveTokens?.(true)?.[0] ?? null, tokenOfTarget(aimed[0])) : null;
    if (apart !== null && apart > reinc.ally.feet) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Reincarnation.TooFar", { name: riseWith.name, feet: reinc.ally.feet }));
      return null;
    }
    // A friend this client does not own stands up on the GM's client (the
    // architect's review of D-774): with no GM online, refused before the use.
    if (riseWith && gmAbsentForActors([riseWith])) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Gift.NoGM"));
      return null;
    }
  }
  // **WHOM A HEALING FEATURE REACHES** (02's Mend: *to a target*; 04's Divine
  // Providence and Circle of Healing; D-774): no more named than it reaches, and
  // the further ones within their reach of the first, measured where both stand.
  const healLimits = sys.heal ? healTargetsFor(actor.takenTalents(), { feature: item.name }) : null;
  if (healLimits) {
    const refused = healTargetRefusal({ named: list.length, limits: healLimits });
    if (refused) {
      ui.notifications?.warn(game.i18n.format(refused.key, { name: item.name, max: refused.max }));
      return null;
    }
    const far = furtherTooFar(list, healLimits);
    if (far.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Heal.TooFar", { name: item.name, names: far.join(", "), feet: healLimits.further.feet }));
      return null;
    }
  }
  // **WHAT A COUNTER OR A CHARGE BUYS, JUDGED AGAIN** (D-774): a ticked line no
  // longer offered - its counter or charge spent since the dialog opened - refuses
  // the Use in words, nothing spent, rather than charging the Mana it promised
  // to waive.
  const lineOffer = (talentLines ?? []).length ? (actor.talentLineOffer?.({
    roll: "feature", damages: Boolean(sys.damage?.amount), mana: sys.cost?.pool === "mana" ? (Number(sys.cost.amount) || 0) : 0, casting: sys.casting === true,
    // A healing feature's own action (04's Nature's Swiftness, D-779).
    healing: Boolean(sys.heal) || sys.tick?.kind === "heal", action: sys.action ?? null
  }) ?? []) : [];
  const linesNow = talentLinesTaken(lineOffer, talentLines);
  if (linesNow.lost.length) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.TalentLine.Lost", { name: item.name, lines: linesNow.lost.join(", ") }));
    return null;
  }
  const freeLine = linesNow.taken.find(l => l.kind === "free") ?? null;
  const chargeLine = linesNow.taken.find(l => l.kind === "charge") ?? null;
  // **04's NATURE'S SWIFTNESS ON A HEALING CLASS FEATURE** (the lead, 2026-10-03, on
  // O-168: *"Yes to both."*; D-779): the line ticked on the feature's own dialog,
  // judged again above; the Use is charged a Half-Action and a use of the counter
  // is struck once it is paid for.
  const swiftLine = linesNow.taken.find(l => l.kind === "swift") ?? null;
  // **HYMN OF HOPE'S ALLIES, MEASURED BEFORE ANYTHING IS PAID** (the architect's
  // review of D-774): an ally this client does not own takes its Mana on the GM's
  // client, and with no GM online the once a Long Rest was spent and some allies
  // took nothing. The same measurement gives the Mana once the Use is paid.
  const hymnNear = ps.restores ? creaturesWithin(actor, ps.restores.feet, { who: "ally" }) : [];
  if (ps.restores && gmAbsentForActors(hymnNear.map(r => r.actor))) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Gift.NoGM"));
    return null;
  }

  // **WHAT THE MAGE'S AND THE WARLOCK'S USES NEED, ASKED HERE TOO** (D-775) -
  // before anything is paid.
  const talentsNow = actor.takenTalents();
  const mw = onUseMageWarlock(onUse, { rank, tier: tierNow });
  const ownToken = actor.getActiveTokens?.(true)?.[0] ?? null;
  const hostileTarget = t => {
    const scene = (t?.sceneId && game.scenes.get(t.sceneId)) || canvas?.scene || null;
    return t?.tokenId ? scene?.tokens?.get(t.tokenId)?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE : false;
  };
  // Icy Veins lasts *until the end of your next turn*: the fight's, or out of one a
  // round of the world's clock (D-778; it was refused there).
  // **02's BLINK** (*move 20 feet to a point you have seen*), with 04's Improved
  // Blink's reach and Slow Time's friend (*on a friendly target you can see within
  // 30 feet instead of on yourself*): the mover named, judged now. The move itself
  // is the step door's (the Legacy branches' door 3): its space picked below, before
  // anything is paid, and the token moved once the Use is.
  let blink = null;
  if (item.name === BLINK.feature) {
    const reach = blinkFor(talentsNow);
    const others = list.filter(t => {
      const a = targetActorOf(t);
      return a && a.uuid !== actor.uuid;
    });
    const one = others[0] ?? null;
    const apart = one && reach.friendly ? feetBetweenTokens(ownToken, tokenOfTarget(one)) : null;
    const refused = blinkTargetRefusal({ named: others.length, hostile: hostileTarget(one), feet: apart, friendly: reach.friendly });
    if (refused) {
      ui.notifications?.warn(game.i18n.format(refused, { name: item.name, target: one?.name ?? "", feet: reach.friendly?.feet ?? 0 }));
      return null;
    }
    blink = { reach, who: reach.friendly && one ? one : null };
  }
  // 04's Improved Blink at rank 2 (*it costs no Mana once per Short Rest*): the
  // counter the talent grants holds the free one, struck once the Use is paid for.
  const freeRow = blink ? freeUseFor(talentsNow, BLINK.feature) : null;
  const freeCounter = freeRow ? (actor.grantedFeature?.(freeRow.talentId) ?? null) : null;
  const blinkFree = Boolean(freeCounter) && freeCounter.id !== item.id && (freeCounter.system?.uses?.value ?? 0) > 0;
  // **02's COUNTERSPELL, WITH 04's SPELLSTEAL** (*also ends one effect the caster is
  // Sustaining*): the one creature targeted within Counterspell's 30 feet, and the
  // Sustain it ends chosen now - through the one chooser, a dismissed one costing
  // nothing. With nothing targeted or nothing held, Counterspell is itself alone.
  let stealing = null;
  if (item.name === COUNTERSPELL.feature && counterspellFor(talentsNow).steals) {
    const aimed = list.filter(t => targetActorOf(t));
    if (aimed.length > 1) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.OneTarget", { name: item.name }));
      return null;
    }
    const caster = aimed.length ? targetActorOf(aimed[0]) : null;
    const apart = caster && spellstealCommit === null ? feetBetweenTokens(ownToken, tokenOfTarget(aimed[0])) : null;
    if (apart !== null && apart > COUNTERSPELL.feet) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.TooFar", { name: item.name, target: aimed[0].name ?? "", feet: COUNTERSPELL.feet }));
      return null;
    }
    const held = caster ? sustainsOf(caster) : [];
    const transferChoice = spellstealCommit !== null ? spellstealUseChoice(actor, item, spellstealCommit) : null;
    if (spellstealCommit !== null && (!transferChoice || transferChoice.casterUuid !== caster?.uuid
      || !held.some(entry => entry.cast === transferChoice.cast))) return null;
    if (held.length) {
      const pick = transferChoice ? { key: String(held.findIndex(entry => entry.cast === transferChoice.cast)) }
        : held.length === 1 ? { key: "0" } : await chooseOption(item, held.map((e, i) => ({ key: String(i), name: e.name, description: "" })), null, { prompt: game.i18n.format("AZEROTH.Spellsteal.Prompt", { target: caster.name }) });
      if (!pick) return null;
      if (gmAbsentForActors([caster])) {
        ui.notifications?.warn(game.i18n.localize("AZEROTH.Spellsteal.NoGM"));
        return null;
      }
      stealing = { caster, entry: held[Number(pick.key)] ?? held[0] };
      if (spellstealCommit === null && counterspellFor(talentsNow).transfers) {
        const mode = await chooseOption(item, [
          { key: "end", name: game.i18n.localize("AZEROTH.Spellsteal.EndChoice"), description: "" },
          { key: "transfer", name: game.i18n.localize("AZEROTH.Spellsteal.TransferChoice"),
            description: game.i18n.localize("AZEROTH.Spellsteal.TransferDescription") }
        ], null, { prompt: game.i18n.format("AZEROTH.Spellsteal.ModePrompt", { spell: stealing.entry.name }) });
        if (!mode) return null;
        if (mode.key === "transfer") {
          const token = ownToken?.document ?? ownToken;
          return requestSpellstealUse({ mage: actor, caster, item, entry: stealing.entry,
            source: source ?? (token?.parent?.id && token?.id ? { sceneId: token.parent.id, tokenId: token.id } : null),
            target: aimed[0]?.tokenId || aimed[0]?.sceneId ? { sceneId: aimed[0].sceneId, tokenId: aimed[0].tokenId } : null });
        }
      }
    }
  }
  // **04's SOUL SWAP** (*name a target within 30 feet suffering an ongoing effect of
  // yours and a second target within 30 feet of the first*): two creatures named,
  // the one carrying the warlock's effects first, the reach measured where both stand.
  let swapping = null;
  if (mw.swap) {
    const aimed = list.filter(t => targetActorOf(t));
    if (aimed.length !== 2) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.SoulSwap.TwoTargets", { name: item.name }));
      return null;
    }
    const plain = a => (a?.effects ?? []).map(e => ({ id: e.id, origin: e.origin ?? null, flags: e.flags ?? {} }));
    const carries = t => swappableEffects(plain(targetActorOf(t)), { caster: actor.uuid }).length > 0;
    let [a, b] = aimed;
    if (!carries(a) && carries(b)) [a, b] = [b, a];
    if (!carries(a)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.SoulSwap.Nothing", { name: item.name }));
      return null;
    }
    const near = feetBetweenTokens(ownToken, tokenOfTarget(a));
    const onward = feetBetweenTokens(tokenOfTarget(a), tokenOfTarget(b));
    if ((near !== null && near > mw.swap.feet) || (onward !== null && onward > mw.swap.feet)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.TooFar", { name: item.name, target: (near !== null && near > mw.swap.feet ? a : b).name ?? "", feet: mw.swap.feet }));
      return null;
    }
    if (gmAbsentForActors([targetActorOf(a), targetActorOf(b)])) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.SoulSwap.NoGM"));
      return null;
    }
    swapping = { from: targetActorOf(a), to: targetActorOf(b), fromName: a.name ?? "", toName: b.name ?? "" };
  }
  // **04's HAUNT** (*each ongoing effect of yours on that target deals 1 further
  // damage per rank*): one creature, carrying a tick of the warlock's (MY READING,
  // for the lead: with none there is nothing for Haunt to raise or to ride).
  let haunting = null;
  if (mw.haunt) {
    const aimed = list.filter(t => targetActorOf(t));
    if (aimed.length !== 1) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.OneTarget", { name: item.name }));
      return null;
    }
    const target = targetActorOf(aimed[0]);
    const mine = tickEffectsOf(target).some(e => e.flags?.["azeroth-rpg"]?.tick?.source === actor.uuid && e.flags["azeroth-rpg"].tick.kind === "damage");
    if (!mine) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Haunt.Nothing", { name: item.name, target: aimed[0].name ?? "" }));
      return null;
    }
    if (gmAbsentForActors([target])) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Haunt.NoGM"));
      return null;
    }
    haunting = { target, name: aimed[0].name ?? target.name };
  }
  // **04's COMMAND DEMON** (*make a Casting Test targeting a Demon you can see within
  // 20 feet*): the bind the feature has always named (`bound.action: "bind"`) and
  // nothing read - one demon, held by nobody, within the reach where both stand.
  let commanding = null;
  if (sys.bound?.action === "bind") {
    const aimed = list.filter(t => targetActorOf(t));
    const target = aimed.length === 1 ? targetActorOf(aimed[0]) : null;
    const reach = mw.command?.feet ?? 20;
    const apart = target ? feetBetweenTokens(ownToken, tokenOfTarget(aimed[0])) : null;
    const refused = commandRefusal({ named: aimed.length, demon: target?.system?.creatureType === "demon", feet: apart, reach, bound: Boolean(target && bondOf(target)) });
    if (refused) {
      ui.notifications?.warn(game.i18n.format(refused, { name: item.name, target: aimed[0]?.name ?? "", feet: reach }));
      return null;
    }
    if (gmAbsentForActors([target])) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Bound.NoGM"));
      return null;
    }
    const sourceDoc = ownToken?.document;
    const placement = sourceDoc || aimed[0].tokenId ? {
      source: sourceDoc ? { sceneId: sourceDoc.parent?.id, tokenId: sourceDoc.id } : null,
      target: { sceneId: aimed[0].sceneId, tokenId: aimed[0].tokenId }
    } : null;
    const sightRefusal = () => {
      if (actor.statuses?.has("blinded")) return "AZEROTH.CommandDemon.CannotSee";
      if (!placement) return null; // Off-scene visibility remains the table's call.
      const source = tokenOfTarget(placement.source);
      if (source?.actor?.uuid !== actor.uuid) return "AZEROTH.CommandDemon.SightUnavailable";
      return commandDemonSightRefusal(source, tokenOfTarget(placement.target));
    };
    const unseen = sightRefusal();
    if (unseen) {
      ui.notifications?.warn(game.i18n.localize(unseen));
      return null;
    }
    commanding = { target, name: aimed[0].name ?? target.name, placement, sightRefusal };
  }
  // **02's LIFE TAP** (*spend any amount of Health to gain twice that much Mana*),
  // with 04's Improved Life Tap: the Health chosen now through the one chooser,
  // never below 1 (05, *Spending Health*); a dismissed chooser costs nothing.
  let lifeTap = null;
  if (item.name === LIFE_TAP.feature) {
    const tap = lifeTapFor(talentsNow);
    const options = lifeTapChoices({ health: actor.system?.health?.value ?? 0, perHealth: tap.perHealth });
    if (!options.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.LifeTap.NoHealth", { name: item.name }));
      return null;
    }
    const pick = await chooseOption(item, options.map(o => ({ key: String(o.health), name: game.i18n.format("AZEROTH.LifeTap.Option", { health: o.health, mana: o.mana }), description: "" })), null, { prompt: game.i18n.format("AZEROTH.LifeTap.Prompt", { n: tap.perHealth }) });
    if (!pick) return null;
    const spentHealth = Math.trunc(Number(pick.key)) || 0;
    lifeTap = { health: spentHealth, mana: spentHealth * tap.perHealth, by: tap.by };
  }
  // **04's SOUL FIRE** (*spend Health equal to twice your tier. Your next spell this
  // turn ...*): the Health to pay. Out of a fight *this turn* is a round of the
  // world's clock (D-778; it was refused there).
  if (mw.soulFire) {
    const refused = soulFireRefusal({ health: actor.system?.health?.value ?? 0, cost: mw.soulFire.health });
    if (refused) {
      ui.notifications?.warn(game.i18n.format(refused, { name: item.name, n: mw.soulFire.health }));
      return null;
    }
  }
  // **02's CURSE, WITH 04's PANDEMIC** (*may name one further target within 30 feet
  // per rank*): no more named than it reaches, the further ones within their reach
  // of the first (MY READING). The Mana is paid on a success (02: *On success,
  // spend 4 Mana*).
  const curse = item.name === CURSE.feature ? curseFor(talentsNow) : null;
  if (curse) {
    const aimed = list.filter(t => targetActorOf(t));
    const allowed = curse.primary + (curse.further?.count ?? 0);
    if (aimed.length > allowed) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Curse.TooMany", { name: item.name, max: allowed }));
      return null;
    }
    const far = curse.further ? furtherTooFar(aimed, { primary: curse.primary, further: { count: curse.further.count, feet: curse.further.feet } }) : [];
    if (far.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Heal.TooFar", { name: item.name, names: far.join(", "), feet: curse.further.feet }));
      return null;
    }
    // **THE CURSES STANDING COUNT** (the lead, 2026-10-03, on O-194: *"It counts
    // against the limit"*; D-779): every creature already carrying this warlock's
    // Curse - one Soul Swap moved included - counts against the number the feature
    // allows, and a creature named again is cursed afresh rather than counted twice.
    const room = curseRoom({ allowed, standing: standingCurses(creaturesForCurses(), actor.uuid, CURSE.feature), named: aimed.map(t => targetActorOf(t)?.uuid).filter(Boolean) });
    if (!room.ok) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Curse.Standing", { name: item.name, n: room.standing, max: allowed }));
      return null;
    }
  }
  // **04's LIGHTWELL** (*set a font of Light within 30 feet*; the lead, 2026-10-03, on
  // O-184: *"10 minutes, caster chooses place."*; D-779): the place, picked before
  // anything is paid - within 30 feet of the priest's token, a press farther refused
  // in words and the pick kept open - and a pick dismissed costs nothing.
  let wellAt = null;
  if (onUse?.lightwell) {
    const priestToken = actor.getActiveTokens?.(true)?.[0] ?? null;
    if (!priestToken || !canvas?.scene) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Lightwell.NoToken", { name: item.name }));
      return null;
    }
    const reach = Math.max(0, Number(onUse.lightwell.feet) || LIGHTWELL.feet);
    wellAt = await pickPoint({
      hint: game.i18n.format("AZEROTH.Lightwell.Pick", { name: item.name, feet: reach }),
      accept: point => {
        const feet = feetToPoint(priestToken, point);
        if (feet !== null && feet <= reach) return true;
        ui.notifications?.warn(game.i18n.format("AZEROTH.Lightwell.PickTooFar", { name: item.name, feet: reach }));
        return false;
      }
    });
    if (!wellAt) return null;
  }
  // **04's FLAMETONGUE** (the lead, 2026-10-03, on O-188: *"1 mana"*; D-779): a
  // Sustain already held is not begun again - refused in words, nothing spent.
  if (onUse?.sustain?.identifier === FLAMETONGUE.identifier && (actor.getFlag("azeroth-rpg", "sustaining") ?? []).some(e => e?.identifier === FLAMETONGUE.identifier)) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Flametongue.Already", { name: item.name }));
    return null;
  }
  // **04's SNAKE TRAP** (*Your Snare class feature also applies a poison you carry*;
  // the lead, 2026-10-03, on O-178: *"Yes, Dexterity"*; D-779): the poison, named
  // through the one chooser before anything is paid - a chooser dismissed costs
  // nothing, and a Ranger carrying none sets the Snare with none, said in words.
  let trapPoison = null;
  let trapDose = null;
  // What D-779's answers say on the card, gathered before the Use's own lines are.
  const answerLines = [];
  const snake = item.name === SNARE.feature ? snakeTrapFor(talentsNow) : null;
  if (snake) {
    const carried = actor.items.filter(i => i.type === "gear" && i.system?.use?.kind === "poison" && (i.system?.quantity ?? 1) > 0)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (carried.length) {
      const pick = await chooseOption(item, carried.map(i => ({ key: i.id, name: i.name, description: i.system?.use?.note ?? "" })), null,
        { prompt: game.i18n.format("AZEROTH.SnakeTrap.Prompt", { talent: snake.name }) });
      if (!pick) return null;
      trapPoison = carried.find(i => i.id === pick.key) ?? null;
      if (!trapPoison) return null;
      trapDose = { trapId: foundry.utils.randomID(), expectedUse: structuredClone(trapPoison.system.use), expectedSnake: structuredClone(snake) };
    } else answerLines.push(game.i18n.format("AZEROTH.SnakeTrap.NoPoison", { talent: snake.name }));
  }
  // **04's DIVINE AEGIS** (the lead, 2026-10-03, on O-183: *"The caster"*; D-779): a
  // healing feature's healer names the schools at the Use, before anything is paid.
  const aegisNamed = await nameAegisSchools(actor, { heals: Boolean(sys.heal) || sys.tick?.kind === "heal", name: item.name });

  // **02's DISPEL** (*As an action, spend 4 Mana to end any number of effects on one
  // target you can see within 30 feet*; D-778; the lead, 2026-10-03, on O-157:
  // *"selected Effects, not conditions."*): the one creature targeted within 30 feet
  // and - while 04's Rapture's counter holds a use - a second within 20 feet of it.
  // The effects are SELECTED here, through the one chooser (D-673), before anything
  // is paid: a dismissed chooser costs nothing, and a creature with nothing Dispel
  // may end is refused in words. Every row the law greys is listed with its reason.
  // A creature this client does not own is written on the GM's client, so with none
  // online the Dispel is refused before the Mana and the action are spent.
  let dispelling = null;
  if (item.name === DISPEL.feature) {
    const aimed = list.filter(t => targetActorOf(t));
    const rapture = raptureFor(talentsNow);
    const raptureCounter = rapture?.talentId ? (actor.grantedFeature?.(rapture.talentId) ?? null) : null;
    const raptureLeft = Math.max(0, Math.trunc(Number(raptureCounter?.system?.uses?.value)) || 0);
    const further = rapture && raptureLeft > 0 ? Math.min(rapture.count, raptureLeft) : 0;
    const refusedTargets = dispelTargetRefusal({ named: aimed.length, further });
    if (refusedTargets) {
      ui.notifications?.warn(game.i18n.format(refusedTargets, { name: item.name, talent: rapture?.name ?? "", n: 1 + further }));
      return null;
    }
    const apart = feetBetweenTokens(ownToken, tokenOfTarget(aimed[0]));
    if (apart !== null && apart > DISPEL.feet) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.TooFar", { name: item.name, target: aimed[0].name ?? "", feet: DISPEL.feet }));
      return null;
    }
    const far = aimed.length > 1 ? furtherTooFar(aimed, { primary: 1, further: { count: further, feet: rapture.feet } }) : [];
    if (far.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Dispel.TooFar", { name: item.name, talent: rapture?.name ?? "", names: far.join(", "), feet: rapture?.feet ?? 0 }));
      return null;
    }
    if (gmAbsentForActors(aimed.map(t => targetActorOf(t)))) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Dispel.NoGM"));
      return null;
    }
    const picks = [];
    for (const [i, t] of aimed.entries()) {
      const target = targetActorOf(t);
      const rows = dispelOptionsOn(target);
      const open = rows.filter(r => r.available);
      if (!open.length) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Dispel.Nothing", { name: item.name, target: t.name ?? target.name }));
        return null;
      }
      const options = rows.map(r => ({
        key: r.id, name: r.name, available: r.available, reason: r.reason,
        tag: r.available ? null : dispelRefusalWords(r),
        description: target.effects.get(r.id)?.description ?? ""
      }));
      // The first creature's any number; Rapture's further one, one (*may end one
      // condition on an additional target*; MY READING: one effect).
      const max = i === 0 ? open.length : 1;
      const answer = await chooseOption(item, options, null, {
        max, label: "AZEROTH.Dispel.End",
        prompt: game.i18n.format(i === 0 ? "AZEROTH.Dispel.Prompt" : "AZEROTH.Dispel.PromptFurther", { target: t.name ?? target.name, talent: rapture?.name ?? "" })
      });
      const chosen = answer === null ? [] : (Array.isArray(answer) ? answer : [answer]);
      if (!chosen.length) return null;
      // A greyed row never comes back from the chooser; a hand that sends one is refused.
      const closed = chosen.find(c => c.available === false);
      if (closed) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Dispel.Refused", { name: closed.name, reason: closed.tag ?? "" }));
        return null;
      }
      const ids = chosen.map(c => c.key);
      picks.push({ target, name: t.name ?? target.name, ids, names: chosen.map(c => c.name), gated: dispelGatesOn(target, ids) });
    }
    dispelling = { picks, rapture: picks.length > 1 ? { name: rapture.name, counter: raptureCounter } : null };
  }

  // **04's THUNDERSTORM** (*are moved 10 feet away from you in any direction*;
  // D-778): the creatures the Use names are moved once it succeeds, through the
  // forced-movement door - on the GM's client where this client does not own the
  // token, so with no GM online the Use is refused before anything is paid.
  if (ps.push && gmAbsentForActors(list.map(t => targetActorOf(t)))) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Forced.NoGM"));
    return null;
  }

  // **THE LEGACY BRANCHES' BODIES, JUDGED BEFORE ANYTHING IS PAID** (B2; D-768's
  // order: every refusal, then the budget, the reveal and the payment). Each pick
  // below is a judgement too - dismissed, it costs nothing.
  const fightForBodies = actor.activeFight?.() ?? null;
  const ownTokenDoc = ownToken?.document ?? null;
  // 04's The Bench (*Building one takes a Short Rest and a tinker's kit*) and
  // Gadgeteer's learning and Long Rest replacement: outside a fight,
  // and the build with a tinker's kit carried (door 6, door 7).
  if (sys.choice === "constructs") {
    if (fightForBodies) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Construct.Refuse.InFight", { name: item.name }));
      return null;
    }
    if (!actor.items.some(i => i.type === "gear" && i.system?.identifier === CONSTRUCT_KIT && (i.system?.quantity ?? 1) > 0)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Construct.Refuse.NoKit", { name: item.name }));
      return null;
    }
  }
  if (sys.choice === "gadgets") {
    const refused = gadgetChangeRefusal({ inFight: Boolean(fightForBodies) });
    if (refused) {
      ui.notifications?.warn(game.i18n.format(refused, { name: item.name }));
      return null;
    }
  }
  // **A GADGET AIMED AT ONE CREATURE** (04's Discombobulator Ray, *A creature within
  // 30 feet*; the Gnomish Universal Remote, *A Construct within 30 feet*; door 7):
  // one creature targeted, within the feet where both stand, and of the kind named.
  if (onUse?.aim) {
    const aimed = list.filter(t => targetActorOf(t));
    if (aimed.length !== 1) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.OneTarget", { name: item.name }));
      return null;
    }
    const apart = feetBetweenTokens(ownToken, tokenOfTarget(aimed[0]));
    if (apart !== null && apart > (Number(onUse.aim.feet) || 0)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.TooFar", { name: item.name, target: aimed[0].name ?? "", feet: onUse.aim.feet }));
      return null;
    }
    const kinds = Array.isArray(onUse.aim.kinds) ? onUse.aim.kinds : [];
    // A character is one of 02 §5's peoples, every one a humanoid (04's Whisper of Madness:
    // *A humanoid within 30 feet*; stage 3A): its sheet carries no creature type to read.
    const struckType = targetActorOf(aimed[0])?.system?.creatureType ?? aimed[0]?.creatureType
      ?? (targetActorOf(aimed[0])?.type === "character" ? "humanoid" : null);
    if (kinds.length && !kinds.includes(struckType)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Gadget.WrongKind", { name: item.name, target: aimed[0].name ?? "", kind: kinds.map(k => game.i18n.localize(AZEROTH.creatureTypes?.[k] ?? k)).join(", ") }));
      return null;
    }
    // *A friendly target* (04's Troll's Blood and Voodoo Mending; the Legacy branches' B6):
    // the user, or a creature the user counts as an ally (D-755's one reading).
    const aimedActor = targetActorOf(aimed[0]);
    const gadgetRefusal = gadgetTargetRefusal(gadget, aimedActor?.system ?? {});
    if (gadgetRefusal) {
      ui.notifications?.warn(game.i18n.format(gadgetRefusal, {
        name: item.name, target: aimed[0].name ?? aimedActor?.name ?? "",
        kind: kinds.map(k => game.i18n.localize(AZEROTH.creatureTypes?.[k] ?? k)).join(", ")
      }));
      return null;
    }
    if (onUse.aim.friendly === true && aimedActor && aimedActor.uuid !== actor.uuid && !allyOf(actor, aimedActor)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.NotFriendly", { name: item.name, target: aimed[0].name ?? aimedActor.name }));
      return null;
    }
  }
  // **A GADGET WHOSE ATTACK LAYS A CONDITION NEEDS A GM FOR A CREATURE THIS CLIENT DOES
  // NOT OWN** (04's Net-o-Matic Projector; the B2 review): its card's attack lays the
  // Entangled through the GM's client, so with none online the gadget's use would be
  // spent on a net that lands on nobody - refused before anything is paid. With nothing
  // targeted the net's creature is not known yet, and is counted as somebody else's,
  // as a summons' bind is.
  if (onUse?.gadgetAttack && (onUse.gadgetAttack.inflicts ?? []).length) {
    const owned = list.length ? list.map(t => targetActorOf(t)?.isOwner === true) : [false];
    if (gmAbsentFor({ owned, isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
      return null;
    }
  }
  // **A STEP TO A CHOSEN POINT** (the Legacy branches' door 3): 02's Blink (its
  // reach `blinkFor`'s, its mover Slow Time's friend where one is named) and
  // Shadowstep, and a talent's `onUse.step` (04's Fade Step). The space is picked
  // now, before anything is paid; the token is moved once it is. A mover with no
  // token on the viewed scene is moved by the table, said on the card.
  const ownStep = item.name === BLINK.feature
    ? { feet: blink?.reach?.feet ?? FEATURE_STEPS.Blink.feet, sight: FEATURE_STEPS.Blink.sight, refuseWhile: [] }
    : (item.name === "Shadowstep" && sys.className === "Rogue" ? { ...FEATURE_STEPS.Shadowstep, refuseWhile: [] } : stepOf(onUse, rank));
  let stepping = null;
  if (ownStep) {
    const heldBy = stepHeldBy(ownStep.refuseWhile, actor.statuses ?? []);
    if (heldBy) {
      ui.notifications?.warn(game.i18n.format(STEP_REFUSALS.held, { name: item.name, condition: game.i18n.localize(AZEROTH.conditions[heldBy] ?? heldBy) }));
      return null;
    }
    const moverDoc = blink?.who ? (tokenDocOfTarget(blink.who) ?? null) : ownTokenDoc;
    if (!moverDoc?.parent || moverDoc.parent.id !== canvas?.scene?.id) stepping = { skipped: true, name: blink?.who?.name ?? actor.name, feet: ownStep.feet };
    else {
      if (!moverDoc.isOwner && !game.user.isGM && !game.users.activeGM) {
        ui.notifications?.warn(stepWords("noGM", { name: moverDoc.name ?? "", feet: ownStep.feet }));
        return null;
      }
      const picked = await pickStep(moverDoc, { feet: ownStep.feet, sight: ownStep.sight, name: moverDoc.name ?? actor.name });
      if (!picked) return null;
      // Slow Time's ally is a `friend` step, the user's own a `self` one: what the GM's
      // client judges the move by (the B2 review, item h).
      stepping = { doc: moverDoc, to: picked.to, feet: ownStep.feet, name: moverDoc.name ?? actor.name, kind: blink?.who ? "friend" : "self" };
    }
  }
  // **ONE OF YOUR CONSTRUCTS TAKES A HALF-ACTION AT ONCE** (04's Remote Control at
  // rank 2; door 6): a construct standing within the feet, picked through the one
  // chooser where two stand, in a fight - out of one there is no turn to give it.
  let constructHalf = null;
  if (onUse?.constructHalf) {
    if (!fightForBodies) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Construct.NoFight", { name: item.name }));
      return null;
    }
    const feetHalf = Math.max(0, Number(onUse.constructHalf.feet) || 0);
    const near = boundOf(actor, "construct").filter(c => (c.system?.health?.value ?? 0) > 0).map(c => ({ c, token: c.getActiveTokens?.(true)?.[0] ?? null }))
      .filter(r => r.token && (feetBetweenTokens(ownToken, r.token) ?? Infinity) <= feetHalf);
    if (!near.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Construct.NoneNear", { name: item.name, feet: feetHalf }));
      return null;
    }
    const pickHalf = near.length === 1 ? near[0] : await (async () => {
      const answer = await chooseOption(item, near.map(r => ({ key: r.c.uuid, name: r.c.name, description: "" })), null);
      return answer ? (near.find(r => r.c.uuid === answer.key) ?? null) : null;
    })();
    if (!pickHalf) return null;
    const theirs = fightForBodies.getCombatantsByActor(pickHalf.c)?.[0] ?? fightForBodies.combatants.find(cb => cb.tokenId === pickHalf.token.id) ?? null;
    if (!theirs) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Construct.NotInFight", { name: pickHalf.c.name }));
      return null;
    }
    constructHalf = { construct: pickHalf.c, combatant: theirs, owner: fightForBodies.getCombatantsByActor(actor)?.[0] ?? null };
  }
  // **A FEATURE AIMED FROM A CONSTRUCT** (04's Cluster Rockets: *One of your
  // constructs fires at a point within 60 feet of it*; door 6): the construct whose
  // token the card's area is measured from, picked now.
  let aimFrom = null;
  if (onUse?.aimFrom?.kind === "construct") {
    const standing = boundOf(actor, "construct").filter(c => (c.system?.health?.value ?? 0) > 0).map(c => ({ c, token: c.getActiveTokens?.(true)?.[0] ?? null })).filter(r => r.token);
    if (!standing.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Construct.NoneStanding", { name: item.name }));
      return null;
    }
    const pickFrom = standing.length === 1 ? standing[0] : await (async () => {
      const answer = await chooseOption(item, standing.map(r => ({ key: r.c.uuid, name: r.c.name, description: "" })), null);
      return answer ? (standing.find(r => r.c.uuid === answer.key) ?? null) : null;
    })();
    if (!pickFrom) return null;
    aimFrom = { tokenUuid: pickFrom.token.document.uuid, name: pickFrom.c.name, feet: Math.max(0, Number(onUse.aimFrom.feet) || 0) };
  } else if (onUse?.aimFrom?.kind === "self" && ownTokenDoc) {
    // **AN AREA AT A POINT WITHIN THE USER'S REACH** (04's Hush of the Grave: *Every enemy
    // within 15 feet of a point within 60 feet*; the Legacy branches' B6): the card's point
    // held to the feet from the user's own token, the construct's door aimed from the user.
    // With no token on the board the point is the table's, as a spell's is.
    aimFrom = { tokenUuid: ownTokenDoc.uuid, name: actor.name, feet: Math.max(0, Number(onUse.aimFrom.feet) || 0) };
  }
  // **WHAT AN AREA USE MEASURES, AND WHERE** (the lead: *"Measure the area"*; the B6
  // fix): a circle about the user is measured once the Use lands (3c); one on the ground
  // is aimed NOW, before anything is paid - the point picked within the feet of the token
  // the Use aims from (Cluster Rockets' construct, Hush of the Grave's ranger), a press
  // farther refused in words and the pick kept open, and a pick dismissed costs nothing.
  // With nothing to aim from on this board the point is the table's, as before: the card
  // keeps its Place area and its buttons reach the selected tokens.
  // **THE CHROMATIC CHAMPION'S USES, JUDGED AND PICKED BEFORE ANYTHING IS PAID** (02 §7;
  // stage 2B; D-768's order): Wing Buffet's and Dread Presence's reach, Breath's school,
  // area and facing (the cone aimed and the creatures in it gathered now), and Draconic
  // Leap's landing space. A dismissed chooser or pick costs nothing.
  // **A PROMISE TO THE NEXT ATTACK NEEDS A FIGHT TO HOLD IT** (the 3A review, should-fix 2):
  // `rules/next-attack.mjs` lays a promise only against a fight's turn, so a Use that does
  // nothing BUT promise (04's False Opening, Precise Strike) charged its price out of a fight
  // and laid nothing. Refused in words before anything is paid.
  if (grantingTalent && onUse && Object.keys(onUse).every(k => k === "nextAttack" || k === "atRank")
    && onUseNextAttack(onUse, { identifier: grantingTalent.system?.identifier, name: grantingTalent.name }, { rank, tier: actor.system?.tier ?? 1, scope: abilityScope(actor.system) })
    && !actor.fightTurnNow?.()?.combat) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.NextAttack.NeedsFight", { name: item.name }));
    return null;
  }
  const champ = await judgeChampionUse({ actor, item, sys, onUse, list, ownToken, rank, grantingTalent, answers });
  if (!champ) return null;
  const gatherPlan = gatherOf({ who: sys.who ?? null, area: sys.area ?? "" });
  // The flash is aimed before payment. A temporary Region uses core's own token
  // containment geometry without creating a document or leaving an abandoned area.
  let gadgetCone = null;
  if (onUse?.nextAttackBane) {
    if (!ownToken?.document?.parent || ownToken.document.parent.id !== canvas?.scene?.id) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Gadget.ConeNeedsToken", { name: item.name }));
      return null;
    }
    const coneArea = areaFor(sys.area);
    const origin = { x: ownToken.center.x, y: ownToken.center.y };
    const rotation = await pickFacing({ origin, area: coneArea, scene: canvas.scene, label: item.name });
    if (rotation === null) return null;
    const data = regionDataFor({ item, areaText: sys.area, scene: canvas.scene, token: ownToken, origin, rotation, attach: false });
    const region = new CONFIG.Region.documentClass(data, { parent: canvas.scene });
    const inside = (creaturesInArea(actor, { who: "creature", origin: "self", feet: coneArea.distanceFt }) ?? [])
      .filter(r => r.token.document.testInsideRegion(region));
    if (gmAbsentForActors(inside.map(r => r.actor))) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.LegacyUse.NoGM"));
      return null;
    }
    const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
    list.splice(0, list.length, ...targetSnapshots(inside.map(r => r.token)));
    gadgetCone = { origin, rotation };
  }
  let gatherAt = null;
  if (gatherPlan?.origin === "point" && aimFrom?.tokenUuid && canvas?.scene) {
    const aimToken = fromUuidSync(aimFrom.tokenUuid);
    if (aimToken?.parent?.id === canvas.scene.id) {
      const reachFt = Math.max(0, Number(aimFrom.feet) || 0);
      gatherAt = await pickPoint({
        hint: game.i18n.format("AZEROTH.Gather.Pick", { feature: item.name, feet: reachFt, from: aimFrom.name ?? "" }),
        accept: point => {
          const feet = feetToPoint(aimToken, point);
          if (feet !== null && feet <= reachFt) return true;
          ui.notifications?.warn(game.i18n.format("AZEROTH.Gather.PickTooFar", { feet: reachFt, from: aimFrom.name ?? "" }));
          return false;
        }
      });
      if (!gatherAt) return null;
    }
  }
  // **WHAT THE AREA LAYS AT ONCE IS WRITTEN ON EVERY CREATURE IT REACHES** (the lead:
  // *"Land automatically"*; Thunder Clap's Slowed): a creature this client does not own
  // is written on the GM's client, so with no GM online the Use is refused here, before
  // anything is spent (`rules/gm-writes.mjs#gmAbsentFor`).
  if (gatherPlan && landsAtOnce(sys.inflicts ?? [], { resisted: Boolean(sys.resist) }).length) {
    const reached = creaturesInArea(actor, gatherPlan, { point: gatherAt });
    if (reached && gmAbsentForActors(reached.map(r => r.actor))) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
      return null;
    }
  }
  // **A TRAP SET AT A POINT** (04's Shadow Trap: *set a trap at a point within 30
  // feet ... One may stand at a time, or two at rank 2*; door 26): the point picked
  // within the feet of the setter's token, before anything is paid.
  const trap = trapOf(onUse, rank);
  let trapAt = null;
  if (trap) {
    if (!ownTokenDoc || !canvas?.scene) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Trap.NoToken", { name: item.name }));
      return null;
    }
    trapAt = await pickPoint({
      hint: game.i18n.format("AZEROTH.Trap.Pick", { name: item.name, feet: trap.within }),
      accept: point => {
        const feet = feetToPoint(ownToken, point);
        if (feet !== null && feet <= trap.within) return true;
        ui.notifications?.warn(game.i18n.format("AZEROTH.Trap.PickTooFar", { name: item.name, feet: trap.within }));
        return false;
      }
    });
    if (!trapAt) return null;
  }
  // **WHERE WHAT THE FEATURE CALLS ASSEMBLES** (04's Pocket Factory: *assemble in
  // spaces within 30 feet*; door 4): a point picked within the feet, before anything
  // is paid; with no token on the viewed scene the creatures are bound and placed by
  // the table, said on the card.
  const place = (sys.summons?.count ?? 0) > 0 ? placeOf(onUse) : null;
  // **WHAT IS CALLED IS MADE ON THE GM'S CLIENT** (D-643's bind, door 4's tokens):
  // with no GM online a player's call would pay and make nothing, so it is refused
  // first (`rules/gm-writes.mjs#gmAbsentFor`), as every such door is.
  if ((sys.summons?.count ?? 0) > 0 && gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Bound.NoGM"));
    return null;
  }
  let placeAt = null;
  if (place && ownTokenDoc && canvas?.scene) {
    placeAt = await pickPoint({
      hint: game.i18n.format("AZEROTH.Place.Pick", { name: item.name, feet: place.within }),
      accept: point => {
        const refused = placeRefusal({ within: place.within, apart: feetToPoint(ownToken, point) });
        if (!refused) return true;
        ui.notifications?.warn(game.i18n.format(`AZEROTH.Place.Refuse.${refused === "far" ? "Far" : "Unmeasured"}`, { name: item.name, feet: place.within }));
        return false;
      }
    });
    if (!placeAt) return null;
  }

  // 1-b. **THE LEGACY BRANCHES' B3 USES, JUDGED AND PICKED BEFORE ANYTHING IS PAID**
  // (door 25; doors 10, 11 and 12's Uses): `judgeSpiritUses` above. A Use it finishes
  // with nothing to pay - The Crossing stepped back from, a pad set - returns here.
  const spiritsPlan = await judgeSpiritUses({ actor, item, sys, onUse, rank, list, talentRow, ownToken });
  if (!spiritsPlan) return null;
  if (spiritsPlan.early !== undefined) return spiritsPlan.early;

  // 1a. **A SHAPE THE CHARACTER CANNOT TAKE AT ALL** (D-769; the lead,
  // 2026-10-03: *"No Avatar without it"*): the Avatar of the Wild without 04's
  // Heart of the Wild, refused in words before the chooser opens and before
  // anything is paid. The sheet greys the row with the same words.
  const barred = shapeRefusal(shapeKindOf({ name: item.name, choice: sys.choice }), { ranks: name => actor.talentRanks?.(name) ?? 0 });
  if (barred) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Shape.NeedsTalent", { name: item.name, talent: barred.talent }));
    return null;
  }

  // 1b. A feature that is a menu asks which (D-618) - BEFORE anything is
  // paid, so a dismissed chooser costs nothing. The list is the class's,
  // gated by the level the class functions at.
  let chosen = null;
  // Every pick made, in the list's order: one, or up to `picks` where the
  // feature takes more than one in a use (02 §7's Totem Mastery, D-710).
  let picks = [];
  // The shape this use takes, judged at 1b and written at step 2 (D-769).
  let shapeTake = null;
  // The wrecked construct The Bench rebuilds, picked at 1b (the Legacy branches' door 6).
  let rebuilding = null;
  // The creatures the picks bound, carried past the payment: a totem is
  // PLANTED once the Half-Action and the Mana are paid, never before
  // (02 §7, D-708). One entry everywhere but Totem Mastery.
  const boundAll = [];
  /**
   * **A REFUSAL AFTER A BIND PUTS THE CREATURE BACK** (D-710). The bind is
   * step 1b and the turn's budget and the pool are 1c and 2, so every refusal
   * below this point used to leave a bound creature standing in the *Bound*
   * folder on a use that never happened - one before Totem Mastery and up to
   * four after it, which is what made it worth curing. `release` is the same
   * door the banner presses: it takes the uuid off the feature's `known`,
   * lifts the owner's effects, and deletes a creature bound for the encounter
   * with its tokens. Nothing was paid at any of these points, so the state
   * afterwards is exactly the state before the Use.
   *
   * Resolves to null, so a refusal reads `return undoBinds();`.
   */
  const undoBinds = async () => {
    if (!boundAll.length) return null;
    const names = boundAll.map(b => b.actor?.name).filter(Boolean);
    for (const b of boundAll) {
      if (b.actor?.uuid) await release(actor, b.actor.uuid);
    }
    boundAll.length = 0;
    // Said in words beside the refusal, never left to the folder: a creature
    // that appeared and vanished with no sentence reads as a bug.
    if (names.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Bound.Undone", { feature: item.name, names: names.join(", ") }));
    }
    return null;
  };
  if (sys.choice) {
    const { options, note } = await featureMenu(actor, item);
    if (!options.length) {
      ui.notifications?.warn(note ?? game.i18n.format("AZEROTH.Feature.NoChoices", { name: item.name }));
      return null;
    }
    // HOW MANY THIS USE TAKES (02 §7's Totem Mastery, D-710): four totems in
    // one Half-Action, bounded by the room the tier leaves (D-709 is still
    // the standing limit). One everywhere else, and the whole path below runs
    // exactly as it did with a list of one.
    let allowed = 1;
    if (sys.choice === "totems" && (sys.picks ?? 1) > 1) {
      // The tier is the STANDING limit (D-709) and this is the one place the
      // two numbers meet: never more than the room left, whatever the action
      // would allow.
      const stands = capacity("totem", { level: actor.system.level ?? 1, talents: actor.takenTalents() });
      const room = stands - boundCount(actor, "totem");
      if (room <= 0) {
        // Said BEFORE the chooser, because a menu that cannot be honoured is
        // worse than a refusal (D-681). The single-pick path still refuses at
        // the bind, where it always has.
        ui.notifications?.warn(game.i18n.format("AZEROTH.Bound.Full", {
          owner: actor.name, count: stands,
          kind: game.i18n.localize(AZEROTH.boundKinds.totem),
          names: heldNames(actor, "totem").join(", ")
        }));
        return null;
      }
      allowed = Math.min(Math.trunc(sys.picks), room);
    }
    // **04's CHIMERA: TWO SHAPESHIFT FORMS IN ONE SHAPE** (D-769). The talent's
    // patch stamps `picks: 2` on Shapeshift, and the chooser becomes the
    // checklist Totem Mastery's is (D-710's one chooser, never a second dialog):
    // one form, or two merged.
    if (sys.choice === "forms" && (sys.picks ?? 1) > 1) allowed = Math.trunc(sys.picks);
    // Gadgeteer's 2 + character tier, plus Engineering Upgrade's ranks. The
    // checklist opens on the gadgets known; replacement is checked below.
    if (sys.choice === "gadgets") allowed = Math.max(1, gadgetsKnownFor(talentsNow, undefined, { tier: actor.system?.tier ?? 1 }).known);
    const answer = foresightCommit !== null
      ? options.find(option => option.key === foresightSchool && option.available !== false) ?? null
      : await chooseOption(item, options, note, { max: allowed });
    picks = answer === null ? [] : (Array.isArray(answer) ? answer : [answer]);
    if (!picks.length) return null;
    chosen = picks[0];
    if (sys.choice === "gadgets") {
      const refused = gadgetSelectionRefusal({
        known: item.system?.known ?? [], selected: picks.map(p => p.key), allowed,
        longRest: gadgetRest,
        bench: talentsNow.some(t => t.className === "Rogue" && t.identifier === "the-bench" && t.taken > 0)
      });
      if (refused) {
        ui.notifications?.warn(game.i18n.format(refused, { name: item.name, n: allowed }));
        return null;
      }
    }
    // 04's Demonic Sacrifice (*The dismissed demon cannot be summoned again until
    // your next Long Rest*; D-775): greyed in the chooser with its reason, and
    // refused in those words rather than as a level not yet reached.
    const locked = picks.find(p => p.sacrificed === true);
    if (locked) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Sacrifice.Locked", { name: locked.name }));
      return null;
    }
    // Listed and greyed is not learned (D-635): a pick above the level is
    // refused, and one greyed pick refuses the whole use rather than half of it.
    const tooSoon = picks.find(p => p.available === false);
    if (tooSoon) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NotYet", { name: tooSoon.name, level: tooSoon.level ?? "?" }));
      return null;
    }
    // EACH PICK PAYS ITS OWN MANA (02 §7, D-710), so several are refused
    // before anything is bound - the single pick is still refused at the
    // payment below, where every other feature is.
    if (picks.length > 1 && sys.cost?.pool && !sys.cost.all) {
      const purse = poolFor(actor, sys.cost.pool, item.getFlag("azeroth-rpg", "feature")?.classId ?? null);
      const discount = actor.system?.signatureEffects?.empowers?.[item.name]?.cost ?? 0;
      const needed = Math.max(0, sys.cost.amount - discount) * picks.length;
      if (!purse || purse.value < needed) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NoPoolMany", {
          name: item.name, count: picks.length, amount: needed,
          pool: game.i18n.localize(AZEROTH.poolTypes[purse?.name ?? sys.cost.pool] ?? sys.cost.pool)
        }));
        return null;
      }
    }
    // **A SHAPE IS JUDGED HERE AND WRITTEN ONLY ONCE IT IS PAID FOR** (D-769,
    // D-768's order). The form used to be written the moment it was picked, so
    // a shift the budget then refused left the Druid in the form. Shapeshift,
    // the Avatar of the Wild and Metamorphosis are one door: `shapeTake` is the
    // plan, and `documents/shapes.mjs#takeShape` writes it at step 2.
    const shapeKind = shapeKindOf({ name: item.name, choice: sys.choice });
    if (shapeKind) {
      const entries = picks.map(p => p.uuid).filter(Boolean);
      if (entries.length !== picks.length) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Shape.NoBlock", { name: item.name, form: picks.find(p => !p.uuid)?.name ?? "" }));
        return null;
      }
      // *A form taken is a form learned* (D-619), and no more than the Forms
      // table allows: Chimera's two may learn one, both or neither.
      if (sys.choice === "forms") {
        const cls = (actor.classItems ?? []).find(c => c.id === item.getFlag("azeroth-rpg", "feature")?.classId)
          ?? (actor.classItems ?? []).find(c => c.name === sys.className) ?? null;
        const classIndex = (actor.classItems ?? []).indexOf(cls);
        const at = classIndex <= 0 ? (actor.system.level ?? 1) : secondaryLevel(actor.system.level ?? 1);
        const tooMany = formPicksRefusal(picks, { known: (sys.known ?? []).length, allowed: formsKnown(cls?.system?.forms ?? [], at) });
        if (tooMany) {
          ui.notifications?.warn(game.i18n.format("AZEROTH.Shape.TooManyNew", { name: item.name, room: tooMany.room }));
          return null;
        }
      }
      // **THE BLOCKS ARE READ HERE, BEFORE ANYTHING IS PAID** (the review):
      // `takeShape` read them after the budget and the Mana, so a pick whose
      // entry no longer resolved was paid for and took nothing. Every pick has
      // to come back as a block, or the use is refused in words.
      const forms = await formsFrom(entries);
      if (forms.length !== picks.length) {
        const lost = picks.find(p => !forms.some(f => f.uuid === p.uuid)) ?? picks[0];
        ui.notifications?.warn(game.i18n.format("AZEROTH.Shape.NoBlock", { name: item.name, form: lost?.name ?? "" }));
        return null;
      }
      shapeTake = { kind: shapeKind, forms, ward: null };
      // **METAMORPHOSIS'S WARD: FEL OR SHADOW** (02 §7: *gain Ward 3 (Fel or
      // Shadow)*), asked through the one chooser straight after the demon, and
      // before anything is paid - a dismissed chooser costs nothing.
      if (shapeKind === "metamorphosis") {
        const schools = METAMORPHOSIS.wardSchools.map(key => ({ key, name: game.i18n.localize(AZEROTH.schools[key] ?? key), description: "" }));
        const school = await chooseOption(item, schools, null, { prompt: game.i18n.format("AZEROTH.Shape.WardPrompt", { ward: METAMORPHOSIS.ward }) });
        if (!school) return null;
        shapeTake.ward = { school: school.key, value: METAMORPHOSIS.ward };
      }
    }
    // A creature picked is a world actor the bond links (D-643): the bind
    // refuses at capacity, before anything is paid. A pick 14 prints no
    // block for (a totem) carries the block the feature builds.
    const binding = bindingFor({ name: item.name, choice: sys.choice });
    // **04's DEMONIC AEGIS AT RANK 2** (*it gains Ward 1 against Fel or against
    // Shadow, chosen when you summon it*; D-775): asked through the one chooser
    // straight after the demon and before anything is bound or paid - a dismissed
    // chooser costs nothing - and carried on the bond (`rules/bound.mjs#boundEffects`).
    let aegisSchool = null;
    const aegis = binding?.kind === "demon" ? aegisWardFor(talentsNow) : null;
    if (aegis && picks.some(p => !p.held && (p.uuid || p.block))) {
      const schools = aegis.schools.map(key => ({ key, name: game.i18n.localize(AZEROTH.schools[key] ?? key), description: "" }));
      const school = await chooseOption(item, schools, null, { prompt: game.i18n.format("AZEROTH.Aegis.Prompt", { talent: aegis.name, n: aegis.ward }) });
      if (!school) return null;
      aegisSchool = school.key;
    }
    // **04's GRAVE BOND: THE TEST IN PLACE OF THE HANDLING TEST** (the Legacy branches'
    // door 26): rolled now, before anything is bound or paid - a creature that
    // resists binds nothing and the Use costs nothing.
    for (const pick of binding?.kind === "companion" ? picks : []) {
      if (!pick.graveBond || pick.held || !pick.uuid) continue;
      // A creature that resisted before is never tried again (02's Companion; the B2
      // review): the menu greys it, and the pick is refused here as well, in words.
      if (resistedBonds(actor.getFlag("azeroth-rpg", GRAVE_BOND_RESISTED_FLAG)).includes(pick.uuid)) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.GraveBond.TriedBefore", { name: pick.name ?? "", talent: graveBondFor(talentsNow)?.name ?? "" }));
        return null;
      }
      const creature = await fromUuid(pick.uuid);
      // The Resilience the row names (`graveBond.resist`; the B6 review: it was never read).
      const bond = graveBondFor(talentsNow);
      if (!creature || await graveBondTest({ owner: actor, creature, talent: bond?.name ?? "", uuid: pick.uuid, resilience: bond?.resist ?? "spirit" })) return null;
    }
    let boundRefused = false;
    for (const pick of binding ? picks : []) {
      // **A WRECKED CONSTRUCT REBUILT** (04's The Bench: *and so does rebuilding one
      // wrecked at 0 Health*; door 6): the construct already held, stood up once the
      // Use is paid for - no second bind.
      if (pick.rebuild) {
        rebuilding = boundOf(actor, "construct").find(b => b.uuid === pick.uuid) ?? null;
        continue;
      }
      if (pick.held) {
        // Already bound to this character: nothing to make, nothing to pay for.
        ui.notifications?.info(game.i18n.format("AZEROTH.Bound.AlreadyHeld", { owner: actor.name, name: pick.name }));
        boundRefused = true;
        break;
      }
      if (!(pick.uuid || pick.block)) continue;
      const entry = pick.uuid ? await fromUuid(pick.uuid) : null;
      // The GM's own creature is bound as it stands (D-650); 14's entry is made anew.
      const made = pick.world
        ? await adopt({ owner: actor, actor: entry, kind: binding.kind, feature: item, school: aegisSchool })
        : await bind({ owner: actor, feature: item, entry, block: pick.block ?? null, ...binding, school: aegisSchool });
      // The refusal is already said; keep what was bound and stop there.
      if (!made) { boundRefused = true; break; }
      boundAll.push({ actor: made, kind: binding.kind, option: pick });
    }
    // Nothing bound and something refused: the use is off, as it was before a
    // pick could be several (D-643). A pick that binds nothing at all - an
    // option with no block behind it - still falls through to the card.
    if (boundRefused && !boundAll.length) return null;
    // Adaptable's one skill (D-636): the pick replaces.
    if (chosen.learn === "replace") {
      await item.update({ "system.known": [{ uuid: chosen.uuid, name: chosen.name }] });
      ui.notifications?.info(game.i18n.format("AZEROTH.Feature.AdaptableNotice", { name: actor.name, skill: chosen.name }));
    }
    // A form taken is a form LEARNED (D-619), and it is recorded once the shift
    // is paid for, beside the shape itself (step 2b; D-769) - a shift refused
    // learns nothing.
  }
  // **A SHAPE NO MENU PICKS** (04's Gnomish Battle Rig: *You take its form in
  // 14-BESTIARY*; the Legacy branches' B2): the kind's one block, read off the
  // bestiary pack by name before anything is paid, as every other shape's is - a
  // block the pack does not hold refuses the Use in words.
  if (!shapeTake && !sys.choice) {
    const kindHere = shapeKindOf({ name: item.name, choice: null });
    // A drake form's block is named by its capstone feature (the Chromatic Champion plan).
    const entryName = shapeEntryOf(kindHere, { feature: item.name });
    if (entryName) {
      const found = (await bestiaryEntries()).find(e => e.name === entryName) ?? null;
      const forms = found ? await formsFrom([found.uuid]) : [];
      if (!forms.length) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Shape.NoBlock", { name: item.name, form: entryName }));
        return undoBinds();
      }
      shapeTake = { kind: kindHere, forms, ward: null };
    }
  }

  // 1c. A feature that dismisses a bound creature (Demonic Sacrifice, D-643)
  // asks which, before anything is paid; the Mana it returns lands after.
  // **THE CREATURE GOES ONCE THE USE IS PAID FOR** (D-768): it was released
  // here, before the budget and the pool were asked, so a refused use had
  // already dismissed the demon. The pick is the judgement; the release is
  // step 2a.
  let dismissed = null;
  let dismissPick = null;
  // 04's Demonic Sacrifice: *that demon's Ward*, read off the creature as it stands
  // at the pick, before it goes (D-775) - and its name, for the Long Rest's lock.
  let sacrificed = null;
  if (sys.bound?.action === "dismiss") {
    const held = boundOf(actor, sys.bound.kind);
    if (!held.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Bound.NoCreature", { name: actor.name, kind: game.i18n.localize(AZEROTH.boundKinds[sys.bound.kind] ?? sys.bound.kind) }));
      return undoBinds();
    }
    const pick = held.length === 1 ? { uuid: held[0].uuid, name: held[0].name }
      : await chooseOption(item, held.map(b => ({ key: b.uuid, uuid: b.uuid, name: b.name, description: "" })), null);
    if (!pick) return undoBinds();
    dismissPick = pick;
    dismissed = pick.name;
    if (mw.sacrifice) {
      const demon = held.find(b => b.uuid === pick.uuid) ?? null;
      sacrificed = {
        name: bondOf(demon)?.entryName ?? demon?.name ?? pick.name, uuid: demon?.uuid ?? pick.uuid ?? null,
        ward: mw.sacrifice.ward ? sacrificedWardChanges(demon?.system?.ward ?? {}) : []
      };
    }
  }

  // 04's Cloak of Shadows (*Ward 1 per rank against one school*, D-773): the
  // school is the Use's own chooser's answer at 1b, and a Use with none has
  // nothing to ward. 04's Prismatic Ward asks none: *every school* (D-775).
  if (rr.ward && !rr.ward.everySchool && !AZEROTH.schools?.[chosen?.key ?? ""]) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NoChoices", { name: item.name }));
    return undoBinds();
  }

  // 02's Ward (D-774): the school the chooser named at 1b, or every school with
  // Aegis Eternal, whose patch asks no school at all.
  const wardSchoolsNow = isWard ? wardSchools({ chosen: chosen?.key ?? null, everySchool: wardOpts.everySchool, schools: Object.keys(AZEROTH.schools ?? {}) }) : [];
  if (isWard && !wardSchoolsNow.length) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NoChoices", { name: item.name }));
    return undoBinds();
  }

  // 1d. **WHAT THE FEATURE CALLS IS JUDGED BEFORE ANYTHING IS PAID** (D-768).
  // The summon loop below ran AFTER the action and the Mana were paid and only
  // warned on an entry 14 does not print, so Feral Spirit spent 6 Mana on two
  // spirit wolves the bestiary has never held. Every entry has to be in the
  // pack and the kind has to have room (`rules/bound.mjs#summonRefusal`), and a
  // player needs a GM online to make the bind on (D-643's `CONFIG.queries`):
  // each refusal is said in words with nothing spent. The GM-side bind still
  // refuses for itself; this moves what can be known to before the payment.
  let summonEntries = [];
  if ((sys.summons?.count ?? 0) > 0) {
    const names = sys.summons.entries ?? [];
    const index = await bestiaryEntries();
    const refusal = summonRefusal({
      names, known: index.map(e => e.name),
      room: capacity("summon", { level: actor.system.level ?? 1, talents: actor.takenTalents() }),
      held: boundCount(actor, "summon")
    });
    if (refusal?.reason === "NoEntry") {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Bound.SummonRefused", { feature: item.name, names: refusal.names.join(", ") }));
      return undoBinds();
    }
    if (refusal?.reason === "Full") {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Bound.Full", {
        owner: actor.name, count: refusal.room, kind: game.i18n.localize(AZEROTH.boundKinds.summon), names: heldNames(actor, "summon").join(", ")
      }));
      return undoBinds();
    }
    if (!game.user.isGM && !game.users.activeGM) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Bound.NoGM"));
      return undoBinds();
    }
    summonEntries = names.map(name => index.find(e => e.name === name));
  }

  // **02's RALLYING CRY'S ALLIES, MEASURED BEFORE ANYTHING IS PAID** (D-777):
  // *grants every ally within 30 feet temporary Health equal to your level ...
  // Both count you as an ally* - the warrior among them - and an ally this client
  // does not own takes it on the GM's client, so with none online the War Cry is
  // refused before its use is spent (Hymn of Hope's rule, D-774's review).
  const rallying = sys.choice === "warCry" && chosen?.key === RALLYING_CRY.key;
  const rallyNear = rallying ? creaturesWithin(actor, RALLYING_CRY.feet, { who: "ally" }) : [];
  if (rallying && gmAbsentForActors(rallyNear.map(r => r.actor))) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Temporary.NoGM"));
    return undoBinds();
  }
  // **04's SPIRIT LINK TOTEM NAMES ITS TOTEM BEFORE ANYTHING IS PAID** (D-777):
  // *add this effect to a totem of yours already standing* - one on the board and
  // standing, picked through the one chooser where several do; none is refused in
  // words with nothing spent.
  let linkTotem = null;
  if (onUse?.link) {
    const standingTotems = boundOf(actor, "totem").filter(t => (t.getActiveTokens?.(true)?.length ?? 0) > 0 && (t.system?.health?.value ?? 0) > 0);
    if (!standingTotems.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.SpiritLink.NoTotem", { name: item.name }));
      return undoBinds();
    }
    if (standingTotems.length === 1) linkTotem = standingTotems[0];
    else {
      const pick = await chooseOption(item, standingTotems.map(t => ({ key: t.uuid, uuid: t.uuid, name: t.name, description: "" })), null, { prompt: game.i18n.format("AZEROTH.SpiritLink.Prompt", { name: item.name }) });
      linkTotem = pick ? (standingTotems.find(t => t.uuid === pick.uuid) ?? null) : null;
      if (!linkTotem) return undoBinds();
    }
  }

  // 1e. **THE POOL IS ASKED BEFORE THE BUDGET** (D-768; the lead, 2026-10-03:
  // *Keeps the Half-Action*). The budget was spent first and a short pool
  // refused after, so a feature refused for its Rage cost the Half-Action as
  // well. From the class's own pool where the character holds two.
  // **ONE NAMED CLASS FEATURE, MADE CHEAPER BY WHAT IS WORN** (08 §20, D-698):
  // *Decrease the rage cost of Whirlwind by 3* is the lead's *change to Class
  // Feature*, floored at nothing. EACH ONE PAYS ITS OWN (02 §7's Totem Mastery,
  // D-710): the Half-Action is spent once and the Mana once per totem actually
  // bound. `rules/class-features.mjs#featurePayment` is the arithmetic.
  // **A MANA PRICE IN A SHAPESHIFT FORM IS FEROCITY** (07, *The Druid in a
  // form*; D-769): 1 for every 2 Mana, rounded up, out of the Ferocity pool -
  // so an Avatar of the Wild taken from a bear's shape costs 8 (the plan's
  // reading, flagged for the lead). `payingPool` says which pool pays.
  const inForm = actor.inShapeshiftForm === true;
  // **A PRICE FROM ANY POOL** (02 §5's Tail Sweep; the lead, 2026-11-09: *"Pay 4 from your
  // Momentum or your Power pool (Rage, Energy, Mana...)."*): the pools that hold the price,
  // read now; none is refused in words naming the price, one pays without asking, and two
  // are a pick through the one chooser - all before the budget and before anything is
  // paid (D-768's order). `rules/pools.mjs#anyPoolChoice` is the judgement.
  let anyPoolPaid = null;
  if (sys.cost?.pool === ANY_POOL && !sys.cost?.all) {
    const due = Math.max(0, (Number(sys.cost.amount) || 0) - (Number(actor.system?.signatureEffects?.empowers?.[item.name]?.cost) || 0));
    const choice = anyPoolChoice(actor.poolSnapshot?.() ?? [], due);
    if (choice.refusal) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NoAnyPool", { name: item.name, amount: due }));
      return undoBinds();
    }
    anyPoolPaid = choice.pool;
    if (!anyPoolPaid) {
      const label = p => game.i18n.localize(p.name ? (AZEROTH.poolTypes[p.name] ?? p.name)
        : (p.kind === "power" ? "AZEROTH.Item.PowerPool" : "AZEROTH.Momentum.Label"));
      const pick = await chooseOption(item, choice.ask.map(p => ({
        key: anyPoolKey(p), description: "",
        name: game.i18n.format("AZEROTH.Feature.PayFromOption", { pool: label(p), value: p.value ?? 0, max: p.max ?? 0 })
      })), null, { prompt: game.i18n.format("AZEROTH.Feature.PayFrom", { name: item.name, amount: due }) });
      anyPoolPaid = pick ? choice.ask.find(p => anyPoolKey(p) === pick.key) ?? null : null;
      if (!anyPoolPaid) return undoBinds();
    }
  }
  const pool = anyPoolPaid ?? poolFor(actor, payingPool(sys.cost?.pool ?? null, { inShapeshiftForm: inForm }), item.getFlag("azeroth-rpg", "feature")?.classId ?? null);
  // **DIVINE FAVOR** (04: *Your first healing feature after each Long Rest costs
  // no Mana. At rank 2 the first two cost none*; D-772): a healing feature's Mana
  // is waived while the counter the talent grants holds a use - the counter's
  // uses ARE the free ones - and one is struck once the Use is paid for.
  const favorRow = sys.heal && sys.cost?.pool === "mana" ? freeHealingFor(actor.takenTalents()) : null;
  const favor = waives(favorRow, sys) ? favorRow : null;
  const favorCounter = favor ? (actor.grantedFeature?.(favor.talentId) ?? null) : null;
  const favored = Boolean(favorCounter) && favorCounter.id !== item.id && (favorCounter.system?.uses?.value ?? 0) > 0;
  // **INNER FOCUS** (04: *a spell or feature requiring a Casting Test costs no
  // Mana*; D-774): the line ticked, its use struck once the Use is paid for - and
  // only where nothing else waived the Mana first (the final review of D-768 to
  // D-775, as `castSpell`'s `focused`): Divine Favor's free heal and Improved
  // Blink's free Blink strike their own counters, and a line beside them buys
  // nothing, so it spends nothing.
  let freeMana = Boolean(freeLine) && sys.cost?.pool === "mana";
  freeMana &&= !favored && !blinkFree;
  // **04's NATURE'S GRACE ON A CASTING FEATURE** (the lead, 2026-10-03, on O-168:
  // *"Yes to both."*; D-779): the discount laid for the next spell that reaches a
  // class feature making a Casting Test is taken whole by this Use's Mana - where
  // Mana is paid at all - and written off with the payment.
  const grace = sys.casting && sys.cost?.pool === "mana" && !favored && !freeMana && !blinkFree
    ? takeForFeature(actor.pendingNextSpell?.()?.live ?? [])
    : { taken: [], kept: [], amount: 0 };
  const payment = favored ? { spent: 0, refusal: null } : featurePayment({
    cost: sys.cost, pool,
    discount: (actor.system?.signatureEffects?.empowers?.[item.name]?.cost ?? 0) + grace.amount,
    times: Math.max(1, boundAll.length || 1),
    inShapeshiftForm: inForm
  });
  // And Improved Blink at rank 2's free Blink (D-775), judged at step 1.
  if (freeMana || blinkFree) Object.assign(payment, { spent: 0, refusal: null });
  if (payment.refusal === "NoPool") {
    // 05 §11's kind word names its own pool too (02 §5's War Stomp: *4 Momentum*).
    ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NoPool",
      { name: item.name, pool: game.i18n.localize(AZEROTH.costPoolTypes[sys.cost.pool] ?? sys.cost.pool), amount: sys.cost.amount }));
    return undoBinds();
  }
  if (payment.refusal === "Short") {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NoPool",
      { name: item.name, pool: game.i18n.localize(AZEROTH.poolTypes[pool.name] ?? pool.name), amount: payment.spent }));
    return undoBinds();
  }

  // 1e. **THE RUNG A USE OF TWO IS TAKEN AT** (04's Ethereal Form: *At rank 2 you may use
  // it as a Reaction*; the B6 review - a second way, never the only one): out of a fight
  // the Use's own, in one the rung the turn can still pay, and where it can pay both the
  // one chooser asks which, before anything is spent - a dismissed chooser costs nothing.
  // Whose turn it is (B8b): off its own turn only the Reaction is open.
  const rungMine = actor.activeFight?.()?.getCombatantsByActor?.(actor)?.[0] ?? null;
  const rungPlan = rungChoice({
    action: sys.action ?? null, rungs: sys.rungs ?? [], inFight: Boolean(actor.activeFight?.()),
    onTurn: rungMine ? rungMine.isCurrentTurn === true : true,
    payable: r => !turnBudgetRefusal(actor, r),
    // 02's Draconic Leap: *your Reaction on ANOTHER creature's turn* (stage 2B).
    offTurnOnly: onUse?.offTurn ?? null
  });
  let rungNow = rungPlan.rung;
  if (rungPlan.ask) {
    const pickRung = await chooseOption(item, rungPlan.ask.map(r => ({ key: r, name: game.i18n.localize(AZEROTH.actions[r] ?? r), description: "" })), null,
      { prompt: game.i18n.format("AZEROTH.Feature.RungPrompt", { name: item.name }) });
    if (!pickRung) return undoBinds();
    rungNow = pickRung.key;
  }
  // The rung this Use spends: Nature's Swiftness's Half-Action, else the one taken.
  const actionNow = swiftLine ? "half" : (rungNow ?? null);

  // 1e+. **WHERE EACH PULLED CREATURE LANDS** (04's None Escape: *pulled to a space you
  // choose within 10 feet of you*; the lead, 2026-10-21: *"A space you choose"*): one
  // pick for each creature held, in name order, once the price and the turn are known
  // to be payable - asked of the budget without spending it - so a dismissed pick makes
  // no Use and spends nothing. Each space is measured from the USER's footprint (D-732)
  // and may hold no other creature and no space already chosen; a creature's own space
  // leaves it where it stands, said on the card.
  const pullPlan = [];
  if (pulling.length) {
    const short = turnBudgetRefusal(actor, actionNow);
    if (short) {
      ui.notifications?.warn(game.i18n.format(short.reason, short.params ?? {}));
      return undoBinds();
    }
    const holderName = ownTokenOfPull?.name ?? actor.name;
    const taken = [];
    for (const r of pulling) {
      const picked = await pickPull(r.token, {
        holder: ownTokenOfPull, within: legacy.pullEntangled.within, name: r.token.name ?? r.actor.name, holderName, source: item.name, taken
      });
      if (!picked) return undoBinds();
      if (!picked.stays) taken.push(picked.box);
      pullPlan.push({ token: r.token, name: r.token.name ?? r.actor.name, to: picked.to, stays: picked.stays, holderName });
    }
  }

  // 1f. The turn's budget, in a fight (2026-09-06): the feature's action.
  // A refusal here puts back whatever 1b bound (D-710): the budget is NOT
  // moved ahead of the bind, because the order is what the chooser's own
  // contract rests on - a pick that cannot be honoured is refused before
  // anything is paid, and the payment is the last thing that happens. Every
  // other refusal has been asked by now (D-768).
  // **ONCE A ROUND, A SHIFT COSTS NO ACTION** (04's Savage Shift at rank 1,
  // D-771): on the druid's own turn in a fight, the round's record marked
  // through the queued door - and a mark another press made first leaves this
  // one to pay its Half-Action as any shift does.
  let shiftFree = false;
  const fightNow = actor.activeFight?.() ?? null;
  const mine = fightNow ? (fightNow.getCombatantsByActor(actor)?.[0] ?? null) : null;
  if (mine && freeShift({
    kind: shapeKindOf({ name: item.name, choice: sys.choice }),
    // By name, the inline row's own reading (`talent-effects.mjs`: Savage Shift is `inline`).
    savageShift: actor.talentRanks?.("Savage Shift") ?? 0,
    inFight: true,
    onTurn: fightNow.combatant?.id === mine.id,
    used: ((r => (r.number === fightNow.round ? r.once ?? [] : []))(mine.getFlag("azeroth-rpg", "round") ?? {}))
  }) && mine.isOwner) {
    shiftFree = (await mine.markRoundOnce(FREE_SHIFT_MARK))?.added === true;
  }
  // **SPIRIT WALK'S HALF-ACTION IS THE MOVE** (04: *As a Half-Action, move your
  // Speed without provoking*; D-774): Disengage's own door, the budget and the
  // Moves paid in one write (D-761), so the walk is not charged a second time.
  const gadgetCost = gadgetHealthCost(gadget, { tier: tierNow, health: actor.system?.health?.value ?? 0 });
  if (gadgetCost.refused) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Gadget.HealthRefused", { name: item.name }));
    return undoBinds();
  }
  if (onUse?.sustain && refuseSustainTransferStart(actor)) return undoBinds();
  if (trapDose && (!game.users?.activeGM || actor.items.get(trapPoison.id) !== trapPoison
    || actor.items.get(item.id) !== item || !sameSnakeTrapRule(snakeTrapFor(actor.takenTalents()), trapDose.expectedSnake)
    || !snakeTrapDosePlan({ item: trapPoison.toObject(), ...trapDose }).ok)) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.SnakeTrap.DoseRefused"));
    return undoBinds();
  }
  if (item?.getFlag?.("azeroth-rpg", "feature")?.gadget && refuseDispersion(actor, "gear")) return undoBinds();
  if (refuseForesight() || refuseMindControl()) return undoBinds();
  if (foresight !== null) {
    const unavailable = turnBudgetRefusal(actor, actionNow);
    if (unavailable) {
      ui.notifications?.warn(game.i18n.format(unavailable.reason, unavailable.params ?? {}));
      return undoBinds();
    }
  }
  if (foresight !== null && foresightCommit === null) {
    return requestForesightUse({ priest: actor, target: targetActorOf(wardOn[0]), item, answers: foresight, school: wardSchoolsNow[0] });
  }
  if (spellstealCommit !== null && !spellstealUseValid(actor, item, spellstealCommit)) return undoBinds();
  if (commanding) {
    const target = fromUuidSync(commanding.target.uuid);
    const refused = target !== commanding.target ? 'AZEROTH.CommandDemon.PlacementChanged'
      : commandRefusal({ named: 1, demon: target.system?.creatureType === 'demon', feet: null, reach: 20, bound: Boolean(bondOf(target)) })
        || commandDemonRangeRefusal(actor, target, commanding.placement) || commanding.sightRefusal();
    if (refused) {
      ui.notifications?.warn(game.i18n.format(refused, { name: item.name, target: commanding.name, feet: 20 }));
      return undoBinds();
    }
    if (gmAbsentForActors([target])) {
      ui.notifications?.warn(game.i18n.localize('AZEROTH.Bound.NoGM'));
      return undoBinds();
    }
  }
  let bellowJournal = null;
  let bellowPaidUses = null;
  if (onUse?.laysBane?.many === true && onUse.laysBane.hearing === true) {
    // Menus and other preflight work above await. Validate the exact original
    // recipients again immediately before committing the action budget.
    for (const chosen of baneTargets) {
      const sourceToken = actor.getActiveTokens?.(true)?.[0]?.document ?? null;
      chosen.bellowDelivery = {
        from: sourceToken ? { sceneId: sourceToken.parent.id, tokenId: sourceToken.id } : null,
        to: chosen.t?.tokenId ? { sceneId: chosen.t.sceneId ?? canvas?.scene?.id, tokenId: chosen.t.tokenId } : null
      };
    }
    bellowJournal = await beginBellowJournal(actor, item, baneTargets);
    // The journal write awaits; validate the original selection afterwards.
    for (const chosen of baneTargets) {
      const currentToken = tokenOfTarget(chosen.t);
      const current = chosen.t?.tokenId ? tokenDocOfTarget(chosen.t)?.actor : targetActorOf(chosen.t);
      const feet = onUse.laysBane.feet ?? 20;
      const reason = bellowTargetRefusal({ sameActor: current === chosen.actor,
        deafened: current?.statuses?.has('deafened') === true, feet,
        distance: feetBetweenTokens(actor.getActiveTokens?.(true)?.[0] ?? null, currentToken) });
      if (reason) {
        ui.notifications?.warn(game.i18n.format(reason === 'hearing' ? 'AZEROTH.Laid.CannotHear'
          : reason === 'range' ? 'AZEROTH.Laid.TooFar' : 'AZEROTH.Laid.SomeTargets',
        { name: item.name, target: chosen.actor.name, feet }));
        await bellowJournal.cancelBeforePayment();
        return undoBinds();
      }
    }
    if (gmAbsentForActors(baneTargets.map(row => row.actor))) {
      ui.notifications?.warn(game.i18n.localize('AZEROTH.Laid.BaneNoGM'));
      await bellowJournal.cancelBeforePayment();
      return undoBinds();
    }
  }
  if (isBellow && !bellowCommitValid(actor, item, bellowCommit)) {
    if (bellowJournal) await bellowJournal.cancelBeforePayment();
    return undoBinds();
  }
  // **A REWIND'S OFFER, CLAIMED BEFORE ANYTHING IS SPENT** (D-773's and D-774's rule for a
  // card's press; stage 3B): every refusal has been asked, so the offer is marked pressed
  // now - here where this client may write it, on the GM's client where it may not - and a
  // press another client claimed first is refused in words with nothing spent.
  if (champ?.rewind) {
    const { claimCardPress } = await import("../effects/card-presses.mjs");
    const claimed = await claimCardPress(champ.rewind.message, { kind: "once", press: "rewind" });
    if (!claimed.ok) {
      ui.notifications?.warn(game.i18n.localize(claimed.reason ?? "AZEROTH.TalentLine.Pressed"));
      return undoBinds();
    }
  }
  if (ps.walk && mine) {
    if (!(await mine.spendMoveAction()).ok) return undoBinds();
  } else if (negating?.answeredWithLost) {
    // **THE REACTION THE BLOW TOOK IS THE ONE THAT ANSWERS IT** (04's Afterimage
    // against a Bash; the Legacy branches' door 13): none is left to spend, so none
    // is - and the withdrawal gives none back (`effects/miss.mjs#withdrawHit`).
  } else if (!(await spendTurnBudget(actor, shiftFree ? null : actionNow))) return undoBinds();
  if (foresightCommit !== null && !foresightCommitValid(actor, foresight, foresightCommit)) return null;
  if (spellstealCommit !== null && !spellstealUseValid(actor, item, spellstealCommit)) return null;

  // The budget spend awaits a document write. Recheck Health afterwards so a
  // concurrent hit cannot make the ray underpay or raise its user to 1 Health.
  // A failed effect after this point still used the attempted action.
  if (gadgetCost.cost > 0) {
    const currentCost = gadgetHealthCost(gadget, { tier: tierNow, health: actor.system?.health?.value ?? 0 });
    if (currentCost.refused) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Gadget.HealthRefused", { name: item.name }));
      return undoBinds();
    }
    const { payGadgetHealth } = await import('../effects/gadget-health-payment.mjs');
    await payGadgetHealth(actor, currentCost.cost);
  }

  // 2. Pay: judged in 1e, so nothing here can be half done. **A PRICE PAID ON THE TEST'S
  // SUCCESS** (02's Mass Mend, Shadow Word: Death, Divine Hymn and Curse: *make a Casting
  // Test. On success, spend N Mana*; D-775 built it for the Curse by its name, the B8a2 pass
  // for every row marked so - `rules/class-features.mjs#paysOnSuccess`): judged here like any
  // price - a Use that could not pay on its success is refused before anything is spent -
  // and taken off once the Test has succeeded.
  const successDue = paysOnSuccess(sys) ? payment.spent : 0;
  const spent = successDue ? 0 : payment.spent;
  if (sys.cost?.pool) {
    // **OFF THE POOL AS IT STANDS NOW** (the final review of D-768 to D-775;
    // `rollTest`'s rule since D-770): the pool was read for the judgement before
    // the budget's queued spend and the free shift's mark, so it is read again by
    // item and kind, a gain landing in between kept, and one that fell short pays
    // what it holds (`casting.mjs#payFromNow`).
    const poolNow = (actor.poolSnapshot?.() ?? []).find(p => p.itemId === pool.itemId && p.kind === pool.kind && p.name === pool.name) ?? pool;
    if (foresightCommit !== null && (poolNow.value < spent || !foresightCommitValid(actor, foresight, foresightCommit))) return null;
    if (spellstealCommit !== null && (poolNow.value < spent || !spellstealUseValid(actor, item, spellstealCommit))) return null;
    if (spent > 0) await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: payFromNow(poolNow.value, spent).value });
    if (spellstealCommit !== null && (!spellstealUseValid(actor, item, spellstealCommit)
      || (actor.poolSnapshot?.() ?? []).find(p => p.itemId === pool.itemId && p.kind === pool.kind)?.value !== poolNow.value - spent)) return null;
    if (foresightCommit !== null && (!foresightCommitValid(actor, foresight, foresightCommit)
      || (actor.poolSnapshot?.() ?? []).find(p => p.itemId === pool.itemId && p.kind === pool.kind)?.value !== poolNow.value - spent)) return null;
    // Hammer of Justice (04): 5 or more Zeal at once and 1 a rank returns (D-627).
    if (spent >= 5 && pool.name === "zeal") {
      const now = actor.poolSnapshot().find(p => p.itemId === pool.itemId && p.kind === pool.kind);
      const refunded = refundOnSpend(now, spent, actor.talentRanks?.("Hammer of Justice") ?? 0);
      if (now && refunded !== now.value) await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: refunded });
    }
  }
  // **WHAT D-779's ANSWERS DO ONCE THE USE IS PAID FOR**: Nature's Swiftness's use
  // struck, Nature's Grace's promise taken, Flametongue's Sustain written, Miracle's
  // promise laid, Lightwell's font placed.
  const swifted = Boolean(swiftLine) && await strikeTalentUse(actor, swiftLine.identifier);
  if (swifted) answerLines.push(game.i18n.format("AZEROTH.Cast.Swift.FeatureRow", { talent: swiftLine.name }));
  if (grace.taken.length) {
    await actor.setFlag("azeroth-rpg", NEXT_SPELL_FLAG, grace.kept);
    answerLines.push(...grace.taken.map(e => game.i18n.format("AZEROTH.Cast.NextSpellFeatureRow", { talent: e.name, n: e.amount })));
  }
  if (onUse?.sustain?.identifier === FLAMETONGUE.identifier) answerLines.push(await sustainFlametongue(actor, { name: item.name, poolItemId: pool?.itemId ?? null }));
  if (onUse?.miracle) {
    await layNextSpell(actor, [{ source: grantingTalent?.system?.identifier ?? "miracle", name: item.name, amount: 0, miracle: true, turn: false }]);
    answerLines.push(game.i18n.format("AZEROTH.Miracle.Laid", { name: actor.name, talent: item.name }));
  }
  let well = null;
  if (wellAt) {
    well = await placeLightwell(actor, { origin: wellAt, item, row: onUse.lightwell });
    answerLines.push(game.i18n.format(well ? "AZEROTH.Lightwell.Set" : "AZEROTH.Lightwell.NotSet", { name: item.name, n: well?.charges ?? 0, minutes: onUse.lightwell.minutes ?? LIGHTWELL.minutes }));
  }
  // **AND AT RANK 2 THE HAMMER FALLS** (04: *a spell or feature of yours that
  // cost 5 or more Zeal also applies Hammer of Justice to its target, or to one
  // target of your choice if it had several, costing no Mana and no action*;
  // D-772), once this Use's own card is posted.
  const hammerFalls = Boolean(sys.cost?.pool) && appliesHammerOfJustice({
    pool: pool?.name ?? null, spent, ranks: actor.talentRanks?.("Hammer of Justice") ?? 0
  });
  // 2a. The creature a dismissal named goes, now that the use is paid for
  // (Demonic Sacrifice; D-643, D-768).
  if (dismissPick) await release(actor, dismissPick.uuid);
  // 2b. **THE SHAPE, NOW THAT IT IS PAID FOR** (D-769): the one writer, which
  // replaces a shape already worn in one go and dresses every token. A form
  // taken for the first time is learned beside it (D-619), and Metamorphosis
  // costs its Fel point (02 §7: *Gain 1 Fel Corruption*), unresisted.
  // Only a shape WRITTEN learns its form and costs its Fel (the review): the
  // effect is the truth, and `takeShape` answers null where it could not be.
  const shaped = shapeTake ? await takeShape(actor, shapeTake) : null;
  if (shaped) {
    const learned = picks.filter(p => p.learn === true);
    if (learned.length) {
      const known = (item.system.known ?? []).map(k => ({ uuid: k.uuid, name: k.name }));
      await item.update({ "system.known": [...known, ...learned.map(p => ({ uuid: p.uuid, name: p.name }))] });
      for (const p of learned) ui.notifications?.info(game.i18n.format("AZEROTH.Feature.Learned", { name: actor.name, form: p.name }));
    }
    if (shapeTake.kind === "metamorphosis") {
      await accrueCorruption(actor, { ...METAMORPHOSIS.corruption, occasion: game.i18n.format("AZEROTH.Occasion.Metamorphosis", { name: item.name }) });
    }
    // **04's BRONZE DRAKE** (*The turn you take the form, you gain a Half-Action*; stage 3B):
    // once the form is written, through the combatant's own queued door, and said on the card.
    if (shapeTake.kind === "drake") {
      const { bronzeDrakeHalf } = await import("../effects/chromatic-flights.mjs");
      const halfLine = await bronzeDrakeHalf({ actor, form: actor.shape?.forms?.[0]?.name ?? null });
      if (halfLine) answerLines.push(halfLine);
    }
  }
  // Evocation: half the total back, rounded down (02 \u00a77).
  let restored = null;
  if (sys.restore === "halfMana") {
    const mana = (actor.system.powers ?? []).find(p => p.name === "mana") ?? null;
    if (mana) {
      restored = Math.floor(mana.max / 2);
      await actor.updatePool({ itemId: mana.itemId, kind: "power", value: Math.min(mana.max, mana.value + restored) });
    }
  }

  // **A TALENT'S DAMAGE BUFF, SWITCHED ON BY THIS USE** (04, D-711 phase 2).
  // Seal of Command: *until the encounter ends, all Holy damage you deal adds 1
  // damage per rank*; Arcane Power: *until the end of your next turn*. It is an
  // owner-side Active Effect on `system.damageBonus`, in the FINAL phase
  // because that map is DERIVED and an `initial` change would be written over
  // by `prepareDerivedData` (CLAUDE.md §15). The encounter one is lifted by
  // `_leaveFight`; the turn one expires through core (D-628).
  //
  // **A second press replaces the first** rather than stacking, which is the
  // same rule `useSignature` keeps for a Signature's own effect.
  let buffed = null;
  // The Mountain Wakes' Armor Points and Ward ride the same encounter effect (door 25).
  const buff = withSpiritArmor(damageBuffFor(talentRow, rank), spiritsPlan, actor);
  // **AND THE RIDERS IT MAKES CHEAPER, ON THE SAME EFFECT** (04's Berserk,
  // D-771): *your attacks in a Shapeshift form cost 1 less Ferocity, to a
  // minimum of 1*. The talent's discount rider is switched on by this effect's
  // flag (`rules/riders.mjs#riderDiscountsOf`) for exactly its span, so the
  // damage and the discount cannot outlive each other.
  const discounting = talentRow?.rider?.discount && grantingTalent?.system?.identifier
    ? { [RIDER_DISCOUNT_FLAG]: { identifier: grantingTalent.system.identifier } }
    : {};
  if (buff) {
    const stale = actor.effects.filter(e => e.getFlag("azeroth-rpg", "talentBuff") === item.name).map(e => e.id);
    if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
    // Out of a fight *until the end of your next turn* is a round of the world's
    // clock (D-778's reading for O-161): it stood with no span at all, and so for good.
    // And *until your next turn* (04's Bladestorm's Armor Points; the Legacy branches' B6).
    const timing = buff.until === "endOfNextTurn" ? untilEndOfNextTurnOrRound(actor)
      : (buff.until === "userTurnStart" ? untilNextTurnOrRound(actor) : null);
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: item.name,
      img: item.img,
      origin: actor.uuid,
      description: await enrich(sys.description ?? "", { relativeTo: item }),
      system: { changes: buff.changes },
      ...(timing ?? {}),
      flags: { "azeroth-rpg": { talentBuff: item.name, until: buff.until, ...discounting } }
    }]);
    buffed = buff.amount;
  }

  // **WHAT THE TALENT'S USE DOES BEYOND ITS DESCRIPTOR** (D-771), now that it
  // is paid for. Each was judged at step 1. D-779's own lines first.
  const usedLines = [...answerLines];
  if (gadgetCost.cost > 0) {
    usedLines.push(game.i18n.format("AZEROTH.Gadget.HealthPaid", { name: item.name, n: gadgetCost.cost }));
  }
  // **WHAT THE CHAMPION'S USES DO, NOW THAT THEY ARE PAID FOR** (02 §7; stage 2B): Hardened
  // Scales' Ward laid, Draconic Leap's Entangled ended, the leap and its Boon, and the
  // school Scales of the Flight names. A class feature's own - never a talent's grant.
  if (classUse || sys.choice === "flightSchools") usedLines.push(...(await landChampionUse({ actor, item, sys, onUse, chosen })));
  // Survival Instincts: *reduce the damage of one attack against you by half,
  // rounded down* - the one-attack mark a Block and a Parry ride, spent by the
  // next attack that lands (`AzerothActor#applyDamage`) - *and gain 1 Ferocity
  // per rank*.
  if (onUse?.mitigate === "halve") {
    await actor.setFlag("azeroth-rpg", "mitigate", { name: item.name, halve: true, amount: null });
    usedLines.push(game.i18n.format("AZEROTH.Signature.WillHalve", { name: item.name }));
  }
  // **THE LEGACY BRANCHES' USES, NOW THAT THEY ARE PAID FOR** (B1). Each was judged
  // before the payment.
  // Afterimage (door 13): the blow's own one-attack mark, negating - so its card's
  // Apply deals nothing - the card's row written as a miss, and everything the hit
  // laid on the user withdrawn through the Parry's own door.
  if (negating) {
    const mark = { name: item.name, halve: false, amount: null, negate: true, reaction: "negate", messageId: negating.messageId };
    await actor.setFlag("azeroth-rpg", "mitigate", mark);
    await actor.setFlag("azeroth-rpg", "reacted", { messageId: negating.messageId, reaction: "negate" });
    await annotateMitigation({ messageId: negating.messageId, index: negating.index, mark, reaction: "negate" });
    const undone = await withdrawHit(actor, { messageId: negating.messageId, index: negating.index, answeredWithLost: negating.answeredWithLost });
    // **THE HOLD, FOR THE CARD** (the Legacy branches' door 2): the card turned aside and
    // the striker whose blow went through, off that card's own record (D-724).
    holdMade = {
      kind: "negate", messageId: negating.messageId, index: negating.index,
      striker: tokenRef(game.messages?.get(negating.messageId)?.flags?.["azeroth-rpg"]?.source ?? null)
    };
    usedLines.push(game.i18n.format("AZEROTH.Miss.Negated", { name: actor.name, feature: item.name }));
    const more = withdrawnWords(actor.name, undone);
    if (more) usedLines.push(more);
  }
  // Wind Walk and Bladestorm (door 14): *No creature may take a Reaction against you
  // until your next turn* - a state on the user every Reaction door reads, out of a
  // fight a round of the world's clock (D-778).
  if (legacy.unanswered) {
    const span = legacy.unanswered.until === "userTurnEnd" ? untilEndOfNextTurnOrRound(actor) : untilNextTurnOrRound(actor);
    const laid = await layState(actor, {
      flag: UNANSWERED_FLAG, data: { source: item.name }, name: item.name, img: item.img, span,
      sameAs: raw => raw?.source === item.name
    });
    if (laid) usedLines.push(game.i18n.format("AZEROTH.Unanswered.Line", { name: actor.name, feature: item.name }));
  }
  // The Challenge (door 18): *Until the end of your next turn it takes a Bane on
  // attacks against anybody but you ... Naming another creature ends it on the
  // first* - the Bane laid as Taunt's is (D-772), the mark an effect on the user
  // spanned to the end of its next turn, and the turn's one naming marked.
  if (marking?.kind === "challenge") {
    const victim = targetActorOf(marking.target);
    const ownTokenOfMark = actor.getActiveTokens?.(true)?.[0] ?? null;
    if (marking.replaced) {
      await endBane({ victim: marking.replacedActor, source: item.name, by: actor });
      usedLines.push(game.i18n.format("AZEROTH.Mark.ChallengeEnded", { target: marking.replaced.name }));
    }
    // Named again, the creature's Bane is laid afresh rather than doubled.
    if (!marking.replaced) await endBane({ victim, source: item.name, by: actor });
    const span = untilEndOfNextTurnOrRound(actor);
    await layBane({
      victim, kind: "attack", banes: 1, source: item.name, by: actor, lasting: true,
      except: { actorId: actor.id, tokenId: ownTokenOfMark?.id ?? null }, span
    });
    const named = markOf(marking.target);
    // The feature that named it, beside the creature (the Legacy branches' door 2): the
    // animation layer finds the mark's row by it. `cleanMark` reads past it.
    if (named) named.source = item.name;
    await layState(actor, {
      flag: CHALLENGE_FLAG, data: named, img: item.img, span,
      name: game.i18n.format("AZEROTH.Mark.EffectName", { target: named?.name ?? "" })
    });
    if (marking.combatant?.isOwner) await marking.combatant.markRoundOnce(CHALLENGE_TURN_MARK);
    usedLines.push(game.i18n.format("AZEROTH.Mark.Challenged", { name: actor.name, target: named?.name ?? "" }));
  }
  // The Long Watch (door 18): the mark on the user's own actor, seen by its owners
  // alone (the lead: *"Yes"*), and where the creature is now.
  if (marking?.kind === "watch") {
    const named = markOf(marking.target);
    // The feature that laid it, as the Challenge's mark carries it (door 2).
    if (named) named.source = item.name;
    await actor.setFlag("azeroth-rpg", WATCH_FLAG, named);
    if (marking.replaced) usedLines.push(game.i18n.format("AZEROTH.Mark.WatchEnded", { name: actor.name, target: marking.replaced.name }));
    usedLines.push(game.i18n.format("AZEROTH.Mark.Watched", { name: actor.name, target: named?.name ?? "" }), watchBearingLine(actor, named));
  }
  // None Escape (door 24; the lead: *"A space you choose"*): each creature displaced to
  // the space the user chose for it - metered at nothing and provoking nothing, here or
  // on the GM's client as a `pull` the GM judges again off this feature (the B2 review,
  // item h) - and it stays Entangled. One left in its own space is said so.
  for (const p of pullPlan) {
    const words = { feet: legacy.pullEntangled.within, holder: p.holderName, source: item.name };
    if (p.stays) {
      usedLines.push(pulledWords({ stays: true, name: p.name }, words));
      continue;
    }
    const moved = await stepTo({ token: p.token.document, to: p.to, by: actor, move: { kind: "pull", itemUuid: item.uuid } });
    usedLines.push(pulledWords(moved, words));
    // A pulled creature's move is a step the card records too (door 2).
    if (moved.step) stepsMade.push(moved.step);
  }
  // A condition the Use lays on the user (04's Ancestral Spirit, *You gain
  // **Fatigued***; door 26), through the one landing door.
  if (legacy.self && AZEROTH.conditions?.[legacy.self.condition]) {
    const span = legacy.self.until === "endOfNextTurn" ? untilEndOfNextTurnOrRound(actor)
      : legacy.self.until === "nextTurn" ? untilNextTurnOrRound(actor)
        : legacy.self.until === "minute" ? minuteSpan(actor) : null;
    const landed = await inflictCondition({ victim: actor, id: legacy.self.condition, value: legacy.self.value, by: actor, name: actor.name, until: span });
    if (landed.landed) {
      usedLines.push(game.i18n.format("AZEROTH.Feature.SelfCondition", {
        name: actor.name, feature: item.name,
        condition: game.i18n.localize(AZEROTH.conditions[legacy.self.condition]) + (landed.value ? ` ${landed.value}` : "")
      }));
    }
  }
  // **THE LEGACY BRANCHES' B3 USES, NOW THAT THEY ARE PAID FOR** (door 25), each judged
  // in `judgeSpiritUses` before the payment.
  usedLines.push(...(await writeSpiritUses(spiritsPlan, { actor, item, poolItemId: pool?.itemId ?? null })));
  // **A CREATURE CALLED BACK STANDS** (04's Ancestral Spirit; door 2): the token the
  // Use named, as `judgeSpiritUses` named it - the first target that is a creature.
  // **AND EVERY DYING FRIEND ANCESTOR'S HAND STOOD** (the Legacy branches' B6), each on its token.
  for (const r of spiritsPlan?.lift?.risen ?? []) noteRisen(r);
  if (spiritsPlan?.revive?.risen) {
    const called = tokenRef(list.filter(t => targetActorOf(t))[0] ?? null);
    if (called) noteRisen({ sceneId: called.sceneId, tokenIds: [called.tokenId] });
  }
  if (onUse?.gain?.pool) {
    const into = (actor.poolSnapshot?.() ?? []).find(p => p.name === onUse.gain.pool) ?? null;
    // *regain Mana equal to your tier* (04's Shamanistic Rage, D-774): the scope
    // carries the tier, which read 1 here before.
    const amount = Math.max(0, Math.trunc(Number(evaluateAmount(String(onUse.gain.amount ?? "rank"), { rank, tier: tierNow }))) || 0);
    if (into && amount > 0) {
      const value = Math.min(into.max, into.value + amount);
      if (value > into.value) await actor.updatePool({ itemId: into.itemId, kind: into.kind, value });
      usedLines.push(game.i18n.format("AZEROTH.Card.Gained", { amount: value - into.value, pool: game.i18n.localize(AZEROTH.poolTypes[into.name] ?? into.name) }));
    }
  }
  // Swiftmend: *end one of your ongoing healing effects on a friendly target.
  // That target immediately restores Health equal to twice your tier plus your
  // rank* - ended and healed at once, on the GM's client where the druid does
  // not own the target. The card's heal is what landed, never a button.
  let swiftmended = null;
  if (endsOn) {
    const amount = sys.heal ? Math.max(0, Math.trunc(Number(evaluateAmount(sys.heal, { tier: actor.system.tier ?? 1, level: actor.system.level ?? 1, sl: 0, rank }))) || 0) : 0;
    swiftmended = endsOn.target.uuid === actor.uuid || allyOf(actor, endsOn.target)
      ? await endTickAndHeal({ target: endsOn.target, from: actor, kind: "heal", heal: amount, effectId: endsOn.effect.id }) : null;
    usedLines.push(swiftmended?.ended
      ? game.i18n.format("AZEROTH.Swiftmend.Done", { name: endsOn.target.name, effect: swiftmended.ended.name, healed: swiftmended.healed })
      : game.i18n.format("AZEROTH.Swiftmend.NotEnded", { name: endsOn.target.name }));
  }
  // Symbiosis: *name a friendly target*, the bond until the next Long Rest.
  if (partner) {
    const named = await nameSymbiosisPartner(actor, partner);
    usedLines.push(named ? game.i18n.format("AZEROTH.Symbiosis.Line", { partner: partner.name })
      : game.i18n.localize("AZEROTH.IceBlock.Protected"));
  }
  // **WHAT D-772's USES DO, NOW THAT THEY ARE PAID FOR.** Each was judged at
  // step 1.
  // Divine Favor's free use, struck.
  if (favored) {
    await favorCounter.update({ "system.uses.value": Math.max(0, (favorCounter.system?.uses?.value ?? 1) - 1) });
    usedLines.push(game.i18n.format("AZEROTH.DivineFavor.Line", { talent: favor.name, name: item.name }));
  }
  // Beacon: *Choose a friendly target you know*, until the next Long Rest.
  if (beaconPartner) {
    const named = await nameBeacon(actor, beaconPartner);
    usedLines.push(named ? game.i18n.format("AZEROTH.Beacon.Line", { partner: beaconPartner.name })
      : game.i18n.localize("AZEROTH.IceBlock.Protected"));
  }
  // Precise Strike: *Your next attack this turn ignores 1 Armor Point per rank*. **And a
  // promise a rank makes** (04's Wind Walk at rank 2: *that attack adds your Dexterity
  // modifier to its damage*; the Legacy branches' B6): read at the rank, and nothing laid
  // or said where it promises nothing - a Dexterity of +0 adds none.
  const promise = grantingTalent ? onUseNextAttack(onUse, { identifier: grantingTalent.system?.identifier, name: grantingTalent.name }, { rank, tier: actor.system.tier ?? 1, scope: abilityScope(actor.system) }) : null;
  // **04's WHISPER OF MADNESS** (*As a Half-Action, gain 4 Void Corruption*; the lead: *"It
  // has the same effect but give 4 Void Corruption"* and *"yes"* to the Void landing even
  // when resisted; stage 3A): after the Half-Action, whatever the Test comes to, through the
  // one unresisted Corruption door.
  if (onUse?.voidGain > 0 && actor.type === "character") {
    const gained = await accrueCorruption(actor, { track: "void", points: Math.trunc(Number(onUse.voidGain)),
      occasion: game.i18n.format("AZEROTH.VoidSpend.Gain", { talent: grantingTalent?.name ?? item.name }) });
    usedLines.push(game.i18n.format(gained ? "AZEROTH.VoidSpend.Gained" : "AZEROTH.VoidSpend.GainedNone", { name: actor.name, n: onUse.voidGain, talent: grantingTalent?.name ?? item.name }));
  }
  // **04's COURT GUISE** (stage 3A): the studied humanoid's face taken, once the use is struck.
  if (champ?.courtGuise) {
    const { takeCourtGuise } = await import("../effects/chromatic-talents.mjs");
    usedLines.push(await takeCourtGuise({ actor, studied: champ.courtGuise.studied, studiedToken: champ.courtGuise.token, item }));
  }
  // **THE SPELL-WEAVER'S AND THE TIMEWALKER'S USES, NOW THAT THEY ARE PAID FOR** (stage 3B):
  // Font of Magic's Rage paid and its Mana given, Spellbreak's Sustain ended and its Rage,
  // Hasten's Half-Action laid, Rewind's heal. Each was judged before the payment.
  usedLines.push(...(await landChampionTalent({ actor, item, champ, rank })));
  if (promise && (promise.boons > 0 || promise.penetration > 0 || promise.damage > 0 || promise.unanswerable === true)) {
    const grant = promise;
    const laid = grant ? await layNextAttack(actor, [grant], { quiet: true }) : [];
    usedLines.push(laid.length
      ? game.i18n.format(`AZEROTH.NextAttack.Laid.${grant.lasts}`, { name: actor.name, talent: grantingTalent.name })
      : game.i18n.format("AZEROTH.NextAttack.NoFight", { name: actor.name, talent: grantingTalent.name }));
  }
  // Taunt's and Judgement's Bane on attacks against anyone but the user, and
  // Blessing's Boon, on the one creature targeted.
  if (bellowJournal) {
    bellowPaidUses = await payBellowUse(actor, item, bellowCommit, bellowJournal);
    if (!bellowPaidUses) return null;
  }
  for (const laysOn of lays.bane ? baneTargets : []) {
    if (bellowJournal && !bellowCommitValid(actor, item, bellowCommit)) return null;
    const own = actor.getActiveTokens?.(true)?.[0] ?? null;
    // **04's FEINT** (*The target's next attack against you takes a Bane per
    // rank*; D-773): a COUNT, spent by the target's next attack AGAINST the user
    // alone, its backstop the target's own next turn (`effects/banes.mjs`);
    // Taunt's and Judgement's last for their span.
    const only = lays.bane.only ? { actorId: actor.id, tokenId: own?.id ?? null } : null;
    // Out of a fight the span is the world's clock (D-778, O-161): Judgement's *one
    // round per rank* N rounds of it, Taunt's *until the end of your next turn* one,
    // and Feint's count its backstop one round where the target has no turn either.
    const nextTest = lays.bane.until === "next";
    const span = nextTest ? {} : only ? (laysOn.actor.activeFight?.() ? null : clockRounds(1)) : (lays.bane.rounds > 0
      ? roundsOrClock(actor, lays.bane.rounds)
      : untilEndOfNextTurnOrRound(actor));
    const done = await layBane({
      victim: laysOn.actor, kind: lays.bane.kind, banes: lays.bane.banes, source: item.name, by: actor, lasting: !only && !nextTest,
      requiresHearing: onUse?.laysBane?.hearing === true,
      bellowDelivery: laysOn.bellowDelivery ?? null,
      except: lays.bane.except ? { actorId: actor.id, tokenId: own?.id ?? null } : null, only, span
    });
    if (laysOn.bellowDelivery) {
      const result = bellowDeliveryResult({ actorUuid: laysOn.actor.uuid, name: laysOn.actor.name,
        delivery: laysOn.bellowDelivery, result: done });
      bellowResults.push(result);
      await bellowJournal.record(result);
      usedLines.push(game.i18n.format(result.state === 'confirmed' ? 'AZEROTH.Laid.NextTestBaneLine' : 'AZEROTH.Laid.BaneUnconfirmed',
        { target: laysOn.actor.name, n: lays.bane.banes, name: item.name }));
    } else if (done) usedLines.push(game.i18n.format(only ? "AZEROTH.Feint.Line" : nextTest ? "AZEROTH.Laid.NextTestBaneLine" : "AZEROTH.Laid.BaneLine", { target: laysOn.actor.name, n: lays.bane.banes, name: actor.name }));
  }
  if (laysOn && lays.boon && boonWhere.encounter) {
    // **FOR THE ENCOUNTER** (02's Berserking: *Your attacks gain a Boon until the end of the
    // encounter*; the B8a2 pass): lasting - every attack takes it and none spends it - and
    // carried on the effect `_leaveFight` lifts at the fight's end (`encounter`). Out of a
    // fight it stands until the next one ends, as Seal of Command's encounter buff does.
    const done = await layBoon({ victim: laysOn.actor, kind: lays.boon.kinds === "all" ? "all" : lays.boon.kinds, boons: lays.boon.boons, source: item.name, by: actor, lasting: true, encounter: true });
    if (done) {
      usedLines.push(game.i18n.format("AZEROTH.Blessing.LineEncounter", {
        target: laysOn.actor.name, n: lays.boon.boons,
        kind: game.i18n.localize(lays.boon.kinds === "all" ? "AZEROTH.Blessing.EveryTest" : (AZEROTH.testKinds[lays.boon.kinds] ?? lays.boon.kinds))
      }));
    }
  } else if (laysOn && lays.boon) {
    const fightNowForBoon = actor.activeFight?.() ?? null;
    // *Every Test they make this round* (rank 2): a span to the round's end,
    // keyed on the blessed creature's own combatant; out of a fight there is no
    // round, and it is the next Test as at rank 1 (MY READING, for the lead).
    const victimCombatant = fightNowForBoon ? (fightNowForBoon.getCombatantsByActor(laysOn.actor)?.[0] ?? fightNowForBoon.getCombatantsByActor(actor)?.[0] ?? null) : null;
    const lasting = lays.boon.until === "round" && Boolean(victimCombatant);
    const span = lasting ? {
      duration: { value: 0, units: "rounds", expiry: "roundEnd" },
      start: { combat: fightNowForBoon.id, combatant: victimCombatant.id, round: fightNowForBoon.round, turn: fightNowForBoon.turn, time: game.time.worldTime }
    } : null;
    const done = await layBoon({ victim: laysOn.actor, kind: lays.boon.kinds === "all" ? "all" : lays.boon.kinds, boons: lays.boon.boons, source: item.name, by: actor, lasting, span });
    if (done) usedLines.push(game.i18n.format(lasting ? "AZEROTH.Blessing.LineRound" : "AZEROTH.Blessing.LineNext", { target: laysOn.actor.name, n: lays.boon.boons }));
  }
  // Blessed Plate's and Warded Plate's school, named at the Long Rest.
  if (onUse?.plate && grantingTalent && chosen?.key && AZEROTH.schools[chosen.key]) {
    const named = { ...(actor.getFlag("azeroth-rpg", PLATE_FLAG) ?? {}), [grantingTalent.system?.identifier]: chosen.key };
    await actor.setFlag("azeroth-rpg", PLATE_FLAG, named);
    usedLines.push(game.i18n.format("AZEROTH.Plate.Line", { talent: grantingTalent.name, school: game.i18n.localize(AZEROTH.schools[chosen.key]) }));
  }
  // Consecrated: the weapon carries Blessed *until your next use of this
  // feature* - so a weapon an earlier Use enchanted gives it up now.
  if (consecrating) {
    for (const other of actor.items.filter(i => i.type === "weapon" && i.id !== consecrating.id && i.getFlag("azeroth-rpg", CONSECRATED_FLAG))) {
      await other.unsetFlag("azeroth-rpg", CONSECRATED_FLAG);
    }
    await consecrating.setFlag("azeroth-rpg", CONSECRATED_FLAG, { by: actor.uuid });
    usedLines.push(game.i18n.format("AZEROTH.Consecrated.Line", {
      weapon: consecrating.name, trait: consecratedTrait({ sanctified: actor.talentRanks?.("Sanctified Weapon") ?? 0 })
    }));
  }

  // **WHAT D-773's USES DO, NOW THAT THEY ARE PAID FOR.** Each was judged at
  // step 1.
  // Chimaera Shot: *If more than four targets are chosen, 2 Focus returns to you*.
  if (barrage?.refund) {
    const back = await restoreMana(actor, poolFor(actor, barrage.refund.pool, item.getFlag("azeroth-rpg", "feature")?.classId ?? null), barrage.refund.amount);
    if (back > 0) usedLines.push(game.i18n.format("AZEROTH.Barrage.Refund", { talent: barrageLimits.by.join(", "), n: back, pool: game.i18n.localize(AZEROTH.poolTypes[barrage.refund.pool] ?? barrage.refund.pool) }));
  }
  // Deterrence: *Attacks against you take a Bane per rank until the start of
  // your next turn* - a flag on the user's own effect, read by the attacker's
  // dialog off the target (a Bane is dice, never a change).
  if (rr.deters) {
    const laid = await layState(actor, {
      flag: DETERRED_FLAG, data: { banes: rr.deters.banes, source: item.name }, img: item.img, span: untilNextTurnOrRound(actor),
      name: game.i18n.format("AZEROTH.Deterrence.Name", { name: item.name, n: rr.deters.banes })
    });
    if (laid) usedLines.push(game.i18n.format("AZEROTH.Deterrence.Line", { name: actor.name, n: rr.deters.banes }));
  }
  // 04's Prismatic Ward: *You gain Ward 2 against every school until the end of
  // your next turn* (D-775) - Cloak's door over every school, its own span, and
  // replacing only its own.
  if (rr.ward?.everySchool) {
    const schools = Object.keys(AZEROTH.schools ?? {});
    const ward = { amount: rr.ward.amount, schools };
    const laid = await layState(actor, {
      flag: CLOAK_FLAG, data: { school: null, schools, amount: rr.ward.amount, source: item.name }, img: item.img,
      span: rr.ward.until === "userTurnEnd" ? untilEndOfNextTurnOrRound(actor) : untilNextTurnOrRound(actor),
      changes: schools.flatMap(s => tickWardChanges(ward, s)), sameAs: raw => raw.source === item.name,
      name: game.i18n.format("AZEROTH.PrismaticWard.Name", { name: item.name, n: rr.ward.amount })
    });
    if (laid) usedLines.push(game.i18n.format("AZEROTH.PrismaticWard.Line", { name: actor.name, n: rr.ward.amount }));
  }
  // Cloak of Shadows: *You gain Ward 1 per rank against one school until your
  // next turn* - the one Ward change a heal over time's Ward lays (D-771).
  if (rr.ward && !rr.ward.everySchool && AZEROTH.schools?.[chosen?.key ?? ""]) {
    const school = game.i18n.localize(AZEROTH.schools[chosen.key]);
    const laid = await layState(actor, {
      flag: CLOAK_FLAG, data: { school: chosen.key, amount: rr.ward.amount, source: item.name }, img: item.img, span: untilNextTurnOrRound(actor),
      changes: tickWardChanges({ amount: rr.ward.amount, schools: [chosen.key] }, chosen.key), sameAs: raw => raw.source === item.name,
      name: game.i18n.format("AZEROTH.Cloak.Name", { name: item.name, n: rr.ward.amount, school })
    });
    if (laid) usedLines.push(game.i18n.format("AZEROTH.Cloak.Line", { name: actor.name, n: rr.ward.amount, school }));
  }
  // Shadow Dance: *count as hidden until the end of your next turn even while
  // observed* - the effect carries core's hidden status, so the hide ends with it.
  if (rr.hide) {
    const laid = await layShadowDance(actor, { source: item.name, span: untilEndOfNextTurnOrRound(actor) });
    if (laid) usedLines.push(game.i18n.format("AZEROTH.ShadowDance.Line", { name: actor.name }));
  }
  // Overkill: *your Opening class feature holds until the end of your next
  // turn* - over the creatures in the fight not yet acted (MY READING).
  if (rr.holdOpening) {
    const fightOfUse = actor.activeFight?.() ?? null;
    const held = (fightOfUse?.combatants ?? [])
      .filter(c => c.actor && c.actor.id !== actor.id && !c.getFlag("azeroth-rpg", "acted"))
      .map(c => ({ actorId: c.actor.id, tokenId: c.tokenId ?? null, name: c.name ?? c.actor.name }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.tokenId).localeCompare(String(b.tokenId)));
    const laid = await holdOpening(actor, { targets: held, source: item.name, span: untilEndOfNextTurnOrRound(actor) });
    if (laid) usedLines.push(game.i18n.format("AZEROTH.Opening.HeldLine", { names: held.map(t => t.name).join(", ") || "-" }));
  }
  // Death Mark: *name a target you can see. Until your next Short or Long Rest*
  // - the actor's flag, cleared by either rest.
  if (deathMarkOn) {
    const victim = targetActorOf(deathMarkOn);
    await actor.setFlag("azeroth-rpg", DEATH_MARK_FLAG, {
      actorId: victim?.id ?? deathMarkOn.actorId ?? null, tokenId: deathMarkOn.tokenId ?? null,
      name: deathMarkOn.name ?? victim?.name ?? "", source: item.name
    });
    usedLines.push(game.i18n.format("AZEROTH.DeathMark.Line", { name: deathMarkOn.name ?? victim?.name ?? "" }));
  }
  // Adrenaline's once a round per rank, marked now that it is paid.
  if (perRoundMark && perRoundCombatant?.isOwner) await perRoundCombatant.markRoundOnce(perRoundMark);
  // Preparation: *make a Stealth Test, opposed by Perception. On a success you
  // gain 1 Combo Point per rank* - Hide's own Test (D-717), its DC 05's opposed one.
  if (rr.skillTest?.skill === "stealth") {
    const { stealthTestSpec } = await import("../applications/combat-actions.mjs");
    const { rollWithDialog } = await import("../applications/actions.mjs");
    const tested = await rollWithDialog(actor, stealthTestSpec(actor));
    const won = tested?.rolls?.[0]?.outcome?.success === true;
    const into = won && rr.skillTest.gain ? ((actor.poolSnapshot?.() ?? []).find(p => p.name === rr.skillTest.gain.pool) ?? null) : null;
    if (into) {
      const value = Math.min(into.max, into.value + rr.skillTest.gain.amount);
      if (value > into.value) await actor.updatePool({ itemId: into.itemId, kind: into.kind, value });
      usedLines.push(game.i18n.format("AZEROTH.Card.Gained", { amount: value - into.value, pool: game.i18n.localize(AZEROTH.poolTypes[into.name] ?? into.name) }));
    } else if (tested) usedLines.push(game.i18n.format("AZEROTH.Preparation.Failed", { name: actor.name }));
  }

  // **WHAT THE PRIEST'S AND THE SHAMAN'S USES DO, NOW THAT THEY ARE PAID FOR**
  // (D-774). Each was judged at step 1.
  // Inner Focus's use, struck.
  if (freeMana && await strikeTalentUse(actor, freeLine.identifier)) {
    usedLines.push(game.i18n.format("AZEROTH.TalentLine.FreeLine", { talent: freeLine.name, name: item.name }));
  }
  // 02's Ward on each creature named, until the priest's next turn starts - or out
  // of a fight a round of the world's clock (D-778).
  if (isWard) {
    const span = untilNextTurnOrRound(actor);
    const description = await enrich(sys.description ?? "", { relativeTo: item });
    for (const t of wardOn) {
      const done = await layWard({
        priest: actor, target: targetActorOf(t), name: t?.name ?? "", span, img: item.img, description,
        // A Ward pressed from the incoming card answers its blow (D-779).
        answers: foresight && wardOn.length === 1 ? foresight : null,
        commit: foresightCommit,
        ward: {
          schools: wardSchoolsNow, amount: WARD_BASE.amount, reduction: wardOpts.reduction, undispellable: wardOpts.undispellable, absorb: wardOpts.absorb, atone: wardOpts.atone,
          undispellableBy: (wardOpts.by?.undispellable ?? []).join(", ")
        }
      });
      usedLines.push(game.i18n.format(done.landed ? "AZEROTH.Ward.Laid" : "AZEROTH.Ward.NotLaid", { name: done.name || t?.name || "", n: WARD_BASE.amount }));
      if (foresight && done.landed) usedLines.push(game.i18n.format(done.answered > 0 ? "AZEROTH.Foresight.Answered" : "AZEROTH.Foresight.NotAnswered", { name: done.name || t?.name || "", n: done.answered ?? 0 }));
    }
  }
  // Silence: A1's Silenced on the creature named, until the priest's next turn starts.
  if (ps.inflicts && aimedAtOne) {
    const landed = await inflictCondition({ victim: targetActorOf(aimedAtOne), id: ps.inflicts.condition, by: actor, name: aimedAtOne.name ?? "", until: ps.inflicts.until === "userTurnStart" ? untilNextTurnOrRound(actor) : null });
    usedLines.push(landedText(landed));
  }
  // Ascendance and Doom Winds: the state, until the user's next turn starts.
  if (ps.ascend) {
    const laid = await layState(actor, {
      flag: ASCEND_FLAG, data: { schools: ps.ascend.schools, sl: ps.ascend.sl, source: item.name }, img: item.img, span: untilNextTurnOrRound(actor),
      name: game.i18n.format("AZEROTH.Ascendance.Name", { name: item.name })
    });
    if (laid) usedLines.push(game.i18n.format("AZEROTH.Ascendance.Line", { name: actor.name }));
  }
  if (ps.doomWinds) {
    const laid = await layState(actor, {
      flag: DOOM_WINDS_FLAG, data: { source: item.name }, img: item.img, span: untilNextTurnOrRound(actor),
      name: game.i18n.format("AZEROTH.DoomWinds.Name", { name: item.name })
    });
    if (laid) usedLines.push(game.i18n.format("AZEROTH.DoomWinds.Line", { name: actor.name }));
  }
  // Spirit Walk: Disengaging for the turn, and the ground ignored with it - one
  // effect, ended with the turn's own Disengaging (`_onEndTurn`); out of a fight,
  // where no turn ends it, a round of the world's clock (D-778).
  if (ps.walk) {
    const effect = await applyCondition(actor, "disengaging", actor.activeFight?.() ? {} : { until: clockRounds(1) });
    if (effect) await effect.update({ [`flags.azeroth-rpg.${IGNORES_GROUND_FLAG}`]: true, [`flags.azeroth-rpg.${SPIRIT_WALK_FLAG}`]: { source: item.name } });
    usedLines.push(game.i18n.format("AZEROTH.SpiritWalk.Line", { name: actor.name }));
  }
  // Hymn of Hope: every ally within reach regains the Mana, the priest included.
  if (ps.restores) {
    // The allies measured with the refusals, before the payment.
    if (!hymnNear.length) usedLines.push(game.i18n.format("AZEROTH.Hymn.NoneMeasured", { feet: ps.restores.feet }));
    for (const r of hymnNear) {
      const gained = await giveMana({ giver: actor, recipient: r.actor, amount: ps.restores.amount });
      if (gained > 0) usedLines.push(game.i18n.format("AZEROTH.Hymn.Line", { name: r.token.name ?? r.actor.name, n: gained }));
    }
  }
  // **04's LAST STAND** (*spend 10 Rage for temporary Health equal to twice your
  // tier per rank. It lasts until the encounter ends*; D-777): on the warrior,
  // through 05's law - a larger grant already held is kept, and said.
  const lastStand = tempHealthOnUse(onUse, { rank, tier: tierNow });
  if (lastStand) {
    const done = await actor.grantTemporaryHealth(lastStand.amount, { source: item.name, span: lastStand.span });
    usedLines.push(game.i18n.format(done.landed ? "AZEROTH.Temporary.Line" : "AZEROTH.Temporary.LineKept", { name: actor.name, n: lastStand.amount, held: done.temp }));
  }
  // **02's RALLYING CRY** (D-777): every ally measured before the payment, the
  // warrior's level each, through 05's law.
  if (rallying) {
    if (!rallyNear.length) usedLines.push(game.i18n.format("AZEROTH.RallyingCry.NoneMeasured", { feet: RALLYING_CRY.feet }));
    for (const r of rallyNear) {
      const done = await rallyAlly({ giver: actor, recipient: r.actor });
      usedLines.push(game.i18n.format(done.landed ? "AZEROTH.Temporary.Line" : "AZEROTH.Temporary.LineKept", { name: r.token?.name ?? r.actor.name, n: done.landed ? done.temp : (actor.system?.level ?? 1), held: done.temp }));
    }
  }
  // **04's SPIRIT LINK TOTEM** (D-777): the totem named, and the link on the
  // shaman, which the damage door reads while that totem stands. *While that
  // totem stands* is the token standing now: the link names it, so the same
  // totem planted again later is a new standing and carries no link (MY
  // READING, for the lead).
  if (linkTotem) {
    const linkToken = linkTotem.getActiveTokens?.(true)?.[0]?.document?.uuid ?? null;
    await actor.setFlag("azeroth-rpg", SPIRIT_LINK_FLAG, { totem: linkTotem.uuid, token: linkToken, name: linkTotem.name, source: item.name });
    usedLines.push(game.i18n.format("AZEROTH.SpiritLink.Line", { totem: linkTotem.name, feet: spiritLinkFor(actor.takenTalents())?.feet ?? 0 }));
  }
  // Cloudburst: the next healing spell or feature takes the promise.
  if (ps.cloudburst) {
    await actor.setFlag("azeroth-rpg", CLOUDBURST_FLAG, { feet: ps.cloudburst.feet, source: item.name });
    usedLines.push(game.i18n.format("AZEROTH.Cloudburst.Laid", { name: actor.name, feet: ps.cloudburst.feet }));
  }
  // Reincarnation: back from Dying, and Undying Spirit's friend with the shaman.
  if (isReincarnation) {
    const health = reincarnatedHealth({ max: actor.system?.health?.max ?? 1, returnAt: reinc.returnAt });
    await actor.update({ "system.health.value": health });
    await actor.standUp?.();
    usedLines.push(game.i18n.format("AZEROTH.Reincarnation.Returned", { name: actor.name, n: health }));
    if (riseWith) {
      const risen = await raiseAlly({ giver: actor, recipient: riseWith });
      usedLines.push(game.i18n.format(risen ? "AZEROTH.Reincarnation.AllyRose" : "AZEROTH.Reincarnation.AllyNot", { name: riseWith.name }));
    }
  }
  // **02's DISPEL, NOW THAT IT IS PAID FOR** (D-778): each creature's selected
  // effects ended through the one door - on the GM's client where this one does
  // not own it, every id judged again there. 04's Everlasting Affliction at rank 2
  // gates a warlock's effect on a Casting Test of the dispeller's at SL 2 or better,
  // one Test an effect, against the creature's Defense (07 §2's number); 04's
  // Unstable Affliction posts its Fel on the dispeller for each of a warlock's
  // effects ended; Rapture's use is struck where it named a second creature.
  const extraRolls = [];
  if (dispelling) {
    for (const pick of dispelling.picks) {
      const nameOf = Object.fromEntries(pick.ids.map((id, i) => [id, pick.names[i] ?? id]));
      const blocked = [];
      for (const g of pick.gated) {
        const gateDc = castingDC({ tier: tierNow, targetDefense: pick.target.system?.defense ?? null });
        const test = await gateCastingTest(actor, { dc: gateDc, source: useSource });
        if (!test) return null;
        extraRolls.push(test);
        const passed = gatePassed(test.outcome, g.sl);
        if (!passed) blocked.push(g.id);
        usedLines.push(game.i18n.format(passed ? "AZEROTH.Dispel.GatePassed" : "AZEROTH.Dispel.GateFailed", {
          effect: nameOf[g.id] ?? g.id, talent: g.by, total: test.total, dc: gateDc, sl: test.outcome?.sl ?? 0, need: g.sl
        }));
      }
      const ids = pick.ids.filter(id => !blocked.includes(id));
      const done = ids.length ? await endEffects({ dispeller: actor, target: pick.target, ids, name: pick.name }) : { name: pick.name, ended: [], kept: [] };
      usedLines.push(done.ended.length
        ? game.i18n.format("AZEROTH.Dispel.Ended", { target: pick.name, effects: done.ended.map(e => e.name).join(", ") })
        : game.i18n.format("AZEROTH.Dispel.EndedNone", { target: pick.name }));
      for (const line of await unstableStrikes({ dispeller: actor, ended: done.ended })) usedLines.push(line);
    }
    if (dispelling.rapture?.counter) {
      const left = Math.max(0, (Math.trunc(Number(dispelling.rapture.counter.system?.uses?.value)) || 1) - 1);
      await dispelling.rapture.counter.update({ "system.uses.value": left });
      usedLines.push(game.i18n.format("AZEROTH.Dispel.RaptureLine", { talent: dispelling.rapture.name, n: left }));
    }
  }

  // **WHAT THE MAGE'S AND THE WARLOCK'S USES DO, NOW THAT THEY ARE PAID FOR**
  // (D-775). Each was judged at step 1; a casting one lands after its Test (step 3).
  // Improved Blink's free Blink, struck.
  if (blinkFree) {
    await freeCounter.update({ "system.uses.value": Math.max(0, (freeCounter.system?.uses?.value ?? 1) - 1) });
    usedLines.push(game.i18n.format("AZEROTH.Blink.Free", { talent: freeRow.name, name: item.name }));
  }
  // 02's Blink: who moves and how far, said in words where no token is moved - and
  // where one is, the step's own line below says where it went (the Legacy branches'
  // door 3: *"02's Blink and Shadowstep move no token"*).
  if (blink && !(stepping?.doc && stepping.to)) {
    usedLines.push(blink.who
      ? game.i18n.format("AZEROTH.Blink.LineFriend", { name: blink.who.name ?? "", feet: blink.reach.feet, talents: blink.reach.by.join(", ") })
      : game.i18n.format("AZEROTH.Blink.Line", { name: actor.name, feet: blink.reach.feet }));
  }
  // **THE STEP, NOW THAT IT IS PAID FOR** (door 3): the token displaced to the space
  // picked - metered at nothing and provoking nothing - here or on the GM's client;
  // a mover with no token on the viewed scene is the table's to place.
  if (stepping?.doc && stepping.to) {
    const moved = await stepTo({ token: stepping.doc, to: stepping.to, feet: stepping.feet, by: actor, move: { kind: stepping.kind, itemUuid: item.uuid } });
    usedLines.push(steppedWords(moved, { feet: stepping.feet, source: item.name }));
    // Where it stood and where it landed, for the card (the Legacy branches' door 2).
    if (moved.step) stepsMade.push(moved.step);
  } else if (stepping?.skipped) {
    usedLines.push(game.i18n.format("AZEROTH.Step.NoTokenLine", { name: stepping.name, feet: stepping.feet }));
  }
  // Spellsteal: the Sustain chosen ends through the one door, on the GM's client
  // where the caster is another's.
  if (stealing) {
    if (spellstealCommit !== null) {
      const result = await finishSpellstealUse(actor, item, spellstealCommit);
      usedLines.push(game.i18n.format(result.ok ? "AZEROTH.Spellsteal.Transferred" : "AZEROTH.Spellsteal.TransferReview",
        { name: actor.name, target: stealing.caster.name, spell: stealing.entry.name }));
    } else {
      const ended = await stealSustain({ caster: stealing.caster, entry: stealing.entry, by: actor });
      usedLines.push(game.i18n.format(ended ? "AZEROTH.Spellsteal.Line" : "AZEROTH.Spellsteal.NotEnded", { target: stealing.caster.name, spell: stealing.entry.name }));
    }
  }
  // Icy Veins: the state on the mage until the end of their next turn, read by
  // the Casting Test's line and the cast's Mana (`rules/class-talents.mjs#veinsStates`).
  if (mw.veins) {
    const laid = await layState(actor, {
      flag: VEINS_FLAG, data: { boons: mw.veins.boons, schools: mw.veins.schools, less: mw.veins.less, source: item.name },
      img: item.img, span: untilEndOfNextTurnOrRound(actor), sameAs: raw => raw.source === item.name,
      name: game.i18n.format("AZEROTH.IcyVeins.Name", { name: item.name })
    });
    if (laid) usedLines.push(game.i18n.format("AZEROTH.IcyVeins.Line", { name: actor.name, n: mw.veins.less }));
  }
  // 02's Life Tap: the Health spent and the Mana it buys, in one write.
  if (lifeTap) {
    const into = poolFor(actor, "mana", item.getFlag("azeroth-rpg", "feature")?.classId ?? null);
    const before = actor.system?.health?.value ?? 0;
    const health = Math.max(1, before - lifeTap.health);
    const gainedMana = into ? Math.max(0, Math.min(into.max, into.value + lifeTap.mana) - into.value) : 0;
    if (into && gainedMana > 0) await actor.updatePool({ itemId: into.itemId, kind: into.kind, value: into.value + gainedMana }, { "system.health.value": health });
    else await actor.update({ "system.health.value": health });
    usedLines.push(game.i18n.format("AZEROTH.LifeTap.Line", { name: actor.name, health: before - health, mana: gainedMana }));
  }
  // Soul Swap: every ongoing effect of the warlock's moved whole, through the GM's
  // client where either creature is another's.
  if (swapping) {
    const moved = await swapEffects({ from: swapping.from, to: swapping.to, by: actor });
    usedLines.push(game.i18n.format(moved > 0 ? "AZEROTH.SoulSwap.Line" : "AZEROTH.SoulSwap.NotMoved", { from: swapping.fromName, to: swapping.toName, n: moved }));
  }
  // Demonic Sacrifice: the demon's Ward on the warlock until the encounter ends -
  // `_leaveFight` lifts it with the fight's buffs - and the lock until a Long Rest.
  if (sacrificed) {
    const locked = foundry.utils.deepClone(actor.getFlag("azeroth-rpg", SACRIFICED_FLAG) ?? []);
    await actor.setFlag("azeroth-rpg", SACRIFICED_FLAG, sacrificeRecord(locked, sacrificed));
    if (sacrificed.ward.length && actor.activeFight?.()) {
      const stale = actor.effects.filter(e => e.getFlag("azeroth-rpg", "talentBuff") === item.name).map(e => e.id);
      if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: game.i18n.format("AZEROTH.Sacrifice.WardName", { name: item.name, demon: sacrificed.name }),
        img: item.img, origin: actor.uuid,
        system: { changes: sacrificed.ward },
        flags: { "azeroth-rpg": { talentBuff: item.name, until: "encounter" } }
      }]);
      usedLines.push(game.i18n.format("AZEROTH.Sacrifice.WardLine", { name: actor.name, demon: sacrificed.name }));
    } else if (sacrificed.ward.length) usedLines.push(game.i18n.format("AZEROTH.Sacrifice.NoFight", { demon: sacrificed.name }));
    usedLines.push(game.i18n.format("AZEROTH.Sacrifice.LockLine", { demon: sacrificed.name }));
  }
  // Soul Fire: the Health spent, and the next spell this turn promised its SL and
  // its damage (`rules/casting.mjs#takeNextSpell`).
  if (mw.soulFire && grantingTalent) {
    const before = actor.system?.health?.value ?? 0;
    await actor.update({ "system.health.value": Math.max(1, before - mw.soulFire.health) });
    const laid = await layNextSpell(actor, [{
      source: grantingTalent.system?.identifier ?? "soul-fire", name: grantingTalent.name, amount: 0,
      forcedSl: mw.soulFire.sl, damage: mw.soulFire.damage, turn: true
    }]);
    usedLines.push(game.i18n.format(laid.length ? "AZEROTH.SoulFire.Line" : "AZEROTH.SoulFire.NotLaid", { name: actor.name, health: mw.soulFire.health, sl: mw.soulFire.sl, n: mw.soulFire.damage }));
  }

  // Blood Fury: Momentum gained on use (02 SS5, D-620), into the primary
  // class's pool of that kind, never past its cap - **OR, WHERE THE CHARACTER
  // HOLDS NO MOMENTUM POOL AT ALL, THE FURY** (the lead, 2026-11-02; D-798):
  // weapon attacks and spells add 1 to their Damage Rating until the encounter
  // ends. `rules/blood-fury.mjs#gainOutcome` is the one judgement; a multiclass
  // holding ANY Momentum pool takes the Momentum and no damage, exactly as
  // before. The fury is one Active Effect, replaced rather than stacked by a
  // second Use, lifted by `_leaveFight` with the fight's other encounter buffs,
  // and spanned by the world's clock where no fight is running (D-778).
  let gained = null;
  const gainNow = gainOutcome({ gain: sys.gain, pools: actor.poolSnapshot?.() ?? [], identifier: sys.identifier ?? null });
  if (gainNow.kind === "pool") {
    const { pool, amount } = gainNow;
    if (amount > 0) await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.value + amount });
    gained = game.i18n.format("AZEROTH.Card.Gained", { amount, pool: game.i18n.localize(AZEROTH.poolTypes[pool.name] ?? pool.name) });
  } else if (gainNow.kind === "fury") {
    const stale = actor.effects.filter(e => e.getFlag("azeroth-rpg", BLOOD_FURY_FLAG)).map(e => e.id);
    if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
    const inFight = Boolean(actor.activeFight?.());
    await actor.createEmbeddedDocuments("ActiveEffect", [furyEffectData({
      name: item.name, img: item.img, origin: actor.uuid,
      description: await enrich(sys.description ?? "", { relativeTo: item }),
      changes: gainNow.changes,
      timing: inFight ? null : clockRounds(ENCOUNTER_CLOCK_ROUNDS)
    })]);
    usedLines.push(game.i18n.format(inFight ? "AZEROTH.BloodFury.Fury" : "AZEROTH.BloodFury.FuryClock",
      { name: item.name, n: gainNow.amount, rounds: ENCOUNTER_CLOCK_ROUNDS }));
  }

  // 2b. What the feature calls (D-643): one world actor per entry named, each
  // standing for `count` of its kind, gone when the encounter ends. Every entry
  // was found in 1c, before anything was paid (D-768); one that has vanished
  // from the pack since is said and skipped, as before.
  const called = [];
  if ((sys.summons?.count ?? 0) > 0) {
    for (const [i, name] of (sys.summons.entries ?? []).entries()) {
      const found = summonEntries[i] ?? null;
      const entry = found ? await fromUuid(found.uuid) : null;
      if (!entry) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Bound.NoEntry", { name }));
        continue;
      }
      const made = await bind({
        owner: actor, feature: item, entry, kind: "summon", until: sys.summons.until ?? "encounter", count: sys.summons.count,
        // *each takes one Half-Action a turn of its own* (04's Pocket Factory; door 6).
        halfActions: place?.halfActions ?? null
      });
      // The uuid rides it so the card can make the name a draggable link.
      if (made) called.push({ name: made.name, uuid: made.uuid ?? null, count: sys.summons.count });
      // **AND ITS TOKENS STAND WHERE THE POINT WAS PICKED** (door 4), on the owner's
      // side and in the owner's fight, through the GM's client (`TOKEN_CREATE` is an
      // ASSISTANT's) - the summon door's own handler, judging the bond again there.
      if (made && place) {
        if (placeAt) {
          const placed = await placeSummon({ summoner: actor, actor: made, count: sys.summons.count, at: placeAt, sceneId: ownTokenDoc?.parent?.id ?? null });
          noteRisen(placed);
          usedLines.push(placed?.count
            ? game.i18n.format("AZEROTH.Place.Placed", { count: placed.count, name: made.name })
            : game.i18n.format("AZEROTH.Place.NotPlaced", { name: made.name }));
        } else usedLines.push(game.i18n.format("AZEROTH.Place.NoTokenLine", { name: made.name }));
      }
    }
  }
  // 2c. A TOTEM IS PLANTED (02 §7, D-708): one token beside the shaman and
  // the ground it holds as a Region attached to it. AFTER the budget and the
  // Mana, because a refused payment must not leave a totem standing; a shaman
  // with no token on any scene keeps the bond and is told why nothing was
  // placed. What the totem DOES is still the table's (D2 §12).
  // Each totem bound is planted, in the order picked (D-710): `freeSpot`
  // takes the next square out from the shaman, so four land in a ring rather
  // than on one another.
  const planted = [];
  for (const b of boundAll.filter(b => b.kind === "totem")) {
    const aura = totemAura({ name: b.option?.name ?? b.actor.name, description: b.option?.description ?? "" });
    planted.push({ totem: b.actor, placed: await plantTotem({ owner: actor, totem: b.actor, aura }) });
    noteRisen(planted.at(-1).placed);
  }
  // **A CONSTRUCT BUILT STANDS BESIDE ITS TINKER** (04's The Bench; the Legacy
  // branches' doors 4 and 6): its token placed through the summon door, and the card
  // says how long the build takes - *a Short Rest and a tinker's kit*, the time the
  // table spends.
  for (const b of boundAll.filter(b => b.kind === "construct")) {
    const placed = ownTokenDoc ? await placeSummon({ summoner: actor, actor: b.actor, count: 1, sceneId: ownTokenDoc.parent?.id ?? null }) : null;
    noteRisen(placed);
    usedLines.push(game.i18n.format(placed?.count ? "AZEROTH.Construct.Built" : "AZEROTH.Construct.BuiltNoToken", {
      // *Building one takes a Short Rest and a tinker's kit* - whatever the construct;
      // only the Arcanite Dragonling's REBUILD takes a Long Rest.
      name: b.actor.name, time: game.i18n.localize("AZEROTH.Construct.Time.short")
    }));
  }
  // **A WRECKED CONSTRUCT REBUILT** (door 6): back to its whole Health, its token put
  // down beside the tinker where it stands on no scene, and the time it took said -
  // ten minutes with Arclight Spanner at rank 2, a Long Rest for the Arcanite
  // Dragonling, else a Short Rest.
  if (rebuilding) {
    const max = rebuilding.system?.health?.max ?? 0;
    if (rebuilding.isOwner) await rebuilding.update({ "system.health.value": max });
    const standingNow = game.scenes?.some?.(s => s.tokens.some(t => t.actorId === rebuilding.id)) === true;
    if (!standingNow && ownTokenDoc) {
      const rebuilt = await placeSummon({ summoner: actor, actor: rebuilding, count: 1, sceneId: ownTokenDoc.parent?.id ?? null });
      noteRisen(rebuilt);
    }
    const given = constructsFor(talentsNow, { tier: tierNow });
    usedLines.push(game.i18n.format("AZEROTH.Construct.Rebuilt", {
      name: rebuilding.name, n: max,
      time: game.i18n.localize(`AZEROTH.Construct.Time.${rebuildTime({ name: bondOf(rebuilding)?.entryName ?? rebuilding.name, tenMinutes: given.tenMinutes })}`)
    }));
  }
  // **ONE OF YOUR CONSTRUCTS TAKES A HALF-ACTION AT ONCE** (04's Remote Control at
  // rank 2; door 6): one more Half-Action on the construct's own budget AND on the
  // shared turn, each through its combatant's own queued door (D-761). **At once**:
  // the one Half-Action a door may spend outside the construct's own turn (the lead:
  // *"Refuse off-turn Half-Actions"*; `rules/initiative.mjs#grantAtOnce`).
  if (constructHalf) {
    if (constructHalf.owner?.isOwner) await constructHalf.owner.grantConstructHalf(1);
    if (constructHalf.combatant?.isOwner) await constructHalf.combatant.grantAtOnce(1);
    usedLines.push(game.i18n.format("AZEROTH.Construct.HalfGranted", { name: constructHalf.construct.name }));
  }
  // **THE TRAP, SET** (04's Shadow Trap; door 26): a Region of its radius on the point
  // picked, carrying the setter, the condition and its escape at the setter's Spell
  // DC; one past the standing count takes up the setter's oldest of this talent.
  if (trap && trapAt && canvas?.scene) {
    const escape = featureEscapeRecord(trap.escape ?? null, {
      condition: trap.condition, spellDc: actor.system?.spellDC ?? actor.system?.spells?.dc ?? null,
      strDc: resistDcFor({ kind: "str", strMod: actor.system?.abilities?.str?.mod ?? 0, proficiency: actor.system?.proficiency ?? 0 }),
      caster: actor.uuid, source: item.name
    });
    // **THE FEATURE'S OWN KEY** (the B4 review): the key its animation row is filed under
    // (`featureKeyOf`, the gadget's or the granting talent's slug), never a stored
    // identifier core's slug may have written - a gadget's trap was filed under the
    // talent that granted the gadget.
    const identifier = useKey;
    // **EVERY SCENE'S TRAPS COUNT** (the B2 review): a trap left on another scene still
    // stands, so the count reads the whole world's, keyed by scene and Region.
    // **THROUGH AN ARRAY** (found live in B8b): core's Collection has `map` and `filter`
    // and no `flatMap`, so `game.scenes.flatMap` threw and every Shadow Trap's Use posted
    // no card.
    const held = Array.from(game.scenes ?? []).flatMap(s => Array.from(s.regions ?? []).map(r => ({ id: `${s.id}.${r.id}`, trap: r.flags?.["azeroth-rpg"]?.[TRAP_FLAG] ?? null })));
    const lift = trapsToLift(held, { setter: actor.uuid, identifier, standing: trap.standing });
    for (const key of lift) {
      const [sceneId, regionId] = key.split(".");
      const scene = game.scenes?.get(sceneId) ?? null;
      if (scene?.regions?.has(regionId)) await scene.deleteEmbeddedDocuments("Region", [regionId]);
    }
    const region = await placeArea({
      areaText: trapArea(trap.radius), name: item.name, scene: canvas.scene, origin: trapAt, color: null,
      flags: { [TRAP_FLAG]: { setter: actor.uuid, identifier, source: item.name, condition: trap.condition, escape, who: "enemy", setAt: game.time?.worldTime ?? 0 } }
    });
    usedLines.push(game.i18n.format(region ? "AZEROTH.Trap.Set" : "AZEROTH.Trap.NotSet", {
      name: item.name, condition: game.i18n.localize(AZEROTH.conditions[trap.condition] ?? trap.condition), n: trap.standing
    }));
    if (lift.length) usedLines.push(game.i18n.format("AZEROTH.Trap.Lifted", { name: item.name, n: lift.length }));
  }
  // **WHAT A GADGET LEAVES TO THE TABLE** (door 7), in words: the Cloaking Device's
  // hide and the Recombobulator's ended condition until door 25 reads them, the
  // Alarm-o-Bot's watch, the Parachute Cloak's fall.
  if (gadget?.reason && GADGET_REASONS[gadget.reason]) usedLines.push(game.i18n.localize(GADGET_REASONS[gadget.reason]));
  // **THE GADGETS KNOWN** (04's Gadgeteer; door 7): what the checklist named, the
  // feature's `known`, which the sync grants a feature each for.
  if (sys.choice === "gadgets" && picks.length) {
    await item.update({ "system.known": picks.map(p => knownRowOf(gadgetByKey(p.key) ?? { key: p.key, name: p.name })) });
    await actor.syncClassFeatures?.();
    usedLines.push(game.i18n.format("AZEROTH.Gadget.Known", { names: picks.map(p => p.name).join(", ") }));
  }
  // **OVERCLOCK** (02's gnome; door 7): the gadget named is MARKED (the B2 review: it
  // struck the gadget's use and fired nothing) - its next Use works one step better,
  // says so on its card and spends its own use, which is *then breaks* - until the
  // encounter ends or a rest; the device named is said in words.
  if (sys.choice === "overclock" && chosen) {
    const {markOverclock}=await import('../effects/overclock-mark.mjs');
    const marked = await markOverclock(actor,chosen,item.name);
    usedLines.push(game.i18n.format(marked ? "AZEROTH.Overclock.Gadget" : "AZEROTH.Overclock.Device", { name: chosen.name, talent: item.name }));
  }
  // **AN OVERCLOCKED GADGET'S OWN USE** (02's gnome; the B2 review): one step better, said
  // on this card - what one step better is stays the table's - and the mark comes off
  // with the use this Use has spent, which is the gadget breaking until a Short Rest.
  const overclocked = gadget ? cleanOverclock(item.getFlag?.("azeroth-rpg", OVERCLOCK_FLAG) ?? null) : null;
  if (overclocked) {
    usedLines.push(onUse?.gadgetAttack?.overclockDamage
      ? game.i18n.format("AZEROTH.Gadget.OverclockRating", { n: onUse.gadgetAttack.overclockDamage })
      : game.i18n.format("AZEROTH.Overclock.Fired", { name: item.name, talent: overclocked.by }));
    const {consumeOverclock}=await import('../effects/overclock-mark.mjs');
    await consumeOverclock(item);
  }
  // **MEKKATORQUE'S BLUEPRINT** (02's gnome; door 7): a gadget built stands as one
  // known with its own use, a device built is carried - each until the next Long
  // Rest (*It works for a day*), and a second build replaces the first.
  if (sys.choice === "blueprint" && chosen) {
    const {buildBlueprint}=await import('../effects/blueprint-build.mjs');
    await buildBlueprint(actor,chosen,grantingTalent?.id??null);
    usedLines.push(game.i18n.format("AZEROTH.Blueprint.Built", { name: chosen.name, talent: item.name }));
  }
  // A buff on the bound creature for the fight (Bestial Wrath, Demonic
  // Empowerment): switched on by the talent's identifier at its rank, and
  // switched off when the fight ends.
  if (sys.bound?.action === "buff" && grantingTalent?.system?.identifier) {
    await syncBoundFor(actor, { encounter: { [grantingTalent.system.identifier]: rank } });
  }
  // Demonic Sacrifice (04): Mana equal to twice the tier per rank for the demon dismissed.
  if (dismissed) {
    const mana = (actor.system.powers ?? []).find(p => p.name === "mana") ?? null;
    if (mana) {
      const amount = Math.max(0, Math.min(2 * (actor.system.tier ?? 1) * rank, mana.max - mana.value));
      if (amount > 0) await actor.updatePool({ itemId: mana.itemId, kind: "power", value: mana.value + amount });
      gained = game.i18n.format("AZEROTH.Card.Gained", { amount, pool: game.i18n.localize(AZEROTH.poolTypes.mana) });
    }
  }

  // 3. The Test, where the feature makes one.
  let roll = null;
  let spellLock = null;
  let sl = 0;
  let success = true;
  let resolvedDC = null;
  if (sys.casting) {
    spellLock = await requestSpellLockWindow({ actor, source: useSource ?? null,
      test: { kind: "feature", itemUuid: item.uuid } });
    if (!spellLock?.ok) {
      ui.notifications?.warn("The casting reaction window could not be confirmed. No Casting Test was rolled. Check the feature's paid costs and reaction records before trying again.");
      return null;
    }
    const casting = (actor.classItems ?? []).find(c => c.system?.castingAbility)?.system?.castingAbility ?? null;
    const modifiers = [];
    if (casting) modifiers.push({ label: AZEROTH.abilities[casting], value: actor.system.abilities?.[casting]?.mod ?? 0 });
    modifiers.push({ label: "AZEROTH.Sheet.Proficiency", value: actor.system.proficiency ?? 0 });
    resolvedDC = dc ?? sys.dc ?? castingDC({ tier: actor.system.tier ?? 1, targetDefense: first?.defense ?? null });
    roll = AzerothRoll.build({ dc: resolvedDC, modifiers, boons, banes: banes + spellLock.banes, kind: "casting", rollData: actor.getRollData() });
    roll.options.spellLock = { castId: spellLock.castId, banes: spellLock.banes };
    if (spellLock.banes > 0) roll.options.provenance.push({ label: "Spell Lock", value: null,
      formula: `${spellLock.banes} ${spellLock.banes === 1 ? "Bane" : "Banes"}` });
    roll.options.provenance.push(...provenanceExtra);
    await roll.evaluate();
    // A feature that makes a Casting Test is a Casting Test (06 §6, D-693).
    await actor.offerElunesRegard?.(roll);
    const spent = await spendLaidBanes(actor, "casting");
    if (spent.length) roll.options.provenance.push({ label: "AZEROTH.Modifier.LaidBane", value: null, formula: spent.join(", ") });
    // And a Boon somebody laid (04's Blessing, D-772).
    const blessed = await spendLaidBoons(actor, "casting");
    if (blessed.length) roll.options.provenance.push({ label: "AZEROTH.Modifier.LaidBoon", value: null, formula: blessed.join(", ") });
    sl = roll.outcome.sl;
    success = roll.outcome.success;
    // **MANA BACK AT SL 2** (04's Illumination: *When a Casting Test of yours
    // reaches SL 2 or better*; D-772): a casting feature's Test is one.
    const manaBack = manaBackFor(actor.takenTalents(), { sl });
    const back = manaBack.amount > 0
      ? await restoreMana(actor, poolFor(actor, "mana", item.getFlag("azeroth-rpg", "feature")?.classId ?? null), manaBack.amount)
      : 0;
    if (back > 0) roll.options.provenance.push({ label: manaBack.by.join(", "), value: null, formula: game.i18n.format("AZEROTH.Cast.ManaBackRow", { n: back }) });
    // **A CASTING TEST AT SL 2 OR BETTER** (04's Nature's Grace, D-771): *a
    // Casting Test you make* - a casting feature's is one - lays the next
    // spell's discount on the caster.
    // Backdraft's Half-Action is laid only while its counter holds a use (D-775),
    // as the cast's own door lays it.
    const graces = nextSpellGrants(actor.takenTalents(), { on: "casting", sl }).filter(g => !g.cast || talentUsesLeft(actor, g.source) > 0);
    if (graces.length) await layNextSpell(actor, graces);
    // **A STATIC CHARGE** (04: *When a Casting Test you make meets or exceeds SL
    // 2, you gain a Static Charge*; D-774): a casting feature's Test is one.
    if (await gainCharge(actor, sl)) roll.options.provenance.push({ label: "AZEROTH.TalentLine.ChargeGained", value: null, formula: game.i18n.format("AZEROTH.TalentLine.ChargesNow", { n: Number(actor.getFlag("azeroth-rpg", CHARGE_FLAG)) || 0 }) });
  }

  // 3a. **WHAT A USE PAYS ON ITS SUCCESS** (D-775 for 02's Curse; the B8a2 pass for every
  // price 02 names *On success*: Mass Mend's 6, Shadow Word: Death's 8, Divine Hymn's 15,
  // the Curse's 4) - judged at 1e, paid now; a failed Test costs nothing and does nothing.
  // **A SUCCESS THE POOL CAN NO LONGER PAY DOES NOTHING** (the architect's review of D-775):
  // a price spent between the judgement and the success leaves it short; the Use then pays
  // nothing and lands nothing - no heal, no damage, no Test forced, no area - said in words,
  // rather than taking what is left and going off anyway. The card keeps the Test's own
  // verdict (`tested`); every outcome below reads `success`, which such a success leaves
  // false, as it is for a failed Test.
  let successPaid = 0;
  let successShort = false;
  const successPool = game.i18n.localize(AZEROTH.poolTypes[pool?.name] ?? pool?.name ?? "");
  if (successDue > 0 && success) {
    const now = actor.poolSnapshot?.().find(p => p.itemId === pool?.itemId && p.kind === pool?.kind) ?? null;
    successShort = !now || now.value < successDue;
    if (successShort) {
      const short = game.i18n.format("AZEROTH.Feature.OnSuccess.Short", { name: item.name, n: successDue, pool: successPool });
      ui.notifications?.warn(short);
      usedLines.push(short);
    } else {
      successPaid = successDue;
      await actor.updatePool({ itemId: now.itemId, kind: now.kind, value: now.value - successPaid });
    }
  } else if (successDue > 0) usedLines.push(game.i18n.format("AZEROTH.Feature.OnSuccess.Unpaid", { name: item.name, pool: successPool }));
  const tested = success;
  if (successShort) success = false;
  // 04's Haunt: each tick of the warlock's on the target raised, and the heal its
  // death returns carried on them - through the GM's client where it is another's.
  if (haunting && success) {
    const raised = await hauntTarget({ target: haunting.target, by: actor, add: mw.haunt.add, heal: mw.haunt.heal });
    usedLines.push(game.i18n.format(raised > 0 ? "AZEROTH.Haunt.Line" : "AZEROTH.Haunt.NotRaised", { target: haunting.name, n: mw.haunt.add, heal: mw.haunt.heal, count: raised }));
  }
  // 04's Command Demon: the demon bound until the next Long Rest, counted against
  // nothing - D-649's adopt, through the GM's client where it is another's.
  if (commanding && success) {
    // Keep the talent's provenance: substituting Bound Demon here also made
    // this temporary command eligible for Blood Pact's class-feature restriction.
    const unseen = commanding.sightRefusal();
    if (unseen) ui.notifications?.warn(game.i18n.localize(unseen));
    const held = unseen ? null : await commandDemon({ owner: actor, actor: commanding.target, feature: item, placement: commanding.placement });
    usedLines.push(game.i18n.format(held ? "AZEROTH.CommandDemon.Line" : "AZEROTH.CommandDemon.NotBound", { name: actor.name, demon: commanding.name }));
  }
  // **04's THUNDERSTORM'S PUSH** (*On success, any number of targets within 15 feet
  // of you ... are moved 10 feet away from you in any direction*; D-778; the lead:
  // *"Yes."*): each creature the Use names, moved straight away from the shaman's
  // token through the forced-movement door - a displacement, never metered and never
  // an Opportunity Attack - on the GM's client where this one does not own it. A
  // failed Test moves nobody, and a shaman with no token measures nothing.
  if (ps.push && success && list.length) {
    const from = ownToken?.document?.getCenterPoint?.() ?? null;
    for (const t of list) {
      const token = tokenDocOfTarget(t);
      const r = from ? await forceMove({ token, from, feet: ps.push.feet, toward: "away", by: actor, name: t?.name ?? "" }) : { name: t?.name ?? "", feet: 0, moved: false, reason: "unmeasured" };
      usedLines.push(forcedWords(r, { toward: "away", source: item.name }));
    }
  }

  // 3b. **WHAT A B3 CASTING USE LANDS ON ITS SUCCESS** (04's Disenchant; door 25).
  const spiritLines = await landSpiritCasting(spiritsPlan, { actor, item, success, tierNow, extraRolls, source: useSource });
  if (spiritLines === null) return null;
  usedLines.push(...spiritLines);

  // 3c. **AN AREA USE GATHERS ITS OWN TARGETS** (the lead: *"Measure the area"*; the B6
  // fix): every creature inside the circle that the row's `who` names - measured from the
  // user's footprint, or from the point picked before anything was paid - is the card's
  // target, so its Apply, Resist and Inflict work per creature, each against its own Ward.
  // Never a defeated creature, never a token hidden from the user. A Use whose Test failed
  // reaches nobody, and one that can measure nothing keeps the creatures the table
  // targeted (D-647's shape), as it always did.
  let areaMeasured = false;
  if (gatherPlan && success) {
    const inside = creaturesInArea(actor, gatherPlan, { point: gatherAt });
    if (inside) {
      areaMeasured = true;
      const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
      list.splice(0, list.length, ...targetSnapshots(inside.map(r => r.token)));
      const words = { feature: item.name, who: game.i18n.localize(`AZEROTH.Gather.Who.${gatherPlan.who}`), feet: gatherPlan.feet };
      usedLines.push(list.length
        ? game.i18n.format("AZEROTH.Gather.Line", { ...words, names: list.map(t => t.name ?? "").join(", ") })
        : game.i18n.format("AZEROTH.Gather.None", words));
    }
  }

  // 3c+. **A BREATH'S CONE GATHERS ITS OWN TARGETS** (02's Breath: *Every creature in a
  // cone*; stage 2B): the creatures inside the cone aimed before anything was paid,
  // never the breather, are the card's targets, each against its own Ward.
  if (champ.facing && success) {
    areaMeasured = true;
    const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
    list.splice(0, list.length, ...targetSnapshots(champ.facing.tokens));
    const words = { feature: item.name, area: champ.facing.area, school: game.i18n.localize(AZEROTH.schools[champ.breath?.school] ?? champ.breath?.school ?? "") };
    usedLines.push(list.length
      ? game.i18n.format("AZEROTH.Chromatic.BreathLine", { ...words, names: list.map(t => t.name ?? "").join(", ") })
      : game.i18n.format("AZEROTH.Chromatic.BreathNone", words));
  }
  if (champ.breath && !champ.facing) {
    usedLines.push(game.i18n.format("AZEROTH.Chromatic.BreathUnaimed", {
      feature: item.name, area: champ.breath.area, school: game.i18n.localize(AZEROTH.schools[champ.breath.school] ?? champ.breath.school)
    }));
  }
  if (champ.breath?.drake) usedLines.push(game.i18n.format("AZEROTH.Chromatic.BreathDrake", { talent: champ.breath.drake, feature: item.name }));

  // 4. The numbers, on success, at the rank taken (D-642) - and the Rating of
  // the weapon in the main hand, for 04's Wrath of the Light (*Holy damage at
  // your Damage Rating*; D-772), Unarmed's 1 with none.
  const scope = {
    tier: actor.system.tier ?? 1, level: actor.system.level ?? 1, sl, rank,
    weapon: weaponRatingOf((actor.readyWeapons?.() ?? []).map(w => ({ ...(w.system ?? {}) }))),
    // The ability modifiers and Proficiency (the Legacy branches' door 16).
    ...abilityScope(actor.system)
  };
  // Swiftmend's heal has LANDED with the end (step 2's `onUse.ends`, D-771):
  // the card says so in words and draws no button that would heal it twice.
  const healAmount = success && sys.heal && !endsOn ? evaluateAmount(sys.heal, scope) : null;
  // **MEND PET HEALS THE COMPANION** (04, D-773): landed on the creature the Use
  // named, never a button that would heal whoever is selected - the Ranger, as it
  // did. The character's owners own their bound creatures (D-643).
  if (healsBound && healAmount !== null) {
    const before = healsBound.system?.health?.value ?? 0;
    await healsBound.applyHealing(healAmount, { from: actor, feature: true });
    usedLines.push(game.i18n.format("AZEROTH.MendPet.Line", { name: healsBound.name, n: Math.max(0, (healsBound.system?.health?.value ?? before) - before) }));
  }
  const heal = healAmount !== null && !healsBound ? { amount: healAmount, explanation: String(sys.heal) } : null;
  // **04's DREAMSTATE: THE DRUID IS AMONG THOSE RESTING** (the lead, 2026-10-03, on
  // O-169: *"Yes"*; D-779): the Dreamwalk's heal lands on the druid at the Use,
  // through the one healing door - Symbiosis shares it from there - and the card's
  // button reaches the others resting. Which rest the hour is stays the lead's
  // (CLARIFY, O-169), so no rest's recovery is run.
  // Dreamwalk carries a heal only where Dreamstate's patch laid one (02 prints none).
  if (heal && item.name === "Dreamwalk") {
    const before = actor.system?.health?.value ?? 0;
    await actor.applyHealing(heal.amount, { from: actor, feature: true, featureName: item.name, ...(aegisNamed ? { aegis: aegisNamed } : {}) });
    usedLines.push(game.i18n.format("AZEROTH.Dreamstate.Rested", { name: actor.name, n: Math.max(0, (actor.system?.health?.value ?? before) - before) }));
  }
  // **WHAT EACH NAMED TARGET RESTORES** (04's Circle of Healing, D-774): the first
  // the whole heal, the further ones half, rounded down - and CLOUDBURST's allies
  // (*restores the same amount to every friendly target within 20 feet of its
  // target*) the whole of it, added to the card's targets.
  const cloud = heal ? await takeCloudburst(actor, list) : { extra: [], by: null };
  if (cloud.extra.length) {
    list.push(...cloud.extra);
    usedLines.push(game.i18n.format("AZEROTH.Cloudburst.Line", { talent: cloud.by ?? "", names: cloud.extra.map(t => t.name).join(", ") }));
  }
  const healByTarget = heal ? [
    ...healShares(heal.amount, healLimits, list.length - cloud.extra.length),
    ...cloud.extra.map(() => heal.amount)
  ] : [];
  if (heal && healLimits?.further) heal.perTarget = true;
  if (heal && cloud.extra.length) heal.perTarget = true;
  // Shadowform's mark: a healing feature used (D-774).
  if (sys.heal) await markLightUsed(actor);
  // **WHAT THE CARD'S APPLY LAYS AT THE START OF EACH TARGET'S TURNS** (02's
  // Regrowth, 04's Wild Growth; D-771): the stamped tick, its number at the
  // character's tier, laid by the card's Apply as a spell's is (D-770's door).
  // A counted tick with nothing to end it is not offered (the D-770 review's
  // item A), and the card says why.
  const featureTickStored = success ? featureTick(sys.tick) : null;
  const stampedFeatureTick = featureTickStored
    ? ((t => (t && aegisNamed && t.kind === "heal" ? { ...t, aegis: aegisNamed } : t))(layTick(featureTickStored, { source: actor.uuid, castUuid: item.uuid ?? null, name: item.name, tier: actor.system.tier ?? 1, rank, via: "feature" })))
    : null;
  const casterFightsNow = Boolean(actor.activeFight?.());
  const carriersFight = list.length ? list.some(t => Boolean(targetActorOf(t)?.activeFight?.())) : casterFightsNow;
  const laidFeatureTick = stampedFeatureTick && tickHasClock(stampedFeatureTick, { duration: null, carrierInFight: carriersFight, casterInFight: casterFightsNow })
    ? stampedFeatureTick : null;
  const featureTickNoClock = stampedFeatureTick && !laidFeatureTick ? game.i18n.format("AZEROTH.Tick.NoClock", { spell: item.name }) : null;
  // **THE TEST THAT ENDS EACH CONDITION THE CARD OFFERS** (the Legacy branches' door
  // 19: Bad Mojo, Shackle, Shadow Trap, The Vault Opens, Warden's Cage): the stamped
  // escape with its DC resolved now - the Spell DC, or the Strength one - written on
  // the card for `dice/chat.mjs#applyConditionFromCard` to lay with the condition.
  // The stamp's conditions, and what a drake capstone's Breath adds while its form is held
  // (04's Bronze Drake's Slowed; stage 2B).
  const useInflicts = [...(sys.inflicts ?? []), ...(champ.breath?.inflicts ?? [])];
  const inflictEscapes = success ? Object.fromEntries(useInflicts.map(i => {
    const record = featureEscapeRecord(i?.escape ?? null, {
      condition: i?.condition ?? null, spellDc: actor.system.spellDC ?? actor.system.spells?.dc ?? null,
      strDc: resistDcFor({ kind: "str", strMod: actor.system.abilities?.str?.mod ?? 0, proficiency: actor.system.proficiency ?? 0 }),
      caster: actor.uuid, source: item.name
    });
    return record ? [record.condition, record] : null;
  }).filter(Boolean)) : {};
  // **THE CONDITIONS THE CARD OFFERS ON EACH TARGET** (02's Hurricane, 04's
  // Typhoon at rank 2; D-771), on a Use that landed.
  // A condition offered from an SL (04's Pyroblast at rank 2; D-775) is offered
  // only where the Test reached it.
  const inflicts = success
    ? useInflicts.filter(i => AZEROTH.conditions?.[i?.condition] && !(Number(i?.sl) > 0 && sl < Number(i.sl))).map(i => ({
        condition: i.condition,
        label: game.i18n.localize(AZEROTH.conditions[i.condition]),
        value: i.value ?? null,
        until: i.until ?? null,
        untilLabel: i.until ? game.i18n.localize(AZEROTH.untilKinds[i.until] ?? i.until) : null,
        // **WHETHER THE CARD'S TEST GOVERNS IT** (the lead: *"Land automatically"*; the
        // B6 review on Thunder Clap): a failure lays it at once, so its button stands
        // only for a creature whose Test the card has not recorded.
        onFail: i.onFail === true
      }))
    : [];
  // The conditions a failed Resist on this card lands (`dice/chat.mjs#rollResists`), as
  // the card offers them - only where the card offers a Test at all.
  const onFailInflicts = sys.resist ? governed(inflicts).onFail.map(i => ({ condition: i.condition, value: i.value, until: i.until })) : [];
  // **WHAT THE MEASURED AREA LAYS AT ONCE** (the lead: *"Land automatically"*; the B6
  // fix - *Thunder Clap's Slowed lands on everyone (unresisted); its Prone only on a
  // failure*): each condition no Test of the card's governs (`rules/area-gather.mjs
  // #landsAtOnce`), laid on every creature the Use measured through the Inflict door
  // (`effects/inflict.mjs#inflictCondition`: on the GM's client for a creature this one
  // does not own, judged before anything was paid), with the escape the Use recorded
  // for it, Permafrost's feet on a Slowed and its span - a turn's span held to the
  // world's clock out of a fight (D-778). The card says what landed on whom and draws
  // no button for it; a Use that measured nothing keeps D-647's buttons.
  const landedAtOnce = areaMeasured ? landsAtOnce(inflicts, { resisted: Boolean(sys.resist) }) : [];
  if (landedAtOnce.length) {
    const slowNow = landedAtOnce.some(i => i.condition === "slowed") ? slowingFor(talentsNow) : null;
    for (const t of list) {
      const victim = targetActorOf(t);
      for (const i of landedAtOnce) {
        const until = i.until === "casterTurnStart" ? untilNextTurnOrRound(actor)
          // 04's Whisper of Madness: *until the end of your next turn* - the user's (stage 3A).
          : i.until === "casterTurnEnd" ? untilEndOfNextTurnOrRound(actor)
          : i.until === "minute" ? (victim ? minuteSpan(victim) : null)
            : i.until === "endOfNextTurn" ? (victim ? untilEndOfNextTurnOrRound(victim) : null)
              : (i.until || null);
        const escapeRec = inflictEscapes[i.condition] ?? null;
        const marks = {
          ...(escapeRec ? { [ESCAPE_FLAG]: escapeRec } : {}),
          ...(i.condition === "slowed" && slowNow?.feet > 0 ? { [SLOWED_FEET_FLAG]: { feet: slowNow.feet, source: slowNow.by.join(", ") } } : {})
        };
        usedLines.push(landedText(await inflictCondition({ victim, id: i.condition, value: i.value ?? null, by: actor, name: t?.name ?? "", until, marks })));
      }
    }
  }
  let damage = null;
  let damageByTarget = [];
  // The half a passed Test leaves, by row and on the card's one button (the B6 fix).
  let passedByTarget = [];
  let damagePassed = null;
  // And nothing, where the Test's failure is what deals the damage (the B8a pass).
  let noneOnPass = false;
  // Why a feature's damage was what it was, for a card with no roll to carry it.
  const damageProvenance = [];
  let explosiveTrap = null;
  // 04's Lifebinder's Flame on a Fire Breath (D-845): the heal the split owes, recorded on the
  // card and landed once it stands (`landLifebinder`), as the spell door records its own.
  let lifebinderRecord = null;
  if (success && sys.damage?.amount) {
    const base = evaluateAmount(sys.damage.amount, scope) ?? 0;
    // A Breath's school, chosen at 1b (stage 2B), else the stamp's own type.
    const school = champ.breath?.school ?? sys.damage.type ?? null;
    // **THE LANE AND THE LINES** (D-768). This door built neither: Elemental
    // Fury never reached Forked Lightning, Seal of Command's Holy never reached
    // a feature, and 10's *+1 Damage Rating on all damage you deal* skipped every
    // one. The lane is the feature's own (`featureDamageLane`: a Casting Test
    // rides the spell lane), read through the ONE `laneBonus` the attack and
    // spell doors read; the lines are `damageLinesFor`'s, ticked on the dialog
    // or, with none, the ones that came ticked.
    const standing = standingFeatureBonus(actor.system, { lane: featureDamageLane(sys), type: school });
    // **A STATIC CHARGE SPENT ON THIS DAMAGE** (04: *When you deal damage you may
    // spend a Static Charge to add your tier to that damage*; D-774), off the flag
    // as it stands now.
    const charged = chargeLine && await spendCharge(actor) ? chargeLine.amount : 0;
    const lineBonus = Math.max(0, Math.trunc(Number(extraRating)) || 0) + charged;
    const rating = base + standing.total + lineBonus;
    if (charged) damageProvenance.push({ label: chargeLine.name, value: charged });
    if (standing.lane) damageProvenance.push({ label: "AZEROTH.Card.TalentDamage", value: standing.lane });
    if (standing.corruption) damageProvenance.push({ label: "AZEROTH.Corruption.DamageBonus", value: standing.corruption });
    if (lineBonus) for (const row of damageRows ?? []) damageProvenance.push({ label: row.name, value: row.amount });
    // 04's Drawn Across on the user (door 25): the feature's damage halved before Ward.
    const halvedFeature = dealtHalvedBy(actor);
    if (halvedFeature) damageProvenance.push({ label: halvedFeature.source, value: null, formula: game.i18n.localize("AZEROTH.HalvesDealt.Row") });
    if (roll) roll.options.provenance.push(...damageProvenance);
    // What a standing effect adds to every blow of the feature's lane AS ITS OWN
    // TYPE (04's Arcane Power on a casting feature - the lead: *"Yes, casting
    // features count"*; D-777): a second amount, met by its own Ward.
    const featureTyped = typedLaneExtras(actor.system, featureDamageLane(sys));
    // A set trap retains the feature's prepared damage and DC. Its victims are
    // captured later by Region entry, independently of Snake Trap's poison rank.
    if (item.name === SNARE.feature && school === "fire" && sys.damage.half === true) {
      explosiveTrap = explosiveTrapSnapshot({ rating, extras: featureTyped, dealtHalved: halvedFeature,
        dc: actor.system.spellDC ?? actor.system.spells?.dc ?? null });
    }
    // **THE LANE ITS TYPE NAMES** (the lead: *"Measure the area"* - *each creature's Ward and
    // Armor Points subtracted*): a school's damage meets the creature's Ward, and a physical
    // or untyped one (the lead: *"Untyped counts as physical"*) its Body Armor Points.
    const lane = school && school !== "physical" ? "magical" : "physical";
    const mitigate = (t, { passed = false } = {}) => explosiveTrap
      ? explosiveTrapDamage(explosiveTrap, t ?? {}, { passed }) : resolveDamage({
      rating, sl: 0, kind: lane, school, location: "body", apByLocation: t?.apByLocation ?? {},
      fireTakenBonus: t?.fireTakenBonus ?? 0,
      ward: t?.wardBySchool?.[school] ?? 0,
      // An ally's aura, after the Ward (04's Avenging Bulwark, D-755).
      schoolArmor: t?.schoolArmor?.[school] ?? 0,
      immune: t?.immune ?? [], vulnerable: t?.vulnerable ?? [], slAddsToDamage: false,
      extras: featureTyped, wardBySchool: t?.wardBySchool ?? {}, schoolArmorBySchool: t?.schoolArmor ?? {},
      dealtHalved: halvedFeature,
      // Half on a passed Test (the lead: *"Build it everywhere"*), before Armor and Ward.
      passedHalf: passed
    });
    damageByTarget = list.map(t => mitigate(t));
    // **WHAT A CREATURE THAT PASSES ITS TEST TAKES** (04's Life Drain and Cluster Rockets,
    // *half that, rounded down, on a success*; Explosive Trap's *for half*): each row's
    // half, met by the same creature's own Ward, ready for the card's Apply to land once
    // that creature's Resist on this card is recorded as passed (`rules/resisted.mjs`).
    // Only where the Use offers its Test - a failed Casting Test offers none.
    if (sys.damage.half === true && sys.resist && !successShort) {
      passedByTarget = list.map(t => mitigate(t, { passed: true }));
      damagePassed = mitigate(null, { passed: true }).damage;
    }
    // **NONE OF IT ON A PASSED TEST, WHERE THE FAILURE DEALS IT** (02's Shadow Word: Death:
    // *On a failed save, the target takes your level plus the SL bonus ... in Shadow
    // damage*; the B8a pass): the card's Apply lands nothing on a creature whose Resist on
    // this card passed (`rules/resisted.mjs#sparedFor`) - only where the Use offers its Test.
    noneOnPass = sys.damage.onFail === true && sys.damage.half !== true && Boolean(sys.resist) && !successShort;
    // **04's LIFEBINDER'S FLAME, SPLITTING A FIRE BREATH** (*Work out the damage it deals after
    // Armor Points and Ward ... A Breath splits the damage of every creature it strikes, adds
    // the other halves together, and heals a creature within 30 feet*; D-845): the split chosen
    // before anything was paid, worked out by the spell door's own law over every creature in
    // the cone - each row halved after its Ward, the other halves pooled with the Constitution
    // modifier, Rekindle, Pyre of Renewal and the Red Drake read off the plan - and the row a
    // passed Reflex Test lands halved the same way (MY READING, for the lead).
    if (champ.breathSplit && damageByTarget.some(Boolean)) {
      const split = lifebinderSplit({
        dealt: damageByTarget.map(r => r?.damage ?? 0), conMod: actor.system?.abilities?.con?.mod ?? 0,
        heals: champ.breathSplit.picks.length, plan: champ.breathSplit.plan, tier: actor.system?.tier ?? 1
      });
      damageByTarget = splitRows(damageByTarget, split.takes);
      if (passedByTarget.length) passedByTarget = splitRows(passedByTarget);
      if (damagePassed !== null) damagePassed = Math.floor(Math.max(0, Number(damagePassed) || 0) / 2);
      lifebinderRecord = {
        by: actor.uuid, name: champ.breathSplit.plan.by, cleanse: champ.breathSplit.plan.cleanse ?? null, self: split.self,
        selfBy: champ.breathSplit.plan.selfBy ?? null,
        heals: champ.breathSplit.picks.map((p, i) => ({ ...p, amount: split.shares[i] ?? 0 })), landed: []
      };
      const splitRow = { label: champ.breathSplit.plan.by, value: null, formula: game.i18n.localize("AZEROTH.Lifebinder.Row") };
      damageProvenance.push(splitRow);
      if (roll) roll.options.provenance.push(splitRow);
      usedLines.push(game.i18n.format("AZEROTH.Lifebinder.Line", {
        talent: champ.breathSplit.plan.by, heals: lifebinderRecord.heals.map(h => `${h.name} ${h.amount}`).join(", ")
      }));
    }
    const result = damageByTarget[0] ?? mitigate(null);
    // The Rating the mitigation took from, so `6 − 1` reads off the number the
    // lane and the lines made rather than the bare base (D-768).
    damage = {
      final: result.damage,
      explanation: [spellDamageExplanation(result, rating), noneOnPass ? game.i18n.localize("AZEROTH.Card.DamageOnFail") : null].filter(Boolean).join(" · ")
    };
  }
  // A failed Casting Test forces no Resist (02's Curse: *On success ... force a
  // target ... to make a Spirit Resilience Test*; D-775), nor a Use whose price
  // on its success the pool could no longer pay (the B8a2 pass).
  const resist = sys.resist && success && !successShort
    // A CREATURE'S SPELL DC IS `system.spells.dc` (14 §1's `**Spells** (DC n)`
    // run); `system.spellDC` is the character's derived one and does not exist
    // on the other model. This was the third copy of the same read and the only
    // one left with no fallback: `castSpell` has had both since it was written
    // and `useSignature` was given them when a creature could first bear one.
    // It was unreachable while nothing could put a `feature` item on a creature
    // - and the Gear tab is exactly that door (the lead's N3), so a feature a
    // GM hands a creature would have posted a Resist button with no DC on it.
    ? {
        key: sys.resist, label: AZEROTH.resiliences[sys.resist],
        // **THE DC IT IS RESISTED AGAINST** (the Legacy branches' door 16; the lead on
        // 04's Thunder Clap: *"10 + Str modifier + Proficiency"*): the Strength one where
        // the feature's `resistDc` names it, else the Spell DC (a creature's own), else
        // none - the table's (the B1 review: never the Strength one in silence).
        dc: resistDcFor({
          kind: sys.resistDc ?? null, spellDC: actor.system.spellDC ?? actor.system.spells?.dc ?? null,
          strMod: actor.system.abilities?.str?.mod ?? 0, proficiency: actor.system.proficiency ?? 0,
          // 02 §5's Tail Sweep's 8 + Constitution modifier + Proficiency (`con8`; the lead, 2026-11-09).
          conMod: actor.system.abilities?.con?.mod ?? 0,
          // 05 §3's Standard DC at the user's own tier (02 §5's War Stomp; the B8a pass).
          tier: actor.system.tier ?? 1
        }),
        // 02's Snare (D-773): with no trap damage on the card its Test IS the
        // caught creature's escape; with Explosive Trap's damage it is the half,
        // and the escape is a button of its own below.
        purpose: item.name === SNARE.feature && !damage ? "snare" : null,
        // The one creature Thrall of the Banshee or Drawn Across named resists it (the B3 review).
        targetIndex: spiritResistIndex(spiritsPlan)
      }
    : null;
  // **ONE RESIST ROW PER CREATURE THE CARD RECORDS** (D-726's rows, on a feature's card -
  // the B6 fix): each row names its creature's uuid, so `dice/chat.mjs` shows it to that
  // creature's owner and the GM, and the Test it makes is RECORDED on this card - which is
  // what the Apply's half (*"Build it everywhere"*) and a failure's conditions (*"Land
  // automatically"*) read. The one creature Thrall of the Banshee or Drawn Across named is
  // the one row; a Test with a purpose of its own (the Snare's escape) keeps its button.
  const resistRows = resist && !resist.purpose
    ? list.map((t, index) => ({
        index,
        name: t?.name ?? "",
        actorUuid: targetActorOf(t)?.uuid ?? "",
        key: resistKey(t),
        resilience: resist.key,
        label: resist.label,
        dc: resist.dc
      })).filter(r => resist.targetIndex === null || String(r.index) === String(resist.targetIndex))
    : [];
  const escape = item.name === SNARE.feature && damage && success
    ? { key: SNARE.resilience, label: AZEROTH.resiliences[SNARE.resilience], dc: actor.system.spellDC ?? actor.system.spells?.dc ?? null }
    : null;
  // D-616: the area in 07 SS9's phrasing, and whether the feature makes an
  // attack, for the card's Place area and Attack buttons.
  // Chimaera Shot's *within a 15-foot radius* (D-773): the circle widened.
  // **A FAILED CASTING TEST PLACES NOTHING** (the lead, 2026-09-26, for a spell;
  // D-775 for a casting Use: 04's Firestorm burns *On success*), and the card
  // then offers no area.
  const area = success ? widenArea(areaFor(champ.breath?.area ?? sys.area ?? ""), barrageLimits?.widen ?? 0) : null;
  // 04's Firestorm (D-775): what the Region placed from this card strikes at the
  // start of a turn, its span, and which Use placed it.
  const useAreaTick = success && area && mw.areaTick ? mw.areaTick : null;
  const useCast = useAreaTick ? foundry.utils.randomID() : null;
  // Said in words on the card, as a spell's area says it (D-756).
  const useAreaLine = useAreaTick ? areaTickLine(useAreaTick) : null;
  if (useAreaLine?.text) usedLines.push(useAreaLine.text);
  // **04's TYPHOON ON HURRICANE** (*also pushes everything in its area 10 feet per
  // rank*; D-778; the lead: *"Yes."*, away from the area's centre): what the card's
  // Place area pushes once the area stands, read off the talent's patch on the
  // feature - a Use whose Test failed places nothing and pushes nobody.
  const areaPush = success && area ? pushFor(talentsNow, { feature: item.name }) : null;
  if (areaPush) usedLines.push(game.i18n.format("AZEROTH.Forced.AreaPush", { feet: areaPush.feet, talent: areaPush.by.join(", ") }));
  // **A GADGET THAT ATTACKS** (04's Net-o-Matic Projector: *Make a ranged attack
  // against a creature within 40 feet. On a hit it is Entangled*; the Legacy
  // branches' door 7): the card's own Attack, made with the gadget
  // (`rules/gadgets.mjs#gadgetWeapon`) and laying what its hit lays.
  const gadgetAttack = gadgetAttackAt(gadget, { tier: tierNow, overclocked: Boolean(overclocked) });
  const attack = sys.attack === true || Boolean(gadgetAttack);
  // **HOW MANY ATTACKS THE CARD'S BUTTON MAKES** (the architect's review of
  // D-773): every press costs nothing more, so the card records its allowance and
  // the press counts against it (`dice/chat.mjs#attackFromCard`). One per
  // creature is the creatures the Use named, else the enemies measured in a
  // self-centred area or, with none, within reach.
  let measuredFoes = null;
  if (attack && sys.attacks === "each" && !list.length && actor.getActiveTokens?.(true)?.[0]) {
    const radius = area?.shape === "circle" && area.origin === "self" ? area.distanceFt : reachOfActor(actor);
    measuredFoes = enemyDistances(actor).filter(d => typeof d === "number" && d <= radius).length;
  }
  const attackAllowance = attack
    ? cardAttackAllowance({ attacks: sys.attacks ?? null, named: list.length, targets: barrageLimits?.by.length ? barrageLimits.targets : null, measured: measuredFoes, rank })
    : null;

  // 4b. A Bane laid on the TARGET (06 §6's Pummel, D-693): *that creature
  // takes two Banes on the next Casting Test it makes*. Pummel was
  // `action({action: "reaction", note})` and applied NOTHING for as long as
  // it existed, because nothing in this system could carry a Bane laid on
  // another creature. The write goes through `CONFIG.queries` where the
  // target is not this client's, and a use with nothing targeted says so.
  const laidOn = [];
  if (sys.lays?.kind && (sys.lays.banes ?? 0) > 0) {
    for (const t of list) {
      const victim = targetActorOf(t);
      if (!victim) continue;
      const done = await layBane({ victim, kind: sys.lays.kind, banes: sys.lays.banes, source: item.name, by: actor });
      if (done) laidOn.push(victim.name);
    }
    if (!laidOn.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.LaidNone", { source: item.name }));
    }
  }

  // **04's SNAKE TRAP'S TESTS** (the lead, 2026-10-03, on O-178: *"Yes, Dexterity"*;
  // D-779): the poison named at step 1, stamped for the card - its tick and the
  // conditions its failure lays - and a Reflex Test at the poison's own DC on the
  // first creature the Snare names as caught, or on every one at rank 2. The dose
  // is one per trap at either rank (lead ruling, 2026-10-30).
  const trapPoisons = [];
  const trapTests = [];
  if (trapPoison && snake && success) {
    try {
      trapPoison = await spendSnakeTrapDose({ actor, feature: item, poison: trapPoison, ...trapDose });
      if (!trapPoison?.system?.use) throw new Error("Missing poison receipt");
    } catch {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.SnakeTrap.DoseUncertain"));
      return null;
    }
    const use = trapPoison.system?.use ?? {};
    const tick = poisonTick(use);
    trapPoisons.push({ name: trapPoison.name, tick: tick ? layTick(tick, { source: actor.uuid, name: trapPoison.name }) : null, statuses: [...(use.statuses ?? [])] });
    // A Snare is set before anything enters it, so the creatures it catches are
    // usually named later: with none targeted at the Use, one button reaches the
    // tokens the table selects - the first caught, or every one in the radius at
    // rank 2 - as the Snare's own Inflict does.
    const test = { resilience: snake.resilience, label: AZEROTH.resiliences[snake.resilience], dc: use.resist?.dc ?? null, poison: trapPoison.name };
    for (const t of snakeTrapCatches(list.map((row, index) => ({ ...row, index })), { reach: snake.reach })) {
      trapTests.push({ ...test, named: true, index: t.index, name: t.name ?? "" });
    }
    if (!trapTests.length) trapTests.push({ ...test, named: false, index: null, name: game.i18n.localize(snake.reach === "all" ? "AZEROTH.SnakeTrap.Everyone" : "AZEROTH.SnakeTrap.First") });
    usedLines.push(game.i18n.format("AZEROTH.SnakeTrap.Line", { talent: snake.name, poison: trapPoison.name }));
  }

  // 5. Strike a use.
  let uses = bellowPaidUses;
  if (sys.uses?.per && !bellowPaidUses) {
    await item.update({ "system.uses.value": Math.max(0, sys.uses.value - 1) });
    uses = { value: item.system.uses.value, max: sys.uses.max };
  }

  // The card names the pool that PAID (D-769): a Mana price in a Shapeshift
  // form came out of Ferocity, and `spent` is that Ferocity. `inForm` is the
  // state the price was judged in, before step 2b changed the shape.
  const paidFrom = payingPool(sys.cost?.pool ?? null, { inShapeshiftForm: inForm });
  // A price in 05 §11's kind word names the pool that paid it (02 §5's War Stomp: the
  // tauren's Rage, Quarry or Ferocity; the B8a pass).
  // A price from any pool names the pool picked (02 §5's Tail Sweep; the lead, 2026-11-09).
  const paidPool = paidFrom === ANY_MOMENTUM || paidFrom === ANY_POOL ? (pool?.name ?? paidFrom) : paidFrom;
  const costLabel = paidPool ? game.i18n.localize(AZEROTH.costPoolTypes[paidPool] ?? paidPool) : null;
  const content = await renderTemplate(TEMPLATE.feature, {
    config: AZEROTH,
    title: item.name,
    subtitle: sys.className,
    // The rung this Use was taken at (04's Ethereal Form's Reaction at rank 2; the B6 review).
    action: rungNow ?? sys.action,
    // A price paid on the success is what the success paid (D-775; the B8a2 pass).
    cost: costLabel ? { label: costLabel, text: sys.cost.all ? game.i18n.localize("AZEROTH.Feature.SpendAll") : String(spent + successPaid) } : null,
    uses,
    rolled: Boolean(roll),
    total: roll?.total ?? null,
    dc: resolvedDC,
    sl,
    // The Test's own verdict, whatever its success could pay for (the B8a2 pass).
    success: tested,
    verdict: roll ? verdictFor({ sl, success: tested }) : null,
    critical: roll?.outcome?.critical ?? false,
    fumble: roll?.outcome?.fumble ?? false,
    heal,
    speakerName: actor.name,
    damage: item.name === SNARE.feature ? null : damage,
    resist: item.name === SNARE.feature && damage ? null : resist,
    // One Resist row per creature the card records, each its owner's (the B6 fix).
    resistRows: item.name === SNARE.feature ? [] : resistRows,
    // The Snare's escape where Explosive Trap's half took the Resist (D-773).
    escape,
    // **AN AREA THE USE PLACED ITSELF IS NOT OFFERED AGAIN** (the B6 fix): a circle on
    // the ground the Use aimed and measured is set down below, once the card stands.
    area: gatherAt || gadgetCone || champ.facing ? null : area,
    attack,
    // How many attacks the button makes (the architect's review of D-773).
    attackAllowance,
    // A gadget's attack lays what it lays and deals no damage of its own (door 7).
    attackNoDamage: Boolean(gadgetAttack) && !(Number(gadgetAttack.damage) > 0),
    // Divine Storm's attacks gain no Zeal (02 SS7).
    noMomentum: attack && item.name === "Divine Storm",
    // The option chosen, or ALL of them where the use took several (D-710):
    // one name line naming each, and each one's block under it.
    chosen: chosen
      ? {
          ...chosen,
          name: picks.map(p => p.name).join(", ") || chosen.name,
          tag: picks.length > 1 ? null : chosen.tag,
          html: await enrich(picks.map(chosenHTML).join(""), { relativeTo: item })
        }
      : null,
    gained,
    // The creature the feature acts on, what it called (D-643), and where a
    // totem was planted (D-708).
    bound: await enrichBound(boundContext(actor, sys, called, dismissed, planted), item),
    // The Bane it laid, and on whom (06 SS6's Pummel, D-693).
    laid: laidOn.length
      ? {
          label: game.i18n.format(sys.lays.banes === 1 ? "AZEROTH.Reaction.LaidBy" : "AZEROTH.Reaction.LaidBanes", {
            source: item.name, n: sys.lays.banes,
            kind: game.i18n.localize(AZEROTH.testKinds[sys.lays.kind] ?? sys.lays.kind)
          }),
          names: laidOn.join(", ")
        }
      : null,
    effect: await enrich(sys.description, { relativeTo: item }),
    note: [
      restored !== null ? null : (sys.note ? game.i18n.localize(sys.note) : null),
      // What this use switched on (04, D-711 phase 2), said in words.
      buffed === null ? null : game.i18n.format(`AZEROTH.Feature.Buff.${buff.until}`, { name: item.name, n: buffed }),
      // What the talent's Use did beyond its descriptor (D-771), in words.
      ...usedLines,
      // A free shift (04's Savage Shift, D-771).
      shiftFree ? game.i18n.format("AZEROTH.Shape.FreeShift", { talent: "Savage Shift" }) : null
    ].filter(Boolean).join(" · ") || null,
    // The conditions the card offers on each target (D-771) - less what the measured
    // area laid at once, which the note says landed (the B6 fix).
    inflicts: landedAtOnce.length ? inflicts.filter(i => !landedAtOnce.includes(i)) : inflicts,
    // What the Apply lays at the start of each target's turns (02's Regrowth,
    // 04's Wild Growth; D-771), in words, and the Apply itself - or why a
    // counted tick with nothing to end it is not offered.
    tick: laidFeatureTick ? tickWords(laidFeatureTick) : null,
    tickNoClock: featureTickNoClock,
    applies: laidFeatureTick ? { self: false, targets: list.map((t, index) => ({ index, name: t.name })) } : null,
    // Each target's own share of the heal (D-774), where the heal splits.
    targets: list.map((t, index) => ({ ...t, index, healAmount: healByTarget[index] ?? null })),
    // **D-779's BUTTONS**: Lightwell's charge (the lead: *"Other players spend a
    // half-action to expend a charge."*) and Snake Trap's poison Test on each
    // creature caught (*"Yes, Dexterity"*).
    lightwell: well ? { left: well.charges, heal: well.heal } : null,
    poisonTests: trapTests,
    // A feature with no Casting Test has no roll to carry WHY its damage was what
    // it was, so the damage's own rows stand in (D-768).
    provenance: roll ? roll.provenance : damageProvenance
  });
  if (restored !== null) ui.notifications?.info(game.i18n.format("AZEROTH.Feature.Restored", { name: item.name, amount: restored }));

  // 04's Permafrost on a Slowed this card's Inflict lays (Hurricane's; D-778).
  const featureSlowing = (sys.inflicts ?? []).some(i => i?.condition === "slowed") ? slowingFor(talentsNow) : null;
  const posted = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    // The Long Watch's Use is seen by the user's owners alone (door 18; the lead: *"Yes"*).
    ...(marking?.kind === "watch" ? { whisper: ownersOf(actor) } : {}),
    // The Casting Tests a Dispel's gates made (04's Everlasting Affliction, D-778) ride beside the Use's own.
    rolls: [...(roll ? [roll] : []), ...extraRolls],
    flags: { "azeroth-rpg": { kind: "feature", itemId: item.id, targets: list, damageByTarget, heal: healsBound ? null : healAmount, sl, area,
      // 04's Lifebinder's Flame on a Fire Breath (D-845): the heal the split owes, landed once the card stands.
      ...(lifebinderRecord ? { lifebinder: lifebinderRecord } : {}),
      ...(bellowResults.length ? { bellowDelivery: { version: 1, sourceUuid: actor.uuid, journalKey: bellowJournal?.key, recipients: bellowResults } } : {}),
      ...(grantingTalent?.system?.identifier === "mind-control" && resist && success ? {
        mindControlCast: { version: 1, casterUuid: actor.uuid, featureUuid: item.uuid, dc: resist.dc }
      } : {}),
      ...(spellLock ? { spellLockCaster: actor.uuid, spellLockCasts: [spellLock.castId] } : {}),
      ...(gadget?.onUse?.aim ? { gadgetTarget: { actorUuid: targetActorOf(list[0])?.uuid ?? "", name: list[0]?.name ?? "" } } : {}),
      ...(gadget?.onUse?.shrink ? { gadgetShrink: { amount: tierNow } } : {}),
      ...(gadgetCone ? { gadgetTargets: list.map(t => ({ actorUuid: targetActorOf(t)?.uuid ?? "", name: t.name ?? "" })), gadgetCone } : {}),
      ...(areaPush ? { push: { feet: areaPush.feet, from: "area", toward: "away", by: areaPush.by.join(", ") } } : {}),
      ...(featureSlowing ? { slowing: { feet: featureSlowing.feet, source: featureSlowing.by.join(", ") } } : {}),
      // The card's Attack allowance, counted by each press (the architect's
      // review of D-773), and 02's Snare, whose Inflict marks its own Entangled.
      ...(attack ? { attacks: { allowed: attackAllowance } } : {}),
      // And the Boon each attack gains (04's Fan of Knives at rank 2: *each attack gains
      // a Boon*; the Legacy branches' door 26), drawn as a ticked line on its dialog.
      ...(attack && (barrageLimits?.boons ?? 0) > 0 ? { attackBoons: { boons: barrageLimits.boons, by: barrageLimits.by } } : {}),
      ...(item.name === SNARE.feature ? { snare: true } : {}),
      ...(heal && item.name === "Dreamwalk" ? { dreamstateHealed: actor.uuid } : {}),
      ...(explosiveTrap ? { explosiveTrap } : {}),
      // **WHAT THE CARD'S ATTACK IS MADE WITH, AND WHAT ITS HIT LAYS** (the Legacy
      // branches' door 7): the gadget's own (`dice/chat.mjs#attackFromCardNow`).
      ...(gadgetAttack ? { gadgetAttack: { name: item.name, range: Math.max(0, Math.trunc(Number(gadgetAttack.range)) || 0), maxRange: gadgetAttack.maxRange ?? null, damageType: gadgetAttack.damageType ?? null, damage: Math.max(0, Math.trunc(Number(gadgetAttack.damage)) || 0), inflicts: (gadgetAttack.inflicts ?? []).map(i => ({ ...i })) } } : {}),
      // **THE CONSTRUCT THE AREA IS AIMED FROM** (04's Cluster Rockets: *fires at a
      // point within 60 feet of it*; door 6): its token, and the feet the card's
      // Place area holds the point to (`dice/chat.mjs#placeAreaFromCard`).
      ...(aimFrom ? { aimFrom } : {}),
      // D-779: Lightwell's font (its Region, charges and heal), Snake Trap's poison
      // (the tick a failed Test lays, `dice/chat.mjs#rollResists`), and the schools
      // Divine Aegis was named for (read by the heal button and the tick).
      ...(well ? { lightwell: well } : {}),
      ...(trapPoisons.length ? { poisons: trapPoisons,
        snakeTrap: { version: 1, trapId: trapDose.trapId, reach: snake.reach, catches: [] } } : {}),
      ...(aegisNamed ? { aegis: aegisNamed } : {}),
      // Whether the Use's Casting Test succeeded (D-775): a failed one places
      // nothing (`dice/chat.mjs#placeAreaFromCard`) - and a success its price on the
      // success could not pay went off no more than a failure did (the B8a2 pass).
      ...(sys.casting ? { success } : {}),
      // Life Drain's drainer, Drawn Across's halving and a thrall's owner (door 25).
      ...spiritCardFlags(spiritsPlan, { actor, item, success }),
      // Each offered condition's escape (door 19), keyed by the condition.
      ...(Object.keys(inflictEscapes).length ? { inflictEscapes } : {}),
      // **WHAT THE CARD'S TEST GOVERNS, AND WHAT ITS DAMAGE IS** (the B6 fix; the lead:
      // *"Build it everywhere"*, *"Land automatically"*): the damage's type, which the
      // damage door records; the half a passed Test leaves on each row and on the one
      // button (`dice/chat.mjs#applyDamageToTargets`); the conditions a failed Resist
      // lands at once (`rollResists`); and the circle the Use measured, and where.
      ...(damage && (champ.breath?.school ?? sys.damage?.type) ? { damageType: champ.breath?.school ?? sys.damage.type } : {}),
      // What a Breath breathed (stage 2B): its school and its area, for the cue
      // (`rules/animation-table.mjs`' Breath rows) and the card's reader.
      ...(champ.breath ? { breath: { school: champ.breath.school, area: champ.breath.area, drake: champ.breath.drake ?? null } } : {}),
      ...(damage && damagePassed !== null ? { halfOnPass: true, passedByTarget, damagePassed } : {}),
      // And nothing on a pass, where the failure deals it (the B8a pass).
      ...(damage && noneOnPass && resist ? { noneOnPass: true } : {}),
      ...(resist && onFailInflicts.length ? { onFailInflicts } : {}),
      ...(gatherPlan && success ? { gathered: { who: gatherPlan.who, feet: gatherPlan.feet, origin: gatherPlan.origin,
        ...(gatherAt ? { at: { x: gatherAt.x, y: gatherAt.y, sceneId: canvas?.scene?.id ?? null } } : {}) } } : {}),
      // 02's Curse (D-775): the minutes a failed Resist's Bane lasts, Malediction's
      // and Everlasting Affliction's added (`dice/chat.mjs#rollResists`).
      ...(curse && success && !successShort ? { curse: { minutes: curse.minutes } } : {}),
      // 04's Firestorm (D-775): what `dice/chat.mjs#regionFlagsFromCard` copies onto
      // the Region - which Use placed it, who holds it, the tick and its span.
      ...(useAreaTick ? {
        cast: useCast, caster: actor.uuid, source: null, identifier: grantingTalent?.system?.identifier ?? null,
        sustained: false, areaTick: useAreaTick, lasts: { rounds: useAreaTick.lasts?.rounds ?? null },
        spellDC: actor.system.spellDC ?? actor.system.spells?.dc ?? null, spellName: item.name, spellImg: item.img
      } : {}),
      choice: chosen?.name ?? null, choices: picks.map(p => p.name),
      // The creatures the card's Attack buttons name (the lead's item 24), so
      // a press knows which one swings rather than taking the first bound.
      bound: sys.bound?.kind
        ? { kind: sys.bound.kind, action: sys.bound.action ?? null, uuids: boundOf(actor, sys.bound.kind).map(b => b.uuid) }
        : null,
      // **THE TICK THE APPLY LAYS** (D-771), in the keys D-657's door reads
      // (`dice/chat.mjs#applySpellEffectFromCard`): a feature's tick is laid by
      // the spell card's own Apply, keyed by the feature's uuid so a second Use
      // replaces the first on a creature. It lays nothing but the tick.
      ...(laidFeatureTick ? {
        tick: laidFeatureTick,
        applies: { changes: [], statuses: [] },
        caster: actor.uuid,
        spellUuid: item.uuid ?? null,
        spellName: item.name,
        spellImg: item.img,
        identifier: null,
        duration: null,
        effectHTML: await enrich(sys.description ?? "", { relativeTo: item })
      } : {}),
      // **WHO USED IT, WHICH FEATURE, AND WHAT IT MOVED, STOOD UP OR HELD** (the
      // Legacy branches' door 2; D-724's records): the token that acted, taken before
      // any pick; the key the feature's row is filed under; whether a Casting Test was
      // made (`success` beside it says how it went); each move a step made, centres
      // before and after; the tokens a summon, a construct, a totem or a revive stood
      // up; and a hit this Use turned into a miss. AFTER every spread above, since
      // Firestorm's area writes a `source` of its own, and records of what happened as
      // `damageByTarget` is - `module/animation/records.mjs#cardRecords` reads them.
      source: useSource ?? null,
      featureKey: useKey,
      casting: sys.casting === true,
      ...(stepsMade.length ? { steps: stepsMade } : {}),
      ...(risenMade.length ? { risen: risenMade } : {}),
      ...(holdMade ? { hold: holdMade } : {}) } }
  });
  if (bellowJournal) await bellowJournal.published(posted);
  // **THE BREATH'S SPLIT HEAL, ONCE THE CARD STANDS** (04's Lifebinder's Flame; D-845): the spell
  // door's own landing - every creature picked through the one healing door as a branch heal
  // (Kindling Heart reads it), Cleansing Fire, the Red Drake's tier - off the card's record.
  if (posted && lifebinderRecord) {
    try {
      const { landLifebinder } = await import("../effects/chromatic-talents.mjs");
      const healed = await landLifebinder(posted);
      if (healed.length) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: healed.map(l => `<p class="azeroth-drain">${foundry.utils.escapeHTML(l)}</p>`).join(""), flags: { "azeroth-rpg": { kind: "lifebinder", messageId: posted.id } } });
    } catch (err) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Lifebinder.Unresolved"));
      console.warn("azeroth-rpg | Lifebinder's Flame on a Breath", err);
    }
  }
  // **THE CIRCLE THE USE AIMED, SET DOWN WHERE IT WAS MEASURED** (the B6 fix; the lead:
  // *"Measure the area"*): a Use on the ground that gathered its targets at the point it
  // picked places its Region there once its card stands - with the card's own record on
  // it (`regionFlagsFromCard`), what a cue or a loop reads - and its card offers no Place
  // area. A Use whose Test failed places nothing (07 §8, D-775). Guarded: the board's
  // drawing never undoes the Use.
  if (posted && gatherAt && success && area && canvas?.scene && gathered(posted)) {
    try {
      const { regionFlagsFromCard } = await import("./chat.mjs");
      await placeArea({
        item, areaText: sys.area ?? "", name: item.name, scene: canvas.scene, origin: { x: gatherAt.x, y: gatherAt.y },
        rotation: 0, token: null, attach: false, flags: regionFlagsFromCard(posted, actor, item)
      });
    } catch (err) {
      // Said in words, never through `console.error` (CLAUDE.md §16: the smoke run fails
      // on any console error): the Use has been paid and its card stands.
      ui.notifications?.warn(game.i18n.format("AZEROTH.Gather.PlaceFailed", { feature: item.name }));
      console.warn("azeroth-rpg | a gathered area could not be drawn", err);
    }
  }
  // Hammer of Justice at rank 2 (D-772), after the card that paid for it.
  if (posted && gadgetCone && success && canvas?.scene) {
    try {
      const { regionFlagsFromCard } = await import("./chat.mjs");
      await placeArea({ item, areaText: sys.area, name: item.name, scene: canvas.scene,
        origin: gadgetCone.origin, rotation: gadgetCone.rotation, token: ownToken,
        attach: false, flags: regionFlagsFromCard(posted, actor, item) });
    } catch (err) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Gather.PlaceFailed", { feature: item.name }));
      console.warn("azeroth-rpg | gadget cone could not be drawn", err);
    }
  }
  // **A BREATH'S CONE, SET DOWN WHERE IT WAS AIMED** (stage 2B), as the gadget cone is:
  // the card's own record on it, the board's drawing never undoing the Use.
  if (posted && champ.facing && success && canvas?.scene) {
    try {
      const { regionFlagsFromCard } = await import("./chat.mjs");
      // **SHOWN WHILE ITS CUE PLAYS, THEN TAKEN AWAY** (the lead, 2026-11-08: *"Remove after
      // the cue"*): `afterCue` asks the active GM's area queue to delete it, marked as the
      // sweep's own so the deletion is never read as a hand delete (D-760).
      await placeArea({ item, areaText: champ.facing.area, name: item.name, scene: canvas.scene,
        origin: champ.facing.origin, rotation: champ.facing.rotation, token: ownToken,
        attach: false, flags: { ...regionFlagsFromCard(posted, actor, item), afterCue: BREATH_CUE_MS } });
    } catch (err) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Gather.PlaceFailed", { feature: item.name }));
      console.warn("azeroth-rpg | a Breath's cone could not be drawn", err);
    }
  }
  if (hammerFalls) await hammerAfterUse(actor, item, list);
  await completeSpellLockGates({ actor, rolls: extraRolls, message: posted });
  if (spellLock) {
    const aftermath = await completeSpellLockWindow({ actor, castId: spellLock.castId, message: posted });
    if (!aftermath?.ok) ui.notifications?.warn("The feature resolved, but Spell Lock's resistance or Silence could not be confirmed. Check the reaction records; do not repeat the feature.");
  }
  return posted;
}

/** Whether a feature's card records the circle its Use measured (the B6 fix). */
function gathered(message) {
  return Boolean(message?.flags?.["azeroth-rpg"]?.gathered);
}

/** The users who own this creature - its player and the GM - for a card only they see. */
function ownersOf(actor) {
  return (game.users?.contents ?? []).filter(u => actor?.testUserPermission?.(u, "OWNER")).map(u => u.id).sort();
}

/**
 * **WHERE THE WATCHED CREATURE IS, IN WORDS** (04's The Long Watch: *you know its
 * direction and rough distance*; door 18): `rules/marks.mjs#bearingTo` between the
 * user's token and the creature's on the scene being viewed, or that it cannot be
 * found there.
 *
 * @param {Actor} actor
 * @param {{tokenId?: string|null, sceneId?: string|null, name?: string}|null} mark
 * @returns {string}
 */
function watchBearingLine(actor, mark) {
  const own = actor?.getActiveTokens?.(true)?.[0] ?? null;
  const theirs = mark ? tokenOfTarget(mark) : null;
  const grid = canvas?.grid ?? null;
  const bearing = own && theirs ? bearingTo(own.center, theirs.center, { size: grid?.size ?? 100, distance: grid?.distance ?? 5 }) : null;
  const target = mark?.name ?? "";
  return bearing
    ? game.i18n.format("AZEROTH.Mark.Bearing", { target, feet: bearing.feet, direction: game.i18n.localize(`AZEROTH.Mark.Compass.${bearing.direction}`) })
    : game.i18n.format("AZEROTH.Mark.BearingUnmeasured", { target });
}

/**
 * **THE WATCH ASKED WITH NOTHING TARGETED** (door 18): where the watched creature
 * is, on a card the user's owners alone see, spending nothing - or that nobody is
 * watched.
 *
 * @param {Actor} actor
 */
async function reportWatch(actor) {
  const mark = cleanMark(actor?.getFlag?.("azeroth-rpg", WATCH_FLAG) ?? null);
  if (!mark) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Mark.NoWatch", { name: actor?.name ?? "" }));
    return null;
  }
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="azeroth-drain">${foundry.utils.escapeHTML(watchBearingLine(actor, mark))}</p>`,
    whisper: ownersOf(actor),
    flags: { "azeroth-rpg": { kind: "watch" } }
  });
}

/**
 * **HAMMER OF JUSTICE AT RANK 2, BROUGHT DOWN** (04: *also applies Hammer of
 * Justice to its target, or to one target of your choice if it had several,
 * costing no Mana and no action*; D-772): the Use's one target, or the one the
 * Paladin picks through the one chooser (D-673), cast through
 * `actions.mjs#castFreeSpell` - 07's spell with its own Casting Test and its
 * own Resist, charged neither Mana nor the turn's budget. A Use with no target
 * says so in words and casts nothing.
 *
 * @param {Actor} actor
 * @param {Item} item  the feature that paid the Zeal
 * @param {Array<object>} list  its target snapshots
 */
async function hammerAfterUse(actor, item, list) {
  if (!list.length) {
    ui.notifications?.info(game.i18n.format("AZEROTH.Hammer.NoTarget", { name: item.name, spell: HAMMER_OF_JUSTICE_SPELL }));
    return null;
  }
  let target = list[0];
  if (list.length > 1) {
    const options = list.map((t, index) => ({ key: String(index), name: t?.name ?? "", description: "" }));
    const pick = await chooseOption(item, options, null, { prompt: game.i18n.format("AZEROTH.Hammer.Choose", { spell: HAMMER_OF_JUSTICE_SPELL }) });
    if (!pick) return null;
    target = list[Number(pick.key)] ?? null;
  }
  if (!target) return null;
  // A dynamic import: `applications/actions.mjs` reaches this module through
  // the system's surface, and a static import would close a cycle.
  const { castFreeSpell } = await import("../applications/actions.mjs");
  return castFreeSpell(actor, HAMMER_OF_JUSTICE_SPELL, { by: HAMMER_OF_JUSTICE_SPELL, target });
}

/**
 * Use one of a creature's abilities or Boss Actions (D-647): the feature's
 * shape - refuse without a use, pay off the creature's pool by kind, a
 * Casting Test where it casts (Proficiency alone: 14 states no casting
 * attribute for a creature), the Resist line at the ability's DC, damage of
 * its type per target (untyped damage takes no Ward and no Immune), an area,
 * an Attack routed to the descriptor's own numbers, the condition it
 * inflicts as a button, a use struck. A `spell` kind is cast through
 * `actions.mjs#castNamedSpell` and never arrives here.
 */
export async function useAbility({ actor, list = "creatureAbilities", index = 0, dc = null, boons = 0, banes = 0, targets = null } = {}) {
  if (list === "creatureAbilities" && actor?.system?.creatureAbilities?.[index]?.name === "Arrival") {
    const { isInfernalArrival } = await import("../rules/infernal.mjs");
    if (isInfernalArrival(actor.system.creatureAbilities[index])) {
      ui.notifications?.info(game.i18n.localize("AZEROTH.Infernal.AutomaticArrival"));
      return null;
    }
  }
  if (list === "creatureAbilities" && actor?.system?.creatureAbilities?.[index]?.name === "Immolation") {
    const { isInfernalImmolation } = await import("../rules/infernal.mjs");
    if (isInfernalImmolation(actor.system.creatureAbilities[index])) {
      ui.notifications?.info(game.i18n.localize("AZEROTH.Infernal.AutomaticImmolation"));
      return null;
    }
  }
  if (list === "creatureAbilities" && actor?.system?.creatureAbilities?.[index]?.name === "Crushridge Kin") {
    const { resumeCrushridgeDeath } = await import("../effects/crushridge-death-resume.mjs");
    const result = await resumeCrushridgeDeath(actor);
    if (!result?.ok) ui.notifications?.warn("Crushridge Kin reviews a saved death on the active GM's client. There must be a pending observed death; partially applied effects require reconciliation.");
    return result;
  }
  // This control is GM encounter maintenance, never a paid cast or a manual
  // death burst. It remains accessible while the creature is incapacitated.
  if (list === "creatureAbilities" && actor?.system?.creatureAbilities?.[index]?.name === "Dying Mind") {
    const { resetDyingMind } = await import("../effects/mindslayer-death.mjs");
    return resetDyingMind(actor);
  }
  if (list === "creatureAbilities" && actor?.system?.creatureAbilities?.[index]?.name === "Unraveling Mana") {
    const { resetAberrationDeath } = await import("../effects/arcane-aberration-death.mjs");
    return resetAberrationDeath(actor);
  }
  if (list === "creatureAbilities" && actor?.system?.creatureAbilities?.[index]?.name === "Aberration Arcane Blast") {
    const { requestAberrationBlast } = await import("../effects/arcane-aberration-blast.mjs");
    return requestAberrationBlast(actor, index);
  }
  if (list === "creatureAbilities" && actor?.system?.creatureAbilities?.[index]?.name === "Obsidian Reservoir") {
    const { resetDestroyerEncounter } = await import("../effects/obsidian-encounter.mjs");
    return resetDestroyerEncounter(actor);
  }
  if (list === "creatureAbilities" && actor?.system?.creatureAbilities?.[index]?.name === "Sentinel Pack") {
    const { manageSentinelPack } = await import("../effects/anubisath-pack-menu.mjs");
    return manageSentinelPack(actor);
  }
  if (refuseAncientDespair(actor, "ability")) return null;
  // A creature under Hex or Polymorph uses none of its abilities (D-808).
  if (actor?.refuseForcedShape?.("ability")) return null;
  const row = actor?.system?.[list]?.[index] ?? null;
  const a = row?.automation ?? null;
  // An announcement presents a GM-adjudicated action without resolving it.
  // No resource, action budget, movement, target condition or summon is written.
  if (row && actor?.isOwner && (a?.kind ?? "none") === "none" && PRESENTATION_ONLY_ABILITIES.includes(row.name)) {
    // 06 §10 (door 10): a spirit announces nothing either (the audit's F10).
    const spiritAnnounce = realmRefusalFor(actor, "ability");
    if (spiritAnnounce) {
      ui.notifications?.warn(spiritAnnounce);
      return null;
    }
    // **AN ANNOUNCED BOSS ACTION SPENDS ITS POINTS** (D-809; D-807's open item): claimed
    // once, through the points' one writer, before the card is posted.
    let announced = null;
    if (list === "bossActions") {
      announced = await claimBossPoints(actor, row);
      if (!announced.ok) return null;
    }
    const source = (await import("../applications/roll-dialog.mjs")).sourceOf(actor);
    const content = await renderTemplate(TEMPLATE.feature, {
      config: AZEROTH, title: row.name, subtitle: actor.name,
      effect: await enrich(row.description, { relativeTo: actor }),
      note: game.i18n.localize("AZEROTH.Animation.AnnouncementNote"),
      bossPoints: announced ? { cost: announced.cost, left: announced.left, max: actor.system?.bossPoints?.max ?? null } : null,
      targets: [], speakerName: actor.name
    });
    return ChatMessage.create(ChatMessage.applyMode({ speaker: ChatMessage.getSpeaker({ actor }), content,
      flags: { "azeroth-rpg": { kind: "ability", list, index, title: row.name,
        source, targets: [], featureKey: abilityKeyOf(row.name), casting: false,
        success: true, presentationOnly: true, ...(announced ? { bossAction: true } : {}) } } }));
  }
  // **CUTTING GEAR** (the lead, 2026-10-22: *"Give constructs a trait or ability that
  // allows them to end one Entangled condition per turn no action required."*): by its
  // NAME, its own door (`effects/legacy-uses.mjs#useCuttingGear`) - no action, once a turn.
  if (row && holdsCuttingGear([row])) return useCuttingGear(actor);
  if (!row || !hasAutomation(a) || a.kind === "spell") return null;
  // 06 §10 (door 10): a spirit touches nothing, whatever its block says.
  const spiritAbility = realmRefusalFor(actor, "ability");
  if (spiritAbility) {
    ui.notifications?.warn(spiritAbility);
    return null;
  }
  const lst = targets ?? [];
  // **EVERYTHING A BOSS ACTION JUDGES AND PICKS BEFORE IT SPENDS** (D-809; D-768's
  // order): the circle it gathers where nobody is targeted, a space, a facing, an ally,
  // a class or a corpse - a pick dismissed or refused spends nothing.
  let bossPre = null;
  if (list === "bossActions") {
    const judged = bossPressJudgement({ points: actor.system?.bossPoints ?? {}, cost: row.cost ?? 1,
      turnKey: bossTurnKey(actor.activeFight?.() ?? null), lastTurnKey: actor.getFlag?.("azeroth-rpg", "bossPress")?.turnKey ?? null });
    if (!judged.ok) {
      ui.notifications?.warn(bossRefusalWords(actor, row, judged));
      return null;
    }
    bossPre = await prepareBossPress({ actor, row, targets: lst });
    if (!bossPre.ok) return null;
    lst.splice(0, lst.length, ...bossPre.targets);
  }
  if (list === "creatureAbilities" && row.name === "Pack Rekindling") {
    const { configureCoreHoundPack } = await import("../effects/core-hound-pack-configure.mjs");
    return configureCoreHoundPack(actor);
  }
  if (list === "creatureAbilities" && row.name === "Ancient Special") {
    const { configureAncientSpecial } = await import("../effects/ancient-core-hound-choice.mjs");
    return configureAncientSpecial(actor);
  }
  if (list === "creatureAbilities" && row.name === "Serrated Bite") {
    const { useSerratedBite } = await import("../effects/serrated-bite-use.mjs");
    return useSerratedBite(actor, index, lst);
  }
  if (list === "creatureAbilities" && ["Sticky Tar", "Burning Tar"].includes(row.name)) {
    ui.notifications?.info(game.i18n.localize("AZEROTH.Tar.TriggeredUse"));
    return null;
  }
  if (list === "creatureAbilities" && row.name === "Entangling Roots") {
    const { requestBloodpetalRoots } = await import("../effects/bloodpetal-use.mjs");
    return requestBloodpetalRoots(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Nullify Mana") {
    const { requestNullifyMana } = await import("../effects/nullify-mana.mjs");
    return requestNullifyMana(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Dire Growl") {
    const { requestDireGrowl } = await import("../effects/dire-growl.mjs");
    return requestDireGrowl(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Sonic Burst") {
    const { requestSonicBurst } = await import("../effects/sonic-burst.mjs");
    return requestSonicBurst(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Smash") {
    const { requestMoltenSmash } = await import("../effects/molten-smash.mjs");
    return requestMoltenSmash(actor, index);
  }
  if (list === "creatureAbilities" && ["Knock Away", "Sentinel Knock Away"].includes(row.name)) {
    const { requestKnockAway } = await import("../effects/knock-away.mjs");
    return requestKnockAway(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Plague Cloud") {
    const { requestPlagueCloud } = await import("../effects/plague-cloud-use.mjs");
    return requestPlagueCloud(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Lightning Cloud") {
    const { requestLightningCloud } = await import("../effects/lightning-cloud-use.mjs");
    return requestLightningCloud(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Summon Earth Rumbler") {
    const { requestStoneGuardian } = await import("../documents/stone-guardian.mjs");
    return requestStoneGuardian(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Summon Fire Elemental") {
    const { requestFireGuardian } = await import("../documents/fire-guardian.mjs");
    return requestFireGuardian(actor, index);
  }
  if (list === "creatureAbilities" && ["Summon Imp Guardian", "Summon Voidwalker Guardian", "Summon Hellcaller Guardian"].includes(row.name)) {
    const { requestDemonGuardian } = await import("../documents/demon-guardian.mjs");
    return requestDemonGuardian(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Raise Alarm") {
    const { requestMobileAlert } = await import("../effects/mobile-alert-use.mjs");
    return requestMobileAlert(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Searing Totem") {
    const { requestNpcSearingTotem } = await import("../documents/npc-searing-totem.mjs");
    return requestNpcSearingTotem(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Summon Carrion Scarab") {
    const { requestCarrionScarab } = await import("../documents/carrion-scarab-use.mjs");
    return requestCarrionScarab(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Image Projection") {
    const { requestImageProjection } = await import("../documents/image-projection-use.mjs");
    return requestImageProjection(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Tutor Silence") {
    const { requestTutorSilence } = await import("../effects/tutor-silence-use.mjs");
    return requestTutorSilence(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Banshee Curse") {
    const { requestBansheeCurse } = await import("../effects/banshee-curse-use.mjs");
    return requestBansheeCurse(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Vilebranch Shrink") {
    const { requestVilebranchShrink } = await import("../effects/vilebranch-shrink-use.mjs");
    return requestVilebranchShrink(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Tetanus") {
    const { requestTetanus } = await import("../effects/tetanus-use.mjs");
    return requestTetanus(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Inner Fire") {
    const { requestInnerFire } = await import("../effects/inner-fire-use.mjs");
    return requestInnerFire(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Sneak") {
    const { requestNpcSneak } = await import("../effects/npc-sneak-use.mjs");
    return requestNpcSneak(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Disarm") {
    const { requestNpcDisarm } = await import("../effects/npc-disarm-use.mjs");
    return requestNpcDisarm(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Shield Slam") {
    const { requestNpcShieldSlam } = await import("../effects/npc-shield-slam-use.mjs");
    return requestNpcShieldSlam(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Whirlwind") {
    const { requestWhirlwind } = await import("../effects/syndicate-whirlwind-use.mjs");
    return requestWhirlwind(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Fallen-Kin Rage") {
    const { requestCrushridgeExtraAttack } = await import("../effects/crushridge-extra-attack-use.mjs");
    return requestCrushridgeExtraAttack(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Death Singer Screech") {
    const { requestDeathSingerScreech } = await import("../effects/death-singer-screech-use.mjs");
    return requestDeathSingerScreech(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Anti-Magic Shield") {
    const { requestAntiMagicShield } = await import("../effects/anti-magic-shield-use.mjs");
    return requestAntiMagicShield(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Cauterizing Flames") {
    const { requestCauterizingFlames } = await import("../effects/cauterizing-flames-use.mjs");
    return requestCauterizingFlames(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Ground Stomp") {
    const { requestGroundStomp } = await import("../effects/ground-stomp-use.mjs");
    return requestGroundStomp(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Ancient Hysteria") {
    const { requestAncientHysteria } = await import("../effects/ancient-hysteria-use.mjs");
    return requestAncientHysteria(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Ancient Dread") {
    const { requestAncientDread } = await import("../effects/ancient-dread-use.mjs");
    return requestAncientDread(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Ancient Despair") {
    const { requestAncientDespair } = await import("../effects/ancient-despair-use.mjs");
    return requestAncientDespair(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Withering Heat") {
    const { requestWitheringHeat } = await import("../effects/withering-heat-use.mjs");
    return requestWitheringHeat(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Dredge Sickness") {
    const { requestDredgeSickness } = await import("../effects/dredge-sickness-use.mjs");
    return requestDredgeSickness(actor, index);
  }
  if (list === "creatureAbilities" && ["Venom Spit", "Dredge Poison"].includes(row.name)) {
    const { requestDredgePoison } = await import("../effects/dredge-poison-use.mjs");
    return requestDredgePoison(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Maggot Slime") {
    const { requestMaggotSlime } = await import("../effects/maggot-slime-use.mjs");
    return requestMaggotSlime(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Wild Regeneration" && row.automation?.kind === "utility") {
    const { requestWildRegeneration } = await import("../effects/wild-regeneration-use.mjs");
    return requestWildRegeneration(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Jadefire" && row.automation?.kind === "utility") {
    const { requestJadefire } = await import("../effects/jadefire-use.mjs");
    return requestJadefire(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Cause Insanity") {
    const { requestCauseInsanity } = await import("../effects/cause-insanity-use.mjs");
    return requestCauseInsanity(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Qiraji Mind Flay") {
    const { requestQirajiMindFlay } = await import("../effects/qiraji-mind-flay-use.mjs");
    return requestQirajiMindFlay(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Drain Mana") {
    const { requestDestroyerDrain } = await import("../effects/obsidian-drain-use.mjs");
    return requestDestroyerDrain(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Obsidian Purge") {
    const { requestDestroyerPurge } = await import("../effects/obsidian-purge-use.mjs");
    return requestDestroyerPurge(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Sleep" && row.automation?.kind === "utility") {
    const { requestDreadlordSleep } = await import("../effects/dreadlord-sleep-use.mjs");
    return requestDreadlordSleep(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Enveloping Winds" && row.automation?.kind === "utility") {
    const { requestEnvelopingWinds } = await import("../effects/enveloping-winds-use.mjs");
    return requestEnvelopingWinds(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Enveloping Gale" && row.automation?.kind === "utility") {
    const { requestEnvelopingGale } = await import("../effects/enveloping-gale-use.mjs");
    return requestEnvelopingGale(actor, index);
  }
  if (list === "creatureAbilities" && ["Blazing Wave", "Searing Pulse", "Felguard Blast Wave"].includes(row.name) && row.automation?.kind === "utility") {
    const { requestBlazingAbility } = await import("../effects/blazing-invader-use.mjs");
    return requestBlazingAbility(actor, index);
  }
  if (list === "creatureAbilities" && ["Flame Buffet", "Fireball Volley"].includes(row.name) && row.automation?.kind === "utility") {
    const { requestCharrAbility } = await import("../effects/charr-use.mjs");
    return requestCharrAbility(actor, index);
  }
  if (list === "creatureAbilities" && ["Crushing Knockdown", "Avalanchion's Trample", "Ground Tremor", "Hurled Boulder"].includes(row.name) && row.automation?.kind === "utility") {
    const { requestEarthInvasionAbility } = await import("../effects/earth-invasion-use.mjs");
    return requestEarthInvasionAbility(actor, index);
  }
  if (list === "creatureAbilities" && ["Torment", "Suffering", "Soothing Kiss"].includes(row.name) && row.automation?.kind === "utility") {
    const { requestDemonTaunt } = await import("../effects/demon-taunt-use.mjs");
    return requestDemonTaunt(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Lash of Pain" && row.automation?.kind === "utility") {
    const { requestLashOfPain } = await import("../effects/lash-of-pain-use.mjs");
    return requestLashOfPain(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Consume Shadows" && row.automation?.kind === "utility") {
    const { requestConsumeShadows } = await import("../effects/consume-shadows-use.mjs");
    return requestConsumeShadows(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Blood Pact" && row.automation?.kind === "utility") {
    const { requestBloodPact } = await import("../effects/blood-pact-use.mjs");
    return requestBloodPact(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Fire Shield" && row.automation?.kind === "utility") {
    const { requestFireShield } = await import("../effects/fire-shield-use.mjs");
    return requestFireShield(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Spell Lock") {
    ui.notifications?.info("Spell Lock is offered to the GM when a creature within 30 feet makes a Casting Test. Choose it in that reaction window; this button spends nothing.");
    return null;
  }
  if (list === "creatureAbilities" && row.name === "Phase Shift") {
    ui.notifications?.info("Use Phase Shift on the incoming attack's chat card. This button spends nothing.");
    return null;
  }
  if (list === "creatureAbilities" && row.name === "Tainted Blood") {
    const { requestTaintedBlood } = await import("../effects/tainted-blood-use.mjs");
    return requestTaintedBlood(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Lesser Invisibility" && row.automation?.kind === "utility") {
    const { requestLesserInvisibility } = await import("../effects/lesser-invisibility-use.mjs");
    return requestLesserInvisibility(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Frost Shot" && row.automation?.kind === "utility") {
    const { requestFrostShot } = await import("../effects/frost-shot-use.mjs");
    return requestFrostShot(actor, index, lst);
  }
  if (list === "creatureAbilities" && ["Sentinel Mortal Strike", "Mortal Strike"].includes(row.name) && row.automation?.kind === "utility") {
    const { requestSentinelStrike } = await import("../effects/sentinel-strike-use.mjs");
    return requestSentinelStrike(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Sentinel Mana Burn" && row.automation?.kind === "utility") {
    const { requestSentinelManaBurn } = await import("../effects/sentinel-mana-burn-use.mjs");
    return requestSentinelManaBurn(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Reaver Cleave" && row.automation?.kind === "utility") {
    const { requestReaverCleave } = await import("../effects/reaver-cleave-use.mjs");
    return requestReaverCleave(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Guard Cleave" && row.automation?.kind === "utility") {
    const { requestGuardCleave } = await import("../effects/guard-cleave-use.mjs");
    return requestGuardCleave(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Ghoul Cleave" && row.automation?.kind === "utility") {
    const { requestGhoulCleave } = await import("../effects/ghoul-cleave-use.mjs");
    return requestGhoulCleave(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Mighty Blow" && row.automation?.kind === "utility") {
    const { requestMightyBlow } = await import("../effects/mighty-blow-use.mjs");
    return requestMightyBlow(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Royal Trample" && row.automation?.kind === "utility") {
    const { requestRoyalTrample } = await import("../effects/royal-trample-use.mjs");
    return requestRoyalTrample(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Terrifying Roar" && row.automation?.kind === "utility") {
    const { requestTerrifyingRoar } = await import("../effects/terrifying-roar-use.mjs");
    return requestTerrifyingRoar(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Geyser" && row.automation?.kind === "utility") {
    const { requestGeyser } = await import("../effects/geyser-use.mjs");
    return requestGeyser(actor, index);
  }
  if (list === "creatureAbilities" && ["Localized Toxin", "Deadly Poison"].includes(row.name) && row.automation?.kind === "utility") {
    const { requestToxicPoison } = await import("../effects/toxic-horror-use.mjs");
    return requestToxicPoison(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Chilled" && row.automation?.kind === "utility") {
    const { requestChilled } = await import("../effects/chilled-use.mjs");
    return requestChilled(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Vicious Rend" && row.automation?.kind === "utility") {
    const { requestViciousRend } = await import("../effects/vicious-rend-use.mjs");
    return requestViciousRend(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Guard Net" && row.automation?.kind === "utility") {
    const { requestGuardNet } = await import("../effects/guard-net-use.mjs");
    return requestGuardNet(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Ghoul Enrage" && row.automation?.kind === "utility") {
    const { requestGhoulEnrage } = await import("../effects/ghoul-enrage-use.mjs");
    return requestGhoulEnrage(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Rending Claws" && row.automation?.kind === "utility") {
    const { requestRendingClaws } = await import("../effects/rending-claws-use.mjs");
    return requestRendingClaws(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Flesh Rot" && row.automation?.kind === "utility") {
    const { requestFleshRot } = await import("../effects/flesh-rot-use.mjs");
    return requestFleshRot(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Reaver Enrage" && row.automation?.kind === "utility") {
    const { requestReaverEnrage } = await import("../effects/reaver-enrage-use.mjs");
    return requestReaverEnrage(actor, index);
  }
  if (list === "creatureAbilities" && row.name === "Predatory Enrage" && row.automation?.kind === "utility") {
    const { requestPredatoryEnrage } = await import("../effects/predatory-enrage-use.mjs");
    return requestPredatoryEnrage(actor, index);
  }
  if (list === "creatureAbilities" && ["Golem Stomp", "Golem Trample"].includes(row.name) && row.automation?.kind === "utility") {
    const { requestWarGolemAttack } = await import("../effects/war-golem-use.mjs");
    return requestWarGolemAttack(actor, index, row.name === "Golem Stomp" ? "stomp" : "trample");
  }
  if (list === "creatureAbilities" && ["Fireguard Immolate", "Fireguard Fire Blast"].includes(row.name) && row.automation?.kind === "utility") {
    const { requestFireguardCast } = await import("../effects/fireguard-use.mjs");
    return requestFireguardCast(actor, index, row.name === "Fireguard Immolate" ? "immolate" : "blast");
  }
  if (list === "creatureAbilities" && row.name === "Demoralizing Roar" && row.automation?.kind === "utility") {
    const { requestDemoralizingRoar } = await import("../effects/demoralizing-roar-use.mjs");
    return requestDemoralizingRoar(actor, index);
  }
  if (list === "creatureAbilities" && ["Qiraji Cleave", "Vengeance"].includes(row.name) && row.automation?.kind === "utility") {
    const { requestChampionStrikes } = await import("../effects/qiraji-champion-use.mjs");
    return requestChampionStrikes(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Frightening Shout" && row.automation?.kind === "utility") {
    const { requestChampionShout } = await import("../effects/qiraji-shout.mjs");
    return requestChampionShout(actor, index, lst);
  }
  if (list === "creatureAbilities" && ["Sunder Armor", "Fist of Ragnaros", "Shadow Shock", "Qiraji Mind Blast", "Sentinel Shadow Storm", "Sentinel Thunderclap"].includes(row.name)
    && row.automation?.kind === "utility") {
    const { requestFlamewakerAbility } = await import("../effects/flamewaker-use.mjs");
    return requestFlamewakerAbility(actor, index);
  }
  if (list === "creatureAbilities" && ["Elder Thrash", "Pummel"].includes(row.name)) {
    const { requestElderAbility } = await import("../effects/elder-diemetradon.mjs");
    return requestElderAbility(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Stinger Charge") {
    const { requestStingerCharge } = await import("../effects/vekniss-charge-use.mjs");
    return requestStingerCharge(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Vekniss Itch") {
    const { requestVeknissItch } = await import("../effects/vekniss-use.mjs");
    return requestVeknissItch(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Mass Nullify") {
    const { requestMassNullify } = await import("../effects/nullifier-use.mjs");
    return requestMassNullify(actor, index, lst);
  }
  if (list === "creatureAbilities" && row.name === "Reflection Field") {
    const { requestReflectionField } = await import("../effects/reflection-use.mjs");
    return requestReflectionField(actor, index, lst);
  }
  // **A CREATURE'S ABILITY WHOSE DESCRIPTOR CARRIES A PLAN TAKES THE SAME DOORS** (D-811;
  // `rules/creature-plans.mjs`): judged and picked here - after the doors routed by name, before anything is spent, carried on
  // the card and landed after it - and nothing of a Boss Action's points.
  const creaturePlan = list === "creatureAbilities" && hasCreaturePlan(a);
  if (creaturePlan) {
    bossPre = await prepareBossPress({ actor, row, targets: lst });
    if (!bossPre.ok) return null;
    lst.splice(0, lst.length, ...bossPre.targets);
  }
  const first = lst[0] ?? null;
  // **WHO USED IT, TAKEN NOW** (D-724; the Legacy branches' door 2): the creature's
  // token by the roll dialog's own rule, for the card's record.
  const abilitySource = (await import("../applications/roll-dialog.mjs")).sourceOf(actor);

  if (list === "creatureAbilities" && row.name === "Seduction") {
    const { seductionTargetValid } = await import("../effects/seduction-target.mjs");
    if (!seductionTargetValid(actor, abilitySource, lst)) {
      ui.notifications?.warn("Seduction requires one creature within 30 feet on the same scene level.");
      return null;
    }
  }

  if (list === "creatureAbilities" && ["Tendon Rip", "Terrify"].includes(row.name)) {
    const { tendonRipTargetValid } = await import("../effects/tendon-rip.mjs");
    if (!tendonRipTargetValid(actor, abilitySource, lst)) {
      ui.notifications?.warn(game.i18n.localize(row.name === "Terrify"
        ? "AZEROTH.Terrify.TargetRequired" : "AZEROTH.TendonRip.TargetRequired"));
      return null;
    }
  }
  if (list === "creatureAbilities" && row.name === "Surge Shock") {
    const { surgeShockTargetValid } = await import("../effects/surge-shock.mjs");
    if (!surgeShockTargetValid(actor, abilitySource, lst)) {
      ui.notifications?.warn("Surge Shock requires one other creature within 30 feet on the same scene.");
      return null;
    }
  }
  if (list === "creatureAbilities" && row.name === "Frost Shock") {
    const { frostShockTargetValid } = await import("../effects/frost-shock.mjs");
    if (!frostShockTargetValid(actor, abilitySource, lst)) {
      ui.notifications?.warn("Frost Shock requires one other creature within 30 feet on the same scene level.");
      return null;
    }
  }
  if (list === "creatureAbilities" && row.name === "Shock") {
    const { windreaverShockTargetValid } = await import("../effects/windreaver-shock.mjs");
    if (!windreaverShockTargetValid(actor, abilitySource, lst)) {
      ui.notifications?.warn("Shock requires one other living creature within 20 feet on the same scene level.");
      return null;
    }
  }
  if (list === "creatureAbilities" && row.name === "Acid Spit") {
    const { acidSpitTargetValid } = await import("../effects/acid-spit.mjs");
    if (!acidSpitTargetValid(actor, abilitySource, lst)) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.AcidSpit.TargetRequired"));
      return null;
    }
  }

  // 1. A use left?
  const usesMax = a.uses?.max ?? 0;
  const usesLeft = usesMax > 0 ? (a.uses.value ?? usesMax) : null;
  if (usesMax > 0 && usesLeft <= 0) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NoUses", { name: row.name }));
    return null;
  }

  // 1b. THE ROUND'S BOSS ACTION POINTS, or the turn's budget (14 §1, D-691).
  // A Boss Action is neither a Half-Action nor a Reaction, so it spends the
  // points and nothing else; everything else spends the ability's action.
  const isBossAction = list === "bossActions";
  let bossSpend = null;
  if (isBossAction) {
    bossSpend = bossPressJudgement({ points: actor.system?.bossPoints ?? {}, cost: row.cost ?? 1 });
    if (!bossSpend.ok) {
      ui.notifications?.warn(bossRefusalWords(actor, row, bossSpend));
      return null;
    }
  }

  // 1c. **THE POOL IS ASKED BEFORE ANYTHING IS SPENT** (D-768; the lead,
  // 2026-10-03: *Keeps the Half-Action*). The budget - or a Boss's points -
  // was spent first and a short pool refused after, so a refused ability cost
  // the creature its Half-Action or its Boss Actions for nothing.
  let payFrom = null;
  let abilityPayer = actor;
  let suretyTools = null, suretyQuote = null;
  if (list === "creatureAbilities" && a.cost?.pool === "power" && a.cost.amount > 0 && a.cost.amount <= 6
    && actor.getFlag?.("azeroth-rpg", "bond")?.kind === "demon") {
    suretyTools = await import("../effects/thematic-fel.mjs");
    const quote = await suretyTools.claimFelSuretyForAbility({demon: actor, ability: row, list, index, attemptId: foundry.utils.randomID()});
    if (quote?.ok) {
      suretyQuote = quote;
      abilityPayer = quote.payer === "warlock" ? fromUuidSync(quote.casterUuid) : actor;
      payFrom = abilityPayer?.poolSnapshot?.().find(p => p.itemId === quote.payerPool?.itemId
        && p.kind === quote.payerPool?.kind && p.name === quote.payerPool?.name) ?? null;
      if (!abilityPayer?.testUserPermission(game.user, "OWNER") || !payFrom) {
        await suretyTools.releaseFelSuretyClaim(quote);
        ui.notifications?.warn("Fel Surety's payer could not be confirmed. Nothing was spent.");
        return null;
      }
    }
  }
  if (a.cost?.pool && (a.cost.amount ?? 0) > 0) {
    payFrom ??= (actor.poolSnapshot?.() ?? []).find(p => p.kind === a.cost.pool) ?? null;
    if (!payFrom || payFrom.value < a.cost.amount) {
      if (suretyQuote) await suretyTools.releaseFelSuretyClaim(suretyQuote);
      const label = game.i18n.localize(AZEROTH.npcPoolKinds[a.cost.pool] ?? a.cost.pool);
      ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NoPool", { name: row.name, pool: label, amount: a.cost.amount }));
      return null;
    }
  }

  // 1d. Spend: the Boss Action points, marked off before anything else is paid
  // as a shot is (D-641), or the turn's budget.
  // **THE POINTS' ONE WRITER** (D-809): judged again and written once where it is
  // written, a double press and a second client included; refused in words with
  // nothing spent.
  if (isBossAction) {
    const claimed = await claimBossPoints(actor, row);
    if (!claimed.ok) {
      if (suretyQuote) await suretyTools.releaseFelSuretyClaim(suretyQuote);
      return null;
    }
    bossSpend = claimed;
  } else if (!(await spendTurnBudget(actor, a.action ?? null))) {
    if (suretyQuote) await suretyTools.releaseFelSuretyClaim(suretyQuote);
    return null;
  }

  // 2. Pay, off the creature's pool of that kind.
  let spent = 0;
  if (payFrom) {
    spent = a.cost.amount;
    const currentPool = abilityPayer.poolSnapshot?.().find(p => p.itemId === payFrom.itemId && p.kind === payFrom.kind && p.name === payFrom.name) ?? payFrom;
    await abilityPayer.updatePool({ itemId: payFrom.itemId ?? null, kind: payFrom.kind, value: payFromNow(currentPool.value, spent).value });
  }
  if (suretyQuote) {
    try {
      const committed = await suretyTools.commitFelSuretyUse(suretyQuote);
      if (!committed?.ok) ui.notifications?.warn("This ability was paid. Fel Surety needs GM reconciliation; do not use the ability again to retry payment.");
    } catch (error) {
      ui.notifications?.warn("This ability was paid. Fel Surety needs GM reconciliation; do not use the ability again to retry payment.");
      console.warn("azeroth-rpg | Fel Surety payment acknowledgement", error);
    }
  }

  // This ability is committed now. Refused selections and payments above
  // leave concealment standing; a paid ability ends it even without a Test.
  await endLesserInvisibility(actor, { event: "ability" });

  // 3. The Test, where the ability casts.
  let roll = null;
  let spellLock = null;
  let sl = 0;
  let success = true;
  let resolvedDC = null;
  if (a.casting) {
    spellLock = await requestSpellLockWindow({ actor, source: abilitySource ?? null,
      test: { kind: "ability", list, index } });
    if (!spellLock?.ok) {
      ui.notifications?.warn("The casting reaction window could not be confirmed. No Casting Test was rolled. Check the ability's paid costs and reaction records before trying again.");
      return null;
    }
    const modifiers = [{ label: "AZEROTH.Sheet.Proficiency", value: actor.system.proficiency ?? 0 }];
    resolvedDC = dc ?? castingDC({ tier: actor.system.tier ?? 1, targetDefense: first?.defense ?? null });
    // **06 §5: A CASTING TEST MADE WHILE ENGAGED TAKES A BANE** (D-732's review).
    // This door has no dialog, so the measured Bane is added here and named on
    // the card, as the dialog's own automatic line would be.
    const engaged = engagedNow(actor);
    const invisibleTarget = situationalModifiers({ kind: "casting", targetLesserInvisible: first?.lesserInvisible === true })
      .automatic.find(line => line.id === "lesserInvisibleTarget");
    roll = AzerothRoll.build({ dc: resolvedDC, modifiers, boons, banes: banes + (engaged ? 1 : 0) + (invisibleTarget?.banes ?? 0) + spellLock.banes, kind: "casting", rollData: actor.getRollData() });
    roll.options.spellLock = { castId: spellLock.castId, banes: spellLock.banes };
    if (spellLock.banes > 0) roll.options.provenance.push({ label: "Spell Lock", value: null,
      formula: `${spellLock.banes} ${spellLock.banes === 1 ? "Bane" : "Banes"}` });
    if (invisibleTarget) {
      roll.options.provenance.push({ label: "AZEROTH.Dialog.Circumstance", value: null, formula: game.i18n.localize(invisibleTarget.label) });
    }
    if (engaged) {
      roll.options.provenance.push({ label: "AZEROTH.Dialog.Circumstance", value: null, formula: game.i18n.localize("AZEROTH.Modifier.EngagedCasting") });
    }
    await roll.evaluate();
    await actor.offerElunesRegard?.(roll);
    // A creature's ability that casts is a Casting Test too: Pummel answers a
    // caster whether the caster is a character or a Boss (06 §6, D-693).
    const spent = await spendLaidBanes(actor, "casting");
    if (spent.length) roll.options.provenance.push({ label: "AZEROTH.Modifier.LaidBane", value: null, formula: spent.join(", ") });
    // And a Boon somebody laid (04's Blessing on a creature fighting beside the
    // Paladin, D-772).
    const blessed = await spendLaidBoons(actor, "casting");
    if (blessed.length) roll.options.provenance.push({ label: "AZEROTH.Modifier.LaidBoon", value: null, formula: blessed.join(", ") });
    sl = roll.outcome.sl;
    success = roll.outcome.success;
  }

  // 4. The numbers.
  const testDC = abilityDC(a, actor.system);
  // A Boss Action's plan (D-809): read once for the heal, the summon and the card.
  const bossPlan = cleanBossPlan(a.plan);
  const heal = success && (a.heal ?? 0) > 0 ? {
    amount: a.heal, explanation: String(a.heal),
    // *Immol'thar ... recovers 5 Health*: the Boss's own (the audit's F5), never the target's.
    ...(bossPlan.selfHeal ? { self: true } : {}),
    // Stone Mends Stone's *18 instead*, the table's to choose.
    ...(bossPlan.healAlt ? { alt: bossPlan.healAlt } : {})
  } : null;
  // **A FAILED CASTING TEST FORCES NO RESIST** (D-775's rule for a casting Use, carried to
  // a creature's casting ability by the B8a2 pass): the ability did not go off.
  const resist = a.resist && success ? { key: a.resist, label: AZEROTH.resiliences[a.resist], dc: testDC } : null;
  // **WHAT A PASSED TEST LEAVES OF THE DAMAGE, OFF 14's WORDS** (the B8a2 pass; the lead:
  // *"Build them now"*, *"Build it everywhere"*): *or half on a Resilience (Reflex) Test* -
  // the half, each row's met by its own creature's mitigation - and the Wild Kodo's *makes a
  // Resilience (Reflex) Test at DC 14 or takes 3 damage* - none of it. The card's Apply lands
  // either on a creature whose Resist THIS card recorded as passed (`rules/resisted.mjs
  // #halvesFor`, `#sparedFor`); a failure, and a creature with no Test recorded, take the whole.
  const halfOnPass = Boolean(resist) && a.damage?.half === true;
  const noneOnPass = Boolean(resist) && !halfOnPass && a.damage?.onFail === true;
  let damage = null;
  let damageByTarget = [];
  let passedByTarget = [];
  let damagePassed = null;
  if (success && (a.damage?.amount ?? 0) > 0) {
    const type = a.damage.type ?? null;
    // 04's Drawn Across on the creature (door 25), its Boss Actions included: the damage
    // it deals halved, untyped damage too - and a passed Test's half after it.
    const halvedAbility = dealtHalvedBy(actor);
    const untypedOf = passed => {
      const worth = halvedAbility ? Math.floor(a.damage.amount / 2) : a.damage.amount;
      return {
        damage: passed ? passedHalf(worth) : worth, effectiveSL: sl, hit: true, immune: false, vulnerable: false, mitigation: 0,
        ...(halvedAbility ? { dealtHalved: true } : {}), ...(passed ? { passedHalf: true } : {})
      };
    };
    const mitigate = (t, { passed = false } = {}) => (type === null ? untypedOf(passed) : resolveDamage({
      rating: a.damage.amount, sl: 0, kind: type === "physical" ? "physical" : "magical", school: type,
      fireTakenBonus: t?.fireTakenBonus ?? 0,
      apByLocation: t?.apByLocation ?? {}, ward: t?.wardBySchool?.[type] ?? 0,
      // An ally's aura, after the Ward (D-755); the physical lane ignores it.
      schoolArmor: t?.schoolArmor?.[type] ?? 0,
      immune: t?.immune ?? [], vulnerable: t?.vulnerable ?? [], slAddsToDamage: false,
      dealtHalved: halvedAbility,
      // Half on a passed Test, before Armor Points and Ward (the B6 fix's reading).
      passedHalf: passed
    }));
    damageByTarget = lst.map(t => mitigate(t));
    if (halfOnPass) {
      passedByTarget = lst.map(t => mitigate(t, { passed: true }));
      damagePassed = mitigate(null, { passed: true }).damage;
    }
    const result = damageByTarget[0] ?? mitigate(null);
    damage = {
      final: result.damage,
      explanation: [spellDamageExplanation(result, a.damage.amount), noneOnPass ? game.i18n.localize("AZEROTH.Card.DamageOnFail") : null].filter(Boolean).join(" · ")
    };
  }
  // **ONE RESIST ROW PER CREATURE THE CARD RECORDS** (D-726's rows; the feature card's since
  // the B6 fix, a creature's ability's since the B8a2 pass): each row names its creature's
  // uuid, so `dice/chat.mjs` shows it to that creature's owner and the GM, and the Test it
  // makes is RECORDED on this card - what the Apply's half, its spare and a failure's
  // condition read. With no creature recorded, the one button, unrecorded, as before.
  const resistRows = resist
    ? lst.map((t, i) => ({
        index: i,
        name: t?.name ?? "",
        actorUuid: targetActorOf(t)?.uuid ?? "",
        key: resistKey(t),
        resilience: resist.key,
        label: resist.label,
        dc: resist.dc
      }))
    : [];
  const area = areaFor(a.area || CREATURE_PRESENTATION_AREAS[abilityKeyOf(row.name)] || "");
  const attack = a.kind === "attack";
  // A LIST, one block per condition (the feature card's shape since D-771,
  // where Hurricane lays Slowed and Typhoon Prone beside it). A casting ability
  // whose Test failed lays nothing (07 §8; the B8a2 pass).
  const inflicts = success && a.inflicts?.condition ? [{
    condition: a.inflicts.condition,
    label: game.i18n.localize(AZEROTH.conditions[a.inflicts.condition] ?? a.inflicts.condition),
    value: a.inflicts.value ?? null,
    until: a.inflicts.until ?? null,
    untilLabel: a.inflicts.until ? game.i18n.localize(AZEROTH.untilKinds[a.inflicts.until] ?? a.inflicts.until) : null,
    // **WHETHER THE CARD'S TEST GOVERNS IT** (the lead: *"Land automatically"*; the B8a2
    // pass): 14's *... or takes 3 damage and is knocked **Prone***, a failure lays it at
    // once, so its button stands only for a creature whose Test the card has not recorded.
    onFail: a.inflicts.onFail === true && Boolean(resist)
  }] : [];
  // The conditions a failed Resist on this card lands (`dice/chat.mjs#rollResists`).
  // D12: an ability that names the poison or disease it lays lays the CARRIER on a failed Test,
  // and the carrier holds the condition itself, so the plain Poisoned / Diseased is not laid beside it.
  const afflictOnFail = resist && a.afflict?.kind && a.afflict.key
    ? { kind: a.afflict.kind, key: a.afflict.key, name: a.afflict.name ?? row.name, dc: a.afflict.dc ?? resist.dc,
      resilience: a.afflict.resilience ?? resist.key, value: a.afflict.value ?? 1 }
    : null;
  const onFailInflicts = resist ? governed(inflicts).onFail.map(i => ({ condition: i.condition, value: i.value, until: i.until })) : [];

  // 5. Strike a use: the row is written whole, an array being what it is.
  let uses = null;
  if (usesMax > 0) {
    const rows = foundry.utils.deepClone(actor.system.toObject()[list] ?? []);
    if (rows[index]) {
      rows[index].automation = { ...rows[index].automation, uses: { ...rows[index].automation.uses, value: Math.max(0, usesLeft - 1) } };
      await actor.update({ [`system.${list}`]: rows });
    }
    uses = { value: Math.max(0, usesLeft - 1), max: usesMax };
  }

  // What arrives, and how many (D-691, decision 2): the GM presses the card's
  // button and chooses where they stand, because the tool does not know what
  // "out of the chamber walls" means.
  // *Arrive at the start of the third round after it* (D-811): the round they arrive in, on
  // the card, which its Place waits for (`rules/creature-plans.mjs#summonWaits`).
  const arrival = a.kind === "summon" ? summonDue(a.summon?.from ?? null, actor.activeFight?.() ?? null) : null;
  const summon = a.kind === "summon" && a.summon?.entry && (a.summon.count ?? 0) > 0 && bossPlan.door !== "raise"
    ? { entry: a.summon.entry, count: a.summon.count, side: a.summon.side, from: a.summon.from,
      ...(arrival ? { due: arrival.due, dueFight: arrival.fight } : {}) }
    : null;
  const costLabel = suretyQuote?.payer === "warlock" ? `Mana (${abilityPayer.name})`
    : a.cost?.pool && spent ? game.i18n.localize(AZEROTH.npcPoolKinds[a.cost.pool] ?? a.cost.pool) : null;
  const content = await renderTemplate(TEMPLATE.feature, {
    config: AZEROTH,
    title: row.name,
    subtitle: list === "bossActions" ? game.i18n.localize("AZEROTH.Sheet.BossActions") : actor.name,
    action: a.action,
    cost: costLabel ? { label: costLabel, text: String(spent) } : null,
    // The round's points, spent and left (14 §1).
    bossPoints: bossSpend ? { cost: bossSpend.cost, left: bossSpend.left, max: actor.system?.bossPoints?.max ?? null } : null,
    summon,
    uses,
    rolled: Boolean(roll),
    total: roll?.total ?? null,
    dc: resolvedDC,
    sl,
    success,
    verdict: roll ? verdictFor({ sl, success }) : null,
    critical: roll?.outcome?.critical ?? false,
    fumble: roll?.outcome?.fumble ?? false,
    heal,
    speakerName: actor.name,
    damage,
    resist,
    // One Resist row per creature the card records (the B8a2 pass).
    resistRows,
    area,
    attack,
    inflicts,
    effect: await enrich(row.description, { relativeTo: actor }),
    note: a.note || null,
    targets: lst.map((t, i) => ({ ...t, index: i })),
    provenance: roll?.provenance ?? []
  });

  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: roll ? [roll] : [],
    flags: { "azeroth-rpg": {
      kind: "ability", list, index, title: row.name, targets: lst, damageByTarget, heal: heal?.amount ?? null, sl, area,
      ...(spellLock ? { spellLockCaster: actor.uuid, spellLockCasts: [spellLock.castId] } : {}),
      damageType: a.damage?.type ?? null,
      // **WHAT THE CARD'S RECORDED TEST GOVERNS** (the B8a2 pass): the half a pass leaves on
      // each row and on the one button, the none a pass leaves where the failure deals it, and
      // the conditions a failure lands at once (`dice/chat.mjs#applyDamageToTargets`,
      // `#rollResists`) - 14's words, through the doors a feature's card already reads.
      ...(damage && halfOnPass ? { halfOnPass: true, passedByTarget, damagePassed } : {}),
      ...(damage && noneOnPass ? { noneOnPass: true } : {}),
      ...(resist && onFailInflicts.length ? { onFailInflicts } : {}),
      ...(afflictOnFail ? { afflict: afflictOnFail } : {}),
      // AN ABILITY THAT ATTACKS AND NAMES NO NUMBERS SWINGS THE BLOCK'S OWN
      // LINE (D-691). Ten entries carried `kind: "attack"` with an empty
      // `attack` descriptor, so the card's button rolled at Bonus 0 for 0
      // damage - and 14 means the creature's ordinary blow: *Ukorz attacks
      // every creature in reach at his Bonus.*
      attack: attack ? attackFor(a, actor) : null,
      // What the Place button calls up (D-691, decision 2).
      summon: summon ? { ...summon, bossAction: isBossAction } : null,
      bossAction: isBossAction,
      // **WHAT THE CARD CARRIES FOR A BOSS ACTION'S DOORS** (D-809): a forced move, a
      // drain, an escape, a grip, an attack's allowance, a zone.
      ...(isBossAction || creaturePlan ? bossCardFlags({ actor, row, targets: lst }) : {}),
      // **WHO USED IT, WHICH ABILITY, AND HOW ITS TEST WENT** (D-724; the Legacy
      // branches' door 2): the creature's token, the key its row is filed under in
      // the feature table (`ability:<slug>`), and whether a Casting Test was made.
      source: abilitySource ?? null,
      featureKey: abilityKeyOf(row.name),
      casting: a.casting === true,
      success
    } }
  });
  if (spellLock) {
    const aftermath = await completeSpellLockWindow({ actor, castId: spellLock.castId, message });
    if (!aftermath?.ok) ui.notifications?.warn("The ability resolved, but Spell Lock's resistance or Silence could not be confirmed. Check the reaction records; do not repeat the ability.");
  }
  // **WHAT A BOSS ACTION LANDS AT THE PRESS** (D-809): a relocation, a push, Power, a
  // miss to come, a Boon or a Bane, copies, the raised.
  if (isBossAction || creaturePlan) await afterBossPress({ actor, row, targets: lst, pre: bossPre?.pre ?? {}, message });
  return message;
}

/**
 * The numbers an ability's Attack button rolls: the descriptor's own where a
 * GM typed them, else the block's first attack line, which is what 14 means
 * by *at his Bonus* (D-691).
 */
function attackFor(a, actor) {
  const own = a.attack?.bonus !== null && a.attack?.bonus !== undefined;
  const line = own ? null : (actor?.system?.attacks?.[0] ?? null);
  const traits = (a.attack?.traits ?? []).length ? a.attack.traits : (line?.traits ?? []);
  return {
    name: line?.name ?? "",
    bonus: a.attack?.bonus ?? line?.bonus ?? 0,
    damage: a.attack?.damage ?? line?.damage ?? 0,
    traits: [...traits]
  };
}

/* -------------------------------------------- */
/*  A consumable used (08 SS12, SS13; D-668)     */
/* -------------------------------------------- */

/**
 * Drink it, lay it on a blade, or throw it.
 *
 * The three shapes 08 gives, and what each does here:
 *
 * - **Drunk** (a restorative, an elixir, a utility draught, a dressing):
 *   the numbers land on the user at once - Health through `applyHealing`
 *   so corruption's reduction is honoured, Mana through the actor's one
 *   pool door, a Fatigue point off the track - and anything that lasts is
 *   an Active Effect for the time the entry names.
 * - **Laid on a thing** (a stone, an oil, a poison): the user is asked
 *   WHICH of their own things it goes on, out of the ones 08 SS13's *Goes
 *   on* column accepts, and the coating is a FLAG. *Nothing about the item
 *   changes, and when the hour is up it is what it was.*
 * - **Thrown** (an explosive): the card carries the damage, the radius and
 *   the Reflex Test, and the table applies it.
 *
 * One is marked off before anything else happens, as a shot is (D-641).
 *
 * @param {{actor: Actor, item: Item, targets?: object[]}} o
 * @returns {Promise<ChatMessage|null>}
 */
export async function useGear({ actor, item, targets = null } = {}) {
  if(item?.type==="gear"&&item.system?.identifier==="healers-kit-10-uses")
    return (await import("../effects/healer-kit.mjs")).useHealerKit({actor,item,targets});
  if (refuseDispersion(actor, "gear")) return null;
  if (refuseAncientDespair(actor, "gear")) return null;
  if(item?.type==="gear"&&item.system?.identifier==="repair-kit-mechanical")return useMechanicalRepairKit({actor,item});
  if(item?.type==="gear"&&item.system?.identifier==="rocket-boots")return useRocketBoots({actor,item});
  if(item?.type==="gear"&&["target-dummy","spring-loaded-grapple"].includes(item.system?.identifier))return usePlacedDevice({actor,item});
  if(ordinaryDrinkOf(item))return useOrdinaryDrink({actor,item});
  const {specialEquipmentOf}=await import("../rules/special-equipment.mjs");
  if(specialEquipmentOf(item)) {
    const {requestSpecialEquipment}=await import("../effects/special-equipment.mjs");
    return requestSpecialEquipment({actor,item,targets:targets??[]});
  }
  const use = item?.system?.use ?? null;
  if (!actor || !item || !hasUse(use)) return null;
  if (!guardPendingCustodyItem(item).ok) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Item.CustodyPending"));
    return null;
  }
  const priorUse=actor.getFlag('azeroth-rpg','consumableUse');
  if(priorUse&&!['complete','reviewed','cancelled'].includes(priorUse.stage)) {
    ui.notifications?.warn(game.i18n.localize('AZEROTH.Use.Receipt.Pending'));return null;
  }
  if (isAntivenom(use)) return useAntivenom(actor, item);
  // A gear REMEDY ends the one disease it names, on the user or a creature touched (D12 Phase 6).
  if (isRemedy(use)) return (await import("../effects/cures.mjs")).useRemedy(actor, item, { targets: targets ?? [] });
  const source = JSON.stringify({name:item.name,use});
  const releaseUse = acquireConsumableUse(actor);
  if (!releaseUse) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Use.Busy"));
    return null;
  }
  let receiptKey=null;
  const advanceReceipt=(stage,extra={})=>requestConsumableReceipt(actor,{op:'advance',key:receiptKey,stage,...extra});
  try {
  // 06 §10 (door 10): *You cannot touch the living world* - a thing carried stays where it is.
  const spiritGear = realmRefusalFor(actor, "gear");
  if (spiritGear) {
    ui.notifications?.warn(spiritGear);
    return null;
  }
  const lst = targets ?? [];

  // 1. Is there one to use?
  const held = item.system.quantity === undefined ? 1 : item.system.quantity;
  if (held !== null && held <= 0) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Use.NoneLeft", { name: item.name }));
    return null;
  }

  // 2. A dressing's limit belongs to the PATIENT (08 SS12): one across a
  // Short Rest, however many hands are willing.
  if (use.perRest === "short" && actor.getFlag("azeroth-rpg", "dressed") === true) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Use.AlreadyDressed", { name: actor.name }));
    return null;
  }
  const explosivePreparation=await prepareExplosiveUse({actor,item});
  if(explosivePreparation===null)return null;

  // 3. Where it goes, before anything is spent. **ASKED BEFORE THE BUDGET**
  // (D-768; the lead, 2026-10-03: *Keeps the Half-Action*): a coating with
  // nothing to go on, or a chooser dismissed, used to cost the Half-Action it
  // had already taken.
  const schools = Object.keys(AZEROTH.schools);
  const warding = wardingElixir(use, item.name, schools);
  const supreme = supremePower(use);
  const invulnerability = isInvulnerabilityPotion(use);
  const wisdom = isDistilledWisdom(use);
  const wisdomPool = wisdom ? manaPool(actor.poolSnapshot?.() ?? []) : null;
  if (wisdom && (!wisdomPool || !Number.isFinite(wisdomPool.max) || wisdomPool.max <= 0)) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Use.NoMana"));
    return null;
  }
  let wardSchool = warding?.school ?? null;
  if ((warding || supreme) && !wardSchool) {
    const snapshot = JSON.stringify(use), name = item.name;
    const choice = await chooseOption(item, schools.map(key => ({key, name:game.i18n.localize(AZEROTH.schools[key]), description:""})), null,
      {prompt:game.i18n.localize(supreme ? "AZEROTH.Use.SpellpowerSchool" : "AZEROTH.Use.WardSchool")});
    if (!choice || !(supreme ? supremePowerChange(supreme, choice.key, schools) : wardingElixirChange(warding, choice.key, schools))) return null;
    if (!actor.isOwner || actor.items.get(item.id) !== item || item.parent !== actor || item.name !== name
      || item.system.quantity !== held || JSON.stringify(item.system.use) !== snapshot) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Use.Changed"));
      return null;
    }
    wardSchool = choice.key;
  }
  let onto = null;
  if (use.target === "item") {
    onto = await chooseCoatingTarget(actor, item, use);
    if (!onto) return null;
    if (!guardPendingCustodyItem(onto).ok) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Item.CustodyPending"));
      return null;
    }
  }

  // 4. The turn's budget, in a fight. **A poison costs nothing to apply where
  // 04's Deft Hands or 02 §7's Poisoner says so** (the lead's item 27): both
  // sentences were prose on the sheet and neither reached this line, so a
  // Rogue who had bought either still paid half a turn for the coating.
  const freeApply = coatingAction(use, {
    deftHands: actor.talentRanks?.("Deft Hands") ?? 0,
    poisoner: (actor.items ?? []).some(i => i.type === "feature" && i.name === "Poisoner"),
    // 04's Coated Blades (*You may apply a poison you carry without spending an
    // action*; D-773).
    coatedBlades: coatingTalentsFor(actor.takenTalents()).free
  }) === null && use.action !== null;
  if (refuseDispersion(actor, "gear")) return null;
  if (!consumableSourceCurrent({actor,item,held,source})
    || (onto && (onto.parent !== actor || actor.items.get(onto.id) !== onto || !goesOn(use.appliesTo, onto)))) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Use.Changed"));
    return null;
  }
  receiptKey=foundry.utils.randomID(32);
  await requestConsumableReceipt(actor,{op:'begin',key:receiptKey,itemId:item.id,source,quantity:item.system.quantity});
  if(!consumableSourceCurrent({actor,item,held,source})||refuseDispersion(actor,'gear')
    ||(onto&&(onto.parent!==actor||actor.items.get(onto.id)!==onto||!goesOn(use.appliesTo,onto)))){
    await advanceReceipt('cancelled');return null;
  }
  if (!(await spendTurnBudget(actor, freeApply ? null : explosiveAction(item,use)))) {
    await advanceReceipt('cancelled');return null;
  }
  await advanceReceipt('actionPaid');

  // 5. Mark one off - paid first, as Mana and a shot are. `spendOne` is the
  // ONE mark-off rule (D-733), shared with the food and drink a Short Rest
  // spends, so the button and the rest can never count differently.
  const spend = spendOne(held);
  // WHAT THE CARD PRINTS beside the name is the count left after the mark-off,
  // and nothing at all for 08's unlimited row - read off the one rule rather
  // than worked out a second time beside it. Without this line the card step
  // below threw a ReferenceError on EVERY use of every consumable, after the
  // item had already been spent: `node --check` parses an undeclared name
  // happily and no Vitest can import this module (D-637).
  const left = spend === null ? null : (spend.delete ? 0 : spend.quantity);
  await payConsumableDose({actor,item,held,spend,source});
  await advanceReceipt('dosePaid');
  await (await import('../effects/equipment-travel.mjs')).endEquipmentInvisibility(actor,{event:'consumable'});

  // 6. What it did.
  const lines = [];
  // 14's Manuals: **Grants.** N XP toward one skill. The XP lands on the
  // reader's unspent pool and the card says which book gave it; WHICH skill
  // it is spent on is the table's call, so nothing is spent here.
  if (use.kind === "grant" && Number(use.xp) > 0 && actor.type === "character") {
    const earned = (actor.system.xp?.earned ?? 0) + Number(use.xp);
    await actor.update({ "system.xp.earned": earned });
    lines.push(game.i18n.format("AZEROTH.Use.GrantedXp", { xp: use.xp, name: actor.name }));
  }
  const timing = invulnerability ? untilEndOfNextTurnOrRound(actor) : spellTiming(actor, supreme?.duration ?? warding?.duration ?? durationOf(use)) ?? {};
  if (use.target === "item" && onto) {
    if (onto.parent !== actor || actor.items.get(onto.id) !== onto || !goesOn(use.appliesTo, onto))
      throw Error('Coating target changed during payment');
    const fight = actor.activeFight?.() ?? null;
    await onto.setFlag("azeroth-rpg", "coating", {
      name: item.name, kind: use.kind, trait: use.trait ?? null, rating: use.rating ?? null,
      statuses: [...(use.statuses ?? [])],
      resist: use.resist?.resilience ? { ...use.resist } : null,
      // **HOW LONG, AND FROM WHEN** (08 §12, D-719): *it lasts for one minute
      // and lands on every hit the weapon makes in that time.* The minute is
      // ten rounds and the fight is the clock; `_turnTicks` takes it off the
      // blade at the coater's own turn. A poison without a `laid` stamp is one
      // applied before D-719 and still leaves with the blow.
      //
      // **A BLADE COATED BEFORE INITIATIVE CARRIES A STAMP WITH NO FIGHT IN
      // IT**, and `AzerothCombat#_fightStart` hands it this fight's round the
      // moment one begins. Without that the minute never started and the
      // poison landed on every hit until a rest.
      rounds: use.kind === "poison" ? POISON_ROUNDS : null,
      laid: { combatId: fight?.id ?? null, round: fight?.round ?? null },
      // *A poison you apply deals 1 more damage per rank* (04's Envenom).
      // Stamped at the moment it is laid, so the rank that applied it is the
      // rank that lands.
      envenom: actor.talentRanks?.("Envenom") ?? 0,
      // The entry's own words, so the card can say what landed (D-670).
      text: runAfter(flatten(item.system.description), "Effect") ?? use.note ?? "",
      // *2 damage a turn for 3 turns* (08 §12, O-114; D-770): what a failed
      // Test lays, carried to the card with the blow that lands.
      tick: poisonTick(use),
      // D12: what the poison leaves CARRIED (08 section 13's Carried cell, `readCarried`'s
      // descriptor) and the key the carrier is known by. A blade coated before this
      // carries neither and behaves as it did.
      ...(use.kind === "poison" && use.carried?.carried ? {
        carried: foundry.utils.deepClone(use.carried),
        key: item.name.toLowerCase().replace(/[^a-z]/g, "")
      } : {}),
      at: Date.now()
    });
    lines.push(game.i18n.format("AZEROTH.Use.LaidOn", { name: item.name, item: onto.name }));
    if (freeApply) lines.push(game.i18n.localize("AZEROTH.Use.FreeApply"));
  } else {
    const teaRefill = thistleTeaRefill(use, actor.classItems ?? [], actor.poolSnapshot?.() ?? []);
    if (wisdomPool) {
      const current = actor.poolSnapshot().find(p => p.kind === 'power' && p.itemId === wisdomPool.itemId && p.name === wisdomPool.name);
      if (!current) throw new Error('Distilled Wisdom recipient pool changed during payment');
      const before = current.value;
      const carrier = [...actor.effects].find(e => e.flags?.['azeroth-rpg']?.[WISDOM_FLAG]?.version === 1);
      const data = {
        name: item.name, img: item.img, origin: actor.uuid, disabled: false,
        ...timing,
        flags: { 'azeroth-rpg': { [WISDOM_FLAG]: { version: 1, itemId: current.itemId ?? null, poolName: current.name ?? null } } }
      };
      const written = carrier ? await carrier.update(data)
        : (await actor.createEmbeddedDocuments('ActiveEffect', [data]))[0];
      // A refused or unconfirmed carrier must not grant the immediate refill.
      // The dose is already paid; do not retry or fabricate a successful card.
      const confirmed = written && actor.isOwner && written.parent === actor
        && actor.effects.get(written.id) === written && written.disabled === false
        && JSON.stringify(written.getFlag('azeroth-rpg', WISDOM_FLAG)) === JSON.stringify(data.flags['azeroth-rpg'][WISDOM_FLAG])
        && Object.entries(data.duration ?? {}).every(([key,value]) => written.duration?.[key] === value)
        && Object.entries(data.start ?? {}).every(([key,value]) => written.start?.[key] === value);
      if (!confirmed) throw new Error('Distilled Wisdom effect was not confirmed; review the spent dose before retrying');
      const raised = actor.poolSnapshot().find(p => p.kind === 'power' && p.itemId === current.itemId && p.name === current.name);
      await actor.updatePool({ itemId: current.itemId, kind: 'power', value: Math.min(raised.max, before + 6) });
      lines.push(game.i18n.format('AZEROTH.Use.Mana', { n: Math.min(6, raised.max - before) }));
      lines.push(game.i18n.format('AZEROTH.Use.Lasts', { name: item.name }));
    }
    if (teaRefill) {
      await actor.updatePool(teaRefill);
      lines.push(game.i18n.format("AZEROTH.Use.ComboFilled", { n: teaRefill.value }));
    }
    const teaFatigue = thistleTeaFatigue(use, actor.classItems ?? [], actor.system.fatigue, AZEROTH.FATIGUE_MAX);
    if (teaFatigue !== null) {
      if (actor.type === 'character') {
        const gained = teaFatigue - (actor.system.fatigue ?? 0);
        await actor.update({'system.fatigue':teaFatigue});
        lines.push(game.i18n.format('AZEROTH.Use.FatigueGained', {n:gained}));
      } else lines.push(game.i18n.localize('AZEROTH.Use.NoFatigue'));
    }
    if (use.heal?.health) {
      await actor.applyHealing(use.heal.health, { from: actor });
      lines.push(game.i18n.format("AZEROTH.Use.Health", { n: use.heal.health }));
    }
    if (use.heal?.mana) {
      const pool = manaPool(actor.poolSnapshot?.() ?? []);
      if (pool) {
        await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: Math.min(pool.max, pool.value + use.heal.mana) });
        lines.push(game.i18n.format("AZEROTH.Use.Mana", { n: use.heal.mana }));
      } else lines.push(game.i18n.localize("AZEROTH.Use.NoMana"));
    }
    // **A CREATURE HAS NO FATIGUE TRACK.** 14 gives one none and `NpcData`
    // carries no field, so `update({"system.fatigue": n})` was pruned by the
    // schema and the card still claimed a recovery that never happened.
    // Guarded on the type exactly as the XP branch above it is, and it SAYS SO
    // rather than falling silent — the Mana branch beside it is the shape.
    if (use.heal?.fatigue) {
      if (actor.type === "character") {
        const now = Math.max(actor.system.fatigueFloor ?? 0, (actor.system.fatigue ?? 0) - use.heal.fatigue);
        await actor.update({ "system.fatigue": now });
        lines.push(game.i18n.format("AZEROTH.Use.Fatigue", { n: use.heal.fatigue }));
      } else lines.push(game.i18n.localize("AZEROTH.Use.NoFatigue"));
    }
    const endedConditions = consumableEnds(use, Object.keys(AZEROTH.conditions));
    const heldConditions = new Set(actor.statuses ?? []);
    if (['restorative-potion', 'free-action-potion'].includes(item.system.identifier)) {
      const ids = [...actor.effects].filter(effect => [...(effect.statuses ?? [])].some(id => endedConditions.includes(id))).map(effect => effect.id);
      if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
    }
    for (const id of endedConditions) {
      const label = game.i18n.localize(AZEROTH.conditions[id] ?? id);
      if (heldConditions.has(id)) {
        await actor.toggleStatusEffect(id, { active: false });
        const report = actor.statuses?.has?.(id) ? "AZEROTH.Use.NotEnded" : "AZEROTH.Use.Ended";
        lines.push(game.i18n.format(report, { condition: label }));
      } else lines.push(game.i18n.format("AZEROTH.Use.NotHeld", { condition: label }));
    }
    const immuneConditions = consumableImmunities(use, Object.keys(AZEROTH.conditions));
    const wardChange = wardingElixirChange(warding, wardSchool, schools);
    const powerChange = supremePowerChange(supreme, wardSchool, schools);
    if (powerChange) {
      const data = {name:`${item.name} (${game.i18n.localize(AZEROTH.schools[wardSchool])})`, img:item.img, origin:actor.uuid,
        ...timing, disabled:false, system:{changes:[powerChange]},
        flags:{'azeroth-rpg':{consumable:item.system.identifier || item.name, [SUPREME_POWER_FLAG]:{version:1,school:wardSchool}}}};
      const existing = [...actor.effects].filter(effect => effect.getFlag('azeroth-rpg', SUPREME_POWER_FLAG)?.version === 1);
      if (existing.length) {
        await writeConsumableEffect(actor, data, existing[0]);
        if (existing.length > 1) await actor.deleteEmbeddedDocuments('ActiveEffect', existing.slice(1).map(effect => effect.id));
      } else await writeConsumableEffect(actor, data);
      lines.push(game.i18n.format('AZEROTH.Use.Lasts', {name:data.name}));
    }
    const useChanges = [...(use.changes ?? []), ...(wardChange ? [wardChange] : [])];
    if (useChanges.length || immuneConditions.length || invulnerability) {
      await writeConsumableEffect(actor, {
        name: wardChange ? `${item.name} (${game.i18n.localize(AZEROTH.schools[wardSchool])})` : item.name,
        img: item.img,
        origin: actor.uuid,
        description: await enrich(item.system.description, { relativeTo: item }),
        system: { changes: useChanges.map(c => ({ key: c.key, type: c.type ?? "add", value: String(c.value ?? ""), phase: c.phase ?? "final" })) },
        ...timing,
        flags: { "azeroth-rpg": { consumable: item.system.identifier || item.name,
          ...(invulnerability ? { [INVULNERABILITY_POTION_FLAG]: { version: 1 } } : {}),
          ...(immuneConditions.length ? { [IMMUNE_FLAG]: { conditions: immuneConditions, source: item.name } } : {}) } }
      });
      lines.push(game.i18n.format("AZEROTH.Use.Lasts", { name: item.name }));
    }
    if (use.perRest === "short") await actor.setFlag("azeroth-rpg", "dressed", true);
    // **05's TEMPORARY HEALTH A DRAUGHT GRANTS** (08 §12's Flask of the Titans: *For
    // one hour, gain temporary Health equal to twice your level. It does not stack
    // with itself*; D-777): read off its own words, laid with an effect of the
    // draught's span - which ends it - and granted through 05's law.
    const flaskTemp = readTemporaryHealth(use.note ?? "");
    const flaskAmount = flaskTemp?.amount ? Math.max(0, Math.trunc(Number(evaluateAmount(flaskTemp.amount, { level: actor.system?.level ?? 1, tier: actor.system?.tier ?? 1 }))) || 0) : 0;
    if (flaskAmount > 0) {
      const timed = flaskTemp.span === "effect" && timing?.duration;
      const carrier = timed ? await writeConsumableEffect(actor, {
        name: item.name, img: item.img, origin: actor.uuid,
        description: await enrich(item.system.description, { relativeTo: item }),
        ...timing,
        flags: { "azeroth-rpg": { consumable: item.system.identifier || item.name } }
      }) : null;
      const done = await actor.grantTemporaryHealth(flaskAmount, {
        source: item.name, span: carrier ? "effect" : (flaskTemp.span === "encounter" ? "encounter" : "longRest"), effectId: carrier?.id ?? null
      });
      lines.push(game.i18n.format(done.landed ? "AZEROTH.Temporary.Line" : "AZEROTH.Temporary.LineKept", { name: actor.name, n: flaskAmount, held: done.temp }));
    }
  }

  // 7. The card, in the feature's own shape.
  const {applyUtilityDraught}=await import("../effects/utility-draughts.mjs");
  await applyUtilityDraught(actor,item,use,timing);
  const explosiveDealerHalved=explosiveRule(item)?Boolean(dealtHalvedBy(actor)):false;
  const initialGearDamage=explosiveRule(item)?halvedAmount(use.damage?.amount,explosiveDealerHalved):use.damage?.amount;
  const damage = use.damage?.amount
    ? { final: initialGearDamage, explanation: String(initialGearDamage) }
    : null;
  const resist = use.resist?.resilience
    ? { key: use.resist.resilience, label: AZEROTH.resiliences[use.resist.resilience], dc: use.resist.dc ?? null }
    : null;
  // A list of one (the feature card's shape since D-771).
  const inflicts = !explosiveRule(item)?.condition && (use.statuses ?? []).length && use.target !== "item" ? [{
    condition: use.statuses[0],
    label: game.i18n.localize(AZEROTH.conditions[use.statuses[0]] ?? use.statuses[0]),
    value: null, until: null, untilLabel: null
  }] : [];
  const area = blastRadius(areaFor(use.area ?? ""), actor.takenTalents?.() ?? [], { explosive: use.kind === "explosive" });

  const content = await renderTemplate(TEMPLATE.feature, {
    config: AZEROTH,
    title: item.name,
    subtitle: actor.name,
    // Free where Deft Hands or Poisoner paid for it (the lead's item 27).
    action: freeApply ? null : explosiveAction(item,use),
    cost: null,
    uses: left === null ? null : { value: left, max: held },
    rolled: false,
    heal: null,
    speakerName: actor.name,
    damage,
    resist,
    resistRows: explosiveRule(item)?.resist&&resist?lst.map((t,index)=>({index,name:t.name,actorUuid:t.actorUuid,
      key:resistKey(t),resilience:resist.key,label:resist.label,dc:resist.dc})):[],
    area,
    attack: false,
    inflicts,
    effect: await enrich(item.system.description, { relativeTo: item }),
    note: [use.note || null, ...lines].filter(Boolean).join(" \u00b7 ") || null,
    targets: lst.map((t, i) => ({ ...t, index: i })),
    provenance: []
  });

  const consumableCard = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { "azeroth-rpg": {
      kind: "gear", itemId: item.id, title: item.name, targets: lst,
      ...(explosiveRule(item)?{explosiveDealerHalved}:{}),
      damageByTarget: lst.map(() => (damage ? { damage: damage.final } : null)),
      heal: null, sl: 0, area,
      ...(use.kind==="explosive"?{notAttack:true}:{}),
      ...(explosiveRule(item)?{equipmentExplosivePending:true}:{}),
      ...(explosivePreparation?{explosivePreparation}:{})
    } }
  });
  if(explosiveRule(item))await authorizeExplosiveCard(actor,consumableCard,receiptKey);
  await advanceReceipt('complete',{messageUuid:consumableCard.uuid});
  return consumableCard;
  } catch(error) {
    if(receiptKey)try{await requestConsumableReceipt(actor,{op:'uncertain',key:receiptKey});}catch{/* The durable claim remains pending. */}
    ui.notifications?.warn(game.i18n.localize('AZEROTH.Use.Receipt.Pending'));
    throw error;
  } finally { releaseUse(); }
}

/** The time a coating or a draught lasts, in `spellTiming`'s shape. */
function durationOf(use) {
  const value = use?.duration?.value ?? null;
  const units = use?.duration?.units ?? null;
  return value && units ? { value, units } : null;
}

/* -------------------------------------------- */
/*  A Signature PRESSED (08 SS20; D-692)         */
/* -------------------------------------------- */

/**
 * WHETHER THIS PRESS IS REFUSED, said in words. Returns true where it was.
 *
 * **THE ONE DOOR, for both kinds of press** (2026-09-10). `useSignature` was
 * the only caller of `pressRefusal` and the `spell` kind never reaches it:
 * `actions.mjs#useSignatureWithDialog` routes a `spell` straight to
 * `castItemSpell`, so the gate, the uses and the `noSpell` refusal were held up
 * by the template's `disabled` attribute alone. A macro or a stale render
 * calling `useSignatureWithDialog(rogue, benediction)` cast Renew for a Rogue.
 * Every other door in this system re-checks at the press for the reason
 * `actions.mjs` states beside the Reaction rows - *the card is a record of a
 * moment and the world moves under it* - and this one now does too.
 *
 * It is a FUNCTION rather than two copies because the words are the same
 * words: the sheet greys its button on `pressRefusal` and prints this same
 * sentence, so a player never reads one reason on the row and another in the
 * toast. The gate's own clauses ride the second key rather than being spliced
 * into the first, because a sentence assembled in JS is a string this file owns
 * and `lang/en.json` does not (CLAUDE.md §11).
 *
 * @param {{actor: Actor, item: Item}} o
 * @returns {boolean} true where it refused and said so
 */
export function refuseSignaturePress({ actor, item, approved = null } = {}) {
  const signature = signatureEffectOf(item);
  if (!actor || !item || !signature) return true;
  const shared=charmUseView(item.system?.identifier,actor.getFlag?.('azeroth-rpg',SIGNATURE_USES_FLAG),item.system?.equipped===true);
  if(shared){
    const authorized=approved?.authority===SIGNATURE_USE_AUTHORITY&&approved.valid();
    if(shared.refusal&&!authorized){
      ui.notifications?.warn(game.i18n.localize(AZEROTH.signatureRefusals[shared.refusal]));return true;
    }
    signature.use.uses={value:authorized?1:shared.value,max:1,per:'short'};
  }
  const hitUse=approved?.authority===SIGNATURE_USE_AUTHORITY&&approved.hit
    &&approvedHitSignature(item.system?.identifier)&&signature.kind==='onHit'&&approved.valid();
  if (!isPressable(signature)&&!hitUse) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Signature.NotPressable", { name: item.name }));
    return true;
  }
  // **THE BUTTON'S OWN GATE** (D-722). `pressGates` is `signature.gates` where
  // the sentence that presses is the gated one and `useGates` where the press
  // is a sentence of its own - *A Shaman may spend a Half-Action to call the
  // elements. Anyone wielding it takes a Boon on Parry.* is a press for a
  // Shaman and a Boon for everybody, and judging the press against the trunk's
  // empty list would hand the button to the whole table. The three surfaces
  // read the same function, so the sheet and the door cannot drift.
  const press = pressGates(signature);
  const holds = gateHolds(press, actor.signatureTurnState ?? {});
  const refusal = hitUse&&!holds?'gate':pressRefusal(signature, { holds, spells: (item.system?.spells ?? []).length });
  if (!refusal) return false;
  const why = game.i18n.localize(AZEROTH.signatureRefusals[refusal] ?? refusal);
  ui.notifications?.warn(refusal === "gate"
    ? game.i18n.format("AZEROTH.Signature.RefusedGate", { name: item.name, why, gate: gateWords(press) })
    : game.i18n.format("AZEROTH.Signature.Refused", { name: item.name, why }));
  return true;
}

/**
 * Press an item's Signature.
 *
 * **`useGear`'s order exactly** - refuse, spend the turn's budget, pay, the
 * numbers, strike the use, one card - because a Signature that is pressed is a
 * consumable that is not used up, and two orders would be two places for the
 * turn's budget to be spent after the Mana. There is no *choose* step: a
 * Signature names one effect and nothing in 08 SS20 or in the 1,769 Classic
 * finds offers a menu, unlike a class feature (D-618).
 *
 * What it refuses on, and why each is a refusal rather than a grey button:
 *
 * - **Nothing to press.** A standing Signature, one that fires off a blow and
 *   one that gives back at the top of the turn are enforced elsewhere; a Use
 *   control on any of them would do nothing (D-681), and no surface draws one.
 * - **The gate.** *A Warrior wearing it may spend 4 Rage* is not a Rogue's
 *   button. Judged against `signatureTurnState`, which is the bearer and how
 *   far this turn has moved - a `creatureType` clause fails closed here,
 *   because the press has no target and the roll is where that gate is read.
 * - **The uses.** `system.signatureEffect.use.uses`, which `resetUses` refills
 *   at the rest the limit names.
 * - **A spell with no spell.** `kind: "spell"` names WHICH spell in
 *   `system.spells[]`, and it casts through `castItemSpell`; this door refuses
 *   it rather than posting a card that does nothing.
 *
 * All four say WHY in words: `rules/signatures.mjs#pressRefusal` is the one
 * judgement, `refuseSignaturePress` above is the one voice, and the three
 * surfaces grey their control on the same answer.
 *
 * @param {{actor: Actor, item: Item, targets?: object[]}} o
 * @returns {Promise<ChatMessage|null>}
 */
export async function useSignature({ actor, item, targets = null, approved = null } = {}) {
  // Dispersion and Ancient Despair refuse BEFORE an approved use is asked of the
  // GM (D-768: every refusal before anything is written). The approved door
  // claims the use on the active GM's client before it runs, so a refusal met
  // only there wrote a pending claim and said nothing to the player who pressed.
  if (refuseDispersion(actor, "gear")) return null;
  if (refuseAncientDespair(actor, "signature")) return null;
  // A creature under Hex or Polymorph presses no Signature (D-808).
  if (actor?.refuseForcedShape?.("signature")) return null;
  if(approvedRestSignature(item?.system?.identifier)&&approved?.authority!==SIGNATURE_USE_AUTHORITY)
    return requestApprovedSignatureUse(actor,item,targets??[]);
  if(approved?.authority!==SIGNATURE_USE_AUTHORITY)approved=null;
  const signature = signatureEffectOf(item);
  if (!actor || !item || !signature) return null;
  // 06 §10 (door 10): a spirit presses nothing it carries.
  const spiritSignature = realmRefusalFor(actor, "signature");
  if (spiritSignature) {
    ui.notifications?.warn(spiritSignature);
    return null;
  }

  // 1. Refuse, NAMING WHY - and through the SAME function the `spell` branch
  //    goes through, so neither door can drift from the other.
  if (refuseSignaturePress({ actor, item, approved })) return null;

  // The approved optional reward follows an already-paid, confirmed hit. It
  // spends its shared rest allowance, never another Half-Action or pool cost.
  if(approved?.hit&&item.system?.identifier==='jangthraze-the-protector'){
    return deliverJangthrazeHit({actor,item,hit:approved.hit,values:approved.values,
      valid:approved.valid,paid:approved.paid});
  }
  if(approved?.hit&&item.system?.identifier==='horned-viking-helmet'){
    return publishHelmetHit({actor,item,hit:approved.hit,values:approved.values,
      valid:approved.valid,paid:approved.paid});
  }

  // A spell casts through the Forge's own door (D-633), never here: the caller
  // routes it (`actions.mjs#useSignatureWithDialog`), and a press that reached
  // this line would post a card with nothing on it.
  if (signature.kind === "spell") {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Signature.CastsInstead", { name: item.name }));
    return null;
  }
  const lst = targets ?? [];
  const use = signature.use;
  if(approved){
    if(!approved.valid())return null;
    use.action='half';
    if(approved.values.healing!==undefined)use.heal.health=approved.values.healing;
  }

  // 2. **THE POOL IS ASKED BEFORE THE BUDGET** (D-768; the lead, 2026-10-03:
  // *Keeps the Half-Action*). Battlegear of Wrath's *spend 4 Rage as a
  // Reaction* is a class feature's cost written on an item, so it is the same
  // pool door and the same refusal - which came AFTER the budget, copying
  // `useFeature`'s old order, so a press refused for Rage spent the Reaction.
  let spent = 0;
  let costLabel = null;
  let payFrom = null;
  if (use.cost?.pool) {
    const pool = poolFor(actor, use.cost.pool, null);
    costLabel = game.i18n.localize(AZEROTH.poolTypes[use.cost.pool] ?? use.cost.pool);
    const amount = use.cost.amount ?? 0;
    if (!pool || pool.value < amount) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NoPool", { name: item.name, pool: costLabel, amount }));
      return null;
    }
    spent = amount;
    payFrom = pool;
  }

  // 3. The turn's budget, in a fight, once nothing can refuse (D-659, D-768).
  if (refuseDispersion(actor, "gear")) return null;
  // **AN APPROVED USE'S CLAIM IS ASKED LAST, BEFORE THE BUDGET AND NEVER AFTER
  // IT** (D-768; the lead: *"I don't want a half-action wasted bug"*). It was
  // asked again once the budget had landed, so a claim that moved while the
  // write was in flight - the item edited, a target gone, the GM handed over -
  // returned with the Half-Action spent and nothing delivered. Judge, spend,
  // commit: from the budget on the use is made, and the coordinator settles
  // its record off what this door delivered (`effects/approved-signature-use.mjs`).
  // Never a refund through the GM's undo (`restoreAction`): that write can be
  // refused, or land on a later turn once the turn has moved.
  if (approved && !approved.valid()) return null;
  if (!(await spendTurnBudget(actor, use.action ?? null))) return null;
  // Paid for from here: the claim records it, and nothing below refuses.
  approved?.paid();

  // 3b. Pay.
  if (payFrom && spent > 0) await actor.updatePool({ itemId: payFrom.itemId, kind: payFrom.kind, value: payFrom.value - spent });

  // 4. The numbers.
  const lines = [];
  if (use.heal?.health) {
    await actor.applyHealing(use.heal.health, { from: actor });
    lines.push(game.i18n.format("AZEROTH.Use.Health", { n: use.heal.health }));
  }
  if (use.heal?.mana) {
    const pool = manaPool(actor.poolSnapshot?.() ?? []);
    if (pool) {
      await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: Math.min(pool.max, pool.value + use.heal.mana) });
      lines.push(game.i18n.format("AZEROTH.Use.Mana", { n: use.heal.mana }));
    } else lines.push(game.i18n.localize("AZEROTH.Use.NoMana"));
  }
  // A creature has no Fatigue track — `useGear`'s own guard, for the same
  // reason, on the door a creature reaches with a thing it is wearing.
  if (use.heal?.fatigue) {
    if (actor.type === "character") {
      const now = Math.max(actor.system.fatigueFloor ?? 0, (actor.system.fatigue ?? 0) - use.heal.fatigue);
      await actor.update({ "system.fatigue": now });
      lines.push(game.i18n.format("AZEROTH.Use.Fatigue", { n: use.heal.fatigue }));
    } else lines.push(game.i18n.localize("AZEROTH.Use.NoFatigue"));
  }
  for (const id of use.ends ?? []) {
    const label = game.i18n.localize(AZEROTH.conditions[id] ?? id);
    if (actor.statuses?.has?.(id)) {
      await actor.toggleStatusEffect(id, { active: false });
      lines.push(game.i18n.format("AZEROTH.Use.Ended", { condition: label }));
    } else lines.push(game.i18n.format("AZEROTH.Use.NotHeld", { condition: label }));
  }
  // What it takes off ONE incoming blow (Battlegear of Wrath). A mark on the
  // bearer that `AzerothActor#applyDamage` spends on the next blow that lands,
  // beside Unkillable's own - never an Active Effect, because *one attack* is
  // a count and not a span, and a duration would take it off the wrong blow.
  if (use.mitigates?.halve || use.mitigates?.amount) {
    await actor.setFlag("azeroth-rpg", "mitigate", {
      name: item.name, halve: use.mitigates.halve === true, amount: use.mitigates.amount ?? null
    });
    lines.push(game.i18n.format(use.mitigates.halve ? "AZEROTH.Signature.WillHalve" : "AZEROTH.Signature.WillReduce",
      { name: item.name, n: use.mitigates.amount ?? 0 }));
  }
  // An Active Effect it lays, KEYED BY THE ITEM'S UUID and diffed the way
  // `AzerothActor#syncTalentEffects` diffs: a second press replaces the first
  // rather than stacking a second copy of the same changes, which is what 08
  // SS20's own *for three rounds* entries mean by pressing it again.
  const timing = spellTiming(actor, durationOf(use)) ?? {};
  if ((use.changes ?? []).length || (use.statuses ?? []).length) {
    const stale = actor.effects.filter(e => e.getFlag("azeroth-rpg", "signature") === item.uuid).map(e => e.id);
    if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
    // A condition the body refuses stays off (10 SS4, SS6).
    const statuses = (use.statuses ?? []).filter(id => AZEROTH.conditions?.[id] && !(actor.system?.conditionImmunities ?? []).includes(id));
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: item.name,
      img: item.img,
      origin: actor.uuid,
      description: await enrich(signatureProse(item), { relativeTo: item }),
      statuses,
      system: { changes: (use.changes ?? []).map(c => ({ key: c.key, type: c.type ?? "add", value: String(c.value ?? ""), phase: c.phase ?? "final" })) },
      ...timing,
      flags: { "azeroth-rpg": { signature: item.uuid } }
    }]);
    lines.push(game.i18n.format("AZEROTH.Use.Lasts", { name: item.name }));
  }
  // **05's TEMPORARY HEALTH A SIGNATURE GRANTS** (a Classic find's `T-use-absorb`,
  // the Mark of the Dragon Lord's *gain 13 temporary Health until the end of the
  // encounter*; D-777), read off the item's own sentence and granted to the
  // bearer through 05's law.
  const markTemp = readTemporaryHealth(signatureProse(item));
  const markAmount = approved?.values.temporaryHealth ?? (markTemp?.amount ? Math.max(0, Math.trunc(Number(evaluateAmount(markTemp.amount, { level: actor.system?.level ?? 1, tier: actor.system?.tier ?? 1 }))) || 0) : 0);
  if (markAmount > 0) {
    const done = await actor.grantTemporaryHealth(markAmount, { source: item.name, span: approved || markTemp?.span === "encounter" ? "encounter" : "longRest" });
    lines.push(game.i18n.format(done.landed ? "AZEROTH.Temporary.Line" : "AZEROTH.Temporary.LineKept", { name: actor.name, n: markAmount, held: done.temp }));
  }

  // 5. Strike the use, before the card is built so the card prints what is left.
  let uses = null;
  if (approved) uses={value:0,max:1};
  else if (use.uses?.per) {
    await item.update({ "system.signatureEffect.use.uses.value": Math.max(0, (use.uses.value ?? 0) - 1) });
    uses = { value: item.system.signatureEffect.use.uses.value, max: use.uses.max };
  }

  // **THE CARD IS POSTED WHATEVER MOVED SINCE THE BUDGET** (D-768): the use is
  // paid for and its record is the card, whose own presses judge each target
  // again (`piccolo-resolution.mjs`, `cannonball-resolution.mjs`). Asking the
  // claim here dropped the card and kept the Half-Action and the pool.
  if(approved?.performance){
    const performance=structuredClone(approved.performance);
    const targets=performance.targets.map(row=>({...row,state:'awaitingSave',
      name:row.ref.name??fromUuidSync(row.uuid)?.name??row.ref.actorId}));
    const content=await renderTemplate('systems/azeroth-rpg/templates/chat/piccolo-card.hbs',{
      title:item.name,speakerName:actor.name,dc:performance.dc,targets
    });
    return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content,
      flags:{'azeroth-rpg':{kind:'signature',identifier:'piccolo-of-the-flaming-fire',itemId:item.id,
        piccolo:{...performance,targets,name:item.name,casterUuid:actor.uuid,itemUuid:item.uuid}}}});
  }

  // A saved Cannonball shot has its own resistance/delivery lifecycle. Never
  // expose the generic damage Apply door, which could bypass its Reflex Test.
  if(approved?.shot){
    const shot=structuredClone(approved.shot);
    const content=await renderTemplate('systems/azeroth-rpg/templates/chat/cannonball-card.hbs',{
      title:item.name,speakerName:actor.name,targetName:shot.target.name??shot.target.actorId,
      damage:shot.damage,passedDamage:shot.passedDamage,dc:shot.dc,rangeMeasured:shot.rangeMeasured,targetUuid:shot.targetUuid
    });
    return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content,
      flags:{'azeroth-rpg':{kind:'signature',identifier:'cannonball-runner',itemId:item.id,
        cannonball:{...shot,casterUuid:actor.uuid,itemUuid:item.uuid,state:'awaitingSave'}}}});
  }

  // 6. ONE CARD, the feature's own.
  const damage = use.damage?.amount
    ? { final: use.damage.amount, explanation: String(use.damage.amount) }
    : null;
  const resist = use.resist?.resilience
    // A CREATURE'S SPELL DC IS `system.spells.dc` (14 §1's `**Spells** (DC n)`
    // run); `system.spellDC` is the character's derived one and does not exist
    // on the other model. `castSpell` has read both since it was written and
    // this door read one, so a creature's Signature posted a Resist button
    // with no DC on it at all.
    ? { key: use.resist.resilience, label: AZEROTH.resiliences[use.resist.resilience], dc: use.resist.dc ?? actor.system.spellDC ?? actor.system.spells?.dc ?? null }
    : null;
  // What it calls up (D-691's own card and button, reused rather than a second
  // one): four Classic finds summon something and nothing placed it.
  const summon = signature.summon?.entry
    ? { entry: signature.summon.entry, count: signature.summon.count ?? 1, side: signature.summon.side ?? "summoner", from: signature.summon.from ?? "nextRound" }
    : null;
  const area = areaFor(use.area ?? "");

  const content = await renderTemplate(TEMPLATE.feature, {
    config: AZEROTH,
    title: item.name,
    subtitle: game.i18n.localize("AZEROTH.Item.Signature"),
    action: use.action,
    cost: costLabel ? { label: costLabel, text: String(spent) } : null,
    uses,
    rolled: false,
    heal: null,
    speakerName: actor.name,
    damage,
    resist,
    area,
    attack: false,
    summon,
    // THE ITEM'S OWN SENTENCE, never a line shared by all of them: 288 items
    // carry a Signature and no two of them say the same thing.
    effect: await enrich(signatureProse(item), { relativeTo: item }),
    note: [use.note || null, ...lines].filter(Boolean).join(" \u00b7 ") || null,
    targets: lst.map((t, i) => ({ ...t, index: i })),
    provenance: []
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { "azeroth-rpg": {
      kind: "signature", itemId: item.id, title: item.name, targets: lst,
      damageByTarget: lst.map(() => (damage ? { damage: damage.final } : null)),
      heal: null, sl: 0, area, summon
    } }
  });
}

/**
 * A gate in words, for the refusal that names it: the kind's own label and the
 * thing it names - *Only for one class: Warrior* - one clause per entry. Both
 * halves come out of `lang/en.json`; only the separator is punctuation, which
 * is what `useGear`'s own note line joins with.
 */
function gateWords(gates = []) {
  return (gates ?? [])
    .map(g => {
      const kind = g?.kind ? game.i18n.localize(AZEROTH.signatureGates[g.kind] ?? g.kind) : null;
      if (!kind) return null;
      return g.value ? game.i18n.format("AZEROTH.Signature.GateValue", { kind, value: g.value }) : kind;
    })
    .filter(Boolean)
    .join(" \u00b7 ");
}

/**
 * WHICH OF YOUR OWN THINGS IT GOES ON (the lead, 2026-09-06). The list is
 * what 08 SS13's *Goes on* column accepts out of what the character carries;
 * one already coated says so and is still offered, because a second
 * application replaces the first.
 */
async function chooseCoatingTarget(actor, item, use) {
  const candidates = actor.items.filter(i => ["weapon", "armor"].includes(i.type) && goesOn(use.appliesTo, i));
  const kind = game.i18n.localize(`AZEROTH.Use.GoesOn.${use.appliesTo || "weapon"}`);
  if (!candidates.length) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Use.NothingToCoat", { name: item.name, kind }));
    return null;
  }
  if (candidates.length === 1) return candidates[0];
  const coated = i => i.getFlag("azeroth-rpg", "coating")?.name ?? null;
  const chosen = await chooseOption(item, candidates.map(i => ({
    name: i.name,
    tag: coated(i) ? game.i18n.format("AZEROTH.Use.Coated", { name: coated(i) }) : null,
    description: i.system.description ?? "",
    itemId: i.id
  })), kind);
  return chosen ? (actor.items.get(chosen.itemId) ?? null) : null;
}

/** The feature card's bound line (D-643): the kind, who is bound, what was called or dismissed, and an Attack for Sic 'Em. */
/** The bound lines with their content links resolved, so the card can print them. */
async function enrichBound(context, relativeTo) {
  if (!context) return null;
  return { ...context, lines: await Promise.all(context.lines.map(l => enrich(l, { relativeTo }))) };
}

function boundContext(actor, sys, called = [], dismissed = null, planted = []) {
  const kind = sys.bound?.kind ?? null;
  const lines = [];
  // Every creature of the kind, so the card's Attack button can NAME one
  // (the lead's item 24): a shaman standing four totems had four lines and a
  // single button that always swung the first of them.
  const held = kind ? boundOf(actor, kind) : [];
  // EVERY CREATURE IS A LINK, not a name. The card printed the Imp as plain
  // text, so dragging it onto the canvas did nothing at all (the lead,
  // 2026-09-07). A `@UUID` content link is what core makes draggable, and
  // dropping one on the scene is how a token gets made - no drag code of ours.
  const link = b => (b?.uuid ? `@UUID[${b.uuid}]{${b.name}}` : (b?.name ?? "—"));
  if (kind) {
    lines.push(game.i18n.format("AZEROTH.Bound.Line", {
      kind: game.i18n.localize(AZEROTH.boundKinds[kind] ?? kind),
      names: held.map(link).join(", ") || "—"
    }));
  }
  for (const c of called) {
    lines.push(game.i18n.format("AZEROTH.Bound.Summoned", { count: c.count, name: c.uuid ? link(c) : c.name }));
  }
  if (dismissed) lines.push(game.i18n.format("AZEROTH.Bound.Released", { owner: actor.name, name: dismissed }));
  // WHERE THE TOTEM IS STANDING (02 §7, D-708). A line each, never a button:
  // it is already planted, and a control that would do nothing is worse than
  // none (D-681). A shaman with no token on any scene reads why nothing was
  // placed. Four lines where Totem Mastery placed four (D-710).
  for (const p of (Array.isArray(planted) ? planted : [planted]).filter(Boolean)) {
    lines.push(plantedLine({ owner: actor, totem: p.totem, placed: p.placed }));
  }
  if (!lines.length) return null;
  const attacks = held.map(b => ({ uuid: b.uuid, name: b.name }));
  return {
    lines,
    attack: sys.bound?.action === "attack" && attacks.length > 0,
    attacks,
    // One button reads *Attack*; several have to say which, or the reader
    // cannot tell them apart.
    many: attacks.length > 1
  };
}

/**
 * The options a menu feature offers (D-618, D-619), gated by the level the
 * granting class functions at - the character's level for the primary
 * class, `secondaryLevel` for a second - with a note for the chooser:
 *  - `totems`: the class's totems table, those whose level is reached;
 *  - `elementals`: the Elementals of 14's *Elementals, Oozes and Constructs*
 *    section - the binding 14 SS13 states - at the class's tier or below,
 *    Standard before Elite. The Searing Totem and the Treant are typed
 *    elemental too and sit in SS13, so type alone listed them (the eye, D-619);
 *  - `forms`: the Druid's known forms; while 02 SS7's Forms table leaves
 *    room, every Beast at Chaff or Standard weight class as well, the known
 *    ones first, and taking one learns it (`learn: true`).
 * A creature option carries its `uuid` so the card can link the block.
 */
export async function featureMenu(actor, item) {
  const sys = item.system;
  if (sys.choice === "skills") {
    // Adaptable (02 SS5, D-636): one skill, always in-career, held one at a
    // time on the trait's `known` list. A race trait has no class behind it,
    // so this answers before the class lookup below.
    const held = skillFromKnown(sys.known ?? []);
    const options = Object.entries(AZEROTH.skills).map(([key, label]) => ({
      key, uuid: skillUuid(key), name: game.i18n.localize(label), description: "",
      learn: "replace", tag: key === held ? game.i18n.localize("AZEROTH.Feature.Known") : null
    }));
    return { options, note: null };
  }
  // **THE TINKER'S AND THE GNOME'S MENUS** (the Legacy branches' doors 6 and 7): a
  // talent's grant with no class level to gate them by - The Bench's constructs,
  // Gadgeteer's gadgets, Overclock's and Mekkatorque's Blueprint's - so they answer
  // before the class lookup, as Adaptable's skills do.
  if (sys.choice === "constructs") return constructMenu(actor);
  if (sys.choice === "gadgets") return gadgetMenu(actor, item);
  if (sys.choice === "overclock") return overclockMenu(actor);
  if (sys.choice === "blueprint") return blueprintMenu(actor);
  const classId = item.getFlag("azeroth-rpg", "feature")?.classId ?? null;
  const classes = actor.classItems ?? [];
  const index = classes.findIndex(c => c.id === classId);
  const cls = classes[index] ?? classes.find(c => c.name === sys.className) ?? null;
  if (!cls) return { options: [], note: null };
  const level = actor.system.level ?? 1;
  const at = index <= 0 ? level : secondaryLevel(level);
  const levelTag = l => `${game.i18n.localize("AZEROTH.Sheet.Level")} ${l}`;
  const notYet = l => game.i18n.format("AZEROTH.Feature.NotYetTag", { level: l });
  if (sys.choice === "totems") {
    // Every totem the class has, in level order and within a level the
    // chapter's own order; one the level has not reached is listed and
    // greyed rather than hidden (D-635). Searing links its block in 14.
    const entries = await bestiaryEntries();
    const options = (cls.system?.totems ?? [])
      .map((t, i) => ({ t, i }))
      .sort((a, b) => ((a.t.level ?? 1) - (b.t.level ?? 1)) || (a.i - b.i))
      .map(({ t }) => {
        const available = (t.level ?? 1) <= at;
        const block = entries.find(e => e.name === `${t.name} Totem`) ?? null;
        // The six 14 prints no block for take 02's numbers (D-643): 1 Health, 0 AP, no Defense.
        const built = block ? null : { name: `${t.name} Totem`, img: "icons/svg/mystery-man.svg", system: totemBlock({ name: t.name, description: t.description ?? "", tier: tierForLevel(at) }) };
        return { key: t.name.slugify(), uuid: block?.uuid ?? null, block: built, name: t.name, level: t.level, available,
          tag: available ? levelTag(t.level) : notYet(t.level), description: t.description };
      });
    return { options, note: null };
  }
  if (sys.choice === "demons" || sys.choice === "greaterDemons") {
    // 02 SS7's two tables (D-635): the three learned by level, the greater
    // ones from 11. Each links its block in 14.
    const entries = await bestiaryEntries();
    const greaterOnly = sys.choice === "greaterDemons";
    const options = (cls.system?.demons ?? [])
      .filter(d => !greaterOnly || d.greater)
      .map(d => {
        const level = d.level ?? 1;
        const available = level <= at;
        const block = entries.find(e => e.name === d.name) ?? null;
        const tag = d.greater
          ? (available ? game.i18n.localize("AZEROTH.Feature.Greater") : notYet(level))
          : (available ? levelTag(level) : notYet(level));
        return { key: d.name.slugify(), uuid: block?.uuid ?? null, name: d.name, level, available, tag, description: d.description };
      });
    // A taken talent widens the table (Felguard, D-642): read at menu time.
    if (!greaterOnly) {
      const extras = patchesFor(actor.takenTalents(), cls.name, item.name).flatMap(p => p.patch.choiceExtra ?? []);
      for (const d of extras) {
        if (options.some(o => o.name === d.name)) continue;
        const block = entries.find(e => e.name === d.name) ?? null;
        options.push({ key: d.name.slugify(), uuid: block?.uuid ?? null, name: d.name, level: d.level ?? 1, available: true,
          tag: levelTag(d.level ?? 1), description: block?.description ?? "" });
      }
    }
    // The GM's own demons (D-650), at the character's tier or below.
    if (!greaterOnly) {
      const tier = actor.system.tier ?? 1;
      for (const e of worldCreatures(["demon"], { owner: actor })) {
        const fit = eligible("demon", e, { tier });
        const option = creatureOption(e);
        const heldHere = boundOf(actor, "demon").some(b => b.uuid === e.uuid);
        options.push({ ...option, level: 1, available: heldHere || fit.ok,
          tag: heldHere ? game.i18n.localize("AZEROTH.Feature.Bonded") : (fit.ok ? option.tag : ineligibleTag(fit.reason, e)) });
      }
    }
    const heldDemons = heldNames(actor, "demon");
    const note = greaterOnly && /Summoning/i.test(item.name) ? game.i18n.localize("AZEROTH.Feature.UpToThree")
      : (heldDemons.length ? game.i18n.format("AZEROTH.Bound.Held", { names: heldDemons.join(", ") }) : null);
    // 04's Demonic Sacrifice (*The dismissed demon cannot be summoned again until
    // your next Long Rest*; D-775): listed, greyed and said why (D-635).
    const sacrificed = actor.getFlag?.("azeroth-rpg", SACRIFICED_FLAG) ?? [];
    const locked = options.map(o => (isSacrificed(sacrificed, o)
      ? { ...o, available: false, sacrificed: true, tag: game.i18n.localize("AZEROTH.Sacrifice.Tag") }
      : o));
    return { options: locked, note };
  }
  if (sys.choice === "beasts") {
    // The Ranger's Companion (02 SS7, D-635): any Beast in 14, the bond held
    // one at a time and recorded as the one known; the Handling Test is
    // the table's, against the DC on the entry.
    // A bound companion is a world actor carrying its entry (D-643); Master
    // of Wilds opens the Dragonkin; an entry with no Handling DC is listed
    // and greyed (O-33 is the book's).
    const talents = actor.takenTalents();
    const held = boundOf(actor, "companion");
    const bonded = new Set([...held.map(b => bondOf(b)?.entryUuid), ...held.map(b => b.uuid)]);
    const order = Object.keys(AZEROTH.weightClasses);
    const tier = actor.system.tier ?? 1;
    // **04's GRAVE BOND** (*Your Companion class feature may bond a **Mindless** Undead
    // that is not a Boss*; the Legacy branches' door 26): the undead listed beside the
    // beasts, an undead that is not Mindless never, a Boss greyed in words - and the
    // pick carries the Spirit Resilience Test that binds in place of the Handling Test.
    const graveBond = graveBondFor(talents);
    // The undead that resisted this bonder's Grave Bond before, greyed in words (02's
    // Companion: *On a failure that beast will not be tried again*; the B2 review).
    const resisted = new Set(resistedBonds(actor.getFlag("azeroth-rpg", GRAVE_BOND_RESISTED_FLAG)));
    // 14's entries and the GM's own beasts (D-650), gated by the talent, the
    // Handling DC and the character's tier; held ones tagged, never greyed.
    const options = [...(await bestiaryEntries()), ...worldCreatures(["beast", "dragonkin", ...(graveBond ? ["undead"] : [])], { owner: actor })]
      // 14 SS13 gives a Companion *any entry in Beasts*: never SS15's Frog and Rabbit,
      // the forms Hex and Polymorph lay (D-808, MY READING).
      .filter(e => (e.creatureType === "beast" || e.creatureType === "dragonkin" || (graveBond && e.creatureType === "undead")) && e.name !== "Avatar"
        && !FORCED_FORMS.includes(e.name))
      .sort((a, b) => (order.indexOf(a.weightClass) - order.indexOf(b.weightClass)) || ((a.tier ?? 1) - (b.tier ?? 1)) || a.name.localeCompare(b.name))
      .map(e => {
        const option = creatureOption(e);
        const fit = eligible("companion", e, { talents, tier, graveBond: Boolean(graveBond) });
        if (fit.reason === "NotBeast" || fit.reason === "NotMindless") return null;
        if (bonded.has(e.uuid)) return { ...option, tag: game.i18n.localize("AZEROTH.Feature.Bonded"), available: true, held: true };
        if (fit.test === "spirit" && resisted.has(e.uuid)) return { ...option, tag: game.i18n.format("AZEROTH.GraveBond.ResistedTag", { talent: graveBond.name }), available: false };
        if (fit.test === "spirit") return { ...option, tag: game.i18n.format("AZEROTH.GraveBond.Tag", { tag: option.tag, talent: graveBond.name }), available: true, graveBond: true };
        return { ...option, tag: fit.ok ? option.tag : ineligibleTag(fit.reason, e), available: fit.ok };
      })
      .filter(Boolean);
    const names = heldNames(actor, "companion");
    const note = game.i18n.localize("AZEROTH.Feature.CompanionNote") + (names.length ? " " + game.i18n.format("AZEROTH.Bound.Held", { names: names.join(", ") }) : "");
    return { options, note };
  }
  if (sys.choice === "avatar") {
    // Avatar of the Wild (02 SS7, D-635): the Avatar block, or any Beast at Elite.
    const options = (await bestiaryEntries())
      .filter(e => e.name === "Avatar" || (e.creatureType === "beast" && e.weightClass === "elite"))
      .sort((a, b) => (a.name === "Avatar" ? -1 : b.name === "Avatar" ? 1 : a.name.localeCompare(b.name)))
      .map(creatureOption);
    return { options, note: null };
  }
  if (sys.choice === "warCry") {
    // War Cry (02 SS7, D-635): Rallying Cry or Battle Shout, with the numbers
    // the level gives.
    return { options: [
      { key: "rallying", name: game.i18n.localize("AZEROTH.Feature.WarCry.Rallying"),
        description: `<p>${game.i18n.format("AZEROTH.Feature.WarCry.RallyingText", { level })}</p>` },
      { key: "battle", name: game.i18n.localize("AZEROTH.Feature.WarCry.Battle"),
        description: `<p>${game.i18n.format("AZEROTH.Feature.WarCry.BattleText", { amount: Math.floor(level / 3) })}</p>` }
    ], note: null };
  }
  if (sys.choice === "flightSchools") {
    // 02's Scales of the Flight (stage 2B): the schools the branches tie on, named once a
    // Long Rest; where one branch leads there is nothing to name, said in words, and the
    // empty menu refuses the Use before its use is struck.
    const flight = flightSchool({ points: branchPointsFor(actor.takenTalents?.() ?? []), chosen: actor.getFlag("azeroth-rpg", FLIGHT_SCHOOL_FLAG) ?? null });
    const options = flight.open.map(key => ({ key, name: game.i18n.localize(AZEROTH.schools[key] ?? key), description: "",
      tag: key === flight.school ? game.i18n.localize("AZEROTH.Feature.Known") : null }));
    const note = flight.open.length ? game.i18n.localize("AZEROTH.Chromatic.FlightTieNote")
      : game.i18n.format("AZEROTH.Chromatic.FlightLeadNote", { name: item.name, school: game.i18n.localize(AZEROTH.schools[flight.school] ?? flight.school ?? "") });
    return { options, note };
  }
  if (sys.choice === "schools") {
    // A school of your choice (Shield of the Righteous, Ward, Divine Hymn).
    const options = Object.entries(AZEROTH.schools).map(([key, label]) => ({ key, name: game.i18n.localize(label), description: "" }));
    return { options, note: game.i18n.localize("AZEROTH.Feature.SchoolNote") };
  }
  if (sys.choice === "poisons") {
    // Poisoner (02 SS7, D-635): the poisons carried (08 SS12); none is a note.
    const carried = actor.items.filter(i => i.type === "gear" && /Poisons/i.test(i.system?.source?.section ?? "") && (i.system?.quantity ?? 1) > 0);
    const options = carried.map(i => ({ key: i.id, uuid: i.uuid, name: i.name, description: i.system.description ?? "",
      tag: (i.system.quantity ?? 1) > 1 ? `\u00d7${i.system.quantity}` : null }));
    return { options, note: options.length ? null : game.i18n.localize("AZEROTH.Feature.NoPoisons") };
  }
  if (sys.choice === "elementals") {
    // 02 says "an elemental of your tier"; 14 prints every elemental at
    // Tier 2, so at level 17 the filter admits them all. Flagged in D-619.
    const tier = tierForLevel(at);
    const order = Object.keys(AZEROTH.weightClasses);
    // 14's elementals and the GM's own (D-650), at the tier or below.
    const options = [
      ...(await bestiaryEntries()).filter(e => e.creatureType === "elemental" && ELEMENTALS_SECTION.test(e.section)),
      ...worldCreatures(["elemental"], { owner: actor }).filter(e => !/totem/i.test(e.name))
    ]
      .filter(e => (e.tier ?? 1) <= tier)
      .sort((a, b) => (order.indexOf(a.weightClass) - order.indexOf(b.weightClass)) || a.name.localeCompare(b.name))
      .map(creatureOption);
    return { options, note: null };
  }
  if (sys.choice === "forms") {
    const known = (sys.known ?? []).map(k => ({ uuid: k.uuid, name: k.name }));
    const allowed = formsKnown(cls.system?.forms ?? [], at);
    const entries = await bestiaryEntries();
    const byUuid = new Map(entries.map(e => [e.uuid, e]));
    const knownTag = game.i18n.localize("AZEROTH.Feature.Known");
    const held = known.map(k => {
      const e = byUuid.get(k.uuid);
      const base = e ? creatureOption(e) : { key: k.uuid, uuid: k.uuid, name: k.name, description: "" };
      return { ...base, tag: knownTag, known: true };
    });
    const note = game.i18n.format("AZEROTH.Feature.FormsKnown", { value: known.length, max: allowed });
    if (known.length >= allowed) return { options: held, note };
    const taken = new Set(known.map(k => k.uuid));
    const open = entries
      .filter(e => isShapeshiftForm(e) && !taken.has(e.uuid))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(e => ({ ...creatureOption(e), learn: true }));
    return { options: [...held, ...open], note };
  }
  return { options: [], note: null };
}

/** The options alone, for a caller that wants the list. */
export async function featureChoices(actor, item) {
  return (await featureMenu(actor, item)).options;
}

/** 14 SS13: a shaman's called elemental answers from *Elementals, Oozes and Constructs*. */
const ELEMENTALS_SECTION = /Elementals, Oozes and Constructs/;

/** 14's creatures, as the bestiary pack's index carries them. */
async function bestiaryEntries() {
  const pack = game.packs.get("azeroth-rpg.bestiary");
  if (!pack) return [];
  const index = await pack.getIndex({ fields: ["system.creatureType", "system.weightClass", "system.tier", "system.description", "system.source.section", "system.handlingDC", "system.typeMarker"] });
  return index.map(e => ({
    uuid: e.uuid,
    name: e.name,
    creatureType: e.system?.creatureType ?? null,
    // The block's marker - *Mindless* - which 04's Grave Bond reads (door 26).
    typeMarker: e.system?.typeMarker ?? null,
    weightClass: e.system?.weightClass ?? null,
    tier: e.system?.tier ?? 1,
    handlingDC: e.system?.handlingDC ?? null,
    section: e.system?.source?.section ?? "",
    description: e.system?.description ?? ""
  }));
}

/**
 * The GM's own creatures of a type, standing in the world and bound to no
 * one (D-650): a menu lists them beside 14's entries, and a pick binds the
 * actor itself rather than making one. A creature already bound to this
 * owner is listed as held; one bound to another character is not listed.
 */
function worldCreatures(types = [], { owner = null } = {}) {
  // A thrall is bound for its minute (04's Thrall of the Banshee; the B3 fix run) and is
  // offered to nobody - not even as held by its owner, whose bond it is not.
  return game.actors
    .filter(a => a.type === "npc" && types.includes(a.system?.creatureType) && (!bondOf(a) || (bondOf(a).ownerUuid === owner?.uuid && !isThrallBond(bondOf(a)))))
    .map(a => ({
      uuid: a.uuid, name: a.name, creatureType: a.system.creatureType ?? null, weightClass: a.system.weightClass ?? null,
      tier: a.system.tier ?? 1, handlingDC: a.system.handlingDC ?? null, section: "", description: a.system.lore ?? "", world: true,
      typeMarker: a.system.typeMarker ?? null
    }));
}

/** A creature as a chooser option: its block's uuid, and a tag of tier and weight class. */
function creatureOption(e) {
  const weight = game.i18n.localize(AZEROTH.weightClasses[e.weightClass] ?? e.weightClass ?? "");
  const tag = `${game.i18n.localize("AZEROTH.Sheet.Tier")} ${e.tier} \u00b7 ${weight}`;
  return {
    key: e.uuid, uuid: e.uuid, name: e.name, tier: e.tier, weightClass: e.weightClass,
    tag: e.world ? `${tag} \u00b7 ${game.i18n.localize("AZEROTH.Bound.InWorld")}` : tag,
    description: e.description,
    world: Boolean(e.world)
  };
}

/** A greyed row's tag: why the pick waits (D-650). */
function ineligibleTag(reason, entry) {
  if (reason === "NoHandling") return game.i18n.localize("AZEROTH.Bound.NoHandling");
  if (reason === "Tier") return game.i18n.format("AZEROTH.Bound.TierAbove", { tier: entry.tier ?? 1 });
  // 04's Grave Bond (door 26): *that is not a Boss*.
  if (reason === "Boss") return game.i18n.localize("AZEROTH.GraveBond.BossTag");
  return null;
}

/**
 * **04's GRAVE BOND: THE TEST THAT BINDS** (*In place of the Handling Test, it makes
 * a Spirit Resilience Test against your Spell DC, and on a failure it is bound to
 * you*; the Legacy branches' door 26): the creature's own Spirit Resilience
 * (`resilienceModifiers` off the entry or the GM's creature), rolled by the Use at
 * the pick, against the bonder's Spell DC, said on a card - MY READING, for the lead:
 * the remains have no token to roll a Resist card of their own. Answers whether the
 * creature RESISTED, which binds nothing; no Spell DC binds nothing either, in words.
 *
 * @param {{owner: Actor, creature: Actor, talent: string}} o
 * @returns {Promise<boolean>}
 */
async function graveBondTest({ owner, creature, talent, uuid = null, resilience = "spirit" }) {
  const dc = owner.system?.spellDC ?? owner.system?.spells?.dc ?? null;
  if (!(Number(dc) > 0)) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.GraveBond.NoDC", { talent, name: owner.name }));
    return true;
  }
  // **THE RESILIENCE THE ROW NAMES** (`graveBondFor`'s `resist`; the B6 review: the key
  // was decorative and the Test always rolled Spirit) - 04's Spirit, as stamped.
  const bonus = resilienceModifiers(creature, AZEROTH.resiliences?.[resilience] ? resilience : "spirit").reduce((n, r) => n + (Number(r.value) || 0), 0);
  const roll = await new Roll(`1d20 + ${bonus}`).evaluate();
  const resisted = succeeded(roll.total, Number(dc));
  // **A CREATURE THAT RESISTS IS NOT TRIED AGAIN** (02's Companion: *On a failure that
  // beast will not be tried again*; the B2 review): recorded on the bonder under the
  // uuid the pick named, before the card, so the menu greys it from now on.
  if (resisted && owner.isOwner) {
    const key = uuid ?? creature.uuid ?? null;
    await owner.setFlag("azeroth-rpg", GRAVE_BOND_RESISTED_FLAG, withResistedBond(owner.getFlag("azeroth-rpg", GRAVE_BOND_RESISTED_FLAG) ?? [], key));
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: owner }),
    rolls: [roll],
    content: `<p>${game.i18n.format(resisted ? "AZEROTH.GraveBond.Resisted" : "AZEROTH.GraveBond.Failed", { name: creature.name, talent, dc, total: roll.total })}</p>`
  });
  return resisted;
}

/**
 * **THE BENCH'S MENU** (04's The Bench: *You build constructs from the
 * **Constructs** table below, one whose tier is no higher than yours*; the Legacy
 * branches' door 6): the table's four, each linked to its block in 14 and greyed
 * above the tinker's tier or where the pack holds no block; then every construct
 * held - a wrecked one offered as its rebuild, a standing one listed as held.
 *
 * @param {Actor} actor
 */
async function constructMenu(actor) {
  const entries = await bestiaryEntries();
  const tier = actor.system?.tier ?? 1;
  const options = CONSTRUCTS.map(c => {
    const block = entries.find(e => e.name === c.name) ?? null;
    const fit = constructEligible({ name: c.name }, { tier });
    const tag = !block ? game.i18n.localize("AZEROTH.Construct.NoBlockTag")
      : (fit.ok ? `${game.i18n.localize("AZEROTH.Sheet.Tier")} ${c.tier}` : game.i18n.format("AZEROTH.Bound.TierAbove", { tier: c.tier }));
    return { key: c.name.slugify(), uuid: block?.uuid ?? null, name: c.name, tier: c.tier, available: Boolean(block) && fit.ok, tag, description: block?.description ?? "" };
  });
  for (const b of boundOf(actor, "construct")) {
    const wrecked = isWrecked({ kind: "construct", health: b.system?.health?.value ?? null });
    options.push(wrecked
      ? { key: `rebuild:${b.uuid}`, uuid: b.uuid, name: game.i18n.format("AZEROTH.Construct.RebuildOption", { name: b.name }), available: true, rebuild: true, tag: game.i18n.localize("AZEROTH.Construct.WreckedTag"), description: "" }
      : { key: `held:${b.uuid}`, uuid: b.uuid, name: b.name, available: true, held: true, tag: game.i18n.localize("AZEROTH.Construct.StandingTag"), description: "" });
  }
  const room = capacity("construct", { level: actor.system?.level ?? 1, talents: actor.takenTalents?.() ?? [] });
  const names = heldNames(actor, "construct");
  return { options, note: game.i18n.format("AZEROTH.Construct.MenuNote", { n: room }) + (names.length ? " " + game.i18n.format("AZEROTH.Bound.Held", { names: names.join(", ") }) : "") };
}

/** A gadget's Effect cell, bold as the chapter sets it. */
function gadgetHTML(gadget) {
  return `<p>${String(gadget?.text ?? "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}</p>`;
}

/**
 * **EACH GADGET'S ENTRY IN THE GADGETS COMPENDIUM**, by key (the lead, 2026-10-24: *"the
 * gadget table is not linked within the talent gadgeteer"*): its uuid and name, for the
 * link a menu row opens its text on - and so the link the Use's card prints, since
 * `chosenHTML` prints a pick's text whole. Empty where the pack is not loaded (a world not
 * restarted since it was built), and a row then prints no link rather than a broken one.
 *
 * @returns {Promise<Map<string, {uuid: string, name: string}>>}
 */
async function gadgetEntriesByKey() {
  const pack = game.packs.get(GADGETS_PACK);
  if (!pack) return new Map();
  const index = await pack.getIndex({ fields: ["system.identifier"] });
  return new Map(index.map(e => [e.system?.identifier ?? null, { uuid: e.uuid, name: e.name }]).filter(([key]) => key));
}

/** A gadget's text in a menu: the link to its entry, then its Effect cell. */
function gadgetRowHTML(gadget, entries) {
  return gadgetLinkLine({ uuid: entries.get(gadget?.key)?.uuid ?? null, name: gadget?.name }) + gadgetHTML(gadget);
}

/**
 * **GADGETEER'S MENU**: 2 + character tier, plus Engineering Upgrade's ranks.
 * The table's gadgets as a checklist, the ones known ticked, the allowance in
 * the note, each row opening on its entry's link. The checklist's ceiling is
 * `useFeature`'s.
 *
 * @param {Actor} actor
 * @param {Item} item  the Gadgeteer feature
 */
async function gadgetMenu(actor, item) {
  const allowed = gadgetsKnownFor(actor.takenTalents?.() ?? [], undefined, { tier: actor.system?.tier ?? 1 }).known;
  const known = new Set(knownGadgets(item.system?.known ?? []).map(g => g.key));
  const entries = await gadgetEntriesByKey();
  const options = GADGETS.map(g => ({
    key: g.key, name: g.name, available: true, checked: known.has(g.key),
    tag: known.has(g.key) ? game.i18n.localize("AZEROTH.Feature.Known") : g.useText,
    description: gadgetRowHTML(g, entries)
  }));
  return { options, note: game.i18n.format("AZEROTH.Gadget.MenuNote", { n: allowed }) };
}

/**
 * **OVERCLOCK'S MENU** (02's gnome: *a device you built or a gadget you know works
 * one step better and then breaks*; door 7): the gadgets known, each with its own
 * use left (one spent is greyed and said) and its row opening on its entry's link, and
 * the 08 §13 devices carried - which of them you built is the table's.
 *
 * @param {Actor} actor
 */
async function overclockMenu(actor) {
  const reach = overclockFor(actor.takenTalents?.() ?? []) ?? { gadgets: true, devices: true };
  const options = [];
  if (reach.gadgets) {
    const entries = await gadgetEntriesByKey();
    for (const f of actor.items.filter(i => i.type === "feature" && i.getFlag("azeroth-rpg", "feature")?.gadget).sort((a, b) => a.name.localeCompare(b.name))) {
      const left = f.system?.uses?.per ? (f.system.uses.value ?? 0) : 1;
      const entry = entries.get(f.getFlag("azeroth-rpg", "feature").gadget) ?? null;
      options.push({ key: f.id, featureId: f.id, name: f.name, gadget: true, available: left > 0,
        tag: left > 0 ? game.i18n.localize("AZEROTH.Overclock.GadgetTag") : game.i18n.localize("AZEROTH.Overclock.SpentTag"),
        description: gadgetLinkLine({ uuid: entry?.uuid ?? null, name: f.name }) + (f.system?.description ?? "") });
    }
  }
  if (reach.devices) {
    for (const i of actor.items.filter(x => x.type === "gear" && DEVICE_SECTION.test(x.system?.source?.section ?? "")).sort((a, b) => a.name.localeCompare(b.name))) {
      options.push({ key: i.id, uuid: i.uuid, name: i.name, device: true, available: true, tag: game.i18n.localize("AZEROTH.Overclock.DeviceTag"), description: i.system?.description ?? "" });
    }
  }
  return { options, note: game.i18n.localize(options.length ? "AZEROTH.Overclock.Note" : "AZEROTH.Overclock.Nothing") };
}

/**
 * **MEKKATORQUE'S BLUEPRINT'S MENU** (02's gnome: *build one device from
 * **08-EQUIPMENT** or one gadget from **04-TALENTS** that you have the parts for, at
 * no cost in gold*; door 7): 04's eight gadgets and 08 §13's devices off the gear
 * pack, each linked to its entry. *That you have the parts for* is the table's.
 */
async function blueprintMenu(actor) {
  // **WHAT THE TALENT'S ROW SAYS IT BUILDS** (the B2 review: `blueprintFor` had no
  // caller), the way Overclock's menu reads `overclockFor`: 04's gadgets and 08 §13's
  // devices each only where the row reaches them.
  const reach = blueprintFor(actor?.takenTalents?.() ?? []) ?? { gadgets: true, devices: true };
  // Each gadget's row opens on its entry's link, as Gadgeteer's do (the lead, 2026-10-24).
  const entries = reach.gadgets ? await gadgetEntriesByKey() : new Map();
  const options = reach.gadgets
    ? GADGETS.map(g => ({ key: g.key, name: g.name, gadget: true, available: true, tag: game.i18n.localize("AZEROTH.Blueprint.GadgetTag"), description: gadgetRowHTML(g, entries) }))
    : [];
  const pack = reach.devices ? game.packs.get("azeroth-rpg.gear") : null;
  const index = pack ? await pack.getIndex({ fields: ["system.source.section", "system.description"] }) : [];
  for (const e of [...index].filter(e => DEVICE_SECTION.test(e.system?.source?.section ?? "")).sort((a, b) => a.name.localeCompare(b.name))) {
    options.push({ key: e.uuid, uuid: e.uuid, name: e.name, device: true, available: true, tag: game.i18n.localize("AZEROTH.Blueprint.DeviceTag"), description: e.system?.description ?? "" });
  }
  return { options, note: game.i18n.localize("AZEROTH.Blueprint.Note") };
}

/** What the card prints for the option chosen: the block's link first, where there is one. */
function chosenHTML(chosen) {
  const body = chosen.description ?? "";
  return chosen.uuid ? `<p>@UUID[${chosen.uuid}]{${chosen.name}}</p>${body}` : body;
}

/**
 * Hold a checklist chooser to its ceiling (D-710): once `max` rows are
 * ticked, every unticked one that is still enabled greys, and unticking one
 * opens them again. A row the level has not reached stays greyed either way.
 */
function capTicks(dialog, max) {
  // The MARK IS ON THE BOX, not on the window: a re-render replaces the
  // controls and leaves the frame standing, so a flag on the frame would skip
  // binding the new ones (CLAUDE.md §15 - a control queried before a render is
  // dead after it).
  const boxes = [...dialog.element.querySelectorAll('input[name="choice"]')]
    .filter(b => b.dataset.azerothCapped !== String(max));
  if (!boxes.length) return;
  for (const box of boxes) box.dataset.azerothCapped = String(max);
  const unavailable = new Set(boxes.filter(b => b.disabled).map(b => b.value));
  const refresh = () => {
    const full = boxes.filter(b => b.checked).length >= max;
    for (const box of boxes) {
      if (unavailable.has(box.value)) continue;
      box.disabled = full && !box.checked;
      box.closest(".azeroth-choose-option")?.classList.toggle("is-unavailable", box.disabled);
    }
  };
  for (const box of boxes) box.addEventListener("change", refresh);
  refresh();
}

/**
 * The *Select all* row above a checklist (D-721): a table of six players is
 * six clicks otherwise, and the picker that offers a find is ticked for
 * everybody far more often than not.
 *
 * The mark is on the BOX, for the reason `capTicks` gives above it: a
 * re-render replaces the controls and leaves the frame standing.
 *
 * Two rules, and both of them are about the greying `capTicks` does:
 *
 * - **Ticking touches only what is still enabled**, so a row the rule has
 *   closed - a player with no character, an option the level has not reached -
 *   stays untouched, and a `max` below the count fills to the cap and stops.
 * - **Every change is DISPATCHED**, so `capTicks`'s own listener refreshes;
 *   setting `checked` in script fires nothing by itself.
 */
function bindSelectAll(dialog) {
  const all = dialog.element.querySelector('input[name="all"]');
  if (!all || all.dataset.azerothAll === "1") return;
  all.dataset.azerothAll = "1";
  const boxes = [...dialog.element.querySelectorAll('input[name="choice"]')];
  if (!boxes.length) return;
  // Disabled BEFORE anything is ticked is unavailable; disabled after it is
  // the ceiling, which opens again as soon as a row is unticked.
  const open = boxes.filter(b => !b.disabled);

  const sync = () => { all.checked = open.length > 0 && open.every(b => b.checked); };
  all.addEventListener("change", () => {
    const on = all.checked;
    for (const box of boxes) {
      if (box.checked === on) continue;
      if (on && box.disabled) continue;
      box.checked = on;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    }
    sync();
  });
  for (const box of boxes) box.addEventListener("change", sync);
  sync();
}

/**
 * The chooser: one select over the options, each with its effect shown. Null
 * on dismiss.
 *
 * Exported since D-673, because *Put in* on an item's right click is the same
 * shape - a list of the containers that could take it, one greyed where it is
 * full - and a second chooser would be a second place for the greying to rot.
 * `label` and `prompt` are the caller's words: "Use" is wrong for a sack.
 *
 * **`max` ABOVE ONE MAKES IT A CHECKLIST** (02 §7's Totem Mastery, D-710) and
 * the return becomes an ARRAY of the options ticked, in the list's order.
 * At `max === 1` - every other caller - nothing moves: the select, the one
 * option back, null on dismiss. D-673 is why this was extended rather than
 * joined by a second dialog.
 *
 * **An option may arrive TICKED** (D-721): `checked: true` on a row of a
 * checklist starts it selected, which is what lets the loot picker open with
 * every connected player already offered the find. It is a key of its own
 * rather than `selected`, which drives the focus and must not tick anything;
 * `checked` survives the `cleanHTML` DialogV2 puts string content through,
 * where `autofocus` never did. `selectAll` adds the row that ticks the lot.
 *
 * A plain `{id, name}` is enough for `item`: only `.id`, `.name` and its use
 * as the enricher's `relativeTo` are read, so a caller with no document of
 * its own does not have to invent one.
 *
 * @returns {Promise<object|object[]|null>}
 */
export async function chooseOption(item, options, note = null, { label = "AZEROTH.Feature.Use", prompt = null, max = 1, selectAll = false, timeoutMs = 0 } = {}) {
  const { DialogV2 } = foundry.applications.api;
  const openedAt = Date.now();
  let shown = null, expired = false, timer = null;
  const closeExpired = () => { Promise.resolve(shown?.close?.()).catch(error => console.warn("azeroth-rpg | timed chooser close", error)); };
  const count = Math.max(1, Math.trunc(Number(max) || 1));
  const many = count > 1;
  const content = await renderTemplate(TEMPLATE.choose, {
    prompt: prompt ?? (many
      ? game.i18n.format("AZEROTH.Feature.ChooseUpTo", { name: item.name, count })
      : game.i18n.format("AZEROTH.Feature.Choose", { name: item.name })),
    note,
    multi: many,
    max: count,
    // The row that ticks the lot is a checklist's alone: with one pick there
    // is nothing to select all of.
    selectAll: many && selectAll === true,
    options: await Promise.all(options.map(async (o, i) => ({
      ...o, index: i, disabled: o.available === false, multi: many, max: count,
      selected: i === options.findIndex(x => x.available !== false),
      // A ROW THE RULE HAS CLOSED IS NEVER TICKED. `disabled checked` is a
      // real state in HTML: the box draws greyed AND ticked, the reader cannot
      // clear it, and `:checked` collects it into the callback's answer - so a
      // caller that ticked its rows by default would hand back the very option
      // it marked unavailable. The single-pick path has `selected` for this
      // and must not tick anything, so the gate names `many` too.
      checked: many && o.available !== false && o.checked === true,
      html: await enrich(o.description, { relativeTo: item })
    })))
  });
  // A callback that returns null falls through to the button's own action
  // (`DialogV2#_onClickButton`, 14.367: `?? button?.action`), so the multiple
  // case ALWAYS returns an array - an empty one reads as "nothing chosen".
  const waiting = DialogV2.wait({
    id: `azeroth-choose-${item.id}`,
    classes: ["azeroth", "azeroth-roll-dialog"],
    window: { title: item.name },
    position: { width: 440 },
    content,
    rejectClose: false,
    // The ceiling is held IN THE WINDOW, not only in the code behind it: once
    // `count` are ticked the rest grey, so nobody ticks a fifth totem and
    // watches it vanish from the card (D-681's rule, the other way round).
    // `capTicks` runs FIRST, so the Select all row it is kept in step with is
    // reading boxes whose greying has already settled.
    render: (event, dialog) => {
      shown = dialog;
      if (expired) { closeExpired(); return; }
      if (many) { capTicks(dialog, count); if (selectAll === true) bindSelectAll(dialog); }
    },
    buttons: [{
      action: "choose", label, default: true,
      callback: (event, button) => many
        ? [...button.form.querySelectorAll('input[name="choice"]:checked')].map(el => Number(el.value))
        : Number(button.form.elements.choice?.value)
    }]
  });
  const answer = await (Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Promise.race([waiting, new Promise(resolve => {
      timer = setTimeout(() => { expired = true; closeExpired(); resolve(null); }, Math.max(0, timeoutMs - (Date.now() - openedAt)));
    })]) : waiting).finally(() => clearTimeout(timer));
  if (many) {
    // More ticked than the use allows: the first `count`, in the list's order.
    const picked = (Array.isArray(answer) ? answer : [])
      .filter(i => Number.isInteger(i) && options[i])
      .slice(0, count)
      .map(i => options[i]);
    return picked.length ? picked : null;
  }
  const index = answer;
  if (index === null || index === undefined || Number.isNaN(index)) return null;
  return options[index] ?? null;
}

/**
 * The pool a feature or a Signature spends from: by name, by the class that
 * granted it where two classes carry the same pool name, and leniently where
 * the pool names nothing at all.
 *
 * **THE MATCH USED TO BE `p.name === poolName` AND NOTHING ELSE**, which is
 * D-637's own scar (CLAUDE.md §15: *a pool is held by its value, never by its
 * name*) sitting one line from the `manaPool` call that was written to cure
 * it. 14's block prints a number in the Power row and no type, so every one of
 * the 164 pack creatures snapshots as `name: null` and `useSignature`'s cost
 * step refused with **no pool** on every creature that carried one.
 * `rules/pools.mjs#poolNamed` is the judgement, and it is pure.
 */
function poolFor(actor, poolName, classId) {
  return poolNamed(actor.poolSnapshot?.() ?? [], poolName, { itemId: classId });
}

/* -------------------------------------------- */

/**
 * The Resiliences an actor is trained in: a character's classes' lists, a
 * creature's own (14 §1).
 */
export function trainedResiliences(actor) {
  const out = new Set(actor?.system?.resilience ?? []);
  for (const item of actor?.classItems ?? []) {
    for (const r of item.system?.resiliences ?? []) out.add(r);
  }
  return [...out];
}

/** The provenance rows a Resilience Test carries for this actor. */
export function resilienceModifiers(actor, resilience) {
  const ability = resilienceAbility(resilience);
  const abilityMod = actor.system.abilities?.[ability]?.mod
    ?? abilityModifier(actor.system.abilities?.[ability]?.value ?? 10);
  return resilienceRows({
    resilience, abilityMod,
    proficiency: actor.system.proficiency ?? 0,
    trained: trainedResiliences(actor).includes(resilience)
  });
}

/** A bare Resilience Test (05), through rollTest so the dialog's choice applies. */
export async function rollResilience({ actor, resilience, modifiers = null, ...rest } = {}) {
  if (!resilienceAbility(resilience)) return null;
  // The rows are this workflow's to compute; a caller's list is taken only
  // when it carries something (the dialog's spec once passed an empty one,
  // and it spread over the real rows).
  return rollTest({
    actor,
    kind: "resilience",
    title: game.i18n.localize(AZEROTH.resiliences[resilience]),
    ...rest,
    resilience,
    modifiers: modifiers?.length ? modifiers : resilienceModifiers(actor, resilience)
  });
}

/* -------------------------------------------- */

/**
 * A corruption exposure Test and its card (10 §3).
 *
 * NOTHING ACCRUES DURING A FIGHT (10-CORRUPTION): every occasion is a Long
 * Rest, being reduced to 0 Health, or something picked up deliberately. The
 * roll pipeline never calls this from an attack — D1 §9's turn budget has no
 * room for a Test per incoming blow.
 *
 * The Test is the track's Resilience, trained where the class trains it, at
 * the DC of what exposed you - the dialog's preset or the table's number -
 * with whatever Banes the dialog counted.
 */
export async function corruptionExposure({
  actor, track, dc = 12, boons = 0, banes = 0, provenanceExtra = [], occasion = null
} = {}) {
  const resilience = AZEROTH.corruptionResilience[track];
  if (!resilience) return null;

  const roll = AzerothRoll.build({
    dc,
    kind: "resilience",
    boons,
    banes,
    modifiers: resilienceModifiers(actor, resilience),
    rollData: actor.getRollData()
  });
  roll.options.provenance.push(...provenanceExtra);
  await roll.evaluate();

  await actor.offerElunesRegard?.(roll);
  const from = actor.system.corruption?.[track] ?? 0;
  // What a Signature takes off the point (08 §20, D-692): Nemesis Raiment's
  // *1 less Fel Corruption, to a minimum of 0*. The gate was judged in
  // `prepareDerivedData`, so an unworn suit contributes nothing here.
  const to = applyExposure(from, {
    failed: !roll.outcome.success,
    reduction: actor.system?.signatureEffects?.corruptionReduction?.[track] ?? 0
  });
  const crossed = thresholdsCrossed(to) > thresholdsCrossed(from)
    ? AZEROTH.CORRUPTION_THRESHOLDS.filter(t => to >= t).at(-1)
    : null;

  if (to !== from) await actor.update({ [`system.corruption.${track}`]: to });

  const content = await renderTemplate(TEMPLATE.corruption, {
    config: AZEROTH,
    title: game.i18n.localize("AZEROTH.Card.Exposure"),
    subtitle: game.i18n.localize(AZEROTH.corruptionTracks[track]),
    occasion: occasion ? game.i18n.localize(`AZEROTH.Occasion.${occasion[0].toUpperCase()}${occasion.slice(1)}`) : null,
    total: roll.total,
    dc,
    success: roll.outcome.success,
    verdict: verdictFor(roll.outcome, { word: game.i18n.localize(roll.outcome.success ? "AZEROTH.Card.Resisted" : "AZEROTH.Card.Exposed") }),
    track,
    from,
    to,
    crossed,
    provenance: roll.provenance
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    flags: { "azeroth-rpg": { kind: "corruption", track, from, to, occasion } }
  });
}

/* -------------------------------------------- */

/** The bands of every Critical Injury table (06 §8). */
export const CRITICAL_BANDS = Object.freeze([
  { min: 1, max: 4 }, { min: 5, max: 8 }, { min: 9, max: 12 },
  { min: 13, max: 15 }, { min: 16, max: 17 },
  { min: 18, max: 19, permanent: true },
  { min: 20, max: 20, dying: true }
]);

/**
 * The Critical Injury table for a location: by the flag the pack carries,
 * else by its name (06 §8: Body, Head, Limb).
 */
export async function criticalTable(location) {
  const pack = game.packs.get("azeroth-rpg.criticals");
  if (!pack) return null;
  const docs = await pack.getDocuments();
  return docs.find(t => t.getFlag("azeroth-rpg", "location") === location)
    ?? docs.find(t => t.name.toLowerCase().endsWith(location))
    ?? null;
}

/**
 * The Corruption a cast puts on the caster, unresisted (07 §8, 10 §3).
 *
 * A no-op for every spell but a tier 5 Fel or Shadow one, and for a creature:
 * 10's tracks are a character's. Returns the card where a point landed.
 */
/**
 * The Void Corruption a talent's `spell` row builds on a cast (the Chromatic Champion
 * plan's Black branch; `rules/free-casts.mjs#castVoidFor`), unresisted, through
 * `accrueCorruption`. A no-op where no taken talent's row names the spell with a
 * `void`, and for a creature.
 */
async function accrueCastVoid(actor, spell, talents = []) {
  if (!actor || actor.type !== "character") return null;
  const owed = castVoidFor(talents, { spell: spell?.name ?? "" });
  if (!(owed.amount > 0)) return null;
  return accrueCorruption(actor, { track: "void", points: owed.amount,
    occasion: game.i18n.format("AZEROTH.FreeCast.VoidOccasion", { name: spell.name, talent: owed.talent ?? "" }) });
}

/**
 * **THE CHROMATIC CHAMPION'S USES, JUDGED AND PICKED BEFORE ANYTHING IS PAID** (02 §7's
 * *Features by level*; stage 2B; D-768's order). Answers null where the Use is refused
 * or a chooser or pick was dismissed - nothing has been spent - else what the Use took:
 *
 * - `within` (Wing Buffet *each creature of your choice within 5 feet*, Dread Presence's
 *   10): a creature targeted, never the user, every one measured inside the reach where
 *   both stand on the board; a push of a creature this client does not own asks a GM;
 * - `breath`: the school (the branch with the most points, the drake capstone's while
 *   its form is held, or any of the seven for Chromatic Breath - asked where several),
 *   the area (Great Breath's cone or line, asked), and the cone aimed from the user's
 *   token through `pickFacing` with the creatures inside it gathered - with no token on
 *   the viewed board the card keeps its Place area and the creatures targeted;
 *
 * Draconic Leap's space is the step door's (`onUse.step`, picked with every other step
 * before anything is paid, `effects/steps.mjs`).
 */
async function judgeChampionUse({ actor, item, sys, onUse, list, ownToken, rank = 1, grantingTalent = null, answers = null }) {
  const out = { breath: null, facing: null };
  if (!onUse) return out;
  const talentsNow = actor.takenTalents?.() ?? [];
  const aimedRows = () => list.map(t => ({ t, actor: targetActorOf(t), token: tokenOfTarget(t) })).filter(r => r.actor);
  // **04's FONT OF MAGIC** (*spend any amount of Rage. One ally within 30 feet regains that much
  // Mana*; stage 3B): the one ally the aim door already judged, holding Mana with room in it,
  // the amount picked now through the one chooser - every amount the Rage held can pay - and a
  // creature this client does not own needs a GM. A dismissed chooser pays nothing.
  // **THE BUDGET BEFORE ANY CHOOSER** (the 3B review, should-fix 6; the stage 2 review's
  // should-fix 3 on two new doors): a Champion with no Half-Action (Font) or no Full Action
  // (Spellbreak) is refused before picking an amount or a Sustain - asked without spending.
  // And a Breath (D-845): its school, its area, its cone and now Lifebinder's Flame's split
  // are four asks, none of which a Champion with no Half-Action should be put through.
  if (onUse.font || onUse.spellbreak || onUse.bloodlust || onUse.breath) {
    const short = turnBudgetRefusal(actor, sys.action ?? null);
    if (short) {
      ui.notifications?.warn(game.i18n.format(short.reason, short.params ?? {}));
      return null;
    }
  }
  if (onUse.font) {
    const plan = fontOfMagicFor(talentsNow, talentEffect);
    const aimed = aimedRows()[0] ?? null;
    const pool = aimed ? manaPool(aimed.actor.poolSnapshot?.() ?? []) : null;
    if (!plan || !aimed || !pool) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.FontOfMagic.NoMana", { name: item.name, target: aimed?.t?.name ?? aimed?.actor?.name ?? "" }));
      return null;
    }
    if (pool.value >= pool.max) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.FontOfMagic.Full", { name: item.name, target: aimed.t?.name ?? aimed.actor.name }));
      return null;
    }
    const rage = poolNamed(actor.poolSnapshot?.() ?? [], "rage");
    const held = Math.max(0, Math.trunc(Number(rage?.value)) || 0);
    if (!(held > 0)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.FontOfMagic.NoRage", { name: item.name }));
      return null;
    }
    if (gmAbsentForActors([aimed.actor])) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Gift.NoGM"));
      return null;
    }
    const options = Array.from({ length: held }, (_, i) => i + 1).map(n => ({
      key: String(n), name: game.i18n.format("AZEROTH.FontOfMagic.Option", { n }),
      description: game.i18n.format("AZEROTH.FontOfMagic.OptionMana", { n: fontMana({ spent: n, add: plan.add, value: pool.value, max: pool.max }) })
    }));
    const pick = await chooseOption(item, options, null, { prompt: game.i18n.format("AZEROTH.FontOfMagic.Prompt", { name: item.name, target: aimed.t?.name ?? aimed.actor.name }) });
    if (!pick) return null;
    out.font = { recipient: aimed.actor, name: aimed.t?.name ?? aimed.actor.name, spent: Math.trunc(Number(pick.key)) || 0, plan };
  }
  // **04's SPELLBREAK** (*end one Sustained spell that a creature within 30 feet is
  // sustaining*; stage 3B): one creature targeted - never the user, who is not *within 30
  // feet* of itself (MY READING) - within the feet, holding a Sustain; the Sustain picked
  // now through the one chooser where it holds two; a creature this client does not own
  // needs a GM.
  if (onUse.spellbreak) {
    const aimed = aimedRows();
    const feet = Math.max(0, Number(onUse.spellbreak.feet) || 30);
    if (aimed.length !== 1 || aimed[0].actor.uuid === actor.uuid) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.OneTarget", { name: item.name }));
      return null;
    }
    const apart = feetBetweenTokens(ownToken, aimed[0].token);
    if (apart !== null && apart > feet) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.TooFar", { name: item.name, target: aimed[0].t?.name ?? "", feet }));
      return null;
    }
    const held = (aimed[0].actor.getFlag("azeroth-rpg", "sustaining") ?? []).filter(e => e?.cast);
    if (!held.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Spellbreak.NoSustain", { name: item.name, target: aimed[0].t?.name ?? aimed[0].actor.name }));
      return null;
    }
    if (gmAbsentForActors([aimed[0].actor])) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Spellbreak.NoGM"));
      return null;
    }
    let entry = held.length === 1 ? held[0] : null;
    if (!entry) {
      const pick = await chooseOption(item, held.map(e => ({ key: e.cast, name: e.name ?? "", description: "" })), null,
        { prompt: game.i18n.format("AZEROTH.Spellbreak.Prompt", { name: item.name, target: aimed[0].t?.name ?? aimed[0].actor.name }) });
      if (!pick) return null;
      entry = held.find(e => e.cast === pick.key) ?? null;
    }
    if (!entry) return null;
    // Spellthief's ally, picked now with the Sustain (the 3B review, should-fix 5): never
    // after the Full Action is paid. A dismissed chooser makes no Use.
    const { pickSpellthiefAlly } = await import("../effects/chromatic-flights.mjs");
    const thief = await pickSpellthiefAlly(actor);
    if (!thief) return null;
    if (thief.ally && gmAbsentForActors([thief.ally.actor])) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Gift.NoGM"));
      return null;
    }
    out.spellbreak = { target: aimed[0].actor, name: aimed[0].t?.name ?? aimed[0].actor.name, cast: entry.cast, spell: entry.name ?? "", ally: thief.ally };
  }
  // **02's BLOODLUST** (*As a Full Action spend 8 Mana. Up to 6 targets within 30 feet gain
  // an extra Half-Action on their next turn*; the lead, 2026-11-08: *"Fix it now"*): the
  // creatures targeted, judged before anything is paid (`rules/extra-halves.mjs
  // #bloodlustRefusal`) - one to six, each within 30 feet where both stand on the board,
  // each in the shaman's started fight - and a creature this client does not own needs a
  // GM. The Half-Action is laid through Hasten's own write and given at the creature's next
  // turn (`effects/chromatic-flights.mjs#takeHastened`).
  if (onUse.bloodlust) {
    const plan = { feet: Number(onUse.bloodlust.feet) || BLOODLUST.feet, max: Number(onUse.bloodlust.max) || BLOODLUST.max };
    const fight = actor.activeFight?.() ?? null;
    const rows = aimedRows().filter((r, i, all) => all.findIndex(x => x.actor.uuid === r.actor.uuid) === i);
    const refused = bloodlustRefusal({
      targets: rows.map(r => ({
        uuid: r.actor.uuid, name: r.t?.name ?? r.actor.name,
        feet: r.actor.uuid === actor.uuid ? 0 : feetBetweenTokens(ownToken, r.token),
        inFight: Boolean(fight?.getCombatantsByActor?.(r.actor)?.length)
      })),
      inFight: Boolean(fight), max: plan.max, feet: plan.feet
    });
    if (refused) {
      ui.notifications?.warn(game.i18n.format(refused.key, { name: item.name, target: refused.name ?? "", feet: plan.feet, max: plan.max }));
      return null;
    }
    if (gmAbsentForActors(rows.map(r => r.actor))) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
      return null;
    }
    out.bloodlust = { combatId: fight.id, targets: rows.map(r => ({ actor: r.actor, name: r.t?.name ?? r.actor.name })) };
  }
  // **04's HASTEN, WITH BORROWED MOMENT** (*Once per encounter, as a Half-Action ... One ally
  // within 30 feet gains a Half-Action on its next turn*; *Hasten may target you*; stage 3B):
  // one creature targeted, an ally within the feet - the user only with Borrowed Moment -
  // standing in the user's started fight, since *its next turn* is a turn of the fight; a
  // creature this client does not own needs a GM.
  if (onUse.hasten) {
    const plan = hastenFor(talentsNow, talentEffect);
    const aimed = aimedRows();
    const fight = actor.activeFight?.() ?? null;
    if (!plan || aimed.length !== 1) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.OneTarget", { name: item.name }));
      return null;
    }
    const target = aimed[0].actor;
    if (target.uuid === actor.uuid && !plan.self) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Hasten.NotSelf", { name: item.name }));
      return null;
    }
    if (target.uuid !== actor.uuid && !allyOf(actor, target)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.NotFriendly", { name: item.name, target: aimed[0].t?.name ?? target.name }));
      return null;
    }
    const apart = target.uuid === actor.uuid ? 0 : feetBetweenTokens(ownToken, aimed[0].token);
    if (apart !== null && apart > plan.feet) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.TooFar", { name: item.name, target: aimed[0].t?.name ?? "", feet: plan.feet }));
      return null;
    }
    if (!fight || !fight.getCombatantsByActor(target)?.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Hasten.NoFight", { name: item.name, target: aimed[0].t?.name ?? target.name }));
      return null;
    }
    if (gmAbsentForActors([target])) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
      return null;
    }
    out.hasten = { target, name: aimed[0].t?.name ?? target.name, combatId: fight.id };
  }
  // **04's REWIND** (*as a Reaction when an ally within 30 feet takes damage ... It regains
  // half the Health that blow took*; stage 3B): pressed from the offer the blow posted, which
  // carries the Health it took; judged off that offer (`chromatic-flights.mjs#rewindJudgement`)
  // and claimed on it before the budget. A creature this client does not own needs a GM.
  if (onUse.rewind) {
    const aimed = aimedRows();
    const { rewindJudgement } = await import("../effects/chromatic-flights.mjs");
    const judged = rewindJudgement({ holder: actor, messageId: answers?.messageId ?? null, target: aimed[0]?.actor ?? null, targetToken: aimed[0]?.token ?? null, ownToken });
    if (!judged.ok || aimed.length !== 1) {
      ui.notifications?.warn(game.i18n.format(judged.reason ?? "AZEROTH.Rewind.NoOffer", { name: item.name, target: aimed[0]?.t?.name ?? "", feet: judged.row?.feet ?? 30 }));
      return null;
    }
    if (gmAbsentForActors([aimed[0].actor]) || cardPressUnrecordable(judged.message)) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.PressNoGM"));
      return null;
    }
    out.rewind = { target: aimed[0].actor, name: aimed[0].t?.name ?? aimed[0].actor.name, message: judged.message, heal: judged.heal };
  }
  const onBoard = Boolean(ownToken?.document?.parent) && ownToken.document.parent.id === canvas?.scene?.id;
  const within = Math.max(0, Number(onUse.within) || 0);
  if (within > 0) {
    const aimed = list.map(t => ({ t, actor: targetActorOf(t), token: tokenOfTarget(t) })).filter(r => r.actor);
    if (!aimed.length) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Chromatic.NeedsTargets", { name: item.name, feet: within }));
      return null;
    }
    if (aimed.some(r => r.actor.uuid === actor.uuid)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Chromatic.NotSelf", { name: item.name }));
      return null;
    }
    const far = outOfReach(aimed.map(r => ({
      name: r.t?.name ?? r.actor.name, feet: onBoard && r.token ? feetBetweenTokens(ownToken, r.token) : null
    })), within);
    if (far) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Chromatic.OutOfReach", { name: item.name, target: far.name, feet: within }));
      return null;
    }
    if (onUse.push && gmAbsentForActors(aimed.map(r => r.actor))) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Forced.NoGM"));
      return null;
    }
  }
  // **04's COURT GUISE** (*take the guise of one particular humanoid you have studied*;
  // stage 3A): one creature targeted, a humanoid, judged before the use is struck.
  if (onUse.courtGuise) {
    // **NEVER UNDER A SHAPE** (the 3A review, should-fix 5): a shape stands over a guise -
    // a guise taken first lives in the shape's own record of what to go back to - so a
    // guise is refused while one stands, in words, before the use is struck.
    if (actor.shape) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.CourtGuise.InShape", { name: item.name, form: (actor.shape.forms ?? []).map(f => f.name).join(", ") }));
      return null;
    }
    const aimed = list.map(t => ({ t, actor: targetActorOf(t) })).filter(r => r.actor);
    if (aimed.length !== 1 || aimed[0].actor.uuid === actor.uuid) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.OneTarget", { name: item.name }));
      return null;
    }
    const studied = aimed[0].actor;
    const judged = courtGuiseRecord({ name: studied.name, img: studied.img, type: studied.type, creatureType: studied.system?.creatureType ?? null }, { name: actor.name, img: actor.img });
    if (judged.refusal) {
      ui.notifications?.warn(game.i18n.format(judged.refusal, { name: item.name, target: aimed[0].t?.name ?? studied.name }));
      return null;
    }
    out.courtGuise = { studied, token: tokenOfTarget(aimed[0].t)?.document ?? null };
  }
  // **04's LIFEBLOOD** (*when an ally within 30 feet drops below half Health*; stage 3A):
  // the creature the offer named stands below half its Health still, or nothing is paid.
  if (onUse.belowHalf) {
    const offer = answers?.messageId ? (game.messages?.get(answers.messageId) ?? null) : null;
    if (offer?.flags?.["azeroth-rpg"]?.kind === "lifebloodOffer") {
      const { offerStillStands } = await import("../effects/chromatic-flights.mjs");
      if (!offerStillStands(offer.flags["azeroth-rpg"].at ?? null)) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Lifeblood.Stale", { name: item.name }));
        return null;
      }
    }
    const aimed = list.map(t => targetActorOf(t)).filter(Boolean);
    const low = aimed.length === 1 && healthBelow(aimed[0].system?.health ?? null, 0.5);
    if (!low) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Lifeblood.NotBelow", { name: item.name, target: aimed[0]?.name ?? "" }));
      return null;
    }
  }
  if (onUse.breath) {
    // **A SHORT POOL IS REFUSED BEFORE ANY PICK** (the stage 2 review, should-fix 3): a
    // Champion with too little Energy is told so before the cone is aimed, through the
    // payment's own arithmetic; the payment judges it again at its turn.
    const prePool = poolFor(actor, payingPool(sys.cost?.pool ?? null, { inShapeshiftForm: actor.inShapeshiftForm === true }), item.getFlag("azeroth-rpg", "feature")?.classId ?? null);
    const prePay = featurePayment({ cost: sys.cost, pool: prePool, discount: actor.system?.signatureEffects?.empowers?.[item.name]?.cost ?? 0 });
    if (prePay.refusal) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NoPool", {
        name: item.name, pool: game.i18n.localize(AZEROTH.costPoolTypes[sys.cost?.pool] ?? sys.cost?.pool ?? ""), amount: sys.cost?.amount ?? 0
      }));
      return null;
    }
    const talents = actor.takenTalents?.() ?? [];
    // **THE CAPSTONE'S RIDER IS ON 02's BREATH ALONE** (the stage 2 review, must-fix 1): 04
    // puts *your Breath* in the drake form's sentence, so Chromatic Breath (`breath: "any"`)
    // takes neither its school nor its Slowed.
    const drake = onUse.breath === "branch" && actor.shape?.kind === "drake" ? drakeBreathFor(talents, { form: actor.shape.forms?.[0]?.name ?? null }) : null;
    const schools = onUse.breath === "any"
      ? Object.keys(AZEROTH.schools ?? {})
      : breathSchools({ points: branchPointsFor(talents), drakeSchool: drake?.school ?? null });
    let school = schools.length === 1 ? schools[0] : null;
    if (!school) {
      const pick = await chooseOption(item, schools.map(key => ({ key, name: game.i18n.localize(AZEROTH.schools[key] ?? key), description: "" })), null,
        { prompt: game.i18n.format(onUse.breath === "any" ? "AZEROTH.Chromatic.BreathAnyPrompt" : "AZEROTH.Chromatic.BreathTiePrompt", { name: item.name }) });
      if (!pick) return null;
      school = pick.key;
    }
    const areas = onUse.breath === "branch" ? breathAreas(sys.area ?? "") : [String(sys.area ?? "")];
    let area = areas[0];
    if (areas.length > 1) {
      const pick = await chooseOption(item, areas.map(key => ({ key, name: key, description: "" })), null,
        { prompt: game.i18n.format("AZEROTH.Chromatic.BreathAreaPrompt", { name: item.name }) });
      if (!pick) return null;
      area = pick.key;
    }
    out.breath = { school, area, drake: drake?.by ?? null, inflicts: drake?.inflicts ?? [] };
    const shape = areaFor(area);
    // **THE CONE STARTS WHERE A SPELL'S CONE STARTS** (the lead, 2026-11-08: *"Same as spell
    // cones"*): the one origin reading the spell card's Place area takes (`areaOriginFor`).
    const origin = shape && onBoard ? areaOriginFor(shape, ownToken) : null;
    if (shape && onBoard && origin) {
      const rotation = await pickFacing({ origin, area: shape, scene: canvas.scene, label: item.name });
      if (rotation === null) return null;
      const data = regionDataFor({ item, areaText: area, scene: canvas.scene, token: ownToken, origin, rotation, attach: false });
      const region = new CONFIG.Region.documentClass(data, { parent: canvas.scene });
      // Never the breather: not the token pressed, and not a second token of the same
      // actor (the stage 2 review, should-fix 6).
      const inside = (creaturesInArea(actor, { who: sys.who ?? "creature", origin: "self", feet: shape.distanceFt }) ?? [])
        .filter(r => r.token !== ownToken && r.actor?.uuid !== actor.uuid && r.token.document.testInsideRegion(region));
      out.facing = { origin, rotation, area, tokens: inside.map(r => r.token) };
    }
    // **04's LIFEBINDER'S FLAME ON A FIRE BREATH** (D-845), asked once the school is known and
    // the cone aimed - a dismissed ask breathes nothing and costs nothing.
    const split = await breathSplitPick({ actor, item, school, struck: out.facing ? out.facing.tokens.map(t => t.actor).filter(Boolean) : list.map(t => targetActorOf(t)).filter(Boolean) });
    if (split === null) return null;
    out.breathSplit = split.split;
  }
  return out;
}

/**
 * **04's LIFEBINDER'S FLAME ON A FIRE BREATH, CHOSEN BEFORE ANYTHING IS PAID** (*or your
 * Breath or Chromatic Breath deals Fire damage, you may split it ... A Breath splits the damage
 * of every creature it strikes, adds the other halves together, and heals a creature within 30
 * feet*; the lead, 2026-11-09: *"make sure the lifebinder healing talents can trigger off the
 * Breath attack if it's fire damage"* and *"chromatic breath is included if fire damage is
 * picked with those talents"*; D-845). A Breath opens no roll dialog, so the split is the one
 * chooser's, as the Breath's school is: offered where `splitOffered` says so and the Breath
 * strikes somebody; then the creatures it heals, picked as the spell door picks them - the
 * Champion first, every creature within the Flame's feet, as many as Pyre of Renewal divides
 * between - and a creature this client does not own needs a GM, judged here with the rest.
 *
 * @returns {Promise<{split: {plan: object, picks: Array<{uuid: string, name: string}>}|null}|null>}
 *   null where an ask was dismissed; `split: null` where nothing is split
 */
async function breathSplitPick({ actor, item, school, struck = [] }) {
  const talents = actor.takenTalents?.() ?? [];
  const form = actor.shape?.kind === "drake" ? (actor.shape.forms?.[0]?.name ?? null) : null;
  const plan = lifebinderFor(talents, { form }, talentEffect);
  if (!splitOffered(plan, { feature: item.name, school, damages: Boolean(item.system?.damage?.amount) }) || !struck.length) return { split: null };
  const ask = await chooseOption(item, [
    { key: "split", name: game.i18n.format("AZEROTH.Lifebinder.BreathSplit", { talent: plan.by }), description: game.i18n.format("AZEROTH.Lifebinder.BreathSplitText", { feet: plan.breath.feet }) },
    { key: "whole", name: game.i18n.localize("AZEROTH.Lifebinder.BreathWhole"), description: "" }
  ], null, { prompt: game.i18n.format("AZEROTH.Lifebinder.BreathPrompt", { name: item.name, talent: plan.by }) });
  if (!ask) return null;
  if (ask.key !== "split") return { split: null };
  const near = creaturesWithin(actor, plan.breath.feet, { who: "creature" });
  const options = [{ key: actor.uuid, name: actor.name, description: "", actor }];
  for (const r of near) if (r.actor && r.actor.uuid !== actor.uuid && !options.some(o => o.key === r.actor.uuid)) options.push({ key: r.actor.uuid, name: r.token?.name ?? r.actor.name, description: "", actor: r.actor });
  const picks = options.length === 1 ? [options[0]] : await (async () => {
    const max = Math.max(1, plan.divide ?? 1);
    const answer = await chooseOption(item, options.map(({ actor: _a, ...o }) => o), null, { max, prompt: game.i18n.format("AZEROTH.Lifebinder.Prompt", { name: item.name, talent: plan.by, count: max }) });
    const keys = (Array.isArray(answer) ? answer : (answer ? [answer] : [])).map(o => o.key);
    return options.filter(o => keys.includes(o.key));
  })();
  if (!picks.length) return null;
  const { lifebinderNeedsGM } = await import("../effects/chromatic-talents.mjs");
  if (lifebinderNeedsGM(picks.map(p => p.actor))) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Lifebinder.NoGMBefore"));
    return null;
  }
  return { split: { plan, picks: picks.map(p => ({ uuid: p.actor.uuid, name: p.name })) } };
}

/**
 * **WHAT THE CHAMPION'S USES DO ONCE PAID FOR** (02 §7; stage 2B), as card lines:
 *
 * - Hardened Scales: a laid `final` add of 1 on each of Fire, Frost and Nature's Ward,
 *   spanned by ten minutes - a fight's hundred rounds or the world's ten minutes
 *   (`effects/durations.mjs#minuteSpan`) - a second use replacing the first;
 * - Draconic Leap: Entangled ended on the user (the condition's own effect deleted, as
 *   a passed escape deletes it) BEFORE the leap, which the step door makes further on -
 *   a displacement, so no Move is spent, no Difficult ground costs and no Opportunity
 *   Attack is offered - and the Boon on the next attack before the end of the user's
 *   next turn (`rules/next-attack.mjs`'s `nextTurn`);
 * - Scales of the Flight: the school the tie leaves open, named on the actor until the
 *   next Long Rest.
 */
async function landChampionUse({ actor, item, sys, onUse, chosen }) {
  const lines = [];
  if (onUse?.hardenScales) {
    const laid = await layState(actor, {
      flag: HARDENED_SCALES_FLAG, data: { source: item.name }, img: item.img, name: item.name,
      span: minuteSpan(actor, HARDENED_SCALES.minutes), changes: hardenedScalesChanges(), sameAs: raw => raw?.source === item.name,
      description: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Chromatic.HardenedScalesText", { n: HARDENED_SCALES.ward, minutes: HARDENED_SCALES.minutes }))}</p>`
    });
    lines.push(game.i18n.format(laid ? "AZEROTH.Chromatic.HardenedScalesLine" : "AZEROTH.Chromatic.HardenedScalesNotLaid",
      { name: actor.name, n: HARDENED_SCALES.ward, minutes: HARDENED_SCALES.minutes }));
  }
  const frees = Array.isArray(onUse?.frees) ? onUse.frees : [];
  if (frees.length) {
    const held = actor.effects.filter(e => e.active !== false && frees.some(id => e.statuses?.has?.(id))).map(e => e.id);
    if (held.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", held);
      lines.push(game.i18n.format("AZEROTH.Chromatic.Freed", { name: actor.name, conditions: frees.map(id => game.i18n.localize(AZEROTH.conditions[id] ?? id)).join(", ") }));
    }
  }
  if (onUse?.nextAttack) {
    const grant = { source: item.system?.identifier || item.name, name: item.name, boons: Math.max(0, Math.trunc(Number(onUse.nextAttack.boons)) || 0), lasts: onUse.nextAttack.lasts };
    const laid = grant.boons > 0 ? await layNextAttack(actor, [grant], { quiet: true }) : [];
    lines.push(laid.length
      ? game.i18n.format(`AZEROTH.NextAttack.Laid.${grant.lasts}`, { name: actor.name, talent: item.name })
      : game.i18n.format("AZEROTH.NextAttack.NoFight", { name: actor.name, talent: item.name }));
  }
  if (sys.choice === "flightSchools" && chosen?.key && AZEROTH.schools?.[chosen.key]) {
    await actor.setFlag("azeroth-rpg", FLIGHT_SCHOOL_FLAG, chosen.key);
    lines.push(game.i18n.format("AZEROTH.Chromatic.FlightNamed", { name: actor.name, school: game.i18n.localize(AZEROTH.schools[chosen.key]) }));
  }
  return lines;
}

/**
 * **WHAT THE SPELL-WEAVER'S AND THE TIMEWALKER'S USES DO ONCE PAID FOR** (04; stage 3B), as
 * card lines, each judged in `judgeChampionUse` before anything was paid:
 *
 * - Font of Magic: the Rage chosen, off the pool as it stands now, then the Mana through the
 *   one gift's Rage branch (`effects/gifts.mjs#giveMana`);
 * - Spellbreak: the Sustain ended through the Stop's own door, then its Rage and Spellthief;
 * - Hasten: the Half-Action laid for the creature's next turn, and Borrowed Moment's Speed;
 * - Rewind: the heal, off the offer's own record.
 */
async function landChampionTalent({ actor, item, champ, rank = 1 }) {
  const lines = [];
  if (!champ) return lines;
  if (champ.font) {
    const rage = poolNamed(actor.poolSnapshot?.() ?? [], "rage");
    const spent = Math.min(champ.font.spent, Math.max(0, Math.trunc(Number(rage?.value)) || 0));
    if (rage && spent > 0) await actor.updatePool({ itemId: rage.itemId, kind: rage.kind, value: rage.value - spent });
    const landed = spent > 0 ? await giveMana({ giver: actor, recipient: champ.font.recipient, amount: spent, pool: "rage" }) : 0;
    lines.push(game.i18n.format("AZEROTH.FontOfMagic.Line", { name: champ.font.name, n: landed, rage: spent, talent: champ.font.plan.names.join(", ") }));
  }
  if (champ.spellbreak) {
    const { breakSustain, spellbreakRage, stealAfterEnding } = await import("../effects/chromatic-flights.mjs");
    const ended = await breakSustain({ breaker: actor, target: champ.spellbreak.target, cast: champ.spellbreak.cast });
    lines.push(game.i18n.format(ended.ended ? "AZEROTH.Spellbreak.Line" : "AZEROTH.Spellbreak.NotEnded", { name: champ.spellbreak.name, spell: ended.name || champ.spellbreak.spell, talent: item.name }));
    if (ended.ended) {
      lines.push(...(await spellbreakRage({ actor, rank, name: item.name })));
      lines.push(...(await stealAfterEnding({ actor, ally: champ.spellbreak.ally ?? null })));
    }
  }
  if (champ.bloodlust) {
    const { layBloodlust } = await import("../effects/chromatic-flights.mjs");
    for (const t of champ.bloodlust.targets) {
      const laid = await layBloodlust({ shaman: actor, target: t.actor, source: item.name, combatId: champ.bloodlust.combatId });
      lines.push(game.i18n.format(laid ? "AZEROTH.Bloodlust.Line" : "AZEROTH.Bloodlust.NotLaid", { name: t.name, talent: item.name }));
    }
  }
  if (champ.hasten) {
    const { layHasten } = await import("../effects/chromatic-flights.mjs");
    const laid = await layHasten({ holder: actor, target: champ.hasten.target, combatId: champ.hasten.combatId });
    lines.push(game.i18n.format(laid.laid ? "AZEROTH.Hasten.Line" : "AZEROTH.Hasten.NotLaid", { name: champ.hasten.name, talent: item.name }));
    if (laid.laid && laid.speed > 0) lines.push(game.i18n.format("AZEROTH.Hasten.SpeedLine", { name: champ.hasten.name, n: laid.speed }));
  }
  if (champ.rewind) {
    const { landRewind } = await import("../effects/chromatic-flights.mjs");
    const healed = await landRewind({ holder: actor, target: champ.rewind.target, messageId: champ.rewind.message.id });
    lines.push(game.i18n.format("AZEROTH.Rewind.Line", { name: champ.rewind.name, n: healed, talent: item.name }));
  }
  return lines;
}

/**
 * Mark a free cast spent on its talent item (the Chromatic Champion plan;
 * `rules/free-casts.mjs`). Answers whether the mark was written.
 */
async function markFreeCast(actor, line) {
  const talent = line?.talentId ? actor.items.get(line.talentId) : null;
  if (!talent) return false;
  const spent = spentAfter(talent.getFlag("azeroth-rpg", FREE_CAST_FLAG) ?? [], line.spell);
  await talent.setFlag("azeroth-rpg", FREE_CAST_FLAG, spent);
  return true;
}

async function accrueCastingCorruption(actor, spell) {
  if (!actor || actor.type !== "character") return null;
  const owed = castingCorruption(spell?.system ?? {});
  if (!owed) return null;
  return accrueCorruption(actor, { ...owed, occasion: game.i18n.format("AZEROTH.Occasion.CastTierFive", { name: spell.name }) });
}

/**
 * **CORRUPTION AGREED TO, UNRESISTED** (10 §3): a point on a track with no
 * Test, and the card that says so. A tier 5 Fel or Shadow cast (07 §8) and
 * Metamorphosis's *Gain 1 Fel Corruption* (02 §7, D-769) both come through
 * here, so the clamp, the Signature's reduction and the card are one.
 *
 * @param {Actor} actor
 * @param {{track: string, points: number, occasion: string}} o
 * @returns {Promise<ChatMessage|null>}
 */
export async function accrueCorruption(actor, { track, points = 1, occasion = "" } = {}) {
  if (!actor || actor.type !== "character" || !AZEROTH.corruptionTracks[track]) return null;
  const from = actor.system.corruption?.[track] ?? 0;
  // `applyExposure` with `failed: true` is the unresisted case: the point
  // lands, and the clamp at the top of the track is the same one. A
  // Signature's reduction reaches this door too - 08 §20 says *each time they
  // would take any*, and an unresisted point is a point taken (D-692).
  const to = applyExposure(from, {
    failed: true,
    points,
    reduction: actor.system?.signatureEffects?.corruptionReduction?.[track] ?? 0
  });
  if (to === from) return null;
  await actor.update({ [`system.corruption.${track}`]: to });

  const crossed = thresholdsCrossed(to) > thresholdsCrossed(from)
    ? AZEROTH.CORRUPTION_THRESHOLDS.filter(t => to >= t).at(-1)
    : null;
  const content = await renderTemplate(TEMPLATE.corruption, {
    config: AZEROTH,
    title: game.i18n.localize("AZEROTH.Card.Exposure"),
    subtitle: game.i18n.localize(AZEROTH.corruptionTracks[track]),
    occasion,
    unresisted: true,
    track,
    from,
    to,
    crossed,
    provenance: []
  });
  return ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }) });
}

/**
 * A Boss shrugging off one of its first two Critical Injuries (14 §1).
 *
 * Returns the card where it did, and null where the injury lands — so the
 * caller reads it as "handled" without knowing the rule.
 *
 * **The count is the COMBATANT's.** A Combatant is made per fight, so a flag
 * on it is encounter-scoped for free and needs no cleanup at the end; an
 * actor flag would have to be cleared by `_leaveFight` and would leak across
 * two fights on the same night if it were ever missed.
 */
async function bossShrugsOff(actor) {
  if (!actor || actor.type !== "npc") return null;
  const combat = actor.activeFight?.() ?? null;
  const combatant = combat ? combat.getCombatantsByActor(actor)?.[0] ?? null : null;
  if (!combatant) return null;

  const taken = combatant.getFlag("azeroth-rpg", "criticalsIgnored") ?? 0;
  if (!ignoresCritical(actor.system?.weightClass, taken)) return null;
  await combatant.setFlag("azeroth-rpg", "criticalsIgnored", taken + 1);

  const left = BOSS.criticalsIgnored - (taken + 1);
  const content = await renderTemplate(TEMPLATE.critical, {
    config: AZEROTH,
    title: game.i18n.localize("AZEROTH.Card.CriticalInjury"),
    subtitle: game.i18n.localize("AZEROTH.Card.BossShrugsOff"),
    location: null,
    roll: null,
    shrugged: true,
    shruggedLeft: left,
    permanent: false,
    dying: false,
    result: null,
    canSuffer: false
  });
  return ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }) });
}

/**
 * Roll a Critical Injury on the table for the location struck (06 §8).
 * Triggered on a natural 20 and on reaching 0 Health. **No Critical Injury
 * kills outright** (D-082) — the worst result starts the dying track.
 *
 * The d20 is rolled here and handed to the table, so the card's number and
 * the table's row are one roll.
 */
export async function rollCriticalInjury({ actor, location = "body", higher = null } = {}) {
  const injuryFight = injuryFightOf(actor);
  // **07's AEGIS OF THE LIGHT** (*A creature held at 1 Health this way does not
  // begin dying, and every Critical Injury it would have taken it does not take*;
  // D-777): a creature its floor has held takes none while it stands, said on a
  // card of its own so the caller reads it as handled.
  if (floorRefusesCritical((actor?.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"] ?? {}))) {
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.AegisLight.NoCritical", { name: actor.name })}</p>`,
      flags: { "azeroth-rpg": { kind: "criticalRefused" } }
    });
  }
  // 14 §1: a Boss ignores the first two Critical Injuries it takes in an
  // ENCOUNTER, and no block repeats it. The count lives on the combatant,
  // which is created per fight and so is encounter-scoped with no cleanup;
  // a Boss struck outside a fight has no encounter and takes the injury.
  const shrugged = await bossShrugsOff(actor);
  if (shrugged) return shrugged;

  // **UNBREAKABLE** (04: *While you carry a shield, roll any Critical Injury
  // against you twice and take the lower result*; D-772): a shield held counts
  // as carried (MY READING, for the lead: a shield in a pack is not carried in
  // the sense a shield protects), and the card says both dice.
  // **AND RUIN** (04: *When one of your spells inflicts a Critical Injury, roll
  // twice on the table and take the higher result*; D-775): `higher` names the
  // caster's talent. Both at once cancel to one die (MY READING, for the lead, as
  // a Boon and a Bane do).
  const lower = criticalRollCount({ unbreakable: (actor?.talentRanks?.("Unbreakable") ?? 0) > 0, shield: actor?.shieldInHand === true }) > 1;
  const raise = typeof higher === "string" && higher.length > 0;
  const count = lower !== raise ? 2 : 1;
  const dice = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Roll("1d20");
    await d.evaluate();
    dice.push(d);
  }
  const kept = raise && !lower ? higherRoll(dice.map(d => d.total)) : lowerRoll(dice.map(d => d.total));
  const roll = dice.find(d => d.total === kept) ?? dice[0];
  const twice = dice.length > 1
    ? { talent: raise && !lower ? higher : "Unbreakable", totals: dice.map(d => d.total).join(", "), key: raise && !lower ? "AZEROTH.Card.CriticalTwiceHigher" : "AZEROTH.Card.CriticalTwice" }
    : null;
  const band = CRITICAL_BANDS.find(b => roll.total >= b.min && roll.total <= b.max);

  let result = null;
  const table = await criticalTable(location);
  if (table) {
    const draw = await table.draw({ roll, displayChat: false, recursive: false });
    const row = draw.results?.[0] ?? null;
    if (row) {
      const description = row.description ?? "";
      result = {
        name: row.name,
        description,
        html: await enrich(description)
      };
    }
  }

  const content = await renderTemplate(TEMPLATE.critical, {
    config: AZEROTH,
    title: game.i18n.localize("AZEROTH.Card.CriticalInjury"),
    subtitle: game.i18n.localize(AZEROTH.locations[location] ?? ""),
    location,
    roll: roll.total,
    twice,
    permanent: band?.permanent === true,
    dying: band?.dying === true,
    result,
    canSuffer: true
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: dice,
    flags: {
      "azeroth-rpg": {
        kind: "critical",
        injuryFight,
        location,
        band,
        result: result ? { name: result.name, description: result.description } : null
      }
    }
  });
}

/**
 * **RUIN'S MANA** (04: *At rank 2 you also gain 2 Mana*; D-775): into the caster's
 * Mana pool, never past its maximum, where this client may write the caster -
 * Killing Blow's rule at the damage door.
 *
 * @param {Actor} caster
 * @param {{name: string, mana: number}} ruin  `rules/class-talents.mjs#ruinFor`'s
 * @returns {Promise<number>}  the Mana that landed
 */
export async function ruinMana(caster, ruin) {
  if (!caster?.isOwner || !(ruin?.mana > 0)) return 0;
  const pool = manaPool(caster.poolSnapshot?.() ?? []);
  if (!pool) return 0;
  const value = Math.min(pool.max, pool.value + ruin.mana);
  if (value <= pool.value) return 0;
  await caster.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  ui.notifications?.info(game.i18n.format("AZEROTH.Ruin.Mana", { name: caster.name, n: value - pool.value, talent: ruin.name }));
  return value - pool.value;
}

/**
 * Suffer a Critical Injury: a real ActiveEffect carrying the result, the
 * conditions the result names (Bleeding N, Slowed, Silenced, Numbed), the
 * Fatigue it counts, and on the 20 band Health 0 - which begins dying and
 * does no more than that (D-082). Permanent on the 18-19 band.
 */
export async function sufferInjury({ actor, location = "body", band = null, result = null, messageId = null, coordinated = false } = {}) {
  if (!actor) return null;
  if (!coordinated) return applyInjuryOnce({ actor, location, band, result, messageId });
  if (!game.user.isGM) throw new Error(game.i18n.localize("AZEROTH.Sacrifice.NeedGM"));
  if (iceBlockFor(actor)) return null;
  const name = result?.name ?? game.i18n.localize("AZEROTH.Card.CriticalInjury");
  const permanent = band?.permanent === true;
  const dying = band?.dying === true;

  // 05 SS11: a Critical Injury costs all Momentum; 05 SS12: it ends what is
  // Sustained (D-627) - through the ONE writer, which lifts what the Sustain
  // held as well (this unset the flag and left its laid effects standing).
  // At 0 Health the Sustain has already ended and this finds nothing (M1).
  const drained = (actor.poolSnapshot?.() ?? []).filter(p => p.kind === "momentum" && (p.value ?? 0) > 0);
  if (drained.length) await actor.updatePool(drained.map(p => ({ itemId: p.itemId, kind: "momentum", value: momentumAfter(p.value, { criticalInjury: true }) })));
  if (iceBlockFor(actor)) return null;
  await endAllSustains({ actor });
  if (iceBlockFor(actor)) return null;
  const { conditions, fatigue, speed, nextTurn } = injuryConditions(`${result?.name ?? ""} ${result?.description ?? ""}`);
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: game.i18n.format("AZEROTH.Card.InjuryEffect", { name }),
    img: "icons/svg/blood.svg",
    description: result?.description ?? "",
    origin: actor.uuid,
    // "Speed reduced by 10 feet" is a change the effect carries (D-621), in
    // the final phase after the derived Speed exists; removing the effect
    // gives the feet back. The `final` phase lands after `speedFrom`'s floor,
    // so the drop is floored at 0 by an `upgrade`, whose priority runs after
    // every `add` (the aura door's rule; the final review of D-757).
    system: { changes: speed ? [
      { key: "system.speed", type: "add", value: speed, phase: "final" },
      ...(Number(speed) < 0 ? [{ key: "system.speed", type: "upgrade", value: "0", phase: "final" }] : [])
    ] : [] },
    flags: { "azeroth-rpg": { injury: true, location, permanent,
      injuryFight: injuryProvenance({messageId,message:messageId?game.messages.get(messageId):null,actor}) } }
  }]);

  for (const c of conditions) {
    if (iceBlockFor(actor)) return null;
    // A result that runs "until the end of your next turn" expires on its own (D-628).
    await applyCondition(actor, c.id, { value: c.value ?? null, until: nextTurn ? "endOfNextTurn" : null });
  }

  const update = {};
  if (iceBlockFor(actor)) return null;
  if (fatigue) update["system.fatigue"] = Math.min(AZEROTH.FATIGUE_MAX, (actor.system.fatigue ?? 0) + fatigue);
  if (dying) update["system.health.value"] = 0;
  if (Object.keys(update).length) await actor.update(update);
  return actor;
}

/* -------------------------------------------- */

/**
 * Use a Momentum maneuver (05 SS11, 06 SS7; D-626), the feature's shape:
 * refuse, pay from the primary Momentum pool (or strike Charge's use and
 * take its Rage), then a card carrying the book's sentence and what comes
 * next - Press's +1 to apply, Sunder's Sundered to put on the target,
 * Overbear's Body Resilience Test at the Standard DC and its Prone, Disarm's
 * Opposed Attack Test, Riposte's attack. Called Shot is not a Use: it is
 * the attack dialog's checkbox.
 *
 * @param {object} o
 * @param {Actor} o.actor
 * @param {string} o.key        A key of AZEROTH.maneuvers.
 * @param {object[]} [o.targets]  Target snapshots (roll-dialog.mjs#targetSnapshots), with `size`.
 * @returns {Promise<ChatMessage|null>}
 */
export async function useManeuver({ actor, key, targets = null } = {}) {
  const entry = AZEROTH.maneuvers.find(m => m.key === key);
  if (!actor || !entry) return null;
  if (key === "disarm" && (targets ?? []).some(target => stonemaulGrip(targetActorOf(target)?.takenTalents?.() ?? []))) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.StonemaulGrip.Immune"));
    return null;
  }
  // 06 §10 (door 10): a spirit makes no maneuver in the living world.
  const spiritManeuver = realmRefusalFor(actor, "maneuver");
  if (spiritManeuver) {
    ui.notifications?.warn(spiritManeuver);
    return null;
  }
  if (key === "calledShot") {
    ui.notifications?.info(game.i18n.localize("AZEROTH.Maneuver.NotAUse"));
    return null;
  }
  const name = game.i18n.localize(entry.label);
  // **A COMPANION'S MANEUVER, PAID FROM ITS RANGER'S QUARRY** (04's Shared Quarry at
  // rank 1; the lead, 2026-10-03, on O-177: *"Maneuvers or other quarry costing
  // features"*; D-779): the creature's own Momentum pool, else its owner's Quarry
  // where the owner's talent lets it (`AzerothActor#momentumPayer`), priced first
  // because the payer is the pool that holds the price.
  const ctx = actor.maneuverContext?.() ?? {};
  const priced = maneuverCost(key, ctx);
  const payer = actor.momentumPayer?.({ amount: priced.cost }) ?? null;
  const pool = payer?.pool ?? (actor.poolSnapshot?.() ?? []).find(p => p.kind === "momentum") ?? null;
  const payingActor = payer?.actor ?? actor;
  if (!pool) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Maneuver.NoPool", { name }));
    return null;
  }
  if (pool.value < priced.cost) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Dialog.NoMomentum"));
    return null;
  }

  // Pay, or strike Charge and take its Rage.
  let value = pool.value;
  if (priced.cost > 0) {
    value -= priced.cost;
    value = refundOnSpend({ ...pool, value }, priced.cost, payingActor.talentRanks?.("Hammer of Justice") ?? 0);
    // The pool's own kind: Draconic Discipline pays in Energy (the Chromatic Champion plan).
    await payingActor.updatePool({ itemId: pool.itemId, kind: pool.kind ?? "momentum", value });
  }
  let charged = false;
  if (priced.gain > 0) {
    const charge = actor.items.find(i => i.type === "feature" && i.name === "Charge");
    if (charge) {
      await charge.update({ "system.uses.value": Math.max(0, (charge.system.uses?.value ?? 1) - 1) });
      value = Math.min(pool.max, value + priced.gain);
      await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value });
      charged = true;
    }
  }

  const list = targets ?? [];
  const userSize = actor.system?.size ?? "medium";
  const dc = standardDC(actor.system?.tier ?? 1);
  const sunder = key === "sunder" ? sunderAmount(ctx.talents ?? []) : 0;
  const poolLabel = game.i18n.localize(AZEROTH.poolTypes[pool.name] ?? pool.name);
  const content = await renderTemplate(TEMPLATE.maneuver, {
    config: AZEROTH,
    title: name,
    subtitle: charged ? game.i18n.localize("AZEROTH.Maneuver.ChargeFree")
      : (payer?.shared ? game.i18n.format("AZEROTH.SharedQuarry.Paid", { n: priced.cost, owner: payingActor.name }) : `${priced.cost} ${poolLabel}`),
    key,
    text: game.i18n.localize(entry.text),
    isPress: key === "press",
    isSunder: key === "sunder",
    isOverbear: key === "overbear",
    isDisarm: key === "disarm",
    isRiposte: key === "riposte",
    dc,
    resistLabel: game.i18n.localize(AZEROTH.resiliences.body),
    opposedDC: AZEROTH.OPPOSED_DC,
    sunder,
    targets: list.map((t, index) => ({ ...t, index, size: sizeNote(userSize, t.size ?? "medium") })),
    speakerName: actor.name
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { "azeroth-rpg": { kind: "maneuver", key, targets: list, cost: priced.cost, sunder, dc } }
  });
}
