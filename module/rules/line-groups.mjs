/**
 * **WHAT A ROLL DIALOG'S SPEND LINES ARE CALLED** (the lead, 2026-11-23: *"Just label it what it is, for
 * example Necromancer is Empowerments"*). The dialog drew every talent, feature and class line under one
 * legend, *What a talent spends*, which named none of them. Each line carries a `kind`, and this is the one
 * table that says which group of the dialog a kind belongs to; the dialog draws a fieldset a group and the
 * legend is the group's own name (`AZEROTH.TalentLine.Group.<key>`). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * A kind this table does not know falls into `talents` - the counters and charges 04's talents carry (Inner
 * Focus, Lava Burst, Static Charge, Iron Will) - so a new line is drawn, under the plain word, until it is given
 * a group of its own.
 */

/** The group a line kind is drawn under. */
export const LINE_GROUP_OF_KIND = Object.freeze({
  // 02 §7's four empower lines and 04's Skeletal Mastery on Raise Dead: Essence spent to empower a spell.
  empower: "empowerments",
  masteryEmpower: "empowerments",
  // 04's Flesh Offering: a corpse or Mana off the cast.
  fleshOffering: "fleshOffering",
  // 02 §7's new lead of the horde, named at a cast.
  hordeLead: "horde",
  // 02 §7's Fel Surge: a point of Hatred a line.
  felSurge: "felSurge",
  // 04's Chronomancer lines, priced in Sand.
  grit: "sand",
  echoing: "sand",
  storm: "sand",
  sandCast: "sand",
  // A free cast, once a rest.
  freeCast: "freeCasts",
  // 04's Chromatic Champion branch spell lines.
  lifebinder: "championSpells",
  voidSurge: "championSpells"
});

/** The group a kind is drawn under, `talents` where none is named. */
export function lineGroupOf(kind) {
  return LINE_GROUP_OF_KIND[kind] ?? "talents";
}

/** Every group key, for the lang census. */
export const LINE_GROUPS = Object.freeze([...new Set(["talents", ...Object.values(LINE_GROUP_OF_KIND)])]);

/**
 * The lines split into their groups, in the order each group first appears, each group's lines in the order
 * they came. The order of the lines is never changed: a group is a heading over a run of them.
 *
 * @param {Array<{kind?: string|null}>} lines
 * @returns {Array<{group: string, lines: Array<object>}>}
 */
export function groupLines(lines = []) {
  const groups = [];
  for (const line of lines ?? []) {
    const key = lineGroupOf(line?.kind);
    let entry = groups.find(g => g.group === key);
    if (!entry) { entry = { group: key, lines: [] }; groups.push(entry); }
    entry.lines.push(line);
  }
  return groups;
}
