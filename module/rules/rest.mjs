/**
 * Rests, from 05 §16 and 05 §12's recovery column. Pure: a snapshot in, an
 * update out, no Foundry.
 *
 * The sheet's handlers used to do this arithmetic themselves and got two
 * things wrong at once: a Long Rest restored FULL Health, where 05 §16 says
 * *"You do not wake at full Health"*, and both rests wrote `system.power.value`
 * - the legacy single-pool mirror that `prepareDerivedData` overwrites from
 * `classes[]` on the next preparation, so the rest never reached the pool the
 * sheet draws.
 *
 * What each rest recovers (05 §16, 05 §12, 02 §6):
 *
 *   Short Rest   Health: Constitution modifier + tier, AND ONLY IF FOOD WAS
 *                EATEN (05 §16, D-733); twice a day, counted by the table and
 *                not here. Mana: half the pool, AND ONLY IF DRINK WAS DRUNK.
 *                Focus: full either way (05 §12: "Short Rest, and by holding
 *                position"). Energy and Momentum: untouched - Energy refills
 *                per turn and Momentum dies with the fight.
 *   Long Rest    Health: a quarter of the maximum, rounded up, plus the
 *                Constitution modifier. Mana and Focus: full. Fatigue: minus
 *                one. Resolve refreshes but is derived, so nothing is stored.
 *                Spirit's Tether: NEVER on a rest (D2 §2.2).
 *
 * **SAND EMPTIES WHEN EITHER REST FINISHES** (D-848; the lead: *"It should only
 * drain on a short or long rest"*). It is a Momentum pool and the one that
 * outlives a fight, so both rests write it to 0 whatever was eaten, and the card
 * says how much went (`{kind: "sandEmptied", amount}`).
 *
 * **RUNIC POWER EMPTIES WHEN A LONG REST FINISHES, AND ONLY THEN** (D-943; the lead:
 * **"Only on a Long Rest"**). Both pools are the one pool-keyed rule
 * (`kept-pools.mjs#emptiedAtRest`), and the card says how much went
 * (`{kind: "runicPowerEmptied", amount}`). The runes it is spent from refill at the
 * same Long Rest, at the actor's door (`documents/runes.mjs#refillRunesOn`).
 *
 * **A CHARACTER WHO DOES NOT EAT OR DRINK RECOVERS ON A SHORT REST WITHOUT EITHER**
 * (the lead, on the Death Knight, the Forsaken and the Risen: *"They do recover health
 * but do not have to eat or drink."*; D-946): `needsNoFood`, read off the class, the
 * race and 10 §9's ending by `undead.mjs#needsNoFood`.
 */

import { AZEROTH } from "../config.mjs";
import { emptiedAtRest } from "./kept-pools.mjs";

/** The card line each kept pool's emptying prints (D-848, D-943). */
const EMPTIED_LINE = Object.freeze({ sand: "sandEmptied", runicPower: "runicPowerEmptied", hatred: "hatredEmptied" });

/**
 * The kept pools a rest empties, and their card lines, off a snapshot. The pool
 * alone (the stage 1 review): another Momentum pool on the same class item is never
 * counted as emptied.
 */
function keptAtRest(pools, event) {
  const { updates, emptied } = emptiedAtRest(pools, event);
  const gains = Object.entries(emptied)
    .filter(([, amount]) => amount > 0)
    .map(([name, amount]) => ({ kind: EMPTIED_LINE[name], amount }));
  return { updates, gains };
}

/**
 * **THE POWER POOLS NO REST REFILLS** (the lead, R9: *"Feeding only"*; the plan's V3): the Sovereign's
 * Vitae comes back by feeding alone (`rules/feeding.mjs`), so both rests leave it and say so.
 */
export const REST_NEVER_REFILLS = Object.freeze(["vitae"]);

/** @typedef {{itemId: string, kind: "power"|"momentum", name: string, value: number, max: number}} PoolSnapshot */

/**
 * The pool updates a rest makes, and what each gained, in one pass.
 * @returns {{updates: object[], gains: object[]}}
 */
function poolRecovery(pools, valueFor) {
  const updates = [];
  const gains = [];
  for (const p of pools) {
    if (p.kind !== "power") continue;
    // **NO REST REFILLS VITAE** (the lead, R9: *"Feeding only"*; the San'layn and Sovereign plan's
    // V3): the pool is skipped whatever `valueFor` would give it, and the card says so in words.
    if (REST_NEVER_REFILLS.includes(p.name)) {
      gains.push({ kind: "noRefill", name: p.name });
      continue;
    }
    const value = valueFor(p);
    if (value === null || value === undefined) continue;
    updates.push({ itemId: p.itemId, kind: p.kind, value });
    if (value > p.value) gains.push({ kind: "pool", name: p.name, itemId: p.itemId, amount: value - p.value });
  }
  return { updates, gains };
}

/**
 * A Short Rest, and what it is given to eat and drink (05 §16, 08 §12; D-733).
 *
 * **THE DEFAULTS WITHHOLD.** The lead, 2026-09-19: *rest alone never restores
 * Health or Mana; only consuming food or drink does.* So `eats` and `drinks`
 * are false unless the caller says otherwise, and a door that forgets the
 * picks restores nothing rather than everything - the failure that costs
 * nothing rather than the one that gives the rule away. **Focus fills either
 * way** (05 §12: it comes back on a Short Rest and by holding position, and
 * nothing there mentions a drink).
 *
 * The NPC door passes both explicitly: a creature carries no rations and 14
 * states no such condition, so its exemption is written where it rests rather
 * than assumed here.
 *
 * @param {object} s
 * @param {{value: number, max: number}} s.health
 * @param {number} s.conMod
 * @param {number} s.tier
 * @param {number} [s.fatigue]
 * @param {PoolSnapshot[]} [s.pools]
 * @param {boolean} [s.eats]   food was spent on this rest
 * @param {boolean} [s.drinks] drink was spent on this rest
 * @param {boolean} [s.tierAgain] the food was a hot meal or a feast (08 §12)
 * @param {boolean} [s.needsNoFood] the character does not eat or drink (D-946): Health
 *   and Mana come back with neither, and no flag says either was missing
 * @param {{itemId?: string|null, amount?: number}} [s.manaExtra] Mana a talent
 *   returns beyond 05's half, WITH a drink and only with one (04's Light's
 *   Reserve: *A Short Rest with a drink returns 3 more Mana per rank*; D-772),
 *   into the ONE pool `itemId` names - the talent's own class's, where a
 *   character holds two (02 §10: *each class keeps its own Power pool*) - or the
 *   first Mana pool where it names none; capped with the rest by the maximum
 * @returns {{health: number, fatigue: number, pools: object[], gains: object[]}}
 *   `gains` lists what came back - `{kind: "health", amount}`, `{kind:
 *   "pool", name, itemId, amount}` - for the card (D-623), and what did not:
 *   `{kind: "noFood"}` and `{kind: "noDrink"}` are printed as flags so an
 *   empty rest says WHY rather than looking broken. A hot meal adds
 *   `{kind: "tierAgain", amount}` beside the Health.
 */
export function shortRest({
  health, conMod = 0, tier = 1, fatigue = 0, pools = [],
  eats = false, drinks = false, tierAgain = false, manaExtra = null, needsNoFood = false, needsNoDrink = null,
  bloodFed = false, blood = false
} = {}) {
  // **A SAN'LAYN RESTS ON BLOOD** (02 §5, *Your hunger.*: *You need blood in place of food and
  // drink: a Short Rest takes 1 unit of blood ... Food and drink restore nothing on your rests*;
  // D-1141). The unit stands for both halves and nothing else does: food and drink handed in
  // are ignored, and the class exemptions below do not lift it (D-1142). `blood` still
  // WITHHOLDS by default, as `eats` and `drinks` do.
  const fed = bloodFed === true;
  if (fed) {
    eats = blood === true;
    drinks = blood === true;
    tierAgain = false;
  }
  // **NOTHING TO EAT, AND NOTHING NEEDED** (D-946): the rest recovers as though both
  // were taken. MY READING, for the lead: *"do not have to eat or drink"* lifts the drink
  // a Forsaken caster's Mana waits on too. The defaults still withhold: only a caller
  // that says so passes it.
  const exempt = !fed && needsNoFood === true;
  // **THE DRINK IS LIFTED SEPARATELY** (the F1 review's note): Undeath's rung at 5 lifts the
  // food alone, so a caller that says `needsNoDrink: false` still waits on a drink for Mana.
  // Left null, it follows `needsNoFood`, as before.
  const noDrink = fed ? false : (needsNoDrink === null || needsNoDrink === undefined ? exempt : needsNoDrink === true);
  if (exempt) eats = true;
  if (noDrink) drinks = true;
  const extraAmount = drinks ? Math.max(0, Math.trunc(Number(manaExtra?.amount)) || 0) : 0;
  const manaPools = pools.filter(p => p.kind === "power" && p.name === "mana");
  const extraInto = extraAmount > 0
    ? (manaPools.find(p => manaExtra?.itemId && p.itemId === manaExtra.itemId) ?? manaPools[0] ?? null)
    : null;
  const extra = p => (extraInto && p === extraInto ? extraAmount : 0);
  // 08 §12: *Health equal to your tier again* on the rest a hot meal feeds -
  // added to the rest's own recovery, and only where there was a rest to feed.
  const plain = eats ? Math.max(0, conMod + tier) : 0;
  const bonus = eats && tierAgain ? Math.max(0, tier) : 0;
  const before = health.value ?? 0;
  // THE TWO LINES ADD UP TO WHAT MOVED. The rest's own recovery lands first
  // and the hot meal's tier on top of it, each capped by the maximum, so the
  // card never prints a point of Health the cap swallowed and never counts
  // the tier twice (once inside *Health* and once beside it).
  const fedTo = Math.min(health.max, before + plain);
  const after = Math.min(health.max, fedTo + bonus);
  // Only a character who HOLDS Mana is told the drink was missing: a
  // Warrior's card says nothing about a pool the Warrior does not have.
  const holdsMana = pools.some(p => p.kind === "power" && p.name === "mana");
  const { updates, gains } = poolRecovery(pools, p => {
    if (p.name === "mana") return drinks ? Math.min(p.max, p.value + Math.floor(p.max / 2) + extra(p)) : null;
    if (p.name === "focus") return p.max;
    return null;
  });
  const kept = keptAtRest(pools, "shortRest");
  return {
    health: after,
    fatigue,
    pools: [...updates, ...kept.updates],
    gains: [
      ...(fedTo > before ? [{ kind: "health", amount: fedTo - before }] : []),
      ...(after > fedTo ? [{ kind: "tierAgain", amount: after - fedTo }] : []),
      ...gains,
      ...kept.gains,
      // A blood-fed rest says *No blood* once, never *No food* and *No drink* (D-1141).
      ...(fed ? (blood === true ? [] : [{ kind: "noBlood" }]) : [
        ...(eats ? [] : [{ kind: "noFood" }]),
        ...(!drinks && holdsMana ? [{ kind: "noDrink" }] : [])
      ]),
      ...(exempt ? [{ kind: "needsNoFood" }] : [])
    ]
  };
}

/**
 * **THE FLAG A SAN'LAYN'S FEEDINGS SINCE ITS LAST REST ARE COUNTED ON** (the plan's B.11 F4 and
 * C-14, *One feeding serves both halves*; D-1143). An integer on the character's own actor:
 * Open Vein's living failure adds 1, and so does every feeding of the Sovereign's (The Blood
 * Royal and its kin, the class's door). The next rest counts it before it asks for a vial, and a
 * rest it satisfies clears it. `AzerothActor#bloodSinceRest` reads it and
 * `AzerothActor#addBloodSinceRest` is the one writer.
 */
export const BLOOD_SINCE_REST_FLAG = "bloodSinceRest";

/** The count a flag holds, clean: a non-negative integer, 0 for anything else. */
export function bloodSinceRestOf(value) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The Long Rest's default unit count, the `bloodLongRest` setting's initial (A.6 item 8; PROPOSAL 2). */
export const BLOOD_LONG_REST_DEFAULT = 2;

/**
 * **WHERE A REST'S BLOOD COMES FROM, AND WHETHER IT IS MET** (02 §5, *Your hunger.*; R3: *"1 unit
 * for short rest and an amount up to the GM for long rest"*; D-1141, D-1143, D-1144). The one
 * judgement, made before anything is spent.
 *
 * Units are counted in this order: the feedings since the last rest (`sinceRest`), then blood
 * drunk fresh from a living source the GM approved (`fresh`, the rest window's line), then the
 * Blood vials picked (`vials`). **ALL OR NOTHING** (A.9 Q15, the plan's recommendation): a rest
 * whose blood falls short takes none of what was offered - no vial is spent and the count stays
 * for a later rest - and the rest is withheld. A rest that is met spends only the vials it still
 * needs after the count and the fresh units, and clears the count.
 *
 * @param {{needed?: number, sinceRest?: number, fresh?: number|boolean, vials?: number}} o
 * @returns {{needed: number, fromSince: number, fromFresh: number, fromVials: number, met: boolean,
 *   clearSince: boolean}}
 */
export function bloodRestPlan({ needed = 1, sinceRest = 0, fresh = 0, vials = 0 } = {}) {
  const want = Math.max(0, Math.trunc(Number(needed)) || 0);
  const since = bloodSinceRestOf(sinceRest);
  const freshUnits = fresh === true ? 1 : Math.max(0, Math.trunc(Number(fresh)) || 0);
  const carried = Math.max(0, Math.trunc(Number(vials)) || 0);
  if (want === 0) return { needed: 0, fromSince: 0, fromFresh: 0, fromVials: 0, met: true, clearSince: false };
  const fromSince = Math.min(want, since);
  const fromFresh = Math.min(want - fromSince, freshUnits);
  const fromVials = Math.min(want - fromSince - fromFresh, carried);
  const met = fromSince + fromFresh + fromVials >= want;
  if (!met) return { needed: want, fromSince: 0, fromFresh: 0, fromVials: 0, met: false, clearSince: false };
  return { needed: want, fromSince, fromFresh, fromVials, met: true, clearSince: since > 0 };
}

/**
 * **WHICH VIALS A REST DRINKS** (D-1144): `units` drawn from the stacks picked, in the order
 * picked, one unit a vial (*Each Blood vial spent is 1 unit*). A stack of three gives three.
 *
 * @param {Array<{itemId: string, quantity?: number}>} stacks
 * @param {number} units
 * @returns {Array<{itemId: string, take: number, left: number}>}  `left` the quantity after
 */
export function vialDraws(stacks = [], units = 0) {
  let owed = Math.max(0, Math.trunc(Number(units)) || 0);
  const out = [];
  for (const s of stacks ?? []) {
    if (owed <= 0) break;
    const have = Math.max(0, Math.trunc(Number(s?.quantity ?? 1)) || 0);
    const take = Math.min(have, owed);
    if (take <= 0) continue;
    out.push({ itemId: s.itemId, take, left: have - take });
    owed -= take;
  }
  return out;
}

/** How many units the stacks picked hold together. */
export function vialUnits(stacks = []) {
  return (stacks ?? []).reduce((n, s) => n + Math.max(0, Math.trunc(Number(s?.quantity ?? 1)) || 0), 0);
}

/**
 * How many units a rest asks a blood-fed character for: 1 on a Short Rest, the GM's setting on a
 * Long Rest (A.6 item 8: 0 means no blood is needed).
 *
 * @param {"short"|"long"} kind
 * @param {number} [setting]  the `bloodLongRest` world setting
 */
export function bloodNeeded(kind, setting = BLOOD_LONG_REST_DEFAULT) {
  if (kind !== "long") return 1;
  const n = Math.trunc(Number(setting));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {Parameters<typeof shortRest>[0]} s
 * Diseased (A1): "You regain no Health from a Long Rest and it removes no
 * Fatigue." The pools still fill; the card carries `{kind: "diseased"}`.
 */
export function longRest({ health, conMod = 0, tier = 1, fatigue = 0, pools = [], diseased = false, withheld = false } = {}) {
  // **A SAN'LAYN'S LONG REST WITHOUT ITS BLOOD** (02 §5: *A rest without the blood it needs
  // restores no Health and no Power, and a Long Rest without it removes no Fatigue*; D-1144):
  // `withheld`. It is never refused - every other reset (uses, runes, kept pools, effects
  // ending) still runs at the door - and the card says *No blood*.
  const starved = withheld === true;
  const gain = Math.max(0, Math.ceil(health.max / 4) + conMod);
  const before = health.value ?? 0;
  const after = diseased || starved ? before : Math.min(health.max, before + gain);
  const rested = diseased || starved ? fatigue : Math.max(0, fatigue - 1);
  const { updates, gains } = poolRecovery(pools, p => (!starved && (p.name === "mana" || p.name === "focus") ? p.max : null));
  const kept = keptAtRest(pools, "longRest");
  return {
    health: after,
    fatigue: rested,
    pools: [...updates, ...kept.updates],
    gains: [
      ...(after > before ? [{ kind: "health", amount: after - before }] : []),
      ...gains,
      ...kept.gains,
      ...(rested < fatigue ? [{ kind: "fatigue", amount: rested - fatigue }] : []),
      ...(diseased ? [{ kind: "diseased" }] : []),
      ...(starved ? [{ kind: "noBlood" }] : [])
    ]
  };
}

/**
 * What a combatant's Power pools gain at the start of their turn (05 §12:
 * Energy "refills 3 a turn", Focus "refills 2 a turn"). Mana refills on no
 * turn. Momentum is not a Power pool and is built, not refilled.
 */
export const REFILL_PER_TURN = AZEROTH.POWER_REFILL_PER_TURN;

/**
 * **02's FOCUS REFILLS ONLY AFTER A STILL TURN** (the Legacy branches' door 9):
 * *Focus is a pool of 6, and you begin every fight full. It refills at 2 at the
 * start of any turn in which you have neither moved nor been Engaged.* The turn
 * `_onStartTurn` refilled Focus on every turn, which 02 never said. The plan's
 * reading (its door 9: *moved or Engaged last turn*): *a turn in which you have
 * neither moved nor been Engaged* is the creature's LAST turn - it has done nothing
 * in the one just starting. MY READING beside it, for the lead: *been Engaged* is
 * Engaged when that turn ended or as this one starts (an enemy that walked up
 * between the two Engaged it). Energy refills as before.
 */
export const FOCUS_POOL = "focus";

/** The round's-record mark a cast that counts as moving leaves (04's Shadowcraft's Shadow Walk; door 9). */
export const MOVED_MARK = "moved";

/**
 * Whether Focus refills at the start of this turn.
 *
 * @param {{moved?: boolean, engaged?: boolean}} o  the last turn's move, and Engaged
 *   at its end or now
 */
export function focusRefills({ moved = false, engaged = false } = {}) {
  return moved !== true && engaged !== true;
}

/**
 * **WHETHER A TURN MOVED, FOR THE RECORD ITS END WRITES** (door 9): a Move the turn
 * paid for (`moveHalves`, the measure 04's Bracing reads), or a cast a talent counts
 * as moving (Shadowcraft's Shadow Walk; the lead: *"Yes"*), marked on the round's
 * record (`MOVED_MARK`).
 *
 * @param {{paid?: number, roundOnce?: string[]}} o  `paid` the Moves the turn paid
 *   for (the combatant's `moveHalves`, read and handed in under another name: the
 *   budget's census reads every place that names the flag)
 */
export function turnMoved({ paid = 0, roundOnce = [] } = {}) {
  return (Math.trunc(Number(paid)) || 0) > 0 || (roundOnce ?? []).includes(MOVED_MARK);
}

/**
 * @param {PoolSnapshot[]} pools
 * @param {{extra?: Record<string, number>, still?: boolean}} [o]  what a talent adds to a pool's
 *   refill (04's Adrenaline: *Your Energy pool returns 1 more per rank at the
 *   start of your turn*; D-773), by pool name, on a pool that refills at all;
 *   and `still` - `focusRefills`' answer - without which Focus refills nothing
 *   (door 9). **It defaults CLOSED** (the lead's rule for a gate: a default that
 *   grants is a leak by construction): a caller that does not say the turn was
 *   still refills no Focus. Energy is not gated.
 */
export function turnRefill(pools = [], { extra = {}, still = false } = {}) {
  return pools.flatMap(p => {
    if (p.kind !== "power") return [];
    if (p.name === FOCUS_POOL && still !== true) return [];
    const rate = REFILL_PER_TURN[p.name];
    const more = Math.max(0, Math.trunc(Number(extra?.[p.name])) || 0);
    if (!rate || p.value >= p.max) return [];
    return [{ itemId: p.itemId, kind: p.kind, value: Math.min(p.max, p.value + rate + more) }];
  });
}

/**
 * Burn a Spirit's Tether (05 §14, 06 §9): stand at 1 Health, no Test. Death
 * Steps clear with it once they exist. Returns null when there is nothing to
 * burn, which the caller reports rather than silently doing nothing.
 */
export function burnTether({ tether, health }) {
  if (!tether || (tether.value ?? 0) < 1) return null;
  return { tether: tether.value - 1, health: Math.max(1, Math.min(health.max, 1)) };
}
