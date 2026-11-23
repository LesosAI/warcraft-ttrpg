/**
 * **THE CLASS TALENT AUDIT'S MARTIAL DOORS** (the Warrior, the Paladin and the Ranger; class agent A,
 * D-1870 to D-1879). Where the audit's rows touch the world. `rules/audit-martial.mjs` is the law and
 * holds every number; this module reads it at the doors that already exist:
 *
 * - `judgeMartialUse` / `landMartialUse`: `workflows.useFeature`'s judgement and landing of an
 *   `onUse.martial` - Readiness, Avenging Wrath, Beacon of Hope, Unbreakable, Lay on Hands (Mercy of
 *   Uther's condition) and Snare (the standing count);
 * - `martialOnRoll`: `workflows.rollTest`'s hit door - Sundering Blows, Deathwish, Avenging Wrath's
 *   climb, Overpower's miss and Divine Storm's heal;
 * - `martialAfterCard`: once the attack's card stands - Shield Slam's ended Sustain;
 * - `overpowerAnswered`: the Parry's and the Block's doors (`applications/actions.mjs`);
 * - `martialWhenStruck`: `AzerothActor#_struckBy` - Frenzy and Reckless at rank 2;
 * - `martialAfterHeal`: `AzerothActor#applyHealing` - Twofold Light and Fervor;
 * - `beaconOfHopeHold`: `AzerothActor#_holdAtOne` - Beacon of Hope's granted, lasting hold;
 * - `righteousFuryGain`: `effects/after-blow.mjs` - Righteous Fury's Zeal to its ceiling;
 * - `snareCatchAgain`: `effects/snare-trigger.mjs` - Master of the Land's every-creature Snare.
 *
 * Every write on a creature this client does not own goes through `MARTIAL_QUERY` on the active GM's
 * client, judged again there; every refusal is said in words.
 */

import { AZEROTH } from "../config.mjs";
import * as L from "../rules/audit-martial.mjs";
import { patchRowsOf } from "../rules/class-talents.mjs";
import { allyOf, creaturesWithin, feetBetweenActors, feetBetweenTokens } from "../canvas/engaged.mjs";
import { TOUCH_FEET } from "../rules/range.mjs";
import { clockRounds, untilEncounterEnd, untilNextTurnOrRound } from "./durations.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { layNextAttack } from "./next-attack.mjs";

/** The query a martial write on a creature this client does not own goes through. */
export const MARTIAL_QUERY = "azeroth-rpg.martial";

/** A whole number at least 0. */
const whole = n => Math.max(0, Math.trunc(Number(n)) || 0);

/** Mercy of Uther's claims the GM's client is writing now, so two requests for one condition are one. */
const MERCY_IN_FLIGHT = new Set();

/** A creature's first token on the viewed scene, or null. */
const tokenOf = actor => actor?.getActiveTokens?.(true)?.[0] ?? null;

/** The actor a card row names, or null. */
function actorOfRow(t) {
  if (!t) return null;
  if (t.sceneId && t.tokenId) return game.scenes?.get(t.sceneId)?.tokens?.get(t.tokenId)?.actor ?? null;
  return t.actorId ? (game.actors?.get(t.actorId) ?? null) : null;
}

/** This creature's combatant in the fight it is in, or null. */
function combatantOf(actor) {
  const fight = actor?.activeFight?.() ?? null;
  return fight ? (fight.getCombatantsByActor?.(actor)?.[0] ?? null) : null;
}

/**
 * **A ROUND'S CEILING CLAIMED** (Righteous Fury's and Fervor's *to no more than your rank each round*): the
 * next of `<id>:1` .. `<id>:<rank>` the round's record does not hold, through the combatant's one queue
 * (`markRoundOnce`, D-761). True where a mark was claimed; out of a fight there is no round, and nothing is
 * claimed (both are fight gains: the Zeal drains at a fight's end).
 *
 * @param {Actor} actor
 * @param {string} identifier
 * @param {number} rank
 */
export async function claimRoundCount(actor, identifier, rank) {
  const mine = combatantOf(actor);
  if (!mine?.isOwner) return false;
  const fight = mine.combat;
  const round = mine.getFlag?.("azeroth-rpg", "round") ?? {};
  const used = round.number === fight?.round ? (round.once ?? []) : [];
  for (let i = 1; i <= whole(rank); i++) {
    const key = `${identifier}:${i}`;
    if (used.includes(key)) continue;
    if ((await mine.markRoundOnce(key))?.added === true) return true;
  }
  return false;
}

/** Raise one of the actor's pools by `amount`, to its cap; the amount gained. */
async function gainPool(actor, poolName, amount) {
  const n = whole(amount);
  if (!n || !actor?.isOwner) return 0;
  const pool = (actor.poolSnapshot?.() ?? []).find(p => p.name === poolName) ?? null;
  if (!pool) return 0;
  const value = Math.min(pool.max ?? 0, (pool.value ?? 0) + n);
  if (value > (pool.value ?? 0)) await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  return value - (pool.value ?? 0);
}

/* -------------------------------------------- */
/*  The Use                                      */
/* -------------------------------------------- */

/**
 * **WHAT A MARTIAL USE NEEDS, JUDGED BEFORE ANYTHING IS PAID** (D-768's order). Null refuses the Use (the
 * refusal said in words); a plan carries what the landing needs.
 *
 * @param {{actor: Actor, item: Item, onUse: object, rank?: number, list?: Array}} o
 * @returns {Promise<object|null>}
 */
export async function judgeMartialUse({ actor, item, onUse, list = [] } = {}) {
  const kind = onUse?.martial ?? null;
  if (!L.MARTIAL_USES.includes(kind)) return { key: null };
  if (kind === "readiness") {
    const pool = (actor.poolSnapshot?.() ?? []).find(p => p.name === L.READINESS.pool) ?? null;
    if (!pool) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Martial.NoPool", { name: actor.name, feature: item.name, pool: game.i18n.localize(AZEROTH.poolTypes[L.READINESS.pool] ?? L.READINESS.pool) }));
      return null;
    }
    return { key: kind };
  }
  if (kind === "layOnHands") {
    // Mercy of Uther's condition (`ends`), chosen through the one chooser before anything is paid. A Lay on
    // Hands with none to end - no Mercy, no target, or a target holding no condition - asks nothing.
    const ends = whole(item.system?.ends);
    const target = ends > 0 ? actorOfRow(list[0]) : null;
    if (!target) return { key: kind, ends: [] };
    const choices = L.mercyChoices(target.statuses ?? [], AZEROTH.conditions ?? {});
    if (!choices.length) return { key: kind, ends: [], target };
    const { chooseOption } = await import("../dice/workflows.mjs");
    const picked = await chooseOption(item, choices.map(id => ({ key: id, name: game.i18n.localize(AZEROTH.conditions[id] ?? id), description: "" })), null,
      { prompt: game.i18n.format("AZEROTH.Martial.MercyPrompt", { name: target.name, n: ends }), max: ends });
    if (!picked) return null;
    const ids = (Array.isArray(picked) ? picked : [picked]).map(p => p?.key).filter(id => choices.includes(id)).slice(0, ends);
    // A write on a creature this client does not own needs a GM, asked before anything is paid.
    if (ids.length && !target.isOwner && !game.users?.activeGM) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Martial.NoGM"));
      return null;
    }
    return { key: kind, ends: ids, target };
  }
  if (kind === "snare") {
    // How many Snares stand, and which the new one ends (`audit-martial.mjs#snaresToEnd`): judged now, so
    // a GM-less scene says so before the Half-Action is paid where an end needs a GM.
    const talents = actor.takenTalents?.() ?? [];
    const master = patchRowsOf(talents, L.SNARES.feature).some(r => Number(r.patch?.snares) > 1);
    const limit = L.snareLimit({ tier: actor.system?.tier ?? 1, master });
    const scene = globalThis.canvas?.scene ?? null;
    const standing = scene ? [...(scene.regions ?? [])]
      .filter(r => r.flags?.["azeroth-rpg"]?.featureKey === "snare" && r.flags?.["azeroth-rpg"]?.caster === actor.uuid)
      .map(r => ({ id: r.id, at: Number(r._stats?.createdTime) || 0 })) : [];
    const ends = L.snaresToEnd(standing, limit);
    if (ends.length && !game.user?.isGM && !game.users?.activeGM) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Martial.NoGM"));
      return null;
    }
    return { key: kind, limit, ends, sceneId: scene?.id ?? null };
  }
  // **ONE BEACON AT A TIME** (the wave-2 fix run): a second while one stands would restart every ally's first
  // drop, so it is refused in words before anything is paid; the first ends with the encounter or the clock.
  if (kind === "beaconOfHope" && beaconEffectOf(actor)) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Martial.BeaconStanding", { name: actor.name, feature: item.name }));
    return null;
  }
  // Avenging Wrath, Beacon of Hope and Unbreakable lay an effect on the user, who is this client's own.
  return { key: kind };
}

/**
 * **A MARTIAL USE, NOW THAT IT IS PAID FOR**: the lines the card prints.
 *
 * @param {{actor: Actor, item: Item, plan: object, list?: Array}} o
 * @returns {Promise<string[]>}
 */
export async function landMartialUse({ actor, item, plan } = {}) {
  const lines = [];
  if (plan?.key === "readiness") {
    const pool = (actor.poolSnapshot?.() ?? []).find(p => p.name === L.READINESS.pool) ?? null;
    if (pool && (pool.value ?? 0) < (pool.max ?? 0)) await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.max });
    lines.push(game.i18n.format("AZEROTH.Martial.Readiness", { name: actor.name, n: pool?.max ?? 0 }));
  }
  if (plan?.key === "avengingWrath") {
    const fight = actor.activeFight?.() ?? null;
    // Spanned as well as flagged (the class talent audit's final review): out of a fight it would otherwise
    // stand until the NEXT fight ended (`avengingWrathSpan`).
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: item.name, img: item.img, origin: actor.uuid, description: "", ...avengingWrathSpan(actor),
      flags: { "azeroth-rpg": { talentBuff: true, until: "encounter", [L.AVENGING_WRATH.flag]: { round: fight?.started ? fight.round : null, source: item.name } } }
    }]);
    lines.push(game.i18n.format("AZEROTH.Martial.AvengingWrath", { name: actor.name, max: L.AVENGING_WRATH.max }));
  }
  if (plan?.key === "beaconOfHope") {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: item.name, img: item.img, origin: actor.uuid, description: "", ...beaconOfHopeSpan(actor),
      flags: { "azeroth-rpg": { holdLasting: true, [L.BEACON_OF_HOPE.flag]: { source: item.name, feet: L.BEACON_OF_HOPE.feet, held: [] } } }
    }]);
    lines.push(game.i18n.format("AZEROTH.Martial.BeaconOfHope", { name: actor.name, feet: L.BEACON_OF_HOPE.feet }));
  }
  if (plan?.key === "unbreakable") {
    // **TIMELESS SENTINEL'S SHAPE** (`rules/guardian.mjs#sentinelMove`): every attack on an ally within 10
    // feet is moved onto the warrior by the damage door, asked of nobody; and the warrior's Blocks are
    // free (`applications/actions.mjs#freeReactionOf`). Until the start of the warrior's next turn.
    const { SENTINEL_FLAG } = await import("../rules/guardian.mjs");
    const span = untilNextTurnOrRound(actor) ?? {};
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: item.name, img: item.img, origin: actor.uuid, description: "", ...span,
      flags: { "azeroth-rpg": { [SENTINEL_FLAG]: { source: item.name, by: actor.uuid, feet: L.UNBREAKABLE.feet }, [L.UNBREAKABLE.flag]: { source: item.name } } }
    }]);
    lines.push(game.i18n.format("AZEROTH.Martial.Unbreakable", { name: actor.name, feet: L.UNBREAKABLE.feet }));
  }
  if (plan?.key === "layOnHands" && plan.target && plan.ends?.length) {
    // **THE USE'S RECORD, WRITTEN NOW IT IS PAID** (the class talent audit's final review): the GM's client
    // ends a condition on a creature this client does not own only against this record - this Use's id, its
    // target and the conditions chosen - and claims each off it once (`L.mercyUseRefusal`).
    const useId = foundry.utils.randomID();
    if (!plan.target.isOwner) await item.setFlag("azeroth-rpg", "mercyUse", { id: useId, target: plan.target.uuid, ends: [...plan.ends], claimed: [] });
    for (const id of plan.ends) {
      const done = await endCondition({ target: plan.target, id, by: actor, item, useId });
      lines.push(game.i18n.format(done ? "AZEROTH.Martial.MercyEnded" : "AZEROTH.Martial.MercyNot", {
        name: plan.target.name, condition: game.i18n.localize(AZEROTH.conditions[id] ?? id)
      }));
    }
  }
  if (plan?.key === "snare") {
    if (plan.ends?.length) {
      const ended = await endSnares({ actor, sceneId: plan.sceneId, ids: plan.ends });
      lines.push(game.i18n.format("AZEROTH.Martial.SnareEnded", { n: ended, limit: plan.limit }));
    } else {
      lines.push(game.i18n.format("AZEROTH.Martial.SnareLimit", { limit: plan.limit }));
    }
  }
  return lines;
}

/**
 * End one condition on a creature (Mercy of Uther), here or on the GM's client - there against the Use's record
 * on the Lay on Hands item (`mercyUse`). True where it ended.
 */
async function endCondition({ target, id, by, item = null, useId = null }) {
  if (!target?.statuses?.has(id)) return false;
  if (target.isOwner) {
    await target.toggleStatusEffect(id, { active: false });
    return !target.statuses?.has(id);
  }
  const gm = game.users?.activeGM ?? null;
  if (!gm) return false;
  try {
    const answer = await gm.query(MARTIAL_QUERY, { act: "mercy", byUuid: by.uuid, targetUuid: target.uuid, id, itemId: item?.id ?? null, useId }, { timeout: 15000 });
    return answer?.ok === true;
  } catch (err) {
    ui.notifications?.warn(err.message);
    return false;
  }
}

/** Delete the Ranger's oldest Snares (02 §7: *setting another ends your oldest*); how many went. */
async function endSnares({ actor, sceneId, ids }) {
  const scene = game.scenes?.get(sceneId) ?? null;
  if (!scene || !ids?.length) return 0;
  const live = ids.filter(id => scene.regions?.get(id)?.flags?.["azeroth-rpg"]?.caster === actor.uuid);
  if (!live.length) return 0;
  if (game.user?.isGM) {
    await scene.deleteEmbeddedDocuments("Region", live);
    return live.length;
  }
  const gm = game.users?.activeGM ?? null;
  if (!gm) return 0;
  try {
    const answer = await gm.query(MARTIAL_QUERY, { act: "snare", byUuid: actor.uuid, sceneId, ids: live }, { timeout: 15000 });
    return whole(answer?.ended);
  } catch (err) {
    ui.notifications?.warn(err.message);
    return 0;
  }
}

/* -------------------------------------------- */
/*  The roll                                     */
/* -------------------------------------------- */

/**
 * **WHAT A MARTIAL TALENT OR FEATURE DOES AT THE ROLL** (the attack's hit door, before the card is posted):
 * the card's fired rows, each `{key, name, text, extraDamage?}` - an `extraDamage` riding the blow's Rating.
 *
 * @param {{actor: Actor, outcome: object, list?: Array, damage?: object|null, fromFeature?: object|null, secondRoll?: boolean}} o
 * @returns {Promise<Array<object>>}
 */
export async function martialOnRoll({ actor, outcome, list = [], damage = null, fromFeature = null } = {}) {
  const fired = [];
  if (!actor || actor.type !== "character") return fired;
  const hit = outcome?.success === true;
  const fight = actor.activeFight?.() ?? null;
  const mine = combatantOf(actor);
  const onceThisRound = async key => (!fight?.started || !mine ? true : (mine.isOwner && (await mine.markRoundOnce(key))?.added === true));
  // **04's SUNDERING BLOWS**: a hit on a target the warrior sundered.
  const blows = actor.talentRanks?.("Sundering Blows") ?? 0;
  if (blows > 0 && hit && list.some(t => L.sunderedBy([...(actorOfRow(t)?.effects ?? [])], actor.uuid)) && await onceThisRound(L.SUNDERING_BLOWS.mark)) {
    const at = L.sunderingBlowsAt(blows);
    const got = await gainPool(actor, "rage", at.rage);
    fired.push({ key: "talent", name: "Sundering Blows", text: game.i18n.format("AZEROTH.Martial.SunderingBlows", { n: got, damage: at.damage }), ...(at.damage && damage ? { extraDamage: at.damage } : {}) });
  }
  // **02's DEATHWISH**: below half, +2 to the Damage Rating on a hit, and 2 more Rage off the round's first.
  if (actor.hasFeature?.(L.DEATHWISH.feature) && hit && L.below(actor.system?.health ?? null, L.DEATHWISH.below)) {
    const first = await onceThisRound(L.DEATHWISH.mark);
    const at = L.deathwishAt({ held: true, health: actor.system?.health, hit: true, firstThisRound: first });
    const got = at.rage ? await gainPool(actor, "rage", at.rage) : 0;
    fired.push({ key: "talent", name: L.DEATHWISH.feature, text: game.i18n.format("AZEROTH.Martial.Deathwish", { rating: at.rating, n: got }), ...(damage ? { extraDamage: at.rating } : {}) });
  }
  // **02's AVENGING WRATH'S CLIMB**: 1 a round since it was used, to 3, on an attack that hits.
  const wrath = L.avengingWrathOf([...(actor.effects ?? [])]);
  const climb = wrath && hit && damage ? L.avengingWrathBonus(wrath, fight?.started ? fight.round : null) : 0;
  if (climb > 0) fired.push({ key: "talent", name: L.AVENGING_WRATH.feature, text: game.i18n.format("AZEROTH.Martial.AvengingWrathHit", { n: climb }), extraDamage: climb });
  // **04's OVERPOWER ON A MISS**: Rage a rank, and once a turn the next attack at that target a Boon.
  const overpower = actor.talentRanks?.("Overpower") ?? 0;
  if (overpower > 0 && !hit) {
    const got = await gainPool(actor, "rage", L.overpowerRage(overpower));
    const promised = await overpowerPromise(actor, list[0] ?? null);
    fired.push({ key: "talent", name: "Overpower", text: game.i18n.format(promised ? "AZEROTH.Martial.OverpowerBoon" : "AZEROTH.Martial.Overpower", { n: got, target: list[0]?.name ?? "" }) });
  }
  // 02's Divine Storm's heal is made once the hit's card stands (`martialAfterCard`), so the GM's client can
  // judge it off the posted card (the wave-2 fix run).
  return fired;
}

/** Overpower's once-a-turn promise of a Boon to the next attack at that target; true where it was laid. */
async function overpowerPromise(actor, target) {
  const fight = actor.activeFight?.() ?? null;
  const mine = combatantOf(actor);
  const key = target?.tokenId ?? target?.actorId ?? null;
  if (!fight?.started || !mine?.isOwner || !key) return false;
  if ((await mine.markRoundOnce(`${L.OVERPOWER.mark}@${fight.turn}`))?.added !== true) return false;
  const laid = await layNextAttack(actor, [{ source: L.OVERPOWER.identifier, name: "Overpower", boons: L.OVERPOWER.boons, lasts: "turn", targetKey: key }], { quiet: true });
  return laid.length > 0;
}

/** Whether a write on these creatures needs a GM this client does not have (`rules/gm-writes.mjs#gmAbsentFor`). */
function gmAbsentForActors(actors = []) {
  return gmAbsentFor({ owned: actors.map(a => a?.isOwner === true), isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });
}

/**
 * The friendly creatures a heal may reach, after `gmAbsentFor` is asked BEFORE any chooser (the wave-2 fix
 * run): with no GM online, only the creatures this client owns, and the rest said in words.
 */
function reachableAllies(rows, feature) {
  if (!gmAbsentForActors(rows.map(r => r.actor))) return rows;
  const owned = rows.filter(r => r.actor?.isOwner);
  if (owned.length < rows.length) ui.notifications?.warn(game.i18n.format("AZEROTH.Martial.HealNoGM", { feature }));
  return owned;
}

/** The friendly creature picked among those listed, through the one chooser where there are two or more. */
async function pickAlly(item, rows, prompt) {
  if (rows.length < 2) return rows[0] ?? null;
  const { chooseOption } = await import("../dice/workflows.mjs");
  const picked = await chooseOption(item, rows.map(r => ({ key: r.token.id, name: r.token.name ?? r.actor.name, description: "" })), null, { prompt });
  return rows.find(r => r.token.id === picked?.key) ?? null;
}

/** The Divine Storm card a posted attack card was made from, where it is this Paladin's; else null. */
function divineStormCardOf(actor, attack) {
  const fromId = attack?.flags?.["azeroth-rpg"]?.fromFeature?.messageId ?? null;
  const card = fromId ? game.messages?.get(fromId) ?? null : null;
  const item = card ? actor?.items?.get(card.flags?.["azeroth-rpg"]?.itemId) ?? null : null;
  return item?.name === L.DIVINE_STORM.feature ? { card, item } : null;
}

/**
 * **02's DIVINE STORM'S HEAL, JUDGED** (*For each that hits, one friendly target within 10 feet of you recovers
 * Health equal to your tier*): the card is this Paladin's Divine Storm, the attack card is the Paladin's, made
 * from it, and a hit; this hit has not healed yet (`divineStormHealed` on the Divine Storm card, the attack
 * cards' ids); the creature is the Paladin's ally within 10 feet. A reason key, or null. Asked here and again on
 * the GM's client.
 */
function divineStormRefusal({ by, card, attack, ally }) {
  const flags = card?.flags?.["azeroth-rpg"] ?? {};
  const item = card ? by?.items?.get(flags.itemId) ?? null : null;
  const aflags = attack?.flags?.["azeroth-rpg"] ?? {};
  if (!by || !card || item?.name !== L.DIVINE_STORM.feature || ChatMessage.getSpeakerActor(card.speaker)?.uuid !== by.uuid) return "AZEROTH.Martial.DivineStormRefused";
  if (!attack || aflags.kind !== "attack" || aflags.fromFeature?.messageId !== card.id
    || ChatMessage.getSpeakerActor(attack.speaker)?.uuid !== by.uuid || attack.rolls?.[0]?.outcome?.success !== true) return "AZEROTH.Martial.DivineStormRefused";
  if ((flags.divineStormHealed ?? []).includes(attack.id)) return "AZEROTH.Martial.DivineStormAgain";
  // Off the card's scene's token documents (the class talent audit's final review), so a GM viewing another
  // scene judges it too; no distance refuses (fail closed).
  const feet = feetBetweenActors(by, ally, sceneOfCard(card));
  if (!ally || !(ally.uuid === by.uuid || allyOf(by, ally)) || !(typeof feet === "number" && feet <= L.DIVINE_STORM.feet)) return "AZEROTH.Martial.DivineStormFar";
  return null;
}

/** Divine Storm's heal for one hit, judged and recorded on the card, then landed: Health restored, or a refusal. */
async function divineStormHere({ by, card, attack, ally }) {
  const refused = divineStormRefusal({ by, card, attack, ally });
  if (refused) throw new Error(game.i18n.format(refused, { name: ally?.name ?? "", feet: L.DIVINE_STORM.feet }));
  await card.update({ "flags.azeroth-rpg.divineStormHealed": [...(card.flags?.["azeroth-rpg"]?.divineStormHealed ?? []), attack.id] });
  const before = ally.system?.health?.value ?? 0;
  await ally.applyHealing(Math.max(1, whole(by.system?.tier ?? 1)), { from: by, feature: true, featureName: L.DIVINE_STORM.feature });
  return Math.max(0, (ally.system?.health?.value ?? before) - before);
}

/**
 * **02's DIVINE STORM, ONCE THE HIT'S CARD STANDS** (the wave-2 fix run): every friendly creature within 10
 * feet, wounded, of whichever owner - asked whether a GM is needed before the chooser - the Paladin's pick,
 * and the heal written here where this client may write both the card and the creature, else on the GM's
 * client, judged again there.
 */
async function divineStormAfterHit(actor, attack) {
  const storm = divineStormCardOf(actor, attack);
  if (!storm) return;
  const rows = creaturesWithin(actor, L.DIVINE_STORM.feet, { from: tokenOf(actor), who: "ally" })
    .filter(r => r.actor && (r.actor.system?.health?.value ?? 0) < (r.actor.system?.health?.max ?? 0));
  if (!rows.length) {
    ui.notifications?.info(game.i18n.format("AZEROTH.Martial.DivineStormNone", { feet: L.DIVINE_STORM.feet }));
    return;
  }
  const open = reachableAllies(rows, storm.item.name);
  const amount = Math.max(1, whole(actor.system?.tier ?? 1));
  const chosen = await pickAlly(storm.item, open, game.i18n.format("AZEROTH.Martial.DivineStormPrompt", { n: amount }));
  if (!chosen) {
    ui.notifications?.info(game.i18n.localize("AZEROTH.Martial.DivineStormSkipped"));
    return;
  }
  try {
    let n;
    if (game.user?.isGM || (chosen.actor.isOwner && storm.card.isOwner)) n = await divineStormHere({ by: actor, card: storm.card, attack, ally: chosen.actor });
    else {
      const gm = game.users?.activeGM ?? null;
      if (!gm) throw new Error(game.i18n.localize("AZEROTH.Martial.NoGM"));
      const answer = await gm.query(MARTIAL_QUERY, { act: "divineStorm", byUuid: actor.uuid, cardId: storm.card.id, attackId: attack.id, targetUuid: chosen.actor.uuid }, { timeout: 15000 });
      n = whole(answer?.healed);
    }
    ui.notifications?.info(game.i18n.format("AZEROTH.Martial.DivineStormHealed", { name: chosen.token.name ?? chosen.actor.name, n }));
  } catch (err) {
    ui.notifications?.warn(err.message);
  }
}

/**
 * **ONCE THE ATTACK'S CARD STANDS**: 04's Shield Slam at rank 2 - a hit at SL 2 ends one spell each target
 * is Sustaining, the warrior's pick where it holds more than one, through the GM's client where the target
 * is another's (judged again there off the posted card).
 *
 * @param {{actor: Actor, message: ChatMessage, outcome: object, list?: Array, riderRows?: Array}} o
 */
export async function martialAfterCard({ actor, message, outcome, list = [], riderRows = [] } = {}) {
  // 02's Divine Storm: each hit heals one friendly target within 10 feet (the wave-2 fix run).
  if (outcome?.success === true && message?.flags?.["azeroth-rpg"]?.fromFeature?.messageId) await divineStormAfterHit(actor, message);
  const slam = (riderRows ?? []).find(p => p?.identifier === L.SHIELD_SLAM.identifier) ?? null;
  const rank = whole(slam?.line?.rank);
  if (!slam || rank < L.SHIELD_SLAM.rank || outcome?.success !== true || whole(outcome.sl) < L.SHIELD_SLAM.sl) return;
  for (const [index, t] of list.entries()) {
    const victim = actorOfRow(t);
    const held = (victim?.getFlag?.("azeroth-rpg", "sustaining") ?? []).filter(e => e && typeof e === "object");
    if (!victim || !held.length) continue;
    let entry = held[0];
    if (held.length > 1) {
      const { chooseOption } = await import("../dice/workflows.mjs");
      const picked = await chooseOption({ name: "Shield Slam" }, held.map((e, i) => ({ key: String(i), name: e.name ?? "", description: "" })), null,
        { prompt: game.i18n.format("AZEROTH.Martial.ShieldSlamPrompt", { name: victim.name }) });
      entry = held[Number(picked?.key)] ?? null;
    }
    if (!entry) continue;
    const ended = await endTargetSustain({ actor, victim, entry, message, index });
    ui.notifications?.[ended ? "info" : "warn"](game.i18n.format(ended ? "AZEROTH.Martial.ShieldSlamEnded" : "AZEROTH.Martial.ShieldSlamNot", { name: victim.name, spell: entry.name ?? "" }));
  }
}

/** End one Sustain a creature holds (Shield Slam), here or on the GM's client. */
async function endTargetSustain({ actor, victim, entry, message, index }) {
  const key = entry?.cast ? { cast: entry.cast, spellId: null, uuid: null } : { cast: null, spellId: entry?.spellId ?? null, uuid: entry?.uuid ?? null };
  if (victim.isOwner) {
    const { endSustain } = await import("../dice/workflows.mjs");
    return Boolean(await endSustain({ actor: victim, ...key, notice: "AZEROTH.Martial.ShieldSlamNotice" }));
  }
  const gm = game.users?.activeGM ?? null;
  if (!gm) return false;
  try {
    const answer = await gm.query(MARTIAL_QUERY, { act: "shieldSlam", byUuid: actor.uuid, targetUuid: victim.uuid, messageId: message?.id ?? null, index, ...key }, { timeout: 15000 });
    return answer?.ok === true;
  } catch (err) {
    ui.notifications?.warn(err.message);
    return false;
  }
}

/**
 * **04's OVERPOWER ON A PARRY OR A BLOCK** (*When an attack of yours ... is Parried or Blocked, gain 1 Rage
 * per rank. Once a turn, your next attack against that target this turn gains a Boon*): the attacker of the
 * card answered, where this client may write it. The line the Reaction's card prints, or null.
 *
 * @param {{messageId: string|null, defender: Actor}} o
 * @returns {Promise<string|null>}
 */
export async function overpowerAnswered({ messageId = null, defender = null } = {}) {
  const message = messageId ? game.messages?.get(messageId) ?? null : null;
  const attacker = message ? ChatMessage.getSpeakerActor(message.speaker) : null;
  const rank = attacker?.talentRanks?.("Overpower") ?? 0;
  if (!attacker || rank < 1) return null;
  if (!attacker.isOwner) return game.i18n.format("AZEROTH.Martial.OverpowerNotYours", { name: attacker.name });
  const got = await gainPool(attacker, "rage", L.overpowerRage(rank));
  const token = tokenOf(defender);
  const promised = await overpowerPromise(attacker, { tokenId: token?.id ?? null, actorId: defender?.id ?? null, name: defender?.name ?? "" });
  return game.i18n.format(promised ? "AZEROTH.Martial.OverpowerBoon" : "AZEROTH.Martial.Overpower", { n: got, target: defender?.name ?? "" });
}

/* -------------------------------------------- */
/*  The blow taken, the heal given               */
/* -------------------------------------------- */

/**
 * **WHAT A BLOW TAKEN GIVES THE WARRIOR** (the struck door, `AzerothActor#_struckBy`): 04's Frenzy (the first
 * time each encounter below half, twice the tier in Rage, its counter struck) and Reckless at rank 2 (each
 * hit taken while the exposure stands, 1 more Rage). The gains, as `updatePool` rows the door merges.
 *
 * @param {{actor: Actor, before: number, after: number, max: number, attack?: boolean}} o
 * @returns {Promise<Array<{itemId: string|null, kind: string, name: string, value: number}>>}
 */
export async function martialWhenStruck({ actor, before = 0, after = 0, max = 0, attack = false } = {}) {
  if (!actor || actor.type !== "character" || !actor.isOwner) return [];
  const rage = (actor.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === "rage") ?? null;
  if (!rage) return [];
  let more = 0;
  const frenzy = (actor.takenTalents?.() ?? []).find(t => t.identifier === L.FRENZY.identifier && t.className === "Warrior") ?? null;
  if (frenzy && L.droppedBelow({ before, after, max, share: L.FRENZY.below })) {
    const counter = actor.grantedFeature?.(frenzy.id) ?? null;
    const left = whole(counter?.system?.uses?.value);
    if (counter && left > 0) {
      await counter.update({ "system.uses.value": left - 1 });
      more += L.frenzyRage(actor.system?.tier ?? 1);
      ui.notifications?.info(game.i18n.format("AZEROTH.Martial.Frenzy", { name: actor.name, n: L.frenzyRage(actor.system?.tier ?? 1) }));
    }
  }
  const reckless = actor.talentRanks?.("Reckless") ?? 0;
  if (attack && reckless >= L.RECKLESS_RAGE.rank && before > after
    && (actor.effects ?? []).some(e => e.active !== false && e.flags?.["azeroth-rpg"]?.exposed)) more += L.RECKLESS_RAGE.rage;
  if (!more) return [];
  return [{ itemId: rage.itemId, kind: "momentum", name: "rage", value: more }];
}

/**
 * **WHAT A HEAL GIVEN SETS OFF** (the healing door, after the Health landed): 04's Twofold Light (Mending
 * Word's heal shared, half, rounded down, with one other friendly target within 10 feet of its target, the
 * healer's pick) and Fervor (a Holy spell's heal on a friendly target, 1 Zeal to the rank's ceiling a round).
 *
 * @param {{healed: Actor, from: Actor|null, spell?: boolean, school?: string|null, featureName?: string|null, restored?: number, shared?: boolean}} o
 */
export async function martialAfterHeal({ healed, from = null, spell = false, school = null, featureName = null, restored = 0, shared = false, messageId = null } = {}) {
  if (!from || from.type !== "character" || typeof from.takenTalents !== "function") return;
  const talents = from.takenTalents();
  const holds = id => talents.some(t => t.identifier === id && t.className === "Paladin");
  const friendly = healed === from || healed?.uuid === from.uuid || allyOf(from, healed);
  if (L.fervorApplies({ holds: holds(L.FERVOR.identifier), spell, school, restored, friendly }) && from.isOwner) {
    const rank = from.talentRanks?.("Fervor") ?? 0;
    if (await claimRoundCount(from, L.FERVOR.identifier, rank)) {
      const got = await gainPool(from, "zeal", L.FERVOR.zeal);
      if (got) ui.notifications?.info(game.i18n.format("AZEROTH.Martial.Fervor", { name: from.name, n: got }));
    }
  }
  if (L.twofoldApplies({ holds: holds(L.TWOFOLD_LIGHT.identifier), featureName, restored, shared })) {
    const share = L.twofoldShare(restored);
    if (share < 1 || !healed?.uuid) return;
    // **BOUND TO THE MENDING WORD CARD WHOSE HEAL SET IT OFF** (the class talent audit's final review): a heal
    // that names no card shares nothing, said in words - the card is what the share is judged, read and
    // marked against, once.
    if (!messageId) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Martial.TwofoldNoCard", { name: from.name }));
      return;
    }
    // **THE PALADIN PICKS, WHEREVER THE FIRST HEAL WAS WRITTEN** (the wave-2 fix run): the healing door runs on
    // whichever client wrote the heal - often the GM's - so the pick is asked of whoever answers for the
    // Paladin (an active owning player, else the active GM) through `MARTIAL_ASK_QUERY`.
    const payload = { act: "twofold", byUuid: from.uuid, healedUuid: healed.uuid, share, cardId: messageId };
    const who = answererFor(from);
    if (!who) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Martial.TwofoldNobody", { name: from.name }));
      return;
    }
    try {
      if (who.id === game.user?.id) await twofoldPick(payload);
      else await who.query(MARTIAL_ASK_QUERY, payload, { timeout: 60000 });
    } catch (err) {
      ui.notifications?.warn(err.message);
    }
  }
}

/** The user who answers for a creature: an active player who owns it, else the active GM, else nobody. */
function answererFor(actor) {
  const players = (game.users?.filter?.(u => u.active && !u.isGM && actor?.testUserPermission?.(u, "OWNER")) ?? [])
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return players[0] ?? game.users?.activeGM ?? null;
}

/** The most Twofold Light can share: half of Mending Word's largest heal, at the Paladin's tier and Charisma. */
function twofoldCeiling(by) {
  const tier = Math.max(1, whole(by?.system?.tier ?? 1));
  return L.twofoldShare(2 * tier + Math.max(0, Math.trunc(Number(by?.system?.abilities?.cha?.mod)) || 0));
}

/** The scene a card was spoken on, else null (a distance is then measured on a synthetic actor's own or the viewed one). */
function sceneOfCard(card) {
  return card?.speaker?.scene ? (game.scenes?.get(card.speaker.scene) ?? null) : null;
}

/**
 * What `L.twofoldCardRefusal` reads off a Mending Word card: its kind, its speaker, the item it was made by
 * (on this Paladin), the creatures it names and whether it has shared a heal. Null for no card.
 */
function twofoldCardOf(card, by) {
  if (!card) return null;
  const flags = card.flags?.["azeroth-rpg"] ?? {};
  return {
    kind: flags.kind ?? null,
    speakerUuid: ChatMessage.getSpeakerActor(card.speaker)?.uuid ?? null,
    itemName: by?.items?.get?.(flags.itemId)?.name ?? null,
    targetUuids: (Array.isArray(flags.targets) ? flags.targets : []).map(t => actorOfRow(t)?.uuid ?? null),
    shared: flags.twofoldShared === true
  };
}

/** The share a Mending Word card allows: half its heal, under the ceiling, never past what was asked. */
function twofoldAmountOf(card, by, asked) {
  return L.twofoldAmount({ cardHeal: whole(card?.flags?.["azeroth-rpg"]?.heal), ceiling: twofoldCeiling(by), asked });
}

/**
 * **04's TWOFOLD LIGHT, JUDGED** (*one other friendly target within 10 feet of its target recovers half as much,
 * rounded down*): the Paladin holds the talent; the Mending Word card that set it off is this Paladin's, names the
 * creature first healed where it names any, and has not shared yet (`L.twofoldCardRefusal`, the class talent
 * audit's final review); the creature is the Paladin's ally (or the Paladin), not the one first healed, and within
 * 10 feet of it - measured off the card's scene's token documents, refused where it cannot be. A reason key, or
 * null. Asked here and again on the GM's client.
 */
function twofoldRefusal({ by, healed, ally, card }) {
  const holds = (by?.takenTalents?.() ?? []).some(t => t.identifier === L.TWOFOLD_LIGHT.identifier && t.className === "Paladin");
  if (!holds || !healed || !ally || ally.uuid === healed.uuid) return "AZEROTH.Martial.TwofoldRefused";
  const onCard = L.twofoldCardRefusal({ card: twofoldCardOf(card, by), byUuid: by?.uuid ?? null, healedUuid: healed.uuid });
  if (onCard) return onCard;
  const feet = feetBetweenActors(healed, ally, sceneOfCard(card));
  if (!(ally.uuid === by.uuid || allyOf(by, ally)) || !(typeof feet === "number" && feet <= L.TWOFOLD_LIGHT.feet)) return "AZEROTH.Martial.TwofoldRefused";
  return null;
}

/**
 * Twofold Light's share, landed here or on the GM's client: judged, the card marked as having shared BEFORE the
 * heal (claimed once, as Divine Storm's `divineStormHealed`), and the amount read off the card. The Health given.
 */
async function twofoldLand({ by, healed, ally, share, card }) {
  const refused = twofoldRefusal({ by, healed, ally, card });
  if (refused) throw new Error(game.i18n.format(refused, { name: ally?.name ?? "" }));
  const n = twofoldAmountOf(card, by, share);
  if (n < 1) return 0;
  await card.update({ "flags.azeroth-rpg.twofoldShared": true });
  await ally.applyHealing(n, { from: by, feature: true, featureName: null, shared: true });
  return n;
}

/**
 * **TWOFOLD LIGHT'S PICK, ON THE PALADIN'S ANSWERER**: the Mending Word card judged first (`L.twofoldCardRefusal`),
 * every friendly creature within 10 feet of the one healed, of whichever owner - `gmAbsentFor` asked before the
 * chooser - the pick, and the share landed here where this client may write both the card and the creature,
 * else on the GM's client, judged again there.
 */
async function twofoldPick({ byUuid, healedUuid, share, cardId = null } = {}) {
  const by = byUuid ? await fromUuid(byUuid) : null;
  const healed = healedUuid ? await fromUuid(healedUuid) : null;
  if (by?.documentName !== "Actor" || healed?.documentName !== "Actor") return { ok: false };
  const card = cardId ? game.messages?.get(cardId) ?? null : null;
  const onCard = L.twofoldCardRefusal({ card: twofoldCardOf(card, by), byUuid: by.uuid, healedUuid: healed.uuid });
  if (onCard) throw new Error(game.i18n.format(onCard, { name: by.name }));
  const amount = twofoldAmountOf(card, by, share);
  if (amount < 1) return { ok: false };
  const rows = creaturesWithin(by, L.TWOFOLD_LIGHT.feet, { from: tokenOf(healed), who: "ally" })
    .filter(r => r.actor && r.actor.uuid !== healed.uuid);
  const open = reachableAllies(rows, "Twofold Light");
  const chosen = await pickAlly({ name: "Twofold Light" }, open, game.i18n.format("AZEROTH.Martial.TwofoldPrompt", { name: healed.name, n: amount }));
  if (!chosen) return { ok: false };
  let n;
  if (game.user?.isGM || (chosen.actor.isOwner && card.isOwner)) n = await twofoldLand({ by, healed, ally: chosen.actor, share: amount, card });
  else {
    const gm = game.users?.activeGM ?? null;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Martial.NoGM"));
    n = whole((await gm.query(MARTIAL_QUERY, { act: "twofold", byUuid: by.uuid, healedUuid: healed.uuid, targetUuid: chosen.actor.uuid, share: amount, cardId: card.id }, { timeout: 15000 }))?.healed);
  }
  ui.notifications?.info(game.i18n.format("AZEROTH.Martial.Twofold", { name: chosen.token.name ?? chosen.actor.name, n }));
  return { ok: true };
}

/** The query a pick is asked of the user who answers for the Paladin through (Twofold Light). */
export const MARTIAL_ASK_QUERY = "azeroth-rpg.martialAsk";

/**
 * **THE PALADIN'S ANSWERER'S HANDLER** (`MARTIAL_ASK_QUERY`): this user must answer for the Paladin - own it, or
 * be the GM - and the pick is theirs. What it writes goes through the doors that judge again.
 */
export async function martialAskHandler(data = {}) {
  const by = data.byUuid ? await fromUuid(data.byUuid) : null;
  if (by?.documentName !== "Actor" || !(game.user?.isGM || by.testUserPermission(game.user, "OWNER"))) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: by?.name ?? "" }));
  }
  if (data.act === "twofold") return twofoldPick(data);
  throw new Error(game.i18n.localize("AZEROTH.Martial.QueryAuthority"));
}

/** A Paladin's standing Beacon of Hope effect, or null. */
function beaconEffectOf(paladin) {
  return [...(paladin?.effects ?? [])].find(e => e.active !== false && e.disabled !== true && e.flags?.["azeroth-rpg"]?.[L.BEACON_OF_HOPE.flag]) ?? null;
}

/**
 * **02's BEACON OF HOPE AT THE ONE HOLD AT 1** (*Until the encounter ends, the first time each ally within 30
 * feet drops to 0 Health, they return to 1 instead*; the wave-2 fix run, 06 §9's rule 2): a LASTING hold, so it
 * neither reads nor claims the creature's shared once-an-encounter granted mark. Its own words limit it: the
 * first drop of each ally, recorded on the Beacon's effect (`held`, the allies' uuids) before it holds - here
 * where this client owns the Paladin, on the active GM's client where it does not. 06 §9's rule 1 (one hold a
 * blow) is the door's own: the first hold that answers ends the search. What is left of the blow and who held
 * it, or null.
 *
 * @param {{target: Actor, before: number, amount: number}} o
 */
export async function beaconOfHopeHold({ target, before = 0, amount = 0 } = {}) {
  const own = tokenOf(target);
  for (const paladin of game.actors?.contents ?? []) {
    if (paladin.type !== "character") continue;
    const effect = beaconEffectOf(paladin);
    if (!effect || L.beaconHeldBefore(effect.flags["azeroth-rpg"][L.BEACON_OF_HOPE.flag], target.uuid)) continue;
    const theirs = tokenOf(paladin);
    const feet = paladin.uuid === target.uuid ? 0 : feetBetweenTokens(theirs, own);
    if (!L.beaconHolds({ standing: true, ally: allyOf(paladin, target), feet, before, amount })) continue;
    if (!(await recordBeaconHold({ paladin, effect, target, before, amount }))) continue;
    ui.notifications?.info(game.i18n.format("AZEROTH.Martial.BeaconHeld", { name: target.name, holder: paladin.name }));
    return { amount: Math.max(0, before - 1), held: { kind: L.BEACON_OF_HOPE.kind, name: L.BEACON_OF_HOPE.feature, holder: paladin } };
  }
  return null;
}

/** Write the ally on the Beacon's record, here or on the GM's client; true where it was written now. */
async function recordBeaconHold({ paladin, effect, target, before, amount }) {
  if (effect.isOwner) {
    const now = effect.flags?.["azeroth-rpg"]?.[L.BEACON_OF_HOPE.flag] ?? {};
    if (L.beaconHeldBefore(now, target.uuid)) return false;
    await effect.update({ [`flags.azeroth-rpg.${L.BEACON_OF_HOPE.flag}.held`]: [...(now.held ?? []), target.uuid] });
    return true;
  }
  const gm = game.users?.activeGM ?? null;
  if (!gm) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Martial.BeaconNoGM", { name: target.name, holder: paladin.name }));
    return false;
  }
  try {
    const answer = await gm.query(MARTIAL_QUERY, { act: "beaconHeld", byUuid: paladin.uuid, targetUuid: target.uuid, before, amount }, { timeout: 15000 });
    return answer?.ok === true;
  } catch (err) {
    ui.notifications?.warn(err.message);
    return false;
  }
}

/**
 * **BEACON OF HOPE'S SPAN** (*Until the encounter ends*): core's `combatEnd` expiry in the Paladin's started
 * fight, and out of one ten rounds of the world's clock - a minute, D-778's reading of a turn-keyed span with
 * no fight to count it (`effects/durations.mjs#clockRounds`).
 *
 * @param {Actor} actor
 */
export function beaconOfHopeSpan(actor) {
  return untilEncounterEnd(actor) ?? clockRounds(L.BEACON_OF_HOPE.clockRounds);
}

/**
 * **AVENGING WRATH'S SPAN** (*Until the encounter ends*; the class talent audit's final review): Beacon of
 * Hope's reading - core's `combatEnd` expiry in the Paladin's started fight, and out of one ten rounds of the
 * world's clock (D-778), so a Use made between fights never lasts until the next fight ends.
 *
 * @param {Actor} actor
 */
export function avengingWrathSpan(actor) {
  return untilEncounterEnd(actor) ?? clockRounds(L.AVENGING_WRATH.clockRounds);
}

/**
 * **04's RIGHTEOUS FURY AT THE DAMAGE DOOR** (*Whenever a friendly target within 20 feet takes damage, gain 1
 * Zeal, to no more than your rank each round*): 1 Zeal where the round's ceiling still holds a mark.
 *
 * @param {Actor} ally  the Paladin
 * @returns {Promise<number>}
 */
export async function righteousFuryGain(ally) {
  const rank = ally?.talentRanks?.("Righteous Fury") ?? 0;
  if (rank < 1) return 0;
  return (await claimRoundCount(ally, L.RIGHTEOUS_FURY.identifier, rank)) ? L.RIGHTEOUS_FURY.zeal : 0;
}

/**
 * **04's MASTER OF THE LAND ON A SNARE ALREADY SPRUNG** (*Your Snare Entangles every creature that enters
 * its radius, not only the first*): each creature that enters after the first, once each, recorded on the
 * Snare's card (`snareCaught`) - the active GM's door, called by `triggerSnareRegion`.
 *
 * @returns {Promise<boolean>}
 */
export async function snareCatchAgain({ region, document, actor, message, inflict, live } = {}) {
  const regionFlags = region?.flags?.["azeroth-rpg"] ?? {};
  const setter = regionFlags.caster ? await fromUuid(regionFlags.caster) : null;
  if (!setter?.takenTalents) return false;
  const all = patchRowsOf(setter.takenTalents(), L.SNARES.feature).some(r => r.patch?.catches === "all");
  if (!all) return false;
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const caught = Array.isArray(flags.snareCaught) ? flags.snareCaught : [];
  if (flags.snareTrigger?.actorUuid === actor.uuid || caught.includes(actor.uuid)) return false;
  await message.update({ "flags.azeroth-rpg.snareCaught": [...caught, actor.uuid] });
  if (live && !live()) return false;
  await inflict({ victim: actor, id: "entangled", by: setter, name: document?.name ?? actor.name,
    marks: actor.statuses?.has("entangled") ? {} : { snare: { source: setter.uuid } } });
  return true;
}

/* -------------------------------------------- */
/*  The GM's side                                */
/* -------------------------------------------- */

/**
 * **THE GM'S HANDLER FOR A MARTIAL WRITE** on a creature the asker's client does not own, judged again here:
 *
 * - `mercy`: the asker owns the Paladin, who holds Mercy of Uther and the Lay on Hands named, which ends a
 *   condition; the condition is on the target; the Use's record on that item (`mercyUse`) names this request,
 *   this target and this condition, unclaimed, and the target is within touch - claimed, then ended;
 * - `shieldSlam`: the asker owns the warrior, who holds Shield Slam at rank 2; the card is the warrior's,
 *   a hit at SL 2 that rode Shield Slam, naming the target at that row, and no Sustain was ended off this
 *   row before (`shieldSlamEnded` on the card) - the Sustain is ended;
 * - `snare`: the asker owns the Ranger, and the Regions are that Ranger's Snares - they are deleted;
 * - `divineStorm`: the asker owns the Paladin; `divineStormRefusal` holds (this Paladin's Divine Storm card,
 *   a hit made from it, not healed for yet, an ally within 10 feet) - recorded, then healed by the tier;
 * - `twofold`: the asker owns the Paladin; `twofoldRefusal` holds (the Mending Word card this Paladin's,
 *   naming the one healed, not shared yet; an ally within 10 feet) - the card marked, then the share read off
 *   it (half its heal, never past half of Mending Word's largest heal) restored;
 * - `beaconHeld`: the asker owns the ALLY; the Beacon stands, has not held it, and holds it now - recorded.
 *
 * Throws with the reason, in words.
 */
export async function martialQueryHandler(data = {}, { user = null } = {}) {
  const writer = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
  if (!writer() || !user?.id) throw new Error(game.i18n.localize("AZEROTH.Martial.QueryAuthority"));
  // **BEACON OF HOPE'S RECORD** (the wave-2 fix run): asked by whoever writes the blow on the ally, so the asker
  // owns the ALLY; the Beacon stands, has not held this ally, and holds it now - its uuid written on the Beacon.
  if (data.act === "beaconHeld") {
    const paladin = data.byUuid ? await fromUuid(data.byUuid) : null;
    const ally = data.targetUuid ? await fromUuid(data.targetUuid) : null;
    if (ally?.documentName !== "Actor" || !ally.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: ally?.name ?? "" }));
    const effect = paladin?.documentName === "Actor" ? beaconEffectOf(paladin) : null;
    const flag = effect?.flags?.["azeroth-rpg"]?.[L.BEACON_OF_HOPE.flag] ?? null;
    const feet = paladin?.uuid === ally.uuid ? 0 : feetBetweenTokens(tokenOf(paladin), tokenOf(ally));
    if (!effect || L.beaconHeldBefore(flag, ally.uuid)
      || !L.beaconHolds({ standing: true, ally: allyOf(paladin, ally), feet, before: data.before, amount: data.amount })) return { ok: false };
    await effect.update({ [`flags.azeroth-rpg.${L.BEACON_OF_HOPE.flag}.held`]: [...(flag.held ?? []), ally.uuid] });
    return { ok: true };
  }
  const by = data.byUuid ? await fromUuid(data.byUuid) : null;
  if (by?.documentName !== "Actor" || !by.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: by?.name ?? "" }));
  if (data.act === "snare") {
    const scene = game.scenes?.get(data.sceneId) ?? null;
    const ids = (Array.isArray(data.ids) ? data.ids : []).filter(id => scene?.regions?.get(id)?.flags?.["azeroth-rpg"]?.caster === by.uuid
      && scene.regions.get(id).flags["azeroth-rpg"].featureKey === "snare");
    if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
    return { ended: ids.length };
  }
  const target = data.targetUuid ? await fromUuid(data.targetUuid) : null;
  if (target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (data.act === "divineStorm") {
    const card = data.cardId ? game.messages?.get(data.cardId) ?? null : null;
    const attack = data.attackId ? game.messages?.get(data.attackId) ?? null : null;
    return { healed: await divineStormHere({ by, card, attack, ally: target }) };
  }
  if (data.act === "twofold") {
    // The share is the Mending Word card's, judged, marked and read off the card - never the request's
    // (the class talent audit's final review).
    const healed = data.healedUuid ? await fromUuid(data.healedUuid) : null;
    const card = data.cardId ? game.messages?.get(data.cardId) ?? null : null;
    return { healed: await twofoldLand({ by, healed: healed?.documentName === "Actor" ? healed : null, ally: target, share: data.share, card }) };
  }
  if (data.act === "mercy") {
    const holds = (by.takenTalents?.() ?? []).some(t => t.identifier === L.MERCY_OF_UTHER.identifier);
    const feature = data.itemId ? (by.items?.get?.(data.itemId) ?? null) : null;
    if (!holds || feature?.type !== "feature" || feature.name !== L.MERCY_OF_UTHER.feature || !(whole(feature.system?.ends) > 0)) {
      throw new Error(game.i18n.format("AZEROTH.Martial.MercyNoTalent", { name: by.name }));
    }
    if (!AZEROTH.conditions?.[data.id] || !target.statuses?.has(data.id)) return { ok: false };
    // **BOUND TO ITS LAY ON HANDS, CLAIMED ONCE, BY TOUCH** (the class talent audit's final review): the Use's
    // record names this request, this target and this condition; the target is within 5 feet (02: *by touch*);
    // and the condition is claimed off the record before it is ended. Two requests for one condition in flight
    // on this client are one.
    const claimKey = `${feature.uuid}|${data.useId}|${data.id}`;
    if (MERCY_IN_FLIGHT.has(claimKey)) throw new Error(game.i18n.format("AZEROTH.Martial.MercyAgain", { name: target.name }));
    MERCY_IN_FLIGHT.add(claimKey);
    try {
      const record = feature.getFlag?.("azeroth-rpg", "mercyUse") ?? null;
      const refused = L.mercyUseRefusal({ record, useId: data.useId ?? null, targetUuid: target.uuid, id: data.id,
        feet: feetBetweenActors(by, target), touch: TOUCH_FEET });
      if (refused) throw new Error(game.i18n.format(refused, { name: target.name, feet: TOUCH_FEET }));
      await feature.setFlag("azeroth-rpg", "mercyUse", { ...record, claimed: [...(record.claimed ?? []), data.id] });
      await target.toggleStatusEffect(data.id, { active: false });
      return { ok: !target.statuses?.has(data.id) };
    } finally {
      MERCY_IN_FLIGHT.delete(claimKey);
    }
  }
  if (data.act === "shieldSlam") {
    const rank = (by.takenTalents?.() ?? []).find(t => t.identifier === L.SHIELD_SLAM.identifier)?.taken ?? 0;
    const message = data.messageId ? game.messages?.get(data.messageId) ?? null : null;
    const flags = message?.flags?.["azeroth-rpg"] ?? {};
    const row = flags.targets?.[Number(data.index)] ?? null;
    const roll = message?.rolls?.[0] ?? null;
    const sl = Math.trunc(Number(roll?.outcome?.sl)) || 0;
    const ok = whole(rank) >= L.SHIELD_SLAM.rank && message && ChatMessage.getSpeakerActor(message.speaker)?.uuid === by.uuid
      && flags.kind === "attack" && (flags.ridden ?? []).includes(L.SHIELD_SLAM.identifier) && roll?.outcome?.success === true
      && sl >= L.SHIELD_SLAM.sl && row && actorOfRow(row)?.uuid === target.uuid
      && !(flags.shieldSlamEnded ?? []).includes(Number(data.index));
    if (!ok) throw new Error(game.i18n.format("AZEROTH.Martial.ShieldSlamRefused", { name: target.name }));
    await message.update({ "flags.azeroth-rpg.shieldSlamEnded": [...(flags.shieldSlamEnded ?? []), Number(data.index)] });
    const { endSustain } = await import("../dice/workflows.mjs");
    const ended = await endSustain({ actor: target, cast: data.cast ?? null, spellId: data.spellId ?? null, uuid: data.uuid ?? null, notice: "AZEROTH.Martial.ShieldSlamNotice" });
    return { ok: Boolean(ended) };
  }
  throw new Error(game.i18n.localize("AZEROTH.Martial.QueryAuthority"));
}
