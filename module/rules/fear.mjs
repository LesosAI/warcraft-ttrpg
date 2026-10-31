/** Fear ends only when its own caster deals positive damage to its target. */
export function fearEndsOnDamage(mark, by, amount) {
  return typeof by === "string" && Boolean(by) && mark?.by === by
    && Number.isFinite(amount) && amount > 0;
}
