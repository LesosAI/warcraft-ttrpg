/**
 * Migration to 0.17.0 - professions replace careers (D-1903, D-1916). The
 * decisions are `rules/profession-migration.mjs`'s, under its Vitest; this only
 * walks the world and writes.
 *
 * 1. **Every career item is deleted**: world items, the items every actor
 *    holds (world actors and the unlinked tokens on every scene), and those in
 *    unlocked world packs.
 * 2. **A character's `system.career` is cleared**, its profession pointer set
 *    where it holds one, and `flags.azeroth-rpg.professionOwed` set where it
 *    holds none, so the sheet asks it to choose (D-1916). **Skill Ranks and the
 *    XP spent are left exactly as they are.**
 * 3. **A stub profession item takes 03's fields from the pack copy and keeps
 *    its Rank.**
 * 4. **An owned weapon, suit or gear item takes the pack copy's `craft` and
 *    `material`** (and a Cooked food or a new elixir its Use), compared against
 *    the PACK COPY (D-665); a Classic find never carries a stamp.
 *
 * Every document touched is logged; a second run touches nothing. **A pack
 * built before the professions DEFERS the step**: the chain runs this as soon
 * as the code is present, and a pass over an old gear pack would find no stamp
 * to compare against, so it answers `{deferred: true}`, writes nothing, and
 * `index.mjs#runMigrations` leaves the world's version where it was so the step
 * runs again once the packs are rebuilt (the professions review's M1).
 *
 * 5. **Two profession items on one character collapse to one** (03 section 4,
 *    one at a time): the one the character points at, else the first by id, is
 *    kept with the highest Rank any of them held (`professionCollapse`, the
 *    swap's own rule), and the others are deleted.
 */

import { RULES_PACK, careerDeletes, planCharacter, planMapLinks, planProfession, planRetiredChapters, planStamps, professionCollapse } from "../rules/profession-migration.mjs";
import { MAP_STATE_SETTING } from "../settings.mjs";
import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";

export const VERSION = "0.17.0";

/** The packs a stamp is read from. */
const EQUIPMENT_PACKS = Object.freeze({ weapon: "azeroth-rpg.weapons", armor: "azeroth-rpg.armor", gear: "azeroth-rpg.gear" });
const PROFESSION_PACK = "azeroth-rpg.professions";

/** A stored document's items as plain rows. */
const rowsOf = doc => [...(doc?.items ?? [])].map(i => ({ id: i.id, type: i.type }));

/** Whether a stored item is a Classic find (D-685). */
function isClassic(doc) {
  const raw = rawSystem(doc) ?? {};
  return raw.source?.document === "Classic" || Boolean(doc?._source?.flags?.["azeroth-rpg"]?.classic ?? doc?.flags?.["azeroth-rpg"]?.classic);
}

/**
 * Step 5: a character holding two or more profession items keeps one, at the highest
 * Rank (`professionCollapse`). The Rank is written before the others are deleted, so a
 * failed delete leaves a duplicate the next run collapses, never a lost Rank.
 */
async function collapseProfessions(actor, log) {
  if (actor?.type !== "character") return 0;
  const rows = [...(actor.items ?? [])].map(i => ({ id: i.id, type: i.type, system: { rank: rawSystem(i)?.rank } }));
  const plan = professionCollapse(rows, rawSystem(actor)?.profession?.itemId ?? null);
  if (!plan) return 0;
  if (plan.rankChanged) {
    await actor.updateEmbeddedDocuments("Item", [{ _id: plan.keep, "system.rank": plan.rank }], { render: false, azerothBags: "bypass" });
  }
  await actor.deleteEmbeddedDocuments("Item", plan.remove, { render: false, azerothBags: "bypass" });
  log(`azeroth-rpg | ${VERSION}: ${actor.name} (${actor.id}) - ${plan.remove.length} extra profession item(s) deleted, Rank ${plan.rank} kept`);
  return plan.remove.length + (plan.rankChanged ? 1 : 0);
}

export async function migrate(log = console.log) {
  const tables = {};
  for (const [type, id] of Object.entries(EQUIPMENT_PACKS)) tables[type] = await packSystems(id);
  const professions = await packSystems(PROFESSION_PACK);
  // An old pack carries no profession and no stamp: warn, and write nothing.
  const stamped = [...tables.gear.byIdentifier.values()].some(s => s?.craft);
  if (!professions.byIdentifier.size || !stamped) {
    // **DEFERRED, NOT DONE** (the professions review's M1): answering 0 here let the chain
    // stamp the world past 0.17.0 with every career still in place. `runMigrations` keeps the
    // setting where it is, warns with these words, and runs this again once the packs are rebuilt.
    return { deferred: true, reason: game.i18n.localize("AZEROTH.Migration.ProfessionsPackStale") };
  }
  // The retired rules chapter (step 6), judged before anything is written: a rules pack that still
  // holds 03-CAREERS predates the professions, and the step defers with the rest.
  const rules = game.packs.get(RULES_PACK);
  const bookIds = rules ? [...(await rules.getIndex()).keys()] : [];
  const retired = planRetiredChapters({ journals: journalRows(), bookIds, suffix: game.i18n.localize("AZEROTH.Journals.BookCopy") });
  if (retired.stale) return { deferred: true, reason: game.i18n.localize("AZEROTH.Migration.ProfessionsPackStale") };

  let touched = 0;
  // 1. The careers, deleted: world items, then each actor's, then unlocked world packs.
  const worldCareers = careerDeletes(game.items);
  if (worldCareers.length) {
    await Item.deleteDocuments(worldCareers);
    log(`azeroth-rpg | ${VERSION}: ${worldCareers.length} world career item(s) deleted`);
    touched += worldCareers.length;
  }
  const actors = [...game.actors];
  for (const scene of game.scenes) {
    for (const token of scene.tokens) if (!token.actorLink && token.actor) actors.push(token.actor);
  }
  for (const actor of actors) {
    touched += await collapseProfessions(actor, log);
    const ids = careerDeletes(actor.items);
    if (!ids.length) continue;
    await actor.deleteEmbeddedDocuments("Item", ids, { render: false, azerothBags: "bypass" });
    log(`azeroth-rpg | ${VERSION}: ${actor.name} (${actor.id}) - ${ids.length} career item(s) deleted`);
    touched += ids.length;
  }
  for (const pack of game.packs) {
    if (pack.metadata.packageType !== "world" || pack.locked) continue;
    if (pack.documentName === "Item") {
      const ids = careerDeletes(await pack.getDocuments());
      if (ids.length) {
        await Item.deleteDocuments(ids, { pack: pack.collection });
        log(`azeroth-rpg | ${VERSION}: pack ${pack.metadata.id} - ${ids.length} career item(s) deleted`);
        touched += ids.length;
      }
    } else if (pack.documentName === "Actor") {
      for (const actor of await pack.getDocuments()) {
        touched += await collapseProfessions(actor, log);
        const ids = careerDeletes(actor.items);
        if (!ids.length) continue;
        await actor.deleteEmbeddedDocuments("Item", ids, { render: false, azerothBags: "bypass" });
        log(`azeroth-rpg | ${VERSION}: pack ${pack.metadata.id}, ${actor.name} - ${ids.length} career item(s) deleted`);
        touched += ids.length;
      }
    }
  }

  // 2 to 4. The actor's writes, the profession item, and the stamps, through the one walk.
  touched += await walkWorld({
    actor: doc => (doc.type === "character"
      ? planCharacter({ system: rawSystem(doc), flags: doc._source?.flags ?? doc.flags, items: rowsOf(doc) })
      : null),
    item: doc => {
      const raw = rawSystem(doc);
      if (doc.type === "profession") return planProfession(raw, packCopy(professions, raw, doc.name));
      const table = tables[doc.type];
      if (!table) return null;
      const classic = isClassic(doc);
      return planStamps({ type: doc.type, system: raw, classic }, classic ? null : packCopy(table, raw, doc.name));
    }
  }, log);

  // 6. The retired rules chapter (O-700): 03-CAREERS, where the importer made it and nobody made it
  // into something else, is deleted (its folder lists it no longer: a folder's contents are its
  // documents' own `folder`), and a world map link into it goes with it. A journal kept is warned.
  for (const k of retired.kept) {
    const line = `azeroth-rpg | ${VERSION}: the journal "${k.name}" (${k.id}) is left in place (${KEPT_WHY[k.reason] ?? k.reason}); delete it by hand if it is the retired 03-CAREERS`;
    console.warn(line);
    log(line);
  }
  if (retired.deletes.length) {
    const names = retired.deletes.map(id => game.journal.get(id)?.name ?? id);
    await JournalEntry.deleteDocuments(retired.deletes.filter(id => game.journal.has(id)));
    log(`azeroth-rpg | ${VERSION}: the retired rules chapter deleted: ${names.join(", ")} (${retired.deletes.join(", ")})`);
    touched += retired.deletes.length;
    let stored = null;
    try { stored = foundry.utils.deepClone(game.settings.get("azeroth-rpg", MAP_STATE_SETTING)); } catch { stored = null; }
    const links = planMapLinks(stored, retired.deletes);
    if (links) {
      await game.settings.set("azeroth-rpg", MAP_STATE_SETTING, links);
      log(`azeroth-rpg | ${VERSION}: the world map's links into the retired chapter cleared`);
      touched += 1;
    }
  }
  return touched;
}

/** Why a journal named for a retired chapter is kept (`planRetiredChapters`' reasons), for the log. */
const KEPT_WHY = Object.freeze({
  notImported: "not made by the rules import",
  renamed: "renamed since it was imported",
  pageAdded: "it holds a page the chapter never had",
  pageEdited: "a page was edited after it was imported"
});

/** The world's journal entries as `planRetiredChapters` reads them: stored flags, page names and stamps. */
function journalRows() {
  return [...(game.journal ?? [])].map(j => ({
    id: j.id,
    name: j.name,
    flags: j._source?.flags ?? j.flags ?? {},
    pages: [...(j.pages ?? [])].map(p => ({ name: p.name, _stats: p._source?._stats ?? p._stats ?? {} }))
  }));
}
