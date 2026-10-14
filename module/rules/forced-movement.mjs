/**
 * **FORCED MOVEMENT: A PUSH OR A PULL BY A NUMBER OF FEET** (D-778; the lead,
 * 2026-10-03, on O-158: *"Yes."* to *should a door push or pull a creature, and
 * which way where 04 names none - away from the area's centre?*). Pure: no
 * Foundry imports (CLAUDE.md §3).
 *
 * Nothing in the system moved a creature it did not walk, so 04's Typhoon,
 * Thunderstorm and Blast Wave and 07's Tempest and Void Rift were the table's.
 * `effects/forced-movement.mjs` is the one door; this is its law:
 *
 * - **Which way**: `away` from a point (a push: the caster, or the area's centre
 *   where 04 names nothing - the ruling) or `toward` it (a pull), along the line
 *   between the point and the creature's centre. A creature standing on the
 *   point has no line, and is not moved (said in words).
 * - **How far, on a square grid**: whole squares at the scene's feet a square -
 *   the squares a walk would ENTER (D-764's measure), so a 10-foot push is two
 *   squares whichever way the line runs: the line's larger axis takes the whole
 *   count and the other its share of it, rounded. A pull stops at the point and
 *   never passes it.
 * - **Gridless or hex**: the feet along the line, in pixels; the door snaps a hex
 *   position to the grid as core does.
 * - **Walls**: `forcedPlan` answers every candidate from the whole distance down
 *   to one square, and the door takes the first core's own collision test lets
 *   through (`Token#checkCollision`, the walls a walk meets; `forcedStep`) - so a
 *   push stops at a wall rather than passing through it (MY READING, for the lead: a
 *   displacement ignores walls in core, and a creature is not pushed through one).
 *   Where that test cannot be asked - a token on a scene this client is not
 *   drawing - nothing is moved, said in words (`unchecked`; the review of D-778).
 *
 * The move is a DISPLACEMENT (`action: "displace"`, as `documents/shapes.mjs`
 * resizes a token): core meters it at nothing, `rules/movement.mjs#creatureMoved`
 * reads it as no creature moving - so it offers no Opportunity Attack and enters
 * no area - and the turn's budget never sees it.
 *
 * ## What 07's words state, read by `readForced`
 *
 * - *On a failure it takes 3 Fire damage and is pushed 5 feet away from you ... At
 *   SL 2 or better the push is 10 feet* (Blast Wave; Gust of Wind's 15) - `on:
 *   "fail"`, from the CASTER, on the card's own Resist;
 * - *On a failure it takes 4 Arcane damage and is pulled 10 feet toward the
 *   center* (Ley Rift) - `on: "fail"`, toward the placed AREA's centre;
 * - *one that fails a Reflex Resilience Test against your Spell DC when it first
 *   enters is pushed 10 feet toward the edge* (Tempest) - `on: "enter"`, a Test on
 *   entering whose failure is the push, away from the area's centre;
 * - *takes 4 Shadow damage at the start of each of its turns and is pulled 10 feet
 *   toward the center* (Void Rift) - `on: "turn"`, toward the area's centre.
 *
 * Nether Rift's *At the start of each of your turns every creature within 30 feet
 * of the center makes a Body Resilience Test ... or is pulled 15 feet toward it* is
 * a Test at the CASTER's turn, which no area door makes (`rules/ticks.mjs`
 * `casterTurn`), and stays the table's (`FORCED_UNREAD`).
 */

/** Which way a forced move goes. */
export const FORCED_TOWARD = Object.freeze(["away", "toward"]);

/** What a forced move is measured from: the caster's token, or the area's centre. */
export const FORCED_FROM = Object.freeze(["caster", "area"]);

/** When a spell's forced move lands. */
export const FORCED_ON = Object.freeze(["fail", "enter", "turn"]);

/** Why a forced move moved nothing, each said in words (`AZEROTH.Forced.Refuse.*`). */
export const FORCED_REFUSALS = Object.freeze({
  atPoint: "AZEROTH.Forced.Refuse.AtPoint",
  immovable: "AZEROTH.Forced.Refuse.Immovable",
  walled: "AZEROTH.Forced.Refuse.Walled",
  unchecked: "AZEROTH.Forced.Refuse.Unchecked",
  gone: "AZEROTH.Forced.Refuse.Gone",
  unmeasured: "AZEROTH.Forced.Refuse.Unmeasured",
  noGM: "AZEROTH.Forced.Refuse.NoGM"
});

/**
 * **THE CANDIDATE MOVES, LONGEST FIRST**, in scene pixels.
 *
 * @param {object} o
 * @param {{x: number, y: number}} o.centre  the creature's centre
 * @param {{x: number, y: number}} o.from    the point pushed from or pulled to
 * @param {number} o.feet
 * @param {"away"|"toward"} [o.toward]
 * @param {{size?: number, distance?: number, type?: "square"|"hex"|"gridless"}} [o.grid]
 *   the scene's pixels a square, feet a square, and kind
 * @returns {{ok: boolean, reason: string|null, steps: Array<{dx: number, dy: number, feet: number}>}}
 */
export function forcedPlan({ centre, from, feet = 0, toward = "away", grid = {} } = {}) {
  const size = Number(grid?.size) > 0 ? Number(grid.size) : 100;
  const distance = Number(grid?.distance) > 0 ? Number(grid.distance) : 5;
  const type = grid?.type === "gridless" || grid?.type === "hex" ? grid.type : "square";
  const want = Math.max(0, Math.trunc(Number(feet)) || 0);
  const nothing = reason => ({ ok: false, reason, steps: [] });
  if (!centre || !from || !Number.isFinite(Number(centre.x)) || !Number.isFinite(Number(from.x))) return nothing("unmeasured");
  let vx = Number(centre.x) - Number(from.x);
  let vy = Number(centre.y) - Number(from.y);
  if (toward === "toward") { vx = -vx; vy = -vy; }
  const length = Math.hypot(vx, vy);
  if (!(want > 0)) return { ok: true, reason: null, steps: [] };
  // Standing on the point: no line to move along (MY READING, for the lead).
  if (length < size / 4) return nothing("atPoint");
  const steps = [];
  const seen = new Set();
  const push = (x, y, f) => {
    // `|| 0` turns a pull's -0 into 0, so no axis carries a signed zero.
    const dx = x || 0;
    const dy = y || 0;
    const key = `${dx},${dy}`;
    if ((dx === 0 && dy === 0) || seen.has(key)) return;
    seen.add(key);
    steps.push({ dx, dy, feet: f });
  };
  if (type === "square") {
    // The squares the line enters: the larger axis takes the whole count.
    const across = Math.max(Math.abs(vx), Math.abs(vy));
    const ux = vx / across;
    const uy = vy / across;
    let squares = Math.floor(want / distance);
    // A pull stops on the point: never more squares than lie between them.
    if (toward === "toward") squares = Math.min(squares, Math.floor(across / size + 1e-6));
    for (let k = squares; k >= 1; k--) push(Math.round(ux * k) * size, Math.round(uy * k) * size, k * distance);
  } else {
    const ux = vx / length;
    const uy = vy / length;
    let reach = want;
    if (toward === "toward") reach = Math.min(reach, (length / size) * distance);
    for (let f = reach; f > 0; f -= distance) {
      const px = (f / distance) * size;
      push(Math.round(ux * px), Math.round(uy * px), Math.round(f));
    }
  }
  return steps.length ? { ok: true, reason: null, steps } : nothing("atPoint");
}

/**
 * **THE CANDIDATE THE DOOR TAKES, OR WHY NONE** (the review of D-778): core's
 * displacement passes through walls, so a move is made only where the walls can be
 * ASKED - core's own collision test for a walk, which only a token drawn on the
 * client can answer - and then only along the longest candidate it lets through. A
 * board whose walls cannot be asked moves nobody (`unchecked`, said in words), and a
 * test that cannot answer one candidate blocks it: never a token moved unasked
 * through a wall. Defaults CLOSED: unaskable, every candidate blocked.
 *
 * @param {{ok: boolean, reason: string|null, steps: Array<{dx: number, dy: number, feet: number}>}} plan  `forcedPlan`'s
 * @param {{askable?: boolean, blocked?: (step: object) => boolean}} [o]
 * @returns {{step: {dx: number, dy: number, feet: number}|null, reason: string|null}}
 */
export function forcedStep(plan, { askable = false, blocked = () => true } = {}) {
  if (!plan?.ok) return { step: null, reason: plan?.reason ?? "unmeasured" };
  if (!plan.steps?.length) return { step: null, reason: null };
  if (askable !== true) return { step: null, reason: "unchecked" };
  const step = plan.steps.find(s => {
    try {
      return blocked(s) !== true;
    } catch {
      return false;
    }
  }) ?? null;
  return step ? { step, reason: null } : { step: null, reason: "walled" };
}

/**
 * **THE FORCED MOVE 07's WORDS STATE**, or null: `{on, feet, toward, from, sl,
 * resilience}`. `sl` is `{at, feet}` where a Success Level lengthens it (Blast
 * Wave's *At SL 2 or better the push is 10 feet*).
 *
 * @param {string} effectText  the entry's effect, HTML or flat
 * @param {{test?: {resilience?: string|null}}} [fields]  07 §9's own **Test**
 * @returns {{on: string, feet: number, toward: string, from: string, sl: {at: number, feet: number}|null, resilience: string|null}|null}
 */
export function readForced(effectText, fields = {}) {
  const text = flat(effectText);
  const resilience = fields?.test?.resilience ?? null;
  // Blast Wave, Gust of Wind: *On a failure it takes N X damage and is pushed N
  // feet away from you*.
  let m = /\bOn a failure it takes \d+ \w+ damage and is pushed (\d+) feet away from you\b/.exec(text);
  if (m) {
    const sl = /\bAt SL (\d) or better the push is (\d+) feet\b/.exec(text);
    return { on: "fail", feet: Number(m[1]), toward: "away", from: "caster", sl: sl ? { at: Number(sl[1]), feet: Number(sl[2]) } : null, resilience };
  }
  // Ley Rift: *On a failure it takes N X damage and is pulled N feet toward the center*.
  m = /\bOn a failure it takes \d+ \w+ damage and is pulled (\d+) feet toward the cent(?:er|re)\b/.exec(text);
  if (m) return { on: "fail", feet: Number(m[1]), toward: "toward", from: "area", sl: null, resilience };
  // Tempest: *one that fails a Reflex Resilience Test against your Spell DC when it
  // first enters is pushed N feet toward the edge*.
  m = /\bfails an? (Body|Reflex|Spirit) Resilience Test against your Spell DC when it first enters is pushed (\d+) feet toward the edge\b/.exec(text);
  if (m) return { on: "enter", feet: Number(m[2]), toward: "away", from: "area", sl: null, resilience: m[1].toLowerCase() };
  // Void Rift: *at the start of each of its turns and is pulled N feet toward the center*.
  m = /\bat the start of each of its turns and is pulled (\d+) feet toward the cent(?:er|re)\b/.exec(text);
  if (m) return { on: "turn", feet: Number(m[1]), toward: "toward", from: "area", sl: null, resilience: null };
  return null;
}

/**
 * **EVERY FORCED-MOVEMENT SENTENCE IN 07 THE READER DOES NOT TAKE**, by name, with
 * its reason - the census in `forced-movement.test.mjs` fails a new one.
 */
export const FORCED_UNREAD = Object.freeze({
  "Nether Rift": "a Test at the start of the CASTER's turn, which no area door makes (`rules/ticks.mjs` casterTurn): the pull is the table's"
});

/**
 * The feet a `fail` move covers at this cast: 07's own number, the SL's where the
 * cast reached it, and what the caster's talents add (04's Blast Wave: *Each rank
 * adds 5 feet to the push*).
 *
 * @param {{feet: number, sl: {at: number, feet: number}|null}|null} forced
 * @param {{sl?: number, add?: number}} [o]
 * @returns {number}
 */
export function forcedFeet(forced, { sl = 0, add = 0 } = {}) {
  if (!forced) return 0;
  const base = forced.sl && (Math.trunc(Number(sl)) || 0) >= forced.sl.at ? forced.sl.feet : forced.feet;
  return Math.max(0, (Math.trunc(Number(base)) || 0) + (Math.trunc(Number(add)) || 0));
}

/**
 * **A FORCED MOVE AS A CARD OR A REGION MAY CARRY IT**: the known keys, cleaned -
 * nothing a caller slipped in beside them. Null where it moves nothing.
 *
 * @param {unknown} raw
 * @returns {{on: string, feet: number, toward: string, from: string, resilience: string|null}|null}
 */
export function cleanForced(raw) {
  if (!raw || typeof raw !== "object") return null;
  const feet = Math.max(0, Math.trunc(Number(raw.feet)) || 0);
  if (!(feet > 0)) return null;
  return {
    on: FORCED_ON.includes(raw.on) ? raw.on : "fail",
    feet,
    toward: FORCED_TOWARD.includes(raw.toward) ? raw.toward : "away",
    from: FORCED_FROM.includes(raw.from) ? raw.from : "caster",
    resilience: ["body", "reflex", "spirit"].includes(raw.resilience) ? raw.resilience : null
  };
}

/** HTML to flat text: tags out, `**` dropped, one space. */
function flat(text) {
  return String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\*\*/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
