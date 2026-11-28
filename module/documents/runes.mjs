/**
 * **THE ONE WRITER OF A RUNE'S STATE** (D-943, D-949). `rules/runes.mjs` is the law; this
 * file is the only place in `module/` that writes `system.runes` on a weapon, and
 * `rules/death-knight-groundwork.test.mjs` holds a census that fails a write anywhere else
 * - so no door can spend a rune and skip its Runic Power, or refill one and skip the rest
 * that earns it.
 *
 * Doors:
 * - `inscribeRunes` - 02 §7's Inscribed Runeweapon: a ratio onto a trained weapon,
 *   judged whole before anything is written, refused in words;
 * - `spendRunesOn` - every rune spent, for any reason, with its Runic Power, through
 *   `rules/runes.mjs#spendRunes`: a feature's price (`useFeature`), a rider's
 *   (`settleRuneRiders`), the bare Half-Action (`effects/death-knight.mjs#spendRuneBare`);
 * - `refillRunesOn` - a talent's partial refill;
 * - `refillRunesAtLongRest` - the Long Rest's whole refill (`AzerothActor#longRest`).
 *
 * **ONE WRITE, ONE AT A TIME** (D-761's lesson, run F2). A spend reads the weapons and the
 * pool, works the spend out, and writes BOTH in ONE actor update (core merges an embedded
 * `items` array by `_id`), so no reader ever sees a rune spent and its Runic Power not yet
 * paid; and every write a client makes for one actor runs through `writeQueue`, after the
 * last one queued has landed, reading the state THEN - so a double press can never spend one
 * rune for two gains, or two runes for one.
 */

import { RUNIC_POWER, inscribe, refillRunes, refundRunes, restedSlots, runeWrites, spendRunes } from "../rules/runes.mjs";
import { trainingProfile, weaponTraining } from "../rules/equipment-training.mjs";
import { INSCRIBE_FLAG, inscriptionOpened } from "../rules/death-knight.mjs";
import { poolWrite } from "./pool-writes.mjs";
import { shownName } from "../helpers/identify-words.mjs";
// The rune flare's record, written on the spend's own update (run F5).
import { RUNE_SPEND_OPTION, runeSpendCue } from "../rules/animation-records.mjs";

/**
 * Run a rune write for this actor after every POOL write queued before it (D-761; the F2
 * review's should-fix 4): the actor's one pool queue (`documents/pool-writes.mjs`), so a
 * spend is ordered against a cast or a rest as well as against another spend. Inside it the
 * pools are written through `writePoolsNow`, never `updatePool`, which would queue behind
 * this very task.
 */
function serially(actor, task) {
  return poolWrite(actor, task);
}

/** The weapon access the actor's classes train, as `CharacterData` reads it. */
function accessOf(actor) {
  return trainingProfile({ classes: (actor?.classItems ?? []).map(c => c.system ?? c) }).weapons;
}

/** The stored `system.runes` of an owned weapon, or null. */
function storedOf(actor) {
  return itemId => actor?.items?.get?.(itemId)?.system?.runes ?? null;
}

/** Whether a write may name the inscription window's flag: only where it is open. */
function closesWindow(actor) {
  return actor?.getFlag?.("azeroth-rpg", INSCRIBE_FLAG)?.open === true;
}

/**
 * **INSCRIBE** a ratio of Blood and Frost runes on one weapon (02 §7). Judged whole
 * first; a refusal is said in words and nothing is written.
 *
 * @param {Actor} actor
 * @param {Item} weapon  an owned weapon
 * @param {{blood: number, frost: number, grip?: "one"|"two"|null}} o
 * @returns {Promise<{ok: boolean, refusal: string|null}>}
 */
export async function inscribeRunes(actor, weapon, { blood = 0, frost = 0, grip = null } = {}) {
  return serially(actor, async () => {
    const trained = Boolean(weapon) && weaponTraining(weapon, accessOf(actor));
    const made = inscribe({ weapon, trained, blood, frost, grip });
    if (made.refusal) {
      ui.notifications?.warn(game.i18n.format(`AZEROTH.Runes.Refuse.${made.refusal}`, { name: weapon ? shownName(weapon) : "" }));
      return { ok: false, refusal: made.refusal };
    }
    await weapon.update({ "system.runes": made.runes });
    return { ok: true, refusal: null };
  });
}

/**
 * **SPEND** runes of a kind, with the Runic Power each gives, in ONE write: the weapons and
 * the pool together, and the inscription window closed by the same update (the first rune
 * spent after a Long Rest begins the day, D-950). Refused in words, with nothing spent,
 * where the wielded weapons hold too few. Read when its turn in the queue comes.
 *
 * **AND THE TURN'S BUDGET INSIDE THE JUDGEMENT** (the F2 review's must-fix 1, D-768's
 * order): `before`, where given, runs once this spend's FRESH judgement has passed and
 * before anything is written - the Half-Action a Use or the bare spend costs. A press made
 * twice at once is judged the second time off what the first wrote, so the second is refused
 * in words before its Half-Action is spent; and a budget that refuses writes no rune.
 *
 * **AND THE USE'S PRIVACY PAIR, WHERE A USE PAYS** (D-1013, O-382): `privacy` is the (user,
 * feature) pair the Use's card will be noted under (`rules/animation-records.mjs
 * #featurePrivacyKey`); it rides the flare's record and decides nothing about the spend.
 *
 * @param {Actor} actor
 * @param {{kind?: "blood"|"frost"|"any", count?: number, frostBonus?: number, quiet?: boolean,
 *   before?: (() => Promise<boolean>|boolean)|null, privacy?: string|null}} o
 * @returns {Promise<{ok: boolean, refusal: string|null, gained: number, spent: object[]}>}
 */
export async function spendRunesOn(actor, { kind = "any", count = 1, frostBonus = 0, quiet = false, before = null, privacy = null } = {}) {
  // **04's KILLING MACHINE, AT THIS DOOR** (*each Frost rune you spend gives 1 additional Runic
  // Power per rank* while a one-handed weapon is wielded in each hand; run F4a): read here off
  // what is in hand, so every spend - a feature's, a talent's, a rider's, the bare Half-Action -
  // gives it, and no caller can forget it.
  const { afterRuneSpend, talentFrostBonus } = await import("../effects/death-knight-talents.mjs");
  const bonus = Math.max(0, Math.trunc(Number(frostBonus)) || 0) + talentFrostBonus(actor);
  const spentNow = await serially(actor, async () => {
    const rows = actor?.system?.runes?.weapons ?? [];
    const pool = (actor?.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === RUNIC_POWER) ?? null;
    const done = spendRunes({ weapons: rows, runicPower: pool?.value ?? 0, chaMod: actor?.system?.abilities?.cha?.mod ?? 0, frostBonus: bonus }, { kind, count });
    if (done.refusal) {
      if (!quiet) ui.notifications?.warn(game.i18n.format(`AZEROTH.Runes.Refuse.${done.refusal}`, { name: actor?.name ?? "", n: count }));
      return { ok: false, refusal: done.refusal, gained: 0, spent: [] };
    }
    // The budget's own door says its own words where it refuses.
    if (typeof before === "function" && !(await before())) return { ok: false, refusal: "budget", gained: 0, spent: [] };
    const writes = runeWrites(rows, done.runes, storedOf(actor));
    const extra = {
      ...(writes.length ? { items: writes } : {}),
      ...(closesWindow(actor) ? { [`flags.azeroth-rpg.${INSCRIBE_FLAG}.open`]: false } : {})
    };
    const changes = pool && done.runicPower !== pool.value ? [{ itemId: pool.itemId, kind: "momentum", value: done.runicPower }] : [];
    // **THE RUNE FLARE'S RECORD** (02 §7: every rune spent, for any reason; run F5, D-729): the
    // kinds spent and the knight's token as THIS client sees it now (`roll-dialog.mjs#sourceOf`,
    // D-724), on the operation of the same update - core hands an operation's own keys to every
    // client's `updateActor` hook, and `animation/director.mjs` plays it there. Nothing reads it
    // to decide a rule, and a spend with no token on a board writes none.
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const flare = runeSpendCue({ source: sourceOf(actor), spent: done.spent, privacy });
    if (changes.length || Object.keys(extra).length) await actor.writePoolsNow(changes, extra, { runicGain: "rune", ...(flare ? { [RUNE_SPEND_OPTION]: flare } : {}) });
    return { ok: true, refusal: null, gained: done.gained, spent: done.spent };
  });
  // **WHAT A RUNE SPENT RAISES** (04's Sanguine Tide and Runic Frost), once the spend is written
  // and OUTSIDE the pool queue, so nothing it writes waits on the spend that raised it. Guarded:
  // a failure never undoes the spend.
  if (spentNow?.ok && spentNow.spent?.length) {
    try {
      await afterRuneSpend(actor, spentNow.spent);
    } catch (err) {
      console.warn("azeroth-rpg | after a rune spent", err);
    }
  }
  return spentNow;
}

/**
 * **A WITHDRAWN HIT GIVES ITS RUNES BACK** (the F2 review's must-fix 2; O-346): the rune a
 * rider paid on the hit (02's Plague) is marked unspent again, on the weapon and in the slot
 * it was spent from, and the Runic Power it gave comes back off, never below nothing - in
 * ONE write, through the one queue. A slot refilled or re-inscribed since is left alone.
 *
 * @param {Actor} actor
 * @param {{spent?: Array<{itemId: string, index: number, kind: string}>, gained?: number}} o
 * @returns {Promise<{runes: number, runicPower: number}>}  what came back, and what came off
 */
export async function refundRunesOn(actor, { spent = [], gained = 0, restGeneration = null } = {}) {
  return serially(actor, async () => {
    const stored = {};
    for (const r of spent ?? []) {
      const item = r?.itemId ? actor?.items?.get?.(r.itemId) ?? null : null;
      if (item?.type === "weapon") stored[r.itemId] = item.system?.runes?.slots ?? [];
    }
    const pool = (actor?.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === RUNIC_POWER) ?? null;
    // The rest generation the spend was made in, against the knight's now (the F3 review).
    const now = actor?.getFlag?.("azeroth-rpg", "restGeneration") ?? 0;
    const back = refundRunes({ stored, spent, runicPower: pool?.value ?? 0, gained, generation: Number.isInteger(restGeneration) ? restGeneration : null, now });
    const extra = back.writes.length ? { items: back.writes } : {};
    const changes = pool && back.runicPower !== pool.value ? [{ itemId: pool.itemId, kind: "momentum", value: back.runicPower }] : [];
    if (changes.length || back.writes.length) await actor.writePoolsNow(changes, extra);
    return { runes: back.refunded, runicPower: (pool?.value ?? 0) - back.runicPower };
  });
}

/**
 * **THE RUNE RIDERS AN ATTACK PAID FOR** (02's Death Strike and Plague, D-770's door): each
 * line priced in runes spent through `spendRunesOn` in the order paid, never through a pool
 * write - the rider door's `settleRiders` writes a pool, which the runes are not. A line the
 * runes can no longer pay pays nothing (the Finisher's rule once the Half-Action is spent).
 *
 * **AND THE ATTACK'S PRIVACY** (O-394; the lead: *"Yes"*): `privacy` is the attack card's (user,
 * attack) pair (`rules/animation-records.mjs#attackPrivacyKey`), so the flare these runes make
 * waits for the attack's card and hides where that card is private.
 *
 * @param {Actor} actor
 * @param {Array<{line: object, spent: number}>} paid  the rune lines `riderPlan` judged
 * @param {{privacy?: string|null}} [o]
 * @returns {Promise<Array<object>>}  each line with what it actually spent
 */
export async function settleRuneRiders(actor, paid = [], { privacy = null } = {}) {
  const out = [];
  for (const p of paid ?? []) {
    const count = Math.max(0, Math.trunc(Number(p.spent ?? p.line?.cost)) || 0);
    if (!count) { out.push({ ...p, spent: 0 }); continue; }
    const done = await spendRunesOn(actor, { kind: p.line?.row?.cost?.kind ?? "any", count, privacy });
    // The runes it took and what they gave, for a withdrawn hit to give back (O-346).
    out.push({ ...p, spent: done.ok ? count : 0, runicPower: done.ok ? (done.gained ?? 0) : 0, runes: done.ok ? (done.spent ?? []) : [] });
  }
  return out;
}

/**
 * **REFILL** spent runes on the weapons wielded: a number of one kind for a talent (04's
 * Blood Tap and Empower Runeweapon).
 *
 * @param {Actor} actor
 * @param {{kind?: "blood"|"frost"|"any", count?: number}} [o]
 * @returns {Promise<number>}  how many came back
 */
export async function refillRunesOn(actor, { kind = "any", count = Infinity, itemId = null } = {}) {
  return serially(actor, async () => {
    const rows = actor?.system?.runes?.weapons ?? [];
    if (!rows.length) return 0;
    // `itemId`: one weapon's runes alone (Gorefiend's Runeblade's The Council's Spirit; D-2156).
    const { runes, refilled } = refillRunes(rows, { kind, count, itemId });
    const writes = runeWrites(rows, runes, storedOf(actor));
    if (writes.length) await actor.updateEmbeddedDocuments("Item", writes);
    return refilled;
  });
}

/**
 * **THE LONG REST'S REFILL** (02 §7: *Your spent runes refill when you finish a Long
 * Rest*): every spent rune on every weapon the character owns, wielded or not
 * (`rules/runes.mjs#restedSlots`), in ONE write with the inscription window opened at this
 * rest's generation (D-950: *When you finish a Long Rest, inscribe ...*).
 *
 * **A VERSATILE WEAPON'S COUNT STANDS UNTIL THE NEXT INSCRIPTION** (D-950 as corrected by
 * the F2 review's should-fix 3): the rest refills the slots and leaves the grip, and the new
 * inscription writes the grip it chooses (`inscribeRunes`). Clearing it here left a knight
 * ambushed before inscribing, or one who rested short of inscribing, on half its runes.
 *
 * @param {Actor} actor
 * @param {{restGeneration?: number}} [o]  the generation the rest just reached
 * @returns {Promise<number>}  how many came back, for the card
 */
export async function refillRunesAtLongRest(actor, { restGeneration = 0 } = {}) {
  return serially(actor, async () => {
    const items = [];
    let refilled = 0;
    for (const item of actor?.items ?? []) {
      if (item.type !== "weapon") continue;
      const stored = item.system?.runes ?? null;
      const slots = restedSlots(stored);
      if (!slots) continue;
      refilled += (stored.slots ?? []).filter(r => r?.spent === true).length;
      items.push({ _id: item.id, "system.runes.slots": slots });
    }
    const knight = (actor?.system?.classKeys ?? []).includes("death-knight");
    const update = {
      ...(items.length ? { items } : {}),
      ...(knight ? { [`flags.azeroth-rpg.${INSCRIBE_FLAG}`]: inscriptionOpened(restGeneration) } : {})
    };
    if (Object.keys(update).length) await actor.update(update);
    return refilled;
  });
}
