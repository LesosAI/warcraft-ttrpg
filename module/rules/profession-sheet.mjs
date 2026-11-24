/**
 * **THE PROFESSION TAB'S VIEW MODEL** (D11 §12; D-1903 to D-1930, D-1935, D-1980).
 * Pure functions, no Foundry imports (CLAUDE.md §3): the character sheet hands
 * these plain data and draws what they answer. The game law is elsewhere and is
 * only read here: `professions.mjs` (the rungs, the skill lists, the picks),
 * `recipes.mjs` (what a craft takes and whether it may start), `crafting.mjs`
 * (the plan and the expected tests), `gathering.mjs` (Disenchant) and `xp.mjs`
 * (the Rank's price).
 *
 * Three rulings shape it (the approved mockup, `docs/design/mockups/
 * professions.html`):
 *  - nothing above the character's tier is drawn (D-1927): the recipes, the
 *    tier filter's options and the gathering nodes stop at the tier;
 *  - recipe groups start CLOSED, and a search or a filter opens what it
 *    matches (D-1927);
 *  - a refusal is a reason code beside a greyed control, never the grey alone
 *    (D-681); the sheet says it in words.
 */

import { PICK_TIERS, PICKS_PER_TIER, PROFESSION_TIERS, RUNGS, clampTier, picksAt, skillListsOf } from "./professions.mjs";
import { RANK_MAX, professionRankCost } from "./xp.mjs";
import {
  craftRefusals, forgeable, makeableCount, reagentsFor, recipeTier, shortfall, visibleRows
} from "./recipes.mjs";
import { craftPlan, expectedSteps } from "./crafting.mjs";
import { HARVEST, disenchantRefusal, harvestOn } from "./gathering.mjs";
import { resolveCraftSignature } from "./craft-signatures.mjs";
import { cutChoices } from "./craft-cuts.mjs";

/** The two views of the tab (D-1910), on a USER flag so a re-render keeps it (D11 §12). */
export const PROFESSION_VIEWS = Object.freeze(["overview", "crafting"]);

/** The user flag the view lives on. */
export const VIEW_FLAG = "professionView";

/** The user flag the open recipe groups live on: `{[profession]: [groupKey]}`. */
export const OPEN_FLAG = "professionOpen";

/** The user flag the biome the GM named lives on (D-1915). */
export const BIOME_FLAG = "professionBiome";

/** The view a stored value names, Overview by default. */
export function viewOf(stored) {
  return PROFESSION_VIEWS.includes(stored) ? stored : "overview";
}

/** `+3`, `−2`, `+0`: a signed number with a true minus sign, so a negative is never read off colour alone. */
export function signedText(value) {
  const n = Math.trunc(Number(value)) || 0;
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

/* -------------------------------------------- */
/*  Rungs, skills and picks (D-1905, D-1906)     */
/* -------------------------------------------- */

/**
 * The four rungs with what the character holds (D-1912): filled for each tier
 * reached, hollow for the rest. `held` is carried in words by the template, a
 * shape and a word, never colour alone (D11 §12).
 *
 * @returns {Array<{tier: number, key: string, minLevel: number, maxLevel: number, held: boolean}>}
 */
export function ladderRows(tier) {
  const t = clampTier(tier);
  return RUNGS.map(r => ({ tier: r.tier, key: r.key, minLevel: r.minLevel, maxLevel: r.maxLevel, held: r.tier <= t }));
}

/**
 * The Profession skills card (D-1906): a row a tier. Tier 1 is `fixed`; a
 * reached tier is `picked` with its two, or `owed` while fewer than two are
 * picked; a tier not reached is `locked` with the four it will list.
 *
 * @param {{profession: string|object|null, tier: number, picks: object|null}} o
 * @returns {Array<{tier: number, state: "fixed"|"picked"|"owed"|"locked", skills: string[], listed: string[], minLevel: number}>}
 */
export function skillTierRows({ profession = null, tier = 1, picks = null } = {}) {
  const lists = skillListsOf(profession);
  if (!lists) return [];
  const reached = clampTier(tier);
  return PROFESSION_TIERS.map(t => {
    const minLevel = RUNGS[t - 1].minLevel;
    if (t === 1) return { tier: 1, state: "fixed", skills: [...lists[1]], listed: [...lists[1]], minLevel };
    if (t > reached) return { tier: t, state: "locked", skills: [], listed: [...lists[t]], minLevel };
    const held = picksAt(lists, picks, t);
    return { tier: t, state: held.length >= PICKS_PER_TIER ? "picked" : "owed", skills: held, listed: [...lists[t]], minLevel };
  });
}

/** How many of the eleven a character holds at the cheap rate from its profession alone (not Adaptable). */
export function heldSkillCount(rows = []) {
  return rows.reduce((n, r) => n + (r.state === "locked" ? 0 : r.skills.length), 0);
}

/**
 * The picks a tier would hold with the sheet's unconfirmed choices laid over
 * the stored ones: the stored picks first, then the draft, closed to what the
 * tier lists, each once, two at most.
 */
export function mergedPicks({ profession = null, picks = null, draft = null, pickTier } = {}) {
  const lists = skillListsOf(profession);
  if (!lists) return [];
  const t = Math.trunc(Number(pickTier));
  const listed = lists[t] ?? [];
  const out = [...picksAt(lists, picks, t)];
  for (const key of Array.isArray(draft?.[t]) ? draft[t] : []) {
    if (out.length >= PICKS_PER_TIER) break;
    if (listed.includes(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * The *choose 2 profession skills* strip (the plan's M2, D11 §12): one a tier
 * reached with picks owed, oldest first. Each option says whether it is chosen
 * (stored or drafted) and whether it is already STORED (a stored pick is not
 * undone here). `ready` is exactly two chosen; `owed` how many are still to
 * choose, for the words beside a greyed Confirm.
 *
 * @returns {Array<{tier: number, minLevel: number, options: Array<{skill: string, chosen: boolean, stored: boolean}>, chosen: string[], owed: number, ready: boolean}>}
 */
export function pickStrips({ profession = null, tier = 1, picks = null, draft = null } = {}) {
  const lists = skillListsOf(profession);
  if (!lists) return [];
  const reached = clampTier(tier);
  const out = [];
  for (const t of PICK_TIERS) {
    if (t > reached) break;
    const stored = picksAt(lists, picks, t);
    if (stored.length >= PICKS_PER_TIER) continue;
    const chosen = mergedPicks({ profession, picks, draft, pickTier: t });
    out.push({
      tier: t,
      minLevel: RUNGS[t - 1].minLevel,
      options: lists[t].map(skill => ({ skill, chosen: chosen.includes(skill), stored: stored.includes(skill) })),
      chosen,
      owed: Math.max(0, PICKS_PER_TIER - chosen.length),
      ready: chosen.length === PICKS_PER_TIER
    });
  }
  return out;
}

/**
 * A draft toggled: a drafted skill is taken off, any other is added. The
 * caller judges an ADD with `professions.mjs#pickRefusal` first, against the
 * stored picks plus the draft, so a third pick is refused in words.
 */
export function toggleDraft(draft = {}, pickTier, skill) {
  const t = String(Math.trunc(Number(pickTier)));
  const list = Array.isArray(draft?.[t]) ? [...draft[t]] : [];
  const at = list.indexOf(skill);
  if (at >= 0) list.splice(at, 1);
  else list.push(skill);
  return { ...(draft ?? {}), [t]: list };
}

/* -------------------------------------------- */
/*  The Rank (D-1905)                            */
/* -------------------------------------------- */

/**
 * The Rank card: the Rank of fifteen, the next Rank's price (always the cheap
 * rate, `xp.mjs#professionRankCost`), and why a raise is refused, as a code:
 * `top` at Rank 15, `purse` where the unspent XP is short. `bar` is the Rank
 * out of fifteen in percent: a level indicator, not a progress bar (D-508,
 * D11 §12), because nothing on it is earned toward.
 */
export function rankView({ rank = 0, purse = 0 } = {}) {
  const r = Math.min(RANK_MAX, Math.max(0, Math.trunc(Number(rank)) || 0));
  const atTop = r >= RANK_MAX;
  const cost = atTop ? 0 : professionRankCost(r + 1);
  const unspent = Math.trunc(Number(purse)) || 0;
  const refusal = atTop ? "top" : (unspent < cost ? "purse" : null);
  return { rank: r, max: RANK_MAX, next: atTop ? null : r + 1, cost, purse: unspent, canRaise: refusal === null, refusal, bar: Math.round((r / RANK_MAX) * 100) };
}

/* -------------------------------------------- */
/*  The recipe list (D-1927)                     */
/* -------------------------------------------- */

/** The tier filter's options: tier 1 to the character's tier, never above (D-1927). */
export function tierOptions(tier) {
  const t = clampTier(tier);
  return PROFESSION_TIERS.filter(n => n <= t);
}

/** Whether any filter is set: a search term, Have materials, a tier or a kind. */
export function filtersActive(filters = {}) {
  return Boolean(String(filters.search ?? "").trim()) || filters.have === true
    || (filters.tier !== undefined && filters.tier !== null && filters.tier !== "all" && filters.tier !== "")
    || (filters.kind !== undefined && filters.kind !== null && filters.kind !== "all" && filters.kind !== "");
}

/**
 * **THE RECIPE LIST, FILTERED** (D-1927). `groups` are `recipes.mjs#recipesFor`'s
 * groups with each recipe reduced to `{id, name, tier, makeable}`. A recipe
 * passes the search (its name, case folded), Have materials (makeable at
 * least once), the tier and the kind. A group with nothing left is dropped. A
 * group is OPEN when the reader opened it (`open` holds its key) or when any
 * filter is set, since a search or a filter opens what it matches; otherwise
 * it starts closed. `count` is what is listed now, `total` the group's whole
 * size, `makeable` how many of its recipes the bags can make now.
 *
 * @returns {{groups: object[], matched: number, active: boolean}}
 */
export function filterRecipes({ groups = [], filters = {}, open = [] } = {}) {
  const term = String(filters.search ?? "").trim().toLocaleLowerCase();
  const tier = filters.tier === "all" || filters.tier === "" || filters.tier === null || filters.tier === undefined ? null : Number(filters.tier);
  const kind = filters.kind === "all" || filters.kind === "" || filters.kind === null || filters.kind === undefined ? null : String(filters.kind);
  const active = filtersActive(filters);
  const opened = new Set(open ?? []);
  const out = [];
  let matched = 0;
  for (const g of groups ?? []) {
    if (kind && g.key !== kind) continue;
    const recipes = (g.recipes ?? []).filter(r =>
      (!term || String(r.name ?? "").toLocaleLowerCase().includes(term))
      && (filters.have !== true || (Number(r.makeable) || 0) > 0)
      && (tier === null || r.tier === tier));
    if (!recipes.length) continue;
    matched += recipes.length;
    out.push({
      key: g.key, label: g.label, localize: g.localize === true,
      count: recipes.length,
      total: (g.recipes ?? []).length,
      makeable: (g.recipes ?? []).filter(r => (Number(r.makeable) || 0) > 0).length,
      open: active || opened.has(g.key),
      forced: active,
      recipes
    });
  }
  return { groups: out, matched, active };
}

/** The kind filter's options: every group the list holds, in its order. */
export function kindOptions(groups = []) {
  return (groups ?? []).map(g => ({ key: g.key, label: g.label, localize: g.localize === true }));
}

/** The groups one profession's reader has open, off the user flag's object. */
export function openGroups(stored, profession) {
  const list = stored && typeof stored === "object" ? stored[profession] : null;
  return Array.isArray(list) ? list.filter(k => typeof k === "string") : [];
}

/** The flag's object with one group opened or closed for one profession, sorted so two writes agree. */
export function withGroupOpen(stored, profession, key, open) {
  const set = new Set(openGroups(stored, profession));
  if (open) set.add(key); else set.delete(key);
  return { ...(stored && typeof stored === "object" ? stored : {}), [profession]: [...set].sort() };
}

/** The flag's object with every group of one profession opened (Open all) or none (Close all). */
export function withAllOpen(stored, profession, keys = [], open = true) {
  return { ...(stored && typeof stored === "object" ? stored : {}), [profession]: open ? [...new Set(keys)].sort() : [] };
}

/* -------------------------------------------- */
/*  One recipe card                              */
/* -------------------------------------------- */

const EXPECTED = new Map();

/**
 * `crafting.mjs#expectedSteps` remembered by its inputs: a card a recipe asks
 * the same few questions (a tier's DC, a rarity's target, the one bonus), so a
 * list of a hundred recipes solves a handful of chains.
 */
export function expectedFor({ bonus = 0, dc = 12, target = 2, run = 0, wellFed = false } = {}) {
  const key = `${bonus}|${dc}|${target}|${run}|${wellFed ? 1 : 0}`;
  if (!EXPECTED.has(key)) EXPECTED.set(key, expectedSteps({ bonus, dc, target, run, wellFed }));
  return EXPECTED.get(key);
}

/** The expected tests in words' numbers: rounded tests (null where it never finishes) and the collapse chance in percent. */
export function expectedView(expected) {
  const mean = expected?.mean;
  const tests = mean === null || mean === undefined ? null : Math.max(1, Math.round(mean));
  return { tests, collapse: Math.round((Number(expected?.collapse) || 0) * 100), finish: Math.round((Number(expected?.finish) || 0) * 100) };
}

/**
 * **A RECIPE CARD, BY THE SAME LAWS THE DOOR JUDGES BY** (D-768's whole
 * judgement, D-1981): the reagents (`reagentsFor`) against the bags
 * (`shortfall`), how many times the bags could make it at Common
 * (`makeableCount`), the plan (`craftPlan` at `recipeTier`), the expected tests
 * (`expectedSteps`), the Forge rows that apply (`visibleRows`) and every
 * refusal (`craftRefusals`). **The bag room is the one thing it does not
 * judge**: `room` is the caller's, and the sheet passes `true` for every card
 * but the selected one, whose card `workflows.craftSnapshot` judges whole and
 * the door judges again at the press.
 *
 * @param {object} o
 * @param {object} o.base         the recipe item `{name, type, system}`
 * @param {string} o.trade        the character's profession key
 * @param {number} o.tier         the character's tier
 * @param {string} [o.rarity]
 * @param {object[]} [o.affixes]  the chosen affix shapes
 * @param {{id: string}|null} [o.signature]  a Signature row picked from the door's list (D-1990); the hidden cards pass none
 * @param {Array} [o.signatures]  the door's Signature catalogue, which resolves `signature` to its row
 *   (`craft-signatures.mjs#resolveCraftSignature`) before the laws read it, so a bare `{id}` is
 *   never refused as unknown
 * @param {object} o.materials    identifier -> `{price, name, img}`
 * @param {object} o.have         identifier -> count in the bags
 * @param {boolean} o.toolCarried
 * @param {{enforced: boolean, open: boolean}} o.downtime
 * @param {number} o.bonus        the Craft Test's modifier
 * @param {boolean} [o.room]
 * @param {string|null} [o.cut]       a Cut asked for (D-2009); the hidden cards pass none
 * @param {boolean} [o.prefixRow]     whether the Prefix row is drawn (`craft-cuts.mjs#prefixRowDrawn`);
 *   by default whether the rarity opens it, which is exact for the hidden cards (Common: never)
 */
export function recipeCard({
  base, trade, tier = 1, rarity = "common", affixes = [], signature = null, signatures = [], materials = {}, have = {},
  toolCarried = false, downtime = { enforced: false, open: false }, bonus = 0, room = true, cut = null, prefixRow = undefined
} = {}) {
  const picked = (affixes ?? []).filter(Boolean);
  const resolved = resolveCraftSignature(signature, signatures, base);
  const sig = resolved.signature ?? null;
  const reagents = reagentsFor({ base, rarity, affixes: picked, signature: sig, materials, trade });
  const common = rarity === "common" && !picked.length && !sig
    ? reagents
    : reagentsFor({ base, rarity: "common", affixes: [], signature: null, materials, trade });
  const plan = craftPlan({ tier: recipeTier(base, rarity, trade), rarity });
  const rows = visibleRows(rarity, { forgeable: forgeable(base) });
  const prefixDrawn = prefixRow === undefined ? rows.prefix : prefixRow === true;
  const refusals = [
    ...(resolved.refusal ? [resolved.refusal] : []),
    ...craftRefusals({
      profession: trade, base, tier, rarity, affixes: picked, signature: sig,
      enforced: downtime?.enforced === true, open: downtime?.open === true,
      toolCarried, reagents, have, room, cut, prefixRow: prefixDrawn
    })
  ];
  return {
    plan,
    reagents: shortfall(reagents, have).map(l => ({ ...l, name: materials?.[l.identifier]?.name ?? l.identifier, img: materials?.[l.identifier]?.img ?? null })),
    makeable: makeableCount(common, have),
    expected: expectedFor({ bonus, dc: plan.dc, target: plan.target }),
    rows,
    // The Cuts a Cut-less suit is offered where no Prefix row is drawn (D-2009).
    cuts: cutChoices({ base, prefixRow: prefixDrawn }),
    forgeable: forgeable(base),
    refusals,
    ok: refusals.length === 0
  };
}

/**
 * A weapon's, a suit's or a thing's stat line as parts the sheet localizes:
 * `rating` (DMG), `range` (ft) and `ap` (a suit's Body AP, a shield's AP
 * bonus). A part the item does not have is left out.
 */
export function statParts(item) {
  const sys = item?.system ?? {};
  const out = [];
  if (item?.type === "weapon") {
    if (Number.isFinite(Number(sys.rating)) && sys.rating !== null && sys.rating !== "") out.push({ key: "rating", value: Number(sys.rating) });
    if (Number.isFinite(Number(sys.range)) && sys.range !== null && Number(sys.range) > 0) out.push({ key: "range", value: Number(sys.range) });
  }
  if (item?.type === "armor") {
    const body = Number(sys.ap?.body);
    if (Number.isFinite(body) && body > 0) out.push({ key: "ap", value: body });
    else if (Number(sys.apBonus) > 0) out.push({ key: "ap", value: Number(sys.apBonus) });
  }
  return out;
}

/** An item's traits as the chips the card draws (D-1928): every non-empty name once, in its own order. */
export function traitTokens(traits) {
  const out = [];
  for (const t of Array.isArray(traits) ? traits : []) {
    const name = String(typeof t === "string" ? t : (t?.name ?? "")).trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * A row's words as a reader sees them: the door hands the prose (`prose.mjs#proseFromHtml`), whose
 * `**strong**` and `*em*` are markers for a text box, so they are taken off for the select and the
 * printed row (the shot printed *cast **Renew** once*).
 */
export function plainWords(text) {
  return String(text ?? "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*\s][^*]*)\*/g, "$1");
}

/**
 * **THE SIGNATURE PICKER'S ROWS** (D-1990; the lead: *"The signatures should be chosen from a list,
 * not typed like the GM can. Exclude legendary signatures"*). `rows` are the door's own
 * (`workflows.craftSnapshot().signatures`, `{id, from, text, kind, cost}`), already held to the
 * item's type, the rarity and the budget left, with no Legendary item's Signature. Nothing is greyed
 * or added (D-1929).
 *
 * **A ROW IS ITS EFFECT AND ITS COST, NEVER THE ITEM IT COMES FROM** (D-2008; the lead: *"the
 * signatures should just show the effect, not the item it comes from"*). The door's `from` stays on
 * the catalogue row; this view model drops it, so nothing the sheet draws can print it. Two rows
 * whose words and cost are the same read as one option: the first keeps its id and the others ride
 * on it as `ids`, so a pick of either is still found (`signatureRowOf`). The rows are sorted by cost,
 * then by their words, then by id, so the list has an order a reader can use.
 *
 * @returns {Array<{id: string, ids: string[], text: string, kind: string|null, cost: number, selected: boolean}>}
 */
export function signatureRows(rows = [], picked = null) {
  const clean = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== "object" || typeof r.id !== "string" || !r.id || clean.some(o => o.id === r.id)) continue;
    clean.push({ id: r.id, text: plainWords(r.text), kind: r.kind ?? null, cost: Math.max(0, Math.trunc(Number(r.cost)) || 0) });
  }
  clean.sort((a, b) => a.cost - b.cost || a.text.localeCompare(b.text) || a.id.localeCompare(b.id));
  const out = [];
  for (const r of clean) {
    const twin = out.find(o => o.cost === r.cost && o.text === r.text);
    if (twin) { twin.ids.push(r.id); continue; }
    out.push({ id: r.id, ids: [r.id], text: r.text, kind: r.kind, cost: r.cost, selected: false });
  }
  for (const o of out) o.selected = picked !== null && picked !== undefined && o.ids.includes(picked);
  return out;
}

/** The picked row among `signatureRows`' answer (by its own id or a twin's), or null where the pick is no longer offered. */
export function signatureRowOf(rows = [], id = null) {
  return id ? (rows ?? []).find(r => r.id === id || (Array.isArray(r.ids) && r.ids.includes(id))) ?? null : null;
}

/* -------------------------------------------- */
/*  Projects (D-1924)                            */
/* -------------------------------------------- */

/** One project's step log as signed chips: the number, its text with a true minus, and the sign in a word-carrying flag. */
export function stepChips(log = []) {
  return (Array.isArray(log) ? log : []).map(n => {
    const value = Math.trunc(Number(n)) || 0;
    return { value, text: signedText(value), negative: value < 0 };
  });
}

/** The projects of this profession, sorted by id, and how many stand under another (stored until the holder returns to it). */
export function projectSplit(projects = [], profession = null) {
  const list = (projects ?? []).filter(p => p && typeof p.id === "string").sort((a, b) => a.id.localeCompare(b.id));
  const mine = list.filter(p => !p.trade || p.trade === profession);
  return { mine, others: list.length - mine.length };
}

/** A project's running total as a fraction of its target, 0 to 100, for the thin bar beside the numbers. */
export function projectFill(project) {
  const target = Number(project?.target) || 0;
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((Number(project?.run) || 0) / target) * 100)));
}

/* -------------------------------------------- */
/*  Disenchant (D-1933)                          */
/* -------------------------------------------- */

/**
 * What an enchanter may take apart: every item `gathering.mjs#disenchantRefusal`
 * passes for an enchanter carrying the rod (an Uncommon, Rare or Epic weapon,
 * suit or worn thing, not used up, not equipped), sorted by name then id. The
 * tool is judged by the door; this list is what the select offers.
 */
export function disenchantChoices(items = []) {
  return [...(items ?? [])]
    .filter(item => disenchantRefusal({ profession: "enchanting", toolCarried: true, item }) === null)
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")) || String(a.id ?? "").localeCompare(String(b.id ?? "")));
}

/* -------------------------------------------- */
/*  Harvest from the Profession tab (D-1996)      */
/* -------------------------------------------- */

/**
 * **WHAT THE HARVEST CARD OFFERS FOR EACH CREATURE TARGETED** (D-1996; the lead: make Skin,
 * Butcher and Salvage reachable). `creatures` are `workflows.harvestSnapshotOf` shapes plus
 * `{id, name}`; only a DEFEATED one is listed. Each row is one of the profession's harvests
 * (`gathering.mjs#HARVEST`), open where `harvestOn` offers it and the creature's tier is within
 * the harvester's, otherwise refused with a reason code the sheet says in words: `kind` (the
 * creature's type takes it not), `done` (taken already, once a creature) or `tier` (above the
 * harvester's tier). A profession that harvests nothing gets no rows.
 *
 * @param {{creatures: object[], profession: string, tier: number}} o
 * @returns {Array<{id: string, name: string, kinds: Array<{kind: string, ok: boolean, reason: string|null, tier: number, allowed: string[]}>}>}
 */
export function harvestRows({ creatures = [], profession = null, tier = 1 } = {}) {
  const mine = Object.entries(HARVEST).filter(([, h]) => h.profession === profession);
  if (!mine.length) return [];
  const t = clampTier(tier);
  const out = [];
  for (const c of creatures ?? []) {
    if (!c || c.defeated !== true) continue;
    const done = Array.isArray(c.done) ? c.done : [];
    const kinds = mine.map(([kind, h]) => {
      const offered = harvestOn({ type: c.type, tier: c.tier, defeated: true, harvested: done.includes(kind) }, profession).some(o => o.kind === kind);
      const creatureTier = clampTier(c.tier);
      let reason = null;
      if (!h.kinds.includes(c.type)) reason = "kind";
      else if (done.includes(kind)) reason = "done";
      else if (!offered) reason = "kind";
      else if (creatureTier > t) reason = "tier";
      return { kind, ok: reason === null, reason, tier: creatureTier, allowed: [...h.kinds] };
    });
    out.push({ id: String(c.id ?? ""), name: String(c.name ?? ""), kinds });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/* -------------------------------------------- */
/*  One press at a time                          */
/* -------------------------------------------- */

/**
 * **A PRESS WHILE THE SAME PRESS IS STILL IN FLIGHT DOES NOTHING** (the architect's review, M1).
 * The doors queue their writes, so a second Raise waits and is judged again; this guard keeps the
 * sheet from even asking while the first is unanswered, since a re-render draws a live button
 * under the pointer. `run(key, task)` answers the task's result, or null where the key is busy.
 */
export function pressGuard() {
  const busy = new Set();
  return {
    busy: key => busy.has(key),
    async run(key, task) {
      if (busy.has(key)) return null;
      busy.add(key);
      try { return await task(); } finally { busy.delete(key); }
    }
  };
}

/**
 * The keyword an affix shows as a chip beside an item's traits (the lead, 2026-11-24: *"of the Stag"
 * would have the tooltip "stag" next to long*): a suffix's *of the* is dropped, a prefix keeps its
 * name. The chip's tooltip carries the whole name and what the affix gives.
 *
 * @param {string} name  the affix's name
 * @returns {string}
 */
export function affixChipName(name) {
  const bare = String(name ?? "").trim().replace(/^of\s+(?:the\s+)?/i, "");
  return bare ? bare.charAt(0).toUpperCase() + bare.slice(1) : String(name ?? "");
}
