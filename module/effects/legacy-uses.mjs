/**
 * **WHAT THE LEGACY BRANCHES' B3 USES WRITE ON THE WORLD** (the Legacy branches' door
 * 25). `rules/legacy-uses.mjs`, `rules/spirit-realm.mjs` and `rules/death-holds.mjs`
 * are the law; this is the write, here where this client may make it and on the
 * active GM's client through `CONFIG.queries` where it may not (`LEGACY_USE_QUERY`,
 * never `game.socket`, D-643). The handler asks that the asker own the USER, that the
 * user hold the feature the request names and that its Use carry the mechanism, and
 * judges the creature again off the world as its own client holds it - never trusting
 * the request's word for a distance it can measure, a condition, a step or a pad.
 *
 * - `state`: a concealment (the Gnomish Cloaking Device on an ally) or an Ethereal Form
 *   (Kindred Spirits' friendly targets) laid on a creature the user does not own;
 * - `cure`: one condition ended on a creature (Voodoo Mending, the Recombobulator,
 *   Arclight Spanner), as A1 §2 ends one - every effect it rides on alone deleted, and
 *   one it shares with other statuses left carrying the rest;
 * - `revive`: Ancestral Spirit's return - half the maximum Health, the Death Steps
 *   cleared, standing, no Tether spent, and the once-in-a-life mark;
 * - `transport`: the Ultrasafe Transporter's carry, each token to the pad - displaced
 *   on its own scene, or made anew on the pad's scene and the old one taken up (made
 *   FIRST, D-745: a duplicate is curable and a loss is not);
 * - `drain`: Life Drain's Health back to a user this client may not write;
 * - `thrall`: Thrall of the Banshee's Charmed on a creature whose owner pressed the
 *   Resist and failed - asked by the TARGET's owner, held to the card's own record.
 *
 * And one door no query reaches: a construct's **Cutting Gear** (`useCuttingGear`, the
 * lead's ruling of 2026-10-22), always pressed by the construct's own owner.
 */

import { AZEROTH } from "../config.mjs";
import {
  CONCEAL_FLAG, PAD_FLAG, THRALL_FLAG, cleanPad, curableOn, namesCreature, onUseSpirits, thrallBond, thrallOf, thrallRefusal, transportRefusal
} from "../rules/legacy-uses.mjs";
import { ETHEREAL_FLAG, etherealAlliesFor } from "../rules/spirit-realm.mjs";
// Ancestor's Hand's *Every Dying friendly target* (the Legacy branches' B6).
import { dyingNow } from "./spirit-realm.mjs";
import { RETURNED_FLAG, THIRD_STEP_FLAG, cleanReturned, revivedHealth, reviveRefusal, sinceLastTurnEnd } from "../rules/death-holds.mjs";
import { CONDITION_REFUSALS } from "../rules/in-play.mjs";
import { HIDDEN_STATUS } from "../rules/stealth.mjs";
import { ringSpots } from "../rules/summon-places.mjs";
import { onUseOf, talentEffect } from "../rules/talent-effects.mjs";
import { gadgetByKey } from "../rules/gadgets.mjs";
import { abilityScope } from "../rules/expressions.mjs";
import { layState } from "./talent-states.mjs";
import { allyOf, feetBetweenTokens } from "../canvas/engaged.mjs";
import { bondOf, releaseThrallBond, worldActorOf, writeThrallBond } from "../documents/bound.mjs";
// A construct's Cutting Gear (the lead's ruling, 2026-10-22) and its once-a-turn mark.
import { CUTTING_GEAR, cuttingGearRefusal, holdsCuttingGear } from "../rules/escapes.mjs";
import { turnMark } from "../rules/class-answers.mjs";
import { minuteSpan } from "./durations.mjs";
import { refuseIceBlockTarget } from "./ice-block-protection.mjs";

/** The query a write on a creature this client does not own goes through. */
export const LEGACY_USE_QUERY = "azeroth-rpg.legacyUse";

/** The acts the handler takes. `lift` is Ancestor's Hand's (the Legacy branches' B6). */
export const LEGACY_USE_ACTS = Object.freeze(["state", "cure", "revive", "transport", "drain", "thrall", "lift"]);

/** A query's patience: the GM's client answers inside it (D-761's ten seconds, and some). */
const QUERY_MS = 15000;

/** An actor by uuid, quietly. */
function actorAt(uuid) {
  if (!uuid) return null;
  try {
    const doc = fromUuidSync(uuid);
    return doc?.documentName === "Actor" ? doc : null;
  } catch {
    return null;
  }
}

/** The active effects' `azeroth-rpg` flags on an actor, plain. */
export function activeFlagsOf(actor) {
  return (actor?.effects ?? []).filter(e => e.active !== false && e.disabled !== true).map(e => e.flags?.["azeroth-rpg"] ?? {});
}

/**
 * **WHAT A FEATURE'S USE DOES, AND AT WHAT RANK** - a gadget's off 04's table, a
 * talent's off its granting row - the reading `workflows.useFeature` makes, so the
 * GM's handler judges the same row the asker's Use read.
 *
 * @param {Actor} actor
 * @param {Item|null} item  the feature
 * @returns {{onUse: object|null, rank: number, talent: Item|null}}
 */
export function featureOnUse(actor, item) {
  if (!actor || item?.type !== "feature") return { onUse: null, rank: 1, talent: null };
  const flag = item.getFlag?.("azeroth-rpg", "feature") ?? item.flags?.["azeroth-rpg"]?.feature ?? {};
  if (flag.gadget) return { onUse: gadgetByKey(flag.gadget)?.onUse ?? null, rank: 1, talent: null };
  const talent = flag.talentId ? (actor.items?.get?.(flag.talentId) ?? null) : null;
  if (!talent) return { onUse: null, rank: 1, talent: null };
  const rank = talent.system?.taken ?? flag.rank ?? 1;
  return { onUse: onUseOf(talentEffect(talent.system?.className, talent.system?.identifier, talent.system?.race ?? null)), rank, talent };
}

/** The user's B3 uses at the rank, off the feature named. */
function usesOf(actor, item) {
  const { onUse, rank } = featureOnUse(actor, item);
  return onUseSpirits(onUse, { rank, tier: actor?.system?.tier ?? 1, scope: abilityScope(actor?.system ?? {}), conditions: Object.keys(AZEROTH.conditions ?? {}) });
}

/** A span as a query may carry it: a ready-made `{duration, start}` or none. */
function cleanSpan(span) {
  if (span && typeof span === "object" && span.duration && typeof span.duration === "object") {
    return { duration: { ...span.duration }, ...(span.start && typeof span.start === "object" ? { start: { ...span.start } } : {}) };
  }
  return null;
}

/** Ask the active GM, or say why not; the refusal travels back as a thrown message. */
async function viaGM(payload) {
  const gm = game.users?.activeGM ?? null;
  if (!gm) throw new Error(game.i18n.localize("AZEROTH.LegacyUse.NoGM"));
  return gm.query(LEGACY_USE_QUERY, payload, { timeout: QUERY_MS });
}

/* -------------------------------------------- */
/*  A state on another creature                  */
/* -------------------------------------------- */

/**
 * The effect data one state lays, by its kind.
 *
 * @param {"conceal"|"ethereal"} kind
 * @param {{source: string, by: string|null, ends?: string[], img?: string|null, span?: object|null}} o
 */
function stateData(kind, { source, by = null, ends = null, img = null, span = null } = {}) {
  if (kind === "waterBreathing") return {
    flag: "waterBreathing", data: { source, by }, img, span, name: source,
    description: `<p>${game.i18n.localize("AZEROTH.Gadget.RebreatherEffect")}</p>`,
    sameAs: raw => raw?.source === source
  };
  if (kind === "conceal") {
    return {
      flag: CONCEAL_FLAG, data: { source, by, ends: Array.isArray(ends) && ends.length ? [...ends] : ["attack", "cast"] }, statuses: [HIDDEN_STATUS], img, span,
      name: game.i18n.format("AZEROTH.Conceal.Name", { source }),
      description: `<p>${game.i18n.format("AZEROTH.Conceal.Text", { source })}</p>`,
      sameAs: raw => raw?.source === source
    };
  }
  return {
    flag: ETHEREAL_FLAG, data: { source, by }, img, span,
    name: game.i18n.format("AZEROTH.Ethereal.Name", { source }),
    description: `<p>${game.i18n.format("AZEROTH.Ethereal.Text", { source })}</p>`,
    sameAs: raw => raw?.source === source
  };
}

/**
 * **LAY A CONCEALMENT OR AN ETHEREAL FORM ON A CREATURE** - here where this client may
 * write it, else on the GM's client, judged there against the user's own feature.
 *
 * @param {{target: Actor, kind: "conceal"|"ethereal", by: Actor, item: Item, source: string, ends?: string[]|null,
 *   span?: object|null, feet?: number|null, img?: string|null}} o  `feet` the asker's own measure
 * @returns {Promise<{landed: boolean, name: string}>}
 */
export async function layStateOn({ target, kind, by, item, source, ends = null, span = null, feet = null, img = null }) {
  const name = target?.name ?? "";
  if (!target) return { landed: false, name };
  try {
    if (target.isOwner) {
      if (kind === "waterBreathing") return await stateHere({ by, item, target, kind, span, feet });
      const made = await layState(target, stateData(kind, { source, by: by?.uuid ?? null, ends, img, span }));
      return { landed: Boolean(made), name };
    }
    const done = await viaGM({ act: "state", kind, targetUuid: target.uuid, byUuid: by?.uuid ?? null, featureId: item?.id ?? null, span: cleanSpan(span), feet });
    return { landed: done?.landed === true, name: done?.name ?? name };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { landed: false, name };
  }
}

/** The GM-side judgement of a state laid on another creature, off the user's own feature. */
async function stateHere({ by, item, target, kind, span, feet }) {
  const uses = usesOf(by, item);
  const tokenBy = by.getActiveTokens?.(true)?.[0] ?? null;
  const tokenTarget = target.getActiveTokens?.(true)?.[0] ?? null;
  const measured = tokenBy && tokenTarget ? feetBetweenTokens(tokenBy, tokenTarget) : null;
  const apart = measured ?? (typeof feet === "number" ? feet : null);
  if (kind === "waterBreathing") {
    if (!uses.waterBreathing) throw new Error(game.i18n.format("AZEROTH.LegacyUse.NotHeld", { name: by.name, feature: item.name }));
    if (apart !== null && apart > 5) throw new Error(game.i18n.format("AZEROTH.Laid.TooFar", { name: item.name, target: target.name, feet: 5 }));
    const made = await layState(target, stateData(kind, { source: item.name, by: by.uuid, img: item.img, span: minuteSpan(target, uses.waterBreathing.minutes) }));
    return { landed: Boolean(made), name: target.name };
  }
  if (kind === "conceal") {
    if (!uses.conceal?.allies) throw new Error(game.i18n.format("AZEROTH.LegacyUse.NotHeld", { name: by.name, feature: item.name }));
    if (apart === null || apart > uses.conceal.feet) throw new Error(game.i18n.format("AZEROTH.Conceal.TooFar", { name: target.name, feet: uses.conceal.feet }));
    if (!allyOf(by, target)) throw new Error(game.i18n.format("AZEROTH.Conceal.NotAlly", { name: target.name }));
    const made = await layState(target, stateData("conceal", { source: item.name, by: by.uuid, ends: uses.conceal.ends, img: item.img, span }));
    return { landed: Boolean(made), name: target.name };
  }
  if (kind === "ethereal") {
    const allies = etherealAlliesFor(by.takenTalents?.() ?? [], talentEffect);
    if (!uses.ethereal || !allies) throw new Error(game.i18n.format("AZEROTH.LegacyUse.NotHeld", { name: by.name, feature: item.name }));
    if (apart === null || apart > allies.feet) throw new Error(game.i18n.format("AZEROTH.Ethereal.Refuse.TooFar", { name: target.name, feet: allies.feet, talent: allies.name }));
    if (!allyOf(by, target)) throw new Error(game.i18n.format("AZEROTH.Ethereal.Refuse.NotFriendly", { name: target.name, talent: allies.name }));
    const made = await layState(target, stateData("ethereal", { source: item.name, by: by.uuid, img: item.img, span }));
    return { landed: Boolean(made), name: target.name };
  }
  throw new Error(`legacyUse: no such state ${JSON.stringify(kind)}`);
}

/* -------------------------------------------- */
/*  One condition ended                          */
/* -------------------------------------------- */

/**
 * **WHICH CONDITIONS A CURE MAY END ON A CREATURE**, sorted: A1's it carries, but a
 * character's Fatigued (a track, ended by a rest - the sheet's own refusal,
 * `rules/in-play.mjs#CONDITION_REFUSALS`) and what the row excepts.
 *
 * @param {Actor} target
 * @param {{except?: string[]}} [cure]
 */
export function curableConditionsOn(target, cure = {}) {
  const refused = Object.keys(CONDITION_REFUSALS[target?.type ?? "character"] ?? {});
  return curableOn(target?.statuses ?? [], {
    conditions: Object.keys(AZEROTH.conditions ?? {}),
    except: [...refused, ...(cure?.except ?? [])], only: cure?.only ?? null
  });
}

/** End one condition here, as A1 §2 ends one. Answers whether anything carried it. */
async function cureHere(target, id) {
  const carriers = (target.effects ?? []).filter(e => e.statuses?.has?.(id));
  if (!carriers.length) return false;
  const alone = carriers.filter(e => (e.statuses?.size ?? 0) <= 1).map(e => e.id);
  const shared = carriers.filter(e => (e.statuses?.size ?? 0) > 1);
  if (alone.length) await target.deleteEmbeddedDocuments("ActiveEffect", alone);
  for (const e of shared) if (target.effects.has(e.id)) await e.update({ statuses: [...e.statuses].filter(s => s !== id) });
  return true;
}

/**
 * **END ONE CONDITION ON A CREATURE** (Voodoo Mending, the Recombobulator, Arclight
 * Spanner), here or on the GM's client.
 *
 * @param {{target: Actor, id: string, by: Actor, item: Item}} o
 * @returns {Promise<{ended: boolean, name: string, id: string}>}
 */
export async function cureCondition({ target, id, by, item }) {
  const name = target?.name ?? "";
  if (!target || !AZEROTH.conditions?.[id]) return { ended: false, name, id };
  try {
    if (target.isOwner) return { ended: await cureHere(target, id), name, id };
    const done = await viaGM({ act: "cure", targetUuid: target.uuid, byUuid: by?.uuid ?? null, featureId: item?.id ?? null, id });
    return { ended: done?.ended === true, name: done?.name ?? name, id };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { ended: false, name, id };
  }
}

/* -------------------------------------------- */
/*  Ancestral Spirit's return                    */
/* -------------------------------------------- */

/**
 * **WHAT ANCESTRAL SPIRIT'S JUDGEMENT READS OFF A CREATURE AND THE USER**, now.
 *
 * @param {Actor} user
 * @param {Actor} target  the world actor of the creature named
 * @param {{distance?: number|null, feet?: number}} [o]
 */
export function reviveFacts(user, target, { distance = null, feet = 30 } = {}) {
  const fight = user?.activeFight?.() ?? null;
  const mine = fight?.getCombatantsByActor?.(user)?.[0] ?? null;
  const own = mine ? (fight.turns ?? []).findIndex(c => c.id === mine.id) : -1;
  const recent = sinceLastTurnEnd(target?.getFlag?.("azeroth-rpg", THIRD_STEP_FLAG) ?? null, {
    combatId: fight?.id ?? null, round: fight?.round ?? null, turn: fight?.turn ?? null, own: own >= 0 ? own : null,
    time: game.time?.worldTime ?? 0
  });
  return {
    named: 1, character: target?.type === "character", distance, feet,
    steps: target?.system?.deathSteps ?? 0, max: target?.system?.deathStepLimit ?? AZEROTH.DEATH_STEPS, recent,
    tether: target?.system?.spiritTether?.value ?? 0,
    returned: Boolean(cleanReturned(target?.getFlag?.("azeroth-rpg", RETURNED_FLAG) ?? null))
  };
}

/**
 * The return, written: Health, the steps, standing, the mark - and **the defeat taken
 * off** (the B3 review): a GM who marked the fallen creature defeated left it so, its
 * `dead` status standing and its combatant skipped, though it stood. Written on the
 * creature the Dying track wrote its steps on - the token's own actor for an unlinked
 * one (`AzerothActor#takeDeathStep` runs on it) - never its world actor.
 */
async function reviveHere(target, by) {
  const health = revivedHealth(target.system?.health?.max ?? 1);
  await target.update({
    "system.health.value": health, "system.deathSteps": 0,
    [`flags.azeroth-rpg.${RETURNED_FLAG}`]: { by: by?.uuid ?? "", at: game.time?.worldTime ?? 0 },
    [`flags.azeroth-rpg.${THIRD_STEP_FLAG}`]: null
  });
  if (target.getFlag?.("azeroth-rpg", "stabilized")) await target.unsetFlag("azeroth-rpg", "stabilized");
  // *stands*: up from Prone, for nothing - it is the return, not a stand (05).
  if (target.statuses?.has?.("prone")) await target.toggleStatusEffect("prone", { active: false, free: true });
  const defeated = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  if (target.statuses?.has?.(defeated)) await target.toggleStatusEffect(defeated, { active: false });
  const tokenIds = new Set((target.isToken ? [target.token] : (target.getDependentTokens?.() ?? [])).filter(Boolean).map(t => t.id));
  for (const fight of game.combats ?? []) {
    for (const c of fight.combatants ?? []) {
      if (c.defeated === true && c.isOwner && (tokenIds.has(c.tokenId) || (!c.tokenId && c.actorId === target.id))) await c.update({ defeated: false });
    }
  }
  return health;
}

/**
 * **CALL A CREATURE BACK** (04's Ancestral Spirit), here or on the GM's client - judged
 * there again off the creature as it stands. The creature is the one the Dying track
 * wrote on (the B3 review: this read and wrote the WORLD actor while `takeDeathStep`
 * wrote an unlinked token's own, so the third step was never found and a revived
 * character stood with its steps).
 *
 * @param {{target: Actor, by: Actor, item: Item, distance?: number|null}} o
 * @returns {Promise<{risen: boolean, name: string, health: number}>}
 */
export async function reviveCreature({ target, by, item, distance = null }) {
  const name = target?.name ?? "";
  if (!target) return { risen: false, name, health: 0 };
  try {
    if (target.isOwner) return { risen: true, name, health: await reviveHere(target, by) };
    const done = await viaGM({ act: "revive", targetUuid: target.uuid, byUuid: by?.uuid ?? null, featureId: item?.id ?? null, distance });
    return { risen: done?.risen === true, name: done?.name ?? name, health: Number(done?.health) || 0 };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { risen: false, name, health: 0 };
  }
}

/* -------------------------------------------- */
/*  Ancestor's Hand's Dying friends              */
/* -------------------------------------------- */

/**
 * One Dying friend lifted here: its Health through the one healing door - which clears
 * the Death Steps a heal from 0 clears (`AzerothActor#standUp`, D-629) - and up from
 * Prone for nothing, as Ancestral Spirit's return stands one (*and stands*; it is the
 * Use's, not a Stand). A creature no longer Dying is left alone.
 */
async function liftHere(target, by, amount, item) {
  if (!dyingNow(target)) return { lifted: false, name: target.name, health: target.system?.health?.value ?? 0 };
  await target.applyHealing(Math.max(0, Math.trunc(Number(amount)) || 0), { from: by, feature: true, featureName: item?.name ?? null });
  if (target.statuses?.has?.("prone")) await target.toggleStatusEffect("prone", { active: false, free: true });
  return { lifted: true, name: target.name, health: target.system?.health?.value ?? 0 };
}

/**
 * **LIFT A DYING FRIEND** (04's Ancestor's Hand: *Every Dying friendly target within 30
 * feet restores Health equal to your tier per rank and stands*; the Legacy branches' B6),
 * here where this client may write it, else on the GM's client - where the Health is
 * worked out again off the user's own row and the creature judged again: still Dying, an
 * ally, and within the feet.
 *
 * @param {{target: Actor, by: Actor, item: Item, feet?: number|null}} o  `feet` the asker's own measure
 * @returns {Promise<{lifted: boolean, name: string, health: number}>}
 */
export async function liftDying({ target, by, item, feet = null }) {
  const name = target?.name ?? "";
  if (!target || !by) return { lifted: false, name, health: 0 };
  try {
    if (target.isOwner) return await liftHere(target, by, usesOf(by, item).lift?.amount ?? 0, item);
    const done = await viaGM({ act: "lift", targetUuid: target.uuid, byUuid: by.uuid, featureId: item?.id ?? null, feet });
    return { lifted: done?.lifted === true, name: done?.name ?? name, health: Number(done?.health) || 0 };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { lifted: false, name, health: 0 };
  }
}

/* -------------------------------------------- */
/*  The transporter's carry                      */
/* -------------------------------------------- */

/**
 * Where each traveller lands on the pad's scene: the user on the pad's own square,
 * the rest rung round it (door 4's one ring).
 */
function padSpots(scene, pad, docs) {
  const cell = { w: scene.grid?.sizeX ?? scene.grid?.size ?? 100, h: scene.grid?.sizeY ?? scene.grid?.size ?? 100 };
  const origin = { x: pad.x - cell.w / 2, y: pad.y - cell.h / 2 };
  let snapped = origin;
  try {
    snapped = scene.grid.getSnappedPoint(origin, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER });
  } catch {
    snapped = origin;
  }
  const moving = new Set(docs.map(d => d.id));
  const standing = (scene.tokens ?? []).filter(t => !moving.has(t.id)).map(t => ({ x: t.x, y: t.y, width: (t.width ?? 1) * cell.w, height: (t.height ?? 1) * cell.h }));
  const size = { width: cell.w, height: cell.h };
  return ringSpots({ origin: snapped, count: docs.length, cell, size, standing, board: scene.dimensions?.rect ?? null, includeOrigin: true });
}

/**
 * **WHETHER A TOKEN FIGHTS NOW** (the B3 review): a combatant of it in a started fight,
 * whichever fight is viewed - the transporter's carry to another scene makes the token
 * anew and deletes the old one, which orphans that combatant.
 *
 * @param {TokenDocument} doc
 * @returns {boolean}
 */
export function tokenFightsNow(doc) {
  if (!doc?.id) return false;
  return (game.combats ?? []).some(c => c.started && (c.combatants ?? []).some(cb => cb.tokenId === doc.id && (!cb.sceneId || cb.sceneId === doc.parent?.id)));
}

/** Carry these tokens to the pad here, on the GM's client or this one where it may write all. */
async function transportHere(docs, pad) {
  const scene = game.scenes?.get(pad.sceneId) ?? null;
  if (!scene) throw new Error(game.i18n.localize("AZEROTH.Transporter.Refuse.PadGone"));
  const spots = padSpots(scene, pad, docs);
  const out = [];
  for (const [i, doc] of docs.entries()) {
    const spot = spots[i] ?? spots[0] ?? { x: pad.x, y: pad.y };
    const name = doc.name ?? doc.actor?.name ?? "";
    if (refuseIceBlockTarget(doc.actor)) {
      out.push({ name, moved: false, scene: scene.name, actorUuid: doc.actor?.uuid ?? null });
      continue;
    }
    if (doc.parent?.id === scene.id) {
      const moved = await doc.move({ x: Math.round(spot.x), y: Math.round(spot.y), action: "displace" });
      out.push({ name, moved: moved !== false, scene: scene.name, actorUuid: doc.actor?.uuid ?? null });
      continue;
    }
    // Made FIRST on the pad's scene, the old one taken up after (D-745).
    const data = doc.toObject();
    delete data._id;
    const [made] = await scene.createEmbeddedDocuments("Token", [{ ...data, x: Math.round(spot.x), y: Math.round(spot.y) }]);
    if (made) await doc.parent.deleteEmbeddedDocuments("Token", [doc.id]);
    out.push({ name, moved: Boolean(made), scene: scene.name, actorUuid: (made?.actor ?? doc.actor)?.uuid ?? null });
  }
  return out;
}

/**
 * **CARRY THE TRAVELLERS TO THE PAD** (04's Ultrasafe Transporter): every token here
 * where this client may write them all and the pad's scene, else through the GM.
 *
 * @param {{by: Actor, item: Item, docs: TokenDocument[], pad: object}} o
 * @returns {Promise<Array<{name: string, moved: boolean, scene: string, actorUuid: string|null}>>}
 */
export async function transportTo({ by, item, docs = [], pad }) {
  const clean = cleanPad(pad);
  if (!clean || !docs.length) return [];
  try {
    const mayHere = game.user?.isGM === true || (docs.every(d => d.isOwner) && docs.every(d => d.parent?.id === clean.sceneId));
    if (mayHere) return await transportHere(docs, clean);
    const done = await viaGM({ act: "transport", byUuid: by?.uuid ?? null, featureId: item?.id ?? null, tokens: docs.map(d => d.uuid) });
    return Array.isArray(done?.moved) ? done.moved : [];
  } catch (err) {
    ui.notifications?.warn(err.message);
    return [];
  }
}

/* -------------------------------------------- */
/*  Life Drain's Health back                     */
/* -------------------------------------------- */

/**
 * **THE HEALTH A DRAIN GIVES ITS USER** (04's Life Drain: *You recover Health equal to
 * the damage it takes*), here where this client may write the user, else through the
 * GM - who reads the card the blow came from and holds the amount to that card's own
 * number for the creature struck.
 *
 * @param {{healer: Actor, amount: number, messageId?: string|null, index?: number|null, name?: string}} o
 * @returns {Promise<number>}  the Health that landed
 */
export async function drainHeal({ healer, amount = 0, messageId = null, index = null, name = "" }) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!healer || !(n > 0)) return 0;
  try {
    if (healer.isOwner) {
      const before = healer.system?.health?.value ?? 0;
      await healer.applyHealing(n, { from: healer, feature: true, featureName: name || null });
      return Math.max(0, (healer.system?.health?.value ?? before) - before);
    }
    const done = await viaGM({ act: "drain", byUuid: healer.uuid, messageId, index, amount: n });
    return Number(done?.healed) || 0;
  } catch (err) {
    ui.notifications?.warn(err.message);
    return 0;
  }
}

/* -------------------------------------------- */
/*  The GM-side handler                          */
/* -------------------------------------------- */

/**
 * The GM-side handler (`LEGACY_USE_QUERY`). Throws with the reason, which travels back
 * to the caller as the refusal.
 */
export async function legacyUseQueryHandler(payload = {}, { user = null } = {}) {
  // A thrall is asked for by the creature that FAILED (its owner pressed the Resist), so
  // the asker owns the target, never the Banshee's caller.
  if (payload.act === "thrall") return thrallHere(payload, user);
  const by = payload.byUuid ? await fromUuid(payload.byUuid) : null;
  if (by?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
  if (user && !by.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: by.name }));
  if (payload.act === "drain") {
    const card = payload.messageId ? (game.messages?.get(payload.messageId) ?? null) : null;
    const flags = card?.flags?.["azeroth-rpg"] ?? {};
    if (flags.healsDealt?.by !== by.uuid) throw new Error(game.i18n.format("AZEROTH.LegacyUse.NotHeld", { name: by.name, feature: flags.healsDealt?.name ?? "" }));
    const row = Number.isInteger(payload.index) ? (flags.damageByTarget?.[payload.index] ?? null) : null;
    const cap = Math.max(0, Math.trunc(Number(row?.damage)) || 0);
    const n = Math.min(cap, Math.max(0, Math.trunc(Number(payload.amount)) || 0));
    const before = by.system?.health?.value ?? 0;
    if (n > 0) await by.applyHealing(n, { from: by, feature: true });
    return { healed: Math.max(0, (by.system?.health?.value ?? before) - before) };
  }
  const item = payload.featureId ? (by.items?.get?.(payload.featureId) ?? null) : null;
  if (item?.type !== "feature") throw new Error(game.i18n.format("AZEROTH.LegacyUse.NotHeld", { name: by.name, feature: "" }));
  if (payload.act === "transport") {
    const uses = usesOf(by, item);
    const pad = cleanPad(by.getFlag?.("azeroth-rpg", PAD_FLAG) ?? null);
    if (!uses.transporter || !pad) throw new Error(game.i18n.localize("AZEROTH.Transporter.Refuse.NoPad"));
    const docs = [];
    for (const uuid of Array.isArray(payload.tokens) ? payload.tokens : []) {
      const doc = typeof uuid === "string" ? await fromUuid(uuid) : null;
      if (doc?.documentName === "Token") docs.push(doc);
    }
    const userDoc = docs.find(d => d.actor && worldActorOf(d.actor)?.uuid === worldActorOf(by)?.uuid) ?? null;
    if (!userDoc) throw new Error(game.i18n.localize("AZEROTH.Transporter.Refuse.NoToken"));
    if (docs.length - 1 > uses.transporter.count) throw new Error(game.i18n.format("AZEROTH.Transporter.Refuse.TooMany", { name: item.name, n: uses.transporter.count }));
    // Judged again here (the B3 review): a pad on another scene while a traveller fights.
    const across = transportRefusal("travel", {
      pad, padScene: Boolean(game.scenes?.get(pad.sceneId)), token: true,
      inFight: docs.some(d => tokenFightsNow(d)), padHere: userDoc.parent?.id === pad.sceneId
    });
    if (across) throw new Error(game.i18n.format(across, { name: item.name, n: uses.transporter.count, feet: uses.transporter.feet }));
    for (const d of docs) {
      if (d === userDoc) continue;
      const apart = d.object && userDoc.object ? feetBetweenTokens(userDoc.object, d.object) : null;
      if (d.parent?.id !== userDoc.parent?.id || (apart !== null && apart > uses.transporter.feet)) {
        throw new Error(game.i18n.format("AZEROTH.Transporter.Refuse.TooFar", { name: d.name ?? "", feet: uses.transporter.feet }));
      }
      if (d.actor && !allyOf(by, d.actor)) throw new Error(game.i18n.format("AZEROTH.Transporter.Refuse.NotWilling", { name: d.name ?? "" }));
    }
    return { moved: await transportHere(docs, pad) };
  }
  // The creature on the board - an unlinked token's own actor - for a state, a condition
  // and a return alike: the Dying track writes its steps there (the B3 review).
  const target = payload.targetUuid ? await fromUuid(payload.targetUuid) : null;
  if (target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (payload.act === "state") return stateHere({ by, item, target, kind: payload.kind, span: cleanSpan(payload.span), feet: typeof payload.feet === "number" ? payload.feet : null });
  if (payload.act === "cure") {
    const uses = usesOf(by, item);
    if (!uses.cures) throw new Error(game.i18n.format("AZEROTH.LegacyUse.NotHeld", { name: by.name, feature: item.name }));
    if (!curableConditionsOn(target, uses.cures).includes(payload.id)) throw new Error(game.i18n.format("AZEROTH.Cure.NotOn", { name: target.name, condition: game.i18n.localize(AZEROTH.conditions?.[payload.id] ?? String(payload.id ?? "")) }));
    return { ended: await cureHere(target, payload.id), name: target.name };
  }
  if (payload.act === "lift") {
    // Ancestor's Hand (B6), judged again here off the user's own row: still Dying, an
    // ally of the user, and within its feet - measured here where both tokens stand.
    const uses = usesOf(by, item);
    if (!uses.lift) throw new Error(game.i18n.format("AZEROTH.LegacyUse.NotHeld", { name: by.name, feature: item.name }));
    if (!dyingNow(target)) throw new Error(game.i18n.format("AZEROTH.Lift.NotDying", { name: target.name }));
    if (!allyOf(by, target)) throw new Error(game.i18n.format("AZEROTH.Lift.NotFriendly", { name: target.name }));
    const tokenBy = by.getActiveTokens?.(true)?.[0] ?? null;
    const tokenTarget = target.getActiveTokens?.(true)?.[0] ?? null;
    const measured = tokenBy && tokenTarget ? feetBetweenTokens(tokenBy, tokenTarget) : null;
    const apart = measured ?? (typeof payload.feet === "number" ? payload.feet : null);
    if (apart === null || apart > uses.lift.feet) throw new Error(game.i18n.format("AZEROTH.Lift.TooFar", { name: target.name, feet: uses.lift.feet }));
    return liftHere(target, by, uses.lift.amount, item);
  }
  if (payload.act === "revive") {
    const uses = usesOf(by, item);
    if (!uses.revive) throw new Error(game.i18n.format("AZEROTH.LegacyUse.NotHeld", { name: by.name, feature: item.name }));
    const refused = reviveRefusal(reviveFacts(by, target, { distance: typeof payload.distance === "number" ? payload.distance : null, feet: uses.revive.feet }));
    if (refused) throw new Error(game.i18n.format(refused, { name: item.name, target: target.name, feet: uses.revive.feet }));
    return { risen: true, name: target.name, health: await reviveHere(target, by) };
  }
  throw new Error(`legacyUse: no such act ${JSON.stringify(payload.act ?? null)}`);
}

/* -------------------------------------------- */
/*  A thrall's release                           */
/* -------------------------------------------- */

/**
 * **A THRALL IS RELEASED WHEN ITS CHARMED ENDS** (04's Thrall of the Banshee: *Charmed
 * by you for one minute*): whatever ends the effect - core's expiry at the minute, a
 * cure, a Dispel, a hand - releases the bond the thrall took through D-643's door
 * (`documents/bound.mjs#releaseThrallBond`): its token's side back, the bond off. On the
 * active GM's client, which owns the creature; the GM's own Release on the banner runs
 * the same door and ends the Charmed with it, and this then finds no bond.
 */
export function registerLegacyUseHooks() {
  Hooks.on("deleteActiveEffect", effect => {
    if (!game.users?.activeGM?.isSelf) return;
    const actor = effect?.parent;
    if (!thrallOf([effect?.flags?.["azeroth-rpg"] ?? {}]) || actor?.documentName !== "Actor") return;
    // A release that fails is said to the GM in words, who may release it from the
    // banner, and warned of - never logged as an error (CLAUDE.md §16).
    releaseThrall(actor).catch(err => {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Thrall.ReleaseFailed", { name: actor.name }));
      console.warn("azeroth-rpg | a thrall's release", err);
    });
  });
}

/**
 * **WHAT A THRALL TAKES** (04's Thrall of the Banshee; the lead, 2026-10-22: *"Have the
 * creature stat block for the token set to bound to the player by GM who can then
 * remove it"*). ON THE GM'S CLIENT ALONE (the bond is written by the GM), judged again
 * here (`thrallRefusal`: never a character, never a Boss, never a creature bound
 * already - the first bond would be lost), then three writes on ONE creature, never the
 * world actor's other tokens:
 *
 * 1. Charmed, spanned to the minute, carrying `THRALL_FLAG` - the effect whose end
 *    releases the thrall;
 * 2. D-643's bond on the token's own actor (`rules/legacy-uses.mjs#thrallBond`,
 *    `documents/bound.mjs#writeThrallBond`) - the stat block's *Bound to*, the
 *    tracker's Initiative and side, and the GM's Release on the banner - carrying the
 *    token's own side to put back; **no ownership is granted** (the GM runs the thrall
 *    on the owner's spoken commands);
 * 3. the token's side turned to the owner's (the owner's token's, else a character's
 *    FRIENDLY), which the tracker's side reads.
 *
 * @param {{target: Actor, owner: Actor, source: string, span?: object|null, token?: TokenDocument|null}} o
 *   `token` the creature's token the card named, where the card named one
 * @returns {Promise<{effect: ActiveEffect|null, refused: string|null}>}
 */
export async function bindThrall({ target, owner, source, span = null, token = null }) {
  if (!target || !owner || !game.user?.isGM) return { effect: null, refused: "AZEROTH.LegacyUse.NoGM" };
  const refused = thrallRefusal({
    named: 1, self: target.uuid === owner.uuid, character: target.type === "character",
    boss: target.system?.isBoss === true, bound: Boolean(bondOf(target))
  });
  if (refused) return { effect: null, refused };
  const doc = token?.documentName === "Token" ? token
    : (target.isToken ? target.token : (target.getActiveTokens?.(false, true)?.[0] ?? target.getDependentTokens?.({ linked: true })?.[0] ?? null));
  if (!target.statuses?.has?.("charmed")) await target.toggleStatusEffect("charmed", { active: true });
  const effect = target.effects.find(e => e.statuses?.has?.("charmed")) ?? null;
  if (!effect) return { effect: null, refused: null };
  await effect.update({
    ...(span ?? {}),
    [`flags.azeroth-rpg.${THRALL_FLAG}`]: { ownerUuid: owner.uuid, ownerName: owner.name, source }
  });
  await writeThrallBond(target, thrallBond({
    ownerUuid: owner.uuid, ownerName: owner.name, source, name: target.name,
    disposition: doc?.disposition ?? null, tokenUuid: doc?.uuid ?? null, since: Date.now()
  }));
  const ownerToken = owner.getActiveTokens?.(false, true)?.[0] ?? null;
  const side = Number.isInteger(ownerToken?.disposition) ? ownerToken.disposition
    : (owner.type === "character" ? CONST.TOKEN_DISPOSITIONS.FRIENDLY : CONST.TOKEN_DISPOSITIONS.HOSTILE);
  if (doc && doc.disposition !== side) await doc.update({ disposition: side });
  return { effect, refused: null };
}

/** The token a card's record names, on its own scene, or null. */
function recordedToken(rec) {
  const scene = rec?.sceneId ? (game.scenes?.get(rec.sceneId) ?? null) : null;
  return rec?.tokenId ? (scene?.tokens?.get(rec.tokenId) ?? null) : null;
}

/**
 * **A THRALL, BOUND ON THE RESIST'S FAILURE** (04's Thrall of the Banshee: *makes a
 * Spirit Resilience Test against your Spell DC or is **Charmed** by you for one minute,
 * obeys your spoken commands and acts on your Initiative*): the card the Use posted
 * names its owner, its minutes and **the creature the Use named** (`flags.azeroth-rpg
 * .thrall.target`; the B3 review: the card's Resist named nobody, so any token the
 * presser held was bound - a Boss included). Only that creature's failure binds, held
 * to the card's record here and again on the GM's client; the bind is the GM's
 * (`bindThrall`) - here where this client is a GM, else through `LEGACY_USE_QUERY`.
 *
 * @param {{target: Actor, message: ChatMessage}} o
 * @returns {Promise<{bound: boolean, name: string, refused?: string|null}>}
 */
export async function thrallOn({ target, message }) {
  const name = target?.name ?? "";
  const rec = message?.flags?.["azeroth-rpg"]?.thrall ?? null;
  if (!target || !rec?.by) return { bound: false, name };
  if (!namesCreature(rec.target ?? null, target.uuid)) return { bound: false, name, refused: "AZEROTH.Thrall.NotNamed" };
  try {
    if (game.user?.isGM) {
      const owner = actorAt(rec.by);
      if (!owner) return { bound: false, name, refused: "AZEROTH.Card.ActorGone" };
      const done = await bindThrall({ target, owner, source: rec.source ?? "", span: minuteSpan(target, rec.minutes ?? 1), token: recordedToken(rec.target) });
      return { bound: Boolean(done.effect), name, refused: done.refused };
    }
    const done = await viaGM({ act: "thrall", targetUuid: target.uuid, messageId: message.id });
    return { bound: done?.bound === true, name: done?.name ?? name, refused: done?.refused ?? null };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { bound: false, name };
  }
}

/**
 * The GM-side thrall: the asker owns the creature that failed, the card names the owner,
 * and the creature is the one the card named - judged here, off the card, never the
 * request's word.
 */
async function thrallHere(payload, user) {
  const target = payload.targetUuid ? await fromUuid(payload.targetUuid) : null;
  if (target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !target.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: target.name }));
  const card = payload.messageId ? (game.messages?.get(payload.messageId) ?? null) : null;
  const rec = card?.flags?.["azeroth-rpg"]?.thrall ?? null;
  const owner = rec?.by ? actorAt(rec.by) : null;
  if (!owner) throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
  if (!namesCreature(rec.target ?? null, target.uuid)) throw new Error(game.i18n.format("AZEROTH.Thrall.NotNamed", { name: rec.source ?? "", target: target.name }));
  const done = await bindThrall({ target, owner, source: rec.source ?? "", span: minuteSpan(target, rec.minutes ?? 1), token: recordedToken(rec.target) });
  return { bound: Boolean(done.effect), name: target.name, refused: done.refused };
}

/* -------------------------------------------- */
/*  A construct's Cutting Gear                   */
/* -------------------------------------------- */

/**
 * **CUTTING GEAR** (the lead, 2026-10-22: *"Give constructs a trait or ability that
 * allows them to end one Entangled condition per turn no action required."*; 14 §13's
 * Tinker constructs: *Once each turn, the construct ends one **Entangled** condition on
 * itself. This takes no action.*). Read by the ability's NAME (`rules/escapes.mjs
 * #holdsCuttingGear`), so a GM's own construct carrying it frees itself too.
 *
 * Judged before anything is written (`cuttingGearRefusal`): the ability held, an
 * Entangled to end, and - in a started fight - this turn's mark left on the creature's
 * own round's record (`identifier@<turn>`, `rules/class-answers.mjs#turnMark`). The mark
 * is written FIRST, through the combatant's queued door (D-761), so a press another
 * client marked first ends nothing; then ONE Entangled is ended as A1 §2 ends a
 * condition - its effect deleted, or the status taken off an effect it shares - with
 * its escape record (07's Test) going with it. No action, no budget, and out of a
 * fight no mark: there is no turn to count.
 *
 * @param {Actor} actor
 * @param {{effectId?: string|null}} [o]  the Entangled a prompt named, where it named one
 * @returns {Promise<{ended: boolean, name: string}|null>}
 */
export async function useCuttingGear(actor, { effectId = null } = {}) {
  if (!actor) return null;
  const condition = game.i18n.localize(AZEROTH.conditions?.[CUTTING_GEAR.condition] ?? CUTTING_GEAR.condition);
  if (!actor.isOwner) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: actor.name }));
    return null;
  }
  const holds = holdsCuttingGear(actor.system?.creatureAbilities ?? []);
  const entangled = (actor.effects ?? []).filter(e => e.active !== false && e.disabled !== true && e.statuses?.has?.(CUTTING_GEAR.condition));
  const fight = actor.activeFight?.() ?? null;
  const mine = fight?.started ? (fight.getCombatantsByActor?.(actor)?.[0] ?? null) : null;
  const record = mine?.getFlag?.("azeroth-rpg", "round") ?? {};
  const used = mine && record.number === fight.round ? (record.once ?? []) : [];
  const mark = mine ? turnMark(CUTTING_GEAR.mark, fight.turn, used) : null;
  const refused = cuttingGearRefusal({ holds, entangled: entangled.length > 0, used: Boolean(mine) && !mark });
  if (refused) {
    ui.notifications?.warn(game.i18n.format(refused, { name: actor.name, condition }));
    return null;
  }
  if (mine) {
    const marked = await mine.markRoundOnce(mark);
    if (marked?.added !== true) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.CuttingGear.Spent", { name: actor.name, condition }));
      return null;
    }
  }
  const effect = entangled.find(e => e.id === effectId) ?? entangled[0];
  if ((effect.statuses?.size ?? 0) <= 1) await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
  else await effect.update({ statuses: [...effect.statuses].filter(s => s !== CUTTING_GEAR.condition) });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.CuttingGear.Cut", { name: actor.name, condition })}</p>`,
    flags: { "azeroth-rpg": { kind: "cuttingGear" } }
  });
  return { ended: true, name: actor.name };
}

/**
 * A released thrall's Charmed has ended: the bond's own release (`documents/bound.mjs
 * #releaseThrallBond`) puts its token's side back and takes the bond off. Nothing else
 * was taken - no ownership is granted (the lead's ruling of 2026-10-22).
 */
async function releaseThrall(actor) {
  return releaseThrallBond(actor, { endCharmed: false });
}
