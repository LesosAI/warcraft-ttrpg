/**
 * WHO THE ROLLER IS ENGAGED WITH (06 §5): *You are Engaged with any enemy within
 * your reach*, and *ranged attacks and Casting Tests made while Engaged suffer a
 * Bane*. The law is pure - `rules/distance.mjs#countsAsEnemy`, `#threatReach`,
 * `#isEngaged` - and this reads the canvas for it.
 *
 * **One definition of an enemy, one reading of reach** (D-732's review). The
 * attack door, every casting door and a creature's casting ability ask here, and
 * the Opportunity Attack reads the same reach. Before, a Priest healing beside a
 * dead gnoll took the Bane, a caster beside a neutral merchant took it, and a
 * player casting beside an ambusher the GM had hidden had the Bane printed on
 * the card - which named the ambush.
 */

import { countsAsAlly, countsAsEnemy, isEngaged, threatReach } from "../rules/distance.mjs";
import { feetBetweenFootprints, footprintOf } from "./footprints.mjs";

/**
 * The reach an actor threatens with (06 §5): five feet, or ten with a **Reach**
 * weapon. **The Opportunity Attack and Engaged both read this** (D-732's review);
 * the Engaged check used to read equipped weapons alone, so a creature whose
 * block writes `Reach` threatened ten feet when somebody left and cast beside a
 * character ten feet off with no Bane.
 *
 * A character reads what it fights with, through **`AzerothActor#readyWeapons`,
 * the one accessor** (D-769, the review): in a shape the block's own rows,
 * whose traits carry the form's reach, and never a melded halberd. A creature
 * reads the traits on its own attack rows, which is where 14 writes `Reach` -
 * **and what a GM put in its hands as well** (the lead's N2, 2026-09-10): a
 * Kobold handed a halberd threatens ten feet. The longer of the two stands: a
 * thing with a reach weapon in hand does not lose the reach of its own tail.
 *
 * @param {Actor|null} actor
 */
export function reachOfActor(actor) {
  const ready = actor?.type === "character" && typeof actor.readyWeapons === "function"
    ? actor.readyWeapons()
    : (actor?.items ?? []).filter(i => i.type === "weapon" && i.system?.equipped);
  return threatReach({
    weapons: ready.map(i => i.system),
    rows: actor?.type === "npc" ? (actor.system?.attacks ?? []) : []
  });
}

/**
 * What the enemy rule needs to know about one token, as plain data - and
 * `rules/distance.test.mjs` holds every reading here, because a reading that
 * moves makes the pure rule right about the wrong facts:
 *
 * - `side` is the tracker's own `AzerothCombatant#side`, in the roller's fight
 *   only; inside a fight nothing else decides (D-732's second review).
 * - `defeated` is the combatant's `isDefeated`; `health` the actor's
 *   `system.health.value`, and null where the actor keeps none.
 * - `hidden` is the GM's `hidden` on the token, or D-717's Hide carried by
 *   core's `invisible` status on the actor: a player cannot see either.
 *
 * @param {Token} token
 * @param {Combatant|null} combatant  its combatant in the roller's fight, or null
 * @param {Combat|null} fight
 */
export function standingOf(token, combatant, fight) {
  const doc = token?.document ?? token ?? null;
  const actor = token?.actor ?? doc?.actor ?? null;
  const health = actor?.system?.health?.value;
  return {
    disposition: doc?.disposition ?? null,
    fight: combatant && fight ? fight.id : null,
    side: combatant?.side ?? null,
    defeated: combatant?.isDefeated === true,
    health: typeof health === "number" ? health : null,
    // Hidden by the GM, or Hidden by D-717's `invisible`: a player cannot see it.
    hidden: doc?.hidden === true || actor?.statuses?.has?.("invisible") === true
  };
}

/**
 * **WHAT THE ALLY RULE NEEDS TO KNOW ABOUT ONE CREATURE** (D-755):
 * `standingOf`'s reading, plus who it is and whether it belongs to the Party.
 * `rules/distance.mjs#countsAsAlly` is the law and `distance.test.mjs` holds
 * this reading off a stand-in board, as it holds the enemy rule's.
 *
 * - `token` may be absent: an aura's holder need not stand on the scene when
 *   the aura is measured from somebody else (Demonic Pact, from the demon), and
 *   an absent token is simply no disposition.
 * - `uuid` is the actor's own - a linked token's actor IS the world actor - and
 *   it is what `countsAsAlly` never lets reach itself.
 * - `party` is `AzerothActor#isParty` (D-658); `boundToParty` is the bond's
 *   owner being the Party, read off the world actors the way
 *   `AzerothCombatant#side` reads it (D-643), so the two cannot disagree.
 *
 * @param {{token?: Token|TokenDocument|null, actor?: Actor|null,
 *   combatant?: Combatant|null, fight?: Combat|null}} o
 */
export function allyStandingOf({ token = null, actor = null, combatant = null, fight = null } = {}) {
  const who = actor ?? token?.actor ?? token?.document?.actor ?? null;
  const bondOwner = who?.getFlag?.("azeroth-rpg", "bond")?.ownerUuid ?? null;
  const owner = bondOwner ? globalThis.game?.actors?.get?.(String(bondOwner).split(".").pop()) ?? null : null;
  return {
    ...standingOf(token ?? { actor: who }, combatant, fight),
    uuid: who?.uuid ?? null,
    party: who?.isParty === true,
    boundToParty: owner?.isParty === true
  };
}

/**
 * **THIS CREATURE'S COMBATANT IN A FIGHT**, by its token first and by its actor
 * only where no token names one: five unlinked Kobolds are five combatants of
 * one actor. The ONE reading (the final review of D-757): the aura door and the
 * area door each carried a copy, and the tick picked a caster's combatant by
 * actor alone.
 *
 * @param {Combat|null} fight
 * @param {Actor|null} actor
 * @param {Token|TokenDocument|null} [token]
 * @returns {Combatant|null}
 */
export function combatantIn(fight, actor, token = null) {
  if (!fight || !actor) return null;
  try {
    const doc = token?.document ?? token ?? null;
    return (doc ? fight.getCombatantsByToken?.(doc)?.[0] : null) ?? fight.getCombatantsByActor?.(actor)?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * **THE ENEMIES INSIDE ANYBODY'S REACH, AS DISTANCES**, from this actor's token
 * on the viewed scene: every token `countsAsEnemy` says is an enemy of the
 * roller, measured between the nearest spaces in three dimensions (D-732). The
 * roller's own footprint is laid out once.
 *
 * @param {Actor} actor
 * @returns {number[]} feet, one per enemy that could be measured
 */
export function enemyDistances(actor) {
  const board = globalThis.canvas;
  const mine = actor?.getActiveTokens?.(true)[0] ?? null;
  if (!mine || !board?.tokens) return [];
  const grid = mine.document?.parent?.grid ?? board.grid ?? null;
  const fight = actor.activeFight?.() ?? null;
  const combatantOf = token => {
    try {
      return fight?.getCombatantsByToken?.(token.document)?.[0] ?? null;
    } catch {
      return null;
    }
  };
  const roller = standingOf(mine, combatantOf(mine) ?? fight?.getCombatantsByActor?.(actor)?.[0] ?? null, fight);
  const gm = globalThis.game?.user?.isGM === true;
  const own = footprintOf(mine);
  const out = [];
  for (const token of board.tokens.placeables) {
    if (token === mine || !token.actor) continue;
    if (!countsAsEnemy(roller, standingOf(token, combatantOf(token), fight), { gm })) continue;
    // A token that could not be measured is not counted.
    const feet = feetBetweenFootprints(own, footprintOf(token), grid);
    if (feet !== null) out.push(feet);
  }
  return out;
}

/**
 * **THE ENEMIES HOLDING THIS CREATURE WITH ANCHOR** (04's Anchor: *Enemies
 * Engaged with you cannot Disengage*; D-772): every enemy token on the viewed
 * scene that holds the talent and has this creature inside its own reach,
 * measured as `enemyDistances` measures - between the nearest spaces, in three
 * dimensions (D-732). Their names, sorted; none where nothing is placed.
 *
 * @param {Actor} actor  the would-be mover
 * @returns {string[]}
 */
export function anchoredBy(actor) {
  const board = globalThis.canvas;
  const mine = actor?.getActiveTokens?.(true)[0] ?? null;
  if (!mine || !board?.tokens) return [];
  const grid = mine.document?.parent?.grid ?? board.grid ?? null;
  const fight = actor.activeFight?.() ?? null;
  const combatantOf = token => {
    try {
      return fight?.getCombatantsByToken?.(token.document)?.[0] ?? null;
    } catch {
      return null;
    }
  };
  const roller = standingOf(mine, combatantOf(mine) ?? fight?.getCombatantsByActor?.(actor)?.[0] ?? null, fight);
  const gm = globalThis.game?.user?.isGM === true;
  const own = footprintOf(mine);
  const out = new Set();
  for (const token of board.tokens.placeables) {
    if (token === mine || !token.actor) continue;
    if (!((token.actor.talentRanks?.("Anchor") ?? 0) > 0)) continue;
    if (!countsAsEnemy(roller, standingOf(token, combatantOf(token), fight), { gm })) continue;
    const feet = feetBetweenFootprints(own, footprintOf(token), grid);
    if (feet !== null && feet <= reachOfActor(token.actor)) out.add(token.name ?? token.actor.name);
  }
  return [...out].sort();
}

/**
 * **WHETHER THIS ACTOR IS ENGAGED NOW**: an enemy inside its own reach.
 *
 * Every door that makes a ranged attack or a Casting Test asks it - the attack
 * door, `castWithDialog` (and through it a creature's Spells line),
 * `castItemSpell`, a casting feature's door, and a creature's casting ability in
 * `workflows.useAbility`; `rules/distance.test.mjs` finds every casting roll in
 * `module/` and fails on one that does not. Nothing on the scene is nothing
 * measured, and the dialog then offers the line as the table's call.
 *
 * @param {Actor} actor
 */
export function engagedNow(actor) {
  return isEngaged(enemyDistances(actor), reachOfActor(actor));
}

/**
 * **THE CREATURES WITHIN SO MANY FEET OF A TOKEN, THAT STAND IN A RELATION TO AN
 * ACTOR** (D-774): every token on the viewed scene `rules/distance.mjs#countsAsAlly`
 * (or `#countsAsEnemy`) says is the actor's ally (or enemy), measured between the
 * nearest squares from the given token (D-732) - the actor's own for Hymn of
 * Hope's *every friendly target within 30 feet*, the healed creature's for
 * Cloudburst's *within 20 feet of its target*, the fallen creature's for Shadowy
 * Apparition's *every other enemy within 20 feet*. The actor counts as its own
 * ally (the lead's D-755 reading of *friendly*); `except` names the tokens to
 * leave out. Sorted by name, so a card a person reads never wobbles.
 *
 * @param {Actor} actor  whose allies or enemies
 * @param {number} feet
 * @param {{from?: Token|null, who?: "ally"|"enemy", except?: string[]}} [o]  `except` token ids
 * @returns {Array<{token: Token, actor: Actor, feet: number}>}
 */
export function creaturesWithin(actor, feet, { from = null, who = "ally", except = [] } = {}) {
  const board = globalThis.canvas;
  const origin = from ?? actor?.getActiveTokens?.(true)?.[0] ?? null;
  if (!origin || !board?.tokens || !(Number(feet) >= 0)) return [];
  const grid = origin.document?.parent?.grid ?? board.grid ?? null;
  const fight = actor?.activeFight?.() ?? null;
  const combatantOf = token => {
    try {
      return fight?.getCombatantsByToken?.(token.document)?.[0] ?? null;
    } catch {
      return null;
    }
  };
  const mine = actor?.getActiveTokens?.(true)?.[0] ?? null;
  const gm = globalThis.game?.user?.isGM === true;
  const self = allyStandingOf({ token: mine, actor, combatant: mine ? combatantOf(mine) : (fight?.getCombatantsByActor?.(actor)?.[0] ?? null), fight });
  const roller = standingOf(mine ?? { actor }, mine ? combatantOf(mine) : null, fight);
  const at = footprintOf(origin);
  const out = [];
  for (const token of board.tokens.placeables) {
    if (!token.actor || (except ?? []).includes(token.id)) continue;
    const theirs = combatantOf(token);
    const counts = who === "enemy"
      ? countsAsEnemy(roller, standingOf(token, theirs, fight), { gm })
      : countsAsAlly(self, allyStandingOf({ token, combatant: theirs, fight }));
    if (!counts) continue;
    const d = token === origin ? 0 : feetBetweenFootprints(at, footprintOf(token), grid);
    if (d === null || d > Number(feet)) continue;
    out.push({ token, actor: token.actor, feet: d });
  }
  return out.sort((a, b) => String(a.token.name ?? "").localeCompare(String(b.token.name ?? "")) || String(a.token.id).localeCompare(String(b.token.id)));
}

/**
 * Feet between two tokens on one scene, between the nearest squares (D-732), or
 * null where either is missing or they stand on different scenes.
 *
 * @param {Token|null} a
 * @param {Token|null} b
 */
export function feetBetweenTokens(a, b) {
  if (!a || !b) return null;
  if (a === b) return 0;
  if (a.document?.parent?.id !== b.document?.parent?.id) return null;
  return feetBetweenFootprints(footprintOf(a), footprintOf(b), a.document?.parent?.grid ?? globalThis.canvas?.grid ?? null);
}

/**
 * **WHETHER ONE CREATURE COUNTS AS ANOTHER'S ALLY, NOW** (D-777): the ONE ally
 * rule (`rules/distance.mjs#countsAsAlly`, D-755) over the standings
 * `creaturesWithin` builds, for a door that holds both actors and measures no
 * distance - 04's Living Seed's *a friendly target* at the healing door. The
 * holder is their own ally; in the owner's fight the tracker's side decides, and
 * outside one the Party.
 *
 * @param {Actor|null} owner
 * @param {Actor|null} other
 * @returns {boolean}
 */
export function allyOf(owner, other) {
  if (!owner || !other) return false;
  const fight = owner.activeFight?.() ?? null;
  const tokenOf = a => a?.getActiveTokens?.(true)?.[0] ?? null;
  const mine = tokenOf(owner);
  const theirs = tokenOf(other);
  return countsAsAlly(
    allyStandingOf({ token: mine, actor: owner, combatant: combatantIn(fight, owner, mine), fight }),
    allyStandingOf({ token: theirs, actor: other, combatant: combatantIn(fight, other, theirs), fight })
  );
}
