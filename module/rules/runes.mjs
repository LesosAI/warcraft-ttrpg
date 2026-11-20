/**
 * **RUNES AND RUNIC POWER** - the Death Knight's two numbers (02 §7's class entry,
 * the plan *i-want-to-work-vast-candy*; D-943). Pure: no Foundry imports.
 *
 * 02 §6 allows a class *Momentum, Power, or one of each, and never more than two
 * numbers*, and the Death Knight holds one of each:
 *
 * - **Power is its runes**, inscribed on the weapons it wields. The pool is DERIVED
 *   off those weapons (`CharacterData#prepareDerivedData`, as Sand's cap is off the
 *   Hourglass): nothing on the class item stores it.
 * - **Momentum is Runic Power**, gained by spending a rune and spent on spells and
 *   features.
 *
 * The lead's rulings, verbatim:
 * - *"a class feature could have the player inscribe runes of either Blood or Frost
 *   onto a weapon they have that they are proficient with. They select the ratio and
 *   they can have a number of runes on their weapon depending on the quality of the
 *   weapon. Epic having 6 runes (2 handed weapon, 1 handed weapons would have a 3 per
 *   weapon max. Legendary would have a higher number but dependant on the specific
 *   weapon."*
 * - **Two-handed 2 / 3 / 4 / 6; one-handed 1 / 2 / 2 / 3** (Common to Epic).
 * - *"If 2h amounts of runes are inscribed during a long rest, they are unable to
 *   wield it with one hand."*
 * - *"Runic Power is only gained by consuming runes"*; *"talents or features can
 *   exempt from this rule as an additonal way to gain runic power"*.
 * - *"make sure that runes being consumed for any reason like talents, etc provide
 *   runic power"*.
 * - *"a base amoutn plus half charisma modifier rounded down"*, the base 3 (*"we
 *   planned this"*).
 * - *"let's do a runic power cap of 10+charisma modifier"*, and asked whether a
 *   negative Charisma lowers it below 10: **"No"**.
 * - Runic Power empties **"Only on a Long Rest"** (`kept-pools.mjs`).
 *
 * **THE ONE SPEND** is `spendRunes`: every door that spends a rune - a feature, a
 * talent, the bare Half-Action, a later item - calls it, so no spend can skip its
 * Runic Power. `runes.test.mjs` holds a census over `module/` that fails a write to a
 * rune's spent state anywhere but `documents/runes.mjs`, the one writer.
 *
 * **THE STORED SHAPE** is on the WEAPON, as a coating is (D-668: the item carries
 * what was laid on it, and every number is derived): `system.runes` is null on a
 * weapon never inscribed, else `{grip, slots: [{kind, spent}]}` - `grip` the count
 * chosen at inscription (`"one"`, `"two"`, or null for a weapon with one grip), and
 * one slot a rune, Blood or Frost, spent or not. `system.runeSlots` is a Legendary's
 * own count by grip, `{two, one}`, where 08 §20's rune table states one.
 */

import { gripOf } from "./worn.mjs";
// The ONE named-gain refusal (the San'layn and Sovereign plan's C3): Runic Power, Essence, Tribute, Vitae.
import { namedGainRefusal } from "./named-gains.mjs";

/** The Power pool's key (`AZEROTH.powerTypes`). */
export const RUNES = "runes";

/** The Momentum pool's key (`AZEROTH.momentumTypes`). */
export const RUNIC_POWER = "runicPower";

/** The two kinds (`AZEROTH.runeKinds`). */
export const RUNE_KINDS = Object.freeze(["blood", "frost"]);

/**
 * **A CLASS WHOSE POWER LEAVES ITS SPELLS NO MANA PAYS THEM IN ITS MOMENTUM** (D-944),
 * keyed by the Power pool's name: the runes pay nothing, Runic Power pays 07's Mana 1
 * for 1, a Sustain's upkeep included. Read by `casting.mjs#spellPayment` and by
 * `turn-effects.mjs#upkeep`.
 */
// **AND THE SOVEREIGN PAYS IN VITAE** (02 §7: *You pay Vitae where 07-MAGIC asks for Mana to cast a
// spell*; the San'layn and Sovereign plan's V1): its Power IS Vitae, so the pool keyed by the class's
// Power name is that pool itself, 1 Vitae for each Mana printed.
export const CLASS_SPELL_POOL = Object.freeze({ [RUNES]: RUNIC_POWER, vitae: "vitae" });

/**
 * **A SUSTAIN CAST WITH RUNIC POWER HAS NO UPKEEP** (D-949; the lead: *"Death and Decay
 * and other spells should not have a sustain cost if the caster uses Runic Power to cast
 * them."*). Decided AT THE CAST from the pool the cast was paid in and recorded on the
 * sustaining entry (`upkeepFree`), never inferred from the class at the upkeep: a Death
 * Knight spell and a shared spell the knight pays 1 for 1 alike. It still holds the one
 * Sustain a caster may hold.
 */
export const UPKEEP_FREE_POOLS = Object.freeze([RUNIC_POWER]);

/** Whether a Sustain cast paid in this pool owes no upkeep (`UPKEEP_FREE_POOLS`). */
export function sustainUpkeepFree(paidIn) {
  return typeof paidIn === "string" && UPKEEP_FREE_POOLS.includes(paidIn);
}

/** The class (`AZEROTH.creationOnlyClasses`, `CLASS_ORDER`). */
export const DEATH_KNIGHT = "death-knight";

/**
 * Rune slots by rarity and grip (the lead's ladder). The Legendary row is the
 * FALLBACK where the weapon states no count of its own - 8 two-handed and 4
 * one-handed, the plan's draft read as the orchestrator's call (D-943).
 */
export const RUNE_SLOTS = Object.freeze({
  two: Object.freeze({ common: 2, uncommon: 3, rare: 4, epic: 6, legendary: 8 }),
  one: Object.freeze({ common: 1, uncommon: 2, rare: 2, epic: 3, legendary: 4 })
});

/** Runic Power a rune gives before Charisma: *"we planned this"* (3). */
export const RUNIC_POWER_BASE = 3;

/** The cap's base and its floor: *"10+charisma modifier"*, never below 10. */
export const RUNIC_POWER_CAP_BASE = 10;

/** The grip a count is read at: `"one"` or `"two"`. */
export const RUNE_GRIPS = Object.freeze(["one", "two"]);

/**
 * **A PRICE'S POOL WORD, IN ITS NUMBER** (the F2 review's note: Death Grip's chip read *1
 * Runes*): one rune is *Rune*, and every other pool keeps its own word. A lang key.
 *
 * @param {string|null} pool  the price's pool key
 * @param {number|string} amount
 * @param {Record<string, string>} table  `AZEROTH.costPoolTypes`
 * @returns {string}
 */
export function poolLabelKey(pool, amount, table = {}) {
  if (pool === RUNES && Math.trunc(Number(amount)) === 1) return "AZEROTH.Pool.Rune";
  return table?.[pool] ?? String(pool ?? "");
}

/**
 * **WHO MAY RAISE RUNIC POWER** (the lead: *"Runic Power is only gained by consuming runes"*,
 * and *"talents or features can exempt from this rule as an additonal way to gain runic
 * power"*; the F2 review's should-fix 6): a write that RAISES the pool must say which door
 * it is, and `AzerothActor#writePoolsNow` refuses one that names none of these - so a gain
 * by pool KIND (a `momentum` write that happens to land on Runic Power) can never slip past
 * the rule the way a census of names could not see.
 *
 * - `rune` - the one rune door (`documents/runes.mjs#spendRunesOn`);
 * - `feedsOnBlows` - 02's Unholy Presence, *once a round, when a blow damages you, gain 1
 *   Runic Power* (the exemption the lead allowed);
 * - `refund` - a withdrawn hit giving back a price it took (`dice/annotate.mjs`);
 * - `hand` - a GM's own hand on the sheet. A player's hand is refused;
 * - `killingMachine` - 04's Killing Machine in two hands (D-1017, as O-398's C raised it: *once a
 *   round, your melee hit at SL 2 or more gives you 1 Runic Power per rank*), a talent that
 *   says so (02's *unless a feature or talent says so*), written by
 *   `effects/death-knight-talents.mjs#dkOnHit` alone.
 */
// The list lives in the ONE named-gain table (`named-gains.mjs`, the San'layn and Sovereign plan's C3).
export { RUNIC_GAIN_SOURCES } from "./named-gains.mjs";

/**
 * Why this write may not raise Runic Power, or null where it may: a fall or no change is
 * never judged; a rise needs a source from `RUNIC_GAIN_SOURCES`, and `hand` a GM's.
 *
 * @param {{before?: number, after?: number, source?: string|null, gm?: boolean}} o
 * @returns {"unsourced"|"hand"|null}
 */
export function runicGainRefusal({ before = 0, after = 0, source = null, gm = false } = {}) {
  return namedGainRefusal(RUNIC_POWER, { before, after, source, gm });
}

const int = v => Math.trunc(Number(v)) || 0;
const sysOf = item => item?.system ?? item ?? {};

/* ------------------------------------------------------------------ */
/*  Runic Power                                                         */
/* ------------------------------------------------------------------ */

/**
 * Runic Power one rune gives: 3 plus half the Charisma modifier, ROUNDED DOWN (a
 * modifier of -1 gives 2, MY READING of *rounded down* on a negative half), never
 * below 0.
 *
 * @param {number} chaMod
 * @returns {number}
 */
export function runicPowerPerRune(chaMod = 0) {
  return Math.max(0, RUNIC_POWER_BASE + Math.floor(int(chaMod) / 2));
}

/** The cap: 10 plus the Charisma modifier, never below 10 (the lead: *"No"*). */
export function runicPowerCap(chaMod = 0) {
  return Math.max(RUNIC_POWER_CAP_BASE, RUNIC_POWER_CAP_BASE + int(chaMod));
}

/**
 * **THE MOMENTUM POOLS 05 §11's UNIVERSAL TRIGGERS NEVER REACH**: Runic Power (the lead:
 * *"Runic Power is only gained by consuming runes"*) and the Necromancer's Essence (the
 * lead: *Essence from "living" enemies dying within 120ft*; `essence.mjs#ESSENCE`, named
 * here as a word because `essence.mjs` reads this file's neighbours and an import back
 * would be a cycle - `necromancer-groundwork.test.mjs` holds the two words together).
 */
// And Tribute (02 §7: *A hit with your main-hand weapon, scoring SL 2 and winning an Opposed Test give
// you none*; the San'layn and Sovereign plan's B.4): its two lanes and its named doors are the only way in.
export const NO_UNIVERSAL_GAINS = Object.freeze([RUNIC_POWER, "essence", "tribute"]);

/**
 * **WHETHER A MOMENTUM POOL GAINS FROM 05 §11's UNIVERSAL TRIGGERS** - the +1 for a
 * hit, the +1 more at SL 2 and the +1 for winning an Opposed Test. Neither pool in
 * `NO_UNIVERSAL_GAINS` does; a feature or a talent row that names one is the only other
 * way in.
 */
export function gainsByUniversalTriggers(poolName) {
  return !NO_UNIVERSAL_GAINS.includes(poolName);
}

/* ------------------------------------------------------------------ */
/*  Rune slots                                                          */
/* ------------------------------------------------------------------ */

/** Whether a weapon carries 08 §5's Versatile trait, and so takes either count. */
export function isVersatile(weapon) {
  const traits = Array.isArray(sysOf(weapon).traits) ? sysOf(weapon).traits : [];
  return traits.some(t => /^Versatile\b/i.test(String(t)));
}

/**
 * The counts a weapon may be inscribed at: `["one", "two"]` for a Versatile weapon
 * (*"At inscription you choose the one-handed or the two-handed count"*), `["two"]`
 * for a two-handed weapon, `["one"]` for a one-handed one, and `[]` for a launcher or
 * a weapon nothing grips (a Death Knight is trained in no bow).
 *
 * The grip is `worn.mjs#gripOf`'s, read on the weapon WITHOUT its inscription, since
 * an inscribed two-handed count is what makes a Versatile weapon read two-handed.
 */
export function gripsOf(weapon) {
  if (!weapon) return [];
  const sys = sysOf(weapon);
  if (sys.launcher) return [];
  if (isVersatile(weapon)) return ["one", "two"];
  // The fields `gripOf` reads and nothing else: a document's own fields are not its
  // enumerable properties, so a spread of one would drop its flags.
  const bare = { system: { traits: sys.traits ?? [], source: sys.source ?? {}, launcher: sys.launcher ?? null }, flags: weapon.flags ?? {} };
  const grip = gripOf(bare);
  if (grip === "two-handed") return ["two"];
  if (grip === "one-handed" || grip === "hand-and-a-half") return ["one"];
  return [];
}

/**
 * The count a weapon is read at NOW: the count its inscription chose, where it chose
 * one it may; else its only grip; else, for a Versatile weapon not yet inscribed, the
 * one-handed count. Null where the weapon takes none.
 */
export function gripCount(weapon) {
  const grips = gripsOf(weapon);
  if (!grips.length) return null;
  const chosen = sysOf(weapon).runes?.grip ?? null;
  if (chosen && grips.includes(chosen)) return chosen;
  return grips.length === 1 ? grips[0] : "one";
}

/**
 * **HOW MANY RUNE SLOTS A WEAPON HAS** (02 §7's table): by rarity and grip, a
 * Legendary's own stated count (`system.runeSlots`) where it has one, and **0 on a
 * weapon the class is not trained with** (the lead: *"a weapon ... that they are
 * proficient with"*; `equipment-training.mjs#weaponTraining`, which the caller asks).
 *
 * @param {object} weapon  an item, or its system
 * @param {{trained?: boolean, grip?: "one"|"two"|null}} [o]  `grip` a count being
 *   chosen now (an inscription), else the weapon's own
 * @returns {number}
 */
export function runeSlots(weapon, { trained = false, grip = null } = {}) {
  if (!weapon || trained !== true) return 0;
  const grips = gripsOf(weapon);
  const count = grip && grips.includes(grip) ? grip : gripCount(weapon);
  if (!count) return 0;
  const sys = sysOf(weapon);
  const rarity = String(sys.rarity ?? "common").toLowerCase();
  if (rarity === "legendary") {
    // 08 §20's table, by the grip read now: a dash is null and falls to the default.
    const own = int(sys.runeSlots?.[count]);
    if (own > 0) return own;
  }
  return RUNE_SLOTS[count][rarity] ?? RUNE_SLOTS[count].common;
}

/* ------------------------------------------------------------------ */
/*  The stored inscription                                              */
/* ------------------------------------------------------------------ */

/**
 * **THE CLEAN `WeaponData.migrateData` RUNS** - present-key-safe AT EVERY DEPTH
 * (CLAUDE.md §15's recursive rule): only the keys handed in are touched.
 *
 * - `runes` handed in as anything but an object or null becomes null.
 * - `runes.grip` handed in and not `"one"`/`"two"` becomes null.
 * - `runes.slots` handed in and not an array becomes `[]`; an array is written WHOLE
 *   by any update (Foundry never merges into an array), so each entry is a whole rune
 *   and one whose `kind` is not Blood or Frost is no rune and is dropped; `spent`
 *   handed in as anything but a boolean is read as a truthy test.
 * - `runeSlots` handed in as anything but an object or null becomes null, and a
 *   `two` or `one` handed in that is not a whole number above 0 becomes null.
 *
 * @param {object} source  the weapon's system source, or an update's
 * @returns {object}  the same object
 */
export function cleanRuneFields(source) {
  if (!source || typeof source !== "object") return source;
  if ("runeSlots" in source && source.runeSlots !== null) {
    const own = source.runeSlots;
    if (typeof own !== "object" || Array.isArray(own)) source.runeSlots = null;
    else {
      for (const grip of RUNE_GRIPS) {
        if (!(grip in own) || own[grip] === null) continue;
        const n = Number(own[grip]);
        own[grip] = Number.isInteger(n) && n > 0 ? n : null;
      }
    }
  }
  if (!("runes" in source)) return source;
  const runes = source.runes;
  if (runes === null) return source;
  if (typeof runes !== "object" || Array.isArray(runes)) {
    source.runes = null;
    return source;
  }
  if ("grip" in runes && runes.grip !== null && !RUNE_GRIPS.includes(runes.grip)) runes.grip = null;
  if ("slots" in runes) {
    if (!Array.isArray(runes.slots)) runes.slots = [];
    else {
      runes.slots = runes.slots
        .filter(r => r && typeof r === "object" && RUNE_KINDS.includes(r.kind))
        .map(r => ("spent" in r && typeof r.spent !== "boolean" ? { ...r, spent: Boolean(r.spent) } : r));
    }
  }
  return source;
}

/**
 * The runes a weapon holds, read for play: each `{kind, spent}`, no more than the
 * weapon's slots (a slot lost to a rarity lowered by hand takes the runes past it
 * out of the pool, unwritten), and none on a weapon the class is not trained with.
 */
export function runesOf(weapon, { trained = false } = {}) {
  const stored = sysOf(weapon).runes;
  if (!stored || !Array.isArray(stored.slots)) return [];
  const slots = runeSlots(weapon, { trained });
  return stored.slots
    .filter(r => r && RUNE_KINDS.includes(r.kind))
    .slice(0, slots)
    .map(r => ({ kind: r.kind, spent: r.spent === true }));
}

/**
 * **WHY AN INSCRIPTION IS REFUSED** (02 §7's Inscribed Runeweapon: *When you finish a
 * Long Rest, inscribe a Blood rune or a Frost rune in each rune slot of the weapons you
 * wield and are trained with. You choose the ratio.*), judged before anything is
 * written. A word, or null where it may be made.
 *
 * - `untrained`: the class is not trained with the weapon - refused in words;
 * - `noSlots`: the weapon takes no runes (a launcher, a shield);
 * - `grip`: a Versatile weapon names no count, or a weapon names a count it cannot take;
 * - `ratio`: the Blood and Frost runes asked for do not fill every slot exactly.
 *
 * @param {{weapon: object, trained?: boolean, blood?: number, frost?: number, grip?: string|null}} o
 * @returns {"untrained"|"noSlots"|"grip"|"ratio"|null}
 */
export function inscriptionRefusal({ weapon, trained = false, blood = 0, frost = 0, grip = null } = {}) {
  if (!weapon) return "noSlots";
  if (trained !== true) return "untrained";
  const grips = gripsOf(weapon);
  if (!grips.length) return "noSlots";
  if (grips.length > 1 ? !RUNE_GRIPS.includes(grip) : (grip !== null && grip !== grips[0])) return "grip";
  const b = Number(blood), f = Number(frost);
  if (!Number.isInteger(b) || !Number.isInteger(f) || b < 0 || f < 0) return "ratio";
  const slots = runeSlots(weapon, { trained, grip: grip ?? grips[0] });
  if (slots < 1) return "noSlots";
  if (b + f !== slots) return "ratio";
  return null;
}

/**
 * **AN INSCRIPTION, AS IT IS STORED**: Blood first and then Frost, every rune
 * unspent, and the count chosen where the weapon takes two. Null with its refusal
 * where `inscriptionRefusal` refuses it.
 *
 * @param {Parameters<typeof inscriptionRefusal>[0]} o
 * @returns {{runes: {grip: string|null, slots: {kind: string, spent: boolean}[]}|null, refusal: string|null}}
 */
export function inscribe(o = {}) {
  const refusal = inscriptionRefusal(o);
  if (refusal) return { runes: null, refusal };
  const grips = gripsOf(o.weapon);
  const slots = [
    ...Array.from({ length: Number(o.blood) }, () => ({ kind: "blood", spent: false })),
    ...Array.from({ length: Number(o.frost) }, () => ({ kind: "frost", spent: false }))
  ];
  return { runes: { grip: grips.length > 1 ? o.grip : null, slots }, refusal: null };
}

/**
 * **A VERSATILE WEAPON INSCRIBED AT THE TWO-HANDED COUNT** cannot be wielded in one
 * hand until the next Long Rest (the lead: *"If 2h amounts of runes are inscribed
 * during a long rest, they are unable to wield it with one hand."*). `worn.mjs#gripOf`
 * reads the same field, so the off hand is barred and the bar says why.
 */
export function inscribedTwoHanded(weapon) {
  return isVersatile(weapon) && sysOf(weapon).runes?.grip === "two";
}

/* ------------------------------------------------------------------ */
/*  The pool                                                            */
/* ------------------------------------------------------------------ */

/**
 * **THE RUNES ON THE WEAPONS WIELDED**, one row a weapon, ordered by id so the panel
 * and the spend never swap two weapons between preparations (CLAUDE.md §15). A weapon
 * the knight stops wielding leaves the pool and keeps its runes, spent ones still
 * spent, for the day it is wielded again (the plan's live check).
 *
 * @param {Iterable<object>} weapons  `actor.readyWeapons()` - the one accessor (D-769)
 * @param {(weapon: object) => boolean} trainedWith  `equipment-training.mjs#weaponTraining`
 * @returns {{itemId: string|null, name: string, slots: number, grip: string|null, runes: {kind: string, spent: boolean}[]}[]}
 */
export function wieldedRunes(weapons = [], trainedWith = () => false) {
  const rows = [];
  for (const w of weapons ?? []) {
    if (!w || w.natural) continue;
    const trained = trainedWith(w) === true;
    const slots = runeSlots(w, { trained });
    if (!slots) continue;
    rows.push({ itemId: w.id ?? w._id ?? null, name: String(w.name ?? ""), slots, grip: gripCount(w), runes: runesOf(w, { trained }) });
  }
  rows.sort((a, b) => String(a.itemId ?? "").localeCompare(String(b.itemId ?? "")));
  return rows;
}

/**
 * The Power pool those runes are: `max` the runes inscribed, `value` the unspent, and
 * each kind's own pair; `slots` every slot, inscribed or not, for the panel's empty
 * sockets.
 *
 * @param {ReturnType<typeof wieldedRunes>} rows
 */
export function runePool(rows = []) {
  const out = { slots: 0, max: 0, value: 0, blood: { value: 0, max: 0 }, frost: { value: 0, max: 0 } };
  for (const row of rows ?? []) {
    out.slots += row.slots;
    for (const r of row.runes) {
      out.max += 1;
      out[r.kind].max += 1;
      if (!r.spent) {
        out.value += 1;
        out[r.kind].value += 1;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Spending and refilling                                              */
/* ------------------------------------------------------------------ */

/**
 * **WHY A SPEND IS REFUSED**, judged before anything is spent (D-768's order): a count
 * that is not a whole number above 0, a kind that is neither Blood, Frost nor `any`,
 * or fewer unspent runes of that kind than the cost.
 *
 * @param {ReturnType<typeof wieldedRunes>} rows
 * @param {{kind?: "blood"|"frost"|"any", count?: number}} o
 * @returns {"count"|"kind"|"short"|null}
 */
export function spendRefusal(rows = [], { kind = "any", count = 1 } = {}) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1) return "count";
  if (kind !== "any" && !RUNE_KINDS.includes(kind)) return "kind";
  const pool = runePool(rows);
  const held = kind === "any" ? pool.value : pool[kind].value;
  return held < n ? "short" : null;
}

/**
 * **THE ONE RUNE SPEND** (the plan's Phase 4 door 2, built here as its law): every
 * rune spent, for any reason, gives Runic Power, once for each rune (the lead: *"make
 * sure that runes being consumed for any reason like talents, etc provide runic
 * power"*), and Runic Power above the cap is lost.
 *
 * The runes are taken in a fixed order - the weapons by id, then each weapon's slots
 * first to last - and for `any`, the first unspent rune of either kind, so two
 * presses of one spend never take different runes.
 *
 * @param {{weapons: ReturnType<typeof wieldedRunes>, runicPower?: number, chaMod?: number,
 *   frostBonus?: number}} state  `frostBonus` what a row adds to each FROST rune spent
 *   (04's Killing Machine, read at this same door; the caller judges its gate)
 * @param {{kind?: "blood"|"frost"|"any", count?: number}} spend
 * @returns {{runes: ReturnType<typeof wieldedRunes>, runicPower: number, gained: number,
 *   spent: {itemId: string|null, index: number, kind: string}[], refusal: string|null}}
 *   `gained` what actually landed under the cap; `runes` the rows after the spend
 */
export function spendRunes(state = {}, { kind = "any", count = 1 } = {}) {
  const rows = state.weapons ?? [];
  const before = Math.max(0, int(state.runicPower));
  const cap = runicPowerCap(state.chaMod);
  const refusal = spendRefusal(rows, { kind, count });
  if (refusal) return { runes: rows, runicPower: before, gained: 0, spent: [], refusal };
  let left = Number(count);
  const spent = [];
  const after = rows.map(row => ({ ...row, runes: row.runes.map(r => ({ ...r })) }));
  for (const row of after) {
    row.runes.forEach((r, index) => {
      if (left < 1 || r.spent || (kind !== "any" && r.kind !== kind)) return;
      r.spent = true;
      left -= 1;
      spent.push({ itemId: row.itemId, index, kind: r.kind });
    });
  }
  const per = runicPowerPerRune(state.chaMod);
  const bonus = Math.max(0, int(state.frostBonus));
  const owed = spent.reduce((n, r) => n + per + (r.kind === "frost" ? bonus : 0), 0);
  const runicPower = Math.min(Math.max(cap, before), before + owed);
  return { runes: after, runicPower, gained: runicPower - before, spent, refusal: null };
}

/**
 * **REFILL**: a Long Rest refills every spent rune (`kind` `any`, no `count`); Blood
 * Tap and Empower Runeweapon refill a number of one kind (04). Taken in the spend's
 * own order. Returns the rows after and how many came back.
 *
 * @param {ReturnType<typeof wieldedRunes>} rows
 * @param {{kind?: "blood"|"frost"|"any", count?: number}} [o]
 */
export function refillRunes(rows = [], { kind = "any", count = Infinity } = {}) {
  let left = count === Infinity ? Infinity : Math.max(0, int(count));
  let refilled = 0;
  const after = (rows ?? []).map(row => ({
    ...row,
    runes: row.runes.map(r => {
      if (left < 1 || !r.spent || (kind !== "any" && r.kind !== kind)) return { ...r };
      left -= 1;
      refilled += 1;
      return { ...r, spent: false };
    })
  }));
  return { runes: after, refilled };
}

/**
 * **A WITHDRAWN HIT'S RUNES, GIVEN BACK** (the F2 review's must-fix 2; O-346): each rune
 * the spend named - by weapon and slot - is marked unspent where it is STILL spent and
 * still that kind (a slot refilled or re-inscribed since is left alone), and the Runic
 * Power those runes gave comes back off, never below nothing.
 *
 * **A REST SINCE THE SPEND GIVES NOTHING BACK** (the F3 review): the row carries the rest
 * generation it was spent in (`restGeneration`), and where the knight has rested since, a
 * slot may be spent again and the refund would unspend the new spend, so nothing is given
 * back and nothing taken off. **And the Runic Power comes off only for the runes that came
 * back**: none back, none off; some back, their share of the gain, rounded down.
 *
 * @param {{stored?: Record<string, Array<{kind: string, spent?: boolean}>>,
 *   spent?: Array<{itemId: string, index: number, kind: string}>, runicPower?: number, gained?: number,
 *   generation?: number|null, now?: number|null}} o
 *   `stored` each named weapon's stored slots; `generation` the row's rest generation, `now` the knight's
 * @returns {{writes: Array<object>, runicPower: number, refunded: number}}  the weapon writes
 *   (`{_id, "system.runes.slots"}`, the whole array), the pool's value after, and how many came back
 */
export function refundRunes({ stored = {}, spent = [], runicPower = 0, gained = 0, generation = null, now = null } = {}) {
  const slotsById = new Map();
  let refunded = 0;
  if (Number.isInteger(generation) && Number.isInteger(now) && generation !== now) return { writes: [], runicPower: Math.max(0, int(runicPower)), refunded: 0 };
  for (const r of spent ?? []) {
    const id = typeof r?.itemId === "string" ? r.itemId : null;
    const index = Number.isInteger(r?.index) ? r.index : -1;
    if (!id || index < 0 || !Array.isArray(stored?.[id])) continue;
    const slots = slotsById.get(id) ?? stored[id].map(s => ({ kind: s?.kind, spent: s?.spent === true }));
    const slot = slots[index];
    if (slot && slot.spent === true && slot.kind === r.kind) {
      slot.spent = false;
      refunded += 1;
    }
    slotsById.set(id, slots);
  }
  const writes = [...slotsById.entries()]
    .filter(([id, slots]) => JSON.stringify(slots) !== JSON.stringify(stored[id].map(s => ({ kind: s?.kind, spent: s?.spent === true }))))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, slots]) => ({ _id: id, "system.runes.slots": slots }));
  const named = (spent ?? []).length;
  const off = refunded > 0 && named > 0 ? Math.floor(Math.max(0, int(gained)) * Math.min(refunded, named) / named) : 0;
  const value = Math.max(0, int(runicPower) - off);
  return { writes, runicPower: refunded > 0 ? value : Math.max(0, int(runicPower)), refunded };
}

/**
 * **WHAT A LONG REST DOES TO ONE WEAPON'S STORED RUNES**: every spent rune refills
 * (02 §7: *Your spent runes refill when you finish a Long Rest*) on EVERY weapon the
 * knight owns, wielded or not, and the inscription - its ratio and the count chosen -
 * stands until the knight inscribes anew (D-950 as the F2 review corrected it: the rest
 * opens the window to inscribe and clears nothing, and the NEW inscription writes the
 * count it chooses, so a knight who rests and does not inscribe, or is ambushed first,
 * keeps every rune and the two-handed bar with them). Null where nothing changes.
 *
 * @param {{grip?: string|null, slots?: Array<{kind: string, spent?: boolean}>}|null} stored
 * @returns {Array<{kind: string, spent: false}>|null}  the whole slots array to write
 */
export function restedSlots(stored) {
  const slots = Array.isArray(stored?.slots) ? stored.slots : [];
  if (!slots.some(r => r?.spent === true)) return null;
  return slots.filter(r => r && RUNE_KINDS.includes(r.kind)).map(r => ({ kind: r.kind, spent: false }));
}

/**
 * The weapon writes a spend or a refill makes, in the shape `documents/runes.mjs`
 * hands `updateEmbeddedDocuments`: one `{_id, "system.runes.slots": [...]}` a weapon
 * that changed, the WHOLE array (an array is never merged), carrying any rune past the
 * row's read slots unchanged so nothing stored is lost by a spend.
 *
 * @param {ReturnType<typeof wieldedRunes>} before
 * @param {ReturnType<typeof wieldedRunes>} after
 * @param {(itemId: string) => object|null} storedOf  the weapon's stored `system.runes`
 */
export function runeWrites(before = [], after = [], storedOf = () => null) {
  const out = [];
  for (const row of after ?? []) {
    const was = (before ?? []).find(b => b.itemId === row.itemId);
    if (!was || JSON.stringify(was.runes) === JSON.stringify(row.runes)) continue;
    const stored = storedOf(row.itemId)?.slots ?? [];
    const slots = stored.map((r, i) => (i < row.runes.length ? { kind: row.runes[i].kind, spent: row.runes[i].spent } : { kind: r.kind, spent: r.spent === true }));
    out.push({ _id: row.itemId, "system.runes.slots": slots });
  }
  return out;
}
