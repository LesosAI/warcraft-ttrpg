/**
 * **THE ONE DOOR EVERY CLAW HIT RUNS THROUGH** (the San'layn and Sovereign plan, C16:
 * *"Every roll runs the claw-hit doors (C3's Tribute, Raking Claws, the claw riders)"*;
 * D-1167). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * **The contract** (CORE's, kept whole; WEAPON wires the call): the attack door,
 * `dice/workflows.mjs#rollTest`, on the client that rolled, calls
 * `Hooks.callAll(CLAW_HIT_HOOK, clawHitPayload({...}))` **once for each target a roll of
 * the Sovereign's Claws HIT**, after the attack's card exists - the Off-Hand Attack's first
 * roll and each roll Blooded Claws and Raking Claws add, each on its own. Every roll is a
 * claw hit for every rule that reads one (the plan's MY READING under B.9): Tribute on the
 * prey (CORE), Raking Claws' Bleeding, Tasting Bite, Latch On, Sanguine Edge's damage,
 * Crimson Flourish's discount (FEATURES) and Blood-Forged Claws' re-mark (CORE).
 *
 * A listener subscribes once, at `init` or `ready`:
 *
 * ```js
 * import { CLAW_HIT_HOOK } from "../rules/claw-hit.mjs";
 * Hooks.on(CLAW_HIT_HOOK, payload => { ... });   // or onClawHit(fn) below
 * ```
 *
 * The payload is plain data (uuids, never documents), so a listener reads the documents
 * itself and decides whether it may write them (`gmAbsentFor` first).
 */

/** The hook name (CORE's). */
export const CLAW_HIT_HOOK = "azerothClawHit";

/** The Sovereign's Claws, by identifier. */
export const CLAWS_IDENTIFIER = "sovereign-claws";

/** Whether an item (or a bare system row) is the Sovereign's Claws. */
export function isClaws(item) {
  const sys = item?.system ?? item ?? {};
  return String(sys?.identifier ?? item?.identifier ?? "").trim().toLowerCase() === CLAWS_IDENTIFIER;
}

/**
 * Whether a roll fires the hook: the claws, and a hit.
 *
 * @param {{weapon?: object|null, hit?: boolean}} o
 */
export function firesClawHit({ weapon = null, hit = false } = {}) {
  return hit === true && isClaws(weapon);
}

/**
 * The hook's payload, one per target hit. Plain data only.
 *
 * - `attackerUuid`, `attackerTokenUuid`: the Sovereign and its token (null off the board);
 * - `targetActorUuid`, `targetTokenUuid`: the creature hit;
 * - `sl`: the roll's Success Level; `roll`: `{total, natural}`;
 * - `messageId`: the attack's card; `itemId`: the claws;
 * - `rollIndex`: this roll's place in the Off-Hand Attack (1 for the first) and `rolls` how
 *   many it makes (`initiative.mjs#offHandRolls`); `targetIndex`: the target's index on the card.
 *
 * @returns {Readonly<object>}
 */
export function clawHitPayload({
  attackerUuid = null, targetActorUuid = null, targetTokenUuid = null, attackerTokenUuid = null,
  sl = 0, messageId = null, roll = null, itemId = null, rollIndex = 1, rolls = 1, targetIndex = 0
} = {}) {
  const total = Number(roll?.total);
  const natural = Number(roll?.natural);
  return Object.freeze({
    attackerUuid: attackerUuid ?? null,
    targetActorUuid: targetActorUuid ?? null,
    targetTokenUuid: targetTokenUuid ?? null,
    attackerTokenUuid: attackerTokenUuid ?? null,
    sl: Math.trunc(Number(sl)) || 0,
    messageId: messageId ?? null,
    roll: Object.freeze({ total: Number.isFinite(total) ? total : null, natural: Number.isFinite(natural) ? natural : null }),
    itemId: itemId ?? null,
    rollIndex: Math.max(1, Math.trunc(Number(rollIndex)) || 1),
    rolls: Math.max(1, Math.trunc(Number(rolls)) || 1),
    targetIndex: Math.max(0, Math.trunc(Number(targetIndex)) || 0)
  });
}

/**
 * Subscribe to the hook (a convenience over `Hooks.on`). Returns the unsubscribe.
 *
 * @param {(payload: object) => void} fn
 * @returns {() => void}
 */
export function onClawHit(fn) {
  const hooks = globalThis.Hooks;
  if (typeof fn !== "function" || !hooks) return () => {};
  const id = hooks.on(CLAW_HIT_HOOK, fn);
  return () => hooks.off(CLAW_HIT_HOOK, id);
}

/**
 * Fire the hook once for each target the roll hit (the door's one call). `call` is
 * `Hooks.callAll`, injected so a Vitest can read what was fired.
 *
 * @param {object[]} payloads  `clawHitPayload`'s, one per target hit
 * @param {(hook: string, payload: object) => unknown} [call]
 * @returns {number} how many were fired
 */
export function fireClawHits(payloads = [], call = (hook, payload) => globalThis.Hooks?.callAll?.(hook, payload)) {
  let n = 0;
  for (const payload of payloads ?? []) {
    if (!payload) continue;
    call(CLAW_HIT_HOOK, payload);
    n += 1;
  }
  return n;
}
