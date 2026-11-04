/**
 * **A BARE POISONED OR DISEASED IS TRACKED** (D12 R1; the lead: *"the poisoned and diseased
 * conditions should be tracked and able to be cured and automated with the clock."*). Pure.
 *
 * A Poisoned or Diseased Active Effect with no `flags.azeroth-rpg.affliction` has no clock, no
 * cure and no row on the Afflictions panel. `effects/bare-afflictions.mjs` meets every one at
 * the document layer; what it does with each is decided here:
 *
 *  + a bare POISONED from a code door is WRAPPED in place as a carrier named for its source,
 *    at its own value and its own shed DC;
 *  + a bare DISEASED names no disease, so it is never wrapped: a hand action opens the picker
 *    (the lead: *"Name one"*), and a code door must name its disease through `afflictDisease`;
 *  + a CARRIER's chip never deletes the carrier: clearing Poisoned sheds the stacks (the poison
 *    lays them again at its next beat), and clearing Diseased is refused in words.
 */

import { AFFLICTION_FLAG, carrierPoisonedValue, carrierStatuses, shedPatch } from "./afflictions.mjs";
import { OLD_DISEASES, OLD_POISON_FLAGS } from "./affliction-migration.mjs";
import { SHED_DC_FLAG } from "./escapes.mjs";

/** The two statuses this module watches, and the kind of carrier each becomes. */
export const BARE_STATUSES = Object.freeze({ poisoned: "poison", diseased: "disease" });

/** Poisoned stops at four (A1). */
export const POISONED_CAP = 4;

const isObject = v => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** The flags that mean a bespoke state already owns the effect (it gains the carrier flag itself). */
const OWNED_FLAGS = Object.freeze([...OLD_POISON_FLAGS, ...Object.keys(OLD_DISEASES), "injury"]);

/**
 * Which kind a bare effect would be: `"poison"`, `"disease"` or null (nothing to track, or
 * already tracked / owned by a bespoke state).
 *
 * @param {Iterable<string>} statuses
 * @param {object} flags  the effect's `azeroth-rpg` flags
 */
export function bareKind(statuses = [], flags = {}) {
  if (isObject(flags?.[AFFLICTION_FLAG])) return null;
  if (OWNED_FLAGS.some(k => isObject(flags?.[k]))) return null;
  const set = new Set(statuses ?? []);
  if (set.has("diseased")) return "disease";
  if (set.has("poisoned")) return "poison";
  return null;
}

/** Whether an update newly puts a watched status on an effect that did not hold it. */
export function addsBareStatus(held = [], next = null) {
  if (!next) return null;
  const had = new Set(held ?? []);
  const adds = [...new Set(next)].filter(s => BARE_STATUSES[s] && !had.has(s));
  if (adds.includes("diseased")) return "disease";
  return adds.includes("poisoned") ? "poison" : null;
}

/**
 * What a wrapped poison is named: the effect's own name unless it is just the condition's
 * label, else the source's name, else the fallback ("Poison").
 */
export function wrappedName({ effectName = "", conditionLabels = [], originName = "", fallback = "Poison" } = {}) {
  const labels = new Set((conditionLabels ?? []).map(s => String(s).trim().toLowerCase()).filter(Boolean));
  const own = String(effectName ?? "").trim();
  if (own && !labels.has(own.toLowerCase())) return own;
  const origin = String(originName ?? "").trim();
  return origin || fallback;
}

/** `{name, value, dc}` for the carrier a bare Poisoned becomes. */
export function wrapPoison({ effectName, conditionLabels, originName, fallback, flags = {}, sourceDc = null } = {}) {
  const value = Math.min(POISONED_CAP, Math.max(1, Math.trunc(Number(flags?.value)) || 1));
  const held = Number(flags?.[SHED_DC_FLAG]?.dc);
  const dcOf = n => (Number.isFinite(n) && n > 0 ? Math.trunc(n) : null);
  return {
    name: wrappedName({ effectName, conditionLabels, originName, fallback }),
    value,
    dc: dcOf(held) ?? dcOf(Number(sourceDc))
  };
}

/** The update that strips the clock a timed bare effect carried (`start` is nullable, `start.time` is not). */
export const UNTIMED = Object.freeze({ start: null, "duration.value": null, "duration.expiry": null });

/** Statuses a wrapped effect keeps: what it had, with the carrier's own. */
export function wrappedStatuses(held = [], aff) {
  return [...new Set([...(held ?? []), ...carrierStatuses(aff)])];
}

/**
 * Clearing a CARRIER's chip. `aff` is the carrier; `kind` the chip's status.
 * Poisoned sheds every stack (the carrier stays); Diseased is refused.
 * @returns {{op: "shed", patch: object}|{op: "refuse", reason: string}|null}
 */
export function clearCarrierChip(aff, status) {
  if (status === "diseased") return { op: "refuse", reason: "AZEROTH.Afflictions.Bare.DiseasedClear" };
  if (status === "poisoned" && aff?.kind === "poison") return { op: "shed", patch: shedPatch(aff, 0) };
  return null;
}

/**
 * Stepping a carrier's Poisoned: the new value (never below 0, never above four). 0 sheds
 * the stacks and leaves the carrier; a rise lays the status again.
 * @returns {{value: number, patch: object}}
 */
export function stepCarrierPoison(aff, current, delta, max = POISONED_CAP) {
  const value = Math.min(max, Math.max(0, (Math.trunc(Number(current)) || 0) + (Math.trunc(Number(delta)) || 0)));
  if (value === 0) return { value, patch: shedPatch(aff, 0) };
  return {
    value,
    patch: { statuses: carrierStatuses({ ...aff, repeat: { ...aff.repeat, statuses: [...new Set([...(aff.repeat?.statuses ?? []), "poisoned"])] } }), "flags.azeroth-rpg.value": value }
  };
}

/**
 * Whether a carrier owns this chip: a poison whose repeat lays the status (shed to 0 it still
 * owns Poisoned, the next beat lays it again), or a disease standing in `diseased`.
 */
export function carrierOwnsChip(aff, status, { statusOn = false } = {}) {
  if (!aff?.kind) return false;
  if (aff.kind === "poison") return (aff.repeat?.statuses ?? []).includes(status);
  return aff.kind === "disease" && status === "diseased" && statusOn === true;
}

/**
 * **A RAISE IS THE NEW DOSE; A LOWER IS A SHED** (D12 R1). The beat lays a carrier's
 * Poisoned back to its dose, so a write that raised the value above the dose (a code
 * door's "Poisoned 2", laid at 1 and then set) was undone at the next beat. The Core
 * stepper's + is STACKS only and passes `azerothStacks`, so the effect hook skips it. Answers the dose the write raises the carrier to, or null where it raises
 * nothing: not a poison holding Poisoned, not a number, or not above the dose.
 * @param {object} aff  the carrier's affliction flag
 * @param {*} value     the `flags.azeroth-rpg.value` the write names
 * @returns {number|null}
 */
export function raisedDose(aff, value) {
  const dose = carrierPoisonedValue(aff);
  if (!dose) return null;
  const n = Math.min(POISONED_CAP, Math.trunc(Number(value)));
  return Number.isFinite(n) && n > dose ? n : null;
}
