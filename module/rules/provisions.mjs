/**
 * What a Short Rest eats and drinks (05 §16, 08 §12; D-733). Pure, no Foundry
 * imports (CLAUDE.md §3).
 *
 * The lead, 2026-09-19: **a Short Rest needs a food or a drink item; food
 * restores the Health, drink restores the Mana.** Rest alone restores neither.
 *
 * 08 §12's *Food and drink* shelf publishes three tables and the pack could
 * not tell them apart: every row carried `use.kind: "none"` and the same
 * `source.section`, so nothing on a meal said it was a meal. The one place the
 * distinction exists is the table's own **first header cell** (D-405's
 * category) — `Meal`, `Provision`, `Drink` — which the gear parser already
 * holds, so `provisionFor` reads it there and `GearData.provision` stores the
 * answer exactly as `slot` stores §11's Slot column.
 *
 * Three kinds rather than two, because *Hot meal at an inn* and *Feast, for
 * six* give **Health equal to your tier again** on the rest they feed: one
 * enum keeps the item sheet to one select, the browser to one facet, and a
 * GM's hand-made stew to one pick.
 *
 * **The Waterskin is not a drink** (the lead's decision 3): only the Drink
 * table is drink, and the waterskin is a container with charges (D-671).
 */

/** The three kinds 08 §12's shelf holds. `null` is everything else carried. */
export const PROVISION_KINDS = Object.freeze(["food", "hotMeal", "drink"]);

/** The kinds that feed a rest. A hot meal is food that gives the tier again. */
export const FOOD_KINDS = Object.freeze(["food", "hotMeal"]);

/** Whether this kind is eaten. */
export function isFood(kind) {
  return FOOD_KINDS.includes(kind);
}

/** Whether this kind is drunk. */
export function isDrink(kind) {
  return kind === "drink";
}

/** Whether eating this adds the tier a second time (08 §12's Rule line). */
export function tierAgain(kind) {
  return kind === "hotMeal";
}

/**
 * The shelf 08 §12 files food and drink on, as `folder.at(-1)` gives it.
 *
 * **The shelf is the GATE and the category is the answer.** The three header
 * cells are unique in 08 today, but a future `Drink` table somewhere else in
 * the chapter would otherwise be stamped as a provision; reading the shelf
 * first is what keeps this rule to the one shelf that carries it.
 */
export const PROVISION_SHELF = "Food and drink";

/** The first header cell of each of §12's three tables (D-405's category). */
const FOOD_CATEGORIES = Object.freeze(["Meal", "Provision"]);
const DRINK_CATEGORIES = Object.freeze(["Drink"]);

/**
 * The Effect run that marks a hot meal (08 §12, after D-733's rewrite).
 *
 * Anchored at the start and open at the end, so *Health equal to your tier
 * again, for all six* on the Feast matches the same rule. **The name is never
 * read**: an inn's stew and a feast are the same mechanic and a third entry
 * with the same Effect would be stamped without touching this module.
 */
export const TIER_AGAIN_EFFECT = /^Health equal to your tier again\b/;

/**
 * Which provision a catalogue row is, or null.
 *
 * @param {object} o
 * @param {string} o.shelf     the last folder part — `folder.at(-1)`
 * @param {string} o.category  the table's first header cell (D-405)
 * @param {string|null} o.effect  the row's `**Effect.**` run, where it has one
 * @returns {"food"|"hotMeal"|"drink"|null}
 */
export function provisionFor({ shelf = "", category = "", effect = null } = {}) {
  if (String(shelf ?? "").trim() !== PROVISION_SHELF) return null;
  const cell = String(category ?? "").trim();
  if (FOOD_CATEGORIES.includes(cell)) {
    return TIER_AGAIN_EFFECT.test(String(effect ?? "").trim()) ? "hotMeal" : "food";
  }
  if (DRINK_CATEGORIES.includes(cell)) return "drink";
  return null;
}

/**
 * A stored kind outside the vocabulary is nulled, never refused.
 *
 * `choiceField` is `blank: false`, so an empty select would fail validation and
 * a document that fails validation is invisible to a world migration
 * (CLAUDE.md §15). The CALLER guards on the key being present, because
 * `migrateData` runs over partial update data too and a guard that writes
 * unconditionally empties the field on every update that does not name it
 * (D-671). This is `worn.mjs#cleanSlot`'s shape exactly.
 */
export function cleanProvision(kind) {
  return PROVISION_KINDS.includes(kind) ? kind : null;
}

/**
 * Whether an owned item may be eaten or drunk at a rest.
 *
 * @param {{type?: string, system?: object}} item
 * @param {string|string[]} [want]  the kind or kinds the pick has to be
 */
export function isProvision(item, want = PROVISION_KINDS) {
  if (!item || item.type !== "gear") return false;
  const kinds = Array.isArray(want) ? want : [want];
  const kind = item.system?.provision ?? null;
  if (!kinds.includes(kind)) return false;
  return (item.system?.quantity ?? 1) > 0;
}

/**
 * What the rest window offers, out of everything the character is carrying.
 *
 * **What is in a container counts** (D-671): Foundry has no item inside an
 * item, so a ration in a backpack is still an owned item naming its container
 * and is listed exactly like a loose one. Nothing is filtered on `equipped`
 * either — a meal is not worn.
 *
 * **Sorted by name**, because an embedded collection's order is not stable
 * across a re-sync and the two selects would otherwise swap rows between
 * renders (CLAUDE.md §15). The id breaks a tie so two of one thing keep a
 * fixed order.
 *
 * @param {Iterable<{id?: string, name?: string, type?: string, system?: object}>} items
 * @returns {{food: object[], drink: object[]}} rows of `{itemId, name, quantity, kind}`
 */
export function provisionOptions(items = []) {
  const all = [...(items ?? [])].filter(Boolean);
  const rows = matches => all
    .filter(item => isProvision(item) && matches(item.system?.provision ?? null))
    .map(item => ({
      itemId: item.id ?? null,
      name: String(item.name ?? ""),
      quantity: Math.trunc(Number(item.system?.quantity ?? 1)) || 0,
      kind: item.system?.provision ?? null
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || String(a.itemId).localeCompare(String(b.itemId)));
  return { food: rows(isFood), drink: rows(isDrink) };
}

/**
 * The three flags `rules/rest.mjs#shortRest` takes, from what was picked.
 *
 * The defaults WITHHOLD there, so a caller that forgets the picks restores
 * nothing rather than everything; this is the one place that turns a pick into
 * a grant.
 *
 * @param {{foodKind?: string|null, hasDrink?: boolean}} o
 * @returns {{eats: boolean, drinks: boolean, tierAgain: boolean}}
 */
export function restPicks({ foodKind = null, hasDrink = false } = {}) {
  const eats = isFood(foodKind);
  return { eats, drinks: Boolean(hasDrink), tierAgain: eats && tierAgain(foodKind) };
}
