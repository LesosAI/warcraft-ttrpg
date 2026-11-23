/**
 * **02's DRAIN** (the class talent audit, D-1894). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * *Once a turn, using no action, spend 4 Mana. Until the end of your turn, damage you deal
 * restores half as much Health to you, rounded down.* It was a Reaction with no trigger (which
 * 05 does not allow) and nothing it promised was built: it paid 4 Mana and posted a card. The Use
 * now lays a state on the warlock - an Active Effect flagged `drainState` and spanned to the end
 * of the warlock's turn (`effects/warlock-drain.mjs#layDrainState`) - and the ONE damage door
 * (`AzerothActor#applyDamage`) asks it of the creature that dealt the blow.
 *
 * - **Once a turn** is the state itself: it stands until the turn ends, and the Use is refused in
 *   words while one stands, so a second press in the same turn spends nothing.
 * - **Damage you deal** is what the blow took off the creature struck - its Health and temporary
 *   Health, after every mitigation - the figure 04's Life Drain heals off (D-1100's reading).
 */

/** The flag the state rides on, under the system's own namespace. */
export const DRAIN_STATE_FLAG = "drainState";

/**
 * The Health a blow gives back: *half as much ... rounded down*.
 *
 * @param {number} dealt  what the blow took off the creature struck
 * @param {number} [divisor]  02's 2
 * @returns {number}
 */
export function drainHealOf(dealt = 0, divisor = 2) {
  const d = Math.max(1, Math.trunc(Number(divisor)) || 2);
  return Math.floor(Math.max(0, Math.trunc(Number(dealt)) || 0) / d);
}

/**
 * The state a creature's effects carry, or null: the first active one flagged `drainState`.
 *
 * @param {Iterable<{active?: boolean, disabled?: boolean, flags?: object}>} effects
 * @returns {{divisor: number, name: string}|null}
 */
export function drainStateOf(effects = []) {
  for (const e of effects ?? []) {
    if (e?.active === false || e?.disabled === true) continue;
    const s = e?.flags?.["azeroth-rpg"]?.[DRAIN_STATE_FLAG];
    if (s && typeof s === "object") return { divisor: Math.max(1, Math.trunc(Number(s.divisor)) || 2), name: String(s.name ?? "") };
  }
  return null;
}

/**
 * **THE HEALTH THE GM GIVES BACK FOR A CLIENT THAT MAY NOT WRITE THE WARLOCK** (the wave-2 review):
 * the GM reads the Drain state off the warlock again and holds the blow's figure to the most the
 * creature struck could have lost - its maximum Health and temporary Health - so a request can
 * never heal more than a real blow would. Null where no state stands.
 *
 * @param {{took?: number, cap?: number, state?: {divisor: number}|null}} o
 * @returns {number|null}
 */
export function drainHealHeld({ took = 0, cap = 0, state = null } = {}) {
  if (!state) return null;
  const most = Math.max(0, Math.trunc(Number(cap)) || 0);
  const dealt = Math.min(most, Math.max(0, Math.trunc(Number(took)) || 0));
  return drainHealOf(dealt, state.divisor);
}
