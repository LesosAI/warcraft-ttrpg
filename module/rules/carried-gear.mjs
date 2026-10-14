/**
 * What a creature is CARRYING, added to 14's printed block (the lead's N1,
 * 2026-09-10). Pure functions, no Foundry imports (CLAUDE.md §3).
 *
 * **GEAR ADDS TO THE BLOCK.** 14 prints a lean stat block and every number in
 * it ORIGINATES there (D3 §7) — Health, Defense, Armor Points, Ward, an
 * attack's Bonus. A suit a GM hands a Kobold does not replace any of them: the
 * block is still what the creature is, and the same section says *the book is
 * the source of truth for how and why; Foundry is the source of truth for
 * current state and computation*, which is what lets worn gear move a current
 * number without the block and the sheet disagreeing.
 *
 * So everything here returns a **DELTA**, and the model adds it to whatever is
 * already on the number. That is not a stylistic preference:
 * `CharacterData#prepareDerivedData` may ASSIGN `this.ap` because a character
 * has no printed Armor Points to erase, and `NpcData` may not — an assignment
 * there writes back over the standing passive applied a few lines earlier AND
 * over every `initial`-phase Active Effect on the same field, which is D-691's
 * exact scar — `this.ap.body = _source.ap.body + passive` cost a bound wolf its
 * Hardy Companion point, and it was left in `data/actor/npc.mjs`, the one
 * caller of everything here.
 *
 * **`null` MEANS THE CREATURE HAS NO SUCH LOCATION** (06 §2, `npc.mjs`'s own
 * header): an ooze prints a Body line alone and `0` means *has one, unarmored*.
 * `addArmorPoints` is the one place that rule is enforced, because a helmet
 * dropped on an ooze must not give it a head to shoot at — `hasLocation` is
 * what 06 §2's called shots read, and a null turning into a number silently
 * opens two new places to aim.
 */

import { LOCATIONS, suitEffects } from "./armor.mjs";
import { grantsFor, grantsOn } from "./grants.mjs";
import { wardFor } from "./ward.mjs";

/**
 * Whether a thing is being worn or wielded. Lenient about the shape for the
 * same reason `grantsOn` is: a live Item carries `system.equipped` and a plain
 * snapshot in a test or a parser carries `equipped` on itself.
 */
function isEquipped(item) {
  return (item?.equipped ?? item?.system?.equipped ?? false) === true;
}

/** The suit being worn: armor that is not a shield (08 §8). */
export function equippedSuit(items = []) {
  return items.find(i => i?.type === "armor" && isEquipped(i) && !i?.system?.shield) ?? null;
}

/** The shield being carried (08 §8's twelve, D-636). */
export function equippedShield(items = []) {
  return items.find(i => i?.type === "armor" && isEquipped(i) && i?.system?.shield) ?? null;
}

/**
 * The armor being worn and what its category makes of it, in one call — the
 * three lines `CharacterData` writes inline (D-452's Defense, the Cuts' Banes,
 * Encumbering's Speed cost and the Armor Points), so a caller that wants more
 * than the points does not have to find the suit a second time.
 *
 * @param {Array} items
 * @returns {{suit: object|null, shield: object|null, effects: object}}
 */
export function wornSuitEffects(items = []) {
  const suit = equippedSuit(items);
  const shield = equippedShield(items);
  return {
    suit,
    shield,
    // "none" is the category with no suit at all, and its row in config's
    // ARMOR_AP table is three zeros — a creature wearing nothing takes nothing.
    effects: suitEffects(suit?.system?.category ?? "none", suit?.system?.cuts ?? [], { shield: Boolean(shield) })
  };
}

/**
 * The Armor Points what is WORN adds, by location. All three are zero where
 * nothing is worn, which is what keeps 14's 164 creatures exactly as they are.
 *
 * Three sources, all of them 08's and all of them landing where the character's
 * own model puts them:
 *  - the suit's category row, moved by its Cuts (08 §8);
 *  - `apBonus` on the suit and on the shield — a named suit's margin over its
 *    category, a Reinforced prefix and a shield's own points all ride there
 *    (D-632), and 08 §20 prints them on the **Body**;
 *  - a Signature's `armorPointsPerTier` scaled by the bearer's tier (Stormrage
 *    Raiment, D-696), which the character consumes and the creature ignored.
 *
 * @param {Array} items
 * @param {object} [p]
 * @param {number} [p.armorPointsPerTier]  `signatureEffects().armorPointsPerTier`
 * @param {number} [p.tier]                the bearer's tier
 * @returns {{body: number, head: number, limb: number}}
 */
export function wornArmorPoints(items = [], { armorPointsPerTier = 0, tier = 1 } = {}) {
  const { suit, shield, effects } = wornSuitEffects(items);
  const points = {};
  for (const key of LOCATIONS) points[key] = Number(effects.armorPoints[key]) || 0;
  points.body += (Number(suit?.system?.apBonus) || 0) + (Number(shield?.system?.apBonus) || 0);
  points.body += (Number(armorPointsPerTier) || 0) * (Number(tier) || 1);
  return points;
}

/**
 * Armor Points with a delta added, **only where the location is a number**.
 *
 * A `null` location is *this creature has no such place* and stays null however
 * much armor is dropped on it. The input is never mutated: the caller assigns
 * the result, so a second data preparation starts from the same stored map.
 *
 * @param {Record<string, number|null>} ap
 * @param {Record<string, number>} added
 * @returns {Record<string, number|null>}
 */
export function addArmorPoints(ap = {}, added = {}) {
  const out = { ...ap };
  for (const key of Object.keys(out)) {
    if (out[key] === null || out[key] === undefined) continue;
    const n = Number(added?.[key]) || 0;
    if (n) out[key] = Math.max(0, out[key] + n);
  }
  return out;
}

/**
 * Everything the equipped things GRANT (08 §6's sentences and 08 §20's
 * Signatures), summed by family — `rules/grants.mjs#grantsFor`'s own bag.
 *
 * One door rather than the two lines inline, so the test that says a creature
 * carrying nothing is unchanged reads the same function the model calls
 * instead of re-typing its arithmetic.
 *
 * @param {Array} items    every item the actor holds
 * @param {object} bearer  `AzerothActor#signatureState`; a gated Signature
 *                         grants nothing without one, which is right
 */
export function wornGrants(items = [], bearer = {}) {
  return grantsFor(items.map(i => ({
    equipped: isEquipped(i),
    name: i?.name ?? "",
    grants: grantsOn(i, bearer)
  })));
}

/**
 * The Ward the equipped things grant, by school (08 §6's suffix, §10's
 * *Warded cloak*).
 *
 * A SIXTH family, and it is not in `grantsFor`'s bag: `rules/ward.mjs` has its
 * own reader and its own sentence, because a character's whole Ward is derived
 * from what is worn while every other family adds to something. The creature
 * adds it to the block's own row.
 *
 * @returns {Record<string, number>}  every school, most of them at 0
 */
export function wornWard(items = [], bearer = {}) {
  return wardFor(items.map(i => ({ equipped: isEquipped(i), grants: grantsOn(i, bearer) })));
}
