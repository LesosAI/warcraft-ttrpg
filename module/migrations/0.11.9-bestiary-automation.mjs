/**
 * Migration to 0.11.9 — the bestiary, actually automated (D-691).
 *
 * `seedAutomation` reads five shapes it could not read before - a passive's
 * refusals, senses and standing grants; a summon's count and block; a
 * regeneration tick - and the parser now stamps a Boss's points off the
 * `**Boss Actions (N).**` label. A world made before this carries the old
 * descriptors: every creature dragged out of the pack has `kind: "none"` on
 * a hundred and thirty-four entries, no `bossPoints`, and no `reason` saying
 * why any of them is still prose.
 *
 * **Compared against the pack copy, never against `undefined`** (D-665).
 * `automation` has an initial and `_source` is the model's cleaned copy, so
 * `raw.automation === undefined` is false on every creature ever stored; the
 * pack's own row for the same ability is the reference, matched by name.
 *
 * **A GM's own descriptor is never overwritten.** A row that already does
 * something keeps every number it holds and gains only the three blocks the
 * old shape could not carry at all - `passive`, `summon` and `tick` - plus
 * the `reason` where it does nothing. A row that does nothing takes the
 * pack's whole descriptor, which is the 134 the lead was looking at. That is
 * what makes this idempotent: a second run finds them all in place.
 *
 * **What it deliberately leaves behind:** a row the old seeder read WRONGLY
 * rather than not at all - Prince Malchezaar's Netherborn read *he cannot be
 * Charmed* as a condition he inflicts - keeps its stale kind in an existing
 * world, because nothing here can tell that descriptor from one a GM typed.
 * The pack is regenerated, so a creature dragged in afresh is right.
 */

import { rawSystem, walkWorld } from "./walk.mjs";
import { cleanAutomation } from "../rules/ability-automation.mjs";

/** The lists a creature's descriptors live in, in the model's own order. */
const LISTS = Object.freeze(["creatureAbilities", "bossActions"]);

/** Two descriptors, compared as the stored shape rather than as objects. */
function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Whether a descriptor carries any of the standing half. */
function stands(a) {
  return Boolean(a.passive.grants.length || a.passive.refuses.length || a.passive.senses.length);
}

/** One row's descriptor, brought forward. */
export function mergeAutomation(stored, want) {
  const old = cleanAutomation(stored);
  const fresh = cleanAutomation(want);
  // Nothing at all: the pack's whole descriptor, which is the 134.
  if (old.kind === "none" && !old.reason && !stands(old) && !old.summon.entry && old.tick.heal === null) return fresh;
  // Otherwise the GM's numbers stand and only the new blocks are filled.
  const out = { ...old };
  if (!stands(old)) out.passive = fresh.passive;
  if (!old.summon.entry) out.summon = fresh.summon;
  if (old.tick.heal === null) out.tick = fresh.tick;
  if (out.kind === "none" && !out.reason) out.reason = fresh.reason;
  return out;
}

/**
 * The update for one creature, or null.
 *
 * @param {object} raw    the stored system
 * @param {object|null} packRows  the pack copy's `{creatureAbilities, bossActions, bossPoints}`
 */
export function buildAutomationUpdate(raw, packRows) {
  if (!raw || typeof raw !== "object" || !packRows) return null;
  const update = {};

  for (const list of LISTS) {
    const stored = Array.isArray(raw[list]) ? raw[list] : [];
    const fresh = Array.isArray(packRows[list]) ? packRows[list] : [];
    if (!stored.length || !fresh.length) continue;
    const byName = new Map(fresh.map(r => [r.name, r]));
    let moved = false;
    const rows = stored.map(row => {
      const want = byName.get(row?.name) ?? null;
      if (!want) return row;
      const merged = mergeAutomation(row?.automation, want.automation);
      if (same(cleanAutomation(row?.automation), merged)) return row;
      moved = true;
      return { ...row, automation: merged };
    });
    if (moved) update[`system.${list}`] = rows;
  }

  // The points a Boss holds each round, stamped by the parser off the label.
  const wantPoints = packRows.bossPoints ?? null;
  const held = raw.bossPoints ?? null;
  if (wantPoints && (wantPoints.max ?? null) !== null && (held?.max ?? null) === null) {
    update["system.bossPoints"] = { value: wantPoints.max, max: wantPoints.max };
  }

  return Object.keys(update).length ? update : null;
}

/** The bestiary pack's rows, by creature name. */
async function packRowsByName() {
  const out = new Map();
  const pack = game.packs.get("azeroth-rpg.bestiary");
  if (!pack) return out;
  for (const doc of await pack.getDocuments()) {
    const system = doc.toObject().system ?? {};
    out.set(doc.name, {
      creatureAbilities: system.creatureAbilities ?? [],
      bossActions: system.bossActions ?? [],
      bossPoints: system.bossPoints ?? null
    });
  }
  return out;
}

export async function migrate(log = console.log) {
  const rows = await packRowsByName();
  if (!rows.size) {
    log("azeroth-rpg | 0.11.9: the bestiary pack is unavailable; no creature was restamped");
    return 0;
  }
  return walkWorld({
    actor: doc => {
      if (doc.type !== "npc") return null;
      return buildAutomationUpdate(rawSystem(doc), rows.get(doc.name) ?? null);
    }
  }, log);
}
