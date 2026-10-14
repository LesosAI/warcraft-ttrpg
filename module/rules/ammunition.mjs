/**
 * Ammunition, as 08 §7 states it (D-406, D-407, D-453; D-641). Pure: no Foundry.
 *
 *   The shot carries the damage and the launcher adds what it is worth,
 *   which for a bow is nothing: a hit deals the ammunition's Rating plus
 *   the launcher's plus the Success Level.
 *   Every arrow fits every bow. A bolt is cut to the groove and the Fits
 *   column says which; powder and shot go by the same rule.
 *   A bundle holds its Qty and one is marked off per shot. Recovering what
 *   was shot is the GM's call, and never automated.
 *   A launcher's or a thrown weapon's attack adds Dexterity; a melee
 *   attack adds Strength (06 §1, the lead's ruling of 2026-09-05).
 */

/** What a launcher is (08 §7's tables), and what a shot is cut to. */
export const LAUNCHER_KINDS = Object.freeze([
  "bow", "sling", "blowgun", "boulderSling", "crossbow", "heavyCrossbow", "handCrossbow", "firearm"
]);

/** Every launcher 08 §7 prints, by name, to its kind. The gnomish repeater sits in the crossbow table. */
export const LAUNCHER_NAMES = Object.freeze({
  "sling": "sling",
  "blowgun": "blowgun",
  "gordok boulder-sling": "boulderSling",
  "hunting bow": "bow",
  "shortbow": "bow",
  "recurve bow": "bow",
  "longbow": "bow",
  "farstrider's bow": "bow",
  "elven longbow": "bow",
  "hand crossbow": "handCrossbow",
  "light crossbow": "crossbow",
  "repeating crossbow": "crossbow",
  "gnomish repeater": "crossbow",
  "heavy crossbow": "heavyCrossbow",
  "arbalest": "heavyCrossbow",
  "flintlock pistol": "firearm",
  "blunderbuss": "firearm",
  "dwarven carbine": "firearm",
  "boomstick": "firearm",
  "dark iron hand cannon": "firearm",
  "rifle": "firearm"
});

/** 08 §7's Fits column, phrase by phrase; "Heavy crossbow, arbalest" is two phrases of one kind. */
export const FITS_WORDS = Object.freeze({
  "any bow": ["bow"],
  "sling": ["sling"],
  "blowgun": ["blowgun"],
  "boulder-sling": ["boulderSling"],
  "crossbow": ["crossbow"],
  "heavy crossbow": ["heavyCrossbow"],
  "arbalest": ["heavyCrossbow"],
  "hand crossbow": ["handCrossbow"],
  "firearm": ["firearm"]
});

/** A Fits cell to launcher kinds; a phrase the chapter never uses throws rather than fitting nothing in silence. */
export function parseFits(text) {
  const cell = String(text ?? "").trim();
  if (!cell || cell === "—" || cell === "-") return [];
  const out = [];
  for (const part of cell.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)) {
    const kinds = FITS_WORDS[part];
    if (!kinds) throw new Error(`08 §7: an ammunition row fits "${part}", which names no launcher kind`);
    for (const kind of kinds) if (!out.includes(kind)) out.push(kind);
  }
  return out;
}

/**
 * The launcher kind of a weapon named as 08 §7 names it, or null for anything
 * that does not shoot. A §20 unique names its base: Rhok'delar is a longbow.
 */
export function classifyLauncher({ name = "", base = null } = {}) {
  const key = String(name).trim().toLowerCase();
  if (LAUNCHER_NAMES[key]) return LAUNCHER_NAMES[key];
  const b = String(base ?? "").trim().toLowerCase();
  if (b) {
    for (const [launcher, kind] of Object.entries(LAUNCHER_NAMES)) if (b.includes(launcher)) return kind;
  }
  return null;
}

/** The highest Pierce among a list of traits (08 §5: Pierce X reduces the target's AP by X). */
export function pierceOf(traits = []) {
  let best = 0;
  for (const trait of traits ?? []) {
    const m = /^pierce\s+(\d+)$/i.exec(String(trait).trim());
    if (m) best = Math.max(best, Number(m[1]));
  }
  return best;
}

/**
 * Whether a weapon carries 08 §5's Thrown trait, which holds its distance
 * (D-531). **Carrying it is not being thrown** (D-731): the trait says a weapon
 * *may be thrown to the listed range*, so read `attackModes` for what a blow is.
 */
export function isThrown(weapon) {
  return (weapon?.traits ?? []).some(t => /^thrown\b/i.test(String(t).trim()));
}

/** The three ways a weapon is used to attack (D-731): in the hand, thrown, or shot. */
export const ATTACK_MODES = Object.freeze(["hand", "thrown", "shot"]);

/**
 * THE WAYS THIS WEAPON ATTACKS, the first being the one it takes where nothing
 * else decides (D-731).
 *
 * 06 §1: *the ability is Strength for a weapon in the hand and Dexterity for one
 * that shoots or is thrown.* 08 §5's Thrown: *MAY be thrown to the listed
 * range* - so a dagger carrying the trait is still a dagger in the hand, and
 * the attack door used to throw it at arm's reach. **The Range column is what
 * tells the two apart**, and the census over the whole weapons pack holds it:
 *
 * | Weapon | Ways |
 * |---|---|
 * | a launcher | shot |
 * | 08 §7's *Thrown weapons* table, which prints a Range beside the trait - a Javelin, a Dart, a Net - and a find on one of those bases | thrown |
 * | a hand weapon with the trait and no Range column - 08 §7's Dagger, Spear, Light hammer, Moonglaive and the rest of the Light and One-handed rows carrying it | hand, thrown |
 * | anything else printing a Range | shot |
 * | everything else | hand |
 *
 * @param {{launcher?: string|null, range?: number|null, traits?: string[]}} weapon
 * @returns {string[]}
 */
export function attackModes(weapon) {
  if (weapon?.launcher) return ["shot"];
  const ranged = weapon?.range !== null && weapon?.range !== undefined;
  if (isThrown(weapon)) return ranged ? ["thrown"] : ["hand", "thrown"];
  return ranged ? ["shot"] : ["hand"];
}

/** The way a blow is struck: the mode asked for where the weapon has it, else the weapon's first. */
export function attackModeOf(weapon, mode = null) {
  const modes = attackModes(weapon);
  return modes.includes(mode) ? mode : modes[0];
}

/**
 * The ability an attack adds (06 §1): Strength in the hand, Dexterity on a shot
 * or a throw. With no mode, the weapon's first - so a Dagger asked nothing is a
 * Dagger in the hand, and a Javelin is a throw because it has no other way.
 */
export function attackAbility(weapon, mode = null) {
  return attackModeOf(weapon, mode) === "hand" ? "str" : "dex";
}

/** A shot: it fits something and carries a Rating. Mill-ground powder fits a firearm and is not a shot. */
export function isShot(ammo) {
  return Array.isArray(ammo?.fits) && ammo.fits.length > 0 && ammo.rating !== null && ammo.rating !== undefined;
}

/** Whether a bundle is cut to this launcher. */
export function fits(launcher, ammo) {
  return Boolean(launcher?.launcher) && isShot(ammo) && ammo.fits.includes(launcher.launcher);
}

/** The bundles among `weapons` that fit the launcher, the ones with a shot left first, then by name. */
export function fittingBundles(launcher, weapons = []) {
  return weapons
    .filter(w => fits(launcher, w))
    .sort((a, b) => (Number((b.quantity ?? 0) > 0) - Number((a.quantity ?? 0) > 0)) || String(a.name).localeCompare(String(b.name)));
}

/**
 * The bundle a launcher fires: the one nocked (`launcher.ammunition`, an
 * owned item's id) while it fits and has a shot left, else the first
 * fitting bundle with a shot, else whatever fits, else nothing. Lenient on
 * purpose: a stored id whose bundle was spent or sold is not an error.
 */
export function selectAmmunition(launcher, bundles = []) {
  const stored = launcher?.ammunition ? bundles.find(b => b.id === launcher.ammunition) ?? null : null;
  if (stored && (stored.quantity ?? 0) > 0) return stored;
  return bundles.find(b => (b.quantity ?? 0) > 0) ?? stored ?? bundles[0] ?? null;
}

/** Whether the launcher can fire what it holds: nothing fits, or the bundle is empty. */
export function canFire(launcher, ammo) {
  if (!launcher?.launcher) return { ok: true, reason: null };
  if (!ammo) return { ok: false, reason: "noAmmunition" };
  if ((ammo.quantity ?? 0) <= 0) return { ok: false, reason: "empty" };
  return { ok: true, reason: null };
}

/**
 * The damage a hit deals before the Success Level: the shot's Rating plus
 * the launcher's where it has one, physical, with the higher Pierce of the
 * two as penetration (08 §5 says nothing about stacking; the higher stands).
 */
export function shotDamage(launcher, ammo) {
  return {
    rating: (ammo?.rating ?? 0) + (launcher?.rating ?? 0),
    kind: "physical",
    penetration: Math.max(pierceOf(launcher?.traits), pierceOf(ammo?.traits))
  };
}

/** One marked off per shot (D-407), never below nothing. */
export function spendShot(quantity) {
  return Math.max(0, (Math.trunc(Number(quantity)) || 0) - 1);
}
