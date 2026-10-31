/** Felhunter, 14-BESTIARY: a wounding Bite drains one Power and ends one
 * temporary magical effect chosen by the victim. No Power means Silence
 * instead. These functions plan only; the GM workflow owns wound evidence,
 * effect review, victim choices, durable delivery claims and document writes.
 */
import { dispelJudgement } from "./dispel.mjs";

const id = value => value === null || (typeof value === "string" && value.trim().length > 0);
const refuse = reason => ({ ok: false, reason });

/** `pools` is the victim's complete poolSnapshot, not the attacker's or a
 * client-selected subset. A null itemId identifies an NPC's flat Power pool.
 * Never drain Momentum, combine class pools, or infer zero from missing data.
 * `wounded` must come from the confirmed damage application, not merely a hit.
 */
export function devourMagicPlan({ wounded, pools, poolId } = {}) {
  if (wounded !== true) return refuse("notWounded");
  if (!Array.isArray(pools) || pools.some(pool => !pool || !["power", "momentum"].includes(pool.kind))) {
    return refuse("invalidPools");
  }
  const power = pools.filter(pool => pool.kind === "power");
  if (power.some(pool => !id(pool.itemId) || !Number.isSafeInteger(pool.value) || pool.value < 0)
    || new Set(power.map(pool => pool.itemId)).size !== power.length) return refuse("invalidPools");
  const available = power.filter(pool => pool.value > 0);
  if (!available.length) return { ok: true, reason: null, kind: "silence", until: "endOfNextTurn" };
  const selected = poolId === undefined && available.length === 1 ? available[0]
    : available.find(pool => pool.itemId === poolId);
  if (!selected) return refuse(poolId === undefined ? "choosePowerPool" : "unavailablePowerPool");
  return { ok: true, reason: null, kind: "drain", itemId: selected.itemId,
    before: selected.value, value: selected.value - 1, lost: 1, effects: 1 };
}

/** The GM reviews whether this whole effect is temporary and magical; the
 * victim chooses among eligible effects. Neither beneficial-only nor
 * harmful-only: the printed rule imposes neither restriction. Reuse the
 * established Dispel protections rather than treating every timed status,
 * injury, talent, aura or item bonus as removable magic.
 */
export function devourMagicEffect(effect, { magical = false, temporary = false, archmage = [] } = {}) {
  if (!effect || effect.disabled === true || effect.active === false || effect.isSuppressed === true
    || effect.isExpired === true) return refuse("inactive");
  if (magical !== true || temporary !== true) return refuse("needsReview");
  return dispelJudgement(effect, { archmage });
}
