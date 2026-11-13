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

import { SAND, gainSand, sandBronzeGain, sandFromCast } from "../rules/sand.mjs";

/** The round a Sand of the Bronze gain is counted in: the fight's, else the cast's. */
function roundMarkOf(actor, cast) {
  const fight = actor?.activeFight?.() ?? null;
  return fight?.started ? `${fight.id}:${fight.round}` : (cast ? `cast:${cast}` : null);
}

export const SAND_GAIN_QUERY = "azeroth-rpg.sandGain";

/** The flag that holds the cast whose failed Resist already gave Sand. */
export const SAND_RESIST_FLAG = "sandResistCast";

/** The caster's Sand pool, or null where it holds none. */
function sandPool(actor) {
  return (actor?.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === SAND) ?? null;
}

/** The Sand pool, for a door that must refuse before it pays (Stolen Hour, D-911). */
export function sandPoolOf(actor) {
  return sandPool(actor);
}

/** The flag that holds the round Sand of the Bronze last gave Sand in (D-911). */
export const SAND_BRONZE_FLAG = "sandBronzeRound";

/**
 * **STOLEN HOUR** (08 §20, D-911: *gain Sand up to its cap*): the pool filled to
 * the cap the Hourglass gives it, through the one Sand write. Answers what it gained.
 *
 * @param {Actor} actor  the bearer, whose own client presses
 * @returns {Promise<number>}
 */
export async function fillSand(actor) {
  const pool = sandPool(actor);
  if (!pool || !actor?.isOwner) return 0;
  const value = gainSand(pool.value, Math.max(0, (pool.max ?? 0) - (pool.value ?? 0)), pool.max);
  if (value === pool.value) return 0;
  await actor.updatePool([{ itemId: pool.itemId, kind: "momentum", value }]);
  return value - pool.value;
}

/** Here, where this client may write the caster. */
async function gainHere(actor, { cast = null, hit = false, sl = 0, failedResilience = false, spell = false } = {}) {
  const pool = sandPool(actor);
  if (!pool) return 0;
  // Once a cast, the failed Resist's +1.
  const resist = failedResilience && !(cast && actor.getFlag("azeroth-rpg", SAND_RESIST_FLAG) === cast);
  // **SAND OF THE BRONZE** (08 §20, D-911: *gains 1 Sand the first time each round
  // a creature fails a Resilience Test against one of their spells*): on a failed
  // Resist, once a round of the caster's fight - and once a cast out of one, where
  // there is no round to count (`sandBronzeGain`).
  const bronze = failedResilience && spell
    ? sandBronzeGain({ amount: actor.system?.signatureEffects?.sandOnFail ?? 0, mark: roundMarkOf(actor, cast), held: actor.getFlag("azeroth-rpg", SAND_BRONZE_FLAG) ?? null })
    : null;
  const amount = sandFromCast({ hit, sl, failedResilience: resist }) + (bronze?.amount ?? 0);
  if (!amount) return 0;
  const value = gainSand(pool.value, amount, pool.max);
  const extra = {
    ...(resist && cast ? { [`flags.azeroth-rpg.${SAND_RESIST_FLAG}`]: cast } : {}),
    ...(bronze?.amount ? { [`flags.azeroth-rpg.${SAND_BRONZE_FLAG}`]: bronze.mark } : {})
  };
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
  return gainHere(caster, { cast: flags.cast, failedResilience: true, spell: flags.kind === "spell" });
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
  const spell = message?.flags?.["azeroth-rpg"]?.kind === "spell";
  if (caster.isOwner) return gainHere(caster, { cast, failedResilience: true, spell });
  const gm = game.users?.activeGM;
  if (!gm) return 0;
  try {
    return Number(await gm.query(SAND_GAIN_QUERY, { casterUuid: caster.uuid, messageId: message.id, resisterUuid: resister?.uuid ?? null }, { timeout: 15000 })) || 0;
  } catch {
    return 0;
  }
}
