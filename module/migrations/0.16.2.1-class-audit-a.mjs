/**
 * Migration to 0.16.2.1 - the class talent audit's Warrior, Paladin and Ranger, with the Blademaster,
 * Mountain King and Dark Ranger branches (the lead, 2026-11-22: *"All other propsals are approved. Build
 * these changes"*; class agent A, D-1870 to D-1879).
 *
 * What the audit changed on a document a world already holds, and what each needs:
 *
 * 1. **BLADETURN IS OVERPOWER IN ITS OWN SLOT** (Arms, branch tier 4, two ranks either way): a TAKEN rank
 *    is CARRIED to the new identifier - nothing is refunded. The item takes the pack copy's name,
 *    identifier, image and words.
 * 2. **FIVE BENEDICTION TALENTS ARE GONE** (the branch reworked after Uther, A8): Devotion, Light's
 *    Reserve, Beacon, Holy Guidance and Aegis of the Light. Each owned copy is DELETED, which hands its
 *    ranks back: 04 §1's points are derived from the ranks taken (D-713), so nothing else is written. A
 *    feature or a spell the old talent granted is withdrawn by the feature sync at world load, because no
 *    row grants it any more (`AzerothActor#_syncClassFeaturesNow`).
 * 3. **DIVINE FAVOR IS A DIFFERENT TALENT UNDER THE SAME IDENTIFIER**: a taken rank is REFUNDED - the item
 *    is set back to 0 ranks - and it takes the pack copy's words, so the Paladin re-takes it if they wish.
 * 4. **FIVE NEW BENEDICTION TALENTS** (Mending Word, Healing Hands, Twofold Light, Fervor, Mercy of Uther)
 *    are embedded from the pack on every character who holds the Paladin class and lacks them, at 0 ranks,
 *    as the class link embeds a class's talents.
 * 5. **EVERY OTHER CHANGED TALENT TAKES THE PACK COPY'S WORDS, RANKS, TIER, BRANCH AND REQUIREMENT**
 *    where they differ (D-665: compared against the pack copy, never against `undefined`). `taken` is
 *    kept, never above the new ranks.
 * 6. **A KEPT BENEDICTION PICK THAT NO LONGER MEETS ITS TIER'S GATE IS LOGGED**, never moved: the branch's
 *    rows changed tiers, and which pick a player keeps is theirs (`benedictionGateFaults`).
 * 7. **NOTHING ELSE IS STORED.** The class features (Second Wind, Lay on Hands, Divine Storm, Avenging
 *    Wrath, Beacon of Hope, Snare, Aimed Shot, Kill Shot) are stamps the sync restamps at world load
 *    (D-621), Mercy of Uther's `ends` among them; every talent's mechanics are its row's, read at the door.
 *
 * A pack that does not yet carry a new identifier (the code loaded before `packs:build`) warns and stamps
 * nothing for that talent, rather than throwing on every load (D-758). Idempotent: a second run finds no
 * removed talent, every owned talent equal to its pack copy, Divine Favor at 0 or already the new one, and
 * the new five held, and writes nothing.
 */

import { rawSystem, sameStored, walkWorld } from "./walk.mjs";

/** The pack a talent is read from. */
export const TALENTS_PACK = "azeroth-rpg.talents";

/** Renamed in its own slot, `className/old` to the new identifier: the rank taken is carried. */
export const AUDIT_A_RENAMES = Object.freeze({ "Warrior/bladeturn": "overpower" });

/** Gone from the Paladin's Benediction: deleted, their ranks handed back. */
export const AUDIT_A_REMOVED = Object.freeze(["devotion", "lights-reserve", "beacon", "holy-guidance", "aegis-of-the-light"]);

/** A different talent under the same identifier: refunded to 0 ranks and restamped. */
export const AUDIT_A_REUSED = Object.freeze(["divine-favor"]);

/** New in the Paladin's Benediction: embedded at 0 ranks where the Paladin lacks them. */
export const AUDIT_A_ADDED = Object.freeze(["mending-word", "healing-hands", "twofold-light", "fervor", "mercy-of-uther"]);

/** Every other talent whose printed words, ranks or place the audit changed, by class. */
export const AUDIT_A_CHANGED = Object.freeze({
  Warrior: Object.freeze(["deep-cut", "precise-strike", "follow-through", "mortal-strike", "sundering-blows", "overpower",
    "killing-blow", "whirlwind", "reckless", "bloodthirst", "frenzy", "rampage", "blood-craze", "shield-wall", "last-stand",
    "shield-slam", "unbreakable", "the-challenge", "bladestorm", "unmoved"]),
  Paladin: Object.freeze(["crusader-strike", "righteous-fury", "sanctified-weapon", "seal-of-command", "fanaticism", "redoubt",
    "blessing", "illumination", "divine-favor", "mending-word", "healing-hands", "twofold-light", "fervor", "mercy-of-uther",
    "open-hand", "cleanse", "sacrifice", "intervention"]),
  Ranger: Object.freeze(["hunters-mark", "barrage", "rapid-fire", "ferocious-bite", "wing-clip", "readiness", "master-of-the-land"])
});

/** 04 §1's tier gates: the points a branch must hold before a talent of that tier opens. */
export const TIER_GATES = Object.freeze({ 1: 0, 2: 4, 3: 8, 4: 12, 5: 16 });

/** The system keys a talent takes from its pack copy. */
const COPIED = Object.freeze(["identifier", "effect", "ranks", "requires", "tier", "branch"]);

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
  return AUDIT_A_RENAMES[`${className}/${identifier}`] ?? identifier;
}

/**
 * **ONE OWNED TALENT AGAINST ITS PACK COPY**: the update that brings it level, or null where it already
 * is. `refund` sets the rank taken to 0 (Divine Favor); otherwise the rank is kept, never above the new
 * ranks.
 *
 * @param {{_id?: string, name?: string, img?: string, system?: object}} stored
 * @param {{name: string, img?: string, system: object}} pack
 * @param {{refund?: boolean}} [o]
 * @returns {object|null}
 */
export function talentRestamp(stored, pack, { refund = false } = {}) {
  if (!stored || !pack?.system) return null;
  const s = stored.system ?? {};
  const p = pack.system;
  const update = {};
  if (stored.name !== pack.name) update.name = pack.name;
  if (pack.img && stored.img !== pack.img) update.img = pack.img;
  for (const key of COPIED) {
    if (p[key] === undefined) continue;
    if (!sameStored(s[key], p[key])) update[`system.${key}`] = p[key];
  }
  const ranks = Math.max(1, Math.trunc(Number(p.ranks ?? s.ranks)) || 1);
  const taken = Math.max(0, Math.trunc(Number(s.taken)) || 0);
  if (refund && taken > 0) update["system.taken"] = 0;
  else if (taken > ranks) update["system.taken"] = ranks;
  if (!Object.keys(update).length) return null;
  return { _id: stored._id ?? stored.id, ...update };
}

/**
 * **WHETHER A DIVINE FAVOR IS STILL THE OLD ONE**: the old talent's words (*Your first healing feature
 * after each Long Rest costs no Mana*), which the new one never carries. A copy already restamped is the
 * new one, and its ranks are the player's.
 *
 * @param {object} system  the owned talent's source system
 */
export function oldDivineFavor(system) {
  return /costs no Mana/i.test(String(system?.effect ?? ""));
}

/**
 * **WHAT ONE ACTOR'S TALENTS TAKE**: the deletions, the updates and the new talents to embed.
 *
 * @param {Iterable<object>} items  the actor's items, as their stored source reads
 * @param {Map<string, object>} packByKey  `className/identifier` to the pack copy
 * @param {{paladin?: boolean, warn?: (line: string) => void}} [o]
 * @returns {{deletes: string[], updates: object[], creates: object[]}}
 */
export function auditAPlan(items = [], packByKey = new Map(), { paladin = false, warn = () => {} } = {}) {
  const deletes = [];
  const updates = [];
  const talents = [...(items ?? [])].filter(i => i?.type === "talent");
  for (const item of talents) {
    const system = item.system ?? {};
    if (system.className === "Paladin" && AUDIT_A_REMOVED.includes(system.identifier)) {
      deletes.push(item._id ?? item.id);
      continue;
    }
    const id = targetIdentifier(system);
    if (!id || !(AUDIT_A_CHANGED[system.className] ?? []).includes(id)) continue;
    const key = `${system.className}/${id}`;
    const pack = packByKey.get(key) ?? null;
    if (!pack) {
      warn(`azeroth-rpg | 0.16.2.1: the talents pack holds no ${key}; rebuild the packs (npm run packs:build) and run it again`);
      continue;
    }
    const refund = system.className === "Paladin" && AUDIT_A_REUSED.includes(id) && oldDivineFavor(system);
    const update = talentRestamp(item, pack, { refund });
    if (update) updates.push(update);
  }
  const creates = [];
  if (paladin) {
    const held = new Set(talents.filter(t => t.system?.className === "Paladin").map(t => t.system?.identifier));
    for (const id of AUDIT_A_ADDED) {
      if (held.has(id)) continue;
      const pack = packByKey.get(`Paladin/${id}`) ?? null;
      if (!pack) {
        warn(`azeroth-rpg | 0.16.2.1: the talents pack holds no Paladin/${id}; rebuild the packs (npm run packs:build) and run it again`);
        continue;
      }
      creates.push({ name: pack.name, type: "talent", img: pack.img, system: { ...pack.system, taken: 0 } });
    }
  }
  return {
    deletes: deletes.sort(),
    updates: updates.sort((a, b) => String(a._id).localeCompare(String(b._id))),
    creates: creates.sort((a, b) => String(a.system.identifier).localeCompare(String(b.system.identifier)))
  };
}

/**
 * **THE KEPT BENEDICTION PICKS THAT NO LONGER MEET THEIR TIER'S GATE**: each taken talent of the branch
 * whose tier needs more points than the branch's lower tiers hold (04 §1's none, 4, 8, 12, 16), by name,
 * sorted - for the log, never a write.
 *
 * @param {Array<{name?: string, system?: object}>} talents  the actor's Paladin talents AFTER the plan
 * @returns {string[]}
 */
export function benedictionGateFaults(talents = []) {
  const branch = (talents ?? []).filter(t => t?.system?.className === "Paladin" && t.system?.branch === "Benediction");
  const out = [];
  for (const t of branch) {
    const taken = Math.max(0, Math.trunc(Number(t.system?.taken)) || 0);
    if (!taken) continue;
    const tier = Math.max(1, Math.trunc(Number(t.system?.tier)) || 1);
    const below = branch.filter(o => (Number(o.system?.tier) || 1) < tier)
      .reduce((n, o) => n + (Math.max(0, Math.trunc(Number(o.system?.taken)) || 0)), 0);
    if (below < (TIER_GATES[tier] ?? 0)) out.push(String(t.name ?? t.system?.identifier ?? ""));
  }
  return out.sort();
}

export async function migrate(log = console.log) {
  const pack = game.packs?.get(TALENTS_PACK) ?? null;
  if (!pack) {
    log(`azeroth-rpg | 0.16.2.1: no ${TALENTS_PACK} pack; nothing stamped`);
    return 0;
  }
  const docs = await pack.getDocuments();
  const packByKey = new Map();
  for (const d of docs.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const sys = d.system ?? {};
    if (!sys.className || !sys.identifier) continue;
    packByKey.set(`${sys.className}/${sys.identifier}`, { name: d.name, img: d.img, system: d.toObject().system });
  }
  const plans = new Map();
  const planOf = actor => {
    if (!plans.has(actor.uuid)) {
      const sources = [...(actor.items ?? [])].map(i => ({ _id: i.id, type: i.type, name: i.name, img: i.img, system: rawSystem(i) }));
      const paladin = (actor.items ?? []).some(i => i.type === "class" && i.name === "Paladin");
      plans.set(actor.uuid, { sources, plan: auditAPlan(sources, packByKey, { paladin, warn: log }) });
    }
    return plans.get(actor.uuid);
  };
  return walkWorld({
    items: async actor => {
      if (actor.type !== "character") return [];
      const { sources, plan } = planOf(actor);
      if (plan.deletes.length) {
        for (const id of plan.deletes) log(`azeroth-rpg | 0.16.2.1: ${actor.name}'s ${sources.find(s => s._id === id)?.name ?? id} is gone from Benediction; its ranks are handed back`);
        await actor.deleteEmbeddedDocuments("Item", plan.deletes, { render: false, azerothBags: "bypass" });
      }
      for (const u of plan.updates) {
        const was = sources.find(s => s._id === u._id);
        log(`azeroth-rpg | 0.16.2.1: ${actor.name}'s ${was?.name ?? u._id} takes the audit's words${u["system.taken"] === 0 ? " (refunded to 0 ranks)" : ""}`);
      }
      // What the branch keeps after the plan, for the gate's log.
      const after = sources.filter(s => s.type === "talent" && !plan.deletes.includes(s._id)).map(s => {
        const u = plan.updates.find(x => x._id === s._id) ?? {};
        return { name: u.name ?? s.name, system: { ...s.system, tier: u["system.tier"] ?? s.system?.tier, taken: u["system.taken"] ?? s.system?.taken, branch: u["system.branch"] ?? s.system?.branch } };
      });
      for (const name of benedictionGateFaults(after)) log(`azeroth-rpg | 0.16.2.1: ${actor.name}'s ${name} no longer meets its Benediction tier's gate; the player chooses which pick to hand back`);
      return plan.updates;
    },
    embeds: async actor => {
      if (actor.type !== "character") return [];
      const { plan } = planOf(actor);
      for (const c of plan.creates) log(`azeroth-rpg | 0.16.2.1: ${actor.name} gains ${c.name} at 0 ranks`);
      return plan.creates;
    }
  }, log);
}
