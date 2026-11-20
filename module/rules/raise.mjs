/**
 * **A DEATH THAT RAISES A SUMMON** (the Legacy branches' door 5). Pure: no Foundry
 * imports (CLAUDE.md §3).
 *
 * 04's Dark Minion: *When a creature hit by your **Black Arrow** drops to 0 Health
 * before the end of your next turn, it rises as a **Risen Skeleton** that acts on
 * your Initiative until the encounter ends. You may control one per rank.*
 *
 * - **"Hit by your Black Arrow ... before the end of your next turn"** is the mark
 *   Black Arrow's hit already lays: *recovers no Health until the end of your next
 *   turn* (B1's `noHealing` rider, `effects/no-healing.mjs`), an effect on the
 *   creature whose `origin` is the archer, whose flag names the talent by name, and
 *   whose span is the archer's next turn's end. A creature still carrying it when
 *   it drops is one hit inside the window; one whose mark core has expired is not.
 *   MY READING, for the lead: the mark IS the window, so a creature healed past the
 *   mark (it recovers none while marked) or one the archer marked again counts the
 *   latest mark.
 * - **"It rises as a Risen Skeleton"**: 14's own entry, bound to the archer as a
 *   summon until the encounter ends (D-643's `bind`, kind `summon`), its token
 *   placed where the creature fell (door 4). The fallen creature's own token is
 *   left as the table's to clear.
 * - **"You may control one per rank"**: a creature past the count does not rise, and
 *   the card says so.
 *
 * The row (`raise {from, entry, until, count}`) is the OWNER's: `from` is the
 * identifier of the talent whose mark raises (Black Arrow), and the mark is matched
 * by that talent's NAME, which is what the mark carries.
 */

import { evaluateExpression } from "./expressions.mjs";
import { talentEffect } from "./talent-effects.mjs";

/** How long a raised creature stays: the encounter (*until the encounter ends*). */
export const RAISE_UNTIL = Object.freeze(["encounter"]);

/** A taken talent's rank, a whole number from 1. */
const rankOf = talent => Math.max(1, Math.trunc(Number(talent?.taken) || 0));

/**
 * **THE RAISES A CHARACTER'S TALENTS GIVE**, at the rank: each row's mark-giving
 * talent (by identifier, and by the name its mark carries), the 14 entry it raises,
 * how long it stays and how many it may control. A row whose `from` names a talent
 * the character has not taken raises nothing - the mark can only be laid by it.
 *
 * @param {Array<{identifier: string, className?: string, race?: string|null, name: string, taken: number}>} talents
 * @param {Function} [rowOf]
 * @returns {Array<{identifier: string, name: string, from: string, fromName: string, entry: string, until: string, count: number}>}
 */
export function raiseRowsFor(talents = [], rowOf = talentEffect) {
  const out = [];
  const taken = (talents ?? []).filter(t => (Math.trunc(Number(t?.taken)) || 0) > 0);
  for (const t of taken) {
    const row = rowOf(t.className, t.identifier, t.race ?? null)?.raise ?? null;
    if (!row || typeof row !== "object" || !row.entry || !row.from) continue;
    const source = taken.find(s => s.identifier === row.from) ?? null;
    if (!source) continue;
    const rank = rankOf(t);
    const n = typeof row.count === "number" ? row.count : evaluateExpression(String(row.count ?? "rank"), { rank });
    const count = Math.max(0, Math.trunc(Number(n)) || 0);
    if (count < 1) continue;
    out.push({
      identifier: t.identifier, name: t.name, from: row.from, fromName: source.name,
      entry: String(row.entry), until: RAISE_UNTIL.includes(row.until) ? row.until : "encounter", count
    });
  }
  return out.sort((a, b) => a.identifier.localeCompare(b.identifier));
}

/**
 * **WHICH OF AN OWNER'S RAISES A FALLEN CREATURE ANSWERS TO**: the first row whose
 * mark-giving talent laid a mark the creature still carries, by that owner.
 *
 * @param {Array<{origin?: string|null, source?: string, active?: boolean}>} marks
 *   the fallen creature's no-healing marks, as plain data
 * @param {string} ownerUuid
 * @param {ReturnType<typeof raiseRowsFor>} rows  the OWNER's
 * @returns {object|null}  the row
 */
export function raiseFor(marks = [], ownerUuid = null, rows = []) {
  if (!ownerUuid) return null;
  const by = (marks ?? []).filter(m => m && m.active !== false && m.origin === ownerUuid).map(m => String(m.source ?? ""));
  return (rows ?? []).find(r => by.includes(r.fromName)) ?? null;
}

/**
 * Whether one more rises: the owner controls fewer than the count. A lang key for
 * the refusal, or null.
 *
 * @param {{held?: number, count?: number}} o
 * @returns {string|null}
 */
export function raiseRefusal({ held = 0, count = 0 } = {}) {
  return (Math.trunc(Number(held)) || 0) >= (Math.trunc(Number(count)) || 0) ? "AZEROTH.Raise.Full" : null;
}

/* ------------------------------------------------------------------ */
/*  The Death Knight's raises (07 §17, 02 §7's Army of the Dead)        */
/* ------------------------------------------------------------------ */

/**
 * **THE DEATH KNIGHT'S RAISES** (07 §17's *Raising the dead* table; 02 §7's Army of the Dead;
 * the Death Knight plan's *Raising the dead*). Each row is one spell or feature:
 *
 * - `entry` - the 14 block it raises;
 * - `corpses` - how many corpses it takes, `{min, max}`, and `per: "corpse"` where each corpse
 *   rises as its own creature (Raise Skeleton's *Each corpse rises*, Army of the Dead's six),
 *   `per: "raise"` where they make one (Raise Abomination's *three corpses stitch together*);
 * - `kinds` / `minSize` - what a corpse must have been (*Humanoid*, *Medium or larger*, *a
 *   dragon*); `together` - the feet every corpse stands within of every other (*within 10 ft
 *   of each other*); `feet` - the reach a feature states (Army of the Dead's *within 60 feet*),
 *   a spell's own being its Range;
 * - `span` - how long it stands: `rounds` (1 minute is ten, 1 hour six hundred, Army of the
 *   Dead's three), or `longRest` (*until your next Long Rest*);
 * - `capAtLeast` - the Runic Power cap the knight must reach to pay it at all (Raise
 *   Dracolich's 15: refused in words below it, the plan's *Charisma 20 for Raise Dracolich*).
 *
 * `raise-skeleton.test` holds every number to 07's table and entries and to 02's row.
 */
export const RAISES = Object.freeze({
  "raise-skeleton": Object.freeze({ entry: "Risen Skeleton", corpses: Object.freeze({ min: 1, max: 2 }), per: "corpse", kinds: Object.freeze(["humanoid"]), minSize: null, together: null, feet: null, span: Object.freeze({ rounds: 10 }), capAtLeast: null }),
  "raise-ghoul": Object.freeze({ entry: "Plagued Ghoul", corpses: Object.freeze({ min: 1, max: 1 }), per: "corpse", kinds: Object.freeze(["humanoid"]), minSize: null, together: null, feet: null, span: Object.freeze({ rounds: 10 }), capAtLeast: null }),
  "raise-crypt-fiend": Object.freeze({ entry: "Crypt Fiend", corpses: Object.freeze({ min: 1, max: 1 }), per: "corpse", kinds: null, minSize: "medium", together: null, feet: null, span: Object.freeze({ rounds: 10 }), capAtLeast: null }),
  "raise-abomination": Object.freeze({ entry: "Abomination", corpses: Object.freeze({ min: 3, max: 3 }), per: "raise", kinds: null, minSize: null, together: 10, feet: null, span: Object.freeze({ rounds: 600 }), capAtLeast: null }),
  "raise-dracolich": Object.freeze({ entry: "Dracolich", corpses: Object.freeze({ min: 1, max: 1 }), per: "corpse", kinds: Object.freeze(["dragonkin"]), minSize: null, together: null, feet: null, span: Object.freeze({ longRest: true }), capAtLeast: 15 }),
  // 02 §7: *Up to six corpses within 60 feet of you rise as Risen Skeletons ... for three
  // rounds ... They collapse at the end of the third round.*
  "army-of-the-dead": Object.freeze({ entry: "Risen Skeleton", corpses: Object.freeze({ min: 1, max: 6 }), per: "corpse", kinds: null, minSize: null, together: null, feet: 60, span: Object.freeze({ rounds: 3 }), capAtLeast: null })
});

/**
 * **THE NECROMANCER'S RAISES** (07 §17's *The Necromancer raises a horde* table; 02 §7's Command
 * the Dead; the Necromancer plan's door 3). The knight's row shape, and four keys more:
 *
 * - `horde: true` - the raise stands in the caster's horde: one LINKED world actor and one carrier
 *   a creature, a recast adds to what stands (*Casting a raise spell again does not collapse the
 *   dead it raised before*), and the places are judged before anything is paid;
 * - `keepsReaction` - the entry's *It keeps its Reaction* (Stitch Abomination, Bind Banshee, Raise
 *   Crypt Horror), read by the shared turn (`horde.mjs#turnShape`);
 * - `perCorpse` - how many rise from one corpse (Raise Dead's *two Risen Skeletons*);
 * - `choices` - the entries a creature may rise as instead (The Dead Rise's *a Risen Skeleton or a
 *   Plagued Ghoul, your choice for each*); `outside` - *They take no places in your horde*;
 * - `maxSize` - Animate Corpse's *Medium or smaller*; `corpses: null` - Stitch Abomination's
 *   material, which the GM judges (the lead: *"enforced by the GM not automation/code"*), so no
 *   corpse is claimed and the Abomination stands at a space the caster picks within its Range;
 * - `table` - a clause the door never judges and the census carries (Bind Banshee's *female* and
 *   *dead less than a day*: the lead's ruling, no block records either).
 *
 * `necromancer-horde.test` holds every number to 07's table and entries.
 */
const HORDE_ROW = Object.freeze({ together: null, capAtLeast: null, horde: true, keepsReaction: false, perCorpse: 1, choices: null, outside: false, maxSize: null, table: null });
export const NECRO_RAISES = Object.freeze({
  "raise-dead": Object.freeze({ ...HORDE_ROW, entry: "Risen Skeleton", corpses: Object.freeze({ min: 1, max: 1 }), per: "corpse", perCorpse: 2, kinds: Object.freeze(["humanoid"]), minSize: null, feet: null, span: Object.freeze({ longRest: true }) }),
  "animate-corpse": Object.freeze({ ...HORDE_ROW, entry: "Risen Zombie", corpses: Object.freeze({ min: 1, max: 2 }), per: "corpse", kinds: null, minSize: null, maxSize: "medium", feet: null, span: Object.freeze({ longRest: true }) }),
  "ghoul-rising": Object.freeze({ ...HORDE_ROW, entry: "Plagued Ghoul", corpses: Object.freeze({ min: 1, max: 1 }), per: "corpse", kinds: Object.freeze(["humanoid"]), minSize: null, feet: null, span: Object.freeze({ longRest: true }) }),
  "stitch-abomination": Object.freeze({ ...HORDE_ROW, entry: "Abomination", corpses: null, per: "raise", kinds: null, minSize: null, feet: null, span: Object.freeze({ longRest: true }), keepsReaction: true, table: "material" }),
  "bind-banshee": Object.freeze({ ...HORDE_ROW, entry: "Banshee", corpses: Object.freeze({ min: 1, max: 1 }), per: "corpse", kinds: Object.freeze(["humanoid"]), minSize: null, feet: null, span: Object.freeze({ longRest: true }), keepsReaction: true, table: "female" }),
  "raise-crypt-horror": Object.freeze({ ...HORDE_ROW, entry: "Crypt Horror", corpses: Object.freeze({ min: 1, max: 1 }), per: "corpse", kinds: null, minSize: "large", feet: null, span: Object.freeze({ longRest: true }), keepsReaction: true }),
  "the-dead-rise": Object.freeze({ ...HORDE_ROW, entry: "Risen Skeleton", choices: Object.freeze(["Risen Skeleton", "Plagued Ghoul"]), corpses: Object.freeze({ min: 1, max: 10 }), per: "corpse", kinds: Object.freeze(["humanoid"]), minSize: null, feet: 60, span: Object.freeze({ rounds: 600 }), outside: true })
});

/**
 * **A RISING THAT NO CAST CHOOSES** (07's Plague of Undeath: *When a creature that failed dies
 * before the duration ends, it rises as a Plagued Ghoul under your control at the start of your
 * next turn. It stands until your next Long Rest*): its own row, never in `RAISES`, because the
 * spell's cast is an area and `castSpell` judges a raise off `raiseOf`.
 */
export const HORDE_RISINGS = Object.freeze({
  "plague-of-undeath": Object.freeze({ ...HORDE_ROW, entry: "Plagued Ghoul", corpses: null, per: "raise", kinds: null, minSize: null, feet: null, span: Object.freeze({ longRest: true }) }),
  // 04's Acolyte's Sacrifice (Phase 4c-T): *A Shade ... rises in its space as one of your raised dead,
  // until your next Long Rest* - no corpse; the space is the creature's that collapsed for it.
  "acolytes-sacrifice": Object.freeze({ ...HORDE_ROW, entry: "Shade", corpses: null, per: "raise", kinds: null, minSize: null, feet: 30, span: Object.freeze({ longRest: true }) })
});

/** The talents that widen a Necromancer raise's corpses (04's Ranks of Bone, Shambling Horde: *1 additional corpse per rank*). */
export const RAISE_WIDENED_BY = Object.freeze({ "raise-dead": "Ranks of Bone", "animate-corpse": "Shambling Horde" });

/**
 * **A NECROMANCER RAISE AT THE CASTER'S RANKS**: the row with its corpses widened by the talent
 * that names it, read by name off `ranksOf(name)`. Any other row comes back unchanged.
 *
 * @param {string} key
 * @param {(name: string) => number} [ranksOf]
 * @returns {object|null}
 */
export function hordeRaiseRow(key, ranksOf = () => 0) {
  const row = NECRO_RAISES[String(key ?? "")] ?? null;
  if (!row) return null;
  const talent = RAISE_WIDENED_BY[key];
  const more = talent ? Math.max(0, Math.trunc(Number(ranksOf(talent))) || 0) : 0;
  return more > 0 && row.corpses ? { ...row, corpses: { min: row.corpses.min, max: row.corpses.max + more } } : row;
}

/**
 * **WHAT THE CREATURES OF ONE RAISE MAY RISE AS** - every composition, one a choice in the one
 * chooser (D-673), the plain one first: The Dead Rise's ghouls for any of its creatures; Raise
 * Dead's Skeletal Archers (04's Skeletal Archery: *any of the skeletons may rise as Skeletal
 * Archers*) and Skeletal Mages (Skeletal Mastery: *a number of the skeletons up to your rank*).
 * Each composition is the entries in rising order, so the plan never reorders.
 *
 * @param {object} row  a `NECRO_RAISES` row
 * @param {{count?: number, archery?: number, mastery?: number}} o
 * @returns {Array<{key: string, entries: string[], counts: Record<string, number>}>}
 */
export function entryCompositions(row, { count = 0, archery = 0, mastery = 0 } = {}) {
  const n = Math.max(0, Math.trunc(Number(count)) || 0);
  const make = counts => {
    const entries = [];
    for (const [name, k] of Object.entries(counts)) for (let i = 0; i < k; i++) entries.push(name);
    const key = Object.entries(counts).filter(([, k]) => k > 0).map(([name, k]) => `${k}x${name}`).join("+");
    return { key, entries, counts: Object.fromEntries(Object.entries(counts).filter(([, k]) => k > 0)) };
  };
  if (!row || n < 1) return [];
  if (Array.isArray(row.choices) && row.choices.length > 1) {
    const [base, other] = row.choices;
    return Array.from({ length: n + 1 }, (_, k) => make({ [base]: n - k, [other]: k }));
  }
  if (row.entry !== "Risen Skeleton" || !row.horde) return [make({ [row.entry]: n })];
  const archers = Math.trunc(Number(archery)) > 0;
  const mages = Math.max(0, Math.min(n, Math.trunc(Number(mastery)) || 0));
  const out = [];
  for (let m = 0; m <= mages; m++) {
    for (let a = 0; a <= (archers ? n - m : 0); a++) out.push(make({ "Risen Skeleton": n - m - a, "Skeletal Archer": a, "Skeletal Mage": m }));
  }
  return out;
}

/** The flag a raise's carrier rides on the knight, and a corpse's own mark rides its token. */
export const RAISE_FLAG = "raised";
export const CORPSE_FLAG = "corpse";

/**
 * **THE SPELLS THAT MARK A CORPSE** (07 §17's *A corpse ... Corpse Burst destroys one, and Stay the
 * Rot keeps one for you alone*, and Seal the Soul's *No creature can raise the body as undead for
 * the duration*): the state each lays and for how long, in the world's seconds - Stay the Rot's
 * *Instant, 10 days*, Seal the Soul's *Instant, 1 day*, Corpse Burst's for ever.
 */
export const CORPSE_MARKS = Object.freeze({
  "corpse-burst": Object.freeze({ state: "destroyed", seconds: null }),
  "stay-the-rot": Object.freeze({ state: "kept", seconds: 10 * 86400 }),
  "seal-the-soul": Object.freeze({ state: "sealed", seconds: 86400 }),
  // **04's FLESH OFFERING** (*you may destroy one corpse within 30 feet of you*; the Necromancer
  // plan's door 2): a TALENT's mark, its reach its own 30 feet rather than a spell's Range.
  "flesh-offering": Object.freeze({ state: "destroyed", seconds: null, talent: true, feet: 30 })
});

/**
 * A spell's **Range** in feet: *Touch* is 5 (a creature within reach), *Self* 0, *N ft* N, and
 * anything else null - no reach judged.
 *
 * @param {string} text
 * @returns {number|null}
 */
export function rangeFeetOf(text = "") {
  const s = String(text ?? "").trim().toLowerCase();
  if (s === "touch") return 5;
  if (s === "self") return 0;
  const m = /^(\d+)\s*(?:ft|feet)\b/.exec(s);
  return m ? Number(m[1]) : null;
}

/**
 * **A RAISE'S REACH, WITH 02 §7's FAR-REACHING** (*The spell's range doubles, if it is not Self or
 * Touch*; the 4b review's MUST-FIX 6): the reach a row states (The Dead Rise's *within 60 ft of
 * you*, a feature's) or the spell's Range in feet, doubled only where the Range itself is a
 * distance - a Self or Touch spell, and a row's own reach under a Self Range, are never doubled.
 * Null where nothing is read (no reach judged).
 *
 * @param {object} row
 * @param {string} rangeText  the spell's **Range**
 * @param {{farReaching?: boolean}} [o]
 * @returns {number|null}
 */
export function raiseReach(row = {}, rangeText = "", { farReaching = false } = {}) {
  const range = rangeFeetOf(rangeText);
  const base = row?.feet ?? range;
  if (base === null || base === undefined) return null;
  const doubles = farReaching === true && row?.feet == null && typeof range === "number" && range > 5;
  return doubles ? base * 2 : base;
}

/**
 * **A RAISE'S SPAN, WITH 02 §7's LASTING** (*The spell's duration doubles, if it lasts 1 minute or
 * longer and is not Sustained*): the carrier's rounds (`raiseRounds`) twice over; *until your next
 * Long Rest* is no count and is left as it is (the review: *a Long Rest span unaffected*).
 *
 * @param {object} row
 * @param {{lasting?: boolean}} [o]
 * @returns {number|null}
 */
export function raiseSpanRounds(row = {}, { lasting = false } = {}) {
  const rounds = raiseRounds(row);
  return rounds && lasting === true ? rounds * 2 : rounds;
}

/** 05's size ladder, smallest first (`AZEROTH.sizes`), for *Medium or larger*. */
const SIZE_LADDER = Object.freeze(["tiny", "small", "medium", "large", "huge", "enormous"]);

/** The raise a spell or feature is, by identifier, or null. */
export function raiseOf(identifier) {
  const key = String(identifier ?? "");
  return RAISES[key] ?? NECRO_RAISES[key] ?? null;
}

/**
 * How many creatures a raise stands from the corpses it took, at the row's `perCorpse` (Raise
 * Dead's two from one); a raise with no corpse rule (Stitch Abomination) stands one.
 *
 * @param {object} row
 * @param {number} corpses
 */
export function hordeCount(row, corpses = 0) {
  if (!row) return 0;
  if (!row.corpses) return 1;
  return raisedCount(row, corpses) * Math.max(1, Math.trunc(Number(row.perCorpse)) || 1);
}

/**
 * How many creatures a raise makes from the corpses it took: one a corpse, or one in all.
 *
 * @param {object} row  `RAISES`'
 * @param {number} corpses
 */
export function raisedCount(row, corpses = 0) {
  const n = Math.max(0, Math.trunc(Number(corpses)) || 0);
  return row?.per === "raise" ? (n > 0 ? 1 : 0) : n;
}

/**
 * **WHAT A DEFEATED TOKEN IS, AS A CORPSE** (07 §17: *A corpse is a dead creature's body*; the
 * plan: *on the board, a defeated token*): a creature marked dead, or an NPC at 0 Health - a
 * character at 0 Health is Dying, not dead - that is not itself a raised dead. Plain facts in.
 *
 * @param {{dead?: boolean, npc?: boolean, health?: number|null, raised?: boolean}} o
 */
export function isCorpse({ dead = false, npc = false, health = null, raised = false } = {}) {
  if (raised === true) return false;
  if (dead === true) return true;
  return npc === true && typeof health === "number" && Number.isFinite(health) && health <= 0;
}

/**
 * **A CORPSE'S OWN MARK, CLEANED** (`CORPSE_FLAG` on its token): `state` - `raised` (risen
 * already, and gone with its raise), `destroyed` (Corpse Burst: *The corpse is destroyed and
 * cannot be raised*), `kept` (Stay the Rot: *No creature but you can raise or animate it*) or
 * `sealed` (Seal the Soul: *No creature can raise the body as undead*); `by` the knight whose
 * mark it is; `until` the world's time it ends at, or null for ever.
 *
 * @param {unknown} raw
 * @returns {{state: string, by: string|null, until: number|null}|null}
 */
export function corpseMark(raw) {
  if (!raw || typeof raw !== "object") return null;
  // 07 §17's Soul Cage (`caged`: *no one but you can raise ... it*) and Sever the Soul (`severed`:
  // *nothing can raise or restore it*), laid when the creature died (run 4c-S).
  const state = ["raised", "destroyed", "kept", "sealed", "caged", "severed"].includes(raw.state) ? raw.state : null;
  if (!state) return null;
  // `Number(null)` is 0, so a mark for ever (`until: null`) must be read as null BEFORE it is
  // cast, or every such mark would read as ended at the world's time 0 (found by the live run).
  const until = raw.until === null || raw.until === undefined || raw.until === "" ? NaN : Number(raw.until);
  return { state, by: typeof raw.by === "string" && raw.by ? raw.by : null, until: Number.isFinite(until) ? until : null };
}

/**
 * **WHY THIS CORPSE MAY NOT RISE FOR THIS RAISE**, or null: its mark first (destroyed, risen,
 * kept by another knight, sealed - each while its time stands), then what it was (the
 * raise's kinds and size), then where it lies (`feet` against the reach). A lang key's last
 * part, so the door says it in words.
 *
 * @param {{kind?: string|null, size?: string|null, feet?: number|null, mark?: object|null}} corpse
 * @param {object} row  `RAISES`'
 * @param {{knightUuid?: string|null, reach?: number|null, now?: number}} o
 * @returns {"destroyed"|"raised"|"kept"|"sealed"|"kind"|"size"|"sizeMax"|"range"|null}
 */
export function corpseRefusal(corpse = {}, row = {}, { knightUuid = null, reach = null, now = 0 } = {}) {
  const mark = corpseMark(corpse?.mark);
  const live = mark && (mark.until === null || Number(now) < mark.until);
  if (live && mark.state === "destroyed") return "destroyed";
  if (live && mark.state === "raised") return "raised";
  if (live && mark.state === "sealed") return "sealed";
  if (live && mark.state === "kept" && mark.by !== knightUuid) return "kept";
  if (live && mark.state === "severed") return "severed";
  if (live && mark.state === "caged" && mark.by !== knightUuid) return "caged";
  if (Array.isArray(row?.kinds) && row.kinds.length && !row.kinds.includes(corpse?.kind ?? null)) return "kind";
  if (row?.minSize && SIZE_LADDER.indexOf(corpse?.size ?? "") < SIZE_LADDER.indexOf(row.minSize)) return "size";
  // Animate Corpse's *Medium or smaller*: a size the ladder does not know is refused too.
  if (row?.maxSize && !(SIZE_LADDER.indexOf(corpse?.size ?? "") >= 0 && SIZE_LADDER.indexOf(corpse.size) <= SIZE_LADDER.indexOf(row.maxSize))) return "sizeMax";
  const feet = corpse?.feet;
  if (reach !== null && reach !== undefined && !(typeof feet === "number" && Number.isFinite(feet) && feet <= reach + 1e-6)) return "range";
  return null;
}

/**
 * **WHETHER THE CORPSES CHOSEN MAKE ONE RAISE**: the count inside `corpses`, each named once,
 * and - for Raise Abomination - every pair within `together` feet (`apart(a, b)`, measured
 * footprint to footprint, D-732). A lang key's last part, or null.
 *
 * @param {string[]} ids  the corpses chosen, by token id
 * @param {object} row  `RAISES`'
 * @param {(a: string, b: string) => number|null} [apart]
 * @returns {"few"|"many"|"apart"|null}
 */
export function raiseSetRefusal(ids = [], row = {}, apart = () => null) {
  const unique = [...new Set((ids ?? []).filter(id => typeof id === "string" && id))];
  if (unique.length < (row?.corpses?.min ?? 1)) return "few";
  if (unique.length > (row?.corpses?.max ?? 1)) return "many";
  if (row?.together) {
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const feet = apart(unique[i], unique[j]);
        if (!(typeof feet === "number" && Number.isFinite(feet) && feet <= row.together + 1e-6)) return "apart";
      }
    }
  }
  return null;
}

/**
 * **WHETHER THE KNIGHT MAY PAY THIS RAISE AT ALL** (Raise Dracolich's 15 Runic Power: the plan's
 * *Charisma 20 for Raise Dracolich*, the cap 10 plus the modifier): the cap below the row's
 * floor is refused in words before anything is spent.
 *
 * @param {object} row
 * @param {{cap?: number}} o
 * @returns {"cap"|null}
 */
export function raiseCapRefusal(row = {}, { cap = 0 } = {}) {
  const need = Math.trunc(Number(row?.capAtLeast)) || 0;
  return need > 0 && (Math.trunc(Number(cap)) || 0) < need ? "cap" : null;
}

/**
 * **WHETHER THE ASKER MAY RAISE AT ALL, ASKED AGAIN ON THE GM'S CLIENT** (the F3 review): a query
 * payload is the asker's word, so the GM's handler asks again what the asker's own door asked.
 * The token named as the centre of the reach must be the knight's own token, the knight must hold
 * the spell or feature by identifier, and the Runic Power cap the raise needs must hold. A lang
 * key's last part, or null.
 *
 * @param {{row?: object|null, fromActorId?: string|null, ownerId?: string|null, held?: string[], key?: string|null, cap?: number}} o
 * @returns {"noToken"|"notKnight"|"notHeld"|"cap"|null}
 */
export function raiseAskRefusal({ row = null, fromActorId = null, ownerId = null, held = [], key = null, cap = 0 } = {}) {
  if (!row) return "noToken";
  if (!fromActorId || !ownerId || fromActorId !== ownerId) return "notKnight";
  if (!key || !(held ?? []).includes(key)) return "notHeld";
  return raiseCapRefusal(row, { cap });
}

/**
 * **WHY A SPELL MAY NOT MARK THIS CORPSE**, from the corpse's refusal (`corpseRefusal`): a corpse
 * kept or sealed by another may still be burst (Corpse Burst destroys it), and every other refusal
 * stands. One reading for the asker's door and the GM's handler, so a stale or forged payload
 * cannot write over a `destroyed`, another knight's `kept`, a `sealed` or a live `raised` mark.
 *
 * @param {string|null} refusal  `corpseRefusal`'s answer
 * @param {string} state  the mark the spell lays (`CORPSE_MARKS[key].state`)
 * @returns {string|null}
 */
export function corpseMarkRefusal(refusal = null, state = "") {
  if ((refusal === "kept" || refusal === "sealed" || refusal === "caged" || refusal === "severed") && state === "destroyed") return null;
  return refusal ?? null;
}

/**
 * **THE RAISES A DELETED SCENE STRANDED** (the F3 review): a raise every one of whose dead keeps no
 * token on any scene left. One row a raised world actor, `{raiseId, scenes}` (the scenes still
 * holding one of its tokens); the raise ids, distinct and sorted. A raise one of whose dead still
 * stands somewhere is not stranded.
 *
 * @param {Array<{raiseId: string, scenes: string[]}>} held
 * @returns {string[]}
 */
export function strandedRaises(held = []) {
  const standing = new Set();
  const all = new Set();
  for (const h of held ?? []) {
    if (typeof h?.raiseId !== "string" || !h.raiseId) continue;
    all.add(h.raiseId);
    if ((h.scenes ?? []).length) standing.add(h.raiseId);
  }
  return [...all].filter(id => !standing.has(id)).sort();
}

/**
 * The carrier's span in the fight's rounds, or null for *until your next Long Rest* (the
 * carrier then has no duration and the Long Rest's release ends it).
 *
 * @param {object} row
 * @returns {number|null}
 */
export function raiseRounds(row = {}) {
  if (row?.span?.longRest === true) return null;
  const n = Math.trunc(Number(row?.span?.rounds));
  return n > 0 ? n : null;
}

/**
 * The bond's `until` for a raise: `longRest` for the Dracolich's, `raised` (the carrier's own
 * clock) for every other (`rules/bound.mjs#RAISED_UNTIL`).
 */
export function raiseUntil(row = {}) {
  return row?.span?.longRest === true ? "longRest" : "raised";
}

/**
 * **THE OWNERS A FALLEN CREATURE'S MARKS NAME**: the distinct origins of its active
 * no-healing marks, sorted - the archers whose rows the door asks.
 *
 * @param {Array<{origin?: string|null, active?: boolean}>} marks
 * @returns {string[]}
 */
export function markOwners(marks = []) {
  return [...new Set((marks ?? []).filter(m => m && m.active !== false && typeof m.origin === "string" && m.origin).map(m => m.origin))].sort();
}

/**
 * **WHETHER A RAISE THE GM'S CLIENT DID NOT CONFIRM ROSE ANYWAY** (the final review's finding 2,
 * D-997). The asker judges the raise before it pays (D-768), and the GM's handler judges it again
 * (a second knight's claim on the same corpse can only be seen there). Where the ask fails, the
 * price is given back only if nothing rose: a query that timed out may still have made the dead,
 * and then the knight's carrier for this raise carries an id it did not carry before the ask.
 *
 * @param {string[]} before  the raise carriers' ids for this raise key, read before the ask
 * @param {string[]} after   the same, read once the ask failed
 * @returns {boolean}  true where a new carrier stands, so the raise happened and nothing is given back
 */
export function raiseRoseAnyway(before = [], after = []) {
  const held = new Set((before ?? []).filter(id => typeof id === "string"));
  return (after ?? []).some(id => typeof id === "string" && !held.has(id));
}
