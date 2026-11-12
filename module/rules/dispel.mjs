/**
 * **02's DISPEL** (D-778; the lead, 2026-10-03, on O-157: *"selected Effects,
 * not conditions."*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * *As an action, spend 4 Mana to end any number of effects on one target you can
 * see within 30 feet.* The Use paid and posted a card and ended nothing, so five
 * talents hung on a door that did not exist: Rapture's further target, Aegis
 * Eternal's and Improved Moonfire's *cannot be ended by Dispel*, Unstable
 * Affliction's Fel damage and Everlasting Affliction's Casting Test at rank 2.
 *
 * ## What Dispel may end, and what it lists greyed
 *
 * The user SELECTS: the one chooser lists every Active Effect standing on the
 * creature, and `dispelJudgement` says which may be ended - and, for every one it
 * greys, why, in words the chooser prints beside it:
 *
 * - **`condition`** - an effect carrying one of A1's fifteen (the lead: *not
 *   conditions*). A laid spell that carries a condition is greyed with it, since
 *   ending the effect would end the condition (MY READING, for the lead).
 * - **`status`** - a bare state of the fight a status toggled on (Guard, Ready,
 *   a GM's own status) and no laid thing (MY READING: no effect was laid).
 * - **`aura`**, **`talent`**, **`bond`** - what the system lays again at once: an
 *   ally's aura (`effects/auras.mjs`), the creature's own taken talent
 *   (`syncTalentEffects`), its owner's talent on a bound creature (`syncBound`).
 *   Ending one would cost the Mana and change nothing.
 * - **`injury`** - a Critical Injury's lasting penalty, which heals and is not
 *   ended (MY READING, for the lead: 06 §8 heals an injury).
 * - **`marked`** - a talent says Dispel cannot end it: 04's Aegis Eternal on 02's
 *   Ward (`priestWard.undispellable`) and Improved Moonfire at rank 2 on Moonfire
 *   (`UNDISPELLABLE_FLAG`, laid by the spell card's Apply).
 * - **`archmage`** - a spell laid by a caster under 07's Archmage: *your spells
 *   can be ended only by you: no dispel, counter or unweaving of any kind touches
 *   them* (found beside the door, D-778).
 *
 * Everything else - a laid spell, a tick, a Ward, a talent's state or buff, a laid
 * Bane or Boon, a Speed drop, a shape (the rulings' READING: *A shape can be
 * selected too, since it is an effect*), a draught's or a Signature's effect - may
 * be selected. A disabled effect is not listed at all: it stands on nobody.
 *
 * ## A Sustained spell is dispelled as the cast (O-308)
 *
 * The lead, 2026-11-11: *"308 - sustained spells are ended by dispel, so Sand Prison would be
 * stopped."* 07 §7's table: a Sustained spell is *Ended by **Dispel***. An effect that belongs to
 * a Sustained cast - the sustained carrier's mark (`sustained`, `cast`) with its caster as the
 * origin, a condition laid by a failed Resist or the card's Apply as much as a buff - is listed
 * and ended AS THE CAST (`sustain` on the verdict), where the caster still holds that cast
 * (`held`, read off the caster's Sustain list by the door): the door ends the Sustain through the
 * one end door, which takes every effect the cast laid on every creature, its area and its
 * upkeep. D-778's *not conditions* still holds for a bare condition no held cast laid, and a
 * caster under 07's Archmage (*no creature may end a Sustained spell of yours by any means*) is
 * refused as before. A door that hands no `held` (Devour Magic, the Nullifier, the Obsidian
 * Destroyer) judges exactly as it did.
 *
 * ## An area Sustain with nothing laid on a creature (O-312)
 *
 * The lead, 2026-11-11: *"312 - yes it can"*. A held Sustain is reached through its CASTER, a
 * creature standing in its AREA, or the area itself (`castsReached`), listed as a row of its own
 * (`heldCastKey`) and ended through the same one end door, once. 04's Disenchant and 07's Unweave
 * reach it the same way (the lead: *"unweave - yes"*, *"disenchant - yes"*).
 *
 * ## The warlock's two talents
 *
 * *Your ongoing effects* is `class-talents.mjs#swappableEffects`' reading (D-775):
 * a tick the warlock's hand laid, a spell effect whose origin is the warlock, a
 * Bane the warlock's Curse laid. `ongoingOwner` answers whose an effect is, in
 * that one reading, so 04's Unstable Affliction (*A target that ends one of your
 * ongoing effects early takes Fel damage*) and Everlasting Affliction at rank 2
 * (*Dispel and similar effects end one of them only on a Casting Test that meets
 * or exceeds SL 2*) find the warlock off the effect itself.
 */

import { AZEROTH } from "../config.mjs";
import { sustainTransferPending } from "./sustain-transfer-suspension.mjs";

/** 02's Dispel as the book prints it: one target, within 30 feet. */
export const DISPEL = Object.freeze({ feature: "Dispel", feet: 30, targets: 1 });

/** The flag a laid effect carries where a talent says Dispel cannot end it: `{by}`. */
export const UNDISPELLABLE_FLAG = "undispellable";

/** The laid Ward's own flag (`effects/wards.mjs`), read for Aegis Eternal's mark. */
const WARD_FLAG = "priestWard";

/** Why an effect is greyed, each with the key its words are under. */
export const DISPEL_REFUSALS = Object.freeze({
  transfer: "AZEROTH.Dispel.Refuse.Transfer",
  iceBlock: "AZEROTH.IceBlock.Protected",
  condition: "AZEROTH.Dispel.Refuse.Condition",
  status: "AZEROTH.Dispel.Refuse.Status",
  aura: "AZEROTH.Dispel.Refuse.Aura",
  talent: "AZEROTH.Dispel.Refuse.Talent",
  bond: "AZEROTH.Dispel.Refuse.Bond",
  injury: "AZEROTH.Dispel.Refuse.Injury",
  marked: "AZEROTH.Dispel.Refuse.Marked",
  archmage: "AZEROTH.Dispel.Refuse.Archmage"
});

/** The `azeroth-rpg` flags an effect carries, plain. */
function flagsOf(effect) {
  const f = effect?.flags?.["azeroth-rpg"];
  return f && typeof f === "object" ? f : {};
}

/** An effect's statuses as a list, whether a Set or an array arrived. */
function statusesOf(effect) {
  const s = effect?.statuses;
  if (!s) return [];
  return [...s].map(String);
}

/**
 * **THE SUSTAINED CAST AN EFFECT BELONGS TO** (O-308): `{cast, by}` where the effect wears the
 * sustained carrier's mark (`sustained`, `cast`) and names its caster as the origin - else null.
 * Whether the caster still holds the cast is the door's to read.
 *
 * @param {{origin?: string|null, flags?: object}|null} effect
 * @returns {{cast: string, by: string}|null}
 */
export function sustainOf(effect) {
  const f = flagsOf(effect);
  if (f.sustained !== true || typeof f.cast !== "string" || !f.cast) return null;
  const by = typeof effect?.origin === "string" && effect.origin ? effect.origin : null;
  return by ? { cast: f.cast, by } : null;
}

/**
 * **WHOSE ONGOING EFFECT THIS IS** (04's *your ongoing effects*, D-775's reading in
 * `swappableEffects`): the uuid of the hand that laid a tick, the origin of a laid
 * spell, the origin of a Bane a Curse laid - or null.
 *
 * @param {{origin?: string|null, flags?: object}} effect
 * @returns {string|null}
 */
export function ongoingOwner(effect) {
  const f = flagsOf(effect);
  if (typeof f.tick?.source === "string" && f.tick.source) return f.tick.source;
  if (f.spell && typeof effect?.origin === "string" && effect.origin) return effect.origin;
  if (f.laidBane && f.laidBane.source === "Curse" && typeof effect?.origin === "string" && effect.origin) return effect.origin;
  return null;
}

/**
 * **WHOSE SPELL LAID THIS EFFECT** (07's Archmage: *your spells can be ended only
 * by you*): a laid spell's origin, or the hand of a tick a spell's card stamped -
 * never a talent's state or a Bane, which are no spell's.
 *
 * @param {{origin?: string|null, flags?: object}} effect
 * @returns {string|null}
 */
export function spellCasterOf(effect) {
  const f = flagsOf(effect);
  if (f.spell && typeof effect?.origin === "string" && effect.origin) return effect.origin;
  if (f.tick?.castUuid && typeof f.tick.source === "string" && f.tick.source) return f.tick.source;
  return null;
}

/**
 * **WHETHER DISPEL MAY END THIS EFFECT**, and why not where it may not.
 *
 * @param {{id?: string, name?: string, statuses?: Iterable<string>, origin?: string|null, flags?: object, disabled?: boolean}} effect
 *   plain: an Active Effect's id, name, statuses, origin, flags and whether it is switched off
 * **AN EFFECT OF A HELD SUSTAINED CAST** (O-308) is judged as the cast: where `held` names its
 * cast, a condition on it does not grey it, and the verdict carries `sustain {cast, by}` - the
 * door ends the Sustain, never the effect alone. Archmage and a talent's mark still refuse it.
 *
 * @param {{archmage?: Iterable<string>, held?: Iterable<string>}} [o]  the uuids of casters a laid
 *   Archmage stands on; the casts their casters still hold
 * @returns {{ok: boolean, reason: string|null, by: string|null, conditions: string[], sustain?: {cast: string, by: string}}}
 */
export function dispelJudgement(effect, { archmage = [], held = [] } = {}) {
  const f = flagsOf(effect);
  const statuses = statusesOf(effect);
  const refuse = (reason, extra = {}) => ({ ok: false, reason, by: null, conditions: [], ...extra });
  if (sustainTransferPending(effect)) return refuse("transfer");
  const sustain = sustainOf(effect);
  const heldCasts = held instanceof Set ? held : new Set(held ?? []);
  const archmageOn = archmage instanceof Set ? archmage : new Set(archmage ?? []);
  if (sustain && heldCasts.has(sustain.cast)) {
    if (archmageOn.has(sustain.by)) return refuse("archmage");
    const mark = f[UNDISPELLABLE_FLAG];
    if (mark && typeof mark === "object") return refuse("marked", { by: typeof mark.by === "string" ? mark.by : null });
    return { ok: true, reason: null, by: null, conditions: [], sustain };
  }
  const conditions = statuses.filter(s => AZEROTH.conditions?.[s]);
  if (conditions.length) return refuse("condition", { conditions: [...conditions].sort() });
  if (statuses.length && !Object.keys(f).length) return refuse("status");
  if (f.aura) return refuse("aura");
  if (f.talentEffect) return refuse("talent");
  if (f.bond?.talent) return refuse("bond");
  if (f.injury) return refuse("injury");
  const marked = f[UNDISPELLABLE_FLAG];
  if (marked && typeof marked === "object") return refuse("marked", { by: typeof marked.by === "string" ? marked.by : null });
  const ward = f[WARD_FLAG];
  if (ward && typeof ward === "object" && ward.undispellable === true) {
    return refuse("marked", { by: typeof ward.undispellableBy === "string" && ward.undispellableBy ? ward.undispellableBy : null });
  }
  const caster = spellCasterOf(effect);
  if (caster && archmageOn.has(caster)) return refuse("archmage");
  return { ok: true, reason: null, by: null, conditions: [] };
}

/**
 * **A HELD SUSTAIN REACHED WITH NOTHING OF IT ON THE CREATURE** (O-312; the lead, 2026-11-11:
 * *"312 - yes it can"*). D-899 lists a Sustained cast where an effect it laid stands on the
 * creature aimed at. An area Sustain whose start-of-turn Test lays an unmarked condition
 * (Sandstorm, Shifting Hours, The Deep, Thornguard) leaves nothing of the cast on anybody, so
 * the lead's ruling reaches it three ways, each ending the same cast once through the one end
 * door:
 *
 * - **aimed at the CASTER** - every Sustain the creature aimed at holds (`by`, its uuid);
 * - **aimed at a CREATURE standing in the area** - every held AREA whose Region contains it
 *   (`inside`, asked of the token document by the door);
 * - **aimed at the AREA itself** - every held area whose Region contains the point picked
 *   (`inside`, with no `by`).
 *
 * `held` is every Sustain the door could reach, keyed by cast: `{spell, caster, by, area,
 * marked?, transfer?}`. An entry that is not an area is reached only through its caster.
 *
 * @param {Record<string, {by?: string, area?: boolean}>} held
 * @param {{by?: string|null, inside?: Iterable<string>}} [aim]
 * @returns {string[]}  the casts reached, sorted
 */
export function castsReached(held = {}, { by = null, inside = [] } = {}) {
  const within = new Set(inside ?? []);
  return Object.keys(held ?? {}).filter(cast => {
    const row = held[cast];
    if (!row || typeof row !== "object") return false;
    if (by && row.by === by) return true;
    return row.area === true && within.has(cast);
  }).sort((a, b) => a.localeCompare(b));
}

/**
 * **WHETHER A REACHED HELD CAST MAY BE ENDED** (O-312), by the same refusals D-899's held cast
 * keeps: an unfinished Spellsteal transfer, a caster under 07's Archmage (*no creature may end a
 * Sustained spell of yours by any means*), and a talent's mark (`undispellable`, read off the
 * cast's card). No Test: 02's Dispel names none for a Sustained spell, and D-899 ends a held
 * creature's Sustain with none, so one rule covers both (MY READING, for the lead: O-313).
 *
 * @param {{by?: string, marked?: {by?: string}|null, transfer?: boolean}} row
 * @param {{archmage?: Iterable<string>}} [o]
 * @returns {{ok: boolean, reason: string|null, by: string|null}}
 */
export function judgeHeldCast(row, { archmage = [] } = {}) {
  const archmageOn = archmage instanceof Set ? archmage : new Set(archmage ?? []);
  if (row?.transfer === true) return { ok: false, reason: "transfer", by: null };
  if (row?.by && archmageOn.has(row.by)) return { ok: false, reason: "archmage", by: null };
  const mark = row?.marked;
  if (mark && typeof mark === "object") return { ok: false, reason: "marked", by: typeof mark.by === "string" ? mark.by : null };
  return { ok: true, reason: null, by: null };
}

/** The chooser's key for a reached held cast: no effect id, so it can never be deleted as one. */
export const HELD_CAST_KEY = "sustain-";

/** A reached cast's chooser key. */
export function heldCastKey(cast) {
  return `${HELD_CAST_KEY}${cast}`;
}

/**
 * **WHAT A HELD-CAST QUERY MAY CARRY** (O-312): the casts, as strings of the shape a cast id
 * takes, once each, sorted - a chooser key is read back to its cast.
 *
 * @param {unknown} casts
 * @returns {string[]}
 */
export function cleanCastIds(casts) {
  if (!Array.isArray(casts)) return [];
  const out = new Set();
  for (const c of casts) {
    if (typeof c !== "string") continue;
    const cast = c.startsWith(HELD_CAST_KEY) ? c.slice(HELD_CAST_KEY.length) : c;
    if (/^[A-Za-z0-9]{1,64}$/.test(cast)) out.add(cast);
  }
  return [...out].sort();
}

/**
 * **A POINT A DISPEL WAS AIMED AT** (O-312, the area itself): `{sceneId, x, y}` with finite
 * canvas pixels and an id of the scene's shape, or null.
 *
 * @param {unknown} at
 * @returns {{sceneId: string, x: number, y: number}|null}
 */
export function cleanAimPoint(at) {
  if (!at || typeof at !== "object") return null;
  const x = Number(at.x);
  const y = Number(at.y);
  const sceneId = typeof at.sceneId === "string" && /^[A-Za-z0-9]{1,64}$/.test(at.sceneId) ? at.sceneId : null;
  return sceneId && Number.isFinite(x) && Number.isFinite(y) ? { sceneId, x, y } : null;
}

/**
 * **THE CHOOSER'S ROWS FOR ONE CREATURE**: every effect standing on it, the ones
 * Dispel may end and the ones it greys, sorted by name and then id so two renders
 * of one creature list it the same way (CLAUDE.md §15: an embedded collection's
 * order is not stable). A switched-off effect is not listed.
 *
 * **A HELD SUSTAINED CAST IS ONE ROW** (O-308): every effect of one cast the caster still holds
 * (`sustains`, keyed by cast) folds into a single row named for the spell, carrying `sustain
 * {cast, by, spell, caster, held}` - who casts it and the creatures it stands on - and keyed by
 * the lowest id among them; it is greyed where any of them is refused (Archmage, a mark).
 *
 * **AND EVERY HELD SUSTAIN REACHED WITH NOTHING OF IT ON THE CREATURE** (O-312): `reached`,
 * keyed by cast as `castsReached` answers it, each a row of its own keyed `sustain-<cast>`
 * (`heldCastKey`) and judged by `judgeHeldCast`; a cast already folded from an effect on the
 * creature is listed once, as that row.
 *
 * @param {Array<object>} effects  plain, as `dispelJudgement` takes them
 * @param {{archmage?: Iterable<string>, sustains?: Record<string, {spell?: string, caster?: string, held?: string[]}>, reached?: Record<string, {spell?: string, caster?: string, held?: string[], by?: string, area?: boolean, marked?: object|null, transfer?: boolean}>}} [o]
 * @returns {Array<{id: string, name: string, available: boolean, reason: string|null, by: string|null, conditions: string[], sustain?: object}>}
 */
export function dispelOptions(effects = [], { archmage = [], sustains = {}, reached = {} } = {}) {
  const out = [];
  const held = new Set(Object.keys(sustains ?? {}));
  const casts = new Map();
  for (const e of effects ?? []) {
    if (!e?.id || e.disabled === true) continue;
    const judged = dispelJudgement(e, { archmage, held });
    const sustain = sustainOf(e);
    if (sustain && held.has(sustain.cast)) {
      casts.set(sustain.cast, [...(casts.get(sustain.cast) ?? []), { e, judged, sustain }]);
      continue;
    }
    out.push({ id: String(e.id), name: String(e.name ?? ""), available: judged.ok, reason: judged.reason, by: judged.by, conditions: judged.conditions });
  }
  for (const [cast, members] of casts) {
    const sorted = [...members].sort((a, b) => String(a.e.id).localeCompare(String(b.e.id)));
    const first = sorted[0];
    const refused = sorted.find(m => !m.judged.ok) ?? null;
    const info = sustains?.[cast] ?? {};
    const spell = String(info.spell || first.e.name || "");
    out.push({
      id: String(first.e.id), name: spell, available: !refused, reason: refused?.judged.reason ?? null, by: refused?.judged.by ?? null, conditions: [],
      sustain: { cast, by: first.sustain.by, spell, caster: String(info.caster ?? ""), held: [...(info.held ?? [])].map(String).sort((a, b) => a.localeCompare(b)) }
    });
  }
  for (const cast of Object.keys(reached ?? {}).sort((a, b) => a.localeCompare(b))) {
    const info = reached[cast];
    if (!info || typeof info !== "object" || casts.has(cast)) continue;
    const judged = judgeHeldCast(info, { archmage });
    const spell = String(info.spell ?? "");
    out.push({
      id: heldCastKey(cast), name: spell, available: judged.ok, reason: judged.reason, by: judged.by, conditions: [],
      sustain: {
        cast, by: String(info.by ?? ""), spell, caster: String(info.caster ?? ""), area: info.area === true, reached: true,
        held: [...(info.held ?? [])].map(String).sort((a, b) => a.localeCompare(b))
      }
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * Why a Dispel's targets are refused before anything is paid: none named, or more
 * than one - two where Rapture has a use left (*may end one condition on an
 * additional target*).
 *
 * @param {{named?: number, further?: number}} o  `further` how many more Rapture allows now
 * @returns {string|null}  an i18n key
 */
export function dispelTargetRefusal({ named = 0, further = 0 } = {}) {
  const n = Math.max(0, Math.trunc(Number(named)) || 0);
  if (n < 1) return "AZEROTH.Dispel.NoTarget";
  return n > DISPEL.targets + Math.max(0, Math.trunc(Number(further)) || 0) ? "AZEROTH.Dispel.TooMany" : null;
}

/**
 * **WHICH SELECTED EFFECTS WAIT ON A CASTING TEST** (04's Everlasting Affliction at
 * rank 2: *Dispel and similar effects end one of them only on a Casting Test that
 * meets or exceeds SL 2*): each effect whose ongoing owner holds the talent at
 * that rank. One Test an effect (MY READING, for the lead: *one of them* is each
 * one ended). Never a Sustained cast's effect (O-308; 07 §7).
 *
 * @param {Array<object>} effects  plain, the ones the user selected
 * @param {Record<string, {sl: number, name: string}|null>} gates  the gate each owner's talents set, by uuid
 * @returns {Array<{id: string, sl: number, by: string, owner: string}>}
 */
export function dispelGated(effects = [], gates = {}) {
  const out = [];
  for (const e of effects ?? []) {
    // A Sustained cast's effect is not an ongoing effect (07 §7: *Talents that speak of your
    // ongoing effects mean what an Instant spell left behind*), so no gate holds it (O-308).
    if (sustainOf(e)) continue;
    const owner = ongoingOwner(e);
    const gate = owner ? gates?.[owner] ?? null : null;
    if (!gate || !(Number(gate.sl) > 0)) continue;
    out.push({ id: String(e.id), sl: Math.trunc(Number(gate.sl)), by: String(gate.name ?? ""), owner });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Whether a gated effect's Casting Test ended it: a SUCCESS at the gate's SL or
 * better - success off the margin (CLAUDE.md §7), the SL off the roll.
 *
 * @param {{success?: boolean, sl?: number}} outcome
 * @param {number} sl  the gate's
 */
export function gatePassed(outcome = {}, sl = 2) {
  return outcome?.success === true && (Math.trunc(Number(outcome?.sl)) || 0) >= Math.trunc(Number(sl));
}

/**
 * **WHAT A DISPEL QUERY MAY CARRY**: the effect ids, as strings, once each, and
 * nothing else a caller slipped in beside them.
 *
 * @param {unknown} ids
 * @returns {string[]}
 */
export function cleanEffectIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter(id => typeof id === "string" && /^[A-Za-z0-9]{1,64}$/.test(id)))].sort();
}
