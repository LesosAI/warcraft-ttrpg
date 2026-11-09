/**
 * **THE TIMEWALKER'S AND THE SPELL-WEAVER'S REACTIONS IN ANOTHER CREATURE'S TEST** (04's
 * Disrupt Weave and Paradox; and Time Lapse on the Champion's own; stage 3B).
 *
 * Disrupt Weave (*when an enemy ... casts a spell ... On a failure the spell fails and its
 * Mana is spent*) and Paradox (*when an enemy ... makes an Attack Test or a Casting Test, it
 * rolls twice and takes the lower*) answer a Test while it is being made. A card row posted
 * once the Test is on the log cannot make a spell fail before it lands, and cannot roll a
 * die twice, so each is **asked IN the Test** - D-777's door for what another creature does
 * to an event in flight: after the die is evaluated and BEFORE its result reaches anybody,
 * the holder's own answerer (an active owning player, else the active GM; `blow-doors.mjs
 * #answererOf`) is asked yes or no in a dialog that names the Test but never its result,
 * the holder's own client judges every refusal again, pays the Reaction and the price, and
 * answers. The roller's client then rolls what the answer asks. Seeing the creature is the
 * table's, and the question says so.
 *
 * Time Lapse (*Once per Short Rest, when you fail a Test, roll it again and take the new
 * result*) is the roller's own, offered at the same seam as 02's Elune's Regard - after the
 * die and before anything follows from it - and asked of whoever answers for the roller.
 *
 * A holder's dialog closes before the asker stops waiting by the payment's reserve, and a
 * yes judged after that window is refused before anything is paid (`answerInTime`): the
 * Reaction is a queued write that may stall, and a yes paid after the asker went on as if
 * it were a no would be a Reaction spent for nothing.
 */

import { AZEROTH } from "../config.mjs";
import { talentEffect } from "../rules/talent-effects.mjs";
import { answerInTime, answerWindow, disruptCost, disruptWeaveFor, paradoxFor, paradoxKeeps, timeLapseFor } from "../rules/chromatic-talents.mjs";
import { poolNamed } from "../rules/pools.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { ASK_MS, answererOf, confirmHere } from "./blow-doors.mjs";

/** The window a holder's question stands open for: the asker's less the payment's reserve. */
const WINDOW_MS = answerWindow(ASK_MS);

/** Resolve a spell by uuid, off the document, or null. */
async function spellAt(uuid) {
  if (!uuid || typeof uuid !== "string") return null;
  try {
    const doc = await fromUuid(uuid);
    return doc?.documentName === "Item" && doc.type === "spell" ? doc : null;
  } catch {
    return null;
  }
}

/** A spell's tier, off the document: 07's own field, a whole number from 1. */
const tierOf = spell => Math.max(1, Math.trunc(Number(spell?.system?.tier)) || 1);

/** The query a holder is asked through, on whoever answers for it. */
export const CHROMATIC_ASK_QUERY = "azeroth-rpg.chromaticAsk";

/** Resolve an actor by uuid, quietly. */
function actorAt(uuid) {
  if (!uuid || typeof uuid !== "string") return null;
  try {
    const doc = fromUuidSync(uuid);
    return doc?.documentName === "Actor" ? doc : null;
  } catch {
    return null;
  }
}

/** The token a creature stands on, on the viewed scene, or null. */
const tokenOf = actor => actor?.getActiveTokens?.(true)?.[0] ?? null;

/** A taken talent's granted counter, by the talent's name. */
function counterOf(actor, name) {
  const talent = actor?.items?.find?.(i => i.type === "talent" && i.name === name && (i.system?.taken ?? 0) > 0) ?? null;
  return talent ? (actor.grantedFeature?.(talent.id) ?? null) : null;
}

/** A counter's uses left, a counter with no limit counting as one. */
function usesLeft(counter) {
  if (!counter) return 0;
  if (!counter.system?.uses?.per) return 1;
  return Math.max(0, Math.trunc(Number(counter.system.uses.value)) || 0);
}

/** Whether the holder may still spend a Reaction: the one budget reading. */
const reactionLeft = actor => game.system.azeroth.workflows.turnBudgetRefusal(actor, "reaction") === null;

/** The holders on the roller's scene who carry a row, each with its row and its distance. */
function holdersNear(roller, rowFor) {
  const at = tokenOf(roller);
  if (!at) return [];
  const out = [];
  const seen = new Set();
  for (const t of at.document.parent?.tokens ?? []) {
    const holder = t.actor;
    if (!holder || holder.type !== "character" || holder.uuid === roller.uuid || seen.has(holder.uuid)) continue;
    if ((holder.system?.health?.value ?? 0) <= 0) continue;
    const row = rowFor(holder);
    if (!row) continue;
    seen.add(holder.uuid);
    const feet = feetApart(t, at.document);
    if (feet === null || feet > row.feet) continue;
    out.push({ holder, row, token: t, feet });
  }
  return out.sort((a, b) => a.holder.uuid.localeCompare(b.holder.uuid));
}

/** Ask a holder: a dialog here where this user answers for it, else the query on the user who does. */
async function ask(holder, payload) {
  const who = answererOf(holder);
  if (!who) return { answered: false };
  if (who.id === game.user.id) return chromaticAskHandler(payload, { user: game.user });
  try {
    return await who.query(CHROMATIC_ASK_QUERY, payload, { timeout: ASK_MS });
  } catch (err) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.BlowDoor.NoAnswer", { name: holder.name, reason: err.message }));
    return { answered: false };
  }
}

/* -------------------------------------------- */
/*  Disrupt Weave                                */
/* -------------------------------------------- */

/** Disrupt Weave's judgement on the holder, as it stands. */
function disruptJudgement(holder, tier) {
  const row = disruptWeaveFor(holder?.takenTalents?.() ?? [], talentEffect);
  if (!row) return { ok: false, reason: "unknown" };
  if (!Number.isFinite(holder.system?.spellDC)) return { ok: false, reason: "noDc" };
  if (!reactionLeft(holder)) return { ok: false, reason: "noReaction" };
  const rage = poolNamed(holder.poolSnapshot?.() ?? [], "rage");
  const cost = disruptCost(tier);
  if (!rage || rage.value < cost) return { ok: false, reason: "short" };
  return { ok: true, row, rage, cost };
}

/**
 * **DISRUPT WEAVE, ASKED IN A CAST** (04, as the lead reworded it on 2026-11-08: *when an
 * enemy within 60 feet that you can see casts a spell*), from `castSpell` once the cast is
 * paid for and its die evaluated, before the card: every holder within 60 feet of the
 * caster - never the caster - of whom the caster is an ENEMY by the one reading Paradox
 * uses (`enemyOf`, `rules/distance.mjs#countsAsEnemy`) and who could pay, asked in turn; the
 * first yes is paid on the holder's client and the caster's Spirit Resilience Test is rolled
 * HERE, the caster's own client. On a failure the Casting Test is a failure - 07 §8's *the
 * spell does not go off* and the Mana stays spent - carried on the roll's own options so the
 * card read back off its message says the same.
 *
 * **EVERY NUMBER OFF A DOCUMENT** (the 3B review, should-fix 2): the question carries the
 * spell's uuid, never its tier, and the holder's client reads the tier off the spell; the
 * answer carries only the yes, and this client reads the Test's DC, its Banes and its
 * Resilience off the holder's own prepared data - the holder's Spell DC and its talent at
 * its rank - never off the reply. The Test goes through the after-the-die seam, so a failed
 * one offers Time Lapse and Elune's Regard as any Test does (should-fix 10).
 *
 * @param {{caster: Actor, spell: Item, roll: AzerothRoll}} o
 * @returns {Promise<{asked: boolean, disrupted: boolean, by?: string}>}
 */
export async function askDisruptWeave({ caster, spell, roll }) {
  if (!caster || !spell || !roll) return { asked: false, disrupted: false };
  const tier = tierOf(spell);
  if (!spell.uuid) return { asked: false, disrupted: false };
  const near = holdersNear(caster, holder => disruptWeaveFor(holder.takenTalents?.() ?? [], talentEffect));
  let asked = false;
  for (const { holder } of near) {
    if (!disruptJudgement(holder, tier).ok || !(await enemyOf(holder, caster))) continue;
    asked = true;
    const answer = await ask(holder, { act: "disrupt", holderUuid: holder.uuid, casterUuid: caster.uuid, spellUuid: spell.uuid });
    if (answer?.disrupt !== true) continue;
    // The Test's numbers off the holder's own prepared data, here (never off the reply).
    const row = disruptWeaveFor(holder.takenTalents?.() ?? [], talentEffect);
    const dc = Math.trunc(Number(holder.system?.spellDC));
    if (!row || !(dc > 0)) continue;
    const { AzerothRoll } = await import("../dice/azeroth-roll.mjs");
    const { resilienceModifiers } = game.system.azeroth.workflows;
    const test = AzerothRoll.build({
      dc, kind: "resilience", banes: row.banes,
      modifiers: resilienceModifiers(caster, row.resilience), rollData: caster.getRollData?.() ?? {}
    });
    await test.evaluate();
    await caster.offerElunesRegard?.(test);
    const passed = test.outcome?.success === true;
    const words = { name: caster.name, talent: row.name, holder: holder.name, total: test.total, dc: test.dc, spell: spell.name };
    roll.options.provenance ??= [];
    roll.options.provenance.push({ label: row.name, value: null, formula: game.i18n.format(passed ? "AZEROTH.DisruptWeave.Passed" : "AZEROTH.DisruptWeave.Failed", words) });
    if (!passed) {
      roll.options.disrupted = { by: holder.uuid, name: row.name, total: test.total, dc: test.dc };
      roll.options.forcedMiss = true;
      delete roll.options.forcedSl;
    }
    return { asked: true, disrupted: !passed, by: holder.name };
  }
  return { asked, disrupted: false };
}

/**
 * Disrupt Weave on the holder's client: the spell read off its own document, judged, asked,
 * judged again, and paid only while the asker is still waiting (`answerInTime`).
 */
async function disruptHere({ holder, caster, spellUuid }) {
  const started = Date.now();
  const spell = await spellAt(spellUuid);
  if (!spell) return { disrupt: false, reason: "noSpell" };
  const tier = tierOf(spell);
  const first = disruptJudgement(holder, tier);
  if (!first.ok) return { disrupt: false, reason: first.reason };
  const yes = await confirmHere(holder, {
    title: first.row.name, ms: WINDOW_MS,
    text: game.i18n.format("AZEROTH.DisruptWeave.Ask", { holder: holder.name, name: caster.name, spell: spell.name, tier, n: first.cost, talent: first.row.name })
  });
  if (!yes) return { disrupt: false, reason: "declined" };
  const again = disruptJudgement(holder, tier);
  if (!again.ok) {
    ui.notifications?.warn(game.i18n.format(`AZEROTH.DisruptWeave.Refuse.${again.reason}`, { name: holder.name, talent: again.row?.name ?? first.row.name, n: first.cost }));
    return { disrupt: false, reason: again.reason };
  }
  if (!answerInTime(started, Date.now(), ASK_MS)) {
    ui.notifications?.info(game.i18n.format("AZEROTH.BlowDoor.Late", { name: holder.name }));
    return { disrupt: false, reason: "late" };
  }
  // The Reaction first, then the Rage off the pool as it stands NOW (D-768's order).
  if (!(await game.system.azeroth.workflows.spendTurnBudget(holder, "reaction"))) return { disrupt: false, reason: "noReaction" };
  const rage = poolNamed(holder.poolSnapshot?.() ?? [], "rage") ?? again.rage;
  await holder.updatePool({ itemId: rage.itemId, kind: rage.kind, value: Math.max(0, rage.value - again.cost) });
  return { disrupt: true };
}

/* -------------------------------------------- */
/*  Paradox                                      */
/* -------------------------------------------- */

/** Paradox's judgement on the holder, as it stands. */
function paradoxJudgement(holder, roller) {
  const row = paradoxFor(holder?.takenTalents?.() ?? [], talentEffect);
  if (!row) return { ok: false, reason: "unknown" };
  if (usesLeft(counterOf(holder, row.name)) <= 0) return { ok: false, reason: "noUses" };
  if (!reactionLeft(holder)) return { ok: false, reason: "noReaction" };
  return { ok: true, row };
}

/** Whether the roller is an enemy of the holder, by the one reading (`canvas/engaged.mjs`). */
async function enemyOf(holder, roller) {
  const { creaturesWithin } = await import("../canvas/engaged.mjs");
  const at = tokenOf(roller);
  return Boolean(at) && creaturesWithin(holder, 1e6, { who: "enemy" }).some(r => r.token?.id === at.id);
}

/**
 * **PARADOX, ASKED IN AN ENEMY'S TEST** (04), at the roll's after-the-die seam on the
 * roller's client, before anything follows from it: an Attack or Casting Test whose roller
 * is an enemy within 60 feet of a holder with a use and a Reaction left - asked in turn, the
 * first yes paid on its own client. The Test is then rolled a second time HERE and the lower
 * total kept, in place on the roll, so the card read back says what was kept and both dice
 * are on the roll's provenance. A Test whose result is already fixed (Soul Fire, Trueshot,
 * a miss forced) takes nothing.
 *
 * @param {{roller: Actor, roll: AzerothRoll}} o
 * @returns {Promise<{kept: "first"|"second"|null, by?: string}>}
 */
export async function askParadox({ roller, roll }) {
  const kind = roll?.options?.kind;
  if (!roller || !roll?._evaluated || !["attack", "casting"].includes(kind)) return { kept: null };
  if (roll.options.forcedSl !== undefined && roll.options.forcedSl !== null) return { kept: null };
  if (roll.options.forcedMiss || roll.options.paradox) return { kept: null };
  const near = holdersNear(roller, holder => paradoxFor(holder.takenTalents?.() ?? [], talentEffect));
  for (const { holder } of near) {
    if (!paradoxJudgement(holder, roller).ok || !(await enemyOf(holder, roller))) continue;
    const answer = await ask(holder, { act: "paradox", holderUuid: holder.uuid, rollerUuid: roller.uuid, kind });
    if (answer?.paradox !== true) continue;
    const second = roll.clone();
    await second.evaluate();
    const first = roll.total;
    const keep = paradoxKeeps(first, second.total);
    if (keep === "second") {
      roll.terms = second.terms;
      roll._total = second._total;
      roll._dice = second._dice;
    }
    roll.options.paradox = { by: holder.uuid, name: answer.name ?? "", totals: [first, second.total], kept: keep };
    roll.options.provenance ??= [];
    roll.options.provenance.push({ label: answer.name ?? "AZEROTH.Paradox.Label", value: null, formula: game.i18n.format("AZEROTH.Paradox.Row", { holder: holder.name, first, second: second.total, kept: Math.min(first, second.total) }) });
    return { kept: keep, by: holder.name };
  }
  return { kept: null };
}

/** Paradox on the holder's client: judged, asked, judged again, paid. */
async function paradoxHere({ holder, roller, kind }) {
  const started = Date.now();
  const first = paradoxJudgement(holder, roller);
  if (!first.ok) return { paradox: false, reason: first.reason };
  const counter = counterOf(holder, first.row.name);
  const yes = await confirmHere(holder, {
    title: first.row.name, ms: WINDOW_MS,
    text: game.i18n.format("AZEROTH.Paradox.Ask", {
      holder: holder.name, name: roller.name, talent: first.row.name, n: usesLeft(counter),
      test: game.i18n.localize(AZEROTH.testKinds?.[kind] ?? kind)
    })
  });
  if (!yes) return { paradox: false, reason: "declined" };
  const again = paradoxJudgement(holder, roller);
  if (!again.ok) {
    ui.notifications?.warn(game.i18n.format(`AZEROTH.Paradox.Refuse.${again.reason}`, { name: holder.name, talent: first.row.name }));
    return { paradox: false, reason: again.reason };
  }
  // A yes the asker can no longer be waiting for is paid for by nobody (D-777's residual
  // race; the 3B review, should-fix 11).
  if (!answerInTime(started, Date.now(), ASK_MS)) {
    ui.notifications?.info(game.i18n.format("AZEROTH.BlowDoor.Late", { name: holder.name }));
    return { paradox: false, reason: "late" };
  }
  if (!(await game.system.azeroth.workflows.spendTurnBudget(holder, "reaction"))) return { paradox: false, reason: "noReaction" };
  const now = counterOf(holder, again.row.name);
  if (now?.system?.uses?.per) await now.update({ "system.uses.value": Math.max(0, usesLeft(now) - 1) });
  return { paradox: true, name: again.row.name };
}

/* -------------------------------------------- */
/*  Time Lapse                                   */
/* -------------------------------------------- */

/** A Test the roller is offering Time Lapse for, so one offer is never nested in another. */
const offering = new WeakSet();

/**
 * **TIME LAPSE** (04: *Once per Short Rest, when you fail a Test, roll it again and take the
 * new result*), on the roller's own client at the after-the-die seam: a failed Test whose
 * result is not fixed (a Disrupt Weave's forced failure is the spell's, not the die's), a
 * use left on the counter - asked, judged again, the use struck, and the Test rolled again
 * in place on the roll, the new result taken whatever it is. Both totals are on the roll's
 * provenance.
 *
 * @param {Actor} actor
 * @param {AzerothRoll} roll
 * @returns {Promise<boolean>}  whether it was rolled again
 */
export async function offerTimeLapse(actor, roll) {
  if (actor?.type !== "character" || !roll?._evaluated || offering.has(roll)) return false;
  if (roll.outcome?.success !== false || roll.options?.forcedMiss || roll.options?.disrupted || roll.options?.timeLapse) return false;
  if (roll.options?.forcedSl !== undefined && roll.options?.forcedSl !== null) return false;
  const row = timeLapseFor(actor.takenTalents?.() ?? [], talentEffect);
  const counter = row ? counterOf(actor, row.name) : null;
  if (!row || usesLeft(counter) <= 0) return false;
  // **ASKED OF WHOEVER ANSWERS FOR THE CHARACTER** (the 3B review, should-fix 10): the owning
  // player where one is active, else the active GM - Paradox's own reading - so a player's
  // Test the GM rolls (a Black Drake's landing, judged on the GM's client) asks the player.
  const who = answererOf(actor);
  if (!who) return false;
  offering.add(roll);
  try {
    let yes = false;
    if (who.id === game.user?.id) yes = await timeLapseHere({ actor, total: roll.total, dc: roll.dc ?? "" });
    else {
      try {
        const answer = await who.query(CHROMATIC_ASK_QUERY, { act: "timeLapse", holderUuid: actor.uuid, rollerUuid: actor.uuid, total: roll.total, dc: roll.dc ?? null }, { timeout: ASK_MS });
        yes = answer?.timeLapse === true;
      } catch (err) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.BlowDoor.NoAnswer", { name: actor.name, reason: err.message }));
        yes = false;
      }
    }
    if (!yes) return false;
    const second = roll.clone();
    await second.evaluate();
    const first = roll.total;
    roll.terms = second.terms;
    roll._total = second._total;
    roll._dice = second._dice;
    roll.options.timeLapse = { name: row.name, totals: [first, second.total] };
    roll.options.provenance ??= [];
    roll.options.provenance.push({ label: row.name, value: null, formula: game.i18n.format("AZEROTH.TimeLapse.Row", { first, second: second.total }) });
    return true;
  } finally {
    offering.delete(roll);
  }
}

/** Time Lapse on the answering client: asked, judged again, the use struck. */
async function timeLapseHere({ actor, total, dc }) {
  const row = timeLapseFor(actor?.takenTalents?.() ?? [], talentEffect);
  if (!row || usesLeft(counterOf(actor, row.name)) <= 0) return false;
  const yes = await confirmHere(actor, { title: row.name, ms: WINDOW_MS, text: game.i18n.format("AZEROTH.TimeLapse.Ask", { name: actor.name, talent: row.name, total, dc: dc ?? "" }) });
  const now = counterOf(actor, row.name);
  if (!yes || usesLeft(now) <= 0) return false;
  await now.update({ "system.uses.value": Math.max(0, usesLeft(now) - 1) });
  return true;
}

/* -------------------------------------------- */
/*  The handler                                  */
/* -------------------------------------------- */

/**
 * The handler a holder is asked through (`CHROMATIC_ASK_QUERY`), on the client that answers
 * for the holder. The asker must own the creature MAKING the Test - it was their client that
 * rolled it. Throws with the reason, which travels back.
 */
export async function chromaticAskHandler(payload = {}, { user = null } = {}) {
  const holder = actorAt(payload.holderUuid);
  const other = actorAt(payload.casterUuid ?? payload.rollerUuid);
  if (!holder || !other) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !other.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: other.name }));
  if (!holder.isOwner) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: holder.name }));
  if (payload.act === "disrupt") return disruptHere({ holder, caster: other, spellUuid: String(payload.spellUuid ?? "") });
  if (payload.act === "paradox") return paradoxHere({ holder, roller: other, kind: String(payload.kind ?? "attack") });
  if (payload.act === "timeLapse") {
    if (other.uuid !== holder.uuid) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: holder.name }));
    return { timeLapse: await timeLapseHere({ actor: holder, total: payload.total ?? "", dc: payload.dc ?? "" }) };
  }
  throw new Error(`chromaticAsk: no such act ${JSON.stringify(payload.act ?? null)}`);
}
