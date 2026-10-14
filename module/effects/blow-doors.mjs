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
  ASKED_HOLDS, FLOOR_FLAG, divideEvenly, floorOf, heldAt, holdJudgement, moveJudgement, movedAmount, movedParts, wouldDrop
} from "../rules/blow-doors.mjs";
import {
  RIGHTEOUS, SPIRIT_LINK_FLAG, aegisHealFor, guardianFor, holdRowsFor, righteousReach, spiritLinkFor
} from "../rules/class-talents.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { wardsOn } from "./wards.mjs";
import { bondOf } from "../documents/bound.mjs";

/** The query a holder is asked through, on whoever answers for it. */
export const BLOW_ASK_QUERY = "azeroth-rpg.blowAsk";

/** The query a share of a divided blow lands through, on the active GM. */
export const BLOW_SHARE_QUERY = "azeroth-rpg.blowShare";

/** How long the asker waits, and how long the dialog stays open: the second is shorter, so a late answer is never a yes. */
const ASK_MS = 30000;
const ANSWER_MS = 25000;

/** The feet the widest move reaches: Guardian's 10 at rank 2, Guardian of the Weak's 20. */
const MOVE_SEARCH_FEET = 20;

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
 * before the asker stops waiting.
 *
 * @param {Actor} holder
 * @param {{title: string, text: string}} o
 * @returns {Promise<boolean>}
 */
async function confirmHere(holder, { title, text }) {
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
  const late = new Promise(resolve => { timer = setTimeout(() => resolve("late"), ANSWER_MS); });
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
  const guardian = guardianFor(talents);
  if (guardian) out.push(guardian);
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
 * **A BLOW TAKEN ONTO SOMEBODY ELSE** (04's Guardian; 02's Shield of the
 * Righteous with Guardian of the Weak; D-777). Each ally in reach who could take
 * it is asked in turn; the first yes takes it.
 *
 * @param {{target: Actor, amount: number, type?: string|null, attack?: boolean, spell?: boolean,
 *   messageId?: string|null, by?: Actor|null, location?: string, parts?: Array|null}} blow
 * @returns {Promise<{moved: boolean, to?: Actor, amount?: number, name?: string}>}
 */
export async function redirectBlow({ target, amount = 0, type = null, attack = false, spell = false, messageId = null, by = null, location = "body", parts = null } = {}) {
  if (!target || !(amount > 0) || !messageId) return { moved: false };
  const origin = tokenOf(target);
  if (!origin) return { moved: false };
  const near = creaturesWithin(target, MOVE_SEARCH_FEET, { who: "ally", except: [origin.id] });
  for (const { actor: holder, feet } of near) {
    if (!holder || holder.uuid === target.uuid) continue;
    for (const row of movesOf(holder)) {
      const judged = moveJudgement(row, {
        attack, spell, amount, self: false, friendly: true, distance: feet,
        poolValue: poolValue(holder, row.cost?.pool), reactionLeft: reactionLeft(holder), holderUp: standing(holder), fromCard: true
      });
      if (!judged.ok) continue;
      const moved = movedAmount({ kind: row.kind, amount, type, ward: RIGHTEOUS.ward, schools: Object.keys(AZEROTH.schools) });
      const answer = await ask(holder, {
        act: "move", kind: row.kind, holderUuid: holder.uuid, targetUuid: target.uuid, amount, moved, type,
        attack: attack === true, spell: spell === true, messageId, byUuid: by?.uuid ?? null, location, feet, parts
      });
      if (answer?.moved) {
        ui.notifications?.info(game.i18n.format("AZEROTH.BlowDoor.Moved", { holder: holder.name, name: target.name, talent: row.name, n: answer.amount ?? moved }));
        return { moved: true, to: holder, amount: answer.amount ?? moved, name: row.name };
      }
    }
  }
  return { moved: false };
}

/**
 * The move on the holder's own client: judged again, asked, paid, and taken.
 * `remote` where another client asked through `BLOW_ASK_QUERY` and is waiting on
 * the answer (`blowAskHandler`).
 */
async function moveHere({ holder, target, kind, amount, moved, type, attack, spell, messageId, by, location, feet, parts, remote = false }) {
  const row = movesOf(holder).find(r => r.kind === kind) ?? null;
  if (!row) return { moved: false, reason: "unknown" };
  const judge = () => moveJudgement(row, {
    attack, spell, amount, self: holder.uuid === target.uuid, friendly: true, distance: feet,
    poolValue: poolValue(holder, row.cost?.pool), reactionLeft: reactionLeft(holder), holderUp: standing(holder), fromCard: Boolean(messageId)
  });
  const first = judge();
  if (!first.ok) return { moved: false, reason: first.reason };
  const yes = await confirmHere(holder, {
    title: row.name,
    text: game.i18n.format(kind === "righteous" ? "AZEROTH.BlowDoor.AskRighteous" : "AZEROTH.BlowDoor.AskGuardian", {
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
  if (!(await game.system.azeroth.workflows.spendTurnBudget(holder, "reaction"))) return { moved: false, reason: "noReaction" };
  const pool = (holder.poolSnapshot?.() ?? []).find(p => p.name === row.cost?.pool) ?? null;
  const price = Math.max(0, Math.trunc(Number(row.cost?.amount)) || 0);
  if (pool && price > 0) await holder.updatePool({ itemId: pool.itemId, kind: pool.kind, value: Math.max(0, pool.value - price) });
  // The holder takes it through its own door: its standing reduction, its
  // temporary Health and its own holds - and never a second move or a division.
  // Its second amounts go with it, but not what the struck creature's Ward took
  // off them: the holder's Ward never met this blow (`movedParts`).
  const landing = holder.applyDamage(moved, { struck: true, attack, spell, location, type, messageId, by, moved: true, parts: movedParts(parts) });
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
  return { moved: true, amount: moved };
}

/* -------------------------------------------- */
/*  The division (O-155)                        */
/* -------------------------------------------- */

/** Whether an actor is a totem bound to somebody (the link's own anchor is no target). */
const isTotem = actor => bondOf(actor)?.kind === "totem";

/**
 * **WHAT A LINKED ALLY TAKES, DIVIDED** (04's Spirit Link Totem; D-777): the
 * first link whose totem still stands and holds this creature within its feet,
 * and the shares - the creature struck first, keeping the remainder. Null where
 * no link reaches it, where it is alone in it, or where a share would land on a
 * creature this client does not own with no GM online (said in words).
 *
 * @param {{target: Actor, amount: number}} o
 * @returns {{name: string, keep: number, others: Array<{actor: Actor, share: number}>}|null}
 */
export function divideBlow({ target, amount = 0 } = {}) {
  if (!target || !(amount > 0)) return null;
  const board = globalThis.canvas;
  if (!board?.tokens || !tokenOf(target)) return null;
  const seen = new Set();
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
    if (gmAbsentFor({ owned: plan.others.map(o => o.actor.isOwner), isGM: game.user.isGM, gmActive: Boolean(game.users?.activeGM) })) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.BlowDoor.LinkNoGM", { name: target.name, talent: row.name }));
      return null;
    }
    return plan;
  }
  return null;
}

/**
 * Land the other shares of a divided blow: each through the creature's own door
 * as damage taken - no attack, no second division and no move - here where this
 * client may write it, else on the GM's client.
 *
 * @param {{target: Actor, plan: object, type?: string|null, by?: Actor|null, parts?: Array|null}} o
 */
export async function landShares({ target, plan, type = null, by = null } = {}) {
  const said = [];
  for (const { actor, share } of plan?.others ?? []) {
    if (!(share > 0)) continue;
    try {
      if (actor.isOwner) await actor.applyDamage(share, { struck: true, attack: false, location: "body", type, by, shared: true });
      else {
        await game.users.activeGM.query(BLOW_SHARE_QUERY, { victimUuid: actor.uuid, strikerUuid: target.uuid, amount: share, type, byUuid: by?.uuid ?? null }, { timeout: 15000 });
      }
      said.push(game.i18n.format("AZEROTH.BlowDoor.Share", { name: actor.name, n: share }));
    } catch (err) {
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
export async function blowShareQueryHandler({ victimUuid = null, strikerUuid = null, amount = 0, type = null, byUuid = null } = {}, { user = null } = {}) {
  const victim = victimUuid ? await fromUuid(victimUuid) : null;
  const struck = strikerUuid ? await fromUuid(strikerUuid) : null;
  if (victim?.documentName !== "Actor" || struck?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !struck.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: struck.name }));
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (n > 0) await victim.applyDamage(n, { struck: true, attack: false, location: "body", type: type ?? null, by: actorAt(byUuid), shared: true });
  return { landed: n };
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
      // Asked by ANOTHER client, which stops waiting at ASK_MS (`moveHere`).
      remote: Boolean(user?.id) && user.id !== game.user?.id
    });
  }
  if (payload.act === "hold") {
    return holdHere({
      holder, target, identifier: payload.identifier, before: whole(payload.before), amount: whole(payload.amount),
      attack: payload.attack === true, distance: typeof payload.distance === "number" ? payload.distance : null
    });
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
  const effect = (target?.effects ?? []).find(e => e.active !== false && e.flags?.["azeroth-rpg"]?.[FLOOR_FLAG]) ?? null;
  if (!effect) return { amount, held: null };
  const floor = floorOf([effect.flags["azeroth-rpg"]]);
  const saved = heldAt({ before, amount, stay: floor.stay });
  if (!saved.saved) return { amount, held: null };
  if (!floor.held) await effect.update({ [`flags.azeroth-rpg.${FLOOR_FLAG}.held`]: true });
  return { amount: saved.amount, held: { kind: "aegis", name: floor.name } };
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
    const caster = actorAt(floor.by);
    const heal = caster ? aegisHealFor(caster.takenTalents?.() ?? [], { tier: caster.system?.tier ?? 1 }) : null;
    if (!heal) return;
    actor.applyHealing(heal.amount, { from: caster, spell: true })
      .then(() => ui.notifications?.info(game.i18n.format("AZEROTH.AegisLight.Healed", { name: actor.name, n: heal.amount, talent: heal.name })))
      .catch(err => console.error("azeroth-rpg | aegis of the light", err));
  });
}
