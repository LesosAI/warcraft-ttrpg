/**
 * **THE CHRONOMANCER'S DOORS AND WRITES** (02 §7's features and 04's Shifting Sands and
 * Chronoweaver; stage 2b). `rules/chronomancer.mjs` is the law; this module is the one
 * place its judgements become writes, each on the client that may make them - here where
 * this client owns the creature, on the active GM's through `CHRONO_QUERY` where it does
 * not, the handler judging the giver again off the documents.
 *
 * - **The Use doors** (`judgeChronoUse`, `landChronoUse`), called by `workflows.useFeature`
 *   beside the Champion's: every Chronomancer feature and talent Use, judged and picked
 *   before anything is paid (D-768's order), then landed once it is paid.
 * - **The turn start** (`chronoTurnStart`, from `AzerothCombat#_onStartTurn`): Master of
 *   Hours' stacking Half-Actions, Recurrence's and Echoing Sands' landings.
 * - **The card's doors** (`afterSpellBlow`, `afterSpellHeal`, `chronoAfterResist`, from
 *   `dice/chat.mjs`): what a spell's Apply records to land again, a failed Resist's Suspend,
 *   Arrested Moment's Stun and Temporal Loop's return.
 * - **The offers** (`offerTemporalLoop`, `offerUnfading`): a card row to the holder's
 *   owner (D-779), pressed through the granted feature's own door.
 * - **The readers the other doors ask** (`suspendedNow`, `witheringHalves`,
 *   `disengageBarred`, `sharedHours`).
 */

import { AZEROTH } from "../config.mjs";
import { talentEffect } from "../rules/talent-effects.mjs";
import {
  AGAIN_FLAG, CHRONO_FEATURES, MASTER_FLAG, RECALL_FLAG, RECURRENCE_FLAG, SUSPENDED_MOMENT_FLAG, SUSPEND_FLAG,
  againAmount, againRow, allSandRefusal, appendAgain, arrestedMomentFires, collapseDamage, collapseStrikes, disengageBarredBy,
  echoAmount, givenHalfRefusal, heavyHoursBanes, heldDuration, holdOutOfTime, masterOfHoursTurn, poolRegain, quickstepFeet, recallHeal, recallMark, recallStands,
  recurrenceTakes, restorablePools, restorableUses, sharedHoursGain, slipstreamFor, suspendableConditions,
  suspendedBy, temporalLoopRefusal, unfadingRefusal, witheredHeal, atRankRow, chronoRows
} from "../rules/chronomancer.mjs";
import { HASTENED_FLAG } from "../rules/chromatic-talents.mjs";
import { DECAY_FLAG } from "../rules/decay.mjs";
import { LAID_BY_FLAG } from "../rules/talent-gates.mjs";
// 07 §12's Stasis: its repeat Test rides its Stunned (O-306).
import { ESCAPE_FLAG } from "../rules/escapes.mjs";
import { IMMUNE_FLAG } from "../rules/legacy-uses.mjs";
import { SPELL_USES_FLAG, spentSpellUses } from "../rules/spell-limits.mjs";
import { giveBackSpellUse, spellNameOn } from "./spell-limits.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { inflictCondition } from "./inflict.mjs";
import { untilEncounterEnd, untilEndOfNextTurnOrRound, untilNextTurnOrRound } from "./durations.mjs";
// One judgement of a GM write nobody can make (D-774's review; stage 11, D-906).
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { keyedQueue } from "../rules/keyed-queue.mjs";

/** The query a write on a creature this client does not own goes through. */
export const CHRONO_QUERY = "azeroth-rpg.chronomancer";

/** The offer cards (Temporal Loop, Unfading) share Rewind's one-row template. */
const OFFER_TEMPLATE = "systems/azeroth-rpg/templates/chat/rewind-offer.hbs";

/* -------------------------------------------- */
/*  Small readers                                */
/* -------------------------------------------- */

/** Resolve a document by uuid, quietly. */
function docAt(uuid) {
  if (!uuid || typeof uuid !== "string") return null;
  try {
    return fromUuidSync(uuid);
  } catch {
    return null;
  }
}

/** The actor a target snapshot names. */
function actorOfTarget(t) {
  const scene = (t?.sceneId && game.scenes.get(t.sceneId)) || canvas?.scene || null;
  const token = t?.tokenId ? scene?.tokens?.get(t.tokenId) : null;
  return token?.actor ?? (t?.actorId ? game.actors.get(t.actorId) : null) ?? null;
}

/** The token document a target snapshot names, on its own scene. */
function tokenDocOfTarget(t) {
  const scene = (t?.sceneId && game.scenes.get(t.sceneId)) || canvas?.scene || null;
  if (t?.tokenId) return scene?.tokens?.get(t.tokenId) ?? null;
  const actor = actorOfTarget(t);
  return actor?.getActiveTokens?.(true)?.[0]?.document ?? null;
}

/** A creature's own token document on the viewed board, or on any scene it stands on. */
function ownTokenDoc(actor) {
  if (!actor) return null;
  if (actor.isToken && actor.token) return actor.token;
  return actor.getActiveTokens?.(true)?.[0]?.document ?? actor.getDependentTokens?.()?.[0] ?? null;
}

/** Feet between two creatures' tokens where both stand on one scene, else null. */
function feetBetween(a, b) {
  if (!a || !b) return null;
  if (a.uuid === b.uuid) return 0;
  const ta = ownTokenDoc(a);
  const tb = ownTokenDoc(b);
  if (!ta || !tb || ta.parent?.id !== tb.parent?.id) return null;
  return feetApart(ta, tb);
}

/** Whether `other` counts as the giver's ally: the giver itself, or the one ally rule. */
async function isAlly(giver, other) {
  if (!giver || !other) return false;
  if (giver.uuid === other.uuid) return true;
  const { allyOf } = await import("../canvas/engaged.mjs");
  return allyOf(giver, other) === true;
}

/**
 * **Whether `other` is WILLING to take the user's Use** (the lead, 2026-11-10: *"296 - ally means
 * willing target"*; 2026-11-11: *"300 - neutral can be willing"*, D-900): the ONE predicate the
 * range door reads (`canvas/range.mjs#willingOf` over `rules/target-line.mjs#willingFrom`) - the
 * user, D-755's ally, a NEUTRAL creature in a fight or out of one, and outside a shared fight a
 * token on the user's own side of the board. Every Use whose words say *willing* or *ally* of the
 * creature it is aimed at asks this, never `isAlly`, which stays for a talent that gives the user
 * something back for helping an ally (Shared Hours, Unfading's trigger).
 */
async function isWilling(user, other, otherToken = null) {
  if (!user || !other) return false;
  if (user.uuid === other.uuid) return true;
  const { willingOf } = await import("../canvas/range.mjs");
  return willingOf(user, other, { otherToken: otherToken ?? null }) === true;
}

/** The creature's combatant in its own started fight, or null. */
function combatantOf(actor) {
  const fight = actor?.activeFight?.() ?? null;
  return fight?.started ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
}

/** The Sand pool, or null. */
function sandPool(actor) {
  return (actor?.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === "sand") ?? null;
}

/** Take `amount` Sand off the pool as it stands now; answers what was taken. */
export async function spendSand(actor, amount) {
  const pool = sandPool(actor);
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!pool || !n) return 0;
  const take = Math.min(n, Math.max(0, Math.trunc(Number(pool.value)) || 0));
  if (take > 0) await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value: pool.value - take });
  return take;
}

/** Sand into the pool, never past the Hourglass's cap; answers what landed. */
async function gainSand(actor, amount) {
  const pool = sandPool(actor);
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!pool || !n) return 0;
  const value = Math.min(pool.max, pool.value + n);
  if (value <= pool.value) return 0;
  await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value });
  return value - pool.value;
}

/** A taken talent's granted counter, by the talent's identifier. */
function counterOf(actor, identifier) {
  const talent = actor?.items?.find?.(i => i.type === "talent" && i.system?.identifier === identifier && (i.system?.taken ?? 0) > 0) ?? null;
  return talent ? (actor.grantedFeature?.(talent.id) ?? null) : null;
}

/** A counter's uses left; a counter with no limit counts as one. */
function usesLeft(counter) {
  if (!counter) return 0;
  if (!counter.system?.uses?.per) return 1;
  return Math.max(0, Math.trunc(Number(counter.system.uses.value)) || 0);
}

/** Strike a use off a counter where it is limited. */
async function strike(counter) {
  if (counter?.system?.uses?.per) await counter.update({ "system.uses.value": Math.max(0, usesLeft(counter) - 1) });
}

/** A one-line card in the drain style, carrying the feature key the animation layer reads. */
async function lineCard(actor, text, { key = "recurrence", targets = [] } = {}) {
  if (!text) return null;
  const token = ownTokenDoc(actor);
  const source = token ? { sceneId: token.parent?.id ?? null, tokenId: token.id } : null;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="azeroth-drain">${foundry.utils.escapeHTML(text)}</p>`,
    flags: { "azeroth-rpg": {
      kind: "feature",
      featureKey: key,
      casting: false,
      targets,
      source: source ?? null,
      chrono: "landsAgain"
    } }
  });
}

/** Run a write here where this client may, else on the active GM's client. */
async function viaGM(op, payload, here, owned) {
  if (owned) return here();
  const gm = game.users?.activeGM ?? null;
  if (!gm) return { ok: false, reason: "AZEROTH.Chrono.NoGM" };
  try {
    return await gm.query(CHRONO_QUERY, { op, ...payload }, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { ok: false, reason: "AZEROTH.Chrono.NoGM" };
  }
}

/**
 * Whether no GM is online to write a creature this client does not own: the repository's ONE
 * judgement (`rules/gm-writes.mjs#gmAbsentFor`), handed the documents this Use would write.
 */
function noGMFor(actors = []) {
  return gmAbsentFor({
    owned: (actors ?? []).filter(Boolean).map(a => a.isOwner === true),
    isGM: game.user?.isGM === true,
    gmActive: Boolean(game.users?.activeGM)
  });
}

/* -------------------------------------------- */
/*  Half-Actions and Reactions given             */
/* -------------------------------------------- */

/**
 * The Half-Action an effect gives a creature at its next turn (Slipstream, Master of
 * Hours' gift): the one `hastened` record `effects/chromatic-flights.mjs#takeHastened`
 * gives at the creature's turn start. A gift from the same giver and source STACKS
 * (`stack`): one record carrying more `halves`, so `hastenedHalves` counts them all. A
 * record marked `uncapped` (Master of Hours' gift; D-877) is given past the cap of six
 * (`rules/extra-halves.mjs#hastenedSplit`, `rules/initiative.mjs#gainHalfActions`).
 *
 * **ONE GIFT AT A TIME ON A CREATURE** (stage 11, D-906; D-761's rule): the stack is a read of
 * `halves` and a write of one more, so two gifts landing together on the client that writes them
 * (two presses, or the GM answering two players' queries) both read 1 and wrote 2. Queued by the
 * creature's uuid, the second reads what the first wrote.
 */
const HALF_WRITES = keyedQueue();

function halfHere(args) {
  return HALF_WRITES.run(args.target.uuid, () => halfWrite(args));
}

async function halfWrite({ by, target, source, combatId, stack, uncapped = false }) {
  const held = target.effects.find(e => {
    const f = e.getFlag("azeroth-rpg", HASTENED_FLAG);
    return f?.by === by.uuid && f?.source === source;
  }) ?? null;
  if (held && stack) {
    const f = held.getFlag("azeroth-rpg", HASTENED_FLAG);
    await held.update({ [`flags.azeroth-rpg.${HASTENED_FLAG}.halves`]: Math.max(1, Math.trunc(Number(f.halves)) || 1) + 1 });
    return { ok: true };
  }
  if (held) await target.deleteEmbeddedDocuments("ActiveEffect", [held.id]);
  await target.createEmbeddedDocuments("ActiveEffect", [{
    name: source, img: "icons/svg/clockwork.svg", origin: by.uuid, ...(untilEncounterEnd(target) ?? {}),
    description: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Hasten.Text", { name: target.name }))}</p>`,
    flags: { "azeroth-rpg": { [HASTENED_FLAG]: { by: by.uuid, source, halves: 1, combat: combatId ?? null, ...(uncapped ? { uncapped: true } : {}) } } }
  }]);
  return { ok: true };
}

/** Give a creature a Half-Action on its next turn, here or on the GM's client. */
export async function giveNextTurnHalf({ by, target, source, combatId = null, stack = false, uncapped = false }) {
  if (!by || !target) return false;
  const done = await viaGM("half", { byUuid: by.uuid, targetUuid: target.uuid, source, combatId, stack, uncapped },
    () => halfHere({ by, target, source, combatId, stack, uncapped }), target.isOwner);
  return done?.ok === true;
}

/** Second Chance's Reaction, through the ally's combatant's own queued door. */
async function reactionHere(target) {
  const combatant = combatantOf(target);
  if (!combatant) return { ok: false, reason: "AZEROTH.Chrono.NeedsFight" };
  const done = await combatant.giveReaction();
  return { ok: done?.given === true };
}

/* -------------------------------------------- */
/*  Suspend and Suspended Moment                 */
/* -------------------------------------------- */

/**
 * **SUSPEND, LAID** (02: *held out of time until the end of its next turn ... While held it
 * is Stunned and immune to damage, and its conditions and effects do not count down*): the
 * Stun through the Inflict door on the creature's own span, the hold's own effect on the
 * same span (read by the damage door, `suspendedNow`), and every other timed effect on it
 * one round longer (`heldDuration`) - the round the hold lasts.
 */
async function suspendHere({ by, target, source, kind = "suspend", cast = null, dc = null }) {
  // **ONE DOOR FOR A HOLD OUT OF TIME** (O-306; the lead: *"306 - I agree"*): Suspend and 07 §12's
  // Stasis share `rules/chronomancer.mjs#holdOutOfTime`, the one judgement of what a hold lays.
  const plan = holdOutOfTime(kind, { dc, cast, caster: by.uuid, source });
  if (!plan) return { ok: false };
  if (plan.carrier === "condition") return stasisHere({ by, target, source, plan });
  const span = untilEndOfNextTurnOrRound(target) ?? {};
  const before = target.effects.filter(e => e.getFlag("azeroth-rpg", SUSPEND_FLAG) === undefined).map(e => e.id);
  await inflictCondition({ victim: target, id: CHRONO_FEATURES.suspend.condition, by, name: target.name, until: untilEndOfNextTurnOrRound(target) });
  for (const id of before) {
    const effect = target.effects.get(id);
    const patch = effect ? heldDuration(effect.duration ?? null, 1) : null;
    if (patch) await effect.update(patch);
  }
  await target.createEmbeddedDocuments("ActiveEffect", [{
    name: source, img: "icons/svg/clockwork.svg", origin: by.uuid, ...span, showIcon: 2,
    description: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Chrono.SuspendText", { name: target.name }))}</p>`,
    flags: { "azeroth-rpg": { [SUSPEND_FLAG]: { source, by: by.uuid } } }
  }]);
  return { ok: true };
}

/**
 * **STASIS, LAID** (07 §12: *On a failure it cannot act, move, speak or be moved, it takes no
 * damage from any source, and nothing already affecting it advances while this runs. It may
 * repeat the Test at the end of each of its turns, and leaves the spell when it succeeds*; O-306):
 * Suspend's door with the open span `holdOutOfTime` gives it - ONE carrier, a **Stunned** with the
 * hold's flag (read by the damage door, `suspendedNow`, and the forced-move door, `unmovableBy`),
 * the held-Sustain mark (O-303's door ends the Sustain once nobody carries one) and 07's repeat
 * Test as its escape (`AzerothCombat#_escapePrompts` offers it at the end of each of its turns; a
 * pass deletes the carrier). No span: it stands while the Sustain does, and the Sustain's end
 * deletes it (`effects/sustained-spells.mjs`'s sweep). *Nothing already affecting it advances*
 * is Temporal Sanctuary's reconciler (`effects/sand-auras.mjs#syncSanctuaryHold`), nudged by the
 * carrier's creation and deletion. Its own carrier, beside any Stunned the creature already had.
 */
async function stasisHere({ by, target, source, plan }) {
  const status = CONFIG.statusEffects?.[plan.condition] ?? null;
  const [made] = await target.createEmbeddedDocuments("ActiveEffect", [{
    name: source, img: status?.img ?? "icons/svg/clockwork.svg", origin: by.uuid, statuses: [plan.condition], showIcon: 2,
    description: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Chrono.StasisText", { name: target.name, source }))}</p>`,
    flags: { "azeroth-rpg": {
      [SUSPEND_FLAG]: { source, by: by.uuid, kind: plan.kind, cast: plan.marks?.cast ?? null },
      ...(plan.marks ?? {}),
      ...(plan.escape ? { [ESCAPE_FLAG]: plan.escape } : {}),
      [LAID_BY_FLAG]: [by.uuid]
    } }
  }]);
  return { ok: Boolean(made) };
}

/** Lay Suspend's hold on a creature, here or on the GM's client. */
export async function laySuspend({ by, target, source = CHRONO_FEATURES.suspend.feature }) {
  const done = await viaGM("suspend", { byUuid: by.uuid, targetUuid: target.uuid, source },
    () => suspendHere({ by, target, source }), target.isOwner);
  return done?.ok === true;
}

/**
 * Lay 07 §12's Stasis on a creature that failed its Test, here or on the GM's client (O-306):
 * Suspend's door, `kind: "stasis"`, naming the cast so the held Sustain ends with its last creature.
 *
 * @param {{by: Actor, target: Actor, source?: string, cast?: string|null, dc?: number|null}} o
 */
export async function layStasis({ by, target, source = "Stasis", cast = null, dc = null }) {
  if (!by || !target) return false;
  const done = await viaGM("stasis", { byUuid: by.uuid, targetUuid: target.uuid, source, cast, dc },
    () => suspendHere({ by, target, source, kind: "stasis", cast, dc }), target.isOwner);
  return done?.ok === true;
}

/** Whether a creature is held out of time now: its holder's name, or null. */
export function suspendedNow(actor) {
  return suspendedBy([...(actor?.effects ?? [])]);
}

/**
 * **SUSPENDED MOMENT, LAID** (04: *the conditions on ... allies ... are suspended: they do
 * nothing and do not count down*, *until the start of your next turn*): every condition
 * effect switched off and one round longer, and the suspension's own effect naming them,
 * spanned to the holder's next turn - whose end (`registerChronoHooks`'
 * `deleteActiveEffect`) switches them back on.
 */
async function suspendMomentHere({ by, target, source }) {
  const ids = suspendableConditions([...target.effects], Object.keys(AZEROTH.conditions ?? {}));
  // The suspension's own record FIRST, naming what it holds, then the conditions switched off: a
  // held Sustain's door reads the record to tell a suspended condition from a freed one (O-303,
  // `rules/held-sustains.mjs#suspendedOnly`), and a switch-off it saw before the record would read
  // as the creature freed.
  await target.createEmbeddedDocuments("ActiveEffect", [{
    name: source, img: "icons/svg/clockwork.svg", origin: by.uuid, ...(untilNextTurnOrRound(by) ?? {}),
    description: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Chrono.SuspendedMomentText", { name: target.name }))}</p>`,
    flags: { "azeroth-rpg": { [SUSPENDED_MOMENT_FLAG]: { source, by: by.uuid, held: ids } } }
  }]);
  for (const id of ids) {
    const effect = target.effects.get(id);
    if (!effect) continue;
    await effect.update({ disabled: true, ...(heldDuration(effect.duration ?? null, 1) ?? {}) });
  }
  return { ok: true, held: ids.length };
}

/** Suspend an ally's conditions, here or on the GM's client. */
export async function suspendConditions({ by, target, source }) {
  return viaGM("suspendMoment", { byUuid: by.uuid, targetUuid: target.uuid, source },
    () => suspendMomentHere({ by, target, source }), target.isOwner);
}

/** The conditions a suspension held, switched back on (its end). */
async function resumeSuspended(actor, flag) {
  for (const id of Array.isArray(flag?.held) ? flag.held : []) {
    const effect = actor.effects.get(id);
    if (effect?.disabled) await effect.update({ disabled: false });
  }
}

/* -------------------------------------------- */
/*  Unfading, a pool, a use                      */
/* -------------------------------------------- */

/**
 * **UNFADING, LANDED** (04: *The condition ends, and the ally cannot gain it again until
 * the end of its next turn*): the condition's own effect deleted, and an effect naming it
 * in `immuneTo` (read into `conditionImmunities` by both actor models) on the ally's own
 * span.
 */
async function unfadeHere({ by, target, condition, source }) {
  const held = target.effects.filter(e => e.statuses?.has?.(condition)).map(e => e.id);
  if (held.length) await target.deleteEmbeddedDocuments("ActiveEffect", held);
  await target.createEmbeddedDocuments("ActiveEffect", [{
    name: source, img: "icons/svg/clockwork.svg", origin: by.uuid, ...(untilEndOfNextTurnOrRound(target) ?? {}),
    description: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Chrono.UnfadingText", { name: target.name, condition: game.i18n.localize(AZEROTH.conditions[condition] ?? condition) }))}</p>`,
    flags: { "azeroth-rpg": { [IMMUNE_FLAG]: { conditions: [condition], source, by: by.uuid } } }
  }]);
  return { ok: true, ended: held.length };
}

/** A pool regained, never past its maximum (Echo of Power, The Glass Turns Back). */
async function poolHere({ target, name, kind, amount }) {
  const pool = (target.poolSnapshot?.() ?? []).find(p => p.name === name && p.kind === kind) ?? null;
  const n = poolRegain(pool, amount);
  if (pool && n > 0) await target.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.value + n });
  return { ok: true, regained: n };
}

/** A spent use given back: a counter's one, or a spell's 07 §4 gate opened again. */
async function useHere({ target, key }) {
  if (typeof key !== "string") return { ok: false };
  if (key.startsWith("item:")) {
    const item = target.items.get(key.slice(5));
    const uses = item?.system?.uses;
    if (!uses?.per || !(Number(uses.max) > Number(uses.value))) return { ok: false };
    await item.update({ "system.uses.value": Math.min(Number(uses.max), Number(uses.value) + 1) });
    return { ok: true, name: item.name };
  }
  if (key.startsWith("spell:")) {
    // 07 §4's one record (D-882): one spent use of the spell given back.
    const name = key.slice(6);
    if (!(await giveBackSpellUse(target, name))) return { ok: false };
    return { ok: true, name };
  }
  return { ok: false };
}

/** The spent uses a creature could regain, for the chooser. */
export function spentUsesOf(actor, { pers = [], except = null } = {}) {
  const counters = (actor?.items ?? []).filter(i => i.type === "feature" && i.system?.uses?.per)
    .map(i => ({ id: i.id, name: i.name, per: i.system.uses.per, value: i.system.uses.value, max: i.system.uses.max }));
  // Each spell with a spent use on 07 §4's one record (D-882), shown by the name it is held by.
  const spells = spentSpellUses(actor?.getFlag?.("azeroth-rpg", SPELL_USES_FLAG) ?? {})
    .map(({ key, per }) => ({ name: spellNameOn(actor, key), per }));
  return restorableUses({ counters, spells, pers, except });
}

/* -------------------------------------------- */
/*  Recall and the returns                       */
/* -------------------------------------------- */

/** Recall's mark, standing now, or null. */
export function recallOf(actor) {
  const mark = actor?.getFlag?.("azeroth-rpg", RECALL_FLAG) ?? null;
  return recallStands(mark, game.time?.worldTime ?? 0) ? mark : null;
}

/** A token put back where it stood, as a displacement (Temporal Loop's, Recall's). */
async function returnHere({ tokenUuid, x, y }) {
  const doc = docAt(tokenUuid);
  if (doc?.documentName !== "Token") return { ok: false };
  const done = await doc.move({ x: Math.round(Number(x)), y: Math.round(Number(y)), action: "displace" });
  return { ok: done === true };
}

/* -------------------------------------------- */
/*  Collapse of Hours' blow                      */
/* -------------------------------------------- */

/**
 * Whether Collapse of Hours strikes a creature (04: *every creature within 60 feet that you have
 * Slowed or that carries your Decay*): the pure law (`rules/chronomancer.mjs#collapseStrikes`)
 * over what the creature carries now. The judge and the GM's handler both read it.
 */
function struckByCollapse(target, casterUuid) {
  const effects = [...(target?.effects ?? [])];
  return collapseStrikes({
    slowedBy: effects.filter(e => e.active !== false && e.statuses?.has?.("slowed")).flatMap(e => e.flags?.["azeroth-rpg"]?.[LAID_BY_FLAG] ?? []),
    decayBy: effects.find(e => e.flags?.["azeroth-rpg"]?.[DECAY_FLAG])?.flags["azeroth-rpg"][DECAY_FLAG]?.by ?? null,
    casterUuid
  });
}

/**
 * **COLLAPSE OF HOURS' BLOW, LANDED** on one creature, on the client that may write it: Physical
 * damage, so the Body Armor Points come off it and no Ward does (07 §9's rule, D-853), halved
 * where the Chronomancer's own damage is (`dealtHalvedBy`), through the damage door as no attack.
 */
async function collapseHere({ by, target, rating }) {
  const { resolveDamage } = await import("../rules/mitigation.mjs");
  const { dealtHalvedBy } = await import("../rules/legacy-uses.mjs");
  const ap = target.system?.ap ?? {};
  const r = resolveDamage({ rating, sl: 0, kind: "physical", school: "physical", location: "body",
    apByLocation: { body: ap.body ?? 0, head: ap.head ?? 0, limb: ap.limb ?? 0 }, ward: 0,
    immune: target.system?.immune ?? [], vulnerable: target.system?.vulnerable ?? [], slAddsToDamage: false,
    dealtHalved: dealtHalvedBy(by) });
  await target.applyDamage(r.damage, { struck: true, attack: false, location: "body", type: "physical", by });
  return { ok: true, damage: r.damage };
}

/* -------------------------------------------- */
/*  The query                                    */
/* -------------------------------------------- */

/**
 * The GM-side handler (`CHRONO_QUERY`). The asker must own the giver; every judgement a
 * write rests on is made again here off the documents. Throws with the reason.
 */
export async function chronoQueryHandler(payload = {}, { user = null } = {}) {
  const by = docAt(payload.byUuid);
  const target = docAt(payload.targetUuid);
  if (payload.op !== "return" && (by?.documentName !== "Actor" || target?.documentName !== "Actor")) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (by && user && !by.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: by.name }));
  const holds = name => by?.items?.some?.(i => i.type === "feature" && i.name === name) || by?.items?.some?.(i => i.type === "talent" && i.name === name && (i.system?.taken ?? 0) > 0);
  switch (payload.op) {
    case "speed": {
      if (!holds("Gift of Moments")) throw new Error(game.i18n.localize("AZEROTH.Chrono.NotHeld"));
      return speedHere({ by, target, source: String(payload.source ?? ""), feet: Math.min(10, Math.max(0, Math.trunc(Number(payload.feet)) || 0)) });
    }
    case "half":
      if (!holds(payload.source) && !holds(CHRONO_FEATURES.masterOfHours.feature)) throw new Error(game.i18n.localize("AZEROTH.Chrono.NotHeld"));
      // Uncapped only for Master of Hours' own gift, judged again here (D-877).
      return halfHere({
        by, target, source: String(payload.source ?? ""), combatId: payload.combatId ?? null, stack: payload.stack === true,
        uncapped: payload.uncapped === true && payload.source === CHRONO_FEATURES.masterOfHours.feature && holds(CHRONO_FEATURES.masterOfHours.feature)
      });
    case "reaction":
      if (!holds("Second Chance")) throw new Error(game.i18n.localize("AZEROTH.Chrono.NotHeld"));
      return reactionHere(target);
    case "suspend":
      if (!holds(CHRONO_FEATURES.suspend.feature)) throw new Error(game.i18n.localize("AZEROTH.Chrono.NotHeld"));
      return suspendHere({ by, target, source: String(payload.source ?? CHRONO_FEATURES.suspend.feature) });
    case "stasis": {
      // The caster must know Stasis (07 §12; a Mage's, or a Chronomancer's through Stasis Lore).
      if (!by?.items?.some?.(i => i.type === "spell" && (i.system?.identifier === "stasis" || i.name === "Stasis"))) throw new Error(game.i18n.localize("AZEROTH.Chrono.NotHeld"));
      const dc = Math.trunc(Number(payload.dc));
      return suspendHere({ by, target, source: String(payload.source ?? "Stasis"), kind: "stasis",
        cast: typeof payload.cast === "string" && payload.cast ? payload.cast : null, dc: Number.isFinite(dc) && dc > 0 ? dc : null });
    }
    case "suspendMoment":
      if (!holds("Suspended Moment")) throw new Error(game.i18n.localize("AZEROTH.Chrono.NotHeld"));
      return suspendMomentHere({ by, target, source: String(payload.source ?? "") });
    case "unfade":
      if (!holds("Unfading") || !AZEROTH.conditions?.[payload.condition]) throw new Error(game.i18n.localize("AZEROTH.Chrono.NotHeld"));
      return unfadeHere({ by, target, condition: payload.condition, source: String(payload.source ?? "") });
    case "pool":
      if (!holds("Echo of Power") && !holds("The Glass Turns Back")) throw new Error(game.i18n.localize("AZEROTH.Chrono.NotHeld"));
      return poolHere({ target, name: String(payload.name ?? ""), kind: String(payload.kind ?? ""), amount: payload.amount });
    case "use":
      if (!holds("Recovered Hours") && !holds("The Glass Turns Back")) throw new Error(game.i18n.localize("AZEROTH.Chrono.NotHeld"));
      return useHere({ target, key: payload.key });
    case "return":
      if (by?.documentName !== "Actor" || !holds("Temporal Loop")) throw new Error(game.i18n.localize("AZEROTH.Chrono.NotHeld"));
      return returnHere({ tokenUuid: payload.tokenUuid, x: payload.x, y: payload.y });
    case "collapse": {
      // Collapse of Hours' blow on a creature the asker does not own (stage 11, D-906): judged
      // again here - the talent held, the creature still Slowed by the giver or carrying its
      // Decay, and the Rating no more than the talent can deal with the most Sand the glass holds.
      if (!holds("Collapse of Hours") || !struckByCollapse(target, by.uuid)) throw new Error(game.i18n.localize("AZEROTH.Chrono.NotHeld"));
      const most = collapseDamage({ tier: by.system?.tier ?? 1, spent: sandPool(by)?.max ?? 0, twice: true });
      return collapseHere({ by, target, rating: Math.min(most, Math.max(0, Math.trunc(Number(payload.rating)) || 0)) });
    }
    default:
      throw new Error(`chronomancer: no such op ${JSON.stringify(payload.op ?? null)}`);
  }
}

/* -------------------------------------------- */
/*  The Use doors                                */
/* -------------------------------------------- */

/** A creature targeted, one only: `{actor, token, name}` or null. */
function oneTarget(list = []) {
  const rows = (list ?? []).map(t => ({ t, actor: actorOfTarget(t), token: tokenDocOfTarget(t) })).filter(r => r.actor);
  const uniq = rows.filter((r, i, all) => all.findIndex(x => x.actor.uuid === r.actor.uuid) === i);
  return uniq.length === 1 ? { actor: uniq[0].actor, token: uniq[0].token, name: uniq[0].t?.name ?? uniq[0].actor.name } : null;
}

/** Every creature targeted, once each. */
function targetsOf(list = []) {
  const rows = (list ?? []).map(t => ({ t, actor: actorOfTarget(t), token: tokenDocOfTarget(t) })).filter(r => r.actor);
  return rows.filter((r, i, all) => all.findIndex(x => x.actor.uuid === r.actor.uuid) === i)
    .map(r => ({ actor: r.actor, token: r.token, name: r.t?.name ?? r.actor.name }));
}

/** Warn in words and answer null: the refusal every judgement below ends with. */
function refuse(key, params = {}) {
  ui.notifications?.warn(game.i18n.format(key, params));
  return null;
}

/**
 * **THE CHRONOMANCER'S USES, JUDGED AND PICKED BEFORE ANYTHING IS PAID** (02 §7, 04;
 * D-768's order). Answers null where the Use is refused or a chooser was dismissed -
 * nothing has been spent - else what the Use took, with what it changes about its own
 * price: `free` (no pool spent), `rung` (the action it spends instead, null for none),
 * `noUse` (no use struck), and `cardFlags` the card carries for its later doors.
 *
 * @param {{actor: Actor, item: Item, sys: object, onUse: object|null, list: object[], rank?: number,
 *   grantingTalent?: Item|null, answers?: object|null}} o
 */
export async function judgeChronoUse({ actor, item, sys, onUse, list, rank = 1, grantingTalent = null, answers = null }) {
  const out = { cardFlags: {} };
  if (!onUse) return out;
  const talents = actor.takenTalents?.() ?? [];
  const fight = actor.activeFight?.() ?? null;
  const name = item.name;
  // **ANOTHER TIMELINE IS ASKED IN THE TEST** (02: *a creature ... that has just made* one):
  // the sheet's Use has nothing to answer, so it says where the Reaction is offered.
  if (onUse.askedInTest) return refuse("AZEROTH.Chrono.AskedInTest", { name });
  // **SAND IS GAINED ONLY WITH AN HOURGLASS IN THE RANGED SLOT** (02 §7: *You gain and spend
  // Sand only while an Hourglass is in your Ranged slot*). Stage 4 refused Turn the Glass with no
  // glass (D-895); the lead reversed it (Stage 5, D-898: *"let the player cast this, it's their
  // own mistake"* for a full glass, and *"02 can have a message that requires the hourglass if they
  // cast without one for the"* - the sentence arrived cut off, and this is the orchestrator's
  // reading of it): the Use is NOT refused. It pays its Mana and its Half-Action, gains 0 Sand,
  // and `landChronoUse` says in words on the card and to the player that it needs a glass.
  if (onUse.gain?.pool === "sand" && !((sandPool(actor)?.max ?? 0) > 0)) out.noGlass = true;
  // **02's SLIPSTREAM** (*One ally other than you within 30 feet gains a Half-Action on its
  // next turn*), with Swift Current's reach and Twinned Hours' self at rank 2.
  if (onUse.slipstream) {
    const plan = slipstreamFor(talents, talentEffect);
    const aim = oneTarget(list);
    // **THE RANGE DOOR SAYS THE REST FIRST** (Stage R3; the lead: *"old feature refusals you can
    // address how it makes sense within the system"*): the 30 feet (Swift Current's 60), *other
    // than you* (Twinned Hours' rank 2) and *ally* are `useFeature`'s range door's, widened by
    // `slipstreamFor`, and in the started fight this needs the door's willing IS D-755's ally. Left
    // here: exactly one creature, in the user's started fight - which the door cannot judge.
    const why = givenHalfRefusal({
      targets: aim ? 1 : 0, self: aim?.actor?.uuid === actor.uuid, selfAllowed: true, allyNeeded: false,
      feet: null, reach: plan.feet, inFight: Boolean(fight?.started && aim && fight.getCombatantsByActor(aim.actor)?.length)
    });
    if (why) return refuse(`AZEROTH.Chrono.Given.${why}`, { name, target: aim?.name ?? "", feet: plan.feet });
    if (noGMFor([aim.actor])) return refuse("AZEROTH.Chrono.NoGM");
    out.slipstream = { target: aim.actor, name: aim.name, combatId: fight.id };
  }
  // **02's RECALL** (*mark the space you stand in. For 10 minutes, as a Reaction, you may
  // return to that space without provoking Opportunity Attacks and regain Health equal to
  // the damage you have taken since you marked it*): a Use with a mark standing is the
  // return - the Reaction, no Mana, no use struck - judged here: the token on the mark's
  // scene, the space free.
  if (onUse.recall) {
    const mark = recallOf(actor);
    const token = ownTokenDoc(actor);
    if (!token) return refuse("AZEROTH.Chrono.NoToken", { name });
    if (mark) {
      if (token.parent?.id !== mark.sceneId) return refuse("AZEROTH.Chrono.RecallScene", { name });
      const short = game.system.azeroth.workflows.turnBudgetRefusal(actor, "reaction");
      if (short) return refuse(short.reason, short.params ?? {});
      out.recall = { returning: true, mark, token };
      out.free = true;
      out.rung = "reaction";
      out.noUse = true;
    } else {
      // The mark spends a use; the uses were asked later for this (`usesAskedLater`).
      if (sys.uses?.per && (sys.uses.value ?? 0) <= 0) return refuse("AZEROTH.Feature.NoUses", { name });
      out.recall = { returning: false, token };
    }
  }
  // **02's SUSPEND** (*One creature within 30 feet ... a willing creature, or one that fails a
  // Spirit Resilience Test*): a willing creature (the one predicate, `isWilling`: the user, an
  // ally, a NEUTRAL creature - the lead's *"300 - neutral can be willing"*) is held at once;
  // anyone else is held on the card's failed Resist.
  if (onUse.suspend) {
    const aim = oneTarget(list);
    if (!aim) return refuse("AZEROTH.Laid.OneTarget", { name });
    // *within 30 feet* is the range door's, said first (Stage R3).
    const willing = await isWilling(actor, aim.actor, aim.token);
    if (willing && noGMFor([aim.actor])) return refuse("AZEROTH.Chrono.NoGM");
    out.suspend = { target: aim.actor, name: aim.name, willing };
    out.cardFlags.chronoSuspend = { by: actor.uuid, target: aim.actor.uuid, willing, source: name };
  }
  // **02's RECURRENCE** (*the next spell of tier 3 or lower you cast this turn*): needs a turn
  // to cast in and a next turn to land on, so a started fight (MY READING, said in words).
  if (onUse.recurrence) {
    if (!combatantOf(actor)) return refuse("AZEROTH.Chrono.NeedsFight", { name });
    // **ONE ARMING AT A TIME** (D-913, the lead's adopted recommendation): Echo of the
    // Infinite's press arms the same next spell (`RECURRENCE_FLAG`), so a second arming is
    // refused here, before anything is paid, rather than writing over the first.
    const armed = actor.getFlag("azeroth-rpg", RECURRENCE_FLAG) ?? null;
    if (armed) return refuse("AZEROTH.Chrono.AlreadyArmed", { name, source: armed.source ?? "" });
    out.recurrence = true;
  }
  // **02's MASTER OF HOURS** (*While it lasts, you may spend 2 Sand to give a creature within
  // 30 feet a Half-Action on its next turn*): a Use while it runs is the gift - no Mana, no
  // action (the gift takes none; D-859's reading), 2 Sand.
  if (onUse.masterOfHours) {
    const running = actor.effects.find(e => e.getFlag("azeroth-rpg", MASTER_FLAG)) ?? null;
    if (!combatantOf(actor)) return refuse("AZEROTH.Chrono.NeedsFight", { name });
    if (running) {
      const f = CHRONO_FEATURES.masterOfHours;
      const aim = oneTarget(list);
      // The 30 feet is the range door's (*give a creature within 30 feet*; Stage R3).
      const why = givenHalfRefusal({
        targets: aim ? 1 : 0, self: aim?.actor?.uuid === actor.uuid, selfAllowed: true, allyNeeded: false,
        feet: null, reach: f.giftFeet,
        inFight: Boolean(aim && fight?.getCombatantsByActor(aim.actor)?.length)
      });
      if (why) return refuse(`AZEROTH.Chrono.Given.${why}`, { name, target: aim?.name ?? "", feet: f.giftFeet });
      if ((sandPool(actor)?.value ?? 0) < f.giftSand) return refuse("AZEROTH.Chrono.ShortSand", { name, n: f.giftSand });
      if (noGMFor([aim.actor])) return refuse("AZEROTH.Chrono.NoGM");
      out.gift = { target: aim.actor, name: aim.name, combatId: fight.id };
      out.free = true;
      out.rung = null;
    } else out.master = { combatId: fight.id };
  }
  // ---- the talents ----
  // 04's Gift of Moments: one ally within 30 feet (the user counts, the lead's ally rule).
  if (onUse.gift) {
    const g = atRankRow(onUse.gift, rank);
    const aim = oneTarget(list);
    if (!aim) return refuse("AZEROTH.Laid.OneTarget", { name });
    if (!(await isWilling(actor, aim.actor, aim.token))) return refuse("AZEROTH.Range.NotWilling", { name, target: aim.name });
    if (noGMFor([aim.actor])) return refuse("AZEROTH.Chrono.NoGM");
    out.giftOfMoments = { target: aim.actor, name: aim.name, boons: g.boons ?? 1, speed: g.speed ?? 0 };
  }
  // 04's Quickstep: one willing ally within 30 feet, its space picked now (the step door).
  if (onUse.quickstep) {
    const q = onUse.quickstep;
    const aim = oneTarget(list);
    if (!aim?.token) return refuse("AZEROTH.Laid.OneTarget", { name });
    // Quickstep moves another creature, never the user (a self-target rule the door cannot read).
    if (aim.actor.uuid === actor.uuid) return refuse("AZEROTH.Range.NotSelf", { name });
    if (!(await isWilling(actor, aim.actor, aim.token))) return refuse("AZEROTH.Range.NotWilling", { name, target: aim.name });
    if (noGMFor([aim.actor])) return refuse("AZEROTH.Chrono.NoGM");
    const move = quickstepFeet(rank, q.per);
    const { pickStep } = await import("./steps.mjs");
    const picked = await pickStep(aim.token, { feet: move, sight: "seen", name: aim.name });
    if (!picked) return null;
    out.quickstep = { token: aim.token, to: picked.to, feet: move, name: aim.name };
  }
  // 04's Second Chance: one ally within 30 feet, in the user's started fight.
  if (onUse.secondChance) {
    const aim = oneTarget(list);
    if (!aim) return refuse("AZEROTH.Laid.OneTarget", { name });
    if (!(await isWilling(actor, aim.actor, aim.token))) return refuse("AZEROTH.Range.NotWilling", { name, target: aim.name });
    if (!combatantOf(aim.actor)) return refuse("AZEROTH.Chrono.NeedsFight", { name });
    if (noGMFor([aim.actor])) return refuse("AZEROTH.Chrono.NoGM");
    out.secondChance = { target: aim.actor, name: aim.name };
  }
  // 04's Echo of Power: one ally within 30 feet holding a pool other than Sand with room in it.
  if (onUse.echoOfPower) {
    const e = onUse.echoOfPower;
    const aim = oneTarget(list);
    if (!aim) return refuse("AZEROTH.Laid.OneTarget", { name });
    if (!(await isWilling(actor, aim.actor, aim.token))) return refuse("AZEROTH.Range.NotWilling", { name, target: aim.name });
    const pools = restorablePools(aim.actor.poolSnapshot?.() ?? []);
    if (!pools.length) return refuse("AZEROTH.Chrono.NoPool", { name, target: aim.name });
    const pick = pools.length === 1 ? pools[0] : await pickPool(item, pools, aim.name);
    if (!pick) return null;
    if (noGMFor([aim.actor])) return refuse("AZEROTH.Chrono.NoGM");
    out.echoOfPower = { target: aim.actor, name: aim.name, pool: pick, amount: (e.per ?? 2) * rank };
  }
  // 04's Suspended Moment: as many allies within 30 feet as the rank.
  if (onUse.suspendedMoment) {
    const rows = targetsOf(list);
    if (!rows.length || rows.length > rank) return refuse("AZEROTH.Chrono.TooMany", { name, n: rank });
    for (const r of rows) {
      if (!(await isWilling(actor, r.actor, r.token))) return refuse("AZEROTH.Range.NotWilling", { name, target: r.name });
    }
    if (noGMFor(rows.map(r => r.actor))) return refuse("AZEROTH.Chrono.NoGM");
    out.suspendedMoment = { targets: rows };
  }
  // 04's Recovered Hours and The Glass Turns Back: the allies, and a spent use picked on each.
  if (onUse.recover || onUse.glassTurnsBack) {
    const r = onUse.recover ?? onUse.glassTurnsBack;
    const all = Boolean(onUse.glassTurnsBack);
    let rows;
    if (all) {
      const { creaturesWithin } = await import("../canvas/engaged.mjs");
      rows = [{ actor, token: ownTokenDoc(actor), name: actor.name },
        ...creaturesWithin(actor, r.feet, { who: "ally" }).filter(x => x.actor && x.actor.uuid !== actor.uuid)
          .map(x => ({ actor: x.actor, token: x.token?.document ?? null, name: x.token?.name ?? x.actor.name }))]
        .filter((x, i, a) => a.findIndex(y => y.actor.uuid === x.actor.uuid) === i);
      const why = allSandRefusal(sandPool(actor)?.value ?? 0, r.least);
      if (why) return refuse("AZEROTH.Chrono.AllSand", { name, n: r.least });
    } else {
      rows = targetsOf(list);
      if (!rows.length || rows.length > rank) return refuse("AZEROTH.Chrono.TooMany", { name, n: rank });
      for (const x of rows) {
        if (!(await isWilling(actor, x.actor, x.token))) return refuse("AZEROTH.Range.NotWilling", { name, target: x.name });
      }
    }
    const own = item.id;
    const picks = [];
    for (const x of rows) {
      // *other than this one* (The Glass Turns Back), and never Recovered Hours' own counter
      // (MY READING: a Use that gave back its own use would never be spent).
      const options = spentUsesOf(x.actor, { pers: r.pers, except: x.actor.uuid === actor.uuid ? own : null });
      let use = null;
      if (options.length === 1) use = options[0];
      else if (options.length > 1) {
        const pick = await game.system.azeroth.workflows.chooseOption(item, options.map(o => ({ key: o.key, name: o.name, description: game.i18n.localize(`AZEROTH.Chrono.Per.${o.per}`) })), null,
          { prompt: game.i18n.format("AZEROTH.Chrono.UsePrompt", { name, target: x.name }) });
        if (!pick) return null;
        use = options.find(o => o.key === pick.key) ?? null;
      }
      let pool = null;
      if (all) {
        const pools = restorablePools(x.actor.poolSnapshot?.() ?? [], { exceptSand: false });
        if (pools.length === 1) pool = pools[0];
        else if (pools.length > 1) {
          pool = await pickPool(item, pools, x.name);
          if (!pool) return null;
        }
      }
      picks.push({ ...x, use, pool });
    }
    if (noGMFor(picks.filter(p => p.use || p.pool).map(p => p.actor))) return refuse("AZEROTH.Chrono.NoGM");
    out.restore = { picks, poolAmount: all ? (r.pool ?? 3) : 0, all, least: r.least ?? 0 };
  }
  // 04's Collapse of Hours: all the Sand, at least 3, on every creature in reach the user
  // Slowed or whose Decay it carries.
  if (onUse.collapse) {
    const c = atRankRow(onUse.collapse, rank);
    const held = sandPool(actor)?.value ?? 0;
    if (allSandRefusal(held, c.least)) return refuse("AZEROTH.Chrono.AllSand", { name, n: c.least });
    const { creaturesWithin } = await import("../canvas/engaged.mjs");
    const struck = creaturesWithin(actor, c.feet, { who: "creature" })
      .filter(x => x.actor && x.actor.uuid !== actor.uuid)
      .filter((x, i, a) => a.findIndex(y => y.actor.uuid === x.actor.uuid) === i)
      .filter(x => struckByCollapse(x.actor, actor.uuid));
    // Every creature struck that this client does not own is written on the GM's client
    // (`collapseHere` through `CHRONO_QUERY`), so the GM is asked for BEFORE the Sand is spent.
    if (noGMFor(struck.map(x => x.actor))) return refuse("AZEROTH.Chrono.NoGM");
    out.collapse = { twice: c.twice === true, struck: struck.map(x => ({ actor: x.actor, name: x.token?.name ?? x.actor.name })) };
  }
  // 04's Temporal Loop and Unfading, pressed from the offer their card posted (D-779).
  if (onUse.temporalLoop || onUse.unfading) {
    const message = answers?.messageId ? (game.messages?.get(answers.messageId) ?? null) : null;
    const record = message?.flags?.["azeroth-rpg"]?.chronoOffer ?? null;
    const kind = onUse.temporalLoop ? "temporalLoop" : "unfading";
    if (!record || record.kind !== kind || record.holder !== actor.uuid) return refuse("AZEROTH.Chrono.OfferOnly", { name });
    if (message.flags?.["azeroth-rpg"]?.pressed?.[kind]) return refuse("AZEROTH.TalentLine.Pressed");
    const { offerStillStands } = await import("./chromatic-flights.mjs");
    if (!offerStillStands(record.at ?? null)) return refuse("AZEROTH.Rewind.Stale", { name });
    const target = docAt(record.target)?.actor ?? null;
    if (!target) return refuse("AZEROTH.Card.TargetGone");
    out.offer = { kind, message, record, target };
    if (kind === "temporalLoop") out.cardFlags.chronoLoop = { by: actor.uuid, token: record.target, from: record.from, source: name };
    else {
      const counter = counterOf(actor, grantingTalent?.system?.identifier ?? "unfading");
      const why = unfadingRefusal({ row: talentEffect("Chronomancer", "unfading")?.unfading ?? null, ally: await isAlly(actor, target),
        feet: feetBetween(actor, target), sand: sandPool(actor)?.value ?? 0, reaction: true, usesLeft: usesLeft(counter) });
      if (why) return refuse(`AZEROTH.Chrono.Unfading.${why}`, { name, target: target.name });
      if (!target.statuses?.has?.(record.condition)) return refuse("AZEROTH.Chrono.Unfading.gone", { name, target: target.name });
      if (noGMFor([target])) return refuse("AZEROTH.Chrono.NoGM");
    }
  }
  // **THE GUARDIAN OF TIME'S USES** (stage 2c): Unmade Wound, Timeless Sentinel, and Borrowed
  // Time's word that it is asked in the blow (`effects/guardian.mjs#judgeGuardianUse`).
  const { judgeGuardianUse } = await import("./guardian.mjs");
  const guard = await judgeGuardianUse({ actor, item, onUse, rank });
  if (!guard) return null;
  if (guard.unmade) out.unmade = guard.unmade;
  if (guard.sentinel) out.sentinel = guard.sentinel;
  return out;
}

/** One pool picked through the one chooser. */
async function pickPool(item, pools, targetName) {
  const pick = await game.system.azeroth.workflows.chooseOption(item, pools.map(p => ({
    key: `${p.kind}:${p.name}`, name: game.i18n.localize(AZEROTH.poolTypes[p.name] ?? p.name), description: `${p.value} / ${p.max}`
  })), null, { prompt: game.i18n.format("AZEROTH.Chrono.PoolPrompt", { name: item.name, target: targetName }) });
  return pick ? (pools.find(p => `${p.kind}:${p.name}` === pick.key) ?? null) : null;
}

/**
 * **WHAT THE CHRONOMANCER'S USES DO ONCE PAID FOR** (02 §7, 04), as card lines. Answers
 * `{lines, steps}`: `steps` the moves made, for the card's record (the animation layer
 * plays a departure and an arrival off them).
 */
export async function landChronoUse({ actor, item, chrono, rank = 1, grantingTalent = null }) {
  const lines = [];
  const steps = [];
  if (!chrono) return { lines, steps };
  const name = item.name;
  // Turn the Glass with no Hourglass in the Ranged slot (D-898): paid for, 0 Sand, said in words.
  if (chrono.noGlass) {
    const words = game.i18n.format("AZEROTH.Chrono.NoGlass", { name });
    lines.push(words);
    ui.notifications?.warn(words);
  }
  if (chrono.slipstream) {
    const laid = await giveNextTurnHalf({ by: actor, target: chrono.slipstream.target, source: name, combatId: chrono.slipstream.combatId });
    lines.push(game.i18n.format(laid ? "AZEROTH.Chrono.HalfLaid" : "AZEROTH.Chrono.HalfNotLaid", { name: chrono.slipstream.name, source: name }));
  }
  if (chrono.recall) {
    const r = chrono.recall;
    if (r.returning) {
      const { stepTo, steppedWords } = await import("./steps.mjs");
      const moved = await stepTo({ token: r.token, to: { x: r.mark.x, y: r.mark.y }, by: actor, move: { kind: "self", itemUuid: item.uuid } });
      if (moved.step) steps.push(moved.step);
      lines.push(steppedWords(moved, { source: name }));
      const heal = recallHeal(actor.getFlag("azeroth-rpg", RECALL_FLAG) ?? r.mark);
      await actor.unsetFlag("azeroth-rpg", RECALL_FLAG);
      const before = actor.system?.health?.value ?? 0;
      // **THE HEALTH IS THE REACTION'S, MOVED OR NOT** (the lead's play-test, 2026-11-10: *"We
      // don't need to automate the token movement on use of this as a reaction but the health
      // should be automated."*; D-889). It waited on the step, so a token the player had already
      // put on the mark - or one whose step was refused - regained nothing.
      if (heal > 0) await actor.applyHealing(heal, { from: actor, feature: true, featureName: name });
      lines.push(game.i18n.format("AZEROTH.Chrono.RecallReturned", { name: actor.name, n: Math.max(0, (actor.system?.health?.value ?? before) - before), taken: heal }));
      if (!moved.moved) lines.push(game.i18n.format("AZEROTH.Chrono.RecallMoveByHand", { name: actor.name }));
    } else {
      const mark = recallMark({ sceneId: r.token.parent?.id, tokenId: r.token.id, x: r.token.x, y: r.token.y, elevation: r.token.elevation, time: game.time?.worldTime ?? 0 });
      await actor.setFlag("azeroth-rpg", RECALL_FLAG, mark);
      lines.push(game.i18n.format("AZEROTH.Chrono.RecallMarked", { name: actor.name, minutes: CHRONO_FEATURES.recall.minutes }));
    }
  }
  if (chrono.suspend?.willing) {
    const laid = await laySuspend({ by: actor, target: chrono.suspend.target, source: name });
    lines.push(game.i18n.format(laid ? "AZEROTH.Chrono.SuspendLaid" : "AZEROTH.Chrono.SuspendNotLaid", { name: chrono.suspend.name }));
  } else if (chrono.suspend) lines.push(game.i18n.format("AZEROTH.Chrono.SuspendResist", { name: chrono.suspend.name }));
  if (chrono.recurrence) {
    const combatant = combatantOf(actor);
    await actor.setFlag("azeroth-rpg", RECURRENCE_FLAG, { round: combatant?.combat?.round ?? null, combatId: combatant?.combat?.id ?? null, source: name });
    lines.push(game.i18n.format("AZEROTH.Chrono.RecurrenceArmed", { name: actor.name, tier: CHRONO_FEATURES.recurrence.maxTier }));
  }
  if (chrono.master) {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name, img: item.img, origin: actor.uuid, ...(untilEncounterEnd(actor) ?? {}), showIcon: 2,
      description: `<p>${foundry.utils.escapeHTML(game.i18n.localize("AZEROTH.Chrono.MasterText"))}</p>`,
      flags: { "azeroth-rpg": { [MASTER_FLAG]: { source: name, by: actor.uuid, taken: 0, combat: chrono.master.combatId } } }
    }]);
    lines.push(game.i18n.format("AZEROTH.Chrono.MasterLaid", { name: actor.name }));
  }
  if (chrono.gift) {
    const f = CHRONO_FEATURES.masterOfHours;
    const paid = await spendSand(actor, f.giftSand);
    const laid = paid >= f.giftSand && await giveNextTurnHalf({ by: actor, target: chrono.gift.target, source: name, combatId: chrono.gift.combatId, stack: true, uncapped: true });
    lines.push(game.i18n.format(laid ? "AZEROTH.Chrono.GiftLaid" : "AZEROTH.Chrono.HalfNotLaid", { name: chrono.gift.name, source: name, n: f.giftSand }));
  }
  if (chrono.giftOfMoments) {
    const g = chrono.giftOfMoments;
    const { layBoon } = await import("./banes.mjs");
    const done = await layBoon({ victim: g.target, kind: "all", boons: g.boons, source: name, by: actor, span: untilEndOfNextTurnOrRound(g.target) });
    lines.push(game.i18n.format(done ? "AZEROTH.Chrono.BoonLaid" : "AZEROTH.Chrono.BoonNotLaid", { name: g.name, source: name }));
    if (done && g.speed > 0) {
      await viaGM("speed", { byUuid: actor.uuid, targetUuid: g.target.uuid, source: name, feet: g.speed },
        () => speedHere({ by: actor, target: g.target, source: name, feet: g.speed }), g.target.isOwner);
      lines.push(game.i18n.format("AZEROTH.Chrono.SpeedLine", { name: g.name, n: g.speed }));
    }
    if (done) lines.push(...(await sharedHours(actor, g.target, "boon")));
  }
  if (chrono.quickstep) {
    const q = chrono.quickstep;
    const { stepTo, steppedWords } = await import("./steps.mjs");
    const moved = await stepTo({ token: q.token, to: q.to, by: actor, move: { kind: "friend", itemUuid: item.uuid } });
    if (moved.step) steps.push(moved.step);
    lines.push(steppedWords(moved, { feet: q.feet, source: name }));
  }
  if (chrono.secondChance) {
    const s = chrono.secondChance;
    const done = await viaGM("reaction", { byUuid: actor.uuid, targetUuid: s.target.uuid }, () => reactionHere(s.target), s.target.isOwner);
    lines.push(game.i18n.format(done?.ok ? "AZEROTH.Chrono.ReactionGiven" : "AZEROTH.Chrono.ReactionNotGiven", { name: s.name, source: name }));
    if (done?.ok) lines.push(...(await sharedHours(actor, s.target, "reaction")));
  }
  if (chrono.echoOfPower) {
    const e = chrono.echoOfPower;
    const done = await viaGM("pool", { byUuid: actor.uuid, targetUuid: e.target.uuid, name: e.pool.name, kind: e.pool.kind, amount: e.amount },
      () => poolHere({ target: e.target, name: e.pool.name, kind: e.pool.kind, amount: e.amount }), e.target.isOwner);
    lines.push(game.i18n.format("AZEROTH.Chrono.PoolRegained", { name: e.name, n: Number(done?.regained) || 0, pool: game.i18n.localize(AZEROTH.poolTypes[e.pool.name] ?? e.pool.name), source: name }));
  }
  if (chrono.suspendedMoment) {
    for (const r of chrono.suspendedMoment.targets) {
      const done = await suspendConditions({ by: actor, target: r.actor, source: name });
      lines.push(game.i18n.format("AZEROTH.Chrono.ConditionsSuspended", { name: r.name, n: Number(done?.held) || 0 }));
    }
  }
  if (chrono.restore) {
    const rs = chrono.restore;
    if (rs.all) {
      const spent = await spendSand(actor, sandPool(actor)?.value ?? 0);
      lines.push(game.i18n.format("AZEROTH.Chrono.SandSpent", { name: actor.name, n: spent }));
    }
    for (const p of rs.picks) {
      if (p.use) {
        const done = await viaGM("use", { byUuid: actor.uuid, targetUuid: p.actor.uuid, key: p.use.key }, () => useHere({ target: p.actor, key: p.use.key }), p.actor.isOwner);
        lines.push(game.i18n.format(done?.ok ? "AZEROTH.Chrono.UseRegained" : "AZEROTH.Chrono.UseNotRegained", { name: p.name, use: p.use.name }));
      } else lines.push(game.i18n.format("AZEROTH.Chrono.NoSpentUse", { name: p.name }));
      if (rs.poolAmount > 0 && p.pool) {
        const done = await viaGM("pool", { byUuid: actor.uuid, targetUuid: p.actor.uuid, name: p.pool.name, kind: p.pool.kind, amount: rs.poolAmount },
          () => poolHere({ target: p.actor, name: p.pool.name, kind: p.pool.kind, amount: rs.poolAmount }), p.actor.isOwner);
        lines.push(game.i18n.format("AZEROTH.Chrono.PoolRegained", { name: p.name, n: Number(done?.regained) || 0, pool: game.i18n.localize(AZEROTH.poolTypes[p.pool.name] ?? p.pool.name), source: name }));
      }
    }
  }
  if (chrono.collapse) {
    const spent = await spendSand(actor, sandPool(actor)?.value ?? 0);
    const amount = collapseDamage({ tier: actor.system?.tier ?? 1, spent, twice: chrono.collapse.twice });
    lines.push(game.i18n.format("AZEROTH.Chrono.CollapseLine", { name: actor.name, n: spent, damage: amount }));
    for (const s of chrono.collapse.struck) {
      // **A CREATURE THIS CLIENT DOES NOT OWN IS STRUCK ON THE GM'S** (stage 11, D-906): a player
      // Chronomancer's Collapse wrote an enemy's Health from its own client, core refused it, and
      // the Sand was already spent. The one Chronomancer door, as every other write on a creature.
      const done = await viaGM("collapse", { byUuid: actor.uuid, targetUuid: s.actor.uuid, rating: amount },
        () => collapseHere({ by: actor, target: s.actor, rating: amount }), s.actor.isOwner);
      lines.push(done?.ok
        ? game.i18n.format("AZEROTH.Chrono.CollapseStruck", { name: s.name, n: Number(done.damage) || 0 })
        : game.i18n.format("AZEROTH.Chrono.CollapseNotStruck", { name: s.name }));
    }
  }
  if (chrono.offer) {
    const { claimCardPress } = await import("./card-presses.mjs");
    await claimCardPress(chrono.offer.message, { kind: "once", press: chrono.offer.kind });
    if (chrono.offer.kind === "unfading") {
      const o = chrono.offer;
      const done = await viaGM("unfade", { byUuid: actor.uuid, targetUuid: o.target.uuid, condition: o.record.condition, source: name },
        () => unfadeHere({ by: actor, target: o.target, condition: o.record.condition, source: name }), o.target.isOwner);
      lines.push(game.i18n.format(done?.ok ? "AZEROTH.Chrono.Unfaded" : "AZEROTH.Chrono.NotUnfaded", { name: o.target.name, condition: game.i18n.localize(AZEROTH.conditions[o.record.condition] ?? o.record.condition) }));
    } else lines.push(game.i18n.format("AZEROTH.Chrono.LoopResist", { name: chrono.offer.target.name }));
  }
  // The Guardian of Time's (stage 2c): Unmade Wound's erasing and Timeless Sentinel's effect.
  if (chrono.unmade || chrono.sentinel) {
    const { landGuardianUse } = await import("./guardian.mjs");
    lines.push(...(await landGuardianUse({ actor, item, chrono })));
  }
  return { lines, steps };
}

/**
 * Gift of Moments' Speed at rank 2 (*it also gains 10 feet of Speed until the end of its next
 * turn*): a `final` add on the derived Speed, on the creature's own span, one a giver.
 */
async function speedHere({ by, target, source, feet }) {
  const stale = target.effects.filter(e => e.getFlag("azeroth-rpg", "chronoSpeed")?.by === by.uuid).map(e => e.id);
  if (stale.length) await target.deleteEmbeddedDocuments("ActiveEffect", stale);
  await target.createEmbeddedDocuments("ActiveEffect", [{
    name: game.i18n.format("AZEROTH.Chrono.SpeedName", { source }), img: "icons/svg/wingfoot.svg", origin: by.uuid,
    ...(untilEndOfNextTurnOrRound(target) ?? {}),
    system: { changes: [{ key: "system.speed", type: "add", value: String(Math.max(0, Math.trunc(Number(feet)) || 0)), phase: "final" }] },
    flags: { "azeroth-rpg": { chronoSpeed: { source, by: by.uuid } } }
  }]);
  return { ok: true };
}

/* -------------------------------------------- */
/*  Shared Hours                                 */
/* -------------------------------------------- */

/**
 * **SHARED HOURS** (04: *When a spell or talent of yours gives an ally Health, a Boon, a
 * Half-Action or a Reaction, gain 1 Sand. At rank 2, gain 2*): the giver's Sand, its use
 * struck, on the giver's client (the giver's own write). Answers the card's lines.
 *
 * @param {Actor} giver
 * @param {Actor} target
 * @param {"health"|"boon"|"half"|"reaction"} gives
 */
export async function sharedHours(giver, target, gives) {
  if (!giver?.isOwner || giver.type !== "character") return [];
  const found = chronoRows(giver.takenTalents?.() ?? [], "shared", talentEffect)[0] ?? null;
  if (!found) return [];
  const counter = counterOf(giver, found.talent.identifier);
  const gain = sharedHoursGain({ row: found.row, ally: await isAlly(giver, target), gives, usesLeft: usesLeft(counter) });
  if (!gain) return [];
  const landed = await gainSand(giver, gain);
  if (!landed) return [];
  await strike(counter);
  return [game.i18n.format("AZEROTH.Chrono.SharedHours", { name: giver.name, n: landed, talent: found.talent.name })];
}

/* -------------------------------------------- */
/*  What a spell's card records, and lands again */
/* -------------------------------------------- */

/**
 * **WHAT A SPELL'S APPLY RECORDS TO LAND AGAIN** (02's Recurrence; 04's Echoing Sands): on
 * the caster, the creature's row of what it took - after Armor Points and Ward, never
 * reduced a second time - for the caster's next turn start (`chronoTurnStart`). The card
 * carries `chronoAgain` where the cast took either; Echoing Sands lands on the FIRST
 * creature the card's Apply damages (MY READING of *a creature*: an area's caster names
 * the first applied), and the card's own record of it is struck so a second Apply takes
 * none.
 *
 * @param {{message: ChatMessage, target: Actor, amount: number, kind: "damage"|"heal"}} o
 */
export async function afterSpellApply({ message, target, amount = 0, kind = "damage", full = null, passed = null }) {
  const flags = message?.flags?.["azeroth-rpg"] ?? {};
  const again = flags.chronoAgain ?? null;
  if (!again || !target) return [];
  const caster = docAt(again.by);
  if (caster?.documentName !== "Actor") return [];
  const lines = [];
  const rows = [];
  // **THE TEST MADE AGAIN, AND WHAT LANDS OVER TIME** (02's Recurrence and 08 §20's Echo
  // of the Infinite; the lead: *"Yes, Yes, Yes"*; D-911): a card with a Test records the
  // row's WHOLE amount and what a pass leaves (`full`, `passed`), so the turn start's
  // Test - not this one's - decides it. A tick is not recorded here: its extra landing rides
  // the tick the Apply lays (D-913).
  if (again.recurrence && kind === "damage" && again.test) {
    rows.push(againRow({ kind, amount: full ?? amount, passed, test: again.test, target: target.uuid, type: flags.damageType ?? null, spell: flags.spellName ?? "", source: again.recurrence, combatId: again.combatId }));
  } else if (again.recurrence) rows.push(againRow({ kind, amount, target: target.uuid, type: flags.damageType ?? null, spell: flags.spellName ?? "", source: again.recurrence, combatId: again.combatId }));
  if (again.echo && kind === "damage" && !again.echoDone) {
    rows.push(againRow({ kind: "damage", amount: echoAmount(amount, { whole: again.whole === true }), target: target.uuid, type: flags.damageType ?? null, spell: flags.spellName ?? "", source: again.echo, combatId: again.combatId }));
    if (message.isOwner) await message.update({ "flags.azeroth-rpg.chronoAgain.echoDone": true });
  }
  const kept = rows.filter(Boolean);
  if (!kept.length) return [];
  if (caster.isOwner) {
    let list = caster.getFlag("azeroth-rpg", AGAIN_FLAG) ?? [];
    for (const r of kept) list = appendAgain(list, r);
    await caster.setFlag("azeroth-rpg", AGAIN_FLAG, list);
    for (const r of kept) lines.push(game.i18n.format("AZEROTH.Chrono.AgainRecorded", { name: target.name, n: r.amount, source: r.source }));
  }
  return lines;
}

/**
 * **THE CHRONOMANCER'S TURN START** (from `AzerothCombat#_onStartTurn`, on the active GM's
 * client): Master of Hours' 1, 2 and 3 Half-Actions through the combatant's own queued door
 * (no cap binds them, D-877), the effect ending after its third; what Recurrence and
 * Echoing Sands recorded landing on each creature - damage through the damage door as no
 * attack, healing through the healing door - and Recurrence's unspent arming lapsing with
 * the turn it was armed for. Answers the turn's lines.
 */
export async function chronoTurnStart(combatant) {
  const actor = combatant?.actor ?? null;
  if (!actor || combatant.isDefeated) return [];
  const lines = [];
  const master = actor.effects.find(e => e.getFlag("azeroth-rpg", MASTER_FLAG)) ?? null;
  if (master) {
    const f = master.getFlag("azeroth-rpg", MASTER_FLAG);
    const turn = masterOfHoursTurn(f.taken ?? 0);
    const held = Math.max(0, Math.trunc(Number(combatant.budget?.halfActions)) || 0);
    // No cap binds the stack (the lead: *"the eight half actions a turn is fine because of the
    // resource spend."*; D-877).
    const add = turn.gain;
    if (add > 0) await combatant.grantHalfActions(add, { uncapped: true });
    lines.push(game.i18n.format("AZEROTH.Chrono.MasterTurn", { name: actor.name, n: add, total: held + add }));
    if (turn.done) await actor.deleteEmbeddedDocuments("ActiveEffect", [master.id]);
    else await master.update({ [`flags.azeroth-rpg.${MASTER_FLAG}.taken`]: (f.taken ?? 0) + 1 });
  }
  if (actor.getFlag("azeroth-rpg", RECURRENCE_FLAG)) await actor.unsetFlag("azeroth-rpg", RECURRENCE_FLAG);
  const rows = actor.getFlag("azeroth-rpg", AGAIN_FLAG) ?? [];
  if (Array.isArray(rows) && rows.length) {
    await actor.unsetFlag("azeroth-rpg", AGAIN_FLAG);
    for (const r of rows) {
      const target = docAt(r?.target);
      if (target?.documentName !== "Actor") continue;
      if (r.kind === "heal") {
        await target.applyHealing(r.amount, { from: actor, spell: true });
        lines.push(game.i18n.format("AZEROTH.Chrono.AgainHealed", { name: target.name, n: r.amount, source: r.source }));
      } else {
        // *A creature makes the spell's Resilience Test again when it lands again* (D-911).
        const passed = r.test ? await againResist(target, r) : null;
        const n = againAmount(r, passed);
        if (n > 0) await target.applyDamage(n, { struck: true, attack: false, location: "body", type: r.type, by: actor, spell: true });
        lines.push(game.i18n.format(passed === true && n === 0 ? "AZEROTH.Chrono.AgainResisted" : "AZEROTH.Chrono.AgainDamaged", { name: target.name, n, source: r.source }));
      }
    }
    if (lines.length) await lineCard(actor, lines.at(-1), { key: "recurrence", targets: [] });
  }
  return lines;
}

/**
 * **THE SPELL'S RESILIENCE TEST, MADE AGAIN** (02's Recurrence and 08 §20's Echo of the
 * Infinite: *A creature makes the spell's Resilience Test again when it lands again*; the
 * lead: *"Yes, Yes, Yes"*; D-911): the creature's own Test at the card's DC, rolled on the
 * client landing the row (the active GM's, at the caster's turn start) through the roll
 * pipeline's skip path - every automatic line the creature's own state raises, nothing the
 * table judges (`defaultChoice`, as the Long Rest's exposure Test) - and posted as a
 * Resilience card of its own. True on a pass.
 *
 * @param {Actor} target
 * @param {object} row  an `againRow` carrying `test`
 * @returns {Promise<boolean>}
 */
async function againResist(target, row) {
  const { defaultChoice } = await import("../applications/roll-dialog.mjs");
  const choice = defaultChoice(target, { kind: "resilience", resilience: row.test.resilience, dc: row.test.dc, targets: [] });
  const message = await game.system.azeroth.workflows.rollTest({
    actor: target, kind: "resilience", resilience: row.test.resilience, dc: row.test.dc,
    boons: choice.boons, banes: choice.banes, provenanceExtra: choice.provenanceExtra,
    title: game.i18n.format("AZEROTH.Chrono.AgainTest", { spell: row.spell, source: row.source })
  });
  return message?.rolls?.[0]?.outcome?.success === true;
}

/* -------------------------------------------- */
/*  A failed Resist                              */
/* -------------------------------------------- */

/**
 * **WHAT A RESIST ON A CHRONOMANCER'S CARD LANDS** (from `dice/chat.mjs#rollResists`, on
 * the client that rolled the Test, which owns the creature):
 *
 * - Suspend's card: a failed Test holds the creature (`laySuspend`);
 * - Temporal Loop's card: a failed Test returns the creature to where its move began;
 * - a spell's card: Arrested Moment's Stun on a creature the caster has Slowed, its use
 *   struck on the caster's counter.
 *
 * @param {{message: ChatMessage, actor: Actor, passed: boolean, purpose: string|null, caster: Actor|null}} o
 * @returns {Promise<string[]>}
 */
export async function chronoAfterResist({ message, actor, passed, purpose = null, caster = null, slowedBy: slowedBefore = null }) {
  const flags = message?.flags?.["azeroth-rpg"] ?? {};
  const lines = [];
  if (passed || !actor) return lines;
  const sus = flags.chronoSuspend ?? null;
  if (sus && !sus.willing && sus.target === actor.uuid) {
    const by = docAt(sus.by);
    if (by?.documentName === "Actor" && await laySuspend({ by, target: actor, source: sus.source })) lines.push(game.i18n.format("AZEROTH.Chrono.SuspendLaid", { name: actor.name }));
  }
  const loop = flags.chronoLoop ?? null;
  if (loop && docAt(loop.token)?.actor?.uuid === actor.uuid && loop.from) {
    const by = docAt(loop.by);
    const done = await viaGM("return", { byUuid: by?.uuid ?? null, tokenUuid: loop.token, x: loop.from.x, y: loop.from.y },
      () => returnHere({ tokenUuid: loop.token, x: loop.from.x, y: loop.from.y }), docAt(loop.token)?.isOwner === true);
    lines.push(game.i18n.format(done?.ok ? "AZEROTH.Chrono.LoopReturned" : "AZEROTH.Chrono.LoopNotReturned", { name: actor.name }));
  }
  if (purpose === "spell" && caster?.type === "character") {
    // The counter is found off the talent; whether the Stun fires is the pure law's
    // (`rules/chronomancer.mjs#arrestedMomentFires`, the stage 3 fix: the running door calls it).
    const talents = caster.takenTalents?.() ?? [];
    const found = chronoRows(talents, "arrested", talentEffect)[0] ?? null;
    // *A creature you have Slowed*: the Slowed it carried as the Test was rolled, which the door
    // reads before the failure lays anything (`dice/chat.mjs#rollResists`, the live fix); read
    // off the creature now only where no door handed it.
    const slowedBy = Array.isArray(slowedBefore) ? slowedBefore
      : actor.effects.filter(e => e.active !== false && e.statuses?.has?.("slowed")).flatMap(e => e.flags?.["azeroth-rpg"]?.[LAID_BY_FLAG] ?? []);
    const counter = found ? counterOf(caster, found.talent.identifier) : null;
    const fires = arrestedMomentFires({ talents, slowedBy, casterUuid: caster.uuid, failed: true, spell: true, usesLeft: usesLeft(counter) }, talentEffect);
    if (fires && counter && (caster.isOwner || game.user?.isGM)) {
      const landed = await inflictCondition({ victim: actor, id: fires.condition, by: caster, name: actor.name, until: untilEndOfNextTurnOrRound(actor) });
      if (landed?.landed) {
        await strike(counter);
        lines.push(game.i18n.format("AZEROTH.Chrono.Arrested", { name: actor.name, talent: fires.name }));
      }
    }
  }
  return lines;
}

/* -------------------------------------------- */
/*  The offers                                   */
/* -------------------------------------------- */

/** Post one offer card to a holder's owners. */
async function postOffer({ holder, feature, kind, target, text, label, record }) {
  const owners = (game.users?.contents ?? []).filter(u => holder.testUserPermission?.(u, "OWNER")).map(u => u.id);
  const content = await foundry.applications.handlebars.renderTemplate(OFFER_TEMPLATE, {
    name: feature.name, text, label, holderUuid: holder.uuid, featureId: feature.id, targetUuid: target.uuid
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: holder }), content, whisper: owners,
    flags: { "azeroth-rpg": { kind: "rewindOffer", chronoOffer: { kind, holder: holder.uuid, target: target.uuid, ...record } } }
  });
}

/** The holders on a token's scene of a talent, each with its granted feature and row. */
function holdersOn(scene, identifier, kind) {
  const out = [];
  const seen = new Set();
  for (const t of scene?.tokens ?? []) {
    const holder = t.actor;
    if (!holder || holder.type !== "character" || seen.has(holder.uuid)) continue;
    if ((holder.system?.health?.value ?? 0) <= 0) continue;
    const found = chronoRows(holder.takenTalents?.() ?? [], kind, talentEffect)[0] ?? null;
    if (!found) continue;
    seen.add(holder.uuid);
    const talent = holder.items.find(i => i.type === "talent" && i.system?.identifier === identifier) ?? null;
    const feature = talent ? (holder.grantedFeature?.(talent.id) ?? null) : null;
    if (feature) out.push({ holder, token: t, row: found.row, feature });
  }
  return out;
}

/**
 * **TEMPORAL LOOP'S OFFER** (04: *As a Reaction when a creature you can see within 60 feet
 * ends a move, spend 2 Sand*), from the mover's own client once a move ends
 * (`combat.mjs#onMoveToken`): a card for every holder within its feet of the mover's new
 * space who could pay - a Reaction and the Sand - for a move of one of the holder's
 * ENEMIES (MY READING: the Loop undoes a move, and an offer on every ally's step is a card
 * nobody presses). The move's origin travels on the card.
 */
export async function offerTemporalLoop(combatant, movement) {
  const token = combatant?.token ?? null;
  const mover = combatant?.actor ?? null;
  const origin = movement?.origin ?? null;
  if (!token?.parent || !mover || !origin) return 0;
  const fight = combatant.combat ?? null;
  const { offerMoment } = await import("../rules/chromatic-talents.mjs");
  const at = offerMoment({ combatId: fight?.id ?? null, round: fight?.round ?? null, turn: fight?.turn ?? null, time: game.time?.worldTime ?? 0 });
  const { creaturesWithin } = await import("../canvas/engaged.mjs");
  let posted = 0;
  for (const { holder, token: holderToken, row, feature } of holdersOn(token.parent, "temporal-loop", "loop")) {
    if (holder.uuid === mover.uuid) continue;
    const enemy = creaturesWithin(holder, 1e6, { who: "enemy" }).some(r => r.token?.id === token.id);
    if (!enemy) continue;
    const why = temporalLoopRefusal({ row, feet: feetApart(holderToken, token), sand: sandPool(holder)?.value ?? 0,
      reaction: game.system.azeroth.workflows.turnBudgetRefusal(holder, "reaction") === null });
    if (why) continue;
    await postOffer({
      holder, feature, kind: "temporalLoop", target: token,
      text: game.i18n.format("AZEROTH.Chrono.LoopOffer", { holder: holder.name, name: token.name, talent: feature.name }),
      label: game.i18n.format("AZEROTH.Chrono.LoopPress", { talent: feature.name }),
      record: { at, from: { x: origin.x, y: origin.y } }
    });
    posted += 1;
  }
  return posted;
}

/**
 * **UNFADING'S OFFER** (04: *As a Reaction when an ally within 90 feet gains a condition,
 * spend 2 Sand*), on the active GM's client when a condition's effect is created: a card for
 * every holder within its feet who counts the creature an ally and could pay.
 */
export async function offerUnfading(effect) {
  const actor = effect?.parent?.documentName === "Actor" ? effect.parent : null;
  const condition = [...(effect?.statuses ?? [])].find(id => AZEROTH.conditions?.[id]) ?? null;
  if (!actor || !condition) return 0;
  const token = ownTokenDoc(actor);
  if (!token?.parent) return 0;
  const fight = actor.activeFight?.() ?? null;
  const { offerMoment } = await import("../rules/chromatic-talents.mjs");
  const at = offerMoment({ combatId: fight?.id ?? null, round: fight?.round ?? null, turn: fight?.turn ?? null, time: game.time?.worldTime ?? 0 });
  let posted = 0;
  for (const { holder, token: holderToken, row, feature } of holdersOn(token.parent, "unfading", "unfading")) {
    const why = unfadingRefusal({ row, ally: await isAlly(holder, actor), feet: holder.uuid === actor.uuid ? 0 : feetApart(holderToken, token),
      sand: sandPool(holder)?.value ?? 0, reaction: game.system.azeroth.workflows.turnBudgetRefusal(holder, "reaction") === null, usesLeft: usesLeft(feature) });
    if (why) continue;
    await postOffer({
      holder, feature, kind: "unfading", target: token,
      text: game.i18n.format("AZEROTH.Chrono.UnfadingOffer", { holder: holder.name, name: actor.name, condition: game.i18n.localize(AZEROTH.conditions[condition]), talent: feature.name }),
      label: game.i18n.format("AZEROTH.Chrono.UnfadingPress", { talent: feature.name }),
      record: { at, condition, effectId: effect.id }
    });
    posted += 1;
  }
  return posted;
}

/* -------------------------------------------- */
/*  What the other doors ask                     */
/* -------------------------------------------- */

/**
 * **WITHERING HOURS ON A HEAL** (04: *At rank 2 or higher, a creature inside its area
 * regains only half the Health any healing gives it, rounded down*): the heal a creature
 * takes, halved where it stands inside a Withering Sands area whose caster holds the talent
 * at rank 2. Synchronous; asks the document (`TokenDocument#testInsideRegion`).
 *
 * @param {Actor} actor
 * @param {number} amount
 * @returns {{amount: number, by: string|null}}
 */
export function witheringHalves(actor, amount) {
  const token = ownTokenDoc(actor);
  const scene = token?.parent ?? null;
  if (!scene || !(amount > 0)) return { amount, by: null };
  for (const region of scene.regions ?? []) {
    const f = region.flags?.["azeroth-rpg"] ?? {};
    if (f.spellName !== "Withering Sands" && f.identifier !== "withering-sands") continue;
    const caster = docAt(f.caster);
    const found = caster?.documentName === "Actor" ? chronoRows(caster.takenTalents?.() ?? [], "withering", talentEffect)[0] : null;
    if (!found || found.row.halves !== true) continue;
    let inside = false;
    try { inside = token.testInsideRegion(region); } catch { inside = false; }
    if (inside) return { amount: witheredHeal(amount, { inside: true }), by: found.talent.name };
  }
  return { amount, by: null };
}

/**
 * **HEAVY HOURS AT RANK 2** (04: *At rank 2 it cannot Disengage*): the holder whose Decay
 * bars the creature's Disengage, or null - read off the Decay's own `by`.
 */
export function disengageBarred(actor) {
  const decay = actor?.effects?.find?.(e => e.active !== false && e.flags?.["azeroth-rpg"]?.[DECAY_FLAG])?.flags["azeroth-rpg"][DECAY_FLAG] ?? null;
  if (!decay?.by) return null;
  const holder = docAt(decay.by);
  if (holder?.documentName !== "Actor") return null;
  return disengageBarredBy([{ uuid: holder.uuid, name: holder.name, talents: holder.takenTalents?.() ?? [] }], decay.by, talentEffect);
}

/**
 * The Resist's Banes Heavy Hours lays (04: *A creature carrying your Decay takes a Bane on
 * Reflex Resilience Tests against your spells*), for the Resist's dialog.
 */
export function heavyHoursOn({ resister, caster, resilience }) {
  const decay = resister?.effects?.find?.(e => e.active !== false && e.flags?.["azeroth-rpg"]?.[DECAY_FLAG])?.flags["azeroth-rpg"][DECAY_FLAG] ?? null;
  if (!caster || caster.type !== "character" || !decay) return null;
  // The pure law decides (`rules/chronomancer.mjs#heavyHoursBanes`; the stage 3 fix).
  const heavy = heavyHoursBanes({ talents: caster.takenTalents?.() ?? [], decayBy: decay.by ?? null, casterUuid: caster.uuid, resilience, spell: true }, talentEffect);
  return heavy.banes > 0 ? { banes: heavy.banes, names: [heavy.by] } : null;
}

/* -------------------------------------------- */
/*  Hooks                                        */
/* -------------------------------------------- */

/**
 * The hooks this module needs, on the active GM's client: a condition's arrival offers
 * Unfading, and a suspension's end switches back on what it held. Registered once at
 * `init` (`azeroth.mjs`).
 */
export function registerChronoHooks() {
  Hooks.on("createActiveEffect", effect => {
    if (game.users?.activeGM?.isSelf !== true) return;
    if (![...(effect?.statuses ?? [])].some(id => AZEROTH.conditions?.[id])) return;
    offerUnfading(effect).catch(err => console.warn("azeroth-rpg | Unfading offer", err));
  });
  Hooks.on("deleteActiveEffect", effect => {
    if (game.users?.activeGM?.isSelf !== true) return;
    const flag = effect?.flags?.["azeroth-rpg"]?.[SUSPENDED_MOMENT_FLAG] ?? null;
    const actor = effect?.parent?.documentName === "Actor" ? effect.parent : null;
    if (flag && actor) resumeSuspended(actor, flag).catch(err => console.warn("azeroth-rpg | Suspended Moment", err));
  });
}
