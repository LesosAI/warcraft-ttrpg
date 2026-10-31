/** Classic spell 22936's resource-to-damage relationship, using tabletop
 * resource units. Unlike chapter 07 Mana Burn, missing Mana adds no damage. */
export const ABERRATION_DEATH = Object.freeze({
  name: "Unraveling Mana", radius: 10, dc: 17, resilience: "spirit",
  drain: 4, school: "shadow"
});

export const ABERRATION_BLAST = Object.freeze({
  name: "Aberration Arcane Blast", radius: 10, dc: 17, resilience: "reflex",
  rating: 5, mana: 3, action: "action", school: "arcane"
});

export function aberrationBlastDamage(resisted) {
  if (typeof resisted !== "boolean") return null;
  return resisted ? Math.floor(ABERRATION_BLAST.rating / 2) : ABERRATION_BLAST.rating;
}

/** Only a newly observed living-to-zero transition starts a death event.
 * Priming a loaded corpse, repeated updates and unrelated NPCs stay silent. */
export function aberrationDeathObserver() {
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
        && actor.system?.creatureAbilities?.some(row => row.name === ABERRATION_DEATH.name) === true;
    }
  };
}

export function aberrationDeathClaim({ tokenUuid, actorUuid, health, existing = null, observedDeath = false } = {}) {
  if (observedDeath !== true || existing !== null
    || ![tokenUuid, actorUuid].every(value => typeof value === "string" && value.trim())
    || health?.value !== 0 || !Number.isInteger(health.max) || health.max <= 0) return null;
  return { version: 1, state: "claimed", tokenUuid, actorUuid, targets: {} };
}

/** Select exactly one class Mana pool. The runtime must resolve this plan
 * against a current pool snapshot and confirm the drain before damage.
 * Shadow Ward mitigates damage in the ordinary damage path, not the drain. */
export function aberrationManaBurnPlan({ pools, itemId = null, resisted, npc = false } = {}) {
  if (!Array.isArray(pools) || typeof resisted !== "boolean" || typeof npc !== "boolean"
    || !(itemId === null || (typeof itemId === "string" && itemId.length > 0))) return null;
  const eligible = pools.filter(pool => pool?.kind === "power"
    && (pool.name === "mana" || (npc && pool.name == null)));
  if (!eligible.length && itemId === null) return { drained: 0, damage: 0, change: null };
  const selected = eligible.filter(pool => pool.itemId === itemId);
  if (selected.length !== 1 || !Number.isInteger(selected[0].value) || selected[0].value < 0) return null;
  const pool = selected[0];
  const cap = resisted ? Math.floor(ABERRATION_DEATH.drain / 2) : ABERRATION_DEATH.drain;
  const drained = Math.min(cap, pool.value);
  return { drained, damage: Math.floor(drained / 2),
    change: drained ? { itemId, kind: "power", value: pool.value - drained } : null };
}
