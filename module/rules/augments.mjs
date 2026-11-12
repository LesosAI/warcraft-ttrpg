/**
 * Augments — the class equipment a caster casts through (07 §3, 08 §9).
 * Pure, no Foundry imports (CLAUDE.md §3).
 *
 * 07 §3 is the authority and 08 §9 prices it. Eight categories, one to a class
 * (the Chromatic Champion's Broodstone the seventh: it bears on the Casting Test
 * of the spells its branches teach, since the class casts nothing else; the
 * Chronomancer's Hourglass the eighth, which adds 0 and holds Sand, D-849),
 * and the form inside a category is a choice of weight and concealment rather
 * than of power: *any form inside a category carries the same bonus*.
 *
 * **It is carried in the Ranged slot for every class** (D-850; the lead: *"An
 * augment should use the ranged weapon slot for all classes"*). It and a ranged
 * weapon displace each other, and a two-handed main hand no longer bars it
 * (`rules/worn.mjs`). The Shaman's totem sits there while carried and is still
 * planted to cast.
 *
 * **It adds to the Casting Test and to nothing else.** 07 §3: *a spell's
 * damage is its Damage Rating, which no Casting Test changes, and a spell
 * costs what its entry says with an Augment in hand and without one.* So this
 * is one number on one Test, never an Active Effect on a score.
 *
 * **The bonus rises once across the game** — +1 at tiers 1–2, +2 at tiers 3–4
 * — and the pack carries the two grades as two items (`Focus (+1)`,
 * `Focus (+2)`). The ITEM says what it is worth; `bonusAtTier` is what a
 * caster of that tier would be carrying, which is what the shops stock.
 *
 * **A totem is planted and not carried** (07 §3, 08 §9): *you cast through it
 * while you stand within 30 feet of one of yours.* Whether you are within
 * thirty feet is the table's call, so it is a note beside the number and
 * never a thing this module decides (D2 §12).
 */

/**
 * 07 §3's table: the category a class carries, and the forms it takes. The
 * forms are the chapter's own words and are what the sheet prints when it
 * says what a category is.
 */
export const AUGMENTS = Object.freeze({
  focus: Object.freeze({ className: "Mage", forms: "Wands, orbs, staff-heads, cut arcanite" }),
  reliquary: Object.freeze({ className: "Priest", forms: "Wands, pendants, censers, sealed caskets" }),
  grimoire: Object.freeze({ className: "Warlock", forms: "Bound pacts, ledgers, skull-set wands" }),
  libram: Object.freeze({ className: "Paladin", forms: "Librams, blessed seals, hand-copied psalters" }),
  idol: Object.freeze({ className: "Druid", forms: "Carved idols, antler fetishes, moonwell stones" }),
  totem: Object.freeze({ className: "Shaman", forms: "Planted totems, carved poles, ancestor stakes" }),
  broodstone: Object.freeze({ className: "Chromatic Champion", forms: "A cut stone, a ring-set garnet, a vial sealed in lead" }),
  // The Chronomancer's (D-849): the one Augment that adds NOTHING to a Casting
  // Test and holds a pool instead. The lead: *"the augment does not add a casting
  // bonus for the hourglass"*, *"no hourglass no sand"*. `bonus: 0` is fixed by the
  // category, so the pack carries ONE item rather than a `(+1)` and a `(+2)`.
  hourglass: Object.freeze({
    className: "Chronomancer",
    forms: "A brass-caged glass, a sand-glass on a chain, a glass set in a staff-head",
    bonus: 0,
    holds: "sand"
  })
});

/**
 * Whether a category carries a fixed bonus (the Hourglass's 0) rather than a
 * grade read off the item's name. An Hourglass names no `(+N)`, and before
 * D-849 `augmentOf` refused any §9 row without one.
 */
export function fixedBonus(category) {
  const entry = AUGMENTS[category];
  return entry && Number.isFinite(entry.bonus) ? entry.bonus : null;
}

/** The pool a category holds (`"sand"` for the Hourglass), or null. */
export function poolHeld(category) {
  return AUGMENTS[category]?.holds ?? null;
}

/** The one that is planted rather than held, and how far it reaches (07 §3). */
export const PLANTED = "totem";
export const PLANTED_RANGE = 30;

/** 08 §9's own section label, which is what marks an item as one of these. */
const SECTION = /^9\b/;
const SECTION_TAIL = "Augments";

/** The bonus a caster of this tier would be carrying (07 §3's table). */
export function bonusAtTier(tier) {
  const t = Math.trunc(Number(tier)) || 1;
  return t >= 3 ? 2 : 1;
}

/**
 * The category and grade a document STATES on its flag, or null.
 *
 * 08 §9's own six say it in their section and their name, so the flag is the
 * door for a thing 08 §9 does not list: a Classic Libram, Idol or Totem
 * (A6, D-685) is that class's Augment and is filed under its instance rather
 * than under §9, so no reading of the section could ever find it.
 *
 * `className` and `forms` still come off 07 §3's own table rather than off the
 * flag — the flag says WHICH category, and the chapter says what a category
 * is, so the two can never disagree.
 */
function flaggedAugment(item) {
  const flag = item?.flags?.["azeroth-rpg"]?.augment
    ?? item?.system?.flags?.["azeroth-rpg"]?.augment
    ?? null;
  if (!flag) return null;
  const category = String(flag.category ?? "").trim().toLowerCase();
  if (!AUGMENTS[category]) return null;
  // A fixed-bonus category (the Hourglass) is that bonus whatever the flag says.
  const fixed = fixedBonus(category);
  const bonus = fixed ?? Number(flag.bonus);
  if (flag.bonus === undefined && fixed === null) return null;
  if (!Number.isFinite(bonus)) return null;
  return { category, bonus };
}

/**
 * What an item is, as an Augment, or null where it is not one.
 *
 * Derived rather than stored (CLAUDE.md §4): the pack already says the
 * section and the name already says the category and the grade, so a stored
 * copy would be a third place for the same fact to go stale.
 *
 * **The flag is read first** (D-685). A Classic relic carries
 * `flags.azeroth-rpg.augment` and sits under `Classic · <Zone>`, so the
 * section path below cannot reach it; 08 §9's own Augments carry the same
 * flag and come back exactly as they did before.
 *
 * @param {object} item  `{name, flags, system: {source: {section}}}` or the system alone
 * @returns {{category, className, forms, bonus, planted}|null}
 */
export function augmentOf(item, depth = 0) {
  if (!item) return null;
  const sys = item.system ?? item;
  // **A FORGED OR ROLLED AUGMENT IS ITS BASE'S** (D-863, found beside the
  // Hourglass): the Forge and the loot generator name a thing `<prefix> <base>`
  // (`affixes.mjs#nameFor`) and stamp neither the base's flag nor its name, so
  // *Keen Focus (+1)* or an Uncommon *Swift Hourglass* read their first word as a
  // category and stopped being Augments at all. Both carry the whole base on
  // `flags.azeroth-rpg.generated.base`, which answers first.
  const generated = item?.flags?.["azeroth-rpg"]?.generated?.base ?? null;
  if (generated && depth < 1) {
    const fromBase = augmentOf(generated, depth + 1);
    if (fromBase) return fromBase;
  }
  const flagged = flaggedAugment(item);
  if (flagged) {
    const entry = AUGMENTS[flagged.category];
    return {
      category: flagged.category,
      className: entry.className,
      forms: entry.forms,
      bonus: flagged.bonus,
      planted: flagged.category === PLANTED,
      holds: poolHeld(flagged.category)
    };
  }
  const section = String(sys?.source?.section ?? "");
  if (!SECTION.test(section) || !section.includes(SECTION_TAIL)) return null;
  const name = String(item.name ?? sys?.name ?? "");
  const category = name.trim().split(/[\s(]/)[0].toLowerCase();
  const entry = AUGMENTS[category];
  if (!entry) return null;
  // `Focus (+2)` and the identifier `focus-2` say the same thing; the name is
  // what a reader sees, so it is read first.
  // An Hourglass's bonus is its category's (0, D-849) and its name carries none.
  const fixed = fixedBonus(category);
  const marked = /\(\s*\+\s*(\d+)\s*\)/.exec(name);
  const identified = /-(\d+)$/.exec(String(sys?.identifier ?? ""));
  const bonus = fixed ?? (marked ? Number(marked[1]) : (identified ? Number(identified[1]) : null));
  if (bonus === null) return null;
  return {
    category, className: entry.className, forms: entry.forms, bonus,
    planted: category === PLANTED, holds: poolHeld(category)
  };
}

/** Whether a thing is one of the eight at all. */
export function isAugment(item) {
  return augmentOf(item) !== null;
}

/**
 * Whether these classes may carry this category. 08 §9: *an Augment is
 * equipment only your class can carry.* A character with no class at all -
 * one being built - is not refused, because the refusal would fire before
 * the class is chosen.
 *
 * @param {string} category
 * @param {string[]} classNames
 */
export function canCarry(category, classNames = []) {
  const entry = AUGMENTS[category];
  if (!entry) return false;
  if (!classNames.length) return true;
  return classNames.some(n => String(n).trim().toLowerCase() === entry.className.toLowerCase());
}

/**
 * The Augment in hand, out of everything carried: the equipped one. A caster
 * casts through ONE - 07 §3 speaks of *a caster holding one* throughout - so
 * equipping a second puts the first away, and this reads the first equipped.
 *
 * @param {Array} items  carried items
 * @returns {{item, ...augmentOf}|null}
 */
export function heldAugment(items = []) {
  for (const item of items) {
    const sys = item?.system ?? {};
    if (sys.equipped !== true) continue;
    const augment = augmentOf(item);
    if (augment) return { ...augment, item, name: item.name };
  }
  return null;
}

/** Approved relic signatures require the active Augment and its class, not
 * merely an equipped flag. Keep other signatures' existing gates unchanged. */
export function signatureAugmentAllowed(item, items = [], classNames = []) {
  const identifier=item?.system?.identifier ?? item?.identifier;
  const required={
    'idol-of-brutality':'idol', 'idol-of-ferocity':'idol',
    'libram-of-hope':'libram', 'libram-of-truth':'libram'
  };
  if (!Object.hasOwn(required,identifier)) return true;
  const held=heldAugment(items);
  return Boolean(classNames.length && held?.item === item && held.category === required[identifier]
    && canCarry(held.category,classNames));
}

/** Every Augment carried, held or not - what the sheet lists and the menu offers. */
export function carriedAugments(items = []) {
  const out = [];
  for (const item of items) {
    const augment = augmentOf(item);
    if (augment) out.push({ ...augment, item, name: item.name, equipped: item?.system?.equipped === true });
  }
  return out;
}

/**
 * What the Casting Test's Augment box should say, and what to say beside it.
 *
 * @param {Array} items        carried items
 * @param {string[]} classNames the caster's classes
 * @returns {{value, name, category, planted, note}|null}
 */
export function castingAugment(items = [], classNames = []) {
  const held = heldAugment(items);
  if (!held) return null;
  if (!canCarry(held.category, classNames)) return null;
  return {
    value: held.bonus,
    name: held.name,
    category: held.category,
    planted: held.planted,
    // 08 §9's own condition, for the table to judge (D2 §12).
    note: held.planted ? PLANTED_RANGE : null,
    // The Hourglass holds Sand and adds 0 (D-849); the dialog says so in words.
    ...(held.holds ? { holds: held.holds } : {})
  };
}
