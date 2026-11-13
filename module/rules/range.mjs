/**
 * **HOW FAR A SPELL OR AN ABILITY REACHES, AND WHETHER A TARGET IS INSIDE IT**
 * (O-288; the lead, 2026-11-10: *"If an attempt to cast is out of the spells
 * range to the target, it should be stopped before resources are spent."* and
 * *"for O-288 make sure spell and ability range is considered system wide"*).
 * Pure, no Foundry imports (CLAUDE.md §3).
 *
 * 07 §9: *Distances are in feet and measured from the caster unless the entry
 * says otherwise.* A spell's **Range** field is Self, Touch or a distance; a
 * class feature, a talent's Use, a creature's ability, a consumable and a
 * Signature state theirs in a sentence - *A creature you can see within 30
 * feet*. Both are read here, and `check` is the one verdict. The distance itself
 * is measured by `canvas/footprints.mjs` exactly as D-669 measures a weapon's
 * (the nearest spaces two tokens occupy, elevation counted); nothing measured is
 * nothing refused (D-669).
 *
 * **MY READINGS, for the lead** (D-893):
 * - **Touch is 5 feet**: 06's reach without a Reach weapon. The lead confirmed it on O-297
 *   (2026-11-10: *"touch is 5 feet."*).
 * - **Self** has no range test, nor has a spell with no Range.
 * - A spell aimed at an **area** is judged at the point placed, never at the
 *   creatures it catches; one aimed at an area **centred on the caster** (a
 *   cone, *centered on you*, *each ally within*) is not judged at all.
 * - In a sentence, *each*, *every* and *all* creatures *within N feet* is an
 *   area about the user and refuses nothing; *a*, *an*, *one*, *up to N* and
 *   *any number of* creatures *within N feet* name targets, and every target
 *   handed in is judged. A distance *of* something other than the user (*within
 *   10 feet of its target*) is not the user's reach, and a distance inside a
 *   trigger clause (*when a creature within 10 feet hits you*) names no target.
 */

// 06 §5's reach without a Reach weapon: what *engaged with in melee* starts from.
import { BASE_REACH } from "./distance.mjs";

/**
 * 06 §1's reach: a Touch spell reaches the creature beside you (MY READING, D-893; the lead,
 * 2026-11-10, on O-297: *"touch is 5 feet."*).
 */
export const TOUCH_FEET = 5;

/** A mile, in feet: 07's *1 mile* Range. */
export const MILE_FEET = 5280;

/** How far past a printed Range a measure may read and still be at it (floating point). */
export const RANGE_EPSILON = 0.01;

/** The kinds a Range reads as. `unread` is a phrase this reader does not know, which the census fails. */
export const RANGE_KINDS = Object.freeze(["none", "self", "touch", "feet", "unlimited", "unread"]);

/**
 * **A SPELL'S RANGE FIELD**, read: Self, Touch, a distance in feet or miles,
 * Sight or Unlimited. Blank is `none`; anything else is `unread`.
 *
 * @param {string|null|undefined} text
 * @returns {{kind: string, feet: number|null, text: string}}
 */
export function readRange(text) {
  const raw = String(text ?? "").trim();
  const out = (kind, feet = null) => ({ kind, feet, text: raw });
  if (!raw) return out("none");
  const flat = raw.toLowerCase().replace(/\s+/g, " ");
  if (flat === "self" || flat === "you") return out("self");
  if (flat === "touch") return out("touch", TOUCH_FEET);
  if (flat === "sight" || flat === "unlimited" || flat === "any distance") return out("unlimited");
  let m = /^(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)\.?$/.exec(flat);
  if (m) return out("feet", Number(m[1]));
  m = /^(\d+(?:\.\d+)?|a|one)\s*miles?$/.exec(flat);
  if (m) return out("feet", (/^\d/.test(m[1]) ? Number(m[1]) : 1) * MILE_FEET);
  return out("unread");
}

/**
 * **A TOUCH RANGE CAST FURTHER** (08 §20's Hand of the Church: *A Priest wearing it casts
 * healing spells with a Range of Touch at a range of 30 feet*; D-912): a read Range of
 * Touch becomes `feet` where the caller says the spell qualifies; every other Range, and
 * a widening no further than Touch, is returned as it was.
 *
 * @param {{kind: string, feet: number|null, text: string}|null} reach  `readRange`'s
 * @param {number} feet
 */
export function touchAt(reach, feet = 0) {
  const n = Number(feet) || 0;
  if (reach?.kind !== "touch" || !(n > TOUCH_FEET)) return reach;
  return { kind: "feet", feet: n, text: reach.text };
}

/**
 * **WHETHER A SPELL'S TARGET LINE NAMES CREATURES THE CAST IS JUDGED AT**: the
 * targets themselves, not an area. An area is judged at its placed point
 * (`judgesPoint`); an area about the caster, and the caster, at nothing.
 *
 * @param {string} target  07's Target field
 */
export function judgesTargets(target) {
  const t = String(target ?? "").trim().toLowerCase();
  if (!t || t === "self" || t === "you") return false;
  if (/\b(radius|cone|line|cube|area|region|country|point|wall)\b/.test(t)) return false;
  if (/^(?:self and )?(?:each|every|all)\b/.test(t)) return false;
  return true;
}

/**
 * **WHETHER A SPELL'S AREA IS PLACED AT A POINT THE RANGE REACHES TO** (07 §9:
 * *A radius is measured out from a point*): a radius, line or cube that is not
 * centred on the caster, or a point named outright. A cone spreads from the
 * caster and is not placed at a distance.
 *
 * @param {string} target
 */
export function judgesPoint(target) {
  const t = String(target ?? "").trim().toLowerCase();
  if (!t || /\bcentered on you\b|\bcentred on you\b|\baround you\b|\bnext to you\b/.test(t)) return false;
  if (/\bcone\b/.test(t)) return false;
  return /\b(radius|line|cube|point|area|wall)\b/.test(t);
}

/** Strip HTML and the markdown bold an effect carries, and flatten whitespace. */
function flat(text) {
  return String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 07 §9's distances in a sentence: *30 feet*, *30 ft*, *thirty feet*. */
const WORD_NUMBERS = Object.freeze({ five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, hundred: 100 });
const WITHIN = /\bwithin\s+(\d+|five|ten|fifteen|twenty|thirty|forty|fifty|sixty|a hundred)(?:-|\s+)(?:feet|foot|ft)\b(\s+of\s+([A-Za-z'’]+))?/gi;

/** The words in a clause that name a creature a Use is aimed at. */
const CREATURE_NOUN = /\b(creatures?|targets?|all(?:y|ies)|enem(?:y|ies)|casters?|constructs?|demons?|elementals?|humanoids?|undead|beasts?|corpses?|casting tests?|someone|anyone)\b/i;
/** The words that name a place rather than a creature: judged at a placed point, if anywhere. */
const PLACE_NOUN = /\b(points?|spaces?|areas?|radius|font|trap|cloud|pad|ground|anywhere)\b/i;
/** A plural creature noun: with no count, an area about the user. */
const PLURAL_NOUN = /\b(creatures|targets|allies|enemies|casters|constructs|demons|elementals|humanoids|beasts)\b/i;
/** A count that turns a plural into a choice of targets. */
const COUNTED = /\bup to\b|\bany number\b|\bchoose\b|\bchosen\b|\ba number of\b|\b(?:two|three|four|five|six|\d+)\s+(?:\w+\s+)?(?:creatures|targets|allies|enemies)\b/i;
/** A clause that sets a trigger rather than naming the target. */
const TRIGGER = /\b(when|whenever|if|while|until|after|each time|the first time|unless|that (?:begins|starts|ends|enters|comes))\b/i;

/**
 * **THE REACH A SENTENCE GIVES A USE** (a feature, a talent's Use, a creature's
 * ability, a consumable, a Signature): the first *within N feet* in the text
 * that names a creature the user reaches. Null where the text states no
 * distance at all.
 *
 * Every answer carries the distance read (`distance`) and its `kind`; only a
 * `target` carries `feet`, which is the one thing a door judges by, so no caller
 * can refuse on another kind by accident:
 *
 * | kind | example | judged |
 * |---|---|---|
 * | `target` | *One creature within 30 feet*, *up to 6 targets within 30 feet* | every target handed in |
 * | `area` | *each ally within 30 feet*, *enemies within 15 feet* | nothing: an area about the user |
 * | `point` | *a point within 60 feet*, *a space you can see within 20 feet* | the point a door places, where one does |
 * | `trigger` | *when a creature you can see attacks an ally within 10 feet of you* | the card's creature, at a Reaction answered from a card |
 * | `attack` | *make one melee attack against a creature within 5 feet* | nothing: a blow warns outside reach (D-716) |
 * | `relative` | *within 10 feet of its target* | nothing: not the user's reach |
 *
 * A `target` read off *a creature you are engaged with in melee* (02's Pummel) carries `melee`, and
 * the door judges it at the user's own reach, 5 feet or 10 with a Reach weapon (the lead: *"pummel
 * requires melee"*).
 *
 * @param {string} text  HTML or plain
 * @returns {{kind: string, feet: number|null, distance: number, phrase: string, clause?: string}|null}
 */
export function rangeInText(text) {
  const body = flat(text);
  if (!body) return null;
  let fallback = null;
  const keep = (kind, n, phrase) => { fallback ??= { kind, feet: null, distance: n, phrase }; };
  // A sentence at a time, split as `rules/spell-effects.mjs#sentences` splits.
  const parts = body.split(/(?<=[.!?])\s+(?=[A-Z*])/).map(s => s.trim()).filter(Boolean);
  for (const sentence of parts) {
    WITHIN.lastIndex = 0;
    let m;
    while ((m = WITHIN.exec(sentence))) {
      const word = m[1].toLowerCase();
      const n = /^\d+$/.test(word) ? Number(word) : (word === "a hundred" ? 100 : WORD_NUMBERS[word]);
      const phrase = m[0];
      const of = m[3] ? m[3].toLowerCase() : null;
      const before = sentence.slice(0, m.index);
      // The clause the distance sits in: back to the last comma, semicolon or colon.
      const clause = before.split(/[,;:]/).pop() ?? "";
      if (of && of !== "you" && of !== "yourself") { keep("relative", n, phrase); continue; }
      if (TRIGGER.test(clause)) { keep("trigger", n, phrase); continue; }
      if (/\battacks?\b/i.test(before) && n <= 10) { keep("attack", n, phrase); continue; }
      // The noun nearest the distance decides: *targets in a 20-foot area within 60 feet* (02's
      // Hurricane) is an area placed within 60 feet, not targets within it.
      const lastAt = re => { let at = -1; const g = new RegExp(re.source, "gi"); let x; while ((x = g.exec(clause))) at = x.index; return at; };
      const creatureAt = lastAt(CREATURE_NOUN);
      const placeAt = lastAt(PLACE_NOUN);
      const creature = creatureAt > -1 && creatureAt > placeAt;
      if (!creature && placeAt > -1) { keep("point", n, phrase); continue; }
      if (/\b(each|every|all)\b/i.test(clause) && !/\bup to\b|\bany number\b/i.test(clause)) { keep("area", n, phrase); continue; }
      const single = /\b(?:a|an|one)\s+(?:[\w'’-]+\s+){0,3}?(?:creature|target|ally|enemy|caster|construct|demon|elemental|humanoid)\b/i;
      if (PLURAL_NOUN.test(clause) && !COUNTED.test(clause) && !single.test(clause)) { keep("area", n, phrase); continue; }
      if (!creature) { keep("relative", n, phrase); continue; }
      // The clause that names the creatures travels with the reach, so the Use's
      // count and its *willing* word are read off the same words (O-293).
      return { kind: "target", feet: n, distance: n, phrase, clause: `${clause.trim()} ${phrase}`.trim() };
    }
  }
  // **A CREATURE YOU ARE ENGAGED WITH IN MELEE** (02's and 06 §6's Pummel; the lead, 2026-11-10:
  // *"pummel requires melee"*): a target within the user's own reach - 06 §5's 5 feet, 10 with a
  // Reach weapon - which the door reads off the user (`canvas/range.mjs#useRangeRefusal`, through
  // `canvas/engaged.mjs#reachOfActor`), never a number the words do not state. `feet` is the reach
  // without a Reach weapon, for a reader that has no user.
  for (const sentence of parts) {
    const e = /\b(?:a|an|one|the)\s+(?:creature|target|enemy|caster)\s+you are engaged with in melee\b/i.exec(sentence);
    if (e && !TRIGGER.test(sentence.slice(0, e.index).split(/[,;:]/).pop() ?? "")) {
      return { kind: "target", feet: BASE_REACH, distance: BASE_REACH, phrase: e[0], clause: e[0], melee: true };
    }
  }
  // *by touch*, *a creature you touch* (02's Lay on Hands): Touch's 5 feet, where the
  // words name no distance of their own (MY READING, D-893; the lead: *"touch is 5 feet."*).
  for (const sentence of parts) {
    const t = /\b(by touch|(?:creatures?|targets?|all(?:y|ies)) you (?:can )?touch|touched)\b/i.exec(sentence);
    if (t && !TRIGGER.test(sentence.slice(0, t.index).split(/[,;:]/).pop() ?? "")) {
      const clause = sentence.slice(0, t.index + t[0].length).split(/[,;:]/).pop() ?? t[0];
      return { kind: "target", feet: TOUCH_FEET, distance: TOUCH_FEET, phrase: t[0], clause: clause.trim() };
    }
  }
  return fallback;
}

/**
 * **A USE'S REACH AS A TALENT WIDENS IT** (the sweep's stage 4): the feature's own words are
 * what `rangeInText` reads, and a talent that changes them prints its change in 04 alone -
 * Swift Current's *Your Slipstream reaches 60 feet*, Twinned Hours' rank 2 *it may target
 * you*. So the read is widened by what the door works out off the talents: `feet` replaces a
 * smaller reach, and `self` drops *other than you* from the clause the count and the willing
 * word are read off. Only a `target` read is widened; every other kind refuses nothing anyway.
 * `add` is feet ADDED to the reach the words state (04's Empowered Mending: *Your Mass Mend
 * class feature reaches 10 feet further per rank*; `rules/class-talents.mjs#reachWidenFor`),
 * laid before `feet` is compared. Never a melee reach (Pummel's is the user's own).
 * Answers a new read, never the one handed in.
 *
 * @param {{kind: string, feet: number|null, distance: number, phrase: string, clause?: string}|null} read  `rangeInText`
 * @param {{feet?: number, add?: number, self?: boolean}|null} widen
 */
export function widenReach(read, widen = null) {
  if (!read || !widen || read.kind !== "target") return read;
  const out = { ...read };
  const add = Math.trunc(Number(widen.add));
  if (read.melee !== true && Number.isFinite(add) && add > 0 && Number.isFinite(Number(read.feet))) {
    out.feet = Number(read.feet) + add;
    out.distance = out.feet;
  }
  const feet = Number(widen.feet);
  if (Number.isFinite(feet) && feet > (Number(out.feet) || 0)) {
    out.feet = feet;
    out.distance = feet;
  }
  if (widen.self === true && typeof out.clause === "string") {
    out.clause = out.clause.replace(/\s*\bother than (?:you|yourself)\b/gi, "").replace(/\s+/g, " ").trim();
  }
  return out;
}

/**
 * **THE DISTANCE A REACTION ANSWERED FROM A CARD JUDGES ITS CREATURE BY**: a
 * `target` reach, else the distance its trigger names (*attacks an ally within
 * 10 feet of you*). Null where the text names neither.
 *
 * @param {string} text
 * @returns {{feet: number}|null}
 */
export function answerReach(text) {
  const read = rangeInText(text);
  if (!read) return null;
  if (read.kind === "target" || read.kind === "trigger") return { feet: read.distance };
  return null;
}

/**
 * **THE VERDICT**: whether a target this far away is inside the reach.
 *
 * Self, Unlimited, no Range and an unread Range refuse nothing; an unmeasured
 * distance refuses nothing (D-669: *nothing is measured where a token is not on
 * the scene*). Exactly at the Range is inside it; anything past it is not.
 *
 * @param {{kind?: string, feet?: number|null}|null} reach  `readRange`, or `{feet}` off `rangeInText`
 * @param {number|null} distance  feet, or null where nothing was measured
 * @returns {{ok: boolean, reason: string|null, feet: number|null, distance: number|null}}
 */
export function check(reach, distance) {
  const feet = reach && (reach.kind === "feet" || reach.kind === "touch" || reach.kind === undefined)
    && Number.isFinite(Number(reach.feet)) && reach.feet !== null ? Number(reach.feet) : null;
  const measured = typeof distance === "number" && Number.isFinite(distance) ? distance : null;
  if (feet === null || measured === null) return { ok: true, reason: null, feet, distance: measured };
  if (measured <= feet + RANGE_EPSILON) return { ok: true, reason: null, feet, distance: measured };
  const reason = reach.kind === "touch" ? "AZEROTH.Range.RefusedTouch"
    : reach.melee === true ? "AZEROTH.Range.RefusedMelee" : "AZEROTH.Range.Refused";
  return { ok: false, reason, feet, distance: measured };
}

/**
 * **THE FIRST TARGET PAST THE REACH**, of several measured: `{name, ...check}`
 * for the first refused, sorted as handed in, or null where every one is inside.
 *
 * @param {{kind?: string, feet?: number|null}|null} reach
 * @param {Array<{name: string, distance: number|null}>} measured
 */
export function firstOutOfRange(reach, measured = []) {
  for (const row of measured ?? []) {
    const verdict = check(reach, row?.distance ?? null);
    if (!verdict.ok) return { name: row?.name ?? "", ...verdict };
  }
  return null;
}

/** A distance said in whole feet, rounded up so *61 feet* is never printed as *60*. */
export function feetWords(distance) {
  const n = Number(distance);
  return Number.isFinite(n) ? String(Math.ceil(n - RANGE_EPSILON)) : "";
}
