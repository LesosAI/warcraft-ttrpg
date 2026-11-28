/**
 * **THE TOME OF SILVER AND ASH AND STUDIED, AS DOORS** (02 §7; the Witch Hunter plan's wave 2a-A). The law is
 * `rules/tome.mjs` and `rules/witch-hunter-standing.mjs`; this module is the ONE writer of the Tome's flag
 * (`TOME_FLAG`) and the one reader the other doors ask:
 *
 * - **What the Tome knows and what is Studied now** (`tomeFor`, `tomeFactsFor`), The Last Hunt included.
 * - **The Tome begun** (`startTome`): *Undead, and one of your choice*, through the one chooser.
 * - **What a weapon attack gains against each target** (`witchHunterBlow`, asked once by `rollTest` before its
 *   mitigation): the Tome's Armor Point and Ward, Studied's damage and Tempo, the oils and the Construct Decoction.
 * - **The record of types damaged** (`recordBlow`, from `effects/after-blow.mjs`, the one door every struck blow
 *   reaches) and **of types defeated** (`onDeath` of the death watch, the ONE observer; no baseline of its own).
 * - **The learning Test** (`learnTypeWithDialog`): an **Investigation** Test, Hard at the tier, once per Long Rest,
 *   through the roll dialog; and `learnType` for Read the Trail's GM-only button (wave 2a-B).
 * - **What the Resist roll reads** (`resistLinesFor`): the weakness Bane a card carries and Studied's Boon.
 * - (The Tempo The Last Hunt's end leaves is clipped by `witch-hunter-features.mjs#clipTempoAfterHunt`, the one clip;
 *   wave 2c deleted the second copy that stood here and read the already-clamped value.)
 *
 * A write on a character this client does not own goes through `WH_TOME_QUERY` on the active GM, with
 * `gm-writes.mjs#gmAbsentFor` asked first (D-774).
 */

import { AZEROTH } from "../config.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { CREATURE_TYPES, FIELD_NOTES, TOME, TOME_SKILL, cleanType, typeOf } from "../rules/tome.mjs";
import {
  OIL_FLAG, TOME_FLAG, WITCH_HUNTER_CLASS, actingBrews, brewStanding, cleanTome, lastHuntStands, learnJudgement, mergeTome, oilStands,
  studiedBoonOn, studiedNow, tomeFacts, tomeFlagOf, tomeStart, wardAfterPierce, weaknessBaneOn, weaknessRecord, witchHunterBlowFor,
  WEAKNESS_CARD_FLAG, weaknessRecordOnCard
} from "../rules/witch-hunter-standing.mjs";
import { writeQueue } from "../rules/write-queue.mjs";
import { creatureSnapshot, kindsOf } from "../rules/creature-kinds.mjs";
import { skillRowsFor } from "../rules/skills.mjs";
// 04's Unbowed and Mountain Bear (the Witch Hunter plan's wave 2b).
import { MOUNTAIN_BEAR, MOUNTAIN_BEAR_FLAG, UNBOWED, mountainBearDamage, unbowedBoons, whRankOfItems } from "../rules/witch-hunter-talents.mjs";

/** The query a write on another client's character is asked through (`module/queries.mjs`). */
export const WH_TOME_QUERY = "azeroth-rpg.witchHunterTome";

const SCOPE = "azeroth-rpg";
const int = v => Math.trunc(Number(v)) || 0;
const values = c => [...(c?.values?.() ?? c ?? [])];
const t = (key, data = {}) => globalThis.game?.i18n?.format?.(key, data) ?? key;
const tierOf = actor => Math.min(4, Math.max(1, int(actor?.system?.tier) || 1));

/** Whether an actor is a Witch Hunter (holds the class). */
export function isWitchHunter(actor) {
  return actor?.type === "character" && Boolean(actor.items?.some?.(i => i.type === "class" && (i.system?.identifier === WITCH_HUNTER_CLASS || i.name === "Witch Hunter")));
}

/** A type word in the reader's language. */
export function typeLabel(type) {
  const key = AZEROTH.creatureTypes?.[type];
  return key ? (globalThis.game?.i18n?.localize?.(key) ?? type) : String(type ?? "");
}

/** The people a character belongs to, by name, for `typeOf`. */
function raceOf(actor) {
  return actor?.type === "character" ? (actor.items?.find?.(i => i.type === "race")?.name ?? null) : null;
}

/** The 14 §1 type of an actor, through the one reader (`tome.mjs#typeOf`). */
export function typeOfActor(actor) {
  if (!actor) return null;
  return typeOf({ type: actor.type, system: actor.system, race: raceOf(actor) });
}

/** The Tome as stored on an actor, read whole. */
export function tomeOf(actor) {
  // **AND WHAT A CARRIED BOOK ADDS** (08 §20's The First Tome of Silver and Ash; D-2162): its types known
  // and The Drust Chapter's type Studied, never written into the flag (`withCarried`).
  return cleanTome(tomeFlagOf(actor));
}

/** What the Tome knows and what is Studied now, The Last Hunt included. */
export function tomeFor(actor) {
  const tome = tomeOf(actor);
  const lastHunt = lastHuntStands(actor?.effects ?? []);
  return { known: tome.known, studied: studiedNow({ tome, lastHunt }), lastHunt, tome };
}

/** The `tome` option `talent-gates.mjs#targetFactsOf` reads, or null for a character who keeps no Tome. */
export function tomeFactsFor(actor) {
  if (!isWitchHunter(actor)) return null;
  return tomeFacts({ tome: tomeFlagOf(actor), effects: actor.effects ?? [] });
}

/** The types defeated since the last Long Rest (Decoctions' gate, `brewing.mjs#decoctionRefusal`). */
export function defeatedTypes(actor) {
  return tomeOf(actor).defeated;
}

/** Whether this client must ask a GM to write on `actor` and none is online (D-774). */
const noGM = actor => gmAbsentFor({ owned: [actor?.isOwner === true], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });

/**
 * One queue a client holds for every actor's Tome writes, keyed by the actor's uuid (`rules/write-queue.mjs`, the
 * pool queue's and the profession queue's shape; the final architect review, finding 1). A task in it must never
 * await another queued Tome write for the same actor, or it waits on itself until the queue's patience runs out.
 */
const QUEUE = writeQueue({
  onStall: actor => globalThis.ui?.notifications?.warn(t("AZEROTH.WitchHunter.Tome.Stalled", { name: actor?.name ?? "" }))
});

/** Run a Tome write for this actor after every one queued before it on this client. */
function tomeWrite(actor, task) {
  return QUEUE.run(actor?.uuid ?? actor?.id ?? "none", task, actor);
}

/**
 * The patch merged onto the flag as stored NOW and written, inside the queue: the read and the write are one task, so
 * a record made between another writer's read and its write is never written over (`mergeTome`).
 */
async function mergeAndWrite(actor, patch) {
  const before = tomeOf(actor);
  const after = mergeTome(actor.getFlag?.(SCOPE, TOME_FLAG) ?? null, patch);
  if (!after) return { ok: false, before, after: null };
  await actor.setFlag(SCOPE, TOME_FLAG, after);
  return { ok: true, before, after: cleanTome(after) };
}

/**
 * **THE ONE WRITE OF THE TOME** (the final architect review, finding 1): a patch (`{set, add, unstarted}`, read by
 * `witch-hunter-standing.mjs#mergeTome`) merged per key onto the flag READ AGAIN when this write's turn comes in the
 * actor's queue - here where this client owns the character, else on the active GM's client, whose handler merges
 * the same way in its own queue. Every writer used to read the Tome, build the whole flag and write it back, so the
 * blow's record of a type damaged and the death watch's record of a type defeated (one Health write) erased each
 * other. Answers whether it landed and the Tome before and after.
 *
 * @param {Actor} actor
 * @param {{set?: object, add?: object, unstarted?: boolean}} patch
 * @returns {Promise<{ok: boolean, before: object, after: object|null}>}
 */
export function patchTome(actor, patch = {}) {
  if (!actor) return Promise.resolve({ ok: false, before: tomeOf(null), after: null });
  return tomeWrite(actor, async () => {
    if (actor.isOwner) return mergeAndWrite(actor, patch);
    const before = tomeOf(actor);
    if (noGM(actor)) return { ok: false, before, after: null };
    try {
      const done = await game.users.activeGM.query(WH_TOME_QUERY, { op: "patch", actorUuid: actor.uuid, patch }, { timeout: 15000 });
      return { ok: done?.ok === true, before: done?.before ? cleanTome(done.before) : before, after: done?.after ? cleanTome(done.after) : null };
    } catch (err) {
      console.warn("azeroth-rpg | Tome write", err);
      return { ok: false, before, after: null };
    }
  });
}

/**
 * The Tome written whole (a batch, a macro): every key `next` names is SET, through the queue (`patchTome`).
 * Answers whether it landed.
 *
 * @param {Actor} actor
 * @param {object} next  the Tome to store
 * @returns {Promise<boolean>}
 */
export async function writeTome(actor, next) {
  return (await patchTome(actor, { set: next && typeof next === "object" ? next : {} })).ok;
}

/**
 * **THE TOME BEGUN** (02: *You know two creature types: Undead, and one of your choice*): the choice through the
 * one chooser, refused in words where it is Undead or no type, and written once. A Tome already begun is left.
 *
 * @param {Actor} actor
 * @param {{choice?: string|null}} [o]  a choice made already (a batch, a macro); else the chooser asks
 * @returns {Promise<string[]|null>}  the types known, or null
 */
export async function startTome(actor, { choice = null } = {}) {
  if (!isWitchHunter(actor)) return null;
  const tome = tomeOf(actor);
  if (tome.started) {
    ui.notifications?.warn(t("AZEROTH.WitchHunter.Tome.Begun", { name: actor.name }));
    return null;
  }
  let pick = choice;
  if (!pick) {
    const feature = actor.items.find(i => i.type === "feature" && i.name === TOME) ?? actor.items.find(i => i.type === "class");
    const options = CREATURE_TYPES.filter(x => x !== "undead").map(key => ({ key, name: typeLabel(key), description: "" }));
    const chosen = await game.system.azeroth.workflows.chooseOption(feature, options, null, { prompt: t("AZEROTH.WitchHunter.Tome.StartPrompt") });
    pick = chosen?.key ?? null;
    if (!pick) return null;
  }
  const start = tomeStart(pick);
  if (start.refusal) {
    ui.notifications?.warn(t(`AZEROTH.WitchHunter.Tome.Refuse.${start.refusal}`));
    return null;
  }
  // *Studied* starts on the type of the player's choice, so a Witch Hunter who has not rested has one Studied type.
  // `unstarted`: a Tome begun by another write while the chooser stood open is left as it is.
  const { ok, before } = await patchTome(actor, { unstarted: true, set: { known: start.known, studied: [cleanType(pick)] } });
  if (!ok && before.started) {
    ui.notifications?.warn(t("AZEROTH.WitchHunter.Tome.Begun", { name: actor.name }));
    return null;
  }
  if (!ok) {
    ui.notifications?.warn(t("AZEROTH.WitchHunter.NoGM", { name: actor.name }));
    return null;
  }
  return start.known;
}

/**
 * **A TYPE ADDED TO THE TOME** (Read the Trail's GM-only button, wave 2a-B; the learning Test below): written
 * once, in 14 §1's order. Answers the types known after, or null where nothing was written.
 *
 * @param {Actor} actor
 * @param {string} type
 * @returns {Promise<string[]|null>}
 */
export async function learnType(actor, type) {
  const clean = cleanType(type);
  if (!isWitchHunter(actor) || !clean) return null;
  const tome = tomeOf(actor);
  if (tome.known.includes(clean)) return tome.known;
  const written = await patchTome(actor, { add: { known: [clean] } });
  return written.ok ? written.after.known : null;
}

/**
 * **THE TOME'S LEARNING TEST** (02: *make an **Investigation** Test, a Hard Test at your tier, once per Long Rest,
 * and on a success you learn that type*; 04's Field Notes' Boon). Judged whole first (`learnJudgement`): a chance
 * the rest opened and not yet spent, and a type damaged that is not known. The type is chosen where there are two,
 * the Test rolls through the roll dialog at the Hard DC (locked), and the chance is spent whatever the result.
 *
 * @param {Actor} actor
 * @param {{type?: string|null, event?: Event|null}} [o]
 * @returns {Promise<{success: boolean, type: string|null}|null>}
 */
export async function learnTypeWithDialog(actor, { type = null, event = null } = {}) {
  if (!isWitchHunter(actor)) return null;
  const tome = tomeOf(actor);
  const fieldNotes = actor.talentRanks?.(FIELD_NOTES) ?? 0;
  const judged = learnJudgement({ tome, tier: tierOf(actor), fieldNotes });
  if (judged.refusal) {
    ui.notifications?.warn(t(`AZEROTH.WitchHunter.Learn.Refuse.${judged.refusal}`, { name: actor.name }));
    return null;
  }
  if (noGM(actor)) {
    ui.notifications?.warn(t("AZEROTH.WitchHunter.NoGM", { name: actor.name }));
    return null;
  }
  let pick = cleanType(type);
  if (pick && !judged.types.includes(pick)) {
    ui.notifications?.warn(t("AZEROTH.WitchHunter.Learn.Refuse.known", { name: actor.name }));
    return null;
  }
  if (!pick && judged.types.length === 1) pick = judged.types[0];
  if (!pick) {
    const feature = actor.items.find(i => i.type === "feature" && i.name === TOME) ?? actor.items.find(i => i.type === "class");
    const chosen = await game.system.azeroth.workflows.chooseOption(feature, judged.types.map(key => ({ key, name: typeLabel(key), description: "" })), null,
      { prompt: t("AZEROTH.WitchHunter.Learn.Prompt") });
    pick = chosen?.key ?? null;
    if (!pick) return null;
  }
  const { rollWithDialog } = await import("../applications/actions.mjs");
  const message = await rollWithDialog(actor, {
    kind: "skill", skill: TOME_SKILL, dc: judged.dc, dcLocked: true,
    title: t("AZEROTH.WitchHunter.Learn.Title", { type: typeLabel(pick) }),
    modifiers: skillRowsFor(actor, TOME_SKILL),
    ...(judged.boons > 0 ? { talentBoons: { boons: judged.boons, names: [FIELD_NOTES] } } : {})
  }, event);
  if (!message) return null;
  const success = message?.rolls?.[0]?.outcome?.success === true || message?.flags?.[SCOPE]?.success === true;
  // The chance is spent with the Test, and the fights it followed with it (*once per Long Rest*), merged onto the
  // Tome as it stands when the write's turn comes (`patchTome`).
  await patchTome(actor, { add: success ? { known: [pick] } : {}, set: { learned: true, learnOpen: null, damaged: [] } });
  // The row's *once per Long Rest*, struck so the sheet's count says what the record says (`resetUses("long")` gives it back).
  const feature = actor.items.find(i => i.type === "feature" && i.name === TOME);
  if (feature?.system?.uses?.max && actor.isOwner) await feature.update({ "system.uses.value": 0 });
  ui.notifications?.info(t(success ? "AZEROTH.WitchHunter.Learn.Learned" : "AZEROTH.WitchHunter.Learn.Failed", { name: actor.name, type: typeLabel(pick) }));
  return { success, type: pick };
}

/**
 * **WHAT THE REST DOES TO THE TOME** (from `effects/witch-hunter-brews.mjs#witchHunterRest`): a Long Rest opens the
 * learning chance, gives it back (*once per Long Rest*) and starts a new record of types defeated; a Short Rest
 * opens it only with Field Notes at rank 2. Answers the defeated types the brewing this rest opens may use (the
 * record before a Long Rest cleared it: *since your last Long Rest* read at the end of that rest) and whether the
 * learning chance is open.
 *
 * @param {Actor} actor
 * @param {"short"|"long"} kind
 * @returns {Promise<{defeated: string[], learnOpen: boolean}>}
 */
export async function tomeAtRest(actor, kind) {
  const tome = tomeOf(actor);
  if (!tome.started) return { defeated: [], learnOpen: false };
  const fieldNotes = actor.talentRanks?.(FIELD_NOTES) ?? 0;
  const opens = kind === "long" || (kind === "short" && fieldNotes >= 2);
  const set = {
    ...(kind === "long" ? { learned: false, defeated: [] } : {}),
    ...(opens ? { learnOpen: kind } : {})
  };
  // Only the keys the rest moves, merged onto the Tome as it stands when the write's turn comes (`patchTome`); the
  // record of types defeated the brewing reads is the one that write replaced (`before`), not a read made earlier.
  const written = Object.keys(set).length ? await patchTome(actor, { set }) : { ok: true, before: tome, after: tome };
  const before = written.before ?? tome;
  const next = written.after ?? { ...before, ...set };
  const learnOpen = learnJudgement({ tome: next, tier: tierOf(actor), fieldNotes }).refusal === null;
  return { defeated: before.defeated, learnOpen };
}

/* ------------------------------------------------------------------ */
/*  The records: types damaged and types defeated                       */
/* ------------------------------------------------------------------ */

/**
 * **A TYPE DAMAGED, RECORDED** (02's Tome: *after a fight in which you damaged a creature of a type you do not
 * know*), from `effects/after-blow.mjs#afterBlow` on whichever client applied the blow, and the Undead
 * Decoction's heal (*you regain Health equal to twice your tier when a creature you hit drops to 0 Health*). Only a
 * Witch Hunter attacker, only a blow that moved the Health, only a type the Tome does not know.
 *
 * @param {{attacker?: Actor|null, target?: Actor|null, dealt?: number, attack?: boolean, before?: number, after?: number}} o
 */
export async function recordBlow({ attacker = null, target = null, dealt = 0, attack = true, before = 0, after = 0 } = {}) {
  if (!isWitchHunter(attacker) || !target || target === attacker) return;
  const type = typeOfActor(target);
  const tome = tomeOf(attacker);
  if (int(dealt) > 0 && type && tome.started && !tome.known.includes(type) && !tome.damaged.includes(type)) {
    // ADDED to the record as it stands when the write's turn comes, so the death watch's record of the same Health
    // write is never written over (`patchTome`; the final architect review, finding 1).
    await patchTome(attacker, { add: { damaged: [type] } });
  }
  // The Undead Decoction, on a hit that drops the creature (*a creature you hit*: an attack).
  if (attack && int(before) > 0 && int(after) <= 0) {
    const decoction = actingBrews(attacker.effects ?? []).map(b => b.decoction).find(d => d?.benefit?.onKill) ?? null;
    const amount = int(decoction?.benefit?.onKill?.heal);
    if (amount > 0 && attacker.isOwner) {
      await attacker.applyHealing(amount, { from: attacker, consumable: true });
      ui.notifications?.info(t("AZEROTH.WitchHunter.Decoction.Undead", { name: attacker.name, n: amount }));
    }
  }
}

/**
 * **A TYPE DEFEATED, RECORDED** (02's Decoctions: *if you defeated a creature of that type since your last Long
 * Rest*), off the death watch's event on the active GM's client. MY READING (for the lead): *you defeated* is a
 * creature of that type dying in a started fight the Witch Hunter is a combatant of - the party's kill counts.
 *
 * @param {{actor: Actor, healthFell?: boolean, died?: boolean}} event
 */
export async function recordDeath(event = {}) {
  const dead = event?.actor ?? null;
  if (!dead || !(event.healthFell || event.died)) return;
  const type = typeOfActor(dead);
  if (!type) return;
  const hunters = new Set();
  for (const combat of values(game.combats)) {
    if (!combat?.started) continue;
    const members = values(combat.combatants);
    if (!members.some(c => c.actor === dead || (c.actorId === dead.id && c.actor?.id === dead.id))) continue;
    for (const c of members) if (isWitchHunter(c.actor) && c.actor !== dead) hunters.add(c.actor);
  }
  for (const hunter of hunters) {
    const tome = tomeOf(hunter);
    if (!tome.started || tome.defeated.includes(type)) continue;
    // ADDED, never the whole flag off this read: two kills a moment apart both stay (`patchTome`).
    await patchTome(hunter, { add: { defeated: [type] } });
  }
}

/* ------------------------------------------------------------------ */
/*  The attack door                                                     */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A WEAPON ATTACK GAINS AGAINST EACH TARGET** (02's Tome of Silver and Ash and Studied; 08's oils and the
 * Construct Decoction), asked ONCE by `rollTest` before its mitigation. Each target's row: the Rating to add, the
 * Armor Points the blow ignores, its Ward map with what the blow ignores taken off, and the provenance rows; and
 * the Tempo a hit gives over 05 §11 (`poolExtra.tempo`, the FIRST target's, as the gain reads one blow). Null
 * for an attacker who is no Witch Hunter, or no weapon attack.
 *
 * @param {Actor} actor
 * @param {{list?: object[], weaponId?: string|null, weaponAttack?: boolean}} o  the target snapshots
 * @returns {{rows: Array<{rating: number, penetration: number, wardBySchool: (w: object) => object, provenance: Array<{label: string, value: number}>}>, tempo: number}|null}
 */
export function witchHunterBlow(actor, { list = [], weaponId = null, weaponAttack = true } = {}) {
  if (!isWitchHunter(actor) || !weaponAttack) return null;
  const { known, studied } = tomeFor(actor);
  const weapon = weaponId ? (actor.items?.get?.(weaponId) ?? null) : null;
  const oilFlag = weapon?.getFlag?.(SCOPE, OIL_FLAG) ?? null;
  const oil = oilStands(oilFlag, { now: Number(game.time?.worldTime) || 0 }) ? oilFlag : null;
  const pen = brewStanding(actor.effects ?? []).penetration;
  const tier = tierOf(actor);
  const label = row => (row.key === "tome" ? TOME : row.key === "studied" ? t("AZEROTH.WitchHunter.Studied.Label") : row.key === "decoction" ? t("AZEROTH.WitchHunter.Decoction.Label") : (oil?.name ?? row.key));
  // **04's MOUNTAIN BEAR** (*for 1 minute: your attacks with a weapon in two hands deal extra damage equal to your tier*;
  // the Witch Hunter plan's wave 2b): on every target, while the minute's effect stands and the weapon is in two hands.
  const bear = mountainBearDamage({
    stands: (actor.effects ?? []).some(e => e.active !== false && e.disabled !== true && e.flags?.[SCOPE]?.[MOUNTAIN_BEAR_FLAG]),
    bothHands: actor.gateFacts?.()?.wield?.bothHands === true, tier
  });
  const rows = (list.length ? list : [null]).map(snapshot => {
    const blow = witchHunterBlowFor({
      types: snapshot?.types ?? [],
      kinds: snapshot?.kinds ?? [],
      tome: known.length ? { known, studied } : null,
      tier, oil, penetration: pen
    });
    return {
      rating: blow.rating + bear, penetration: blow.penetration, tempo: blow.tempo,
      wardBySchool: ward => (blow.wardPierce || blow.firePierce ? wardAfterPierce(ward, { all: blow.wardPierce, fire: blow.firePierce }) : (ward ?? {})),
      provenance: [...blow.rows.map(r => ({ label: label(r), value: r.value })), ...(bear > 0 ? [{ label: MOUNTAIN_BEAR.name, value: bear }] : [])]
    };
  });
  return { rows, tempo: rows[0]?.tempo ?? 0, oil };
}

/**
 * **BLINDWEED OIL'S BANE** (*A creature the coated weapon hits takes a Bane on its next Casting Test*), laid on a hit
 * through the one Bane door (`effects/banes.mjs#layBane`), which writes on the GM's client for a creature this client
 * does not own. Answers the names it landed on.
 *
 * @param {Actor} actor
 * @param {{oil?: object|null, victims?: Actor[]}} o
 */
export async function blindweedOnHit(actor, { oil = null, victims = [] } = {}) {
  const bane = oil?.coating?.onHit?.bane ?? null;
  if (!bane || !victims.length) return [];
  const { layBane } = await import("./banes.mjs");
  const landed = [];
  for (const victim of victims) {
    if (!victim) continue;
    const laid = await layBane({ victim, kind: bane.kind, banes: bane.banes, source: oil.name, by: actor });
    if (laid) landed.push(victim.name);
  }
  return landed;
}

/* ------------------------------------------------------------------ */
/*  The Resist roll                                                     */
/* ------------------------------------------------------------------ */

/**
 * **THE WEAKNESS RECORD FOR A CARD** (02's Tome): built off the maker's Tome, for a Sign (`{sign}`) or a bomb
 * (`{bomb}`). wave 2a-B writes it on a Sign's card under `WEAKNESS_CARD_FLAG`; the bomb's card here.
 *
 * @param {Actor} maker
 * @param {{sign?: string, bomb?: string}} source
 */
export function weaknessRecordFor(maker, source = {}) {
  if (!isWitchHunter(maker)) return null;
  return weaknessRecord({ known: tomeOf(maker).known, source, name: TOME });
}

/** The weakness Bane for a target and a source (`{sign}` or `{bomb}`), off the maker's Tome: 0 or 1. */
export function weaknessBaneFor(maker, target, source = {}) {
  return weaknessBaneOn(weaknessRecordFor(maker, source), typeOfActor(target));
}

/**
 * **WHAT THE RESIST ROLL ADDS FOR THE WITCH HUNTER** (`dice/chat.mjs`'s Resist door): the weakness Bane the card
 * carries, judged against the resister's own type, and Studied's Boon where the resister is a Witch Hunter and the
 * card's speaker is of a Studied type. Each in the door's `{banes|boons, names}` shape, or null.
 *
 * @param {{flags?: object, resister?: Actor|null, maker?: Actor|null}} o
 * @returns {{banes: {banes: number, names: string[]}|null, boons: {boons: number, names: string[]}|null}}
 */
export function resistLinesFor({ flags = {}, resister = null, maker = null } = {}) {
  // A Sign's or a bomb's card carries the record at its top; an area Test's card (the Ash ring's Spirit Test at a turn's
  // start) carries it on the check row it copied off the ring (the architect review's A1, wave 2d-A, D-2131).
  const record = weaknessRecordOnCard(flags);
  const bane = record ? weaknessBaneOn(record, typeOfActor(resister)) : 0;
  const boon = isWitchHunter(resister) && maker && maker !== resister
    ? studiedBoonOn({ tome: tomeFlagOf(resister), effects: resister.effects ?? [], sourceType: typeOfActor(maker) })
    : 0;
  // **04's UNBOWED** (*You have a Boon on Resilience Tests against being knocked **Prone** or moved*; the Witch Hunter
  // plan's wave 2b): where the card says its failure moves the creature or knocks it Prone (`unbowedBoons`).
  const unbowed = resister?.items ? unbowedBoons({ rank: whRankOfItems(resister.items, UNBOWED.identifier), flags }) : 0;
  const names = [...(boon > 0 ? [t("AZEROTH.WitchHunter.Studied.Label")] : []), ...(unbowed > 0 ? [UNBOWED.name] : [])];
  return {
    banes: bane > 0 ? { banes: bane, names: [record.name || TOME] } : null,
    boons: boon + unbowed > 0 ? { boons: boon + unbowed, names } : null
  };
}

/* ------------------------------------------------------------------ */
/*  The GM's handler and the hooks                                      */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A CLIENT ASKS THE GM TO WRITE ON THE TOME** (`WH_TOME_QUERY`), judged again here: the asker owns the
 * character, which is a Witch Hunter, and the patch is merged onto the flag as it stands when the write's turn comes
 * in THIS client's queue for the actor (`mergeAndWrite`, cleaned by `mergeTome`), exactly as an owner's own write is.
 */
export async function witchHunterTomeQueryHandler(payload = {}, { user = null } = {}) {
  if (!game.user?.isGM) return { ok: false };
  const actor = payload?.actorUuid ? await fromUuid(payload.actorUuid) : null;
  if (!actor || !isWitchHunter(actor)) return { ok: false };
  if (user && !actor.testUserPermission(user, "OWNER") && !user.isGM) return { ok: false };
  if (payload.op !== "patch") return { ok: false };
  return tomeWrite(actor, () => mergeAndWrite(actor, payload.patch ?? {}));
}

/** The kinds of an actor, through the one reader (for the target snapshot's `kinds`, already carried). */
export function kindsOfActor(actor) {
  if (!actor) return new Set();
  return kindsOf(creatureSnapshot({ type: actor.type, system: actor.system, race: raceOf(actor) }));
}

/** Register the Tome's hooks once at init: the defeated record on the death watch. */
export function registerWitchHunterTome() {
  import("./death-watch.mjs").then(m => m.onDeath(event => recordDeath(event))).catch(err => console.warn("azeroth-rpg | Witch Hunter death watch", err));
}

/**
 * **THE FIRST TOME'S TWO TYPES, CHOSEN** (08 §20's Every Lesson Written: *A Witch Hunter carrying it knows two
 * additional creature types of their choice*; D-2162, MY READING): through the one chooser
 * (`workflows.chooseOption`), from the eight the hunter's own Tome does not know, as many as the run names, kept on
 * the book's flag (`signatures.mjs#TOME_TYPES_FLAG`) so they go with it. Asked the first time a Witch Hunter carries
 * it with none chosen; `force` lets a GM choose again. Judged whole first, each refusal said in words.
 *
 * @param {Actor} actor  the carrier
 * @param {Item} item    the book, owned by `actor`
 * @param {{force?: boolean}} [o]
 * @returns {Promise<string[]|null>}  the types kept, or null where nothing was written
 */
export async function chooseTomeTypes(actor, item, { force = false } = {}) {
  const { TOME_TYPES_FLAG, signatureEffectOf, gateHolds } = await import("../rules/signatures.mjs");
  const sig = signatureEffectOf(item);
  const count = Math.trunc(Number(sig?.knownTypes)) || 0;
  if (!actor || !item || item.parent !== actor || !(count > 0)) return null;
  if (!isWitchHunter(actor) || !gateHolds(sig.gates ?? [], actor.signatureState ?? {})) {
    ui.notifications?.warn(t("AZEROTH.ClassItem.TomeTypes.NotHunter", { name: actor.name, item: item.name }));
    return null;
  }
  if (force && !game.user?.isGM) {
    ui.notifications?.warn(t("AZEROTH.ClassItem.TomeTypes.GmOnly", { item: item.name }));
    return null;
  }
  const held = item.getFlag?.(SCOPE, TOME_TYPES_FLAG) ?? [];
  if (!force && Array.isArray(held) && held.length) return held;
  if (!item.isOwner) return null;
  // The hunter's OWN Tome, never the book's own types, so a choice made again may pick them afresh.
  const own = cleanTome(actor.getFlag?.(SCOPE, TOME_FLAG) ?? null);
  const options = CREATURE_TYPES.map(key => ({
    key, name: game.i18n.localize(AZEROTH.creatureTypes?.[key] ?? key), description: "", available: !own.known.includes(key)
  }));
  if (!options.some(o => o.available)) {
    ui.notifications?.warn(t("AZEROTH.ClassItem.TomeTypes.AllKnown", { name: actor.name, item: item.name }));
    return null;
  }
  const picked = await game.system.azeroth.workflows.chooseOption(item, options, null, {
    prompt: t("AZEROTH.ClassItem.TomeTypes.Prompt", { item: item.name, n: count }), max: count
  });
  const keys = (Array.isArray(picked) ? picked : picked ? [picked] : []).map(o => o?.key).filter(k => typeof k === "string" && k);
  if (!keys.length) return null;
  const kept = CREATURE_TYPES.filter(k => keys.includes(k)).slice(0, count);
  await item.setFlag(SCOPE, TOME_TYPES_FLAG, kept);
  ui.notifications?.info(t("AZEROTH.ClassItem.TomeTypes.Chosen", { name: actor.name, item: item.name, types: kept.map(k => game.i18n.localize(AZEROTH.creatureTypes?.[k] ?? k)).join(", ") }));
  return kept;
}

/**
 * **WHETHER CARRYING THIS BOOK ASKS FOR ITS TYPES** (D-2162): the item was just put on (`system.equipped` true in
 * the write), its Signature names `knownTypes`, it keeps none yet, AND the bearer is a Witch Hunter whose gate on
 * the run holds (the phase 3 review: a non-hunter putting the book on is asked nothing and told nothing). The two
 * facts WITHHOLD by default, so a caller that forgets them opens no chooser. Pure.
 *
 * @param {object} item
 * @param {object} change
 * @param {{hunter?: boolean, gateHeld?: boolean}} [facts]
 */
export function tomeTypesAsked(item, change = {}, { hunter = false, gateHeld = false } = {}) {
  if (change?.system?.equipped !== true) return false;
  const sig = item?.system?.signatureEffect ?? null;
  if (!(Math.trunc(Number(sig?.knownTypes)) > 0)) return false;
  const held = item?.flags?.[SCOPE]?.tomeTypes;
  if (Array.isArray(held) && held.length) return false;
  return hunter === true && gateHeld === true;
}

/** The books whose chooser is open on this client, by uuid: two quick equips open one chooser (the phase 3 review). */
const TOME_TYPES_ASKING = new Set();

/** Register the First Tome's chooser: asked on the client that put it on, once, and only of a Witch Hunter (D-2162). */
export function registerTomeTypes() {
  Hooks.on("updateItem", (item, change, options, userId) => {
    if (userId !== game.user?.id || item?.parent?.documentName !== "Actor") return;
    // The item's own half first (put on, a `knownTypes` run, none kept), before anything is awaited.
    if (!tomeTypesAsked(item, change, { hunter: true, gateHeld: true })) return;
    const key = item.uuid;
    if (!key || TOME_TYPES_ASKING.has(key)) return;
    TOME_TYPES_ASKING.add(key);
    (async () => {
      const { gateHolds, signatureEffectOf } = await import("../rules/signatures.mjs");
      const actor = item.parent;
      const gateHeld = gateHolds(signatureEffectOf(item)?.gates ?? [], actor.signatureState ?? {});
      if (!tomeTypesAsked(item, change, { hunter: isWitchHunter(actor), gateHeld })) return;
      await chooseTomeTypes(actor, item);
    })().catch(err => console.warn("azeroth-rpg | the First Tome's types", err)).finally(() => TOME_TYPES_ASKING.delete(key));
  });
}
