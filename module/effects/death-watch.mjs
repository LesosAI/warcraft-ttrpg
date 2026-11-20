/**
 * **THE DEATH WATCH** (the Necromancer plan's Phase 4 door 1): the ONE observer of a death.
 *
 * Every client keeps one baseline for every actor (`rules/death-watch.mjs#deathObserver`) off
 * `updateActor`, and off the defeated mark too - its status effect's creation and deletion,
 * and a combatant's `defeated` - so a GM who takes over already holds it and a death is never
 * inferred from a first look. Only the ACTIVE GM hands a change to the listeners, each
 * guarded, so one that throws never stops the next.
 *
 * The listeners (`onDeath`):
 * - Dying Mind, Unraveling Mana, Maggot Goo and Crushridge Kin (the four creature observers
 *   this replaced), each on `healthFell` with its own predicate;
 * - **02 §7's Necromancer's Essence**: *When a living enemy dies within 120 feet of you, gain 1
 *   Essence* - judged here off `rules/essence.mjs`, measured through `canvas/footprints.mjs`
 *   (D-732), and WRITTEN ON THE HOLDER'S OWN CLIENT: the gain is asked of the user who answers
 *   for the holder (an active owning player, else the active GM; `blow-doors.mjs#answererOf`)
 *   through `CONFIG.queries`, and that client writes it through its own pool queue with
 *   `essenceGain: "death"`, so it can never land over the player's own Mana write;
 * - **02 §7's Warlock's Soul Harvest**: *When a creature dies within 30 feet of you or a bound
 *   demon, you gain 2 Mana*, the same way.
 *
 * `raisedDown` (one of the raised dead dropping to 0) is handed to the listeners as its own
 * event; nothing in this door reads it yet beyond the event itself.
 *
 * **Drain Soul's `deathRewards` and Dark Minion's `raiseFallen` stay on `afterBlow`** (the plan:
 * *moved onto it only if their tests stay green*): both read the blow that killed (its caster,
 * its card), which the watch does not see.
 */

import { DEATH_GIVEN_FLAG, deathGives, deathObserver, healedAboveZero, soulHarvestGain, SOUL_HARVEST } from "../rules/death-watch.mjs";
import { ESSENCE, ESSENCE_PER_DEATH, essenceEnemy, essenceFromDeath, isLiving } from "../rules/essence.mjs";
import { creatureSnapshot } from "../rules/creature-kinds.mjs";
import { ESSENCE_GAIN_OPTION, SOUL_HARVEST_OPTION, essenceGainCue } from "../rules/animation-records.mjs";

/** The query a gain is asked through, on the client that answers for the holder. */
export const DEATH_WATCH_QUERY = "azeroth-rpg.deathWatch";

/** How long the GM waits on a holder's client before saying so. */
const ASK_MS = 10000;

const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const defeatedStatus = () => globalThis.CONFIG?.specialStatusEffects?.DEFEATED ?? "dead";

let observer = deathObserver();
const listeners = [];

/**
 * Hand every death to `fn` on the active GM's client: `{actor, healthFell, died, raisedDown,
 * before, after}`. Returns the unregister.
 *
 * @param {(event: object) => unknown} fn
 * @returns {() => void}
 */
export function onDeath(fn) {
  listeners.push(fn);
  return () => {
    const at = listeners.indexOf(fn);
    if (at >= 0) listeners.splice(at, 1);
  };
}

/** A fresh observer and no listeners - for a Vitest's own fixture, and nothing else. */
export function resetDeathWatch() {
  observer = deathObserver();
  listeners.length = 0;
}

/** Whether any combatant of this actor is marked defeated, in any fight. */
function combatantDefeated(actor) {
  for (const combat of values(globalThis.game?.combats)) {
    for (const c of values(combat?.combatants)) {
      if (c?.actor === actor && (c.isDefeated === true || c.defeated === true)) return true;
    }
  }
  return false;
}

/** What one look at an actor gives the observer. */
function factsOf(actor) {
  const health = actor?.system?.health?.value;
  let raised = false;
  try {
    raised = (actor?.getFlag?.("azeroth-rpg", "bond") ?? (actor?.isToken ? globalThis.game?.actors?.get?.(actor.id)?.getFlag?.("azeroth-rpg", "bond") : null))?.kind === "raised";
  } catch {
    raised = false;
  }
  return {
    health: typeof health === "number" ? health : null,
    npc: actor?.type === "npc",
    dead: actor?.statuses?.has?.(defeatedStatus()) === true || combatantDefeated(actor),
    raised
  };
}

function prime(actor) {
  if (actor && typeof actor === "object") observer.prime(actor, factsOf(actor));
}

function primeAll() {
  for (const actor of values(globalThis.game?.actors)) prime(actor);
  for (const scene of values(globalThis.game?.scenes)) for (const token of values(scene?.tokens)) prime(token?.actor);
}

/**
 * Look at an actor; on the active GM, hand a death to every listener. Resolves once every
 * listener has settled (core's hooks ignore it; a test awaits it).
 */
function look(actor) {
  if (!actor || typeof actor !== "object") return Promise.resolve();
  const change = observer.observe(actor, factsOf(actor));
  // A creature that heals above 0 may die again and give again (`rules/death-watch.mjs#DEATH_GIVEN_FLAG`).
  if (gmHere() && healedAboveZero(change.before, change.after) && actor.getFlag?.("azeroth-rpg", DEATH_GIVEN_FLAG)) {
    Promise.resolve(actor.unsetFlag?.("azeroth-rpg", DEATH_GIVEN_FLAG)).catch(err => console.warn("azeroth-rpg | a death's mark was not cleared", err));
  }
  if (!(change.healthFell || change.died || change.raisedDown) || !gmHere()) return Promise.resolve();
  const event = Object.freeze({ actor, ...change });
  const runs = [...listeners].map(fn => {
    try {
      return Promise.resolve(fn(event)).catch(err => console.warn("azeroth-rpg | death watch listener", err));
    } catch (err) {
      console.warn("azeroth-rpg | death watch listener", err);
      return Promise.resolve();
    }
  });
  return Promise.all(runs);
}

/** The actor a token or an effect belongs to, where it is an actor. */
const actorOfEffect = effect => (effect?.parent?.documentName === "Actor" ? effect.parent : null);

/**
 * Register the watch's hooks and its own two listeners (Essence and Soul Harvest). Called once
 * at init, after the creature listeners registered theirs.
 */
export function registerDeathWatch() {
  Hooks.on("ready", primeAll);
  Hooks.on("canvasReady", primeAll);
  Hooks.on("createActor", actor => prime(actor));
  Hooks.on("createToken", token => prime(token?.actor));
  Hooks.on("updateActor", actor => look(actor));
  const markChanged = effect => {
    const actor = actorOfEffect(effect);
    return actor && effect?.statuses?.has?.(defeatedStatus()) ? look(actor) : undefined;
  };
  Hooks.on("createActiveEffect", markChanged);
  Hooks.on("deleteActiveEffect", markChanged);
  Hooks.on("updateCombatant", (combatant, changed) => {
    return changed && Object.hasOwn(changed, "defeated") ? look(combatant?.actor ?? null) : undefined;
  });
  onDeath(event => (event.died ? harvest(event.actor) : undefined));
}

/* ------------------------------------------------------------------ */
/*  Essence and Soul Harvest                                            */
/* ------------------------------------------------------------------ */

/** The tokens a dead actor stands on: its own token where it is one, else every token of it. */
function tokensOf(actor) {
  if (actor?.isToken && actor.token) return [actor.token];
  const out = [];
  for (const scene of values(globalThis.game?.scenes)) for (const token of values(scene?.tokens)) if (token?.actor === actor) out.push(token);
  return out;
}

/** A holder's Essence pool, or null. */
const essenceOf = actor => (typeof actor?.poolSnapshot === "function" ? actor.poolSnapshot() : []).find(p => p.kind === "momentum" && p.name === ESSENCE) ?? null;

/** Whether an actor could gain anything from a death: an Essence pool or Soul Harvest. */
const harvests = actor => actor?.type === "character" && (Boolean(essenceOf(actor)) || actor.hasFeature?.(SOUL_HARVEST.feature) === true);

/**
 * **WHAT ONE DEATH GIVES EVERY HOLDER ON ITS SCENE** - judged on the GM's client, written on
 * each holder's. A holder is judged once, by the nearest of the dead creature's tokens that gives.
 * **One death gives once** (the 4a review's SHOULD-FIX): the creature is marked, and the mark is
 * cleared only when it heals above 0, so the defeated mark taken off and laid again gives nothing.
 */
async function harvest(dead) {
  if (!deathGives({ given: dead?.getFlag?.("azeroth-rpg", DEATH_GIVEN_FLAG) === true })) return;
  const corpses = tokensOf(dead);
  const holders = new Map();
  for (const corpse of corpses) {
    for (const token of values(corpse?.parent?.tokens)) {
      const holder = token?.actor ?? null;
      if (!holder || holder === dead || !harvests(holder)) continue;
      const key = holder.uuid ?? holder.id;
      if (!holders.has(key)) holders.set(key, { holder, pairs: [] });
      holders.get(key).pairs.push({ token, corpse });
    }
  }
  if (!holders.size) return;
  // The mark is written only where somebody could gain (one write a death, never one on every creature).
  try {
    await dead?.setFlag?.("azeroth-rpg", DEATH_GIVEN_FLAG, true);
  } catch (err) {
    console.warn("azeroth-rpg | a death's mark was not written", err);
  }
  const [{ feetApart }, { allyStandingOf, combatantIn }, { manaPool }] = await Promise.all([
    import("../canvas/footprints.mjs"), import("../canvas/engaged.mjs"), import("../rules/pools.mjs")
  ]);
  const living = isLiving(creatureSnapshot({ type: dead.type, system: dead.system, race: dead.raceItem?.name ?? null }));
  const deathId = globalThis.foundry?.utils?.randomID?.() ?? String(Date.now());
  for (const { holder, pairs } of [...holders.values()].sort((a, b) => String(a.holder.id).localeCompare(String(b.holder.id)))) {
    // Essence: the nearest corpse token that gives one (the wisp is drawn from it).
    const pool = essenceOf(holder);
    if (pool) {
      const fight = holder.activeFight?.() ?? null;
      let best = null;
      for (const { token, corpse } of pairs) {
        const mine = allyStandingOf({ actor: holder, token, fight, combatant: combatantIn(fight, holder, token) });
        const theirs = allyStandingOf({ actor: dead, token: corpse, fight, combatant: combatantIn(fight, dead, corpse) });
        const feet = feetApart(token, corpse);
        const verdict = essenceFromDeath({ living, enemy: essenceEnemy(mine, theirs), feet, pool });
        if (verdict.gain > 0 && (!best || feet < best.feet)) best = { token, corpse, feet };
      }
      if (best) await ask(holder, { act: "essence", holderUuid: holder.uuid, deathId, ...cueSource(best) });
    }
    // Soul Harvest: within 30 feet of the Warlock or of a bound demon.
    if (holder.hasFeature?.(SOUL_HARVEST.feature)) {
      const mana = manaPool(holder.poolSnapshot?.() ?? []);
      const feet = [];
      // The wisp runs from the nearest corpse token to the Warlock's own (D-724: as the GM saw them).
      let nearest = null;
      for (const { token, corpse } of pairs) {
        const apart = feetApart(token, corpse);
        feet.push(apart);
        if (!nearest || apart < nearest.feet) nearest = { token, corpse, feet: apart };
        for (const other of values(corpse.parent?.tokens)) {
          const bond = other?.actor && (other.actor.isToken ? game.actors?.get?.(other.actor.id) : other.actor)?.getFlag?.("azeroth-rpg", "bond");
          if (bond?.kind === "demon" && bond.ownerUuid === holder.uuid && other.actor !== dead) feet.push(feetApart(other, corpse));
        }
      }
      if (soulHarvestGain({ feet, pool: mana }).gain > 0) await ask(holder, { act: "soulHarvest", holderUuid: holder.uuid, deathId, ...(nearest ? cueSource(nearest) : {}) });
    }
  }
}

/** Where the Essence came from and went to, as the cue records it (D-724). */
function cueSource({ token, corpse }) {
  return {
    holderToken: { sceneId: token.parent?.id ?? null, tokenId: token.id ?? null },
    corpseToken: { sceneId: corpse.parent?.id ?? null, tokenId: corpse.id ?? null }
  };
}

/** Ask the user who answers for the holder to write the gain; here where that is this user. */
async function ask(holder, payload) {
  const { answererOf } = await import("./blow-doors.mjs");
  const who = answererOf(holder);
  if (!who) return { ok: false, reason: "nobody" };
  if (who.id === game.user.id) return deathWatchQueryHandler(payload, { user: game.user });
  try {
    return await who.query(DEATH_WATCH_QUERY, payload, { timeout: ASK_MS });
  } catch (err) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.DeathWatch.NoAnswer", { name: holder.name, reason: err?.message ?? "" }));
    return { ok: false, reason: "error" };
  }
}

/**
 * **THE GAIN, WRITTEN ON THE HOLDER'S OWN CLIENT** (`CONFIG.queries[DEATH_WATCH_QUERY]`): only a
 * GM asks; the pool is read again inside this client's pool queue, so two deaths in one moment
 * give two Essence and a full pool gives none.
 *
 * @param {{act: "essence"|"soulHarvest", holderUuid: string, holderToken?: object, corpseToken?: object}} payload
 * @param {{user?: User|null}} [context]
 */
export async function deathWatchQueryHandler(payload = {}, { user = null } = {}) {
  if (user?.isGM !== true) return { ok: false, reason: "notGM" };
  let holder = null;
  try {
    holder = fromUuidSync(payload.holderUuid);
  } catch {
    holder = null;
  }
  if (holder?.documentName !== "Actor" || !holder.isOwner) return { ok: false, reason: "notOwner" };
  const { poolWrite } = await import("../documents/pool-writes.mjs");
  if (payload.act === "essence") {
    return poolWrite(holder, async () => {
      const pool = essenceOf(holder);
      if (!pool) return { ok: false, reason: "noPool" };
      const next = Math.min(pool.max, pool.value + ESSENCE_PER_DEATH);
      if (next <= pool.value) return { ok: false, reason: "full" };
      const cue = essenceGainCue({ holder: payload.holderToken ?? null, corpse: payload.corpseToken ?? null, amount: next - pool.value });
      await holder.writePoolsNow({ itemId: pool.itemId, kind: "momentum", value: next }, {}, { essenceGain: "death", ...(cue ? { [ESSENCE_GAIN_OPTION]: cue } : {}) });
      return { ok: true, gain: next - pool.value, value: next };
    });
  }
  if (payload.act === "soulHarvest") {
    if (!holder.hasFeature?.(SOUL_HARVEST.feature)) return { ok: false, reason: "noFeature" };
    const { manaPool } = await import("../rules/pools.mjs");
    return poolWrite(holder, async () => {
      const pool = manaPool(holder.poolSnapshot());
      const verdict = soulHarvestGain({ feet: [0], pool });
      if (!verdict.gain) return { ok: false, reason: verdict.reason };
      // **ITS WISP** (the Necromancer plan's Phase 7): the Essence wisp's shape on this Mana write.
      const cue = essenceGainCue({ holder: payload.holderToken ?? null, corpse: payload.corpseToken ?? null, amount: verdict.gain });
      await holder.writePoolsNow({ itemId: pool.itemId, kind: "power", value: verdict.value }, {}, cue ? { [SOUL_HARVEST_OPTION]: cue } : {});
      ui.notifications?.info(game.i18n.format("AZEROTH.DeathWatch.SoulHarvest", { name: holder.name, mana: verdict.gain }));
      return { ok: true, gain: verdict.gain, value: verdict.value };
    });
  }
  throw new Error(`deathWatch: no such act ${JSON.stringify(payload.act ?? null)}`);
}
