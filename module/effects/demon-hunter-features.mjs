/**
 * **THE DEMON HUNTER'S CLASS FEATURES, AS DOORS** (02 §7; the Demon Hunter plan's Phase 4a, D-1520 to
 * D-1529). The law is `rules/demon-hunter-features.mjs` and `rules/hatred.mjs`; this module is the ONE
 * writer for what the features do:
 *
 * - **A Use is judged before anything is paid and landed once it is** (D-768): `judgeDemonHunterUse` from
 *   `workflows.useFeature`'s judgement step and `landDemonHunterUse` after its payment, as the Sovereign's
 *   doors are. Beyond Limits, Hunter's Leap, Demon Unleashed and I Have Prepared.
 * - **What a hit does** (`demonHunterOnHit`, from `rollTest` beside the Sovereign's): Bane of the Legion's
 *   damage and its mark, Fel Lash's Fel damage and the Fel it takes off, Mana Rend's Power lost and its
 *   Fel, and the record of who the hunter has struck this round (Devour Soul's *a creature you damaged
 *   this round*).
 * - **Devour Soul is offered on the death watch** (`effects/death-watch.mjs`, the ONE observer): a card with
 *   a button for the hunter's owner, judged again at the press (`devourFromCard`).
 * - **Beyond Limits' fifth choice** is offered after the die, at the Test's seam (`offerBeyondLimits`, asked by
 *   `AzerothActor#offerElunesRegard` on a Body or Reflex Resilience Test the door stamped; D-1724).
 * - **Spectral Sight** writes the token's sight (`syncSpectralSight`), on the active GM's client.
 * - **Every pool write goes through `pool-writes.mjs#adjustPool` with a named Hatred source** (`limit`,
 *   `devour`, `rend`, `prepared`), and the Fel Lash's shed through `workflows.reduceCorruption`, the ONE
 *   lowerer of a track besides the rite. A write on a creature this client does not own asks the GM
 *   through `DH_FEATURES_QUERY`, with `gm-writes.mjs#gmAbsentFor` asked first.
 *
 * C8 (the lead: *"Having a spell or feature prevent death goes against this"*): nothing here holds the
 * hunter above 0. `demon-hunter-features.test.mjs` reads this file for a hold.
 */

import {
  BANE_OF_THE_LEGION, BEYOND_LIMITS, DEMON_UNLEASHED, DEVOUR_SOUL, FEL_LASH, HUNTERS_LEAP, I_HAVE_PREPARED, MANA_REND,
  QUIET_THE_WHISPERS, SIGHT_MARK, SPECTRAL_SIGHT, baneDamage, baneReaches, beyondLimitsLays, beyondLimitsRefusal, demonsSensed,
  beyondLimitsWorth, devourHatred, devourHeal, devourRefusal, dhPoolIn, featureQueryRefusal, felLashClockSpent, felLashDamage, felLashShed, holdsManaOf,
  huntersLeapFeet, manaRendPlan, markStruck, movesSpectralSight, pickUpRefusal, preparedEndFel, preparedOf, quietWhispersDC, quietWhispersRolls,
  sightChanges, sightWithdrawn, spectralSightFeet, spectralSightPatch, struckThisRound, unleashedGainRefusal, unleashedRefusal,
  unleashedRounds
} from "../rules/demon-hunter-features.mjs";
import { awayOf } from "../rules/demon-hunter-spells.mjs";
import { NO_DURATION } from "../rules/shapes.mjs";
import { AZEROTH } from "../config.mjs";
import { FEL_READ_AS_FLAG, HATRED, featureFel, felFor, heldFel } from "../rules/hatred.mjs";
import { creatureSnapshot, kindsOf } from "../rules/creature-kinds.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { turnMark } from "../rules/class-answers.mjs";
// 04's talents on these features (the Demon Hunter plan's Phase 5): the patches on Fel Lash, Devour Soul, Demon
// Unleashed, Hunter's Leap and Beyond Limits (`patchRowsOf`), read here and landed by the talents' own doors.
import { patchRowsOf } from "../rules/class-talents.mjs";
import { equipResyncs, itemPatchSum, patchesFeature } from "../rules/item-patches.mjs";
import { talentEffect } from "../rules/talent-effects.mjs";
import { unleashedTalents } from "../rules/demon-hunter-talents.mjs";
import {
  afterDevour, afterHuntersLeap, bargainChoice, devourProfileOf, dhTalentsOnHit, feastChoice, freeDevourFor, hoardChoice,
  afterDevourRefusal, judgeDhTalentUse, keepSoul, landDhTalentUse, lashTalentsFor, lashTalentsLand, spendFreeDevour, steadyFooting,
  tearLands
} from "./demon-hunter-talents.mjs";

/** The query every write on another client's creature is asked through (`module/queries.mjs`). */
export const DH_FEATURES_QUERY = "azeroth-rpg.demonHunterFeatures";

/** The chat card Devour Soul's offer posts (`templates/chat/dh-offer.hbs`). */
const OFFER_TEMPLATE = "systems/azeroth-rpg/templates/chat/dh-offer.hbs";

/** The flag the offer card carries. */
export const DH_OFFER_KIND = "dhOffer";

const SCOPE = "azeroth-rpg";
const int = v => Math.trunc(Number(v)) || 0;
const values = c => [...(c?.values?.() ?? c ?? [])];
const t = (key, data = {}) => globalThis.game?.i18n?.format?.(key, data) ?? key;
const get = uuid => { try { return uuid ? fromUuidSync(uuid) : null; } catch { return null; } };
const now = () => Number(globalThis.game?.time?.worldTime) || 0;
const tierOf = actor => Math.min(4, Math.max(1, int(actor?.system?.tier) || 1));
const modOf = (actor, key) => int(actor?.system?.abilities?.[key]?.mod);
const tokenOf = actor => actor?.getActiveTokens?.(true)?.[0] ?? null;
const docOf = token => token?.document ?? token ?? null;

/** Whether an actor holds a class feature by name. */
export const holds = (actor, name) => Boolean(actor?.items?.some?.(i => i.type === "feature" && i.name === name));

/** Whether an actor is a Demon Hunter (holds the class). */
export const isDemonHunter = actor => Boolean(actor?.items?.some?.(i => i.type === "class" && (i.system?.identifier === "demon-hunter" || i.name === "Demon Hunter")));

/** Whether the hunter stands in Demon Unleashed's shape. */
export const isUnleashed = actor => actor?.shape?.kind === DEMON_UNLEASHED.kind;

/** Whether this client must ask a GM to write on `actor` and none is online (D-774). */
const noGM = actor => gmAbsentFor({ owned: [actor?.isOwner === true], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });

/** A refusal in words: the Use ends with nothing paid. */
function refuse(key, data = {}) {
  ui.notifications?.warn(t(key, data));
  return null;
}

/** The actor's combatant in its started fight, or null. */
function combatantOf(actor) {
  const fight = actor?.activeFight?.() ?? null;
  return fight?.started ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
}

/** The round's once-marks of a combatant this round. */
function usedOf(combatant) {
  const fight = combatant?.combat ?? null;
  const r = combatant?.getFlag?.(SCOPE, "round") ?? {};
  return r.number === fight?.round ? [...(r.once ?? [])] : [];
}

/** The creature kinds of an actor, through the one reader (`creature-kinds.mjs#kindsOf`). */
export function kindsOfActor(actor) {
  if (!actor) return new Set();
  const race = actor.type === "character" ? (actor.items?.find?.(i => i.type === "race")?.name ?? null) : null;
  const classes = actor.type === "character" ? (actor.items?.filter?.(i => i.type === "class") ?? []).map(i => i.system?.identifier ?? i.name) : null;
  return kindsOf(creatureSnapshot({ type: actor.type, system: actor.system, race, classes }));
}

/**
 * **WHAT A CREATURE'S MANA IS READ OFF** (the review's H2; `rules/demon-hunter-features.mjs#realPowerOf`): its pools,
 * the Power maximum its block STATES (`_source`, never the derived floor), its Spells line and the spells given it.
 */
export function manaFactsOf(actor) {
  return {
    type: actor?.type ?? "npc", pools: actor?.poolSnapshot?.() ?? [],
    statedPowerMax: actor?._source?.system?.power?.max ?? null,
    spellNames: actor?.system?.spells?.names ?? [], spellDC: actor?.system?.spells?.dc ?? null,
    spellItems: (actor?.items?.filter?.(i => i.type === "spell") ?? []).length
  };
}

/** Whether an actor holds Mana (a creature's Power pool is its Mana, D-692's ruling) - a real one, never the floor (H2). */
export function holdsMana(actor) {
  return holdsManaOf(manaFactsOf(actor));
}

/** The Demon Hunter class item an actor holds, or null. */
export function dhClassItem(actor) {
  return actor?.items?.find?.(i => i.type === "class" && (i.system?.identifier === "demon-hunter" || i.name === "Demon Hunter")) ?? null;
}

/**
 * **THE DEMON HUNTER'S OWN POOL** (the review's M2; for Energy, the ONE pool a Demon Hunter shares with a Rogue or a
 * Chromatic Champion, D-1723): the pool of that kind and name the class item holds or is a member of (`dhPoolIn`),
 * else the first.
 */
export function dhPoolOf(actor, kind = "power", name = "energy") {
  return dhPoolIn(actor?.poolSnapshot?.() ?? [], { kind, name, classId: dhClassItem(actor)?.id ?? null });
}

/** Whether an actor is Sustaining a spell. */
const sustaining = actor => (actor?.getFlag?.(SCOPE, "sustaining") ?? []).length > 0;

/**
 * **A SPACE PICKED WITHOUT THE BOARD** (the Quench batch's seam, as `setSovereignPick` is the
 * Sovereign's): a function answering `{x, y}` in canvas pixels for Hunter's Leap, or null for the board.
 */
let pickOverride = null;
export function setDemonHunterPick(fn = null) {
  pickOverride = typeof fn === "function" ? fn : null;
}

/** The seam as it stands, for a leap another door makes (04's Kill After Kill, `effects/demon-hunter-talents.mjs`). */
export function demonHunterPick() {
  return pickOverride;
}

/* ------------------------------------------------------------------ */
/*  Hatred                                                              */
/* ------------------------------------------------------------------ */

/**
 * **GAIN HATRED THROUGH ITS NAMED DOOR** (`named-gains.mjs#HATRED_GAIN_SOURCES`): one delta inside the pool
 * queue, refused while unleashed (02: *you gain no Hatred*) except I Have Prepared's own fill. Answers what
 * moved and a line for the card.
 *
 * @param {Actor} actor
 * @param {number} amount
 * @param {string} source  a `HATRED_GAIN_SOURCES` word
 * @returns {Promise<{gained: number, line: string|null}>}
 */
export async function gainHatred(actor, amount, source) {
  const n = Math.max(0, int(amount));
  const pool = (actor?.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === HATRED) ?? null;
  if (!pool || n === 0) return { gained: 0, line: null };
  if (unleashedGainRefusal({ unleashed: isUnleashed(actor), source, before: pool.value, after: pool.value + n })) {
    return { gained: 0, line: t("AZEROTH.DemonHunter.NoGainUnleashed", { name: actor.name }) };
  }
  const { adjustPool } = await import("../documents/pool-writes.mjs");
  const moved = await adjustPool(actor, { kind: "momentum", name: HATRED }, n, { options: { hatredGain: source } });
  // What was WRITTEN (the review's C9): a refused rise gains nothing and says so.
  const gained = Math.max(0, int(moved.after) - int(moved.before));
  if (moved.reason === "refused") return { gained: 0, line: t("AZEROTH.DemonHunter.NoGainUnleashed", { name: actor.name }) };
  return { gained, line: t("AZEROTH.DemonHunter.HatredGained", { name: actor.name, n: gained }) };
}

/* ------------------------------------------------------------------ */
/*  A Use, judged before anything is paid                               */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A DEMON HUNTER'S USE NEEDS, ASKED BEFORE ANYTHING IS PAID** (D-768's order): the turn's once and
 * the choice (Beyond Limits), the space (Hunter's Leap), the Hatred held (Demon Unleashed), a standing
 * minute (I Have Prepared: a Use while it stands ends it for nothing). Null refuses the Use, said in words.
 *
 * @returns {Promise<object|null>}  the plan `landDemonHunterUse` lands, `{key}` and what it read
 */
export async function judgeDemonHunterUse({ actor, item, onUse = {}, list = [], rank = 1 } = {}) {
  const dh = onUse?.dh ?? {};
  const name = item?.name ?? "";
  // **04's TALENTS' USES** (the Demon Hunter plan's Phase 5): Taste of Power, Gift of the Skull, Chaos Blast,
  // Glaive Ward and Silence the Weave, judged by their own door (`effects/demon-hunter-talents.mjs`).
  if (dh.talent) return judgeDhTalentUse({ actor, item, onUse, rank, list });
  // **02's DEVOUR SOUL** is offered on the death watch, never pressed from the sheet.
  if (dh.offered) return refuse("AZEROTH.DemonHunter.Offered", { name });
  if (dh.limits) return judgeLimits(actor, item, list);
  if (dh.leap) return judgeLeap(actor, item);
  if (dh.unleash) {
    const pool = (actor.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === HATRED) ?? null;
    const refused = unleashedRefusal({ held: pool?.value ?? 0, unleashed: isUnleashed(actor) });
    if (refused) return refuse(`AZEROTH.DemonHunter.Unleashed.Refuse.${refused}`, { name });
    // **04's BETRAYER'S BARGAIN** (*you may make it last until you finish a Short Rest*): asked here, before the
    // Hatred is spent, off the patch on Demon Unleashed; a dismissed chooser makes no Use.
    const talents = unleashedTalents(patchRowsOf(actor.takenTalents?.() ?? [], DEMON_UNLEASHED.feature, talentEffect));
    const deal = await bargainChoice(actor, item, talents.bargain);
    if (!deal) return null;
    return { key: "unleash", spent: int(pool.value), bargain: deal.bargain ? talents.bargain : null };
  }
  if (dh.prepared) {
    // *You may also end it on your turn at no cost*: a Use while the minute stands ends it, paying nothing.
    if (preparedCarrier(actor)) {
      await endPrepared(actor, { reason: "choice" });
      return null;
    }
    // The once-a-Long-Rest use, asked here once the door knows the Use begins the minute (`usesAskedLater`).
    if (item?.system?.uses?.per && (item.system.uses.value ?? 0) <= 0) return refuse("AZEROTH.Feature.NoUses", { name });
    return { key: "prepared", from: heldFel(actor) };
  }
  return refuse("AZEROTH.DemonHunter.Unknown", { name });
}

/**
 * Beyond Limits, judged: the turn's once, the choice through the one chooser (its fifth greyed, said in
 * words: it is the Resilience Test's own line), and the creature the third choice spares.
 */
async function judgeLimits(actor, item, list) {
  const fight = actor.activeFight?.() ?? null;
  const mine = combatantOf(actor);
  const mark = mine ? turnMark(BEYOND_LIMITS.identifier, fight.turn, usedOf(mine)) : null;
  const refused = beyondLimitsRefusal({ inFight: Boolean(mine), used: usedOf(mine), mark: mine ? `${BEYOND_LIMITS.identifier}@${fight.turn}` : null, lastAt: actor.getFlag?.(SCOPE, BEYOND_LIMITS.clockFlag) ?? null, now: now() });
  if (refused) return refuse(`AZEROTH.DemonHunter.BeyondLimits.Refuse.${refused}`, { name: item.name });
  // **THE FIFTH CHOICE IS NOT ON THIS CHOOSER** (D-1724): *add 2 to a Body or Reflex Resilience Test after you roll it
  // and see the result* is offered at the Test's own after-the-die seam (`offerBeyondLimits`), greyed here and said in
  // words, so the chooser still lists 02's five.
  const options = BEYOND_LIMITS.choices.map(key => ({
    key, name: t(`AZEROTH.DemonHunter.BeyondLimits.Choice.${key}`, { feet: BEYOND_LIMITS.feet, n: BEYOND_LIMITS.resilience }),
    description: key === "resilience" ? t("AZEROTH.DemonHunter.BeyondLimits.AfterTheTest") : "",
    available: key !== "resilience"
  }));
  const pick = await game.system.azeroth.workflows.chooseOption(item, options, null, { prompt: t("AZEROTH.DemonHunter.BeyondLimits.Prompt", { name: item.name }) });
  if (!pick || pick.key === "resilience") return null;
  let spare = null;
  if (pick.key === "noOpportunity") {
    const { targetActorOf } = await import("../dice/annotate.mjs");
    const aimed = (list ?? []).map(row => ({ row, actor: targetActorOf(row) })).filter(r => r.actor && r.actor !== actor);
    if (aimed.length !== 1) return refuse("AZEROTH.DemonHunter.BeyondLimits.OneCreature", { name: item.name });
    spare = { actorUuid: aimed[0].actor.uuid, tokenId: aimed[0].row?.tokenId ?? null, name: aimed[0].row?.name ?? aimed[0].actor.name };
  }
  return { key: "limits", choice: pick.key, spare, mark, inFight: Boolean(mine) };
}

/**
 * Hunter's Leap, judged: the feet off the Dexterity modifier, and the space picked now (a press farther
 * refused in words and the pick kept open, a pick dismissed costing nothing). A hunter with no token on the
 * viewed scene leaps at the table's word, said on the card.
 */
async function judgeLeap(actor, item) {
  const feet = huntersLeapFeet(modOf(actor, "dex"));
  const own = docOf(tokenOf(actor));
  if (!own?.parent || own.parent.id !== globalThis.canvas?.scene?.id) return { key: "leap", feet, skipped: true };
  const { judgeStep, pickStep, stepWords } = await import("./steps.mjs");
  if (pickOverride) {
    const point = await pickOverride({ actor, feet, token: own });
    if (!point) return null;
    const judged = judgeStep(own, point, { feet, sight: "see" });
    if (judged.refusal) return refuse(stepWords(judged.refusal, { name: own.name ?? actor.name, feet }));
    return { key: "leap", feet, doc: own, to: judged.to };
  }
  const picked = await pickStep(own, { feet, sight: "see", name: own.name ?? actor.name });
  if (!picked) return null;
  return { key: "leap", feet, doc: own, to: picked.to };
}

/* ------------------------------------------------------------------ */
/*  A Use, landed once it is paid for                                   */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A DEMON HUNTER'S USE DOES, NOW THAT IT IS PAID FOR**: the lines its card prints.
 *
 * @returns {Promise<string[]>}
 */
export async function landDemonHunterUse({ actor, item, plan } = {}) {
  const lines = [];
  if (!plan?.key) return lines;
  switch (plan.key) {
    case "limits": lines.push(...await landLimits(actor, item, plan)); break;
    case "leap": lines.push(...await landLeap(actor, item, plan)); break;
    case "unleash": {
      const done = await takeUnleashed(actor, { spent: plan.spent, bargain: plan.bargain ?? null });
      // 04's Betrayer's Bargain says on the card how long the shape lasts, its Fel, and the GM's hostility (C28).
      if (done && plan.bargain) lines.push(t("AZEROTH.DemonHunter.Talent.Bargain.Taken", { name: actor.name, n: plan.bargain }), t("AZEROTH.DemonHunter.Talent.Bargain.Hostile"));
      else lines.push(done ? t("AZEROTH.DemonHunter.Unleashed.Taken", { name: actor.name, n: done.rounds, spent: plan.spent }) : t("AZEROTH.DemonHunter.Unleashed.NotTaken", { name: actor.name }));
      break;
    }
    case "prepared": lines.push(...await startPrepared(actor, plan)); break;
    // 04's talents' Uses (Phase 5), landed by their own door.
    case "talent": lines.push(...await landDhTalentUse({ actor, item, plan })); break;
    default: break;
  }
  return lines;
}

/** The span a Beyond Limits choice lasts: the rest of the turn, or a round of the world's clock out of a fight. */
async function turnSpan(actor) {
  const { untilEndOfTurn, clockRounds } = await import("./durations.mjs");
  return untilEndOfTurn(actor) ?? clockRounds(1);
}

/**
 * Beyond Limits, landed: the turn's once marked first (a second press finds it marked and gains nothing), the
 * choice laid on the hunter for the turn, and 1 Hatred through its named door.
 */
async function landLimits(actor, item, plan) {
  const lines = [];
  const mine = combatantOf(actor);
  if (mine && plan.mark) {
    const marked = await mine.markRoundOnce(plan.mark);
    if (marked?.added !== true) return [t("AZEROTH.DemonHunter.BeyondLimits.Refuse.turn", { name: item.name })];
  } else if (!mine) await actor.setFlag(SCOPE, BEYOND_LIMITS.clockFlag, now());
  const lays = beyondLimitsLays(plan.choice, { spare: plan.spare });
  if (lays) {
    const span = await turnSpan(actor);
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: `${item.name}: ${t(`AZEROTH.DemonHunter.BeyondLimits.Choice.${plan.choice}`, { feet: BEYOND_LIMITS.feet, n: BEYOND_LIMITS.resilience })}`,
      img: item.img || "icons/svg/wingfoot.svg", origin: actor.uuid, ...span,
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      system: { changes: lays.changes },
      flags: { [SCOPE]: { ...lays.flags, beyondLimits: { choice: plan.choice } } }
    }]);
  }
  lines.push(t(`AZEROTH.DemonHunter.BeyondLimits.Landed.${plan.choice}`, { name: actor.name, feet: BEYOND_LIMITS.feet, target: plan.spare?.name ?? "" }));
  const gain = await gainHatred(actor, BEYOND_LIMITS.gain, "limit");
  if (gain.line) lines.push(gain.line);
  // **04's STEADY FOOTING** (*Whichever Beyond Limits choice you make, it also ends Slowed and Entangled on you*).
  const steady = await steadyFooting(actor);
  if (steady) lines.push(steady);
  return lines;
}

/** Hunter's Leap, landed: the step door's displacement, which meters no foot and provokes nothing. */
async function landLeap(actor, item, plan) {
  if (plan.skipped) return [t("AZEROTH.DemonHunter.Leap.Table", { name: actor.name, feet: plan.feet })];
  const { stepTo, steppedWords } = await import("./steps.mjs");
  const moved = await stepTo({ token: plan.doc, to: plan.to, feet: plan.feet, by: actor, move: { kind: "self", itemUuid: item.uuid } });
  // The step as the Use's card records it (Phase 6, D-1580): `useFeature` puts it on the card, so the leap's
  // landing plays where the hunter came down (`rules/demon-hunter-animations.mjs`, `hunters-leap`'s arrive).
  if (moved.step) plan.step = moved.step;
  // **04's FALL UPON THEM** (*When you finish a Hunter's Leap while you are in the demon's shape*): the landing's
  // Tests, posted by the talents' door off the patch on Hunter's Leap.
  return [steppedWords(moved, { feet: plan.feet, source: item.name }), ...await afterHuntersLeap(actor, { doc: plan.doc, to: plan.to })];
}

/* ------------------------------------------------------------------ */
/*  Demon Unleashed                                                     */
/* ------------------------------------------------------------------ */

/** The Demon Unleashed plate (`assets/art/classes/full/`), shown as the effect's own art. */
const UNLEASHED_ART = "systems/azeroth-rpg/assets/art/classes/icon/demon-hunter.png";

/**
 * **TAKE DEMON UNLEASHED'S SHAPE** (02 §7): an overlay form with no block (`rules/shapes.mjs
 * #SHAPE_KINDS.unleashed`) - the hunter's own statistics, the 2 Armor Points and the refused conditions on
 * the effect, Ward 2 against Fel on the shape - for 1 round a Hatred spent (the fight's rounds, or the
 * world's clock out of one: Q13, usable out of a fight), or for a span the caller names (I Have Prepared's
 * minute). Answers `{rounds}`, or null where the shape could not be written.
 *
 * @param {Actor} actor
 * @param {{spent?: number, span?: object|null, prepared?: boolean}} [o]
 */
export async function takeUnleashed(actor, { spent = 0, span = null, prepared = false, bargain = null } = {}) {
  const { takeShape } = await import("../documents/shapes.mjs");
  const form = {
    uuid: null, name: DEMON_UNLEASHED.feature, abilities: { str: null, dex: null, con: null }, defense: null,
    ap: { body: null, head: null, limb: null }, speed: null, flies: false, movementSenses: [],
    size: actor.system?.size ?? "medium", tier: 4, attacks: [], token: null, portrait: null
  };
  // **04's ETERNAL HUNGER** (*adds 1 more to your Damage Rating per rank and lasts 1 more round per rank*), off the
  // patch on Demon Unleashed (`patchRowsOf`): the Damage Rating the shape carries as `more`, the rounds added.
  const talents = unleashedTalents(patchRowsOf(actor.takenTalents?.() ?? [], DEMON_UNLEASHED.feature, talentEffect));
  const shaped = await takeShape(actor, { kind: DEMON_UNLEASHED.kind, forms: [form], ward: { ...DEMON_UNLEASHED.ward }, more: talents.damage || null });
  if (!shaped) return null;
  const rounds = unleashedRounds(spent, { more: talents.rounds });
  const { roundsOrClock } = await import("./durations.mjs");
  // **04's BETRAYER'S BARGAIN** (*until you finish a Short Rest*): no span; the rest that ends the shape ends it
  // (`SHAPE_KINDS.unleashed.endsAt`), and its end lands the Fel (`effects/demon-hunter-talents.mjs#bargainEnded`).
  const lasts = bargain ? null : (span ?? roundsOrClock(actor, rounds));
  const effect = actor.effects.get(shaped.id) ?? shaped;
  // `winged` (Phase 6, D-1580): the wings 02 gives at Fel 10 or more, read at the take through the Fel a threshold
  // reads (`featureFel`, 20 while I Have Prepared lasts, never Embrace the Pain's 5 more: the review's M1), so the shape's standing picture draws them
  // (`rules/demon-hunter-animations.mjs#UNLEASHED_WINGED_STATE`). The flying pace itself is still read each
  // preparation (`demon-hunter-features.mjs#unleashedFlying`).
  // And 04's Wings of the Betrayer, which gives the shape wings whatever the Fel (Phase 5).
  const winged = featureFel(actor) >= DEMON_UNLEASHED.wingsAt || (actor.takenTalents?.() ?? []).some(x => x.identifier === "wings-of-the-betrayer" && x.taken > 0);
  // **THE SPAN AND THE FLAG, WRITTEN WHOLE** (the review's H3): a Bargain's shape lasts until the rest, so its
  // duration is cleared explicitly (a shape written in place keeps nothing of the one before, `shapes.mjs
  // #shapeRewriteReset`); the flag names `bargain` only for a Bargain, so I Have Prepared never inherits one.
  const span2 = lasts?.duration ? { duration: lasts.duration, start: lasts.start ?? effect.start } : (bargain ? { duration: { ...NO_DURATION }, start: null } : {});
  await effect.update({ img: UNLEASHED_ART, ...span2,
    [`flags.${SCOPE}.unleashed`]: { prepared: prepared === true, winged, bargain: bargain ? true : null, bargainFel: bargain || null } });
  return { rounds: bargain ? null : rounds, effect };
}

/* ------------------------------------------------------------------ */
/*  I Have Prepared                                                     */
/* ------------------------------------------------------------------ */

/** I Have Prepared's carrier: the effect whose end is the minute's end. */
export function preparedCarrier(actor) {
  return values(actor?.effects).find(e => e.flags?.[SCOPE]?.[I_HAVE_PREPARED.flag]) ?? null;
}

/**
 * **I HAVE PREPARED, BEGUN** (02 §7): the Fel held now recorded for the end's cost; the features and talents
 * read Fel as 20 (`felReadAs`, read by `hatred.mjs#felFor` and `featureFel` alone); Hatred fills to 13 under its own source;
 * Demon Unleashed's shape for the minute without spending Hatred; and the carrier whose deletion ends it all -
 * the minute's end, 0 Health (`registerDemonHunterFeatures`), the hunter's own Use, a GM's hand.
 */
async function startPrepared(actor, plan) {
  const lines = [];
  const from = Math.max(0, int(plan.from));
  const { minuteSpan } = await import("./durations.mjs");
  const span = minuteSpan(actor, I_HAVE_PREPARED.minutes);
  // **THE CARRIER FIRST, THEN THE FLAG** (the review's L13): the carrier's deletion is what ends the minute and
  // unsets `felReadAs`, so the flag is never written without a carrier standing to take it away again.
  const [carrier] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: I_HAVE_PREPARED.feature, img: UNLEASHED_ART, origin: actor.uuid, ...(span ?? {}),
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    description: `<p>${foundry.utils.escapeHTML(t("AZEROTH.DemonHunter.Prepared.Text", { from, fel: preparedEndFel(from) }))}</p>`,
    flags: { [SCOPE]: { [I_HAVE_PREPARED.flag]: { from } } }
  }]);
  if (!carrier) return [t("AZEROTH.DemonHunter.Unleashed.NotTaken", { name: actor.name })];
  await actor.update({ [`flags.${SCOPE}.${FEL_READ_AS_FLAG}`]: I_HAVE_PREPARED.readAs });
  lines.push(t("AZEROTH.DemonHunter.Prepared.Begun", { name: actor.name, from, fel: preparedEndFel(from) }));
  // *Your Hatred fills to 13*: the cap is 13 now that Fel reads 20.
  const pool = (actor.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === HATRED) ?? null;
  if (pool) {
    const gain = await gainHatred(actor, Math.max(0, I_HAVE_PREPARED.hatred - int(pool.value)), "prepared");
    if (gain.line) lines.push(gain.line);
  }
  const shaped = await takeUnleashed(actor, { spent: 0, span, prepared: true });
  if (!shaped) lines.push(t("AZEROTH.DemonHunter.Unleashed.NotTaken", { name: actor.name }));
  return lines;
}

/** The ends in flight on this client, so the carrier's deletion and a Use never end it twice. */
const ENDING = new Set();

/**
 * **I HAVE PREPARED, ENDED** (02 §7: *When it ends, you gain Fel Corruption ... Then you lose all your
 * Hatred*): the carrier deleted where it stands, Fel read as itself again, half of (20 minus the Fel held
 * when it was used) gained with no Test (`workflows.accrueCorruption`), the Hatred emptied, and the shape the
 * minute gave left. Run once, on the client that ends it or answers for the hunter.
 *
 * @param {Actor} actor
 * @param {{reason?: string, from?: number|null}} [o]
 */
export async function endPrepared(actor, { reason = "end", from = null } = {}) {
  if (!actor || ENDING.has(actor.uuid)) return null;
  ENDING.add(actor.uuid);
  try {
    const carrier = preparedCarrier(actor);
    const start = from ?? preparedOf(carrier?.flags?.[SCOPE]?.[I_HAVE_PREPARED.flag])?.from ?? null;
    if (carrier && actor.effects.has(carrier.id)) await actor.deleteEmbeddedDocuments("ActiveEffect", [carrier.id], { azerothPrepared: true });
    // Fel reads as itself again BEFORE anything else is asked (the review's L13): a flag left standing with no
    // carrier would hold every feature at 20 for good.
    if (actor.getFlag(SCOPE, FEL_READ_AS_FLAG) !== undefined) await actor.unsetFlag(SCOPE, FEL_READ_AS_FLAG);
    if (start === null) return null;
    const fel = preparedEndFel(start);
    if (fel > 0) {
      await game.system.azeroth.workflows.accrueCorruption(actor, {
        track: "fel", points: fel, occasion: t("AZEROTH.Occasion.Prepared", { name: I_HAVE_PREPARED.feature, from: start })
      });
    }
    // *Then you lose all your Hatred*: the whole pool, read inside the pool queue (the review's L13).
    if ((actor.poolSnapshot?.() ?? []).some(p => p.kind === "momentum" && p.name === HATRED)) {
      const { adjustPool } = await import("../documents/pool-writes.mjs");
      await adjustPool(actor, { kind: "momentum", name: HATRED }, 0, { empty: true });
    }
    const shape = values(actor.effects).find(e => e.flags?.[SCOPE]?.shape?.kind === DEMON_UNLEASHED.kind && e.flags?.[SCOPE]?.unleashed?.prepared === true) ?? null;
    if (shape) {
      const { leaveShape } = await import("../documents/shapes.mjs");
      await leaveShape(actor);
    }
    ui.notifications?.info(t(`AZEROTH.DemonHunter.Prepared.Ended.${reason}`, { name: actor.name, fel }));
    return { fel, from: start };
  } finally {
    ENDING.delete(actor.uuid);
  }
}

/* ------------------------------------------------------------------ */
/*  On a hit                                                            */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A DEMON HUNTER'S HIT DOES** (from `rollTest`, beside the Sovereign's): fired rows for the card,
 * each an amount riding the blow (D-777: a typed amount is its own Ward's). Bane of the Legion on a weapon
 * attack at a demon or a caster; Fel Lash and Mana Rend where their lines were paid; the round's record of
 * who the hunter struck. MY READING: an amount that rides the blow is worked out against the first creature
 * the card records, as a rider's damage is.
 *
 * @returns {Promise<object[]>}
 */
export async function demonHunterOnHit({ actor, hit = false, riderRows = [], list = [], weaponId = null, weaponAttack = true } = {}) {
  const fired = [];
  if (!actor || actor.type !== "character" || !isDemonHunter(actor)) return fired;
  const { targetActorOf } = await import("../dice/annotate.mjs");
  const victims = (list ?? []).map(row => ({ row, actor: targetActorOf(row) })).filter(v => v.actor);
  const first = victims[0] ?? null;
  const paid = id => (riderRows ?? []).find(p => p.identifier === id) ?? null;
  // Who the hunter struck this round, for Devour Soul (02: *a creature you damaged this round*).
  if (hit && victims.length) await noteStruck(actor, victims.map(v => v.actor.uuid));
  // **BANE OF THE LEGION** (02): *Your weapon attacks deal extra damage equal to your tier against a demon,
  // and against a creature that holds Mana or is Sustaining a spell. Until the end of your next turn, a demon
  // or a caster you hit cannot be invisible to you or hidden from you.*
  if (hit && weaponAttack && first && holds(actor, BANE_OF_THE_LEGION.feature)) {
    const reached = victims.filter(v => baneReaches({ kinds: kindsOfActor(v.actor), holdsMana: holdsMana(v.actor), sustaining: sustaining(v.actor) }));
    if (reached.includes(first)) {
      const n = baneDamage(tierOf(actor));
      fired.push({ key: "feature", name: BANE_OF_THE_LEGION.feature, text: t("AZEROTH.DemonHunter.Bane.Damage", { n, target: first.row?.name ?? first.actor.name }), extraDamage: n, extraType: null });
    }
    const marked = [];
    for (const v of reached) {
      const done = await layBaneMark(actor, v.actor);
      marked.push(done ? t("AZEROTH.DemonHunter.Bane.Marked", { target: v.row?.name ?? v.actor.name, name: actor.name }) : t("AZEROTH.DemonHunter.Bane.NotMarked", { target: v.row?.name ?? v.actor.name }));
    }
    if (marked.length) fired.push({ key: "feature", name: BANE_OF_THE_LEGION.feature, text: marked.join(" ") });
  }
  // **FEL LASH** (02): the damage off the Fel held BEFORE the hit (`felFor`, so I Have Prepared's 20 gives
  // tier plus 4), then the Fel it takes off (`felLashShed`, off the Fel really held).
  const lash = paid(FEL_LASH.identifier);
  // **04's FEL LASH TALENTS** (Phase 5): Fel-Tempered, Demon's Due, Tear the Soul, Gorging Lash and Feed on Power,
  // off the patches on Fel Lash - read once the line is paid, hit or miss, so Demon's Due's promise is taken by
  // *your next Fel Lash* whatever it does.
  // A weapon attack's alone (the review's M3): an unarmed strike never pays the line, and is held off here too.
  const lashExtra = lash && weaponAttack ? await lashTalentsFor(actor, { first }) : null;
  if (lash && hit && weaponAttack) {
    const n = felLashDamage({ tier: tierOf(actor), fel: felFor(actor), more: lashExtra?.more ?? 0 });
    const shed = await shedFel(actor);
    const extraLines = lashExtra?.heal > 0 || lashExtra?.energy > 0 || lashExtra?.freeDevour ? await lashTalentsLand(actor, { extra: lashExtra, first }) : [];
    fired.push({ key: "rider", name: FEL_LASH.feature, text: [t("AZEROTH.DemonHunter.FelLash.Damage", { n }), shed, ...extraLines].filter(Boolean).join(" "), extraDamage: n, extraType: FEL_LASH.type });
  }
  // **MANA REND** (02): the Power lost off the first creature struck, the Fel for what it could not lose,
  // and 1 Hatred.
  const rend = paid(MANA_REND.identifier);
  if (rend && hit && first && weaponAttack) {
    const done = await rendOn(actor, first.actor);
    const gain = await gainHatred(actor, MANA_REND.gain, "rend");
    // A GM's write that never answered moved nothing and deals no Fel (the review's C7): said in words.
    const words = done.failed
      ? t("AZEROTH.DemonHunter.ManaRend.NotDone", { target: first.row?.name ?? first.actor.name })
      : t("AZEROTH.DemonHunter.ManaRend.Landed", { target: first.row?.name ?? first.actor.name, lost: done.lost, n: done.shortage });
    fired.push({
      key: "rider", name: MANA_REND.feature,
      text: [words, gain.line].filter(Boolean).join(" "),
      ...(done.shortage > 0 ? { extraDamage: done.shortage, extraType: MANA_REND.type } : {})
    });
  }
  // **04's SCYTHE ON A HIT** (Phase 5): Sweeping Arc and Hobbling Reap (`effects/demon-hunter-talents.mjs`).
  fired.push(...await dhTalentsOnHit({ actor, hit, list, weaponAttack }));
  return fired;
}

/**
 * **THE FEL A FEL LASH HIT TAKES OFF** (C7, D-1721): the FIRST Fel Lash hit in a turn, in any shape - the turn's once
 * claimed FIRST for every hit (`fel-lash-shed@<turn>` on the round's record, through the combatant's queued
 * `markRoundOnce`; out of a fight a round of the world's clock), so a first hit that sheds nothing still spends it -
 * then judged off the Fel really held, nothing while I Have Prepared lasts. Through `workflows.reduceCorruption`, the
 * ONE lowerer of a track besides the rite.
 *
 * @returns {Promise<string>}  the line for the card
 */
async function shedFel(actor) {
  const fight = actor.activeFight?.() ?? null;
  const mine = combatantOf(actor);
  let shedThisTurn = false;
  if (mine) {
    const marked = await mine.markRoundOnce(`${FEL_LASH.shedMark}@${fight.turn}`);
    shedThisTurn = marked?.added !== true;
  } else {
    shedThisTurn = felLashClockSpent({ lastAt: actor.getFlag?.(SCOPE, FEL_LASH.clockFlag) ?? null, now: now() });
    if (!shedThisTurn && actor.isOwner) await actor.setFlag(SCOPE, FEL_LASH.clockFlag, now());
  }
  const judged = felLashShed({
    tier: tierOf(actor), held: heldFel(actor), prepared: Boolean(preparedCarrier(actor)), shedThisTurn
  });
  if (judged.reason) return t(`AZEROTH.DemonHunter.FelLash.Shed.${judged.reason}`, { name: actor.name });
  const done = await game.system.azeroth.workflows.reduceCorruption(actor, { track: "fel", points: judged.points, occasion: "felLash" });
  if (!done || done.refused) return t(`AZEROTH.DemonHunter.FelLash.Shed.${done?.refused ?? "none"}`, { name: actor.name });
  return t("AZEROTH.DemonHunter.FelLash.Shed.Done", { name: actor.name, n: done.lost, from: done.from, to: done.to });
}

/**
 * Mana Rend's Power, written on the creature's own client or the GM's. **A GM WHO NEVER ANSWERS MOVED NOTHING**
 * (the review's C7): the ask's failure or timeout is `failed`, with no shortage, so no Fel is dealt for a write that
 * may never have happened.
 */
async function rendOn(actor, victim) {
  const amount = Math.max(MANA_REND.min, modOf(actor, "wis"));
  if (victim.isOwner) return rendHere(victim, amount);
  const gm = game.users?.activeGM ?? null;
  if (!gm) return { lost: 0, shortage: 0, failed: true };
  try {
    const done = await gm.query(DH_FEATURES_QUERY, { act: "rend", victimUuid: victim.uuid, byUuid: actor.uuid }, { timeout: 10000 });
    return done?.ok ? { lost: int(done.lost), shortage: int(done.shortage) } : { lost: 0, shortage: 0, failed: true };
  } catch (err) {
    console.warn("azeroth-rpg | Mana Rend", err);
    return { lost: 0, shortage: 0, failed: true };
  }
}

/**
 * **THE POWER LOST, AS A DELTA INSIDE THE POOL QUEUE** (the review's C7): the pool chosen off the snapshot (Mana,
 * else the fullest Power pool, never the runes; `manaRendPlan`), the loss written by `adjustPool` against the pool
 * as it stands when the write's turn comes, and what actually moved reported: the Fel is for every point the
 * creature could not lose THEN.
 */
async function rendHere(victim, amount) {
  const plan = manaRendPlan(victim.poolSnapshot?.() ?? [], { wis: amount });
  if (!plan.pool || plan.lost <= 0) return { lost: 0, shortage: plan.amount };
  const { adjustPool } = await import("../documents/pool-writes.mjs");
  const moved = await adjustPool(victim, { kind: "power", name: plan.pool.name ?? null, itemId: plan.pool.itemId ?? null }, -plan.lost);
  const lost = Math.max(0, int(moved.before) - int(moved.after));
  return { lost, shortage: Math.max(0, plan.amount - lost) };
}

/** Bane of the Legion's mark on the creature hit, until the end of the hunter's next turn. */
async function layBaneMark(actor, victim) {
  if (victim.isOwner) return layBaneHere(actor, victim);
  if (noGM(victim)) return false;
  try {
    const done = await game.users.activeGM.query(DH_FEATURES_QUERY, { act: "bane", victimUuid: victim.uuid, byUuid: actor.uuid }, { timeout: 10000 });
    return done?.ok === true;
  } catch (err) {
    console.warn("azeroth-rpg | Bane of the Legion's mark", err);
    return false;
  }
}

async function layBaneHere(actor, victim) {
  const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
  const held = values(victim.effects).filter(e => e.flags?.[SCOPE]?.[BANE_OF_THE_LEGION.flag]?.by === actor.uuid).map(e => e.id);
  if (held.length) await victim.deleteEmbeddedDocuments("ActiveEffect", held);
  // Keyed on the HUNTER's combatant (D-628's rule for a clock that is somebody else's).
  const span = untilEndOfNextTurnOrRound(actor);
  await victim.createEmbeddedDocuments("ActiveEffect", [{
    name: `${BANE_OF_THE_LEGION.feature} (${actor.name})`, img: "icons/magic/perception/eye-ringed-glow-angry-small-red.webp", origin: actor.uuid, ...span,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    description: `<p>${foundry.utils.escapeHTML(t("AZEROTH.DemonHunter.Bane.MarkText", { name: actor.name }))}</p>`,
    flags: { [SCOPE]: { [BANE_OF_THE_LEGION.flag]: { by: actor.uuid } } }
  }]);
  return true;
}

/**
 * **A CREATURE THE HUNTER DAMAGED, BY ANY MEANS** (the review's M5; the orchestrator's ruling: *Devour Soul counts a
 * creature the hunter DAMAGED this round by any means*), from the one damage door (`AzerothActor#applyDamage`, just
 * before the Health is written, so the death watch's offer finds it): the same record the attack door keeps, keyed by
 * the hunter. And 04's Tear the Soul (the review's L15): a Fel Lash blow that drops the creature to 0 gives it to a
 * devour with no Reaction (`tearLands`), and no other blow does.
 *
 * @param {Actor} hunter
 * @param {Actor} victim
 * @param {{attack?: boolean, drops?: boolean}} [o]
 */
export async function noteDamagedBy(hunter, victim, { attack = false, drops = false } = {}) {
  if (!hunter || !victim || hunter === victim || hunter.type !== "character" || !isDemonHunter(hunter) || !hunter.isOwner) return;
  await noteStruck(hunter, [victim.uuid]);
  if (attack === true && drops === true) await tearLands(hunter, victim);
}

/** The round's record of who the hunter struck (Devour Soul's *a creature you damaged this round*). */
async function noteStruck(actor, uuids) {
  if (!actor.isOwner) return;
  const fight = actor.activeFight?.() ?? null;
  const when = { combatId: fight?.started ? fight.id : null, round: fight?.round ?? null, time: now() };
  let record = actor.getFlag(SCOPE, DEVOUR_SOUL.flag) ?? null;
  for (const uuid of uuids) record = markStruck(record, uuid, when);
  await actor.setFlag(SCOPE, DEVOUR_SOUL.flag, record);
}

/* ------------------------------------------------------------------ */
/*  Beyond Limits' fifth choice: after the die, at the seam             */
/* ------------------------------------------------------------------ */

/**
 * **A SEAM FOR THE QUENCH BATCH** (as `setDemonHunterPick` is): a function answering the yes or no Beyond Limits
 * asks after the roll, in place of the dialog. Null puts the dialog back.
 */
let limitsAnswer = null;
export function setBeyondLimitsAnswer(fn = null) {
  limitsAnswer = typeof fn === "function" ? fn : null;
}

/** A Test whose result something else fixed: Trueshot's SL, a forced miss, a Disrupt Weave. */
function rollFixed(roll) {
  const forced = roll?.options?.forcedSl;
  return (forced !== undefined && forced !== null && Number.isFinite(Number(forced))) || roll?.options?.forcedMiss === true || Boolean(roll?.options?.disrupted);
}

/** The turn's once, read off the world now: the mark it would claim, and why it may not (null where it may). */
function limitsTurn(actor) {
  const fight = actor.activeFight?.() ?? null;
  const mine = combatantOf(actor);
  const mark = mine ? `${BEYOND_LIMITS.identifier}@${fight.turn}` : null;
  const refused = beyondLimitsRefusal({ inFight: Boolean(mine), used: usedOf(mine), mark, lastAt: actor.getFlag?.(SCOPE, BEYOND_LIMITS.clockFlag) ?? null, now: now() });
  return { mine, mark, refused };
}

/** The yes or no, on the client that answers for the hunter (here, or the query's handler there). */
async function askLimitsHere(actor, { total = 0, dc = null, test = "" } = {}) {
  if (!actor?.isOwner || !holds(actor, BEYOND_LIMITS.feature)) return false;
  if (limitsAnswer) return (await limitsAnswer({ actor, total, dc, test })) === true;
  const { confirmHere } = await import("./blow-doors.mjs");
  return confirmHere(actor, {
    title: BEYOND_LIMITS.feature,
    text: foundry.utils.escapeHTML(t("AZEROTH.DemonHunter.BeyondLimits.Ask", { name: actor.name, total, dc: dc ?? "", test, n: BEYOND_LIMITS.resilience, gain: BEYOND_LIMITS.gain }))
  });
}

/** A number added to an evaluated roll, in place: the formula, the total, the modifier and the provenance row. */
function addToRoll(roll, n, label) {
  const { OperatorTerm, NumericTerm } = foundry.dice.terms;
  const op = new OperatorTerm({ operator: "+" });
  const num = new NumericTerm({ number: n });
  op._evaluated = true;
  num._evaluated = true;
  roll.terms.push(op, num);
  roll.resetFormula?.();
  roll._total = (Number(roll._total) || 0) + n;
  roll.options.modifier = (Number(roll.options.modifier) || 0) + n;
  roll.options.provenance ??= [];
  roll.options.provenance.push({ label, value: n });
}

/**
 * **02's BEYOND LIMITS, AFTER THE DIE** (*or add 2 to a Body or Reflex Resilience Test after you roll it and see the
 * result*; the lead's ruling of 2026-11-22, D-1720; built at the seam, D-1724): asked by `AzerothActor
 * #offerElunesRegard` after Another Timeline and before Elune's Regard, on a Body or Reflex Resilience Test the door
 * stamped (`roll.options.resilience`), by a hunter holding the feature, with the turn's once unspent, and only where
 * the 2 changes the result or its Success Level (`beyondLimitsWorth`) - never on a result something else fixed.
 * Asked of whoever answers for the hunter. A yes is judged again, the turn marked FIRST, then the 2 added to the roll
 * in place (so the card read back says what was kept), 1 Hatred gained through its named door and 04's Steady
 * Footing. Answers the provenance line, or null where nothing was added.
 *
 * @param {Actor} actor
 * @param {AzerothRoll} roll
 * @returns {Promise<string|null>}
 */
export async function offerBeyondLimits(actor, roll) {
  if (!actor || actor.type !== "character" || !roll?._evaluated || roll.options?.beyondLimits) return null;
  const resilience = roll.options?.resilience ?? null;
  if (roll.options?.kind !== "resilience" || !BEYOND_LIMITS.kinds.includes(resilience)) return null;
  if (!holds(actor, BEYOND_LIMITS.feature)) return null;
  const worth = () => beyondLimitsWorth({ total: roll.total, dc: roll.dc ?? 10, natural: roll.natural, criticalOn: roll.options?.criticalOn ?? 20, forced: rollFixed(roll) });
  if (!worth() || limitsTurn(actor).refused) return null;
  const test = t(AZEROTH.resiliences?.[resilience] ?? resilience);
  const asked = { total: roll.total, dc: roll.dc ?? null, test };
  const original = JSON.stringify(roll.toJSON());
  const { answererOf } = await import("./blow-doors.mjs");
  const who = actor.isOwner && !game.user?.isGM ? game.user : answererOf(actor);
  if (!who) return null;
  let yes = false;
  if (who.id === game.user?.id) yes = await askLimitsHere(actor, asked);
  else {
    try {
      const answer = await who.query(DH_FEATURES_QUERY, { act: "limitsAsk", byUuid: actor.uuid, ...asked }, { timeout: 30000 });
      yes = answer?.yes === true;
    } catch (err) {
      ui.notifications?.warn(t("AZEROTH.BlowDoor.NoAnswer", { name: actor.name, reason: err.message }));
      yes = false;
    }
  }
  if (!yes) return null;
  // Judged again: the roll unchanged, the once unspent, the 2 still worth adding.
  const again = limitsTurn(actor);
  if (JSON.stringify(roll.toJSON()) !== original || !worth()) return null;
  if (again.refused) return refuse(`AZEROTH.DemonHunter.BeyondLimits.Refuse.${again.refused}`, { name: BEYOND_LIMITS.feature });
  if (again.mine) {
    const marked = await again.mine.markRoundOnce(again.mark);
    if (marked?.added !== true) return refuse("AZEROTH.DemonHunter.BeyondLimits.Refuse.turn", { name: BEYOND_LIMITS.feature });
  } else await actor.setFlag(SCOPE, BEYOND_LIMITS.clockFlag, now());
  const first = roll.total;
  addToRoll(roll, BEYOND_LIMITS.resilience, BEYOND_LIMITS.feature);
  roll.options.beyondLimits = { name: BEYOND_LIMITS.feature, totals: [first, roll.total] };
  const gain = await gainHatred(actor, BEYOND_LIMITS.gain, "limit");
  // 04's Steady Footing reaches the fifth choice too (*Whichever Beyond Limits choice you make*).
  const steady = await steadyFooting(actor);
  const line = [t("AZEROTH.DemonHunter.BeyondLimits.Row", { first, second: roll.total, n: BEYOND_LIMITS.resilience }), gain.line, steady].filter(Boolean).join(" ");
  roll.options.provenance.push({ label: BEYOND_LIMITS.feature, value: null, formula: line });
  return line;
}

/* ------------------------------------------------------------------ */
/*  Devour Soul                                                         */
/* ------------------------------------------------------------------ */

/**
 * The hunters on a scene with a token there who can devour: Devour Soul held, or 04's Soul Hunger taken
 * (`effects/demon-hunter-talents.mjs#devourProfileOf`, the Phase 5 talent's lesser devour).
 */
function huntersOn(scene) {
  const out = [];
  for (const token of scene?.tokens ?? []) {
    const actor = token.actor;
    if (actor?.type === "character" && devourProfileOf(actor)) out.push({ actor, token });
  }
  return out;
}

/** Whether a creature may still spend a Reaction: out of a fight there is no budget to ask. */
const reactionLeft = actor => game.system.azeroth.workflows.turnBudgetRefusal?.(actor, "reaction") === null;

/**
 * The judgement Devour Soul makes of one hunter and one fallen creature, read off the world now. The reach and the
 * Reaction are the talents' too (Phase 5): Soul Hunger's 5 feet or the scythe's reach, Endless Appetite's 20 a rank,
 * and a devour Sweeping Arc, Tear the Soul or Endless Appetite makes free (`freeDevourFor`).
 */
async function devourJudged(hunter, hunterToken, victim, victimToken) {
  const { feetApart } = await import("../canvas/footprints.mjs");
  const profile = devourProfileOf(hunter);
  if (!profile) return "struck";
  const fight = hunter.activeFight?.() ?? null;
  const struck = struckThisRound(hunter.getFlag?.(SCOPE, DEVOUR_SOUL.flag) ?? null, { combatId: fight?.started ? fight.id : null, round: fight?.round ?? null, time: now() });
  const sameScene = hunterToken?.parent && victimToken?.parent && hunterToken.parent.id === victimToken.parent.id;
  return devourRefusal({
    // The hunter at 0 Health devours nothing (the orchestrator's ruling on C8), before the budget.
    hunterHealth: hunter.system?.health?.value ?? 1,
    self: hunter === victim, devoured: Boolean(victim.getFlag?.(SCOPE, DEVOUR_SOUL.given)),
    kinds: kindsOfActor(victim), struck: struck.includes(victim.uuid), reach: profile.reach,
    feet: sameScene ? feetApart(docOf(hunterToken), docOf(victimToken)) : null,
    reactionLeft: Boolean(freeDevourFor(hunter, victim)) || reactionLeft(hunter)
  });
}

/**
 * **DEVOUR SOUL'S OFFER** (02 §7): on the death watch's `healthFell`, for every hunter on the creature's
 * scene who holds the feature and passes the judgement, a card whispered to the hunter's owners with a
 * button - judged again at the press.
 */
async function offerDevour(event) {
  const victim = event?.actor ?? null;
  if (!victim || !event.healthFell) return;
  const tokens = victim.isToken && victim.token ? [victim.token] : values(game.scenes).flatMap(s => s.tokens.filter(tk => tk.actor === victim));
  for (const vt of tokens) {
    for (const { actor: hunter, token } of huntersOn(vt.parent)) {
      if (await devourJudged(hunter, token, victim, vt)) continue;
      const kinds = kindsOfActor(victim);
      const owners = (game.users?.contents ?? []).filter(u => hunter.testUserPermission?.(u, "OWNER")).map(u => u.id);
      // The feature that takes it and its Health, Soul Hunger's included (Phase 5).
      const profile = devourProfileOf(hunter);
      const content = await foundry.applications.handlebars.renderTemplate(OFFER_TEMPLATE, {
        holderUuid: hunter.uuid, victimUuid: victim.uuid, sceneId: vt.parent.id, tokenId: vt.id, title: profile.feature,
        text: t("AZEROTH.DemonHunter.Devour.Offer", { name: hunter.name, target: vt.name ?? victim.name, n: profile.heal, hatred: devourHatred(kinds) }),
        undead: kinds.has("undead")
      });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: hunter }), content, whisper: owners,
        flags: { [SCOPE]: { kind: DH_OFFER_KIND, holder: hunter.uuid, victim: victim.uuid } }
      });
    }
  }
}

/**
 * **DEVOUR SOUL, PRESSED** (D-768's order): the creature still at 0, struck this round, in reach, not devoured,
 * the Reaction left, and a GM to mark the soul taken - judged; the press claimed on the card; then the
 * Reaction spent, the Health restored through the one healing door, 2 Hatred for a demon's soul, and the soul
 * marked taken so it is devoured once.
 *
 * @param {HTMLElement} button
 * @param {ChatMessage} message
 */
export async function devourFromCard(button, message) {
  const hunter = get(button?.dataset?.holderUuid);
  if (hunter?.documentName !== "Actor" || !hunter.isOwner) return null;
  const scene = game.scenes.get(button.dataset.sceneId) ?? null;
  const vt = scene?.tokens?.get(button.dataset.tokenId) ?? null;
  const victim = vt?.actor ?? get(button.dataset.victimUuid);
  const token = values(scene?.tokens).find(tk => tk.actor === hunter) ?? null;
  if (!victim || (victim.system?.health?.value ?? 1) > 0) return refuse("AZEROTH.DemonHunter.Devour.Refuse.gone", { name: hunter.name });
  const refused = await devourJudged(hunter, token, victim, vt);
  const profile = devourProfileOf(hunter);
  if (refused) return refuse(`AZEROTH.DemonHunter.Devour.Refuse.${refused}`, { name: hunter.name, feet: profile?.reach ?? DEVOUR_SOUL.feet });
  if (noGM(victim)) return refuse("AZEROTH.DemonHunter.NoGM", { name: profile.feature });
  const amount = profile.heal;
  // **04's HOARDED SOUL AND FEAST OF SOULS, ASKED BEFORE ANYTHING IS PAID** (D-768's order): keep the soul or take
  // the Health, and the creatures the feast reaches. A dismissed chooser devours nothing and spends nothing.
  const featureItem = hunter.items.find(i => i.type === "feature" && i.name === profile.feature) ?? hunter;
  const keep = await hoardChoice(hunter, { amount, item: featureItem });
  if (!keep) return null;
  const feast = await feastChoice(hunter, { token, victim, item: featureItem });
  if (feast === null) return null;
  // The feast's Tests are rolled on the GM's client: with none online it is refused before anything is paid (D-774).
  if (feast.length && !game.user?.isGM && !game.users?.activeGM) return refuse("AZEROTH.DemonHunter.NoGM", { name: "Feast of Souls" });
  // And Swallow Their Magic's ending, which the GM's client makes (the review's S5): asked before anything is paid.
  const swallowRefused = afterDevourRefusal(hunter, victim);
  if (swallowRefused) return refuse(swallowRefused.key, swallowRefused.data);
  // A devour Sweeping Arc, Tear the Soul or Endless Appetite makes free spends no Reaction (Phase 5).
  const free = freeDevourFor(hunter, victim);
  const { claimCardPress } = await import("./card-presses.mjs");
  const claimed = await claimCardPress(message, { kind: "once", press: "devour" });
  if (!claimed.ok) return refuse(claimed.reason ?? "AZEROTH.TalentLine.Pressed");
  if (free) await spendFreeDevour(hunter, victim, free);
  else if (!(await game.system.azeroth.workflows.spendTurnBudget(hunter, "reaction"))) return null;
  const lines = [];
  if (keep.keep) lines.push(await keepSoul(hunter, { heal: amount, from: vt?.name ?? victim.name }));
  else {
    const before = hunter.system?.health?.value ?? 0;
    if (amount > 0) await hunter.applyHealing(amount, { from: hunter, feature: true, featureName: profile.feature });
    lines.push(t("AZEROTH.DemonHunter.Devour.Healed", { name: hunter.name, n: Math.max(0, (hunter.system?.health?.value ?? before) - before), target: vt?.name ?? victim.name }));
  }
  if (free) lines.push(t("AZEROTH.DemonHunter.Talent.FreeDevour", { name: hunter.name }));
  const hatred = devourHatred(kindsOfActor(victim));
  if (hatred > 0) {
    const gain = await gainHatred(hunter, hatred, "devour");
    if (gain.line) lines.push(gain.line);
  }
  await markDevoured(victim, hunter);
  // What the devour's talents do beside its Health (Phase 5): Swallow Their Magic, Demon's Due, Feast of Souls,
  // Kill After Kill.
  lines.push(...await afterDevour(hunter, { victim, token, feast, demon: hatred > 0 }));
  // The landed devour's card names the creature whose soul was taken (Phase 6, D-1580), so every client plays the
  // soul drawn into the hunter off it (`rules/demon-hunter-animations.mjs#demonHunterCardCue`).
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: hunter }),
    content: `<div class="azeroth azeroth-card azeroth-card-feature"><div class="azeroth-card-body"><p class="azeroth-card-line azeroth-fired"><span>${foundry.utils.escapeHTML(profile.feature)}</span><em>${foundry.utils.escapeHTML(lines.join(" "))}</em></p></div></div>`,
    flags: { [SCOPE]: { kind: "demonHunterCard", devoured: true, targetUuid: vt?.uuid ?? victim.uuid } }
  });
  return lines;
}

/** The soul marked taken, so no second hunter and no second press devours it (cleared by the death watch at a heal, L14). */
async function markDevoured(victim, hunter) {
  if (victim.isOwner) return victim.setFlag(SCOPE, DEVOUR_SOUL.given, true);
  try {
    return await game.users.activeGM.query(DH_FEATURES_QUERY, { act: "devoured", victimUuid: victim.uuid, byUuid: hunter?.uuid ?? null }, { timeout: 10000 });
  } catch (err) {
    console.warn("azeroth-rpg | Devour Soul's mark", err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Spectral Sight                                                      */
/* ------------------------------------------------------------------ */

/**
 * **WHAT THE HUNTER'S TOKENS SEE BY** (02's Spectral Sight): darkvision and See Invisibility to 30 feet plus
 * 10 for each 5 Fel (`felFor`'s, so I Have Prepared's 70), plus Eyes of the Nether's 20 a rank. The prototype
 * and every placed token of the actor, each written only where it differs, on the active GM's client.
 *
 * @param {Actor} actor
 * @returns {Promise<number>}  how many documents were written
 */
export async function syncSpectralSight(actor) {
  if (!actor || actor.type !== "character") return 0;
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return 0;
  // Nothing to do for a character who holds no Spectral Sight and whose tokens it never wrote.
  const marked = actor.isToken ? actor.token?.flags?.[SCOPE]?.[SIGHT_MARK] !== undefined : actor.prototypeToken?.flags?.[SCOPE]?.[SIGHT_MARK] !== undefined;
  if (!holds(actor, SPECTRAL_SIGHT.feature) && !marked) return 0;
  // **WHO THE TOKENS ARE** (the review's L12): a synthetic actor writes its own token alone; a world actor writes
  // its prototype and every token of it, an unlinked token read off its own synthetic actor.
  const world = actor.isToken ? null : actor;
  const tokens = [];
  if (actor.isToken && actor.token) tokens.push({ token: actor.token, from: actor });
  else for (const scene of values(game.scenes)) {
    for (const token of values(scene.tokens)) if (token.actorId === actor.id) tokens.push({ token, from: token.actorLink ? actor : (token.actor ?? actor) });
  }
  let written = 0;
  const write = async (doc, source, prefix = "") => {
    const step = sightStep(source, doc);
    if (!step) return;
    await doc.update(prefix ? Object.fromEntries(Object.entries(step).map(([k, v]) => [`${prefix}${k}`, v])) : step);
    written++;
  };
  if (world) await write(world, world, "prototypeToken.");
  for (const { token, from } of tokens) await write(token, from, "");
  return written;
}

/**
 * What one token's sight needs written for its actor (`syncSpectralSight`): the patch where the feature is held and
 * differs, the put-back where it is not held and the token carries the mark (L12), else nothing. `doc` is the
 * token, or the world actor for its prototype; `holder` the actor whose Fel and talents it reads.
 */
function sightStep(holder, doc) {
  const actor = holder?.documentName === "Actor" ? holder : doc;
  const source = doc?.documentName === "Actor" ? (doc.prototypeToken?.toObject?.() ?? {}) : (doc?.toObject?.() ?? {});
  if (holds(actor, SPECTRAL_SIGHT.feature)) {
    const eyes = actor.talentRanks?.(SPECTRAL_SIGHT.eyesOfTheNether.name) ?? 0;
    // **AND A WORN ITEM'S FEET** (the Blindfold of the Illidari; D-2156): its patch on 02's Spectral
    // Sight, read through the one reader over `AzerothActor#patchSources`.
    const extra = itemPatchSum(patchRowsOf(actor.patchSources?.() ?? [], SPECTRAL_SIGHT.feature), "feet").amount;
    const changes = sightChanges(source, spectralSightPatch(spectralSightFeet(felFor(actor), { eyes, extra })));
    return Object.keys(changes).length ? changes : null;
  }
  const back = sightWithdrawn(source);
  if (!back) return null;
  return {
    "sight.enabled": back.sight.enabled, "sight.range": back.sight.range, "sight.visionMode": back.sight.visionMode,
    detectionModes: foundry.data.operators.ForcedReplacement.create(back.detectionModes),
    [`flags.${SCOPE}.${SIGHT_MARK}`]: new foundry.data.operators.ForcedDeletion()
  };
}

/* ------------------------------------------------------------------ */
/*  Spectral Sight's demons, and the thrown glaive picked up            */
/* ------------------------------------------------------------------ */

/**
 * **SENSE DEMONS** (02's Spectral Sight: *You know the direction of every demon within 60 feet*; the review's S1): the
 * Combat tab's row - every creature of the demon kind on the hunter's scene within 60 feet, measured footprint to
 * footprint (`canvas/footprints.mjs`), named with its compass point and its feet on a card whispered to the hunter's
 * owners. No action: knowing is not doing. A hunter with no token on the viewed scene is refused in words.
 *
 * @param {Actor} actor
 * @returns {Promise<string[]|null>}
 */
export async function senseDemons(actor) {
  if (!actor || !holds(actor, SPECTRAL_SIGHT.feature)) return refuse("AZEROTH.DemonHunter.Sense.NoFeature", { name: actor?.name ?? "" });
  const own = docOf(tokenOf(actor));
  if (!own?.parent || own.parent.id !== globalThis.canvas?.scene?.id) return refuse("AZEROTH.DemonHunter.Talent.NoToken", { name: SPECTRAL_SIGHT.feature });
  const { feetApart } = await import("../canvas/footprints.mjs");
  const { centreOf } = await import("./demon-hunter-sight.mjs");
  const at = centreOf(own);
  const rows = values(own.parent.tokens).filter(tk => tk.actor && tk.id !== own.id && tk.actor !== actor).map(tk => {
    const there = centreOf(tk);
    return { name: tk.name ?? tk.actor.name, kinds: kindsOfActor(tk.actor), feet: feetApart(own, tk), dx: there && at ? there.x - at.x : 0, dy: there && at ? there.y - at.y : 0 };
  });
  const found = demonsSensed(rows, { reach: SPECTRAL_SIGHT.demons });
  const lines = found.length
    ? found.map(d => t("AZEROTH.DemonHunter.Sense.Row", { target: d.name, feet: d.feet, point: game.i18n.localize(`AZEROTH.DhSpell.Compass.${d.point}`) }))
    : [t("AZEROTH.DemonHunter.Sense.None", { feet: SPECTRAL_SIGHT.demons })];
  const owners = (game.users?.contents ?? []).filter(u => actor.testUserPermission?.(u, "OWNER")).map(u => u.id);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: owners,
    content: `<div class="azeroth azeroth-card azeroth-card-feature"><div class="azeroth-card-body"><p class="azeroth-card-line azeroth-fired"><span>${foundry.utils.escapeHTML(SPECTRAL_SIGHT.feature)}</span><em>${foundry.utils.escapeHTML(t("AZEROTH.DemonHunter.Sense.Title", { feet: SPECTRAL_SIGHT.demons }))}</em></p>${lines.map(l => `<p class="azeroth-card-line">${foundry.utils.escapeHTML(l)}</p>`).join("")}</div></div>`,
    flags: { [SCOPE]: { kind: "demonHunterCard", sensed: found } }
  });
  return lines;
}

/**
 * **A THROWN GLAIVE, PICKED UP** (07's Flame Crash: *A thrown glaive lies where it landed until you pick it up or cast
 * **Call the Glaives***; the review's C4): the Combat tab's row for each glaive lying away. Judged - the hunter's
 * token on the glaive's scene within 5 feet of where it lies (`pickUpRefusal`), refused in words otherwise - and the
 * glaive back in the hand, the flag Call the Glaives clears taken off the same way. No action: 05's Interact is not
 * built (O-100), so the table charges one where it wants to (MY READING, for the lead).
 *
 * @param {Actor} actor
 * @param {string} itemId
 */
export async function pickUpGlaive(actor, itemId) {
  const item = actor?.items?.get?.(itemId) ?? null;
  const away = awayOf(item);
  const own = docOf(tokenOf(actor));
  const { feetToPoint } = await import("../canvas/footprints.mjs");
  const feet = away && own?.parent?.id === away.sceneId ? feetToPoint(own, { x: away.x, y: away.y }) : null;
  const refused = pickUpRefusal({ away, sceneId: own?.parent?.id ?? null, feet });
  if (refused) return refuse(`AZEROTH.DemonHunter.PickUp.Refuse.${refused}`, { name: item?.name ?? "", feet: 5 });
  await item.update({ flags: { [SCOPE]: { away: new foundry.data.operators.ForcedDeletion() } } });
  ui.notifications?.info(t("AZEROTH.DemonHunter.PickUp.Done", { name: actor.name, glaive: item.name }));
  return item;
}

/* ------------------------------------------------------------------ */
/*  The rest: Quiet the Whispers, rolled last                           */
/* ------------------------------------------------------------------ */

/**
 * **QUIET THE WHISPERS** (04's Sufferer, the stacking line: *rolled last, can cancel the Fel Corruption that
 * remains*): asked by `AzerothActor#_hatredAtRest` after every other reduction, where Fel remains, a rank is
 * taken and a use of the rank's once-a-Long-Rest count is left. A Spirit Resilience Test at DC 10 plus the
 * Hatred held when the rest ended; a success cancels the Fel. The count is kept on the actor and emptied at a
 * Long Rest. Answers the Fel that still lands.
 *
 * @param {Actor} actor
 * @param {{fel: number, held: number, kind: "short"|"long"}} o
 * @returns {Promise<number>}
 */
export async function quietTheWhispers(actor, { fel = 0, held = 0, kind = "short" } = {}) {
  // By name, the inline row's own reading (`talent-effects.mjs`: Quiet the Whispers is `inline`, Phase 5).
  const rank = actor?.talentRanks?.("Quiet the Whispers") ?? 0;
  const used = int(actor?.getFlag?.(SCOPE, QUIET_THE_WHISPERS.flag));
  if (!quietWhispersRolls({ fel, rank, used })) return fel;
  await actor.setFlag(SCOPE, QUIET_THE_WHISPERS.flag, used + 1);
  const message = await game.system.azeroth.workflows.rollResilience({ actor, resilience: QUIET_THE_WHISPERS.kind, dc: quietWhispersDC(held), title: QUIET_THE_WHISPERS.name });
  const passed = message?.rolls?.[0]?.outcome?.success === true || message?.flags?.[SCOPE]?.success === true;
  return passed ? 0 : fel;
}

/* ------------------------------------------------------------------ */
/*  The GM's handler                                                    */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A HUNTER'S CLIENT ASKS THE GM TO WRITE** (`DH_FEATURES_QUERY`), judged again here: the asker owns the
 * hunter; Mana Rend's Power off the creature's pools (worked out here, never off the payload's numbers beyond
 * the hunter's own Wisdom); Bane of the Legion's mark; a soul marked devoured.
 */
export async function demonHunterQueryHandler(payload = {}, { user = null } = {}) {
  // **BEYOND LIMITS' ASK, ON THE CLIENT THAT ANSWERS FOR THE HUNTER** (D-1724): a GM's client rolled the hunter's Test
  // (a Black Drake's landing) and asks the owning player here. Judged here: this client owns the hunter, it holds the
  // feature, and the asker is a GM or an owner. Only the yes travels back; the roll and the writes stay the asker's.
  if (payload.act === "limitsAsk") {
    const hunter = get(payload.byUuid);
    const asker = user ?? game.user;
    if (!hunter || !(asker?.isGM || hunter.testUserPermission?.(asker, "OWNER"))) return { yes: false };
    return { yes: await askLimitsHere(hunter, { total: int(payload.total), dc: payload.dc ?? null, test: String(payload.test ?? "") }) };
  }
  if (!game.user?.isGM) return { ok: false, reason: "gm" };
  const victim = get(payload.victimUuid);
  if (!victim) return { ok: false, reason: "gone" };
  const by = get(payload.byUuid);
  const asker = user ?? game.user;
  // **JUDGED AGAIN HERE, OFF THE WORLD** (the review's C5): the asker owns the hunter, the hunter holds the feature,
  // the creature is on the hunter's record of who it damaged this round, a devoured soul is at 0 Health - and every
  // amount is worked out here off the hunter's own sheet, never off the payload.
  const fight = by?.activeFight?.() ?? null;
  const struck = by ? struckThisRound(by.getFlag?.(SCOPE, DEVOUR_SOUL.flag) ?? null, { combatId: fight?.started ? fight.id : null, round: fight?.round ?? null, time: now() }).includes(victim.uuid) : false;
  const feature = { rend: holds(by, MANA_REND.feature), bane: holds(by, BANE_OF_THE_LEGION.feature), devoured: Boolean(by && devourProfileOf(by)) }[payload.act] ?? false;
  const refused = featureQueryRefusal({
    act: payload.act, owner: Boolean(by && by.documentName === "Actor" && by.testUserPermission?.(asker, "OWNER")),
    holdsFeature: feature, struck, victimHealth: victim.system?.health?.value ?? 1
  });
  if (refused) return { ok: false, reason: refused };
  switch (payload.act) {
    case "rend": return { ok: true, ...await rendHere(victim, Math.max(MANA_REND.min, modOf(by, "wis"))) };
    case "bane": return { ok: await layBaneHere(by, victim) };
    case "devoured":
      await victim.setFlag(SCOPE, DEVOUR_SOUL.given, true);
      return { ok: true };
    default: return { ok: false, reason: "act" };
  }
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                               */
/* ------------------------------------------------------------------ */

/** Whether this client answers for the actor: its first active owning player, else the active GM. */
async function answersFor(actor) {
  const { answererOf } = await import("./blow-doors.mjs");
  return answererOf(actor)?.id === game.user?.id;
}

/**
 * Register the doors' hooks once at init: Devour Soul on the death watch; I Have Prepared's end when its carrier
 * goes and at 0 Health; Spectral Sight's token sight when the Fel, the flag or the features move.
 */
export function registerDemonHunterFeatures() {
  import("./death-watch.mjs").then(m => m.onDeath(offerDevour)).catch(err => console.warn("azeroth-rpg | Devour Soul on the death watch", err));
  Hooks.on("deleteActiveEffect", async (effect, options) => {
    const actor = effect?.parent;
    const flag = effect?.flags?.[SCOPE]?.[I_HAVE_PREPARED.flag];
    if (!flag || actor?.documentName !== "Actor" || options?.azerothPrepared) return;
    if (!(await answersFor(actor))) return;
    await endPrepared(actor, { reason: "end", from: preparedOf(flag)?.from ?? null }).catch(err => console.warn("azeroth-rpg | I Have Prepared's end", err));
  });
  Hooks.on("updateActor", async (actor, changes) => {
    if (actor?.type !== "character") return;
    // *The minute ends early if you drop to 0 Health.*
    const health = changes?.system?.health?.value;
    if (health !== undefined && health <= 0 && preparedCarrier(actor) && await answersFor(actor)) {
      await endPrepared(actor, { reason: "zero" }).catch(err => console.warn("azeroth-rpg | I Have Prepared at 0", err));
    }
    // The Fel, or any flag of ours (I Have Prepared's `felReadAs` set or unset): the token's sight read again,
    // and written only where it differs.
    const moved = changes?.system?.corruption !== undefined || changes?.flags?.[SCOPE] !== undefined;
    if (moved) await syncSpectralSight(actor).catch(err => console.warn("azeroth-rpg | Spectral Sight", err));
  });
  // **THE SIGHT FOLLOWS THE FEATURE BOTH WAYS** (the review's L12): the feature, the class that grants it and 04's
  // Eyes of the Nether, created or deleted, read the sight again - a feature taken away puts the sight back.
  const itemMoved = async item => {
    const actor = item?.parent;
    if (actor?.documentName !== "Actor" || actor.type !== "character") return;
    const moves = (item.type === "feature" && item.name === SPECTRAL_SIGHT.feature) || (item.type === "class" && (item.system?.identifier === "demon-hunter" || item.name === "Demon Hunter"))
      || movesSpectralSight(item) || (item.system?.equipped === true && patchesFeature(item, SPECTRAL_SIGHT.feature));
    if (moves) await syncSpectralSight(actor).catch(err => console.warn("azeroth-rpg | Spectral Sight", err));
  };
  Hooks.on("createItem", itemMoved);
  Hooks.on("deleteItem", itemMoved);
  // **AN ITEM THAT PATCHES SPECTRAL SIGHT, PUT ON OR TAKEN OFF** (the Blindfold of the Illidari; D-2156):
  // the sight read again on the active GM's client (`syncSpectralSight` gates itself).
  Hooks.on("updateItem", async (item, changes) => {
    const actor = item?.parent;
    if (actor?.documentName !== "Actor" || actor.type !== "character") return;
    if (!equipResyncs(item, changes ?? {}).features || !patchesFeature(item, SPECTRAL_SIGHT.feature)) return;
    await syncSpectralSight(actor).catch(err => console.warn("azeroth-rpg | Spectral Sight", err));
  });
  // **A GLAIVE PUT AWAY COMES BACK** (the review's C4): a thrown glaive unequipped no longer lies on the board.
  Hooks.on("updateItem", async (item, changes, options, userId) => {
    if (userId !== game.user?.id || changes?.system?.equipped !== false || !awayOf(item)) return;
    await item.update({ flags: { [SCOPE]: { away: new foundry.data.operators.ForcedDeletion() } } }).catch(err => console.warn("azeroth-rpg | a glaive put away", err));
  });
  // **AT READY, OR NOW** (the review's S7): registered inside a module loaded after `ready` may have fired, so a
  // `ready` hook alone could never run.
  const atReady = () => {
    if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return;
    for (const actor of values(game.actors)) if (actor.type === "character") syncSpectralSight(actor).catch(() => null);
  };
  if (game.ready) atReady();
  else Hooks.once("ready", atReady);
}
