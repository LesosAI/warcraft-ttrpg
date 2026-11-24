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
 * **A food's own tier adds Health** (O-702, D-2004): `foodTier` reads it off the Wilderness
 * Survival recipe stamp, and `restPicks` hands it to `rest.mjs#shortRest`.
 *
 * Three kinds rather than two, because *Hot meal at an inn* and *Feast, for
 * six* give **Health equal to your tier again** on the rest they feed: one
 * enum keeps the item sheet to one select, the browser to one facet, and a
 * GM's hand-made stew to one pick.
 *
 * **The Waterskin is not a drink** (the lead's decision 3): only the Drink
 * table is drink, and the waterskin is a container with charges (D-671).
 */

import { craftOf } from "./recipes.mjs";

/**
 * The kinds 08 §12's shelf holds. `null` is everything else carried.
 *
 * **AND BLOOD** (02 §5's San'layn, 08 §12's fourth table; D-1141). A San'layn rests on a unit of
 * blood in place of food and drink, and a **Blood vial** is one unit. It is a kind of its own -
 * never food and never drink - so a Human's rest window never offers one and a San'layn's offers
 * nothing else.
 */
export const PROVISION_KINDS = Object.freeze(["food", "hotMeal", "drink", "blood", "foodAndDrink"]);

/**
 * The kinds that feed a rest. A hot meal is food that gives the tier again.
 *
 * **AND A DISH THAT COUNTS AS BOTH** (08 §12's *Counts as food and as drink for
 * a Short Rest*: Smoked Sagefish, Sagefish Delight, the Feast's soup; D-1963):
 * `foodAndDrink` is one pick that is the rest's food AND its drink.
 */
export const FOOD_KINDS = Object.freeze(["food", "hotMeal", "foodAndDrink"]);

/** The kinds that are drunk at a rest. */
export const DRINK_KINDS = Object.freeze(["drink", "foodAndDrink"]);

/** Whether this kind is eaten. */
export function isFood(kind) {
  return FOOD_KINDS.includes(kind);
}

/** Whether this kind is drunk. */
export function isDrink(kind) {
  return DRINK_KINDS.includes(kind);
}

/** Whether this kind is blood (a Blood vial: 1 unit, D-1141). */
export function isBlood(kind) {
  return kind === "blood";
}

/** Whether eating this adds the tier a second time (08 §12's Rule line). */
export function tierAgain(kind) {
  return kind === "hotMeal";
}

/** The trade whose recipe tier is a food's tier (03's Wilderness Survival cooks; D-1919). */
export const FOOD_TIER_TRADE = "wilderness-survival";

/**
 * The kinds whose own tier feeds a rest: a food, and a dish that counts as food and drink.
 * **Never a hot meal**: the inn's hot meal and the Feast give the eater's tier again (08 §12)
 * and add no tier of their own, so a Feast is never counted twice.
 */
export const FOOD_TIER_KINDS = Object.freeze(["food", "foodAndDrink"]);

/**
 * **A FOOD ADDS HEALTH EQUAL TO ITS TIER** (O-702, D-2004; 05 §16): the Health an item of food
 * adds on the Short Rest it feeds, on top of the rest's own recovery. Its tier is the Wilderness
 * Survival recipe tier stamped on the item (`system.craft`, read through `recipes.mjs#craftOf`),
 * 1 to 4; an item no Wilderness Survival recipe makes (the inn's hot meal, a GM's hand-made stew)
 * adds 0, and so does a drink, a hot meal, a Feast and anything that is not food.
 *
 * Before O-702 a dish's tier bought nothing: 05 said *its tier sets only the Health it
 * recovers* and no rule gave a number, so a 1s 20c tier 4 dish fed a rest exactly as a 10c
 * tier 1 dish did.
 *
 * @param {{type?: string, system?: {provision?: string, craft?: object}}} item
 * @returns {number} 0 to 4
 */
export function foodTier(item) {
  if (!item || item.type !== "gear") return 0;
  if (!FOOD_TIER_KINDS.includes(item.system?.provision ?? null)) return 0;
  const stamp = craftOf(item, FOOD_TIER_TRADE);
  // `craftOf` answers another trade's stamp where Wilderness Survival makes nothing; that is
  // somebody else's work and has no food tier.
  if (!stamp || stamp.trade !== FOOD_TIER_TRADE) return 0;
  return stamp.tier;
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

/**
 * The first header cell of each of §12's food tables (D-405's category).
 * **`Cooked food`** is Wilderness Survival's (D-1919, D-1940): food that makes
 * the eater Well Fed, which the Use descriptor carries (`use.wellFed`).
 */
export const FOOD_CATEGORIES = Object.freeze(["Meal", "Provision", "Cooked food"]);

/** 08 §12's two clauses that make a food a drink as well, or a drink alone (D-1963). */
export const COUNTS_AS_BOTH = /counts as food and as drink for a Short Rest/i;
export const COUNTS_AS_DRINK = /counts as drink for a Short Rest/i;
const DRINK_CATEGORIES = Object.freeze(["Drink"]);
/** 08 §12's fourth table, `| Blood | Effect | Cost |` (D-1141). Inside the same shelf gate. */
export const BLOOD_CATEGORIES = Object.freeze(["Blood"]);

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
    const said = String(effect ?? "").trim();
    if (TIER_AGAIN_EFFECT.test(said)) return "hotMeal";
    // A dish that counts as food AND drink is one pick for both (D-1963), and a
    // cooked tea that counts as drink alone is a drink.
    if (COUNTS_AS_BOTH.test(said)) return "foodAndDrink";
    if (COUNTS_AS_DRINK.test(said)) return "drink";
    return "food";
  }
  if (DRINK_CATEGORIES.includes(cell)) return "drink";
  if (BLOOD_CATEGORIES.includes(cell)) return "blood";
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
 * @returns {{food: object[], drink: object[], blood: object[]}} rows of `{itemId, name, quantity, kind}`
 *   - and the Blood vials carried, which only a San'layn's window draws (D-1141)
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
  return { food: rows(isFood), drink: rows(isDrink), blood: rows(isBlood) };
}

/**
 * The three flags `rules/rest.mjs#shortRest` takes, from what was picked.
 *
 * The defaults WITHHOLD there, so a caller that forgets the picks restores
 * nothing rather than everything; this is the one place that turns a pick into
 * a grant.
 *
 * **AND THE FOOD'S OWN TIER** (O-702, D-2004): `foodTier` is `foodTier(item)` of what was
 * eaten, passed through only where the pick is a food that is not a hot meal, so a hot meal or a
 * Feast never adds a tier of its own beside the eater's tier again. It withholds by default.
 *
 * @param {{foodKind?: string|null, hasDrink?: boolean, foodTier?: number}} o
 * @returns {{eats: boolean, drinks: boolean, tierAgain: boolean, foodTier: number}}
 */
export function restPicks({ foodKind = null, hasDrink = false, foodTier: tierOfFood = 0 } = {}) {
  const eats = isFood(foodKind);
  const again = eats && tierAgain(foodKind);
  const own = eats && !again && FOOD_TIER_KINDS.includes(foodKind)
    ? Math.min(4, Math.max(0, Math.trunc(Number(tierOfFood)) || 0))
    : 0;
  // A dish that counts as food and as drink is the rest's drink as well (D-1963).
  return { eats, drinks: Boolean(hasDrink) || isDrink(foodKind), tierAgain: again, foodTier: own };
}

/**
 * **WHAT A SHORT REST MARKS OFF: ONE OF EACH THING PICKED, AND ONE DISH ONCE** (the final review's
 * M1). A dish that counts as food and as drink (`foodAndDrink`) may be named as the food AND as the
 * drink, and it is one dish that feeds both (D-1963): marking it off twice spent two where one fed
 * the rest, and at a quantity of 1 the second delete named a document already gone. The two picks
 * are the same thing where they are the same object or carry the same id.
 *
 * @template T
 * @param {T|null} eaten
 * @param {T|null} drunk
 * @returns {T[]} the distinct things to mark off, the food first
 */
export function restSpends(eaten, drunk) {
  const out = [];
  for (const item of [eaten, drunk]) {
    if (!item) continue;
    const id = item.id ?? null;
    if (out.some(seen => seen === item || (id !== null && seen.id === id))) continue;
    out.push(item);
  }
  return out;
}

/**
 * **THE DRINK THE REST WINDOW PRESELECTS** (the final review's M1). A drink is preselected for a
 * character who holds Mana, or who carries no food to rest on (D-733's rule), and never the dish
 * already preselected as the food: a dish that counts as food and as drink is the drink too, so
 * nothing more is preselected beside it, and a second row of the same item would spend it twice.
 *
 * @param {{food?: object[], drink?: object[], hasMana?: boolean}} o  `provisionOptions` rows
 * @returns {string|null} the drink row's `itemId`, or null for *Nothing*
 */
export function drinkPreselect({ food = [], drink = [], hasMana = false } = {}) {
  if (!hasMana && food.length) return null;
  const eaten = food[0] ?? null;
  if (eaten && isDrink(eaten.kind)) return null;
  return drink.find(row => !eaten || row.itemId !== eaten.itemId)?.itemId ?? null;
}
