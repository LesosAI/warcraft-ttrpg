/**
 * Migration to 0.12.0 — what a Signature DOES, on what a world already holds
 * (08 §20, 03 §5; D-692).
 *
 * `system.signatureEffect` is new on weapon, armor and gear, and newer still
 * on `career`, so every item already in a world carries the schema's initial:
 * `kind: "none"`, no gate, no reason, and nothing that fires. A sword dragged
 * out of the pack last week says *you inflict a Critical Injury on a natural
 * 19* on its sheet and rolls like any other sword; a career says *Once between
 * Long Rests* and nothing counts. The packs are regenerated, so a thing
 * dragged in afresh is right — this is the repair pass over what is already
 * there, which is the half a rule enforced only on create never gets
 * (CLAUDE.md §15, and D-681's own lesson).
 *
 * **THE PACK COPY IS THE AUTHORITY, AND IT IS COMPARED AGAINST — NEVER
 * `undefined`** (D-665). `_source` is the model's cleaned copy, so
 * `raw.signatureEffect === undefined` is false on every document ever stored
 * and a "where absent" migration would fire for nothing at all. The reference
 * is the pack's own descriptor for the same document, matched by identifier
 * and then by name, and the comparison is structural.
 *
 * **AND ONLY WHERE THE TWO STILL AGREE ABOUT THE SENTENCE.** A forged item
 * keeps its base's identifier — a GM's own Signature on a Longsword would
 * otherwise be answered with the pack Longsword's, which is nothing at all.
 * Where the prose differs from the pack's, the item's own words are read by
 * `rules/signatures.mjs#seedSignature`, which is the door for a hand-made
 * thing and never asserts a number the sentence does not say.
 *
 * **A DESCRIPTOR THAT IS NOT THE SCHEMA'S INITIAL IS LEFT ALONE.** That is
 * what makes this idempotent — a second run finds every stamp in place and
 * returns null everywhere — and it is what protects a Signature a GM wrote at
 * the Forge bench, which from this version onward arrives with a descriptor of
 * its own.
 *
 * **The spell a Signature casts comes with it.** Benediction and Netherwind
 * Regalia are `kind: "spell"` with an empty `system.spells[]` in every world
 * made before now, and `pressRefusal` answers `noSpell` for exactly that: a
 * greyed Cast control over nothing. The §20 parser fills the list, and this
 * carries it to the copy already in the world — only where the list is empty
 * and the sentence still matches, so a GM's own casting item is never
 * overwritten.
 */

import { emptySignature, seedSignature, signatureEffectOf, signatureProse } from "../rules/signatures.mjs";
import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";

/** Which pack answers for a type. A career carries a Signature too (03 §5). */
const PACK_FOR = Object.freeze({
  weapon: "azeroth-rpg.weapons",
  armor: "azeroth-rpg.armor",
  gear: "azeroth-rpg.gear",
  career: "azeroth-rpg.careers"
});

/** Structural equality over the small plain objects a descriptor is. */
export function sameSignature(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Two Signature sentences, compared as a reader would: tags stripped, runs of
 * space collapsed, case ignored. The pack stores HTML and a GM's own may be
 * typed as plain text, and neither difference changes what the words say.
 */
export function samePlain(a, b) {
  const flat = v => String(v ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return flat(a) === flat(b);
}

const clone = value => JSON.parse(JSON.stringify(value));

/**
 * The update for one document's raw system, or null.
 *
 * @param {object} raw          the stored system
 * @param {object|null} pack    the pack copy's system, where one exists
 * @param {string} name         the document's name, for a seed off its own words
 * @param {{classes?: string[]}} [known]  the class names a gate may name
 */
export function buildSignatureUpdate(raw, pack = null, name = "", { classes = [] } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const update = {};

  // A whole descriptor either way: `signatureEffectOf` fills a fragment out of
  // `emptySignature`, so the comparison below is never between two shapes.
  const held = signatureEffectOf(raw) ?? emptySignature();
  const untouched = sameSignature(held, emptySignature());
  const prose = signatureProse(raw);
  const packProse = pack ? signatureProse(pack) : null;
  // The pack answers only where it holds the SAME sentence; a forged item
  // shares its base's identifier and not its Signature.
  const matches = Boolean(pack) && samePlain(prose, packProse);

  if (untouched) {
    const wanted = matches
      ? signatureEffectOf(pack) ?? emptySignature()
      : seedSignature({ name, text: prose, section: raw.source?.section ?? "" }, { classes });
    if (!sameSignature(wanted, held)) update["system.signatureEffect"] = clone(wanted);
  }

  // WHICH SPELL IT CASTS. Only onto an empty list, and only where the pack
  // still says the same words: a GM who wrote their own casting item keeps it.
  const spells = Array.isArray(raw.spells) ? raw.spells : [];
  const fromPack = Array.isArray(pack?.spells) ? pack.spells : [];
  if (!spells.length && fromPack.length && matches) update["system.spells"] = clone(fromPack);

  return Object.keys(update).length ? update : null;
}

export async function migrate(log = console.log) {
  const packs = {};
  for (const [type, id] of Object.entries(PACK_FOR)) packs[type] = await packSystems(id);

  // 02 §6's nine, for the class gate a hand-written Signature may name. There
  // is no roster in `config.mjs`, so the pack is the roster; with none the
  // seeder withholds a class gate rather than guessing one.
  const classPack = game.packs.get("azeroth-rpg.classes");
  const classes = classPack ? [...(await classPack.getIndex())].map(e => e.name) : [];
  if (!classes.length) log("azeroth-rpg | 0.12.0: the classes pack is unavailable; no class gate will be read");

  return walkWorld({
    item: doc => {
      const table = packs[doc.type] ?? null;
      if (!table) return null;
      const raw = rawSystem(doc);
      return buildSignatureUpdate(raw, packCopy(table, raw, doc.name), doc.name, { classes });
    }
  }, log);
}
