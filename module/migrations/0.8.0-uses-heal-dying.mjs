/**
 * Migration to 0.8.0 - talents learn their uses, spells their healing, and a
 * character its Death Steps (D-623, D-625, D-629).
 *
 * All three are additive fields with initials, so no document fails to load
 * and no source needs reshaping. What the migration does is STAMP the copies
 * a regenerated pack cannot reach: a talent already on a character reads
 * "Once per Short Rest" in its effect and carries no counter until this
 * reads the sentence for it; a spell in a world carries no heal. Idempotent:
 * a talent whose `uses.per` is set, and a spell whose heal is set, are left
 * alone.
 */

import { usesFromText } from "../rules/uses.mjs";

/**
 * The update for one talent, or null. Reads the effect the way the parser
 * does and stamps the same shape.
 */
export function buildTalentUpdate(system) {
  if (!system || typeof system !== "object") return null;
  if (system.uses?.per) return null;
  const u = usesFromText(system.effect ?? "");
  if (!u) return null;
  return { "system.uses": { value: u.max, max: u.max, per: u.per } };
}

/** The update for one spell, or null. Filled in by D-625's healing pass. */
export function buildSpellUpdate(system, healFromText = null) {
  if (!system || typeof system !== "object" || typeof healFromText !== "function") return null;
  const h = system.heal ?? {};
  if (h.amount != null || h.perTurn != null || h.fromDamage) return null;
  const parsed = healFromText(system.effect ?? "");
  if (!parsed || (parsed.amount == null && parsed.perTurn == null && !parsed.fromDamage)) return null;
  return { "system.heal": { amount: parsed.amount ?? null, perTurn: parsed.perTurn ?? null, fromDamage: parsed.fromDamage ?? null } };
}

export async function migrate(log = console.log) {
  let touched = 0;
  let healFromText = null;
  try {
    ({ healFromText } = await import("../rules/healing.mjs"));
  } catch {
    healFromText = null;
  }

  const applyTo = async (item, where) => {
    let update = null;
    if (item.type === "talent") update = buildTalentUpdate(item.toObject?.().system ?? item.system);
    else if (item.type === "spell") update = buildSpellUpdate(item.toObject?.().system ?? item.system, healFromText);
    if (!update) return;
    await item.update(update, { render: false, diff: false });
    log(`azeroth-rpg | ${where}: ${item.name} (${item.id})`);
    touched++;
  };

  for (const item of game.items) await applyTo(item, "world item");

  for (const actor of game.actors) {
    for (const item of actor.items) await applyTo(item, `on ${actor.name}`);
  }

  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor) continue;
      for (const item of token.actor.items) await applyTo(item, `token on ${scene.name}`);
    }
  }

  for (const worldPack of game.packs) {
    if (worldPack.metadata.packageType !== "world" || worldPack.locked) continue;
    if (worldPack.documentName === "Item") {
      for (const doc of await worldPack.getDocuments()) await applyTo(doc, `pack ${worldPack.metadata.id}`);
    } else if (worldPack.documentName === "Actor") {
      for (const doc of await worldPack.getDocuments()) {
        for (const item of doc.items) await applyTo(item, `pack ${worldPack.metadata.id}, ${doc.name}`);
      }
    }
  }

  return touched;
}
