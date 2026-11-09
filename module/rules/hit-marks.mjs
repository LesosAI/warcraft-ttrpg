/**
 * **WHAT A HIT LEAVES ON THE CREATURE IT STRUCK, BESIDE A CONDITION** (D-812; the
 * lead: *"complete them"*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * Three things the book says a hit does, which no door wrote:
 *
 * - **A Ward that drops** (07's Fel Bolt: *At SL 3 or better its Ward against Fel
 *   drops by 1 until the end of your next turn*) - a `final`-phase `add` on the
 *   school's derived Ward and its own `upgrade 0` floor, as a Speed drop carries
 *   one (D-757's lesson: a change in the final phase lands after the floor).
 * - **No Opportunity Attacks** (08 §5's Snag: *The target cannot make Opportunity
 *   Attacks until their next turn*) - a flag the Opportunity Attack's judgement
 *   reads (`rules/struck-tests.mjs#barredFromOpportunity`), on an effect whose own
 *   span is the clock.
 * - **Momentum lost** (08 §5's Rattle: *The target loses 1 Momentum*) - a pool
 *   write, planned here (`momentumLoss`).
 *
 * The effects are written by `effects/hit-marks.mjs`, the one door, on the active
 * GM's client through `CONFIG.queries` where the striker does not own the creature.
 */

import { AZEROTH } from "../config.mjs";
// Sunder's own changes (05 §11): the amount off every location's Armor Points.
import { sunderedChanges } from "./maneuvers.mjs";

/** The marks the door lays as an Active Effect. */
export const HIT_MARK_KINDS = Object.freeze(["wardDrop", "noOpportunity", "apDrop"]);

/** The flag every laid mark rides: `{kind, source, school?, amount?}`. */
export const HIT_MARK_FLAG = "hitMark";

/**
 * **A WARD DROP'S CHANGES**: `add -n` on `system.ward.<school>` and an `upgrade 0`
 * floor beside it, both `final`, so a Ward never reads below nothing.
 *
 * @param {string} school
 * @param {number} amount
 * @returns {Array<{key: string, type: string, value: string, phase: string}>}
 */
export function wardDropChanges(school, amount) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!(n > 0) || !Object.hasOwn(AZEROTH.schools, String(school ?? ""))) return [];
  const key = `system.ward.${school}`;
  return [
    { key, type: "add", value: String(-n), phase: "final" },
    { key, type: "upgrade", value: "0", phase: "final" }
  ];
}

/**
 * **AN ARMOR POINT DROP'S CHANGES** (07's Shattering Bolt: *the target loses 1 Armor Point
 * at every location*; stage 3A): Sunder's own `add -n` on every location's derived Armor
 * Points (`maneuvers.mjs#sunderedChanges`), in the `final` phase, with an `upgrade 0` floor
 * beside each so no location reads below nothing.
 *
 * @param {number} amount
 * @returns {Array<{key: string, type: string, value: string|number, phase: string}>}
 */
export function apDropChanges(amount) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!(n > 0)) return [];
  const drops = sunderedChanges(n);
  return [...drops, ...drops.map(c => ({ key: c.key, type: "upgrade", value: "0", phase: "final" }))];
}

/**
 * **ONE MARK, CLEANED**, or null where it says nothing the door can lay.
 *
 * @param {unknown} raw  `{kind, source, school?, amount?}`
 * @returns {{kind: string, source: string, school?: string, amount?: number}|null}
 */
export function cleanHitMark(raw) {
  if (!raw || typeof raw !== "object" || !HIT_MARK_KINDS.includes(raw.kind)) return null;
  const source = String(raw.source ?? "");
  if (raw.kind === "noOpportunity") return { kind: raw.kind, source };
  // **ARMOR POINTS LOST AT EVERY LOCATION** (07's Shattering Bolt; stage 3A).
  if (raw.kind === "apDrop") {
    const n = Math.trunc(Number(raw.amount));
    return n > 0 ? { kind: raw.kind, source, amount: n } : null;
  }
  const changes = wardDropChanges(raw.school, raw.amount);
  if (!changes.length) return null;
  return { kind: raw.kind, source, school: String(raw.school), amount: Math.trunc(Number(raw.amount)) };
}

/**
 * **THE CHANGES AND FLAGS ONE MARK CARRIES**: the effect's numbers and its
 * `HIT_MARK_FLAG`. A Snag mark carries no change: `snaggedFromOpportunity` reads it.
 *
 * @param {{kind: string, source: string, school?: string, amount?: number}} mark  cleaned
 * @returns {{changes: object[], flags: object}}
 */
export function hitMarkCarries(mark) {
  if (!mark) return { changes: [], flags: {} };
  const changes = mark.kind === "wardDrop" ? wardDropChanges(mark.school, mark.amount)
    : mark.kind === "apDrop" ? apDropChanges(mark.amount) : [];
  // An Armor Point drop *until it finishes a Short Rest* carries Sunder's own flag, so the
  // rest door that ends a Sunder ends it (`AzerothActor#clearSundered`; stage 3A).
  return { changes, flags: { [HIT_MARK_FLAG]: { ...mark }, ...(mark.kind === "apDrop" ? { sundered: true } : {}) } };
}

/**
 * **WHETHER A SNAG HOLDS THIS CREATURE FROM OPPORTUNITY ATTACKS NOW** (08 §5: *until
 * their next turn*): an active effect of its own carrying a `noOpportunity` mark. The
 * effect's own span is the clock. Read by `rules/reactions.mjs#canReact` through the
 * reaction state, beside Nature's Grasp's bar, with words of its own.
 *
 * @param {Array<{active?: boolean, disabled?: boolean, flags?: object}>} effects
 * @returns {boolean}
 */
export function snaggedFromOpportunity(effects = []) {
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    if (e.flags?.["azeroth-rpg"]?.[HIT_MARK_FLAG]?.kind === "noOpportunity") return true;
  }
  return false;
}

/**
 * **WHICH MOMENTUM POOL A LOSS COMES OFF, AND TO WHAT** (MY READING, for the lead:
 * 08 §5's *loses 1 Momentum* names one point and no pool, so it comes off the
 * Momentum pool holding the most - by name, then by its class item, where two hold
 * the same - and never below nothing). Null where the creature holds no Momentum to
 * lose.
 *
 * @param {Array<{itemId: string|null, kind: string, name: string|null, value: number, max: number}>} pools
 * @param {number} amount
 * @returns {{itemId: string|null, kind: "momentum", name: string|null, from: number, value: number, lost: number}|null}
 */
export function momentumLoss(pools = [], amount = 1) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!(n > 0)) return null;
  const held = (pools ?? [])
    .filter(p => p?.kind === "momentum" && (Math.trunc(Number(p.value)) || 0) > 0)
    .sort((a, b) => (Number(b.value) - Number(a.value))
      || String(a.name ?? "").localeCompare(String(b.name ?? ""))
      || String(a.itemId ?? "").localeCompare(String(b.itemId ?? "")));
  const pool = held[0] ?? null;
  if (!pool) return null;
  const from = Math.trunc(Number(pool.value)) || 0;
  const value = Math.max(0, from - n);
  return { itemId: pool.itemId ?? null, kind: "momentum", name: pool.name ?? null, from, value, lost: from - value };
}
