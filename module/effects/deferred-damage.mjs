/**
 * **THE HALF PUT OFF, LANDED** (07 §12's Dilation, D-866). `rules/deferred-damage.mjs` is
 * the law; this lands a creature's pending rows at the start of its turn, each through
 * `AzerothActor#_landPutOff` - not reduced again, never put off a second time -
 * and clears them in the same pass. Runs where `AzerothCombat#_effectTicks` runs, on the
 * active GM's client.
 *
 * **At the turn's start, Unmade Wound is asked first** (O-274, closed by D-880): 04's Borrowed
 * Time lands its other half *at the start of your next turn*, before the Guardian could spend
 * a Half-Action, so the Guardian holding 04's Unmade Wound, the Sand and a fresh Half-Action
 * is asked once whether to erase what Borrowed Time put off (`effects/guardian.mjs
 * #unmadeAtTurnStart`); a yes pays the Sand and the Half-Action on the Guardian's client and
 * writes the list down before the rest lands. The fight's-end landing (`_leaveFight`) asks
 * nothing: there is no turn left to spend.
 *
 * **A landing that throws loses nothing** (the stage 3 fix): the row that threw and every row
 * after it go back on the list (`rules/deferred-damage.mjs#unlandedTail`), said as a warning.
 */

import { DEFERRED_FLAG, pendingRows, unlandedTail } from "../rules/deferred-damage.mjs";

/**
 * @param {Actor} actor
 * @param {{turnStart?: boolean}} [o]  `turnStart` from `AzerothCombat#_onStartTurn` alone
 * @returns {Promise<string[]>}  the lines for the turn's card
 */
export async function landDeferred(actor, { turnStart = false } = {}) {
  const read = () => pendingRows(actor?.getFlag?.("azeroth-rpg", DEFERRED_FLAG) ?? []);
  if (!read().length) return [];
  const lines = [];
  if (turnStart) {
    try {
      const { unmadeAtTurnStart } = await import("./guardian.mjs");
      lines.push(...(await unmadeAtTurnStart(actor)));
    } catch (err) {
      console.warn("azeroth-rpg | Unmade Wound at the turn's start", err);
    }
  }
  // Read again: a yes above wrote the list down.
  const rows = read();
  if (actor.getFlag("azeroth-rpg", DEFERRED_FLAG) !== undefined) await actor.unsetFlag("azeroth-rpg", DEFERRED_FLAG);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    try {
      // Past the damage door's chain: temporary Health first, then the Health.
      await actor._landPutOff(row.amount);
    } catch (err) {
      console.warn("azeroth-rpg | damage put off", err);
      await actor.setFlag("azeroth-rpg", DEFERRED_FLAG, unlandedTail(rows, i, actor.getFlag("azeroth-rpg", DEFERRED_FLAG) ?? []));
      ui.notifications?.warn(game.i18n.format("AZEROTH.Deferred.Kept", { name: actor.name, n: rows.length - i }));
      return lines;
    }
    lines.push(game.i18n.format("AZEROTH.Deferred.Landed", { name: actor.name, n: row.amount, source: row.source ?? "" }));
  }
  return lines;
}
