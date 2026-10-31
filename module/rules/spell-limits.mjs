/** 07 §4 tier limits are per spell and character-only. Explicit limits in
 * individual spell entries still apply to their casters. */
export const SPELL_USES_FLAG = "spellRestUses";

export function spellLimit({ type, spell, talents = [] } = {}) {
  const tier = Number(spell?.system?.tier ?? spell?.tier);
  const identifier = String(spell?.system?.identifier || spell?.identifier || spell?.name || "")
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
