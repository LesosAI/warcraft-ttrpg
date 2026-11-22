/**
 * **ESSENCE: THE NECROMANCER'S MOMENTUM** (02 §7's Necromancer, the Necromancer plan's
 * *Mana, and Essence*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The lead, verbatim:
 * - *"I like mana as their main resource. Essence from "living" enemies dying within
 *   120ft radius should be used optionally to empower class features and spells"*;
 * - who counts as an enemy outside a fight: *"hostile or neutral"*;
 * - the cap: *"base plus Constitution modifier"*, the base **3, never below 3**;
 * - *"keep essence until spent"*;
 * - *"Holding essence through a long rest risks corruption exposure"*, at *"DC 12 +
 *   essence held"*.
 *
 * What this module holds, and who reads it:
 * - the cap, read by `momentum.mjs#capFor` (the ONE cap reader) as `essenceCap`;
 * - who gains it and from what death (`isLiving`, `essenceEnemy`, `essenceFromDeath`),
 *   read by the death watch (the plan's Phase 4 door 1);
 * - the doors a rise may come through (`ESSENCE_GAIN_SOURCES`, `essenceGainRefusal`),
 *   read by `AzerothActor#writePoolsNow`;
 * - that it pays no cost named by kind (`paysByKind`): a maneuver, a Parry, the called shot and
 *   `pools.mjs`'s *any Momentum* and *any pool*, read by `reactions.mjs#parryPoolFor`,
 *   `class-answers.mjs#momentumPayer`, `AzerothActor#momentumPayer`, the roll dialog, the
 *   maneuver rows and `useManeuver`, and `pools.mjs`;
 * - the four ways to empower a spell (`EMPOWER_OPTIONS`, `empowerPlan`), read by the cast
 *   dialog's lines (Phase 4 door 2);
 * - the Long Rest exposure (`restExposure`), read by the Long Rest door (Phase 4 door 12).
 *
 * Kept until spent is `kept-pools.mjs#EMPTIED_BY.essence`, an empty list, and 05 §11's
 * universal gains skip it through `runes.mjs#gainsByUniversalTriggers`.
 *
 * **The lead's Phase 0 rulings (2026-11-18, *"Yes, No, Yes, Yes, Yes, Yes"*) each sit in ONE
 * constant here**: `NOT_LIVING_TYPES`, `ESSENCE_FROM_ANY_KILLER`, `ESSENCE_PER_DEATH` and
 * `EMPOWER_OPTIONS`, so a later ruling changes one place.
 */

// The Demon Hunter's Hatred pays every maneuver (C62).
import { HATRED, hatredPays } from "./hatred.mjs";
import { DISPOSITIONS } from "./distance.mjs";
import { kindsOf } from "./creature-kinds.mjs";
import { castTestOf } from "./resisted.mjs";
import { readForced } from "./forced-movement.mjs";
// The ONE named-gain refusal (the San'layn and Sovereign plan's C3).
import { namedGainRefusal } from "./named-gains.mjs";

/** The pool's key in `AZEROTH.momentumTypes`. */
export const ESSENCE = "essence";

/** *Within 120 feet of you* (the lead). */
export const ESSENCE_RANGE = 120;

/** The cap's base and floor: *3, never below 3* (the lead). */
export const ESSENCE_CAP_BASE = 3;

/** The Long Rest exposure's base DC: *"DC 12 + essence held"* (the lead). */
export const ESSENCE_REST_DC_BASE = 12;

/**
 * **Living** (the lead, 2026-11-18, *"Yes"* to the plan's reading): any creature whose type is not one of these.
 * A demon, an elemental, a beast, a dragonkin and an ooze count; a construct was never
 * alive. Undead is read through `creature-kinds.mjs#kindsOf`, so a Forsaken, a Death
 * Knight, a lich and The Risen are not living either.
 */
export const NOT_LIVING_TYPES = Object.freeze(["undead", "construct"]);

/**
 * **Who killed it does not matter** (the lead, 2026-11-18, *"No"* to its mattering) - the
 * Necromancer, its horde, an ally or a hazard.
 */
export const ESSENCE_FROM_ANY_KILLER = true;

/** One death gives 1 Essence; a swarm is one creature and gives 1 when it dies (the lead, 2026-11-18). */
export const ESSENCE_PER_DEATH = 1;

const int = v => Math.trunc(Number(v)) || 0;

/* ------------------------------------------------------------------ */
/*  The cap                                                             */
/* ------------------------------------------------------------------ */

/**
 * 3 plus the Constitution modifier, never below 3: Constitution +2 gives 5.
 *
 * @param {number} conMod
 * @returns {number}
 */
export function essenceCap(conMod = 0) {
  return Math.max(ESSENCE_CAP_BASE, ESSENCE_CAP_BASE + int(conMod));
}

/* ------------------------------------------------------------------ */
/*  Who gives Essence                                                   */
/* ------------------------------------------------------------------ */

/**
 * Whether a creature is living: not undead (`kindsOf`) and of no type in
 * `NOT_LIVING_TYPES`.
 *
 * @param {ReturnType<import("./creature-kinds.mjs").creatureSnapshot>} snapshot
 * @returns {boolean}
 */
export function isLiving(snapshot = {}) {
  if (!snapshot || typeof snapshot !== "object") return false;
  const type = String(snapshot.creatureType ?? "").trim().toLowerCase().split(/[\s(]/)[0];
  if (NOT_LIVING_TYPES.includes(type)) return false;
  return !kindsOf(snapshot).has("undead");
}

/**
 * The dispositions each holder counts as an enemy OUTSIDE a fight: *"hostile or
 * neutral"* (the lead). A holder that is itself neutral or secret counts nobody.
 */
const ENEMY_OUTSIDE_FIGHT = Object.freeze({
  [DISPOSITIONS.FRIENDLY]: Object.freeze([DISPOSITIONS.HOSTILE, DISPOSITIONS.NEUTRAL]),
  [DISPOSITIONS.HOSTILE]: Object.freeze([DISPOSITIONS.FRIENDLY, DISPOSITIONS.NEUTRAL])
});

/**
 * **WHETHER A CREATURE THAT DIED WAS THE HOLDER'S ENEMY**, for Essence alone.
 *
 * In the holder's own fight the tracker's sides decide, as `distance.mjs#countsAsEnemy`
 * reads them. Outside it a creature hostile OR NEUTRAL to the holder counts (the lead),
 * where `countsAsEnemy` counts FRIENDLY against HOSTILE alone. `countsAsEnemy` is left
 * as it is: the Engaged check and the casting Bane keep a neutral token out.
 *
 * A defeated creature is not refused here, since the creature judged has just died.
 *
 * @param {{disposition?: number, fight?: string|null, side?: string|null}} holder
 * @param {{disposition?: number, fight?: string|null, side?: string|null}} other
 * @returns {boolean}
 */
export function essenceEnemy(holder, other) {
  if (!holder || !other) return false;
  const inOneFight = Boolean(holder.fight) && holder.fight === other.fight && Boolean(holder.side) && Boolean(other.side);
  if (inOneFight) return holder.side !== other.side;
  return (ENEMY_OUTSIDE_FIGHT[holder.disposition] ?? []).includes(other.disposition);
}

/**
 * **WHAT ONE DEATH GIVES ONE HOLDER**, and why nothing where it gives nothing.
 *
 * @param {{living?: boolean, enemy?: boolean, feet?: number|null, pool?: {value?: number, max?: number}|null,
 *   killer?: string|null}} o
 *   `living` from `isLiving`; `enemy` from `essenceEnemy`; `feet` the distance measured
 *   between the nearest squares (`canvas/footprints.mjs`), null where it could not be
 *   measured; `pool` the holder's Essence; `killer` `"holder"` where the holder's own
 *   blow killed it, read only where `ESSENCE_FROM_ANY_KILLER` is false
 * @returns {{gain: number, value: number, reason: null|"noPool"|"notLiving"|"notEnemy"|"unmeasured"|"tooFar"|"notYours"|"full"}}
 */
export function essenceFromDeath({ living = false, enemy = false, feet = null, pool = null, killer = null } = {}) {
  const value = Math.max(0, int(pool?.value));
  const none = reason => ({ gain: 0, value, reason });
  if (!pool) return none("noPool");
  if (living !== true) return none("notLiving");
  if (enemy !== true) return none("notEnemy");
  if (!ESSENCE_FROM_ANY_KILLER && killer !== "holder") return none("notYours");
  if (feet === null || feet === undefined || !Number.isFinite(Number(feet))) return none("unmeasured");
  if (Number(feet) > ESSENCE_RANGE) return none("tooFar");
  // *Essence gained above the cap is lost.*
  const max = Math.max(0, int(pool.max));
  const next = Math.min(max, value + ESSENCE_PER_DEATH);
  if (next <= value) return none("full");
  return { gain: next - value, value: next, reason: null };
}

/* ------------------------------------------------------------------ */
/*  The doors a rise comes through                                      */
/* ------------------------------------------------------------------ */

/**
 * **WHO MAY RAISE ESSENCE** (the plan, on Runic Power's pattern, `runes.mjs
 * #RUNIC_GAIN_SOURCES`): *You gain Essence in no other way unless a feature, talent or
 * spell says so.* `AzerothActor#writePoolsNow` refuses a rise that names none of these.
 *
 * - `death` - the death watch, when a living enemy dies within 120 feet;
 * - `soulCage` - 07's Soul Cage, 1 more from its target's death;
 * - `soulRip` - 07's Soul Rip, 1 when a living target fails its Test;
 * - `refund` - a withdrawn use giving back a price it took;
 * - `hand` - a GM's own hand on the sheet. A player's hand is refused.
 */
// The list lives in the ONE named-gain table (`named-gains.mjs`, the San'layn and Sovereign plan's C3).
export { ESSENCE_GAIN_SOURCES } from "./named-gains.mjs";

/**
 * Why this write may not raise Essence, or null where it may: a fall or no change is
 * never judged; a rise needs a source from `ESSENCE_GAIN_SOURCES`, and `hand` a GM's.
 *
 * @param {{before?: number, after?: number, source?: string|null, gm?: boolean}} o
 * @returns {"unsourced"|"hand"|null}
 */
export function essenceGainRefusal({ before = 0, after = 0, source = null, gm = false } = {}) {
  return namedGainRefusal(ESSENCE, { before, after, source, gm });
}

/**
 * **WHETHER A POOL PAYS A COST NAMED BY KIND** (the plan: *It never pays for a spell, for
 * Parry or for a maneuver*; D-1051). A cost that names no pool - a maneuver, the called shot,
 * a Parry, `pools.mjs`'s *any Momentum* (`ANY_MOMENTUM`) and *any pool* (`ANY_POOL`) - is
 * paid from a pool this answers true for, and Essence is never one of them. A cost that names
 * Essence by name still finds it. `kind` is `maneuver` at a maneuver's door (the called shot's
 * included), which the Demon Hunter's Hatred pays and no other kind.
 *
 * @param {string|null} poolName
 * @param {string} [kind]
 * @returns {boolean}
 */
export function paysByKind(poolName, kind = "any") {
  if (poolName === ESSENCE) return false;
  // **HATRED PAYS EVERY MANEUVER AND NOTHING ELSE BY KIND** (the Demon Hunter plan's C62: *"Hatred
  // can pay all maneuvers."*; `hatred.mjs#hatredPays`): a maneuver door names its kind, and a Parry,
  // *any Momentum* and *any pool* name none, so Hatred pays none of those.
  if (poolName === HATRED) return hatredPays(kind);
  return true;
}

/* ------------------------------------------------------------------ */
/*  Empowering a spell                                                  */
/* ------------------------------------------------------------------ */

/**
 * **The four benefits** (the lead, 2026-11-18, *"Yes"*): 1 Essence each, each at most once a
 * casting. `needs` names the fact `empowerFacts` must find on the spell.
 *
 * - **Potent.** The spell's damage, healing or temporary Health rises by your tier for
 *   each creature it affects.
 * - **Binding.** Each creature takes a Bane on the first Resilience Test the spell asks
 *   of it.
 * - **Lasting.** The spell's duration doubles, if it lasts 1 minute or longer and is not
 *   Sustained.
 * - **Far-reaching.** The spell's range doubles, if it is not Self or Touch.
 */
export const EMPOWER_OPTIONS = Object.freeze({
  potent: Object.freeze({ key: "potent", cost: 1, needs: "amount", label: "AZEROTH.Essence.Empower.potent" }),
  binding: Object.freeze({ key: "binding", cost: 1, needs: "test", label: "AZEROTH.Essence.Empower.binding" }),
  lasting: Object.freeze({ key: "lasting", cost: 1, needs: "lasting", label: "AZEROTH.Essence.Empower.lasting" }),
  farReaching: Object.freeze({ key: "farReaching", cost: 1, needs: "range", label: "AZEROTH.Essence.Empower.farReaching" })
});

/** A duration's length in minutes off its text (`1 minute`, `10 minutes`, `1 hour`, `1 round`), the longest it names. */
function minutesOf(text) {
  const unit = { round: 0.1, minute: 1, hour: 60, day: 1440, week: 10080, month: 43200, year: 525600 };
  let best = 0;
  for (const m of String(text ?? "").toLowerCase().matchAll(/(\d+)\s*(round|minute|hour|day|week|month|year)s?\b/g)) {
    best = Math.max(best, Number(m[1]) * unit[m[2]]);
  }
  return best;
}

/**
 * The facts the four benefits ask of a spell, off its `system` as the pack stores it:
 * an amount (damage, healing or temporary Health), a Resilience Test, a duration of a
 * minute or more that is not Sustained, and a range in feet or miles.
 *
 * **BINDING'S TEST IS ONE A DOOR ASKS** (the 4a review's MUST-FIX 3): the card's own Resist
 * (`resisted.mjs#castTestOf`, the cast's Test asked at the cast) or an area's Test (a
 * `checks` row on the area's tick, posted by `area-strikes.mjs#postAreaTest`). A spell
 * whose **Test** field names a Test that no door asks - Nature's Grasp's, asked of the next
 * creature to hit you - carries nothing Binding could reach, so the line is not drawn.
 *
 * @param {{damage?: {rating?: number|null}, heal?: {amount?: string|number|null}, tempHealth?: unknown,
 *   test?: {resilience?: string|null}, duration?: {kind?: string|null, text?: string}, range?: string}} spell
 * @returns {{amount: boolean, test: boolean, lasting: boolean, range: boolean}}
 */
export function empowerFacts(spell = {}) {
  const s = spell ?? {};
  const has = v => v !== null && v !== undefined && v !== "" && v !== 0;
  const duration = s.duration ?? {};
  return {
    amount: has(s.damage?.rating) || has(s.heal?.amount) || has(s.heal?.perTurn) || has(s.tempHealth),
    test: bindingReaches(s),
    lasting: duration.kind !== "sustained" && !/sustained/i.test(duration.text ?? "") && minutesOf(duration.text) >= 1,
    range: /^\s*\d[\d,]*\s*(ft|feet|foot|miles?)\b/i.test(String(s.range ?? ""))
  };
}

/**
 * **THE EMPOWER LINES TICKED, JUDGED WHOLE** before anything is paid (D-768's order): each
 * a known benefit, none twice, each one the spell can take, and the Essence held for all
 * of them. The Essence is spent even if the Casting Test fails - that is the door's.
 *
 * @param {object} spell  the spell's `system` (`empowerFacts`)
 * @param {string[]} picks  `EMPOWER_OPTIONS` keys
 * @param {{value?: number}|null} pool  the caster's Essence
 * @returns {{ok: boolean, cost: number, picks: string[], refusal: null|"noPool"|"unknown"|"twice"|"notApplicable"|"short", key: string|null}}
 */
export function empowerPlan(spell = {}, picks = [], pool = null) {
  const list = Array.isArray(picks) ? picks : [];
  const refuse = (refusal, key = null) => ({ ok: false, cost: 0, picks: [], refusal, key });
  if (!list.length) return { ok: true, cost: 0, picks: [], refusal: null, key: null };
  if (!pool) return refuse("noPool");
  const facts = empowerFacts(spell);
  const seen = new Set();
  let cost = 0;
  for (const key of list) {
    const option = EMPOWER_OPTIONS[key];
    if (!option) return refuse("unknown", String(key));
    if (seen.has(key)) return refuse("twice", key);
    if (!facts[option.needs]) return refuse("notApplicable", key);
    seen.add(key);
    cost += option.cost;
  }
  if (Math.max(0, int(pool.value)) < cost) return refuse("short");
  return { ok: true, cost, picks: [...seen], refusal: null, key: null };
}

/** Potent's rise for each creature the spell affects: your tier. */
export function potentBonus(tier = 1) {
  return Math.max(1, int(tier));
}

/**
 * **WHETHER A DOOR ASKS THE SPELL'S TEST** (Binding's fact; the 4a review's MUST-FIX 3): the
 * card's Resist at the cast, or an area's Test at a turn's start, on entering or crossing.
 *
 * @param {{test?: {resilience?: string|null}, effect?: string, areaTick?: {checks?: Array<{resilience?: string|null}>}|null}} spell
 * @returns {boolean}
 */
export function bindingReaches(spell = {}) {
  const s = spell ?? {};
  if (castTestOf(s)) return true;
  const checks = Array.isArray(s.areaTick?.checks) ? s.areaTick.checks : [];
  if (checks.some(c => typeof c?.resilience === "string" && c.resilience)) return true;
  // Tempest's Test on entering and Nether Rift's at the caster's turns: the area's forced move, whose
  // Test card `postAreaTest` posts as well (`area-ticks.mjs#forcedCheck`, `#casterTurnCheck`).
  const forced = readForced(s.effect ?? "", s);
  return Boolean(forced?.resilience) && (forced.on === "enter" || forced.on === "casterTurn");
}

/**
 * **02 §7's POTENT ON AN AREA, FOR ONE CREATURE** (*The spell's damage, healing or temporary
 * Health rises by your tier for each creature it affects*; the 4a review's MUST-FIX 2): the
 * area's first strike on each creature carries the rise, and a creature the Region has already
 * recorded takes none. Pure and returns fresh objects; the record is written by the door AFTER
 * the strike lands (`effects/empower-areas.mjs#recordAreaMark`).
 *
 * @param {{potent?: number, struck?: string[], uuid?: string|null, damage?: {rating?: number}|null, heal?: number|null}} o
 * @returns {{damage: object|null, heal: number|null, rose: number}}
 */
export function potentAreaRise({ potent = 0, struck = [], uuid = null, damage = null, heal = null } = {}) {
  const n = int(potent);
  const same = { damage: damage ?? null, heal: heal ?? null, rose: 0 };
  if (n <= 0 || typeof uuid !== "string" || !uuid) return same;
  if (Array.isArray(struck) && struck.includes(uuid)) return same;
  let rose = 0;
  let outDamage = damage ?? null;
  let outHeal = heal ?? null;
  if (damage && typeof damage === "object") {
    outDamage = { ...damage, rating: int(damage.rating) + n };
    rose = n;
  }
  if (Number(heal) > 0) {
    outHeal = Number(heal) + n;
    rose = n;
  }
  return { damage: outDamage, heal: outHeal, rose };
}

/**
 * **WHO THE CAST ITSELF ALREADY REACHED** (Potent's seed at Place area; the 4a review's MUST-FIX 2):
 * where the cast deals damage, heals or grants temporary Health on its own, each creature its
 * card names took Potent there, so the area carries the rise for everybody else. A per-target
 * verdict that failed reached nobody. Unique, in the card's order.
 *
 * @param {{strikes?: boolean, success?: boolean, targets?: Array<string|null>, verdicts?: Array<boolean|null>|null}} o
 *   `targets` the uuids the card's rows resolve to, `verdicts` each row's own success where the
 *   cast judged each target
 * @returns {string[]}
 */
export function potentAreaSeed({ strikes = false, success = true, targets = [], verdicts = null } = {}) {
  if (!strikes || success === false) return [];
  const out = [];
  (targets ?? []).forEach((uuid, i) => {
    if (typeof uuid !== "string" || !uuid || out.includes(uuid)) return;
    if (Array.isArray(verdicts) && verdicts[i] === false) return;
    out.push(uuid);
  });
  return out;
}

/**
 * **BINDING, FOR ONE TEST** (*Each creature takes a Bane on the first Resilience Test the spell asks
 * of it*; the 4a review's MUST-FIX 3, closing O-411): a creature the cast has asked nothing of yet
 * takes the Bane; one the record names has had its first Test.
 *
 * @param {{binding?: boolean|{spent?: string[]}|null, uuid?: string|null}} o
 * @returns {boolean}
 */
export function bindingBane({ binding = null, uuid = null } = {}) {
  if (!binding || typeof uuid !== "string" || !uuid) return false;
  const spent = Array.isArray(binding?.spent) ? binding.spent : [];
  return !spent.includes(uuid);
}

/* ------------------------------------------------------------------ */
/*  The Long Rest exposure                                              */
/* ------------------------------------------------------------------ */

/**
 * **HOLDING ESSENCE THROUGH A LONG REST** (the lead: *"DC 12 + essence held"*): a Body
 * Resilience Test against DC 12 plus the Essence held, and 1 Undeath on a failure. Null
 * where nothing is held. Who accrues no Undeath (a Forsaken, a lich) is
 * `undead.mjs#accruesTrack`'s, asked by the door.
 *
 * @param {{held?: number}} o
 * @returns {{dc: number, track: "undeath", resilience: "body", occasion: "essence", points: 1}|null}
 */
export function restExposure({ held = 0 } = {}) {
  const n = Math.max(0, int(held));
  if (!n) return null;
  return { dc: ESSENCE_REST_DC_BASE + n, track: "undeath", resilience: "body", occasion: "essence", points: 1 };
}
