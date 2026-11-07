/**
 * Migration to 0.13.4 - six shells take their Use, on the creatures a world already holds (D-811).
 *
 * D-807 counted twenty creature abilities that spend what 14 prices and lay nothing. The lead,
 * 2026-11-06: *"Fix this. A Use that lays nothing records why. [...] A ceiling of 20 on such rows
 * may only fall."* Six of the twenty state a mechanic one of D-809's Boss doors lands, and
 * `rules/creature-plans.mjs` gives each its row: Battle Squawk, Named Quarry, Counterspell,
 * Arcane Torrent, Calls the Watch and Berserk. The pack is regenerated, so a creature dragged out
 * afresh is right already; this is the repair pass over what a world holds - its actors, the
 * unlinked tokens on its scenes and the creatures in its unlocked Actor packs (`walk.mjs`) - in
 * 0.13.1's and 0.13.2's shape:
 *
 * - **THE OLD COPIES ARE RECORDED, NOT DERIVED.** `OLD_CREATURE_PLANS` names, for each of the six
 *   rows, every copy a world may hold: the 0.13.0 pack's (0.13.1's own record) and the 0.13.3
 *   pack's (the shell with its reason), generated once by `tools/gen-0.13.4-old.mjs` from
 *   `git show HEAD:packs-src/bestiary/<slug>.yaml` and written sparse against `emptyAutomation()`.
 * - **A ROW IS RESTAMPED ONLY WHERE IT STILL HOLDS AN OLD COPY** (D-665: compared against the pack,
 *   never against `undefined`). A row equal to neither the old copies nor the pack's is a GM's own:
 *   kept, and named in the log. The use a creature has spent stays spent.
 * - **A PACK NOT YET REBUILT STAMPS NOTHING, AND SAYS SO**, as 0.13.1 and 0.13.2 do.
 *
 * Idempotent: after one pass every stale row holds the pack's copy, and a second finds nothing.
 */

import { cleanAutomation } from "../rules/ability-automation.mjs";
import { bestiaryEntryId, comparable } from "./0.13.1-bestiary-descriptors.mjs";
import { packSystems, rawSystem, walkWorld } from "./walk.mjs";

/** The pack every new descriptor is read from. */
export const BESTIARY_PACK = "azeroth-rpg.bestiary";

/** Freeze a literal all the way down. */
function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/**
 * The six rows D-811 gave a plan, by the creature's file in `packs-src/bestiary`: the entry's
 * `_id`, its name, and each row's old copies, oldest first.
 */
export const OLD_CREATURE_PLANS = deepFreeze({
  "farstrider": { id: "AAZDEwVLgyM8MgJJ", name: "Farstrider",
    creatureAbilities: {
      "Named Quarry": [
        { kind: "utility", action: "half" },
        { kind: "utility", reason: "tableCall", action: "half" }
      ]
    }
  },
  "gnomish-battle-chicken": { id: "casAXlwg5GhgIcNp", name: "Gnomish Battle Chicken",
    creatureAbilities: {
      "Battle Squawk": [
        { kind: "utility", action: "half", uses: { max: 1, value: 1, per: "encounter" } },
        { kind: "utility", reason: "aura", action: "half", uses: { max: 1, value: 1, per: "encounter" } }
      ]
    }
  },
  "kirin-tor-magus": { id: "ECp3YzE3MGc8Rmis", name: "Kirin Tor Magus",
    creatureAbilities: {
      "Counterspell": [
        { kind: "utility", action: "reaction" },
        { kind: "utility", reason: "tableCall", action: "reaction", cost: { pool: "power", amount: 4 } }
      ]
    }
  },
  "silvermoon-citizen": { id: "fcClrbmR661tfCjr", name: "Silvermoon Citizen",
    creatureAbilities: {
      "Arcane Torrent": [
        { kind: "utility", action: "half", uses: { max: 1, value: 1, per: "encounter" } },
        { kind: "utility", reason: "aura", action: "half", uses: { max: 1, value: 1, per: "encounter" } }
      ]
    }
  },
  "town-guard": { id: "OhPLoOgKzO2Oh6U0", name: "Town Guard",
    creatureAbilities: {
      "Calls the Watch": [
        { kind: "utility", action: "half" },
        { kind: "utility", reason: "narrative", action: "half" }
      ]
    }
  },
  "troll-berserker": { id: "hHeoppoEgckl8oCY", name: "Troll Berserker",
    creatureAbilities: {
      "Berserk": [
        { kind: "attack", action: "half" },
        { kind: "utility", reason: "narrative", action: "half" }
      ]
    }
  }
});

const clone = value => JSON.parse(JSON.stringify(value ?? null));

/** Deep equality with key order ignored. */
function same(a, b) {
  const sorted = v => (Array.isArray(v) ? v.map(sorted)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v);
  return JSON.stringify(sorted(a ?? null)) === JSON.stringify(sorted(b ?? null));
}

/**
 * The old rows for one creature: by the bestiary entry it was dragged from, else by its name.
 *
 * @param {{name?: string|null, source?: string|null}} creature
 * @param {object} [table]
 * @returns {object|null}
 */
export function oldPlanRowsFor({ name = null, source = null } = {}, table = OLD_CREATURE_PLANS) {
  const entries = Object.values(table);
  const id = bestiaryEntryId(source);
  if (id) return entries.find(e => e.id === id) ?? null;
  return entries.find(e => e.name === name) ?? null;
}

/** The pack's descriptor for a stale row, keeping a spent use where the uses count the same. */
function restamp(stored, fresh) {
  const out = clone(fresh);
  const held = cleanAutomation(stored).uses;
  if (out.uses.max !== null && held.max === out.uses.max && held.per === out.uses.per && held.value !== null) {
    out.uses.value = Math.min(held.value, out.uses.max);
  }
  return out;
}

/**
 * One creature's plan: the `system.creatureAbilities` update or null, the rows restamped, and the
 * rows kept as a GM's own.
 *
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 * @param {object|null} old   the creature's `OLD_CREATURE_PLANS` entry
 */
export function planCreatureRows(raw, pack = null, old = null) {
  const plan = { update: null, restamped: [], kept: [] };
  if (!raw || typeof raw !== "object" || !pack || typeof pack !== "object" || !old) return plan;
  const stored = Array.isArray(raw.creatureAbilities) ? raw.creatureAbilities : [];
  const fresh = Array.isArray(pack.creatureAbilities) ? pack.creatureAbilities : [];
  if (!stored.length || !fresh.length) return plan;
  const byName = new Map(fresh.map(r => [r?.name, r]));
  let moved = false;
  const rows = stored.map(row => {
    const name = row?.name;
    const want = byName.get(name) ?? null;
    const befores = typeof name === "string" && Object.hasOwn(old.creatureAbilities ?? {}, name) ? old.creatureAbilities[name] : null;
    if (!want || !befores) return row;
    const have = comparable(row.automation);
    if (same(have, comparable(want.automation))) return row;
    if (!befores.some(b => same(have, comparable(b)))) {
      plan.kept.push(name);
      return row;
    }
    moved = true;
    plan.restamped.push(name);
    return { ...row, automation: restamp(row.automation, cleanAutomation(want.automation)) };
  });
  if (moved) plan.update = { "system.creatureAbilities": clone(rows) };
  return plan;
}

/**
 * Whether the compiled bestiary carries D-811's descriptors: some recorded row whose pack copy is
 * none of its old copies.
 *
 * @param {Map<string, object>|null|undefined} byName
 * @param {object} [table]
 */
export function packCarriesCreaturePlans(byName, table = OLD_CREATURE_PLANS) {
  for (const entry of Object.values(table)) {
    const system = byName?.get?.(entry.name) ?? null;
    for (const [name, befores] of Object.entries(entry.creatureAbilities ?? {})) {
      const row = (Array.isArray(system?.creatureAbilities) ? system.creatureAbilities : []).find(r => r?.name === name);
      if (row && !befores.some(b => same(comparable(row.automation), comparable(b)))) return true;
    }
  }
  return false;
}

/** Where a stored creature says it was dragged from. */
function sourceOf(doc) {
  const source = doc?._source ?? {};
  return source._stats?.compendiumSource ?? doc?._stats?.compendiumSource ?? source.flags?.core?.sourceId ?? null;
}

export async function migrate(log = console.log) {
  const bestiary = await packSystems(BESTIARY_PACK);
  if (!packCarriesCreaturePlans(bestiary.byName)) {
    console.warn(bestiary.byName.size
      ? `azeroth-rpg | 0.13.4: ${BESTIARY_PACK} carries none of D-811's creature plans yet, so no creature was restamped. `
        + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back to 0.13.3 and reload."
      : `azeroth-rpg | 0.13.4: ${BESTIARY_PACK} is not available, so no creature was restamped.`);
    return 0;
  }
  return walkWorld({
    actor: doc => {
      if (doc.type !== "npc") return null;
      const old = oldPlanRowsFor({ name: doc.name, source: sourceOf(doc) });
      if (!old) return null;
      const plan = planCreatureRows(rawSystem(doc), bestiary.byName.get(old.name) ?? null, old);
      const where = `${doc.name} (${doc.uuid ?? doc.id})`;
      for (const name of plan.restamped) log(`azeroth-rpg | 0.13.4: ${where} takes the pack's descriptor for ${name}`);
      for (const name of plan.kept) log(`azeroth-rpg | 0.13.4: ${where} keeps its own descriptor for ${name}: it is neither an old pack copy nor the new one`);
      return plan.update;
    }
  }, log);
}
