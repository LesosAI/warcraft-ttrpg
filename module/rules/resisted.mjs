/**
 * **WHAT A RESIST ON A CARD GOVERNS** (the Legacy branches' B6 fix; the lead's
 * rulings *"Build it everywhere"* and *"Land automatically"*). Pure: no Foundry
 * imports (CLAUDE.md §3).
 *
 * A card that offers a Resilience Test beside its damage and its conditions says,
 * clause by clause, which of them the Test governs. Nothing was marked before: a
 * Resist was a bare roll, its Apply dealt the whole number whatever it came to, and
 * every condition waited on a button.
 *
 * - **A damage that halves on a passed Test** - 07's *and half of that, rounded
 *   down, on a success*, 04's *half that, rounded down, on a success* and *for
 *   half, rounded down* - carries `half: true` on its damage descriptor: a spell's
 *   `system.damage.half`, stamped by the parser off the entry's own sentence
 *   (`halvesOnPass`), and a feature's `damage.half`, off its row in
 *   `talent-effects.mjs`. The card's Apply lands the half, rounded down and before
 *   Armor Points and Ward (`mitigation.mjs#resolveDamage`'s `passedHalf`), on a
 *   creature whose Test THAT CARD recorded as passed (`halvesFor`).
 * - **A condition the failure lays** carries `onFail: true` on a feature's
 *   `inflicts` - 04's Thunder Clap's Prone at rank 2, and every Use that reads
 *   *makes a ... Resilience Test ... or is X*. A failed Test the card recorded lands
 *   it at once, through the Inflict door (`effects/inflict.mjs`), as D-770's riders
 *   land on a hit; a spell's are its `onFail.statuses`, landed that way since
 *   2026-09-06. Its button stays only for a creature with no Test recorded.
 * - **Anything unmarked is no business of the Test's**: Thunder Clap's damage and
 *   its Slowed land on every creature the Use reaches, pass or fail - *Every enemy
 *   within 10 feet of you takes Nature damage equal to your tier and is Slowed* - the
 *   Slowed laid by the Use itself on every creature it measured
 *   (`rules/area-gather.mjs#landsAtOnce`), the damage by the card's Apply.
 * - **A damage the failure deals and a pass does not** (the B8a pass: 07's Rimebind,
 *   *On a failure it takes 2 Frost damage and is **Entangled***; 02's Shadow Word:
 *   Death, *On a failed save, the target takes your level plus the SL bonus of the
 *   Casting Test in Shadow damage*) carries `onFail: true` on its damage descriptor,
 *   beside `half`: a spell's `system.damage.onFail`, stamped by the parser off the
 *   entry's own sentence (`noneOnPass`), and a feature's `damage.onFail` off its row.
 *   The card's Apply lands nothing on a creature whose Test THAT CARD recorded as
 *   passed (`sparedFor`), said in words, and the whole on a failure or where no Test
 *   is recorded - the table has not said it resisted.
 */

import { resistKey } from "./records.mjs";
// The repository's one sentence splitter (CLAUDE.md §4, D-722).
import { sentences } from "./spell-effects.mjs";

/**
 * **THE SENTENCE THAT HALVES ON A PASS**, in each of the book's three wordings:
 * 07's *and half of that, rounded down, on a success* and *on a success it takes
 * half of that, rounded down*, 04's *half that, rounded down, on a success*, and 04's
 * Explosive Trap's *makes a Reflex Resilience Test against your Spell DC for half,
 * rounded down*. Read over flattened text (`flatText`): the book is hard-wrapped.
 */
export const HALF_ON_PASS_RE = /\bhalf (?:of )?that,? rounded down,? on a success\b|\bon a success it takes half of that\b|\bfor half,? rounded down\b/i;

/**
 * Prose as one line of plain words: tags off, entities read, whitespace one space.
 * A sentence the book wraps across two lines is still one sentence here.
 *
 * @param {unknown} text
 * @returns {string}
 */
export function flatText(text) {
  return String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether the words halve the damage on a passed Test.
 *
 * @param {unknown} text  an entry's effect, HTML or Markdown
 * @returns {boolean}
 */
export function halvesOnPass(text) {
  return HALF_ON_PASS_RE.test(flatText(text));
}

/**
 * **THE CLAUSE A FAILURE OPENS** - *On a failure*, *On a failed save*, *On failure* -
 * to the end of its sentence, cut where the sentence turns to what a success does (07's
 * Ring of Fire: *on a failure it does not cross and its turn ends, and on a success it
 * crosses and takes 5 Fire damage* is no damage of the failure's).
 */
const FAIL_CLAUSE_RE = /\bon (?:a )?fail(?:ure|ed (?:save|test))\b,?\s*(.*)$/i;
const SUCCESS_TURN_RE = /[,;]?\s*(?:and |but )?on a success\b/i;
/**
 * *takes 2 Frost damage*, or an expression - *takes your level plus ... in Shadow
 * damage* - and never *takes no damage* (07's Stasis: *On a failure it cannot act ... it
 * takes no damage from any source*).
 */
const TAKES_DAMAGE_RE = /\btakes?\s+(?:(\d+)\s+(?:([A-Za-z]+)\s+)?damage\b|(?!no\b|none\b)[^.]*?\bdamage\b)/i;
/** *... makes a Reflex Resilience Test against your Spell DC or takes 10 Nature damage*. */
const OR_TAKES_RE = /\bResilience Test\b.*?\bor takes?\s+(\d+)\s+(?:([A-Za-z]+)\s+)?damage\b/i;

/**
 * **THE DAMAGE A FAILED TEST DEALS AND A PASSED ONE DOES NOT** (the B8a pass), in the
 * book's two wordings: a clause a failure opens that takes damage (07's Rimebind and
 * Thornguard, *On a failure it takes 2 Frost damage*; 02's Shadow Word: Death, *On a
 * failed save, the target takes ... in Shadow damage*), and a Test whose alternative is
 * the damage (07's Stormfury and Necrosis, *makes a Reflex Resilience Test ... or takes
 * 10 Nature damage*). Read over flattened text, a sentence at a time; **never where the
 * words halve the damage on a pass** (`halvesOnPass`) - that sentence is the pass's, and
 * the pass takes half rather than nothing.
 *
 * @param {unknown} text  an entry's effect, HTML or Markdown
 * @returns {{amount: number|null, school: string|null, sentence: string}|null}  the first
 *   such clause: its number where it names one (null for an expression), its damage word
 */
export function failureDamage(text) {
  const flat = flatText(text);
  if (!flat || halvesOnPass(flat)) return null;
  for (const sentence of sentences(flat)) {
    const fail = FAIL_CLAUSE_RE.exec(sentence);
    if (fail) {
      const clause = fail[1].split(SUCCESS_TURN_RE)[0];
      const m = TAKES_DAMAGE_RE.exec(clause);
      if (m) return { amount: m[1] ? Number(m[1]) : null, school: m[2] ? m[2].toLowerCase() : null, sentence };
    }
    const or = OR_TAKES_RE.exec(sentence);
    if (or) return { amount: Number(or[1]), school: or[2] ? or[2].toLowerCase() : null, sentence };
  }
  return null;
}

/**
 * **WHETHER THE ENTRY'S OWN DAMAGE IS THE FAILURE'S** - what the parser stamps as a
 * spell's `damage.onFail`: a failed Test's damage clause (`failureDamage`) whose number
 * is the Rating, where both name one. Stormfury's *or takes 10 Nature damage* is not its
 * Rating's 20 - the target takes that whatever happens - so it is no mark of the
 * Rating's; it is a splash around the target (`rules/splash.mjs`).
 *
 * @param {unknown} text
 * @param {{rating?: number|null}} [o]  the entry's own Damage Rating
 * @returns {boolean}
 */
export function noneOnPass(text, { rating = null } = {}) {
  const read = failureDamage(text);
  if (!read) return false;
  if (rating === null || rating === undefined || read.amount === null) return true;
  return read.amount === Math.trunc(Number(rating));
}

/**
 * Half a number, rounded down, never below nothing: what *half that, rounded down*
 * leaves of a whole number.
 *
 * @param {unknown} n
 * @returns {number}
 */
export function passedHalf(n) {
  return Math.floor(Math.max(0, Math.trunc(Number(n)) || 0) / 2);
}

/**
 * Whether a stored mark says the Test governs the clause: `true` and nothing else.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function marked(value) {
  return value === true;
}

/**
 * **THE RECORD A CARD HOLDS FOR ONE CREATURE** (D-726's key): the row's token, else
 * its actor - the same `resistKey` the record was written under - or null where the
 * card recorded no Test for it.
 *
 * @param {object|null} resists  the card's `flags.azeroth-rpg.resists`
 * @param {{tokenId?: string|null, actorId?: string|null}|null} ref  a card row, or a token's ids
 * @returns {object|null}
 */
export function resistRecordOn(resists, ref) {
  const key = resistKey(ref);
  if (!key || !resists || typeof resists !== "object" || Array.isArray(resists)) return null;
  const record = resists[key];
  return record && typeof record === "object" ? record : null;
}

/**
 * **WHETHER THE APPLY LANDS THE HALF ON THIS CREATURE**: a card whose damage halves
 * on a pass (`halfOnPass`), and a Test the card recorded for the creature that
 * passed. A creature with no Test recorded takes the whole: the table has not said
 * it resisted.
 *
 * @param {object|null} flags  the card's `flags["azeroth-rpg"]`
 * @param {object|null} ref    a card row, or a token's ids
 * @returns {boolean}
 */
export function halvesFor(flags, ref) {
  if (flags?.halfOnPass !== true) return false;
  return resistRecordOn(flags.resists ?? null, ref)?.success === true;
}

/**
 * **WHETHER THE APPLY LANDS NOTHING ON THIS CREATURE** (the B8a pass): a card whose
 * damage is its Test's failure (`noneOnPass`, off `damage.onFail`), and a Test the card
 * recorded for the creature that passed. A failure, and a creature with no Test
 * recorded, take the whole - the table has not said it resisted.
 *
 * @param {object|null} flags  the card's `flags["azeroth-rpg"]`
 * @param {object|null} ref    a card row, or a token's ids
 * @returns {boolean}
 */
export function sparedFor(flags, ref) {
  if (flags?.noneOnPass !== true) return false;
  return resistRecordOn(flags.resists ?? null, ref)?.success === true;
}

/**
 * **WHICH OF A CARD'S CONDITIONS ITS TEST GOVERNS**: the conditions a failure lays
 * (`onFail: true`), and the rest, which the Test leaves alone. Each keeps its own
 * order; a condition named twice is the first.
 *
 * @param {Array<{condition?: string, onFail?: boolean}>} inflicts
 * @returns {{onFail: object[], open: object[]}}
 */
export function governed(inflicts = []) {
  const seen = new Set();
  const onFail = [];
  const open = [];
  for (const i of Array.isArray(inflicts) ? inflicts : []) {
    const id = typeof i?.condition === "string" ? i.condition : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    (marked(i.onFail) ? onFail : open).push(i);
  }
  return { onFail, open };
}

/**
 * **WHAT A FAILED TEST LANDED, AS THE CARD RECORDS IT**: the conditions the Test
 * governs that the creature holds once its failure has landed them - so a creature
 * immune to one, or a condition the door refused, is not said to have taken it. A
 * passed Test landed nothing.
 *
 * @param {{conditions?: string[], statuses?: Iterable<string>, success?: boolean}} o
 * @returns {string[]}
 */
export function landedOnFail({ conditions = [], statuses = [], success = false } = {}) {
  if (success === true) return [];
  const held = new Set(statuses ?? []);
  const out = [];
  for (const id of Array.isArray(conditions) ? conditions : []) {
    if (typeof id === "string" && id && held.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * **WHETHER A CONDITION'S INFLICT BUTTON STILL STANDS FOR ONE ROW** (*"Land
 * automatically"*): a condition the Test governs is the Test's to lay once the
 * creature's Test is recorded - it landed on the failure, or it was resisted - so
 * its button stays only for a creature with no Test recorded. A condition the Test
 * leaves alone keeps its button whatever the Test came to.
 *
 * @param {{onFail?: boolean}} inflict
 * @param {object|null} record  the row's resist record, or null
 * @returns {boolean}
 */
export function inflictStands(inflict, record) {
  if (!marked(inflict?.onFail)) return true;
  return !record;
}

/* ------------------------------------------------------------------ */
/*  WHEN THE TEST IS MADE (the B8a2 pass)                               */
/* ------------------------------------------------------------------ */

/**
 * **A RESILIENCE TEST THE WORDS HAVE A CREATURE MAKE**: 07's *a Reflex Resilience Test*,
 * the Resilience named, one Test. A Boon or a Bane that lands on such Tests (*a Boon on
 * Body Resilience Tests*, *a Boon on the first Resilience Test it makes each round*) names
 * the plural or no Resilience, and is no Test of the entry's.
 */
const TEST_NAMED_RE = /\b(Body|Reflex|Spirit) Resilience Test\b/;

/**
 * **A LATER MOMENT THE TEST WAITS FOR**, read inside the clause that names the Test: a
 * creature entering the area or a space (*A creature that enters the area*, *The first
 * creature to enter the space*, *when it first enters*), starting, beginning or ending a
 * turn there (*or starts its turn inside it*, *one that begins its turn there*), the
 * caster's own turns (*At the start of each of your turns*), a creature crossing an edge
 * (*A creature crossing the ring*, *a creature that tries to cross*), the next creature to
 * strike the caster (*The next creature to hit you*), a touch, a watching, and a creature
 * that attacks or is dealt damage inside the area. 07 asks each of these Tests of the
 * creature when that moment comes - the area's own Test card does (D-756, D-757) - never
 * of whoever was targeted at the cast.
 */
export const LATER_TEST_RE = /\benters?\b|\bentering\b|\bto enter\b|\b(?:starts|begins|ends) (?:its|their) turns?\b|\bat the start of each of (?:its|their|your) turns\b|\bcross(?:es|ing)?\b|\bthe next creature to\b|\btouch(?:es|ed)?\b|\bwatched\b|\bthat attacks\b|\bis dealt damage\b/i;

/**
 * Where a sentence's clauses break: *, and* (Frost Nova's *takes 1 Frost damage, and one
 * that fails ...*), a colon (Absolute Zero's *makes a Reflex Resilience Test ...: on a
 * failure ...*) and a semicolon. A clause is what the Test and its moment share.
 */
const CLAUSE_SPLIT_RE = /,\s+and\s+|:\s+|;\s+/;

/**
 * **THE TEST'S OWN MOMENT, IN ITS CLAUSE**: everything before the Test - its subject, *A
 * creature that enters the area or starts its turn inside it makes* - and what follows it
 * up to the next comma, *when it first enters* (Tempest). A phrase past that comma is the
 * outcome's, never the Test's: Soulchains' *is **Entangled** for the duration, taking 3 Fel
 * damage at the start of each of its turns while held* is a target's Test at the cast.
 *
 * @param {string} clause
 * @returns {boolean}  whether the Test waits for a later moment
 */
function waitsForLater(clause) {
  const m = TEST_NAMED_RE.exec(clause);
  if (!m) return false;
  const before = clause.slice(0, m.index);
  const after = clause.slice(m.index + m[0].length).split(",")[0];
  return LATER_TEST_RE.test(before) || LATER_TEST_RE.test(after);
}

/**
 * **WHEN THE ENTRY'S TESTS ARE MADE** (the B8a2 pass; the lead: *"Build them now"*), off
 * flattened text a sentence and a clause at a time: every clause that has a creature make
 * a named Resilience Test, and whether it waits for a later moment (`LATER_TEST_RE`, read
 * by `waitsForLater` where the Test's moment is written) or is made at the cast - by the
 * target, by every creature in the area, by each one the spell reaches. A clause naming a
 * second Test of the same breath (Frost Nova's escape, *passes another Reflex Resilience
 * Test*) is read once, with its first.
 *
 * @param {unknown} text  an entry's effect, HTML or Markdown
 * @returns {{atCast: string[], later: string[]}}  the clauses, in order
 */
export function testTiming(text) {
  const out = { atCast: [], later: [] };
  let previousLater = false;
  for (const sentence of sentences(flatText(text))) {
    let laterHere = false;
    for (const clause of sentence.split(CLAUSE_SPLIT_RE)) {
      // **A TEST THAT FOLLOWS A LATER MOMENT'S SENTENCE** (07 §12's Withering Sands: *A
      // creature that starts its turn in the area takes 5 Physical damage. If it also fails
      // a Spirit Resilience Test ...*): *If it also fails* is that moment's own Test.
      const follows = previousLater && /^\s*If it also fails\b/.test(clause);
      // A sentence that names the later moment with no Test of its own still sets it.
      if (!TEST_NAMED_RE.test(clause)) { if (LATER_TEST_RE.test(clause)) laterHere = true; continue; }
      const later = follows || waitsForLater(clause);
      if (later) laterHere = true;
      (later ? out.later : out.atCast).push(clause.trim());
    }
    previousLater = laterHere;
  }
  return out;
}

/**
 * **WHETHER THE ENTRY ASKS ITS TEST AT THE CAST**: a clause made at the cast, or no clause
 * naming a Test at all - an entry whose **Test** field stands alone has said nothing of a
 * later moment, and its card offers the Test as it always did. False only where every Test
 * the words name waits for a later one: 07's Thornguard, Entangling Vines, Frozen Ground,
 * Hailstorm, Starweave, The Deep and Nether Collapse among them.
 *
 * @param {unknown} text
 * @returns {boolean}
 */
export function asksTestAtCast(text) {
  const timing = testTiming(text);
  return timing.atCast.length > 0 || timing.later.length === 0;
}

/**
 * **THE RESILIENCE A SPELL'S CARD OFFERS AT THE CAST**, or null: the entry's own **Test**
 * field (07 §9), where its words ask that Test at the cast (`asksTestAtCast`). A spell
 * whose Test waits for a creature entering, starting a turn, crossing or striking offers
 * none on its card: the area's Test card, or the table, makes it when the moment comes.
 * The one reading the cast's door and the census share.
 *
 * @param {{test?: {resilience?: string|null}, effect?: string}|null} sys  a spell's system data
 * @returns {string|null}
 */
export function castTestOf(sys) {
  const resilience = typeof sys?.test?.resilience === "string" && sys.test.resilience ? sys.test.resilience : null;
  if (!resilience) return null;
  return asksTestAtCast(sys?.effect ?? "") ? resilience : null;
}

/* ------------------------------------------------------------------ */
/*  WHO MAY MAKE THE CAST'S TEST (the B9a pass)                         */
/* ------------------------------------------------------------------ */

/**
 * The cast's Test made only by a KIND of creature: Holy Wrath's *an undead creature that
 * fails*, Enslave Demon's and Compel's *A demon that fails*. A second kind beside it the
 * system cannot read (Banish's *a demon or elemental*) gates nothing - the table's.
 */
const KIND_GATE_RE = /^an? (undead creature|demon)( or [a-z]+)? that fails\b/i;

/** Earth Shock's *If it is holding a Sustained spell it must pass ... or lose it*. */
const HOLDS_GATE_RE = /^If it is holding a Sustained spell\b/i;
const LOSES_SUSTAIN_RE = /\bor lose it\b/i;

/**
 * **WHO MAY MAKE THE CAST'S TEST, AND WHAT A FAILURE ENDS** (the B9a pass; the book gave
 * Holy Wrath and Earth Shock their **Test** fields): the subject of the clause 07 asks at
 * the cast, where it names a kind of creature (`rules/creature-kinds.mjs`'s undead and
 * demon) or a creature holding a Sustained spell - and Earth Shock's *or lose it*, the
 * Sustain a failure ends. Null where the words gate nothing. Read off the entry's words
 * at the cast, as `castTestOf` is: no stored shape.
 *
 * @param {unknown} text  an entry's effect, HTML or Markdown
 * @returns {{kinds: string[], holds: "sustain"|null, loses: "sustain"|null}|null}
 */
export function castTestGate(text) {
  for (const clause of testTiming(text).atCast) {
    const kind = KIND_GATE_RE.exec(clause);
    if (kind) return kind[2] ? null : { kinds: [/undead/i.test(kind[1]) ? "undead" : "demon"], holds: null, loses: null };
    if (HOLDS_GATE_RE.test(clause)) return { kinds: [], holds: "sustain", loses: LOSES_SUSTAIN_RE.test(clause) ? "sustain" : null };
  }
  return null;
}

/** Why a creature makes no cast Test, as lang keys (the B9a pass). */
export const CAST_TEST_GATE_REFUSALS = Object.freeze({
  kind: "AZEROTH.Card.TestGate.Kind",
  sustain: "AZEROTH.Card.TestGate.Sustain"
});

/**
 * **WHETHER THIS CREATURE MAKES THE CAST'S TEST**: null where it does, else the reason it
 * does not - not of the kind the Test names (Holy Wrath's living target takes the damage
 * and makes no Test), or holding no Sustained spell (Earth Shock's has nothing to lose).
 * Judged at the cast off the target's snapshot and again at the press off the creature as
 * it stands, since a card is a record of a moment.
 *
 * @param {ReturnType<typeof castTestGate>} gate
 * @param {{kinds?: Iterable<string>, sustaining?: number}} o  what the creature is, and how many Sustains it holds
 * @returns {string|null}
 */
export function castTestRefusal(gate, { kinds = [], sustaining = 0 } = {}) {
  if (!gate) return null;
  const held = new Set(kinds ?? []);
  if ((gate.kinds ?? []).length && !gate.kinds.some(k => held.has(k))) return CAST_TEST_GATE_REFUSALS.kind;
  if (gate.holds === "sustain" && !(Number(sustaining) > 0)) return CAST_TEST_GATE_REFUSALS.sustain;
  return null;
}

/* ------------------------------------------------------------------ */
/*  A CREATURE'S ABILITY, IN 14's WORDS (the B8a2 pass)                 */
/* ------------------------------------------------------------------ */

/** 14's two spellings of a Test: *a Resilience (Reflex) Test* and 07's *a Reflex Resilience Test*. */
const TEST_14 = String.raw`(?:(?:Body|Reflex|Spirit) Resilience Test|Resilience \((?:Body|Reflex|Spirit)\) Test)`;

/**
 * **AN ABILITY'S DAMAGE THAT HALVES ON A PASS**, in 14's wordings: *8 Fire damage, or half
 * on a Resilience (Reflex) Test at DC 20*; *takes 6 damage and is **Entangled**, or half and
 * neither on a Resilience (Body) Test*; *or half and no throw on ...*; *takes 5 damage,
 * halved on a Resilience (Reflex) Test*. Never *as a Half-Action*.
 */
export const ABILITY_HALF_RE = new RegExp(String.raw`\bor half\b[^.]*?\bon an? ${TEST_14}|\bhalved on an? ${TEST_14}`, "i");

/**
 * **AN ABILITY'S DAMAGE THAT A PASS SPARES WHOLE**, in 14's wordings: *or none on a
 * Resilience (Reflex) Test*; *takes 8 damage and is knocked **Prone** unless it passes a
 * Resilience (Reflex) Test*; and the Wild Kodo's *Each one makes a Resilience (Reflex) Test at
 * DC 14 or takes 3 damage and is knocked **Prone***.
 */
export const ABILITY_NONE_RE = new RegExp(String.raw`\bor none on an? ${TEST_14}|\btakes?\s+\d+\s+(?:[A-Za-z]+\s+)?damage\b[^.]*?\bunless it passes an? ${TEST_14}|${TEST_14}(?:\s+at\s+DC\s+\d+)?\s+or\s+takes?\s+\d+\s+(?:[A-Za-z]+\s+)?damage\b`, "i");

/**
 * **A SENTENCE THAT HANDS A CONDITION TO THE TEST**, in 14's wordings: *... and is
 * **Stunned** until the end of its next turn unless it passes*, *or takes 3 damage and is
 * knocked **Prone***, *or half and neither*, *or half and no throw*, Azuregos's *or neither on
 * a Resilience (Spirit) Test*, Skeram's *or not on a Resilience (Spirit) Test*, Cho'gall's *A
 * creature that fails is also **Numbed***, and 07's *On a failure*.
 */
const ABILITY_GOVERNS_RE = /\bunless it passes\b|\bor (?:takes?|is|be|becomes)\b|\bor (?:half and )?(?:neither|not|no)\b|\bthat fails\b|\bon (?:a )?fail(?:ure|ed save)\b/i;

/**
 * Whether an ability's words halve its damage on a passed Test (`ABILITY_HALF_RE`).
 *
 * @param {unknown} text  the ability's prose, HTML or Markdown
 * @returns {boolean}
 */
export function abilityHalvesOnPass(text) {
  return ABILITY_HALF_RE.test(flatText(text));
}

/**
 * **WHETHER AN ABILITY'S DAMAGE IS ITS TEST'S FAILURE'S** - 14's Wild Kodo's *Each one makes
 * a Resilience (Reflex) Test at DC 14 or takes 3 damage* among them (`ABILITY_NONE_RE`), and
 * 07's wordings where a block writes them (`failureDamage`). Never where the words halve it
 * on a pass: that damage is the half's.
 *
 * @param {unknown} text
 * @returns {boolean}
 */
export function abilityNoneOnPass(text) {
  const flat = flatText(text);
  if (!flat || ABILITY_HALF_RE.test(flat)) return false;
  return ABILITY_NONE_RE.test(flat) || Boolean(failureDamage(flat));
}

/**
 * **WHETHER AN ABILITY'S TEST GOVERNS ITS CONDITION**: a sentence that names the condition
 * and hands it to the Test (`ABILITY_GOVERNS_RE`) - the Kodo's Prone, Whitemane's Stun,
 * Zul'jin's Bleeding - so a failure lands it at once (the lead: *"Land automatically"*) and a
 * pass leaves it off. A condition the words lay with no Test keeps its button.
 *
 * @param {unknown} text
 * @param {string|null} condition  an A1 key
 * @returns {boolean}
 */
export function abilityGoverns(text, condition) {
  if (typeof condition !== "string" || !condition) return false;
  const word = condition === "bleeding" ? "(?:Bleeding|Bleed)" : condition;
  const named = new RegExp(String.raw`\b${word}\b`, "i");
  return sentences(flatText(text)).some(s => named.test(s) && ABILITY_GOVERNS_RE.test(s));
}

/**
 * **THE CARDS WHOSE RESIST IS RECORDED** (D-726; the B6 fix for a feature's; the B8a2 pass for
 * a creature's ability): a spell's, a feature's and an ability's - the ones whose Apply reads
 * a half or a spare off the record, and whose failure lands what the Test governs.
 */
export const RESIST_RECORD_KINDS = Object.freeze(["spell", "feature", "ability", "gear"]);

/**
 * Whether a card of this kind records its Resist (`RESIST_RECORD_KINDS`).
 *
 * @param {unknown} kind  a card's `flags["azeroth-rpg"].kind`
 * @returns {boolean}
 */
export function recordsResist(kind) {
  return typeof kind === "string" && RESIST_RECORD_KINDS.includes(kind);
}
