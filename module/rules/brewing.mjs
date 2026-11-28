/**
 * **BREWING: DOSES, FORMULAS KNOWN, SPOILING AND DECOCTIONS** (02 §7's Field Brews and Decoctions; the
 * Witch Hunter plan's R3, P4, P13, T1 and the Phase 0 answer on formulas). Pure: no Foundry imports
 * (CLAUDE.md §3).
 *
 * The lead's calls, verbatim: R3, **"New loadout each rest (Recommended)"** (*brew at the end of a Short
 * or Long Rest, doses shared among the formulas you know, unused doses spoil at your next brew, brews take
 * no bag slot*); P4, **"scale off wisdom modifier"**, then F2 **"2 + Wisdom modifier"** (MY READING: at
 * least 2); the Phase 0 answer, **"Field Brews should also teach 1 oil and 1 bomb of the players choosing.
 * 1 more for each tier"**; P13, *"You may be under the effect of only one Decoction at a time."*; T1, on
 * Second Brewing, **"rephrase to replenish doses on currently brewed potions and decoctions"**.
 *
 * The draft text the approval accepted:
 *
 * > **Field Brews.** ... You know four elixirs from **08-EQUIPMENT**, *Witch hunter's brews*, and two more
 * > each time you reach a new tier. You also know one oil and one bomb of your choice from the same list,
 * > and one more oil and one more bomb each time you reach a new tier. When you finish a Short or Long
 * > Rest, you may brew doses equal to 2 plus your Wisdom modifier, at least 2, shared among the elixirs,
 * > oils and bombs you know. Any brew left from your last brewing spoils. Brews take no bag slot.
 *
 * > **Decoctions.** When you brew with **Field Brews**, one dose may be a **Decoction** for a type you know
 * > from the **Tome of Silver and Ash**, if you defeated a creature of that type since your last Long Rest.
 * > A Decoction acts on you until your next Long Rest and counts toward your Toxicity limit from **Field
 * > Brews**. You may be under the effect of only one Decoction at a time.
 *
 * **KNOWN BY TIER** (the brief, off the Phase 0 answer): elixirs 4, 6, 8, 10; oils 1, 2, 3, 3; bombs 1, 2,
 * 3, 4 at tiers 1 to 4. There are three oils, so the fourth tier's *one more oil* has none left to give.
 */

import { BREW_IDENTIFIERS, brewOf, brewsOfKind, isBrewIdentifier } from "./witch-hunter-brews.mjs";
import { cleanType } from "./tome.mjs";

const int = v => Math.trunc(Number(v)) || 0;
const tierOf = t => Math.min(4, Math.max(1, int(t) || 1));

/** The feature names, as 02 §7 heads them. */
export const FIELD_BREWS = "Field Brews";
export const DECOCTIONS = "Decoctions";

/** 04's Wolf talents that move these numbers, by name. */
export const EXTRA_MEASURE = "Extra Measure";
export const SECOND_BREWING = "Second Brewing";

/** *doses equal to 2 plus your Wisdom modifier, at least 2* (F2). */
export const DOSE_BASE = 2;
export const DOSE_MIN = 2;

/** The formulas known by tier, index 0 for tier 1. */
export const KNOWN_BY_TIER = Object.freeze({
  elixir: Object.freeze([4, 6, 8, 10]),
  oil: Object.freeze([1, 2, 3, 3]),
  bomb: Object.freeze([1, 2, 3, 4])
});

/** The kinds a formula is learned in (the Decoction is brewed through Decoctions, never learned). */
export const FORMULA_KINDS = Object.freeze(["elixir", "oil", "bomb"]);

/** *one dose may be a Decoction* - the Decoction doses one brewing may hold. */
export const DECOCTION_DOSES = 1;

/** *only one Decoction at a time*; 04's Refined Decoctions at rank 2, *two Decoctions at a time*. */
export function decoctionLimit(refinedDecoctions = 0) {
  return int(refinedDecoctions) >= 2 ? 2 : 1;
}

/**
 * **THE DOSES A BREWING MAKES**: 2 plus the Wisdom modifier, at least 2, and 1 more a rank of 04's Extra
 * Measure (*you brew 1 more dose per rank*).
 *
 * @param {number} wisMod
 * @param {{extraMeasure?: number}} [o]
 * @returns {number}
 */
export function dosesFor(wisMod = 0, { extraMeasure = 0 } = {}) {
  return Math.max(DOSE_MIN, DOSE_BASE + int(wisMod)) + Math.max(0, int(extraMeasure));
}

/** How many formulas of one kind a Witch Hunter of this tier knows; 0 for a kind no formula is learned in. */
export function knownCount(kind, tier = 1) {
  return KNOWN_BY_TIER[kind]?.[tierOf(tier) - 1] ?? 0;
}

/**
 * **WHY A SET OF FORMULAS KNOWN IS REFUSED**, or null: every identifier a brew of the kind it is filed under,
 * and no more of a kind than the tier allows. The creator's and the level-up's pick ask it.
 *
 * @param {{known?: string[], tier?: number}} o
 * @returns {{code: "notBrew"|"decoction"|"tooMany", kind?: string, identifier?: string}|null}
 */
export function knownRefusal({ known = [], tier = 1 } = {}) {
  for (const id of known ?? []) {
    if (!isBrewIdentifier(id)) return { code: "notBrew", identifier: id };
    if (brewOf(id).kind === "decoction") return { code: "decoction", identifier: id };
  }
  for (const kind of FORMULA_KINDS) {
    const n = new Set((known ?? []).filter(id => brewOf(id)?.kind === kind)).size;
    if (n > knownCount(kind, tier)) return { code: "tooMany", kind };
  }
  return null;
}

/**
 * **WHY A DECOCTION MAY NOT BE BREWED FOR THIS TYPE**, or null: the feature is held, the type is one the
 * Witch Hunter knows, and a creature of that type was defeated since the last Long Rest.
 *
 * @param {{type?: string|null, known?: string[], defeated?: string[], held?: boolean}} o
 *   `held` whether the Witch Hunter holds Decoctions (level 14)
 * @returns {"feature"|"type"|"unknown"|"undefeated"|null}
 */
export function decoctionRefusal({ type = null, known = [], defeated = [], held = true } = {}) {
  if (held !== true) return "feature";
  const t = cleanType(type);
  if (!t) return "type";
  if (!(known ?? []).map(cleanType).includes(t)) return "unknown";
  if (!(defeated ?? []).map(cleanType).includes(t)) return "undefeated";
  return null;
}

/**
 * **WHY A BREWING IS REFUSED, OR WHAT IT MAKES AND WHAT SPOILS** - the whole judgement, made before anything
 * is created (D-768's order), so the Prepare dialog can say every reason and the door can create the new
 * brews FIRST and delete the spoiled ones after (D-745: a duplicate is curable, a loss is not).
 *
 * `picks` is the dialog's steppers: `{[identifier]: doses}`, with `decoction` for the Decoction dose,
 * `decoctionType` its type, and `oilType` the type the Hunter's oil names. `held` is every brew the
 * Witch Hunter holds now, by item id and identifier: everything left from the last brewing spoils.
 *
 * Refusals, each said in words by the door (`code`):
 * - `notKnown` - a formula not among those known;
 * - `tooMany` - more doses than the brewing makes;
 * - `decoction` - a Decoction dose the rules refuse (`reason` is `decoctionRefusal`'s), or more than one;
 * - `oilType` - a Hunter's oil brewed with no type named, or a type not known.
 *
 * @param {{picks?: Record<string, number>, known?: string[], doses?: number, tome?: string[], defeated?: string[],
 *   decoctionHeld?: boolean, decoctionType?: string|null, oilType?: string|null,
 *   held?: Array<{id: string, identifier: string}>}} o
 * @returns {{refusal: {code: string, identifier?: string, reason?: string}|null, make: Array<{identifier: string, doses: number, type?: string|null}>, spoil: string[], used: number, doses: number}}
 */
export function brewPlan({ picks = {}, known = [], doses = DOSE_MIN, tome = [], defeated = [], decoctionHeld = false, decoctionType = null, oilType = null, held = [] } = {}) {
  const knownSet = new Set(known ?? []);
  const make = [];
  let used = 0;
  const refuse = refusal => ({ refusal, make: [], spoil: [], used, doses });
  // 08's order, so the plan a person reads never wobbles.
  for (const id of BREW_IDENTIFIERS) {
    const n = Math.max(0, int(picks?.[id]));
    if (!n) continue;
    const row = brewOf(id);
    if (row.kind === "decoction") {
      if (n > DECOCTION_DOSES) return refuse({ code: "decoction", identifier: id, reason: "doses" });
      const why = decoctionRefusal({ type: decoctionType, known: tome, defeated, held: decoctionHeld });
      if (why) return refuse({ code: "decoction", identifier: id, reason: why });
      make.push({ identifier: id, doses: n, type: cleanType(decoctionType) });
    } else {
      if (!knownSet.has(id)) return refuse({ code: "notKnown", identifier: id });
      if (id === "hunters-oil") {
        const t = cleanType(oilType);
        if (!t || !(tome ?? []).map(cleanType).includes(t)) return refuse({ code: "oilType", identifier: id });
        make.push({ identifier: id, doses: n, type: t });
      } else {
        make.push({ identifier: id, doses: n });
      }
    }
    used += n;
  }
  for (const key of Object.keys(picks ?? {})) {
    if (!isBrewIdentifier(key) && int(picks[key]) > 0) return refuse({ code: "notKnown", identifier: key });
  }
  if (used > Math.max(0, int(doses))) return refuse({ code: "tooMany" });
  const spoil = (held ?? []).filter(h => h && isBrewIdentifier(h.identifier)).map(h => h.id).filter(Boolean).sort();
  return { refusal: null, make, spoil, used, doses };
}

/**
 * **WHY ONE MORE DECOCTION MAY NOT BE DRUNK**, or null: the Decoctions acting on the Witch Hunter already
 * reach the limit (*only one Decoction at a time*; two with Refined Decoctions at rank 2).
 *
 * @param {{active?: number, refinedDecoctions?: number}} o  `active` the Decoctions acting now
 * @returns {"decoctionLimit"|null}
 */
export function decoctionDrinkRefusal({ active = 0, refinedDecoctions = 0 } = {}) {
  return Math.max(0, int(active)) >= decoctionLimit(refinedDecoctions) ? "decoctionLimit" : null;
}

/**
 * **WHAT SECOND BREWING RESTORES** (T1's reading, accepted: *each elixir and Decoction you brewed with
 * **Field Brews** at your last rest returns to the number of doses you brewed*; MY READING: oils and bombs
 * are not replenished). `brewed` is each held brew with the doses it was brewed with and the doses left;
 * the answer is every elixir and Decoction below its brewed count, with the count it returns to.
 *
 * @param {Array<{id: string, identifier: string, brewed?: number, left?: number}>} brewed
 * @returns {Array<{id: string, identifier: string, from: number, to: number}>}
 */
export function secondBrewingPlan(brewed = []) {
  return (brewed ?? [])
    .filter(b => b && ["elixir", "decoction"].includes(brewOf(b.identifier)?.kind))
    .map(b => ({ id: b.id, identifier: b.identifier, from: Math.max(0, int(b.left)), to: Math.max(0, int(b.brewed)) }))
    .filter(b => b.to > b.from)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/** The elixirs, oils and bombs one may know, 08's order (the creator's and level-up's list). */
export function formulaChoices() {
  return Object.freeze(Object.fromEntries(FORMULA_KINDS.map(kind => [kind, brewsOfKind(kind)])));
}

/**
 * **A BOMB THROWN PAST ITS REACH** (08 §12's header: *Bomb: thrown at a point within 30 feet. Each creature in a 10 ft
 * radius centered on that point makes a Reflex Resilience Test*; 04's Wide Blast, *land 10 feet farther away per rank,
 * and their radius grows by 5 feet per rank*, already in the stamp's `range` and `radius`; O-728, wave 2c). The door
 * names creatures, not a point, so a creature is out of the throw's reach only where no point within `range` could
 * catch it in a `radius` blast: farther than `range + radius`, footprint to footprint (MY READING). A creature not
 * measured (no token on the scene) is never refused (D-669, D-2070). Answers the first creature too far, in the order
 * handed in, or null.
 *
 * @param {{feet?: Array<number|null>, range?: number, radius?: number}} o  `feet` one distance per creature named
 * @returns {{index: number, feet: number, reach: number}|null}
 */
export function bombThrowRefusal({ feet = [], range = 30, radius = 10 } = {}) {
  const reach = Math.max(0, int(range)) + Math.max(0, int(radius));
  for (const [index, f] of (feet ?? []).entries()) {
    if (f === null || f === undefined || !Number.isFinite(Number(f))) continue;
    if (Number(f) > reach) return { index, feet: Number(f), reach };
  }
  return null;
}
