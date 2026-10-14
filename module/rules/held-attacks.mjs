/**
 * WHAT A CREATURE SWINGS WHEN SOMEBODY PUTS A WEAPON IN ITS HANDS (the lead's
 * N2, 2026-09-10). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * **The block's own rows are untouched.** 14 prints a lean stat block and every
 * number in it ORIGINATES there (D3 §7) — a Kobold's *Rusty dagger* is the
 * chapter's row and `npcAttackWithDialog` still resolves it exactly as it did.
 * An equipped weapon is an **ADDITIONAL row beside them**, and this module is
 * the law for what that row says and what the blow it makes is worth.
 *
 * **THE BONUS IS PROFICIENCY PLUS AN ABILITY MODIFIER, and that is measured
 * rather than assumed.** Over all 221 attack rows in the bestiary pack, 220
 * reconstruct as `1 + tier` plus one of the creature's own six modifiers — 153
 * Strength, 56 Dexterity, and 11 a caster attacking with its casting attribute
 * (Amnennar's Intelligence, Charlga's Charisma, the Fire Elemental's
 * Constitution). The single row that reconstructs from nothing is the **Searing
 * Totem**, which has no ability scores at all. `held-attacks.test.mjs` asserts
 * that census over the pack, so the day a block breaks the pattern the law fails
 * here instead of drifting.
 *
 * Only the ATTRIBUTE varies, so a held weapon needs no new rule for which one:
 * 06 §1 already says **Strength in the hand and Dexterity on a shot or a
 * throw**, which is `rules/ammunition.mjs#attackAbility` and is what the
 * character path has used since D-641. The row prints a weapon's FIRST way
 * (D-731): a Dagger that may be thrown is printed as the blow in the hand, and
 * the attack door throws it where the distance says so. On top of that sits the standing
 * `attackBonus` — what a passive ability grants (D-691) and what a worn thing's
 * `+N Attack` grants (D-692) — exactly as it sits on a block row.
 *
 * **A `—` ABILITY IS A ZERO HERE.** `data/actor/npc.mjs` keeps an absent score
 * as `null` on purpose (*a Mindless thing carries no Int*), and every reader has
 * to answer for it: the Searing Totem holds all six null and would hand `null`
 * to a card that prints a signed number. It reads as **no modifier**, never as a
 * 10 — a creature with no Strength does not swing like an average person, it
 * swings with nothing added, which is what its own printed Bonus already says.
 *
 * **A SHOT IS FIRED, NEVER SWUNG.** D-689 made Ammunition a slot, so a bundle
 * of arrows can be equipped; it is not an attack row. `attackWithDialog` fires
 * it through its launcher (D-641) and a row for *Arrows* beside *Claws* would be
 * noise on every archer in the bestiary.
 *
 * **WHERE EACH OF THESE IS READ**, because right code with no caller is this
 * repository's commonest real fault (CLAUDE.md §15):
 *
 * | | Read by |
 * |---|---|
 * | `heldRating` | `applications/actions.mjs#attackWithDialog`, on the blow itself |
 * | `heldAttackBonus` | the same door, composed as its three modifier lines; the row prints the sum |
 * | `heldAttackRow` / `heldAttackRows` / `swingable` | **the NPC sheet's attack list, which is the next phase's** — the block's rows are drawn from `system.attacks` in `npc-statistics.hbs` and the held ones join them there |
 *
 * `held-attacks.test.mjs` asserts the first two at their doors by reading the
 * caller's own statement, in `grant-doors.test.mjs`' shape.
 */

import { attackAbility, isShot } from "./ammunition.mjs";
import { thinnedRating } from "./swarm.mjs";

/** A live Item, a plain snapshot, or the system data itself. */
function systemOf(weapon) {
  return weapon?.system ?? weapon ?? {};
}

/** An integer or zero — a `—` score, an absent field and a string all read as none. */
function num(value) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : 0;
}

/**
 * The Attack Test's own bonus for a held weapon: `proficiency + the ability
 * modifier + whatever is standing`.
 *
 * This is the arithmetic 14 bakes into a printed row, composed rather than
 * stored — which is the character's shape too (`attackWithDialog` builds the
 * same three modifier lines at the door, because there is no stored number for
 * a grant to raise).
 *
 * @param {object} o
 * @param {number} [o.proficiency]   `1 + tier` on a creature, the class table's on a character
 * @param {number|null} [o.abilityMod]  `—` reads as none
 * @param {number} [o.attackBonus]   the standing `+N Attack` (D-691, D-692)
 */
export function heldAttackBonus({ proficiency = 0, abilityMod = 0, attackBonus = 0 } = {}) {
  return num(proficiency) + num(abilityMod) + num(attackBonus);
}

/**
 * The Damage Rating a held weapon deals before a Signature has its say: the
 * weapon's own, plus what the creature adds to every blow, thinned where the
 * swarm is.
 *
 * The ORDER is `npcAttackWithDialog`'s exactly — the bonus first and the Thinned
 * drop over the total (13 §4: *its Damage Rating drops by two*, which is the
 * blow's rating and not the weapon's) — so a swarm swinging a sword and a swarm
 * biting come out the same way. A `null` Rating stays null: a bow carries none
 * and the shot carries the damage (D-406).
 *
 * @param {object} o
 * @param {number|null} [o.rating]      the weapon's own Rating, or a shot's total
 * @param {number} [o.damageBonus]      `system.damageBonus` — a bond's, a passive's (D-643, D-691)
 * @param {boolean} [o.thinned]         the swarm is below half its Health (13 §4)
 * @returns {number|null}
 */
export function heldRating({ rating = null, damageBonus = 0, thinned = false } = {}) {
  if (rating === null || rating === undefined) return null;
  const full = num(rating) + num(damageBonus);
  return thinned === true ? thinnedRating(full) : Math.max(0, full);
}

/**
 * Whether this thing makes an attack row at all: a weapon being wielded, and
 * not a bundle of ammunition (which is fired by its launcher, D-641).
 *
 * Lenient about the shape for the reason `rules/carried-gear.mjs#isEquipped`
 * is: a live Item carries `system.equipped` and a snapshot carries `equipped`.
 */
export function swingable(weapon) {
  const sys = systemOf(weapon);
  const equipped = (weapon?.equipped ?? sys.equipped ?? false) === true;
  if (!equipped) return false;
  if (weapon?.type && weapon.type !== "weapon") return false;
  // A launcher fits nothing and IS swingable — a crossbow is a club at worst,
  // and 08 §7 gives it a Rating. What is refused is the bundle it fires.
  return !isShot(sys);
}

/**
 * One attack row for a weapon a creature is holding, in the shape
 * `npc-statistics.hbs` already draws a block row in: a name, a signed Bonus, a
 * Damage Rating or a dash, the 08 §5 traits, and a distance only where it shoots
 * (D-531 — melee is assumed and carries none).
 *
 * `itemId` is what tells the sheet's click apart from a block row's index, and
 * `ability` is there so a row can say WHY its Bonus is what it is.
 *
 * @param {object} weapon    a live Item or a snapshot
 * @param {object} creature  `actor.system` — `{proficiency, attackBonus, damageBonus, thinned, abilities}`
 */
export function heldAttackRow(weapon, creature = {}) {
  const sys = systemOf(weapon);
  const ability = attackAbility(sys);
  return {
    itemId: weapon?.id ?? weapon?._id ?? null,
    name: weapon?.name ?? "",
    ability,
    bonus: heldAttackBonus({
      proficiency: creature.proficiency,
      abilityMod: creature.abilities?.[ability]?.mod,
      attackBonus: creature.attackBonus
    }),
    damage: heldRating({ rating: sys.rating ?? null, damageBonus: creature.damageBonus, thinned: creature.thinned }),
    traits: [...(sys.traits ?? [])],
    range: sys.range ?? null,
    // The off hand is the weapon's own flag (D-409); the -2 is `rollTest`'s and
    // is never in the printed Bonus, exactly as the called shot's is not.
    offHand: sys.offHand === true,
    thinned: creature.thinned === true
  };
}

/**
 * Every held weapon's row, sorted by name so a list a person reads does not
 * wobble between renders (CLAUDE.md §15: an embedded collection's order is not
 * stable across a re-sync).
 */
export function heldAttackRows(items = [], creature = {}) {
  return items
    .filter(i => (i?.type ?? "weapon") === "weapon" && swingable(i))
    .map(i => heldAttackRow(i, creature))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
