/**
 * Migration to 0.12.13 - 04's row order on the talents a world already holds
 * (D-218, D-758).
 *
 * The talent tree lays a tier out in 04's ROW ORDER (D-218: *column position
 * within a tier is still derived from row order and is still never written
 * down*), and until D-758 no row order was stored anywhere: `buildTree`
 * sorted a tier alphabetically, which is why the tree never matched the book.
 * The parser now stamps each talent's row into the item's built-in `sort` -
 * 100, 200, ... down its branch's table - and a class grants its talents with
 * it (`grantClassTalents` embeds `toObject()`). This is the repair pass over
 * the copies a world already holds.
 *
 * **COMPARED AGAINST THE PACK'S VALUE, NEVER AGAINST ABSENT** (D-665). `sort`
 * is a core field with an initial of 0, so an embedded talent made before this
 * version reads 0 and never `undefined`: a stamp "where missing" would find
 * nothing to stamp. The pack's number is the source and any other number is
 * rewritten.
 *
 * **Only talents on ACTORS.** A world Item's `sort` is its place in the
 * sidebar the GM arranged, not a row of 04, so world Items and world Item
 * packs are left alone; the tree reads an actor's own talents and nothing
 * else. **A racial talent is skipped**: it is built from the race's rows, has
 * no branch and no row, and its own tile orders by tier and name.
 *
 * **A pack that predates D-758 stamps nothing, and SAYS so.** The chain runs
 * this as soon as the code is present, whatever the manifest's version, and
 * a talents pack not yet rebuilt carries no row. A throw would stop the chain
 * with a `console.error` on every load until the pack was rebuilt - and the
 * smoke run fails on any console error, which is every live test run in the
 * meantime. So it warns, names the fix, and stamps nothing: the tree falls
 * back to the name and still draws every arrow. **The cost is recorded, not
 * hidden**: a world that loads between the code and the rebuilt pack is
 * marked past 0.12.13 with its existing characters unstamped, and taking the
 * `migrationVersion` setting back to 0.12.12 re-runs it.
 *
 * Idempotent by construction: after one pass every talent's `sort` equals the
 * pack's and the builder answers nothing.
 */

import { walkWorld } from "./walk.mjs";

/** The pack a talent's row is read from. */
export const TALENTS_PACK = "azeroth-rpg.talents";

/** A talent's address in the pack: its class and its identifier. */
export function rowKey(system) {
  const className = system?.className;
  const identifier = system?.identifier;
  return className && identifier ? `${className}/${identifier}` : null;
}

/**
 * The pack's row order, from an index entry list: `rowKey` to `sort`.
 *
 * An entry with no class (a racial talent never is one), no identifier or no
 * positive `sort` is left out, so an old pack yields an empty map.
 *
 * @param {Iterable<{sort?: number, system?: {className?: string, identifier?: string}}>} index
 * @returns {Map<string, number>}
 */
export function rowsFromIndex(index) {
  const rowOf = new Map();
  for (const entry of index ?? []) {
    const key = rowKey(entry?.system);
    const sort = Number(entry?.sort);
    if (!key || !Number.isFinite(sort) || sort <= 0) continue;
    rowOf.set(key, sort);
  }
  return rowOf;
}

/**
 * The embedded-item updates for one actor: `{_id, sort}` for every class
 * talent whose stored `sort` is not the pack's row.
 *
 * @param {Iterable<{_id?: string, id?: string, type?: string, sort?: number, system?: object}>} items
 *        the actor's items, as their stored source (`_source`) reads
 * @param {Map<string, number>} rowOf  `rowsFromIndex`'s answer
 * @returns {{_id: string, sort: number}[]}
 */
export function buildRowOrderUpdates(items, rowOf) {
  const out = [];
  if (!(rowOf instanceof Map) || rowOf.size === 0) return out;
  for (const item of items ?? []) {
    if (!item || item.type !== "talent") continue;
    const system = item.system ?? {};
    // The race's eight carry no row: `className` is empty and `race` names them.
    if (system.race) continue;
    const want = rowOf.get(rowKey(system));
    if (want === undefined) continue;
    if (Number(item.sort) === want) continue;
    const id = item._id ?? item.id;
    if (!id) continue;
    out.push({ _id: id, sort: want });
  }
  return out;
}

/** An item as `buildRowOrderUpdates` reads it: its STORED sort and system. */
function storedOf(item) {
  const source = item._source ?? item;
  return { _id: item.id ?? source._id, type: item.type, sort: source.sort, system: source.system ?? item.system };
}

export async function migrate(log = console.log) {
  const pack = game.packs.get(TALENTS_PACK);
  // No talents pack at all is nothing to read and nothing to do.
  if (!pack) return 0;
  const index = await pack.getIndex({ fields: ["sort", "system.className", "system.identifier"] });
  const rowOf = rowsFromIndex(index);
  if (!rowOf.size) {
    console.warn(`azeroth-rpg | ${TALENTS_PACK} carries no row order yet (D-758), so no talent was stamped. `
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back to 0.12.12 and reload.");
    return 0;
  }
  return walkWorld({
    items: actor => buildRowOrderUpdates(actor.items.map(storedOf), rowOf)
  }, log);
}
