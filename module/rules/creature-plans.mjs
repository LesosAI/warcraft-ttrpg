/**
 * **WHAT A CREATURE'S ABILITY DOES BEYOND THE SEED** (D-811). Pure: no Foundry.
 *
 * D-807 found twenty creature abilities that are SHELLS: a Use that spends what 14 prices -
 * an action, uses, Mana - and lays nothing (`ability-automation.mjs#isShell`). The lead,
 * 2026-11-06: *"Fix this. A Use that lays nothing records why. [...] A ceiling of 20 on such
 * rows may only fall."* This table is the half of that order that AUTOMATES: each row below is
 * a shell whose words state a mechanic one of D-809's doors already lands
 * (`effects/boss-doors.mjs`), read exactly as 14 writes it and inventing nothing. The other
 * fourteen stay shells and record why (`bestiary-automation.test.mjs` holds them to a ceiling).
 *
 * A row's keys are `BOSS_PLANS`' own and are laid by the same reader
 * (`boss-actions.mjs#applyPlanRow`), so the two tables cannot mean different things by one key.
 * The bestiary parser lays them (`applyCreaturePlan`), so `packs:parse` regenerates them and
 * `check-packs.mjs` pins them; `workflows.useAbility` runs a creature ability whose descriptor
 * carries a plan through the Boss doors' three steps (judge and pick, the card's record, what
 * lands at the press), and nothing about a Boss Action's points.
 */

import { applyPlanRow, cleanBossPlan } from "./boss-actions.mjs";
import { emptyAutomation, hasAutomation, isShell } from "./ability-automation.mjs";

/**
 * The kind of Test Counterspell's Bane lands on, named once: a Bane is laid, never a roll built
 * here (`distance.test.mjs` censuses every literal Casting Test kind in `module/` as a roll).
 */
const CASTING_TESTS = "casting";

export const CREATURE_PLANS = Object.freeze({
  // *Every enemy within 30 feet is pulled 20 feet toward the drake unless it passes a Resilience
  // (Spirit) Test at DC 17* (14 §10, the drakes' differences, D-846): the seed reads the Test, the
  // action and the Short Rest, and the plan gathers the enemies and lands the pull on a failure,
  // as Aku'mai's The Water Rises does.
  "Blue Drake": {
    "Arcane Vacuum": { plan: { gather: { who: "enemy", feet: 30 }, forced: { on: "fail", feet: 20, toward: "toward" } } }
  },
  "Blackrock Outrunner": {
    "Trapper Net": { plan: { target: { count: 1, feet: 20 } } },
    "Berserk": { plan: { door: "amaniFury", lasts: "encounter" } }
  },
  "Dragonmaw Bonewarder": {
    "Raise Bone Guardian": { kind: "summon", summon: { entry: "Risen Skeleton", count: 1, side: "summoner", from: "now" } }
  },
  "Kolkar Wrangler": {
    "Trapper Net": { plan: { target: { count: 1, feet: 20 } } }
  },
  "Twilight Aquamancer": {
    "Call Aqua Guardian": { kind: "summon", summon: { entry: "Lesser Water Elemental", count: 1, side: "summoner", from: "now" } }
  },
  "Vile Sprite": {
    "Sprite Poison": { plan: { target: { count: 1, feet: 5 } } }
  },
  // The net's save/duration/uses come from the prose; validate its single
  // recorded target and range before spending its action or encounter use.
  "Defias Trapper": {
    "Trapper Net": { plan: { target: { count: 1, feet: 20 } } }
  },
  // *Each ally within 10 feet of it gains a Boon on its next Attack Test.* An ally is the
  // chicken's own side and the chicken among them (D-755: the user counts as an ally unless
  // the words say *other than you*).
  "Gnomish Battle Chicken": {
    "Battle Squawk": { plan: { gather: { who: "ally", feet: 10 }, boon: { kind: "attack", on: "press" } } }
  },
  // *The farstrider names a creature it can see. Its attack Tests against that creature take
  // Boon until the encounter ends or it names another.*
  "Farstrider": {
    "Named Quarry": { plan: { door: "quarry" } }
  },
  // *The magus spends 4 Mana to force a Bane on a Casting Test it can see within 30 feet.* The
  // Bane is laid on the caster targeted and spent by its next Casting Test, as 06's Pummel's is
  // (`effects/banes.mjs`); the 4 Mana is the seed's price (D-807).
  "Kirin Tor Magus": {
    "Counterspell": { plan: { target: { count: 1, feet: 30 }, bane: { kind: CASTING_TESTS, on: "press" } } }
  },
  // *Every creature within 10 feet loses 1 Power and the citizen gains 1 for each one drained.*
  "Silvermoon Citizen": {
    "Arcane Torrent": { plan: { gather: { who: "creature", feet: 10 }, poolLoss: { pool: "power", amount: 1, on: "press", gain: true } } }
  },
  // *Two more Town Guards arrive at the start of the third round after it.* The card's Place
  // waits for that round (`summonWaits`).
  "Town Guard": {
    "Calls the Watch": { kind: "summon", summon: { entry: "Town Guard", count: 2, side: "summoner", from: "thirdRound" } }
  },
  // *Until the encounter ends, its attack Tests take Boon and every attack Test against it takes
  // Boon.* Zul'jin's Amani Fury, held for the encounter rather than the round.
  "Troll Berserker": {
    "Berserk": { plan: { door: "amaniFury", lasts: "encounter" } }
  }
});

/** The row a creature's ability takes from the table, or null. */
export function creaturePlanFor(creature, ability) {
  return CREATURE_PLANS[creature]?.[ability] ?? null;
}

/** Every row the table reviews, as `{creature, ability}`, sorted. */
export function creaturePlanRows() {
  return Object.entries(CREATURE_PLANS)
    .flatMap(([creature, rows]) => Object.keys(rows).map(ability => ({ creature, ability })))
    .sort((a, b) => a.creature.localeCompare(b.creature) || a.ability.localeCompare(b.ability));
}

/**
 * **LAY A ROW ON A SEEDED DESCRIPTOR**, and drop the shell's reason the moment the row makes it
 * lay something (D-807's rule, `mergeSeed`'s own: a reason is why a Use lays nothing).
 *
 * @param {object} automation  the seeded descriptor, whole
 * @param {string} creature
 * @param {string} ability
 * @returns {object}
 */
export function applyCreaturePlan(automation, creature, ability) {
  const row = creaturePlanFor(creature, ability);
  if (!row) return automation;
  const out = applyPlanRow(automation, row, emptyAutomation());
  if (hasAutomation(out) && !isShell(out)) out.reason = "";
  return out;
}

/** Whether a creature ability's descriptor carries a plan its doors read. */
export function hasCreaturePlan(automation) {
  return Object.keys(cleanBossPlan(automation?.plan)).length > 0;
}

/** An explicitly aimed area keeps the range printed on its creature ability.
 * Other prose distances (an aura, a victim's move) are not placement ranges. */
export function creatureAreaRange(row) {
  if (!row?.automation?.area) return null;
  const text = String(row.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  const match = /\bat a point within (\d+)\s*(?:feet|ft)\b/i.exec(text);
  const feet = match ? Number(match[1]) : 0;
  return feet > 0 ? feet : null;
}

/* -------------------------------------------- */
/*  A summon that arrives later                  */
/* -------------------------------------------- */

/** The rounds after the call a summon waits, by `AZEROTH.summonFrom` key. */
export const SUMMON_DELAY = Object.freeze({ thirdRound: 3 });

/**
 * **THE ROUND A DELAYED SUMMON ARRIVES IN** (D-811; 14's Calls the Watch: *Two more Town Guards
 * arrive at the start of the third round after it*): the fight's round at the call plus the
 * delay, recorded on the card with the fight. Nothing out of a started fight, where there are no
 * rounds to count and the bodies are the table's to place.
 *
 * @param {string|null} from  the summon's `from`
 * @param {{id?: string, started?: boolean, round?: number}|null} fight
 * @returns {{due: number, fight: string}|null}
 */
export function summonDue(from, fight) {
  const delay = SUMMON_DELAY[from] ?? 0;
  if (!delay || !fight?.started) return null;
  return { due: Math.trunc(Number(fight.round) || 0) + delay, fight: String(fight.id ?? "") };
}

/**
 * **WHETHER A CARD'S PLACE MUST STILL WAIT**: the round the bodies arrive in where the fight the
 * call was made in has not reached it, else null. Another fight, or none, waits for nothing.
 *
 * @param {{due?: number|null, dueFight?: string|null}|null} summon  the card's record
 * @param {{id?: string, started?: boolean, round?: number}|null} fight
 * @returns {number|null}
 */
export function summonWaits(summon, fight) {
  const due = Math.trunc(Number(summon?.due) || 0);
  if (!(due > 0) || !fight?.started) return null;
  if (summon?.dueFight && String(fight.id ?? "") !== summon.dueFight) return null;
  return (Math.trunc(Number(fight.round) || 0) < due) ? due : null;
}
