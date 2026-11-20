/**
 * **WHAT A HORDE CREATURE IS MADE FROM** (02 §7's Command the Dead, 07's Stitch Abomination, 04's
 * Flesh; the Necromancer plan's doors 3 and 15). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The raise door makes each creature from its 14 block and hands the block's plain data through
 * `hordeBlock` before the actor is created:
 *
 * - *Your raised dead do not use Loose Bones* (02 §7): the ability is struck from the block;
 * - Masterwork Abomination's *it rises with twice its Health*;
 * - every graft's stamp (`grafts.mjs#graftStamps`, folded by `combinedStamps`): Bone Plating's
 *   Armor Points, Warded Hide's Ward under 05's cap of 10 a school, Swollen's Health, Butcher's
 *   Arm's Damage Rating on every attack row, Meat Hook's Range on the Chain hook and its pull,
 *   Plague Bladder and Grasping Arms as abilities whose Use is the Test the graft names - each a
 *   descriptor the bestiary's own doors already read (`ability-automation.mjs`,
 *   `boss-actions.mjs#cleanBossPlan`), at the caster's Spell DC stamped at the raise.
 *
 * The grafts the creature carries are listed on the actor's `flags.azeroth-rpg.grafts` too, so
 * its sheet and its card can say what it was given.
 */

import { combinedStamps, masterworkHealth } from "./grafts.mjs";

/** The ability 02 §7 switches off on every raised dead (14's *Loose Bones*). */
export const LOOSE_BONES = "Loose Bones";

/** The attack Meat Hook reaches with (07: *Its Chain hook attack ... has Range 30 ft*). */
export const CHAIN_HOOK = "Chain hook";

/** 05's cap on a Ward against one school. */
export const WARD_CAP = 10;

const whole = v => Math.max(0, Math.trunc(Number(v)) || 0);
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** A bestiary automation descriptor with every key the parser writes, so the sheet and the door read it as they read 14's. */
function automation(extra = {}) {
  return {
    kind: "test", reason: "", action: "action", cost: { pool: null, amount: null }, casting: false, dc: null,
    uses: { max: null, value: null, per: null }, heal: null,
    damage: { amount: null, type: null, half: false, onFail: false }, resist: null,
    attack: { bonus: null, damage: null, traits: [] }, area: "",
    inflicts: { condition: null, value: null, until: null, onFail: false }, spell: "", note: "",
    passive: { grants: [], refuses: [], senses: [], when: null, near: { name: null, feet: null, count: null } },
    summon: { entry: "", count: null, side: "summoner", from: "nextRound" },
    tick: { heal: null, when: null, unless: null },
    ...extra
  };
}

/**
 * **THE GRAFTS' ABILITIES**, in the block's own shape: the Test each graft names, at the Spell DC
 * of the Necromancer who stitched it. Words are the caller's (`words(key, data)`), so the pure
 * module carries no English.
 *
 * **EACH IS A STANDING `passive`, NEVER A USE** (the lead's Q7 of the 4b review: *"auto"*; O-414
 * closed): the hit or the turn start fires it on its own (`effects/graft-riders.mjs`), so a Use
 * button on its row would ask the Test a second time. The row keeps the Test, the DC and what a
 * failure lands as the sheet's record of the rule.
 *
 * @param {ReturnType<typeof combinedStamps>} folded
 * @param {{spellDC?: number, words?: (key: string, data?: object) => string}} o
 * @returns {object[]}
 */
export function graftAbilities(folded, { spellDC = 10, words = key => key } = {}) {
  const dc = whole(spellDC) || 10;
  const out = [];
  if (folded.attacks.some(a => a.graft === "meatHook")) {
    out.push({
      name: words("AZEROTH.Graft.meatHook"),
      description: `<p>${words("AZEROTH.Graft.Ability.meatHook", { dc })}</p>`,
      automation: automation({ kind: "passive", action: null, resist: "body", dc, plan: { forced: { on: "fail", feet: 30, toward: "toward" } } })
    });
  }
  if (folded.passives.some(p => p.graft === "plagueBladder")) {
    out.push({
      name: words("AZEROTH.Graft.plagueBladder"),
      description: `<p>${words("AZEROTH.Graft.Ability.plagueBladder", { dc })}</p>`,
      automation: automation({ kind: "passive", action: null, resist: "body", dc, area: "5 ft", inflicts: { condition: "poisoned", value: 1, until: null, onFail: true } })
    });
  }
  if (folded.onHit.some(h => h.graft === "graspingArms")) {
    out.push({
      name: words("AZEROTH.Graft.graspingArms"),
      description: `<p>${words("AZEROTH.Graft.Ability.graspingArms", { dc })}</p>`,
      automation: automation({ kind: "passive", action: null, resist: "body", dc, inflicts: { condition: "entangled", value: null, until: "endOfNextTurn", onFail: true } })
    });
  }
  return out;
}

/**
 * **THE BLOCK A HORDE CREATURE IS MADE FROM** - a changed copy of the block's plain data (the
 * argument is never written).
 *
 * @param {object} data  the bestiary document's `toObject()`
 * @param {{stamps?: object[], masterwork?: boolean, spellDC?: number, words?: Function}} o
 *   `stamps` the creature's graft stamps (`graftStamps`), `masterwork` Stitch Abomination raised
 *   under Masterwork Abomination
 * @returns {object}
 */
export function hordeBlock(data, { stamps = [], masterwork = false, spellDC = 10, words = key => key } = {}) {
  const out = clone(data ?? {});
  const sys = out.system ?? (out.system = {});
  sys.creatureAbilities = (sys.creatureAbilities ?? []).filter(a => String(a?.name ?? "").trim() !== LOOSE_BONES);
  const folded = combinedStamps(stamps ?? []);
  const health = sys.health ?? (sys.health = { value: 0, max: 0 });
  // Masterwork Abomination's *twice its Health* is the one rule's (`grafts.mjs#masterworkHealth`).
  let max = masterworkHealth(health.max ?? health.value, { masterwork });
  max += folded.health;
  sys.health = { ...health, max, value: max };
  if (folded.ap > 0) {
    const ap = sys.ap ?? (sys.ap = {});
    for (const loc of ["body", "head", "limb"]) ap[loc] = whole(ap[loc]) + folded.ap;
  }
  const schools = Object.entries(folded.ward);
  if (schools.length) {
    const ward = sys.ward ?? (sys.ward = {});
    for (const [school, n] of schools) ward[school] = Math.min(WARD_CAP, whole(ward[school]) + n);
  }
  if (folded.damageRating > 0) {
    sys.attacks = (sys.attacks ?? []).map(a => ({ ...a, damage: whole(a.damage) + folded.damageRating }));
  }
  if (folded.attacks.some(a => a.graft === "meatHook")) {
    sys.attacks = (sys.attacks ?? []).map(a => (String(a?.name ?? "").trim() === CHAIN_HOOK ? { ...a, range: 30 } : a));
  }
  sys.creatureAbilities = [...sys.creatureAbilities, ...graftAbilities(folded, { spellDC, words })];
  // The grafts given, and the schools Warded Hide wards against, for the creature's sheet and the panel.
  // `graftDC`: the Necromancer's Spell DC at the raise, which the grafts that fire on their own read
  // (`rules/graft-riders.mjs#graftDC`; the lead's Q7 of the 4b review).
  out.flags = { ...(out.flags ?? {}), "azeroth-rpg": { ...(out.flags?.["azeroth-rpg"] ?? {}), grafts: [...folded.grafts], graftWard: Object.keys(folded.ward).sort(), ...(folded.grafts.length ? { graftDC: whole(spellDC) || 10 } : {}) } };
  return out;
}
