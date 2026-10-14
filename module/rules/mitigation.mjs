/**
 * Damage and mitigation. Pure functions, no Foundry imports (CLAUDE.md §3).
 *
 *   Damage = Damage Rating + SL - Armor Points        (physical, 06 §4)
 *   Damage = Damage Rating + SL - Ward of the school  (magical, 06 §4)
 *
 * THERE ARE NO DAMAGE DICE (D-018). If a formula here ever contains a `d`, it
 * is wrong. Ability modifiers apply to the attack roll and never to damage.
 *
 * Damage never falls below 0, and A HIT ABSORBED TO NOTHING IS STILL A HIT:
 * the attacker gains Momentum and on-hit traits fire (06 §4). That is why
 * `resolveDamage` reports `hit` separately from `damage`.
 */

/** The three locations. Body is the default; the others are bought (D-411). */
export const LOCATIONS = Object.freeze(["body", "head", "limb"]);

/** A called shot to the Head adds 2 damage (06 §2). Verified against D-080. */
export const HEAD_DAMAGE_BONUS = 2;

/** Vulnerable adds 2 and switches mitigation off entirely (06 §4). */
export const VULNERABLE_DAMAGE_BONUS = 2;

/**
 * Armor Points at a location. A creature without a location carries no entry
 * for it and cannot be called-shot there (06 §2) — an ooze reads `body` alone.
 * Returns null where the location does not exist on this target.
 */
export function armorAt(apByLocation = {}, location = "body") {
  const ap = apByLocation?.[location];
  return Number.isFinite(ap) ? ap : null;
}

/** Whether a target can be called-shot to a location at all. */
export function hasLocation(apByLocation = {}, location = "body") {
  return armorAt(apByLocation, location) !== null;
}

/**
 * Physical mitigation. The named signature from CLAUDE.md §7 — one function,
 * not logic scattered across the sheet and the chat card.
 *
 * @param {number} damage         Damage Rating + SL, before armor.
 * @param {string} location       body | head | limb
 * @param {object} apByLocation   e.g. { body: 5, head: 4, limb: 4 }
 * @param {number} penetration    Pierce X, which ignores X Armor Points.
 */
export function applyArmor(damage, location, apByLocation, penetration = 0) {
  const ap = armorAt(apByLocation, location) ?? 0;
  const effective = Math.max(0, ap - Math.max(0, penetration));
  return Math.max(0, damage - effective);
}

/**
 * Magical mitigation (D-300, LOCKED).
 *
 *   "Subtract Ward from both the Success Level and the damage of a magical
 *    effect of its school. Minimum SL 0, minimum damage 0."
 *
 * The damage lane takes the subtraction TWICE and that is deliberate: a
 * Casting Test can be pushed past SL 3, so a warded enemy is a wall a caster
 * can climb. Removing one of the two subtractions quietly rebalances every
 * damage school.
 *
 * `times` is a Signature's multiplier (08 §20, D-692), and it lands **before
 * the Ward** because that is what Ashbringer's sentence says.
 */
export function applyWard(rating, sl, ward = 0, times = 1) {
  const w = Math.max(0, ward);
  const effectiveSL = Math.max(0, sl - w);
  return { effectiveSL, damage: Math.max(0, times * (rating + effectiveSL) - w) };
}

/**
 * A spell's damage (D-330, D-300): the Rating stands, the Success Level gates
 * riders and never adds, and Ward comes off both the SL and the damage.
 * `applyWard` above is the other lane - magical WEAPON damage, which keeps
 * adding its SL - and the two were one function until 2026-09-02.
 */
export function spellDamage(rating, sl, ward = 0, times = 1) {
  const w = Math.max(0, ward);
  return { effectiveSL: Math.max(0, sl - w), damage: Math.max(0, times * rating - w) };
}

/**
 * The whole mitigation step in one place.
 *
 * @param {object} o
 * @param {number} o.rating           Damage Rating of the weapon or spell.
 * @param {number} o.sl               Success Level of the attack or cast.
 * @param {"physical"|"magical"} o.kind
 * @param {string} [o.school]         For magical damage: the school it belongs to.
 * @param {string} [o.location]       body | head | limb. Physical only.
 * @param {object} [o.apByLocation]   Armor Points per location.
 * @param {number} [o.penetration]    Pierce X.
 * @param {number} [o.ward]           Ward in the matching school.
 * @param {string[]} [o.immune]       Types the target is Immune to.
 * @param {string[]} [o.vulnerable]   Types the target is Vulnerable to.
 * @param {boolean} [o.slAddsToDamage] False for a spell (D-330); true for a weapon.
 * @param {number} [o.multiplier]     A Signature's damage MULTIPLIER (08 §20,
 *   D-692). Ashbringer: *against undead, its damage is doubled **before Ward
 *   is subtracted***, which is why it cannot be an 08 §6 grant — every one of
 *   those adds, and adding lands after the SL. It multiplies what the blow is
 *   worth and mitigation then comes off the doubled number, in every lane.
 * @param {number} [o.schoolArmor]    Armor Points an ALLY'S AURA gives against
 *   this school (04's Avenging Bulwark, D-755): *friendly targets within 15
 *   feet gain your Armor Points against Shadow and Fel damage*. **Magical lane
 *   only, off the damage AFTER the Ward, and never off the Success Level** -
 *   the lead's reading: it is Armor Points, which 06 §4 takes off damage, and
 *   the Ward's double subtraction is D-300's alone. Vulnerable switches it off
 *   with the Ward (*Armor and Ward do not apply*). The target snapshot carries
 *   it (`system.schoolArmor`), because a spell's card records no damage type
 *   for `applyDamage` to read.
 * @returns {{damage: number, effectiveSL: number, hit: boolean, immune: boolean,
 *            vulnerable: boolean, mitigation: number, armor: number|null,
 *            penetration: number, ward: number|null, schoolArmor: number|null,
 *            auraAP: number|null, type: string|null}}  `mitigation` is the Ward
 *            or the Armor Points the LANE took off. **`schoolArmor` is what an
 *            ally's aura TOOK** after the Ward - never more than was left, and
 *            nothing at all on an Immune or a Vulnerable target (D-755's
 *            review: the card printed `3 − 5` for a blow of 3, and the flag
 *            recorded 5 against a target the aura had not touched) - and
 *            `auraAP` is the Armor Points it stood at, which the card names.
 *            Both are null on the physical lane.
 *
 * **`mitigation` alone cannot say WHY a number was what it was.** It is one
 * figure, and the card printed it with a bare minus sign: 4 off a blow reads
 * the same whether it was Armor Points, a Ward, or Armor Points with two
 * ignored by Pierce. `armor`, `penetration` and `ward` travel beside it so
 * `explainDamage` can name the lane, and they are null in the lane they do not
 * belong to rather than 0 - a target with AP 0 and a target with no armor lane
 * at all are different sentences.
 *
 * **WITH A SECOND AMOUNT** (`extras`, D-777) the result is the blow's own lane as
 * above, with `damage` the WHOLE of what lands, `mainDamage` the blow's own share
 * and `parts` one entry a further type - `{type, amount, damage, immune,
 * vulnerable, ward, armor, schoolArmor, wardTook}` - so the card can say each,
 * and the damage door can record each type the blow dealt. With none, the result
 * is exactly what it always was: no `parts`, no `mainDamage`.
 */
export function resolveDamage({
  rating = 0,
  sl = 0,
  kind = "physical",
  school = null,
  location = "body",
  apByLocation = {},
  penetration = 0,
  ward = 0,
  immune = [],
  vulnerable = [],
  slAddsToDamage = true,
  multiplier = 1,
  schoolArmor = 0,
  // **A SECOND AMOUNT OF ITS OWN TYPE** (D-777; the lead, 2026-10-03:
  // *"Different damage types in one attack are possible"*): `[{type, amount}]`,
  // each met by its OWN type - the Ward of its school, Immune, Vulnerable, and an
  // ally's aura after the Ward - off the target's whole maps beside the blow's.
  // An amount of the blow's own type rides its Rating (`typedExtras`).
  extras = [],
  wardBySchool = null,
  schoolArmorBySchool = null
} = {}) {
  const own = kind === "magical" ? school : "physical";
  const typed = typedExtras(extras, own);
  const main = resolveOne({
    rating: (Number(rating) || 0) + typed.merged, sl, kind, school, location, apByLocation, penetration, ward,
    immune, vulnerable, slAddsToDamage, multiplier, schoolArmor
  });
  if (!typed.extras.length) return main;
  const parts = typed.extras.map(x => extraPart(x, { immune, vulnerable, wardBySchool, schoolArmorBySchool, apByLocation, location }));
  return { ...main, damage: main.damage + parts.reduce((n, p) => n + p.damage, 0), mainDamage: main.damage, parts };
}

/**
 * **THE SECOND AMOUNTS, SORTED OUT** (D-777): an amount of the blow's own type
 * rides its Rating - two amounts of one type are one amount, met by one Ward,
 * never a Ward taken twice - and the rest add into one amount a type, in the
 * order they were named. Nothing at or below 0, and nothing with no type.
 *
 * @param {Array<{type: string|null, amount: number}>} extras
 * @param {string|null} own  the blow's own type: the school, or `physical`
 * @returns {{merged: number, extras: Array<{type: string, amount: number}>}}
 */
export function typedExtras(extras = [], own = "physical") {
  let merged = 0;
  const byType = new Map();
  for (const x of extras ?? []) {
    const amount = Math.max(0, Math.trunc(Number(x?.amount)) || 0);
    if (!amount) continue;
    const type = typeof x?.type === "string" && x.type ? x.type : null;
    if (!type || type === own) {
      merged += amount;
      continue;
    }
    byType.set(type, (byType.get(type) ?? 0) + amount);
  }
  return { merged, extras: [...byType.entries()].map(([type, amount]) => ({ type, amount })) };
}

/**
 * One second amount, met by its own type (D-777): Immune takes it all;
 * Vulnerable adds 2 and switches its mitigation off (06 §4); a school's Ward
 * comes off it once - it carries no Success Level for D-300's second
 * subtraction - and an ally's aura after the Ward (D-755); a physical amount
 * meets the Armor Points where the blow landed, with no Pierce and no Head bonus,
 * which are the weapon blow's own.
 */
function extraPart({ type, amount }, { immune = [], vulnerable = [], wardBySchool = null, schoolArmorBySchool = null, apByLocation = {}, location = "body" } = {}) {
  const base = { type, amount, immune: false, vulnerable: false, ward: null, armor: null, schoolArmor: 0, wardTook: 0 };
  if ((immune ?? []).includes(type)) return { ...base, damage: 0, immune: true };
  if ((vulnerable ?? []).includes(type)) return { ...base, damage: amount + VULNERABLE_DAMAGE_BONUS, vulnerable: true };
  if (type === "physical") {
    const ap = armorAt(apByLocation, location) ?? 0;
    return { ...base, armor: ap, damage: Math.max(0, amount - ap) };
  }
  const ward = Math.max(0, Math.trunc(Number(wardBySchool?.[type])) || 0);
  const afterWard = Math.max(0, amount - ward);
  const aura = Math.max(0, Math.trunc(Number(schoolArmorBySchool?.[type])) || 0);
  const taken = Math.min(aura, afterWard);
  return { ...base, ward, schoolArmor: taken, wardTook: amount - afterWard, damage: afterWard - taken };
}

/** The mitigation of ONE amount of ONE type: the whole of `resolveDamage` before D-777. */
function resolveOne({
  rating = 0,
  sl = 0,
  kind = "physical",
  school = null,
  location = "body",
  apByLocation = {},
  penetration = 0,
  ward = 0,
  immune = [],
  vulnerable = [],
  slAddsToDamage = true,
  multiplier = 1,
  schoolArmor = 0
} = {}) {
  // A multiplier under 1 would mean the opposite of itself, and 08 §20 doubles
  // and nothing else; anything smaller is no multiplier at all.
  const times = Number.isFinite(multiplier) && multiplier > 1 ? multiplier : 1;
  // The type is the school for magical damage and "physical" otherwise. Both
  // sit in the same keyword space (06 §4).
  const type = kind === "magical" ? school : "physical";
  const isImmune = type != null && immune.includes(type);
  const isVulnerable = type != null && vulnerable.includes(type);

  // Where the mitigation came from, for the card (D-711 phase 2). Physical
  // damage answers to Armor Points and Pierce; magical damage to a Ward, and to
  // what an ally's aura adds after it (D-755).
  const magical = kind === "magical";
  const lane = {
    type,
    armor: magical ? null : (armorAt(apByLocation, location) ?? 0),
    penetration: magical ? 0 : Math.max(0, penetration),
    ward: magical ? Math.max(0, ward) : null,
    // The Armor Points an ally's aura stands at in this school, and what it
    // took: nothing until the magical lane below works it out, so an Immune
    // and a Vulnerable result record that it took nothing (D-755's review).
    auraAP: magical ? Math.max(0, Math.trunc(Number(schoolArmor)) || 0) : null,
    schoolArmor: magical ? 0 : null
  };

  // Immunity does not care about Damage Rating, Success Level, or tier.
  if (isImmune) {
    return { damage: 0, effectiveSL: sl, hit: true, immune: true, vulnerable: false, mitigation: 0, ...lane };
  }

  // A called shot to the Head adds 2 before mitigation. Verified against
  // D-080's expected-damage table, which only reconciles if the +2 lands here.
  const headBonus = kind === "physical" && location === "head" ? HEAD_DAMAGE_BONUS : 0;
  const vulnBonus = isVulnerable ? VULNERABLE_DAMAGE_BONUS : 0;

  // Vulnerable switches mitigation off: "Armor and Ward do not apply."
  if (isVulnerable) {
    const damage = Math.max(0, times * (rating + (slAddsToDamage ? sl : 0) + headBonus) + vulnBonus);
    return { damage, effectiveSL: sl, hit: true, immune: false, vulnerable: true, mitigation: 0, ...lane };
  }

  if (kind === "magical") {
    const { effectiveSL, damage } = slAddsToDamage
      ? applyWard(rating, sl, ward, times)
      : spellDamage(rating, sl, ward, times);
    // **WHAT THE WARD TOOK OFF THIS BLOW** (D-774): the damage with no Ward less
    // the damage with it, so a door after the die can say whether the Ward
    // prevented anything - 04's Atonement (*When your Ward class feature prevents
    // damage*) and Absorption read it at the one damage door.
    const bare = slAddsToDamage ? applyWard(rating, sl, 0, times) : spellDamage(rating, sl, 0, times);
    const wardTook = Math.max(0, bare.damage - damage);
    // An aura's Armor Points come off what the Ward left, and the Success Level
    // never sees them (D-755). What they TOOK is never more than was left.
    const taken = Math.min(lane.auraAP, damage);
    return {
      damage: damage - taken,
      effectiveSL,
      hit: true,
      immune: false,
      vulnerable: false,
      mitigation: Math.max(0, ward),
      ...lane,
      schoolArmor: taken,
      wardTook
    };
  }

  const before = times * (rating + sl + headBonus);
  const ap = armorAt(apByLocation, location) ?? 0;
  const effectiveAP = Math.max(0, ap - Math.max(0, penetration));
  return {
    damage: Math.max(0, before - effectiveAP),
    effectiveSL: sl,
    hit: true,
    immune: false,
    vulnerable: false,
    mitigation: effectiveAP,
    ...lane
  };
}

/* -------------------------------------------- */
/*  Saying why the number was what it was        */
/* -------------------------------------------- */

/**
 * HOW THE DAMAGE GOT TO ITS NUMBER, in parts a card can print.
 *
 * This was three lines inside `dice/workflows.mjs#damageExplanation` and said
 * `5 + 2 − 3` with nothing to say what the 3 was. The reader could not tell
 * armor from a Ward, and a Pierce that had already eaten two Armor Points was
 * invisible - the card printed the REDUCED number and no word for why (the
 * lead's item 28).
 *
 * Keys and numbers only; the caller localises (CLAUDE.md §11).
 *
 * @param {object} result   what `resolveDamage` returned
 * @param {{rating?: number, sl?: number, slAddsToDamage?: boolean}} o
 * @returns {{parts: Array<{n: number, sign: "+"|"-"}>, immune: boolean,
 *            vulnerable: boolean, note: object|null, schoolArmor?: number}}
 *            Where an ally's aura took something off after the Ward (D-755),
 *            WHAT IT TOOK is a part of the sum of its own, and `schoolArmor` is
 *            the Armor Points it stands at, for the card to name beside it -
 *            the Ward's own shape, *− 1 · vs Ward 1*. A blow of 3 against an
 *            aura of 5 reads `3 − 3 · vs an ally's aura, AP 5`, which adds up;
 *            it read `3 − 5` (D-755's review).
 */
export function explainDamage(result = {}, { rating = 0, sl = 0, slAddsToDamage = true } = {}) {
  // **THE SECOND AMOUNTS, EACH IN ITS OWN WORDS** (D-777): the type, what landed
  // of it, and what met it - Immune, Vulnerable, a Ward - beside the blow's own
  // sum, on every return, since a blow Immune in its own type may still land a
  // second amount of another.
  const extras = (result.parts ?? []).map(p => ({
    n: Math.max(0, Math.trunc(Number(p.damage)) || 0), amount: Math.max(0, Math.trunc(Number(p.amount)) || 0),
    type: p.type, immune: p.immune === true, vulnerable: p.vulnerable === true,
    ward: p.ward !== null && p.ward !== undefined ? Math.max(0, Math.trunc(Number(p.ward)) || 0) : null,
    armor: p.armor !== null && p.armor !== undefined ? Math.max(0, Math.trunc(Number(p.armor)) || 0) : null
  }));
  const withExtras = out => (extras.length ? { ...out, extras } : out);
  if (result.immune) return withExtras({ parts: [], immune: true, vulnerable: false, note: null });
  const parts = [{ n: Math.max(0, Math.trunc(Number(rating)) || 0), sign: "+" }];
  // A spell's Success Level gates riders and never adds (D-330), so it is not
  // a part of the sum on that lane.
  if (slAddsToDamage) parts.push({ n: Math.trunc(Number(sl)) || 0, sign: "+" });
  if (result.vulnerable) {
    return withExtras({ parts, immune: false, vulnerable: true, note: { kind: "vulnerable", n: VULNERABLE_DAMAGE_BONUS } });
  }
  const mitigation = Math.max(0, Math.trunc(Number(result.mitigation)) || 0);
  if (mitigation > 0) parts.push({ n: mitigation, sign: "-" });
  // An ally's aura, after the Ward (D-755): what it TOOK is its own part, so the
  // card can say which number was the Ward and which was the Paladin, and the
  // sum adds up to the damage (D-755's review).
  const aura = Math.max(0, Math.trunc(Number(result.schoolArmor)) || 0);
  if (aura > 0) parts.push({ n: aura, sign: "-" });
  // The Armor Points it stands at, for the note. A result from before the
  // field carries none, and then the figure taken is the only one there is.
  const auraAP = Math.max(aura, Math.trunc(Number(result.auraAP)) || 0);
  // WHICH LANE took it off, and how much Pierce got through. A Ward lane and an
  // armor lane say different things; a physical blow against no armour at all
  // says nothing rather than `− 0`.
  let note = null;
  if (result.ward !== null && result.ward !== undefined) {
    note = result.ward > 0 ? { kind: "ward", ward: result.ward } : null;
  } else if (result.penetration > 0) {
    note = { kind: "pierce", ap: result.armor ?? 0, pierce: result.penetration };
  } else if (mitigation > 0) {
    note = { kind: "armor", ap: result.armor ?? mitigation };
  }
  return withExtras({ parts, immune: false, vulnerable: false, note, ...(aura > 0 ? { schoolArmor: auraAP } : {}) });
}

/**
 * WHAT THE BLOW IS ABOUT TO MEET, before the die (the lead's item 29). The
 * roll dialog draws it: *Damage 4 Fire · vs Ward 1*, *Damage 6 Physical · vs
 * AP 3 (− Pierce 2)*. Keys and numbers; the dialog localises.
 *
 * @param {{rating?: number, kind?: string, school?: string|null, penetration?: number}|null} damage
 * @param {{apByLocation?: object, wardBySchool?: object, schoolArmor?: object,
 *   immune?: string[], vulnerable?: string[]}|null} target
 * @param {{location?: string}} [o]
 * @returns {{rating: number, type: string, against: object|null}|null}  a Ward
 *   lane carries `schoolArmor` where an ally's aura adds some after it (D-755)
 */
export function describeDamage(damage, target = null, { location = "body" } = {}) {
  if (!damage) return null;
  const magical = damage.kind === "magical" && damage.school;
  const type = magical ? damage.school : "physical";
  const out = { rating: Math.trunc(Number(damage.rating) || 0), type, against: null };
  if (!target) return out;
  if ((target.immune ?? []).includes(type)) return { ...out, against: { kind: "immune" } };
  if ((target.vulnerable ?? []).includes(type)) return { ...out, against: { kind: "vulnerable" } };
  if (magical) {
    const ward = target.wardBySchool?.[damage.school] ?? 0;
    const aura = Math.max(0, Math.trunc(Number(target.schoolArmor?.[damage.school])) || 0);
    return { ...out, against: { kind: "ward", ward, ...(aura > 0 ? { schoolArmor: aura } : {}) } };
  }
  const ap = target.apByLocation?.[location] ?? 0;
  return { ...out, against: { kind: "armor", ap, pierce: Math.max(0, Math.trunc(Number(damage.penetration) || 0)) } };
}
