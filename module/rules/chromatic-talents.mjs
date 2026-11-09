/**
 * **THE CHROMATIC CHAMPION'S BRANCH TALENTS, AS LAW** (04's Life-Binder and Earth-Warder,
 * and 02 §5's Chromatic Outcast; stage 3A of the Chromatic Champion plan). Pure: no
 * Foundry imports (CLAUDE.md §3).
 *
 * `rules/talent-effects.mjs` holds the rows; this holds what each new row kind is READ
 * as, one function a kind, each called by the door named beside it, and
 * `chromatic-champion-talents.test.mjs` holds every number to 04's own Effect cell.
 *
 *   lifebinder   `{split, add, divide, cleanse, self, ticks}`, one kind for the five
 *                Life-Binder talents that change Lifebinder's Flame - read WHOLE by
 *                `lifebinderFor`, the one reading the cast (`castSpell`), the Apply of a
 *                laid tick (`effects/ticks.mjs`) and the Quench batch share:
 *                  split    Lifebinder's Flame itself: a branch spell dealing Fire may
 *                           be split
 *                  breath   `{features, feet}` on the same row: the class features whose
 *                           Fire it splits too (Breath, Chromatic Breath) and the feet its
 *                           heal reaches from one (D-845), read by `useFeature`'s judgement
 *                  add      Rekindle's *1 more Health per rank*, per creature healed
 *                  divide   Pyre of Renewal's *between two creatures*, three at rank 2
 *                  cleanse  Cleansing Fire's *loses 1 Undeath Corruption*, Bleeding at
 *                           rank 2
 *                  self     the Red Drake's *also heals you for your tier*, in its form
 *                  ticks    Smoldering Life's *Each tick of your Smolder may be split*
 *   hearthfire   `{spell}`: Hearthfire's Immolation heals each ally that starts its turn
 *                within 5 feet by the spell's damage and deals none (`hearthfireTick`,
 *                read by `castSpell` as it writes the Sustain's own tick)
 *   kindling     `{gain: {pool, amount}}`: Kindling Heart's Rage on a heal given with a
 *                branch spell or talent (`kindlingFor`, read at `applyHealing`)
 *   lifeblood    `{feet, below}`: Lifeblood's offer when an ally drops below half Health
 *                (`lifebloodOffered`, read at `applyDamage`'s blow)
 *   voidSpend    `{surge, cap, tempHealth, prone, stunAt, add, form}`: Void Surge, Obsidian
 *                Skin, Earthshatter and the Black Drake on a spend of Void Corruption
 *                (`voidSpendFor`, `voidSpendOutcome`)
 *   chargedSteel `{amount}`: Charged Steel's promise to the next branch spell against the
 *                creature a weapon hit (`chargedSteelMark`, `chargedSteelTake`)
 *   courtGuise   `{boons}`: the appearance Court Guise takes and what sees through it
 *   silverTongue `{skills, boons}`: Silver Tongue's Boon while in a guise
 *
 * And the Spell-Weaver's and the Timewalker's (stage 3B):
 *
 *   font         `{feet, add}`: Font of Magic's Rage into an ally's Mana, Overflow's
 *                more (`fontOfMagicFor`, read by `workflows.useFeature`)
 *   manaHunger   `{feet, gain}`: Rage once a round on a cast near the Champion
 *                (`manaHungerFor`, read at `castSpell`)
 *   spellbreak   on `onUse`: one Sustain ended, Rage gained (`spellbreakGain`)
 *   spellthief   `{gain, allyMana, feet}`: Rage and an ally's Mana when Spellbreak or
 *                Unweave ends a spell effect (`spellthiefFor`)
 *   disruptWeave `{feet, banes}`: the Reaction asked IN an incoming cast
 *                (`disruptWeaveFor`, `effects/chromatic-reactions.mjs`)
 *   turnStart    `{form, allyMana, feet}`: the Blue Drake's Mana at the start of the
 *                drake's turns (`blueDrakeTurnFor`, read by `AzerothCombat#_onStartTurn`)
 *   hasten       `{feet, self, speed}`: Hasten's reach and Borrowed Moment's change to it
 *                (`hastenFor`)
 *   weightOfAges `{against, noReaction}`: the Bane and the lost Reaction of a creature
 *                the holder Slowed (`weightOfAgesFor`, `weightOfAgesBanes`)
 *   rewind       `{feet, whole}`: the heal a Rewind gives (`rewindHeal`)
 *   paradox      `{feet}`: the Reaction asked IN an enemy's Attack or Casting Test
 *   timeLapse    `true`: the reroll offered after a failed Test
 *   anchor       `{spell, resilience, condition, escape}`: Anchor of Ages' check on its
 *                Anchor, its Entangled carrying A1's escape at the Champion's Spell DC
 *                (`anchorTick`)
 *   drakeHalf    `{form}`: the Bronze Drake's Half-Action the turn it is taken
 *   landing      `{form, feet, resilience, condition}`: the Black Drake's landing
 */

import { CHAMPION_CLASS } from "./chromatic-features.mjs";

/** The Champion's class, as a talent's `className` names it: ONE definition, the features' (the 3A review). */
export { CHAMPION_CLASS };

/** A taken talent's rank, a whole number from 1. */
const rankOf = talent => Math.max(1, Math.trunc(Number(talent?.taken) || 0));

/** A whole number at or above nothing. */
const count = v => Math.max(0, Math.trunc(Number(v)) || 0);

/**
 * The taken talents carrying a row of one kind, each with its row and rank, by
 * identifier. `rowOf` is the table's lookup, handed in so this module never imports
 * `talent-effects.mjs` (which imports nothing of this one, and a test may hand a row).
 */
function rowsOfKind(talents = [], kind, rowOf) {
  const out = [];
  for (const t of talents ?? []) {
    if (!(Math.trunc(Number(t?.taken) || 0) > 0)) continue;
    const row = rowOf?.(t.className, t.identifier, t.race ?? null)?.[kind];
    if (row === undefined || row === null || row === false) continue;
    out.push({ talent: t, row, rank: rankOf(t) });
  }
  return out.sort((a, b) => String(a.talent.identifier).localeCompare(String(b.talent.identifier)));
}

/** A row with its rank's clauses laid over it (the rider's and the patch's own shape). */
function atRank(row, rank = 1) {
  const out = { ...(row ?? {}) };
  delete out.atRank;
  for (const clause of row?.atRank ?? []) {
    if ((Number(rank) || 0) >= (Number(clause?.rank) || Infinity)) {
      const { rank: _r, ...rest } = clause;
      Object.assign(out, rest);
    }
  }
  return out;
}

/** `rank`, `tier` or a number. */
function amountOf(expr, { rank = 1, tier = 1 } = {}) {
  if (typeof expr === "number") return count(expr);
  if (expr === "rank") return count(rank);
  if (expr === "tier") return count(tier);
  return count(expr);
}

/* -------------------------------------------- */
/*  Branch spells                                */
/* -------------------------------------------- */

/**
 * **WHETHER A SPELL IS A BRANCH SPELL** (04's *a branch spell*): one a taken Champion
 * talent's `spell` row teaches at its rank. The Champion casts nothing else (02 §7).
 *
 * @param {Array} talents  the caster's taken talents
 * @param {string} name
 * @param {Function} rowOf
 * @returns {{talent: string}|null}  the teaching talent's name
 */
export function branchSpellOf(talents = [], name = "", rowOf) {
  if (!name) return null;
  for (const { talent, row, rank } of rowsOfKind(talents, "spell", rowOf)) {
    if (talent.className !== CHAMPION_CLASS || row.learn !== true) continue;
    const names = new Set([...(row.names ?? []), ...((row.atRank ?? []).filter(c => rank >= Number(c?.rank)).flatMap(c => c.names ?? []))]);
    if (names.has(name)) return { talent: talent.name };
  }
  return null;
}

/* -------------------------------------------- */
/*  Life-Binder                                  */
/* -------------------------------------------- */

/**
 * **WHAT LIFEBINDER'S FLAME DOES FOR THIS CASTER, WHOLE** (04's Life-Binder): null where
 * Lifebinder's Flame is not taken, else every talent's clause at its rank.
 *
 * @param {Array} talents
 * @param {{form?: string|null}} [o]  the drake form held, by its form's name
 * @param {Function} rowOf
 * @returns {{by: string, add: number, divide: number, cleanse: {undeath: number, bleeding: boolean}|null,
 *   self: string|null, ticks: string[], names: string[]}|null}
 */
export function lifebinderFor(talents = [], { form = null } = {}, rowOf) {
  const rows = rowsOfKind(talents, "lifebinder", rowOf);
  const split = rows.find(r => r.row.split === true);
  if (!split) return null;
  // *or your Breath or Chromatic Breath deals Fire damage* (the lead, 2026-11-09; D-845): the
  // features whose Fire the Flame splits, and the feet its heal reaches from a Breath.
  const breath = split.row.breath && Array.isArray(split.row.breath.features) && split.row.breath.features.length
    ? { features: [...split.row.breath.features], feet: count(split.row.breath.feet) || 30 }
    : null;
  const out = { by: split.talent.name, add: 0, divide: 1, cleanse: null, self: null, selfBy: null, ticks: [], breath, names: [split.talent.name] };
  for (const { talent, row, rank } of rows) {
    if (row === split.row) continue;
    const at = atRank(row, rank);
    if (at.add !== undefined) {
      out.add += amountOf(at.add, { rank });
      out.names.push(talent.name);
    }
    if (Number(at.divide) > 1) {
      out.divide = Math.max(out.divide, Math.trunc(Number(at.divide)));
      out.names.push(talent.name);
    }
    if (at.cleanse) {
      out.cleanse = { undeath: count(at.cleanse.undeath), bleeding: rank >= (Number(at.cleanse.bleedingAt) || Infinity) };
      out.names.push(talent.name);
    }
    // *In it ... every heal you give with Lifebinder's Flame also heals you for your tier*:
    // only while THAT form is held.
    if (at.self && (!at.form || at.form === form)) {
      out.self = at.self;
      out.selfBy = talent.name;
      out.names.push(talent.name);
    }
    if (Array.isArray(at.ticks)) for (const s of at.ticks) if (!out.ticks.includes(s)) out.ticks.push(s);
  }
  out.names = [...new Set(out.names)];
  return out;
}

/**
 * **THE SPLIT, WORKED OUT** (04's Lifebinder's Flame: *Work out the damage it deals after
 * Armor Points and Ward. Its target takes half of that, rounded down, and one creature
 * within the spell's range, you included, regains Health equal to the other half plus your
 * Constitution modifier*). With Pyre of Renewal the heal is divided between the creatures
 * chosen, as evenly as it goes and the odd point to the first named (MY READING, for the
 * lead: *divide its heal* names no shares); Rekindle's rank is added to EACH creature
 * healed; the Red Drake's tier heals the Champion once for every heal given (*every heal
 * you give ... also heals you for your tier*).
 *
 * A spell that damages several creatures splits each of them, and the other halves are
 * pooled into the one heal (MY READING, for the lead: *Its target* is written for one).
 *
 * @param {{dealt?: number[], conMod?: number, heals?: number, plan?: object|null, tier?: number}} o
 *   `dealt` each target's damage after Armor Points and Ward; `heals` the creatures chosen
 * @returns {{takes: number[], pool: number, shares: number[], self: number}}
 */
export function lifebinderSplit({ dealt = [], conMod = 0, heals = 1, plan = null, tier = 1 } = {}) {
  const amounts = (dealt ?? []).map(count);
  const takes = amounts.map(d => Math.floor(d / 2));
  const other = amounts.reduce((n, d, i) => n + (d - takes[i]), 0);
  const pool = Math.max(0, other + (Math.trunc(Number(conMod)) || 0));
  const n = Math.max(1, Math.min(Math.trunc(Number(heals)) || 1, Math.max(1, Number(plan?.divide) || 1)));
  const base = Math.floor(pool / n);
  const rest = pool - base * n;
  const add = count(plan?.add);
  const shares = Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0) + add);
  const self = plan?.self === "tier" ? count(tier) * n : 0;
  return { takes, pool, shares, self };
}

/**
 * **WHETHER A CAST MAY BE SPLIT**: Lifebinder's Flame held, the spell a branch spell, and
 * Fire the damage it deals - on the cast or as its tick (Smolder through Smoldering Life).
 *
 * **OR A BREATH** (04: *or your Breath or Chromatic Breath deals Fire damage*; the lead,
 * 2026-11-09: *"make sure the lifebinder healing talents can trigger off the Breath attack if
 * it's fire damage"*, and *"chromatic breath is included if fire damage is picked with those
 * talents"*; D-845): `feature` names the class feature used, and the split is offered where the
 * Flame's row names it and the school breathed is Fire. A Breath is no spell, so `branch` is not
 * asked of it.
 *
 * @param {object|null} plan  `lifebinderFor`'s
 * @param {{branch?: boolean, school?: string|null, damages?: boolean, ticks?: boolean, spell?: string, feature?: string}} o
 */
export function splitOffered(plan, { branch = false, school = null, damages = false, ticks = false, spell = "", feature = "" } = {}) {
  if (!plan || school !== "fire") return false;
  if (feature) return damages === true && (plan.breath?.features ?? []).includes(feature);
  if (branch !== true) return false;
  return damages === true || (ticks === true && plan.ticks.includes(spell));
}

/**
 * **THE ROWS A SPLIT LEAVES ON THE CARD** (04's *Its target takes half of that, rounded
 * down*): each creature's row at the half it takes - `takes` where `lifebinderSplit` worked
 * them out, else each row's own damage halved, rounded down - its second amounts folded into
 * the halved number and marked `split`. The one reading the spell door and the Breath door
 * share, for the row a failed Test lands and the row a passed one lands alike.
 *
 * A Breath's Reflex Test is made after the card stands, so a creature that passes takes half of
 * the half its passed row holds (MY READING, for the lead; D-845).
 *
 * @param {Array<object|null>} rows  `resolveDamage`'s rows, by target
 * @param {number[]|null} [takes]
 * @returns {Array<object|null>}
 */
export function splitRows(rows = [], takes = null) {
  return (rows ?? []).map((r, i) => {
    if (!r) return r;
    const take = Array.isArray(takes) && Number.isFinite(Number(takes[i])) ? count(takes[i]) : Math.floor(count(r.damage) / 2);
    return { ...r, damage: take, parts: null, split: true };
  });
}

/**
 * **HEARTHFIRE** (04: *Your Immolation deals no damage. Instead, each ally that starts its
 * turn within 5 feet of you regains Health equal to the spell's damage*): the caster's own
 * copy of the spell's tick, rewritten - every ally, the Champion included (D-755: *the
 * caster counts as an ally unless the words say other than you*), healed by 07's Rating,
 * no damage and no answer to a melee hit (its retaliation only ever touched enemies). The
 * spell's own descriptor is untouched; only the tick this cast holds changes.
 *
 * @param {object|null} tick  the spell's `areaTick`, cloned
 * @param {Array} talents
 * @param {string} name  the spell
 * @param {Function} rowOf
 * @returns {object|null}  the tick to hold, or the one handed in where no row changes it
 */
export function hearthfireTick(tick, talents = [], name = "", rowOf) {
  if (!tick || typeof tick !== "object") return tick;
  const row = rowsOfKind(talents, "hearthfire", rowOf).find(r => r.row.spell === name);
  if (!row) return tick;
  const heal = count(tick.damage?.rating);
  return {
    ...tick,
    who: "ally",
    damage: { rating: null, school: null },
    heal,
    retaliate: false,
    excludesCaster: false,
    // The holder stands inside its own ring (`documents/combat.mjs#tickSources`).
    includesHolder: true,
    hearthfire: row.talent.name
  };
}

/**
 * **KINDLING HEART** (04: *When you heal a creature with a branch spell or talent, gain 1
 * Rage*): the gain, or null.
 *
 * @param {Array} talents  the HEALER's
 * @param {Function} rowOf
 * @returns {{pool: string, amount: number, name: string}|null}
 */
export function kindlingFor(talents = [], rowOf) {
  const row = rowsOfKind(talents, "kindling", rowOf)[0] ?? null;
  if (!row?.row?.gain?.pool) return null;
  return { pool: String(row.row.gain.pool), amount: Math.max(1, count(row.row.gain.amount)), name: row.talent.name };
}

/**
 * **LIFEBLOOD'S TRIGGER** (04: *As a Reaction when an ally within 30 feet drops below half
 * Health*): a blow that took the creature from half its maximum or more to below it.
 *
 * @param {{before?: number, after?: number, max?: number}} o
 */
export function droppedBelowHalf({ before = 0, after = 0, max = 0 } = {}) {
  const m = Number(max);
  if (!(m > 0)) return false;
  return Number(before) >= m / 2 && Number(after) < m / 2;
}

/**
 * The Lifeblood rows a holder carries: `{feet, below, name}`, or null.
 *
 * @param {Array} talents  the HOLDER's
 * @param {Function} rowOf
 */
export function lifebloodFor(talents = [], rowOf) {
  const r = rowsOfKind(talents, "lifeblood", rowOf)[0] ?? null;
  if (!r) return null;
  return { feet: count(r.row.feet) || 30, below: Number(r.row.below) || 0.5, name: r.talent.name, rank: r.rank };
}

/* -------------------------------------------- */
/*  Earth-Warder                                 */
/* -------------------------------------------- */

/** The pool name a spend of Void Corruption is priced in (`rules/riders.mjs`). */
export const VOID_POOL = "void";

/**
 * **VOID CORRUPTION AS A POOL A RIDER MAY PAY FROM** (04's Void Surge: *spend up to your
 * tier in Void Corruption*): the track, shaped as `AzerothActor#poolSnapshot` shapes a
 * pool, so `rules/riders.mjs` judges and settles it as it does any other. `kind:
 * "corruption"` keeps it out of every pool door: its write is the track's
 * (`riderWritesSplit`).
 *
 * @param {{corruption?: {void?: number}}} system  a character's derived system
 * @returns {{itemId: null, kind: "corruption", name: string, value: number, max: number}}
 */
export function voidPool(system = {}) {
  return { itemId: null, kind: "corruption", name: VOID_POOL, value: count(system?.corruption?.void), max: 20 };
}

/**
 * A rider's writes, split: the pools `AzerothActor#updatePool` writes, and the Corruption
 * tracks a spend of Void moved, as the update's own keys.
 *
 * @param {Array<{itemId: string|null, kind: string, value: number}>} writes
 * @returns {{pools: Array<object>, extra: Record<string, number>}}
 */
export function riderWritesSplit(writes = []) {
  const pools = [];
  const extra = {};
  for (const w of writes ?? []) {
    if (w?.kind === "corruption") extra[`system.corruption.${VOID_POOL}`] = count(w.value);
    else if (w) pools.push(w);
  }
  return { pools, extra };
}

/**
 * **WHAT A SPEND OF VOID DOES, WHOLE** (04's Void Surge, Obsidian Skin, Earthshatter, Black
 * Drake): null where Void Surge is not taken.
 *
 * @param {Array} talents
 * @param {{tier?: number, form?: string|null}} o
 * @param {Function} rowOf
 * @returns {{by: string, cap: number, perVoid: number, tempPerVoid: number, prone: number|null,
 *   stun: {rank: number, sl: number}|null, names: string[]}|null}
 */
export function voidSpendFor(talents = [], { tier = 1, form = null } = {}, rowOf) {
  const rows = rowsOfKind(talents, "voidSpend", rowOf);
  const surge = rows.find(r => r.row.surge !== undefined);
  if (!surge) return null;
  const out = {
    by: surge.talent.name,
    cap: amountOf(surge.row.cap ?? "tier", { tier, rank: surge.rank }),
    perVoid: amountOf(surge.row.surge, { rank: surge.rank }),
    tempPerVoid: 0, prone: null, stun: null, names: [surge.talent.name]
  };
  for (const { talent, row, rank } of rows) {
    if (row === surge.row) continue;
    const at = atRank(row, rank);
    if (at.tempHealth !== undefined) {
      out.tempPerVoid += amountOf(at.tempHealth, { rank });
      out.names.push(talent.name);
    }
    if (Number(at.prone) > 0) {
      out.prone = Math.trunc(Number(at.prone));
      out.names.push(talent.name);
    }
    if (at.stun && rank >= (Number(at.stun.rank) || Infinity)) out.stun = { sl: Math.trunc(Number(at.stun.sl)) || 0 };
    // *In it ... Void Surge adds 1 more damage per Void spent*: only in that form.
    if (Number(at.add) > 0 && (!at.form || at.form === form)) {
      out.perVoid += Math.trunc(Number(at.add));
      out.names.push(talent.name);
    }
  }
  out.names = [...new Set(out.names)];
  return out;
}

/**
 * **WHAT ONE BLOW'S SPEND OF VOID LANDS**: the damage it adds, the temporary Health it
 * gives the Champion, and - three or more on one blow - Prone, and Stunned at Earthshatter's
 * rank 2 on a blow that reached SL 2.
 *
 * @param {ReturnType<typeof voidSpendFor>} plan
 * @param {{spent?: number, sl?: number, hit?: boolean}} o
 * @returns {{damage: number, tempHealth: number, prone: boolean, stunned: boolean}}
 */
export function voidSpendOutcome(plan, { spent = 0, sl = 0, hit = true } = {}) {
  const n = count(spent);
  if (!plan || !(n > 0)) return { damage: 0, tempHealth: 0, prone: false, stunned: false };
  const knocks = hit === true && plan.prone !== null && n >= plan.prone;
  return {
    damage: hit === true ? n * plan.perVoid : 0,
    tempHealth: n * plan.tempPerVoid,
    prone: knocks,
    stunned: knocks && plan.stun !== null && (Math.trunc(Number(sl)) || 0) >= plan.stun.sl
  };
}

/**
 * **WHETHER A SPEND OF VOID WOULD WRITE ON THE CREATURE STRUCK** (the 3A review, M1):
 * Earthshatter's Prone (and its Stunned) lands on a spend of its threshold or more, so a
 * blow whose Void can reach that threshold - the most it could spend, the track's or the
 * cap's - needs a GM where this client does not own the creature, and is judged BEFORE
 * anything is spent.
 *
 * @param {ReturnType<typeof voidSpendFor>|null} plan
 * @param {number} voidHeld  the Void track as it stands
 * @returns {boolean}
 */
export function voidSpendWrites(plan, voidHeld = 0) {
  if (!plan || plan.prone === null || plan.prone === undefined) return false;
  return Math.min(count(voidHeld), count(plan.cap)) >= plan.prone;
}

/** The actor flag Charged Steel's promises stand under. */
export const CHARGED_STEEL_FLAG = "chargedSteel";

/**
 * The Charged Steel row a striker carries: `{amount, name}` at its rank, or null.
 *
 * @param {Array} talents
 * @param {Function} rowOf
 */
export function chargedSteelFor(talents = [], rowOf) {
  const r = rowsOfKind(talents, "chargedSteel", rowOf)[0] ?? null;
  if (!r) return null;
  return { amount: amountOf(r.row.amount ?? "rank", { rank: r.rank }), name: r.talent.name };
}

/**
 * **CHARGED STEEL'S PROMISE** (04: *When you hit a creature with a weapon attack, your next
 * branch spell to damage that creature before the end of your next turn deals 1 more
 * damage per rank*): the flag after a weapon hit on these creatures - one entry a creature,
 * the newest replacing an older one, each carrying the span it lasts to.
 *
 * @param {Array<object>} held  the flag
 * @param {{targets?: string[], amount?: number, name?: string, until?: object|null}} o
 *   `until` `{combat, round, turn, own}` (the fight) or `{time}` (the world's clock)
 * @returns {Array<object>}
 */
export function chargedSteelMark(held = [], { targets = [], amount = 0, name = "", until = null } = {}) {
  const fresh = [...new Set((targets ?? []).filter(u => typeof u === "string" && u))]
    .map(target => ({ target, amount: count(amount), name: String(name ?? ""), until: until ?? null }));
  if (!fresh.length || !(count(amount) > 0)) return Array.isArray(held) ? held : [];
  const replaced = new Set(fresh.map(e => e.target));
  return [...(Array.isArray(held) ? held : []).filter(e => e?.target && !replaced.has(e.target)), ...fresh]
    .sort((a, b) => String(a.target).localeCompare(String(b.target)));
}

/**
 * Whether a promise still stands: its fight's turn order not yet past the striker's next
 * turn (`rules/next-attack.mjs#nextTurnStands`' reading, handed in), or the world's clock
 * not yet past its time.
 *
 * @param {object} entry
 * @param {{combat?: string|null, time?: number}} now
 * @param {(at: object, now: object) => boolean} turnStands
 */
export function chargedSteelStands(entry, now = {}, turnStands = () => false) {
  const until = entry?.until ?? null;
  if (!until) return false;
  if (until.combat) return now?.combat === until.combat && turnStands(until, now);
  if (until.time !== undefined && until.time !== null) return (Number(now?.time) || 0) <= Number(until.time);
  return false;
}

/**
 * **WHAT A BRANCH SPELL TAKES OF CHARGED STEEL**: the damage each target adds (by uuid),
 * and the flag after - every promise the cast used gone, every lapsed one swept with them.
 *
 * @param {Array<object>} held
 * @param {{targets?: string[], now?: object, turnStands?: Function}} o
 * @returns {{by: Record<string, number>, names: string[], kept: Array<object>, changed: boolean}}
 */
export function chargedSteelTake(held = [], { targets = [], now = {}, turnStands = () => false } = {}) {
  const want = new Set((targets ?? []).filter(Boolean));
  const by = {};
  const names = [];
  const kept = [];
  let changed = false;
  for (const e of Array.isArray(held) ? held : []) {
    if (!e?.target || !chargedSteelStands(e, now, turnStands)) { changed = true; continue; }
    if (want.has(e.target)) {
      by[e.target] = (by[e.target] ?? 0) + count(e.amount);
      if (e.name && !names.includes(e.name)) names.push(e.name);
      changed = true;
      continue;
    }
    kept.push(e);
  }
  return { by, names, kept, changed };
}

/* -------------------------------------------- */
/*  Spell-Weaver (stage 3B)                      */
/* -------------------------------------------- */

/** One row's clause at its rank, read off the first taken talent carrying the kind. */
function firstAtRank(talents, kind, rowOf) {
  const r = rowsOfKind(talents, kind, rowOf)[0] ?? null;
  return r ? { ...r, at: atRank(r.row, r.rank) } : null;
}

/**
 * **FONT OF MAGIC, WITH OVERFLOW** (04: *As a Half-Action, spend any amount of Rage. One
 * ally within 30 feet regains that much Mana, to no more than its maximum. At rank 2 it
 * regains 1 more*; Overflow: *Font of Magic gives 1 more Mana per rank*): the feet, and
 * what one Font adds to the Rage spent - Font's rank 2 and Overflow's ranks. Null where
 * Font of Magic is not taken: Overflow alone has nothing to add to.
 *
 * @param {Array} talents
 * @param {Function} rowOf
 * @returns {{name: string, feet: number, add: number, names: string[]}|null}
 */
export function fontOfMagicFor(talents = [], rowOf) {
  const rows = rowsOfKind(talents, "font", rowOf);
  const font = rows.find(r => r.row.feet !== undefined);
  if (!font) return null;
  const out = { name: font.talent.name, feet: count(font.row.feet) || 30, add: 0, names: [font.talent.name] };
  for (const { talent, row, rank } of rows) {
    const at = atRank(row, rank);
    const n = amountOf(at.add ?? 0, { rank });
    if (n > 0) {
      out.add += n;
      if (!out.names.includes(talent.name)) out.names.push(talent.name);
    }
  }
  return out;
}

/**
 * **WHAT ONE FONT GIVES** (04's *that much Mana, to no more than its maximum*): the Rage
 * spent plus what the talents add, capped at what the ally's pool has room for.
 *
 * @param {{spent?: number, add?: number, value?: number, max?: number}} o
 * @returns {number}
 */
export function fontMana({ spent = 0, add = 0, value = 0, max = 0 } = {}) {
  const n = count(spent);
  if (!(n > 0)) return 0;
  return Math.max(0, Math.min(n + count(add), count(max) - count(value)));
}

/**
 * **MANA HUNGER** (04: *Once a round, when a creature within 30 feet of you casts a spell,
 * gain 1 Rage. At rank 2, gain 2*): the feet and the gain, or null.
 *
 * @param {Array} talents
 * @param {Function} rowOf
 * @returns {{name: string, feet: number, gain: number}|null}
 */
export function manaHungerFor(talents = [], rowOf) {
  const r = firstAtRank(talents, "manaHunger", rowOf);
  if (!r) return null;
  return { name: r.talent.name, feet: count(r.at.feet) || 30, gain: Math.max(1, count(r.at.gain)) };
}

/** The once-a-round mark Mana Hunger spends on the holder's round record. */
export const MANA_HUNGER_MARK = "mana-hunger";

/**
 * **SPELLBREAK'S RAGE** (04: *Gain Rage equal to twice your rank*).
 *
 * @param {number} rank
 */
export function spellbreakGain(rank = 1) {
  return 2 * Math.max(1, count(rank));
}

/**
 * **SPELLTHIEF** (04: *When Spellbreak or Unweave ends a spell effect, gain Rage equal to
 * your tier. At rank 2 one ally within 30 feet also regains 2 Mana*), or null.
 *
 * @param {Array} talents
 * @param {{tier?: number}} o
 * @param {Function} rowOf
 * @returns {{name: string, gain: number, allyMana: number, feet: number}|null}
 */
export function spellthiefFor(talents = [], { tier = 1 } = {}, rowOf) {
  const r = firstAtRank(talents, "spellthief", rowOf);
  if (!r) return null;
  return { name: r.talent.name, gain: amountOf(r.at.gain ?? "tier", { tier, rank: r.rank }), allyMana: count(r.at.allyMana), feet: count(r.at.feet) || 30 };
}

/**
 * **DISRUPT WEAVE** (04, as the lead reworded it on 2026-11-08: *As a Reaction when an enemy within 60 feet that you can see
 * casts a spell, spend Rage equal to that spell's tier plus 2. The caster makes a Spirit
 * Resilience Test against your Spell DC. On a failure the spell fails and its Mana is
 * spent. At rank 2 the Test takes a Bane*), or null.
 *
 * @param {Array} talents
 * @param {Function} rowOf
 * @returns {{name: string, feet: number, banes: number, resilience: string}|null}
 */
export function disruptWeaveFor(talents = [], rowOf) {
  const r = firstAtRank(talents, "disruptWeave", rowOf);
  if (!r) return null;
  return { name: r.talent.name, feet: count(r.at.feet) || 60, banes: count(r.at.banes), resilience: String(r.at.resilience || "spirit") };
}

/** Disrupt Weave's price: *Rage equal to that spell's tier plus 2*. */
export function disruptCost(tier = 1) {
  return Math.max(1, count(tier)) + 2;
}

/**
 * **THE BLUE DRAKE'S MANA** (04: *In it ... each ally within 30 feet regains 1 Mana at the
 * start of each of your turns*): in that form alone, or null.
 *
 * @param {Array} talents
 * @param {{form?: string|null}} o  the drake form held, by name
 * @param {Function} rowOf
 * @returns {{name: string, allyMana: number, feet: number}|null}
 */
export function blueDrakeTurnFor(talents = [], { form = null } = {}, rowOf) {
  const r = firstAtRank(talents, "turnStart", rowOf);
  if (!r || !form || r.at.form !== form) return null;
  return { name: r.talent.name, allyMana: Math.max(1, count(r.at.allyMana)), feet: count(r.at.feet) || 30 };
}

/* -------------------------------------------- */
/*  Timewalker (stage 3B)                        */
/* -------------------------------------------- */

/**
 * **HASTEN, AND BORROWED MOMENT ON IT** (04's Hasten: *One ally within 30 feet gains a
 * Half-Action on its next turn*; Borrowed Moment: *Hasten may target you. At rank 2 the
 * creature you Hasten also gains 10 feet of Speed until the end of its next turn*): the
 * reach, whether the Champion may be the one Hastened, and the Speed it adds. Null where
 * Hasten is not taken. Without Borrowed Moment the Champion is no target: the talent that
 * lets Hasten target you is what says it could not before (MY READING of the pair).
 *
 * @param {Array} talents
 * @param {Function} rowOf
 * @returns {{name: string, feet: number, self: boolean, speed: number, by: string[]}|null}
 */
export function hastenFor(talents = [], rowOf) {
  const rows = rowsOfKind(talents, "hasten", rowOf);
  const base = rows.find(r => r.row.feet !== undefined);
  if (!base) return null;
  const out = { name: base.talent.name, feet: count(base.row.feet) || 30, self: false, speed: 0, by: [] };
  for (const { talent, row, rank } of rows) {
    if (row === base.row) continue;
    const at = atRank(row, rank);
    if (at.self === true) out.self = true;
    out.speed += count(at.speed);
    if (at.self === true || count(at.speed) > 0) out.by.push(talent.name);
  }
  return out;
}

/** The effect flag Hasten's Half-Action waits on, on the creature Hastened, until its turn starts. */
export const HASTENED_FLAG = "hastened";

/**
 * **WEIGHT OF AGES** (04: *A creature you have Slowed takes a Bane on Attack Tests against
 * you. At rank 2 the Bane applies to its Attack Tests against anyone. At rank 3 it also has
 * no Reaction*), at the holder's rank, or null.
 *
 * @param {Array} talents
 * @param {Function} rowOf
 * @returns {{name: string, anyone: boolean, noReaction: boolean}|null}
 */
export function weightOfAgesFor(talents = [], rowOf) {
  const r = firstAtRank(talents, "weightOfAges", rowOf);
  if (!r) return null;
  return { name: r.talent.name, anyone: r.at.against === "anyone", noReaction: r.at.noReaction === true };
}

/**
 * **THE BANE A SLOWED ATTACKER TAKES** (Weight of Ages): one, where any creature who laid
 * the attacker's Slowed holds the talent and the attack is against that holder - or, at
 * rank 2, against anyone. One condition is one Bane, however many laid it (MY READING).
 *
 * @param {Array<{uuid: string, row: ReturnType<typeof weightOfAgesFor>}>} layers  who laid the Slowed
 * @param {{targetUuids?: string[]}} o  the actors the attack is against
 * @returns {{banes: number, names: string[]}}
 */
export function weightOfAgesBanes(layers = [], { targetUuids = [] } = {}) {
  const against = new Set((targetUuids ?? []).filter(Boolean));
  const names = [];
  for (const l of layers ?? []) {
    if (!l?.row) continue;
    if (l.row.anyone || against.has(l.uuid)) if (!names.includes(l.row.name)) names.push(l.row.name);
  }
  return { banes: names.length ? 1 : 0, names };
}

/** Whether any layer of a creature's Slowed holds Weight of Ages at rank 3: *it also has no Reaction*. */
export function weightOfAgesBars(layers = []) {
  return (layers ?? []).some(l => l?.row?.noReaction === true);
}

/**
 * **REWIND'S HEAL** (04: *It regains half the Health that blow took, rounded up. At rank 2
 * it regains all of it*).
 *
 * @param {number} taken  the Health the blow took (never temporary Health)
 * @param {{whole?: boolean}} o
 */
export function rewindHeal(taken = 0, { whole = false } = {}) {
  const n = count(taken);
  return whole ? n : Math.ceil(n / 2);
}

/**
 * The Rewind a holder carries: `{name, feet, whole}` at its rank, or null.
 *
 * @param {Array} talents
 * @param {Function} rowOf
 */
export function rewindFor(talents = [], rowOf) {
  const r = firstAtRank(talents, "rewind", rowOf);
  if (!r) return null;
  return { name: r.talent.name, feet: count(r.at.feet) || 30, whole: r.at.whole === true };
}

/** The seconds one round of the world's clock is (05: a round is six seconds). */
export const OFFER_ROUND_SECONDS = 6;

/**
 * **THE MOMENT A REACTION'S OFFER WAS MADE** (the 3B review, should-fix 3): the fight's
 * turn where the creature struck stands in a started fight, else the world's clock. Read
 * off the blow's own fight and recorded on the offer card.
 *
 * @param {{combatId?: string|null, round?: number|null, turn?: number|null, time?: number}} now
 * @returns {{combatId: string|null, round: number|null, turn: number|null, time: number}}
 */
export function offerMoment({ combatId = null, round = null, turn = null, time = 0 } = {}) {
  const inFight = typeof combatId === "string" && combatId !== "";
  return {
    combatId: inFight ? combatId : null,
    round: inFight && Number.isFinite(Number(round)) ? Math.trunc(Number(round)) : null,
    turn: inFight && Number.isFinite(Number(turn)) ? Math.trunc(Number(turn)) : null,
    time: Number.isFinite(Number(time)) ? Number(time) : 0
  };
}

/**
 * **WHETHER A REACTION'S OFFER STILL STANDS** (04's Rewind and Lifeblood: *as a Reaction
 * when ...*; the 3B review, should-fix 3). A Reaction answers the moment it names, so the
 * offer lapses when that moment has passed:
 *
 * - **in a fight**, once the fight's turn has moved on - a new turn or a new round of the
 *   fight the blow was struck in - or once that fight is gone (MY READING, pinned: the turn
 *   the blow landed in is the window, so a Reaction offered on an enemy's turn may still be
 *   taken before that turn ends);
 * - **out of a fight**, once the world's clock has run past one round (six seconds) from
 *   the blow.
 *
 * An offer that recorded no moment (a card posted before this rule) stands, as it did.
 *
 * @param {object|null} at   `offerMoment` as the offer recorded it
 * @param {{fight?: {id: string, round: number, turn: number}|null, time?: number}} now
 *   the recorded fight as it stands now (null where it is gone or never was), and the clock
 * @returns {boolean}
 */
export function offerStands(at, { fight = null, time = 0 } = {}) {
  if (!at || typeof at !== "object") return true;
  if (at.combatId) {
    if (!fight || fight.id !== at.combatId) return false;
    return Number(fight.round) === Number(at.round) && Number(fight.turn) === Number(at.turn);
  }
  return Number(time) - (Number(at.time) || 0) <= OFFER_ROUND_SECONDS;
}

/**
 * **HOW LONG A HOLDER MAY TAKE TO ANSWER A QUESTION ASKED IN A TEST** (D-777's residual
 * race; the 3B review, should-fix 11). The asker stops waiting at `askMs`, and the holder's
 * yes is followed by two queued writes - the Reaction through the combatant's queue, which
 * may stall up to ten seconds (`rules/write-queue.mjs`), and the pool - so a yes given after
 * `askMs - reserveMs` could be paid for on the holder's client after the asker has gone on
 * as if it were a no. The dialog closes at the window, and a yes judged after it is
 * refused before anything is paid.
 */
export const ASK_RESERVE_MS = 12000;

/**
 * The window a holder's dialog stands open for: the ask's own less the payment's reserve,
 * never below five seconds.
 *
 * @param {number} askMs
 * @param {number} [reserveMs]
 */
export function answerWindow(askMs, reserveMs = ASK_RESERVE_MS) {
  return Math.max(5000, (Number(askMs) || 0) - (Number(reserveMs) || 0));
}

/**
 * Whether a yes judged now may still be paid for: inside the window measured from when the
 * question reached the holder's client.
 *
 * @param {number} startedMs
 * @param {number} nowMs
 * @param {number} askMs
 * @param {number} [reserveMs]
 */
export function answerInTime(startedMs, nowMs, askMs, reserveMs = ASK_RESERVE_MS) {
  return (Number(nowMs) - Number(startedMs)) <= answerWindow(askMs, reserveMs);
}

/**
 * The Paradox a holder carries (04: *As a Reaction when an enemy within 60 feet makes an
 * Attack Test or a Casting Test, it rolls twice and takes the lower*), or null.
 *
 * @param {Array} talents
 * @param {Function} rowOf
 */
export function paradoxFor(talents = [], rowOf) {
  const r = firstAtRank(talents, "paradox", rowOf);
  if (!r) return null;
  return { name: r.talent.name, feet: count(r.at.feet) || 60, kinds: ["attack", "casting"] };
}

/**
 * **WHICH OF TWO TOTALS PARADOX KEEPS** (*it rolls twice and takes the lower*): the second
 * roll's where its total is lower, else the first's.
 *
 * @param {number} first
 * @param {number} second
 * @returns {"first"|"second"}
 */
export function paradoxKeeps(first, second) {
  return Number(second) < Number(first) ? "second" : "first";
}

/** Whether a holder carries Time Lapse (04: *when you fail a Test, roll it again*). */
export function timeLapseFor(talents = [], rowOf) {
  const r = firstAtRank(talents, "timeLapse", rowOf);
  return r ? { name: r.talent.name } : null;
}

/**
 * **ANCHOR OF AGES ON ITS ANCHOR** (04: *A creature that starts its turn inside your Arcane
 * Anchor must pass a Spirit Resilience Test against your Spell DC or be Entangled while it
 * stays there*): the caster's own copy of the spell's tick, a check added - made at the
 * start of a turn inside, its Entangled ended by leaving (`until: "leaves"`), the caster's
 * Spell DC the card's. Every creature inside, the caster included: the words name *a
 * creature* (MY READING). The spell's own descriptor is untouched.
 *
 * **AND THE ENTANGLED CARRIES ITS WAY OUT** (the 3B review, M2): A1's *Ends: An action and
 * a Reflex Resilience Test at DC 12, or at the DC the source names*, and the lead's ruling
 * (2026-11-08) that the DC the source names is the *"Champion's Spell DC"*. Entangled sets
 * Speed to 0, so *while it stays there* alone was a hold nothing could end. The failure's
 * `escape` is D-778's record (`rules/escapes.mjs`), stamped here at the cast with the
 * caster's Spell DC, and laid on the Entangled the Test lands; the prompt comes at the
 * creature's turn like every other.
 *
 * @param {object|null} tick  the cast's tick so far, cloned, or null where the spell holds none
 * @param {Array} talents
 * @param {string} name  the spell
 * @param {Function} rowOf
 * @param {object} empty  an empty area tick (`area-ticks.mjs#emptyAreaTick`), handed in
 * @param {{dc?: number|null, caster?: string|null, cast?: string|null}} [at]  the caster's
 *   Spell DC and uuid, and the cast, for the escape
 * @returns {object|null}
 */
export function anchorTick(tick, talents = [], name = "", rowOf, empty = null, { dc = null, caster = null, cast = null } = {}) {
  const r = rowsOfKind(talents, "anchor", rowOf).find(x => x.row.spell === name);
  if (!r) return tick;
  const base = tick && typeof tick === "object" ? tick : { ...(empty ?? {}), centre: "area" };
  const condition = String(r.row.condition || "entangled");
  const spec = r.row.escape ?? null;
  const spellDc = Math.trunc(Number(dc));
  const escape = spec ? {
    condition, on: String(spec.on || "action"), resilience: String(spec.resilience || "reflex"),
    dc: Number.isFinite(spellDc) && spellDc > 0 ? spellDc : null, banes: 0, failStun: null, talents: [r.talent.name],
    by: typeof caster === "string" && caster ? caster : null, source: r.talent.name, cast: typeof cast === "string" && cast ? cast : null
  } : null;
  const check = {
    on: "turn", resilience: String(r.row.resilience || "spirit"), where: "", gate: "", exempt: "",
    fail: { rating: null, school: null, statuses: [condition], bane: null, until: "leaves", lose: false, kinds: [], ...(escape ? { escape } : {}) },
    success: { statuses: [], until: "" }
  };
  return { ...base, who: base.who || "creature", checks: [...(Array.isArray(base.checks) ? base.checks : []), check], anchor: r.talent.name };
}

/**
 * **THE BRONZE DRAKE'S HALF-ACTION** (04: *The turn you take the form, you gain a
 * Half-Action*), for a form taken by name, or null.
 *
 * @param {Array} talents
 * @param {{form?: string|null}} o
 * @param {Function} rowOf
 */
export function drakeHalfFor(talents = [], { form = null } = {}, rowOf) {
  const r = rowsOfKind(talents, "drakeHalf", rowOf).find(x => x.row.form === form) ?? null;
  return r ? { name: r.talent.name } : null;
}

/**
 * **THE BLACK DRAKE'S LANDING** (04: *when you land from flight each creature within 10 feet
 * must pass a Reflex Resilience Test against your Spell DC or be knocked Prone*), in that
 * form alone, or null.
 *
 * @param {Array} talents
 * @param {{form?: string|null}} o
 * @param {Function} rowOf
 * @returns {{name: string, feet: number, resilience: string, condition: string}|null}
 */
export function landingFor(talents = [], { form = null } = {}, rowOf) {
  const r = rowsOfKind(talents, "landing", rowOf).find(x => x.row.form === form) ?? null;
  if (!r) return null;
  return { name: r.talent.name, feet: count(r.row.feet) || 10, resilience: String(r.row.resilience || "reflex"), condition: String(r.row.condition || "prone") };
}

/**
 * **WHETHER A MOVE LANDS FROM FLIGHT**: the token's elevation was above the ground and is
 * at it or below now.
 *
 * @param {{before?: number|null, after?: number|null}} o
 */
export function landedFromFlight({ before = null, after = null } = {}) {
  if (before === null || after === null || before === undefined || after === undefined) return false;
  return Number(before) > 0 && Number(after) <= 0;
}

/**
 * The movement methods that are no flight (the lead, 2026-11-08: the landing fires *"Only
 * on a real move"*): an **undo** puts the token back, a **paste** puts one down, and
 * **config** is a GM correcting the token on its sheet. A drag, the keyboard, the token
 * HUD's own elevation field and a move made through the API are moves the creature made
 * (MY READING of the HUD: it is how a player lowers a flier at the table).
 */
export const LANDING_NOT_MOVES = Object.freeze(["undo", "paste", "config"]);

/**
 * **WHETHER A MOVE IS A LANDING FROM FLIGHT** (04's Black Drake: *when you land from
 * flight*; the 3B review, M1; the lead: *"Only on a real move"*), off v14's own movement
 * operation and the update operation `moveToken` hands over. Never an undo, a paste or a
 * GM's token-config edit (`LANDING_NOT_MOVES`, and core's `isUndo` / `isPaste` on the
 * operation); never where the last waypoint PASSED was a displacement (core's word for a
 * token put somewhere - a forced move, a resize, a teleport); never a move that has passed
 * no waypoint yet. The elevation is read from where the move began to the last waypoint
 * it has PASSED - never `destination`, the end of a planned path the token may not have
 * reached. Answers the two elevations, or null where nothing lands.
 *
 * @param {object|null} movement   a TokenMovementOperation
 * @param {object} [operation]     the update operation
 * @returns {{before: number, after: number}|null}
 */
export function landingFires(movement, operation = {}) {
  if (!movement || typeof movement !== "object") return null;
  if (operation?.isUndo === true || operation?.isPaste === true) return null;
  if (LANDING_NOT_MOVES.includes(movement.method)) return null;
  const passed = Array.isArray(movement.passed?.waypoints) ? movement.passed.waypoints : [];
  const last = passed.at(-1) ?? null;
  if (!last || last.action === "displace") return null;
  const before = movement.origin?.elevation;
  const after = last.elevation;
  if (!Number.isFinite(Number(before)) || !Number.isFinite(Number(after)) || before === null || after === null) return null;
  return landedFromFlight({ before: Number(before), after: Number(after) }) ? { before: Number(before), after: Number(after) } : null;
}

/**
 * **WHOM A LANDING CATCHES** (the 3B review, M1; the lead's general rule: hidden creatures
 * are not caught): a creature still standing beside the drake, never the drake itself, never
 * a token hidden by the GM or Hidden (core's `invisible`), never one at 0 Health or defeated.
 *
 * @param {{self?: boolean, hidden?: boolean, defeated?: boolean, health?: number|null}} standing
 * @returns {boolean}
 */
export function landingCatches({ self = false, hidden = false, defeated = false, health = null } = {}) {
  if (self === true || hidden === true || defeated === true) return false;
  return !(typeof health === "number" && health <= 0);
}

/* -------------------------------------------- */
/*  The Chromatic Outcast                        */
/* -------------------------------------------- */

/**
 * **WINGS BENEATH** (02 §5's Chromatic Outcast: *You take no damage from a fall and land on
 * your feet*): the racial talent whose row says a fall lands nothing (`fall.noDamage`), read
 * off the row - a racial talent is no class talent, so no rank accessor names it - or null.
 *
 * @param {Array} talents  the creature's taken talents, racial ones among them
 * @param {Function} rowOf
 * @returns {string|null}  the talent's name
 */
export function fallHarmless(talents = [], rowOf) {
  const r = rowsOfKind(talents, "fall", rowOf).find(x => x.row.noDamage === true) ?? null;
  return r ? r.talent.name : null;
}

/* -------------------------------------------- */
/*  The guise                                    */
/* -------------------------------------------- */

/** The effect flag Court Guise's own effect carries: the appearance taken and what to restore. */
export const COURT_GUISE_FLAG = "courtGuise";

/** The skills 04's Court Guise puts a Bane on, to see through it. */
export const COURT_GUISE_SKILLS = Object.freeze(["arcana", "investigation"]);

/**
 * **WHAT COURT GUISE TAKES OFF A STUDIED HUMANOID** (04: *its face and voice included*): the
 * name it wears and the image on the token and the portrait, as a plain record off what the
 * door read. The Champion's own are kept in the same record, so the guise's end puts them
 * back (`restoreFromGuise`). A humanoid is a character, or a creature whose type says so.
 *
 * @param {{name?: string, img?: string, tokenImg?: string, type?: string|null, creatureType?: string|null}} studied
 * @param {{name?: string, img?: string, tokenImg?: string, tokenName?: string}} own
 * @returns {{refusal: string|null, record: object|null}}
 */
export function courtGuiseRecord(studied = {}, own = {}) {
  const humanoid = studied?.type === "character" || String(studied?.creatureType ?? "").toLowerCase() === "humanoid";
  if (!humanoid) return { refusal: "AZEROTH.CourtGuise.NotHumanoid", record: null };
  const look = s => ({ name: String(s?.name ?? ""), img: String(s?.img ?? ""), tokenImg: String(s?.tokenImg ?? s?.img ?? "") });
  return {
    refusal: null,
    record: { as: look(studied), own: { ...look(own), tokenName: String(own?.tokenName ?? own?.name ?? "") } }
  };
}

/**
 * **A SECOND GUISE KEEPS THE FIRST ONE'S RECORD OF THE TRUE FACE** (the 3A review, M2): a
 * guise taken over a standing one reads the Champion as the FIRST guise left it, so the
 * new record's `own` - and each token's own image and name - is carried forward from the
 * standing record, never read off the documents. A token the standing record never held
 * keeps what it shows now.
 *
 * @param {object|null} standing  the standing effect's record, or null
 * @param {{as: object, own: object}} fresh  `courtGuiseRecord`'s record for the new guise
 * @param {Array<{uuid: string, img: string|null, name: string|null}>} tokens  as they show now
 * @returns {{as: object, own: object, tokens: Array<object>}}
 */
export function carryCourtGuise(standing, fresh, tokens = []) {
  const held = new Map((standing?.tokens ?? []).filter(t => t?.uuid).map(t => [t.uuid, t]));
  const seen = new Set();
  const rows = [];
  for (const t of tokens ?? []) {
    if (!t?.uuid || seen.has(t.uuid)) continue;
    seen.add(t.uuid);
    const before = held.get(t.uuid);
    rows.push(before ? { uuid: t.uuid, img: before.img ?? null, name: before.name ?? null } : { uuid: t.uuid, img: t.img ?? null, name: t.name ?? null });
  }
  for (const [uuid, t] of held) if (!seen.has(uuid)) rows.push({ uuid, img: t.img ?? null, name: t.name ?? null });
  rows.sort((a, b) => String(a.uuid).localeCompare(String(b.uuid)));
  return { as: fresh?.as ?? {}, own: standing?.own ?? fresh?.own ?? {}, tokens: rows };
}

/**
 * **WHAT A GUISE'S END PUTS BACK, TOKEN BY TOKEN** (the 3A review, should-fix 5): every token
 * the record holds, and every other token of the actor still wearing the guise's image (one
 * placed while the guise stood takes the guised prototype). **A token standing in a shape**
 * (a drake form's `shapeRestore`, D-769) keeps the shape's picture: the true face is written
 * into the shape's own record of what to go back to, so leaving the shape later restores it -
 * the shape stands over the guise, never the other way about.
 *
 * @param {{as?: object, own?: object, tokens?: Array<object>}} record
 * @param {Array<{uuid: string, img: string|null, shaped: boolean}>} tokens  the actor's tokens now;
 *   `img` the face it shows, or for a shaped token the face its shape goes back to
 * @returns {Array<{uuid: string, update: object}>}
 */
export function guiseRestoreWrites(record, tokens = []) {
  const held = new Map((record?.tokens ?? []).filter(t => t?.uuid).map(t => [t.uuid, t]));
  const ownImg = record?.own?.tokenImg || record?.own?.img || null;
  const ownName = record?.own?.tokenName || record?.own?.name || null;
  const asImg = record?.as?.tokenImg || record?.as?.img || null;
  const out = [];
  for (const t of tokens ?? []) {
    if (!t?.uuid) continue;
    const before = held.get(t.uuid) ?? null;
    if (!before && !(asImg && t.img === asImg)) continue;
    const img = before?.img || ownImg;
    const name = before?.name || ownName;
    const update = {};
    if (name) update.name = name;
    if (img) {
      if (t.shaped) update["flags.azeroth-rpg.shapeRestore.src"] = img;
      else update["texture.src"] = img;
    }
    if (Object.keys(update).length) out.push({ uuid: t.uuid, update });
  }
  return out.sort((a, b) => a.uuid.localeCompare(b.uuid));
}

/**
 * **THE BANE TO SEE THROUGH COURT GUISE** (04: *Arcana and Investigation Tests to see
 * through it take a Bane*): one, on a Test of those skills whose target wears one. The
 * door judges who is targeted; this names the Bane.
 *
 * @param {{skill?: string|null, targetGuised?: boolean}} o
 * @returns {number}
 */
export function courtGuiseBanes({ skill = null, targetGuised = false } = {}) {
  return targetGuised === true && COURT_GUISE_SKILLS.includes(String(skill ?? "")) ? 1 : 0;
}

/**
 * **SILVER TONGUE** (04: *While you wear a Court Guise, your Deception and Persuasion
 * Tests gain a Boon*; the lead, 2026-11-08: *"reword the talent on number 5 to only work
 * with the court guise"*): the Boons, or null. Only a Court Guise worn counts - never the
 * Outcast's own mortal guise (`system.guise`) and never a drake form.
 *
 * @param {Array} talents
 * @param {{skill?: string|null, courtGuise?: boolean}} o
 * @param {Function} rowOf
 * @returns {{boons: number, name: string}|null}
 */
export function silverTongueFor(talents = [], { skill = null, courtGuise = false } = {}, rowOf) {
  const r = rowsOfKind(talents, "silverTongue", rowOf)[0] ?? null;
  if (!r) return null;
  if (!(r.row.skills ?? []).includes(String(skill ?? ""))) return null;
  if (courtGuise !== true) return null;
  return { boons: Math.max(1, count(r.row.boons)), name: r.talent.name };
}
