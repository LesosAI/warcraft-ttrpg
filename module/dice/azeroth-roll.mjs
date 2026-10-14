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

import { computeSL, forcedOutcome, forcedSlOf, netAdvantage, resolveTest, testFormula } from "../rules/resolution.mjs";

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
    flavor = ""
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

    return new this(formula, rollData, {
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
    if (!this._evaluated || this.natural === null) return null;
    return this.outcome.sl;
  }

  /** The full outcome: total, SL, success, and whether it was a 20 or a 1. */
  get outcome() {
    if (!this._evaluated || this.natural === null) return null;
    // 04's Trueshot (D-773): a hit at a set SL, without a roll - carried on the
    // options so the card read back off its message says the same.
    const forced = forcedSlOf(this.options);
    if (forced !== null) return forcedOutcome({ sl: forced, total: this.total, natural: this.natural });
    return resolveTest({
      natural: this.natural,
      modifier: this.total - this.natural,
      dc: this.dc ?? 10,
      // Keen's wider Critical Injury (08 §5), carried on the options.
      criticalOn: this.options.criticalOn ?? 20
    });
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
