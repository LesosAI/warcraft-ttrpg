/**
 * The forty-nine regions, and who holds them (D-680). Pure, no Foundry
 * imports (CLAUDE.md §3).
 *
 * `regions.json` is 12A and 12B rendered by `tools/parse-book/setting.mjs` —
 * Threat, Weight class, Taint, Held by and Ways in per D-490, plus the two
 * hundred and seventy-two settlements and their six Classes per D-491. The
 * chapters are the source and `regions.test.mjs` re-reads them, so nothing
 * here may be edited by hand.
 *
 * **The book's `control` is only where a region STARTS.** Who holds it at the
 * table is live world state: the GM flips a region and every client re-renders
 * off the setting. So this module keeps the two apart — `REGIONS` is what the
 * book says and never changes, and a state object carries only the GM's
 * overrides, which is what lets a re-parse move a default that has never been
 * touched.
 *
 * Three control states, by the lead's call. 12 §2's own vocabulary is wider —
 * *held by a body, contested between two, or held by nobody*, and the chapters
 * add `Divided` — so eight-plus regions that read **Contested** or **Divided**
 * on the page start `neutral` here. **Nothing is lost**: `heldBy.text` carries
 * the chapter's sentence verbatim and the detail panel prints it.
 */

import data from "./regions.json" with { type: "json" };
import { AZEROTH } from "../config.mjs";

/** Every region, in book order — Eastern Kingdoms then Kalimdor. */
export const REGIONS = Object.freeze(data.regions.map(Object.freeze));

/** The three control states. A region is one of these and nothing else. */
export const CONTROLS = Object.freeze(["alliance", "horde", "neutral"]);

/** The two continents, in book order. */
export const CONTINENTS = Object.freeze(["eastern-kingdoms", "kalimdor"]);

/** How many changes of hand the log keeps before the oldest fall off. */
export const HISTORY_LIMIT = 200;

/**
 * The parts of an entry the GM can keep from a player, one region at a time
 * (the lead, 2026-09-08). `control` is separate from `heldBy` on purpose: the
 * chapter's sentence about who runs a province and the live faction state are
 * two different disclosures, and a table may want the geography without the
 * politics.
 */
export const FIELDS = Object.freeze(["threat", "weightClass", "taint", "heldBy", "waysIn", "control"]);

const BY_KEY = new Map(REGIONS.map(r => [r.key, r]));

/** A region by key, or null. */
export function regionOf(key) {
  return BY_KEY.get(key) ?? null;
}

/** The regions of one continent, in book order. */
export function regionsOn(continent) {
  return REGIONS.filter(r => r.continent === continent);
}

/**
 * The regions a road runs to, as region objects. D-490 makes this reciprocal
 * and `setting.mjs` throws on a one-way door, so this is symmetric by
 * construction.
 */
export function neighboursOf(key) {
  const region = regionOf(key);
  if (!region) return [];
  return region.waysIn.map(w => regionOf(w.key)).filter(Boolean);
}

/* -------------------------------------------------------------- the state */

/** A world with nothing yet decided: the book's own picture, all of it shown. */
export function emptyState() {
  return {
    version: 2,
    control: {},
    party: null,
    notes: {},
    history: [],
    // What a player sees. Everything, until the GM says otherwise - the book
    // is published to the table, so hiding is the exception. A campaign that
    // wants the opposite flips `hideByDefault` once.
    hideByDefault: false,
    reveal: { regions: {}, fields: {}, settlements: {} },
    links: { regions: {}, settlements: {} }
  };
}

/**
 * Fill in whatever a stored state is missing. Read every state through this:
 * a world saved before a field existed must not throw, and a setting written
 * by an older version is exactly that.
 */
export function cleanState(stored) {
  const base = emptyState();
  if (!stored || typeof stored !== "object") return base;
  const control = {};
  for (const [key, value] of Object.entries(stored.control ?? {})) {
    if (BY_KEY.has(key) && CONTROLS.includes(value)) control[key] = value;
  }
  const notes = {};
  for (const [key, value] of Object.entries(stored.notes ?? {})) {
    if (BY_KEY.has(key) && typeof value === "string" && value.trim()) notes[key] = value;
  }
  // Only keys naming a real region survive, so a renamed region cannot leave
  // a rule behind that nothing can reach to undo.
  const booleans = (source, valid) => {
    const out = {};
    for (const [key, value] of Object.entries(source ?? {})) {
      if (!BY_KEY.has(key)) continue;
      const inner = {};
      for (const [name, on] of Object.entries(value ?? {})) {
        if (typeof on === "boolean" && (!valid || valid(key, name))) inner[name] = on;
      }
      if (Object.keys(inner).length) out[key] = inner;
    }
    return out;
  };

  const regionsShown = {};
  for (const [key, value] of Object.entries(stored.reveal?.regions ?? {})) {
    if (BY_KEY.has(key) && typeof value === "boolean") regionsShown[key] = value;
  }

  const links = { regions: {}, settlements: {} };
  for (const [key, value] of Object.entries(stored.links?.regions ?? {})) {
    if (!BY_KEY.has(key) || !value || typeof value !== "object") continue;
    const row = {};
    if (typeof value.scene === "string" && value.scene) row.scene = value.scene;
    if (typeof value.journal === "string" && value.journal) row.journal = value.journal;
    if (Object.keys(row).length) links.regions[key] = row;
  }
  for (const [key, value] of Object.entries(stored.links?.settlements ?? {})) {
    if (!BY_KEY.has(key) || !value || typeof value !== "object") continue;
    const names = {};
    for (const [name, row] of Object.entries(value)) {
      if (!row || typeof row !== "object") continue;
      const clean = {};
      if (typeof row.scene === "string" && row.scene) clean.scene = row.scene;
      if (typeof row.journal === "string" && row.journal) clean.journal = row.journal;
      if (Array.isArray(row.pin) && row.pin.length === 2 && row.pin.every(n => typeof n === "number")) {
        clean.pin = [row.pin[0], row.pin[1]];
      }
      if (Object.keys(clean).length) names[name] = clean;
    }
    if (Object.keys(names).length) links.settlements[key] = names;
  }

  return {
    version: base.version,
    control,
    party: BY_KEY.has(stored.party) ? stored.party : null,
    notes,
    history: Array.isArray(stored.history) ? stored.history.slice(-HISTORY_LIMIT) : [],
    hideByDefault: stored.hideByDefault === true,
    reveal: {
      regions: regionsShown,
      fields: booleans(stored.reveal?.fields, (key, name) => FIELDS.includes(name)),
      settlements: booleans(stored.reveal?.settlements)
    },
    links
  };
}

/* ----------------------------------------------------- what a player sees */

/** Whether a region appears at all. */
export function isRegionVisible(state, key) {
  const set = state?.reveal?.regions?.[key];
  return typeof set === "boolean" ? set : !state?.hideByDefault;
}

/** Whether one field of a region's entry is shown. A hidden region shows none. */
export function isFieldVisible(state, key, field) {
  if (!isRegionVisible(state, key)) return false;
  const set = state?.reveal?.fields?.[key]?.[field];
  return typeof set === "boolean" ? set : !state?.hideByDefault;
}

/**
 * Whether one settlement is shown.
 *
 * **HIDDEN UNTIL REVEALED, always** (the lead, 2026-09-08) — unlike a region
 * or a field, which follow `hideByDefault`. 272 settlements handed to a party
 * on day one is the campaign's whole geography given away, and a settlement is
 * the thing a party is meant to FIND. The GM opens each one as it is learned.
 */
export function isSettlementVisible(state, key, name) {
  if (!isRegionVisible(state, key)) return false;
  return state?.reveal?.settlements?.[key]?.[name] === true;
}

/** Show or hide a whole region. Returns a NEW state. */
export function setRegionVisible(state, key, shown) {
  const next = cleanState(state);
  if (!BY_KEY.has(key)) return next;
  if (Boolean(shown) === !next.hideByDefault) delete next.reveal.regions[key];
  else next.reveal.regions[key] = Boolean(shown);
  return next;
}

/** Show or hide one field of one region. Returns a NEW state. */
export function setFieldVisible(state, key, field, shown) {
  const next = cleanState(state);
  if (!BY_KEY.has(key) || !FIELDS.includes(field)) return next;
  const row = next.reveal.fields[key] ?? {};
  if (Boolean(shown) === !next.hideByDefault) delete row[field];
  else row[field] = Boolean(shown);
  if (Object.keys(row).length) next.reveal.fields[key] = row;
  else delete next.reveal.fields[key];
  return next;
}

/**
 * Show or hide one settlement. Returns a NEW state.
 *
 * Hidden is the default, so only a REVEAL is stored; hiding one again removes
 * the entry rather than writing `false`.
 */
export function setSettlementVisible(state, key, name, shown) {
  const next = cleanState(state);
  if (!BY_KEY.has(key)) return next;
  const row = next.reveal.settlements[key] ?? {};
  if (shown) row[name] = true;
  else delete row[name];
  if (Object.keys(row).length) next.reveal.settlements[key] = row;
  else delete next.reveal.settlements[key];
  return next;
}

/** Reveal or hide every settlement of a region at once. Returns a NEW state. */
export function setAllSettlementsVisible(state, key, shown) {
  const region = regionOf(key);
  if (!region) return cleanState(state);
  let next = cleanState(state);
  for (const settlement of region.settlements) {
    next = setSettlementVisible(next, key, settlement.name, shown);
  }
  return next;
}

/** Flip whether an unconfigured region is shown or hidden. Returns a NEW state. */
export function setHideByDefault(state, hide) {
  const next = cleanState(state);
  next.hideByDefault = Boolean(hide);
  return next;
}

/** The regions a given reader may see, in book order. */
export function regionsVisibleTo(state, { isGM = false, continent = null } = {}) {
  const all = continent ? regionsOn(continent) : REGIONS;
  return isGM ? all : all.filter(r => isRegionVisible(state, r.key));
}

/* ------------------------------------------------------------- the links */

/** What a region opens: `{scene, journal}`, either absent. */
export function linkOf(state, key) {
  return state?.links?.regions?.[key] ?? {};
}

/** Attach or clear a region's Scene or Journal. Returns a NEW state. */
export function setLink(state, key, patch = {}) {
  const next = cleanState(state);
  if (!BY_KEY.has(key)) return next;
  const row = { ...next.links.regions[key] };
  for (const [field, value] of Object.entries(patch)) {
    if (value) row[field] = value;
    else delete row[field];
  }
  if (Object.keys(row).length) next.links.regions[key] = row;
  else delete next.links.regions[key];
  return next;
}

/** What a settlement carries: `{scene, journal, pin}`, any absent. */
export function settlementLink(state, key, name) {
  return state?.links?.settlements?.[key]?.[name] ?? {};
}

/**
 * Attach a Scene, a Journal or a pin to a settlement. Returns a NEW state.
 *
 * A settlement has NO PIN until one is placed (the lead, 2026-09-08): the
 * panel always lists every settlement the chapter gives, and the plate shows
 * only what the GM has chosen to mark. 272 pins would bury the art.
 */
export function setSettlementLink(state, key, name, patch = {}) {
  const next = cleanState(state);
  if (!BY_KEY.has(key)) return next;
  const forRegion = next.links.settlements[key] ?? {};
  const row = { ...forRegion[name] };
  for (const [field, value] of Object.entries(patch)) {
    if (value) row[field] = value;
    else delete row[field];
  }
  if (Object.keys(row).length) forRegion[name] = row;
  else delete forRegion[name];
  if (Object.keys(forRegion).length) next.links.settlements[key] = forRegion;
  else delete next.links.settlements[key];
  return next;
}

/**
 * Every settlement given a place on the plate, for the reader this state is
 * being read for.
 */
export function pinnedSettlements(state, { continent = null, isGM = false } = {}) {
  const out = [];
  for (const region of (continent ? regionsOn(continent) : REGIONS)) {
    if (!isGM && !isRegionVisible(state, region.key)) continue;
    const marks = state?.links?.settlements?.[region.key] ?? {};
    for (const settlement of region.settlements) {
      const mark = marks[settlement.name];
      if (!mark?.pin) continue;
      if (!isGM && !isSettlementVisible(state, region.key, settlement.name)) continue;
      out.push({
        key: region.key,
        region: region.name,
        name: settlement.name,
        class: settlement.class,
        pin: mark.pin,
        scene: mark.scene ?? null,
        journal: mark.journal ?? null
      });
    }
  }
  return out;
}

/** Who holds a region now — the GM's override, else the book's. */
export function controlOf(state, key) {
  const override = state?.control?.[key];
  if (CONTROLS.includes(override)) return override;
  return regionOf(key)?.control ?? "neutral";
}

/** True where the GM has moved a region off what the book says. */
export function isOverridden(state, key) {
  return CONTROLS.includes(state?.control?.[key]);
}

/**
 * Set who holds a region. Returns a NEW state; nothing is mutated.
 *
 * Setting a region back to what the book says DELETES the override rather than
 * storing it, so the setting stays small and a later re-parse that moves a
 * default reaches every region nobody has touched.
 */
export function setControl(state, key, control, { at = Date.now(), by = null } = {}) {
  const region = regionOf(key);
  if (!region) throw new Error(`No region "${key}"`);
  if (!CONTROLS.includes(control)) throw new Error(`"${control}" is not one of ${CONTROLS.join(", ")}`);

  const next = cleanState(state);
  const from = controlOf(next, key);
  if (from === control) return next;

  if (control === region.control) delete next.control[key];
  else next.control[key] = control;

  next.history = [...next.history, { key, name: region.name, from, to: control, at, by }].slice(-HISTORY_LIMIT);
  return next;
}

/** Where the company is standing, as a region, or null. */
export function partyRegion(state) {
  return regionOf(state?.party) ?? null;
}

/** Move the company. Returns a NEW state. */
export function setParty(state, key) {
  const next = cleanState(state);
  next.party = key === null ? null : (BY_KEY.has(key) ? key : next.party);
  return next;
}

/** The GM's note on a region, or "". */
export function noteOf(state, key) {
  return state?.notes?.[key] ?? "";
}

/** Write a note. An empty note is removed rather than stored. Returns a NEW state. */
export function setNote(state, key, text) {
  const next = cleanState(state);
  if (!BY_KEY.has(key)) return next;
  const flat = String(text ?? "").trim();
  if (flat) next.notes[key] = flat;
  else delete next.notes[key];
  return next;
}

/** How many regions each side holds, for the legend. */
export function tally(state) {
  const out = Object.fromEntries(CONTROLS.map(c => [c, 0]));
  for (const region of REGIONS) out[controlOf(state, region.key)]++;
  return out;
}

/* ------------------------------------------------------------- the ground */

/**
 * What standing here exposes you to. 12 §6's three grades are the three
 * regional occasions of config's EXPOSURE_OCCASIONS in order, and the comment
 * there says why the mapping has to happen out here: *"The three regional
 * grades name no track — the region does."*
 *
 * A region may carry more than one grade (Deadwind Pass is Grade 1 Undeath
 * across the pass and Grade 3 Fel inside Karazhan's grounds), so every grade
 * is returned and `worst` names the highest.
 */
export const GRADE_OCCASION = Object.freeze({ 1: "touched", 2: "tainted", 3: "saturated" });

export function exposureFor(key) {
  const region = regionOf(key);
  const grades = region?.taint?.grades ?? [];
  const rows = grades.map(g => {
    const occasion = GRADE_OCCASION[g.grade];
    return {
      grade: g.grade,
      track: g.track,
      where: g.where,
      occasion,
      dc: AZEROTH.EXPOSURE_OCCASIONS[occasion]?.dc ?? null
    };
  });
  const worst = rows.reduce((a, b) => (b.grade > (a?.grade ?? 0) ? b : a), null);
  return { grades: rows, worst };
}

/** The DC and track the party is standing in, or null on clean ground. */
export function partyExposure(state) {
  const region = partyRegion(state);
  if (!region) return null;
  const { worst } = exposureFor(region.key);
  return worst ? { region, ...worst } : null;
}
