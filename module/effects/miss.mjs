/**
 * **A HIT TURNED INTO A MISS, WITHDRAWN FROM THE CREATURE IT STRUCK** (the Legacy
 * branches' door 13; the lead: *"Conditions only apply on hit unless otherwise
 * stated"*). `rules/miss.mjs` is the law; this is the write, made on the
 * DEFENDER's client - the one that answered the blow, with a Parry that held
 * (`applications/actions.mjs#parryNow`) or 04's Afterimage (*The attack misses*;
 * `workflows.useFeature`'s `onUse.mitigate: "negate"`) - so every write is on a
 * creature this client owns:
 *
 * - each condition the card recorded landing with the hit is taken off, or put
 *   back to the value it had before (D-779's `parryUndoes`, now one row kind of
 *   the record);
 * - each Speed drop, no-healing mark and Bane the hit laid is deleted, by the
 *   effect's own id;
 * - a Reaction the hit took is given back through the combatant's queued door
 *   (`AzerothCombatant#regainReaction`), unless the Reaction that answered WAS
 *   that one.
 *
 * The card itself is the attacker's, so what is written there - the row
 * `withdrawn`, which refuses the Tests the hit offered, and the refund of a rider
 * the attacker paid on the hit - rides the annotation the Reaction already makes
 * (`dice/annotate.mjs`), on the card's owner's client or the GM's.
 */

import { AZEROTH } from "../config.mjs";
import { missUndoes } from "../rules/miss.mjs";
import { LAID_BY_FLAG, laidByWith, laidByWithout } from "../rules/talent-gates.mjs";

/**
 * Withdraw what the hit laid on this creature, and say what came off.
 *
 * @param {Actor} defender  the creature the card's row names, owned here
 * @param {{messageId?: string|null, index?: number|null, answeredWithLost?: boolean}} o
 * @returns {Promise<{conditions: string[], effects: string[], reaction: boolean, tests: boolean}>}  what came off, in words
 */
export async function withdrawHit(defender, { messageId = null, index = null, answeredWithLost = false } = {}) {
  const out = { conditions: [], effects: [], reaction: false, tests: false };
  if (!defender?.isOwner || !messageId || !Number.isInteger(index)) return out;
  const record = game.messages?.get(messageId)?.flags?.["azeroth-rpg"]?.landedOnHit ?? [];
  const undo = missUndoes(record, { index, answeredWithLost });
  out.tests = undo.tests;
  for (const u of undo.conditions) {
    const effect = defender.effects?.find?.(e => e.statuses?.has?.(u.id)) ?? null;
    if (!effect) continue;
    if (u.remove) await defender.toggleStatusEffect(u.id, { active: false });
    else await effect.setFlag("azeroth-rpg", "value", u.value);
    out.conditions.push(game.i18n.localize(AZEROTH.conditions[u.id] ?? u.id) + (u.remove ? "" : ` ${u.value}`));
  }
  // **THE STRIKER THE LANDING NAMED, BACK OFF A CONDITION THAT STAYS** (the B1 review):
  // a creature that already had it keeps the effect, and the layer this hit added to
  // its `laidBy` goes - Cursed Prey and None Escape no longer read it as the striker's.
  for (const s of undo.strips ?? []) {
    const effect = defender.effects?.find?.(e => e.statuses?.has?.(s.id)) ?? null;
    if (!effect) continue;
    const held = effect.flags?.["azeroth-rpg"]?.[LAID_BY_FLAG] ?? [];
    const next = laidByWithout(held, s.uuid);
    if (next.length !== laidByWith(held, null).length) await effect.setFlag("azeroth-rpg", LAID_BY_FLAG, next);
  }
  const doomed = undo.effects.map(id => defender.effects?.get?.(id) ?? null).filter(Boolean);
  if (doomed.length) {
    out.effects.push(...doomed.map(e => e.name));
    await defender.deleteEmbeddedDocuments("ActiveEffect", doomed.map(e => e.id));
  }
  if (undo.reaction) {
    const fight = defender.activeFight?.() ?? null;
    const mine = fight?.getCombatantsByActor?.(defender)?.[0] ?? null;
    if (mine?.isOwner) out.reaction = (await mine.regainReaction())?.regained === true;
  }
  return out;
}

/**
 * The words a withdrawal comes to on the answering card: *Kael's Bleeding, Speed
 * drop and Reaction come back off*, or nothing where nothing came off.
 *
 * @param {string} name  the defender's
 * @param {Awaited<ReturnType<typeof withdrawHit>>} done
 * @returns {string}
 */
export function withdrawnWords(name, done) {
  const parts = [...(done?.conditions ?? []), ...(done?.effects ?? [])];
  if (done?.reaction) parts.push(game.i18n.localize("AZEROTH.Miss.Reaction"));
  return parts.length ? game.i18n.format("AZEROTH.Miss.Withdrawn", { name, what: parts.join(", ") }) : "";
}
