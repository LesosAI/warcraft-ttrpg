/**
 * Roll workflows: Test → Success Level → damage → mitigation → chat card
 * (D2 §4).
 *
 * These assemble modifiers, build an AzerothRoll, evaluate it and post a card.
 * They compute NOTHING themselves — every number comes from `rules/`, so the
 * sheet, the card and the roll cannot disagree (CLAUDE.md §7).
 */

import { AZEROTH } from "../config.mjs";
import { effectDuration, riderRating } from "../rules/spell-effects.mjs";
import { abilityModifier } from "../rules/abilities.mjs";
import { applyExposure, castingCorruption, thresholdsCrossed } from "../rules/corruption.mjs";
import { explainDamage, resolveDamage } from "../rules/mitigation.mjs";
import { AzerothRoll } from "./azeroth-roll.mjs";
import { resultName } from "../rules/resolution.mjs";
import { areaFor, lengthenArea, widenArea } from "../rules/areas.mjs";
// An area that strikes at the start of a turn (D-756): the cast deals none of
// it, and the tick adds what the caster STANDS on, as the cast does.
import { areaCarriesSpell, castDealsDamage, castHeals, hasAreaTick, roundsIn, tickParts } from "../rules/area-ticks.mjs";
import { standingFeatureBonus, standingSpellBonus } from "../rules/spell-bonus.mjs";
import { calledShotCost } from "../rules/modifiers.mjs";
import { NEXT_SPELL_FLAG, castRefusal, castingDC, grantingClass, isHealingSpell, manaPrice, overchannelCost, overchannelledSL, payFromNow, spellDCFor, spellManaCost, statedCastingDC, swiftCast, takeNextSpell } from "../rules/casting.mjs";
import { resilienceAbility, resilienceRows } from "../rules/resilience.mjs";
import { injuryConditions } from "../rules/injuries.mjs";
import { enrich } from "../helpers/enrich.mjs";
import { CONSECRATED, CONSECRATED_FLAG, SNARE, cardAttackAllowance, consecratedTrait, evaluateAmount, featurePayment, formsKnown, mainHandOf, payingPool, weaponRatingOf } from "../rules/class-features.mjs";
// Shapeshift, the Avatar of the Wild and Metamorphosis (02 §7, D-769): the law,
// and the one writer of a shape.
// The free shift's own law and its once-a-round mark (04's Savage Shift, D-771).
import { FREE_SHIFT_MARK, METAMORPHOSIS, formPicksRefusal, freeShift, shapeKindOf, shapeRefusal } from "../rules/shapes.mjs";
import { formsFrom, takeShape } from "../documents/shapes.mjs";
import { secondaryLevel, tierForLevel } from "../rules/progression.mjs";
import { skillFromKnown, skillUuid } from "../rules/creation.mjs";
import { maneuverCost, sizeNote, sunderAmount } from "../rules/maneuvers.mjs";
import { HAMMER_OF_JUSTICE_SPELL, appliesHammerOfJustice, furtherGains, gainOnHit, momentumAfter, refundOnSpend } from "../rules/momentum.mjs";
import { applyCondition, spellTiming, untilEndOfNextTurn, untilNextTurn } from "../effects/durations.mjs";
// 06 SS6 (D-693): a Bane laid on ANOTHER creature - Pummel's two, Gorehowl's one.
import { layBane, layBoon, spendLaidBanes, spendLaidBoons } from "../effects/banes.mjs";
import { blockReduction, canReact, meleeInHand, parryHolds, shieldsHeld, standingMarkRefusal } from "../rules/reactions.mjs";
import { POISON_ROUNDS, coatingAction, coatingFired, endsOnHit, flatten, goesOn, hasUse, poisonTick, runAfter, spendOne } from "../rules/consumables.mjs";
import { sustainLimit } from "../rules/turn-effects.mjs";
import { standardDC } from "../rules/modifiers.mjs";
import { spendShot } from "../rules/ammunition.mjs";
import { firedTraits } from "../rules/weapon-traits.mjs";
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
  EXPOSED_FLAG, PLATE_FLAG, calledShotFor, criticalRollCount, extraStrikesFor, freeHealingFor, hitConditionsFor,
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
import { layWard } from "../effects/wards.mjs";
// The Mage's and the Warlock's kinds (D-775): what each reads at the cast, the
// Use, the card and a Critical Injury's roll.
import {
  BLINK, COUNTERSPELL, CURSE, LIFE_TAP, SACRIFICED_FLAG, VEINS_FLAG, aegisWardFor, blinkFor, blinkTargetRefusal, commandRefusal,
  counterspellFor, curseFor, extendTickRounds, extendedSpan, freeUseFor, higherRoll, immuneAsWardFor, immuneReadAsWard, isSacrificed, lifeTapChoices,
  lifeTapFor, onUseMageWarlock, overchannelReliefFor, ruinFor, sacrificeRecord, sacrificedWardChanges, soulFireRefusal, spanExtensionFor,
  spellCriticalFor, spellDcFor, spellDiscountFor, spellHealthFor, speedReducedFact, sustainsFor, swappableEffects, veinsStates
} from "../rules/class-talents.mjs";
import { stealSustain } from "../effects/sustain-steal.mjs";
import { swapEffects } from "../effects/soul-swap.mjs";
import { hauntTarget } from "../effects/haunt.mjs";
import { giveMana, raiseAlly } from "../effects/gifts.mjs";
import { markLightUsed } from "../effects/shadowform.mjs";
// Spirit Walk's *ignoring Difficult ground* (D-774): the terrain door's own flag (D-757).
import { IGNORES_GROUND_FLAG } from "../rules/area-ground.mjs";
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
import { bindingFor, capacity, eligible, summonRefusal, totemBlock } from "../rules/bound.mjs";
// A totem is planted, and the ground it holds is drawn (02 §7, D-708).
import { plantTotem, plantedLine } from "../documents/totems.mjs";
import { totemAura } from "../rules/totems.mjs";
import { abilityDC, hasAutomation, spendBossPoints } from "../rules/ability-automation.mjs";
import { BOSS, ignoresCritical } from "../rules/bestiary.mjs";
// 08 SS20 (D-692): the pressed half, and the judgement all three surfaces share.
import { gateHolds, isPressable, pressGates, pressRefusal, signatureEffectOf, signatureProse } from "../rules/signatures.mjs";
// WHICH POOL IS THE MANA POOL (D-637's own pitfall, 2026-09-10): a creature's
// block names no pool type, so `find(p => p.name === "mana")` matched nothing
// on one and both handlers below said *no Mana pool* to a creature holding one.
// And `poolNamed` is the same reading for a COST — `poolFor` below matched a
// pool by name alone, so a Signature that costs a pool refused on all 164.
import { manaPool, poolNamed } from "../rules/pools.mjs";
// Attacking and casting end a Hide (D-717).
import { isHidden, reveal } from "../effects/stealth.mjs";
// 06 §5's Engaged, for a creature's casting ability, which has no dialog (D-732).
import { creaturesWithin, engagedNow, enemyDistances, feetBetweenTokens, reachOfActor } from "../canvas/engaged.mjs";
// What a budget would refuse, asked without spending (the architect's review of D-773).
import { spend as judgeSpend } from "../rules/initiative.mjs";
// Who resisted a spell (D-726): the key a target's row records under, and the
// link a Resilience card carries back to the card it answered.
import { resistKey, resistLink } from "../rules/records.mjs";
// THE CROSS-CLASS RULINGS (D-778; the lead's answers of 2026-10-03): 02's Dispel and
// the talents on it, forced movement, the Test 07 gives a held or Stunned creature,
// a Sustain's upkeep by its entry, a Speed drop off a spell's hit and Permafrost's
// feet, and a span out of a fight on the world's clock.
import { DISPEL, DISPEL_REFUSALS, dispelTargetRefusal, gatePassed } from "../rules/dispel.mjs";
import { dispelGatesOn, dispelOptionsOn, endEffects, unstableStrikes } from "../effects/dispel.mjs";
import {
  escapeTalentsFor, pushFor, raptureFor, slowingFor, spellPushFor, undispellableFor
} from "../rules/class-talents.mjs";
import { cleanForced, forcedFeet, readForced } from "../rules/forced-movement.mjs";
import { forceMove, forcedWords } from "../effects/forced-movement.mjs";
import { escapeRecord, readEscape } from "../rules/escapes.mjs";
import { readUpkeep } from "../rules/upkeep.mjs";
import { SLOWED_FEET_FLAG, readSpeedDrop, speedDropAt } from "../rules/slowing.mjs";
import { clockRounds, roundsOrClock, untilEndOfNextTurnOrRound, untilNextTurnOrRound } from "../effects/durations.mjs";
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
import { pickPoint } from "../canvas/place.mjs";
import { placeArea, schoolColor } from "../canvas/regions.mjs";
import { feetToPoint } from "../canvas/footprints.mjs";

/**
 * **THE FINISHER AS IT STANDS NOW** (02 §7 with 04's Death Mark, Rupture and
 * Ruthlessness laid over it; D-773): the dialog's own reading, asked again at the
 * roll. Null where there is nothing to offer.
 *
 * @param {Actor} actor
 * @param {object|null} target  the first target snapshot
 */
function finisherStateOf(actor, target) {
  const pool = (actor?.system?.momenta ?? []).find(p => p.name === "comboPoints") ?? null;
  const marked = namesTarget(actor?.getFlag?.("azeroth-rpg", DEATH_MARK_FLAG) ?? null, target);
  return finisherOffer(pool, finisherOptionsFor(actor.takenTalents()), { marked });
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
 * Whether any character in the world holds 04's Foresight and 02's Ward (D-779):
 * an attack card offers a Foresight Ward only where somebody could press it.
 */
function foresightHeld() {
  return (game.actors?.contents ?? []).some(a => a.type === "character" && a.hasFeature?.("Ward") && foresightFor(a.takenTalents?.() ?? []));
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
function parryOffered(rows = [], { actor = null, list = [], strike = null } = {}) {
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
  }).filter(row => row?.block || row?.parry);
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
  // **WHICH SPELL CARD'S RESIST THIS TEST ANSWERS** (D-726): the row, the
  // creature and the cast, as `rules/records.mjs#resistLink` builds them.
  // Named here on purpose - `rollResilience` hands its caller's keys on with
  // `...rest`, and a key this list does not name is dropped without a word.
  resistOf = null,
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
  secondRoll = false
} = {}) {
  // The targets, read once and first: the Finisher and the riders are judged
  // against the first before anything is spent (D-773).
  const list = targets ?? (target ? [target] : []);
  const first = target ?? list[0] ?? null;
  // **WHETHER THIS ATTACK IS MADE WHILE HIDDEN** (D-773), read before the reveal
  // below takes the Hide: Find Weakness, Waylay, Subterfuge, Shadow Focus and
  // Cheap Shot all ask it. A Parry is no attack.
  const hiddenAtRoll = kind === "attack" && !parry ? isHidden(actor) : false;
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
    ? (actor?.riderLines?.({ weapon: strike?.rangeKind ?? null, opening: openingGate(actor?.openingState?.(first, { hidden: hiddenAtRoll }) ?? null, first) }) ?? [])
    : [];
  const primedLines = riderLinesNow.filter(l => l.primed);
  const primedIds = primedLines.map(l => l.identifier);
  const riderPicks = riderAttack && Array.isArray(riders) ? [...new Set(riders.filter(id => id && !primedIds.includes(id)))] : [];
  let plan = null;
  if (riderPicks.length) {
    const lines = riderLinesNow;
    const projected = (actor?.poolSnapshot?.() ?? []).map(p => ({ ...p }));
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
    const writes = riderPicks.map(id => lines.find(l => l.identifier === id)).filter(Boolean)
      .some(line => riderWritesOnTarget(line, { tier: actor?.system?.tier ?? 1 }));
    if (writes && gmAbsentForActors(list.map(t => targetActorOf(t)))) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
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
  const finisherNow = kind === "attack" && (finisherSpent > 0 || finisherFree) ? finisherStateOf(actor, first) : null;
  if (finisherFree && !finisherNow?.free) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Finisher.MarkGone", { talent: finisherFree }));
    return null;
  }
  // **WHAT THE WARRIOR'S AND THE PALADIN'S TALENTS READ AT AN ATTACK** (D-772),
  // off the taken rows once: the Head's called shot, the off hand's −2, a
  // Critical Injury against a hurt target, a condition at an SL, Reckless, an
  // extra attack off the card. And the next attack's promise (Precise Strike,
  // Follow Through, Vengeance), read now and TAKEN once the attack is paid for.
  const talentsHeld = kind === "attack" ? actor.takenTalents() : [];
  const promised = riderAttack ? (actor?.pendingNextAttack?.() ?? null) : null;
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
  if (fight && !bossAction && budget !== "none") {
    const combatant = fight.getCombatantsByActor(actor)?.[0] ?? null;
    if (combatant) {
      const spent = await combatant.spendAction(budget ?? "half", { isAttack: true, isOffHand: offHand });
      if (!spent.ok) return null;
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
  if (kind === "attack" && !parry) await reveal(actor, { acting: true });
  // Pay first, everything judged above: one marked off the bundle (08 §7,
  // D-407), then the Momentum off the primary pool (06 SS7) before any die is
  // rolled.
  let fired0 = null;
  if (bundle) {
    const remaining = spendShot(bundleLeft);
    await bundle.update({ "system.quantity": remaining });
    fired0 = { itemId: bundle.id, name: bundle.name, remaining };
  }
  // **OFF THE POOL AS IT STANDS NOW** (the D-770 review, item D): the pool read
  // for the judgement was read before the budget's queued spend and the reveal,
  // and writing `value - spent` off THAT wrote over anything that moved it in
  // between. Read again here; a pool that fell below the price pays what it
  // holds - the Finisher's rule below - because the Half-Action is spent.
  if (momentumSpent > 0 && momentumPool) {
    const payer = momentumPayerNow?.actor ?? actor;
    // A creature's snapshot holds its Power and its Momentum both at itemId null and
    // name null (D-637), so the kind is what tells them apart.
    const momentumNow = (payer.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.itemId === momentumPool.itemId && p.name === momentumPool.name) ?? momentumPool;
    await payer.updatePool({ itemId: momentumPool.itemId, kind: "momentum", value: Math.max(0, (Number(momentumNow.value) || 0) - momentumSpent) });
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
  if (finisherNow) {
    const combo = (actor?.system?.momenta ?? []).find(p => p.name === "comboPoints") ?? null;
    const paidPoints = finisherFree ? 0 : Math.min(Math.trunc(Number(finisherSpent)) || 0, combo?.value ?? 0);
    if (paidPoints > 0) await actor.updatePool({ itemId: combo.itemId, kind: "momentum", value: combo.value - paidPoints });
    finisherCounted = finisherFree ? finisherNow.counts : paidPoints;
    if (finisherMode === "bleeding" && finisherNow.bleeding) finisherBleeding = ruptureBleeding(finisherNow.bleeding, finisherCounted);
    else finisher = finisherCounted;
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
  const settled = settleRiders({ paid: paidNow }, { pools: actor?.poolSnapshot?.() ?? [] });
  if (settled.writes.length) await actor.updatePool(settled.writes);
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

  const roll = AzerothRoll.build({
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

  // **TRUESHOT** (D-773): a hit at a set SL without a roll, carried on the
  // options so the card read back off its message says the same.
  if (forced !== null) {
    roll.options.forcedSl = forced;
    roll.options.provenance.push({ label: forcedBy, value: null, formula: game.i18n.format("AZEROTH.Card.Forced", { n: forced }) });
  }
  // **WHAT AN ATTACK FROM HIDING IGNORES** (04's Find Weakness, D-773) and
  // Piercing Shot's Pierce, each named on the card beside the next attack's.
  const hiddenRow = hiddenAtRoll ? hiddenAttackFor(talentsHeld) : { pierce: 0, loseReaction: false, by: [] };
  const talentPierce = riderPierceN + hiddenRow.pierce;
  if (riderPierceN > 0) roll.options.provenance.push({ label: riderPaidAll.filter(p => p.line?.onHit?.pierce).map(p => p.name).join(", "), value: null, formula: game.i18n.format("AZEROTH.NextAttack.PierceRow", { n: riderPierceN }) });
  if (hiddenRow.pierce > 0) roll.options.provenance.push({ label: hiddenRow.by.join(", "), value: null, formula: game.i18n.format("AZEROTH.NextAttack.PierceRow", { n: hiddenRow.pierce }) });
  // Keen's wider Critical Injury (08 §5).
  if (weaponEffects?.criticalOn && weaponEffects.criticalOn < 20) roll.options.criticalOn = weaponEffects.criticalOn;
  // **EXECUTIONER** (04: *You inflict a Critical Injury on 19 or 20 against a
  // target below half Health. At rank 2 this applies below three quarters*;
  // D-772): off the target's Health as the snapshot took it, the wider of this
  // and the weapon's own Keen. Never on a Parry, which is no attack.
  // And 04's Deadeye (*While your Quarry is full*) and Master Duellist (*While
  // you are Engaged with exactly one enemy*), each gate read the one way (D-773).
  if (kind === "attack" && !parry) {
    const exec = criticalRangeFor(talentsHeld, { health: first?.health ?? null, pools: actor?.poolSnapshot?.() ?? [], facts: { engagedOne: engagedOne === true } });
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
  await roll.evaluate();
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
    if (landing?.landed) landedOnHit.push({ index, id: landing.id, landed: true, had: landing.had ?? null, prior: landing.prior ?? null });
    return landing;
  };
  for (const id of riderLost) {
    const line = riderLinesNow.find(l => l.identifier === id) ?? null;
    fired.push({ key: "rider", name: line?.name ?? id, text: riderReason({ key: RIDER_REFUSALS.once, params: { name: line?.name ?? id, pool: line?.pool ?? "", cost: line?.cost ?? 0, value: 0 } }) });
  }
  // **A RIDER PAID ONLY WHEN THE BLOW LANDS** (Bloodthirst, D-772): settled now,
  // off the pools as they stand after the die, and on a miss nothing is spent.
  const settledOnHit = outcome.success && paidOnHit.length
    ? settleRiders({ paid: paidOnHit }, { pools: actor?.poolSnapshot?.() ?? [] })
    : { paid: [], writes: [] };
  if (settledOnHit.writes.length) await actor.updatePool(settledOnHit.writes);
  const riderRows = [
    ...settled.paid.map(p => ({ ...p, primed: false })),
    ...(outcome.success ? settledOnHit.paid : paidOnHit.map(p => ({ ...p, spent: 0 }))).map(p => ({ ...p, primed: false })),
    ...primedLines.map(line => ({ identifier: line.identifier, name: line.name, pool: line.pool, spent: line.cost ?? 0, line, primed: true }))
  ];
  for (const p of riderRows) {
    const done = outcomeOfLine(p.line, { hit: outcome.success, spent: p.spent, tier: actor?.system?.tier ?? 1, sl: outcome.sl });
    const lay = riderConditions(done);
    // **THE STRIKER'S CLOCK AND WHAT THE CONDITION CARRIES** (D-773): Concussive
    // Shot's *until your next turn* is the striker's next turn start, keyed on the
    // striker's combatant (D-628's rule for a clock that is somebody else's); out
    // of a fight it holds as a hand-laid condition does. Garrote's Bleeding
    // carries *cannot cast while that Bleeding lasts* on its own effect.
    const riderSpan = done.until === "strikerTurnStart" ? untilNextTurn(actor) : null;
    const riderMarks = done.noCasting ? { [NO_CASTING_FLAG]: { source: p.name } } : {};
    let landed = null;
    if (lay.length && list.length) {
      landed = [];
      for (const [ti, t] of list.entries()) {
        const victim = targetActorOf(t);
        for (const c of lay) {
          const own = c.id === done.condition?.id;
          landed.push(recordLanding(ti, await inflictCondition({ victim, id: c.id, value: c.value, by: actor, name: t?.name ?? "", until: riderSpan, marks: own ? riderMarks : {} })));
        }
      }
    }
    // Concussive Shot's rank 2 (*it also loses its Reaction*), through the
    // combatant's own queued door (D-761) on the GM's client where needed.
    if (done.loseReaction && list.length) {
      const lost = [];
      for (const t of list) lost.push(reactionLossText(await loseReaction({ victim: targetActorOf(t), by: actor, name: t?.name ?? "" })));
      fired.push({ key: "rider", name: p.name, text: lost.join(" ") });
    }
    // Wing Clip's *Speed drops 10 feet per rank until your next turn*: a span
    // only a fight has; out of one the drop is the table's, and said so.
    if ((done.speedDrop ?? 0) > 0 && list.length) {
      const span = untilNextTurn(actor);
      const words = [];
      for (const t of list) {
        if (!span) { words.push(game.i18n.format("AZEROTH.SpeedDrop.NoFight", { name: t?.name ?? "", feet: done.speedDrop })); continue; }
        const dropped = await laySpeedDrop({ victim: targetActorOf(t), feet: done.speedDrop, source: p.name, by: actor, span, name: t?.name ?? "" });
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
      for (const t of list) noHealing.push(await layNoHealing({ victim: targetActorOf(t), striker: actor, source: p.name, name: t?.name ?? "" }));
    }
    // **A BANE ON THE TARGET'S NEXT TEST** (04's Stormstrike: *takes a Bane on its
    // next attack. At rank 2 it takes two Banes*; D-774), landing with the blow as
    // a rider's condition does (the lead: *"Lands automatically"*), through 06
    // §6's door - a count, spent by that creature's next Test of the kind.
    const banedOn = [];
    if (outcome.success && done.bane && list.length) {
      for (const t of list) {
        const victim = targetActorOf(t);
        if (victim && await layBane({ victim, kind: done.bane.kind, banes: done.bane.banes, source: p.name, by: actor })) banedOn.push(t?.name ?? victim.name);
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
    for (const c of buttons.slice(1)) fired.push({ key: "rider", name: p.name, text: game.i18n.localize("AZEROTH.Rider.Card.Prone"), condition: c });
    if (done.damage) riderDamageRows.push({ name: p.name, amount: done.damage, type: done.damageType ?? null });
  }
  // **A CONDITION AN ATTACK LAYS AT AN SL** (04's Deep Cut: *When an attack of
  // yours reaches SL 2, the target gains Bleeding equal to your rank*; D-772):
  // with the blow, as a rider's condition lands (the lead, 2026-10-03: *"Lands
  // automatically"*), and a button where the card records no target.
  if (kind === "attack" && !parry) {
    for (const hit of hitConditionsFor(talentsHeld, { sl: outcome.sl, hit: outcome.success })) {
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
        fired.push({
          key: "talent", name: row.name,
          text: game.i18n.format("AZEROTH.Intimidation.Card", { n: row.bane.rounds, banes: row.bane.banes }),
          intimidate: { index, resilience: row.resilience, label: AZEROTH.resiliences[row.resilience], dc: companionOwner.system?.spellDC ?? null }
        });
      }
    }
  }
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
  // **RUTHLESSNESS** (04: *When your Finisher class feature reaches SL 2, 1 Combo
  // Point per rank returns to you*; D-773), on a Finisher that counted.
  if (finisherCounted > 0 && finisherNow?.back && outcome.success && outcome.sl >= finisherNow.back.sl) {
    const combo = (actor.poolSnapshot?.() ?? []).find(p => p.name === "comboPoints") ?? null;
    if (combo) {
      const value = Math.min(combo.max, combo.value + finisherNow.back.amount);
      if (value > combo.value) await actor.updatePool({ itemId: combo.itemId, kind: combo.kind, value });
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
  const talentRating = Math.max(0, Math.trunc(Number(extraRating)) || 0) + finisher + (damage ? promisedDamage : 0) + charged;
  if (damage) {
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
  }
  const mitigate = t => resolveDamage({
    rating: (damage.rating ?? 0) + extraDamage + talentRating,
    sl: outcome.sl,
    kind: damage.kind ?? "physical",
    school: damage.school ?? null,
    location: location ?? "body",
    apByLocation: t?.apByLocation ?? {},
    // And the Armor Points the next attack was promised it ignores (04's
    // Precise Strike, D-772), on the blow's own Pierce - and what Piercing Shot
    // and an attack from hiding ignore (D-773).
    penetration: (damage.penetration ?? 0) + promisedPierce + talentPierce,
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
    extras: typedExtras, wardBySchool: t?.wardBySchool ?? {}, schoolArmorBySchool: t?.schoolArmor ?? {}
  });
  const hit = Boolean(damage) && outcome.success;
  const damageByTarget = list.map(t => (hit ? mitigate(t) : null));
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
        hidden: hiddenAtRoll,
        critical: outcome.critical === true && !parry,
        bleedingDealt: hit && list.some((t, i) => (t?.statuses ?? []).includes("bleeding") && (damageByTarget[i]?.damage ?? 0) > 0)
      };
      const further = !offHand && combatant.isOwner
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
          const gainArgs = { pools: actor.poolSnapshot?.() ?? [], sl: outcome.sl, offHand, againstMark, inForm, extra: fastDue ? weaponEffects.fastMomentum : 0, always: signatureMomentum, poolExtra };
          if (!furtherGains(gainArgs, f.pool, f.amount)) {
            poolExtra[f.pool] = Math.max(0, (poolExtra[f.pool] ?? 0) - f.amount);
            continue;
          }
          const marked = await combatant.markRoundOnce(f.identifier);
          if (!marked?.added) {
            poolExtra[f.pool] = Math.max(0, (poolExtra[f.pool] ?? 0) - f.amount);
            continue;
          }
        }
        furtherGiven.push(f);
      }
      // A Signature's own point rides `always` and NOT `extra` (Dal'Rend's
      // Sacred Charge, D-696): 06 §2 refuses an off-hand blow every other kind
      // of Momentum, and this Signature names the off hand as the thing it pays
      // for. The row's once-a-round mark was already spent above, so anything
      // still on `fired` is due.
      momentumGained = gainOnHit({ pools: actor.poolSnapshot?.() ?? [], sl: outcome.sl, offHand, againstMark, inForm, extra: fastDue ? weaponEffects.fastMomentum : 0, always: signatureMomentum, poolExtra });
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
        if (!offHand) await combatant.setFlag("azeroth-rpg", "lastHitRound", fight.round);
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
      const built = gainOnHit({ pools: (companionOwner.poolSnapshot?.() ?? []).filter(p => p.name === "quarry"), sl: outcome.sl, againstMark: namesTarget(ownerMark, first) });
      if (built.length) {
        await companionOwner.updatePool(built.map(g => ({ itemId: g.itemId, kind: g.kind, value: g.value })));
        roll.options.provenance.push({ label: shared.name, value: null, formula: game.i18n.format("AZEROTH.Card.SharedQuarry", { n: built[0].gained, name: companionOwner.name }) });
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
          explanation: damageExplanation(damageResult, { ...damage, rating: (damage.rating ?? 0) + extraDamage + talentRating, penetration: (damage.penetration ?? 0) + promisedPierce + talentPierce }, outcome.sl)
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
    reactions: (kind === "attack" && !parry && outcome.success && damageResult ? parryOffered(reactions, { actor, list, strike }) : []),
    // **A WARD PRESSED FROM THIS CARD** (04's Foresight; the lead, 2026-10-03, on
    // O-181: *"Yes"*; D-779): a magical blow that landed offers a priest holding the
    // talent 02's Ward on each creature struck - shown to that priest's owner alone
    // (`dice/chat.mjs`) and offered only where such a priest exists.
    foresight: (kind === "attack" && !parry && outcome.success && damageResult && damage?.school && AZEROTH.schools[damage.school] && foresightHeld())
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

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    // Maim draws the Critical Injury on the Limb table whatever the blow struck (08 §5).
    flags: { "azeroth-rpg": { kind, location: criticalLocation ?? location, struck: location, damage: damageResult, targets: list, damageByTarget, momentumSpent, offHand,
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
      // holds takes it back off (`applications/actions.mjs#parryNow`).
      ...(landedOnHit.length ? { landedOnHit } : {}),
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
      ...(resisted ? { resistOf: resisted } : {}) } }
  });
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
  const stale = actor.effects.filter(e => e.getFlag("azeroth-rpg", EXPOSED_FLAG)).map(e => e.id);
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
function damageExplanation(result, damage, sl) {
  const e = explainDamage(result, { rating: damage.rating ?? 0, sl });
  if (e.immune) return game.i18n.localize("AZEROTH.Card.Immune");
  const sum = e.parts
    .map((p, i) => (i === 0 ? String(p.n) : `${p.sign === "-" ? "−" : "+"} ${p.n}`))
    .join(" ");
  const bits = [sum];
  if (e.vulnerable) bits.push(game.i18n.localize("AZEROTH.Card.Vulnerable"));
  else if (e.note?.kind === "ward") bits.push(game.i18n.format("AZEROTH.Card.VsWard", { ward: e.note.ward }));
  else if (e.note?.kind === "pierce") {
    bits.push(`${game.i18n.format("AZEROTH.Card.VsAP", { ap: e.note.ap })} ${game.i18n.format("AZEROTH.Card.PierceNote", { pierce: e.note.pierce })}`);
  } else if (e.note?.kind === "armor") bits.push(game.i18n.format("AZEROTH.Card.VsAP", { ap: e.note.ap }));
  // An ally's aura after the Ward (D-755), named rather than folded in.
  if (e.schoolArmor) bits.push(game.i18n.format("AZEROTH.Card.VsAuraArmor", { ap: e.schoolArmor }));
  // And each second amount of its own type (D-777).
  const parts = partsWords(e.extras);
  if (parts) bits.push(parts);
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
  const cost = { half: "half", action: "action", full: "full", reaction: "reaction" }[action] ?? null;
  if (!cost) return null;
  const fight = actor?.activeFight?.() ?? null;
  if (!fight) return null;
  const combatant = fight.getCombatantsByActor(actor)?.[0] ?? null;
  if (!combatant) return null;
  const judged = judgeSpend(combatant.budget, cost, { onTurn: combatant.isCurrentTurn });
  return judged.ok ? null : { reason: judged.reason, params: judged.params ?? {} };
}

export async function spendTurnBudget(actor, action) {
  const cost = { half: "half", action: "action", full: "full", reaction: "reaction" }[action] ?? null;
  if (!cost) return true;
  const fight = actor?.activeFight?.() ?? null;
  if (!fight) return true;
  const combatant = fight.getCombatantsByActor(actor)?.[0] ?? null;
  if (!combatant) return true;
  const spent = await combatant.spendAction(cost);
  return spent.ok;
}

export async function castSpell({
  actor,
  spell,
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
  // **WHAT A TALENT'S COUNTER OR CHARGE BUYS ON THIS CAST** (D-774): the
  // identifiers the roller ticked - Inner Focus's free Mana, Lava Burst's Ward
  // ignored, Static Charge's tier - judged again here before anything is spent.
  talentLines = []
} = {}) {
  const sys = spell.system;
  const school = sys.school;
  const classes = (actor?.classItems ?? []).map(c => ({
    itemId: c.id, schools: c.system?.schools ?? [], castingAbility: c.system?.castingAbility ?? null
  }));
  const grant = grantingClass(classes, school);
  const ability = grant?.castingAbility ?? null;
  const abilityMod = ability ? (actor.system.abilities?.[ability]?.mod ?? 0) : 0;
  const proficiency = actor.system.proficiency ?? 0;
  const list = targets ?? [];
  const first = list[0] ?? null;

  // 1. **EVERY REFUSAL, BEFORE ANYTHING IS SPENT** (D-768; the lead,
  // 2026-10-03, asked *does the caster keep the Half-Action?*: *Keeps the
  // Half-Action*). The budget was spent and the Hide ended first, and the Mana,
  // the form and the Health price were asked after, so a cast refused for a
  // short pool cost the Half-Action and the cover for nothing.
  // `rules/casting.mjs#castRefusal` asks all three; nothing below it refuses.
  const powers = actor.system.powers ?? [];
  const pool = powers.find(p => p.name === "mana" && grant && p.itemId === grant.itemId)
    ?? powers.find(p => p.name === "mana") ?? null;
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
  const discount = viaItem || free ? { amount: 0, by: [] } : spellDiscountFor(talentsNow, { school, mana: sys.mana ?? 0, states: veinsStates(flaggedEffects(actor, VEINS_FLAG).map(r => r.flag)) });
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
  // **INNER FOCUS** (04: *a spell or feature requiring a Casting Test costs no
  // Mana*; D-774): nothing to pay, and its use struck once the cast is paid for.
  const manaBase = freeLine ? 0 : manaDue;
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
  const price = manaPrice(mana, { inShapeshiftForm: inForm });
  // 04's Garrote (D-773): *cannot cast while that Bleeding lasts* - the
  // Bleeding's own effect carries the mark, so it ends with the Bleeding.
  const noCasting = noCastingFrom((actor.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"] ?? {}));
  const refused = castRefusal({ mana, pool, inForm, ferocity, health, overchannelHealth: oc.health, spellHealth, noCasting });
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
  let castAction = free ? null : sys.action;
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

  // **04's DIVINE AEGIS** (*When your healing restores a target to full Health, it
  // gains Ward 1 of a number of schools equal to your rank*; the lead, 2026-10-03, on
  // O-183: *"The caster"*; D-779): a healing spell's caster names the schools now,
  // through the one chooser, before anything is spent - the card and its tick carry
  // them to the one healing door. A chooser dismissed casts the spell carrying none,
  // said in words. An item's casting is the caster's spell too (READING).
  const aegisNamed = await nameAegisSchools(actor, { heals: isHealingSpell(sys), name: spell.name });

  // 1b. The turn's budget, in a fight (2026-09-06): the spell's Action line, or
  // the rung Nature's Swiftness casts it at (D-771). Asked once every refusal
  // has passed, so a refusal leaves the Half-Action.
  if (!(await spendTurnBudget(actor, castAction))) return null;

  // 1c. **A CAST ENDS A HIDE** (D-717), before the Mana is paid: the budget
  // has already agreed the cast happens, so from here it is being made
  // whatever the Test does. Quiet where nothing is hidden. A cast is an action
  // (D-773): Master of Shadows and a Shadow Dance leave the Hide standing.
  await reveal(actor, { acting: true });

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
  } else if (Object.keys(extra).length) await actor.update(extra);
  // Nature's Swiftness's use, struck once the cast is paid for (D-771).
  const castSwift = (Boolean(swiftCounter) || Boolean(swiftRow?.perRound)) && !free && castAction !== sys.action;
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

  // 2b. 07 §8: casting a tier 5 Fel or Shadow spell accrues 1 point of
  // Corruption on its own track. Here, with the Mana, because CASTING is what
  // charges — a failed Casting Test still spends the Mana (D-301), so the
  // spell was cast either way. Unresisted: 10 §3 puts this among the
  // occasions *agreed to rather than suffered*, so there is no Test.
  await accrueCastingCorruption(actor, spell);

  // **WHICH CAST THIS IS** (D-724): one key the card, the Sustain entry and
  // everything later laid or placed from the card all carry. It is generated
  // here and is NOT the message id, for four reasons. The Sustain entry below
  // is written before the card exists. Creating the card first would change
  // what a Sustain's own tests wait on, and would lose the Sustain the Mana has
  // already paid for if the card's creation threw. A message made with a fixed
  // `_id` and `keepId` overwrites rather than locks (D-721). And the key has to
  // outlive the card: a GM clearing the chat mid-fight must not orphan a
  // Blizzard somebody is still holding.
  const cast = foundry.utils.randomID();

  // 3. The Test.
  const modifiers = [];
  if (ability) modifiers.push({ label: AZEROTH.abilities[ability], value: abilityMod });
  modifiers.push({ label: "AZEROTH.Sheet.Proficiency", value: proficiency });
  if (Number(augment)) modifiers.push({ label: "AZEROTH.Cast.Augment", value: Number(augment) });
  // **THE DC THE ENTRY STATES, OR A TALENT RESTATES** (07: *Make a Casting Test
  // against DC 26*; 04's Sunfire and Cataclysm: *against DC 22 rather than 26*;
  // D-775), where no dialog handed one in. An item's casting reads the entry's own
  // DC through the same reader (the architect's review); a talent's restatement is
  // the caster's, and reaches none of an item's casting, as nothing else does.
  const statedDc = (viaItem ? null : spellDcFor(talentsNow, { name: spell.name })) ?? statedCastingDC(sys.effect);
  const resolvedDC = dc ?? statedDc ?? castingDC({ tier: sys.tier, targetDefense: first?.defense ?? null });
  const roll = AzerothRoll.build({
    dc: resolvedDC, modifiers, boons, banes, kind: "casting", rollData: actor.getRollData()
  });
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
  const outcome = roll.outcome;
  // 06 §6 (D-693): Pummel's two Banes land on *the next Casting Test it
  // makes*, and this is that Test. Spent after the die, whatever the roller
  // did with the dialog's line.
  const pummelled = await spendLaidBanes(actor, "casting");
  if (pummelled.length) {
    roll.options.provenance.push({ label: "AZEROTH.Modifier.LaidBane", value: null, formula: pummelled.join(", ") });
  }
  // And a Boon somebody laid (04's Blessing, D-772): spent the same way.
  const blessed = await spendLaidBoons(actor, "casting");
  if (blessed.length) {
    roll.options.provenance.push({ label: "AZEROTH.Modifier.LaidBoon", value: null, formula: blessed.join(", ") });
  }
  const success = outcome.success;
  // **ASCENDANCE** (04: *your Fire and Nature damage spells count as reaching one
  // SL higher until your next turn*; D-774): the SL everything after the die
  // reads, never whether the Test succeeded (MY READING, for the lead).
  const ascended = flaggedEffects(actor, ASCEND_FLAG)[0]?.flag ?? null;
  const testSl = overchannelledSL(outcome.sl, oc.points);
  const sl = ascendedSl(testSl, { school: sys.damage?.school ?? school, damages: sys.damage?.rating !== null && sys.damage?.rating !== undefined, success, ascended });
  if (sl !== testSl) roll.options.provenance.push({ label: ascended?.source || "AZEROTH.Ascendance.Label", value: null, formula: game.i18n.format("AZEROTH.Ascendance.Row", { n: sl - testSl }) });
  // **A STATIC CHARGE** (04: *When a Casting Test you make meets or exceeds SL 2,
  // you gain a Static Charge*; D-774).
  if (!viaItem && await gainCharge(actor, sl)) roll.options.provenance.push({ label: "AZEROTH.TalentLine.ChargeGained", value: null, formula: game.i18n.format("AZEROTH.TalentLine.ChargesNow", { n: Number(actor.getFlag("azeroth-rpg", CHARGE_FLAG)) || 0 }) });
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
  const graces = nextSpellGrants(talentsNow, { on: "casting", sl }).filter(g => !g.cast || talentUsesLeft(actor, g.source) > 0);
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
  const ratingFor = t => (rider ? riderRating(rider, sys.damage.rating, t?.statuses ?? []) : { rating: sys.damage?.rating ?? null, applied: false });
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
  const mitigate = (t, forced = null, { typed = true } = {}) => {
    const read = immuneReadAsWard({ immune: t?.immune ?? [], ward: Math.max(0, (t?.wardBySchool?.[damageSchool] ?? 0) - wardPierce), school: damageSchool, asWard });
    return resolveDamage({
      rating: forced ?? (rating === null ? 0 : ratingFor(t).rating + extras), sl, kind: "magical", school: damageSchool,
      ward: read.ward,
      // An ally's aura, after the Ward (04's Avenging Bulwark, D-755).
      schoolArmor: t?.schoolArmor?.[damageSchool] ?? 0,
      immune: read.immune, vulnerable: t?.vulnerable ?? [],
      slAddsToDamage: false,
      extras: typed ? typedSpell : [], wardBySchool: t?.wardBySchool ?? {}, schoolArmorBySchool: t?.schoolArmor ?? {}
    });
  };
  // **AN AREA THAT STRIKES AT THE START OF A TURN DEALS NOTHING ON THE CAST**
  // (D-756; the lead's play-test): 07's Consecration lands its 2 Holy on an
  // enemy that STARTS ITS TURN inside, and the card applied it to whoever was
  // targeted when the Paladin cast. The tick carries it now, and the card
  // offers no damage, no Apply and no rider for it.
  const hit = rating !== null && success && castDealsDamage(sys);
  // **A STATIC CHARGE SPENT ON THIS DAMAGE** (04: *When you deal damage you may
  // spend a Static Charge to add your tier to that damage*; D-774): where the
  // spell deals it, off the flag as it stands now.
  const charged = hit && chargeLine && await spendCharge(actor) ? chargeLine.amount : 0;
  if (charged) roll.options.provenance.push({ label: chargeLine.name, value: charged });
  const damageByTarget = list.map(t => (hit ? mitigate(t, charged ? (ratingFor(t).rating ?? 0) + extras + charged : null) : null));
  const damageResult = hit ? (damageByTarget[0] ?? mitigate(null, charged ? (rating ?? 0) + charged : null)) : null;
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
  const dropNow = hit && !viaItem ? speedDropAt(speedRead, { sl, success }) : { feet: 0, slowed: false };
  if ((dropNow.feet > 0 || dropNow.slowed) && list.length) {
    const span = untilEndOfNextTurn(actor);
    const slowing = dropNow.slowed ? slowingFor(talentsNow) : null;
    for (const t of list) {
      const victim = targetActorOf(t);
      const name = t?.name ?? victim?.name ?? "";
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
  const riderByTarget = rider && hit ? list.map(t => (ratingFor(t).applied ? null : mitigate(t, riderForced).damage)) : [];
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
    ...(plagued && extendedTick.kind === "damage" ? { doubled: plague?.landings ?? 2 } : {}),
    ...(aegisNamed && extendedTick.kind === "heal" ? { aegis: aegisNamed } : {}),
    ...(take.miracle && extendedTick.kind === "heal" ? { unreduced: true } : {})
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
  const applies = (sys.applies?.active || laidTick || floor) && success && !areaCarriesSpell(sys) ? {
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
  // **A FAILED CAST OFFERS NO RESIST** (the lead, 2026-09-26; 07 §8: *A failed
  // Casting Test costs the Mana and nothing else. The spell does not go off*).
  // There is nothing to resist, so the card draws no row and no button, and
  // says in words why (`didNotGoOff`); a Resist pressed on a card written
  // before this is refused at the door (`dice/chat.mjs#resistTestFromCard`).
  const resist = success && sys.test?.resilience
    ? { key: sys.test.resilience, label: AZEROTH.resiliences[sys.test.resilience], dc: spellDC }
    : null;
  // **ONE RESIST ROW PER RECORDED TARGET** (07 §2, D-616, D-726). The Test is
  // the TARGET's to make and the card is the caster's, so each row names its
  // creature's uuid and `dice/chat.mjs` shows it to that creature's owner and
  // the GM and to nobody else. Every row carries whole what the template
  // draws: a bare name inside `#each` resolves against the row (D-609).
  // With no target recorded the card draws the one button it always had.
  const resistRows = resist
    ? list.map((t, index) => ({
        index,
        name: t?.name ?? "",
        actorUuid: targetActorOf(t)?.uuid ?? "",
        key: resistKey(t),
        resilience: resist.key,
        label: resist.label,
        dc: resist.dc
      }))
    : [];
  // **WHAT A TALENT DOES TO THE AREA** (D-756): Consecrated Ground's rank 2
  // radius is 10 feet wider, so the card offers a *30 ft circle* and the Region
  // it places is that size; its Difficult ground rides the card to the Region
  // for Phase 2b. A cone and a line are never widened (`widenArea`).
  const spellArea = spellAreaFor(talentsNow, { name: spell.name });
  // And a cone a talent makes longer (04's Cone of Cold, D-775).
  const area = lengthenArea(widenArea(areaFor(sys.target ?? ""), spellArea.widen), spellArea.lengthen);
  // The area's tick, said on the card in words (D-756), and carried on it for
  // the Region to take.
  const areaTick = hasAreaTick(sys.areaTick) ? foundry.utils.deepClone(sys.areaTick) : null;
  const tickLine = areaTick ? areaTickLine(areaTick, { widen: spellArea.widen }) : null;
  // What a tick's standing bonuses are keyed by, carried beside it (the review,
  // S6): the Region's `spell` block, the Sustain entry and the laid effect all
  // take it, because a spell cast by name from the pack or through an item is
  // on no actor for the tick to read it back from.
  const tickSpell = { name: spell.name, school: school ?? null, tier: sys.tier ?? null, takesSpellpower: sys.takesSpellpower === true };

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
  if (success && sys.duration?.kind === "sustained" && pool) {
    const sustaining = foundry.utils.deepClone(actor.getFlag("azeroth-rpg", "sustaining") ?? []);
    sustaining.push({
      spellId: spell.id, uuid: spell.uuid, name: spell.name, itemId: pool.itemId,
      // WHICH CAST IS HELD, WHAT IT WAS AIMED AT AND WHO HOLDS IT (D-724): the
      // same `cast` the card carries, and the targets as ids alone - an entry
      // is a record of the moment, and the snapshot's Defense and Ward are the
      // card's business. An entry written before this carries none of the
      // four, and a reader takes that as nothing recorded.
      cast,
      identifier: sys.identifier ?? null,
      targets: list.map(t => ({ sceneId: t?.sceneId ?? null, tokenId: t?.tokenId ?? null, actorId: t?.actorId ?? null })),
      source: source ?? null,
      // A self-centred tick has no Region to carry it (Immolation), so the
      // entry does - read before the spell item, which a Spells line cast by
      // name from the pack never embeds (the review, S6).
      ...(areaTick?.centre === "self" ? { areaTick, tickSpell } : {}),
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

  const content = await renderTemplate(TEMPLATE.spell, {
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
    damage: damageResult ? { final: damageResult.damage, explanation: spellDamageExplanation(damageResult, (first ? ratingFor(first).rating + extras : rating) + charged) } : null,
    // Shatter's Critical Injury at rank 2 (D-775): the attack card's own button.
    criticalInjury: Boolean(spellCritical),
    riderApplied: rider && hit && first && ratingFor(first).applied ? riderContext?.conditions ?? null : null,
    rider: riderContext,
    applies,
    // The Resist Test's failure lands the conditions the entry names (2026-09-06).
    onFail: failStatuses.length ? failStatuses.map(id => game.i18n.localize(AZEROTH.conditions[id] ?? id)).join(", ") : null,
    heal,
    speakerName: actor.name,
    source: viaItem ? game.i18n.format("AZEROTH.Card.FromItem", { name: viaItem.name })
      : (free ? game.i18n.format("AZEROTH.Cast.FreeBy", { name: free.by ?? "" }) : null),
    resist,
    resistRows,
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
    crossLines: crossCardLines({ speedLines, forced, escape, undispellable }),
    targets: list.map((t, index) => ({ ...t, index, damage: damageByTarget[index]?.damage ?? null, healAmount: healByTarget[index] ?? null })),
    // **WHAT THE CARD OFFERS AFTER THE DIE** (D-774): Overload's second firing and
    // Ancestral Knowledge's Mana back, each a button that strikes a use.
    talentPresses,
    // A taken talent that names this spell or its school rides the card (D-642).
    talentNotes: await Promise.all(spellNotesFor(actor.takenTalents(), { name: spell.name, school })
      .map(async n => ({ name: n.name, effect: await enrich(n.effect) }))),
    provenance: roll.provenance
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    flags: {
      "azeroth-rpg": {
        kind: "spell",
        spellId: spell.id,
        // A compendium spell has no id on the actor, so carry the uuid too.
        spellUuid: spell.uuid,
        // WHAT WAS CAST, WHICH CAST, WHETHER IT WORKED AND WHO CAST IT (D-724).
        // `success` is this workflow's own verdict as it was decided above, so
        // a reader never re-derives it from the roll; `source` is the caster's
        // token and has nothing to do with the render context's `source`, which
        // is the *From item* line.
        identifier: sys.identifier ?? null,
        cast,
        success,
        source: source ?? null,
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
        targets: list,
        damageByTarget,
        riderByTarget,
        heal: heal?.amount ?? null,
        sl,
        overchannel: oc.points,
        // **WHAT D-779's ANSWERS CARRY TO THE DOORS AFTER THE CAST**: the schools
        // Divine Aegis was named for, Miracle's heal nothing reduces (both read by the
        // card's heal and its tick), and 07's Barrier's Ward on the creatures chosen
        // (`regionFlagsFromCard` copies it onto the area).
        ...(aegisNamed ? { aegis: aegisNamed } : {}),
        ...(take.miracle && success ? { miracle: true } : {}),
        ...(chosenWard ? { chosenWard } : {}),
        // What the card's buttons lay (2026-09-06): the effect, its timing, the failure's conditions.
        // A spell that lays only its tick lays an effect of no changes (D-770).
        // **WHAT A TALENT LAYS MORE OF** (04's Pain Suppression: *Each rank adds 1
        // to the damage it prevents*; D-774), laid over the spell's own changes.
        applies: sys.applies?.active
          ? { changes: appliesChanges, statuses: sys.applies.statuses ?? [] }
          : (laidTick || floor ? { changes: [], statuses: [] } : null),
        // **WHAT THE APPLY GRANTS AND LAYS BESIDE** (D-777): 05's temporary Health,
        // 07's floor, and whether the self heal keeps its overflow.
        temporaryHealth: temporary ? { amount: temporary.amount, source: spell.name } : null,
        floor: floor ?? null,
        healOverflow: heal?.overflow === true,
        // THE TICK THE APPLY LAYS (D-770), stamped at this cast: the number, the
        // hand, the spell and the cast, as `rules/ticks.mjs#layTick` made it.
        tick: laidTick,
        onFail: failStatuses.length ? { resilience: sys.onFail?.resilience ?? null, statuses: [...failStatuses] } : null,
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
function crossCardLines({ speedLines = [], forced = null, escape = null, undispellable = null } = {}) {
  const out = [];
  const label = key => game.i18n.localize(key);
  for (const text of speedLines) out.push({ label: label("AZEROTH.SpeedDrop.Label"), text });
  if (forced) {
    out.push({
      label: label("AZEROTH.Forced.Label"),
      text: game.i18n.format(`AZEROTH.Forced.CardLine.${forced.on}${forced.toward === "toward" ? "Toward" : "Away"}`, {
        feet: forced.feet, resilience: game.i18n.localize(AZEROTH.resiliences[forced.resilience] ?? forced.resilience ?? "")
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
async function gateCastingTest(actor, { dc }) {
  const casting = (actor.classItems ?? []).find(c => c.system?.castingAbility)?.system?.castingAbility ?? null;
  const modifiers = [];
  if (casting) modifiers.push({ label: AZEROTH.abilities[casting], value: actor.system.abilities?.[casting]?.mod ?? 0 });
  modifiers.push({ label: "AZEROTH.Sheet.Proficiency", value: actor.system.proficiency ?? 0 });
  // A Casting Test made while Engaged takes its Bane (06 §5), as every casting roll does.
  const engaged = engagedNow(actor);
  const roll = AzerothRoll.build({ dc, modifiers, boons: 0, banes: engaged ? 1 : 0, kind: "casting", rollData: actor.getRollData() });
  if (engaged) roll.options.provenance.push({ label: "AZEROTH.Dialog.Circumstance", value: null, formula: game.i18n.localize("AZEROTH.Modifier.EngagedCasting") });
  await roll.evaluate();
  return roll;
}

/**
 * Lift a spell's laid effects (D-657) from every actor the user can write:
 * the world's actors and the viewed scene's tokens, where the effect's
 * `spell` flag is the spell's uuid and its origin is the caster. What a
 * Sustain held ends with it (the lead, 2026-09-06; closes O-93).
 */
export async function liftSpellEffects(actor, spellUuid) {
  if (!spellUuid) return 0;
  const seen = new Set();
  const carriers = [];
  for (const a of game.actors ?? []) carriers.push(a);
  for (const token of canvas?.scene?.tokens ?? []) if (token.actor && !seen.has(token.actor.uuid)) carriers.push(token.actor);
  let lifted = 0;
  for (const carrier of carriers) {
    if (seen.has(carrier.uuid) || !carrier.isOwner) continue;
    seen.add(carrier.uuid);
    const ids = carrier.effects.filter(e => e.getFlag("azeroth-rpg", "spell") === spellUuid && (!e.origin || e.origin === actor.uuid)).map(e => e.id);
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
  const [ended] = sustaining.splice(index, 1);
  // **A TOKEN ACTOR WRITES AN EMPTY LIST** (the final review of D-757), as
  // `endAllSustains` below does: an unset on a synthetic actor's delta lets
  // the world actor's list show through, so the Stop dropped nothing.
  if (sustaining.length || actor.isToken) await actor.setFlag("azeroth-rpg", "sustaining", sustaining);
  else await actor.unsetFlag("azeroth-rpg", "sustaining");
  const spell = actor.items.get(ended.spellId) ?? null;
  await liftSpellEffects(actor, spell?.uuid ?? ended.uuid ?? null);
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
    if (actor.isToken) await actor.setFlag("azeroth-rpg", "sustaining", []);
    else await actor.unsetFlag("azeroth-rpg", "sustaining");
    for (const entry of held) {
      await liftSpellEffects(actor, actor.items.get(entry?.spellId)?.uuid ?? entry?.uuid ?? null);
      ui.notifications?.info(game.i18n.format("AZEROTH.Combat.SustainEnded", { name: actor.name, spell: entry?.name ?? "" }));
    }
    return held;
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
  foresight = null
} = {}) {
  const sys = item.system;
  const list = targets ?? [];
  const first = list[0] ?? null;
  // A talent's grant scales by the rank taken (D-642).
  const grantFlag = item.getFlag?.("azeroth-rpg", "feature") ?? {};
  const grantingTalent = grantFlag.talentId ? actor.items.get(grantFlag.talentId) ?? null : null;
  const rank = grantingTalent ? (grantingTalent.system?.taken ?? grantFlag.rank ?? 1) : (grantFlag.rank ?? 1);
  // The granting talent's row: a damage buff the Use switches on (D-711), and
  // what the Use does beyond its descriptor (D-771's `onUse`).
  const talentRow = grantingTalent
    ? talentEffect(grantingTalent.system?.className, grantingTalent.system?.identifier, grantingTalent.system?.race ?? null)
    : null;
  const onUse = onUseOf(talentRow);

  // 1. A use left?
  if (sys.uses?.per && sys.uses.value <= 0) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NoUses", { name: item.name }));
    return null;
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
  if (onUse?.mitigate) {
    const stands = standingMarkRefusal(actor.getFlag("azeroth-rpg", "mitigate") ?? null, { door: "use" });
    if (stands) {
      ui.notifications?.warn(game.i18n.format(stands.key, { name: actor.name, ...stands.params }));
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
  }
  // Taunt's and Judgement's Bane, and Blessing's Boon, land on ONE creature the
  // user has targeted (04: *A target that can see you*, *The target*, *A friendly
  // target you can see*). **Out of a fight too** (the lead, 2026-10-03, on O-161:
  // *"Player can use them at anytime if selected."*; D-778): the span - *until the
  // end of your next turn*, *one round per rank* - is then the world's clock
  // (`effects/durations.mjs#untilEndOfNextTurnOrRound`, `roundsOrClock`).
  const lays = onUse?.laysBane || onUse?.laysBoon ? onUseLays(onUse, rank) : { bane: null, boon: null };
  let laysOn = null;
  if (lays.bane || lays.boon) {
    const aimed = (targets ?? []).map(t => ({ t, actor: targetActorOf(t) })).filter(r => r.actor);
    if (aimed.length !== 1) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.OneTarget", { name: item.name }));
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
    laysOn = aimed[0];
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
    const held = boundOf(actor, sys.bound.kind);
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
  // is the table's (no door places a token).
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
    const apart = caster ? feetBetweenTokens(ownToken, tokenOfTarget(aimed[0])) : null;
    if (apart !== null && apart > COUNTERSPELL.feet) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.TooFar", { name: item.name, target: aimed[0].name ?? "", feet: COUNTERSPELL.feet }));
      return null;
    }
    const held = caster ? sustainsOf(caster) : [];
    if (held.length) {
      const pick = held.length === 1 ? { key: "0" } : await chooseOption(item, held.map((e, i) => ({ key: String(i), name: e.name, description: "" })), null, { prompt: game.i18n.format("AZEROTH.Spellsteal.Prompt", { target: caster.name }) });
      if (!pick) return null;
      if (gmAbsentForActors([caster])) {
        ui.notifications?.warn(game.i18n.localize("AZEROTH.Spellsteal.NoGM"));
        return null;
      }
      stealing = { caster, entry: held[Number(pick.key)] ?? held[0] };
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
    commanding = { target, name: aimed[0].name ?? target.name };
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
    const answer = await chooseOption(item, options, note, { max: allowed });
    picks = answer === null ? [] : (Array.isArray(answer) ? answer : [answer]);
    if (!picks.length) return null;
    chosen = picks[0];
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
    let boundRefused = false;
    for (const pick of binding ? picks : []) {
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
  const pool = poolFor(actor, payingPool(sys.cost?.pool ?? null, { inShapeshiftForm: inForm }), item.getFlag("azeroth-rpg", "feature")?.classId ?? null);
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
    ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NoPool",
      { name: item.name, pool: game.i18n.localize(AZEROTH.poolTypes[sys.cost.pool] ?? sys.cost.pool), amount: sys.cost.amount }));
    return undoBinds();
  }
  if (payment.refusal === "Short") {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NoPool",
      { name: item.name, pool: game.i18n.localize(AZEROTH.poolTypes[pool.name] ?? pool.name), amount: payment.spent }));
    return undoBinds();
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
  if (ps.walk && mine) {
    if (!(await mine.spendMoveAction()).ok) return undoBinds();
  } else if (!(await spendTurnBudget(actor, shiftFree ? null : (swiftLine ? "half" : (sys.action ?? null))))) return undoBinds();

  // 2. Pay: judged in 1e, so nothing here can be half done. **02's CURSE PAYS ON
  // ITS SUCCESS** (*make a Casting Test. On success, spend 4 Mana*; D-775): judged
  // here like any price - a Curse that could not pay on its success is refused
  // before anything is spent - and taken off once the Test has succeeded.
  const curseDue = curse && sys.casting ? payment.spent : 0;
  const spent = curseDue ? 0 : payment.spent;
  if (sys.cost?.pool) {
    // **OFF THE POOL AS IT STANDS NOW** (the final review of D-768 to D-775;
    // `rollTest`'s rule since D-770): the pool was read for the judgement before
    // the budget's queued spend and the free shift's mark, so it is read again by
    // item and kind, a gain landing in between kept, and one that fell short pays
    // what it holds (`casting.mjs#payFromNow`).
    const poolNow = (actor.poolSnapshot?.() ?? []).find(p => p.itemId === pool.itemId && p.kind === pool.kind && p.name === pool.name) ?? pool;
    if (spent > 0) await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: payFromNow(poolNow.value, spent).value });
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
  const buff = damageBuffFor(talentRow, rank);
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
    const timing = buff.until === "endOfNextTurn" ? untilEndOfNextTurnOrRound(actor) : null;
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
  // Survival Instincts: *reduce the damage of one attack against you by half,
  // rounded down* - the one-attack mark a Block and a Parry ride, spent by the
  // next attack that lands (`AzerothActor#applyDamage`) - *and gain 1 Ferocity
  // per rank*.
  if (onUse?.mitigate === "halve") {
    await actor.setFlag("azeroth-rpg", "mitigate", { name: item.name, halve: true, amount: null });
    usedLines.push(game.i18n.format("AZEROTH.Signature.WillHalve", { name: item.name }));
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
    swiftmended = await endTickAndHeal({ target: endsOn.target, from: actor, kind: "heal", heal: amount });
    usedLines.push(swiftmended?.ended
      ? game.i18n.format("AZEROTH.Swiftmend.Done", { name: endsOn.target.name, effect: swiftmended.ended.name, healed: swiftmended.healed })
      : game.i18n.format("AZEROTH.Swiftmend.NotEnded", { name: endsOn.target.name }));
  }
  // Symbiosis: *name a friendly target*, the bond until the next Long Rest.
  if (partner) {
    await nameSymbiosisPartner(actor, partner);
    usedLines.push(game.i18n.format("AZEROTH.Symbiosis.Line", { partner: partner.name }));
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
    await nameBeacon(actor, beaconPartner);
    usedLines.push(game.i18n.format("AZEROTH.Beacon.Line", { partner: beaconPartner.name }));
  }
  // Precise Strike: *Your next attack this turn ignores 1 Armor Point per rank*.
  if (onUse?.nextAttack && grantingTalent) {
    const grant = onUseNextAttack(onUse, { identifier: grantingTalent.system?.identifier, name: grantingTalent.name }, { rank, tier: actor.system.tier ?? 1 });
    const laid = grant ? await layNextAttack(actor, [grant], { quiet: true }) : [];
    usedLines.push(laid.length
      ? game.i18n.format(`AZEROTH.NextAttack.Laid.${grant.lasts}`, { name: actor.name, talent: grantingTalent.name })
      : game.i18n.format("AZEROTH.NextAttack.NoFight", { name: actor.name, talent: grantingTalent.name }));
  }
  // Taunt's and Judgement's Bane on attacks against anyone but the user, and
  // Blessing's Boon, on the one creature targeted.
  if (laysOn && lays.bane) {
    const own = actor.getActiveTokens?.(true)?.[0] ?? null;
    // **04's FEINT** (*The target's next attack against you takes a Bane per
    // rank*; D-773): a COUNT, spent by the target's next attack AGAINST the user
    // alone, its backstop the target's own next turn (`effects/banes.mjs`);
    // Taunt's and Judgement's last for their span.
    const only = lays.bane.only ? { actorId: actor.id, tokenId: own?.id ?? null } : null;
    // Out of a fight the span is the world's clock (D-778, O-161): Judgement's *one
    // round per rank* N rounds of it, Taunt's *until the end of your next turn* one,
    // and Feint's count its backstop one round where the target has no turn either.
    const span = only ? (laysOn.actor.activeFight?.() ? null : clockRounds(1)) : (lays.bane.rounds > 0
      ? roundsOrClock(actor, lays.bane.rounds)
      : untilEndOfNextTurnOrRound(actor));
    const done = await layBane({
      victim: laysOn.actor, kind: lays.bane.kind, banes: lays.bane.banes, source: item.name, by: actor, lasting: !only,
      except: lays.bane.except ? { actorId: actor.id, tokenId: own?.id ?? null } : null, only, span
    });
    if (done) usedLines.push(game.i18n.format(only ? "AZEROTH.Feint.Line" : "AZEROTH.Laid.BaneLine", { target: laysOn.actor.name, n: lays.bane.banes, name: actor.name }));
  }
  if (laysOn && lays.boon) {
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
        const test = await gateCastingTest(actor, { dc: gateDc });
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
  // 02's Blink: who moves and how far, said in words - placing the token is the
  // table's (no door moves a creature it does not walk).
  if (blink) {
    usedLines.push(blink.who
      ? game.i18n.format("AZEROTH.Blink.LineFriend", { name: blink.who.name ?? "", feet: blink.reach.feet, talents: blink.reach.by.join(", ") })
      : game.i18n.format("AZEROTH.Blink.Line", { name: actor.name, feet: blink.reach.feet }));
  }
  // Spellsteal: the Sustain chosen ends through the one door, on the GM's client
  // where the caster is another's.
  if (stealing) {
    const ended = await stealSustain({ caster: stealing.caster, entry: stealing.entry, by: actor });
    usedLines.push(game.i18n.format(ended ? "AZEROTH.Spellsteal.Line" : "AZEROTH.Spellsteal.NotEnded", { target: stealing.caster.name, spell: stealing.entry.name }));
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
  // class's pool of that kind, never past its cap.
  let gained = null;
  if (sys.gain?.pool && (sys.gain.amount ?? 0) > 0) {
    const pool = (actor.poolSnapshot?.() ?? []).find(p => p.kind === sys.gain.pool) ?? null;
    if (pool) {
      const amount = Math.max(0, Math.min(sys.gain.amount, pool.max - pool.value));
      if (amount > 0) await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.value + amount });
      gained = game.i18n.format("AZEROTH.Card.Gained", { amount, pool: game.i18n.localize(AZEROTH.poolTypes[pool.name] ?? pool.name) });
    }
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
      const made = await bind({ owner: actor, feature: item, entry, kind: "summon", until: sys.summons.until ?? "encounter", count: sys.summons.count });
      // The uuid rides it so the card can make the name a draggable link.
      if (made) called.push({ name: made.name, uuid: made.uuid ?? null, count: sys.summons.count });
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
  let sl = 0;
  let success = true;
  let resolvedDC = null;
  if (sys.casting) {
    const casting = (actor.classItems ?? []).find(c => c.system?.castingAbility)?.system?.castingAbility ?? null;
    const modifiers = [];
    if (casting) modifiers.push({ label: AZEROTH.abilities[casting], value: actor.system.abilities?.[casting]?.mod ?? 0 });
    modifiers.push({ label: "AZEROTH.Sheet.Proficiency", value: actor.system.proficiency ?? 0 });
    resolvedDC = dc ?? sys.dc ?? castingDC({ tier: actor.system.tier ?? 1, targetDefense: first?.defense ?? null });
    roll = AzerothRoll.build({ dc: resolvedDC, modifiers, boons, banes, kind: "casting", rollData: actor.getRollData() });
    roll.options.provenance.push(...provenanceExtra);
    await roll.evaluate();
    // A feature that makes a Casting Test is a Casting Test (06 §6, D-693).
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

  // 3a. **WHAT THE MAGE'S AND THE WARLOCK'S CASTING USES DO ON A SUCCESS** (D-775).
  // 02's Curse: *On success, spend 4 Mana* - judged at 1e, paid now; a failed Test
  // costs nothing and offers no Resist.
  // **A SUCCESS THE POOL CAN NO LONGER PAY LAYS NOTHING** (the architect's review
  // of D-775): Mana spent between the judgement and the success leaves the 4 short;
  // the Curse then pays nothing and forces no Test, said in words, rather than
  // taking what is left and cursing anyway.
  let cursePaid = 0;
  let curseShort = false;
  if (curseDue > 0 && success) {
    const now = actor.poolSnapshot?.().find(p => p.itemId === pool?.itemId && p.kind === pool?.kind) ?? null;
    curseShort = !now || now.value < curseDue;
    if (curseShort) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Curse.Short", { name: item.name, n: curseDue }));
      usedLines.push(game.i18n.format("AZEROTH.Curse.Short", { name: item.name, n: curseDue }));
    } else {
      cursePaid = curseDue;
      await actor.updatePool({ itemId: now.itemId, kind: now.kind, value: now.value - cursePaid });
    }
  } else if (curseDue > 0) usedLines.push(game.i18n.format("AZEROTH.Curse.Unpaid", { name: item.name }));
  // 04's Haunt: each tick of the warlock's on the target raised, and the heal its
  // death returns carried on them - through the GM's client where it is another's.
  if (haunting && success) {
    const raised = await hauntTarget({ target: haunting.target, by: actor, add: mw.haunt.add, heal: mw.haunt.heal });
    usedLines.push(game.i18n.format(raised > 0 ? "AZEROTH.Haunt.Line" : "AZEROTH.Haunt.NotRaised", { target: haunting.name, n: mw.haunt.add, heal: mw.haunt.heal, count: raised }));
  }
  // 04's Command Demon: the demon bound until the next Long Rest, counted against
  // nothing - D-649's adopt, through the GM's client where it is another's.
  if (commanding && success) {
    const held = await commandDemon({ owner: actor, actor: commanding.target, feature: featureForKind(actor, "demon") ?? item });
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

  // 4. The numbers, on success, at the rank taken (D-642) - and the Rating of
  // the weapon in the main hand, for 04's Wrath of the Light (*Holy damage at
  // your Damage Rating*; D-772), Unarmed's 1 with none.
  const scope = {
    tier: actor.system.tier ?? 1, level: actor.system.level ?? 1, sl, rank,
    weapon: weaponRatingOf((actor.readyWeapons?.() ?? []).map(w => ({ ...(w.system ?? {}) })))
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
  // **THE CONDITIONS THE CARD OFFERS ON EACH TARGET** (02's Hurricane, 04's
  // Typhoon at rank 2; D-771), on a Use that landed.
  // A condition offered from an SL (04's Pyroblast at rank 2; D-775) is offered
  // only where the Test reached it.
  const inflicts = success
    ? (sys.inflicts ?? []).filter(i => AZEROTH.conditions?.[i?.condition] && !(Number(i?.sl) > 0 && sl < Number(i.sl))).map(i => ({
        condition: i.condition,
        label: game.i18n.localize(AZEROTH.conditions[i.condition]),
        value: i.value ?? null,
        until: i.until ?? null,
        untilLabel: i.until ? game.i18n.localize(AZEROTH.untilKinds[i.until] ?? i.until) : null
      }))
    : [];
  let damage = null;
  let damageByTarget = [];
  // Why a feature's damage was what it was, for a card with no roll to carry it.
  const damageProvenance = [];
  if (success && sys.damage?.amount) {
    const base = evaluateAmount(sys.damage.amount, scope) ?? 0;
    const school = sys.damage.type ?? null;
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
    if (roll) roll.options.provenance.push(...damageProvenance);
    // What a standing effect adds to every blow of the feature's lane AS ITS OWN
    // TYPE (04's Arcane Power on a casting feature - the lead: *"Yes, casting
    // features count"*; D-777): a second amount, met by its own Ward.
    const featureTyped = typedLaneExtras(actor.system, featureDamageLane(sys));
    const mitigate = t => resolveDamage({
      rating, sl: 0, kind: "magical", school,
      ward: t?.wardBySchool?.[school] ?? 0,
      // An ally's aura, after the Ward (04's Avenging Bulwark, D-755).
      schoolArmor: t?.schoolArmor?.[school] ?? 0,
      immune: t?.immune ?? [], vulnerable: t?.vulnerable ?? [], slAddsToDamage: false,
      extras: featureTyped, wardBySchool: t?.wardBySchool ?? {}, schoolArmorBySchool: t?.schoolArmor ?? {}
    });
    damageByTarget = list.map(t => mitigate(t));
    const result = damageByTarget[0] ?? mitigate(null);
    // The Rating the mitigation took from, so `6 − 1` reads off the number the
    // lane and the lines made rather than the bare base (D-768).
    damage = { final: result.damage, explanation: spellDamageExplanation(result, rating) };
  }
  // A failed Casting Test forces no Resist (02's Curse: *On success ... force a
  // target ... to make a Spirit Resilience Test*; D-775), nor a Curse its pool
  // could no longer pay for.
  const resist = sys.resist && success && !curseShort
    // A CREATURE'S SPELL DC IS `system.spells.dc` (14 §1's `**Spells** (DC n)`
    // run); `system.spellDC` is the character's derived one and does not exist
    // on the other model. This was the third copy of the same read and the only
    // one left with no fallback: `castSpell` has had both since it was written
    // and `useSignature` was given them when a creature could first bear one.
    // It was unreachable while nothing could put a `feature` item on a creature
    // - and the Gear tab is exactly that door (the lead's N3), so a feature a
    // GM hands a creature would have posted a Resist button with no DC on it.
    ? {
        key: sys.resist, label: AZEROTH.resiliences[sys.resist], dc: actor.system.spellDC ?? actor.system.spells?.dc ?? null,
        // 02's Snare (D-773): with no trap damage on the card its Test IS the
        // caught creature's escape; with Explosive Trap's damage it is the half,
        // and the escape is a button of its own below.
        purpose: item.name === SNARE.feature && !damage ? "snare" : null
      }
    : null;
  const escape = item.name === SNARE.feature && damage && success
    ? { key: SNARE.resilience, label: AZEROTH.resiliences[SNARE.resilience], dc: actor.system.spellDC ?? actor.system.spells?.dc ?? null }
    : null;
  // D-616: the area in 07 SS9's phrasing, and whether the feature makes an
  // attack, for the card's Place area and Attack buttons.
  // Chimaera Shot's *within a 15-foot radius* (D-773): the circle widened.
  // **A FAILED CASTING TEST PLACES NOTHING** (the lead, 2026-09-26, for a spell;
  // D-775 for a casting Use: 04's Firestorm burns *On success*), and the card
  // then offers no area.
  const area = success ? widenArea(areaFor(sys.area ?? ""), barrageLimits?.widen ?? 0) : null;
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
  const attack = sys.attack === true;
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
  // is the lead's (CLARIFY, O-178): nothing is marked off what is carried.
  const trapPoisons = [];
  const trapTests = [];
  if (trapPoison && snake) {
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
  let uses = null;
  if (sys.uses?.per) {
    await item.update({ "system.uses.value": Math.max(0, sys.uses.value - 1) });
    uses = { value: item.system.uses.value, max: sys.uses.max };
  }

  // The card names the pool that PAID (D-769): a Mana price in a Shapeshift
  // form came out of Ferocity, and `spent` is that Ferocity. `inForm` is the
  // state the price was judged in, before step 2b changed the shape.
  const paidFrom = payingPool(sys.cost?.pool ?? null, { inShapeshiftForm: inForm });
  const costLabel = paidFrom ? game.i18n.localize(AZEROTH.poolTypes[paidFrom] ?? paidFrom) : null;
  const content = await renderTemplate(TEMPLATE.feature, {
    config: AZEROTH,
    title: item.name,
    subtitle: sys.className,
    action: sys.action,
    // 02's Curse's Mana is what its success paid (D-775).
    cost: costLabel ? { label: costLabel, text: sys.cost.all ? game.i18n.localize("AZEROTH.Feature.SpendAll") : String(spent + cursePaid) } : null,
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
    // The Snare's escape where Explosive Trap's half took the Resist (D-773).
    escape,
    area,
    attack,
    // How many attacks the button makes (the architect's review of D-773).
    attackAllowance,
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
    // The conditions the card offers on each target (D-771).
    inflicts,
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
    // The Casting Tests a Dispel's gates made (04's Everlasting Affliction, D-778) ride beside the Use's own.
    rolls: [...(roll ? [roll] : []), ...extraRolls],
    flags: { "azeroth-rpg": { kind: "feature", itemId: item.id, targets: list, damageByTarget, heal: healsBound ? null : healAmount, sl, area,
      ...(areaPush ? { push: { feet: areaPush.feet, from: "area", toward: "away", by: areaPush.by.join(", ") } } : {}),
      ...(featureSlowing ? { slowing: { feet: featureSlowing.feet, source: featureSlowing.by.join(", ") } } : {}),
      // The card's Attack allowance, counted by each press (the architect's
      // review of D-773), and 02's Snare, whose Inflict marks its own Entangled.
      ...(attack ? { attacks: { allowed: attackAllowance } } : {}),
      ...(item.name === SNARE.feature ? { snare: true } : {}),
      // D-779: Lightwell's font (its Region, charges and heal), Snake Trap's poison
      // (the tick a failed Test lays, `dice/chat.mjs#rollResists`), and the schools
      // Divine Aegis was named for (read by the heal button and the tick).
      ...(well ? { lightwell: well } : {}),
      ...(trapPoisons.length ? { poisons: trapPoisons } : {}),
      ...(aegisNamed ? { aegis: aegisNamed } : {}),
      // Whether the Use's Casting Test succeeded (D-775): a failed one places
      // nothing (`dice/chat.mjs#placeAreaFromCard`).
      ...(sys.casting ? { success } : {}),
      // 02's Curse (D-775): the minutes a failed Resist's Bane lasts, Malediction's
      // and Everlasting Affliction's added (`dice/chat.mjs#rollResists`).
      ...(curse && success && !curseShort ? { curse: { minutes: curse.minutes } } : {}),
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
      } : {}) } }
  });
  // Hammer of Justice at rank 2 (D-772), after the card that paid for it.
  if (hammerFalls) await hammerAfterUse(actor, item, list);
  return posted;
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
  const row = actor?.system?.[list]?.[index] ?? null;
  const a = row?.automation ?? null;
  if (!row || !hasAutomation(a) || a.kind === "spell") return null;
  const lst = targets ?? [];
  const first = lst[0] ?? null;

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
    bossSpend = spendBossPoints(actor.system?.bossPoints ?? {}, row.cost ?? 1);
    if (!bossSpend.ok) {
      ui.notifications?.warn(game.i18n.format(
        bossSpend.reason === "none" ? "AZEROTH.Boss.NoPoints" : "AZEROTH.Boss.Short",
        { name: row.name, cost: bossSpend.cost, held: bossSpend.held }
      ));
      return null;
    }
  }

  // 1c. **THE POOL IS ASKED BEFORE ANYTHING IS SPENT** (D-768; the lead,
  // 2026-10-03: *Keeps the Half-Action*). The budget - or a Boss's points -
  // was spent first and a short pool refused after, so a refused ability cost
  // the creature its Half-Action or its Boss Actions for nothing.
  let payFrom = null;
  if (a.cost?.pool && (a.cost.amount ?? 0) > 0) {
    payFrom = (actor.poolSnapshot?.() ?? []).find(p => p.kind === a.cost.pool) ?? null;
    if (!payFrom || payFrom.value < a.cost.amount) {
      const label = game.i18n.localize(AZEROTH.npcPoolKinds[a.cost.pool] ?? a.cost.pool);
      ui.notifications?.warn(game.i18n.format("AZEROTH.Feature.NoPool", { name: row.name, pool: label, amount: a.cost.amount }));
      return null;
    }
  }

  // 1d. Spend: the Boss Action points, marked off before anything else is paid
  // as a shot is (D-641), or the turn's budget.
  if (isBossAction) await actor.update({ "system.bossPoints.value": bossSpend.left });
  else if (!(await spendTurnBudget(actor, a.action ?? null))) return null;

  // 2. Pay, off the creature's pool of that kind.
  let spent = 0;
  if (payFrom) {
    spent = a.cost.amount;
    await actor.updatePool({ itemId: null, kind: payFrom.kind, value: payFrom.value - spent });
  }

  // 3. The Test, where the ability casts.
  let roll = null;
  let sl = 0;
  let success = true;
  let resolvedDC = null;
  if (a.casting) {
    const modifiers = [{ label: "AZEROTH.Sheet.Proficiency", value: actor.system.proficiency ?? 0 }];
    resolvedDC = dc ?? castingDC({ tier: actor.system.tier ?? 1, targetDefense: first?.defense ?? null });
    // **06 §5: A CASTING TEST MADE WHILE ENGAGED TAKES A BANE** (D-732's review).
    // This door has no dialog, so the measured Bane is added here and named on
    // the card, as the dialog's own automatic line would be.
    const engaged = engagedNow(actor);
    roll = AzerothRoll.build({ dc: resolvedDC, modifiers, boons, banes: banes + (engaged ? 1 : 0), kind: "casting", rollData: actor.getRollData() });
    if (engaged) {
      roll.options.provenance.push({ label: "AZEROTH.Dialog.Circumstance", value: null, formula: game.i18n.localize("AZEROTH.Modifier.EngagedCasting") });
    }
    await roll.evaluate();
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
  const heal = success && (a.heal ?? 0) > 0 ? { amount: a.heal, explanation: String(a.heal) } : null;
  let damage = null;
  let damageByTarget = [];
  if (success && (a.damage?.amount ?? 0) > 0) {
    const type = a.damage.type ?? null;
    const untyped = { damage: a.damage.amount, effectiveSL: sl, hit: true, immune: false, vulnerable: false, mitigation: 0 };
    const mitigate = t => (type === null ? untyped : resolveDamage({
      rating: a.damage.amount, sl: 0, kind: type === "physical" ? "physical" : "magical", school: type,
      apByLocation: t?.apByLocation ?? {}, ward: t?.wardBySchool?.[type] ?? 0,
      // An ally's aura, after the Ward (D-755); the physical lane ignores it.
      schoolArmor: t?.schoolArmor?.[type] ?? 0,
      immune: t?.immune ?? [], vulnerable: t?.vulnerable ?? [], slAddsToDamage: false
    }));
    damageByTarget = lst.map(t => mitigate(t));
    const result = damageByTarget[0] ?? mitigate(null);
    damage = { final: result.damage, explanation: spellDamageExplanation(result, a.damage.amount) };
  }
  const resist = a.resist ? { key: a.resist, label: AZEROTH.resiliences[a.resist], dc: testDC } : null;
  const area = areaFor(a.area ?? "");
  const attack = a.kind === "attack";
  // A LIST, one block per condition (the feature card's shape since D-771,
  // where Hurricane lays Slowed and Typhoon Prone beside it).
  const inflicts = a.inflicts?.condition ? [{
    condition: a.inflicts.condition,
    label: game.i18n.localize(AZEROTH.conditions[a.inflicts.condition] ?? a.inflicts.condition),
    value: a.inflicts.value ?? null,
    until: a.inflicts.until ?? null,
    untilLabel: a.inflicts.until ? game.i18n.localize(AZEROTH.untilKinds[a.inflicts.until] ?? a.inflicts.until) : null
  }] : [];

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
  const summon = a.kind === "summon" && a.summon?.entry && (a.summon.count ?? 0) > 0
    ? { entry: a.summon.entry, count: a.summon.count, side: a.summon.side, from: a.summon.from }
    : null;
  const costLabel = a.cost?.pool && spent ? game.i18n.localize(AZEROTH.npcPoolKinds[a.cost.pool] ?? a.cost.pool) : null;
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
    area,
    attack,
    inflicts,
    effect: await enrich(row.description, { relativeTo: actor }),
    note: a.note || null,
    targets: lst.map((t, i) => ({ ...t, index: i })),
    provenance: roll?.provenance ?? []
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: roll ? [roll] : [],
    flags: { "azeroth-rpg": {
      kind: "ability", list, index, title: row.name, targets: lst, damageByTarget, heal: heal?.amount ?? null, sl, area,
      damageType: a.damage?.type ?? null,
      // AN ABILITY THAT ATTACKS AND NAMES NO NUMBERS SWINGS THE BLOCK'S OWN
      // LINE (D-691). Ten entries carried `kind: "attack"` with an empty
      // `attack` descriptor, so the card's button rolled at Bonus 0 for 0
      // damage - and 14 means the creature's ordinary blow: *Ukorz attacks
      // every creature in reach at his Bonus.*
      attack: attack ? attackFor(a, actor) : null,
      // What the Place button calls up (D-691, decision 2).
      summon: summon ? { ...summon, bossAction: isBossAction } : null,
      bossAction: isBossAction
    } }
  });
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
  const use = item?.system?.use ?? null;
  if (!actor || !item || !hasUse(use)) return null;
  const lst = targets ?? [];

  // 1. Is there one to use?
  const held = item.system.quantity ?? 1;
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

  // 3. Where it goes, before anything is spent. **ASKED BEFORE THE BUDGET**
  // (D-768; the lead, 2026-10-03: *Keeps the Half-Action*): a coating with
  // nothing to go on, or a chooser dismissed, used to cost the Half-Action it
  // had already taken.
  let onto = null;
  if (use.target === "item") {
    onto = await chooseCoatingTarget(actor, item, use);
    if (!onto) return null;
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
  if (!(await spendTurnBudget(actor, freeApply ? null : (use.action ?? null)))) return null;

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
  if (spend?.delete) await item.delete();
  else if (spend) await item.update({ "system.quantity": spend.quantity });

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
  const timing = spellTiming(actor, durationOf(use)) ?? {};
  if (use.target === "item" && onto) {
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
      at: Date.now()
    });
    lines.push(game.i18n.format("AZEROTH.Use.LaidOn", { name: item.name, item: onto.name }));
    if (freeApply) lines.push(game.i18n.localize("AZEROTH.Use.FreeApply"));
  } else {
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
    for (const id of use.ends ?? []) {
      const label = game.i18n.localize(AZEROTH.conditions[id] ?? id);
      if (actor.statuses?.has?.(id)) {
        await actor.toggleStatusEffect(id, { active: false });
        lines.push(game.i18n.format("AZEROTH.Use.Ended", { condition: label }));
      } else lines.push(game.i18n.format("AZEROTH.Use.NotHeld", { condition: label }));
    }
    if ((use.changes ?? []).length) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: item.name,
        img: item.img,
        origin: actor.uuid,
        description: await enrich(item.system.description, { relativeTo: item }),
        system: { changes: use.changes.map(c => ({ key: c.key, type: c.type ?? "add", value: String(c.value ?? ""), phase: c.phase ?? "final" })) },
        ...timing,
        flags: { "azeroth-rpg": { consumable: item.system.identifier || item.name } }
      }]);
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
      const [carrier] = timed ? await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: item.name, img: item.img, origin: actor.uuid,
        description: await enrich(item.system.description, { relativeTo: item }),
        ...timing,
        flags: { "azeroth-rpg": { consumable: item.system.identifier || item.name } }
      }]) : [null];
      const done = await actor.grantTemporaryHealth(flaskAmount, {
        source: item.name, span: carrier ? "effect" : (flaskTemp.span === "encounter" ? "encounter" : "longRest"), effectId: carrier?.id ?? null
      });
      lines.push(game.i18n.format(done.landed ? "AZEROTH.Temporary.Line" : "AZEROTH.Temporary.LineKept", { name: actor.name, n: flaskAmount, held: done.temp }));
    }
  }

  // 7. The card, in the feature's own shape.
  const damage = use.damage?.amount
    ? { final: use.damage.amount, explanation: String(use.damage.amount) }
    : null;
  const resist = use.resist?.resilience
    ? { key: use.resist.resilience, label: AZEROTH.resiliences[use.resist.resilience], dc: use.resist.dc ?? null }
    : null;
  // A list of one (the feature card's shape since D-771).
  const inflicts = (use.statuses ?? []).length && use.target !== "item" ? [{
    condition: use.statuses[0],
    label: game.i18n.localize(AZEROTH.conditions[use.statuses[0]] ?? use.statuses[0]),
    value: null, until: null, untilLabel: null
  }] : [];
  const area = areaFor(use.area ?? "");

  const content = await renderTemplate(TEMPLATE.feature, {
    config: AZEROTH,
    title: item.name,
    subtitle: actor.name,
    // Free where Deft Hands or Poisoner paid for it (the lead's item 27).
    action: freeApply ? null : use.action,
    cost: null,
    uses: left === null ? null : { value: left, max: held },
    rolled: false,
    heal: null,
    speakerName: actor.name,
    damage,
    resist,
    area,
    attack: false,
    inflicts,
    effect: await enrich(item.system.description, { relativeTo: item }),
    note: [use.note || null, ...lines].filter(Boolean).join(" \u00b7 ") || null,
    targets: lst.map((t, i) => ({ ...t, index: i })),
    provenance: []
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { "azeroth-rpg": {
      kind: "gear", itemId: item.id, title: item.name, targets: lst,
      damageByTarget: lst.map(() => (damage ? { damage: damage.final } : null)),
      heal: null, sl: 0, area
    } }
  });
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
export function refuseSignaturePress({ actor, item } = {}) {
  const signature = signatureEffectOf(item);
  if (!actor || !item || !signature) return true;
  if (!isPressable(signature)) {
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
  const refusal = pressRefusal(signature, { holds, spells: (item.system?.spells ?? []).length });
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
export async function useSignature({ actor, item, targets = null } = {}) {
  const signature = signatureEffectOf(item);
  if (!actor || !item || !signature) return null;

  // 1. Refuse, NAMING WHY - and through the SAME function the `spell` branch
  //    goes through, so neither door can drift from the other.
  if (refuseSignaturePress({ actor, item })) return null;

  // A spell casts through the Forge's own door (D-633), never here: the caller
  // routes it (`actions.mjs#useSignatureWithDialog`), and a press that reached
  // this line would post a card with nothing on it.
  if (signature.kind === "spell") {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Signature.CastsInstead", { name: item.name }));
    return null;
  }
  const lst = targets ?? [];
  const use = signature.use;

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
  if (!(await spendTurnBudget(actor, use.action ?? null))) return null;

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
  const markAmount = markTemp?.amount ? Math.max(0, Math.trunc(Number(evaluateAmount(markTemp.amount, { level: actor.system?.level ?? 1, tier: actor.system?.tier ?? 1 }))) || 0) : 0;
  if (markAmount > 0) {
    const done = await actor.grantTemporaryHealth(markAmount, { source: item.name, span: markTemp.span === "encounter" ? "encounter" : "longRest" });
    lines.push(game.i18n.format(done.landed ? "AZEROTH.Temporary.Line" : "AZEROTH.Temporary.LineKept", { name: actor.name, n: markAmount, held: done.temp }));
  }

  // 5. Strike the use, before the card is built so the card prints what is left.
  let uses = null;
  if (use.uses?.per) {
    await item.update({ "system.signatureEffect.use.uses.value": Math.max(0, (use.uses.value ?? 0) - 1) });
    uses = { value: item.system.signatureEffect.use.uses.value, max: use.uses.max };
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
    // 14's entries and the GM's own beasts (D-650), gated by the talent, the
    // Handling DC and the character's tier; held ones tagged, never greyed.
    const options = [...(await bestiaryEntries()), ...worldCreatures(["beast", "dragonkin"], { owner: actor })]
      .filter(e => (e.creatureType === "beast" || e.creatureType === "dragonkin") && e.name !== "Avatar")
      .sort((a, b) => (order.indexOf(a.weightClass) - order.indexOf(b.weightClass)) || ((a.tier ?? 1) - (b.tier ?? 1)) || a.name.localeCompare(b.name))
      .map(e => {
        const option = creatureOption(e);
        const fit = eligible("companion", e, { talents, tier });
        if (fit.reason === "NotBeast") return null;
        if (bonded.has(e.uuid)) return { ...option, tag: game.i18n.localize("AZEROTH.Feature.Bonded"), available: true, held: true };
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
      .filter(e => e.creatureType === "beast" && FORM_WEIGHTS.includes(e.weightClass) && !taken.has(e.uuid))
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

/** 02 SS7: a Shapeshift form is any Beast at Chaff or Standard weight class. */
const FORM_WEIGHTS = ["chaff", "standard"];

/** 14 SS13: a shaman's called elemental answers from *Elementals, Oozes and Constructs*. */
const ELEMENTALS_SECTION = /Elementals, Oozes and Constructs/;

/** 14's creatures, as the bestiary pack's index carries them. */
async function bestiaryEntries() {
  const pack = game.packs.get("azeroth-rpg.bestiary");
  if (!pack) return [];
  const index = await pack.getIndex({ fields: ["system.creatureType", "system.weightClass", "system.tier", "system.description", "system.source.section", "system.handlingDC"] });
  return index.map(e => ({
    uuid: e.uuid,
    name: e.name,
    creatureType: e.system?.creatureType ?? null,
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
  return game.actors
    .filter(a => a.type === "npc" && types.includes(a.system?.creatureType) && (!bondOf(a) || bondOf(a).ownerUuid === owner?.uuid))
    .map(a => ({
      uuid: a.uuid, name: a.name, creatureType: a.system.creatureType ?? null, weightClass: a.system.weightClass ?? null,
      tier: a.system.tier ?? 1, handlingDC: a.system.handlingDC ?? null, section: "", description: a.system.lore ?? "", world: true
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
  return null;
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
export async function chooseOption(item, options, note = null, { label = "AZEROTH.Feature.Use", prompt = null, max = 1, selectAll = false } = {}) {
  const { DialogV2 } = foundry.applications.api;
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
  const answer = await DialogV2.wait({
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
    render: many
      ? (event, dialog) => { capTicks(dialog, count); if (selectAll === true) bindSelectAll(dialog); }
      : undefined,
    buttons: [{
      action: "choose", label, default: true,
      callback: (event, button) => many
        ? [...button.form.querySelectorAll('input[name="choice"]:checked')].map(el => Number(el.value))
        : Number(button.form.elements.choice?.value)
    }]
  });
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
async function accrueCorruption(actor, { track, points = 1, occasion = "" } = {}) {
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
export async function sufferInjury({ actor, location = "body", band = null, result = null } = {}) {
  if (!actor) return null;
  const name = result?.name ?? game.i18n.localize("AZEROTH.Card.CriticalInjury");
  const permanent = band?.permanent === true;
  const dying = band?.dying === true;

  // 05 SS11: a Critical Injury costs all Momentum; 05 SS12: it ends what is
  // Sustained (D-627) - through the ONE writer, which lifts what the Sustain
  // held as well (this unset the flag and left its laid effects standing).
  // At 0 Health the Sustain has already ended and this finds nothing (M1).
  const drained = (actor.poolSnapshot?.() ?? []).filter(p => p.kind === "momentum" && (p.value ?? 0) > 0);
  if (drained.length) await actor.updatePool(drained.map(p => ({ itemId: p.itemId, kind: "momentum", value: momentumAfter(p.value, { criticalInjury: true }) })));
  await endAllSustains({ actor });
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
    flags: { "azeroth-rpg": { injury: true, location, permanent } }
  }]);

  for (const c of conditions) {
    // A result that runs "until the end of your next turn" expires on its own (D-628).
    await applyCondition(actor, c.id, { value: c.value ?? null, until: nextTurn ? "endOfNextTurn" : null });
  }

  const update = {};
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
    await payingActor.updatePool({ itemId: pool.itemId, kind: "momentum", value });
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
