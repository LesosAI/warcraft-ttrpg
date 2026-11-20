/**
 * **THE GRAFTS THAT FIRE ON THEIR OWN** (07's Stitch Abomination's Meat Hook; 04's Surgeon's Hand:
 * Plague Bladder and Grasping Arms; the lead's Q7 of the 4b review, 2026-11-19: *"auto"*). Pure: no
 * Foundry imports (CLAUDE.md §3).
 *
 * The three were abilities the table pressed (O-414, now closed). The lead's reading: the creature
 * attack's hit asks the Body Resilience Test at the Necromancer's Spell DC and pulls or lays
 * Entangled, and the bladder asks each enemy starting its turn within 5 feet. This module says
 * which graft a hit or a turn start fires and what a failure lands; the door is
 * `effects/graft-riders.mjs`.
 *
 * - **Meat Hook** (07): *A creature the hook hits makes a Body Resilience Test against your Spell
 *   DC. On a failure it is pulled to the nearest unoccupied space adjacent to the Abomination.*
 * - **Grasping Arms** (04): *A creature it hits with a melee attack makes a Body Resilience Test
 *   against your Spell DC. On a failure it is **Entangled** until the end of its next turn.* A1's
 *   Entangled ends on *An action and a Reflex Resilience Test at DC 12, or at the DC the source
 *   names*, so the hold carries D-778's escape at the Spell DC.
 * - **Plague Bladder** (04): *Each enemy that starts its turn within 5 feet of it makes a Body
 *   Resilience Test against your Spell DC. On a failure that enemy is **Poisoned 1** against your
 *   Spell DC.*
 */

/** The attack row Meat Hook reaches with (`horde-stamps.mjs#CHAIN_HOOK`). */
export const HOOK_ATTACK = "Chain hook";

/** Each graft's rider: when it fires, the Test it asks, and what a failure lands. */
export const GRAFT_RIDERS = Object.freeze({
  meatHook: Object.freeze({ graft: "meatHook", on: "hit", attack: HOOK_ATTACK, resilience: "body", pull: true }),
  graspingArms: Object.freeze({ graft: "graspingArms", on: "hit", melee: true, resilience: "body", condition: "entangled", until: "endOfNextTurn", escape: Object.freeze({ on: "action", resilience: "reflex" }) }),
  plagueBladder: Object.freeze({ graft: "plagueBladder", on: "turnStart", within: 5, who: "enemy", resilience: "body", condition: "poisoned", value: 1 })
});

/** The order riders are read in (the entry's own order: 07's hook, then 04's arms). */
const HIT_ORDER = Object.freeze(["meatHook", "graspingArms"]);

/**
 * **WHAT ONE HIT FIRES**: the grafts the creature carries whose rider this hit meets - Meat Hook on
 * the Chain hook row, Grasping Arms on a melee hit. A miss fires nothing (the caller asks only on a
 * hit).
 *
 * @param {{grafts?: string[], attackName?: string, rangeKind?: string|null}} o
 * @returns {Array<object>}  `GRAFT_RIDERS` rows
 */
export function graftHitRiders({ grafts = [], attackName = "", rangeKind = null } = {}) {
  const held = new Set((grafts ?? []).map(String));
  const name = String(attackName ?? "").trim().toLowerCase();
  const out = [];
  for (const key of HIT_ORDER) {
    if (!held.has(key)) continue;
    const row = GRAFT_RIDERS[key];
    if (row.attack && name !== row.attack.toLowerCase()) continue;
    if (row.melee && rangeKind !== "melee") continue;
    out.push(row);
  }
  return out;
}

/**
 * **WHETHER PLAGUE BLADDER ASKS THIS CREATURE AT ITS TURN'S START**: the grafted creature carries
 * the bladder, stands, the creature starting its turn is its enemy (D-669's `countsAsEnemy`, the
 * caller's), and stands within 5 feet of it (footprint to footprint, D-732).
 *
 * @param {{grafts?: string[], standing?: boolean, enemy?: boolean, feet?: number|null}} o
 */
export function bladderAsks({ grafts = [], standing = true, enemy = false, feet = null } = {}) {
  if (!(grafts ?? []).includes("plagueBladder") || standing !== true || enemy !== true) return false;
  return typeof feet === "number" && Number.isFinite(feet) && feet <= GRAFT_RIDERS.plagueBladder.within + 1e-6;
}

/**
 * **THE SPELL DC THE GRAFT IS MADE AGAINST**: the Necromancer's Spell DC stamped on the creature at
 * the raise (`flags.azeroth-rpg.graftDC`), else the DC its graft ability carries (a creature raised
 * before the stamp), else null - and a Test with no DC is not asked.
 *
 * @param {{graftDC?: number|null, abilities?: Array<{automation?: {resist?: string|null, dc?: number|null}}>}} o
 * @returns {number|null}
 */
export function graftDC({ graftDC: stamped = null, abilities = [] } = {}) {
  const n = Math.trunc(Number(stamped));
  if (Number.isFinite(n) && n > 0) return n;
  for (const a of abilities ?? []) {
    const dc = Math.trunc(Number(a?.automation?.dc));
    if (a?.automation?.resist === "body" && Number.isFinite(dc) && dc > 0) return dc;
  }
  return null;
}

/**
 * **HOW FAR MEAT HOOK DRAGS** (*pulled to the nearest unoccupied space adjacent to the
 * Abomination*): the gap between the two footprints less the 5 feet adjacency leaves, never below
 * nothing. Null where the gap was not measured.
 *
 * @param {number|null} apart  `canvas/footprints.mjs#feetApart` between the two
 * @returns {number|null}
 */
export function hookPullFeet(apart = null) {
  const a = Number(apart);
  if (apart === null || apart === undefined || !Number.isFinite(a)) return null;
  return Math.max(0, Math.round(a) - 5);
}
