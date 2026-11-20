/**
 * **WHETHER A SOVEREIGN DOOR CAN REACH THIS MOMENT, ASKED BEFORE ITS MODULE IS LOADED** (O-419; the plan's
 * B.12 finding 5 and B.13 Q27, *"Yes"*; the architect's review's S4). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The Sovereign's doors sit on the hottest paths in the system - every turn's start, every blow, every hold,
 * every cast, every Resist and every Apply - for every actor in every world, and each `await import()`d a
 * 1,300- or 1,640-line module before asking whether anything there applied. The turn END was already done
 * this way (`sovereign-talents.mjs#sovereignTurnDue`); each predicate here is the same shape: the one fact
 * without which the door does nothing, read off plain data the caller already holds, so the import happens
 * only where it can matter. **A predicate may answer true where the door then finds nothing; it may never
 * answer false where the door would act.**
 */

import { BLOOD_CURSE_FLAG, BURDEN_FLAG, COMMAND_FLAG, HEMOPLAGUE_FLAG, MAJESTY_FLAG, UNFADING_FLAG, readMirror, sovereignCaster } from "./sovereign-spells.mjs";
import { PREY_FLAG } from "./prey.mjs";

const SCOPE = "azeroth-rpg";

/** Bleed for Me's carrier on the bleeding creature (`effects/sovereign-spells.mjs#BLEED_FOR_ME_FLAG`, the same word). */
export const BLEED_FOR_ME_KEY = "bleedForMe";
/** Overawe's carrier on the cursed creature (`effects/sovereign-spells.mjs#OVERAWE_FLAG`, the same word). */
export const OVERAWE_KEY = "overawe";

const list = c => [...(c?.values?.() ?? c ?? [])];
/** An active effect's flag under `key`, or null. */
const flagOf = (e, key) => (e && e.active !== false && e.disabled !== true ? e.flags?.[SCOPE]?.[key] ?? null : null);

/** Whether any active effect carries the flag. */
export const carriesFlag = (effects, key) => list(effects).some(e => Boolean(flagOf(e, key)));

/**
 * **THE TURN'S START** (`AzerothCombat#_onStartTurn`'s `advanceSovereignSpells`): Overawe on the creature
 * whose turn it is, or a creature in the fight bleeding from this caster's Bleed for Me.
 *
 * @param {{uuid: string, own?: Iterable<object>, others?: Iterable<object>[]}} o  `others` each combatant's effects
 */
export function sovereignTurnStartDue({ uuid = null, own = [], others = [] } = {}) {
  if (carriesFlag(own, OVERAWE_KEY)) return true;
  // 07 §17's Hemoplague spreads at the start of the cursed creature's turns (D-1377).
  if (carriesFlag(own, HEMOPLAGUE_FLAG)) return true;
  return (others ?? []).some(effects => list(effects).some(e => flagOf(e, BLEED_FOR_ME_KEY)?.by === uuid));
}

/** The prey marks every Sovereign holds, off the world's actors (`flags.azeroth-rpg.prey`). */
export function preyMarksOf(actors = []) {
  return list(actors).map(a => a?.flags?.[SCOPE]?.[PREY_FLAG] ?? null).filter(m => m && typeof m === "object");
}

/** Whether a creature is named in any Sovereign's prey mark. */
export function namedAsPrey({ uuid = null, tokenUuid = null, marks = [] } = {}) {
  return (marks ?? []).some(m => (uuid && m.actorUuid === uuid) || (tokenUuid && m.tokenUuid === tokenUuid));
}

/**
 * **A WEAPON BLOW'S CUT** (`sovereignBlowCut`: 02 §7's Withering Contempt, 04's Unworthy Hand): the attacker
 * is some Sovereign's prey, or under a blood curse.
 */
export function blowCutCanReach({ byEffects = [], byUuid = null, byTokenUuid = null, marks = [] } = {}) {
  return carriesFlag(byEffects, BLOOD_CURSE_FLAG) || namedAsPrey({ uuid: byUuid, tokenUuid: byTokenUuid, marks });
}

/** **BURDEN OF SIN ON A BLOW** (`burdenOnBlow`; D-1365): the attacker carries a burden. */
export const burdenCanReach = byEffects => carriesFlag(byEffects, BURDEN_FLAG);

/** **MAJESTY UNBOUND ON A BLOW** (`majestyOnBlow`): the dealer stands under the spell. */
export const majestyCanReach = byEffects => carriesFlag(byEffects, MAJESTY_FLAG);

/** **MIRROR OF SELF IN THE BLOW** (`mirrorInBlow`): the creature struck knows a Mirror of Self. */
export const mirrorCanReach = items => list(items).some(i => i?.type === "spell" && Boolean(readMirror(i.system?.effect ?? "")));

/** **HARM ENDS A COMMAND** (`endOnHarm`): the creature struck carries a command or audience that harm ends. */
export const harmEndsCanReach = effects => list(effects).some(e => flagOf(e, COMMAND_FLAG)?.harmEnds === true);

/** **UNFADING GLORY'S HOLD** (`unfadingHold`): the creature stands under the spell. */
export const unfadingCanReach = effects => carriesFlag(effects, UNFADING_FLAG);

/** **A SOVEREIGN SPELL** (`judgeSovereignSpell`, `sovereignCardRows`): the spell's classes and the caster's, as its door reads them. */
export const sovereignSpellCast = (sys = {}, classNames = []) => sovereignCaster(sys?.classes ?? [], classNames ?? []);

/** **A SOVEREIGN SPELL'S CARD** (`sovereignSpellAfterResist`, `sovereignSpellAfterApply`): the card carries the plan. */
export const sovereignCardFlags = flags => Boolean(flags?.sovereignSpell);

/**
 * **A RESIST THE SOVEREIGN'S CORE READS** (`feedingAfterTest`, `tributeAfterResist`): a feeding's Test, or a
 * creature some Sovereign holds as its prey.
 */
export function resistCanReachCore({ purpose = null, uuid = null, tokenUuid = null, marks = [] } = {}) {
  return purpose === "feeding" || namedAsPrey({ uuid, tokenUuid, marks });
}
