/**
 * **A CARRIER IS NOT THE CONDITION IT HOLDS** (D-997, the final Death Knight review's finding 1).
 *
 * Some effects hold a status as a side effect of something else they are: a TICK carrier
 * (`flags.azeroth-rpg.tick`, `effects/ticks.mjs`) and an AFFLICTION carrier
 * (`flags.azeroth-rpg.affliction`, `rules/afflictions.mjs`). 02 §7's Frost Fever is a tick
 * carrier holding Slowed *while the disease lasts*, so its span is the disease's ten rounds and
 * it carries the tick, the halved Speed and the disease's own records.
 *
 * The condition door (`effects/durations.mjs#applyCondition`) used to find "the effect holding
 * Slowed" and write a new span onto it. On a creature with Frost Fever that effect was the
 * carrier: Frozen Desecration's *until the end of its turn* ended the disease after one tick,
 * and Chains of Ice wrote its Disengage bar and its break-free Test onto the disease. The rule
 * here is the one reading of which effect IS the condition:
 *
 * - `isConditionCarrier(effect, id)`: the effect holds `id` as a carrier. **An affliction OWNS
 *   its own chip** (D12 R1, `rules/bare-afflictions.mjs#BARE_STATUSES`): a poison carrier's
 *   Poisoned and a disease carrier's Diseased ARE the condition - a code door's Poisoned 2 is
 *   that poison's dose - so for those the carrier is not a carrier. Every other status an
 *   affliction or a tick holds (a poison's Stunned, Frost Fever's Slowed) is a carrier's.
 * - `conditionEffectOf(effects, id)`: the first effect holding the status that is NOT a carrier
 *   of it, or null. A door that writes a span, a value or a mark onto "the condition" reads this
 *   one; where it is null and a carrier holds the status, the door lays the condition's own
 *   effect beside the carrier.
 * - `carrierChangesApplied(effect, held, conditionChanges)`: what a carrier's changes are once a
 *   condition's own effect stands beside it. The condition's change (Slowed's halved Speed)
 *   applies ONCE: the carrier's copy of it is left out of the application pass while the
 *   condition's own effect holds the status, and comes back when that effect ends.
 *
 * Pure: no Foundry import.
 */

/** The flags (under `azeroth-rpg`) that make an effect a carrier rather than a condition. */
export const CARRIER_FLAGS = Object.freeze(["tick", "affliction"]);

/**
 * The chip an affliction owns, by its kind: `rules/bare-afflictions.mjs#BARE_STATUSES` read the
 * other way (a Vitest holds the two together).
 */
export const OWN_CHIP = Object.freeze({ poison: "poisoned", disease: "diseased" });

const SCOPE = "azeroth-rpg";
const isObject = v => Boolean(v) && typeof v === "object";

/**
 * Whether an effect holds its statuses - or, given one, that status - as a side effect of a
 * tick or an affliction. An affliction's own chip (`OWN_CHIP`) is the condition, not a carrier's.
 *
 * @param {object} effect
 * @param {string|null} [id]  the status asked about
 */
export function isConditionCarrier(effect, id = null) {
  const flags = effect?.flags?.[SCOPE] ?? null;
  if (!isObject(flags)) return false;
  const aff = isObject(flags.affliction) ? flags.affliction : null;
  if (id && aff && OWN_CHIP[aff.kind] === id) return false;
  return CARRIER_FLAGS.some(key => isObject(flags[key]));
}

/** Whether an effect holds the status (a Set or an array, as a document or a plain row carries it). */
export function holdsStatus(effect, id) {
  const statuses = effect?.statuses;
  if (!statuses || !id) return false;
  if (typeof statuses.has === "function") return statuses.has(id);
  return Array.isArray(statuses) && statuses.includes(id);
}

/**
 * The effect that IS the condition: the first effect (in the collection's order, as the door
 * always read it) holding the status that is not a carrier of it, or null.
 *
 * @param {Iterable<object>} effects
 * @param {string} id  the status
 */
export function conditionEffectOf(effects, id) {
  for (const e of effects ?? []) {
    if (holdsStatus(e, id) && !isConditionCarrier(e, id)) return e;
  }
  return null;
}

/** The carriers holding the status, in the collection's order. */
export function carriersHolding(effects, id) {
  const out = [];
  for (const e of effects ?? []) if (holdsStatus(e, id) && isConditionCarrier(e, id)) out.push(e);
  return out;
}

/**
 * The statuses held by an effect that applies now and is not a carrier of them: the set
 * `carrierChangesApplied` reads. `active` is the document's own getter where it has one.
 *
 * @param {Iterable<object>} effects
 * @returns {Set<string>}
 */
export function conditionStatusesHeld(effects) {
  const held = new Set();
  for (const e of effects ?? []) {
    if (e?.disabled === true || e?.active === false) continue;
    for (const id of e?.statuses ?? []) if (!isConditionCarrier(e, id)) held.add(id);
  }
  return held;
}

/** Two changes are the same change when key, type, phase and value agree. */
function sameChange(a, b) {
  if (!a || !b) return false;
  if (String(a.key ?? "") !== String(b.key ?? "")) return false;
  if (String(a.type ?? "") !== String(b.type ?? "")) return false;
  if (String(a.phase ?? "initial") !== String(b.phase ?? "initial")) return false;
  const na = Number(a.value), nb = Number(b.value);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a.value ?? "") === String(b.value ?? "");
}

/**
 * A carrier's changes for the application pass: unchanged, unless a condition's own effect
 * holds one of the statuses the carrier carries, in which case the copy of that condition's
 * change the carrier holds is left out (the condition's own effect applies it). Answers the SAME
 * array where nothing is left out, so a caller can tell by identity.
 *
 * @param {{flags?: object, statuses?: Iterable<string>, system?: {changes?: object[]}}} effect
 * @param {Set<string>} held  `conditionStatusesHeld`'s answer
 * @param {Record<string, object[]>|((id: string) => object[])} conditionChanges  a status's own changes
 * @returns {object[]}
 */
export function carrierChangesApplied(effect, held, conditionChanges) {
  const changes = effect?.system?.changes ?? [];
  if (!isConditionCarrier(effect) || !held?.size || !changes.length) return changes;
  const ofStatus = typeof conditionChanges === "function" ? conditionChanges : id => conditionChanges?.[id] ?? [];
  const drop = [];
  for (const id of effect.statuses ?? []) {
    if (!held.has(id) || !isConditionCarrier(effect, id)) continue;
    for (const c of ofStatus(id) ?? []) drop.push(c);
  }
  if (!drop.length) return changes;
  const kept = changes.filter(c => !drop.some(d => sameChange(c, d)));
  return kept.length === changes.length ? changes : kept;
}

/**
 * Which effects a status toggled OFF deletes (`AzerothActor#toggleStatusEffect`): core deletes
 * every single-status effect holding it (14.367 `Actor#toggleStatusEffect`, statuses with no
 * static `_id`), which would delete a carrier holding the status and end the disease with it.
 * The condition's own single-status effects only; the carriers are left standing. An
 * affliction holding its own chip is the condition, so it is removed as core always removed it.
 *
 * @param {Iterable<object>} effects
 * @param {string} id
 * @returns {{remove: object[], carriers: object[]}}
 */
export function toggleOffTargets(effects, id) {
  const remove = [];
  const carriers = [];
  for (const e of effects ?? []) {
    if (!holdsStatus(e, id)) continue;
    if (isConditionCarrier(e, id)) carriers.push(e);
    else if ((e.statuses?.size ?? e.statuses?.length ?? 0) === 1) remove.push(e);
  }
  return { remove, carriers };
}
