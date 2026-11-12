/**
 * The walk every migration makes (CLAUDE.md §10): world items, world actors
 * and their embedded items, the unlinked token actors on every scene, and
 * the documents of every unlocked world pack. Lifted out of 0.10.0 so a
 * new version writes its builders and nothing else.
 */

/**
 * What a chain run has already read, so a second migration wanting the same
 * pack does not fetch it twice (D-697).
 *
 * **The three equipment packs are 2,443 documents** and 0.12.0, 0.12.1 and
 * 0.12.2 each want all three: without this the chain constructs 7,329 Items
 * to answer the same question three times, and the whole run went past the
 * 20-second ceiling `quench-tests.mjs` holds it to. **It is safe because
 * `walkWorld` never writes to a SYSTEM pack** — it skips every pack whose
 * `packageType` is not `world` — so nothing a migration does can stale one of
 * these, and `runMigrations` empties it either way when the chain is done.
 */
const READ = new Map();

/** Empty the cache. `runMigrations` calls it when the chain ends. */
export function forgetPacks() {
  READ.clear();
}

/**
 * A pack's systems by identifier and by name, for a field restored from the
 * pack copy.
 *
 * **The grants ride in the same pass** (D-701). `flags.azeroth-rpg.grants` is
 * where 08 §6's sentences live on a generated or found item, and a migration
 * that wanted them would otherwise construct all 2,443 Items a second time -
 * which is the cost the cache above exists to avoid.
 */
export async function packSystems(packId) {
  const held = READ.get(packId);
  if (held) return held;
  const byIdentifier = new Map();
  const byName = new Map();
  const grantsByIdentifier = new Map();
  const grantsByName = new Map();
  const pack = game.packs.get(packId);
  if (pack) {
    for (const doc of await pack.getDocuments()) {
      const object = doc.toObject();
      const system = object.system ?? {};
      const grants = object.flags?.["azeroth-rpg"]?.grants ?? null;
      if (system.identifier) {
        byIdentifier.set(system.identifier, system);
        if (grants) grantsByIdentifier.set(system.identifier, grants);
      }
      byName.set(doc.name, system);
      if (grants) grantsByName.set(doc.name, grants);
    }
  }
  const table = { byIdentifier, byName, grantsByIdentifier, grantsByName };
  READ.set(packId, table);
  return table;
}

/**
 * **AN IDENTIFIER THAT MOVED TO ANOTHER DOCUMENT** (the Chronomancer's stage 2b, finding 9 of
 * the 2a review): a world's copy of 08 §11's 80c Hourglass tool still carries `identifier:
 * hourglass` and the tool's section, while the pack's `hourglass` is now 08 §9's Augment (the
 * tool was renamed Sand-clock, D-849). A copy is found by the identifier its section had then,
 * and its old name - *Hourglass* - never reaches the Augment either.
 */
export const RETIRED_IDENTIFIERS = Object.freeze({
  hourglass: Object.freeze({ section: "11 · Adventuring gear · Adventuring tools", identifier: "sand-clock", name: "Sand-clock" })
});

/** The identifier and name a stored document's copy is found by, past a retired identifier. */
function copyKeys(raw, name) {
  const retired = RETIRED_IDENTIFIERS[raw?.identifier];
  if (retired && raw?.source?.section === retired.section) return { identifier: retired.identifier, name: retired.name };
  return { identifier: raw?.identifier, name };
}

/** The pack copy of a document: by identifier first, then by name. */
export function packCopy(table, raw, name) {
  const k = copyKeys(raw, name);
  return table?.byIdentifier.get(k.identifier) ?? table?.byName.get(k.name) ?? null;
}

/** The pack copy's own grant sentences, found the same way. */
export function packGrants(table, raw, name) {
  const k = copyKeys(raw, name);
  return table?.grantsByIdentifier?.get(k.identifier) ?? table?.grantsByName?.get(k.name) ?? null;
}

/** A document's stored system, before preparation. */
export function rawSystem(doc) {
  return doc._source?.system ?? doc.toObject?.().system ?? doc.system;
}

/**
 * Walk the world. `item(doc)` and `actor(doc)` return an update or null;
 * every document touched is logged and counted. Idempotency is the
 * builders' business: a second run must return null everywhere.
 *
 * **`items(actorDoc)` is the third builder** (D-742): it answers an ARRAY of
 * embedded-item updates for one actor, written in ONE
 * `updateEmbeddedDocuments` call. A rule about where things are KEPT cannot be
 * built one document at a time - whether a backpack is worn depends on what
 * else the actor holds, and four separate writes would each be judged against
 * a half-migrated collection. It carries `azerothBags: "bypass"`, because
 * `AzerothItem`'s operation hooks judge exactly the state this is repairing.
 *
 * **`embeds(actorDoc)` is the fourth builder** (D-781): item DATA to create on
 * one actor, in ONE `createEmbeddedDocuments` call - the Legacy branch a world's
 * characters were owed before the pack held one. It carries the same bypass.
 */
export async function walkWorld({ item = null, actor = null, items = null, embeds = null } = {}, log = console.log) {
  let touched = 0;

  const applyToItem = async (doc, where) => {
    const update = item ? await item(doc) : null;
    if (!update) return;
    // **EVERY MIGRATION IS EXEMPT FROM THE BAG DOORS** (D-737). A repair is
    // written against the state it is repairing, so a rule judged at the door
    // would refuse the first write of the run for the fault it is fixing.
    await doc.update(update, { render: false, diff: false, azerothBags: "bypass" });
    log(`azeroth-rpg | ${where}: ${doc.name} (${doc.id})`);
    touched++;
  };

  const applyToActor = async (doc, where) => {
    const update = actor ? await actor(doc) : null;
    if (update) {
      await doc.update(update, { render: false, diff: false });
      log(`azeroth-rpg | ${where}: ${doc.name} (${doc.id})`);
      touched++;
    }
    for (const embedded of doc.items) await applyToItem(embedded, `${where}, ${doc.name}`);
    const batch = items ? await items(doc) : null;
    if (batch?.length) {
      await doc.updateEmbeddedDocuments("Item", batch, { render: false, diff: false, azerothBags: "bypass" });
      log(`azeroth-rpg | ${where}: ${doc.name} (${doc.id}) — ${batch.length} item(s) rehoused`);
      touched += batch.length;
    }
    const made = embeds ? await embeds(doc) : null;
    if (made?.length) {
      await doc.createEmbeddedDocuments("Item", made, { render: false, azerothBags: "bypass" });
      log(`azeroth-rpg | ${where}: ${doc.name} (${doc.id}) — ${made.length} item(s) embedded`);
      touched += made.length;
    }
  };

  for (const doc of game.items) await applyToItem(doc, "world item");
  for (const doc of game.actors) await applyToActor(doc, "world actor");

  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor) continue;
      await applyToActor(token.actor, `token on ${scene.name}`);
    }
  }

  for (const worldPack of game.packs) {
    if (worldPack.metadata.packageType !== "world" || worldPack.locked) continue;
    if (worldPack.documentName === "Item") {
      for (const doc of await worldPack.getDocuments()) await applyToItem(doc, `pack ${worldPack.metadata.id}`);
    } else if (worldPack.documentName === "Actor") {
      for (const doc of await worldPack.getDocuments()) await applyToActor(doc, `pack ${worldPack.metadata.id}`);
    }
  }

  return touched;
}
