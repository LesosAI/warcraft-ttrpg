/**
 * **THE WITCH HUNTER'S SIGNS AND TECHNIQUES, AS NUMBERS** (02 §7's Signs, Ash Sign, Lull Sign, Greater
 * Signs, Expose Weakness, Whirling Steel, Medallion and The Last Hunt; the Witch Hunter plan's R2, P14,
 * P16, P17, G1, G3, T2). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The lead's calls this module carries, verbatim: R2, **"Signs as features, but reflavored to fit warcraft
 * lore"** (*five Signs as 02 class features, paid in the class's pool and resisted against its Spell DC*);
 * P14, Greater Signs **"explain with a table"**; P16, the Rowan Sign **"gain ward against all schools until
 * the end of your next turn"**, then F6 **"Equal to your tier (Recommended)"**; P17, its Empowered line
 * **"gain temporary health equal to your intelligence modifier until the end of your next turn"**; G1,
 * **"Expose Weakness (Recommended), Medallion warning"**; G3, **"Rowan Sign on an ally"**; T2, Sign of the
 * Order **"reduce sign cost by 1"** (MY READING, accepted: always on, the floor of 1 holds).
 *
 * Every number is the plan's draft text, which the approval made the rules text; the doors are wave 2a's
 * (`useFeature`, judge, then budget, then pay; D-768). 04's Gryphon, Bear and Wolf talents that move a
 * Sign's numbers are read here by RANK, handed in by the door (wave 2b writes their rows), so a Sign's
 * cost, area and damage have one home.
 *
 * **"FROM SIGNS" IS ALL FIVE SIGNS** (D-2111, closing O-718). The lead's T2 was **"reduce sign cost by
 * 1"**, which means every Sign, and the Ash Sign and the Lull Sign are used *as **Signs** says* (02 §7's
 * Ash Sign and Lull Sign rows), so they are Signs from **Signs**. Quick Script, Twin Signs, Sign of the
 * Order and The Last Hunt take Energy off all five, and *No Sign costs less than 1 Energy* holds for all
 * five. `FROM_SIGNS` is the one list.
 */

import { WARD_MAX } from "./ward.mjs";
import { studiedTypes, weaknessOf, cleanType } from "./tome.mjs";
import { THE_LAST_HUNT, THE_LAST_HUNT_CAP, TEMPO } from "./tempo.mjs";
import { WEAKNESS_CARD_FLAG } from "./witch-hunter-standing.mjs";

const int = v => Math.trunc(Number(v)) || 0;
const whole = v => Math.max(0, int(v));
const tierOf = t => Math.min(4, Math.max(1, int(t) || 1));

/** The feature names, as 02 §7 heads them. */
export const SIGNS_FEATURE = "Signs";
export const ASH_SIGN_FEATURE = "Ash Sign";
export const LULL_SIGN_FEATURE = "Lull Sign";
export const GREATER_SIGNS = "Greater Signs";
export const MEDALLION_FEATURE = "Medallion";
export const THE_LAST_HUNT_FEATURE = THE_LAST_HUNT;

/** *No Sign costs less than 1 Energy.* */
export const SIGN_FLOOR = 1;
/** Greater Signs: *you may spend 2 more Energy to empower it*. */
export const EMPOWER_COST = 2;

/**
 * **THE FIVE SIGNS** (02 §7's Signs table), keyed. `level` the feature that teaches it; `cost` its Energy;
 * `test` the Resilience a creature makes against the Spell DC (null for the Rowan Sign, which asks none);
 * `area` its shape.
 */
export const SIGNS = Object.freeze({
  gale: Object.freeze({ key: "gale", name: "Gale Sign", feature: SIGNS_FEATURE, level: 1, cost: 3, test: "body", area: Object.freeze({ shape: "cone", feet: 15 }) }),
  ember: Object.freeze({ key: "ember", name: "Ember Sign", feature: SIGNS_FEATURE, level: 1, cost: 3, test: "reflex", area: Object.freeze({ shape: "cone", feet: 15 }) }),
  rowan: Object.freeze({ key: "rowan", name: "Rowan Sign", feature: SIGNS_FEATURE, level: 1, cost: 3, test: null, area: Object.freeze({ shape: "one", range: 30 }) }),
  ash: Object.freeze({ key: "ash", name: "Ash Sign", feature: ASH_SIGN_FEATURE, level: 9, cost: 4, test: "spirit", area: Object.freeze({ shape: "radius", feet: 10, range: 30 }) }),
  lull: Object.freeze({ key: "lull", name: "Lull Sign", feature: LULL_SIGN_FEATURE, level: 11, cost: 4, test: "spirit", area: Object.freeze({ shape: "one", range: 30 }) })
});

/** The Signs in 02's order. */
export const SIGN_KEYS = Object.freeze(Object.keys(SIGNS));

/**
 * The Signs *each Sign from **Signs*** names: all five, because the Ash Sign and the Lull Sign are used as
 * **Signs** says (D-2111).
 */
export const FROM_SIGNS = Object.freeze(["gale", "ember", "rowan", "ash", "lull"]);

/** The Sign a name or key means, or null. */
export function signOf(sign) {
  if (!sign) return null;
  const word = String(sign).toLowerCase().replace(/\s+sign$/, "").trim();
  return SIGNS[word] ?? null;
}

/** 04's Gryphon talents that move a Sign's numbers, by name. */
export const GRYPHON = Object.freeze({
  farSigns: "Far Signs", searingScript: "Searing Script", quickScript: "Quick Script",
  shatteringGale: "Shattering Gale", firestream: "Firestream", burstingRowan: "Bursting Rowan",
  ashenRing: "Ashen Ring", deepLull: "Deep Lull", livingRowan: "Living Rowan", twinSigns: "Twin Signs",
  holyEmber: "Holy Ember", signOfTheOrder: "Sign of the Order"
});

/* ------------------------------------------------------------------ */
/*  What a Sign costs                                                   */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A SIGN COSTS THIS USE**, with every line that moved it, for the dialog's detail. The discounts
 * reach every Sign from **Signs** (`FROM_SIGNS`, all five; D-2111):
 *
 * - Quick Script: *Your first Sign each turn from **Signs** costs 1 Energy less per rank* (`nth` 1);
 * - Twin Signs: *Your second Sign each turn from **Signs** costs 1 Energy less per rank* (`nth` 2);
 * - Sign of the Order: *Each Sign from **Signs** costs 1 Energy less, to the minimum of 1*;
 * - The Last Hunt: *each Sign from **Signs** costs 1 Energy less*, while it stands.
 *
 * The cost never falls below 1 (*No Sign costs less than 1 Energy*), and Greater Signs' 2 is added after
 * the floor (*you may spend 2 more Energy*; MY READING: 2 more than the Sign's own cost).
 *
 * `nth` is which Sign this is in the turn - 1 for the first used, 2 for the second - counting every Sign
 * used this turn (MY READING: Quick Script's *first Sign each turn* is the turn's first Sign).
 *
 * @param {string} sign  a Sign's key or name
 * @param {{nth?: number, empower?: boolean, lastHunt?: boolean,
 *   ranks?: {quickScript?: number, twinSigns?: number, signOfTheOrder?: number}}} [o]
 * @returns {{sign: string, base: number, cost: number, rows: Array<{name: string, cost: number}>}|null}
 */
export function signCost(sign, { nth = 1, empower = false, lastHunt = false, ranks = {} } = {}) {
  const s = signOf(sign);
  if (!s) return null;
  const rows = [];
  let cost = s.cost;
  const from = FROM_SIGNS.includes(s.key);
  const off = (name, n) => {
    if (!(n > 0)) return;
    cost -= n;
    rows.push({ name, cost: Math.max(SIGN_FLOOR, cost) });
  };
  if (from) {
    if (int(nth) === 1) off(GRYPHON.quickScript, whole(ranks.quickScript));
    if (int(nth) === 2) off(GRYPHON.twinSigns, whole(ranks.twinSigns));
    if (whole(ranks.signOfTheOrder) > 0) off(GRYPHON.signOfTheOrder, 1);
    if (lastHunt === true) off(THE_LAST_HUNT_FEATURE, 1);
  }
  cost = Math.max(SIGN_FLOOR, cost);
  if (empower === true) {
    cost += EMPOWER_COST;
    rows.push({ name: GREATER_SIGNS, cost });
  }
  return { sign: s.key, base: s.cost, cost, rows };
}

/* ------------------------------------------------------------------ */
/*  What a Sign does                                                    */
/* ------------------------------------------------------------------ */

/** The Empowered Signs table (Greater Signs), by Sign. */
export const EMPOWERED = Object.freeze({
  // *A creature that fails is also knocked **Prone**.*
  gale: Object.freeze({ prone: true }),
  // *A creature that fails is **Scorched 2** instead, and the damage rises by your tier.*
  ember: Object.freeze({ scorched: 2, damagePlusTier: true }),
  // *The creature that gains the Ward also gains temporary Health equal to your Intelligence modifier until the end of
  // your next turn.*
  rowan: Object.freeze({ tempHealth: "int" }),
  // *The ring is a 20 ft radius and lasts 10 minutes.*
  ash: Object.freeze({ radius: 20, minutes: 10 }),
  // *It affects two creatures, or one creature for 1 minute.*
  lull: Object.freeze({ targets: 2, orMinutes: 1 })
});

/**
 * **WHAT A SIGN DOES THIS USE**, every number read: its area, its Test, what a failure and a success do,
 * with Greater Signs' row and 04's Gryphon ranks laid on. A door reads this and lays it; nothing here is
 * written anywhere.
 *
 * @param {string} sign
 * @param {{tier?: number, intMod?: number, empower?: boolean, holy?: boolean, ranks?: Record<string, number>}} [o]
 *   `holy` whether a Holy Ember use takes Holy damage (the talent asked at the use); `ranks` by `GRYPHON`'s keys
 * @returns {object|null}
 */
export function signEffect(sign, { tier = 1, intMod = 0, empower = false, holy = false, ranks = {} } = {}) {
  const s = signOf(sign);
  if (!s) return null;
  const t = tierOf(tier);
  const r = key => whole(ranks?.[key]);
  const emp = empower === true ? EMPOWERED[s.key] : null;
  const out = { sign: s.key, test: s.test, area: { ...s.area }, empowered: Boolean(emp) };
  switch (s.key) {
    case "gale": {
      // *pushed 10 feet away from you*; Far Signs, *cones ... grow by 5 feet per rank*; Shattering Gale,
      // *Physical damage equal to your rank plus your tier*; Empowered, *also knocked **Prone***.
      out.area.feet = s.area.feet + 5 * r("farSigns");
      out.onFail = { push: 10, prone: Boolean(emp?.prone) };
      if (r("shatteringGale") > 0) out.onFail.damage = { amount: r("shatteringGale") + t, type: "physical" };
      out.onSuccess = null;
      break;
    }
    case "ember": {
      // *Fire damage equal to 2 plus your tier and is **Scorched 1**, and on a success it takes half of that,
      // rounded down*; Searing Script, *1 more damage per rank*; Holy Ember, *Holy damage instead of Fire*;
      // Empowered, *Scorched 2 instead, and the damage rises by your tier*.
      out.area.feet = s.area.feet + 5 * r("farSigns");
      const amount = 2 + t + r("searingScript") + (emp?.damagePlusTier ? t : 0);
      const type = holy === true && r("holyEmber") > 0 ? "holy" : "fire";
      out.onFail = { damage: { amount, type }, scorched: emp?.scorched ?? 1 };
      out.onSuccess = { damage: { amount: Math.floor(amount / 2), type } };
      // Firestream: *stays alight until the start of your next turn ... Fire damage equal to your rank*.
      if (r("firestream") > 0) out.lingers = { until: "startOfNextTurn", damage: { amount: r("firestream"), type: "fire" } };
      break;
    }
    case "rowan": {
      // *Ward equal to your tier against every school until the end of your next turn*, capped at 05's 10;
      // Living Rowan, *rises by 1 per rank*; Empowered, temporary Health equal to the Intelligence modifier;
      // Bursting Rowan, *each enemy within 5 feet ... Fire damage equal to your rank plus your tier*.
      out.ward = { allSchools: true, value: Math.min(WARD_MAX, t + r("livingRowan")), until: "endOfNextTurn" };
      out.tempHealth = emp ? Math.max(0, int(intMod)) : 0;
      if (r("burstingRowan") > 0) out.burst = { feet: 5, damage: { amount: r("burstingRowan") + t, type: "fire" } };
      out.onFail = null;
      out.onSuccess = null;
      break;
    }
    case "ash": {
      // *A 10 ft radius ... for 1 minute*; Empowered, *a 20 ft radius and lasts 10 minutes*; Ashen Ring, *grows
      // by 5 feet per rank*, and Holy damage equal to the rank to an undead or a demon at its turn's start;
      // Far Signs, *reach 10 feet farther per rank*.
      out.area.range = s.area.range + 10 * r("farSigns");
      out.area.feet = (emp?.radius ?? s.area.feet) + 5 * r("ashenRing");
      out.minutes = emp?.minutes ?? 1;
      out.onFail = { condition: "slowed", until: "leaves" };
      out.stripsImmune = ["physical"];
      out.oneAtATime = true;
      if (r("ashenRing") > 0) out.tick = { kinds: ["undead", "demon"], damage: { amount: r("ashenRing"), type: "holy" } };
      out.onSuccess = null;
      break;
    }
    case "lull": {
      // *Charmed by you until the end of its next turn*; out of a fight, calm for 10 minutes with a Boon on
      // Persuasion and Deception; Deep Lull, *1 more round per rank*; Empowered, *two creatures, or one
      // creature for 1 minute*; Far Signs, *reach 10 feet farther per rank*.
      out.area.range = s.area.range + 10 * r("farSigns");
      out.targets = emp ? emp.targets : 1;
      out.onFail = { condition: "charmed", until: "endOfNextTurn", moreRounds: r("deepLull"), orMinutes: emp ? emp.orMinutes : null };
      out.outOfFight = { minutes: 10, boons: ["persuasion", "deception"] };
      out.onSuccess = null;
      break;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  The techniques                                                      */
/* ------------------------------------------------------------------ */

/** 02's Whirling Steel: *spend 3 Tempo. Make one attack against every enemy within your reach.* */
export const WHIRLING_STEEL_RULE = Object.freeze({
  action: "half", pool: TEMPO, cost: 3, attacks: "each", isAttack: true, extraAttackRolls: false, builds: false, wields: "bothHands"
});

/** Whirling Steel's Tempo: 3, less 1 a rank of Crushing Sweep (*costs 1 Tempo less per rank*), never below 0. */
export function whirlingSteelCost(crushingSweep = 0) {
  return Math.max(0, WHIRLING_STEEL_RULE.cost - whole(crushingSweep));
}

/** 02's Expose Weakness: *As a Half-Action, spend 3 Tempo ... within 30 feet ... until the end of your next turn*. */
export const EXPOSE_WEAKNESS_RULE = Object.freeze({ action: "half", pool: TEMPO, cost: 3, feet: 30, until: "endOfNextTurnOrRound" });

/**
 * **WHY EXPOSE WEAKNESS IS REFUSED ON THIS CREATURE, OR WHAT IT LAYS** - judged whole before the budget and
 * the Tempo (D-768). *Choose a creature of a **Studied** type that you can see within 30 feet. Until the end
 * of your next turn, it is **Vulnerable** to the damage type that its row in the weakness table names. A
 * creature that is Immune to that type is unaffected.*
 *
 * Refusals: `noTarget`, `unseen`, `tooFar` (unmeasured is not refused: nothing is measured off the scene),
 * `notStudied`, `noRow` (a type the table lacks), `immune`, `tempo` (less Tempo held than it costs).
 *
 * @param {{type?: string|null, studied?: string[], known?: string[], lastHunt?: boolean, seen?: boolean,
 *   feet?: number|null, immune?: string[], tempo?: number, target?: boolean}} o
 * @returns {{refusal: string|null, damage: string|null, cost: number}}
 */
export function exposeWeakness({ target = true, type = null, studied = [], known = [], lastHunt = false, seen = true, feet = null, immune = [], tempo = 0 } = {}) {
  const cost = EXPOSE_WEAKNESS_RULE.cost;
  const no = refusal => ({ refusal, damage: null, cost });
  if (target !== true) return no("noTarget");
  if (seen === false) return no("unseen");
  if (feet !== null && feet !== undefined && Number.isFinite(Number(feet)) && Number(feet) > EXPOSE_WEAKNESS_RULE.feet) return no("tooFar");
  const t = cleanType(type);
  if (!t || !studiedTypes({ studied, known, lastHunt }).includes(t)) return no("notStudied");
  const row = weaknessOf(t);
  if (!row) return no("noRow");
  if ((immune ?? []).map(x => String(x).toLowerCase()).includes(row.damage)) return no("immune");
  if (whole(tempo) < cost) return no("tempo");
  return { refusal: null, damage: row.damage, cost };
}

/** 02's Medallion: *within 60 feet of you*, the sense, the Reaction and the pulse. */
export const MEDALLION_RULE = Object.freeze({ feet: 60, slot: "neck", reaction: Object.freeze({ boons: 1, test: "resilience" }), pulse: Object.freeze({ action: "half", feet: 60 }) });

/**
 * **AN UNMEASURED DISTANCE IS NEVER A REFUSAL** (D-669's rule, held the same way by `exposeWeakness`,
 * `medallionPulse` and `medallionSenses`; wave 2a-B's reading, D-2070): where the door could measure nothing
 * (`feet` null), the creature is treated as within reach, as an attack with no token on the scene behaves as
 * it did before. The doors that GATHER creatures themselves (the pulse, the cast watcher) hand only creatures
 * whose tokens stand on the wearer's own scene, where the footprints always measure, so an unmeasured row
 * reaches these laws only from a caller that named the creature.
 */
const within = (feet, reach) => feet === null || feet === undefined || !Number.isFinite(Number(feet)) || Number(feet) <= reach;

/**
 * **THE MEDALLION'S PULSE**: *As a Half-Action, you learn how many creatures of your **Studied** types are within
 * 60 feet of you.* The count, off the creatures the door measured (`feet` footprint to footprint; one not
 * measured counts, `within`). Hidden creatures count: the medallion senses, it does not see (MY READING).
 *
 * @param {{creatures?: Array<{type?: string|null, feet?: number|null}>, studied?: string[], known?: string[], lastHunt?: boolean}} o
 * @returns {number}
 */
export function medallionPulse({ creatures = [], studied = [], known = [], lastHunt = false } = {}) {
  const types = studiedTypes({ studied, known, lastHunt });
  return (creatures ?? []).filter(c => {
    const t = cleanType(c?.type);
    return t && types.includes(t) && within(c?.feet, MEDALLION_RULE.pulse.feet);
  }).length;
}

/**
 * **WHETHER THE MEDALLION SENSES A SPELL CAST**: it is worn in the Neck slot and the caster stood within 60
 * feet (an unmeasured cast is sensed, `within`; the watcher measures only a caster on the wearer's scene).
 *
 * @param {{worn?: boolean, feet?: number|null}} o
 * @returns {boolean}
 */
export function medallionSenses({ worn = false, feet = null } = {}) {
  return worn === true && within(feet, MEDALLION_RULE.feet);
}

/** 02's The Last Hunt: *Once per Long Rest, as a Half-Action, for 1 minute*. */
export const THE_LAST_HUNT_RULE = Object.freeze({ action: "half", per: "long", minutes: 1, rounds: 10, tempoCap: THE_LAST_HUNT_CAP, signDiscount: 1, flag: "whLastHunt" });

/* ------------------------------------------------------------------ */
/*  What the doors judge (wave 2a-B)                                    */
/* ------------------------------------------------------------------ */

/**
 * **THE SIGNS A FEATURE TEACHES** (02 §7): **Signs** the Gale, Ember and Rowan Signs; **Ash Sign** and **Lull
 * Sign** their own. Empty for any other name. The Use asks which where a feature teaches more than one.
 *
 * @param {string} featureName
 * @returns {string[]}  Sign keys, 02's order
 */
export function signsOfFeature(featureName = "") {
  return SIGN_KEYS.filter(k => SIGNS[k].feature === featureName);
}

/**
 * The round record's mark a Sign used this turn writes (`AzerothCombatant#markRoundOnce`), as
 * `rules/class-answers.mjs#turnMark` keys it: `wh-sign@<turn>`, then `:2`, `:3` for the next ones.
 */
export const SIGN_TURN_MARK = "wh-sign";

/** How many Signs a turn's record may count (a mark past it is never needed: two Half-Actions a turn). */
export const SIGN_TURN_LIMIT = 9;

/**
 * **WHICH SIGN THIS IS IN THE TURN** (Quick Script's *first Sign each turn*, Twin Signs' *second*): one more than
 * the Signs the round's record already holds for this turn. Out of a fight there is no turn, so every Sign is
 * the first (MY READING, D-2071).
 *
 * @param {{used?: string[], turn?: number|null, inFight?: boolean}} o
 * @returns {number}
 */
export function signNth({ used = [], turn = null, inFight = false } = {}) {
  if (inFight !== true || turn === null || turn === undefined || !Number.isFinite(Number(turn))) return 1;
  const key = `${SIGN_TURN_MARK}@${Math.trunc(Number(turn))}`;
  return 1 + (used ?? []).filter(m => m === key || String(m).startsWith(`${key}:`)).length;
}

/**
 * **WHY THIS SIGN'S USE IS REFUSED**, judged before the budget and the Energy (D-768): a Sign the feature does not
 * teach, or less Energy held than it costs. Null where it may be used.
 *
 * @param {{sign?: string|null, feature?: string, energy?: number, cost?: number}} o
 * @returns {"unknown"|"energy"|null}
 */
export function signRefusal({ sign = null, feature = "", energy = 0, cost = 0 } = {}) {
  const s = signOf(sign);
  if (!s || !signsOfFeature(feature).includes(s.key)) return "unknown";
  if (whole(energy) < whole(cost)) return "energy";
  return null;
}

/**
 * **WHOM THE ROWAN SIGN WARDS** (*You or one ally within 30 feet*; G3): the user, where nothing is named, or the
 * one creature named, an ally within the reach. An unmeasured distance is no refusal (`within`).
 *
 * @param {{named?: number, self?: boolean, ally?: boolean, feet?: number|null, range?: number}} o
 * @returns {"one"|"notAlly"|"tooFar"|null}
 */
export function rowanRefusal({ named = 0, self = false, ally = true, feet = null, range = SIGNS.rowan.area.range } = {}) {
  if (whole(named) > 1) return "one";
  if (whole(named) === 0 || self === true) return null;
  if (ally !== true) return "notAlly";
  if (!within(feet, range)) return "tooFar";
  return null;
}

/**
 * **WHOM THE LULL SIGN REACHES** (*One creature you can see within 30 feet*; Empowered, *It affects two creatures*):
 * the creatures named, never the user, each seen and within the reach (Far Signs widens it).
 *
 * @param {{targets?: Array<{self?: boolean, seen?: boolean, feet?: number|null}>, max?: number, range?: number}} o
 * @returns {"none"|"tooMany"|"self"|"unseen"|"tooFar"|null}
 */
export function lullRefusal({ targets = [], max = 1, range = SIGNS.lull.area.range } = {}) {
  const list = targets ?? [];
  if (!list.length) return "none";
  if (list.length > Math.max(1, whole(max))) return "tooMany";
  if (list.some(t => t?.self === true)) return "self";
  if (list.some(t => t?.seen === false)) return "unseen";
  if (list.some(t => !within(t?.feet, range))) return "tooFar";
  return null;
}

/**
 * The key every creature the Ash ring strips of **Immune (Physical)** carries on the ring's `remains` row, which the
 * aura door lays while it remains in the ring (`effects/auras.mjs`, D-757's third centre). The reader is
 * `NpcData#prepareDerivedData`'s laid-Immune strip (wave 2a-A's `withoutLaidImmune`).
 */
export const ASH_STRIP = "loseImmune";

/** The identifier an Ash ring's Region carries, so a second ring finds and ends the first (*one Ash ring at a time*). */
export const ASH_RING_KEY = "ash-sign";

/**
 * **THE ASH RING'S AREA**, in D-756's `areaTick` shape (`rules/area-ticks.mjs`): *An enemy that starts its turn in
 * the ring makes a Spirit Resilience Test against your Spell DC, and on a failure it is **Slowed** until it leaves
 * the ring. A creature in the ring loses **Immune (Physical)**.* The span is the ring's minute (ten rounds), or ten
 * minutes Empowered; 04's Ashen Ring adds its Holy damage to an undead or a demon that starts its turn there.
 * Every leaf of the shape is present, as `emptyAreaTick` gives it.
 *
 * **THE TOME'S WEAKNESS BANE RIDES THE CHECK ROW** (02's Tome: the Demon and Elemental rows name the Ash Sign; the
 * architect review's A1, wave 2d-A, D-2131): `weakness` is the hunter's weakness record for the Ash Sign
 * (`witch-hunter-standing.mjs#weaknessRecord`, the one a Sign's card carries as `whWeakness`), set on the ring's
 * Spirit Test row under the same key, so the area Test's card copies it and the Resist roll reads it through the one
 * reader every Sign's Bane takes (`effects/witch-hunter-tome.mjs#resistLinesFor`). No record, no key.
 *
 * @param {{effect: object, empty: {tick: object, check: object, remains: object}, weakness?: object|null}} o
 *   `effect` this Use's `signEffect("ash", ...)`; `empty` the area law's blank shapes, handed in so this module
 *   keeps no second copy of them; `weakness` the hunter's record for the Ash Sign, or null
 * @returns {object}
 */
export function ashRingTick({ effect, empty, weakness = null } = {}) {
  const rounds = Math.max(1, whole(effect?.minutes) || 1) * 10;
  const check = empty.check;
  const weak = Array.isArray(weakness?.types) && weakness.types.length ? { [WEAKNESS_CARD_FLAG]: structuredClone(weakness) } : {};
  const tick = {
    ...empty.tick,
    who: "enemy",
    lasts: { rounds },
    checks: [{
      ...check,
      on: "turn",
      resilience: SIGNS.ash.test,
      fail: { ...check.fail, statuses: ["slowed"], until: "leaves" },
      ...weak
    }],
    remains: [{ ...empty.remains, when: "inside", who: "creature", [ASH_STRIP]: [...(effect?.stripsImmune ?? ["physical"])] }]
  };
  if (effect?.tick?.damage?.amount > 0) {
    tick.against = [{ kinds: [...effect.tick.kinds], who: "", rating: effect.tick.damage.amount, school: effect.tick.damage.type, heal: null, instead: false }];
  }
  return tick;
}

/**
 * **WHY THE MEDALLION'S WARNING IS REFUSED** (*When such a spell is cast, you may use your Reaction to give one ally
 * you can see a Boon on its Resilience Test against that spell*): the medallion is worn and senses the cast, one
 * ally is named, never the wearer, an ally, and seen, and not warned already against this spell. The Reaction is
 * the budget's own refusal.
 *
 * @param {{worn?: boolean, sensed?: boolean, named?: number, self?: boolean, ally?: boolean, seen?: boolean, warned?: boolean}} o
 * @returns {"worn"|"sensed"|"one"|"self"|"notAlly"|"unseen"|"warned"|null}
 */
export function warningRefusal({ worn = false, sensed = false, named = 0, self = false, ally = true, seen = true, warned = false } = {}) {
  if (worn !== true) return "worn";
  if (sensed !== true) return "sensed";
  if (whole(named) !== 1) return "one";
  if (self === true) return "self";
  if (ally !== true) return "notAlly";
  if (seen === false) return "unseen";
  if (warned === true) return "warned";
  return null;
}

/**
 * The one-shot Boon the warning lays on the ally, keyed to the spell's card: the ally's Resist on THAT card reads
 * it as an automatic line and spends it (`dice/chat.mjs#rollResists`).
 */
export const WARNED_FLAG = "medallionWarned";

/**
 * **WHETHER A WARNED BOON STANDS FOR THIS CARD**, off the flag on the ally: `[{messageId, by, name}]`.
 *
 * @param {unknown} held
 * @param {string|null} messageId
 * @returns {{messageId: string, by: string|null, name: string}|null}
 */
export function warnedFor(held, messageId = null) {
  if (!messageId || !Array.isArray(held)) return null;
  const row = held.find(r => r && r.messageId === messageId);
  return row ? { messageId: row.messageId, by: row.by ?? null, name: String(row.name ?? "") } : null;
}

/**
 * The record a Read the Trail card keeps for its GM-only **Learn the type** button: whether the result met the Hard
 * DC, and that nothing has been taught from it yet. What the scene reveals is the GM's (D2 §12).
 *
 * @param {{total?: number, outcome: {standard: number, hard: number, success: boolean}}} o
 */
export function trailRecord({ total = 0, outcome } = {}) {
  return {
    total: whole(total), standard: outcome.standard, hard: outcome.hard, success: outcome.success === true,
    hardMet: outcome.success === true && whole(total) >= outcome.hard, taught: null
  };
}

/**
 * **WHY THE GM'S LEARN THE TYPE IS REFUSED**: the card met the Hard DC, nothing was taught from it yet, and the type
 * picked is one of 14 §1's eight that the Witch Hunter does not know.
 *
 * @param {{record?: object|null, type?: string|null, known?: string[]}} o
 * @returns {"notHard"|"taught"|"type"|"known"|null}
 */
export function learnTypeRefusal({ record = null, type = null, known = [] } = {}) {
  if (record?.hardMet !== true) return "notHard";
  if (record?.taught) return "taught";
  const t = cleanType(type);
  if (!t) return "type";
  if ((known ?? []).map(cleanType).includes(t)) return "known";
  return null;
}

/* ------------------------------------------------------------------ */
/*  Whispering (Type), beside the Medallion (wave 2c)                   */
/* ------------------------------------------------------------------ */

/** 08 §6's Whispering (Type): *Lesser. Direction of the nearest named creature within 100 feet. Greater. Within 300 feet, and roughly how many.* */
export const WHISPERING_RULE = Object.freeze({ lesser: 100, greater: 300 });

/**
 * **WHAT A WHISPERING WEAPON TELLS ITS WIELDER** (the Witch Hunter plan's Finding 2: *Whispering (Type) joins the
 * Medallion's sensing door*; wave 2c): for each Whispering trait wielded (`type-boons.mjs#whisperingOf`), the nearest
 * creature of the type within the grade's reach, with its direction, and at Greater how many stand within it (MY
 * READING: *roughly how many* is given as the count, and the table may soften it). A creature the door could not
 * measure gives no direction and is left out: a sense refuses nothing, so an unmeasured row is simply not reported.
 * Sorted by type, then grade, so a reading compares equal between two looks.
 *
 * @param {{sources?: Array<{type: string, grade: "lesser"|"greater"}>, creatures?: Array<{type?: string|null, feet?: number|null, point?: string|null}>}} o
 * @returns {Array<{type: string, grade: string, reach: number, found: boolean, point: string|null, feet: number|null, count: number|null}>}
 */
export function whisperingSense({ sources = [], creatures = [] } = {}) {
  const seen = new Set();
  const out = [];
  for (const s of sources ?? []) {
    const type = cleanType(s?.type);
    const grade = s?.grade === "greater" ? "greater" : "lesser";
    if (!type || seen.has(`${type}:${grade}`)) continue;
    seen.add(`${type}:${grade}`);
    const reach = WHISPERING_RULE[grade];
    const near = (creatures ?? [])
      .filter(c => cleanType(c?.type) === type && c?.feet !== null && c?.feet !== undefined && Number.isFinite(Number(c.feet)) && Number(c.feet) <= reach)
      .sort((a, b) => Number(a.feet) - Number(b.feet));
    const first = near[0] ?? null;
    out.push({ type, grade, reach, found: Boolean(first), point: first?.point ?? null, feet: first ? Math.round(Number(first.feet)) : null, count: grade === "greater" ? near.length : null });
  }
  return out.sort((a, b) => a.type.localeCompare(b.type) || a.grade.localeCompare(b.grade));
}
