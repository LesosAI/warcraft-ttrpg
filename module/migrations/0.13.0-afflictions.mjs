/**
 * Migration to 0.13.0 - poisons and diseases are CARRIED until cured (D12, D-800 to D-805).
 *
 * Before this, a creature's disease was a timed Active Effect that ran out on its own, a
 * creature poison counted `remaining` ticks down, and a coating's poison laid a counted
 * tick. Now each is one carrier (`flags.azeroth-rpg.affliction`, no duration) that a cure
 * ends. The decisions are `rules/affliction-migration.mjs` (pure, with its Vitest); this
 * file only walks the world and writes.
 *
 * - the four creature diseases are converted IN PLACE and made untimed;
 * - the bespoke creature poisons keep their state flag, lose `remaining` and `until`, get
 *   the carrier and an hourly world beat;
 * - a coating's poison tick whose name is a carried gear-pack poison is replaced by a carrier;
 * - gear and weapon coatings take `carried` / `cures` from the PACK COPY (D-665).
 *
 * **IDEMPOTENT**: a carrier is never planned twice and a stamped field is never stamped
 * again. **NEVER THROWS** (CLAUDE.md section 15): a malformed document is warned about and
 * skipped, because a migration that throws is a console error on every load.
 */

import { planCoating, planEffect, planGear, poisonsFromPack } from "../rules/affliction-migration.mjs";
import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";

const NS = "azeroth-rpg";

const warn = (where, err) => console.warn(`azeroth-rpg | 0.13.0 skipped ${where}:`, err?.message ?? err);

/** Wrap the paths a plan names so the write REPLACES the object rather than merging into it. */
function forceReplace(update, paths = []) {
  const Forced = foundry.data?.operators?.ForcedReplacement;
  if (!Forced) return update;
  const out = { ...update };
  for (const path of paths) if (path in out) out[path] = Forced.create(out[path]);
  return out;
}

/**
 * Convert one creature's old effects. Exported for the Quench batch, which hands it a
 * stale effect and reads the carrier back.
 * @returns {Promise<number>} the effects touched
 */
export async function convertActorEffects(actor, { poisons = [], now = game.time?.worldTime ?? 0, log = console.log } = {}) {
  let touched = 0;
  const held = [...(actor.effects ?? [])].map(e => e.flags?.[NS]?.affliction).filter(a => a?.kind).map(a => ({ kind: a.kind, key: a.key }));
  const abilities = actor._source?.system?.abilities ?? {};
  for (const effect of [...(actor.effects ?? [])]) {
    try {
      const source = effect._source ?? {};
      const plan = planEffect({
        id: effect.id, name: effect.name, origin: effect.origin ?? source.origin ?? null,
        statuses: [...(effect.statuses ?? [])], duration: source.duration, start: source.start,
        flags: effect.flags?.[NS] ?? {}
      }, { now, abilities, type: actor.type, held, poisons });
      if (!plan) continue;
      if (plan.op === "skip") { warn(`${actor.name} / ${effect.name} (${plan.reason})`); continue; }
      if (plan.op === "update") {
        await effect.update(forceReplace(plan.update, plan.forced), { render: false });
      } else if (plan.op === "replace") {
        await actor.createEmbeddedDocuments("ActiveEffect", [plan.create], { render: false });
        await effect.delete({ render: false });
        if (plan.held) held.push(plan.held);
      } else if (plan.op === "drop") {
        await effect.delete({ render: false });
      }
      log(`azeroth-rpg | afflictions: ${actor.name} / ${effect.name}: ${plan.note}`);
      touched++;
    } catch (err) { warn(`${actor?.name} / ${effect?.name}`, err); }
  }
  return touched;
}

export async function migrate(log = console.log) {
  let walked = 0;
  let converted = 0;
  try {
    const gear = await packSystems("azeroth-rpg.gear");
    const poisons = poisonsFromPack(gear.byName);
    walked = await walkWorld({
      item: doc => {
        try {
          if (doc.type === "gear") {
            const raw = rawSystem(doc);
            return planGear(raw, packCopy(gear, raw, doc.name));
          }
          if (doc.type === "weapon") return planCoating(doc.flags?.[NS]?.coating ?? null, poisons);
        } catch (err) { warn(doc?.name, err); }
        return null;
      },
      actor: async doc => {
        try { converted += await convertActorEffects(doc, { poisons, log }); } catch (err) { warn(doc?.name, err); }
        return null;
      }
    }, log);
  } catch (err) { warn("the world walk", err); }
  return walked + converted;
}
