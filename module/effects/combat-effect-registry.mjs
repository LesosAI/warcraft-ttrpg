/**
 * V14.367 can materialize a combatant's synthetic actor before the effect
 * registry initializes. Core initializes world actors only, so those synthetic
 * effects otherwise miss every subsequent turn refresh after a reload.
 * Reconcile only missing entries, using the lifecycle event's round and turn.
 */
export function restoreCombatEffectTracking(combatant, context, registry = CONFIG.ActiveEffect.documentClass.registry) {
  const actor = combatant?.actor;
  if (!actor?.isToken || !registry?.initialized) return;
  const parents = [actor, ...actor.items];
  for (const parent of parents) {
    for (const effect of parent.effects) {
      if (registry.has(effect)) continue;
      effect.updateDuration(context);
      registry.add(effect);
    }
  }
}
