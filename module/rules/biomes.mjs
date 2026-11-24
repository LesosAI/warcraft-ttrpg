/**
 * What can be gathered where (D-1915). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * `biomes.json` is 11-DOWNTIME §12 rendered by `tools/parse-book/biomes.mjs`
 * (`npm run packs:parse`), never typed: `gathering.test.mjs` fails when it is
 * not what the generator would write from the chapter now. This module hands
 * it to `gathering.mjs#gatherable`, the one law, so the sheet's Biome dropdown
 * and `workflows.gather` read one table.
 */

import data from "./biomes.json" with { type: "json" };
import { gatherable } from "./gathering.mjs";

/** `{[biome]: {[family]: [{material, tier}]}}`, frozen. */
export const BIOME_TABLE = Object.freeze(data.table);

/** The ten biome keys in 11 §12's order (`AZEROTH.biomes`). */
export const BIOME_KEYS = Object.freeze([...data.biomes]);

/**
 * The nodes of a family in a biome at the tier and below (D-1927), each
 * `{material, tier, dc}`, off the chapter's table.
 */
export function nodesIn({ biome, family, tier = 1 } = {}) {
  return gatherable({ biome, family, tier, table: BIOME_TABLE });
}

/** The node one material is in a biome, or null (the door's guard). */
export function nodeOf({ biome, family, material } = {}) {
  return (BIOME_TABLE[biome]?.[family] ?? []).find(n => n.material === material) ?? null;
}
