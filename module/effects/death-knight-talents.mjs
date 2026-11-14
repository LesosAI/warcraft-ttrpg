/**
 * **THE DEATH KNIGHT'S TALENTS, ON THE BOARD** (04's Blood and Frost; the Death Knight plan's
 * Phase 5, run F4a). The law is `rules/death-knight-talents.mjs`; this module holds the doors the
 * twenty-four ride, each asked by the ONE shared door it names:
 *
 * - `judgeDkUse` / `landDkUse` - a granted talent's Use, from `workflows.useFeature`: judged
 *   before anything is paid (D-768's order), landed once it is (Rune Tap, Mark of Blood,
 *   Vampiric Blood, Blood Tap, Dancing Runeweapon, Empower Runeweapon, Remorseless Winter);
 * - `afterRuneSpend` - Sanguine Tide and Runic Frost, at the one rune door
 *   (`documents/runes.mjs#spendRunesOn`), once the spend is written;
 * - `dkAfterAttackApply` - Mark of Blood and Vengeful Blood, at the attack card's Apply;
 * - `dkAfterSpellApply` - Crimson Coil and Chill of the Grave, at the spell card's Apply;
 * - `iceboundInBlow` - Icebound Fortitude, asked IN the blow at `AzerothActor#applyDamage`;
 * - `dkHealBonus` - Vampiric Blood's raise, at `AzerothActor#applyHealing`;
 * - `dkTurnStart` - Remorseless Winter and Frozen Desecration at every turn's start
 *   (`AzerothCombat`);
 * - `relentlessBars` - Relentless Advance at the one Disengage door;
 * - `relentlessOpportunityReach` - Relentless Advance's two-handed reach, where an Opportunity
 *   Attack is offered (`AzerothCombatant#opportunities`) and struck (`attackWithDialog`);
 * - `offerVengefulRiposte` / `vengefulRiposteFromCard` - Vengeful Blood's one-handed riposte,
 *   offered from the attack card's Apply and pressed by the knight's owner (D-779's shape);
 * - `dkTalentQueryHandler` - every write on a creature this client does not own, on the
 *   active GM's client through `CONFIG.queries` (never `game.socket`).
 *
 * The grip alternates of D-1017 ride the doors their first halves already ride: `dkOnHit` for
 * Grim Harvest's Off-Hand heal, Frozen Edge's Slowed and Frost, Relentless Advance's Frost and
 * Killing Machine's Runic Power and Critical Injury; `dancingRoll` for Dancing Runeweapon.
 */

import {
  DK_FLAGS, DK_ROUND_MARKS, dancingHeal, dancingOf, desecrationSlowsBy, disengageBarredByKnight, dkTempFor, empowerFeet, empowerPlan,
  gripSlowsBy, iceboundBlow, clampToCard, markOfBloodHeal, markOfBloodOf, refillOf, regainOf, relentlessFor, runicFrostFor, tideFor, vampiricAdd,
  vampiricOf, vengefulFor, winterOf, winterOutcome, coilSlowsFor, plagueHealsBy, frostBonusFor, SPEED_ZERO_CLAIM, speedZeroCardRefusal,
  VENGEFUL_OFFER_KIND, frozenEdgeSlowsFor, killingMachineHitFor, relentlessTwoHandFor, riposteBudgetOf, riposteDamageFor, riposteRefusal, vengefulRiposteFor
} from "../rules/death-knight-talents.mjs";
import { RUNIC_POWER } from "../rules/runes.mjs";
import { turnMark } from "../rules/class-answers.mjs";
import { offerMoment } from "../rules/chromatic-talents.mjs";
import { talentEffect } from "../rules/talent-effects.mjs";
import { patchRowsOf } from "../rules/class-talents.mjs";
import { gateHolds } from "../rules/talent-gates.mjs";
import { reachHeld } from "../rules/distance.mjs";
import { DESECRATION, DK_CLASS_NAME, PLAGUE } from "../rules/death-knight.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { rowWithdrawn } from "../rules/miss.mjs";

const SCOPE = "azeroth-rpg";
const t = (key, data = {}) => game.i18n.format(key, data);

/** The query every write on a creature this client does not own goes through. */
export const DK_TALENT_QUERY = "azeroth-rpg.dkTalent";

/** A document by uuid, or null - never a throw. */
function docAt(uuid) {
  if (!uuid) return null;
  try {
    return fromUuidSync(uuid);
  } catch {
    return null;
  }
}

/** The knight's taken talents, as the readers take them. */
const talentsOf = actor => (typeof actor?.takenTalents === "function" ? actor.takenTalents() : []);

/** The one predicate over the actor's one fact-builder (`AzerothActor#gateFacts`). */
function gateOf(actor, target = null, extra = {}) {
  const facts = { ...(actor?.gateFacts?.(target) ?? {}), ...extra };
  return when => gateHolds(when, facts);
}

/** The actor's token on a scene (the viewed one by default), or null. */
function tokenOn(actor, scene = canvas?.scene ?? null) {
  if (!actor || !scene) return null;
  if (actor.isToken && actor.token?.parent?.id === scene.id) return actor.token;
  return scene.tokens?.find?.(tk => tk.actor === actor || (tk.actorLink && tk.actorId === actor.id)) ?? null;
}

/** The flag Relentless Advance's Speed 0 rides: `{source}` (D-988). */
export const SPEED_ZERO_FLAG = "speedZero";

/**
 * **RELENTLESS ADVANCE'S SPEED 0** (04 at rank 2; the lead, run F4b, D-988: *"Speed 0"*): when the
 * Opportunity Attack hits, the creature's Speed is 0 until the end of its turn. One Active Effect,
 * an `override 0` on the derived `system.speed` in the `final` phase - no condition, so no escape
 * Test - spanned to the creature's own turn's end (a round of the world's clock out of a fight). A
 * second laying by the same source replaces the first, unless the standing one runs longer.
 *
 * Here where this client owns the creature. **On a creature another client owns it goes through
 * the GM's client with the attack's own card** (`DK_TALENT_QUERY`, act `speedZero`; the F4b review,
 * S3): the card's uuid and the row, which the handler reads off the world - the knight's
 * Opportunity Attack, a hit on that row, the row naming the creature, once a row - so the act
 * cannot be asked for any creature at any time. The attack door calls this once the card is
 * posted. Answers `{landed, text}`.
 *
 * @param {{victim: Actor, by: Actor, source: string, name?: string, messageUuid?: string|null, index?: number}} o
 * @returns {Promise<{landed: boolean, text: string}>}
 */
export async function laySpeedZero({ victim = null, by = null, source = "", name = "", messageUuid = null, index = 0 } = {}) {
  if (!victim) return { landed: false, text: t("AZEROTH.Card.TargetGone") };
  try {
    let landed = false;
    let effectId = null;
    if (victim.isOwner) {
      const done = await speedZeroHere(victim, { by, source });
      landed = Boolean(done?.effect);
      // Only an effect this laying MADE is this hit's to take back (a longer one kept is an earlier hit's).
      effectId = done?.made ? done.effect.id : null;
    } else landed = (await viaGM("speedZero", { knightUuid: by?.uuid ?? null, victimUuid: victim.uuid, source, messageUuid, index: Math.trunc(Number(index)) || 0 }))?.landed === true;
    return { landed, effectId, text: t(landed ? "AZEROTH.DeathKnight.Talent.SpeedZero" : "AZEROTH.DeathKnight.Talent.SpeedZeroNot", { name: name || victim.name, talent: source }) };
  } catch (err) {
    return { landed: false, text: err?.message ?? String(err) };
  }
}

/**
 * Lay the Speed 0 on a creature this client may write: `{effect, made}`, where `made` says the
 * effect is this laying's own (false where a longer standing one was kept), or null.
 *
 * **THE NEW EFFECT FIRST, THE OLDER ONE AFTER** (the F4c review, N10): a delete and then a create
 * left a moment with no Speed 0 at all, and a double press racing through it could end with none.
 */
async function speedZeroHere(victim, { by = null, source = "" } = {}) {
  const { untilEndOfTurn, clockRounds } = await import("./durations.mjs");
  const span = untilEndOfTurn(victim) ?? clockRounds(1);
  const standing = (victim.effects ?? []).filter(e => e.flags?.[SCOPE]?.[SPEED_ZERO_FLAG]?.source === source);
  // A Speed 0 already standing that runs longer than this one is never shortened (the F4b
  // review, S7.11): it is the one the creature keeps.
  // O-384 (run close-F2): spans in turns, rounds and the clock's seconds compare in seconds, at 05's
  // six-second round, off each span's own place in its fight - through the condition door's own
  // judgement (`durations.mjs#keepsStandingSpan`, the close review's findings 1 and 2), so the two
  // doors read a span one way.
  const { keepsStandingSpan } = await import("./durations.mjs");
  const longer = standing.find(e => keepsStandingSpan(e, span));
  if (longer) return { effect: longer, made: false };
  const stale = standing.map(e => e.id);
  const [made] = await victim.createEmbeddedDocuments("ActiveEffect", [{
    name: t("AZEROTH.DeathKnight.Talent.SpeedZeroName", { talent: source }), img: "icons/svg/downgrade.svg", origin: by?.uuid ?? null,
    description: `<p>${t("AZEROTH.DeathKnight.Talent.SpeedZeroText", { talent: source })}</p>`,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    system: { changes: [{ key: "system.speed", type: "override", value: "0", phase: "final" }] },
    ...span,
    flags: { [SCOPE]: { [SPEED_ZERO_FLAG]: { source } } }
  }]);
  if (!made) return null;
  // The shorter older ones go once the new one stands; one already gone (a second press) is skipped.
  await dropOlderSpeedZero(victim, stale);
  return { effect: made, made: true };
}

/**
 * **THE SHORTER OLDER SPEED 0 TAKEN OFF, NEVER AT THE NEW ONE'S EXPENSE** (the F4d review, item 3):
 * the ids still standing are deleted, and a delete that fails - one that expired between the read
 * and the write - is said in the console and swallowed, because the new Speed 0 already stands and
 * must still read as laid (and be recorded for a Parry to take back). Answers how many went.
 *
 * @param {Actor} victim
 * @param {string[]} ids
 * @returns {Promise<number>}
 */
export async function dropOlderSpeedZero(victim, ids = []) {
  const gone = (ids ?? []).filter(id => victim?.effects?.has?.(id));
  if (!gone.length) return 0;
  try {
    await victim.deleteEmbeddedDocuments("ActiveEffect", gone);
    return gone.length;
  } catch (err) {
    globalThis.console?.warn("azeroth-rpg | an older Speed 0 could not be removed", err);
    return 0;
  }
}

/** A knight's Sanguine Tide answered on this client, by knight, fight and round (the F4a review, S4). */
const TIDES_ANSWERED = new Set();

/** The Speed 0 card rows answered on this client, as `messageUuid:index` (the F4b review, S3). */
const SPEED_ZERO_ANSWERED = new Set();

/** Run a handler here where this client is the active GM, else on the active GM's client. */
async function viaGM(act, payload) {
  const data = { act, ...payload };
  if (game.user?.isGM && game.users?.activeGM?.isSelf) return dkTalentQueryHandler(data, { user: game.user });
  const gm = game.users?.activeGM ?? null;
  if (!gm) throw new Error(game.i18n.localize("AZEROTH.DeathKnight.Talent.NoGM"));
  return gm.query(DK_TALENT_QUERY, data, { timeout: 15000 });
}

/** The knight's combatant in its started fight, or null. */
function combatantOf(actor) {
  const fight = actor?.activeFight?.() ?? null;
  return fight?.started ? (fight.getCombatantsByActor?.(actor)?.[0] ?? null) : null;
}

/** Spend a once-a-round mark on the knight's combatant; true where it was free. Out of a fight, always. */
async function roundOnce(actor, key) {
  const mine = combatantOf(actor);
  if (!mine) return true;
  if (!mine.isOwner) return false;
  return (await mine.markRoundOnce(key))?.added === true;
}

/** Whether a mark is already spent this round on the knight's combatant (read only). */
function roundMarked(actor, key) {
  const mine = combatantOf(actor);
  if (!mine) return false;
  // The round's record (`rules/riders.mjs#roundOnce`): `{number, once}`.
  const round = mine.getFlag?.(SCOPE, "round") ?? null;
  const fight = mine.parent ?? mine.combat ?? null;
  return Boolean(round) && round.number === fight?.round && Array.isArray(round.once) && round.once.includes(key);
}

/* -------------------------------------------- */
/*  A granted talent's Use                       */
/* -------------------------------------------- */

/**
 * **A DEATH KNIGHT TALENT'S USE, JUDGED BEFORE ANYTHING IS PAID** (D-768's order). Null where it
 * is refused (said in words), else the plan `landDkUse` lands. A Use that names nothing of the
 * Death Knight's answers an empty plan, and lands nothing.
 *
 * @param {{actor: Actor, item: Item, onUse: object|null, rank?: number, list?: object[], source?: object|null}} o
 * @returns {Promise<object|null>}
 */
export async function judgeDkUse({ actor, item, onUse, rank = 1, list = [] } = {}) {
  const dk = onUse?.dk ?? null;
  if (!dk) return {};
  const name = item?.name ?? "";
  const refuse = (key, data = {}) => {
    ui.notifications?.warn(t(key, { name, actor: actor?.name ?? "", ...data }));
    return null;
  };
  // Icebound Fortitude is a Reaction asked IN the blow, never pressed from the sheet.
  if (dk.icebound) return refuse("AZEROTH.DeathKnight.Talent.AskedInBlow");
  const plan = {};
  if (dk.regain) plan.regain = regainOf(onUse, { rank, tier: actor.system?.tier ?? 1 });
  if (dk.markOfBlood) {
    const target = list[0] ?? null;
    plan.mark = { ...markOfBloodOf(onUse, { rank }), actorUuid: target?.actor?.uuid ?? null, tokenId: target?.tokenId ?? null, target: target?.name || target?.actor?.name || "" };
    if (!plan.mark.actorUuid && !plan.mark.tokenId) return refuse("AZEROTH.Laid.OneTarget");
  }
  if (dk.vampiric) plan.vampiric = vampiricOf(onUse, { rank });
  if (dk.refill) {
    plan.refill = refillOf(onUse, { rank });
    const pool = actor.system?.runes?.[plan.refill.kind] ?? null;
    const spent = pool ? Math.max(0, (pool.max ?? 0) - (pool.value ?? 0)) : 0;
    if (!spent) return refuse("AZEROTH.DeathKnight.Talent.NothingSpent", { kind: game.i18n.localize(plan.refill.kind === "frost" ? "AZEROTH.Runes.Frost" : "AZEROTH.Runes.Blood") });
  }
  if (dk.dancing) plan.dancing = dancingOf(onUse);
  if (dk.winter) plan.winter = winterOf(onUse);
  if (dk.empower) {
    // **JUDGED WHOLE** (04: *end every Frost Fever you laid on creatures within 15 feet ... refill
    // 1 spent Frost rune for each*): the Fevers in reach, the Frost runes spent and the slots,
    // before the Half-Action or the use is spent.
    const own = tokenOn(actor);
    if (!own) return refuse("AZEROTH.DeathKnight.Talent.NoToken");
    const { feetApart } = await import("../canvas/footprints.mjs");
    const feet = empowerFeet(onUse, { rank });
    const fevers = [];
    for (const tk of own.parent?.tokens ?? []) {
      const a = tk.actor;
      if (!a || tk === own) continue;
      for (const e of a.effects ?? []) {
        const tick = e.flags?.[SCOPE]?.tick ?? null;
        if (tick?.plague === "frostFever" && tick.source === actor.uuid) fevers.push({ id: `${a.uuid}|${e.id}`, feet: feetApart(own, tk), actorUuid: a.uuid, effectId: e.id, owned: a.isOwner });
      }
    }
    const pool = actor.system?.runes?.frost ?? null;
    const judged = empowerPlan({ fevers, feet, spentFrost: pool ? Math.max(0, (pool.max ?? 0) - (pool.value ?? 0)) : 0, slots: actor.system?.runes?.slots ?? 0 });
    if (judged.refusal) return refuse("AZEROTH.DeathKnight.Talent.NoFever", { feet });
    const chosen = fevers.filter(f => judged.ends.includes(f.id));
    // **THE END GOES THROUGH THE GM'S CLIENT WHATEVER THIS CLIENT OWNS** (`landDkUse` always asks
    // `viaGM("empower")`; the final review's finding 5, D-997): judged as a write this client
    // cannot make, so with no GM online the Half-Action and the use are never spent for nothing.
    if (gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) return refuse("AZEROTH.DeathKnight.Talent.NoGMNothingSpent");
    plan.empower = { feet, refill: judged.refill, ends: chosen.map(f => ({ actorUuid: f.actorUuid, effectId: f.effectId })) };
  }
  return plan;
}

/**
 * **WHAT THE USE DOES ONCE IT IS PAID FOR**: the knight's Health, a state laid on the knight, the
 * runes refilled, the Fevers ended. Answers the card's lines.
 *
 * @param {{actor: Actor, item: Item, plan: object}} o
 * @returns {Promise<string[]>}
 */
export async function landDkUse({ actor, item, plan = {} } = {}) {
  const lines = [];
  if (!plan || !Object.keys(plan).length) return lines;
  const name = item?.name ?? "";
  const { minuteSpan, roundsOrClock } = await import("./durations.mjs");
  if (plan.regain > 0) {
    const before = actor.system?.health?.value ?? 0;
    await actor.applyHealing(plan.regain, { from: actor, feature: true, featureName: name });
    lines.push(t("AZEROTH.DeathKnight.Talent.Regained", { name: actor.name, n: Math.max(0, (actor.system?.health?.value ?? before) - before), talent: name }));
  }
  const lay = async (flag, data, timing, img) => {
    const stale = actor.effects.filter(e => e.flags?.[SCOPE]?.[flag]).map(e => e.id);
    if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name, img: item?.img || img, origin: actor.uuid, description: item?.system?.description ?? "",
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS, ...(timing ?? {}),
      flags: { [SCOPE]: { [flag]: data } }
    }]);
  };
  if (plan.mark) {
    // The mark stands on the KNIGHT, naming the creature: nothing is written on a creature the
    // knight's client may not own, and the blow reads the knight's own effects.
    await lay(DK_FLAGS.markOfBlood, { actorUuid: plan.mark.actorUuid, tokenId: plan.mark.tokenId, heal: plan.mark.heal, name }, minuteSpan(actor, plan.mark.minutes), "icons/magic/unholy/strike-body-life-soul-red.webp");
    lines.push(t("AZEROTH.DeathKnight.Talent.Marked", { name: actor.name, target: plan.mark.target, n: plan.mark.heal, talent: name }));
  }
  if (plan.vampiric) {
    await lay(DK_FLAGS.vampiric, { add: plan.vampiric.add, name }, minuteSpan(actor, plan.vampiric.minutes), "icons/magic/unholy/orb-glowing-purple.webp");
    lines.push(t("AZEROTH.DeathKnight.Talent.Vampiric", { name: actor.name, n: plan.vampiric.add, talent: name }));
  }
  if (plan.dancing) {
    await lay(DK_FLAGS.dancing, { heal: plan.dancing.heal, offHandHeal: plan.dancing.offHandHeal, name }, roundsOrClock(actor, plan.dancing.rounds), "icons/weapons/swords/greatsword-glowing-red.webp");
    lines.push(t("AZEROTH.DeathKnight.Talent.Dancing", { name: actor.name, n: plan.dancing.rounds, talent: name }));
  }
  if (plan.winter) {
    await lay(DK_FLAGS.winter, { feet: plan.winter.feet, tier: actor.system?.tier ?? 1, dc: actor.system?.spellDC ?? actor.system?.spells?.dc ?? null, name }, roundsOrClock(actor, plan.winter.rounds), "icons/magic/water/snowflake-ice-blue.webp");
    lines.push(t("AZEROTH.DeathKnight.Talent.Winter", { name: actor.name, feet: plan.winter.feet, n: plan.winter.rounds, talent: name }));
  }
  if (plan.refill) {
    const { refillRunesOn } = await import("../documents/runes.mjs");
    const back = await refillRunesOn(actor, { kind: plan.refill.kind, count: plan.refill.count });
    lines.push(t("AZEROTH.DeathKnight.Talent.Refilled", { name: actor.name, n: back, kind: game.i18n.localize(plan.refill.kind === "frost" ? "AZEROTH.Runes.Frost" : "AZEROTH.Runes.Blood"), talent: name }));
  }
  if (plan.empower) {
    let ended = 0;
    try {
      const done = await viaGM("empower", { knightUuid: actor.uuid, ends: plan.empower.ends });
      ended = Math.max(0, Math.trunc(Number(done?.ended)) || 0);
    } catch (err) {
      ui.notifications?.warn(err.message);
    }
    const { refillRunesOn } = await import("../documents/runes.mjs");
    const back = ended ? await refillRunesOn(actor, { kind: "frost", count: Math.min(ended, plan.empower.refill) }) : 0;
    lines.push(t("AZEROTH.DeathKnight.Talent.Empowered", { name: actor.name, ended, n: back, talent: name }));
  }
  return lines;
}

/* -------------------------------------------- */
/*  The rune door                                */
/* -------------------------------------------- */

/**
 * **KILLING MACHINE AT THE RUNE DOOR** (04: *each Frost rune you spend gives 1 additional Runic
 * Power per rank* while a one-handed weapon is wielded in each hand): what each Frost rune adds,
 * read now off what is in hand.
 */
export function talentFrostBonus(actor) {
  return frostBonusFor(talentsOf(actor), { gate: gateOf(actor) }, talentEffect);
}

/**
 * **WHAT A RUNE SPENT RAISES** (04's Sanguine Tide and Runic Frost), once the spend is written:
 * a Blood rune's tide on every enemy within 10 feet and the knight's Health back for each struck,
 * and a Frost rune's discount on the next Frost spell before the turn ends - each once a round,
 * the round's mark spent through the combatant's queued door.
 *
 * @param {Actor} actor
 * @param {Array<{kind: string}>} spent  the runes the door took
 * @returns {Promise<string[]>}
 */
export async function afterRuneSpend(actor, spent = []) {
  const lines = [];
  if (actor?.type !== "character" || !(spent ?? []).length) return lines;
  const talents = talentsOf(actor);
  const tide = tideFor(talents, { spent, marked: roundMarked(actor, DK_ROUND_MARKS.tide) }, talentEffect);
  // The tide strikes through the GM's client (`viaGM("tide")`), so with no GM online it is
  // refused in words BEFORE the round's mark is spent (the final review's finding 5, D-997).
  const tideNoGM = Boolean(tide) && gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });
  if (tideNoGM) lines.push(t("AZEROTH.DeathKnight.Talent.TideNoGM", { name: actor.name, talent: tide.name }));
  if (tide && !tideNoGM && await roundOnce(actor, DK_ROUND_MARKS.tide)) {
    try {
      const done = await viaGM("tide", { knightUuid: actor.uuid, amount: tide.amount, type: tide.type, feet: tide.feet, name: tide.name });
      const struck = Math.max(0, Math.trunc(Number(done?.struck)) || 0);
      if (struck > 0 && tide.regain > 0) await actor.applyHealing(struck * tide.regain, { from: actor, feature: true, featureName: tide.name });
      lines.push(t("AZEROTH.DeathKnight.Talent.Tide", { name: actor.name, n: struck, talent: tide.name }));
    } catch (err) {
      ui.notifications?.warn(err.message);
    }
  }
  const frost = runicFrostFor(talents, { spent, marked: roundMarked(actor, DK_ROUND_MARKS.runicFrost) }, talentEffect);
  if (frost && await roundOnce(actor, DK_ROUND_MARKS.runicFrost)) {
    const { NEXT_SPELL_FLAG } = await import("../rules/casting.mjs");
    const fight = actor.activeFight?.() ?? null;
    const mine = combatantOf(actor);
    // *Before the end of your turn*: the fight's turn as it stands, or a round of the world's
    // clock out of one (`casting.mjs#pendingNextSpell`'s two shapes).
    const turn = mine && fight ? { combat: fight.id, round: fight.round, combatant: fight.combatant?.id ?? mine.id } : { clock: Math.trunc(Number(game.time?.worldTime) || 0) };
    const held = (actor.getFlag(SCOPE, NEXT_SPELL_FLAG) ?? []).filter(e => e?.source !== frost.source);
    await actor.setFlag(SCOPE, NEXT_SPELL_FLAG, [...held, { source: frost.source, name: frost.name, amount: frost.amount, schools: frost.schools, turn }]);
    lines.push(t("AZEROTH.DeathKnight.Talent.RunicFrost", { name: actor.name, n: frost.amount, talent: frost.name }));
  }
  for (const line of lines) ui.notifications?.info(line);
  return lines;
}

/* -------------------------------------------- */
/*  The attack and spell cards' Apply            */
/* -------------------------------------------- */

/**
 * **MARK OF BLOOD AND VENGEFUL BLOOD, WHEN AN ATTACK DAMAGES THE KNIGHT** (04): asked once the
 * card's Apply has landed the blow on the knight, on the active GM's client, which may write
 * both the knight and the attacker. Guarded: neither undoes the blow.
 *
 * @param {{message: ChatMessage, index: number, target: Actor, amount: number}} o
 */
export async function dkAfterAttackApply({ message, index = 0, target, amount = 0 } = {}) {
  if (target?.type !== "character" || !(Number(amount) > 0)) return null;
  const flags = message?.flags?.[SCOPE] ?? {};
  if (flags.kind !== "attack" || flags.parry || flags.notAttack || flags.retaliation) return null;
  const marks = (target.effects ?? []).some(e => e.flags?.[SCOPE]?.[DK_FLAGS.markOfBlood]);
  const vengeful = talentsOf(target).some(x => x.identifier === "vengeful-blood");
  if (!marks && !vengeful) return null;
  try {
    return await viaGM("struck", { knightUuid: target.uuid, messageUuid: message.uuid, index: Number(index) || 0, amount: Math.trunc(Number(amount)) || 0 });
  } catch (err) {
    console.warn("azeroth-rpg | Mark of Blood / Vengeful Blood", err);
    return null;
  }
}

/**
 * **CRIMSON COIL AND CHILL OF THE GRAVE, WHEN DEATH COIL DAMAGES A CREATURE** (04): the caster's
 * temporary Health equal to what the blow took, and the creature Slowed until the end of its
 * next turn, once the spell card's Apply has landed. Guarded.
 *
 * @param {{message: ChatMessage, target: Actor, amount: number}} o
 */
export async function dkAfterSpellApply({ message, target, amount = 0, index = 0 } = {}) {
  const flags = message?.flags?.[SCOPE] ?? {};
  if (flags.kind !== "spell" || !(Number(amount) > 0)) return null;
  // Death Coil by its identifier, or by the name the card was titled with.
  const coil = flags.identifier === "death-coil" || flags.spellName === "Death Coil" || flags.title === "Death Coil";
  if (!coil) return null;
  const caster = ChatMessage.getSpeakerActor?.(message.speaker) ?? null;
  if (caster?.type !== "character") return null;
  const talents = talentsOf(caster);
  const temps = dkTempFor(talents, { on: "coilDealt", dealt: amount }, talentEffect);
  const slow = coilSlowsFor(talents, talentEffect);
  if (!temps.length && !slow) return null;
  try {
    return await viaGM("coil", { casterUuid: caster.uuid, targetUuid: target.uuid, amount: Math.trunc(Number(amount)) || 0, messageUuid: message.uuid, index: Number(index) || 0 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}

/* -------------------------------------------- */
/*  The damage and healing doors                 */
/* -------------------------------------------- */

/** The knight's standing Icebound Fortitude, or null. */
export function iceboundOn(actor) {
  return (actor?.effects ?? []).find(e => e.active !== false && e.flags?.[SCOPE]?.[DK_FLAGS.icebound]) ?? null;
}

/**
 * **ICEBOUND FORTITUDE, IN THE BLOW** (04: *Once per encounter, as a Reaction when a blow damages
 * you, spend 1 Frost rune. That blow, and each blow until the end of your next turn, deals half
 * its damage to you, rounded down, before Armor Points and Ward apply*). Where it stands, the blow
 * is halved; where it does not, the knight is asked (through `effects/blow-doors.mjs`' ask, as
 * Borrowed Time is), and a yes pays the Reaction and the Frost rune through the one rune door,
 * strikes the encounter's use, and lays the state until the end of the knight's next turn.
 *
 * @param {Actor} target  the knight struck
 * @param {{amount: number, mitigation?: {input?: object}|null}} o
 * @returns {Promise<{amount: number, cut: number, asked: boolean}>}
 */
export async function iceboundInBlow(target, { amount = 0, mitigation = null, parts = null, wardTook = 0 } = {}) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  const out = { amount: n, cut: 0, asked: false, parts, wardTook };
  if (target?.type !== "character" || n <= 0) return out;
  let standing = iceboundOn(target);
  if (!standing) {
    const feature = (target.items ?? []).find(i => i.type === "feature" && i.name === "Icebound Fortitude" && i.getFlag?.(SCOPE, "feature")?.talentId);
    if (!feature || !(Number(feature.system?.uses?.value) > 0)) return out;
    if ((target.system?.runes?.frost?.value ?? 0) < 1) return out;
    const { askIcebound } = await import("./blow-doors.mjs");
    out.asked = true;
    const answer = await askIcebound({ target, amount: n, feature });
    if (!answer?.yes) return out;
    standing = iceboundOn(target);
  }
  if (!standing) return out;
  // **THE RECORD, AND EVERY STEP IT WENT THROUGH** (O-362; run close-F2): the resolver's inputs
  // with the Shrink Ray's reduction and, on a blow moved or shared onto this knight, the move,
  // the share or the division after them (`rules/blow-doors.mjs#resolveRecord`) - so the halving
  // lands before the Armor Points and Ward that met the blow on every door that carries one.
  const { recordOf, resolveRecord } = await import("../rules/blow-records.mjs");
  const record = recordOf(mitigation);
  const blow = iceboundBlow({ amount: n, input: record?.input ?? null, resolve: record ? (input => resolveRecord(record, input)) : null, parts, wardTook });
  const cut = blow.cut;
  if (cut > 0) ui.notifications?.info(t("AZEROTH.DeathKnight.Talent.IceboundCut", { name: target.name, n: cut, talent: standing.name }));
  return { amount: n - cut, cut, asked: out.asked, parts: blow.parts, wardTook: blow.wardTook };
}

/**
 * The knight's own client, where the ask lands: the Reaction, the Frost rune through the one rune
 * door, the encounter's use, and the state - in that order, each refused in words.
 */
export async function iceboundHere(target, feature) {
  if (!target?.isOwner || !feature) return { yes: false, reason: "notYours" };
  if (!(Number(feature.system?.uses?.value) > 0)) return { yes: false, reason: "noUses" };
  // The Reaction is spent INSIDE the rune door (`before`), after its fresh judgement and before
  // its write (the F4a review, S5): a refused rune spends no Reaction, and a refused Reaction
  // spends no rune.
  const { spendRunesOn } = await import("../documents/runes.mjs");
  const paid = await spendRunesOn(target, { kind: "frost", count: 1,
    before: () => game.system.azeroth.workflows.spendTurnBudget(target, "reaction") });
  if (!paid.ok) return { yes: false, reason: paid.refusal === "budget" ? "reaction" : "runes" };
  await feature.update({ "system.uses.value": Math.max(0, (Number(feature.system?.uses?.value) || 0) - 1) });
  const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
  await target.createEmbeddedDocuments("ActiveEffect", [{
    name: feature.name, img: feature.img || "icons/magic/water/barrier-ice-shield.webp", origin: target.uuid,
    description: feature.system?.description ?? "", showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    ...(untilEndOfNextTurnOrRound(target) ?? {}),
    flags: { [SCOPE]: { [DK_FLAGS.icebound]: { name: feature.name } } }
  }]);
  return { yes: true };
}

/**
 * **VAMPIRIC BLOOD'S RAISE** (04: *Each time you regain Health, you regain 1 additional Health per
 * rank, for 1 minute*): what a heal on this character adds while the state stands.
 */
export function dkHealBonus(target, amount = 0) {
  const states = (target?.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.[SCOPE]?.[DK_FLAGS.vampiric]).filter(Boolean);
  return vampiricAdd(states, amount);
}

/* -------------------------------------------- */
/*  The attack door                              */
/* -------------------------------------------- */

/**
 * **WHAT A DEATH KNIGHT'S HIT ADDS** (04's Frozen Edge and Grim Harvest), read at `rollTest` once
 * the die is in: Frozen Edge's Frost as its own amount (a fired row's `extraType`), and Grim
 * Harvest's Health, landed now through the one healing door.
 *
 * **AND THE GRIP ALTERNATES** (D-1017), each behind its own gate: Grim Harvest's Off-Hand Attack
 * heal; Frozen Edge's Slowed on the turn's first melee hit in two hands (the turn's mark through
 * the combatant's queued door, landed through the one condition door and recorded for a Parry to
 * take back); Relentless Advance's Frost on an Opportunity Attack; Killing Machine's Runic Power
 * once a round (the pool door naming `killingMachine`) and its Critical Injury at rank 2 (a row
 * the card's `criticalInjury` reads); and Vengeful Blood's riposte's Shadow, read again off the
 * knight's row.
 *
 * @param {{actor: Actor, hit: boolean, melee: boolean, first?: object|null, secondRoll?: boolean,
 *   offHand?: boolean, opportunity?: boolean, sl?: number, riposte?: boolean, list?: object[],
 *   recordLanding?: Function|null, recordBuilt?: Function|null, onceMarked?: string[]|null}} o
 *   `first` the first target's snapshot; `list` every target the card records; the three
 *   recorders are the attack door's own, so a withdrawn hit takes back what this one laid
 * @returns {Promise<Array<object>>}  the fired rows
 */
export async function dkOnHit({ actor, hit = false, melee = false, first = null, secondRoll = false, offHand = false, opportunity = false, sl = 0, riposte = false, list = [], recordLanding = null, recordBuilt = null, onceMarked = null } = {}) {
  const rows = [];
  if (actor?.type !== "character" || !hit) return rows;
  const talents = talentsOf(actor);
  if (!talents.some(x => x.className === DK_CLASS_NAME)) return rows;
  const gate = gateOf(actor, first, { melee });
  const { frozenEdgeFor, harvestFor } = await import("../rules/death-knight-talents.mjs");
  const edge = frozenEdgeFor(talents, { hit, gate }, talentEffect);
  if (edge) rows.push({ key: "talent", name: edge.name, text: t("AZEROTH.DeathKnight.Talent.FrozenEdge", { n: edge.amount, talent: edge.name }), extraDamage: edge.amount, extraType: edge.type });
  // *When your melee attack hits*: the Attack's own, ridden by its first roll alone - Extra
  // Attack's second roll and the Dancing Runeweapon's are the same Attack (D-704; Earthliving's
  // rule, D-774). Frozen Edge's *melee hits* take each roll that hits. The Off-Hand Attack's own
  // heal (D-1017) rides the Off-Hand Attack's roll, never the Dancing Runeweapon's beside it.
  const harvest = secondRoll ? null : harvestFor(talents, { hit, health: first?.health ?? null, gate, offHand }, talentEffect);
  if (harvest) {
    const before = actor.system?.health?.value ?? 0;
    await actor.applyHealing(harvest.amount, { from: actor, feature: true, featureName: harvest.name });
    rows.push({ key: "talent", name: harvest.name, text: t("AZEROTH.DeathKnight.Talent.Harvest", { name: actor.name, n: Math.max(0, (actor.system?.health?.value ?? before) - before), talent: harvest.name }) });
  }
  // **FROZEN EDGE IN TWO HANDS** (D-1017): the turn's first melee hit Slows the creature.
  const slowRow = await frozenEdgeSlowOnHit({ actor, talents, gate, list, recordLanding, onceMarked });
  if (slowRow) rows.push(slowRow);
  // **RELENTLESS ADVANCE IN TWO HANDS** (D-1017, rank 2): an Opportunity Attack's hit adds the tier in Frost.
  if (opportunity === true) {
    const two = relentlessTwoHandFor(talents, { gate, tier: actor.system?.tier ?? 1 }, talentEffect);
    if (two?.damage > 0) rows.push({ key: "talent", name: two.name, text: t("AZEROTH.DeathKnight.Talent.RelentlessFrost", { n: two.damage, talent: two.name }), extraDamage: two.damage, extraType: two.type });
  }
  // **KILLING MACHINE IN TWO HANDS** (D-1017, O-398's C): a melee hit at SL 2 or more gives Runic Power,
  // and at rank 2 one on a Slowed creature inflicts a Critical Injury.
  const machine = killingMachineHitFor(talents, { hit, sl, gate, marked: roundMarked(actor, DK_ROUND_MARKS.killingMachine) }, talentEffect);
  if (machine?.gain > 0 && await roundOnce(actor, DK_ROUND_MARKS.killingMachine)) {
    const gained = await gainKillingMachine(actor, machine.gain);
    if (gained) {
      recordBuilt?.(actor, [gained]);
      if (combatantOf(actor)) onceMarked?.push(DK_ROUND_MARKS.killingMachine);
    }
    rows.push({ key: "talent", name: machine.name, text: t(gained ? "AZEROTH.DeathKnight.Talent.MachineGain" : "AZEROTH.DeathKnight.Talent.MachineFull", { name: actor.name, n: gained?.gained ?? 0, talent: machine.name }) });
  }
  if (machine?.critical) rows.push({ key: "talent", name: machine.name, text: t("AZEROTH.DeathKnight.Talent.MachineCritical", { talent: machine.name }), criticalInjury: true });
  // **VENGEFUL BLOOD'S RIPOSTE** (D-1017: *on a hit it deals additional Shadow damage equal to your
  // rank*): the knight's own row at its rank, never a number the press carried.
  if (riposte === true && offHand === true) {
    const back = riposteDamageFor(talents, talentEffect);
    if (back) rows.push({ key: "talent", name: back.name, text: t("AZEROTH.DeathKnight.Talent.RiposteShadow", { n: back.amount, talent: back.name }), extraDamage: back.amount, extraType: back.type });
  }
  return rows;
}

/**
 * **FROZEN EDGE'S SLOWED, LANDED** (D-1017: *your first melee hit each turn makes the creature
 * Slowed until the end of its next turn*): judged whole first - the grip, the turn's mark, a GM for
 * a creature this client does not own - then the turn marked through the combatant's queued door
 * (`turnMark`; out of a fight there is no turn to mark), then the Slowed laid on every creature the
 * card records through the one condition door and recorded for a Parry to take back. The row, or
 * null where nothing was asked.
 */
async function frozenEdgeSlowOnHit({ actor, talents, gate, list = [], recordLanding = null, onceMarked = null } = {}) {
  const mine = combatantOf(actor);
  const fight = mine?.parent ?? mine?.combat ?? null;
  const record = mine?.getFlag?.(SCOPE, "round") ?? null;
  const used = mine && record?.number === fight?.round ? (record.once ?? []) : [];
  const mark = mine ? turnMark(DK_ROUND_MARKS.frozenEdge, fight?.turn, used) : null;
  const slows = frozenEdgeSlowsFor(talents, { hit: true, gate, marked: Boolean(mine) && !mark }, talentEffect);
  if (!slows || !(list ?? []).length) return null;
  const { targetActorOf } = await import("../dice/annotate.mjs");
  const victims = list.map((tg, index) => ({ index, tg, victim: targetActorOf(tg) })).filter(v => v.victim);
  if (!victims.length) return null;
  const condition = game.i18n.localize(CONFIG.AZEROTH?.conditions?.[slows.condition] ?? slows.condition);
  // A creature another client owns is written on the GM's client: with none online, said in words
  // before the turn's mark is spent (`rules/gm-writes.mjs#gmAbsentFor`).
  if (gmAbsentFor({ owned: victims.map(v => v.victim.isOwner === true), isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) {
    return { key: "talent", name: slows.name, text: t("AZEROTH.DeathKnight.Talent.EdgeNoGM", { talent: slows.name, condition }) };
  }
  if (mine) {
    if (!mine.isOwner || (await mine.markRoundOnce(mark))?.added !== true) return null;
    onceMarked?.push(mark);
  }
  const { inflictCondition } = await import("./inflict.mjs");
  const { landedText } = await import("../helpers/rider-words.mjs");
  const said = [];
  for (const { index, tg, victim } of victims) {
    const landing = await inflictCondition({ victim, id: slows.condition, by: actor, name: tg?.name ?? victim.name, until: slows.until });
    if (typeof recordLanding === "function") recordLanding(index, landing);
    said.push(landedText(landing));
  }
  return { key: "talent", name: slows.name, text: t("AZEROTH.DeathKnight.Talent.EdgeSlowed", { talent: slows.name, landed: said.join(" ") }) };
}

/**
 * **KILLING MACHINE'S RUNIC POWER** (D-1017), through the pool door naming `killingMachine`
 * (`rules/runes.mjs#RUNIC_GAIN_SOURCES`), never past the pool's top. The gain as the attack door
 * records what a hit built (`{itemId, kind, name, gained}`), or null where nothing rose.
 */
async function gainKillingMachine(actor, amount = 0) {
  const pool = (actor?.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === RUNIC_POWER) ?? null;
  if (!pool) return null;
  const now = Math.max(0, Math.trunc(Number(pool.value)) || 0);
  const value = Math.min(Math.max(0, Math.trunc(Number(pool.max)) || 0), now + Math.max(0, Math.trunc(Number(amount)) || 0));
  if (value <= now) return null;
  await actor.updatePool({ itemId: pool.itemId ?? null, kind: pool.kind, value }, {}, { runicGain: "killingMachine" });
  const after = Math.max(0, Math.trunc(Number((actor.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === RUNIC_POWER)?.value)) || 0);
  const gained = Math.max(0, after - now);
  return gained > 0 ? { itemId: pool.itemId ?? null, kind: pool.kind, name: pool.name, gained } : null;
}

/**
 * **BLOOD SHIELD** (04: *When **Death Strike** restores your Health, you gain temporary Health
 * equal to twice your rank until the end of the encounter*): asked where Death Strike's heal
 * lands, with what it restored.
 */
export async function bloodShieldAfter(actor, restored = 0) {
  if (!(Number(restored) > 0)) return [];
  const lines = [];
  for (const g of dkTempFor(talentsOf(actor), { on: "deathStrike" }, talentEffect)) {
    const done = await actor.grantTemporaryHealth(g.amount, { source: g.name, span: g.span });
    if (done?.landed) lines.push(t("AZEROTH.DeathKnight.Talent.Shield", { name: actor.name, n: g.amount, talent: g.name }));
  }
  return lines;
}

/** Whether the knight's Dancing Runeweapon stands, and its share. */
export function dancingOn(actor) {
  const e = (actor?.effects ?? []).find(x => x.active !== false && x.flags?.[SCOPE]?.[DK_FLAGS.dancing]);
  if (!e) return null;
  const f = e.flags[SCOPE][DK_FLAGS.dancing];
  // The off-hand grip's share (D-1017); a state laid before it carried none heals the whole.
  return { name: f.name ?? e.name, heal: Number(f.heal) || 0.5, offHandHeal: Number(f.offHandHeal) || 1 };
}

/** The Health a Dancing Runeweapon's card gives back at its Apply: half of what it took. */
export async function dancingAfterApply({ message, amount = 0, index = 0 } = {}) {
  const flags = message?.flags?.[SCOPE] ?? {};
  if (!flags.dancingRuneweapon || !(Number(amount) > 0)) return null;
  const knight = ChatMessage.getSpeakerActor?.(message.speaker) ?? null;
  if (knight?.type !== "character") return null;
  const n = dancingHeal(amount, Number(flags.dancingRuneweapon.heal) || 0.5);
  if (!n) return null;
  try {
    return await viaGM("dancing", { knightUuid: knight.uuid, amount: n, name: flags.dancingRuneweapon.name ?? "", messageUuid: message.uuid, index: Number(index) || 0 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}

/* -------------------------------------------- */
/*  The Disengage door                           */
/* -------------------------------------------- */

/**
 * **RELENTLESS ADVANCE** (04: *A **Slowed** creature within your reach cannot **Disengage***): the
 * first knight on the scene who bars this creature's Disengage, or null.
 *
 * @param {Actor} actor  the creature about to Disengage
 */
export async function relentlessBars(actor) {
  if (!actor?.statuses?.has?.("slowed")) return null;
  const own = tokenOn(actor);
  if (!own) return null;
  const { feetApart } = await import("../canvas/footprints.mjs");
  const knights = [];
  for (const tk of own.parent?.tokens ?? []) {
    const k = tk.actor;
    if (!k || k === actor || k.type !== "character") continue;
    const row = relentlessFor(talentsOf(k), { gate: gateOf(k) }, talentEffect);
    if (!row) continue;
    const feet = feetApart(tk, own);
    const reach = reachHeld(k.readyWeapons?.() ?? []);
    knights.push({ name: k.name, talent: row.name, bars: row.noDisengage, withinReach: typeof feet === "number" ? feet <= reach + 1e-6 : null });
  }
  return disengageBarredByKnight({ slowed: true, knights });
}

/**
 * **RELENTLESS ADVANCE'S OFF HAND** (04: *At rank 2, while you wield a one-handed weapon in each
 * hand, your Opportunity Attack includes your **Off-Hand Attack***): the off-hand weapon the
 * Opportunity Attack also swings, where the rank and the gate hold - or null.
 *
 * @param {Actor} actor
 * @param {Item} swung  the weapon the Opportunity Attack was made with
 */
export function relentlessOffHand(actor, swung = null) {
  const row = relentlessFor(talentsOf(actor), { gate: gateOf(actor) }, talentEffect);
  if (!row?.offHand) return null;
  return (actor.readyWeapons?.() ?? []).find(w => w && w !== swung && w.id !== swung?.id && w.system?.offHand === true) ?? null;
}

/**
 * **RELENTLESS ADVANCE'S REACH IN TWO HANDS** (04 at rank 2, D-1017: *your Opportunity Attacks
 * reach 5 feet further*): the feet a knight's Opportunity Attack reaches past its own reach, read
 * now off what is in hand - 0 where the rank, the talent or the grip is not there. Synchronous, so
 * the movement's offer (`AzerothCombatant#opportunities`) asks it inside its own measure.
 *
 * @param {Actor} actor
 * @returns {number}
 */
export function relentlessOpportunityReach(actor) {
  if (actor?.type !== "character") return 0;
  return relentlessTwoHandFor(talentsOf(actor), { gate: gateOf(actor), tier: actor.system?.tier ?? 1 }, talentEffect)?.reach ?? 0;
}

/* -------------------------------------------- */
/*  Vengeful Blood's riposte                     */
/* -------------------------------------------- */

/** Vengeful Blood's offer card (`templates/chat/vengeful-offer.hbs`). */
const VENGEFUL_TEMPLATE = "systems/azeroth-rpg/templates/chat/vengeful-offer.hbs";

/** The knight's off-hand weapon, out of what it fights with now (`readyWeapons`, D-769), or null. */
function offHandWeaponOf(actor) {
  return (actor?.readyWeapons?.() ?? []).find(w => w?.type === "weapon" && w.system?.offHand === true) ?? null;
}

/**
 * The knight's Reaction and the round's Off-Hand Attack, judged together as the attack door will
 * spend them - through the ONE up-front judgement every door asks (`workflows.turnBudgetRefusal`,
 * with the attack it prices; the close review's finding 8), never a second call of `spend`: every
 * bar `spendAction` asks (Ice Block, the reaction bars, a sleep, a Spirit, the shared turn) is
 * asked here too, and comes back as `barred`.
 */
function riposteBudget(knight) {
  const refusal = game.system.azeroth.workflows.turnBudgetRefusal?.(knight, "reaction", { isAttack: true, isOffHand: true }) ?? null;
  return riposteBudgetOf(refusal);
}

/**
 * **THE RIPOSTE'S OFFER** (D-1017; D-779's shape), posted from the GM's handler once the blow has
 * landed: a card whispered to the knight's owners and the GM, its row carrying the knight
 * (`data-reaction-owner`) so only they see the button. Nothing is spent here and nothing is
 * marked; a riposte already closed (no Reaction, the round's Off-Hand Attack made, no off-hand
 * weapon) is offered nothing. Answers whether a card was posted.
 *
 * @param {{knight: Actor, attacker: Actor, attackerToken?: TokenDocument|null, riposte: object, messageUuid: string}} o
 * @returns {Promise<boolean>}
 */
export async function offerVengefulRiposte({ knight, attacker, attackerToken = null, riposte, messageUuid = null } = {}) {
  if (!knight || !attacker || !riposte || !offHandWeaponOf(knight) || roundMarked(knight, DK_ROUND_MARKS.vengeful)) return false;
  const budget = riposteBudget(knight);
  if (!budget.offHandLeft || !budget.reactionLeft || budget.barred) return false;
  const owners = (game.users?.contents ?? []).filter(u => knight.testUserPermission?.(u, "OWNER")).map(u => u.id);
  const words = { holder: knight.name, name: attackerToken?.name ?? attacker.name, talent: riposte.name, n: riposte.amount };
  const content = await foundry.applications.handlebars.renderTemplate(VENGEFUL_TEMPLATE, {
    name: riposte.name, text: t("AZEROTH.DeathKnight.Talent.Riposte.Offer", words), label: t("AZEROTH.DeathKnight.Talent.Riposte.Press", words),
    holderUuid: knight.uuid, targetUuid: attackerToken?.uuid ?? attacker.uuid
  });
  const fight = knight.activeFight?.() ?? null;
  const at = offerMoment({ combatId: fight?.id ?? null, round: fight?.round ?? null, turn: fight?.turn ?? null, time: game.time?.worldTime ?? 0 });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: knight }), content, whisper: owners,
    flags: { [SCOPE]: { kind: VENGEFUL_OFFER_KIND, holder: knight.uuid, target: attackerToken?.uuid ?? attacker.uuid, answers: messageUuid, at } }
  });
  return true;
}

/**
 * **THE RIPOSTE, PRESSED** (D-1017; D-768's order): the knight - owned here, the row's own
 * audience - judged whole before anything is spent: the offer still standing, the talent held, the
 * grip, an off-hand weapon, the attacker on the board and within reach, the round's mark, the
 * round's Off-Hand Attack and the Reaction. Then the Off-Hand Attack at the attacker, the
 * Reaction's price handed to the attack door (`budget: "reaction"`, `vengeful`), which spends the
 * Reaction and the round's Off-Hand Attack at the roll - so a dialog put away spends nothing - and
 * the round marked once the card exists. Refused in words.
 *
 * @param {HTMLElement} button
 * @returns {Promise<ChatMessage|null>}
 */
export async function vengefulRiposteFromCard(button) {
  const knight = docAt(button?.dataset?.holderUuid);
  const messageId = button?.closest?.("[data-message-id]")?.dataset?.messageId ?? null;
  const offer = messageId ? (game.messages?.get(messageId) ?? null) : null;
  const flags = offer?.flags?.[SCOPE] ?? {};
  const targetDoc = docAt(button?.dataset?.targetUuid ?? flags.target);
  const token = targetDoc?.documentName === "Token" ? targetDoc : null;
  const attacker = token?.actor ?? (targetDoc?.documentName === "Actor" ? targetDoc : null);
  const talents = talentsOf(knight);
  const back = riposteDamageFor(talents, talentEffect);
  const off = offHandWeaponOf(knight);
  const own = tokenOn(knight, token?.parent ?? canvas?.scene ?? null);
  const { feetApart } = await import("../canvas/footprints.mjs");
  const feet = own && token ? feetApart(own, token) : null;
  const reach = reachHeld(knight?.readyWeapons?.() ?? []);
  const { offerStillStands } = await import("./chromatic-flights.mjs");
  const { barred = null, ...budget } = knight ? riposteBudget(knight) : { offHandLeft: false, reactionLeft: false };
  const refused = riposteRefusal({
    owned: knight?.documentName === "Actor" && knight.isOwner === true,
    stands: flags.kind === VENGEFUL_OFFER_KIND && flags.holder === knight?.uuid && offerStillStands(flags.at ?? null),
    held: Boolean(back),
    grip: gateOf(knight)({ wields: ["oneInEach"] }) === true,
    offWeapon: Boolean(off),
    attacker: Boolean(attacker) && (!token || Boolean(token.parent?.tokens?.has?.(token.id))),
    withinReach: typeof feet === "number" ? feet <= reach + 1e-6 : null,
    marked: roundMarked(knight, DK_ROUND_MARKS.vengeful),
    ...budget
  });
  // And whatever bars a Reaction outright (a Spirit, Ice Block, a sleep), in its own words: the
  // same judgement `riposteBudget` asked, kept whole (`riposteBudgetOf`).
  if (refused || barred) {
    if (refused) ui.notifications?.warn(t(`AZEROTH.DeathKnight.Talent.Riposte.Refuse.${refused}`, { name: knight?.name ?? "", target: token?.name ?? attacker?.name ?? "", talent: back?.name ?? "" }));
    else ui.notifications?.warn(game.i18n.format(barred.reason, barred.params ?? {}));
    return null;
  }
  // The attacker targeted for the roll, and the presser's own targets put back after.
  const previous = [...(game.user?.targets ?? [])].map(tk => tk.id);
  const onCanvas = Boolean(token && canvas?.scene?.id === token.parent?.id);
  if (onCanvas) canvas.tokens.setTargets([token.id]);
  try {
    const { attackWithDialog } = await import("../applications/actions.mjs");
    const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
    const targets = token ? targetSnapshots([token.object ?? { id: token.id, name: token.name, actor: token.actor, scene: token.parent }]) : null;
    const card = await attackWithDialog(knight, off, null, { offHand: true, budget: "reaction", vengeful: { name: back.name }, atDistance: feet ?? null, ...(targets?.length ? { targets } : {}) });
    if (card) await roundOnce(knight, DK_ROUND_MARKS.vengeful);
    return card ?? null;
  } finally {
    if (onCanvas && canvas?.scene?.id === token.parent?.id) canvas.tokens.setTargets(previous);
  }
}

/* -------------------------------------------- */
/*  The turn's start                             */
/* -------------------------------------------- */

/**
 * **REMORSELESS WINTER AND FROZEN DESECRATION AT A TURN'S START** (04), on the active GM's client
 * beside the area ticks (`AzerothCombat`): each knight on the scene whose winter stands, and each
 * whose Desecration a Frozen Desecration patch slows, asked about the creature whose turn starts.
 *
 * @param {Combatant} combatant
 * @returns {Promise<string[]>}
 */
export async function dkTurnStart(combatant) {
  const lines = [];
  const actor = combatant?.actor ?? null;
  const token = combatant?.token ?? null;
  const scene = token?.parent ?? null;
  if (!actor || !token || !scene || combatant.isDefeated) return lines;
  const { feetApart } = await import("../canvas/footprints.mjs");
  const { relationTo, strikeFromArea, postSplashTest } = await import("./area-strikes.mjs");
  const { applyCondition } = await import("./durations.mjs");
  for (const tk of scene.tokens ?? []) {
    const knight = tk.actor;
    if (!knight || knight === actor || knight.type !== "character") continue;
    const enemy = relationTo({ caster: knight, casterToken: tk, actor, token }) === "enemy";
    if (!enemy) continue;
    // Remorseless Winter: a state on the knight, a circle around its token.
    const w = (knight.effects ?? []).find(e => e.active !== false && e.flags?.[SCOPE]?.[DK_FLAGS.winter])?.flags[SCOPE][DK_FLAGS.winter] ?? null;
    if (w) {
      const feet = feetApart(tk, token);
      const o = winterOutcome({ enemy, inside: typeof feet === "number" && feet <= (Number(w.feet) || 15) + 1e-6, slowed: actor.statuses?.has?.("slowed") === true, tier: w.tier ?? knight.system?.tier ?? 1 });
      if (o?.damage) {
        for (const line of await strikeFromArea({ actor, caster: knight, spell: { name: w.name ?? "", school: null, item: true }, damage: { rating: o.damage, school: "frost" } })) lines.push(line);
      }
      if (o?.slow) {
        await applyCondition(actor, "slowed", { until: "endOfTurn" });
        lines.push(t("AZEROTH.DeathKnight.Talent.WinterSlowed", { name: actor.name, talent: w.name ?? "" }));
      }
      if (o?.test) {
        const check = { on: "turn", resilience: "body", where: "", gate: "", exempt: "", fail: { rating: null, school: null, statuses: ["entangled"], bane: "", until: "endOfTurn", lose: false, kinds: [] }, success: { statuses: [], until: "" } };
        await postSplashTest({ actor, token, check, caster: knight, spell: { name: w.name ?? "", school: null, feature: true }, dc: w.dc ?? knight.system?.spellDC ?? null, around: knight.name, feet: w.feet });
        lines.push(t("AZEROTH.DeathKnight.Talent.WinterTest", { name: actor.name, talent: w.name ?? "" }));
      }
    }
    // Frozen Desecration: the knight's Desecration Regions that hold this creature.
    const slows = desecrationSlowsBy(patchRowsOf(talentsOf(knight), DESECRATION.feature, talentEffect));
    if (slows) {
      const regions = (scene.regions ?? []).filter(r => r.flags?.[SCOPE]?.featureKey === DESECRATION.key && r.flags?.[SCOPE]?.caster === knight.uuid);
      const inside = regions.some(r => {
        try { return token.testInsideRegion(r); } catch { return false; }
      });
      if (inside && !(actor.system?.immune ?? []).includes(DESECRATION.school)) {
        await applyCondition(actor, slows.condition, { until: slows.until });
        lines.push(t("AZEROTH.DeathKnight.Talent.DesecrationSlowed", { name: actor.name, talent: slows.name }));
      }
    }
  }
  return lines;
}

/* -------------------------------------------- */
/*  The Plague's landings                        */
/* -------------------------------------------- */

/** Black Ice's Frost on a Frost Fever, read through the Plague's patch at the knight's rank. */
export async function feverAdd(knight) {
  const { feverAddFor } = await import("../rules/death-knight-talents.mjs");
  return feverAddFor(patchRowsOf(talentsOf(knight), PLAGUE.feature, talentEffect)).add;
}

/**
 * **SANGUINE PLAGUE** (04: *When your **Blood Plague** damages a creature, you immediately regain
 * Health equal to the damage it dealt*): the knight healed in the same moment, by its own
 * talent, where the tick lands (the active GM's client, which may write the knight).
 */
export async function sanguinePlagueAfter(knight, dealt = 0) {
  if (knight?.type !== "character" || !(Number(dealt) > 0)) return null;
  const by = plagueHealsBy(patchRowsOf(talentsOf(knight), PLAGUE.feature, talentEffect));
  if (!by) return null;
  const before = knight.system?.health?.value ?? 0;
  await knight.applyHealing(Math.trunc(Number(dealt)), { from: knight, feature: true, featureName: by });
  return t("AZEROTH.DeathKnight.Talent.SanguinePlague", { name: knight.name, n: Math.max(0, (knight.system?.health?.value ?? before) - before), talent: by });
}

/** Icy Grip's Slowed on a creature Death Grip pulled. */
export async function gripPulled({ victim, knight } = {}) {
  if (!victim || knight?.type !== "character") return null;
  const slows = gripSlowsBy(patchRowsOf(talentsOf(knight), "Death Grip", talentEffect));
  if (!slows) return null;
  const { inflictCondition } = await import("./inflict.mjs");
  const landed = await inflictCondition({ victim, id: slows.condition, by: knight, until: slows.until, name: victim.name });
  return landed?.landed ? t("AZEROTH.DeathKnight.Talent.GripSlowed", { name: victim.name, talent: slows.name }) : null;
}

/* -------------------------------------------- */
/*  The GM's handler                             */
/* -------------------------------------------- */

/**
 * **EVERY WRITE ON A CREATURE THIS CLIENT DOES NOT OWN** (`DK_TALENT_QUERY`), on the active GM's
 * client. The asker must own the knight; everything is judged again here off the world as it
 * stands, never trusted off the payload. Throws with the reason.
 */
export async function dkTalentQueryHandler(payload = {}, { user = null } = {}) {
  const knight = docAt(payload.knightUuid ?? payload.casterUuid ?? null);
  if (knight?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  // Every act is the knight's own, save the blow on the knight: the attack card's Apply is
  // pressed by whoever may apply it - the knight's owner, or the card's author.
  const authored = payload.act === "struck" && user && docAt(payload.messageUuid)?.author?.id === user.id;
  if (user && !user.isGM && !authored && !knight.testUserPermission(user, "OWNER")) throw new Error(t("AZEROTH.Reaction.Refuse.NotYours", { name: knight.name }));
  const talents = talentsOf(knight);
  if (payload.act === "tide") {
    // **RE-JUDGED HERE** (the F4a review, S4): nothing about the tide is taken off the payload.
    // A Blood rune must stand spent on the knight's weapons now, and in a started fight the
    // round's mark must have been spent by the knight's own door - and this client answers a
    // knight's tide once a round, so a query sent twice strikes once.
    if (!((knight.system?.runes?.blood?.value ?? 0) < (knight.system?.runes?.blood?.max ?? 0))) return { struck: 0 };
    const fight = knight.activeFight?.() ?? null;
    if (combatantOf(knight)) {
      if (!roundMarked(knight, DK_ROUND_MARKS.tide)) return { struck: 0 };
      const once = `${knight.uuid}:${fight?.id ?? ""}:${fight?.round ?? 0}`;
      if (TIDES_ANSWERED.has(once)) return { struck: 0 };
      TIDES_ANSWERED.add(once);
      if (TIDES_ANSWERED.size > 200) TIDES_ANSWERED.delete(TIDES_ANSWERED.values().next().value);
    }
    const tide = tideFor(talents, { spent: [{ kind: "blood" }] }, talentEffect);
    if (!tide) return { struck: 0 };
    const own = tokenOn(knight);
    if (!own) return { struck: 0 };
    const { feetApart } = await import("../canvas/footprints.mjs");
    const { relationTo, strikeFromArea } = await import("./area-strikes.mjs");
    let struck = 0;
    for (const tk of own.parent?.tokens ?? []) {
      const a = tk.actor;
      if (!a || tk === own || tk.hidden) continue;
      // A defeated creature is no enemy (`rules/distance.mjs#countsAsEnemy`; the F4a review, N4).
      const down = tk.combatant?.isDefeated === true || a.statuses?.has?.(CONFIG.specialStatusEffects?.DEFEATED ?? "dead") === true
        || (a.type === "npc" && (Number(a.system?.health?.value) || 0) <= 0);
      if (down) continue;
      const feet = feetApart(own, tk);
      if (!(typeof feet === "number" && feet <= tide.feet + 1e-6)) continue;
      if (relationTo({ caster: knight, casterToken: own, actor: a, token: tk }) !== "enemy") continue;
      const outcome = {};
      await strikeFromArea({ actor: a, caster: knight, spell: { name: tide.name, school: null, item: true }, damage: { rating: tide.amount, school: tide.type }, damageOutcome: outcome });
      if ((Number(outcome.amount) || 0) > 0) struck += 1;
    }
    return { struck };
  }
  if (payload.act === "struck") {
    const message = docAt(payload.messageUuid);
    const flags = message?.flags?.[SCOPE] ?? {};
    if (message?.documentName !== "ChatMessage" || flags.kind !== "attack" || flags.parry || flags.notAttack || flags.retaliation) return { ok: false };
    const attacker = ChatMessage.getSpeakerActor?.(message.speaker) ?? null;
    if (!attacker) return { ok: false };
    const out = { ok: true, healed: 0, retaliated: 0 };
    // The row must be the knight's, and the amount no more than the card recorded (S4).
    const { targetActorOf } = await import("../dice/annotate.mjs");
    const index = Math.trunc(Number(payload.index)) || 0;
    const rowActor = targetActorOf(flags.targets?.[index] ?? null);
    if (!rowActor || (rowActor !== knight && rowActor.id !== knight.id)) return { ok: false };
    const amount = clampToCard(payload.amount, flags, index);
    // Mark of Blood: the knight's marks naming this attacker.
    const marks = (knight.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.[SCOPE]?.[DK_FLAGS.markOfBlood]).filter(Boolean)
      .filter(m => m.actorUuid === attacker.uuid || (m.tokenId && attacker.token?.id === m.tokenId)).map(m => ({ ...m, by: knight.uuid }));
    const heal = markOfBloodHeal(marks, { knightUuid: knight.uuid, attack: true, damaged: amount });
    if (heal) {
      const before = knight.system?.health?.value ?? 0;
      await knight.applyHealing(heal.heal, { from: knight, feature: true, featureName: heal.name });
      out.healed = Math.max(0, (knight.system?.health?.value ?? before) - before);
    }
    // Vengeful Blood: a melee attack from within the knight's reach, once a round.
    const melee = flags.strike?.rangeKind === "melee";
    const kTok = tokenOn(knight, message.speaker?.scene ? game.scenes.get(message.speaker.scene) : canvas?.scene);
    const aTok = tokenOn(attacker, kTok?.parent ?? null);
    const { feetApart } = await import("../canvas/footprints.mjs");
    const feet = kTok && aTok ? feetApart(kTok, aTok) : null;
    const reach = reachHeld(knight.readyWeapons?.() ?? []);
    const back = vengefulFor(talents, { melee, damaged: amount, withinReach: typeof feet === "number" ? feet <= reach + 1e-6 : null, gate: gateOf(knight) }, talentEffect);
    if (back && await roundOnce(knight, DK_ROUND_MARKS.vengeful)) {
      const { strikeFromArea } = await import("./area-strikes.mjs");
      const outcome = {};
      const lines = await strikeFromArea({ actor: attacker, caster: knight, spell: { name: back.name, school: null, item: true }, damage: { rating: back.amount, school: back.type }, damageOutcome: outcome });
      out.retaliated = Math.max(0, Math.trunc(Number(outcome.amount)) || 0);
      if (lines.length) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: knight }), content: lines.map(l => `<p class="azeroth-drain">${l}</p>`).join(""), flags: { [SCOPE]: { kind: "tick" } } });
    }
    // **THE RIPOSTE, OFFERED** (D-1017): in two one-handers the same blow offers the knight's owner
    // its Off-Hand Attack against the attacker as a Reaction - a card, judged whole at the press.
    const riposte = vengefulRiposteFor(talents, { melee, damaged: amount, withinReach: typeof feet === "number" ? feet <= reach + 1e-6 : null, gate: gateOf(knight) }, talentEffect);
    if (riposte) out.offered = await offerVengefulRiposte({ knight, attacker, attackerToken: aTok, riposte, messageUuid: message.uuid });
    if (out.healed > 0) ui.notifications?.info(t("AZEROTH.DeathKnight.Talent.MarkHealed", { name: knight.name, n: out.healed, talent: heal.name }));
    return out;
  }
  if (payload.act === "coil") {
    const target = docAt(payload.targetUuid);
    // The card is Death Coil's, cast by this knight, and its row names the target; the amount is
    // no more than that row recorded (the F4a review, S4).
    const message = docAt(payload.messageUuid);
    const flags = message?.flags?.[SCOPE] ?? {};
    const coil = flags.identifier === "death-coil" || flags.spellName === "Death Coil" || flags.title === "Death Coil";
    if (message?.documentName !== "ChatMessage" || flags.kind !== "spell" || !coil) return { lines: [] };
    const caster = ChatMessage.getSpeakerActor?.(message.speaker) ?? null;
    if (!caster || (caster !== knight && caster.id !== knight.id)) return { lines: [] };
    const { targetActorOf } = await import("../dice/annotate.mjs");
    const index = Math.trunc(Number(payload.index)) || 0;
    const rowActor = targetActorOf(flags.targets?.[index] ?? null);
    if (!rowActor || !target || (rowActor !== target && rowActor.uuid !== target.uuid && rowActor.id !== target.id)) return { lines: [] };
    const amount = clampToCard(payload.amount, flags, index);
    const lines = [];
    for (const g of dkTempFor(talents, { on: "coilDealt", dealt: amount }, talentEffect)) {
      const done = await knight.grantTemporaryHealth(g.amount, { source: g.name, span: g.span });
      if (done?.landed) lines.push(t("AZEROTH.DeathKnight.Talent.Shield", { name: knight.name, n: g.amount, talent: g.name }));
    }
    const slow = coilSlowsFor(talents, talentEffect);
    if (slow && target?.documentName === "Actor") {
      const { inflictCondition } = await import("./inflict.mjs");
      const landed = await inflictCondition({ victim: target, id: slow.condition, by: knight, until: slow.until, name: target.name });
      if (landed?.landed) lines.push(t("AZEROTH.DeathKnight.Talent.CoilSlowed", { name: target.name, talent: slow.name }));
    }
    for (const line of lines) ui.notifications?.info(line);
    return { lines };
  }
  if (payload.act === "dancing") {
    // The card is the knight's Dancing Runeweapon roll, and the heal is no more than half what
    // its row recorded (the F4a review, S4).
    const message = docAt(payload.messageUuid);
    const flags = message?.flags?.[SCOPE] ?? {};
    const caster = ChatMessage.getSpeakerActor?.(message?.speaker) ?? null;
    if (message?.documentName !== "ChatMessage" || !flags.dancingRuneweapon || !caster || (caster !== knight && caster.id !== knight.id)) return { healed: 0 };
    const ceiling = dancingHeal(clampToCard(Number.MAX_SAFE_INTEGER, flags, payload.index), Number(flags.dancingRuneweapon.heal) || 0.5);
    const n = Math.min(Math.max(0, Math.trunc(Number(payload.amount)) || 0), ceiling);
    if (!n) return { healed: 0 };
    const before = knight.system?.health?.value ?? 0;
    await knight.applyHealing(n, { from: knight, feature: true, featureName: String(payload.name ?? "") });
    return { healed: Math.max(0, (knight.system?.health?.value ?? before) - before) };
  }
  if (payload.act === "speedZero") {
    // The knight's own Relentless Advance at rank 2 (D-988), judged here: the talent taken at rank
    // 2, and the knight's Opportunity Attack card off the world - a hit on the row naming this
    // creature, once a row (the F4b review, S3). Nothing about the blow is taken off the payload.
    const held = talents.find(x => x.identifier === "relentless-advance" && Number(x.taken) >= 2);
    const victim = docAt(payload.victimUuid);
    if (!held || victim?.documentName !== "Actor") return { landed: false };
    const message = docAt(payload.messageUuid);
    if (message?.documentName !== "ChatMessage") throw new Error(t("AZEROTH.DeathKnight.Talent.SpeedZeroRefuse.card", { name: victim.name, talent: held.name }));
    const flags = message.flags?.[SCOPE] ?? {};
    const index = Math.trunc(Number(payload.index)) || 0;
    const speaker = ChatMessage.getSpeakerActor?.(message.speaker) ?? null;
    const { targetActorOf } = await import("../dice/annotate.mjs");
    const rowActor = targetActorOf(flags.targets?.[index] ?? null);
    const key = `${message.uuid}:${index}`;
    const no = speedZeroCardRefusal({
      flags, index,
      knightSpoke: Boolean(speaker) && (speaker === knight || speaker.id === knight.id),
      victimNamed: Boolean(rowActor) && (rowActor === victim || rowActor.uuid === victim.uuid || rowActor.id === victim.id),
      claimed: SPEED_ZERO_ANSWERED.has(key) || flags[SPEED_ZERO_CLAIM]?.[index] === true
    });
    if (no) throw new Error(t(`AZEROTH.DeathKnight.Talent.SpeedZeroRefuse.${no}`, { name: victim.name, talent: held.name }));
    // Claimed before anything awaits, then on the card, so a query sent twice lays it once.
    SPEED_ZERO_ANSWERED.add(key);
    if (SPEED_ZERO_ANSWERED.size > 200) SPEED_ZERO_ANSWERED.delete(SPEED_ZERO_ANSWERED.values().next().value);
    await message.update({ [`flags.${SCOPE}.${SPEED_ZERO_CLAIM}.${index}`]: true });
    const done = await speedZeroHere(victim, { by: knight, source: held.name ?? String(payload.source ?? "") });
    // **A PARRY THAT HOLDS TAKES IT BACK** (the F4c review, S1): the effect this laying made joins
    // the card's landing record (`landedOnHit`, a `speedDrop` row), so `effects/miss.mjs#withdrawHit`
    // deletes it with the rest of the hit.
    if (done?.made) {
      const record = Array.isArray(message.flags?.[SCOPE]?.landedOnHit) ? message.flags[SCOPE].landedOnHit : [];
      await message.update({ [`flags.${SCOPE}.landedOnHit`]: [...record, { index, kind: "speedDrop", landed: true, effectId: done.effect.id, source: held.name ?? "" }] });
      // **A PARRY THAT HELD WHILE THIS WAS BEING WRITTEN** (the F4d review, item 4): a withdrawal
      // between the judgement and the record above found no row to take back, so the row is read
      // again now and the Speed 0 goes where it was withdrawn.
      if (rowWithdrawn(message.flags?.[SCOPE] ?? {}, index) && victim.effects?.has?.(done.effect.id)) {
        await victim.deleteEmbeddedDocuments("ActiveEffect", [done.effect.id]);
        return { landed: false, withdrawn: true };
      }
    }
    return { landed: Boolean(done?.effect) };
  }
  if (payload.act === "empower") {
    const { endTick } = await import("./ticks.mjs");
    let ended = 0;
    for (const e of Array.isArray(payload.ends) ? payload.ends : []) {
      const victim = docAt(e?.actorUuid);
      const effect = victim?.effects?.get?.(e?.effectId) ?? null;
      const tick = effect?.flags?.[SCOPE]?.tick ?? null;
      // Only the knight's OWN Frost Fever: the payload names it, the world must agree.
      if (!effect || tick?.plague !== "frostFever" || tick.source !== knight.uuid) continue;
      const done = await endTick(victim, { from: knight, kind: "damage", effectId: effect.id });
      if (done) ended += 1;
    }
    return { ended };
  }
  throw new Error(`dkTalent: no such act ${JSON.stringify(payload.act ?? null)}`);
}
