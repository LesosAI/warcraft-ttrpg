/** Classic Mindslayer death burst, adapted to tabletop numbers.
 * Pure planning: the GM adapter must claim the death before writing any target.
 * This is not chapter 07's Arcane Mana Burn with shortage damage.
 */
import { MANA, poolNamed } from "./pools.mjs";

export const MINDSLAYER_DEATH = Object.freeze({
  name: "Dying Mind", radius: 20, dc: 20, resilience: "spirit", drain: 3,
  damageType: "shadow", condition: "frightened", until: "endOfNextTurn"
});

/** One class pool only. A successful Spirit Test halves the drain, rounded
 * down. Damage equals Mana actually lost; no Mana means no damage. Fear is
 * independent of Mana and still respects the target's condition immunity.
 * Shadow Ward/immunity mitigates the resulting damage in the ordinary path,
 * never inventing Mana or changing the amount already drained.
 */
export function dyingMindTargetPlan(pools = [], { resisted, itemId = null, fearImmune = false } = {}) {
  if (typeof resisted !== "boolean" || typeof fearImmune !== "boolean" || !Array.isArray(pools)) return null;
  const eligible = pools.filter(p => p?.kind === "power" && (p.name === MANA || !p.name));
  // An explicit class selection must not silently substitute another class.
  if (itemId !== null && !eligible.some(p => p.itemId === itemId)) return null;
  const pool = poolNamed(eligible, MANA, { itemId });
  if (eligible.length && !pool) return null;
  if (pool && (!Number.isInteger(pool.value) || pool.value < 0)) return null;
  const cap = resisted ? Math.floor(MINDSLAYER_DEATH.drain / 2) : MINDSLAYER_DEATH.drain;
  const drained = Math.min(cap, pool?.value ?? 0);
  return {
    drained, damage: drained, damageType: MINDSLAYER_DEATH.damageType,
    frightened: !resisted && !fearImmune,
    change: drained > 0 ? { itemId: pool.itemId ?? null, kind: "power", value: pool.value - drained } : null
  };
}

/** Persist this identity on the dying token's actor before resolving targets.
 * No automatic rearming on healing, reload, rest or another Health update.
 * An explicit GM encounter reset is the only way to clear the claim.
 */
export function dyingMindClaim({ sceneId, tokenId, actorUuid, health, existing = null } = {}) {
  if (existing !== null || ![sceneId, tokenId, actorUuid].every(v => typeof v === "string" && v.trim())) return null;
  if (!health || !Number.isInteger(health.value) || health.value !== 0
    || !Number.isInteger(health.max) || health.max <= 0) return null;
  return { version: 1, sceneId, tokenId, actorUuid, state: "claimed" };
}

/** Observe actual living-to-zero transitions, never infer one from a loaded
 * corpse. Each synthetic actor has its own baseline; GM handoff must keep
 * observing on other clients without executing their effects.
 */
export function mindslayerDeathObserver() {
  const health = new WeakMap();
  return {
    prime(actor) {
      if (actor && typeof actor === "object" && !health.has(actor)) health.set(actor, actor.system?.health?.value);
    },
    observe(actor) {
      if (!actor || typeof actor !== "object") return false;
      const before = health.get(actor), after = actor.system?.health?.value;
      health.set(actor, after);
      return actor.type === "npc" && Number.isInteger(before) && before > 0 && after === 0
        && (actor.system?.creatureAbilities ?? []).some(row => row.name === MINDSLAYER_DEATH.name);
    }
  };
}
