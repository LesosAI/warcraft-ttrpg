/**
 * **THE LEAD'S CLASS ANSWERS, AS LAW** (D-779; the lead's rulings of 2026-10-03
 * on O-166 to O-195, rows 13 to 42 of the rulings table). Pure: no Foundry
 * imports. Every function here is called by ONE door, named beside it, and
 * `class-answers.test.mjs` holds each to the chapter's own words and each door
 * to its call.
 *
 * What the talent table says each talent IS stays in `talent-effects.mjs`, and
 * the reader of each row kind in `class-talents.mjs`; this is the arithmetic and
 * the judgements those rows hand their doors.
 */

import { AZEROTH } from "../config.mjs";

/* -------------------------------------------- */
/*  06 §6's Parry (O-166, O-180)                 */
/* -------------------------------------------- */

/** Why a Parry of a ranged attack is refused, as `lang/en.json` keys (O-180). */
export const PARRY_RANGED_REFUSALS = Object.freeze({
  ranged: "AZEROTH.Reaction.Refuse.ParryRanged",
  far: "AZEROTH.Reaction.Refuse.ParryTooFar",
  spent: "AZEROTH.Reaction.Refuse.ParryRangedSpent"
});

/**
 * The next of a talent's marks on the round's record, `identifier:1` to
 * `identifier:count` - `class-talents.mjs#nextRoundMark`'s own shape, kept here
 * so this module needs no import from the talent readers.
 */
function roundMark(identifier, count, used = []) {
  const n = Math.max(0, Math.trunc(Number(count)) || 0);
  for (let i = 1; i <= n; i++) {
    const key = `${identifier}:${i}`;
    if (!(used ?? []).includes(key)) return key;
  }
  return null;
}

/**
 * **A MARK FOR ONE TURN OF THE FIGHT** (04's Main Gauche as the lead reworked it:
 * *Main gauge can be reworked to allow 1 parry per turn without spending a
 * reaction*; D-779): `identifier@<turn>` on the round's record, which a new round
 * clears - so a mark per turn index is a mark per creature's turn. Null where
 * this turn's mark is spent, or where there is no turn to name.
 *
 * @param {string} identifier
 * @param {number|null} turn  the fight's `turn` index
 * @param {string[]} used  the round record's `once` list
 * @returns {string|null}
 */
export function turnMark(identifier, turn, used = []) {
  const t = Math.trunc(Number(turn));
  if (!identifier || !Number.isFinite(t) || t < 0 || turn === null || turn === undefined) return null;
  const key = `${identifier}@${t}`;
  return (used ?? []).includes(key) ? null : key;
}

/**
 * **WHETHER A PARRY ANSWERS THIS ATTACK** (the lead, 2026-10-03, on O-180:
 * *"Parry is limited to melee unless a feature allows ranged parry."*). A melee
 * attack, or one whose way was never recorded (the table's, as before), may be
 * Parried. A ranged or thrown one only by a defender holding 04's Anticipation
 * (*You may Parry a ranged attack made within 30 feet, once a round, or twice a
 * round at rank 2*): within its feet, measured, and with a mark of the round
 * left - the mark is returned so the door spends it.
 *
 * @param {{rangeKind?: string|null, feet?: number|null, ranged?: {identifier: string, feet: number, count: number}|null,
 *   used?: string[]}} o  `ranged` the defender's Anticipation (`class-talents.mjs#rangedParryFor`)
 * @returns {{ok: boolean, mark: string|null, reason: string|null}}
 */
export function parryReaches({ rangeKind = null, feet = null, ranged = null, used = [] } = {}) {
  if (!rangeKind || rangeKind === "melee") return { ok: true, mark: null, reason: null };
  if (!ranged) return { ok: false, mark: null, reason: PARRY_RANGED_REFUSALS.ranged };
  const apart = typeof feet === "number" && Number.isFinite(feet) ? feet : null;
  if (apart === null || apart > (Number(ranged.feet) || 0)) return { ok: false, mark: null, reason: PARRY_RANGED_REFUSALS.far };
  const mark = roundMark(ranged.identifier, ranged.count, used);
  return mark ? { ok: true, mark, reason: null } : { ok: false, mark: null, reason: PARRY_RANGED_REFUSALS.spent };
}

/**
 * **WHAT A PARRY THAT HOLDS TAKES BACK OFF** (the lead, 2026-10-03, on O-166:
 * *"No"* to *does a Parry leave a landed condition on?*; READING, D-779: the
 * condition comes off). Each condition the parried blow landed with no button
 * pressed - a rider's, Deep Cut's, Ferocious Bite's, Rupture's Bleeding - as the
 * card recorded it (`effects/inflict.mjs`'s landing): one the creature did not
 * have before the blow goes; one it had keeps the value it had before (READING:
 * the blow's own part is what the Parry undoes). A landing that did not take, or
 * that recorded nothing of the state before, is left alone.
 *
 * @param {Array<{id: string, landed?: boolean, had?: boolean, prior?: number|null}>} landed
 * @returns {Array<{id: string, remove: boolean, value: number|null}>}
 */
export function parryUndoes(landed = []) {
  const out = [];
  const seen = new Set();
  for (const row of landed ?? []) {
    if (!row?.id || row.landed !== true || seen.has(row.id)) continue;
    if (row.had === false) {
      out.push({ id: row.id, remove: true, value: null });
      seen.add(row.id);
      continue;
    }
    const prior = Math.trunc(Number(row.prior));
    if (row.had === true && Number.isFinite(prior) && prior > 0 && row.prior !== null) {
      out.push({ id: row.id, remove: false, value: prior });
      seen.add(row.id);
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/* -------------------------------------------- */
/*  04's Undying Rage (O-173)                    */
/* -------------------------------------------- */

/** 04's Undying Rage: *one round per 2 Rage spent*; the flag its held effect carries. */
export const UNDYING_RAGE = Object.freeze({ talent: "Undying Rage", per: 2, flag: "undyingRage" });

/**
 * **UNDYING RAGE'S HOLD** (04: *When reduced to 0 Health, spend all your Rage. You
 * stay at 1 Health for one round per 2 Rage spent, then fall as usual*; D-779).
 * A blow that would take the warrior from above 0 to 0, the talent held, in a
 * started fight (READING: *one round* is a fight's round, so out of a fight it
 * is the table's), and Rage enough for a round: all the Rage is spent and the
 * warrior stays at 1. A hold already standing is never begun again - and whether
 * a blow in the held rounds is floored at 1 is the lead's (CLARIFY, O-173), so
 * such a blow is not held here.
 *
 * @param {{before?: number, amount?: number, rage?: number, holds?: boolean, inFight?: boolean, standing?: boolean}} o
 * @returns {{saved: boolean, amount: number, rounds: number, spent: number}}
 */
export function undyingRageHold({ before = 0, amount = 0, rage = 0, holds = false, inFight = false, standing = false } = {}) {
  const b = Math.max(0, Math.trunc(Number(before)) || 0);
  const a = Math.max(0, Math.trunc(Number(amount)) || 0);
  const r = Math.max(0, Math.trunc(Number(rage)) || 0);
  const rounds = Math.floor(r / UNDYING_RAGE.per);
  const drops = b > 0 && b - a <= 0;
  if (!holds || !inFight || standing || !drops || rounds < 1) return { saved: false, amount: a, rounds: 0, spent: 0 };
  return { saved: true, amount: b - 1, rounds, spent: r };
}

/**
 * **WHETHER THE HELD WARRIOR FALLS NOW** (04's *then fall as usual*; the lead,
 * 2026-10-03, on O-173: *"Heals cancel the fall."*): the held rounds ran out
 * (the effect expired by its own clock, never a hand delete), no heal cancelled
 * them, and the warrior is still standing.
 *
 * @param {{expired?: boolean, cancelled?: boolean, health?: number}} o
 */
export function undyingFalls({ expired = false, cancelled = false, health = 0 } = {}) {
  return expired === true && cancelled !== true && (Math.trunc(Number(health)) || 0) > 0;
}

/* -------------------------------------------- */
/*  04's Bracing (O-174)                         */
/* -------------------------------------------- */

/** The effect flag Bracing's Armor Points stand under, on the warrior. */
export const BRACING_FLAG = "bracing";

/**
 * **BRACING** (04: *If you do not move by the end of your turn, your Armor Points
 * increase by 1 per rank*; the lead, 2026-10-03, on O-174: *"Next move"*): the
 * Armor Points a turn ended without a move lays, or 0.
 *
 * @param {{moved?: boolean, rank?: number}} o
 */
export function bracingAmount({ moved = false, rank = 0 } = {}) {
  const n = Math.max(0, Math.trunc(Number(rank)) || 0);
  return moved === true ? 0 : n;
}

/**
 * The `system.changes` Bracing lays: Armor Points added at every location the
 * character has, in the `final` phase (a derived number, D-668's rule).
 *
 * @param {number} amount
 * @param {string[]} [locations]
 */
export function bracingChanges(amount = 0, locations = ["body", "head", "limb"]) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!n) return [];
  return (locations ?? []).map(loc => ({ key: `system.ap.${loc}`, type: "add", value: String(n), phase: "final" }));
}

/* -------------------------------------------- */
/*  04's Shared Quarry (O-177)                   */
/* -------------------------------------------- */

/**
 * **WHO PAYS A COMPANION'S MANEUVER** (04's Shared Quarry at rank 1: *Your companion
 * may spend your Quarry as you can*; the lead, 2026-10-03, on O-177: *"Maneuvers or
 * other quarry costing features"*): the companion's own Momentum pool while it holds
 * the `amount` due, else - the talent held - its owner's Quarry where THAT holds it
 * (READING, D-779: its own first, since the talent says *may*). Where neither holds
 * the amount, the pool the refusal names: its own, else the owner's. Null where the
 * creature has neither.
 *
 * **EVERY CREATURE HOLDS A MOMENTUM POOL** (`bestiary.mjs#creaturePools`, the tool's
 * floor of 10), so a law that preferred the companion's own pool whenever it EXISTED
 * never reached the owner's at all - the amount is what makes the talent reachable.
 *
 * @param {{own?: object|null, owner?: object|null, shares?: boolean, amount?: number}} o  pools as `poolSnapshot` gives them
 * @returns {{payer: "own"|"owner", pool: object}|null}
 */
export function momentumPayer({ own = null, owner = null, shares = false, amount = 0 } = {}) {
  const due = Math.max(0, Number(amount) || 0);
  const holds = pool => Boolean(pool) && (Number(pool.value) || 0) >= due;
  const quarry = shares ? owner : null;
  if (holds(own)) return { payer: "own", pool: own };
  if (holds(quarry)) return { payer: "owner", pool: quarry };
  if (own) return { payer: "own", pool: own };
  if (quarry) return { payer: "owner", pool: quarry };
  return null;
}

/* -------------------------------------------- */
/*  04's Snake Trap (O-178)                      */
/* -------------------------------------------- */

/**
 * **WHOM SNAKE TRAP'S POISON REACHES** (04: *the first creature caught. At rank 2
 * it applies to everything in the radius*; the lead, 2026-10-03, on O-178: *"Yes,
 * Dexterity"*): the first of the Snare's targets, or every one at rank 2.
 *
 * @param {Array} targets  the Snare card's, in the order named
 * @param {{reach?: "first"|"all"}} o
 */
export function snakeTrapCatches(targets = [], { reach = "first" } = {}) {
  const list = Array.isArray(targets) ? targets : [];
  return reach === "all" ? [...list] : list.slice(0, 1);
}

/* -------------------------------------------- */
/*  04's Master of the Land (O-179)              */
/* -------------------------------------------- */

/** 04's Master of the Land: *Any number of targets within 30 feet*. */
export const MASTER_OF_THE_LAND = Object.freeze({ talent: "Master of the Land", feet: 30 });

/**
 * **WHETHER A CREATURE IGNORES NON-MAGICAL MOVEMENT PENALTIES** (04's Master of
 * the Land; the lead, 2026-10-03, on O-179: *"Always on"*): a holder of the
 * talent stands within its feet and counts the creature as an ally (the holder
 * itself included, D-755). Every candidate is a holder as the door measured it.
 *
 * @param {Array<{feet: number|null, ally: boolean}>} holders
 */
export function landwise(holders = []) {
  return (holders ?? []).some(h => h?.ally === true && typeof h.feet === "number" && Number.isFinite(h.feet) && h.feet <= MASTER_OF_THE_LAND.feet);
}

/* -------------------------------------------- */
/*  07's Barrier, 04's Barrier (O-182)           */
/* -------------------------------------------- */

/** 07's Barrier. */
export const BARRIER = Object.freeze({ spell: "Barrier" });

/**
 * **THE WARD AN AREA GIVES THE CREATURES ITS CASTER CHOOSES** (07's Barrier:
 * *Every creature you choose inside the area has Ward 3 against every school for
 * as long as it stays inside*; the lead, 2026-10-03, on O-182: *"Yes"*), read off
 * the entry. Null where the entry says nothing of the kind.
 *
 * @param {string} effectText
 * @returns {{amount: number, schools: string[]}|null}
 */
export function readChosenWard(effectText = "") {
  const text = String(effectText ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const m = /\bEvery creature you choose inside the area has Ward (\d+) against every school\b/i.exec(text);
  if (!m) return null;
  return { amount: Number(m[1]), schools: Object.keys(AZEROTH.schools) };
}

/**
 * The rider a placed area carries for the creatures chosen (`area-ticks.mjs`'s
 * `remains` row, D-757's shape, `who: "chosen"`): the Ward, raised by the
 * caster's talent, on the creatures the card named alone, for as long as each
 * stays inside. Null where nobody was chosen or nothing is given.
 *
 * @param {{amount: number, schools: string[]}|null} ward  `readChosenWard`'s
 * @param {{add?: number, chosen?: string[]}} o  the talent's rank added; the actor uuids named
 */
export function chosenWardRemains(ward, { add = 0, chosen = [] } = {}) {
  const uuids = [...new Set((chosen ?? []).filter(u => typeof u === "string" && u))].sort();
  const amount = (Math.trunc(Number(ward?.amount)) || 0) + Math.max(0, Math.trunc(Number(add)) || 0);
  if (!ward || !uuids.length || amount <= 0) return null;
  return {
    when: "inside", who: "chosen", chosen: uuids, kinds: [], exceptKinds: [], gear: "", bane: "",
    ward: { schools: [...(ward.schools ?? [])], amount }, boonAgainst: [], speed: null, healing: "", standFree: false
  };
}

/* -------------------------------------------- */
/*  04's Divine Aegis (O-183)                    */
/* -------------------------------------------- */

/** 04's Divine Aegis: *Ward 1 ... until the end of your next turn*. */
export const DIVINE_AEGIS = Object.freeze({ talent: "Divine Aegis", ward: 1, flag: "divineAegis" });

/**
 * **WHETHER A HEAL RESTORED A TARGET TO FULL** (04's Divine Aegis: *When your
 * healing restores a target to full Health*; D-779): it was below its maximum
 * and is at it now.
 *
 * @param {{before?: number, after?: number, max?: number}} o
 */
export function restoredToFull({ before = 0, after = 0, max = 0 } = {}) {
  const m = Math.trunc(Number(max)) || 0;
  return m > 0 && (Number(before) || 0) < m && (Number(after) || 0) >= m;
}

/**
 * The schools the caster named at the cast, cleaned to the schools 07 knows and
 * no more than the rank allows (the lead, 2026-10-03, on O-183: *"The caster"*).
 *
 * @param {string[]} schools
 * @param {number} count  the talent's rank
 */
export function aegisSchools(schools = [], count = 1) {
  const n = Math.max(0, Math.trunc(Number(count)) || 0);
  return [...new Set((schools ?? []).filter(s => typeof s === "string" && AZEROTH.schools[s]))].sort().slice(0, n);
}

/**
 * The `system.changes` Divine Aegis lays: Ward 1 against each school named, in
 * the `final` phase (a character's Ward is derived, D-668).
 *
 * @param {string[]} schools
 * @param {number} [amount]
 */
export function aegisChanges(schools = [], amount = DIVINE_AEGIS.ward) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!n) return [];
  return aegisSchools(schools, 99).map(s => ({ key: `system.ward.${s}`, type: "add", value: String(n), phase: "final" }));
}

/* -------------------------------------------- */
/*  04's Lightwell (O-184)                       */
/* -------------------------------------------- */

/**
 * 04's Lightwell as the lead ruled it (2026-10-03, on O-184: *"10 minutes, caster
 * chooses place. Other players spend a half-action to expend a charge."*): a font
 * at a point the priest picks, holding five charges for ten minutes, reached
 * within 30 feet of it, a charge taken for a Half-Action.
 */
export const LIGHTWELL = Object.freeze({ talent: "Lightwell", feet: 30, charges: 5, minutes: 10, area: "A 30 ft radius", action: "half" });

/** Why a charge is refused, as `lang/en.json` keys. */
export const LIGHTWELL_REFUSALS = Object.freeze({
  gone: "AZEROTH.Lightwell.Gone",
  spent: "AZEROTH.Lightwell.Spent",
  lapsed: "AZEROTH.Lightwell.Lapsed",
  far: "AZEROTH.Lightwell.TooFar",
  hostile: "AZEROTH.Lightwell.NotFriendly",
  taker: "AZEROTH.Lightwell.OneTaker"
});

/**
 * **WHETHER THIS CREATURE MAY TAKE A CHARGE NOW**: the font still stands, a
 * charge is left, its ten minutes are not over, the creature stands within its
 * reach and is a friend of the priest's (the priest included, D-755). Judged
 * before anything is spent (D-768).
 *
 * @param {{standing?: boolean, taken?: number, charges?: number, now?: number, expires?: number,
 *   inside?: boolean, friendly?: boolean, takers?: number}} o
 * @returns {string|null}  the refusal's key
 */
export function lightwellRefusal({ standing = false, taken = 0, charges = LIGHTWELL.charges, now = 0, expires = 0, inside = false, friendly = false, takers = 1 } = {}) {
  if ((Math.trunc(Number(takers)) || 0) !== 1) return LIGHTWELL_REFUSALS.taker;
  if (!standing) return LIGHTWELL_REFUSALS.gone;
  if ((Math.trunc(Number(taken)) || 0) >= (Math.trunc(Number(charges)) || 0)) return LIGHTWELL_REFUSALS.spent;
  if ((Number(now) || 0) >= (Number(expires) || 0)) return LIGHTWELL_REFUSALS.lapsed;
  if (!inside) return LIGHTWELL_REFUSALS.far;
  if (!friendly) return LIGHTWELL_REFUSALS.hostile;
  return null;
}

/* -------------------------------------------- */
/*  04's Devouring Plague (O-186)                */
/* -------------------------------------------- */

/**
 * 04's Devouring Plague as the lead ruled it (2026-10-03, on O-186: *"tick on
 * cast, and 1 turn after."*): Shadow Word: Pain's damage doubles for two of its
 * landings, the use spent at the cast, on a target below half Health.
 */
export const DEVOURING_PLAGUE = Object.freeze({ talent: "Devouring Plague", spell: "Shadow Word: Pain", landings: 2, below: 0.5, flag: "devouringPlague" });

/**
 * Why the doubling is refused at this cast, as `lang/en.json` keys, or null.
 *
 * @param {{health?: {value: number, max: number}|null, doubledBefore?: boolean, usesLeft?: number}} o
 */
export function plagueRefusal({ health = null, doubledBefore = false, usesLeft = 0 } = {}) {
  if (!((Math.trunc(Number(usesLeft)) || 0) > 0)) return "AZEROTH.DevouringPlague.NoUses";
  const value = Number(health?.value);
  const max = Number(health?.max);
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return "AZEROTH.DevouringPlague.Unmeasured";
  if (!(value < max * DEVOURING_PLAGUE.below)) return "AZEROTH.DevouringPlague.NotBelow";
  if (doubledBefore) return "AZEROTH.DevouringPlague.Again";
  return null;
}

/* -------------------------------------------- */
/*  04's Flametongue (O-188)                     */
/* -------------------------------------------- */

/**
 * 04's Flametongue as the lead ruled it (2026-10-03, on O-188: *"1 mana"*): a
 * Sustain of its own, held for 1 Mana at the start of each of the shaman's turns
 * (05 §12's charge; `rules/upkeep.mjs`).
 */
export const FLAMETONGUE = Object.freeze({ identifier: "flametongue", talent: "Flametongue", type: "fire", upkeep: Object.freeze({ mana: 1, health: 0 }) });

/**
 * **A WEAPON BLOW WHILE FLAMETONGUE IS HELD** (04: *your weapon attacks deal Fire
 * damage rather than Physical. At rank 2 they add 1 damage as well*): a Physical
 * blow made Fire, through the Ward as 08 §7's Greater enchantment is, and the
 * rank's damage added. A blow of another type is left as it is (READING: the
 * talent converts Physical alone).
 *
 * @param {{rating: number, kind: string, school?: string|null}} spec  the attack's damage
 * @param {{add?: number}} o
 */
export function flametongueStrike(spec, { add = 0 } = {}) {
  if (!spec) return spec;
  const physical = (spec.kind ?? "physical") === "physical" && (!spec.school || spec.school === "physical");
  if (!physical) return spec;
  return { ...spec, kind: "magical", school: FLAMETONGUE.type, rating: (Number(spec.rating) || 0) + Math.max(0, Math.trunc(Number(add)) || 0) };
}

/* -------------------------------------------- */
/*  04's Lava Lash (O-189)                       */
/* -------------------------------------------- */

/**
 * **WHAT LAVA LASH SPREADS** (04: *Your Stormstrike spreads any Fire effect on the
 * target to one enemy within 10 feet, or to two enemies at rank 2*; the lead,
 * 2026-10-03, on O-189: *"ablaze or whatever it's called condition."* - A1's
 * Scorched): the Scorched the struck target carries, at its value, onto no more
 * enemies than the rank allows. Null where the target carries none.
 *
 * @param {{scorched?: number|null, count?: number, enemies?: Array}} o  `enemies` the
 *   ones the door measured within 10 feet of the target, nearest first
 * @returns {{value: number, onto: Array}|null}
 */
export function lavaLashSpread({ scorched = null, count = 1, enemies = [] } = {}) {
  const value = Math.trunc(Number(scorched));
  if (scorched === null || scorched === undefined || !Number.isFinite(value) || value < 1) return null;
  const n = Math.max(0, Math.trunc(Number(count)) || 0);
  return { value, onto: (enemies ?? []).slice(0, n) };
}

/* -------------------------------------------- */
/*  04's Elemental Blademaster (O-190)           */
/* -------------------------------------------- */

/**
 * **WHETHER A WEAPON BLOW COUNTS AS A SPELL'S** (04's Elemental Blademaster; the
 * lead, 2026-10-03, on O-190: *"Any spell cast or magic damage from weapon
 * attacks."*): the talent held, and the blow's damage magical - a type 05 §15
 * calls Magical, any of the seven schools (READING: magic is a type other than
 * Physical).
 *
 * @param {{holds?: boolean, type?: string|null}} o
 */
export function blademasterReaches({ holds = false, type = null } = {}) {
  return holds === true && typeof type === "string" && Boolean(AZEROTH.schools[type]);
}

/* -------------------------------------------- */
/*  02's Curse and 04's Soul Swap (O-194)        */
/* -------------------------------------------- */

/**
 * **THE CREATURES A WARLOCK'S CURSE STANDS ON** (the lead, 2026-10-03, on O-194:
 * *"It counts against the limit"*): every creature carrying a Curse's Bane whose
 * origin is the warlock - a Bane Soul Swap moved keeps that origin, so it is
 * counted where it now stands. One creature counts once.
 *
 * @param {Array<{uuid: string, effects: Array<{origin?: string|null, active?: boolean, flags?: object}>}>} creatures
 * @param {string|null} warlock  the warlock's uuid
 * @param {string} [feature]  the Bane's source, 02's Curse
 * @returns {string[]}  the creatures' uuids, sorted
 */
export function standingCurses(creatures = [], warlock = null, feature = "Curse") {
  if (!warlock) return [];
  const out = new Set();
  for (const c of creatures ?? []) {
    if (!c?.uuid) continue;
    const cursed = (c.effects ?? []).some(e => e?.active !== false && e?.origin === warlock
      && e?.flags?.["azeroth-rpg"]?.laidBane?.source === feature);
    if (cursed) out.add(c.uuid);
  }
  return [...out].sort();
}

/**
 * **WHETHER A NEW CURSE FITS** (02's Curse with 04's Pandemic: the number of
 * targets the feature allows): the curses standing on creatures not named again,
 * plus the ones named now, no more than that number. A creature named again is
 * re-cursed, never counted twice (a second Curse replaces the first, D-693's
 * Bane rule).
 *
 * @param {{allowed?: number, standing?: string[], named?: string[]}} o
 * @returns {{ok: boolean, standing: number, room: number}}
 */
export function curseRoom({ allowed = 1, standing = [], named = [] } = {}) {
  const max = Math.max(1, Math.trunc(Number(allowed)) || 1);
  const naming = new Set((named ?? []).filter(Boolean));
  const elsewhere = [...new Set(standing ?? [])].filter(u => !naming.has(u)).length;
  const room = Math.max(0, max - elsewhere);
  return { ok: naming.size <= room, standing: elsewhere, room };
}
