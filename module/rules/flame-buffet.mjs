/** Baron Charr's authored tabletop debuff. No Foundry dependencies. */
export const FLAME_BUFFET = Object.freeze({ flag: "flameBuffet", maxStacks: 5, seconds: 12,
  action: "action", mana: 2, range: 30, dc: 17, rating: 4, school: "fire" });

/** These are tabletop encounter budgets, not the source client's raw values. */
export const CHARR_ABILITIES = Object.freeze({
  "Flame Buffet": Object.freeze({ name: "Flame Buffet", action: FLAME_BUFFET.action,
    mana: FLAME_BUFFET.mana, range: FLAME_BUFFET.range, radius: null,
    rating: FLAME_BUFFET.rating, school: FLAME_BUFFET.school, resilience: "reflex",
    dc: FLAME_BUFFET.dc, uses: null }),
  "Fireball Volley": Object.freeze({ name: "Fireball Volley", action: "action", mana: 4,
    range: null, radius: 20, rating: 6, school: "fire", resilience: "reflex", dc: 17,
    uses: Object.freeze({ max: 1, per: "short" }) })
});

/** Resolve only a confirmed resistance result. The returned rating is before
 * target mitigation and before existing Buffet stacks. Apply those stacks to
 * the initial hit, then write a new stack only when addStack is true. */
export function charrOutcome(name, passed) {
  if (!Object.hasOwn(CHARR_ABILITIES, name ?? "") || typeof passed !== "boolean") return null;
  const spec = CHARR_ABILITIES[name];
  return { rating: passed ? Math.floor(spec.rating / 2) : spec.rating,
    school: spec.school, addStack: name === "Flame Buffet" && !passed };
}

const finiteTime = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const identity = value => typeof value === "string" && value.trim().length > 0;

/** Invalid/expired state is inert, including future-dated records after a
 * clock rewind. The adapter owns effect creation, refresh and dispelling. */
export function activeBuffet(effect, now) {
  if (!finiteTime(now) || !effect || effect.disabled || effect.isSuppressed) return null;
  const row = effect.flags?.["azeroth-rpg"]?.[FLAME_BUFFET.flag];
  if (row?.version !== 1 || !Number.isInteger(row.stacks) || row.stacks < 1 || row.stacks > FLAME_BUFFET.maxStacks
    || !identity(row.sourceUuid) || !finiteTime(row.appliedAt) || !finiteTime(row.expiresAt)
    || row.expiresAt !== row.appliedAt + FLAME_BUFFET.seconds
    || now < row.appliedAt || now >= row.expiresAt) return null;
  return { version: 1, stacks: row.stacks, sourceUuid: row.sourceUuid, appliedAt: row.appliedAt, expiresAt: row.expiresAt };
}

/** One shared stack pool. Duplicate effects never add their stacks together. */
export function buffetStacks(effects = [], now) {
  if (!Array.isArray(effects)) return 0;
  return effects.reduce((max, effect) => Math.max(max, activeBuffet(effect, now)?.stacks ?? 0), 0);
}

/** A confirmed failed Buffet adds one stack after its initial damage. Even at
 * the cap, application refreshes the whole pool's twelve-second lifetime. */
export function nextBuffet(effects, now, sourceUuid) {
  if (!Array.isArray(effects) || !finiteTime(now) || !identity(sourceUuid)
    || !Number.isFinite(now + FLAME_BUFFET.seconds)) return null;
  return { version: 1, stacks: Math.min(FLAME_BUFFET.maxStacks, buffetStacks(effects, now) + 1),
    sourceUuid, appliedAt: now, expiresAt: now + FLAME_BUFFET.seconds };
}

/** Add once to an existing positive Fire component, before mitigation.
 * This does not itself apply damage, consume stacks or bypass immunity. */
export function flameBuffetBonus({ effects = [], now, school, rating } = {}) {
  if (school !== "fire" || typeof rating !== "number" || !Number.isFinite(rating) || rating <= 0) return 0;
  return buffetStacks(effects, now);
}
