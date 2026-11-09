/**
 * **THE POOL A UNIVERSAL MANEUVER IS PAID FROM** (06 §6 and §7; the Chromatic Champion
 * plan's Draconic Discipline, the lead: paying maneuvers in Energy is *"a level 1 class
 * feature for this class"*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * 06 prices every universal maneuver in Momentum - the called shot, Press, Sunder,
 * Overbear, Disarm, Drive Back, Riposte - and a Parry at 1 Momentum (a Rogue pays 1
 * Energy, D-720). A class feature carrying `maneuverPool` sends ALL of them to that pool
 * at the printed price. **It is read off the FEATURE the character holds, never the
 * class's name**: the feature's row in `rules/class-features.mjs` stamps it, and a
 * character who holds no such feature pays Momentum exactly as before.
 *
 * The readers: `reactions.mjs#parryPoolFor` (the Parry), `AzerothActor#momentumPayer`
 * (the called shot's Momentum and every maneuver `useManeuver` prices).
 */

/**
 * The maneuver pool a set of held features names, or null for Momentum. Read in name
 * order, so two features naming two pools always give the same answer.
 *
 * @param {Array<{name?: string, maneuverPool?: string|null}>} features  the character's feature items, as plain rows
 * @returns {string|null}
 */
export function maneuverPoolOf(features = []) {
  const named = (features ?? [])
    .filter(f => typeof f?.maneuverPool === "string" && f.maneuverPool)
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
  return named[0]?.maneuverPool ?? null;
}

/**
 * The pool row a maneuver is paid from under a named maneuver pool: the pool of that
 * name, a Power pool first where two carry it. Null where the character holds none.
 *
 * @param {Array<{kind: string, name: string|null, value: number, max: number}>} pools  `poolSnapshot` rows
 * @param {string|null} maneuverPool
 * @returns {object|null}
 */
export function maneuverPurse(pools = [], maneuverPool = null) {
  if (typeof maneuverPool !== "string" || !maneuverPool) return null;
  const named = (pools ?? []).filter(p => p?.name === maneuverPool);
  return named.find(p => p.kind === "power") ?? named[0] ?? null;
}
