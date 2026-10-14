/**
 * **TEMPORARY HEALTH** (05, *Temporary Health*; D-777; the lead, 2026-10-03:
 * *"raise HP past max as temp hp"*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * 05 owns the rule, in four sentences this module is the law of:
 *
 * - *Damage comes off temporary Health first, and only what is left over
 *   touches your own* - `absorbDamage`, at the one damage door
 *   (`AzerothActor#applyDamage`) and at A1's Scorched and 10's Burning, which
 *   are damage too (`AzerothActor#takeStraightDamage`). A1's Bleeding is *you
 *   lose X Health* - not damage - and never touches it.
 * - *It does not stack. A second grant replaces the first if it is larger and
 *   is wasted if it is not* - `grantTemporary`. 07's Power Word: Shield and Ice
 *   Barrier add *a second casting replaces the first*: the same source granting
 *   the same amount again refreshes its span (MY READING, for the lead: the two
 *   sentences agree but for a tie, and the entry's own words decide its own
 *   tie).
 * - *Healing never restores it, and it is not counted when a rule asks for your
 *   maximum Health or half of it* - it is its own field, `system.health.temp`,
 *   and nothing that reads `health.max` or `health.value` sees it.
 * - *It lasts as long as the thing that granted it says, and no rest returns
 *   it* - every grant carries a SPAN (`TEMP_SPANS`) on its record, and
 *   `temporaryEnds` says when it goes: with the laid effect that carried it
 *   (a spell's or a draught's span, which core counts), at the end of the
 *   holder's fight (*until the encounter ends*), or at a Long Rest. A grant
 *   whose words name no span lasts until the next Long Rest, and every
 *   temporary Health is lost at a Long Rest (the rulings' READING, 2026-10-03,
 *   for the lead).
 *
 * The lead's *"raise HP past max"* is how it is DRAWN: the sheet prints the
 * temporary Health after the maximum, in words, as Health raised past it
 * (`temporaryOnSheet`).
 */

/** The actor flag a grant's record stands under, beside `system.health.temp`. */
export const TEMP_FLAG = "temporaryHealth";

/**
 * How long a grant lasts (05: *as long as the thing that granted it says*):
 *
 * - `effect`    with the Active Effect the door laid beside it - a spell's
 *               minute, a draught's hour - which core expires (D-628);
 * - `encounter` until the holder's fight ends (04's Last Stand and Living Seed:
 *               *until the encounter ends*);
 * - `longRest`  until the next Long Rest (07's drains: *until your next Long
 *               Rest*; and any grant whose words name no span).
 */
export const TEMP_SPANS = Object.freeze(["effect", "encounter", "longRest"]);

/** The occasions a grant can end on (`temporaryEnds`). */
export const TEMP_OCCASIONS = Object.freeze(["longRest", "encounterEnd", "effectGone"]);

/** A number as temporary Health: a whole number, never below nothing. */
export function wholeTemp(value) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * A grant's record as it is stored, cleaned: the source's name, its span, and
 * the effect or fight it hangs on. Null where it names no span this module
 * knows - a record a macro wrote by hand reads as none, and the temporary
 * Health it guarded then lasts until a Long Rest.
 *
 * @param {object|null} record
 * @returns {{source: string, span: string, effectId: string|null, combatId: string|null}|null}
 */
export function cleanTempRecord(record) {
  if (!record || typeof record !== "object") return null;
  if (!TEMP_SPANS.includes(record.span)) return null;
  const id = v => (typeof v === "string" && v ? v : null);
  return {
    source: typeof record.source === "string" ? record.source : "",
    span: record.span,
    effectId: record.span === "effect" ? id(record.effectId) : null,
    combatId: record.span === "encounter" ? id(record.combatId) : null
  };
}

/**
 * **A GRANT, JUDGED** (05: *It does not stack. A second grant replaces the
 * first if it is larger and is wasted if it is not*).
 *
 * @param {{temp?: number, record?: object|null}} held  what the creature holds now
 * @param {{amount?: number, source?: string, span?: string, effectId?: string|null, combatId?: string|null}} grant
 * @returns {{applies: boolean, temp: number, record: object|null, reason: "larger"|"refreshed"|"smaller"|"nothing"}}
 *   `temp` and `record` are what the creature holds afterwards
 */
export function grantTemporary(held = {}, grant = {}) {
  const temp = wholeTemp(held?.temp);
  const record = cleanTempRecord(held?.record ?? null);
  const amount = wholeTemp(grant?.amount);
  if (amount <= 0) return { applies: false, temp, record, reason: "nothing" };
  const next = cleanTempRecord({
    source: grant.source ?? "", span: TEMP_SPANS.includes(grant.span) ? grant.span : "longRest",
    effectId: grant.effectId ?? null, combatId: grant.combatId ?? null
  });
  if (amount > temp) return { applies: true, temp: amount, record: next, reason: "larger" };
  // 07's *a second casting replaces the first*: the same source, the same size,
  // its span refreshed.
  if (amount === temp && record && next && record.source && record.source === next.source) {
    return { applies: true, temp: amount, record: next, reason: "refreshed" };
  }
  return { applies: false, temp, record, reason: "smaller" };
}

/**
 * **DAMAGE COMES OFF TEMPORARY HEALTH FIRST** (05): what is left of it, what is
 * left of the damage for the creature's own Health, and what it took.
 *
 * @param {{temp?: number, amount?: number}} o
 * @returns {{temp: number, amount: number, absorbed: number}}
 */
export function absorbDamage({ temp = 0, amount = 0 } = {}) {
  const t = wholeTemp(temp);
  const a = wholeTemp(amount);
  const absorbed = Math.min(t, a);
  return { temp: t - absorbed, amount: a - absorbed, absorbed };
}

/**
 * **WHETHER A GRANT ENDS ON AN OCCASION** (05: *It lasts as long as the thing
 * that granted it says*):
 *
 * - `{kind: "longRest"}`: always - every temporary Health is lost at a Long Rest
 *   (the rulings' READING, 2026-10-03), the unsourced kind a GM typed included;
 * - `{kind: "encounterEnd", combatId}`: a grant that lasts *until the encounter
 *   ends*, from that fight or from none (granted out of one, it ends with the
 *   next fight the holder leaves);
 * - `{kind: "effectGone", effectId}`: a grant that rode that effect.
 *
 * @param {object|null} record
 * @param {{kind?: string, combatId?: string|null, effectId?: string|null}} occasion
 * @returns {boolean}
 */
export function temporaryEnds(record, occasion = {}) {
  if (occasion?.kind === "longRest") return true;
  const r = cleanTempRecord(record);
  if (!r) return false;
  if (occasion?.kind === "encounterEnd") {
    return r.span === "encounter" && (!r.combatId || !occasion.combatId || r.combatId === occasion.combatId);
  }
  if (occasion?.kind === "effectGone") {
    return r.span === "effect" && Boolean(r.effectId) && r.effectId === occasion.effectId;
  }
  return false;
}

/**
 * **HEALING ABOVE THE MAXIMUM, KEPT** (07's Grave Coil and Exsanguinate: *any of
 * it above your Health maximum is kept as temporary Health until your next Long
 * Rest*): what a heal would have restored beyond the room the creature had.
 *
 * @param {{before?: number, max?: number, healed?: number}} o
 * @returns {number}
 */
export function overflowTemporary({ before = 0, max = 0, healed = 0 } = {}) {
  const room = Math.max(0, wholeTemp(max) - Math.max(0, Math.trunc(Number(before)) || 0));
  return Math.max(0, wholeTemp(healed) - room);
}

/** The span a sentence names, or null where it names none. */
function spanOf(sentence) {
  if (/\buntil the end of the encounter\b|\buntil the encounter ends\b/i.test(sentence)) return "encounter";
  if (/\buntil your next Long Rest\b/i.test(sentence)) return "longRest";
  if (/\bfor the duration\b|\bfor (?:one|an) (?:hour|minute)\b/i.test(sentence)) return "effect";
  return null;
}

/** 05's ladder of multiples, in words. */
const TIMES = Object.freeze({ "": "", twice: "2*", "three times": "3*" });

/**
 * **WHAT A SPELL'S, A DRAUGHT'S OR A SIGNATURE'S WORDS GRANT** (07, 08 §12, 08
 * §20), read off the prose only where the words are unambiguous (D-647's rule):
 *
 * - *gains 6 temporary Health*, *and 15 temporary Health* - an amount;
 * - *gain temporary Health equal to twice your level* - an expression in
 *   `level` or `tier`, for the door's `evaluateAmount`;
 * - *any of it above your Health maximum is kept as temporary Health* - the
 *   heal's OVERFLOW;
 * - and the span the same sentence names (`spanOf`).
 *
 * What a door cannot read carries a `reason` and no amount: 07's Consume
 * (*equal to twice its remaining Health* - a demon's) and Grove (*any that do
 * end it with 5 temporary Health* - a rest the table runs).
 *
 * @param {string} text  HTML or plain
 * @returns {{amount: string|null, span: string|null, overflow: boolean, reason: string|null}|null}
 *   null where the words grant no temporary Health
 */
export function readTemporaryHealth(text = "") {
  const flat = String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  if (!/temporary Health/i.test(flat)) return null;
  for (const sentence of flat.split(/(?<=[.!?])\s+/)) {
    if (!/temporary Health/i.test(sentence)) continue;
    if (/\babove your Health maximum is kept as temporary Health\b/i.test(sentence)) {
      return { amount: null, span: spanOf(sentence) ?? "longRest", overflow: true, reason: null };
    }
    if (/\btemporary Health equal to twice its remaining Health\b/i.test(sentence)) {
      return { amount: null, span: null, overflow: false, reason: "remaining" };
    }
    if (/\bend it with \d+ temporary Health\b/i.test(sentence)) {
      return { amount: null, span: null, overflow: false, reason: "rest" };
    }
    let m = /\b(?:gains?|and)\s+(\d+)\s+temporary Health\b/i.exec(sentence);
    if (m) return { amount: m[1], span: spanOf(sentence), overflow: false, reason: null };
    m = /\btemporary Health equal to (twice |three times )?your (level|tier)\b/i.exec(sentence);
    if (m) return { amount: `${TIMES[(m[1] ?? "").trim()] ?? ""}${m[2].toLowerCase()}`, span: spanOf(sentence), overflow: false, reason: null };
  }
  return { amount: null, span: null, overflow: false, reason: "unread" };
}

/**
 * What the sheet draws beside the Health (the lead's *"raise HP past max"*):
 * the amount and where it came from, or null where there is none.
 *
 * @param {{temp?: number, record?: object|null}} o
 * @returns {{n: number, source: string, span: string|null}|null}
 */
export function temporaryOnSheet({ temp = 0, record = null } = {}) {
  const n = wholeTemp(temp);
  if (!n) return null;
  const r = cleanTempRecord(record);
  return { n, source: r?.source ?? "", span: r?.span ?? null };
}

/**
 * **THE SOURCE GUARD** (CLAUDE.md §15): `health.temp` cleaned where it is
 * PRESENT - a negative, a fraction or a word would otherwise refuse the whole
 * actor at load - and nothing written where it is not, because `migrateData`
 * runs over a partial update as readily as over a stored document.
 *
 * @param {object} source  an actor model's `system` source, mutated in place
 * @returns {object}
 */
export function cleanTempSource(source) {
  const health = source?.health;
  if (!health || typeof health !== "object" || !("temp" in health)) return source;
  health.temp = wholeTemp(health.temp);
  return source;
}
