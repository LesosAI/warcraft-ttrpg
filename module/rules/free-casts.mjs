/**
 * **A SPELL A TALENT LETS YOU CAST FREE, ONCE PER REST** (the Chromatic Champion plan:
 * *"the utility spells can be cast without rage once per short rest. mention this in
 * their talents that grant them."*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * A talent's `spell` row may carry `free: {names, per}`: each spell it names, once per
 * `per` (`"shortRest"`, read as `uses.mjs`'s `"short"`), costs nothing to cast. **A free
 * name counts only while the row KNOWS that spell at its rank** - Kindled Blood frees
 * Fire Ward, which it teaches at rank 2 - so `atRankOf` decides before the offer.
 *
 * **The use is counted PER SPELL on the TALENT ITEM**, as the flag `FREE_CAST_FLAG`: the
 * names whose free cast is spent since the rest. The rest door empties it
 * (`AzerothActor#resetUses` through `freeCastRefills`), and the cast offers the free
 * cast as a TICKED line on its dialog (*"Cast without Rage, once per Short Rest"*), so
 * the player chooses when to spend it; `casting.mjs#manaPrice` takes `free` and prices
 * the cast at nothing.
 *
 * And `void: N` on the same row (the plan's Black branch: *"have the black spells at
 * tier 2 and tier 3 give void corruption"*): every cast of a spell the row names adds
 * N Void Corruption to the caster after the payment, through the one Corruption write.
 * `castVoidFor` is that reading.
 */

import { atRankOf } from "./class-talents.mjs";
import { talentEffect } from "./talent-effects.mjs";

/** A taken talent's rank, 1 at the least (`class-talents.mjs`'s own reading). */
const rankOf = talent => Math.max(1, Math.trunc(Number(talent?.taken) || 0));

/** The talent item's flag: the spell names whose free cast is spent. */
export const FREE_CAST_FLAG = "freeCasts";

/** A row's `per`, in `rules/uses.mjs#refreshes`'s vocabulary. */
const PER = Object.freeze({ shortRest: "short", short: "short", longRest: "long", long: "long", encounter: "encounter" });

/** A row's `per` read, or null for a word that is no rest. */
export function freePer(per) {
  return PER[per] ?? null;
}

/**
 * The spells a `spell` row casts free at a rank: the row's `free.names` the row KNOWS
 * at that rank (`atRankOf`'s `names`), and the rest that refills them.
 *
 * @param {object|null} row  a talent's `spell` row
 * @param {number} [rank]
 * @returns {{names: string[], per: string}|null}
 */
export function freeCastRow(row, rank = 1) {
  if (!row?.free) return null;
  const at = atRankOf(row, rank);
  const per = freePer(at.free?.per ?? row.free.per);
  if (!per) return null;
  const known = new Set(Array.isArray(at.names) ? at.names : []);
  const names = (Array.isArray(at.free?.names) ? at.free.names : []).filter(n => typeof n === "string" && known.has(n));
  return names.length ? { names: [...names].sort(), per } : null;
}

/**
 * **THE FREE CAST A SPELL'S DIALOG OFFERS**: one line for the first taken talent (by
 * identifier) whose row frees this spell, ticked while its use stands, greyed with its
 * reason once spent. The line rides `AzerothActor#talentLineOffer` beside 04's own
 * talent lines, and `castSpell` judges the tick again.
 *
 * @param {Array<{id?: string, identifier: string, className?: string, race?: string|null, name: string, taken: number}>} talents
 * @param {{spell?: string, spent?: Record<string, string[]>, pool?: string|null}} o
 *   `spent` the flag off each talent item, by item id; `pool` the pool the spell is paid in
 * @returns {Array<object>}
 */
export function freeCastLines(talents = [], { spell = "", spent = {}, pool = null } = {}, rowOf = talentEffect) {
  if (!spell) return [];
  const taken = (talents ?? []).filter(t => (Math.trunc(Number(t?.taken) || 0) > 0))
    .sort((a, b) => String(a.identifier).localeCompare(String(b.identifier)));
  for (const t of taken) {
    const row = rowOf(t.className, t.identifier, t.race ?? null)?.spell ?? null;
    const free = freeCastRow(row, rankOf(t));
    if (!free?.names.includes(spell)) continue;
    const used = (spent?.[t.id] ?? []).includes(spell);
    return [{
      id: `talent-line-free-${t.identifier}`, identifier: `free-${t.identifier}`, talentId: t.id ?? null,
      talentIdentifier: t.identifier, name: t.name, kind: "freeCast", amount: 0, spell, per: free.per,
      pool: typeof pool === "string" && pool ? pool : null,
      // TICKED BY DEFAULT, and so spent by the first eligible cast where the dialog is
      // skipped (the lead's ruling of 2026-11-08, *"I approve those 4"*).
      left: used ? 0 : 1, available: !used, checked: !used,
      reason: used ? "AZEROTH.FreeCast.Spent" : null
    }];
  }
  return [];
}

/** A talent's spent list once `spell`'s free cast is taken: sorted, each once. */
export function spentAfter(list = [], spell = "") {
  return [...new Set([...(Array.isArray(list) ? list : []), spell].filter(n => typeof n === "string" && n))].sort();
}

/**
 * Which talent items a rest refills: those whose flag holds a spent name and whose row's
 * `per` the rest refreshes. `refreshes` is `uses.mjs`'s, handed in so this stays pure of
 * the uses module's own imports.
 *
 * @param {Array<{id: string, identifier: string, className?: string, race?: string|null, taken: number, spent: string[]}>} talents
 * @param {string} event  `"short"` or `"long"`
 * @param {(per: string, event: string) => boolean} refreshes
 * @returns {string[]}  the talent item ids to empty
 */
export function freeCastRefills(talents = [], event = "short", refreshes = () => false, rowOf = talentEffect) {
  const out = [];
  for (const t of talents ?? []) {
    if (!(Array.isArray(t?.spent) && t.spent.length)) continue;
    const row = rowOf(t.className, t.identifier, t.race ?? null)?.spell ?? null;
    // The row read AT THE TALENT'S RANK, as `freeCastRow` reads it (the 1B review, item
    // 4): a rank clause that names its own `per` refills on that rest, not the base's.
    const at = row ? atRankOf(row, rankOf(t)) : null;
    const per = freePer(at?.free?.per ?? row?.free?.per) ?? "short";
    if (refreshes(per, event)) out.push(t.id);
  }
  return out.sort();
}

/**
 * **THE VOID A CAST BUILDS** (the plan's Black branch): the `void` of the first taken
 * talent (by identifier) whose `spell` row names this spell and carries one, at the
 * talent's rank. 0 where none does.
 *
 * @param {Array} talents  the CASTER's taken talents
 * @param {{spell?: string}} o
 * @returns {{amount: number, talent: string|null}}
 */
export function castVoidFor(talents = [], { spell = "" } = {}, rowOf = talentEffect) {
  const taken = (talents ?? []).filter(t => (Math.trunc(Number(t?.taken) || 0) > 0))
    .sort((a, b) => String(a.identifier).localeCompare(String(b.identifier)));
  for (const t of taken) {
    const row = rowOf(t.className, t.identifier, t.race ?? null)?.spell ?? null;
    if (!row) continue;
    const at = atRankOf(row, rankOf(t));
    if (!(Array.isArray(at.names) && at.names.includes(spell))) continue;
    const n = Math.max(0, Math.trunc(Number(at.void)) || 0);
    if (n > 0) return { amount: n, talent: t.name };
  }
  return { amount: 0, talent: null };
}
