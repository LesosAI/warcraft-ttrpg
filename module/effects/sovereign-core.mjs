/**
 * **THE SOVEREIGN'S CORE DOORS** (02 §7; the San'layn and Sovereign plan's V4, F2 to F5, C3, C4): the
 * Vitae payment and its overflow into Health, the feeding, the Tribute writer and the prey mark. The
 * law is pure and lives beside each door's reader in `module/rules/` (`vitae.mjs`, `feeding.mjs`,
 * `tribute.mjs`, `prey.mjs`, `named-gains.mjs`); this module reads the world and writes it.
 *
 * - **Judge, then budget, then pay** (D-768): every door asks its refusals whole, the GM's absence
 *   among them where it writes on a creature this client does not own (`gm-writes.mjs#gmAbsentFor`),
 *   before a Half-Action or a point is spent.
 * - **Every pool write for the Sovereign goes through its pool queue** (`documents/pool-writes.mjs`),
 *   read when its turn comes, and names its source (`vitaeGain`, `tributeGain`) or `writePoolsNow`
 *   refuses it.
 * - **A write on the Sovereign from another client is ASKED of the client that answers for it**
 *   (`blow-doors.mjs#answererOf`; the death watch's shape, D-1069) through `SOVEREIGN_QUERY`.
 */

import { VITAE, VITAE_OVERFLOW_OPTION, VITAE_TO_ZERO_FLAG, vitaePayment } from "../rules/vitae.mjs";
import {
  CORPSE_WINDOW_SECONDS, FED_TODAY_FLAG, FEED_DAYS_FLAG, FEED_REFUSAL_WORDS, OUT_OF_FIGHT_WAYS, BLOOD_SINCE_REST_FLAG, withFeedDay,
  feedRefusal, feedingGivesBack, feedingHealthLoss, feedingReturn, feedingTests, fedOnToday, hasBlood, vialRefusal, vialReturn, withFed
} from "../rules/feeding.mjs";
import {
  BLOOD_FORGED_CLAWS, HUNT_MARK, HUNT_MORTAL, PREY_FLAG, PREY_REFUSAL_WORDS, PURSUIT_FREE_MARK, UNENDING_PURSUIT,
  cleanPrey, isPreyOf, preyActive, preyMark, preyRefusal
} from "../rules/prey.mjs";
import { TRIBUTE, WILL_MARK, crownedGain, tributeAfter, willGain } from "../rules/tribute.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
// Lana'thel's Lament's Vampiric Bite (08 §20, D-2160): the worn press a refused feeding fires.
import { pressFiredBy } from "../rules/signatures.mjs";
import { cleanFeedPlan, feedingClaim, feedingResult, preyDiedClaim, tributeClaim } from "../rules/sovereign-asks.mjs";
import { BLOOD_MONARCH } from "../rules/sovereign-talents.mjs";
import { readKillTribute, readPreyTribute } from "../rules/sovereign-spells.mjs";
import { creatureSnapshot, kindsOf } from "../rules/creature-kinds.mjs";
import { reachHeld } from "../rules/distance.mjs";
import { onClawHit } from "../rules/claw-hit.mjs";
import { poolWrite } from "../documents/pool-writes.mjs";
import { FEEDING_CUE_OPTION, TRIBUTE_CUE_OPTION, poolCue } from "../rules/sovereign-core-animations.mjs";
// The prey mark's cue, on the flag write that marks it (the plan's C14; ANIM).
import { PREY_CUE_OPTION, preyCue } from "../rules/sovereign-animations.mjs";

/** The query every write on the Sovereign or its prey is asked through. */
export const SOVEREIGN_QUERY = "azeroth-rpg.sovereign";

/** The flag a dead creature carries: the world second it died (the corpse window, 02 §7). */
export const DIED_AT_FLAG = "diedAt";

/** The flag a latch carrier holds on the prey (02 §7's *Latched*; the plan's C8): `{holder: uuid}`. */
export const LATCH_FLAG = "latch";

/** The Blood Royal's feature name (02 §7, level 1). */
export const BLOOD_ROYAL = "The Blood Royal";

/** How long a door waits on the answering client before saying so. */
const ASK_MS = 10000;

const SCOPE = "azeroth-rpg";
/** The server's clock in ms (`game.time.serverTime`), never one client's own: the Vitae-to-0 mark is compared on another client. */
export const vitaeClock = () => Number(globalThis.game?.time?.serverTime) || Date.now();
const values = c => [...(c?.values?.() ?? c ?? [])];
const now = () => Number(globalThis.game?.time?.worldTime) || 0;
const int = v => Math.trunc(Number(v)) || 0;

/* ------------------------------------------------------------------ */
/*  Reading the world                                                   */
/* ------------------------------------------------------------------ */

/** The Sovereign's Vitae pool, or null. */
export const vitaePoolOf = actor => (actor?.poolSnapshot?.() ?? []).find(p => p.kind === "power" && p.name === VITAE) ?? null;

/** The Sovereign's Tribute pool, or null. */
export const tributePoolOf = actor => (actor?.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === TRIBUTE) ?? null;

/** The token an actor stands on, on the viewed scene first. */
export function tokenOf(actor) {
  if (!actor) return null;
  if (actor.isToken && actor.token) return actor.token;
  const viewed = globalThis.canvas?.scene ?? null;
  const onViewed = viewed ? values(viewed.tokens).find(t => t?.actor === actor || t?.actorId === actor.id && t?.actorLink) : null;
  if (onViewed) return onViewed;
  for (const scene of values(globalThis.game?.scenes)) {
    const t = values(scene?.tokens).find(tk => tk?.actor === actor);
    if (t) return t;
  }
  return null;
}

/** A token's `{sceneId, tokenId}` for a cue, or null. */
const refOf = token => (token?.id ? { sceneId: token.parent?.id ?? null, tokenId: token.id } : null);

/** A token or a snapshot row, as `{actor, token}`. */
export function resolveTarget(target) {
  if (!target) return { actor: null, token: null };
  if (target.documentName === "Token") return { actor: target.actor ?? null, token: target };
  if (target.document?.documentName === "Token") return { actor: target.actor ?? target.document.actor ?? null, token: target.document };
  if (target.documentName === "Actor") return { actor: target, token: tokenOf(target) };
  if (target.tokenId) {
    const scene = (target.sceneId && globalThis.game?.scenes?.get(target.sceneId)) || globalThis.canvas?.scene || null;
    const token = scene?.tokens?.get(target.tokenId) ?? null;
    return { actor: token?.actor ?? (target.actorId ? globalThis.game?.actors?.get(target.actorId) : null) ?? null, token };
  }
  return { actor: null, token: null };
}

/** The live fight uuids, for `preyActive`. */
const liveCombats = () => values(globalThis.game?.combats).filter(c => c?.started).map(c => c.id);

/** Whether a creature is dead: 0 Health, or the defeated mark. */
const isDead = actor => (Number(actor?.system?.health?.value) <= 0)
  || actor?.statuses?.has?.(globalThis.CONFIG?.specialStatusEffects?.DEFEATED ?? "dead") === true;

/** The Sovereign's prey mark while it stands, cleaned, or null. */
export function preyOf(actor) {
  const mark = cleanPrey(actor?.getFlag?.(SCOPE, PREY_FLAG) ?? null);
  if (!mark) return null;
  let prey = null;
  try {
    prey = globalThis.fromUuidSync?.(mark.actorUuid) ?? null;
  } catch {
    prey = null;
  }
  return preyActive(mark, { liveCombats: liveCombats(), now: now(), preyDead: prey ? isDead(prey) : false }) ? mark : null;
}

/** Whether a creature (an actor, a token or a snapshot row) is this Sovereign's prey. */
export function isPrey(sovereign, target) {
  const { actor, token } = resolveTarget(target);
  if (!actor) return false;
  return isPreyOf(sovereign?.getFlag?.(SCOPE, PREY_FLAG) ?? null, { actorUuid: actor.uuid, tokenUuid: token?.uuid ?? null },
    { liveCombats: liveCombats(), now: now(), preyDead: isDead(actor) });
}

/** The combatant of an actor in its started fight, or null. */
function combatantOf(actor) {
  const fight = actor?.activeFight?.() ?? null;
  return fight ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
}

/** The round's marks of an actor's combatant this round. */
function roundMarks(actor) {
  const c = combatantOf(actor);
  if (!c) return [];
  const r = c.getFlag(SCOPE, "round") ?? {};
  return r.number === c.combat?.round ? (r.once ?? []) : [];
}

/** Who answers for an actor: an active owning player, else the active GM. */
async function answerer(actor) {
  const { answererOf } = await import("./blow-doors.mjs");
  return answererOf(actor);
}

/** Ask the client that answers for `holder`; run here where that is this user. */
async function askFor(holder, payload) {
  const who = await answerer(holder);
  if (!who) return { ok: false, reason: "nobody" };
  return said(await askOf(who, payload, holder?.name ?? ""));
}

/** Ask the active GM, here where this user is it. */
async function askGM(payload) {
  const gm = game.users?.activeGM ?? null;
  if (!gm) return { ok: false, reason: "noGM" };
  return said(await askOf(gm, payload, "GM"));
}

/** The ask itself: here where this user answers, else through the query, a failure said in words. */
async function askOf(who, payload, name) {
  if (who.id === game.user.id) return sovereignQueryHandler(payload, { user: game.user, local: true });
  try {
    return await who.query(SOVEREIGN_QUERY, payload, { timeout: ASK_MS });
  } catch (err) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Feeding.NoAnswer", { name, reason: err?.message ?? "" }));
    return { ok: false, reason: "error" };
  }
}

/** A refusal the answering client judged, said in words here (D-982; the fix pass's B1). */
function said(done) {
  if (done?.ok === false && done.words) ui.notifications?.warn(done.words);
  return done;
}

/** Whether this client must ask a GM to write on `actor` and none is online. */
const needsAbsentGM = actor => gmAbsentFor({ owned: [actor?.isOwner === true], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });

/* ------------------------------------------------------------------ */
/*  Vitae: the payment and its overflow into Health (V4)                */
/* ------------------------------------------------------------------ */

/**
 * **WHY A VITAE COST MAY NOT BE PAID**, in words, or null: no Vitae pool, or a cost above the Vitae
 * plus the Health (02 §7). The caller asks it before the budget (D-768).
 *
 * @param {Actor} actor
 * @param {number} cost
 * @returns {string|null}
 */
export function vitaeRefusal(actor, cost) {
  const pool = vitaePoolOf(actor);
  if (!pool) return game.i18n.format("AZEROTH.Vitae.Refuse.noPool", { name: actor?.name ?? "" });
  const p = vitaePayment({ held: pool.value, cost, health: actor.system?.health?.value ?? 0 });
  return p.refusal ? game.i18n.format("AZEROTH.Vitae.Warn.refused", { name: actor.name, n: int(cost), vitae: pool.value, health: actor.system?.health?.value ?? 0 }) : null;
}

/**
 * **PAY A VITAE COST, INSIDE THE POOL QUEUE** (02 §7, *When your Vitae runs out*). All the Vitae, then the
 * rest off Health 1 for 1, in ONE update (D-761: facts that must agree are written together). The Health
 * is not damage: no temporary Health, no hold at 1, no Aegis floor, no Critical Injury. At 0 the payer is
 * Prone and Dying, said in words. The update carries the drain pulse's cue (`VITAE_OVERFLOW_OPTION`).
 *
 * @param {Actor} actor
 * @param {number} amount
 * @param {{extra?: object, label?: string}} [o]  `extra` other fields to write in the same update
 * @returns {Promise<{ok: boolean, reason?: string, vitae?: number, health?: number, toZero?: boolean}>}
 */
export function payVitae(actor, amount, o = {}) {
  return poolWrite(actor, () => payVitaeNow(actor, amount, o));
}

/** The payment itself, for a task already inside the actor's pool queue. */
export async function payVitaeNow(actor, amount, { extra = {}, label = "" } = {}) {
  const cost = Math.max(0, int(amount));
  const pool = vitaePoolOf(actor);
  if (!pool) return { ok: false, reason: "noPool" };
  const healthNow = Object.hasOwn(extra ?? {}, "system.health.value") ? int(extra["system.health.value"]) : int(actor.system?.health?.value);
  const p = vitaePayment({ held: pool.value, cost, health: healthNow });
  if (p.refusal) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Vitae.Warn.refused", { name: actor.name, n: cost, vitae: pool.value, health: healthNow }));
    return { ok: false, reason: "short", ...p };
  }
  const update = { ...(extra ?? {}) };
  const options = {};
  if (p.health > 0) {
    update["system.health.value"] = p.healthAfter;
    options.azerothHealthBefore = int(actor.system?.health?.value);
    const cue = poolCue({ holder: refOf(tokenOf(actor)), amount: p.health });
    if (cue) options[VITAE_OVERFLOW_OPTION] = cue;
    // The cast this paid for still takes effect at 0 (02 §7): its reaction window reads the mark (D-1296) on the
    // SERVER's clock, which the GM's client compares against too (the review's S2), and spends it at the open.
    if (p.toZero) update[`flags.${SCOPE}.${VITAE_TO_ZERO_FLAG}`] = vitaeClock();
  }
  await actor.writePoolsNow([{ itemId: pool.itemId, kind: "power", value: p.vitaeAfter }], update, options);
  if (p.health > 0) {
    ui.notifications?.info(game.i18n.format("AZEROTH.Vitae.Paid", { name: actor.name, vitae: p.vitae, health: p.health, source: label }));
  }
  if (p.toZero) await afterOverflowToZero(actor, { label });
  return { ok: true, ...p };
}

/**
 * **WHAT 0 HEALTH FROM A VITAE PAYMENT LEAVES** (02 §7: *If the payment dropped you to 0 Health, you are
 * then Dying, and you take no Critical Injury from it*): Prone, as 06 §8 lays it at 0, and the Sustains
 * and shapes 0 Health ends, waited for as `adjustHealth` waits. No Critical Injury is rolled.
 */
export async function afterOverflowToZero(actor, { label = "" } = {}) {
  try {
    if (!actor.statuses?.has?.("prone")) await actor.toggleStatusEffect?.("prone", { active: true });
  } catch (err) {
    console.warn("azeroth-rpg | Prone at 0 from Vitae", err);
  }
  try {
    await game.system.azeroth.workflows.sustainsEnding?.(actor);
    await actor._shapeEnding;
  } catch (err) {
    console.warn("azeroth-rpg | what 0 Health ended", err);
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.Vitae.ToZero", { name: actor.name, source: label })}</p>`,
    flags: { [SCOPE]: { kind: "vitaeToZero" } }
  });
}

/**
 * **THE OPTIONS AN UPKEEP'S WRITE CARRIES WHERE VITAE OVERFLOWED INTO HEALTH** (`turn-effects.mjs#upkeep`;
 * the plan's V4): the drain pulse's cue and the floating number, or nothing.
 *
 * @param {Actor} actor
 * @param {{paidIn?: Record<string, number>, health?: number|null}} r  `upkeep`'s answer
 */
export function upkeepOverflowOptions(actor, r = {}) {
  const before = int(actor?.system?.health?.value);
  if (!vitaePoolOf(actor) || r?.health === null || r?.health === undefined || !(int(r.health) < before)) return {};
  if (!Object.hasOwn(r.paidIn ?? {}, VITAE)) return {};
  const cue = poolCue({ holder: refOf(tokenOf(actor)), amount: before - int(r.health) });
  return { azerothHealthBefore: before, ...(cue ? { [VITAE_OVERFLOW_OPTION]: cue } : {}) };
}

/**
 * **HEALTH PAID FOR VITAE OUTSIDE A POOL WRITE** (`AzerothActor#loseHealth(amount, {vitaeOverflow: true})`;
 * the plan's V4): the Health alone, past every hold and the Aegis floor, with the drain pulse's cue, and
 * Prone and Dying at 0.
 */
export async function loseHealthForVitae(actor, amount) {
  const n = Math.max(0, int(amount));
  const before = int(actor?.system?.health?.value);
  if (!n || !actor) return actor;
  const after = Math.max(0, before - n);
  const cue = poolCue({ holder: refOf(tokenOf(actor)), amount: before - after });
  await actor.update({ "system.health.value": after }, { azerothHealthBefore: before, ...(cue ? { [VITAE_OVERFLOW_OPTION]: cue } : {}) });
  if (after === 0 && before > 0) await afterOverflowToZero(actor);
  return actor;
}

/* ------------------------------------------------------------------ */
/*  Feeding (F1 to F5)                                                  */
/* ------------------------------------------------------------------ */

/** The ranks of a talent the Sovereign has taken. */
const ranks = (actor, name) => Math.max(0, int(actor?.talentRanks?.(name)));

/** Whether the Sovereign is latched on to a creature: a latch carrier on it naming the Sovereign. */
export function latchedOn(sovereign, target) {
  return values(target?.effects).some(e => e?.active !== false && e?.flags?.[SCOPE]?.[LATCH_FLAG]?.holder === sovereign?.uuid);
}

/**
 * **WHAT A FEEDING IS JUDGED ON**, read off the world (02 §7), and the verdict. Pure law in
 * `rules/feeding.mjs#feedRefusal`.
 */
export function feedVerdict(sovereign, target, { mode = "fight", free = false, anyDay = false, way = null, token = null, targetToken = null } = {}) {
  if (!target) return { refusal: "noTarget" };
  const myToken = token ?? tokenOf(sovereign);
  const theirToken = targetToken ?? tokenOf(target);
  const snap = creatureSnapshot({ type: target.type, system: target.system, race: target.raceItem?.name ?? null });
  const blood = hasBlood({ creatureType: snap.creatureType, kinds: kindsOf(snap) }) && target.system?.undead !== true;
  const record = sovereign?.getFlag?.(SCOPE, FED_TODAY_FLAG) ?? {};
  let feet = null;
  if (myToken && theirToken) {
    // The one measure (D-732), off a static import of nothing: `canvas/footprints.mjs` is read here only
    // where both tokens stand on one scene.
    feet = footprintsFeet(myToken, theirToken);
  }
  const reach = reachHeld((sovereign?.readyWeapons?.() ?? []).map(w => w?.system ?? w));
  const diedAt = Number(target.getFlag?.(SCOPE, DIED_AT_FLAG));
  const refusal = !vitaePoolOf(sovereign) ? "noPool" : feedRefusal({
    mode, self: target === sovereign, blood, fedToday: fedOnToday(record, target.uuid, now()),
    inReach: feet === null ? true : feet <= reach, conditions: [...(target.statuses ?? [])],
    latched: latchedOn(sovereign, target), drinkDeep: ranks(sovereign, "Drink Deep"), free, anyDay, way,
    deadFor: Number.isFinite(diedAt) ? now() - diedAt : null, health: target.system?.health?.value ?? 0
  });
  return { refusal, feet, reach, token: myToken, targetToken: theirToken };
}

let footprints = null;
/** `canvas/footprints.mjs#feetApart`, loaded once at registration (lessons: a dynamic import in a hot path costs). */
function footprintsFeet(a, b) {
  try {
    return footprints ? footprints.feetApart(a, b) : null;
  } catch {
    return null;
  }
}

/** The words a feeding refusal is said in. */
function feedWords(refusal, sovereign, target) {
  return game.i18n.format(FEED_REFUSAL_WORDS[refusal] ?? FEED_REFUSAL_WORDS.noTarget, { name: sovereign?.name ?? "", target: target?.name ?? "" });
}

/**
 * **THE FEEDING DOOR** (02 §7's The Blood Royal; the plan's F2): judge, then budget, then pay.
 *
 * - `mode` `fight` (a Half-Action on a creature in reach that is Stunned, Entangled or Prone or that you
 *   are latched on to; it makes a Body Resilience Test against your Spell DC and on a failure you feed
 *   and it loses Health equal to your tier), `out` (1 minute; `way` names how) or `corpse` (dead under
 *   ten minutes; half the Vitae).
 * - `free` - a feeding a talent or spell makes with no Test and no opening (Latch On, Last Draught,
 *   Embrace of the Vampyr): no budget is spent here, the caller's door paid for it.
 * - `anyDay` - Red Feast's claw-hit feeding: it does not count toward once a day.
 * - `vitaeFactor` - Last Draught at rank 1 (0.5); `flat` - Red Feast's *Vitae equal to your tier*.
 * - `source` - the card's label for what fed (a talent's or spell's name); the gain is always `feed`.
 *
 * @returns {Promise<{ok: boolean, reason?: string, vitae?: number, card?: ChatMessage}>}
 */
export async function feedOn(sovereign, target, {
  mode = null, free = false, anyDay = false, vitaeFactor = 1, flat = null, source = "", way = null, budget = true, targetToken = null,
  atRange = false
} = {}) {
  const t = resolveTarget(target);
  const prey = t.actor;
  const fight = sovereign?.activeFight?.() ?? null;
  const m = mode ?? (prey && isDead(prey) ? "corpse" : (fight ? "fight" : "out"));
  const verdict = feedVerdict(sovereign, prey, { mode: m, free, anyDay, way, targetToken: targetToken ?? t.token });
  // **08 §20's VAMPIRIC BITE** (Lana'thel's Lament: *Once per Short Rest, in a fight, a Sovereign
  // wielding it may feed (The Blood Royal) on any creature within their reach*; D-2160): offered as a
  // choice where the feeding is refused for the opening alone - every other refusal has already held
  // by then - and never laid silently. The Test and once a day still apply; the use is struck once the
  // budget is paid.
  // **EVERY REFUSAL IS JUDGED BEFORE THE BITE IS ASKED** (the phase 3 review): the Bite is only an answer to
  // the opening's refusal, so the absent GM and the turn's budget are judged first and a confirm that could
  // only end in a refusal is never opened.
  const fired = verdict.refusal === "open" && m === "fight" && fight?.started
    ? pressFiredBy(sovereign.items ?? [], "feedRefused", sovereign.signatureTurnState ?? {})
    : null;
  if (verdict.refusal && !fired) {
    ui.notifications?.warn(feedWords(verdict.refusal, sovereign, prey));
    return { ok: false, reason: verdict.refusal };
  }
  const loss = feedingHealthLoss({ mode: m, tier: sovereign.system?.tier ?? 1 });
  // The creature's Health is written where this client owns it, else by the GM (judged now, D-774).
  if (loss > 0 && needsAbsentGM(prey)) {
    ui.notifications?.warn(feedWords("noGM", sovereign, prey));
    return { ok: false, reason: "noGM" };
  }
  const tests = feedingTests({ mode: m, free });
  // A fight's feeding costs a Half-Action (02 §7), judged before anything is spent.
  const action = m === "fight" && !free && budget ? "half" : null;
  const shortOf = () => (action ? game.system.azeroth.workflows.turnBudgetRefusal(sovereign, action) : null);
  let short = shortOf();
  if (short) {
    ui.notifications?.warn(game.i18n.format(short.reason, short.params ?? {}));
    return { ok: false, reason: "budget" };
  }
  let bite = null;
  if (fired) {
    const yes = await foundry.applications.api.DialogV2.confirm({
      window: { title: fired.press.label || fired.item.name },
      content: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.ClassItem.BiteAsk", { name: sovereign.name, target: prey?.name ?? "", item: fired.item.name, run: fired.press.label || fired.item.name }))}</p>`,
      rejectClose: false
    });
    if (!yes) {
      ui.notifications?.warn(feedWords(verdict.refusal, sovereign, prey));
      return { ok: false, reason: verdict.refusal };
    }
    // The use as it stands NOW, after the dialog: a use struck while it stood open is not struck twice.
    if (!(biteUsesLeft(sovereign, fired) > 0)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.ClassItem.BiteSpent", { name: sovereign.name, run: fired.press.label || fired.item.name }));
      return { ok: false, reason: "spent" };
    }
    // And the budget again: the turn may have moved while the dialog stood open.
    short = shortOf();
    if (short) {
      ui.notifications?.warn(game.i18n.format(short.reason, short.params ?? {}));
      return { ok: false, reason: "budget" };
    }
    bite = fired;
  }
  if (action && !(await game.system.azeroth.workflows.spendTurnBudget(sovereign, action))) return { ok: false, reason: "budget" };
  // Vampiric Bite's use, struck after the budget, at the press's own dotted path (D-671), off the LIVE item
  // at the write (the phase 3 review), never off the value read before the dialog.
  if (bite) {
    await strikeBiteUse(sovereign, bite, -1);
    ui.notifications?.info(game.i18n.format("AZEROTH.ClassItem.BiteUsed", { name: sovereign.name, target: prey?.name ?? "", run: bite.press.label || bite.item.name }));
  }
  const plan = {
    sovereignUuid: sovereign.uuid, targetUuid: prey.uuid, mode: m, loss, free, anyDay, vitaeFactor, flat, source,
    holder: refOf(verdict.token), corpse: refOf(verdict.targetToken),
    // 07 §17's Sanguine Draught (D-1372): a feeding at the spell's range, which is still a feeding in a fight for 04's
    // Drink Deep where the Sovereign stands in one.
    ...(atRange === true ? { atRange: true } : {}),
    // What this feeding paid, given back where its landing finds nothing to land on (`feedingGivesBack`).
    ...(bite || action ? { paid: { bite: bite ? { itemId: bite.item.id, key: bite.key } : null, half: Boolean(action) } } : {})
  };
  if (tests) return { ok: true, card: await postFeedingTest(sovereign, prey, plan) };
  // The same give-back as the Test's path (the phase 4 review): a landing that finds the creature or
  // the Sovereign gone, or no GM to take the creature's Health, keeps neither the Bite nor the Half-Action.
  const landed = await landFeedingPlan(plan);
  if (!landed?.ok && feedingGivesBack(landed?.reason)) await giveBackFeeding(plan);
  return landed;
}

/** The prompt card the creature's owner rolls its Body Test on (02 §7), the plan on its flags. */
async function postFeedingTest(sovereign, prey, plan) {
  const { PROMPT_TEMPLATE } = await import("./prompts.mjs");
  const dc = Math.trunc(Number(sovereign.system?.spellDC)) || 10;
  const content = await foundry.applications.handlebars.renderTemplate(PROMPT_TEMPLATE, {
    cardClass: "azeroth-card-attack", title: game.i18n.localize("AZEROTH.Feeding.Title"), name: prey.name,
    text: game.i18n.format("AZEROTH.Feeding.TestText", { name: sovereign.name, target: prey.name, dc, loss: plan.loss }),
    testLabel: game.i18n.format("AZEROTH.Feeding.TestLabel", { dc }), dc, actorUuid: prey.uuid, purpose: "feeding",
    resilience: "body", ownerSees: true
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: sovereign }),
    content,
    flags: { [SCOPE]: { kind: "prompt", purpose: "feeding", actorUuid: prey.uuid, feeding: { ...plan, dc, resolved: false } } }
  });
}

/**
 * **THE FEEDING TEST, LANDED** (`dice/chat.mjs#rollResists`, purpose `feeding`, on the client that rolled
 * it, which owns the creature): a failure takes the creature's Health and asks the Sovereign's answerer to
 * write the Vitae. One landing a card.
 */
export async function feedingAfterTest({ message, actor, passed, result = null }) {
  const plan = message?.flags?.[SCOPE]?.feeding ?? null;
  if (!plan || plan.resolved === true) return null;
  // **ONE LANDING A CARD, CLAIMED FIRST** (the review's N2): the owner and the GM could both roll before the
  // record landed, and the creature lost its Health twice. The press is claimed on the card before anything.
  const { claimCardPress } = await import("./card-presses.mjs");
  const claimed = await claimCardPress(message, { kind: "once", press: "feeding" });
  if (!claimed.ok) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Feeding.Already", { target: actor?.name ?? "" }));
    return { ok: false, reason: "pressed" };
  }
  // The result is RECORDED on the card - here off this Test, or on the GM's client off the Test's own message -
  // and every later landing reads the card, never a word that it failed (D-982).
  let record = null;
  if (message.isOwner) {
    record = { ...plan, resolved: true, failed: passed !== true, resultId: result?.id ?? null };
    await message.setFlag(SCOPE, "feeding", record);
  } else {
    const r = await askGM({ act: "resolveCard", messageId: message.id, resultId: result?.id ?? null });
    if (!r?.ok) return { ok: false, reason: r?.reason ?? "noGM" };
    record = { ...plan, resolved: true, failed: r.failed === true, resultId: result?.id ?? null };
  }
  if (passed || record.failed !== true) {
    ui.notifications?.info(game.i18n.format("AZEROTH.Feeding.Resisted", { target: actor.name }));
    return { ok: false, reason: "passed" };
  }
  const landed = await landFeedingPlan(record, { messageId: message.id });
  // **NOTHING LANDED, NOTHING KEPT** (the phase 3 review; a refused action keeps its Half-Action, the lead):
  // where the landing found the creature or the Sovereign gone, or no GM to take the creature's Health,
  // Vampiric Bite's use and the Half-Action are given back.
  if (!landed?.ok && feedingGivesBack(landed?.reason)) await giveBackFeeding(record);
  return landed;
}

/** The Bite's uses left, read off the LIVE item the Sovereign holds now. */
function biteUsesLeft(sovereign, bite) {
  const live = sovereign?.items?.get?.(bite?.item?.id ?? bite?.itemId) ?? null;
  return int(live?.system?.signatureEffect?.presses?.[bite?.key]?.uses?.value);
}

/**
 * Vampiric Bite's use moved by `delta` (-1 struck, +1 given back), read off the LIVE item at the write and
 * held between 0 and the press's maximum. Answers whether anything was written.
 */
async function strikeBiteUse(sovereign, bite, delta) {
  const id = bite?.item?.id ?? bite?.itemId;
  const live = sovereign?.items?.get?.(id) ?? null;
  const uses = live?.system?.signatureEffect?.presses?.[bite?.key]?.uses ?? null;
  if (!uses) return false;
  const max = int(uses.max);
  const now = int(uses.value);
  const next = Math.max(0, max > 0 ? Math.min(max, now + delta) : now + delta);
  if (next === now) return false;
  await live.update({ [`system.signatureEffect.presses.${bite.key}.uses.value`]: next });
  return true;
}

/**
 * **WHAT A FEEDING PAID, GIVEN BACK** (the phase 3 review): the Bite's use and the Half-Action, where this
 * client owns the Sovereign (the Witch Hunter's `giveBackUse` shape: a Half-Action gained through the
 * combatant's own queued door, never the GM's undo). Said in words; a client that does not own the
 * Sovereign says that nothing could be given back.
 */
async function giveBackFeeding(plan) {
  const paid = plan?.paid ?? null;
  if (!paid?.bite && !paid?.half) return;
  let sovereign = null;
  try { sovereign = fromUuidSync(plan.sovereignUuid); } catch { sovereign = null; }
  if (!sovereign?.isOwner) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Feeding.NotGivenBack", { name: sovereign?.name ?? "" }));
    return;
  }
  const lines = [];
  if (paid.bite && (await strikeBiteUse(sovereign, paid.bite, 1))) lines.push(game.i18n.localize("AZEROTH.Feeding.GivenBackBite"));
  const fight = sovereign.activeFight?.() ?? null;
  const mine = paid.half && fight?.started ? (fight.getCombatantsByActor?.(sovereign)?.[0] ?? null) : null;
  if (mine?.isOwner) {
    await mine.grantHalfActions(1);
    lines.push(game.i18n.localize("AZEROTH.Feeding.GivenBackHalf"));
  }
  if (lines.length) ui.notifications?.info(game.i18n.format("AZEROTH.Feeding.GivenBack", { name: sovereign.name, what: lines.join(" ") }));
}

/**
 * Land a judged feeding: the creature's Health where it loses any (here where this client owns it, else
 * the GM's), then the Vitae, the once-a-day record and the rest's unit on the Sovereign's answerer.
 */
export async function landFeedingPlan(plan, { messageId = null } = {}) {
  let prey = null;
  let sovereign = null;
  try {
    prey = fromUuidSync(plan.targetUuid);
    sovereign = fromUuidSync(plan.sovereignUuid);
  } catch {
    return { ok: false, reason: "gone" };
  }
  if (!prey || !sovereign) return { ok: false, reason: "gone" };
  // **ONCE A DAY, JUDGED BEFORE THE CREATURE LOSES ANYTHING** (the review's N4): a second feeding on one
  // creature was refused only after its Health was gone.
  if (!plan.anyDay && fedOnToday(sovereign.getFlag?.(SCOPE, FED_TODAY_FLAG) ?? {}, plan.targetUuid, now())) {
    ui.notifications?.warn(feedWords("fedToday", sovereign, prey));
    return { ok: false, reason: "fedToday" };
  }
  if (plan.loss > 0) {
    if (prey.isOwner) await prey.loseHealth(plan.loss);
    else {
      const drained = await askGM({ act: "drain", targetUuid: prey.uuid, sovereignUuid: sovereign.uuid, messageId, mode: plan.mode, anyDay: plan.anyDay === true });
      if (!drained?.ok) return { ok: false, reason: drained?.reason ?? "noGM" };
    }
  }
  return askFor(sovereign, { act: "feed", ...plan, messageId });
}

/**
 * **THE VITAE A FEEDING GIVES, ON THE SOVEREIGN'S OWN CLIENT, IN ITS POOL QUEUE**: once a day judged
 * again, the Vitae (`vitaeGain: "feed"`), the record and the rest's unit (`bloodSinceRest`) in ONE update,
 * with the feeding stream's cue.
 */
async function writeFeeding(sovereign, plan) {
  const prey = (() => { try { return fromUuidSync(plan.targetUuid); } catch { return null; } })();
  return poolWrite(sovereign, async () => {
    const pool = vitaePoolOf(sovereign);
    if (!pool) return { ok: false, reason: "noPool" };
    const record = sovereign.getFlag(SCOPE, FED_TODAY_FLAG) ?? {};
    if (!plan.anyDay && fedOnToday(record, plan.targetUuid, now())) {
      ui.notifications?.warn(feedWords("fedToday", sovereign, prey));
      return { ok: false, reason: "fedToday" };
    }
    const size = prey?.system?.size ?? "medium";
    const gain = feedingReturn({
      size, tier: sovereign.system?.tier ?? 1, conMod: sovereign.system?.abilities?.con?.mod ?? 0,
      corpse: plan.mode === "corpse", factor: plan.vitaeFactor ?? 1, flat: plan.flat ?? null,
      drinkDeepRanks: ranks(sovereign, "Drink Deep"), inFight: plan.mode === "fight" || (plan.atRange === true && Boolean(sovereign.activeFight?.()?.started))
    });
    // **08 §20's THE QUEEN'S KISS** (Lana'thel's Lament: *they regain additional Vitae equal to their
    // tier*; D-2160): the wielded item's Vitae a tier, at the one feeding door, under the `feed`
    // source the gain already names (never a second source).
    const kiss = Math.max(0, int(sovereign.system?.signatureEffects?.feedVitaePerTier)) * Math.max(1, int(sovereign.system?.tier ?? 1));
    const next = Math.min(pool.max, pool.value + gain + kiss);
    const extra = { [`flags.${SCOPE}.${BLOOD_SINCE_REST_FLAG}`]: Math.max(0, int(sovereign.getFlag(SCOPE, BLOOD_SINCE_REST_FLAG))) + 1 };
    if (!plan.anyDay) extra[`flags.${SCOPE}.${FED_TODAY_FLAG}`] = foundry.data.operators.ForcedReplacement.create(withFed(record, plan.targetUuid, now()));
    // **THE DAYS FED ON EACH CREATURE** (07 §17's Blood Bond; D-1368): every feeding, in this same update.
    extra[`flags.${SCOPE}.${FEED_DAYS_FLAG}`] = foundry.data.operators.ForcedReplacement.create(withFeedDay(sovereign.getFlag(SCOPE, FEED_DAYS_FLAG) ?? {}, plan.targetUuid, now()));
    const cue = poolCue({ holder: plan.holder ?? refOf(tokenOf(sovereign)), from: plan.corpse ?? null, amount: Math.max(1, next - pool.value) });
    await sovereign.writePoolsNow([{ itemId: pool.itemId, kind: "power", value: next }], extra, { vitaeGain: "feed", ...(cue ? { [FEEDING_CUE_OPTION]: cue } : {}) });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: sovereign }),
      content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.Feeding.Fed", { name: sovereign.name, target: prey?.name ?? "", n: next - pool.value, source: plan.source || game.i18n.localize("AZEROTH.Feeding.Title") })}</p>`,
      flags: { [SCOPE]: { kind: "feeding", targetUuid: plan.targetUuid, gained: next - pool.value } }
    });
    return { ok: true, vitae: next - pool.value, value: next };
  });
}

/**
 * **A BLOOD VIAL DRUNK BY A SOVEREIGN** (the plan's F3; B.13 Q16): one vial spent through
 * `consumables.mjs#spendOne`, 2 x tier Vitae (`vitaeGain: "vial"`), and the rest's unit counted: one
 * spend is one feeding. Judged before the vial is spent.
 */
export async function drinkVial(sovereign, vial) {
  const pool = vitaePoolOf(sovereign);
  const { isProvision } = await import("../rules/provisions.mjs");
  // **JUDGED WHOLE BEFORE ANYTHING IS SPENT** (D-768; the reviews' S6 and S3): a Blood vial the Sovereign
  // carries, and Vitae short of full - a vial drunk at full is spent for nothing.
  const refusal = vialRefusal({ pool: pool ? { value: pool.value, max: pool.max } : null, owned: Boolean(vial) && vial.parent === sovereign,
    blood: isProvision(vial, "blood"), quantity: vial?.system?.quantity ?? 0 });
  if (refusal) {
    ui.notifications?.warn(game.i18n.format(`AZEROTH.Feeding.Refuse.vial${refusal[0].toUpperCase()}${refusal.slice(1)}`, { name: sovereign?.name ?? "", item: vial?.name ?? "" }));
    return { ok: false, reason: refusal };
  }
  // In a fight it is a Half-Action (02 §7, as 05's Interact charges a drunk consumable): judged, then spent,
  // then the vial (D-768's order).
  const fight = sovereign.activeFight?.() ?? null;
  if (fight) {
    const short = game.system.azeroth.workflows.turnBudgetRefusal(sovereign, "half");
    if (short) {
      ui.notifications?.warn(game.i18n.format(short.reason, short.params ?? {}));
      return { ok: false, reason: "budget" };
    }
    if (!(await game.system.azeroth.workflows.spendTurnBudget(sovereign, "half"))) return { ok: false, reason: "budget" };
  }
  const { spendOne } = await import("../rules/consumables.mjs");
  const spent = spendOne(vial.system?.quantity ?? 1);
  if (!spent) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Feeding.Refuse.vial", { name: sovereign.name, item: vial.name }));
    return { ok: false, reason: "empty" };
  }
  if (spent.delete) await vial.delete();
  else await vial.update({ "system.quantity": spent.quantity });
  return poolWrite(sovereign, async () => {
    const now0 = vitaePoolOf(sovereign);
    const gain = vialReturn(sovereign.system?.tier ?? 1);
    const next = Math.min(now0.max, now0.value + gain);
    const cue = poolCue({ holder: refOf(tokenOf(sovereign)), amount: Math.max(1, next - now0.value) });
    await sovereign.writePoolsNow([{ itemId: now0.itemId, kind: "power", value: next }], {
      [`flags.${SCOPE}.${BLOOD_SINCE_REST_FLAG}`]: Math.max(0, int(sovereign.getFlag(SCOPE, BLOOD_SINCE_REST_FLAG))) + 1
    }, { vitaeGain: "vial", ...(cue ? { [FEEDING_CUE_OPTION]: cue } : {}) });
    ui.notifications?.info(game.i18n.format("AZEROTH.Feeding.Vial", { name: sovereign.name, n: next - now0.value }));
    return { ok: true, vitae: next - now0.value };
  });
}

/**
 * **THE BLOOD ROYAL'S USE** (02 §7): the creature targeted, the mode read off the world - a creature at 0
 * Health is a corpse, a started fight is a fight, anything else is outside one and the one chooser asks
 * how - and then the feeding door.
 */
export async function feedWithDialog(sovereign, { targets = null } = {}) {
  const list = targets ?? [...(game.user?.targets ?? [])];
  if (list.length !== 1) {
    ui.notifications?.warn(game.i18n.format(FEED_REFUSAL_WORDS.noTarget, { name: sovereign?.name ?? "" }));
    return { ok: false, reason: "noTarget" };
  }
  const t = resolveTarget(list[0]);
  if (!t.actor) {
    ui.notifications?.warn(game.i18n.format(FEED_REFUSAL_WORDS.noTarget, { name: sovereign?.name ?? "" }));
    return { ok: false, reason: "noTarget" };
  }
  const dead = isDead(t.actor);
  const mode = dead ? "corpse" : (sovereign.activeFight?.() ? "fight" : "out");
  let way = null;
  if (mode === "out") {
    // Judged before the chooser opens: a creature with no blood, or one fed on today, refuses first.
    const pre = feedVerdict(sovereign, t.actor, { mode, free: true, targetToken: t.token });
    if (pre.refusal) {
      ui.notifications?.warn(feedWords(pre.refusal, sovereign, t.actor));
      return { ok: false, reason: pre.refusal };
    }
    const feature = sovereign.items?.find?.(i => i.type === "feature" && i.name === BLOOD_ROYAL) ?? { name: BLOOD_ROYAL };
    const options = OUT_OF_FIGHT_WAYS.map(key => ({ key, name: game.i18n.localize(`AZEROTH.Feeding.Way.${key}`), description: "" }));
    const pick = await game.system.azeroth.workflows.chooseOption(feature, options, null, { prompt: game.i18n.format("AZEROTH.Feeding.WayPrompt", { target: t.actor.name }) });
    if (!pick) return { ok: false, reason: "dismissed" };
    way = pick.key;
  }
  return feedOn(sovereign, t.actor, { mode, way, targetToken: t.token });
}

/* ------------------------------------------------------------------ */
/*  Tribute (C3)                                                        */
/* ------------------------------------------------------------------ */

/** Whether Crowned in Blood stands on the Sovereign (its effect's flag, `tribute.mjs#CROWNED_FLAG`). */
const crowned = actor => values(actor?.effects).some(e => e?.active !== false && e?.disabled !== true && e?.flags?.[SCOPE]?.crownedInBlood);

/**
 * **GAIN TRIBUTE, INSIDE THE POOL QUEUE, BY A NAMED DOOR** (02 §7; `named-gains.mjs#TRIBUTE_GAIN_SOURCES`):
 * Crowned in Blood's 1 more on each gain, capped, and the wisp's cue on the same update. On the client
 * that writes the Sovereign; a caller on another client asks through `askTribute`.
 *
 * @param {Actor} actor
 * @param {number} amount
 * @param {string} source  a key of `TRIBUTE_GAIN_SOURCES`
 * @param {{from?: object|null}} [o]  the token the wisp runs from
 */
export function gainTribute(actor, amount, source, { from = null } = {}) {
  return poolWrite(actor, async () => {
    const pool = tributePoolOf(actor);
    if (!pool) return { ok: false, reason: "noPool" };
    const gain = crownedGain(amount, crowned(actor));
    const after = tributeAfter({ value: pool.value, max: pool.max, gain });
    if (!after.gained) return { ok: false, reason: "full" };
    const cue = poolCue({ holder: refOf(tokenOf(actor)), from, amount: after.gained });
    await actor.writePoolsNow([{ itemId: pool.itemId, kind: "momentum", value: after.value }], {}, { tributeGain: source, ...(cue ? { [TRIBUTE_CUE_OPTION]: cue } : {}) });
    return { ok: true, gained: after.gained, value: after.value };
  });
}

/** Ask the Sovereign's answerer to gain Tribute (a will-lane failure rolled on the GM's client). */
export function askTribute(actor, amount, source, { from = null, mark = null, messageId = null } = {}) {
  return askFor(actor, { act: "tribute", sovereignUuid: actor.uuid, amount, source, from, mark, messageId });
}

/**
 * **A TRIBUTE GAIN ASKED FROM ANOTHER CLIENT, JUDGED HERE** (D-982; the fix pass's B1), on the Sovereign's
 * answerer, for both query handlers: a named source that is not a GM's hand, from a GM or the Sovereign's
 * owner; or a spell card's Tribute (Sovereign's Kiss, Aortic Unraveling) off this Sovereign's successful
 * card, once a card, its amount read off the card's own words - never the payload's number.
 *
 * @param {Actor} sovereign
 * @param {object} payload
 * @param {User|null} user  the asker
 */
export async function tributeAsked(sovereign, payload = {}, user = null) {
  const { TRIBUTE_GAIN_SOURCES } = await import("../rules/named-gains.mjs");
  const gm = !user || user.isGM === true;
  const card = payload.messageId ? (game.messages?.get(payload.messageId) ?? null) : null;
  const cf = card?.flags?.[SCOPE] ?? {};
  const claim = tributeClaim({
    source: payload.source, sources: TRIBUTE_GAIN_SOURCES, sovereignUuid: sovereign.uuid,
    asker: { gm, owns: gm || sovereign.testUserPermission?.(user, "OWNER") === true },
    card: card ? { caster: cf.caster ?? null, sovereign: Boolean(cf.sovereignSpell), success: cf.success === true, claimed: cf.tributeClaimed ?? [] } : null
  });
  if (!claim.ok) return { ok: false, reason: claim.reason, words: game.i18n.localize(`AZEROTH.SovereignAsk.${claim.reason}`) };
  const pool = tributePoolOf(sovereign);
  let amount = Math.max(0, int(payload.amount));
  if (claim.fromCard) {
    // The card's own number: the Kiss's sentence, or Aortic Unraveling's up to the cap.
    amount = payload.source === "kiss" ? Math.min(amount, Math.max(0, int(readPreyTribute(cf.effectHTML ?? "")?.amount)))
      : (readKillTribute(cf.effectHTML ?? "") ? Math.min(amount, Math.max(0, (pool?.max ?? 0) - (pool?.value ?? 0))) : 0);
    if (card.isOwner) await card.setFlag(SCOPE, "tributeClaimed", [...(cf.tributeClaimed ?? []), payload.source]);
  }
  return gainTribute(sovereign, Math.min(amount, pool?.max ?? 0), payload.source, { from: payload.from ?? null });
}

/**
 * **THE CLAW LANE** (R17: every claw hit on the prey gives 1, no round limit), on the attacker's client
 * (the WEAPON door's `onClawHit`): a hit on the prey gains 1; a hit on any other creature offers
 * Blood-Forged Claws' *Mark as prey* on a card of its own.
 */
async function onClaw(payload = {}) {
  const get = uuid => { try { return uuid ? fromUuidSync(uuid) : null; } catch { return null; } };
  const actor = get(payload.attackerUuid);
  // The claw lane writes on the attacker, on the client that rolled - the attacker's own.
  if (!actor?.isOwner || (!tributePoolOf(actor) && !actor.hasFeature?.(BLOOD_FORGED_CLAWS))) return;
  const token = get(payload.targetTokenUuid);
  const row = token ?? get(payload.targetActorUuid);
  const t = resolveTarget(row);
  if (!t.actor) return;
  if (isPrey(actor, row)) {
    const r = await gainTribute(actor, 1, "claw", { from: refOf(t.token) });
    if (r?.ok) ui.notifications?.info(game.i18n.format("AZEROTH.Tribute.Claw", { name: actor.name, target: t.actor.name, n: r.gained }));
    return;
  }
  if (actor.hasFeature?.(BLOOD_FORGED_CLAWS) && !isDead(t.actor)) await postMarkOffer(actor, t);
}

/** The card a claw hit on a creature that is not the prey posts: *Mark as prey* (02 §7). */
async function postMarkOffer(actor, t) {
  const label = game.i18n.localize("AZEROTH.Prey.MarkButton");
  const text = game.i18n.format("AZEROTH.Prey.ClawOffer", { name: actor.name, target: t.actor.name });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="azeroth azeroth-card azeroth-card-attack" data-message-kind="prey-offer"><div class="azeroth-card-body"><p class="azeroth-card-text">${text}</p>`
      + `<div class="azeroth-card-actions" data-reaction-owner="${actor.uuid}"><button type="button" data-sovereign-mark="${t.token?.uuid ?? t.actor.uuid}">${label}</button></div></div></div>`,
    flags: { [SCOPE]: { kind: "preyOffer", sovereignUuid: actor.uuid, targetUuid: t.token?.uuid ?? t.actor.uuid } }
  });
}

/**
 * **THE WILL LANE** (R17: your prey failing a Resilience Test against your spell, feature or talent gives
 * 1, once a round), read in `dice/chat.mjs#rollResists` on the client that rolled the Test. Which
 * Sovereign it was against: a feeding card's, an escape record's caster, else the card's maker.
 */
export async function tributeAfterResist({ message, actor, maker = null, purpose = null, passed = true, result = null } = {}) {
  if (!result || passed) return null;
  const flags = message?.flags?.[SCOPE] ?? {};
  let sovereignUuid = null;
  if (purpose === "feeding") sovereignUuid = flags.feeding?.sovereignUuid ?? null;
  else if (purpose === "escape") sovereignUuid = flags.escape?.by ?? null;
  else if (purpose === "spell" || purpose === null || purpose === undefined) sovereignUuid = maker?.uuid ?? null;
  if (!sovereignUuid) return null;
  let sovereign = null;
  try {
    sovereign = fromUuidSync(sovereignUuid);
  } catch {
    sovereign = null;
  }
  if (!sovereign || !tributePoolOf(sovereign) || !isPrey(sovereign, actor)) return null;
  return askFor(sovereign, { act: "will", sovereignUuid, from: refOf(tokenOf(actor)) });
}

/* ------------------------------------------------------------------ */
/*  The prey (C4)                                                       */
/* ------------------------------------------------------------------ */

/**
 * **MARK A CREATURE AS YOUR PREY** (02 §7's Hunt Mortal, Blood-Forged Claws and Unending Pursuit), judged
 * before anything is written. Hunt Mortal's once a turn is the round's record (`hunt-mortal@<turn>`);
 * Unending Pursuit's free mark is spent by the mark that uses it. Marking a new prey leaves Tribute alone.
 *
 * @param {Actor} actor
 * @param {Token|TokenDocument|Actor|object} target
 * @param {{way?: "hunt"|"claws"|"pursuit"}} [o]
 */
export async function markPrey(actor, target, { way = "hunt" } = {}) {
  const t = resolveTarget(target);
  if (!t.actor) {
    ui.notifications?.warn(game.i18n.format(PREY_REFUSAL_WORDS.target, { name: actor?.name ?? "" }));
    return { ok: false, reason: "target" };
  }
  const fight = actor.activeFight?.() ?? null;
  const combatant = combatantOf(actor);
  const marks = roundMarks(actor);
  const turnKey = fight ? `${HUNT_MARK}@${fight.turn ?? 0}` : null;
  const freeMark = marks.includes(PURSUIT_FREE_MARK);
  const feature = way === "claws" ? BLOOD_FORGED_CLAWS : HUNT_MORTAL;
  const myToken = tokenOf(actor);
  const feet = myToken && t.token ? footprintsFeet(myToken, t.token) : null;
  const refusal = preyRefusal({
    way, holds: actor.hasFeature?.(feature) === true || (way === "pursuit" && actor.hasFeature?.(UNENDING_PURSUIT) === true),
    self: t.actor === actor, same: isPrey(actor, target), inFight: Boolean(fight && combatant),
    ownTurn: Boolean(combatant && fight?.combatant?.id === combatant.id),
    markedThisTurn: Boolean(turnKey && marks.includes(turnKey)), freeMark, feet, health: t.actor.system?.health?.value ?? 0
  });
  if (refusal) {
    ui.notifications?.warn(game.i18n.format(PREY_REFUSAL_WORDS[refusal], { name: actor.name, target: t.actor.name, feet: 60 }));
    return { ok: false, reason: refusal };
  }
  // Hunt Mortal's mark this turn, or Unending Pursuit's free one spent (the round's record, D-761's queue).
  if (combatant && way !== "claws") {
    if (turnKey && marks.includes(turnKey) && freeMark) await combatant.releaseRoundMarks?.({ round: fight.round, once: [PURSUIT_FREE_MARK] });
    else if (turnKey) await combatant.markRoundOnce(turnKey);
  }
  const mark = preyMark({
    actorUuid: t.actor.uuid, tokenUuid: t.token?.uuid ?? null, name: t.token?.name ?? t.actor.name,
    combatId: fight && combatant ? fight.id : null, round: fight?.round ?? null, turn: fight?.turn ?? null, now: now(), way
  });
  // The mark and its cue in one write: every client's `updateActor` hook plays the mark (D-994's shape).
  const cue = preyCue({ holder: refOf(myToken), prey: refOf(t.token), way });
  await actor.update({ [`flags.${SCOPE}.${PREY_FLAG}`]: mark }, cue ? { [PREY_CUE_OPTION]: cue } : {});
  ui.notifications?.info(game.i18n.format("AZEROTH.Prey.Marked", { name: actor.name, target: mark.name }));
  return { ok: true, mark };
}

/** Clear the mark by hand (the Combat tab's Clear). */
export async function clearPrey(actor) {
  if (!actor?.getFlag?.(SCOPE, PREY_FLAG)) return actor;
  return actor.unsetFlag(SCOPE, PREY_FLAG);
}

/**
 * **THE PREY'S DEATH** (02 §7: *The mark ends when your prey dies*; Unending Pursuit: *When your prey dies,
 * whoever killed it, gain 1 Tribute. You may then mark a new prey, even if you have marked one this
 * turn*), on the active GM's client off the death watch: every Sovereign whose prey it was loses the mark,
 * and one holding Unending Pursuit gains 1 Tribute and the free mark. The time it died is recorded for
 * the corpse window (`DIED_AT_FLAG`).
 */
async function onPreyDeath(event) {
  if (!event?.died) return;
  const dead = event.actor;
  try {
    await dead?.setFlag?.(SCOPE, DIED_AT_FLAG, now());
  } catch (err) {
    console.warn("azeroth-rpg | a death's time was not written", err);
  }
  for (const sovereign of values(game.actors)) {
    const mark = cleanPrey(sovereign?.getFlag?.(SCOPE, PREY_FLAG) ?? null);
    if (!mark || (mark.actorUuid !== dead?.uuid && mark.tokenUuid !== (dead?.token?.uuid ?? null))) continue;
    await askFor(sovereign, { act: "preyDied", sovereignUuid: sovereign.uuid, deadUuid: dead.uuid, from: refOf(tokenOf(dead)) });
  }
}

/* ------------------------------------------------------------------ */
/*  The query                                                           */
/* ------------------------------------------------------------------ */

/**
 * **EVERY WRITE ASKED OF ANOTHER CLIENT** (`CONFIG.queries[SOVEREIGN_QUERY]`), judged again here:
 *
 * - `feed` - the Vitae a judged feeding gives, on the Sovereign's answerer (an owner);
 * - `tribute` / `will` - a Tribute gain, the will lane's once a round marked on the round's record first;
 * - `preyDied` - the mark ended, and Unending Pursuit's Tribute and free mark;
 * - `drain` - the creature's Health a feeding takes, on the GM's client;
 * - `resolveCard` - a feeding card's landing recorded, on the GM's client.
 */
export async function sovereignQueryHandler(payload = {}, { user = null } = {}) {
  const act = payload?.act ?? null;
  const get = uuid => { try { return uuid ? fromUuidSync(uuid) : null; } catch { return null; } };
  // **THE ASKER IS JUDGED AND THE CARD IS READ, NEVER THE PAYLOAD** (D-982; the fix pass's B1, the
  // Necromancer handler's shape): a GM, or a user owning an actor the act names; a feeding off its card.
  const gm = !user || user.isGM === true;
  const owns = doc => gm || doc?.testUserPermission?.(user, "OWNER") === true;
  const refused = reason => ({ ok: false, reason, words: game.i18n.localize(`AZEROTH.SovereignAsk.${reason}`) });
  if (act === "drain" || act === "resolveCard") {
    if (game.user?.isGM !== true) return refused("notGM");
    const message = payload.messageId ? (game.messages?.get(payload.messageId) ?? null) : null;
    const plan = message?.flags?.[SCOPE]?.feeding ?? null;
    if (act === "resolveCard") {
      if (!plan) return refused("noCard");
      // The roller owns the creature that rolled; the result is that creature's own Test, made after the card.
      if (!owns(get(plan.targetUuid))) return refused("notYours");
      if (plan.resolved === true) return { ok: true, failed: plan.failed === true };
      const result = payload.resultId ? (game.messages?.get(payload.resultId) ?? null) : null;
      const judged = feedingResult({ plan, speakerUuid: result ? (ChatMessage.getSpeakerActor(result.speaker)?.uuid ?? null) : null,
        outcome: result?.rolls?.[0]?.outcome?.success ?? null, after: Boolean(result) && (Number(result.timestamp) || 0) >= (Number(message.timestamp) || 0) });
      if (!judged.ok) return refused(judged.reason);
      await message.setFlag(SCOPE, "feeding", { ...plan, resolved: true, failed: judged.failed, resultId: result.id });
      return { ok: true, failed: judged.failed };
    }
    const prey = get(plan?.targetUuid ?? payload.targetUuid);
    const sovereign = get(plan?.sovereignUuid ?? payload.sovereignUuid);
    if (!prey || sovereign?.documentName !== "Actor") return { ok: false, reason: "gone" };
    const claim = feedingClaim({ named: Boolean(payload.messageId), card: plan, sovereignUuid: sovereign.uuid, once: "drained",
      asker: { gm, owns: owns(sovereign) } });
    if (!claim.ok) return refused(claim.reason);
    let loss = 0;
    if (claim.fromCard) {
      if (!owns(prey) && !owns(sovereign)) return refused("notYours");
      loss = feedingHealthLoss({ mode: plan.mode, tier: sovereign.system?.tier ?? 1 });
      await message.setFlag(SCOPE, "feeding", { ...plan, drained: true });
    } else {
      // A free feeding no card records: judged again here, off the world (a creature with blood, in reach,
      // not fed on today unless the Blood Monarch's Red Feast), and the loss is the tier's.
      const free = cleanFeedPlan({ ...payload, sovereignUuid: sovereign.uuid, targetUuid: prey.uuid }, { tier: sovereign.system?.tier ?? 1, monarch: sovereign.shape?.kind === BLOOD_MONARCH.kind });
      const verdict = feedVerdict(sovereign, prey, { mode: free.mode, free: true, anyDay: free.anyDay });
      if (verdict.refusal) return { ok: false, reason: verdict.refusal, words: feedWords(verdict.refusal, sovereign, prey) };
      loss = feedingHealthLoss({ mode: free.mode, tier: sovereign.system?.tier ?? 1 });
    }
    if (loss > 0) await prey.loseHealth(loss);
    return { ok: true, loss };
  }
  const sovereign = get(payload.sovereignUuid);
  if (sovereign?.documentName !== "Actor" || !sovereign.isOwner) return { ok: false, reason: "notOwner" };
  if (act === "feed") {
    const card = payload.messageId ? (game.messages?.get(payload.messageId) ?? null) : null;
    const plan = card?.flags?.[SCOPE]?.feeding ?? null;
    const claim = feedingClaim({ named: Boolean(payload.messageId), card: plan, sovereignUuid: sovereign.uuid, once: "fed", asker: { gm, owns: owns(sovereign) } });
    if (!claim.ok) return refused(claim.reason);
    if (claim.fromCard) {
      // The card's plan, landed once: its creature, its mode, its numbers.
      if (card.isOwner) await card.setFlag(SCOPE, "feeding", { ...plan, fed: true });
      return writeFeeding(sovereign, { ...plan, holder: plan.holder ?? null, corpse: plan.corpse ?? null });
    }
    return writeFeeding(sovereign, cleanFeedPlan({ ...payload, sovereignUuid: sovereign.uuid }, { tier: sovereign.system?.tier ?? 1, monarch: sovereign.shape?.kind === BLOOD_MONARCH.kind }));
  }
  if (act === "tribute") return tributeAsked(sovereign, payload, user);
  if (act === "will") {
    const combatant = combatantOf(sovereign);
    const verdict = willGain({ failed: true, isPrey: true, fromSovereign: true, marks: roundMarks(sovereign), inFight: Boolean(combatant) });
    if (!verdict.gain) return { ok: false, reason: "round" };
    if (verdict.mark && combatant) {
      const marked = await combatant.markRoundOnce(WILL_MARK);
      if (!marked?.added) return { ok: false, reason: "round" };
    }
    const r = await gainTribute(sovereign, verdict.gain, "will", { from: payload.from ?? null });
    if (r?.ok) ui.notifications?.info(game.i18n.format("AZEROTH.Tribute.Will", { name: sovereign.name, n: r.gained }));
    return r;
  }
  if (act === "preyDied") {
    // The death watch asks from the active GM, about the prey the mark names, and the prey is dead (the review's B1).
    const mark = cleanPrey(sovereign.getFlag?.(SCOPE, PREY_FLAG) ?? null);
    const dead = get(payload.deadUuid);
    const judged = preyDiedClaim({ asker: { gm }, marked: Boolean(mark && dead && (mark.actorUuid === dead.uuid || mark.tokenUuid === (dead.token?.uuid ?? null))), dead: Boolean(dead) && isDead(dead) });
    if (!judged.ok) return refused(judged.reason);
    await clearPrey(sovereign);
    if (!sovereign.hasFeature?.(UNENDING_PURSUIT)) return { ok: true };
    const combatant = combatantOf(sovereign);
    if (combatant) await combatant.markRoundOnce(PURSUIT_FREE_MARK);
    const r = tributePoolOf(sovereign) ? await gainTribute(sovereign, 1, "pursuit", { from: payload.from ?? null }) : null;
    ui.notifications?.info(game.i18n.format("AZEROTH.Prey.Pursuit", { name: sovereign.name, n: r?.gained ?? 0 }));
    return { ok: true, gained: r?.gained ?? 0 };
  }
  throw new Error(`sovereign: no such act ${JSON.stringify(act)}`);
}

/* ------------------------------------------------------------------ */
/*  Registration                                                        */
/* ------------------------------------------------------------------ */

/** The public surface, for the sheet, the feature rows, a macro and the Quench batch. */
export const SOVEREIGN_CORE = Object.freeze({
  payVitae, vitaeRefusal, loseHealthForVitae, feedOn, feedWithDialog, feedingAfterTest, drinkVial,
  gainTribute, askTribute, markPrey, clearPrey, preyOf, isPrey, latchedOn, feedVerdict
});

let registered = false;
/**
 * Register the claw lane, the prey's death and the card's *Mark as prey* button. Called once at init.
 */
export async function registerSovereignCore() {
  if (registered) return;
  registered = true;
  footprints = await import("../canvas/footprints.mjs").catch(() => null);
  onClawHit(payload => { onClaw(payload).catch(err => console.warn("azeroth-rpg | the claw lane", err)); });
  const { onDeath } = await import("./death-watch.mjs");
  onDeath(onPreyDeath);
  Hooks.on("renderChatMessageHTML", (message, html) => {
    for (const button of html?.querySelectorAll?.("[data-sovereign-mark]") ?? []) {
      button.addEventListener("click", async event => {
        event.preventDefault();
        const sovereign = (() => { try { return fromUuidSync(message.flags?.[SCOPE]?.sovereignUuid); } catch { return null; } })();
        const target = (() => { try { return fromUuidSync(button.dataset.sovereignMark); } catch { return null; } })();
        if (!sovereign?.isOwner) return;
        await markPrey(sovereign, target, { way: "claws" });
      });
    }
  });
  // **THE VITAE-TO-0 MARK DIES WITH A HEALTH RISE** (the review's S2): healed and dropped again, a Sovereign is
  // Dying from a blow, never from the payment the mark records. The active GM clears it (the open spends it too).
  Hooks.on("updateActor", (actor, changed) => {
    if (!foundry.utils.hasProperty(changed, "system.health.value") || !(Number(actor.system?.health?.value) > 0)) return;
    if (game.users?.activeGM?.isSelf !== true || actor.getFlag?.(SCOPE, VITAE_TO_ZERO_FLAG) === undefined) return;
    actor.unsetFlag(SCOPE, VITAE_TO_ZERO_FLAG).catch(err => console.warn("azeroth-rpg | the Vitae-to-0 mark", err));
  });
  const attach = () => {
    if (game.system?.azeroth) game.system.azeroth.sovereign = SOVEREIGN_CORE;
  };
  attach();
  Hooks.once("ready", attach);
}
