/**
 * **07 §4's REST GATES, THE ONE HOME** (0.12.32; D-873's additions folded in by D-882): *a tier
 * 4 spell may be cast once, and not again until you finish a Short Rest*, and *a tier 5 spell
 * may be cast once, and not again until you finish a Long Rest*. Pure: no Foundry imports.
 *
 * The record is a counter per spell on the caster, `flags.azeroth-rpg.spellRestUses` =
 * `{[key]: {spent, per}}`, keyed by the spell's identifier: written on the active GM's client
 * with the cast's turn budget (`effects/spell-limits.mjs`), refreshed by the rest that opens
 * each gate, and given back one use at a time by 04's Recovered Hours and The Glass Turns Back.
 * **A player character's alone**: 07 §4, *These limits apply separately to each spell a player
 * character casts. NPCs and bosses are exempt.* Explicit limits in an entry still apply to its
 * casters, a creature included: 07's Ice Block once a Short Rest. Dispersion's extra casts by
 * rank are *a talent that grants additional castings*.
 *
 * D-873 had built a second record beside this one (`rules/spell-rests.mjs`, by spell name),
 * which refused a second cast with its own words while this one refused first, shut Dispersion
 * after one cast whatever its rank, bound a creature's Spells line against 07's own sentence
 * (D-881 then opened it at the fight's end), and was the only record Recovered Hours could
 * open - so a use it gave back was still refused here. D-882 folded it in and deleted it.
 */
export const SPELL_USES_FLAG = "spellRestUses";

/** The slug a spell's record is keyed by: its identifier, else its name. */
export function spellKey(spell) {
  return String(spell?.system?.identifier || spell?.identifier || spell?.name || "")
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function spellLimit({ type, spell, talents = [] } = {}) {
  const tier = Number(spell?.system?.tier ?? spell?.tier);
  const identifier = spellKey(spell);
  if (!identifier) return null;
  // 07's Tier 2 Ice Block explicitly permits one use between Short Rests.
  // Its rank-2 talent changes early ending, not the number of uses.
  if (["character", "npc"].includes(type) && identifier === "ice-block")
    return { key: identifier, max: 1, per: "short" };
  if (type !== "character" || ![4, 5].includes(tier)) return null;
  const rank = identifier === "dispersion" ? Math.max(0, ...talents
    .filter(t => t?.identifier === "dispersion" && String(t.className).toLowerCase() === "priest")
    .map(t => Math.min(2, Math.max(0, Number(t.taken) || 0)))) : 0;
  return { key: identifier, max: 1 + rank, per: tier === 4 ? "short" : "long" };
}

export function spellUsesRemaining(limit, uses = {}) {
  if (!limit) return null;
  return Math.max(0, limit.max - Math.max(0, Number(uses?.[limit.key]?.spent) || 0));
}

export function spendSpellUse(limit, uses = {}) {
  if (!limit || spellUsesRemaining(limit, uses) < 1) return null;
  return { ...uses, [limit.key]: { spent: (Number(uses?.[limit.key]?.spent) || 0) + 1, per: limit.per } };
}

export function resetSpellUses(uses = {}, event) {
  if (!["short", "long"].includes(event)) return { ...uses };
  return Object.fromEntries(Object.entries(uses).map(([key, row]) => [key,
    event === "long" || row?.per === "short" ? { ...row, spent: 0 } : { ...row }]));
}

/**
 * **ONE SPENT USE GIVEN BACK** (04's Recovered Hours and The Glass Turns Back: *regains one
 * spent use of a ... spell*). Null where the key has no spent use to give back.
 *
 * @param {object} uses
 * @param {string} key
 * @returns {object|null}
 */
export function restoreSpellUse(uses = {}, key = "") {
  const spent = Math.max(0, Number(uses?.[key]?.spent) || 0);
  if (!key || spent < 1) return null;
  return { ...uses, [key]: { ...uses[key], spent: spent - 1 } };
}

/** Every spell with a spent use, `{key, per}`, sorted by key: what a give-back may pick from. */
export function spentSpellUses(uses = {}) {
  return Object.entries(uses && typeof uses === "object" ? uses : {})
    .filter(([key, row]) => key && (Number(row?.spent) || 0) > 0 && ["short", "long"].includes(row?.per))
    .map(([key, row]) => ({ key, per: row.per }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
