/**
 * Migration to 0.16.2.4 - the bestiary's Health raised by a quarter on the creatures a world already
 * holds (D-1900; the lead, closing O-658: *"Raise the bestiary Health bands 25%"*).
 *
 * 13 §5's bands and every Health 14 prints rose by 25%, rounded to the nearest whole number, half
 * up (12 to 15, 32 to 40, a Boss's 194 to 243). A shaman's totem keeps 02's 1 Health. A creature a
 * GM dragged out before the raise keeps its stored `health.max` for good, so every NPC in the world -
 * world actors, the unlinked tokens on every scene and the creatures in unlocked world packs
 * (`walk.mjs`), a bound or raised creature included - is read against its PACK COPY (D-665):
 *
 * 1. **The creature is found** by the bestiary entry it was dragged from (`_stats.compendiumSource`),
 *    else by its name, else by its bond's `entryName` (0.16.1.1's reading).
 * 2. **Its stored maximum is written only where it is the OLD pack value**: the pack's maximum is
 *    the old one raised (`raised(stored) === pack`). A swarm's maximum is its members' total
 *    (13 §4), so it is judged a member at a time. The value moves with it, in proportion, rounded
 *    half up: a creature at full Health stays full.
 * 3. **A GM's own number is kept and logged**: a maximum equal to neither the old pack value nor the
 *    new one.
 * 4. **Idempotent**: once written the maximum equals the pack's and nothing is planned again.
 *
 * **A PACK BUILT BEFORE THE RAISE WARNS AND STAMPS NOTHING** (0.16.1.1's shape): the chain runs this
 * as soon as the code is present, and a pass over an old pack would find every stored maximum equal
 * to the pack's and mark the world past this version with nothing written.
 */

import { bestiaryEntryId } from "./0.16.1.1-bestiary-audit-law.mjs";
import { packSystems, rawSystem, walkWorld } from "./walk.mjs";

/** The migration's version, as the chain names it. */
export const VERSION = "0.16.2.4";

/** The pack every new maximum is read from. */
export const BESTIARY_PACK = "azeroth-rpg.bestiary";

/**
 * A Health raised by a quarter, rounded to the nearest whole number, half up (D-1900): the one
 * rule the book's 895 blocks, 13 §5's bands and D1 §5.2/§5.3 were all raised by.
 *
 * @param {number} health  a whole number of Health, 1 or more
 * @returns {number|null}
 */
export function raised(health) {
  const h = Number(health);
  if (!Number.isInteger(h) || h < 1) return null;
  return Math.floor((5 * h + 2) / 4);
}

/**
 * The Health `raised` took to this one, or null where no whole number does (7 is no quarter-raise
 * of anything). The raise climbs 1.25 a step, so the answer is unique.
 *
 * @param {number} health
 * @returns {number|null}
 */
export function lowered(health) {
  const n = Number(health);
  if (!Number.isInteger(n) || n < 1) return null;
  const near = Math.floor((4 * n) / 5);
  for (const h of [near, near + 1, near - 1]) if (h >= 1 && raised(h) === n) return h;
  return null;
}

/**
 * A pack system with D-1900's raise undone, for a table that records what moved BEFORE it
 * (0.16.1.1's BEFORE table describes the audit alone, so the two migrations never write one field
 * twice). Anything not a quarter-raise is left as it stands.
 *
 * @param {object} system
 * @returns {object}  a copy
 */
export function withoutRaise(system) {
  const out = JSON.parse(JSON.stringify(system ?? {}));
  const health = out.health;
  if (health && typeof health === "object") {
    const max = lowered(health.max);
    if (max !== null) {
      health.max = max;
      if (Number.isInteger(health.value)) health.value = lowered(health.value) ?? health.value;
    }
  }
  return out;
}

/**
 * Three values only a pack compiled after the raise holds, on creatures release 0.16.1 already had.
 */
export const RAISE_SENTINELS = Object.freeze([
  Object.freeze({ name: "Plagued Ghoul", max: 15 }),
  Object.freeze({ name: "Abomination", max: 80 }),
  Object.freeze({ name: "Alliance Footman", max: 8 })
]);

/**
 * The sentinels a pack fails, by name: empty where the pack carries the raise.
 *
 * @param {Map<string, object>|null|undefined} byName  the pack's systems by creature name
 * @returns {string[]}
 */
export function missingSentinels(byName) {
  return RAISE_SENTINELS.filter(s => byName?.get?.(s.name)?.health?.max !== s.max).map(s => `${s.name} (Health ${s.max})`);
}

/**
 * One creature's plan.
 *
 * @param {object|null} raw      the stored system
 * @param {object|null} pack     the pack copy's system
 * @returns {{update: object|null, state: "written"|"current"|"kept"|"none", from?: number, to?: number}}
 */
export function planHealth(raw, pack) {
  const none = { update: null, state: "none" };
  const stored = raw?.health?.max;
  const fresh = pack?.health?.max;
  if (!Number.isInteger(stored) || !Number.isInteger(fresh) || fresh < 1) return none;
  const members = Number.isInteger(raw?.swarm?.members) && raw.swarm.members >= 2 ? raw.swarm.members : 1;
  const want = fresh * members;
  if (stored === want) return { update: null, state: "current" };
  const each = stored / members;
  if (!Number.isInteger(each) || raised(each) !== fresh || raised(each) === each) return { update: null, state: "kept", from: stored, to: want };
  const update = { "system.health.max": want };
  const value = raw.health.value;
  if (Number.isFinite(value)) {
    update["system.health.value"] = value >= stored ? want : Math.min(want, Math.max(0, Math.floor((value * want) / stored + 0.5)));
  }
  return { update, state: "written", from: stored, to: want };
}

/** Where a stored creature says it was dragged from: core's record, or the flag before it. */
function sourceOf(doc) {
  const source = doc?._source ?? {};
  return source._stats?.compendiumSource ?? doc?._stats?.compendiumSource ?? source.flags?.core?.sourceId ?? null;
}

/**
 * A stored creature's pack copy: by the entry it was dragged from, else its name, else its bond's
 * entry name.
 *
 * @param {{name?: string|null, source?: string|null, entryName?: string|null}} creature
 * @param {Map<string, object>} byName       the pack's systems by name
 * @param {(id: string) => string|null} nameOfId  the pack index's name for an entry id
 * @returns {object|null}
 */
export function packCopyOf({ name = null, source = null, entryName = null } = {}, byName, nameOfId = () => null) {
  const id = bestiaryEntryId(source);
  if (id) {
    const named = nameOfId(id);
    return named && byName?.has(named) ? byName.get(named) : null;
  }
  for (const candidate of [name, entryName]) if (candidate && byName?.has(candidate)) return byName.get(candidate);
  return null;
}

export async function migrate(log = console.log) {
  const bestiary = await packSystems(BESTIARY_PACK);
  const missing = missingSentinels(bestiary.byName);
  if (missing.length) {
    console.warn(bestiary.byName.size
      ? `azeroth-rpg | ${VERSION}: ${BESTIARY_PACK} predates the bestiary's Health raise (it lacks ${missing.join(", ")}), so no creature was raised. `
        + `Run \`npm run packs:parse\` and \`npm run packs:build\`, restart the server, set \`migrationVersion\` back to the step before ${VERSION} and reload.`
      : `azeroth-rpg | ${VERSION}: ${BESTIARY_PACK} is not available, so no creature was raised.`);
    return 0;
  }
  const index = globalThis.game?.packs?.get?.(BESTIARY_PACK)?.index ?? null;
  const nameOfId = id => index?.get?.(id)?.name ?? null;
  const counts = { raised: 0, kept: 0 };
  const touched = await walkWorld({
    actor: doc => {
      if (doc.type !== "npc") return null;
      const flags = doc?._source?.flags ?? doc?.flags ?? null;
      const pack = packCopyOf({ name: doc.name, source: sourceOf(doc), entryName: flags?.["azeroth-rpg"]?.bond?.entryName ?? null }, bestiary.byName, nameOfId);
      if (!pack) return null;
      const plan = planHealth(rawSystem(doc), pack);
      const where = `${doc.name} (${doc.uuid ?? doc.id})`;
      if (plan.state === "written") {
        counts.raised++;
        log(`azeroth-rpg | ${VERSION}: ${where} Health ${plan.from} raised to ${plan.to}`);
      } else if (plan.state === "kept") {
        counts.kept++;
        log(`azeroth-rpg | ${VERSION}: ${where} keeps its own Health ${plan.from}: neither the old pack value nor the new ${plan.to}`);
      }
      return plan.update;
    }
  }, log);
  log(`azeroth-rpg | ${VERSION}: ${counts.raised} creature(s) raised, ${counts.kept} kept as a GM's own`);
  if ((counts.raised || counts.kept) && globalThis.game?.i18n) {
    globalThis.ui?.notifications?.info(game.i18n.format("AZEROTH.Migration.BestiaryHealth", { raised: counts.raised, kept: counts.kept }), { permanent: true });
  }
  return touched;
}
