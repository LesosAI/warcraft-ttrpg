/**
 * The craft as an Extended Test that is STORED (D-1924). Pure functions, no
 * Foundry imports and no `Math.random` (CLAUDE.md §3).
 *
 * The lead: *"each crafting test SL level to be relative to their rarity. Each
 * test counts towards the total until completed. So multiple tests will be
 * required over time and 'stored' until the item is completed."* So:
 *
 *  - the item's RARITY sets the target SL: Common 2, Uncommon 4, Rare 5,
 *    Epic 8 (D-1935, the lead's craft pacing; it was 6/10/20/30);
 *  - the recipe's effective tier (`recipes.mjs#recipeTier`) sets the DC (05
 *    §3's EASY column, 8/12/16/20, D-1935) and the interval one test stands
 *    for (an hour, an hour, a day, a week);
 *  - Start spends the materials and stores a project; each test adds its SL
 *    to a running total kept on the sheet until it reaches the target (the
 *    item is made) or falls to -3 (it collapses and the materials are lost);
 *  - several projects may stand at once, and how many tests a day is the GM's.
 */

import { AZEROTH } from "../config.mjs";
import { resolveAdjusted } from "./resolution.mjs";
import { RARITY_TIER } from "./recipes.mjs";
import { clampTier } from "./professions.mjs";
import { applyWellFed } from "./well-fed.mjs";
import { downtimeRefusal } from "./downtime.mjs";

/** The running SL to reach, by the item's rarity (D-1924, rebalanced by D-1935). */
export const TARGET_SL = Object.freeze({ common: 2, uncommon: 4, rare: 5, epic: 8 });

/** A running total at or below this collapses the project (D-1924). */
export const COLLAPSE_AT = -3;

/** What one test stands for, by effective tier (D-1924). Keys of `AZEROTH.craftIntervals`. */
export const INTERVAL = Object.freeze({ 1: "hour", 2: "hour", 3: "day", 4: "week" });

/**
 * A Craft Test's DC by effective tier: 05 §3's Easy column (D-1935). A
 * Gathering Test and Disenchant keep the Standard column (`gathering.mjs`).
 */
export function craftDC(tier) {
  return AZEROTH.EASY_DC[clampTier(tier)];
}

/**
 * The numbers a craft runs on: the rarity, the effective tier (the higher of
 * the recipe's and the rarity's), the DC, the interval and the target.
 */
export function craftPlan({ tier = 1, rarity = "common" } = {}) {
  const r = TARGET_SL[rarity] ? rarity : "common";
  const t = Math.max(clampTier(tier), RARITY_TIER[r] ?? 1);
  return { rarity: r, tier: t, dc: craftDC(t), interval: INTERVAL[t], target: TARGET_SL[r] };
}

/**
 * A new stored project. `id` is the caller's (a stable string), `recipe` the
 * recipe's uuid or identifier, `name` what the card calls it. The plan's
 * numbers are frozen into the project at the start, so a level gained later
 * never moves a DC under it.
 */
export function newProject({ id, recipe, name = "", trade = null, tier = 1, rarity = "common", spent = [], quality = null } = {}) {
  const p = craftPlan({ tier, rarity });
  return {
    id: String(id ?? ""),
    recipe: recipe ?? null,
    name: String(name ?? ""),
    trade,
    rarity: p.rarity,
    tier: p.tier,
    dc: p.dc,
    interval: p.interval,
    target: p.target,
    run: 0,
    tests: 0,
    log: [],
    spent: (spent ?? []).map(l => ({ identifier: l.identifier, count: l.count })),
    quality: quality ?? null,
    status: "stored"
  };
}

/**
 * One test's SL added to a project (D-1924). Never mutates: returns the
 * project as it stands after the test and what happened, `stored`, `done` or
 * `collapsed`. A project already finished or collapsed takes no more tests.
 *
 * @returns {{project: object, outcome: "stored"|"done"|"collapsed"|"closed"}}
 */
export function stepProject(project, sl) {
  if (!project || project.status !== "stored") return { project, outcome: "closed" };
  const n = Math.trunc(Number(sl)) || 0;
  const run = (Number(project.run) || 0) + n;
  const next = { ...project, run, tests: (Number(project.tests) || 0) + 1, log: [...(project.log ?? []), n] };
  if (run <= COLLAPSE_AT) return { project: { ...next, status: "collapsed" }, outcome: "collapsed" };
  if (run >= next.target) return { project: { ...next, status: "done" }, outcome: "done" };
  return { project: next, outcome: "stored" };
}

/** The SL still owed. */
export function remaining(project) {
  return Math.max(0, (Number(project?.target) || 0) - (Number(project?.run) || 0));
}

/**
 * Several projects stand at once (D-1924). The list with one project put in or
 * replaced by id, sorted by id so two writes never disagree on the order.
 */
export function upsertProject(projects = [], project) {
  const list = (projects ?? []).filter(p => p && p.id !== project?.id);
  if (project) list.push(project);
  return list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/**
 * **WHETHER AN ITEM ALREADY STANDS UNDER AN ENCHANTMENT PROJECT** (the phase 4 review): a
 * stored project, in any status, whose `quality.enchant.itemId` is this item. Two projects on
 * one item would each be judged against the item as it is now, and the second delivered would
 * rebuild over the first. The enchant door refuses the second as `enchantPending`.
 */
export function enchantPending(projects = [], itemId) {
  if (!itemId) return false;
  return (projects ?? []).some(p => p?.quality?.enchant?.itemId === itemId);
}

/** The list less one project (made, collapsed or abandoned). */
export function dropProject(projects = [], id) {
  return (projects ?? []).filter(p => p && p.id !== id);
}

/**
 * **WHETHER A PROJECT IS COLLECTED RATHER THAN TESTED** (the final review's minor 3): finished and
 * held for room (`ready`, `done`), or claimed for delivery and left there by a write lost after the
 * item was made (`delivering`). `profession-workflows.mjs#collectProject` takes all three, and the
 * sheet draws Collect for all three; it drew Collect for the first two alone, so a `delivering`
 * project showed a greyed Roll and an Abandon that said the materials were lost.
 */
export function collectable(project) {
  if (!project) return false;
  return project.ready === true || project.status === "done" || project.status === "delivering";
}

/**
 * Why a project's next test may not be rolled, as a code, or null: downtime
 * closed while enforced, the tool not carried, the profession not the
 * project's trade. **A stored project stays when its holder changes
 * profession** (03 §4: the Rank is kept); its next test needs the project's
 * own trade, and the refusal's words say so (`projectTrade`).
 */
export function testRefusal({ project, profession, toolCarried = false, enforced = false, open = false } = {}) {
  // A project interrupted while it was being started (`profession-workflows.mjs#startProject`):
  // said in its own words, since *finished* is false of it and Abandon is how it is cleared.
  if (project?.status === "pending") return { reason: "pending" };
  if (!project || project.status !== "stored") return { reason: "closed" };
  const closed = downtimeRefusal({ enforced, open });
  if (closed) return closed;
  if (toolCarried !== true) return { reason: "tool" };
  if (project.trade && project.trade !== profession) return { reason: "projectTrade", trade: project.trade };
  return null;
}

/* -------------------------------------------- */
/*  How long, and how likely (exact)             */
/* -------------------------------------------- */

/**
 * The chance of each SL one Craft Test gives, exactly, over the twenty faces
 * of the kept die (05 §4's pool: `net` Boons over Banes keep the highest, net
 * Banes the lowest, four dice at most), through `resolution.mjs#resolveAdjusted`
 * (the adjusted total alone: a natural 20 or 1 has no special effect, D-1980), and with Well
 * Fed's +1 added after (`well-fed.mjs#applyWellFed`).
 *
 * @returns {Map<number, number>} SL -> probability
 */
export function slDistribution({ bonus = 0, dc = 12, net = 0, wellFed = false } = {}) {
  const faces = keptFaceOdds(net);
  const out = new Map();
  for (let face = 1; face <= 20; face++) {
    const p = faces[face];
    if (!p) continue;
    const sl = applyWellFed(resolveAdjusted({ natural: face, modifier: bonus, dc }).sl, { fed: wellFed });
    out.set(sl, (out.get(sl) ?? 0) + p);
  }
  return out;
}

/** The odds of each kept face for a net advantage (index 1..20). */
export function keptFaceOdds(net = 0) {
  const n = Math.trunc(Number(net)) || 0;
  const count = 1 + Math.min(3, Math.abs(n));
  const odds = new Array(21).fill(0);
  for (let k = 1; k <= 20; k++) {
    if (n >= 0) odds[k] = (k / 20) ** count - ((k - 1) / 20) ** count;
    else odds[k] = ((21 - k) / 20) ** count - ((20 - k) / 20) ** count;
  }
  return odds;
}

/**
 * The expected number of tests to finish a project from a running total, and
 * the chance it collapses first - EXACTLY, by solving the absorbing chain over
 * the running totals -2 to target-1 (D-1924). `mean` is the mean number of
 * tests over the runs that FINISH, null where none can; `stalls` is the chance
 * of a run that can neither finish nor collapse (every test SL 0).
 *
 * @returns {{finish: number, collapse: number, stalls: number, mean: number|null}}
 */
export function expectedSteps({ bonus = 0, dc = 12, target = 6, run = 0, net = 0, wellFed = false } = {}) {
  const goal = Math.trunc(Number(target)) || 0;
  const start = Math.trunc(Number(run)) || 0;
  if (start >= goal) return { finish: 1, collapse: 0, stalls: 0, mean: 0 };
  if (start <= COLLAPSE_AT) return { finish: 0, collapse: 1, stalls: 0, mean: null };
  const dist = [...slDistribution({ bonus, dc, net, wellFed }).entries()];
  const lo = COLLAPSE_AT + 1;
  const states = [];
  for (let s = lo; s < goal; s++) states.push(s);
  const index = new Map(states.map((s, i) => [s, i]));
  const n = states.length;

  // Which states can reach an end at all: the rest stall for ever.
  const live = new Array(n).fill(false);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < n; i++) {
      if (live[i]) continue;
      for (const [sl] of dist) {
        const t = states[i] + sl;
        if (t >= goal || t <= COLLAPSE_AT || (index.has(t) && live[index.get(t)])) { live[i] = true; changed = true; break; }
      }
    }
  }
  if (!live[index.get(start)]) return { finish: 0, collapse: 0, stalls: 1, mean: null };

  // h = P(finish), c = P(collapse), g = E[tests * 1(finish)], over the live states.
  const ids = states.map((_, i) => i).filter(i => live[i]);
  const at = new Map(ids.map((i, k) => [i, k]));
  const m = ids.length;
  const A = Array.from({ length: m }, () => new Array(m).fill(0));
  const bh = new Array(m).fill(0);
  const bc = new Array(m).fill(0);
  for (let k = 0; k < m; k++) {
    A[k][k] += 1;
    for (const [sl, p] of dist) {
      const t = states[ids[k]] + sl;
      if (t >= goal) bh[k] += p;
      else if (t <= COLLAPSE_AT) bc[k] += p;
      else if (index.has(t) && live[index.get(t)]) A[k][at.get(index.get(t))] -= p;
    }
  }
  const h = solve(A, bh);
  const c = solve(A, bc);
  const bg = h.slice();
  const g = solve(A, bg);
  const k0 = at.get(index.get(start));
  const finish = clamp01(h[k0]);
  const collapse = clamp01(c[k0]);
  return { finish, collapse, stalls: clamp01(1 - finish - collapse), mean: finish > 1e-12 ? g[k0] / h[k0] : null };
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

/** Gaussian elimination with partial pivoting; A is copied. */
function solve(A0, b0) {
  const n = b0.length;
  const A = A0.map(r => r.slice());
  const b = b0.slice();
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    const d = A[col][col] || 1e-300;
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / d;
      if (!f) continue;
      for (let k = col; k < n; k++) A[r][k] -= f * A[col][k];
      b[r] -= f * b[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / (A[r][r] || 1e-300);
  }
  return x;
}
