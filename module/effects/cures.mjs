/**
 * **CURES THROUGH ONE DOOR** (D12 §5, Phase 6). `cureAfflictions(target, spell, o)`
 * is the one reader of what a cure may end and the one caller of the writer
 * (`effects/afflictions.mjs#applyCure`, query-backed for a creature this client
 * does not own). Spells, gear remedies, Moonwell's turn tick, a placed area and a
 * Long Rest in a Haven all come here; none of them deletes a carrier itself.
 *
 *   cureReadiness(target)                 the refusal, judged BEFORE anything is paid
 *   chooseCures(target, spell, o)         the chooser, before payment
 *   cureAfflictions(target, spell, o)     choose (if not chosen), write, say what ended
 *   cureRemedy(actor, item, o)            a gear remedy
 *   cureAreaOnPlace / cureOnTick / cureAtLongRest   the three area moments
 */

import { CURE_SPELLS, DISEASES } from "../rules/afflictions.mjs";
import { spendOne } from "../rules/consumables.mjs";
import {
  BLEEDING_ROW, areaReach, casterFatigueAfter, classifyCarrier, cleanseRank, isRemedy, planCure, remedyAim, remedyJudgement, restCureJudgement, tickCures
} from "../rules/cures.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { cureFromSpec, cureSpecOf, holdsCure, planIds, remedyWrite } from "../rules/afflict-asker.mjs";
import { afflictionsOf, applyCure, postAfflictionCard } from "./afflictions.mjs";

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** The refusal for a creature this client cannot write and no GM is online to write (judged before payment). */
export function cureReadiness(target) {
  if (!target) return { refusal: "gone" };
  if (gmAbsentFor({ owned: [target.isOwner], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) {
    return { refusal: "noGM" };
  }
  return { refusal: null };
}

const plainEffects = target => [...target.effects].map(e => ({
  id: e.id, name: e.name, statuses: [...(e.statuses ?? [])], flags: e.flags ?? {}, disabled: e.disabled === true
}));

/** The Bleeding a creature carries, summed across its sources (A1: sources add). */
export function bleedingOf(target) {
  return plainEffects(target).filter(e => !e.disabled && e.statuses.includes("bleeding"))
    .reduce((sum, e) => sum + Math.max(0, Number(e.flags?.["azeroth-rpg"]?.value ?? 1) || 0), 0);
}

function planFor(target, name, { rank = 1, sl = null } = {}) {
  return planCure({
    spell: name, carriers: afflictionsOf(target), effects: plainEffects(target), bleeding: bleedingOf(target),
    conditionKeys: Object.keys(CONFIG.AZEROTH?.conditions ?? {}), rank, sl,
    words: { bleeding: t("AZEROTH.Afflictions.Cure.BleedingRow") }
  });
}

/** Ask for `count` of `rows`, or take the first by the list's order (urgency: poison, disease, condition) when no chooser is wanted. */
async function pickFrom(item, rows, count, { choose, prompt }) {
  if (rows.length <= count) return rows.map(r => r.id);
  if (!choose) return rows.slice(0, count).map(r => r.id);
  const { chooseOption } = await import("../dice/workflows.mjs");
  const options = rows.map(r => ({ key: r.id, name: r.name, description: t(`AZEROTH.Afflictions.Cure.Kind.${r.kind}`) }));
  const picked = await chooseOption(item, options, null, { prompt, max: count });
  if (!picked) return null;
  return (Array.isArray(picked) ? picked : [picked]).map(o => o.key);
}

/**
 * The chooser BEFORE payment: what the cure will end on this creature, or a
 * refusal in words with nothing spent. Where the cure forces its answer there is
 * no chooser.
 * @returns {Promise<{ok: true, picks: string[], plan: object}|{ok: false, reason: string}>}
 */
export async function chooseCures(target, name, { item = null, rank = 1, sl = null, choose = true } = {}) {
  const ready = cureReadiness(target);
  if (ready.refusal) return { ok: false, reason: ready.refusal };
  const plan = planFor(target, name, { rank, sl });
  if (plan.refusal) return { ok: false, reason: plan.refusal };
  let picks = [];
  if (plan.judgement.ends) picks = plan.judgement.ends;
  else if (plan.judgement.choose) {
    const rows = plan.rows.filter(r => plan.judgement.choose.options.includes(r.id));
    picks = await pickFrom(item ?? { name }, rows, plan.judgement.choose.pick, {
      choose, prompt: t(`AZEROTH.Afflictions.Cure.Choose`, { spell: name, target: target.name })
    });
    if (!picks) return { ok: false, reason: "cancelled" };
  }
  return { ok: true, picks, plan };
}

/**
 * Cure `target` with one of the twelve cures. `picks` are the ids already chosen
 * before payment (stale ones are dropped; nothing left says so in words).
 *
 * @param {Actor} target
 * @param {string} name  a CURE_SPELLS name
 * @param {object} [o]
 * @param {Actor|null} [o.by]      the caster (the card's speaker, the writer's authority)
 * @param {number} [o.rank]        the caster's Cleanse talent rank
 * @param {number|null} [o.sl]     the Casting Test's Success Level
 * @param {boolean} [o.choose]     open the chooser where a real choice is left
 * @param {string[]} [o.picks]     ids chosen before payment
 * @param {boolean} [o.heal]       false: the caller lands the healing (Moonwell's tick)
 * @param {boolean} [o.card]       post the card (default); false returns its lines
 * @returns {Promise<{ended: string[], bleeding: number, healed: number, damaged: number, refusal: string|null, lines: string[]}>}
 */
export async function cureAfflictions(target, name, { by = null, rank = 1, sl = null, choose = true, picks = null, item = null, heal = true, damage = true, card = true } = {}) {
  const result = { ended: [], bleeding: 0, healed: 0, damaged: 0, refusal: null, lines: [] };
  const spec = CURE_SPELLS[name];
  const fail = refusal => {
    result.refusal = refusal;
    result.lines.push(t(`AZEROTH.Afflictions.Cure.Nothing`, { target: target?.name ?? "", spell: name }));
    return result;
  };
  if (!target || !spec) return fail("gone");
  const ready = cureReadiness(target);
  if (ready.refusal) return fail(ready.refusal);
  const plan = planFor(target, name, { rank, sl });
  if (plan.refusal) return fail(plan.refusal);

  // What the cure ends: the forced answer, the chosen rows still on the creature, or the first by urgency.
  let ids;
  if (plan.judgement.ends) ids = [...plan.judgement.ends];
  else if (plan.judgement.choose) {
    const live = new Set(plan.judgement.choose.options);
    const chosen = (picks ?? []).filter(id => live.has(id));
    ids = chosen.length ? chosen : await pickFrom(item ?? { name }, plan.rows.filter(r => live.has(r.id)), plan.judgement.choose.pick,
      { choose, prompt: t(`AZEROTH.Afflictions.Cure.Choose`, { spell: name, target: target.name }) });
    if (!ids) return fail("cancelled");
  } else ids = [];
  // Cleanse at SL 3: also one condition, through the chooser.
  if (plan.conditionPick && plan.sl3Rows.length) {
    const more = await pickFrom(item ?? { name }, plan.sl3Rows.filter(r => !ids.includes(r.id)), plan.conditionPick,
      { choose, prompt: t(`AZEROTH.Afflictions.Cure.ChooseCondition`, { spell: name, target: target.name }) });
    if (more) ids.push(...more);
  }
  // The "lower Bleeding" pseudo-row stands for the spell's own clause (`cureFromSpec`).
  const cure = cureFromSpec(spec, plan, ids, { heal, damage });
  const bleeding = cure.bleeding;
  // A creature this client does not own is asked for an INTENT; the GM's client plans the cure again.
  const done = await applyCure(target, cure, { by, ask: { spell: name, ids, rank, sl, heal, damage } });
  if (!done?.ok) return fail(done?.reason ?? "error");
  Object.assign(result, { ended: done.ended ?? [], bleeding: done.bleeding ?? 0, healed: done.healed ?? 0, damaged: done.damaged ?? 0 });
  result.lines = linesFor(target, name, result, bleeding);
  if (card) {
    await postAfflictionCard(by ?? target, { title: name, lines: result.lines, accent: "azeroth-card-spell", kind: "cure", extra: { cure: { spell: name, target: target.uuid, ended: result.ended } } });
  }
  return result;
}

/**
 * The cure a PLAYER's ask comes to, worked out on the GM's client from the target's own
 * documents: a gear remedy ends the one carrier of its disease; a spell must be one the
 * asker's hand holds, and its plan, healing and damage are the spell's (`rules/afflict-asker.mjs`).
 * @returns {Promise<{cure: object}|{refusal: string}>}
 */
export async function buildAskedCure(target, ask, { by = null } = {}) {
  if (ask?.remedy) {
    const w = remedyWrite({ remedy: ask.remedy, carriers: afflictionsOf(target) });
    return w.cure ? { cure: w.cure } : { refusal: w.refusal };
  }
  const spec = cureSpecOf(ask?.spell);
  if (!spec || !by) return { refusal: "unknownCure" };
  const held = [...(by.items ?? [])].flatMap(i => [i.name, ...(Array.isArray(i.system?.spells) ? i.system.spells.map(x => (typeof x === "string" ? x : x?.name)) : [])]);
  if (!holdsCure(ask.spell, held)) return { refusal: "notKnown" };
  const plan = planFor(target, ask.spell, { rank: ask.rank, sl: ask.sl });
  if (plan.refusal) return { refusal: plan.refusal };
  return { cure: cureFromSpec(spec, plan, planIds(plan, ask.ids), { heal: ask.heal, damage: ask.damage }) };
}

/** What a cure did, in words. */
export function linesFor(target, name, r, bleedingClause = null) {
  const lines = [];
  if (r.damaged) lines.push(t(`AZEROTH.Afflictions.Cure.Damaged`, { target: target.name, amount: r.damaged }));
  if (r.ended.length) lines.push(t(`AZEROTH.Afflictions.Cure.Ended`, { target: target.name, names: r.ended.join(", "), spell: name }));
  if (r.bleeding) lines.push(t(bleedingClause?.toZero ? `AZEROTH.Afflictions.Cure.BleedingZero` : `AZEROTH.Afflictions.Cure.Bleeding`, { target: target.name, amount: r.bleeding }));
  if (r.healed) lines.push(t(`AZEROTH.Afflictions.Cure.Healed`, { target: target.name, amount: r.healed }));
  if (!lines.length) lines.push(t(`AZEROTH.Afflictions.Cure.Nothing`, { target: target.name, spell: name }));
  return lines;
}

/* ------------------------------------------------------------------ */
/* Gear remedies                                                       */
/* ------------------------------------------------------------------ */

const tokenOf = ref => game.scenes?.get(ref?.sceneId)?.tokens.get(ref?.tokenId) ?? null;

/**
 * The creature a remedy is aimed at: a targeted creature within 5 feet, else the
 * user. A target too far is a refusal in words.
 * @returns {Promise<{aim: "self"|"target"|"tooFar", target: Actor|null}>}
 */
export async function remedyTarget(actor, targets = []) {
  const { feetApart } = await import("../canvas/footprints.mjs");
  const ref = targets?.[0] ?? null;
  const token = ref ? tokenOf(ref) : null;
  const userToken = actor.getActiveTokens?.()[0]?.document ?? null;
  const feet = token && userToken ? feetApart(userToken, token) : null;
  const aim = remedyAim({ hasTarget: Boolean(token?.actor), targetFeet: feet });
  return { aim, target: aim === "target" ? token.actor : aim === "self" ? actor : null };
}

/**
 * Judge a remedy. Called BEFORE the Half-Action or the dose is spent: the verdict
 * names the carrier to end, or the refusal to say in words.
 * @returns {{ok: true, target: Actor, effectId: string}|{ok: false, reason: string, target?: Actor}}
 */
export function judgeRemedy(target, use) {
  if (!target) return { ok: false, reason: "tooFar" };
  const ready = cureReadiness(target);
  if (ready.refusal) return { ok: false, reason: ready.refusal, target };
  const verdict = remedyJudgement({ cures: use.cures, carriers: afflictionsOf(target) });
  return verdict.ok ? { ok: true, target, effectId: verdict.effectId } : { ok: false, reason: verdict.refusal, target };
}

/** End the disease a remedy cures. The caller has spent the Half-Action and the dose. */
export async function cureRemedy(actor, target, effectId, { item = null } = {}) {
  const done = await applyCure(target, { ends: [effectId] }, { by: actor, ask: { remedy: item?.system?.use?.cures ?? "" } });
  if (!done?.ok || !done.ended?.length) ui.notifications?.warn(t("AZEROTH.Afflictions.Cure.RemedyFailed", { target: target.name, remedy: item?.name ?? "" }));
  const lines = done?.ok && done.ended?.length
    ? [t(`AZEROTH.Afflictions.Cure.RemedyEnded`, { target: target.name, names: done.ended.join(", "), remedy: item?.name ?? "" })]
    : [t(`AZEROTH.Afflictions.Cure.Nothing`, { target: target.name, spell: item?.name ?? "" })];
  const message = await postAfflictionCard(actor, { title: item?.name ?? "", lines, accent: "azeroth-card-spell", kind: "cure", extra: { cure: { remedy: item?.name ?? "", target: target.uuid, ended: done?.ended ?? [] } } });
  return { ok: Boolean(done?.ok), ended: done?.ended ?? [], lines, message };
}

/**
 * **A GEAR REMEDY** (08: *on you or a creature you touch*). Order is D-768's:
 * refuse (in words, nothing spent) -> the Half-Action -> the dose -> the cure.
 * The aim is a targeted creature within 5 feet (measured through
 * `canvas/footprints.mjs`), else the user.
 * @returns {Promise<ChatMessage|null>}
 */
export async function useRemedy(actor, item, { targets = [] } = {}) {
  const use = item?.system?.use;
  if (!actor?.isOwner || !isRemedy(use)) return null;
  const { acquireConsumableUse } = await import("./consumable-use-lock.mjs");
  const release = acquireConsumableUse(actor);
  if (!release) {
    ui.notifications?.warn(t("AZEROTH.Use.Busy"));
    return null;
  }
  try {
    const { realmRefusalFor } = await import("./spirit-realm.mjs");
    const barred = realmRefusalFor(actor, "gear");
    if (barred) { ui.notifications?.warn(barred); return null; }
    const held = item.system.quantity === undefined ? 1 : item.system.quantity;
    if (held !== null && held <= 0) {
      ui.notifications?.warn(t("AZEROTH.Use.NoneLeft", { name: item.name }));
      return null;
    }
    const aimed = await remedyTarget(actor, targets);
    if (aimed.aim === "tooFar") {
      ui.notifications?.warn(t(`AZEROTH.Afflictions.Cure.Refuse.tooFar`, { remedy: item.name }));
      return null;
    }
    const verdict = judgeRemedy(aimed.target, use);
    if (!verdict.ok) {
      const disease = DISEASES[use.cures]?.name ?? use.cures;
      ui.notifications?.warn(t(`AZEROTH.Afflictions.Cure.Refuse.${verdict.reason}`, { remedy: item.name, target: verdict.target?.name ?? "", disease }));
      return null;
    }
    const { spendTurnBudget } = await import("../dice/workflows.mjs");
    if (!await spendTurnBudget(actor, use.action)) return null;
    // The budget may have waited on a dialog: judge the GM's availability and the carrier once
    // more BEFORE the dose goes, and say in words if the cure can no longer be made.
    const still = judgeRemedy(aimed.target, use);
    if (!still.ok) {
      ui.notifications?.warn(t(`AZEROTH.Afflictions.Cure.Refuse.${still.reason}`, { remedy: item.name, target: still.target?.name ?? "", disease: DISEASES[use.cures]?.name ?? use.cures }));
      return null;
    }
    verdict.effectId = still.effectId;
    const spend = spendOne(held);
    if (spend?.delete) await item.delete();
    else if (spend) await item.update({ "system.quantity": spend.quantity });
    await (await import('./equipment-travel.mjs')).endEquipmentInvisibility(actor,{event:'consumable'});
    const done = await cureRemedy(actor, verdict.target, verdict.effectId, { item });
    return done.message ?? null;
  } finally {
    release();
  }
}

/* ------------------------------------------------------------------ */
/* Areas                                                               */
/* ------------------------------------------------------------------ */

/**
 * Restoration, Scour, Deliverance: at the moment the area is PLACED, every poison
 * and disease on the creatures inside the Region ends (Deliverance only on the
 * willing, and its caster is left Fatigued). One card for the whole cast.
 */
export async function cureAreaOnPlace(region, caster, name) {
  const spec = CURE_SPELLS[name];
  if (!region || !caster || spec?.area !== "cast") return null;
  const { relationTo } = await import("./area-strikes.mjs");
  const { willingOf } = await import("../canvas/range.mjs");
  const scene = region.parent;
  const casterToken = caster.getActiveTokens?.()[0]?.document ?? null;
  const inside = [...(scene?.tokens ?? [])].filter(tok => tok.actor && tok.testInsideRegion(region)).map(tok => {
    const relation = relationTo({ caster, casterToken, actor: tok.actor, token: tok });
    // WILLING (Deliverance, *every willing creature*): the ONE predicate (`canvas/range.mjs#willingOf`,
    // D-893) - the caster, an ally of the caster, a NEUTRAL creature (the lead: *"300 - neutral can
    // be willing"*, D-900), and outside a shared fight a token on the caster's side of the board.
    const willing = willingOf(caster, tok.actor, { ownerToken: casterToken, otherToken: tok });
    return { uuid: tok.actor.uuid, actor: tok.actor, ally: relation === "ally" || relation === "self" || willing, caster: tok.actor.uuid === caster.uuid, defeated: tok.actor.system?.health?.value <= 0 && tok.actor.type === "npc" };
  });
  const reached = areaReach(inside, spec);
  const lines = [];
  const seen = new Set();
  for (const c of reached) {
    if (seen.has(c.uuid)) continue;
    seen.add(c.uuid);
    const r = await cureAfflictions(c.actor, name, { by: caster, choose: false, card: false });
    if (!r.refusal) lines.push(...r.lines);
  }
  if (!lines.length) lines.push(t(`AZEROTH.Afflictions.Cure.AreaNothing`, { spell: name }));
  if (spec.casterFatigue && caster.type === "character") {
    const now = casterFatigueAfter(caster.system?.fatigue ?? 0, spec, CONFIG.AZEROTH?.FATIGUE_MAX ?? 6);
    if (caster.isOwner) await caster.update({ "system.fatigue": now });
    lines.push(t(`AZEROTH.Afflictions.Cure.CasterFatigued`, { name: caster.name }));
  }
  await postAfflictionCard(caster, { title: name, lines, accent: "azeroth-card-spell", kind: "cure", extra: { cure: { spell: name, area: true } } });
  return { lines, reached: reached.length };
}

/**
 * Moonwell's tick, after the area's own Health: one poison or one disease on the
 * ally ends. The GM's client lands the tick, so no chooser is shown: the first by
 * urgency (poison before disease, then name) is taken. Returns the lines.
 */
export async function cureOnTick(actor, caster, spellName) {
  const spec = tickCures(spellName);
  if (!spec || !actor) return [];
  const r = await cureAfflictions(actor, spellName, { by: caster, choose: false, card: false, heal: false });
  return r.refusal ? [] : r.lines;
}

/**
 * A Long Rest in a Haven or a Sanctification: every poison and disease ends.
 * `regions` are the scene's Regions; the resting character's token must stand
 * inside one recorded from the cure's cast. Returns `{ends, criticalInjury, lines}`.
 */
export async function cureAtLongRest(actor) {
  const token = actor.getActiveTokens?.()[0]?.document ?? null;
  const scene = token?.parent ?? null;
  if (!scene) return { ends: false, criticalInjury: 0, lines: [] };
  const regions = [...scene.regions].map(region => ({
    spell: region.flags?.["azeroth-rpg"]?.spell?.name ?? "",
    inside: token.testInsideRegion(region)
  }));
  const verdict = restCureJudgement(regions);
  if (!verdict.ends) return { ...verdict, lines: [] };
  const lines = [];
  const first = verdict.by[0];
  const r = await cureAfflictions(actor, first, { by: actor, choose: false, card: false, heal: false, damage: false });
  if (!r.refusal) lines.push(...r.lines);
  // Sanctification: *one Critical Injury healed*. No healing door for an injury
  // exists, so the OLDEST injury effect (06 §8: an injury is an effect flagged
  // `injury`) is lifted on the resting character's own client.
  if (verdict.criticalInjury > 0 && actor.isOwner) {
    const injuries = [...actor.effects].filter(e => e.flags?.["azeroth-rpg"]?.injury === true)
      .sort((a, b) => (a._stats?.createdTime ?? 0) - (b._stats?.createdTime ?? 0) || String(a.id).localeCompare(String(b.id)));
    for (const injury of injuries.slice(0, verdict.criticalInjury)) {
      const name = injury.name;
      await injury.delete();
      lines.push(t(`AZEROTH.Afflictions.Cure.InjuryHealed`, { target: actor.name, name }));
    }
  }
  return { ...verdict, lines };
}

/* ------------------------------------------------------------------ */
/* Cure Poison and Antivenom share the door's writer                    */
/* ------------------------------------------------------------------ */

/**
 * End a poison or disease CARRIER through the one writer (`endAffliction`), in
 * the shape `endNullifiedEffect` answers, so the Cure Poison and Antivenom
 * tickets keep their receipts and checks and only the final write moves.
 * Returns null for an effect that is no carrier (the curse path keeps its gates).
 */
export async function endCarrier(target, effectId, { by = null } = {}) {
  const effect = target?.effects?.get(effectId);
  if (!effect || !classifyCarrier(effect)) return null;
  const name = effect.name;
  const { endAffliction } = await import("./afflictions.mjs");
  const done = await endAffliction(target, effectId, { by });
  const ok = done?.ok === true && !target.effects.has(effectId);
  return { ok, reason: ok ? null : (done?.reason ?? "notRemoved"), ended: ok ? [{ id: effectId, name, owner: null }] : [], consequences: [] };
}

/* ------------------------------------------------------------------ */
/* The single-target cure spells                                        */
/* ------------------------------------------------------------------ */

/** Cure Poison keeps its two-phase GM ticket (`cure-poison-use.mjs`); these five come through here. */
export const DOOR_CURES = Object.freeze(["Cleanse", "Nature's Cure", "Purging Flame", "Cure Blight", "Absolution"]);

/**
 * BEFORE the Mana and the Half-Action: one creature, in reach, with something the
 * cure can end - or a refusal in words with nothing spent. The chooser is here, so
 * a dismissed one costs nothing (D-768).
 * @returns {Promise<{ok: true, target: Actor, picks: string[], rank: number}|{ok: false, reason: string}>}
 */
export async function prepareDoorCure({ actor, spell, source = null, targets = [] } = {}) {
  const refuse = reason => {
    if (reason !== "cancelled") ui.notifications?.warn(t(`AZEROTH.Afflictions.Cure.Refuse.${reason}`, { spell: spell.name, target: "" }));
    return { ok: false, reason };
  };
  if (!Array.isArray(targets) || targets.length !== 1) return refuse("target");
  // A target is a token on the board; a card made with no token names the actor alone.
  const token = tokenOf(targets[0]);
  const target = token?.actor ?? (targets[0]?.actorId ? game.actors?.get(targets[0].actorId) ?? null : null);
  if (!target) return refuse("target");
  if (token && /^touch/i.test(String(spell.system?.range ?? ""))) {
    const { feetApart } = await import("../canvas/footprints.mjs");
    const from = tokenOf(source);
    const feet = from ? feetApart(from, token) : null;
    if (Number.isFinite(feet) && feet > 5) return refuse("range");
  }
  const rank = cleanseRank(spell.name === "Cleanse" ? actor.takenTalents?.().find(x => x.name === "Cleanse")?.taken : 1);
  const chosen = await chooseCures(target, spell.name, { item: spell, rank });
  if (!chosen.ok) {
    if (chosen.reason === "nothingToCure") ui.notifications?.warn(t(`AZEROTH.Afflictions.Cure.Nothing`, { target: target.name, spell: spell.name }));
    else return refuse(chosen.reason);
    return { ok: false, reason: chosen.reason };
  }
  return { ok: true, target, picks: chosen.picks, rank };
}

/** AFTER a successful Casting Test (07 §8: a failed cast does nothing). */
export async function finishDoorCure(review, { actor, spell, sl = null } = {}) {
  if (!review?.ok) return null;
  const r = await cureAfflictions(review.target, spell.name, { by: actor, rank: review.rank, sl, picks: review.picks, item: spell });
  // 07's Absolution: *The target then has a Bane on all Tests until the end of its next turn.*
  if (spell.name === "Absolution" && !r.refusal) {
    const { layBane } = await import("./banes.mjs");
    await layBane({ victim: review.target, kind: "all", banes: 1, source: "Absolution", by: actor, lasting: true });
  }
  return r;
}
