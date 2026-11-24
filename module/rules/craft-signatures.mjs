/**
 * **A CRAFTED SIGNATURE IS CHOSEN FROM THE BOOK'S OWN LIST** (D-1990; the lead,
 * 2026-11-24: *"The signatures should be chosen from a list, not typed like the
 * GM can. Exclude legendary signatures"*). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * The catalogue is read over the same index fields the GM Forge reads
 * (`applications/forge.mjs`: `system.signature`, `system.signatureEffect`,
 * `system.source`, plus `name`, `type`, `system.rarity` and `system.identifier`)
 * from the weapons, armor and gear packs, and keeps:
 *
 * - **only the BOOK's Signatures**: a Classic find's (`source.document ===
 *   "Classic"`) is a conversion of somebody else's item, never a recipe;
 * - **never a Legendary's**: 08 §20 costs no Legendary Signature and nothing
 *   above tier 4 is made (08 §18);
 * - one row a TEXT, the first by identifier keeping it.
 *
 * **Nobody types a crafted Signature's words.** The row's sentence and its
 * hand-reviewed descriptor travel together into `forge.mjs#plan` and `#build`
 * as `{kind, text, effect}`, exactly as when the GM takes one in the Forge, so
 * what the item SAYS and what it DOES cannot part.
 *
 * **The kind is read off the descriptor, priced by 08 §20's table** - never off
 * anything typed - and named by the one `forge.mjs#SIGNATURE_KINDS` key that
 * costs the same, so `plan()` charges exactly 08 §20's number:
 *
 * | 08 §20 row | Read off the descriptor | Cost | Kind |
 * |---|---|---|---|
 * | Gated on a class, race, faction or situation | a trunk gate | 1 | `gated` |
 * | Always on | no trunk gate | 2 | `alwaysOn` |
 * | Converting damage, gated | `damageMultiplier` or `damageRatingSet`, gated | 3 | `convertingGated` |
 * | Converting damage | the same, ungated | 4 | `converting` |
 * | Casting a tier 1 spell, once per Short Rest (its gate included) | `kind: "spell"`, uses per short or none | 2 | `alwaysOn` |
 * | Casting a tier 2 spell, once per Long Rest (its gate included) | `kind: "spell"`, uses per long | 4 | `converting` |
 */

import { SIGNATURE_KINDS, plan } from "./forge.mjs";
import { proseFromHtml } from "./prose.mjs";

/** The index fields the catalogue reads, the GM Forge's own plus the rarity and the identifier. */
export const SIGNATURE_INDEX_FIELDS = Object.freeze([
  "system.identifier", "system.signature", "system.signatureEffect", "system.source", "system.rarity"
]);

/** The three packs a crafted Signature is drawn from. */
export const SIGNATURE_PACKS = Object.freeze(["azeroth-rpg.weapons", "azeroth-rpg.armor", "azeroth-rpg.gear"]);

/** The item types a row may go on: a Signature is written for its kind of item. */
const ITEM_TYPES = Object.freeze(["weapon", "armor", "gear"]);

/** A stable short hash of a text (FNV-1a, 32 bits, hex), so a row's id survives a rebuild. */
export function textHash(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const filled = v => v !== null && v !== undefined && v !== "";

/**
 * 08 §20's cost of a Signature, read off its hand-reviewed descriptor, and the
 * `SIGNATURE_KINDS` key that costs the same (the table in the module comment).
 *
 * @param {object|null} effect  `system.signatureEffect`
 * @returns {{kind: string, cost: number}}
 */
export function signatureKindOf(effect) {
  const e = effect && typeof effect === "object" ? effect : {};
  const gated = Array.isArray(e.gates) && e.gates.length > 0;
  let cost;
  if (e.kind === "spell") cost = e.use?.uses?.per === "long" ? 4 : 2;
  else if (filled(e.damageMultiplier) || filled(e.damageRatingSet)) cost = gated ? 3 : 4;
  else cost = gated ? 1 : 2;
  const kind = Object.entries(SIGNATURE_KINDS).find(([, v]) => v.cost === cost)?.[0] ?? "alwaysOn";
  return { kind, cost };
}

/**
 * **THE CATALOGUE** over index entries of the three packs (`{name, type,
 * system}` with `SIGNATURE_INDEX_FIELDS`). Sorted by item type, then identifier,
 * then name, before the dedupe, so the same text always keeps the same row.
 *
 * @param {Iterable<{name?: string, type?: string, system?: object}>} entries
 * @returns {Array<{id: string, from: string, text: string, effect: object|null, kind: string, cost: number, itemType: string}>}
 */
export function signatureCatalogue(entries = []) {
  const rows = [...(entries ?? [])]
    .filter(e => e && ITEM_TYPES.includes(e.type))
    .filter(e => e.system?.source?.document !== "Classic")
    .filter(e => e.system?.rarity !== "legendary")
    .filter(e => String(e.system?.signature ?? "").trim())
    .sort((a, b) => ITEM_TYPES.indexOf(a.type) - ITEM_TYPES.indexOf(b.type)
      || String(a.system?.identifier ?? "").localeCompare(String(b.system?.identifier ?? ""))
      || String(a.name ?? "").localeCompare(String(b.name ?? "")));
  const seen = new Set();
  const out = [];
  for (const e of rows) {
    const text = String(e.system.signature).trim();
    if (seen.has(text)) continue;
    seen.add(text);
    const { kind, cost } = signatureKindOf(e.system.signatureEffect);
    out.push({
      id: `${e.system?.identifier || "item"}-${textHash(text)}`,
      from: String(e.name ?? ""),
      text,
      effect: e.system.signatureEffect ?? null,
      kind,
      cost,
      itemType: e.type
    });
  }
  return out;
}

/**
 * **A CHOSEN ROW, RESOLVED** for the craft (the door's `signature: {id}`): the row
 * found by id, for this kind of item. A typed sentence is no Signature at all and
 * is refused, as an unknown id is (`signatureUnknown`); a row written for another
 * kind of item is refused in words (`signatureType`). Answers `{signature}` -
 * `{id, kind, text, effect}`, what `forge.plan` and `forge.build` read - or
 * `{refusal}`, or `{signature: null}` for none.
 *
 * @param {{id?: string}|null} asked
 * @param {Array} catalogue  `signatureCatalogue`'s rows
 * @param {{type?: string}} base  the recipe item
 */
export function resolveCraftSignature(asked, catalogue = [], base = null) {
  if (asked === null || asked === undefined || asked === "") return { signature: null };
  const id = typeof asked === "object" ? asked.id : null;
  const row = id ? (catalogue ?? []).find(r => r.id === id) ?? null : null;
  if (!row) return { refusal: { reason: "signatureUnknown" } };
  if (base?.type && row.itemType !== base.type) return { refusal: { reason: "signatureType", type: row.itemType } };
  return { signature: { id: row.id, kind: row.kind, text: row.text, effect: row.effect } };
}

/**
 * **WHAT THE CRAFT WINDOW LISTS** (D-1929: only what can be picked, no greyed
 * rows): the rows written for the base item's type that `forge.mjs#plan` takes
 * at this rarity beside the chosen prefix and suffix. A row is offered where the
 * Signature adds no reason of its own to the plan - a spend still UNDER the
 * band is not its fault, since the crafter may yet choose an affix - so a row
 * the budget left cannot pay, or a rarity below Rare, offers nothing.
 *
 * @returns {Array<{id: string, from: string, text: string, kind: string, cost: number}>}  `text` is prose
 */
export function signaturesFor({ base = null, rarity = "common", prefixes = [], suffix = null, catalogue = [] } = {}) {
  if (!base || !["rare", "epic"].includes(rarity)) return [];
  const proposal = { base, rarity, prefixes: (prefixes ?? []).filter(Boolean), suffix: suffix ?? null };
  const without = new Set(plan(proposal).reasons);
  const out = [];
  for (const row of catalogue ?? []) {
    if (row.itemType !== base.type) continue;
    const added = plan({ ...proposal, signature: { kind: row.kind, text: row.text, effect: row.effect } }).reasons
      .filter(r => !without.has(r) && !/ is under /.test(r));
    if (added.length) continue;
    out.push({ id: row.id, from: row.from, text: proseFromHtml(row.text), kind: row.kind, cost: row.cost });
  }
  return out;
}
