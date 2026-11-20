/**
 * **VITAE, THE SOVEREIGN'S POWER** (02 §7; the San'layn and Sovereign plan's B.4, V1 to V5). Pure:
 * no Foundry imports (CLAUDE.md §3).
 *
 * The lead's words (R7, R9, R10):
 * - *"I have a new idea to replace Mana. I like the idea of Vitae and scales off Constitution as the
 *   casting attribute. ... Vitae is a larger pool than mana, and is used to cast Blood school spells
 *   and relevant class features/talents. ... When Vitae runs out it drains health until the
 *   Sovereign feeds again."*
 * - *"Feeding only. Feeding is required for a long rest on this class/race"*
 * - *"Health cost if Vitae is 0, is 1 for 1 and it can drop to 0"*
 *
 * What this module holds:
 * - **The size** (`vitaeMax`): 02 §6's full-caster chart times `VITAE_SCALE` (1.5), plus the
 *   Constitution modifier. The scale is the pool's own (`POOL_SCALE`), so a class item that carries
 *   a `scale` on its power (the plan's V1 fixture) and one that does not size the pool alike.
 * - **The payment** (`vitaePayment`): a cost above the Vitae held takes the rest off Health, 1 for 1,
 *   and may drop the payer to 0. Refused only where the cost is more than the Vitae plus the Health.
 *   Health paid this way is not damage: temporary Health never meets it, nor any hold at 1, nor 07's
 *   Aegis floor, and it lays no Critical Injury (B.13 Q22 to Q24).
 * - **The warning** the Spells tab and the cast dialog print (`vitaeWarning`).
 *
 * The refill is `feeding.mjs`; the named-source lock is `named-gains.mjs#VITAE_GAIN_SOURCES`; no
 * rest refills it (`rest.mjs#REST_NEVER_REFILLS`), and `pools.mjs#manaPool` never answers it, so no
 * Mana restorer reaches it.
 */

/** The pool's key in `AZEROTH.powerTypes`. */
export const VITAE = "vitae";

/** *"Vitae is a larger pool than mana"* (R7): 02 §6's chart times 1.5 (the plan's B.4, B.13 Q2). */
export const VITAE_SCALE = 1.5;

/** A Power pool's scale over 02 §6's chart, by name; a pool not named here takes the chart as it is. */
export const POOL_SCALE = Object.freeze({ [VITAE]: VITAE_SCALE });


const int = v => Math.trunc(Number(v)) || 0;

/**
 * Whether a Power pool is sized off 02 §6's casting chart and takes the casting modifier: Mana and
 * Vitae. Focus and Energy are flat (05 §11).
 *
 * @param {string|null} name
 */
export function chartPool(name) {
  return name === "mana" || name === VITAE;
}

/**
 * The scale a pool takes over the chart: the class item's own `scale` where it carries a positive
 * number, else `POOL_SCALE`, else 1.
 *
 * @param {{name?: string|null, scale?: number|null}} power  a class item's `power`
 * @returns {number}
 */
export function poolScale(power = {}) {
  const own = Number(power?.scale);
  if (Number.isFinite(own) && own > 0) return own;
  return POOL_SCALE[power?.name] ?? 1;
}

/**
 * **THE SIZE OF A CHART POOL** (02 §6; R7): the chart's number for the level and grade, times the
 * pool's scale, rounded down, plus the casting ability's modifier, never below 0.
 *
 * @param {{chart: number, scale?: number, mod?: number}} o
 * @returns {number}
 */
export function scaledPoolMax({ chart = 0, scale = 1, mod = 0 } = {}) {
  const base = Math.floor(Math.max(0, Number(chart) || 0) * (Number(scale) > 0 ? Number(scale) : 1));
  return Math.max(0, base + int(mod));
}

/**
 * **WHAT A COST TAKES FROM VITAE AND FROM HEALTH** (02 §7's *When your Vitae runs out*; R10; the
 * plan's V4). All the Vitae held first, then the rest off Health, 1 for 1. Refused only where the
 * cost is more than the Vitae plus the Health (*You cannot pay more Health than you have*).
 *
 * The plan's pins: 5 Vitae, 7 Health, cost 12 leaves 0 and 0 (`toZero`); 5 Vitae, 6 Health, cost 12
 * is refused. Temporary Health is never an input: it cannot be spent (05).
 *
 * @param {{held: number, cost: number, health: number}} o
 * @returns {{vitae: number, health: number, vitaeAfter: number, healthAfter: number, refusal: "short"|null, toZero: boolean, overflow: boolean}}
 *   `vitae` the Vitae taken; `health` the Health taken; `overflow` whether any Health is taken
 */
export function vitaePayment({ held = 0, cost = 0, health = 0 } = {}) {
  const v = Math.max(0, int(held));
  const c = Math.max(0, int(cost));
  const h = Math.max(0, int(health));
  if (c > v + h) return { vitae: 0, health: 0, vitaeAfter: v, healthAfter: h, refusal: "short", toZero: false, overflow: false };
  const fromVitae = Math.min(v, c);
  const fromHealth = c - fromVitae;
  const healthAfter = h - fromHealth;
  return {
    vitae: fromVitae, health: fromHealth, vitaeAfter: v - fromVitae, healthAfter,
    refusal: null, toZero: fromHealth > 0 && healthAfter === 0, overflow: fromHealth > 0
  };
}

/**
 * **WHAT THE SPELLS TAB AND THE CAST DIALOG SAY BEFORE A COST IS PAID** (the plan's V4: *"This will
 * drop you to 0 Health"* in words). `refused` where it cannot be paid, `toZero` where it drops the
 * payer to 0, `overflow` where it takes Health and leaves some, null where the Vitae covers it.
 *
 * @param {{held: number, cost: number, health: number}} o
 * @returns {"refused"|"toZero"|"overflow"|null}
 */
export function vitaeWarning(o = {}) {
  const p = vitaePayment(o);
  if (p.refusal) return "refused";
  if (p.toZero) return "toZero";
  if (p.overflow) return "overflow";
  return null;
}

/** The lang key each warning is said in. */
export const VITAE_WARNING_WORDS = Object.freeze({
  refused: "AZEROTH.Vitae.Warn.refused",
  toZero: "AZEROTH.Vitae.Warn.toZero",
  overflow: "AZEROTH.Vitae.Warn.overflow"
});

/**
 * **HEALTH PAID FOR VITAE IS NOT DAMAGE** (02 §7: *Health you pay this way is not damage*; B.13 Q22 and
 * Q23). The write option the payment's Health carries (`AzerothActor#loseHealth(amount,
 * {vitaeOverflow: true})`), which the director reads for the drain pulse (C14) and which every
 * hold, the Aegis floor and the Critical Injury door skip.
 */
export const VITAE_OVERFLOW_OPTION = "azerothVitaeOverflow";

/**
 * **THE PAYMENT THAT DROPPED THE PAYER TO 0, MARKED** (02 §7: *The spell or feature you paid for still takes
 * effect*; D-1296): the real time (ms) of the Vitae payment that took the Health to 0, written in the same
 * update. The cast's reaction window (`effects/spell-lock-query.mjs`) refuses a caster at 0 Health, and the
 * payment comes before the Test, so the one cast that paid itself to 0 was refused after it was paid for.
 */
export const VITAE_TO_ZERO_FLAG = "vitaeToZeroAt";

/** How long the mark stands for the cast it paid for, in ms: the cast's own Test, never a later one. */
export const VITAE_TO_ZERO_WINDOW_MS = 120000;

/**
 * Whether the payer is at 0 Health from its own Vitae payment for the cast now being made.
 *
 * @param {{health: number, at: number|null|undefined, now: number}} o  `at` the flag, `now` Date.now()
 */
export function paidItselfToZero({ health = 0, at = null, now = 0 } = {}) {
  const t = Number(at);
  if (!(Number(health) <= 0) || !Number.isFinite(t) || t <= 0) return false;
  return Math.abs(Number(now) - t) < VITAE_TO_ZERO_WINDOW_MS;
}
