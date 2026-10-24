/**
 * **ONE READING OF A ROW'S GATE** (the Legacy branches' doors 15, 17 and 18).
 * Pure: no Foundry imports (CLAUDE.md §3).
 *
 * A talent row's `when` said one thing until now: the NAME of a fact the door
 * measured (`damagedTarget`, `engagedOne`, `hidden`, `critical`), read as
 * `facts[when] === true`. The seven Legacy branches gate on three more families,
 * and each is read here and nowhere else, so a `damage`, a `momentum`, a
 * `targetBoon`, a `critical`, a `passive`, a `pierce` and a rider's discount can
 * never disagree about what *a target that is Prone* means:
 *
 * - **What the target is or carries** (door 17): `targetHas` - the target
 *   suffers ANY of these A1 conditions (04's Hammer and Anvil: *a target that is
 *   Prone, Slowed or Stunned*; Run to Ground; Dread's *a Frightened creature*);
 *   `targetKind` - D-753's creature kinds (`creature-kinds.mjs`; Laid to Rest's
 *   *an undead creature. A Forsaken counts as undead*); `laidByUser` - a
 *   condition the user, or one of the user's totems, laid (Cursed Prey; None
 *   Escape's *that you have Entangled*), `true` for any or a list of conditions.
 * - **Whom the user has marked** (door 18): `watched` (The Long Watch) and
 *   `challenged` (The Challenge, Mak'gora).
 * - **What the user wields and wears** (door 15): `wields`, a list of
 *   `rules/wield.mjs#WIELD_FACTS` that must ALL hold - `twoHanded` (08 §7's
 *   Two-handed weapons alone), `noSuit` (nothing in the Chest tile; only a suit
 *   fills it), `twoTypes` (melee weapons of two different types, one in each
 *   hand), `hammerOrMace`.
 *
 * ## The grammar
 *
 *   gate := null                       always
 *         | <fact name>                `facts[name] === true` (the old reading)
 *         | [gate, ...]                every one holds
 *         | {targetHas?, targetKind?, laidByUser?, watched?, challenged?, wields?}
 *                                      every key present holds
 *
 * ## Three answers, never two
 *
 * `gateHolds` answers `true`, `false`, or **`null` where the door could not
 * tell** - no target was named, nothing about the hands was handed in. A door
 * then decides what nothing-known means for its own row: a dialog line is drawn
 * UNTICKED for the table (D2 §12), a gain after the die is not given. A fact
 * name keeps its old two answers, so every row before these reads exactly as it
 * did.
 */

/** What the user wields and wears, as a gate may name it (door 15). */
export const WIELD_FACTS = Object.freeze(["twoHanded", "noSuit", "twoTypes", "hammerOrMace"]);

/** The keys of a gate that read the TARGET (doors 17 and 18). */
export const TARGET_GATES = Object.freeze(["targetHas", "targetKind", "laidByUser", "watched", "challenged"]);

/** Every key an object gate may carry. */
export const GATE_KEYS = Object.freeze([...TARGET_GATES, "wields"]);

/** A gate's three answers folded the way `every` folds them: any false is false, else any unknown is unknown. */
function fold(answers = []) {
  if (answers.some(a => a === false)) return false;
  if (answers.some(a => a === null)) return null;
  return true;
}

/** A list off a value that may be one string or many. */
function listOf(value) {
  if (Array.isArray(value)) return value.filter(v => typeof v === "string" && v);
  return typeof value === "string" && value ? [value] : [];
}

/**
 * Whether a gate is one this module reads: null, a fact name, a list of gates, or
 * an object whose every key is a `GATE_KEYS` key with a value of its shape. A
 * descriptor's census asks it (`talent-effects.test.mjs`), so a row cannot carry a
 * gate nothing reads.
 *
 * @param {unknown} when
 * @param {{facts?: Iterable<string>|null}} [o]  the fact names a string may be;
 *   null takes any string
 * @returns {boolean}
 */
export function isGate(when, { facts = null } = {}) {
  if (when === null || when === undefined) return true;
  if (typeof when === "string") return facts ? new Set(facts).has(when) : when.length > 0;
  if (Array.isArray(when)) return when.length > 0 && when.every(w => isGate(w, { facts }));
  if (typeof when !== "object") return false;
  const keys = Object.keys(when);
  if (!keys.length || !keys.every(k => GATE_KEYS.includes(k))) return false;
  if ("targetHas" in when && !listOf(when.targetHas).length) return false;
  if ("targetKind" in when && !listOf(when.targetKind).length) return false;
  if ("laidByUser" in when && when.laidByUser !== true && !listOf(when.laidByUser).length) return false;
  if ("watched" in when && when.watched !== true) return false;
  if ("challenged" in when && when.challenged !== true) return false;
  if ("wields" in when) {
    const named = listOf(when.wields);
    if (!named.length || !named.every(f => WIELD_FACTS.includes(f))) return false;
  }
  return true;
}

/**
 * **WHETHER A GATE HOLDS**, from what the door measured.
 *
 * @param {unknown} when  a gate (see the grammar above)
 * @param {object} [facts]  the door's own named facts (`facts[name]`), and
 *   `facts.target` - `targetFactsOf`'s answer, or null where no target is named -
 *   and `facts.wield` - `rules/wield.mjs#wieldFacts`' answer, or null
 * @returns {boolean|null}  null where the door could not tell
 */
export function gateHolds(when, facts = {}) {
  if (when === null || when === undefined) return true;
  if (typeof when === "string") return facts?.[when] === true;
  if (Array.isArray(when)) return fold(when.map(w => gateHolds(w, facts)));
  if (typeof when !== "object") return false;
  const target = facts?.target ?? null;
  const wield = facts?.wield ?? null;
  const answers = [];
  if ("targetHas" in when) {
    const wanted = listOf(when.targetHas);
    answers.push(target ? wanted.some(id => (target.statuses ?? []).includes(id)) : null);
  }
  if ("targetKind" in when) {
    const wanted = listOf(when.targetKind);
    answers.push(target ? wanted.some(k => (target.kinds ?? []).includes(k)) : null);
  }
  if ("laidByUser" in when) {
    const laid = target ? (target.laidByUser ?? []) : null;
    if (laid === null) answers.push(null);
    else if (when.laidByUser === true) answers.push(laid.length > 0);
    else answers.push(listOf(when.laidByUser).some(id => laid.includes(id)));
  }
  if ("watched" in when) answers.push(target ? target.watched === true : null);
  if ("challenged" in when) answers.push(target ? target.challenged === true : null);
  if ("wields" in when) answers.push(wield ? listOf(when.wields).every(f => wield[f] === true) : null);
  return fold(answers);
}

/**
 * The wield facts a gate names anywhere in it (door 15): a dialog line whose
 * wield facts fail can never hold this roll, and is not drawn at all - D-711
 * phase 2's rule for a form row out of a form.
 *
 * @param {unknown} when
 * @returns {string[]}
 */
export function gateWields(when) {
  if (Array.isArray(when)) return [...new Set(when.flatMap(gateWields))].sort();
  if (when && typeof when === "object") return listOf(when.wields).filter(f => WIELD_FACTS.includes(f)).sort();
  return [];
}

/**
 * Whether the gate's wield half fails on what the door measured: a named wield
 * fact that is false. Unknown is not a failure.
 *
 * @param {unknown} when
 * @param {Record<string, boolean>|null} wield
 */
export function wieldFails(when, wield) {
  if (!wield) return false;
  return gateWields(when).some(f => wield[f] === false);
}

/**
 * **THE WORD A DIALOG LINE IS LABELLED WITH** for a gate: the fact name itself, or
 * the first target key an object carries, else `wields` - the suffix of an
 * `AZEROTH.Dialog.DamageWhen.<key>` line. `always` for no gate.
 *
 * @param {unknown} when
 * @returns {string}
 */
export function gateLabel(when) {
  if (when === null || when === undefined) return "always";
  if (typeof when === "string") return when;
  if (Array.isArray(when)) {
    const first = when.find(w => !(w && typeof w === "object" && !Array.isArray(w) && Object.keys(w).every(k => k === "wields")));
    return first === undefined ? "wields" : gateLabel(first);
  }
  if (typeof when === "object") return TARGET_GATES.find(k => k in when) ?? "wields";
  return "always";
}

/**
 * **WHO LAID A CONDITION, ON THE CONDITION'S OWN EFFECT** (door 17): the actor
 * uuids that laid it, `flags.azeroth-rpg.laidBy`. A1's condition is ONE effect
 * whoever lays it again, so a second layer is appended rather than replacing the
 * first; the effect goes with the condition, and the record with it.
 */
export const LAID_BY_FLAG = "laidBy";

/**
 * The `laidBy` a condition's effect carries once `uuid` lays it: what it held,
 * this one added, sorted, once each.
 *
 * @param {unknown} held  the effect's flag as it stands
 * @param {string|null} uuid
 * @returns {string[]}
 */
export function laidByWith(held, uuid) {
  const out = new Set((Array.isArray(held) ? held : []).filter(u => typeof u === "string" && u));
  if (typeof uuid === "string" && uuid) out.add(uuid);
  return [...out].sort();
}

/**
 * **THE `laidBy` ONCE A WITHDRAWN HIT'S LAYER COMES OFF** (door 13, the B1 review): a
 * condition the creature already had keeps its effect when the hit that laid it again
 * is turned into a miss, and the striker the landing ADDED to its `laidBy` goes - or
 * Cursed Prey, None Escape and every gate that reads *a condition that you laid* would
 * go on reading the withdrawn hit as the striker's. Sorted, once each.
 *
 * @param {unknown} held  the effect's flag as it stands
 * @param {string|null} uuid  the layer the landing added
 * @returns {string[]}
 */
export function laidByWithout(held, uuid) {
  return laidByWith(held, null).filter(u => u !== uuid);
}

/**
 * **A CREATURE'S CONDITIONS, BY WHO LAID THEM** (door 17), off its effects as plain
 * data - what `targetSnapshots` carries as `laidBy`, condition by condition. A
 * disabled effect lays nothing.
 *
 * @param {Array<{statuses?: Iterable<string>, flags?: object, disabled?: boolean}>} effects
 * @returns {Record<string, string[]>}
 */
export function laidByMap(effects = []) {
  const out = {};
  for (const e of effects ?? []) {
    if (!e || e.disabled === true) continue;
    const laid = e.flags?.["azeroth-rpg"]?.[LAID_BY_FLAG];
    if (!Array.isArray(laid) || !laid.length) continue;
    for (const id of e.statuses ?? []) out[id] = laidByWith([...(out[id] ?? []), ...laid], null);
  }
  return out;
}

/** Whether an entry names a target snapshot: by token where both carry one, else by actor. */
function names(entry, target) {
  if (!entry || !target) return false;
  if (entry.tokenId && target.tokenId) return entry.tokenId === target.tokenId;
  return Boolean(entry.actorId) && entry.actorId === target.actorId;
}

/**
 * **WHAT A GATE READS OFF ONE TARGET** (door 17), from a target snapshot as
 * `applications/roll-dialog.mjs#targetSnapshots` builds it: the conditions it
 * suffers, D-753's kinds it is, the conditions on it that the user or one of the
 * user's own creatures laid (the snapshot's `laidBy`, condition by condition), and
 * whether the user's marks name it (door 18's `marks`). Null for no target.
 *
 * @param {{statuses?: string[], kinds?: string[], laidBy?: Record<string, string[]>, tokenId?: string|null, actorId?: string|null}|null} snapshot
 * @param {{own?: string[], marks?: {watch?: object|null, challenge?: object|null}}} [o]
 *   `own` the uuids that count as the user's hand: the user's own, and every totem
 *   bound to it (Cursed Prey's *you or one of your totems*)
 * @returns {{statuses: string[], kinds: string[], laidByUser: string[], watched: boolean, challenged: boolean}|null}
 */
export function targetFactsOf(snapshot, { own = [], marks = {} } = {}) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const hands = new Set((own ?? []).filter(u => typeof u === "string" && u));
  const laidBy = snapshot.laidBy && typeof snapshot.laidBy === "object" ? snapshot.laidBy : {};
  const laidByUser = Object.entries(laidBy)
    .filter(([, uuids]) => (Array.isArray(uuids) ? uuids : []).some(u => hands.has(u)))
    .map(([id]) => id)
    .filter(id => (snapshot.statuses ?? []).includes(id))
    .sort();
  return {
    statuses: [...(snapshot.statuses ?? [])].map(String).sort(),
    kinds: [...(snapshot.kinds ?? [])].map(String).sort(),
    laidByUser,
    watched: names(marks?.watch ?? null, snapshot),
    challenged: names(marks?.challenge ?? null, snapshot)
  };
}
