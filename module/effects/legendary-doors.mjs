/**
 * **08 §20's LEGENDARY DOORS THAT REACH ANOTHER CREATURE** (D-912, Phase B2).
 *
 * What a Legendary does to a creature its bearer does not own goes through ONE
 * GM-side query (`LEGENDARY_QUERY`), its handler checking the asker owns the bearer
 * (core checks only `QUERY_USER`), and here where this client may write it - the
 * shape `effects/inflict.mjs` and `effects/no-healing.mjs` have always had:
 *
 * - **The arc** (Thunderfury, Magma Shot; the lead, on O-319: *"Automate the arc and
 *   the Fury"*): `landArcs`, the arc's damage through `strikeFromArea` (Ward applies,
 *   no attack) and its condition through the Inflict door.
 * - **What a press gathers itself** (Drain the Chamber, The Sunwell's Torrent):
 *   `gatherFor`, every other creature within N feet, ally or enemy, by a condition
 *   it carries or a Sustain it holds (`canvas/engaged.mjs#creaturesWithin`).
 * - **Health lost and Health given back** (Drain the Chamber, Pylon Tether,
 *   Staghelm's Regret): `loseHealthOn`, `restoreHealthOn`.
 * - **The tether** (Pylon Tether): `landTethers`, at the Warlock's own turn start.
 * - **The Health each creature had as its turn began** (Staghelm's Regret): kept on
 *   its combatant by `recordTurnStartHealth`, read by `rewindOf`.
 */

import { AZEROTH } from "../config.mjs";
import { arcPicks, legendaryAskTrusted } from "../rules/signatures.mjs";
import { creaturesWithin } from "../canvas/engaged.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { inflictCondition } from "./inflict.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { conditionValues } from "./conditions.mjs";

/** The one query every Legendary write on another creature goes through. */
export const LEGENDARY_QUERY = "azeroth-rpg.legendaryDoor";

/** The actor flag Pylon Tether rides on the Warlock. */
export const TETHER_FLAG = "pylonTether";

/** The actor flag Thunderaan's Fury arms the next arc with. */
export const ARC_WIDEN_FLAG = "arcWiden";

/** The actor flag Brood Breath arms the next Breath's school with. */
export const BREATH_SCHOOL_FLAG = "breathSchool";

/** The combatant flag the Health at a turn's start rides (Staghelm's Regret). */
export const TURN_HEALTH_FLAG = "turnStartHealth";

/** A document by uuid, quietly. */
function docAt(uuid) {
  if (typeof uuid !== "string" || !uuid) return null;
  try { return fromUuidSync(uuid); } catch { return null; }
}

/** Do the act here, on a client that may write the victim. */
async function actHere({ act, victim, bearer, amount = 0, type = null, name = "", condition = null }) {
  if (!victim) return { ok: false, reason: "gone" };
  if (act === "strike") {
    const lines = await strikeFromArea({ actor: victim, caster: bearer, spell: { name, item: true }, damage: { rating: amount, school: type } });
    if (condition?.id) {
      const landed = await inflictCondition({ victim, id: condition.id, value: condition.value ?? null, by: bearer, name: victim.name, until: condition.until ?? null });
      if (landed?.landed) lines.push(game.i18n.format("AZEROTH.Signature.ArcCondition", { name: victim.name, condition: game.i18n.localize(AZEROTH.conditions[condition.id] ?? condition.id) }));
    }
    return { ok: true, lines };
  }
  if (act === "loseHealth") {
    const before = victim.system?.health?.value ?? 0;
    await victim.loseHealth(Math.max(0, Math.trunc(Number(amount)) || 0));
    return { ok: true, lost: Math.max(0, before - (victim.system?.health?.value ?? 0)) };
  }
  if (act === "restoreHealth") {
    const to = Math.min(victim.system?.health?.max ?? 0, Math.max(0, Math.trunc(Number(amount)) || 0));
    await victim.update({ "system.health.value": to });
    if (to > 0) await victim.standUp?.();
    return { ok: true, to };
  }
  return { ok: false, reason: "unknown" };
}

/**
 * **WHAT THE BEARER'S OWN ITEMS JUSTIFY, RE-DERIVED ON THE GM'S CLIENT** (D-913, F13): a
 * request names an act and a number, and the GM's client trusts neither. Each act must be
 * one an equipped item of the bearer holds, and its number is capped at what that item
 * (or the record it laid) says - never a free-form figure off the request.
 *
 * - `strike`: an arc row on an equipped item (`legendaryArcRows`) of that type, the damage
 *   at most its own, the condition its own or none;
 * - `loseHealth`: the bearer's tether on this demon (its `loss`), or a Drain press held,
 *   the amount at most the victim's own condition value;
 * - `restoreHealth`: a rewind press held, the victim at 0, the amount the GM's own reading
 *   of the victim's turn-start Health (`rewindOf`);
 * - `roundMark`: the bearer's own once-a-round mark, for a Signature that counts one.
 *
 * @returns {object}  the payload to act on
 */
export function justifiedAct(payload = {}, { bearer, victim, askerOwnsBearer = true, card = null }) {
  const refuse = () => { throw new Error(game.i18n.format("AZEROTH.Signature.QueryRefused", { name: bearer?.name ?? "" })); };
  const pressesHeld = () => (bearer?.items ?? []).filter(i => i.system?.equipped === true)
    .flatMap(i => Object.values(i.system?.signatureEffect?.presses ?? {}));
  const n = v => Math.max(0, Math.trunc(Number(v)) || 0);
  if (payload.act === "strike") {
    const rows = legendaryArcRows(bearer).filter(r => (r.damage?.type ?? null) === (payload.type ?? null));
    if (!rows.length) refuse();
    const cap = Math.max(...rows.map(r => n(r.damage?.amount)));
    const conditionOk = !payload.condition?.id || rows.some(r => r.condition?.id === payload.condition.id);
    if (!conditionOk) refuse();
    return { ...payload, amount: Math.min(n(payload.amount), cap) };
  }
  if (payload.act === "loseHealth") {
    const tether = bearer?.getFlag?.("azeroth-rpg", TETHER_FLAG) ?? null;
    if (tether?.target === victim?.uuid) return { ...payload, amount: Math.min(n(payload.amount), n(tether.loss)) };
    const drain = pressesHeld().find(p => typeof p?.drain === "string" && p.drain);
    if (!drain) refuse();
    return { ...payload, amount: Math.min(n(payload.amount), conditionValueOf(victim, drain.drain)) };
  }
  if (payload.act === "restoreHealth") {
    if (!pressesHeld().some(p => p?.rewind === true)) refuse();
    if ((victim?.system?.health?.value ?? 0) > 0) refuse();
    const to = rewindOf(victim);
    if (!(to > 0)) refuse();
    return { ...payload, amount: to };
  }
  if (payload.act === "roundMark") {
    const effects = bearer?.system?.signatureEffects ?? {};
    if (!(effects.spellDamageTest ?? []).length && !(effects.resistBane ?? []).length) refuse();
    // An asker who does not own the bearer must point at the spell card the mark answers
    // (D-914): spoken by the bearer, of a school its row names, the row's own key.
    const flags = card?.flags?.["azeroth-rpg"] ?? {};
    const trusted = legendaryAskTrusted("roundMark", {
      askerOwnsBearer, key: payload.key ?? "",
      cardByBearer: Boolean(card) && ChatMessage.getSpeakerActor(card.speaker)?.uuid === bearer?.uuid && flags.kind === "spell",
      cardSchool: flags.tickSpell?.school ?? null, rows: effects.spellDamageTest ?? []
    });
    if (!trusted) refuse();
    return payload;
  }
  // Fel-touched (Greater)'s Test on a kill: only the occasion it names, re-read off the
  // killer's own wielded weapons on this client - and, asked by a client that does not
  // own the killer, only over a creature at 0 Health, once a creature (D-914).
  if (payload.act === "traitExposure") {
    if (payload.occasion !== "kill" || !(bearer?.traitExposuresFor?.("kill") ?? []).length) refuse();
    const marked = (victim?.getFlag?.("azeroth-rpg", KILL_TESTED_FLAG) ?? []).includes(bearer?.uuid);
    if (!legendaryAskTrusted("traitExposure", { askerOwnsBearer, victimHealth: victim?.system?.health?.value ?? null, marked })) refuse();
    return payload;
  }
  refuse();
}

/** The flag on a creature killed naming the killers whose kill Test was asked over it (D-914). */
export const KILL_TESTED_FLAG = "killTested";

/**
 * **A TRAIT'S CORRUPTION TEST FOR A CREATURE THIS CLIENT DOES NOT OWN** (08 §5's
 * Fel-touched (Greater): *each time you kill*; D-913, the review's LOW): asked of the GM,
 * whose client re-reads the killer's weapons and makes each Test through the exposure
 * door. With no GM online it is said in words, never skipped in silence.
 *
 * @param {Actor} bearer
 * @param {string} occasion
 */
export async function askTraitExposure(bearer, occasion, victim = null) {
  const gm = game.users?.activeGM ?? null;
  if (!gm) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Signature.KillerNotYours", { name: bearer?.name ?? "", source: occasion }));
    return { ok: false };
  }
  try {
    return await gm.query(LEGENDARY_QUERY, { act: "traitExposure", bearerUuid: bearer.uuid, victimUuid: victim?.uuid ?? null, occasion }, { timeout: 30000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { ok: false };
  }
}

/** The killer's trait Tests, on the GM's client (D-913). */
async function traitExposureHere(bearer, occasion) {
  let made = 0;
  for (const row of bearer.traitExposuresFor?.(occasion) ?? []) {
    await game.system.azeroth.workflows.corruptionExposure({ actor: bearer, track: row.track, dc: row.dc, resilience: row.resilience, points: row.amount, occasion: "gear" });
    made++;
  }
  return { ok: true, made };
}

/** The arc rows an actor's equipped items carry: the trunk's and every branch's `onHit` with an arc. */
export function legendaryArcRows(actor) {
  const out = [];
  for (const item of actor?.items ?? []) {
    if (item.system?.equipped !== true) continue;
    const sig = item.system?.signatureEffect ?? null;
    for (const part of [sig, ...(sig?.gated ?? [])]) {
      const on = part?.onHit ?? null;
      if (on?.arc && (on.arc.targets || on.arc.all === true)) out.push(on);
    }
  }
  return out;
}

/** The GM-side handler. Throws with the reason. */
export async function legendaryQueryHandler(payload = {}, { user = null } = {}) {
  const bearer = docAt(payload.bearerUuid);
  const own = payload.act === "roundMark" || payload.act === "traitExposure";
  const victim = payload.act === "roundMark" ? bearer : docAt(payload.victimUuid);
  if (bearer?.documentName !== "Actor" || victim?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  // A once-a-round mark and a killer's trait Test are the bearer's own bookkeeping, asked
  // by whoever pressed the card or wrote the blow; every other act needs the asker to own
  // the bearer. The two are trusted only as far as `justifiedAct` re-derives them (D-914).
  const askerOwnsBearer = !user || user.isGM || bearer.testUserPermission(user, "OWNER");
  if (!own && !askerOwnsBearer) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: bearer.name }));
  }
  const card = payload.messageId ? (game.messages?.get(payload.messageId) ?? null) : null;
  const act = justifiedAct(payload, { bearer, victim, askerOwnsBearer, card });
  if (act.act === "roundMark") return markRoundHere(bearer, act.key);
  if (act.act === "traitExposure") {
    // Once a creature: the killer is named on the creature killed before its Test is made.
    if (!askerOwnsBearer) await victim.setFlag("azeroth-rpg", KILL_TESTED_FLAG, [...(victim.getFlag("azeroth-rpg", KILL_TESTED_FLAG) ?? []), bearer.uuid]);
    return traitExposureHere(bearer, act.occasion);
  }
  return actHere({ ...act, victim, bearer });
}

/** The bearer's once-a-round mark, on its own combatant (D-913). */
async function markRoundHere(bearer, key) {
  const fight = bearer?.activeFight?.() ?? null;
  const mine = fight?.getCombatantsByActor?.(bearer)?.[0] ?? null;
  if (!mine || typeof key !== "string" || !key) return { added: true };
  return mine.markRoundOnce(key);
}

/**
 * **A ONCE-A-ROUND MARK ON A CREATURE THIS CLIENT MAY NOT WRITE** (D-913, the review's LOW):
 * here where it owns the combatant, else through the GM's query - never in silence.
 * Out of a fight there is no round, and the mark answers `added`.
 *
 * @param {Actor} bearer
 * @param {string} key
 * @returns {Promise<{added: boolean}>}
 */
export async function markRoundFor(bearer, key, { messageId = null } = {}) {
  const fight = bearer?.activeFight?.() ?? null;
  const mine = fight?.getCombatantsByActor?.(bearer)?.[0] ?? null;
  if (!mine) return { added: true };
  if (mine.isOwner) return mine.markRoundOnce(key);
  const gm = game.users?.activeGM ?? null;
  if (!gm) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Signature.RoundMarkNoGM", { name: bearer.name }));
    return { added: false };
  }
  try {
    return await gm.query(LEGENDARY_QUERY, { act: "roundMark", bearerUuid: bearer.uuid, key, messageId }, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { added: false };
  }
}

/**
 * Do an act on a creature: here where this client may write it, else on the active
 * GM's client. A refusal is answered rather than thrown, so a card can say it.
 */
export async function legendaryAct({ act, victim, bearer, amount = 0, type = null, name = "", condition = null }) {
  if (!victim || !bearer) return { ok: false, reason: "gone" };
  // The same caps the GM's client holds a request to (F13), here too.
  if (victim.isOwner) {
    let held;
    try { held = justifiedAct({ act, amount, type, condition }, { bearer, victim }); } catch (err) { return { ok: false, reason: "refused" }; }
    return actHere({ ...held, act, victim, bearer, name });
  }
  const gm = game.users?.activeGM ?? null;
  if (gmAbsentFor({ owned: [victim.isOwner], isGM: game.user?.isGM === true, gmActive: Boolean(gm) })) return { ok: false, reason: "noGM" };
  try {
    return await gm.query(LEGENDARY_QUERY, {
      act, bearerUuid: bearer.uuid, victimUuid: victim.uuid, amount, type, name, condition
    }, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { ok: false, reason: "error" };
  }
}

/* -------------------------------------------- */
/*  The arc                                      */
/* -------------------------------------------- */

/**
 * **THE ARC, LANDED** (Thunderfury: *On a hit, the attack arcs to one other creature
 * within 15 feet for 3 Nature damage, and that creature is Slowed until the end of its
 * next turn*; Magma Shot: *every other creature within 5 feet of the target takes 3
 * Fire damage, and Ward applies*; D-912). For each fired arc row: the creatures
 * `arcPicks` chooses around the creature struck, the damage through `strikeFromArea`
 * (Ward applies; no attack), the condition through the Inflict door. Thunderaan's Fury
 * armed (`ARC_WIDEN_FLAG`) widens the first arc to its count and is spent. A blow whose
 * creature has no token on the viewed scene arcs to nobody, said in words.
 *
 * @param {{actor: Actor, rows: object[], struck: object|null}} o
 * @returns {Promise<string[]>}  the lines for each row, by the row's name
 */
export async function landArcs({ actor, rows = [], struck = null } = {}) {
  const lines = [];
  if (!rows.length) return lines;
  const scene = struck?.sceneId ? game.scenes?.get(struck.sceneId) : null;
  const doc = scene?.tokens?.get(struck?.tokenId) ?? null;
  const from = doc?.object ?? null;
  for (const row of rows) {
    if (!from) { lines.push(game.i18n.format("AZEROTH.Signature.ArcNoBoard", { source: row.name })); continue; }
    let arc = row.arc;
    // **THUNDERAAN'S FURY WIDENS ITS OWN BLADE'S ARC** (D-913): the arming names the item
    // that pressed it, and only that item's arc spends it - never Magma Shot's. An arming
    // from another encounter is stale and is struck (a Short Rest strikes it too,
    // `AzerothActor#resetUses`).
    const widen = actor.getFlag?.("azeroth-rpg", ARC_WIDEN_FLAG) ?? null;
    if (widen && widenStale(widen, actor) && actor.isOwner) await actor.unsetFlag("azeroth-rpg", ARC_WIDEN_FLAG);
    else if (widen?.targets && !arc.all && widenFits(widen, row) && actor.isOwner) {
      arc = { ...arc, targets: widen.targets };
      await actor.unsetFlag("azeroth-rpg", ARC_WIDEN_FLAG);
      lines.push(game.i18n.format("AZEROTH.Signature.ArcWidened", { source: widen.source ?? "", n: widen.targets }));
    }
    const all = creaturesWithin(actor, arc.feet ?? 0, { from, who: "creature", except: [doc.id] });
    const enemies = new Set(creaturesWithin(actor, arc.feet ?? 0, { from, who: "enemy", except: [doc.id] }).map(c => c.token.id));
    const mine = actor.getActiveTokens?.(true)?.[0]?.id ?? null;
    const picks = arcPicks(all.map(c => ({ id: c.token.id, feet: c.feet, enemy: enemies.has(c.token.id), self: c.token.id === mine })), arc);
    if (!picks.length) { lines.push(game.i18n.format("AZEROTH.Signature.ArcNobody", { source: row.name })); continue; }
    for (const id of picks) {
      const victim = all.find(c => c.token.id === id)?.actor ?? null;
      const done = await legendaryAct({ act: "strike", victim, bearer: actor, amount: row.arcDamage?.amount ?? 0, type: row.arcDamage?.type ?? null, name: row.name, condition: row.arcCondition ?? null });
      lines.push(...(done?.lines ?? [game.i18n.format("AZEROTH.Signature.ArcNotLanded", { source: row.name, name: victim?.name ?? "" })]));
    }
  }
  return lines;
}

/** Whether an arming of the Fury belongs to this arc: the item that armed it (D-913). */
export function widenFits(widen, row) {
  if (!widen) return false;
  if (widen.itemId && row?.itemId) return widen.itemId === row.itemId;
  return Boolean(widen.item) && widen.item === row?.name;
}

/** Whether an arming outlived its encounter (D-913): armed in a fight that is not this one. */
export function widenStale(widen, actor) {
  if (!widen?.combatId) return false;
  return widen.combatId !== (actor?.activeFight?.()?.id ?? null);
}

/* -------------------------------------------- */
/*  What a press gathers                         */
/* -------------------------------------------- */

/**
 * **EVERY OTHER CREATURE WITHIN N FEET, ALLY OR ENEMY** (Drain the Chamber: *every
 * other Bleeding creature within 30 feet of you*; The Sunwell's Torrent: *every other
 * creature within 10 feet of you that is sustaining a spell*; the lead: *"No"* to
 * leaving allies out): the creatures measured off the bearer's own token, the bearer
 * left out, filtered by a condition carried or a Sustain held. Null where the bearer
 * has no token on the viewed board - nothing was measured.
 *
 * @param {Actor} actor
 * @param {{feet?: number, condition?: string|null, sustaining?: boolean}} gather
 * @returns {Actor[]|null}
 */
export function gatherFor(actor, { feet = 0, condition = null, sustaining = false } = {}) {
  const own = actor?.getActiveTokens?.(true)?.[0] ?? null;
  if (!own) return null;
  return creaturesWithin(actor, feet, { from: own, who: "creature", except: [own.id] })
    .map(c => c.actor)
    .filter(a => a && a.uuid !== actor.uuid)
    .filter(a => !condition || a.statuses?.has?.(condition))
    .filter(a => !sustaining || (a.getFlag?.("azeroth-rpg", "sustaining") ?? []).length > 0);
}

/**
 * The value a creature's condition carries (A1's Bleeding X), 0 where none: the system's
 * one reading, summed over every effect that carries it (`conditionValues`; D-913, F5 -
 * the first effect alone undercounted a creature bleeding from two sources).
 */
export function conditionValueOf(actor, id) {
  if (!actor) return 0;
  return Math.max(0, Math.trunc(Number(conditionValues(actor)?.[id])) || 0);
}

/* -------------------------------------------- */
/*  The tether and the turn's Health             */
/* -------------------------------------------- */

/**
 * **PYLON TETHER, AT THE WARLOCK'S TURN START** (D-912: *At the start of each of the
 * Warlock's turns until the end of the encounter, or until the demon is more than 60
 * feet from the Warlock, the demon loses 2 Health and the Warlock regains 2 Mana*): on
 * the active GM's client, from `AzerothCombat#_onStartTurn`. A tether laid in another
 * fight, or on a demon gone or out of reach, is lifted and said.
 *
 * @param {Combatant} combatant  the Warlock's
 * @returns {Promise<string[]>}
 */
export async function landTethers(combatant) {
  const actor = combatant?.actor ?? null;
  const tether = actor?.getFlag?.("azeroth-rpg", TETHER_FLAG) ?? null;
  if (!tether) return [];
  const demon = docAt(tether.target);
  const fight = combatant.combat ?? null;
  const own = actor.getActiveTokens?.(true)?.[0] ?? null;
  const theirs = demon?.getActiveTokens?.(true)?.[0] ?? null;
  const feet = own && theirs ? feetApart(own.document, theirs.document) : null;
  if (!demon || tether.combatId !== fight?.id || feet === null || feet > (tether.feet ?? 60) || (demon.system?.health?.value ?? 0) <= 0) {
    await actor.unsetFlag("azeroth-rpg", TETHER_FLAG);
    return [game.i18n.format("AZEROTH.Signature.TetherEnds", { name: actor.name, source: tether.source ?? "" })];
  }
  const lost = await legendaryAct({ act: "loseHealth", victim: demon, bearer: actor, amount: tether.loss ?? 2 });
  const pool = (actor.poolSnapshot?.() ?? []).find(p => p.name === "mana") ?? null;
  if (pool && (tether.mana ?? 0) > 0) await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: Math.min(pool.max, pool.value + tether.mana) });
  return [game.i18n.format("AZEROTH.Signature.TetherLands", { demon: demon.name, n: lost?.lost ?? 0, name: actor.name, mana: pool ? tether.mana : 0, source: tether.source ?? "" })];
}

/**
 * **THE HEALTH A CREATURE HAD AS ITS TURN BEGAN** (Staghelm's Regret, D-912), kept on
 * its combatant (a `turn-stamp.mjs#BOOKKEEPING_FLAGS` key), through the combatant's
 * own queued door. Written only where a Signature anywhere in the fight could read it,
 * so a fight with no Scepter writes nothing.
 *
 * @param {Combatant} combatant
 */
export async function recordTurnStartHealth(combatant) {
  const actor = combatant?.actor ?? null;
  if (!actor || !combatant.isOwner) return;
  const anyone = (combatant.combat?.combatants ?? []).some(c => Object.values(c.actor?.items?.contents ?? [])
    .some(i => i.system?.equipped === true && Object.values(i.system?.signatureEffect?.presses ?? {}).some(p => p?.rewind === true)));
  if (!anyone) return;
  await combatant.markTurnStartHealth?.(actor.system?.health?.value ?? 0);
}

/** The Health a creature had at the start of its last turn in its fight, or null (D-912). */
export function rewindOf(actor) {
  const fight = actor?.activeFight?.() ?? null;
  const mine = fight?.getCombatantsByActor?.(actor)?.[0] ?? null;
  const held = mine?.getFlag?.("azeroth-rpg", TURN_HEALTH_FLAG) ?? null;
  return Number.isFinite(Number(held)) && held !== null ? Math.trunc(Number(held)) : null;
}
