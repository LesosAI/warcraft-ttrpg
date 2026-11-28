/**
 * **TOXICITY AND OVERDOSE** (02 §7's Field Brews; the Witch Hunter plan's R1, R6, P3, P5). Pure: no
 * Foundry imports (CLAUDE.md §3).
 *
 * The lead's calls, verbatim: R1's option text, *Toxicity is a limit on elixirs active at once, read off
 * Constitution, not a third pool*; R6, **"Intelligence. Constitution should be used for toxicity cap."**;
 * P3, **"allow surpassing toxicity limit with a stacking negative per point over"**, then F3 **"-1 on
 * every Test (Recommended)"**; P5, **"a non-witch hunter that drinks them is treated as drinking deadly
 * poison"**, then F7 **"Widow's Draught, but 10 nature damage"**.
 *
 * The draft text, as the approval accepted it:
 *
 * > **Toxicity.** Your Toxicity limit is 1 plus your Constitution modifier, at least 1. That many of your
 * > elixirs may act on you at once. You may drink more: each elixir past your limit is 1 point of
 * > overdose, and you take −1 on every Test for each point. A creature that is not a Witch Hunter and
 * > drinks one of your elixirs gains none of its effect. It makes a Body Resilience Test against your
 * > Spell DC, and on a failure it takes 10 Nature damage at the start of each of its turns for 3 turns.
 *
 * **NOTHING IS STORED.** The count is read off the brews acting on the Witch Hunter (the laid effects the
 * door names by identifier), so the penalty falls the moment an elixir ends and no counter can drift from
 * the effects it counts. A brew counts unless its row says it does not (`witch-hunter-brews.mjs`'s
 * `toxicity`): Silverleaf tonic never counts, an oil or a bomb never acts on the drinker, and 04's
 * Refined Decoctions takes the Decoction out of the count. 04's Seasoned Blood adds 1 to the limit.
 */

import { brewOf } from "./witch-hunter-brews.mjs";
import { emptyTick } from "./ticks.mjs";

const int = v => Math.trunc(Number(v)) || 0;

/** The talents this module's numbers take, by name (04's Wolf). */
export const SEASONED_BLOOD = "Seasoned Blood";
export const REFINED_DECOCTIONS = "Refined Decoctions";

/** *1 plus your Constitution modifier, at least 1.* */
export const TOXICITY_BASE = 1;
export const TOXICITY_MIN = 1;

/** *you take −1 on every Test for each point.* */
export const OVERDOSE_PER_POINT = -1;

/**
 * **THE TOXICITY LIMIT**: 1 plus the Constitution modifier, at least 1, and 1 more with Seasoned Blood
 * (*Your Toxicity limit from **Field Brews** rises by 1*).
 *
 * @param {number} conMod
 * @param {{seasonedBlood?: number}} [o]  ranks of Seasoned Blood
 * @returns {number}
 */
export function toxicityLimit(conMod = 0, { seasonedBlood = 0 } = {}) {
  return Math.max(TOXICITY_MIN, TOXICITY_BASE + int(conMod)) + (int(seasonedBlood) > 0 ? 1 : 0);
}

/**
 * **WHETHER ONE BREW ACTING ON THE WITCH HUNTER COUNTS TOWARD THE LIMIT**: its row's `toxicity`, and a
 * Decoction not while Refined Decoctions is held (*The Decoction you brew with **Decoctions** does not
 * count toward your Toxicity limit*). A brew no row names counts nothing.
 *
 * @param {string|{identifier?: string}} brew
 * @param {{refinedDecoctions?: number}} [o]
 * @returns {boolean}
 */
export function countsToward(brew, { refinedDecoctions = 0 } = {}) {
  const id = typeof brew === "string" ? brew : brew?.identifier ?? null;
  const row = brewOf(id);
  if (!row || row.toxicity !== true) return false;
  if (row.kind === "decoction" && int(refinedDecoctions) > 0) return false;
  return true;
}

/**
 * **WHERE THE WITCH HUNTER'S TOXICITY STANDS**: the brews counted, the limit, the overdose (each counted
 * brew past the limit is 1 point) and the penalty on every Test (−1 a point). Nothing refuses a drink past
 * the limit (P3): the door lays the overdose as an automatic roll-dialog line.
 *
 * @param {{active?: Array<string|{identifier?: string}>, conMod?: number, seasonedBlood?: number, refinedDecoctions?: number}} o
 *   `active` the brews acting on the Witch Hunter, by identifier, one entry each
 * @returns {{counted: string[], used: number, limit: number, overdose: number, penalty: number}}
 */
export function toxicityState({ active = [], conMod = 0, seasonedBlood = 0, refinedDecoctions = 0 } = {}) {
  const counted = (active ?? [])
    .filter(b => countsToward(b, { refinedDecoctions }))
    .map(b => (typeof b === "string" ? b : b.identifier));
  const limit = toxicityLimit(conMod, { seasonedBlood });
  const used = counted.length;
  const overdose = Math.max(0, used - limit);
  return { counted, used, limit, overdose, penalty: overdose === 0 ? 0 : overdose * OVERDOSE_PER_POINT };
}

/**
 * **THE OVERDOSE A DRINK WOULD BRING**, judged before anything is spent so the door can SAY it: the state
 * now and the state with this brew drunk. Never a refusal.
 *
 * @param {string} identifier  the brew about to be drunk
 * @param {Parameters<typeof toxicityState>[0]} state
 * @returns {{before: ReturnType<typeof toxicityState>, after: ReturnType<typeof toxicityState>, rises: boolean}}
 */
export function drinkPreview(identifier, state = {}) {
  const before = toxicityState(state);
  const after = toxicityState({ ...state, active: [...(state.active ?? []), identifier] });
  return { before, after, rises: after.overdose > before.overdose };
}

/* ------------------------------------------------------------------ */
/*  A drinker who is not a Witch Hunter                                */
/* ------------------------------------------------------------------ */

/** *10 Nature damage at the start of each of its turns for 3 turns* (F7: Widow's draught, at 10 Nature). */
export const NON_MAKER_TICK = Object.freeze({ amount: 10, type: "nature", rounds: 3 });

/** The Resilience it Tests (*a Body Resilience Test against your Spell DC*). */
export const NON_MAKER_RESILIENCE = "body";

/**
 * **WHAT A NON-WITCH HUNTER'S DRINK DOES**: none of the elixir's effect, and a Body Resilience Test against
 * the maker's Spell DC whose failure lays a tick (`ticks.mjs`'s shape, the carrier D-770 lays). Only a
 * DRINK: an oil or a bomb works in anyone's hands (P5's MY READING, accepted). Null where the brew is no
 * elixir or Decoction, or the drinker is a Witch Hunter.
 *
 * @param {{identifier?: string, witchHunter?: boolean, spellDC?: number|null}} o
 *   `witchHunter` whether the drinker holds the class; `spellDC` the MAKER's
 * @returns {{effect: false, test: {resilience: string, dc: number|null}, onFail: {tick: object}}|null}
 */
export function nonMakerDrink({ identifier = null, witchHunter = false, spellDC = null } = {}) {
  const row = brewOf(identifier);
  if (!row || !["elixir", "decoction"].includes(row.kind) || witchHunter === true) return null;
  const dc = spellDC === null || spellDC === undefined || !Number.isFinite(Number(spellDC)) ? null : Math.trunc(Number(spellDC));
  return {
    effect: false,
    test: { resilience: NON_MAKER_RESILIENCE, dc },
    onFail: {
      tick: { ...emptyTick(), kind: "damage", type: NON_MAKER_TICK.type, amount: String(NON_MAKER_TICK.amount), rounds: NON_MAKER_TICK.rounds, when: "startOfTurn" }
    }
  };
}
