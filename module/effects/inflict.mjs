/**
 * **A CONDITION LAID ON THE TARGET WITH THE BLOW, WITH NO BUTTON PRESSED**
 * (D-770; the lead, 2026-10-03: *"Lands automatically"*).
 *
 * Mangle's and Rip's Bleeding and Feral Charge's Prone at rank 2 land on a hit
 * as the attack's card is written, and the card says what landed. The write is
 * the card's own Inflict door - `effects/durations.mjs#applyCondition`, which
 * `dice/chat.mjs#applyConditionFromCard` calls - so a value, a condition the
 * target already has and the A1 refusals behave exactly as a press of the
 * button would. Only who presses has changed.
 *
 * ## A player cannot write on the GM's creature
 *
 * The write runs here for whoever owns the target and asks the active GM's
 * client otherwise, through `CONFIG.queries` exactly as a laid Bane does
 * (`effects/banes.mjs`, D-693) - never `game.socket`. The handler checks that
 * the asking user owns the creature that struck, because core checks only
 * `QUERY_USER`. A refusal is returned rather than thrown at the caller, so the
 * card can say it in words.
 */

import { AZEROTH } from "../config.mjs";
import { applyCondition } from "./durations.mjs";
import { NO_CASTING_FLAG, PARALYTIC_FLAG } from "../rules/class-talents.mjs";
// What a landed condition carries since D-778: the Test 07 gives a held or Stunned
// creature to end it, and Permafrost's feet on a Slowed.
import { ESCAPE_FLAG, cleanEscape } from "../rules/escapes.mjs";
import { SLOWED_FEET_FLAG } from "../rules/slowing.mjs";
import { addSlowedFeet } from "./speed-drop.mjs";

export const INFLICT_QUERY = "azeroth-rpg.inflictCondition";

/**
 * **WHAT A LANDED CONDITION MAY CARRY ON ITS EFFECT** (D-773), and nothing else:
 * Garrote's *cannot cast while that Bleeding lasts* (`noCasting`) and Paralytic's
 * Entangled *until it passes a Resilience Test against your poisons* (`paralytic`,
 * the poisoner whose passed Test ends it). A query carries only these keys.
 * **And since D-778**: the escape 07 gives a held or Stunned creature (`escape`,
 * `rules/escapes.mjs#cleanEscape`) and the feet 04's Permafrost adds to a Slowed
 * (`slowedFeet`, `{feet, source}`).
 */
const MARKS = Object.freeze([NO_CASTING_FLAG, PARALYTIC_FLAG]);

/** The marks a request carries, cleaned: each a `{source}` object, or dropped. */
function cleanMarks(marks) {
  const out = {};
  for (const key of MARKS) {
    const raw = marks?.[key] ?? null;
    if (raw && typeof raw === "object" && typeof raw.source === "string" && raw.source) out[key] = { source: raw.source };
  }
  const escape = cleanEscape(marks?.[ESCAPE_FLAG] ?? null);
  if (escape) out[ESCAPE_FLAG] = escape;
  const feet = Math.max(0, Math.trunc(Number(marks?.[SLOWED_FEET_FLAG]?.feet)) || 0);
  if (feet > 0) out[SLOWED_FEET_FLAG] = { feet, source: String(marks[SLOWED_FEET_FLAG].source ?? "") };
  return out;
}

/**
 * A span as a query may carry it: a ready-made `{duration, start}` (the STRIKER's
 * next turn start, Concussive Shot's *until your next turn*; D-773), or one of the
 * two keywords `applyCondition` reads, or none.
 */
function cleanUntil(until) {
  if (until === "endOfNextTurn" || until === "nextTurn") return until;
  if (until && typeof until === "object" && until.duration && until.start) {
    return { duration: { ...until.duration }, start: { ...until.start } };
  }
  return null;
}

/** A condition's value as the door takes it: a whole number above 0, or none. */
function valueOf(value) {
  if (value === null || value === undefined) return null;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * What one landing came to, for the card: the creature, the condition, whether
 * it took, and why not. `reason` is `immune` (the creature cannot be it: 10's
 * rungs, 14's passives, a block's immunities), `refused` (the door laid nothing),
 * `gone` (no such creature now) or `error` (the write failed, said already).
 */
function landing(name, id, value, landed, reason = null, { had = null, prior = null } = {}) {
  // **WHAT THE CREATURE HELD BEFORE** (D-779): whether it already had the condition
  // and at what value, so a Parry that holds can take back what this blow laid
  // (`rules/class-answers.mjs#parryUndoes`).
  return { name: String(name ?? ""), id, value: valueOf(value), landed, reason, had: typeof had === "boolean" ? had : null, prior: valueOf(prior) };
}

/**
 * Lay it here; the caller has already established that this client may.
 * An immunity is asked first, so the card can say so: the actor's own door
 * would refuse it too, in 10-CORRUPTION's words, which are wrong for a block.
 */
async function inflictHere({ victim, id, value, until = null, marks = {} }) {
  if ((victim.system?.conditionImmunities ?? []).includes(id)) return landing(victim.name, id, value, false, "immune");
  const had = victim.statuses?.has?.(id) === true;
  const prior = had ? (victim.effects?.find?.(e => e.statuses?.has?.(id))?.getFlag?.("azeroth-rpg", "value") ?? null) : null;
  const effect = await applyCondition(victim, id, { value: valueOf(value), until: cleanUntil(until) });
  // What the landed effect carries beside its value (D-773): written onto the
  // effect the condition rides, so the mark ends with the condition.
  const kept = cleanMarks(marks);
  const { [SLOWED_FEET_FLAG]: slowedFeet = null, ...flagsOnly } = kept;
  if (effect && Object.keys(flagsOnly).length) {
    await effect.update(Object.fromEntries(Object.entries(flagsOnly).map(([k, v]) => [`flags.azeroth-rpg.${k}`, v])));
  }
  // Permafrost's feet on a Slowed (D-778): changes of their own on the same effect.
  if (effect && id === "slowed" && slowedFeet) await addSlowedFeet(effect, slowedFeet);
  return landing(victim.name, id, value, Boolean(effect), effect ? null : "refused", { had, prior });
}

/**
 * The GM-side handler. Throws with the reason, which travels back to the
 * caller as the refusal.
 */
export async function inflictQueryHandler({ victimUuid, id, value = null, originUuid = null, until = null, marks = {} } = {}, { user = null } = {}) {
  const victim = victimUuid ? await fromUuid(victimUuid) : null;
  if (!victim || victim.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (!AZEROTH.conditions?.[id]) throw new Error(game.i18n.format("AZEROTH.Rider.Inflict.Unknown", { condition: String(id ?? "") }));
  // The striker has to be the asker's; the target is the GM's business.
  if (user) {
    const origin = originUuid ? await fromUuid(originUuid) : null;
    if (origin?.documentName !== "Actor" || !origin.testUserPermission(user, "OWNER")) {
      throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: origin?.name ?? "" }));
    }
  }
  return inflictHere({ victim, id, value, until, marks });
}

/**
 * Lay a condition on a creature the blow struck, and say what came of it.
 *
 * @param {object} o
 * @param {Actor|null} o.victim
 * @param {string} o.id          an `AZEROTH.conditions` key
 * @param {number|null} [o.value]
 * @param {Actor|null} [o.by]    the creature that struck
 * @param {string} [o.name]      the target's name on the card, for a creature that is gone
 * @param {object|string|null} [o.until]  the condition's span (D-773): the striker's
 *   next turn start, as `effects/durations.mjs#untilNextTurn` builds it, or none
 * @param {Record<string, {source: string}>} [o.marks]  what the landed effect
 *   carries (`MARKS`: Garrote's no casting, Paralytic's poisoner)
 * @returns {Promise<{name: string, id: string, value: number|null, landed: boolean, reason: string|null}>}
 */
export async function inflictCondition({ victim, id, value = null, by = null, name = "", until = null, marks = {} } = {}) {
  if (!victim) return landing(name, id, value, false, "gone");
  if (!AZEROTH.conditions?.[id]) return landing(victim.name, id, value, false, "refused");
  try {
    if (victim.isOwner) return await inflictHere({ victim, id, value, until, marks });
    const gm = game.users.activeGM;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
    const done = await gm.query(INFLICT_QUERY, { victimUuid: victim.uuid, id, value: valueOf(value), originUuid: by?.uuid ?? null, until: cleanUntil(until), marks: cleanMarks(marks) }, { timeout: 15000 });
    return done && typeof done === "object" ? landing(done.name ?? victim.name, id, value, done.landed === true, done.reason ?? null, { had: done.had ?? null, prior: done.prior ?? null }) : landing(victim.name, id, value, false, "error");
  } catch (err) {
    ui.notifications?.warn(err.message);
    return landing(victim.name, id, value, false, "error");
  }
}
