/**
 * **WHAT THE HATRED BAR SAYS** (D11's *The Demon Hunter's Hatred bar carries its cap ladder and its rest cost*,
 * D-1438, D-1439; the Demon Hunter plan's Phase 6, D-1581). Pure, no Foundry imports: the sheet hands it the
 * numbers the one cap reader, the one rest reader and Fel Lash's own law answer, and draws what it returns.
 *
 * - **The segments are the cap**, so the bar grows from 5 to 13 as Fel rises. **Hatred held above the cap is
 *   drawn, never trimmed** (the lead left Q14 as written: a fall in the cap is not taken off what is held), as
 *   segments past the cap marked `over` and said in words beside them, so colour is never the only carrier.
 * - **The ladder in words**: the cap the Fel the features read gives now, and the next rung (*At Fel 10: cap
 *   9*), or none at the top of the track.
 * - **The rest cost in words**: what `hatredAtRest` says the next rest turns into Fel, Warding Tattoos and the
 *   Sufferer's talents in it; nothing at 0 Hatred.
 * - **Fel Lash's net movement**: the Fel a hit sheds now (`felLashShed`), and why it sheds none.
 */

import { FEL_STEP, FEL_TRACK_TOP, hatredAtRest, hatredCap } from "./hatred.mjs";

const whole = value => Math.max(0, Math.trunc(Number(value)) || 0);

/**
 * The next rung of the cap ladder above a Fel value, or null at the top of the track.
 *
 * @param {number} fel  the Fel the features read
 * @returns {{fel: number, cap: number}|null}
 */
export function nextRung(fel = 0) {
  const f = Math.min(FEL_TRACK_TOP, whole(fel));
  const at = (Math.floor(f / FEL_STEP) + 1) * FEL_STEP;
  return at > FEL_TRACK_TOP ? null : { fel: at, cap: hatredCap(at) };
}

/**
 * **THE BAR'S MODEL**.
 *
 * @param {{held?: number, fel?: number, modifiers?: object, shed?: {points: number, reason: string|null}|null}} o
 *   `fel` the Fel the features read (`hatred.mjs#felFor`); `modifiers` the rest's (`restModifiersOf`); `shed`
 *   Fel Lash's own answer at this moment (`demon-hunter-features.mjs#felLashShed`), or null where the hunter
 *   holds no Fel Lash
 * @returns {{held: number, cap: number, above: number, segments: Array<{filled: boolean, over: boolean}>,
 *   fel: number, next: {fel: number, cap: number}|null, restFel: number|null, shed: {points: number, reason: string|null}|null}}
 */
export function hatredView({ held = 0, fel = 0, modifiers = {}, shed = null } = {}) {
  const h = whole(held);
  const f = Math.min(FEL_TRACK_TOP, whole(fel));
  const cap = hatredCap(f);
  const segments = Array.from({ length: Math.max(cap, h) }, (_, i) => ({ filled: i < h, over: i >= cap }));
  const rest = hatredAtRest({ held: h, cap, modifiers });
  return {
    held: h, cap, above: Math.max(0, h - cap), segments, fel: f, next: nextRung(f),
    restFel: rest ? rest.fel : null,
    shed: shed ? { points: whole(shed.points), reason: shed.reason ?? null } : null
  };
}
