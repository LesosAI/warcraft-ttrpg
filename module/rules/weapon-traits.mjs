/**
 * What a weapon's traits do to the attack (08 §5, 2026-09-06). Pure, no
 * Foundry imports (CLAUDE.md §3).
 *
 * The lead swung a Fast weapon and no Momentum came of it: the card defined
 * the trait (D-649) and nothing read it. This is the hand-reviewed table
 * over 08 §5's Form and Effect traits and the one Craft enchantment that
 * touches the die, in the vocabulary the attack workflow consumes; the
 * Vitest reads the traits pack and fails on a name the pack lacks or a
 * threshold the pack states otherwise.
 *
 * - A Form trait is always on: Fast's Momentum on a hit once a round,
 *   Heavy's Bane below Strength 13, Unreliable's natural 1, Encumbering's
 *   Speed and Stealth. Pierce is the mitigation's (D-641). The rest are the
 *   table's - Reach, Slow, Brace, Cleave, Versatile, Flexible, Concealable,
 *   Loud, Light, Thrown, Reload - and print as notes where they bear on the
 *   blow.
 * - An Effect trait fires on a Success Level threshold (08 §5): Minor at SL
 *   1, Standard at SL 2, Severe on the Critical Injury. A fired trait that
 *   names a condition offers it on the card; Nick's extra damage joins the
 *   damage; Maim moves the Critical Injury to the Limb table; the rest are
 *   the table's and print as fired.
 * - Keen (Craft) widens the Critical Injury: 19 at Lesser, 18 at Greater.
 */

/** Form traits: always on. */
export const FORM = Object.freeze({
  fast: Object.freeze({ momentum: 1, oncePerRound: true }),
  heavy: Object.freeze({ strength: 13 }),
  unreliable: Object.freeze({ fumble: true }),
  encumbering: Object.freeze({ speed: -5, banes: ["stealth"] }),
  // The table's, printed as a note on the attack where they bear on it.
  reach: Object.freeze({ note: true }),
  slow: Object.freeze({ note: true }),
  brace: Object.freeze({ note: true }),
  cleave: Object.freeze({ note: true }),
  versatile: Object.freeze({ note: true }),
  flexible: Object.freeze({ note: true }),
  light: Object.freeze({}),
  concealable: Object.freeze({}),
  loud: Object.freeze({}),
  thrown: Object.freeze({}),
  reload: Object.freeze({}),
  pierce: Object.freeze({})
});

/** Effect traits: fire on SL 1 (Minor), SL 2 (Standard), or the Critical Injury (Severe). */
export const EFFECT = Object.freeze({
  nick: Object.freeze({ sl: 1, extraDamage: 1 }),
  rattle: Object.freeze({ sl: 1, note: true }),
  snag: Object.freeze({ sl: 1, note: true }),
  shove: Object.freeze({ sl: 1, note: true }),
  bleed: Object.freeze({ sl: 2, condition: { id: "bleeding", value: 1 } }),
  daze: Object.freeze({ sl: 2, note: true }),
  hook: Object.freeze({ sl: 2, condition: { id: "prone" }, note: true }),
  entangle: Object.freeze({ sl: 2, condition: { id: "entangled" } }),
  maim: Object.freeze({ critical: true, location: "limb" }),
  rend: Object.freeze({ critical: true, condition: { id: "bleeding", value: 2 } }),
  impale: Object.freeze({ critical: true, condition: { id: "entangled" } })
});

/** The one Craft enchantment on the die: the Critical Injury's threshold. */
export const CRAFT = Object.freeze({
  keen: Object.freeze({ criticalOn: { lesser: 19, greater: 18 } })
});

/**
 * The one Bound enchantment that fires off the roll (08 §5): *on a Critical
 * Injury you inflict, the target's armor breaks. Reduce its Armor Points by 2
 * until somebody repairs it.*
 *
 * It is an Enchantment rather than an Effect trait, so it cannot live in
 * `EFFECT` - the pack's kinds are what that table is held to - but it fires
 * the same way and joins the same list. Archaedas' stone fists are
 * `Heavy · Sundering` and neither word did anything until D-691.
 */
export const BOUND = Object.freeze({
  sundering: Object.freeze({ critical: true, sunder: 2 })
});

/** `Impale (X)` → `impale`, `Keen (Greater)` → `keen` with the grade, `Pierce 2` → `pierce`. */
export function traitKey(name) {
  const raw = String(name ?? "").trim();
  const grade = /\((Lesser|Greater)\)/i.exec(raw)?.[1]?.toLowerCase() ?? null;
  const key = raw.replace(/\s*\(.*\)\s*$/, "").replace(/\s+\d+$/, "").replace(/\s+X$/i, "").trim().toLowerCase().replace(/[^a-z]/g, "");
  return { key, grade };
}

/**
 * What the traits do to this attack, before the die: the Momentum Fast may
 * add, the Bane Heavy lays below Strength 13, Unreliable's fumble, the
 * Critical Injury's threshold, and the Effect traits waiting on the roll.
 *
 * @param {string[]} names
 * @param {{strength?: number}} [o]  The attacker's Strength total.
 */
export function weaponTraitEffects(names = [], { strength = 10 } = {}) {
  const out = { fastMomentum: 0, heavyBane: false, unreliable: false, criticalOn: 20, effects: [], notes: [] };
  for (const name of names) {
    const { key, grade } = traitKey(name);
    const form = FORM[key];
    if (form?.momentum) out.fastMomentum += form.momentum;
    if (form?.strength && strength < form.strength) out.heavyBane = true;
    if (form?.fumble) out.unreliable = true;
    if (form?.note) out.notes.push({ key, name: String(name) });
    const effect = EFFECT[key] ?? BOUND[key];
    if (effect) out.effects.push({ key, name: String(name), ...effect });
    const craft = CRAFT[key];
    if (craft?.criticalOn) out.criticalOn = Math.min(out.criticalOn, craft.criticalOn[grade === "greater" ? "greater" : "lesser"]);
  }
  return out;
}

/**
 * The Effect traits the roll fired (08 §5): by Success Level on a hit, or
 * on the Critical Injury. Nothing fires on a miss.
 * @param {ReturnType<typeof weaponTraitEffects>} effects
 * @param {{sl: number, success: boolean, critical: boolean}} outcome
 */
export function firedTraits(effects, { sl = 0, success = false, critical = false } = {}) {
  if (!success) return [];
  return (effects?.effects ?? []).filter(e => (e.critical ? critical : sl >= (e.sl ?? Infinity)));
}

/** What the worn weapons do to the body (08 §5): Encumbering's Speed and Stealth. */
export function wornWeaponEffects(traitLists = []) {
  let speed = 0;
  const banes = [];
  for (const names of traitLists) {
    for (const name of names ?? []) {
      const form = FORM[traitKey(name).key];
      if (form?.speed) speed += form.speed;
      for (const skill of form?.banes ?? []) if (!banes.includes(skill)) banes.push(skill);
    }
  }
  return { speed, banes };
}
