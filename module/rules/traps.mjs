/**
 * **A STANDING TRAP** (the Legacy branches' door 26: 04's Shadow Trap). Pure: no
 * Foundry imports (CLAUDE.md §3).
 *
 * 04's Shadow Trap: *As a Half-Action, spend 3 Energy and set a trap at a point
 * within 30 feet. The first enemy to come within 5 feet of it is **Entangled** until
 * it spends an action and passes a Reflex Resilience Test against your Spell DC. One
 * may stand at a time, or two at rank 2.*
 *
 * - **The trap is a Region**, a circle of its radius on the point picked within the
 *   feet (`canvas/place.mjs#pickPoint`, refused in words past them), flagged
 *   `TRAP_FLAG` with the setter, the condition and the escape the Use resolved at
 *   its Spell DC (door 19's record, `rules/escapes.mjs#featureEscapeRecord`).
 * - **The first enemy to come within it springs it**: entering is read off the
 *   move's own path (`effects/area-strikes.mjs#enterAreas`, the door every area's
 *   entry already goes through, D-757), the condition is laid through the one
 *   landing door with its escape (`effects/inflict.mjs`), and the trap is gone -
 *   *the first*. An ally of the setter walks through it untouched.
 * - **A fight or not** (the lead, 2026-10-22: *"Also outside a fight"*): the trap
 *   springs on the first enemy whose move enters it whether or not a fight has
 *   started - who is an enemy is then the tokens' sides (`countsAsEnemy`, FRIENDLY
 *   against HOSTILE) - and the condition and its escape record are laid exactly as
 *   inside one. It had caught nothing out of a fight (B2's reading).
 * - **One may stand at a time, or two at rank 2**: setting one past the count takes
 *   up the oldest of the setter's own traps of that talent (`trapsToLift`).
 */

/** The Region flag a trap stands under. */
export const TRAP_FLAG = "trap";

/** Who springs a trap: the setter's enemies. */
export const TRAP_WHO = Object.freeze(["enemy"]);

/**
 * **A TALENT'S TRAP AT ITS RANK** (`onUse.trap`): the feet the point may lie from
 * the setter, the trap's radius, the condition it lays and its escape, and how many
 * of the setter's may stand. Null where the Use sets none.
 *
 * @param {{trap?: object}|null} onUse
 * @param {number} [rank]
 * @returns {{within: number, radius: number, condition: string, escape: object|null, standing: number}|null}
 */
export function trapOf(onUse, rank = 1) {
  const raw = onUse?.trap;
  if (!raw || typeof raw !== "object") return null;
  const r = Math.trunc(Number(rank)) || 1;
  const merged = { ...raw };
  for (const clause of Array.isArray(raw.atRank) ? raw.atRank : []) {
    if (r >= (Math.trunc(Number(clause?.rank)) || Infinity)) {
      const { rank: _r, ...rest } = clause;
      Object.assign(merged, rest);
    }
  }
  const within = Math.trunc(Number(merged.within));
  const radius = Math.trunc(Number(merged.radius));
  if (!(within > 0) || !(radius > 0) || typeof merged.condition !== "string" || !merged.condition) return null;
  const escape = merged.escape && typeof merged.escape === "object"
    ? { on: merged.escape.on ?? null, resilience: merged.escape.resilience ?? null, dc: merged.escape.dc ?? null, banes: Math.max(0, Math.trunc(Number(merged.escape.banes)) || 0) }
    : null;
  return { within, radius, condition: merged.condition, escape, standing: Math.max(1, Math.trunc(Number(merged.standing)) || 1) };
}

/** The area words a trap's Region is drawn from, in 07 §9's phrasing. */
export function trapArea(radius) {
  return `A ${Math.max(1, Math.trunc(Number(radius)) || 5)} ft radius on the ground`;
}

/**
 * A trap's flag, cleaned: the setter, the talent, the condition, its escape record,
 * who springs it and when it was set. Null where it names no setter or condition.
 *
 * @param {unknown} raw
 * @returns {{setter: string, identifier: string|null, source: string, condition: string, escape: object|null, who: string, setAt: number}|null}
 */
export function cleanTrap(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.setter !== "string" || !raw.setter || typeof raw.condition !== "string" || !/^[a-z]+$/.test(raw.condition)) return null;
  return {
    setter: raw.setter,
    identifier: typeof raw.identifier === "string" && raw.identifier ? raw.identifier : null,
    source: typeof raw.source === "string" ? raw.source : "",
    condition: raw.condition,
    escape: raw.escape && typeof raw.escape === "object" ? { ...raw.escape } : null,
    who: TRAP_WHO.includes(raw.who) ? raw.who : "enemy",
    setAt: Math.trunc(Number(raw.setAt)) || 0
  };
}

/**
 * **WHICH OF THE SETTER'S TRAPS COME UP** for one more to stand: the oldest of the
 * setter's own traps of this talent past `standing - 1`, so the new one makes the
 * count. Ids, oldest first.
 *
 * @param {Array<{id: string, trap: object}>} held  the scene's trap Regions, as `{id, trap}`
 * @param {{setter: string, identifier?: string|null, standing: number}} o
 * @returns {string[]}
 */
export function trapsToLift(held = [], { setter, identifier = null, standing = 1 } = {}) {
  const mine = (held ?? [])
    .map(h => ({ id: h?.id, trap: cleanTrap(h?.trap) }))
    .filter(h => h.id && h.trap && h.trap.setter === setter && (identifier === null || h.trap.identifier === identifier))
    .sort((a, b) => (a.trap.setAt - b.trap.setAt) || String(a.id).localeCompare(String(b.id)));
  const keep = Math.max(0, (Math.trunc(Number(standing)) || 1) - 1);
  return mine.slice(0, Math.max(0, mine.length - keep)).map(h => h.id);
}

/**
 * Whether a creature entering springs the trap: one of the setter's enemies, and
 * not the setter - and never a token the GM has hidden (the B3 review): a hidden
 * token is the GM's staging, off the board for the players, and a sprung trap's line
 * named it in chat. D-717's Hide (core's `invisible` status) is no such thing: a
 * creature hiding still walks into a trap.
 *
 * @param {object} trap  `cleanTrap`'s
 * @param {{relation?: "self"|"ally"|"enemy"|"other", hidden?: boolean}} o  who the mover is to the setter,
 *   and whether its token is the GM's hidden one
 */
export function springs(trap, { relation = "other", hidden = false } = {}) {
  if (!trap) return false;
  if (hidden === true) return false;
  if (relation === "self") return false;
  return trap.who === "enemy" ? relation === "enemy" : false;
}
