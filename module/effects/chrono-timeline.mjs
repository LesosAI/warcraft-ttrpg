/**
 * **02's ANOTHER TIMELINE, ASKED IN THE TEST** (*As a Reaction, spend 2 Mana. A creature you
 * can see within 30 feet that has just made an Attack Test, a Casting Test or a Resilience
 * Test rolls it again and takes the second result*; stage 2b; the plan's door 2).
 *
 * A card row posted once the Test is on the log cannot roll a die again before its result
 * lands, so it is **asked IN the Test** - the door 04's Paradox and Time Lapse take
 * (`effects/chromatic-reactions.mjs`): at the roller's after-the-die seam
 * (`AzerothActor#offerElunesRegard`), each Chronomancer within 30 feet of the roller - never
 * the roller - holding the feature with 2 Mana and a Reaction is asked yes or no in a dialog
 * on whoever answers for it (`blow-doors.mjs#answererOf`), naming the Test and its result -
 * the feature reads *has just made*, so the result is known (the Paradox dialog hides it
 * because Paradox is answered blind). The holder's client judges again, pays the Reaction and
 * the Mana (D-768's order), and answers; the roller's client then rolls the Test again in
 * place and keeps the second result whatever it is. Friend or foe: *a creature* is the words
 * (seeing it is the table's, and the question says so). A Test whose result is already fixed
 * (a forced SL, a forced miss) takes nothing.
 */

import { AZEROTH } from "../config.mjs";
import { CHRONO_FEATURES, anotherTimelineRefusal } from "../rules/chronomancer.mjs";
import { answerInTime, answerWindow } from "../rules/chromatic-talents.mjs";
import { manaPool } from "../rules/pools.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { ASK_MS, answererOf, confirmHere } from "./blow-doors.mjs";

/** The query a holder is asked through, on whoever answers for it. */
export const TIMELINE_QUERY = "azeroth-rpg.anotherTimeline";

const WINDOW_MS = answerWindow(ASK_MS);
const F = CHRONO_FEATURES.anotherTimeline;

/** Resolve an actor by uuid, quietly. */
function actorAt(uuid) {
  try {
    const doc = uuid ? fromUuidSync(uuid) : null;
    return doc?.documentName === "Actor" ? doc : null;
  } catch {
    return null;
  }
}

/** The holder's feature item, or null. */
function featureOf(holder) {
  return holder?.items?.find?.(i => i.type === "feature" && i.name === F.feature) ?? null;
}

/** The holder's judgement now, against a Test of a kind by a roller at a distance. */
function judgement(holder, { kind, roller, feet, forced = false }) {
  if (!featureOf(holder)) return "unknown";
  return anotherTimelineRefusal({
    kind, forced, self: holder.uuid === roller?.uuid, feet,
    mana: manaPool(holder.poolSnapshot?.() ?? [])?.value ?? 0,
    reaction: game.system.azeroth.workflows.turnBudgetRefusal(holder, "reaction") === null
  });
}

/** The holders on the roller's scene within the feet, each with its distance, by uuid. */
function holdersNear(roller) {
  const at = roller?.getActiveTokens?.(true)?.[0]?.document ?? (roller?.isToken ? roller.token : null);
  if (!at?.parent) return [];
  const out = new Map();
  for (const t of at.parent.tokens ?? []) {
    const holder = t.actor;
    if (!holder || holder.type !== "character" || holder.uuid === roller.uuid || out.has(holder.uuid)) continue;
    if ((holder.system?.health?.value ?? 0) <= 0 || !featureOf(holder)) continue;
    const feet = feetApart(t, at);
    if (feet === null || feet > F.feet) continue;
    out.set(holder.uuid, { holder, feet });
  }
  return [...out.values()].sort((a, b) => a.holder.uuid.localeCompare(b.holder.uuid));
}

/**
 * Ask each holder near enough, the first yes rerolling the Test in place. Answers whether
 * it was rolled again.
 *
 * @param {{roller: Actor, roll: AzerothRoll}} o
 */
export async function askAnotherTimeline({ roller, roll }) {
  const kind = roll?.options?.kind;
  if (!roller || !roll?._evaluated || !F.kinds.includes(kind) || roll.options.anotherTimeline) return false;
  const forced = (roll.options.forcedSl !== undefined && roll.options.forcedSl !== null) || roll.options.forcedMiss === true;
  if (forced) return false;
  for (const { holder, feet } of holdersNear(roller)) {
    if (judgement(holder, { kind, roller, feet })) continue;
    const payload = { holderUuid: holder.uuid, rollerUuid: roller.uuid, kind, total: roll.total, feet };
    const who = answererOf(holder);
    if (!who) continue;
    let answer = null;
    try {
      answer = who.id === game.user.id ? await timelineHere(payload, holder, roller) : await who.query(TIMELINE_QUERY, payload, { timeout: ASK_MS });
    } catch (err) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.BlowDoor.NoAnswer", { name: holder.name, reason: err.message }));
      continue;
    }
    if (answer?.yes !== true) continue;
    const second = roll.clone();
    await second.evaluate();
    const first = roll.total;
    roll.terms = second.terms;
    roll._total = second._total;
    roll._dice = second._dice;
    roll.options.anotherTimeline = { by: holder.uuid, totals: [first, second.total] };
    roll.options.provenance ??= [];
    roll.options.provenance.push({ label: F.feature, value: null, formula: game.i18n.format("AZEROTH.Chrono.TimelineRow", { holder: holder.name, first, second: second.total }) });
    // A card for the animation layer (`featureKey`), naming the creature that rolled again.
    const token = roller.getActiveTokens?.(true)?.[0]?.document ?? null;
    const holderToken = holder.getActiveTokens?.(true)?.[0]?.document ?? null;
    const source = holderToken ? { sceneId: holderToken.parent?.id ?? null, tokenId: holderToken.id } : null;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: holder }),
      content: `<p class="azeroth-drain">${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Chrono.TimelineLine", { holder: holder.name, name: roller.name, first, second: second.total }))}</p>`,
      flags: { "azeroth-rpg": {
        kind: "feature",
        featureKey: "another-timeline",
        casting: false,
        source: source ?? null,
        targets: token ? [{ sceneId: token.parent?.id ?? null, tokenId: token.id, actorId: roller.id, name: token.name }] : []
      } }
    });
    return true;
  }
  return false;
}

/** On the holder's client: judged, asked, judged again, paid only while the asker waits. */
async function timelineHere(payload, holder, roller) {
  const started = Date.now();
  const kind = String(payload.kind ?? "");
  const feet = Number(payload.feet);
  if (judgement(holder, { kind, roller, feet })) return { yes: false };
  const yes = await confirmHere(holder, {
    title: F.feature, ms: WINDOW_MS,
    text: game.i18n.format("AZEROTH.Chrono.TimelineAsk", {
      holder: holder.name, name: roller.name, total: payload.total ?? "", n: F.mana,
      test: game.i18n.localize(AZEROTH.testKinds?.[kind] ?? kind)
    })
  });
  if (!yes) return { yes: false };
  const again = judgement(holder, { kind, roller, feet });
  if (again) {
    ui.notifications?.warn(game.i18n.format(`AZEROTH.Chrono.Timeline.${again}`, { name: holder.name }));
    return { yes: false };
  }
  if (!answerInTime(started, Date.now(), ASK_MS)) return { yes: false };
  if (!(await game.system.azeroth.workflows.spendTurnBudget(holder, "reaction"))) return { yes: false };
  const pool = manaPool(holder.poolSnapshot?.() ?? []);
  if (!pool || pool.value < F.mana) return { yes: false };
  await holder.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.value - F.mana });
  return { yes: true };
}

/**
 * The handler a holder is asked through (`TIMELINE_QUERY`). The asker must own the creature
 * that rolled; the holder must be this client's to answer for.
 */
export async function timelineQueryHandler(payload = {}, { user = null } = {}) {
  const holder = actorAt(payload.holderUuid);
  const roller = actorAt(payload.rollerUuid);
  if (!holder || !roller) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !roller.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: roller.name }));
  if (!holder.isOwner) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: holder.name }));
  return timelineHere(payload, holder, roller);
}
