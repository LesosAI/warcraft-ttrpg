/**
 * **GRAFTS: ESSENCE SPENT AT THE CAST TO BUILD A SERVANT** (07's Stitch Abomination, 04's Flesh
 * branch; the Necromancer plan's *Building the Abomination*). Pure: no Foundry imports
 * (CLAUDE.md §3).
 *
 * The lead, verbatim: *"I'd like Flesh to focus on non-skeltal undead and "building their own
 * Abomination" they can give specific attacks, ward, health bonuses by spending essence at the
 * cast as an example. Summoning an abomination should require a corpse or enough raw material,
 * enforced by the GM not automation/code."* Then **a graft menu at the cast, 1 Essence a
 * graft**, and on Practiced Stitcher *"change to one less essence per rank"*.
 *
 * What it holds, for the graft door (the plan's Phase 4 door 15):
 * - `GRAFTS`: the base four on Stitch Abomination and Surgeon's Hand's three, each with its
 *   stamp - what the door writes on the linked actor at the raise;
 * - `graftMenu`: which grafts a raise offers, how many, and how often each;
 * - `graftPrice`: the Essence the picks cost, less Practiced Stitcher's discount;
 * - `graftPlan`: the picks judged whole before anything is paid (D-768's order);
 * - `graftStamps`, `combinedStamps`: the descriptors the door lays.
 *
 * **The material is never judged here** (the lead: *"enforced by the GM not
 * automation/code"*): nothing in this module asks about corpses.
 */

import { AZEROTH } from "../config.mjs";

/** *Each graft costs 1 Essence.* */
export const GRAFT_COST = 1;

/** The entry Stitch Abomination raises. */
export const ABOMINATION = "Abomination";

/** The entries Grafted Flesh lets a graft reach (*a Risen Zombie or a Plagued Ghoul*). */
export const GRAFTED_FLESH_ENTRIES = Object.freeze(["Risen Zombie", "Plagued Ghoul"]);

/** Stitch Abomination's own four, in the entry's order. */
export const BASE_GRAFTS = Object.freeze(["meatHook", "bonePlating", "wardedHide", "swollen"]);

/**
 * **THE GRAFTS A HOOKLESS SERVANT CANNOT TAKE** (the lead's Q2 of the 4b review, 2026-11-19: *"no"*;
 * the reading: Grafted Flesh does not offer Meat Hook to a Risen Zombie or a Plagued Ghoul, which
 * carry no Chain hook for it to reach with - 07: *Its Chain hook attack ... has Range 30 ft*).
 */
export const HOOKLESS_GRAFTS = Object.freeze(["meatHook"]);

/** Surgeon's Hand: *Butcher's Arm* and *Plague Bladder* at rank 1, *Grasping Arms* at rank 2. */
export const SURGEON_GRAFTS = Object.freeze({ 1: Object.freeze(["butchersArm", "plagueBladder"]), 2: Object.freeze(["graspingArms"]) });

/**
 * **EACH GRAFT AND WHAT IT STAMPS** (07 and 04, as drafted). `stamp(o)` takes the caster's
 * `tier` and, for Warded Hide, the `school` chosen, and answers a descriptor in the shapes the
 * bestiary's abilities and Active Effects already use: `attack` an attack row whose hit asks a
 * Resist and pulls (`effects/forced-movement.mjs#forceMove`), `ap` a `final` Armor Point change
 * at every location, `ward` a `final` Ward change on one school, `health` a raised maximum with
 * the current Health filled, `damageRating` a Damage Rating line, `passive` a start-of-turn aura
 * Test, `onHit` a melee hit's Resist and condition.
 */
export const GRAFTS = Object.freeze({
  meatHook: Object.freeze({
    key: "meatHook", label: "AZEROTH.Graft.meatHook",
    stamp: () => ({ kind: "attack", name: "Hook", range: 30, onHit: { test: "body", against: "spellDC", pull: true } })
  }),
  bonePlating: Object.freeze({
    key: "bonePlating", label: "AZEROTH.Graft.bonePlating",
    stamp: () => ({ kind: "ap", amount: 2, locations: ["body", "head", "limb"] })
  }),
  wardedHide: Object.freeze({
    key: "wardedHide", label: "AZEROTH.Graft.wardedHide",
    stamp: ({ school = null } = {}) => ({ kind: "ward", amount: 3, school })
  }),
  swollen: Object.freeze({
    key: "swollen", label: "AZEROTH.Graft.swollen",
    stamp: ({ tier = 1 } = {}) => ({ kind: "health", amount: 5 * tierOf(tier) })
  }),
  butchersArm: Object.freeze({
    key: "butchersArm", label: "AZEROTH.Graft.butchersArm",
    stamp: ({ tier = 1 } = {}) => ({ kind: "damageRating", amount: tierOf(tier) })
  }),
  plagueBladder: Object.freeze({
    key: "plagueBladder", label: "AZEROTH.Graft.plagueBladder",
    stamp: () => ({ kind: "passive", when: "startOfTurn", who: "enemy", within: 5, test: "body", against: "spellDC", condition: "poisoned", value: 1 })
  }),
  graspingArms: Object.freeze({
    key: "graspingArms", label: "AZEROTH.Graft.graspingArms",
    stamp: () => ({ kind: "onHit", melee: true, test: "body", against: "spellDC", condition: "entangled", until: "endOfNextTurn" })
  })
});

const int = v => Math.trunc(Number(v)) || 0;
function tierOf(tier) {
  return Math.min(4, Math.max(1, int(tier) || 1));
}

/**
 * **WHAT A RAISE OFFERS** - the grafts on the list, how many a creature may take, and how
 * often each. An Abomination from Stitch Abomination takes any of the list, each once (twice
 * with Masterwork Abomination); a Risen Zombie or a Plagued Ghoul takes one graft under Grafted
 * Flesh, two at rank 2, from the same list; anything else takes none.
 *
 * @param {{entry?: string, stitched?: boolean, surgeonsHand?: number, graftedFlesh?: number, masterwork?: boolean}} o
 *   `stitched` the creature is Stitch Abomination's own (Masterwork reads only that)
 * @returns {{options: string[], perGraft: number, max: number}}
 */
export function graftMenu({ entry = "", stitched = false, surgeonsHand = 0, graftedFlesh = 0, masterwork = false } = {}) {
  const hand = Math.max(0, int(surgeonsHand));
  const options = [...BASE_GRAFTS, ...(hand >= 1 ? SURGEON_GRAFTS[1] : []), ...(hand >= 2 ? SURGEON_GRAFTS[2] : [])];
  const name = String(entry ?? "").trim();
  if (name === ABOMINATION && stitched) {
    const perGraft = masterwork ? 2 : 1;
    return { options, perGraft, max: options.length * perGraft };
  }
  const ranks = Math.max(0, Math.min(2, int(graftedFlesh)));
  // Grafted Flesh's zombie or ghoul takes the same list less Meat Hook (Q2: it has no Chain hook).
  if (GRAFTED_FLESH_ENTRIES.includes(name) && ranks > 0) return { options: options.filter(k => !HOOKLESS_GRAFTS.includes(k)), perGraft: 1, max: ranks };
  return { options: [], perGraft: 0, max: 0 };
}

/**
 * The Essence the picks cost: 1 a graft, less Practiced Stitcher's 1 a rank in total (the
 * lead: *"one less essence per rank"*), never below 0.
 *
 * @param {string[]} picks
 * @param {{practicedStitcher?: number}} [o]
 * @returns {number}
 */
export function graftPrice(picks = [], { practicedStitcher = 0 } = {}) {
  const n = (Array.isArray(picks) ? picks : []).length * GRAFT_COST;
  return Math.max(0, n - Math.max(0, int(practicedStitcher)));
}

/**
 * **THE GRAFTS CHOSEN, JUDGED WHOLE** before the budget and the payment: each on the menu, none
 * more often than the menu allows, no more than its count, Warded Hide's school one of 07's
 * damage schools, and the Essence held for the price.
 *
 * @param {{menu: ReturnType<typeof graftMenu>, picks?: Array<string|{key: string, school?: string}>,
 *   pool?: {value?: number}|null, practicedStitcher?: number}} o
 * @returns {{ok: boolean, cost: number, picks: Array<{key: string, school: string|null}>, refusal: null|"none"|"unknown"|"twice"|"tooMany"|"school"|"noPool"|"short", key: string|null}}
 */
export function graftPlan({ menu, picks = [], pool = null, practicedStitcher = 0 } = {}) {
  const list = (Array.isArray(picks) ? picks : []).map(p => (typeof p === "string" ? { key: p, school: null } : { key: p?.key, school: p?.school ?? null }));
  const refuse = (refusal, key = null) => ({ ok: false, cost: 0, picks: [], refusal, key });
  if (!list.length) return { ok: true, cost: 0, picks: [], refusal: null, key: null };
  if (!menu || !menu.max) return refuse("none");
  if (list.length > menu.max) return refuse("tooMany");
  const counts = {};
  for (const pick of list) {
    if (!menu.options.includes(pick.key)) return refuse("unknown", String(pick.key));
    counts[pick.key] = (counts[pick.key] ?? 0) + 1;
    if (counts[pick.key] > menu.perGraft) return refuse("twice", pick.key);
    if (pick.key === "wardedHide" && !Object.hasOwn(AZEROTH.schools ?? {}, String(pick.school ?? ""))) return refuse("school", pick.key);
  }
  const cost = graftPrice(list, { practicedStitcher });
  if (cost > 0 && !pool) return refuse("noPool");
  if (cost > Math.max(0, int(pool?.value))) return refuse("short");
  return { ok: true, cost, picks: list, refusal: null, key: null };
}

/**
 * One stamp a pick, in the order picked, each carrying its graft's key so the creature's
 * sheet and card can list what it carries.
 *
 * @param {Array<{key: string, school?: string|null}>} picks  `graftPlan`'s
 * @param {{tier?: number}} [o]
 */
export function graftStamps(picks = [], { tier = 1 } = {}) {
  return (picks ?? []).filter(p => GRAFTS[p?.key]).map(p => ({ graft: p.key, ...GRAFTS[p.key].stamp({ tier, school: p.school ?? null }) }));
}

/**
 * **THE STAMPS FOLDED INTO WHAT THE DOOR WRITES** (a graft given twice under Masterwork
 * Abomination): Armor Points, Health and Damage Rating add; a Ward adds on its own school (MY
 * READING: two Warded Hides on one school give Ward 6); the Hook, the bladder and the arms are
 * one each however often they were given. **05's cap of Ward 10 per school is the door's** to
 * apply where it lays the Ward (the plan's Phase 4 door 15), never this sum's.
 *
 * @param {ReturnType<typeof graftStamps>} stamps
 * @returns {{ap: number, health: number, damageRating: number, ward: Record<string, number>, attacks: object[], passives: object[], onHit: object[], grafts: string[]}}
 */
export function combinedStamps(stamps = []) {
  const out = { ap: 0, health: 0, damageRating: 0, ward: {}, attacks: [], passives: [], onHit: [], grafts: [] };
  const once = (list, stamp) => { if (!list.some(s => s.graft === stamp.graft)) list.push(stamp); };
  for (const s of stamps ?? []) {
    out.grafts.push(s.graft);
    if (s.kind === "ap") out.ap += s.amount;
    else if (s.kind === "health") out.health += s.amount;
    else if (s.kind === "damageRating") out.damageRating += s.amount;
    else if (s.kind === "ward" && s.school) out.ward[s.school] = (out.ward[s.school] ?? 0) + s.amount;
    else if (s.kind === "attack") once(out.attacks, s);
    else if (s.kind === "passive") once(out.passives, s);
    else if (s.kind === "onHit") once(out.onHit, s);
  }
  return out;
}

/** Masterwork Abomination: *it rises with twice its Health*. The multiplier on the entry's Health. */
export function masterworkHealth(health = 0, { masterwork = false } = {}) {
  return Math.max(0, int(health)) * (masterwork ? 2 : 1);
}
