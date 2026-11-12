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
 * The NPC expansion also implements Frightened's stated repeat Test, needed
 * by Dread Weaver's Fear. Slowed and Silenced remain separately unbuilt.
 */

/**
 * **THE DC A POISONED CREATURE SHEDS ITS STACKS AGAINST, WHERE ITS LAYER NAMED ONE**
 * (A1's Poisoned: *A Body Resilience Test at the end of each of your turns against
 * the DC of the poison*; 04's Serpent Ward: *the DC to shed it is your Spell DC*; the
 * Legacy branches' door 20). It rides the Poisoned effect's own flag, written with
 * the condition through `effects/inflict.mjs`, and the turn-end prompt reads it. One
 * effect carries one DC: **the highest any layer named** (the lead, 2026-10-22:
 * *"Highest DC wins"*; `higherShedDc`), where it was the last layer's.
 */
import { sustainTransferPending } from "./sustain-transfer-suspension.mjs";
export const SHED_DC_FLAG = "shedDc";

/** 02's Gnome Escape Artist changes the action cost, never the escape Test. */
export function escapeAction(talents = [], { condition, on = "action", action = "action" } = {}) {
  if (on !== "action") return null;
  if (action !== "action" || !["entangled", "grappled", "grapple"].includes(condition)) return action;
  return talents.some(t => String(t.race ?? "").toLowerCase() === "gnome"
    && t.identifier === "escape-artist" && Number(t.taken) > 0) ? "half" : action;
}

/**
 * **THE SHED DC A POISONED KEEPS AS ANOTHER LAYER LANDS** (the lead: *"Highest DC
 * wins"*): the higher of what the effect carries and what the new layer names, its
 * source with it; a layer naming none leaves the held one, and a tie keeps the held.
 *
 * @param {unknown} held  the effect's `SHED_DC_FLAG`
 * @param {unknown} incoming  the landing layer's
 * @returns {{dc: number, source: string}|null}
 */
export function higherShedDc(held, incoming) {
  const a = cleanShedDc(held);
  const b = cleanShedDc(incoming);
  if (!a) return b;
  if (!b) return a;
  return b.dc > a.dc ? b : a;
}

/**
 * **CUTTING GEAR** (the lead, 2026-10-22: *"Give constructs a trait or ability that
 * allows them to end one Entangled condition per turn no action required."*; 14 §13's
 * Tinker constructs: *Once each turn, the construct ends one Entangled condition on
 * itself. This takes no action.*). **Keyed on the ability's NAME** (the lead's own
 * reading of the ruling), so a GM's own construct carrying it frees itself too. Once a
 * turn on the creature's own round's record (`turnMark`, D-779), through the queued
 * combatant door (D-761); out of a fight there is no turn to count.
 */
export const CUTTING_GEAR = Object.freeze({ name: "Cutting Gear", condition: "entangled", mark: "cutting-gear" });

/**
 * Whether a creature's abilities name Cutting Gear (case and spacing forgiven).
 *
 * @param {Array<{name?: string}>} abilities  the block's `creatureAbilities`
 */
export function holdsCuttingGear(abilities = []) {
  const want = CUTTING_GEAR.name.toLowerCase();
  return (abilities ?? []).some(a => String(a?.name ?? "").replace(/\s+/g, " ").trim().replace(/\.$/, "").toLowerCase() === want);
}

/**
 * Why Cutting Gear is refused, a `lang/en.json` key or null: no such ability, no
 * Entangled to end, or used already this turn.
 *
 * @param {{holds?: boolean, entangled?: boolean, used?: boolean}} o
 */
export function cuttingGearRefusal({ holds = false, entangled = false, used = false } = {}) {
  if (holds !== true) return "AZEROTH.CuttingGear.NotHeld";
  if (entangled !== true) return "AZEROTH.CuttingGear.NotEntangled";
  if (used === true) return "AZEROTH.CuttingGear.Spent";
  return null;
}

/**
 * A shed DC as an effect carries it, cleaned: `{dc, source}`, the DC a whole number
 * above 0; null for anything else.
 *
 * @param {unknown} raw
 * @returns {{dc: number, source: string}|null}
 */
export function cleanShedDc(raw) {
  if (!raw || typeof raw !== "object") return null;
  const dc = Math.trunc(Number(raw.dc));
  if (!(dc > 0)) return null;
  return { dc, source: typeof raw.source === "string" ? raw.source : "" };
}

/** Conditions supported by the repeat-Test door, including Fear for the NPC expansion. */
// **AND SLOWED** (07 §12's Drag of Ages, *a success ends the Slowed*, and Desert's Weight;
// the lead: *"We need automation and animations fully complete for everything"*): the
// door ends whatever condition the flag rides, so a Slowed's repeat Test is built for every
// entry that writes one (D-864).
export const ESCAPE_CONDITIONS = Object.freeze(["entangled", "stunned", "frightened", "slowed"]);

/** When the Test is offered: on the creature's own action, or at the end of its turns. */
export const ESCAPE_ON = Object.freeze(["action", "turnEnd"]);

/** The flag an escape rides on the condition's own effect. */
export const ESCAPE_FLAG = "escape";

/** The spans a failed escape's Stun may take (04's Deep Freeze). */
export const ESCAPE_STUN_SPANS = Object.freeze(["casterTurnEnd"]);

/** Conditions with written repeat Tests whose automation is still outstanding. */
export const ESCAPE_UNBUILT = Object.freeze(["silenced"]);

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
  Unweave: "no benefit from the named school's spells is the entry's own words, carried by no condition"
});

/**
 * **EVERY TEST 07 REPEATS THAT A HOLD'S OWN DOOR BUILDS**, by name: the reader takes nothing off
 * the words (they name no condition), and the door that lays the hold writes the escape itself.
 * 07 §12's Stasis is held through Suspend's door (O-306, D-898; `rules/chronomancer.mjs
 * #holdOutOfTime`), whose carrier is a **Stunned** riding 07's repeat Test. The census in
 * `escapes.test.mjs` holds each to the hold's own escape.
 */
export const ESCAPE_BY_HOLD = Object.freeze(["Stasis"]);

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
    // **07 §12's SAND PRISON**: *... is **Entangled** and **Blinded** ... It may repeat the
    // Test at the end of each of its turns, and leaves the spell when it succeeds* - a pass
    // ends every condition that failure named (`also`), not the first alone.
    // And the creature LEAVES THE SPELL (`leaves`; O-292, the lead: *"292 - end when target
    // escapes"*): once no creature is held by the cast, its Sustain ends
    // (`leavesSustain`; O-303 widened it to any freeing, `rules/held-sustains.mjs`).
    const leaves = /\bleaves the spell when it succeeds\b/.test(list[i]);
    const also = leaves
      ? [...s.matchAll(/\*\*(\w+)\*\*/g)].map(x => conditionOf(x[1])).filter(id => id && id !== conditionOf(named[1]) && !/^decay$/.test(id))
      : [];
    return { condition: conditionOf(named[1]), on: "turnEnd", resilience: test ? test[1].toLowerCase() : own, banes: repeat[1] ? 1 : 0, ...(also.length ? { also } : {}), ...(leaves ? { leaves: true } : {}) };
  }
  return null;
}

/**
 * The escape the door BUILDS: `readEscapeAny`'s, where the condition is one the
 * supported by the repeat-Test door, else null.
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
    ...(Array.isArray(read.also) && read.also.length ? { also: read.also } : {}),
    ...(read.leaves === true ? { leaves: true } : {}),
    dc, banes: (Math.trunc(Number(read.banes)) || 0) + (Math.trunc(Number(talents?.banes)) || 0),
    failStun: talents?.failStun ?? null, talents: [...(talents?.by ?? [])], by: caster, source, cast
  });
}

/**
 * **THE DCS A FEATURE'S ESCAPE MAY NAME** (the Legacy branches' door 19): the
 * user's Spell DC (Bad Mojo, Shackle, Shadow Trap, The Vault Opens, Warden's Cage,
 * the Net-o-Matic: *against your Spell DC*), or 10 + the Strength modifier +
 * Proficiency (the lead's Warrior DC, door 16), for a class with no Spell DC.
 */
export const ESCAPE_DCS = Object.freeze(["spellDc", "str"]);

/**
 * **A FEATURE'S ESCAPE, AT THE RANK THE TALENT IS TAKEN** (door 19): the `escape`
 * an `inflicts` entry of a talent's grant carries - `{on, resilience, dc, banes,
 * minRank}` - with the Banes from `minRank` up (Bad Mojo's *At rank 2 that Test
 * takes a Bane*, Shackle's *with a Bane at rank 2*), bound once by the feature
 * sync, so the stamp holds the number. Null where the entry carries none.
 *
 * @param {{on?: string, resilience?: string, dc?: string, banes?: number, minRank?: number}|null} spec
 * @param {number} [rank]
 * @returns {{on: string|null, resilience: string|null, dc: string|null, banes: number}|null}
 */
export function boundFeatureEscape(spec, rank = 1) {
  if (!spec || typeof spec !== "object") return null;
  const r = Math.trunc(Number(rank)) || 1;
  const banes = r >= (Number(spec.minRank) || 1) ? Math.max(0, Math.min(3, Math.trunc(Number(spec.banes)) || 0)) : 0;
  return {
    on: ESCAPE_ON.includes(spec.on) ? spec.on : null,
    resilience: RESILIENCES.includes(spec.resilience) ? spec.resilience : null,
    dc: ESCAPE_DCS.includes(spec.dc) ? spec.dc : null,
    banes
  };
}

/**
 * **THE RECORD A FEATURE'S LANDED CONDITION CARRIES** (door 19): the stamped
 * escape with its DC resolved at the Use - the Strength DC where the stamp names
 * `str`, else the user's Spell DC (a creature's own DC, where the door hands that
 * in) - and the user and the feature named, through `cleanEscape`. **The Strength DC
 * only where it is named** (the B1 review): a user with no Spell DC records none, and
 * the Test is then made at the table's DC rather than at the Warrior's. Null where the
 * stamp names no escape the ruling builds (*held or Stunned*).
 *
 * @param {{on?: string|null, resilience?: string|null, dc?: string|null, banes?: number}|null} stamp
 * @param {{condition?: string, spellDc?: number|null, strDc?: number|null, caster?: string|null, source?: string, cast?: string|null}} o
 * @returns {object|null}
 */
export function featureEscapeRecord(stamp, { condition = null, spellDc = null, strDc = null, caster = null, source = "", cast = null } = {}) {
  if (!stamp?.on || !stamp?.resilience) return null;
  const dc = stamp.dc === "str" ? strDc : spellDc;
  return cleanEscape({ condition, on: stamp.on, resilience: stamp.resilience, dc, banes: stamp.banes ?? 0, failStun: null, talents: [], by: caster, source, cast });
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
  // Compel has its own Charmed carrier and an explicit end-turn Spirit Test.
  // This exception does not give every Charmed effect a repeat Test.
  const compel = ["compel", "dominate"].includes(raw.identifier) && raw.condition === "charmed"
    && raw.on === "turnEnd" && raw.resilience === "spirit";
  if ((!ESCAPE_CONDITIONS.includes(raw.condition) && !compel) || !ESCAPE_ON.includes(raw.on) || !RESILIENCES.includes(raw.resilience)) return null;
  const dc = Math.trunc(Number(raw.dc));
  return {
    ...(compel ? { identifier: raw.identifier } : {}),
    condition: raw.condition,
    on: raw.on,
    resilience: raw.resilience,
    // The other conditions a pass ends with it (07 §12's Sand Prison), only where named.
    ...(Array.isArray(raw.also) && raw.also.some(id => typeof id === "string" && /^[a-z]+$/.test(id))
      ? { also: raw.also.filter(id => typeof id === "string" && /^[a-z]+$/.test(id)) } : {}),
    // A pass leaves the spell (07 §12's Sand Prison; O-292), only where named.
    ...(raw.leaves === true ? { leaves: true } : {}),
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
export function escapeOfEffect(effect) {
  if (!effect || effect.disabled === true || effect.active === false || sustainTransferPending(effect)) return null;
  const escape = cleanEscape(effect.flags?.["azeroth-rpg"]?.[ESCAPE_FLAG]);
  return escape && [...(effect.statuses ?? [])].includes(escape.condition) ? escape : null;
}

export function escapeEffectMatches(effect, expected) {
  const escape = escapeOfEffect(effect);
  return Boolean(escape && expected && JSON.stringify(escape) === JSON.stringify(expected));
}

export function escapesDue(effects = [], on = "turnEnd") {
  const out = [];
  for (const e of effects ?? []) {
    if (!e?.id) continue;
    const escape = escapeOfEffect(e);
    if (!escape || escape.on !== on) continue;
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

/**
 * **A SUSTAIN WITH NOBODY LEFT IN IT ENDS** (O-292; the lead, 2026-11-10: *"292 - end when target
 * escapes"*). 07 §12's Sand Prison: *It may repeat the Test at the end of each of its turns, and
 * leaves the spell when it succeeds. While sustaining this spell you pay 3 Mana at the start of
 * each of your turns.* A creature that passed left the spell, and the caster went on holding it
 * and paying 3 Mana a turn for nothing. True where the escape that passed is one whose creature
 * LEAVES the spell (`leaves`, read off those words at the cast), it names the cast and its caster,
 * and no other creature is still held by that cast (`othersHeld`, counted on the board by
 * `effects/sustained-spells.mjs#heldByCast`). A spell holding several creatures runs until the
 * last of them is out. Closed by default: a caller that counts nobody (`othersHeld` not a whole
 * number) ends nothing.
 *
 * @param {{escape?: object|null, othersHeld?: number|null}} o
 * @returns {boolean}
 */
export function leavesSustain({ escape = null, othersHeld = null } = {}) {
  if (escape?.leaves !== true || !escape.cast || !escape.by) return false;
  return Number.isInteger(othersHeld) && othersHeld === 0;
}
