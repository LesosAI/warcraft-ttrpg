/**
 * Ward, derived from what is worn (08 SS6, SS10). Pure: no Foundry.
 *
 * A Ward affix grants "+1 Ward in <School>" (08 SS6's suffix table), and a
 * character's Ward in a school is the sum of the grants on the things they
 * have equipped. Nothing is stored: `system.ward` is derived at data
 * preparation from the items, so an unequipped cloak takes its Ward with it.
 *
 * A creature states its Ward on its block as one number in one school
 * (14 SS1), and the model holds it as the same `{school: n}` map a character
 * derives (D-644); `wardMapOf` is the one place the old `{value, school}`
 * pair is read, and `wardBySchool` gives the roll pipeline the schools that
 * hold a Ward, which subtracts from a spell's SL and damage (D-300).
 */

import { AZEROTH } from "../config.mjs";

/**
 * Read one grant string. Returns null for anything that is not a Ward grant.
 * @param {string} text  e.g. "+1 Ward in Arcane"
 * @returns {{key: "ward", value: number, school: string}|null}
 */
export function parseGrant(text = "") {
  const m = /\+?\s*(\d+)\s+Ward\s+(?:in|\()\s*([A-Za-z]+)\)?/i.exec(String(text));
  if (!m) return null;
  const school = m[2].toLowerCase();
  if (!AZEROTH.schools[school]) return null;
  return { key: "ward", value: Number(m[1]), school };
}

/** An empty Ward table: every school at 0. */
export function emptyWard() {
  return Object.fromEntries(Object.keys(AZEROTH.schools).map(k => [k, 0]));
}

/**
 * The Ward a set of items grants, by school.
 * @param {Array<{equipped?: boolean, grants?: string[]}>} items  Plain snapshots.
 */
export function wardFor(items = []) {
  const ward = emptyWard();
  for (const item of items) {
    if (!item?.equipped) continue;
    for (const text of item.grants ?? []) {
      const g = parseGrant(text);
      if (g) ward[g.school] += g.value;
    }
  }
  return ward;
}

/**
 * A Ward map from whatever is stored: the `{school: n}` map, the retired
 * `{value, school}` pair a creature carried before D-644, or a mix of the
 * two left by a merge. Unknown schools and non-positive numbers drop.
 * @returns {Record<string, number>}
 */
export function wardMapOf(ward) {
  const out = {};
  if (!ward || typeof ward !== "object") return out;
  for (const [key, v] of Object.entries(ward)) {
    const n = Math.trunc(Number(v));
    if (AZEROTH.schools[key] && Number.isFinite(n) && n > 0) out[key] = n;
  }
  if (typeof ward.school === "string" && AZEROTH.schools[ward.school]) {
    const n = Math.trunc(Number(ward.value));
    if (Number.isFinite(n) && n > 0) out[ward.school] = Math.max(out[ward.school] ?? 0, n);
  }
  return out;
}

/**
 * The schools an Active Effect's changes name under `system.ward.<school>`, in
 * the vocabulary and each once (D-755). A creature's Ward map holds only the
 * schools its block prints, and a change on a school it lacks meets nothing;
 * `NpcData` starts each of these at 0 so the change has a number to move.
 *
 * @param {Array<{key?: string}>} changes
 * @returns {string[]}
 */
export function wardSchoolsNamed(changes = []) {
  const out = new Set();
  for (const change of changes ?? []) {
    const m = /^system\.ward\.([a-z]+)$/.exec(String(change?.key ?? ""));
    if (m && AZEROTH.schools[m[1]]) out.add(m[1]);
  }
  return [...out];
}

/**
 * **A CREATURE'S WARD AGAINST ANY ONE SCHOOL IS AT MOST 10** (the lead, 2026-11-08,
 * on the Chromatic Champion plan: *"keep ward sources and increase the ward max to
 * 10 system wide. gear counts towards this max"*). Every source counts - what is
 * worn, a race, a feature, a talent, a laid effect, an aura - and 08 §10's 3 from
 * gear still stands inside it.
 */
export const WARD_MAX = 10;

/**
 * One school's Ward held to `WARD_MAX`. A number that is not a number is 0.
 *
 * @param {number} n
 * @returns {number}
 */
export function wardCapped(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(WARD_MAX, v);
}

/**
 * **THE ONE CLAMP** (the Chromatic Champion plan, *A system-wide change: Ward has a
 * hard maximum of 10*). Every school of a `{school: n}` map held to `WARD_MAX`, IN
 * PLACE, and the map handed back. It runs in both actor models' `afterFinalPhase`
 * - after core's `final` Active Effect phase, which lands AFTER `prepareDerivedData`
 * (CLAUDE.md §6), so a clamp there would miss a laid Ward, an aura and every other
 * `final` change - and again inside `wardBySchool`, the point of use the mitigation
 * doors read, so a snapshot recorded before the cap still meets it.
 *
 * @param {Record<string, number>} ward
 * @returns {Record<string, number>}
 */
export function wardCap(ward) {
  if (!ward || typeof ward !== "object") return ward;
  for (const [k, v] of Object.entries(ward)) {
    if (typeof v === "number" && v > WARD_MAX) ward[k] = WARD_MAX;
  }
  return ward;
}

/**
 * The schools that hold a Ward, from a `{school: n}` map, each held to `WARD_MAX`.
 * @returns {Record<string, number>}
 */
export function wardBySchool(ward) {
  if (!ward || typeof ward !== "object") return {};
  return Object.fromEntries(Object.entries(ward)
    .filter(([k, v]) => AZEROTH.schools[k] && Number(v) > 0)
    .map(([k, v]) => [k, wardCapped(v)]));
}
