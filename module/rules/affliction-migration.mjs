/**
 * **THE AFFLICTION MIGRATION'S DECISIONS** (D12 Phase 8, D-800 to D-805). Pure.
 *
 * `migrations/0.13.0-afflictions.mjs` walks the world and writes; this module only
 * answers which old shape a document is and what to write over it. Nothing here
 * imports Foundry, so the Vitest can hand it each shape in turn.
 *
 * Four old shapes become a carrier (one Active Effect with `flags.azeroth-rpg.affliction`
 * and no duration, rules/afflictions.mjs):
 *
 *  1. the four creature diseases (dredgeSickness, plagueCloud, maggotSlime, tetanus),
 *     timed, converted IN PLACE;
 *  2. the five creature poisons (dredgePoison, virulentPoison, toxicHorrorPoison,
 *     veknissCatalyst), which keep their own state flag and gain the carrier flag;
 *  3. a coating's poison tick (an effect carrying `flags.azeroth-rpg.tick` whose name is a
 *     gear-pack poison that is now carried), replaced by a carrier;
 *  4. gear and weapon coatings that predate `carried` / `cures`.
 *
 * **IDEMPOTENT BY THE CARRIER FLAG.** An effect that already carries the affliction flag
 * is never planned again, and a coating that holds `carried` is never stamped again.
 * **Compared against the PACK COPY, never `undefined`** (D-665): a stored gear item has
 * the schema's null for a field the pack now fills.
 */

import { AFFLICTION_FLAG, HOUR, carrierEffectData, makeDisease, makePoison, poisonKeyOf } from "./afflictions.mjs";
import { creaturePoisonAff } from "./creature-poisons.mjs";
import { dredgePoisonEffect, validDredgePoison } from "./dredge-poison.mjs";
import { toxicPoisonEffect, toxicStacks, validToxicPoison } from "./toxic-horror.mjs";
import { virulentEffect, validVirulent } from "./virulent-poison.mjs";
import { VEKNISS, validVeknissState } from "./vekniss.mjs";

const NS = "azeroth-rpg";
const FLAG = `flags.${NS}`;

/** The old disease flag -> the DISEASES key that replaces it. */
export const OLD_DISEASES = Object.freeze({
  dredgeSickness: "dredgeSickness",
  plagueCloud: "scarabFever",
  maggotSlime: "carrionPalsy",
  tetanus: "lockjaw"
});

export const OLD_POISON_FLAGS = Object.freeze(["dredgePoison", "virulentPoison", "toxicHorrorPoison", "veknissCatalyst"]);

const isObject = v => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** The updates that take a timed effect's clock away, only for what is set. */
export function untimed(effect = {}) {
  const out = {};
  const d = effect.duration ?? {};
  if (d.value != null) out["duration.value"] = null;
  if (d.expiry != null) out["duration.expiry"] = null;
  // `start.time` is NOT nullable in v14 (common/documents/active-effect.mjs), so a field-by-field
  // null fails validation ("start.time may not be undefined"). `start` itself IS nullable: drop it whole.
  if (["time", "combat", "combatant", "round", "turn"].some(k => effect.start?.[k] != null)) out.start = null;
  return out;
}

/** The gear-pack poisons that are carried: what a tick or a coating is matched against. */
export function poisonsFromPack(byName) {
  const out = [];
  for (const [name, system] of byName ?? []) {
    const use = system?.use;
    if (use?.kind !== "poison" || !isObject(use.carried) || use.carried.carried !== true) continue;
    out.push({
      name, key: poisonKeyOf(name), carried: structuredClone(use.carried),
      dc: use.resist?.dc ?? null, resilience: use.resist?.resilience ?? null
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

/** Old creature-poison state made current: no `remaining`, no `until`, a world beat an hour out. */
export function cleanPoisonState(state, now) {
  const next = structuredClone(state);
  delete next.remaining;
  if (isObject(next.ledger) && Array.isArray(next.ledger.exposures)) {
    next.ledger.exposures = next.ledger.exposures.map(e => {
      if (!isObject(e)) return e;
      const { until, ...rest } = e;
      return rest;
    });
  }
  // A claim left in flight by a closed session is not a claim any more.
  if ("pending" in next) next.pending = null;
  // Itch matures on its own short interval; every other world beat is hourly.
  if (next.mode === "world" && Number.isFinite(now) && next.phase !== "itch") next.nextAt = now + HOUR;
  return next;
}

function veknissAff(state, now) {
  const itch = state.phase === "itch";
  return creaturePoisonAff({
    name: itch ? "Vekniss Itch" : "Vekniss Catalyst", key: "creature-vekniss", dc: VEKNISS.dc,
    sourceUuid: state.sourceUuid, now, inFight: state.mode !== "world",
    value: itch ? 0 : 1, damage: itch ? 0 : VEKNISS.damage, statuses: itch ? [] : ["poisoned", "slowed"]
  });
}

/** The carrier a creature poison's old state describes, or null when the state is not valid. */
function poisonAffFor(flagKey, state, ns, now) {
  const inFight = state?.mode === "combat";
  if (flagKey === "dredgePoison") {
    return validDredgePoison(state) ? dredgePoisonEffect(state, { now, inFight })?.flags?.[NS]?.[AFFLICTION_FLAG] ?? null : null;
  }
  if (flagKey === "toxicHorrorPoison") {
    const clean = { ...state, pending: null };
    if (!validToxicPoison(clean)) return null;
    return toxicPoisonEffect({ state: clean, value: toxicStacks(clean) }, { now, inFight })?.flags?.[NS]?.[AFFLICTION_FLAG] ?? null;
  }
  if (flagKey === "virulentPoison") {
    const value = Number.isInteger(ns?.value) ? ns.value : state?.ledger?.stacks?.length;
    const clean = cleanPoisonState(state ?? {}, now);
    if (!validVirulent(clean)) return null;
    return virulentEffect({ state: clean, value }, { now, inFight })?.flags?.[NS]?.[AFFLICTION_FLAG] ?? null;
  }
  if (flagKey === "veknissCatalyst") return validVeknissState(state) ? veknissAff(state, now) : null;
  return null;
}

/**
 * What to do with one Active Effect.
 *
 * @param {object} effect  `{id, name, origin, statuses, duration, start, flags}`, `flags` being
 *   the effect's `azeroth-rpg` namespace.
 * @param {object} ctx     `{now, abilities, type, held: [{kind, key}], poisons}`
 * @returns {null | {op: "update", id, update, forced: string[], note} |
 *   {op: "replace", id, create, note} | {op: "drop", id, note} | {op: "skip", id, reason}}
 *   null means nothing to do (not an old shape, or already converted).
 */
export function planEffect(effect, ctx = {}) {
  const ns = effect?.flags;
  if (!effect?.id || !isObject(ns)) return null;
  if (isObject(ns[AFFLICTION_FLAG])) return null;
  const now = Number.isFinite(ctx.now) ? ctx.now : 0;
  const strip = untimed(effect);

  // 1. A creature disease, converted in place.
  for (const [flagKey, diseaseKey] of Object.entries(OLD_DISEASES)) {
    if (!isObject(ns[flagKey])) continue;
    const aff = makeDisease(diseaseKey, { source: { uuid: effect.origin ?? null, name: "" }, now });
    const data = carrierEffectData(aff, { abilities: ctx.abilities ?? {}, type: ctx.type ?? "character", origin: effect.origin ?? null });
    return {
      op: "update", id: effect.id, forced: [], note: `${flagKey} -> ${diseaseKey}`,
      update: {
        name: data.name,
        statuses: data.statuses,
        "system.changes": data.system.changes,
        [`${FLAG}.${AFFLICTION_FLAG}`]: aff,
        [`${FLAG}.harmful`]: true,
        [`${FLAG}.disease`]: true,
        ...strip
      }
    };
  }

  // 2. A bespoke creature poison keeps its state and gains the carrier.
  for (const flagKey of OLD_POISON_FLAGS) {
    if (!isObject(ns[flagKey])) continue;
    const aff = poisonAffFor(flagKey, ns[flagKey], ns, now);
    if (!aff) return { op: "skip", id: effect.id, reason: `${flagKey} state is not valid` };
    return {
      op: "update", id: effect.id, forced: [`${FLAG}.${flagKey}`], note: `${flagKey} carried`,
      update: {
        [`${FLAG}.${AFFLICTION_FLAG}`]: aff,
        [`${FLAG}.${flagKey}`]: cleanPoisonState(ns[flagKey], now),
        [`${FLAG}.poison`]: true,
        ...strip
      }
    };
  }

  // 3. A coating's poison tick becomes a carrier. A spell's tick is left alone.
  if (isObject(ns.tick) && !ns.tick.castUuid) {
    const key = poisonKeyOf(ns.tick.name);
    const poison = key ? (ctx.poisons ?? []).find(p => p.key === key) : null;
    if (!poison) return null;
    if ((ctx.held ?? []).some(h => h.kind === "poison" && h.key === poison.key)) {
      return { op: "drop", id: effect.id, note: `${poison.name} already carried` };
    }
    const aff = makePoison({
      name: poison.name, key: poison.key, dc: poison.dc, resilience: poison.resilience,
      carried: poison.carried, source: { uuid: ns.tick.source ?? null, name: "" }, now, inFight: false
    });
    if (!aff) return null;
    return {
      op: "replace", id: effect.id, note: `${poison.name} tick -> carrier`,
      create: carrierEffectData(aff, { abilities: ctx.abilities ?? {}, type: ctx.type ?? "character", origin: ns.tick.source ?? null }),
      held: { kind: "poison", key: poison.key }
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

/** Gear that predates `use.carried` / `use.cures`: stamp them from the pack copy. */
export function planGear(rawSystem, packSystem) {
  const use = rawSystem?.use;
  const pack = packSystem?.use;
  if (!isObject(pack)) return null;
  const out = {};
  if (isObject(pack.carried) && !isObject(use?.carried)) out["system.use.carried"] = structuredClone(pack.carried);
  if (typeof pack.cures === "string" && pack.cures && !(typeof use?.cures === "string" && use.cures)) out["system.use.cures"] = pack.cures;
  return Object.keys(out).length ? out : null;
}

/** A weapon coating laid before `carried`: name it from the pack poison, or leave it. */
export function planCoating(coating, poisons = []) {
  if (!isObject(coating) || coating.kind !== "poison" || isObject(coating.carried)) return null;
  const key = poisonKeyOf(coating.name);
  const poison = key ? poisons.find(p => p.key === key) : null;
  if (!poison) return null;
  return {
    [`${FLAG}.coating.carried`]: structuredClone(poison.carried),
    [`${FLAG}.coating.key`]: poison.key
  };
}
