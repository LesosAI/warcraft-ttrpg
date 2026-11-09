/**
 * **THE CHROMATIC CHAMPION'S CLASS FEATURES, AS LAW** (02 §7's Chromatic Champion,
 * *Features by level*; stage 2B of the Chromatic Champion plan). Pure: no Foundry
 * imports and no import of the talent tables (CLAUDE.md §3) - `class-features.mjs`
 * builds its rows from the constants here, so this module may not import it back.
 *
 * Every number is 02's, and `chromatic-features.test.mjs` reads each one off the
 * pack's own feature text (which the parser writes from the chapter):
 *
 * - **Scales** (level 1): *While you wear Mail or Plate, its Encumbering trait costs
 *   you no Speed and imposes no Bane on your Stealth Tests* - `SCALES`, read by
 *   `CharacterData` through `scalesWaive`.
 * - **Breath** (level 3): *As a Half-Action, spend 4 Energy. Every creature in a cone
 *   15 feet long takes damage equal to 2 plus your Constitution modifier, or half that, rounded down,
 *   on a Reflex Resilience Test against your Spell DC. Its school is that of the
 *   branch you have spent the most points in ... on a tie, or with none spent, choose
 *   among the tied branches as you breathe* - `BREATH`, `breathSchools`.
 * - **Hardened Scales** (5): Ward 1 against Fire, Frost and Nature for 10 minutes,
 *   *added to any Ward you already hold* - `HARDENED_SCALES`, `hardenedScalesChanges`.
 * - **Wing Buffet** (5), **Draconic Leap** (9), **Dread Presence** (11): the reach,
 *   the push, the leap and the span, as constants the rows and the doors share.
 * - **Great Breath** (14): *a cone 30 feet long or a line 60 feet long, chosen as you
 *   breathe* - `GREAT_BREATH`, `breathAreas`.
 * - **Scales of the Flight** (17): *Ward 1 against your Breath's school, chosen after
 *   each Long Rest where a tie leaves it open* - `flightSchool`.
 * - **Chromatic Breath** (20): *twice your Breath's damage* in a 60 ft cone, in any of
 *   07's seven schools - `CHROMATIC_BREATH`.
 */

/** The Champion's class, as a talent's and a feature's `className` names it. */
export const CHAMPION_CLASS = "Chromatic Champion";

/**
 * **WHICH SCHOOL EACH BRANCH BREATHES** (02's Breath: *Fire for Life-Binder, Frost
 * for Spell-Weaver, Arcane for Timewalker, Nature for Earth-Warder*), in 02's own
 * branch order, which is the order a tie is offered in.
 */
export const BRANCH_SCHOOLS = Object.freeze({
  "Life-Binder": "fire",
  "Spell-Weaver": "frost",
  "Timewalker": "arcane",
  "Earth-Warder": "nature"
});

/** 02's Scales: the categories whose Encumbering trait it waives. */
export const SCALES = Object.freeze({ feature: "Scales", categories: Object.freeze(["mail", "plate"]) });

/**
 * 02's Breath. `damage` is the expression `class-features.mjs#evaluateAmount` reads
 * (*2 plus your Constitution modifier*; the lead, 2026-11-09), `area` the cone in 07 §9's phrasing (`rules/areas.mjs#areaFor`).
 */
export const BREATH = Object.freeze({
  feature: "Breath", energy: 4, damage: "con+2", area: "A 15 ft cone", resist: "reflex"
});

/**
 * **HOW LONG A BREATH'S CONE STANDS ON THE BOARD** (the lead, 2026-11-08: *"Remove after
 * the cue"*): the milliseconds its Region is left for the `region` cue to play over it
 * (`rules/animation-table.mjs#BREATH_LOOKS`, the free libraries' breath clips run about three
 * seconds), then the active GM deletes it through the one area queue
 * (`canvas/sustained-areas.mjs#removeAfterCue`). A starting value, as every animation
 * number is (D-723); it is a wait, not a rule.
 */
export const BREATH_CUE_MS = 4000;

/** 02's Great Breath: the two areas Breath may take, the cone first. */
export const GREAT_BREATH = Object.freeze({
  feature: "Great Breath", areas: Object.freeze(["A 30 ft cone", "A 60 ft line"])
});

/**
 * 02's Chromatic Breath: once per Long Rest, a Half-Action and no Energy, a 60 ft cone,
 * *twice your Breath's damage* - `2*(con+2)`, written out so the one grammar reads it.
 */
export const CHROMATIC_BREATH = Object.freeze({
  feature: "Chromatic Breath", damage: "2*con+4", area: "A 60 ft cone", resist: "reflex"
});

/** 02's Hardened Scales: the schools, the Ward each gains, and the ten minutes. */
export const HARDENED_SCALES = Object.freeze({
  feature: "Hardened Scales", schools: Object.freeze(["fire", "frost", "nature"]), ward: 1, minutes: 10
});

/** The effect flag Hardened Scales' own effect carries, so a second use replaces it. */
export const HARDENED_SCALES_FLAG = "hardenedScales";

/** 02's Wing Buffet: creatures within 5 feet, pushed 10, Prone on a failed Body Test. */
export const WING_BUFFET = Object.freeze({
  feature: "Wing Buffet", energy: 3, within: 5, push: 10, resist: "body", condition: "prone"
});

/**
 * 02's Draconic Leap: 3 Energy and a Half-Action - or the Reaction on ANOTHER
 * creature's turn - 20 feet, ending Entangled, and a Boon on the next attack before the
 * end of your next turn.
 */
export const DRACONIC_LEAP = Object.freeze({
  feature: "Draconic Leap", energy: 3, feet: 20, frees: Object.freeze(["entangled"]), boons: 1
});

/** 02's Dread Presence: creatures within 10 feet, a Spirit Test, Frightened. */
export const DREAD_PRESENCE = Object.freeze({
  feature: "Dread Presence", within: 10, resist: "spirit", condition: "frightened"
});

/** 02's Scales of the Flight: Ward 1, and the actor flag a tie's choice is kept in. */
export const SCALES_OF_THE_FLIGHT = Object.freeze({ feature: "Scales of the Flight", ward: 1 });
export const FLIGHT_SCHOOL_FLAG = "flightSchool";

/**
 * **THE POINTS SPENT IN EACH OF THE CHAMPION'S BRANCHES** (04 §1): the ranks taken
 * in that branch's talents of this class, racial talents never counted. Every branch
 * is present, at 0 where nothing is spent.
 *
 * @param {Array<{className?: string, branch?: string, taken?: number, race?: string|null}>} talents
 * @returns {Record<string, number>}
 */
export function branchPointsFor(talents = []) {
  const out = Object.fromEntries(Object.keys(BRANCH_SCHOOLS).map(b => [b, 0]));
  for (const t of talents ?? []) {
    if (!t || t.race || t.className !== CHAMPION_CLASS || !(t.branch in out)) continue;
    out[t.branch] += Math.max(0, Math.trunc(Number(t.taken)) || 0);
  }
  return out;
}

/**
 * **WHICH SCHOOLS A BREATH MAY TAKE NOW**: the drake form's own where a capstone
 * names one for the form held (04: *In it your Breath deals Fire damage*), else the
 * school of the branch with the most points; on a tie, or with none spent, every tied
 * branch's, in 02's order - the door asks which where there are several.
 *
 * @param {{points?: Record<string, number>, drakeSchool?: string|null}} o
 * @returns {string[]}
 */
export function breathSchools({ points = {}, drakeSchool = null } = {}) {
  if (typeof drakeSchool === "string" && drakeSchool) return [drakeSchool];
  const branches = Object.keys(BRANCH_SCHOOLS);
  const spent = branches.map(b => Math.max(0, Math.trunc(Number(points?.[b])) || 0));
  const most = Math.max(...spent);
  return branches.filter((b, i) => spent[i] === most).map(b => BRANCH_SCHOOLS[b]);
}

/**
 * **THE AREAS A BREATH MAY FILL**: the stamped area alone, or Great Breath's two
 * (*a cone 30 feet long or a line 60 feet long, chosen as you breathe*) where the
 * feature's patch has laid its cone - so the chip on Breath and the choice are one
 * fact.
 *
 * @param {string} stamped  the Breath feature's stamped `area`
 * @returns {string[]}
 */
export function breathAreas(stamped = "") {
  const area = String(stamped ?? "");
  if (area === GREAT_BREATH.areas[0]) return [...GREAT_BREATH.areas];
  return area ? [area] : [BREATH.area];
}

/**
 * **WHETHER SCALES WAIVES A SUIT'S ENCUMBERING**: the feature held, and the suit worn
 * is Mail or Plate. A melded suit (a drake form) is worn by nobody, so the caller
 * hands the melded category.
 *
 * @param {{held?: boolean, category?: string|null}} o
 * @returns {boolean}
 */
export function scalesWaive({ held = false, category = null } = {}) {
  return held === true && SCALES.categories.includes(String(category ?? ""));
}

/**
 * **THE BANE ON STEALTH A SUIT'S ENCUMBERING PUTS** (08 §5's Encumbering: *Speed drops
 * 5 feet, and Stealth Tests take a Bane*): `["stealth"]` for a Mail or Plate suit,
 * none where Muffled buys it back (08 §6: *Lesser. Encumbering imposes no Bane on
 * Stealth Tests*, and Greater carries Lesser) or Scales waives it.
 *
 * @param {{encumbering?: boolean, grants?: string[], waived?: boolean}} o
 * @returns {string[]}
 */
export function encumberingBanes({ encumbering = false, grants = [], waived = false } = {}) {
  if (encumbering !== true || waived === true) return [];
  if ((grants ?? []).some(g => /\bMuffled\b/i.test(String(g)))) return [];
  return ["stealth"];
}

/**
 * **HARDENED SCALES' CHANGES**: an `add` of 1 to each school's Ward, in the `final`
 * phase because Ward is derived (D-668), so it stacks on whatever the character
 * already holds and the cap (`rules/ward.mjs#wardCap`) runs after it.
 *
 * @returns {Array<{key: string, type: string, value: string, phase: string}>}
 */
export function hardenedScalesChanges() {
  return HARDENED_SCALES.schools.map(s => ({ key: `system.ward.${s}`, type: "add", value: String(HARDENED_SCALES.ward), phase: "final" }));
}

/**
 * **THE SCHOOL SCALES OF THE FLIGHT WARDS**: the Breath's school read off the
 * branches alone - never a drake form's, since the choice is made at a Long Rest (MY
 * READING, for the lead) - where one branch leads; where a tie leaves it open, the
 * school chosen since the last Long Rest if it is still among the tied; else none,
 * and the feature's Use asks.
 *
 * @param {{points?: Record<string, number>, chosen?: string|null}} o
 * @returns {{school: string|null, open: string[]}}
 */
export function flightSchool({ points = {}, chosen = null } = {}) {
  const tied = breathSchools({ points });
  if (tied.length === 1) return { school: tied[0], open: [] };
  return { school: tied.includes(chosen) ? chosen : null, open: tied };
}

/**
 * **WHY A USE AIMED AT CREATURES WITHIN N FEET IS REFUSED** (02's Wing Buffet *within
 * 5 feet of you*, Dread Presence *within 10 feet*), judged before anything is paid:
 * a creature measured farther than the reach. One that could not be measured (no
 * token on the board) is the table's and is not refused.
 *
 * @param {Array<{name: string, feet: number|null}>} measured
 * @param {number} within
 * @returns {{name: string, feet: number}|null}  the first creature out of reach
 */
export function outOfReach(measured = [], within = 0) {
  const reach = Math.max(0, Number(within) || 0);
  for (const m of measured ?? []) {
    if (typeof m?.feet === "number" && Number.isFinite(m.feet) && m.feet > reach) return { name: String(m.name ?? ""), feet: m.feet };
  }
  return null;
}

/**
 * **THE CHROMATIC OUTCAST'S FLIGHTBLOOD** (02 §5: *You have Ward equal to your tier
 * against Fire, Frost, Arcane and Nature*). Found unbuilt beside stage 2B: the trait's
 * row named it and nothing derived it.
 */
export const FLIGHTBLOOD = Object.freeze({
  trait: "Flightblood", race: "chromatic-outcast", schools: Object.freeze(["fire", "frost", "arcane", "nature"])
});

/**
 * Flightblood's Ward by school at a tier: the tier against each of its four schools.
 *
 * @param {number} tier
 * @returns {Record<string, number>}
 */
export function flightbloodWard(tier = 1) {
  const n = Math.max(0, Math.trunc(Number(tier)) || 0);
  return Object.fromEntries(FLIGHTBLOOD.schools.map(s => [s, n]));
}
