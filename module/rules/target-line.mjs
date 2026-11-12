/**
 * **HOW MANY A SPELL OR A USE MAY NAME, AND WHETHER THEY MUST BE WILLING**
 * (O-293; the lead, 2026-11-10: *"293 - yes build that"* and *"296 - ally means
 * willing target"*). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * 07 §9's **Target** field - *Up to six willing creatures*, *Up to four allies*,
 * *One willing ally*, *Self and up to five creatures you touch* - and the clause
 * a feature's or a talent's Use names its creatures in (*One ally other than you
 * within 30 feet*, *Up to 6 targets within 30 feet*) carry two rules no door
 * read: a count, and a word for whom. A seventh Timeslip target was moved, and
 * Hour of Haste on an enemy gave it the Half-Action (D-892).
 *
 * **ONE PREDICATE FOR WILLING** (the lead: *ally means willing target*): a
 * creature named *willing*, an *ally* or a *friendly target* is judged by D-755's
 * one ally rule (`rules/distance.mjs#countsAsAlly`), read at the door through
 * `canvas/engaged.mjs#willingOf`. The caster is their own ally, unless the words
 * say *other than you*. Nothing asks the target's player: a creature on the
 * caster's side is willing, and one that is not is refused.
 *
 * **MY READINGS, for the lead** (D-893): a count is enforced only where the words
 * state one (*up to N*); *One creature* with two targeted is left to the door that
 * reads its first target, as it was. A count that scales (*per rank*) is read
 * by the Use's own door and not here. *Self and up to N* does not count the caster
 * among the N.
 */

/** 07's numbers in words. */
const NUMBER_WORDS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
});

/**
 * **A TARGET LINE, READ**: the most it may name (`max`, null where it states no
 * count), whether the caster rides along beside the count (`self`, *Self and up
 * to N*), whether each must be willing (`willing`: *willing*, *ally*, *allies*,
 * *friendly target*), and whether the caster is barred (`otherThanYou`).
 *
 * **A CHAIN** (`chain`): *One creature, then two more* (07's Chain Lightning and Wellspring) names
 * the first creature at the Range and each later one from the creature before it (*within 15 feet
 * of it*), so the range door holds only the FIRST creature to the Range (stage 11, D-906).
 *
 * @param {string} line
 * @returns {{max: number|null, self: boolean, willing: boolean, otherThanYou: boolean, chain: boolean}}
 */
export function readTargetLine(line) {
  const t = String(line ?? "").replace(/<[^>]*>/g, " ").replace(/\*\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const m = /\bup to (\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?!\s*(?:-|ft\b|feet\b|foot\b))(?![^.,;]*\bper\b)/.exec(t);
  const max = m ? (/^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]]) : null;
  return {
    max: Number.isFinite(max) ? max : null,
    self: /^self and\b|\byou and up to\b/.test(t),
    willing: /\bwilling\b|\ball(?:y|ies)\b|\bfriendly targets?\b/.test(t),
    otherThanYou: /\bother than (?:you|yourself)\b/.test(t),
    chain: /\bthen (?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) more\b/.test(t)
  };
}

/** Token dispositions, as `CONST.TOKEN_DISPOSITIONS` numbers them (14.367). */
const FRIENDLY = 1;
const NEUTRAL = 0;
const HOSTILE = -1;

/**
 * **WHETHER A CREATURE IS WILLING** (the lead, 2026-11-10: *"296 - ally means willing
 * target"*), the ONE predicate: pure, over facts the door reads.
 *
 * 1. **The caster is willing**, and so is the caster's ally by D-755's one rule (`ally`:
 *    the tracker's sides in the caster's fight, the Party outside one).
 * 2. **A NEUTRAL creature is willing, in a fight and out of one** (the lead, 2026-11-11:
 *    *"300 - neutral can be willing"*; D-900). Its token's disposition is what is read, so a
 *    NEUTRAL creature the tracker has put on the other side is still willing: the sides say
 *    who threatens whom (`rules/distance.mjs#countsAsEnemy`), and this says who takes a spell
 *    or a Use without a Test. A SECRET token is not NEUTRAL and is not willing.
 * 3. **Outside a fight they share, a token on the caster's own side of the board is
 *    willing**: FRIENDLY beside a FRIENDLY caster, HOSTILE beside a HOSTILE one. This keeps
 *    a fellow adventurer nobody has put in the Party from being refused a heal out of a
 *    fight.
 * 4. **Otherwise, in a fight they share, the sides decide**: a HOSTILE or SECRET creature on
 *    the other side is not willing, and a HOSTILE one on the caster's own side is an ally (1).
 *
 * Nothing asks the target's player: a prompt would spend the target's time, and the lead
 * has not asked for one (O-300).
 *
 * @param {{self?: boolean, ally?: boolean, sameFight?: boolean, casterDisposition?: number|null, otherDisposition?: number|null}} facts
 */
export function willingFrom({ self = false, ally = false, sameFight = false, casterDisposition = null, otherDisposition = null } = {}) {
  if (self || ally) return true;
  if (otherDisposition === NEUTRAL) return true;
  if (sameFight) return false;
  return (casterDisposition === FRIENDLY || casterDisposition === HOSTILE) && otherDisposition === casterDisposition;
}

/**
 * **THE VERDICT ON WHO IS NAMED**, before anything is spent.
 *
 * @param {{max: number|null, self: boolean, willing: boolean, otherThanYou: boolean}} read  `readTargetLine`
 * @param {Array<{name: string, self?: boolean, willing?: boolean}>} named  every target handed in,
 *   `self` where it is the caster, `willing` off `canvas/engaged.mjs#willingOf`
 * @returns {{ok: true}|{ok: false, reason: string, name?: string, max?: number, count?: number}}
 */
export function judgeNamed(read, named = []) {
  const list = (named ?? []).filter(Boolean);
  if (read?.otherThanYou) {
    const own = list.find(r => r.self === true);
    if (own) return { ok: false, reason: "AZEROTH.Range.NotSelf", name: own.name ?? "" };
  }
  if (Number.isFinite(read?.max)) {
    const count = list.filter(r => !(read.self && r.self === true)).length;
    if (count > read.max) return { ok: false, reason: "AZEROTH.Range.TooMany", max: read.max, count };
  }
  if (read?.willing) {
    const unwilling = list.find(r => r.self !== true && r.willing !== true);
    if (unwilling) return { ok: false, reason: "AZEROTH.Range.NotWilling", name: unwilling.name ?? "" };
  }
  return { ok: true };
}
