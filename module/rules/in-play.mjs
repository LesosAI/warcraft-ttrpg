/**
 * WHAT IS ACTING ON A CHARACTER RIGHT NOW, and which of it the reader may
 * clear from where they are standing.
 *
 * The lead, 2026-09-20: *"Could use the open space in overview to show
 * currently active effects or conditions."* With one qualification: the strip
 * shows only what **is** on. Core's tab keeps the fifteen-chip grid, which is
 * where a condition is switched ON; the Overview strip names what is standing
 * and lets it be taken off, which is how a buff bar behaves - it shows and it
 * cancels, it does not apply.
 *
 * **THIS IS A READING OF STATE HELD ELSEWHERE.** Nothing here decides what a
 * condition or an effect IS: the rows are handed in from
 * `applications/actions.mjs#effectsContext`, the one reader both sheets
 * already draw their conditions and their effect list from, so the Overview
 * strip and the Core tab cannot disagree about what is in force. What this
 * module owns is one judgement the surfaces could otherwise each invent:
 * **may this be cleared, and if not, what does the reader get told instead.**
 *
 * **ONE RULE, TWO DOORS** (D-686's lesson: a rule enforced at one door is
 * enforced nowhere). `clearRefusal` is consulted by the door that does the
 * work - `effectAction`, which both sheets call - and by the strip that draws
 * the control, so a refused clear is never a dead button and a live button is
 * never a refused clear. Four refusals, none of them invented here:
 *
 *  + **Fatigued** is the Long Rest's to do, one point a night (A1's *Ends*
 *    line, D-624). `effectAction` has refused it in these exact words since
 *    the chip was built; the sentence moved here so the strip can print it.
 *  + **A talent's own passive** is written by `AzerothActor#syncTalentEffects`
 *    and diffed by its identifier (D-648): deleting it removes it until the
 *    next sync and it then returns. The way off it is to untake the talent.
 *  + **A bond's effect** is the owner's talent laid on a creature the same way
 *    (D-643), flagged `bond` and diffed by `syncBound`.
 *  + **An aura's effect** is laid on an ally by `effects/auras.mjs` and diffed
 *    by where everybody stands (D-696, D-755), flagged `aura`: deleting it
 *    removes it until the next token moves and it then returns. It goes when
 *    the ally leaves the reach or the aura stops; a GM who wants it off
 *    switches it off on Core, and the diff leaves a switched-off one alone.
 *
 * A DISABLED EFFECT IS NOT IN FORCE and is not on the strip. It is still on
 * Core's list, with the On/Off toggle that is the only place it can be turned
 * back on - a strip that showed it would have to carry that control too, and
 * then it would be the condition grid again.
 *
 * No Foundry imports: `in-play.test.mjs` is the whole of this rule's proof.
 */

/**
 * The flag an effect wears when the system itself writes it, and the sentence
 * that says so. `synced` is read off the document by `effectsContext`; the key
 * is what the strip prints and what `effectAction` warns with.
 */
export const SYNCED_REASONS = Object.freeze({
  talentEffect: "AZEROTH.InPlay.FromTalent",
  bond: "AZEROTH.InPlay.FromBond",
  // `rules/auras.mjs#AURA_FLAG` (D-755).
  aura: "AZEROTH.InPlay.FromAura"
});

/** A condition that cannot be cleared by hand, and why. Keyed by actor type. */
export const CONDITION_REFUSALS = Object.freeze({
  // A1: *Ends - with the Fatigue. A Long Rest removes 1.* The chip on Core
  // has refused in these words since D-624; a CREATURE carries no Fatigue
  // track, so the refusal is the character's alone.
  character: Object.freeze({ fatigued: "AZEROTH.Sheet.FatiguedByRest" })
});

/**
 * Why this row may not be cleared from a sheet, as a localization key, or
 * null where it may.
 *
 * ONE function for both kinds, because both doors take both: `effectAction`
 * dispatches `toggleCondition` and `deleteEffect` from the same switch, and
 * the strip draws one list.
 *
 * @param {{kind: string, id?: string, synced?: string|null}} row
 * @param {object} [options]
 * @param {string} [options.actorType="character"]
 * @returns {string|null}
 */
export function clearRefusal(row, { actorType = "character" } = {}) {
  if (!row) return null;
  if (row.kind === "condition") return CONDITION_REFUSALS[actorType]?.[row.id] ?? null;
  return SYNCED_REASONS[row.synced] ?? null;
}

/**
 * The strip: every condition that is on and every Active Effect that is in
 * force, in one list, each saying whether it can be cleared here.
 *
 * **The order is the caller's for conditions and the NAME for effects.** An
 * embedded collection's order is not stable across a re-sync (CLAUDE.md §15),
 * so a list a person reads is sorted; `effectsContext` builds its conditions
 * by walking `AZEROTH.conditions`, which is the book's order, and that is the
 * order the Core grid draws them in two tabs away.
 *
 * @param {object} state
 * @param {Array} [state.conditions]  `effectsContext().conditions`
 * @param {Array} [state.effects]     `effectsContext().rows`
 * @param {string} [state.actorType]
 * @returns {{rows: Array, empty: boolean, count: number}}
 */
export function inPlay({ conditions = [], effects = [], actorType = "character" } = {}) {
  const rows = [];

  for (const c of conditions) {
    if (!c?.active) continue;
    const row = {
      kind: "condition",
      key: `condition:${c.id}`,
      id: c.id,
      label: c.label ?? null,
      name: null,
      img: c.img ?? null,
      // A1's three valued conditions print their X beside the name; every
      // other one prints the name alone, and `0` is never drawn.
      value: c.valued && Number(c.value) > 0 ? Number(c.value) : null,
      duration: c.duration ?? null,
      permanent: false,
      synced: null
    };
    rows.push(row);
  }

  const byName = (a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")) || String(a.id).localeCompare(String(b.id));
  for (const e of [...effects].sort(byName)) {
    // IN FORCE, not merely held. `active` is core's own reading - neither
    // disabled nor suppressed - and a disabled effect stays on Core's list
    // where its toggle is.
    if (e?.active === false) continue;
    rows.push({
      kind: "effect",
      key: `effect:${e.id}`,
      id: e.id,
      label: null,
      name: e.name ?? "",
      img: e.img ?? null,
      value: null,
      duration: e.duration ?? null,
      permanent: e.permanent === true,
      synced: e.synced ?? null
    });
  }

  for (const row of rows) {
    const reason = clearRefusal(row, { actorType });
    row.reason = reason;
    row.clearable = reason === null;
  }

  return { rows, empty: rows.length === 0, count: rows.length };
}
