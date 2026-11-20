/**
 * **THE SOVEREIGN'S FEATURE AND TALENT DOORS** (02 §7's *Features by level*; 04's Dominion, Vainglorious
 * and Ravenous; the San'layn and Sovereign plan's B.8, B.9, B.11 C7 to C13, C17, T4, T5 and Phase 5). The
 * law is pure (`rules/sovereign-talents.mjs`, `rules/leash.mjs`, `rules/latch.mjs`); this module reads the
 * world and writes it. CORE's doors (`effects/sovereign-core.mjs`) hold the Vitae payment, the feeding,
 * the prey and the Tribute writer; every gain here goes through them under a named source.
 *
 * - **Judge, then budget, then pay** (D-768): a Use's refusals are asked in `judgeSovereignUse`, before
 *   `useFeature` spends the budget and the price; `landSovereignUse` lands what was paid for.
 * - **A write on a creature this client does not own** asks `gm-writes.mjs#gmAbsentFor` first, then goes
 *   to the active GM through `SOV_FEATURES_QUERY`, judged again there.
 * - **An offer is a card with a button** (Royal Due, Tasting Bite, Latch On, Last Draught, Example to
 *   Others), claimed on the card before anything is spent (`card-presses.mjs#claimCardPress`).
 */

import {
  ABJECT_OBEDIENCE, ABOVE_SUCH_THINGS, BLOODED_CLAWS, BLOODLETTING, BLOOD_CURSE_FLAG, BLOOD_MONARCH, BLOOD_PRISON,
  BLOOD_RUSH, BOUND_TO_THE_COURT, CRIMSON_FLOURISH, CROWNED_IN_BLOOD, EXAMPLE_TO_OTHERS, FLOURISH_SOURCE, GILDED_CAGE,
  GILDED_SKIN, HOMAGE, INSOLENCE_FLAG, INSOLENCE_REPAID, KNEEL, LAST_DRAUGHT, LATCH_ON, LEASH_FLAG, LINGERING_DECREE,
  LOOK_GROUP, LOOK_UPON_ME, MIRRORED_SELF, NO_PARDON, PRICE_OF_DEFIANCE, PRIM_AND_PROPER, RAKING_CLAWS, ROYAL_DUE,
  SANGUINE_EDGE, SANGUINE_FLAG, SERENE_DISDAIN, SOVEREIGN_WILL, SWIFT_HUNGER, TASTING_BITE, TOO_BEAUTIFUL_TO_DIE,
  UNFADING_GLORY_FLAG, UNMARRED, UNWORTHY_HAND, BENEATH_ME, CRIMSON_THRONE, HEAVY_TREAD, UNENDING_PURSUIT,
  WITHERING_CONTEMPT, aboveCost, afterCurseEnded, attackerCut, beneathGain, bloodPrisonDamage, bloodRushFeet,
  bloodedShadow, bloodletting, cleanBloodCurse, cursesOn, exampleRadius, flourishPrice, heavyTreadFeet, homageGain,
  isWeaponBlow, kneelLays, lastDraughtFactor, lastDraughtRefusal, latchTick, lookUponMeAsks, mirroredFeet,
  obedienceRefusal, primTemp, rakingBleeding, rankIn, royalDueAmount, royalDueCost, royalDueRefusal, sanguineAmount,
  sovereignWillPenalty, swiftHungerRefusal, tastingBite, testPrevented, tooBeautiful, unmarredGain, movedOnOwnSpeed
} from "../rules/sovereign-talents.mjs";
import { FEATURE_EFFECT_KEYS, askerMay, dropJudgement, layJudgement, obeyJudgement, strikeCap } from "../rules/sovereign-asks.mjs";
import { LATCH_FEET, cleanLeash } from "../rules/leash.mjs";
import { LATCH_ESCAPE, LATCH_KEY, cleanLatch, latchEnds, latchRefusal, latchesOn } from "../rules/latch.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { PORTRAIT_DIR, TOKEN_DIR } from "../rules/bestiary-art.mjs";
import { conditionEffectOf } from "../rules/condition-carriers.mjs";
import { onClawHit, isClaws } from "../rules/claw-hit.mjs";
import { poolWrite } from "../documents/pool-writes.mjs";
import {
  SOVEREIGN_QUERY, feedOn, feedWithDialog, isPrey, markPrey, preyOf, resolveTarget, tokenOf, tributePoolOf,
  vitaePoolOf, gainTribute, tributeAsked
} from "./sovereign-core.mjs";

/** The query every write on another client's creature is asked through. */
export const SOV_FEATURES_QUERY = "azeroth-rpg.sovereignFeatures";

const SCOPE = "azeroth-rpg";
const int = v => Math.trunc(Number(v)) || 0;
const whole = v => Math.max(0, int(v));
const values = c => [...(c?.values?.() ?? c ?? [])];
const t = (key, data = {}) => globalThis.game?.i18n?.format?.(key, data) ?? key;
const get = uuid => { try { return uuid ? fromUuidSync(uuid) : null; } catch { return null; } };
const now = () => Number(globalThis.game?.time?.worldTime) || 0;
const talentsOf = actor => actor?.takenTalents?.() ?? [];
const rank = (actor, identifier) => rankIn(talentsOf(actor), identifier);
const tierOf = actor => Math.min(4, Math.max(1, int(actor?.system?.tier) || 1));
const chaOf = actor => int(actor?.system?.abilities?.cha?.mod);
const spellDcOf = actor => int(actor?.system?.spellDC ?? actor?.system?.spells?.dc) || 10;
const refOf = token => (token?.id ? { sceneId: token.parent?.id ?? null, tokenId: token.id } : null);
const rowOf = token => {
  // A placeable's scene is its document's parent; a document's is its own.
  const d = token?.document ?? token;
  return d?.actor ? { tokenId: d.id, sceneId: d.parent?.id ?? null, actorId: d.actor.id, name: d.name ?? d.actor.name } : null;
};

/**
 * **A SPACE PICKED WITHOUT THE BOARD** (the Quench batches' seam, as `setStitchPick` is the Necromancer's):
 * a function answering `{to: {x, y}}` in place of the canvas pick, or null for the board's own.
 */
let pickOverride = null;
export function setSovereignPick(fn = null) {
  pickOverride = typeof fn === "function" ? fn : null;
}

/** Whether this client must ask a GM to write on `actor` and none is online (D-774). */
const noGM = actor => gmAbsentFor({ owned: [actor?.isOwner === true], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });

/** Whether an actor is a Sovereign (holds the class). */
export const isSovereign = actor => Boolean(actor?.items?.some?.(i => i.type === "class" && (i.system?.identifier === "sovereign" || i.name === "Sovereign")));

/** The combatant of an actor in its started fight, or null. */
function combatantOf(actor) {
  const fight = actor?.activeFight?.() ?? null;
  return fight ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
}

/** The round's once-marks of an actor's combatant this round. */
function roundMarks(actor) {
  const c = combatantOf(actor);
  if (!c) return [];
  const r = c.getFlag(SCOPE, "round") ?? {};
  return r.number === c.combat?.round ? (r.once ?? []) : [];
}

/** How many times a key was marked this round (`key`, `key#2`, ...). */
const markedCount = (actor, key) => roundMarks(actor).filter(m => m === key || String(m).startsWith(`${key}#`)).length;

/** Mark a round's key on the actor's combatant (the queued door), the nth use as `key#n`. */
async function markRound(actor, key) {
  const c = combatantOf(actor);
  if (!c) return true;
  const n = markedCount(actor, key);
  const r = await c.markRoundOnce(n ? `${key}#${n + 1}` : key);
  return r?.added !== false;
}

/** The once-a-turn key (`identifier@<turn>`, D-779's `turnMark`). */
function turnKey(actor, key) {
  const fight = actor?.activeFight?.() ?? null;
  return fight ? `${key}@${fight.turn ?? 0}` : null;
}

/** Feet between two tokens, the one measure (D-732), or null. */
async function feetBetween(a, b) {
  if (!a || !b) return null;
  try {
    const { feetApart } = await import("../canvas/footprints.mjs");
    return feetApart(a, b);
  } catch {
    return null;
  }
}

/** The creature's reach (05: 5 feet, 10 with Reach), off what it holds. */
async function reachOf(actor) {
  try {
    const { reachHeld } = await import("../rules/distance.mjs");
    return reachHeld((actor?.readyWeapons?.() ?? []).map(w => w?.system ?? w));
  } catch {
    return 5;
  }
}

/** Ask the active GM, here where this user is it. */
async function askGM(payload) {
  const gm = game.users?.activeGM ?? null;
  if (!gm) return { ok: false, reason: "noGM" };
  let done = null;
  try {
    done = gm.id === game.user.id ? await sovereignFeaturesQueryHandler(payload, { user: game.user })
      : await gm.query(SOV_FEATURES_QUERY, payload, { timeout: 10000 });
  } catch (err) {
    ui.notifications?.warn(t("AZEROTH.Sovereign.NoAnswer", { reason: err?.message ?? "" }));
    return { ok: false, reason: "error" };
  }
  // A refusal on the GM's side is said in words here (D-982's judgement, the fix pass's B1).
  if (done?.ok === false && done.words) ui.notifications?.warn(done.words);
  return done;
}

/** A refusal of an ask, in words (`AZEROTH.SovereignAsk.<reason>`). */
function refusedAsk(reason) {
  return { ok: false, reason, words: t(`AZEROTH.SovereignAsk.${reason}`) };
}

/** A result message's facts for a judgement: whose Test it is, the card it answered, and whether it failed. */
function resultFacts(result) {
  if (!result) return null;
  const speaker = ChatMessage.getSpeakerActor?.(result.speaker) ?? null;
  const outcome = result.rolls?.[0]?.outcome?.success;
  return { speakerUuid: speaker?.uuid ?? null, resistOf: result.flags?.[SCOPE]?.resistOf?.messageId ?? null, failed: outcome === false };
}

/** Ask whoever answers for an actor (an active owning player, else the active GM). */
async function askAnswerer(actor, payload) {
  const { answererOf } = await import("./blow-doors.mjs");
  const who = answererOf(actor);
  if (!who) return { ok: false, reason: "nobody" };
  let done = null;
  try {
    done = who.id === game.user.id ? await sovereignFeaturesQueryHandler(payload, { user: game.user })
      : await who.query(SOV_FEATURES_QUERY, payload, { timeout: 10000 });
  } catch (err) {
    ui.notifications?.warn(t("AZEROTH.Sovereign.NoAnswer", { reason: err?.message ?? "" }));
    return { ok: false, reason: "error" };
  }
  if (done?.ok === false && done.words) ui.notifications?.warn(done.words);
  return done;
}

/** Gain Tribute on the Sovereign by a named source, here or on its answerer (CORE's writer). */
async function tributeFor(sovereign, amount, source, from = null) {
  if (!sovereign || !tributePoolOf(sovereign)) return { ok: false };
  if (sovereign.isOwner) return gainTribute(sovereign, amount, source, { from });
  return askAnswerer(sovereign, { act: "tribute", sovereignUuid: sovereign.uuid, amount, source, from });
}

/** Spend Tribute off the pool as it stands now, inside the pool queue: a delta, never a snapshot. */
function spendTribute(actor, amount) {
  return poolWrite(actor, async () => {
    const pool = tributePoolOf(actor);
    const n = whole(amount);
    if (!pool || pool.value < n) return { ok: false, reason: "short" };
    if (n) await actor.writePoolsNow([{ itemId: pool.itemId, kind: "momentum", value: pool.value - n }], {}, {});
    return { ok: true, spent: n, value: pool.value - n };
  });
}

/** Post a plain card line in the Sovereign's name. */
async function card(actor, lines = [], flags = {}) {
  const body = (lines ?? []).filter(Boolean).map(l => `<p class="azeroth-drain">${foundry.utils.escapeHTML(String(l))}</p>`).join("");
  if (!body) return null;
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: body, flags: { [SCOPE]: { kind: "sovereign", ...flags } } });
}

/** A span for N minutes on a creature: ten of its fight's rounds, or the world's minute. */
async function minutesOn(actor, n = 1) {
  const { minuteSpan } = await import("./durations.mjs");
  return minuteSpan(actor, n) ?? {};
}

/* ------------------------------------------------------------------ */
/*  A Shadow strike that meets Ward (Price of Defiance, Tasting Bite...) */
/* ------------------------------------------------------------------ */

/**
 * **A SOVEREIGN'S OWN SHADOW DAMAGE ON A CREATURE**: the rating through the one resolver (Ward meets it,
 * no Armor Points; 05 §15), landed with `attack: false` - here where this client owns the creature, else
 * on the GM's client (asked first).
 *
 * @returns {Promise<number>}  what it dealt
 */
export async function strikeShadow({ by, target, rating = 0, name = "", why = null } = {}) {
  const n = whole(rating);
  if (!target || !n) return 0;
  const { result, damage } = await resolveStrike(by, target, n);
  if (!damage) return 0;
  if (target.isOwner) {
    await target.applyDamage(damage, { struck: true, attack: false, location: "body", type: "shadow", by, wardTook: result.wardTook ?? 0, mitigation: result.mitigationSource });
    return damage;
  }
  if (noGM(target)) {
    ui.notifications?.warn(t("AZEROTH.Sovereign.NoGM", { name: name || by?.name || "", target: target.name }));
    return 0;
  }
  // The GM works the rating out again from the dealer's own row (`why` names the door) and resolves it
  // itself: the payload's amount is only the most it may deal (D-982).
  const done = await askGM({ act: "strike", byUuid: by?.uuid ?? null, targetUuid: target.uuid, amount: damage, why });
  return done?.ok ? whole(done.dealt) : 0;
}

/** A rating of Shadow through the one resolver (Ward meets it, no Armor Points; 05 §15), on this client. */
async function resolveStrike(by, target, rating) {
  const { resolveRecordedDamage } = await import("../rules/damage-record.mjs");
  const { wardBySchool } = await import("../rules/ward.mjs");
  const s = target.system ?? {};
  // The dealer's own halving inside the record (04's Drawn Across; the B3 review's census), as Barbed Bone's.
  const { dealtHalvedBy } = await import("../rules/legacy-uses.mjs");
  const result = resolveRecordedDamage({ rating: whole(rating), sl: 0, kind: "magical", school: "shadow", ward: wardBySchool(s.ward).shadow ?? 0, immune: s.immune ?? [], vulnerable: s.vulnerable ?? [], slAddsToDamage: false, dealtHalved: by ? dealtHalvedBy(by) : null });
  return { result, damage: result.immune ? 0 : whole(result.damage) };
}

/** The most a strike asked of the GM may deal, off the dealer's own row now (`rules/sovereign-asks.mjs#strikeCap`). */
function strikeCapOf(by, target, why) {
  return strikeCap({
    why, tier: tierOf(by), cha: chaOf(by), bleeding: bleedingOf(target),
    ranks: {
      price: rank(by, PRICE_OF_DEFIANCE.identifier), noPardon: rank(by, NO_PARDON.identifier), bloodletting: rank(by, BLOODLETTING.identifier),
      gildedCage: rank(by, GILDED_CAGE.identifier), latchOn: rank(by, LATCH_ON.identifier), tasting: rank(by, TASTING_BITE.identifier)
    },
    holds: { prison: by?.hasFeature?.(BLOOD_PRISON.feature) === true, royalDue: by?.hasFeature?.(ROYAL_DUE.feature) === true }
  });
}

/** Lay a condition through the one inflict door (`effects/inflict.mjs`), its own query for another's creature. */
async function inflict(victim, id, { by, value = null, until = null } = {}) {
  const { inflictCondition } = await import("./inflict.mjs");
  return inflictCondition({ victim, id, value, by, name: victim?.name ?? "", until });
}

/** Create an effect on a creature: here where owned, else the GM's (asked first by the caller). */
async function layEffect(target, data) {
  if (target?.isOwner) return (await target.createEmbeddedDocuments("ActiveEffect", [data]))?.[0] ?? null;
  const done = await askGM({ act: "lay", targetUuid: target?.uuid ?? null, data });
  return done?.ok ? (target?.effects?.get?.(done.effectId) ?? { id: done.effectId }) : null;
}

/**
 * Delete effects on a creature: here where owned, else the GM's. `by` is the Sovereign whose effects they
 * are, and `why` names a door that ends another's (Bloodletting's Bleeding); the GM deletes only an effect
 * that names `by`, or that door's own (D-982).
 */
async function dropEffects(target, ids = [], { by = null, why = null } = {}) {
  const keep = (ids ?? []).filter(id => target?.effects?.has?.(id));
  if (!keep.length) return false;
  if (target.isOwner) {
    // In the latch's one queue, read again when its turn comes: a latch end already queued may have taken it.
    return inLatchQueue(async () => {
      const live = keep.filter(id => target.effects.has(id));
      if (live.length) await target.deleteEmbeddedDocuments("ActiveEffect", live);
      return true;
    });
  }
  const done = await askGM({ act: "drop", targetUuid: target.uuid, ids: keep, byUuid: by?.uuid ?? null, why });
  return done?.ok === true;
}

/* ------------------------------------------------------------------ */
/*  Blood curses (02 §7)                                                */
/* ------------------------------------------------------------------ */

/**
 * **THE DATA A BLOOD CURSE'S EFFECT CARRIES** (02 §7, *Blood curses*): the tag, in the spells' door's one shape
 * (`bloodCurse {source: <caster uuid>, spell, identifier, cast}`); its repeated Test as 07's escape record of
 * the `curse` kind (`rules/escapes.mjs#CURSE_ESCAPE`), which the escape door ends on a success; and 04's
 * Heavy Tread stamped on it at the lay - *its Speed falls by 5 feet per rank* - as a `final` change on
 * `system.speed`, floored at 0, so the drop ends with the curse.
 *
 * @param {{caster: Actor, name: string, img?: string, repeat?: {resilience: string, dc: number}|null,
 *   span?: object, statuses?: string[], changes?: object[], flags?: object, cast?: string|null, identifier?: string|null}} o
 */
export function bloodCurseEffectData({ caster, name, img = "icons/svg/blood.svg", repeat = null, span = {}, statuses = [], changes = [], flags = {}, cast = null, identifier = null } = {}) {
  const tread = heavyTreadFeet(rank(caster, HEAVY_TREAD.identifier));
  const more = tread > 0
    ? [{ key: "system.speed", type: "add", value: String(-tread), phase: "final" }, { key: "system.speed", type: "upgrade", value: "0", phase: "final" }]
    : [];
  const escape = repeat ? { condition: "curse", on: "turnEnd", resilience: repeat.resilience, dc: repeat.dc ?? null, banes: 0, failStun: null, talents: [], by: caster?.uuid ?? null, source: name, cast } : null;
  return {
    name, img, origin: caster?.uuid ?? null, ...span, statuses: [...statuses],
    system: { changes: [...changes, ...more] },
    flags: { [SCOPE]: { ...flags, [BLOOD_CURSE_FLAG]: { source: caster?.uuid ?? "", spell: name, identifier, cast: cast ?? null },
      ...(escape ? { escape } : {}), ...(tread ? { heavyTread: tread } : {}) } }
  };
}

/** Lay a blood curse on a creature (its own effect), judged for the GM first by the caller. */
export async function layBloodCurse(caster, target, spec = {}) {
  if (!caster || !target) return null;
  return layEffect(target, bloodCurseEffectData({ caster, ...spec }));
}

const AZEROTH_RES = { body: "AZEROTH.Resilience.Body", reflex: "AZEROTH.Resilience.Reflex", spirit: "AZEROTH.Resilience.Spirit" };

/**
 * **A REPEATED TEST, LANDED** (on the client that rolled it, which owns the creature): its one press
 * claimed, then on a success the curse ends and 04's Price of Defiance, Lingering Decree and No Pardon
 * land; on a failure the will lane's Tribute (the prey) or Homage's (another creature).
 */
export async function curseRepeatLanded({ message, actor, passed }) {
  const rec = message?.flags?.[SCOPE]?.sovRepeat ?? null;
  if (!rec || !actor) return [];
  const { claimCardPress } = await import("./card-presses.mjs");
  const claimed = await claimCardPress(message, { kind: "once", press: "sovRepeat" });
  if (!claimed.ok) {
    ui.notifications?.warn(t("AZEROTH.Sovereign.Repeat.Already", { name: actor.name }));
    return [];
  }
  const curser = get(rec.by);
  const lines = [];
  if (!passed) {
    // Bound to the Court is no blood curse: its failure feeds the will lane alone, never Homage.
    if (rec.court) await willLane(curser, actor);
    else lines.push(...await failedAgainstCurse(curser, actor));
    return lines;
  }
  const effect = actor.effects?.get?.(rec.effectId) ?? null;
  if (effect) await dropEffects(actor, [effect.id], { by: curser });
  lines.push(t("AZEROTH.Sovereign.Repeat.Ended", { name: actor.name, source: rec.source }));
  if (!rec.court) lines.push(...await curseThrownOff(curser, actor));
  return lines;
}

/**
 * **WHAT A CREATURE THAT THREW A CURSE OFF IS MADE TO PAY** (04's Price of Defiance, Lingering Decree, No
 * Pardon), read off the curser's talents now.
 */
async function curseThrownOff(curser, actor) {
  if (!curser || !actor) return [];
  const after = afterCurseEnded({
    price: rank(curser, PRICE_OF_DEFIANCE.identifier), lingering: rank(curser, LINGERING_DECREE.identifier),
    noPardon: rank(curser, NO_PARDON.identifier), tier: tierOf(curser), cha: chaOf(curser)
  });
  const lines = [];
  const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
  if (after.damage > 0) {
    const dealt = await strikeShadow({ by: curser, target: actor, rating: after.damage, name: PRICE_OF_DEFIANCE.name, why: "price" });
    lines.push(t("AZEROTH.Sovereign.Price", { name: actor.name, n: dealt, talent: PRICE_OF_DEFIANCE.name }));
  }
  if (after.slowed) {
    await inflict(actor, LINGERING_DECREE.condition, { by: curser, until: untilEndOfNextTurnOrRound(actor) });
    lines.push(t("AZEROTH.Sovereign.Lingering", { name: actor.name, talent: LINGERING_DECREE.name }));
  }
  if (after.attackBane) {
    const { layBane } = await import("./banes.mjs");
    await layBane({ victim: actor, kind: "attack", banes: 1, source: LINGERING_DECREE.name, by: curser, span: untilEndOfNextTurnOrRound(actor) });
    lines.push(t("AZEROTH.Sovereign.LingeringBane", { name: actor.name, talent: LINGERING_DECREE.name }));
  }
  if (after.frightened) {
    await inflict(actor, NO_PARDON.condition, { by: curser, until: untilEndOfNextTurnOrRound(actor) });
    lines.push(t("AZEROTH.Sovereign.NoPardon", { name: actor.name, talent: NO_PARDON.name }));
  }
  // The record a cue reads (the ANIM agent's): what the curse thrown off cost, on a card in the curser's name.
  if (lines.length) await card(curser, lines, { curseThrownOff: true, targetUuid: actor.uuid, source: tokenOf(actor)?.uuid ?? null });
  return lines;
}

/**
 * **THE WILL LANE ON A TEST THIS DOOR ROLLED** (R17: *the target failing any resilience test from the
 * Sovereign should provide 1 tribute once per round*, **"Your prey"**): CORE's own `will` act, which marks
 * the round's record, on the Sovereign's answerer.
 */
async function willLane(curser, actor) {
  if (!curser || !actor || !isPrey(curser, actor)) return false;
  const { answererOf } = await import("./blow-doors.mjs");
  const who = answererOf(curser);
  try {
    if (who?.id === game.user.id) {
      const { sovereignQueryHandler } = await import("./sovereign-core.mjs");
      await sovereignQueryHandler({ act: "will", sovereignUuid: curser.uuid }, { user: game.user });
    } else if (who) await who.query(SOVEREIGN_QUERY, { act: "will", sovereignUuid: curser.uuid }, { timeout: 10000 });
  } catch (err) {
    console.warn("azeroth-rpg | the will lane", err);
  }
  return true;
}

/** **A FAILED TEST AGAINST A SOVEREIGN'S CURSE**: the prey's will lane (CORE's, once a round), or Homage. */
async function failedAgainstCurse(curser, actor) {
  if (!curser || !actor) return [];
  if (await willLane(curser, actor)) return [];
  return homageFor(curser, actor);
}

/** **HOMAGE** (04): once a round, twice at rank 2, when a creature other than the prey fails against the curse. */
export async function homageFor(curser, actor) {
  const r = rank(curser, HOMAGE.identifier);
  if (!r || !curser || isPrey(curser, actor)) return [];
  const gain = homageGain({ rank: r, isPrey: false, used: markedCount(curser, HOMAGE.mark) });
  if (!gain) return [];
  const done = await askAnswerer(curser, { act: "homage", sovereignUuid: curser.uuid, from: refOf(tokenOf(actor)) });
  return done?.ok ? [t("AZEROTH.Sovereign.Homage", { name: curser.name, target: actor.name, talent: HOMAGE.name })] : [];
}

/* ------------------------------------------------------------------ */
/*  The Uses: judge and land                                            */
/* ------------------------------------------------------------------ */

/** A refusal in words, and null for the caller to stop on. */
function refuse(key, data = {}) {
  ui.notifications?.warn(t(key, data));
  return null;
}

/**
 * **A SOVEREIGN USE, JUDGED BEFORE ANYTHING IS PAID** (D-768's order): what each Use needs - its target,
 * its once, its Tribute, its creatures gathered - asked here, and the list of creatures the card names
 * replaced where the Use gathers its own. Null refuses the Use in words; a plan is landed by
 * `landSovereignUse` once `useFeature` has spent the budget and the price.
 *
 * @param {{actor: Actor, item: Item, onUse: object, rank?: number, list?: object[], source?: object|null}} o
 */
export async function judgeSovereignUse({ actor, item, onUse = {}, rank: r = 1, list = [], source = null } = {}) {
  const sov = onUse?.sov ?? {};
  const name = item?.name ?? "";
  const myToken = tokenOf(actor);
  // **02's THE BLOOD ROYAL**: CORE's feeding door, which judges, spends its own Half-Action in a fight and
  // posts its own card. Handed straight across, so the feature's Use spends nothing twice.
  if (sov.feed) {
    await feedWithDialog(actor, { targets: list.length ? list : null });
    return null;
  }
  // **02's HUNT MORTAL**: one creature targeted; CORE's mark judges the turn's once and the 60 feet.
  // **A COUNTER THAT FIRES ON ITS OWN** (04's Too Beautiful to Die): the hold at 1 spends it; a press does not.
  if (sov.offered) return refuse("AZEROTH.Sovereign.Offered", { name });
  if (sov.mark) {
    if (list.length !== 1) return refuse("AZEROTH.Sovereign.OneTarget", { name });
    return { key: "mark", target: list[0] };
  }
  if (sov.pursuit) return { key: "pursuit" };
  // **02's PRIM AND PROPER**: *spend any amount of Tribute* - the amount asked through the one chooser.
  if (sov.prim) {
    const pool = tributePoolOf(actor);
    if (!pool || pool.value < 1) return refuse("AZEROTH.Sovereign.Prim.NoTribute", { name });
    const options = Array.from({ length: pool.value }, (_, i) => ({ key: String(i + 1), name: t("AZEROTH.Sovereign.Prim.Option", { n: i + 1, temp: primTemp({ spent: i + 1, gildedSkin: rank(actor, GILDED_SKIN.identifier) }) }), description: "" }));
    const pick = await game.system.azeroth.workflows.chooseOption(item, options, null, { prompt: t("AZEROTH.Sovereign.Prim.Prompt", { name }) });
    if (!pick) return null;
    return { key: "prim", spent: int(pick.key) };
  }
  // **02's LOOK UPON ME** (R25): each enemy Humanoid within 60 feet; the card names them and each rolls.
  if (sov.look) {
    const { creaturesWithin } = await import("../canvas/engaged.mjs");
    const enemies = creaturesWithin(actor, LOOK_UPON_ME.feet, { who: "enemy" })
      .filter(e => lookUponMeAsks({ enemy: true, type: e.actor.system?.creatureType ?? null, character: e.actor.type === "character", feet: e.feet }));
    if (!enemies.length) return refuse("AZEROTH.Sovereign.Look.Nobody", { name, feet: LOOK_UPON_ME.feet });
    list.splice(0, list.length, ...enemies.map(e => rowOf(e.token)).filter(Boolean));
    return { key: "look", cardFlags: { sovereign: { key: "look", by: actor.uuid, targets: enemies.map(e => e.actor.uuid) } } };
  }
  // **02's BLOOD PRISON**: on the prey, which must stand where the Sovereign can see it.
  if (sov.prison) {
    const prey = preyRow(actor);
    if (!prey) return refuse("AZEROTH.Sovereign.NoPrey", { name });
    const preyActor = resolveTarget(prey).actor;
    if (noGM(preyActor)) return refuse("AZEROTH.Sovereign.NoGM", { name, target: preyActor?.name ?? "" });
    list.splice(0, list.length, prey);
    return { key: "prison", cardFlags: { sovereign: { key: "prison", by: actor.uuid, targets: [preyActor.uuid] } } };
  }
  if (sov.crowned) return { key: "crowned" };
  // **04's SANGUINE EDGE**: a span laid on the Sovereign.
  if (sov.sanguine) return { key: "sanguine", rank: r };
  // **04's BLOODLETTING**: each Bleeding enemy within reach; refused where there is none.
  if (sov.bloodletting) {
    const reach = await reachOf(actor);
    const { creaturesWithin } = await import("../canvas/engaged.mjs");
    const bleeding = creaturesWithin(actor, reach, { who: "enemy" }).map(e => ({ token: e.token, actor: e.actor, value: bleedingOf(e.actor) })).filter(e => e.value > 0);
    if (!bleeding.length) return refuse("AZEROTH.Sovereign.Bloodletting.Nobody", { name });
    if (bleeding.some(e => noGM(e.actor))) return refuse("AZEROTH.Sovereign.NoGM", { name, target: bleeding.find(e => noGM(e.actor)).actor.name });
    list.splice(0, list.length, ...bleeding.map(e => rowOf(e.token)).filter(Boolean));
    return { key: "bloodletting", rank: r, bleeding: bleeding.map(e => ({ uuid: e.actor.uuid, value: e.value, name: e.token.name ?? e.actor.name })) };
  }
  // **04's BLOOD RUSH**: the prey within 30 feet (60 at rank 2), the space beside it picked now.
  if (sov.bloodRush) {
    const prey = preyRow(actor);
    if (!prey) return refuse("AZEROTH.Sovereign.NoPrey", { name });
    const preyToken = resolveTarget(prey).token;
    const feet = await feetBetween(myToken, preyToken);
    const range = bloodRushFeet(r);
    if (feet === null || feet > range) return refuse("AZEROTH.Sovereign.Rush.Far", { name, feet: range });
    const { pickStep } = await import("./steps.mjs");
    const reach = await reachOf(actor);
    const picked = pickOverride ? await pickOverride({ actor, key: "bloodRush", feet: range + reach })
      : await pickStep(myToken?.object ?? myToken, { feet: range + reach, name, sight: "see", near: reach, corpses: [] });
    if (!picked?.to && !picked?.point) return null;
    const to = picked.to ?? picked.point;
    // *within your reach of your prey*: the space picked, measured from the prey's footprint (D-732).
    const { feetApart } = await import("../canvas/footprints.mjs");
    const beside = feetApart(myToken, preyToken, { from: { x: to.x, y: to.y } });
    if (beside === null || beside > reach) return refuse("AZEROTH.Sovereign.Rush.NotBeside", { name, feet: reach });
    return { key: "bloodRush", to, prey: prey, feet: range };
  }
  // **04's BOUND TO THE COURT**: one creature under this Sovereign's curse within 60 feet.
  if (sov.bound) {
    if (list.length !== 1) return refuse("AZEROTH.Sovereign.OneTarget", { name });
    const target = resolveTarget(list[0]);
    if (!cursesOn(target.actor?.effects ?? []).some(c => c.by === actor.uuid)) return refuse("AZEROTH.Sovereign.NotCursed", { name, target: target.actor?.name ?? "" });
    const feet = await feetBetween(myToken, target.token);
    if (feet === null || feet > BOUND_TO_THE_COURT.feet) return refuse("AZEROTH.Sovereign.Far", { name, feet: BOUND_TO_THE_COURT.feet });
    if (noGM(target.actor)) return refuse("AZEROTH.Sovereign.NoGM", { name, target: target.actor.name });
    return { key: "bound", rank: r, cardFlags: { sovereign: { key: "bound", by: actor.uuid, rank: r, targets: [target.actor.uuid], holder: myToken?.uuid ?? actor.uuid } } };
  }
  // **04's KNEEL**: the prey, and at rank 2 every other creature under the curse within 60 feet.
  if (sov.kneel) {
    const prey = preyRow(actor);
    if (!prey) return refuse("AZEROTH.Sovereign.NoPrey", { name });
    const rows = [prey];
    if (r >= KNEEL.othersRank) {
      const { creaturesWithin } = await import("../canvas/engaged.mjs");
      for (const e of creaturesWithin(actor, KNEEL.feet, { who: "creature" })) {
        if (e.actor === actor || e.actor.uuid === resolveTarget(prey).actor?.uuid) continue;
        if (cursesOn(e.actor.effects ?? []).some(c => c.by === actor.uuid)) rows.push(rowOf(e.token));
      }
    }
    const actors = rows.map(row => resolveTarget(row).actor).filter(Boolean);
    if (actors.some(a => noGM(a))) return refuse("AZEROTH.Sovereign.NoGM", { name, target: actors.find(a => noGM(a)).name });
    list.splice(0, list.length, ...rows.filter(Boolean));
    return { key: "kneel", cardFlags: { sovereign: { key: "kneel", by: actor.uuid, rank: r, prey: actors[0]?.uuid ?? null, targets: actors.map(a => a.uuid) } } };
  }
  // **04's ABJECT OBEDIENCE**: the prey under the curse, no Boss, of the tier or lower.
  if (sov.obedience) {
    const prey = preyRow(actor);
    const target = prey ? resolveTarget(prey).actor : null;
    const refusal = obedienceRefusal({
      isPrey: Boolean(target), cursed: cursesOn(target?.effects ?? []).some(c => c.by === actor.uuid),
      boss: target?.system?.isBoss === true, tier: target?.system?.tier ?? 1, myTier: tierOf(actor)
    });
    if (refusal) return refuse(`AZEROTH.Sovereign.Obedience.${refusal}`, { name, target: target?.name ?? "" });
    if (!game.users?.activeGM) return refuse("AZEROTH.Sovereign.NoGM", { name, target: target.name });
    list.splice(0, list.length, prey);
    return { key: "obedience", cardFlags: { sovereign: { key: "obedience", by: actor.uuid, targets: [target.uuid] } } };
  }
  // **04's ABOVE SUCH THINGS**: once a round, one condition a Resilience Test could have prevented.
  if (sov.above) {
    if (markedCount(actor, ABOVE_SUCH_THINGS.mark) >= 1) return refuse("AZEROTH.Sovereign.OnceRound", { name });
    const cost = aboveCost(r);
    const pool = tributePoolOf(actor);
    if (!pool || pool.value < cost) return refuse("AZEROTH.Sovereign.Short", { name, n: cost });
    const sheddable = values(actor.effects).filter(e => e.active !== false && (e.statuses?.size ?? 0) > 0 && testPrevented(e));
    if (!sheddable.length) return refuse("AZEROTH.Sovereign.Above.Nothing", { name });
    const options = sheddable.map(e => ({ key: e.id, name: e.name, description: "" }));
    const pick = sheddable.length === 1 ? options[0] : await game.system.azeroth.workflows.chooseOption(item, options, null, { prompt: t("AZEROTH.Sovereign.Above.Prompt", { name }) });
    if (!pick) return null;
    return { key: "above", effectId: pick.key, cost };
  }
  // **04's MIRRORED SELF**: the negating Reaction is `useFeature`'s own (`onUse.mitigate`); the step is picked now.
  if (sov.mirrored) {
    const feet = mirroredFeet(r);
    return { key: "mirrored", feet };
  }
  // **04's BLOOD MONARCH**: a shape of the Sovereign's own, once a Long Rest (the counter is the grant's).
  if (sov.monarch) {
    if (actor.shape && actor.shape.kind !== BLOOD_MONARCH.kind) return refuse("AZEROTH.Sovereign.Monarch.Shaped", { name });
    return { key: "monarch" };
  }
  return { key: null };
}

/** The prey as a target row, where its token stands on a scene. */
function preyRow(actor) {
  const mark = preyOf(actor);
  if (!mark) return null;
  const token = mark.tokenUuid ? get(mark.tokenUuid) : null;
  const preyActor = token?.actor ?? get(mark.actorUuid);
  if (!preyActor) return null;
  const tk = token ?? tokenOf(preyActor);
  return tk ? rowOf(tk) : { actorId: preyActor.id, name: preyActor.name };
}

/** The Bleeding value a creature carries (A1), 0 where it carries none. */
function bleedingOf(actor) {
  // The condition's own effect, never a carrier holding the status (D-997's census).
  const e = conditionEffectOf(values(actor?.effects), "bleeding");
  if (!e) return 0;
  return Math.max(1, int(e.getFlag?.(SCOPE, "value") ?? e.flags?.[SCOPE]?.value) || 1);
}

/**
 * **A SOVEREIGN USE, LANDED ONCE IT IS PAID FOR**: the lines its card prints.
 *
 * @returns {Promise<string[]>}
 */
export async function landSovereignUse({ actor, item, plan, list = [] } = {}) {
  const lines = [];
  const name = item?.name ?? "";
  switch (plan?.key) {
    case "mark": {
      const done = await markPrey(actor, plan.target, { way: "hunt" });
      if (done?.ok) lines.push(t("AZEROTH.Sovereign.Marked", { name: actor.name, target: done.mark?.name ?? "" }));
      break;
    }
    case "pursuit":
      lines.push(pursuitWords(actor));
      break;
    case "prim": {
      const paid = await spendTribute(actor, plan.spent);
      if (!paid.ok) {
        lines.push(t("AZEROTH.Sovereign.Short", { name, n: plan.spent }));
        break;
      }
      const temp = primTemp({ spent: paid.spent, gildedSkin: rank(actor, GILDED_SKIN.identifier) });
      await actor.grantTemporaryHealth(temp, { source: name, span: "encounter" });
      lines.push(t("AZEROTH.Sovereign.Prim.Landed", { name: actor.name, n: paid.spent, temp }));
      break;
    }
    case "crowned": {
      const span = await minutesOn(actor, CROWNED_IN_BLOOD.minutes);
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name, img: item?.img ?? "icons/svg/aura.svg", origin: actor.uuid, ...span, system: { changes: [] },
        showIcon: 2, flags: { [SCOPE]: { crownedInBlood: true, identifier: "crowned-in-blood" } }
      }]);
      lines.push(t("AZEROTH.Sovereign.Crowned", { name: actor.name }));
      break;
    }
    case "sanguine": {
      const { untilEndOfTurn, untilEndOfNextTurnOrRound, clockRounds } = await import("./durations.mjs");
      const span = plan.rank >= SANGUINE_EDGE.nextTurnRank ? untilEndOfNextTurnOrRound(actor) : (untilEndOfTurn(actor) ?? clockRounds(1));
      lines.push(await laySanguine(actor, { span, name }));
      break;
    }
    case "bloodletting": {
      const plannedRows = plan.bleeding.map(b => ({ ...b, value: bleedingOf(get(b.uuid)) || b.value }));
      const worked = bloodletting({ tier: tierOf(actor), bleeding: plannedRows, rank: plan.rank });
      let total = 0;
      for (const h of worked.hits) {
        const target = get(h.uuid);
        if (!target) continue;
        const dealt = await strikeShadow({ by: actor, target, rating: h.damage, name, why: "bloodletting" });
        total += dealt;
        lines.push(t("AZEROTH.Sovereign.Bloodletting.Hit", { target: h.name, n: dealt }));
        if (worked.ends) {
          // The condition's own effect, never a carrier holding the status (D-997; the review's N10).
          const own = conditionEffectOf(values(target.effects), "bleeding");
          if (own) await dropEffects(target, [own.id], { by: actor, why: "bloodletting" });
        }
      }
      const temp = Math.floor(total / 2);
      if (temp > 0) await actor.grantTemporaryHealth(temp, { source: name, span: "encounter" });
      lines.push(t("AZEROTH.Sovereign.Bloodletting.Temp", { name: actor.name, n: temp }));
      break;
    }
    case "bloodRush": {
      const { stepTo } = await import("./steps.mjs");
      const token = tokenOf(actor);
      const r = await stepTo({ token: token?.object ?? token, to: plan.to, feet: plan.feet + 5, by: actor });
      // The step rides the Use card, so the arrival cue plays where the Sovereign lands (ANIM's `arrive`).
      if (r?.step) plan.cardFlags = { ...(plan.cardFlags ?? {}), steps: [r.step] };
      lines.push(t(r?.moved ? "AZEROTH.Sovereign.Rush.Moved" : "AZEROTH.Sovereign.Rush.NotMoved", { name: actor.name }));
      break;
    }
    case "above": {
      const paid = await spendTribute(actor, plan.cost);
      if (!paid.ok) break;
      await markRound(actor, ABOVE_SUCH_THINGS.mark);
      const effect = actor.effects.get(plan.effectId);
      if (effect) {
        lines.push(t("AZEROTH.Sovereign.Above.Shed", { name: actor.name, condition: effect.name }));
        await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      }
      break;
    }
    case "mirrored": {
      const { pickStep, stepTo } = await import("./steps.mjs");
      const token = tokenOf(actor);
      const picked = !token ? null : (pickOverride ? await pickOverride({ actor, key: "mirrored", feet: plan.feet })
        : await pickStep(token.object ?? token, { feet: plan.feet, name, sight: "see" }));
      const to = picked?.to ?? picked?.point ?? null;
      if (to) {
        const r = await stepTo({ token: token.object ?? token, to, feet: plan.feet, by: actor });
        // The step rides the Use card, so the arrival cue plays where the Sovereign lands (ANIM's `arrive`).
        if (r?.step) plan.cardFlags = { ...(plan.cardFlags ?? {}), steps: [r.step] };
        lines.push(t("AZEROTH.Sovereign.Mirrored.Moved", { name: actor.name, feet: plan.feet }));
      } else lines.push(t("AZEROTH.Sovereign.Mirrored.Stayed", { name: actor.name }));
      break;
    }
    case "monarch":
      lines.push(await takeMonarch(actor, item));
      break;
    default:
      break;
  }
  return lines.filter(Boolean);
}

/** **UNENDING PURSUIT'S WORDS** (02 §7): the direction and rough distance to the prey within a mile, on this scene. */
export function pursuitWords(actor) {
  const mark = preyOf(actor);
  if (!mark) return t("AZEROTH.Sovereign.Pursuit.NoPrey", { name: actor.name });
  const mine = tokenOf(actor);
  const theirs = mark.tokenUuid ? get(mark.tokenUuid) : tokenOf(get(mark.actorUuid));
  if (!mine || !theirs || mine.parent?.id !== theirs.parent?.id) return t("AZEROTH.Sovereign.Pursuit.Elsewhere", { name: actor.name, target: mark.name });
  const dx = (theirs.x ?? 0) - (mine.x ?? 0);
  const dy = (theirs.y ?? 0) - (mine.y ?? 0);
  const size = mine.parent?.grid?.size || 100;
  const dist = mine.parent?.grid?.distance || 5;
  const feet = Math.round(Math.hypot(dx, dy) / size * dist / 5) * 5;
  if (feet > UNENDING_PURSUIT.feet) return t("AZEROTH.Sovereign.Pursuit.TooFar", { name: actor.name, target: mark.name });
  const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  const dirs = ["East", "SouthEast", "South", "SouthWest", "West", "NorthWest", "North", "NorthEast"];
  const dir = game.i18n.localize(`AZEROTH.Sovereign.Pursuit.Dir.${dirs[Math.round(angle / 45) % 8]}`);
  return t("AZEROTH.Sovereign.Pursuit.Sense", { name: actor.name, target: mark.name, dir, feet });
}

/** **SANGUINE EDGE'S SPAN** (04): the tier as a second, Shadow amount on every weapon and claw blow (the typed attack lane, D-777). */
async function laySanguine(actor, { span = {}, name = SANGUINE_EDGE.name, monarch = false } = {}) {
  const amount = sanguineAmount(tierOf(actor));
  const held = values(actor.effects).filter(e => e.flags?.[SCOPE]?.[SANGUINE_FLAG] && !e.flags?.[SCOPE]?.[SANGUINE_FLAG]?.monarch).map(e => e.id);
  if (held.length && !monarch) await actor.deleteEmbeddedDocuments("ActiveEffect", held);
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name, img: "icons/skills/melee/strike-sword-blood-red.webp", origin: actor.uuid, ...span,
    system: { changes: [{ key: "system.damageBonus.typed.attack.shadow", type: "add", value: String(amount), phase: "final" }] },
    flags: { [SCOPE]: { [SANGUINE_FLAG]: { amount, monarch } } }
  }]);
  return t("AZEROTH.Sovereign.Sanguine", { name: actor.name, n: amount });
}

/** **THE BLOOD MONARCH FORM** (04): a shape of the Sovereign's own (`bloodQueen`), wearing the Blood Monarch plate and token (`assets/art/bestiary/`, O-446), a 240 ft flight, for 1 minute. */
async function takeMonarch(actor, item) {
  const { takeShape } = await import("../documents/shapes.mjs");
  const form = {
    uuid: null, name: BLOOD_MONARCH.name, abilities: { str: null, dex: null, con: null }, defense: null,
    ap: { body: null, head: null, limb: null }, speed: null, flies: true, movementSenses: [],
    size: actor.system?.size ?? "medium", tier: 4, attacks: [],
    token: `${TOKEN_DIR}/${BLOOD_MONARCH.identifier}.png`, portrait: `${PORTRAIT_DIR}/${BLOOD_MONARCH.identifier}.png`
  };
  const shaped = await takeShape(actor, { kind: BLOOD_MONARCH.kind, forms: [form] });
  if (!shaped) return t("AZEROTH.Sovereign.Monarch.NotTaken", { name: actor.name });
  // The form's minute, on the shape's own effect (02's spans).
  const effect = values(actor.effects).find(e => e.flags?.[SCOPE]?.shape?.kind === BLOOD_MONARCH.kind) ?? null;
  const span = await minutesOn(actor, BLOOD_MONARCH.minutes);
  if (effect && span?.duration) await effect.update({ duration: span.duration, start: span.start ?? effect.start });
  // *Your Sanguine Edge is active on you and costs nothing*, for the form's minute.
  if (rank(actor, SANGUINE_EDGE.identifier) > 0) await laySanguine(actor, { span, name: `${SANGUINE_EDGE.name} (${BLOOD_MONARCH.name})`, monarch: true });
  return t("AZEROTH.Sovereign.Monarch.Taken", { name: actor.name, feet: BLOOD_MONARCH.flying });
}

/** Whether the Sovereign wears the Blood Monarch form. */
export const inMonarch = actor => actor?.shape?.kind === BLOOD_MONARCH.kind;

/* ------------------------------------------------------------------ */
/*  A feature card's Resist, landed (on the client that rolled it)      */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A SOVEREIGN'S RESIST LANDS** (`dice/chat.mjs#rollResists`, beside the Chronomancer's): Look Upon
 * Me's Bane, Blood Prison's curse, Bound to the Court's leash, Kneel's Prone and Stunned, Abject
 * Obedience's control on a failure; Homage on a blood curse spell's failure; a repeated curse Test; the
 * latch's escape; a curse thrown off by 07's own escape.
 *
 * @returns {Promise<string[]>}
 */
export async function sovereignAfterResist({ message, actor, passed, purpose = null, caster = null, result = null } = {}) {
  const flags = message?.flags?.[SCOPE] ?? {};
  const lines = [];
  if (!actor || !result) return lines;
  if (purpose === "sovRepeat") return curseRepeatLanded({ message, actor, passed });
  if (purpose === "sovLatch") return latchEscapeLanded({ message, actor, passed });
  if (purpose === "sovSpread") return spreadLanded({ message, actor, passed });
  // **07's ESCAPE ON A BLOOD CURSE THROWN OFF** (a curse riding a condition's escape record): the price paid.
  if (purpose === "escape" && passed) {
    const effect = actor.effects?.get?.(flags.escape?.effectId ?? "") ?? null;
    const curse = cleanBloodCurse(effect?.flags?.[SCOPE]?.[BLOOD_CURSE_FLAG]);
    if (curse) lines.push(...await curseThrownOff(get(curse.by), actor));
    return lines;
  }
  if (purpose === "escape" && !passed) {
    const effect = actor.effects?.get?.(flags.escape?.effectId ?? "") ?? null;
    const curse = cleanBloodCurse(effect?.flags?.[SCOPE]?.[BLOOD_CURSE_FLAG]);
    if (curse) lines.push(...await homageFor(get(curse.by), actor));
    return lines;
  }
  // **A BLOOD CURSE SPELL'S RESIST** failed by a creature other than the prey: Homage (04).
  if (purpose === "spell" && !passed && caster && flags.bloodCurse === true) {
    lines.push(...await homageFor(caster, actor));
    return lines;
  }
  const rec = flags.sovereign ?? null;
  if (!rec || !(rec.targets ?? []).includes(actor.uuid)) return lines;
  const by = get(rec.by);
  if (!by) return lines;
  if (passed) return lines;
  const { claimCardPress } = await import("./card-presses.mjs");
  const once = await claimCardPress(message, { kind: "once", press: `sov-${String(actor.uuid).replace(/[^A-Za-z0-9]/g, "_")}` });
  if (!once.ok) return lines;
  const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
  switch (rec.key) {
    case "look": {
      const { layBane } = await import("./banes.mjs");
      const mine = tokenOf(by);
      await layBane({ victim: actor, kind: "attack", banes: LOOK_UPON_ME.banes, source: LOOK_UPON_ME.feature, by, lasting: true,
        except: { actorId: by.id, tokenId: mine?.id ?? null, name: by.name }, span: untilEndOfNextTurnOrRound(actor), stackGroup: LOOK_GROUP });
      lines.push(t("AZEROTH.Sovereign.Look.Landed", { name: actor.name, by: by.name }));
      break;
    }
    case "prison": {
      const span = await minutesOn(actor, BLOOD_PRISON.minutes);
      await layBloodCurse(by, actor, {
        name: BLOOD_PRISON.feature, img: "icons/magic/unholy/projectile-helix-blood-red.webp", span,
        repeat: { resilience: BLOOD_PRISON.resilience, dc: spellDcOf(by) }, identifier: "blood-prison",
        flags: { bloodPrison: { by: by.uuid, gildedCage: rank(by, GILDED_CAGE.identifier) > 0 } }
      });
      lines.push(t("AZEROTH.Sovereign.Prison.Landed", { name: actor.name, by: by.name }));
      break;
    }
    case "bound": {
      const span = await minutesOn(actor, BOUND_TO_THE_COURT.minutes);
      const holder = get(rec.holder);
      const from = await feetBetween(holder, tokenOf(actor));
      await layEffect(actor, {
        name: BOUND_TO_THE_COURT.name, img: "icons/magic/control/debuff-chains-red.webp", origin: by.uuid, ...span,
        statuses: rec.rank >= BOUND_TO_THE_COURT.slowedRank ? ["slowed"] : [], system: { changes: [] },
        flags: { [SCOPE]: { [LEASH_FLAG]: { holder: rec.holder, feet: BOUND_TO_THE_COURT.leash, from: from ?? null, source: BOUND_TO_THE_COURT.name },
          courtRepeat: { by: by.uuid, resilience: BOUND_TO_THE_COURT.resilience, dc: spellDcOf(by) } } }
      });
      lines.push(t("AZEROTH.Sovereign.Bound.Landed", { name: actor.name, feet: BOUND_TO_THE_COURT.leash }));
      break;
    }
    case "kneel": {
      const lays = kneelLays({ prey: actor.uuid === rec.prey, rank: rec.rank });
      for (const id of lays) await inflict(actor, id, { by, until: untilEndOfNextTurnOrRound(actor) });
      if (lays.length) lines.push(t(lays.includes("stunned") ? "AZEROTH.Sovereign.Kneel.Prey" : "AZEROTH.Sovereign.Kneel.Other", { name: actor.name }));
      break;
    }
    case "obedience": {
      const done = await askGM({ act: "obey", byUuid: by.uuid, targetUuid: actor.uuid, messageId: message.id, resultUuid: result?.uuid ?? null });
      lines.push(t(done?.ok ? "AZEROTH.Sovereign.Obedience.Landed" : "AZEROTH.Sovereign.Obedience.NotLanded", { name: actor.name, by: by.name }));
      break;
    }
    default:
      break;
  }
  // A failure against a feature that is a blood curse feeds Homage (Blood Prison).
  if (rec.key === "prison") lines.push(...await homageFor(by, actor));
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Turns                                                               */
/* ------------------------------------------------------------------ */

/**
 * **THE END OF A CREATURE'S TURN** (on the active GM, `AzerothCombat#_onEndTurn`): Blood Prison's blood
 * tearing at a creature that moved on its own Speed (C10), then every repeated Test a blood curse, Bound to
 * the Court or a latch gives it.
 */
export async function sovereignTurnEnd(combat, combatant) {
  const actor = combatant?.actor ?? null;
  if (!actor || combatant.isDefeated) return;
  const lines = [];
  for (const e of values(actor.effects)) {
    const prison = e.active !== false ? e.flags?.[SCOPE]?.bloodPrison ?? null : null;
    if (!prison) continue;
    const by = get(prison.by);
    if (!by || !movedThisTurn(combat, combatant)) continue;
    const n = bloodPrisonDamage({ tier: tierOf(by), cha: chaOf(by), gildedCage: rank(by, GILDED_CAGE.identifier) > 0 });
    const dealt = await strikeShadow({ by, target: actor, rating: n, name: BLOOD_PRISON.feature, why: "prison" });
    lines.push(t("AZEROTH.Sovereign.Prison.Tear", { name: actor.name, n: dealt }));
  }
  if (lines.length) await card(actor, lines, { prison: true });
  await postCourtRepeats(actor);
  await postLatchEscapes(actor);
}

/** Whether a combatant moved on its own Speed this turn: the movement history core keeps, displacements left out. */
function movedThisTurn(combat, combatant) {
  const token = combatant?.token ?? null;
  const hist = token?._movementHistory ?? token?.movementHistory ?? [];
  if (Array.isArray(hist) && hist.length > 1) {
    return movedOnOwnSpeed(hist.slice(1));
  }
  // The turn's paid Moves, as the budget recorded them (D-761).
  return int(combatant?.getFlag?.(SCOPE, "moveHalves")) > 0;
}

/** Bound to the Court's repeat (04: *It repeats the Test at the end of each of its turns*). */
async function postCourtRepeats(actor) {
  const { PROMPT_TEMPLATE } = await import("./prompts.mjs");
  const { renderTemplate } = foundry.applications.handlebars;
  for (const e of values(actor.effects)) {
    const rec = e.active !== false ? e.flags?.[SCOPE]?.courtRepeat ?? null : null;
    if (!rec) continue;
    const by = get(rec.by);
    const penalty = sovereignWillPenalty(rank(by, SOVEREIGN_WILL.identifier));
    const dc = int(rec.dc) + penalty;
    const resilience = game.i18n.localize(AZEROTH_RES[rec.resilience] ?? rec.resilience);
    const content = await renderTemplate(PROMPT_TEMPLATE, {
      cardClass: "azeroth-card-attack", title: t("AZEROTH.Sovereign.Repeat.Title", { source: e.name }), name: actor.name,
      text: t("AZEROTH.Sovereign.Repeat.Text", { name: actor.name, source: e.name, resilience, dc }),
      testLabel: t("AZEROTH.Card.ResistTest", { resilience, dc }), dc, actorUuid: actor.uuid, purpose: "sovRepeat",
      resilience: rec.resilience, effectId: e.id, ownerSees: true
    });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content,
      flags: { [SCOPE]: { kind: "prompt", purpose: "sovRepeat", actorUuid: actor.uuid, sovRepeat: { effectId: e.id, by: rec.by, source: e.name, dc, court: true } } } });
  }
}

/* ------------------------------------------------------------------ */
/*  Latched (C8)                                                        */
/* ------------------------------------------------------------------ */

/**
 * **LATCH ON TO A CREATURE** (02 §7's *Latched*; 04's Latch On): one latch at a time, so a latch the
 * Sovereign holds elsewhere ends first; the carrier on the prey holds the 5 ft leash, the escape and Latch
 * On's tick. Judged for the GM by the caller.
 */
export async function layLatch(sovereign, prey, { source = LATCH_ON.name, tick = null } = {}) {
  const myToken = tokenOf(sovereign);
  const theirToken = tokenOf(prey);
  const feet = await feetBetween(myToken, theirToken);
  const refusal = latchRefusal({ feet, holderStunned: sovereign.statuses?.has?.("stunned") === true,
    holderHealth: sovereign.system?.health?.value ?? 0, preyHealth: prey.system?.health?.value ?? 0, self: sovereign === prey });
  if (refusal) return { ok: false, reason: refusal };
  await endLatchesHeldBy(sovereign);
  const effect = await layEffect(prey, {
    name: t("AZEROTH.Sovereign.Latch.Name", { name: sovereign.name }), img: "icons/creatures/abilities/fang-tooth-blood-red.webp",
    origin: sovereign.uuid, system: { changes: [] }, showIcon: 2,
    flags: { [SCOPE]: {
      [LATCH_KEY]: { holder: sovereign.uuid, holderToken: myToken?.uuid ?? null, dc: spellDcOf(sovereign), tick, source },
      [LEASH_FLAG]: { holder: myToken?.uuid ?? sovereign.uuid, feet: LATCH_FEET, from: null, source }
    } }
  });
  return effect ? { ok: true, effectId: effect.id } : { ok: false, reason: "pending" };
}

/** Every latch a Sovereign holds, on any creature of the viewed scene and the world's actors. */
function latchesHeldBy(sovereign) {
  const out = [];
  const seen = new Set();
  const scan = actor => {
    if (!actor || seen.has(actor.uuid)) return;
    seen.add(actor.uuid);
    for (const l of latchesOn(values(actor.effects))) if (l.holder === sovereign?.uuid) out.push({ actor, ...l });
  };
  for (const token of values(globalThis.canvas?.scene?.tokens)) scan(token.actor);
  for (const a of values(game.actors)) scan(a);
  return out;
}

/** Whether a Sovereign holds any latch (02 §7: *you cannot make an Off-Hand Attack*). */
export const holdsLatch = sovereign => latchesHeldBy(sovereign).length > 0;

/** End every latch a Sovereign holds (one latch at a time; letting go). */
export async function endLatchesHeldBy(sovereign) {
  for (const l of latchesHeldBy(sovereign)) await dropEffects(l.actor, [l.id], { by: sovereign });
}

/**
 * **LET GO** (02 §7: *The latch also ends ... or when you let go*; the review's S7): the Combat tab's control.
 * The latch lives on the prey, which a player does not own, so every latch the Sovereign holds is ended
 * through the drop door - on the GM's client where this one may not write the prey, asked first (D-774).
 *
 * @param {Actor} sovereign
 * @returns {Promise<{ok: boolean, reason?: string, ended?: number}>}
 */
export async function letGo(sovereign) {
  const held = latchesHeldBy(sovereign);
  if (!held.length) {
    refuse("AZEROTH.Sovereign.Latch.NoneHeld", { name: sovereign?.name ?? "" });
    return { ok: false, reason: "none" };
  }
  const blocked = held.find(l => noGM(l.actor));
  if (blocked) {
    refuse("AZEROTH.Sovereign.NoGM", { name: t("AZEROTH.Sovereign.Latch.LetGo"), target: blocked.actor.name });
    return { ok: false, reason: "noGM" };
  }
  await endLatchesHeldBy(sovereign);
  const left = latchesHeldBy(sovereign).length;
  if (left) return { ok: false, reason: "pending" };
  ui.notifications?.info(t("AZEROTH.Sovereign.Latch.LetGoDone", { name: sovereign.name, target: held.map(l => l.actor.name).join(", ") }));
  return { ok: true, ended: held.length };
}

/** The latch's escape prompt at the prey's turn end (02 §7: *a Body Resilience Test against your Spell DC*). */
async function postLatchEscapes(actor) {
  const { PROMPT_TEMPLATE } = await import("./prompts.mjs");
  const { renderTemplate } = foundry.applications.handlebars;
  for (const l of latchesOn(values(actor.effects))) {
    const holder = get(l.holder);
    const dc = l.dc ?? spellDcOf(holder);
    const resilience = game.i18n.localize(AZEROTH_RES[LATCH_ESCAPE.resilience]);
    const content = await renderTemplate(PROMPT_TEMPLATE, {
      cardClass: "azeroth-card-attack", title: t("AZEROTH.Sovereign.Latch.EscapeTitle"), name: actor.name,
      text: t("AZEROTH.Sovereign.Latch.EscapeText", { name: actor.name, holder: holder?.name ?? "", dc }),
      testLabel: t("AZEROTH.Card.ResistTest", { resilience, dc }), dc, actorUuid: actor.uuid, purpose: "sovLatch",
      resilience: LATCH_ESCAPE.resilience, effectId: l.id, ownerSees: true
    });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content,
      flags: { [SCOPE]: { kind: "prompt", purpose: "sovLatch", actorUuid: actor.uuid, sovLatch: { effectId: l.id, holder: l.holder } } } });
  }
}

/** The latch's escape, landed: a success ends it. */
async function latchEscapeLanded({ message, actor, passed }) {
  const rec = message?.flags?.[SCOPE]?.sovLatch ?? null;
  if (!rec) return [];
  const { claimCardPress } = await import("./card-presses.mjs");
  const claimed = await claimCardPress(message, { kind: "once", press: "sovLatch" });
  if (!claimed.ok) return [];
  if (!passed) {
    await willLane(get(rec.holder), actor);
    return [t("AZEROTH.Sovereign.Latch.Holds", { name: actor.name })];
  }
  await dropEffects(actor, [rec.effectId], { by: get(rec.holder) });
  return [t("AZEROTH.Sovereign.Latch.Escaped", { name: actor.name })];
}

/**
 * **WHAT ENDS A LATCH** (02 §7), on the active GM after any move or Health or condition change: more than
 * 5 feet apart, the holder Stunned, either at 0 Health. Asked of the world, never of a stale snapshot.
 */
export function checkLatches() {
  if (!game.users?.activeGM || game.users.activeGM !== game.user) return Promise.resolve();
  // ONE QUEUE (the review's S7): every token move and Health write starts a check, and two checks in flight
  // both read a latch as standing and both asked for its delete; the second was an error on the server.
  return inLatchQueue(checkLatchesNow);
}

let latchQueue = Promise.resolve();
/** Run `fn` after every latch end already queued on this client has landed: the latch's ends, one at a time. */
function inLatchQueue(fn) {
  const run = latchQueue.then(fn, fn);
  latchQueue = run.catch(() => null);
  return run;
}

/** The check itself, inside the queue: read off the world as it stands when its turn comes. */
async function checkLatchesNow() {
  for (const token of values(globalThis.canvas?.scene?.tokens)) {
    const prey = token.actor;
    for (const l of latchesOn(values(prey?.effects))) {
      const holder = get(l.holder);
      const feet = holder ? await feetBetween(tokenOf(holder), token) : null;
      const ends = !holder ? "zero" : latchEnds({ feet, holderStunned: holder.statuses?.has?.("stunned") === true,
        holderHealth: holder.system?.health?.value ?? 0, preyHealth: prey.system?.health?.value ?? 0 });
      if (ends && prey.effects.has(l.id)) {
        await prey.deleteEmbeddedDocuments("ActiveEffect", [l.id]);
        ui.notifications?.info(t(`AZEROTH.Sovereign.Latch.Ended.${ends}`, { name: holder?.name ?? "", target: prey.name }));
      }
    }
  }
}

/**
 * **THE START OF THE HOLDER'S TURN** (04's Latch On: *At the start of each of your turns while you are
 * latched on, your prey takes Shadow damage equal to your tier, and you regain that much Health*), on the
 * active GM.
 */
export async function sovereignTurnStart(combat, combatant) {
  const actor = combatant?.actor ?? null;
  if (!actor || !isSovereign(actor)) return;
  for (const l of latchesHeldBy(actor)) {
    if (!l.tick) continue;
    if (!isPrey(actor, l.actor)) continue;
    const n = latchTick({ tier: tierOf(actor), cha: chaOf(actor), rank: l.tick.rank });
    const dealt = await strikeShadow({ by: actor, target: l.actor, rating: n, name: LATCH_ON.name, why: "latch" });
    if (dealt > 0) await actor.applyHealing(dealt, { from: actor, feature: true, featureName: LATCH_ON.name, givenBy: actor });
    await card(actor, [t("AZEROTH.Sovereign.Latch.Tick", { name: actor.name, target: l.actor.name, n: dealt })], { latchTick: true, targetUuid: l.actor.uuid });
  }
}

/* ------------------------------------------------------------------ */
/*  The blow                                                            */
/* ------------------------------------------------------------------ */

/**
 * **THE ATTACKER-KEYED REDUCTION** (02 §7's Withering Contempt, 04's Unworthy Hand; the plan's C11): what
 * a weapon attack from `by` loses, whoever it strikes - 3 where `by` is the prey of a Sovereign holding
 * Withering Contempt within 60 feet of it, and each cursing Sovereign's Unworthy Hand rank.
 *
 * @returns {Promise<{cut: number, contempt: number, unworthy: number, by: string[]}>}
 */
export async function sovereignBlowCut(target, by, { attack = true, spell = false, breath = false, ignite = false, struck = true } = {}) {
  const none = { cut: 0, contempt: 0, unworthy: 0, by: [] };
  if (!by || !isWeaponBlow({ attack, spell, breath, ignite, struck })) return none;
  const contempt = [];
  for (const sov of values(game.actors)) {
    if (sov === by || !sov.hasFeature?.(WITHERING_CONTEMPT.feature) || !isPrey(sov, by)) continue;
    contempt.push({ feet: await feetBetween(tokenOf(sov), tokenOf(by)) });
  }
  const unworthy = [...new Set(cursesOn(values(by.effects)).map(c => c.by))].map(uuid => rank(get(uuid), UNWORTHY_HAND.identifier));
  const cut = attackerCut({ weapon: true, contempt, unworthy });
  return { ...cut, by: [...(cut.contempt ? [WITHERING_CONTEMPT.feature] : []), ...(cut.unworthy ? [UNWORTHY_HAND.name] : [])] };
}

/**
 * **THE ONE HOLD AT 1 THE SOVEREIGN'S OWN** (04's Too Beautiful to Die; the plan's B.13 Q22: a blow alone,
 * never a Vitae payment, which never reaches this door). It fires on its own where its Long Rest's use and
 * 1 Tribute or more are held (Cauterize's reading, MY READING for the lead): all the Tribute spent, 1
 * Health, and 3 temporary Health a Tribute (4 at rank 2). 07's Unfading Glory is the spells' door, asked
 * beside it (`effects/sovereign-spells.mjs#unfadingHold`).
 *
 * @returns {Promise<{amount: number, held: object}|null>}
 */
export async function sovereignHold(actor, { before = 0, amount = 0 } = {}) {
  if (!actor || actor.type !== "character") return null;
  const tribute = tributePoolOf(actor);
  const r = rank(actor, TOO_BEAUTIFUL_TO_DIE.identifier);
  if (!r || !tribute) return null;
  const talent = talentsOf(actor).find(x => x.identifier === TOO_BEAUTIFUL_TO_DIE.identifier);
  const counter = talent ? actor.grantedFeature?.(talent.id) : null;
  const left = whole(counter?.system?.uses?.value);
  const caught = tooBeautiful({ rank: r, tribute: tribute.value, usesLeft: left, before, amount });
  if (!caught || !counter) return null;
  const paid = await spendTribute(actor, caught.spent);
  if (!paid.ok) return null;
  await counter.update({ "system.uses.value": left - 1 });
  ui.notifications?.info(t("AZEROTH.Sovereign.TooBeautiful", { name: actor.name, talent: TOO_BEAUTIFUL_TO_DIE.name, n: caught.spent, temp: caught.temp }));
  // The record a cue reads (the ANIM agent's), posted once the hold stands.
  await card(actor, [t("AZEROTH.Sovereign.TooBeautiful", { name: actor.name, talent: TOO_BEAUTIFUL_TO_DIE.name, n: caught.spent, temp: caught.temp })], { tooBeautiful: true });
  // The temporary Health lands once the blow has written the 1 Health (`applyDamage` calls `afterWrite`
  // after its one Health update, which would otherwise write the blow's own temporary Health over it).
  return {
    amount: caught.amount, held: { kind: "tooBeautiful", name: TOO_BEAUTIFUL_TO_DIE.name },
    afterWrite: () => actor.grantTemporaryHealth(caught.temp, { source: TOO_BEAUTIFUL_TO_DIE.name, span: "encounter" })
  };
}

/**
 * **UNMARRED** (04): once a round (no limit with the Throne), when temporary Health took all of a blow,
 * gain 1 Tribute. On the client the blow lands on, written through CORE's door where it owns the Sovereign.
 */
export async function sovereignAbsorbed(actor, { absorbed = 0, reached = 0 } = {}) {
  if (!actor || rank(actor, UNMARRED.identifier) < 1) return;
  const throne = rank(actor, CRIMSON_THRONE.identifier) > 0;
  const gain = unmarredGain({ held: true, used: markedCount(actor, UNMARRED.mark), throne, absorbed, reached });
  if (!gain) return;
  if (!throne) await markRound(actor, UNMARRED.mark);
  await tributeFor(actor, gain, "unmarred");
}

/**
 * **ROYAL DUE'S OFFER** (02 §7: *Once a turn, when your spell or attack damages your prey, you may spend 2
 * Tribute*), once the blow is written: a card with a button, the Sovereign's to press.
 */
export async function offerRoyalDue({ by, target, dealt = 0, attack = true, spell = false } = {}) {
  if (!by || !target || by === target || !(attack || spell)) return null;
  const crowned = values(by.effects).some(e => e.active !== false && e.flags?.[SCOPE]?.crownedInBlood);
  const key = turnKey(by, ROYAL_DUE.mark);
  const refusal = royalDueRefusal({ holds: by.hasFeature?.(ROYAL_DUE.feature) === true, isPrey: isPrey(by, target), used: Boolean(key && roundMarks(by).includes(key)),
    tribute: tributePoolOf(by)?.value ?? 0, crowned, dealt });
  if (refusal) return null;
  const cost = royalDueCost(crowned);
  const n = royalDueAmount(chaOf(by));
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: by }),
    content: offerCard(t("AZEROTH.Sovereign.RoyalDue.Offer", { name: by.name, target: target.name, cost, n }), by,
      [{ label: t("AZEROTH.Sovereign.RoyalDue.Button", { cost }), data: `data-sovereign-offer="royalDue"` }]),
    flags: { [SCOPE]: { kind: "sovOffer", offer: "royalDue", sovereignUuid: by.uuid, targetUuid: target.uuid } }
  });
}

/** An offer card's HTML: its text and its buttons, pressed by the Sovereign's owner alone. */
function offerCard(text, sovereign, buttons = []) {
  const b = buttons.map(x => `<button type="button" ${x.data}>${foundry.utils.escapeHTML(x.label)}</button>`).join("");
  return `<div class="azeroth azeroth-card azeroth-card-attack" data-message-kind="sov-offer"><div class="azeroth-card-body"><p class="azeroth-card-text">${foundry.utils.escapeHTML(text)}</p>`
    + `<div class="azeroth-card-actions" data-reaction-owner="${sovereign.uuid}">${b}</div></div></div>`;
}

/** **ROYAL DUE, PRESSED**: judged again, the once marked, 2 Tribute (1 while Crowned) paid, the Shadow and the Health. */
export async function landRoyalDue(message) {
  const f = message?.flags?.[SCOPE] ?? {};
  const by = get(f.sovereignUuid);
  const target = get(f.targetUuid);
  if (!by?.isOwner || !target) return null;
  const crowned = values(by.effects).some(e => e.active !== false && e.flags?.[SCOPE]?.crownedInBlood);
  const key = turnKey(by, ROYAL_DUE.mark);
  const refusal = royalDueRefusal({ holds: by.hasFeature?.(ROYAL_DUE.feature) === true, isPrey: isPrey(by, target), used: Boolean(key && roundMarks(by).includes(key)),
    tribute: tributePoolOf(by)?.value ?? 0, crowned, dealt: 1 });
  if (refusal) return refuse(`AZEROTH.Sovereign.RoyalDue.Refuse.${refusal}`, { name: by.name, target: target.name });
  if (noGM(target)) return refuse("AZEROTH.Sovereign.NoGM", { name: ROYAL_DUE.feature, target: target.name });
  const { claimCardPress } = await import("./card-presses.mjs");
  const claimed = await claimCardPress(message, { kind: "once", press: "royalDue" });
  if (!claimed.ok) return refuse("AZEROTH.TalentLine.Pressed");
  if (key) await by.activeFight?.()?.getCombatantsByActor?.(by)?.[0]?.markRoundOnce?.(key);
  const paid = await spendTribute(by, royalDueCost(crowned));
  if (!paid.ok) return refuse("AZEROTH.Sovereign.Short", { name: ROYAL_DUE.feature, n: royalDueCost(crowned) });
  const dealt = await strikeShadow({ by, target, rating: royalDueAmount(chaOf(by)), name: ROYAL_DUE.feature, why: "royalDue" });
  if (dealt > 0) await by.applyHealing(dealt, { from: by, feature: true, featureName: ROYAL_DUE.feature, givenBy: by });
  return card(by, [t("AZEROTH.Sovereign.RoyalDue.Landed", { name: by.name, target: target.name, n: dealt })], { royalDue: true, targetUuid: target.uuid });
}

/* ------------------------------------------------------------------ */
/*  The attack                                                          */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A SOVEREIGN'S HIT ADDS BEFORE ITS CARD** (`workflows.rollTest`, a fired row): 04's Blooded Claws'
 * Shadow on a claw hit, a second amount of its own type (D-777).
 *
 * @returns {Promise<object[]>}  fired rows
 */
export async function sovereignOnHit({ actor, weaponId = null } = {}) {
  const weapon = weaponId ? actor?.items?.get?.(weaponId) ?? null : null;
  if (!weapon || !isClaws(weapon)) return [];
  const n = bloodedShadow(rank(actor, BLOODED_CLAWS.identifier));
  if (!n) return [];
  return [{ key: "talent", name: BLOODED_CLAWS.name, text: t("AZEROTH.Sovereign.BloodedClaws", { n, talent: BLOODED_CLAWS.name }), extraDamage: n, extraType: BLOODED_CLAWS.type }];
}

/**
 * **WHAT A CLAW HIT DOES AFTER ITS CARD** (WEAPON's `CLAW_HIT_HOOK`, on the attacker's client): 04's Raking
 * Claws' Bleeding, the Blood Monarch's feeding on the prey, and the offers - Tasting Bite and Latch On.
 */
export async function onSovereignClawHit(payload = {}) {
  const actor = get(payload.attackerUuid);
  if (!actor?.isOwner || !isSovereign(actor)) return;
  const token = get(payload.targetTokenUuid);
  const target = token?.actor ?? get(payload.targetActorUuid);
  if (!target || target === actor) return;
  // **TASTING BITE READS THE CREATURE AS THE CLAWS FOUND IT** (04: *When your claws hit a creature that is
  // Bleeding*; the review's S11): its conditions are read BEFORE Raking Claws lays this hit's own Bleeding.
  const statusesAtHit = [...(target.statuses ?? [])].sort();
  // **RAKING CLAWS** (R49's MY READING: on any claw hit, in place of the trait's Bleeding 1).
  const bleed = rakingBleeding(rank(actor, RAKING_CLAWS.identifier));
  if (bleed && (target.system?.health?.value ?? 0) > 0) {
    if (noGM(target)) ui.notifications?.warn(t("AZEROTH.Sovereign.NoGM", { name: RAKING_CLAWS.name, target: target.name }));
    else await inflict(target, "bleeding", { by: actor, value: bleed });
  }
  // **THE BLOOD MONARCH FORM** (04): *each time your claws hit your prey, you feed on it and regain Vitae equal to your tier*.
  if (inMonarch(actor) && isPrey(actor, token ?? target)) {
    await feedOn(actor, token ?? target, { mode: "fight", free: true, anyDay: true, flat: tierOf(actor), source: BLOOD_MONARCH.name, budget: false });
  }
  // **THE OFFERS** (04's Tasting Bite and Latch On: *you may spend 1 Tribute*).
  const buttons = [];
  const tasting = rank(actor, TASTING_BITE.identifier) > 0 && tastingBite({ tier: tierOf(actor), statuses: statusesAtHit });
  if (tasting) buttons.push({ label: t("AZEROTH.Sovereign.Tasting.Button", { n: TASTING_BITE.tribute }), data: `data-sovereign-offer="tastingBite"` });
  if (rank(actor, LATCH_ON.identifier) > 0 && isPrey(actor, token ?? target) && !holdsLatch(actor)) {
    buttons.push({ label: t("AZEROTH.Sovereign.LatchOn.Button", { n: LATCH_ON.tribute }), data: `data-sovereign-offer="latchOn"` });
  }
  if (!buttons.length) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: offerCard(t("AZEROTH.Sovereign.ClawOffer", { name: actor.name, target: target.name }), actor, buttons),
    flags: { [SCOPE]: { kind: "sovOffer", offer: "claw", sovereignUuid: actor.uuid, targetUuid: token?.uuid ?? target.uuid, ...(tasting ? { hitStatuses: statusesAtHit } : {}) } }
  });
}

/** **TASTING BITE, PRESSED** (04): judged again, 1 Tribute, the tier as Shadow and half of it as temporary Health. */
async function landTastingBite(message) {
  const f = message?.flags?.[SCOPE] ?? {};
  const by = get(f.sovereignUuid);
  const target = resolveTarget(get(f.targetUuid)).actor;
  if (!by?.isOwner || !target) return null;
  // Judged again off the creature as the claws found it (the card's record), never its Bleeding since.
  const bite = tastingBite({ tier: tierOf(by), statuses: Array.isArray(f.hitStatuses) ? f.hitStatuses : [...(target.statuses ?? [])] });
  if (!bite) return refuse("AZEROTH.Sovereign.Tasting.Refused", { name: by.name, target: target.name });
  if ((tributePoolOf(by)?.value ?? 0) < TASTING_BITE.tribute) return refuse("AZEROTH.Sovereign.Short", { name: TASTING_BITE.name, n: TASTING_BITE.tribute });
  if (noGM(target)) return refuse("AZEROTH.Sovereign.NoGM", { name: TASTING_BITE.name, target: target.name });
  const { claimCardPress } = await import("./card-presses.mjs");
  const claimed = await claimCardPress(message, { kind: "once", press: "tastingBite" });
  if (!claimed.ok) return refuse("AZEROTH.TalentLine.Pressed");
  const paid = await spendTribute(by, TASTING_BITE.tribute);
  if (!paid.ok) return null;
  const dealt = await strikeShadow({ by, target, rating: bite.damage, name: TASTING_BITE.name, why: "tasting" });
  const temp = Math.floor(dealt / 2);
  if (temp > 0) await by.grantTemporaryHealth(temp, { source: TASTING_BITE.name, span: "encounter" });
  return card(by, [t("AZEROTH.Sovereign.Tasting.Landed", { name: by.name, target: target.name, n: dealt, temp })], { tastingBite: true, targetUuid: target.uuid });
}

/** **LATCH ON, PRESSED** (04): judged again, 1 Tribute, the latch laid, and the free feeding offered (no Test). */
async function landLatchOn(message) {
  const f = message?.flags?.[SCOPE] ?? {};
  const by = get(f.sovereignUuid);
  const target = resolveTarget(get(f.targetUuid)).actor;
  if (!by?.isOwner || !target) return null;
  if (!isPrey(by, target)) return refuse("AZEROTH.Sovereign.NoPrey", { name: LATCH_ON.name });
  if ((tributePoolOf(by)?.value ?? 0) < LATCH_ON.tribute) return refuse("AZEROTH.Sovereign.Short", { name: LATCH_ON.name, n: LATCH_ON.tribute });
  if (noGM(target)) return refuse("AZEROTH.Sovereign.NoGM", { name: LATCH_ON.name, target: target.name });
  const feet = await feetBetween(tokenOf(by), tokenOf(target));
  const pre = latchRefusal({ feet, holderStunned: by.statuses?.has?.("stunned") === true, holderHealth: by.system?.health?.value ?? 0, preyHealth: target.system?.health?.value ?? 0 });
  if (pre) return refuse(`AZEROTH.Sovereign.Latch.Refuse.${pre}`, { name: by.name, target: target.name });
  const { claimCardPress } = await import("./card-presses.mjs");
  const claimed = await claimCardPress(message, { kind: "once", press: "latchOn" });
  if (!claimed.ok) return refuse("AZEROTH.TalentLine.Pressed");
  const paid = await spendTribute(by, LATCH_ON.tribute);
  if (!paid.ok) return null;
  const laid = await layLatch(by, target, { source: LATCH_ON.name, tick: { rank: rank(by, LATCH_ON.identifier) } });
  if (!laid.ok) return refuse(`AZEROTH.Sovereign.Latch.Refuse.${laid.reason}`, { name: by.name, target: target.name });
  // *When you latch on, you may feed on it (The Blood Royal), making no Test* - judged by once a day.
  const { feedVerdict } = await import("./sovereign-core.mjs");
  const verdict = feedVerdict(by, target, { mode: "fight", free: true });
  const lines = [t("AZEROTH.Sovereign.LatchOn.Landed", { name: by.name, target: target.name })];
  if (!verdict.refusal) {
    const fed = await feedOn(by, target, { mode: "fight", free: true, source: LATCH_ON.name, budget: false });
    if (!fed?.ok) lines.push(t("AZEROTH.Sovereign.LatchOn.NoFeed", { name: by.name }));
  } else lines.push(t("AZEROTH.Sovereign.LatchOn.NoFeed", { name: by.name }));
  return card(by, lines, { latchOn: true, targetUuid: target.uuid });
}

/**
 * **AN ATTACK RESOLVED AGAINST, OR BY, A SOVEREIGN** (`workflows.rollTest`, once the card stands): 04's
 * Beneath Me and Insolence Repaid on a miss at a Sovereign, and Crimson Flourish's discount on a hit by
 * one.
 */
export async function onAttackResolved({ attacker, list = [], hit = false, weaponId = null, message = null } = {}) {
  // **CRIMSON FLOURISH AT RANK 2**: a weapon or claw hit makes the next Half-Action Death spell this turn cost 2 less.
  if (hit && isSovereign(attacker) && rank(attacker, CRIMSON_FLOURISH.identifier) >= CRIMSON_FLOURISH.discountRank && attacker.isOwner) {
    const fight = attacker.activeFight?.() ?? null;
    await attacker.setFlag(SCOPE, "flourishDiscount", { combat: fight?.id ?? null, round: fight?.round ?? null, turn: fight?.turn ?? null, at: now() });
    ui.notifications?.info(t("AZEROTH.Sovereign.Flourish.Discount", { name: attacker.name, n: CRIMSON_FLOURISH.discount, price: flourishPrice(3) }));
  }
  // **INSOLENCE REPAID'S BOON IS TAKEN BY THE FIRST SUCH TEST**: a Sovereign's attack at the creature that missed.
  if (isSovereign(attacker) && attacker.isOwner) {
    for (const row of list ?? []) {
      const target = resolveTarget(row).actor;
      if (target) await takeInsolence(attacker, target.uuid);
    }
  }
  if (hit) return;
  for (const row of list ?? []) {
    const target = resolveTarget(row).actor;
    if (!target || !isSovereign(target) || target === attacker) continue;
    const throne = rank(target, CRIMSON_THRONE.identifier) > 0;
    const beneath = beneathGain({ rank: rank(target, BENEATH_ME.identifier), used: markedCount(target, BENEATH_ME.mark), throne });
    const insolence = rank(target, INSOLENCE_REPAID.identifier);
    if (!beneath && !insolence) continue;
    await askAnswerer(target, { act: "missed", sovereignUuid: target.uuid, attackerUuid: attacker?.uuid ?? null, beneath, insolence, from: refOf(tokenOf(attacker)) });
  }
}

/**
 * **A TEST AT A CREATURE TOOK INSOLENCE REPAID'S BOON** (04: *taken by the first such Test*): the promise
 * against it is struck.
 */
export async function takeInsolence(actor, againstUuid) {
  const held = actor?.getFlag?.(SCOPE, INSOLENCE_FLAG) ?? [];
  if (!held.some(p => p?.against === againstUuid)) return;
  await actor.setFlag(SCOPE, INSOLENCE_FLAG, held.filter(p => p?.against !== againstUuid));
}

/**
 * **A SOVEREIGN'S CAST, ONCE ITS CARD STANDS** (`workflows.castSpell`): 04's Crimson Flourish - a Death spell
 * cast as a Half-Action promises the next weapon or claw attack a Boon before the start of the next turn
 * (R54; `next-attack.mjs`'s `untilOwnTurn`, the review's N6: an Opportunity Attack after the round turns
 * over and before the Sovereign's turn still takes it), and the discount a hit laid is spent.
 */
export async function afterSovereignCast({ actor, spell, castAction = null, spellCard = null, target = null } = {}) {
  if (!actor || !isSovereign(actor)) return;
  const sys = spell?.system ?? {};
  const death = String(sys.school ?? "").toLowerCase() === "death";
  if (death && castAction === "half" && rank(actor, CRIMSON_FLOURISH.identifier) > 0) {
    const { layNextAttack } = await import("./next-attack.mjs");
    await layNextAttack(actor, [{ source: FLOURISH_SOURCE, name: CRIMSON_FLOURISH.name, boons: CRIMSON_FLOURISH.boons, lasts: "untilOwnTurn" }]);
  }
  if (death && castAction === "half" && actor.getFlag(SCOPE, "flourishDiscount")) await actor.unsetFlag(SCOPE, "flourishDiscount");
  if (target) await takeInsolence(actor, target);
}

/** Whether Crimson Flourish's discount stands for a cast this turn. */
export function flourishStands(actor) {
  const f = actor?.getFlag?.(SCOPE, "flourishDiscount") ?? null;
  if (!f) return false;
  const fight = actor.activeFight?.() ?? null;
  if (!fight) return !f.combat && now() - (Number(f.at) || 0) <= 6;
  return f.combat === fight.id && f.round === fight.round && f.turn === fight.turn;
}

/**
 * **SWIFT HUNGER'S JUDGEMENT ON A TICKED CAST** (04: *if it targets only one creature and that creature is
 * within your reach*): refused in words, nothing spent; its once a round marked once the cast is paid.
 */
export async function swiftHungerLine({ actor, targets = [] } = {}) {
  const list = targets ?? [];
  const target = list.length === 1 ? resolveTarget(list[0]) : null;
  const feet = target ? await feetBetween(tokenOf(actor), target.token) : null;
  const refusal = swiftHungerRefusal({ held: rank(actor, SWIFT_HUNGER.identifier) > 0, action: "action", targets: list.length, feet, reach: await reachOf(actor), used: markedCount(actor, SWIFT_HUNGER.mark) > 0 });
  if (refusal) {
    ui.notifications?.warn(t(`AZEROTH.Sovereign.Swift.${refusal}`, { name: actor.name, talent: SWIFT_HUNGER.name }));
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/*  Deaths                                                              */
/* ------------------------------------------------------------------ */

/**
 * **A DEATH THE SOVEREIGN MAY FEED ON OR SPREAD FROM** (on the active GM, off the death watch): 04's Last
 * Draught (a creature in reach, Bleeding or under the curse, once a round) and Example to Others (a
 * creature under a curse spell dropped to 0; the curse offered onto another within 15 feet, 30 at rank 2).
 */
export async function onSovereignDeath(event) {
  if (!event?.died && !event?.healthFell) return;
  const dead = event.actor;
  if (!dead) return;
  const deadToken = tokenOf(dead);
  for (const sov of values(game.actors).filter(a => a.type === "character" && isSovereign(a))) {
    // Example to Others: each curse spell of this Sovereign's the creature carried.
    const ex = rank(sov, EXAMPLE_TO_OTHERS.identifier);
    if (ex && (dead.system?.health?.value ?? 0) <= 0) {
      const curses = cursesOn(values(dead.effects)).filter(c => c.by === sov.uuid);
      if (curses.length) {
        const { creaturesWithin } = await import("../canvas/engaged.mjs");
        const near = deadToken ? creaturesWithin(sov, exampleRadius(ex), { from: deadToken.object ?? deadToken, who: "enemy", except: [deadToken.id] }) : [];
        if (near.length) {
          const effect = dead.effects.get(curses[0].id);
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: sov }),
            content: offerCard(t("AZEROTH.Sovereign.Example.Offer", { name: sov.name, target: dead.name, source: curses[0].source }), sov,
              near.map(e => ({ label: e.token.name ?? e.actor.name, data: `data-sovereign-offer="example" data-target="${e.token.document?.uuid ?? e.token.uuid}"` }))),
            flags: { [SCOPE]: { kind: "sovOffer", offer: "example", sovereignUuid: sov.uuid, curse: effect ? effect.toObject() : null } }
          });
        }
      }
    }
    // Last Draught.
    const ld = rank(sov, LAST_DRAUGHT.identifier);
    if (!ld || !event.died) continue;
    const bleeding = values(dead.effects).some(e => e.active !== false && e.statuses?.has?.("bleeding"));
    const cursed = cursesOn(values(dead.effects)).some(c => c.by === sov.uuid);
    const feet = await feetBetween(tokenOf(sov), deadToken);
    const refusal = lastDraughtRefusal({ rank: ld, feet, reach: await reachOf(sov), bleeding, cursed, used: markedCount(sov, LAST_DRAUGHT.mark) > 0, monarch: inMonarch(sov) });
    if (refusal) continue;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: sov }),
      content: offerCard(t("AZEROTH.Sovereign.LastDraught.Offer", { name: sov.name, target: dead.name }), sov,
        [{ label: t("AZEROTH.Sovereign.LastDraught.Button"), data: `data-sovereign-offer="lastDraught"` }]),
      flags: { [SCOPE]: { kind: "sovOffer", offer: "lastDraught", sovereignUuid: sov.uuid, targetUuid: deadToken?.uuid ?? dead.uuid } }
    });
  }
}

/** **LAST DRAUGHT, PRESSED** (04): the round's once (none in the form), and the no-Test feeding at half (all at rank 2). */
async function landLastDraught(message) {
  const f = message?.flags?.[SCOPE] ?? {};
  const by = get(f.sovereignUuid);
  const target = get(f.targetUuid);
  if (!by?.isOwner || !target) return null;
  const monarch = inMonarch(by);
  if (!monarch && markedCount(by, LAST_DRAUGHT.mark) > 0) return refuse("AZEROTH.Sovereign.OnceRound", { name: LAST_DRAUGHT.name });
  const { claimCardPress } = await import("./card-presses.mjs");
  const claimed = await claimCardPress(message, { kind: "once", press: "lastDraught" });
  if (!claimed.ok) return refuse("AZEROTH.TalentLine.Pressed");
  if (!monarch) await markRound(by, LAST_DRAUGHT.mark);
  const r = await feedOn(by, target, { mode: "corpse", free: true, vitaeFactor: lastDraughtFactor(rank(by, LAST_DRAUGHT.identifier)) * 2, source: LAST_DRAUGHT.name, budget: false });
  return r;
}

/** **EXAMPLE TO OTHERS, PRESSED** (04): the creature makes the spell's Test; a failure lays the curse's copy, no Vitae. */
async function landExample(message, button) {
  const f = message?.flags?.[SCOPE] ?? {};
  const by = get(f.sovereignUuid);
  const target = resolveTarget(get(button?.dataset?.target)).actor;
  if (!by?.isOwner || !target || !f.curse) return null;
  if (noGM(target)) return refuse("AZEROTH.Sovereign.NoGM", { name: EXAMPLE_TO_OTHERS.name, target: target.name });
  const { claimCardPress } = await import("./card-presses.mjs");
  const claimed = await claimCardPress(message, { kind: "once", press: "example" });
  if (!claimed.ok) return refuse("AZEROTH.TalentLine.Pressed");
  const curse = cleanBloodCurse(f.curse.flags?.[SCOPE]?.[BLOOD_CURSE_FLAG]);
  const esc = f.curse.flags?.[SCOPE]?.escape ?? null;
  // A curse with no repeat names its own Test (`curseTest`, the spell door's; D-1378), so Wracking Pain's copy asks Body.
  const own = f.curse.flags?.[SCOPE]?.curseTest ?? null;
  const res = esc?.resilience ?? own?.resilience ?? "spirit";
  const dc = esc?.dc ?? own?.dc ?? spellDcOf(by);
  const { PROMPT_TEMPLATE } = await import("./prompts.mjs");
  const resilience = game.i18n.localize(AZEROTH_RES[res] ?? res);
  const content = await foundry.applications.handlebars.renderTemplate(PROMPT_TEMPLATE, {
    cardClass: "azeroth-card-attack", title: t("AZEROTH.Sovereign.Example.Title", { source: curse?.source ?? "" }), name: target.name,
    text: t("AZEROTH.Sovereign.Example.Text", { name: target.name, source: curse?.source ?? "", resilience, dc }),
    testLabel: t("AZEROTH.Card.ResistTest", { resilience, dc }), dc, actorUuid: target.uuid, purpose: "sovSpread", resilience: res, ownerSees: true
  });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: by }), content,
    flags: { [SCOPE]: { kind: "prompt", purpose: "sovSpread", actorUuid: target.uuid, sovSpread: { by: by.uuid, curse: f.curse } } } });
}

/** **A SPREAD CURSE'S TEST, LANDED** (on the client that rolled it): a failure lays the copy with a fresh span. */
export async function spreadLanded({ message, actor, passed }) {
  const rec = message?.flags?.[SCOPE]?.sovSpread ?? null;
  if (!rec || !actor) return [];
  const { claimCardPress } = await import("./card-presses.mjs");
  const claimed = await claimCardPress(message, { kind: "once", press: "sovSpread" });
  if (!claimed.ok || passed) return [];
  const data = foundry.utils.deepClone(rec.curse);
  delete data._id;
  const span = await minutesOn(actor, 1);
  Object.assign(data, span);
  await layEffect(actor, data);
  return [t("AZEROTH.Sovereign.Example.Landed", { name: actor.name, source: data.name })];
}

/* ------------------------------------------------------------------ */
/*  Abject Obedience (the Mind Control door)                            */
/* ------------------------------------------------------------------ */

/**
 * **ABJECT OBEDIENCE ON THE GM'S CLIENT** (04; the plan's B.9: *rides the Mind Control door, without the
 * caster's Stun*): the control's carrier on the creature - its record, so the creature acts straight after
 * the Sovereign and repeats its Spirit Test at the end of each of its turns (`effects/mind-control-repeat.mjs`),
 * spanned by the minute and marked `obedience` so a blow does not end it (04 names no such end), and the
 * Sovereign's owners given the creature for the minute.
 */
export async function layObedience({ by, target, messageId = null, resultUuid = null } = {}) {
  const { MIND_CONTROL_FLAG, mindControlOn, mindControlRecord } = await import("../rules/mind-control.mjs");
  if ([...(target.effects ?? [])].some(e => mindControlOn(e, target.uuid))) return { ok: false, reason: "controlled" };
  const message = game.messages?.get(messageId ?? "") ?? null;
  const tTk = tokenOf(target);
  const cTk = tokenOf(by);
  const record = mindControlRecord({
    casterUuid: by.uuid, targetUuid: target.uuid, messageUuid: message?.uuid ?? `ChatMessage.${messageId}`, resultUuid: resultUuid ?? message?.uuid ?? `ChatMessage.${messageId}`,
    dc: spellDcOf(by), turnIdentity: { caster: cTk ? { sceneId: cTk.parent.id, tokenId: cTk.id } : null, target: tTk ? { sceneId: tTk.parent.id, tokenId: tTk.id } : null }
  });
  if (!record) return { ok: false, reason: "record" };
  const span = await minutesOn(target, ABJECT_OBEDIENCE.minutes);
  const players = Object.entries(by.ownership ?? {}).filter(([id, level]) => id !== "default" && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && !game.users.get(id)?.isGM).map(([id]) => id);
  const prior = foundry.utils.deepClone(target.ownership ?? {});
  const [effect] = await target.createEmbeddedDocuments("ActiveEffect", [{
    name: ABJECT_OBEDIENCE.name, img: "icons/magic/control/hypnosis-mesmerism-eye.webp", origin: by.uuid, ...span, system: { changes: [] },
    flags: { [SCOPE]: { identifier: ABJECT_OBEDIENCE.identifier, [MIND_CONTROL_FLAG]: record, obedience: { by: by.uuid, ownership: players.length ? prior : null } } }
  }]);
  if (!effect) return { ok: false, reason: "pending" };
  if (players.length) {
    const next = { ...prior };
    for (const id of players) next[id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    await target.update({ ownership: foundry.data.operators.ForcedReplacement.create(next) });
  }
  return { ok: true, effectId: effect.id };
}

/** **THE OBEDIENCE'S REPEAT TAKES A BANE WHILE BLEEDING** (04: *It takes a Bane on that Test while it is Bleeding*). */
export function obedienceRepeatBanes(actor) {
  const held = values(actor?.effects).some(e => e.active !== false && e.flags?.[SCOPE]?.obedience);
  if (!held || !actor?.statuses?.has?.("bleeding")) return null;
  return { banes: 1, names: [ABJECT_OBEDIENCE.name] };
}

/* ------------------------------------------------------------------ */
/*  The query                                                           */
/* ------------------------------------------------------------------ */

/**
 * **EVERY WRITE ASKED OF ANOTHER CLIENT** (`CONFIG.queries[SOV_FEATURES_QUERY]`), judged again here:
 *
 * - `strike` / `lay` / `drop` / `obey` - on the active GM: a Shadow amount (clamped to the rating asked
 *   for), an effect laid, effects deleted, Abject Obedience's carrier;
 * - `tribute` / `homage` / `missed` - on the Sovereign's answerer: a named Tribute gain, Homage's round,
 *   Beneath Me's Tribute and Insolence Repaid's promise.
 */
export async function sovereignFeaturesQueryHandler(payload = {}, { user = null } = {}) {
  const act = payload?.act ?? null;
  if (["strike", "lay", "drop", "obey"].includes(act)) {
    if (game.user?.isGM !== true) return refusedAsk("notGM");
    const target = get(payload.targetUuid);
    if (target?.documentName !== "Actor") return { ok: false, reason: "gone" };
    // **THE ASKER IS JUDGED, AND NOTHING IN THE PAYLOAD IS TRUSTED** (D-982; the fix pass's B1, the
    // Necromancer handler's shape): who asks must own an actor the act names, every amount is worked out
    // again here, and an effect is laid or ended only where its own flags name an actor the asker owns.
    const gm = !user || user.isGM === true;
    const owns = doc => gm || doc?.testUserPermission?.(user, "OWNER") === true;
    if (act === "strike") {
      const by = get(payload.byUuid);
      if (by?.documentName !== "Actor" || !askerMay({ gm, owns: [owns(by)] })) return refusedAsk("notYours");
      const cap = strikeCapOf(by, target, payload.why ?? null);
      if (!cap) return refusedAsk("strike");
      const { result, damage } = await resolveStrike(by, target, cap);
      const n = Math.min(whole(payload.amount), damage);
      if (!n) return { ok: true, dealt: 0 };
      await target.applyDamage(n, { struck: true, attack: false, location: "body", type: "shadow", by, wardTook: whole(result.wardTook), mitigation: result.mitigationSource ?? null });
      return { ok: true, dealt: n };
    }
    if (act === "lay") {
      const judged = layJudgement({ data: payload.data ?? null, keys: FEATURE_EFFECT_KEYS, conditions: Object.keys(globalThis.CONFIG?.AZEROTH?.conditions ?? {}) });
      if (!judged.ok) return refusedAsk(judged.reason);
      const by = get(judged.by);
      if (by?.documentName !== "Actor" || !askerMay({ gm, owns: [owns(by), owns(target)] })) return refusedAsk("notYours");
      const [effect] = await target.createEmbeddedDocuments("ActiveEffect", [foundry.utils.deepClone(payload.data)]);
      return effect ? { ok: true, effectId: effect.id } : { ok: false, reason: "pending" };
    }
    if (act === "drop") {
      const by = get(payload.byUuid);
      if (!askerMay({ gm, owns: [owns(by), owns(target)] })) return refusedAsk("notYours");
      // Bloodletting at rank 1 ends the creature's own Bleeding (04), where the dealer holds it.
      const bleedingId = payload.why === "bloodletting" && by && rank(by, BLOODLETTING.identifier) > 0 && rank(by, BLOODLETTING.identifier) < BLOODLETTING.keepsRank
        ? (conditionEffectOf(values(target.effects), "bleeding")?.id ?? null) : null;
      // One queue with the latch's own ends, so a latch deleted twice is never asked of the server (the review's S7).
      return inLatchQueue(async () => {
        const ids = (payload.ids ?? []).filter(id => target.effects.has(id)
          && (gm || owns(target) || dropJudgement({ effect: target.effects.get(id), byUuid: by?.uuid ?? null, keys: FEATURE_EFFECT_KEYS, bleeding: id === bleedingId, bloodletting: Boolean(bleedingId) })));
        if (!ids.length) return (payload.ids ?? []).length ? refusedAsk("drop") : { ok: true };
        await target.deleteEmbeddedDocuments("ActiveEffect", ids);
        return { ok: true, ended: ids.length };
      });
    }
    if (act === "obey") {
      const by = get(payload.byUuid);
      if (!by) return { ok: false, reason: "gone" };
      if (!askerMay({ gm, owns: [owns(by), owns(target)] })) return refusedAsk("notYours");
      // The card and its failed Test, read here: never the payload's word that the creature failed.
      const message = game.messages?.get(payload.messageId ?? "") ?? null;
      const result = payload.resultUuid ? get(payload.resultUuid) : null;
      const judged = obeyJudgement({ card: message?.flags?.[SCOPE]?.sovereign ?? null, cardId: message?.id ?? null, result: resultFacts(result),
        targetUuid: target.uuid, byUuid: by.uuid, rank: rank(by, ABJECT_OBEDIENCE.identifier) });
      if (!judged.ok) return refusedAsk(judged.reason);
      return layObedience({ by, target, messageId: message.id, resultUuid: result.uuid });
    }
  }
  const sovereign = get(payload.sovereignUuid);
  if (sovereign?.documentName !== "Actor" || !sovereign.isOwner) return { ok: false, reason: "notOwner" };
  // CORE's one judgement of a Tribute gain asked from elsewhere (`sovereign-core.mjs#tributeAsked`).
  if (act === "tribute") return tributeAsked(sovereign, payload, user);
  if (act === "homage") {
    const gain = homageGain({ rank: rank(sovereign, HOMAGE.identifier), isPrey: false, used: markedCount(sovereign, HOMAGE.mark) });
    if (!gain) return { ok: false, reason: "round" };
    await markRound(sovereign, HOMAGE.mark);
    return gainTribute(sovereign, gain, "homage", { from: payload.from ?? null });
  }
  if (act === "missed") {
    const lines = [];
    const throne = rank(sovereign, CRIMSON_THRONE.identifier) > 0;
    const beneath = beneathGain({ rank: rank(sovereign, BENEATH_ME.identifier), used: markedCount(sovereign, BENEATH_ME.mark), throne });
    if (beneath) {
      if (!throne) await markRound(sovereign, BENEATH_ME.mark);
      const r = await gainTribute(sovereign, beneath, "beneathMe", { from: payload.from ?? null });
      if (r?.ok) lines.push(t("AZEROTH.Sovereign.Beneath", { name: sovereign.name, talent: BENEATH_ME.name }));
    }
    const ins = rank(sovereign, INSOLENCE_REPAID.identifier);
    if (ins && payload.attackerUuid) {
      const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
      const span = untilEndOfNextTurnOrRound(sovereign);
      const until = span?.duration?.units === "seconds" ? now() + (span.duration.value ?? 6) : now() + 12;
      const held = (sovereign.getFlag(SCOPE, INSOLENCE_FLAG) ?? []).filter(p => p?.against !== payload.attackerUuid);
      await sovereign.setFlag(SCOPE, INSOLENCE_FLAG, [...held, { against: payload.attackerUuid, any: ins >= INSOLENCE_REPAID.anyRank, until, round: sovereign.activeFight?.()?.round ?? null }]);
      lines.push(t("AZEROTH.Sovereign.Insolence", { name: sovereign.name, talent: INSOLENCE_REPAID.name }));
    }
    for (const l of lines) ui.notifications?.info(l);
    return { ok: true };
  }
  throw new Error(`sovereign features: no such act ${JSON.stringify(act)}`);
}

/* ------------------------------------------------------------------ */
/*  Registration                                                        */
/* ------------------------------------------------------------------ */

/** The offer buttons, pressed on the card (the Sovereign's owner alone; `data-reaction-owner`). */
async function onOfferPress(message, button) {
  const kind = button?.dataset?.sovereignOffer;
  if (kind === "royalDue") return landRoyalDue(message);
  if (kind === "tastingBite") return landTastingBite(message);
  if (kind === "latchOn") return landLatchOn(message);
  if (kind === "lastDraught") return landLastDraught(message);
  if (kind === "example") return landExample(message, button);
  return null;
}

/** The public surface, for a macro, the Quench batches and the other doors. */
export const SOVEREIGN_FEATURES = Object.freeze({
  judgeSovereignUse, landSovereignUse, sovereignAfterResist, sovereignTurnEnd, sovereignTurnStart, sovereignBlowCut, sovereignHold,
  sovereignAbsorbed, offerRoyalDue, landRoyalDue, onSovereignClawHit, onAttackResolved, afterSovereignCast, swiftHungerLine,
  onSovereignDeath, layLatch, endLatchesHeldBy, letGo, holdsLatch, checkLatches, layBloodCurse, bloodCurseEffectData,
  strikeShadow, pursuitWords, layObedience, obedienceRepeatBanes, homageFor, onOfferPress, spreadLanded, flourishStands,
  setSovereignPick
});

let registered = false;
/** Register the claw-hit door, the death watch, the offer buttons and the latch's watch. Called once at init. */
export async function registerSovereignFeatures() {
  if (registered) return;
  registered = true;
  onClawHit(payload => { onSovereignClawHit(payload).catch(err => console.warn("azeroth-rpg | a Sovereign's claw hit", err)); });
  try {
    const { onDeath } = await import("./death-watch.mjs");
    onDeath(event => { onSovereignDeath(event).catch(err => console.warn("azeroth-rpg | a Sovereign's death watch", err)); });
  } catch (err) {
    console.warn("azeroth-rpg | the Sovereign's death watch", err);
  }
  Hooks.on("renderChatMessageHTML", (message, html) => {
    for (const button of html?.querySelectorAll?.("[data-sovereign-offer]") ?? []) {
      button.addEventListener("click", async event => {
        event.preventDefault();
        try {
          await onOfferPress(message, button);
        } catch (err) {
          console.warn("azeroth-rpg | a Sovereign's offer", err);
          ui.notifications?.warn(err?.message ?? String(err));
        }
      });
    }
  });
  const latchWatch = () => { checkLatches().catch(err => console.warn("azeroth-rpg | a latch", err)); };
  Hooks.on("updateToken", (doc, changed) => { if ("x" in changed || "y" in changed || "elevation" in changed) latchWatch(); });
  Hooks.on("updateActor", (actor, changed) => {
    if (foundry.utils.hasProperty(changed, "system.health.value")) {
      latchWatch();
      // Crowned in Blood ends early at 0 Health (02 §7).
      if ((actor.system?.health?.value ?? 1) <= 0 && game.users?.activeGM === game.user) {
        const ids = values(actor.effects).filter(e => e.flags?.[SCOPE]?.crownedInBlood).map(e => e.id);
        if (ids.length) actor.deleteEmbeddedDocuments("ActiveEffect", ids).catch(() => null);
      }
    }
  });
  Hooks.on("createActiveEffect", effect => { if (effect.statuses?.has?.("stunned")) latchWatch(); });
  Hooks.on("deleteActiveEffect", (effect) => {
    const f = effect.flags?.[SCOPE] ?? {};
    const actor = effect.parent;
    if (game.users?.activeGM !== game.user || actor?.documentName !== "Actor") return;
    // Crowned in Blood's end: *you lose any Tribute above your cap*, off the pool as it stands now.
    if (f.crownedInBlood) {
      poolWrite(actor, async () => {
        const pool = tributePoolOf(actor);
        if (!pool) return;
        // The cap as it stands without the crown (the derived cap may not have been prepared again yet), off the
        // STORED value - the snapshot's is clamped to the doubled cap it was read under.
        const { tributeCap } = await import("../rules/tribute.mjs");
        const crownedStill = values(actor.effects).some(e => e.id !== effect.id && e.active !== false && e.flags?.[SCOPE]?.crownedInBlood);
        const cap = tributeCap({ chaMod: actor.system?.abilities?.cha?.mod ?? 0, throne: rank(actor, CRIMSON_THRONE.identifier) > 0, crowned: crownedStill });
        const entry = (actor.system?.classes ?? []).find(c => c.itemId === pool.itemId) ?? null;
        const stored = Math.trunc(Number(entry?.momentum?.value ?? pool.value)) || 0;
        if (stored > cap) await actor.writePoolsNow([{ itemId: pool.itemId, kind: "momentum", value: cap }], {}, {});
      }).catch(err => console.warn("azeroth-rpg | Crowned in Blood's end", err));
    }
    // Abject Obedience's end: the ownership it granted taken back.
    if (f.obedience?.ownership) actor.update({ ownership: foundry.data.operators.ForcedReplacement.create(f.obedience.ownership) }).catch(() => null);
    // The Blood Monarch form's end: a Sovereign aloft lands beneath, with no damage from the fall.
    if (f.shape?.kind === BLOOD_MONARCH.kind) {
      // As a displacement (the plan's B.11 Red Feast row; D-769): a v14 elevation write is a movement, which the
      // Sovereign's own turn would meter and could refuse; a displacement meters nothing (the review's S6).
      for (const token of actor.getActiveTokens?.(false, true) ?? []) {
        if ((token.elevation ?? 0) > 0) token.move({ elevation: 0, action: "displace" }, { constrainOptions: { ignoreWalls: true, ignoreCost: true } }).catch(() => null);
      }
      const edge = values(actor.effects).filter(e => e.flags?.[SCOPE]?.[SANGUINE_FLAG]?.monarch).map(e => e.id);
      if (edge.length) actor.deleteEmbeddedDocuments("ActiveEffect", edge).catch(() => null);
    }
  });
  const attach = () => {
    if (game.system?.azeroth) game.system.azeroth.sovereignFeatures = SOVEREIGN_FEATURES;
  };
  attach();
  Hooks.once("ready", attach);
}
