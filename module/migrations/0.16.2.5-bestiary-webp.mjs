/**
 * Migration to 0.16.2.5 - the bestiary's portraits and tokens are WebP (D-1902; the lead:
 * *"Convert to WebP (Recommended)"*).
 *
 * The PNG set took the public release zip past GitHub's limit, so every file under
 * `assets/art/bestiary/portraits/` and `tokens/` is now `<slug>.webp` and the PNGs left the
 * repository. A world that dragged a creature out before this still names the `.png`, which
 * is no longer served: the sheet, the sidebar and the canvas would draw a broken image.
 *
 * **What is rewritten is a PATH, wherever it is stored.** Every string under a document's
 * source that holds a served path to a file in the system's bestiary `portraits/` or `tokens/`
 * folder ending `.png` takes `.webp` in its place, and nothing else in the string moves (`rewritePath`). That
 * reaches `img`, `prototypeToken.texture.src` and `system.art`, and with them the places a
 * creature's art is copied to: a shape's effect and its form snapshot (`flags.azeroth-rpg.shape`),
 * a token's kept appearance, a description that shows the plate. The documents walked:
 *
 * - world actors and world items, every embedded item and Active Effect on them, and an item's
 *   own effects;
 * - every token placed on every scene, linked or not, and an unlinked token's synthetic actor
 *   with its items and effects (written through the actor, so the change lands in the delta);
 * - the Actor, Item and Scene documents of every unlocked world pack, the same way.
 *
 * **Present-key-safe**: the update names only the keys whose string changed, as dotted paths;
 * an array that holds one is written whole, because an array has no dotted path. **Idempotent**:
 * a `.webp` path matches nothing, so a second run plans nothing. A GM's own art is never
 * touched: only this system's bestiary folders match. A path to a PNG that never shipped is
 * rewritten all the same, and draws broken either way.
 *
 * Earlier migrations stay as they were written: 0.11.6 stamps `tokenFor`/`portraitFor`, which
 * answer `.webp` now, so nothing in the chain writes a bestiary `.png` back.
 */

/** The migration's version, as the chain names it. */
export const VERSION = "0.16.2.5";

/** A bestiary portrait or token path ending `.png`; the capture is everything before the extension. */
const PNG_PATH = /(systems\/azeroth-rpg\/assets\/art\/bestiary\/(?:portraits|tokens)\/[A-Za-z0-9_-]+)\.png(?![A-Za-z0-9_-])/g;

/**
 * A string with every bestiary portrait or token `.png` path moved to `.webp`.
 *
 * @param {string} value
 * @returns {string}
 */
export function rewritePath(value) {
  if (typeof value !== "string" || !value.includes("assets/art/bestiary/")) return value;
  return value.replace(PNG_PATH, "$1.webp");
}

/** The WebP path back to the `.png` it replaced: the inverse of `rewritePath`, for `withoutWebp`. */
const WEBP_PATH = /(systems\/azeroth-rpg\/assets\/art\/bestiary\/(?:portraits|tokens)\/[A-Za-z0-9_-]+)\.webp(?![A-Za-z0-9_-])/g;

/**
 * A pack system with D-1902's extension move undone, for a table that records what moved BEFORE
 * it (0.16.1.1's BEFORE table describes the audit alone, as `withoutRaise` keeps 0.16.2.4's raise
 * out of it, so the two migrations never write one field twice).
 *
 * @param {object} system
 * @returns {object}  a copy where anything moved, else the same object
 */
export function withoutWebp(system) {
  return rewriteDeep(system, value => (typeof value === "string" && value.includes("assets/art/bestiary/")
    ? value.replace(WEBP_PATH, "$1.png") : value)).value;
}

/** A value with every string inside it rewritten, and whether anything moved. Never mutates. */
function rewriteDeep(value, rewrite = rewritePath) {
  if (typeof value === "string") {
    const next = rewrite(value);
    return { value: next, changed: next !== value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map(v => {
      const r = rewriteDeep(v, rewrite);
      changed ||= r.changed;
      return r.value;
    });
    return { value: changed ? out : value, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const r = rewriteDeep(v, rewrite);
      changed ||= r.changed;
      out[k] = r.value;
    }
    return { value: changed ? out : value, changed };
  }
  return { value, changed: false };
}

/** Keys never planned: identity, bookkeeping, and the embedded collections each walked as documents. */
const SKIPPED = new Set(["_id", "_stats", "items", "effects", "delta"]);

/**
 * The update for one stored document, or null: a dotted key for every string that moved and
 * an array key, whole, for an array holding one.
 *
 * @param {object|null} source  the document's stored `_source`
 * @returns {object|null}
 */
export function planRewrite(source) {
  if (!source || typeof source !== "object") return null;
  const update = {};
  const visit = (object, prefix) => {
    for (const [key, value] of Object.entries(object)) {
      if (!prefix && SKIPPED.has(key)) continue;
      const at = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string") {
        const next = rewritePath(value);
        if (next !== value) update[at] = next;
      } else if (Array.isArray(value)) {
        const r = rewriteDeep(value);
        if (r.changed) update[at] = r.value;
      } else if (value && typeof value === "object") {
        visit(value, at);
      }
    }
  };
  visit(source, "");
  return Object.keys(update).length ? update : null;
}

/** A document's stored source. */
function sourceOf(doc) {
  return doc?._source ?? doc?.toObject?.() ?? null;
}

/** The documents of an embedded collection, as an array. */
function membersOf(collection) {
  if (!collection) return [];
  return Array.isArray(collection) ? collection : [...(collection.contents ?? collection.values?.() ?? [])];
}

export async function migrate(log = console.log) {
  let touched = 0;

  const write = async (doc, where, options = {}) => {
    let update = planRewrite(sourceOf(doc));
    // A synthetic actor has no prototype of its own: its delta holds the token's overrides alone.
    if (update && doc.isToken === true) {
      update = Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith("prototypeToken")));
      if (!Object.keys(update).length) update = null;
    }
    if (!update) return;
    // Every migration is exempt from the bag doors (D-737); an image never moves a thing anyway.
    await doc.update(update, { render: false, diff: false, azerothBags: "bypass", ...options });
    log(`azeroth-rpg | ${VERSION} ${where}: ${doc.name ?? doc.documentName ?? "document"} (${doc.id}) - ${Object.keys(update).join(", ")}`);
    touched++;
  };

  const writeItem = async (item, where) => {
    await write(item, where);
    for (const effect of membersOf(item.effects)) await write(effect, `${where}, ${item.name}`);
  };

  const writeActor = async (actor, where) => {
    await write(actor, where);
    for (const item of membersOf(actor.items)) await writeItem(item, `${where}, ${actor.name}`);
    for (const effect of membersOf(actor.effects)) await write(effect, `${where}, ${actor.name}`);
  };

  const writeScene = async (scene, where) => {
    for (const token of membersOf(scene.tokens)) {
      await write(token, `token on ${where}`);
      if (!token.actorLink && token.actor) await writeActor(token.actor, `token on ${where}`);
    }
  };

  for (const item of membersOf(game.items)) await writeItem(item, "world item");
  for (const actor of membersOf(game.actors)) await writeActor(actor, "world actor");
  for (const scene of membersOf(game.scenes)) await writeScene(scene, scene.name);

  for (const pack of membersOf(game.packs)) {
    if (pack.metadata?.packageType !== "world" || pack.locked) continue;
    const where = `pack ${pack.metadata.id}`;
    if (pack.documentName === "Item") {
      for (const doc of await pack.getDocuments()) await writeItem(doc, where);
    } else if (pack.documentName === "Actor") {
      for (const doc of await pack.getDocuments()) await writeActor(doc, where);
    } else if (pack.documentName === "Scene") {
      for (const doc of await pack.getDocuments()) await writeScene(doc, `${where}, ${doc.name}`);
    }
  }

  log(`azeroth-rpg | ${VERSION}: ${touched} document(s) moved from bestiary .png art to .webp`);
  return touched;
}
