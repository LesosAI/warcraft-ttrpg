/**
 * **THE WITCH HUNTER'S SIGNS, AS DOORS** (02 §7's Signs, Ash Sign, Lull Sign and Greater Signs; the Witch Hunter
 * plan's R2, P14, P16, P17, G3, T2; wave 2a-B, D-2071 to D-2074). The law is `rules/witch-hunter-features.mjs`
 * (`signCost`, `signEffect`, `signRefusal`, `rowanRefusal`, `lullRefusal`, `ashRingTick`) and the Spell DC stack
 * `rules/medallion.mjs#witchHunterDC`; this module is the ONE writer for what a Sign does:
 *
 * - **A Sign is used through `workflows.useFeature`** (D-768): `judgeSign` from its judgement step, before the
 *   budget, and `landSign` after the budget, which pays the Energy (one delta inside the pool queue,
 *   `pool-writes.mjs#adjustPool`) and lays what the Sign lays. The three features share it: **Signs** (the Gale,
 *   Ember and Rowan Signs, asked through the one chooser), **Ash Sign** and **Lull Sign**.
 * - **Greater Signs is a line on the same chooser** (P14's Empowered Signs table): each Sign is offered plain and,
 *   where the feature is held, Empowered for 2 more Energy (`signCost`'s `empower`), greyed in words where the
 *   Energy falls short.
 * - **What a creature resists rides the feature card**: the plan's `sys` view (`resist`, `resistDcValue`, `damage`,
 *   `inflicts`) is laid over the feature's stamp at the card, so the card's own Resist rows, Apply and failed-Test
 *   landings do the work they already do for Breath; the Gale Sign's push is the card's `forced` record (D-778's
 *   Resist door), the Ember Sign's Scorched is laid by the failure with its source layer (`failLayer`), and the
 *   Tome's Bane is the card's weakness record (`witch-hunter-standing.mjs#weaknessRecord`, wave 2a-A's reader).
 * - **The cones are aimed** from the hunter's token (`canvas/place.mjs#pickFacing`) and gather the creatures
 *   inside, never the hunter, as 02's Breath does; with no token on the viewed board the card keeps the creatures
 *   targeted (D-647's shape).
 * - **The Rowan Sign lays a Ward on you or one ally** (a laid `final` add on every school, capped at 05's 10 by
 *   both models' `afterFinalPhase`), spanned to the end of the hunter's next turn
 *   (`durations.mjs#untilEndOfNextTurnOrRound`), on the GM's client where this one does not own the ally
 *   (`WH_FEATURES_QUERY`, `gm-writes.mjs#gmAbsentFor` asked first); Empowered, the temporary Health rides the Ward's
 *   effect (`grantTemporaryHealth`'s `effect` span), so the two end together.
 * - **The Ash Sign places a ring** at a point picked within its reach (`placeArea`, Desecration's way), its area
 *   the area law's own (`ashRingTick`: the enemy's Spirit Test at its turn's start, Slowed until it leaves, the
 *   Immune strip while inside), and ends the hunter's earlier ring first (*one Ash ring at a time*).
 * - **The Lull Sign charms** on a failed Spirit Test: in a fight until the end of the creature's next turn (or 1
 *   minute Empowered on one creature), out of a fight the calm (a 10-minute marker effect with no condition and no
 *   changes, D-2139; the Boon on **Persuasion** and **Deception** Tests against it read by the hunter's roll dialog),
 *   and the GM is told when it ends.
 *
 * Nothing here is a reason the table must act: every Sign's sentence has a door (D-681).
 */

import {
  ASH_RING_KEY, GRYPHON, GREATER_SIGNS, SIGNS, SIGN_TURN_LIMIT, SIGN_TURN_MARK, ashRingTick, lullRefusal,
  rowanRefusal, signCost, signEffect, signNth, signRefusal, signsOfFeature
} from "../rules/witch-hunter-features.mjs";
import { lastHuntStands, tomeFacts, tomeFlagOf, weaknessRecord } from "../rules/witch-hunter-standing.mjs";
import { TOME } from "../rules/tome.mjs";
import { emptyAreaTick, emptyCheck, emptyRemains } from "../rules/area-ticks.mjs";
import { areaFor } from "../rules/areas.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { turnMark } from "../rules/class-answers.mjs";
import { signAnimationKey } from "../rules/witch-hunter-animations.mjs";
import { AZEROTH } from "../config.mjs";

const SCOPE = "azeroth-rpg";
const t = (key, data = {}) => game.i18n.format(key, data);
const int = v => Math.trunc(Number(v)) || 0;

/** The flag a Lull Sign's calm out of a fight carries on the creature: `{by, name, until}`. */
export const LULL_FLAG = "whLull";

/** The flag a Rowan Sign's Ward carries on the creature warded: `{by, value}`. */
export const ROWAN_FLAG = "whRowan";

/** How long the calm stands out of a fight, in minutes (*stays calm toward you for 10 minutes*). */
export const LULL_CALM_MINUTES = 10;

/* ------------------------------------------------------------------ */
/*  What a Sign reads off the hunter                                    */
/* ------------------------------------------------------------------ */

/** The hunter's Energy pool (a Witch Hunter takes no second class, so it is the class's own). */
export function energyOf(actor) {
  return (actor?.poolSnapshot?.() ?? []).find(p => p.kind === "power" && p.name === "energy") ?? null;
}

/** 04's Gryphon talents' ranks, keyed as `signCost` and `signEffect` read them. */
export function gryphonRanks(actor) {
  const out = {};
  for (const [key, name] of Object.entries(GRYPHON)) out[key] = int(actor?.talentRanks?.(name));
  return out;
}

/** Whether the actor holds a feature by name. */
const holds = (actor, name) => Boolean(actor?.items?.some?.(i => i.type === "feature" && i.name === name));

/** The Tome's facts (`witch-hunter-standing.mjs#tomeFacts`), or an empty Tome. */
export function tomeOf(actor) {
  // The carried First Tome's types included (`tomeFlagOf`, D-2162).
  return tomeFacts({ tome: tomeFlagOf(actor), effects: actor?.effects ?? [] }) ?? { known: [], studied: [] };
}

/**
 * **THE DC A CREATURE RESISTS A SIGN AGAINST**: the hunter's Spell DC, the worn medallion's rarity and Firebloom
 * cordial while it acts (*Your Spell DC for **Signs** rises*), through wave 2a-A's ONE reader of the stack
 * (`effects/witch-hunter-brews.mjs#whSpellDC`, `medallion.mjs#witchHunterDC` with `sign: true`), the one a bomb and
 * the non-maker's drink read (D-2077).
 */
export async function signDC(actor) {
  const { whSpellDC } = await import("./witch-hunter-brews.mjs");
  return whSpellDC(actor, { sign: true });
}

/** The fight, the hunter's combatant and the marks its round record holds this round. */
function turnFacts(actor) {
  const fight = actor?.activeFight?.() ?? null;
  const mine = fight?.started ? (fight.getCombatantsByActor?.(actor)?.[0] ?? null) : null;
  const record = mine?.getFlag?.(SCOPE, "round") ?? null;
  const used = record && record.number === fight?.round ? (record.once ?? []) : [];
  return { fight: mine ? fight : null, mine, used, turn: mine ? fight.turn : null };
}

/** The token the hunter acts from on the viewed board, or null. */
function boardToken(actor) {
  const token = actor?.getActiveTokens?.(true)?.[0] ?? null;
  return token && token.document?.parent?.id === globalThis.canvas?.scene?.id ? token : null;
}

/** Refuse in words and answer null (D-768: nothing is spent). */
function refuse(key, data = {}) {
  ui.notifications?.warn(t(key, data));
  return null;
}

/** Whether a write on these actors needs a GM and none is online (`gm-writes.mjs#gmAbsentFor`). */
function gmMissing(actors = []) {
  return gmAbsentFor({ owned: actors.filter(Boolean).map(a => a.isOwner === true), isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });
}

/* ------------------------------------------------------------------ */
/*  The judgement                                                       */
/* ------------------------------------------------------------------ */

/**
 * **WHICH SIGN, AND WHETHER IT MAY BE USED**, asked before the budget and the Energy (D-768). The Sign and its
 * Empowered line through the one chooser; the Energy held against `signCost` at this turn's nth Sign; then each
 * Sign's own picks - the cone's facing, the Rowan Sign's one creature, the Lull Sign's creatures, the Ash ring's
 * point. Null refuses the Use in words, and a dismissed chooser or pick costs nothing.
 *
 * @param {{actor: Actor, item: Item, list?: Array}} o  `list` the creatures targeted, replaced in place by a cone
 * @returns {Promise<object|null>}  the plan `landSign` lands
 */
export async function judgeSign({ actor, item, list = [] } = {}) {
  const name = item?.name ?? "";
  const keys = signsOfFeature(name);
  if (!keys.length) return refuse("AZEROTH.WhSign.Refuse.unknown", { name });
  const energy = energyOf(actor);
  if (!energy) return refuse("AZEROTH.WhSign.Refuse.noPool", { name });
  const turn = turnFacts(actor);
  const nth = signNth({ used: turn.used, turn: turn.turn, inFight: Boolean(turn.fight) });
  const ranks = gryphonRanks(actor);
  const lastHunt = lastHuntStands(actor.effects ?? []);
  const greater = holds(actor, GREATER_SIGNS);
  // **THE CHOOSER: EACH SIGN, AND ITS EMPOWERED LINE WHERE GREATER SIGNS IS HELD** (P14).
  const options = [];
  for (const key of keys) {
    for (const empower of greater ? [false, true] : [false]) {
      const price = signCost(key, { nth, empower, lastHunt, ranks });
      const short = int(energy.value) < price.cost;
      const label = t(empower ? "AZEROTH.WhSign.OptionEmpowered" : "AZEROTH.WhSign.Option", { sign: SIGNS[key].name, n: price.cost });
      options.push({
        key: `${key}:${empower ? 1 : 0}`, sign: key, empower, cost: price.cost, rows: price.rows, name: label,
        available: !short,
        description: short ? t("AZEROTH.WhSign.OptionShort", { n: price.cost, held: int(energy.value) }) : t(`AZEROTH.WhSign.Text.${key}${empower ? "Empowered" : ""}`)
      });
    }
  }
  let picked = options.length === 1 ? options[0] : null;
  if (!picked) {
    if (!options.some(o => o.available)) return refuse("AZEROTH.WhSign.Refuse.energy", { name, n: Math.min(...options.map(o => o.cost)), held: int(energy.value) });
    picked = await game.system.azeroth.workflows.chooseOption(item, options, null, { prompt: t("AZEROTH.WhSign.Prompt", { name }) });
    if (!picked) return null;
  }
  const refused = signRefusal({ sign: picked.sign, feature: name, energy: energy.value, cost: picked.cost });
  if (refused) return refuse(`AZEROTH.WhSign.Refuse.${refused}`, { name, n: picked.cost, held: int(energy.value) });
  // 04's Holy Ember: *you may make it deal Holy damage instead of Fire*, asked before anything is paid.
  let holy = false;
  if (picked.sign === "ember" && ranks.holyEmber > 0) {
    const school = await game.system.azeroth.workflows.chooseOption(item, [
      { key: "fire", name: game.i18n.localize(AZEROTH.schools.fire), description: "" },
      { key: "holy", name: game.i18n.localize(AZEROTH.schools.holy), description: t("AZEROTH.WhSign.HolyEmber", { talent: GRYPHON.holyEmber }) }
    ], null, { prompt: t("AZEROTH.WhSign.HolyPrompt", { name: SIGNS.ember.name }) });
    if (!school) return null;
    holy = school.key === "holy";
  }
  const effect = signEffect(picked.sign, {
    tier: actor.system?.tier ?? 1, intMod: actor.system?.abilities?.int?.mod ?? 0, empower: picked.empower, holy, ranks
  });
  const plan = {
    key: "sign", sign: picked.sign, empower: picked.empower, cost: picked.cost, rows: picked.rows, nth, effect, holy,
    dc: await signDC(actor), energy: { itemId: energy.itemId, kind: energy.kind, name: energy.name },
    turn: { combatantId: turn.mine?.id ?? null, turnIndex: turn.turn, used: [...turn.used] },
    sys: null, cardFlags: null, facing: null
  };
  const own = boardToken(actor);
  if (picked.sign === "gale" || picked.sign === "ember") return judgeCone(actor, item, list, plan, own);
  if (picked.sign === "rowan") return judgeRowan(actor, item, list, plan, own);
  if (picked.sign === "lull") return judgeLull(actor, item, list, plan, own);
  if (picked.sign === "ash") return judgeAsh(actor, item, plan, own);
  return refuse("AZEROTH.WhSign.Refuse.unknown", { name });
}

/**
 * The Gale and Ember Signs' cone (*Each creature in a 15 ft cone from you*): aimed from the hunter's token, the
 * creatures inside gathered into the card's targets, never the hunter. With no token on the viewed board the
 * creatures targeted stand, as a Breath's do.
 */
async function judgeCone(actor, item, list, plan, own) {
  const areaText = `A ${plan.effect.area.feet} ft cone`;
  const shape = areaFor(areaText);
  if (own && shape) {
    const { areaOriginFor, pickFacing } = await import("../canvas/place.mjs");
    const origin = areaOriginFor(shape, own);
    if (origin) {
      const rotation = await pickFacing({ origin, area: shape, scene: canvas.scene, label: SIGNS[plan.sign].name });
      if (rotation === null) return null;
      const { regionDataFor } = await import("../canvas/regions.mjs");
      const { creaturesInArea } = await import("../canvas/engaged.mjs");
      const data = regionDataFor({ item, areaText, scene: canvas.scene, token: own, origin, rotation, attach: false });
      const region = new CONFIG.Region.documentClass(data, { parent: canvas.scene });
      const inside = (creaturesInArea(actor, { who: "creature", origin: "self", feet: shape.distanceFt }) ?? [])
        .filter(r => r.token !== own && r.actor?.uuid !== actor.uuid && r.token.document.testInsideRegion(region));
      const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
      list.splice(0, list.length, ...targetSnapshots(inside.map(r => r.token)));
      plan.facing = { origin, rotation, area: areaText };
    }
  }
  plan.sys = coneSys(plan);
  plan.cardFlags = await signCardFlags(actor, item, plan, list);
  return plan;
}

/**
 * **WHAT THE CONE'S CARD OFFERS** (02's Gale and Ember rows, the Empowered Signs table, 04's Searing Script and
 * Shattering Gale): the Resilience Test at the Sign's DC; the Ember Sign's damage, half on a success, and its
 * Scorched on a failure; the Gale Sign's Prone on a failure (Empowered) and Shattering Gale's damage on a failure.
 * The push is the card's `forced` record (`signCardFlags`).
 */
export function coneSys(plan) {
  const e = plan.effect;
  const out = { resist: e.test, resistDcValue: plan.dc, damage: null, inflicts: [] };
  if (plan.sign === "ember") {
    out.damage = { amount: e.onFail.damage.amount, type: e.onFail.damage.type, half: true };
    out.inflicts = [{ condition: "scorched", value: e.onFail.scorched, until: null, onFail: true }];
  } else {
    if (e.onFail?.damage) out.damage = { amount: e.onFail.damage.amount, type: e.onFail.damage.type, onFail: true };
    if (e.onFail?.prone) out.inflicts = [{ condition: "prone", value: null, until: null, onFail: true }];
  }
  return out;
}

/**
 * The Rowan Sign's one creature (*You or one ally within 30 feet*): the hunter where nothing is targeted, or the
 * one creature targeted, an ally within the reach. A creature this client does not own is warded on the GM's
 * client, so with no GM online the Use is refused here, before anything is spent.
 */
async function judgeRowan(actor, item, list, plan, own) {
  const { targetActorOf } = await import("../dice/annotate.mjs");
  const { allyOf, feetBetweenTokens } = await import("../canvas/engaged.mjs");
  const named = list.map(x => ({ x, actor: targetActorOf(x) })).filter(r => r.actor);
  const one = named[0] ?? null;
  const self = !one || one.actor.uuid === actor.uuid;
  const theirs = one && !self ? (canvas?.tokens?.get?.(one.x?.tokenId) ?? one.actor.getActiveTokens?.(true)?.[0] ?? null) : null;
  const refused = rowanRefusal({
    named: named.length, self, ally: self || allyOf(actor, one.actor),
    feet: self || !own || !theirs ? null : feetBetweenTokens(own, theirs), range: SIGNS.rowan.area.range
  });
  if (refused) return refuse(`AZEROTH.WhSign.Rowan.${refused}`, { name: SIGNS.rowan.name, target: one?.x?.name ?? one?.actor?.name ?? "", feet: SIGNS.rowan.area.range });
  const target = self ? actor : one.actor;
  if (gmMissing([target])) return refuse("AZEROTH.WhSign.NoGM", { name: SIGNS.rowan.name });
  // 04's Bursting Rowan (wave 2b): the burst lands on the hunter's enemies, which a player's client writes through the
  // GM - judged now, before anything is paid.
  if (plan.effect.burst) {
    const { burstNeedsGM } = await import("./witch-hunter-talents.mjs");
    if (burstNeedsGM(actor)) return refuse("AZEROTH.WhSign.NoGM", { name: SIGNS.rowan.name });
  }
  plan.rowan = { target, name: self ? actor.name : (one.x?.name ?? target.name) };
  plan.sys = { resist: null, resistDcValue: null, damage: null, inflicts: [] };
  plan.cardFlags = await signCardFlags(actor, item, plan, list);
  return plan;
}

/**
 * The Lull Sign's creatures (*One creature you can see within 30 feet*; Empowered, *two creatures, or one creature
 * for 1 minute*): judged by `lullRefusal`, the hunter never among them. The Charmed is laid by the card's own
 * failed Resist in a fight; out of a fight by `signAfterResist`.
 */
async function judgeLull(actor, item, list, plan, own) {
  const { targetActorOf } = await import("../dice/annotate.mjs");
  const { feetBetweenTokens } = await import("../canvas/engaged.mjs");
  const rows = list.map(x => ({ x, actor: targetActorOf(x), token: canvas?.tokens?.get?.(x?.tokenId) ?? null })).filter(r => r.actor);
  const refused = lullRefusal({
    targets: rows.map(r => ({
      self: r.actor.uuid === actor.uuid,
      seen: r.token ? r.token.document?.hidden !== true : true,
      feet: own && r.token ? feetBetweenTokens(own, r.token) : null
    })),
    max: plan.effect.targets, range: plan.effect.area.range
  });
  if (refused) return refuse(`AZEROTH.WhSign.Lull.${refused}`, { name: SIGNS.lull.name, n: plan.effect.targets, feet: plan.effect.area.range });
  const inFight = Boolean(actor.activeFight?.()?.started);
  // Empowered on one creature: *one creature for 1 minute*; on two, each until the end of its next turn.
  const minute = plan.empower && rows.length === 1;
  plan.lull = { inFight, minute };
  plan.sys = {
    resist: SIGNS.lull.test, resistDcValue: plan.dc, damage: null,
    // In a fight the card's failed Resist lays it (the creature's own next turn, or 1 minute Empowered); out of one,
    // the calm is `signAfterResist`'s.
    // 04's Deep Lull (*stays Charmed 1 more round per rank*; wave 2b): the rounds ride the card to the failed Test.
    inflicts: inFight ? [{ condition: "charmed", value: null, until: minute ? "minute" : "endOfNextTurn", onFail: true,
      ...(int(plan.effect.onFail?.moreRounds) > 0 ? { moreRounds: int(plan.effect.onFail.moreRounds) } : {}) }] : []
  };
  plan.cardFlags = await signCardFlags(actor, item, plan, list);
  return plan;
}

/**
 * The Ash Sign's point (*Choose a point within 30 feet*; 04's Far Signs reaches farther): picked within the reach of
 * the hunter's token before anything is paid. The ring needs the board: with no token on the viewed scene the Use
 * is refused in words.
 */
async function judgeAsh(actor, item, plan, own) {
  if (!own) return refuse("AZEROTH.WhSign.Ash.NoToken", { name: SIGNS.ash.name });
  // *You may have one Ash ring at a time*: an earlier ring this hunter placed is ended first, on the GM's client
  // where this one may not delete it - judged now, before anything is paid.
  const earlier = ashRingsOf(actor);
  if (earlier.length && !game.user?.isGM && !game.users?.activeGM) return refuse("AZEROTH.WhSign.NoGM", { name: SIGNS.ash.name });
  const reach = plan.effect.area.range;
  const { pickPoint } = await import("../canvas/place.mjs");
  const { feetToPoint } = await import("../canvas/footprints.mjs");
  const point = await pickPoint({
    hint: t("AZEROTH.WhSign.Ash.Pick", { name: SIGNS.ash.name, feet: reach }),
    accept: p => {
      const feet = feetToPoint(own, p);
      if (feet === null || feet <= reach) return true;
      ui.notifications?.warn(t("AZEROTH.WhSign.Ash.TooFar", { name: SIGNS.ash.name, feet: reach }));
      return false;
    }
  });
  if (!point) return null;
  plan.ash = { point: { x: point.x, y: point.y }, sceneId: canvas.scene.id, sourceTokenId: own.id, earlier };
  plan.sys = { resist: null, resistDcValue: null, damage: null, inflicts: [] };
  plan.cardFlags = await signCardFlags(actor, item, plan, []);
  return plan;
}

/** The Ash rings this hunter has standing, on every scene: `[{sceneId, id}]`. */
export function ashRingsOf(actor) {
  const out = [];
  for (const scene of game.scenes ?? []) {
    for (const region of scene.regions ?? []) {
      const f = region.flags?.[SCOPE] ?? {};
      if (f.identifier === ASH_RING_KEY && f.caster === actor?.uuid) out.push({ sceneId: scene.id, id: region.id });
    }
  }
  return out.sort((a, b) => `${a.sceneId}.${a.id}`.localeCompare(`${b.sceneId}.${b.id}`));
}

/**
 * **WHAT THE SIGN'S CARD RECORDS**: which Sign, Empowered or not, and what it cost; the Gale Sign's push on a failure
 * (D-778's `forced` record); the Ember Sign's Scorched source layer (A1 adds Scorched from separate sources); the
 * Tome's weakness record (wave 2a-A's `weaknessRecord`, which the Resist roll reads); the Lull Sign's calm.
 */
async function signCardFlags(actor, item, plan, list) {
  const tome = tomeOf(actor);
  const weak = SIGNS[plan.sign].test ? weaknessRecord({ known: tome.known, source: { sign: plan.sign }, name: TOME }) : null;
  return {
    whSign: {
      sign: plan.sign, empowered: plan.empower === true, cost: plan.cost, by: actor.uuid,
      ...(plan.lull ? { calm: plan.lull.inFight !== true, minute: plan.lull.minute === true } : {})
    },
    ...(plan.sign === "gale" ? { forced: { on: "fail", feet: plan.effect.onFail.push, toward: "away", from: "caster", resilience: SIGNS.gale.test } } : {}),
    ...(plan.sign === "ember" ? { failLayer: `${actor.uuid}:${item?.id ?? ""}:ember-sign` } : {}),
    ...(weak && list.length ? { whWeakness: weak } : {})
  };
}

/* ------------------------------------------------------------------ */
/*  The landing                                                         */
/* ------------------------------------------------------------------ */

/**
 * **A SIGN, ONCE ITS BUDGET IS PAID** (D-768): the Energy taken off as one delta read when its turn in the pool
 * queue comes (`adjustPool`, `need`), the turn's Sign marked for Quick Script and Twin Signs, then what the Sign
 * lays. An Energy spent since the judgement leaves the Sign undone, said in words, and the card then offers
 * nothing (`plan.sys` and `plan.cardFlags` cleared).
 *
 * @returns {Promise<string[]>}  the card's lines
 */
export async function landSign({ actor, item, plan } = {}) {
  const lines = [];
  // Paid already with the budget, in one queued step (`paySignWithBudget`, the useFeature door's Sign branch); a Sign
  // whose action another door paid (no budget asked) pays its Energy here.
  const { adjustPool } = await import("../documents/pool-writes.mjs");
  const paid = plan.paid === true ? { ok: true } : await adjustPool(actor, { kind: plan.energy.kind, name: plan.energy.name, itemId: plan.energy.itemId }, -plan.cost, { need: true });
  if (!paid.ok) {
    plan.sys = { resist: null, resistDcValue: null, damage: null, inflicts: [] };
    plan.cardFlags = null;
    plan.facing = null;
    return [t("AZEROTH.WhSign.Short", { name: SIGNS[plan.sign].name, n: plan.cost })];
  }
  lines.push(t(plan.empower ? "AZEROTH.WhSign.UsedEmpowered" : "AZEROTH.WhSign.Used", { name: actor.name, sign: SIGNS[plan.sign].name, n: plan.cost }));
  for (const row of plan.rows ?? []) lines.push(t("AZEROTH.WhSign.CostRow", { talent: row.name, n: row.cost }));
  // The turn's Sign, marked on the round's record so the next one this turn is the second.
  const fight = actor.activeFight?.() ?? null;
  const mine = plan.turn.combatantId ? fight?.combatants?.get?.(plan.turn.combatantId) ?? null : null;
  if (mine?.isOwner) {
    const mark = turnMark(SIGN_TURN_MARK, plan.turn.turnIndex, mine.getFlag?.(SCOPE, "round")?.once ?? plan.turn.used, SIGN_TURN_LIMIT);
    if (mark) await mine.markRoundOnce(mark);
  }
  if (plan.sign === "rowan") lines.push(...await landRowan(actor, item, plan));
  if (plan.sign === "ash") lines.push(...await landAsh(actor, item, plan));
  if (plan.sign === "lull" && plan.lull?.inFight === false) lines.push(t("AZEROTH.WhSign.Lull.CalmOffered", { minutes: LULL_CALM_MINUTES }));
  if (plan.facing === null && (plan.sign === "gale" || plan.sign === "ember")) lines.push(t("AZEROTH.WhSign.Unaimed", { sign: SIGNS[plan.sign].name, area: `${plan.effect.area.feet}` }));
  return lines;
}

/**
 * **THE SIGN'S ENERGY AND ITS BUDGET, IN ONE QUEUED STEP** (D-768's order; a refused action keeps its Half-Action, the
 * lead; the architect review's A4, wave 2d-A, D-2135). Inside the actor's pool queue (`pool-writes.mjs#poolWrite`, the
 * rune door's shape): the Energy read when this task's turn comes and judged against the Sign's cost, refused in words
 * where it falls short with nothing spent; then `budget` (the useFeature door's `spendTurnBudget`, which writes on the
 * combatant's own queue, never this one); then the Energy written through `writePoolsNow`, the unqueued write. A
 * budget that refuses writes no Energy. Marks the plan `paid`, which `landSign` reads.
 *
 * @param {{actor: Actor, plan: object, budget: () => Promise<boolean>|boolean}} o
 * @returns {Promise<boolean>}  whether the Sign was paid
 */
export async function paySignWithBudget({ actor, plan, budget } = {}) {
  const { poolWrite } = await import("../documents/pool-writes.mjs");
  const { poolHeldBy } = await import("../rules/pools.mjs");
  return poolWrite(actor, async () => {
    const pools = actor?.poolSnapshot?.() ?? [];
    const pool = plan.energy.itemId ? poolHeldBy(pools, plan.energy.itemId, plan.energy.kind, plan.energy.name)
      : pools.find(p => p.kind === plan.energy.kind && p.name === plan.energy.name) ?? null;
    const held = Math.max(0, int(pool?.value));
    if (!pool || held < plan.cost) {
      refuse("AZEROTH.WhSign.ShortNow", { name: SIGNS[plan.sign].name, n: plan.cost, held });
      return false;
    }
    if (!(await budget())) return false;
    await actor.writePoolsNow([{ itemId: pool.itemId, kind: pool.kind, value: held - plan.cost }]);
    plan.paid = true;
    return true;
  });
}

/** The Rowan Sign's Ward, on the hunter's own client where it owns the creature, else the GM's. */
async function landRowan(actor, item, plan) {
  const target = plan.rowan.target;
  const done = target.isOwner
    ? await rowanHere({ hunter: actor, target, empower: plan.empower, img: item?.img ?? null })
    : await askGM({ act: "rowan", hunterUuid: actor.uuid, targetUuid: target.uuid, empower: plan.empower === true, img: item?.img ?? null });
  if (!done?.landed) return [t("AZEROTH.WhSign.Rowan.NotLaid", { target: plan.rowan.name })];
  const out = [t("AZEROTH.WhSign.Rowan.Laid", { target: plan.rowan.name, n: done.ward })];
  if (done.temp > 0) out.push(t("AZEROTH.WhSign.Rowan.Temp", { target: plan.rowan.name, n: done.temp }));
  // **04's BURSTING ROWAN** (*each enemy within 5 feet of the creature that gains the Ward takes Fire damage equal to your
  // rank plus your tier*; wave 2b): once the Ward has landed (`effects/witch-hunter-talents.mjs#burstFromRowan`).
  if (plan.effect.burst) {
    const { burstFromRowan } = await import("./witch-hunter-talents.mjs");
    out.push(...await burstFromRowan({ hunter: actor, target }));
  }
  return out;
}

/**
 * **THE ROWAN WARD, LAID HERE** (*Ward equal to your tier against every school until the end of your next turn*;
 * 04's Living Rowan adds a rank; Empowered, *temporary Health equal to your Intelligence modifier*). Every number is
 * worked out off the HUNTER's own sheet - on the GM's client too - never off a request. A second Rowan Ward from the
 * same hunter replaces the first.
 *
 * @returns {Promise<{landed: boolean, ward: number, temp: number}>}
 */
export async function rowanHere({ hunter, target, empower = false, img = null } = {}) {
  const effect = signEffect("rowan", { tier: hunter.system?.tier ?? 1, intMod: hunter.system?.abilities?.int?.mod ?? 0, empower, ranks: gryphonRanks(hunter) });
  const value = effect.ward.value;
  const stale = (target.effects ?? []).filter(e => e.flags?.[SCOPE]?.[ROWAN_FLAG]?.by === hunter.uuid).map(e => e.id);
  if (stale.length) await target.deleteEmbeddedDocuments("ActiveEffect", stale);
  const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
  const [made] = await target.createEmbeddedDocuments("ActiveEffect", [{
    name: t("AZEROTH.WhSign.Rowan.Effect", { sign: SIGNS.rowan.name, owner: hunter.name }),
    img: img ?? "icons/magic/defensive/shield-barrier-glowing-blue.webp",
    origin: hunter.uuid,
    description: `<p>${foundry.utils.escapeHTML(t("AZEROTH.WhSign.Rowan.EffectText", { n: value }))}</p>`,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    // A Ward is derived, so the add is `final` (CLAUDE.md §15); both models cap it at 05's 10 after the phase.
    system: { changes: Object.keys(AZEROTH.schools).map(school => ({ key: `system.ward.${school}`, type: "add", value, phase: "final" })) },
    ...(untilEndOfNextTurnOrRound(hunter) ?? {}),
    flags: { [SCOPE]: { [ROWAN_FLAG]: { by: hunter.uuid, value } } }
  }]);
  if (!made) return { landed: false, ward: 0, temp: 0 };
  let temp = 0;
  if (effect.tempHealth > 0 && typeof target.grantTemporaryHealth === "function") {
    const granted = await target.grantTemporaryHealth(effect.tempHealth, { source: SIGNS.rowan.name, span: "effect", effectId: made.id });
    if (granted?.landed) temp = granted.temp;
  }
  return { landed: true, ward: value, temp };
}

/**
 * **THE ASH RING**, once paid for: the earlier ring ended, then the new one placed at the point picked, carrying the
 * area law's record (`ashRingTick`) and its span, not attached, as Desecration's ground is.
 */
async function landAsh(actor, item, plan) {
  const scene = game.scenes?.get(plan.ash.sceneId) ?? null;
  if (!scene) return [t("AZEROTH.WhSign.Ash.NotLaid", { name: SIGNS.ash.name })];
  if (plan.ash.earlier.length) await endAshRings(actor, plan.ash.earlier);
  // The Tome's weakness Bane for the Ash Sign (Demon, Elemental) on the ring's Spirit Test row, the record a Sign's
  // card carries (the architect review's A1, D-2131), which the area Test's Resist reads (`resistLinesFor`).
  const weakness = weaknessRecord({ known: tomeOf(actor).known, source: { sign: "ash" }, name: TOME });
  const tick = ashRingTick({ effect: plan.effect, empty: { tick: emptyAreaTick(), check: emptyCheck(), remains: emptyRemains() }, weakness });
  const fight = actor.activeFight?.() ?? null;
  const { placeArea } = await import("../canvas/regions.mjs");
  const feet = plan.effect.area.feet;
  const region = await placeArea({
    item, scene, origin: { x: plan.ash.point.x, y: plan.ash.point.y }, rotation: 0, token: null, attach: false,
    areaText: `A ${feet} ft radius`, color: "#5b5348",
    title: t("AZEROTH.WhSign.Ash.Area", { name: actor.name, feet }),
    flags: {
      cast: foundry.utils.randomID(), caster: actor.uuid, source: { sceneId: scene.id, tokenId: plan.ash.sourceTokenId },
      featureKey: ASH_RING_KEY, identifier: ASH_RING_KEY, sustained: false,
      areaTick: tick, lasts: { rounds: tick.lasts.rounds },
      dc: plan.dc,
      spell: { name: SIGNS.ash.name, school: null, tier: null, takesSpellpower: false, img: item?.img ?? null, feature: true },
      placedAt: { combatId: fight?.started ? fight.id : null, round: fight?.started ? fight.round : null, turn: fight?.started ? fight.turn : null, time: game.time?.worldTime ?? 0 }
    }
  }).catch(err => {
    console.warn("azeroth-rpg | the Ash ring could not be placed", err);
    return null;
  });
  if (!region) return [t("AZEROTH.WhSign.Ash.NotLaid", { name: SIGNS.ash.name })];
  return [t("AZEROTH.WhSign.Ash.Laid", { name: actor.name, feet, minutes: plan.effect.minutes })];
}

/** End this hunter's earlier Ash rings: here as a GM, else on the active GM's client. */
async function endAshRings(actor, rings) {
  if (game.user?.isGM) return endAshHere(actor, rings);
  return askGM({ act: "ashEnd", hunterUuid: actor.uuid, rings });
}

/** Delete the rings named, each still this hunter's Ash ring (judged again here). */
export async function endAshHere(actor, rings = []) {
  let ended = 0;
  const bySceneIds = new Map();
  for (const r of rings ?? []) {
    const scene = game.scenes?.get(r?.sceneId) ?? null;
    const region = scene?.regions?.get?.(r?.id) ?? null;
    const f = region?.flags?.[SCOPE] ?? {};
    if (!region || f.identifier !== ASH_RING_KEY || f.caster !== actor?.uuid) continue;
    if (!bySceneIds.has(scene)) bySceneIds.set(scene, []);
    bySceneIds.get(scene).push(region.id);
  }
  for (const [scene, ids] of bySceneIds) {
    await scene.deleteEmbeddedDocuments("Region", ids);
    ended += ids.length;
  }
  return { ended };
}

/** Ask the active GM through the Witch Hunter's one query (`effects/witch-hunter-features.mjs#WH_FEATURES_QUERY`). */
async function askGM(payload) {
  const { WH_FEATURES_QUERY } = await import("./witch-hunter-features.mjs");
  const gm = game.users?.activeGM ?? null;
  if (!gm) return null;
  try {
    return await gm.query(WH_FEATURES_QUERY, payload, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}

/**
 * **THE CONE, SET DOWN WHERE IT WAS AIMED, ONCE THE CARD STANDS** (as 02's Breath's is): the card's own record on
 * the Region, which a cue reads, and taken away once its cue has played (*"Remove after the cue"*, the Breath's
 * rule). Guarded: the board's drawing never undoes the Use.
 *
 * @param {{actor: Actor, item: Item, plan: object, posted: ChatMessage}} o
 */
export async function afterSignCard({ actor, item, plan, posted } = {}) {
  if (!posted || !plan?.facing || !globalThis.canvas?.scene) return;
  // **04's FIRESTREAM** (*The cone of your Ember Sign stays alight until the start of your next turn*; wave 2b): the cone
  // set down as an area that strikes (`effects/witch-hunter-talents.mjs#placeFirestream`), in place of the drawing its cue
  // takes away.
  if (plan.effect?.lingers) {
    const { placeFirestream } = await import("./witch-hunter-talents.mjs");
    if (await placeFirestream({ actor, item, plan, posted })) return;
  }
  try {
    const { regionFlagsFromCard } = await import("../dice/chat.mjs");
    const { placeArea } = await import("../canvas/regions.mjs");
    const { BREATH_CUE_MS } = await import("../rules/chromatic-features.mjs");
    const own = boardToken(actor);
    await placeArea({
      item, areaText: plan.facing.area, name: SIGNS[plan.sign].name, scene: canvas.scene,
      origin: plan.facing.origin, rotation: plan.facing.rotation, token: own, attach: false,
      // **FILED UNDER THE SIGN USED** (wave 3, D-2096): the card's own `featureKey` is the feature's (`signs`), so
      // the cone's Region names the Sign itself, and its `region` cue is that Sign's row (`gale-sign`, `ember-sign`).
      flags: { ...regionFlagsFromCard(posted, actor, item), featureKey: signAnimationKey(plan.sign), afterCue: BREATH_CUE_MS }
    });
  } catch (err) {
    ui.notifications?.warn(t("AZEROTH.Gather.PlaceFailed", { feature: SIGNS[plan.sign].name }));
    console.warn("azeroth-rpg | a Sign's cone could not be drawn", err);
  }
}

/* ------------------------------------------------------------------ */
/*  After a Resist on the Sign's card                                   */
/* ------------------------------------------------------------------ */

/**
 * **THE LULL SIGN OUT OF A FIGHT, ON A FAILED RESIST** (the lead: *"Out of a fight, a creature that fails stays calm
 * toward you for 10 minutes, and you have a Boon on Persuasion and Deception Tests against it. When the effect ends, it
 * knows you used the Lull Sign on it."*): a **calm** marker effect on the creature for 10 minutes of the world's clock,
 * naming the hunter, with NO condition and NO changes (the architect review's F1, wave 2d-A, D-2139: the build had laid
 * **Charmed**, which treats the hunter as an ally and is a dominate the rule never says). The hunter's roll dialog reads
 * it as an automatic Boon on Persuasion and Deception against that creature (`lullBoons`), and its end, however it
 * comes, tells the GM it knows (`registerSignHooks`). Whether the creature then behaves is the GM's call, said on the
 * card. Here, on the client that rolled the creature's Test, which owns it; a second calm from the same hunter
 * replaces the first.
 *
 * @param {{message: ChatMessage, actor: Actor, passed: boolean}} o
 * @returns {Promise<string[]>}
 */
export async function signAfterResist({ message, actor, passed } = {}) {
  const sign = message?.flags?.[SCOPE]?.whSign ?? null;
  if (passed || !sign || sign.sign !== "lull" || sign.calm !== true || !actor?.isOwner) return [];
  const hunter = sign.by ? await fromUuid(sign.by) : null;
  const minutes = LULL_CALM_MINUTES;
  const { minuteSpan } = await import("./durations.mjs");
  const stale = (actor.effects ?? []).filter(e => e.flags?.[SCOPE]?.[LULL_FLAG]?.by === (sign.by ?? null)).map(e => e.id);
  if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
  const [made] = await actor.createEmbeddedDocuments("ActiveEffect", [lullCalmData({ actor, hunter, by: sign.by ?? null, minutes, span: minuteSpan(actor, minutes) })]);
  if (!made) return [];
  return [t("AZEROTH.WhSign.Lull.Calm", { name: actor.name, hunter: hunter?.name ?? "", minutes })];
}

/**
 * **THE CALM'S EFFECT DATA** (the lead's text, F1; D-2139): named for the Sign and the hunter, `origin` the hunter, the
 * 10-minute span, the calm's flag, and nothing that changes a number or lays a condition - no `statuses`, an empty
 * `system.changes`.
 */
export function lullCalmData({ actor, hunter, by, minutes, span }) {
  return {
    name: t("AZEROTH.WhSign.Lull.EffectName", { sign: SIGNS.lull.name, hunter: hunter?.name ?? "" }),
    img: "icons/svg/sleep.svg",
    origin: hunter?.uuid ?? by ?? null,
    description: `<p>${foundry.utils.escapeHTML(t("AZEROTH.WhSign.Lull.EffectText", { name: actor.name, hunter: hunter?.name ?? "", minutes }))}</p>`,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    statuses: [],
    system: { changes: [] },
    ...(span ?? {}),
    flags: { [SCOPE]: { [LULL_FLAG]: { by, name: hunter?.name ?? "", minutes } } }
  };
}

/**
 * **THE CALM'S BOON ON THE HUNTER'S PERSUASION AND DECEPTION TESTS** against the creature it calms: 1 where the
 * creature carries an active calm this hunter laid. Read by the roll dialog (`roll-dialog.mjs`'s skill lines).
 *
 * @param {Actor|null} hunter
 * @param {Actor|null} target
 * @param {string|null} skill
 * @returns {{boons: number, names: string[]}|null}
 */
export function lullBoons(hunter, target, skill = null) {
  if (!hunter || !target || !["persuasion", "deception"].includes(skill)) return null;
  const calm = (target.effects ?? []).some(e => e.active !== false && e.disabled !== true && e.flags?.[SCOPE]?.[LULL_FLAG]?.by === hunter.uuid);
  return calm ? { boons: 1, names: [SIGNS.lull.name] } : null;
}

/**
 * The hooks a Sign's lasting states need, registered once at init: the calm's end tells the GM the creature knows
 * (*When the effect ends, it knows you used the Lull Sign on it*), on the active GM's client.
 */
export function registerSignHooks() {
  Hooks.on("deleteActiveEffect", async effect => {
    const calm = effect?.flags?.[SCOPE]?.[LULL_FLAG] ?? null;
    if (!calm || !game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return;
    const creature = effect.parent;
    const gms = (game.users?.contents ?? []).filter(u => u.isGM).map(u => u.id);
    await ChatMessage.create({
      whisper: gms,
      content: `<div class="azeroth azeroth-card azeroth-card-feature"><div class="azeroth-card-body"><p class="azeroth-card-line">${foundry.utils.escapeHTML(t("AZEROTH.WhSign.Lull.Knows", { name: creature?.name ?? "", hunter: calm.name ?? "" }))}</p></div></div>`,
      flags: { [SCOPE]: { kind: "witchHunterCard", lullEnded: { creature: creature?.uuid ?? null, by: calm.by ?? null } } }
    }).catch(err => console.warn("azeroth-rpg | the Lull Sign's end", err));
  });
}

