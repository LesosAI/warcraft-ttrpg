/**
 * What a corruption threshold does (10-CORRUPTION §4 to §6 and §9,
 * 2026-09-06). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * THE LADDER IS THE CHAPTER'S, ROW FOR ROW. Every rung carries the chapter's
 * own *You gain* and *You take* cells verbatim, and the Vitest reads them
 * off `docs/book/10-CORRUPTION.md` and fails on a word's difference - the
 * book is the source and this is its machine reading. Beside the words sits
 * what the system can do with them: a healing reduction the Apply button
 * honours, a Vulnerability the damage pipeline reads, a Damage Rating bonus
 * on the attack and the cast, a Ward, a Speed cost, a Fatigue floor a rest
 * cannot clear, a condition the body refuses, a tick at the start of the
 * turn, and a line on the dialog where the rung bears on a Test. What the
 * table judges - darkvision, a language understood, a lie sensed - stays a
 * note on the rung and nowhere else (D2 §12).
 *
 * A threshold arrives on its own and its boon is priced under its
 * affliction (D-457, D-458): nothing here is chosen, everything is a
 * function of the number.
 */

import { AZEROTH } from "../config.mjs";

/** Healing reduced to nothing: the value `healingReduction` takes where no other creature can heal you. */
export const NO_HEALING = Infinity;

/**
 * @typedef {object} Rung
 * @property {number} at         The threshold: 5, 10 or 15.
 * @property {string} name       The chapter's heading: Emberlit, Grey…
 * @property {string} gain       The *You gain* cell, verbatim.
 * @property {string} take       The *You take* cell, verbatim.
 * @property {number} [healingReduction]   Healing from another creature is reduced by this; NO_HEALING for none at all.
 * @property {string[]} [vulnerable]       Damage types the character is Vulnerable to.
 * @property {{all?: number, school?: string, value?: number}} [damageBonus]  Damage Rating on all damage, or on one school's.
 * @property {Record<string, number>} [ward]  Ward by school.
 * @property {number} [speed]              Speed, in feet, in total for the track (not summed within it).
 * @property {number} [fatigueFloor]       Fatigue that does not clear.
 * @property {string[]} [immune]           Condition ids the character cannot take.
 * @property {{damage: number}} [tick]     Damage at the start of each turn that nothing mitigates.
 * @property {Array<{id: string, kind: string, skill?: string, ability?: string, boons?: number, banes?: number, modifier?: number}>} [lines]
 *           Dialog lines, the table's call: unchecked judgement lines.
 * @property {string[]} [notes]            Keys under AZEROTH.Corruption.Note for what the table judges.
 */

/** The three ladders. `speed` on Undeath is the chapter's own "in total". */
export const LADDER = Object.freeze({
  fel: Object.freeze([
    Object.freeze({
      at: 5, name: "Emberlit",
      gain: "+1 on Resilience Tests against Fel, and you see in the dark as far as you see in daylight",
      take: "Healing you receive from another creature is reduced by 1",
      healingReduction: 1,
      lines: [{ id: "felResilience", kind: "resilience", modifier: 1 }],
      notes: ["darkvision"]
    }),
    Object.freeze({
      at: 10, name: "Fel-marked",
      gain: "+1 Damage Rating on Fel damage you deal",
      take: "Healing from another creature is reduced by 2. You are **Vulnerable (Holy)**, and you cannot enter consecrated ground without a Spirit Resilience Test against DC 15",
      healingReduction: 2,
      damageBonus: { school: "fel", value: 1 },
      vulnerable: ["holy"],
      notes: ["consecrated"]
    }),
    Object.freeze({
      at: 15, name: "Burning",
      gain: "+1 Damage Rating on all damage you deal, and you cannot be **Blinded**",
      take: "Healing from another creature does nothing at all. At the start of each of your turns you take 1 damage that nothing mitigates",
      healingReduction: NO_HEALING,
      damageBonus: { all: 1 },
      immune: ["blinded"],
      tick: { damage: 1 }
    })
  ]),
  void: Object.freeze([
    Object.freeze({
      at: 5, name: "Listening",
      gain: "You understand any spoken language you hear, whether or not you know it",
      take: "A Bane on Tests to notice anything by ear. Something else is using them",
      lines: [{ id: "voidEar", kind: "skill", skill: "perception", banes: 1 }],
      notes: ["tongues"]
    }),
    Object.freeze({
      at: 10, name: "Spoken to",
      gain: "You know when a creature within 30 feet is lying. You do not learn the truth",
      take: "1 Fatigue that does not clear on a Long Rest and cannot be treated",
      fatigueFloor: 1,
      notes: ["lies"]
    }),
    Object.freeze({
      at: 15, name: "Answering",
      gain: "Once between Long Rests, ask one question about something you cannot see. The answer is true, and the GM decides what else heard the asking",
      take: "2 Fatigue in total that does not clear or respond to treatment, and a Bane on Charisma Tests with anyone who can tell what you are",
      fatigueFloor: 2,
      lines: [{ id: "voidTell", kind: "skill", ability: "cha", banes: 1 }],
      notes: ["question"]
    })
  ]),
  undeath: Object.freeze([
    Object.freeze({
      at: 5, name: "Touched by it",
      gain: "You no longer need to eat, and ordinary disease cannot take hold in you",
      take: "The plague advances on its own, per the rule above",
      immune: ["diseased"],
      notes: ["noFood", "weekly"]
    }),
    Object.freeze({
      at: 10, name: "Grey",
      gain: "You do not breathe, and you are immune to poison",
      take: "Speed reduced by 5 feet, and you are **Vulnerable (Holy)**",
      immune: ["poisoned"],
      speed: -5,
      vulnerable: ["holy"],
      notes: ["noBreath"]
    }),
    Object.freeze({
      at: 15, name: "Risen in all but name",
      gain: "Ward 1 against Shadow, and you do not sleep",
      take: "Healing from another creature does nothing at all, and your Speed is reduced by 10 feet in total",
      ward: { shadow: 1 },
      speed: -10,
      healingReduction: NO_HEALING,
      notes: ["noSleep"]
    })
  ])
});

/**
 * §9: at 20 the track ends and every affliction of its rungs falls away;
 * what stands instead is the ending's own two rows. The *You are* and *You
 * are not* cells, verbatim, and their machine reading.
 */
export const ENDINGS = Object.freeze({
  fel: Object.freeze({
    name: "The Fel-touched",
    are: "+1 Damage Rating on all damage. Ward 2 against Fel. You need no light and no air",
    areNot: "Healed by another creature, by any means, ever. **Vulnerable (Holy)** permanently",
    damageBonus: { all: 1 },
    ward: { fel: 2 },
    healingReduction: NO_HEALING,
    vulnerable: ["holy"],
    notes: ["darkvision", "noBreath"]
  }),
  void: Object.freeze({
    name: "The Void-touched",
    are: "You understand every language, spoken or written. Once between Long Rests, ask one question about anything and receive a true answer",
    areNot: "Ever free of the 2 Fatigue, and once between Long Rests the Void speaks with your mouth. You do not choose the words and you do not take them back",
    fatigueFloor: 2,
    notes: ["tongues", "question", "speaks"]
  }),
  undeath: Object.freeze({
    name: "The Risen",
    are: "Immune to poison and disease. Ward 2 against Shadow. You do not eat, breathe, sleep or age",
    areNot: "Healed by another creature by any means. Speed reduced by 10 feet. **Vulnerable (Holy)**",
    immune: ["poisoned", "diseased"],
    ward: { shadow: 2 },
    speed: -10,
    healingReduction: NO_HEALING,
    vulnerable: ["holy"],
    notes: ["noFood", "noBreath", "noSleep"]
  })
});

/** The rungs in force on one track at a value: every rung crossed, or the ending alone at 20 (§9). */
export function rungsInForce(track, value) {
  const v = Math.trunc(Number(value) || 0);
  if (v >= AZEROTH.CORRUPTION_MAX) return { rungs: [], ending: ENDINGS[track] ?? null };
  return { rungs: (LADDER[track] ?? []).filter(r => v >= r.at), ending: null };
}

/**
 * Everything the tracks do to a character, summed the way §7 sums them:
 * every rung of every track at once, Vulnerable once rather than twice, and
 * each track's Speed cost its highest rung's ("in total").
 *
 * @param {Record<string, {value: number}>} states  `trackStates()`'s shape, or `{fel: {value}}`.
 * @returns {{
 *   healingReduction: number,
 *   vulnerable: string[],
 *   immune: string[],
 *   damageBonus: {all: number, bySchool: Record<string, number>},
 *   ward: Record<string, number>,
 *   speed: number,
 *   fatigueFloor: number,
 *   lines: Array<object>,
 *   ticks: Array<{track: string, name: string, damage: number}>,
 *   rungs: Array<{track: string, at: number, name: string, gain: string, take: string, notes: string[]}>,
 *   endings: Array<{track: string, name: string, are: string, areNot: string, notes: string[]}>
 * }}
 */
export function corruptionEffects(states = {}) {
  const out = {
    healingReduction: 0,
    vulnerable: [],
    immune: [],
    damageBonus: { all: 0, bySchool: {} },
    ward: {},
    speed: 0,
    fatigueFloor: 0,
    lines: [],
    ticks: [],
    rungs: [],
    endings: []
  };
  const take = (track, rung) => {
    if (rung.healingReduction !== undefined) out.healingReduction = Math.max(out.healingReduction, rung.healingReduction);
    for (const type of rung.vulnerable ?? []) if (!out.vulnerable.includes(type)) out.vulnerable.push(type);
    for (const id of rung.immune ?? []) if (!out.immune.includes(id)) out.immune.push(id);
    if (rung.damageBonus?.all) out.damageBonus.all += rung.damageBonus.all;
    if (rung.damageBonus?.school) out.damageBonus.bySchool[rung.damageBonus.school] = (out.damageBonus.bySchool[rung.damageBonus.school] ?? 0) + (rung.damageBonus.value ?? 0);
    for (const [school, n] of Object.entries(rung.ward ?? {})) out.ward[school] = (out.ward[school] ?? 0) + n;
    if (rung.fatigueFloor) out.fatigueFloor = Math.max(out.fatigueFloor, rung.fatigueFloor);
    for (const line of rung.lines ?? []) out.lines.push({ ...line, track, rung: rung.name });
    if (rung.tick) out.ticks.push({ track, name: rung.name, damage: rung.tick.damage });
  };
  for (const track of Object.keys(AZEROTH.corruptionTracks)) {
    const value = states[track]?.value ?? 0;
    const { rungs, ending } = rungsInForce(track, value);
    let speed = 0;
    for (const rung of rungs) {
      take(track, rung);
      if (rung.speed) speed = Math.min(speed, rung.speed);
      out.rungs.push({ track, at: rung.at, name: rung.name, gain: rung.gain, take: rung.take, notes: [...(rung.notes ?? [])] });
    }
    if (ending) {
      take(track, ending);
      if (ending.speed) speed = Math.min(speed, ending.speed);
      out.endings.push({ track, name: ending.name, are: ending.are, areNot: ending.areNot, notes: [...(ending.notes ?? [])] });
    }
    out.speed += speed;
  }
  return out;
}

/**
 * The healing that reaches a character from another creature (§4 to §6): the
 * amount less the reduction, and none at all past the third rung.
 */
export function healingReceived(amount, healingReduction = 0) {
  const n = Math.max(0, Math.trunc(Number(amount) || 0));
  if (healingReduction === NO_HEALING) return 0;
  return Math.max(0, n - Math.max(0, Math.trunc(Number(healingReduction) || 0)));
}

/** The dialog lines a rung lays on this Test: by kind, and by the skill or its ability where the line names one. */
export function corruptionLines(effects, { kind, skill = null, skillAbility = null } = {}) {
  return (effects?.lines ?? []).filter(line => {
    if (line.kind !== kind) return false;
    if (line.skill && line.skill !== skill) return false;
    if (line.ability && line.ability !== skillAbility) return false;
    return true;
  });
}
