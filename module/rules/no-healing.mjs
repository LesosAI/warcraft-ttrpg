/**
 * **A CREATURE THAT RECOVERS NO HEALTH** (04's Mortal Strike: *On a hit, the
 * target recovers no Health from any source until the end of your next turn*;
 * D-772). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * Nothing in this system could say it: Graveblight HALVES what a creature
 * receives (D-757, `rules/auras.mjs#healingHalved`), and nothing stopped it.
 * The carrier is a FLAG on an Active Effect laid on the target by the blow -
 * no `system.changes`, because healing is no number on the sheet - and its
 * span is the striker's, keyed on the striker's combatant as a tick's
 * *until the end of your next turn* is (D-770). Both actor models derive
 * `system.healingBlocked` off it, and every door Health comes back through reads
 * that: `AzerothActor#applyHealing` (the one healing door: a spell, a feature,
 * a draught, a tick, a share), a creature's regeneration and a worn
 * Signature's Health at a turn's start. A rest is never inside a span this
 * short, and is left alone.
 */

/** The flag the mark rides on, under the system's own namespace. */
export const NO_HEALING_FLAG = "noHealing";

/**
 * Whether any ACTIVE effect on a creature blocks its healing, and the names of
 * what laid them. A switched-off effect blocks nothing (`ActiveEffect#active`).
 *
 * @param {Iterable<object>} effects
 * @returns {{blocked: boolean, by: string[]}}
 */
export function healingBlockedBy(effects = []) {
  const by = [];
  for (const effect of effects ?? []) {
    if (effect?.active === false || effect?.disabled === true) continue;
    const raw = effect?.flags?.["azeroth-rpg"]?.[NO_HEALING_FLAG] ?? null;
    if (!raw) continue;
    const name = typeof raw === "object" ? String(raw.source ?? "") : "";
    if (name && !by.includes(name)) by.push(name);
    else if (!name && !by.length) by.push("");
  }
  return { blocked: by.length > 0, by: by.filter(Boolean).sort() };
}

/** What a heal comes to on a creature that may or may not recover any. */
export function healingAfterBlock(amount, blocked = false) {
  if (blocked === true) return 0;
  return Math.max(0, Math.trunc(Number(amount)) || 0);
}
