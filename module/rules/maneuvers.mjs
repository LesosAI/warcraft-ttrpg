/**
 * The Momentum maneuvers (05 SS11, 06 SS7; D-626): what each costs once the
 * character's features, talents and worn grants have moved the price, what
 * a Sunder takes off, and the size note Overbear carries. Pure: no Foundry.
 *
 * Cost modifiers the book states:
 *  - Sunder Armor (Warrior feature): Sunder costs 3 instead of 4 (the class talent audit, D-1871).
 *  - Deflecting at Greater grade (08 SS6): Riposte costs 2.
 *  - Return Stroke (talent, the Blademaster's): Riposte costs 2 less per rank.
 *  - Charge (Warrior feature): the first Overbear or Sunder each encounter
 *    costs nothing and grants 1 Rage.
 * Wild Bond is the companion's Sunder, not a price, and is not here.
 */

import { AZEROTH } from "../config.mjs";
import { resistsForcedMovement, rung } from "./size.mjs";
import { maneuverPriceOf } from "./maneuver-pool.mjs";

const BASE = Object.fromEntries(AZEROTH.maneuvers.map(m => [m.key, m.cost]));

/** 02 §7's Sunder Armor: *Your Sunder costs 3 Rage instead of 4* (the class talent audit's A2, D-1871). */
export const SUNDER_ARMOR_COST = 3;

/** Ranks taken of a named talent, off `{name, taken}` rows. */
function ranksOf(talents, name) {
  return talents.filter(t => t?.name === name).reduce((n, t) => n + (Number(t.taken) || 0), 0);
}

/**
 * @param {string} key
 * @param {object} [ctx]
 * @param {{name: string}[]} [ctx.features]
 * @param {{name: string, taken: number}[]} [ctx.talents]
 * @param {string[]} [ctx.grants]           Worn affix grants, as strings.
 * @param {boolean} [ctx.chargeAvailable]   Charge held, with a use left.
 * @returns {{key: string, base: number, cost: number, gain: number, rows: {name: string, cost: number}[]}|null}
 *   `rows` names each modifier and the cost after it, for the row's detail.
 */
export function maneuverCost(key, { features = [], talents = [], grants = [], chargeAvailable = false, riposteFree = null } = {}) {
  const base = BASE[key];
  if (base === undefined) return null;
  let cost = base;
  let gain = 0;
  const rows = [];
  const held = new Set(features.map(f => f?.name));
  // **SUNDER ARMOR AT 3** (the class talent audit's A2, D-1871: *Your Sunder costs 3 Rage instead of
  // 4*). Sundering Blows no longer prices the Sunder: it pays off a hit on a sundered target
  // (`rules/audit-martial.mjs#SUNDERING_BLOWS`).
  if (key === "sunder" && held.has("Sunder Armor")) {
    cost = Math.min(cost, SUNDER_ARMOR_COST);
    rows.push({ name: "Sunder Armor", cost });
  }
  if (key === "riposte" && grants.some(g => /Deflecting \(Greater\)/i.test(String(g)))) {
    cost = Math.min(cost, 2);
    rows.push({ name: "Deflecting (Greater)", cost });
  }
  // **04's RETURN STROKE** (the Legacy branches' B6: *Your Riposte costs 2 Rage less per
  // rank*; the lead, phase 0: *"Keep it free"* - rank 2's Riposte costs nothing): off
  // whatever price stands once a price is set, never below nothing - Sundering Blows'
  // order, the setter before the reducer (MY READING, for the lead).
  if (key === "riposte") {
    const stroke = ranksOf(talents, "Return Stroke");
    if (stroke > 0) {
      cost = Math.max(0, cost - 2 * stroke);
      rows.push({ name: "Return Stroke", cost });
    }
  }
  // **04's SPLITTING BLOW AND HUNTER'S RIPOSTE** (the Witch Hunter's Bear and Cat: *Your **Sunder** costs 1 Tempo less
  // per rank*; *Your **Riposte** costs 1 Tempo less per rank, to a minimum of 1*; the Witch Hunter plan's wave 2b):
  // off whatever price stands, never below 1 (the plan's door note: floor 1 for both).
  if (key === "sunder") {
    const split = ranksOf(talents, "Splitting Blow");
    if (split > 0 && cost > 1) {
      cost = Math.max(1, cost - split);
      rows.push({ name: "Splitting Blow", cost });
    }
  }
  if (key === "riposte") {
    const hunters = ranksOf(talents, "Hunter's Riposte");
    if (hunters > 0 && cost > 1) {
      cost = Math.max(1, cost - hunters);
      rows.push({ name: "Hunter's Riposte", cost });
    }
  }
  // **02's RUNIC DISCIPLINE** (*Each maneuver costs you 1 Runic Power, whatever its listed
  // price*): the price a held feature sets, never above what the rows above made it.
  const set = maneuverPriceOf(features);
  if (set !== null && cost > set) {
    cost = set;
    rows.push({ name: features.find(f => f?.maneuverPrice === set)?.name ?? "", cost });
  }
  if (chargeAvailable && (key === "sunder" || key === "overbear")) {
    cost = 0;
    gain = 1;
    rows.push({ name: "Charge", cost: 0 });
  }
  // **04's COMBAT REFLEXES** (*Once a round, your Riposte costs no Combo Points*; the class
  // talent audit, D-1882): the talent's name where the door found the round's free one
  // unspent, and the price nothing. `free` names it, so the door claims the round.
  let free = null;
  if (key === "riposte" && typeof riposteFree === "string" && riposteFree && cost > 0) {
    cost = 0;
    free = riposteFree;
    rows.push({ name: riposteFree, cost: 0 });
  }
  return { key, base, cost, gain, rows, ...(free ? { free } : {}) };
}

/** Armor Points a Sunder takes off: one, plus one per rank of Rend Armor. */
export function sunderAmount(talents = []) {
  return 1 + ranksOf(talents, "Rend Armor");
}

/** The Sundered effect's changes: the amount off every location, in the final phase. */
export function sunderedChanges(amount = 1) {
  const n = Math.max(1, Math.trunc(Number(amount)) || 1);
  return ["body", "head", "limb"].map(location => ({ key: `system.ap.${location}`, type: "add", value: -n, phase: "final" }));
}

/**
 * Overbear's size note (05 SS11: "Take a Boon if you are larger than it and
 * a Bane if you are smaller") and 05 SS10's limit on being moved.
 * @returns {{boons: number, banes: number, immovable: boolean}}
 */
export function sizeNote(userSize = "medium", targetSize = "medium", { targetResist = null } = {}) {
  const u = rung(userSize);
  const t = rung(targetSize);
  return {
    boons: u > t ? 1 : 0,
    banes: u < t ? 1 : 0,
    // 05's *Being moved* reads the size the target RESISTS at: 08 §20's King's Frame
    // counts an ogre one size larger for it (D-912), and the maneuver says so (D-914).
    immovable: resistsForcedMovement(targetResist ?? targetSize, userSize)
  };
}
