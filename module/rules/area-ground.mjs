/**
 * WHERE A SPELL MAKES THE GROUND DIFFICULT, AND WHO IGNORES IT (D-757; the
 * lead's play-test, 2026-09-25). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * 05 §10 defines **Difficult ground** once - *costs two feet for every one
 * crossed* - and D-754 made it the only term 07 uses. Twenty-five entries say
 * it, and they say three different things:
 *
 * 1. **The spell's AREA is Difficult ground** to everything crossing it -
 *    *the area is **Difficult ground** for the duration*, *the line is*, *the
 *    cone becomes*, *the crater is*, *Ash then hangs over the area: it is*.
 *    Twenty-two do, and a GM-side reconciler (`canvas/sustained-areas.mjs`)
 *    lays a `difficultFor` Region behavior on each one's placed area
 *    (`canvas/behaviors.mjs`).
 * 2. **Something that is not the placed area is** - Water Walking's *Rough
 *    water*, Lightning Strike's *space it occupied* (a single target: no area is
 *    placed), The Great Wild's *buildings ... within a day*. Each carries its
 *    `reason` and is the table's.
 * 3. **The TARGET ignores it** - Firewalk, Cold Snap, Icewalk, Ghost Wolf,
 *    Windwalk, Windrush and Blessing of Freedom. `ignores` rides the laid
 *    effect as a flag (`dice/chat.mjs#applySpellEffectFromCard`) and the one
 *    terrain door honours it for every source of Difficult ground at once
 *    (`rules/movement.mjs#paidDifficulty`).
 *
 * **Read each sentence, never the entry**: `areaTick.difficult` (D-756) was
 * read off the whole effect and only on a spell that also ticks, so fourteen
 * area spells that say Difficult ground stored `false` (review finding S7).
 * This is its own descriptor, on every spell.
 *
 * ## The descriptor, `system.areaGround` on every spell
 *
 *   difficult  07 makes the PLACED AREA Difficult ground to every creature
 *   lasts      {rounds}  the ground's own span where it is shorter than the
 *              area's - *until the end of your next turn* is one round
 *              (Ice Barrage, Icefall), counted from the moment it was placed
 *              as a timed area is (`area-ticks.mjs#areaLapsed`)
 *   from       "landing" where the ground is made when something lands *at the
 *              start of your next turn* (Meteor's crater, Cinderfall's ash);
 *              "" from the moment the area is placed
 *   ignores    the spell's target ignores Difficult ground
 *   reason     every Difficult-ground sentence the machinery cannot carry,
 *              "; "-joined, counted under a CEILING in `area-ground.test.mjs`
 *              that may only fall
 *
 * Every leaf is present on every spell, as `areaTick`'s are: the parser stamps
 * the whole shape (`check-packs.mjs` diffs key order) and the model cleans only
 * what it is handed (`cleanAreaGround`, CLAUDE.md §15).
 */

import { flatText, sentences } from "./spell-effects.mjs";
import { areaFor } from "./areas.mjs";
import { areaLapsed } from "./area-ticks.mjs";

/**
 * The Region behavior subtype Difficult ground is laid as (D-757). A system's
 * own subtype is UNPREFIXED - `World#prepareDataModel` (14.367,
 * `dist/packages/world.mjs`) keys `system.documentTypes` as written, where a
 * module's is `<module>.<type>` - so system.json's
 * `documentTypes.RegionBehavior.difficultFor` is this word exactly.
 */
export const DIFFICULT_BEHAVIOR = "difficultFor";

/**
 * The flag a laid spell effect carries where its target ignores Difficult
 * ground (D-757): written by the card's Apply (`dice/chat.mjs`), read by the
 * terrain door (`canvas/behaviors.mjs#movementFactsOf`). A word both sides
 * share, so it lives with the law rather than in either of them.
 */
export const IGNORES_GROUND_FLAG = "ignoresGround";

/** A spell that says nothing about Difficult ground: the whole shape, every leaf empty. */
export function emptyAreaGround() {
  return {
    difficult: false,
    lasts: { rounds: null },
    from: "",
    ignores: false,
    reason: ""
  };
}

/** The words 07 and 05 use for the term, bold or not (D-754 made the bold one the only one). */
const TERM = /\*\*Difficult ground\*\*|\bdifficult (?:ground|terrain)\b/i;

/** Whether a sentence names Difficult ground at all: what the census counts. */
export function namesDifficultGround(sentence) {
  return TERM.test(String(sentence ?? ""));
}

/** *you ignore **Difficult ground***, *ignores **Difficult ground***: the target's own. */
const IGNORES = /\bignores? (?:\*\*)?Difficult ground(?:\*\*)?/i;

/**
 * THE PLACED AREA'S OWN GROUND, in 07's grammar. The subject is the area, or
 * what lies over it and IS it for the duration (*Ash then hangs over the area
 * for the duration: it is*); a colon between the two is 07's own way of saying
 * so.
 */
const AREA_IS = [
  /\b(?:the|this) (?:area|line|cone|crater) (?:is|becomes) \*\*Difficult ground\*\*/i,
  /\bmakes the area \*\*Difficult ground\*\*/i,
  /\bthe area is \*\*Difficult ground\*\*/i,
  /:\s*it is \*\*Difficult ground\*\*/i,
  /\bThe ground (?:stays broken[^.]*?and )?is \*\*Difficult ground\*\*/i
];

/** 07's *until the end of your next turn*: the ground outlasts the cast by one round. */
const NEXT_TURN = /\buntil the end of your next turn\b/i;

/** Meteor's and Cinderfall's *lands at the start of your next turn*. */
const LANDS = /\blands at the start of your next turn\b/i;

/**
 * WHY A DIFFICULT-GROUND SENTENCE IS NOT CARRIED, in the chapter's own terms.
 * Each is one count under the test's ceiling.
 */
export const GROUND_REASONS = Object.freeze({
  notArea: "names ground inside the placed area that is not the area itself",
  noArea: "names ground the spell places no area for",
  instantIgnore: "an Instant spell lays no effect to carry the ignoring until the end of your next turn"
});

/**
 * **EVERY OTHER RULE THAT MAKES OR IGNORES DIFFICULT GROUND** (D-757), in 02,
 * 04 and 08, and what the system does with it. `area-ground.test.mjs` reads the
 * three chapters for every line naming Difficult ground or a movement penalty
 * and fails on one this table does not name. Consecrated Ground is D-753's
 * `spell` row and lays its ground through Consecration's placed area; the rest
 * are the table's, each for its reason.
 */
export const NON_SPELL_GROUND = Object.freeze({
  "Consecrated Ground": { automated: "the talent's `spell.ground`, laid on Consecration's placed area (D-753)" },
  "Mountain-Bred": { automated: "`RACE_TALENT_EFFECTS.dwarf`: Difficult ground and a climb cost a dwarf a foot a foot" },
  "Jungle-Born": { reason: "only vegetation counts, and no Region says what it is growing" },
  "Spirit Walk": { reason: "one Half-Action's move, which no laid effect carries" },
  "Master of the Land": { reason: "movement penalties from non-magical sources, on targets named for a day: the table's" },
  "Surefooted": { reason: "a mount trait, and a mount carried in the Stable is no token that moves" },
  "Killing Ground": { reason: "a class feature's area, which records no cast for the reconciler to read" },
  "Earthquake": { reason: "a class feature's area, which records no cast for the reconciler to read" }
});

/**
 * **READ THE GROUND OFF 07's OWN WORDS**, one sentence at a time.
 *
 * @param {string} effectText  the effect, HTML or flat
 * @param {{target?: string, duration?: {kind?: string|null}}} [fields]  07 §9's own
 * @returns {ReturnType<typeof emptyAreaGround>}  the whole shape, empty where the spell says nothing
 */
export function readAreaGround(effectText, fields = {}) {
  const ground = emptyAreaGround();
  const text = flatText(effectText);
  const list = sentences(text);
  const placed = Boolean(areaFor(String(fields?.target ?? "")));
  const reasons = [];
  for (const s of list) {
    if (!namesDifficultGround(s)) continue;
    if (IGNORES.test(s)) {
      ground.ignores = true;
      // A laid effect is what carries it, and an Instant spell lays none
      // (D-657): Cold Snap's *until the end of your next turn* has no carrier.
      if (fields?.duration?.kind === "instant") reasons.push(GROUND_REASONS.instantIgnore);
      continue;
    }
    if (placed && AREA_IS.some(re => re.test(s))) {
      ground.difficult = true;
      if (NEXT_TURN.test(s)) ground.lasts = { rounds: 1 };
      continue;
    }
    reasons.push(placed ? GROUND_REASONS.notArea : GROUND_REASONS.noArea);
  }
  if (ground.difficult && list.some(s => LANDS.test(s))) ground.from = "landing";
  ground.reason = [...new Set(reasons)].join("; ");
  return ground;
}

/**
 * **THE GROUND A PLACED AREA LAYS NOW, AND ON WHOM** (D-757): the spell's own
 * Difficult ground, which reaches every creature, or a talent's - Consecrated
 * Ground's *to an enemy that is undead or fel* (D-753) - or null.
 *
 * The spell's own is judged against the world's clock: *until the end of your
 * next turn* lapses one round after placement, and a crater made *at the start
 * of your next turn* is not there before it (`groundLanded`). The talent's is
 * the caster's AS THEY STAND NOW, handed in by the caller - a talent taken back
 * takes its ground with it - and falls back to what the card recorded where
 * the caster can no longer be read.
 *
 * Where both stand, the spell's reaches everybody the talent's does.
 *
 * @param {{areaGround?: object|null, ground?: {difficult?: string[], who?: string}|null,
 *   placedAt?: object|null}} row  the Region's record
 * @param {{difficult?: string[], who?: string}|null|undefined} talentGround  the caster's
 *   talents now (`talent-effects.mjs#spellAreaFor`), or undefined where the caster is unread
 * @param {object} [now]  `canvas/sustained-areas.mjs#worldClock`
 * @returns {{who: "creature"|"enemy", kinds: string[]}|null}
 */
export function groundNow(row = {}, talentGround = undefined, now = {}) {
  const own = row?.areaGround ?? null;
  if (own?.difficult === true) {
    const placedAt = row?.placedAt ?? null;
    const lapsed = Number(own.lasts?.rounds) > 0 && areaLapsed({ lasts: own.lasts, placedAt }, now);
    const early = own.from === "landing" && !groundLanded(placedAt, now);
    if (!lapsed && !early) return { who: "creature", kinds: [] };
  }
  const talent = talentGround === undefined ? (row?.ground ?? null) : talentGround;
  const kinds = Array.isArray(talent?.difficult) ? [...new Set(talent.difficult)].sort() : [];
  if (!kinds.length) return null;
  return { who: talent.who === "creature" ? "creature" : "enemy", kinds };
}

/**
 * **WHETHER A THING THAT LANDS AT THE START OF THE CASTER'S NEXT TURN HAS
 * LANDED** - Meteor's crater, Cinderfall's ash. One round after it was placed,
 * at the same point in the order or later, which is `areaLapsed`'s clock read
 * inclusively; out of a fight, six seconds of the world's clock (05). A record
 * with no clock has landed, so nothing waits forever.
 *
 * @param {{combatId?: string|null, round?: number|null, turn?: number|null, time?: number|null}|null} placedAt
 * @param {{time?: number, fights?: Record<string, number>, turns?: Record<string, number>}} now
 */
export function groundLanded(placedAt = null, { time = 0, fights = {}, turns = {} } = {}) {
  if (!placedAt) return true;
  if (placedAt.combatId) {
    const round = fights?.[placedAt.combatId];
    if (round === undefined || round === null) return true;
    const elapsed = Number(round) - (Number(placedAt.round) || 0);
    const at = placedAt.turn;
    const turn = turns?.[placedAt.combatId];
    if (!Number.isFinite(at) || !Number.isFinite(turn)) return elapsed >= 1;
    return elapsed > 1 || (elapsed === 1 && turn >= at);
  }
  if (placedAt.time === null || placedAt.time === undefined) return true;
  return (Number(time) || 0) - Number(placedAt.time) >= 6;
}

/**
 * **WHETHER A DIFFICULT-GROUND BEHAVIOR SLOWS THIS CREATURE** - the behavior's
 * filter as a pure function (`canvas/behaviors.mjs` hands it what the moving
 * token is). An area's own ground slows everybody; a talent's slows the kinds
 * it names, and an `enemy` one only an enemy of the caster (D-753: an allied
 * Forsaken is not slowed by the Paladin's Consecration).
 *
 * @param {{who?: string, kinds?: string[]}} spec  the behavior's own fields
 * @param {{relation?: string, kinds?: Set<string>|string[]}} mover
 * @returns {boolean}
 */
export function difficultApplies(spec = {}, { relation = "other", kinds = [] } = {}) {
  const who = spec?.who === "enemy" ? "enemy" : "creature";
  if (who === "enemy" && relation !== "enemy") return false;
  const want = [...new Set(spec?.kinds ?? [])];
  if (!want.length) return true;
  const has = kinds instanceof Set ? kinds : new Set(kinds ?? []);
  return want.some(k => has.has(k));
}

/*
 * THE MODEL'S GUARD (CLAUDE.md §15): `migrateData` runs over partial update
 * data as well as whole documents, so every depth cleans only what it is handed.
 */

/**
 * Clean a stored `areaGround` in place, key by key, and hand it back.
 * @param {object} ground
 */
export function cleanAreaGround(ground) {
  if (!ground || typeof ground !== "object") return ground;
  if ("difficult" in ground && typeof ground.difficult !== "boolean") ground.difficult = ground.difficult === true;
  if ("lasts" in ground) {
    if (!ground.lasts || typeof ground.lasts !== "object" || Array.isArray(ground.lasts)) ground.lasts = { rounds: null };
    else if ("rounds" in ground.lasts) {
      const n = ground.lasts.rounds;
      ground.lasts.rounds = typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
    }
  }
  if ("from" in ground && !["", "landing"].includes(ground.from)) ground.from = "";
  if ("ignores" in ground && typeof ground.ignores !== "boolean") ground.ignores = ground.ignores === true;
  if ("reason" in ground && typeof ground.reason !== "string") ground.reason = "";
  return ground;
}
