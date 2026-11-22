/**
 * **THE DEMON HUNTER'S HATRED** (02 §7; the Demon Hunter plan's R2, R3, R5, R6, R8, C5, C41, C42,
 * C45, C62 to C64). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * Hatred is the Demon Hunter's Momentum. The lead's words, verbatim from the plan:
 *
 * - R2, *Automatic Fel*: *gain 1 Fel Corruption for every 3 Momentum held, rounded up, and the pool
 *   empties; no Test*.
 * - R5, *Cap grows with Fel*, reworded by C5 (*"just say for every 5 Fel corruption or similar"*):
 *   the cap is 5, plus 2 for each 5 Fel Corruption you hold - 7 at Fel 5, 9 at 10, 11 at 15, 13 at 20.
 * - C63: *"have spells give 1+ tier of Hatred for cast"*, a failed Casting Test included (Q7).
 * - C62: *"Hatred can pay all maneuvers."* Hatred is a kept pool like Runic Power, so it pays every
 *   maneuver and every feature or talent that names it, and nothing else that says Momentum.
 * - C64: Fel Surge, *spend an amount of Hatred equal to your tier. For each point add 1 to the
 *   damage or add 1 to your Spell DC*.
 *
 * **THE CAP IS ENFORCED WHEN HATRED IS GAINED AND AT A REST, NEVER TRIMMED AFTERWARDS** (the
 * orchestrator's brief on Q13 and Q14, which the lead left as written: *"1 and 2 are fine how they
 * are for now"*). A Fel Lash hit lowers the Fel held and so the cap, and the Hatred already held
 * stays where it is: `hatredWrite` caps a rise at the higher of the cap and what is held, and lets a
 * fall through untouched, and `rules/progression.mjs#clampPool` leaves a Hatred pool unclamped
 * (`keepsAboveCap`). At a rest the count is the Hatred held, capped at the cap the rest finds
 * (`hatredAtRest`).
 *
 * **ONE READER OF THE FEL A DOOR SCALES WITH** (`felFor`): the cap, Fel Lash and Spectral Sight all
 * ask it, so I Have Prepared (*Your class features and talents treat your Fel Corruption as 20*) and
 * Embrace the Pain (*read your Fel Corruption as 5 higher than it is*) reach every one of them. A
 * census in `hatred.test.mjs` fails a module that reads `corruption.fel` itself.
 */

import { HATRED_GAIN_SOURCES } from "./named-gains.mjs";

/** The Momentum pool's key (`AZEROTH.momentumTypes`). */
export const HATRED = "hatred";

/** The class (`CLASS_ORDER`). */
export const DEMON_HUNTER = "demon-hunter";

/** The class as 02 §7 names it, the name a talent's `className` and a Restricted line carry. */
export const DEMON_HUNTER_NAME = "Demon Hunter";

/** 02 §7's cap: 5, plus 2 for each 5 Fel Corruption you hold. */
export const HATRED_CAP_BASE = 5;
export const HATRED_CAP_STEP = 2;
export const FEL_STEP = 5;

/** 10's tracks end at 20. */
export const FEL_TRACK_TOP = 20;

/** R2's rate: 1 Fel for every 3 Hatred held at a rest, rounded up. */
export const REST_PER = 3;

/** 02 §7's Warding Tattoos (level 14): *leave 3 Hatred out of the count*. */
export const WARDING_TATTOOS = "Warding Tattoos";
export const WARDING_TATTOOS_LEFT_OUT = 3;

/** 04's Sufferer talents a rest reads (C41, C42, C45). */
export const WARDING_INK = "Warding Ink";
export const BRIDLE_THE_DEMON = "Bridle the Demon";
export const MEASURED_BREATH = "Measured Breath";

/** Bridle the Demon's rate by rank: 1 per 3 (none), 1 per 4 (rank 1), 1 per 5 (rank 2). */
export const BRIDLE_PER = Object.freeze([3, 4, 5]);

/** 04's Betrayer talent: *Spectral Sight, Fel Lash and your Hatred cap read your Fel Corruption as 5 higher*. */
export const EMBRACE_THE_PAIN = "Embrace the Pain";
export const EMBRACE_STEP = 5;

/**
 * 02 §7's I Have Prepared: *Your class features and talents treat your Fel Corruption as 20.* The
 * actor flag a later door writes (the plan's door map: *an actor flag `felReadAs: 20`*); `felFor`
 * reads it and nothing else does.
 */
export const FEL_READ_AS_FLAG = "felReadAs";

/** The kinds of cost Hatred pays (C62): every maneuver, 06 §7's called shot among them. Read by `hatredPays` alone (S4). */
const HATRED_PAYS = Object.freeze(["maneuver"]);

/** Fel Surge's spell Actions (C64 (c): *a spell whose Action is a Half-Action or an Action*). */
export const FEL_SURGE_ACTIONS = Object.freeze(["half", "action"]);

/** The feature (02 §7, level 3). */
export const FEL_SURGE = "Fel Surge";

/** Re-exported from the ONE named-gain table (`named-gains.mjs`). */
export { HATRED_GAIN_SOURCES };

const int = v => Math.trunc(Number(v)) || 0;
const clampFel = v => Math.min(FEL_TRACK_TOP, Math.max(0, int(v)));

/* ------------------------------------------------------------------ */
/*  The cap                                                             */
/* ------------------------------------------------------------------ */

/**
 * The cap: 5, plus 2 for each 5 Fel Corruption held (13 at Fel 20). The Fel is `felFor`'s reading.
 *
 * @param {number} fel
 * @returns {number}
 */
export function hatredCap(fel = 0) {
  return HATRED_CAP_BASE + HATRED_CAP_STEP * Math.floor(clampFel(fel) / FEL_STEP);
}

/** Whether a pool keeps a value above its cap until it is spent (Hatred: the cap is never trimmed). */
export function keepsAboveCap(name) {
  return name === HATRED;
}

/**
 * **WHAT A WRITE LEAVES IN A HATRED POOL**: a fall lands as written, floored at 0, whatever the cap;
 * a rise is capped at the higher of the cap and what is held, so a gain never adds past the cap and
 * never trims what a fallen cap left above it.
 *
 * @param {{before?: number, value?: number, cap?: number}} o
 * @returns {number}
 */
export function hatredWrite({ before = 0, value = 0, cap = 0 } = {}) {
  const b = Math.max(0, int(before));
  const v = Math.max(0, int(value));
  if (v <= b) return v;
  return Math.min(v, Math.max(Math.max(0, int(cap)), b));
}

/* ------------------------------------------------------------------ */
/*  Gaining                                                             */
/* ------------------------------------------------------------------ */

/**
 * The Hatred a cast gives: 1 plus the spell's tier (C63), whether the Casting Test succeeds or fails
 * (Q7). A tier below 1 is read as 1.
 *
 * @param {number} tier
 * @returns {number}
 */
export function castGain(tier = 1) {
  return 1 + Math.max(1, int(tier));
}

/* ------------------------------------------------------------------ */
/*  The Fel a door scales with                                          */
/* ------------------------------------------------------------------ */

/** Embrace the Pain's ranks among the talents taken: a Demon Hunter talent by that name. */
function embraceRanksOf(items) {
  let n = 0;
  for (const i of items ?? []) {
    const sys = i?.system ?? i ?? {};
    if (i?.type !== undefined && i.type !== "talent") continue;
    if ((i?.name ?? sys.name) !== EMBRACE_THE_PAIN) continue;
    if (sys.className !== undefined && sys.className !== DEMON_HUNTER_NAME) continue;
    n += Math.max(0, int(sys.taken));
  }
  return n;
}

/**
 * **THE FEL A DEMON HUNTER'S FEATURES AND TALENTS READ** - the ONE reader the Hatred cap, Fel Lash
 * and Spectral Sight ask. An actor (or anything with `system`) is read for its Fel, the
 * `felReadAs` flag I Have Prepared writes, and Embrace the Pain's rank; a plain snapshot
 * `{fel, readAs, embrace}` is read as it stands.
 *
 * - **I Have Prepared**: the flag's number, read as the whole answer (20).
 * - **Embrace the Pain**: 5 more than the Fel held. **MY READING**: never above 20, the top of the
 *   track, so Fel 20 with the talent reads 20 and the cap stays 13.
 *
 * 10's thresholds never ask this: they read the Fel really held (02 §7's I Have Prepared, C18).
 *
 * @param {object|null} source  an actor, or `{fel, readAs?, embrace?}`
 * @returns {number}
 */
export function felFor(source) {
  if (!source || typeof source !== "object") return 0;
  const actorLike = "system" in source || "items" in source;
  const fel = actorLike ? source.system?.corruption?.fel : source.fel;
  const readAs = actorLike ? source.flags?.["azeroth-rpg"]?.[FEL_READ_AS_FLAG] : source.readAs;
  if (readAs !== undefined && readAs !== null && Number.isFinite(Number(readAs))) return clampFel(readAs);
  const embrace = actorLike ? embraceRanksOf(source.items) : Math.max(0, int(source.embrace));
  return clampFel(int(fel) + (embrace > 0 ? EMBRACE_STEP : 0));
}

/**
 * **THE FEL A FEATURE'S THRESHOLD READS** (the review's M1): Demon Unleashed's wings at Fel 10 and its Energy
 * refill of 5 at Fel 15. I Have Prepared reaches them (02: *with its wings and its Energy refill of 5*), so the
 * `felReadAs` flag is read as the whole answer; Embrace the Pain does NOT, because 04 names what it reaches -
 * *Spectral Sight, Fel Lash and your Hatred cap* - and Demon Unleashed is not among them. Otherwise the Fel
 * really held. `felFor` stays the reader for the cap, Fel Lash and Spectral Sight; a census in
 * `demon-hunter-fixes.test.mjs` fails any other door that reads `felFor` for a threshold.
 *
 * @param {object|null} source  an actor, or `{fel, readAs?}`
 * @returns {number}
 */
export function featureFel(source) {
  if (!source || typeof source !== "object") return 0;
  const actorLike = "system" in source || "items" in source;
  const readAs = actorLike ? source.flags?.["azeroth-rpg"]?.[FEL_READ_AS_FLAG] : source.readAs;
  if (readAs !== undefined && readAs !== null && Number.isFinite(Number(readAs))) return clampFel(readAs);
  return heldFel(source);
}

/**
 * **THE FEL REALLY HELD** (the features phase, D-1520): what 10's track stands at, with no I Have
 * Prepared and no Embrace the Pain read into it. Fel Lash asks it to know whether the track has ended
 * (*If your Fel Corruption has reached 20, you lose none*) and I Have Prepared to record the Fel held
 * when it was used. Beside `felFor`, so the census in `hatred.test.mjs` still finds every reader of
 * the track in this one module.
 *
 * @param {object|null} source  an actor, or `{fel}`
 * @returns {number}
 */
export function heldFel(source) {
  if (!source || typeof source !== "object") return 0;
  const actorLike = "system" in source || "items" in source;
  return clampFel(actorLike ? source.system?.corruption?.fel : source.fel);
}

/* ------------------------------------------------------------------ */
/*  The rest                                                            */
/* ------------------------------------------------------------------ */

/**
 * **THE FEL HATRED HELD AT A REST GIVES** (R2; C41, C42, C45, the Sufferer's stacking line): leave
 * `leftOut` Hatred out of the count (Warding Tattoos' 3 and Warding Ink's rank), take 1 Fel for every
 * `per` Hatred left, rounded up (3, or Bridle the Demon's 4 or 5), then take `less` off (Measured
 * Breath's rank), never below 0. Quiet the Whispers is a Test at the actor's door, after this.
 *
 * The plan's worked example: 12 Hatred, Warding Tattoos, Warding Ink 2, Bridle 2, Measured Breath 2 -
 * leave out 5, leaving 7; 1 per 5, rounded up, is 2; minus 2 is 0.
 *
 * @param {number} held
 * @param {{leftOut?: number, per?: number, less?: number}} [o]
 * @returns {number}
 */
export function restFel(held = 0, { leftOut = 0, per = REST_PER, less = 0 } = {}) {
  const left = Math.max(0, Math.max(0, int(held)) - Math.max(0, int(leftOut)));
  if (left === 0) return 0;
  const rate = Math.max(1, int(per) || REST_PER);
  return Math.max(0, Math.ceil(left / rate) - Math.max(0, int(less)));
}

/**
 * The rest's three numbers off what the character holds: Warding Tattoos (the feature), and the
 * ranks of Warding Ink, Bridle the Demon and Measured Breath.
 *
 * @param {{tattoos?: boolean, ink?: number, bridle?: number, breath?: number}} o
 * @returns {{leftOut: number, per: number, less: number}}
 */
export function restModifiers({ tattoos = false, ink = 0, bridle = 0, breath = 0 } = {}) {
  return {
    leftOut: (tattoos === true ? WARDING_TATTOOS_LEFT_OUT : 0) + Math.max(0, int(ink)),
    per: BRIDLE_PER[Math.min(BRIDLE_PER.length - 1, Math.max(0, int(bridle)))],
    less: Math.max(0, int(breath))
  };
}

/**
 * The same three numbers read off an actor-like source: its features by name and its Demon Hunter
 * talents by name and rank.
 *
 * @param {{items?: Iterable<object>}|null} actor
 * @returns {{leftOut: number, per: number, less: number}}
 */
export function restModifiersOf(actor) {
  const items = [...(actor?.items ?? [])];
  const ranks = name => items
    .filter(i => i?.type === "talent" && i.name === name && (i.system?.className ?? DEMON_HUNTER_NAME) === DEMON_HUNTER_NAME)
    .reduce((n, i) => n + Math.max(0, int(i.system?.taken)), 0);
  return restModifiers({
    tattoos: items.some(i => i?.type === "feature" && i.name === WARDING_TATTOOS),
    ink: ranks(WARDING_INK),
    bridle: ranks(BRIDLE_THE_DEMON),
    breath: ranks(MEASURED_BREATH)
  });
}

/**
 * **WHAT A REST DOES WITH THE HATRED HELD**, judged before anything is written: the Hatred counted
 * (held, capped at the cap the rest finds), the Fel it gives, and whether there is anything to do.
 * The pool empties at the rest whatever the Fel (`kept-pools.mjs#EMPTIED_BY.hatred`).
 *
 * @param {{held?: number, cap?: number|null, modifiers?: {leftOut?: number, per?: number, less?: number}}} o
 * @returns {{held: number, counted: number, fel: number}|null}  null where nothing is held
 */
export function hatredAtRest({ held = 0, cap = null, modifiers = {} } = {}) {
  const h = Math.max(0, int(held));
  if (h === 0) return null;
  const counted = cap === null || cap === undefined || !Number.isFinite(Number(cap)) ? h : Math.min(h, Math.max(0, int(cap)));
  return { held: h, counted, fel: restFel(counted, modifiers) };
}

/* ------------------------------------------------------------------ */
/*  Paying                                                              */
/* ------------------------------------------------------------------ */

/**
 * **WHAT HATRED PAYS BY KIND** (C62: *"Hatred can pay all maneuvers."*): every maneuver - 05's Press,
 * Sunder and Overbear, 06 §7's Called Shot, Disarm, Drive Back and Riposte. A Parry, 02 §5's *4
 * Momentum* (`pools.mjs#ANY_MOMENTUM`) and *any pool* (`ANY_POOL`) are costs that name no pool and are
 * not maneuvers, so Hatred pays none of them. A cost that names Hatred finds it by name.
 *
 * @param {string} [kind]  `maneuver`, or anything else
 * @returns {boolean}
 */
export function hatredPays(kind = "any") {
  return HATRED_PAYS.includes(kind);
}

/**
 * **FEL SURGE** (C64; 02 §7 level 3): before a Half-Action or Action spell is cast, spend Hatred up
 * to your tier; each point is +1 to the spell's damage or +1 to its Spell DC. Judged whole before
 * the budget (D-768), from the Hatred held before the cast - the cast's own `castGain` comes after,
 * so a cast never pays for itself. MY READINGS (C64 (a) to (f)): the tier is a maximum; each point is
 * chosen separately; a spell with no damage takes no damage points and one with no Test no DC
 * points; a Reaction, a Full Action or a longer cast takes none.
 *
 * @param {{held?: number, tier?: number, action?: string|null, damage?: number, dc?: number, hasDamage?: boolean, hasTest?: boolean}} o
 * @returns {{ok: boolean, reason: null|"action"|"none"|"overTier"|"short"|"noDamage"|"noTest", spend: number, damage: number, dc: number, max: number}}
 */
export function felSurgePlan({ held = 0, tier = 1, action = null, damage = 0, dc = 0, hasDamage = true, hasTest = true } = {}) {
  const d = Math.max(0, int(damage));
  const c = Math.max(0, int(dc));
  const spend = d + c;
  const h = Math.max(0, int(held));
  const t = Math.max(1, int(tier));
  const max = Math.min(t, h);
  const out = reason => ({ ok: reason === null, reason, spend: reason === null ? spend : 0, damage: reason === null ? d : 0, dc: reason === null ? c : 0, max });
  if (spend === 0) return out(null);
  if (!FEL_SURGE_ACTIONS.includes(action)) return out("action");
  if (h === 0) return out("none");
  if (spend > t) return out("overTier");
  if (spend > h) return out("short");
  if (d > 0 && hasDamage !== true) return out("noDamage");
  if (c > 0 && hasTest !== true) return out("noTest");
  return out(null);
}
