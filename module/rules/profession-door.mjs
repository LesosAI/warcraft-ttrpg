/**
 * What the profession doors read off a character, pure (D-1903 to D-1930;
 * CLAUDE.md §3). `dice/profession-workflows.mjs` and the sheet hand these the
 * actor's items as plain rows; nothing here touches Foundry.
 *
 * **Only gear is a material** (D-737: a law handed the whole collection must
 * not count a talent or a feature). A stack's count is its `quantity`; a thing
 * with no quantity is one.
 */

import { spendOne } from "./consumables.mjs";
import { pickRefusal } from "./professions.mjs";
import { RANK_MAX, professionRankCost, unspent } from "./xp.mjs";

const qtyOf = item => {
  const q = item?.system?.quantity;
  return q === undefined || q === null ? 1 : Math.max(0, Math.trunc(Number(q)) || 0);
};
const idOf = item => String(item?.id ?? item?._id ?? "");

/**
 * Every material the bags hold, identifier -> count, summed over stacks. Only
 * gear, and never a thing worn or held (a worn ring is not a reagent).
 *
 * @param {Iterable<object>} items
 * @returns {Record<string, number>}
 */
export function materialCounts(items = []) {
  const out = {};
  for (const item of items ?? []) {
    if (item?.type !== "gear" || item.system?.equipped === true) continue;
    const id = item.system?.identifier;
    if (!id) continue;
    out[id] = (out[id] ?? 0) + qtyOf(item);
  }
  return out;
}

/**
 * **THE REAGENTS, SPENT IN ONE BATCH** (D-1907, D-1924; `consumables.mjs#spendOne`'s
 * rule): which stacks give how many, smallest stack first and then by id, so
 * two identical presses spend the same stacks. Answers the writes - `updates`
 * (`{_id, "system.quantity"}`) and `deletes` (ids) - or null where any line is
 * short, so a door judges before it writes and writes nothing on a refusal.
 *
 * @param {Iterable<object>} items
 * @param {Array<{identifier: string, count: number}>} reagents
 * @returns {{updates: object[], deletes: string[]}|null}
 */
export function reagentSpend(items = [], reagents = []) {
  const stacks = [...(items ?? [])]
    .filter(i => i?.type === "gear" && i.system?.equipped !== true && i.system?.identifier)
    .map(i => ({ item: i, left: qtyOf(i) }));
  const updates = new Map();
  const deletes = new Set();
  for (const line of reagents ?? []) {
    let need = Math.max(0, Math.trunc(Number(line?.count)) || 0);
    const pool = stacks.filter(s => s.item.system.identifier === line.identifier && s.left > 0)
      .sort((a, b) => a.left - b.left || idOf(a.item).localeCompare(idOf(b.item)));
    for (const s of pool) {
      if (need <= 0) break;
      const take = Math.min(need, s.left);
      for (let n = 0; n < take; n++) {
        const step = spendOne(s.left);
        s.left = step?.delete ? 0 : (step?.quantity ?? s.left - 1);
      }
      need -= take;
      if (s.left <= 0) { deletes.add(idOf(s.item)); updates.delete(idOf(s.item)); }
      else updates.set(idOf(s.item), s.left);
    }
    if (need > 0) return null;
  }
  return {
    updates: [...updates.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([_id, q]) => ({ _id, "system.quantity": q })),
    deletes: [...deletes].sort()
  };
}

/**
 * **A REAGENT SPEND IS ONE WRITE** (the final review's minor 4). `reagentSpend` answers the stacks
 * to lower and the stacks used up; written as an update and then a delete, a refused delete left
 * the update landed and the project dropped, so part of the reagents was gone with no project.
 * Here the whole spend is ONE update - a used-up stack is lowered to 0 in the same batch - and the
 * empty stacks are deleted only after the project is stored, as cleanup: a delete that fails
 * leaves an empty stack the table can clear, never a lost reagent or a free project (CLAUDE.md
 * §15: curable over loss).
 *
 * @param {{updates: object[], deletes: string[]}|null} spend  `reagentSpend`'s answer
 * @returns {{updates: object[], cleanup: string[]}} the one update, and the ids to delete after
 */
export function spendWrites(spend) {
  if (!spend) return { updates: [], cleanup: [] };
  const updates = [
    ...(spend.updates ?? []),
    ...(spend.deletes ?? []).map(_id => ({ _id, "system.quantity": 0 }))
  ].sort((a, b) => String(a._id).localeCompare(String(b._id)));
  return { updates, cleanup: [...(spend.deletes ?? [])].sort() };
}

/** The rows as they stand once a spend has landed: what the room judgement reads. */
export function rowsAfterSpend(rows = [], spend = null) {
  if (!spend) return [...(rows ?? [])];
  const gone = new Set(spend.deletes ?? []);
  const qty = new Map((spend.updates ?? []).map(u => [u._id, u["system.quantity"]]));
  return [...(rows ?? [])].filter(r => !gone.has(idOf(r))).map(r => (qty.has(idOf(r))
    ? { ...r, system: { ...(r.system ?? {}), quantity: qty.get(idOf(r)) } }
    : r));
}

/**
 * The materials map `recipes.mjs#deriveReagents` reads, off the gear pack's
 * index: identifier -> `{price, family, tier, name, uuid, img, weight}`. Every gear
 * document is in it, because a reagent may be another recipe's product
 * (08-FORMAT §3: the Minor healing draught, Solid Dynamite).
 *
 * @param {Iterable<{uuid?: string, name?: string, img?: string, system?: object}>} index
 */
export function materialsFrom(index = []) {
  const out = {};
  for (const e of index ?? []) {
    const id = e?.system?.identifier;
    if (!id || e.system?.source?.document === "Classic") continue;
    if (out[id]) continue;
    out[id] = {
      price: Number(e.system?.cost) || 0,
      family: e.system?.material?.family ?? null,
      tier: e.system?.material?.tier ?? null,
      name: e.name ?? id,
      uuid: e.uuid ?? null,
      img: e.img ?? null,
      // The bag law sizes a thing by its published weight (08 §11): a 10 lb ore takes a well
      // where a herb stacks twenty to one, so a room judgement needs it (the review's minor 2).
      weight: e.system?.weight ?? null
    };
  }
  return out;
}

/**
 * The parts of a Gathering Test (D-1915, D-1926): the gathering skill's
 * ability modifier, that skill's Rank and the tool, as `professions.mjs#bonusParts`
 * reads them. Never Proficiency.
 *
 * @param {{abilities?: object, ranks?: object}} sheet  the character's abilities and skill Ranks
 * @param {string} skill
 * @param {{rarity?: string}|null} tool
 */
export function gatherInputs({ abilities = {}, ranks = {} } = {}, skill, abilityKey, tool = null) {
  return {
    abilityMod: Math.trunc(Number(abilities?.[abilityKey]?.mod)) || 0,
    rank: Math.trunc(Number(ranks?.[skill])) || 0,
    toolRarity: tool?.rarity ?? null,
    toolCarried: Boolean(tool)
  };
}

/* -------------------------------------------- */
/*  The picks, the Rank, the choice (D-1905, D-1906; the review's M9) */
/* -------------------------------------------- */

/**
 * **A TIER'S PICKS, JUDGED WHOLE** (D-1906): each skill added in turn through
 * `professions.mjs#pickRefusal` against the stored picks plus the ones before it,
 * so a third pick, an unlisted skill or a tier not reached is refused in words
 * and nothing is written. Answers `{picks}` (the tier's whole new list) or
 * `{refusal}`.
 *
 * @param {{profession: object, tier: number, picks: object, pickTier: number, skills: string[]}} o
 */
export function pickPlan({ profession = null, tier = 1, picks = null, pickTier, skills = [] } = {}) {
  const t = Math.trunc(Number(pickTier));
  let held = { ...(picks ?? {}) };
  const list = Array.isArray(held[t]) ? [...held[t]] : [];
  const asked = [...new Set((skills ?? []).filter(s => typeof s === "string" && s))];
  if (!asked.length) return { refusal: { reason: "notListed" } };
  for (const skill of asked) {
    const refusal = pickRefusal({ profession, tier, picks: { ...held, [t]: list }, pickTier: t, skill });
    if (refusal) return { refusal };
    list.push(skill);
  }
  held = { ...held, [t]: list };
  return { picks: list };
}

/**
 * **THE NEXT RANK, JUDGED** (D-1905): always the cheap rate (`xp.mjs#professionRankCost`),
 * refused at the top (`top`) or where the unspent XP is short (`purse`). Answers
 * `{rank, cost}` or `{refusal: {reason, cost, purse}}`.
 */
export function rankRaisePlan({ rank = 0, xp = {} } = {}) {
  const r = Math.max(0, Math.trunc(Number(rank)) || 0);
  if (r >= RANK_MAX) return { refusal: { reason: "top", rank: r } };
  const cost = professionRankCost(r + 1);
  const purse = unspent(xp ?? {});
  if (purse < cost) return { refusal: { reason: "purse", cost, purse } };
  return { rank: r + 1, cost };
}
