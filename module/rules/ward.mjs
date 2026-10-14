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
 * The schools that hold a Ward, from a `{school: n}` map.
 * @returns {Record<string, number>}
 */
export function wardBySchool(ward) {
  if (!ward || typeof ward !== "object") return {};
  return Object.fromEntries(Object.entries(ward).filter(([k, v]) => AZEROTH.schools[k] && Number(v) > 0));
}
