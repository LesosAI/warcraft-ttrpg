/**
 * The book, in the Journals tab (the lead, 2026-09-08).
 *
 * `packs-src/rules/` renders every chapter to a JournalEntry — **18 entries
 * and 231 pages**, one page a section — and they have only ever lived in a
 * compendium. A compendium shows in the *Compendium Packs* sidebar tab and
 * nowhere else: the Journals tab lists the WORLD's journals, so the whole
 * book was unreachable from the place a reader looks for it, and a `@UUID`
 * link into it opened a document nothing else could surface.
 *
 * This copies them into the world once, into a folder, and is safe to run
 * again: a chapter already imported is left exactly as it is, edits and all.
 *
 * **Ownership follows the packs.** 13-GM-GUIDE and 14-BESTIARY are the GM's
 * (CLAUDE.md §9 — a player may not browse the bestiary), and everything else
 * is a book the table reads. Change it per journal in Foundry afterwards; this
 * only sets what a fresh import starts with.
 */

/** The compendium the chapters live in. */
export const RULES_PACK = "azeroth-rpg.rules";

/** The world folder the chapters are imported into. */
export const RULES_FOLDER = "Rules";

/** Chapters a player may not open. The rest are the book they are playing. */
const GM_ONLY = ["13-GM-GUIDE", "14-BESTIARY"];

/** Marks an imported chapter so a second run knows it is already here. */
const FLAG = "sourcePack";

/** Whether a journal in the world came from the rules compendium. */
export function isImportedChapter(journal) {
  return journal?.getFlag?.("azeroth-rpg", FLAG) === RULES_PACK;
}

/** The world's copy of a chapter, by the compendium document's id. */
export function worldChapter(sourceId) {
  return game.journal?.find(j => isImportedChapter(j) && j.getFlag("azeroth-rpg", "sourceId") === sourceId) ?? null;
}

/** The world's copy of a chapter, by name — `12A-EASTERN-KINGDOMS`. */
export function worldChapterNamed(name) {
  const wanted = String(name ?? "").toUpperCase();
  return game.journal?.find(j => isImportedChapter(j) && j.name?.toUpperCase().includes(wanted)) ?? null;
}

/** Make (or find) the folder the chapters go in. */
async function rulesFolder() {
  const existing = game.folders?.find(f => f.type === "JournalEntry" && f.name === RULES_FOLDER);
  if (existing) return existing;
  return Folder.create({ name: RULES_FOLDER, type: "JournalEntry", sorting: "a" });
}

/** Whether this chapter is one a player may not open (CLAUDE.md §9). */
function isGmOnly(name) {
  return GM_ONLY.some(chapter => String(name ?? "").toUpperCase().includes(chapter));
}

/** What a player may do with a chapter by default. */
function ownershipFor(name) {
  return { default: isGmOnly(name) ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE : CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER };
}

/**
 * The update that CLOSES a chapter the world already holds open, or null
 * where there is nothing to do.
 *
 * **A chapter imported before `GM_ONLY` existed keeps whatever ownership it
 * was given, forever**, because the import skips a chapter the world already
 * holds. 14-BESTIARY sat at OBSERVER in the lead's world for exactly that
 * reason and every player could read it - the rule was written and nothing
 * re-read it (2026-09-09).
 *
 * **It only ever closes.** A player-facing chapter the GM has deliberately
 * shut stays shut, because raising ownership here would overrule them on a
 * chapter the system has no security interest in. And only `default` moves:
 * a GM who has granted one player the bestiary keeps that grant, which is a
 * decision the system should not be able to undo by re-running an import.
 *
 * **A page that carries its own ownership is reset to INHERIT**, or it reads
 * straight past the closed entry above it.
 */
function closureFor(journal) {
  if (!isGmOnly(journal?.name)) return null;
  const none = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
  const inherit = CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT;
  const update = {};
  if ((journal.ownership?.default ?? none) > none) update["ownership.default"] = none;
  const pages = [...(journal.pages ?? [])]
    .filter(page => (page.ownership?.default ?? inherit) !== inherit)
    .map(page => ({ _id: page.id, "ownership.default": inherit }));
  if (pages.length) update.pages = pages;
  return Object.keys(update).length ? update : null;
}

/**
 * Copy every chapter the world does not already hold, and close any it holds
 * open that a player may not read.
 *
 * @returns {Promise<{added: string[], already: string[], closed: string[], folder: Folder|null}>}
 */
export async function importRulesJournals() {
  const pack = game.packs.get(RULES_PACK);
  if (!pack) throw new Error(`The ${RULES_PACK} compendium is not present`);

  const documents = await pack.getDocuments();
  const folder = await rulesFolder();

  const added = [];
  const already = [];
  const closed = [];
  const payload = [];
  for (const doc of documents) {
    const held = worldChapter(doc.id);
    if (held) {
      already.push(doc.name);
      const closure = closureFor(held);
      if (closure) {
        await held.update(closure);
        closed.push(doc.name);
      }
      continue;
    }
    const data = doc.toObject();
    delete data._id;
    data.folder = folder?.id ?? null;
    data.ownership = ownershipFor(doc.name);
    // Every page inherits the entry's ownership rather than carrying its own,
    // so changing a chapter's ownership later changes all 231 pages with it.
    for (const page of data.pages ?? []) page.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT };
    foundry.utils.setProperty(data, `flags.azeroth-rpg.${FLAG}`, RULES_PACK);
    foundry.utils.setProperty(data, "flags.azeroth-rpg.sourceId", doc.id);
    payload.push(data);
    added.push(doc.name);
  }

  if (payload.length) await JournalEntry.createDocuments(payload, { keepId: false });
  return { added, already, closed, folder };
}

/**
 * Import, and say what happened.
 *
 * A chapter CLOSED is said separately and as a warning, because it means
 * players could read the bestiary until the moment the button was pressed
 * and the GM should know that rather than read it as housekeeping.
 */
export async function importRulesJournalsAndReport() {
  if (!game.user?.isGM) return null;
  const result = await importRulesJournals();
  const message = result.added.length
    ? game.i18n.format("AZEROTH.Journals.Imported", { added: result.added.length, already: result.already.length })
    : game.i18n.format("AZEROTH.Journals.AlreadyThere", { already: result.already.length });
  ui.notifications?.info(message);
  if (result.closed.length) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Journals.Closed", { chapters: result.closed.join(", ") }));
  }
  return result;
}
