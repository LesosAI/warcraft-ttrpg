/**
 * **DECAY X** (07 §9, D-865; the lead: *"spells that reduce AP should do so via a new
 * effect other talents can scale to be better"*, renamed *"rename to Decay"*, and its
 * form **a spell effect, defined once in 07, keeping the higher X**). Pure: no Foundry
 * imports (CLAUDE.md §3).
 *
 * 07 §9: *Decay X lowers a creature's Armor Points at every location by X, never below
 * 0. It lasts 1 minute. A creature carries one Decay at a time: a second application
 * keeps the higher X and starts the minute again, unless a talent says the two add
 * together. Decay is not one of the fifteen conditions, so Resolve does not shed it and
 * an effect that ends a condition does not end it.*
 *
 * ## The laid effect
 *
 * ONE Active Effect a creature, named *Decay X*, drawn on the token, carrying
 * `flags.azeroth-rpg.decay {value, by, source, until}` and, for each Armor Point
 * location the creature HAS, a `final` `subtract` of X and an `upgrade` to 0 after it
 * (`decayChanges`): Armor Points are derived, so a `final` change is what moves them
 * (CLAUDE.md §15), and a location the creature lacks is never made by a floor (06 §2).
 * `effects/decay.mjs#layDecay` is the ONE writer; the census in `decay.test.mjs` fails a
 * sand spell, or a Chronomancer talent row, that lowers Armor Points by another door.
 *
 * ## Who lays it, read off 07's words (`readSpellDecay`)
 *
 * - **on the hit**: Sand Blast and Hour of Dust *At SL 2 or better it also gains Decay
 *   N* (Hour of Dust's *which lasts until it finishes a Short Rest rather than 1
 *   minute*: `until: "shortRest"`), Epoch's and Desert's Weight's *takes N Physical
 *   damage and gains Decay N*;
 * - **on a failed Resist**: Sand Prison's *On a failure it is ... and gains Decay 1*,
 *   Drag of Ages' *gains Decay equal to half your Intelligence modifier, rounded down*;
 * - **an area's failed Test** (Withering Sands) rides the area's own check row
 *   (`area-ticks.mjs`, `fail.decay`), the retaliation (Scouring Veil) its descriptor,
 *   and the next weapon attack (Hourstrike) the next-attack promise - each handing the
 *   number to `layDecay`.
 *
 * **Talents scale it** (04's Erosion, Phase 5): `adds` and `cap` are a talent row's,
 * read by the door and passed to `combineDecay`; nothing here names a talent.
 */

/** The flag the laid effect carries. */
export const DECAY_FLAG = "decay";

/** 07 §9's span: 1 minute, 05's ten rounds. */
export const DECAY_MINUTES = 1;
export const DECAY_ROUNDS = 10;

/** What else ends it: nothing beside the minute, or a Short Rest (Hour of Dust). */
export const DECAY_UNTIL = Object.freeze(["", "shortRest"]);

/** The Armor Point locations (06 §2). */
export const DECAY_LOCATIONS = Object.freeze(["body", "head", "limb"]);

const int = v => Math.max(0, Math.trunc(Number(v)) || 0);

/** The X a laid flag carries, 0 where there is none. */
export function decayValue(flag) {
  return int(flag?.value);
}

/**
 * **WHAT A SECOND APPLICATION LEAVES** (07 §9): the higher X, and the minute started
 * again - unless a talent says the two add (`adds`), and then their sum, to no more
 * than `cap` where the talent names one (04's Erosion at rank 2: *to no more than your
 * tier*). The span is the kept X's: Hour of Dust's Decay 2 until a Short Rest is not
 * shortened by a Decay 1 laid after it, and a Decay of the same X keeps the longer span
 * (the implementer's reading, for the lead).
 *
 * @param {{value?: number, until?: string}|null} held   the creature's Decay now
 * @param {{value: number, until?: string}} laid          the one being laid
 * @param {{adds?: boolean, cap?: number|null}} [o]
 * @returns {{value: number, until: string}}
 */
export function combineDecay(held, laid, { adds = false, cap = null } = {}) {
  const h = decayValue(held);
  const l = decayValue(laid);
  const hu = DECAY_UNTIL.includes(held?.until) ? held.until : "";
  const lu = DECAY_UNTIL.includes(laid?.until) ? laid.until : "";
  if (adds && h > 0) {
    const sum = h + l;
    const limit = cap === null || cap === undefined ? sum : Math.max(h, int(cap));
    return { value: Math.min(sum, limit), until: hu === "shortRest" || lu === "shortRest" ? "shortRest" : "" };
  }
  if (l > h) return { value: l, until: lu };
  if (h > l) return { value: h, until: hu };
  return { value: l, until: hu === "shortRest" || lu === "shortRest" ? "shortRest" : "" };
}

/**
 * The laid effect's changes for X: on each location the creature HAS, a `final`
 * subtract of X and an upgrade to 0 after it (*never below 0*). None for X of 0.
 *
 * @param {number} value
 * @param {string[]} [locations]  the locations the creature has (a null AP is none)
 * @returns {Array<{key: string, type: string, value: string, phase: "final", priority: number}>}
 */
export function decayChanges(value, locations = DECAY_LOCATIONS) {
  const x = int(value);
  if (!x) return [];
  const out = [];
  for (const location of DECAY_LOCATIONS) {
    if (!(locations ?? []).includes(location)) continue;
    out.push({ key: `system.ap.${location}`, type: "subtract", value: String(x), phase: "final", priority: 100 });
    out.push({ key: `system.ap.${location}`, type: "upgrade", value: "0", phase: "final", priority: 110 });
  }
  return out;
}

/**
 * **A DECAY UNTIL A SHORT REST IS WRITTEN WITH NO SPAN** (the 2a review, M3): explicitly
 * empty, so an upgrade from a one-minute Decay keeps no old minute. `start: null` is the
 * schema's own empty (14.367 `BaseActiveEffect`: `start` is nullable).
 */
export const NO_SPAN = Object.freeze({ duration: Object.freeze({ value: null, units: "seconds", expiry: null, expired: false }), start: null });

/**
 * **THE CHANGES A LAID DECAY SHOULD CARRY NOW** (the 2a review, L4): the effect's X over
 * the locations the creature has at this moment. Null where what it carries already says
 * that, so a re-lay writes only where a location came or went.
 *
 * @param {object} flag      the effect's `decay` flag
 * @param {Array<object>} held  the effect's stored changes
 * @param {string[]} locations  `apLocations(actor.system.ap)`
 * @returns {Array<object>|null}
 */
export function decayResync(flag, held = [], locations = []) {
  const want = decayChanges(decayValue(flag), locations);
  const key = list => JSON.stringify((list ?? []).map(c => [c?.key ?? null, c?.type ?? null, String(c?.value ?? ""), c?.phase ?? null]));
  return key(want) === key(held) ? null : want;
}

/**
 * **WHETHER HOURSTRIKE'S DECAY LANDS ON ONE ROW** (07 §12: *lays Decay 1 on the creature it
 * hits*; the 2a review, L3): a row the blow resolved damage for, never one Immune to it - the
 * cast's own hit rule (`castSpell`'s Decay on the hit).
 *
 * @param {{immune?: boolean}|null} row  `damageByTarget[i]`
 */
export function hourstrikeLands(row) {
  return Boolean(row) && row.immune !== true;
}

/** The locations a creature has, off its Armor Points: a null or absent one is none (06 §2). */
export function apLocations(ap = {}) {
  return DECAY_LOCATIONS.filter(k => ap?.[k] !== null && ap?.[k] !== undefined);
}

/**
 * **THE DECAY A SPELL'S OWN WORDS LAY**, or null. `on` says the moment: `hit` (on
 * every creature the cast damages, at `at` or better where an SL gates it), or `fail`
 * (on a creature that fails the cast's Resist). `amount` is the number, or null where
 * it is half the caster's Intelligence modifier (`halfInt`), worked out at the cast.
 *
 * @param {string} effectText  the entry's effect, HTML or flat
 * @returns {{on: "hit"|"fail", amount: number|null, halfInt: boolean, at: number|null, until: string}|null}
 */
export function readSpellDecay(effectText) {
  const text = String(effectText ?? "").replace(/<[^>]*>/g, " ").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  let m = /\bAt SL (\d+) or better it also gains Decay (\d+)\s*(, which lasts until it finishes a Short Rest rather than 1 minute)?/.exec(text);
  if (m) return { on: "hit", amount: Number(m[2]), halfInt: false, at: Number(m[1]), until: m[3] ? "shortRest" : "" };
  m = /\b(?:The target|Every creature in the area) takes \d+ Physical damage and gains Decay (\d+)\b/.exec(text);
  if (m) return { on: "hit", amount: Number(m[1]), halfInt: false, at: null, until: "" };
  m = /\bOn a failure it is [^.]*? and gains Decay (\d+)\b/.exec(text);
  if (m) return { on: "fail", amount: Number(m[1]), halfInt: false, at: null, until: "" };
  m = /\bOn a failure [^.]*?gains Decay equal to half your Intelligence modifier, rounded down\b/.exec(text);
  if (m) return { on: "fail", amount: null, halfInt: true, at: null, until: "" };
  return null;
}

/**
 * The X a read lays, for a caster's Intelligence modifier: the number, or half the
 * modifier rounded down (Drag of Ages). 0 lays nothing.
 */
export function decayAmount(read, { intMod = 0 } = {}) {
  if (!read) return 0;
  if (read.halfInt) return Math.floor(Math.max(0, Math.trunc(Number(intMod)) || 0) / 2);
  return int(read.amount);
}

/** Whether an SL reaches a hit read's gate (none where it names none). */
export function decayReaches(read, { sl = 0 } = {}) {
  if (!read || read.on !== "hit") return false;
  return read.at === null || read.at === undefined || Number(sl) >= Number(read.at);
}

/**
 * A laid flag made valid KEY BY KEY: only what was handed in (CLAUDE.md §15).
 * Mutates and returns `raw`.
 */
export function cleanDecay(raw) {
  if (!raw || typeof raw !== "object") return raw;
  if ("value" in raw) raw.value = int(raw.value);
  if ("until" in raw) raw.until = DECAY_UNTIL.includes(raw.until) ? raw.until : "";
  if ("by" in raw) raw.by = typeof raw.by === "string" && raw.by ? raw.by : null;
  if ("source" in raw) raw.source = typeof raw.source === "string" ? raw.source : "";
  return raw;
}
