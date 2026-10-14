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

import { addClassEntry, hostileExposures, poolsFor, removeClassEntry, secondaryLevel, setCharacterLevel } from "../rules/progression.mjs";
import { evaluateAmount, featurePatchesFor, featureTickStamp, featuresFor, raceTraitFor, refreshes, usesMaxFor } from "../rules/class-features.mjs";
import { grantsFor, healBonusFor, healingPatchesFor, passivesFor, patchFeature, patchesFor, spellGrantsFor, talentEffectDiff, wardPierceFor } from "../rules/talent-effects.mjs";
// 02's healing features that name one target, which Divine Providence's chip reaches (D-778).
import { HEALS_ONE_TARGET } from "../rules/class-talents.mjs";
// What the next spell was promised (04's Nature's Grace, Predator's Swiftness;
// D-771), and a heal shared between two partners (04's Symbiosis).
import { NEXT_SPELL_FLAG, pendingNextSpell } from "../rules/casting.mjs";
import { endSymbiosis, shareHealing } from "../effects/symbiosis.mjs";
// The Warrior's and the Paladin's kinds (D-772): what the next attack was
// promised, Wounded Beast's price, Light's Reserve, a heal Mortal Strike blocks,
// Beacon's share, and the schools named at a Long Rest.
import { NEXT_ATTACK_FLAG, pendingNextAttack } from "../rules/next-attack.mjs";
import { BEACON_FLAG, DEATH_MARK_FLAG, PLATE_FLAG, openingFor, restBonusFor, turnStartRestoreFor, woundedBeastTaken } from "../rules/class-talents.mjs";
// What a counter or a charge buys on a roll's own dialog (D-774).
import { CHARGE_FLAG, talentLinesFor } from "../rules/class-talents.mjs";
import { untilEndOfNextTurnOrRound, untilNextTurnOrRound } from "../effects/durations.mjs";
// D-779: the lead's class answers - Shared Quarry's payer, Undying Rage's hold,
// Divine Aegis's Ward and Miracle's heal at the one healing door.
import { companionSpendsFor, undyingRageFor } from "../rules/class-talents.mjs";
import { DEVOURING_PLAGUE, DIVINE_AEGIS, UNDYING_RAGE, aegisChanges, momentumPayer, restoredToFull, undyingRageHold } from "../rules/class-answers.mjs";
// The Mage's and the Warlock's (D-775): Cauterize's catch at the damage door,
// Ruin's two dice on a spell's Critical Injury, and the Long Rest's release of a
// demon Command Demon bound and its lifting of Demonic Sacrifice's lock.
import { SACRIFICED_FLAG, cauterizeFor, cauterizes, ruinFor } from "../rules/class-talents.mjs";
// What holds a target under a Rogue's Opening (04's Overkill and Subterfuge; D-773).
import { openingEntries } from "../effects/talent-states.mjs";
import { healingAfterBlock } from "../rules/no-healing.mjs";
import { shareBeacon } from "../effects/beacon.mjs";
// What a talent spends as part of an attack (D-770): the law the dialog's lines
// and the roll's payment both read through `riderLines`.
import { riderDiscountsOf, ridersFor } from "../rules/riders.mjs";
import { boundOf, releaseAll, releaseAtLongRest, syncBoundFor } from "./bound.mjs";
import { usesAfterRestamp, usesStamp } from "../rules/uses.mjs";
import { fatigueState } from "../rules/fatigue.mjs";
import { gainWhenStruck, unkillableFloor } from "../rules/momentum.mjs";
// What a blow does beyond its target, run from the one damage door (D-768).
import { afterBlow, strikeAround } from "../effects/after-blow.mjs";
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
import { wouldDrop } from "../rules/blow-doors.mjs";
// What another creature does to a blow, asked as it lands (D-777): a blow moved,
// a blow divided, a creature held at 1, and 07's Aegis floor.
import { aegisFloor, askToHold, divideBlow, landShares, redirectBlow } from "../effects/blow-doors.mjs";
// The ONE ally rule, for a door that holds both actors (D-755, D-777).
import { allyOf } from "../canvas/engaged.mjs";
import { restCard } from "../dice/rest-card.mjs";
import { burnTether, longRest, shortRest, turnRefill } from "../rules/rest.mjs";
// What a Short Rest eats and drinks (05 SS16, 08 SS12; D-733).
import { FOOD_KINDS, isProvision, restPicks } from "../rules/provisions.mjs";
import { spendOne } from "../rules/consumables.mjs";

import { AZEROTH } from "../config.mjs";
import { healingReceived } from "../rules/corruption-effects.mjs";
import { heldAugment } from "../rules/augments.mjs";
import { displacedBy } from "../rules/worn.mjs";
// What a character's token looks like before anybody touches it (D-718's
// neighbour; the lead, 2026-09-13).
import { characterTokenPatch } from "../rules/tokens.mjs";
import { grantsOn } from "../rules/grants.mjs";
// A shape is one Active Effect, read here and written by `./shapes.mjs` alone
// (D-769): the physical half, what melds, and what ends it.
import { AVATAR, SHAPE_FLAG, meldsGear, naturalWeapon, physicalHalf, readShape } from "../rules/shapes.mjs";
import { endShapeAt } from "./shapes.mjs";
// What a feature lays on every ally in reach, stamped whole (D-755), and the
// Boons an ally's aura has laid on this creature, named for a card.
import { auraBoonsOn, auraStamp, halvedHealing } from "../rules/auras.mjs";
// The choice a SKIPPED roll dialog makes: every automatic line counted, nothing
// the table judges (D-601). A Long Rest's exposure opens no dialog, so it rolls
// exactly that (D-755's review).
import { defaultChoice } from "../applications/roll-dialog.mjs";

/**
 * Embed a class's talents from the pack: every talent whose `className` is
 * the class item's name, skipping any the actor already holds by identifier
 * (a fixture or a GM may have added some by hand). One create call per
 * grant, so the sheet re-renders once.
 *
 * @param {Actor} actor
 * @param {Item[]} classItems  The class items just created on the actor.
 */
async function grantClassTalents(actor, classItems) {
  const pack = game.packs.get("azeroth-rpg.talents");
  if (!pack || !classItems.length) return;
  const names = new Set(classItems.map(c => c.name));
  const index = await pack.getIndex({ fields: ["system.className", "system.identifier"] });
  const held = new Set(actor.items.filter(i => i.type === "talent").map(i => i.system?.identifier));
  const wanted = index.filter(e => names.has(e.system?.className) && !held.has(e.system?.identifier));
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
      img: race.img,
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
        uses: usesStamp(t.description ?? "")
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
function featureStamp(cls, f, { tier = 1, level = 1 } = {}) {
  // A talent's grant scales its uses by the rank taken (D-642), and a counter
  // *equal to your tier* by the tier (D-768): the scope used to be the rank
  // alone, so Survival Instincts and Lava Burst read tier 1 at every level. A
  // patched class feature's `"rank"` arrives already bound (`bindRank`).
  const rank = f.rank ?? 1;
  const usesMax = usesMaxFor(f.uses, { rank, tier, level });
  return {
    identifier: f.name.slugify(),
    description: f.description,
    source: f.source ?? { document: "02-CHARACTER-OPTIONS", section: cls.name },
    className: cls.name,
    level: f.level,
    kind: f.kind,
    action: f.action ?? null,
    cost: { pool: f.cost?.pool ?? null, amount: f.cost?.amount ?? 0, all: f.cost?.all === true },
    casting: f.casting === true,
    dc: f.dc ?? null,
    uses: { value: usesMax, max: usesMax, per: f.uses?.per ?? null },
    heal: f.heal ?? null,
    damage: { amount: f.damage ? String(f.damage.amount) : null, type: f.damage?.type ?? null },
    resist: f.resist ?? null,
    extraAttack: f.extraAttack === true,
    // The shape the Extra Attack needs (02 §7's Druid, D-769), or null.
    extraAttackIn: f.extraAttackIn ?? null,
    // 02 §7's Sprint (D-712): the Moves this turn that cost no Half-Action.
    freeMove: Math.max(0, Math.trunc(Number(f.freeMove ?? 0)) || 0),
    attack: f.attack === true,
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
      sl: Number.isInteger(i.sl) && i.sl > 0 ? i.sl : null
    })),
    reminder: {
      kinds: f.reminder?.kinds ?? [],
      text: f.reminder?.text ?? "",
      boons: f.reminder?.boons ?? 0,
      banes: f.reminder?.banes ?? 0
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
  }

  /** @inheritDoc */
  prepareBaseData() {
    super.prepareBaseData(); // REQUIRED — see the note above.
    // Subtype work belongs in the DataModel, not here.
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
      schools: s.schools ?? null,
      // **THE FORMS' NAMES, OR NOTHING** (D-769). The old flag object reached
      // a gate as `[object Object]`, so a form named in a gate never held; any
      // shape counts as *in any form they take* (Stormrage Raiment), the
      // Avatar's and Metamorphosis's included - the plan's reading.
      form: this.shape ? this.shape.forms.map(f => f.name) : null,
      health: { value: s.health?.value ?? 0, max: s.health?.max ?? 0 },
      // The three tracks and their scores, or nothing. A creature's keyword is
      // not a score, so it is not one of these.
      corruption: s.corruption && typeof s.corruption === "object" ? s.corruption : null
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

  /** The career item, if one is held. */
  get careerItem() {
    return this.items.get(this.system?.career?.itemId) ?? null;
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
    return { id: effect.id, ...shape, physical: physicalHalf(shape.forms) };
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
   * **THE WEAPONS THIS ACTOR FIGHTS WITH** (D-769): THE ONE ACCESSOR. In a shape
   * whose gear melds - all three do (the lead: *"Melds; Signatures count"*) -
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
    return this.items.filter(i => i.type === "weapon" && i.system?.equipped === true);
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
    if (this.type === "character" && documents.some(d => isEquippedShield(d))) {
      this.syncTalentEffects().catch(err => console.error("azeroth-rpg | talent effects", err));
    }

    const update = {};

    // A career: the newest one is THE career (03 §2, one at a time). The
    // character's, since `system.career` is the character's field.
    const career = this.type === "character" ? documents.findLast(d => d.type === "career") : null;
    if (career && this.system?.career?.itemId !== career.id) {
      update["system.career.itemId"] = career.id;
      update["system.career.tier"] = career.system?.tier ?? 1;
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
        const { powers } = poolsFor([{ ...item.system, itemId: item.id, level }], level);
        const full = powers.find(p => p.itemId === item.id)?.max ?? 0;
        try {
          classes = addClassEntry(classes, { itemId: item.id, level, power: { value: full }, momentum: { value: 0 } });
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

    const linked = Object.keys(update).length ? this.update(update) : Promise.resolve(this);

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
        if (classes.length) grant = grant.then(() => grantClassTalents(this, classes));
        if (race) grant = grant.then(() => grantRaceTalents(this, race));
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
    if (collection !== "items" || game.user.id !== userId) return;

    // A launcher whose bundle left has nothing nocked (D-641).
    const orphaned = this.items.filter(i => i.type === "weapon" && i.system?.ammunition && ids.includes(i.system.ammunition));
    if (orphaned.length) this.updateEmbeddedDocuments("Item", orphaned.map(i => ({ _id: i.id, "system.ammunition": null })));

    // A shield deleted WHILE HELD takes Shield of Faith's Defense with it (D-648,
    // D-768). The deleted documents still carry their data, and the collection
    // no longer holds them, so the sync reads the hand as it now is.
    if (this.type === "character" && documents.some(d => isEquippedShield(d))) {
      this.syncTalentEffects().catch(err => console.error("azeroth-rpg | talent effects", err));
    }

    const update = {};
    const held = this.system?.career?.itemId;
    if (held && ids.includes(held)) {
      const remaining = this.items.find(i => i.type === "career");
      update["system.career.itemId"] = remaining?.id ?? null;
      update["system.career.tier"] = remaining?.system?.tier ?? 1;
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
    }

    if (Object.keys(update).length) this.update(update);
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
      // row disagreed with this one. The stored maximum still wins where the
      // block states it.
      const powerMax = s.power?.max ?? s.powerMax ?? null;
      if (powerMax !== null && powerMax !== undefined) {
        out.push({ itemId: null, kind: "power", name: s.power.name ?? null, value: s.power.value ?? 0, max: powerMax });
      }
      const momentumMax = s.momentum?.max ?? s.momentumMax ?? null;
      if (momentumMax !== null && momentumMax !== undefined) {
        out.push({ itemId: null, kind: "momentum", name: s.momentum.name ?? null, value: s.momentum.value ?? 0, max: momentumMax });
      }
      return out;
    }
    for (const p of s.powers ?? []) out.push({ itemId: p.itemId, kind: "power", name: p.name, value: p.value ?? 0, max: p.max ?? 0 });
    for (const p of s.momenta ?? []) out.push({ itemId: p.itemId, kind: "momentum", name: p.name, value: p.value ?? 0, max: p.max ?? 0 });
    return out;
  }

  /**
   * Write one or more pool values. THE ONLY PLACE `system.classes[]` IS
   * WRITTEN FOR A POOL: the sheet, the workflows and the combat all come
   * through here, so none of them can reach for the legacy `system.power`
   * mirror that `prepareDerivedData` overwrites on the next preparation - which
   * is exactly what the rest handlers used to do, and why a Short Rest never
   * restored the pool the sheet draws.
   *
   * @param {{itemId: string, kind: "power"|"momentum", value: number}[]|object} changes
   * @param {object} [extra]  Other fields to write in the same update.
   */
  async updatePool(changes, extra = {}) {
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
        const max = pool?.max ?? this.system?.[`${kind}Max`] ?? null;
        if (max === null || max === undefined) continue;
        const next = Math.max(0, Math.min(max, Math.trunc(value)));
        if (next !== (pool?.value ?? 0)) update[`system.${kind}.value`] = next;
      }
      return Object.keys(update).length ? this.update(update) : this;
    }
    const snapshot = this.poolSnapshot();
    const classes = (this.system?.classes ?? []).map(c => ({ ...c, power: { ...c.power }, momentum: { ...c.momentum } }));
    let moved = false;
    for (const { itemId, kind, value } of list) {
      const entry = classes.find(c => c.itemId === itemId);
      const pool = snapshot.find(p => p.itemId === itemId && p.kind === kind);
      if (!entry || !pool) continue;
      const next = Math.max(0, Math.min(pool.max, Math.trunc(value)));
      if (next !== (entry[kind]?.value ?? 0)) moved = true;
      entry[kind] = { ...entry[kind], value: next };
    }
    // A write that moves nothing is skipped: the fight's end zeroes twice
    // (before the confirm and again on exit) and the second is silent.
    if (!moved && !Object.keys(extra).length) return this;
    return this.update({ "system.classes": classes, ...extra });
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
    for (const [key, { cls, f, talentId = null, rank = null }] of wanted) {
      const stamp = featureStamp(cls, f, { tier, level });
      const item = held.get(key);
      const flag = { classId: cls.id, name: f.name, ...(talentId ? { talentId, rank } : {}) };
      if (!item) {
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
      const usesChanged = (current.uses?.max ?? 0) !== uses.max || (current.uses?.per ?? null) !== uses.per;
      const rankChanged = talentId !== null && (item.getFlag("azeroth-rpg", "feature")?.rank ?? null) !== rank;
      if (!changed.length && !usesChanged && !rankChanged) continue;
      const value = usesChanged
        ? usesAfterRestamp(current.uses ?? {}, uses.max)
        : (current.uses?.value ?? 0);
      updates.push({
        _id: item.id, name: f.name,
        system: { ...Object.fromEntries(changed.map(k => [k, rest[k]])), uses: { value, max: uses.max, per: uses.per } },
        ...(rankChanged ? { flags: { "azeroth-rpg": { feature: flag } } } : {})
      });
    }

    // "You know Fireball" (D-642): the spell embedded while the talent is
    // taken, flagged with the talent, and withdrawn with it. A spell the
    // character already holds by any other road is left alone.
    const known = spellGrantsFor(taken);
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
    if (doomed.length) await this.deleteEmbeddedDocuments("Item", doomed);
    if (updates.length) await this.updateEmbeddedDocuments("Item", updates);
    if (creates.length) await this.createEmbeddedDocuments("Item", creates);
    // The creatures bound to this character take its talents' effects (D-643),
    // and the character its own passives (D-648).
    await this.syncBound().catch(err => console.error("azeroth-rpg | bound sync", err));
    await this.syncTalentEffects().catch(err => console.error("azeroth-rpg | talent effects", err));
    return { created: creates.length, updated: updates.length, deleted: doomed.length };
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
    const desired = passivesFor(taken, { form, shield: shield && !(shape && meldsGear(shape.kind)), totem });
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
    if (this.type !== "character" || collection !== "items" || game.user.id !== userId) return;
    const moved = documents.some((doc, i) => doc.type === "talent" && foundry.utils.hasProperty(changes[i] ?? {}, "system.taken"));
    if (moved) this.syncClassFeatures();
    // A shield equipped or set down moves Shield of Faith (D-648).
    const worn = documents.some((doc, i) => doc.type === "armor" && (foundry.utils.hasProperty(changes[i] ?? {}, "system.equipped") || foundry.utils.hasProperty(changes[i] ?? {}, "system.shield")));
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
    if (state.slowed && !own && !has("slowed")) {
      await this.toggleStatusEffect("slowed", { active: true });
      const made = this.effects.find(e => e.statuses?.has("slowed"));
      if (made) await made.setFlag("azeroth-rpg", "fromFatigue", true);
    } else if (!state.slowed && own) {
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
    const features = this.items.filter(i => i.type === "feature").map(i => ({ name: i.name }));
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
    const due = this.items.filter(i => i.system?.uses?.per && refreshes(i.system.uses.per, event)
      && i.system.uses.value < i.system.uses.max);
    const updates = due.map(i => ({ _id: i.id, "system.uses.value": i.system.uses.max }));
    const names = due.map(i => i.name);
    // An item's castings refresh on the same clock (D-633).
    for (const item of this.items) {
      const spells = Array.isArray(item.system?.spells) ? item.system.spells : [];
      const stale = spells.filter(s => s.uses?.per && refreshes(s.uses.per, event) && (s.uses.value ?? 0) < (s.uses.max ?? 0));
      if (!stale.length) continue;
      const next = foundry.utils.deepClone(item.system.toObject().spells).map(s =>
        (s.uses?.per && refreshes(s.uses.per, event)) ? { ...s, uses: { ...s.uses, value: s.uses.max } } : s);
      updates.push({ _id: item.id, "system.spells": next });
      names.push(...stale.map(s => `${s.name} (${item.name})`));
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
      names.push(item.name);
    }
    // ONE ENTRY PER DOCUMENT. A piece of gear can carry both a `use` of its
    // own and a Signature, and core takes the last of two rows naming the same
    // `_id` - so the second refill would have silently discarded the first.
    const merged = [...updates.reduce((map, row) => {
      map.set(row._id, { ...(map.get(row._id) ?? {}), ...row });
      return map;
    }, new Map()).values()];
    if (merged.length) await this.updateEmbeddedDocuments("Item", merged);
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
  async shortRest({ food = null, drink = null } = {}) {
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
    let ate = null;
    let drank = null;
    // A CREATURE IS EXEMPT and the code says so where it rests: 14 gives no
    // block rations and states no such condition, so an NPC's rest recovers
    // exactly what it always did (D-733). A character's picks replace this.
    let picks = { eats: true, drinks: true, tierAgain: false };

    if (this.type === "character") {
      // 2. REFUSE BEFORE ANYTHING IS SPENT. Both picks are judged first, so a
      // legal food beside an illegal drink costs the character nothing.
      // A pick that was NAMED and is not this character's is refused by name,
      // before the general refusal: *carrying neither* would be the wrong words
      // for somebody who pointed at another character's ration.
      if (food && !eaten) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Rest.NotFood", { name: food?.name ?? String(food) }));
        return null;
      }
      if (drink && !drunk) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Rest.NotDrink", { name: drink?.name ?? String(drink) }));
        return null;
      }
      if (!eaten && !drunk) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Rest.NeedsProvision", { name: this.name }));
        return null;
      }
      if (eaten && !isProvision(eaten, FOOD_KINDS)) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Rest.NotFood", { name: eaten.name }));
        return null;
      }
      if (drunk && !isProvision(drunk, "drink")) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Rest.NotDrink", { name: drunk.name }));
        return null;
      }
      // 3. What was taken, READ BEFORE THE DELETE: an item spent to nothing is
      // gone by the time the card is written.
      ate = eaten?.name ?? null;
      drank = drunk?.name ?? null;
      picks = restPicks({ foodKind: eaten?.system?.provision ?? null, hasDrink: Boolean(drunk) });
      // 4. One item, one rest, whatever the row says it keeps for. `spendOne`
      // is `useGear`'s own mark-off rule (D-733).
      for (const item of [eaten, drunk]) {
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
      manaExtra: reserve.mana > 0 ? { itemId: reserveClass?.id ?? null, amount: reserve.mana } : null
    });
    if (reserve.mana > 0 && picks.drinks === true) r.gains.push({ kind: "talentMana", name: reserve.by.join(", "), amount: reserve.mana });
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
      const powerMax = power?.max ?? this.system?.powerMax ?? null;
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
    const cleared = await this.clearSundered();
    let count = null;
    if (this.type === "character") {
      count = (this.getFlag("azeroth-rpg", "shortRests") ?? 0) + 1;
      await this.setFlag("azeroth-rpg", "shortRests", count);
    }
    await restCard({ actor: this, kind: "short", gains: r.gains, restored, cleared, count, ate, drank });
    return this;
  }

  /**
   * 05 SS16: a quarter of max plus Constitution - not full; Mana and Focus
   * full; one Fatigue; Resolve refreshed; every limited use back. Diseased
   * (A1) takes the Health and the Fatigue away and the card says so.
   */
  async longRest() {
    // **AN AVATAR OR A METAMORPHOSIS ENDS WITH THE REST** (02 §7, D-769).
    await endShapeAt(this, "long");
    // **AND EVERY TEMPORARY HEALTH IS LOST** (05: *no rest returns it*; the
    // rulings' READING, 2026-10-03, for the lead: lost at a Long Rest whatever its
    // span; D-777).
    await this.endTemporaryHealth({ kind: "longRest" });
    const s = this.system;
    const restBefore = s?.health?.value ?? 0;
    const diseased = this.statuses?.has("diseased") ?? false;
    const r = longRest({
      // *Druid's own Health* (the lead, D-769): the character's own Constitution.
      health: s.health, conMod: s.abilities?.con?.own?.mod ?? s.abilities?.con?.mod ?? 0, tier: s.tier ?? 1, fatigue: s.fatigue ?? 0,
      pools: this.poolSnapshot(), diseased
    });
    // Void's Fatigue does not clear on a Long Rest (10 §5): the floor holds.
    if (this.type === "character") await this.updatePool(r.pools, { "system.health.value": r.health, "system.fatigue": Math.max(r.fatigue, this.system.fatigueFloor ?? 0) });
    else {
      const power = this.system?.power;
      // As the Short Rest above: the stated maximum, else the tier's floor (D-705).
      const powerMax = power?.max ?? this.system?.powerMax ?? null;
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
    // 04's Death Mark (D-773): *Until your next Short or Long Rest*.
    if (this.getFlag("azeroth-rpg", DEATH_MARK_FLAG)) await this.unsetFlag("azeroth-rpg", DEATH_MARK_FLAG);
    // **THE WARLOCK'S** (D-775): a demon Command Demon bound is bound *until your
    // next Long Rest*, and one Demonic Sacrifice dismissed *cannot be summoned
    // again until your next Long Rest*.
    if (this.type === "character") await releaseAtLongRest(this);
    if (this.getFlag("azeroth-rpg", SACRIFICED_FLAG)) await this.unsetFlag("azeroth-rpg", SACRIFICED_FLAG);
    const restored = await this.resetUses("long");
    const cleared = await this.clearSundered();
    if (this.getFlag("azeroth-rpg", "shortRests")) await this.unsetFlag("azeroth-rpg", "shortRests");
    await restCard({ actor: this, kind: "long", gains: r.gains, restored, cleared, diseased });

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
    return this;
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
  async refillTurn() {
    // 04's Adrenaline (D-773): *Your Energy pool returns 1 more per rank at the
    // start of your turn*, beside 05 §12's own refill.
    const extra = this.type === "character" ? turnStartRestoreFor(this.takenTalents()).byPool : {};
    const changes = turnRefill(this.poolSnapshot(), { extra });
    return changes.length ? this.updatePool(changes) : this;
  }

  /* -------------------------------------------- */
  /*  Health changes float off the token                                      */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preUpdate(changed, options, user) {
    const allowed = await super._preUpdate(changed, options, user);
    if (allowed === false) return false;
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
    // the updating client alone, once, after the write has landed.
    if (userId === game.user.id && changed.system?.classes !== undefined && this.type === "character") {
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
   * @param {number} delta
   * @param {{temp?: number|null}} [o]
   */
  async adjustHealth(delta, { temp = null } = {}) {
    const health = this.system?.health;
    if (!health) return this;
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
    if (!Object.keys(update).length) return this;
    const written = await this.update(update);
    if (!("system.health.value" in update)) return written;
    // What 0 Health ended (05 §12, 06 §9; M1) is over before the door that
    // wrote it goes on: `_onUpdate` began it on this client, during the update.
    if (value === 0) await game.system.azeroth.workflows.sustainsEnding(this);
    // An Avatar ended there too (D-769), and is waited for the same way.
    if (value === 0) await this._shapeEnding;
    return written;
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
    const soaked = absorbDamage({ temp: this.system?.health?.temp ?? 0, amount });
    if (soaked.absorbed > 0) ui.notifications?.info(game.i18n.format("AZEROTH.Temporary.Absorbed", { name: this.name, n: soaked.absorbed }));
    const left = await this._floorOnly(soaked.amount);
    return this.adjustHealth(-left, { temp: soaked.temp });
  }

  /**
   * **HEALTH LOST, NOT DAMAGE TAKEN** (A1's Bleeding: *you lose X Health*): no
   * temporary Health is touched (05: *Temporary Health cannot be spent at all*),
   * and 07's Aegis floor - *by any source* - still holds the creature at 1.
   *
   * @param {number} amount
   */
  async loseHealth(amount) {
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
  momentumPayer({ amount = 0 } = {}) {
    const own = this.system?.momenta?.[0] ?? (this.poolSnapshot?.() ?? []).find(p => p.kind === "momentum") ?? null;
    let owner = null;
    let quarry = null;
    if (!own && this.type === "npc") {
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
    const pick = momentumPayer({ own, owner: quarry, shares: Boolean(quarry), amount });
    return pick ? { actor: pick.payer === "own" ? this : owner, pool: pick.pool, shared: pick.payer === "owner" } : null;
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
    return talentLinesFor(talents, {
      roll, school, damages, mana, casting, left, ticks, spell, healing, action,
      charges: Math.max(0, Math.trunc(Number(this.getFlag("azeroth-rpg", CHARGE_FLAG))) || 0),
      tier: this.system?.tier ?? 1
    });
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
  riderLines({ weapon = null, opening = null } = {}) {
    if (this.type !== "character") return [];
    const fight = this.activeFight();
    const combatant = fight ? fight.getCombatantsByActor(this)?.[0] ?? null : null;
    const round = combatant?.getFlag("azeroth-rpg", "round") ?? {};
    const thisRound = Boolean(combatant) && round.number === fight.round;
    const usedThisRound = thisRound ? [...(round.riders ?? [])] : [];
    const primed = thisRound && combatant.isCurrentTurn ? [...(round.primed ?? [])] : [];
    return ridersFor(this.takenTalents(), {
      pools: this.poolSnapshot(),
      form: this.inShapeshiftForm === true,
      weapon,
      // A blow struck WITH a shield needs one in hand (Shield Slam, D-772).
      shield: this.shieldInHand === true,
      // And one at a target under the Opening needs one (Garrote, D-773).
      opening,
      usedThisRound,
      primed,
      activeDiscounts: riderDiscountsOf(this.effects.filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"] ?? {})),
      tier: this.system?.tier ?? 1
    });
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
  pendingNextAttack() {
    return pendingNextAttack(this.getFlag?.("azeroth-rpg", NEXT_ATTACK_FLAG) ?? [], { now: this.fightTurnNow() });
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
    return { combat: fight.id, round: fight.round, combatant: fight.combatant.id };
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
   * The feature a taken talent granted (D-648), found by the talent's id on its
   * flag, or null: Nature's Swiftness's counter, Symbiosis's naming.
   *
   * @param {string|null} talentId
   * @returns {Item|null}
   */
  grantedFeature(talentId) {
    if (!talentId) return null;
    return this.items.find(i => i.type === "feature" && i.getFlag("azeroth-rpg", "feature")?.talentId === talentId) ?? null;
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
   */
  async applyHealing(amount, { from = null, spell = false, feature = false, shared = false, featureName = null, overflow = false, overflowSource = "", aegis = null, unreduced = false } = {}) {
    const before = this.system?.health?.value ?? 0;
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
      healed += healBonusFor(from.takenTalents(), { via: spell ? "spell" : "feature", conditioned }).amount;
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
    const excess = overflow ? overflowTemporary({ before, max: this.system?.health?.max ?? 0, healed }) : 0;
    await this.adjustHealth(healed);
    if (this.type === "character" && before === 0 && (this.system?.health?.value ?? 0) > 0) await this.standUp();
    if (excess > 0) await this.grantTemporaryHealth(excess, { source: overflowSource, span: "longRest" });
    // **04's UNDYING RAGE: A HEAL CANCELS THE FALL** (the lead, 2026-10-03, on O-173:
    // *"Heals cancel the fall."*; D-779): Health restored while the held rounds run
    // takes the effect off with the fall it was counting to, marked so the delete
    // hook knows it was a heal (`effects/undying-rage.mjs`).
    const restoredNow = Math.max(0, (this.system?.health?.value ?? before) - before);
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
    if (!wants && statusId === "prone" && this.type === "character" && !options.free && this.system?.standsFree !== true) {
      if (!(await game.system.azeroth.workflows.spendTurnBudget(this, "half"))) return false;
    }

    if (wants && (this.system?.conditionImmunities ?? []).includes(statusId)) {
      ui.notifications?.info(game.i18n.format("AZEROTH.Corruption.Refused", {
        name: this.name, condition: game.i18n.localize(AZEROTH.conditions?.[statusId] ?? statusId)
      }));
      return false;
    }
    return super.toggleStatusEffect(statusId, options);
  }

  /** A Death Step (06 SS8): the third is the end, said once in chat and nothing more. */
  async takeDeathStep() {
    if (this.type !== "character") return this;
    const steps = Math.min(AZEROTH.DEATH_STEPS, (this.system?.deathSteps ?? 0) + 1);
    await this.update({ "system.deathSteps": steps });
    const key = steps >= AZEROTH.DEATH_STEPS ? "AZEROTH.Combat.DeathStepsOut" : "AZEROTH.Combat.DeathStep";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p class="azeroth-drain">${game.i18n.format(key, { name: this.name, steps, max: AZEROTH.DEATH_STEPS })}</p>`,
      flags: { "azeroth-rpg": { kind: "deathStep", steps } }
    });
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
   */
  async applyDamage(damage, { struck = false, attack = true, location = "body", type = null, messageId = null, by = null, riposte = false, wardTook = 0, spell = false, ignite = false, moved = false, shared = false, parts = null } = {}) {
    let amount = Math.max(0, Math.trunc(damage));
    const before = this.system?.health?.value ?? 0;
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
    if (struck && !moved && !shared && amount > 0) {
      let redirected = { moved: false };
      try {
        redirected = await redirectBlow({ target: this, amount, type, attack, spell, messageId, by, location, parts });
      } catch (err) {
        console.error("azeroth-rpg | blow moved", err);
      }
      if (redirected.moved) return this;
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
    const standing = Math.max(0, Math.trunc(this.system?.damageReduction ?? 0));
    // What the standing reduction took off this blow (D-774): a priest's Ward
    // carrying Shield Discipline's reduction prevented that much (Atonement).
    const beforeStanding = amount;
    if (standing > 0 && amount > 0) amount = Math.max(0, amount - standing);
    const standingTook = beforeStanding - amount;
    // **WOUNDED BEAST'S PRICE** (04: *every attack that damages you deals 1 more
    // damage per rank*; D-772). It was built for the Rating the Warrior deals and
    // never for what an attack on them deals. An ATTACK that still gets through
    // after the mark and the standing reduction - a tick, a hazard and a
    // retaliation are no attack - and read by name, the inline row's own way.
    const woundedRanks = struck && attack ? (this.talentRanks?.("Wounded Beast") ?? 0) : 0;
    if (woundedRanks > 0 && amount > 0) {
      const taken = woundedBeastTaken({ amount, attack: true, ranks: woundedRanks });
      ui.notifications?.info(game.i18n.format("AZEROTH.Card.WoundedBeastTaken", { name: this.name, from: amount, to: taken }));
      amount = taken;
    }
    // **DIVIDED AMONG A SPIRIT LINK** (04's Spirit Link Totem; D-777): what this
    // creature takes is divided evenly among every ally within 20 feet of the
    // totem, no one asked; this creature keeps its share and the remainder, and
    // the others' land once its own Health is written. Judged before anything is
    // written: a share another user's creature takes needs a GM.
    let division = null;
    if (struck && !moved && !shared && amount > 0) {
      try {
        division = divideBlow({ target: this, amount });
      } catch (err) {
        console.error("azeroth-rpg | blow divided", err);
      }
      if (division) amount = division.keep;
    }
    // **05's TEMPORARY HEALTH FIRST** (D-777; the lead: *"raise HP past max as temp
    // hp"*): *Damage comes off temporary Health first, and only what is left over
    // touches your own.* Written beside the Health in the one update below.
    const soaked = absorbDamage({ temp: this.system?.health?.temp ?? 0, amount });
    if (soaked.absorbed > 0) ui.notifications?.info(game.i18n.format("AZEROTH.Temporary.Absorbed", { name: this.name, n: soaked.absorbed }));
    amount = soaked.amount;
    // **THE ONE HOLD AT 1** (D-777): 07's Aegis floor, then the creature's own
    // Unkillable and Cauterize, then another creature's talent, asked in the blow.
    const hold = await this._holdAtOne({ before, amount, attack, struck });
    amount = hold.amount;
    await this.adjustHealth(-amount, { temp: soaked.temp });
    // The others' shares of a divided blow, once this creature's is written.
    if (division) {
      try {
        await landShares({ target: this, plan: division, type, by });
      } catch (err) {
        console.error("azeroth-rpg | blow divided", err);
      }
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
        await this.applyHealing(hold.held.heal, { from: hold.held.holder ?? null, feature: true });
      } catch (err) {
        console.error("azeroth-rpg | guardian spirit", err);
      }
    }
    if (!struck) return this;
    await this._struckBy({ before, amount, location, type, attack, max, shapeKind, by, spell, parts });
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
      await afterBlow({ target: this, before, attacker: by, riposte: riposte === true, attack: attack === true, type, spell: spell === true, ignite: ignite === true });
    } catch (err) {
      console.error("azeroth-rpg | afterBlow", err);
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
    return this;
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
    if (struck && rage) {
      const floor = unkillableFloor({ before, amount, rage: rage.value, holds: this.hasFeature("Unkillable") });
      if (floor.saved) {
        await this.updatePool({ itemId: rage.itemId, kind: "momentum", value: 0 });
        ui.notifications?.info(game.i18n.format("AZEROTH.Combat.Unkillable", { name: this.name }));
        return { amount: floor.amount, held: { kind: "unkillable", name: "Unkillable" } };
      }
    }
    // **04's UNDYING RAGE** (*When reduced to 0 Health, spend all your Rage. You stay at
    // 1 Health for one round per 2 Rage spent, then fall as usual*; D-779): in a
    // started fight, all the Rage spent and an effect counting the rounds to the fall
    // (`effects/class-answers.mjs#undyingFall` lands it; a heal cancels it, `applyHealing`). A hold
    // already counting is not begun again (CLARIFY, O-173: blows in the held rounds).
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
    try {
      const asked = await askToHold({ target: this, before, amount, attack: struck && attack });
      if (asked.held) {
        ui.notifications?.info(game.i18n.format("AZEROTH.BlowDoor.Held", { holder: asked.held.holder?.name ?? "", name: this.name, talent: asked.held.name }));
        return asked;
      }
    } catch (err) {
      console.error("azeroth-rpg | held at 1", err);
    }
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
  async _struckBy({ before, amount, location, type, attack, max, shapeKind = null, by = null, spell = false, parts = null }) {
    const after = this.system?.health?.value ?? 0;
    // Reaching 0 (06 SS8, D-629): Prone, and the Critical Injury the VICTIM
    // rolls; an ATTACK on a character already dying costs a Death Step (06 §9),
    // and a tick is not one (S1).
    if (this.type === "character" && amount > 0) {
      if (before > 0 && after === 0) {
        if (!this.statuses?.has("prone")) await this.toggleStatusEffect("prone", { active: true });
        // **RUIN** (04: *When one of your spells inflicts a Critical Injury, roll
        // twice on the table and take the higher result. At rank 2 you also gain 2
        // Mana*; D-775): a SPELL's blow that took this creature to 0 inflicts it.
        // Guarded one by one (the final review of D-768 to D-775): a throw here
        // must not skip what the blow does beyond the target (`afterBlow`, the
        // Ward's `afterWardedBlow`), which runs after this.
        const ruin = spell && typeof by?.takenTalents === "function" ? ruinFor(by.takenTalents()) : null;
        try {
          await game.system.azeroth.workflows.rollCriticalInjury({ actor: this, location, higher: ruin?.higher === true ? ruin.name : null });
        } catch (err) {
          console.error("azeroth-rpg | critical injury at 0", err);
        }
        try {
          if (ruin?.mana > 0) await game.system.azeroth.workflows.ruinMana(by, ruin);
        } catch (err) {
          console.error("azeroth-rpg | ruin", err);
        }
        // **THE AVATAR'S PRICE** (02 §7, D-769): *If you are reduced to 0 Health
        // while in this form, you take an additional Critical Injury and start
        // dying.* The shape it was in when the blow landed, since 0 ends it.
        if (shapeKind === "avatar") {
          for (let i = 0; i < AVATAR.extraCriticalInjuries; i++) {
            try {
              await game.system.azeroth.workflows.rollCriticalInjury({ actor: this, location });
            } catch (err) {
              console.error("azeroth-rpg | the Avatar's critical injury", err);
            }
          }
        }
      } else if (before === 0 && attack) {
        await this.takeDeathStep();
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
    const gains = gainWhenStruck({ pools: this.poolSnapshot(), damage: amount, enrageRanks: this.talentRanks?.("Enrage") ?? 0 });
    // Reckoning (04): reduced below half Health, gain 5 Zeal a rank.
    const reckoning = this.talentRanks?.("Reckoning") ?? 0;
    if (reckoning > 0 && before >= max / 2 && after < max / 2) {
      const zeal = this.poolSnapshot().find(p => p.kind === "momentum" && p.name === "zeal");
      if (zeal) gains.push({ itemId: zeal.itemId, kind: "momentum", name: "zeal", value: Math.min(zeal.max, zeal.value + 5 * reckoning) });
    }
    if (gains.length) await this.updatePool(gains.map(g => ({ itemId: g.itemId, kind: g.kind, value: g.value })));
    return this;
  }
}
