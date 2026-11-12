/**
 * **THE GUARDIAN OF TIME'S DOORS AND WRITES** (04's third Chronomancer branch, the tank; stage
 * 2c). `rules/guardian.mjs` and `rules/echoes.mjs` are the law; this module is where their
 * judgements become writes, each on the client that may make them - here where this client
 * owns the creature, on the active GM's through `GUARDIAN_QUERY` where it does not.
 *
 * - **The Block** (`guardianOnBlock`, from `applications/actions.mjs#blockNow`): Turned Aside's
 *   Sand and Grinding Block's Spirit Test, a row on the Block's own card for the attacker's
 *   owner, its failure landing Slowed (`grindAfterResist`, from `dice/chat.mjs#rollResists`).
 * - **The miss** (`turnedAsideOnMiss`, the active GM's `createChatMessage`): Turned Aside's
 *   rank 2 Sand when an attack against the Guardian misses.
 * - **The put-off damage** (`borrowedCard`, `borrowedHourHold`, `commitBorrowedHour`, from
 *   `AzerothActor#applyDamage` and `#_holdAtOne`): Borrowed Time's card, Borrowed Hour's hold
 *   at 1 and the rest of its blow on the put-off list (D-866's carrier), written once the
 *   blow can no longer be refused; and Unmade Wound asked at the start of the Guardian's turn
 *   before that list lands (`unmadeAtTurnStart`, from `effects/deferred-damage.mjs`; D-880).
 * - **The swap** (`swapPlaces`, from `effects/blow-doors.mjs#moveHere`): Interposed Moment's
 *   two displacements.
 * - **The Uses** (`judgeGuardianUse`, `landGuardianUse`, from `effects/chronomancer.mjs`'s Use
 *   doors): Unmade Wound's erasing, Timeless Sentinel's effect, and Borrowed Time's word that
 *   it is asked in the blow.
 *
 * Time-Lock is Taunt's laid Bane through `useFeature` (its row's `laysBane`), Bronzed Steel the
 * Access rows (`armorAccessFor`), Echo of the Blade the roll door (`actions.mjs#echoChain`),
 * Weathered by Ages a passive, and Distortion Field `canvas/distortion-field.mjs`.
 */

import { AZEROTH } from "../config.mjs";
import { talentEffect } from "../rules/talent-effects.mjs";
import {
  BORROWED_HOUR, BORROWED_TIME, DEFERRED_FLAG, SENTINEL_FLAG, borrowedHourCatch, borrowedRow, grindingBlockOf, guardianRow,
  interposedFor, turnedAsideGain, unmadeErase, unmadeTurnStart, unmadeWoundOf
} from "../rules/guardian.mjs";
import { atRankRow } from "../rules/chronomancer.mjs";
import { gainSand } from "../rules/sand.mjs";
import { answerInTime, answerWindow } from "../rules/chromatic-talents.mjs";
import { ASK_MS, answererOf, confirmHere } from "./blow-doors.mjs";
import { stepRecord } from "../rules/animation-records.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
import { inflictCondition } from "./inflict.mjs";

/** The query a write on a creature this client does not own goes through. */
export const GUARDIAN_QUERY = "azeroth-rpg.guardian";

/* -------------------------------------------- */
/*  Small readers                                */
/* -------------------------------------------- */

/** Resolve a document by uuid, quietly. */
function docAt(uuid) {
  if (!uuid || typeof uuid !== "string") return null;
  try {
    return fromUuidSync(uuid);
  } catch {
    return null;
  }
}

/** A creature's own token document: its synthetic token, or its first active one. */
function ownTokenDoc(actor) {
  if (!actor) return null;
  if (actor.isToken && actor.token) return actor.token;
  return actor.getActiveTokens?.(true)?.[0]?.document ?? null;
}

/** A token reference a card records. */
function tokenRef(doc) {
  return doc ? { sceneId: doc.parent?.id ?? null, tokenId: doc.id, actorId: doc.actor?.id ?? doc.actorId ?? null, name: doc.name ?? "" } : null;
}

/** The Sand pool, or null. */
function sandPool(actor) {
  return (actor?.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === "sand") ?? null;
}

/** Sand into the pool through the one rule (`rules/sand.mjs#gainSand`), never past the cap. */
async function gainHere(actor, amount) {
  const pool = sandPool(actor);
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!pool || !n) return 0;
  const value = gainSand(pool.value, n, pool.max);
  if (value <= pool.value) return 0;
  await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value });
  return value - pool.value;
}

/** Sand off the pool as it stands now, never below nothing; answers what was taken. */
async function spendHere(actor, amount) {
  const pool = sandPool(actor);
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!pool || !n) return 0;
  const take = Math.min(n, Math.max(0, Math.trunc(Number(pool.value)) || 0));
  if (take > 0) await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value: pool.value - take });
  return take;
}

/** A taken talent's granted feature (its counter), by the talent's identifier. */
function counterOf(actor, identifier) {
  const talent = actor?.items?.find?.(i => i.type === "talent" && i.system?.identifier === identifier && (i.system?.taken ?? 0) > 0) ?? null;
  return talent ? (actor.grantedFeature?.(talent.id) ?? null) : null;
}

/** A counter's uses left. */
function usesLeft(counter) {
  if (!counter?.system?.uses?.per) return 0;
  return Math.max(0, Math.trunc(Number(counter.system.uses.value)) || 0);
}

/** Whether a creature is in a started fight with a combatant of its own. */
function inStartedFight(actor) {
  const fight = actor?.activeFight?.() ?? null;
  return Boolean(fight?.started && fight.getCombatantsByActor?.(actor)?.length);
}

/**
 * **A ONE-LINE CARD THE ANIMATION LAYER READS** (`module/animation/records.mjs#cardRecord`): a
 * feature card naming its key, its user's token, the creatures it touched and the moves it
 * made, so its `use` (and, with moves, `arrive`) cue plays on every client.
 */
export async function postGuardianCard(actor, { key, text, targets = [], steps = [] } = {}) {
  if (!actor || !text) return null;
  const token = ownTokenDoc(actor);
  const source = token ? { sceneId: token.parent?.id ?? null, tokenId: token.id } : null;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="azeroth-drain">${foundry.utils.escapeHTML(text)}</p>`,
    flags: { "azeroth-rpg": {
      kind: "feature",
      featureKey: key,
      casting: false,
      targets: targets.filter(Boolean),
      source: source ?? null,
      ...(steps.length ? { steps } : {}),
      guardian: key
    } }
  });
}

/* -------------------------------------------- */
/*  The Block                                    */
/* -------------------------------------------- */

/**
 * **WHAT THE GUARDIAN OF TIME DOES ON A BLOCK** (04's Turned Aside: *When you Block an attack,
 * gain 1 Sand ... At rank 3 a Block gives 2*; Grinding Block: *When you Block, the attacker
 * makes a Spirit Resilience Test against your Spell DC. On a failure it is Slowed until the
 * end of its next turn*), on the blocker's own client (`blockNow` refuses one it does not own).
 * Answers the Block card's lines, its Resist row's markup for the attacker's owner (D-779's
 * `data-resist-owner`), and the record `grindAfterResist` reads.
 *
 * @param {{actor: Actor, messageId?: string|null}} o
 * @returns {Promise<{lines: string[], resistHTML: string, grind: object|null}>}
 */
export async function guardianOnBlock({ actor, messageId = null } = {}) {
  const out = { lines: [], resistHTML: "", grind: null };
  if (!actor || actor.type !== "character") return out;
  const talents = actor.takenTalents?.() ?? [];
  const turned = turnedAsideGain(talents, "block", talentEffect);
  if (turned.gain > 0) {
    // *"no hourglass no sand"* (the lead): said in words rather than as a full glass.
    const glass = (sandPool(actor)?.max ?? 0) > 0;
    const landed = glass ? await gainHere(actor, turned.gain) : 0;
    const key = !glass ? "AZEROTH.Guardian.TurnedAsideNoGlass" : (landed > 0 ? "AZEROTH.Guardian.TurnedAside" : "AZEROTH.Guardian.TurnedAsideFull");
    out.lines.push(foundry.utils.escapeHTML(game.i18n.format(key, { name: actor.name, n: landed, talent: turned.name })));
  }
  const grind = grindingBlockOf(talents, talentEffect);
  if (grind) {
    const card = messageId ? (game.messages?.get(messageId) ?? null) : null;
    const attacker = card ? ChatMessage.getSpeakerActor(card.speaker) : null;
    const dc = Math.trunc(Number(actor.system?.spellDC)) || null;
    if (!attacker) out.lines.push(foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Guardian.GrindNoAttacker", { talent: grind.name })));
    else if (!dc) out.lines.push(foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Guardian.GrindNoDc", { name: actor.name, talent: grind.name })));
    else {
      out.grind = { by: actor.uuid, target: attacker.uuid, source: grind.name, condition: grind.condition, until: grind.until, dc };
      const label = game.i18n.localize(AZEROTH.resiliences?.[grind.resilience] ?? grind.resilience);
      out.lines.push(foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Guardian.GrindLine", { name: attacker.name, talent: grind.name, resilience: label, dc })));
      out.resistHTML = `<div class="azeroth-card-actions" data-resist-owner="${foundry.utils.escapeHTML(attacker.uuid)}">`
        + `<button type="button" data-action="resistTest" data-purpose="grind" data-actor-uuid="${foundry.utils.escapeHTML(attacker.uuid)}" data-resilience="${grind.resilience}" data-dc="${dc}">`
        + `${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Card.ResistFor", { name: attacker.name, resilience: label, dc }))}</button></div>`;
    }
  }
  return out;
}

/**
 * **GRINDING BLOCK'S TEST, ANSWERED** (from `dice/chat.mjs#rollResists`, on the client that
 * rolled the attacker's Test, which owns it): the card's one press claimed (`claimCardPress`),
 * and on a failure Slowed until the end of the attacker's next turn through the one landing
 * door, the blocker its layer. Answers the lines for a notification.
 *
 * @param {{message: ChatMessage, actor: Actor, passed: boolean}} o
 */
export async function grindAfterResist({ message, actor, passed = false } = {}) {
  const grind = message?.flags?.["azeroth-rpg"]?.grind ?? null;
  if (!grind || !actor || grind.target !== actor.uuid) return [];
  const { claimCardPress } = await import("./card-presses.mjs");
  const claimed = await claimCardPress(message, { kind: "once", press: "grind" });
  if (!claimed?.ok) return [];
  if (passed) return [game.i18n.format("AZEROTH.Guardian.GrindPassed", { name: actor.name, talent: grind.source ?? "" })];
  const by = docAt(grind.by);
  const condition = AZEROTH.conditions?.[grind.condition] ? grind.condition : "slowed";
  const landed = await inflictCondition({ victim: actor, id: condition, by: by?.documentName === "Actor" ? by : null, name: actor.name, until: untilEndOfNextTurnOrRound(actor) });
  return [game.i18n.format(landed?.landed ? "AZEROTH.Guardian.GrindLanded" : "AZEROTH.Guardian.GrindNotLanded",
    { name: actor.name, talent: grind.source ?? "", condition: game.i18n.localize(AZEROTH.conditions?.[condition] ?? condition) })];
}

/* -------------------------------------------- */
/*  The miss                                     */
/* -------------------------------------------- */

/** The actor a card's target row names: its token's on its scene, else the world actor. */
function actorOfRow(row) {
  if (!row) return null;
  const scene = row.sceneId ? game.scenes?.get(row.sceneId) : null;
  const token = row.tokenId ? scene?.tokens?.get(row.tokenId) ?? null : null;
  return token?.actor ?? (row.actorId ? game.actors?.get(row.actorId) ?? null : null);
}

/**
 * **TURNED ASIDE AT RANK 2** (04: *At rank 2 you also gain 1 when an attack against you
 * misses*), on the active GM's client as an attack's card is posted: every creature the card
 * records holding the talent at rank 2 and an Hourglass gains its Sand where the Attack Test
 * missed - an echo's and an Extra Attack's second roll included. A Parry is no attack. MY
 * READING: a miss is the roll's own; a hit a Parry or a Block answers is no miss.
 *
 * @param {ChatMessage} message
 * @returns {Promise<number>}  how many creatures gained
 */
export async function turnedAsideOnMiss(message) {
  const flags = message?.flags?.["azeroth-rpg"] ?? {};
  if (flags.kind !== "attack" || flags.parry === true) return 0;
  if (message.rolls?.[0]?.outcome?.success !== false) return 0;
  let gained = 0;
  const seen = new Set();
  for (const row of Array.isArray(flags.targets) ? flags.targets : []) {
    const actor = actorOfRow(row);
    if (!actor || actor.type !== "character" || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    const turned = turnedAsideGain(actor.takenTalents?.() ?? [], "miss", talentEffect);
    if (!(turned.gain > 0)) continue;
    const landed = await gainHere(actor, turned.gain);
    if (landed > 0) {
      gained += 1;
      ui.notifications?.info(game.i18n.format("AZEROTH.Guardian.TurnedAsideMiss", { name: actor.name, n: landed, talent: turned.name }));
    }
  }
  return gained;
}

/* -------------------------------------------- */
/*  Borrowed Time and Borrowed Hour              */
/* -------------------------------------------- */

/**
 * **BORROWED TIME'S CARD** (from `AzerothActor#applyDamage`, once the half put off is on the
 * list): what the creature takes now, what arrives at the start of its next turn, and what its
 * rank spared - its `use` cue the deferral's picture.
 *
 * @param {Actor} actor
 * @param {{now: number, later: number, spared?: number, name?: string, free?: boolean}} borrowed
 */
export async function borrowedCard(actor, borrowed) {
  if (!actor || !borrowed?.borrowed) return null;
  const text = game.i18n.format(borrowed.free ? "AZEROTH.Guardian.BorrowedFree" : "AZEROTH.Guardian.Borrowed", {
    name: actor.name, now: borrowed.now, later: borrowed.later, spared: borrowed.spared ?? 0, talent: borrowed.name ?? BORROWED_TIME
  });
  const token = ownTokenDoc(actor);
  return postGuardianCard(actor, { key: "borrowed-time", text, targets: token ? [tokenRef(token)] : [] });
}

/**
 * **04's BORROWED HOUR, HELD** (from `AzerothActor#_holdAtOne`, after Cauterize): where the
 * blow would drop the creature to 0 in a started fight and the counter holds its use, the
 * creature stays at 1, and the rest of the blow is for the put-off list at the start of its
 * next turn. Answers `_holdAtOne`'s shape, or null where it does not catch. **It writes
 * nothing** (the stage 3 fix): the use struck, the row and the card are `borrowedHour`'s plan,
 * committed by `commitBorrowedHour` once the damage door has passed its last refusal, so a
 * blow a late dispersal refuses strands no row and spends no use.
 *
 * @param {Actor} actor
 * @param {{before: number, amount: number}} o
 */
export async function borrowedHourHold(actor, { before = 0, amount = 0 } = {}) {
  if (!actor || actor.type !== "character") return null;
  const row = guardianRow(actor.takenTalents?.() ?? [], "borrowedHour", talentEffect);
  if (!row) return null;
  const counter = counterOf(actor, row.identifier);
  const left = usesLeft(counter);
  const caught = borrowedHourCatch({ held: true, before, amount, usesLeft: left, inFight: inStartedFight(actor) });
  if (!caught.saved) return null;
  return {
    amount: caught.amount, held: { kind: "borrowedHour", name: row.name }, rest: caught.rest,
    borrowedHour: { identifier: row.identifier, name: row.name, rest: caught.rest }
  };
}

/**
 * **BORROWED HOUR, WRITTEN** (from `AzerothActor#applyDamage`, beside the other put-off rows,
 * once nothing can refuse the blow): the use struck on the counter as it stands now, the rest
 * of the blow on the put-off list (D-866's carrier) and the card its animation reads.
 *
 * @param {Actor} actor
 * @param {{identifier: string, name: string, rest: number}} plan  `borrowedHourHold`'s
 */
export async function commitBorrowedHour(actor, plan) {
  if (!actor || !plan) return;
  const counter = counterOf(actor, plan.identifier);
  if (counter) await counter.update({ "system.uses.value": Math.max(0, usesLeft(counter) - 1) });
  const rest = Math.max(0, Math.trunc(Number(plan.rest)) || 0);
  if (rest > 0) {
    await actor.setFlag("azeroth-rpg", DEFERRED_FLAG, borrowedRow(actor.getFlag("azeroth-rpg", DEFERRED_FLAG) ?? [], { amount: rest, source: BORROWED_HOUR }));
  }
  const text = game.i18n.format("AZEROTH.Guardian.BorrowedHour", { name: actor.name, n: rest, talent: plan.name });
  ui.notifications?.info(text);
  const token = ownTokenDoc(actor);
  await postGuardianCard(actor, { key: "borrowed-hour", text, targets: token ? [tokenRef(token)] : [] }).catch(err => console.warn("azeroth-rpg | borrowed hour card", err));
}

/* -------------------------------------------- */
/*  Interposed Moment's swap                     */
/* -------------------------------------------- */

/** Two displacements, on a client that may write both tokens. */
async function swapHere(a, b) {
  const pa = { x: a.x, y: a.y };
  const pb = { x: b.x, y: b.y };
  const one = await a.move({ x: pb.x, y: pb.y, action: "displace" });
  const two = await b.move({ x: pa.x, y: pa.y, action: "displace" });
  return { ok: one !== false && two !== false };
}

/**
 * **04's INTERPOSED MOMENT'S SWAP** (*You and that ally swap places without provoking
 * Opportunity Attacks*): the Guardian's token to the ally's place and the ally's to the
 * Guardian's, as two displacements - no Move spent, no Opportunity Attack - here where this
 * client may write both, else on the active GM's client. The moves are recorded before they
 * are made and put on a card for the swap's animation. Answers whether both moved.
 *
 * @param {{holder: Actor, target: Actor, source?: string}} o
 */
export async function swapPlaces({ holder, target, source = "" } = {}) {
  const a = ownTokenDoc(holder);
  const b = ownTokenDoc(target);
  if (!a || !b || a.parent?.id !== b.parent?.id) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Guardian.SwapNoBoard", { name: holder?.name ?? "", target: target?.name ?? "" }));
    return { moved: false };
  }
  const grid = a.parent?.grid ?? null;
  const size = { sizeX: grid?.sizeX ?? grid?.size ?? 100, sizeY: grid?.sizeY ?? grid?.size ?? 100 };
  const steps = [
    stepRecord({ sceneId: a.parent.id, tokenId: a.id, kind: "self", from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y }, width: a.width, height: a.height, ...size }),
    stepRecord({ sceneId: b.parent.id, tokenId: b.id, kind: "friend", from: { x: b.x, y: b.y }, to: { x: a.x, y: a.y }, width: b.width, height: b.height, ...size })
  ].filter(Boolean);
  let done;
  if (a.isOwner && b.isOwner) done = await swapHere(a, b);
  else {
    const gm = game.users?.activeGM ?? null;
    if (!gm) done = { ok: false };
    else {
      try {
        done = await gm.query(GUARDIAN_QUERY, { op: "swap", byUuid: holder.uuid, aUuid: a.uuid, bUuid: b.uuid }, { timeout: 15000 });
      } catch (err) {
        ui.notifications?.warn(err.message);
        done = { ok: false };
      }
    }
  }
  if (!done?.ok) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Guardian.SwapFailed", { name: holder.name, target: target.name }));
    return { moved: false };
  }
  await postGuardianCard(holder, {
    key: "interposed-moment", steps, targets: [tokenRef(b)],
    text: game.i18n.format("AZEROTH.Guardian.Swapped", { name: holder.name, target: target.name, talent: source })
  }).catch(err => console.warn("azeroth-rpg | interposed moment card", err));
  return { moved: true };
}

/* -------------------------------------------- */
/*  The Uses                                     */
/* -------------------------------------------- */

/** Warn in words and answer null: the refusal every judgement below ends with. */
function refuse(key, params = {}) {
  ui.notifications?.warn(game.i18n.format(key, params));
  return null;
}

/**
 * **THE GUARDIAN OF TIME'S USES, JUDGED BEFORE ANYTHING IS PAID** (D-768's order), from
 * `effects/chronomancer.mjs#judgeChronoUse`: Borrowed Time's granted feature says where it is
 * asked; Unmade Wound needs damage Borrowed Time has put off; Timeless Sentinel needs nothing
 * more. Answers null where refused (nothing spent), else what the Use took for its landing.
 *
 * @param {{actor: Actor, item: Item, onUse: object|null, rank?: number}} o
 * @returns {Promise<object|null>}
 */
export async function judgeGuardianUse({ actor, item, onUse, rank = 1 } = {}) {
  const out = {};
  if (!onUse) return out;
  const name = item?.name ?? "";
  if (onUse.askedInBlow) return refuse("AZEROTH.Guardian.AskedInBlow", { name });
  if (onUse.unmade) {
    const u = atRankRow(onUse.unmade, rank);
    const plan = unmadeErase(actor.getFlag("azeroth-rpg", DEFERRED_FLAG) ?? [], { whole: u.whole === true });
    if (!(plan.held > 0)) return refuse("AZEROTH.Guardian.NothingPutOff", { name, talent: BORROWED_TIME });
    if (!(plan.erased > 0)) return refuse("AZEROTH.Guardian.NothingToErase", { name, n: plan.held });
    out.unmade = { whole: u.whole === true };
  }
  if (onUse.timelessSentinel) out.sentinel = { feet: Math.max(1, Math.trunc(Number(onUse.timelessSentinel.feet)) || 30) };
  return out;
}

/**
 * **WHAT THE GUARDIAN OF TIME'S USES DO ONCE PAID FOR**, as card lines (from
 * `effects/chronomancer.mjs#landChronoUse`).
 *
 * @param {{actor: Actor, item: Item, chrono: object}} o
 * @returns {Promise<string[]>}
 */
export async function landGuardianUse({ actor, item, chrono } = {}) {
  const lines = [];
  if (!chrono) return lines;
  const name = item?.name ?? "";
  if (chrono.unmade) {
    // Read again at the write: a blow that landed while the Use was paid for moved the list.
    const plan = unmadeErase(actor.getFlag("azeroth-rpg", DEFERRED_FLAG) ?? [], { whole: chrono.unmade.whole });
    if (plan.list.length) await actor.setFlag("azeroth-rpg", DEFERRED_FLAG, plan.list);
    else await actor.unsetFlag("azeroth-rpg", DEFERRED_FLAG);
    lines.push(game.i18n.format("AZEROTH.Guardian.Unmade", { name: actor.name, n: plan.erased, left: plan.held - plan.erased, talent: name }));
  }
  if (chrono.sentinel) {
    const stale = actor.effects.filter(e => e.getFlag("azeroth-rpg", SENTINEL_FLAG)).map(e => e.id);
    if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name, img: item?.img ?? "icons/svg/shield.svg", origin: actor.uuid, ...(untilEndOfNextTurnOrRound(actor) ?? {}), showIcon: 2,
      description: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Guardian.SentinelText", { name: actor.name, feet: chrono.sentinel.feet }))}</p>`,
      flags: { "azeroth-rpg": { [SENTINEL_FLAG]: { source: name, by: actor.uuid, feet: chrono.sentinel.feet } } }
    }]);
    lines.push(game.i18n.format("AZEROTH.Guardian.SentinelLaid", { name: actor.name, feet: chrono.sentinel.feet }));
  }
  return lines;
}

/* -------------------------------------------- */
/*  Unmade Wound at the turn's start (O-274)     */
/* -------------------------------------------- */

/**
 * Unmade Wound on a Guardian now, off the world as this client holds it: the talent at its
 * rank, its granted feature (whose Sand price the sheet's Use pays too), the Sand, a
 * Half-Action in a started fight, and what the erasing would take off
 * (`rules/guardian.mjs#unmadeTurnStart`). Null where the talent or its feature is not held.
 */
function unmadeJudgement(actor) {
  if (!actor || actor.type !== "character") return null;
  const held = unmadeWoundOf(actor.takenTalents?.() ?? [], talentEffect);
  if (!held) return null;
  const feature = counterOf(actor, held.identifier);
  if (!feature) return null;
  const stated = Number(feature.system?.cost?.amount);
  const price = Number.isFinite(stated) ? Math.max(0, Math.trunc(stated)) : 2;
  const pool = sandPool(actor);
  const half = inStartedFight(actor) && game.system.azeroth.workflows.turnBudgetRefusal(actor, "half") === null;
  const judged = unmadeTurnStart({
    held, list: actor.getFlag("azeroth-rpg", DEFERRED_FLAG) ?? [], sand: (pool?.max ?? 0) > 0 ? pool.value : null, price, half
  });
  // `judged.held` is Borrowed Time's total put off; the talent travels as `talent`.
  return { talent: held, feature, price, ...judged };
}

/**
 * On the Guardian's own client: judged, asked, judged again, then the Half-Action and the
 * Sand (D-768's order) - paid only while the asker still waits (`answerInTime`, the hardened
 * pattern Another Timeline keeps, `effects/chrono-timeline.mjs`).
 */
async function unmadeHere(actor) {
  const started = Date.now();
  const first = unmadeJudgement(actor);
  if (!first || first.refusal) return { yes: false };
  const yes = await confirmHere(actor, {
    title: first.talent.name, ms: answerWindow(ASK_MS),
    text: game.i18n.format("AZEROTH.Guardian.AskUnmade", { name: actor.name, talent: first.talent.name, held: first.held, n: first.erased, cost: first.price })
  });
  if (!yes) return { yes: false };
  const again = unmadeJudgement(actor);
  if (!again || again.refusal) {
    ui.notifications?.warn(game.i18n.format(`AZEROTH.Guardian.UnmadeRefuse.${again?.refusal ?? "unknown"}`, { name: actor.name, talent: first.talent.name }));
    return { yes: false };
  }
  if (!answerInTime(started, Date.now(), ASK_MS)) return { yes: false };
  if (!(await game.system.azeroth.workflows.spendTurnBudget(actor, "half"))) return { yes: false };
  await spendHere(actor, again.price);
  return { yes: true, whole: again.talent.whole === true };
}

/**
 * **04's UNMADE WOUND, ASKED AT THE START OF THE GUARDIAN'S TURN** (O-274, closed by D-880;
 * from `effects/deferred-damage.mjs#landDeferred` with `turnStart`, on the active GM's client,
 * after the turn's budget is reset and before the put-off rows land). Where the Guardian
 * holds the talent, its Sand and a Half-Action, and Borrowed Time has put damage off, it is
 * asked once through whoever answers for it - a dialog here where that is this user, the
 * query on that user otherwise; the yes is paid there. Then Borrowed Time's rows alone are
 * written down by `unmadeErase` (Dilation's and Borrowed Hour's stay), read again at the
 * write, and a card plays its picture. Answers the turn card's lines.
 *
 * @param {Actor} actor
 * @returns {Promise<string[]>}
 */
export async function unmadeAtTurnStart(actor) {
  const judged = unmadeJudgement(actor);
  if (!judged || judged.refusal) return [];
  const who = answererOf(actor);
  if (!who) return [];
  let answer = null;
  try {
    answer = who.id === game.user?.id ? await unmadeHere(actor)
      : await who.query(GUARDIAN_QUERY, { op: "unmade", actorUuid: actor.uuid }, { timeout: ASK_MS });
  } catch (err) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.BlowDoor.NoAnswer", { name: actor.name, reason: err.message }));
    return [];
  }
  if (answer?.yes !== true) return [];
  // Read again at the write: the list as it stands once the Use is paid for.
  const plan = unmadeErase(actor.getFlag("azeroth-rpg", DEFERRED_FLAG) ?? [], { whole: answer.whole === true });
  if (plan.list.length) await actor.setFlag("azeroth-rpg", DEFERRED_FLAG, plan.list);
  else if (actor.getFlag("azeroth-rpg", DEFERRED_FLAG) !== undefined) await actor.unsetFlag("azeroth-rpg", DEFERRED_FLAG);
  const text = game.i18n.format("AZEROTH.Guardian.Unmade", { name: actor.name, n: plan.erased, left: plan.held - plan.erased, talent: judged.talent.name });
  const token = ownTokenDoc(actor);
  await postGuardianCard(actor, { key: "unmade-wound", text, targets: token ? [tokenRef(token)] : [] }).catch(err => console.warn("azeroth-rpg | unmade wound card", err));
  return [text];
}

/* -------------------------------------------- */
/*  The query                                    */
/* -------------------------------------------- */

/**
 * The handler (`GUARDIAN_QUERY`). `swap`, on the active GM: the asker must own the Guardian,
 * and the Guardian must hold Interposed Moment; the two tokens stand on one scene and the
 * first is the Guardian's. `unmade`, on whoever answers for the Guardian: the asker must own
 * it and this client must too (`unmadeAtTurnStart`). Throws with the reason.
 */
export async function guardianQueryHandler(payload = {}, { user = null } = {}) {
  if (payload.op === "unmade") {
    const actor = docAt(payload.actorUuid);
    if (actor?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
    if (user && !actor.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: actor.name }));
    if (!actor.isOwner) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: actor.name }));
    return unmadeHere(actor);
  }
  if (payload.op !== "swap") throw new Error(`guardian: no such op ${JSON.stringify(payload.op ?? null)}`);
  const by = docAt(payload.byUuid);
  const a = docAt(payload.aUuid);
  const b = docAt(payload.bUuid);
  if (by?.documentName !== "Actor" || a?.documentName !== "Token" || b?.documentName !== "Token") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !by.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: by.name }));
  if (!interposedFor(by.takenTalents?.() ?? [], talentEffect)) throw new Error(game.i18n.localize("AZEROTH.Chrono.NotHeld"));
  if (a.parent?.id !== b.parent?.id || (a.actor?.uuid !== by.uuid && a.actorId !== by.id)) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  return swapHere(a, b);
}

/* -------------------------------------------- */
/*  Hooks                                        */
/* -------------------------------------------- */

/**
 * The hook this module needs, on the active GM's client: an attack's card that missed gives
 * Turned Aside's rank 2 Sand. Registered once at `init` (`azeroth.mjs`).
 */
export function registerGuardianHooks() {
  Hooks.on("createChatMessage", message => {
    if (game.users?.activeGM?.isSelf !== true) return;
    if (message?.flags?.["azeroth-rpg"]?.kind !== "attack") return;
    turnedAsideOnMiss(message).catch(err => console.warn("azeroth-rpg | Turned Aside", err));
  });
}
