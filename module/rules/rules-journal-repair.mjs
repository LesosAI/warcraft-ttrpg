/**
 * **A RULES CHAPTER THE WORLD ALREADY HOLDS, BROUGHT UP TO THE BOOK** (F6's question 5; run close-F2).
 * Pure: no Foundry imports (CLAUDE.md §3).
 *
 * `applications/rules-journals.mjs#importRulesJournals` copies each chapter of the rules compendium
 * into the world ONCE and skips a chapter the world already holds - CLAUDE.md §15's importer fault.
 * So a world that imported the book before the Death Knight still reads 02 §7 as *The eleven
 * classes*, and every page the book has rewritten since reads as it did on the day of the import.
 *
 * A page's id is derived from its chapter and its title (`tools/parse-book/rules-journal.mjs`,
 * `documentId("rules.<chapter>", slugify(title))`), so a book page carries the id its own name
 * derives and a page the GM added carries Foundry's random one.
 *
 * **A HELD PAGE IS NEVER WRITTEN** (the lead, on the close review's finding 3: *"Keep the GM's copy
 * (Recommended)"* - *"A held page that differs is left alone and the current book page is added
 * beside it, named '<page> (book)'. Nothing is lost; a GM merges by hand."*). Nothing records what
 * a page said on the day it was imported, so a GM's edit cannot be told from an old book:
 *
 * - a held page the pack still has (same id) whose name and text match the pack's is left alone;
 * - one whose name or text differs is left alone too, and the pack's page is made BESIDE it, named
 *   `<page> (book)` (the suffix handed in, localised), under an id of its own (`bookCopyId`) that
 *   no pack page carries, so a link to the book still names the GM's copy and a second pass finds
 *   the copy already made;
 * - a page the pack has and the world does not is made, with the pack's id, inheriting ownership;
 * - a held page the pack no longer has is KEPT, whatever its id: an old book page may hold a GM's
 *   edit, and the repair cannot tell. The door says how many it kept.
 *
 * The entry's ownership, the GM-only closure (`closureFor`) and every page's own ownership are
 * never written.
 */

/** The parser's pack slug for the rules journals (`tools/parse-book/rules-journal.mjs#PACK`). */
export const RULES_PACK_SLUG = "rules";

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** `tools/parse-book/lib/markdown.mjs#slugify`, the same steps. */
export function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** SHA-256's round constants (FIPS 180-4 section 4.2.2). */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

/**
 * **SHA-256 IN PLAIN JAVASCRIPT** (the close review's finding 4): `crypto.subtle` exists only in a
 * secure context (HTTPS or localhost), so a GM reaching Foundry over plain HTTP on a LAN had no
 * digest at all and the repair threw. This is FIPS 180-4's SHA-256 over bytes, synchronous, with
 * no platform call; a Vitest holds it to Node's `createHash` and to the parser's ids.
 *
 * @param {Uint8Array} bytes
 * @returns {Uint8Array}  the 32-byte digest
 */
export function sha256(bytes) {
  const len = bytes.length;
  const padded = new Uint8Array(((len + 9 + 63) >>> 6) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = len * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(padded.length - 4, bits >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15];
      const b = W[i - 2];
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, H[i]);
  return out;
}

/** Sixteen characters of Foundry's id alphabet off a key's SHA-256, as the parser's `documentId`. */
function idOf(key) {
  const digest = sha256(new TextEncoder().encode(key));
  let id = "";
  for (let i = 0; i < 16; i++) id += ID_ALPHABET[digest[i] % ID_ALPHABET.length];
  return id;
}

/**
 * **THE ID A BOOK PAGE CARRIES** (`tools/parse-book/lib/markdown.mjs#documentId` for the rules pack,
 * which retires no slug): the first sixteen bytes of SHA-256 over `rules.<chapter>:<slug>`, each
 * read into Foundry's id alphabet. Synchronous and platform-free (`sha256`), so a plain-HTTP host
 * derives the same id as the parser (the close review's finding 4).
 *
 * @param {string} chapter  the chapter's name, `02-CHARACTER-OPTIONS`
 * @param {string} title    the page's title
 * @returns {string}
 */
export function rulesPageId(chapter, title) {
  return idOf(`${RULES_PACK_SLUG}.${chapter}:${slugify(title)}`);
}

/**
 * **THE ID OF THE BOOK'S COPY MADE BESIDE A GM'S PAGE** (the lead's ruling on finding 3): the same
 * derivation over `rules.<chapter>:<page id>:book`, so a second pass finds the copy it made, and a
 * key the parser never hashes (it hashes a slug, never an id with a `:book` tail), so the copy
 * never takes the id of the page it sits beside or of any page the pack carries.
 *
 * @param {string} chapter  the chapter's name
 * @param {string} pageId   the pack page's id
 * @returns {string}
 */
export function bookCopyId(chapter, pageId) {
  return idOf(`${RULES_PACK_SLUG}.${chapter}:${pageId}:book`);
}

/** Whether a held page reads as the pack's: the same name and the same text (the ruling's test). */
const matches = (mine, page) => mine.name === page.name && (mine.text?.content ?? "") === (page.text?.content ?? "");

/** A page to make from the pack's, under `id` and `name`, inheriting the chapter's ownership. */
function makePage(page, { id, name, sort, inherit }) {
  return {
    _id: id, name, type: page.type ?? "text", sort,
    title: page.title ?? { show: true, level: 1 },
    text: { format: page.text?.format ?? 1, content: page.text?.content ?? "" },
    ownership: { default: inherit }
  };
}

/**
 * **WHAT ONE HELD CHAPTER NEEDS** - the pages to make, or nothing at all on a second pass. A held
 * page is never written and never removed (the lead's ruling on the close review's finding 3).
 *
 * @param {{chapter?: string, held?: Array<object>, pack?: Array<object>, suffix?: string, inherit?: number}} o
 *   `chapter` the chapter's name, `held` the world chapter's pages, `pack` the compendium chapter's,
 *   each `{_id, name, sort, type, title, text}`; `suffix` the localised word the book's copy is
 *   named with (`AZEROTH.Journals.BookCopy`, *(book)*); `inherit` core's INHERIT ownership level
 * @returns {{create: Array<object>, copies: number, kept: string[]}}  `copies` how many of `create`
 *   are a book's copy beside a GM's page, `kept` the held pages the pack no longer has
 */
export function planChapterRepair({ chapter = "", held = [], pack = [], suffix = "(book)", inherit = -1 } = {}) {
  const heldById = new Map((held ?? []).filter(p => p && typeof p._id === "string").map(p => [p._id, p]));
  const packPages = [...(pack ?? [])].filter(p => p && typeof p._id === "string");
  const packIds = new Set(packPages.map(p => p._id));
  const create = [];
  let copies = 0;
  for (const page of packPages.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a._id.localeCompare(b._id))) {
    const mine = heldById.get(page._id);
    if (!mine) {
      create.push(makePage(page, { id: page._id, name: page.name, sort: page.sort ?? 0, inherit }));
      continue;
    }
    if (matches(mine, page)) continue;
    // The GM's copy stands; the book's goes beside it, once.
    const id = bookCopyId(chapter, page._id);
    if (heldById.has(id) || packIds.has(id)) continue;
    create.push(makePage(page, { id, name: `${page.name} ${suffix}`.trim(), sort: (mine.sort ?? page.sort ?? 0) + 1, inherit }));
    copies += 1;
  }
  const copyIds = new Set(packPages.map(p => bookCopyId(chapter, p._id)));
  const kept = [...heldById.keys()].filter(id => !packIds.has(id) && !copyIds.has(id)).sort();
  return { create, copies, kept };
}

/** Whether a plan writes nothing. */
export function planIsEmpty(plan) {
  return !plan || !plan.create?.length;
}

/** The class count of the book this repair was written for: the Death Knight's twelve (D-942). */
export const REPAIR_CLASS_COUNT = 12;

/** The number words 02 §7's heading may count its classes in. */
const CLASS_COUNT_WORDS = Object.freeze({
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16
});

/**
 * The class count 02 §7's page name states (`7. The thirteen classes` -> 13), or null where the
 * name is not that heading or counts in a word the table lacks.
 *
 * @param {string} name
 * @returns {number|null}
 */
export function classCountOf(name) {
  const m = /^7\. The ([a-z]+) classes$/i.exec(String(name ?? "").trim());
  return m ? (CLASS_COUNT_WORDS[m[1].toLowerCase()] ?? null) : null;
}

/**
 * **WHETHER THE RULES PACK CARRIES THE BOOK THIS REPAIR WAS WRITTEN FOR** (D-758's rule, as
 * migration 0.15.3's steps have it): a pack built before the Death Knight's 02 §7 counts fewer
 * than twelve classes, and a pass over it would bring the world up to an old book and mark the
 * world past this version.
 *
 * **KEYED ON THE CLASS COUNT, NEVER ON THE PAGE'S NAME** (the Necromancer plan's finding 6): it
 * asked for a page named *The twelve classes*, so the thirteenth class's book renamed §7 and the
 * repair read every newer pack as stale. A count of `REPAIR_CLASS_COUNT` or more carries it.
 *
 * @param {Array<{name: string, pages?: Array<{name: string}>}>} chapters  the compendium's entries
 * @returns {boolean}
 */
export function rulesPackCarriesRepair(chapters = []) {
  const options = (chapters ?? []).find(c => String(c?.name ?? "").toUpperCase() === "02-CHARACTER-OPTIONS");
  return Boolean(options?.pages?.some(p => (classCountOf(p?.name) ?? 0) >= REPAIR_CLASS_COUNT));
}

/**
 * **WHETHER THE RULES PACK'S 02 §7 COUNTS AT LEAST `count` CLASSES** (migration 0.16.0, the Demon
 * Hunter's book: *The fifteen classes*). Keyed on the count, never on the page's name (the
 * Necromancer plan's finding 6), so a later class's book still carries it.
 *
 * @param {Array<{name: string, pages?: Array<{name: string}>}>} chapters  the compendium's entries
 * @param {number} count
 * @returns {boolean}
 */
export function rulesPackCountsClasses(chapters = [], count = REPAIR_CLASS_COUNT) {
  const options = (chapters ?? []).find(c => String(c?.name ?? "").toUpperCase() === "02-CHARACTER-OPTIONS");
  return Boolean(options?.pages?.some(p => (classCountOf(p?.name) ?? 0) >= count));
}

/** The race count of the book the San'layn's repair was written for: thirteen (D-1154). */
export const REPAIR_RACE_COUNT = 13;

/**
 * The race count 02 §5's page name states (`5. The thirteen races` -> 13), or null.
 *
 * @param {string} name
 * @returns {number|null}
 */
export function raceCountOf(name) {
  const m = /^5\. The ([a-z]+) races$/i.exec(String(name ?? "").trim());
  return m ? (CLASS_COUNT_WORDS[m[1].toLowerCase()] ?? null) : null;
}

/**
 * **WHETHER THE RULES PACK CARRIES THE SAN'LAYN'S BOOK** (the San'layn plan's F7; D-1154). A page's id
 * is hashed from its title (`rulesPageId`), so renaming 02 §5 to *The thirteen races* and §7 to
 * *The fourteen classes* gives both new ids: a world that imported the book before holds the old
 * pages, and `repairRulesJournals` makes the new ones beside them. Keyed on the race COUNT (the
 * Necromancer plan's finding 6: never on a page's name), so a later people's book still carries it.
 *
 * @param {Array<{name: string, pages?: Array<{name: string}>}>} chapters  the compendium's entries
 * @returns {boolean}
 */
export function rulesPackCarriesPeoples(chapters = []) {
  const options = (chapters ?? []).find(c => String(c?.name ?? "").toUpperCase() === "02-CHARACTER-OPTIONS");
  return Boolean(options?.pages?.some(p => (raceCountOf(p?.name) ?? 0) >= REPAIR_RACE_COUNT));
}
