/**
 * A Bane laid on ANOTHER creature. Pure: no Foundry imports.
 *
 * **Nothing in this system could say it.** A creature has `system.testBanes`
 * and `system.skillBanes`, but both are DERIVED on every preparation from its
 * own standing passive (`rules/ability-automation.mjs#passiveEffects`), so
 * nothing outside the creature could write one; a character had no such field
 * at all; and no condition in A1 means it. Three rules in the book say it
 * anyway, and every one of them was inert:
 *
 * - 06 §6's **Pummel** - *that creature takes two Banes on the next Casting
 *   Test it makes* - which reached the card as a note and applied nothing;
 * - 08 §20's **Gorehowl** - *every enemy within 30 feet that saw it takes a
 *   Bane on their next Attack Test* - which printed its sentence with no
 *   button, because a button that wrote nowhere is the shape D-681 keeps
 *   finding;
 * - two Classic finds, **Frightalon** and **The Cruel Hand of Timmy**, whose
 *   `onHit.bane` fired as a row and did the same nothing.
 *
 * This is the carrier, built once for all three.
 *
 * ## Why it is a FLAG on an Active Effect and not a `changes` entry
 *
 * CLAUDE.md §6 is explicit: *Active Effects change numbers, the roll pipeline
 * changes dice.* A Bane is dice - it is a second d20 kept low, not a modifier
 * on a stat - so the effect is the CARRIER and the CLOCK and nothing else, and
 * `rules/modifiers.mjs` reads it where every other Boon and Bane on a roll is
 * read. Writing it as a change on `system.testBanes.casting` as well would
 * count it twice, once through the model and once through the dialog.
 *
 * ## Why it is SPENT rather than merely expired
 *
 * *On the next Casting Test it makes* is a count, not a span, so the roll
 * deletes it: `effects/banes.mjs#spendLaidBanes` runs after the die on every
 * Test path. The v14 duration beside it is a backstop and nothing more - the
 * book states no span, and an effect nobody ever spends would otherwise sit on
 * a caster forever.
 */

import { AZEROTH } from "../config.mjs";

/** The flag a laid Bane rides on, under the system's own namespace. */
export const LAID_BANE_FLAG = "laidBane";

/** The kinds of Test a Bane may be laid on: the roll dialog's own four. */
export const BANE_KINDS = Object.freeze(Object.keys(AZEROTH.testKinds));

/** How many Banes one source may lay at once. Pummel's two is the book's most. */
export const MAX_LAID_BANES = 3;

/**
 * Zero for every kind of Test.
 *
 * The shape `system.testBoons`, `system.testBanes` and `system.laidBanes` all
 * take, on both actor types: a creature has had the first two since D-691 and
 * a character had neither, which is why nothing outside a creature's own
 * passive could put a Bane on a Test.
 */
export function emptyByTestKind() {
  return Object.fromEntries(BANE_KINDS.map(k => [k, 0]));
}

/** No Banes laid, one key per kind of Test. */
export function emptyLaidBanes() {
  return emptyByTestKind();
}

/**
 * One stored flag, cleaned, or null where it says nothing this can read.
 *
 * A kind outside the vocabulary and a count of zero both come back null: a row
 * that cannot be read must not silently become a Bane on some other Test.
 *
 * **A LASTING Bane is a span, not a count** (D-757): 07's Hailstorm lays *a Bane
 * on Attack Tests until the end of its next turn*, which every Attack Test in
 * the span takes and none spends - its effect's own duration is the clock. It
 * rides the same carrier and the same dialog line, and `spendLaidBanes` leaves
 * it standing.
 *
 * @param {object|null} raw  `{kind, banes, source, lasting}`
 * @returns {{kind: string, banes: number, source: string, lasting?: true}|null}
 */
export function cleanLaidBane(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = String(raw.kind ?? "");
  if (!LAID_BANE_KINDS.includes(kind)) return null;
  const banes = Math.trunc(Number(raw.banes));
  if (!Number.isFinite(banes) || banes < 1) return null;
  const row = { kind, banes: Math.min(MAX_LAID_BANES, banes), source: String(raw.source ?? "") };
  // **A BANE ON ATTACKS AGAINST ANYONE BUT ONE CREATURE** (04's Taunt and
  // Judgement, D-772): the creature it is NOT against, by its actor and token.
  const except = cleanExcept(raw.except);
  // **AND ONE ON ATTACKS AGAINST ONE CREATURE ALONE** (04's Feint: *The target's
  // next attack against you takes a Bane per rank*; D-773): the creature it IS
  // against, in the same shape.
  const only = cleanExcept(raw.only);
  const kept = { ...row, ...(except ? { except } : {}), ...(only ? { only } : {}) };
  return raw.lasting === true ? { ...kept, lasting: true } : kept;
}

/**
 * The kinds a Bane may be LAID on: the four Tests, and **every** Test (04's
 * Intimidation: *takes a Bane for one round per rank*, which names none; D-773).
 * `BANE_KINDS` stays the four, because it is the shape of a by-kind total.
 */
export const LAID_BANE_KINDS = Object.freeze([...BANE_KINDS, "all"]);

/**
 * Whether a laid Bane bears on a Test of this kind at this target: its own kind
 * or `all`, not against the creature it spares, and - for one laid against one
 * creature alone - against that creature. True, false, or null where the Test
 * names no target and only the table can say.
 *
 * @param {object} row  a cleaned row
 * @param {string} kind
 * @param {{actorId?: string|null, tokenId?: string|null}|null} target
 * @returns {boolean|null}
 */
export function baneBears(row, kind, target = null) {
  if (!row || (row.kind !== kind && row.kind !== "all")) return false;
  const spared = againstSpared(row.except ?? null, target);
  if (spared === true) return false;
  if (row.only) {
    if (!target || (!target.actorId && !target.tokenId)) return null;
    // `againstSpared` is the same match: the creature named, by token or actor.
    if (againstSpared(row.only, target) !== true) return false;
  }
  return spared === null ? null : true;
}

/** The creature a laid Bane is not against, or null: `{actorId, tokenId}` with at least one. */
function cleanExcept(raw) {
  if (!raw || typeof raw !== "object") return null;
  const actorId = typeof raw.actorId === "string" && raw.actorId ? raw.actorId : null;
  const tokenId = typeof raw.tokenId === "string" && raw.tokenId ? raw.tokenId : null;
  return actorId || tokenId ? { actorId, tokenId } : null;
}

/**
 * **WHETHER A TEST IS AGAINST THE ONE CREATURE A BANE SPARES** (Taunt's
 * *attacking anyone but you*; D-772): the target's token where both name one,
 * else its actor. Null - no target recorded - is nobody known, and the caller
 * makes the line the table's.
 *
 * @param {{actorId: string|null, tokenId: string|null}|null} except
 * @param {{actorId?: string|null, tokenId?: string|null}|null} target
 * @returns {boolean|null}
 */
export function againstSpared(except, target) {
  if (!except) return false;
  if (!target || (!target.actorId && !target.tokenId)) return null;
  if (except.tokenId && target.tokenId) return except.tokenId === target.tokenId;
  return Boolean(except.actorId) && except.actorId === target.actorId;
}

/**
 * Every laid Bane on one creature, cleaned and sorted.
 *
 * SORTED, because this becomes a line a person reads and an embedded
 * collection's order is not stable across a re-sync (CLAUDE.md §15).
 *
 * @param {Array<object|null>} raws  the stored flags, in any order
 */
export function laidBaneRows(raws = []) {
  return raws
    .map(cleanLaidBane)
    .filter(Boolean)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.source.localeCompare(b.source) || a.banes - b.banes);
}

/** The totals by kind of Test, in `emptyLaidBanes`' shape. A Bane on every Test counts on each. */
export function laidBaneTotals(rows = []) {
  const out = emptyLaidBanes();
  for (const row of laidBaneRows(rows)) {
    for (const kind of row.kind === "all" ? BANE_KINDS : [row.kind]) out[kind] += row.banes;
  }
  return out;
}

/**
 * The rows that bear on one kind of Test, as the roll dialog wants them:
 * the count it adds and the names it prints.
 *
 * **A Bane that spares one creature** (Taunt, Judgement; D-772) bears on a Test
 * against anybody else and on none against that creature; where the Test names
 * no target it is the table's (`judged`), since only the table knows who the
 * blow is aimed at.
 *
 * @param {Array<object>} rows
 * @param {string} kind
 * @param {{target?: {actorId?: string|null, tokenId?: string|null}|null}} [o]
 * @returns {{banes: number, names: string[], judged: {banes: number, names: string[]}}}
 */
export function laidBanesOn(rows = [], kind, { target = null } = {}) {
  // A Bane on every Test (D-773) bears on this one too, and one laid against one
  // creature alone (Feint) only on a Test against it: `baneBears` is the reading.
  const mine = laidBaneRows(rows).filter(r => r.kind === kind || r.kind === "all");
  const bears = [];
  const judged = [];
  for (const r of mine) {
    const verdict = baneBears(r, kind, target);
    if (verdict === false) continue;
    if (verdict === null) judged.push(r);
    else bears.push(r);
  }
  const out = {
    banes: bears.reduce((n, r) => n + r.banes, 0),
    names: bears.map(r => r.source).filter(Boolean)
  };
  // Only where there is one: every Bane before D-772 spares nobody, and reads
  // back in exactly the shape it always did.
  if (judged.length) out.judged = { banes: judged.reduce((n, r) => n + r.banes, 0), names: judged.map(r => r.source).filter(Boolean) };
  return out;
}

/**
 * **WHETHER A TEST OF THIS KIND SPENDS A LAID BANE** (06 §6's *the next Casting
 * Test it makes* is a count): a row that is not lasting, of this kind or of every
 * kind - and one laid against one creature alone (04's Feint, D-773) only by a
 * Test against that creature. A Test that names no target spends none of those:
 * whether it was against the Rogue is the table's, and the Bane waits for the
 * attack that is (MY READING, for the lead).
 *
 * @param {object|null} raw  a stored flag
 * @param {string} kind
 * @param {{actorId?: string|null, tokenId?: string|null}|null} [target]
 */
export function baneSpentBy(raw, kind, target = null) {
  const row = cleanLaidBane(raw);
  if (!row || row.lasting === true) return false;
  if (row.kind !== kind && row.kind !== "all") return false;
  if (row.only) return baneBears(row, kind, target) === true;
  return true;
}

/* -------------------------------------------- */
/*  A Boon laid on somebody else (D-772)         */
/* -------------------------------------------- */

/** The flag a laid Boon rides on: the Bane's twin (04's Blessing). */
export const LAID_BOON_FLAG = "laidBoon";

/** What a laid Boon may bear on: one kind of Test, or every kind (`all`). */
export const BOON_KINDS = Object.freeze([...BANE_KINDS, "all"]);

/**
 * One stored laid Boon, cleaned, or null (04's Blessing: *A friendly target you
 * can see gains a Boon on their next Test. At rank 2 it applies to every Test
 * they make this round*). The Bane's own rules: a count SPENT by the next Test
 * it bears on, or `lasting` - a span every Test in it takes and none spends.
 *
 * @param {object|null} raw  `{kind, boons, source, lasting}`
 */
export function cleanLaidBoon(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = String(raw.kind ?? "");
  if (!BOON_KINDS.includes(kind)) return null;
  const boons = Math.trunc(Number(raw.boons));
  if (!Number.isFinite(boons) || boons < 1) return null;
  const row = { kind, boons: Math.min(MAX_LAID_BANES, boons), source: String(raw.source ?? "") };
  return raw.lasting === true ? { ...row, lasting: true } : row;
}

/** Every laid Boon on one creature, cleaned and sorted (a person reads the line). */
export function laidBoonRows(raws = []) {
  return raws
    .map(cleanLaidBoon)
    .filter(Boolean)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.source.localeCompare(b.source) || a.boons - b.boons);
}

/** The rows that bear on one kind of Test: their own kind, and `all`. */
export function laidBoonsOn(rows = [], kind) {
  const mine = laidBoonRows(rows).filter(r => r.kind === kind || r.kind === "all");
  return {
    boons: mine.reduce((n, r) => n + r.boons, 0),
    names: mine.map(r => r.source).filter(Boolean)
  };
}

/** Whether a laid Boon is SPENT by a Test of this kind: a count, of its kind or `all`. */
export function boonSpentBy(raw, kind) {
  const row = cleanLaidBoon(raw);
  return Boolean(row) && row.lasting !== true && (row.kind === kind || row.kind === "all");
}
