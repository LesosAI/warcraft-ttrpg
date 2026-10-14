/**
 * The roll dialog: one `DialogV2.wait` per Test, pre-filled with what the
 * rules already settle and editable for what they do not.
 *
 *   DC          the target's Defense for an attack or a spell at a creature,
 *               else a Standard Test at the roller's tier (05 §3), else what
 *               the caller gave;
 *   Boons/Banes the automatic lines checked, the judgement lines unchecked
 *               (D2 §12), and a free count of each beside them;
 *   location    Body unless the attacker pays for somewhere else (06 §2), with
 *               the 2-Momentum cancel that removes the Bane and never the -2;
 *   preview     the formula the card will carry, live.
 *
 * The dialog is the authority on every one of those; the sheet supplies only
 * defaults. Everything the two paths share - with the dialog and without -
 * lives in `prepareRoll`, so a skipped dialog rolls exactly what the dialog
 * would have opened on.
 */

import { AZEROTH } from "../config.mjs";
import { TALENT_CANCELLED, calledShotCost, countModifiers, previewFormula, situationalModifiers, standardDC } from "../rules/modifiers.mjs";
import { conditionValues } from "../effects/conditions.mjs";
import { corruptionLines } from "../rules/corruption-effects.mjs";
import { laidBanesOn, laidBoonsOn } from "../rules/banes.mjs";
// The Warrior's and the Paladin's lines (D-772): a Boon off the target's
// Health (Hammer of Wrath), Reckless on the roller and its exposure on the
// target, and the next attack's promise.
import { EXPOSED_FLAG, calledShotFor, exposedBoonsOn, recklessFor } from "../rules/class-talents.mjs";
// The Ranger's and the Rogue's lines (D-773): Careful Shot's cancelled Banes, a
// Boon off the target's Health or a measured fact (Hammer of Wrath, Master
// Duellist), the Opening measured, and the Finisher the talents reshape.
import { DEATH_MARK_FLAG, cancelledBanesFor, finisherOffer as finisherOfferOf, finisherOptionsFor, namesTarget, openingGate, targetBoonsWith } from "../rules/class-talents.mjs";
// What stands on the target (Deterrence) and whether the roller is hidden.
import { deterrencesOf, flaggedEffects } from "../effects/talent-states.mjs";
// The Mage's and the Warlock's (D-775): Shatter's fact, Demonic Knowledge's and
// Icy Veins' Boon on a Casting Test, and 07's Archmage's.
import { ARCHMAGE, VEINS_FLAG, archmageBoons, castingBoonsFor, speedReducedFact, veinsStates } from "../rules/class-talents.mjs";
import { boundOf } from "../documents/bound.mjs";
import { isHidden } from "../effects/stealth.mjs";
import { featureReminders } from "../rules/class-features.mjs";
// The Damage lines kept, one function for this dialog and the feature door (D-768).
import { damageChosen } from "../rules/talent-effects.mjs";
import { wardBySchool } from "../rules/ward.mjs";
// What an ally's aura lays on the roller and on the target (D-755): a Boon on a
// Test, and Armor Points after the Ward.
import { auraBanesOn, auraBoonsOn, schoolArmorBySchool } from "../rules/auras.mjs";
// What the blow is about to meet (06 §4, the lead's item 29): the type and the
// lane it will be mitigated on, before the die.
import { describeDamage } from "../rules/mitigation.mjs";
// Which token is acting, as a card records it (D-724).
import { chooseSource } from "../rules/records.mjs";
// In the hand or thrown (D-731): the variant a spec rolls, and what a switch keeps.
import { carriedLines, usableAttackModes, withAttackMode } from "../rules/attack-modes.mjs";
// Every distance between tokens, between the nearest squares they occupy (D-732).
import { feetApart } from "../canvas/footprints.mjs";
// What a talent spends as part of an attack, in words (D-770).
import { riderDoes, riderPrice, riderReason } from "../helpers/rider-words.mjs";
// Rockbiter's rise against the first attack each round (D-774), and whether a
// shield is held - not melded into a shape (D-769).
import { FIRST_ATTACK_MARK, apWith, damagedTypeKey, firstAttackFor } from "../rules/class-talents.mjs";
import { isEquippedShield } from "../rules/armor.mjs";
import { meldsGear } from "../rules/shapes.mjs";

const TEMPLATE = "systems/azeroth-rpg/templates/dialog/roll-test.hbs";

/** The dialog's element id for an actor - fixed, so a second click focuses the first. */
export function dialogId(actor) {
  return `azeroth-roll-${actor.id}`;
}

/**
 * What the user targets, as plain data the roll pipeline and the card can
 * carry: Defense for the DC, armour by location and Ward for the damage,
 * conditions for the Boons. Snapshotted at the click; a target that moves
 * or changes afterwards is not this roll's business.
 */
export function targetSnapshots(targets = game.user?.targets ?? []) {
  const out = [];
  for (const token of targets) {
    const actor = token.actor;
    if (!actor) continue;
    const s = actor.system ?? {};
    out.push({
      tokenId: token.id,
      sceneId: token.scene?.id ?? token.document?.parent?.id ?? null,
      actorId: actor.id,
      name: token.name ?? actor.name,
      defense: s.defense ?? null,
      // **AND ROCKBITER'S RISE AGAINST THE FIRST ATTACK EACH ROUND** (04, D-774):
      // the target's own talent, while it holds a shield and no attack has marked
      // its round yet (`rules/class-talents.mjs#firstAttackFor`).
      apByLocation: apWith({ body: s.ap?.body ?? 0, head: s.ap?.head ?? 0, limb: s.ap?.limb ?? 0 }, firstAttackApOf(actor)),
      absent: ["body", "head", "limb"].filter(k => s.ap && (s.ap[k] === null || s.ap[k] === undefined)),
      // A creature's map and a character's table are one shape (D-607, D-644).
      wardBySchool: wardBySchool(s.ward),
      // WHAT AN ALLY'S AURA ADDS AFTER THE WARD (04's Avenging Bulwark, D-755),
      // by school. Carried here because a spell's card records no damage type
      // for `applyDamage` to read, so `resolveDamage` is the only place it can
      // come off - and every magical caller of it reads this.
      schoolArmor: schoolArmorBySchool(s.schoolArmor),
      immune: s.immune ?? [],
      vulnerable: s.vulnerable ?? [],
      statuses: [...(actor.statuses ?? [])],
      // WHAT THE VALUED THREE ARE AT (A1 §1, D-696). `statuses` says which
      // conditions are on the target and never how much: Perdition's Blade
      // deals *additional damage equal to that creature's Scorched value*, and
      // `signatureEffects` resolves it off this.
      conditions: conditionValues(actor),
      // For Overbear's size note (D-626).
      size: s.size ?? null,
      // A swarm has no Critical Injury table (13 §4, D-646).
      swarm: s.isSwarm === true,
      // What a Signature gated on the creature STRUCK needs (08 §20, D-692):
      // its kind, and whether it has taken a turn yet. A character has neither
      // - `creatureType` is an NPC field - and both fail their gate closed.
      creatureType: s.creatureType ?? null,
      // The same flag Opening reads (02 §7), off the combatant in the fight
      // this token is in. `false` is *has not acted*; null is *not in a
      // fight*, which no gate can judge.
      acted: actedFlagOf(actor),
      // **HOW HURT IT IS, AT THE CLICK** (D-772): 04's Hammer of Wrath and
      // Executioner both turn on *a target below half Health*.
      health: { value: Number(s.health?.value ?? 0) || 0, max: Number(s.health?.max ?? 0) || 0 },
      // And what its own Reckless has left it open to (04: *Until your next
      // turn, attacks against you gain one too*; D-772).
      exposed: exposuresOf(actor),
      // And what its own Deterrence lays on attacks against it (04: *Attacks
      // against you take a Bane per rank until the start of your next turn*; D-773).
      deterred: deterrencesOf(actor),
      // **WHETHER ITS SPEED IS OTHERWISE REDUCED** (04's Shatter, D-775): a laid
      // effect lowering `system.speed` - a blow's drop, an area's (MY READING).
      speedDropped: speedDroppedOf(actor)
    });
  }
  return out;
}

/**
 * **ROCKBITER'S ARMOR POINTS, NOW** (04: *While you carry a shield, your Armor
 * Points rise by 1 per rank against the first attack each round*; D-774): the
 * rise where the creature holds the talent and a shield (melded into a shape it
 * holds none, D-769), and its round's record carries no first attack yet. Out of a
 * fight there is no round, and every attack is the first (MY READING, for the
 * lead: the ruling every once-a-round thing here makes).
 *
 * @param {Actor} actor  the TARGET
 * @returns {number}
 */
export function firstAttackApOf(actor) {
  if (actor?.type !== "character") return 0;
  const shield = (actor.items ?? []).some(i => isEquippedShield(i)) && !(actor.shape && meldsGear(actor.shape.kind));
  const row = firstAttackFor(actor.takenTalents?.() ?? [], { shield });
  if (!row) return 0;
  const fight = actor.activeFight?.() ?? null;
  const combatant = fight ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
  if (!combatant) return row.ap;
  const round = combatant.getFlag("azeroth-rpg", "round") ?? {};
  const used = round.number === fight.round ? (round.once ?? []) : [];
  return used.includes(FIRST_ATTACK_MARK) ? 0 : row.ap;
}

/**
 * **A SPEED DROPPED BY AN EFFECT** (04's Shatter: *or whose Speed is otherwise
 * reduced*; D-775): an active effect on the creature carrying a change that lowers
 * `system.speed` - `effects/speed-drop.mjs`'s, an area's - read off the changes
 * themselves. A suit's own Speed cost is a part of the Speed and no effect.
 *
 * @param {Actor} actor
 * @returns {boolean}
 */
export function speedDroppedOf(actor) {
  return (actor?.effects ?? []).some(e => e.active !== false && (e.system?.changes ?? [])
    .some(c => c?.key === "system.speed" && (c.type ?? "add") === "add" && Number(c.value) < 0));
}

/**
 * The exposures standing on a creature (04's Reckless, D-772): each active
 * effect's flag, as `rules/class-talents.mjs#exposedBoonsOn` reads them.
 *
 * @param {Actor} actor
 * @returns {Array<{boons: number, ranged: boolean, source: string}>}
 */
export function exposuresOf(actor) {
  const out = [];
  for (const effect of actor?.effects ?? []) {
    if (effect.active === false) continue;
    const raw = effect.flags?.["azeroth-rpg"]?.[EXPOSED_FLAG] ?? null;
    if (raw && typeof raw === "object") out.push({ boons: Number(raw.boons) || 0, ranged: raw.ranged === true, source: String(raw.source ?? "") });
  }
  return out;
}

/**
 * WHO IS ACTING, as plain data a card can carry beside who is aimed at
 * (D-724): `{sceneId, tokenId}`, or null.
 *
 * Taken where the targets are, at the click and before any dialog opens, so
 * a selection that moves while the dialog is up is not this roll's business
 * either. `rules/records.mjs#chooseSource` is the rule - a caller's own
 * source, a synthetic actor's own token, then exactly one controlled, one
 * token or one linked token on the viewed scene - and it answers null rather
 * than guess among five unlinked Kobolds, which core's speaker does not.
 *
 * @param {Actor} actor
 * @param {{sceneId?: string|null, tokenId?: string|null}|null} [given]  a caller's `spec.source`
 */
export function sourceOf(actor, given = null) {
  const own = actor?.isToken ? (actor.token ?? null) : null;
  const tokens = actor?.getActiveTokens?.(false, true) ?? [];
  return chooseSource({
    given,
    synthetic: own ? { sceneId: own.parent?.id ?? null, tokenId: own.id } : null,
    tokens: tokens.map(t => ({
      sceneId: t.parent?.id ?? null,
      tokenId: t.id,
      controlled: t.object?.controlled === true,
      linked: t.actorLink === true
    }))
  });
}

/**
 * Whether this actor has already taken a turn in the fight it is in, or null
 * where it is in none. `activeFight` is the actor's own encounter and not
 * whichever one the tracker is looking at (D-627).
 */
function actedFlagOf(actor) {
  const fight = actor?.activeFight?.() ?? null;
  const combatant = fight?.getCombatantsByActor?.(actor)?.[0] ?? null;
  if (!combatant) return null;
  return combatant.getFlag("azeroth-rpg", "acted") === true;
}

/**
 * How far apart two actors' tokens are, in feet, or null where either is not
 * on the viewed scene.
 *
 * **Between the nearest spaces they occupy, never between their centres, and
 * in three dimensions** (D-732, `canvas/footprints.mjs#feetApart`): a 3×3 boss's
 * token is convention on the map, 05 §Size says size does not change reach, and
 * a creature twenty feet up is twenty feet away.
 */
export function distanceBetween(a, b) {
  const from = a?.getActiveTokens?.(true)[0] ?? null;
  const to = b?.getActiveTokens?.(true)[0] ?? null;
  if (!from || !to || !canvas?.grid) return null;
  return feetApart(from, to);
}

/**
 * The enemies around the roller, as distances (06's Engaged). **Who is an enemy
 * is `rules/distance.mjs#countsAsEnemy`'s and the reading is
 * `canvas/engaged.mjs`'s** (D-732's review); it is re-exported here because the
 * attack door and the live batches have always imported it from this module.
 */
export { enemyDistances } from "../canvas/engaged.mjs";

/** The roller, as the pure rule wants it. */
function snapshotOf(actor, { kind, skill, targets, resilience = null, heavy = false, rangeBand = null, engaged = false, range = null, cancelsBane = [], parry = false, against = null, facts = {} }) {
  const s = actor.system ?? {};
  // Poisoned stacks live on the effect (A1: "Poisoned X"); a bare status is one.
  const poisoned = actor.effects?.find?.(e => e.statuses?.has("poisoned"));
  // **WHICH TESTS A WORN GRANT SPEAKS OF** (08 §20, 2026-09-10). A Parry IS an
  // Attack Test (06 §6), so a thing granting a Boon on Attack Tests helps it -
  // and `parry` is the NARROWING, so a thing that names only the Parry helps
  // nothing else. `AZEROTH.grantTests` is the vocabulary and `grantsFor` fills
  // the bag; nothing else in this file has to know Parry exists.
  const wornOn = parry ? [kind, "parry"] : [kind];
  const wornNames = bag => wornOn.flatMap(k => bag?.[k] ?? []);
  return {
    kind,
    skill,
    fatigue: s.fatigue ?? 0,
    statuses: [...(actor.statuses ?? [])],
    poisoned: poisoned ? (poisoned.getFlag?.("azeroth-rpg", "value") ?? 1) : 0,
    armorBanes: s.armorBanes ?? [],
    targetStatuses: targets[0]?.statuses ?? [],
    // 06: what the distance costs, where the tokens let it be measured (D-669).
    range,
    rangeBand,
    // How far the target is and what the weapon reaches, in words (D-716).
    // The pure rule decides whether the line is raised; this is the sentence
    // it carries, composed here because `rules/` holds no English.
    outOfReachNote: rangeBand?.warn === true
      ? game.i18n.format("AZEROTH.Modifier.OutOfReachAt", {
          distance: Math.round(rangeBand.distance ?? 0), reach: rangeBand.max ?? 0
        })
      : null,
    engaged,
    // A swarm's own state (13 §4, D-646): the roller's, so automatic.
    swarm: s.isSwarm === true,
    swarmThinned: s.thinned === true,
    // What is worn grants a Boon on this skill (08 §6, 2026-09-06): the items by name.
    gearBoons: kind === "skill" && skill ? (s.skillBoons?.[skill] ?? []) : [],
    // A creature's own standing passive (14, D-691): the ability by name where
    // it Banes this skill, and the count where it names a KIND of Test.
    standingBanes: kind === "skill" && skill ? (s.skillBanes?.[skill] ?? []) : [],
    standingTestBoons: s.testBoons?.[kind] ?? 0,
    standingTestBanes: s.testBanes?.[kind] ?? 0,
    // And what a thing being WORN grants on this kind of Test, by name (08 §20,
    // 2026-09-10). `system.grants` is `rules/grants.mjs#grantsFor`'s own output,
    // computed once on the model, so this is a read and never a second sum.
    gearTestBoons: wornNames(s.grants?.testBoonSources),
    gearTestBanes: wornNames(s.grants?.testBaneSources),
    // What SOMEBODY ELSE laid on this Test (06 §6's Pummel, 08 §20's
    // Gorehowl; D-693). The Active Effect on the roller is the carrier and the
    // clock; `effects/banes.mjs#spendLaidBanes` deletes it after the die,
    // because *the next Casting Test it makes* is a count and not a span.
    // A Bane that spares one creature (04's Taunt and Judgement, D-772) is read
    // against the creature this Test is at.
    laidBanes: laidBanesOn(s.laidBaneRows ?? [], kind, { target: targets[0] ?? null }),
    // **A BOON SOMEBODY ELSE LAID** (04's Blessing, D-772): the Bane's twin.
    laidBoons: laidBoonsOn(s.laidBoonRows ?? [], kind),
    // **WHAT THE TALENTS GIVE AN ATTACK** (D-772), never a Parry (06 §6: not an
    // attack): Hammer of Wrath against a target below its share of Health,
    // Reckless on every attack, the Boon Follow Through promised the next one,
    // and what the target's own Reckless left it open to.
    ...(kind === "attack" && !parry ? attackTalentLines(actor, targets[0] ?? null, range, facts) : {}),
    // **A BOON A TALENT GIVES A CASTING TEST** (04's Twisted Faith: *Casting Tests
    // against a target dealt Shadow damage by you gain a Boon*; D-774).
    ...(kind === "casting" ? castingTalentLines(actor, targets[0] ?? null, kind) : {}),
    // The Banes a talent of whoever forced this Test lays on it (04's Vile
    // Concoction, D-773), as the door that opened it measured them.
    talentBanes: facts.talentBanes ?? null,
    // What an ALLY'S AURA gives this Test (02 §7's Aura of Resolve, D-755): the
    // flag on the effect the aura door laid, never a change, and never spent.
    // Named the way the effect is, *Aura of Resolve (Uther)*; the Resilience is
    // the door's own `resilience`, and a Resilience Test that names none makes
    // it the table's line. A Boon against a CONDITION (07's Hallowed Ground,
    // D-757) reaches a Test whose door says it resists that condition
    // (`against`), and is the table's line where the door says nothing.
    auraBoons: auraLine(auraBoonsOn(s.auraBoonRows ?? [], kind, resilience, against), "boons"),
    // And what an AREA lays on this Test while the roller stands in it (07's
    // Insect Swarm, Rimebind; D-757): a flag, never spent, and the table's
    // line where only the table can say whether it holds (Crucible's metal).
    auraBanes: auraLine(auraBanesOn(s.auraBaneRows ?? [], kind), "banes"),
    // The rungs that bear on this Test (10 §4, §5): the table's call, so judgement lines.
    corruption: corruptionLines(s.corruptionEffects, { kind, skill, skillAbility: skill ? (AZEROTH.skillAbility[skill] ?? null) : null }),
    // A Heavy weapon below Strength 13 (08 §5): the roller's own state, automatic.
    heavy,
    // What a Signature takes back off this roll (08 §20, D-692). It rides on
    // the same `weaponEffects` object 08 §5's traits do, so the merge in
    // `actions.mjs` is the only place that had to know.
    cancelsBane,
    resilience
  };
}

/**
 * **THE LINES D-772's TALENTS PUT ON AN ATTACK**, as the modifier rule takes
 * them - each a fact the door read off the roller, the target or the next
 * attack's promise, so automatic and named:
 *
 * - `talentBoons`: 04's Hammer of Wrath, off the target's Health at the click;
 * - `reckless`: 04's Reckless on the roller's every attack;
 * - `nextAttackBoons`: the Boon Follow Through promised the next attack;
 * - `targetExposed`: what the TARGET's own Reckless left it open to.
 *
 * And D-773's, each measured by the attack door or read off the target:
 *
 * - `talentBoons` also carries Master Duellist's Boon where the door measured
 *   the one enemy Engaged as the target (`facts.engagedOne`);
 * - `talentCancels`: the Banes Careful Shot takes off a ranged attack;
 * - `packFlank`: 06 §5's flanking, measured for Pack Tactics;
 * - `targetDeterred`: what the target's own Deterrence lays on the attack;
 * - `opening`: 02's Opening, measured against the target.
 *
 * @param {Actor} actor
 * @param {object|null} target  the first target snapshot
 * @param {"melee"|"ranged"|null} range
 * @param {{engagedOne?: boolean, packFlank?: object|null, hidden?: boolean}} [facts]
 */
function attackTalentLines(actor, target, range, facts = {}) {
  const talents = actor?.takenTalents?.() ?? [];
  const wrath = targetBoonsWith(talents, { kind: "attack", health: target?.health ?? null, facts: { engagedOne: facts.engagedOne === true, shadowDamaged: shadowDamagedBy(actor, target) } });
  const reckless = recklessFor(talents);
  const promised = actor?.pendingNextAttack?.() ?? { boons: 0, live: [] };
  const cancels = cancelledBanesFor(talents, { range });
  const deterred = target?.deterred ?? [];
  const deterBanes = deterred.reduce((n, d) => n + (Number(d.banes) || 0), 0);
  const opening = target ? (actor?.openingState?.(target, { hidden: facts.hidden === true }) ?? null) : null;
  return {
    talentBoons: { boons: wrath.boons, names: wrath.by },
    reckless: reckless ? { boons: reckless.boons, names: [reckless.name] } : null,
    nextAttackBoons: { boons: promised.boons, names: promised.live.filter(e => (e.boons ?? 0) > 0).map(e => e.name).filter(Boolean) },
    targetExposed: exposedBoonsOn(target?.exposed ?? [], { range }),
    talentCancels: cancels.ids.length ? { ids: cancels.ids, names: cancels.by } : null,
    packFlank: facts.packFlank?.names?.length ? { names: [...facts.packFlank.names] } : null,
    targetDeterred: deterBanes > 0 ? { banes: deterBanes, names: [...new Set(deterred.map(d => d.source).filter(Boolean))].sort() } : null,
    opening: opening?.applies ? { boons: 1, names: [game.i18n.localize("AZEROTH.Opening.Feature"), ...(opening.by ?? [])] } : null
  };
}

/**
 * **WHETHER THIS ROLLER HAS DEALT THE TARGET SHADOW DAMAGE** (04's Twisted Faith,
 * D-774): the roller's own `damaged` map, keyed by the target's token (else its
 * actor) and the type, as `effects/after-blow.mjs#markDamaged` writes it - this
 * fight's, cleared with the fight's flags. Nothing measured is not dealt.
 *
 * @param {Actor} actor
 * @param {object|null} target  a target snapshot
 */
function shadowDamagedBy(actor, target) {
  const key = target?.tokenId ?? target?.actorId ?? null;
  if (!key) return false;
  const fight = actor?.activeFight?.() ?? null;
  const combatant = fight?.getCombatantsByActor?.(actor)?.[0] ?? null;
  return combatant?.getFlag?.("azeroth-rpg", "damaged")?.[damagedTypeKey(key, "shadow")] === true;
}

/**
 * The Boon a talent gives a Casting Test against this target (04's Twisted Faith,
 * D-774), as the modifier rule takes it: an automatic line, named.
 *
 * @param {Actor} actor
 * @param {object|null} target
 */
function castingTalentLines(actor, target, kind) {
  const talents = actor?.takenTalents?.() ?? [];
  // And 04's Shatter (*Your spells gain a Boon against a target that is Entangled
  // or Slowed, or whose Speed is otherwise reduced*; D-775) on the same line.
  const faith = targetBoonsWith(talents, {
    kind, health: target?.health ?? null,
    facts: { shadowDamaged: shadowDamagedBy(actor, target), slowedTarget: speedReducedFact({ statuses: target?.statuses ?? [], speedDropped: target?.speedDropped === true }) }
  });
  // **A BOON ON EVERY CASTING TEST** (04's Demonic Knowledge at rank 2: *while you
  // control a Bound Demon*; Icy Veins' state; D-775), and **07's ARCHMAGE** (*a Boon
  // for each spell you are sustaining, to a maximum of three*; 04's Archmage: *four
  // Boons rather than three*), built with the talent, while its laid effect stands.
  const every = castingBoonsFor(talents, {
    facts: { boundDemon: boundOf(actor, "demon").length > 0 },
    states: veinsStates(flaggedEffects(actor, VEINS_FLAG).map(r => r.flag))
  });
  const archmage = archmageBoons({
    standing: (actor?.effects ?? []).some(e => e.active !== false && e.getFlag?.("azeroth-rpg", "identifier") === ARCHMAGE.identifier),
    sustaining: (actor?.getFlag?.("azeroth-rpg", "sustaining") ?? []).length
  }, talents);
  const boons = faith.boons + every.boons + archmage.boons;
  const names = [...faith.by, ...every.by, ...(archmage.boons > 0 ? [game.i18n.localize("AZEROTH.Archmage.Label"), ...archmage.by] : [])];
  return boons > 0 ? { talentBoons: { boons, names } } : {};
}

/**
 * An aura's Boons (D-755) or an area's Banes (D-757) as the modifier rule takes
 * them: the count under `key` ("boons" or "banes"), and each source named as
 * its effect is (`AZEROTH.Aura.EffectName`). The rule is pure and holds no
 * English; the names are composed here, once for both (the final review).
 *
 * @param {{sources: object[], judged: {sources: object[]}}} on  `auraBoonsOn` or `auraBanesOn`
 * @param {"boons"|"banes"} key
 */
function auraLine(on, key) {
  const name = ({ source, owner }) => (owner ? game.i18n.format("AZEROTH.Aura.EffectName", { source, owner }) : source);
  return {
    [key]: on[key],
    names: on.sources.map(name).filter(Boolean),
    judged: { [key]: on.judged[key], names: on.judged.sources.map(name).filter(Boolean) }
  };
}

/**
 * Everything the dialog and the no-dialog path share.
 * @param {Actor} actor
 * @param {object} spec  { kind, skill, dc, location, modifiers, targets }
 */
export function prepareRoll(actor, given) {
  // **ONE WAY OF STRIKING AT A TIME** (D-731). A weapon that may be struck in
  // the hand or thrown carries a variant per way; everything below reads the
  // chosen one, so the lines, the modifiers and the preview are one blow.
  const spec = withAttackMode(given, given?.mode ?? null);
  const targets = spec.targets ?? targetSnapshots();
  // And who is acting, beside who is aimed at and before `DialogV2.wait`
  // (D-724): both the dialog and a skipped one carry this into the workflow.
  const source = sourceOf(actor, spec.source ?? null);
  const situational = situationalModifiers(snapshotOf(actor, {
    kind: spec.kind, skill: spec.skill ?? null, targets, resilience: spec.resilience ?? null,
    heavy: spec.heavyBane === true,
    // 06's reach and range (D-669): measured at the door and passed through.
    range: spec.rangeKind ?? null, rangeBand: spec.rangeBand ?? null, engaged: spec.engaged === true,
    // 08 §20 (D-692): the Banes an equipped Signature cancels on this roll.
    cancelsBane: spec.weaponEffects?.cancelsBane ?? [],
    // 06 §6: this Attack Test is a Parry, so a worn Boon that names the Parry
    // reaches it as well as one that names Attack Tests.
    parry: spec.parry === true,
    // The conditions this Resilience Test resists, where its door knows them
    // (a spell card's Resist, an area's Test; D-757), else null.
    against: Array.isArray(spec.against) ? spec.against : null,
    // **WHAT THE DOOR MEASURED FOR THE TALENTS** (D-773): the one enemy Engaged
    // as the target (Master Duellist), Pack Tactics' flanking, whether the roller
    // is hidden now (Cheap Shot's Opening), and a talent's Banes on this Test.
    facts: {
      engagedOne: spec.engagedOne === true,
      packFlank: spec.packFlank ?? null,
      hidden: spec.kind === "attack" && isHidden(actor),
      talentBanes: spec.talentBanes?.banes > 0 ? spec.talentBanes : null
    }
  }));
  // **A BANE A TALENT TAKES OFF IS SAID WITH ITS NAME** (04's Careful Shot,
  // D-773): the pure rule raises the warning's key; the names are composed here.
  if (situational.warnings.includes(TALENT_CANCELLED)) {
    const by = cancelledBanesFor(actor?.takenTalents?.() ?? [], { range: spec.rangeKind ?? null }).by;
    situational.warnings = situational.warnings.map(w => (w === TALENT_CANCELLED ? game.i18n.format(TALENT_CANCELLED, { names: by.join(", ") }) : w));
  }
  const target = targets[0] ?? null;
  const usesDefense = (spec.kind === "attack" || spec.kind === "casting") && target?.defense != null;
  let dc, dcSource;
  if (spec.dc != null) { dc = spec.dc; dcSource = "given"; }
  else if (usesDefense) { dc = target.defense; dcSource = "defense"; }
  else if (spec.fallbackDC != null) { dc = spec.fallbackDC; dcSource = spec.fallbackSource ?? "given"; }
  else { dc = standardDC(actor.system?.tier ?? 1); dcSource = "standard"; }
  // The pool a called shot pays from: the roller's own, or - a companion whose owner
  // holds 04's Shared Quarry - the owner's Quarry (D-779; `AzerothActor#momentumPayer`).
  const momentum = actor.momentumPayer?.({ amount: AZEROTH.CALLED_SHOT_MOMENTUM })?.pool ?? actor.system?.momenta?.[0] ?? null;
  // D-613: the passives that could bear on this roll. One with a Boon or
  // Bane of its own joins the Situational lines, unchecked; the rest are
  // notes. Taken talents that speak of a Boon or Bane are notes as well.
  const reminders = featureReminders(
    (actor.items ?? []).filter(i => i.type === "feature").map(i => ({ name: i.name, reminder: i.system?.reminder ?? null })),
    (actor.items ?? []).filter(i => i.type === "talent").map(i => ({ name: i.name, taken: i.system?.taken ?? 0, effect: i.system?.effect ?? "" })),
    spec.kind ?? "skill"
  );
  situational.judgement.push(...reminders.lines);
  // **THE OPENING, MEASURED** (02 §7, D-773): where the door found the target
  // under it, the line is automatic and named, and the feature's own reminder -
  // the table's line - is not raised beside it to be ticked twice.
  if (situational.automatic.some(l => l.id === "opening")) {
    situational.judgement = situational.judgement.filter(l => l.id !== "feature-opening");
  }
  return {
    targets,
    source,
    // The way this blow is struck, where the weapon offers a choice (D-731).
    mode: spec.modes ? (spec.mode ?? null) : null,
    situational,
    reminders: reminders.notes,
    dc,
    dcSource,
    momentum,
    casting: spec.casting ?? null,
    location: spec.kind === "attack" ? (spec.location ?? "body") : null,
    // 04's Heavy Hand (D-772): the Head's modifier, where a talent changes it,
    // so the preview folds the called shot in as the roll will.
    headModifier: spec.kind === "attack" ? calledShotFor(actor?.takenTalents?.() ?? []).headModifier : null,
    // What the blow will deal and what it will meet (06 §4). The location is
    // the one the dialog opens on; a called shot changes which Armor Points
    // answer and the card is where that lands.
    damageLine: describeDamage(spec.damage ?? null, targets[0] ?? null, { location: spec.location ?? "body" }),
    // What a talent adds to the damage, per rank (04, D-711 phase 2). The door
    // decided which rows could apply and which facts hold; this only carries
    // them, so a skipped dialog takes the same auto-checked set.
    damageLines: spec.damageLines ?? [],
    // **FINISHER** (02 §7, the lead's item 11): *spend all your Combo Points
    // and add that many to the damage of one attack.* A checkbox on the
    // attack's own dialog, because the spending and the blow are one act - as
    // a Use button it spent the pool onto a card of its own and the attack it
    // belonged to never saw the points. It comes UNCHECKED: how many points a
    // blow is worth is the player's call and never the tool's.
    finisher: finisherOffer(actor, spec, targets[0] ?? null),
    // **WHAT A TALENT SPENDS AS PART OF THIS ATTACK** (04, D-770; the lead:
    // *"Lines on attack dialog"*): Mangle, Rip, Feral Charge and their kin, the
    // Finisher's shape - unticked, priced, greyed with the reason in words.
    riders: riderOffer(actor, spec, targets[0] ?? null),
    // **WHAT A TALENT'S COUNTER OR CHARGE BUYS ON THIS ROLL** (D-774): Inner
    // Focus's free Mana, Lava Burst's Ward ignored, Static Charge's tier - the
    // door's offer as it stood when the dialog opened; the workflow judges the
    // ticked ones again.
    talentLines: Array.isArray(spec.talentLineOffer) ? spec.talentLineOffer : []
  };
}

/**
 * The rider lines this blow offers (D-770), as the actor reads them now
 * (`AzerothActor#riderLines`), or none.
 *
 * **On every attack that is an attack**: the Finisher's gate is narrower
 * because 02 says *one attack*, while 04 says *as part of an attack*, which an
 * off-hand blow, an Opportunity Attack and a Riposte all are. A Parry is not an
 * attack (06 §6), a maneuver's Opposed Test deals no blow (06 §7's Disarm), and
 * the second roll of an Extra Attack opens no dialog - its rider was paid with
 * the first (`actions.mjs#secondRollOverrides`).
 */
function riderOffer(actor, spec, target = null) {
  if (spec.kind !== "attack" || spec.damage == null || spec.parry === true) return [];
  // A rider that needs the Opening (04's Garrote, D-773) is drawn where the
  // target is measured under it, left to the table where nothing was measured,
  // and not drawn where it is measured not to be.
  const opening = openingGate(actor?.openingState?.(target, { hidden: isHidden(actor) }) ?? null, target);
  return actor?.riderLines?.({ weapon: spec.rangeKind ?? null, opening }) ?? [];
}

/**
 * The Finisher offer, or null where there is nothing to spend.
 *
 * **Not on an off-hand blow, a Parry or the second roll of an Extra Attack**:
 * 02 says *one attack*, and each of those three is either not the attack that
 * bought the Half-Action or not an attack at all. `budget: "none"` covers the
 * Parry and the second roll, which is the same door D-704 already used.
 *
 * **WITH THE TALENTS LAID OVER IT** (D-773), read off their `mod("Finisher")`
 * patches through `rules/class-talents.mjs#finisherOffer`: Death Mark against
 * the target it named spends nothing and counts five, and Rupture offers its
 * Bleeding in place of the added damage.
 */
function finisherOffer(actor, spec, target = null) {
  if (spec.kind !== "attack" || spec.damage == null) return null;
  if (spec.offHand === true || spec.parry === true) return null;
  if (spec.budget === "none" || spec.budget === "reaction") return null;
  if (!(actor?.items ?? []).some(i => i.type === "feature" && i.name === "Finisher")) return null;
  const pool = (actor.system?.momenta ?? []).find(p => p.name === "comboPoints") ?? null;
  const marked = namesTarget(actor.getFlag?.("azeroth-rpg", DEATH_MARK_FLAG) ?? null, target);
  return finisherOfferOf(pool, finisherOptionsFor(actor.takenTalents?.() ?? []), { marked });
}

// The Damage lines the roller left ticked, summed, with their names, are
// `rules/talent-effects.mjs#damageChosen`: a class feature that opens no dialog
// counts them through the same function (D-768).

/**
 * The Damage row as the dialog prints it: *Damage 4 Fire · vs Ward 1*,
 * *Damage 6 Physical · vs AP 3 (− Pierce 2)*.
 *
 * The rule is pure and hands back keys and numbers; the words are here
 * (CLAUDE.md §11).
 */
function damageRow(described) {
  if (!described) return null;
  const type = game.i18n.localize(AZEROTH.damageTypes[described.type] ?? described.type);
  const against = described.against;
  let note = null;
  if (against?.kind === "ward") {
    note = game.i18n.format("AZEROTH.Card.VsWard", { ward: against.ward });
    // An ally's aura after the Ward (D-755), named beside it.
    if (against.schoolArmor) note += ` · ${game.i18n.format("AZEROTH.Card.VsAuraArmor", { ap: against.schoolArmor })}`;
  } else if (against?.kind === "armor") {
    note = game.i18n.format("AZEROTH.Card.VsAP", { ap: against.ap });
    if (against.pierce > 0) note += ` ${game.i18n.format("AZEROTH.Card.PierceNote", { pierce: against.pierce })}`;
  } else if (against?.kind === "immune") note = game.i18n.localize("AZEROTH.Card.Immune");
  else if (against?.kind === "vulnerable") note = game.i18n.localize("AZEROTH.Sheet.Vulnerable");
  return { text: game.i18n.format("AZEROTH.Dialog.Damage", { n: described.rating, type }), note };
}

/** The choice a skipped dialog makes: the prepared DC, the automatic lines on, nothing paid. */
export function defaultChoice(actor, spec) {
  const p = prepareRoll(actor, spec);
  const { boons, banes, modifier } = countModifiers(p.situational.automatic);
  // A skipped dialog takes the Damage lines the door could measure and leaves
  // the table's judgements off, exactly as the automatic Boons are taken.
  const damage = damageChosen(p.damageLines);
  return {
    ...damage,
    // A skipped dialog spends no Combo Points: how many a blow is worth is the
    // player's call, and a skip is not a decision to empty the pool.
    finisherSpent: 0,
    finisherFree: null,
    finisherMode: "damage",
    // Nor any rider (D-770): spending a pool is the player's call (D2 §12).
    riders: [],
    dc: p.dc,
    boons,
    banes,
    modifier,
    location: p.location,
    // Heavy Hand's Head, for the preview (D-772); the roll reads its own.
    headModifier: p.headModifier ?? null,
    momentumSpent: 0,
    overchannel: 0,
    // A skipped dialog still casts through what is in hand (07 §3, D-674):
    // the Augment is a rule, not a judgement, so it is on by default.
    augment: p.casting?.augment?.value ?? 0,
    // Nor a use of Nature's Swiftness (D-771): spending a use is the player's call.
    swift: false,
    // Nor a talent's counter or charge (D-774), for the same reason.
    talentLines: [],
    occasion: spec.occasions?.[0]?.key ?? null,
    targets: p.targets,
    // Who is acting, as `prepareRoll` found it (D-724).
    source: p.source,
    // The way the distance opened it on (D-731): a skipped dialog asked nobody.
    mode: p.mode,
    // A skipped dialog asked nobody, so both rolls go at the same target.
    secondTargets: null,
    chosen: p.situational.automatic.map(l => l.id),
    provenanceExtra: circumstanceRow(p.situational.automatic, 0, 0)
  };
}

/** One provenance row naming what was counted, or none when nothing was. */
function circumstanceRow(lines, extraBoons, extraBanes) {
  const names = lines.filter(l => l.checked).map(l => game.i18n.localize(l.label));
  if (extraBoons > 0) names.push(game.i18n.format("AZEROTH.Dialog.ExtraBoons", { n: extraBoons }));
  if (extraBanes > 0) names.push(game.i18n.format("AZEROTH.Dialog.ExtraBanes", { n: extraBanes }));
  if (!names.length) return [];
  return [{ label: "AZEROTH.Dialog.Circumstance", value: null, formula: names.join(", ") }];
}

/** Read the form into a choice. Shared by the live preview and the Roll button. */
function readForm(form, p) {
  const f = form.elements;
  const lines = [...p.situational.automatic, ...p.situational.judgement]
    .map(l => ({ ...l, checked: f[`line-${l.id}`]?.checked ?? false }));
  const extraBoons = Math.max(0, Math.trunc(Number(f.extraBoons?.value)) || 0);
  const extraBanes = Math.max(0, Math.trunc(Number(f.extraBanes?.value)) || 0);
  const { boons, banes, modifier } = countModifiers(lines, { extraBoons, extraBanes });
  const location = p.location ? (f.location?.value || p.location) : null;
  const canPay = Boolean(p.momentum && p.momentum.value >= AZEROTH.CALLED_SHOT_MOMENTUM);
  const paid = canPay && location !== null && location !== "body" && Boolean(f.momentum?.checked);
  const dcRaw = Number(f.dc?.value);
  // Casting: Overchannel points, clamped to what the Health can pay; a manual Augment.
  const maxPoints = p.casting?.maxPoints ?? 0;
  const overchannel = Math.min(maxPoints, Math.max(0, Math.trunc(Number(f.overchannel?.value)) || 0));
  const augment = Math.trunc(Number(f.augment?.value)) || 0;
  // Nature's Swiftness (D-771): ticked, and only where the line is live.
  const swift = Boolean(p.casting?.swift?.available) && f.swift?.checked === true;
  // The Damage lines still ticked (04, D-711 phase 2).
  const damage = damageChosen(p.damageLines, new Set(p.damageLines.filter(l => f[`line-${l.id}`]?.checked).map(l => l.id)));
  // Finisher: every Combo Point, or none (02 §7's *spend all your Combo Points*),
  // or nothing at all against Death Mark's target (D-773), which then counts five;
  // and Rupture's Bleeding in place of the added damage where it was chosen.
  const finisherOn = Boolean(p.finisher) && f.finisher?.checked === true;
  const finisherSpent = finisherOn ? (p.finisher.spends ?? p.finisher.value) : 0;
  const finisherFree = finisherOn && p.finisher.free ? p.finisher.free : null;
  const finisherMode = finisherOn && p.finisher.bleeding && f.finisherMode?.value === "bleeding" ? "bleeding" : "damage";
  // The riders left ticked (D-770). A greyed line cannot be ticked; the roll
  // judges the rest again against the pools as they stand.
  const riders = (p.riders ?? []).filter(l => l.available && f[`rider-${l.identifier}`]?.checked).map(l => l.identifier);
  // A talent's counter or charge (D-774): ticked, and only where the line is live.
  const talentLines = (p.talentLines ?? []).filter(l => l.available && f[`tline-${l.identifier}`]?.checked).map(l => l.identifier);
  return {
    ...damage,
    finisherSpent,
    finisherFree,
    finisherMode,
    riders,
    talentLines,
    dc: Number.isFinite(dcRaw) ? dcRaw : p.dc,
    boons,
    banes,
    modifier,
    location,
    headModifier: p.headModifier ?? null,
    momentumSpent: paid ? AZEROTH.CALLED_SHOT_MOMENTUM : 0,
    overchannel,
    augment,
    swift,
    occasion: f.occasion?.value ?? null,
    targets: p.targets,
    // Who is acting, as `prepareRoll` found it before the dialog opened (D-724):
    // the dialog has no control for it, so nothing typed into the form moves it.
    source: p.source,
    // The way this form is showing (D-731). The select is read by the switch,
    // which puts the matching variant in front of this reader, so the lines
    // counted above and the way returned can never disagree.
    mode: p.mode,
    // Where the second roll of an Extra Attack goes (02 §6, D-704).
    secondTargets: secondTargetsFrom(f, p),
    chosen: lines.filter(l => l.checked).map(l => l.id),
    provenanceExtra: circumstanceRow(lines, extraBoons, extraBanes)
  };
}

/**
 * The second Extra Attack roll's target (D-704, the lead's L3: *they may
 * split*). `same` - the default - returns null, so the second roll inherits the
 * first's targets and every row resolved against them unchanged. Anything else
 * is one of the tokens the user has targeted, by its token id.
 *
 * The control is absent on every other Test and on a dialog that was skipped,
 * and both read as *the same target*.
 */
function secondTargetsFrom(f, p) {
  const id = f.secondTarget?.value ?? "";
  if (!id || id === "same") return null;
  const pick = p.targets.find(t => t.tokenId === id) ?? null;
  return pick ? [pick] : null;
}

/** The formula for a choice, with the called shot folded in as the roll will fold it. */
function formulaFor(choice, modifiers) {
  // Heavy Hand's Head (04, D-772) rides the choice, as the roll reads it.
  const shot = calledShotCost(choice.location, { paid: choice.momentumSpent > 0, headModifier: choice.headModifier ?? null });
  const mods = [...modifiers];
  if (shot.modifier) mods.push({ label: "AZEROTH.Card.CalledShotPenalty", value: shot.modifier });
  if (choice.augment) mods.push({ label: "AZEROTH.Cast.Augment", value: choice.augment });
  // A line with a flat number rather than a die (a rung's +1, 10 §4).
  if (choice.modifier) mods.push({ label: "AZEROTH.Dialog.Circumstance", value: choice.modifier });
  return previewFormula({ boons: choice.boons, banes: choice.banes + shot.banes, modifiers: mods });
}

/**
 * The ways the dialog's select offers (D-731), or null where the weapon has one.
 *
 * A refused way stays in the list, greyed, with its reason printed beside the
 * control: removed, it would read as the weapon having no such way, when what
 * is true is that this target is too far for it (D5).
 */
function attackModeOptions(spec, chosen) {
  const modes = spec?.modes;
  if (!modes || typeof modes !== "object") return null;
  const keys = Object.keys(modes).filter(key => Object.hasOwn(modes, key) && Object.hasOwn(AZEROTH.attackModes, key));
  if (keys.length < 2) return null;
  return keys.map(key => ({
    mode: key,
    label: AZEROTH.attackModes[key],
    selected: key === chosen,
    refused: modes[key].refused
      ? game.i18n.format("AZEROTH.Dialog.AttackMode.TooFar", {
          way: game.i18n.localize(AZEROTH.attackModes[key]),
          distance: Math.round(modes[key].refused.distance ?? 0),
          max: modes[key].refused.max ?? 0
        })
      : null
  }));
}

/**
 * One way's dialog, prepared and rendered: the prepared roll, the modifier lines,
 * whether the called shot can be paid for, and the body's markup.
 */
async function dialogVariant(actor, spec) {
  const { renderTemplate } = foundry.applications.handlebars;
  const p = prepareRoll(actor, spec);
  const resolved = withAttackMode(spec, p.mode);
  const modifiers = (resolved.modifiers ?? []).map(m => ({ label: m.label, value: m.value }));
  const canPay = Boolean(p.momentum && p.momentum.value >= AZEROTH.CALLED_SHOT_MOMENTUM);
  const initial = {
    ...countModifiers(p.situational.automatic),
    location: p.location,
    headModifier: p.headModifier ?? null,
    momentumSpent: 0,
    // The preview opens showing the Augment the box opens carrying (D-674).
    augment: p.casting?.augment?.value ?? 0
  };
  // A target with no head cannot be shot in one (06 SS2): the option is not offered.
  const absent = p.targets[0]?.absent ?? [];
  const locations = Object.fromEntries(Object.entries(AZEROTH.locations).filter(([k]) => !absent.includes(k)));

  const context = {
    // **IN THE HAND OR THROWN** (D-731): drawn only where the weapon has both,
    // bound on `change` in `promptRoll` with no `data-action` (an action fires
    // on click alone).
    attackModes: attackModeOptions(resolved, p.mode),
    title: spec.title,
    kind: spec.kind,
    dc: p.dc,
    dcSource: `AZEROTH.Dialog.DC.${p.dcSource[0].toUpperCase()}${p.dcSource.slice(1)}`,
    targetName: p.targets[0]?.name ?? null,
    automatic: p.situational.automatic,
    judgement: p.situational.judgement,
    reminders: p.reminders ?? [],
    warnings: p.situational.warnings,
    isAttack: spec.kind === "attack",
    location: p.location,
    locations,
    // What this blow deals and what it will meet (06 §4, the lead's item 29).
    damageLine: damageRow(p.damageLine),
    // What a talent adds to it, per rank (04, D-711 phase 2). Auto-checked
    // where the door measured the fact; the table's calls come unticked.
    damageLines: p.damageLines,
    // 02 §7's Finisher (the lead's item 11), unchecked.
    finisher: p.finisher,
    // The riders (04, D-770), unchecked, each priced and, where refused, greyed
    // with its reason beside it in words. Everything a row draws is ON the row
    // (D-609: a bare name inside `#each` resolves against the row).
    // A line paid before the blow from the Combat tab (the lead, 2026-10-03:
    // *"Either order"*) is drawn TICKED and greyed, its words saying it is paid:
    // this attack is the charge whatever is ticked, and `rollTest` takes it.
    riders: (p.riders ?? []).map(l => ({
      identifier: l.identifier,
      name: l.name,
      price: riderPrice(l),
      does: riderDoes(l),
      available: l.available,
      primed: l.primed === true,
      reason: riderReason(l.reason)
    })),
    // **WHAT A TALENT'S COUNTER OR CHARGE BUYS** (D-774), unticked, each saying in
    // words what it does and how many are left, and greyed WITH its reason (D5).
    talentLines: (p.talentLines ?? []).map(l => ({
      identifier: l.identifier,
      name: l.name,
      does: game.i18n.format(`AZEROTH.TalentLine.Does.${l.kind}`, { n: l.amount }),
      left: game.i18n.format(l.kind === "charge" ? "AZEROTH.TalentLine.Charges" : "AZEROTH.TalentLine.Left", { n: l.left }),
      available: l.available,
      reason: l.reason ? game.i18n.format(l.reason, { name: l.name }) : null
    })),
    // **THE SECOND ROLL'S TARGET** (02 §6, D-704; the lead's L3). Drawn only
    // where the door settled on two rolls, so every other Test is untouched.
    // *The same target* first, then each token the user has targeted - which is
    // the whole of what can be aimed at, since a snapshot is what the roll
    // carries. Every bounded choice is a `<select>`; the dialog reads its form
    // on change, so the control needs no `data-action` and would be dead with
    // one (an action fires on click alone).
    second: (spec.rolls ?? 1) > 1
      ? { targets: p.targets.map(t => ({ tokenId: t.tokenId, name: t.name })) }
      : null,
    casting: p.casting,
    occasions: spec.occasions ?? null,
    momentum: p.momentum
      ? { name: p.momentum.name, value: p.momentum.value, max: p.momentum.max, canPay, cost: AZEROTH.CALLED_SHOT_MOMENTUM }
      : null,
    modifiers,
    preview: formulaFor(initial, modifiers)
  };
  return { p, modifiers, canPay, html: await renderTemplate(TEMPLATE, context) };
}

/**
 * **SWITCH THE WAY THE BLOW IS STRUCK** (D-731), in place and at once.
 *
 * Every way was prepared and rendered before the dialog opened, so the switch
 * is synchronous: the body is replaced with the other way's markup and nothing
 * can read the form half-switched. **What means the same in either way is
 * carried across**: the DC as typed, the extra Boons and Banes, the location
 * and its Momentum, the Finisher, the second roll's target and a talent's
 * damage lines. **The situational lines follow `carriedLines`**: a line the new
 * way raises in the same list with the same cost keeps the roller's tick, and
 * every other line - the thrown blow's automatic Engaged Bane, a stab's
 * out-of-reach line - takes the new way's default. A line of the old way alone
 * is simply not in the new markup.
 *
 * **It never writes the dialog's `options`**: ApplicationV2 freezes them, so
 * `dialog.options.content = ...` throws in a module, and it threw here after the
 * body was swapped and before the way was recorded - the live batch found a
 * dialog showing a throw while it believed it was a stab. A re-render is
 * `promptRoll`'s to answer.
 *
 * @returns {boolean} whether the body now shows `key`; false leaves it as it was
 */
function switchAttackMode(form, variants, state, key) {
  const from = variants.get(state.key);
  const to = variants.get(key);
  if (!from || !to) return false;
  const f = form.elements;
  const allFrom = [...from.p.situational.automatic, ...from.p.situational.judgement];
  const kept = {
    dc: f.dc?.value ?? null,
    extraBoons: f.extraBoons?.value ?? null,
    extraBanes: f.extraBanes?.value ?? null,
    location: f.location?.value ?? null,
    momentum: f.momentum?.checked === true,
    finisher: f.finisher?.checked === true,
    finisherMode: f.finisherMode?.value ?? null,
    // A rider ticked is the same spend whichever way the blow is struck (D-770).
    riders: new Set((from.p.riders ?? []).filter(l => f[`rider-${l.identifier}`]?.checked).map(l => l.identifier)),
    secondTarget: f.secondTarget?.value ?? null,
    damage: new Set(from.p.damageLines.filter(l => f[`line-${l.id}`]?.checked).map(l => l.id)),
    lines: carriedLines(from.p.situational, to.p.situational, allFrom.filter(l => f[`line-${l.id}`]?.checked).map(l => l.id))
  };
  const body = form.querySelector(".dialog-content");
  if (!body) return false;
  // Cleaned exactly as DialogV2 cleans the content it opens on.
  body.innerHTML = foundry.utils.cleanHTML(to.html);
  state.key = key;
  const g = form.elements;
  if (g.dc && kept.dc !== null) g.dc.value = kept.dc;
  if (g.extraBoons && kept.extraBoons !== null) g.extraBoons.value = kept.extraBoons;
  if (g.extraBanes && kept.extraBanes !== null) g.extraBanes.value = kept.extraBanes;
  if (g.location && kept.location !== null && [...g.location.options].some(o => o.value === kept.location)) g.location.value = kept.location;
  if (g.momentum) g.momentum.checked = kept.momentum;
  if (g.finisher) g.finisher.checked = kept.finisher;
  if (g.finisherMode && kept.finisherMode) g.finisherMode.value = kept.finisherMode;
  for (const line of to.p.riders ?? []) {
    const box = g[`rider-${line.identifier}`];
    if (box) box.checked = line.primed === true || (line.available && kept.riders.has(line.identifier));
  }
  if (g.secondTarget && kept.secondTarget !== null) g.secondTarget.value = kept.secondTarget;
  for (const line of [...to.p.situational.automatic, ...to.p.situational.judgement]) {
    const box = g[`line-${line.id}`];
    if (box) box.checked = kept.lines.has(line.id);
  }
  for (const line of to.p.damageLines) {
    const box = g[`line-${line.id}`];
    if (box) box.checked = kept.damage.has(line.id);
  }
  form.querySelector("[data-attack-mode]")?.focus();
  return true;
}

/**
 * Open the dialog and wait. Resolves to the choice, or null when dismissed.
 * @param {Actor} actor
 * @param {object} spec  { kind, title, skill, dc, location, modifiers, targets, mode, modes }
 */
export async function promptRoll(actor, spec) {
  const { DialogV2 } = foundry.applications.api;
  // One prepared dialog per way the blow may be struck (D-731); every other
  // Test has exactly one, keyed null.
  const ways = usableAttackModes(spec);
  const variants = new Map();
  if (ways.length > 1) {
    for (const way of ways) variants.set(way, await dialogVariant(actor, { ...spec, mode: way }));
  } else {
    variants.set(null, await dialogVariant(actor, spec));
  }
  const state = { key: ways.length > 1 ? withAttackMode(spec, spec.mode ?? null).mode : null };
  // The way `content` below draws, and so the way every render of the dialog draws.
  const opened = state.key;
  const current = () => variants.get(state.key);

  return DialogV2.wait({
    id: dialogId(actor),
    classes: ["azeroth", "azeroth-roll-dialog"],
    window: { title: spec.title || game.i18n.localize("AZEROTH.Card.Test"), icon: "fa-solid fa-dice-d20" },
    position: { width: 440 },
    content: current().html,
    rejectClose: false,
    buttons: [{
      action: "roll",
      label: "AZEROTH.Dialog.Roll",
      icon: "fa-solid fa-dice-d20",
      default: true,
      callback: (event, button) => readForm(button.form, current().p)
    }],
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      // Every control is re-read on each update: a switch replaces the body.
      const update = () => {
        const shown = current();
        const choice = readForm(form, shown.p);
        const preview = form.querySelector(".azeroth-dialog-preview");
        if (preview) preview.textContent = formulaFor(choice, shown.modifiers);
        const momentumBox = form.elements.momentum;
        if (momentumBox) momentumBox.disabled = !shown.canPay || !choice.location || choice.location === "body";
      };
      form.addEventListener("change", changed => {
        const control = changed.target;
        // An occasion carries its DC (10 SS3); choosing one writes it, and a
        // null DC leaves whatever is typed.
        if (control?.name === "occasion") {
          const dc = control.selectedOptions?.[0]?.dataset.dc;
          if (dc !== undefined && dc !== "" && form.elements.dc) form.elements.dc.value = dc;
        }
        // The way the blow is struck (D-731): bound here, on `change`, because
        // the select carries no `data-action` - an action fires on click alone.
        // **A SWITCH THAT DID NOT HAPPEN PUTS THE SELECT BACK** (D-731's review):
        // a way with no variant - refused, or not this weapon's - left the
        // select reading *Thrown* over a form that was still the stab's.
        if (control?.matches?.("[data-attack-mode]") && control.value !== state.key) {
          const switched = variants.has(control.value) && switchAttackMode(form, variants, state, control.value);
          if (!switched) control.value = current().p.mode ?? state.key ?? "";
        }
        update();
      });
      form.addEventListener("input", update);
      // A render draws `content` again, which is the way the dialog OPENED on:
      // the options are frozen and cannot follow a switch. Put the chosen way
      // back over it, from what the fresh form holds, before anything reads it.
      if (state.key !== opened && variants.has(state.key)) {
        const chosen = state.key;
        state.key = opened;
        switchAttackMode(form, variants, state, chosen);
      }
      update();
    }
  });
}
