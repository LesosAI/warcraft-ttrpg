/** Classic Obsidian Destroyer: explicit tabletop numbers, not client scaling. */
import { dispelJudgement } from "./dispel.mjs";
export const OBSIDIAN_DESTROYER = Object.freeze({ capacity: 12, drain: 4, targets: 3,
  range: 30, dc: 20, purgeRadius: 20, purgeDamage: 10 });
const whole = value => Number.isInteger(value) && value >= 0;
const id = value => typeof value === "string" && value.trim().length > 0;

/** Validate the complete selection before payment. One explicitly selected
 * Mana pool per target; never sum class pools or take Focus/Energy/Momentum.
 * `resisted` is a resolved Spirit result, not a player-supplied assertion. */
export function destroyerDrainPlan({ mana, maximum, targets = [] } = {}) {
  const refuse = reason => ({ ok: false, reason, drained: 0, gained: 0, targets: [] });
  if (!whole(mana) || maximum !== OBSIDIAN_DESTROYER.capacity || mana > maximum) return refuse("sourcePool");
  if (mana === maximum) return refuse("full");
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > OBSIDIAN_DESTROYER.targets) return refuse("targets");
  const seen = new Set(), planned = [];
  for (const target of targets) {
    if (!id(target?.uuid) || seen.has(target.uuid)) return refuse("duplicateOrMissingTarget");
    seen.add(target.uuid);
    if (target.hostile !== true || !Number.isFinite(target.distance) || target.distance < 0
      || target.distance > OBSIDIAN_DESTROYER.range || typeof target.resisted !== "boolean") return refuse("target");
    if (!Array.isArray(target.pools) || !(target.itemId === null || id(target.itemId))) return refuse("pool");
    const matches = target.pools.filter(pool => pool?.kind === "power"
      && (pool.name === "mana" || pool.name == null) && pool.itemId === target.itemId);
    if (matches.length !== 1 || !whole(matches[0].value)) return refuse("pool");
    const pool = matches[0], amount = Math.min(pool.value, target.resisted ? 2 : OBSIDIAN_DESTROYER.drain);
    planned.push({ uuid: target.uuid, itemId: pool.itemId, before: pool.value, value: pool.value - amount, drained: amount });
  }
  const drained = planned.reduce((sum, target) => sum + target.drained, 0);
  const gained = Math.min(maximum - mana, drained);
  return { ok: true, reason: null, drained, gained, value: mana + gained, targets: planned };
}

/** Commit source gain from confirmed losses only. An uncertain target write
 * is not proof that Mana was lost, and must not manufacture source Mana. */
export function destroyerConfirmedGain({ mana, maximum, losses = [] } = {}) {
  if (!whole(mana) || maximum !== OBSIDIAN_DESTROYER.capacity || mana > maximum || !Array.isArray(losses)) return null;
  const seen = new Set(); let total = 0;
  for (const loss of losses) {
    if (!id(loss?.uuid) || seen.has(loss.uuid) || !whole(loss.drained) || loss.drained > OBSIDIAN_DESTROYER.drain) return null;
    seen.add(loss.uuid); total += loss.drained;
  }
  if (losses.length > OBSIDIAN_DESTROYER.targets) return null;
  const gained = Math.min(maximum - mana, total);
  return { gained, value: mana + gained };
}

/** Full-pool Purge spends everything once. Resistance and Ward are separate:
 * halve the printed Nature damage before the ordinary mitigation writer. */
export function destroyerPurgePlan({ mana, maximum, resisted, stunImmune = false } = {}) {
  if (maximum !== OBSIDIAN_DESTROYER.capacity || mana !== maximum
    || typeof resisted !== "boolean" || typeof stunImmune !== "boolean") return null;
  return { value: 0, spent: mana, damage: resisted ? 5 : OBSIDIAN_DESTROYER.purgeDamage,
    school: "nature", stunned: !resisted && !stunImmune, dispel: !resisted };
}

/** A trusted GM review identifies a beneficial magical effect. Existing
 * protections remain authoritative, including conditions and Archmage. */
export function destroyerPurgeEffect(effect, { beneficial = false, magical = false, archmage = [] } = {}) {
  if (!effect || effect.disabled || effect.active === false || effect.isSuppressed) return { ok: false, reason: "inactive" };
  if (beneficial !== true || magical !== true) return { ok: false, reason: "needsReview" };
  return dispelJudgement(effect, { archmage });
}
