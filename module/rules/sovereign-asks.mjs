/**
 * **WHAT A SOVEREIGN QUERY MAY ASK OF ANOTHER CLIENT** (the fix pass's B1; D-982: *the GM's handler judges
 * again and clamps every amount to the card's row, never the payload*). Pure: no Foundry imports
 * (CLAUDE.md §3).
 *
 * The three Sovereign query handlers (`effects/sovereign-core.mjs`, `effects/sovereign-features.mjs`,
 * `effects/sovereign-spells.mjs`) gather the facts off the world as it stands on the answering client and
 * ask these judgements. A judgement answers `{ok: true, ...}` or `{ok: false, reason}`, and the handler
 * refuses in words. Nothing here trusts a number, an effect, a flag or a "this failed" that the payload
 * carries: the amount is worked out again from the dealer's own row, an effect is accepted only where its
 * own flags name an actor the asker owns, and a feeding or a control lands only off a card whose recorded
 * result failed.
 */

import { afterCurseEnded, bloodPrisonDamage, latchTick, royalDueAmount } from "./sovereign-talents.mjs";
import { FEEDING_MODES } from "./feeding.mjs";

const int = v => Math.trunc(Number(v)) || 0;
const whole = v => Math.max(0, int(v));
const tierOf = t => Math.min(4, Math.max(1, int(t) || 1));
const SCOPE = "azeroth-rpg";
const yes = (extra = {}) => ({ ok: true, ...extra });
const no = reason => ({ ok: false, reason });

/**
 * **WHETHER THE ASKING USER MAY ASK AT ALL**: a GM, or a user who owns one of the actors the act names.
 *
 * @param {{gm?: boolean, owns?: boolean[]}} o
 */
export function askerMay({ gm = false, owns = [] } = {}) {
  return gm === true || (owns ?? []).some(o => o === true);
}

/* ------------------------------------------------------------------ */
/*  A Shadow strike (strikeShadow's GM act)                             */
/* ------------------------------------------------------------------ */

/** What a Sovereign's own Shadow strike may be asked for, by the door that strikes (`strikeShadow`'s `why`). */
export const STRIKE_SOURCES = Object.freeze(["price", "bloodletting", "prison", "latch", "royalDue", "tasting"]);

/**
 * **THE MOST A STRIKE MAY DEAL, WORKED OUT AGAIN FROM THE DEALER'S OWN ROW** (D-982): the rating each door
 * strikes with, read off the dealer's talents and features as they stand now - never the payload's
 * number. 0 where the door is unknown or the dealer holds nothing that strikes so.
 *
 * - `price` - 04's Price of Defiance (with No Pardon's rank 2);
 * - `bloodletting` - the creature's Bleeding value plus the tier;
 * - `prison` - Blood Prison's 2 a tier (Gilded Cage adds the Charisma modifier);
 * - `latch` - Latch On's tick, the tier (plus half the Charisma modifier at rank 2);
 * - `royalDue` - Royal Due's Charisma modifier, at least 1;
 * - `tasting` - Tasting Bite's tier.
 *
 * @param {{why: string, tier?: number, cha?: number, ranks?: object, holds?: object, bleeding?: number}} o
 * @returns {number}
 */
export function strikeCap({ why = null, tier = 1, cha = 0, ranks = {}, holds = {}, bleeding = 0 } = {}) {
  const r = key => whole(ranks?.[key]);
  switch (why) {
    case "price": return r("price") > 0 ? whole(afterCurseEnded({ price: r("price"), noPardon: r("noPardon"), tier, cha }).damage) : 0;
    case "bloodletting": return r("bloodletting") > 0 && whole(bleeding) > 0 ? whole(bleeding) + tierOf(tier) : 0;
    case "prison": return holds?.prison === true ? whole(bloodPrisonDamage({ tier, cha, gildedCage: r("gildedCage") > 0 })) : 0;
    case "latch": return r("latchOn") > 0 ? whole(latchTick({ tier, cha, rank: r("latchOn") })) : 0;
    case "royalDue": return holds?.royalDue === true ? whole(royalDueAmount(cha)) : 0;
    case "tasting": return r("tasting") > 0 ? tierOf(tier) : 0;
    default: return 0;
  }
}

/* ------------------------------------------------------------------ */
/*  An effect laid or ended on another's creature                       */
/* ------------------------------------------------------------------ */

/** The flags a feature's effect names its Sovereign under, and the key inside each that holds the uuid. */
export const FEATURE_EFFECT_KEYS = Object.freeze({
  bloodCurse: ["source", "by"], latch: ["holder"], courtRepeat: ["by"], obedience: ["by"], bloodPrison: ["by"]
});

/** The flags a spell's effect names its caster under. */
export const SPELL_EFFECT_KEYS = Object.freeze({
  oathOfFealty: ["by"], sovereignCommand: ["by"], bloodCurse: ["source", "by"],
  // The second batch (D-1369): Blood Bond's Charmed, Hemoplague's Bleeding and Burden of Sin's curse name their caster.
  bloodBond: ["by"], hemoplague: ["by"], burdenOfSin: ["by"]
});

/** How long after its feeding a Sanguine Draught's Health may still be asked, in world seconds. */
export const DRAUGHT_WINDOW_SECONDS = 60;

/**
 * **SANGUINE DRAUGHT'S HEALTH, ASKED OF THE GM** (07 §17: *The target loses Health equal to your tier. You feed on it*;
 * D-1369): judged off the world, never the payload - asked by a GM or the caster's owner, the caster's once-a-day
 * record showing the feeding on this creature within the window, the creature still Bleeding, and that feeding's
 * Health not taken already (`taken`, the feeding time the creature's own mark holds).
 *
 * @param {{asker: {gm?: boolean, owns?: boolean}, fedAt?: number|null, now?: number, taken?: number|null, bleeding?: boolean}} o
 */
export function draughtClaim({ asker = {}, fedAt = null, now = 0, taken = null, bleeding = false } = {}) {
  if (!(asker?.gm === true || asker?.owns === true)) return no("notYours");
  const at = Number(fedAt);
  if (fedAt === null || fedAt === undefined || !Number.isFinite(at) || Number(now) - at > DRAUGHT_WINDOW_SECONDS || Number(now) < at) return no("notFed");
  if (taken !== null && taken !== undefined && Number(taken) === at) return no("landed");
  if (bleeding !== true) return no("notBleeding");
  return yes({ fedAt: at });
}

/**
 * **BURDEN OF SIN'S BLOW, ASKED OF THE GM** (07 §17: *each time it damages a creature with an attack, it takes 3
 * Shadow damage*; D-1369): the burden read off the bearer's own effect, never the payload, asked by a GM or the
 * owner of the creature the bearer's attack damaged.
 *
 * @param {{held?: boolean, asker: {gm?: boolean, ownsStruck?: boolean}}} o
 */
export function burdenClaim({ held = false, asker = {} } = {}) {
  if (!(asker?.gm === true || asker?.ownsStruck === true)) return no("notYours");
  if (held !== true) return no("unknownEffect");
  return yes({});
}

/** The `system.changes` keys an effect a Sovereign lays elsewhere may carry: Heavy Tread's drop on a curse. */
export const LAID_CHANGE_KEYS = Object.freeze(["system.speed"]);

/**
 * Every actor an effect's own flags name, under the keys given; the empty list where none.
 *
 * @param {{flags?: object}} data
 * @param {Record<string, string[]>} keys
 * @returns {string[]}
 */
export function namedBy(data, keys = FEATURE_EFFECT_KEYS) {
  const f = data?.flags?.[SCOPE] ?? {};
  const out = [];
  for (const [flag, inner] of Object.entries(keys ?? {})) {
    const row = f[flag];
    if (!row || typeof row !== "object") continue;
    const uuid = (inner ?? []).map(k => row[k]).find(v => typeof v === "string" && v);
    if (uuid) out.push(uuid);
  }
  return out;
}

/**
 * **AN EFFECT ASKED TO BE LAID ON ANOTHER'S CREATURE** (the `lay` and `effect` acts): accepted only where
 * its own flags name ONE actor (every named flag agreeing) - which the handler then checks the asker owns -
 * its changes touch only `LAID_CHANGE_KEYS`, and its statuses are conditions the system knows.
 *
 * @param {{data: object, keys?: Record<string, string[]>, conditions?: string[], changeKeys?: string[]}} o
 * @returns {{ok: true, by: string}|{ok: false, reason: string}}
 */
export function layJudgement({ data = null, keys = FEATURE_EFFECT_KEYS, conditions = [], changeKeys = LAID_CHANGE_KEYS } = {}) {
  if (!data || typeof data !== "object") return no("unknownEffect");
  const names = namedBy(data, keys);
  if (!names.length) return no("unknownEffect");
  if (new Set(names).size !== 1) return no("unknownEffect");
  const changes = data.system?.changes ?? data.changes ?? [];
  if (!Array.isArray(changes) || changes.some(c => !changeKeys.includes(c?.key))) return no("changes");
  const statuses = Array.isArray(data.statuses) ? data.statuses : [];
  if (statuses.some(s => !(conditions ?? []).includes(s))) return no("statuses");
  return yes({ by: names[0] });
}

/**
 * **AN EFFECT ASKED TO BE DELETED FROM ANOTHER'S CREATURE** (the `drop` and `endEffects` acts): only one
 * whose own flags or origin name the dealer the asker owns, or - for 04's Bloodletting at rank 1, *ending
 * their Bleeding* - the creature's own Bleeding carrier where the dealer holds the talent.
 *
 * @param {{effect: {flags?: object, origin?: string|null}|null, byUuid: string|null, keys?: object, bleeding?: boolean, bloodletting?: boolean}} o
 */
export function dropJudgement({ effect = null, byUuid = null, keys = FEATURE_EFFECT_KEYS, bleeding = false, bloodletting = false } = {}) {
  if (!effect || !byUuid) return false;
  if (namedBy(effect, keys).includes(byUuid) || effect.origin === byUuid) return true;
  return bleeding === true && bloodletting === true;
}

/* ------------------------------------------------------------------ */
/*  Abject Obedience (the `obey` act)                                   */
/* ------------------------------------------------------------------ */

/**
 * **ABJECT OBEDIENCE, ASKED OF THE GM** (04): the card is the Sovereign's Abject Obedience card naming the
 * creature, the result is that creature's own Resilience Test on THIS card and it failed, and the
 * Sovereign holds the talent. Any of it missing refuses the control - and the ownership it grants.
 *
 * @param {object} o
 * @param {{key?: string, by?: string, targets?: string[]}|null} o.card  the card's `sovereign` record
 * @param {string|null} o.cardId
 * @param {{speakerUuid?: string|null, resistOf?: string|null, failed?: boolean}|null} o.result
 * @param {string} o.targetUuid
 * @param {string} o.byUuid
 * @param {number} o.rank  the Sovereign's Abject Obedience rank now
 */
export function obeyJudgement({ card = null, cardId = null, result = null, targetUuid = null, byUuid = null, rank = 0 } = {}) {
  if (!card || card.key !== "obedience" || card.by !== byUuid) return no("card");
  if (!(card.targets ?? []).includes(targetUuid)) return no("card");
  if (!(whole(rank) > 0)) return no("notHeld");
  if (!result || result.speakerUuid !== targetUuid || !cardId || result.resistOf !== cardId) return no("result");
  if (result.failed !== true) return no("passed");
  return yes();
}

/* ------------------------------------------------------------------ */
/*  Feeding (the `resolveCard`, `drain` and `feed` acts)                */
/* ------------------------------------------------------------------ */

/**
 * **A FEEDING CARD'S RESULT, RECORDED** (`resolveCard`): the result message is the creature's own Test,
 * made after the card. Answers whether it failed, or a refusal.
 *
 * @param {{plan: object|null, speakerUuid?: string|null, outcome?: boolean|null, after?: boolean}} o
 */
export function feedingResult({ plan = null, speakerUuid = null, outcome = null, after = true } = {}) {
  if (!plan) return no("noCard");
  if (!speakerUuid || speakerUuid !== plan.targetUuid || after !== true || typeof outcome !== "boolean") return no("result");
  return yes({ failed: outcome === false });
}

/**
 * **THE PLAN A FEEDING LANDS ON** (`drain` and `feed`): off the card where the ask names one (its plan,
 * once, and only where its recorded result failed), else - a free feeding, which no card records - only
 * for a GM or the Sovereign's own owner, its numbers clamped by `cleanFeedPlan`.
 *
 * @param {object} o
 * @param {boolean} o.named           the ask names a card
 * @param {object|null} o.card        that card's `feeding` record
 * @param {string} o.sovereignUuid    the Sovereign the ask writes on
 * @param {"drained"|"fed"} o.once    which landing this is
 * @param {{gm?: boolean, owns?: boolean}} o.asker
 * @returns {{ok: true, fromCard: boolean}|{ok: false, reason: string}}
 */
export function feedingClaim({ named = false, card = null, sovereignUuid = null, once = "fed", asker = {} } = {}) {
  if (named) {
    if (!card || card.sovereignUuid !== sovereignUuid) return no("noCard");
    if (card.resolved !== true || card.failed !== true) return no("notFailed");
    if (card[once] === true) return no("landed");
    return yes({ fromCard: true });
  }
  if (asker?.gm === true || asker?.owns === true) return yes({ fromCard: false });
  return no("notYours");
}

/**
 * **A FREE FEEDING'S NUMBERS, CLAMPED** (no card records them): the mode one of the three, a flat gain no
 * more than the tier (Red Feast's *equal to your tier*), a factor no more than 2 (Last Draught at rank 2,
 * a corpse's full Vitae), and *any day* only in the Blood Monarch form (Red Feast).
 *
 * @param {object} payload
 * @param {{tier?: number, monarch?: boolean}} o
 */
export function cleanFeedPlan(payload = {}, { tier = 1, monarch = false } = {}) {
  const mode = FEEDING_MODES.includes(payload?.mode) ? payload.mode : "fight";
  const t = tierOf(tier);
  const flat = payload?.flat === null || payload?.flat === undefined ? null : Math.min(whole(payload.flat), t);
  const factor = Math.min(2, Math.max(0, Number(payload?.vitaeFactor) || 1));
  return {
    sovereignUuid: payload?.sovereignUuid ?? null, targetUuid: payload?.targetUuid ?? null, mode,
    anyDay: payload?.anyDay === true && monarch === true, flat, vitaeFactor: factor,
    free: true, source: typeof payload?.source === "string" ? payload.source.slice(0, 80) : "",
    holder: payload?.holder ?? null, corpse: payload?.corpse ?? null,
    // Sanguine Draught's feeding at range (D-1372): kept, so Drink Deep reads it in a fight the Sovereign's client judges.
    ...(payload?.atRange === true ? { atRange: true } : {})
  };
}

/* ------------------------------------------------------------------ */
/*  Tribute and the prey (the `tribute` and `preyDied` acts)            */
/* ------------------------------------------------------------------ */

/** The Tribute a spell card may give a Sovereign through another client (07 §17's Sovereign's Kiss, Aortic Unraveling). */
export const CARD_TRIBUTE_SOURCES = Object.freeze(["kiss", "aortic"]);

/**
 * **A TRIBUTE GAIN ASKED OF THE SOVEREIGN'S ANSWERER**: a named source that is not a GM's hand, asked by a
 * GM or the Sovereign's own owner; or a spell card's Tribute (`CARD_TRIBUTE_SOURCES`) off a successful
 * card of this Sovereign's, once a card.
 *
 * @param {object} o
 * @param {string} o.source
 * @param {string[]} o.sources        `TRIBUTE_GAIN_SOURCES`
 * @param {{gm?: boolean, owns?: boolean}} o.asker
 * @param {{caster?: string|null, sovereign?: boolean, success?: boolean, claimed?: string[]}|null} o.card
 * @param {string} o.sovereignUuid
 */
export function tributeClaim({ source = null, sources = [], asker = {}, card = null, sovereignUuid = null } = {}) {
  if (!(sources ?? []).includes(source) || source === "hand") return no("source");
  if (asker?.gm === true || asker?.owns === true) return yes({ fromCard: false });
  if (!CARD_TRIBUTE_SOURCES.includes(source) || !card) return no("notYours");
  if (card.caster !== sovereignUuid || card.sovereign !== true || card.success !== true) return no("card");
  if ((card.claimed ?? []).includes(source)) return no("landed");
  return yes({ fromCard: true });
}

/**
 * **THE PREY'S DEATH, ASKED OF THE SOVEREIGN'S ANSWERER** (02 §7's Unending Pursuit): a GM's ask (the death
 * watch runs on the active GM), about the prey the Sovereign's mark names, which is dead.
 *
 * @param {{asker?: {gm?: boolean}, marked?: boolean, dead?: boolean}} o
 */
export function preyDiedClaim({ asker = {}, marked = false, dead = false } = {}) {
  if (asker?.gm !== true) return no("notGM");
  if (marked !== true) return no("noPrey");
  if (dead !== true) return no("alive");
  return yes();
}

/* ------------------------------------------------------------------ */
/*  Mirror of Self (the `mirror` act)                                   */
/* ------------------------------------------------------------------ */

/**
 * **MIRROR OF SELF, ASKED IN THE BLOW** (07 §17): asked by a GM or the holder's owner (the client the blow
 * lands on), for a spell that is Mirror of Self, while the Reaction is free and the blow's deadline holds.
 *
 * @param {{asker?: {gm?: boolean, owns?: boolean}, mirror?: boolean, reaction?: boolean, deadline?: number|null, now?: number}} o
 */
export function mirrorClaim({ asker = {}, mirror = false, reaction = false, deadline = null, now = 0 } = {}) {
  if (!(asker?.gm === true || asker?.owns === true)) return no("notYours");
  if (mirror !== true) return no("notMirror");
  if (reaction !== true) return no("reaction");
  if (!Number.isFinite(Number(deadline)) || Number(now) > Number(deadline)) return no("late");
  return yes();
}
