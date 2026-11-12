/**
 * **WHAT A SPELL'S FAILED RESIST LANDS, AND FOR HOW LONG** (the Chronomancer sweep's stage 3,
 * D-892). Pure: no Foundry imports (CLAUDE.md §3). `dice/chat.mjs#rollResists` asks both.
 *
 * - **A1's own end where the entry names none.** *Stunned ... Ends At the end of your next
 *   turn, unless the source says otherwise* (A1). 07's Epoch writes *If it fails a Spirit
 *   Resilience Test against your Spell DC, it is also **Stunned*** and names no span, and its
 *   Duration is *Instant*, so the Stun a failed Test laid carried no span at all and stood until
 *   a hand took it off. The area door already read A1's default (`CONDITION_DEFAULT_ENDS`); the
 *   spell's own Resist did not.
 * - **A Sustained spell's condition ends with the Sustain.** 07 §7: a Sustained spell *is one you
 *   are still holding* and ends when you stop paying, let go or take a Critical Injury. Sand
 *   Prison's *Entangled and Blinded* stood after the Sustain ended, because the conditions its
 *   failed Resist laid named no spell, no cast and no caster. The mark this answers is the one
 *   every sustained carrier already wears (`sustained`, `cast`, `origin` the caster), which the
 *   active GM's sweep (`effects/sustained-spells.mjs`) deletes once the caster's list no longer
 *   holds the cast. **Only a condition this Test laid** is marked: one the creature already
 *   carried is its own, and stays.
 */

import { CONDITION_DEFAULT_ENDS } from "./area-ticks.mjs";

/**
 * How long a condition a spell's failed Resist lays lasts: `"endOfNextTurn"` (the entry's own
 * *until the end of its next turn*, or A1's default for a spell that names no span and holds
 * nothing up), else `"spell"` (the spell's own span, which may be none).
 *
 * @param {{id: string, named?: string|null, timed?: boolean, sustained?: boolean}} o
 *   `named` - the entry's own failure span (`sand-spells.mjs#failSpan`); `timed` - whether the
 *   spell's own span is one the clock can hold; `sustained` - whether the cast is held
 * @returns {"endOfNextTurn"|"spell"}
 */
export function resistLandsUntil({ id = "", named = null, timed = false, sustained = false } = {}) {
  if (named === "endOfNextTurn") return "endOfNextTurn";
  if (timed || sustained) return "spell";
  return CONDITION_DEFAULT_ENDS[id] === "endOfNextTurn" ? "endOfNextTurn" : "spell";
}

/**
 * The mark a condition a held spell's failed Resist laid takes, so it ends with the Sustain:
 * `{origin, flags}` for `effect.update`, or null where there is nothing to mark - the cast is not
 * held, it names no cast or caster, or the creature carried the condition before this Test.
 *
 * **No `spell` key**: the card's Apply lays the spell's own effect keyed by the spell, and a
 * second Apply replaces what carries that key, which would take the condition with it.
 *
 * **AND WHETHER IT HOLDS THE CREATURE** (O-303; the lead: *"303 - end it however the creature is
 * freed of the effect"*): `holds` where the cast is aimed at creatures, never at an area - the
 * card's `area` is null - so the Sustain ends once the last creature carrying such a mark is
 * freed (`rules/held-sustains.mjs`). An area's Sustain stands with nobody in it.
 *
 * @param {{sustained?: boolean, cast?: string|null, casterUuid?: string|null, had?: boolean, area?: boolean}} o
 * @returns {{origin: string, flags: {sustained: true, cast: string, holds?: true}}|null}
 */
export function sustainedMark({ sustained = false, cast = null, casterUuid = null, had = false, area = false } = {}) {
  if (sustained !== true || had === true || !cast || !casterUuid) return null;
  return { origin: casterUuid, flags: { sustained: true, cast, ...(area === true ? {} : { holds: true }) } };
}
