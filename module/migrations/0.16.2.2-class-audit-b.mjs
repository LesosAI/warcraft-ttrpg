/**
 * Migration to 0.16.2.2 - the class talent audit's Rogue, Shaman and Priest (the lead, 2026-11-22:
 * *"All other propsals are approved. Build these changes"*; D-1880 to D-1887).
 *
 * What the audit changed on a document a world already holds, and what each needs:
 *
 * 1. **THREE CAPSTONES ARE RENAMED IN THEIR OWN SLOT** (R2): Storm, Earth and Fire is Eye of the
 *    Storm, Ancestral Tide is Tide of the Ancestors, Void Eruption is Herald of the Void. Each new
 *    talent is the same branch, the same tier and the same one rank, so a TAKEN rank is CARRIED to
 *    the new identifier - nothing is refunded. The talent item takes the pack copy's name,
 *    identifier, image and words. The spell the old talent taught (Ancestral Tide, Void Eruption)
 *    carries `spellFrom` naming the talent item, and the feature sync withdraws it at world load
 *    because the new row teaches nothing (`AzerothActor#_syncClassFeaturesNow`); a granted feature
 *    named for the old talent is withdrawn and the new one granted by the same sync.
 * 2. **TWENTY-NINE OTHER TALENTS PRINT NEW WORDS**, and Gadgeteer two ranks where it had one. Each
 *    owned copy takes the pack copy's words, ranks, requirement and use count where they differ
 *    (D-665: compared against the pack copy, never against `undefined`). `taken` is kept, never
 *    above the new ranks; a use count is kept, never above its new maximum.
 * 3. **NOTHING ELSE IS STORED.** The class features (Finisher, Poisoner, Assassinate, Shadowstep,
 *    Ward, Mass Mend, Divine Hymn, Forked Lightning) are stamps the sync restamps at world load
 *    (D-621); every talent's mechanics are its row's, read at the door.
 *
 * A pack that does not yet carry a new identifier (the code loaded before `packs:build`) warns and
 * stamps nothing for that talent, rather than throwing on every load (D-758). Idempotent: a second
 * run finds every owned talent equal to its pack copy and writes nothing.
 */

import { rawSystem, sameStored, walkWorld } from "./walk.mjs";

/** The pack a talent is read from. */
export const TALENTS_PACK = "azeroth-rpg.talents";

/** The three capstones renamed in their own slot: `className/old` to the new identifier. */
export const AUDIT_B_RENAMES = Object.freeze({
  "Shaman/storm-earth-and-fire": "eye-of-the-storm",
  "Shaman/ancestral-tide": "tide-of-the-ancestors",
  "Priest/void-eruption": "herald-of-the-void"
});

/** Every other talent whose printed words the audit changed, by class. */
export const AUDIT_B_CHANGED = Object.freeze({
  Rogue: Object.freeze(["envenom", "deft-hands", "rupture", "death-mark", "adrenaline", "killing-spree", "combat-reflexes",
    "master-duellist", "find-weakness", "master-of-shadows", "gadgeteer", "cluster-rockets"]),
  Priest: Object.freeze(["power-word-shield", "pain-suppression", "barrier", "shield-discipline", "spirit-shell", "renew",
    "serendipity", "miracle", "shadow-word-pain", "mind-flay", "shadowform", "herald-of-the-void"]),
  Shaman: Object.freeze(["elemental-fury", "eye-of-the-storm", "stormlash", "flametongue", "earthen-shield", "healing-wave",
    "earthliving", "tide-of-the-ancestors", "trolls-blood", "serpent-ward", "hold-the-thread"])
});

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
  return AUDIT_B_RENAMES[`${className}/${identifier}`] ?? identifier;
}

/** Whether an owned talent is one this migration answers for. */
export function inScope(system) {
  const id = targetIdentifier(system);
  return Boolean(id) && (AUDIT_B_CHANGED[system?.className] ?? []).includes(id);
}

/**
 * **ONE OWNED TALENT AGAINST ITS PACK COPY**: the update that brings it level, or null where it
 * already is. The rank taken is kept (never above the new ranks), and so is a use count (never
 * above its new maximum).
 *
 * @param {{_id?: string, id?: string, name?: string, img?: string, system?: object}} stored  the owned talent's source
 * @param {{name: string, img?: string, system: object}} pack  the pack copy
 * @returns {object|null}
 */
export function talentRestamp(stored, pack) {
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
 * The updates one actor's owned talents take, read off the pack copies by `className/identifier`.
 *
 * @param {Iterable<object>} items  the actor's items, as their stored source reads
 * @param {Map<string, object>} packByKey  `className/identifier` to the pack copy
 * @param {(line: string) => void} [warn]
 * @returns {object[]}
 */
export function auditBUpdates(items = [], packByKey = new Map(), warn = () => {}) {
  const out = [];
  for (const item of items ?? []) {
    if (item?.type !== "talent") continue;
    const system = item.system ?? {};
    if (!inScope(system)) continue;
    const key = `${system.className}/${targetIdentifier(system)}`;
    const pack = packByKey.get(key) ?? null;
    if (!pack) {
      warn(`azeroth-rpg | 0.16.2.2: the talents pack holds no ${key}; rebuild the packs (npm run packs:build) and run it again`);
      continue;
    }
    const update = talentRestamp(item, pack);
    if (update) out.push(update);
  }
  return out.sort((a, b) => String(a._id).localeCompare(String(b._id)));
}

export async function migrate(log = console.log) {
  const pack = game.packs?.get(TALENTS_PACK) ?? null;
  if (!pack) {
    log(`azeroth-rpg | 0.16.2.2: no ${TALENTS_PACK} pack; nothing stamped`);
    return 0;
  }
  const docs = await pack.getDocuments();
  const packByKey = new Map();
  for (const d of docs.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const sys = d.system ?? {};
    if (!sys.className || !sys.identifier) continue;
    packByKey.set(`${sys.className}/${sys.identifier}`, { name: d.name, img: d.img, system: d.toObject().system });
  }
  return walkWorld({
    items: async actor => {
      if (actor.type !== "character") return [];
      const sources = [...(actor.items ?? [])].map(i => ({ _id: i.id, type: i.type, name: i.name, img: i.img, system: rawSystem(i) }));
      const updates = auditBUpdates(sources, packByKey, log);
      for (const u of updates) log(`azeroth-rpg | 0.16.2.2: ${actor.name}'s ${u.name ?? sources.find(s => s._id === u._id)?.name ?? u._id} takes the audit's words`);
      return updates;
    }
  }, log);
}
