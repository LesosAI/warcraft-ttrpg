/**
 * Migration to 0.15.2 - the Legendary expansion's seven old Legendaries, on
 * what a world already holds (08 §20; D-909, D-910).
 *
 * The seven Legendaries 08 §20 printed before D-909 - Ashbringer, the
 * Doomhammer, Gorehowl, Thunderfury, Sulfuras, Quel'Serrar and the Bulwark of
 * Tyr's Hand - keep their **Signature** run word for word and gain 17 named
 * runs. A copy dragged out of the regenerated pack is right; a copy a world
 * already holds carries the one old sentence and the one-run descriptor, so it
 * draws none of the new runs and fires none of them. **This is the repair pass
 * over what is already in a world** (CLAUDE.md §15: a rule enforced only on
 * create never reaches what is there).
 *
 * **THE GUARD IS THE PACK COPY, NEVER `undefined`** (D-665). A held copy is
 * restamped only where its stored prose is, word for word, the pack's own
 * **Signature** run alone - which is exactly what every copy made before this
 * version holds, and what no GM's rewrite does. Both halves move together, the
 * prose and the descriptor, because a descriptor without its runs would leave
 * the sheet arguing with the die. After one pass the stored prose is the whole
 * multi-run prose and the guard no longer holds, so a second pass writes
 * nothing.
 *
 * **The twenty-three new Legendaries need nothing**: no world holds one before
 * the pack does. **Every other document** takes the schema's new keys
 * (`label`, `presses`, `corruptionGain`, `use.onFail`, `use.corruptionGain`,
 * `spellCost.minimum`, the aura's `spellDamage` and `floor`) from their
 * `initial`s at load, which is what each was before the key existed.
 *
 * Every document touched is logged by `walkWorld`.
 */

import { runProse, signatureProse, signatureRuns } from "../rules/signatures.mjs";
import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";

/** Which pack answers for a type. */
const PACK_FOR = Object.freeze({
  weapon: "azeroth-rpg.weapons",
  armor: "azeroth-rpg.armor",
  gear: "azeroth-rpg.gear"
});

/** A sentence as a reader takes it: no markup, one space, no case. */
export function flat(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

const clone = value => JSON.parse(JSON.stringify(value));

/**
 * The update for one document's raw system, or null.
 *
 * @param {object} raw        the stored system
 * @param {object|null} pack  the pack copy's system, where one exists
 * @returns {object|null}
 */
export function buildRunsUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  if (String(pack.rarity ?? "").toLowerCase() !== "legendary") return null;
  // The pack prints more than one run, and one of them is the **Signature**.
  if (signatureRuns(pack.signature).length < 2) return null;
  const old = runProse(pack.signature, "Signature");
  if (old === String(pack.signature ?? "")) return null;
  // Still the one sentence the pack carried before?
  const held = signatureProse(raw);
  if (!held || flat(held) !== flat(old)) return null;
  const update = { "system.signature": pack.signature ?? "" };
  if (pack.signatureEffect) {
    const next = clone(pack.signatureEffect);
    // **A USE ALREADY SPENT STAYS SPENT** (D-914, the final review): the held trunk's
    // `use.uses.value` is carried across, kept within the pack's own maximum, so a restamp
    // never refills what the bearer pressed before the rest that refills it.
    const held = raw.signatureEffect?.use?.uses?.value;
    const max = next.use?.uses?.max;
    if (next.use?.uses && Number.isFinite(Number(held)) && held !== null) {
      next.use.uses.value = Math.max(0, Math.min(Math.trunc(Number(held)), Number.isFinite(Number(max)) ? Number(max) : Math.trunc(Number(held))));
    }
    update["system.signatureEffect"] = next;
  }
  return update;
}

export async function migrate(log = console.log) {
  const packs = {};
  for (const [type, id] of Object.entries(PACK_FOR)) packs[type] = await packSystems(id);

  return walkWorld({
    item: doc => {
      const table = packs[doc.type] ?? null;
      if (!table) return null;
      const raw = rawSystem(doc);
      const update = buildRunsUpdate(raw, packCopy(table, raw, doc.name));
      if (update) log(`azeroth-rpg | 0.15.2: ${doc.name} takes 08 §20's named runs`);
      return update;
    }
  }, log);
}
