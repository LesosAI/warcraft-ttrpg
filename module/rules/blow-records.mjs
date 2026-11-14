/**
 * **A BLOW'S RECORD, CARRIED ONTO ANOTHER DOOR** (O-362; run close-F2). Pure: no Foundry imports
 * (CLAUDE.md §3).
 *
 * 04's Icebound Fortitude halves a blow *before Armor Points and Ward apply* (the lead: *"before AP
 * or ward"*, D-979). The card's and the direct doors' blows carry the resolver's inputs
 * (`damage-record.mjs`); a blow MOVED or SHARED onto the knight carries the same record with the
 * step the move put it through, and Icebound re-resolves that chain with the halving first.
 *
 * Its own module, never `blow-doors.mjs`: the talent tables read `blow-doors.mjs#heldAt`, and the
 * Shrink Ray's reduction lives in `gadgets.mjs`, which reads the talent tables.
 */

import { resolveDamage } from "./mitigation.mjs";
import { resolveRecordedDamage } from "./damage-record.mjs";
import { shrinkDamage } from "./gadgets.mjs";
import { burdenMet, divideEvenly, movedAmount, movedParts, regrossInput } from "./blow-doors.mjs";

const whole = v => Math.max(0, Math.trunc(Number(v)) || 0);

/**
 * The steps a moved or shared blow's record may carry after the resolver (O-362; run close-F2).
 * `moved`: the blow lands on another creature, whose door takes no Ward credit for it
 * (`movedParts`); `minus`: a flat number off it (Shield of the Righteous's Ward 1 on a blow of
 * a school); `half`: half of it, rounded down (Blade Flurry's share, Echoing Sands); `burden`:
 * Shared Burden's share met by the holder's own Armor Points and Ward (`burdenMet`); `divide`:
 * one creature's share of a Spirit Link's division (`divideEvenly`).
 */
export const RECORD_STEPS = Object.freeze(["moved", "minus", "half", "burden", "divide"]);

/**
 * **A BLOW'S RECORD, CARRIED ONTO ANOTHER DOOR** (O-362; run close-F2): the resolver's inputs the
 * card or door recorded (`rules/damage-record.mjs`), with the steps the blow went through after
 * the resolver to become what arrives - so 04's Icebound Fortitude (*deals half its damage to
 * you, rounded down, before Armor Points and Ward apply*; the lead: *"before AP or ward"*) can
 * resolve the SAME blow halved before them. Null where there is no record to carry.
 *
 * @param {{version?: number, input: object, shrink?: number, then?: Array<object>}|null} record
 * @param {...object} steps  each one key of `RECORD_STEPS`
 * @returns {object|null}
 */
export function withSteps(record, ...steps) {
  const r = recordOf(record);
  if (!r) return null;
  const kept = steps.filter(s => s && typeof s === "object" && RECORD_STEPS.includes(Object.keys(s)[0]));
  return { ...r, then: [...(r.then ?? []), ...kept] };
}

/**
 * A record handed across a query, kept only in the shape `withSteps` writes: a version-1 record
 * whose `input` is a plain object, a whole `shrink`, and known steps. Anything else is null, and
 * the door then halves what arrives, as it does for a blow with no record.
 *
 * @param {*} x
 * @returns {object|null}
 */
export function recordOf(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  if (!x.input || typeof x.input !== "object" || Array.isArray(x.input)) return null;
  const shrink = whole(x.shrink);
  const then = Array.isArray(x.then) ? x.then.filter(s => s && typeof s === "object" && !Array.isArray(s) && RECORD_STEPS.includes(Object.keys(s)[0])) : [];
  return { version: 1, input: x.input, ...(shrink ? { shrink } : {}), ...(then.length ? { then } : {}) };
}

/**
 * **WHAT A CARRIED RECORD RESOLVES TO** (O-362): the resolver over `input` (the record's own,
 * or one handed in - Icebound hands the same with `takenHalved`), the Shrink Ray's reduction
 * once (`gadgets.mjs#shrinkDamage`, the card's own order), then each step in turn. What comes
 * back is `resolveDamage`'s shape: `damage`, `wardTook`, `parts`.
 *
 * @param {object} record  `withSteps`' shape
 * @param {object} [input]
 * @returns {{damage: number, wardTook: number, parts: Array<object>|null|undefined}}
 */
export function resolveRecord(record, input = record?.input) {
  const r0 = shrinkDamage(resolveDamage({ ...(input ?? {}) }), whole(record?.shrink));
  let r = { ...r0, damage: whole(r0.damage), wardTook: whole(r0.wardTook) };
  for (const step of record?.then ?? []) {
    if (step.moved) r = { ...r, wardTook: 0, ...(Array.isArray(r.parts) ? { parts: movedParts(r.parts) } : {}) };
    else if (step.minus !== undefined) r = { ...r, damage: Math.max(0, r.damage - whole(step.minus)) };
    else if (step.half) {
      const { parts: _parts, mainDamage: _main, ...rest } = r;
      r = { ...rest, damage: Math.floor(r.damage / 2), parts: null };
    } else if (step.burden) {
      const b = step.burden;
      const share = movedAmount({ kind: "burden", amount: r.damage, share: b.share ?? "half" });
      const met = burdenMet({ share, type: b.type ?? null, location: b.location ?? "body", holder: b.holder ?? {}, parts: share < r.damage ? null : (r.parts ?? null) });
      r = { damage: met.damage, wardTook: met.wardTook, parts: met.parts };
    } else if (step.divide) {
      const { shares } = divideEvenly(r.damage, whole(step.divide.count) || 1);
      const { parts: _parts, mainDamage: _main, ...rest } = r;
      r = { ...rest, wardTook: 0, damage: shares[whole(step.divide.index)] ?? 0, parts: null };
    }
  }
  return r;
}

/**
 * **THE RAISED GAUNTLET'S BLOW ON ITS BEARER, RECORDED** (D-913; run close-F2): the card's blow met
 * on its bearer (`blow-doors.mjs#regrossInput`), the striker's Shrink Ray taken once - the card's `shrink` had been
 * handed to the bare resolver as a second argument it never reads - and the record
 * (`mitigationSource`) the bearer's Icebound Fortitude re-resolves.
 *
 * @param {object|null} spec  the card's `blowSpec`
 * @param {object} bearer
 * @returns {object|null}
 */
export function regrossRecorded(spec, bearer = {}) {
  const input = regrossInput(spec, bearer);
  if (!input) return null;
  return resolveRecordedDamage(input, { shrink: whole(spec?.shrink) });
}
