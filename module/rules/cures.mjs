/**
 * **CURES THROUGH ONE DOOR** (D12 §5, Phase 6). Pure: no Foundry imports.
 *
 * `effects/cures.mjs#cureAfflictions` reads a creature into plain rows with
 * these helpers, asks `afflictions.mjs#cureJudgement` what a cure may end, and
 * writes through `effects/afflictions.mjs`. Everything a cure DECIDES is here:
 * what an effect is (the carrier's flag before its statuses), which effects are
 * a condition a spell may end, how far Bleeding falls, which gear remedy fits
 * which disease, who a Deliverance reaches, and whether a Long Rest stands in a
 * Haven.
 */

import { AFFLICTION_FLAG, CURE_SPELLS, REMEDIES, cureJudgement } from "./afflictions.mjs";

const NS = "azeroth-rpg";

/** The id of the pseudo-row that stands for "lower Bleeding" in a chooser. */
export const BLEEDING_ROW = "bleeding";
/** The cures that offer Bleeding INSTEAD of an ended effect (07). */
export const BLEEDING_EITHER = Object.freeze(["Cure Poison", "Cleanse"]);

/** Statuses a spell of the condition kind never ends: they have their own clause or are not effects. */
const NOT_CONDITION_EFFECT = Object.freeze(["bleeding", "poisoned", "diseased", "fatigued"]);

/**
 * What a carrier IS, by its flag (the nullifier read the STATUS alone, so a gear
 * poison holding Slowed or Blinded came back `needsReview`).
 * @returns {{category: "poison"|"disease", key: string|null}|null}
 */
export function classifyCarrier(effect) {
  const aff = effect?.flags?.[NS]?.[AFFLICTION_FLAG];
  if (!aff || typeof aff !== "object") return null;
  if (aff.kind !== "poison" && aff.kind !== "disease") return null;
  return { category: aff.kind, key: aff.key ?? null };
}

/**
 * The effects on a creature a cure may end as a CONDITION, as plain rows
 * `{id, kind: "condition", key, name}`. A carrier is never one (it is a poison or
 * a disease whatever statuses it holds); an injury, an aura and a talent's
 * effect are not the target's to lose to a spell.
 * @param {Array<object>} effects  plain `{id, name, statuses, flags, disabled}`
 * @param {string[]} conditionKeys  the system's condition keys
 */
export function conditionRows(effects = [], conditionKeys = []) {
  const known = new Set(conditionKeys);
  return [...effects].flatMap(e => {
    if (!e || e.disabled === true) return [];
    if (classifyCarrier(e)) return [];
    const f = e.flags?.[NS] ?? {};
    if (f[AFFLICTION_FLAG] || f.injury || f.aura || f.talentEffect || f.bond?.talent) return [];
    const statuses = [...(e.statuses ?? [])].filter(s => known.has(s) && !NOT_CONDITION_EFFECT.includes(s)).sort();
    return statuses.length ? [{ id: e.id, kind: "condition", key: statuses[0], name: e.name ?? statuses[0] }] : [];
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)));
}

/** Urgency: a poison is taken before a disease. */
const KIND_ORDER = Object.freeze({ poison: 0, disease: 1 });

/**
 * The carriers as `cureJudgement`'s rows, in a stable order: poison before disease, then
 * name, then id. A cure that takes "the first" (Moonwell's tick, a chooser-less area) takes
 * the most urgent one, as `effects/cures.mjs#cureOnTick` says.
 */
export function carrierRows(carriers = []) {
  return carriers.map(c => ({ id: c.id, kind: c.aff.kind, key: c.aff.key, name: c.aff.name ?? c.effect?.name ?? c.aff.key }))
    .sort((a, b) => (KIND_ORDER[a.kind] ?? 2) - (KIND_ORDER[b.kind] ?? 2)
      || String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)));
}

/** Bleeding after a cure's clause: `{reduce: n}` or `{toZero: true}`. */
export function bleedingAfter(current, clause) {
  const have = Math.max(0, Math.trunc(Number(current) || 0));
  if (!clause) return have;
  if (clause.toZero) return 0;
  return Math.max(0, have - Math.max(0, Math.trunc(Number(clause.reduce) || 0)));
}

/** How many a Cleanse ends at a rank of the caster's Cleanse talent. */
export function cleanseRank(talentRank) {
  return Math.max(1, Math.trunc(Number(talentRank) || 1));
}

/**
 * What one cure may end on one creature, before anything is chosen or paid.
 *
 * @param {object} p
 * @param {string} p.spell        a CURE_SPELLS name
 * @param {Array<object>} p.carriers  `afflictionsOf` rows
 * @param {Array<object>} p.effects   plain effects (for conditions)
 * @param {number} p.bleeding     the creature's Bleeding now
 * @param {string[]} p.conditionKeys
 * @param {number} [p.rank]       the caster's rank in a talent that widens the cure
 * @param {number} [p.sl]         the Casting Test's Success Level (null before it is made)
 * @param {{bleeding?: string}} [p.words]  the caller's localised words (the chooser's Bleeding row)
 * @returns {{refusal: "nothingToCure"}|{rows: object[], judgement: object, bleedingClause: object|null, conditionPick: number, spec: object}}
 */
export function planCure({ spell, carriers = [], effects = [], bleeding = 0, conditionKeys = [], rank = 1, sl = null, words = {} } = {}) {
  const spec = CURE_SPELLS[spell];
  if (!spec) return { refusal: "unknownCure" };
  const conditions = spec.kinds.includes("condition") ? conditionRows(effects, conditionKeys) : [];
  const rows = [...carrierRows(carriers).filter(r => spec.kinds.includes(r.kind)), ...conditions];
  // 07: Cure Poison and Cleanse offer lowering Bleeding INSTEAD of ending an
  // effect (a row to pick); the rest lower it BESIDE what they end (a clause).
  const either = BLEEDING_EITHER.includes(spell) && bleeding > 0;
  const pickRows = either ? [...rows, { id: BLEEDING_ROW, kind: "bleeding", key: "bleeding", name: words?.bleeding ?? "Bleeding" }] : rows;
  const judgeSpec = either && !spec.kinds.includes("bleeding") ? { ...spec, kinds: [...spec.kinds, "bleeding"] } : spec;
  // Absolution lifts *every condition*, and Bleeding is one (A1): to 0.
  const allConditions = spec.kinds.includes("condition") && spec.pick === "all";
  const bleedingClause = bleeding > 0 && !either
    ? (allConditions ? { toZero: true } : (spec.bleeding ?? null)) : null;
  const sl3Rows = spec.sl3 && sl != null && sl >= 3 ? conditionRows(effects, conditionKeys) : [];
  const judgement = pickRows.length ? cureJudgement(pickRows, judgeSpec, { rank }) : { refusal: "nothingToCure" };
  if (!pickRows.length && !bleedingClause && !sl3Rows.length && !spec.heal) return { refusal: "nothingToCure" };
  return { spec, rows: pickRows, judgement, bleedingClause, conditionPick: spec.sl3 && sl != null && sl >= 3 ? spec.sl3.condition ?? 0 : 0, sl3Rows };
}

/* ------------------------------------------------------------------ */
/* Gear remedies (08: on you or a creature you touch)                  */
/* ------------------------------------------------------------------ */

/**
 * Which creature a remedy goes on and whether it fits. `candidates` are the
 * creatures in reach (the targeted creature within 5 feet, else the user): the
 * FIRST that carries the disease the remedy cures is not chosen for the player;
 * the aim is the target when one is in reach, otherwise the user.
 *
 * @param {object} p
 * @param {string} p.cures      DISEASES key the remedy cures
 * @param {Array<object>} p.carriers  the aimed creature's `afflictionsOf` rows
 * @returns {{ok: true, effectId: string}|{ok: false, refusal: "notCarried"|"error"}}
 */
export function remedyJudgement({ cures, carriers = [] } = {}) {
  if (!cures) return { ok: false, refusal: "error" };
  const hit = carriers.find(c => c.aff?.kind === "disease" && c.aff.key === cures);
  return hit ? { ok: true, effectId: hit.id } : { ok: false, refusal: "notCarried" };
}

/** The creature a remedy is aimed at: a targeted one in reach (5 ft), else the user. */
export function remedyAim({ targetFeet = null, hasTarget = false } = {}) {
  if (hasTarget && Number.isFinite(targetFeet) && targetFeet <= 5) return "target";
  if (hasTarget && targetFeet == null) return "target"; // unmeasured: the board cannot say otherwise
  return hasTarget ? "tooFar" : "self";
}

/** Whether a gear Use is a remedy: kind "remedy" naming a disease the table lists. */
export function isRemedy(use) {
  return use?.kind === "remedy" && typeof use.cures === "string" && use.cures.length > 0;
}

export const remedyNameFor = diseaseKey => Object.entries(REMEDIES).find(([, k]) => k === diseaseKey)?.[0] ?? null;

/* ------------------------------------------------------------------ */
/* Areas                                                               */
/* ------------------------------------------------------------------ */

/**
 * Whom a placed cure reaches. Every creature inside is a candidate; Deliverance
 * reaches only the WILLING (07: *every willing creature*). Read: an ally of the
 * caster per `countsAsAlly`, and the caster, are willing; anybody else is not
 * (willingness cannot be asked of a hostile creature on the GM's client).
 *
 * @param {Array<{uuid: string, ally: boolean, caster?: boolean, defeated?: boolean}>} inside
 * @param {object} spec  a CURE_SPELLS row
 */
export function areaReach(inside = [], spec) {
  return inside.filter(c => !c.defeated && (!spec.willing || c.ally === true || c.caster === true));
}

/** The Fatigue a cast leaves its caster (Deliverance: *Casting it leaves you Fatigued*; one step). */
export function casterFatigueAfter(current, spec, max = 6) {
  const add = Math.max(0, Math.trunc(Number(spec?.casterFatigue) || 0));
  return Math.min(max, Math.max(0, Math.trunc(Number(current) || 0)) + add);
}

/** The cure spells whose area works at a Long Rest (Haven, Sanctification). */
export const REST_CURES = Object.freeze(Object.values(CURE_SPELLS).filter(s => s.area === "longRest").map(s => s.name));

/**
 * Whether a Long Rest stands in a laid Haven or Sanctification, and what it gives.
 * @param {Array<{spell: string, inside: boolean}>} regions  the cure Regions on the scene
 * @returns {{ends: boolean, criticalInjury: number, by: string[]}}
 */
export function restCureJudgement(regions = []) {
  const live = regions.filter(r => r.inside === true && REST_CURES.includes(r.spell));
  const by = [...new Set(live.map(r => r.spell))].sort();
  const injury = Math.max(0, ...live.map(r => CURE_SPELLS[r.spell].criticalInjury || 0));
  return { ends: live.length > 0, criticalInjury: injury, by };
}

/** Moonwell: whether the tick also ends an affliction (an ally, 4 Health, one poison or disease). */
export function tickCures(spellName) {
  const s = CURE_SPELLS[spellName];
  return s?.area === "startOfTurn" ? s : null;
}
