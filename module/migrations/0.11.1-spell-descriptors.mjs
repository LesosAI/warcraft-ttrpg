/**
 * Migration to 0.11.1 - a spell's card descriptors refreshed (2026-09-06).
 *
 * 0.11.0 stamped `applies`, `rider` and `onFail` where the raw source had
 * no key - and a document loaded through the model never has no key: the
 * schema fills the initial, so every spell embedded before the descriptors
 * existed read as already stamped and kept `active: false`. The lead cast
 * Arcane Brilliance and the card offered no Apply. This pass takes the
 * pack copy's descriptors wherever they differ from what the world spell
 * holds (the descriptors are the parser's, never hand-edited), and seeds a
 * spell the pack lacks off its own words only where what it holds is the
 * empty default. Idempotent: a second run finds nothing to move.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { seedSpellEffects } from "../rules/spell-effects.mjs";

export const EMPTY = Object.freeze({
  applies: { active: false, changes: [], statuses: [] },
  rider: { statuses: [], rating: null, mode: null },
  onFail: { resilience: null, statuses: [] }
});

/** Structural equality over the small plain objects a descriptor is. */
export function sameShape(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => sameShape(a[k], b[k]));
}

/** The three descriptors a spell's own words seed. */
function ownSeeds(raw) {
  const own = seedSpellEffects({ effect: raw.effect ?? "", duration: raw.duration ?? {}, target: raw.target ?? "", damage: raw.damage ?? {} });
  return {
    applies: own.applies ? { active: true, ...own.applies } : EMPTY.applies,
    rider: own.rider ?? EMPTY.rider,
    onFail: own.onFail ?? EMPTY.onFail
  };
}

/**
 * The update for one spell's raw system source, or null.
 * @param {object} raw          the stored system
 * @param {object|null} pack    the pack copy's system, where one exists
 */
export function buildSpellDescriptorUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object") return null;
  const update = {};
  if (pack?.applies) {
    for (const k of ["applies", "rider", "onFail"]) {
      if (pack[k] !== undefined && !sameShape(raw[k] ?? EMPTY[k], pack[k])) update[`system.${k}`] = foundry_clone(pack[k]);
    }
  }
  else {
    const seeds = ownSeeds(raw);
    for (const k of ["applies", "rider", "onFail"]) {
      const held = raw[k] ?? EMPTY[k];
      if (sameShape(held, EMPTY[k]) && !sameShape(held, seeds[k])) update[`system.${k}`] = seeds[k];
    }
  }
  return Object.keys(update).length ? update : null;
}

function foundry_clone(v) {
  return JSON.parse(JSON.stringify(v));
}

export async function migrate(log = console.log) {
  const spells = await packSystems("azeroth-rpg.spells");
  return walkWorld({
    item: doc => (doc.type === "spell" ? buildSpellDescriptorUpdate(rawSystem(doc), packCopy(spells, rawSystem(doc), doc.name)) : null)
  }, log);
}
