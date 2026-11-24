/**
 * AzerothRoll — a Roll that remembers why its number was what it was.
 *
 * D11 §5: "The provenance line is not decoration. A card says *why* the number
 * was what it was — d20, attribute, proficiency, rank, called-shot penalty,
 * Momentum spent." That is carried here on `options` so the chat card can
 * render it without recomputing anything.
 *
 * The arithmetic is NOT here. `rules/resolution.mjs` decides the dice shape and
 * the outcome, and `rules/mitigation.mjs` decides the damage; this class is the
 * Foundry wrapper around them, so the sheet, the card and the roll cannot
 * disagree (CLAUDE.md §7).
 *
 * ALL EVALUATION IS ASYNC. `await roll.evaluate()`; there is no sync path worth
 * using on V14.
 */

import { computeSL, forcedOutcome, forcedSlOf, netAdvantage, resolveAdjusted, resolveTest, testFormula } from "../rules/resolution.mjs";
// A read scroll's Test is the writer's total, with no die (08 §14; D-1436).
import { writtenOutcome } from "../rules/scrolls.mjs";
// Well Fed's +1 SL, added AFTER the SL is worked out and never to the margin (D-1922).
import { withWellFed } from "../rules/well-fed.mjs";
// The roller's Well Fed line, read where the roll is built (the review's M7).
import { wellFedRow } from "./well-fed-row.mjs";

export class AzerothRoll extends Roll {
  /**
   * Build a Test roll.
   *
   * @param {object} o
   * @param {number} [o.dc]            The target number.
   * @param {Array<{label: string, value: number}>} [o.modifiers]
   *        Every part of the modifier, in the order it should be read out.
   * @param {number} [o.boons]
   * @param {number} [o.banes]
   * @param {string} [o.kind]          skill | attack | casting | resilience
   * @param {string} [o.location]      body | head | limb, for an attack.
   * @param {object} [o.rollData]      Actor roll data for formula resolution.
   * @param {Actor|null} o.roller        WHO MAKES THE TEST - required by the census, null for none.
   * @param {string[]|null} [o.chosen]   the roll dialog's ticked line ids; null where no dialog
   *        opened, which takes every automatic line (a skipped dialog's own rule).
   * @returns {AzerothRoll}
   */
  static build({
    dc = 10,
    modifiers = [],
    boons = 0,
    banes = 0,
    kind = "skill",
    location = null,
    rollData = {},
    flavor = "",
    roller = null,
    chosen = null
  } = {}) {
    const net = netAdvantage(boons, banes);
    const dice = testFormula(boons, banes);

    // Only non-zero parts reach the formula; every part reaches the
    // provenance, because "+0 from Rank" is worth seeing on the card.
    const terms = modifiers
      .filter(m => Number(m.value) !== 0)
      .map(m => (m.value < 0 ? `- ${Math.abs(m.value)}` : `+ ${m.value}`));

    const formula = [dice, ...terms].join(" ");
    const total = modifiers.reduce((sum, m) => sum + (Number(m.value) || 0), 0);

    const roll = new this(formula, rollData, {
      azeroth: true,
      kind,
      dc,
      location,
      boons,
      banes,
      net,
      modifier: total,
      provenance: [
        { label: "AZEROTH.Roll.Die", value: null, formula: dice },
        ...modifiers
      ],
      flavor
    });
    // **WELL FED: +1 SL ON EVERY TEST, AT THE ONE ROLL BUILDER** (D-1922; the review's M7). The
    // dialog draws the ticked line on every Test it opens, and 05 §16 says *every Test you make*,
    // but only `rollTest` and the profession doors set `options.wellFed`, so a Casting Test, a
    // Medicine Test, an Identify Test and every Resilience Test built elsewhere showed the line and
    // left it out. The roller is read HERE, so no door can show it and drop it;
    // `azeroth-roll-census.test.mjs` fails any `AzerothRoll.build` that names no `roller`.
    // `AzerothRoll#outcome` adds it after the SL and never to the margin.
    const fed = roller ? wellFedRow(roller, chosen) : null;
    if (fed) {
      roll.options.wellFed = fed.sl;
      roll.options.provenance.push(fed.row);
    }
    return roll;
  }

  /**
   * **A TEST WITH NO DIE: THE WRITER'S TOTAL ON A SCROLL** (08 §14: *A scroll casts at the
   * writer's Casting Test, not yours*; D-1436). The formula is the constant, so `total` is the
   * total and `dice` is empty; `options.written` is what tells `outcome` to read the margin
   * through `rules/scrolls.mjs#writtenOutcome` - the one route to the SL - rather than look for a
   * natural face it does not have. No Boon, Bane or modifier reaches it: it is not the reader's
   * Test.
   *
   * @param {{total: number, dc?: number, kind?: string, flavor?: string}} o
   * @returns {AzerothRoll}
   */
  static written({ total = 0, dc = 10, kind = "casting", flavor = "" } = {}) {
    const fixed = Math.max(0, Math.trunc(Number(total)) || 0);
    return new this(String(fixed), {}, {
      azeroth: true,
      kind,
      dc,
      location: null,
      boons: 0,
      banes: 0,
      net: 0,
      modifier: 0,
      written: { total: fixed },
      provenance: [{ label: "AZEROTH.Scroll.WrittenRow", value: null, formula: String(fixed) }],
      flavor
    });
  }

  /* -------------------------------------------- */

  /** The kept d20 face — the natural roll for every purpose (05 §4). */
  get natural() {
    const die = this.dice.find(d => d.faces === 20);
    return die?.total ?? null;
  }

  /** Every d20 face rolled, kept and discarded, for the card to show. */
  get faces() {
    const die = this.dice.find(d => d.faces === 20);
    return (die?.results ?? []).map(r => ({ value: r.result, kept: r.active !== false }));
  }

  get dc() {
    return this.options.dc ?? null;
  }

  get location() {
    return this.options.location ?? null;
  }

  get provenance() {
    return this.options.provenance ?? [];
  }

  /**
   * The Success Level, with the natural 20 and natural 1 rules applied.
   * Null until the roll is evaluated.
   */
  get successLevel() {
    if (!this._evaluated) return null;
    if (this.natural === null && !this.options?.written) return null;
    return this.outcome.sl;
  }

  /** The full outcome: total, SL, success, and whether it was a 20 or a 1. */
  get outcome() {
    if (!this._evaluated) return null;
    // A read scroll (08 §14): the writer's total, no natural face, forced SL and miss honoured.
    if (this.options?.written) {
      return writtenOutcome({ total: this.total, dc: this.dc ?? 10, forcedSl: forcedSlOf(this.options), forcedMiss: this.options.forcedMiss === true });
    }
    if (this.natural === null) return null;
    // 04's Trueshot (D-773): a hit at a set SL, without a roll - carried on the
    // options so the card read back off its message says the same.
    const forced = forcedSlOf(this.options);
    if (forced !== null) return forcedOutcome({ sl: forced, total: this.total, natural: this.natural });
    // 14's Shadow Step, Step Aside and Gyth Takes the Air (D-809): *the next attack
    // against him this round misses*, whatever the die - carried on the options so the
    // card read back off its message says the same.
    // **WELL FED** (D-1922): `options.wellFed` is the roller's ticked line, set by the door
    // before the die. The SL rises by one after it is worked out; success is still read off
    // the margin, so a failure stays a failure (`rules/well-fed.mjs#withWellFed`). Carried on
    // the options, so a card read back off its message says the same.
    const fed = { fed: Number(this.options?.wellFed) > 0 };
    // **A CRAFT OR A GATHERING TEST READS THE ADJUSTED TOTAL ALONE** (D-1980; the lead: *"nat 1 -
    // adjust rolls matter, not crit fails"*): no natural 20 always succeeds and no natural 1
    // always fails. `options.adjusted` is set by the profession doors; every other Test keeps
    // 05 section 1's rule below.
    if (this.options?.adjusted === true) {
      return withWellFed(resolveAdjusted({ natural: this.natural, modifier: this.total - this.natural, dc: this.dc ?? 10 }), fed);
    }
    if (this.options?.forcedMiss) {
      const base = resolveTest({ natural: this.natural, modifier: this.total - this.natural, dc: this.dc ?? 10, criticalOn: this.options.criticalOn ?? 20 });
      return withWellFed({ ...base, success: false, sl: Math.min(base.sl ?? 0, -1), critical: false, forcedMiss: true }, fed);
    }
    return withWellFed(resolveTest({
      natural: this.natural,
      modifier: this.total - this.natural,
      dc: this.dc ?? 10,
      // Keen's wider Critical Injury (08 §5), carried on the options.
      criticalOn: this.options.criticalOn ?? 20
    }), fed);
  }

  /** A natural 20 — normal damage plus a Critical Injury (06 §1). */
  get isCritical() {
    return this.outcome?.critical === true;
  }

  /** A natural 1 — a miss regardless (06 §1). */
  get isFumble() {
    return this.outcome?.fumble === true;
  }

  /**
   * The Success Level ignoring the natural-20 floor, which is what a caster
   * needs when Ward has already eaten into it (D-300).
   */
  get rawSuccessLevel() {
    if (!this._evaluated) return null;
    return computeSL(this.total, this.dc ?? 10);
  }
}

/** Register the roll class so `Roll.create` and chat deserialization use it. */
export function registerRoll() {
  CONFIG.Dice.rolls.unshift(AzerothRoll);
}
