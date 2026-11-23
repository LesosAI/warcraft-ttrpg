/**
 * **THE DEATH WATCH'S LAW** (the Necromancer plan's Phase 4 door 1). Pure: no Foundry
 * imports (CLAUDE.md §3). `effects/death-watch.mjs` is the one observer that reads it.
 *
 * Before this door, four GM-side observers each kept their own Health baselines off
 * `updateActor` (Dying Mind, Unraveling Mana, Maggot Goo, Crushridge Kin), and none of
 * them saw a token marked defeated. One observer keeps one baseline for every actor on
 * every client, and the active GM hands each change to the listeners:
 *
 * - **`healthFell`** - an NPC's Health went from above 0 to 0 or less. The four creature
 *   listeners read this alone, each with its own predicate over `before` and `after`, so
 *   what fired them before fires them now.
 * - **`died`** - the creature became a corpse (`raise.mjs#isCorpse`, D-970's reading): an
 *   NPC at 0 Health or anything marked defeated, never a Dying character and never one of
 *   the raised dead. Essence (02 §7's Necromancer) and Soul Harvest (02 §7's Warlock) read
 *   this, so the defeated mark gives Essence as 0 Health does, and a creature that drops
 *   to 0 and is then marked defeated dies once.
 * - **`raisedDown`** - one of the raised dead dropped to 0 Health. `isCorpse` is false for
 *   the raised dead, so this is a separate event: Unending Dead, Bloated Dead and Restless
 *   Bones read it.
 * - **`characterFell`** - a CHARACTER's Health went from above 0 to 0 (10 §3: *A creature
 *   exposes you when it reduces you to 0 Health*; D-1729). It has its own listeners
 *   (`effects/death-watch.mjs#onCharacterDown`), so no creature listener above is handed it.
 *   A character already at 0 who takes another blow has not fallen again; one healed above 0
 *   and dropped again has.
 *
 * **An unobserved death is never inferred**: an actor with no baseline (a corpse loaded
 * with the world, a token placed at 0) gives no event, and its first look only primes it.
 */

import { isCorpse } from "./raise.mjs";

const finite = v => typeof v === "number" && Number.isFinite(v);

/**
 * The facts one look at an actor gives: its Health, whether it is an NPC, whether it is
 * marked defeated, whether it is one of the raised dead, and whether it is a character
 * (D-1729's drop).
 *
 * @typedef {{health: number|null, npc: boolean, dead: boolean, raised: boolean, character?: boolean}} DeathFacts
 */

/**
 * Whether the change from one look to the next is a death of each kind.
 *
 * @param {DeathFacts|null} before
 * @param {DeathFacts} after
 * @returns {{healthFell: boolean, died: boolean, raisedDown: boolean, characterFell: boolean, before: number|null, after: number|null}}
 */
export function deathChange(before, after) {
  const was = before?.health ?? null;
  const now = after?.health ?? null;
  const none = { healthFell: false, died: false, raisedDown: false, characterFell: false, before: was, after: now };
  if (!before || !after) return none;
  const fell = finite(was) && finite(now) && was > 0 && now <= 0;
  return {
    healthFell: after.npc === true && fell,
    died: !isCorpse(before) && isCorpse(after),
    raisedDown: after.raised === true && fell,
    characterFell: after.character === true && fell,
    before: was,
    after: now
  };
}

/* ------------------------------------------------------------------ */
/*  Who dealt the blow                                                  */
/* ------------------------------------------------------------------ */

/**
 * **THE UPDATE OPTION THAT NAMES WHO DEALT THE DAMAGE** (D-1729). `AzerothActor#adjustHealth`
 * writes it on the same update that writes the Health, beside `azerothDamageApplied`, from the
 * damage door's `by` (or `dealtBy`, the attribution-only name a door with no striker gives);
 * core hands an operation's own keys to every client's `updateActor` hook, so the death watch
 * on the active GM reads it off the write that dropped the character - never off a guess made
 * afterwards. A write that names nobody exposes nobody.
 */
export const DAMAGE_BY_OPTION = "azerothDamageBy";

/**
 * The plain record of the dealer the option carries: its uuid (a token's synthetic actor keeps
 * its own), its world id and its name. Null where there is nothing to name.
 *
 * @param {{uuid?: string, id?: string, name?: string}|null} actor
 * @returns {{uuid: string|null, actorId: string|null, name: string}|null}
 */
export function dealerRecord(actor) {
  if (!actor || typeof actor !== "object") return null;
  const uuid = typeof actor.uuid === "string" && actor.uuid ? actor.uuid : null;
  const actorId = typeof actor.id === "string" && actor.id ? actor.id : null;
  if (!uuid && !actorId) return null;
  return { uuid, actorId, name: String(actor.name ?? "") };
}

/**
 * **ONE BASELINE FOR EVERY ACTOR** - a synthetic token actor is its own key, so two
 * unlinked tokens of one creature die apart. `prime` never overwrites a baseline it
 * already holds (a scene primed again must not hide a death), and `observe` moves the
 * baseline on every look, on every client, so a GM who takes over already holds it.
 *
 * @returns {{prime: (key: object, facts: DeathFacts) => void, observe: (key: object, facts: DeathFacts) => ReturnType<typeof deathChange>, has: (key: object) => boolean}}
 */
export function deathObserver() {
  const seen = new WeakMap();
  return {
    prime(key, facts) {
      if (key && typeof key === "object" && facts && !seen.has(key)) seen.set(key, { ...facts });
    },
    observe(key, facts) {
      if (!key || typeof key !== "object" || !facts) return deathChange(null, facts);
      const before = seen.get(key) ?? null;
      seen.set(key, { ...facts });
      return deathChange(before, facts);
    },
    has(key) {
      return Boolean(key) && seen.has(key);
    }
  };
}

/* ------------------------------------------------------------------ */
/*  One death, one harvest                                              */
/* ------------------------------------------------------------------ */

/**
 * **THE MARK A DEATH LEAVES ON THE CREATURE THAT DIED** (the 4a review's SHOULD-FIX): a creature
 * gives Essence and Soul Harvest once per death. The defeated mark taken off and laid again on a
 * creature that never rose above 0 Health is the same death; the mark is cleared when it HEALS
 * above 0.
 */
export const DEATH_GIVEN_FLAG = "deathGiven";

/**
 * **EVERY ONCE-A-DEATH MARK A HEAL ABOVE 0 CLEARS** (the Demon Hunter review's L14): the death's own gift, and 02's
 * Devour Soul's soul taken (`demon-hunter-features.mjs#DEVOUR_SOUL.given`, held equal by its Vitest), so a creature
 * that heals and dies again may give and be devoured again.
 */
export const HEAL_CLEARS = Object.freeze([DEATH_GIVEN_FLAG, "soulDevoured"]);

/**
 * Whether this look at a creature is it healing above 0 Health: below or at 0 before, above it now.
 *
 * @param {number|null} before
 * @param {number|null} after
 * @returns {boolean}
 */
export function healedAboveZero(before, after) {
  return finite(before) && finite(after) && before <= 0 && after > 0;
}

/**
 * Whether a death gives anything: a creature already marked has given for this death.
 *
 * @param {{given?: boolean}} o
 * @returns {boolean}
 */
export function deathGives({ given = false } = {}) {
  return given !== true;
}

/* ------------------------------------------------------------------ */
/*  Soul Harvest                                                        */
/* ------------------------------------------------------------------ */

/** 02 §7's Warlock, level 14: *When a creature dies within 30 feet of you or a bound demon, you gain 2 Mana.* */
export const SOUL_HARVEST = Object.freeze({ feature: "Soul Harvest", feet: 30, mana: 2 });

/**
 * **WHAT ONE DEATH GIVES A WARLOCK WHO HOLDS SOUL HARVEST**: 2 Mana where the creature
 * died within 30 feet of the Warlock or of one of its bound demons, capped at the pool's
 * maximum. Any creature: the feature names neither a living creature nor an enemy.
 *
 * @param {{feet?: Array<number|null>, pool?: {value?: number, max?: number}|null}} o
 *   `feet` the distances measured from the Warlock and from each bound demon, null where
 *   one could not be measured (another scene, no token)
 * @returns {{gain: number, value: number, reason: null|"noPool"|"tooFar"|"full"}}
 */
export function soulHarvestGain({ feet = [], pool = null } = {}) {
  const value = Math.max(0, Math.trunc(Number(pool?.value)) || 0);
  if (!pool) return { gain: 0, value, reason: "noPool" };
  const near = (Array.isArray(feet) ? feet : []).some(f => finite(f) && f <= SOUL_HARVEST.feet);
  if (!near) return { gain: 0, value, reason: "tooFar" };
  const max = Math.max(0, Math.trunc(Number(pool.max)) || 0);
  const next = Math.min(max, value + SOUL_HARVEST.mana);
  if (next <= value) return { gain: 0, value, reason: "full" };
  return { gain: next - value, value: next, reason: null };
}
