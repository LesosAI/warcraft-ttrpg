/**
 * Downtime, as far as crafting cares (D-1914, D-1924). Pure, no Foundry
 * imports (CLAUDE.md §3).
 *
 * Crafting may be done at any time. A GM may turn on the world setting
 * *Crafting only in downtime*, and then opens and closes downtime from the
 * Actor directory; a craft or a project's test outside it is refused in words.
 * **Closed only while enforced**: with the setting off nothing here ever
 * refuses. Gathering is never gated by downtime (the plan's M8).
 */

/**
 * @param {{enforced?: boolean, open?: boolean}} o
 * @returns {{reason: "downtime"}|null}
 */
export function downtimeRefusal({ enforced = false, open = false } = {}) {
  return enforced === true && open !== true ? { reason: "downtime" } : null;
}
