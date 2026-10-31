/** Tabletop demon ability rules. No Foundry document access or writes.
 * See docs/design/CLASSIC-DEMON-ABILITY-IMPLEMENTATION.md.
 * The workflow must validate ownership, range, visibility and payment first.
 */
const validTime = value => Number.isFinite(value) && value >= 0;
const validId = value => typeof value === "string" && value.length > 0;

/** A transient attack profile: retain the actual whip's numbers and Reach,
 * remove Snag, and leave the original attack row unchanged. Ambiguous or
 * missing whip rows refuse activation instead of guessing another attack.
 */
export function lashOfPainProfile(attacks) {
  if (!Array.isArray(attacks)) return null;
  const matches = attacks.filter(a => typeof a?.name === "string" && a.name.trim().toLowerCase() === "whip");
  if (matches.length !== 1) return null;
  const whip = matches[0];
  if (!Number.isFinite(whip.bonus) || !Number.isFinite(whip.damage) || whip.damage < 0
      || !Array.isArray(whip.traits) || whip.traits.some(t => typeof t !== "string")) return null;
  return { action: "action", mana: 2, damageSchool: "shadow",
    attack: { ...whip, traits: whip.traits.filter(t => t.trim().toLowerCase() !== "snag") } };
}

/** Shared Tainted Blood penalty across all felhunters. A workflow supplies
 * only the current un-dispelled record. Duplicate delivery does not refresh
 * the timer; the writer must atomically persist the returned record.
 */
export function taintedBloodHit(previous, { hitId, now, melee, hit, retaliation = false } = {}) {
  if (!validId(hitId) || !validTime(now) || melee !== true || hit !== true || retaliation !== false) return null;
  const active = previous && validTime(previous.expiresAt) && previous.expiresAt > now
    && Number.isInteger(previous.stacks) && previous.stacks >= 1 && previous.stacks <= 5;
  const hits = active && Array.isArray(previous.hitIds) ? previous.hitIds.filter(validId) : [];
  if (hits.includes(hitId)) return null;
  return {
    stacks: Math.min(5, (active ? previous.stacks : 0) + 1),
    expiresAt: now + 12,
    hitIds: [...hits, hitId]
  };
}

/** Apply to the attack's Damage Rating before halving, armor or Ward.
 * A melee spell is still a spell, not a melee attack for this rule.
 */
export function taintedBloodDamage(rating, record, { now, meleeAttack, spell = false } = {}) {
  if (!Number.isFinite(rating) || rating < 0 || !validTime(now)) return null;
  const active = record && validTime(record.expiresAt) && record.expiresAt > now
    && Number.isInteger(record.stacks) && record.stacks >= 1 && record.stacks <= 5;
  if (!active || meleeAttack !== true || spell !== false) return rating;
  return Math.max(0, rating - record.stacks);
}

/** One shared Bane, not one per taunt. Each effect names the voidwalker
 * whose inclusion satisfies that effect. Multi-target attacks may satisfy
 * every effect; effects from distinct voidwalkers can still impose one Bane.
 * Caller passes only active effects applying to the attacking creature.
 */
export function tormentBane(voidwalkerIds, targetIds) {
  if (!Array.isArray(voidwalkerIds) || !Array.isArray(targetIds) || !targetIds.length
      || targetIds.some(id => !validId(id))) return 0;
  const targets = new Set(targetIds);
  return voidwalkerIds.some(id => validId(id) && !targets.has(id)) ? 1 : 0;
}

/** Retaliation is one event per successful melee hit, not per damage
 * component. The writer owns durable deduplication using the hit ID.
 */
export function fireShieldRetaliation({ hitId, hit, meleeAttack, enemy, retaliation = false } = {}) {
  if (!validId(hitId) || hit !== true || meleeAttack !== true || enemy !== true || retaliation !== false) return null;
  return { hitId, amount: 2, type: "fire", retaliation: true };
}
