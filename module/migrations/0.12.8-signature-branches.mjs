/**
 * Migration to 0.12.8 — a gate covers only its own sentence (08 §20; D-722).
 *
 * The lead, 2026-09-14, was asked what a gate in one sentence of a
 * multi-sentence Signature should cover and answered **only its own sentence**.
 * Before this, `seedSignature` read the whole run of prose in one pass and put
 * every clause it found at the top level, so
 *
 *   *A creature that hits you takes 1 Nature damage. A Shaman wielding it adds
 *   2 to its Damage Rating.*
 *
 * came out `gates: [class Shaman]` and `gateHolds` withheld the WHOLE
 * descriptor from everybody else — the retaliation that sentence gives to the
 * table was silently a Shaman's.
 *
 * **NO WORLD DOCUMENT IS REFUSED AT LOAD**, so this is not needed for
 * correctness: `gated` and `useGates` both carry `initial: []`, which is
 * exactly what the descriptor meant before they existed, and the schema fills
 * them on every stored item (CLAUDE.md §10, and D-665's rule that a
 * "where absent" migration can never fire for a field with an initial).
 * The packs are regenerated, so a thing dragged out afresh is right. **What is
 * left is real work**: an item a GM forged at the bench with a multi-sentence
 * Signature carries a descriptor read the old way, and nothing would ever
 * re-read it.
 *
 * **THE GUARD IS FOUR THINGS AT ONCE**, in 0.12.1's spirit — narrow enough that
 * a descriptor somebody wrote or took by hand is never touched:
 *
 * 1. the item carries Signature PROSE, and its descriptor is not simply the
 *    pack copy (which `packs:parse` has already put right);
 * 2. the stored descriptor has NO branch and NO `useGates` — so a re-seeded
 *    item is skipped, which is what makes a second run touch nothing;
 * 3. the stored descriptor HAS a top-level gate, which is the only population
 *    whose meaning moved at all;
 * 4. and re-reading the prose REDISTRIBUTES exactly the clauses that are
 *    already there — the same gate clauses, no more and no fewer, over the
 *    trunk, the branches and the button. A hand-written descriptor whose gate
 *    is not what its own sentence says fails that and is left alone.
 *
 * A Signature the seeder reads identically either way — every one-sentence
 * entry, which is all 123 distinct strings the packs hold — produces no branch
 * and is skipped at (4) with nothing written.
 */

import { seedSignature, signatureEffectOf, signatureProse } from "../rules/signatures.mjs";
import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";

/**
 * Which pack answers for a type. **The Forge's three**: a career's Signature is
 * 03 §5's own sentence and `CAREER_SIGNATURES` is the only thing that writes a
 * career's descriptor, so there is nothing to re-read there.
 */
const PACK_FOR = Object.freeze({
  weapon: "azeroth-rpg.weapons",
  armor: "azeroth-rpg.armor",
  gear: "azeroth-rpg.gear"
});

/** Structural equality over the small plain objects a descriptor is. */
export function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

const clone = value => JSON.parse(JSON.stringify(value));

/**
 * Every gate clause a descriptor carries, wherever it sits, as a sorted list of
 * `kind=value` — the trunk's, the button's and every branch's.
 *
 * SORTED, because the whole point of the change is that the clauses MOVE: the
 * old reading put them all at the top and the new one distributes them, and
 * what has to be equal is the set rather than the arrangement.
 */
export function allClauses(descriptor) {
  const lists = [descriptor?.gates ?? [], descriptor?.useGates ?? []];
  for (const branch of descriptor?.gated ?? []) lists.push(branch?.gates ?? []);
  return lists
    .flat()
    .map(g => `${g?.kind ?? ""}=${g?.value ?? ""}`)
    .sort();
}

/**
 * The update for one document's raw system, or null.
 *
 * @param {object} raw          the stored system
 * @param {object|null} pack    the pack copy's system, where one exists
 * @param {string} name         the document's name
 * @param {{classes?: string[]}} [known]  the class names a gate may name
 */
export function buildBranchUpdate(raw, pack = null, name = "", { classes = [] } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const held = signatureEffectOf(raw);
  if (!held) return null;
  const prose = signatureProse(raw);
  if (!String(prose).trim()) return null;

  // (1) the pack copy is already right, and a copy dragged out of it is too.
  const fromPack = pack ? signatureEffectOf(pack) : null;
  if (fromPack && same(held, fromPack)) return null;

  // (2) nothing that has already been read one sentence at a time, and nothing
  //     carrying a branch somebody wrote by hand.
  if ((held.gated ?? []).length || (held.useGates ?? []).length) return null;

  // (3) an ungated descriptor read the old way is the same descriptor read the
  //     new way, so there is nothing here for this pass.
  if (!(held.gates ?? []).length) return null;

  const wanted = seedSignature({ name, text: prose, section: raw.source?.section ?? "" }, { classes });
  if (same(wanted, held)) return null;
  // Something must actually move, and it must be the shape this pass is for.
  if (!(wanted.gated ?? []).length && !(wanted.useGates ?? []).length) return null;

  // (4) the same clauses, redistributed — never a gate gained or lost.
  if (!same(allClauses(held), allClauses(wanted))) return null;

  return { "system.signatureEffect": clone(wanted) };
}

export async function migrate(log = console.log) {
  const packs = {};
  for (const [type, id] of Object.entries(PACK_FOR)) packs[type] = await packSystems(id);

  // 02 §6's nine, for the class gate a hand-written Signature may name. There
  // is no roster in `config.mjs`, so the pack is the roster; with none the
  // seeder withholds a class gate rather than guessing one — and clause (4)
  // above then refuses the whole item rather than writing a looser gate.
  const classPack = game.packs.get("azeroth-rpg.classes");
  const classes = classPack ? [...(await classPack.getIndex())].map(e => e.name) : [];
  if (!classes.length) log("azeroth-rpg | 0.12.8: the classes pack is unavailable; no class gate will be read");

  return walkWorld({
    item: doc => {
      const table = packs[doc.type] ?? null;
      if (!table) return null;
      const raw = rawSystem(doc);
      return buildBranchUpdate(raw, packCopy(table, raw, doc.name), doc.name, { classes });
    }
  }, log);
}
