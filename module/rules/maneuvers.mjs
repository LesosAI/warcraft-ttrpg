/**
 * The Momentum maneuvers (05 SS11, 06 SS7; D-626): what each costs once the
 * character's features, talents and worn grants have moved the price, what
 * a Sunder takes off, and the size note Overbear carries. Pure: no Foundry.
 *
 * Cost modifiers the book states:
 *  - Sunder Armor (Warrior feature): Sunder costs 2 instead of 4.
 *  - Sundering Blows (talent): Sunder costs 2 less per rank, to a minimum of 2.
 *  - Deflecting at Greater grade (08 SS6): Riposte costs 2.
 *  - Charge (Warrior feature): the first Overbear or Sunder each encounter
 *    costs nothing and grants 1 Rage.
 * Wild Bond is the companion's Sunder, not a price, and is not here.
 */

import { AZEROTH } from "../config.mjs";
import { resistsForcedMovement, rung } from "./size.mjs";

const BASE = Object.fromEntries(AZEROTH.maneuvers.map(m => [m.key, m.cost]));

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
export function maneuverCost(key, { features = [], talents = [], grants = [], chargeAvailable = false } = {}) {
  const base = BASE[key];
  if (base === undefined) return null;
  let cost = base;
  let gain = 0;
  const rows = [];
  const held = new Set(features.map(f => f?.name));
  if (key === "sunder") {
    if (held.has("Sunder Armor")) {
      cost = Math.min(cost, 2);
      rows.push({ name: "Sunder Armor", cost });
    }
    const blows = ranksOf(talents, "Sundering Blows");
    if (blows > 0) {
      cost = Math.max(2, cost - 2 * blows);
      rows.push({ name: "Sundering Blows", cost });
    }
  }
  if (key === "riposte" && grants.some(g => /Deflecting \(Greater\)/i.test(String(g)))) {
    cost = Math.min(cost, 2);
    rows.push({ name: "Deflecting (Greater)", cost });
  }
  if (chargeAvailable && (key === "sunder" || key === "overbear")) {
    cost = 0;
    gain = 1;
    rows.push({ name: "Charge", cost: 0 });
  }
  return { key, base, cost, gain, rows };
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
export function sizeNote(userSize = "medium", targetSize = "medium") {
  const u = rung(userSize);
  const t = rung(targetSize);
  return {
    boons: u > t ? 1 : 0,
    banes: u < t ? 1 : 0,
    immovable: resistsForcedMovement(targetSize, userSize)
  };
}
