/**
 * **THE TEST 07 GIVES A HELD OR STUNNED CREATURE** (D-778; the lead, 2026-10-03,
 * on O-159: *"Yes."* to *should a door roll the Test 07 gives a held or Stunned
 * creature to break free or to end the condition, so these talents have a Test to
 * lay their Bane on?*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * 07 writes the Test two ways, and the door follows the words:
 *
 * - **On the creature's own action** - Frost Nova's *is **Entangled** until it
 *   spends an action and passes another Reflex Resilience Test against your Spell
 *   DC* (and Ice Shackles', Frozen Ground's, Entangling Vines'): a prompt at the
 *   START of the held creature's turn, whose button spends the action and rolls
 *   (02's Snare's shape, D-773). `on: "action"`.
 * - **At the end of its turns** - Absolute Zero's *is **Stunned** until it passes
 *   the Test again at the end of one of its turns*, Rimebind's and Thornguard's
 *   *it may repeat the Test at the end of each of its turns*: a prompt at the END
 *   of each of its turns, Poisoned's shape (D-628). `on: "turnEnd"`.
 *
 * A pass ends the condition the escape rides; a failure keeps it, and 04's Deep
 * Freeze lays a Stun on a creature that fails its escape from Frost Nova. The
 * caster's Spell DC and the talents' Banes (04's Frost Nova at rank 2, Absolute
 * Zero) are written on the escape when the condition lands - a record of the
 * cast, never read off the caster again (D-724).
 *
 * **Held or Stunned** is the ruling's own scope: `ESCAPE_CONDITIONS` is Entangled
 * and Stunned. 07 states the same Test, in the same words, for Slowed, Frightened
 * and Silenced; the reader names those and the door leaves them the table's
 * (`ESCAPE_UNBUILT`) - a question for the lead, not a decision taken here.
 */

/** The conditions the ruling's Test ends (*held or Stunned*). */
export const ESCAPE_CONDITIONS = Object.freeze(["entangled", "stunned"]);

/** When the Test is offered: on the creature's own action, or at the end of its turns. */
export const ESCAPE_ON = Object.freeze(["action", "turnEnd"]);

/** The flag an escape rides on the condition's own effect. */
export const ESCAPE_FLAG = "escape";

/** The spans a failed escape's Stun may take (04's Deep Freeze). */
export const ESCAPE_STUN_SPANS = Object.freeze(["casterTurnEnd"]);

/** The conditions 07 gives the same Test for and the ruling did not name. */
export const ESCAPE_UNBUILT = Object.freeze(["slowed", "frightened", "silenced"]);

/**
 * **EVERY TEST 07 REPEATS THAT ENDS NO CONDITION**, by name, with its reason: the
 * state the Test ends is the entry's own words and no condition carries it, so a
 * pass has no effect to end and the Test stays the table's. The census in
 * `escapes.test.mjs` fails a repeated Test the reader does not take and this list
 * does not name.
 */
export const ESCAPE_UNREAD = Object.freeze({
  Anathema: "no healing, no willing touch and a Bane on every Test are the entry's own words, carried by no condition, and its Boon reads whom the creature has harmed",
  "Curse of Ruin": "a Bane on Resilience Tests and a Critical Injury rolled twice are the entry's own words, carried by no condition",
  "Fel Tether": "no more than 10 feet from where it was caught is the entry's own words, carried by no condition",
  Icelock: "frozen where it stands - no move and no Reaction - is the entry's own words, carried by no condition",
  Mindfetter: "no nearer and no Attack Test or spell at the caster is the entry's own words, carried by no condition",
  Puppet: "the caster moving and acting with the creature is the table's, carried by no condition",
  Stasis: "no action, move, speech or damage is the entry's own words, carried by no condition",
  Unweave: "no benefit from the named school's spells is the entry's own words, carried by no condition"
});

const RESILIENCES = Object.freeze(["body", "reflex", "spirit"]);

/** HTML to flat text, `**` kept: the condition's bold is how 07 names it. */
function flat(text) {
  return String(text ?? "").replace(/<\/?(strong|b)>/g, "**").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** A bold condition name as its id, or null. */
function conditionOf(word) {
  const id = String(word ?? "").trim().toLowerCase();
  return /^[a-z]+$/.test(id) ? id : null;
}

/**
 * **THE ESCAPE 07's WORDS STATE**, or null: the condition it ends, when it is
 * offered, the Resilience, and whether 07 itself lays a Bane on it (*may repeat
 * the Test at the end of each of its turns with a Bane*).
 *
 * @param {string} effectText  the entry's effect
 * @param {{test?: {resilience?: string|null}}} [fields]  07 §9's own **Test**, which
 *   *repeat the Test* repeats
 * @returns {{condition: string, on: string, resilience: string|null, banes: number}|null}
 */
export function readEscapeAny(effectText, fields = {}) {
  const text = flat(effectText);
  const own = RESILIENCES.includes(fields?.test?.resilience) ? fields.test.resilience : null;
  // *is **Entangled** until it spends an action and passes another Reflex Resilience Test*
  let m = /\*\*(\w+)\*\* until it spends an action and passes another (Body|Reflex|Spirit) Resilience Test\b/.exec(text);
  if (m) return { condition: conditionOf(m[1]), on: "action", resilience: m[2].toLowerCase(), banes: 0 };
  // *is **Stunned** until it passes the Test again at the end of one of its turns*
  m = /\*\*(\w+)\*\* until it passes the Test again at the end of one of its turns\b/.exec(text);
  if (m) return { condition: conditionOf(m[1]), on: "turnEnd", resilience: own, banes: 0 };
  // *is **Entangled**, and it may repeat the Test at the end of each of its turns*,
  // *is **Slowed** for the duration and may repeat the Test ...* - the condition the
  // same sentence names, and the Resilience that sentence's own Test names; or, for
  // *... is **Entangled**, pinned where it stands. It may repeat the Test at the end
  // of each of its turns to pull free*, the sentence before it, where that one names
  // the failure.
  const list = text.split(/(?<=[.!?])\s+/);
  for (let i = 0; i < list.length; i++) {
    const repeat = /\bmay repeat the Test at the end of each of its turns( with a Bane)?/.exec(list[i]);
    if (!repeat) continue;
    let s = list[i];
    let named = /\*\*(\w+)\*\*/.exec(s);
    if (!named && i > 0 && /\bfails? an? (?:Body|Reflex|Spirit) Resilience Test\b|\bOn a failure\b/.test(list[i - 1])) {
      s = list[i - 1];
      named = /\*\*(\w+)\*\*/.exec(s);
    }
    if (!named) continue;
    const test = /\b(Body|Reflex|Spirit) Resilience Test\b/.exec(s);
    return { condition: conditionOf(named[1]), on: "turnEnd", resilience: test ? test[1].toLowerCase() : own, banes: repeat[1] ? 1 : 0 };
  }
  return null;
}

/**
 * The escape the door BUILDS: `readEscapeAny`'s, where the condition is one the
 * ruling names (*held or Stunned*), else null.
 *
 * @param {string} effectText
 * @param {{test?: {resilience?: string|null}}} [fields]
 */
export function readEscape(effectText, fields = {}) {
  const read = readEscapeAny(effectText, fields);
  return read && ESCAPE_CONDITIONS.includes(read.condition) && read.resilience ? read : null;
}

/**
 * **THE RECORD A LANDED CONDITION CARRIES** (`flags.azeroth-rpg.escape`), at the
 * cast: 07's escape, the caster's Spell DC, the talents' Banes and Deep Freeze's
 * Stun, the caster and the cast.
 *
 * @param {{condition: string, on: string, resilience: string, banes: number}|null} read
 * @param {{dc?: number|null, talents?: {banes?: number, failStun?: string|null, by?: string[]}, caster?: string|null,
 *   source?: string, cast?: string|null}} o
 * @returns {object|null}
 */
export function escapeRecord(read, { dc = null, talents = {}, caster = null, source = "", cast = null } = {}) {
  if (!read) return null;
  return cleanEscape({
    condition: read.condition, on: read.on, resilience: read.resilience,
    dc, banes: (Math.trunc(Number(read.banes)) || 0) + (Math.trunc(Number(talents?.banes)) || 0),
    failStun: talents?.failStun ?? null, talents: [...(talents?.by ?? [])], by: caster, source, cast
  });
}

/**
 * **AN ESCAPE AS A QUERY OR A CARD MAY CARRY IT**: the known keys, cleaned, or
 * null where it names no condition the ruling ends.
 *
 * @param {unknown} raw
 * @returns {object|null}
 */
export function cleanEscape(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!ESCAPE_CONDITIONS.includes(raw.condition) || !ESCAPE_ON.includes(raw.on) || !RESILIENCES.includes(raw.resilience)) return null;
  const dc = Math.trunc(Number(raw.dc));
  return {
    condition: raw.condition,
    on: raw.on,
    resilience: raw.resilience,
    dc: Number.isFinite(dc) && dc > 0 ? dc : null,
    banes: Math.max(0, Math.min(3, Math.trunc(Number(raw.banes)) || 0)),
    failStun: ESCAPE_STUN_SPANS.includes(raw.failStun) ? raw.failStun : null,
    talents: Array.isArray(raw.talents) ? raw.talents.filter(t => typeof t === "string" && t).map(String) : [],
    by: typeof raw.by === "string" && raw.by ? raw.by : null,
    source: typeof raw.source === "string" ? raw.source : "",
    cast: typeof raw.cast === "string" && raw.cast ? raw.cast : null
  };
}

/**
 * **THE ESCAPES A CREATURE MAY TRY NOW**: the effects it carries whose escape is
 * offered on this beat - `action` at the start of its turn, `turnEnd` at the end -
 * and whose condition still stands on the same effect. Sorted by id, so a prompt
 * posts in one order.
 *
 * @param {Array<{id: string, statuses?: Iterable<string>, flags?: object, disabled?: boolean}>} effects  plain
 * @param {"action"|"turnEnd"} on
 * @returns {Array<{id: string, escape: object}>}
 */
export function escapesDue(effects = [], on = "turnEnd") {
  const out = [];
  for (const e of effects ?? []) {
    if (!e?.id || e.disabled === true) continue;
    const escape = cleanEscape(e.flags?.["azeroth-rpg"]?.[ESCAPE_FLAG] ?? null);
    if (!escape || escape.on !== on) continue;
    if (![...(e.statuses ?? [])].includes(escape.condition)) continue;
    out.push({ id: String(e.id), escape });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Why an escape is refused before anything is spent: the effect it rides is gone
 * (the creature is no longer held), or an action-escape with no action left -
 * asked of the turn's budget without spending it.
 *
 * **And who presses it, and whether the press can be recorded** (the review of
 * D-778): the prompt names its creature, so a client that does not own it would
 * roll the Test on the wrong client (`owner`); and its one press is recorded on a
 * card the GM posted, so a client that may not write the card needs a GM online
 * (`recordable`, `effects/card-presses.mjs#cardPressUnrecordable`) - asked here,
 * before the Test and before the action, never after them (D-768's order). Both
 * default CLOSED: a caller that names neither is refused.
 *
 * @param {{held?: boolean, on?: string, budgetShort?: boolean, owner?: boolean, recordable?: boolean}} o
 * @returns {string|null}  an i18n key
 */
export function escapeRefusal({ held = false, on = "turnEnd", budgetShort = false, owner = false, recordable = false } = {}) {
  if (owner !== true) return "AZEROTH.Escape.NotYours";
  if (!held) return "AZEROTH.Escape.NotHeld";
  if (on === "action" && budgetShort) return "AZEROTH.Escape.NoAction";
  if (recordable !== true) return "AZEROTH.Card.PressNoGM";
  return null;
}
