/**
 * Shared SchemaField builders. Every Item subtype is imported from a chapter
 * (D2 §8), so most of them carry the same three things: prose, a provenance
 * pointer back to the source, and the D4 §10.1 item field run.
 *
 * "A field that does not apply is omitted, never stored empty" (D4 §10.1) is
 * the book's rule and the importer's. That is why so much here is `nullable`
 * with `initial: null` rather than an empty string — null and "" are different
 * and the sheet renders them differently.
 */

const fields = foundry.data.fields;

/** Prose. ProseMirror only; TinyMCE was removed in V14. */
export function descriptionField() {
  return new fields.HTMLField({ required: false, blank: true, initial: "" });
}

/**
 * Where this document came from in the book. The pack is generated from the
 * chapter (D-512), so every document can say which one and be re-derived.
 */
export function sourceField() {
  return new fields.SchemaField({
    document: new fields.StringField({ required: false, blank: true, initial: "" }),
    section: new fields.StringField({ required: false, blank: true, initial: "" })
  });
}

/** A stable slug, so a pack document can be found by name from a parser. */
export function identifierField() {
  return new fields.StringField({ required: false, blank: true, initial: "" });
}

/** A choice from a CONFIG.AZEROTH enum, or null where the field is omitted. */
export function choiceField(choices, { initial = null, nullable = true } = {}) {
  return new fields.StringField({
    required: false,
    nullable,
    blank: false,
    initial,
    choices: () => Object.keys(choices)
  });
}

/** A whole number that may legitimately be absent — a bow's Damage Rating. */
export function optionalNumberField({ min = null, max = null } = {}) {
  const opts = { required: false, nullable: true, integer: true, initial: null };
  if (min !== null) opts.min = min;
  if (max !== null) opts.max = max;
  return new fields.NumberField(opts);
}

/**
 * Price, stored in copper. 100 copper make a silver and 100 silver a gold
 * (D-422), and the wage that anchors every price in 08 is twelve coppers a day.
 * Storing one integer keeps the arithmetic exact and leaves formatting to the
 * sheet.
 */
export function costField() {
  return new fields.NumberField({ required: false, nullable: true, integer: true, min: 0, initial: null });
}

/** Weight in pounds. "Nobody weighs a rope" — most gear leaves this null. */
export function weightField() {
  return new fields.NumberField({ required: false, nullable: true, min: 0, initial: null });
}

/**
 * The tail of D4 §10.1's item field run, shared by weapon, armor and gear:
 * Rarity, Budget, Cost, Weight, Provenance. Rating, AP, Range and Traits come
 * first and belong to the individual subtype because not every item has them.
 */
export function itemEconomyFields(AZEROTH) {
  return {
    rarity: choiceField(AZEROTH.rarities, { initial: "common" }),
    // A Legendary is not costed: its entry prints a dash where the number goes.
    budget: optionalNumberField({ min: 0 }),
    cost: costField(),
    weight: weightField(),
    provenance: new fields.StringField({ required: false, blank: true, initial: "" })
  };
}

/** Trait names carried by an item. 08 §5 owns the definitions; this names them. */
export function traitsField() {
  return new fields.ArrayField(
    new fields.StringField({ required: true, blank: false }),
    { required: false, initial: [] }
  );
}

/**
 * How often a thing may be used between refreshes (D-612, D-623): the uses
 * in hand, the maximum, and what restores them - a Short Rest, a Long Rest
 * or the encounter's end. `per` null means unlimited.
 */
export function usesField() {
  return new fields.SchemaField({
    value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
    max: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
    per: new fields.StringField({ required: false, nullable: true, blank: false, initial: null,
      choices: ["short", "long", "encounter"] })
  });
}
