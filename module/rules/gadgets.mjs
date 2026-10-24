/**
 * **THE TINKER'S GADGETS** (the Legacy branches' door 7). Pure: no Foundry imports
 * (CLAUDE.md §3).
 *
 * 04's Gadgeteer: *You know two gadgets from the **Gadgets** table below, or four at
 * rank 2. Each gadget you know may be used once between Short Rests. Changing one
 * you know takes a week of downtime.* Engineering Upgrade: *you know one more gadget
 * per rank.*
 *
 * - **The table** (`GADGETS`) is 04's own, read back off the chapter by the Vitest:
 *   each gadget's name, its Use, and what the system does with it - a feature
 *   descriptor in `class-features.mjs`' vocabulary (`grant`), what the Use does
 *   beyond it (`onUse`, read by `workflows.useFeature` off this table rather than
 *   off the granting talent's row), and a `reason` for what stays the table's.
 * - **Each gadget known is a granted feature with its own use**, once between Short
 *   Rests: the feature sync grants one per gadget the Gadgeteer feature has been
 *   told it knows (`system.known`, `uuid` `gadget:<key>`), keyed by the talent and
 *   the gadget, so each carries its own counter.
 * - **What is known is chosen through the ONE chooser** (`workflows.chooseOption`,
 *   D-673): the Gadgeteer feature's Use, outside a fight - *a week of downtime* is
 *   the table's time - a checklist of the eight up to the count the ranks give.
 * - **Each gadget's effect rides a door that exists**: an attack whose hit lays
 *   Entangled with its escape (door 19's record), a card's Resist and its Inflict
 *   buttons (Discombobulator Ray, the Universal Remote), 05's temporary Health (the
 *   Harm Prevention Belt), the card's heal (the Recombobulator), and the card's
 *   Place area (the Alarm-o-Bot). The Cloaking Device's hide and the
 *   Recombobulator's ended condition are door 25's (`onUse.conceal`, `onUse.cures`),
 *   read by `rules/legacy-uses.mjs#onUseSpirits` at the Use (phase B3).
 *
 * **The gnome's racial talents reach gadgets too** (the lead: *"Yes, gadgets
 * too"*): Overclock (*Once per encounter, a device you built or a gadget you know
 * works one step better and then breaks*) and Mekkatorque's Blueprint (*Between Long
 * Rests, build one device from 08-EQUIPMENT or one gadget from 04-TALENTS that you
 * have the parts for, at no cost in gold. It works for a day*) - `RACE_TALENT_EFFECTS
 * .gnome`'s two rows, read by `overclockFor` and `blueprintFor`.
 */

import { evaluateExpression } from "./expressions.mjs";
import { naturalWeapon } from "./shapes.mjs";
import { talentEffect } from "./talent-effects.mjs";

/** The `uuid` a gadget known is recorded under on the Gadgeteer feature's `known`. */
export const GADGET_PREFIX = "gadget:";

/** The actor flag a Blueprint's gadget or device stands under (*It works for a day*). */
export const BLUEPRINT_FLAG = "blueprint";

/** What a carried 08 §13 device is: a gear item from the *Devices* table. */
export const DEVICE_SECTION = /·\s*Devices\s*$/;

/** The escape 04's Net-o-Matic gives its Entangled: *until it spends an action and passes a Reflex Resilience Test against your Spell DC*. */
const NET_ESCAPE = Object.freeze({ on: "action", resilience: "reflex", dc: "spellDc", banes: 0 });

/**
 * **04's EIGHT GADGETS**, in the table's order. `use` is the table's Use column as
 * the feature's action (`half`, `reaction`, or null for *One minute*, which is no
 * turn's); `grant` the feature descriptor the sync stamps; `onUse` what the Use does
 * beyond it; `reason` what stays the table's.
 */
export const GADGETS = Object.freeze([
  Object.freeze({
    key: "net-o-matic-projector", name: "Net-o-Matic Projector", use: "half",
    // 04's Gadgets table, its Use and Effect cells as the chapter prints them
    // (held to the chapter by `legacy-bodies.test.mjs`).
    useText: "Half-Action",
    text: "Make a ranged attack against a creature within 40 feet. On a hit it is **Entangled** until it spends an action and passes a Reflex Resilience Test against your Spell DC.",
    grant: Object.freeze({ kind: "action", action: "half" }),
    // *Make a ranged attack against a creature within 40 feet. On a hit it is
    // Entangled until it spends an action and passes a Reflex Resilience Test
    // against your Spell DC.*
    onUse: Object.freeze({ gadgetAttack: Object.freeze({ range: 40, inflicts: Object.freeze([Object.freeze({ condition: "entangled", escape: NET_ESCAPE })]) }) }),
    reason: null
  }),
  Object.freeze({
    key: "gnomish-cloaking-device", name: "Gnomish Cloaking Device", use: "half",
    // 04's Gadgets table, its Use and Effect cells as the chapter prints them
    // (held to the chapter by `legacy-bodies.test.mjs`).
    useText: "Half-Action",
    text: "You and every ally within 10 feet are hidden, even while observed, for one minute. It ends for each of you who attacks or casts a spell.",
    grant: Object.freeze({ kind: "action", action: "half" }),
    // *You and every ally within 10 feet are hidden, even while observed, for one
    // minute. It ends for each of you who attacks or casts a spell.*
    onUse: Object.freeze({ conceal: Object.freeze({ feet: 10, allies: true, until: "minute" }) }),
    reason: null
  }),
  Object.freeze({
    key: "alarm-o-bot", name: "Alarm-o-Bot", use: null,
    // 04's Gadgets table, its Use and Effect cells as the chapter prints them
    // (held to the chapter by `legacy-bodies.test.mjs`).
    useText: "One minute",
    text: "Set it down. For 8 hours a creature that comes within 30 feet of it is revealed, hidden or not, and the alarm wakes everyone within 30 feet of it.",
    // *Set it down*: the card places its 30 feet on the ground (D-616's Place area).
    grant: Object.freeze({ kind: "action", action: null, area: "A 30 ft radius on the ground" }),
    onUse: Object.freeze({}),
    reason: "watch"
  }),
  Object.freeze({
    key: "discombobulator-ray", name: "Discombobulator Ray", use: "half",
    // 04's Gadgets table, its Use and Effect cells as the chapter prints them
    // (held to the chapter by `legacy-bodies.test.mjs`).
    useText: "Half-Action",
    text: "A creature within 30 feet makes a Spirit Resilience Test against your Spell DC or is **Slowed** and **Silenced** until the end of its next turn.",
    // *A creature within 30 feet makes a Spirit Resilience Test against your Spell DC
    // or is Slowed and Silenced until the end of its next turn.*
    grant: Object.freeze({
      kind: "action", action: "half", resist: "spirit",
      inflicts: Object.freeze([
        Object.freeze({ condition: "slowed", value: null, until: "endOfNextTurn" }),
        Object.freeze({ condition: "silenced", value: null, until: "endOfNextTurn" })
      ])
    }),
    onUse: Object.freeze({ aim: Object.freeze({ feet: 30, kinds: null }) }),
    reason: null
  }),
  Object.freeze({
    key: "gnomish-universal-remote", name: "Gnomish Universal Remote", use: "half",
    // 04's Gadgets table, its Use and Effect cells as the chapter prints them
    // (held to the chapter by `legacy-bodies.test.mjs`).
    useText: "Half-Action",
    text: "A Construct within 30 feet makes a Spirit Resilience Test against your Spell DC or is **Charmed** by you until the end of its next turn.",
    // *A Construct within 30 feet makes a Spirit Resilience Test against your Spell DC
    // or is Charmed by you until the end of its next turn.*
    grant: Object.freeze({
      kind: "action", action: "half", resist: "spirit",
      inflicts: Object.freeze([Object.freeze({ condition: "charmed", value: null, until: "endOfNextTurn" })])
    }),
    onUse: Object.freeze({ aim: Object.freeze({ feet: 30, kinds: Object.freeze(["construct"]) }) }),
    reason: null
  }),
  Object.freeze({
    key: "harm-prevention-belt", name: "Harm Prevention Belt", use: "reaction",
    // 04's Gadgets table, its Use and Effect cells as the chapter prints them
    // (held to the chapter by `legacy-bodies.test.mjs`).
    useText: "Reaction, when an attack hits you",
    text: "Gain temporary Health equal to twice your tier before the damage lands.",
    grant: Object.freeze({ kind: "action", action: "reaction" }),
    // *Gain temporary Health equal to twice your tier before the damage lands* - 05's
    // temporary Health (D-777), until the encounter ends (MY READING: the belt names
    // no span, and the blow it answers is the encounter's).
    onUse: Object.freeze({ tempHealth: Object.freeze({ amount: "2*tier", span: "encounter" }) }),
    reason: null
  }),
  Object.freeze({
    key: "recombobulator", name: "Recombobulator", use: "half",
    // 04's Gadgets table, its Use and Effect cells as the chapter prints them
    // (held to the chapter by `legacy-bodies.test.mjs`).
    useText: "Half-Action",
    text: "One condition on a creature you touch ends, and the creature recovers Health equal to your tier.",
    // *One condition on a creature you touch ends, and the creature recovers Health
    // equal to your tier.*
    grant: Object.freeze({ kind: "action", action: "half", heal: "tier" }),
    // *A creature you touch* (the B2 review): one creature, within 5 feet - the user's
    // own token, targeted, for the user. It had no reach at all.
    onUse: Object.freeze({ cures: 1, aim: Object.freeze({ feet: 5, kinds: null }) }),
    reason: null
  }),
  Object.freeze({
    key: "parachute-cloak", name: "Parachute Cloak", use: "reaction",
    // 04's Gadgets table, its Use and Effect cells as the chapter prints them
    // (held to the chapter by `legacy-bodies.test.mjs`).
    useText: "Reaction, when you fall",
    text: "You and every ally within 10 feet fall at a walking pace and take no damage from landing. Each of you may move up to your Speed sideways for each round you fall.",
    grant: Object.freeze({ kind: "action", action: "reaction" }),
    onUse: Object.freeze({}),
    reason: "falling"
  })
]);

/** Why a gadget's effect, or part of it, stays the table's: `AZEROTH.Gadget.Reason.*`. */
export const GADGET_REASONS = Object.freeze({
  watch: "AZEROTH.Gadget.Reason.Watch",
  falling: "AZEROTH.Gadget.Reason.Falling"
});

/** A gadget by key, or null. */
export function gadgetByKey(key) {
  return GADGETS.find(g => g.key === key) ?? null;
}

/** A gadget's key off a `known` row's uuid (`gadget:<key>`), or null. */
export function gadgetKeyOf(uuid) {
  const s = String(uuid ?? "");
  if (!s.startsWith(GADGET_PREFIX)) return null;
  const key = s.slice(GADGET_PREFIX.length);
  return gadgetByKey(key) ? key : null;
}

/** The `known` row a gadget is recorded under. */
export function knownRowOf(gadget) {
  return { uuid: `${GADGET_PREFIX}${gadget.key}`, name: gadget.name };
}

/**
 * **HOW MANY GADGETS THE CHARACTER KNOWS**, off every taken `gadgets` row at its
 * rank, summed: Gadgeteer's two or four (`known: "2*rank"`) and Engineering
 * Upgrade's one per rank (`known: "rank"`).
 *
 * @param {Array} talents
 * @param {Function} [rowOf]
 * @returns {{known: number, by: string[]}}
 */
export function gadgetsKnownFor(talents = [], rowOf = talentEffect) {
  let known = 0;
  const by = [];
  for (const t of (talents ?? []).filter(x => (Math.trunc(Number(x?.taken)) || 0) > 0)
    .sort((a, b) => String(a.identifier).localeCompare(String(b.identifier)))) {
    const row = rowOf(t.className, t.identifier, t.race ?? null)?.gadgets ?? null;
    if (!row || typeof row !== "object" || row.known === undefined || row.known === null) continue;
    const rank = Math.max(1, Math.trunc(Number(t.taken)) || 1);
    const n = typeof row.known === "number" ? row.known : evaluateExpression(String(row.known), { rank });
    const add = Math.max(0, Math.trunc(Number(n)) || 0);
    if (!add) continue;
    known += add;
    by.push(t.name);
  }
  return { known, by };
}

/**
 * **THE GADGETS A FEATURE'S `known` NAMES**, in the table's order, each once, and no
 * more than the count allows (a rank taken back leaves the first ones).
 *
 * @param {Array<{uuid: string}>} known
 * @param {number} [allowed]
 * @returns {Array<object>}  `GADGETS` rows
 */
export function knownGadgets(known = [], allowed = Infinity) {
  const keys = new Set((known ?? []).map(k => gadgetKeyOf(k?.uuid)).filter(Boolean));
  return GADGETS.filter(g => keys.has(g.key)).slice(0, Math.max(0, Number.isFinite(allowed) ? Math.trunc(allowed) : GADGETS.length));
}

/**
 * **THE FEATURE A GADGET IS**: its descriptor, named for the gadget, once between
 * Short Rests (*Each gadget you know may be used once between Short Rests*).
 *
 * @param {object} gadget  a `GADGETS` row
 * @returns {object}
 */
export function gadgetFeature(gadget) {
  return {
    ...gadget.grant,
    name: gadget.name,
    level: 1,
    // The Effect cell, bold as the chapter sets it (the card enriches it).
    description: `<p>${String(gadget.text ?? "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}</p>`,
    uses: { max: 1, per: "short" },
    source: { document: "04-TALENTS", section: "Gadgets" }
  };
}

/**
 * **THE WEAPON A GADGET'S ATTACK IS MADE WITH** (04's Net-o-Matic Projector: *Make a
 * ranged attack against a creature within 40 feet*): no Item - `naturalWeapon`'s
 * shape, so every door that asks whether a thing is held reads it as in hand and a
 * shape's meld leaves it alone (the Gnomish Battle Rig keeps *gadgets*). A Range
 * makes it a shot (`ammunition.mjs#attackModes`): Dexterity, the Engaged Bane, and
 * refused past twice the range (06 §5).
 *
 * @param {{name?: string, range?: number|null, damage?: number|null}} attack  the card's `gadgetAttack`
 * @returns {object}
 */
export function gadgetWeapon(attack = {}) {
  const range = Math.trunc(Number(attack?.range));
  const damage = Math.trunc(Number(attack?.damage));
  return {
    ...naturalWeapon({ name: String(attack?.name ?? ""), damage: damage > 0 ? damage : null, traits: [], range: range > 0 ? range : null }),
    gadget: true
  };
}

/**
 * Why the gadgets known may not be changed now: in a fight (*Changing one you know
 * takes a week of downtime*). A lang key, or null.
 *
 * @param {{inFight?: boolean}} o
 */
export function gadgetChangeRefusal({ inFight = false } = {}) {
  return inFight ? "AZEROTH.Gadget.InFight" : null;
}

/* -------------------------------------------- */
/*  The gnome's two racial talents               */
/* -------------------------------------------- */

/** The race-row kinds the gnome's talents carry, read by `overclockFor` and `blueprintFor`. */
export const GNOME_KINDS = Object.freeze(["overclock", "blueprint"]);

/** The first taken row carrying a kind, with its talent. */
function rowWith(talents = [], kind, rowOf = talentEffect) {
  for (const t of (talents ?? []).filter(x => (Math.trunc(Number(x?.taken)) || 0) > 0)
    .sort((a, b) => String(a.identifier).localeCompare(String(b.identifier)))) {
    const row = rowOf(t.className, t.identifier, t.race ?? null)?.[kind] ?? null;
    if (row && typeof row === "object") return { talent: t, row };
  }
  return null;
}

/**
 * **OVERCLOCK** (02's gnome, tier 3): the talent, and what it reaches - a device the
 * character carries and a gadget it knows. Null where it is not taken.
 *
 * @param {Array} talents
 * @param {Function} [rowOf]
 * @returns {{identifier: string, name: string, gadgets: boolean, devices: boolean}|null}
 */
export function overclockFor(talents = [], rowOf = talentEffect) {
  const hit = rowWith(talents, "overclock", rowOf);
  if (!hit) return null;
  return { identifier: hit.talent.identifier, name: hit.talent.name, gadgets: hit.row.gadgets === true, devices: hit.row.devices === true };
}

/**
 * **A GADGET OVERCLOCKED, ON THE GADGET'S OWN FEATURE** (02's gnome: *a device you built
 * or a gadget you know works one step better and then breaks*; the B2 review): Overclock
 * marks the gadget, and the gadget's NEXT Use carries the line and spends its own use -
 * which is *then breaks*, until the Short Rest gives it back. It spent the use at the
 * Overclock and fired nothing. The mark ends with the encounter, or at a rest
 * (`AzerothActor#resetUses`): `{by, fight}`, the talent's name and the fight it was made
 * in (null out of one).
 */
export const OVERCLOCK_FLAG = "overclocked";

/**
 * An overclock mark as it may stand, cleaned, or null.
 *
 * @param {unknown} raw
 * @returns {{by: string, fight: string|null}|null}
 */
export function cleanOverclock(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.by !== "string" || !raw.by) return null;
  return { by: raw.by, fight: typeof raw.fight === "string" && raw.fight ? raw.fight : null };
}

/** The rest or the encounter's end an overclock mark ends at: the encounter's, a Short Rest's and a Long Rest's. */
export const OVERCLOCK_ENDS = Object.freeze(["encounter", "short", "long"]);

/**
 * **A GADGET'S SPENT USE SURVIVES A SWAP** (04's Gadgeteer: *Each gadget you know may be
 * used once between Short Rests*; the B2 review): a gadget swapped out through the
 * Gadgeteer's chooser and back was granted a fresh feature with a fresh use - a refresh
 * with no Short Rest. The use a withdrawn gadget had left is kept on the actor
 * (`gadgetsSpent`, by gadget key) and stamped on the feature granted for it again; a
 * Short Rest or a Long Rest clears the record, since it refreshes the use anyway.
 */
export const GADGETS_SPENT_FLAG = "gadgetsSpent";

/**
 * The record as it may stand, cleaned: a whole number of uses left, by gadget key.
 *
 * @param {unknown} raw
 * @returns {Record<string, number>}
 */
export function cleanGadgetsSpent(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
    const n = Math.trunc(Number(value));
    if (typeof key === "string" && key && Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return out;
}

/**
 * **WHAT ONE SYNC DOES TO THE RECORD**: each gadget withdrawn with a use spent is
 * recorded at what it had left; each gadget granted takes its recorded value, and its
 * record goes. Sorted keys, so the write never wobbles.
 *
 * @param {object} record  the actor's `gadgetsSpent`
 * @param {{withdrawn?: Array<{gadget: string, value: number, max: number}>, granted?: string[]}} o
 * @returns {{record: Record<string, number>, values: Record<string, number>, changed: boolean}}
 */
export function gadgetSpentSwap(record, { withdrawn = [], granted = [] } = {}) {
  const next = cleanGadgetsSpent(record);
  let changed = false;
  for (const w of withdrawn ?? []) {
    const value = Math.max(0, Math.trunc(Number(w?.value)) || 0);
    if (typeof w?.gadget !== "string" || !w.gadget || !(value < (Math.trunc(Number(w.max)) || 0))) continue;
    next[w.gadget] = value;
    changed = true;
  }
  const values = {};
  for (const key of granted ?? []) {
    if (!(key in next)) continue;
    values[key] = next[key];
    delete next[key];
    changed = true;
  }
  return { record: Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))), values, changed };
}

/**
 * **MEKKATORQUE'S BLUEPRINT** (02's gnome, tier 4): the talent, and what it builds -
 * an 08 §13 device or any of 04's gadgets. Null where it is not taken.
 *
 * @param {Array} talents
 * @param {Function} [rowOf]
 * @returns {{identifier: string, name: string, gadgets: boolean, devices: boolean}|null}
 */
export function blueprintFor(talents = [], rowOf = talentEffect) {
  const hit = rowWith(talents, "blueprint", rowOf);
  if (!hit) return null;
  return { identifier: hit.talent.identifier, name: hit.talent.name, gadgets: hit.row.gadgets === true, devices: hit.row.devices === true };
}

/**
 * **WHAT A BLUEPRINT STANDS AS**, cleaned: the gadget it built (`gadget`), or the
 * device item it embedded (`itemId`), and the talent. Null for anything else.
 *
 * @param {unknown} raw  the actor's `BLUEPRINT_FLAG`
 * @returns {{gadget: string|null, itemId: string|null, talentId: string|null}|null}
 */
export function cleanBlueprint(raw) {
  if (!raw || typeof raw !== "object") return null;
  const gadget = gadgetByKey(raw.gadget) ? raw.gadget : null;
  const itemId = typeof raw.itemId === "string" && raw.itemId ? raw.itemId : null;
  if (!gadget && !itemId) return null;
  return { gadget, itemId, talentId: typeof raw.talentId === "string" && raw.talentId ? raw.talentId : null };
}
