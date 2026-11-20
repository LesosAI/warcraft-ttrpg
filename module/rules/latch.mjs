/**
 * **LATCHED, THE RULE** (02 §7's rules block; the San'layn and Sovereign plan's C8; R20: *"define via a
 * rule like "grappling""*). Pure: no Foundry imports. The writer is `effects/sovereign-features.mjs`
 * (`layLatch`, `endLatch`), on the GM's client through `CONFIG.queries` where the Sovereign's client does
 * not own the prey.
 *
 * *Some features let you latch on to a creature within 5 feet of you. While you are latched on, it cannot
 * willingly move to a space more than 5 feet from you, and you cannot make an Off-Hand Attack. It makes a
 * Body Resilience Test against your Spell DC at the end of each of its turns, and the latch ends on a
 * success. The latch also ends when you move more than 5 feet from it, when you are Stunned, when either
 * of you drops to 0 Health, or when you let go. You latch on to one creature at a time.*
 *
 * The carrier is one Active Effect on the prey: `flags.azeroth-rpg.latch = {holder, dc, tick, source}`
 * (`holder` the Sovereign's actor uuid, CORE's feeding reads it; `tick` Latch On's drain at the holder's
 * turn start, or null) beside a leash of 5 feet (`rules/leash.mjs`) held to the holder's token.
 */

import { LATCH_FEET } from "./leash.mjs";

/** The flag the carrier rides (CORE's `effects/sovereign-core.mjs#LATCH_FLAG`, the same word). */
export const LATCH_KEY = "latch";

/** Its escape Test (02 §7: *a Body Resilience Test against your Spell DC at the end of each of its turns*). */
export const LATCH_ESCAPE = Object.freeze({ resilience: "body", on: "turnEnd" });

const int = v => Math.trunc(Number(v)) || 0;

/** A latch record, cleaned, or null. */
export function cleanLatch(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.holder !== "string" || !raw.holder) return null;
  const dc = int(raw.dc);
  return {
    holder: raw.holder,
    holderToken: typeof raw.holderToken === "string" && raw.holderToken ? raw.holderToken : null,
    dc: dc > 0 ? dc : null,
    tick: raw.tick && typeof raw.tick === "object" ? { rank: Math.max(1, int(raw.tick.rank)) } : null,
    source: typeof raw.source === "string" ? raw.source : ""
  };
}

/** The latches a creature carries (plain effects), active ones only. */
export function latchesOn(effects = []) {
  const out = [];
  for (const e of effects ?? []) {
    if (!e || e.disabled === true || e.active === false) continue;
    const l = cleanLatch(e.flags?.["azeroth-rpg"]?.[LATCH_KEY]);
    if (l) out.push({ id: String(e.id ?? ""), ...l });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * **WHY A LATCH MAY NOT BE LAID**: the prey more than 5 feet away, the holder Stunned, either at 0 Health.
 * Null where it may.
 */
export function latchRefusal({ feet = null, holderStunned = false, holderHealth = 1, preyHealth = 1, self = false } = {}) {
  if (self) return "self";
  if (holderStunned) return "stunned";
  if (!(int(holderHealth) > 0) || !(int(preyHealth) > 0)) return "zero";
  if (feet === null || Number(feet) > LATCH_FEET + 0.001) return "far";
  return null;
}

/**
 * **WHETHER A STANDING LATCH ENDS**: more than 5 feet apart, the holder Stunned, either at 0 Health.
 * Unmeasured keeps it (nothing measured is no breach).
 */
export function latchEnds({ feet = null, holderStunned = false, holderHealth = 1, preyHealth = 1 } = {}) {
  if (holderStunned) return "stunned";
  if (!(int(holderHealth) > 0) || !(int(preyHealth) > 0)) return "zero";
  if (feet !== null && Number.isFinite(Number(feet)) && Number(feet) > LATCH_FEET + 0.001) return "far";
  return null;
}

/** **THE HOLDER'S OFF HAND**: refused while it holds a latch (02 §7: *you cannot make an Off-Hand Attack*). */
export const latchBarsOffHand = (held = []) => (held ?? []).length > 0;
