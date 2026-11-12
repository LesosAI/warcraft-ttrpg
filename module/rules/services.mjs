/**
 * **08's SERVICES** (the lead: *"Add services to the compendium"*). Pure: no Foundry
 * imports (CLAUDE.md §3).
 *
 * 08 §15's *Hired transport* and §16's *Lodging*, *Upkeep*, *Hire* and *Services* tables
 * price things a character pays for and never carries: a night at an inn, a day's guide,
 * a ferry across a river. `tools/parse-book/services.mjs` renders every row into a pack of
 * its own, one `gear` document a row, so the compendium browser can show them; the gear
 * parser still skips those rows, because nothing there goes in a bag.
 *
 * **An entry is a reference, never a sheet's.** Each wears `flags.azeroth-rpg.serviceEntry`
 * and `AzerothItem#_preCreate` refuses a copy of one on any actor, in words
 * (`serviceRefusal`). A world item that is no actor's is allowed: a GM may keep a price list
 * in the Items sidebar. The gadgets pack is the precedent (`rules/gadgets.mjs#isGadgetEntry`).
 */

/** The pack every service entry lives in. */
export const SERVICES_PACK = "azeroth-rpg.services";

/**
 * The mark an entry wears, `flags.azeroth-rpg.serviceEntry = {column}`: the header of the
 * table's price column (`Cost`, `A night` or `A day`), read off the chapter. It travels with
 * every copy of the entry (a drag onto a sheet, a macro, an import into the world), which
 * is what lets `isServiceEntry` refuse it at every door.
 */
export const SERVICE_ENTRY_FLAG = "serviceEntry";

/** The lang key a refused copy is warned with. */
export const SERVICE_REFUSED = "AZEROTH.Service.EntryRefused";

/**
 * **WHETHER THIS IS A SERVICES-COMPENDIUM ENTRY, OR A COPY OF ONE.** Reads a live document
 * and `toObject()` data alike, as `isGadgetEntry` does: `Document#flags` is the source
 * object.
 *
 * @param {{flags?: object}} data  an Item, or the data one is created from
 * @returns {boolean}
 */
export function isServiceEntry(data) {
  const mark = data?.flags?.["azeroth-rpg"]?.[SERVICE_ENTRY_FLAG];
  return Boolean(mark) && typeof mark === "object";
}

/**
 * **THE ONE JUDGEMENT OF A SERVICE ENTRY'S CREATION.** A copy on any actor, a character or
 * a creature, is refused: a service is paid for and never carried. With no parent, or a
 * parent that is not an actor, it is allowed.
 *
 * @param {{parent?: {documentName?: string}|null, data?: object}} args
 * @returns {string|null} the lang key of the refusal, or null where the create may go ahead
 */
export function serviceRefusal({ parent = null, data = null } = {}) {
  if (parent?.documentName !== "Actor") return null;
  return isServiceEntry(data) ? SERVICE_REFUSED : null;
}
