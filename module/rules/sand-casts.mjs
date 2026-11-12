/**
 * **A SPELL CAST FOR SAND INSTEAD OF ITS MANA** (04's Stasis Lore: *you may cast it for 5
 * Sand instead of its Mana*; Halt the Sands: *You may cast it for 5 Sand instead of its
 * Mana, and when you do, its Casting Test succeeds*; the lead: *"allow casting for 5 sand
 * as an alternative to mana"*, *"you can cast Halt for 5 sand. if you do, the casting test
 * always succeeds"*; D-869). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * **The door is built here and the rows are stage 2b's**: a talent's `spell` row carries
 * `sandCast {cost, names, succeeds}` - `names` the spells it may buy, `succeeds` those
 * whose Casting Test then succeeds - and `sandCastLines` offers one line on the spell's
 * dialog, UNTICKED (a gate defaults closed), greyed with its reason in words where the
 * Sand will not cover it. `castSpell` judges the tick again: the Mana is waived, the Sand
 * paid with the cast, and a Halt bought so counts its Casting Test a success at SL 0 or
 * better (MY READING of *"always succeeds"*: the die is still rolled for its SL). 07 §4's
 * once per Short Rest and once per Long Rest still hold - the line changes the price,
 * never the gate - and a Sustain's upkeep is still Mana (the plan's reading).
 */

/**
 * The `sandCast` a row carries for a spell, or null.
 *
 * @param {object|null} row  a talent's `spell` row
 * @param {string} spell
 * @returns {{cost: number, succeeds: boolean}|null}
 */
export function sandCastOf(row, spell) {
  const s = row?.sandCast ?? null;
  if (!s || !Array.isArray(s.names) || !s.names.includes(spell)) return null;
  const cost = Math.max(1, Math.trunc(Number(s.cost)) || 5);
  return { cost, succeeds: Array.isArray(s.succeeds) && s.succeeds.includes(spell) };
}

/**
 * **THE SAND LINE A SPELL'S DIALOG OFFERS**: one, for the first taken talent (by
 * identifier) whose row buys this spell with Sand.
 *
 * @param {Array<{id?: string, identifier: string, className?: string, race?: string|null, name: string, taken: number}>} talents
 * @param {{spell?: string, sand?: number|null}} o  `sand` the caster's Sand now, null with no pool
 * @param {(className: string, identifier: string, race?: string|null) => object|null} rowOf
 * @returns {Array<object>}
 */
export function sandCastLines(talents = [], { spell = "", sand = null } = {}, rowOf = () => null) {
  if (!spell) return [];
  const taken = (talents ?? []).filter(t => (Math.trunc(Number(t?.taken) || 0) > 0))
    .sort((a, b) => String(a.identifier).localeCompare(String(b.identifier)));
  for (const t of taken) {
    const buy = sandCastOf(rowOf(t.className, t.identifier, t.race ?? null)?.spell ?? null, spell);
    if (!buy) continue;
    const held = sand === null || sand === undefined ? null : Math.max(0, Math.trunc(Number(sand)) || 0);
    const enough = held !== null && held >= buy.cost;
    return [{
      id: `talent-line-sand-${t.identifier}`, identifier: `sand-${t.identifier}`, talentId: t.id ?? null,
      talentIdentifier: t.identifier, name: t.name, kind: "sandCast", amount: buy.cost, spell, succeeds: buy.succeeds,
      // What the line does, in words (Stage 6's shot found the dialog printing the bare key).
      doesKey: buy.succeeds ? "AZEROTH.TalentLine.Does.sandCastSucceeds" : "AZEROTH.TalentLine.Does.sandCast",
      pool: "sand", left: held ?? 0, available: enough, checked: false,
      reason: enough ? null : (held === null ? "AZEROTH.SandCast.NoHourglass" : "AZEROTH.SandCast.NotEnough")
    }];
  }
  return [];
}

/**
 * **THE SAND A SAND-BOUGHT CAST PAYS** (04's Stasis Lore and Halt the Sands, D-869): the pool's
 * write - the line's Sand off what the pool holds now, never below nothing - or null where there
 * is no line or no pool.
 *
 * @param {{itemId?: string|null, value?: number}|null} pool  the Sand pool, read after the budget
 * @param {{amount?: number}|null} line
 * @returns {{itemId: string|null, kind: "momentum", value: number}|null}
 */
export function sandCastPayment(pool, line) {
  if (!line || !pool) return null;
  const cost = Math.max(0, Math.trunc(Number(line.amount ?? 5)) || 0);
  return { itemId: pool.itemId ?? null, kind: "momentum", value: Math.max(0, (Math.trunc(Number(pool.value)) || 0) - cost) };
}

/**
 * Halt bought with Sand (D-869): the outcome counted a success at SL 0 or better. Answers
 * the outcome to read, or the one handed in where nothing changes.
 *
 * @param {{success: boolean, sl: number}} outcome
 * @param {{succeeds?: boolean}|null} line
 */
export function sandCastOutcome(outcome, line) {
  if (!line?.succeeds || !outcome || outcome.success === true) return outcome;
  return { ...outcome, success: true, sl: Math.max(0, Math.trunc(Number(outcome.sl)) || 0), sandSucceeded: true };
}
