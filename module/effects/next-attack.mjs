/**
 * **WHAT THE NEXT ATTACK WAS PROMISED, WRITTEN** (04's Precise Strike, Follow
 * Through and Vengeance; D-772). `rules/next-attack.mjs` is the law; this lays a
 * promise on the attacker's own flag and the attack door takes it.
 *
 * Three doors lay one: Precise Strike's Use (`workflows.useFeature`), a kill
 * (Follow Through, from `effects/after-blow.mjs`) and a friendly target falling
 * in reach (Vengeance, the same door). Each promise is stamped with the fight as
 * it stands; out of a fight there is nothing to hold it to and nothing is laid
 * (said in words). A second laying by the same talent REPLACES the first.
 */

import { NEXT_ATTACK_FLAG, afterTake, mergeNextAttack, nextAttackEntry } from "../rules/next-attack.mjs";

/**
 * Lay these promises on the attacker, said in words.
 *
 * @param {Actor} actor
 * @param {Array<{source: string, name: string, boons?: number, penetration?: number, damage?: number, lasts: string}>} grants
 * @param {{quiet?: boolean}} [o]
 * @returns {Promise<Array<object>>}  the promises laid; none out of a fight
 */
export async function layNextAttack(actor, grants = [], { quiet = false } = {}) {
  if (!actor || !grants?.length) return [];
  const now = actor.fightTurnNow?.() ?? null;
  const laid = grants.map(g => nextAttackEntry(g, now)).filter(Boolean);
  if (!laid.length) {
    if (!quiet && !now) {
      for (const g of grants) ui.notifications?.info(game.i18n.format("AZEROTH.NextAttack.NoFight", { name: actor.name, talent: g.name ?? "" }));
    }
    return [];
  }
  const held = actor.getFlag?.("azeroth-rpg", NEXT_ATTACK_FLAG) ?? [];
  await actor.setFlag("azeroth-rpg", NEXT_ATTACK_FLAG, mergeNextAttack(held, laid));
  if (!quiet) {
    for (const e of laid) ui.notifications?.info(game.i18n.format(`AZEROTH.NextAttack.Laid.${e.lasts}`, { name: actor.name, talent: e.name }));
  }
  return laid;
}

/**
 * **TAKE THE PROMISES THE ATTACK READ** - every one standing, and the lapsed
 * ones swept with them - in one write. The attack door calls this once it has
 * been paid for.
 *
 * **THE FLAG IS READ AGAIN AT THE WRITE, AND ONLY WHAT THE ATTACK READ GOES**
 * (the architect's review of D-772). This wrote `[]` over the whole flag, so a
 * promise laid while the attack's dialog stood open - a Follow Through or a
 * Vengeance landed from another card - was erased in silence, never taken.
 * `rules/next-attack.mjs#afterTake` matches on source and laid stamp.
 *
 * @param {Actor} actor
 * @param {{live: object[], lapsed: object[]}} pending  `AzerothActor#pendingNextAttack`'s,
 *   as the attack read it
 */
export async function takeNextAttack(actor, pending) {
  if (!actor?.isOwner) return;
  const taken = [...(pending?.live ?? []), ...(pending?.lapsed ?? [])];
  if (!taken.length) return;
  const held = actor.getFlag?.("azeroth-rpg", NEXT_ATTACK_FLAG) ?? [];
  const left = afterTake(held, taken);
  // Nothing the attack read is still there (another door took or replaced it).
  if (Array.isArray(held) && left.length === held.length) return;
  await actor.setFlag("azeroth-rpg", NEXT_ATTACK_FLAG, left);
}
