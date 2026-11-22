/**
 * **THE DEMON HUNTER'S THIRTY-SIX TALENTS, AS DOORS** (04-TALENTS' Betrayer, Souleater and Sufferer; the Demon
 * Hunter plan's Phase 5, D-1560 to D-1569). The law is `rules/demon-hunter-talents.mjs`; the rows are
 * `talent-effects.mjs`' (`"demon-hunter"`). This module is the ONE writer for what the talents do:
 *
 * - **A talent's Use is judged before anything is paid and landed once it is** (D-768): `judgeDhTalentUse` and
 *   `landDhTalentUse`, handed across by the class features' own Use door (`effects/demon-hunter-features.mjs
 *   #judgeDemonHunterUse`, `onUse.dh.talent`). Taste of Power, Gift of the Skull, Chaos Blast, Glaive Ward and
 *   Silence the Weave.
 * - **What a talent changes in a class feature rides the feature's `mod(...)` patch** and is read through
 *   `class-talents.mjs#patchRowsOf` (D-773 to D-775): Fel Lash's hit (`lashTalentsFor`), Devour Soul's reach and
 *   Health (`devourProfileOf`), Demon Unleashed's rounds and Bargain, Hunter's Leap's landing
 *   (`afterHuntersLeap`) and Beyond Limits' footing (`steadyFooting`).
 * - **A hit's own talents** (`dhTalentsOnHit`, from the class's on-hit door): Sweeping Arc and Hobbling Reap.
 * - **A devour's talents** (`afterDevour`): Swallow Their Magic, Demon's Due, Kill After Kill and Feast of Souls,
 *   and Hoarded Soul's Crystalized Soul (`keepSoul`, `useCrystalizedSoul`).
 * - **The Sufferer's**: Iron Will's line, Glaive Ward's laid Ward, Turn Their Fire at the Resist door, Refuse the
 *   Legion's refused Charm and the cast door's Bane, Sight Beyond Sight's whisper, Silence the Weave.
 * - **Every pool write goes through `pool-writes.mjs#adjustPool`, a Hatred rise through its named door**
 *   (`gainHatred`: `flows`, `devour`), and a write on a creature this client does not own asks the GM through
 *   `DH_TALENTS_QUERY`, with `gm-writes.mjs#gmAbsentFor` asked first.
 *
 * C8 (the lead: *"Having a spell or feature prevent death goes against this"*): nothing here holds the hunter
 * above 0. `demon-hunter-features.test.mjs` reads this file for a hold.
 */

import {
  BETRAYERS_BARGAIN, CHAOS_BLAST, CRYSTAL_CHOICES, DEMONS_DUE, DH_CLASS, ENDLESS_APPETITE, FALL_UPON_THEM, FEAST_OF_SOULS,
  FEED_ON_POWER, GIFT_OF_THE_SKULL, GLAIVE_WARD, HOARDED_SOUL, HOBBLING_REAP, IRON_WILL, KILL_AFTER_KILL, REAPERS_GRIP,
  REFUSE_THE_LEGION, SIGHT_BEYOND_SIGHT, SILENCE_THE_WEAVE, SOUL_HUNGER, STEADY_FOOTING, SWALLOW_THEIR_MAGIC,
  SWEEPING_ARC, TASTE_OF_POWER, TEAR_THE_SOUL, TURN_THEIR_FIRE, belowHalf, crystalGives, crystalRefusal, devourProfile,
  dhRankIn, dhRankOfItems, feastDamage, feastFeet, feastTargets, felLashTalents, freeDevourBy, glaiveWardValue, hoardRefusal,
  inDemonShape, ironWillLines, legionBanes, legionFeet, NO_ONE, pickedKeys, silenceFor, silenceVerdict, skullRefusal, skullRounds,
  swallowReaches, sweepDamage, talentQueryRefusal, tasteFill, tasteRefusal, trueFormOf, turnTheirFire
} from "../rules/demon-hunter-talents.mjs";
import { realPowerOf } from "../rules/demon-hunter-features.mjs";
import { DEVOUR_SOUL, FEL_LASH, markStruck, movesSpectralSight, struckThisRound } from "../rules/demon-hunter-features.mjs";
import { HATRED } from "../rules/hatred.mjs";
import { patchRowsOf } from "../rules/class-talents.mjs";
import { talentEffect } from "../rules/talent-effects.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { reachHeld } from "../rules/distance.mjs";
import { creatureSnapshot, kindsOf } from "../rules/creature-kinds.mjs";
import { sustainOf, spellCasterOf } from "../rules/dispel.mjs";
import { demonHunterPick, dhPoolOf, gainHatred, holds, holdsMana, isUnleashed, kindsOfActor, manaFactsOf } from "./demon-hunter-features.mjs";

/** The query every write on another client's creature is asked through (`module/queries.mjs`). */
export const DH_TALENTS_QUERY = "azeroth-rpg.demonHunterTalents";

/** The hunter's flag naming the creatures a talent gives to a devour with no Reaction (Sweeping Arc, Tear the Soul). */
export const FREE_DEVOUR_FLAG = "dhFreeDevour";

const SCOPE = "azeroth-rpg";
const int = v => Math.trunc(Number(v)) || 0;
const values = c => [...(c?.values?.() ?? c ?? [])];
const t = (key, data = {}) => globalThis.game?.i18n?.format?.(key, data) ?? key;
const get = uuid => { try { return uuid ? fromUuidSync(uuid) : null; } catch { return null; } };
const now = () => Number(globalThis.game?.time?.worldTime) || 0;
const tierOf = actor => Math.min(4, Math.max(1, int(actor?.system?.tier) || 1));
const modOf = (actor, key) => int(actor?.system?.abilities?.[key]?.mod);
const docOf = token => token?.document ?? token ?? null;
const talentsOf = actor => actor?.takenTalents?.() ?? [];
const rankOf = (actor, identifier) => dhRankIn(talentsOf(actor), identifier);
const patchesOn = (actor, feature) => patchRowsOf(talentsOf(actor), feature, talentEffect);
const escape = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Whether this client must ask a GM to write on `actors` and none is online (D-774). */
const noGM = actors => gmAbsentFor({ owned: (actors ?? []).map(a => a?.isOwner === true), isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });

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

/**
 * **ONE A TURN OR ONE A ROUND, MARKED** (04's Sweeping Arc: *once a turn*; Hobbling Reap, Endless Appetite: *once
 * a round*): the combatant's round record in a fight, a round of the world's clock out of one (MY READING,
 * D-778's). Answers whether this call took the mark.
 */
async function takeOnce(actor, mark, { perTurn = false } = {}) {
  const mine = combatantOf(actor);
  if (mine) {
    const fight = mine.combat;
    const key = perTurn ? `${mark}@${fight.turn}` : mark;
    if (usedOf(mine).includes(key)) return false;
    return (await mine.markRoundOnce(key))?.added === true;
  }
  const flag = `once.${mark}`;
  const last = actor.getFlag?.(SCOPE, flag);
  if (last !== undefined && last !== null && now() - Number(last) < 6) return false;
  await actor.setFlag(SCOPE, flag, now());
  return true;
}

/** Whether a once is still open, asked without taking it. */
function onceOpen(actor, mark, { perTurn = false } = {}) {
  const mine = combatantOf(actor);
  if (mine) return !usedOf(mine).includes(perTurn ? `${mark}@${mine.combat.turn}` : mark);
  const last = actor.getFlag?.(SCOPE, `once.${mark}`);
  return last === undefined || last === null || now() - Number(last) >= 6;
}

/** The hunter's token on the viewed scene, or null. */
function tokenOnScene(actor) {
  const own = docOf(actor?.getActiveTokens?.(true)?.[0] ?? null);
  return own?.parent && own.parent.id === globalThis.canvas?.scene?.id ? own : null;
}

/**
 * One Energy pool written by a delta through the pool queue, by the Demon Hunter class item's `itemId`: the
 * hunter's own, or the ONE Energy pool it shares with a Rogue or a Chromatic Champion (02 §10, D-1723), which the
 * class item names as a member and the write lands on the holder, mirrored.
 */
async function gainEnergy(actor, amount) {
  const n = Math.max(0, int(amount));
  if (!n) return 0;
  const pool = dhPoolOf(actor, "power", "energy");
  if (!pool) return 0;
  const { adjustPool } = await import("../documents/pool-writes.mjs");
  const moved = await adjustPool(actor, { kind: "power", name: "energy", itemId: pool.itemId ?? null }, n);
  return Math.max(0, int(moved?.after) - int(moved?.before));
}

/**
 * **A CHOICE THE QUENCH BATCH ANSWERS** (`setDemonHunterPick`'s sibling): a function `(kind, options) => key | keys
 * | null` answering the talents' choosers without a dialog, or null for the one chooser (`workflows.chooseOption`).
 */
let choiceOverride = null;
export function setDhTalentChoice(fn = null) {
  choiceOverride = typeof fn === "function" ? fn : null;
}

/**
 * The one chooser, or the batch's answer - **in the chooser's own shapes** (the review's H1): the option itself where
 * `max` is 1, a list where it is more, and null for a dismissal or for nothing ticked. A caller reads the answer
 * through `pickedKeys`, never as a list.
 */
async function choose(kind, item, options, { prompt = null, max = 1 } = {}) {
  if (choiceOverride) {
    const answer = await choiceOverride(kind, options);
    if (answer === null || answer === undefined) return null;
    if (max > 1) {
      const list = (Array.isArray(answer) ? answer : [answer]).map(k => options.find(o => o.key === k)).filter(o => o && o.available !== false);
      return list.length ? list : null;
    }
    const one = options.find(o => o.key === (Array.isArray(answer) ? answer[0] : answer));
    return one && one.available !== false ? one : null;
  }
  return game.system.azeroth.workflows.chooseOption(item, options, null, { prompt, max });
}

/** The chooser's "no one" row (the review's H1), so ticking nobody is a choice and not a dismissal. */
const noOneRow = () => ({ key: NO_ONE, name: t("AZEROTH.DemonHunter.Talent.NoOne"), description: "" });

/* ------------------------------------------------------------------ */
/*  A talent's Use                                                      */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A DEMON HUNTER TALENT'S USE NEEDS, ASKED BEFORE ANYTHING IS PAID** (D-768's order), handed across by
 * `judgeDemonHunterUse` for `onUse.dh.talent`. Null refuses the Use, said in words.
 *
 * @returns {Promise<object|null>}  the plan `landDhTalentUse` lands
 */
export async function judgeDhTalentUse({ actor, item, onUse = {}, rank = 1, list = [] } = {}) {
  const kind = onUse?.dh?.talent ?? null;
  const name = item?.name ?? "";
  const r = Math.max(1, int(rank) || int(item?.system?.rank) || 1);
  switch (kind) {
    case "taste": {
      const pool = (actor.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === HATRED) ?? null;
      const refused = tasteRefusal({ holdsHatred: Boolean(pool), unleashed: isUnleashed(actor) });
      if (refused) return refuse(`AZEROTH.DemonHunter.Talent.Taste.Refuse.${refused}`, { name });
      return { key: "talent", talent: kind };
    }
    case "skull": {
      const refused = skullRefusal({ shapeKind: actor.shape?.kind ?? null });
      if (refused) return refuse(`AZEROTH.DemonHunter.Talent.Skull.Refuse.${refused}`, { name });
      return { key: "talent", talent: kind, rounds: skullRounds(r) };
    }
    case "chaosBlast": {
      // *While you are in the demon's shape Demon Unleashed or Gift of the Skull gives you*: the shape, asked first;
      // the creature within 60 feet is the Use's own `aim`, asked by the door before this.
      if (!inDemonShape(actor.shape?.kind ?? null)) return refuse("AZEROTH.DemonHunter.Talent.NeedsShape", { name });
      return { key: "talent", talent: kind };
    }
    case "glaiveWard": {
      const schools = Object.keys(CONFIG.AZEROTH?.schools ?? {});
      const options = schools.map(key => ({ key, name: game.i18n.localize(CONFIG.AZEROTH.schools[key]), description: "" }));
      const pick = await choose("glaiveWard", item, options, { prompt: t("AZEROTH.DemonHunter.Talent.GlaiveWard.Prompt", { name }) });
      if (!pick) return null;
      return { key: "talent", talent: kind, school: pick.key, value: glaiveWardValue(r) };
    }
    case "silence": {
      const own = tokenOnScene(actor);
      if (!own) return refuse("AZEROTH.DemonHunter.Talent.NoToken", { name });
      if (!game.users?.activeGM && !game.user?.isGM) return refuse("AZEROTH.DemonHunter.NoGM", { name });
      const { feetApart } = await import("../canvas/footprints.mjs");
      const rows = silenceFor(values(own.parent.tokens).filter(tk => tk.actor && tk.id !== own.id && !tk.hidden).map(tk => ({ uuid: tk.actor.uuid, name: tk.name ?? tk.actor.name, feet: feetApart(own, tk) })));
      const near = rows.filter(row => row.available);
      let chosen = [];
      if (near.length) {
        // One option or a list, never mapped as a list blind; "no one" chooses nobody (the review's H1).
        const picks = await choose("silence", item, [...near.map(row => ({ key: row.uuid, name: row.name, description: "" })), noOneRow()],
          { prompt: t("AZEROTH.DemonHunter.Talent.Silence.Prompt", { name, feet: SILENCE_THE_WEAVE.feet }), max: near.length + 1 });
        const keys = pickedKeys(picks);
        if (keys === null) return null;
        chosen = keys;
      }
      return { key: "talent", talent: kind, sceneId: own.parent.id, tokenId: own.id, chosen };
    }
    default:
      return refuse("AZEROTH.DemonHunter.Unknown", { name });
  }
}

/**
 * **WHAT A DEMON HUNTER TALENT'S USE DOES, NOW THAT IT IS PAID FOR**: the lines its card prints.
 *
 * @returns {Promise<string[]>}
 */
export async function landDhTalentUse({ actor, item, plan } = {}) {
  switch (plan?.talent) {
    case "taste": return landTaste(actor, item);
    case "skull": return landSkull(actor, item, plan);
    case "chaosBlast": return [];
    case "glaiveWard": return landGlaiveWard(actor, item, plan);
    case "silence": return landSilence(actor, item, plan);
    default: return [];
  }
}

/**
 * **TASTE OF POWER** (04: *gain 1 Fel Corruption, with no Test. Your Hatred fills to your cap and you gain 3
 * Energy*): the Fel through the unresisted door first, then the cap read again (the Fel just gained can raise it),
 * the fill under its named source, and the Energy.
 */
async function landTaste(actor, item) {
  const lines = [];
  await game.system.azeroth.workflows.accrueCorruption(actor, {
    track: "fel", points: TASTE_OF_POWER.fel, occasion: t("AZEROTH.DemonHunter.Talent.Taste.Occasion", { name: item?.name ?? TASTE_OF_POWER.name })
  });
  lines.push(t("AZEROTH.DemonHunter.Talent.Taste.Fel", { name: actor.name, n: TASTE_OF_POWER.fel }));
  const pool = (actor.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === HATRED) ?? null;
  const fill = tasteFill({ held: pool?.value ?? 0, cap: pool?.max ?? 0 });
  if (fill > 0) {
    const gain = await gainHatred(actor, fill, TASTE_OF_POWER.source);
    if (gain.line) lines.push(gain.line);
  }
  const energy = await gainEnergy(actor, TASTE_OF_POWER.energy);
  lines.push(t("AZEROTH.DemonHunter.Talent.EnergyGained", { name: actor.name, n: energy }));
  return lines;
}

/**
 * **GIFT OF THE SKULL** (04): the `skull` shape (`rules/shapes.mjs#SHAPE_KINDS.skull`), an overlay with no block -
 * the hunter's own statistics, 1 Armor Point on every location on the effect, 1 Damage Rating at the attack door -
 * for the rank plus 1 rounds (the fight's, or the world's clock out of one: Q13).
 */
async function landSkull(actor, item, plan) {
  const { takeShape } = await import("../documents/shapes.mjs");
  const form = {
    uuid: null, name: GIFT_OF_THE_SKULL.name, abilities: { str: null, dex: null, con: null }, defense: null,
    ap: { body: null, head: null, limb: null }, speed: null, flies: false, movementSenses: [],
    size: actor.system?.size ?? "medium", tier: 4, attacks: [], token: null, portrait: null
  };
  const shaped = await takeShape(actor, { kind: GIFT_OF_THE_SKULL.kind, forms: [form], ward: null });
  if (!shaped) return [t("AZEROTH.DemonHunter.Talent.Skull.NotTaken", { name: actor.name })];
  const { roundsOrClock } = await import("./durations.mjs");
  const lasts = roundsOrClock(actor, plan.rounds);
  const effect = actor.effects.get(shaped.id) ?? shaped;
  if (lasts?.duration) await effect.update({ duration: lasts.duration, start: lasts.start ?? effect.start, img: item?.img || effect.img });
  return [t("AZEROTH.DemonHunter.Talent.Skull.Taken", { name: actor.name, n: plan.rounds })];
}

/**
 * **GLAIVE WARD** (04: *You gain Ward equal to your rank plus 1 against that spell's school for that casting*): a
 * laid Ward (D-774's rule: a Ward a door reads is an effect), a `final` change on `system.ward.<school>`, spanned to
 * the end of the turn the casting is made in - the current creature's turn in a fight, a round of the world's
 * clock out of one (MY READING of *that casting*). One at a time: a second replaces the first.
 */
async function landGlaiveWard(actor, item, plan) {
  const held = values(actor.effects).filter(e => e.flags?.[SCOPE]?.[GLAIVE_WARD.flag]).map(e => e.id);
  if (held.length) await actor.deleteEmbeddedDocuments("ActiveEffect", held);
  const fight = actor.activeFight?.() ?? null;
  const { clockRounds } = await import("./durations.mjs");
  const span = fight?.started && fight.combatant
    ? { duration: { value: 1, units: "turns", expiry: "turnEnd" }, start: { combat: fight.id, combatant: fight.combatant.id, round: fight.round, turn: fight.turn, time: now() } }
    : clockRounds(1);
  const school = game.i18n.localize(CONFIG.AZEROTH.schools[plan.school] ?? plan.school);
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: `${item?.name ?? GLAIVE_WARD.name} (${school})`, img: item?.img || "icons/magic/defensive/shield-barrier-glowing-triangle-green.webp",
    origin: actor.uuid, ...(span ?? {}), showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    system: { changes: [{ key: `system.ward.${plan.school}`, type: "add", value: String(plan.value), phase: "final" }] },
    flags: { [SCOPE]: { [GLAIVE_WARD.flag]: { school: plan.school, value: plan.value } } }
  }]);
  return [t("AZEROTH.DemonHunter.Talent.GlaiveWard.Laid", { name: actor.name, n: plan.value, school })];
}

/**
 * **SILENCE THE WEAVE** (04): the spells and spell effects within 30 feet ended on the GM's client (`silenceHere`),
 * then a Bane on every Casting Test for 10 minutes on each creature chosen, laid through the one Bane door
 * (`effects/banes.mjs#layBane`, `lasting`).
 */
async function landSilence(actor, item, plan) {
  const lines = [];
  const done = await askGM({ act: "silence", byUuid: actor.uuid, sceneId: plan.sceneId, tokenId: plan.tokenId });
  if (!done?.ok) lines.push(t("AZEROTH.DemonHunter.Talent.Silence.NotDone", { name: item?.name ?? SILENCE_THE_WEAVE.name }));
  else {
    lines.push(done.ended?.length ? t("AZEROTH.DemonHunter.Talent.Silence.Ended", { names: done.ended.join(", ") }) : t("AZEROTH.DemonHunter.Talent.Silence.Nothing"));
    if (done.held?.length) lines.push(t("AZEROTH.DemonHunter.Talent.Silence.Held", { names: done.held.join(", ") }));
  }
  const { layBane } = await import("./banes.mjs");
  const { minuteSpan } = await import("./durations.mjs");
  for (const uuid of plan.chosen ?? []) {
    const victim = get(uuid);
    if (!victim) continue;
    const laid = await layBane({ victim, kind: SILENCE_THE_WEAVE.baneOn, banes: SILENCE_THE_WEAVE.banes, source: item?.name ?? SILENCE_THE_WEAVE.name, by: actor, lasting: true, span: minuteSpan(victim, SILENCE_THE_WEAVE.minutes) });
    lines.push(t(laid ? "AZEROTH.DemonHunter.Talent.Silence.Bane" : "AZEROTH.DemonHunter.Talent.Silence.NoBane", { name: victim.name, minutes: SILENCE_THE_WEAVE.minutes }));
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Demon Unleashed: Eternal Hunger and Betrayer's Bargain             */
/* ------------------------------------------------------------------ */

/**
 * **BETRAYER'S BARGAIN, ASKED BEFORE ANYTHING IS PAID** (04: *When you use Demon Unleashed, you may make it last
 * until you finish a Short Rest*): where the talent is taken, the one chooser asks; a dismissal makes no Use.
 * Answers `{bargain: boolean}` or null.
 *
 * @param {Actor} actor
 * @param {Item} item
 * @param {number|null} fel  the patch's Fel (`unleashedTalents`' `bargain`)
 */
export async function bargainChoice(actor, item, fel) {
  if (fel === null || fel === undefined) return { bargain: false };
  const options = [
    { key: "rounds", name: t("AZEROTH.DemonHunter.Talent.Bargain.Rounds"), description: "" },
    { key: "bargain", name: t("AZEROTH.DemonHunter.Talent.Bargain.Rest", { n: fel }), description: t("AZEROTH.DemonHunter.Talent.Bargain.Hostile") }
  ];
  const pick = await choose("bargain", item, options, { prompt: t("AZEROTH.DemonHunter.Talent.Bargain.Prompt", { name: BETRAYERS_BARGAIN.name }) });
  if (!pick) return null;
  return { bargain: pick.key === "bargain" };
}

/**
 * **BETRAYER'S BARGAIN, ENDED** (04: *gain 5 Fel Corruption when it ends, with no Test*): the shape's effect gone for
 * any reason - the rest that ends it, the hunter leaving it, a GM's hand - lands the Fel once, on the client that
 * answers for the hunter.
 */
export async function bargainEnded(actor, effect) {
  const fel = int(effect?.flags?.[SCOPE]?.unleashed?.bargainFel) || BETRAYERS_BARGAIN.fel;
  await game.system.azeroth.workflows.accrueCorruption(actor, {
    track: "fel", points: fel, occasion: t("AZEROTH.DemonHunter.Talent.Bargain.Occasion", { name: BETRAYERS_BARGAIN.name })
  });
  ui.notifications?.info(t("AZEROTH.DemonHunter.Talent.Bargain.Ended", { name: actor.name, n: fel }));
  return fel;
}

/* ------------------------------------------------------------------ */
/*  Hunter's Leap: Fall Upon Them                                       */
/* ------------------------------------------------------------------ */

/**
 * **WHAT FINISHING A HUNTER'S LEAP DOES** (04's Fall Upon Them: *When you finish a Hunter's Leap while you are in
 * the demon's shape ... each creature within 5 feet of where you land makes a Body Resilience Test against your
 * Spell DC. On a failure it takes Fel damage equal to your tier and falls Prone*): one splash Test card a creature
 * (`area-strikes.mjs#postSplashTest`, the pattern for a Test with no Region), rolled by its owner, its failure
 * landed through `strikeFromArea`. Every creature but the hunter, whoever's side (04: *each creature*).
 *
 * @param {Actor} actor
 * @param {{doc?: TokenDocument|null, to?: {x: number, y: number}|null}} leap
 * @returns {Promise<string[]>}
 */
export async function afterHuntersLeap(actor, { doc = null, to = null } = {}) {
  const lines = [];
  const falls = patchesOn(actor, "Hunter's Leap").some(r => r.patch?.dh?.fall);
  if (!falls || !inDemonShape(actor.shape?.kind ?? null) || !doc?.parent) return lines;
  const { feetApart } = await import("../canvas/footprints.mjs");
  const { postSplashTest } = await import("./area-strikes.mjs");
  const at = to ? { x: to.x, y: to.y } : {};
  const check = { on: "turn", resilience: FALL_UPON_THEM.resilience, where: "", gate: "", exempt: "",
    fail: { rating: tierOf(actor), school: FALL_UPON_THEM.type, statuses: [FALL_UPON_THEM.condition], bane: "", until: "", lose: false, kinds: [] },
    success: { statuses: [], until: "" } };
  for (const tk of values(doc.parent.tokens)) {
    const victim = tk.actor;
    if (!victim || tk.id === doc.id || tk.hidden) continue;
    const feet = feetApart(doc, tk, { from: at });
    if (!(typeof feet === "number" && feet <= FALL_UPON_THEM.feet + 1e-6)) continue;
    await postSplashTest({ actor: victim, token: tk, check, caster: actor, spell: { name: FALL_UPON_THEM.name, school: null, feature: true },
      dc: actor.system?.spellDC ?? null, around: actor.name, feet: FALL_UPON_THEM.feet });
    lines.push(t("AZEROTH.DemonHunter.Talent.Fall.Test", { name: tk.name ?? victim.name }));
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Beyond Limits: Steady Footing                                       */
/* ------------------------------------------------------------------ */

/**
 * **STEADY FOOTING** (04: *Whichever Beyond Limits choice you make, it also ends Slowed and Entangled on you*): the
 * patch on Beyond Limits read, and each condition the hunter carries taken off. Answers the card's line.
 */
export async function steadyFooting(actor) {
  const ends = patchesOn(actor, "Beyond Limits").flatMap(r => r.patch?.dh?.ends ?? []);
  if (!ends.length) return null;
  const off = [];
  for (const id of [...new Set(ends)].filter(c => STEADY_FOOTING.ends.includes(c))) {
    if (actor.statuses?.has?.(id) !== true) continue;
    await actor.toggleStatusEffect(id, { active: false });
    off.push(game.i18n.localize(CONFIG.AZEROTH.conditions?.[id] ?? id));
  }
  return off.length ? t("AZEROTH.DemonHunter.Talent.Steady.Ended", { name: actor.name, conditions: off.join(", ") }) : null;
}

/* ------------------------------------------------------------------ */
/*  Fel Lash's talents                                                  */
/* ------------------------------------------------------------------ */

/** Demon's Due's promise on the hunter, or null. */
function demonsDueOf(actor) {
  return values(actor?.effects).find(e => e.active !== false && e.flags?.[SCOPE]?.[DEMONS_DUE.flag]) ?? null;
}

/**
 * **WHAT THE TALENTS DO TO ONE FEL LASH** (04's Fel-Tempered, Demon's Due, Tear the Soul, Gorging Lash, Feed on
 * Power), off the patches on 02's Fel Lash: worked out off the first creature the card records, and Demon's Due's
 * promise taken whether the attack hits or misses (*your next Fel Lash*). Called by the class's on-hit door where
 * the Fel Lash line was paid.
 *
 * @returns {Promise<{more: number, heal: number, energy: number, freeDevour: boolean, by: string[]}>}
 */
export async function lashTalentsFor(actor, { first = null } = {}) {
  const due = demonsDueOf(actor);
  const victim = first?.actor ?? null;
  const out = felLashTalents(patchesOn(actor, FEL_LASH.feature), {
    due: Boolean(due),
    below: Boolean(victim) && belowHalf({ value: victim.system?.health?.value ?? 0, max: victim.system?.health?.max ?? 0 }),
    reaches: Boolean(victim) && (kindsOfActor(victim).has("demon") || holdsMana(victim))
  });
  if (due && actor.effects.has(due.id)) await actor.deleteEmbeddedDocuments("ActiveEffect", [due.id]);
  return out;
}

/**
 * **WHAT FEL LASH'S TALENTS LAND ON A HIT** (Gorging Lash's Health, Feed on Power's Energy, Tear the Soul's free
 * devour): the lines for the card.
 */
export async function lashTalentsLand(actor, { extra, first = null } = {}) {
  const lines = [];
  if (extra?.heal > 0) {
    const before = actor.system?.health?.value ?? 0;
    await actor.applyHealing(extra.heal, { from: actor, feature: true, featureName: FEL_LASH.feature });
    lines.push(t("AZEROTH.DemonHunter.Talent.Gorging", { name: actor.name, n: Math.max(0, (actor.system?.health?.value ?? before) - before) }));
  }
  if (extra?.energy > 0) {
    const n = await gainEnergy(actor, extra.energy);
    lines.push(t("AZEROTH.DemonHunter.Talent.FeedOnPower", { name: actor.name, n, talent: "Feed on Power" }));
  }
  // 04's Tear the Soul: *If the blow drops it to 0 Health* - the creature is marked for THIS blow, and the free devour
  // is given only when the damage door sees that blow drop it (`tearLands`, the review's L15).
  if (extra?.freeDevour && first?.actor) await markTear(actor, first.actor.uuid);
  return lines;
}

/** The hunter's flag naming the creature a Tear the Soul blow is struck at (the review's L15). */
export const TEAR_FLAG = "dhTear";

/** The creature a Fel Lash with Tear the Soul hit, held for the blow's damage to land. */
async function markTear(actor, uuid) {
  if (!actor?.isOwner || !uuid) return;
  const fight = actor.activeFight?.() ?? null;
  const when = { combatId: fight?.started ? fight.id : null, round: fight?.round ?? null, time: now() };
  await actor.setFlag(SCOPE, TEAR_FLAG, markStruck(null, uuid, when));
}

/**
 * **TEAR THE SOUL, LANDED** (04: *If the blow drops it to 0 Health, you may use Soul Hunger or Devour Soul on it
 * without spending your Reaction*; the review's L15): asked by the damage door (`demon-hunter-features.mjs
 * #noteDamagedBy`) for an attack's blow that drops the creature to 0; where a Tear the Soul hit named it this round,
 * the free devour is given and the mark spent. Any other blow gives nothing.
 */
export async function tearLands(actor, victim) {
  if (!actor?.isOwner || !victim) return false;
  const fight = actor.activeFight?.() ?? null;
  const named = struckThisRound(actor.getFlag?.(SCOPE, TEAR_FLAG) ?? null, { combatId: fight?.started ? fight.id : null, round: fight?.round ?? null, time: now() });
  if (!named.includes(victim.uuid)) return false;
  await actor.unsetFlag(SCOPE, TEAR_FLAG);
  await markFreeDevour(actor, victim.uuid);
  return true;
}

/** The creature named for a devour with no Reaction this round (Sweeping Arc's and Tear the Soul's). */
export async function markFreeDevour(actor, uuid) {
  if (!actor?.isOwner || !uuid) return;
  const fight = actor.activeFight?.() ?? null;
  const when = { combatId: fight?.started ? fight.id : null, round: fight?.round ?? null, time: now() };
  await actor.setFlag(SCOPE, FREE_DEVOUR_FLAG, markStruck(actor.getFlag(SCOPE, FREE_DEVOUR_FLAG) ?? null, uuid, when));
}

/** A creature taken back off the free devour's list (a sweep that did not drop it). */
async function unmarkFreeDevour(actor, uuid) {
  const record = actor.getFlag(SCOPE, FREE_DEVOUR_FLAG) ?? null;
  if (!record || !Array.isArray(record.uuids) || !record.uuids.includes(uuid)) return;
  await actor.setFlag(SCOPE, FREE_DEVOUR_FLAG, { ...record, uuids: record.uuids.filter(u => u !== uuid) });
}

/** The round's record of who the hunter struck (Devour Soul's *a creature you damaged this round*), one more. */
async function noteStruck(actor, uuid) {
  if (!actor?.isOwner) return;
  const fight = actor.activeFight?.() ?? null;
  const when = { combatId: fight?.started ? fight.id : null, round: fight?.round ?? null, time: now() };
  await actor.setFlag(SCOPE, DEVOUR_SOUL.flag, markStruck(actor.getFlag(SCOPE, DEVOUR_SOUL.flag) ?? null, uuid, when));
}

/* ------------------------------------------------------------------ */
/*  A hit's own talents: Sweeping Arc and Hobbling Reap                 */
/* ------------------------------------------------------------------ */

/**
 * **THE SOULEATER'S SCYTHE ON A HIT** (04's Sweeping Arc and Hobbling Reap), from the class's on-hit door: a weapon
 * attack's hit with a scythe in two hands (`wield.mjs#wieldFacts`' `scytheTwoHands`).
 *
 * - **Sweeping Arc**, once a turn: one other enemy within the hunter's reach (chosen where there are more) takes
 *   Shadow damage equal to half the Wisdom modifier, at least 1, through the area strike's door on the GM's client;
 *   a drop to 0 gives it to a devour with no Reaction.
 * - **Hobbling Reap**, once a round: the creature struck is Slowed until the end of its next turn, through the one
 *   condition door (`effects/inflict.mjs#inflictCondition`).
 *
 * @returns {Promise<object[]>}  fired rows for the card
 */
export async function dhTalentsOnHit({ actor, hit = false, list = [], weaponAttack = true } = {}) {
  const fired = [];
  if (!hit || !weaponAttack || !actor || actor.type !== "character") return fired;
  const sweep = rankOf(actor, SWEEPING_ARC.identifier) > 0;
  const hobble = rankOf(actor, HOBBLING_REAP.identifier) > 0;
  if (!sweep && !hobble) return fired;
  if (actor.gateFacts?.(null)?.wield?.scytheTwoHands !== true) return fired;
  const { targetActorOf } = await import("../dice/annotate.mjs");
  const victims = (list ?? []).map(row => ({ row, actor: targetActorOf(row) })).filter(v => v.actor);
  const first = victims[0] ?? null;
  if (hobble && first && await takeOnce(actor, HOBBLING_REAP.mark)) {
    const { inflictCondition } = await import("./inflict.mjs");
    const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
    const landed = await inflictCondition({ victim: first.actor, id: HOBBLING_REAP.condition, by: actor, name: first.row?.name ?? first.actor.name, until: untilEndOfNextTurnOrRound(first.actor) });
    fired.push({ key: "talent", name: HOBBLING_REAP.name, text: t(landed?.landed ? "AZEROTH.DemonHunter.Talent.Hobbling.Landed" : "AZEROTH.DemonHunter.Talent.Hobbling.NotLanded", { target: first.row?.name ?? first.actor.name }) });
  }
  if (sweep && first && onceOpen(actor, SWEEPING_ARC.mark, { perTurn: true })) {
    const line = await sweepingArc(actor, first);
    if (line) fired.push({ key: "talent", name: SWEEPING_ARC.name, text: line });
  }
  return fired;
}

/** Sweeping Arc's other enemy, chosen and struck. Answers the card's line, or null where nobody stands in reach. */
async function sweepingArc(actor, first) {
  const own = tokenOnScene(actor);
  if (!own) return null;
  const { feetApart } = await import("../canvas/footprints.mjs");
  const { relationTo } = await import("./area-strikes.mjs");
  const reach = reachHeld((actor.readyWeapons?.() ?? []).map(w => w.system ?? {}));
  const firstToken = first.row?.tokenId ? own.parent.tokens.get(first.row.tokenId) : null;
  const near = values(own.parent.tokens).filter(tk => {
    const a = tk.actor;
    if (!a || tk.id === own.id || tk.hidden || tk === firstToken || (!firstToken && a === first.actor)) return false;
    if ((a.system?.health?.value ?? 1) <= 0) return false;
    if (relationTo({ caster: actor, casterToken: own, actor: a, token: tk }) !== "enemy") return false;
    const feet = feetApart(own, tk);
    return typeof feet === "number" && feet <= reach + 1e-6;
  });
  if (!near.length) return null;
  let pick = near[0];
  if (near.length > 1) {
    const chosen = await choose("sweep", actor.items.find(i => i.type === "talent" && i.system?.identifier === SWEEPING_ARC.identifier) ?? actor,
      near.map(tk => ({ key: tk.id, name: tk.name ?? tk.actor.name, description: "" })), { prompt: t("AZEROTH.DemonHunter.Talent.Sweep.Prompt", { name: SWEEPING_ARC.name }) });
    if (!chosen) return null;
    pick = near.find(tk => tk.id === chosen.key) ?? null;
    if (!pick) return null;
  }
  const victim = pick.actor;
  if (noGM([victim])) return t("AZEROTH.DemonHunter.NoGM", { name: SWEEPING_ARC.name });
  if (!(await takeOnce(actor, SWEEPING_ARC.mark, { perTurn: true }))) return null;
  const n = sweepDamage(modOf(actor, "wis"));
  // The creature is marked struck and given to a free devour BEFORE the blow, so the death watch's offer finds it.
  await noteStruck(actor, victim.uuid);
  await markFreeDevour(actor, victim.uuid);
  const done = await strikeOn(actor, victim, { amount: n, type: SWEEPING_ARC.type, name: SWEEPING_ARC.name });
  if ((victim.system?.health?.value ?? 1) > 0) await unmarkFreeDevour(actor, victim.uuid);
  return t("AZEROTH.DemonHunter.Talent.Sweep.Landed", { target: pick.name ?? victim.name, n, lines: (done?.lines ?? []).join(" ") });
}

/**
 * **A TALENT'S DAMAGE ON ANOTHER CREATURE** (Sweeping Arc, Turn Their Fire): the area strike's door
 * (`area-strikes.mjs#strikeFromArea` - its Ward, its Armor Points, no attack), here where this client owns the
 * creature, else on the active GM's.
 */
async function strikeOn(actor, victim, { amount, type, name }) {
  if (victim.isOwner) return { lines: await strikeHere(actor, victim, { amount, type, name }) };
  if (!game.users?.activeGM) return { lines: [] };
  return askGM({ act: "strike", byUuid: actor.uuid, victimUuid: victim.uuid, amount, type, name });
}

async function strikeHere(actor, victim, { amount, type, name }) {
  const { strikeFromArea } = await import("./area-strikes.mjs");
  return strikeFromArea({ actor: victim, caster: actor, spell: { name, school: type, feature: true, isSpell: false, takesSpellpower: false }, damage: { rating: Math.max(0, int(amount)), school: type } });
}

/* ------------------------------------------------------------------ */
/*  Devouring                                                           */
/* ------------------------------------------------------------------ */

/**
 * **HOW THIS HUNTER DEVOURS** (02's Devour Soul, 04's Soul Hunger, Reaper's Grip and Endless Appetite), read off the
 * features held and the patches on Devour Soul: the feature that takes the soul, its reach, its Health. Null for a
 * hunter who can devour nothing.
 *
 * @param {Actor} actor
 * @returns {{feature: string, reach: number, heal: number, demonHatred: number}|null}
 */
export function devourProfileOf(actor) {
  if (!actor || actor.type !== "character") return null;
  const rows = patchesOn(actor, DEVOUR_SOUL.feature);
  const rankBy = id => rows.filter(r => r.talent?.identifier === id).reduce((n, r) => n + int(r.rank), 0);
  const soulHunger = rankBy(SOUL_HUNGER.identifier);
  const endless = rankBy(ENDLESS_APPETITE.identifier);
  const reaper = rankOf(actor, REAPERS_GRIP.identifier) > 0 && actor.gateFacts?.(null)?.wield?.scytheTwoHands === true;
  return devourProfile({ devourSoul: holds(actor, DEVOUR_SOUL.feature), soulHunger, endless, scythe: reaper, tier: tierOf(actor), wis: modOf(actor, "wis") });
}

/**
 * **WHETHER THIS DEVOUR COSTS NO REACTION** (04's Sweeping Arc and Tear the Soul name the creature; Endless
 * Appetite's once a round), asked without spending anything: `named`, `endless` or null.
 */
export function freeDevourFor(actor, victim) {
  const fight = actor?.activeFight?.() ?? null;
  const named = struckThisRound(actor?.getFlag?.(SCOPE, FREE_DEVOUR_FLAG) ?? null, { combatId: fight?.started ? fight.id : null, round: fight?.round ?? null, time: now() }).includes(victim?.uuid);
  const endless = patchesOn(actor, DEVOUR_SOUL.feature).filter(r => r.talent?.identifier === ENDLESS_APPETITE.identifier).reduce((n, r) => n + int(r.rank), 0);
  return freeDevourBy({ named, endless, endlessUsed: !onceOpen(actor, ENDLESS_APPETITE.mark) });
}

/** The free devour spent: Endless Appetite's round marked, or the named creature struck off. */
export async function spendFreeDevour(actor, victim, by) {
  if (by === "endless") return takeOnce(actor, ENDLESS_APPETITE.mark);
  if (by === "named") { await unmarkFreeDevour(actor, victim.uuid); return true; }
  return false;
}

/** The Crystalized Souls this hunter made and still holds, counted. */
function soulsHeld(actor) {
  return values(actor?.items).filter(i => i.type === "gear" && i.system?.identifier === HOARDED_SOUL.item && i.flags?.[SCOPE]?.[HOARDED_SOUL.flag]?.maker === actor.uuid)
    .reduce((n, i) => n + Math.max(1, int(i.system?.quantity) || 1), 0);
}

/**
 * **HOARDED SOUL, ASKED BEFORE ANYTHING IS PAID** (04: *you may keep it instead of regaining Health*): where the
 * talent is taken, the one chooser asks - regain the Health, or keep the soul, greyed with its reason where as
 * many are held as the rank. Answers `{keep}`, or null for a dismissal.
 */
export async function hoardChoice(actor, { amount = 0, item = null } = {}) {
  const rows = patchesOn(actor, DEVOUR_SOUL.feature).filter(r => r.patch?.dh?.hoard);
  const rank = rows.reduce((n, r) => n + int(r.rank), 0);
  if (rank < 1) return { keep: false };
  const refused = hoardRefusal({ held: soulsHeld(actor), rank });
  const options = [
    { key: "heal", name: t("AZEROTH.DemonHunter.Talent.Hoard.Heal", { n: amount }), description: "" },
    { key: "keep", name: t("AZEROTH.DemonHunter.Talent.Hoard.Keep", { n: rank }), description: refused ? t(`AZEROTH.DemonHunter.Talent.Hoard.Refuse.${refused}`, { n: rank }) : "", available: !refused }
  ];
  const pick = await choose("hoard", item ?? actor, options, { prompt: t("AZEROTH.DemonHunter.Talent.Hoard.Prompt", { name: HOARDED_SOUL.name }) });
  if (!pick) return null;
  return { keep: pick.key === "keep" };
}

/**
 * **A SOUL KEPT AS A CRYSTALIZED SOUL** (04's Hoarded Soul; the lead, C34: *"add a gear item to the inventory if
 * space allows"*): 08's gear item, made from the pack and created through the bag law (`AzerothItem
 * #_preCreateOperation`), which refuses it where no bag slot is free - and then the soul is lost, said in words. It
 * records its maker and the Health it would have restored.
 */
export async function keepSoul(actor, { heal = 0, from = "" } = {}) {
  const pack = game.packs.get("azeroth-rpg.gear");
  const index = pack ? await pack.getIndex({ fields: ["system.identifier"] }) : null;
  const entry = index ? [...index].find(e => e.system?.identifier === HOARDED_SOUL.item) : null;
  const doc = entry ? await pack.getDocument(entry._id) : null;
  if (!doc) return t("AZEROTH.DemonHunter.Talent.Hoard.Lost", { name: actor.name });
  const data = doc.toObject();
  delete data._id;
  data.system = { ...(data.system ?? {}), quantity: 1, container: null, equipped: false };
  data.flags = { ...(data.flags ?? {}), [SCOPE]: { ...(data.flags?.[SCOPE] ?? {}), [HOARDED_SOUL.flag]: { maker: actor.uuid, heal: Math.max(0, int(heal)), from: String(from ?? "") } } };
  const made = await actor.createEmbeddedDocuments("Item", [data]);
  return made?.length ? t("AZEROTH.DemonHunter.Talent.Hoard.Kept", { name: actor.name, n: Math.max(0, int(heal)) }) : t("AZEROTH.DemonHunter.Talent.Hoard.Lost", { name: actor.name });
}

/**
 * **FEAST OF SOULS, ASKED BEFORE ANYTHING IS PAID** (04: *choose any number of creatures within 5 feet of you for
 * each point of your Wisdom modifier*): the creatures standing in the radius, the devoured one aside, through the one
 * chooser. Answers the uuids chosen (none where none stands or the talent is not taken), or null for a dismissal.
 */
export async function feastChoice(actor, { token = null, victim = null, item = null } = {}) {
  if (rankOf(actor, FEAST_OF_SOULS.identifier) < 1) return [];
  const feet = feastFeet(modOf(actor, "wis"));
  const own = docOf(token);
  if (!(feet > 0) || !own?.parent) return [];
  const { feetApart } = await import("../canvas/footprints.mjs");
  const near = values(own.parent.tokens).filter(tk => {
    const a = tk.actor;
    if (!a || tk.id === own.id || tk.hidden || a === victim) return false;
    const d = feetApart(own, tk);
    return typeof d === "number" && d <= feet + 1e-6;
  });
  if (!near.length) return [];
  // **AN EMPTY PICK IS A CHOICE** (the review's H1): the "no one" row feasts on nobody and the devour goes on; only a
  // dismissal devours nothing. One option or a list, read through `pickedKeys`.
  const picks = await choose("feast", item ?? actor, [...near.map(tk => ({ key: tk.actor.uuid, name: tk.name ?? tk.actor.name, description: "" })), noOneRow()],
    { prompt: t("AZEROTH.DemonHunter.Talent.Feast.Prompt", { name: FEAST_OF_SOULS.name, feet }), max: near.length + 1 });
  return pickedKeys(picks);
}

/**
 * **WHAT A DEVOUR'S TALENTS NEED, ASKED BEFORE ANYTHING IS PAID** (the review's S5): Swallow Their Magic ends spells
 * on the GM's client, so a devour that would reach it with no GM online is refused in words before the Reaction and
 * the Hatred. `{key, data}`, or null.
 */
export function afterDevourRefusal(actor, victim) {
  if (rankOf(actor, SWALLOW_THEIR_MAGIC.identifier) < 1) return null;
  if (!swallowReaches(victim?.poolSnapshot?.() ?? [], { real: victim?.type !== "npc" || realPowerOf(manaFactsOf(victim)) })) return null;
  if (game.user?.isGM || game.users?.activeGM) return null;
  return { key: "AZEROTH.DemonHunter.NoGM", data: { name: SWALLOW_THEIR_MAGIC.name } };
}

/**
 * **WHAT A DEVOUR DOES BESIDE ITS HEALTH** (04's Swallow Their Magic, Demon's Due, Feast of Souls and Kill After
 * Kill), on the hunter's client once the devour has landed: the lines for its card.
 *
 * @param {Actor} actor
 * @param {{victim: Actor, token?: TokenDocument|null, feast?: string[], demon?: boolean}} o
 * @returns {Promise<string[]>}
 */
export async function afterDevour(actor, { victim, token = null, feast = [], demon = false } = {}) {
  const lines = [];
  // **SWALLOW THEIR MAGIC**: *When you devour a creature that held Mana or a Power pool, gain 2 Hatred. Every
  // spell that creature cast and that is still in force ends.*
  // A creature's derived Power floor is no pool it held (the review's H2): a stated maximum or a caster.
  if (rankOf(actor, SWALLOW_THEIR_MAGIC.identifier) > 0 && swallowReaches(victim?.poolSnapshot?.() ?? [], { real: victim?.type !== "npc" || realPowerOf(manaFactsOf(victim)) })) {
    const gain = await gainHatred(actor, SWALLOW_THEIR_MAGIC.hatred, "devour");
    if (gain.line) lines.push(gain.line);
    const done = await askGM({ act: "swallow", byUuid: actor.uuid, victimUuid: victim.uuid });
    lines.push(done?.ok ? t(done.ended?.length ? "AZEROTH.DemonHunter.Talent.Swallow.Ended" : "AZEROTH.DemonHunter.Talent.Swallow.Nothing", { target: victim.name, names: (done.ended ?? []).join(", ") })
      : t("AZEROTH.DemonHunter.Talent.Swallow.NotDone", { target: victim.name }));
  }
  // **DEMON'S DUE**: *When you devour a demon's soul, your next Fel Lash before the end of your next turn costs no
  // Hatred and deals 1 more damage per rank* - a promise on the hunter, its span the end of the next turn.
  if (demon && rankOf(actor, DEMONS_DUE.identifier) > 0) {
    const held = values(actor.effects).filter(e => e.flags?.[SCOPE]?.[DEMONS_DUE.flag]).map(e => e.id);
    if (held.length) await actor.deleteEmbeddedDocuments("ActiveEffect", held);
    const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: DEMONS_DUE.name, img: "icons/magic/unholy/strike-body-explode-disintegrate.webp", origin: actor.uuid, ...untilEndOfNextTurnOrRound(actor),
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      description: `<p>${escape(t("AZEROTH.DemonHunter.Talent.Due.Text", { n: rankOf(actor, DEMONS_DUE.identifier) }))}</p>`,
      flags: { [SCOPE]: { [DEMONS_DUE.flag]: { rank: rankOf(actor, DEMONS_DUE.identifier) } } }
    }]);
    lines.push(t("AZEROTH.DemonHunter.Talent.Due.Laid", { name: actor.name }));
  }
  // **FEAST OF SOULS**: the creatures chosen before anything was paid, their Tests on the GM's client.
  if (feast?.length) {
    const own = docOf(token);
    const done = await askGM({ act: "feast", byUuid: actor.uuid, uuids: feast, victimUuid: victim?.uuid ?? null, sceneId: own?.parent?.id ?? null, tokenId: own?.id ?? null });
    if (done?.ok) {
      lines.push(t("AZEROTH.DemonHunter.Talent.Feast.Done", { failed: (done.failed ?? []).join(", ") || "-", passed: (done.passed ?? []).join(", ") || "-" }));
      if (int(done.kills) > 0) {
        const gain = await gainHatred(actor, int(done.kills) * FEAST_OF_SOULS.hatredPerKill, "devour");
        if (gain.line) lines.push(gain.line);
      }
    } else lines.push(t("AZEROTH.DemonHunter.Talent.Feast.NotDone"));
  }
  // **KILL AFTER KILL**: *you may make a Hunter's Leap without spending Energy or your Reaction*.
  if (patchesOn(actor, "Hunter's Leap").some(r => r.patch?.dh?.free)) lines.push(...await freeLeap(actor, { token }));
  return lines;
}

/**
 * **KILL AFTER KILL'S LEAP** (04): a Hunter's Leap with no Energy and no Reaction, asked through the one chooser (a
 * dismissal leaps nowhere), the space picked on the board, landed by the step door's displacement - and then what
 * finishing a leap does (`afterHuntersLeap`). At rank 2 the next attack this turn takes a Boon, laid on the hunter
 * through the one Boon door and spent by that attack.
 */
export async function freeLeap(actor, { token = null } = {}) {
  const lines = [];
  if (!holds(actor, "Hunter's Leap")) return lines;
  const rank = rankOf(actor, KILL_AFTER_KILL.identifier);
  const item = actor.items.find(i => i.type === "talent" && i.system?.identifier === KILL_AFTER_KILL.identifier) ?? actor;
  const pick = await choose("killLeap", item, [
    { key: "leap", name: t("AZEROTH.DemonHunter.Talent.Kill.Leap"), description: "" },
    { key: "stay", name: t("AZEROTH.DemonHunter.Talent.Kill.Stay"), description: "" }
  ], { prompt: t("AZEROTH.DemonHunter.Talent.Kill.Prompt", { name: KILL_AFTER_KILL.name }) });
  if (pick?.key === "leap") {
    const own = docOf(token) ?? tokenOnScene(actor);
    const { huntersLeapFeet } = await import("../rules/demon-hunter-features.mjs");
    const feet = huntersLeapFeet(modOf(actor, "dex"));
    if (!own?.parent) lines.push(t("AZEROTH.DemonHunter.Leap.Table", { name: actor.name, feet }));
    else {
      const { judgeStep, pickStep, stepTo, steppedWords, stepWords } = await import("./steps.mjs");
      let to = null;
      // The Quench batch's seam for Hunter's Leap's space, the class feature's own (`setDemonHunterPick`).
      const seam = demonHunterPick();
      if (seam) {
        const point = await seam({ actor, feet, token: own });
        const judged = point ? judgeStep(own, point, { feet, sight: "see" }) : null;
        if (judged?.refusal) lines.push(stepWords(judged.refusal, { name: own.name ?? actor.name, feet }));
        else to = judged?.to ?? null;
      } else to = (await pickStep(own, { feet, sight: "see", name: own.name ?? actor.name }))?.to ?? null;
      if (to) {
        const moved = await stepTo({ token: own, to, feet, by: actor, move: { kind: "self", itemUuid: item.uuid } });
        lines.push(steppedWords(moved, { feet, source: KILL_AFTER_KILL.name }));
        lines.push(...await afterHuntersLeap(actor, { doc: own, to }));
      }
    }
  }
  if (rank >= KILL_AFTER_KILL.boonRank) {
    const { layBoon } = await import("./banes.mjs");
    const { untilEndOfTurn, clockRounds } = await import("./durations.mjs");
    const laid = await layBoon({ victim: actor, kind: "attack", boons: KILL_AFTER_KILL.boons, source: KILL_AFTER_KILL.name, by: actor, span: untilEndOfTurn(actor) ?? clockRounds(1) });
    if (laid) lines.push(t("AZEROTH.DemonHunter.Talent.Kill.Boon", { name: actor.name }));
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Hoarded Soul: the Crystalized Soul's Use                            */
/* ------------------------------------------------------------------ */

/**
 * **A CRYSTALIZED SOUL, USED** (04's Hoarded Soul: *As a free action, use one to regain the Health it would have
 * restored, gain 3 Energy, or gain 2 Hatred. Only you can use one you made, and you cannot use one while you are at 0
 * Health*), from `workflows.useGear`: judged (the maker, the Health), the choice asked, then the soul spent - one off
 * the stack - and only then what it gives. No action: a free action costs no budget.
 *
 * @returns {Promise<ChatMessage|null>}
 */
export async function useCrystalizedSoul({ actor, item } = {}) {
  const record = item?.flags?.[SCOPE]?.[HOARDED_SOUL.flag] ?? {};
  const refused = crystalRefusal({ maker: record.maker ?? null, user: actor?.uuid ?? null, health: actor?.system?.health?.value ?? 0 });
  if (refused) return refuse(`AZEROTH.DemonHunter.Talent.Crystal.Refuse.${refused}`, { name: item?.name ?? "" });
  const options = CRYSTAL_CHOICES.map(key => ({ key, name: t(`AZEROTH.DemonHunter.Talent.Crystal.${key}`, { n: crystalGives(key, { heal: record.heal })?.amount ?? 0 }), description: "" }));
  const pick = await choose("crystal", item, options, { prompt: t("AZEROTH.DemonHunter.Talent.Crystal.Prompt", { name: item.name }) });
  if (!pick) return null;
  const quantity = Math.max(1, int(item.system?.quantity) || 1);
  if (quantity > 1) await item.update({ "system.quantity": quantity - 1 });
  else await actor.deleteEmbeddedDocuments("Item", [item.id]);
  const gives = crystalGives(pick.key, { heal: record.heal });
  let line = "";
  if (pick.key === "heal") {
    const before = actor.system?.health?.value ?? 0;
    if (gives.amount > 0) await actor.applyHealing(gives.amount, { from: actor, feature: true, featureName: HOARDED_SOUL.name });
    line = t("AZEROTH.DemonHunter.Talent.Crystal.Healed", { name: actor.name, n: Math.max(0, (actor.system?.health?.value ?? before) - before) });
  } else if (pick.key === "energy") {
    line = t("AZEROTH.DemonHunter.Talent.EnergyGained", { name: actor.name, n: await gainEnergy(actor, gives.amount) });
  } else {
    line = (await gainHatred(actor, gives.amount, "devour")).line ?? "";
  }
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="azeroth azeroth-card azeroth-card-feature"><div class="azeroth-card-body"><p class="azeroth-card-line azeroth-fired"><span>${escape(item.name)}</span><em>${escape(line)}</em></p></div></div>` });
}

/* ------------------------------------------------------------------ */
/*  The Sufferer                                                        */
/* ------------------------------------------------------------------ */

/** Iron Will's line on a Spirit Resilience Test's dialog (`applications/actions.mjs#resilienceWithDialog`). */
export function ironWillLineOffer(actor, resilience) {
  if (!actor || actor.type !== "character") return [];
  return ironWillLines({ rank: dhRankOfItems(actor.items, IRON_WILL.identifier), resilience });
}

/** The ticked line, judged again at the roll: the bonus, or null where it no longer reaches this Test. */
export function judgeIronWillLine(actor, { resilience = null } = {}) {
  const [line] = ironWillLineOffer(actor, resilience);
  return line ? { name: line.name, amount: line.amount } : null;
}

/**
 * **TURN THEIR FIRE** (04: *When you succeed on a Resilience Test against a spell, gain 1 Energy per rank, and the
 * spell's caster takes Fel damage equal to your rank*), from the spell card's Resist door once the success is
 * recorded: the Energy here, the caster's damage through the area strike's door (on the GM's client where this one
 * does not own the caster). Answers the line for a notification.
 */
export async function turnTheirFireOn({ actor, caster = null, spellName = "" } = {}) {
  const rank = dhRankOfItems(actor?.items ?? [], TURN_THEIR_FIRE.identifier);
  if (rank < 1) return null;
  const turn = turnTheirFire(rank);
  const lines = [];
  lines.push(t("AZEROTH.DemonHunter.Talent.EnergyGained", { name: actor.name, n: await gainEnergy(actor, turn.energy) }));
  if (caster && caster !== actor && turn.damage > 0) {
    if (noGM([caster])) lines.push(t("AZEROTH.DemonHunter.NoGM", { name: TURN_THEIR_FIRE.name }));
    else {
      const done = await strikeOn(actor, caster, { amount: turn.damage, type: TURN_THEIR_FIRE.type, name: TURN_THEIR_FIRE.name });
      lines.push(t("AZEROTH.DemonHunter.Talent.TurnFire.Struck", { target: caster.name, n: turn.damage, spell: spellName, lines: (done?.lines ?? []).join(" ") }));
    }
  }
  return lines.join(" ");
}

/**
 * **REFUSE THE LEGION ON A DEMON'S CASTING TEST** (04: *When a demon casts a spell at a creature within 5 feet of you
 * for each point of half your Wisdom modifier, rounded down, and at least 5 feet, its Casting Test takes a Bane*):
 * every hunter on the caster's scene holding the talent, measured footprint to footprint (D-732) to each creature the
 * spell names. Answers `{banes, by}`.
 *
 * @param {Actor} caster
 * @param {Array<object>} list  the cast's target snapshots
 */
export async function refuseLegionAt(caster, list = []) {
  const demon = kindsOf(creatureSnapshot({ type: caster?.type, system: caster?.system })).has("demon");
  if (!demon || !(list ?? []).length) return { banes: 0, by: [] };
  const { feetApart } = await import("../canvas/footprints.mjs");
  const { targetActorOf } = await import("../dice/annotate.mjs");
  const rows = [];
  const scenes = new Set((list ?? []).map(r => game.scenes?.get(r?.sceneId ?? globalThis.canvas?.scene?.id ?? "")).filter(Boolean));
  for (const scene of scenes) {
    const targets = (list ?? []).map(r => (r?.tokenId ? scene.tokens.get(r.tokenId) : values(scene.tokens).find(tk => tk.actor === targetActorOf(r)))).filter(Boolean);
    for (const tk of values(scene.tokens)) {
      const hunter = tk.actor;
      if (hunter?.type !== "character" || dhRankOfItems(hunter.items, REFUSE_THE_LEGION.identifier) < 1) continue;
      const radius = legionFeet(modOf(hunter, "wis"));
      const feet = Math.min(...targets.map(x => (x === tk ? 0 : feetApart(tk, x))).filter(v => typeof v === "number"), Infinity);
      rows.push({ name: tk.name ?? hunter.name, feet: Number.isFinite(feet) ? feet : null, radius });
    }
  }
  return legionBanes({ demon, rows });
}

/** Whether an effect about to be laid on a hunter is a Charm a demon laid (04's Refuse the Legion). */
export function legionCharmRefused(actor, data = {}) {
  if (actor?.type !== "character" || dhRankOfItems(actor.items, REFUSE_THE_LEGION.identifier) < 1) return false;
  const statuses = [...(data.statuses ?? [])];
  if (!statuses.includes(REFUSE_THE_LEGION.condition)) return false;
  const origin = get(data.origin ?? null);
  const source = origin?.documentName === "Actor" ? origin : (origin?.actor ?? origin?.parent ?? null);
  return Boolean(source && source !== actor && source.documentName === "Actor" && kindsOfActor(source).has("demon"));
}

/* ------------------------------------------------------------------ */
/*  Ending spells: Swallow Their Magic and Silence the Weave            */
/* ------------------------------------------------------------------ */

/** A laid effect's spell tier: the spell its flag names, else the card that laid it, else null. */
function tierOfEffect(effect) {
  const f = effect?.flags?.[SCOPE] ?? {};
  const spell = typeof f.spell === "string" ? get(f.spell) : null;
  if (Number.isFinite(Number(spell?.system?.tier))) return int(spell.system.tier);
  const card = f.messageId ? game.messages?.get(f.messageId) : null;
  const tier = card?.flags?.[SCOPE]?.tier ?? card?.flags?.[SCOPE]?.spellTier ?? null;
  return Number.isFinite(Number(tier)) && tier !== null ? int(tier) : null;
}

/** Every actor standing on the board, once each: world actors with a linked token and every token actor. */
function boardActors() {
  const out = new Map();
  for (const scene of values(game.scenes)) for (const tk of values(scene.tokens)) if (tk.actor) out.set(tk.actor.uuid, { actor: tk.actor, token: tk });
  return [...out.values()];
}

/**
 * **END EVERY SPELL A PREDICATE NAMES** (on the GM's client): Sustains through `workflows.endSustain` matched on the
 * cast (D-760's one door, so its effects, its area and its upkeep go together), then each laid spell effect no Sustain
 * took (`dispel.mjs#spellCasterOf`), then each timed area a spell placed (`canvas/sustained-areas.mjs#areaRecord`).
 * `judge({caster, tier, kind, holder})` answers `end`, `keep` or `test`; a `test` asks the caster's Spirit Resilience
 * Test against `dc`, once a caster, and ends on a failure. Answers the names ended and the names a Test held.
 */
export async function endSpellsHere({ judge, dc = null, scene = null, near = null } = {}) {
  const ended = [];
  const held = [];
  const tested = new Map();
  const { areaRecord } = await import("../canvas/sustained-areas.mjs");
  const verdictFor = async (casterUuid, tier, name) => {
    const v = judge({ caster: casterUuid, tier });
    if (v !== "test") return v;
    if (!tested.has(casterUuid)) {
      const caster = get(casterUuid);
      const message = caster ? await game.system.azeroth.workflows.rollResilience({ actor: caster, resilience: SILENCE_THE_WEAVE.resilience, dc, title: SILENCE_THE_WEAVE.name }) : null;
      const passed = message?.rolls?.[0]?.outcome?.success === true || message?.flags?.[SCOPE]?.success === true;
      tested.set(casterUuid, passed ? "keep" : "end");
    }
    const out = tested.get(casterUuid);
    if (out === "keep") held.push(name);
    return out;
  };
  const casts = new Set();
  // Laid effects on the creatures reached.
  for (const { actor: holder, token } of boardActors()) {
    if (scene && token.parent !== scene) continue;
    if (near && !near(token)) continue;
    for (const effect of values(holder.effects)) {
      const caster = spellCasterOf(effect);
      if (!caster) continue;
      const verdict = await verdictFor(caster, tierOfEffect(effect), effect.name);
      if (verdict !== "end") continue;
      const sustain = sustainOf(effect);
      if (sustain && !casts.has(sustain.cast)) {
        casts.add(sustain.cast);
        const casterActor = get(sustain.by);
        const gone = casterActor ? await game.system.azeroth.workflows.endSustain({ actor: casterActor, cast: sustain.cast }) : null;
        if (gone) { ended.push(effect.name); continue; }
      }
      if (holder.effects.has(effect.id)) {
        await holder.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
        ended.push(`${effect.name} (${token.name ?? holder.name})`);
      }
    }
  }
  // Areas placed by a spell.
  for (const sc of scene ? [scene] : values(game.scenes)) {
    for (const region of values(sc.regions)) {
      const row = areaRecord(region);
      if (!row?.caster || region.flags?.[SCOPE]?.spell?.feature === true) continue;
      if (near && !near(region)) continue;
      const tier = Number.isFinite(Number(region.flags?.[SCOPE]?.spell?.tier)) ? int(region.flags[SCOPE].spell.tier) : null;
      const name = region.flags?.[SCOPE]?.spell?.name ?? region.name ?? "";
      const verdict = await verdictFor(row.caster, tier, name);
      if (verdict !== "end") continue;
      if (row.sustained && row.cast && !casts.has(row.cast)) {
        casts.add(row.cast);
        const casterActor = get(row.caster);
        const gone = casterActor ? await game.system.azeroth.workflows.endSustain({ actor: casterActor, cast: row.cast }) : null;
        if (gone) { ended.push(name); continue; }
      }
      if (sc.regions.has(region.id)) {
        await sc.deleteEmbeddedDocuments("Region", [region.id]);
        ended.push(name);
      }
    }
  }
  return { ended: [...new Set(ended)].sort((a, b) => a.localeCompare(b)), held: [...new Set(held)].sort((a, b) => a.localeCompare(b)) };
}

/**
 * **SWALLOW THEIR MAGIC, ON THE GM'S CLIENT**: every spell the devoured creature cast that is still in force - its
 * Sustains, each effect it laid on any creature, each area it placed.
 */
async function swallowHere(victim) {
  for (const entry of victim.getFlag?.(SCOPE, "sustaining") ?? []) {
    if (entry?.cast) await game.system.azeroth.workflows.endSustain({ actor: victim, cast: entry.cast });
  }
  return endSpellsHere({ judge: ({ caster }) => (caster === victim.uuid ? "end" : "keep") });
}

/**
 * **SILENCE THE WEAVE, ON THE GM'S CLIENT** (04: *end every spell and spell effect of tier 3 or lower within 30 feet
 * of you, other than your own. A tier 4 one ends if its caster fails a Spirit Resilience Test against your Spell
 * DC*): the effects on the creatures within 30 feet and the areas within 30 feet (the area's own bounds, measured to
 * the hunter's token), each judged by `silenceVerdict`.
 */
async function silenceHere(hunter, own) {
  const { feetApart } = await import("../canvas/footprints.mjs");
  const grid = own.parent.grid ?? null;
  const unit = Number(grid?.distance) || 5;
  const size = Number(grid?.size) || 100;
  const centre = { x: own.x + (Number(own.width) || 1) * size / 2, y: own.y + (Number(own.height) || 1) * size / 2 };
  const near = doc => {
    if (doc.documentName === "Token") {
      const d = doc.id === own.id ? 0 : feetApart(own, doc);
      return typeof d === "number" && d <= SILENCE_THE_WEAVE.feet + 1e-6;
    }
    const b = doc.object?.bounds ?? null;
    if (!b) return false;
    const dx = Math.max(b.x - centre.x, 0, centre.x - (b.x + b.width));
    const dy = Math.max(b.y - centre.y, 0, centre.y - (b.y + b.height));
    return Math.hypot(dx, dy) / size * unit <= SILENCE_THE_WEAVE.feet + unit / 2;
  };
  return endSpellsHere({
    scene: own.parent, near, dc: hunter.system?.spellDC ?? null,
    judge: ({ caster, tier }) => {
      const v = silenceVerdict({ tier, own: caster === hunter.uuid });
      return v === "own" ? "keep" : v;
    }
  });
}

/**
 * **FEAST OF SOULS, ON THE GM'S CLIENT** (04: *Each makes a Spirit Resilience Test against your Spell DC. On a
 * failure it takes Shadow damage equal to your Wisdom modifier*): each creature's Test rolled, a failure struck
 * through the area strike's door, and the creatures this damage reduced to 0 counted for the Hatred.
 */
async function feastHere(hunter, uuids = []) {
  const failed = [];
  const passed = [];
  let kills = 0;
  const dc = hunter.system?.spellDC ?? null;
  const n = feastDamage(modOf(hunter, "wis"));
  for (const uuid of uuids) {
    const victim = get(uuid);
    if (!victim || (victim.system?.health?.value ?? 0) <= 0) continue;
    const message = await game.system.azeroth.workflows.rollResilience({ actor: victim, resilience: FEAST_OF_SOULS.resilience, dc, title: FEAST_OF_SOULS.name });
    const success = message?.rolls?.[0]?.outcome?.success === true || message?.flags?.[SCOPE]?.success === true;
    if (success) { passed.push(victim.name); continue; }
    failed.push(victim.name);
    const before = victim.system?.health?.value ?? 0;
    if (n > 0) await strikeHere(hunter, victim, { amount: n, type: FEAST_OF_SOULS.type, name: FEAST_OF_SOULS.name });
    if (before > 0 && (victim.system?.health?.value ?? 0) <= 0) kills += 1;
  }
  return { failed, passed, kills };
}

/* ------------------------------------------------------------------ */
/*  The GM's handler                                                    */
/* ------------------------------------------------------------------ */

/**
 * The GM's own once-marks (the review's C5): a Sweeping Arc a turn and a feast a devoured soul, held on the GM's client
 * so a repeated ask strikes nothing.
 */
const GM_ONCE = new Set();

/** A fight's turn, or a round of the world's clock out of one, as a key. */
function turnKeyOf(actor) {
  const fight = actor?.activeFight?.() ?? null;
  return fight?.started ? `${fight.id}.${fight.round}.${fight.turn}` : `t${Math.floor(now() / 6)}`;
}

/** Ask the active GM, or do it here where this client is the GM. */
async function askGM(payload) {
  if (game.user?.isGM) return demonHunterTalentsQueryHandler(payload, { user: game.user });
  const gm = game.users?.activeGM ?? null;
  if (!gm) return { ok: false, reason: "gm" };
  try {
    return await gm.query(DH_TALENTS_QUERY, payload, { timeout: 20000 });
  } catch (err) {
    console.warn("azeroth-rpg | a Demon Hunter talent's write", err);
    return { ok: false, reason: "error" };
  }
}

/**
 * **WHAT A HUNTER'S CLIENT ASKS THE GM TO WRITE** (`DH_TALENTS_QUERY`), judged again here: the asker owns the
 * hunter; every number worked out here off the hunter's own sheet, never off the payload beyond its words (D-982).
 */
export async function demonHunterTalentsQueryHandler(payload = {}, { user = null } = {}) {
  if (!game.user?.isGM) return { ok: false, reason: "gm" };
  const by = get(payload.byUuid);
  const asker = user ?? game.user;
  if (!by || !by.testUserPermission?.(asker, "OWNER")) return { ok: false, reason: "owner" };
  switch (payload.act) {
    case "strike": {
      const victim = get(payload.victimUuid);
      if (!victim) return { ok: false, reason: "gone" };
      const name = [SWEEPING_ARC.name, TURN_THEIR_FIRE.name].includes(payload.name) ? payload.name : SWEEPING_ARC.name;
      // **THE TALENT HELD AND ITS ONCE, JUDGED HERE** (the review's C5): Sweeping Arc needs its rank, a scythe in two
      // hands and its once a turn not yet struck on this GM's client; Turn Their Fire its rank.
      const sweep = name === SWEEPING_ARC.name;
      const onceKey = sweep ? `${by.uuid}|sweep|${turnKeyOf(by)}` : null;
      const refused = talentQueryRefusal({
        act: sweep ? "sweep" : "turn", owner: true,
        rank: rankOf(by, sweep ? SWEEPING_ARC.identifier : TURN_THEIR_FIRE.identifier),
        scythe: by.gateFacts?.(null)?.wield?.scytheTwoHands === true, once: Boolean(onceKey && GM_ONCE.has(onceKey))
      });
      if (refused) return { ok: false, reason: refused };
      if (onceKey) GM_ONCE.add(onceKey);
      const amount = sweep ? sweepDamage(modOf(by, "wis")) : turnTheirFire(dhRankOfItems(by.items, TURN_THEIR_FIRE.identifier)).damage;
      const type = sweep ? SWEEPING_ARC.type : TURN_THEIR_FIRE.type;
      return { ok: true, lines: await strikeHere(by, victim, { amount, type, name }) };
    }
    case "swallow": {
      const victim = get(payload.victimUuid);
      if (!victim || rankOf(by, SWALLOW_THEIR_MAGIC.identifier) < 1) return { ok: false, reason: "gone" };
      return { ok: true, ...await swallowHere(victim) };
    }
    case "silence": {
      const scene = game.scenes?.get(payload.sceneId) ?? null;
      const own = scene?.tokens?.get(payload.tokenId) ?? null;
      if (!own || own.actor !== by || rankOf(by, SILENCE_THE_WEAVE.identifier) < 1) return { ok: false, reason: "gone" };
      return { ok: true, ...await silenceHere(by, own) };
    }
    case "feast": {
      // **THE CREATURES REBUILT FROM THE BOARD** (the review's C5): the devoured creature marked devoured, one feast
      // for it, and only the uuids asked whose creatures stand within the radius of the hunter's own token.
      const victim = get(payload.victimUuid);
      const onceKey = `${by.uuid}|feast|${payload.victimUuid ?? ""}|${turnKeyOf(by)}`;
      const refused = talentQueryRefusal({ act: "feast", owner: true, rank: rankOf(by, FEAST_OF_SOULS.identifier),
        devoured: Boolean(victim?.getFlag?.(SCOPE, DEVOUR_SOUL.given)), once: GM_ONCE.has(onceKey) });
      if (refused) return { ok: false, reason: refused };
      const own = game.scenes?.get(payload.sceneId)?.tokens?.get(payload.tokenId) ?? null;
      if (!own || own.actor !== by) return { ok: false, reason: "gone" };
      GM_ONCE.add(onceKey);
      const { feetApart } = await import("../canvas/footprints.mjs");
      const rows = values(own.parent.tokens).filter(tk => tk.actor && tk.id !== own.id).map(tk => ({ uuid: tk.actor.uuid, feet: feetApart(own, tk) }));
      const uuids = feastTargets((payload.uuids ?? []).filter(u => typeof u === "string" && u !== payload.victimUuid), rows, { feet: feastFeet(modOf(by, "wis")) });
      return { ok: true, ...await feastHere(by, uuids) };
    }
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
 * Register the talents' hooks once at init: Refuse the Legion's refused Charm; Betrayer's Bargain's Fel when its
 * shape ends; Eyes of the Nether's token sight when the talent moves; Sight Beyond Sight's whisper when a creature
 * that hides its true form is targeted.
 */
export function registerDemonHunterTalents() {
  // **REFUSE THE LEGION** (04: *You cannot be Charmed by a demon*): an effect laying Charmed whose origin is a demon is
  // refused at the one seam every writer passes, said in words.
  Hooks.on("preCreateActiveEffect", (effect, data) => {
    const actor = effect?.parent;
    if (actor?.documentName !== "Actor") return true;
    if (!legionCharmRefused(actor, { statuses: data?.statuses ?? [...(effect.statuses ?? [])], origin: data?.origin ?? effect.origin })) return true;
    ui.notifications?.info(t("AZEROTH.DemonHunter.Talent.Legion.Refused", { name: actor.name }));
    return false;
  });
  // **BETRAYER'S BARGAIN'S END**: the shape's effect gone for any reason.
  Hooks.on("deleteActiveEffect", async effect => {
    const actor = effect?.parent;
    const u = effect?.flags?.[SCOPE]?.unleashed;
    if (!u?.bargain || actor?.documentName !== "Actor") return;
    if (!(await answersFor(actor))) return;
    await bargainEnded(actor, effect).catch(err => console.warn("azeroth-rpg | Betrayer's Bargain's end", err));
  });
  // **EYES OF THE NETHER AND EMBRACE THE PAIN**: the token's sight read again when either is taken or given back
  // (`movesSpectralSight`; Embrace's 5 more Fel reach the sight through `felFor`).
  const talentMoved = async item => {
    const actor = item?.parent;
    if (!movesSpectralSight(item) || actor?.documentName !== "Actor") return;
    const { syncSpectralSight } = await import("./demon-hunter-features.mjs");
    await syncSpectralSight(actor).catch(err => console.warn("azeroth-rpg | Eyes of the Nether", err));
  };
  Hooks.on("updateItem", talentMoved);
  Hooks.on("createItem", talentMoved);
  // **SIGHT BEYOND SIGHT AT RANK 2**: a hunter's user targeting a creature whose token hides its name or wears a
  // shape is whispered its true form, once a target.
  Hooks.on("targetToken", async (user, token, targeted) => {
    if (!targeted || user?.id !== game.user?.id) return;
    const victim = token?.actor ?? null;
    if (!victim) return;
    // The user's own character, else the creatures whose tokens this user controls (a GM's view).
    const lookers = user.character ? [user.character] : (globalThis.canvas?.tokens?.controlled ?? []).map(tk => tk.actor).filter(Boolean);
    for (const hunter of lookers.filter(a => a.type === "character" && a.isOwner && a !== victim)) {
      const shape = victim.shape ?? null;
      const form = trueFormOf({ rank: dhRankOfItems(hunter.items, SIGHT_BEYOND_SIGHT.identifier), tokenName: token.document?.name ?? token.name, actorName: victim.name, shapeName: shape ? (shape.forms?.[0]?.name ?? null) : null });
      if (!form) continue;
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: hunter }), whisper: [user.id],
        content: `<p>${escape(t(form.shape ? "AZEROTH.DemonHunter.Talent.Sight.Shape" : "AZEROTH.DemonHunter.Talent.Sight.Name", { name: hunter.name, target: token.document?.name ?? token.name, true: form.name, shape: form.shape ?? "" }))}</p>` });
    }
  });
}

/** The class this module serves, as 02 names it (read by the census). */
export const DH_TALENTS_CLASS = DH_CLASS;
