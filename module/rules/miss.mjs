/**
 * **A HIT TURNED INTO A MISS WITHDRAWS EVERYTHING IT LAID** (the Legacy branches'
 * door 13; the lead: *"Conditions only apply on hit unless otherwise stated"*).
 * Pure: no Foundry imports (CLAUDE.md §3).
 *
 * An attack's card lands what its hit lays with no button pressed (the lead,
 * 2026-10-03: *"Lands automatically"*), and it records each landing on itself -
 * D-779 recorded the conditions so a Parry that holds could take them back
 * (`class-answers.mjs#parryUndoes`). A hit can lay more than a condition, and the
 * Blademaster's Afterimage (*As a Reaction when an attack hits you, spend 6 Rage.
 * The attack misses*) turns a hit into a miss outright, so the record is widened
 * to every kind of landing and this is its one reading, for the Parry and for
 * Afterimage alike:
 *
 *   condition  a condition laid (Deep Cut's, a rider's, Rupture's): off again, or
 *              back to the value it had before the blow - `parryUndoes` itself
 *   reaction   a Reaction the blow took (Concussive Shot at rank 2, Waylay, Bash):
 *              given back, unless the Reaction that answered the blow WAS that
 *              one (`answeredWithLost`) - the creature spent it answering, and
 *              the turn's budget comes out as it would have
 *   speedDrop  a Speed drop laid (Wing Clip): the effect deleted, by its id
 *   noHealing  a no-healing mark laid (Mortal Strike, Black Arrow): deleted
 *   bane       a Bane laid on its next Test (Stormstrike, Jinx): deleted
 *   test       a Test the hit offered on the card (Intimidation, a poison's,
 *              Keening Arrows'): withdrawn - the card's press refuses it in words
 *              once the row says the hit was withdrawn (`annotate.mjs`)
 *
 * And a rider the ATTACKER paid only because the blow landed (`pays: "hit"`,
 * Bloodthirst's *When one of your attacks hits, spend 6 Rage*) is refunded into
 * the pool it came from (`missRefunds`): the hit that was its trigger did not
 * happen.
 *
 * **AND THE MOMENTUM THE HIT BUILT COMES BACK OFF** (the lead, 2026-10-21: *"Yes, take
 * it back"*, which changes D-779's Parry too): every pool the hit raised, on whoever
 * holds it (`missWithdrawals`), and the once-a-round marks its further gains spent
 * are given back (`rules/riders.mjs#roundRelease`; the lead's O-171, *a hit that gains
 * nothing spends no once*). Both, and the rider's refund, are settled ONCE, when the
 * last of the card's rows is withdrawn (`everyRowWithdrawn`): a blow that landed on
 * two is still a hit on the one nobody answered.
 */

import { parryUndoes } from "./class-answers.mjs";

/** The kinds of landing a card records, by what a hit lays. */
export const HIT_RECORD_KINDS = Object.freeze(["condition", "reaction", "speedDrop", "noHealing", "bane", "test"]);

/** The landings that are an Active Effect on the creature struck, withdrawn by deleting it. */
const EFFECT_KINDS = Object.freeze(["speedDrop", "noHealing", "bane"]);

/**
 * **ONE ROW OF THE CARD'S LANDING RECORD, CLEANED**. A row D-779 wrote carries no
 * `kind` and is a condition's, read exactly as it was.
 *
 * @param {object} raw
 * @returns {object|null}
 */
export function hitRecordRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const index = Number.isInteger(raw.index) ? raw.index : null;
  if (index === null || index < 0) return null;
  const kind = raw.kind === undefined || raw.kind === null ? "condition" : raw.kind;
  if (!HIT_RECORD_KINDS.includes(kind)) return null;
  if (kind === "condition") {
    if (typeof raw.id !== "string" || !raw.id) return null;
    return {
      index, kind, id: raw.id, landed: raw.landed === true, had: typeof raw.had === "boolean" ? raw.had : null, prior: raw.prior ?? null,
      // The layer this landing ADDED to the condition's `laidBy` (the B1 review).
      laidByAdded: typeof raw.laidByAdded === "string" && raw.laidByAdded ? raw.laidByAdded : null
    };
  }
  if (kind === "reaction") return { index, kind, lost: raw.lost === true };
  if (kind === "test") return { index, kind, name: String(raw.name ?? "") };
  const effectId = typeof raw.effectId === "string" && raw.effectId ? raw.effectId : null;
  return { index, kind, landed: raw.landed === true && Boolean(effectId), effectId, source: String(raw.source ?? "") };
}

/**
 * **WHAT WITHDRAWING THE HIT ON ONE TARGET DOES**, on the creature struck.
 *
 * **AND THE LAYER IT NAMED** (the B1 review): a condition the creature ALREADY had keeps
 * its effect, and the striker this landing added to its `laidBy` comes back off it
 * (`strips`) - one the condition goes with entirely needs none.
 *
 * @param {Array<object>} record  the card's `landedOnHit`
 * @param {{index?: number|null, answeredWithLost?: boolean}} [o]  the target's row on
 *   the card; whether the Reaction that answered was the one the blow took
 * @returns {{conditions: Array<{id: string, remove: boolean, value: number|null}>, effects: string[],
 *   reaction: boolean, tests: boolean, strips: Array<{id: string, uuid: string}>}}
 */
export function missUndoes(record = [], { index = null, answeredWithLost = false } = {}) {
  const rows = (record ?? []).map(hitRecordRow).filter(r => r && r.index === index);
  const effects = [...new Set(rows.filter(r => EFFECT_KINDS.includes(r.kind) && r.landed && r.effectId).map(r => r.effectId))].sort();
  const conditions = parryUndoes(rows.filter(r => r.kind === "condition"));
  const removed = new Set(conditions.filter(c => c.remove).map(c => c.id));
  const strips = [];
  const seen = new Set();
  for (const r of rows) {
    if (r.kind !== "condition" || !r.landed || r.had !== true || !r.laidByAdded || removed.has(r.id)) continue;
    const key = `${r.id}|${r.laidByAdded}`;
    if (seen.has(key)) continue;
    seen.add(key);
    strips.push({ id: r.id, uuid: r.laidByAdded });
  }
  strips.sort((a, b) => a.id.localeCompare(b.id) || a.uuid.localeCompare(b.uuid));
  return {
    conditions,
    effects,
    reaction: !answeredWithLost && rows.some(r => r.kind === "reaction" && r.lost === true),
    tests: rows.some(r => r.kind === "test"),
    strips
  };
}

/**
 * **WHETHER THE BLOW TOOK THIS TARGET'S REACTION** - so the Reaction that answers
 * it may be that one (door 13): a Bash that costs a creature its Reaction does
 * not also stop it answering the Bash.
 *
 * @param {Array<object>} record
 * @param {number|null} index
 */
export function reactionLostToBlow(record = [], index = null) {
  return (record ?? []).map(hitRecordRow).some(r => r && r.index === index && r.kind === "reaction" && r.lost === true);
}

/**
 * **WHETHER A CARD'S ROW WAS TURNED INTO A MISS** (door 13): `dice/annotate.mjs` writes
 * `withdrawn` on the row a Parry that held or Afterimage answered. Every press the hit
 * offered on that row is refused from then on (the B1 review): the Apply, a trait's
 * condition, a Bane, the Critical Injury (row 0's), a Test, what the creature struck
 * answers back, Blade Flurry's half. A row that is not there was no hit to withdraw.
 *
 * @param {object|null} flags  the card's `flags["azeroth-rpg"]`
 * @param {number|string|null|undefined} index  the row, as a button's `data-*` carries it
 * @returns {boolean}
 */
export function rowWithdrawn(flags, index) {
  if (index === null || index === undefined || index === "") return false;
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0) return false;
  return flags?.damageByTarget?.[i]?.withdrawn === true;
}

/**
 * **WHETHER THE BLOW NOW HITS NOBODY** (door 13, the lead's *"Yes, take it back"*): every
 * row of the card withdrawn. What the hit gave the striker - the Momentum it built, a
 * rider it paid for on the hit - comes back only then: a blow that landed on two is
 * still a hit on the one nobody answered.
 *
 * @param {Array<object|null>} rows  the card's `damageByTarget`, as it now stands
 * @returns {boolean}
 */
export function everyRowWithdrawn(rows = []) {
  const hits = (rows ?? []).filter(r => r && typeof r === "object");
  return hits.length > 0 && hits.every(r => r.withdrawn === true);
}

/** Why a Use that turns a hit into a miss is refused, as `lang/en.json` keys (door 13). */
export const NEGATE_REFUSALS = Object.freeze({
  card: "AZEROTH.Miss.NeedsCard",
  row: "AZEROTH.Miss.NotYours",
  hit: "AZEROTH.Miss.NotAHit",
  withdrawn: "AZEROTH.Miss.AlreadyMissed",
  unanswered: "AZEROTH.Reaction.Refuse.Unanswered"
});

/**
 * **WHETHER AFTERIMAGE MAY ANSWER THIS BLOW** (04: *As a Reaction when an attack
 * hits you, spend 6 Rage. The attack misses*; door 13), judged before anything is
 * paid: the Use names the incoming card's row it answers, the row is the user's,
 * the attack hit that row, no Parry or Afterimage has already turned it into a
 * miss, and the striker is not one no creature may take a Reaction against
 * (door 14). Every fact defaults CLOSED, so a door that names none is refused.
 *
 * @param {{named?: boolean, own?: boolean, hit?: boolean, withdrawn?: boolean, unanswered?: boolean}} o
 * @returns {string|null}  a lang key, or null where it may answer
 */
export function negateRefusal({ named = false, own = false, hit = false, withdrawn = false, unanswered = false } = {}) {
  if (named !== true) return NEGATE_REFUSALS.card;
  if (own !== true) return NEGATE_REFUSALS.row;
  if (hit !== true) return NEGATE_REFUSALS.hit;
  if (withdrawn === true) return NEGATE_REFUSALS.withdrawn;
  if (unanswered === true) return NEGATE_REFUSALS.unanswered;
  return null;
}

/**
 * **THE RIDERS PAID ON THE HIT, TO REFUND** (Bloodthirst's `pays: "hit"`): one
 * row a pool, the amounts summed, nothing where nothing was paid. The card
 * records them with the attacker's uuid; the defender's client asks the
 * attacker's owner - or the GM - to write them back.
 *
 * @param {Array<{actorUuid?: string, itemId?: string|null, kind?: string, pool?: string, amount?: number}>} paid
 * @returns {Array<{actorUuid: string, itemId: string|null, kind: string, pool: string, amount: number}>}
 */
export function missRefunds(paid = []) {
  return byPool(paid);
}

/**
 * One row a creature's pool, the amounts summed, nothing where nothing moved -
 * the shape a refund and a take-back share. Sorted by creature, pool and item, so
 * the writes and the card's words never wobble.
 */
function byPool(rows = []) {
  const out = new Map();
  for (const p of rows ?? []) {
    const amount = Math.max(0, Math.trunc(Number(p?.amount)) || 0);
    if (!amount || typeof p?.actorUuid !== "string" || !p.actorUuid || typeof p.pool !== "string" || !p.pool) continue;
    const kind = p.kind === "momentum" || p.kind === "power" ? p.kind : null;
    if (!kind) continue;
    const key = `${p.actorUuid}|${p.itemId ?? ""}|${kind}|${p.pool}`;
    const held = out.get(key) ?? { actorUuid: p.actorUuid, itemId: p.itemId ?? null, kind, pool: p.pool, amount: 0 };
    held.amount += amount;
    out.set(key, held);
  }
  return [...out.values()].sort((a, b) => a.actorUuid.localeCompare(b.actorUuid) || a.pool.localeCompare(b.pool) || String(a.itemId).localeCompare(String(b.itemId)));
}

/**
 * **THE MOMENTUM THE HIT BUILT, TO TAKE BACK** (the lead, 2026-10-21: *"Yes, take it
 * back"* - a hit turned into a miss withdraws the Momentum it built as well as its
 * conditions, D-779's Parry included). The card records every pool the hit raised -
 * 05 §11's gain on the striker's Momentum pools (Rage, Combo Points, Quarry, Ferocity,
 * Zeal; a Fast weapon's point and a further gain's `poolExtra` among it), a Power
 * pool's `poolExtra` (04's Aimed Volley's Focus), a companion's hit on its owner's
 * Quarry (Shared Quarry), a construct's on its tinker's Combo Points (Supercharge),
 * and the Combo Points a Finisher's SL returned (Ruthlessness) - each with the
 * creature that holds the pool; this is the take-back, one row a pool.
 *
 * @param {Array<{actorUuid?: string, itemId?: string|null, kind?: string, pool?: string, amount?: number}>} built
 * @returns {Array<{actorUuid: string, itemId: string|null, kind: string, pool: string, amount: number}>}
 */
export function missWithdrawals(built = []) {
  return byPool(built);
}

/**
 * The value a pool falls to when what a withdrawn hit built comes back off it - never
 * below nothing: a point already spent since is not taken twice.
 *
 * @param {{value: number}} pool
 * @param {number} amount
 */
export function withdrawnValue(pool, amount = 0) {
  const value = Math.trunc(Number(pool?.value)) || 0;
  return Math.max(0, value - Math.max(0, Math.trunc(Number(amount)) || 0));
}

/**
 * The value a pool takes back, never past its maximum.
 *
 * @param {{value: number, max: number}} pool
 * @param {number} amount
 */
export function refundedValue(pool, amount = 0) {
  const value = Math.trunc(Number(pool?.value)) || 0;
  const max = Math.trunc(Number(pool?.max));
  const back = value + Math.max(0, Math.trunc(Number(amount)) || 0);
  return Number.isFinite(max) ? Math.min(max, back) : back;
}
