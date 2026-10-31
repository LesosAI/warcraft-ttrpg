/**
 * **THE TINKER'S GADGETS** (the Legacy branches' door 7). Pure: no Foundry imports
 * (CLAUDE.md §3).
 *
 * Gadgeteer grants 2 + character tier choices at one rank. During a Long Rest,
 * The Bench lets the character replace one known gadget. Engineering Upgrade
 * adds one known gadget per rank. Each gadget has one use between Short Rests.
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
 *   D-673): the Gadgeteer feature's Use fills empty slots outside a fight. The
 *   Long Rest opens the same checklist for one replacement with The Bench.
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
 * **04's GADGETS**, in the table's order. `use` is the table's Use column as
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
    text: "Make a ranged attack against a creature within 40 feet. On a hit, the net leaves it **Entangled**. It can escape by spending an action and passing a Reflex Resilience Test against your Spell DC.",
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
    text: "You and your allies within 10 feet become hidden for one minute, even if someone is watching you. Each creature loses this protection when it attacks or casts a spell.",
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
    text: "Place the bot on the ground. For 8 hours, it reveals any creature that comes within 30 feet, even if the creature is hidden. Its alarm wakes everyone within 30 feet.",
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
    text: "Aim the ray at a creature within 30 feet. It makes a Spirit Resilience Test against your Spell DC. On a failure, it is **Slowed** and **Silenced** until the end of its next turn.",
    // *A creature within 30 feet makes a Spirit Resilience Test against your Spell DC
    // or is Slowed and Silenced until the end of its next turn.*
    grant: Object.freeze({
      kind: "action", action: "half", resist: "spirit",
      inflicts: Object.freeze([
        Object.freeze({ condition: "slowed", value: null, until: "endOfNextTurn", onFail: true }),
        Object.freeze({ condition: "silenced", value: null, until: "endOfNextTurn", onFail: true })
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
    text: "Choose a Construct within 30 feet. It makes a Spirit Resilience Test against your Spell DC. On a failure, it is **Charmed** by you until the end of its next turn.",
    // *A Construct within 30 feet makes a Spirit Resilience Test against your Spell DC
    // or is Charmed by you until the end of its next turn.*
    grant: Object.freeze({
      kind: "action", action: "half", resist: "spirit",
      inflicts: Object.freeze([Object.freeze({ condition: "charmed", value: null, until: "endOfNextTurn", onFail: true })])
    }),
    onUse: Object.freeze({ aim: Object.freeze({ feet: 30, kinds: Object.freeze(["construct"]) }) }),
    reason: null
  }),
  Object.freeze({
    key: "harm-prevention-belt", name: "Harm Prevention Belt", use: "reaction",
    // 04's Gadgets table, its Use and Effect cells as the chapter prints them
    // (held to the chapter by `legacy-bodies.test.mjs`).
    useText: "Reaction, when an attack hits you",
    text: "Activate the belt before the attack deals its damage. You gain temporary Health equal to twice your tier.",
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
    text: "Touch a creature and end one condition affecting it. It also recovers Health equal to your tier.",
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
    text: "You and your allies within 10 feet descend at a walking pace and take no damage when you land. Each round you fall, you may each move sideways up to your Speed.",
    grant: Object.freeze({ kind: "action", action: "reaction" }),
    onUse: Object.freeze({}),
    reason: "falling"
  }),
  Object.freeze({
    key: "gnomish-death-ray", name: "Gnomish Death Ray", use: "full",
    useText: "Full Action",
    text: "Take damage equal to your tier. This damage ignores Armor, Ward and temporary Health. If this damage would reduce you below 1 Health, this effect fails. Otherwise, make a ranged attack against a creature within 40 feet. On a hit, the ray deals Fire damage with a Damage Rating of 2 plus twice your tier. Overclock increases this Damage Rating by 1.",
    grant: Object.freeze({ kind: "action", action: "full" }),
    onUse: Object.freeze({
      selfDamage: "tier", aim: Object.freeze({ feet: 40, kinds: null }),
      gadgetAttack: Object.freeze({ range: 40, maxRange: 40, damage: "2+2*tier", damageType: "fire", overclockDamage: 1 })
    }),
    reason: null
  }),
  Object.freeze({
    key: "gnomish-shrink-ray", name: "Gnomish Shrink Ray", use: "half",
    useText: "Half-Action",
    text: "Aim the ray at a creature within 30 feet. It makes a Spirit Resilience Test against your Spell DC. On a failure, reduce the damage of its weapon attacks by your tier, to a minimum of 0, until the end of its next turn. Its size, reach and equipment are unchanged.",
    grant: Object.freeze({ kind: "action", action: "half", resist: "spirit" }),
    onUse: Object.freeze({ shrink: true, aim: Object.freeze({ feet: 30, kinds: null }) }),
    reason: null
  }),
  Object.freeze({
    key: "gyroscopic-stabilizer", name: "Gyroscopic Stabilizer", use: "reaction",
    useText: "Reaction, before being knocked Prone",
    text: "Activate the stabilizer to remain standing. This prevents the knockdown but does not stop any other forced movement or protect you from later knockdowns.",
    grant: Object.freeze({ kind: "action", action: "reaction" }),
    onUse: Object.freeze({ preventsProne: true }),
    reason: null
  }),
  Object.freeze({
    key: "gnomish-mind-control-cap", name: "Gnomish Mind Control Cap", use: "half",
    useText: "Half-Action",
    text: "Choose a Humanoid within 30 feet. It makes a Spirit Resilience Test against your Spell DC. On a failure, it is **Charmed** by you until the end of its next turn. Bosses are unaffected.",
    grant: Object.freeze({
      kind: "action", action: "half", resist: "spirit",
      inflicts: Object.freeze([Object.freeze({ condition: "charmed", value: null, until: "endOfNextTurn", onFail: true })])
    }),
    onUse: Object.freeze({ aim: Object.freeze({ feet: 30, kinds: Object.freeze(["humanoid"]), noBoss: true }) }),
    reason: null
  }),
  Object.freeze({
    key: "deepdive-rebreather", name: "Deepdive Rebreather", use: null,
    useText: "One minute",
    text: "Fit the rebreather to yourself or a willing creature you touch. The wearer can breathe underwater for one hour. It does not increase swimming Speed or protect against water pressure.",
    grant: Object.freeze({ kind: "action", action: null }),
    onUse: Object.freeze({ waterBreathing: Object.freeze({ minutes: 60 }), aim: Object.freeze({ feet: 5, kinds: null }) }),
    reason: null
  }),
  Object.freeze({
    key: "polarity-retrieval-coil", name: "Polarity Retrieval Coil", use: "half",
    useText: "Half-Action",
    text: "Pull a metal object within 30 feet into your empty hand. It can weigh up to 10 lb, must have a clear path to you, and cannot be held, worn or fastened in place.",
    grant: Object.freeze({ kind: "action", action: "half" }),
    onUse: Object.freeze({}),
    reason: "retrieval"
  }),
  Object.freeze({
    key: "emergency-foam-sprayer", name: "Emergency Foam Sprayer", use: "half",
    useText: "Half-Action",
    text: "Spray a creature within 10 feet. Its **Scorched** condition ends, and ordinary flames in its space go out. The foam does not end a magical effect that could set it alight again.",
    grant: Object.freeze({ kind: "action", action: "half" }),
    onUse: Object.freeze({
      cures: Object.freeze({ count: 1, only: Object.freeze(["scorched"]) }),
      aim: Object.freeze({ feet: 10, kinds: null })
    }),
    reason: "flames"
  }),
  Object.freeze({
    key: "flash-pulse-projector", name: "Flash-Pulse Projector", use: "half",
    useText: "Half-Action",
    text: "Release a flash in a 10-foot cone. Every creature in the cone makes a Reflex Resilience Test against your Spell DC. On a failure, it takes a Bane on its next Attack Test before the end of its next turn.",
    grant: Object.freeze({ kind: "action", action: "half", resist: "reflex", area: "A 10 ft cone" }),
    onUse: Object.freeze({ nextAttackBane: 1 }),
    reason: null
  })
]);

/** Why a gadget's effect, or part of it, stays the table's: `AZEROTH.Gadget.Reason.*`. */
export const GADGET_REASONS = Object.freeze({
  watch: "AZEROTH.Gadget.Reason.Watch",
  falling: "AZEROTH.Gadget.Reason.Falling",
  retrieval: "AZEROTH.Gadget.Reason.Retrieval",
  flames: "AZEROTH.Gadget.Reason.Flames"
});

/** A gadget by key, or null. */
export function gadgetByKey(key) {
  return GADGETS.find(g => g.key === key) ?? null;
}

/** Target restrictions are checked before payment and again on a delayed card. */
export function gadgetTargetRefusal(gadget, target = {}) {
  const aim = gadget?.onUse?.aim;
  if (!aim) return null;
  if (aim.noBoss && (target.isBoss === true || target.weightClass === "boss")) return "AZEROTH.Gadget.BossImmune";
  if (aim.kinds?.length && !aim.kinds.includes(target.creatureType)) return "AZEROTH.Gadget.WrongKind";
  return null;
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
 * rank, summed: Gadgeteer's 2 + character tier (`known: "2+tier"`) and Engineering
 * Upgrade's one per rank (`known: "rank"`).
 *
 * @param {Array} talents
 * @param {Function} [rowOf]
 * @param {{tier?: number}} [options] character tier, including both classes
 * @returns {{known: number, by: string[]}}
 */
export function gadgetsKnownFor(talents = [], rowOf = talentEffect, { tier = 1 } = {}) {
  tier = Math.min(4, Math.max(1, Math.trunc(Number(tier)) || 1));
  let known = 0;
  const by = [];
  for (const t of (talents ?? []).filter(x => (Math.trunc(Number(x?.taken)) || 0) > 0)
    .sort((a, b) => String(a.identifier).localeCompare(String(b.identifier)))) {
    const row = rowOf(t.className, t.identifier, t.race ?? null)?.gadgets ?? null;
    if (!row || typeof row !== "object" || row.known === undefined || row.known === null) continue;
    const rank = Math.max(1, Math.trunc(Number(t.taken)) || 1);
    const n = typeof row.known === "number" ? row.known : evaluateExpression(String(row.known), { rank, tier });
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
  const weapon = naturalWeapon({ name: String(attack?.name ?? ""), damage: damage > 0 ? damage : null, traits: [], range: range > 0 ? range : null });
  return {
    ...weapon,
    system: { ...weapon.system, damageType: attack.damageType ?? null, maxRange: attack.maxRange ?? null },
    gadget: true
  };
}

export const SHRINK_FLAG = "gadgetShrink";

/** Repeated rays do not stack: use the strongest active reduction. */
export function shrinkAmount(effects = []) {
  return effects.reduce((best, effect) => {
    if (effect?.active === false || effect?.disabled === true) return best;
    const n = Number(effect?.flags?.["azeroth-rpg"]?.[SHRINK_FLAG]?.amount);
    return Number.isFinite(n) ? Math.max(best, Math.min(4, Math.max(0, Math.trunc(n)))) : best;
  }, 0);
}

/** Subtract once from the resolved weapon hit, preserving its typed-part total. */
export function shrinkDamage(result, amount = 0) {
  if (!result || !(amount > 0)) return result;
  const reduction = Math.min(Math.max(0, result.damage), Math.trunc(amount));
  let remaining = reduction;
  const take = n => { const taken = Math.min(Math.max(0, n), remaining); remaining -= taken; return n - taken; };
  const mainDamage = take(result.mainDamage ?? result.damage);
  const parts = result.parts?.map(part => ({ ...part, damage: take(part.damage) }));
  return { ...result, damage: result.damage - reduction, shrinkReduction: reduction,
    ...(parts ? { mainDamage, parts } : {}) };
}

/** Resolve only the gadget's printed Rating. The attack pipeline adds SL once. */
export function gadgetAttackAt(gadget, { tier = 1, overclocked = false } = {}) {
  const attack = gadget?.onUse?.gadgetAttack;
  if (!attack) return null;
  tier = Math.min(4, Math.max(1, Math.trunc(Number(tier)) || 1));
  const base = evaluateExpression(String(attack.damage ?? 0), { tier });
  return { ...attack, damage: Math.max(0, Math.trunc(base) || 0) + (overclocked ? attack.overclockDamage ?? 0 : 0) };
}

/** Death Ray pays from Health itself; protection and temporary Health are irrelevant. */
export function gadgetHealthCost(gadget, { tier = 1, health = 0 } = {}) {
  tier = Math.min(4, Math.max(1, Math.trunc(Number(tier)) || 1));
  const cost = Math.max(0, Math.trunc(evaluateExpression(String(gadget?.onUse?.selfDamage ?? 0), { tier })) || 0);
  return { cost, refused: cost > 0 && (!Number.isFinite(health) || health - cost < 1) };
}

/**
 * Choosing or replacing gadgets is refused during a fight. A lang key, or null.
 *
 * @param {{inFight?: boolean}} o
 */
export function gadgetChangeRefusal({ inFight = false } = {}) {
  return inFight ? "AZEROTH.Gadget.InFight" : null;
}

/** Initial learning fills empty slots. Replacing one known gadget needs The Bench
 * during a Long Rest; one rest never replaces a whole loadout. */
export function gadgetSelectionRefusal({ known = [], selected = [], allowed = 0, longRest = false, bench = false } = {}) {
  const before = new Set(knownGadgets(known).map(g => g.key));
  const after = new Set(selected);
  if (after.size !== selected.length || [...after].some(key => !gadgetByKey(key)) || after.size > allowed)
    return "AZEROTH.Gadget.TooMany";
  const removed = [...before].filter(key => !after.has(key)).length;
  if (!removed) return null;
  if (!bench) return "AZEROTH.Gadget.NeedBench";
  if (!longRest) return "AZEROTH.Gadget.NeedLongRest";
  if (removed > 1) return "AZEROTH.Gadget.OneSwap";
  return null;
}

/* -------------------------------------------- */
/*  The Gadgets compendium                       */
/* -------------------------------------------- */

/**
 * **04's GADGETS HAVE A COMPENDIUM OF THEIR OWN** (the lead, 2026-10-24: *"On tinkerer,
 * the gadget table is not linked within the talent gadgeteer. I also do not see them in
 * the compendium browser"*, and the decision that answered it: a feature item for each, in
 * a Gadgets pack, with a category of its own in the browser).
 * `tools/parse-book/gadgets.mjs` renders 04's table into it - the name, the Use and the
 * Effect off the chapter, the action off the Use, the use off Gadgeteer's own sentence, and
 * the Resist and the heal off `GADGETS` by key - and `gadgets-pack.test.mjs` holds the pack
 * and `GADGETS` to each other both ways.
 *
 * **An entry is a reference, never a sheet's.** A gadget a character knows is the feature
 * the sync grants from `GADGETS` (`gadgetFeature`), keyed by the talent that knows it; the
 * entry is what Gadgeteer's text, the chooser rows, the cards and the browser point at.
 */
export const GADGETS_PACK = "azeroth-rpg.gadgets";

/** The uuid every entry in the Gadgets compendium opens on. */
export const GADGET_UUID_PREFIX = `Compendium.${GADGETS_PACK}.Item.`;

/**
 * The mark an entry wears, `flags.azeroth-rpg.gadgetEntry = {use}`: 04's Use cell, which the
 * browser's Use facet reads - a feature's `action` has no word for *One minute* and none for
 * a Reaction's trigger. It travels with every copy of the entry (a drag onto a sheet, a
 * macro, an import into the world), which is what lets `isGadgetEntry` refuse it at every
 * door.
 */
export const GADGET_ENTRY_FLAG = "gadgetEntry";

/**
 * **WHETHER THIS IS A GADGETS-COMPENDIUM ENTRY, OR A COPY OF ONE.** `AzerothItem#_preCreate`
 * refuses one on any actor, in words - the sync is the one door that grants a gadget - and
 * the character sheet asks the same question before any drop zone writes anything (D-745's
 * order). It reads a live document and `toObject()` data alike, `loot-offer.mjs#underOffer`'s
 * shape: `Document#flags` is the source object.
 *
 * @param {{flags?: object}} data  an Item, or the data one is created from
 * @returns {boolean}
 */
export function isGadgetEntry(data) {
  const mark = data?.flags?.["azeroth-rpg"]?.[GADGET_ENTRY_FLAG];
  return Boolean(mark) && typeof mark === "object";
}

/**
 * **THE RUNG 04's USE CELL NAMES**: *Half-Action*, *Action*, *Full Action*, *Reaction, when
 * ...*, or none - *One minute* is no turn's. The parser stamps an entry's `action` with it,
 * so the entry's rung is read off the chapter, and `GADGETS`' own `use` is the hand copy the
 * census holds to it.
 *
 * @param {string} useText  the Use cell
 * @returns {"half"|"action"|"full"|"reaction"|null}
 */
export function gadgetActionOf(useText) {
  const s = String(useText ?? "").replace(/\*/g, "").trim();
  if (/^Half-Action\b/i.test(s)) return "half";
  if (/^Full Action\b/i.test(s)) return "full";
  if (/^Action\b/i.test(s)) return "action";
  if (/^Reaction\b/i.test(s)) return "reaction";
  return null;
}

/**
 * **A GADGET'S LINK**: `@UUID[...]{name}` to its entry, the mark core's enricher draws as a
 * content link wherever the text is enriched - a chooser row, a card, a talent's text. Empty
 * where there is no entry to point at (a world not restarted since the pack was built), so a
 * row prints no link rather than a broken one.
 *
 * @param {{uuid?: string|null, name?: string}} entry
 * @returns {string}
 */
export function gadgetLink(entry) {
  const uuid = typeof entry?.uuid === "string" ? entry.uuid.trim() : "";
  const name = String(entry?.name ?? "").trim();
  return uuid && name ? `@UUID[${uuid}]{${name}}` : "";
}

/**
 * The link as a line of its own, the shape `workflows.mjs#chosenHTML` gives a pick's link:
 * the line a chooser row opens its text on, and so the line its card prints.
 *
 * @param {{uuid?: string|null, name?: string}} entry
 * @returns {string}
 */
export function gadgetLinkLine(entry) {
  const link = gadgetLink(entry);
  return link ? `<p>${link}</p>` : "";
}

/**
 * **THE TABLE A TALENT NAMES, AS LINKS** (04's Gadgeteer: *You know two gadgets from the
 * **Gadgets** table below*): one paragraph under the talent's own words, opening on the
 * table's bold label as 04 prints it, then every entry linked, in the table's order. The
 * parser appends it (`tools/parse-book/talents.mjs`), and migration 0.12.30 reads it back
 * off the pack copy with `withoutGadgetLinks`.
 *
 * @param {Array<{uuid: string, name: string}>} entries
 * @param {string} [label]  the table's bold label
 * @returns {string}
 */
export function gadgetsParagraph(entries = [], label = "Gadgets") {
  const links = (entries ?? []).map(gadgetLink).filter(Boolean);
  return links.length ? `<p><strong>${label}.</strong> ${links.join(", ")}</p>` : "";
}

/** The entries' uuid prefix, escaped for a pattern. */
const PREFIX_PATTERN = GADGET_UUID_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A paragraph that links into the Gadgets compendium, never crossing out of its own `<p>`. */
const LINKED_PARAGRAPH = new RegExp(String.raw`<p>(?:(?!</p>)[\s\S])*?@UUID\[` + PREFIX_PATTERN + String.raw`(?:(?!</p>)[\s\S])*?</p>`, "g");

/**
 * A text with every paragraph that links into the Gadgets compendium taken out: what a
 * talent's words were before the parser linked the table under them.
 *
 * @param {string} html
 * @returns {string}
 */
export function withoutGadgetLinks(html = "") {
  return String(html ?? "").replace(LINKED_PARAGRAPH, "");
}

/** Whether a text links to an entry in the Gadgets compendium. */
export function linksGadgets(html = "") {
  return String(html ?? "").includes(`@UUID[${GADGET_UUID_PREFIX}`);
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
