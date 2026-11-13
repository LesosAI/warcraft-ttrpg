/**
 * **WHAT ANOTHER CREATURE DOES TO A BLOW, ASKED AS IT LANDS** (D-777; the lead,
 * 2026-10-03 - O-155: *"If the talent moves damage it should just move the
 * damage as directed"*; O-156: *"Yes."*).
 *
 * `rules/blow-doors.mjs` is the law and `AzerothActor#applyDamage` the one door
 * that calls every function here, IN the blow, before the Health is written -
 * the shape Unkillable and Cauterize already had there (D-768, D-775):
 *
 * - `redirectBlow` - 04's Guardian and 02's Shield of the Righteous: an ally in
 *   reach of the creature struck is ASKED whether to take the blow; a yes pays
 *   the Rage or the Zeal and the Reaction and lands the blow on the holder
 *   through the holder's own door, and the creature it was aimed at takes none.
 * - `divideBlow` - 04's Spirit Link Totem: what a linked ally takes is divided
 *   evenly among every ally within 20 feet of the totem, no one asked.
 * - `askToHold` - 04's Intervention, Spirit Shell and Guardian Spirit: a blow
 *   that would drop a creature to 0 is put to each holder in turn, and the first
 *   yes strikes a use and holds it at 1 (Guardian Spirit restoring the tier).
 * - `registerBlowDoorHooks` - 07's Aegis of the Light: a creature its floor held
 *   restores the caster's tier when the floor goes, where the caster holds 04's
 *   talent of the name.
 * - **The Chronomancer's Guardian of Time** (stage 2c): Interposed Moment a move that
 *   swaps the two first, Timeless Sentinel a move asked of nobody and paid with
 *   nothing, and `askToBorrow` - Borrowed Time, the creature struck asked about its
 *   own blow (`rules/guardian.mjs`).
 *
 * **WHO IS ASKED**: an active player who owns the holder, else the active GM,
 * through `CONFIG.queries` (`BLOW_ASK_QUERY`; never `game.socket`, D-643) - or a
 * dialog here where that is this user. The handler judges everything again off
 * the world as its own client holds it, before the use, the pool or the
 * Reaction is spent (D-768's order), and answers before the query's own timeout:
 * a dialog left unanswered closes and counts as no, so a late yes can never move
 * a blow the asker has already written. A holder nobody can answer for is not
 * asked. **A share on a creature this client does not own** goes through the
 * active GM (`BLOW_SHARE_QUERY`), and where none is online the blow is not
 * divided at all - said in words, judged before anything is written
 * (`rules/gm-writes.mjs#gmAbsentFor`).
 */

import { AZEROTH } from "../config.mjs";
import { creaturesWithin } from "../canvas/engaged.mjs";
import {
  ASKED_HOLDS, FLOOR_FLAG, divideEvenly, floorOf, floorsHolding, floorsOf, heldAt, holdJudgement, moveJudgement, movedAmount, movedParts, wouldDrop
} from "../rules/blow-doors.mjs";
import {
  RIGHTEOUS, SPIRIT_LINK_FLAG, aegisHealFor, guardianFor, holdRowsFor, righteousReach, spiritLinkFor
} from "../rules/class-talents.mjs";
// 04's Shared Burden: a SHARE of the blow moved, the rest kept, the share met by the
// holder's own Armor Points and Ward (the Legacy branches' B6).
import { burdenMet, keptAmount, regrossFor } from "../rules/blow-doors.mjs";
import { buffetStacks } from "../rules/flame-buffet.mjs";
import { wardBySchool } from "../rules/ward.mjs";
import { schoolArmorBySchool } from "../rules/auras.mjs";
import { burdenFor } from "../rules/class-talents.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { wardsOn } from "./wards.mjs";
import { bondOf } from "../documents/bound.mjs";
// No Reaction against a creature Wind Walk or Bladestorm holds (the Legacy branches' door 14).
import { unansweredBy } from "../rules/reactions.mjs";
// 04's Guardian of Time (the Chronomancer's stage 2c): Interposed Moment and Timeless Sentinel
// as moves, and Borrowed Time asked in the blow.
import { BORROWED_TIME, borrowedRefusal, borrowedSplit, borrowedTimeOf, interposedFor, sentinelMove, sentinelOf } from "../rules/guardian.mjs";
import { talentEffect } from "../rules/talent-effects.mjs";
// The hardened answer window (the 3B review, should-fix 11), for Borrowed Time's ask.
import { answerInTime, answerWindow } from "../rules/chromatic-talents.mjs";

/** Whether no creature may take a Reaction against this one now (door 14). */
function unanswered(actor) {
  return unansweredBy((actor?.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"] ?? {})).length > 0;
}

/** The query a holder is asked through, on whoever answers for it. */
export const BLOW_ASK_QUERY = "azeroth-rpg.blowAsk";

/** The query a share of a divided blow lands through, on the active GM. */
export const BLOW_SHARE_QUERY = "azeroth-rpg.blowShare";

/**
 * How long the asker waits, and how long the dialog stays open: the second is shorter,
 * so a late answer is never a yes. Exported for the Death-Step hold's own ask (the
 * Legacy branches' door 11, `effects/death-holds.mjs`), which keeps the same pattern.
 */
export const ASK_MS = 30000;
export const ANSWER_MS = 25000;

/**
 * The feet the widest move reaches: Guardian's 10 at rank 2, Guardian of the Weak's 20,
 * and Shared Burden's 30 (the Legacy branches' B6). Each move judges its own feet.
 */
const MOVE_SEARCH_FEET = 30;

/** Every distance on a scene: a hold that asks no distance measures everything there. */
const ANYWHERE = 1e6;

/** The creature's token on the viewed scene, or null. */
const tokenOf = actor => actor?.getActiveTokens?.(true)?.[0] ?? null;

/** Resolve an actor by uuid, quietly. */
function actorAt(uuid) {
  if (!uuid) return null;
  try {
    const doc = fromUuidSync(uuid);
    return doc?.documentName === "Actor" ? doc : null;
  } catch {
    return null;
  }
}

/** A pool's value, read off the actor as it stands now, or null where it holds none of the name. */
function poolValue(actor, name) {
  const pool = (actor?.poolSnapshot?.() ?? []).find(p => p.name === name) ?? null;
  return pool ? Math.max(0, Math.trunc(Number(pool.value)) || 0) : null;
}

/** Whether the holder may still spend a Reaction: out of a fight there is no budget to ask. */
function reactionLeft(actor) {
  return game.system.azeroth.workflows.turnBudgetRefusal(actor, "reaction") === null;
}

/** Whether the holder still stands. */
const standing = actor => (actor?.system?.health?.value ?? 0) > 0;

/**
 * The user who answers for a holder: an active player who owns it, else the
 * active GM, else nobody.
 *
 * @param {Actor} actor
 * @returns {User|null}
 */
export function answererOf(actor) {
  if (!actor) return null;
  const players = (game.users?.filter?.(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER")) ?? [])
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return players[0] ?? game.users?.activeGM ?? null;
}

/**
 * Ask a holder: a dialog here where this user answers for it, else the query on
 * the user who does. What the handler answered, or a refusal.
 */
async function ask(holder, payload) {
  const who = answererOf(holder);
  if (!who) return { answered: false, reason: "nobody" };
  if (who.id === game.user.id) return blowAskHandler(payload, { user: game.user });
  try {
    return await who.query(BLOW_ASK_QUERY, payload, { timeout: ASK_MS });
  } catch (err) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.BlowDoor.NoAnswer", { name: holder.name, reason: err.message }));
    return { answered: false, reason: "error" };
  }
}

/**
 * The yes or no, on the answering client: a dialog that closes itself as no
 * before the asker stops waiting. Exported for the Death-Step hold (door 11).
 *
 * A question whose yes is followed by queued writes may close sooner (`ms`; the 3B review,
 * should-fix 11: 04's Disrupt Weave and Paradox, `rules/chromatic-talents.mjs#answerWindow`).
 *
 * @param {Actor} holder
 * @param {{title: string, text: string, ms?: number}} o
 * @returns {Promise<boolean>}
 */
export async function confirmHere(holder, { title, text, ms = ANSWER_MS }) {
  const { DialogV2 } = foundry.applications.api;
  let dialog = null;
  const answer = DialogV2.confirm({
    id: `azeroth-blow-ask-${holder.id}-${foundry.utils.randomID(6)}`,
    classes: ["azeroth", "azeroth-roll-dialog", "azeroth-blow-ask"],
    window: { title },
    content: `<p>${text}</p>`,
    rejectClose: false,
    render: (event, d) => { dialog = d; }
  });
  let timer = null;
  const late = new Promise(resolve => { timer = setTimeout(() => resolve("late"), Math.min(ANSWER_MS, Number(ms) || ANSWER_MS)); });
  const result = await Promise.race([answer, late]);
  clearTimeout(timer);
  if (result === "late") {
    await dialog?.close?.();
    ui.notifications?.info(game.i18n.format("AZEROTH.BlowDoor.Late", { name: holder.name }));
    return false;
  }
  return result === true;
}

/* -------------------------------------------- */
/*  The move (O-155)                            */
/* -------------------------------------------- */

/**
 * The moves a holder could make for this blow, judged on the holder's talents
 * and features as they stand: 04's Guardian and 02's Shield of the Righteous.
 */
function movesOf(holder) {
  const out = [];
  const talents = holder.takenTalents?.() ?? [];
  // **04's TIMELESS SENTINEL FIRST** (stage 2c: *every attack against an ally within 30 feet of
  // you targets you instead*): automatic and free, so a Guardian holding it is never asked
  // to pay for Interposed Moment on a blow the Sentinel takes anyway.
  const sentinel = sentinelMove(sentinelOf([...(holder.effects ?? [])]));
  if (sentinel) out.push(sentinel);
  // 04's Interposed Moment (stage 2c): a swap and the attack, for 2 Sand and the Reaction.
  const interposed = interposedFor(talents, talentEffect);
  if (interposed) out.push(interposed);
  const guardian = guardianFor(talents);
  if (guardian) out.push(guardian);
  // 04's Shared Burden (the Legacy branches' B6): a share of the blow, half or all.
  const burden = burdenFor(talents);
  if (burden) out.push(burden);
  // 08 §20's The Raised Gauntlet (D-912): what the holder WEARS, read by its own reader.
  for (const row of holder.signatureMoves?.() ?? []) out.push(row);
  const feature = (holder.items ?? []).find(i => i.type === "feature" && i.name === RIGHTEOUS.feature) ?? null;
  if (feature) {
    out.push({
      kind: "righteous", name: RIGHTEOUS.feature, feet: righteousReach(talents).feet,
      cost: { pool: feature.system?.cost?.pool ?? RIGHTEOUS.pool, amount: Math.max(0, Math.trunc(Number(feature.system?.cost?.amount)) || 0) }
    });
  }
  return out;
}

/**
 * Eligible redirections, read without prompting, paying or applying damage.
 * The unified original-target chooser can inspect these before executing one.
 *
 * @param {{target: Actor, amount: number, type?: string|null, attack?: boolean, spell?: boolean,
 *   messageId?: string|null, by?: Actor|null, location?: string, parts?: Array|null}} blow
 * @returns {Array<{key: string, holder: Actor, row: object, feet: number, moved: number}>}
 */
export function redirectCandidates({ target, amount = 0, type = null, attack = false, spell = false, messageId = null, by = null } = {}) {
  if (!target || !(amount > 0) || !messageId) return [];
  // **A BLOW NO REACTION MAY ANSWER** (04's Wind Walk and Bladestorm: *No creature
  // may take a Reaction against you*; the Legacy branches' door 14): the move is a
  // Reaction against the striker, so a striker it holds is never asked about.
  if (unanswered(by)) return [];
  const origin = tokenOf(target);
  if (!origin) return [];
  const candidates = [], seen = new Set();
  const near = creaturesWithin(target, MOVE_SEARCH_FEET, { who: "ally", except: [origin.id] });
  for (const { actor: holder, feet } of near) {
    if (!holder || holder.uuid === target.uuid) continue;
    for (const row of movesOf(holder)) {
      const judged = moveJudgement(row, {
        attack, spell, amount, self: false, friendly: true, distance: feet,
        poolValue: poolValue(holder, row.cost?.pool), reactionLeft: reactionLeft(holder), holderUp: standing(holder), fromCard: true
      });
      if (!judged.ok) continue;
      const key = JSON.stringify([holder.uuid, row.kind]);
      if (seen.has(key)) continue;
      seen.add(key);
      const moved = movedAmount({ kind: row.kind, amount, type, ward: RIGHTEOUS.ward, schools: Object.keys(AZEROTH.schools), share: row.share ?? "half" });
      candidates.push({ key, holder, row, feet, moved });
    }
  }
  return candidates;
}

/** Selection is one freshly eligible candidate key, or null for no transfer.
 * Undefined preserves the existing sequential path until the unified chooser is wired.
 * Discovery never asks, pays, or writes; a stale selection never substitutes another holder. */
export async function redirectBlow({ target, amount = 0, type = null, attack = false, spell = false, messageId = null, by = null, location = "body", parts = null, breath = null, selection = undefined } = {}) {
  if (selection === null) return { moved: false };
  const blow = { target, amount, type, attack, spell, messageId, by };
  const candidates = redirectCandidates(blow).filter(c => selection === undefined || c.key === selection);
  if (selection !== undefined && !candidates.length) return { moved: false, reason: "choiceChanged" };
  for (const candidate of candidates) {
    // A previous holder's response can change resources, range or eligibility.
    const fresh = redirectCandidates(blow).find(c => c.key === candidate.key);
    if (!fresh) continue;
    const { holder, row, feet, moved } = fresh;
    const answer = await ask(holder, {
      act: "move", kind: row.kind, holderUuid: holder.uuid, targetUuid: target.uuid, amount, moved, type,
      attack: attack === true, spell: spell === true, messageId, byUuid: by?.uuid ?? null, location, feet, parts, breath,
      awaitDelivery: selection !== undefined
    });
    if (answer?.moved) {
      const took = answer.amount ?? moved;
      ui.notifications?.info(game.i18n.format("AZEROTH.BlowDoor.Moved", { holder: holder.name, name: target.name, talent: row.name, n: took }));
      // **WHAT STAYS WHERE IT WAS AIMED** (04's Shared Burden: *Half the damage ... is
      // dealt to you instead*; the Legacy branches' B6): a share moved leaves the rest to
      // the creature struck, and Guardian's whole blow none (`keptAmount`).
      return { moved: true, to: holder, amount: took, name: row.name, kept: keptAmount({ kind: row.kind, amount, moved: took }), damageOutcome: answer.damageOutcome };
    }
    if (selection !== undefined) {
      if (answer?.reason === "error" || !answer) throw Error("Transfer delivery unconfirmed");
      return { moved: false, reason: answer.reason ?? "choiceChanged" };
    }
  }
  return { moved: false };
}

/**
 * The move on the holder's own client: judged again, asked, paid, and taken.
 * `remote` where another client asked through `BLOW_ASK_QUERY` and is waiting on
 * the answer (`blowAskHandler`).
 */
async function moveHere({ holder, target, kind, amount, moved, type, attack, spell, messageId, by, location, feet, parts, breath = null, remote = false }) {
  const row = movesOf(holder).find(r => r.kind === kind) ?? null;
  if (!row) return { moved: false, reason: "unknown" };
  // Judged again on the holder's client (door 14): the striker may have taken Wind
  // Walk since the asker asked.
  if (unanswered(by)) return { moved: false, reason: "unanswered" };
  const judge = () => moveJudgement(row, {
    attack, spell, amount, self: holder.uuid === target.uuid, friendly: true, distance: feet,
    poolValue: poolValue(holder, row.cost?.pool), reactionLeft: reactionLeft(holder), holderUp: standing(holder), fromCard: Boolean(messageId)
  });
  const first = judge();
  if (!first.ok) return { moved: false, reason: first.reason };
  // **A SHARE IS THE HOLDER'S OWN ROW'S** (04's Shared Burden; the Legacy branches' B6):
  // worked out again here off the holder's rank, never taken off the request.
  if (kind === "burden") moved = movedAmount({ kind, amount, share: row.share ?? "half" });
  // **THE RAISED GAUNTLET RE-RESOLVES THE ATTACK AGAINST ITS BEARER** (the lead, D-913:
  // *"Re-resolve against the bearer only"*): the card's own record of the blow before any
  // target met it, met by the bearer's Armor Points and Ward alone. A card that recorded
  // none is refused in words before anything is asked or paid - never a blow reduced twice.
  let gross = null;
  if (kind === "gauntlet") {
    const spec = game.messages?.get?.(messageId)?.flags?.["azeroth-rpg"]?.blowSpec ?? null;
    gross = regrossFor(spec, {
      apByLocation: holder.system?.ap ?? {}, wardBySchool: wardBySchool(holder.system?.ward), schoolArmorBySchool: schoolArmorBySchool(holder.system?.schoolArmor),
      fireTakenBonus: buffetStacks([...(holder.effects ?? [])], game.time?.worldTime),
      immune: holder.system?.immune ?? [], vulnerable: holder.system?.vulnerable ?? []
    });
    if (!gross) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.BlowDoor.Refuse.noGross", { name: holder.name, talent: row.name }));
      return { moved: false, reason: "noGross" };
    }
    moved = Math.max(0, Math.trunc(Number(gross.damage)) || 0);
  }
  // **04's TIMELESS SENTINEL ASKS NOBODY** (stage 2c: *every attack ... targets you instead*):
  // the move is the effect's, so no question is put; every other move is a choice.
  const askKey = { righteous: "AZEROTH.BlowDoor.AskRighteous", burden: "AZEROTH.BlowDoor.AskBurden", interposed: "AZEROTH.BlowDoor.AskInterposed", gauntlet: "AZEROTH.BlowDoor.AskGauntlet" }[kind] ?? "AZEROTH.BlowDoor.AskGuardian";
  const yes = row.auto === true ? true : await confirmHere(holder, {
    title: row.name,
    text: game.i18n.format(askKey, {
      holder: holder.name, name: target.name, n: moved, cost: row.cost?.amount ?? 0,
      pool: game.i18n.localize(AZEROTH.poolTypes[row.cost?.pool] ?? row.cost?.pool ?? ""), talent: row.name
    })
  });
  if (!yes) return { moved: false, reason: "declined" };
  // Judged AGAIN after the dialog (the pool and the turn move while it stands open),
  // then the Reaction, then the price - D-768's order.
  const again = judge();
  if (!again.ok) {
    ui.notifications?.warn(game.i18n.format(`AZEROTH.BlowDoor.Refuse.${again.reason}`, { name: holder.name, talent: row.name }));
    return { moved: false, reason: again.reason };
  }
  // The Sentinel's move takes no Reaction and no price (stage 2c).
  if (row.free !== true) {
    if (!(await game.system.azeroth.workflows.spendTurnBudget(holder, "reaction"))) return { moved: false, reason: "noReaction" };
    const pool = (holder.poolSnapshot?.() ?? []).find(p => p.name === row.cost?.pool) ?? null;
    const price = Math.max(0, Math.trunc(Number(row.cost?.amount)) || 0);
    if (pool && price > 0) await holder.updatePool({ itemId: pool.itemId, kind: pool.kind, value: Math.max(0, pool.value - price) });
  }
  // **THE RAISED GAUNTLET'S USE, STRUCK** (D-912): the press's own count at its own dotted
  // path (08 §20: *counts its uses apart from the item's other Signatures*), after the
  // Reaction and before the blow lands.
  if (kind === "gauntlet" && row.itemId && row.press && row.counted !== false) {
    const worn = holder.items?.get?.(row.itemId) ?? null;
    if (worn) await worn.update({ [`system.signatureEffect.presses.${row.press}.uses.value`]: Math.max(0, (Math.trunc(Number(row.usesLeft)) || 0) - 1) });
  }
  // **04's INTERPOSED MOMENT: *You and that ally swap places without provoking Opportunity
  // Attacks*** (stage 2c): two displacements, here or on the GM's client, recorded on a card
  // for the swap's animation (`effects/guardian.mjs#swapPlaces`) - paid for, then made,
  // before the attack lands on the Guardian. A swap that cannot be made is said in words
  // and the attack still targets the Guardian.
  if (row.swap === true) {
    const { swapPlaces } = await import("./guardian.mjs");
    await swapPlaces({ holder, target, source: row.name });
  }
  // The holder takes it through its own door: its standing reduction, its
  // temporary Health and its own holds - and never a second move or a division.
  // Its second amounts go with it, but not what the struck creature's Ward took
  // off them: the holder's Ward never met this blow (`movedParts`).
  // **A SHARE OF THE BLOW** (04's Shared Burden; the Legacy branches' B6): the half
  // carries none of its second amounts, which stay with the rest on the creature struck,
  // and the share is met by the HOLDER's own Armor Points and Ward (the plan's *As read*:
  // *so your own Armor Points and Ward reduce it*) through `rules/blow-doors.mjs
  // #burdenMet`, what that Ward took handed to the holder's door with it.
  const met = kind === "burden" ? burdenMet({
    share: moved, type, location, parts: moved < amount ? null : parts,
    holder: {
      apByLocation: holder.system?.ap ?? {}, wardBySchool: wardBySchool(holder.system?.ward), schoolArmorBySchool: schoolArmorBySchool(holder.system?.schoolArmor),
      fireTakenBonus: buffetStacks([...(holder.effects ?? [])], game.time?.worldTime),
      immune: holder.system?.immune ?? [], vulnerable: holder.system?.vulnerable ?? []
    }
  }) : null;
  const damageOutcome = {};
  const landing = met
    ? holder.applyDamage(met.damage, { struck: true, attack, spell, location, type, messageId, by, moved: true, wardTook: met.wardTook, parts: met.parts, outcome: damageOutcome, breath })
    // The Raised Gauntlet's blow as the bearer's own Armor Points and Ward met it (D-913).
    : gross ? holder.applyDamage(moved, { struck: true, attack, spell, location, type, messageId, by, moved: true, wardTook: gross.wardTook ?? 0, parts: gross.parts ?? null, outcome: damageOutcome, breath })
    // A breath moved stays a breath (D-914): Foror's Lesson halves it on the holder.
    : holder.applyDamage(moved, { struck: true, attack, spell, location, type, messageId, by, moved: true, parts: movedParts(parts), outcome: damageOutcome, breath });
  // **ANSWERED ONCE IT IS PAID, WHERE ANOTHER CLIENT ASKED** (the review of D-777):
  // the asker stops waiting at ASK_MS and then lands the blow where it was aimed,
  // and the holder's own door can outlast that - a hold it asks in turn is a
  // dialog of its own - so a yes still landing when the asker gave up was one blow
  // taken twice. The yes and the price are the answer; the blow lands after it.
  if (remote) {
    landing.catch(err => console.error("azeroth-rpg | blow moved", err));
    return { moved: true, amount: moved };
  }
  await landing;
  return { moved: true, amount: moved, damageOutcome };
}

/* -------------------------------------------- */
/*  The division (O-155)                        */
/* -------------------------------------------- */

/** Whether an actor is a totem bound to somebody (the link's own anchor is no target). */
const isTotem = actor => bondOf(actor)?.kind === "totem";

/**
 * All standing Spirit Link Totems reaching the target, read without writes or
 * notifications. The original target keeps each plan's remainder. Candidates
 * that need an absent GM remain visible as unavailable for the future chooser.
 *
 * @param {{target: Actor, amount: number}} o
 * @returns {Array<object>} Current source identity, recipient group and shares.
 */
export function divisionCandidates({ target, amount = 0 } = {}) {
  if (!target || !(amount > 0)) return [];
  const board = globalThis.canvas;
  if (!board?.tokens || !tokenOf(target)) return [];
  const seen = new Set(), candidates = [];
  for (const token of board.tokens.placeables) {
    const shaman = token.actor;
    if (!shaman || seen.has(shaman.uuid)) continue;
    seen.add(shaman.uuid);
    const link = shaman.getFlag?.("azeroth-rpg", SPIRIT_LINK_FLAG) ?? null;
    if (!link?.totem) continue;
    const row = spiritLinkFor(shaman.takenTalents?.() ?? []);
    if (!row) continue;
    // *While that totem stands*: on this scene, above 0 Health - and the token
    // the Use named, so a totem planted again later carries no link.
    const totem = actorAt(link.totem);
    const totemToken = tokenOf(totem);
    if (!totem || !totemToken || !standing(totem)) continue;
    if (link.token && totemToken.document?.uuid !== link.token) continue;
    const group = creaturesWithin(shaman, row.feet, { from: totemToken, who: "ally" }).filter(r => !isTotem(r.actor));
    if (!group.some(r => r.actor?.uuid === target.uuid) || group.length < 2) continue;
    const others = group.filter(r => r.actor?.uuid !== target.uuid);
    const { shares } = divideEvenly(amount, group.length);
    const plan = { name: row.name, keep: shares[0], others: others.map((r, i) => ({ actor: r.actor, share: shares[i + 1] })) };
    // A share another user's creature takes is written on the GM's client: with
    // none online the blow is not divided, before anything is written.
    const available = !gmAbsentFor({ owned: plan.others.map(o => o.actor.isOwner), isGM: game.user.isGM, gmActive: Boolean(game.users?.activeGM) });
    candidates.push({ ...plan, available, holderUuid: shaman.uuid, holderName: shaman.name,
      totemUuid: totem.uuid, tokenUuid: totemToken.document?.uuid ?? null,
      key: JSON.stringify([shaman.uuid, totem.uuid, totemToken.document?.uuid ?? null,
        group.map(r => r.actor.uuid).sort()]) });
  }
  return candidates;
}

/** Rebuild the plan from current geometry; never switch a stale explicit choice
 * to another totem or recipient group. Omitted selection retains the legacy first option. */
export function divideBlow({ target, amount = 0, selection = undefined } = {}) {
  if (selection === null) return null;
  const candidates = divisionCandidates({ target, amount });
  const plan = selection === undefined ? candidates[0] : candidates.find(c => c.key === selection);
  if (!plan) return null;
  if (!plan.available) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.BlowDoor.LinkNoGM", { name: target.name, talent: plan.name }));
    return null;
  }
  return plan;
}

/**
 * Land the other shares of a divided blow: each through the creature's own door
 * as damage taken - no attack, no second division and no move - here where this
 * client may write it, else on the GM's client.
 *
 * @param {{target: Actor, plan: object, type?: string|null, by?: Actor|null, parts?: Array|null}} o
 */
export async function landShares({ target, plan, type = null, by = null, strict = false, beforeShare = null, afterShare = null, outcomes = null } = {}) {
  const said = [];
  for (const { actor, share, parts = null } of plan?.others ?? []) {
    if (!(share > 0)) continue;
    const damageOutcome = {};
    if (Array.isArray(outcomes)) outcomes.push(damageOutcome);
    try {
      if (beforeShare) await beforeShare(actor);
      if (actor.isOwner) await actor.applyDamage(share, { struck: true, attack: false, location: "body", type, parts: movedParts(parts), by, shared: true, outcome: damageOutcome });
      else {
        const result = await game.users.activeGM.query(BLOW_SHARE_QUERY, { victimUuid: actor.uuid, strikerUuid: target.uuid, amount: share, type, parts: movedParts(parts), byUuid: by?.uuid ?? null }, { timeout: 15000 });
        if (result?.damageOutcome) Object.assign(damageOutcome, result.damageOutcome);
      }
      if (afterShare) await afterShare(actor);
      said.push(game.i18n.format("AZEROTH.BlowDoor.Share", { name: actor.name, n: share }));
    } catch (err) {
      if (strict) throw err;
      ui.notifications?.warn(err.message);
    }
  }
  if (said.length) ui.notifications?.info(game.i18n.format("AZEROTH.BlowDoor.Divided", { talent: plan.name, name: target.name, n: plan.keep, shares: said.join(", ") }));
  return said;
}

/**
 * The GM-side handler (`BLOW_SHARE_QUERY`): the asker must own the creature the
 * blow STRUCK - it was their client that divided it.
 */
export async function blowShareQueryHandler({ victimUuid = null, strikerUuid = null, amount = 0, type = null, parts = null, byUuid = null } = {}, { user = null } = {}) {
  const victim = victimUuid ? await fromUuid(victimUuid) : null;
  const struck = strikerUuid ? await fromUuid(strikerUuid) : null;
  if (victim?.documentName !== "Actor" || struck?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !struck.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: struck.name }));
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  const damageOutcome = {};
  if (n > 0) await victim.applyDamage(n, { struck: true, attack: false, location: "body", type: type ?? null, parts: movedParts(parts), by: actorAt(byUuid), shared: true, outcome: damageOutcome });
  return { landed: n, damageOutcome };
}

/* -------------------------------------------- */
/*  The hold at 1 (O-156)                       */
/* -------------------------------------------- */

/**
 * The holds others could make for this creature, in `HOLD_ORDER`: who, which,
 * and what the judgement needs, off the scene as it stands.
 */
function holdOffers(target) {
  const offers = [];
  const add = (holder, distance, only = null) => {
    for (const row of holdRowsFor(holder.takenTalents?.() ?? [], { tier: holder.system?.tier ?? 1 })) {
      if (!only || row.kind === only) offers.push({ holder, row, distance });
    }
  };
  // Intervention and Guardian Spirit: allies of the creature on this scene,
  // measured from it - which is what makes each of them *friendly*.
  const seen = new Set();
  for (const { actor, feet } of creaturesWithin(target, ANYWHERE, { who: "ally" })) {
    if (!actor || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    add(actor, feet);
  }
  // Spirit Shell: the priests whose Ward stands on it, wherever they are -
  // their Spirit Shell and nothing else, since nothing measured them.
  for (const { ward } of wardsOn(target)) {
    const priest = actorAt(ward.by);
    if (!priest || seen.has(priest.uuid)) continue;
    seen.add(priest.uuid);
    add(priest, null, "spiritShell");
  }
  const order = new Map(ASKED_HOLDS.map((k, i) => [k, i]));
  return offers
    .filter(o => ASKED_HOLDS.includes(o.row.kind))
    .sort((a, b) => (order.get(a.row.kind) - order.get(b.row.kind)) || String(a.holder.name).localeCompare(String(b.holder.name)));
}

/** A holder's uses left on the counter its talent grants. */
function usesLeft(holder, row) {
  const counter = row?.talentId ? holder.grantedFeature?.(row.talentId) ?? null : null;
  return Math.max(0, Math.trunc(Number(counter?.system?.uses?.value)) || 0);
}

/** What the judgement reads for one offer, off the world as this client holds it. */
function holdFacts(offer, target, { attack }) {
  return {
    attack, friendly: true, distance: offer.distance,
    warded: wardsOn(target).some(w => w.ward.by === offer.holder.uuid),
    usesLeft: usesLeft(offer.holder, offer.row), holderUp: standing(offer.holder)
  };
}

/**
 * **ANOTHER CREATURE'S HOLD AT 1** (04's Intervention, Spirit Shell and Guardian
 * Spirit; D-777): each holder who could, asked in turn; the first yes strikes a
 * use and holds the creature at 1. What is left of the blow, and who held it.
 *
 * @param {{target: Actor, before: number, amount: number, attack?: boolean}} o
 * @returns {Promise<{amount: number, held: {kind: string, name: string, holder: Actor, heal: number}|null}>}
 */
export async function askToHold({ target, before = 0, amount = 0, attack = false } = {}) {
  if (!target || !wouldDrop({ before, amount }) || (!tokenOf(target) && !wardsOn(target).length)) return { amount, held: null };
  for (const offer of holdOffers(target)) {
    if (!holdJudgement(offer.row, holdFacts(offer, target, { attack })).ok) continue;
    const answer = await ask(offer.holder, {
      act: "hold", identifier: offer.row.identifier, holderUuid: offer.holder.uuid, targetUuid: target.uuid,
      before, amount, attack: attack === true, distance: offer.distance
    });
    if (answer?.held) {
      const saved = heldAt({ before, amount, stay: 1 });
      return { amount: saved.amount, held: { kind: offer.row.kind, name: offer.row.name, holder: offer.holder, heal: Math.max(0, Math.trunc(Number(answer.heal)) || 0) } };
    }
  }
  return { amount, held: null };
}

/** The hold on the holder's own client: judged again, asked, and its use struck. */
async function holdHere({ holder, target, identifier, before, amount, attack, distance }) {
  const row = holdRowsFor(holder.takenTalents?.() ?? [], { tier: holder.system?.tier ?? 1 }).find(r => r.identifier === identifier) ?? null;
  if (!row) return { held: false, reason: "unknown" };
  const offer = { holder, row, distance };
  const judge = () => holdJudgement(row, holdFacts(offer, target, { attack }));
  const first = judge();
  if (!first.ok || !wouldDrop({ before, amount })) return { held: false, reason: first.reason ?? "noDrop" };
  const yes = await confirmHere(holder, {
    title: row.name,
    text: game.i18n.format(row.heal > 0 ? "AZEROTH.BlowDoor.AskHoldHeal" : "AZEROTH.BlowDoor.AskHold", {
      holder: holder.name, name: target.name, talent: row.name, n: usesLeft(holder, row), heal: row.heal
    })
  });
  if (!yes) return { held: false, reason: "declined" };
  const again = judge();
  if (!again.ok) {
    ui.notifications?.warn(game.i18n.format(`AZEROTH.BlowDoor.Refuse.${again.reason}`, { name: holder.name, talent: row.name }));
    return { held: false, reason: again.reason };
  }
  const counter = holder.grantedFeature?.(row.talentId) ?? null;
  const left = usesLeft(holder, row);
  if (!counter || left <= 0) return { held: false, reason: "noUses" };
  await counter.update({ "system.uses.value": left - 1 });
  return { held: true, heal: row.heal };
}

/* -------------------------------------------- */
/*  04's Borrowed Time (stage 2c)                */
/* -------------------------------------------- */

/**
 * Borrowed Time on a creature now, and why it may not be asked, off the world as this client
 * holds it: the talent at its rank (or Timeless Sentinel's free use), the fight, the Sand and
 * the Reaction (`rules/guardian.mjs#borrowedRefusal`).
 */
function borrowJudgement(holder, amount) {
  const sentinel = sentinelOf([...(holder?.effects ?? [])]);
  const held = holder?.type === "character" ? borrowedTimeOf(holder.takenTalents?.() ?? [], { sentinel: Boolean(sentinel) }, talentEffect) : null;
  const fight = holder?.activeFight?.() ?? null;
  const inFight = Boolean(fight?.started && fight.getCombatantsByActor?.(holder)?.length);
  const why = borrowedRefusal({ held, amount, inFight, sand: poolValue(holder, "sand"), reaction: held?.free ? true : reactionLeft(holder) });
  return { held, why };
}

/**
 * **04's BORROWED TIME, ASKED IN THE BLOW** (stage 2c: *As a Reaction when a blow reduces your
 * Health, spend 1 Sand. Take half its damage now, rounded up. At the start of your next turn,
 * take the other half minus your rank.*; Timeless Sentinel: *you may use Borrowed Time on each
 * blow without spending Sand or your Reaction*). Called by `AzerothActor#applyDamage` once
 * the blow's own mitigation, the move, the division, Dilation's split, the harm prevention,
 * temporary Health, Mana Shield and the floor have had their say (D-880: a blow they take
 * whole reduces no Health and is not asked), and before the hold at 1. The creature is asked through whoever
 * answers for it (`ask`, `BLOW_ASK_QUERY`), judged before it is asked and again after; a yes
 * answers the split and the row the damage door writes on the put-off list just before the
 * Health (D-866's carrier, landed at the turn's start by `effects/deferred-damage.mjs`).
 *
 * @param {{target: Actor, amount: number, type?: string|null, by?: Actor|null}} o
 * @returns {Promise<{borrowed: boolean, now?: number, later?: number, spared?: number, name?: string, free?: boolean, row?: object|null, reason?: string}>}
 */
export async function askToBorrow({ target, amount = 0, type = null, by = null } = {}) {
  if (!target) return { borrowed: false, reason: "unknown" };
  const first = borrowJudgement(target, amount);
  if (first.why) return { borrowed: false, reason: first.why };
  const answer = await ask(target, { act: "borrow", holderUuid: target.uuid, targetUuid: target.uuid, amount });
  if (!answer?.borrowed) return { borrowed: false, reason: answer?.reason ?? "declined" };
  const split = borrowedSplit(amount, { rank: first.held.rank });
  return {
    borrowed: true, now: split.now, later: split.later, spared: split.spared, name: first.held.name, free: answer.free === true,
    row: split.later > 0 ? { amount: split.later, type, by: by?.uuid ?? null, source: BORROWED_TIME } : null
  };
}

/**
 * Borrowed Time on the holder's own client: judged, asked, judged again, then the Reaction and
 * the Sand - **paid only while the asker still waits** (the stage 3 fix, the hardened pattern
 * Another Timeline keeps): the dialog closes inside `answerWindow(ASK_MS)` and a yes judged
 * past `answerInTime` pays nothing, so a late yes never spends Sand on a blow the asker has
 * already landed whole.
 */
async function borrowHere({ holder, amount }) {
  const started = Date.now();
  const first = borrowJudgement(holder, amount);
  if (first.why) return { borrowed: false, reason: first.why };
  const split = borrowedSplit(amount, { rank: first.held.rank });
  const yes = await confirmHere(holder, {
    title: first.held.name, ms: answerWindow(ASK_MS),
    text: game.i18n.format(first.held.free ? "AZEROTH.Guardian.AskBorrowFree" : "AZEROTH.Guardian.AskBorrow", {
      name: holder.name, n: amount, now: split.now, later: split.later, talent: first.held.name, cost: first.held.sand
    })
  });
  if (!yes) return { borrowed: false, reason: "declined" };
  const again = borrowJudgement(holder, amount);
  if (again.why) {
    ui.notifications?.warn(game.i18n.format(`AZEROTH.Guardian.BorrowRefuse.${again.why}`, { name: holder.name, talent: first.held.name }));
    return { borrowed: false, reason: again.why };
  }
  if (!answerInTime(started, Date.now(), ASK_MS)) return { borrowed: false, reason: "late" };
  if (!again.held.free) {
    if (!(await game.system.azeroth.workflows.spendTurnBudget(holder, "reaction"))) return { borrowed: false, reason: "reaction" };
    const pool = (holder.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === "sand") ?? null;
    if (pool) await holder.updatePool({ itemId: pool.itemId, kind: pool.kind, value: Math.max(0, pool.value - again.held.sand) });
  }
  return { borrowed: true, free: again.held.free === true };
}

/** A breath record as a query carries it (D-914): its three names as strings, or null. */
function breathRecord(b) {
  if (!b || typeof b !== "object") return null;
  const s = v => (typeof v === "string" ? v : null);
  return { title: s(b.title), featureKey: s(b.featureKey), spellName: s(b.spellName) };
}

/**
 * The handler a holder is asked through (`BLOW_ASK_QUERY`), on the client that
 * answers for the holder. The asker must own the creature STRUCK - it was their
 * client that wrote the blow. Throws with the reason, which travels back.
 */
export async function blowAskHandler(payload = {}, { user = null } = {}) {
  const holder = payload.holderUuid ? await fromUuid(payload.holderUuid) : null;
  const target = payload.targetUuid ? await fromUuid(payload.targetUuid) : null;
  if (holder?.documentName !== "Actor" || target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !target.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: target.name }));
  if (!holder.isOwner) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: holder.name }));
  const whole = v => Math.max(0, Math.trunc(Number(v)) || 0);
  if (payload.act === "move") {
    return moveHere({
      holder, target, kind: payload.kind, amount: whole(payload.amount), moved: whole(payload.moved), type: payload.type ?? null,
      attack: payload.attack === true, spell: payload.spell === true, messageId: payload.messageId ?? null,
      by: actorAt(payload.byUuid), location: payload.location ?? "body",
      feet: typeof payload.feet === "number" ? payload.feet : null, parts: Array.isArray(payload.parts) ? payload.parts : null,
      // The card's breath record (D-914): three names, nothing else trusted.
      breath: breathRecord(payload.breath),
      // Asked by ANOTHER client, which stops waiting at ASK_MS (`moveHere`).
       remote: Boolean(user?.id) && user.id !== game.user?.id
         && !(payload.awaitDelivery === true && user?.isGM && user.id === game.users?.activeGM?.id)
    });
  }
  if (payload.act === "hold") {
    return holdHere({
      holder, target, identifier: payload.identifier, before: whole(payload.before), amount: whole(payload.amount),
      attack: payload.attack === true, distance: typeof payload.distance === "number" ? payload.distance : null
    });
  }
  // 04's Borrowed Time (stage 2c): the creature struck is its own holder.
  if (payload.act === "borrow") {
    if (holder.uuid !== target.uuid) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: holder.name }));
    return borrowHere({ holder, amount: whole(payload.amount) });
  }
  throw new Error(`blowAsk: no such act ${JSON.stringify(payload.act ?? null)}`);
}

/* -------------------------------------------- */
/*  07's Aegis of the Light                     */
/* -------------------------------------------- */

/**
 * **07's FLOOR ON A CREATURE** (Aegis of the Light: *no target may be reduced
 * below 1 Health by any source*), held at the one damage door, free and asked of
 * nobody: the effect that carries it, and what is left of the blow. Its `held`
 * mark is written on the effect, which the talent's heal reads when it goes.
 *
 * @param {{target: Actor, before: number, amount: number}} o
 * @returns {Promise<{amount: number, held: {kind: "aegis", name: string}|null}>}
 */
export async function aegisFloor({ target, before = 0, amount = 0 } = {}) {
  // **EVERY FLOOR STANDING HOLDS IT, AND EACH IS MARKED** (the B3 review): the first
  // floor alone was read and marked, so 04's Big Bad Voodoo's aura floor laid first left
  // a later Aegis of the Light unmarked - no Critical Injury refusal, no heal at its end.
  const effects = (target?.effects ?? []).filter(e => e.active !== false && e.flags?.["azeroth-rpg"]?.[FLOOR_FLAG]);
  if (!effects.length) return { amount, held: null };
  const floors = floorsOf(effects.map(e => e.flags["azeroth-rpg"]));
  const saved = floorsHolding({ before, amount, floors });
  if (!saved.saved) return { amount, held: null };
  for (const f of floors) {
    const effect = effects[f.index];
    if (!saved.held.includes(f.index) || !effect) continue;
    // **EVERY CATCH IS WRITTEN ON THE FLOOR** (the Legacy branches' door 2): its count
    // rises with each blow it holds, so every client sees the catch as an update of the
    // effect and plays the floor's `hold` cue (`module/animation/records.mjs
    // #effectUpdateRecords`). Only the first catch was written before, as `held`.
    const caught = (Math.trunc(Number(effect.flags?.["azeroth-rpg"]?.[FLOOR_FLAG]?.caught)) || 0) + 1;
    await effect.update({
      ...(f.held ? {} : { [`flags.azeroth-rpg.${FLOOR_FLAG}.held`]: true }),
      [`flags.azeroth-rpg.${FLOOR_FLAG}.caught`]: caught
    });
  }
  const names = [...new Set(floors.map(f => f.name).filter(Boolean))];
  return { amount: saved.amount, held: { kind: "aegis", name: names.join(", ") } };
}

/**
 * **WHAT A FLOOR'S END GIVES THE CREATURE IT HELD** (04's Aegis of the Light: *A
 * creature held at 1 Health by it restores Health equal to your tier when the
 * spell ends*), on the client that deleted the effect - core's expiry at the
 * caster's turn's end, or a hand.
 */
export function registerBlowDoorHooks() {
  Hooks.on("deleteActiveEffect", (effect, options, userId) => {
    if (userId !== game.user.id) return;
    const floor = floorOf([effect?.flags?.["azeroth-rpg"] ?? {}]);
    const actor = effect?.parent;
    if (!floor?.held || actor?.documentName !== "Actor") return;
    // An aura's floor (04's Big Bad Voodoo; the Legacy branches' door 12) is no Aegis:
    // its end restores nothing.
    if (effect?.flags?.["azeroth-rpg"]?.aura) return;
    const caster = actorAt(floor.by);
    const heal = caster ? aegisHealFor(caster.takenTalents?.() ?? [], { tier: caster.system?.tier ?? 1 }) : null;
    if (!heal) return;
    actor.applyHealing(heal.amount, { from: caster, spell: true })
      .then(() => ui.notifications?.info(game.i18n.format("AZEROTH.AegisLight.Healed", { name: actor.name, n: heal.amount, talent: heal.name })))
      .catch(err => console.error("azeroth-rpg | aegis of the light", err));
  });
}
