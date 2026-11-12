/**
 * **SAND GAINED FROM CASTING, WRITTEN** (02 §7's Sand paragraph, D-848; the stage 1
 * review: *nothing calls `sandFromCast`/`gainSand`*). `rules/sand.mjs` is the law; this
 * is the door, called at two moments:
 *
 * - **the cast** (`dice/workflows.mjs#castSpell`): +1 when a spell of the caster's hits
 *   a creature and +1 more at SL 2 or better (`sandFromCast({hit, sl})`), once a cast;
 * - **a failed Resist** (`dice/chat.mjs`, the Test's own door): +1 when a creature fails
 *   a Resilience Test against a spell or feature of the caster's, ONCE A CAST however
 *   many fail - the cast's key held on the caster's `sandResistCast` flag.
 *
 * The write goes through `AzerothActor#updatePool` with the cap the pool already
 * carries (the Hourglass's, 0 with none: *"no hourglass no sand"*), here where this
 * client owns the caster and through `CONFIG.queries` otherwise (a player's creature
 * failing a player's spell), the handler judging the card it names.
 */

import { SAND, gainSand, sandFromCast } from "../rules/sand.mjs";

export const SAND_GAIN_QUERY = "azeroth-rpg.sandGain";

/** The flag that holds the cast whose failed Resist already gave Sand. */
export const SAND_RESIST_FLAG = "sandResistCast";

/** The caster's Sand pool, or null where it holds none. */
function sandPool(actor) {
  return (actor?.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === SAND) ?? null;
}

/** Here, where this client may write the caster. */
async function gainHere(actor, { cast = null, hit = false, sl = 0, failedResilience = false } = {}) {
  const pool = sandPool(actor);
  if (!pool) return 0;
  // Once a cast, the failed Resist's +1.
  const resist = failedResilience && !(cast && actor.getFlag("azeroth-rpg", SAND_RESIST_FLAG) === cast);
  const amount = sandFromCast({ hit, sl, failedResilience: resist });
  if (!amount) return 0;
  const value = gainSand(pool.value, amount, pool.max);
  const extra = resist && cast ? { [`flags.azeroth-rpg.${SAND_RESIST_FLAG}`]: cast } : {};
  if (value === pool.value) {
    if (Object.keys(extra).length) await actor.update(extra);
    return 0;
  }
  await actor.updatePool([{ itemId: pool.itemId, kind: "momentum", value }], extra);
  return value - pool.value;
}

/** The GM-side handler: a failed Resist on a card whose caster this client does not own. */
export async function sandGainQueryHandler({ casterUuid = null, messageId = null, resisterUuid = null } = {}, { user = null } = {}) {
  const caster = casterUuid ? await fromUuid(casterUuid) : null;
  const message = messageId ? game.messages?.get(messageId) : null;
  const flags = message?.flags?.["azeroth-rpg"] ?? null;
  if (!caster || caster.documentName !== "Actor" || !flags?.cast) return 0;
  if (user && !user.isGM) {
    const resister = resisterUuid ? await fromUuid(resisterUuid) : null;
    if (resister?.documentName !== "Actor" || !resister.testUserPermission(user, "OWNER")) return 0;
  }
  return gainHere(caster, { cast: flags.cast, failedResilience: true });
}

/**
 * **THE CAST'S SAND**: what a spell that hit gives its caster, at the cast's SL.
 * The caster is the client's own (it cast), so this always writes here.
 */
export async function gainSandFromHit(actor, { sl = 0 } = {}) {
  if (!actor?.isOwner) return 0;
  return gainHere(actor, { hit: true, sl });
}

/**
 * **A FAILED RESIST'S SAND**, once a cast: here where this client owns the caster, else
 * on the active GM's client. Nothing is said where no GM can write it: the Sand is the
 * caster's bookkeeping and the Test has already landed.
 */
export async function gainSandFromResist(caster, { message = null, resister = null } = {}) {
  const cast = message?.flags?.["azeroth-rpg"]?.cast ?? null;
  if (!caster || !cast || !sandPool(caster)) return 0;
  if (caster.isOwner) return gainHere(caster, { cast, failedResilience: true });
  const gm = game.users?.activeGM;
  if (!gm) return 0;
  try {
    return Number(await gm.query(SAND_GAIN_QUERY, { casterUuid: caster.uuid, messageId: message.id, resisterUuid: resister?.uuid ?? null }, { timeout: 15000 })) || 0;
  } catch {
    return 0;
  }
}
