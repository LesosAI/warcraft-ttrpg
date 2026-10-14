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

/** 02's Dispel as the book prints it: one target, within 30 feet. */
export const DISPEL = Object.freeze({ feature: "Dispel", feet: 30, targets: 1 });

/** The flag a laid effect carries where a talent says Dispel cannot end it: `{by}`. */
export const UNDISPELLABLE_FLAG = "undispellable";

/** The laid Ward's own flag (`effects/wards.mjs`), read for Aegis Eternal's mark. */
const WARD_FLAG = "priestWard";

/** Why an effect is greyed, each with the key its words are under. */
export const DISPEL_REFUSALS = Object.freeze({
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
 * @param {{archmage?: Iterable<string>}} [o]  the uuids of casters a laid Archmage stands on
 * @returns {{ok: boolean, reason: string|null, by: string|null, conditions: string[]}}
 */
export function dispelJudgement(effect, { archmage = [] } = {}) {
  const f = flagsOf(effect);
  const statuses = statusesOf(effect);
  const refuse = (reason, extra = {}) => ({ ok: false, reason, by: null, conditions: [], ...extra });
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
  const held = archmage instanceof Set ? archmage : new Set(archmage ?? []);
  const caster = spellCasterOf(effect);
  if (caster && held.has(caster)) return refuse("archmage");
  return { ok: true, reason: null, by: null, conditions: [] };
}

/**
 * **THE CHOOSER'S ROWS FOR ONE CREATURE**: every effect standing on it, the ones
 * Dispel may end and the ones it greys, sorted by name and then id so two renders
 * of one creature list it the same way (CLAUDE.md §15: an embedded collection's
 * order is not stable). A switched-off effect is not listed.
 *
 * @param {Array<object>} effects  plain, as `dispelJudgement` takes them
 * @param {{archmage?: Iterable<string>}} [o]
 * @returns {Array<{id: string, name: string, available: boolean, reason: string|null, by: string|null, conditions: string[]}>}
 */
export function dispelOptions(effects = [], { archmage = [] } = {}) {
  const out = [];
  for (const e of effects ?? []) {
    if (!e?.id || e.disabled === true) continue;
    const judged = dispelJudgement(e, { archmage });
    out.push({ id: String(e.id), name: String(e.name ?? ""), available: judged.ok, reason: judged.reason, by: judged.by, conditions: judged.conditions });
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
 * one ended).
 *
 * @param {Array<object>} effects  plain, the ones the user selected
 * @param {Record<string, {sl: number, name: string}|null>} gates  the gate each owner's talents set, by uuid
 * @returns {Array<{id: string, sl: number, by: string, owner: string}>}
 */
export function dispelGated(effects = [], gates = {}) {
  const out = [];
  for (const e of effects ?? []) {
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
