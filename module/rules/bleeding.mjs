/**
 * **BLEEDING FROM ONE TALENT REFRESHES; FROM TWO IT ADDS** (the class talent audit's R8, the
 * lead's *"All other propsals are approved"*; D-1866). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * A1 says Bleeding's *values from separate sources add together*. The landing door wrote the
 * newest value over the condition's one `value`, so Mangle twice a round, Rip beside Mangle and
 * Rupture beside Garrote each left only the last number - and nothing told one source from two.
 * Under D-711 a Druid affords Mangle twice a round, so the audit made the reading general (C8):
 *
 * - a Bleeding laid again by the SAME source **refreshes** - A1 as D-1848 prints it: *Bleeding
 *   laid again by the same source does not add, and you keep the higher of the two values*;
 * - a Bleeding laid by a DIFFERENT source **adds** - the condition's value is the sum.
 *
 * The condition's own effect carries the layers as `flags.azeroth-rpg.bleedSources`, a map of
 * source to value, and its `value` is their sum - which every reader of Bleeding already takes
 * (`turn-effects.mjs#bleedTick`, the cures, the Sovereign's scent). A source is what laid it: a
 * rider's talent identifier, a Finisher's, a spell's name. A Bleeding laid with no source (a
 * hand, a creature's ability) goes into the one `unsourced` layer and ADDS to it - two unsourced
 * Bleedings are two sources nobody named, and A1 adds separate sources (the wave 1 review).
 */

/** The effect flag the layers ride (R8). */
export const BLEED_SOURCES_FLAG = "bleedSources";

/** The landing mark that names a Bleeding's source (`effects/inflict.mjs#inflictCondition`'s `marks`). */
export const BLEED_SOURCE_MARK = "bleedSource";

/** The layer a Bleeding laid with no source joins (a hand, an ability that names nobody). */
export const UNSOURCED = "unsourced";

const whole = v => Math.max(0, Math.trunc(Number(v)) || 0);

/**
 * The layers a Bleeding effect holds, cleaned: its map, or - for an effect laid before R8 - its one
 * value under `UNSOURCED`. A layer of 0 is dropped.
 *
 * @param {{bleedSources?: object, value?: number}|null} flags  the effect's `flags["azeroth-rpg"]`
 * @returns {Record<string, number>}
 */
export function bleedLayers(flags) {
  const map = flags?.[BLEED_SOURCES_FLAG];
  const out = {};
  if (map && typeof map === "object" && !Array.isArray(map)) {
    for (const [k, v] of Object.entries(map)) if (whole(v) > 0) out[String(k)] = whole(v);
    return out;
  }
  const v = whole(flags?.value);
  if (v > 0) out[UNSOURCED] = v;
  return out;
}

/**
 * The layers after one more Bleeding lands: its own source's layer the higher of what it held and
 * the new value (a refresh, A1's *keep the higher of the two values*), every other source's kept
 * (so they add).
 *
 * @param {Record<string, number>} layers  `bleedLayers`'
 * @param {{source?: string|null, value?: number}} o
 * @returns {Record<string, number>}
 */
export function bleedLayered(layers = {}, { source = UNSOURCED, value = 1 } = {}) {
  const key = typeof source === "string" && source ? source : UNSOURCED;
  const out = { ...(layers ?? {}) };
  // A named source keeps the higher of its two values; the unsourced layer adds (the wave 1 review).
  const v = key === UNSOURCED ? whole(value) + whole(out[key]) : Math.max(whole(value), whole(out[key]));
  if (v > 0) out[key] = v;
  else delete out[key];
  // Sorted, so the stored map is the same whatever order the layers landed in.
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * **THE LAYERS HELD TO WHAT THE CONDITION STILL CARRIES** (the wave 1 review): a cure that lowers
 * the value (`cures.mjs`, `cure-poison.mjs#cureBleedingPlan`, 07's Sovereign spells) or a withdrawn
 * hit writes `value` and leaves the map alone, so the map can hold more than the creature still
 * bleeds. Before a new layer lands, the map is trimmed until its sum equals the stored value -
 * the unsourced layer first, then the largest, a tie by key - so no removed amount comes back.
 * A stored value higher than the map (a GM's hand) is the unsourced layer's difference.
 *
 * @param {Record<string, number>} layers
 * @param {number|null} stored  the condition's `value` as it stands before this landing
 * @returns {Record<string, number>}
 */
export function bleedReconciled(layers = {}, stored = null) {
  const out = {};
  for (const [k, v] of Object.entries(layers ?? {})) if (whole(v) > 0) out[k] = whole(v);
  if (stored === null || stored === undefined) return out;
  const target = whole(stored);
  let over = bleedTotal(out) - target;
  if (over < 0) {
    out[UNSOURCED] = whole(out[UNSOURCED]) - over;
    return out;
  }
  const order = () => Object.keys(out).sort((a, b) => (a === UNSOURCED ? -1 : b === UNSOURCED ? 1 : (out[b] - out[a]) || a.localeCompare(b)));
  while (over > 0) {
    const key = order()[0];
    const take = Math.min(over, out[key]);
    out[key] -= take;
    over -= take;
    if (out[key] <= 0) delete out[key];
  }
  return out;
}

/**
 * The landing mark that names a Bleeding's source, for `inflictCondition`'s `marks`: `{}` where no
 * source is given, so the landing treats it as unsourced.
 *
 * @param {string|null} source  a talent's identifier, a Finisher's, a spell's name
 * @returns {Record<string, {source: string}>}
 */
export function bleedSourceMark(source) {
  return typeof source === "string" && source ? { [BLEED_SOURCE_MARK]: { source } } : {};
}

/**
 * The Bleeding value the layers come to (A1's sum).
 *
 * @param {Record<string, number>} layers
 * @returns {number}
 */
export function bleedTotal(layers = {}) {
  return Object.values(layers ?? {}).reduce((n, v) => n + whole(v), 0);
}
