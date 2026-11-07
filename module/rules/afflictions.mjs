/**
 * **AFFLICTIONS: POISONS AND DISEASES CARRIED UNTIL CURED** (D12, approved by the
 * lead 2026-11-03). Pure: no Foundry imports, no `game`, no `CONFIG` (CLAUDE.md §3).
 * Every time is world-time SECONDS (`game.time.worldTime`).
 *
 * ## The carrier: `flags.azeroth-rpg.affliction` on an Active Effect
 *
 *   kind        "poison" | "disease"
 *   key         a poison's slug, or the disease key in `DISEASES`
 *   name, dc, resilience
 *   source      {uuid, name}
 *   repeat      what is carried: `readCarried`'s descriptor for a poison, the
 *               disease's `carried` descriptor for a disease
 *   clock       {mode: "fight" | "world", nextAt}: the next hourly beat
 *   disease     {stage, onsetAt, recoverAt, triedAt, weeklyAt} (diseases only)
 *
 * Every patch this module returns uses DOTTED keys (`"disease.triedAt"`), so a
 * writer sets one field and never rebuilds an object (CLAUDE.md §15, D-671).
 * `cleanAffliction` follows the same rule at every depth.
 *
 * Reasons are returned as KEYS; the strings belong to the lang file.
 */

import { dredgeSicknessChanges } from "./dredge-worm.mjs";
import { plagueCloudChanges } from "./plague-cloud.mjs";
import { maggotSlimeChanges } from "./maggot-slime.mjs";
import { SHED_DC_FLAG } from "./escapes.mjs";

export const AFFLICTION_FLAG = "affliction";
export const AFFLICTION_KINDS = Object.freeze(["poison", "disease"]);
export const DISEASE_STAGES = Object.freeze(["onset", "carried", "recovering"]);
export const BEATS = Object.freeze(["turn", "hour"]);
export const HOUR = 3600;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

const ABILITY_KEYS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
const ALL_SIX = Object.freeze(Object.fromEntries(ABILITY_KEYS.map(k => [k, -2])));

function carriedOf(o) {
  return Object.freeze({
    fatigue: 0, banes: [], abilities: {}, damageRating: 0,
    maxHealthFollowsCon: false, weekly: null, ...o
  });
}

function disease(key, name, dc, onsetDays, recoveryDays, remedy, carried) {
  return Object.freeze({
    key, name, dc,
    onset: onsetDays * DAY,
    recovery: recoveryDays * DAY,
    remedy,
    carried: carriedOf(carried)
  });
}

/** D12 §3, keyed camelCase. The Vitest reads 09 §8's table against it. */
export const DISEASES = Object.freeze({
  rotFever: disease("rotFever", "Rot-fever", 12, 1, 3, "Silverleaf poultice", { fatigue: 1 }),
  bloodyFlux: disease("bloodyFlux", "Bloody flux", 12, 1, 3, "Earthroot tea",
    { banes: [{ test: "str" }, { test: "con" }] }),
  marshFever: disease("marshFever", "Marsh fever", 15, 2, 5, "Liferoot bitters",
    { fatigue: 1, weekly: { resilience: "body", dc: 15 } }),
  mange: disease("mange", "Mange", 12, 1, 5, "Mageroyal salve", { banes: [{ test: "cha" }] }),
  blacklung: disease("blacklung", "Blacklung", 15, 7, 14, "Briarthorn steam",
    { banes: [{ test: "resilience:body" }] }),
  carrionPalsy: disease("carrionPalsy", "Carrion palsy", 15, 0, 2, "Grave moss tincture",
    { damageRating: -2 }),
  dredgeSickness: disease("dredgeSickness", "Dredge sickness", 17, 0, 3, "Stranglekelp purge",
    { abilities: { ...ALL_SIX, min: 3 } }),
  scarabFever: disease("scarabFever", "Scarab fever", 16, 0, 3, "Firebloom draught",
    { abilities: { str: -2, dex: -2, int: -2, min: 3 } }),
  lockjaw: disease("lockjaw", "Lockjaw", 12, 0, 3, "Steelbloom draught",
    { abilities: { con: -2, min: 3 }, maxHealthFollowsCon: true })
});

const norm = s => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");

export function diseaseByName(name) {
  const n = norm(name);
  if (!n) return null;
  return Object.values(DISEASES).find(d => norm(d.name) === n || norm(d.key) === n) ?? null;
}

/** D12 §4: remedy name -> disease key. */
export const REMEDIES = Object.freeze({
  "Silverleaf poultice": "rotFever",
  "Earthroot tea": "bloodyFlux",
  "Mageroyal salve": "mange",
  "Steelbloom draught": "lockjaw",
  "Liferoot bitters": "marshFever",
  "Grave moss tincture": "carrionPalsy",
  "Briarthorn steam": "blacklung",
  "Firebloom draught": "scarabFever",
  "Stranglekelp purge": "dredgeSickness"
});

export function remedyFor(diseaseKey) {
  return Object.entries(REMEDIES).find(([, k]) => k === diseaseKey)?.[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Reading 08 §13's Carried cell                                       */
/* ------------------------------------------------------------------ */

const CONDITION_IDS = Object.freeze([
  "slowed", "blinded", "numbed", "frightened", "entangled", "silenced",
  "charmed", "deafened", "stunned", "prone"
]);

function empty(extra = {}) {
  return {
    carried: true, damage: 0, fatigue: 0, statuses: [], value: 0,
    firstTestBane: null, healingFactor: null, beats: ["turn", "hour"],
    reason: null, ...extra
  };
}

/**
 * Reads a poison's 08 *Carried* cell (D12 §2's *Carried as* words) into a
 * descriptor. Anything it cannot read is `{carried: true, reason: "unread"}`:
 * never silently a no-op.
 */
export function readCarried(text) {
  const raw = String(text ?? "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (!raw) return { ...empty(), reason: "unread" };
  if (/^(not carried|none|[-–—]+)\b/i.test(raw) || /^[-–—]+$/.test(raw)) {
    return { ...empty({ beats: [] }), carried: false };
  }
  const d = empty();
  let read = false;

  const bane = /\bbane on\b[^.;]*?\b(attack|casting) tests?\b/i.exec(raw);
  if (bane) { d.firstTestBane = bane[1].toLowerCase(); read = true; }

  if (/\bhalve(?:s|d)?\b.*\bhealing\b/i.test(raw)) { d.healingFactor = 0.5; read = true; }

  const pois = /\bpoisoned\s+(\d+)/i.exec(raw);
  if (pois) { d.value = Number(pois[1]); d.statuses.push("poisoned"); read = true; }

  for (const id of CONDITION_IDS) {
    if (new RegExp(`\\b${id}\\b`, "i").test(raw)) { d.statuses.push(id); read = true; }
  }

  const fat = /\b(\d+)\s+fatigue\b/i.exec(raw);
  if (fat) { d.fatigue = Number(fat[1]); read = true; }

  const dmg = /\b(\d+)\s+(?:[a-z]+\s+)?damage\b/i.exec(raw);
  if (dmg && !/\+\s*\d+\s+damage/i.test(raw)) { d.damage = Number(dmg[1]); read = true; }

  if (!read) return { ...empty(), reason: "unread" };

  const hourOnly = /\bhour(?:ly)? only\b|\bhourly\b|\bby the hour\b|\b(?:once )?an hour\b(?!.*\bturn\b)/i.test(raw);
  const fatigueAlone = d.fatigue > 0 && !d.damage && !d.statuses.length && !d.firstTestBane;
  if (hourOnly || fatigueAlone) d.beats = ["hour"];
  else if (d.healingFactor && !d.statuses.length && !d.damage && !d.fatigue && !d.firstTestBane) d.beats = [];
  else if (d.firstTestBane && !d.statuses.length && !d.damage && !d.fatigue && !/\bhour\b/i.test(raw)) d.beats = ["turn"];
  return d;
}

/* ------------------------------------------------------------------ */
/* The carrier                                                         */
/* ------------------------------------------------------------------ */

const isNum = v => typeof v === "number" && Number.isFinite(v);
const isTime = v => v === null || isNum(v);

/**
 * Cleans a carrier flag, or a PARTIAL update of one, keeping only the keys it
 * was handed and never rebuilding an object (CLAUDE.md §15, recursive). A key
 * that fails its check is dropped, not defaulted. Dotted keys pass through when
 * their head is a known key.
 */
export function cleanAffliction(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  const has = k => Object.hasOwn(raw, k);
  const str = (o, k, dst) => { if (Object.hasOwn(o, k) && typeof o[k] === "string") dst[k] = o[k]; };

  if (has("kind") && AFFLICTION_KINDS.includes(raw.kind)) out.kind = raw.kind;
  str(raw, "key", out); str(raw, "name", out); str(raw, "resilience", out);
  if (has("dc") && isNum(raw.dc)) out.dc = Math.trunc(raw.dc);

  if (has("source") && raw.source && typeof raw.source === "object") {
    out.source = {};
    str(raw.source, "uuid", out.source); str(raw.source, "name", out.source);
  }

  if (has("repeat") && raw.repeat && typeof raw.repeat === "object") {
    const r = raw.repeat, o = {};
    for (const k of ["carried", "maxHealthFollowsCon"]) {
      if (Object.hasOwn(r, k) && typeof r[k] === "boolean") o[k] = r[k];
    }
    for (const k of ["damage", "fatigue", "value", "damageRating"]) {
      if (Object.hasOwn(r, k) && isNum(r[k])) o[k] = r[k];
    }
    if (Object.hasOwn(r, "statuses") && Array.isArray(r.statuses)) {
      o.statuses = r.statuses.filter(s => typeof s === "string");
    }
    if (Object.hasOwn(r, "beats") && Array.isArray(r.beats)) o.beats = r.beats.filter(b => BEATS.includes(b));
    if (Object.hasOwn(r, "firstTestBane") && (r.firstTestBane === null || ["attack", "casting"].includes(r.firstTestBane))) {
      o.firstTestBane = r.firstTestBane;
    }
    if (Object.hasOwn(r, "healingFactor") && (r.healingFactor === null || isNum(r.healingFactor))) {
      o.healingFactor = r.healingFactor;
    }
    if (Object.hasOwn(r, "reason") && (r.reason === null || typeof r.reason === "string")) o.reason = r.reason;
    if (Object.hasOwn(r, "banes") && Array.isArray(r.banes)) o.banes = r.banes.filter(b => b && typeof b.test === "string").map(b => ({ test: b.test }));
    if (Object.hasOwn(r, "abilities") && r.abilities && typeof r.abilities === "object") {
      o.abilities = {};
      for (const [k, v] of Object.entries(r.abilities)) {
        if ((ABILITY_KEYS.includes(k) || k === "min") && isNum(v)) o.abilities[k] = v;
      }
    }
    if (Object.hasOwn(r, "weekly") && (r.weekly === null || (r.weekly && typeof r.weekly === "object"))) {
      if (r.weekly === null) o.weekly = null;
      else {
        o.weekly = {};
        str(r.weekly, "resilience", o.weekly);
        if (Object.hasOwn(r.weekly, "dc") && isNum(r.weekly.dc)) o.weekly.dc = r.weekly.dc;
      }
    }
    out.repeat = o;
  }

  if (has("clock") && raw.clock && typeof raw.clock === "object") {
    out.clock = {};
    if (Object.hasOwn(raw.clock, "mode") && ["fight", "world"].includes(raw.clock.mode)) out.clock.mode = raw.clock.mode;
    if (Object.hasOwn(raw.clock, "nextAt") && isTime(raw.clock.nextAt)) out.clock.nextAt = raw.clock.nextAt;
    if (Object.hasOwn(raw.clock, "baneTurn") && (raw.clock.baneTurn === null || typeof raw.clock.baneTurn === "string")) out.clock.baneTurn = raw.clock.baneTurn;
  }

  if (has("disease") && raw.disease && typeof raw.disease === "object") {
    const d = raw.disease;
    out.disease = {};
    if (Object.hasOwn(d, "stage") && (DISEASE_STAGES.includes(d.stage))) out.disease.stage = d.stage;
    for (const k of ["onsetAt", "recoverAt", "triedAt", "weeklyAt", "weeklyPrompt"]) {
      if (Object.hasOwn(d, k) && isTime(d[k])) out.disease[k] = d[k];
    }
  }

  // A DOTTED key is cleaned by the same rules: it is nested, run through this function, and
  // kept only where the value survives at its path (a wrong type or an unknown leaf is dropped).
  const heads = new Set(["kind", "key", "name", "dc", "resilience", "source", "repeat", "clock", "disease"]);
  for (const k of Object.keys(raw)) {
    if (!k.includes(".") || !heads.has(k.split(".")[0])) continue;
    const path = k.split(".");
    if (path.some(part => !part || part === "__proto__" || part === "constructor" || part === "prototype")) continue;
    const nested = {};
    let at = nested;
    for (const part of path.slice(0, -1)) { at[part] = {}; at = at[part]; }
    at[path.at(-1)] = raw[k];
    const kept = cleanAffliction(nested);
    let found = kept, ok = true;
    for (const part of path) {
      if (found && typeof found === "object" && Object.hasOwn(found, part)) found = found[part];
      else { ok = false; break; }
    }
    if (ok) out[k] = found;
  }
  return out;
}

const cleanSource = s => ({ uuid: s?.uuid ?? null, name: s?.name ?? "" });

/**
 * A whole carrier for a poison. `carried` is `readCarried`'s descriptor or the
 * Carried cell's text. A poison that leaves nothing on the target (R2) returns
 * null: it is never carried.
 */
export function makePoison({ name, key, dc, resilience, carried, source, now, inFight = false }) {
  const repeat = typeof carried === "string" ? readCarried(carried) : carried;
  if (!repeat || repeat.carried === false) return null;
  return {
    kind: "poison",
    key: key ?? norm(name),
    name,
    dc: dc ?? null,
    resilience: resilience ?? null,
    source: cleanSource(source),
    repeat: { ...repeat },
    clock: { mode: inFight ? "fight" : "world", nextAt: now + HOUR }
  };
}

/** A whole carrier for a disease at its onset (or already carried, at onset 0). */
export function makeDisease(key, { source, now }) {
  const d = DISEASES[key];
  if (!d) throw new Error(`Unknown disease ${key}`);
  const instant = d.onset === 0;
  return {
    kind: "disease",
    key,
    name: d.name,
    dc: d.dc,
    resilience: "body",
    source: cleanSource(source),
    repeat: structuredClone(d.carried),
    clock: { mode: "world", nextAt: null },
    disease: {
      stage: instant ? "carried" : "onset",
      onsetAt: instant ? null : now + d.onset,
      recoverAt: null,
      triedAt: null,
      weeklyAt: instant && d.carried.weekly ? now + WEEK : null
    }
  };
}

/* ------------------------------------------------------------------ */
/* The clocks                                                          */
/* ------------------------------------------------------------------ */

function hasBeat(repeat, beat) { return Array.isArray(repeat?.beats) && repeat.beats.includes(beat); }
/** A poison whose only beat is the hour: the fight does not stop it, and does not move its clock. */
export function hourOnly(repeat) {
  return Array.isArray(repeat?.beats) && repeat.beats.length === 1 && repeat.beats[0] === "hour";
}
function relays(repeat) { return Boolean(repeat?.statuses?.length); }

/**
 * What is due at `now`. A poison in world mode lands ONE tick event carrying the
 * COUNT of elapsed hours (R4, uncapped) with `damage` and `fatigue` as TOTALS
 * over that count. In a fight the world clock does nothing; the turn beat does.
 * Disease stages (onset, recovery) and the weekly Test are dated, so they fire
 * in a fight too. `weekly` is not advanced here: `weeklyOutcome` does that, and
 * the writer must not prompt twice for one pending Test.
 * Returns `{events, patch, ended}`.
 */
export function afflictionDue(aff, { now, inFight = false }) {
  const events = [];
  const patch = {};
  let ended = false;

  if (aff.kind === "poison") {
    const next = aff.clock?.nextAt;
    // An hour-only beat (Rot-of-the-marsh: *1 Fatigue an hour, even in a fight*, 08) keeps the
    // world's hours in a fight; a poison that also beats by the turn waits for the fight to end.
    const worldClock = hourOnly(aff.repeat) || (!inFight && aff.clock?.mode !== "fight");
    if (worldClock && isNum(next) && now >= next && hasBeat(aff.repeat, "hour")) {
      const count = Math.floor((now - next) / HOUR) + 1;
      const damage = (aff.repeat.damage ?? 0) * count;
      const fatigue = (aff.repeat.fatigue ?? 0) * count;
      if (damage || fatigue) events.push({ type: "tick", count, damage, fatigue });
      if (relays(aff.repeat)) events.push({ type: "relay" });
      patch["clock.nextAt"] = next + count * HOUR;
    }
    return { events, patch, ended };
  }

  if (aff.kind === "disease" && aff.disease) {
    const d = aff.disease;
    let stage = d.stage;
    if (stage === "onset" && isNum(d.onsetAt) && now >= d.onsetAt) {
      events.push({ type: "stage", from: "onset", to: "carried" });
      patch["disease.stage"] = "carried";
      patch["disease.onsetAt"] = null;
      if (DISEASES[aff.key]?.carried.weekly) patch["disease.weeklyAt"] = now + WEEK;
      stage = "carried";
    } else if (stage === "recovering" && isNum(d.recoverAt) && now >= d.recoverAt) {
      events.push({ type: "stage", from: "recovering", to: "ended" });
      ended = true;
      return { events, patch, ended };
    }
    if ((stage === "carried" || stage === "recovering") && !patch["disease.weeklyAt"]
      && DISEASES[aff.key]?.carried.weekly && isNum(d.weeklyAt) && now >= d.weeklyAt) {
      events.push({ type: "weekly" });
    }
  }
  return { events, patch, ended };
}

/** The events for one start-of-turn beat in a fight. Hour-only repeats do nothing here. */
export function turnBeat(aff) {
  if (aff.kind !== "poison" || !hasBeat(aff.repeat, "turn")) return [];
  const events = [];
  const damage = aff.repeat.damage ?? 0;
  if (damage) events.push({ type: "tick", count: 1, damage, fatigue: 0 });
  if (relays(aff.repeat)) events.push({ type: "relay" });
  return events;
}

export function enterFight(aff = null) {
  return hourOnly(aff?.repeat) ? {} : { "clock.mode": "fight" };
}

export function resumeWorldClock(aff, now) {
  // An hour-only beat never left the world's clock: leaving a fight keeps its next beat.
  if (hourOnly(aff?.repeat)) return {};
  return { "clock.mode": "world", "clock.nextAt": now + HOUR };
}

/* ------------------------------------------------------------------ */
/* Medicine                                                            */
/* ------------------------------------------------------------------ */

/** null, or a reason KEY why a Medicine Test may not be made. R5: once in each 24 hours. */
export function medicineRefusal({ stage, healerCarries = false, triedAt = null, now, inFight = false }) {
  if (inFight) return "inFight";
  if (stage === "onset") return "onset";
  if (stage === "recovering") return "recovering";
  if (healerCarries) return "healerCarries";
  if (isNum(triedAt) && now - triedAt < DAY) return "triedToday";
  return null;
}

export function medicineNextAt(triedAt) {
  return isNum(triedAt) ? triedAt + DAY : null;
}

export function medicineOutcome(aff, { success, now }) {
  const patch = { "disease.triedAt": now };
  if (success) {
    patch["disease.stage"] = "recovering";
    patch["disease.recoverAt"] = now + (DISEASES[aff.key]?.recovery ?? DAY);
  }
  return patch;
}

/** Marsh fever's weekly Test: a failure while recovering sends it back to carried. */
export function weeklyOutcome(aff, { success, now }) {
  const patch = { "disease.weeklyAt": now + WEEK };
  if (!success && aff.disease?.stage === "recovering") {
    patch["disease.stage"] = "carried";
    patch["disease.recoverAt"] = null;
  }
  return patch;
}

/* ------------------------------------------------------------------ */
/* Cures (D12 §5, 07's own words)                                      */
/* ------------------------------------------------------------------ */

function cure(name, o) {
  return Object.freeze({
    name, pick: 1, kinds: [], bleeding: null, heal: null, damage: null, area: null,
    willing: false, casterFatigue: 0, criticalInjury: 0, ...o
  });
}

const PD = ["poison", "disease"];

/** The twelve spells that end a poison or a disease, one row each, held to 07 by the census. */
export const CURE_SPELLS = Object.freeze({
  "Cure Poison": cure("Cure Poison", { kinds: PD, bleeding: { reduce: 2 } }),
  "Cleanse": cure("Cleanse", {
    kinds: ["disease", "poison", "bleeding"], bleeding: { reduce: 2 },
    ranks: { 2: { pick: 2 } }, sl3: { condition: 1 }
  }),
  "Purging Flame": cure("Purging Flame", { kinds: PD, damage: { amount: 2, type: "fire" } }),
  "Nature's Cure": cure("Nature's Cure", { kinds: [...PD, "condition"], bleeding: { reduce: 4 } }),
  "Cure Blight": cure("Cure Blight", { pick: "all", kinds: PD, bleeding: { toZero: true } }),
  "Moonwell": cure("Moonwell", {
    kinds: PD, heal: 4, area: "startOfTurn", drink: { heal: 8, condition: 1 }
  }),
  "Absolution": cure("Absolution", { pick: "all", kinds: ["condition", ...PD], heal: 8 }),
  "Scour": cure("Scour", { pick: "all", kinds: PD, area: "cast" }),
  "Restoration": cure("Restoration", { pick: "all", kinds: PD, area: "cast" }),
  "Haven": cure("Haven", { pick: "all", kinds: PD, area: "longRest" }),
  "Deliverance": cure("Deliverance", {
    pick: "all", kinds: PD, area: "cast", willing: true, casterFatigue: 1
  }),
  "Sanctification": cure("Sanctification", {
    pick: "all", kinds: PD, area: "longRest", criticalInjury: 1
  })
});

/**
 * What a cure may end. `afflictions` are plain `{id, kind, key, ...}` objects
 * (a condition passes `kind: "condition"`). Returns `{ends}` when the choice is
 * forced, `{choose: {pick, options}}` when it is not, `{refusal}` for nothing.
 * A remedy is `{pick: 1, kinds: ["disease"], only: diseaseKey}`.
 */
export function cureJudgement(afflictions, spec, { rank = 1 } = {}) {
  let pick = spec.pick ?? 1;
  if (spec.ranks && pick !== "all") {
    const best = Object.keys(spec.ranks).map(Number).filter(r => r <= rank).sort((a, b) => b - a)[0];
    if (best != null && spec.ranks[best].pick != null) pick = spec.ranks[best].pick;
  }
  const candidates = (afflictions ?? []).filter(a =>
    (spec.kinds ?? []).includes(a.kind) && (!spec.only || a.key === spec.only));
  if (!candidates.length) return { refusal: "nothingToCure" };
  const ids = candidates.map(a => a.id);
  if (pick === "all" || candidates.length <= pick) return { ends: ids };
  return { choose: { pick, options: ids } };
}

/* ------------------------------------------------------------------ */
/* The carrier Active Effect (Phase 5a)                                */
/* ------------------------------------------------------------------ */

const CARRIER_ICON = Object.freeze({ poison: "icons/svg/poison.svg", disease: "icons/svg/biohazard.svg" });

/** Whether a disease's penalties apply: nothing at onset, everything once carried. */
export function penaltiesApply(aff) {
  return aff?.kind === "disease" && (aff.disease?.stage === "carried" || aff.disease?.stage === "recovering");
}

/**
 * The ability-score changes a disease lays, in the shape the per-creature
 * builders use (`subtract` then an `upgrade` floor, both in the `initial`
 * phase because a score is a stored base, CLAUDE.md section 15). The two
 * diseases the creature modules already built with a matching shape reuse those
 * builders; anything else takes the generic one, which writes the same shape.
 */
export function abilityChangesFor(aff, abilities = {}) {
  const spec = aff?.repeat?.abilities ?? {};
  const keys = ABILITY_KEYS.filter(k => Number.isFinite(spec[k]) && spec[k] !== 0);
  if (!keys.length) return [];
  const allMinus2 = keys.every(k => spec[k] === -2);
  if (aff.key === "dredgeSickness" && keys.length === 6 && allMinus2) return dredgeSicknessChanges(abilities);
  if (aff.key === "scarabFever" && keys.join() === "str,dex,int" && allMinus2) return plagueCloudChanges(abilities);
  const floor = Number.isFinite(spec.min) ? spec.min : 3;
  return keys.flatMap(key => {
    if (!Number.isFinite(abilities?.[key]?.value)) return [];
    const path = `system.abilities.${key}.value`;
    return [
      { key: path, type: "subtract", value: String(-spec[key]), phase: "initial", priority: 20 },
      { key: path, type: "upgrade", value: String(Math.min(abilities[key].value, floor)), phase: "initial", priority: 30 }
    ];
  });
}

/** Every change a carried disease lays (D12 section 3): scores, and the Damage Rating. */
export function carrierChanges(aff, { abilities = {}, type = "character" } = {}) {
  if (!penaltiesApply(aff)) return [];
  const out = abilityChangesFor(aff, abilities);
  if ((aff.repeat?.damageRating ?? 0) < 0) out.push(...maggotSlimeChanges(type));
  return out;
}

/** The statuses a carrier holds now. */
export function carrierStatuses(aff) {
  if (aff?.kind === "poison") return [...new Set(aff.repeat?.statuses ?? [])];
  return penaltiesApply(aff) ? ["diseased"] : [];
}

/** The carrier's Poisoned value (A1), or 0 when it holds no Poisoned. */
export function carrierPoisonedValue(aff) {
  if (aff?.kind !== "poison" || !(aff.repeat?.statuses ?? []).includes("poisoned")) return 0;
  return Math.max(1, Math.trunc(aff.repeat?.value) || 1);
}

/**
 * The Active Effect a carried affliction is: no duration (it never expires), the
 * affliction flag, `harmful`, and `poison` / `disease` so `rules/nullifier.mjs`
 * classifies it. A poison that holds Poisoned also carries `value` and A1's shed
 * DC (`rules/escapes.mjs#SHED_DC_FLAG`) so the end-of-turn shed Test keeps working.
 */
export function carrierEffectData(aff, { abilities = {}, type = "character", origin = null } = {}) {
  const poisoned = carrierPoisonedValue(aff);
  const mark = {
    harmful: true,
    [aff.kind]: true,
    [AFFLICTION_FLAG]: structuredClone(aff),
    ...(poisoned ? {
      value: poisoned,
      ...(aff.dc != null ? { [SHED_DC_FLAG]: { dc: aff.dc, source: aff.name } } : {})
    } : {})
  };
  return {
    name: aff.name,
    img: CARRIER_ICON[aff.kind],
    origin: origin ?? aff.source?.uuid ?? null,
    disabled: false,
    statuses: carrierStatuses(aff),
    system: { changes: carrierChanges(aff, { abilities, type }) },
    flags: { "azeroth-rpg": mark }
  };
}

/** The Active Effect update that re-derives statuses and changes when a stage moves. */
export function carrierRefresh(aff, opts = {}) {
  const d = carrierEffectData(aff, opts);
  return {
    statuses: d.statuses,
    "system.changes": d.system.changes,
    ...(carrierPoisonedValue(aff) ? { "flags.azeroth-rpg.value": d.flags["azeroth-rpg"].value } : {})
  };
}

/**
 * Shedding a Poisoned stack from a carrier (A1's Test). The carrier is never
 * deleted by a shed: at 0 it drops the Poisoned status and keeps its flag, and
 * the next beat re-lays it (R1).
 */
export function shedPatch(aff, value) {
  if (value > 0) return { "flags.azeroth-rpg.value": value };
  return { statuses: carrierStatuses(aff).filter(s => s !== "poisoned"), "flags.azeroth-rpg.value": 0 };
}

/* ------------------------------------------------------------------ */
/* Refusals                                                            */
/* ------------------------------------------------------------------ */

/**
 * null, or a reason KEY why an affliction may not be laid. `carried` is the
 * afflictions already on the creature, as `{kind, key}` rows.
 */
export function afflictRefusal({ kind, key, immunities = [], carried = [] }) {
  const status = kind === "poison" ? "poisoned" : "diseased";
  if ((immunities ?? []).includes(status)) return "immune";
  if ((carried ?? []).some(c => c.kind === kind && c.key === key)) return "alreadyCarried";
  return null;
}

/* ------------------------------------------------------------------ */
/* What a carrier does to the rolls and the pools                      */
/* ------------------------------------------------------------------ */

/** Fatigue that does not clear while a disease is carried (D12 section 3). */
export function fatigueFloorOf(affs = []) {
  let floor = 0;
  for (const a of affs) if (penaltiesApply(a)) floor = Math.max(floor, a.repeat?.fatigue ?? 0);
  return floor;
}

/** The healing multiplier carried poisons lay (Wound poison: 0.5), or 1. */
export function healingFactorOf(affs = []) {
  let f = 1;
  for (const a of affs) {
    if (a?.kind === "poison" && isNum(a.repeat?.healingFactor)) f = Math.min(f, a.repeat.healingFactor);
  }
  return f;
}

/** A key naming the one round of a fight, for a once-a-turn mark. */
export const turnKeyOf = fight => (fight ? `${fight.id}:${fight.round}` : null);

/**
 * The Banes carried afflictions lay on one Test. `rows` are `{id, aff}`. A
 * disease Banes the Tests it names once carried; a poison's first-Attack or
 * first-Casting Bane lands on the first such Test of the turn in a fight
 * (`turnKey` not yet marked on the carrier) and on every one out of a fight
 * (`turnKey` null). Returns `{banes, names, marks}`: `marks` are the carrier ids
 * whose once-a-turn mark a roll of this kind spends.
 */
export function afflictionBanes(rows = [], { kind, skill = null, resilience = null, ability = null, turnKey = null, abilityOf = {} } = {}) {
  let banes = 0;
  const names = [], marks = [];
  // The ability this Test reads: its skill's, or a bare ability Test's own
  // (05 §1, D-810's F4), so *a Bane on Strength Tests* reaches both.
  const reads = skill ? (abilityOf[skill] ?? null) : ability;
  for (const { id, aff } of rows) {
    if (!aff) continue;
    if (penaltiesApply(aff)) {
      for (const b of aff.repeat?.banes ?? []) {
        const hit = (kind === "skill" && reads && b.test === reads)
          || (kind === "resilience" && resilience && b.test === `resilience:${resilience}`);
        if (hit) { banes += 1; names.push(aff.name); }
      }
    }
    if (aff.kind === "poison" && aff.repeat?.firstTestBane === kind && (kind === "attack" || kind === "casting")) {
      if (turnKey === null || aff.clock?.baneTurn !== turnKey) { banes += 1; names.push(aff.name); marks.push(id); }
    }
  }
  return { banes, names: [...new Set(names)], marks };
}

/* ------------------------------------------------------------------ */
/* Folding events into one card per carrier per jump (R4)              */
/* ------------------------------------------------------------------ */

/** Sum a list of tick events into one `{count, damage, fatigue}` (or null). */
export function foldTicks(events = []) {
  const ticks = events.filter(e => e.type === "tick");
  if (!ticks.length) return null;
  return {
    count: ticks.reduce((n, e) => n + (e.count ?? 0), 0),
    damage: ticks.reduce((n, e) => n + (e.damage ?? 0), 0),
    fatigue: ticks.reduce((n, e) => n + (e.fatigue ?? 0), 0)
  };
}

/** The Fatigue a creature ends on after a gain, clamped to the track. */
export function fatigueAfter(current, gain, max = 6) {
  return Math.min(max, Math.max(0, (Number(current) || 0) + (Number(gain) || 0)));
}

/** Whether a weekly prompt is already outstanding (a second jump must not prompt again). */
export function weeklyPrompted(aff, now = null) {
  const at = aff?.disease?.weeklyPrompt;
  if (!isNum(at)) return false;
  // A prompt nobody answered stops counting after a day of world time, so the Test is asked again.
  return !(isNum(now) && now - at >= DAY);
}

/** The patch that records a weekly prompt, and the one that clears it on resolution. */
export const weeklyPromptPatch = now => ({ "disease.weeklyPrompt": now });
export const weeklyClearedPatch = () => ({ "disease.weeklyPrompt": null });

/** A slug for a poison's name, the same way `makePoison` keys it. */
export const poisonKeyOf = name => norm(name);

/** The disease catalogue as `{key, name, dc}` rows, book order. */
export function diseaseCatalogue() {
  return Object.values(DISEASES).map(d => ({ key: d.key, name: d.name, dc: d.dc }));
}

/**
 * A carrier with a DOTTED patch laid over it (`"disease.stage": "carried"`), as a
 * new object; the stored flag is written key by key and this is what the write
 * will read back as, so the statuses and changes can be re-derived in the same update.
 */
export function applyAfflictionPatch(aff, patch = {}) {
  const out = structuredClone(aff);
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.split(".");
    let at = out;
    for (const k of keys.slice(0, -1)) {
      if (!at[k] || typeof at[k] !== "object") at[k] = {};
      at = at[k];
    }
    at[keys.at(-1)] = value;
  }
  return out;
}

/**
 * The descriptor a creature's bare venom carries (D12 section 2): Poisoned N, laid
 * again at each beat, at the venom's own DC. 14's thirteen venoms read this way.
 */
export function bareVenom(value = 1) {
  return {
    carried: true, damage: 0, fatigue: 0, statuses: ["poisoned"], value: Math.max(1, Math.trunc(value) || 1),
    firstTestBane: null, healingFactor: null, beats: ["turn", "hour"], reason: null
  };
}
