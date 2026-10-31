/** Fey Dragon's tabletop adaptation of Classic Nullify Mana.
 * The caller supplies the source snapshot AFTER paying the ability's cost.
 * No Foundry documents or mutations belong in this calculation.
 */
import { MANA, poolNamed } from "./pools.mjs";

export const NULLIFY_MANA = Object.freeze({
  name: "Nullify Mana", action: "action", cost: 2, drain: 2,
  feet: 30, dc: 15, resilience: "spirit", uses: 1, per: "short"
});

function eligiblePool(pools) {
  return poolNamed((Array.isArray(pools) ? pools : []).filter(p =>
    p?.kind === "power" && (p.name === MANA || !p.name)), MANA);
}

const validValue = value => Number.isInteger(value) && value >= 0;
const change = (pool, value) => ({ itemId: pool.itemId ?? null, kind: "power", value });

/** Source payment; other Power types cannot buy this Mana ability. */
export function nullifyManaPayment(pools = []) {
  const pool = eligiblePool(pools);
  if (!pool || !validValue(pool.value) || !validValue(pool.max)
    || pool.value > pool.max || pool.value < NULLIFY_MANA.cost) return null;
  return change(pool, pool.value - NULLIFY_MANA.cost);
}

/** A drain is not damage. Empty targets lose nothing and grant nothing.
 * Mana destroyed beyond the recipient's capacity is not saved for later.
 * Separate class pools are never combined, and other resources are untouched.
 * Returns null for malformed pools or a source without a Mana/unnamed Power
 * pool: the runtime must refuse before paying if the source cannot use it.
 */
export function nullifyManaPlan({ source = [], target = [] } = {}) {
  const receiver = eligiblePool(source), victim = eligiblePool(target);
  if (!receiver || !validValue(receiver.value) || !validValue(receiver.max)
    || receiver.value > receiver.max || (victim && !validValue(victim.value))) return null;
  const drained = Math.min(NULLIFY_MANA.drain, victim?.value ?? 0);
  const restored = Math.min(drained, receiver.max - receiver.value);
  return {
    drained, restored,
    targetChange: drained ? change(victim, victim.value - drained) : null,
    sourceChange: restored ? change(receiver, receiver.value + restored) : null
  };
}
