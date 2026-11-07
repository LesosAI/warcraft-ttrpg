/**
 * Migration to 0.13.1 - the bestiary audit's descriptors, on the creatures a world already
 * holds (D-807).
 *
 * The audit rewrote 43 ability and Boss Action descriptors on 41 of 14's creatures. Nine Use
 * buttons that acted on the wrong creature came off: Unholy Command, Sell Them Out and Amani
 * Fury rolled the Boss's own attack; The Headmaster, The Inquisition, Righteous Fury and Sermon
 * laid the Frightened their words end; Immovable and In the Walker laid the Prone their words
 * refuse; Strong Swimmer, Carries It Anyway and Waits laid a condition their words deny or only
 * look for; Berserk and Veteran rolled an attack. Three heals and a price are read, Fel-shod and
 * Devour Magic stand as passives their own doors read, Reads the Field is the captain's own +2
 * Initiative, the seven totems' Defenseless records `onTheBlock`, and the shells say why they
 * lay nothing. The pack is regenerated, so a creature dragged out afresh is right already. This
 * is the repair pass over what a world holds: its actors, the unlinked tokens on its scenes and
 * the creatures in its unlocked Actor packs (`walk.mjs`).
 *
 * **THE OLD DESCRIPTORS ARE RECORDED HERE, NOT DERIVED** (0.12.1's rule; 0.12.25's `RESEEDED` is
 * the same pass on three rows). They are gone from the pack, so there is nowhere else to read
 * them. `OLD_DESCRIPTORS` is what the pack held for each of the 43 rows before the audit,
 * generated once from `git show HEAD:packs-src/bestiary/<slug>.yaml` at 0.13.0 and written
 * sparse: only the keys that differ from `emptyAutomation()`, which `cleanAutomation` fills back
 * to the whole descriptor. Unless a GM changed it, a world copy dragged in at any version since
 * 0.11.9 holds exactly that descriptor: 0.11.9 and 0.12.25 brought the older ones to it, and
 * read back over the pack's git history every earlier copy of all 43 rows arrives there.
 *
 * **A ROW IS RESTAMPED ONLY WHERE IT STILL HOLDS THE OLD PACK COPY** (D-665: compared against the
 * pack, never against `undefined`). A row whose descriptor equals the pack's has nothing to do.
 * A row whose descriptor equals the old one takes the pack's. A row whose descriptor equals
 * neither is a GM's own: it is left as it is, and the log names it. **The use a creature has
 * spent is play, not an edit**: `uses.value` is left out of the comparison, and the new
 * descriptor keeps it wherever the pack's uses count the same (a spent Righteous Fury stays
 * spent). **Only the descriptor is written**: a row's name, its words and a Boss Action's cost
 * stand, so a GM who rewrote a row's words keeps them.
 *
 * **A CREATURE IS FOUND BY THE ENTRY IT WAS DRAGGED FROM, ELSE BY ITS NAME.** Core records the
 * entry in `_stats.compendiumSource` on a drag from the compendium (14.367,
 * `ClientDocumentMixin.fromDropData`, `WorldCollection#fromCompendium`), so a copy a GM renamed
 * is still found. A creature with no such record is matched by its name, as 0.12.28 and 0.12.25
 * match it. A creature that is neither is not one of the 41 and is skipped.
 *
 * **A PACK NOT YET REBUILT STAMPS NOTHING, AND SAYS SO** (0.12.28's shape). The chain runs this as
 * soon as the code is present, and a pack compiled before the audit holds the old descriptor on
 * every row. A throw would stop the chain with an error on every load, so it warns, names the
 * fix and stamps nothing.
 *
 * Idempotent by construction: after one pass every row that held the old descriptor holds the
 * pack's. **Not built here**: an announced Boss Action still spends no Boss Action point
 * (D-807's open item; 0.12.34's announcement path writes nothing).
 */

import { cleanAutomation } from "../rules/ability-automation.mjs";
import { packSystems, rawSystem, walkWorld } from "./walk.mjs";

/** The pack every new descriptor is read from. */
export const BESTIARY_PACK = "azeroth-rpg.bestiary";

/** The lists a creature's descriptors live in, in the model's own order. */
const LISTS = Object.freeze(["creatureAbilities", "bossActions"]);

/** Freeze a literal all the way down. */
function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/**
 * What the pack held for each row the audit changed, keyed by the creature's file in
 * `packs-src/bestiary`: the entry's `_id` (what `_stats.compendiumSource` names), its name, and
 * each row's old descriptor in the sparse form above, by list and by the row's name.
 */
export const OLD_DESCRIPTORS = deepFreeze({
  "baron-rivendare": { id: "y7sckPEUvKNeP1H7", name: "Baron Rivendare",
    bossActions: {
      "Unholy Command": { kind: "attack" }
    }
  },
  "bluffwatcher": { id: "beIDbJFpDP5AUsHk", name: "Bluffwatcher",
    creatureAbilities: {
      "Immovable": { kind: "utility", inflicts: { condition: "prone" } }
    }
  },
  "carrion-bird": { id: "tvwU2A9UfPUwfqgV", name: "Carrion Bird",
    creatureAbilities: {
      "Waits": { kind: "utility", inflicts: { condition: "prone" } }
    }
  },
  "cult-necromancer": { id: "Y1jqZD1zAJdbJVcp", name: "Cult Necromancer",
    creatureAbilities: {
      "Raise the Dead": { kind: "utility", action: "half" }
    }
  },
  "darkmaster-gandling": { id: "BGpKs8EWaibjHc7F", name: "Darkmaster Gandling",
    creatureAbilities: {
      "The Headmaster": { kind: "utility", inflicts: { condition: "frightened" } }
    }
  },
  "farstrider": { id: "AAZDEwVLgyM8MgJJ", name: "Farstrider",
    creatureAbilities: {
      "Named Quarry": { kind: "utility", action: "half" }
    }
  },
  "felhunter": { id: "82Hlgsz3eLf4eqc8", name: "Felhunter",
    creatureAbilities: {
      "Devour Magic": { kind: "utility", inflicts: { condition: "silenced" } }
    }
  },
  "felsteed": { id: "bk1VG7pfDTq1jUIe", name: "Felsteed",
    creatureAbilities: {
      "Fel-shod": { reason: "narrative" }
    }
  },
  "gargoyle": { id: "o27AR9TGaBO8Dc8Q", name: "Gargoyle",
    creatureAbilities: {
      "Stoneform": { kind: "utility", action: "half" }
    }
  },
  "gnomeregan-exile": { id: "Lq7ZO6V7Nch67fBn", name: "Gnomeregan Exile",
    creatureAbilities: {
      "Makes It Work": { kind: "utility", action: "half", uses: { max: 1, value: 1, per: "short" } }
    }
  },
  "gnomish-battle-chicken": { id: "casAXlwg5GhgIcNp", name: "Gnomish Battle Chicken",
    creatureAbilities: {
      "Battle Squawk": { kind: "utility", action: "half", uses: { max: 1, value: 1, per: "encounter" } }
    }
  },
  "grounding-totem": { id: "sgXHQMKeMdwf5HXH", name: "Grounding Totem",
    creatureAbilities: {
      "Defenseless": { reason: "narrative" },
      "Grounding": { kind: "utility", action: "reaction" }
    }
  },
  "healing-stream-totem": { id: "sw0aYWKfBOZApbvA", name: "Healing Stream Totem",
    creatureAbilities: {
      "Defenseless": { reason: "narrative" }
    }
  },
  "high-inquisitor-whitemane": { id: "YTWVS4JeH6u1qgrV", name: "High Inquisitor Whitemane",
    creatureAbilities: {
      "The Inquisition": { kind: "utility", inflicts: { condition: "frightened" } }
    }
  },
  "ironforge-prospector": { id: "c9kLFn6vSGbRgSnI", name: "Ironforge Prospector",
    creatureAbilities: {
      "Reads the Ground": { kind: "test", dc: 12 }
    }
  },
  "kaldorei-villager": { id: "mpAPjuTIsmdUroSP", name: "Kaldorei Villager",
    creatureAbilities: {
      "Shadowmeld": { kind: "utility", action: "half" }
    }
  },
  "kirin-tor-magus": { id: "ECp3YzE3MGc8Rmis", name: "Kirin Tor Magus",
    creatureAbilities: {
      "Counterspell": { kind: "utility", action: "reaction" }
    }
  },
  "lord-aliden-perenolde": { id: "RtyNyBB1stVnQn81", name: "Lord Aliden Perenolde",
    bossActions: {
      "Sell Them Out": { kind: "attack" }
    }
  },
  "lordamere-otter": { id: "3vgfyS7RJ6Nelfum", name: "Lordamere Otter",
    creatureAbilities: {
      "Strong Swimmer": { kind: "utility", inflicts: { condition: "slowed" }, passive: { senses: ["swimFast"] } }
    }
  },
  "mana-tide-totem": { id: "djixDCkVk5joaHdd", name: "Mana Tide Totem",
    creatureAbilities: {
      "Defenseless": { reason: "narrative" }
    }
  },
  "master-assassin": { id: "nIv0GcP9xxBgpfXn", name: "Master Assassin",
    creatureAbilities: {
      "Not There": { kind: "utility", action: "reaction", uses: { max: 1, value: 1, per: "encounter" } }
    }
  },
  "orgrimmar-peon": { id: "8HFG4A5FQm1SfvcY", name: "Orgrimmar Peon",
    creatureAbilities: {
      "Carries It Anyway": { kind: "utility", inflicts: { condition: "slowed" } }
    }
  },
  "priest-of-the-light": { id: "tv1c2bLxIapNr6dz", name: "Priest of the Light",
    creatureAbilities: {
      "Hands On": { kind: "utility", action: "half", uses: { max: 1, value: 1, per: "short" } }
    }
  },
  "scarlet-chaplain": { id: "dBksPf5KAcHSIxme", name: "Scarlet Chaplain",
    creatureAbilities: {
      "Sermon": { kind: "utility", action: "half", inflicts: { condition: "frightened" } }
    }
  },
  "scarlet-knight": { id: "KI7ZxXirblXVnsdL", name: "Scarlet Knight",
    creatureAbilities: {
      "Righteous Fury": { kind: "utility", action: "half", uses: { max: 1, value: 1, per: "encounter" }, inflicts: { condition: "frightened" } }
    }
  },
  "searing-totem": { id: "HchBm9kjigtcRz1D", name: "Searing Totem",
    creatureAbilities: {
      "Defenseless": { reason: "narrative" }
    }
  },
  "sellsword": { id: "4CN0PzOPPYrAl21o", name: "Sellsword",
    creatureAbilities: {
      "Veteran": { kind: "attack", uses: { max: 1, value: 1, per: "encounter" } }
    }
  },
  "shade": { id: "tOiQdFCrFJlaJzsg", name: "Shade",
    creatureAbilities: {
      "Unseen": { kind: "test", dc: 15 }
    }
  },
  "sicco-thermaplugg": { id: "mg6TgMr3RaHeLNZ0", name: "Sicco Thermaplugg",
    creatureAbilities: {
      "In the Walker": { kind: "utility", inflicts: { condition: "prone" } }
    }
  },
  "silvermoon-citizen": { id: "fcClrbmR661tfCjr", name: "Silvermoon Citizen",
    creatureAbilities: {
      "Arcane Torrent": { kind: "utility", action: "half", uses: { max: 1, value: 1, per: "encounter" } }
    }
  },
  "stoneskin-totem": { id: "aJMqXiXEgwK3fptw", name: "Stoneskin Totem",
    creatureAbilities: {
      "Defenseless": { reason: "narrative" }
    }
  },
  "syndicate-footpad": { id: "NVTdoX7HEy2aWVhj", name: "Syndicate Footpad",
    creatureAbilities: {
      "Cut and Run": { kind: "utility", action: "reaction" }
    }
  },
  "tinker-militia": { id: "SOOljGaO5afsabn0", name: "Tinker Militia",
    creatureAbilities: {
      "Field Repair": { kind: "utility", action: "half" }
    }
  },
  "town-guard": { id: "OhPLoOgKzO2Oh6U0", name: "Town Guard",
    creatureAbilities: {
      "Calls the Watch": { kind: "utility", action: "half" }
    }
  },
  "trained-mount": { id: "cHYKOsNXUfUD9cLu", name: "Trained Mount",
    creatureAbilities: {
      "Bolts": { kind: "test", dc: 12 }
    }
  },
  "tremor-totem": { id: "DTGfoutfhnNJUPU2", name: "Tremor Totem",
    creatureAbilities: {
      "Defenseless": { reason: "narrative" }
    }
  },
  "troll-berserker": { id: "hHeoppoEgckl8oCY", name: "Troll Berserker",
    creatureAbilities: {
      "Berserk": { kind: "attack", action: "half" }
    }
  },
  "troll-witch-doctor": { id: "R1ucIYPaBRfrtSxv", name: "Troll Witch-Doctor",
    creatureAbilities: {
      "Fetish": { kind: "utility", action: "half" }
    }
  },
  "warband-captain": { id: "8TfruXgeebKDO1Qk", name: "Warband Captain",
    creatureAbilities: {
      "Orders": { kind: "utility", action: "half" },
      "Reads the Field": { reason: "aura" }
    }
  },
  "windfury-totem": { id: "d6V8xARxSz0grz9e", name: "Windfury Totem",
    creatureAbilities: {
      "Defenseless": { reason: "narrative" }
    }
  },
  "zuljin": { id: "1HsdiyWRWFx01oKV", name: "Zul'jin",
    bossActions: {
      "Amani Fury": { kind: "attack" }
    }
  }
});

const clone = value => JSON.parse(JSON.stringify(value ?? null));

/** Deep equality with key order ignored: a stored object and a pack copy may list keys differently. */
function same(a, b) {
  const sorted = v => (Array.isArray(v) ? v.map(sorted)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v);
  return JSON.stringify(sorted(a ?? null)) === JSON.stringify(sorted(b ?? null));
}

/**
 * A descriptor as the comparison reads it: the whole cleaned shape, with the use the creature
 * has spent left out, because spending one is play and never an edit.
 *
 * @param {object|null|undefined} automation
 * @returns {object}
 */
export function comparable(automation) {
  const out = cleanAutomation(automation);
  out.uses.value = null;
  return out;
}

/**
 * The bestiary entry a stored compendium source names, or null.
 *
 * @param {string|null|undefined} uuid  `_stats.compendiumSource`, or an older `flags.core.sourceId`
 * @returns {string|null}
 */
export function bestiaryEntryId(uuid) {
  const match = /^Compendium\.azeroth-rpg\.bestiary\.(?:Actor\.)?([A-Za-z0-9]{16})$/.exec(String(uuid ?? ""));
  return match ? match[1] : null;
}

/**
 * The old rows for one creature: by the bestiary entry it was dragged from where it records
 * one, else by its name. Null for a creature that is not one of the 41.
 *
 * @param {{name?: string|null, source?: string|null}} creature
 * @param {object} [table]
 * @returns {object|null}  an `OLD_DESCRIPTORS` entry
 */
export function oldRowsFor({ name = null, source = null } = {}, table = OLD_DESCRIPTORS) {
  const entries = Object.values(table);
  const id = bestiaryEntryId(source);
  if (id) return entries.find(e => e.id === id) ?? null;
  return entries.find(e => e.name === name) ?? null;
}

/**
 * The new descriptor for a stale row: the pack's, keeping the use the creature has spent where
 * the pack's uses count the same.
 *
 * @param {object} stored  the stored descriptor
 * @param {object} fresh   the pack's descriptor, cleaned
 * @returns {object}
 */
function restamp(stored, fresh) {
  const out = clone(fresh);
  const held = cleanAutomation(stored).uses;
  if (out.uses.max !== null && held.max === out.uses.max && held.per === out.uses.per && held.value !== null) {
    out.uses.value = Math.min(held.value, out.uses.max);
  }
  return out;
}

/**
 * One creature's plan: the update or null, the rows it restamps, and the rows it keeps as a
 * GM's own. The whole list is written where any row moved, an array being what it is, and
 * every other row is written back as it was stored.
 *
 * @param {object} raw          the stored system
 * @param {object|null} pack    the pack copy's system
 * @param {object|null} old     the creature's `OLD_DESCRIPTORS` entry
 * @returns {{update: object|null, restamped: {list: string, name: string}[], kept: {list: string, name: string}[]}}
 */
export function planDescriptors(raw, pack = null, old = null) {
  const plan = { update: null, restamped: [], kept: [] };
  if (!raw || typeof raw !== "object" || !pack || typeof pack !== "object" || !old) return plan;
  const update = {};
  for (const list of LISTS) {
    const was = old[list] ?? null;
    const stored = Array.isArray(raw[list]) ? raw[list] : [];
    const fresh = Array.isArray(pack[list]) ? pack[list] : [];
    if (!was || !stored.length || !fresh.length) continue;
    const byName = new Map(fresh.map(r => [r?.name, r]));
    let moved = false;
    const rows = stored.map(row => {
      const name = row?.name;
      const before = typeof name === "string" && Object.hasOwn(was, name) ? was[name] : null;
      const want = byName.get(name) ?? null;
      if (!before || !want) return row;
      const have = comparable(row.automation);
      if (same(have, comparable(want.automation))) return row;
      if (!same(have, comparable(before))) {
        plan.kept.push({ list, name });
        return row;
      }
      moved = true;
      plan.restamped.push({ list, name });
      return { ...row, automation: restamp(row.automation, cleanAutomation(want.automation)) };
    });
    if (moved) update[`system.${list}`] = clone(rows);
  }
  plan.update = Object.keys(update).length ? update : null;
  return plan;
}

/**
 * Whether the compiled bestiary carries the audit's descriptors: some recorded row whose pack
 * copy is no longer the old descriptor. A pack compiled before the audit holds the old one on
 * all 43, and an absent pack holds none.
 *
 * @param {Map<string, object>|null|undefined} byName  the pack's systems by creature name
 * @param {object} [table]
 * @returns {boolean}
 */
export function packCarriesDescriptors(byName, table = OLD_DESCRIPTORS) {
  for (const entry of Object.values(table)) {
    const system = byName?.get?.(entry.name) ?? null;
    if (!system) continue;
    for (const list of LISTS) {
      for (const [name, before] of Object.entries(entry[list] ?? {})) {
        const row = (Array.isArray(system[list]) ? system[list] : []).find(r => r?.name === name);
        if (row && !same(comparable(row.automation), comparable(before))) return true;
      }
    }
  }
  return false;
}

/** Where a stored creature says it was dragged from: core's record, or the flag before it. */
function sourceOf(doc) {
  const source = doc?._source ?? {};
  return source._stats?.compendiumSource ?? doc?._stats?.compendiumSource ?? source.flags?.core?.sourceId ?? null;
}

export async function migrate(log = console.log) {
  const bestiary = await packSystems(BESTIARY_PACK);
  if (!packCarriesDescriptors(bestiary.byName)) {
    console.warn(bestiary.byName.size
      ? `azeroth-rpg | 0.13.1: ${BESTIARY_PACK} carries none of the bestiary audit's descriptors yet (D-807), so no creature was restamped. `
        + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back to 0.13.0 and reload."
      : `azeroth-rpg | 0.13.1: ${BESTIARY_PACK} is not available, so no creature was restamped.`);
    return 0;
  }
  return walkWorld({
    actor: doc => {
      if (doc.type !== "npc") return null;
      const old = oldRowsFor({ name: doc.name, source: sourceOf(doc) });
      if (!old) return null;
      const plan = planDescriptors(rawSystem(doc), bestiary.byName.get(old.name) ?? null, old);
      const where = `${doc.name} (${doc.uuid ?? doc.id})`;
      for (const { name } of plan.restamped) log(`azeroth-rpg | 0.13.1: ${where} takes the pack's descriptor for ${name}`);
      for (const { name } of plan.kept) {
        log(`azeroth-rpg | 0.13.1: ${where} keeps its own descriptor for ${name}: it is neither the old pack copy nor the new one`);
      }
      return plan.update;
    }
  }, log);
}
