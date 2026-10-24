/**
 * **WHAT HOLDS A CREATURE BACK FROM A DEATH STEP, AND WHAT CALLS ONE BACK** (the
 * Legacy branches' door 11 and door 25's revive). Pure: no Foundry imports
 * (CLAUDE.md §3).
 *
 * - **04's Hold the Thread** (*As a Reaction, spend 2 Mana. A creature within 30
 *   feet that would take a Death Step does not take it. You may use this a number of
 *   times equal to your rank per Short Rest*): a top-level `deathHold {feet, cost}`
 *   row beside the counter the talent grants. `AzerothActor#takeDeathStep` asks
 *   every holder within the feet BEFORE the step is written, through the blow
 *   doors' own query pattern (`effects/death-holds.mjs`): an active owning player,
 *   else the active GM, judged before it is asked and again after
 *   (`deathHoldJudgement`), the dialog closing itself as *no* before the asker
 *   stops waiting. A yes pays the Reaction, the Mana and a use, and the step is not
 *   taken.
 * - **04's Burial Ground at rank 2** (*an attack against a **Dying** friendly target
 *   inside it adds no Death Step*): a rider of the area the card places
 *   (`area-ticks.mjs`' `remains` row with `noDeathStep`), read at the one door that
 *   adds an attack's step (`AzerothActor#_struckBy`) by `deathStepSpared`.
 * - **04's Ancestral Spirit** (*A creature within 30 feet that took its third Death
 *   Step since the end of your last turn stands at half its maximum Health, rounded
 *   down, with its Death Steps cleared, and spends no Spirit's Tether ... A creature
 *   with no Spirit's Tether left does not return, and no creature returns this way
 *   twice*): the third step recorded on the creature as it is taken
 *   (`THIRD_STEP_FLAG`), the window read against the user's own last turn
 *   (`sinceLastTurnEnd`), and the once-in-a-life mark (`RETURNED_FLAG`) - *"Once"
 *   means once in the creature's life* (the plan's *As read*).
 */

/** The actor flag the third Death Step is recorded under, as it is taken: `{combatId, round, turn, time}`. */
export const THIRD_STEP_FLAG = "thirdStep";

/** The actor flag Ancestral Spirit's once-in-a-life return is recorded under: `{by, at}`. */
export const RETURNED_FLAG = "ancestralReturn";

/**
 * **WHETHER A DEATH STEP IS STILL DUE** (06 §9; the B3 review): a character, at 0
 * Health or below, short of the third step. Asked by the one Death Step door before a
 * holder is asked and again after the ask comes back - a heal, a Tether or the offer
 * can land while a holder's dialog stands open (up to `ASK_MS`), and a step written
 * then was written on a character no longer Dying; and a character already at its
 * third step is past every hold, so none is asked or paid for.
 *
 * @param {{type?: string, health?: number|null, steps?: number, max?: number}} o
 * @returns {boolean}
 */
export function deathStepDue({ type = "character", health = null, steps = 0, max = 3 } = {}) {
  if (type !== "character") return false;
  if (typeof health !== "number" || !Number.isFinite(health) || health > 0) return false;
  return whole(steps) < Math.max(1, whole(max) || 3);
}

/**
 * **HOW LONG A REMOTE YES MAY WAIT ON ITS PAYMENT** (the B3 review, after the blow
 * doors' `remote` shape): the asker stops waiting `askMs` after it asked, and a yes
 * that pays first and answers after can land when the step is already written - paid
 * for nothing (the queue's ten seconds on the Reaction, D-761, after a dialog that
 * closed at the last moment). The holder's handler pays while this many milliseconds
 * are left, then answers whatever the payment is doing; `graceMs` is the answer's own
 * way back.
 *
 * @param {{startedAt?: number, now?: number, askMs?: number, graceMs?: number}} o
 * @returns {number}  milliseconds, never below 0
 */
export function holdAnswerWithin({ startedAt = 0, now = 0, askMs = 30000, graceMs = 2000 } = {}) {
  const spent = Math.max(0, (Number(now) || 0) - (Number(startedAt) || 0));
  return Math.max(0, (Number(askMs) || 0) - (Number(graceMs) || 0) - spent);
}

/**
 * **THE TOKEN A CREATURE'S STEP IS JUDGED ON** (the B3 review: the holds and Burial
 * Ground read the VIEWED scene, and the active GM who runs a turn's step may be
 * viewing another): the creature's own token on its fight's scene, else on the viewed
 * scene, else the first it has on any scene. Null where it has none.
 *
 * @param {Array<{sceneId: string|null}>} tokens  the creature's token documents, plain
 * @param {{fightSceneId?: string|null, viewedSceneId?: string|null}} [o]
 * @returns {object|null}  one of `tokens`
 */
export function stepTokenOf(tokens = [], { fightSceneId = null, viewedSceneId = null } = {}) {
  const list = (Array.isArray(tokens) ? tokens : []).filter(t => t && typeof t === "object");
  for (const id of [fightSceneId, viewedSceneId]) {
    if (!id) continue;
    const hit = list.find(t => t.sceneId === id);
    if (hit) return hit;
  }
  return list[0] ?? null;
}

/** Why a hold is not offered or refused at the press, each an `AZEROTH.DeathHold.Refuse.*` tail. */
export const DEATH_HOLD_REFUSALS = Object.freeze(["unknown", "down", "noUses", "tooFar", "short", "noReaction", "self", "realm"]);

/** Why Ancestral Spirit is refused, as `lang/en.json` keys. */
export const REVIVE_REFUSALS = Object.freeze({
  one: "AZEROTH.Revive.OneTarget",
  far: "AZEROTH.Revive.TooFar",
  notDead: "AZEROTH.Revive.NotThird",
  late: "AZEROTH.Revive.TooLate",
  tether: "AZEROTH.Revive.NoTether",
  twice: "AZEROTH.Revive.Twice",
  notCharacter: "AZEROTH.Revive.NotCharacter"
});

const whole = v => Math.max(0, Math.trunc(Number(v)) || 0);

/** A row's clauses at a rank. */
function atRank(row, rank) {
  const out = { ...(row ?? {}) };
  delete out.atRank;
  for (const clause of Array.isArray(row?.atRank) ? row.atRank : []) {
    if ((Number(rank) || 0) >= (Number(clause?.rank) || Infinity)) {
      const { rank: _r, ...rest } = clause;
      Object.assign(out, rest);
    }
  }
  return out;
}

/**
 * **THE HOLDS A HOLDER'S TALENTS GIVE** (04's Hold the Thread): one per taken talent
 * whose row carries `deathHold`, at its rank, sorted by identifier.
 *
 * @param {Array} talents  `AzerothActor#takenTalents`' shape
 * @param {Function} rowOf  `talent-effects.mjs#talentEffect`
 * @returns {Array<{identifier: string, name: string, talentId: string|null, feet: number, cost: {pool: string, amount: number}|null}>}
 */
export function deathHoldsFor(talents = [], rowOf = null) {
  const out = [];
  for (const t of [...(talents ?? [])].filter(x => (Math.trunc(Number(x?.taken)) || 0) > 0)
    .sort((a, b) => String(a.identifier).localeCompare(String(b.identifier)))) {
    const raw = rowOf?.(t.className, t.identifier, t.race ?? null)?.deathHold ?? null;
    if (!raw || typeof raw !== "object") continue;
    const row = atRank(raw, Math.max(1, Math.trunc(Number(t.taken)) || 1));
    const feet = whole(row.feet);
    if (!(feet > 0)) continue;
    const pool = typeof row.cost?.pool === "string" && row.cost.pool ? row.cost.pool : null;
    out.push({
      identifier: String(t.identifier), name: String(t.name ?? ""), talentId: t.id ?? null, feet,
      cost: pool ? { pool, amount: whole(row.cost.amount) } : null
    });
  }
  return out;
}

/**
 * **WHETHER A HOLDER MAY HOLD THIS CREATURE BACK** - judged before the holder is
 * asked, and again on the holder's own client before anything is spent (D-768's
 * order): the holder standing and in the living world, a use left, within the feet,
 * the Mana in hand and a Reaction left. *A creature* is any creature but the holder:
 * a holder at a Death Step of its own is Dying, and the Dying take no Reaction.
 *
 * @param {{feet: number, cost?: {amount: number}|null}} row  `deathHoldsFor`'s
 * @param {{distance?: number|null, usesLeft?: number, holderUp?: boolean, reactionLeft?: boolean,
 *   poolValue?: number|null, self?: boolean, inRealm?: boolean}} facts
 * @returns {{ok: boolean, reason: string|null}}
 */
export function deathHoldJudgement(row, { distance = null, usesLeft = 0, holderUp = true, reactionLeft = true, poolValue = null, self = false, inRealm = false } = {}) {
  if (!row || !(whole(row.feet) > 0)) return { ok: false, reason: "unknown" };
  if (self === true) return { ok: false, reason: "self" };
  if (holderUp !== true) return { ok: false, reason: "down" };
  if (inRealm === true) return { ok: false, reason: "realm" };
  if (!(whole(usesLeft) > 0)) return { ok: false, reason: "noUses" };
  if (typeof distance !== "number" || !Number.isFinite(distance) || distance > row.feet) return { ok: false, reason: "tooFar" };
  const price = whole(row.cost?.amount);
  if (price > 0 && !(whole(poolValue) >= price)) return { ok: false, reason: "short" };
  if (reactionLeft !== true) return { ok: false, reason: "noReaction" };
  return { ok: true, reason: null };
}

/**
 * **WHETHER AN AREA SPARES A DYING CREATURE THE STEP AN ATTACK ADDS** (04's Burial
 * Ground at rank 2): one rider standing on it - read off the areas it stands in, as
 * `area-ticks.mjs#ridersFor` hands them for a creature the caster counts as an
 * ally - says `noDeathStep`.
 *
 * @param {Array<{row?: object}>} riders  `ridersFor`'s
 * @returns {boolean}
 */
export function deathStepSpared(riders = []) {
  return (riders ?? []).some(r => (r?.row ?? r)?.noDeathStep === true);
}

/**
 * **THE THIRD DEATH STEP, AS IT IS TAKEN** - the moment, for Ancestral Spirit's
 * *since the end of your last turn*. Null where the step is not the third.
 *
 * @param {{steps: number, max?: number, combatId?: string|null, round?: number|null, turn?: number|null, time?: number}} o
 * @returns {{combatId: string|null, round: number|null, turn: number|null, time: number}|null}
 */
export function thirdStepAt({ steps = 0, max = 3, combatId = null, round = null, turn = null, time = 0 } = {}) {
  if (whole(steps) < Math.max(1, whole(max) || 3)) return null;
  const n = v => (Number.isFinite(Number(v)) && v !== null ? Math.trunc(Number(v)) : null);
  return { combatId: typeof combatId === "string" && combatId ? combatId : null, round: n(round), turn: n(turn), time: Number(time) || 0 };
}

/**
 * A third step's record as it may stand, cleaned, or null.
 *
 * @param {unknown} raw
 */
export function cleanThirdStep(raw) {
  if (!raw || typeof raw !== "object") return null;
  const n = v => (v !== null && v !== undefined && Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);
  return { combatId: typeof raw.combatId === "string" && raw.combatId ? raw.combatId : null, round: n(raw.round), turn: n(raw.turn), time: Number(raw.time) || 0 };
}

/**
 * **WHETHER A THIRD STEP CAME SINCE THE END OF THE USER'S LAST TURN** (04's
 * Ancestral Spirit). In the user's fight: the user's last turn ended at its own
 * place in the order (`own`) in this round where that place is already behind the
 * turn now, else the round before - and the step counts where it came after that
 * point. **Out of a fight, or in another fight: until the GM moves the world's clock**
 * (the lead, 2026-10-22: *"Until the GM moves the clock"*; it was B3's six seconds, a
 * reading) - Foundry's world clock does not move by itself outside a fight, so the
 * window stands while the world's time reads the moment the step was taken, and a
 * clock moved either way closes it.
 *
 * @param {{combatId?: string|null, round?: number|null, turn?: number|null, time?: number}|null} step
 * @param {{combatId?: string|null, round?: number|null, turn?: number|null, own?: number|null, time?: number}} now
 */
export function sinceLastTurnEnd(step, { combatId = null, round = null, turn = null, own = null, time = 0 } = {}) {
  const s = cleanThirdStep(step);
  if (!s) return false;
  const inFight = typeof combatId === "string" && combatId && s.combatId === combatId
    && Number.isFinite(Number(round)) && Number.isFinite(Number(turn)) && Number.isFinite(Number(own))
    && s.round !== null && s.turn !== null;
  if (!inFight) return (Number(time) || 0) === s.time;
  const r = Math.trunc(Number(round));
  const t = Math.trunc(Number(turn));
  const o = Math.trunc(Number(own));
  // Where the user's last turn ended: this round where its place is behind the turn
  // now, else the round before (on the user's own turn, the round before).
  const end = t > o ? { round: r, turn: o } : { round: r - 1, turn: o };
  return s.round > end.round || (s.round === end.round && s.turn > end.turn);
}

/**
 * **ANCESTRAL SPIRIT'S USE** (`onUse.revive {feet, health}`), or null.
 *
 * @param {object|null} onUse
 * @returns {{feet: number, health: "half"}|null}
 */
export function reviveOf(onUse) {
  const raw = onUse?.revive;
  if (!raw || typeof raw !== "object") return null;
  const feet = whole(raw.feet);
  return feet > 0 ? { feet, health: "half" } : null;
}

/**
 * **WHY A CREATURE MAY NOT BE CALLED BACK**, a `REVIVE_REFUSALS` key or null:
 * nobody named or more than one, too far, not at its third step, a third step taken
 * before the user's last turn ended, no Tether left, or called back this way before.
 *
 * @param {{named?: number, character?: boolean, distance?: number|null, feet?: number, steps?: number, max?: number,
 *   recent?: boolean, tether?: number, returned?: boolean}} o
 * @returns {string|null}
 */
export function reviveRefusal({ named = 0, character = true, distance = null, feet = 30, steps = 0, max = 3, recent = false, tether = 0, returned = false } = {}) {
  if (whole(named) !== 1) return REVIVE_REFUSALS.one;
  if (character !== true) return REVIVE_REFUSALS.notCharacter;
  if (whole(steps) < Math.max(1, whole(max) || 3)) return REVIVE_REFUSALS.notDead;
  if (distance !== null && (typeof distance !== "number" || distance > whole(feet))) return REVIVE_REFUSALS.far;
  if (recent !== true) return REVIVE_REFUSALS.late;
  if (!(whole(tether) > 0)) return REVIVE_REFUSALS.tether;
  if (returned === true) return REVIVE_REFUSALS.twice;
  return null;
}

/**
 * **THE HEALTH A CREATURE CALLED BACK STANDS AT** (*half its maximum Health, rounded
 * down*), never below 1: it *stands*, and 0 would leave it where it was.
 *
 * @param {number} max
 */
export function revivedHealth(max) {
  return Math.max(1, Math.floor(whole(max) / 2));
}

/**
 * The once-in-a-life mark, cleaned: `{by, at}`, or null.
 *
 * @param {unknown} raw
 */
export function cleanReturned(raw) {
  if (!raw || typeof raw !== "object") return null;
  return { by: typeof raw.by === "string" ? raw.by : "", at: Number(raw.at) || 0 };
}
