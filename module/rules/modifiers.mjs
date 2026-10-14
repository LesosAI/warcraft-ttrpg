/**
 * What circumstance does to a Test before the dice are picked up (05 §3,
 * 05 §4, A1, 06 §2). Pure: a snapshot in, lines out, no Foundry.
 *
 * Two lists, and the split is D2 §12's rule - "no automation of GM judgement":
 *
 *   automatic   what the roller's own state settles - Fatigue 3, the Poisoned
 *               stacks, Blinded on an attack, the worn suit's Bane on a skill,
 *               a target that cannot see - offered CHECKED and editable;
 *   judgement   05 §4's table and A1's "while in sight" clauses - flanking,
 *               high ground, Frightened - offered UNCHECKED, because whether
 *               they apply is the table's call and never the system's.
 *
 * The called shot is here too (06 §2, D-080, D-239): Body is free and the
 * default, a Limb a Bane, the Head a Bane and -2. Two Momentum cancels the
 * Bane and never the -2.
 */

import { AZEROTH } from "../config.mjs";
import { poisonedBanes } from "../effects/conditions.mjs";
import { testFormula } from "./resolution.mjs";

/** @typedef {"skill"|"attack"|"casting"|"resilience"} TestKind */

/** What the dialog says where a Signature took a Bane back off the roll (08 §20, D-692). */
const BANE_CANCELLED = "AZEROTH.Modifier.Warn.BaneCancelled";

/** And where a TALENT did (04's Careful Shot, D-773); the dialog names the talent. */
export const TALENT_CANCELLED = "AZEROTH.Modifier.Warn.TalentCancelled";

/**
 * @typedef {object} ModifierLine
 * @property {string} id
 * @property {string} label       i18n key
 * @property {number} boons
 * @property {number} banes
 * @property {boolean} checked    automatic lines start checked
 */

/** 05 §3: unless a DC is given, a Standard Test at the tier of whatever caused it. */
export function standardDC(tier = 1) {
  const t = Math.min(4, Math.max(1, Math.trunc(Number(tier)) || 1));
  return AZEROTH.STANDARD_DC[t];
}

/**
 * The cost of reaching a location. Body is free and the default; the
 * location is chosen before the roll and never read off the die. `paid` is
 * the 2-Momentum cancel: it removes the Bane and leaves the -2 exactly where
 * 06 §2 leaves it.
 */
export function calledShotCost(location, { paid = false, headModifier = null } = {}) {
  // 04's Heavy Hand (D-772): *you do not suffer the −2 to your Attack Test* on
  // a called shot to the Head. The Bane is untouched; the Momentum still buys it.
  if (location === "head") return { banes: paid ? 0 : 1, modifier: Number.isFinite(Number(headModifier)) && headModifier !== null ? Math.trunc(Number(headModifier)) : -2 };
  if (location === "limb") return { banes: paid ? 0 : 1, modifier: 0 };
  return { banes: 0, modifier: 0 };
}

/** `fatigue` -> `AZEROTH.Modifier.Fatigue`. */
function labelFor(id) {
  return `AZEROTH.Modifier.${id[0].toUpperCase()}${id.slice(1)}`;
}

/**
 * @param {object} s
 * @param {TestKind} [s.kind]
 * @param {string} [s.skill]             skill key, for the suit's Banes
 * @param {number} [s.fatigue]
 * @param {string[]} [s.statuses]        condition ids on the roller
 * @param {number} [s.poisoned]          stacks, when Poisoned
 * @param {string[]} [s.armorBanes]      skill keys the worn suit Banes (08 §8)
 * @param {string[]} [s.targetStatuses]  condition ids on the first target
 * @param {boolean} [s.swarm]            the roller is a swarm (13 §4)
 * @param {boolean} [s.swarmThinned]     and below half its Health
 * @param {string[]} [s.gearBoons]       worn items granting a Boon on this skill (08 §6)
 * @param {string[]} [s.standingBanes]   what Banes this skill: a creature's own passive (14, D-691)
 * @param {number} [s.standingTestBoons] Boons on this KIND of Test, from a passive
 * @param {number} [s.standingTestBanes] Banes on this kind of Test, from a passive
 * @param {string[]} [s.gearTestBoons]   worn things granting a Boon on this KIND of
 *   Test, BY NAME (08 §20, 2026-09-10). A LINE OF ITS OWN rather than a second
 *   source folded into `standingTestBoons`, because the two say different
 *   things: 14's is *a standing ability of this creature* and this one is the
 *   thing in your hand, which the reader can take off. Naming it is the point —
 *   a Boon with no source beside it reads as the tool's own arithmetic.
 * @param {string[]} [s.gearTestBanes]   and what Banes it
 * @param {{banes: number, names: string[]}} [s.laidBanes]  what SOMEBODY ELSE laid on
 *   this Test (06 §6's Pummel, 08 §20's Gorehowl; D-693). It is the roller's
 *   own state - the effect is already on them - so it is AUTOMATIC and comes
 *   CHECKED, and it names its source, because *two Banes* with nothing beside
 *   it reads as the tool's own arithmetic rather than as the blow that landed.
 * @param {{boons: number, names: string[], judged?: {boons: number, names: string[]}}} [s.auraBoons]
 *   what an ALLY'S AURA gives this Test (02 §7's Aura of Resolve, D-755),
 *   `rules/auras.mjs#auraBoonsOn` with the names composed. The roller's own
 *   state - the effect is already on them - so it is AUTOMATIC and CHECKED,
 *   names the aura and its holder, and is never spent. `judged` is a Boon on a
 *   Resilience Test the door did not name: whether it is this one is the
 *   table's, so an unchecked line.
 * @param {{banes: number, names: string[], judged?: {banes: number, names: string[]}}} [s.auraBanes]
 *   what an AREA lays on this Test while the roller stands in it (07's Insect
 *   Swarm, Rimebind; D-757), `rules/auras.mjs#auraBanesOn` with the names
 *   composed. The roller's own state, so AUTOMATIC and CHECKED, named, and
 *   never spent; `judged` is one only the table can say holds - Crucible's
 *   *holding a metal weapon*, which 08 records no material for.
 * @param {{boons: number, names: string[]}} [s.talentBoons]  a Boon a TALENT gives
 *   this Test off a fact the door measured (D-772): 04's Hammer of Wrath against
 *   a target below half Health, Reckless on every attack. Automatic, checked,
 *   named.
 * @param {{boons: number, names: string[]}} [s.reckless]  04's Reckless on the
 *   roller's attack (D-772): its own line, because an attack made with it ticked
 *   lays the roller's exposure.
 * @param {{boons: number, names: string[]}} [s.nextAttackBoons]  a Boon the NEXT
 *   attack was promised (04's Follow Through, D-772; `rules/next-attack.mjs`):
 *   on the roller already, so automatic, checked, named, and taken by the attack.
 * @param {{boons: number, names: string[]}} [s.laidBoons]  a Boon SOMEBODY ELSE
 *   laid on this Test (04's Blessing, D-772): `laidBanes`' twin.
 * @param {{boons: number, names: string[], judged?: {boons: number, names: string[]}}} [s.targetExposed]
 *   what the TARGET's own exposure gives an attack against it (04's Reckless:
 *   *attacks against you gain one too*; D-772). `judged` is a ranged-only one on
 *   a blow whose range the door does not know.
 * @param {Array<{id: string, boons?: number, banes?: number, modifier?: number}>} [s.corruption]
 *                                       the rungs that bear on this Test (10 §4, §5), as judgement lines
 * @param {string} [s.resilience]        which Resilience, on a Resilience Test
 * @param {"melee"|"ranged"|null} [s.range]
 * @param {{band: string, banes: number, warn?: boolean}|null} [s.rangeBand]  06's range band, where a distance was measured
 * @param {string|null} [s.outOfReachNote]  how far the target is and what the
 *   weapon reaches, already in the reader's own words (D-716). The pure rule
 *   decides WHETHER the line is raised; the words come in from the sheet, the
 *   way `laidBanes.names` does - a distance is two numbers and a unit, and
 *   composing that sentence here would hardcode English in `rules/`.
 * @param {boolean} [s.engaged]   an enemy inside the roller's reach (06)
 * @param {string[]} [s.cancelsBane]  line ids a Signature takes back off this
 *   roll (08 §20, D-692). Dragonstalker Armor: *a Ranger wearing it takes no
 *   Bane on Attack Tests against dragonkin, whatever the range.* **A BANE
 *   REMOVED IS NOT A BOON** — 08 §6's grammar has *A Boon on Attack Tests* and
 *   nothing that cancels one, and a Boon standing against two Banes is a
 *   different roll — so the line is never raised at all and a warning says who
 *   took it away.
 * @param {{ids: string[], names: string[]}} [s.talentCancels]  line ids a TALENT
 *   takes off this roll (04's Careful Shot: *Your ranged attacks ignore the Bane
 *   for being Engaged ... the Bane from a target behind cover*; D-773). Never
 *   raised, as a Signature's cancel is, and said once in a warning of its own.
 * @param {{names: string[]}|null} [s.packFlank]  06 §5's flanking, MEASURED (04's
 *   Pack Tactics, D-773): the Boon automatic and named, where it was the table's.
 * @param {{banes: number, names: string[]}|null} [s.targetDeterred]  what the
 *   TARGET's own Deterrence lays on attacks against it (04, D-773): automatic.
 * @param {{banes: number, names: string[]}|null} [s.talentBanes]  Banes a talent of
 *   whoever forced this Test lays on it (04's Vile Concoction, D-773): automatic.
 * @param {{boons: number, names: string[]}|null} [s.opening]  02's Opening,
 *   MEASURED against this target (a target not yet acted, or one 04's Cheap Shot,
 *   Overkill or Subterfuge puts under it; D-773): automatic, where the feature's
 *   own reminder is the table's line.
 * @returns {{automatic: ModifierLine[], judgement: ModifierLine[], warnings: string[]}}
 */
export function situationalModifiers({
  kind = "skill",
  skill = null,
  fatigue = 0,
  statuses = [],
  poisoned = 0,
  armorBanes = [],
  targetStatuses = [],
  range = null,
  rangeBand = null,
  outOfReachNote = null,
  engaged = false,
  swarm = false,
  swarmThinned = false,
  gearBoons = [],
  standingBanes = [],
  standingTestBoons = 0,
  standingTestBanes = 0,
  gearTestBoons = [],
  gearTestBanes = [],
  laidBanes = null,
  auraBoons = null,
  auraBanes = null,
  talentBoons = null,
  reckless = null,
  nextAttackBoons = null,
  laidBoons = null,
  targetExposed = null,
  corruption = [],
  heavy = false,
  cancelsBane = [],
  talentCancels = null,
  packFlank = null,
  targetDeterred = null,
  talentBanes = null,
  opening = null,
  resilience = null
} = {}) {
  const has = id => statuses.includes(id);
  const targetHas = id => targetStatuses.includes(id);
  const automatic = [];
  const judgement = [];
  const warnings = [];
  const seen = new Set();
  // Only the ids 08 §20 can actually cancel, so a stored word outside the
  // vocabulary cannot silently switch off a line it was never written for.
  const cancelled = new Set((cancelsBane ?? []).filter(id => id in AZEROTH.cancellableBanes));
  // What a TALENT takes off (04's Careful Shot, D-773): its own two lines, said
  // in a warning of its own - the Signature's names what is worn.
  const talentCancelled = new Set((talentCancels?.ids ?? []).filter(id => id === "engagedRanged" || id === "coverLight"));
  const push = (list, id, { boons = 0, banes = 0, modifier = 0, name = null } = {}, checked) => {
    if (seen.has(id)) return;
    // A cancelled line is not raised at all - not raised and unchecked, which
    // a reader would tick back on, and not turned into a Boon.
    if (cancelled.has(id)) {
      seen.add(id);
      // ONCE, however many lines are cancelled: the dialog prints the list and
      // two identical sentences under each other read as a bug.
      if (!warnings.includes(BANE_CANCELLED)) warnings.push(BANE_CANCELLED);
      return;
    }
    if (talentCancelled.has(id)) {
      seen.add(id);
      if (!warnings.includes(TALENT_CANCELLED)) warnings.push(TALENT_CANCELLED);
      return;
    }
    seen.add(id);
    // A NAME rides beside the label where the line has a source a reader would
    // want (the dialog draws it bold, as it already does on a reminder line):
    // *two Banes* alone reads as the tool's own arithmetic.
    list.push({ id, label: labelFor(id), boons, banes, modifier, checked, ...(name ? { name } : {}) });
  };
  const auto = (id, cost) => push(automatic, id, cost, true);
  const judge = (id, cost) => push(judgement, id, cost, false);
  const isTest = kind === "skill" || kind === "attack" || kind === "casting";

  // ---- automatic: the roller's own state ----------------------------------
  // 05: Fatigue 3 is a Bane on Skill and Attack Tests; 5 puts one on
  // Resilience as well.
  if (fatigue >= AZEROTH.FATIGUE_BANE_AT && (kind === "skill" || kind === "attack")) auto("fatigue", { banes: 1 });
  if (fatigue >= AZEROTH.FATIGUE_RESILIENCE_BANE_AT && kind === "resilience") auto("fatigue", { banes: 1 });

  // A1: each of the first three Poisoned stacks is a Bane on all your Tests;
  // the fourth adds none (D-472).
  if (has("poisoned")) {
    const n = poisonedBanes(poisoned || 1);
    if (n) auto("poisoned", { banes: n });
  }

  // A1: Blinded is a Bane on Attack Tests outright, and on any Test that
  // needs sight - which is the table's call.
  if (has("blinded")) {
    if (kind === "attack") auto("blindedAttack", { banes: 1 });
    else if (isTest) judge("needsSight", { banes: 1 });
  }
  // A1: Deafened - a Bane on any Test that needs hearing.
  if (has("deafened") && kind !== "attack" && isTest) judge("deafened", { banes: 1 });
  // A1: Frightened - a Bane while the source is in sight.
  if (has("frightened")) judge("frightened", { banes: 1 });

  // 08 §8: the worn suit's Bane on the skills its cut names.
  if (kind === "skill" && skill && armorBanes.includes(skill)) auto("armor", { banes: 1 });
  // 08 §5: a Heavy weapon below Strength 13 takes a Bane (2026-09-06).
  if (heavy && kind === "attack") auto("heavyWeapon", { banes: 1 });
  // 06: past a weapon's Range to twice it, a Bane. The distance is measured
  // on the canvas, so it is the roller's own state and automatic (D-669).
  if (kind === "attack" && rangeBand?.band === "long") auto("longRange", { banes: rangeBand.banes || 1 });
  // 06 + D-716: the target is further away than this weapon reaches. The blow
  // is NOT refused any more and it costs nothing - 06 gives a melee attack
  // past reach no Bane, it gives it nothing at all - so this is a line that
  // says how far it is and leaves the call to the table (D2 §12). It comes
  // CHECKED because it is a measured fact about the roller's own state, and a
  // warning sentence sits above the list so it cannot be read as a modifier.
  if (kind === "attack" && rangeBand?.warn === true) {
    auto("outOfReach", { name: outOfReachNote });
    warnings.push("AZEROTH.Modifier.Warn.OutOfReach");
  }
  // 06: a ranged attack or a Casting Test made while Engaged takes a Bane. The
  // casting line has words of its own - *attacking at range* is not what a
  // caster is doing - and every casting door says whether it is Engaged since
  // D-732; none did before, so this line was raised for nobody.
  if (engaged && kind === "casting") auto("engagedCasting", { banes: 1 });
  if (engaged && kind === "attack" && range === "ranged") auto("engagedRanged", { banes: 1 });
  // 06: cover is the table's to see, never the tool's (D2 §12).
  if (kind === "attack" && range === "ranged") judge("coverLight", { banes: 1 });
  // 08 §6: a worn affix's Boon on the skill it names - one per item, the
  // roller's own gear, so automatic and still editable (2026-09-06).
  if (kind === "skill" && skill && gearBoons.length) auto("gearBoon", { boons: gearBoons.length });
  // 14: a creature's OWN standing passive - the gnoll that laughs takes a Bane
  // on every Stealth Test, the bandit among bandits a Boon on its attacks. It
  // is the roller's own state, so automatic and still editable (D-691).
  if (kind === "skill" && skill && standingBanes.length) auto("standingBane", { banes: standingBanes.length });
  if (standingTestBoons > 0) auto("standingBoon", { boons: standingTestBoons });
  if (standingTestBanes > 0 && !(kind === "skill" && skill && standingBanes.length)) auto("standingBane", { banes: standingTestBanes });
  // 08 §20 (2026-09-10): a Boon on this KIND of Test from a thing being WORN -
  // a parry rating read as a Boon on the Parry, a Signature that says *a Boon
  // on Attack Tests*. The roller's own gear, so automatic and still editable,
  // and the line NAMES what is granting it.
  if (gearTestBoons.length) auto("gearTestBoon", { boons: gearTestBoons.length, name: gearTestBoons.join(", ") });
  if (gearTestBanes.length) auto("gearTestBane", { banes: gearTestBanes.length, name: gearTestBanes.join(", ") });

  // 06 §6 (D-693): a Bane somebody ELSE laid on this Test. Pummel's two on the
  // next Casting Test, Gorehowl's one on the next Attack Test. It is the
  // roller's own state - the effect is on them already - so it is automatic
  // and comes checked, and it says WHO laid it.
  if ((laidBanes?.banes ?? 0) > 0) {
    auto("laidBane", { banes: laidBanes.banes, name: (laidBanes.names ?? []).join(", ") || null });
  }
  // **A BANE THAT SPARES ONE CREATURE, ON A TEST THAT NAMES NO TARGET** (04's
  // Taunt and Judgement: *attacking anyone but you*; D-772): who the blow is at
  // is the table's to say, so the line comes unchecked.
  if ((laidBanes?.judged?.banes ?? 0) > 0) {
    judge("laidBaneJudged", { banes: laidBanes.judged.banes, name: (laidBanes.judged.names ?? []).join(", ") || null });
  }
  // **WHAT THE TALENTS GIVE THIS TEST** (D-772), each named and checked: a fact
  // the door measured (Hammer of Wrath's target below half Health, Reckless on
  // every attack), a Boon the next attack was promised (Follow Through), and a
  // Boon somebody else laid (Blessing) - the roller's own state, all three.
  if ((talentBoons?.boons ?? 0) > 0) auto("talentBoon", { boons: talentBoons.boons, name: (talentBoons.names ?? []).join(", ") || null });
  // 04's Reckless, a line of its own: the attack made with it TICKED lays the
  // exposure (`rollTest` reads the chosen ids), so it cannot share an id.
  if ((reckless?.boons ?? 0) > 0) auto("reckless", { boons: reckless.boons, name: (reckless.names ?? []).join(", ") || null });
  if ((nextAttackBoons?.boons ?? 0) > 0) auto("nextAttackBoon", { boons: nextAttackBoons.boons, name: (nextAttackBoons.names ?? []).join(", ") || null });
  if ((laidBoons?.boons ?? 0) > 0) auto("laidBoon", { boons: laidBoons.boons, name: (laidBoons.names ?? []).join(", ") || null });
  // **THE RANGER'S AND THE ROGUE'S** (D-773), each a fact the door measured or a
  // talent of whoever forced the Test: Vile Concoction's Banes on a poison Test,
  // 02's Opening against a target under it.
  if ((talentBanes?.banes ?? 0) > 0) auto("talentBane", { banes: talentBanes.banes, name: (talentBanes.names ?? []).join(", ") || null });
  if (kind === "attack" && (opening?.boons ?? 0) > 0) auto("opening", { boons: opening.boons, name: (opening.names ?? []).join(", ") || null });

  // 02 §7's Aura of Resolve and every aura that gives a Boon (D-755): the
  // effect an ally's aura laid is already on the roller, so the line is
  // automatic and checked, and it says whose aura it is. A Resilience Test that
  // named no Resilience cannot say whether the Boon is its own - the table's.
  if ((auraBoons?.boons ?? 0) > 0) {
    auto("auraBoon", { boons: auraBoons.boons, name: (auraBoons.names ?? []).join(", ") || null });
  }
  if ((auraBoons?.judged?.boons ?? 0) > 0) {
    judge("auraBoonJudged", { boons: auraBoons.judged.boons, name: (auraBoons.judged.names ?? []).join(", ") || null });
  }
  // 07's Insect Swarm, Hallowed Ground's enemies, Rimebind (D-757): a Bane an
  // area lays while the roller remains in it. On them already, so automatic,
  // checked and named; Crucible's metal weapon is the table's to see.
  if ((auraBanes?.banes ?? 0) > 0) {
    auto("auraBane", { banes: auraBanes.banes, name: (auraBanes.names ?? []).join(", ") || null });
  }
  if ((auraBanes?.judged?.banes ?? 0) > 0) {
    judge("auraBaneJudged", { banes: auraBanes.judged.banes, name: (auraBanes.judged.names ?? []).join(", ") || null });
  }

  // 13 §4 (D-646): a Thinned swarm's attack takes a Bane, and a swarm takes
  // one on Reflex. The roller's own state, so automatic and still editable.
  if (swarmThinned && kind === "attack") auto("swarmThinned", { banes: 1 });
  if (swarm && kind === "resilience" && resilience === "reflex") auto("swarmReflex", { banes: 1 });

  // ---- the target's state, on an attack -------------------------------------
  if (kind === "attack") {
    // A1 Blinded: attacks against you gain a Boon.
    if (targetHas("blinded")) auto("targetBlinded", { boons: 1 });
    // 05 SS10 Guard: attackers have a Bane against you until your next turn.
    if (targetHas("guarded")) auto("targetGuarded", { banes: 1 });
    // 04's Reckless (D-772): *Until your next turn, attacks against you gain one
    // too* - the target's own exposure, laid by the attack it made with the
    // Boon. A ranged-only one (rank 2) on a blow of unknown range is the table's.
    if ((targetExposed?.boons ?? 0) > 0) auto("targetExposed", { boons: targetExposed.boons, name: (targetExposed.names ?? []).join(", ") || null });
    if ((targetExposed?.judged?.boons ?? 0) > 0) judge("targetExposedJudged", { boons: targetExposed.judged.boons, name: (targetExposed.judged.names ?? []).join(", ") || null });
    // 04's Deterrence (D-773): *Attacks against you take a Bane per rank until the
    // start of your next turn* - the target's own effect, so automatic.
    if ((targetDeterred?.banes ?? 0) > 0) auto("targetDeterred", { banes: targetDeterred.banes, name: (targetDeterred.names ?? []).join(", ") || null });
    // 04's Pack Tactics (D-773): flanking MEASURED - the holder and the companion
    // both Engaged with the target - is 06 §5's Boon, automatic and named; the
    // judgement line below is then not raised again.
    if (packFlank?.names?.length) auto("flanking", { boons: 1, name: packFlank.names.join(", ") });
    // A1 Prone: melee attacks against you gain a Boon, ranged attacks take a
    // Bane. Settled where the range is known; otherwise both are offered.
    if (targetHas("prone")) {
      if (range === "melee") auto("targetProneMelee", { boons: 1 });
      else if (range === "ranged") auto("targetProneRanged", { banes: 1 });
      else {
        judge("targetProneMelee", { boons: 1 });
        judge("targetProneRanged", { banes: 1 });
      }
    }
  }

  // ---- 10 §4 and §5: a rung's Bane or bonus is the table's call -----------
  // Whether the noticing was by ear, whether the listener can tell what you
  // are, whether the Resilience Test is against Fel: unchecked, editable.
  for (const line of corruption) judge(line.id, { boons: line.boons ?? 0, banes: line.banes ?? 0, modifier: line.modifier ?? 0 });

  // ---- 05 §4's table: every one of these is the table's call ---------------
  if (kind === "attack") {
    judge("unseen", { boons: 1 });
    judge("helpless", { boons: 1 });
    judge("flanking", { boons: 1 });
    // **NEVER ON A BLOW IN THE HAND** (D-731's review). 06 §5 Banes a RANGED
    // attack made while Engaged, so on a melee attack the line was noise the
    // roller could tick - and a tick on a throw was carried into the stab by
    // a switch, because the line stood in the same list at the same cost in
    // both. Where the range is not known (a creature's row) it is still offered.
    if (range !== "melee") judge("engagedRanged", { banes: 1 });
  }
  // **A CASTING TEST NOT MEASURED AS ENGAGED OFFERS THE LINE AS THE TABLE'S
  // CALL** (D-732's review), exactly as an attack offers its own: nothing on the
  // scene to measure, or an enemy the roller cannot see - which must not be
  // counted for them, or the card names it. Raised automatic above, it is not
  // raised twice.
  if (kind === "casting") judge("engagedCasting", { banes: 1 });
  if (isTest) {
    judge("highGround", { boons: 1 });
    judge("steady", { boons: 1 });
    judge("assist", { boons: 1 });
    if (!has("blinded")) judge("cannotSee", { banes: 1 });
    judge("footing", { banes: 1 });
    if (kind !== "casting") judge("untrained", { banes: 1 });
  }

  // ---- what the dialog says rather than counts -------------------------------
  if (has("stunned") && kind !== "resilience") warnings.push("AZEROTH.Modifier.Warn.Stunned");
  if (has("silenced") && kind === "casting") warnings.push("AZEROTH.Modifier.Warn.Silenced");
  if (has("charmed") && kind === "attack") warnings.push("AZEROTH.Modifier.Warn.Charmed");

  return { automatic, judgement, warnings };
}

/**
 * Sum the chosen lines and the free counts.
 * @param {ModifierLine[]} lines
 * @param {{extraBoons?: number|string, extraBanes?: number|string}} [extra]
 */
export function countModifiers(lines = [], { extraBoons = 0, extraBanes = 0 } = {}) {
  let boons = Math.max(0, Math.trunc(Number(extraBoons)) || 0);
  let banes = Math.max(0, Math.trunc(Number(extraBanes)) || 0);
  // A flat number on a line rather than a die (10 §4's +1 against Fel).
  let modifier = 0;
  for (const line of lines) {
    if (!line.checked) continue;
    boons += line.boons ?? 0;
    banes += line.banes ?? 0;
    modifier += line.modifier ?? 0;
  }
  return { boons, banes, modifier };
}

/**
 * The formula the dialog previews - the same shape `AzerothRoll.build`
 * emits, so what the dialog shows is what the card will say.
 */
export function previewFormula({ boons = 0, banes = 0, modifiers = [] } = {}) {
  const dice = testFormula(boons, banes);
  const terms = modifiers
    .filter(m => Number(m.value) !== 0)
    .map(m => (m.value < 0 ? `- ${Math.abs(m.value)}` : `+ ${m.value}`));
  return [dice, ...terms].join(" ");
}
