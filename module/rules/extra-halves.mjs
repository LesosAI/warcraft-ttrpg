/**
 * **A HALF-ACTION GIVEN FOR A CREATURE'S NEXT TURN** (02's Bloodlust: *Up to 6 targets
 * within 30 feet gain an extra Half-Action on their next turn*; 04's Hasten: *One ally
 * within 30 feet gains a Half-Action on its next turn*). Pure: no Foundry imports
 * (CLAUDE.md §3).
 *
 * ONE door for both (the lead, 2026-11-08, on Bloodlust: *"Fix it now"*): an Active
 * Effect on the creature carries `flags.azeroth-rpg.hastened` - `{by, source, halves,
 * combat}` - until its next turn starts, when `effects/chromatic-flights.mjs#takeHastened`
 * gives what `hastenedHalves` adds up through the combatant's own queued door and deletes
 * the effects. Hasten had built the door; Bloodlust laid nothing at all.
 */

/**
 * **WHAT A CREATURE'S NEXT TURN IS GIVEN**, off the records its effects carry: one record a
 * giver and a source - the same giver's second Hasten or second Bloodlust replaces its
 * first where it is laid, and two left standing are counted once here - and the records of
 * different sources ADDED. Hasten and a Bloodlust on one creature give it two (MY READING of
 * the words, each saying *gain a Half-Action*; asked of the lead, pinned in the Vitest).
 *
 * @param {Array<{by?: string|null, source?: string, halves?: number}|null>} records
 * @returns {number}
 */
export function hastenedHalves(records = []) {
  const seen = new Set();
  let n = 0;
  for (const r of records ?? []) {
    if (!r || typeof r !== "object") continue;
    const key = `${r.by ?? ""}|${r.source ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    n += Math.max(1, Math.trunc(Number(r.halves)) || 1);
  }
  return n;
}

/** 02's Bloodlust, as its row reads it: the reach and how many it gives a Half-Action. */
export const BLOODLUST = Object.freeze({ feature: "Bloodlust", feet: 30, max: 6 });

/**
 * **WHOM A BLOODLUST REACHES, JUDGED BEFORE ANYTHING IS PAID** (02: *Up to 6 targets within
 * 30 feet gain an extra Half-Action on their next turn*): at least one creature targeted and
 * no more than six (counted by creature, so two tokens of one actor are one target); each
 * within the feet where both stand on the board (nothing measured is never refused, the
 * system's rule where a token is not on the scene); and each in the shaman's started fight,
 * since *their next turn* is a turn of a fight. *Targets* is 02's word, so a target need
 * not be an ally, and the shaman may name itself (the lead's general rule: the caster
 * counts unless the words say otherwise; MY READING). Answers the first refusal, with the
 * target it names, or null.
 *
 * @param {{targets?: Array<{uuid: string, name?: string, feet?: number|null, inFight?: boolean}>, inFight?: boolean,
 *   max?: number, feet?: number}} o
 * @returns {{key: string, name?: string}|null}
 */
export function bloodlustRefusal({ targets = [], inFight = false, max = BLOODLUST.max, feet = BLOODLUST.feet } = {}) {
  const list = (targets ?? []).filter((t, i, all) => t?.uuid && all.findIndex(x => x?.uuid === t.uuid) === i);
  if (!list.length) return { key: "AZEROTH.Bloodlust.NoTargets" };
  if (list.length > max) return { key: "AZEROTH.Bloodlust.TooMany" };
  if (!inFight) return { key: "AZEROTH.Bloodlust.NoFight", name: list[0].name ?? "" };
  const far = list.find(t => t.feet !== null && t.feet !== undefined && Number(t.feet) > feet);
  if (far) return { key: "AZEROTH.Bloodlust.TooFar", name: far.name ?? "" };
  const out = list.find(t => t.inFight !== true);
  if (out) return { key: "AZEROTH.Bloodlust.NoFight", name: out.name ?? "" };
  return null;
}
