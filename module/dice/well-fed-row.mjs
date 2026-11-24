/**
 * **THE WELL FED LINE, AS A ROLL READS IT** (D-1922): the one reading `rollTest`
 * and the profession doors share. `{sl, row}` where the roller holds the
 * carrier and left the dialog's automatic line ticked (a skipped dialog takes
 * every automatic line), else null. The roll then carries `options.wellFed`
 * and adds it to the SL after the die (`AzerothRoll#outcome`), never to the
 * margin.
 */

import { WELL_FED_SL, isWellFed, wellFedLine } from "../rules/well-fed.mjs";

/**
 * @param {Actor} actor
 * @param {string[]|null} chosen  the dialog's ticked line ids; null or undefined where no dialog
 *   opened, which takes every automatic line, Well Fed's among them
 * @returns {{sl: number, row: {label: string, value: null, formula: string}}|null}
 */
export function wellFedRow(actor, chosen = null) {
  if (!isWellFed(actor?.effects ?? [])) return null;
  if (Array.isArray(chosen) && !chosen.includes(wellFedLine(true).key)) return null;
  return { sl: WELL_FED_SL, row: { label: "AZEROTH.WellFed.Line", value: null, formula: game.i18n.format("AZEROTH.WellFed.Row", { n: WELL_FED_SL }) } };
}
