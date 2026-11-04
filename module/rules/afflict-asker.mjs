/**
 * **WHAT A PLAYER MAY ASK THE GM'S CLIENT TO WRITE ON A CARRIER** (D12 review, the
 * permission finding). Pure: no Foundry imports.
 *
 * `effects/afflictions.mjs#afflictQueryHandler` runs on the active GM's client with
 * the GM's rights. A GM asker keeps every power. A player asker sends an INTENT, never
 * a mechanic, and every number below is worked out again here from the catalogue and
 * from the documents the handler read itself:
 *
 *   lay       `{kind, key}`           the carrier is rebuilt from `DISEASES` or the catalogue
 *   medicine  `{success, ...}`        the patch is `medicineOutcome`'s, judged by `medicineRefusal`
 *   cure      `{spell, ids, ...}`     the plan is `planCure`'s; heal and damage are the spell's own
 *             `{remedy}`              the one carrier of the disease the remedy cures
 *   update / end                      a GM's alone
 *
 * A payload's `aff`, `patch`, `cure.ends`, `heal` and `damage` are never read for a player.
 */

import {
  DISEASES, REMEDIES, CURE_SPELLS, makeDisease, makePoison, medicineOutcome, medicineRefusal
} from "./afflictions.mjs";
import { BLEEDING_ROW, remedyJudgement } from "./cures.mjs";

/** The ops a player may ask for, and only through an actor they own. */
export const PLAYER_OPS = Object.freeze(["lay", "medicine", "cure"]);

/** The dotted keys a Medicine Test writes, and the only ones a player's ask can ever reach. */
export const MEDICINE_PATHS = Object.freeze(["disease.triedAt", "disease.stage", "disease.recoverAt"]);

/**
 * null, or the reason KEY a request is refused before anything is read.
 * @param {{isGM?: boolean, op: string, byOwned?: boolean}} o  `op`: lay | update | end | cure | medicine
 */
export function askerRefusal({ isGM = false, op, byOwned = false } = {}) {
  if (isGM === true) return ["lay", "update", "end", "cure", "medicine"].includes(op) ? null : "error";
  if (!PLAYER_OPS.includes(op)) return "forbidden";
  return byOwned === true ? null : "notYours";
}

/**
 * A carrier rebuilt from what the world publishes, for a player's `lay`. `catalogue` rows
 * are `afflictionCatalogue`'s. Returns null for a key the world does not publish.
 */
export function layFromCatalogue(ask, catalogue = [], { source = null, now = 0, inFight = false } = {}) {
  const kind = ask?.kind, key = typeof ask?.key === "string" ? ask.key : "";
  if (!key) return null;
  if (kind === "disease") {
    return Object.hasOwn(DISEASES, key) ? makeDisease(key, { source, now }) : null;
  }
  if (kind !== "poison") return null;
  const entry = (catalogue ?? []).find(e => e.kind === "poison" && e.key === key);
  if (!entry) return null;
  return makePoison({
    name: entry.name, key: entry.key, dc: entry.dc ?? null, resilience: entry.resilience ?? "body",
    carried: entry.carried, source, now, inFight
  });
}

/**
 * A player's Medicine write, judged against the carrier as the GM's client reads it NOW:
 * a disease, a healer the asker owns who does not carry it, not in a fight, not at onset or
 * while recovering, once in a day. Returns the dotted patch, or a reason key.
 *
 * @param {object} aff  the carrier flag as stored
 * @param {{success: boolean, now: number, healerOwned: boolean, healerCarries: boolean, inFight: boolean}} o
 * @returns {{ok: true, patch: object}|{ok: false, reason: string}}
 */
export function medicineWrite(aff, { success, now, healerOwned = false, healerCarries = false, inFight = false } = {}) {
  if (!aff || aff.kind !== "disease") return { ok: false, reason: "gone" };
  if (healerOwned !== true) return { ok: false, reason: "notYours" };
  const why = medicineRefusal({
    stage: aff.disease?.stage, healerCarries, triedAt: aff.disease?.triedAt ?? null, now, inFight
  });
  if (why) return { ok: false, reason: why };
  return { ok: true, patch: medicineOutcome(aff, { success: success === true, now }) };
}

/** A player's cure ask reduced to the fields it may carry, with every number bounded. */
export function cleanCureAsk(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const num = (v, lo, hi, d) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  if (typeof o.remedy === "string" && o.remedy) return { remedy: o.remedy };
  return {
    spell: typeof o.spell === "string" ? o.spell : "",
    ids: Array.isArray(o.ids) ? [...new Set(o.ids.filter(i => typeof i === "string"))].slice(0, 12) : [],
    rank: num(o.rank, 1, 3, 1),
    sl: o.sl == null ? null : num(o.sl, -6, 6, null),
    heal: o.heal === true,
    damage: o.damage === true
  };
}

/**
 * The ids a cure may end, from the plan alone: a forced answer is the plan's; a choice is
 * the requested ids among its options, no more than it allows; the Success Level 3 condition
 * is a row of the plan's own. The Bleeding pseudo-row is allowed where the plan lists it.
 * @param {object} plan  `planCure`'s answer (not a refusal)
 * @param {string[]} asked
 * @returns {string[]}
 */
export function planIds(plan, asked = []) {
  const want = new Set(asked);
  let ids = [];
  if (plan.judgement?.ends) ids = [...plan.judgement.ends];
  else if (plan.judgement?.choose) {
    const live = new Set(plan.judgement.choose.options);
    ids = asked.filter(id => live.has(id)).slice(0, plan.judgement.choose.pick);
  }
  if (plan.conditionPick && plan.sl3Rows?.length) {
    const rows = new Set(plan.sl3Rows.map(r => r.id));
    const more = [...want].filter(id => rows.has(id) && !ids.includes(id)).slice(0, plan.conditionPick);
    ids.push(...more);
  }
  return ids;
}

/**
 * The cure to write, from the SPELL's row and the plan: ends, the Bleeding clause, the
 * spell's own healing and damage. Nothing here comes from a payload but the ids (bounded
 * by `planIds`) and two switches that can only turn the spell's own numbers off.
 * @returns {{ends: string[], bleeding: object|null, heal: number, damage: object|null}}
 */
export function cureFromSpec(spec, plan, ids, { heal = true, damage = true } = {}) {
  let ends = [...ids];
  let bleeding = plan.bleedingClause ?? null;
  if (ends.includes(BLEEDING_ROW)) {
    ends = ends.filter(id => id !== BLEEDING_ROW);
    bleeding = spec.bleeding ?? { reduce: 2 };
  }
  return {
    ends, bleeding,
    heal: heal && spec.heal ? spec.heal : 0,
    damage: damage && spec.damage ? { amount: spec.damage.amount, type: spec.damage.type ?? null } : null
  };
}

/** The spell row for a name the world publishes, or null. */
export const cureSpecOf = name => (Object.hasOwn(CURE_SPELLS, name) ? CURE_SPELLS[name] : null);

/**
 * A gear remedy: the one carrier of the disease it cures, and nothing else.
 * @returns {{cure: {ends: string[]}}|{refusal: string}}
 */
export function remedyWrite({ remedy, carriers = [] } = {}) {
  const cures = Object.hasOwn(DISEASES, remedy) ? remedy : null;
  if (!cures || !Object.values(REMEDIES).includes(cures)) return { refusal: "error" };
  const verdict = remedyJudgement({ cures, carriers });
  return verdict.ok ? { cure: { ends: [verdict.effectId] } } : { refusal: verdict.refusal };
}

/** Whether `names` (the asker's actor's item names, and spell names inside items) include a spell. */
export function holdsCure(name, held = []) {
  return Boolean(name) && held.some(n => n === name);
}
