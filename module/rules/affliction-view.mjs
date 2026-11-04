/**
 * **THE AFFLICTIONS PANEL AS A READING OF STATE** (D12, Phase 7). Pure: no
 * Foundry imports, no `game`, no `CONFIG` (CLAUDE.md section 3). The sheet hands
 * in the carriers it found, the clock, and every word already localised; this
 * module decides ORDER, SUMMARY, and what each control may do, and nothing in it
 * is stored.
 *
 * Two collapsible groups (Poisons, Diseases). A group's heading gives its count
 * and an urgency summary that stays readable when the group is closed. Each row
 * is one line (name, short state, DC, ONE main cure button) that opens to the
 * full row. A refusal is returned as words beside the greyed control, never as
 * the grey alone.
 *
 * `words` is the localised `AZEROTH.Afflictions.Panel` object plus three maps
 * the caller adds (`conditions`, `abilities`, `resiliences`). A string takes
 * `{name}` placeholders. Nothing here is hardcoded English.
 *
 * ```
 * afflictionView(carriers, {now, inFight, isGM, carried, words, open})
 *   carriers  [{id, aff, img?}]            effects/afflictions.mjs#afflictionsOf, minus the document
 *   carried   {antivenom: n, remedies: {diseaseKey: {name, count, itemId}}}
 *   open      {groups: {poison: bool}, rows: [id]}   remembered per viewer
 * ```
 */

import { DAY, DISEASES, HOUR, medicineNextAt, medicineRefusal, penaltiesApply } from "./afflictions.mjs";

const ABILITY_ORDER = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
const isNum = n => typeof n === "number" && Number.isFinite(n);

/** `{name}` placeholders. A missing key leaves the braces, which a test notices. */
export function fmt(template, data = {}) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (m, k) => (data[k] === undefined || data[k] === null ? m : String(data[k])));
}

/** A span of world seconds in the words' units: minutes, hours, or days and hours. */
export function spanText(seconds, words) {
  const s = words?.Span ?? {};
  const n = Math.max(0, Number(seconds) || 0);
  if (n < 60) return s.Under ?? "";
  if (n < HOUR) return fmt(s.Min, { n: Math.ceil(n / 60) });
  if (n < DAY) return fmt(s.Hour, { n: Math.ceil(n / HOUR) });
  const days = Math.floor(n / DAY);
  const hours = Math.floor((n - days * DAY) / HOUR);
  const d = fmt(days === 1 ? s.Day : s.Days, { n: days });
  return hours ? `${d} ${fmt(s.Hour, { n: hours })}` : d;
}

const joinAnd = (list, words) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} ${words?.And ?? "and"} ${list.at(-1)}`);
const signed = n => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

/* ------------------------------------------------------------------ */
/* Poisons                                                             */
/* ------------------------------------------------------------------ */

/** 0 damage, 1 Fatigue, 2 a held condition, 3 a Bane or a cut. */
export function poisonCategory(repeat = {}) {
  if ((repeat.damage ?? 0) > 0) return 0;
  if ((repeat.fatigue ?? 0) > 0) return 1;
  if ((repeat.statuses?.length ?? 0) > 0) return 2;
  return 3;
}

const conditionName = (id, words) => words?.conditions?.[id] ?? id;

function poisonNow(aff, { now, inFight, words }) {
  const r = aff.repeat ?? {};
  const world = !inFight && aff.clock?.mode !== "fight" && isNum(aff.clock?.nextAt);
  const left = world ? Math.max(0, aff.clock.nextAt - now) : null;
  const next = left === null ? "" : ` · ${fmt(words.NextIn, { span: spanText(left, words) })}`;
  const parts = [];
  if (r.damage > 0) {
    parts.push(fmt(inFight ? words.DamageTurn : words.DamageHour, { n: r.damage }) + next);
  }
  if (r.fatigue > 0) parts.push(fmt(words.FatigueHour, { n: r.fatigue }) + (r.damage > 0 ? "" : next));
  for (const id of r.statuses ?? []) {
    const valued = id === "poisoned" && (r.value ?? 0) > 0;
    const label = valued ? `${conditionName(id, words)} ${r.value}` : conditionName(id, words);
    const hourly = world && Array.isArray(r.beats) && r.beats.includes("hour");
    parts.push(valued && hourly ? `${label} · ${fmt(words.LaidAgain, { span: spanText(left, words) })}`
      : fmt(words.Held, { cond: label }));
  }
  if (r.firstTestBane === "attack") parts.push(words.BaneAttack);
  else if (r.firstTestBane === "casting") parts.push(words.BaneCasting);
  else if (r.firstTestBane) parts.push(words.BaneAttack);
  if (isNum(r.healingFactor) && r.healingFactor < 1) parts.push(words.HalveHealing);
  return parts.join("; ");
}

function poisonShort(aff, { now, inFight, words }) {
  const r = aff.repeat ?? {};
  const world = !inFight && aff.clock?.mode !== "fight" && isNum(aff.clock?.nextAt);
  const rest = world ? spanText(Math.max(0, aff.clock.nextAt - now), words) : "";
  if (r.damage > 0) return { strong: fmt(inFight ? words.ShortDamageTurn : words.ShortDamageHour, { n: r.damage }), rest };
  if (r.fatigue > 0) return { strong: fmt(words.ShortFatigue, { n: r.fatigue }), rest };
  if (r.statuses?.length) {
    const id = r.statuses[0];
    const valued = id === "poisoned" && (r.value ?? 0) > 0;
    return { strong: valued ? `${conditionName(id, words)} ${r.value}` : conditionName(id, words), rest: "" };
  }
  if (r.firstTestBane) return { strong: r.firstTestBane === "casting" ? words.ShortBaneCasting : words.ShortBaneAttack, rest: "" };
  if (isNum(r.healingFactor) && r.healingFactor < 1) return { strong: words.ShortHalved, rest: "" };
  return { strong: "", rest: "" };
}

/* ------------------------------------------------------------------ */
/* Diseases                                                            */
/* ------------------------------------------------------------------ */

const STAGE_INDEX = Object.freeze({ onset: 0, carried: 1, recovering: 2 });

function diseaseEffects(aff, words) {
  const r = aff.repeat ?? {};
  const out = [];
  if (r.fatigue > 0) out.push(fmt(words.FatigueN, { n: r.fatigue }));
  const abil = r.abilities ?? {};
  const byValue = new Map();
  for (const k of ABILITY_ORDER) {
    if (isNum(abil[k]) && abil[k] !== 0) byValue.set(abil[k], [...(byValue.get(abil[k]) ?? []), k]);
  }
  for (const [value, keys] of byValue) {
    out.push(keys.length === ABILITY_ORDER.length ? fmt(words.AllAttributes, { n: signed(value) })
      : `${joinAnd(keys.map(k => words.abilities?.[k] ?? k), words)} ${signed(value)}`);
  }
  if (r.damageRating) out.push(fmt(words.DamageRatingN, { n: signed(r.damageRating) }));
  const tests = (r.banes ?? []).map(b => {
    const t = String(b.test ?? "");
    if (t.startsWith("resilience:")) return fmt(words.ResilienceTest, { r: words.resiliences?.[t.slice(11)] ?? t.slice(11) });
    return words.abilities?.[t] ?? t;
  });
  if (tests.length) out.push(fmt(words.BaneOn, { tests: joinAnd(tests, words) }));
  return out;
}

function courseOf(stage, words) {
  const at = STAGE_INDEX[stage] ?? 1;
  return ["Onset", "Carried", "Recovering", "Ends"].map((key, i) => ({
    key, label: words.Course?.[key] ?? key, state: i < at ? "done" : i === at ? "at" : "todo"
  }));
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

function countOf(carried, key) {
  const v = carried?.[key];
  return typeof v === "number" ? v : Number(v?.count) || 0;
}

function poisonRow(c, ctx) {
  const { aff } = c;
  const { now, inFight, words, carried } = ctx;
  const have = countOf(carried, "antivenom");
  const short = poisonShort(aff, ctx);
  const half = inFight ? ` (${words.HalfAction})` : "";
  const antivenom = {
    action: "useAntivenom",
    label: have > 0 ? `${words.Antivenom}${have > 0 && !inFight ? ` (${fmt(words.CarriedN, { n: have })})` : half}` : words.Antivenom,
    short: words.AntivenomShort,
    disabled: have <= 0,
    reason: have > 0 ? null : words.NoAntivenom,
    data: { affliction: c.id }
  };
  return {
    base: {
      ends: words.PoisonEnds, then: null, weekly: null, course: null,
      now: poisonNow(aff, ctx), short, actions: [antivenom]
    },
    sortKey: [poisonCategory(aff.repeat),
      inFight ? -(aff.repeat?.damage ?? 0) : (isNum(aff.clock?.nextAt) ? aff.clock.nextAt - now : Infinity)],
    stageKey: `c${poisonCategory(aff.repeat)}`
  };
}

function diseaseRow(c, ctx) {
  const { aff } = c;
  const { now, inFight, words, carried } = ctx;
  const d = aff.disease ?? {};
  const stage = d.stage ?? "carried";
  const def = DISEASES[aff.key];
  const remedyName = def?.remedy ?? null;
  const remedy = carried?.remedies?.[aff.key] ?? null;
  const days = def ? Math.round(def.recovery / DAY) : null;
  const effects = penaltiesApply(aff) ? diseaseEffects(aff, words) : [];
  const diseased = conditionName("diseased", words);
  const actions = [];
  let refusal = null;
  let open = false;
  let tried = false;

  if (stage !== "recovering") {
    refusal = medicineRefusal({ stage, triedAt: d.triedAt ?? null, now, inFight });
    open = refusal === null;
    tried = refusal === "triedToday";
    actions.push({
      action: "medicineTest", label: words.Medicine, short: words.MedicineShort, disabled: !open,
      reason: refusal ? fmt(words.MedicineRefuse?.[refusal] ?? "", { span: spanText((medicineNextAt(d.triedAt) ?? now) - now, words) }) : null,
      data: { affliction: c.id }
    });
  }
  if (remedyName) {
    const have = countOf({ r: remedy }, "r");
    actions.push({
      action: "useRemedy", label: have > 0 ? `${fmt(words.UseRemedy, { name: remedy?.name ?? remedyName })} (${have})` : fmt(words.UseRemedy, { name: remedyName }),
      short: words.RemedyShort, disabled: have <= 0,
      reason: have > 0 ? null : fmt(words.NoRemedy, { name: remedyName }),
      data: { affliction: c.id, itemId: remedy?.itemId ?? "" }
    });
  }

  const cure = remedyName ? fmt(words.CureNow, { remedy: remedyName }) : words.CureSpellOnly;
  let now_ = "", short, ends, then = null, weekly = null;
  if (stage === "onset") {
    const left = isNum(d.onsetAt) ? Math.max(0, d.onsetAt - now) : null;
    const span = left === null ? "" : spanText(left, words);
    now_ = left === null ? words.NothingYet : fmt(words.NothingYetIn, { span });
    then = [diseased, ...diseaseEffects({ ...aff }, words)].join(", ");
    ends = fmt(words.EndsOnset, { cure });
    short = { strong: words.ShortOnset, rest: span };
  } else if (stage === "recovering") {
    const left = isNum(d.recoverAt) ? Math.max(0, d.recoverAt - now) : null;
    const span = left === null ? "" : spanText(left, words);
    now_ = [diseased, ...effects].join(", ");
    ends = left === null ? cure : fmt(words.EndsRecovering, { span, cure });
    short = { strong: words.ShortRecovering, rest: span };
  } else {
    now_ = [diseased, ...effects].join(", ");
    if (tried) {
      const span = spanText((medicineNextAt(d.triedAt) ?? now) - now, words);
      ends = fmt(words.EndsTried, { span, cure });
      short = { strong: words.ShortTried, rest: span };
    } else if (open) {
      ends = days === null ? cure : fmt(words.EndsCarried, { days, cure });
      short = { strong: words.ShortOpen, rest: "" };
    } else {
      ends = cure;
      short = { strong: words.ShortCarried, rest: "" };
    }
  }
  if (def?.carried?.weekly && isNum(d.weeklyAt) && stage !== "onset") {
    weekly = fmt(words.WeeklyLine, { span: spanText(Math.max(0, d.weeklyAt - now), words) });
  }
  // Open first, then carried, then recovering, then onset (the mockup's order).
  const rank = stage === "onset" ? 3 : stage === "recovering" ? 2 : open ? 0 : 1;
  return {
    base: { now: now_, ends, then, weekly, short, actions, course: courseOf(stage, words) },
    sortKey: [rank, 0],
    stageKey: open ? "open" : tried ? "tried" : stage === "carried" ? "carried" : stage
  };
}

/* ------------------------------------------------------------------ */
/* The clock                                                           */
/* ------------------------------------------------------------------ */

/** The least a panel waits between clock-driven redraws (a world clock can tick every second). */
export const PANEL_REFRESH_MS = 1000;

/**
 * Whether a clock tick must redraw a sheet's Corruption part: the sheet is
 * drawn AND its actor carries something, whose countdowns the redraw refreshes.
 * A sheet with nothing carried has no countdown to go stale.
 */
export function panelNeedsRefresh({ rendered = false, carried = 0 } = {}) {
  return rendered === true && Number(carried) > 0;
}

/* ------------------------------------------------------------------ */
/* The view                                                            */
/* ------------------------------------------------------------------ */

function summaryOf(kind, rows, words) {
  const n = key => rows.filter(r => r.stageKey === key).length;
  const parts = [];
  const add = (count, one, many) => { if (count > 0) parts.push(fmt(count === 1 && one ? one : many, { n: count })); };
  if (kind === "poison") {
    add(n("c0"), null, words.SumDamage);
    add(n("c1"), null, words.SumFatigue);
    add(n("c2"), null, words.SumCondition);
    add(n("c3"), null, words.SumBane);
  } else {
    add(n("open"), words.SumOpenOne, words.SumOpen);
    add(n("tried"), null, words.SumTried);
    add(n("carried"), null, words.SumCarried);
    add(n("recovering"), null, words.SumRecovering);
    add(n("onset"), null, words.SumOnset);
  }
  return parts;
}

/**
 * @returns {{groups: Array, empty: boolean, canAdd: boolean}}
 */
export function afflictionView(carriers = [], { now = 0, inFight = false, isGM = false, carried = {}, words = {}, open = {} } = {}) {
  const ctx = { now, inFight, words, carried };
  const openRows = new Set(Array.isArray(open.rows) ? open.rows : []);
  const built = [];
  for (const c of carriers ?? []) {
    const aff = c?.aff;
    if (!aff || (aff.kind !== "poison" && aff.kind !== "disease")) continue;
    const { base, sortKey, stageKey } = aff.kind === "poison" ? poisonRow(c, ctx) : diseaseRow(c, ctx);
    const actions = [...base.actions];
    const primary = actions.find(a => !a.disabled) ?? null;
    built.push({
      id: c.id,
      kind: aff.kind,
      key: aff.key,
      name: aff.name ?? aff.key,
      kindLabel: aff.kind === "poison" ? words.Poison : words.Disease,
      dc: isNum(aff.dc) ? aff.dc : null,
      dcLabel: isNum(aff.dc) ? fmt(words.Dc, { dc: aff.dc }) : words.NoTest,
      img: c.img ?? null,
      shortStrong: base.short.strong,
      shortRest: base.short.rest,
      now: base.now,
      from: aff.source?.name ?? null,
      then: base.then,
      ends: base.ends,
      weekly: base.weekly,
      course: base.course,
      actions,
      primary: primary ? { action: primary.action, label: primary.short ?? primary.label, disabled: false, reason: null, data: primary.data } : null,
      refusals: actions.filter(a => a.disabled && a.reason).map(a => a.reason),
      canEnd: isGM === true,
      endLabel: fmt(words.EndLabel, { name: aff.name ?? aff.key }),
      open: openRows.has(c.id),
      sortKey,
      stageKey
    });
  }
  const groups = [];
  for (const kind of ["poison", "disease"]) {
    const rows = built.filter(r => r.kind === kind).sort((a, b) =>
      a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1] || String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)));
    if (!rows.length) continue;
    const parts = summaryOf(kind, rows, words);
    groups.push({
      kind,
      label: kind === "poison" ? words.Poisons : words.Diseases,
      count: rows.length,
      summaryParts: parts,
      summary: parts.join(" · "),
      open: open.groups?.[kind] !== false,
      rows: rows.map(({ sortKey, ...r }) => r)
    });
  }
  return { groups, empty: groups.length === 0, canAdd: isGM === true };
}
