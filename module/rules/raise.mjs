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
  "seal-the-soul": Object.freeze({ state: "sealed", seconds: 86400 })
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

/** 05's size ladder, smallest first (`AZEROTH.sizes`), for *Medium or larger*. */
const SIZE_LADDER = Object.freeze(["tiny", "small", "medium", "large", "huge", "enormous"]);

/** The raise a spell or feature is, by identifier, or null. */
export function raiseOf(identifier) {
  return RAISES[String(identifier ?? "")] ?? null;
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
  const state = ["raised", "destroyed", "kept", "sealed"].includes(raw.state) ? raw.state : null;
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
 * @returns {"destroyed"|"raised"|"kept"|"sealed"|"kind"|"size"|"range"|null}
 */
export function corpseRefusal(corpse = {}, row = {}, { knightUuid = null, reach = null, now = 0 } = {}) {
  const mark = corpseMark(corpse?.mark);
  const live = mark && (mark.until === null || Number(now) < mark.until);
  if (live && mark.state === "destroyed") return "destroyed";
  if (live && mark.state === "raised") return "raised";
  if (live && mark.state === "sealed") return "sealed";
  if (live && mark.state === "kept" && mark.by !== knightUuid) return "kept";
  if (Array.isArray(row?.kinds) && row.kinds.length && !row.kinds.includes(corpse?.kind ?? null)) return "kind";
  if (row?.minSize && SIZE_LADDER.indexOf(corpse?.size ?? "") < SIZE_LADDER.indexOf(row.minSize)) return "size";
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
  if ((refusal === "kept" || refusal === "sealed") && state === "destroyed") return null;
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
