/**
 * **THE CORRUPTION 08 §5'S THREE TRAITS CHARGE, A TEST FIRST** (08 §5, 10 §3;
 * D-909, D-911). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The lead: *"Corruption given by an item should require a test to resist"* and
 * *"DC is 12+2xtier"*. 08 §5 prints the three, and nothing read any of them
 * before this (`weapon-traits.mjs#TRAIT_READERS_OWED`, D-910):
 *
 * | Trait | Grade | When | Test |
 * |---|---|---|---|
 * | **Fel-touched** | Lesser | *On a natural 1* | Spirit, Fel |
 * | **Fel-touched** | Greater | the natural 1, and *each time an attack or effect of yours reduces a creature to 0 Health* | Spirit, Fel |
 * | **Plaguebound** | Lesser | *Once a month, a living wielder* | Body, Undeath |
 * | **Plaguebound** | Greater | *the Corruption Test comes weekly* | Body, Undeath |
 * | **Felwrought** | (a mount) | *For each Long Rest it is kept, its rider* | Spirit, Fel |
 *
 * Every one is *DC 12 plus twice your tier* (their tier, for a wielder or a
 * rider) - `signatures.mjs#signatureDC` with no Spell DC - and *On a failure,
 * gain 1* of the track. The Test and the card are `workflows.corruptionExposure`,
 * the door every other occasion uses.
 *
 * **MY READINGS, for the lead** (D-911): a bare trait (the Felsteed's
 * `Fel-touched`) is the Lesser grade; *a month* is 30 days and *a week* 7 of the
 * world's clock; and a Plaguebound clock starts the first time the clock sees
 * the wielder holding it, so picking a blade up costs nothing that day.
 */

import { signatureDC } from "./signatures.mjs";

/** The three traits, by key: the track, the Test, and the occasions each grade charges on. */
export const TRAIT_CORRUPTION = Object.freeze({
  "fel-touched": Object.freeze({
    name: "Fel-touched", track: "fel", resilience: "spirit",
    lesser: Object.freeze(["natural1"]), greater: Object.freeze(["natural1", "kill"])
  }),
  plaguebound: Object.freeze({
    name: "Plaguebound", track: "undeath", resilience: "body", living: true,
    lesser: Object.freeze(["month"]), greater: Object.freeze(["week"])
  }),
  felwrought: Object.freeze({
    name: "Felwrought", track: "fel", resilience: "spirit",
    lesser: Object.freeze(["longRest"]), greater: Object.freeze(["longRest"])
  })
});

/** The occasions a trait may charge on. */
export const TRAIT_OCCASIONS = Object.freeze(["natural1", "kill", "month", "week", "longRest"]);

/** The world-clock seconds a clock occasion runs, by its word (MY READING, D-911). */
export const TRAIT_PERIODS = Object.freeze({ month: 30 * 86400, week: 7 * 86400 });

/**
 * One trait's key and grade off its printed name: `Fel-touched (Greater)` ->
 * `{key: "fel-touched", grade: "greater"}`. A bare name is the Lesser grade.
 *
 * @param {string} name
 * @returns {{key: string, grade: "lesser"|"greater"}|null}
 */
export function traitGrade(name) {
  const raw = String(name ?? "").trim();
  const grade = /\(\s*greater\s*\)/i.test(raw) ? "greater" : "lesser";
  const key = raw.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase().replace(/\s+/g, "-");
  return key in TRAIT_CORRUPTION ? { key, grade } : null;
}

/**
 * **WHAT THESE SOURCES CHARGE ON THIS OCCASION**: one Test a trait that names it,
 * each with its own source's name. Pure: the caller chooses the sources - the
 * weapon the natural 1 was rolled with, every weapon the killer holds, the
 * wielder's Plaguebound blades, the rider's mounts.
 *
 * @param {Array<{name?: string, traits?: string[]}>} sources
 * @param {string} occasion  one of `TRAIT_OCCASIONS`
 * @param {{tier?: number, living?: boolean}} [o]
 * @returns {Array<{trait: string, source: string, track: string, resilience: string, dc: number, amount: number}>}
 */
export function traitExposures(sources = [], occasion, { tier = 1, living = true } = {}) {
  const out = [];
  if (!TRAIT_OCCASIONS.includes(occasion)) return out;
  for (const source of sources ?? []) {
    const seen = new Set();
    for (const name of source?.traits ?? []) {
      const read = traitGrade(name);
      if (!read || seen.has(read.key)) continue;
      const row = TRAIT_CORRUPTION[read.key];
      if (!row[read.grade].includes(occasion)) continue;
      if (row.living === true && living !== true) continue;
      seen.add(read.key);
      out.push({
        trait: row.name, source: String(source?.name ?? ""), track: row.track, resilience: row.resilience,
        dc: signatureDC({ spellDC: null, tier }), amount: 1
      });
    }
  }
  return out;
}

/**
 * **HOW MANY OF A CLOCK'S TESTS ARE DUE** (Plaguebound's month or week): the
 * whole periods since the last, and the stamp to keep. A clock with no stamp
 * STARTS now and charges nothing (MY READING, D-911).
 *
 * **A BLADE PUT DOWN KEEPS ITS CLOCK** (D-913, the lead's adopted recommendation): its
 * stamp stands while it is not wielded, so setting it down skips nothing, and the
 * periods that passed meanwhile come due as ONE Test the next time it is wielded
 * (`cap`). Every elapsed period is still consumed, so the clock keeps its phase.
 *
 * @param {{since?: number|null, now?: number, period?: number, cap?: number}} o
 * @returns {{due: number, since: number}}
 */
export function clockTestsDue({ since = null, now = 0, period = 0, cap = Infinity } = {}) {
  const t = Math.trunc(Number(now)) || 0;
  const p = Math.trunc(Number(period)) || 0;
  if (!Number.isFinite(Number(since)) || since === null || p <= 0) return { due: 0, since: t };
  const s = Math.trunc(Number(since));
  if (t <= s) return { due: 0, since: s };
  const due = Math.floor((t - s) / p);
  const most = Number(cap) >= 0 ? Number(cap) : Infinity;
  return { due: Math.min(due, most), since: s + due * p };
}
