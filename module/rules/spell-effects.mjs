/**
 * What a spell's effect text says the system can do after the cast
 * (2026-09-06). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * Three descriptors, each READ OFF THE PROSE ONLY WHERE THE WORDS ARE
 * UNAMBIGUOUS (D-647's rule for a creature's abilities), and each carried on
 * the spell so the card can offer a button:
 *
 * - `applies`: a spell that lasts - *Instant, 1 minute*, *8 hours*,
 *   Sustained - lays an effect on its targets. The effect always carries the
 *   spell's name and text; where the text names a number the sheet derives
 *   (Defense, Speed, a Ward) it carries the change too, in the `final`
 *   phase (D-596), and where it names one of A1's conditions on the target
 *   it carries the status. A Mana pool that *rises by 3* is a `pool` change
 *   (`rules/pool-change.mjs`), the system's own type, since a cap is derived
 *   per class and no key holds it. Ice Barrier's temporary Health rides no
 *   change: `castSpell` reads it off the entry (`temporary-health.mjs
 *   #readTemporaryHealth`) and the Apply grants it with the effect it lays
 *   (D-777).
 * - `rider`: Ice Lance - *Against a target that is **Slowed**, **Entangled**
 *   or **Prone** the Damage Rating is 5 instead* - a Rating that replaces or
 *   adds against a target in a condition. The card applies it where the
 *   target is in one and offers it where the table knows better.
 * - `onFail`: *one that fails a Reflex Resilience Test against your Spell
 *   DC is **Entangled*** - the conditions a failed Resist Test lands, so
 *   the card's Test applies them on a failure rather than the button
 *   applying them regardless (the lead, 2026-09-06).
 */

import { AZEROTH } from "../config.mjs";
import { POOL_CHANGE_TYPE, poolRises } from "./pool-change.mjs";

const SCHOOL_NAMES = Object.freeze(Object.fromEntries(Object.keys(AZEROTH.schools).map(k => [k, k])));

/** HTML to a flat line of markdown-ish text: `<strong>` back to `**`, tags gone, one space. */
export function flatText(html) {
  return String(html ?? "")
    .replace(/<\/?(strong|b)>/g, "**")
    .replace(/<\/p>\s*<p>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The condition id a bold name is, or null: `**Slowed**` → `slowed`, `**Bleeding 1**` → `bleeding`. */
export function conditionId(name) {
  const key = String(name ?? "").trim().toLowerCase().replace(/\s+\d+$/, "");
  return AZEROTH.conditions[key] ? key : null;
}

/** Every `**Condition**` named in a run of text, as ids, in order and once. */
function conditionsNamed(text) {
  const out = [];
  for (const m of String(text).matchAll(/\*\*([A-Za-z]+(?: \d+)?)\*\*/g)) {
    const id = conditionId(m[1]);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * The sentences of a flat text.
 *
 * **EXPORTED, and the ONE splitter** (D-722). `rules/signatures.mjs` reads a
 * Signature one sentence at a time now, because a gate in one sentence covers
 * only that sentence (the lead, 2026-09-14), and a second copy of this regular
 * expression would be a second thing to keep in step.
 *
 * **IT BREAKS ON `.`, `!` AND `?` AND ON NOTHING ELSE, ON PURPOSE.** The
 * Doomhammer's Signature is *A Shaman wielding it may spend a Half-Action to
 * call the elements: every creature within 15 feet takes 4 Nature damage, and
 * Ward applies.* — its gate stands before the colon and its whole effect after
 * it, and Ashbringer and Quel'Serrar are the same shape with `, and`. A
 * splitter that ever gained `;` or `:` would strand the blast in an ungated
 * sentence and hand it to everybody. `rules/signatures.test.mjs` holds that.
 */
export function sentences(text) {
  return String(text).split(/(?<=[.!?])\s+(?=[A-Z*])/).map(s => s.trim()).filter(Boolean);
}

/**
 * Ice Lance's shape: a Rating that replaces, or a number more, against a
 * target in one of the named conditions.
 * @returns {{statuses: string[], rating: number, mode: "replace"|"add"}|null}
 */
export function seedRider(effectText) {
  const text = flatText(effectText);
  let m = /[Aa]gainst (?:a|any|one) (?:target|creature) (?:that|who|which) is ((?:\*\*[A-Za-z ]+\*\*(?:,? (?:or )?)?)+),? the Damage Rating is (\d+) instead/.exec(text);
  if (m) {
    const statuses = conditionsNamed(m[1]);
    if (statuses.length) return { statuses, rating: Number(m[2]), mode: "replace" };
  }
  m = /deals? (\d+) more(?: damage)? (?:against|to) (?:a|any|one) (?:target|creature) (?:that|who|which) is ((?:\*\*[A-Za-z ]+\*\*(?:,? (?:or )?)?)+)/.exec(text);
  if (m) {
    const statuses = conditionsNamed(m[2]);
    if (statuses.length) return { statuses, rating: Number(m[1]), mode: "add" };
  }
  return null;
}

/**
 * The conditions a failed Resilience Test lands: read off the sentence that
 * names the failure, and only that sentence.
 * @returns {{resilience: string|null, statuses: string[]}|null}
 */
export function seedOnFail(effectText) {
  const text = flatText(effectText);
  for (const sentence of sentences(text)) {
    const fail = /fail(?:s|ed|ing)? (?:a|an|the|its|their|your)? ?(Body|Reflex|Spirit)? ?Resilience Test|on a fail(?:ure|ed Test)/i.exec(sentence);
    if (!fail) continue;
    // **THE FAILURE'S OWN CLAUSE, NOT THE SUCCESS'S** (found beside Absolute Zero,
    // D-778): *on a failure it ... is **Stunned** ..., and on a success it ... is
    // **Slowed** until the end of its next turn* laid Stunned AND Slowed on a
    // failure, and Stormwall and The Deep did the same. What follows *and on a
    // success* is the success's, and a failure lays none of it.
    const failing = sentence.split(/,? and on a success\b/i)[0];
    const statuses = conditionsNamed(failing);
    if (!statuses.length) continue;
    return { resilience: fail[1] ? fail[1].toLowerCase() : null, statuses };
  }
  return null;
}

/**
 * The effect a lasting spell lays on its targets: the changes the words
 * state on a derived number, and the conditions named on the target.
 * @param {string} effectText
 * @param {{kind: string|null, text: string}} duration   The spell's Duration field.
 * @param {string} target                                The spell's Target field.
 * @returns {{changes: Array<{key: string, type: string, value: string}>, statuses: string[]}|null}
 */
export function seedApplies(effectText, duration = {}, target = "") {
  const kind = duration?.kind ?? null;
  const text = flatText(effectText);
  const lasting = kind === "sustained" || (kind === "timed") || /,\s*\d+ (?:minute|hour|round|day)s?|until dismissed/i.test(duration?.text ?? "");
  if (!lasting) return null;
  const changes = [];
  const add = (key, value) => changes.push({ key, type: "add", value: String(value) });
  let m;
  if ((m = /(?:Defense (?:rises|increases|goes up) by|\+)(\d+)(?: (?:to )?Defense)?/.exec(text)) && /Defense/.test(m[0])) add("system.defense", m[1]);
  else if ((m = /(\d+) more Defense/.exec(text))) add("system.defense", m[1]);
  if ((m = /Speed (?:rises|increases) by (\d+)/.exec(text))) add("system.speed", m[1]);
  if ((m = /Speed (?:is )?(?:reduced|falls|drops) by (\d+)/.exec(text))) add("system.speed", -Number(m[1]));
  // *Damage the target takes is reduced by 3 for the duration* (07's Pain
  // Suppression and Barkskin; found beside 04's Pain Suppression, D-774): the
  // every-source reduction D-696 made `system.damageReduction`, which the one
  // damage door spends on every blow. Neither spell laid it, so both reduced
  // nothing.
  if ((m = /\bDamage (?:the target|it|you) takes? is reduced by (\d+)/i.exec(text))) add("system.damageReduction", m[1]);
  // *Ward 3 against Shadow and Fel* is a Ward against EACH school it names
  // (found reading the lay door for D-770): Light Unending laid Shadow and
  // dropped Fel. The list holds school names alone, so *Ward 3 against Fel and
  // Ward 2 against Shadow* is still two Wards, each with its own number.
  for (const w of text.matchAll(WARD_LIST)) {
    for (const word of w[2].replace(/\*\*/g, "").split(/,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+/)) {
      const school = word.trim().toLowerCase();
      if (SCHOOL_NAMES[school]) add(`system.ward.${school}`, w[1]);
    }
  }
  for (const w of text.matchAll(/\+(\d+) Ward in ([A-Z][a-z]+)/g)) {
    const school = String(w[2]).toLowerCase();
    if (SCHOOL_NAMES[school]) add(`system.ward.${school}`, w[1]);
  }
  // A pool's cap (Arcane Intellect, Arcane Brilliance): the system's own change type.
  for (const r of poolRises(text)) changes.push({ key: r.key, type: POOL_CHANGE_TYPE, value: String(r.points) });
  // A condition named on the target, not on the caster: the sentence must
  // not be about "you", and a Self spell names none.
  const statuses = [];
  const self = /^self$/i.test(String(target).trim());
  if (!self) {
    for (const sentence of sentences(text)) {
      if (/\byou(?:r)?\b/i.test(sentence) && !/(?:the|each|every|one|any) (?:target|creature)/i.test(sentence)) continue;
      if (/fail(?:s|ed)? (?:a|an|the)? ?(?:Body|Reflex|Spirit)? ?Resilience Test/i.test(sentence)) continue;
      // **A CONDITION THE TARGET CANNOT BE IS ONE IT REFUSES, NEVER ONE IT IS
      // GIVEN** (A1: *Cannot be X prevents the condition*; CLAUDE.md §15's
      // pitfall for a creature's rule; found reading the lay door for D-770).
      // Levitate laid Prone on its target, Light Unending Frightened and
      // Charmed on its allies, Barkskin Bleeding and Elune's Answer Blinded.
      // **A CONDITION THE TARGET MAY IGNORE IS NOT ONE IT IS GIVEN EITHER** (07's
      // Pain Suppression: *the target may ignore one **Bleeding** effect*; D-774):
      // its Apply laid Bleeding on the creature it was cast to protect.
      for (const id of conditionsNamed(sentence.replace(CANNOT_BE, " ").replace(MAY_IGNORE, " "))) if (!statuses.includes(id)) statuses.push(id);
    }
  }
  return { changes, statuses };
}

/** The schools a Ward sentence names: *Ward 3 against Shadow and Fel*, *Ward 2 against **Frost***. */
const SCHOOL_WORD = "(?:\\*\\*)?(?:Fire|Frost|Arcane|Nature|Shadow|Fel|Holy)(?:\\*\\*)?";
const WARD_LIST = new RegExp(`Ward (\\d+) against (${SCHOOL_WORD}(?:(?:, (?:and |or )?| and | or )${SCHOOL_WORD})*)`, "g");

/** *cannot be **Frightened** or **Charmed***, *cannot be knocked **Prone***: the clause and the conditions it refuses. */
const CANNOT_BE = /\bcannot be (?:knocked )?(?:\*\*[A-Za-z]+(?: \d+)?\*\*(?:,? (?:or |and )?)?)+/gi;

/** *may ignore one **Bleeding** effect*: a condition the target is spared, never one it is given (D-774). */
const MAY_IGNORE = /\bmay ignore (?:one |a |any )?(?:\*\*[A-Za-z]+(?: \d+)?\*\*)/gi;

/**
 * The three descriptors for one spell's fields.
 * @param {{effect: string, duration: object, target: string, damage: object}} spell
 */
export function seedSpellEffects({ effect = "", duration = {}, target = "", damage = {} } = {}) {
  const hasDamage = damage?.rating !== null && damage?.rating !== undefined;
  return {
    applies: hasDamage ? null : seedApplies(effect, duration, target),
    rider: hasDamage ? seedRider(effect) : null,
    onFail: seedOnFail(effect),
    cost: seedCost(effect)
  };
}

/**
 * What CASTING costs beyond the Mana, read off the entry's own words.
 *
 * Sixteen spells say a Health price in their effect — *Casting it costs you 2
 * Health* (Doom Bolt), *pay 8 Health* (Annihilation) — and nothing read a word
 * of it, so Doom Bolt was free (the lead, 2026-09-07). 07 §8 sets the shape:
 * Health spent on a spell bypasses armour and Ward, inflicts no Critical
 * Injury, and may never take the caster below 1.
 *
 * **The cost is paid whether the Test lands or not**, as Overchannel's is
 * (07 §8: *a failed Test still costs everything you paid*).
 *
 * @param {string} effect  the entry's effect, HTML or plain
 * @returns {{health: number}|null}
 */
export function seedCost(effect = "") {
  const text = String(effect).replace(/<[^>]+>/g, " ");
  // `costs you N Health`, `costs N Health`, `pay N Health`, `lose N Health`.
  const m = /(?:costs?\s+(?:you\s+)?|pay\s+|lose\s+)(\d+)\s+Health/i.exec(text);
  if (!m) return null;
  const health = Number(m[1]);
  return Number.isFinite(health) && health > 0 ? { health } : null;
}

/**
 * The v14 duration for a spell's Duration field: rounds in a started fight
 * (ten a minute, 06 §5), world time otherwise; nothing for Instant, for
 * Sustained (the sheet holds it) and for *until dismissed*.
 * @param {{kind: string|null, text: string}} duration
 * @param {{inFight?: boolean}} [o]
 * @returns {{value: number, units: string, expiry?: string}|null}
 */
export function effectDuration(duration = {}, { inFight = false } = {}) {
  const text = String(duration?.text ?? "");
  const m = /(\d+)\s*(minute|hour|round|turn|day)s?/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "turn") return { value: n, units: "turns", expiry: "turnEnd" };
  if (unit === "round") return { value: n, units: "rounds", expiry: "turnEnd" };
  if (inFight && unit === "minute") return { value: n * 10, units: "rounds", expiry: "turnEnd" };
  return { value: n, units: `${unit}s` };
}

/** The Rating a target takes from a spell with a rider: the rider's where the target is in one of its conditions. */
export function riderRating(rider, baseRating, targetStatuses = []) {
  if (!rider || baseRating === null || baseRating === undefined) return { rating: baseRating, applied: false };
  const hit = (rider.statuses ?? []).some(id => targetStatuses.includes(id));
  if (!hit) return { rating: baseRating, applied: false };
  return { rating: rider.mode === "add" ? baseRating + rider.rating : rider.rating, applied: true };
}
