/**
 * **THE AFFLICTION WORKFLOWS** (D12, Phase 5a): the Medicine Test, a GM's Expose
 * and Add, the weekly relapse Test, and the one door a poison or a disease is laid
 * through from a hit, a card or a creature's ability. Re-exported from
 * `dice/workflows.mjs`, so `game.system.azeroth.workflows.medicineTest` and the rest
 * are where the other workflows are.
 *
 * Nothing here writes a carrier itself: `effects/afflictions.mjs` is the one writer.
 * The Tests go through the system's roll dialog (`rollWithDialog`) with a custom
 * `run`, the way `corruptionExposure` does.
 */

import { AzerothRoll } from "./azeroth-roll.mjs";
import {
  DISEASES, DAY, afflictionBanes, diseaseCatalogue, makeDisease, makePoison, medicineNextAt,
  medicineOutcome, medicineRefusal, weeklyClearedPatch, weeklyOutcome, bareVenom
} from "../rules/afflictions.mjs";
import { resultName } from "../rules/resolution.mjs";
import { skillRowsFor } from "../rules/skills.mjs";
import {
  afflict, afflictionsOf, postAfflictionCard, updateAffliction
} from "../effects/afflictions.mjs";

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const nowOf = () => game.time?.worldTime ?? 0;

/* ------------------------------------------------------------------ */
/* The door a hit, a card or a creature lays a carrier through         */
/* ------------------------------------------------------------------ */

/**
 * Lay a poison. `carried` is `readCarried`'s descriptor or a bare Poisoned value
 * (a creature's venom); `by` is the hand that laid it. Says what came of it.
 * @returns {Promise<object>} `afflict`'s answer, or `{refused, reason: "notCarried"}`
 */
export async function afflictPoison({ victim, name, key = null, dc = null, resilience = "body", carried, by = null } = {}) {
  if (!victim) return { refused: true, reason: "gone" };
  const aff = makePoison({
    name, key: key ?? undefined, dc, resilience,
    carried: typeof carried === "number" ? bareVenom(carried) : carried,
    source: by ? { uuid: by.uuid, name: by.name } : null,
    now: nowOf(), inFight: Boolean(victim.activeFight?.())
  });
  if (!aff) return { refused: true, reason: "notCarried" };
  const done = await afflict(victim, { aff, by });
  tellLaid(victim, aff, done);
  return done;
}

/** Lay a disease (`DISEASES` key), at onset unless the disease has none. */
export async function afflictDisease({ victim, key, by = null } = {}) {
  if (!victim || !DISEASES[key]) return { refused: true, reason: "gone" };
  const aff = makeDisease(key, { source: by ? { uuid: by.uuid, name: by.name } : null, now: nowOf() });
  const done = await afflict(victim, { aff, by });
  tellLaid(victim, aff, done);
  return done;
}

function tellLaid(victim, aff, done) {
  if (done?.ok) ui.notifications?.info(t("AZEROTH.Afflictions.Laid", { name: victim.name, affliction: aff.name }));
  else if (done?.reason === "immune") ui.notifications?.info(t("AZEROTH.Afflictions.Refuse.immune", { name: victim.name, affliction: aff.name }));
  else if (done?.reason === "alreadyCarried") ui.notifications?.info(t("AZEROTH.Afflictions.Refuse.alreadyCarried", { name: victim.name, affliction: aff.name }));
}

/* ------------------------------------------------------------------ */
/* Skill and Resilience rows                                           */
/* ------------------------------------------------------------------ */

// A Skill Test's rows come through `rules/skills.mjs#skillRowsFor` (D-810). The
// copy that stood here read the Rank off `system.skills`, which only a creature
// has, so every CHARACTER healer rolled Medicine at Rank 0 (fault F1).

function verdictOf(roll, dc) {
  const won = roll.outcome.success === true;
  const name = resultName({ sl: roll.outcome.sl, success: won });
  return {
    outcome: game.i18n.localize(`AZEROTH.Roll.Outcome.${won ? "Success" : "Failure"}`),
    margin: game.i18n.localize(`AZEROTH.Roll.Result.${name[0].toUpperCase()}${name.slice(1)}`),
    total: roll.total, dc
  };
}

async function evaluate({ actor, kind, dc, boons = 0, banes = 0, modifiers = [], provenanceExtra = [] }) {
  const roll = AzerothRoll.build({ dc, kind, boons, banes, modifiers, rollData: actor.getRollData() });
  roll.options.provenance.push(...provenanceExtra);
  await roll.evaluate();
  await actor.offerElunesRegard?.(roll);
  return roll;
}

/* ------------------------------------------------------------------ */
/* The Medicine Test                                                   */
/* ------------------------------------------------------------------ */

/** The healers a user may roll as: the characters they own and the selected tokens' actors. */
function healersFor() {
  const seen = new Map();
  for (const actor of game.actors ?? []) if (actor.type === "character" && actor.isOwner) seen.set(actor.uuid, actor);
  for (const token of canvas?.tokens?.controlled ?? []) if (token.actor?.isOwner) seen.set(token.actor.uuid, token.actor);
  return [...seen.values()];
}

const carries = (healer, key) => afflictionsOf(healer).some(r => r.aff.key === key);

/**
 * Treat a disease (D12 section 5, R5): a Medicine Test at the disease's DC by a
 * healer who does not carry it, once in each 24 hours of world time per disease per
 * patient, never in a fight and never at onset. A pass starts the recovery; the days
 * then run on the world clock. Judged BEFORE the dialog opens.
 *
 * @param {{patient: Actor, afflictionId: string, event?: Event|null}} o
 * @returns {Promise<ChatMessage|{refused: string}|null>}
 */
export async function medicineTest({ patient, afflictionId, event = null } = {}) {
  const row = afflictionsOf(patient).find(r => r.id === afflictionId);
  if (!row || row.aff.kind !== "disease") return null;
  const now = nowOf();
  const inFight = Boolean(patient.activeFight?.());
  const stage = row.aff.disease?.stage;
  const triedAt = row.aff.disease?.triedAt ?? null;
  const general = medicineRefusal({ stage, healerCarries: false, triedAt, now, inFight });
  if (general) {
    ui.notifications?.warn(t(`AZEROTH.Afflictions.Medicine.Refuse.${general}`, { name: patient.name, disease: row.aff.name }));
    return { refused: general };
  }
  const healers = healersFor();
  const modes = {}, choices = {};
  let first = null;
  for (const h of healers) {
    const sick = carries(h, row.aff.key);
    const why = medicineRefusal({ stage, healerCarries: sick, triedAt, now, inFight: inFight || Boolean(h.activeFight?.()) });
    choices[h.uuid] = why ? `${h.name} - ${t(`AZEROTH.Afflictions.Medicine.Refuse.${why}`, { name: h.name, disease: row.aff.name })}` : h.name;
    modes[h.uuid] = why
      ? { refused: { text: t(`AZEROTH.Afflictions.Medicine.Refuse.${why}`, { name: h.name, disease: row.aff.name }) } }
      : { actor: h, healer: h.uuid, skill: "medicine", modifiers: skillRowsFor(h, "medicine") };
    if (!why && !first) first = h.uuid;
  }
  if (!first) {
    ui.notifications?.warn(t("AZEROTH.Afflictions.Medicine.Refuse.noHealer", { name: patient.name, disease: row.aff.name }));
    return { refused: "noHealer" };
  }
  const { rollWithDialog } = await import("../applications/actions.mjs");
  return rollWithDialog(modes[first].actor, {
    kind: "skill",
    skill: "medicine",
    title: t("AZEROTH.Afflictions.Medicine.Title", { disease: row.aff.name, name: patient.name }),
    dc: row.aff.dc ?? DISEASES[row.aff.key]?.dc ?? 12,
    modifiers: modes[first].modifiers,
    mode: first,
    modes,
    castTestChoices: choices,
    choiceLabel: "AZEROTH.Afflictions.Medicine.Healer",
    alwaysPrompt: true,
    afflictionCtx: { patientUuid: patient.uuid, afflictionId },
    run: medicineRun
  }, event);
}

/** The workflow the Medicine dialog runs: judged again at the die, then the carrier moves. */
async function medicineRun({ actor: healer, dc = 12, boons = 0, banes = 0, modifiers = [], provenanceExtra = [], afflictionCtx = null } = {}) {
  const patient = afflictionCtx?.patientUuid ? await fromUuid(afflictionCtx.patientUuid) : null;
  const row = patient ? afflictionsOf(patient).find(r => r.id === afflictionCtx.afflictionId) : null;
  if (!row) { ui.notifications?.warn(t("AZEROTH.Afflictions.Medicine.Gone")); return null; }
  const now = nowOf();
  const refusal = medicineRefusal({
    stage: row.aff.disease?.stage, healerCarries: carries(healer, row.aff.key),
    triedAt: row.aff.disease?.triedAt ?? null, now,
    inFight: Boolean(patient.activeFight?.() || healer.activeFight?.())
  });
  if (refusal) {
    ui.notifications?.warn(t(`AZEROTH.Afflictions.Medicine.Refuse.${refusal}`, { name: healer.name, disease: row.aff.name }));
    return null;
  }
  const roll = await evaluate({ actor: healer, kind: "skill", dc, boons, banes, modifiers, provenanceExtra });
  const success = roll.outcome.success === true;
  // The die took time: read the carrier AGAIN and judge again before anything is recorded
  // (still carried, not tried since, not in a fight, the healer still clear of it).
  const fresh = afflictionsOf(patient).find(r => r.id === row.id);
  const later = nowOf();
  const stale = !fresh ? "gone"
    : (fresh.aff.disease?.triedAt ?? null) !== (row.aff.disease?.triedAt ?? null) ? "triedToday"
      : medicineRefusal({
        stage: fresh.aff.disease?.stage, healerCarries: carries(healer, fresh.aff.key),
        triedAt: fresh.aff.disease?.triedAt ?? null, now: later,
        inFight: Boolean(patient.activeFight?.() || healer.activeFight?.())
      });
  let done = null;
  if (!stale) {
    const patch = medicineOutcome(fresh.aff, { success, now: later });
    done = await updateAffliction(patient, row.id, patch, { by: healer, medicine: { success, healerUuid: healer.uuid } });
  }
  const days = Math.round((DISEASES[row.aff.key]?.recovery ?? DAY) / DAY);
  const lines = stale
    ? [t("AZEROTH.Afflictions.Medicine.NotRecorded", { name: patient.name, disease: row.aff.name, why: stale === "gone" ? t("AZEROTH.Afflictions.Medicine.Gone") : t(`AZEROTH.Afflictions.Medicine.Refuse.${stale}`, { name: healer.name, disease: row.aff.name }) })]
    : done?.ok === false || done?.refused
      ? [t("AZEROTH.Afflictions.Medicine.NotWritten", { name: patient.name })]
      : [success
        ? t("AZEROTH.Afflictions.Medicine.Passed", { healer: healer.name, name: patient.name, disease: row.aff.name, days })
        : t("AZEROTH.Afflictions.Medicine.Failed", { healer: healer.name, name: patient.name, disease: row.aff.name })];
  void medicineNextAt;
  return postAfflictionCard(patient, {
    title: t("AZEROTH.Afflictions.Medicine.Card"), lines, accent: "azeroth-card-spell", roll, verdict: verdictOf(roll, dc),
    kind: "medicine", extra: { afflictionId: row.id, success }
  });
}

/* ------------------------------------------------------------------ */
/* GM Expose and Add                                                   */
/* ------------------------------------------------------------------ */

let catalogueCache = null;

/**
 * Every poison and disease a GM can lay: the gear pack's poisons that are carried,
 * the bestiary's venoms (a bare Poisoned N at the ability's own DC), and 09's diseases.
 * @returns {Promise<Array<{kind: string, key: string, name: string, dc: number|null, resilience: string, carried?: object, value?: number}>>}
 */
export async function afflictionCatalogue() {
  if (catalogueCache) return catalogueCache;
  const out = [];
  const gear = game.packs?.get("azeroth-rpg.gear");
  if (gear) {
    const index = await gear.getIndex({ fields: ["system.use.kind", "system.use.carried", "system.use.resist"] });
    for (const e of index) {
      const use = e.system?.use;
      if (use?.kind !== "poison" || !use.carried?.carried) continue;
      out.push({ kind: "poison", key: e.name.toLowerCase().replace(/[^a-z]/g, ""), name: e.name,
        dc: use.resist?.dc ?? null, resilience: use.resist?.resilience ?? "body", carried: use.carried });
    }
  }
  const bestiary = game.packs?.get("azeroth-rpg.bestiary");
  if (bestiary) {
    const index = await bestiary.getIndex({ fields: ["system.creatureAbilities"] });
    const seen = new Set();
    for (const e of index) {
      for (const a of e.system?.creatureAbilities ?? []) {
        const f = a.automation?.afflict;
        if (f?.kind !== "poison" || !f.key || seen.has(f.key)) continue;
        seen.add(f.key);
        out.push({ kind: "poison", key: f.key, name: f.name ?? a.name, dc: f.dc ?? null,
          resilience: f.resilience ?? "body", carried: bareVenom(f.value ?? 1), value: f.value ?? 1 });
      }
    }
  }
  for (const d of diseaseCatalogue()) out.push({ kind: "disease", key: d.key, name: d.name, dc: d.dc, resilience: "body" });
  catalogueCache = out;
  return out;
}

/**
 * **THE ADD PICKER**, through the system's one chooser (D-673): diseases first, then poisons,
 * optionally only one `kind`. Returns `{kind, key}` or null when cancelled. The Afflictions
 * panel's Add and Expose and the bare Poisoned / Diseased hand doors all open this one.
 */
export async function chooseAffliction({ actor, kind = null, prompt = "AZEROTH.Afflictions.Panel.AddPrompt" } = {}) {
  const catalogue = await afflictionCatalogue();
  const only = e => !kind || e.kind === kind;
  const ordered = [...catalogue.filter(e => e.kind === "disease" && only(e)), ...catalogue.filter(e => e.kind === "poison" && only(e))];
  const rows = ordered.map(e => ({
    key: `${e.kind}:${e.key}`,
    name: e.name,
    tag: t(e.kind === "disease" ? "AZEROTH.Afflictions.Panel.Disease" : "AZEROTH.Afflictions.Panel.Poison"),
    description: `<p>${e.dc ? t("AZEROTH.Afflictions.Panel.Dc", { dc: e.dc }) : t("AZEROTH.Afflictions.Panel.NoTest")}</p>`
  }));
  const chosen = await game.system.azeroth.workflows.chooseOption(actor, rows, null, {
    label: "AZEROTH.Afflictions.Panel.Pick", prompt: t(prompt, { name: actor?.name ?? "" })
  });
  if (!chosen?.key) return null;
  const [picked, ...rest] = String(chosen.key).split(":");
  return { kind: picked, key: rest.join(":") };
}

async function entryFor(kind, key) {
  const all = await afflictionCatalogue();
  return all.find(e => e.kind === kind && e.key === key) ?? null;
}

/** Lay it on the creature at the entry's own terms. */
async function layEntry(actor, entry, by = null) {
  return entry.kind === "disease"
    ? afflictDisease({ victim: actor, key: entry.key, by })
    : afflictPoison({ victim: actor, name: entry.name, key: entry.key, dc: entry.dc, resilience: entry.resilience, carried: entry.carried, by });
}

/** A GM lays an affliction with no Test. */
export async function addAffliction({ actor, key, kind } = {}) {
  if (!game.user?.isGM) { ui.notifications?.warn(t("AZEROTH.Afflictions.GMOnly")); return null; }
  const entry = await entryFor(kind, key);
  if (!actor || !entry) return { refused: true, reason: "gone" };
  return layEntry(actor, entry, null);
}

/**
 * A GM exposes a creature: a Body Resilience Test at the source's DC (default the
 * disease's DC), through the roll dialog. A failure lays it.
 * @returns {Promise<ChatMessage|null>}
 */
export async function exposeAffliction({ actor, key, kind, dc = null, event = null } = {}) {
  if (!game.user?.isGM) { ui.notifications?.warn(t("AZEROTH.Afflictions.GMOnly")); return null; }
  const entry = await entryFor(kind, key);
  if (!actor || !entry) return null;
  const { rollWithDialog } = await import("../applications/actions.mjs");
  return rollWithDialog(actor, {
    kind: "resilience",
    resilience: "body",
    title: t("AZEROTH.Afflictions.Expose.Title", { affliction: entry.name }),
    modifiers: game.system.azeroth.workflows.resilienceModifiers(actor, "body"),
    dc: dc ?? entry.dc ?? 12,
    afflictionCtx: { kind, key },
    run: exposeRun
  }, event);
}

async function exposeRun({ actor, dc = 12, boons = 0, banes = 0, modifiers = [], provenanceExtra = [], afflictionCtx = null } = {}) {
  const entry = afflictionCtx ? await entryFor(afflictionCtx.kind, afflictionCtx.key) : null;
  if (!entry) return null;
  const roll = await evaluate({ actor, kind: "resilience", dc, boons, banes, modifiers, provenanceExtra });
  const failed = roll.outcome.success !== true;
  let done = null;
  if (failed) done = await layEntry(actor, entry, null);
  const lines = !failed ? [t("AZEROTH.Afflictions.Expose.Resisted", { name: actor.name, affliction: entry.name })]
    : done?.ok ? [t("AZEROTH.Afflictions.Expose.Laid", { name: actor.name, affliction: entry.name })]
      : [t(`AZEROTH.Afflictions.Refuse.${done?.reason ?? "error"}`, { name: actor.name, affliction: entry.name })];
  return postAfflictionCard(actor, {
    title: t("AZEROTH.Afflictions.Expose.Card"), lines, roll, verdict: verdictOf(roll, dc), kind: "expose", extra: { key: entry.key }
  });
}

/* ------------------------------------------------------------------ */
/* Marsh fever's weekly Test                                           */
/* ------------------------------------------------------------------ */

/**
 * Resolve the weekly relapse Test a prompt card posted (`dice/chat.mjs#rollResists`,
 * purpose `relapse`): a failure while recovering sends the disease back to carried
 * (`weeklyOutcome`), a pass only dates the next week. The prompt is cleared either way.
 */
export async function resolveRelapse({ actor, effectId, success }) {
  const row = afflictionsOf(actor).find(r => r.id === effectId);
  if (!row) return null;
  const patch = { ...weeklyOutcome(row.aff, { success, now: nowOf() }), ...weeklyClearedPatch() };
  const relapsed = !success && row.aff.disease?.stage === "recovering";
  await updateAffliction(actor, row.id, patch);
  const line = success ? t("AZEROTH.Afflictions.Relapse.Held", { name: actor.name, disease: row.aff.name })
    : relapsed ? t("AZEROTH.Afflictions.Relapse.Returned", { name: actor.name, disease: row.aff.name })
      : t("AZEROTH.Afflictions.Relapse.StillCarried", { name: actor.name, disease: row.aff.name });
  await postAfflictionCard(actor, { title: t("AZEROTH.Afflictions.Relapse.Card", { disease: row.aff.name }), lines: [line], kind: "relapse" });
  return { relapsed };
}

/* ------------------------------------------------------------------ */
/* The first Attack or Casting Test of a turn (poisons that Bane it)   */
/* ------------------------------------------------------------------ */

/**
 * Spend the once-a-turn mark of every carried poison that Banes the first Attack
 * or Casting Test of the carrier's turn. In a fight the mark is the round
 * (`turnKeyOf`); out of one there is no mark and every such Test takes the Bane.
 * Called by the roll workflow after the die.
 */
export async function markFirstTestBane(actor, kind) {
  if (kind !== "attack" && kind !== "casting") return [];
  const fight = actor.activeFight?.() ?? null;
  if (!fight) return [];
  const turnKey = `${fight.id}:${fight.round}`;
  const rows = afflictionsOf(actor).map(r => ({ id: r.id, aff: r.aff }));
  const { marks } = afflictionBanes(rows, { kind, turnKey });
  for (const id of marks) await updateAffliction(actor, id, { "clock.baneTurn": turnKey });
  return marks;
}
