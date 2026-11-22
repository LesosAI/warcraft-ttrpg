/**
 * **WHOSE CAST THE DEMON HUNTER'S SPELL DOORS CARRY, ASKED BEFORE THEIR MODULE LOADS** (07 §15, *Restricted
 * Demon Hunter*; the Demon Hunter plan's Phase 4b; D-1540). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The Necromancer's `necroCaster` and the Sovereign's `sovereignCaster` shape (D-1099, D-1243): a spell the
 * Demon Hunter ALONE holds - its **Restricted** line names no other class - is carried by the Demon Hunter
 * doors for any caster, a creature's Spells line included. A spell it SHARES (the ten Fel spells it borrows
 * from the Warlock: Felstep, Fel Armor, Banish, Soulchains, Hellquake, Demonhide, Nether Ward, Rend the Veil,
 * Demonheart, Chaosbrand) is carried only where the caster holds the Demon Hunter class - and none of the ten
 * has a Demon Hunter door, so the Warlock and the Demon Hunter cast them exactly as before.
 *
 * `dhSpellCast` is the hot path's predicate (`castSpell`, `rollResists`): the cast is in scope AND the spell is
 * one of the twenty the doors carry, so a borrowed spell never loads the module (the lessons' *dynamic import
 * costs about 1.2 s* finding).
 */

/** The class's name as 07's Restricted line and `system.classes` write it. */
export const DEMON_HUNTER = "Demon Hunter";

/**
 * **THE TWENTY SPELLS 07 §15 RESTRICTS TO THE DEMON HUNTER** (8 at tier 1, 6 at tier 2, 6 at tier 3), by
 * identifier in 07's order. The census (`demon-hunter-spells.test.mjs`) holds this list to the pack both ways.
 */
export const DH_OWN_SPELLS = Object.freeze([
  "hunters-brand", "searing-edge", "gaze-of-the-sightless", "spellsunder", "immolation-aura", "demon-spikes", "agonizing-flames", "call-the-glaives",
  "hellstrike", "siphon-the-weave", "unnatural-agility", "nether-snare", "eye-beam", "flame-crash",
  "hunting-ground", "devour-the-spell", "glaive-tempest", "shear", "draw-soul", "inner-demon"
]);

/** The ten Fel spells the Demon Hunter borrows from the Warlock (07 §15's Restricted line names both). */
export const DH_BORROWED_SPELLS = Object.freeze([
  "felstep", "fel-armor", "banish", "soulchains", "hellquake", "demonhide", "nether-ward", "rend-the-veil", "demonheart", "chaosbrand"
]);

/**
 * Whether the Demon Hunter doors carry this cast.
 *
 * @param {string[]} spellClasses   the spell's `system.classes`
 * @param {string[]} casterClasses  the caster's class names (`AzerothActor#classNames`); none for a creature
 */
export function demonHunterCaster(spellClasses = [], casterClasses = []) {
  const classes = Array.isArray(spellClasses) ? spellClasses : [];
  if (!classes.includes(DEMON_HUNTER)) return false;
  if (classes.every(c => c === DEMON_HUNTER)) return true;
  return (casterClasses ?? []).includes(DEMON_HUNTER);
}

/**
 * **THE CAST IS ONE A DEMON HUNTER DOOR CARRIES**: in scope (`demonHunterCaster`) and one of the twenty. The
 * card flag the Resist and Apply read (`demonHunterSpell`) is written only for such a cast.
 *
 * @param {{classes?: string[], identifier?: string}} sys  the spell's `system`
 * @param {string[]} casterClasses
 */
export function dhSpellCast(sys = {}, casterClasses = []) {
  return DH_OWN_SPELLS.includes(sys?.identifier) && demonHunterCaster(sys?.classes ?? [], casterClasses);
}

/** Whether a spell card's flags carry a Demon Hunter plan (the Resist door's guard, read before any import). */
export function dhCardFlags(flags = {}) {
  return Boolean(flags && flags.kind === "spell" && flags.demonHunterSpell && typeof flags.demonHunterSpell === "object");
}
