/**
 * Migration to 0.16.2.3 - the class talent audit's Mage, Warlock and Druid (the lead, 2026-11-22:
 * *"All other propsals are approved. Build these changes"*; D-1890 to D-1899).
 *
 * What the audit changed on a document a world already holds, and what each needs:
 *
 * 1. **EIGHT TALENTS ARE RENAMED IN THEIR OWN SLOT** (C1, R2): Archmage is Master of the Weave,
 *    Sunfire Pyromaniac, Absolute Zero Shattering Cold, Blood Pact Dark Pact, Soul Reaper Dark
 *    Harvest, Cataclysm Shadowfury, Celestial Alignment Celestial Focus and Tree of Life Heart of the
 *    Grove. Each new talent is the same branch, the same tier and the same one rank, so a TAKEN rank
 *    is CARRIED to the new identifier - nothing is refunded. The talent item takes the pack copy's
 *    name, identifier, image and words.
 * 2. **THE SPELL THE OLD TALENT TAUGHT STAYS LEARNED** (the audit's System impact: *a learned Archmage
 *    spell stays where a character already holds it*, and so for Sunfire, Absolute Zero, Blood Pact,
 *    Soul Reaper, Cataclysm, Celestial Alignment and Tree of Life). Such a spell carries `spellFrom`
 *    naming the talent item, and the feature sync withdraws a spell its talent no longer teaches
 *    (`AzerothActor#_syncClassFeaturesNow`), so the flag is cleared in the SAME batch that renames
 *    the talent: the spell is the character's own from then on, counted among the spells known. A
 *    character the clear pushes over the spells known the sheet draws (07 §5, `casting.mjs#spellsKnown`
 *    per casting class) is LOGGED by name, never pruned: which spell goes is the player's call.
 * 3. **CHAOS BOLT AND FEL FIRE SWAP ROWS** (C11): Fel Fire is branch tier 3 and Chaos Bolt tier 4,
 *    and Shadowfury requires Chaos Bolt. The owned copies take the pack's tier, sort and requirement.
 *    **A RANK THE TREE NO LONGER ALLOWS IS REFUNDED** (04 §1: a branch tier opens at 4, 8, 12 and 16
 *    points spent in the branch): a Chaos Bolt taken with fewer than 12 other points in Destruction,
 *    and a Shadowfury whose Chaos Bolt that leaves untaken, go back to 0 ranks, each said in the log.
 * 4. **EVERY OTHER CHANGED TALENT PRINTS NEW WORDS** (and Backdraft's and Nature's Swiftness's uses
 *    now count an encounter). Each owned copy takes the pack copy's words, ranks, requirement, tier,
 *    sort and use count where they differ (D-665: compared against the pack copy, never against
 *    `undefined`). `taken` is kept, never above the new ranks; a use count is kept, never above its
 *    new maximum.
 * 5. **NOTHING ELSE IS STORED.** The class features (Evocation, Overchannel Mastery, Time Warp, Drain,
 *    Curse, Ritual of Summoning, Regrowth, Hurricane, Entangling Roots, Hibernate) are stamps the sync
 *    restamps at world load (D-621); every talent's mechanics are its row's, read at the door. A Druid
 *    wearing a form above the tier is logged by 0.16.2 (C6).
 *
 * A pack that does not yet carry a new identifier (the code loaded before `packs:build`) warns and
 * stamps nothing for that talent, rather than throwing on every load (D-758). Idempotent: a second
 * run finds every owned talent equal to its pack copy, and no spell flagged by a renamed talent.
 */

import { rawSystem, sameStored, walkWorld } from "./walk.mjs";
import { spellsKnown } from "../rules/casting.mjs";
import { secondaryTier } from "../rules/progression.mjs";

/** The pack a talent is read from. */
export const TALENTS_PACK = "azeroth-rpg.talents";

/** The eight talents renamed in their own slot: `className/old` to the new identifier. */
export const AUDIT_C_RENAMES = Object.freeze({
  "Mage/archmage": "master-of-the-weave",
  "Mage/sunfire": "pyromaniac",
  "Mage/absolute-zero": "shattering-cold",
  "Warlock/blood-pact": "dark-pact",
  "Warlock/soul-reaper": "dark-harvest",
  "Warlock/cataclysm": "shadowfury",
  "Druid/celestial-alignment": "celestial-focus",
  "Druid/tree-of-life": "heart-of-the-grove"
});

/** Every talent whose printed words or place the audit changed, by class (the renamed ones by their new identifier). */
export const AUDIT_C_CHANGED = Object.freeze({
  Mage: Object.freeze(["arcane-concentration", "overchanneller", "arcane-missiles", "clearcasting", "mana-shield", "arcane-power",
    "netherwind", "master-of-the-weave", "fireball", "pyroblast", "firestorm", "pyromaniac", "frostbolt", "cone-of-cold", "shattering-cold"]),
  Warlock: Object.freeze(["malediction", "improved-life-tap", "curse-of-agony", "unstable-affliction", "dark-pact", "everlasting-affliction",
    "dark-harvest", "demonic-knowledge", "shadow-bolt", "immolate", "conflagrate", "ruin", "backdraft", "fel-fire", "chaos-bolt", "shadowfury"]),
  Druid: Object.freeze(["wrath", "starfire", "improved-moonfire", "insect-swarm", "lunar-guidance", "celestial-focus", "heart-of-the-wild",
    "rejuvenation", "natures-swiftness", "heart-of-the-grove"])
});

/** The system keys a talent takes from its pack copy. */
const COPIED = Object.freeze(["identifier", "effect", "ranks", "requires", "tier", "branch"]);

/** 04 §1's points spent in a branch that open each branch tier. */
export const TIER_POINTS = Object.freeze({ 1: 0, 2: 4, 3: 8, 4: 12, 5: 16 });

/**
 * The identifier an owned talent should carry: the renamed one, or its own.
 *
 * @param {{className?: string, identifier?: string}} system
 * @returns {string|null}
 */
export function targetIdentifier(system) {
  const className = system?.className ?? "";
  const identifier = system?.identifier ?? "";
  if (!className || !identifier) return null;
  return AUDIT_C_RENAMES[`${className}/${identifier}`] ?? identifier;
}

/** Whether an owned talent is one this migration answers for. */
export function inScope(system) {
  const id = targetIdentifier(system);
  return Boolean(id) && (AUDIT_C_CHANGED[system?.className] ?? []).includes(id);
}

/**
 * **ONE OWNED TALENT AGAINST ITS PACK COPY**: the update that brings it level, or null where it
 * already is. The rank taken is kept (never above the new ranks), and so is a use count (never
 * above its new maximum); `sort` follows the pack (Chaos Bolt's and Fel Fire's columns, C11).
 *
 * @param {{_id?: string, id?: string, name?: string, img?: string, sort?: number, system?: object}} stored
 * @param {{name: string, img?: string, sort?: number, system: object}} pack
 * @returns {object|null}
 */
export function talentRestamp(stored, pack) {
  if (!stored || !pack?.system) return null;
  const s = stored.system ?? {};
  const p = pack.system;
  const update = {};
  if (stored.name !== pack.name) update.name = pack.name;
  if (pack.img && stored.img !== pack.img) update.img = pack.img;
  if (Number.isFinite(Number(pack.sort)) && stored.sort !== undefined && Number(stored.sort) !== Number(pack.sort)) update.sort = Number(pack.sort);
  for (const key of COPIED) {
    if (p[key] === undefined) continue;
    if (!sameStored(s[key], p[key])) update[`system.${key}`] = p[key];
  }
  const ranks = Math.max(1, Math.trunc(Number(p.ranks ?? s.ranks)) || 1);
  const taken = Math.max(0, Math.trunc(Number(s.taken)) || 0);
  if (taken > ranks) update["system.taken"] = ranks;
  if (p.uses && typeof p.uses === "object") {
    const max = Math.max(0, Math.trunc(Number(p.uses.max)) || 0);
    if (!sameStored(s.uses?.max ?? null, p.uses.max ?? null)) update["system.uses.max"] = p.uses.max ?? null;
    if (!sameStored(s.uses?.per ?? null, p.uses.per ?? null)) update["system.uses.per"] = p.uses.per ?? null;
    const value = Math.trunc(Number(s.uses?.value));
    if (Number.isFinite(value) && value > max) update["system.uses.value"] = max;
  }
  if (!Object.keys(update).length) return null;
  return { _id: stored._id ?? stored.id, ...update };
}

/**
 * **THE RANKS THE TREE NO LONGER ALLOWS** (C11; 04 §1): after the restamp, a taken Destruction Chaos
 * Bolt at branch tier 4 needs 12 points spent in Destruction on the OTHER talents, and a taken
 * Shadowfury needs its Chaos Bolt; each that fails goes back to 0 ranks.
 *
 * **THE COUNT LEAVES SHADOWFURY'S POINT OUT, AND THAT IS STRICTER THAN THE TREE'S OWN GATE**
 * (`rules/talents.mjs#canLearn`'s `gateBelow` counts every point in the branch but the talent's own,
 * so Shadowfury's would count toward Chaos Bolt there). It is left out here because Shadowfury now
 * REQUIRES Chaos Bolt: a point in it was bought on the old row, when it stood below Chaos Bolt, and
 * cannot be what opens the tier its own requirement sits in - counted, it would hold Chaos Bolt up and
 * Chaos Bolt would hold it up in turn. A character refunded on that margin re-spends the points.
 *
 * @param {Array<{_id: string, system: object}>} talents  the actor's talents as they will stand
 * @returns {Array<{_id: string, identifier: string}>}
 */
export function treeRefunds(talents = []) {
  const out = [];
  const warlock = talents.filter(t => t?.system?.className === "Warlock");
  const destruction = warlock.filter(t => t.system.branch === "Destruction");
  const takenOf = t => Math.max(0, Math.trunc(Number(t?.system?.taken)) || 0);
  const bolt = destruction.find(t => t.system.identifier === "chaos-bolt") ?? null;
  let boltGone = !bolt || takenOf(bolt) === 0;
  if (bolt && takenOf(bolt) > 0) {
    const others = destruction.filter(t => t !== bolt && t.system.identifier !== "shadowfury").reduce((n, t) => n + takenOf(t), 0);
    const need = TIER_POINTS[Math.trunc(Number(bolt.system.tier)) || 4] ?? 12;
    if (others < need) {
      out.push({ _id: bolt._id, identifier: "chaos-bolt" });
      boltGone = true;
    }
  }
  const fury = destruction.find(t => t.system.identifier === "shadowfury") ?? null;
  if (fury && takenOf(fury) > 0 && boltGone) out.push({ _id: fury._id, identifier: "shadowfury" });
  return out;
}

/**
 * **THE SPELLS KNOWN THE SHEET DRAWS** (07 §5; the character sheet's own sum): each casting class's
 * `spellsKnown` at the tier that class runs at - the second one tier behind.
 *
 * @param {Array<{caster?: string, castingMod?: number}>} classes  in the actor's class order
 * @param {number} tier  the character's tier
 * @returns {number}
 */
export function knownAllowance(classes = [], tier = 1) {
  return (classes ?? []).reduce((sum, c, index) => sum + spellsKnown({
    caster: c?.caster ?? "none", castingMod: c?.castingMod ?? 0, tier: index === 0 ? tier : secondaryTier(tier)
  }), 0);
}

/**
 * Whether the `spellFrom` clear pushed a character over that count: spells counted after the clear
 * above the allowance, where the clear made at least one more counted.
 *
 * @param {{counted: number, cleared: number, allowance: number}} o
 * @returns {boolean}
 */
export function clearedOverKnown({ counted = 0, cleared = 0, allowance = 0 } = {}) {
  return cleared > 0 && counted > allowance;
}

/**
 * The updates one actor's owned items take: each changed talent off its pack copy by
 * `className/identifier`, the `spellFrom` cleared off a spell a renamed talent taught (so it stays
 * learned), and the refunds the swapped rows force.
 *
 * @param {Iterable<object>} items  the actor's items, as their stored source reads
 * @param {Map<string, object>} packByKey  `className/identifier` to the pack copy
 * @param {(line: string) => void} [warn]
 * @returns {object[]}
 */
export function auditCUpdates(items = [], packByKey = new Map(), warn = () => {}) {
  const list = [...(items ?? [])];
  const byId = new Map();
  const renamedTalents = new Set();
  const after = [];
  for (const item of list) {
    if (item?.type !== "talent") continue;
    const system = item.system ?? {};
    const renamed = Boolean(AUDIT_C_RENAMES[`${system.className}/${system.identifier}`]);
    if (renamed) renamedTalents.add(item._id ?? item.id);
    let stands = { _id: item._id ?? item.id, system: { ...system } };
    if (inScope(system)) {
      const key = `${system.className}/${targetIdentifier(system)}`;
      const pack = packByKey.get(key) ?? null;
      if (!pack) {
        warn(`azeroth-rpg | 0.16.2.3: the talents pack holds no ${key}; rebuild the packs (npm run packs:build) and run it again`);
        if (renamed) renamedTalents.delete(item._id ?? item.id);
      } else {
        const update = talentRestamp(item, pack);
        if (update) {
          byId.set(update._id, update);
          stands = { _id: update._id, system: { ...system, ...Object.fromEntries(COPIED.filter(k => update[`system.${k}`] !== undefined).map(k => [k, update[`system.${k}`]])) } };
          if (update["system.taken"] !== undefined) stands.system.taken = update["system.taken"];
        }
      }
    }
    after.push(stands);
  }
  for (const r of treeRefunds(after)) {
    byId.set(r._id, { ...(byId.get(r._id) ?? { _id: r._id }), "system.taken": 0 });
    warn(`azeroth-rpg | 0.16.2.3: ${r.identifier} is refunded - the tree no longer allows its rank (C11)`);
  }
  for (const item of list) {
    if (item?.type !== "spell") continue;
    const from = item.flags?.["azeroth-rpg"]?.spellFrom ?? null;
    if (from && renamedTalents.has(from)) byId.set(item._id ?? item.id, { _id: item._id ?? item.id, "flags.azeroth-rpg.spellFrom": null });
  }
  return [...byId.values()].sort((a, b) => String(a._id).localeCompare(String(b._id)));
}

export async function migrate(log = console.log) {
  const pack = game.packs?.get(TALENTS_PACK) ?? null;
  if (!pack) {
    log(`azeroth-rpg | 0.16.2.3: no ${TALENTS_PACK} pack; nothing stamped`);
    return 0;
  }
  const docs = await pack.getDocuments();
  const packByKey = new Map();
  for (const d of docs.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const sys = d.system ?? {};
    if (!sys.className || !sys.identifier) continue;
    packByKey.set(`${sys.className}/${sys.identifier}`, { name: d.name, img: d.img, sort: d.sort, system: d.toObject().system });
  }
  return walkWorld({
    items: async actor => {
      if (actor.type !== "character") return [];
      const sources = [...(actor.items ?? [])].map(i => ({ _id: i.id, type: i.type, name: i.name, img: i.img, sort: i.sort, flags: i.flags ?? {}, system: rawSystem(i) }));
      const updates = auditCUpdates(sources, packByKey, log);
      for (const u of updates) log(`azeroth-rpg | 0.16.2.3: ${actor.name}'s ${u.name ?? sources.find(s => s._id === u._id)?.name ?? u._id} takes the audit's words`);
      // A spell the clear makes counted can push the character over the spells known: logged, never pruned.
      const cleared = updates.filter(u => Object.hasOwn(u, "flags.azeroth-rpg.spellFrom")).map(u => u._id);
      if (cleared.length) {
        const clearedSet = new Set(cleared);
        const counted = sources.filter(i => i.type === "spell" && (clearedSet.has(i._id) || !i.flags?.["azeroth-rpg"]?.spellFrom)).length;
        const classes = [...(actor.classItems ?? [])].map(c => ({
          caster: c.system?.power?.caster ?? "none",
          castingMod: c.system?.castingAbility ? (actor.system?.abilities?.[c.system.castingAbility]?.mod ?? 0) : 0
        }));
        const allowance = knownAllowance(classes, actor.system?.tier ?? 1);
        if (clearedOverKnown({ counted, cleared: cleared.length, allowance })) {
          log(`azeroth-rpg | 0.16.2.3: ${actor.name} now counts ${counted} spells known against ${allowance}: the spells a renamed talent taught stay learned, and the player chooses what to forget`);
        }
      }
      return updates;
    }
  }, log);
}
