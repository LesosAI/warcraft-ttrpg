/**
 * **THE ONE WRITER OF A CARRIED AFFLICTION** (D12, Phase 5a). A poison or a
 * disease carried until cured is ONE Active Effect with no duration, flagged
 * `flags.azeroth-rpg.affliction` (`rules/afflictions.mjs#carrierEffectData`).
 * Nothing else creates, re-stages or deletes one.
 *
 *   afflict(actor, {aff, by})            lay a carrier (refused: immune, already carried)
 *   updateAffliction(actor, id, patch)   a DOTTED patch, statuses and changes re-derived
 *   endAffliction(actor, id, {by})       the carrier goes
 *   afflictionsOf(actor)                 the carriers, as {id, effect, aff}
 *   applyCure(actor, cure, {by})         ONE write of a whole cure: carriers and
 *                                        conditions ended, Bleeding lowered, damage, healing
 *
 * Here where this client owns the creature, through the active GM's client
 * (`CONFIG.queries["azeroth-rpg.afflict"]`) otherwise; never `game.socket`.
 * `rules/gm-writes.mjs#gmAbsentFor` is asked BEFORE anything is spent, and the
 * handler judges the asker (`rules/afflict-asker.mjs`): a GM keeps every power; a
 * player who owns the hand (`by`) may ask only for an INTENT (lay a published
 * affliction, record a Medicine Test, make a cure the spell or remedy allows), and the
 * GM's client works the mechanics out again from the catalogue and the documents.
 */

import {
  AFFLICTION_FLAG, afflictRefusal, applyAfflictionPatch, carrierEffectData, carrierPoisonedValue,
  carrierRefresh, cleanAffliction, fatigueAfter, foldTicks, penaltiesApply
} from "../rules/afflictions.mjs";
import { tetanusHealthPatch } from "../rules/tetanus.mjs";
import { cureBleedingPlan } from "../rules/cure-poison.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { resolveDamage } from "../rules/mitigation.mjs";
import { schoolArmorBySchool } from "../rules/auras.mjs";
import { dealtHalvedBy } from "../rules/legacy-uses.mjs";
import { askerRefusal, cleanCureAsk, layFromCatalogue, medicineWrite } from "../rules/afflict-asker.mjs";
import { writeQueue } from "../rules/write-queue.mjs";

export const AFFLICT_QUERY = "azeroth-rpg.afflict";
const NS = "azeroth-rpg";
const FLAG_PATH = `flags.${NS}.${AFFLICTION_FLAG}`;

/** One lay at a time for each creature: two lays of one key make one carrier. */
const layQueue = writeQueue();

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** The carriers on a creature, each `{id, effect, aff}`. */
export function afflictionsOf(actor) {
  return [...(actor?.effects ?? [])].flatMap(effect => {
    const aff = effect.flags?.[NS]?.[AFFLICTION_FLAG];
    return aff && typeof aff === "object" && aff.kind ? [{ id: effect.id, effect, aff }] : [];
  });
}

/** The stored base scores a disease's changes are worked out against. */
const abilitiesOf = actor => actor._source?.system?.abilities ?? actor.system?.abilities ?? {};

/** A weakened Constitution lowers the maximum: the stored current Health follows it down. */
async function clampHealth(actor, aff) {
  if (!penaltiesApply(aff) || !aff.repeat?.maxHealthFollowsCon) return false;
  const patch = tetanusHealthPatch({
    type: actor.type, storedHealth: actor._source?.system?.health?.value, preparedMaximum: actor.system?.health?.max
  });
  if (!patch) return false;
  await actor.update(patch);
  return true;
}

/* ------------------------------------------------------------------ */
/* Local writes: this client may write the creature                    */
/* ------------------------------------------------------------------ */

function layHere(actor, aff, { by = null } = {}) {
  return layQueue.run(actor.uuid, () => layNow(actor, aff, { by }), actor);
}

async function layNow(actor, aff, { by = null } = {}) {
  const rows = afflictionsOf(actor);
  const refusal = afflictRefusal({
    kind: aff.kind, key: aff.key,
    immunities: actor.system?.conditionImmunities ?? [],
    carried: rows.map(r => ({ kind: r.aff.kind, key: r.aff.key }))
  });
  if (refusal === "alreadyCarried") {
    // A second exposure changes nothing; a poison that holds Poisoned re-lays its value.
    const row = rows.find(r => r.aff.kind === aff.kind && r.aff.key === aff.key);
    let relaid = false;
    if (row && aff.kind === "poison" && carrierPoisonedValue(row.aff)) {
      await row.effect.update(carrierRefresh(row.aff, { abilities: abilitiesOf(actor), type: actor.type }));
      relaid = true;
    }
    return { refused: true, reason: refusal, relaid, effectId: row?.id ?? null };
  }
  if (refusal) return { refused: true, reason: refusal };
  const data = carrierEffectData(aff, { abilities: abilitiesOf(actor), type: actor.type, origin: by?.uuid ?? null });
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  if (!effect) return { refused: true, reason: "error" };
  await clampHealth(actor, aff);
  return { ok: true, effectId: effect.id, name: aff.name, kind: aff.kind };
}

async function updateHere(actor, effectId, patch) {
  const effect = actor.effects.get(effectId);
  const aff = effect?.flags?.[NS]?.[AFFLICTION_FLAG];
  if (!effect || !aff) return { refused: true, reason: "gone" };
  const clean = cleanAffliction(patch);
  const next = applyAfflictionPatch(aff, clean);
  const update = Object.fromEntries(Object.entries(clean).map(([k, v]) => [`${FLAG_PATH}.${k}`, v]));
  // The stage moved: statuses and changes follow it in the SAME write.
  if (Object.keys(clean).some(k => k === "disease.stage" || k.startsWith("repeat"))) {
    Object.assign(update, carrierRefresh(next, { abilities: abilitiesOf(actor), type: actor.type }));
  }
  await effect.update(update);
  await clampHealth(actor, next);
  return { ok: true, effectId, aff: next };
}

async function endHere(actor, effectId) {
  const effect = actor.effects.get(effectId);
  if (!effect || !effect.flags?.[NS]?.[AFFLICTION_FLAG]) return { refused: true, reason: "gone" };
  await effect.delete();
  return { ok: true, effectId };
}

/**
 * A whole cure in one write on the creature's own client (D12 Phase 6). `cure`:
 * `{ends: [effectId], bleeding: {reduce}|{toZero}|null, heal: n, damage: n}`.
 * Damage lands first and is untyped (the printed number: no Armor Point or Ward
 * takes it, as a poison's tick), then what ends, then the healing.
 */
async function cureHere(actor, cure = {}, { by = null } = {}) {
  const out = { ended: [], bleeding: 0, healed: 0, damaged: 0 };
  // Purging Flame: 07 says "2 Fire damage, bypassing armor and Ward", so the printed number is
  // typed (Immune, Vulnerable and a halving still stand: rules/bypass.mjs) and past armor and Ward.
  const printed = cure.damage && typeof cure.damage === "object" ? cure.damage : { amount: cure.damage, type: null };
  const amount = Math.max(0, Math.trunc(Number(printed.amount) || 0));
  if (amount > 0) {
    const s = actor.system ?? {};
    const dealt = resolveDamage({
      rating: amount, sl: 0, kind: "magical", school: printed.type ?? null, bypass: true,
      immune: s.immune ?? [], vulnerable: s.vulnerable ?? [], slAddsToDamage: false,
      // The aura's Armor Points are read like every magical blow's (bypass then takes none of them),
      // and the caster's own halving (04's Drawn Across) stands: the words name armor and Ward only.
      schoolArmor: schoolArmorBySchool(s.schoolArmor)[printed.type] ?? 0,
      dealtHalved: dealtHalvedBy(by)
    });
    await actor.applyDamage(dealt.damage, { struck: true, attack: false, location: "body", type: printed.type ?? null, spell: true });
    out.damaged = dealt.damage;
  }
  for (const id of [...new Set((cure.ends ?? []).map(String))]) {
    const effect = actor.effects.get(id);
    if (!effect) continue;
    const f = effect.flags?.[NS] ?? {};
    // Never an injury, an aura or a talent's effect: those are not the spell's to end.
    if (f.injury || f.aura || f.talentEffect || f.bond?.talent) continue;
    out.ended.push(effect.name);
    await effect.delete();
  }
  if (cure.bleeding) {
    const plain = [...actor.effects].map(e => ({ id: e.id, statuses: [...(e.statuses ?? [])], flags: e.flags ?? {}, disabled: e.disabled === true }));
    const amount = cure.bleeding.toZero ? Infinity : Math.max(0, Math.trunc(Number(cure.bleeding.reduce) || 0));
    const plan = cureBleedingPlan(plain, amount);
    if (plan?.removed) {
      await actor.updateEmbeddedDocuments("ActiveEffect", plan.updates);
      out.bleeding = plan.removed;
    }
  }
  const heal = Math.max(0, Math.trunc(Number(cure.heal) || 0));
  if (heal > 0) {
    await actor.applyHealing(heal, { spell: true });
    out.healed = heal;
  }
  return { ok: true, ...out };
}

/* ------------------------------------------------------------------ */
/* The query                                                           */
/* ------------------------------------------------------------------ */

/**
 * GM-side handler. A GM asker keeps every power; a player's ask is judged by
 * `rules/afflict-asker.mjs` and its mechanics are re-derived HERE from the catalogue and the
 * documents, never read from the payload. With no `user` the call is the GM's own.
 */
export async function afflictQueryHandler(payload = {}, { user = null } = {}) {
  const actor = payload.actorUuid ? await fromUuid(payload.actorUuid) : null;
  if (!actor || actor.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  const by = payload.byUuid ? await fromUuid(payload.byUuid) : null;
  const byActor = by?.documentName === "Actor" ? by : null;
  const isGM = !user || user.isGM === true;
  const op = !isGM && payload.op === "update" ? "medicine" : payload.op;
  const refusal = askerRefusal({ isGM, op, byOwned: Boolean(byActor?.testUserPermission(user, "OWNER")) });
  if (refusal === "notYours") throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: by?.name ?? "" }));
  if (refusal) throw new Error(t("AZEROTH.Afflictions.Refuse.error"));
  const now = game.time?.worldTime ?? 0;
  switch (op) {
    case "lay": {
      if (isGM) {
        const aff = cleanAffliction(payload.aff);
        if (!aff.kind || !aff.key || !aff.name) throw new Error(t("AZEROTH.Afflictions.Refuse.error"));
        return layHere(actor, aff, { by: byActor });
      }
      const { afflictionCatalogue } = await import("../dice/afflictions-workflows.mjs");
      const aff = layFromCatalogue(payload.ask, await afflictionCatalogue(), {
        source: { uuid: byActor.uuid, name: byActor.name }, now, inFight: Boolean(actor.activeFight?.())
      });
      if (!aff) throw new Error(t("AZEROTH.Afflictions.Refuse.error"));
      return layHere(actor, aff, { by: byActor });
    }
    case "update": return updateHere(actor, String(payload.effectId ?? ""), payload.patch ?? {});
    case "medicine": {
      const effect = actor.effects.get(String(payload.effectId ?? ""));
      const aff = effect?.flags?.[NS]?.[AFFLICTION_FLAG];
      const healer = payload.medicine?.healerUuid ? await fromUuid(payload.medicine.healerUuid) : null;
      if (!effect || !aff || healer?.documentName !== "Actor" || healer.uuid !== byActor.uuid) return { refused: true, reason: "gone" };
      const judged = medicineWrite(aff, {
        success: payload.medicine.success === true, now,
        healerOwned: healer.testUserPermission(user, "OWNER"),
        healerCarries: afflictionsOf(healer).some(r => r.aff.key === aff.key),
        inFight: Boolean(actor.activeFight?.() || healer.activeFight?.())
      });
      if (!judged.ok) return { refused: true, reason: judged.reason };
      return updateHere(actor, effect.id, judged.patch);
    }
    case "end": return endHere(actor, String(payload.effectId ?? ""));
    case "cure": {
      if (isGM) return cureHere(actor, payload.cure ?? {}, { by: byActor });
      const { buildAskedCure } = await import("./cures.mjs");
      const built = await buildAskedCure(actor, cleanCureAsk(payload.ask), { by: byActor });
      if (!built.cure) return { refused: true, reason: built.refusal ?? "error" };
      return cureHere(actor, built.cure, { by: byActor });
    }
    default: throw new Error(t("AZEROTH.Afflictions.Refuse.error"));
  }
}

/** Run `local` here when this client owns the creature, else ask the active GM. */
async function route(actor, payload, local) {
  if (!actor) return { refused: true, reason: "gone" };
  if (gmAbsentFor({ owned: [actor.isOwner], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) {
    ui.notifications?.warn(t("AZEROTH.Afflictions.Refuse.noGM", { name: actor.name }));
    return { refused: true, reason: "noGM" };
  }
  if (actor.isOwner) return local();
  try {
    const done = await game.users.activeGM.query(AFFLICT_QUERY, { ...payload, actorUuid: actor.uuid }, { timeout: 15000 });
    return done && typeof done === "object" ? done : { refused: true, reason: "error" };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { refused: true, reason: "error" };
  }
}

/* ------------------------------------------------------------------ */
/* The public API                                                      */
/* ------------------------------------------------------------------ */

/**
 * Lay a carrier. `aff` is a whole carrier from `makePoison` / `makeDisease`.
 * @returns {Promise<{ok?: true, refused?: true, reason?: string, effectId?: string, relaid?: boolean}>}
 */
export async function afflict(actor, { aff, by = null } = {}) {
  if (!aff?.kind || !aff?.key) return { refused: true, reason: "error" };
  return route(actor, { op: "lay", aff, ask: { kind: aff.kind, key: aff.key }, byUuid: by?.uuid ?? null }, () => layHere(actor, aff, { by }));
}

/** A dotted patch onto a carrier (see `rules/afflictions.mjs`'s patch builders). */
export async function updateAffliction(actor, effectId, patch, { by = null, medicine = null } = {}) {
  return route(actor, { op: "update", effectId, patch, medicine, byUuid: by?.uuid ?? null }, () => updateHere(actor, effectId, patch));
}

/** The carrier goes (a cure, a recovery that has run, a GM's hand). */
export async function endAffliction(actor, effectId, { by = null } = {}) {
  return route(actor, { op: "end", effectId, byUuid: by?.uuid ?? null }, () => endHere(actor, effectId));
}

/** One whole cure (see `cureHere`): here where this client owns the creature, else through the active GM. */
export async function applyCure(actor, cure, { by = null, ask = null } = {}) {
  return route(actor, { op: "cure", cure, ask, byUuid: by?.uuid ?? null }, () => cureHere(actor, cure, { by }));
}

/* ------------------------------------------------------------------ */
/* Cards and landing events                                            */
/* ------------------------------------------------------------------ */

export const CARD_TEMPLATE = "systems/azeroth-rpg/templates/chat/affliction-card.hbs";

/**
 * One card in the system card shape. `accent` is a card class: `azeroth-card-attack`
 * (red) for a harm landing, `azeroth-card-spell` (blue) for Medicine and cures.
 */
export async function postAfflictionCard(actor, { title, lines = [], accent = "azeroth-card-attack", roll = null, verdict = null, kind = "afflictions", extra = {} } = {}) {
  const { renderTemplate } = foundry.applications.handlebars;
  const content = await renderTemplate(CARD_TEMPLATE, { cardClass: accent, title, name: actor.name, lines, verdict });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    ...(roll ? { rolls: [roll] } : {}),
    flags: { [NS]: { kind, actorUuid: actor.uuid, ...extra } }
  });
}

/**
 * Land the events one carrier's clock produced and say what came of them, as
 * lines (the caller posts ONE card per carrier per jump, R4). Damage is landed
 * ONCE as the total, untyped (the printed number: no Armor Point or Ward reduces
 * it); Fatigue only on a character, clamped to the track; a relay re-lays what
 * the carrier holds; a stage change goes through `updateAffliction`.
 * The caller has already judged that this client may write (the active GM).
 *
 * @returns {Promise<{lines: string[], ended: boolean}>}
 */
export async function landEvents(actor, effectId, events, { patch = {}, ended = false } = {}) {
  const lines = [];
  const effect = actor.effects.get(effectId);
  const aff = effect?.flags?.[NS]?.[AFFLICTION_FLAG];
  if (!effect || !aff) return { lines, ended: false };

  // CLAIM THE BEAT FIRST: the clock's own patch is written before the damage lands, so a write
  // that fails leaves the hours owed (and re-landed once) and never lands them twice.
  const stage = events.find(e => e.type === "stage");
  const clockPatch = Object.fromEntries(Object.entries(patch).filter(([k]) => k.startsWith("clock.")));
  const restPatch = Object.fromEntries(Object.entries(patch).filter(([k]) => !k.startsWith("clock.")));
  if (Object.keys(clockPatch).length && !ended) await updateHere(actor, effectId, clockPatch);

  const tick = foldTicks(events);
  if (tick) {
    const alive = actor.type !== "npc" || (actor.system?.health?.value ?? 0) > 0;
    if (tick.damage > 0 && alive) {
      await actor.applyDamage(tick.damage, { struck: true, attack: false, location: "body", type: null });
    }
    if (tick.fatigue > 0 && actor.type === "character") {
      const now = fatigueAfter(actor.system?.fatigue ?? 0, tick.fatigue, CONFIG.AZEROTH?.FATIGUE_MAX ?? 6);
      await actor.update({ "system.fatigue": now });
    }
    lines.push(t(tick.count === 1 ? "AZEROTH.Afflictions.Tick.One" : "AZEROTH.Afflictions.Tick.Many", { name: actor.name, poison: aff.name, count: tick.count, damage: tick.damage, fatigue: tick.fatigue }));
  }

  if (ended) {
    await effect.delete();
    lines.push(t("AZEROTH.Afflictions.Recovered", { name: actor.name, disease: aff.name }));
    return { lines, ended: true };
  }

  if (Object.keys(restPatch).length) {
    await updateHere(actor, effectId, restPatch);
    if (stage) lines.push(t(`AZEROTH.Afflictions.Stage.${stage.to}`, { name: actor.name, disease: aff.name }));
  }
  if (events.some(e => e.type === "relay")) {
    // R1: whatever shed or removed the condition, the carrier lays it again.
    await effect.update(carrierRefresh(aff, { abilities: abilitiesOf(actor), type: actor.type }));
    if (carrierPoisonedValue(aff)) lines.push(t("AZEROTH.Afflictions.Relaid", { name: actor.name, poison: aff.name, value: carrierPoisonedValue(aff) }));
  }
  return { lines, ended: false };
}
