/**
 * **THE TOME OF SILVER AND ASH, STUDIED AND THE WEAKNESS TABLE** (02 §7's Witch Hunter; the Witch
 * Hunter plan's R7, P6, P7, P8, P9, G1, G2). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The lead's calls this module carries, verbatim:
 *
 * - R7: **"mechanical edge only, but it goes by creature type not specific creatures within the
 *   type"**.
 * - P6: **"no limit on knowing types, past the learning requirement listed"**.
 * - P7: the Tome's *ignore 1 Armor Point* **"and Ward of all schools"**.
 * - P8: *Forearmed* renamed **"Studied"** (F1).
 * - P9: Studied counts **"scale with half wisdom modifer, 1 minimum"**.
 * - G1, G2: **"Expose Weakness (Recommended), Medallion warning"** and **"Weakness table
 *   (Recommended), Learn by investigating, Read the Signs"** (renamed **Read the Trail**).
 *
 * The draft text, as the approval accepted it:
 *
 * > **Tome of Silver and Ash.** You know two creature types: Undead, and one of your choice. You learn
 * > a type through **Read the Trail**, or when you finish a Long Rest after a fight in which you
 * > damaged a creature of a type you do not know: make an **Investigation** Test, a Hard Test at your
 * > tier, once per Long Rest, and on a success you learn that type. Against a creature of a type you
 * > know, you have a Boon on Tests to track it, find it or recall what it can do, and your weapon
 * > attacks ignore 1 Armor Point and 1 Ward. Against a creature of a type you know, the creature takes a
 * > Bane on its Resilience Test against a Sign or bomb that its row in the **weakness table** names.
 *
 * > **Studied.** When you finish a Short or Long Rest, choose types you know from the **Tome of Silver
 * > and Ash**, up to half your Wisdom modifier, rounded down, and at least 1. They are **Studied** until
 * > you next choose. Against a creature of a **Studied** type, your weapon attacks deal extra damage
 * > equal to your tier, a hit gives you 1 more Tempo, and you have a Boon on Resilience Tests against
 * > its abilities.
 *
 * **A TYPE IS 14 §1's, AND `typeOf` IS THE ONE READING OF IT** (the plan's MY READING, accepted: *The
 * types are 14 §1's eight. A type marker counts as its type. A character counts as Humanoid unless its
 * people is undead*). It is a different question from `creature-kinds.mjs#kindsOf` (D-753's words
 * *undead*, *fel*, *a demon*): a Death Knight character is undead by KIND (02 §7's Risen Knight) and,
 * since the lead's ruling of 2026-11-27 (O-721, *"Those are undead"*), Undead by TYPE too, as is a
 * Risen character or a lich (`system.undead`). A rule that says *an undead or a demon* (Silvering oil)
 * reads the kind; a rule that says *a type you know* reads this.
 */

import { AZEROTH } from "../config.mjs";
import { peopleUndead } from "./peoples.mjs";

const int = v => Math.trunc(Number(v)) || 0;
const tierOf = t => Math.min(4, Math.max(1, int(t) || 1));
const asList = v => (Array.isArray(v) ? v : (v instanceof Set ? [...v] : (typeof v === "string" && v ? [v] : [])));

/** The feature names this module reads, as 02 §7 heads them. */
export const TOME = "Tome of Silver and Ash";
export const STUDIED = "Studied";
export const READ_THE_TRAIL = "Read the Trail";
export const EXPOSE_WEAKNESS = "Expose Weakness";

/** 04's Field Notes and Forewarned (Wolf), by name: the two talents this module's numbers take. */
export const FIELD_NOTES = "Field Notes";
export const FOREWARNED = "Forewarned";

/**
 * **14 §1's EIGHT TYPES**, in the chapter's order (*Undead, Humanoid, Beast, Demon, Elemental,
 * Dragonkin, Construct, or Ooze*). `AZEROTH.creatureTypes` holds the same eight, and `tome.test.mjs`
 * holds the two together and reads the list off 14.
 */
export const CREATURE_TYPES = Object.freeze(["undead", "humanoid", "beast", "demon", "elemental", "dragonkin", "construct", "ooze"]);

/** The type a character counts as unless its people is undead (the plan's MY READING, accepted). */
export const CHARACTER_TYPE = "humanoid";

/** *You know two creature types: Undead, and one of your choice.* */
export const TOME_START = Object.freeze({ fixed: Object.freeze(["undead"]), choose: 1 });

/**
 * A type word cleaned to one of the eight: lower-cased, a marker in parentheses dropped (14 §1: *A
 * marker in parentheses qualifies it, so `Undead (Mindless)`*), and anything else null.
 *
 * @param {unknown} word
 * @returns {string|null}
 */
export function cleanType(word) {
  if (typeof word !== "string") return null;
  const bare = word.replace(/\(.*?\)/g, "").trim().toLowerCase();
  return CREATURE_TYPES.includes(bare) ? bare : null;
}

/**
 * **WHAT TYPE A CREATURE IS** - the ONE reading every door asks. A creature (`type: "npc"`) is the type
 * its block prints (`system.creatureType`; its `typeMarker` counts as that type, as 14 §1 says). A
 * character is Humanoid unless its people is undead (02 §5's Forsaken and San'layn, `peoples.mjs`), and
 * then Undead. Anything else is null.
 *
 * Takes the same plain shape `creature-kinds.mjs#creatureSnapshot` reads: a document, its `toObject()`,
 * or a row a test made. A character's people is handed in as `race` (a pure rule cannot walk items).
 *
 * @param {{type?: string|null, system?: object|null, race?: string|null, creatureType?: string|null, undead?: boolean|null}} actor
 * @returns {string|null}
 */
export function typeOf({ type = null, system = null, race = null, creatureType = null, undead = null } = {}) {
  const s = system && typeof system === "object" ? system : {};
  // The lead, 2026-11-27 (O-721): *"Those are undead"* - a Death Knight, a Risen character and a lich are Undead by
  // TYPE, read off the one derived value (`undead.mjs#undeadStanding`, `system.undead`), beside the undead peoples.
  if (type === "character") return (peopleUndead(race ?? s.race ?? null) || undead === true || s.undead === true) ? "undead" : CHARACTER_TYPE;
  const word = creatureType ?? s.creatureType ?? null;
  if (type === "npc" || type === null) return cleanType(word);
  return null;
}

/* ------------------------------------------------------------------ */
/*  The weakness table                                                  */
/* ------------------------------------------------------------------ */

/**
 * **THE WEAKNESS TABLE** (G2; 02 §7's Tome of Silver and Ash), keyed by type: the Sign and the bomb a
 * creature of that type takes a Bane against (the Tome), and the damage type Expose Weakness makes it
 * **Vulnerable** to. Signs by their key (`witch-hunter-features.mjs#SIGNS`), bombs by identifier
 * (`witch-hunter-brews.mjs`). Every row is the plan's draft and the lead's to change; `tome.test.mjs`
 * reads it off 02 once the entry is written, and pins it to the plan until then.
 */
export const WEAKNESS = Object.freeze({
  undead: Object.freeze({ sign: "ember", bomb: "silver-dust", damage: "holy" }),
  demon: Object.freeze({ sign: "ash", bomb: "rowan-dust", damage: "holy" }),
  beast: Object.freeze({ sign: "ember", bomb: "sungrass-flash", damage: "fire" }),
  humanoid: Object.freeze({ sign: "lull", bomb: "sungrass-flash", damage: "physical" }),
  elemental: Object.freeze({ sign: "ash", bomb: "rowan-dust", damage: "frost" }),
  dragonkin: Object.freeze({ sign: "gale", bomb: "icecap-flask", damage: "frost" }),
  construct: Object.freeze({ sign: "gale", bomb: "liquid-fire", damage: "nature" }),
  ooze: Object.freeze({ sign: "ember", bomb: "icecap-flask", damage: "frost" })
});

/** The weakness row for a type, or null. */
export function weaknessOf(type) {
  return WEAKNESS[cleanType(type) ?? ""] ?? null;
}

/**
 * **THE TOME'S BANE ON A CREATURE'S RESILIENCE TEST**: 1 where the creature's type is one the Witch
 * Hunter knows and its row names this Sign or this bomb, else 0. `source` is `{sign}` (a Sign's key) or
 * `{bomb}` (a bomb's identifier). The Bane rides the Resist record the feature card and the bomb write.
 *
 * @param {{type?: string|null, known?: Iterable<string>, source?: {sign?: string, bomb?: string}}} o
 * @returns {number}
 */
export function weaknessBane({ type = null, known = [], source = {} } = {}) {
  const t = cleanType(type);
  if (!t || !asList(known).map(cleanType).includes(t)) return 0;
  const row = WEAKNESS[t];
  if (source?.sign && row.sign === source.sign) return 1;
  if (source?.bomb && row.bomb === source.bomb) return 1;
  return 0;
}

/* ------------------------------------------------------------------ */
/*  Knowing a type                                                      */
/* ------------------------------------------------------------------ */

/** 05 §3's Hard row, by tier: *a Hard Test at your tier*. `tome.test.mjs` reads it off 05. */
export const HARD_DC = Object.freeze({ 1: 15, 2: 19, 3: 23, 4: 27 });

/** The DC of the Tome's learning Test: 05 §3's Hard column at the Witch Hunter's tier. */
export function learnDC(tier) {
  return HARD_DC[tierOf(tier)];
}

/** The skill both the Tome's learning Test and Read the Trail roll. */
export const TOME_SKILL = "investigation";

/**
 * **THE TYPES A REST MAY TEACH**: the types of the creatures the Witch Hunter damaged in a fight since
 * the last learning chance, less the types already known, once each and sorted.
 *
 * @param {{damaged?: Iterable<string>, known?: Iterable<string>}} o
 * @returns {string[]}
 */
export function learnableTypes({ damaged = [], known = [] } = {}) {
  const have = new Set(asList(known).map(cleanType).filter(Boolean));
  return [...new Set(asList(damaged).map(cleanType).filter(t => t && !have.has(t)))].sort();
}

/**
 * **WHY THE TOME'S LEARNING TEST MAY NOT BE MADE AT THIS REST**, or null where it may. *When you finish a
 * Long Rest after a fight in which you damaged a creature of a type you do not know ... once per Long
 * Rest*; 04's Field Notes at rank 2: *you may also make that Test when you finish a Short Rest*.
 *
 * - `"rest"` - a Short Rest without Field Notes at rank 2;
 * - `"spent"` - the Test was made already since the last Long Rest;
 * - `"nothing"` - no type to learn: nothing was damaged that is not known;
 * - `"known"` - the type named is known already, or is no type.
 *
 * @param {{rest?: "short"|"long", spent?: boolean, damaged?: Iterable<string>, known?: Iterable<string>,
 *   type?: string|null, fieldNotes?: number}} o
 * @returns {"rest"|"spent"|"nothing"|"known"|null}
 */
export function learnRefusal({ rest = "long", spent = false, damaged = [], known = [], type = null, fieldNotes = 0 } = {}) {
  if (rest !== "long" && !(rest === "short" && int(fieldNotes) >= 2)) return "rest";
  if (spent === true) return "spent";
  const open = learnableTypes({ damaged, known });
  if (!open.length) return "nothing";
  if (type !== null && type !== undefined && !open.includes(cleanType(type))) return "known";
  return null;
}

/** *You have a Boon on the **Investigation** Test that the Tome gives you to learn a type* (Field Notes, any rank). */
export function learnBoons(fieldNotes = 0) {
  return int(fieldNotes) >= 1 ? 1 : 0;
}

/**
 * The types known once a type is learned: what was known and the new one, the eight's order, once each.
 * *No limit on knowing types* (P6).
 *
 * @param {Iterable<string>} known
 * @param {string} type
 * @returns {string[]}
 */
export function knownWith(known = [], type = null) {
  const have = new Set([...asList(known), ...asList(type)].map(cleanType).filter(Boolean));
  return CREATURE_TYPES.filter(t => have.has(t));
}

/* ------------------------------------------------------------------ */
/*  Read the Trail                                                      */
/* ------------------------------------------------------------------ */

/** 02 §7's Read the Trail: *Spend 10 minutes ...*, a Standard Test at your tier, the Hard DC to learn. */
export const READ_THE_TRAIL_RULE = Object.freeze({ minutes: 10, skill: TOME_SKILL });

/**
 * **WHAT A READ THE TRAIL RESULT GIVES**: the Standard and Hard DCs at the tier, whether the Test
 * succeeded (05 §2's margin: a total that meets the DC), and whether it may teach the type - an
 * unknown type, and a total that also meets the Hard DC. What the scene reveals is the GM's (D2 §12);
 * which type is taught is the GM's pick on the card.
 *
 * @param {{total?: number, tier?: number, typeKnown?: boolean|null}} o
 *   `typeKnown` null where the GM has not said what left the trail
 * @returns {{standard: number, hard: number, success: boolean, mayLearn: boolean}}
 */
export function readTrailOutcome({ total = 0, tier = 1, typeKnown = null } = {}) {
  const standard = AZEROTH.STANDARD_DC[tierOf(tier)];
  const hard = learnDC(tier);
  const t = int(total);
  const success = t >= standard;
  return { standard, hard, success, mayLearn: success && t >= hard && typeKnown !== true };
}

/* ------------------------------------------------------------------ */
/*  Studied                                                             */
/* ------------------------------------------------------------------ */

/**
 * **HOW MANY TYPES MAY BE STUDIED** (P9): half the Wisdom modifier, rounded down, at least 1; 04's
 * Forewarned adds 1 a rank (*you may choose 1 more per rank*).
 *
 * @param {number} wisMod
 * @param {number} [forewarned]  ranks of Forewarned
 * @returns {number}
 */
export function studiedCount(wisMod = 0, forewarned = 0) {
  return Math.max(1, Math.floor(int(wisMod) / 2)) + Math.max(0, int(forewarned));
}

/**
 * **WHY A STUDIED PICK IS REFUSED**, or null: every type chosen must be known, and no more than the count.
 *
 * @param {{picks?: Iterable<string>, known?: Iterable<string>, count?: number}} o
 * @returns {"unknown"|"tooMany"|null}
 */
export function studiedRefusal({ picks = [], known = [], count = 1 } = {}) {
  const have = new Set(asList(known).map(cleanType).filter(Boolean));
  const chosen = [...new Set(asList(picks).map(cleanType))];
  if (chosen.some(t => !t || !have.has(t))) return "unknown";
  if (chosen.length > Math.max(0, int(count))) return "tooMany";
  return null;
}

/**
 * **THE TYPES THAT ARE STUDIED NOW**: the ones chosen at the last rest, or - while 02's The Last Hunt
 * stands - every type known (*every type you know from the **Tome of Silver and Ash** counts as chosen
 * for **Studied***). Only known types, in the eight's order.
 *
 * @param {{studied?: Iterable<string>, known?: Iterable<string>, lastHunt?: boolean}} o
 * @returns {string[]}
 */
export function studiedTypes({ studied = [], known = [], lastHunt = false } = {}) {
  const have = new Set(asList(known).map(cleanType).filter(Boolean));
  const chosen = lastHunt === true ? have : new Set(asList(studied).map(cleanType).filter(t => t && have.has(t)));
  return CREATURE_TYPES.filter(t => chosen.has(t));
}

/* ------------------------------------------------------------------ */
/*  What a weapon attack gains                                          */
/* ------------------------------------------------------------------ */

/** The Tome's piercing against a known type (P7): 1 Armor Point and 1 Ward of every school. */
export const TOME_PIERCE = Object.freeze({ armor: 1, ward: 1 });

/**
 * **WHAT A WEAPON ATTACK GAINS AGAINST THIS CREATURE**, off its type: against a known type it ignores 1
 * Armor Point and 1 Ward (`penetration`, `wardPierce`); against a Studied type it also deals extra damage
 * equal to the tier and a hit gives 1 more Tempo (`poolExtra.tempo` at the hit door). A type neither known
 * nor studied, or no type, gains nothing.
 *
 * @param {{type?: string|null, known?: Iterable<string>, studied?: Iterable<string>, tier?: number, lastHunt?: boolean}} o
 * @returns {{known: boolean, studied: boolean, penetration: number, wardPierce: number, extraDamage: number, tempo: number}}
 */
export function tomeHitBonus({ type = null, known = [], studied = [], tier = 1, lastHunt = false } = {}) {
  const t = cleanType(type);
  const isKnown = Boolean(t) && asList(known).map(cleanType).includes(t);
  const isStudied = isKnown && studiedTypes({ studied, known, lastHunt }).includes(t);
  return {
    known: isKnown,
    studied: isStudied,
    penetration: isKnown ? TOME_PIERCE.armor : 0,
    wardPierce: isKnown ? TOME_PIERCE.ward : 0,
    extraDamage: isStudied ? tierOf(tier) : 0,
    tempo: isStudied ? 1 : 0
  };
}

/**
 * **STUDIED'S BOON ON A RESILIENCE TEST**: 1 where the ability being resisted belongs to a creature of a
 * Studied type, else 0.
 *
 * @param {{sourceType?: string|null, studied?: Iterable<string>, known?: Iterable<string>, lastHunt?: boolean}} o
 * @returns {number}
 */
export function studiedResistBoon({ sourceType = null, studied = [], known = [], lastHunt = false } = {}) {
  const t = cleanType(sourceType);
  return t && studiedTypes({ studied, known, lastHunt }).includes(t) ? 1 : 0;
}

/**
 * The Tome's Boon on a Test against a known type (*to track it, find it or recall what it can do*): what
 * the Test is FOR is the table's call (D2 §12), so a door draws it as an unticked Situational line.
 */
export const TOME_TEST_BOON = Object.freeze({ boons: 1, purposes: Object.freeze(["track", "find", "recall"]), ticked: false });
