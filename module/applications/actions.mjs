import {reloadMenuEntries} from "./reload.mjs";
import {healingSignatureReviewState} from '../effects/signature-healing-review.mjs';
import {damageSignatureCards} from '../effects/signature-damage-review.mjs';
import {orphanDamageCasts} from '../effects/signature-damage-orphans.mjs';
import { enslaveMinuteDue } from '../rules/enslave-clock.mjs';

/**
 * Sheet actions shared by the character and NPC sheets, and the one door
 * every Test goes through.
 *
 * `attributes.hbs` is ONE template rendered by both sheets (D11 §6: the same
 * rail, simplified). Its plates carry `rollAbility`, and only the character
 * sheet registered a handler - so an NPC's Strength plate was a silent no-op.
 * Splitting the template would duplicate the clip-path structure D11 §9
 * records biting twice; registering the same handler on both is the fix.
 */

import { AZEROTH } from "../config.mjs";
import { confirmBandExtraAttack } from './signature-band-confirmation.mjs';
import { reactionBarred } from "../rules/reaction-bar.mjs";
import { attackReactionRefusal } from "../rules/attack-reaction-state.mjs";
import { blockCommitValid, requestAttackBlock } from "../effects/attack-block.mjs";
import { claimedParryBonus, hasParrySignature, requestStandaloneParry, parryCommitValid, payClaimedParry, recordParryOutcome, requestAttackParry } from "../effects/attack-parry.mjs";
import { ghoulEnrageDamage } from "../rules/ghoul-enrage.mjs";
import { isSearingAttack } from "../rules/searing-totem.mjs";
import { searingAttackRange } from "../effects/searing-totem-range.mjs";
import { runSearingAttack } from "../effects/searing-totem-use.mjs";
import { prepareVoidwalkerInterception, refreshVoidwalkerInterception } from "../effects/voidwalker-sacrifice-targets.mjs";
import { refuseDisarmedParry } from "../effects/npc-disarm.mjs";
import { hasAncientDespair } from "../rules/ancient-despair.mjs";
import { hasDreadlordSleep } from "../rules/dreadlord-sleep.mjs";
import { phaseShiftRefusal } from "../rules/phase-shift.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";
import { canEndIceBlock, requestEndIceBlock } from "../effects/ice-block-ending.mjs";
import { dispersionFor, dispersionRefusal } from "../rules/dispersion.mjs";
import { canEndDispersion, requestEndDispersion } from "../effects/dispersion-end-request.mjs";
import { seductionRefusal } from "../effects/seduction-refusal.mjs";
import { enrich } from "../helpers/enrich.mjs";
import { coins } from "../helpers/coins.mjs";
import { accepts, containerOf, isContainer } from "../rules/containers.mjs";
// What a thing takes and where it may go, in bag slots (05, 08 §11; D-735).
import { BASE_SLOTS, isMount, ledger, slotsIn } from "../rules/slots.mjs";
import { canCarry, castingAugment } from "../rules/augments.mjs";
import { isWornSlot } from "../rules/worn.mjs";
// What a row is worth putting on the hotbar (the lead, 2026-09-13). The PURE
// half; the write is `module/macros.mjs`, reached through `game.system.azeroth`.
import { kindOf } from "../rules/macros.mjs";
import { SKILL_TEXT } from "../rules/skill-text.mjs";
import { THINNED_RATING_DROP, thinnedRating } from "../rules/swarm.mjs";
import { fieldsFor } from "./item-fields.mjs";
import { shouldPrompt } from "../settings.mjs";
import { OVERCHANNEL_MAX_POINTS, castingDC, grantingClass, isHealingSpell, manaPrice, maxOverchannel, overchannelPerPoint, spellManaCost, statedCastingDC, swiftCast, takeNextSpell } from "../rules/casting.mjs";
// THE LEGACY BRANCHES' DOORS (B1): a spell a talent pays in another pool (door 8),
// the ability scope (door 16), a throw a rider makes possible (door 15), and no
// Reaction against the unanswered (door 14).
import { castCanPay, castingManaPool } from "../rules/casting.mjs";
import { spellPoolFor } from "../rules/class-talents.mjs";
import { abilityScope } from "../rules/expressions.mjs";
import { attackOffHand, riderThrowModifiers, throwAsWeapon } from "../rules/wield.mjs";
import { extraAttackSelection, extraAttackWeapons } from "../rules/second-attack-choice.mjs";
import { throwAsOffer } from "../rules/riders.mjs";
import { unansweredBy } from "../rules/reactions.mjs";
import { reactionLostToBlow } from "../rules/miss.mjs";
import { withdrawHit, withdrawnWords } from "../effects/miss.mjs";
import { onUseLegacy } from "../rules/class-talents.mjs";
// A Reaction's answer is written on the striker's card (the B1 fix run): with no GM to
// write a card this client did not post, it is refused before anything is spent.
import { cardPressUnrecordable } from "../effects/card-presses.mjs";
// The Mage's and the Warlock's (D-775): what the cast's dialog reads - the
// talents' discounts and Icy Veins' state, a restated DC, Overchanneller's
// relief - and the Combustion fact on a damage line.
import { VEINS_FLAG, igniteBurning, overchannelReliefFor, spellDcFor, spellDiscountFor, veinsStates } from "../rules/class-talents.mjs";
import { flaggedEffects } from "../effects/talent-states.mjs";
// A shape's gear melds and Metamorphosis adds to a blow (02 §7, D-769).
import { meldsGear, shapeDamageBonus } from "../rules/shapes.mjs";
import { scoreHeldBy, storedFromShown } from "../rules/abilities.mjs";
import { attackAbility, attackModes, canFire, fittingBundles, pierceOf, selectAmmunition, shotDamage } from "../rules/ammunition.mjs";
// In the hand or thrown (D-731): the ways a blow may be struck, one variant each.
import { attackPlan, withAttackMode } from "../rules/attack-modes.mjs";
// 02 §6's *two attacks each time you Attack* (D-704): how many Tests one
// Attack action rolls, and whether the second one builds its Momentum.
import { EXTRA_ATTACK_ROLLS_BUILD_MOMENTUM, rollsPerAttack } from "../rules/initiative.mjs";
import { annihilatorAttackWorkflow } from "../effects/lava-annihilator-attack.mjs";
import { annihilatorSceneTargets } from "../effects/lava-annihilator-targets.mjs";
// What a creature swings when a GM puts a weapon in its hands (the lead's N2).
import { heldRating } from "../rules/held-attacks.mjs";
import { weaponTraitEffects } from "../rules/weapon-traits.mjs";
// What a blow is struck with, as a form the card records (D-725).
import { STRIKE_FORMS, rowAttackModes, strikeFor, strikeForRow, weaponFacts } from "../rules/strikes.mjs";
import { gadgetByKey } from "../rules/gadgets.mjs";
import { maneuverCost } from "../rules/maneuvers.mjs";
import { defaultChoice, distanceBetween, prepareRoll, promptRoll, refreshedSecondAttackChoice, sourceOf, targetSnapshots } from "./roll-dialog.mjs";
import { countsAsAlly, defaultAttackMode, engagedCount, reachOf, thrownRange } from "../rules/distance.mjs";
// Who the roller is Engaged with, and the one reading of reach (06 §5, D-732).
import { allyStandingOf, combatantIn, enemyDistances, engagedNow, reachOfActor } from "../canvas/engaged.mjs";
// Every distance between two tokens, between the nearest squares (D-732): Shield Wall's friendly target (D-772).
import { feetApart } from "../canvas/footprints.mjs";
// The Warrior's and the Paladin's Reactions (D-772): a Block's bonus and its retort, a
// Parry or a Block that costs no Reaction, and an attack nobody may answer.
import { blockAllyFeet, blockBonusFor, blockRetortFor, nextRoundMark } from "../rules/class-talents.mjs";
// Whom a feature's Use is aimed at, and what is left of a round's marks (D-774).
import { SHADOWFORM_FLAG, featureAims, roundMarksLeft, shadowformHolds } from "../rules/class-talents.mjs";
// The Ranger's and the Rogue's (D-773): every talent that frees a Parry, what a
// Parry that holds builds, an attack from hiding nobody may answer, Longshot's
// maximum, and Pack Tactics' flanking.
import { asksFact, flankingFor, freeReactionRowsFor, packFlanks, parryGainsFor, rangeStretchFor, unanswerableWith } from "../rules/class-talents.mjs";
// D-779: the lead's class answers - a Parry of a ranged blow, Main Gauche's turn, and
// what a Parry takes back off (O-166, O-180).
import { blademasterFor, flametongueFor, rangedParryFor } from "../rules/class-talents.mjs";
import { blademasterWeaponKey, castingWithAttackTest } from "../rules/blademaster-test.mjs";
import { blademasterReaches, flametongueStrike, parryReaches, turnMark } from "../rules/class-answers.mjs";
import { isHiddenFor } from "../effects/stealth.mjs";
// What a talent adds to a blow's damage, per rank (04, D-711 phase 2).
import { FORM_LANE, castAsFor, damageChosen, damageLinesFor, damageRowsFor, featureDamageLane, onUseOf, talentEffect } from "../rules/talent-effects.mjs";
import { LUNAR_DAMAGE_FLAG, lunarDamageQualifies } from "../rules/lunar-guidance.mjs";
// The one reading of a lane (D-768). Aliased: `attackWithDialog` keeps a local
// `laneBonus` number, and an import of the same name would be shadowed by it.
import { laneBonus as laneBonusFor } from "../rules/spell-bonus.mjs";
// A spell whose damage is its area's tick deals none on the cast (D-756, N6).
import { castDealsDamage } from "../rules/area-ticks.mjs";
// A held Sustain that answers a melee blow (07's Immolation, D-757).
import { retaliationRows } from "../effects/area-strikes.mjs";
import { bondOf, boundOf } from "../documents/bound.mjs";
// 06 SS6's Reaction table (D-693): Parry and Block, and what each one asks for.
import { BLOCK_REDUCTION, PARRY_COST, SHIELDBEARER, blockReduction, canReact, defensiveReactions, meleeInHand, parryHolds, parryPoolFor, shieldsHeld, standingMarkRefusal } from "../rules/reactions.mjs";
// What a Parry or a Block writes back onto the card it answered (D-720).
import { annotateMitigation } from "../dice/annotate.mjs";
import { attackSpecFor, delegatedAbilitySpell, isPressable } from "../rules/ability-automation.mjs";
// 08 §7's Greater School enchantment, and 08 §5's Pierce read leniently.
import { ratingAfterSignature, weaponDamageSpec } from "../rules/damage-spec.mjs";
// What the blow is about to meet, for the dialog's Damage line (the lead's 29).
import { describeDamage, resolveDamage } from "../rules/mitigation.mjs";
import { baseTrait } from "../rules/bestiary.mjs";
import { grantsOn } from "../rules/grants.mjs";
import { SYNCED_REASONS, clearRefusal } from "../rules/in-play.mjs";
import { blowFacts, gateHolds, hasSignature, isPressable as signaturePressable, mergeWeaponEffects, pressGates, pressRefusal, signatureEffectOf, signatureEffects } from "../rules/signatures.mjs";
import {approvedRestSignature,charmUseView,SIGNATURE_USES_FLAG} from '../rules/approved-signature-uses.mjs';
import { AzerothCompendiumBrowser } from "./compendium-browser.mjs";
// THE LEGACY BRANCHES' B3: where a creature stands (06 §10's Spirit Realm, door 10) and
// Drawn Across on a blow's source (door 25).
import { realmStateFor } from "../effects/spirit-realm.mjs";
import { dealtHalvedBy } from "../rules/legacy-uses.mjs";
// A construct's Cutting Gear, read by its name (the lead's ruling).
import { holdsCuttingGear } from "../rules/escapes.mjs";
// 07's Nature's Grasp's bar on Opportunity Attacks (the B9a pass).
import { barredFromOpportunity } from "../rules/struck-tests.mjs";

/**
 * WHAT THE THINGS THE TARGET IS WEARING ANSWER BACK (08 SS20, D-692).
 *
 * Skullflame Shield's *a creature that hits you in melee takes 3 Fire damage*
 * is about the creature being STRUCK, so it can never be on the attacker's own
 * aggregate - and `signatureEffects` returned `whenStruck` from the day it was
 * written with nothing reading it. A target SNAPSHOT carries no items, so the
 * actor is resolved here, at the attack door, where the Foundry side lives.
 *
 * The gate is judged against the TARGET as bearer and the ATTACKER as the
 * creature it faces, which is the mirror of the attack's own snapshot: *while
 * you are below half Health* is the wearer's, and a `creatureType` clause reads
 * whoever swung.
 *
 * @param {Array<object>} targets  the snapshots the dialog built
 * @param {Actor|null} attacker
 * @returns {Array<{name: string, text: string, target: string,
 *   damage: {amount: number|null, type: string|null}, condition: object}>}
 */
function struckBackRows(targets = [], attacker = null) {
  const out = [];
  // **WHICH ROW OF THE CARD WAS STRUCK** (the B1 review): a hit a Parry or Afterimage
  // turns into a miss struck nobody, so what answers it is refused at the press
  // (`dice/chat.mjs`, `data-struck-index`) - *a creature that hits you* was not hit.
  for (const [index, snapshot] of targets.entries()) {
    const actor = targetActorOf(snapshot);
    if (!actor) continue;
    const effects = signatureEffects([...(actor.items ?? [])], {
      ...(actor.signatureTurnState ?? {}),
      target: { creatureType: attacker?.system?.creatureType ?? null, acted: null }
    });
    for (const row of effects.whenStruck) out.push({ ...row, target: snapshot.name ?? actor.name, index });
    // **AND WHAT THE TARGET SUSTAINS** (07's Immolation, D-757): *a creature
    // that hits you with a melee attack takes 2 Fire damage*, in this row's
    // shape, marked `melee` for the roll to judge once the blow's way is final.
    for (const row of retaliationRows(actor, attacker)) out.push({ ...row, target: snapshot.name ?? actor.name, index });
  }
  return out;
}

/**
 * WHICH CREATURES THIS ONE HAS DAMAGED IN THE FIGHT (04's Elemental Fury and
 * Lunar Guidance: *against a target that has taken damage from you*).
 *
 * The mark is the ATTACKER's own combatant flag, keyed by the victim's token
 * where it has one and by its actor otherwise, and `effects/after-blow.mjs`
 * writes it from `applyDamage`, the one door every struck blow goes through
 * (D-768). `_leaveFight` clears it with the rest of the fight's flags.
 */
export function damageKeyFor(target) {
  return target?.tokenId ?? target?.actorId ?? target?.id ?? null;
}

/** Whether this actor has already damaged that target this fight. */
function damagedAlready(actor, target) {
  const key = damageKeyFor(target);
  if (!key) return false;
  const fight = actor?.activeFight?.() ?? null;
  const combatant = fight?.getCombatantsByActor?.(actor)?.[0] ?? null;
  return Boolean(combatant?.getFlag("azeroth-rpg", "damaged")?.[key]);
}

/**
 * **WHAT A TALENT ADDS TO THIS DAMAGE, AS THE DIALOG'S LINES** (04, D-711 phase
 * 2), built ONE way for the attack door, the spell door and a class feature
 * (D-768): `damageRowsFor` picks the rows for the lane and the type,
 * `damageLinesFor` checks the ones whose fact the door measured. The three
 * facts every door can read are read here; an attack's own two - *Engaged with
 * exactly one enemy* and 06 §7's Riposte - arrive through `extraFacts`, called
 * only where a row could use them, because measuring the enemies around a
 * token is not free.
 *
 * @param {Actor} actor
 * @param {{lane: "attack"|"spell", type: string, target?: object|null, extraFacts?: () => object}} o
 * @returns {object[]}  the dialog's `damageLines`, or [] where no row applies
 */
function talentDamageLines(actor, { lane, type, target = null, extraFacts = () => ({}), alsoSpell = false, feature = false } = {}) {
  // The amount at the door's ability scope (the Legacy branches' door 16).
  const rows = damageRowsFor(actor.takenTalents?.() ?? [], { lane, type, alsoSpell, feature, scope: abilityScope(actor.system) });
  if (!rows.length) return [];
  return damageLinesFor(rows, {
    // **WHAT A LEGACY'S GATE READS** (doors 15, 17, 18): what is wielded and worn, the
    // target's conditions and kinds, what the user laid on it, the user's marks -
    // the actor's one fact-builder (`AzerothActor#gateFacts`).
    ...(actor.gateFacts?.(target) ?? {}),
    // *Against a target that has taken damage from you.* The mark is the
    // ATTACKER's own combatant flag, written where the blow was applied.
    damagedTarget: damagedAlready(actor, target),
    lunarTarget: lunarDamageQualifies(actor.activeFight?.()?.getCombatantsByActor?.(actor)?.[0]?.getFlag("azeroth-rpg", LUNAR_DAMAGE_FLAG), damageKeyFor(target)),
    // *While you control a Bound Demon* (D-643).
    boundDemon: boundOf(actor, "demon").length > 0,
    // *While in a Shapeshift form* (02 §7): the Avatar is not one (D-251, D-769).
    form: actor.inShapeshiftForm === true,
    // 04's Engineering Upgrade on the Gnomish Battle Rig's Piston fist (the lead:
    // *"Yes, the fist too"*; the Legacy branches' B2): the roller wears the rig.
    battleRig: actor.shape?.kind === "battlerig",
    // 04's Shadowform (D-774): no Holy dealt and no heal given since the priest's
    // last turn - readable in a fight, the table's line out of one.
    shadowform: shadowformHolds({ fightId: actor.activeFight?.()?.id ?? null, mark: actor.getFlag?.("azeroth-rpg", SHADOWFORM_FLAG) ?? null }) === true,
    // 04's Combustion (*against a target already burning from Ignite*; D-775): the
    // target carries an Ignite tick this roller laid.
    ignited: igniteBurning(((target ? targetActorOf(target) : null)?.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"]?.tick ?? null), { source: actor.uuid }),
    ...extraFacts()
  });
}

/**
 * The actor a target snapshot points at: its token on its scene, else the
 * world actor. `dice/chat.mjs` keeps the same three lines for a card's own
 * buttons; a snapshot is deliberately plain data and each side resolves it.
 */
function targetActorOf(t) {
  const scene = (t?.sceneId && game.scenes.get(t.sceneId)) || canvas?.scene || null;
  const token = t?.tokenId ? scene?.tokens?.get(t.tokenId) : null;
  return token?.actor ?? (t?.actorId ? game.actors.get(t.actorId) : null) ?? null;
}

/* -------------------------------------------- */
/*  06 §6's Reactions (D-693)                    */
/* -------------------------------------------- */

/**
 * What `rules/reactions.mjs` needs to know about a would-be defender: the
 * Reaction left in the turn budget, whether one has already answered THIS
 * attack, and what is in hand.
 *
 * Out of a started fight there is no budget and 06 §6's one a round holds
 * nobody, so `inFight` is false and the Reaction is free - which is the same
 * ruling `workflows.spendTurnBudget` already makes for every other action.
 */
export function reactionStateOf(actor, { messageId = null, against = null, targetIndex = null, combatant: given = null } = {}) {
  // **THE COMBATANT, WHERE THE DOOR KNOWS IT** (the B1 review): the Opportunity Attack
  // check walks one fight's combatants, so it hands each threatener's own - an actor in
  // two started fights, or an unlinked token sharing its actor with another, is then
  // read in the fight that is asking. Without one, the actor's started fight.
  const fight = given?.combat ?? actor?.activeFight?.() ?? null;
  const combatant = given ?? fight?.getCombatantsByActor?.(actor)?.[0] ?? null;
  const answered = actor?.getFlag?.("azeroth-rpg", "reacted") ?? null;
  // **THE BLOW ITSELF TOOK THIS CREATURE'S REACTION** (the Legacy branches' door 13:
  // a Bash, a Concussive Shot): the Reaction that answers it may be that one.
  const card = messageId ? (game.messages?.get(messageId) ?? null) : null;
  const lostToBlow = Number.isInteger(targetIndex) && reactionLostToBlow(card?.flags?.["azeroth-rpg"]?.landedOnHit ?? [], targetIndex);
  // **WHAT IS IN HAND IS `readyWeapons`** (D-769): in a shape, the block's
  // attack rows - held and melee by nature, so a natural attack parries (the
  // plan's reading) - and a melded sword is in no hand at all.
  const ready = actor?.readyWeapons?.() ?? (actor?.items ?? []).filter(i => i.type === "weapon");
  const melee = meleeInHand(ready.map(i => ({ name: i.name, ...i.system })));
  // A shield melds into a shape too, so a shifted creature has nothing to Block with.
  const shape = actor?.type === "character" ? (actor.shape ?? null) : null;
  return {
    reactionsLeft: combatant?.budget?.reactions ?? 0,
    inFight: Boolean(fight?.started && combatant),
    alreadyReacted: Boolean(messageId) && answered?.messageId === messageId,
    meleeWeapons: melee,
    shields: shape && meldsGear(shape.kind)
      ? []
      : shieldsHeld((actor?.items ?? []).filter(i => i.type === "armor").map(i => ({ name: i.name, ...i.system }))),
    // What an Opportunity Attack would be struck WITH (06 §6, D-694). A
    // character swings what is in hand; a creature strikes with a row off its
    // own block **and with whatever a GM has put in its hands** (the lead's N2,
    // 2026-09-10). This comment said *a creature holds no weapon items at all*
    // and that was the whole reason `meleeInHand` found nothing on one — it was
    // true of the CONTENT (14 prints no equipment, D3 §7) and never of the
    // model, and `signatureEffects`, `maneuverContext` and the Block above have
    // all read a creature's items for longer than it stood.
    //
    // **THE BLOCK'S OWN ROWS COME FIRST.** `canReact` offers `attacks[0]`, so
    // the order decides what a creature swings by default, and 14's row is what
    // the creature IS; a held sword is beside it, never instead of it.
    //
    // **EVERY ROW, WHATEVER WAY IT IS STRUCK** (D-731's review, the
    // coordinator's call; the lead may overturn it). 06 §6's row is *one
    // attack against them*, not a melee attack, so no creature loses the
    // Opportunity Attack it had: an Imp answers with its Firebolt and a
    // Rifleman with its Rifle, and the door prefers the hand only where the row
    // has one (`takeOpportunity`).
    attacks: actor?.type === "npc"
      ? [...(actor.system?.attacks ?? []).map(a => String(a?.name ?? "")).filter(Boolean), ...melee]
      : melee,
    // *Having used Ready on your turn* (06 §6). The entry lives on the
    // combatant, so out of a fight there is nothing readied.
    readied: combatant?.getFlag?.("azeroth-rpg", "ready") ?? null,
    // *Pummel belongs to the Warrior and the Rogue* (06 §6). `canReact` had no
    // arm for a class requirement and would have said yes to a Mage; it has one
    // now, and this is what fills it. A creature holds no class item, so the
    // list is empty and a class-gated Reaction refuses one, which is right.
    classNames: actor?.classNames ?? [],
    // *A class that builds Momentum, and 1 Momentum* (06 §6's Parry, D-720).
    // The POOLS answer the class question as well as the price, so a caster
    // never sees the button and a creature whose block prints a Momentum row
    // does — `parryPoolFor` is the law and this only hands it the snapshot.
    pools: actor?.poolSnapshot?.() ?? [],
    // **A PARRY OR A BLOCK THAT COSTS NO REACTION THIS ROUND** (04's Bladeturn
    // and Deflection, D-772): a spent Reaction does not refuse it. **And the first
    // Opportunity Attack of a round** (04's Hold the Hall at rank 2; door 22).
    free: {
      parry: Boolean(freeReactionOf(actor, "parry", { combatant: given })), block: Boolean(freeReactionOf(actor, "block", { combatant: given })),
      opportunityAttack: Boolean(freeReactionOf(actor, "opportunityAttack", { combatant: given }))
    },
    // **NO CREATURE MAY TAKE A REACTION AGAINST IT** (04's Wind Walk, Bladestorm; the
    // Legacy branches' door 14): the creature being answered - the blow's striker,
    // the mover - carries the span.
    unanswered: unansweredOf(against).length > 0,
    // The attack reveals a hidden striker before defenders answer. Ghostly
    // Strike reads that attack's saved concealment, never the later live status.
    cannotParryOrBlock: Boolean(against && unanswerableWith(against.takenTalents?.() ?? [],
      { hidden: card?.getFlag?.('azeroth-rpg', 'hiddenAtRoll') === true })),
    lostToBlow,
    // **A SPIRIT ANSWERS NO BLOW** (06 §10: *You cannot touch the living world, and
    // nothing in the fight can touch you*; the Legacy branches' door 10): a character
    // Dying or stepped across by 04's The Crossing takes no Reaction (`canReact`).
    spiritRealm: realmStateFor(actor).in === true,
    disoriented: hasAncientDespair(actor),
    asleep: hasDreadlordSleep(actor),
    phaseShifted: Boolean(phaseShiftRefusal(actor, "reaction")),
    iceBlocked: Boolean(iceBlockFor(actor)),
    dispersed: Boolean(dispersionFor(actor)),
    reactionBarred: reactionBarred(actor),
    seduced: Boolean(seductionRefusal(actor, "reaction")),
    // **HELD FROM OPPORTUNITY ATTACKS** (07's Nature's Grasp: *... or be **Entangled** and
    // unable to make Opportunity Attacks while it is held*; the B9a pass): while the
    // Entangled its striker's Test laid holds (`rules/struck-tests.mjs`).
    noOpportunity: barredFromOpportunity(actor?.effects?.contents ?? [])
  };
}

/**
 * **WHAT MAKES A CREATURE UNANSWERABLE NOW** (the Legacy branches' door 14): the
 * sources its active effects' `UNANSWERED_FLAG` names, or none - none for no
 * creature at all.
 *
 * @param {Actor|null} actor
 * @returns {string[]}
 */
export function unansweredOf(actor) {
  if (!actor) return [];
  return unansweredBy((actor.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"] ?? {}));
}

/**
 * **THE FREE REACTION THIS ROUND STILL HOLDS** (04's Bladeturn: *Your first
 * Parry each round costs no Reaction. At rank 2 the second costs none either*;
 * Deflection, the same of Block; D-772): the talent and the round's next mark,
 * or null - none held, every one spent, or no fight (out of one a Reaction
 * costs nothing anyway). The round's record is the combatant's `round` flag,
 * marked through the queued door `markRoundOnce` (D-761).
 *
 * @param {Actor} actor
 * @param {"parry"|"block"} key
 * @returns {{identifier: string, name: string, count: number, mark: string, combatant: Combatant}|null}
 */
function freeReactionOf(actor, key, { combatant: given = null } = {}) {
  // The combatant the door knows, else the actor's in its started fight (the B1 review).
  const fight = given?.combat ?? actor?.activeFight?.() ?? null;
  const combatant = given ?? fight?.getCombatantsByActor?.(actor)?.[0] ?? null;
  if (!combatant || !fight) return null;
  const round = combatant.getFlag("azeroth-rpg", "round") ?? {};
  const used = round.number === fight.round ? (round.once ?? []) : [];
  // **EVERY TALENT THAT FREES ONE, IN TURN** (04's Combat Reflexes beside
  // Bladeturn; D-773): *one further Reaction each round per rank, usable only to
  // Parry* is Bladeturn's door with its own count, and a character holding both
  // has both - the first with a mark left is the one taken.
  // Main Gauche: with a melee weapon in each hand, one Parry per rank each turn
  // costs no Reaction (lead, 2026-11-01). Marks name both the turn and use.
  const ready = actor.readyWeapons?.() ?? (actor.items ?? []).filter(i => i.type === "weapon");
  const dualMelee = meleeInHand(ready.map(i => ({ name: i.name, ...i.system }))).length >= 2;
  for (const row of freeReactionRowsFor(actor.takenTalents?.() ?? [], key)) {
    if (row.needs === "dualMelee" && !dualMelee) continue;
    const mark = row.per === "turn" ? turnMark(row.identifier, fight.turn, used, row.count) : nextRoundMark(row.identifier, row.count, used);
    if (mark) return { ...row, mark, combatant };
  }
  return null;
}

/**
 * The equipped weapon of that name, on either actor type.
 *
 * `canReact` answers with a NAME - it is pure and holds no documents - so every
 * Reaction door has to find the thing again. A creature's list now carries its
 * held weapons as well as its block's rows (the lead's N2), which is what makes
 * this the same lookup for both.
 */
function heldFor(actor, name) {
  // `readyWeapons` (D-769): a shifted character holds its block's rows.
  const ready = actor?.readyWeapons?.() ?? (actor?.items ?? []).filter(i => i.type === "weapon" && i.system?.equipped);
  return ready.find(w => w.name === name) ?? null;
}

/**
 * **The preferred way for a blow that is only offered, never forced** (D-731's
 * review): the hand where the weapon or the row has one, and its own way where
 * it has not. 06 §6's Opportunity Attack is *one attack against them*, not a
 * melee attack, so a creature whose row throws or shoots answers with it.
 *
 * @param {string[]} modes  `attackModes` or `rowAttackModes`
 * @returns {"hand"|null}
 */
function handIfAny(modes) {
  return (modes ?? []).includes("hand") ? "hand" : null;
}

/**
 * What a Block takes off for this defender: 06 §6's four - five with 02 §7's
 * Shieldbearer - plus 08 §20's Drillborer Disk, and 04's Redoubt and Shield Wall
 * (D-772). Shield Wall's *a friendly target within 5 feet of you* is measured
 * here, at the Block's own door, between the nearest squares (D-732): somebody
 * other than the blocker (MY READING, for the lead - a blocker within 5 feet of
 * themselves would make the clause say nothing), on the blocker's side
 * (`countsAsAlly`, D-755).
 *
 * @param {Actor} actor
 * @returns {number}
 */
function blockOffFor(actor) {
  const talents = actor?.takenTalents?.() ?? [];
  const feet = blockAllyFeet(talents);
  const talent = blockBonusFor(talents, { allyNear: feet !== null && allyWithin(actor, feet) });
  return blockReduction({
    bonus: (actor?.system?.signatureEffects?.blockBonus ?? 0) + talent.bonus,
    shieldbearer: actor?.hasFeature?.(SHIELDBEARER) === true
  });
}

/**
 * Whether another creature on this one's side stands within `feet` of it, on
 * the viewed scene (D-772, Shield Wall). Measured between the nearest squares
 * (D-732) through `canvas/footprints.mjs`; a creature with no token here has
 * nobody beside it.
 *
 * @param {Actor} actor
 * @param {number} feet
 */
function allyWithin(actor, feet) {
  const own = actor?.getActiveTokens?.(true)?.[0] ?? null;
  if (!own || !globalThis.canvas?.ready) return false;
  const fight = actor.activeFight?.() ?? null;
  const mine = allyStandingOf({ token: own.document, actor, combatant: combatantIn(fight, actor, own.document), fight });
  for (const token of canvas.tokens?.placeables ?? []) {
    if (!token?.actor || token.id === own.id || token.actor === actor) continue;
    const theirs = allyStandingOf({ token: token.document, actor: token.actor, combatant: combatantIn(fight, token.actor, token.document), fight });
    if (!countsAsAlly(mine, theirs)) continue;
    const d = feetApart(own, token);
    if (typeof d === "number" && d <= feet) return true;
  }
  return false;
}

/**
 * The Parry and Block rows an incoming attack's card offers, one per target
 * (06 §6, D-693).
 *
 * **The card is built by the ATTACKER and read by the DEFENDER**, so the row
 * carries the defender's uuid and `dice/chat.mjs` removes any row this client
 * does not own. A row appears only where the defender could make that Reaction
 * at all - a Parry button on somebody holding no weapon is noise on every card
 * - and the door checks everything again at the press, because the card is a
 * record of a moment and the world moves under it. `blockOff` is the BUTTON'S
 * LABEL for the same reason and is worked out again at the press: a Signature
 * gated on *while you have not moved this turn* can stop holding between the
 * swing and the answer.
 *
 * @param {Array<object>} targets  the snapshots the dialog built
 */
export function reactionRows(targets = [], { attacker = null, hidden = false } = {}) {
  // **AN ATTACK NOBODY MAY ANSWER** (04's Titan's Presence: *Your attacks cannot
  // be Parried or Blocked. Armor Points still apply*; D-772): the card offers
  // neither, and the Armor Points are the mitigation's as they always were. And
  // 04's Ghostly Strike (*An attack you make while hidden cannot be Parried or
  // Blocked*; D-773), for a blow struck from hiding.
  const cannotParryOrBlock = Boolean(attacker && unanswerableWith(attacker.takenTalents?.() ?? [], { hidden: hidden === true }));
  // **AND A STRIKER NO CREATURE MAY TAKE A REACTION AGAINST** (04's Wind Walk and
  // Bladestorm; the Legacy branches' door 14): no Parry, no Block, no Afterimage.
  if (attacker && unansweredOf(attacker).length) return [];
  const out = [];
  for (const [index, snapshot] of targets.entries()) {
    const actor = targetActorOf(snapshot);
    if (!actor) continue;
    const state = reactionStateOf(actor);
    if (state.seduced) continue;
    const rows = cannotParryOrBlock ? [] : defensiveReactions(state);
    const block = rows.find(r => r.key === "block") ?? {};
    const parry = rows.find(r => r.key === "parry") ?? {};
    // **A HIT TURNED INTO A MISS** (04's Afterimage: *As a Reaction when an attack
    // hits you, spend 6 Rage. The attack misses*; the Legacy branches' door 13): the
    // feature a talent grants with `onUse.mitigate: "negate"` and a use left, pressed
    // from this row through the feature's own door, which judges it all again.
    const negate = cannotParryOrBlock ? null : negateFeatureOf(actor);
    const phaseShift = actor.type === "npc" && actor.system?.health?.value > 0
      && actor.system?.creatureAbilities?.some(row => row.name === "Phase Shift")
      && !state.phaseShifted && !state.asleep && !state.disoriented && !state.spiritRealm
      && !actor.statuses?.has("stunned") && (!state.inFight || state.reactionsLeft > 0 || state.lostToBlow);
    if (!block.ok && !parry.ok && !negate && !phaseShift) continue;
    out.push({
      index,
      name: snapshot.name ?? actor.name,
      actorUuid: actor.uuid,
      block: block.ok ? block.with : null,
      blockOff: blockOffFor(actor),
      parry: parry.ok ? parry.with : null,
      negate, phaseShift
    });
  }
  return out;
}

/**
 * **THE FEATURE THAT TURNS THIS CREATURE'S HIT INTO A MISS** (04's Afterimage; door
 * 13): a granted feature whose talent's `onUse` negates, with a use left - the
 * first by name. Null where it holds none, so the card draws no button.
 *
 * @param {Actor} actor  the creature struck
 * @returns {{id: string, name: string}|null}
 */
export function negateFeatureOf(actor) {
  if (actor?.type !== "character") return null;
  const found = (actor.items ?? []).filter(item => {
    if (item.type !== "feature") return false;
    const grantId = item.getFlag?.("azeroth-rpg", "feature")?.talentId ?? null;
    const granting = grantId ? actor.items.get(grantId) ?? null : null;
    if (!granting) return false;
    const row = talentEffect(granting.system?.className, granting.system?.identifier, granting.system?.race ?? null);
    if (!onUseLegacy(onUseOf(row), { rank: granting.system?.taken ?? 1 }).negate) return false;
    return !(item.system?.uses?.per && (item.system.uses.value ?? 0) <= 0);
  }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return found[0] ? { id: found[0].id, name: found[0].name } : null;
}

/**
 * Answer an incoming blow with a Reaction (06 §6).
 *
 * The order is the house order: refuse in words, pay, then act. The Reaction
 * is spent whether a Parry holds or misses - *it costs a roll* - and a
 * dismissed Parry dialog still costs it, exactly as a dismissed attack dialog
 * costs nothing but a pressed one costs the Half-Action.
 *
 * **The Momentum is the other half of Parry's price and it is NOT spent by a
 * dismissed dialog** (D-720): the Reaction buys the chance to answer, the
 * point buys the Attack Test, and `parryNow` pays it once the card exists.
 *
 * @param {Actor} actor        the defender
 * @param {"block"|"parry"} reaction
 * @param {object} [o]
 * @param {number|null} [o.attackTotal]  the attacker's total, which is a Parry's DC
 * @param {string|null} [o.messageId]    the attack's card, so a second press is refused
 * @param {number|null} [o.targetIndex]  which row of the card was answered, so the
 *   Apply button's number can move (D-720)
 */
/** Read the same ranged-Parry eligibility before a GM claim and before payment. */
export function parryRangeContext(actor, { messageId = null, targetIndex = null } = {}) {
  const card = messageId ? game.messages?.get(messageId) : null;
  const rangeKind = card?.flags?.["azeroth-rpg"]?.strike?.rangeKind ?? null;
  if (!rangeKind || rangeKind === "melee") return { ok: true, mark: null, mine: null, ranged: null };
  const scene = (card?.speaker?.scene && game.scenes?.get(card.speaker.scene)) || globalThis.canvas?.scene || null;
  const striker = card?.speaker?.token ? scene?.tokens?.get(card.speaker.token)?.object : null;
  const struck = answeredToken(actor, messageId, targetIndex);
  const own = struck?.tokenId ? scene?.tokens?.get(struck.tokenId)?.object : actor.getActiveTokens?.(true)?.[0];
  const fight = actor.activeFight?.() ?? null;
  const mine = fight?.getCombatantsByActor?.(actor)?.[0] ?? null;
  const round = mine?.getFlag("azeroth-rpg", "round") ?? {};
  const ranged = rangedParryFor(actor.takenTalents?.() ?? []);
  return { ...parryReaches({ rangeKind, feet: striker && own ? feetApart(striker, own) : null,
    ranged, used: round.number === fight?.round ? round.once ?? [] : [] }), mine, ranged };
}

export async function reactWithDialog(actor, reaction, { attackTotal = null, messageId = null, targetIndex = null, event = null, blockCommit = null, parryCommit = null } = {}) {
  if (!actor) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Reaction.Refuse.Gone"));
    return null;
  }
  if (!actor.isOwner) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: actor.name }));
    return null;
  }
  const refuseAttackState = () => {
    const card = messageId ? game.messages?.get(messageId) : null;
    const refusal = parryCommit !== null ? (reaction === "parry" && parryCommitValid(parryCommit, actor, messageId, targetIndex) ? null : "commit")
      : blockCommit !== null ? (reaction === "block" && blockCommitValid(blockCommit, actor, messageId, targetIndex) ? null : "commit")
      : messageId && !card ? "gone"
      : attackReactionRefusal(card?.getFlag("azeroth-rpg", "attackResolution"), targetIndex, actor.uuid);
    if (!refusal) return false;
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Reaction.Refuse.AttackState"));
    return true;
  };
  if (refuseAttackState()) return null;
  const trackedCard = messageId ? game.messages?.get(messageId) : null;
  if (reaction === "block" && blockCommit === null && trackedCard?.getFlag("azeroth-rpg", "attackResolution"))
    return requestAttackBlock(actor, trackedCard, targetIndex);
  if (reaction === "parry" && parryCommit === null && trackedCard?.getFlag("azeroth-rpg", "attackResolution"))
    return requestAttackParry(actor, trackedCard, targetIndex);
  if(reaction==='parry'&&parryCommit===null&&hasParrySignature(actor))
    return requestStandaloneParry(actor,attackTotal,{message:trackedCard,index:trackedCard?targetIndex:null});
  // The blow's striker (the Legacy branches' door 14: no Reaction against one Wind
  // Walk or Bladestorm holds unanswerable), and whether the blow took this creature's
  // own Reaction (door 13: the answer may be that one).
  const striker = messageId ? (ChatMessage.getSpeakerActor(game.messages?.get(messageId)?.speaker ?? {}) ?? null) : null;
  const state = reactionStateOf(actor, { messageId, against: striker, targetIndex });
  const may = canReact(reaction, state);
  if (!may.ok) {
    ui.notifications?.warn(game.i18n.format(may.reason, {
      name: actor.name, reaction: game.i18n.localize(AZEROTH.reactions[reaction] ?? reaction),
      source: unansweredOf(striker).join(", ")
    }));
    return null;
  }
  // A halving already waiting on the next blow (04's Survival Instincts, a
  // Signature's press) is never written over by the Reaction, which would lose
  // what it was bought with in silence (`standingMarkRefusal`, D-771). Asked
  // before the Reaction is spent.
  if (reaction === "parry" && refuseDisarmedParry(actor, may.with)) return null;
  const stands = standingMarkRefusal(actor.getFlag?.("azeroth-rpg", "mitigate") ?? null, { door: "reaction" });
  if (stands) {
    ui.notifications?.warn(game.i18n.format(stands.key, { name: actor.name, ...stands.params }));
    return null;
  }
  // **THE ANSWER IS WRITTEN ON THE STRIKER'S CARD** (the B1 review; D-774's review): a
  // Parry that holds and a Block annotate the card they answer, on the GM's client
  // where this one may not write it - so with no GM online the Reaction is refused
  // here, before the Anticipation mark, the free mark or the Reaction is spent, exactly
  // as Afterimage's own Use is.
  const answeredCard = messageId ? (game.messages?.get(messageId) ?? null) : null;
  if (answeredCard && cardPressUnrecordable(answeredCard)) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.PressNoGM"));
    return null;
  }
  // **A PARRY ANSWERS A MELEE BLOW** (the lead, 2026-10-03, on O-180: *"Parry is
  // limited to melee unless a feature allows ranged parry."*; D-779): judged again
  // at the press off the card's own record of how the blow was struck, the striker's
  // token and the one struck. A ranged or thrown blow needs 04's Anticipation within
  // its feet and a mark of its round left - taken through the queued door before
  // the Reaction, and refused in words with nothing spent where it cannot be.
  if (reaction === "parry") {
    const verdict = parryRangeContext(actor, { messageId, targetIndex });
    const { mine, ranged } = verdict;
    if (!verdict.ok) {
      ui.notifications?.warn(game.i18n.format(verdict.reason, { name: actor.name, talent: ranged?.name ?? "", feet: ranged?.feet ?? 0 }));
      return null;
    }
    if (verdict.mark && mine?.isOwner && !((await mine.markRoundOnce(verdict.mark))?.added === true)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.Refuse.ParryRangedSpent", { name: actor.name, talent: ranged?.name ?? "", feet: ranged?.feet ?? 0 }));
      return null;
    }
  }
  // 06 §6: one Reaction a round. Paid before anything else happens, and the
  // budget's own refusal stands if it has moved since the card was posted.
  // **UNLESS THIS ONE COSTS NONE** (04's Bladeturn and Deflection, D-772): the
  // round's next free mark, taken through the queued door, in place of the
  // Reaction - and where another press took it first, the Reaction is paid.
  // **THE REACTION THE BLOW TOOK IS THE ONE THAT ANSWERS IT** (the Legacy branches'
  // door 13): a creature a Bash left with none spends none here - the blow already
  // took it - and the withdrawal then gives nothing back (`answeredWithLost`). **Asked
  // BEFORE the free mark** (the B1 fix run): a Bladeturn's free Parry is taken only
  // where something would otherwise pay, so the lost Reaction answering keeps it for a
  // later blow.
  if (refuseAttackState()) return null;
  const answeredWithLost = state.lostToBlow === true && (state.reactionsLeft ?? 0) < 1;
  let freeBy = null;
  if (!answeredWithLost) {
    const free = freeReactionOf(actor, reaction);
    if (free?.combatant?.isOwner && (await free.combatant.markRoundOnce(free.mark))?.added === true) freeBy = free.name;
  }
  if (!freeBy && !answeredWithLost && !(await game.system.azeroth.workflows.spendTurnBudget(actor, "reaction"))) return null;
  // A free defensive reaction is still a reaction and interrupts a channel.
  // Paid reactions already trigger the combatant hook; the second check is
  // harmless and also waits for the GM acknowledgement before resolution.
  const { interruptWhirlwindForAction } = await import("../effects/syndicate-whirlwind-use.mjs");
  if (!await interruptWhirlwindForAction(actor)) return null;
  if (blockCommit !== null && !blockCommitValid(blockCommit, actor, messageId, targetIndex)) throw Error("Block claim changed");
  if (parryCommit !== null && !parryCommitValid(parryCommit, actor, messageId, targetIndex)) throw Error("Parry claim changed");
  await actor.setFlag("azeroth-rpg", "reacted", { messageId: messageId ?? null, reaction });
  if (parryCommit !== null) recordParryOutcome(parryCommit, "started");
  return reaction === "block"
    ? blockNow(actor, may.with, messageId, targetIndex, { freeBy })
    : parryNow(actor, may.with, { attackTotal, messageId, targetIndex, event, freeBy, answeredWithLost, parryCommit });
}

/**
 * *A class that builds Momentum, and 1 Momentum (a Rogue pays 1 Energy)*
 * (06 §6, D-720). The pool was checked at the door (`canReact`) and is spent
 * once there is a roll to spend it on.
 *
 * **A DISMISSED DIALOG IS NOT A PARRY.** This used to run before the dialog
 * opened, so closing that window took the point and gave nothing back - the
 * one place in this system where a cancelled dialog charged for something. The
 * Reaction is still spent, because `reactWithDialog` pays it at the door and
 * 06 charges the attempt; what the point buys is the Attack Test, and there is
 * no Test until the card exists.
 *
 * @returns {Promise<{name: string, cost: number}|null>} what was spent, for the card's line
 */
async function payParry(actor) {
  const purse = parryPoolFor(actor.poolSnapshot?.() ?? []);
  if (!purse || (purse.value ?? 0) < PARRY_COST) return null;
  await actor.updatePool({ itemId: purse.itemId, kind: purse.kind, value: purse.value - PARRY_COST });
  // A creature's block names no pool type at all (D-637), so the generic word
  // is what a creature's Parry line reads.
  return { name: game.i18n.localize(AZEROTH.poolTypes[purse.name] ?? "AZEROTH.Momentum.Label"), cost: PARRY_COST };
}

/**
 * *Reduce the damage of one attack by 4.* Certain, and it needs no roll.
 *
 * It rides the mark `AzerothActor#applyDamage` already spends for a
 * Signature's *halve the damage* (D-692) rather than a second lane: **one
 * attack** is a count and not a span, so a mark is right where a duration
 * would take it off whichever blow happened to land inside the window.
 */
async function blockNow(actor, shield, messageId, targetIndex = null, { freeBy = null } = {}) {
  const off = blockOffFor(actor);
  const mark = {
    name: game.i18n.localize("AZEROTH.Reaction.Block"),
    halve: false, amount: off, negate: false,
    // The BONUS travels beside the total (D-720), so `mitigatedDamage` works
    // the number out through `blockedDamage` rather than trusting a figure a
    // card may have been written with.
    bonus: Math.max(0, off - BLOCK_REDUCTION),
    reaction: "block", messageId: messageId ?? null
  };
  await actor.setFlag("azeroth-rpg", "mitigate", mark);
  // The card said **Apply 9** after a Block had taken four off it, because the
  // mark is spent inside `applyDamage` and nothing wrote back (the lead's 8).
  const annotated = await annotateMitigation({ messageId, index: targetIndex, mark, reaction: "block" });
  if (game.messages?.get(messageId)?.getFlag("azeroth-rpg", "attackResolution") && !annotated)
    throw Error("Block annotation was not confirmed");
  // **HOLY SHIELD** (04: *Whenever you Block, the attacker takes Holy damage
  // equal to your rank*; D-772): the blow back at whoever swung, mitigated
  // against the attacker's own Ward as any Holy damage is, and an Apply on this
  // message - the indexed row `dice/chat.mjs#applyDamageToTargets` already reads.
  const retort = retortOf(actor, messageId);
  const free = freeBy ? ` ${game.i18n.format("AZEROTH.Reaction.FreeBy", { talent: freeBy })}` : "";
  const lines = [`<p class="azeroth-drain">${game.i18n.format("AZEROTH.Reaction.Blocked", { name: actor.name, with: shield, n: off })}${free}</p>`];
  if (retort) {
    lines.push(`<p class="azeroth-card-line azeroth-fired"><span>${foundry.utils.escapeHTML(retort.name)}</span><em>${game.i18n.format("AZEROTH.HolyShield.Line", { target: foundry.utils.escapeHTML(retort.target.name ?? ""), n: retort.result.damage })}</em></p>`);
    lines.push(`<div class="azeroth-card-actions"><button type="button" data-action="applyDamage" data-target-index="0" data-damage="${retort.result.damage}">${game.i18n.format("AZEROTH.Card.ApplyTo", { name: foundry.utils.escapeHTML(retort.target.name ?? "") })} <strong>${retort.result.damage}</strong></button></div>`);
  }
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    // A plain line as it always was; a card where Holy Shield gives it a button.
    content: retort ? `<div class="azeroth azeroth-card azeroth-card-attack"><div class="azeroth-card-body">${lines.join("")}</div></div>` : lines.join(""),
    flags: { "azeroth-rpg": {
      kind: "reaction", reaction: "block", amount: off,
      // The blow back is no attack (the retaliation's ruling, S1).
      ...(retort ? { targets: [retort.target], damageByTarget: [retort.result], damageType: retort.type, location: "body", notAttack: true } : {})
    } }
  });
}

/**
 * **THE BLOW HOLY SHIELD SENDS BACK** (D-772): what the blocker's talent deals
 * the attacker of the card being answered, mitigated against the attacker as a
 * target snapshot reads it - Ward, Immune, Vulnerable - or null where the
 * blocker holds no such talent or the attacker cannot be found.
 *
 * @param {Actor} actor  the blocker
 * @param {string|null} messageId  the attack's card
 */
function retortOf(actor, messageId) {
  const retort = blockRetortFor(actor?.takenTalents?.() ?? []);
  if (!retort || !messageId) return null;
  const message = game.messages?.get(messageId) ?? null;
  const speaker = message?.speaker ?? null;
  const attacker = message ? ChatMessage.getSpeakerActor(speaker) : null;
  if (!attacker) return null;
  const scene = (speaker?.scene && game.scenes?.get(speaker.scene)) || canvas?.scene || null;
  const token = speaker?.token ? scene?.tokens?.get(speaker.token) ?? null : null;
  const [snapshot] = token?.object ? targetSnapshots([token.object]) : targetSnapshots(attacker.getActiveTokens?.(true)?.slice(0, 1) ?? []);
  const target = snapshot ?? { tokenId: null, sceneId: null, actorId: attacker.id, name: attacker.name, wardBySchool: {}, schoolArmor: {}, immune: [], vulnerable: [] };
  const type = retort.type ?? null;
  const result = resolveDamage({
    rating: retort.amount, sl: 0, kind: type ? "magical" : "physical", school: type,
    ward: type ? (target.wardBySchool?.[type] ?? 0) : 0,
    schoolArmor: type ? (target.schoolArmor?.[type] ?? 0) : 0,
    immune: target.immune ?? [], vulnerable: target.vulnerable ?? [], slAddsToDamage: false,
    // The blocker's own damage, 04's Drawn Across on it halving it (the Legacy branches' door 25).
    dealtHalved: dealtHalvedBy(actor)
  });
  return { name: retort.name, target, type, result };
}

/**
 * *Roll an Attack Test against the attacker's total. Meet or beat it and the
 * attack deals no damage.* All or nothing, and it costs a roll.
 *
 * The Test goes through the roll dialog like every other (D-601), so the
 * weapon's Heavy Bane and the table's own lines apply. `budget: "none"` says
 * the Reaction was already paid, and `parry: true` says this Attack Test is
 * not an attack - no Critical Injury on a natural 20, and the verdict reads
 * Success rather than Hit.
 */
async function parryNow(actor, weaponName, { attackTotal, messageId, targetIndex = null, event, freeBy = null, answeredWithLost = false, parryCommit = null }) {
  // What is in hand is `readyWeapons` (D-769): a natural attack parries.
  const ready = actor.readyWeapons?.() ?? (actor.items ?? []).filter(i => i.type === "weapon" && i.system?.equipped);
  const weapon = ready.find(w => w.name === weaponName) ?? ready[0] ?? null;
  if (!weapon) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.Refuse.NoMelee", { name: actor.name }));
    return null;
  }
  const sys = weapon.system;
  // A Parry is made IN THE HAND (D-731): a Dagger that may be thrown still
  // parries with Strength, and never as a throw.
  const ability = attackAbility(sys, "hand");
  const strength = actor.system.abilities.str?.total ?? actor.system.abilities.str?.value ?? 10;
  const traitEffects = weaponTraitEffects(sys.traits ?? [], { strength });
  const card = await rollWithDialog(actor, {
    kind: "attack",
    parry: true,
    budget: "none",
    gainsMomentum: false,
    damage: null,
    title: game.i18n.format("AZEROTH.Reaction.ParryTitle", { name: weapon.name }),
    ...(attackTotal !== null ? { dc: attackTotal } : {}),
    weaponEffects: traitEffects,
    heavyBane: traitEffects.heavyBane,
    rangeKind: "melee",
    weaponId: weapon.id,
    modifiers: [
      { label: AZEROTH.abilities[ability], value: actor.system.abilities[ability].mod },
      { label: "AZEROTH.Sheet.Proficiency", value: actor.system.proficiency },
      // A Parry IS an Attack Test (06 §6), so a worn `+N Attack` reaches it
      // exactly as it reaches a swing. The Boon a parry rating grants is the
      // dialog's own line, off `system.grants.testBoonSources.parry`.
      ...(actor.system.attackBonus ? [{ label: "AZEROTH.Sheet.Passive", value: actor.system.attackBonus }] : []),
      ...(claimedParryBonus(parryCommit) ? [{label:claimedParryBonus(parryCommit).name,value:claimedParryBonus(parryCommit).amount}] : [])
    ],
    // WHAT THE PARRY IS MADE WITH, AND WHICH BLOW IT ANSWERS (D-724, D-725).
    // `rollTest` writes `parry: true` beside them, which is what tells a reader
    // this Attack Test is not an attack. Kept after the modifiers:
    // `grant-doors.test.mjs` reads this function's opening for the Attack grant.
    strike: strikeFor(weaponFacts(weapon), { mode: "hand" }),
    // A natural attack records its row's own words (D-769).
    ...(weapon.natural ? { strike: strikeForRow(weapon.natural.row, { index: weapon.natural.index, mode: "hand" }) } : {}),
    answers: messageId ? { messageId, index: Number.isInteger(targetIndex) ? targetIndex : null } : null,
    // And from the token that was struck, as the attack card's row recorded it
    // (D-726): a fact, where the selection is at best the roll dialog's rule.
    source: answeredToken(actor, messageId, targetIndex)
  }, event);
  // A dismissed dialog is a Parry not made: nothing is paid for it, and the
  // Reaction `reactWithDialog` spent at the door stands (D-720).
  if (parryCommit !== null && !parryCommitValid(parryCommit, actor, messageId, targetIndex)) throw Error("Parry claim changed");
  if (!card) { recordParryOutcome(parryCommit, "cancelled"); return null; }
  // *…and 1 Momentum (a Rogue pays 1 Energy)* (06 §6, D-720), now that there is
  // a Test to pay for: it holds or it misses and the point is gone either way.
  const paid = parryCommit !== null ? await payClaimedParry(parryCommit) : await payParry(actor);
  // **AND A PARRY NOBODY PAID FOR DOES NOT HOLD** (the final review,
  // 2026-09-13). `canReact` reads the pool at the DOOR and the dialog then
  // stays open while the world moves: a Finisher on another card, a Sunder, a
  // Charge can empty the pool between the offer and the confirmation, and
  // `payParry` then hands back null. The mark used to be laid anyway, so a
  // Warrior at 0 Rage negated the blow for free. The Reaction stays spent -
  // 06 charges the attempt, exactly as a dismissed dialog is charged - and
  // the blow lands.
  if (!paid) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.Refuse.NoMomentum", { name: actor.name }));
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.Reaction.ParryUnpaid",
        { name: actor.name, with: weapon.name })}</p>`,
      flags: { "azeroth-rpg": { kind: "reaction", reaction: "parry", held: false } }
    });
    recordParryOutcome(parryCommit, "unpaid", card);
    return card;
  }
  const roll = card.rolls?.[0] ?? null;
  const total = roll?.total ?? 0;
  const dc = roll?.options?.dc ?? attackTotal ?? 0;
  const held = parryHolds(total, dc);
  let built = "";
  if (held) {
    const mark = {
      name: game.i18n.localize("AZEROTH.Reaction.Parry"),
      halve: false, amount: null, negate: true,
      reaction: "parry", messageId: messageId ?? null
    };
    await actor.setFlag("azeroth-rpg", "mitigate", mark);
    const annotated = await annotateMitigation({ messageId, index: targetIndex, mark, reaction: "parry" });
    if (parryCommit !== null && messageId && !annotated) throw Error("Parry annotation was not confirmed");
    // **04's PERFECT TIMING** (*A Parry that reduces an attack's damage to 0 builds
    // 1 Combo Point*; D-773): 06 §6's Parry is all or nothing, so one that holds
    // is one that reduces the attack to 0. Never past the pool's cap.
    // A gain whose gate reads what is worn and held (04's Read the Blade; door 15).
    for (const gain of parryGainsFor(actor.takenTalents?.() ?? [], { facts: actor.gateFacts?.() ?? null })) {
      const pool = (actor.poolSnapshot?.() ?? []).find(p => p.name === gain.pool) ?? null;
      if (!pool) continue;
      const value = Math.min(pool.max, pool.value + gain.amount);
      if (value > pool.value) await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
      built += ` ${game.i18n.format("AZEROTH.Reaction.ParryBuilt", { talent: gain.name, n: value - pool.value, pool: game.i18n.localize(AZEROTH.poolTypes[pool.name] ?? pool.name) })}`;
    }
    // **WHAT THE PARRIED BLOW LANDED COMES BACK OFF** (the lead, 2026-10-03, on
    // O-166: *"No"* to *does a Parry leave a landed condition on?*; D-779): each
    // condition the card recorded landing on THIS defender with the blow - a rider's,
    // Deep Cut's, Ferocious Bite's, Rupture's Bleeding - is taken off, or put back to
    // the value it had before the blow (`class-answers.mjs#parryUndoes`). **And
    // everything else the hit laid** (the lead: *"Conditions only apply on hit unless
    // otherwise stated"*; the Legacy branches' door 13): a Speed drop, a no-healing
    // mark, a Bane, the Reaction it took - through the one withdrawal door Afterimage
    // shares (`effects/miss.mjs#withdrawHit`). The defender is this client's own
    // (`reactWithDialog` asked).
    const undone = await withdrawHit(actor, { messageId, index: targetIndex, answeredWithLost });
    if (undone.conditions.length) built += ` ${game.i18n.format("AZEROTH.Reaction.ParryUndid", { name: actor.name, conditions: undone.conditions.join(", ") })}`;
    const more = withdrawnWords(actor.name, { ...undone, conditions: [] });
    if (more) built += ` ${more}`;
  }
  // `paid` is never null here: the branch above returns on an unpaid Parry.
  const cost = ` ${game.i18n.format("AZEROTH.Reaction.ParryCost", { n: paid.cost, pool: paid.name })}`
    // A Parry that cost no Reaction says whose talent paid for it (04's Bladeturn, D-772).
    + (freeBy ? ` ${game.i18n.format("AZEROTH.Reaction.FreeBy", { talent: freeBy })}` : "")
    // What the Parry built (04's Perfect Timing, D-773).
    + built;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="azeroth-drain">${game.i18n.format(held ? "AZEROTH.Reaction.ParryHeld" : "AZEROTH.Reaction.ParryMissed",
      { name: actor.name, with: weapon.name, total, dc })}${cost}</p>`,
    flags: { "azeroth-rpg": { kind: "reaction", reaction: "parry", held } }
  });
  recordParryOutcome(parryCommit, held ? "held" : "missed", card);
  return card;
}

/**
 * The defender's token as an attack card's row recorded it (D-726), or null -
 * and null too where that row no longer names this creature, so a Parry is
 * never recorded as made from somebody else's token.
 *
 * @param {Actor} actor           the defender
 * @param {string|null} messageId the attack card
 * @param {number|null} index     the row answered
 * @returns {{sceneId: string|null, tokenId: string}|null}
 */
function answeredToken(actor, messageId, index) {
  if (!actor || !messageId || !Number.isInteger(index)) return null;
  const row = game.messages.get(messageId)?.flags?.["azeroth-rpg"]?.targets?.[index] ?? null;
  if (!row?.tokenId || targetActorOf(row)?.id !== actor.id) return null;
  return { sceneId: row.sceneId ?? null, tokenId: row.tokenId };
}

/**
 * *One attack against them at the moment they leave* (06 §6).
 *
 * The offer is made by `documents/combat.mjs` off the movement itself; this is
 * the door the card's button presses, and it is the threatener's own client
 * that presses it - **the attack is theirs to make and the timing is theirs**,
 * so nothing here happens automatically.
 *
 * Three things about the blow that are not obvious:
 *
 * - **It spends the Reaction and nothing else.** `budget: "none"` tells
 *   `rollTest` the caller has paid, exactly as a Parry does, so no Half-Action
 *   is charged. 06 gives the Reaction as the price and 05 §10's Attacks are
 *   bought with the Half-Actions of your own turn (D-711); a reading where they
 *   shared a counter would make this row dead for anybody who had already
 *   swung.
 * - **The distance is the one measured when they left**, handed in on the
 *   card, because by the time anybody presses the button the target is out of
 *   reach and D-669's refusal would eat every Opportunity Attack in the game.
 * - **The target is set for the presser**, since both attack doors read
 *   `game.user.targets`. A token on another scene cannot be targeted and the
 *   blow then rolls without a damage row, which is what an untargeted attack
 *   has always done.
 *
 * @param {Actor} actor  the threatener
 * @param {object} o
 * @param {string|null} [o.tokenId]   the mover's token
 * @param {string|null} [o.sceneId]
 * @param {number|null} [o.distance]  feet at the moment they left
 * @param {string|null} [o.messageId] the offer's card, so a second press is refused
 */
export async function takeOpportunity(actor, { tokenId = null, sceneId = null, distance = null, messageId = null, event = null } = {}) {
  if (!actor) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Reaction.Refuse.Gone"));
    return null;
  }
  if (!actor.isOwner) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: actor.name }));
    return null;
  }
  // Aim at whoever is leaving, before anything is spent: a target that cannot
  // be set is worth saying so about while the Reaction is still in hand.
  const scene = (sceneId && game.scenes.get(sceneId)) || canvas?.scene || null;
  const token = tokenId && scene ? scene.tokens.get(tokenId) : null;
  // **NO REACTION AGAINST A MOVER WIND WALK HOLDS** (the Legacy branches' door 14),
  // judged at the press - a card is a record of a moment.
  const may = canReact("opportunityAttack", reactionStateOf(actor, { messageId, against: token?.actor ?? null }));
  if (!may.ok) {
    ui.notifications?.warn(game.i18n.format(may.reason, {
      name: actor.name, reaction: game.i18n.localize(AZEROTH.reactions.opportunityAttack),
      source: unansweredOf(token?.actor ?? null).join(", ")
    }));
    return null;
  }
  const onCanvas = Boolean(token) && canvas?.scene?.id === scene?.id && Boolean(canvas.tokens?.get(tokenId));
  // **AND WHAT THE USER HAD TARGETED IS PUT BACK** (the lead, 2026-09-13).
  // `setTargets` REPLACES the set (14.367, `mode: "replace"` by default), and
  // this is the only place in the system that re-targets for the user: an
  // Opportunity Attack taken mid-turn silently dropped whoever the presser had
  // been aiming at, and the next attack then rolled with no damage row. The
  // restore is in a `finally` below, because the whole blow is awaited.
  //
  // **THE SNAPSHOT IS TAKEN OUTSIDE THE `try` AND EVERY REPLACEMENT INSIDE IT**
  // (the final review, 2026-09-13). The re-target and the budget's refusal used
  // to sit above the block, so a Reaction already spent this round returned
  // null with the mover still targeted and the presser's own aim gone - the
  // exact fault the restore was written for, on the one path that reaches it
  // most often.
  const previous = onCanvas ? [...(game.user.targets ?? [])].map(t => t.id) : null;
  const title = game.i18n.localize("AZEROTH.Reaction.OpportunityAttack");
  // The whole blow is AWAITED so the user's own targets can be put back after
  // it. A `finally`, not a trailing line: a refusal inside the dialog throws
  // out of here and a restore on the next line would never run (D-628's own
  // scar, and CLAUDE.md §20's break-test note says the same).
  try {
    if (onCanvas) canvas.tokens.setTargets([tokenId]);
    else ui.notifications?.info(game.i18n.format("AZEROTH.Reaction.OpportunityOffScene", { name: token?.name ?? "" }));

    // 06 §6: one Reaction a round, paid before the die. **UNLESS IT COSTS NONE** (04's
    // Hold the Hall at rank 2: *your first Opportunity Attack each round costs no
    // Reaction*; the Legacy branches' door 22): the round's free mark, taken through
    // the queued door, in place of the Reaction - and where another press took it
    // first, the Reaction is paid.
    const freeOpportunity = freeReactionOf(actor, "opportunityAttack");
    const freeTaken = Boolean(freeOpportunity?.combatant?.isOwner) && (await freeOpportunity.combatant.markRoundOnce(freeOpportunity.mark))?.added === true;
    if (!freeTaken && !(await game.system.azeroth.workflows.spendTurnBudget(actor, "reaction"))) return null;
    if (freeTaken) ui.notifications?.info(game.i18n.format("AZEROTH.Reaction.FreeBy", { talent: freeOpportunity.name }));
    await actor.setFlag("azeroth-rpg", "reacted", { messageId: messageId ?? null, reaction: "opportunityAttack" });

    // **AN OPPORTUNITY ATTACK PREFERS THE HAND AND NEVER FORCES IT** (D-731's
    // review). 06 §6's row is *one attack against them at the moment they
    // leave*, not a melee attack: a Dagger that may be thrown is struck in the
    // hand, and a row or a weapon that only throws or shoots answers in its own
    // way. Whether a creature should reach past its first row for a melee one
    // is the lead's call (D-731).
    if (actor.type === "npc") {
      const rows = actor.system?.attacks ?? [];
      // The block's own row, by the name `reactionStateOf` offered.
      const index = rows.findIndex(a => a?.name === may.with);
      if (index >= 0) return await npcAttackWithDialog(actor, index, event, { title, budget: "none", mode: handIfAny(rowAttackModes(rows[index])) });
      // **OR WHAT A GM PUT IN ITS HANDS** (the lead's N2, 2026-09-10): the name is
      // a held weapon's, and the blow goes through the door a character's goes
      // through - which is the whole point of routing a creature's held weapon
      // there rather than teaching the block's own path about Items.
      const held = heldFor(actor, may.with);
      if (held) return await attackWithDialog(actor, held, event, { budget: "none", atDistance: distance, mode: handIfAny(attackModes(held.system)), opportunity: true });
      // A name that matches neither is a card the world has moved under; the
      // block's first row is what this has always fallen back to.
      if (rows.length) return await npcAttackWithDialog(actor, 0, event, { title, budget: "none", mode: handIfAny(rowAttackModes(rows[0])) });
    }
    // What is in hand, through `readyWeapons` (D-769): a shifted character
    // answers with its block's own row.
    const weapon = heldFor(actor, may.with) ?? (actor.readyWeapons?.() ?? [])[0] ?? null;
    if (!weapon) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.Refuse.NoWeapon", { name: actor.name }));
      return null;
    }
    // An Opportunity Attack is marked one (the Legacy branches' door 22): 04's Hold the
    // Hall's *On a hit it is knocked Prone* rides it alone (`hitLays`, `when: "opportunity"`).
    return await attackWithDialog(actor, weapon, event, { budget: "none", atDistance: distance, mode: handIfAny(attackModes(weapon.system)), opportunity: true });
  } finally {
    // Only where this replaced them, and only while the same scene is still
    // in view: `setTargets` reads ids off the viewed canvas, so putting a
    // previous scene's targets back would quietly target nothing.
    if (previous && canvas?.scene?.id === scene?.id) canvas.tokens.setTargets(previous);
  }
}

/**
 * Roll a Test through the dialog - or, under the skip setting or a shift
 * click, straight through what the dialog would have opened on.
 *
 * @param {Actor} actor
 * @param {object} spec   { kind, title, skill, dc, location, modifiers, damage }
 * @param {Event|null} [event]
 */
export async function rollWithDialog(actor, spec, event = null) {
  const firstPrepared = typeof spec.rebuildSecond === "function" ? prepareRoll(actor, spec) : null;
  const preparedModes = firstPrepared && spec.modes ? Object.fromEntries(Object.keys(spec.modes)
    .map(mode => [mode, prepareRoll(actor, withAttackMode(spec, mode))])) : null;
  const choice = spec.extraWeapons || shouldPrompt(event) ? await promptRoll(actor, spec) : defaultChoice(actor, spec);
  if (!choice) return null;
  if (spec.extraWeapons && (!extraAttackSelection(spec.extraWeapons, choice.extraWeapon)
    || !spec.validateExtra?.(choice.extraWeapon))) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Dialog.ExtraWeaponUnavailable"));
    return null;
  }
  // **THE WAY THE ROLLER CHOSE IS THE BLOW THAT IS ROLLED** (D-731). A weapon
  // struck in the hand or thrown arrives with one variant per way under
  // `modes`, and the chosen one is laid over the spec BEFORE anything below
  // reads it: the ability's modifier line, the range kind, the band, the
  // Engaged flag and the strike record all come from that way, so the card
  // the workflow posts is the blow the dialog showed. `modes` itself is the
  // dialog's input and never the roll's. An Extra Attack's second roll is made
  // from these same arguments, so it inherits the way: one blow, two rolls.
  //
  // The dialog's own inputs are not the roll's: `skill` feeds the suit's
  // Banes, `casting` and `occasions` shape the form, `run` names the workflow,
  // and `rolls` is how many Tests one Attack makes (02 §6, D-704).
  // `damageLines` is the dialog's own input too (04, D-711 phase 2): what the
  // roller left ticked arrives back as `extraRating` and `damageRows`.
  // `talentLineOffer` is the dialog's own input too (D-774): what the roller
  // ticked arrives back as `talentLines`, the identifiers alone.
  const { skill, casting, occasions, fallbackDC, fallbackSource, heavyBane, damageLines, talentLineOffer, run, rebuildSecond, rolls, modes, riderModifiers, extraWeapons, validateExtra, ...roll } = withAttackMode(spec, choice.mode);
  void extraWeapons; void validateExtra;
  void skill; void casting; void occasions; void fallbackDC; void fallbackSource; void heavyBane; void damageLines; void talentLineOffer; void modes;
  // The second roll's target is the dialog's answer and never the roll's input.
  const { secondTargets, extraWeapon, ...picked } = choice;
  let workflow = run ?? game.system.azeroth.workflows.rollTest;
  // The spec's own provenance rows (an item's name, a bond's damage bonus, a
  // swarm's note) join the dialog's circumstance row rather than losing to it.
  const provenanceExtra = [...(roll.provenanceExtra ?? []), ...(picked.provenanceExtra ?? [])];
  // **A THROW MADE ON A TICKED RIDER'S ABILITY** (04's Storm Bolt with a hammer that
  // throws already: *an attack made with one uses Strength*; the B6 review): the
  // thrown way's lines on Strength where the rider is ticked, its own otherwise.
  const baseModifiers = riderThrowModifiers({ riderModifiers }, picked.riders ?? []) ?? roll.modifiers;
  // A checked line with a flat number joins the modifiers (a rung's +1, 10 §4).
  const modifiers = picked.modifier
    ? [...(baseModifiers ?? []), { label: "AZEROTH.Dialog.Circumstance", value: picked.modifier }]
    : baseModifiers;
  const args = { actor, ...roll, ...picked, ...(modifiers !== roll.modifiers ? { modifiers } : {}), provenanceExtra };
  // Validate the chosen weapon and its range/ammunition before spending the
  // first attack. Rebuild again after it lands to use the resulting live state.
  if (spec.extraWeapons && !await rebuildSecond({ args, secondTargets, extraWeapon, firstCard: null })) return null;
  // Check the chosen attack mode after the dialog, for both a block's natural
  // attack and a weapon given to the creature. Both Extra Attack rolls use this
  // wrapper; Reaction attacks and non-damaging opposed Tests do not.
  const wrapWorkflow = ordinaryWorkflow => {
    if (args.kind === "attack" && args.damage && (args.rangeKind ?? args.strike?.rangeKind) === "melee"
      && args.budget !== "none" && args.budget !== "reaction"
      && actor.system?.creatureAbilities?.some(ability => ability.name === "Shifting Aggression")) {
      const attackSource = args.source ?? sourceOf(actor);
      return annihilatorAttackWorkflow({
        actor,
        workflow: attempt => ordinaryWorkflow({ ...attempt, source: attackSource }),
        observe: attempt => annihilatorSceneTargets({ actor, source: attackSource,
          targets: attempt.targets ?? targetSnapshots(),
          traits: (attempt.traits ?? []).map(trait => typeof trait === "string" ? trait : trait.name) }),
        refused: reason => ui.notifications?.warn(game.i18n.localize(`AZEROTH.LavaAnnihilator.${reason}`))
      });
    }
    return ordinaryWorkflow;
  };
  workflow = wrapWorkflow(workflow);
  const card = await workflow(args);
  // **ONE ATTACK, TWO CARDS** (02 §6, D-704). The two rolls may be at different
  // creatures and a card's Parry, Block, Apply damage and Critical Injury
  // buttons are all per target, so one card carrying two would break every one
  // of them. Each roll posts its own, exactly as a second Attack action did.
  // A first roll that refused - an empty bundle, a budget that could not pay -
  // returns null and there is no second.
  if ((rolls ?? 1) < 2 || !card) return card;
  if (typeof rebuildSecond === "function") {
    const next = await rebuildSecond({ args, secondTargets, extraWeapon, firstCard: card });
    if (!next) return card;
    const nextMode = withAttackMode(next, spec.extraWeapons ? next.mode : choice.mode);
    const refreshed = refreshedSecondAttackChoice(actor, { ...nextMode, source: args.source }, preparedModes?.[choice.mode] ?? firstPrepared,
      { ...choice, mode: nextMode.mode });
    const { run: nextRun, rebuildSecond: ignoredRebuild, rolls: ignoredRolls, modes: ignoredModes,
      riderModifiers: nextRiderModifiers, ...nextRoll } = nextMode;
    void ignoredRebuild; void ignoredRolls; void ignoredModes;
    const paidRiders = card.flags?.["azeroth-rpg"]?.ridden ?? [];
    const nextBaseModifiers = riderThrowModifiers({ riderModifiers: nextRiderModifiers }, paidRiders) ?? nextRoll.modifiers;
    const nextModifiers = refreshed.modifier
      ? [...(nextBaseModifiers ?? []), { label: "AZEROTH.Dialog.Circumstance", value: refreshed.modifier }]
      : nextBaseModifiers;
    const second = { actor, ...nextRoll, ...refreshed,
      ...secondRollOverrides(actor, { ...args, ...nextRoll }, nextRoll.targets),
      source: args.source, modifiers: nextModifiers,
      provenanceExtra: [...(nextRoll.provenanceExtra ?? []), ...(refreshed.provenanceExtra ?? [])] };
    const confirmed=await confirmBandExtraAttack(actor,second);
    if(confirmed)await wrapWorkflow(nextRun ?? game.system.azeroth.workflows.rollTest)(confirmed);
    return card;
  }
  // The second card records the same blow: `strike` and `source` ride `args`
  // and nothing the second roll overrides names either (D-724, D-725).
  const confirmed=await confirmBandExtraAttack(actor,{ ...args, ...secondRollOverrides(actor, args, secondTargets) });
  if(confirmed)await workflow(confirmed);
  return card;
}

/**
 * What changes on the second roll of an Extra Attack (02 §6, D-704).
 *
 * - **The budget is spent ONCE.** `budget: "none"` already means *the caller
 *   has paid* (06 §6's Parry, D-693); nothing new was invented for this.
 * - **The called shot is declared once and paid once.** The Momentum came off
 *   before the first die (06 §2) and the location travels with the blow;
 *   charging it again would refuse the second roll outright on a pool that
 *   cannot pay twice, which is a worse answer than a Bane the card prints.
 * - **A different target takes its own rows.** `struckBack` and `reactions` are
 *   resolved per target at the attack door, and `data-target-index` indexes the
 *   card's own target list - a Parry button offered to a creature this blow
 *   never reached is a Reaction spent on nothing.
 */
function secondRollOverrides(actor, args, secondTargets) {
  const second = {
    budget: "none",
    momentumSpent: 0,
    // 02 §7's Finisher is *one attack* and was paid before the first die
    // (D-711 phase 2); charging it again would empty a pool that has nothing
    // left, exactly as the called shot's Momentum would.
    finisherSpent: 0,
    // A rider is spent *as part of an attack* (04, D-770), and Extra Attack is
    // ONE Attack with two rolls (D-704): it was paid with the first, and its
    // on-hit rides the first roll's card.
    riders: [],
    // Nor any talent line (D-774): Static Charge's tier rode the first roll.
    talentLines: [],
    // And what *a melee attack* earns rides the first roll alone (04's
    // Earthliving, D-774): one Attack, two rolls.
    secondRoll: true,
    subtitle: [args.subtitle, game.i18n.localize("AZEROTH.Attack.SecondRoll")].filter(Boolean).join(" · "),
    ...(EXTRA_ATTACK_ROLLS_BUILD_MOMENTUM ? {} : { gainsMomentum: false })
  };
  // **THE SECOND ROLL IS MADE AS THE ATTACKER STANDS NOW** (D-773): the first
  // roll's reveal may have taken the Hide, and 04's Ghostly Strike answers only a
  // blow struck from hiding - so who may answer is asked again.
  const hidden = isHiddenFor(actor, args.source);
  if (!secondTargets?.length) return { ...second, reactions: reactionRows(args.targets ?? [], { attacker: actor, hidden }) };
  return {
    ...second,
    targets: secondTargets,
    struckBack: struckBackRows(secondTargets, actor),
    reactions: reactionRows(secondTargets, { attacker: actor, hidden })
  };
}

/**
 * Cast a spell through the dialog: the DC is the target's Defense or
 * 10 + 2 per tier (07 SS2), Overchannel and the Mana are shown, and
 * `castSpell` pays first and rolls.
 */
export async function castWithDialog(actor, spell, event = null, { targets = null, run = null } = {}) {
  const sys = spell.system;
  const classes = (actor.classItems ?? []).map(c => ({
    itemId: c.id, schools: c.system?.schools ?? [], castingAbility: c.system?.castingAbility ?? null
  }));
  const grant = grantingClass(classes, sys.school);
  // The Mana pool, read the one way the cast reads it (the B1 review): a creature's
  // Power pool whatever its block names it (`casting.mjs#castingManaPool`).
  const pool = castingManaPool({ creature: actor.type === "npc", powers: actor.system.powers ?? [], snapshot: actor.poolSnapshot?.() ?? [], grantItemId: grant?.itemId ?? null });
  const health = actor.system.health?.value ?? 0;
  // **WHAT THE CAST WILL CHARGE, READ THE WAY `castSpell` PAYS IT** (D-768):
  // the entry's Mana less a Signature naming the spell and one scoped to its
  // school. The dialog compared the pool against the bare entry, so `canPay`
  // and the price it showed disagreed with the payment.
  // And less what the next spell was promised (04's Nature's Grace and
  // Predator's Swiftness, D-771), through the actor's one reading.
  const pending = actor.pendingNextSpell?.() ?? { amount: 0, live: [] };
  // **WHAT THE CAST WILL TAKE OF IT, AND WHAT A TALENT TAKES OFF** (D-775): the
  // same `takeNextSpell` and `spellDiscountFor` the cast pays by - Emberstorm's 2
  // and Icy Veins' rank off the entry's Mana, Backdraft's rung and Soul Fire's
  // promise named in words.
  const talentsNow = actor.takenTalents?.() ?? [];
  const take = takeNextSpell(pending.live ?? [], { action: sys.action ?? null, healing: isHealingSpell(sys) });
  // In the pool the cast pays, as `castSpell` reads it (04's Shadowcraft's Focus; the
  // Legacy branches' B6).
  const discount = spellDiscountFor(talentsNow, {
    school: sys.school ?? null, mana: sys.mana ?? 0, states: veinsStates(flaggedEffects(actor, VEINS_FLAG).map(r => r.flag)),
    pool: spellPoolFor(talentsNow, { name: spell.name, school: sys.school ?? null })?.pool ?? null
  });
  const mana = spellManaCost({ mana: sys.mana ?? 0, name: spell.name, school: sys.school }, actor.system?.signatureEffects, { next: take.amount, less: discount.amount });
  // 02's Overchannel Mastery (D-779): an Overchannel costs the Mana once more a cast.
  const mastery = actor.hasFeature?.("Overchannel Mastery") === true;
  const promises = [
    ...(mastery ? [game.i18n.format("AZEROTH.Cast.MasteryNote", { n: Math.max(0, mana - overchannelReliefFor(talentsNow).amount) })] : []),
    ...(take.miracle ? [game.i18n.format("AZEROTH.Miracle.Note", { name: take.miracle.name })] : []),
    ...(take.cast ? [game.i18n.format("AZEROTH.Cast.NextSpellHalfNote", { name: take.cast.name })] : []),
    ...take.taken.filter(e => Number(e.forcedSl) > 0).map(e => game.i18n.format("AZEROTH.SoulFire.Note", { name: e.name, sl: e.forcedSl, n: e.damage ?? 0 }))
  ];
  // **THE DC THE ENTRY STATES, OR A TALENT RESTATES** (07's *Make a Casting Test
  // against DC 26*; 04's Sunfire and Cataclysm; D-775): handed in as the DC, so a
  // target's Defense does not take its place.
  const statedDc = spellDcFor(talentsNow, { name: spell.name }) ?? statedCastingDC(sys.effect);
  // **A HEALING SPELL AT A HALF-ACTION** (04's Nature's Swiftness, D-771): a
  // line on this dialog, unticked - spending a use is the player's call - and
  // drawn only where the talent reaches this spell, greyed with its reason in
  // words where its counter is spent. `castSpell` judges it again at the cast.
  // **AND 04's RIPTIDE** (*You may cast Healing Wave as a Half-Action once a
  // round, or twice a round at rank 2*; D-774): the same line, by the spell's
  // name, its uses the round's record rather than a counter.
  // **AND 04's FIRE BLAST** (*Once a round, a Fire spell of yours costs a
  // Half-Action rather than an action*; D-775): the same line, by the school.
  const swiftRow = castAsFor(talentsNow, { action: sys.action ?? null, healing: isHealingSpell(sys), name: spell.name, school: sys.school ?? null });
  const swiftCounter = swiftRow && !swiftRow.perRound ? (actor.grantedFeature?.(swiftRow.talentId) ?? null) : null;
  const swiftLeft = swiftRow?.perRound ? roundMarksLeftOf(actor, swiftRow) : (swiftCounter?.system?.uses?.value ?? 0);
  const swiftJudged = swiftRow ? swiftCast({ row: swiftRow, spellAction: sys.action ?? null, healing: true, usesLeft: swiftLeft }) : null;
  const swift = swiftRow ? {
    name: swiftRow.name,
    available: swiftJudged.ok,
    left: swiftLeft,
    max: swiftRow.perRound ?? (swiftCounter?.system?.uses?.max ?? 0),
    reason: swiftJudged.reason ? game.i18n.format(swiftJudged.reason, { name: spell.name, talent: swiftRow.name }) : null
  } : null;
  // **IN A SHAPESHIFT FORM THE PRICE IS FEROCITY** (07, D-769), read through
  // the same `manaPrice` the cast pays by, so the dialog says what it will take.
  // **AND A POOL A TALENT NAMES** (04's Shadowcraft: *paying Focus where 07-MAGIC
  // asks for Mana*; the Legacy branches' door 8), with the ability it casts with.
  const inForm = actor.inShapeshiftForm === true;
  const talentPool = spellPoolFor(talentsNow, { name: spell.name, school: sys.school ?? null });
  const payPool = talentPool ? ((actor.poolSnapshot?.() ?? []).find(p => p.name === talentPool.pool) ?? null) : null;
  const price = manaPrice(mana, { inShapeshiftForm: inForm, pool: talentPool?.pool ?? null });
  const ferocity = price.pool === "ferocity"
    ? ((actor.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === "ferocity") ?? null)
    : null;
  const ability = talentPool?.ability ?? grant?.castingAbility ?? null;
  const modifiers = [];
  if (ability) modifiers.push({ label: AZEROTH.abilities[ability], value: actor.system.abilities?.[ability]?.mod ?? 0 });
  modifiers.push({ label: "AZEROTH.Sheet.Proficiency", value: actor.system.proficiency ?? 0 });
  // What a talent adds to THIS spell's damage, per rank (04, D-711 phase 2).
  // The type is the spell's own damage school, so Devastation's Fel, Fire and
  // Shadow row does not turn up on a Frostbolt. **Not where the damage is the
  // area's tick** (the review of D-756, N6): the cast deals none, so a line
  // ticked here would add to nothing - the tick reads what stands at a turn.
  const tickOnly = sys.damage?.rating !== null && sys.damage?.rating !== undefined && !castDealsDamage(sys);
  const spellLines = tickOnly ? [] : talentDamageLines(actor, {
    lane: "spell", type: sys.damage?.school ?? sys.school ?? "physical", target: (targets ?? targetSnapshots())[0] ?? null
  });
  const castingSpec = {
    kind: "casting",
    title: spell.name,
    spell,
    ...(targets !== null ? { targets } : {}),
    modifiers,
    // 06 §5: a Casting Test made while Engaged takes a Bane (D-732).
    engaged: engagedNow(actor),
    ...(spellLines.length ? { damageLines: spellLines } : {}),
    ...(statedDc !== null ? { dc: statedDc } : {}),
    fallbackDC: castingDC({ tier: sys.tier }),
    fallbackSource: "spell",
    casting: {
      tier: sys.tier,
      conflagrate: sys.identifier === "conflagrate",
      mana,
      // The pool the price comes out of: a talent's (door 8), else the Mana.
      pool: payPool ? { name: payPool.name, value: payPool.value, max: payPool.max } : (pool ? { name: pool.name, value: pool.value, max: pool.max } : null),
      // The word the price is said in where a talent names another pool (door 8).
      payLabel: talentPool ? (AZEROTH.poolTypes[talentPool.pool] ?? null) : null,
      // What a Shapeshift form pays instead (07, D-769): the Ferocity it costs
      // and the pool it comes out of.
      ferocity: price.pool === "ferocity"
        ? { cost: price.amount, value: ferocity?.value ?? 0, max: ferocity?.max ?? 0 }
        : null,
      // **A PRICE WITH NOTHING TO PAY IT CANNOT BE PAID** (door 8): the one reading
      // beside `castRefusal` - it said *can pay* for a class holding no Mana.
      canPay: castCanPay({ price, pool, ferocity, payPool }),
      health,
      perPoint: overchannelPerPoint(sys.tier),
      // 04's Overchanneller (D-775): the Health off the price lets a point more be paid.
      // **02's OVERCHANNEL MASTERY** (the lead, 2026-10-03, on O-192: *"Per cast"*;
      // D-779): the price is the spell's Mana once more a cast and no Health, so the
      // points are bounded by 05 §2's SL cap alone; the note says so.
      maxPoints: mastery ? OVERCHANNEL_MAX_POINTS : maxOverchannel({ health, tier: sys.tier, relief: overchannelReliefFor(talentsNow).amount }),
      // The Augment in hand (07 §3, D-674). It adds to the Casting Test and
      // to nothing else, so it is a number on this dialog rather than an
      // effect on a score - and the box was defaulting to 0 with every
      // caster's focus sitting in their pack.
      augment: castingAugment(actor.items.filter(i => i.type === "gear"), actor.classNames ?? []),
      // What the next spell was promised, by name (D-771), and Nature's
      // Swiftness's line where the talent reaches this spell. A talent's own
      // discount beside them (D-775), and what else is promised in words.
      discounts: [
        ...take.taken.filter(e => Math.trunc(Number(e.amount)) > 0).map(e => ({ name: e.name, amount: e.amount })),
        ...discount.by.map(d => ({ name: d.name, amount: d.amount }))
      ],
      promises,
      swift
    },
    // **WHAT A TALENT'S COUNTER OR CHARGE BUYS ON THIS CAST** (D-774): Inner
    // Focus's free Mana, Lava Burst's Ward ignored on a Fire spell, Static
    // Charge's tier on one that deals damage. Unticked; `castSpell` judges the
    // ticked ones again. And Fel Fire's line on a Fire spell (D-775).
    talentLineOffer: actor.talentLineOffer?.({
      roll: "spell", school: sys.damage?.school ?? sys.school ?? null, damages: castDealsDamage(sys), mana,
      ticks: sys.tick?.kind === "damage",
      // The spell's name, for a line on one spell alone (04's Devouring Plague, D-779).
      spell: spell.name
    }) ?? [],
    run: run ?? game.system.azeroth.workflows.castSpell
  };
  if (blademasterFor(talentsNow)) {
    const modes = {casting: {attackTest:null}};
    const castTestChoices = {casting: game.i18n.localize("AZEROTH.Blademaster.Casting")};
    for (const weapon of actor.readyWeapons?.() ?? []) {
      const weaponId=blademasterWeaponKey(weapon);
      if (!weaponId) continue;
      const attack=await attackWithDialog(actor,weapon,null,{prepareOnly:true,testOnly:true,budget:"none",damage:false,targets});
      if (!attack) continue;
      for (const mode of Object.keys(attack.modes ?? {})) {
        const key=`${weaponId}:${mode}`;
        modes[key]=castingWithAttackTest(castingSpec,withAttackMode(attack,mode),{weaponId,mode});
        castTestChoices[key]=game.i18n.format("AZEROTH.Blademaster.Attack",{name:weapon.name,mode:game.i18n.localize(AZEROTH.attackModes[mode])});
      }
    }
    if (Object.keys(modes).length>1) Object.assign(castingSpec,{mode:"casting",modes,castTestChoices});
  }
  return rollWithDialog(actor,castingSpec,event);
}

/** Revalidate the chosen attack profile before a substituted cast spends anything. */
export async function prepareBlademasterTest(actor,choice,{targets=null}={}) {
  if (!choice || typeof choice.weaponId!=="string" || typeof choice.mode!=="string" || !blademasterFor(actor.takenTalents?.() ?? [])) return null;
  const weapon=(actor.readyWeapons?.() ?? []).find(row=>blademasterWeaponKey(row)===choice.weaponId);
  if (!weapon) return null;
  return attackWithDialog(actor,weapon,null,{prepareOnly:true,testOnly:true,budget:"none",damage:false,mode:choice.mode,targets});
}

/**
 * **WHAT IS LEFT OF A CAST-AS ROW'S ROUND** (04's Riptide, D-774): the marks the
 * round's record still holds for it, in the fight this actor is in. Out of a fight
 * there is no round to count and every one is left - the ruling every other
 * once-a-round thing here makes.
 *
 * @param {Actor} actor
 * @param {{identifier: string, perRound: number}} row  `castAsFor`'s
 */
export function roundMarksLeftOf(actor, row) {
  const fight = actor?.activeFight?.() ?? null;
  const combatant = fight ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
  if (!combatant) return row.perRound;
  const r = combatant.getFlag("azeroth-rpg", "round") ?? {};
  return roundMarksLeft(row.identifier, row.perRound, r.number === fight.round ? (r.once ?? []) : []);
}

/**
 * Cast one of an item's spells (D-633): as 07 writes it, at the bearer's
 * Casting Test, for no Mana, at the item's DC where it names one, and a use
 * struck. Refused with a notice when the uses are spent.
 */
export async function castItemSpell(actor, item, index, event = null) {
  const entry = item?.system?.spells?.[index] ?? null;
  if (!entry) return null;
  if ((entry.uses?.max ?? 0) > 0 && (entry.uses?.value ?? 0) <= 0) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Cast.NoUses", { name: entry.name, item: item.name }));
    return null;
  }
  const spell = await fromUuid(entry.uuid);
  if (!spell) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Cast.SpellMissing", { name: entry.name }));
    return null;
  }
  const sys = spell.system;
  const classes = (actor.classItems ?? []).map(c => ({
    itemId: c.id, schools: c.system?.schools ?? [], castingAbility: c.system?.castingAbility ?? null
  }));
  const ability = grantingClass(classes, sys.school)?.castingAbility
    ?? (actor.classItems ?? []).find(c => c.system?.castingAbility)?.system?.castingAbility ?? null;
  const modifiers = [];
  if (ability) modifiers.push({ label: AZEROTH.abilities[ability], value: actor.system.abilities?.[ability]?.mod ?? 0 });
  modifiers.push({ label: "AZEROTH.Sheet.Proficiency", value: actor.system.proficiency ?? 0 });
  const health = actor.system.health?.value ?? 0;
  // **THE DC THE ENTRY STATES** (07: *Make a Casting Test against DC 26*; D-775),
  // through the one reader `castWithDialog` takes: an item's casting is 07's
  // entry as written, and a talent's restatement is the caster's alone.
  const statedDc = statedCastingDC(sys.effect);
  return rollWithDialog(actor, {
    kind: "casting",
    title: spell.name,
    spell,
    modifiers,
    // 06 §5: a Casting Test made while Engaged takes a Bane (D-732).
    engaged: engagedNow(actor),
    ...(statedDc !== null ? { dc: statedDc } : {}),
    fallbackDC: castingDC({ tier: sys.tier }),
    fallbackSource: "spell",
    casting: { tier: sys.tier, mana: 0, pool: null, canPay: true, health, perPoint: overchannelPerPoint(sys.tier), maxPoints: 0 },
    provenanceExtra: [{ label: "AZEROTH.Card.FromItem", value: null, formula: item.name }],
    viaItem: { itemId: item.id, index, name: item.name, dc: entry.dc ?? null },
    run: game.system.azeroth.workflows.castSpell
  }, event);
}

/**
 * Use a class feature (D-612). One that makes a Casting Test goes through
 * the dialog like a spell - DC, Boons and Banes are the table's call; one
 * that does not is used straight, with nothing to decide.
 *
 * `targets` and `foresight` are a card's (D-779): 04's Foresight presses 02's Ward
 * from an incoming attack's card at the creature the card records, and names the
 * blow it answers. A feature that makes no Casting Test takes them as given.
 */
export async function useFeatureWithDialog(actor, item, event = null, { targets = null, foresight = null, answers = null } = {}) {
  const sys = item.system;
  const run = game.system.azeroth.workflows.useFeature;
  // **WHAT A TALENT ADDS TO A FEATURE'S DAMAGE** (04, D-768): the lines the
  // spell and attack doors have offered since D-711, on the feature's own lane
  // (`featureDamageLane`: a Casting Test rides the spell lane). Elemental Fury
  // never reached Forked Lightning before this. An attack's own facts - Engaged
  // with exactly one, a Riposte - are not asked: a feature is not an attack.
  const damageLines = sys.damage?.amount
    ? talentDamageLines(actor, { lane: featureDamageLane(sys), feature: true, type: sys.damage?.type ?? "physical", target: targetSnapshots()[0] ?? null })
    : [];
  // A feature that lays a Bane on somebody else needs to know who (06 §6's
  // Pummel, D-693). ONLY that feature: a non-casting feature has never been
  // given targets, and handing them to every one of them would move a
  // self-heal like Second Wind onto whoever happened to be selected.
  // And a talent's Use that acts on one creature (D-771): Swiftmend's *a
  // friendly target* and Symbiosis's *name a friendly target*.
  // A feature that opens no dialog takes the Damage lines that came ticked,
  // as a skipped dialog does (D-601): the table's own lines stay off.
  if (!sys.casting) {
    const grantId = item.getFlag?.("azeroth-rpg", "feature")?.talentId ?? null;
    const granting = grantId ? actor.items.get(grantId) ?? null : null;
    const row = granting ? talentEffect(granting.system?.className, granting.system?.identifier, granting.system?.race ?? null) : null;
    // A gadget's Use is the gadget's (the Legacy branches' door 7), never the
    // Gadgeteer row's that granted it - the Use door reads it the same way.
    const gadget = item.getFlag?.("azeroth-rpg", "feature")?.gadget ? gadgetByKey(item.getFlag("azeroth-rpg", "feature").gadget) : null;
    const use = gadget ? (gadget.onUse ?? {}) : onUseOf(row);
    // **WHOM THE USE IS AIMED AT, THROUGH THE ONE READING** (D-774): 02's Ward,
    // Silence, Guardian Spirit and Reincarnation's friend - and every D-772 and
    // D-773 Use that reads its targets, which were refused from this button.
    const aims = featureAims({ name: item.name, lays: sys.lays ?? null, attack: sys.attack === true, onUse: use, barrage: Boolean(row?.barrage) });
    const aimedAt = Array.isArray(targets) ? targets : (aims ? targetSnapshots() : null);
    // The incoming card a Reaction answers (04's Afterimage; the Legacy branches' door 13).
    return run({ actor, item, ...(aimedAt ? { targets: aimedAt } : {}), ...(foresight ? { foresight } : {}), ...(answers ? { answers } : {}), ...(damageLines.length ? damageChosen(damageLines) : {}) });
  }
  const casting = (actor.classItems ?? []).find(c => c.system?.castingAbility)?.system?.castingAbility ?? null;
  const modifiers = [];
  if (casting) modifiers.push({ label: AZEROTH.abilities[casting], value: actor.system.abilities?.[casting]?.mod ?? 0 });
  modifiers.push({ label: "AZEROTH.Sheet.Proficiency", value: actor.system.proficiency ?? 0 });
  return rollWithDialog(actor, {
    kind: "casting",
    title: item.name,
    item,
    modifiers,
    // 06 §5: a Casting Test made while Engaged takes a Bane (D-732).
    engaged: engagedNow(actor),
    // The talent lines this feature's damage could take, ticked or not (D-768).
    ...(damageLines.length ? { damageLines } : {}),
    // What a talent's counter or charge buys on this Use (D-774): Inner Focus's
    // free Mana, Static Charge's tier on a feature that deals damage.
    talentLineOffer: actor.talentLineOffer?.({
      roll: "feature", damages: Boolean(sys.damage?.amount), mana: sys.cost?.pool === "mana" ? (Number(sys.cost.amount) || 0) : 0, casting: true,
      // A healing feature's own action (04's Nature's Swiftness, D-779).
      healing: Boolean(sys.heal) || sys.tick?.kind === "heal", action: sys.action ?? null
    }) ?? [],
    fallbackDC: sys.dc ?? castingDC({ tier: actor.system.tier ?? 1 }),
    fallbackSource: "feature",
    run
  }, event);
}

/**
 * A Resilience Test through the dialog (05). The workflow reads the
 * training; the dialog reads Fatigue 5 and the rest.
 *
 * `link` is the spell card's row the Test answers (D-726), which the
 * Resilience card stores as `resistOf`; `source` is the token it is made from
 * where the card's door knows it, and the roll dialog's rule otherwise (D-724).
 * `against` is the conditions the Test resists where the door knows them - a
 * spell card's failure, an area's (D-757) - which is what lets a Boon *against
 * **Frightened** and **Charmed*** reach it; null leaves it the table's line.
 */
export function resilienceWithDialog(actor, resilience, event = null, { dc = null, link = null, source = null, against = null, talentBanes = null, talentBoons = null } = {}) {
  if (!AZEROTH.resiliences[resilience]) return null;
  return rollWithDialog(actor, {
    kind: "resilience",
    resilience,
    title: game.i18n.localize(AZEROTH.resiliences[resilience]),
    modifiers: game.system.azeroth.workflows.resilienceModifiers(actor, resilience),
    // A card's Resist button carries the caster's Spell DC (D-616); the
    // dialog still shows it, since the table may know better.
    dc: dc ?? undefined,
    ...(link ? { resistOf: link } : {}),
    ...(source ? { source } : {}),
    ...(Array.isArray(against) ? { against } : {}),
    // The Banes a talent of whoever forced this Test lays on it (04's Vile
    // Concoction, D-773): an automatic line, named.
    ...(talentBanes?.banes > 0 ? { talentBanes } : {}),
    // And the Boon a talent of whoever forced it gives the creature resisting (04's Drawn
    // Across: *A Boss makes the Test with a Boon*; the Legacy branches' door 25), named.
    ...(talentBoons?.boons > 0 ? { talentBoons } : {}),
    run: game.system.azeroth.workflows.rollResilience
  }, event);
}

/**
 * **WHETHER PACK TACTICS MAKES THIS BLOW A FLANKING ONE** (04: *You and your
 * companion always count as flanking a target you are both Engaged with. At rank
 * 2 any friendly target counts as flanking alongside your companion*; D-773),
 * measured on the viewed scene between the nearest squares (D-732): the attacker
 * Engaged with the target (inside its own reach), and the partner too - the
 * Ranger's companion for the Ranger, the Ranger for its companion, and at rank 2
 * any such companion on the attacker's side for anybody else. Nothing measured is
 * nothing flanked; 06 §5's *from opposite sides* is the talent's to waive.
 *
 * @param {Actor} actor  the attacker
 * @param {Token|null} targetToken
 * @returns {{names: string[]}|null}
 */
function packFlankOf(actor, targetToken) {
  if (!targetToken || !globalThis.canvas?.ready || !actor) return null;
  const engaged = who => {
    const own = who?.getActiveTokens?.(true)?.[0] ?? null;
    if (!own || own.id === targetToken.id) return false;
    const feet = feetApart(own, targetToken);
    return typeof feet === "number" && feet <= reachOfActor(who);
  };
  if (!engaged(actor)) return null;
  const names = new Set();
  // The Ranger and its companion.
  const own = actor.type === "character" ? flankingFor(actor.takenTalents?.() ?? []) : null;
  if (own && boundOf(actor, "companion").some(c => packFlanks({ row: own, attackerEngaged: true, partnerEngaged: engaged(c), attackerIsPair: true }))) names.add(own.name);
  const bond = actor.type === "npc" ? bondOf(actor) : null;
  const owner = bond?.kind === "companion" && bond.ownerUuid ? game.actors.get(String(bond.ownerUuid).split(".").pop()) ?? null : null;
  const ownersRow = owner ? flankingFor(owner.takenTalents?.() ?? []) : null;
  if (ownersRow && packFlanks({ row: ownersRow, attackerEngaged: true, partnerEngaged: engaged(owner), attackerIsPair: true })) names.add(ownersRow.name);
  // Rank 2: any friendly attacker alongside a Pack Tactics companion.
  if (!names.size) {
    const fight = actor.activeFight?.() ?? null;
    const mine = allyStandingOf({ actor, token: actor.getActiveTokens?.(true)?.[0]?.document ?? null, fight, combatant: combatantIn(fight, actor) });
    for (const ranger of game.actors.filter(a => a.type === "character" && a.id !== actor.id && a.id !== owner?.id)) {
      const row = flankingFor(ranger.takenTalents?.() ?? []);
      if (!row?.any) continue;
      for (const companion of boundOf(ranger, "companion")) {
        if (companion.id === actor.id) continue;
        const token = companion.getActiveTokens?.(true)?.[0] ?? null;
        const theirs = allyStandingOf({ actor: companion, token: token?.document ?? null, fight, combatant: combatantIn(fight, companion, token?.document ?? null) });
        if (!countsAsAlly(mine, theirs)) continue;
        if (packFlanks({ row, attackerEngaged: true, partnerEngaged: engaged(companion), attackerIsPair: false })) names.add(row.name);
      }
    }
  }
  return names.size ? { names: [...names].sort() } : null;
}

/**
 * An attack with a weapon through the dialog (06 SS2, D-601). The sheet's
 * row and a card's Attack button (D-616) share it: the dialog is the
 * authority on the DC, the location and the Boons and Banes, and the
 * `location` here is only the default it opens on.
 *
 * `mode` is a caller settling the way the blow is struck (D-731), and with none
 * the weapon offers every way it has and opens on the one the distance picks.
 * **An Opportunity Attack only PREFERS a way**: `takeOpportunity` passes the
 * hand where the weapon has one and nothing where it has not. A way the weapon
 * has not got is refused in words; no caller in `module/` forces one, and the
 * attacks batch pins the refusal by calling this door with a Javelin in the hand.
 */
export async function attackWithDialog(actor, weapon, event = null, { location = "body", dc = null, damage = true, offHand = null, budget = null, gainsMomentum = true, atDistance = null, riposte = false, mode = null, ratingDelta = 0, opportunity = false, landsOnHit = null, cardBoons = null, fromFeature = null, targets = null, prepareOnly = false, paidThrowAs = null, testOnly = false } = {}) {
  if (testOnly && (!prepareOnly || budget!=="none" || damage!==false)) return null;
  if (!weapon || weapon.type !== "weapon") return null;
  // Ordinary Attack follows the equipped hand on every entry point (sheet,
  // hotbar and item). Reactions and already-paid feature strikes retain their
  // own attack economy; an explicit choice, including a follow-up, wins.
  offHand = attackOffHand(weapon, { offHand, budget, damage, opportunity, riposte, fromFeature });
  // **A MELDED WEAPON IS SWUNG BY NOBODY** (the lead: *"Melds; Signatures
  // count"*, D-769). Every door the sheet draws reads `readyWeapons`, so this is
  // the door for whatever hands an Item in regardless - a hotbar macro saved
  // before the shift, a script - and it refuses in words.
  const worn = actor?.type === "character" ? (actor.shape ?? null) : null;
  if (!weapon.natural && worn && meldsGear(worn.kind)) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Shape.WeaponMelded", { name: weapon.name, form: (worn.forms ?? []).map(f => f.name).join(", ") }));
    return null;
  }
  const system = actor.system;
  const sys = weapon.system;
  // A launcher fires the bundle nocked on it (08 §7, D-641): the shot's Rating
  // plus the launcher's, its Pierce, and one marked off before the die. A
  // launcher with nothing that fits, or an empty bundle, refuses here.
  let ammunition = null;
  let damageSpec = null;
  // What Flametongue made of the blow, for the card (D-779).
  let flametongueLine = null;
  // Wounded Beast (04, D-648): a weapon attack's Rating rises by the rank.
  const wounded = actor.talentRanks?.("Wounded Beast") ?? 0;
  if (sys.isLauncher) {
    const bundles = fittingBundles(sys, actor.items.filter(i => i.type === "weapon").map(i => ({ id: i.id, name: i.name, ...i.system })));
    const chosen = selectAmmunition(sys, bundles);
    const state = canFire(sys, chosen);
    if (!state.ok && !testOnly) {
      ui.notifications?.warn(game.i18n.format(state.reason === "empty" ? "AZEROTH.Attack.EmptyBundle" : "AZEROTH.Attack.NoAmmunition", {
        weapon: weapon.name, launcher: game.i18n.localize(AZEROTH.launcherKinds[sys.launcher])
      }));
      return null;
    }
    ammunition = chosen ? { itemId: chosen.id, name: chosen.name } : null;
    damageSpec = chosen ? shotDamage(sys, chosen) : null;
    // **WOUNDED BEAST ON A SHOT TOO** (04: *Your weapon attacks add 1 to their
    // Damage Rating per rank*; D-772): a bow is a weapon, and the shot's Rating
    // was the one weapon attack the rank never reached.
    if (damageSpec && wounded) damageSpec = { ...damageSpec, rating: damageSpec.rating + wounded };
  } else if (sys.rating !== null) {
    // A melee weapon's own Pierce reaches the roll the same way (08 §5).
    damageSpec = { rating: sys.rating + wounded, kind: "physical", penetration: pierceOf(sys.traits) };
  }
  // **WHAT THE WEAPON ITSELF GIVES THE BLOW** (D-772), carried beside the Rating
  // so a blow struck with something else - 04's Shield Slam, *strike with your
  // shield at Damage Rating 4* - can take the weapon's own part out and leave
  // what stands on the striker.
  if (damageSpec) damageSpec = { ...damageSpec, weaponRating: Math.max(0, Number(sys.isLauncher ? (damageSpec.rating - wounded) : sys.rating) || 0) };
  // **A RATING CHANGED FOR ONE EXTRA BLOW** (08 §5's Cleave, *at Damage Rating
  // −2*, off 04's Wide Swing; D-772): the card's own offer says by how much.
  if (damageSpec && ratingDelta) damageSpec = { ...damageSpec, rating: Math.max(0, damageSpec.rating + Math.trunc(Number(ratingDelta))) };
  // **WHAT THE BLOW IS STRUCK WITH** (D-725): a launcher's projectile, else the
  // base, the identifier, the Classic subclass or the name, as a FORM the card
  // records - never an asset. The bundle a launcher fires rides beside it. The
  // record is made once per way the blow may be struck, below (D-731).
  const facts = weaponFacts(weapon);
  const ammunitionFacts = ammunition ? weaponFacts(actor.items.get(ammunition.itemId)) : null;
  // Burning and the Fel-touched: +1 Damage Rating on all damage (10 §4, §9; 2026-09-06).
  const corruptionBonus = system.damageRatingBonus?.all ?? 0;
  if (damageSpec && corruptionBonus) damageSpec = { ...damageSpec, rating: damageSpec.rating + corruptionBonus };
  // **AND WHAT THE CREATURE ITSELF ADDS TO EVERY BLOW** (the lead's N2,
  // 2026-09-10). `system.damageBonus` is what a bond lays on its beast (D-643)
  // and what a standing passive grants (D-691); it sits beside `attacks[]`
  // because that array is one no Active Effect can reach, and
  // `npcAttackWithDialog` has added it to a block row since the day it existed.
  // A creature that picks up a sword keeps it, and a swarm below half its
  // Health drops two off whatever it swings (13 §4, D-646) exactly as it does
  // off its own bite. **BOTH ARE ZERO ON A CHARACTER** - `damageBonus` is in no
  // character schema and `thinned` is a creature's own derived flag - so this
  // line leaves every character's blow byte for byte where it was.
  // **ONE KEY, TWO SHAPES** (D-711 phase 2). `NpcData.damageBonus` is a scalar
  // and `CharacterData.damageBonus` is now a map by lane and type, so this
  // line has to say which it is reading: without the guard a character's map
  // arrived here as an object and `heldRating` added `[object Object]`.
  const creatureBonus = typeof system.damageBonus === "number" ? system.damageBonus : 0;
  const thinnedBlow = system.thinned === true;
  if (damageSpec && (creatureBonus || thinnedBlow)) {
    damageSpec = { ...damageSpec, rating: heldRating({ rating: damageSpec.rating, damageBonus: creatureBonus, thinned: thinnedBlow }) };
  }
  // What the traits do to the blow (08 §5, 2026-09-06): Fast's Momentum,
  // Heavy's Bane below Strength 13, Keen's Critical, the Effect traits
  // waiting on the roll. A launcher fires its shot's traits as well as its own.
  const traitNames = [...(sys.traits ?? []), ...(ammunition ? (actor.items.get(ammunition.itemId)?.system?.traits ?? []) : [])];
  const traitEffects = weaponTraitEffects(traitNames, { strength: system.abilities.str?.total ?? system.abilities.str?.value ?? 10 });
  // **WHAT SCHOOL THIS BLOW IS, AND WHAT IT PIERCES** (08 §7, D-711 phase 2).
  // *A weapon with a Greater School enchantment deals damage of that school
  // instead of Physical. Subtract the target's Ward instead of its Armor
  // Points.* The chapter states it once and no weapon entry repeats it, so
  // nothing here read it: every character's blow was built `physical` off the
  // Rating and Sulfuras was a mace. `rules/damage-spec.mjs` is the one law and
  // the creature's door (`attackSpecFor`) delegates to the same function.
  //
  // The RATING is left exactly as the lines above worked it out - Wounded
  // Beast, a corruption rung, a bond's bonus - and only the lane changes.
  let laneBonus = 0;
  if (damageSpec) {
    const converted = weaponDamageSpec({ rating: damageSpec.rating, traits: traitNames }, await traitSchools());
    const gadgetSchool = weapon.gadget && sys.damageType && AZEROTH.damageTypes[sys.damageType] && sys.damageType !== "physical" ? sys.damageType : null;
    damageSpec = { ...damageSpec, kind: gadgetSchool ? "magical" : converted.kind, school: gadgetSchool ?? converted.school, penetration: converted.penetration };
    // **04's FLAMETONGUE, HELD** (*While you Sustain it, your weapon attacks deal Fire
    // damage rather than Physical. At rank 2 they add 1 damage as well*; the lead,
    // 2026-10-03, on O-188: *"1 mana"*; D-779): while the shaman's Sustain stands, a
    // Physical blow is Fire, met by the Ward as 08 §7's Greater enchantment is, and
    // the rank's damage is added (`class-answers.mjs#flametongueStrike`).
    const tongue = flametongueFor(actor.takenTalents?.() ?? []);
    if (tongue && (actor.getFlag?.("azeroth-rpg", "sustaining") ?? []).some(s => s?.identifier === tongue.identifier)) {
      const before = damageSpec;
      damageSpec = flametongueStrike(damageSpec, { add: tongue.add });
      if (damageSpec !== before) flametongueLine = { label: tongue.name, value: null, formula: game.i18n.format("AZEROTH.Flametongue.Row", { n: tongue.add }) };
    }
    // **WHAT STANDS ON THE CHARACTER** (04, D-711 phase 2): the derived map a
    // `final`-phase effect adds to - Seal of Command's Holy for the encounter,
    // Arcane Power's until the end of the next turn. `all` plus the type this
    // blow deals, which is the school where a Greater enchantment converted it
    // and `physical` otherwise. A CONDITIONAL talent is a line on the dialog
    // instead and never lands here.
    // ONE reading of the lane, `rules/spell-bonus.mjs#laneBonus`, shared with
    // the spell door, an area's tick and a class feature (D-768). A creature's
    // scalar `damageBonus` has no lanes and reads 0 there, as it did here.
    laneBonus = laneBonusFor(system, "attack", damageSpec.school ?? "physical")
      // **AND THE FORM LANE, IN A SHAPESHIFT FORM** (04's Berserk, D-771: *your
      // attacks in a Shapeshift form ... add your rank to their damage*). Read
      // here and nowhere else, so a blow struck out of the form never takes it.
      + (actor.inShapeshiftForm === true ? laneBonusFor(system, FORM_LANE, damageSpec.school ?? "physical") : 0)
      // **AND THE SPELL LANE, FOR A MAGICAL BLOW OF ELEMENTAL BLADEMASTER'S** (04;
      // the lead, 2026-10-03, on O-190: *"Any spell cast or magic damage from weapon
      // attacks."*; D-779): what stands on the shaman for spells reaches the blow.
      + (blademasterReaches({ holds: Boolean(blademasterFor(actor.takenTalents?.() ?? [])), type: damageSpec.school ?? null }) ? laneBonusFor(system, "spell", damageSpec.school) : 0);
    if (laneBonus) damageSpec = { ...damageSpec, rating: damageSpec.rating + laneBonus };
  }
  // **WHAT THE SHAPE ADDS** (02 §7, D-769): Metamorphosis's *add 2 to your
  // Damage Rating*. Standing on the bearer like the lane, so a Signature that
  // SETS a Rating keeps it (`ratingAfterSignature`'s `standing`).
  const shapeBonus = damageSpec ? shapeDamageBonus(actor.shape ?? null) : 0;
  if (shapeBonus) damageSpec = { ...damageSpec, rating: damageSpec.rating + shapeBonus };

  // 06: how far the target is, and what the distance costs (D-669). The long
  // band is a Bane on the dialog. Nothing is measured where a token is not on
  // the scene, and then the distance is the table's as it always was.
  //
  // **ONLY A SHOT IS REFUSED NOW** (D-716, superseding D-669's melee refusal).
  // A blow outside reach raises a checked, zero-cost line on the dialog and a
  // warning sentence, and the table decides: the tokens are where the GM last
  // dragged them and a step is not modelled, so refusing the swing read as the
  // system settling a question nobody had asked (the lead's item 18). A shot
  // past twice its Range keeps the hard stop 06 states for it.
  //
  // **AN OPPORTUNITY ATTACK IS STRUCK AT THE MOMENT THEY LEAVE** (06 §6,
  // D-694), so `atDistance` overrides the measurement: by the time anybody
  // presses the button the mover is out of reach. It is the distance the
  // departure was measured at and nothing else ever passes it.
  //
  // **IN THE HAND OR THROWN** (D-731). 06 §1 gives Strength to a weapon in the
  // hand and Dexterity to one that is thrown, and 08 §5's Thrown trait says a
  // weapon MAY be thrown - so a Dagger is not a throw because it carries the
  // trait. `attackPlan` builds one variant per way the weapon has (08 §7's
  // Range column tells a Dagger, which has both, from a Javelin, which is only
  // ever thrown), each with its own ability, band and Engaged flag, and picks
  // the way the distance opens on. The dialog is where the roller changes it
  // (D-601). A way past twice its range is refused; where that is the ONLY way -
  // a shot, a Javelin - the attack is refused in words as it always was, and a
  // Dagger there opens in the hand with D-716's warning.
  // 04's Longshot (D-773): *Your weapon's maximum Range increases by 25% per
  // rank* - the farthest the band allows, never where its Bane begins.
  const shape = { launcher: sys.launcher ?? null, range: sys.range ?? null, traits: traitNames, longshot: rangeStretchFor(actor.takenTalents?.() ?? []).percent };
  // **A HAMMER OR A MACE THROWN FOR STORM BOLT** (04: *For this attack a weapon of the
  // hammer or mace type counts as Thrown (20 ft), and an attack made with one uses
  // Strength*; the Legacy branches' door 15): the throw is a way of striking this
  // weapon while a rider that makes it can be paid - its line available on a throw -
  // and `rollTest` refuses that throw unless the line is ticked.
  const throwAs = prepareOnly && budget === "none" ? paidThrowAs
    : actor.type === "character" && !sys.isLauncher ? throwAsOffer(actor.riderLines?.({ weapon: "thrown" }) ?? []) : null;
  const struckShape = throwAs ? throwAsWeapon({ ...shape, weaponType: sys.weaponType ?? null }, throwAs) : shape;
  const targetToken = targets ? game.scenes?.get(targets[0]?.sceneId)?.tokens.get(targets[0]?.tokenId) ?? null
    : [...(game.user.targets ?? [])][0] ?? null;
  const targetActor = targetToken?.actor ?? null;
  // The spell retains its own range and does not fire ammunition. Only the
  // chosen attack's Test calculation is borrowed by Elemental Blademaster.
  const distance = testOnly ? null : atDistance ?? (targetActor ? distanceBetween(actor, targetActor) : null);
  if (weapon.gadget && sys.maxRange > 0 && distance !== null && distance > sys.maxRange) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Attack.OutOfRange", {
      weapon: weapon.name, target: targetActor?.name ?? "", distance: Math.round(distance), max: sys.maxRange
    }));
    return null;
  }
  const plan = attackPlan(struckShape, { distance, engaged: engagedNow(actor), mode });
  // **A WAY THE WEAPON HAS NOT GOT IS REFUSED IN WORDS** (D-731's review). A
  // caller that settles the way is never quietly handed another: a Javelin
  // forced into the hand used to be thrown. `mode` is this door's public option,
  // so the refusal stays although no caller in `module/` forces a way now - an
  // Opportunity Attack prefers the hand and passes nothing where there is none -
  // and the attacks batch calls the door with one to keep it reached.
  if (plan.lacks) {
    ui.notifications?.warn(game.i18n.format(AZEROTH.attackModeRefusals[plan.lacks] ?? "AZEROTH.Attack.NoWay.Hand", { name: weapon.name }));
    return null;
  }
  if (!plan.mode) {
    const band = plan.variants[plan.modes[0]].band;
    ui.notifications?.warn(game.i18n.format("AZEROTH.Attack.OutOfRange", {
      weapon: weapon.name, target: targetActor?.name ?? "", distance: Math.round(distance), max: band.max
    }));
    return null;
  }
  // The modifier lines of a blow struck this way: Strength in the hand,
  // Dexterity on a shot or a throw (06 §1).
  const modifiersFor = ability => [
    // **A `—` ABILITY IS A ZERO** (the lead's N2, 2026-09-10). `npc.mjs` keeps
    // an absent score as null on purpose - a Mindless thing carries no Int,
    // and the Searing Totem carries none of the six - so every reader has to
    // answer for it before it reaches a card that prints a signed number.
    // No modifier, never a 10: that is what the block's own printed Bonus
    // says about a creature with no Strength.
    { label: AZEROTH.abilities[ability], value: system.abilities[ability]?.mod ?? 0 },
    { label: "AZEROTH.Sheet.Proficiency", value: system.proficiency ?? 0 },
    // **WHAT IS WORN ADDS TO THE ATTACK TEST** (08 §20's `+N Attack`,
    // 2026-09-10 - the lead's hit ratings). A character composes this
    // modifier at the door out of an ability and Proficiency, so there is no
    // stored number for a grant to raise and the line has to be added here;
    // the creature's path adds `system.attackBonus` in exactly the same
    // place (D-691). A zero line is left off rather than printed as `+ 0`.
    ...(system.attackBonus ? [{ label: "AZEROTH.Sheet.Passive", value: system.attackBonus }] : [])
  ];
  // One roll spec per way: what the dialog draws for it and what the card
  // records. A refused way rides along so the dialog can grey it and say why.
  // The throw Storm Bolt made (door 15): its own Thrown trait on the strike record,
  // so the card records a throw - and the rider it needs, for `rollTest` to judge.
  const thrownByRider = struckShape !== shape ? (struckShape.throwAs ?? null) : null;
  const modes = Object.fromEntries(plan.modes.map(m => {
    const v = plan.variants[m];
    const byRider = m === "thrown" && thrownByRider;
    return [m, {
      modifiers: modifiersFor(v.ability),
      rangeKind: v.rangeKind,
      rangeBand: v.band,
      engaged: v.engaged,
      // What it is struck with (D-725), the way it is struck (D-731).
      strike: strikeFor(byRider ? { ...facts, traits: struckShape.traits } : facts, { ammunition: ammunitionFacts, mode: m }),
      refused: v.refused,
      ...(byRider ? { throwAs: thrownByRider } : {}),
      // **A HAMMER THAT THROWS ALREADY, THROWN FOR STORM BOLT** (the B6 review): the
      // throw stays a Dexterity throw unless the rider is ticked, and then it is made on
      // the rider's ability (`rollWithDialog`, `wield.mjs#riderThrowModifiers`).
      ...(m === "thrown" && struckShape.riderAbility?.identifier
        ? { riderModifiers: { identifier: struckShape.riderAbility.identifier, modifiers: modifiersFor(struckShape.riderAbility.ability) } }
        : {})
    }];
  }));
  // A shape's natural attack records its block row's own words (D-769): a
  // bite or a claw is read as 14's rows are, never as an Item's name.
  if (weapon.natural) {
    for (const [m, spec] of Object.entries(modes)) spec.strike = strikeForRow(weapon.natural.row, { index: weapon.natural.index, mode: m });
  }
  const chosen = modes[plan.mode];

  // **WHAT THE SIGNATURES ON WHAT IS WORN DO TO THIS BLOW** (08 §20, D-692).
  // The gate reads the bearer AND the creature struck, because eight of §20's
  // twenty-six and every one of the Classic `T-vs-kind` finds are gated on
  // what they are hitting; with nothing targeted those gates fail closed and
  // the attack behaves as it did before. `mergeWeaponEffects` folds the result
  // into the object 08 §5's traits already fill, so `firedTraits` fires an
  // on-hit row and the card draws it with no template change at all.
  const sacrifice = testOnly ? {ok:true,targets:targets ?? targetSnapshots(),interceptions:[]} : prepareVoidwalkerInterception(targets ?? targetSnapshots(), token =>
    targetSnapshots([{ id: token.id, name: token.name, actor: token.actor, scene: token.parent }])[0]);
  if (!sacrifice.ok) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.VoidwalkerSacrifice.TargetUnresolved"));
    return null;
  }
  const aimedAt = sacrifice.targets;
  const struck = aimedAt[0] ?? null;
  const turnState = actor.signatureTurnState;
  const signature = signatureEffects(actor.items.contents, {
    ...turnState,
    // **WHAT IS TRUE OF THIS BLOW** (08 §20's Dal'Rend's Sacred Charge, D-696):
    // *if the blow was an Off-Hand Attack or you moved earlier in the turn*.
    // Only the attack door knows either, which is why the `blow` gate fails
    // closed everywhere else - the Momentum it gates exists at a blow or not at
    // all. `moved` is the movement halves the turn has spent (D-659), the same
    // number `hasNotMoved` reads the other way round.
    blow: blowFacts({ offHand, moved: turnState.moved }),
    ...(struck
      ? { target: { creatureType: struck.creatureType ?? null, acted: struck.acted, conditions: struck.conditions ?? {} } }
      : {})
  }, { weaponId: weapon.id });
  const weaponEffects = mergeWeaponEffects(traitEffects, signature);
  // A Damage Rating SET replaces (Quel'Serrar's *is 8*), a grant adds
  // (Verigan's *adds 2*), and the multiplier travels to the mitigation, which
  // is the only place *doubled before Ward is subtracted* can mean anything.
  const signatureProvenance = [];
  if (damageSpec) {
    // **A SET REPLACES THE WEAPON'S RATING, NOT WHAT STANDS ON THE BEARER**
    // (D-711 phase 2's talent lanes, D-692's Signatures). `damageSpec.rating`
    // already carries the lane bonus a talent puts on this blow, and taking
    // `damageRatingSet` as the whole base threw it away while the card went on
    // printing *Talent damage +N* in the provenance beside it - the number said
    // one thing and the reasons another. Added back after the set, so a Paladin
    // holding Seal of Command swings Quel'Serrar at what the card says.
    const rating = ratingAfterSignature({
      rating: damageSpec.rating,
      set: weaponEffects.damageRatingSet,
      add: weaponEffects.damageRating ?? 0,
      standing: laneBonus + shapeBonus
    });
    if (rating !== damageSpec.rating || weaponEffects.damageMultiplier) {
      damageSpec = { ...damageSpec, rating, ...(weaponEffects.damageMultiplier ? { multiplier: weaponEffects.damageMultiplier } : {}) };
      // WHY the number was what it was (CLAUDE.md §7): a set says what it set
      // the Rating to, a bonus says what it added, a multiplier says it.
      if (weaponEffects.damageRatingSet !== null) {
        signatureProvenance.push({ label: "AZEROTH.Card.SignatureRatingSet", value: null, formula: String(weaponEffects.damageRatingSet) });
      }
      if (weaponEffects.damageRating) {
        signatureProvenance.push({ label: "AZEROTH.Card.SignatureRating", value: weaponEffects.damageRating });
      }
      if (weaponEffects.damageMultiplier) {
        signatureProvenance.push({ label: "AZEROTH.Card.SignatureMultiplier", value: null, formula: `×${weaponEffects.damageMultiplier}` });
      }
    }
  }
  // **TWO TESTS IN ONE ATTACK** (02 §6, D-704). Extra Attack is *two attacks
  // each time you Attack* - one Attack action, two rolls - so the count is
  // settled at the door and the budget is still spent once. 06 §2 says it does
  // not double the off hand; a blow bought with a Reaction is ONE attack (06
  // §6's Opportunity Attack in those words, a Parry, 06 §7's Riposte), and
  // `budget: "none"` means somebody has already paid for it; and a maneuver's
  // Opposed Test carries no damage row (06 §7's Disarm, D-626), which is the
  // one attack door that resolves something other than a blow.
  const rolls = rollsPerAttack({
    extraAttack: actor.hasExtraAttack === true,
    isOffHand: offHand,
    reaction: budget === "none" || budget === "reaction",
    opposed: damage === false
  });
  const extraChoices = rolls > 1 ? extraAttackWeapons(weapon, actor.readyWeapons?.() ?? [], actor.takenTalents?.() ?? []) : [];
  const extraChoiceNow = id => {
    const offered = extraAttackSelection(extraChoices, id);
    const current = extraAttackSelection(extraAttackWeapons(weapon, actor.readyWeapons?.() ?? [], actor.takenTalents?.() ?? []), id);
    const stillOwned = !current?.weapon?.id || actor.items.get(current.weapon.id) === current.weapon;
    return offered && current && stillOwned && offered.offHand === current.offHand ? current : null;
  };
  // **WHAT A TALENT ADDS TO THIS BLOW** (04, D-711 phase 2). Twenty talents in
  // 04 add damage per rank and not one number reached a card: the words printed
  // as a note on the dialog and the Rating never moved (the lead's 20 and 30).
  // The conditional ones are LINES the roller can see and untick - checked
  // where the door measured the fact, unchecked where the table decides
  // (D2 §12) - and `rollTest` adds what was left ticked.
  // *While you are Engaged with exactly one enemy* (06's Engaged), measured once
  // and only where a row asks: Deadly Poise's damage line and Master Duellist's
  // Boon and Critical Injury (D-773) - *your attacks against IT*, so for those two
  // the target must be the one inside reach where the distance was measured.
  let engagedOneMemo;
  const engagedOneNow = () => (engagedOneMemo ??= engagedCount(enemyDistances(actor), reachOfActor(actor)) === 1);
  const talentsHere = actor.takenTalents?.() ?? [];
  const defenderDistance = sacrifice.interceptions.length && struck
    ? distanceBetween(actor, targetActorOf(struck)) : distance;
  const engagedOneTarget = asksFact(talentsHere, "engagedOne")
    ? engagedOneNow() && (defenderDistance === null || defenderDistance === undefined || defenderDistance <= reachOfActor(actor))
    : false;
  const damageLines = talentDamageLines(actor, {
    lane: "attack", type: damageSpec?.school ?? "physical", target: struck,
    feature: Boolean(fromFeature),
    // A magical blow of Elemental Blademaster's takes the talents' spell lines too (D-779).
    alsoSpell: blademasterReaches({ holds: Boolean(blademasterFor(talentsHere)), type: damageSpec?.school ?? null }),
    extraFacts: () => ({
      engagedOne: engagedOneNow(),
      // 06 §7's Riposte, from the maneuver card's own button.
      riposte: riposte === true
    })
  });
  // **A BLOW STRUCK FROM HIDING** (04's Ghostly Strike, D-773): the card offers no
  // Parry and no Block. Read now, before the roll's reveal.
  const hiddenNow = isHiddenFor(actor, sourceOf(actor));
  // **04's PACK TACTICS** (D-773): flanking measured, where the table's line was.
  const packFlank = packFlankOf(actor, sacrifice.interceptions.length
    ? game.scenes?.get(struck?.sceneId)?.tokens.get(struck?.tokenId) ?? null : targetToken);

  const rollSpec = {
    kind: "attack",
    location,
    ...(targets ? { targets: aimedAt } : {}),
    ...(sacrifice.watching || sacrifice.interceptions.length ? { targets: aimedAt, run: async args => {
      if (!sacrifice.valid() || sacrifice.interceptions.length && JSON.stringify(args.targets) !== JSON.stringify(aimedAt)) {
        ui.notifications?.warn(game.i18n.localize("AZEROTH.VoidwalkerSacrifice.TargetChanged"));
        return null;
      }
      return game.system.azeroth.workflows.rollTest({ ...args, sacrificeInterceptions: sacrifice.interceptions });
    } } : {}),
    weaponEffects,
    ...(damageLines.length ? { damageLines } : {}),
    // Static Charge's tier on a blow that deals damage (D-774), unticked.
    ...(damage ? { talentLineOffer: actor.talentLineOffer?.({ roll: "attack", damages: true }) ?? [] } : {}),
    ...(rolls > 1 ? { rolls,
      extraWeapons: extraChoices.map(pick => ({ id: pick.id, offHand: pick.offHand,
        label: game.i18n.format(pick.offHand ? "AZEROTH.Dialog.ExtraWeaponOff" : "AZEROTH.Dialog.ExtraWeaponMain", { name: pick.weapon.name }) })),
      validateExtra: id => Boolean(extraChoiceNow(id))
    } : {}),
    ...(rolls > 1 ? { rebuildSecond: async ({ args, secondTargets, firstCard, extraWeapon }) => {
      const selected = extraChoiceNow(extraWeapon);
      if (!selected) {
        ui.notifications?.warn(game.i18n.localize("AZEROTH.Dialog.ExtraWeaponUnavailable"));
        return null;
      }
      const next = refreshVoidwalkerInterception(sacrifice, secondTargets, token =>
        targetSnapshots([{ id: token.id, name: token.name, actor: token.actor, scene: token.parent }])[0]);
      if (!next.ok) {
        ui.notifications?.warn(game.i18n.localize("AZEROTH.VoidwalkerSacrifice.TargetChanged"));
        return null;
      }
      const ridden = firstCard ? firstCard.flags?.["azeroth-rpg"]?.ridden : args.riders;
      const sameWeapon = selected.id === "current";
      const paid = sameWeapon && throwAs && Array.isArray(ridden) && ridden.includes(throwAs.identifier);
      return attackWithDialog(actor, selected.weapon, null, { location: args.location, dc, damage, offHand: selected.offHand, budget: "none",
        gainsMomentum, atDistance, riposte, mode: sameWeapon ? (args.mode ?? plan.mode) : null, ratingDelta, opportunity, landsOnHit,
        cardBoons, fromFeature, targets: next.originalTargets, prepareOnly: true,
        paidThrowAs: paid ? structuredClone(throwAs) : null });
    } } : {}),
    // What the TARGET is wearing answers back on a hit (08 §20, D-692).
    struckBack: struckBackRows(aimedAt, actor),
    // What the TARGET may answer WITH (06 §6, D-693): Parry and Block.
    reactions: reactionRows(aimedAt, { attacker: actor, hidden: hiddenNow }),
    // The facts the Ranger's and the Rogue's talents read at the dialog and the
    // roll (D-773): the one enemy Engaged being the target (Master Duellist),
    // flanking measured (Pack Tactics), and 06 §7's Riposte (Killing Spree).
    ...(engagedOneTarget ? { engagedOne: true } : {}),
    ...(packFlank ? { packFlank } : {}),
    ...(riposte === true ? { riposte: true } : {}),
    // An Opportunity Attack (the Legacy branches' door 22): Hold the Hall's Prone rides it.
    ...(opportunity === true ? { opportunity: true } : {}),
    // What this blow's hit lays whatever it strikes (04's Net-o-Matic Projector; the
    // Legacy branches' door 7), read by `workflows.rollTest`.
    ...(Array.isArray(landsOnHit) && landsOnHit.length ? { landsOnHit } : {}),
    // A Boon the card's Use gives each of its attacks (04's Fan of Knives at rank 2;
    // door 26), read by the dialog as a talent's Boon.
    ...((Number(cardBoons?.boons) || 0) > 0 ? { cardBoons: { boons: Math.trunc(Number(cardBoons.boons)), names: [...(cardBoons.names ?? [])] } } : {}),
    heavyBane: weaponEffects.heavyBane,
    // **THE WAY IT OPENS ON, AND EVERY WAY IT MAY BE STRUCK** (D-731). The top
    // level is the default way's, so anything reading the spec before a way is
    // chosen reads one whole blow; `rollWithDialog` lays the chosen variant
    // over it, and an Extra Attack's second roll inherits it.
    rangeKind: chosen.rangeKind,
    rangeBand: chosen.rangeBand,
    engaged: chosen.engaged,
    mode: plan.mode,
    modes,
    // What is on the blade (08 §12, §13; D-670). A natural attack is no Item
    // and carries no flag, so nothing is on it (D-769).
    coating: weapon.getFlag?.("azeroth-rpg", "coating") ?? null,
    weaponId: weapon.id ?? null,
    // What it is struck with (D-725); an Extra Attack's second roll inherits it.
    strike: chosen.strike,
    // The feature card it was made from (the Legacy branches' door 2), a record as
    // `strike` is; an Extra Attack's second roll inherits it the same way.
    ...(fromFeature ? { fromFeature } : {}),
    // The off hand (D-409) and the budget an attack spends (D-630).
    ...(offHand ? { offHand: true } : {}),
    ...(budget ? { budget } : {}),
    ...(gainsMomentum ? {} : { gainsMomentum: false }),
    // A maneuver may fix the DC - Disarm's Opposed Test at 12 (D-626).
    ...(dc !== null ? { dc } : {}),
    ...(ammunition ? { ammunition } : {}),
    ...(wounded || ratingDelta || (damageSpec && corruptionBonus) || (damageSpec && (creatureBonus || thinnedBlow)) || laneBonus || shapeBonus || signatureProvenance.length || flametongueLine ? { provenanceExtra: [
      ...(wounded ? [{ label: "AZEROTH.Card.WoundedBeast", value: wounded }] : []),
      // 04's Flametongue made the blow Fire (D-779).
      ...(flametongueLine ? [flametongueLine] : []),
      // Cleave's −2 on the extra blow Wide Swing offers (D-772).
      ...(damageSpec && ratingDelta ? [{ label: "AZEROTH.ExtraStrike.RatingRow", value: Math.trunc(Number(ratingDelta)) }] : []),
      ...(damageSpec && corruptionBonus ? [{ label: "AZEROTH.Corruption.DamageBonus", value: corruptionBonus }] : []),
      // Metamorphosis's 2 (02 §7, D-769), named for what it is.
      ...(shapeBonus ? [{ label: "AZEROTH.Shape.DamageBonus", value: shapeBonus }] : []),
      // What a talent's standing buff put on this lane (04, D-711 phase 2):
      // Seal of Command's Holy for the encounter, Arcane Power's until the end
      // of the next turn. The conditional talents are the dialog's own lines
      // and say their own names.
      ...(laneBonus ? [{ label: "AZEROTH.Card.TalentDamage", value: laneBonus }] : []),
      // WHY the Rating was what it was, in `npcAttackWithDialog`'s own words
      // and its own labels: a card for a creature's swing reads the same
      // whether it swung its claws or a sword somebody gave it.
      ...(damageSpec && creatureBonus ? [{ label: "AZEROTH.Bound.DamageBonus", value: creatureBonus }] : []),
      ...(damageSpec && thinnedBlow ? [{ label: "AZEROTH.Sheet.Thinned", value: -THINNED_RATING_DROP }] : []),
      ...signatureProvenance
    ] } : {}),
    // The traits defined on the card (D-649).
    traits: await traitDefinitions(sys.traits ?? [], actor),
    title: weapon.name,
    // The default way's modifier lines; each way carries its own under `modes`.
    modifiers: chosen.modifiers,
    // A launcher with no Rating contributes none; the ammunition carries it
    // (D-406), and a null here is not a zero.
    damage: damage ? damageSpec : null
  };
  return prepareOnly ? rollSpec : rollWithDialog(actor, rollSpec, event);
}

/**
 * A creature's attack through the dialog (14 §1): the block's Bonus, its
 * Damage Rating and the bonus its bond lays on it (D-643). The NPC sheet's
 * row and a bound feature's card share it.
 *
 * `dc` and `damage` are 06 §7's maneuver card asking for an Opposed Test at a
 * fixed DC with no damage row (D-626), which is what a Disarm is. Both default
 * to what they have always been, so nothing about a block row's own behaviour
 * moves: the card had simply never been able to reach a creature, because
 * `attackFromCard` looked for an Item and every creature held none (2026-09-10).
 */
export async function npcAttackWithDialog(actor, index, event = null, { title = null, targets = null, attack: override = null, bossAction = false, budget = null, dc = null, damage = true, gainsMomentum = true, mode = null, fromFeature = null, run = null, singleAttack = false, damageSchool = null, prepareOnly = false } = {}) {
  const attack = override ?? actor?.system?.attacks?.[index];
  if (!attack) return null;
  if (damageSchool !== null && (typeof damageSchool !== "string" || !Object.hasOwn(AZEROTH.schools, damageSchool))) return null;
  const sys = actor.system;
  const bonus = sys.damageBonus ?? 0;
  // What the traits do to the damage (D-647): Pierce, and a school trait.
  // **AND WHAT THE OWNER'S TALENT MAKES OF IT** (the Legacy branches' door 20: 04's
  // Serpent Ward, *Its attack deals Nature damage rather than Fire*): the derived
  // school `rules/bound.mjs#boundEffects` overrides, a magical blow of that school.
  const traitSpec = attackSpecFor(attack, await traitSchools());
  const patchedSchool = typeof sys.attackSchool === "string" && sys.attackSchool && AZEROTH.schools?.[sys.attackSchool] ? sys.attackSchool : null;
  // An ability-specific conversion reaches the preview as well as the roll.
  // It takes precedence over the creature's ordinary attack-school patch.
  const school = damageSchool ?? patchedSchool;
  const spec = school ? { ...traitSpec, kind: "magical", school } : traitSpec;
  // A swarm's attack (13 §4, D-646): every target it is engaged with, resolved
  // one by one on the card; Thinned, two off the Rating and a Bane from the
  // dialog's own line.
  const swarm = sys.isSwarm === true;
  const thinned = sys.thinned === true;
  const full = (attack.damage ?? 0) + bonus;
  const provenanceExtra = [];
  if (bonus) provenanceExtra.push({ label: "AZEROTH.Bound.DamageBonus", value: bonus });
  if (swarm) provenanceExtra.push({ label: "AZEROTH.Swarm.Attack", value: null, formula: game.i18n.localize("AZEROTH.Swarm.AttackNote") });
  if (thinned) provenanceExtra.push({ label: "AZEROTH.Sheet.Thinned", value: -THINNED_RATING_DROP });
  // A CREATURE'S TRAITS DO WHAT 08 §5 SAYS TOO (D-691). The character path has
  // resolved them since D-662 and this one passed the trait TEXT for the card
  // and nothing else, so Archaedas' `Heavy · Sundering` stone fists meant
  // neither word: no Bane, no Keen, no Fast, and not one Effect trait fired on
  // any creature's blow in the game.
  const traitEffects = weaponTraitEffects(attack.traits ?? [], { strength: sys.abilities?.str?.value ?? 10 });
  // A standing passive's `+N Attack` sits beside the block's own Bonus, which
  // lives in an array no effect can reach (D-691).
  const standing = sys.attackBonus ?? 0;
  if (standing) provenanceExtra.push({ label: "AZEROTH.Sheet.Passive", value: standing });
  // A CREATURE CARRIES ITEMS TOO (08 §20, D-692), and the same merge as the
  // character path: a creature holding a named blade crits on its 19. Its own
  // block-level attack traits are unchanged. There is no `weaponId` because a
  // creature's attack is the block's row rather than an owned weapon, so every
  // equipped thing it carries counts.
  const intendedTargets = targets ?? targetSnapshots();
  const searing = isSearingAttack(attack, bondOf(actor));
  const searingSource = searing ? sourceOf(actor) : null;
  const searingRefused = rows => {
    const reason = searingAttackRange(actor, searingSource, rows);
    if (reason) ui.notifications?.warn(game.i18n.localize(`AZEROTH.Bound.SearingRange.${reason}`));
    return Boolean(reason);
  };
  // An empty preparation may inspect the attack profile; an actual attack must
  // name a measurable target. This is a fixed totem range, not a long band.
  if (searing && (!prepareOnly || intendedTargets.length) && searingRefused(intendedTargets)) return null;
  const sacrifice = prepareVoidwalkerInterception(intendedTargets, token =>
    targetSnapshots([{ id: token.id, name: token.name, actor: token.actor, scene: token.parent }])[0]);
  if (!sacrifice.ok) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.VoidwalkerSacrifice.TargetUnresolved"));
    return null;
  }
  if (sacrifice.interceptions.length) targets = sacrifice.targets;
  const struck = (targets ?? targetSnapshots())[0] ?? null;
  // **A BOUND CREATURE SWINGING AT NOTHING SAYS SO** (the lead's item 24).
  // A totem's attack rolled from its own sheet with nothing targeted posts a
  // card whose Apply has no row to fall back on, and what was selected was the
  // shaman. The blow still happens - the card is where the table picks who it
  // landed on - but the roller is told before they press anything.
  if (!struck && bondOf(actor)) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Bound.NoTarget", { name: actor.name }));
  }
  const signature = signatureEffects(actor.items.contents, {
    ...actor.signatureTurnState,
    // A creature's blow is the block's row rather than an owned weapon, so
    // there is no off hand to report; what the TARGET is carrying is read the
    // same way the character path reads it (D-696).
    ...(struck
      ? { target: { creatureType: struck.creatureType ?? null, acted: struck.acted, conditions: struck.conditions ?? {} } }
      : {})
  });
  const weaponEffects = mergeWeaponEffects(traitEffects, signature);
  const rating = (weaponEffects.damageRatingSet ?? (thinned ? thinnedRating(full) : full)) + (weaponEffects.damageRating ?? 0);
  // **WHAT THE BLOW IS STRUCK WITH** (D-725): the row's own words, a bite or a
  // tail or a named blade, and the title where an ability's attack carries no
  // row name of its own.
  //
  // **AND THE WAY IT IS STRUCK** (D-731). A Bandit's hand axe is swung inside
  // reach and thrown past it, by the same distance rule a character's weapon
  // opens on. The block prints ONE Bonus and this door measures no reach, no
  // range band and no Engaged Bane, so the way changes the record and nothing
  // else - and there is no control for it: a creature's row is the GM's
  // number, not a weapon with two profiles. `mode` is a caller settling it; an
  // Opportunity Attack only prefers the hand, passing it where the row has one
  // and nothing where the row only throws or shoots.
  const rowModes = rowAttackModes(attack, { title });
  // **A WAY THE ROW HAS NOT GOT IS REFUSED IN WORDS** (D-731's review), exactly
  // as the weapon door refuses one. No caller in `module/` forces a way now;
  // `mode` is still this door's public option, so the refusal stays, and the
  // attacks batch calls it with a Troll Headhunter's Barbed javelin in the hand.
  if (mode && !rowModes.includes(mode)) {
    ui.notifications?.warn(game.i18n.format(AZEROTH.attackModeRefusals[mode] ?? "AZEROTH.Attack.NoWay.Hand", { name: attack.name ?? title ?? actor.name }));
    return null;
  }
  let way = rowModes.includes(mode) ? mode : rowModes[0];
  if (!rowModes.includes(mode) && rowModes.length > 1) {
    const aimedActor = intendedTargets[0] ? targetActorOf(intendedTargets[0]) : null;
    const traitsHeld = (attack.traits ?? []).map(String);
    way = defaultAttackMode(rowModes, {
      distance: aimedActor ? distanceBetween(actor, aimedActor) : null,
      reach: reachOf(traitsHeld),
      throwRange: thrownRange(traitsHeld) ?? attack.range ?? null
    });
  }
  const strike = strikeForRow(attack, { index, title, mode: way });
  const ghoulBonus = ghoulEnrageDamage(actor, game.time?.worldTime, way);
  if (ghoulBonus) provenanceExtra.push({ label: "Ghoul Enrage", value: ghoulBonus });
  // The form a talent's patch draws the strike as (door 20), where it is one of
  // `STRIKE_FORMS`: the animation layer reads the record, never the talent. The
  // record is this call's own, so it is written in place.
  const patchedForm = typeof sys.attackForm === "string" && STRIKE_FORMS.includes(sys.attackForm) ? sys.attackForm : null;
  if (patchedForm) Object.assign(strike, { form: patchedForm, via: strike.via ?? "named", reason: null });
  // **A CREATURE ROLLS TWICE TOO** (D-704's L1). The trait is a GM's to add and
  // 14 carries it on no block; where it is on, the creature's blow goes through
  // the same two-roll door a character's does. A Boss Action that attacks is an
  // attack (14 §1) and doubles with it; an Opportunity Attack is one blow and
  // arrives here carrying `budget: "none"`, which is what says so, as does a
  // maneuver's Opposed Test with no damage row.
  const rolls = rollsPerAttack({
    extraAttack: actor?.hasExtraAttack === true,
    reaction: budget === "none" || budget === "reaction",
    opposed: damage === false
  });
  const rollSpec = {
    kind: "attack",
    title: title ?? attack.name,
    ...(!searing && rolls > 1 && !singleAttack ? { rolls } : {}),
    ...(!searing && rolls > 1 && !singleAttack && (sacrifice.watching || sacrifice.interceptions.length)
      ? { rebuildSecond: async ({ args, secondTargets }) => {
        const next = refreshVoidwalkerInterception(sacrifice, secondTargets, token =>
          targetSnapshots([{ id: token.id, name: token.name, actor: token.actor, scene: token.parent }])[0]);
        if (!next.ok) {
          ui.notifications?.warn(game.i18n.localize("AZEROTH.VoidwalkerSacrifice.TargetChanged"));
          return null;
        }
        return npcAttackWithDialog(actor, index, null, { title, targets: next.originalTargets, attack: override,
          bossAction, budget: "none", dc, damage, gainsMomentum, mode: way, fromFeature, run,
          singleAttack: true, damageSchool, prepareOnly: true });
      } } : {}),
    // A declared NPC action can revalidate after the dialog, immediately
    // before the ordinary workflow pays and rolls. Ordinary attacks omit it.
    ...(searing || sacrifice.watching || sacrifice.interceptions.length ? { run: async args => {
      if (searing && searingRefused(sacrifice.interceptions.length ? intendedTargets : args.targets)) return null;
      if ((sacrifice.watching || sacrifice.interceptions.length) && (!sacrifice.valid()
        || sacrifice.interceptions.length && JSON.stringify(args.targets) !== JSON.stringify(sacrifice.targets))) {
        ui.notifications?.warn(game.i18n.localize("AZEROTH.VoidwalkerSacrifice.TargetChanged"));
        return null;
      }
      const workflow = run ?? game.system.azeroth.workflows.rollTest;
      const actual = { ...args, sacrificeInterceptions: sacrifice.interceptions };
      if (searing) return runSearingAttack({ actor, index, source: searingSource,
        originalTargets: sacrifice.interceptions.length ? intendedTargets : args.targets, args: actual, workflow,
        valid: () => !(sacrifice.watching || sacrifice.interceptions.length) || sacrifice.valid() });
      return workflow(actual);
    } } : typeof run === "function" ? { run } : {}),
    ...(thinned ? { subtitle: game.i18n.localize("AZEROTH.Sheet.Thinned") } : {}),
    modifiers: [{ label: "AZEROTH.Sheet.AttackBonus", value: (attack.bonus ?? 0) + standing }],
    weaponEffects,
    // What it is struck with (D-725).
    strike,
    // The feature card that made it - a bound creature commanded from its owner's
    // card (the Legacy branches' door 2) - a record as `strike` is.
    ...(fromFeature ? { fromFeature } : {}),
    // What the TARGET is wearing answers back on a hit (08 §20, D-692): a
    // creature's blow lands on a character wearing a Skullflame Shield too.
    struckBack: struckBackRows(targets ?? targetSnapshots(), actor),
    // And what the target may answer WITH (06 §6, D-693). This is the common
    // case at a table: the creature swings and the shielded player Blocks.
    reactions: reactionRows(targets ?? targetSnapshots(), { attacker: actor }),
    // **A COMPANION'S FLANKING** (04's Pack Tactics, D-773): its owner's talent,
    // measured as the character's attack measures it.
    ...((pack => (pack ? { packFlank: pack } : {}))(packFlankOf(actor, sacrifice.interceptions.length
      ? game.scenes?.get(struck?.sceneId)?.tokens.get(struck?.tokenId) ?? null
      : [...(game.user.targets ?? [])][0] ?? null))),
    heavyBane: weaponEffects.heavyBane,
    damage: damage ? { rating: rating + ghoulBonus, kind: spec.kind, school: spec.school, penetration: spec.penetration, ...(weaponEffects.damageMultiplier ? { multiplier: weaponEffects.damageMultiplier } : {}) } : null,
    // A maneuver may fix the DC - Disarm's Opposed Test at 12 (D-626).
    ...(dc !== null ? { dc } : {}),
    traits: await traitDefinitions(attack.traits ?? [], actor),
    ...(bossAction ? { bossAction: true } : {}),
    // A creature's Opportunity Attack passes `budget: "none"`: the Reaction
    // was spent at the card's door (06 §6, D-694).
    ...(budget ? { budget } : {}),
    ...(gainsMomentum ? {} : { gainsMomentum: false }),
    ...(targets ? { targets } : {}),
    ...(provenanceExtra.length ? { provenanceExtra } : {})
  };
  return prepareOnly ? rollSpec : rollWithDialog(actor, rollSpec, event);
}

/** The traits pack's documents, read once (D-649). */
let TRAIT_DOCS = null;
async function traitDocs() {
  if (TRAIT_DOCS) return TRAIT_DOCS;
  const pack = game.packs.get("azeroth-rpg.traits");
  TRAIT_DOCS = pack ? await pack.getDocuments() : [];
  return TRAIT_DOCS;
}

/**
 * What an attack's traits do, for the card (D-649): 08 §5's definition by
 * the trait's base name (`Pierce 2` reads `Pierce X`), and where a
 * creature's attack names one of the block's own abilities (a boar's Gore),
 * that ability's text. A name neither holds is left off.
 */
export async function traitDefinitions(names = [], actor = null) {
  if (!names.length) return [];
  const docs = await traitDocs();
  const byBase = new Map(docs.map(d => [baseTrait(d.name).toLowerCase(), d]));
  const abilities = actor?.system?.creatureAbilities ?? [];
  const out = [];
  for (const raw of names) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    const base = baseTrait(name).toLowerCase();
    const doc = byBase.get(base) ?? null;
    const ability = doc ? null : abilities.find(a => String(a.name ?? "").toLowerCase() === base) ?? null;
    const html = doc?.system?.description ?? ability?.description ?? null;
    if (!html) continue;
    out.push({ name, html: await enrich(html, { relativeTo: actor }) });
  }
  return out;
}

/**
 * The traits pack's school traits, base name to school, read once (D-647).
 *
 * **Exported since D-711 phase 2**: the CHARACTER's attack door reads it too
 * now, so a Greater Flaming sword takes the Ward lane exactly as a creature's
 * Flaming claws do.
 */
let TRAIT_SCHOOLS = null;
export async function traitSchools() {
  if (TRAIT_SCHOOLS) return TRAIT_SCHOOLS;
  const pack = game.packs.get("azeroth-rpg.traits");
  const out = {};
  if (pack) {
    for (const e of await pack.getIndex({ fields: ["system.school"] })) {
      if (e.system?.school) out[baseTrait(e.name).toLowerCase()] = e.system.school;
    }
  }
  TRAIT_SCHOOLS = out;
  return out;
}

/**
 * Use a creature's ability or Boss Action (D-647): a `spell` kind casts the
 * spell it names through the dialog; the rest post the feature card.
 */
export async function useAbilityWithDialog(actor, list, index, event = null) {
  const row = actor?.system?.[list]?.[index] ?? null;
  const a = row?.automation ?? null;
  if (row && (a?.kind ?? "none") === "none") {
    const { PRESENTATION_ONLY_ABILITIES } = await import("../rules/creature-animation-table.mjs");
    if (PRESENTATION_ONLY_ABILITIES.includes(row.name)) return game.system.azeroth.workflows.useAbility({ actor, list, index, targets: [] });
  }
  // **CUTTING GEAR** (the lead, 2026-10-22: *"Give constructs a trait or ability that
  // allows them to end one Entangled condition per turn no action required."*): read by
  // its NAME, whatever its automation says, and pressed through the one ability door.
  if (row && holdsCuttingGear([row])) return game.system.azeroth.workflows.useAbility({ actor, list, index, targets: [] });
  // A `passive` kind is standing and has nothing to press (D-691): the sheet
  // draws no button for one, and this is the same refusal at the door.
  if (!row || !isPressable(a)) return null;
  if (a.kind === "spell") {
    const delegation = delegatedAbilitySpell(row.description ?? "");
    return castNamedSpell(actor, a.spell || row.name, event, { self: delegation?.self === true && delegation.name === a.spell });
  }
  return game.system.azeroth.workflows.useAbility({ actor, list, index, targets: targetSnapshots() });
}

/** Cast a spell 07 names, by name, from the pack (D-647): a creature's Spells line. */
export async function castNamedSpell(actor, name, event = null, { self = false } = {}) {
  const pack = game.packs.get("azeroth-rpg.spells");
  const entry = pack ? (await pack.getIndex()).find(e => e.name === name) ?? null : null;
  const spell = entry ? await pack.getDocument(entry._id) : null;
  if (!spell) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Cast.SpellMissing", { name }));
    return null;
  }
  if (!self) return castWithDialog(actor, spell, event);
  const source = sourceOf(actor);
  const token = game.scenes?.get(source?.sceneId)?.tokens.get(source?.tokenId);
  if (!token || token.actor?.uuid !== actor.uuid) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Cast.SelfTokenRequired"));
    return null;
  }
  const targets = targetSnapshots([token.object ?? { actor, id: token.id, scene: token.parent, name: token.name }]);
  const run = args => {
    if (game.scenes?.get(source.sceneId)?.tokens.get(source.tokenId) !== token || token.actor?.uuid !== actor.uuid) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Cast.SelfTokenRequired"));
      return null;
    }
    return game.system.azeroth.workflows.castSpell({ ...args, actor, spell, source, targets });
  };
  return castWithDialog(actor, spell, event, { targets, run });
}

/**
 * **A SPELL CAST FOR NOTHING, AT ONE CREATURE** (04's Hammer of Justice at rank
 * 2: *a spell or feature of yours that cost 5 or more Zeal also applies Hammer
 * of Justice to its target, or to one target of your choice if it had several,
 * costing no Mana and no action*; D-772). The spell the character holds, else
 * 07's entry by name; the dialog as any cast's, because the DC and the Boons are
 * the table's (D-601), aimed at the one creature, and `castSpell`'s `free`
 * charging neither Mana nor the turn's budget. The user's own targets are put
 * back afterwards, as an extra strike puts them back.
 *
 * @param {Actor} actor
 * @param {string} name  the spell, by 07's name
 * @param {{by?: string, target?: {tokenId?: string}|null, event?: Event|null}} [o]
 */
export async function castFreeSpell(actor, name, { by = "", target = null, event = null } = {}) {
  let spell = actor.items.find(i => i.type === "spell" && i.name === name) ?? null;
  if (!spell) {
    const pack = game.packs.get("azeroth-rpg.spells");
    const entry = pack ? (await pack.getIndex()).find(e => e.name === name) ?? null : null;
    spell = entry ? await pack.getDocument(entry._id) : null;
  }
  if (!spell) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Cast.SpellMissing", { name }));
    return null;
  }
  const sys = spell.system;
  const classes = (actor.classItems ?? []).map(c => ({
    itemId: c.id, schools: c.system?.schools ?? [], castingAbility: c.system?.castingAbility ?? null
  }));
  const ability = grantingClass(classes, sys.school)?.castingAbility
    ?? (actor.classItems ?? []).find(c => c.system?.castingAbility)?.system?.castingAbility ?? null;
  const modifiers = [];
  if (ability) modifiers.push({ label: AZEROTH.abilities[ability], value: actor.system.abilities?.[ability]?.mod ?? 0 });
  modifiers.push({ label: "AZEROTH.Sheet.Proficiency", value: actor.system.proficiency ?? 0 });
  const onCanvas = canvas?.ready === true;
  const aim = target?.tokenId && onCanvas && canvas.tokens?.get(target.tokenId) ? target.tokenId : null;
  const previous = aim ? [...(game.user.targets ?? [])].map(t => t.id) : null;
  // The DC the entry states or a talent restates (D-775), as `castWithDialog` opens
  // at: a free cast is still the caster's own (`castSpell` reads both for it).
  const statedDc = spellDcFor(actor.takenTalents?.() ?? [], { name: spell.name }) ?? statedCastingDC(sys.effect);
  try {
    if (aim) canvas.tokens.setTargets([aim]);
    return await rollWithDialog(actor, {
      kind: "casting",
      title: spell.name,
      spell,
      modifiers,
      // 06 §5: a Casting Test made while Engaged takes a Bane (D-732).
      engaged: engagedNow(actor),
      ...(statedDc !== null ? { dc: statedDc } : {}),
      fallbackDC: castingDC({ tier: sys.tier }),
      fallbackSource: "spell",
      casting: { tier: sys.tier, mana: 0, pool: null, canPay: true, health: actor.system.health?.value ?? 0, perPoint: overchannelPerPoint(sys.tier), maxPoints: 0 },
      provenanceExtra: [{ label: "AZEROTH.Cast.FreeRow", value: null, formula: by }],
      free: { by },
      run: game.system.azeroth.workflows.castSpell
    }, event);
  } finally {
    if (previous) canvas.tokens.setTargets(previous);
  }
}

/**
 * Exposure through the dialog (10 SS3): the occasions as presets, each
 * carrying its DC, on the track's Resilience.
 */
export function exposeWithDialog(actor, track, event = null) {
  if (!AZEROTH.corruptionTracks[track]) return null;
  const occasions = Object.entries(AZEROTH.EXPOSURE_OCCASIONS)
    .filter(([, o]) => !o.track || o.track === track)
    .map(([key, o]) => ({ key, dc: o.dc, label: `AZEROTH.Occasion.${key[0].toUpperCase()}${key.slice(1)}` }));
  return rollWithDialog(actor, {
    kind: "resilience",
    track,
    // WHICH RESILIENCE (10 §3: Fel and Void on Spirit, Undeath on Body). The
    // dialog could not tell a Spirit Test from any other without it, so an
    // ally's Aura of Resolve never reached an exposure Test (D-755). The
    // workflow takes the track and ignores this key.
    resilience: AZEROTH.corruptionResilience[track],
    title: `${game.i18n.localize("AZEROTH.Card.Exposure")}: ${game.i18n.localize(AZEROTH.corruptionTracks[track])}`,
    modifiers: game.system.azeroth.workflows.resilienceModifiers(actor, AZEROTH.corruptionResilience[track]),
    occasions,
    fallbackDC: occasions[0]?.dc ?? 12,
    fallbackSource: "occasion",
    run: game.system.azeroth.workflows.corruptionExposure
  }, event);
}

/**
 * Roll a bare ability Test - no skill, no Rank.
 * @param {Actor} actor
 * @param {string} key  One of AZEROTH.abilities' keys.
 * @param {Event|null} [event]
 */
export function rollAbility(actor, key, event = null) {
  const ability = actor.system.abilities?.[key];
  // A Mindless creature carries no Int and no Cha (D4 §10.2). The template
  // draws no action on an absent plate; this is the guard behind it.
  if (!ability || ability.value === null) return null;
  return rollWithDialog(actor, {
    kind: "skill",
    title: game.i18n.localize(AZEROTH.abilities[key]),
    modifiers: [{ label: AZEROTH.abilities[key], value: ability.mod }]
  }, event);
}

/**
 * 05 §11 and 06 §7's maneuvers as rows (D-626): the cost with the actor's
 * discounts, Charge's free one, whether the Momentum pool can pay. Shared by
 * the character's Combat tab and the creature's sheet (2026-09-06): a
 * creature holding Momentum spends it on the same table.
 */
export function maneuversContext(actor) {
  const ctx = actor.maneuverContext?.() ?? {};
  const pool = (actor.poolSnapshot?.() ?? []).find(p => p.kind === "momentum") ?? null;
  return AZEROTH.maneuvers.map(m => {
    const priced = maneuverCost(m.key, ctx);
    const usable = m.key !== "calledShot";
    return {
      key: m.key,
      label: m.label,
      text: m.text,
      cost: priced.cost,
      baseCost: priced.base,
      charge: priced.gain > 0,
      rows: priced.rows,
      usable,
      affordable: usable && pool !== null && pool.value >= priced.cost,
      expandId: `maneuver-${m.key}`
    };
  });
}

/**
 * The plate's score box shows the score AS WORN (2026-09-06) and is
 * nameless, so a submit never writes the total back as the base. **A change
 * moves the stored score by what the shown one was moved by, net of EVERY
 * change on it** (D-769, the review; `rules/abilities.mjs#storedFromShown`):
 * the gear, an elixir's +2, anything an effect adds. It used to net out the
 * gear alone, so an edit under an elixir stored the elixir. A score an
 * override holds - a shape's three - is refused in words, so an edit on a
 * plate rendered before the shift cannot store the bear's 14. Read off the
 * LIVE actor at the change, never off the render. Both sheets draw
 * attributes.hbs, so both bind this once per rendered element.
 */
export function bindScoreInputs(sheet) {
  for (const input of sheet.element.querySelectorAll("input.azeroth-score[data-ability-score]")) {
    if (input.dataset.azerothBound) continue;
    input.dataset.azerothBound = "1";
    input.addEventListener("change", () => {
      const key = input.dataset.abilityScore;
      const actor = sheet.actor;
      const ability = actor?.system?.abilities?.[key] ?? {};
      const shown = ability.total ?? ability.value;
      const heldBy = scoreHeldBy((actor?.appliedEffects ?? []).map(e => ({ name: e.name, changes: e.system?.changes ?? [] })), key);
      if (heldBy !== null) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Sheet.ScoreHeld", {
          ability: game.i18n.localize(AZEROTH.abilities[key] ?? key), effect: heldBy
        }));
        input.value = shown;
        return;
      }
      const next = storedFromShown({ typed: input.value, shown, stored: actor?._source?.system?.abilities?.[key]?.value ?? ability.value });
      if (next === null) return;
      actor.update({ [`system.abilities.${key}.value`]: next });
    });
  }
}

/* -------------------------------------------- */
/*  The pool stepper (the lead, 2026-09-13)      */
/* -------------------------------------------- */

/**
 * The pool row `poolSnapshot` holds for a stepper's `data-*` pair, or null.
 *
 * A character's pools are keyed by the CLASS item that grants them; a
 * creature's are flat and their `itemId` is null, which the template renders
 * as an empty attribute. `|| null` is what makes one reader answer for both.
 */
export function poolRowFor(actor, { itemId = null, kind = null } = {}) {
  const want = itemId || null;
  return actor?.poolSnapshot?.().find(p => (p.itemId ?? null) === want && p.kind === kind) ?? null;
}

/**
 * Step a pool by one (the lead, 2026-09-13). Both sheets register it; both
 * write through `AzerothActor#updatePool`, which is THE write door and the
 * only thing that clamps.
 *
 * *There should also be a way to just add/remove [a] point* - the pool had a
 * Spend button and nothing else, so a GM handing a Warrior 2 Rage back after a
 * miscount had to open the class item.
 */
export async function stepPool(actor, target) {
  const { itemId, kind } = target.dataset;
  const pool = poolRowFor(actor, { itemId, kind });
  if (!pool) return null;
  const delta = Number(target.dataset.delta) || 0;
  return actor.updatePool({ itemId: itemId || null, kind, value: pool.value + delta });
}

/**
 * The pool's value typed straight in. **Nameless**, so `submitOnChange` never
 * sees it (the pool lives on `system.classes[]` for a character and on
 * `system.power`/`system.momentum` for a creature — neither is a field this
 * input could name), which is why it is bound here rather than carrying a
 * `data-action`: an action fires on CLICK and an input emits `change`.
 *
 * **A number input reports `""` for anything it cannot parse**, so `abc`
 * arrives as the empty string and `Number("")` is 0 — writing that would empty
 * the pool on a typo. The guard puts the stored value back and changes
 * nothing.
 *
 * The clamped value is written back into the box before the update is awaited:
 * `updatePool` skips a write that moves nothing, so typing 99 into a full pool
 * would otherwise leave `99` on screen with no re-render to correct it.
 */
export function bindPoolInputs(sheet) {
  for (const input of sheet.element.querySelectorAll("input.azeroth-pool-value")) {
    if (input.dataset.azerothBound) continue;
    input.dataset.azerothBound = "1";
    input.addEventListener("change", () => {
      const { itemId, kind } = input.dataset;
      const pool = poolRowFor(sheet.actor, { itemId, kind });
      if (!pool) return;
      const raw = String(input.value ?? "").trim();
      const typed = Number(raw);
      if (!raw || !Number.isFinite(typed)) {
        input.value = String(pool.value);
        return;
      }
      const clamped = Math.max(0, Math.min(pool.max, Math.trunc(typed)));
      input.value = String(clamped);
      sheet.actor.updatePool({ itemId: itemId || null, kind, value: clamped });
    });
  }
}

/**
 * Use a consumable (08 SS12, SS13; D-668). The targets are whoever the user
 * has picked, as an attack reads them, so a thrown flask names them on its
 * card; a draught is drunk by its owner whatever is targeted.
 */
export async function useGearWithDialog(actor, item) {
  return game.system.azeroth.workflows.useGear({ actor, item, targets: targetSnapshots() });
}

/**
 * Press an item's Signature (08 SS20, D-692). The one door all three surfaces
 * use - the item sheet, the Overview row and the Combat row - so a press
 * behaves the same wherever it was clicked.
 *
 * **A `spell` kind casts through the Forge's own door.** `system.spells[]`
 * carries the uuid, the DC and the uses, and `castItemSpell` has read that
 * since D-633; routing here rather than inside the workflow is what keeps
 * `dice/workflows.mjs` from importing an application module.
 *
 * **AND THAT BRANCH RE-CHECKS FIRST** (2026-09-10). It went straight to
 * `castItemSpell`, so for a `spell` kind the gate, the uses and the `noSpell`
 * refusal were enforced by the template's `disabled` attribute and nothing
 * else - `pressRefusal` was never consulted on that path and `useSignature`'s
 * own `CastsInstead` guard was unreachable. A macro or a stale render calling
 * `useSignatureWithDialog(rogue, benediction)` cast Renew for a Rogue. Every
 * other door in this file re-checks at the press for the reason the Reaction
 * rows state above: **the card is a record of a moment and the world moves
 * under it.** `refuseSignaturePress` is the same judgement and the same words
 * `useSignature` refuses with, so neither path can drift from the other.
 */
export async function useSignatureWithDialog(actor, item, event = null) {
  const signature = signatureEffectOf(item);
  if (signature?.kind === "spell") {
    if (game.system.azeroth.workflows.refuseSignaturePress({ actor, item })) return null;
    return castItemSpell(actor, item, 0, event);
  }
  return game.system.azeroth.workflows.useSignature({ actor, item, targets: targetSnapshots() });
}

/**
 * ONE ROW FOR ALL THREE SURFACES (08 SS20, S3; D-692) - the item sheet's
 * Signature block, the Overview tab's In-force column and the Combat tab's
 * panel. Three copies of this judgement would be three chances for a button to
 * appear where the door refuses, and the surface always loses that race.
 *
 * What it settles, and why:
 *
 * - **`pressable` is `isPressable` and nothing else.** A standing Signature, an
 *   on-hit, a whenStruck and a tick are all enforced elsewhere and nobody
 *   presses them; a Use control on any of those rows would do nothing at all,
 *   which is the shape D-681 keeps finding. Those rows draw as TEXT.
 * - **A refusal is said in words, never a grey button alone** (D5): the gate
 *   that does not hold, the use spent, the `spell` kind whose `system.spells[]`
 *   is empty. **Benediction and Netherwind Regalia are filled now** - the SS20
 *   parser reads the bold run - so the refusal is the one a GM's own casting
 *   item still takes. `pressRefusal` is the same judgement `useSignature`
 *   refuses on.
 * - **The gate is printed whether it holds or not**, because *a Paladin
 *   wielding it* has to be readable on a Rogue's sheet: that is how a player
 *   learns why the sword is doing nothing.
 * - **AND A GATE COVERS ONLY ITS OWN SENTENCE** (D-722; the lead,
 *   2026-09-14). `gatedParts` is one row per gated sentence with its own
 *   verdict, beside `gates`, which keeps its meaning — the trunk's. A Rogue
 *   holding *a creature that hits you takes 1 Nature damage; a Shaman wielding
 *   it adds 2 to its Damage Rating* must read the refusal under the Damage
 *   Rating alone: the retaliation is working for them, and a whole-item gate
 *   failing would say the opposite of the truth.
 *
 * @param {Item} item
 * @param {Actor|null} [actor]  the bearer, for the gate; null on a pack sheet
 * @returns {object|null}  null where the item carries no descriptor at all
 */
export function signatureContext(item, actor = null) {
  const signature = signatureEffectOf(item);
  if (!signature) return null;
  const shared=actor?charmUseView(item.system?.identifier,actor.getFlag?.('azeroth-rpg',SIGNATURE_USES_FLAG),item.system?.equipped===true):null;
  if(shared)signature.use.uses={value:shared.value,max:shared.max,per:shared.per};
  const fires = hasSignature(signature);
  const state = actor?.signatureTurnState ?? null;
  // WITH NO BEARER THERE IS NO GATE TO JUDGE. A pack sheet is not worn by
  // anybody, so the block prints the gate and says nothing about whether it
  // holds - `gateHolds` would fail every bearer clause closed and read as
  // *this does not work*, which is a different and wrong sentence.
  const holds = state ? gateHolds(signature.gates, state) : true;
  const spells = Array.isArray(item?.system?.spells) ? item.system.spells.length : 0;
  // **THE BUTTON HAS A GATE OF ITS OWN** (D-722). `pressGates` is the trunk's
  // list where the pressed sentence is the gated one and `useGates` where it is
  // not, and the door (`workflows.refuseSignaturePress`) reads exactly the same
  // function - two judgements would be a control that looks live and refuses on
  // the click, which is the drift S3 exists to prevent.
  const press = pressGates(signature);
  const pressHolds = state ? gateHolds(press, state) : true;
  const gearRefusal = dispersionRefusal(actor, "gear");
  const refusal = gearRefusal ?? shared?.refusal ?? (state ? pressRefusal(signature, { holds: pressHolds, spells }) : null);
  const use = signature.use ?? {};
  const clause = g => ({
    kind: g.kind,
    label: g.kind ? AZEROTH.signatureGates[g.kind] ?? null : null,
    value: g.value ?? ""
  });
  return {
    fires,
    kind: signature.kind,
    // The SENTENCE, for a line (the Overview column reads it as one).
    kindLabel: fires ? AZEROTH.signatureKinds[signature.kind] ?? null : null,
    // The LABEL, for a chip. *Something the bearer presses* is 190px wide
    // beside an action and a limit and reads as prose in a row of one-word
    // chips; the eye caught it on the first shot.
    kindChip: fires ? AZEROTH.signatureKindsShort[signature.kind] ?? null : null,
    // WHY IT IS STILL PROSE, where somebody read it and left it alone (D-691's
    // own rule): the sheet says so rather than the sentence sitting inert with
    // no explanation. A `none` with no reason prints nothing.
    reason: !fires && signature.reason ? AZEROTH.signatureReasons[signature.reason] ?? null : null,
    gates: (signature.gates ?? []).map(clause).filter(g => g.label),
    gated: (signature.gates ?? []).length > 0,
    // Null where there is no bearer to judge against - the pack sheet's case.
    holds: state ? holds : null,
    // The two booleans a template needs, because `holds` is THREE-valued and
    // `{{#if}}` cannot tell null from false: an unworn item must say neither
    // *it holds* nor *it does not*.
    gateHolds: Boolean(state) && (signature.gates ?? []).length > 0 && holds,
    gateFails: Boolean(state) && (signature.gates ?? []).length > 0 && !holds,
    // **THE GATED SENTENCES, EACH WITH ITS OWN VERDICT** (D-722). A Rogue
    // wearing the lead's own worked item has to read *One sentence only - Only
    // for one class: Shaman. That sentence does not apply to you.* UNDER the
    // Damage Rating and nothing beside the retaliation that IS working for
    // them; a whole-item gate failing says the opposite of the truth. The gate
    // is printed whether it holds or not (D-692) and the refusal is said in
    // words, never by a grey (D5).
    gatedParts: (signature.gated ?? []).map(branch => {
      const clauses = (branch.gates ?? []).map(clause).filter(g => g.label);
      const stands = state ? gateHolds(branch.gates ?? [], state) : true;
      return { gates: clauses, holds: Boolean(state) && stands, fails: Boolean(state) && !stands };
    }).filter(part => part.gates.length),
    // The clauses that qualify the BUTTON ALONE, printed beside it. **Only
    // where the press has a gate OF ITS OWN**: `pressGates` falls back to the
    // trunk's list, which every surface has already printed above, and a
    // second copy of the same clause on the same row reads as two gates.
    pressGates: signaturePressable(signature) && (signature.useGates ?? []).length
      ? press.map(clause).filter(g => g.label)
      : [],
    pressable: signaturePressable(signature),
    refusal,
    refusalLabel: gearRefusal ?? (refusal ? AZEROTH.signatureRefusals[refusal] ?? null : null),
    actionLabel: use.action ? AZEROTH.actions[use.action] ?? null : null,
    cost: use.cost?.pool && use.cost?.amount
      ? { amount: use.cost.amount, label: AZEROTH.poolTypes[use.cost.pool] ?? use.cost.pool }
      : null,
    // The uses chip's own shape (D-623), so `uses.hbs` draws it unchanged.
    uses: use.uses?.per ? { value: use.uses.value ?? 0, max: use.uses.max ?? 0, per: AZEROTH.usesPer[use.uses.per] ?? use.uses.per } : null
  };
}

/** The browser, open on the spells (D-599's "Add a spell"). */
export function browseSpells(filters = {}) {
  return AzerothCompendiumBrowser.browse({ category: "spells", filters });
}

/**
 * The browser, open on a kind of thing: the Gear tab's Add buttons
 * (2026-09-06).
 *
 * **It took a `slot` until D-689** and narrowed to that slot's facet, for the
 * Overview tab's empty tiles. The lead asked for the browser off that tab -
 * a slot now lists what the character is already carrying and nothing else -
 * so the option went with the caller rather than sitting here unreachable
 * (D-681: right code with no caller is this system's commonest real fault).
 */
export function browseItems(type) {
  const category = { weapon: "weapons", armor: "armor", gear: "gear", spell: "spells" }[type] ?? "gear";
  return AzerothCompendiumBrowser.browse({ category });
}

/**
 * A GM's right click on an Add button (2026-09-06): a blank item of that
 * kind, the way the button itself used to make one. A player's Add browses
 * and nothing else.
 */
export function blankItemMenu(sheet) {
  const entries = [
    { label: "AZEROTH.Sheet.CreateBlank", icon: "fa-solid fa-file", visible: () => game.user.isGM,
      onClick: (event, target) => sheet.options.actions.createItem?.call(sheet, new MouseEvent("click"), target) }
  ];
  return new foundry.applications.ux.ContextMenu.implementation(sheet.element, ".azeroth-add-row button[data-type]", entries, { jQuery: false, fixed: true });
}

/* -------------------------------------------- */
/*  Conditions and effects (partials/effects.hbs, both sheets)              */
/* -------------------------------------------- */

/**
 * How long this effect still has, in CORE's OWN WORDS, or null where it does
 * not end (2026-09-20).
 *
 * `ActiveEffect#duration.label` is computed by `_prepareDuration` (14.367) and
 * is what core's own effect sheet prints, so the Overview strip cannot say a
 * different span from the document. **`remaining` is the guard, never
 * `isTemporary` alone**: an effect measured in rounds outside a started fight
 * falls back through `_prepareCombatBasedDuration` to `COMMON.None` with
 * `remaining: Infinity`, and printing *None* beside a name reads as a span.
 *
 * Nothing here touches `duration.type`, which is a v14 deprecation shim and
 * would fail the smoke run's no-warning rule.
 */
function durationLabel(effect) {
  if (!effect?.isTemporary) return null;
  return Number.isFinite(effect.duration?.remaining) ? (effect.duration.label ?? null) : null;
}

/**
 * The flag naming the sync that WROTE this effect, or null for one a person
 * laid down: a talent's own passive (`syncTalentEffects`, D-648) or an
 * owner's talent on a bound creature (`syncBound`, D-643). Both are diffed
 * and re-created, so clearing one by hand is a control that does nothing -
 * `rules/in-play.mjs#clearRefusal` turns it into a sentence instead.
 */
function syncedBy(effect) {
  for (const flag of Object.keys(SYNCED_REASONS)) {
    if (effect.getFlag("azeroth-rpg", flag)) return flag;
  }
  return null;
}

/** What the effects partial reads. */
export function effectsContext(actor) {
  const block = iceBlockFor(actor);
  const dispersion = dispersionFor(actor);
  const statuses = actor.statuses ?? new Set();
  const conditions = Object.entries(AZEROTH.conditions).map(([id, label]) => {
    const effect = actor.effects?.find(e => e.statuses?.has(id)) ?? null;
    return {
      id,
      label,
      img: CONFIG.statusEffects?.[id]?.img ?? "icons/svg/aura.svg",
      active: statuses.has(id),
      valued: AZEROTH.valuedConditions.includes(id),
      value: effect ? (effect.getFlag("azeroth-rpg", "value") ?? 1) : 0,
      // For the Overview strip (2026-09-20). The Core grid draws no span: a
      // hand-toggled condition carries none (D-628) and this is null there.
      duration: durationLabel(effect)
    };
  });
  // A status is on the strip; everything else - and an injury, which carries
  // a status AND is a real effect - is a row.
  const rows = (actor.effects?.contents ?? [])
    .filter(e => !e.statuses?.size || e.getFlag("azeroth-rpg", "injury"))
    // `active`, `duration` and `synced` are the Overview strip's (2026-09-20);
    // `effect-list.hbs` reads neither and is untouched. ONE READER for both
    // surfaces, so the strip and the Core list cannot disagree about what is
    // in force - which is the whole reason the strip takes this context rather
    // than walking `actor.effects` a second time.
    .map(e => ({
      id: e.id, name: e.name, img: e.img, disabled: e.disabled,
      iceBlock: block?.id === e.id,
      dispersion: dispersion?.id === e.id,
      canEndDispersion: dispersion?.id === e.id && canEndDispersion(actor),
      canEndIceBlock: block?.id === e.id && canEndIceBlock(actor),
      mindControlSaves: Boolean(globalThis.game?.user?.isGM && globalThis.game?.users?.activeGM===globalThis.game.user
        && e.getFlag("azeroth-rpg", "mindControl")),
      dominationOrder: Boolean(globalThis.game?.user?.isGM && globalThis.game?.users?.activeGM===globalThis.game.user
        && ["dominate", "enslave-demon"].includes(e.getFlag("azeroth-rpg", "identifier"))),
      mindSootheHarm: Boolean(globalThis.game?.user?.isGM && globalThis.game?.users?.activeGM===globalThis.game.user
        && e.getFlag('azeroth-rpg', 'identifier') === 'mind-soothe' && !e.disabled && e.active !== false),
      enslaveMinute: Boolean(globalThis.game?.user?.isGM && globalThis.game?.users?.activeGM===globalThis.game.user
        && enslaveMinuteDue(e.flags?.['azeroth-rpg'], game.time?.worldTime) !== null),
      enslaveClockReview: Boolean(globalThis.game?.user?.isGM && globalThis.game?.users?.activeGM===globalThis.game.user
        && e.getFlag('azeroth-rpg', 'identifier') === 'enslave-demon' && !Number.isFinite(e.getFlag('azeroth-rpg', 'enslaveNextSave'))),
      // Core's own reading: neither disabled nor suppressed.
      active: e.active !== false,
      permanent: e.getFlag("azeroth-rpg", "permanent") === true,
      duration: durationLabel(e),
      synced: syncedBy(e)
    }));
  // Each rung by its chapter name (10 §4 to §6, 2026-09-06), where the actor derives them.
  const rungs = actor.system?.corruptionEffects?.rungs ?? [];
  const thresholds = (actor.system?.derivedEffects ?? []).map(t => ({
    ...t, label: AZEROTH.corruptionTracks[t.track],
    name: rungs.find(r => r.track === t.track && r.at === t.threshold)?.name ?? null
  }));
  const dispersionEndingReview = game.user?.isGM && game.users?.activeGM?.id === game.user.id
    && Object.values(actor.getFlag("azeroth-rpg", "dispersionEndings") ?? {}).some(r => r?.version === 1 && r.state === "creating");
  const antivenom = actor.getFlag("azeroth-rpg", "antivenomUse");
  const consumable=actor.getFlag('azeroth-rpg','consumableUse');
  const consumableReview=game.user?.isGM&&game.users?.activeGM?.id===game.user.id
    &&!!consumable&&!['complete','reviewed','cancelled'].includes(consumable.stage);
  const antivenomReview = game.user?.isGM && game.users?.activeGM?.id === game.user.id
    && !!antivenom && !["complete", "reviewed"].includes(antivenom.stage);
  const signatureUseReview=game.user?.isGM&&game.users?.activeGM?.id===game.user.id
    &&Object.entries(actor.getFlag?.('azeroth-rpg',SIGNATURE_USES_FLAG)??{}).some(([id,row])=>approvedRestSignature(id)&&row?.state==='pending');
  const signatureParryReview=game.user?.isGM&&game.users?.activeGM?.id===game.user.id
    &&Boolean(actor.getFlag?.('azeroth-rpg','signatureTurnUses')?.['conquerors-battlegear']?.pending);
  const signatureKillReview=game.user?.isGM&&game.users?.activeGM?.id===game.user.id
    &&(['death-grips','spinal-reaper'].some(id=>actor.getFlag?.('azeroth-rpg','signatureTurnUses')?.[id]?.pending)
      ||[...(game.messages?.values?.()??[])].some(message=>ChatMessage.getSpeakerActor(message.speaker)===actor
        &&!message.getFlag('azeroth-rpg','signatureWeaponKillReview')
        &&['death-grips','spinal-reaper'].some(id=>message.getFlag('azeroth-rpg','signatureWeaponKill')?.[id]?.state==='pending')));
  const signatureHitReview=game.user?.isGM&&game.users?.activeGM?.id===game.user.id
    &&['the-horsemans-blade','idol-of-brutality','idol-of-ferocity','band-of-veiled-shadows']
      .some(id=>actor.getFlag?.('azeroth-rpg','signatureTurnUses')?.[id]?.pending);
  const signatureHealingReview=game.user?.isGM&&game.users?.activeGM?.id===game.user.id&&healingSignatureReviewState(actor).pending;
  const signatureDamageReview=game.user?.isGM&&game.users?.activeGM?.id===game.user.id&&(damageSignatureCards(actor).length>0||orphanDamageCasts(actor).length>0||['reserved','uncertain'].includes(actor.getFlag?.('azeroth-rpg','sealingFlameRecipient')?.state));
  return { conditions, rows, thresholds, dispersionEndingReview, antivenomReview, consumableReview, signatureUseReview, signatureParryReview, signatureKillReview, signatureHitReview, signatureHealingReview, signatureDamageReview };
}

/**
 * One handler for the partial's five actions, shared by both sheets - and by
 * the Overview strip, which draws the same conditions and the same effects
 * with the same two doors (2026-09-20).
 *
 * A valued condition (A1: Bleeding X, Poisoned X) steps its value on the
 * effect's flag; stepping to 0 sheds it, and Poisoned stops at four.
 *
 * **A CLEAR THAT CANNOT HAPPEN IS SAID IN WORDS HERE**, through
 * `rules/in-play.mjs#clearRefusal`, and the strip asks the same function
 * before it draws a control: one rule, two doors (D-686). Fatigued has
 * refused in these words since D-624; a talent's or a bond's own effect is
 * new - deleting one removed it until the next sync wrote it back, which is
 * a control that does nothing (D-681).
 */
export async function effectAction(actor, action, target) {
  const condition = target.dataset.condition;
  const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
  const effect = effectId ? actor.effects.get(effectId) : null;
  const refuse = row => {
    const reason = clearRefusal(row, { actorType: actor.type });
    if (reason) ui.notifications?.warn(game.i18n.localize(reason));
    return reason;
  };
  switch (action) {
    case "reviewSignatureUses": {
      const {reviewSignatureUses}=await import('./signature-use-review.mjs');
      return reviewSignatureUses(actor);
    }
    case "reviewSignatureParry": {
      const {reviewSignatureParry}=await import('./signature-parry-review.mjs');
      return reviewSignatureParry(actor);
    }
    case "reviewSignatureHit": {
      const {reviewSignatureHit}=await import('./signature-hit-review.mjs');
      return reviewSignatureHit(actor);
    }
    case "reviewSignatureHealing": {
      const {reviewSignatureHealing}=await import('./signature-healing-review.mjs');
      return reviewSignatureHealing(actor);
    }
    case "reviewSignatureDamage": {
      const {reviewSignatureDamage}=await import('./signature-damage-review.mjs');
      return reviewSignatureDamage(actor);
    }
    case "reviewSignatureKills": {
      const {reviewSignatureKills}=await import('./signature-kill-review.mjs');
      return reviewSignatureKills(actor);
    }
    case "mindControlSaves": {
      const {mindControlSavesForEffect}=await import("./mind-control-saves.mjs");
      return mindControlSavesForEffect(actor,effect);
    }
    case "dominationOrder": {
      const { dominationOrderSave } = await import('./domination-orders.mjs');
      return dominationOrderSave(actor, effect);
    }
    case 'mindSootheHarm': {
      if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return null;
      const { mindSootheSnapshot, endMindSootheForHarm } = await import('../effects/mind-soothe.mjs');
      const snapshot = mindSootheSnapshot(actor);
      if (!snapshot.length) return null;
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize('AZEROTH.MindSootheHarm.Title') },
        content: `<p>${game.i18n.localize('AZEROTH.MindSootheHarm.Confirm')}</p>`, rejectClose: false
      });
      return confirmed ? endMindSootheForHarm(actor, snapshot) : null;
    }
    case "enslaveMinute": {
      const { dominationOrderSave } = await import('./domination-orders.mjs');
      return dominationOrderSave(actor, effect, { reason: 'minute', dueAt: enslaveMinuteDue(effect.flags?.['azeroth-rpg'], game.time?.worldTime) });
    }
    case 'enslaveClockReview': {
      const { reconcileEnslaveClockDialog } = await import('./domination-orders.mjs');
      return reconcileEnslaveClockDialog(actor, effect);
    }
    case "reviewDispersionAftermath": {
      const {reviewDispersionAftermath}=await import("./dispersion-aftermath-review.mjs");
      return reviewDispersionAftermath(actor);
    }
    case "reviewAntivenom": {
      const {reviewAntivenomUse}=await import("./antivenom-review.mjs");
      return reviewAntivenomUse(actor);
    }
    case "reviewConsumable": {
      const {reviewConsumableUse}=await import('./consumable-review.mjs');
      return reviewConsumableUse(actor);
    }
    case "toggleCondition":
      // Fatigued is the condition that puts a point on the track (A1, D-624):
      // on adds one, and the track keeps the status lit; off is a Long
      // Rest's to do, one point a night, so the chip refuses.
      if (actor.statuses?.has(condition) && refuse({ kind: "condition", id: condition })) return null;
      if (condition === "fatigued" && actor.type === "character") {
        return actor.update({ "system.fatigue": Math.min(AZEROTH.FATIGUE_MAX, (actor.system?.fatigue ?? 0) + 1) });
      }
      return actor.toggleStatusEffect(condition);
    case "stepCondition": {
      const delta = Math.trunc(Number(target.dataset.delta)) || 0;
      const current = actor.effects.find(e => e.statuses?.has(condition));
      const max = condition === "poisoned" ? AZEROTH.POISONED_MAX : 99;
      if (!current) {
        if (delta <= 0) return null;
        await actor.toggleStatusEffect(condition, { active: true });
        const made = actor.effects.find(e => e.statuses?.has(condition));
        return made?.setFlag("azeroth-rpg", "value", 1) ?? null;
      }
      const value = (current.getFlag("azeroth-rpg", "value") ?? 1) + delta;
      if (value <= 0) return actor.toggleStatusEffect(condition, { active: false });
      return current.setFlag("azeroth-rpg", "value", Math.min(max, value));
    }
    case "toggleEffect":
      if (effect && dispersionFor(actor)?.id === effect.id) {
        ui.notifications?.warn(game.i18n.localize("AZEROTH.Dispersion.CannotEnd"));
        return null;
      }
      if (effect && iceBlockFor(actor)?.id === effect.id) {
        ui.notifications?.warn(game.i18n.localize("AZEROTH.IceBlock.CannotEnd"));
        return null;
      }
      // **A SHAPE IS LEFT, NEVER SWITCHED OFF** (D-769): the sheet's toggle
      // refuses in words and points at Leave, the door that charges the
      // Half-Action. Switched off on core's effect sheet it is left all the same
      // (the table's override, `documents/shapes.mjs`).
      if (effect?.getFlag?.("azeroth-rpg", "shape")) {
        ui.notifications?.warn(game.i18n.localize("AZEROTH.Shape.NoPause"));
        return null;
      }
      return effect ? effect.update({ disabled: !effect.disabled }) : null;
    case "editEffect":
      return effect?.sheet?.render({ force: true }) ?? null;
    case "deleteEffect":
      if (!effect) return null;
      if (dispersionFor(actor)?.id === effect.id) {
        const result = await requestEndDispersion(actor, effect);
        if (!result?.ok) ui.notifications?.warn(game.i18n.localize(
          ["writeUncertain", "writeIncomplete", "aftermathReview"].includes(result?.reason)
            ? "AZEROTH.Dispersion.EndUncertain" : "AZEROTH.Dispersion.CannotEnd"));
        return result;
      }
      if (iceBlockFor(actor)?.id === effect.id) {
        const result = await requestEndIceBlock(actor, effect);
        if (!result?.ok) ui.notifications?.warn(game.i18n.localize(
          result?.reason === "writeUncertain" || result?.reason === "writeIncomplete"
            ? "AZEROTH.IceBlock.EndUncertain" : "AZEROTH.IceBlock.CannotEnd"));
        return result;
      }
      // **A SHAPE DELETED FROM THE SHEET'S OWN LIST IS LEFT THROUGH THE SHEET'S
      // DOOR** (D-769; the lead: *"Half-Action to leave"*): the banner's Leave,
      // the chip and this list are one price. Core's Token HUD and effect sheet
      // are the table's override and cost nothing (the hook in
      // `documents/shapes.mjs`). Imported here because combat-actions imports
      // this module.
      if (effect.getFlag?.("azeroth-rpg", "shape")) {
        const { leaveShapeControl } = await import("./combat-actions.mjs");
        return leaveShapeControl(actor);
      }
      if (refuse({ kind: "effect", id: effect.id, synced: syncedBy(effect) })) return null;
      return effect.delete();
    default:
      return null;
  }
}

/**
 * Enter or Space on an attribute plate rolls it. The plate is a <div> with
 * role="button" (a <button> would take core's height, ink and face, and the
 * bevelled clip-path clips a focus ring - D11 SS9), so the keyboard is bound
 * here. Idempotent per element.
 */
export function bindPlateKeys(root) {
  bindKeyActivation(root, ".azeroth-plate[data-action]");
  bindKeyActivation(root, '[data-action="expandItem"]');
}

/**
 * **A CREATURE'S NAME WRAPS UNDER ITSELF** (the lead, 2026-10-23: *"Wrap to two
 * lines"*). The NPC banner's name is a one-row `<textarea>` - an `<input>` cannot wrap,
 * and 14's *Mithril Mechanical Dragonling* was cut at the banner's edge. The stylesheet
 * sizes it to its text where the browser knows `field-sizing: content`; this sizes it
 * where it does not, keeps a pasted line break out of a name, and makes Enter commit
 * the name (the form submits on `change`, which the blur raises) rather than break a
 * line in it. Idempotent per element; a render's fresh element is bound afresh.
 */
export function bindWrappingName(root) {
  // Where the browser sizes the field itself, an inline height would only pin it
  // against the window's own resizing: the script sizes nothing there.
  const native = globalThis.CSS?.supports?.("field-sizing", "content") === true;
  for (const el of root?.querySelectorAll?.("textarea.azeroth-name") ?? []) {
    const fit = () => {
      if (native) return;
      el.style.height = "auto";
      // A minimised or hidden sheet measures nothing: one row stands until it can.
      const h = el.scrollHeight;
      if (h > 0) el.style.height = `${h}px`;
    };
    fit();
    if (el.dataset.azerothName) continue;
    el.dataset.azerothName = "1";
    el.addEventListener("input", () => {
      if (/[\r\n]/.test(el.value)) el.value = el.value.replace(/\s*[\r\n]+\s*/g, " ");
      fit();
    });
    el.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      el.blur();
    });
  }
}

/** Enter or Space activates a non-button element that carries an action. Idempotent per element. */
export function bindKeyActivation(root, selector) {
  for (const el of root?.querySelectorAll?.(selector) ?? []) {
    if (el.dataset.azerothKeys) continue;
    el.dataset.azerothKeys = "1";
    el.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      // A key inside the plate's own input edits the score; it does not roll.
      if (event.target !== el && event.target?.matches?.("input, select, textarea")) return;
      event.preventDefault();
      el.click();
    });
  }
}

/** A config map's entry as a label: a string is an i18n key, an object carries one. */
function enumLabel(map, value) {
  const entry = map?.[value];
  if (entry === undefined || entry === null) return value ?? null;
  const key = typeof entry === "string" ? entry : (entry.label ?? entry.name ?? String(value));
  return game.i18n.localize(key);
}

/**
 * The inline detail under an item row: the item's fields as the book prints
 * them (item-fields.mjs#fieldsFor), read-only, minus the checkboxes and the
 * tables, with selects resolved and tags joined.
 * @returns {Array<{label: string, value: string|number|null}>}
 */
/** 06 §2's locations, localised, for a derived line (`item-fields.mjs` is pure). */
function locationWords() {
  return Object.fromEntries(Object.entries(AZEROTH.locations ?? {}).map(([k, v]) => [k, game.i18n.localize(v)]));
}

export function detailFields(item) {
  return fieldsFor(item.type, item.system, { labels: locationWords() })
    .filter(f => f.type !== "checkbox" && f.type !== "table")
    .map(f => {
      let value = f.value;
      if (f.type === "select") value = enumLabel(AZEROTH[f.choices], value);
      // A price is printed in coin, never in raw copper (08 §2, D-672).
      else if (f.type === "coin") value = coins(value);
      // A tag drawn from an enum prints its label: "Any bow", not `bow` (D-641).
      else if (f.type === "tags") value = Array.isArray(value) && value.length
        ? value.map(tag => (f.choices ? enumLabel(AZEROTH[f.choices], tag) : tag)).join(", ")
        : null;
      return { label: game.i18n.localize(f.label), value: value ?? null };
    });
}

/**
 * What an item SAYS, for the inline detail under its row (2026-09-06): the
 * entry's prose as the book prints it, enriched. A spell and a talent carry
 * the lore in `description` and the mechanics in `effect`, and the row
 * printed neither - the lead opened a spell and read its fields alone. A
 * forged item adds its Signature and what its affixes grant.
 * @param {Item} item
 * @returns {Promise<string>} HTML, or "" where the item says nothing.
 */
export async function detailProse(item) {
  if (!item) return "";
  const sys = item.system ?? {};
  const parts = [];
  const lore = await enrich(sys.description ?? "", { relativeTo: item });
  if (lore) parts.push(`<div class="azeroth-item-lore">${lore}</div>`);
  const effect = await enrich(sys.effect ?? "", { relativeTo: item });
  if (effect) parts.push(`<div class="azeroth-item-effect">${effect}</div>`);
  const signature = await enrich(sys.signature ?? "", { relativeTo: item });
  if (signature) parts.push(`<div class="azeroth-item-signature"><strong>${game.i18n.localize("AZEROTH.Item.Signature")}.</strong> ${signature}</div>`);
  const grants = grantsOf(item);
  if (grants.length) parts.push(`<p class="azeroth-item-grants"><strong>${game.i18n.localize("AZEROTH.Item.Grants")}.</strong> ${grants.map(g => foundry.utils.escapeHTML(g)).join(" · ")}</p>`);
  return parts.join("");
}

/**
 * What a worn or carried item grants (08 §6): the generated item's own list,
 * the affix document's single grant where the affix is worn as a thing, and
 * the school-chosen points 08 §10 sells (D-690). `rules/grants.mjs#grantsOn`
 * is the one place that says so.
 * @param {Item} item
 * @returns {string[]}
 */
export function grantsOf(item) {
  return grantsOn(item);
}

/**
 * What a skill covers (02 §8), as the chapter says it: HTML for a dialog, or
 * the plain sentence for a tooltip (2026-09-06).
 */
export function skillText(key) {
  return SKILL_TEXT[key] ?? "";
}
export function skillTooltip(key) {
  return skillText(key).replace(/<[^>]+>/g, "").trim();
}

/** A dialog saying what a skill covers, in 02 §8's words. */
export async function describeSkill(key) {
  const label = game.i18n.localize(AZEROTH.skills[key] ?? key);
  const ability = game.i18n.localize(AZEROTH.abilities[AZEROTH.skillAbility[key]] ?? "");
  return foundry.applications.api.DialogV2.prompt({
    window: { title: label },
    classes: ["azeroth", "azeroth-skill-dialog"],
    content: `<div class="azeroth-skill-text"><p class="azeroth-skill-ability">${foundry.utils.escapeHTML(ability)}</p>${skillText(key)}</div>`,
    ok: { label: game.i18n.localize("AZEROTH.Sheet.Close") },
    rejectClose: false
  });
}

/**
 * The context menu on a skill row (the lead, 2026-09-06): Roll, and what the
 * skill covers in 02 §8's words. Bound once per rendered element, as the
 * item menu is.
 */
export function skillContextMenu(sheet) {
  const keyOf = target => target.closest("[data-skill-key]")?.dataset.skillKey ?? null;
  const entries = [
    { label: "AZEROTH.Sheet.RollSkill", icon: "fa-solid fa-dice-d20",
      onClick: (event, target) => { const key = keyOf(target); return key ? sheet.options.actions.rollSkill?.call(sheet, new MouseEvent("click"), target.querySelector("[data-action=rollSkill]") ?? target) : null; } },
    { label: "AZEROTH.Sheet.WhatItCovers", icon: "fa-solid fa-book-open",
      onClick: (event, target) => { const key = keyOf(target); return key ? describeSkill(key) : null; } }
  ];
  return new foundry.applications.ux.ContextMenu.implementation(sheet.element, "li.azeroth-skill[data-skill-key]", entries, { jQuery: false, fixed: true });
}

/**
 * The bags this actor is WEARING that could take this thing (08 §11; D-671,
 * D-736), each with why it could not where it cannot.
 *
 * **One place says which are legal**, because every door asks: the row's *Put
 * in*, the inspector's button, and a drag onto a bag's panel or its icon on
 * the bar (D-673). A bag is out where it is the thing itself, where it is not
 * being worn at all - an unworn container holds nothing (08 §11) - or where
 * its column names another kind. A FULL one stays on the list and is greyed,
 * since *full* is a fact about what is in it rather than about what it takes,
 * and the reader should see it.
 *
 * **The room is read off the LEDGER's own panels**, in bag slots, so this and
 * the document door that will judge the write cannot disagree. The caller may
 * hand its own ledger in where it already has one — the Gear tab builds one
 * per render and would otherwise derive a fresh one for every tile.
 *
 * @param {Actor} actor
 * @param {Item} item
 * @param {object|null} [led]  a `slots.mjs#ledger` result
 * @returns {Array<{id, name, item, ok, reason, used, wells}>}
 */
export function containersFor(actor, item, led = null) {
  if (!actor || !item) return [];
  const base = Number(actor.system?.bagSlots?.base);
  const book = led ?? ledger([...actor.items], Number.isFinite(base) ? base : BASE_SLOTS);
  const out = [];
  for (const panel of book.panels) {
    // The base pack is not a container: taking a thing OUT of a bag is
    // *Take out*, and a panel with no holder behind it has no name to offer.
    if (!panel.containerId || panel.containerId === item.id) continue;
    const bag = actor.items.get(panel.containerId);
    if (!bag || !accepts(bag.system?.capacity ?? null, item)) continue;
    // **A THING ALREADY IN IT IS ALWAYS LEGAL**, however full the bag reads:
    // no write may increase a panel's overflow, and leaving a thing where it
    // is increases nothing (D-737).
    const here = (containerOf(item) ?? null) === panel.containerId;
    const ok = here || panel.used + slotsIn(item, panel) <= panel.wells;
    out.push({
      id: panel.containerId, name: bag.name, item: bag, ok, reason: ok ? null : "full",
      used: panel.used, wells: panel.wells
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * *Put in* on an item's right click: the chooser over `containersFor`, with
 * "Carried loose" first where the thing is already in something. A full
 * container is listed and greyed rather than hidden.
 */
export async function putInContainer(actor, item) {
  const options = containersFor(actor, item);
  if (!options.length) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Container.NowhereFor", { name: item.name }));
    return null;
  }
  // **IN BAG SLOTS** (D-735), which is the unit the panel beside it prints
  // and the unit the door will judge the write in: a fill line in pounds
  // would be a second arithmetic for the same question.
  const fillLine = o => game.i18n.format("AZEROTH.Bags.PanelFill", { used: o.used, max: o.wells });
  const rows = [
    ...(containerOf(item) ? [{ key: "", name: game.i18n.localize("AZEROTH.Container.Loose"), description: "", available: true }] : []),
    ...options.map(o => ({
      key: o.id,
      name: o.name,
      tag: o.ok ? fillLine(o) : game.i18n.localize("AZEROTH.Container.Full"),
      description: `<p>${fillLine(o)}</p>`,
      available: o.ok
    }))
  ];
  if (!rows.some(r => r.available !== false)) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Container.AllFull", { name: item.name }));
    return null;
  }
  const chosen = await game.system.azeroth.workflows.chooseOption(item, rows, null, {
    label: "AZEROTH.Container.Put",
    prompt: game.i18n.format("AZEROTH.Container.Where", { name: item.name })
  });
  if (!chosen) return null;
  return item.update({ "system.container": chosen.key || null });
}

/**
 * Whether this thing can be PUT ON at all — the one answer every door asks.
 *
 * Five families, and each of them arrived separately:
 *
 * - a **weapon** and a **suit**, which is where the rule started;
 * - an **Augment**, which 07 §3 holds in the off hand (D-674);
 * - a thing with one of **08 §11's worn slots** (D-686) — until that, a ring
 *   could be equipped only from the item sheet's own checkbox;
 * - a **container**, which adds its wells while it is worn and comes off
 *   empty (08 §11, D-736);
 * - a **mount or a vehicle**, whose `equipped` means *with you* (08 §15).
 *
 * The last two are new with the bag bar, and this is where the row's menu,
 * the Gear tab's own Equip and the inspector's button all read it: a second
 * copy of the rule would have greyed the Equip on every backpack on one
 * surface and not the other.
 *
 * @param {Item|{type: string, system?: object}} item
 */
export function wearable(item) {
  if (!item) return false;
  const sys = item.system ?? {};
  if (item.type === "weapon" || item.type === "armor") return true;
  if (sys.augment) return true;
  if (isWornSlot(sys.slot)) return true;
  if (isContainer(sys.capacity)) return true;
  return isMount(item);
}

/**
 * The context menu on every item row of a character sheet: Edit, Attack or
 * Cast where the item allows, Equip or Unequip, Delete - each reaching the
 * sheet's own action handler. Only `label`, `icon`, `visible` and `onClick`
 * are used: `name`, `condition` and `callback` log a deprecation in this
 * build, and the smoke test fails on any. Bind once per rendered element.
 */
export function itemContextMenu(sheet) {
  const actor = sheet.actor;
  const itemOf = target => actor.items.get(target.closest("[data-item-id]")?.dataset.itemId) ?? null;
  const run = (action, target) => sheet.options.actions[action]?.call(sheet, new MouseEvent("click"), target);
  const entries = [
    ...reloadMenuEntries(itemOf),
    { label: "AZEROTH.Sheet.Edit", icon: "fa-solid fa-pen-to-square", onClick: (event, target) => itemOf(target)?.sheet?.render({ force: true }) },
    { label: "AZEROTH.Sheet.Attack", icon: "fa-solid fa-hand-fist", visible: target => itemOf(target)?.type === "weapon", onClick: (event, target) => run("rollAttack", target) },
    // The off hand (06 SS1, D-711): it RIDES the main-hand Attack and costs no
    // Half-Action in a turn where one was made, -2 unless Light, once a round.
    // The attack card's own button is the other door.
    { label: "AZEROTH.Sheet.OffHandAttack", icon: "fa-solid fa-hand-back-fist", visible: target => itemOf(target)?.type === "weapon",
      onClick: (event, target) => { const item = itemOf(target); return item ? attackWithDialog(actor, item, event, { offHand: true }) : null; } },
    { label: "AZEROTH.Sheet.Cast", icon: "fa-solid fa-wand-sparkles", visible: target => itemOf(target)?.type === "spell",
      onClick: (event, target) => { const item = itemOf(target); return item ? castWithDialog(actor, item, event) : null; } },
    { label: "AZEROTH.Sheet.Equip", icon: "fa-solid fa-shield-halved", visible: target => wearable(itemOf(target)) && itemOf(target).system.equipped !== true, onClick: (event, target) => run("toggleEquipped", target) },
    { label: "AZEROTH.Sheet.Unequip", icon: "fa-solid fa-shield-halved", visible: target => wearable(itemOf(target)) && itemOf(target).system.equipped === true, onClick: (event, target) => run("toggleEquipped", target) },
    { label: "AZEROTH.Feature.Use", icon: "fa-solid fa-bolt", visible: target => itemOf(target)?.type === "feature",
      onClick: (event, target) => { const item = itemOf(target); return item ? useFeatureWithDialog(actor, item, event) : null; } },
    // Favorites (D-612): a star on any owned item, fifteen at most.
    { label: "AZEROTH.Sheet.Star", icon: "fa-regular fa-star", visible: target => { const item = itemOf(target); return item && !actor.favorites.includes(item.id); },
      onClick: (event, target) => { const item = itemOf(target); return item ? actor.toggleFavorite(item.id) : null; } },
    { label: "AZEROTH.Sheet.Unstar", icon: "fa-solid fa-star", visible: target => { const item = itemOf(target); return item && actor.favorites.includes(item.id); },
      onClick: (event, target) => { const item = itemOf(target); return item ? actor.toggleFavorite(item.id) : null; } },
    // Where a thing is kept (08 SS11, D-673): off the row entirely, because a
    // select on every row was furniture on an already dense tab. The drag is
    // the other door and does the same thing.
    { label: "AZEROTH.Container.PutIn", icon: "fa-solid fa-box-open",
      visible: target => { const item = itemOf(target); return !!item && containersFor(actor, item).length > 0; },
      onClick: (event, target) => { const item = itemOf(target); return item ? putInContainer(actor, item) : null; } },
    { label: "AZEROTH.Container.TakeOut", icon: "fa-solid fa-hand",
      visible: target => !!itemOf(target)?.system?.container,
      onClick: (event, target) => itemOf(target)?.update({ "system.container": null }) },
    // The hotbar (the lead, 2026-09-13). Not a sheet ACTION: nothing in a
    // template carries it, and the audit's MENU_ONLY names only registered
    // actions - this is a menu entry with a direct call, so there is nothing
    // to register and nothing to name.
    { label: "AZEROTH.Macro.SaveToHotbar", icon: "fa-solid fa-bolt-lightning",
      visible: target => Boolean(kindOf(itemOf(target))),
      // Through the public surface, not an import: `module/macros.mjs` imports
      // the five doors in THIS file, and a static import back would be a cycle
      // - the same reason every call into `dice/workflows.mjs` here goes
      // through `game.system.azeroth`.
      onClick: (event, target) => {
        const item = itemOf(target);
        return item ? game.system.azeroth.macros.saveToHotbar(item, { actor }) : null;
      } },
    { label: "AZEROTH.Sheet.Delete", icon: "fa-solid fa-trash", visible: target => itemOf(target)?.type !== "feature", onClick: (event, target) => run("deleteItem", target) }
  ];
  // **AND THE OVERVIEW'S PAPER-DOLL SOCKETS** (the lead, 2026-09-20). Those
  // tiles are icon-only `div`s now - the name that carried `openItem` went
  // with the words - so a right click is where Edit, Unequip, Star and the
  // rest live for a worn thing, exactly as it is for a bag tile. The single
  // click still opens the slot's picker, which is why the socket takes no
  // double-click: it would open the picker and the thing on top of it.
  return new foundry.applications.ux.ContextMenu.implementation(
    sheet.element, "li[data-item-id], .azeroth-slot-tile[data-item-id]", entries, { jQuery: false, fixed: true });
}

