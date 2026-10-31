/** Local observations, never inferred from a corpse loaded from a save. Keep
 * observing on every client so a later active-GM handoff retains the baseline. */
import { maggotGooDeath } from "./maggot-goo.mjs";

export function maggotGooObserver() {
  const health = new WeakMap();
  const value = actor => actor?.system?.health?.value;
  const hasAbility = actor => (actor?.system?.creatureAbilities ?? []).some(row => row.name === "Maggot Goo");
  return {
    prime(actor) {
      if (actor && typeof actor === "object" && !health.has(actor)) health.set(actor, value(actor));
    },
    observe(actor) {
      if (!actor || typeof actor !== "object") return false;
      const before = health.get(actor), after = value(actor);
      health.set(actor, after);
      return maggotGooDeath({ before, after, hasAbility: hasAbility(actor) });
    }
  };
}
