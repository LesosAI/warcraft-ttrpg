/**
 * **THE RUNE PANEL, AS A READER SEES IT** (D-919; D11 §4's *The Death Knight's runes are
 * drawn as sockets, slot by slot*; the plan's door 1). Pure: no Foundry imports
 * (CLAUDE.md §3). The sheet hands in the derived pool (`system.runes`, `CharacterData`) and
 * the words; this returns everything the partial draws, so the template holds no rule.
 *
 * - **One group for each wielded weapon** (`rules/runes.mjs#wieldedRunes`, sorted by id),
 *   its rarity, its grip and its slot count in words;
 * - **one socket for each rune slot**, in four states - `blood`, `frost`, `spent` (with the
 *   kind it was) and `empty` - each with its state in words for core's tooltip and an
 *   `aria-label`, so colour is never the only carrier (D-622);
 * - **the Runic Power bar** reading *n / cap* (`runes.mjs#runicPowerCap`);
 * - **the controls**: Inscribe (open or refused in words) and *Spend a rune · Half-Action*
 *   (open where an unspent rune stands), each refusal said beside the greyed control.
 */

/**
 * The sockets of one weapon row: its runes in order, then an empty socket for every slot
 * the inscription leaves bare.
 *
 * @param {{slots: number, runes: Array<{kind: string, spent: boolean}>}} row
 * @param {Record<string, string>} words  `blood`, `frost`, `spentBlood`, `spentFrost`, `empty`
 * @returns {Array<{state: "blood"|"frost"|"spent"|"empty", kind: string|null, label: string}>}
 */
export function socketsOf(row, words = {}) {
  const out = [];
  for (const r of row?.runes ?? []) {
    if (r.spent) out.push({ state: "spent", kind: r.kind, label: words[r.kind === "blood" ? "spentBlood" : "spentFrost"] ?? "" });
    else out.push({ state: r.kind, kind: r.kind, label: words[r.kind] ?? "" });
  }
  for (let i = out.length; i < Math.max(0, Math.trunc(Number(row?.slots)) || 0); i++) {
    out.push({ state: "empty", kind: null, label: words.empty ?? "" });
  }
  return out;
}

/**
 * **THE PANEL'S WHOLE CONTEXT** for `templates/actor/partials/rune-panel.hbs` and its compact
 * row on the paper doll (`rune-row.hbs`).
 *
 * @param {{
 *   rows: ReturnType<import("./runes.mjs").wieldedRunes>,
 *   weapons?: Record<string, {img?: string, rarity?: string, hand?: "main"|"off"|null}>,
 *   runicPower?: {value: number, max: number}|null,
 *   inscribeRefusal?: string|null, spendRefusal?: string|null, editable?: boolean,
 *   words: {blood: string, frost: string, spentBlood: string, spentFrost: string, empty: string,
 *     meta: (o: {rarity: string, grip: string, slots: number}) => string,
 *     refusals?: Record<string, string>}
 * }} o
 */
export function runePanelContext({ rows = [], weapons = {}, runicPower = null, inscribeRefusal = null, spendRefusal = null, editable = true, words } = {}) {
  const groups = (rows ?? []).map(row => {
    const w = weapons[row.itemId] ?? {};
    return {
      itemId: row.itemId,
      name: row.name,
      img: w.img ?? null,
      rarity: w.rarity ?? "common",
      rarityClass: w.rarityClass ?? null,
      hand: w.hand ?? null,
      meta: words.meta({ rarity: w.rarity ?? "common", grip: row.grip ?? "one", slots: row.slots }),
      sockets: socketsOf(row, words)
    };
  });
  const value = Math.max(0, Math.trunc(Number(runicPower?.value)) || 0);
  const max = Math.max(0, Math.trunc(Number(runicPower?.max)) || 0);
  const refusal = key => (key ? (words.refusals?.[key] ?? key) : null);
  return {
    groups,
    held: groups.length > 0,
    runicPower: runicPower ? { value, max, percent: max > 0 ? Math.round((100 * Math.min(value, max)) / max) : 0 } : null,
    inscribe: { available: editable && !inscribeRefusal, refusal: refusal(inscribeRefusal) },
    spend: { available: editable && !spendRefusal, refusal: refusal(spendRefusal) }
  };
}

/** The sockets the paper doll draws under one hand's tile, or null where that hand holds no runes. */
export function handSockets(context, hand) {
  return (context?.groups ?? []).find(g => g.hand === hand)?.sockets ?? null;
}
