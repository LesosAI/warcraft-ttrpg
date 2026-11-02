/**
 * The system's user queries (D-643): a write a player needs the GM's client
 * to make goes through v14's `User#query`, registered on `CONFIG.queries`
 * under the system's prefix. Nothing here uses `game.socket` directly.
 */

import { ADOPT_QUERY, BIND_QUERY, UNBIND_QUERY, RELEASE_COMMAND_QUERY, adoptQueryHandler, bindQueryHandler, unbindQueryHandler, releaseCommandQueryHandler } from "./documents/bound.mjs";
import { SUMMON_QUERY, summonQueryHandler } from "./documents/summon.mjs";
import { ROCKET_JUMP_QUERY, rocketJumpHandler } from "./effects/rocket-jump-use.mjs";
import { SEARING_USE_QUERY, searingUseHandler } from "./effects/searing-totem-use.mjs";
import { SECOND_STRIKE_QUERY, secondStrikeQueryHandler } from "./effects/second-strike.mjs";
import { COMMAND_DEMON_SIGHT_QUERY, commandDemonSightHandler } from "./effects/command-demon-sight-query.mjs";
import { ICE_BLOCK_END_QUERY, endIceBlock } from "./effects/ice-block-ending.mjs";
import { DISPERSION_END_QUERY, endDispersion } from "./effects/dispersion-end-request.mjs";
import { DISPERSION_REACTION_QUERY, dispersionReactionHandler } from "./effects/dispersion-reaction-request.mjs";
import { DISPERSION_PREPARE, DISPERSION_RESOLVE, DISPERSION_REVIEW_QUERY, prepareDispersionCast, resolveDispersionCast, reviewDispersionCreation } from "./effects/dispersion-casting.mjs";
import { ICE_BLOCK_PREPARE, ICE_BLOCK_RESOLVE, ICE_BLOCK_REVIEW_QUERY, prepareIceBlockCast, resolveIceBlockCast, reviewIceBlockCreation } from "./effects/ice-block-casting.mjs";
import { STONE_GUARDIAN_QUERY, stoneGuardianQueryHandler } from "./documents/stone-guardian.mjs";
import { FIRE_GUARDIAN_QUERY, fireGuardianQueryHandler } from "./documents/fire-guardian.mjs";
import { DEMON_GUARDIAN_QUERY, demonGuardianQueryHandler } from "./documents/demon-guardian.mjs";
import { MOBILE_ALERT_QUERY, mobileAlertQueryHandler } from "./effects/mobile-alert-use.mjs";
import { NPC_SEARING_QUERY, npcSearingTotemQueryHandler } from "./documents/npc-searing-totem.mjs";
import { CARRION_SCARAB_QUERY, carrionScarabQueryHandler } from "./documents/carrion-scarab-use.mjs";
import { IMAGE_PROJECTION_QUERY, imageProjectionQueryHandler } from "./documents/image-projection-use.mjs";
import { TUTOR_SILENCE_QUERY, tutorSilenceQueryHandler } from "./effects/tutor-silence-use.mjs";
import { BANSHEE_CURSE_QUERY, bansheeCurseQueryHandler } from "./effects/banshee-curse-use.mjs";
import { VILEBRANCH_SHRINK_QUERY, vilebranchShrinkQueryHandler } from "./effects/vilebranch-shrink-use.mjs";
import { TETANUS_QUERY, tetanusQueryHandler } from "./effects/tetanus-use.mjs";
import { INNER_FIRE_HIT_QUERY, innerFireHitQueryHandler } from "./effects/inner-fire-hit-query.mjs";
import { INNER_FIRE_QUERY, innerFireQueryHandler } from "./effects/inner-fire-use.mjs";
import { NPC_SNEAK_QUERY, npcSneakQueryHandler } from "./effects/npc-sneak-use.mjs";
import { NPC_DISARM_QUERY, npcDisarmQueryHandler } from "./effects/npc-disarm-use.mjs";
import { NPC_SHIELD_SLAM_QUERY, npcShieldSlamQueryHandler } from "./effects/npc-shield-slam-use.mjs";
import { WHIRLWIND_QUERY, whirlwindQueryHandler } from "./effects/syndicate-whirlwind-use.mjs";
import { CRUSHRIDGE_ATTACK_QUERY, crushridgeExtraAttackQueryHandler } from "./effects/crushridge-extra-attack-use.mjs";
import { DEATH_SINGER_SCREECH_QUERY, deathSingerScreechQueryHandler } from "./effects/death-singer-screech-use.mjs";
import { ANTI_MAGIC_SHIELD_QUERY, antiMagicShieldQueryHandler } from "./effects/anti-magic-shield-use.mjs";
import { PLANT_TOTEM_QUERY, plantTotemQueryHandler } from "./documents/totems.mjs";
import { LAY_BANE_QUERY, LAY_BOON_QUERY, layBaneQueryHandler, layBoonQueryHandler } from "./effects/banes.mjs";
import { NO_HEALING_QUERY, noHealingQueryHandler } from "./effects/no-healing.mjs";
import { BEACON_HEAL_QUERY, beaconHealQueryHandler } from "./effects/beacon.mjs";
import { VENGEANCE_QUERY, vengeanceQueryHandler } from "./effects/after-blow.mjs";
import { INFLICT_QUERY, inflictQueryHandler } from "./effects/inflict.mjs";
import { ANNOTATE_QUERY, annotateQueryHandler } from "./dice/annotate.mjs";
import { CLAIM_LOOT_QUERY, claimLootQueryHandler } from "./documents/loot-offer.mjs";
import { END_TICK_QUERY, LAY_POISON_QUERY, endTickQueryHandler, layPoisonQueryHandler } from "./effects/ticks.mjs";
import { LOSE_REACTION_QUERY, loseReactionQueryHandler } from "./effects/reaction-loss.mjs";
import { SPEED_DROP_QUERY, speedDropQueryHandler } from "./effects/speed-drop.mjs";
import { SHARE_HEAL_QUERY, shareHealQueryHandler } from "./effects/symbiosis.mjs";
import { WARD_QUERY, wardQueryHandler } from "./effects/wards.mjs";
import { GIFT_QUERY, giftQueryHandler } from "./effects/gifts.mjs";
import { CARD_PRESS_QUERY, cardPressQueryHandler } from "./effects/card-presses.mjs";
import { SIGNATURE_RETALIATION_QUERY, signatureRetaliationHandler } from './effects/signature-retaliation.mjs';
import {EVERBURN_DISMISS_QUERY,dismissEverburn} from './effects/everburn-dismiss.mjs';
import {SPELL_CROSSING_QUERY,deliverSpellCrossing} from './effects/spell-crossing-delivery.mjs';
import {SEALING_FLAME_CAST_QUERY,sealingFlameCast,SEALING_FLAME_HOLD_QUERY,sealingFlameHoldQuery,SEALING_FLAME_FINISH_QUERY,sealingFlameFinishQuery} from './effects/sealing-flame-reaction.mjs';
import { STEAL_SUSTAIN_QUERY, stealSustainQueryHandler } from "./effects/sustain-steal.mjs";
import { SPELLSTEAL_USE_QUERY, spellstealUseHandler } from "./effects/spellsteal-use.mjs";
import { SNAKE_TRAP_DOSE_QUERY, snakeTrapDoseHandler } from "./effects/snake-trap-dose.mjs";
import { SNAKE_TRAP_CATCH_QUERY, snakeTrapCatchHandler } from "./effects/snake-trap-catches.mjs";
import { EXPLOSIVE_TRAP_QUERY, explosiveTrapHandler } from "./effects/explosive-trap.mjs";
import { SNARE_PLACEMENT_QUERY, SNARE_PLACEMENT_REVIEW_QUERY, snarePlacementHandler, snarePlacementReviewHandler } from "./effects/snare-placement.mjs";
import { SOUL_SWAP_QUERY, soulSwapQueryHandler } from "./effects/soul-swap.mjs";
import { HAUNT_QUERY, hauntQueryHandler } from "./effects/haunt.mjs";
import { TEMP_HEALTH_QUERY, temporaryHealthQueryHandler } from "./effects/temporary-health.mjs";
import { BLOW_ASK_QUERY, BLOW_SHARE_QUERY, blowAskHandler, blowShareQueryHandler } from "./effects/blow-doors.mjs";
import { DISPEL_QUERY, dispelQueryHandler } from "./effects/dispel.mjs";
import { NULLIFY_QUERY, massNullifyQueryHandler } from "./effects/nullifier-use.mjs";
import { CURE_QUERY, curePoisonQueryHandler } from "./effects/cure-poison-use.mjs";
import { ANTIVENOM_QUERY, antivenomQueryHandler } from "./effects/antivenom-use.mjs";
import { CONSUMABLE_RECEIPT_QUERY, consumableReceiptHandler } from "./effects/consumable-receipt.mjs";
import { MANA_BURN_QUERY, manaBurnQueryHandler } from "./effects/mana-burn.mjs";
import { APPROVED_SIGNATURE_USE_QUERY, approvedSignatureUseQueryHandler } from "./effects/approved-signature-use.mjs";
import {CANNONBALL_RESOLVE_QUERY,CANNONBALL_SAVE_QUERY,resolveCannonball,performCannonballSave} from './effects/cannonball-resolution.mjs';
import {PICCOLO_RESOLVE_QUERY,PICCOLO_SAVE_QUERY,resolvePiccolo,performPiccoloSave} from './effects/piccolo-resolution.mjs';
import {HELMET_RESOLVE_QUERY,HELMET_SAVE_QUERY,resolveHelmetStrike,performHelmetSave} from './effects/helmet-resolution.mjs';
import { SIGNATURE_HEALING_QUERY, signatureHealingQueryHandler } from "./effects/signature-healing-apply.mjs";
import {STANDALONE_PARRY_QUERY,standaloneParryQueryHandler} from './effects/attack-parry.mjs';
import { NULLIFY_MANA_QUERY, nullifyManaQueryHandler } from "./effects/nullify-mana.mjs";
import { DIRE_GROWL_QUERY, direGrowlQueryHandler } from "./effects/dire-growl.mjs";
import { ELDER_QUERY, elderQueryHandler } from "./effects/elder-diemetradon.mjs";
import { SONIC_BURST_QUERY, sonicBurstQueryHandler } from "./effects/sonic-burst.mjs";
import { MOLTEN_SMASH_QUERY, moltenSmashQueryHandler } from "./effects/molten-smash.mjs";
import { KNOCK_AWAY_QUERY, knockAwayQueryHandler } from "./effects/knock-away.mjs";
import { PLAGUE_CLOUD_QUERY, plagueCloudQueryHandler } from "./effects/plague-cloud-use.mjs";
import { LIGHTNING_CLOUD_QUERY, lightningCloudQueryHandler } from "./effects/lightning-cloud-use.mjs";
import { CAUTERIZING_FLAMES_QUERY, cauterizingFlamesQueryHandler } from "./effects/cauterizing-flames-use.mjs";
import { GROUND_STOMP_QUERY, groundStompQueryHandler } from "./effects/ground-stomp-use.mjs";
import { ANCIENT_HYSTERIA_QUERY, ancientHysteriaQueryHandler } from "./effects/ancient-hysteria-use.mjs";
import { ANCIENT_DREAD_QUERY, ancientDreadQueryHandler } from "./effects/ancient-dread-use.mjs";
import { ANCIENT_DESPAIR_QUERY, ancientDespairQueryHandler } from "./effects/ancient-despair-use.mjs";
import { WITHERING_HEAT_QUERY, witheringHeatQueryHandler } from "./effects/withering-heat-use.mjs";
import { DREDGE_SICKNESS_QUERY, dredgeSicknessQueryHandler } from "./effects/dredge-sickness-use.mjs";
import { MAGGOT_SLIME_QUERY, maggotSlimeQueryHandler } from "./effects/maggot-slime-use.mjs";
import { WILD_REGENERATION_QUERY, wildRegenerationQueryHandler } from "./effects/wild-regeneration-use.mjs";
import { VAMPIRIC_AURA_QUERY, vampiricAuraQueryHandler } from "./effects/vampiric-aura.mjs";
import { SIGNATURE_KILL_QUERY, signatureKillQueryHandler } from "./effects/signature-kill-rewards.mjs";
import { HIT_SIGNATURE_QUERY, PERFORM_HIT_SIGNATURE_QUERY, signatureHitQueryHandler, performSignatureHit } from "./effects/signature-hit-routing.mjs";
import { WITHDRAW_HIT_SIGNATURE_QUERY, signatureHitWithdrawalHandler } from "./effects/signature-hit-withdrawal.mjs";
import { CAUSE_INSANITY_QUERY, causeInsanityQueryHandler } from "./effects/cause-insanity-use.mjs";
import { SEDUCTION_QUERY, seductionQueryHandler } from "./effects/seduction-use.mjs";
import { SEDUCTION_WALK_QUERY, seductionWalkQueryHandler } from "./effects/seduction-route.mjs";
import { DEVOUR_MAGIC_QUERY, devourMagicQueryHandler } from "./effects/devour-magic-use.mjs";
import { QIRAJI_MIND_FLAY_QUERY, qirajiMindFlayQueryHandler } from "./effects/qiraji-mind-flay-use.mjs";
import { DESTROYER_DRAIN_QUERY, destroyerDrainQueryHandler } from "./effects/obsidian-drain-use.mjs";
import { DESTROYER_PURGE_QUERY, destroyerPurgeQueryHandler } from "./effects/obsidian-purge-use.mjs";
import { DREADLORD_SLEEP_QUERY, dreadlordSleepQueryHandler } from "./effects/dreadlord-sleep-use.mjs";
import { FLAMEWAKER_QUERY, flamewakerQueryHandler } from "./effects/flamewaker-use.mjs";
import { ENVELOPING_WINDS_QUERY, envelopingWindsQueryHandler } from "./effects/enveloping-winds-use.mjs";
import { GALE_QUERY, envelopingGaleQueryHandler } from "./effects/enveloping-gale-use.mjs";
import { BLAZING_QUERY, blazingInvaderQueryHandler } from "./effects/blazing-invader-use.mjs";
import { CHARR_QUERY, charrQueryHandler } from "./effects/charr-use.mjs";
import { EARTH_INVASION_QUERY, earthInvasionQueryHandler } from "./effects/earth-invasion-use.mjs";
import { DEMON_TAUNT_QUERY, demonTauntQueryHandler } from "./effects/demon-taunt-use.mjs";
import { LASH_QUERY, lashOfPainQueryHandler } from "./effects/lash-of-pain-use.mjs";
import { CONSUME_QUERY, consumeShadowsQueryHandler } from "./effects/consume-shadows-use.mjs";
import { BLOOD_PACT_QUERY, bloodPactQueryHandler } from "./effects/blood-pact-use.mjs";
import { FIRE_SHIELD_QUERY, fireShieldQueryHandler } from "./effects/fire-shield-use.mjs";
import { LESSER_INVISIBILITY_QUERY, lesserInvisibilityQueryHandler } from "./effects/lesser-invisibility-use.mjs";
import { TAINTED_BLOOD_QUERY, taintedBloodQueryHandler } from "./effects/tainted-blood-use.mjs";
import { SPELL_LOCK_QUERY, spellLockQueryHandler } from "./effects/spell-lock-query.mjs";
import { FROST_SHOT_QUERY, frostShotQueryHandler } from "./effects/frost-shot-use.mjs";
import { SENTINEL_STRIKE_QUERY, sentinelStrikeQueryHandler } from "./effects/sentinel-strike-use.mjs";
import { SENTINEL_BURN_QUERY, sentinelManaBurnQueryHandler } from "./effects/sentinel-mana-burn-use.mjs";
import { SENTINEL_THORNS_QUERY, sentinelThornsQueryHandler } from "./effects/sentinel-thorns.mjs";
import { JADEFIRE_RETALIATION_QUERY, jadefireRetaliationQueryHandler } from "./effects/jadefire-retaliation.mjs";
import { MADE_OF_FIRE_RETALIATION_QUERY, madeOfFireRetaliationQueryHandler } from "./effects/made-of-fire-retaliation.mjs";
import { JADEFIRE_USE_QUERY, jadefireQueryHandler } from "./effects/jadefire-use.mjs";
import { FROST_ARMOR_QUERY, frostArmorQueryHandler } from "./effects/frost-armor.mjs";
import { BLEAKHEART_QUERY, bleakheartHitQueryHandler } from "./effects/bleakheart-hit.mjs";
import { CHAMPION_QUERY, championQueryHandler } from "./effects/qiraji-champion-use.mjs";
import { REAVER_CLEAVE_QUERY, reaverCleaveQueryHandler } from "./effects/reaver-cleave-use.mjs";
import { GUARD_CLEAVE_QUERY, guardCleaveQueryHandler } from "./effects/guard-cleave-use.mjs";
import { GHOUL_CLEAVE_QUERY, ghoulCleaveQueryHandler } from "./effects/ghoul-cleave-use.mjs";
import { MIGHTY_BLOW_QUERY, mightyBlowQueryHandler } from "./effects/mighty-blow-use.mjs";
import { MIGHTY_BLOW_APPLY_QUERY, mightyBlowApplyQueryHandler } from "./effects/mighty-blow-apply.mjs";
import { ROYAL_TRAMPLE_QUERY, royalTrampleQueryHandler } from "./effects/royal-trample-use.mjs";
import { TERRIFYING_ROAR_QUERY, terrifyingRoarQueryHandler } from "./effects/terrifying-roar-use.mjs";
import { GEYSER_QUERY, geyserQueryHandler } from "./effects/geyser-use.mjs";
import { TOXIC_QUERY, toxicPoisonQueryHandler } from "./effects/toxic-horror-use.mjs";
import { CHILLED_QUERY, chilledQueryHandler } from "./effects/chilled-use.mjs";
import { VICIOUS_REND_QUERY, viciousRendQueryHandler } from "./effects/vicious-rend-use.mjs";
import { VICIOUS_REND_APPLY_QUERY, viciousRendApplyQueryHandler } from "./effects/vicious-rend-apply.mjs";
import { RENDING_CLAWS_QUERY, rendingClawsQueryHandler } from "./effects/rending-claws-use.mjs";
import { RENDING_CLAWS_APPLY_QUERY, rendingClawsApplyQueryHandler } from "./effects/rending-claws-apply.mjs";
import { FLESH_ROT_QUERY, fleshRotQueryHandler } from "./effects/flesh-rot-use.mjs";
import { FLESH_ROT_APPLY_QUERY, fleshRotApplyQueryHandler } from "./effects/flesh-rot-apply.mjs";
import { GUARD_NET_QUERY, guardNetQueryHandler } from "./effects/guard-net-use.mjs";
import { REAVER_ENRAGE_QUERY, reaverEnrageQueryHandler } from "./effects/reaver-enrage-use.mjs";
import { GHOUL_ENRAGE_QUERY, ghoulEnrageQueryHandler } from "./effects/ghoul-enrage-use.mjs";
import { PREDATORY_ENRAGE_QUERY, predatoryEnrageQueryHandler } from "./effects/predatory-enrage-use.mjs";
import { DEMORALIZING_ROAR_QUERY, demoralizingRoarQueryHandler } from "./effects/demoralizing-roar-use.mjs";
import { WAR_GOLEM_QUERY, warGolemQueryHandler } from "./effects/war-golem-use.mjs";
import { FIREGUARD_QUERY, fireguardCastQueryHandler } from "./effects/fireguard-use.mjs";
import { LIGHTNING_SHIELD_APPLY_QUERY, lightningShieldApplyHandler } from "./effects/lightning-shield-apply.mjs";
import { LIGHTNING_SHIELD_HIT_QUERY, lightningShieldHitQueryHandler } from "./effects/lightning-shield-hit-query.mjs";
import { FIRE_SHIELD_HIT_QUERY, fireShieldHitQueryHandler } from "./effects/fire-shield-hit-query.mjs";
import { TAINTED_BLOOD_HIT_QUERY, taintedBloodHitQueryHandler } from "./effects/tainted-blood-hit-query.mjs";
import { ATTACK_APPLY_QUERY, CHAIN_LIGHTNING_HIT_REVIEW_QUERY, attackApplyQueryHandler, chainLightningHitReviewHandler } from "./effects/attack-resolution-apply.mjs";
import { ATTACK_REACTION_REVIEW_QUERY, attackReactionReviewHandler } from "./effects/attack-reaction-review.mjs";
import { ATTACK_TRANSFER_REVIEW_QUERY, attackTransferReviewHandler } from "./effects/attack-transfer-review.mjs";
import { MIND_CONTROL_REVIEW_QUERY, mindControlReviewHandler } from "./effects/mind-control-review-query.mjs";
import { ELUNES_REGARD_QUERY, elunesRegardHandler } from "./effects/elunes-regard.mjs";
import { HUNGER_MASTERED_QUERY, hungerMasteredHandler } from "./effects/hunger-mastered.mjs";
import { KODO_BOND_QUERY, kodoBondHandler } from "./effects/kodo-bond.mjs";
import { ZALAZANE_QUERY, zalazaneHandler } from "./effects/zalazanes-lesson.mjs";
import { MIND_SOOTHE_QUERY, mindSootheHandler } from "./effects/mind-soothe.mjs";
import { GADGET_RESISTANCE_QUERY, gadgetResistanceHandler } from './effects/gadget-resistance.mjs';
import { BELLOW_USE_QUERY, bellowUseHandler } from "./effects/bellow-use.mjs";
import { DOMINATION_QUERY, dominationDeliveryHandler } from './effects/domination-delivery.mjs';
import { MILITIA_CLAIM_QUERY, MILITIA_TRAIN_QUERY, militiaClaimHandler, militiaTrainHandler } from "./effects/militia-drill.mjs";
import { RELOAD_QUERY, RELOAD_REVIEW_QUERY, reloadQueryHandler, reloadReviewQueryHandler } from "./effects/reload-query.mjs";
import { RESERVE_SHOT_QUERY, FINISH_SHOT_QUERY, reserveReloadShotHandler, finishReloadShotHandler } from "./effects/reload-shot-query.mjs";
import { CHAIN_LIGHTNING_CAST_QUERY, CHAIN_LIGHTNING_REVIEW_QUERY, chainLightningCastHandler, chainLightningReviewHandler } from "./effects/chain-lightning-cast.mjs";
import { ATTACK_BLOCK_QUERY, attackBlockQueryHandler } from "./effects/attack-block.mjs";
import { PARRY_QUERY, PARRY_PERFORM_QUERY, PARRY_PAY_QUERY, attackParryQueryHandler, performParryQueryHandler, parryPayQueryHandler } from "./effects/attack-parry.mjs";
import { PHASE_SHIFT_QUERY, phaseShiftQueryHandler } from "./effects/phase-shift-use.mjs";
import { WALKING_BOMB_QUERY, walkingBombQueryHandler } from "./effects/walking-bomb-query.mjs";
import { ANNIHILATOR_RESERVATION_QUERY, annihilatorReservationQueryHandler } from "./effects/lava-annihilator-reservation.mjs";
import { ABERRATION_BLAST_QUERY, aberrationBlastQueryHandler } from "./effects/arcane-aberration-blast.mjs";
import { CHAMPION_SHOUT_QUERY, championShoutQueryHandler } from "./effects/qiraji-shout.mjs";
import { DREDGE_POISON_QUERY, dredgePoisonQueryHandler } from "./effects/dredge-poison-use.mjs";
import { REFLECTION_QUERY, reflectionQueryHandler } from "./effects/reflection-use.mjs";
import { REFLECTION_REVIEW_QUERY, reflectionReviewHandler } from "./effects/reflection-review.mjs";
import { VEKNISS_QUERY, veknissQueryHandler } from "./effects/vekniss-use.mjs";
import { BLOODPETAL_QUERY, bloodpetalQueryHandler } from "./effects/bloodpetal-use.mjs";
import { STINGER_QUERY, stingerQueryHandler } from "./effects/vekniss-charge-use.mjs";
import { FORCED_QUERY, forcedMoveQueryHandler } from "./effects/forced-movement.mjs";
import { STEP_QUERY, stepQueryHandler } from "./effects/steps.mjs";
import { LEGACY_USE_QUERY, legacyUseQueryHandler } from "./effects/legacy-uses.mjs";
import { DEATH_HOLD_QUERY, deathHoldQueryHandler } from "./effects/death-holds.mjs";
import { INJURY_QUERY, SACRIFICE_QUERY, injuryQueryHandler, sacrificeConsentHandler } from "./effects/injury-application.mjs";
import { SPELL_LIMIT_QUERY, spellLimitQueryHandler } from "./effects/spell-limits.mjs";
import { REACTION_BAR_QUERY, reactionBarQueryHandler } from "./effects/reaction-bar.mjs";
import { RESTORATIVE_TOTEM_QUERY, restorativeTotemQueryHandler } from "./effects/restorative-totems.mjs";
import { STARFALL_QUERY, deliverStarfall } from "./effects/starfall-use.mjs";
import { OFFER_QUERY, offerQueryHandler } from "./effects/spirit-realm.mjs";
import { STABILIZER_QUERY, stabilizerQueryHandler } from "./effects/gadget-reactions.mjs";
import { CONFLAGRATE_PREPARE_QUERY, CONFLAGRATE_CONSUME_QUERY, CONFLAGRATE_DAMAGE_QUERY, CONFLAGRATE_REVIEW_QUERY, prepareConflagrate, consumeConflagrate, applyConflagrateDamage, reviewConflagrateResolution } from "./effects/conflagrate.mjs";
import { BLOOD_PACT_SPELL_PREPARE, BLOOD_PACT_SPELL_RESOLVE, BLOOD_PACT_SPELL_REVIEW, prepareBloodPactSpell, resolveBloodPactSpell, reviewBloodPactSpell } from "./effects/blood-pact-spell.mjs";
import { SOUL_LINK_CONSENT, soulLinkConsentHandler } from "./effects/soul-link-consent.mjs";
import { DAMAGE_TRANSFER_CHOICE, damageTransferChoiceHandler } from "./effects/damage-transfer-choice.mjs";
import { SOUL_LINK_PREPARE, SOUL_LINK_RESOLVE, SOUL_LINK_REVIEW_QUERY, prepareSoulLinkCast, resolveSoulLinkCast, reviewSoulLinkCreation } from "./effects/soul-link-casting.mjs";

/** Register at init. */
export function registerQueries() {
  CONFIG.queries[EVERBURN_DISMISS_QUERY]=dismissEverburn;
  CONFIG.queries[SPELL_CROSSING_QUERY]=deliverSpellCrossing;
  CONFIG.queries[SEALING_FLAME_CAST_QUERY]=sealingFlameCast;
  CONFIG.queries[SEALING_FLAME_HOLD_QUERY]=sealingFlameHoldQuery;
  CONFIG.queries[SEALING_FLAME_FINISH_QUERY]=sealingFlameFinishQuery;
  CONFIG.queries[SIGNATURE_RETALIATION_QUERY]=signatureRetaliationHandler;
  CONFIG.queries[ROCKET_JUMP_QUERY] = rocketJumpHandler;
  CONFIG.queries[ICE_BLOCK_END_QUERY] = endIceBlock;
  CONFIG.queries[DISPERSION_END_QUERY] = endDispersion;
  CONFIG.queries[DISPERSION_REACTION_QUERY] = dispersionReactionHandler;
  CONFIG.queries[DISPERSION_PREPARE] = prepareDispersionCast;
  CONFIG.queries[DISPERSION_RESOLVE] = resolveDispersionCast;
  CONFIG.queries[DISPERSION_REVIEW_QUERY] = reviewDispersionCreation;
  CONFIG.queries[ICE_BLOCK_PREPARE] = prepareIceBlockCast;
  CONFIG.queries[ICE_BLOCK_RESOLVE] = resolveIceBlockCast;
  CONFIG.queries[ICE_BLOCK_REVIEW_QUERY] = reviewIceBlockCreation;
  CONFIG.queries[SOUL_LINK_CONSENT] = soulLinkConsentHandler;
  CONFIG.queries[DAMAGE_TRANSFER_CHOICE] = damageTransferChoiceHandler;
  CONFIG.queries[SOUL_LINK_PREPARE] = prepareSoulLinkCast;
  CONFIG.queries[SOUL_LINK_RESOLVE] = resolveSoulLinkCast;
  CONFIG.queries[SOUL_LINK_REVIEW_QUERY] = reviewSoulLinkCreation;
  CONFIG.queries[BLOOD_PACT_SPELL_PREPARE] = prepareBloodPactSpell;
  CONFIG.queries[BLOOD_PACT_SPELL_RESOLVE] = resolveBloodPactSpell;
  CONFIG.queries[BLOOD_PACT_SPELL_REVIEW] = reviewBloodPactSpell;
  CONFIG.queries[CONFLAGRATE_PREPARE_QUERY] = prepareConflagrate;
  CONFIG.queries[CONFLAGRATE_CONSUME_QUERY] = consumeConflagrate;
  CONFIG.queries[CONFLAGRATE_DAMAGE_QUERY] = applyConflagrateDamage;
  CONFIG.queries[CONFLAGRATE_REVIEW_QUERY] = reviewConflagrateResolution;
  CONFIG.queries[ATTACK_APPLY_QUERY] = attackApplyQueryHandler;
  CONFIG.queries[CHAIN_LIGHTNING_HIT_REVIEW_QUERY] = chainLightningHitReviewHandler;
  CONFIG.queries[ATTACK_REACTION_REVIEW_QUERY] = attackReactionReviewHandler;
  CONFIG.queries[ATTACK_TRANSFER_REVIEW_QUERY] = attackTransferReviewHandler;
  CONFIG.queries[MIND_CONTROL_REVIEW_QUERY] = mindControlReviewHandler;
  CONFIG.queries[ELUNES_REGARD_QUERY] = elunesRegardHandler;
  CONFIG.queries[HUNGER_MASTERED_QUERY] = hungerMasteredHandler;
  CONFIG.queries[KODO_BOND_QUERY] = kodoBondHandler;
  CONFIG.queries[ZALAZANE_QUERY] = zalazaneHandler;
  CONFIG.queries[MIND_SOOTHE_QUERY] = mindSootheHandler;
  CONFIG.queries[GADGET_RESISTANCE_QUERY] = gadgetResistanceHandler;
  CONFIG.queries[BELLOW_USE_QUERY] = bellowUseHandler;
  CONFIG.queries[DOMINATION_QUERY] = dominationDeliveryHandler;
  CONFIG.queries[MILITIA_CLAIM_QUERY] = militiaClaimHandler;
  CONFIG.queries[MILITIA_TRAIN_QUERY] = militiaTrainHandler;
  CONFIG.queries[RELOAD_QUERY] = reloadQueryHandler;
  CONFIG.queries[RELOAD_REVIEW_QUERY] = reloadReviewQueryHandler;
  CONFIG.queries[RESERVE_SHOT_QUERY] = reserveReloadShotHandler;
  CONFIG.queries[FINISH_SHOT_QUERY] = finishReloadShotHandler;
  CONFIG.queries[CHAIN_LIGHTNING_CAST_QUERY] = chainLightningCastHandler;
  CONFIG.queries[CHAIN_LIGHTNING_REVIEW_QUERY] = chainLightningReviewHandler;
  CONFIG.queries[ATTACK_BLOCK_QUERY] = attackBlockQueryHandler;
  CONFIG.queries[PARRY_QUERY] = attackParryQueryHandler;
  CONFIG.queries[PARRY_PERFORM_QUERY] = performParryQueryHandler;
  CONFIG.queries[PARRY_PAY_QUERY] = parryPayQueryHandler;
  CONFIG.queries[PHASE_SHIFT_QUERY] = phaseShiftQueryHandler;
  CONFIG.queries[NULLIFY_MANA_QUERY] = nullifyManaQueryHandler;
  CONFIG.queries[DIRE_GROWL_QUERY] = direGrowlQueryHandler;
  CONFIG.queries[ELDER_QUERY] = elderQueryHandler;
  CONFIG.queries[SONIC_BURST_QUERY] = sonicBurstQueryHandler;
  CONFIG.queries[MOLTEN_SMASH_QUERY] = moltenSmashQueryHandler;
  CONFIG.queries[KNOCK_AWAY_QUERY] = knockAwayQueryHandler;
  CONFIG.queries[PLAGUE_CLOUD_QUERY] = plagueCloudQueryHandler;
  CONFIG.queries[LIGHTNING_CLOUD_QUERY] = lightningCloudQueryHandler;
  CONFIG.queries[CAUTERIZING_FLAMES_QUERY] = cauterizingFlamesQueryHandler;
  CONFIG.queries[GROUND_STOMP_QUERY] = groundStompQueryHandler;
  CONFIG.queries[ANCIENT_HYSTERIA_QUERY] = ancientHysteriaQueryHandler;
  CONFIG.queries[ANCIENT_DREAD_QUERY] = ancientDreadQueryHandler;
  CONFIG.queries[ANCIENT_DESPAIR_QUERY] = ancientDespairQueryHandler;
  CONFIG.queries[WITHERING_HEAT_QUERY] = witheringHeatQueryHandler;
  CONFIG.queries[DREDGE_SICKNESS_QUERY] = dredgeSicknessQueryHandler;
  CONFIG.queries[MAGGOT_SLIME_QUERY] = maggotSlimeQueryHandler;
  CONFIG.queries[WILD_REGENERATION_QUERY] = wildRegenerationQueryHandler;
  CONFIG.queries[VAMPIRIC_AURA_QUERY] = vampiricAuraQueryHandler;
  CONFIG.queries[SIGNATURE_KILL_QUERY] = signatureKillQueryHandler;
  CONFIG.queries[HIT_SIGNATURE_QUERY] = signatureHitQueryHandler;
  CONFIG.queries[PERFORM_HIT_SIGNATURE_QUERY] = performSignatureHit;
  CONFIG.queries[WITHDRAW_HIT_SIGNATURE_QUERY] = signatureHitWithdrawalHandler;
  CONFIG.queries[CAUSE_INSANITY_QUERY] = causeInsanityQueryHandler;
  CONFIG.queries[SEDUCTION_QUERY] = seductionQueryHandler;
  CONFIG.queries[SEDUCTION_WALK_QUERY] = seductionWalkQueryHandler;
  CONFIG.queries[DEVOUR_MAGIC_QUERY] = devourMagicQueryHandler;
  CONFIG.queries[QIRAJI_MIND_FLAY_QUERY] = qirajiMindFlayQueryHandler;
  CONFIG.queries[DESTROYER_DRAIN_QUERY] = destroyerDrainQueryHandler;
  CONFIG.queries[DESTROYER_PURGE_QUERY] = destroyerPurgeQueryHandler;
  CONFIG.queries[DREADLORD_SLEEP_QUERY] = dreadlordSleepQueryHandler;
  CONFIG.queries[FLAMEWAKER_QUERY] = flamewakerQueryHandler;
  CONFIG.queries[ENVELOPING_WINDS_QUERY] = envelopingWindsQueryHandler;
  CONFIG.queries[GALE_QUERY] = envelopingGaleQueryHandler;
  CONFIG.queries[BLAZING_QUERY] = blazingInvaderQueryHandler;
  CONFIG.queries[CHARR_QUERY] = charrQueryHandler;
  CONFIG.queries[EARTH_INVASION_QUERY] = earthInvasionQueryHandler;
  CONFIG.queries[DEMON_TAUNT_QUERY] = demonTauntQueryHandler;
  CONFIG.queries[LASH_QUERY] = lashOfPainQueryHandler;
  CONFIG.queries[CONSUME_QUERY] = consumeShadowsQueryHandler;
  CONFIG.queries[BLOOD_PACT_QUERY] = bloodPactQueryHandler;
  CONFIG.queries[FIRE_SHIELD_QUERY] = fireShieldQueryHandler;
  CONFIG.queries[LESSER_INVISIBILITY_QUERY] = lesserInvisibilityQueryHandler;
  CONFIG.queries[TAINTED_BLOOD_QUERY] = taintedBloodQueryHandler;
  CONFIG.queries[SPELL_LOCK_QUERY] = spellLockQueryHandler;
  CONFIG.queries[FROST_SHOT_QUERY] = frostShotQueryHandler;
  CONFIG.queries[SENTINEL_STRIKE_QUERY] = sentinelStrikeQueryHandler;
  CONFIG.queries[SENTINEL_BURN_QUERY] = sentinelManaBurnQueryHandler;
  CONFIG.queries[SENTINEL_THORNS_QUERY] = sentinelThornsQueryHandler;
  CONFIG.queries[JADEFIRE_RETALIATION_QUERY] = jadefireRetaliationQueryHandler;
  CONFIG.queries[MADE_OF_FIRE_RETALIATION_QUERY] = madeOfFireRetaliationQueryHandler;
  CONFIG.queries[JADEFIRE_USE_QUERY] = jadefireQueryHandler;
  CONFIG.queries[FROST_ARMOR_QUERY] = frostArmorQueryHandler;
  CONFIG.queries[BLEAKHEART_QUERY] = bleakheartHitQueryHandler;
  CONFIG.queries[CHAMPION_QUERY] = championQueryHandler;
  CONFIG.queries[REAVER_CLEAVE_QUERY] = reaverCleaveQueryHandler;
  CONFIG.queries[GUARD_CLEAVE_QUERY] = guardCleaveQueryHandler;
  CONFIG.queries[GHOUL_CLEAVE_QUERY] = ghoulCleaveQueryHandler;
  CONFIG.queries[MIGHTY_BLOW_QUERY] = mightyBlowQueryHandler;
  CONFIG.queries[MIGHTY_BLOW_APPLY_QUERY] = mightyBlowApplyQueryHandler;
  CONFIG.queries[ROYAL_TRAMPLE_QUERY] = royalTrampleQueryHandler;
  CONFIG.queries[TERRIFYING_ROAR_QUERY] = terrifyingRoarQueryHandler;
  CONFIG.queries[GEYSER_QUERY] = geyserQueryHandler;
  CONFIG.queries[TOXIC_QUERY] = toxicPoisonQueryHandler;
  CONFIG.queries[CHILLED_QUERY] = chilledQueryHandler;
  CONFIG.queries[VICIOUS_REND_QUERY] = viciousRendQueryHandler;
  CONFIG.queries[VICIOUS_REND_APPLY_QUERY] = viciousRendApplyQueryHandler;
  CONFIG.queries[RENDING_CLAWS_QUERY] = rendingClawsQueryHandler;
  CONFIG.queries[RENDING_CLAWS_APPLY_QUERY] = rendingClawsApplyQueryHandler;
  CONFIG.queries[FLESH_ROT_QUERY] = fleshRotQueryHandler;
  CONFIG.queries[FLESH_ROT_APPLY_QUERY] = fleshRotApplyQueryHandler;
  CONFIG.queries[GUARD_NET_QUERY] = guardNetQueryHandler;
  CONFIG.queries[REAVER_ENRAGE_QUERY] = reaverEnrageQueryHandler;
  CONFIG.queries[GHOUL_ENRAGE_QUERY] = ghoulEnrageQueryHandler;
  CONFIG.queries[PREDATORY_ENRAGE_QUERY] = predatoryEnrageQueryHandler;
  CONFIG.queries[DEMORALIZING_ROAR_QUERY] = demoralizingRoarQueryHandler;
  CONFIG.queries[WAR_GOLEM_QUERY] = warGolemQueryHandler;
  CONFIG.queries[FIREGUARD_QUERY] = fireguardCastQueryHandler;
  CONFIG.queries[LIGHTNING_SHIELD_APPLY_QUERY] = lightningShieldApplyHandler;
  CONFIG.queries[LIGHTNING_SHIELD_HIT_QUERY] = lightningShieldHitQueryHandler;
  CONFIG.queries[FIRE_SHIELD_HIT_QUERY] = fireShieldHitQueryHandler;
  CONFIG.queries[TAINTED_BLOOD_HIT_QUERY] = taintedBloodHitQueryHandler;
  CONFIG.queries[WALKING_BOMB_QUERY] = walkingBombQueryHandler;
  CONFIG.queries[ANNIHILATOR_RESERVATION_QUERY] = annihilatorReservationQueryHandler;
  CONFIG.queries[ABERRATION_BLAST_QUERY] = aberrationBlastQueryHandler;
  CONFIG.queries[CHAMPION_SHOUT_QUERY] = championShoutQueryHandler;
  CONFIG.queries[DREDGE_POISON_QUERY] = dredgePoisonQueryHandler;
  CONFIG.queries[MANA_BURN_QUERY] = manaBurnQueryHandler;
  CONFIG.queries[APPROVED_SIGNATURE_USE_QUERY] = approvedSignatureUseQueryHandler;
  CONFIG.queries[CANNONBALL_RESOLVE_QUERY] = resolveCannonball;
  CONFIG.queries[CANNONBALL_SAVE_QUERY] = performCannonballSave;
  CONFIG.queries[PICCOLO_RESOLVE_QUERY] = resolvePiccolo;
  CONFIG.queries[PICCOLO_SAVE_QUERY] = performPiccoloSave;
  CONFIG.queries[HELMET_RESOLVE_QUERY] = resolveHelmetStrike;
  CONFIG.queries[HELMET_SAVE_QUERY] = performHelmetSave;
  CONFIG.queries[SIGNATURE_HEALING_QUERY] = signatureHealingQueryHandler;
  CONFIG.queries[STANDALONE_PARRY_QUERY] = standaloneParryQueryHandler;
  CONFIG.queries[CURE_QUERY] = curePoisonQueryHandler;
  CONFIG.queries[ANTIVENOM_QUERY] = antivenomQueryHandler;
  CONFIG.queries[CONSUMABLE_RECEIPT_QUERY] = consumableReceiptHandler;
  CONFIG.queries[STINGER_QUERY] = stingerQueryHandler;
  CONFIG.queries[VEKNISS_QUERY] = veknissQueryHandler;
  CONFIG.queries[BLOODPETAL_QUERY] = bloodpetalQueryHandler;
  CONFIG.queries[NULLIFY_QUERY] = massNullifyQueryHandler;
  CONFIG.queries[REFLECTION_QUERY] = reflectionQueryHandler;
  CONFIG.queries[REFLECTION_REVIEW_QUERY] = reflectionReviewHandler;
  CONFIG.queries[STABILIZER_QUERY] = stabilizerQueryHandler;
  CONFIG.queries[BIND_QUERY] = bindQueryHandler;
  CONFIG.queries[UNBIND_QUERY] = unbindQueryHandler;
  // What a creature's ability calls up (D-691): the tokens are the GM's to
  // create, whoever pressed the card's button.
  CONFIG.queries[SUMMON_QUERY] = summonQueryHandler;
  CONFIG.queries[STONE_GUARDIAN_QUERY] = stoneGuardianQueryHandler;
  CONFIG.queries[FIRE_GUARDIAN_QUERY] = fireGuardianQueryHandler;
  CONFIG.queries[DEMON_GUARDIAN_QUERY] = demonGuardianQueryHandler;
  CONFIG.queries[MOBILE_ALERT_QUERY] = mobileAlertQueryHandler;
  CONFIG.queries[NPC_SEARING_QUERY] = npcSearingTotemQueryHandler;
  CONFIG.queries[CARRION_SCARAB_QUERY] = carrionScarabQueryHandler;
  CONFIG.queries[IMAGE_PROJECTION_QUERY] = imageProjectionQueryHandler;
  CONFIG.queries[TUTOR_SILENCE_QUERY] = tutorSilenceQueryHandler;
  CONFIG.queries[BANSHEE_CURSE_QUERY] = bansheeCurseQueryHandler;
  CONFIG.queries[VILEBRANCH_SHRINK_QUERY] = vilebranchShrinkQueryHandler;
  CONFIG.queries[TETANUS_QUERY] = tetanusQueryHandler;
  CONFIG.queries[INNER_FIRE_HIT_QUERY] = innerFireHitQueryHandler;
  CONFIG.queries[INNER_FIRE_QUERY] = innerFireQueryHandler;
  CONFIG.queries[NPC_SNEAK_QUERY] = npcSneakQueryHandler;
  CONFIG.queries[NPC_DISARM_QUERY] = npcDisarmQueryHandler;
  CONFIG.queries[NPC_SHIELD_SLAM_QUERY] = npcShieldSlamQueryHandler;
  CONFIG.queries[WHIRLWIND_QUERY] = whirlwindQueryHandler;
  CONFIG.queries[CRUSHRIDGE_ATTACK_QUERY] = crushridgeExtraAttackQueryHandler;
  CONFIG.queries[DEATH_SINGER_SCREECH_QUERY] = deathSingerScreechQueryHandler;
  CONFIG.queries[ANTI_MAGIC_SHIELD_QUERY] = antiMagicShieldQueryHandler;
  // A totem planted beside its shaman, with the ground it holds (02 §7,
  // D-708): `TOKEN_CREATE` is an ASSISTANT permission, so a player's totem
  // is placed here.
  CONFIG.queries[PLANT_TOTEM_QUERY] = plantTotemQueryHandler;
  // A Bane laid on somebody else's creature (06 §6's Pummel, D-693): a player
  // cannot write an effect on the GM's caster, and this is the door.
  CONFIG.queries[LAY_BANE_QUERY] = layBaneQueryHandler;
  // A rider's condition landing with the blow (04's Mangle, Rip and Feral
  // Charge, D-770): the card's own Inflict door, run where the target is owned.
  CONFIG.queries[INFLICT_QUERY] = inflictQueryHandler;
  // What a Parry or a Block writes back onto the attacker's card (06 §6,
  // D-720): a player does not own the message and the number on the Apply
  // button has to move.
  CONFIG.queries[ANNOTATE_QUERY] = annotateQueryHandler;
  // A player taking, putting back or passing on a find (D-721): the offer is
  // a WORLD setting, and `SETTINGS_MODIFY` is a GAMEMASTER permission the
  // server enforces, so every claim is written on the designated GM's client.
  CONFIG.queries[CLAIM_LOOT_QUERY] = claimLootQueryHandler;
  // Swiftmend ending a heal over time the druid laid on somebody else's
  // creature, and the heal it gives at once (04, D-771): the creature is the
  // GM's or another player's, so both writes are made on the GM's client.
  CONFIG.queries[END_TICK_QUERY] = endTickQueryHandler;
  // Symbiosis's share of a heal, landing on a partner this client does not own
  // (04, D-771).
  CONFIG.queries[SHARE_HEAL_QUERY] = shareHealQueryHandler;
  // The Warrior's and the Paladin's (D-772): Blessing's Boon on somebody else's
  // creature, Mortal Strike's mark on the creature struck, and Beacon's share of
  // a heal landing on a chosen creature this client does not own.
  CONFIG.queries[LAY_BOON_QUERY] = layBoonQueryHandler;
  CONFIG.queries[NO_HEALING_QUERY] = noHealingQueryHandler;
  CONFIG.queries[BEACON_HEAL_QUERY] = beaconHealQueryHandler;
  // A Vengeance holder another user owns (the architect's review of D-772).
  CONFIG.queries[VENGEANCE_QUERY] = vengeanceQueryHandler;
  // The Ranger's and the Rogue's (D-773): a Reaction taken from a creature the
  // striker does not own (Concussive Shot, Waylay, Paralytic) through the
  // combatant's own queued door, a Speed dropped on one (Wing Clip), and a
  // poison landing with no Test (Coated Blades at rank 2).
  CONFIG.queries[LOSE_REACTION_QUERY] = loseReactionQueryHandler;
  CONFIG.queries[SPEED_DROP_QUERY] = speedDropQueryHandler;
  CONFIG.queries[LAY_POISON_QUERY] = layPoisonQueryHandler;
  // The Priest's and the Shaman's (D-774): 02's Ward laid on a creature the priest
  // does not own and Absorption's Mana back to a priest the striker's client does
  // not own; Hymn of Hope's Mana and Undying Spirit's friend stood up at 1 Health.
  CONFIG.queries[WARD_QUERY] = wardQueryHandler;
  CONFIG.queries[GIFT_QUERY] = giftQueryHandler;
  // A card's talent button pressed by an owner of the speaker who did not post
  // the card (the architect's review of D-774): the press recorded on the GM's client.
  CONFIG.queries[CARD_PRESS_QUERY] = cardPressQueryHandler;
  // The Mage's and the Warlock's (D-775): Spellsteal ending a Sustain somebody
  // else's creature holds, Soul Swap and Haunt moving and raising what the warlock
  // laid on a creature this client does not own, and Command Demon binding the
  // GM's demon until the warlock's next Long Rest.
  CONFIG.queries[STEAL_SUSTAIN_QUERY] = stealSustainQueryHandler;
  CONFIG.queries[SPELLSTEAL_USE_QUERY] = spellstealUseHandler;
  CONFIG.queries[SNAKE_TRAP_DOSE_QUERY] = snakeTrapDoseHandler;
  CONFIG.queries[SNAKE_TRAP_CATCH_QUERY] = snakeTrapCatchHandler;
  CONFIG.queries[EXPLOSIVE_TRAP_QUERY] = explosiveTrapHandler;
  CONFIG.queries[SNARE_PLACEMENT_QUERY] = snarePlacementHandler;
  CONFIG.queries[SNARE_PLACEMENT_REVIEW_QUERY] = snarePlacementReviewHandler;
  CONFIG.queries[SOUL_SWAP_QUERY] = soulSwapQueryHandler;
  CONFIG.queries[HAUNT_QUERY] = hauntQueryHandler;
  CONFIG.queries[ADOPT_QUERY] = adoptQueryHandler;
  CONFIG.queries[COMMAND_DEMON_SIGHT_QUERY] = commandDemonSightHandler;
  CONFIG.queries[RELEASE_COMMAND_QUERY] = releaseCommandQueryHandler;
  // The damage door's rulings (D-777): 02's Rallying Cry's temporary Health on an
  // ally this client does not own; a holder ASKED in the blow - Guardian and
  // Shield of the Righteous taking it, Intervention, Spirit Shell and Guardian
  // Spirit holding a creature at 1 - on whichever client answers for the holder;
  // and a share of a blow Spirit Link Totem divides, on the GM's client.
  CONFIG.queries[TEMP_HEALTH_QUERY] = temporaryHealthQueryHandler;
  CONFIG.queries[BLOW_ASK_QUERY] = blowAskHandler;
  CONFIG.queries[BLOW_SHARE_QUERY] = blowShareQueryHandler;
  // The cross-class rulings (D-778): 02's Dispel ending the effects selected on a
  // creature this client does not own, every id judged again here; and a creature's
  // token pushed or pulled where this client may not write it.
  CONFIG.queries[DISPEL_QUERY] = dispelQueryHandler;
  CONFIG.queries[FORCED_QUERY] = forcedMoveQueryHandler;
  // The Legacy branches' bodies (B2, door 3): a token stepped to a chosen space -
  // 02's Blink and Shadowstep, 04's Fade Step, 07's Shadow Walk and Dark Passage -
  // where this client may not write it, the space judged again here.
  CONFIG.queries[STEP_QUERY] = stepQueryHandler;
  // The Legacy branches' B3 (doors 11 and 25): a holder asked to hold a Death Step back
  // (04's Hold the Thread), on whoever answers for it; and what a Use writes on a
  // creature this client does not own - a concealment, an Ethereal Form, a condition
  // ended, a creature called back, a transporter's carry, Life Drain's Health and a
  // thrall's Charmed - each judged again here off the user's own feature.
  CONFIG.queries[DEATH_HOLD_QUERY] = deathHoldQueryHandler;
  CONFIG.queries[INJURY_QUERY] = injuryQueryHandler;
  CONFIG.queries[SACRIFICE_QUERY] = sacrificeConsentHandler;
  CONFIG.queries[SPELL_LIMIT_QUERY] = spellLimitQueryHandler;
  CONFIG.queries[REACTION_BAR_QUERY] = reactionBarQueryHandler;
  CONFIG.queries[RESTORATIVE_TOTEM_QUERY] = restorativeTotemQueryHandler;
  CONFIG.queries[SEARING_USE_QUERY] = searingUseHandler;
  CONFIG.queries[SECOND_STRIKE_QUERY] = secondStrikeQueryHandler;
  CONFIG.queries[STARFALL_QUERY] = deliverStarfall;
  CONFIG.queries[LEGACY_USE_QUERY] = legacyUseQueryHandler;
  // 06 §10's offer, taken by a player and priced by the GM (*the GM decides from the
  // place*; the B3 review): the track and the price chosen on the GM's client, judged
  // again there and written.
  CONFIG.queries[OFFER_QUERY] = offerQueryHandler;
}
