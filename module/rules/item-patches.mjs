/**
 * **A WORN OR HELD ITEM PATCHES A CLASS FEATURE AS A TAKEN TALENT DOES** (08 §20's class
 * items; CLASS-ITEMS-AND-ENCHANTS-2026-11 phase 3, D-2156 to D-2162).
 *
 * 04 says what a talent does to one of 02's class features in a `mod(feature, patch)` row,
 * and each feature's door reads those rows through ONE reader,
 * `class-talents.mjs#patchRowsOf` (D-773 to D-775). An item that moves a feature's number -
 * Oathbreaker's Plate on **Death Strike**, the Darkfallen Choker on **Royal Due**, the
 * Blindfold of the Illidari on **Spectral Sight**, Heart of the Brood on **Breath**, the
 * Warglaive of Azzinoth's Twin Blades on **Fel Lash**, the Signet Ring of the Bronze
 * Dragonflight on **Another Timeline** - is that reader's SECOND SOURCE, never a second
 * reader: the Signature's `featurePatch` descriptor (`rules/signatures.mjs`), gated and
 * aggregated by `signatureEffects().featurePatches`, becomes a row `patchRowsOf` reads
 * beside the talents, its patch namespaced under `item` so no talent payload is mistaken
 * for it, and the feature sync puts the item's name on the feature's chips.
 *
 * Pure: no Foundry, no documents.
 */

/** The patch's own namespace: every payload an item lays is under this key (D-2156). */
export const ITEM_PATCH_KEY = "item";

/** The numbers a `featurePatch` may carry, in the descriptor's own order. */
export const ITEM_PATCH_FIELDS = Object.freeze(["heal", "cost", "damage", "feet", "sand"]);

/** A whole number, or null. */
const whole = v => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : null;
};

/** One aggregated row's payload: the numbers it sets, each kept only where it is a number. */
function payloadOf(row = {}) {
  const out = {};
  for (const key of ITEM_PATCH_FIELDS) {
    const n = whole(row?.[key]);
    if (n !== null) out[key] = n;
  }
  return out;
}

/**
 * **THE WORN ITEMS AS PATCH SOURCES** for `patchRowsOf`: one talent-shaped row an item - taken
 * once, its own identifier, its name the chip - carrying its patches in `itemPatches`, which
 * `patchRowsOf` reads in place of a talent's table row. Sorted by identifier, as the reader
 * sorts its talents.
 *
 * @param {Array<{key?: string, itemId?: string|null, name?: string, feature?: string}>} rows
 *   `signatureEffects().featurePatches`
 * @returns {Array<{taken: number, identifier: string, name: string, className: string, itemId: string|null, itemPatches: object[]}>}
 */
export function itemPatchSources(rows = []) {
  const by = new Map();
  for (const row of rows ?? []) {
    if (!row?.feature) continue;
    const payload = payloadOf(row);
    if (!Object.keys(payload).length) continue;
    const identifier = `item:${row.key ?? row.itemId ?? row.name ?? ""}`;
    const held = by.get(identifier) ?? { taken: 1, identifier, name: String(row.name ?? ""), className: "", itemId: row.itemId ?? null, itemPatches: [] };
    held.itemPatches.push({ feature: String(row.feature), [ITEM_PATCH_KEY]: payload });
    by.set(identifier, held);
  }
  return [...by.values()].sort((a, b) => a.identifier.localeCompare(b.identifier));
}

/**
 * **THE ITEMS' PATCHES ON ONE FEATURE, FOR THE FEATURE SYNC** (`AzerothActor
 * #_syncClassFeaturesNow`): `patchFeature`'s own row shape, the item as the `source` whose name
 * becomes the chip. Its payload rides under `item`, which `talent-effects.mjs#applyPatch` lays
 * nothing for, so the stamp gains the chip and nothing else: each door reads its number itself.
 *
 * @param {Array<object>} rows  `signatureEffects().featurePatches`
 * @param {string} feature
 * @returns {Array<{source: {name: string}, patch: object, rank: number}>}
 */
export function itemPatchesFor(rows = [], feature) {
  return itemPatchSources(rows)
    .flatMap(src => src.itemPatches.filter(p => p.feature === feature).map(patch => ({ source: { name: src.name }, patch, rank: 1 })));
}

/** The item payload of one `patchRowsOf` row, or null for a talent's. */
export function itemPayload(row) {
  const p = row?.patch?.[ITEM_PATCH_KEY] ?? null;
  return p && typeof p === "object" ? p : null;
}

/**
 * **WHAT THE ITEMS ADD TO ONE NUMBER OF A FEATURE**: the sum of `key` over the item rows of
 * `patchRowsOf(sources, feature)`, and the items' names for the card. Talents' rows add
 * nothing here: their own readers read them.
 *
 * @param {Array<{talent: object, patch: object}>} rows  `patchRowsOf`'s answer
 * @param {"heal"|"damage"|"feet"|"sand"} key
 * @returns {{amount: number, by: string[]}}
 */
export function itemPatchSum(rows = [], key) {
  let amount = 0;
  const by = [];
  for (const row of rows ?? []) {
    const n = whole(itemPayload(row)?.[key]);
    if (!(n > 0)) continue;
    amount += n;
    by.push(String(row.talent?.name ?? ""));
  }
  return { amount, by };
}

/**
 * **WHAT A FEATURE COSTS WITH THE ITEMS' PRICES** (the Darkfallen Choker's *Royal Due costs a
 * Sovereign wearing it 1 Tribute*, Twin Blades' *Fel Lash costs them 1 Hatred*): the lowest of
 * the base and every item's `cost`. A set price never raises the base. Answers the price and
 * the item that set it, or the base and null.
 *
 * @param {Array<{talent: object, patch: object}>} rows  `patchRowsOf`'s answer
 * @param {number} base
 * @returns {{cost: number, by: string|null}}
 */
export function itemPatchedCost(rows = [], base = 0) {
  let cost = Math.max(0, whole(base) ?? 0);
  let by = null;
  for (const row of rows ?? []) {
    const n = whole(itemPayload(row)?.cost);
    if (n === null || n < 0 || n >= cost) continue;
    cost = n;
    by = String(row.talent?.name ?? "");
  }
  return { cost, by };
}

/**
 * Whether an item's descriptor names a key the equip moves (`featurePatch` with a feature, or
 * `bound` damage) on its trunk or any gated run.
 */
function carries(signature, test) {
  if (!signature || typeof signature !== "object") return false;
  return [signature, ...(Array.isArray(signature.gated) ? signature.gated : [])].some(part => test(part ?? {}));
}

/**
 * **WHAT AN EQUIP OR AN UNEQUIP MAKES THE ACTOR RE-SYNC** (the phase 2 review: the Vestments of
 * the Cult of the Damned and the Skull of Gul'dan never reached a creature raised or bound
 * before they were worn): `features` where the item patches a class feature (the chip is the
 * feature sync's), `bound` where it lays on the bearer's bound creatures (`syncBoundFor`). Only
 * a write naming `system.equipped` moves either. Pure.
 *
 * @param {{system?: {signatureEffect?: object}}} item  the item after the write
 * @param {object} change  the write's differential
 * @returns {{features: boolean, bound: boolean}}
 */
export function equipResyncs(item, change = {}) {
  const named = Boolean(change && typeof change === "object" && change.system && typeof change.system === "object"
    && Object.hasOwn(change.system, "equipped"));
  if (!named) return { features: false, bound: false };
  const signature = item?.system?.signatureEffect ?? item?.signatureEffect ?? null;
  return {
    features: carries(signature, p => Boolean(p.featurePatch?.feature)),
    bound: carries(signature, p => Number(p.bound?.damage) > 0)
  };
}

/**
 * **WHAT AN ITEM ARRIVING OR LEAVING ALREADY WORN MAKES THE ACTOR RE-SYNC** (the phase 3 review):
 * `equipResyncs` reads a write naming `system.equipped`, and a create or a delete names none, so
 * an item created equipped (the creator's kit, a drop straight onto a slot, a macro) or deleted
 * while worn moved no chip and no bound creature. A create reads the new document and a delete
 * the deleted one, which still carries its data; only one that is `equipped` moves anything. Pure.
 *
 * @param {{system?: {equipped?: boolean, signatureEffect?: object}}} item
 * @returns {{features: boolean, bound: boolean}}
 */
export function presenceResyncs(item) {
  if (item?.system?.equipped !== true) return { features: false, bound: false };
  return equipResyncs(item, { system: { equipped: true } });
}

/**
 * Whether an item's Signature patches one feature by name, on its trunk or a gated run
 * (Spectral Sight's token sight re-read when the Blindfold is put on or taken off).
 *
 * @param {object} item
 * @param {string} feature
 */
export function patchesFeature(item, feature) {
  const signature = item?.system?.signatureEffect ?? item?.signatureEffect ?? null;
  return carries(signature, p => p.featurePatch?.feature === feature);
}
